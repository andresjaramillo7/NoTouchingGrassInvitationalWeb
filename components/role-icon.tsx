import type { Role } from "@/lib/ranks";

/**
 * Official League client position icons, taken from CommunityDragon's mirror of
 * `rcp-fe-lol-champ-select/global/default/svg/position-*.svg` and served
 * locally. The artwork keeps Riot's own gold; only a dangling `glow.css`
 * stylesheet reference was stripped.
 */
const ROLE_ASSET: Record<Role, string> = {
  TOP: "/roles/top.svg",
  JUNGLE: "/roles/jungle.svg",
  MID: "/roles/mid.svg",
  ADC: "/roles/adc.svg",
  SUPPORT: "/roles/support.svg",
};

/** Full names, used for the accessible label — the table shows the icon only. */
const ROLE_NAME: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "ADC",
  SUPPORT: "Support",
};

/**
 * `size` sets the intrinsic width/height; `className` controls the rendered
 * box so the icon can shrink at narrow breakpoints.
 */
export function RoleIcon({
  role,
  size = 20,
  className = "size-5",
}: {
  role: Role;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ROLE_ASSET[role]}
      alt={`${ROLE_NAME[role]} role`}
      title={ROLE_NAME[role]}
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
    />
  );
}
