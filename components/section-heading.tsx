import type { ReactNode } from "react";

/**
 * The page's recurring editorial device: a small numbered label, a hairline
 * that runs out to fill the line, and optional metadata at the far right.
 */
export function SectionHeading({
  id,
  number,
  title,
  meta,
}: {
  id: string;
  number: string;
  title: ReactNode;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <h2 id={id} className="eyebrow flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-moss">{number}</span>
        <span className="text-muted/40">/</span>
        <span className="font-medium text-ink">{title}</span>
      </h2>

      <span aria-hidden className="h-px flex-1 bg-line" />

      {meta ? (
        <span className="eyebrow whitespace-nowrap text-muted">{meta}</span>
      ) : null}
    </div>
  );
}
