/**
 * A single process-wide gate for authenticated Riot requests.
 *
 * Participant-level concurrency alone was not enough: each participant fans
 * out into several requests, so eight participants at limit 2 still burst hard
 * enough to draw 429s (observed in Phase 2B: 42×200, 2×429).
 *
 * Policy — deliberately conservative for one private leaderboard:
 *   • at most MAX_CONCURRENT requests in flight at once
 *   • at least MIN_INTERVAL_MS between two request *starts*
 *   • optionally, a long-window budget on top (see `setRiotBudget`)
 *
 * Together that caps the sustained rate near 10 req/s, comfortably under a
 * development key's 20 req/s, while remaining far simpler than a real
 * rate-limit library or a distributed limiter.
 *
 * This gate is in-memory and therefore per-process. It paces one render; it
 * does NOT coordinate separate serverless instances. That job belongs to the
 * Postgres lease in lib/db/lease.ts, which is what stops two instances from
 * starting a bulk history sync at the same moment.
 */
const MAX_CONCURRENT = 4;
const MIN_INTERVAL_MS = 100;

export const GATE_POLICY = {
  maxConcurrent: MAX_CONCURRENT,
  minIntervalMs: MIN_INTERVAL_MS,
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let active = 0;
let nextSlotAt = 0;
const waiting: (() => void)[] = [];

/** Test/diagnostic counter: how many requests the gate has admitted. */
let admitted = 0;

/**
 * An optional long-window limiter layered on top of the short-window pacing.
 *
 * Production leaves this unset: the gate's spacing plus the bounded batch size
 * already keep a page render far below any Riot window. The local backfill
 * installs one, because it is the only workload that runs for minutes on end
 * and could otherwise drift up towards the application rate limit.
 */
export type RiotBudget = { take: () => Promise<void> };

let budget: RiotBudget | null = null;

/** Installs (or with `null`, removes) the long-window budget. */
export function setRiotBudget(next: RiotBudget | null): void {
  budget = next;
}

export function gateStats(): { admitted: number; active: number } {
  return { admitted, active };
}

export function resetGateForTests(): void {
  active = 0;
  nextSlotAt = 0;
  admitted = 0;
  waiting.length = 0;
  budget = null;
}

async function acquire(): Promise<void> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  admitted += 1;

  // Reserve the pacing slot synchronously so concurrent callers cannot all
  // compute the same start time and fire together.
  const now = Date.now();
  const startAt = Math.max(now, nextSlotAt);
  nextSlotAt = startAt + MIN_INTERVAL_MS;

  const wait = startAt - now;
  if (wait > 0) await sleep(wait);
}

function release(): void {
  active -= 1;
  waiting.shift()?.();
}

/**
 * Runs `task` under the global gate.
 *
 * Every authenticated Riot request in this project goes through here, retries
 * included. There is no second client and no bypass.
 */
export async function withRiotGate<T>(task: () => Promise<T>): Promise<T> {
  // The long-window budget is taken first: waiting for it must not hold a
  // concurrency slot that another request could be using.
  if (budget) await budget.take();

  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}
