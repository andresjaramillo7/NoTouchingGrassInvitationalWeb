import { describeChampion, formatChampionWinRate, type ChampionStat } from "@/lib/champions";

/**
 * Most played DURING NTGI — left to right, most played first.
 *
 * Everything rendered here comes from data already on the page. Hovering,
 * focusing or reading a tooltip performs no request of any kind: there is no
 * client JavaScript, no tooltip library and no per-hover endpoint. The panel
 * is a sibling element revealed by CSS.
 *
 * An empty list renders nothing at all. A player with no stored event matches
 * gets no icons and no placeholder — inventing one would claim match history
 * we do not have.
 */

const SIZE = {
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
} as const;

export type ChampionStripSize = keyof typeof SIZE;

function Champion({
  champion,
  size,
  align,
}: {
  champion: ChampionStat;
  size: ChampionStripSize;
  align: "left" | "right";
}) {
  return (
    <span
      tabIndex={0}
      // The accessible name carries the whole tooltip, so keyboard and screen
      // reader users get the same numbers sighted users get on hover.
      aria-label={describeChampion(champion)}
      className="group relative inline-flex shrink-0 rounded-[3px] outline-none ring-offset-0 focus-visible:ring-1 focus-visible:ring-muted/70"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={champion.iconUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${SIZE[size]} rounded-[3px] object-cover ring-1 ring-line transition-colors group-hover:ring-muted/60`}
      />

      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-[calc(100%+6px)] z-20 hidden w-max origin-bottom scale-95 rounded border border-line bg-elevated px-2.5 py-1.5 opacity-0 shadow-lg transition-[opacity,transform] duration-100 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 lg:block ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        <span className="block font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-ink uppercase">
          {champion.displayName}
        </span>
        <span className="mt-1 block font-mono text-[0.6875rem] tabular-nums text-muted">
          {champion.games} {champion.games === 1 ? "game" : "games"}
        </span>
        <span className="block font-mono text-[0.6875rem] tabular-nums">
          <span className="text-win">{champion.wins}W</span>
          <span className="text-muted/50"> · </span>
          <span className="text-loss">{champion.losses}L</span>
        </span>
        <span className="block font-mono text-[0.6875rem] tabular-nums text-ink/85">
          {formatChampionWinRate(champion)} WR
        </span>
      </span>
    </span>
  );
}

export function ChampionStrip({
  champions,
  size = "md",
  align = "left",
  className = "",
}: {
  champions: readonly ChampionStat[];
  size?: ChampionStripSize;
  /** Which edge the tooltip is anchored to, so it never leaves the viewport. */
  align?: "left" | "right";
  className?: string;
}) {
  if (champions.length === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      role="group"
      aria-label="Most played champions during NTGI"
    >
      {champions.map((champion) => (
        <Champion
          key={champion.championId}
          champion={champion}
          size={size}
          align={align}
        />
      ))}
    </span>
  );
}
