/**
 * NTGI match-history synchronisation.
 *
 * This is not a cron and not a job. It is a step inside the existing standings
 * refresh: when the page regenerates, current rank comes from Riot, match
 * history is topped up *if the database says it is due*, and the result is
 * rendered. There is exactly one Riot workload in this project, and this is
 * part of it.
 *
 * Three rules keep it cheap:
 *   1. a match already in `matches` is never fetched again
 *   2. one match id is fetched once for the whole roster, not once per player
 *   3. no more than MATCH_DETAIL_BATCH new details per sync — the rest waits
 *
 * Falling behind is fine. Losing an event match is not: every id stays
 * discoverable on Riot's side, so an unprocessed backlog is picked up by the
 * next regeneration rather than dropped.
 */
import { interleaveUnique, mapWithConcurrency } from "@/lib/concurrency";
import { releaseSyncLease, tryAcquireSyncLease } from "@/lib/db/lease";
import {
  findKnownMatchIds,
  findStoredOutcomes,
  outcomeKey,
  storeMatches,
  type StoredMatch,
} from "@/lib/db/matches";
import { describeDbError, hasDatabaseUrl } from "@/lib/db/sql";
import { getMatchDetail, readOutcomes, toStoredMatch } from "@/lib/riot/matches";

/**
 * The soft request budget, in NEW Match-V5 detail fetches per sync.
 *
 * Chosen for headroom, not throughput. Twenty details plus the roster's
 * Account/Summoner/League/match-id calls leaves a page regeneration far below
 * any Riot window, with room left for retries. A larger backlog is processed
 * across several regenerations, which is slower and entirely acceptable.
 */
export const MATCH_DETAIL_BATCH = 20;

/** The global gate is the real limit; this just keeps the fan-out tidy. */
const DETAIL_CONCURRENCY = 3;

export type RosterMatchIds = {
  participantId: string;
  /** Newest-first Solo/Duo ids inside the event window. */
  eventMatchIds: readonly string[];
  /** Newest-first ids backing STREAK. May pre-date EVENT_START_AT. */
  streakMatchIds: readonly string[];
};

export type SyncStatus = "synced" | "skipped" | "unavailable" | "failed";

export type SyncDiagnostics = {
  status: SyncStatus;
  /** Why a sync was skipped, or what went wrong. */
  reason?: string;
  /** Distinct ids the roster's match-id calls surfaced. */
  candidateIds: number;
  alreadyKnown: number;
  unknownIds: number;
  detailsFetched: number;
  matchesStored: number;
  participantRows: number;
  /** Unknown ids left for the next regeneration. */
  backlog: number;
  durationMs: number;
};

