/**
 * Bounded fan-out.
 *
 * This keeps call sites tidy; it is not the rate limit. The global gate in
 * lib/riot/gate.ts is what actually protects Riot, and every authenticated
 * request passes through it regardless of how it was fanned out.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Round-robins several newest-first lists into one fair queue, dropping
 * anything `skip` rejects and never yielding the same value twice.
 *
 * Taking one id from each participant before taking a second from anyone means
 * a bounded batch cannot be monopolised by the roster's most active player.
 */
export function interleaveUnique(
  lists: readonly (readonly string[])[],
  seen: Set<string>,
  skip: (value: string) => boolean = () => false,
): string[] {
  const ordered: string[] = [];
  const depth = Math.max(0, ...lists.map((list) => list.length));

  for (let index = 0; index < depth; index++) {
    for (const list of lists) {
      const value = list[index];
      if (value === undefined || seen.has(value) || skip(value)) continue;
      seen.add(value);
      ordered.push(value);
    }
  }

  return ordered;
}
