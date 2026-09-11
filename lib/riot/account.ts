import { REGION_HOST, riotFetch } from "@/lib/riot/client";

/** ACCOUNT-V1 — the current Riot ID lookup. Summoner-name lookup is gone. */
export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

/**
 * Strips invisible bidirectional/format marks that survive copy-paste from
 * the client (U+2066-2069 isolates, U+200B-200F, U+202A-202E, BOM).
 *
 * Only Unicode "format" characters are removed. Real letters are untouched,
 * so a Riot ID like 地獄Hellberg passes through intact — it must never be
 * transliterated or ASCII-folded.
 */
export function normalizeRiotIdPart(value: string): string {
  return value.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "");
}

export function getAccountByRiotId(
  gameName: string,
  tagLine: string,
): Promise<RiotAccount> {
  // encodeURIComponent emits UTF-8 percent-escapes, which is exactly what the
  // Riot endpoint expects for non-ASCII names.
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    normalizeRiotIdPart(gameName),
  )}/${encodeURIComponent(normalizeRiotIdPart(tagLine))}`;

  return riotFetch<RiotAccount>(REGION_HOST, path);
}
