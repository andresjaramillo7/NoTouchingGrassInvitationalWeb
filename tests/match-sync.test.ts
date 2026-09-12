import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  MATCH_SYNC_KEY,
  SYNC_COOLDOWN_SECONDS,
  SYNC_LEASE_SECONDS,
} from "@/lib/db/lease";
import { outcomeKey, storeMatches } from "@/lib/db/matches";
import { resetSqlForTests } from "@/lib/db/sql";
import { EVENT_START_AT } from "@/lib/event";
import { MATCH_DETAIL_BATCH, syncMatchHistory, type RosterMatchIds } from "@/lib/match-sync";
import { resetRiotErrorCountsForTests } from "@/lib/riot/client";
import { resetGateForTests } from "@/lib/riot/gate";
import { FakeDb, installFakeSql, uninstallFakeSql } from "@/tests/fake-sql";

/**
 * The request-saving rules, and the coordination that stops two instances
 * syncing at once. Everything here asserts on how many times Riot was called.
 */

const ROSTER_PUUIDS = new Map([
  ["puuid-a", "player-a"],
  ["puuid-b", "player-b"],
]);

const ENDED_AT = EVENT_START_AT.getTime() + 3_600_000;

let realFetch: typeof globalThis.fetch;
let db: FakeDb;
let detailCalls: string[];

