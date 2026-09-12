/**
 * A participant's most-played champions DURING NTGI.
 *
 * Not lifetime mastery, not their whole Riot account history, not "the last
 * ten games". Every number here comes from the Ranked Solo/Duo matches we have
 * persisted since EVENT_START_AT, and from nothing else.
 */
import type { ChampionTally } from "@/lib/db/matches";
import { championIconUrl } from "@/lib/riot/ddragon";

export type ChampionStat = {
  championId: number;
  /** Data Dragon id, e.g. "MonkeyKing". Used for the icon. */
  championName: string;
  /** What the champion is actually called, e.g. "Wukong". */
  displayName: string;
  iconUrl: string;
  games: number;
  wins: number;
  losses: number;
  /** Percentage, 0–100. */
  winRate: number;
};

export function formatChampionWinRate(champion: ChampionStat): string {
  return `${champion.winRate.toFixed(1)}%`;
}

/** "23 games · 14W · 9L · 60.9% WR", for screen readers and tooltips. */
export function describeChampion(champion: ChampionStat): string {
  return `${champion.displayName}: ${champion.games} ${
    champion.games === 1 ? "game" : "games"
  }, ${champion.wins} wins, ${champion.losses} losses, ${formatChampionWinRate(
    champion,
  )} win rate during NTGI.`;
}

/** Turns a database tally into something the UI can render directly. */
export function toChampionStat(
  tally: ChampionTally,
  ddragonVersion: string,
  displayNames: ReadonlyMap<string, string>,
): ChampionStat {
  const losses = tally.games - tally.wins;

  return {
    championId: tally.championId,
    championName: tally.championName,
    displayName: displayNames.get(tally.championName) ?? tally.championName,
    iconUrl: championIconUrl(ddragonVersion, tally.championName),
    games: tally.games,
    wins: tally.wins,
    losses,
    winRate: tally.games === 0 ? 0 : (tally.wins / tally.games) * 100,
  };
}
