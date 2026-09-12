import { participants, type ParticipantConfig } from "@/data/participants";
import { toChampionStat, type ChampionStat } from "@/lib/champions";
import { mapWithConcurrency } from "@/lib/concurrency";
import { findTopChampions, outcomeKey } from "@/lib/db/matches";
import { EVENT_START_EPOCH_SECONDS } from "@/lib/event";
import {
  syncMatchHistory,
  type RosterMatchIds,
  type SyncDiagnostics,
} from "@/lib/match-sync";
import { sortPlayers, type MatchResult, type Player } from "@/lib/ranks";
import { getAccountByRiotId } from "@/lib/riot/account";
import { RiotApiError, hasRiotApiKey, riotErrorCounts } from "@/lib/riot/client";
import {
  getChampionDisplayNames,
  getDataDragonVersion,
  profileIconUrl,
} from "@/lib/riot/ddragon";
import { gateStats } from "@/lib/riot/gate";
import { toPlayer, toUnavailablePlayer } from "@/lib/riot/mapper";
import { DISCOVERY_PAGE_SIZE, RECENT_COUNT, getSoloMatchIds } from "@/lib/riot/matches";
import { getSoloQueueEntry, type LeagueEntry } from "@/lib/riot/ranked";
import { getSummonerByPuuid } from "@/lib/riot/summoner";

/**
 * How many participants resolve at once.
 *
 * The global gate in lib/riot/gate.ts is what actually protects the rate
 * limit; this just keeps the fan-out tidy for eight players.
 */
const PARTICIPANT_CONCURRENCY = 2;

/** How many champions each player shows. */
const TOP_CHAMPION_COUNT = 3;

export type UnavailableParticipant = {
  config: ParticipantConfig;
  reason: string;
};

export type Standings = {
  players: Player[];
  unavailable: UnavailableParticipant[];
};

/** Everything one participant's Riot calls produced, before champions join. */
type ResolvedParticipant = {
  config: ParticipantConfig;
  puuid: string;
  entry: LeagueEntry | null;
  profileIcon: string;
  /** Newest-first, inside the event window. */
  eventMatchIds: string[];
  /** Newest-first, the five games STREAK is built from. */
  streakMatchIds: string[];
};

/**
 * Resolves one participant's identity, rank and match ids.
 *
 * Request budget: 1 Account-V1 + 1 Summoner-V4 + 1 League-V4 + 1 Match-V5 id
 * list = 4 authenticated calls, plus one more only when the player has fewer
 * than five Ranked Solo/Duo games inside the event window.
 *
 * That single id list serves both purposes — STREAK's newest five and
 * discovery of new event matches — so the same endpoint is never called twice
 * for one player in one refresh. The conditional extra call exists because
 * STREAK is the latest five Solo/Duo games full stop, not the latest five
 * *event* games, and early in an event those differ. It stops happening for
 * good once a player has five event games.
 */
async function resolveParticipant(
  config: ParticipantConfig,
  ddragonVersion: string,
): Promise<ResolvedParticipant> {
  const account = await getAccountByRiotId(config.gameName, config.tagLine);

  const [summoner, entry, eventMatchIds] = await Promise.all([
    getSummonerByPuuid(account.puuid),
    getSoloQueueEntry(account.puuid),
    getSoloMatchIds(account.puuid, {
      start: 0,
      count: DISCOVERY_PAGE_SIZE,
      startTime: EVENT_START_EPOCH_SECONDS,
    }),
  ]);

  const streakMatchIds =
    eventMatchIds.length >= RECENT_COUNT
      ? eventMatchIds.slice(0, RECENT_COUNT)
      : await getSoloMatchIds(account.puuid, { start: 0, count: RECENT_COUNT });

  return {
    config,
    puuid: account.puuid,
    entry,
    profileIcon: profileIconUrl(ddragonVersion, summoner.profileIconId),
    eventMatchIds,
    streakMatchIds,
  };
}

function describe(error: unknown): string {
  if (error instanceof RiotApiError) {
    if (error.isNotFound) return "Riot ID not found";
    if (error.status === 401 || error.status === 403) return "Riot API key rejected";
    if (error.status === 429) {
      const suffix = error.retryAfterSeconds
        ? " (retry in " + error.retryAfterSeconds + "s)"
        : "";
      return "Rate limited" + suffix;
    }
    if (error.status >= 500) return "Riot API unavailable";
    return "Riot API error " + error.status;
  }
  return "Unexpected error";
}

