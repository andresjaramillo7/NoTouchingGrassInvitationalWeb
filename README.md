# No Touching Grass Invitational

A private League of Legends Solo Queue challenge. Climb now. Touch grass later.

Standings are decided by each player's **final** Ranked Solo/Duo rank at
December 31, 2026, 23:59:59 `America/Mexico_City`. Peak rank is not tracked and
is not displayed.

The event runs from **September 11, 2026, 00:00 `America/Mexico_City`**
(`2026-09-11T06:00:00Z`), set as `EVENT_START_AT` in `lib/event.ts`.

## Running it

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in `RIOT_API_KEY`. Both secrets are
server-side only and must never be prefixed with `NEXT_PUBLIC_`.

`DATABASE_URL` is optional: without it the leaderboard still renders live rank,
W/L and streaks, just with no champion history.

### With champion history

```bash
# 1. create a Neon Postgres database, put its URL in .env.local as DATABASE_URL
npm run db:migrate

# 2. one-time historical backfill, EVENT_START_AT -> now (runs locally, slowly)
npm run backfill:matches
```

Run the backfill **before** deploying champion history, so the first visitor
never waits for it.

### Other commands

```bash
npm run typecheck
npm test
npm run build
```

## Structure

```
app/          layout, page, global styles
components/   header, hero, countdown, standings, player-row, top-three,
              champion-strip, rank-badge, prizes, rules, footer
data/         participants.ts — the eight real participants (manual metadata)
lib/          ranks.ts       — rank model, ordering, formatting
              event.ts       — EVENT_START_AT, EVENT_END, countdown math
              standings.ts   — the one Riot workload, start to finish
              match-sync.ts  — match-history synchronisation
              champions.ts   — top-champion presentation
              db/            — Neon access, the sync lease, match queries
              riot/          — client, global request gate, endpoints
migrations/   001_ntgi_match_history.sql
scripts/      migrate.ts, backfill-matches.ts
```

Everything is a Server Component except `components/countdown.tsx` and
`components/standings-title.tsx`, both of which depend on the current time.

## The deadline

`lib/event.ts` holds the one definition of when the challenge starts and ends.
Each boundary is stored as a wall-clock time plus an IANA zone name, then
resolved to a single absolute instant through the runtime's timezone database —
never a hardcoded UTC offset. Every viewer counts down to the same moment.

`getEventStatus()` currently derives `finished` from the clock and can later
defer to an authoritative value. Nothing else in the app compares against
`EVENT_END` directly.

## One Riot workload

There is no cron, no scheduled route and no background worker. The page's ISR
window (600s, `lib/revalidate.ts`) is the only thing that triggers work:

```
page regenerates
  -> current rank from Riot            (never persisted)
  -> match-history sync, if due        (Postgres cooldown + lease)
  -> champion aggregation from Postgres
  -> render
```

Every authenticated Riot request — retries included — passes through the single
gate in `lib/riot/gate.ts` (max 4 in flight, ≥100ms between starts). There is no
second client and no bypass.

Because that gate is in-memory, it cannot see a second serverless instance. A
single row in `sync_state` does that job instead: a 10-minute cooldown plus an
expiring lease, taken in one atomic statement. If another instance holds it, we
render the champion history already in the database and call Riot for nothing.

Per sync the batch is capped at **20 new Match-V5 detail fetches**. A larger
backlog is picked up by later regenerations — catching up slowly is fine, and
nothing is lost, because unprocessed ids stay discoverable on Riot's side.

Request savings come from three rules:

1. a match already in `matches` is never fetched again
2. one match shared by two participants is fetched **once**, and stores a row
   for each of them
3. one match-id call per participant serves both STREAK and new-match discovery

## What the database is for

Exactly one thing: **NTGI event match history**. Three small tables, no ORM, no
raw Riot JSON, and no rank snapshots, LP history, identity cache or profile TTL.

Every stored match satisfies both `queueId === 420` and
`game end >= EVENT_START_AT`. Champion statistics are aggregated on demand in
Postgres — eight participants over one indexed table needs no materialised
aggregate.

If Neon is unreachable, champion history simply does not render. Nothing is
fabricated, nothing already stored is erased, and current standings stay live.
