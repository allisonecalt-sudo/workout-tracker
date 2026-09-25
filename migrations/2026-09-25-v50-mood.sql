-- v50 · mood: two additive, nullable columns on workout_sessions (Fri Sep 25 2026)
--
-- WHAT: mood_before / mood_after (smallint, CHECK 1-10) — a second 1-10 chip
-- row next to capacity, pre-log and post-log. Her words (04:45): "and then
-- another 1-10 thing I can do is mood 1 being irritable to being happy and
-- or calm". Separate from the BODY chips on purpose (that label stays "your
-- BODY now, not your mood") — capacity and mood are two different questions.
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, nullable, no default, so
-- existing rows are untouched and no row is inserted, updated or deleted.
-- Older builds never send these keys; their select=* simply ignores them.
--
-- GRANTS: no GRANT block needed — table-level grants on workout_sessions
-- already cover new columns (the Oct-30 2026 PostgREST flip is about new
-- TABLES, not new columns on an already-exposed table).

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS mood_before smallint CHECK (mood_before BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS mood_after smallint CHECK (mood_after BETWEEN 1 AND 10);
