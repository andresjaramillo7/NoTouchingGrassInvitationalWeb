# No Touching Grass Invitational

A private League of Legends Solo Queue challenge. Climb now. Touch grass later.

Standings are decided by each player's **final** Ranked Solo/Duo rank at
December 31, 2026, 23:59:59 `America/Mexico_City`. Peak rank is not tracked and
is not displayed.

## Running it

```bash
npm install
npm run dev
```

## Structure

```
app/          layout, page, global styles
components/   header, hero, countdown, standings, player-row, rank-badge, prizes, rules, footer
data/         players.ts — mock roster (Phase 1)
lib/          ranks.ts — rank model, ordering, formatting
              event.ts — deadline, countdown math, event status
public/       ntgi-logo.png
```

Everything is a Server Component except `components/countdown.tsx` and
`components/standings-title.tsx`, both of which depend on the current time.

## The deadline

`lib/event.ts` holds the one definition of when the challenge ends. The
deadline is stored as a wall-clock time plus an IANA zone name, then resolved
to a single absolute instant through the runtime's timezone database — never a
hardcoded UTC offset. Every viewer counts down to the same moment.

`getEventStatus()` is the seam for Phase 2: it currently derives `finished`
from the clock, and can later defer to an authoritative value from the backend.
Nothing else in the app compares against `EVENT_END` directly.

## Phase 1 scope

The only fake part is `data/players.ts`. To move to live data, replace that
module with a Riot API fetch that returns the same `Player[]` shape from
`lib/ranks.ts` — no presentation component should need to change.

Ordering lives entirely in `sortPlayers` / `compareRank`:
tier → division → league points → win rate. Apex tiers (Master, Grandmaster,
Challenger) carry `division: null` and compare on LP directly; the union type
makes a divisioned apex rank a compile error. The numeric indices used for
comparison are internal and never rendered.
