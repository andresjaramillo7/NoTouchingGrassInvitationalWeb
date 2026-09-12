/**
 * A rolling-window request budget.
 *
 * The gate in lib/riot/gate.ts protects the short window (roughly 10 req/s).
 * Riot also enforces a much longer application window, and a job that runs for
 * minutes — the backfill — can respect the short window perfectly while still
 * drifting up against the long one.
 *
 * This is deliberately not a dynamic rate limiter. It reads no headers and
 * adapts to nothing. It is a fixed ceiling set well below Riot's documented
 * maximum, so the answer to "are we close to the limit?" stays "no" without
 * anyone having to measure.
 */
export type RollingBudget = {
  take: () => Promise<void>;
  /** Requests taken so far. Diagnostics only. */
  used: () => number;
  /** Total time spent waiting on the budget, in ms. Diagnostics only. */
  waitedMs: () => number;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createRollingBudget({
  limit,
  windowMs,
  now = Date.now,
  wait = sleep,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}): RollingBudget {
  const stamps: number[] = [];
  let used = 0;
  let waitedMs = 0;

  // Serialises callers so two concurrent takes cannot both see the same free
  // slot and overshoot the ceiling.
  let queue: Promise<void> = Promise.resolve();

  async function reserve(): Promise<void> {
    for (;;) {
      const cutoff = now() - windowMs;
      while (stamps.length > 0 && stamps[0]! <= cutoff) stamps.shift();

      if (stamps.length < limit) {
        stamps.push(now());
        used += 1;
        return;
      }

      // Wait exactly until the oldest request leaves the window.
      const pause = stamps[0]! + windowMs - now() + 1;
      waitedMs += Math.max(pause, 0);
      await wait(Math.max(pause, 1));
    }
  }

  return {
    take() {
      const next = queue.then(reserve);
      // Keep the chain alive even if a caller aborts.
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    used: () => used,
    waitedMs: () => waitedMs,
  };
}
