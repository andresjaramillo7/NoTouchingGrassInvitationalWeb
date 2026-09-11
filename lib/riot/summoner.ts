import { PLATFORM_HOST, riotFetch } from "@/lib/riot/client";

/**
 * SUMMONER-V4 by PUUID.
 *
 * Needed only for `profileIconId`: League-V4 now accepts a PUUID directly, so
 * the summoner id is no longer required to read ranked entries.
 */
export type RiotSummoner = {
  id: string;
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
  revisionDate: number;
};

export function getSummonerByPuuid(puuid: string): Promise<RiotSummoner> {
  return riotFetch<RiotSummoner>(
    PLATFORM_HOST,
    `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
  );
}
