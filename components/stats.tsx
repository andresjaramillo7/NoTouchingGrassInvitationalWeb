import {
  currentStreak,
  formatRiotId,
  formatWinRate,
  opggUrl,
  type MatchResult,
  type Player,
  type RankedPlayer,
} from "@/lib/ranks";

/** Stands in for a metric we genuinely do not have. */
export function NoValue({ label }: { label: string }) {
  return (
    <span className="font-mono text-[0.8125rem] text-muted/45">
      —<span className="sr-only">{label} unavailable</span>
    </span>
  );
}

const RESULT_BAR: Record<MatchResult, string> = {
  W: "bg-win",
  L: "bg-loss",
};

/**
 * Momentum at a glance: the last five games, oldest to newest.
 * A compact signal, deliberately not a chart.
 */
export function StreakBars({
  player,
  showLabel = false,
}: {
  player: RankedPlayer;
  showLabel?: boolean;
}) {
  const recent = player.recentResults.slice(0, 5).reverse();
  const streak = currentStreak(player);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-end gap-[3px]" aria-hidden>
        {recent.map((result, index) => (
          <span
            key={index}
            className={`h-3 w-[3px] rounded-[1px] ${RESULT_BAR[result]}`}
          />
        ))}
      </span>

      {showLabel && streak ? (
        <span
          className={`font-mono text-[0.6875rem] font-medium tabular-nums ${
            streak.result === "W" ? "text-win" : "text-loss"
          }`}
        >
          {streak.result}
          {streak.count}
          {streak.capped ? "+" : ""}
        </span>
      ) : null}

      <span className="sr-only">
        {streak
          ? `Current streak: ${streak.capped ? "at least " : ""}${streak.count} ${
              streak.result === "W" ? "wins" : "losses"
            }.`
          : "No recent games."}
      </span>
    </span>
  );
}

/** Wins and losses coloured separately: 168W 141L. */
export function WinLoss({
  player,
  className = "",
}: {
  player: RankedPlayer;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[0.8125rem] tabular-nums whitespace-nowrap ${className}`}
    >
      <span className="sr-only">Record: </span>
      <span className="text-win">{player.wins}W</span>
      <span className="text-loss"> {player.losses}L</span>
    </span>
  );
}

/** Win rate stays neutral by design — only W/L carries the colour. */
export function WinRate({ player }: { player: RankedPlayer }) {
  return (
    <span className="font-mono text-[0.8125rem] tabular-nums text-ink/85">
      <span className="sr-only">Win rate: </span>
      {formatWinRate(player)}
    </span>
  );
}

export function OpggLink({ player }: { player: Player }) {
  return (
    <a
      href={opggUrl(player)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`OP.GG profile for ${formatRiotId(player)}`}
      className="inline-flex items-center rounded border border-line px-2 py-1 font-mono text-[0.625rem] tracking-[0.1em] text-muted/80 uppercase transition-colors hover:border-muted/50 hover:text-ink"
    >
      OP.GG
    </a>
  );
}

/**
 * Player identity. Falls back to a monogram when Riot supplies no profile
 * icon URL.
 */
export function ProfileIcon({
  player,
  className = "size-8",
}: {
  player: Player;
  className?: string;
}) {
  if (player.profileIcon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.profileIcon}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-1 ring-line ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-elevated font-mono text-[0.6875rem] text-muted/70 ring-1 ring-line ${className}`}
    >
      {player.gameName.charAt(0).toUpperCase()}
    </span>
  );
}
