import { RankBadge } from "@/components/rank-badge";
import { PositionMarker } from "@/components/position-marker";
import { RoleIcon } from "@/components/role-icon";
import { TwitchBadge } from "@/components/twitch-badge";
import {
  NoValue,
  OpggLink,
  ProfileIcon,
  StreakBars,
  WinLoss,
  WinRate,
} from "@/components/stats";
import { formatRiotId, isRanked, type Player } from "@/lib/ranks";

/**
 * Shared column template so the header and the rows stay aligned.
 *
 * Columns are disclosed progressively rather than scrolled sideways:
 *   md  — pos, player, rank, LP, W/L, WR, OP.GG                   (7)
 *   lg  — + form, LP swing                                        (9)
 *   xl  — + role                                                  (10)
 *
 * Role is the last thing added and the first thing dropped: player and rank
 * information never yields to it. The optional cells use `hidden`, so they
 * leave grid flow entirely and the visible child count always matches the
 * active template.
 */
/**
 * Shared column template so the header and the rows stay aligned.
 *
 * Columns are disclosed progressively rather than scrolled sideways:
 *   md  - #, player, rank, LP, W/L, WR, STATS            (7)
 *   lg  - + streak                                       (8)
 *   xl  - + role                                         (9)
 *
 * Role is the last thing added and the first thing dropped: player and rank
 * information never yields to it. The optional cells use `hidden`, so they
 * leave grid flow entirely and the visible child count always matches the
 * active template.
 */
export const ROW_GRID = [
  "gap-2.5 grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_3rem_4.75rem_3.5rem_3rem]",
  "lg:gap-3 lg:grid-cols-[2.25rem_minmax(0,1fr)_9.5rem_3.75rem_5.75rem_4rem_5rem_3.25rem]",
  "xl:gap-4 xl:grid-cols-[2.75rem_minmax(0,1fr)_4rem_11rem_4rem_6.5rem_4.75rem_6rem_3.75rem]",
].join(" ");

/** Muted podium accents: an accent numeral and a 1px edge, nothing filled. */
const PODIUM = [
  { text: "text-gold", edge: "border-l-gold/60" },
  { text: "text-silver", edge: "border-l-silver/70" },
  { text: "text-bronze", edge: "border-l-bronze/60" },
] as const;

export function PlayerRow({
  player,
  position,
}: {
  player: Player;
  position: number;
}) {
  const riotId = formatRiotId(player);
  const ranked = isRanked(player);
  const podium = ranked ? PODIUM[position - 1] : undefined;

  // First place alone gets a contrast lift; the rest stay level.
  const nameClass = `truncate text-[0.9375rem] ${
    position === 1 ? "font-medium text-ink" : "text-ink/85"
  }`;

  return (
    <li
      className={`border-l transition-colors hover:bg-elevated ${
        podium ? podium.edge : "border-l-transparent"
      }`}
    >
      {/* Desktop — padding trimmed so the emblem sets the row height. */}
      <div
        className={`hidden items-center px-4 py-2 md:grid ${ROW_GRID}`}
      >
        <span className="flex items-center">
          <PositionMarker position={position} ranked={ranked} />
        </span>

        <span className="flex min-w-0 items-center gap-2 lg:gap-2.5">
          <ProfileIcon player={player} className="size-7 lg:size-8" />
          <span className={nameClass}>{riotId}</span>
          <TwitchBadge player={player} className="h-4 w-auto" />
        </span>

        <span className="hidden items-center justify-center xl:flex">
          {player.role ? (
            <RoleIcon role={player.role} className="size-[22px]" />
          ) : (
            <span className="font-mono text-[0.8125rem] text-muted/35">
              —<span className="sr-only">Role not assigned</span>
            </span>
          )}
        </span>

        <RankBadge player={player} />

        <span className="text-right font-mono text-[0.8125rem] tabular-nums">
          {ranked ? (
            <>
              <span className="sr-only">League points: </span>
              <span className="text-ink/90">{player.leaguePoints}</span>
            </>
          ) : (
            <NoValue label="League points" />
          )}
        </span>

        <span className="text-right">
          {ranked ? <WinLoss player={player} /> : <NoValue label="Record" />}
        </span>

        <span className="text-right">
          {ranked ? <WinRate player={player} /> : <NoValue label="Win rate" />}
        </span>

        <span className="hidden justify-center lg:flex">
          {ranked ? <StreakBars player={player} /> : <NoValue label="Streak" />}
        </span>

        <span className="flex justify-end">
          <OpggLink player={player} />
        </span>
      </div>

      {/* Mobile */}
      <div className="px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex w-5 shrink-0 items-center">
            <PositionMarker position={position} ranked={ranked} />
          </span>
          <ProfileIcon player={player} className="size-[30px]" />
          <span className={`min-w-0 flex-1 ${nameClass}`}>{riotId}</span>
          <TwitchBadge player={player} className="h-[15px] w-auto" />
        </div>

        {/* Role and OP.GG sit on the rank line: at 320px the Riot ID needs the
            whole identity line to itself. */}
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <RankBadge player={player} showLp />
          <span className="flex shrink-0 items-center gap-2">
            {/* Below 360px the rank label needs this space more than the
                role icon does; the podium cards still show it. */}
            {player.role ? (
              <RoleIcon
                role={player.role}
                className="hidden size-[18px] min-[360px]:block"
              />
            ) : null}
            <OpggLink player={player} />
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-0 min-[360px]:pl-[2.375rem]">
          {ranked ? (
            <>
              <WinLoss player={player} />
              <WinRate player={player} />
              <StreakBars player={player} showLabel />
            </>
          ) : (
            <span className="font-mono text-xs text-muted/45">
              {player.status === "unranked"
                ? "No ranked Solo Queue games yet"
                : "Riot data unavailable"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
