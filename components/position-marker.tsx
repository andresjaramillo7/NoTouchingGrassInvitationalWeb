/**
 * The position cell for the standings and the podium cards.
 *
 * Ranks 1-3 render a crown / silver medal / bronze medal; every other rank
 * renders its numeral. All variants occupy the same box so the player column
 * stays aligned.
 */

const MARKER_LABEL: Record<number, string> = {
  1: "Current leader",
  2: "Second place",
  3: "Third place",
};

function Crown() {
  return (
    <svg
      viewBox="0 0 24 21"
      width={19}
      height={17}
      aria-hidden
      focusable="false"
      className="text-crown"
      style={{ filter: "drop-shadow(0 0 3px rgb(245 200 81 / 0.45))" }}
    >
      <path
        d="M1.6 4.9 6.9 10 12 1.4 17.1 10l5.3-5.1-1.9 11.4H3.5L1.6 4.9Z"
        fill="currentColor"
      />
      <rect x="3.9" y="17.9" width="16.2" height="2.4" rx="0.7" fill="currentColor" />
    </svg>
  );
}

/** Ribboned medal disc. No glow — only the leader gets that. */
function Medal({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        d="M7.4 1.6 4.6 3.2l4 7 2.8-1.6-4-7Zm9.2 0-4 7 2.8 1.6 4-7-2.8-1.6Z"
        fill="currentColor"
        fillOpacity={0.55}
      />
      <circle cx="12" cy="15.6" r="6.6" fill="currentColor" fillOpacity={0.9} />
      <circle cx="12" cy="15.6" r="3.3" fill="#0b0d0b" fillOpacity={0.35} />
    </svg>
  );
}

export function PositionMarker({
  position,
  ranked,
}: {
  position: number;
  /** Only a ranked player can hold a podium place. */
  ranked: boolean;
}) {
  const label = MARKER_LABEL[position];

  if (ranked && (position === 1 || position === 2 || position === 3)) {
    return (
      <span className="inline-flex items-center">
        {position === 1 ? (
          <Crown />
        ) : (
          <Medal
            className={
              position === 2 ? "text-medal-silver" : "text-medal-bronze"
            }
          />
        )}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span className="font-mono text-[0.8125rem] tabular-nums text-muted/60">
      {String(position).padStart(2, "0")}
    </span>
  );
}
