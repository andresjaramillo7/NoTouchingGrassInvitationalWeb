import { REGION_HOST, RiotApiError, riotFetch } from "@/lib/riot/client";
import type { MatchResult } from "@/lib/ranks";

/** Ranked Solo/Duo. */
const QUEUE_SOLO = 420;
const RECENT_COUNT = 5;

type MatchDetail = {
  info: { participants: { puuid: string; win: boolean }[] };
};

/**
 * The five most recent Ranked Solo/Duo results, newest first.
 *
 * Riot returns match ids newest-first and we preserve that order, so
 * `recentResults[0]` is the latest game — which is what `currentStreak`
 * assumes. StreakBars reverses a copy for display, drawing oldest on the
 * left and newest on the right.
 *
 * A single unreadable match is skipped rather than failing the player.
 */
export async function getRecentSoloResults(
  puuid: string,
): Promise<MatchResult[]> {
  const matchIds = await riotFetch<string[]>(
    REGION_HOST,
    `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`,
    {
      query: { queue: QUEUE_SOLO, start: 0, count: RECENT_COUNT },
    },
  );

  const results = await Promise.all(
    matchIds.map(async (matchId): Promise<MatchResult | null> => {
      try {
        const match = await riotFetch<MatchDetail>(
          REGION_HOST,
          `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
        );
        const me = match.info.participants.find((p) => p.puuid === puuid);
        return me ? (me.win ? "W" : "L") : null;
      } catch (error) {
        if (error instanceof RiotApiError) return null;
        throw error;
      }
    }),
  );

  return results.filter((result): result is MatchResult => result !== null);
}
