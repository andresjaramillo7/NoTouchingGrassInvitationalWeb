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
 *
 * Together that caps the sustained rate near 10 req/s, comfortably under a
 * development key's 20 req/s, while remaining far simpler than a real
 * rate-limit library or a distributed limiter.
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

export function gateStats(): { admitted: number; active: number } {
  return { admitted, active };
}

export function resetGateForTests(): void {
  active = 0;
  nextSlotAt = 0;
  admitted = 0;
  waiting.length = 0;
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

/** Runs `task` under the global gate. */
export async function withRiotGate<T>(task: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}
