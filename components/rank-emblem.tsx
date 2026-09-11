import Image from "next/image";

import { formatRank, type RankedPlayer, type Tier } from "@/lib/ranks";

/**
 * Official Riot ranked emblems, extracted from Riot's
 * `ranked-emblems-latest.zip` and served locally.
 *
 * The artwork is unmodified apart from downscaling 1000px -> 512px; the
 * emblems keep their real colours and are never recoloured or given effects.
 */
const EMBLEM: Record<Tier, string> = {
  IRON: "/ranks/iron.png",
  BRONZE: "/ranks/bronze.png",
  SILVER: "/ranks/silver.png",
  GOLD: "/ranks/gold.png",
  PLATINUM: "/ranks/platinum.png",
  EMERALD: "/ranks/emerald.png",
  DIAMOND: "/ranks/diamond.png",
  MASTER: "/ranks/master.png",
  GRANDMASTER: "/ranks/grandmaster.png",
  CHALLENGER: "/ranks/challenger.png",
};

/**
 * `size` is the largest px the emblem is ever drawn at, which drives the
 * requested srcset. `className` controls the actual rendered box, so the
 * emblem can shrink at narrow breakpoints without re-requesting an image.
 */
export function RankEmblem({
  player,
  size,
  className = "",
  priority = false,
}: {
  player: RankedPlayer;
  size: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={EMBLEM[player.tier]}
      alt={`${formatRank(player)} emblem`}
      width={size}
      height={size}
      sizes={`${size}px`}
      priority={priority}
      className={`shrink-0 select-none ${className}`}
    />
  );
}
