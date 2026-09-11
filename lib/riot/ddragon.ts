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
