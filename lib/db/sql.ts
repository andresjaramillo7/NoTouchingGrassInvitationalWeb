/**
 * Neon Postgres access. Server-only.
 *
 * The HTTP driver is used deliberately: every query is a one-shot HTTPS
 * request, so there is no pool to keep warm, no socket held open between
 * invocations, and nothing polling in the background. A serverless function
 * that renders a page and exits leaves no connection behind.
 *
 * DATABASE_URL is read server-side only and is never logged, never returned in
 * an error, and never sent to the browser.
 */
import { neon } from "@neondatabase/serverless";

export type SqlClient = ReturnType<typeof neon>;

let cached: SqlClient | null = null;

/** True when a connection string is configured, without revealing anything. */
export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * The shared query function, or `null` when no database is configured.
 *
 * Returning `null` rather than throwing is the whole failure strategy: the
 * leaderboard is built on live Riot rank data and must keep rendering when the
 * database is absent or unreachable. Champion history simply does not appear.
 */
export function getSql(): SqlClient | null {
  if (injected) return injected;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  cached ??= neon(url);
  return cached;
}

/** Test seam: forget the memoised client after changing DATABASE_URL. */
export function resetSqlForTests(): void {
  cached = null;
  injected = null;
}

let injected: SqlClient | null = null;

/** Test seam: run the real queries against an in-memory stand-in. */
export function setSqlForTests(client: SqlClient | null): void {
  injected = client;
}

/**
 * Runs a database read, degrading to `fallback` on any failure.
 *
 * Transient Neon trouble must never take the standings down and must never
 * cause us to invent champion statistics — an empty result is honest, a
 * fabricated one is not.
 */
export async function readOrFallback<T>(
  label: string,
  fallback: T,
  read: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  const sql = getSql();
  if (!sql) return fallback;

  try {
    return await read(sql);
  } catch (error) {
    // Message only — a connection string must never reach a log line.
    console.warn(`[ntgi:db] ${label} failed: ${describeDbError(error)}`);
    return fallback;
  }
}

export function describeDbError(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "unknown error";
}
