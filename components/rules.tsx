import type { ReactNode } from "react";

import { SectionHeading } from "@/components/section-heading";

/**
 * Small monochrome line glyphs. They inherit `currentColor` from the rule
 * title row, which keeps them in the muted/moss palette — never the vivid
 * win/loss colours, which mean something specific elsewhere.
 */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 18 18"
      width={16}
      height={16}
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const RULES = [
  {
    number: "01",
    title: "One Account",
    body: "One registered Riot account per participant.",
    glyph: (
      <Glyph>
        <circle cx="9" cy="6.2" r="3.1" />
        <path d="M3.4 15.2a5.6 5.6 0 0 1 11.2 0" />
      </Glyph>
    ),
  },
  {
    number: "02",
    title: "NA Only",
    body: "All accounts must be on the NA region.",
    glyph: (
      <Glyph>
        <circle cx="9" cy="9" r="6.6" />
        <path d="M2.4 9h13.2" />
        <ellipse cx="9" cy="9" rx="3" ry="6.6" />
      </Glyph>
    ),
  },
  {
    number: "03",
    title: "Solo Queue",
    body: "Ranked Solo/Duo queue only.",
    glyph: (
      <Glyph>
        <path d="M3.2 15.2V9.6M9 15.2V3.4M14.8 15.2v-8.4" />
      </Glyph>
    ),
  },
  {
    number: "04",
    title: "No Duo",
    body: "All challenge games must be played solo.",
    glyph: (
      <Glyph>
        <circle cx="6" cy="9" r="3" />
        <circle cx="13.4" cy="9" r="3" />
        <path d="M3.2 15.4 15.2 2.8" />
      </Glyph>
    ),
  },
  {
    number: "05",
    title: "Final Rank",
    body: "Only your rank at the end of the event matters. Peak rank counts for nothing.",
    glyph: (
      <Glyph>
        <path d="M4.6 15.6V2.6" />
        <path d="M4.6 3.4h9.2l-2 3 2 3H4.6" />
      </Glyph>
    ),
  },
  {
    number: "06",
    title: "Dec 31",
    body: "The challenge ends December 31, 2026.",
    glyph: (
      <Glyph>
        <rect x="2.6" y="3.8" width="12.8" height="11.4" rx="1.6" />
        <path d="M2.6 7.6h12.8M6.2 2.4v2.6M11.8 2.4v2.6" />
      </Glyph>
    ),
  },
] as const;

export function Rules() {
  return (
    <section
      aria-labelledby="rules-title"
      className="px-5 py-10 sm:px-8 sm:py-12 xl:px-10"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <SectionHeading id="rules-title" number="03" title="Rules" />

        <dl className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map((rule) => (
            <div key={rule.title}>
              <dt className="eyebrow flex items-center gap-2 text-moss">
                {rule.glyph}
                <span className="text-muted/40">{rule.number}</span>
                <span className="text-ink">{rule.title}</span>
              </dt>
              <dd className="mt-2 pl-6 text-[0.8125rem] leading-relaxed text-muted">
                {rule.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
