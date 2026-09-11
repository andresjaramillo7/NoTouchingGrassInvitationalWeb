import { participants, type ParticipantConfig } from "@/data/participants";
import { sortPlayers, type Player } from "@/lib/ranks";
import { getAccountByRiotId } from "@/lib/riot/account";
import { RiotApiError, hasRiotApiKey } from "@/lib/riot/client";
import { getDataDragonVersion, profileIconUrl } from "@/lib/riot/ddragon";
import { toPlayer, toUnavailablePlayer } from "@/lib/riot/mapper";
import { getRecentSoloResults } from "@/lib/riot/matches";
import { getSoloQueueEntry } from "@/lib/riot/ranked";
import { getSummonerByPuuid } from "@/lib/riot/summoner";

/**
 * How many participants resolve at once.
 *
 * The global gate in lib/riot/gate.ts is what actually protects the rate
 * limit; this just keeps the fan-out tidy for eight players.
 */
const PARTICIPANT_CONCURRENCY = 2;

export type UnavailableParticipant = {
  config: ParticipantConfig;
  reason: string;
};

export type Standings = {
  players: Player[];
  unavailable: UnavailableParticipant[];
};

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Resolves one participant straight from Riot.
 *
 * Request budget: 1 Account-V1 + 1 Summoner-V4 + 1 League-V4 +
 * 1 Match-V5 id list + up to 5 Match-V5 details = up to 9 authenticated calls.
 * Everything after the PUUID runs concurrently, since none of it depends on
 * the others.
 */
async function resolveRiotPlayer(
  config: ParticipantConfig,
  ddragonVersion: string,
): Promise<Player> {
  const account = await getAccountByRiotId(config.gameName, config.tagLine);

  const [summoner, entry, recentResults] = await Promise.all([
    getSummonerByPuuid(account.puuid),
    getSoloQueueEntry(account.puuid),
    getRecentSoloResults(account.puuid),
  ]);

  return toPlayer(config, {
    entry,
    profileIcon: profileIconUrl(ddragonVersion, summoner.profileIconId),
    recentResults,
  });
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

/**
 * Builds the leaderboard live from Riot.
 *
 * There is no database and no bespoke cache: the page's ISR window is the
 * only caching layer, so a regeneration simply asks Riot again. For eight
 * participants that is a handful of requests every ten minutes, and the
 * simplicity is worth more than the saved calls.
 *
 * One failing participant never takes down the standings: they resolve to
 * `unavailable` and everyone else still renders.
 */
export async function getStandings(): Promise<Standings> {
  const unavailable: UnavailableParticipant[] = [];

  if (!hasRiotApiKey()) {
    for (const config of participants) {
      unavailable.push({ config, reason: "RIOT_API_KEY not configured" });
    }
    return {
      players: sortPlayers(
        participants.map((c) => toUnavailablePlayer(c, "RIOT_API_KEY not configured")),
      ),
      unavailable,
    };
  }

  // Resolved once per regeneration and reused for every profile icon.
  const ddragonVersion = await getDataDragonVersion();

  const players = await mapWithConcurrency(
    participants,
    PARTICIPANT_CONCURRENCY,
    async (config): Promise<Player> => {
      try {
        return await resolveRiotPlayer(config, ddragonVersion);
      } catch (error) {
        const reason = describe(error);
        unavailable.push({ config, reason });
        // The participant still appears, clearly marked, rather than silently
        // vanishing from the standings.
        return toUnavailablePlayer(config, reason);
      }
    },
  );

  return { players: sortPlayers(players), unavailable };
}
