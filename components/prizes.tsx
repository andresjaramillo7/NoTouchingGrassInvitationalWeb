import { SectionHeading } from "@/components/section-heading";

/**
 * A tiny faceted gem, tinted per rarity. Deliberately abstract: the prize is a
 * skin *tier*, so real splash art would imply a specific skin nobody has picked.
 */
function RarityGem({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 16 18"
      width={15}
      height={17}
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        d="M8 1.2 14.6 8 8 16.8 1.4 8 8 1.2Z"
        fill="currentColor"
        fillOpacity={0.16}
        stroke="currentColor"
        strokeOpacity={0.8}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path
        d="M1.9 8h12.2M8 1.2 5.6 8 8 16.8M8 1.2 10.4 8 8 16.8"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.42}
        strokeWidth={0.9}
      />
    </svg>
  );
}

const PRIZES = [
  {
    position: "01",
    label: "Legendary Skin",
    note: "Winner",
    rarity: "Legendary",
    accent: "text-gold",
    rule: "bg-gold/50",
  },
  {
    position: "02",
    label: "Epic Skin",
    note: "Runner-up",
    rarity: "Epic",
    accent: "text-epic",
    rule: "bg-epic/40",
  },
  {
    position: "03",
    label: "Epic Skin",
    note: "Third place",
    rarity: "Epic",
    accent: "text-epic",
    rule: "bg-epic/40",
  },
] as const;

export function Prizes() {
  return (
    <section
      aria-labelledby="prizes-title"
      className="border-b border-line px-5 py-10 sm:px-8 sm:py-12 xl:px-10"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <SectionHeading id="prizes-title" number="02" title="Prizes" />

        <ul className="mt-8 grid divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {PRIZES.map((prize, index) => (
            <li
              key={prize.position}
              className="relative py-5 sm:px-8 sm:py-6 sm:first:pl-0 sm:last:pr-0"
            >
              <span
                aria-hidden
                className={`absolute top-0 left-0 h-px w-10 sm:left-8 sm:first:left-0 ${prize.rule}`}
              />

              <div className="flex items-center gap-2.5">
                <span
                  className={`font-mono text-xs tabular-nums ${
                    index === 0 ? "text-gold" : "text-muted/60"
                  }`}
                >
                  {prize.position}
                </span>
                <RarityGem className={prize.accent} />
                <span
                  className={`font-mono text-[0.625rem] tracking-[0.14em] uppercase ${prize.accent}`}
                >
                  {prize.rarity}
                </span>
              </div>

              <p
                className={`mt-3 tracking-[0.01em] uppercase ${
                  index === 0
                    ? "text-xl font-semibold text-ink lg:text-2xl"
                    : "text-lg text-ink/75"
                }`}
              >
                {prize.label}
              </p>
              <p className="eyebrow mt-2 text-muted/60">{prize.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
