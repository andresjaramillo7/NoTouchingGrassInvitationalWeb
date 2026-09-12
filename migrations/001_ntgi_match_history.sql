-- NTGI match history — the only reason this database exists.
--
-- It stores nothing about rank, LP, identity or profiles. Those keep coming
-- straight from Riot during the standings refresh. What Riot cannot give us
-- cheaply is "which champions did this player use during THIS event", because
-- that needs match history from EVENT_START_AT onward, and Riot's match
-- endpoints are the expensive ones. So we persist the minimum that answers
-- that question, and nothing else.
--
-- Idempotent: safe to run repeatedly.

-- One row per Riot match we have already inspected.
--
-- A row here means "queueId was 420 and the game ended at or after
-- EVENT_START_AT". Its presence is also what stops us from ever fetching the
-- same Match-V5 detail twice — a finished match is immutable for our purposes.
CREATE TABLE IF NOT EXISTS matches (
  match_id    TEXT        PRIMARY KEY,
  game_end_at TIMESTAMPTZ NOT NULL
);

-- Ordering aid for the "most recent appearance" champion tiebreak and for
-- backfill progress reporting.
CREATE INDEX IF NOT EXISTS matches_game_end_at_idx ON matches (game_end_at);

-- One row per (NTGI participant, match) pair.
--
-- Only NTGI participants are stored. The other nine players in a game are
-- irrelevant to us and are discarded. No items, KDA, damage, runes, timeline
-- or raw Riot JSON is kept — if a future statistic needs more, it gets its own
-- deliberate column, not a JSON dumping ground.
CREATE TABLE IF NOT EXISTS participant_matches (
  participant_id TEXT    NOT NULL,
  match_id       TEXT    NOT NULL REFERENCES matches (match_id) ON DELETE CASCADE,
  champion_id    INTEGER NOT NULL,
  champion_name  TEXT    NOT NULL,
  won            BOOLEAN NOT NULL,
  PRIMARY KEY (participant_id, match_id)
);

-- Covers the champion aggregation, which always groups by participant.
CREATE INDEX IF NOT EXISTS participant_matches_participant_champion_idx
  ON participant_matches (participant_id, champion_id);

-- Cross-serverless-instance coordination for bulk history synchronisation.
--
-- One row, one lock. `last_completed_at` enforces the cooldown; `lease_until`
-- stops two concurrent invocations from syncing at once and always carries an
-- expiry, so a crashed function cannot block future updates forever.
CREATE TABLE IF NOT EXISTS sync_state (
  sync_key          TEXT PRIMARY KEY,
  last_completed_at TIMESTAMPTZ,
  lease_until       TIMESTAMPTZ
);
