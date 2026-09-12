/**
 * Reads and writes for NTGI match history.
 *
 * Everything here is deliberately narrow. There is no repository layer, no
 * entity mapper and no ORM — a handful of small, indexed statements answer
 * every question the site asks, and aggregation happens in Postgres rather
 * than by pulling tables into memory.
 */
import { getSql, readOrFallback, type SqlClient } from "@/lib/db/sql";

/** One NTGI participant's appearance in one match. */
export type ParticipantMatchRow = {
  participantId: string;
  championId: number;
  championName: string;
  won: boolean;
};

/** A match that passed the queue/event-window filter, ready to persist. */
export type StoredMatch = {
  matchId: string;
  /** Epoch milliseconds. */
  gameEndAt: number;
  participants: ParticipantMatchRow[];
};

/** Raw aggregation output — presentation concerns live in lib/champions.ts. */
export type ChampionTally = {
  participantId: string;
  championId: number;
  /** Data Dragon's champion id, e.g. "LeeSin". */
  championName: string;
  games: number;
  wins: number;
};

/** Composite key for a (participant, match) outcome lookup. */
export function outcomeKey(participantId: string, matchId: string): string {
  return `${participantId}\u0000${matchId}`;
}

/**
 * Which of `matchIds` we have already inspected.
 *
 * This is the single biggest request saving in the whole design: a finished
 * match never changes the numbers we care about, so a known id is never
 * fetched from Riot again.
 */
export function findKnownMatchIds(
  matchIds: readonly string[],
): Promise<Set<string>> {
  if (matchIds.length === 0) return Promise.resolve(new Set());

  return readOrFallback("findKnownMatchIds", new Set<string>(), async (sql) => {
    const rows = (await sql`
      SELECT match_id FROM matches WHERE match_id = ANY(${[...matchIds]}::text[])
    `) as { match_id: string }[];

    return new Set(rows.map((row) => row.match_id));
  });
}

/**
 * Stored win/loss for the given matches, keyed by participant and match.
 *
 * Lets STREAK reuse history we already hold instead of re-fetching five match
 * details per player on every regeneration.
 */
export function findStoredOutcomes(
  matchIds: readonly string[],
): Promise<Map<string, boolean>> {
  if (matchIds.length === 0) return Promise.resolve(new Map());

  return readOrFallback("findStoredOutcomes", new Map<string, boolean>(), async (sql) => {
    const rows = (await sql`
      SELECT participant_id, match_id, won
        FROM participant_matches
       WHERE match_id = ANY(${[...matchIds]}::text[])
    `) as { participant_id: string; match_id: string; won: boolean }[];

    return new Map(
      rows.map((row) => [outcomeKey(row.participant_id, row.match_id), row.won]),
    );
  });
}

/**
 * Persists a batch of matches and the NTGI participant rows inside them.
 *
 * Two statements in one transaction — one round trip, foreign key ordering
 * respected, and `ON CONFLICT DO NOTHING` everywhere so re-running a sync or a
 * half-finished backfill can never duplicate a row or raise.
 *
 * Throws on failure. Callers decide whether a write failure is fatal; it never
 * deletes or rewrites anything already stored.
 */
export async function storeMatches(batch: readonly StoredMatch[]): Promise<number> {
  const sql = getSql();
  if (!sql || batch.length === 0) return 0;

  const matchIds = batch.map((match) => match.matchId);
  const endedAt = batch.map((match) => new Date(match.gameEndAt).toISOString());

  const rows = batch.flatMap((match) =>
    match.participants.map((participant) => ({ ...participant, matchId: match.matchId })),
  );

  await sql.transaction([
    sql`
      INSERT INTO matches (match_id, game_end_at)
      SELECT * FROM unnest(${matchIds}::text[], ${endedAt}::timestamptz[])
      ON CONFLICT (match_id) DO NOTHING
    `,
    sql`
      INSERT INTO participant_matches
             (participant_id, match_id, champion_id, champion_name, won)
      SELECT * FROM unnest(
        ${rows.map((row) => row.participantId)}::text[],
        ${rows.map((row) => row.matchId)}::text[],
        ${rows.map((row) => row.championId)}::int[],
        ${rows.map((row) => row.championName)}::text[],
        ${rows.map((row) => row.won)}::boolean[]
      )
      ON CONFLICT (participant_id, match_id) DO NOTHING
    `,
  ]);

  return batch.length;
}

/** How many event matches each participant has on record. Backfill reporting only. */
export function countStoredMatchesByParticipant(): Promise<Map<string, number>> {
  return readOrFallback("countStoredMatches", new Map<string, number>(), async (sql) => {
    const rows = (await sql`
      SELECT participant_id, COUNT(*)::int AS games
        FROM participant_matches
       GROUP BY participant_id
    `) as { participant_id: string; games: number }[];

    return new Map(rows.map((row) => [row.participant_id, row.games]));
  });
}

/**
 * Each participant's `limit` most-played champions during NTGI.
 *
 * Ordering — games, then wins, then most recent appearance, then champion id
 * as a final deterministic tiebreak so two identical lines never swap places
 * between regenerations.
 *
 * The champion name is taken from the most recent appearance, so a Riot
 * rename shows the current name rather than whichever one we happened to
 * store first. Nothing here is materialised into an aggregate table: eight
 * participants over one small, indexed table is a trivial query.
 */
export function findTopChampions(limit = 3): Promise<Map<string, ChampionTally[]>> {
  return readOrFallback("findTopChampions", new Map<string, ChampionTally[]>(), runTopChampions(limit));
}

function runTopChampions(limit: number) {
  return async (sql: SqlClient): Promise<Map<string, ChampionTally[]>> => {
    const rows = (await sql`
      WITH tally AS (
        SELECT pm.participant_id,
               pm.champion_id,
               COUNT(*)::int                              AS games,
               (COUNT(*) FILTER (WHERE pm.won))::int      AS wins,
               MAX(m.game_end_at)                         AS last_played_at,
               (ARRAY_AGG(pm.champion_name ORDER BY m.game_end_at DESC))[1]
                                                          AS champion_name
          FROM participant_matches pm
          JOIN matches m ON m.match_id = pm.match_id
         GROUP BY pm.participant_id, pm.champion_id
      ),
      ranked AS (
        SELECT tally.*,
               ROW_NUMBER() OVER (
                 PARTITION BY participant_id
                 ORDER BY games DESC, wins DESC, last_played_at DESC, champion_id ASC
               ) AS rn
          FROM tally
      )
      SELECT participant_id, champion_id, champion_name, games, wins
        FROM ranked
       WHERE rn <= ${limit}
       ORDER BY participant_id, rn
    `) as {
      participant_id: string;
      champion_id: number;
      champion_name: string;
      games: number;
      wins: number;
    }[];

    const byParticipant = new Map<string, ChampionTally[]>();

    for (const row of rows) {
      const tally: ChampionTally = {
        participantId: row.participant_id,
        championId: row.champion_id,
        championName: row.champion_name,
        games: row.games,
        wins: row.wins,
      };

      const existing = byParticipant.get(row.participant_id);
      if (existing) existing.push(tally);
      else byParticipant.set(row.participant_id, [tally]);
    }

    return byParticipant;
  };
}
