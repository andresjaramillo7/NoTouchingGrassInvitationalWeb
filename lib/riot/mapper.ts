import type { ParticipantConfig } from "@/data/participants";
import type { ChampionStat } from "@/lib/champions";
import {
  DIVISIONS,
  TIERS,
  type Division,
  type MatchResult,
  type Player,
  type Tier,
} from "@/lib/ranks";
import type { LeagueEntry } from "@/lib/riot/ranked";

/** Riot returns tiers/divisions as free-form strings; validate before trusting. */
function toTier(value: string): Tier | null {
  const upper = value.toUpperCase();
  return (TIERS as readonly string[]).includes(upper) ? (upper as Tier) : null;
}

function toDivision(value: string): Division | null {
  const upper = value.toUpperCase();
  return (DIVISIONS as readonly string[]).includes(upper)
    ? (upper as Division)
    : null;
}

/** Manual metadata every mapped player carries regardless of data source. */
function identity(
  config: ParticipantConfig,
  profileIcon: string | null,
  topChampions: ChampionStat[] = [],
) {
  return {
    id: config.id,
    displayName: config.gameName,
    role: config.role,
    twitchUsername: config.twitchUsername,
    twitchUrl: config.twitchUrl,
    isLive: config.isLive,
    gameName: config.gameName,
    tagLine: config.tagLine,
    profileIcon,
    topChampions,
  };
}

/**
 * Composes manual event metadata with live Riot data.
 *
 * A player with no RANKED_SOLO_5x5 entry is genuinely unranked and is mapped
 * as such — never to IRON IV, which would both misstate their standing and
 * let them outrank a real Iron IV participant.
 */
export function toPlayer(
  config: ParticipantConfig,
  riot: {
    entry: LeagueEntry | null;
    profileIcon: string | null;
    recentResults: MatchResult[];
    topChampions: ChampionStat[];
  },
): Player {
  const base = identity(config, riot.profileIcon, riot.topChampions);
  const tier = riot.entry ? toTier(riot.entry.tier) : null;

  if (!riot.entry || !tier) {
    return { ...base, status: "unranked" };
  }

  const stats = {
    status: "ranked" as const,
    leaguePoints: riot.entry.leaguePoints,
    wins: riot.entry.wins,
    losses: riot.entry.losses,
    recentResults: riot.recentResults,
  };

  if (tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER") {
    return { ...base, tier, division: null, ...stats };
  }

  return { ...base, tier, division: toDivision(riot.entry.rank) ?? "IV", ...stats };
}

/** Riot data could not be retrieved; identity and manual metadata survive. */
export function toUnavailablePlayer(
  config: ParticipantConfig,
  reason: string,
): Player {
  return { ...identity(config, null), status: "unavailable", reason };
}
