import { PLATFORM_HOST, riotFetch } from "@/lib/riot/client";

/**
 * LEAGUE-V4 ranked entries.
 *
 * Verified against the current Riot API reference: the by-PUUID endpoint is
 * the live one, and `entries/by-summoner/{summonerId}` no longer exists.
 */
export type LeagueEntry = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

const SOLO_QUEUE = "RANKED_SOLO_5x5";

export async function getSoloQueueEntry(
  puuid: string,
): Promise<LeagueEntry | null> {
  const entries = await riotFetch<LeagueEntry[]>(
    PLATFORM_HOST,
    `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
  );

  // Flex, TFT and every other queue are ignored by design.
  return entries.find((entry) => entry.queueType === SOLO_QUEUE) ?? null;
}
