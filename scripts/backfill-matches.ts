import { participants } from "@/data/participants";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  MATCH_SYNC_KEY,
  extendSyncLease,
  releaseSyncLease,
  tryAcquireSyncLease,
} from "@/lib/db/lease";
import {
  countStoredMatchesByParticipant,
  findKnownMatchIds,
  storeMatches,
  type StoredMatch,
} from "@/lib/db/matches";
import { hasDatabaseUrl } from "@/lib/db/sql";
import { EVENT_START_AT, EVENT_START_EPOCH_SECONDS, EVENT_TIME_ZONE } from "@/lib/event";
import { getAccountByRiotId } from "@/lib/riot/account";
import { hasRiotApiKey, riotErrorCounts } from "@/lib/riot/client";
import { gateStats, setRiotBudget } from "@/lib/riot/gate";
import { getMatchDetail, getSoloMatchIds, toStoredMatch } from "@/lib/riot/matches";
import { createRollingBudget } from "@/lib/riot/rolling-budget";
import { loadEnv } from "@/scripts/load-env";

/**
 * One-time historical backfill: EVENT_START_AT -> now.
 *
 *   npm run backfill:matches
 *
 * This exists so the first visitor to the site never waits for it. A full
 * event history can be hundreds of Match-V5 requests; a page render is allowed
 * twenty. So the expensive part runs here, locally, deliberately slowly, and
 * the deployed site only ever does small incremental top-ups.
 *
 * It is safe to stop and re-run at any point. Progress lives in the database:
 * already-stored matches are never fetched again, and every insert is
 * `ON CONFLICT DO NOTHING`, so a second run continues rather than duplicating.
 *
 * Nothing secret is printed — not the API key, not the connection string, and
 * not PUUIDs.
 */

/**
 * The long-window safety budget.
 *
 * Riot's documented ceiling for a personal key is considerably higher. This is
 * set well underneath it on purpose: the backfill is a one-off, nobody is
 * waiting on it, and a 5–15 minute run that never sees a 429 is a better
 * outcome than a fast one that does. If it has to wait, it waits.
 */
const BUDGET_REQUESTS = 60;
const BUDGET_WINDOW_MS = 2 * 60 * 1000;

/** Riot's maximum page size — fewer requests for the same ids. */
const ID_PAGE_SIZE = 100;
const MAX_ID_PAGES = 50;

/** Written to the database every CHUNK matches, so a stop loses almost nothing. */
const CHUNK = 10;

/** Deliberately low. The budget is the real limit; this keeps it unhurried. */
const DETAIL_CONCURRENCY = 2;

