import { EVENT_START_AT } from "@/lib/event";
import type { StoredMatch } from "@/lib/db/matches";
import { REGION_HOST, riotFetch } from "@/lib/riot/client";

/** Ranked Solo/Duo. Flex, Normal, ARAM and everything else are ignored. */
export const QUEUE_SOLO = 420;

/** How many games STREAK is built from. */
export const RECENT_COUNT = 5;

/**
 * How many match ids one discovery call asks for.
 *
 * One request, newest-first, restricted to the event window. Fifty Ranked
 * Solo/Duo games is more than anyone plays between two regenerations — or
 * across an idle afternoon — so a single page genuinely cannot miss an event
 * match, and live sync never needs to paginate. Deep history is the backfill
 * script's job, and it pages properly.
 */
export const DISCOVERY_PAGE_SIZE = 50;

export type MatchParticipantDetail = {
  puuid: string;
  championId: number;
  /** Data Dragon's champion id, e.g. "LeeSin" or "MonkeyKing". */
  championName: string;
  win: boolean;
  gameEndedInEarlySurrender?: boolean;
};

export type MatchDetail = {
  info: {
    queueId: number;
    gameEndTimestamp?: number;
    gameStartTimestamp?: number;
    gameDuration?: number;
    participants: MatchParticipantDetail[];
  };
};

/**
 * Ranked Solo/Duo match ids for one player, newest first.
 *
 * `startTime` is epoch *seconds* and is how the event window is enforced at
 * the source: asking Riot for ids from EVENT_START_AT onward means we never
 * pay for a match detail we would only throw away.
 */
export function getSoloMatchIds(
  puuid: string,
  options: { start?: number; count?: number; startTime?: number } = {},
): Promise<string[]> {
  const query: Record<string, string | number> = {
    queue: QUEUE_SOLO,
    start: options.start ?? 0,
    count: options.count ?? RECENT_COUNT,
  };

  if (options.startTime !== undefined) query.startTime = options.startTime;

  return riotFetch<string[]>(
    REGION_HOST,
    `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
    { query },
  );
}

export function getMatchDetail(matchId: string): Promise<MatchDetail> {
  return riotFetch<MatchDetail>(
    REGION_HOST,
    `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
  );
}

/** When the game actually finished, falling back when Riot omits the field. */
export function matchEndedAt(detail: MatchDetail): number | null {
  const { gameEndTimestamp, gameStartTimestamp, gameDuration } = detail.info;
  if (gameEndTimestamp) return gameEndTimestamp;
  if (gameStartTimestamp && gameDuration) {
    return gameStartTimestamp + gameDuration * 1000;
  }
  return gameStartTimestamp ?? null;
}

/**
 * Reduces a full Match-V5 payload to the handful of fields we persist.
 *
 * Returns `null` when the match does not belong to the event at all — wrong
 * queue, or finished before EVENT_START_AT. Those are never stored, so the two
 * invariants hold by construction for every row in the database.
 *
 * A match that passes but contains no NTGI participant with a countable result
 * still returns a row with an empty roster: recording that we have *seen* the
 * id is what stops us paying for it again. Remakes land here — Riot counts
 * them for neither side, so they are seen but not tallied.
 */
export function toStoredMatch(
  matchId: string,
  detail: MatchDetail,
  participantIdByPuuid: ReadonlyMap<string, string>,
  eventStartMs: number = EVENT_START_AT.getTime(),
): StoredMatch | null {
  if (detail.info.queueId !== QUEUE_SOLO) return null;

  const gameEndAt = matchEndedAt(detail);
  if (gameEndAt === null || gameEndAt < eventStartMs) return null;

  const participants = detail.info.participants.flatMap((entry) => {
    const participantId = participantIdByPuuid.get(entry.puuid);
    if (!participantId) return [];
    if (entry.gameEndedInEarlySurrender) return [];

    return [
      {
        participantId,
        championId: entry.championId,
        championName: entry.championName,
        won: entry.win,
      },
    ];
  });

  return { matchId, gameEndAt, participants };
}

/**
 * Win/loss for every NTGI participant in a match, ignoring the event window.
 *
 * This is what STREAK runs on. STREAK is the latest five Ranked Solo/Duo
 * games full stop, so a game played before EVENT_START_AT still belongs on
 * the bars — it simply must never be persisted, which is `toStoredMatch`'s
 * job and the write-boundary guard's job, not this function's.
 *
 * Used by the no-database fallback, and by the sync for details it fetched
 * but deliberately refused to store.
 */
export function readOutcomes(
  detail: MatchDetail,
  participantIdByPuuid: ReadonlyMap<string, string>,
): { participantId: string; won: boolean }[] {
  return detail.info.participants.flatMap((entry) => {
    const participantId = participantIdByPuuid.get(entry.puuid);
    if (!participantId) return [];
    // A remake is neither a win nor a loss, exactly as `toStoredMatch` treats
    // it. "A countable Solo/Duo result" has to mean the same thing whether it
    // reaches the UI from the database or straight from this payload.
    if (entry.gameEndedInEarlySurrender) return [];

    return [{ participantId, won: entry.win }];
  });
}
