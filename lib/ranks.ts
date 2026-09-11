/**
 * Rank model + ordering for the No Touching Grass Invitational.
 *
 * Standings are decided by a player's FINAL Ranked Solo/Duo rank only.
 * There is no MMR, ELO or composite score here — the numeric indices below
 * exist purely to make ranks comparable and are never rendered.
 */

export const TIERS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
] as const;

export type Tier = (typeof TIERS)[number];

/** Tiers that have no divisions — LP is compared directly within the tier. */
export const APEX_TIERS = ["MASTER", "GRANDMASTER", "CHALLENGER"] as const;

export type ApexTier = (typeof APEX_TIERS)[number];
export type DivisionTier = Exclude<Tier, ApexTier>;

export const DIVISIONS = ["IV", "III", "II", "I"] as const;

export type Division = (typeof DIVISIONS)[number];

/** Outcome of a single ranked game. */
export type MatchResult = "W" | "L";

/** The five Summoner's Rift positions. */
export const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;

export type Role = (typeof ROLES)[number];

/**
 * Where each field will come from once the Riot API is wired up:
 *
 *   MANUAL  — event metadata we maintain by hand, never inferred.
 *   RIOT    — fetched from the Riot API.
 *   DERIVED — computed from RIOT data (see winRate / currentStreak below).
 */
type PlayerIdentity = {
  // --- MANUAL: event metadata ---
  id: string;
  displayName: string;
  /**
   * Assigned by the organiser, never inferred from match history.
   * `null` means "not assigned yet" — deliberately not a Role member, so an
   * unassigned player can never be mistaken for a real position.
   */
  role: Role | null;
  /** Supplied by the organiser. Never discovered or inferred. */
  twitchUsername?: string | null;
  /** Optional explicit channel URL; derived from the username when absent. */
  twitchUrl?: string | null;

  // --- TEMPORARY FRONTEND STATE ---
  /**
   * Manually set. A Twitch URL alone cannot prove a channel is live, and we
   * do not call Twitch, so this stays organiser-controlled. Ignored entirely
   * when the player has no channel.
   */
  isLive?: boolean;

  // --- RIOT ---
  gameName: string;
  tagLine: string;
  /** Riot profile icon URL, built from profileIconId. `null` when unknown. */
  profileIcon: string | null;
};

/** Apex tiers carry no division; the union makes the invalid case unbuildable. */
type TierPlacement =
  | { tier: DivisionTier; division: Division }
  | { tier: ApexTier; division: null };

type RankedStats = {
  status: "ranked";
  leaguePoints: number;
  wins: number;
  losses: number;
  /** Most recent games first, matching the order Riot returns them. */
  recentResults: MatchResult[];
};

/**
 * A participant's competitive state.
 *
 * `unranked` and `unavailable` deliberately carry no tier, LP or W/L: there is
 * no honest value for those, and inventing one (IRON IV, 0 LP) would both lie
 * about the player and let them outrank a genuine Iron IV participant.
 */
export type Player =
  | (PlayerIdentity & TierPlacement & RankedStats)
  | (PlayerIdentity & { status: "unranked" })
  | (PlayerIdentity & { status: "unavailable"; reason?: string });

/** A player we actually have ranked data for. */
export type RankedPlayer = Extract<Player, { status: "ranked" }>;

export function isRanked(player: Player): player is RankedPlayer {
  return player.status === "ranked";
}

/** Win rate as a percentage (0–100). Returns 0 for a player with no games. */
export function winRate(player: RankedPlayer): number {
  const games = player.wins + player.losses;
  if (games === 0) return 0;
  return (player.wins / games) * 100;
}

export function formatWinRate(player: RankedPlayer): string {
  return `${winRate(player).toFixed(1)}%`;
}

export function formatRiotId(player: Player): string {
  return `${player.gameName}#${player.tagLine}`;
}

