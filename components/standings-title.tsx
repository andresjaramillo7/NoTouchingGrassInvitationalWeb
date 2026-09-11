"use client";

import { useEffect, useState } from "react";

import { TICK_MS, getEventStatus } from "@/lib/event";

/**
 * The page is statically rendered, so the deadline has to be evaluated on the
 * client — otherwise the title would stay frozen at whatever was true when the
 * site was last built. Renders text only; SectionHeading owns the heading.
 */
export function StandingsTitle() {
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const sync = () => setFinished(getEventStatus().finished);

    sync();
    const timer = setInterval(sync, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return <>{finished ? "Final Standings" : "Standings"}</>;
}