/** Serves any Match-V5 detail request, recording which ids were asked for. */
function serveMatches(
  byId: Record<string, { puuid: string; championId: number; championName: string; win: boolean }[]>,
): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const matchId = url.split("/matches/")[1]?.split("?")[0] ?? "";
    detailCalls.push(matchId);

    const participants = byId[matchId];
    if (!participants) return new Response("not found", { status: 404 });

    return new Response(
      JSON.stringify({
        info: { queueId: 420, gameEndTimestamp: ENDED_AT, participants },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;
}

function solo(matchIds: string[], participantId: string): RosterMatchIds {
  return { participantId, eventMatchIds: matchIds, streakMatchIds: matchIds.slice(0, 5) };
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  process.env.RIOT_API_KEY = "test-key";
  process.env.DATABASE_URL = "postgres://fake/ntgi";
  resetGateForTests();
  resetRiotErrorCountsForTests();
  db = installFakeSql(new FakeDb());
  detailCalls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  uninstallFakeSql();
  resetSqlForTests();
  delete process.env.DATABASE_URL;
});

describe("match-history sync", () => {
  it("never refetches a match it already has", async () => {
    db.seedMatch({
      matchId: "NA1_known",
      gameEndAt: ENDED_AT,
      participantId: "player-a",
      championId: 64,
      championName: "LeeSin",
      won: true,
    });

    serveMatches({
      NA1_new: [{ puuid: "puuid-a", championId: 22, championName: "Ashe", win: false }],
    });

    const result = await syncMatchHistory(
      [solo(["NA1_known", "NA1_new"], "player-a")],
      ROSTER_PUUIDS,
    );

    assert.deepEqual(detailCalls, ["NA1_new"]);
    assert.equal(result.diagnostics.alreadyKnown, 1);
    assert.equal(result.diagnostics.detailsFetched, 1);

    // The stored match still backs STREAK without costing a request.
    assert.equal(result.outcomes.get(outcomeKey("player-a", "NA1_known")), true);
    assert.equal(result.outcomes.get(outcomeKey("player-a", "NA1_new")), false);
  });

  it("fetches a shared match once and stores a row for both players", async () => {
    serveMatches({
      NA1_shared: [
        { puuid: "puuid-a", championId: 64, championName: "LeeSin", win: true },
        { puuid: "puuid-b", championId: 22, championName: "Ashe", win: true },
      ],
    });

    const result = await syncMatchHistory(
      [solo(["NA1_shared"], "player-a"), solo(["NA1_shared"], "player-b")],
      ROSTER_PUUIDS,
    );

    assert.deepEqual(detailCalls, ["NA1_shared"], "one Riot call for one game");
    assert.equal(result.diagnostics.matchesStored, 1);
    assert.equal(result.diagnostics.participantRows, 2);
    assert.equal(db.participantMatches.size, 2);
  });

  it("caps a large backlog at the batch limit and leaves the rest", async () => {
    const ids = Array.from({ length: 55 }, (_, index) => `NA1_${index}`);
    const byId = Object.fromEntries(
      ids.map((id) => [id, [{ puuid: "puuid-a", championId: 1, championName: "Annie", win: true }]]),
    );
    serveMatches(byId);

    const result = await syncMatchHistory([solo(ids, "player-a")], ROSTER_PUUIDS);

    assert.equal(detailCalls.length, MATCH_DETAIL_BATCH);
    assert.equal(result.diagnostics.detailsFetched, MATCH_DETAIL_BATCH);
    assert.equal(result.diagnostics.backlog, ids.length - MATCH_DETAIL_BATCH);
    assert.equal(db.matches.size, MATCH_DETAIL_BATCH);
  });

  it("picks up where it left off on the next run and refetches nothing", async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `NA1_${index}`);
    serveMatches(
      Object.fromEntries(
        ids.map((id) => [
          id,
          [{ puuid: "puuid-a", championId: 1, championName: "Annie", win: true }],
        ]),
      ),
    );

    await syncMatchHistory([solo(ids, "player-a")], ROSTER_PUUIDS);
    const firstPass = [...detailCalls];

    // The cooldown only applies to a *completed* sync, so move past it.
    db.sync.set(MATCH_SYNC_KEY, { lastCompletedAt: 0, leaseUntil: null });
    detailCalls = [];

    const second = await syncMatchHistory([solo(ids, "player-a")], ROSTER_PUUIDS);

    assert.equal(firstPass.length, MATCH_DETAIL_BATCH);
    assert.equal(detailCalls.length, 5, "only the remaining backlog");
    assert.equal(
      firstPass.some((id) => detailCalls.includes(id)),
      false,
      "no match was fetched twice across runs",
    );
    assert.equal(second.diagnostics.backlog, 0);
    assert.equal(db.matches.size, 25);
  });

  /**
   * A roster whose STREAK is fully satisfied from storage, plus one unknown
   * event match sitting further back. Any Riot call in this shape would be a
   * history download, which the cooldown and the lease must both prevent.
   */
  function rosterWithHistoryBacklogOnly(): RosterMatchIds {
    const streakIds = ["NA1_s1", "NA1_s2", "NA1_s3", "NA1_s4", "NA1_s5"];
    for (const [index, id] of streakIds.entries()) {
      db.seedMatch({
        matchId: id,
        gameEndAt: ENDED_AT + index,
        participantId: "player-a",
        championId: 64,
        championName: "LeeSin",
        won: true,
      });
    }

    return {
      participantId: "player-a",
      eventMatchIds: [...streakIds, "NA1_old_unknown"],
      streakMatchIds: streakIds,
    };
  }

  it("downloads no event history while the cooldown is running", async () => {
    const base = Date.now();
    db.now = () => base;
    const entry = rosterWithHistoryBacklogOnly();
    db.sync.set(MATCH_SYNC_KEY, { lastCompletedAt: base - 60_000, leaseUntil: null });

    serveMatches({
      NA1_old_unknown: [
        { puuid: "puuid-a", championId: 1, championName: "Annie", win: true },
      ],
    });

    const result = await syncMatchHistory([entry], ROSTER_PUUIDS);

    assert.deepEqual(detailCalls, [], "no Match-V5 detail for Top Champions");
    assert.equal(result.diagnostics.status, "skipped");
    assert.equal(result.diagnostics.reason, "cooldown");
    assert.equal(result.diagnostics.detailsFetched, 0);
    assert.equal(result.diagnostics.streakFallbackDetails, 0);
    assert.equal(result.diagnostics.backlog, 1, "the work is still waiting, not lost");
  });

  it("downloads no event history while another instance holds the lease", async () => {
    const base = Date.now();
    db.now = () => base;
    const entry = rosterWithHistoryBacklogOnly();
    db.sync.set(MATCH_SYNC_KEY, { lastCompletedAt: null, leaseUntil: base + 60_000 });

    serveMatches({
      NA1_old_unknown: [
        { puuid: "puuid-a", championId: 1, championName: "Annie", win: true },
      ],
    });

    const result = await syncMatchHistory([entry], ROSTER_PUUIDS);

    assert.deepEqual(detailCalls, []);
    assert.equal(result.diagnostics.reason, "lease-held");
    assert.equal(result.diagnostics.detailsFetched, 0);
    assert.equal(result.diagnostics.streakFallbackDetails, 0);
  });

  it("recovers once an abandoned lease expires", async () => {
    const base = Date.now();
    db.now = () => base;

    // A function that crashed mid-sync: lease taken, never released, expired.
    db.sync.set(MATCH_SYNC_KEY, {
      lastCompletedAt: base - (SYNC_COOLDOWN_SECONDS + 60) * 1000,
      leaseUntil: base - 1_000,
    });

    serveMatches({
      NA1_new: [{ puuid: "puuid-a", championId: 1, championName: "Annie", win: true }],
    });

    const result = await syncMatchHistory([solo(["NA1_new"], "player-a")], ROSTER_PUUIDS);

    assert.deepEqual(detailCalls, ["NA1_new"]);
    assert.equal(result.diagnostics.status, "synced");
  });

  it("takes no lease and makes no request when there is nothing new", async () => {
    db.seedMatch({
      matchId: "NA1_known",
      gameEndAt: ENDED_AT,
      participantId: "player-a",
      championId: 64,
      championName: "LeeSin",
      won: true,
    });
    serveMatches({});

    const result = await syncMatchHistory([solo(["NA1_known"], "player-a")], ROSTER_PUUIDS);

    assert.deepEqual(detailCalls, []);
    assert.equal(result.diagnostics.status, "synced");
    assert.equal(db.sync.has(MATCH_SYNC_KEY), false, "no lease row written for no work");
  });

  it("keeps existing history when a write fails", async () => {
    db.seedMatch({
      matchId: "NA1_old",
      gameEndAt: ENDED_AT,
      participantId: "player-a",
      championId: 64,
      championName: "LeeSin",
      won: true,
    });

    serveMatches({
      NA1_new: [{ puuid: "puuid-a", championId: 1, championName: "Annie", win: true }],
    });

    db.failWrites = true;

    const result = await syncMatchHistory(
      [solo(["NA1_old", "NA1_new"], "player-a")],
      ROSTER_PUUIDS,
    );

    assert.equal(result.diagnostics.status, "failed");
    assert.equal(db.matches.size, 1, "the old match survived");
    assert.equal(db.participantMatches.size, 1);
    assert.equal(result.outcomes.get(outcomeKey("player-a", "NA1_old")), true);

    // A failed sync does not start the cooldown, so the next regeneration retries.
    assert.equal(db.sync.get(MATCH_SYNC_KEY)?.lastCompletedAt, null);

    // Releasing the lease is itself a write, so when the database is the thing
    // that is broken it fails too. The expiry is the backstop: the lock is
    // always time-bounded, never held forever by a failed run.
    const leaseUntil = db.sync.get(MATCH_SYNC_KEY)?.leaseUntil;
    assert.ok(leaseUntil);
    assert.ok(
      leaseUntil <= Date.now() + SYNC_LEASE_SECONDS * 1000,
      "a failed sync must never hold the lease beyond its expiry",
    );
  });

  it("hands the lease straight back when only the write failed", async () => {
    serveMatches({
      NA1_new: [{ puuid: "puuid-a", championId: 1, championName: "Annie", win: true }],
    });

    db.failWrites = true;
    const result = await syncMatchHistory([solo(["NA1_new"], "player-a")], ROSTER_PUUIDS);
    assert.equal(result.diagnostics.status, "failed");

    // The database recovers; the next regeneration is not blocked by a lease.
    db.failWrites = false;
    db.sync.set(MATCH_SYNC_KEY, { lastCompletedAt: null, leaseUntil: null });
    detailCalls = [];

    const retry = await syncMatchHistory([solo(["NA1_new"], "player-a")], ROSTER_PUUIDS);
    assert.equal(retry.diagnostics.status, "synced");
    assert.deepEqual(detailCalls, ["NA1_new"], "the unwritten match was retried, not lost");
    assert.equal(db.matches.size, 1);
  });

  it("uses a pre-event game for STREAK without ever persisting it", async () => {
    // The exact wini11 shape: four event games plus an older fifth.
    const preEvent = "NA1_pre";
    const eventIds = ["NA1_e1", "NA1_e2", "NA1_e3", "NA1_e4"];

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const matchId = url.split("/matches/")[1]?.split("?")[0] ?? "";
      detailCalls.push(matchId);

      const endedAt =
        matchId === preEvent ? EVENT_START_AT.getTime() - 86_400_000 : ENDED_AT;

      return new Response(
        JSON.stringify({
          info: {
            queueId: 420,
            gameEndTimestamp: endedAt,
            participants: [
              { puuid: "puuid-a", championId: 141, championName: "Kayn", win: true },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const streak = [...eventIds, preEvent];
    const result = await syncMatchHistory(
      [{ participantId: "player-a", eventMatchIds: eventIds, streakMatchIds: streak }],
      ROSTER_PUUIDS,
    );

    // All five results are available to the renderer...
    assert.deepEqual(
      streak.map((id) => result.outcomes.get(outcomeKey("player-a", id))),
      [true, true, true, true, true],
      "STREAK must see all five latest Solo/Duo games",
    );

    // ...but only the four event games are history.
    assert.equal(db.matches.has(preEvent), false, "pre-event match must not be persisted");
    assert.equal(db.matches.size, 4);
    assert.equal(db.participantMatches.size, 4);
    assert.equal(result.diagnostics.matchesStored, 4);
  });

  it("keeps a remake out of STREAK as well as out of champion stats", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const matchId = url.split("/matches/")[1]?.split("?")[0] ?? "";
      detailCalls.push(matchId);

      return new Response(
        JSON.stringify({
          info: {
            queueId: 420,
            // Pre-event *and* a remake: still not a win or a loss.
            gameEndTimestamp: EVENT_START_AT.getTime() - 86_400_000,
            participants: [
              {
                puuid: "puuid-a",
                championId: 141,
                championName: "Kayn",
                win: false,
                gameEndedInEarlySurrender: true,
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const result = await syncMatchHistory(
      [solo(["NA1_remake"], "player-a")],
      ROSTER_PUUIDS,
    );

    assert.equal(
      result.outcomes.get(outcomeKey("player-a", "NA1_remake")),
      undefined,
      "a remake contributes no W/L anywhere",
    );
    assert.equal(db.matches.size, 0);
    assert.equal(db.participantMatches.size, 0);
  });

  it("renders the same STREAK whether the history sync ran or was skipped", async () => {
    // The wini11 shape: four stored event games plus an older, unstored fifth.
    const eventIds = ["NA1_e1", "NA1_e2", "NA1_e3", "NA1_e4"];
    const preEvent = "NA1_pre";

    for (const [index, id] of eventIds.entries()) {
      db.seedMatch({
        matchId: id,
        gameEndAt: ENDED_AT + index,
        participantId: "player-a",
        championId: 141,
        championName: "Kayn",
        won: true,
      });
    }

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const matchId = url.split("/matches/")[1]?.split("?")[0] ?? "";
      detailCalls.push(matchId);

      return new Response(
        JSON.stringify({
          info: {
            queueId: 420,
            gameEndTimestamp: EVENT_START_AT.getTime() - 86_400_000,
            participants: [
              { puuid: "puuid-a", championId: 141, championName: "Kayn", win: true },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const entry: RosterMatchIds = {
      participantId: "player-a",
      eventMatchIds: eventIds,
      streakMatchIds: [...eventIds, preEvent],
    };
    const read = (r: Awaited<ReturnType<typeof syncMatchHistory>>) =>
      entry.streakMatchIds.map((id) => r.outcomes.get(outcomeKey("player-a", id)));

    // --- history sync ALLOWED ---
    const allowed = await syncMatchHistory([entry], ROSTER_PUUIDS);
    const allowedStreak = read(allowed);
    const allowedCalls = [...detailCalls];

    // --- history sync SKIPPED by cooldown ---
    db.sync.set(MATCH_SYNC_KEY, { lastCompletedAt: Date.now(), leaseUntil: null });
    detailCalls = [];

    const skipped = await syncMatchHistory([entry], ROSTER_PUUIDS);
    const skippedStreak = read(skipped);

    assert.equal(skipped.diagnostics.status, "skipped");
    assert.equal(skipped.diagnostics.reason, "cooldown");

    // The core acceptance test: same Riot state, same bars either way.
    assert.deepEqual(allowedStreak, [true, true, true, true, true]);
    assert.deepEqual(
      skippedStreak,
      allowedStreak,
      "STREAK must not depend on whether the history lease was acquired",
    );

    // The cooldown still protected history: no event history was downloaded,
    // and the only call was the one streak-only detail.
    assert.equal(skipped.diagnostics.detailsFetched, 0, "no history details while skipped");
    assert.equal(skipped.diagnostics.streakFallbackDetails, 1);
    assert.deepEqual(detailCalls, [preEvent]);
    assert.deepEqual(allowedCalls, [preEvent]);

    // And nothing pre-event was persisted, either way.
    assert.equal(db.matches.has(preEvent), false);
    assert.equal(db.matches.size, 4);
    assert.equal(db.participantMatches.size, 4);
  });

  it("fetches nothing for STREAK once every result is already stored", async () => {
    const ids = ["NA1_s1", "NA1_s2", "NA1_s3", "NA1_s4", "NA1_s5"];
    for (const [index, id] of ids.entries()) {
      db.seedMatch({
        matchId: id,
        gameEndAt: ENDED_AT + index,
        participantId: "player-a",
        championId: 64,
        championName: "LeeSin",
        won: index % 2 === 0,
      });
    }
    serveMatches({});

    const result = await syncMatchHistory([solo(ids, "player-a")], ROSTER_PUUIDS);

    assert.deepEqual(detailCalls, [], "a warm database costs zero streak requests");
    assert.equal(result.diagnostics.streakFallbackDetails, 0);
  });

  it("does not re-fetch a known remake to chase a fifth bar", async () => {
    // Four countable results plus a remake already recorded in `matches`.
    const ids = ["NA1_r1", "NA1_r2", "NA1_r3", "NA1_r4"];
    for (const [index, id] of ids.entries()) {
      db.seedMatch({
        matchId: id,
        gameEndAt: ENDED_AT + index,
        participantId: "player-a",
        championId: 64,
        championName: "LeeSin",
        won: true,
      });
    }
    // Seen before, produced no participant row: a remake.
    db.matches.set("NA1_remake", ENDED_AT + 9);
    serveMatches({});

    const result = await syncMatchHistory(
      [
        {
          participantId: "player-a",
          eventMatchIds: [...ids, "NA1_remake"],
          streakMatchIds: [...ids, "NA1_remake"],
        },
      ],
      ROSTER_PUUIDS,
    );

    assert.deepEqual(detailCalls, [], "a known non-result is never paid for twice");
    assert.equal(result.diagnostics.streakFallbackDetails, 0);
    assert.equal(
      result.outcomes.get(outcomeKey("player-a", "NA1_remake")),
      undefined,
      "a remake is still not a W or an L",
    );
  });

  it("refuses a pre-event match even when a caller bypasses the mapper", async () => {
    // Deliberately hand storeMatches something toStoredMatch would have
    // rejected. The event window has to hold at the write boundary, not only
    // at the one call site that currently happens to filter.
    const written = await storeMatches([
      {
        matchId: "NA1_too_old",
        gameEndAt: EVENT_START_AT.getTime() - 1,
        participants: [
          { participantId: "player-a", championId: 64, championName: "LeeSin", won: true },
        ],
      },
      {
        matchId: "NA1_valid",
        gameEndAt: EVENT_START_AT.getTime(),
        participants: [
          { participantId: "player-a", championId: 22, championName: "Ashe", won: false },
        ],
      },
    ]);

    assert.equal(written.rejected, 1);
    assert.equal(written.matches, 1);
    assert.equal(written.participantRows, 1);

    assert.equal(db.matches.has("NA1_too_old"), false, "pre-event match must not be stored");
    assert.equal(db.matches.has("NA1_valid"), true, "the boundary instant counts as in-event");
    assert.equal(db.participantMatches.size, 1);
  });

  it("writes matches with ON CONFLICT DO NOTHING so a re-run cannot duplicate", async () => {
    serveMatches({
      NA1_new: [{ puuid: "puuid-a", championId: 1, championName: "Annie", win: true }],
    });

    await syncMatchHistory([solo(["NA1_new"], "player-a")], ROSTER_PUUIDS);

    const inserts = db.statements.filter((text) => text.startsWith("INSERT INTO"));
    assert.equal(inserts.length, 2);
    for (const statement of inserts) {
      assert.match(statement, /ON CONFLICT .*DO NOTHING/);
    }
  });
});