/** Refreshed well inside the lease window while the backfill runs. */
const HEARTBEAT_MS = 45_000;
const LEASE_SECONDS = 180;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function eventStartLabel(): string {
  const local = EVENT_START_AT.toLocaleString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${EVENT_START_AT.toISOString()} (${local} ${EVENT_TIME_ZONE})`;
}

/** Every event-window Solo/Duo id for one player, newest first. */
async function discoverMatchIds(puuid: string): Promise<string[]> {
  const ids: string[] = [];

  for (let page = 0; page < MAX_ID_PAGES; page++) {
    const batch = await getSoloMatchIds(puuid, {
      start: page * ID_PAGE_SIZE,
      count: ID_PAGE_SIZE,
      startTime: EVENT_START_EPOCH_SECONDS,
    });

    ids.push(...batch);
    if (batch.length < ID_PAGE_SIZE) break;
  }

  return ids;
}

async function acquireLease(): Promise<boolean> {
  // Cooldown 0: a manual backfill is deliberate and should not be blocked by
  // the web sync's ten-minute window. An active lease still blocks it, so the
  // two workloads can never burst at Riot together.
  for (let attempt = 0; attempt < 20; attempt++) {
    const lease = await tryAcquireSyncLease(MATCH_SYNC_KEY, 0, LEASE_SECONDS);
    if (lease.acquired) return true;

    if (lease.reason === "unavailable") {
      console.error("Could not reach the database to take the sync lease.");
      return false;
    }

    console.log(`sync lease held elsewhere (${lease.reason}); retrying in 15s…`);
    await sleep(15_000);
  }

  console.error("Gave up waiting for the sync lease.");
  return false;
}

async function main(): Promise<void> {
  loadEnv();

  if (!hasRiotApiKey()) {
    console.error("RIOT_API_KEY is not set. Add it to .env.local (server-side only).");
    process.exitCode = 1;
    return;
  }

  if (!hasDatabaseUrl()) {
    console.error("DATABASE_URL is not set. Add it to .env.local (server-side only).");
    process.exitCode = 1;
    return;
  }

  console.log("NTGI match-history backfill");
  console.log(`  event start : ${eventStartLabel()}`);
  console.log(`  queue       : 420 (Ranked Solo/Duo) only`);
  console.log(`  budget      : <= ${BUDGET_REQUESTS} Riot requests / ${BUDGET_WINDOW_MS / 1000}s`);
  console.log(`  participants: ${participants.length}`);
  console.log("");

  const budget = createRollingBudget({ limit: BUDGET_REQUESTS, windowMs: BUDGET_WINDOW_MS });
  setRiotBudget(budget);

  if (!(await acquireLease())) {
    setRiotBudget(null);
    process.exitCode = 1;
    return;
  }

  const heartbeat = setInterval(() => {
    void extendSyncLease(LEASE_SECONDS);
  }, HEARTBEAT_MS);

  let completed = false;
  let matchesStored = 0;
  let rowsStored = 0;
  let detailsFetched = 0;
  let skipped = 0;
  let refused = 0;

  try {
    // --- Discovery: one pass per participant, paged back to EVENT_START_AT. ---
    const participantIdByPuuid = new Map<string, string>();
    const discovered = new Map<string, string[]>();

    for (const config of participants) {
      const account = await getAccountByRiotId(config.gameName, config.tagLine);
      participantIdByPuuid.set(account.puuid, config.id);

      const ids = await discoverMatchIds(account.puuid);
      discovered.set(config.id, ids);

      const known = await findKnownMatchIds(ids);
      console.log(
        `  ${config.id.padEnd(16)} ids=${String(ids.length).padStart(4)}  ` +
          `known=${String(known.size).padStart(4)}  new=${String(ids.length - known.size).padStart(4)}`,
      );
    }

    // --- One global, deduplicated queue: a shared game is fetched once. ---
    const allIds = [...new Set([...discovered.values()].flat())];
    const known = await findKnownMatchIds(allIds);
    const pending = allIds.filter((id) => !known.has(id));

    console.log("");
    console.log(
      `  unique ids ${allIds.length} · already stored ${known.size} · to fetch ${pending.length}`,
    );
    console.log("");

    // --- Detail fetch, persisted in small chunks so a stop loses almost nothing. ---
    for (let offset = 0; offset < pending.length; offset += CHUNK) {
      const chunk = pending.slice(offset, offset + CHUNK);

      const details = await mapWithConcurrency(chunk, DETAIL_CONCURRENCY, async (matchId) => {
        try {
          const detail = await getMatchDetail(matchId);
          detailsFetched += 1;
          return { matchId, detail };
        } catch {
          skipped += 1;
          return null;
        }
      });

      const batch: StoredMatch[] = details.flatMap((entry) => {
        if (!entry) return [];
        const match = toStoredMatch(entry.matchId, entry.detail, participantIdByPuuid);
        return match ? [match] : [];
      });

      const written = await storeMatches(batch);

      matchesStored += written.matches;
      rowsStored += written.participantRows;
      if (written.rejected > 0) refused += written.rejected;

      const done = Math.min(offset + CHUNK, pending.length);
      console.log(
        `  ${String(done).padStart(5)}/${pending.length}  ` +
          `stored=${matchesStored}  rows=${rowsStored}  ` +
          `remaining=${pending.length - done}  ` +
          `riot=${gateStats().admitted}  waited=${Math.round(budget.waitedMs() / 1000)}s`,
      );
    }

    completed = true;

    const totals = await countStoredMatchesByParticipant();
    console.log("");
    console.log("  stored event matches per participant");
    for (const config of participants) {
      console.log(`    ${config.id.padEnd(16)} ${totals.get(config.id) ?? 0}`);
    }
  } finally {
    clearInterval(heartbeat);
    await releaseSyncLease(completed);
    setRiotBudget(null);
  }

  const { rateLimited, serverErrors } = riotErrorCounts();

  console.log("");
  console.log("backfill complete");
  console.log(`  riot requests   : ${gateStats().admitted}`);
  console.log(`  details fetched : ${detailsFetched}`);
  console.log(`  matches stored  : ${matchesStored}`);
  console.log(`  participant rows: ${rowsStored}`);
  console.log(`  unreadable      : ${skipped}`);
  console.log(`  refused (pre-event): ${refused}`);
  console.log(`  429 / 5xx       : ${rateLimited} / ${serverErrors}`);
  console.log(`  budget waiting  : ${Math.round(budget.waitedMs() / 1000)}s`);
}

main().catch((error: unknown) => {
  console.error("backfill failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
