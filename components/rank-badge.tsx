import { RankEmblem } from "@/components/rank-emblem";
import { TIER_ACCENT, formatRank, isRanked, type Player } from "@/lib/ranks";

/** Emblem plus tier label — the game-native read of a player's rank. */
export function RankBadge({
  player,
  showLp = false,
  className = "size-[30px]",
}: {
  player: Player;
  showLp?: boolean;
  className?: string;
}) {
  if (!isRanked(player)) {
    return (
      <span className="inline-flex min-w-0 items-center">
        <span className="truncate font-mono text-xs tracking-[0.06em] text-muted/60">
          {formatRank(player)}
        </span>
      </span>
    );
  }

  const accent = TIER_ACCENT[player.tier];

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <RankEmblem player={player} size={30} className={className} />
      <span
        className="truncate font-mono text-xs font-medium tracking-[0.06em]"
        style={{ color: accent }}
      >
        {formatRank(player)}
      </span>
      {showLp ? (
        <span className="font-mono text-xs tabular-nums whitespace-nowrap text-muted/70">
          · {player.leaguePoints} LP
        </span>
      ) : null}
    </span>
  );
}
