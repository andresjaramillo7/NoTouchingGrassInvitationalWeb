/**
 * The single source of truth for when the challenge starts and ends.
 *
 * Both boundaries are wall-clock times in a named IANA zone, not fixed UTC
 * offsets. Each is resolved to one absolute instant using the runtime's
 * timezone database, so every viewer — and every server — agrees on the same
 * moment no matter where they are.
 */

export const EVENT_TIME_ZONE = "America/Mexico_City";

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** September 8, 2026 at 00:00:00, local to EVENT_TIME_ZONE. */
const START_WALL_CLOCK: WallClock = {
  year: 2026,
  month: 9,
  day: 8,
  hour: 0,
  minute: 0,
  second: 0,
};

/** December 31, 2026 at 23:59:59, local to EVENT_TIME_ZONE. */
const DEADLINE_WALL_CLOCK: WallClock = {
  year: 2026,
  month: 12,
  day: 31,
  hour: 23,
  minute: 59,
  second: 59,
};

const zoneParts = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** How far EVENT_TIME_ZONE is ahead of UTC, in ms, at a given instant. */
function zoneOffsetAt(utcMs: number): number {
  const parts = zoneParts.formatToParts(new Date(utcMs));

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Missing "${type}" for ${EVENT_TIME_ZONE}`);
    return Number(part.value);
  };

  // Some engines format midnight as hour 24 rather than 0.
  const hour = read("hour") % 24;

  const wallAsIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second"),
  );

  return wallAsIfUtc - utcMs;
}

/**
 * Converts a wall-clock time in EVENT_TIME_ZONE into an absolute instant.
 *
 * The offset is sampled twice: once from a first approximation, then again
 * from the corrected instant. That second pass keeps the result exact if the
 * zone's offset differs across the boundary (a DST transition).
 */
function resolveWallClock(wall: WallClock): number {
  const { year, month, day, hour, minute, second } = wall;
  const wallAsIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  const approximate = wallAsIfUtc - zoneOffsetAt(wallAsIfUtc);
  return wallAsIfUtc - zoneOffsetAt(approximate);
}

/**
 * When NTGI began. Authoritative and explicit — never inferred from a commit
 * date, a first observed match, or "whatever Riot returns".
 *
 * Every match stored for champion statistics must satisfy BOTH:
 *   queueId === 420 (Ranked Solo/Duo)  AND  game end >= EVENT_START_AT
 *
 * Changing this changes which games count. It is not a tuning knob.
 */
export const EVENT_START_AT = new Date(resolveWallClock(START_WALL_CLOCK));

/** Riot's match-id endpoint takes epoch *seconds*, not milliseconds. */
export const EVENT_START_EPOCH_SECONDS = Math.floor(
  EVENT_START_AT.getTime() / 1000,
);

export const EVENT_END = new Date(resolveWallClock(DEADLINE_WALL_CLOCK));

/** How often the client re-checks the deadline. */
export const TICK_MS = 1000;

export type EventStatus =
  | { finished: false; days: number; hours: number; minutes: number; seconds: number }
  | { finished: true };

/**
 * The event's current state.
 *
 * Today this is derived purely from the clock. When a backend exists it can
 * supply an authoritative `finished` flag — pass it in here and return
 * `{ finished: true }` early, and every consumer follows without changing.
 * Nothing else in the app should compare against EVENT_END directly.
 */
export function getEventStatus(now: number = Date.now()): EventStatus {
  const remainingMs = EVENT_END.getTime() - now;
  if (remainingMs <= 0) return { finished: true };

  const totalSeconds = Math.floor(remainingMs / 1000);

  return {
    finished: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}
