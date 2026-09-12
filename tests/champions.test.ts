import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { toChampionStat } from "@/lib/champions";
import { findTopChampions } from "@/lib/db/matches";
import { resetSqlForTests } from "@/lib/db/sql";
import { EVENT_START_AT } from "@/lib/event";
import { FakeDb, installFakeSql, uninstallFakeSql } from "@/tests/fake-sql";

/**
 * Top-three champion aggregation.
 *
 * The ordering rule is games, then wins, then most recent appearance, then
 * champion id — the last step only so two otherwise identical lines can never
 * swap places between two regenerations of the same page.
 */

const START = EVENT_START_AT.getTime();
const hour = (n: number) => START + n * 3_600_000;

let db: FakeDb;

function play(
  participantId: string,
  championId: number,
  championName: string,
  results: boolean[],
  firstHour = 1,
): void {
  results.forEach((won, index) => {
    db.seedMatch({
      matchId: `NA1_${participantId}_${championId}_${index}`,
      gameEndAt: hour(firstHour + index),
      participantId,
      championId,
      championName,
      won,
    });
  });
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://fake/ntgi";
  db = installFakeSql(new FakeDb());
});

afterEach(() => {
  uninstallFakeSql();
  resetSqlForTests();
  delete process.env.DATABASE_URL;
});

describe("top champions", () => {
  it("counts games, wins and losses per champion and returns the top three", async () => {
    play("shiro", 64, "LeeSin", [true, true, false, true, false]); // 5 games, 3W
    play("shiro", 121, "Khazix", [true, true, true], 10); //           3 games, 3W
    play("shiro", 62, "MonkeyKing", [false, false], 20); //            2 games, 0W
    play("shiro", 5, "XinZhao", [true], 30); //                        1 game

    const top = (await findTopChampions(3)).get("shiro");
    assert.ok(top);
    assert.equal(top.length, 3, "only three, even though four were played");

    assert.deepEqual(
      top.map((row) => [row.championName, row.games, row.wins]),
      [
        ["LeeSin", 5, 3],
        ["Khazix", 3, 3],
        ["MonkeyKing", 2, 0],
      ],
    );

    const lee = toChampionStat(top[0]!, "15.1.1", new Map([["LeeSin", "Lee Sin"]]));
    assert.equal(lee.displayName, "Lee Sin");
    assert.equal(lee.losses, 2);
    assert.equal(lee.winRate.toFixed(1), "60.0");
    assert.match(lee.iconUrl, /\/cdn\/15\.1\.1\/img\/champion\/LeeSin\.png$/);
  });

  it("breaks a tie on wins, then recency, then champion id", async () => {
    // Same number of games; Ashe has more wins.
    play("maomao", 22, "Ashe", [true, true, false], 1);
    play("maomao", 51, "Caitlyn", [true, false, false], 1);

    // Same games and wins as Caitlyn, but played more recently.
    play("maomao", 222, "Jinx", [true, false, false], 50);

    const top = (await findTopChampions(3)).get("maomao");
    assert.ok(top);
    assert.deepEqual(top.map((row) => row.championName), ["Ashe", "Jinx", "Caitlyn"]);
  });

  it("is stable when games, wins and recency are all identical", async () => {
    db.seedMatch({
      matchId: "NA1_tie_a",
      gameEndAt: hour(1),
      participantId: "wini11",
      championId: 200,
      championName: "Belveth",
      won: true,
    });
    db.seedMatch({
      matchId: "NA1_tie_b",
      gameEndAt: hour(1),
      participantId: "wini11",
      championId: 100,
      championName: "Nocturne",
      won: true,
    });

    const first = (await findTopChampions(3)).get("wini11");
    const second = (await findTopChampions(3)).get("wini11");

    assert.deepEqual(
      first?.map((row) => row.championId),
      [100, 200],
      "the lower champion id wins the final tiebreak",
    );
    assert.deepEqual(first, second, "the same input always produces the same order");
  });

  it("keeps each participant's champions to themselves", async () => {
    play("shiro", 64, "LeeSin", [true, true]);
    play("maomao", 22, "Ashe", [false]);

    const all = await findTopChampions(3);
    assert.deepEqual(all.get("shiro")?.map((row) => row.championName), ["LeeSin"]);
    assert.deepEqual(all.get("maomao")?.map((row) => row.championName), ["Ashe"]);
  });

  it("returns nothing for a player with no event history", async () => {
    const all = await findTopChampions(3);
    assert.equal(all.get("hellberg"), undefined);
  });

  it("degrades to no champions rather than inventing them when the database fails", async () => {
    db.failWrites = true;
    uninstallFakeSql();
    // No client at all — the same shape as Neon being unreachable.
    process.env.DATABASE_URL = "";

    const all = await findTopChampions(3);
    assert.equal(all.size, 0);
  });
});