export type MatchSyncResult = {
  /** `outcomeKey(participantId, matchId)` -> won. Backs STREAK without refetching. */
  outcomes: Map<string, boolean>;
  diagnostics: SyncDiagnostics;
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function emptyDiagnostics(
  status: SyncStatus,
  reason: string | undefined,
  started: number,
  partial: Partial<SyncDiagnostics> = {},
): SyncDiagnostics {
  return {
    status,
    reason,
    candidateIds: 0,
    alreadyKnown: 0,
    unknownIds: 0,
    detailsFetched: 0,
    matchesStored: 0,
    participantRows: 0,
    backlog: 0,
    durationMs: Date.now() - started,
    ...partial,
  };
}

/**
 * Fetches each id's Match-V5 detail exactly once, under the global gate.
 *
 * A single unreadable match is skipped rather than failing the batch — its id
 * is still on Riot's side and is rediscovered next time.
 */
async function fetchDetails(ids: readonly string[]) {
  let fetched = 0;

  const details = await mapWithConcurrency(ids, DETAIL_CONCURRENCY, async (matchId) => {
    try {
      const detail = await getMatchDetail(matchId);
      fetched += 1;
      return { matchId, detail };
    } catch {
      return null;
    }
  });

  return { details: details.flatMap((entry) => (entry ? [entry] : [])), fetched };
}

/**
 * STREAK without a database.
 *
 * When DATABASE_URL is missing or Neon is unreachable, champion history simply
 * does not render — but the five latest results still must. This is the
 * pre-database behaviour, with one improvement kept: a match shared by two
 * participants is fetched once, not twice.
 */
async function streakOnlyOutcomes(
  roster: readonly RosterMatchIds[],
  participantIdByPuuid: ReadonlyMap<string, string>,
  started: number,
  reason: string,
): Promise<MatchSyncResult> {
  const ids = unique(roster.flatMap((entry) => [...entry.streakMatchIds]));
  const { details, fetched } = await fetchDetails(ids);

  const outcomes = new Map<string, boolean>();
  for (const { matchId, detail } of details) {
    for (const { participantId, won } of readOutcomes(detail, participantIdByPuuid)) {
      outcomes.set(outcomeKey(participantId, matchId), won);
    }
  }

  return {
    outcomes,
    diagnostics: emptyDiagnostics("unavailable", reason, started, {
      candidateIds: ids.length,
      unknownIds: ids.length,
      detailsFetched: fetched,
    }),
  };
}

/**
 * Tops up stored match history, then hands back every win/loss it can prove.
 *
 * The returned outcomes include rows that were already stored, so a caller
 * that only needs STREAK gets it for free when history is current — zero
 * Match-V5 detail calls in the steady state.
 */
export async function syncMatchHistory(
  roster: readonly RosterMatchIds[],
  participantIdByPuuid: ReadonlyMap<string, string>,
): Promise<MatchSyncResult> {
  const started = Date.now();

  if (!hasDatabaseUrl()) {
    return streakOnlyOutcomes(roster, participantIdByPuuid, started, "DATABASE_URL not configured");
  }

  const streakIds = unique(roster.flatMap((entry) => [...entry.streakMatchIds]));
  const candidateIds = unique([
    ...streakIds,
    ...roster.flatMap((entry) => [...entry.eventMatchIds]),
  ]);

  const [known, outcomes] = await Promise.all([
    findKnownMatchIds(candidateIds),
    findStoredOutcomes(streakIds),
  ]);

  // STREAK ids go first: the five latest results are visible on every row and
  // must stay correct, so they get the front of a bounded batch.
  const seen = new Set<string>();
  const isKnown = (id: string) => known.has(id);
  const queue = [
    ...interleaveUnique(roster.map((entry) => entry.streakMatchIds), seen, isKnown),
    ...interleaveUnique(roster.map((entry) => entry.eventMatchIds), seen, isKnown),
  ];

  const base = {
    candidateIds: candidateIds.length,
    alreadyKnown: known.size,
    unknownIds: queue.length,
  };

  // Nothing new: no lease taken, no Riot call made, no row written. The most
  // common outcome once history is current, and the cheapest.
  if (queue.length === 0) {
    return { outcomes, diagnostics: emptyDiagnostics("synced", undefined, started, base) };
  }

  const lease = await tryAcquireSyncLease();

  if (!lease.acquired && lease.reason === "unavailable") {
    return streakOnlyOutcomes(roster, participantIdByPuuid, started, "database unreachable");
  }

  if (!lease.acquired) {
    // Whatever is already stored still renders — we simply do not call Riot.
    return {
      outcomes,
      diagnostics: emptyDiagnostics("skipped", lease.reason, started, {
        ...base,
        backlog: queue.length,
      }),
    };
  }

  const batch = queue.slice(0, MATCH_DETAIL_BATCH);
  const backlog = queue.length - batch.length;

  let completed = false;
  let reason: string | undefined;
  let stored: StoredMatch[] = [];
  let fetched = 0;
  let storedMatches = 0;
  let storedRows = 0;

  try {
    const batchResult = await fetchDetails(batch);
    fetched = batchResult.fetched;

    for (const entry of batchResult.details) {
      const match = toStoredMatch(entry.matchId, entry.detail, participantIdByPuuid);

      if (match) {
        stored.push(match);
        continue;
      }

      // Outside the event window. NTGI history rejects it — it is never
      // written, never counted toward champion games, wins, losses or win
      // rate — but STREAK means "the latest five Solo/Duo games", not "the
      // latest five event games". The detail is already in hand, so its
      // result is kept in memory for this render only and then discarded.
      for (const { participantId, won } of readOutcomes(entry.detail, participantIdByPuuid)) {
        outcomes.set(outcomeKey(participantId, entry.matchId), won);
      }
    }

    const written = await storeMatches(stored);
    storedMatches = written.matches;
    storedRows = written.participantRows;
    completed = true;

    for (const match of stored) {
      for (const participant of match.participants) {
        outcomes.set(outcomeKey(participant.participantId, match.matchId), participant.won);
      }
    }
  } catch (error) {
    // Anything already written stays written; nothing is rolled back or erased.
    reason = describeDbError(error);
  } finally {
    await releaseSyncLease(completed);
  }

  return {
    outcomes,
    diagnostics: emptyDiagnostics(completed ? "synced" : "failed", reason, started, {
      ...base,
      detailsFetched: fetched,
      matchesStored: storedMatches,
      participantRows: storedRows,
      backlog,
    }),
  };
}
