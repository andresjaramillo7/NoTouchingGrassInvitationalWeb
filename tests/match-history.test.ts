import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENT_START_AT } from "@/lib/event";
import { toStoredMatch, type MatchDetail } from "@/lib/riot/matches";

/**
 * The two invariants every stored row must satisfy — queue 420, and the game
 * ended at or after EVENT_START_AT — plus the roster reduction that lets one
 * fetched match serve every NTGI player in it.
 */

const ROSTER = new Map([
  ["puuid-shiro", "shiro"],
  ["puuid-maomao", "maomao"],
]);

const AFTER_START = EVENT_START_AT.getTime() + 60 * 60 * 1000;
const BEFORE_START = EVENT_START_AT.getTime() - 1;

function detail(
  overrides: Partial<MatchDetail["info"]> & {
    participants?: MatchDetail["info"]["participants"];
  } = {},
): MatchDetail {
  return {
    info: {
      queueId: 420,
      gameEndTimestamp: AFTER_START,
      participants: [
        { puuid: "puuid-shiro", championId: 64, championName: "LeeSin", win: true },
        { puuid: "stranger", championId: 1, championName: "Annie", win: false },
      ],
      ...overrides,
    },
  };
}

describe("toStoredMatch", () => {
  it("ignores anything that is not Ranked Solo/Duo", () => {
    for (const queueId of [440, 400, 450, 490, 700]) {
      assert.equal(toStoredMatch("NA1_1", detail({ queueId }), ROSTER), null);
    }
  });

  it("ignores a match that ended before EVENT_START_AT", () => {
    const before = detail({ gameEndTimestamp: BEFORE_START });
    assert.equal(toStoredMatch("NA1_1", before, ROSTER), null);

    // The boundary itself counts.
    const exactly = detail({ gameEndTimestamp: EVENT_START_AT.getTime() });
    assert.ok(toStoredMatch("NA1_1", exactly, ROSTER));
  });

  it("stores a row for every NTGI player in the game, and nobody else", () => {
    const shared = detail({
      participants: [
        { puuid: "puuid-shiro", championId: 64, championName: "LeeSin", win: true },
        { puuid: "puuid-maomao", championId: 22, championName: "Ashe", win: true },
        { puuid: "stranger-1", championId: 1, championName: "Annie", win: false },
        { puuid: "stranger-2", championId: 2, championName: "Olaf", win: false },
      ],
    });

    const stored = toStoredMatch("NA1_shared", shared, ROSTER);
    assert.ok(stored);
    assert.equal(stored.matchId, "NA1_shared");
    assert.equal(stored.gameEndAt, AFTER_START);

    assert.deepEqual(
      stored.participants.map((row) => row.participantId).sort(),
      ["maomao", "shiro"],
    );
    assert.deepEqual(
      stored.participants.map((row) => row.championName).sort(),
      ["Ashe", "LeeSin"],
    );
  });

  it("records a remake as seen but tallies it for nobody", () => {
    const remake = detail({
      participants: [
        {
          puuid: "puuid-shiro",
          championId: 64,
          championName: "LeeSin",
          win: false,
          gameEndedInEarlySurrender: true,
        },
      ],
    });

    const stored = toStoredMatch("NA1_remake", remake, ROSTER);

    // Still a row in `matches`, so it is never fetched twice...
    assert.ok(stored);
    // ...but it counts for neither a win nor a loss.
    assert.deepEqual(stored.participants, []);
  });

  it("falls back to start + duration when Riot omits the end timestamp", () => {
    const missing = detail({
      gameEndTimestamp: undefined,
      gameStartTimestamp: AFTER_START,
      gameDuration: 1800,
    });

    const stored = toStoredMatch("NA1_1", missing, ROSTER);
    assert.ok(stored);
    assert.equal(stored.gameEndAt, AFTER_START + 1_800_000);
  });
});
