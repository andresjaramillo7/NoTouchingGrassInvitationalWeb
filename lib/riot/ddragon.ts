import { REVALIDATE_SECONDS } from "@/lib/revalidate";

/**
 * Data Dragon is a public static CDN, not an authenticated Riot API, so it
 * needs no key and does not count against the API request budget.
 */
const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";

/** Used only if the version list is unreachable. */
const FALLBACK_VERSION = "15.1.1";

/**
 * Latest Data Dragon patch — resolved once per standings regeneration and
 * reused for all eight profile icons. Pinned to the same ISR window as
 * everything else so no cache outlives the generated page.
 */
export async function getDataDragonVersion(): Promise<string> {
  try {
    const response = await fetch(VERSIONS_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return FALLBACK_VERSION;

    const versions = (await response.json()) as string[];
    return versions[0] ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

export function profileIconUrl(version: string, profileIconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
}

export function championIconUrl(version: string, championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${encodeURIComponent(
    championName,
  )}.png`;
}

type ChampionIndex = { data: Record<string, { id: string; name: string }> };

/**
 * Data Dragon id -> display name, e.g. `MonkeyKing` -> `Wukong`.
 *
 * Match-V5 returns the Data Dragon id, which is what the icon URL needs but
 * not always what the champion is called. This is one request to the same
 * public CDN, on the same ISR window as everything else, and it costs nothing
 * against the Riot API budget.
 *
 * Failure is not fatal: callers fall back to the raw id, which is readable
 * for every champion whose name has no space in it.
 */
export async function getChampionDisplayNames(
  version: string,
): Promise<Map<string, string>> {
  try {
    const response = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!response.ok) return new Map();

    const index = (await response.json()) as ChampionIndex;
    return new Map(
      Object.values(index.data).map((champion) => [champion.id, champion.name]),
    );
  } catch {
    return new Map();
  }
}
