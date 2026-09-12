import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRollingBudget } from "@/lib/riot/rolling-budget";

/**
 * The backfill's long-window ceiling. A virtual clock keeps the test instant:
 * nothing here actually waits two minutes.
 */
describe("rolling request budget", () => {
  it("never lets more than `limit` requests start inside one window", async () => {
    let clock = 0;
    const budget = createRollingBudget({
      limit: 60,
      windowMs: 120_000,
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
    });

    const starts: number[] = [];
    for (let i = 0; i < 150; i++) {
      await budget.take();
      starts.push(clock);
    }

    for (let i = 0; i < starts.length; i++) {
      const inWindow = starts.filter(
        (start) => start > starts[i]! - 120_000 && start <= starts[i]!,
      ).length;
      assert.ok(inWindow <= 60, `${inWindow} requests inside one 2-minute window`);
    }

    assert.equal(budget.used(), 150);
    assert.ok(budget.waitedMs() > 0, "a 150-request job must have waited");
  });

  it("does not wait at all while under the ceiling", async () => {
    let clock = 0;
    const budget = createRollingBudget({
      limit: 60,
      windowMs: 120_000,
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
    });

    for (let i = 0; i < 60; i++) await budget.take();

    assert.equal(budget.waitedMs(), 0);
    assert.equal(clock, 0);
  });
});