/** One compact line per refresh. Never a PUUID, never a key, never a URL. */
function logRefresh(
  diagnostics: SyncDiagnostics,
  riotRequests: number,
  rateLimited: number,
): void {
  const parts = [
    "sync=" + diagnostics.status,
    diagnostics.reason ? "reason=" + diagnostics.reason : null,
    "ids=" + diagnostics.candidateIds,
    "known=" + diagnostics.alreadyKnown,
    "unknown=" + diagnostics.unknownIds,
    "details=" + diagnostics.detailsFetched,
    "stored=" + diagnostics.matchesStored,
    "rows=" + diagnostics.participantRows,
    "backlog=" + diagnostics.backlog,
    "riot=" + riotRequests,
    "429=" + rateLimited,
    "ms=" + diagnostics.durationMs,
  ].filter((part): part is string => part !== null);

  console.info("[ntgi:refresh] " + parts.join(" "));
}

/**
 * Builds the leaderboard.
 *
 * One coordinated Riot workload per regeneration:
 *   current rank from Riot -> match-history sync if the database says it is
 *   due -> champion aggregation -> render.
 *
 * Rank is never persisted: no snapshots, no LP history, no identity cache. The
 * database exists for exactly one thing, event match history, and everything
 * read from it is optional. If it is unreachable the standings still render,
 * just without champions.
 *
 * One failing participant never takes down the standings: they resolve to
 * `unavailable` and everyone else still renders.
 */
export async function getStandings(): Promise<Standings> {
  const unavailable: UnavailableParticipant[] = [];

  if (!hasRiotApiKey()) {
    const reason = "RIOT_API_KEY not configured";
    for (const config of participants) unavailable.push({ config, reason });

    return {
      players: sortPlayers(participants.map((c) => toUnavailablePlayer(c, reason))),
      unavailable,
    };
  }

  const requestsBefore = gateStats().admitted;
  const rateLimitedBefore = riotErrorCounts().rateLimited;

  // Resolved once per regeneration and reused for every icon on the page.
  const ddragonVersion = await getDataDragonVersion();

  // --- Phase 1: identity, rank and match ids, straight from Riot. ---
  const resolved = await mapWithConcurrency(
    participants,
    PARTICIPANT_CONCURRENCY,
    async (config): Promise<ResolvedParticipant | null> => {
      try {
        return await resolveParticipant(config, ddragonVersion);
      } catch (error) {
        unavailable.push({ config, reason: describe(error) });
        return null;
      }
    },
  );

  const live = resolved.filter((entry): entry is ResolvedParticipant => entry !== null);

  // --- Phase 2: one coordinated match-history sync for the whole roster. ---
  const roster: RosterMatchIds[] = live.map((entry) => ({
    participantId: entry.config.id,
    eventMatchIds: entry.eventMatchIds,
    streakMatchIds: entry.streakMatchIds,
  }));

  const participantIdByPuuid = new Map(
    live.map((entry) => [entry.puuid, entry.config.id]),
  );

  const { outcomes, diagnostics } = await syncMatchHistory(roster, participantIdByPuuid);

  // --- Phase 3: champions, aggregated in Postgres from what is now stored. ---
  const [tallies, displayNames] = await Promise.all([
    findTopChampions(TOP_CHAMPION_COUNT),
    getChampionDisplayNames(ddragonVersion),
  ]);

  // --- Phase 4: compose. ---
  const byId = new Map(live.map((entry) => [entry.config.id, entry]));

  const players = participants.map((config): Player => {
    const entry = byId.get(config.id);
    if (!entry) {
      const failure = unavailable.find((item) => item.config.id === config.id);
      return toUnavailablePlayer(config, failure?.reason ?? "Unexpected error");
    }

    const topChampions: ChampionStat[] = (tallies.get(config.id) ?? []).map((tally) =>
      toChampionStat(tally, ddragonVersion, displayNames),
    );

    // Newest-first, and only results we can actually prove. A match with no
    // known outcome is left out rather than guessed at.
    const recentResults = entry.streakMatchIds.flatMap((matchId): MatchResult[] => {
      const won = outcomes.get(outcomeKey(config.id, matchId));
      return won === undefined ? [] : [won ? "W" : "L"];
    });

    return toPlayer(config, {
      entry: entry.entry,
      profileIcon: entry.profileIcon,
      recentResults,
      topChampions,
    });
  });

  logRefresh(
    diagnostics,
    gateStats().admitted - requestsBefore,
    riotErrorCounts().rateLimited - rateLimitedBefore,
  );

  return { players: sortPlayers(players), unavailable };
}
