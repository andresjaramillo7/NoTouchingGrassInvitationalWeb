/**
 * The one coordination point for bulk match-history synchronisation.
 *
 * The in-memory gate in lib/riot/gate.ts paces requests inside a single
 * process. It cannot see a second Vercel instance, so it is the wrong tool for
 * "is somebody else already syncing?". This single Postgres row is that tool:
 * a cooldown plus an expiring lease, acquired atomically in one statement.
 *
 * No Redis, no KV, no queue. One row.
 */
import { getSql, describeDbError } from "@/lib/db/sql";

/** The only sync we run. A second workload would get its own key, not its own cron. */
export const MATCH_SYNC_KEY = "ntgi:match-history";

/**
 * How long after a completed sync the next one may start.
 *
 * Matched to the page's ISR window (600s): a legitimate regeneration is never
 * blocked by it, while a duplicate regeneration, a retry race, or two visitors
 * landing on a stale deployment at the same moment all are.
 */
export const SYNC_COOLDOWN_SECONDS = 600;

/**
 * How long an in-progress sync holds the lock.
 *
 * Long enough to cover a bounded batch comfortably, short enough that a
 * function killed mid-sync only delays the next attempt by a couple of
 * minutes instead of wedging the event forever.
 */
export const SYNC_LEASE_SECONDS = 120;

export type LeaseOutcome =
  | { acquired: true }
  | { acquired: false; reason: "cooldown" | "lease-held" | "unavailable" };

type AcquireRow = {
  acquired: boolean;
  prior_lease_until: string | null;
  prior_last_completed_at: string | null;
};

/**
 * Tries to take the sync lock.
 *
 * Everything happens in one statement so two instances racing cannot both win:
 * the conditional upsert either updates the row or matches nothing, and
 * Postgres serialises the conflicting writers for us.
 */
export async function tryAcquireSyncLease(
  key: string = MATCH_SYNC_KEY,
  cooldownSeconds: number = SYNC_COOLDOWN_SECONDS,
  leaseSeconds: number = SYNC_LEASE_SECONDS,
): Promise<LeaseOutcome> {
  const sql = getSql();
  if (!sql) return { acquired: false, reason: "unavailable" };

  try {
    const rows = (await sql`
      WITH before AS (
        SELECT last_completed_at, lease_until
          FROM sync_state
         WHERE sync_key = ${key}
      ),
      taken AS (
        INSERT INTO sync_state AS s (sync_key, lease_until)
        VALUES (${key}, now() + make_interval(secs => ${leaseSeconds}::double precision))
        ON CONFLICT (sync_key) DO UPDATE
           SET lease_until = now() + make_interval(secs => ${leaseSeconds}::double precision)
         WHERE (s.lease_until IS NULL OR s.lease_until <= now())
           AND (s.last_completed_at IS NULL
                OR s.last_completed_at <= now() - make_interval(secs => ${cooldownSeconds}::double precision))
        RETURNING s.sync_key
      )
      SELECT EXISTS (SELECT 1 FROM taken)         AS acquired,
             (SELECT lease_until       FROM before) AS prior_lease_until,
             (SELECT last_completed_at FROM before) AS prior_last_completed_at
    `) as AcquireRow[];

    const row = rows[0];
    if (!row) return { acquired: false, reason: "unavailable" };
    if (row.acquired) return { acquired: true };

    // A live lease is the more urgent explanation, so it wins the label.
    const leaseActive =
      row.prior_lease_until !== null &&
      new Date(row.prior_lease_until).getTime() > Date.now();

    return { acquired: false, reason: leaseActive ? "lease-held" : "cooldown" };
  } catch (error) {
    console.warn(`[ntgi:db] lease acquire failed: ${describeDbError(error)}`);
    return { acquired: false, reason: "unavailable" };
  }
}

/**
 * Hands the lock back.
 *
 * `completed` is the difference between "that worked, wait a full cooldown"
 * and "that failed, let the next regeneration try again". A failed sync
 * deliberately does not start the cooldown — but it still drops the lease, so
 * nothing is blocked. Whatever it managed to persist stays persisted.
 */
export async function releaseSyncLease(
  completed: boolean,
  key: string = MATCH_SYNC_KEY,
): Promise<void> {
  const sql = getSql();
  if (!sql) return;

  try {
    if (completed) {
      await sql`
        UPDATE sync_state
           SET last_completed_at = now(), lease_until = NULL
         WHERE sync_key = ${key}
      `;
    } else {
      await sql`UPDATE sync_state SET lease_until = NULL WHERE sync_key = ${key}`;
    }
  } catch (error) {
    // The lease expires on its own; losing this update is not worth failing for.
    console.warn(`[ntgi:db] lease release failed: ${describeDbError(error)}`);
  }
}

/**
 * Pushes an already-held lease further into the future.
 *
 * Only the local backfill needs this: it is the one workload that runs for
 * minutes rather than seconds, and a lease short enough to recover from a
 * crashed function is far shorter than a full backfill. Extending on a
 * heartbeat keeps both properties — the web sync stays locked out while the
 * backfill runs, and the lock still expires on its own if the script dies.
 */
export async function extendSyncLease(
  leaseSeconds: number = SYNC_LEASE_SECONDS,
  key: string = MATCH_SYNC_KEY,
): Promise<void> {
  const sql = getSql();
  if (!sql) return;

  try {
    await sql`
      UPDATE sync_state
         SET lease_until = now() + make_interval(secs => ${leaseSeconds}::double precision)
       WHERE sync_key = ${key}
    `;
  } catch (error) {
    console.warn(`[ntgi:db] lease extend failed: ${describeDbError(error)}`);
  }
}
