import { ChampionStrip } from "@/components/champion-strip";
import { RankEmblem } from "@/components/rank-emblem";
import { PositionMarker } from "@/components/position-marker";
import { RoleIcon } from "@/components/role-icon";
import { TwitchBadge } from "@/components/twitch-badge";
import {
  OpggLink,
  ProfileIcon,
  StreakBars,
  WinLoss,
  WinRate,
} from "@/components/stats";
import {
  TIER_ACCENT,
  formatRank,
  formatRiotId,
  type RankedPlayer,
} from "@/lib/ranks";

const PODIUM_RULE = ["bg-gold/70", "bg-silver/60", "bg-bronze/70"] as const;

const LABEL =
  "font-mono text-[0.625rem] whitespace-nowrap uppercase tracking-[0.12em] text-muted/60";

function Card({
  player,
  position,
}: {
  player: RankedPlayer;
  position: number;
}) {
  const rule = PODIUM_RULE[position - 1] ?? PODIUM_RULE[2];
  const isFirst = position === 1;

  return (
    <article className="relative rounded-lg border border-line bg-surface p-4 md:p-3 lg:p-5 xl:p-6">
      <span aria-hidden className={`absolute inset-x-px top-0 h-px rounded-t-lg ${rule}`} />

      {/* Player leads — identity is the first thing read. */}
      <div className="flex min-w-0 items-center gap-2.5 md:gap-1.5 lg:gap-2.5">
        <ProfileIcon
          player={player}
          className="size-9 md:size-6 lg:size-9"
        />
        <p
          className={`min-w-0 flex-1 truncate text-[0.875rem] md:text-[0.75rem] lg:text-[0.9375rem] ${
            isFirst ? "font-medium text-ink" : "text-ink/90"
          }`}
        >
          {formatRiotId(player)}
        </p>
        <TwitchBadge
          player={player}
          className="h-4 w-auto md:h-[13px] lg:h-4"
        />
        {player.role ? (
          <RoleIcon role={player.role} className="size-5 md:size-[14px] lg:size-5" />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <RankEmblem
          player={player}
          size={isFirst ? 84 : 74}
          className={
            isFirst
              ? "size-[68px] lg:size-[84px]"
              : "size-[62px] lg:size-[74px]"
          }
          priority
        />

        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2">
            <PositionMarker position={position} ranked />
            <span
              className="truncate font-mono text-[0.6875rem] font-medium tracking-[0.06em]"
              style={{ color: TIER_ACCENT[player.tier] }}
            >
              {formatRank(player)}
            </span>
          </p>

          <p
            className={`mt-1 font-mono font-medium tabular-nums ${
              isFirst ? "text-[1.75rem]" : "text-2xl"
            }`}
          >
            {player.leaguePoints}
            <span className="ml-1.5 font-mono text-xs text-muted">LP</span>
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-line pt-3.5 lg:gap-y-0">
        <div className="min-w-0">
          <dt className={LABEL}>W / L</dt>
          <dd className="mt-1">
            <WinLoss player={player} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={LABEL}>WR</dt>
          <dd className="mt-1">
            <WinRate player={player} />
          </dd>
        </div>
      </dl>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3.5">
        <StreakBars player={player} showLabel />
        <ChampionStrip champions={player.topChampions} size="sm" />
        <OpggLink player={player} />
      </div>
    </article>
  );
}

/** The podium, rendered inside the standings section — not a section of its own. */
export function TopThreeCards({ players }: { players: RankedPlayer[] }) {
  return (
    <div
      className={`grid gap-4 ${
        players.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"
      }`}
    >
      {players.map((player, index) => (
        <Card key={player.id} player={player} position={index + 1} />
      ))}
    </div>
  );
}
