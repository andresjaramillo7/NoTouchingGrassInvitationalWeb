/**
 * Authenticated Riot API access. Server-only.
 *
 * The API key is read from RIOT_API_KEY and is never sent to the browser,
 * never logged, and never embedded in an error message.
 */

import { REVALIDATE_SECONDS } from "@/lib/revalidate";
import { withRiotGate } from "@/lib/riot/gate";

/** Every participant in this event is NA. */
export const PLATFORM_HOST = "https://na1.api.riotgames.com";
export const REGION_HOST = "https://americas.api.riotgames.com";

/** Bounded so a struggling upstream can never stall a page render forever. */
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 10_000;

export class RiotApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Riot API ${status} on ${endpoint}`);
    this.name = "RiotApiError";
  }

  /** A retry could plausibly succeed (rate limit or upstream blip). */
  get isTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export class RiotConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiotConfigError";
  }
}

/** True when a key is configured, without revealing anything about it. */
export function hasRiotApiKey(): boolean {
  return Boolean(process.env.RIOT_API_KEY?.trim());
}

function requireApiKey(): string {
  const key = process.env.RIOT_API_KEY?.trim();
  if (!key) {
    throw new RiotConfigError(
      "RIOT_API_KEY is not set. Add it to .env.local (server-side only).",
    );
  }
  return key;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry-After when Riot supplies one, else exponential backoff. */
function retryDelayMs(status: number, retryAfterSeconds: number | undefined, attempt: number): number {
  if (status === 429 && retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(400 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

/**
 * Every request is tagged with the site's ISR window, so Riot data is
 * refreshed exactly when the page regenerates — never cached independently
 * of it, and never longer than it.
 *
 * 429 and 5xx are retried a bounded number of times; every other non-2xx is
 * surfaced immediately — retrying a 404 or a rejected key never helps.
 */
export async function riotFetch<T>(
  host: string,
  path: string,
  options: { query?: Record<string, string | number> } = {},
): Promise<T> {
  if (typeof window !== "undefined") {
    throw new RiotConfigError("Riot API calls must not run in the browser.");
  }

  const url = new URL(path, host);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  let lastError: RiotApiError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Every authenticated request — including retries — passes the gate.
    const response = await withRiotGate(() =>
      fetch(url, {
        headers: { "X-Riot-Token": requireApiKey() },
        next: { revalidate: REVALIDATE_SECONDS },
      }),
    );

    if (response.ok) return (await response.json()) as T;

    const header = Number(response.headers.get("retry-after"));
    const retryAfterSeconds =
      Number.isFinite(header) && header > 0 ? header : undefined;

    // Path only — query strings can carry the Riot ID, and nothing here
    // should ever surface the key.
    lastError = new RiotApiError(response.status, path, retryAfterSeconds);

    if (!lastError.isTransient || attempt === MAX_ATTEMPTS) throw lastError;

    await sleep(retryDelayMs(response.status, retryAfterSeconds, attempt));
  }

  throw lastError ?? new RiotConfigError("Riot request failed unexpectedly.");
}