/**
 * The active win or loss streak, or `null` for a player with no games.
 *
 * `recentResults` is newest-first, so the streak is counted from index 0.
 * When every fetched game shares one result the true streak may run further
 * back than we looked, so `capped` is set and the UI renders e.g. "W5+"
 * rather than claiming an exact length we cannot prove.
 */
export function currentStreak(
  player: Player,
): { result: MatchResult; count: number; capped: boolean } | null {
  if (!isRanked(player)) return null;

  const [latest] = player.recentResults;
  if (!latest) return null;

  let count = 0;
  for (const result of player.recentResults) {
    if (result !== latest) break;
    count += 1;
  }

  return { result: latest, count, capped: count === player.recentResults.length };
}

/**
 * Derived rather than stored: it is a pure function of the Riot ID, so it
 * cannot drift out of sync and needs no upkeep when real data arrives.
 */
export function opggUrl(player: Player): string {
  const riotId = `${player.gameName}-${player.tagLine}`;
  return `https://op.gg/lol/summoners/na/${encodeURIComponent(riotId)}`;
}

/**
 * A player's Twitch channel, or `null` when the organiser has not set one.
 * Live status is deliberately not part of this — see `isLive`.
 */
export function twitchChannel(
  player: Player,
): { url: string; username: string } | null {
  const { twitchUsername, twitchUrl } = player;
  if (!twitchUsername && !twitchUrl) return null;

  const url =
    twitchUrl ?? `https://twitch.tv/${encodeURIComponent(twitchUsername ?? "")}`;
  const username =
    twitchUsername ?? url.replace(/^https?:\/\/(www\.)?twitch\.tv\//, "");

  return { url, username };
}

/** True only when a channel exists — `isLive` can never stand on its own. */
export function isStreamingLive(player: Player): boolean {
  return Boolean(player.isLive) && twitchChannel(player) !== null;
}

/** "DIAMOND II" for divisioned tiers, "MASTER" for apex, else the state. */
export function formatRank(player: Player): string {
  if (player.status === "unranked") return "UNRANKED";
  if (player.status === "unavailable") return "UNAVAILABLE";

  return player.division === null
    ? player.tier
    : `${player.tier} ${player.division}`;
}

// --- internal comparison helpers (never surfaced in the UI) ---

function tierIndex(player: RankedPlayer): number {
  return TIERS.indexOf(player.tier);
}

function divisionIndex(player: RankedPlayer): number {
  // Apex tiers share a single value, so this step is a no-op between them.
  return player.division === null
    ? DIVISIONS.length
    : DIVISIONS.indexOf(player.division);
}

/** Ranked participants always precede unranked, which precede unavailable. */
const STATUS_ORDER: Record<Player["status"], number> = {
  ranked: 0,
  unranked: 1,
  unavailable: 2,
};

/**
 * Comparator ordering the strongest rank first:
 * Tier -> Division -> League Points -> Win Rate.
 *
 * Players without ranked data sort below every ranked player rather than
 * being given a fabricated placement.
 */
export function compareRank(a: Player, b: Player): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (byStatus !== 0) return byStatus;

  if (!isRanked(a) || !isRanked(b)) return 0;

  return (
    tierIndex(b) - tierIndex(a) ||
    divisionIndex(b) - divisionIndex(a) ||
    b.leaguePoints - a.leaguePoints ||
    winRate(b) - winRate(a)
  );
}

/** Returns a new array sorted best-first. Does not mutate the input. */
export function sortPlayers(players: readonly Player[]): Player[] {
  return [...players].sort(compareRank);
}

/**
 * Muted, desaturated tier accents. Used only for small details —
 * a dot or a rank label — never as a row or block fill.
 */
export const TIER_ACCENT: Record<Tier, string> = {
  IRON: "#8E8A85",
  BRONZE: "#A8846A",
  SILVER: "#ADB4B7",
  GOLD: "#C0A468",
  PLATINUM: "#74A9A4",
  EMERALD: "#6BA57C",
  DIAMOND: "#8AA2D0",
  MASTER: "#A98BC4",
  GRANDMASTER: "#C0736E",
  CHALLENGER: "#C4AC72",
};
