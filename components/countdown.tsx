"use client";

import { useEffect, useState } from "react";

import { TICK_MS, getEventStatus, type EventStatus } from "@/lib/event";

const UNITS = ["Days", "Hrs", "Min", "Sec"] as const;

const LABEL =
  "mt-2 block font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted";

export function Countdown() {
  // Resolved on the client only, so the server render and first paint agree.
  const [status, setStatus] = useState<EventStatus | null>(null);

  useEffect(() => {
    const sync = () => setStatus(getEventStatus());

    sync();
    const timer = setInterval(sync, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (status?.finished) {
    return (
      <div className="shrink-0 lg:text-right">
        <p className="text-xl font-semibold tracking-[-0.01em] uppercase sm:text-2xl">
          Challenge Complete
        </p>
        <p className={LABEL}>Final standings locked.</p>
      </div>
    );
  }

  const cells = status
    ? [
        String(status.days),
        String(status.hours).padStart(2, "0"),
        String(status.minutes).padStart(2, "0"),
        String(status.seconds).padStart(2, "0"),
      ]
    : ["--", "--", "--", "--"];

  return (
    <div className="shrink-0">
      <span className="sr-only">Time remaining until December 31, 2026.</span>

      <div
        role="timer"
        aria-live="off"
        className="grid max-w-[22rem] grid-cols-4 gap-x-4 sm:gap-x-6"
      >
        {cells.map((value, index) => (
          <div key={UNITS[index]} className="text-left lg:text-right">
            <span className="block font-mono text-[1.625rem] leading-none font-medium tracking-[-0.04em] tabular-nums sm:text-[2rem]">
              {value}
            </span>
            <span className={LABEL}>{UNITS[index]}</span>
          </div>
        ))}
      </div>

      <p className="eyebrow mt-4 text-muted/45 lg:text-right">
        Until the grass can be touched again
      </p>
    </div>
  );
}
