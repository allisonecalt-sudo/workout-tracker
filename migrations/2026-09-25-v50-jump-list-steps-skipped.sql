-- v50 · workout_sessions: one additive, nullable column (Fri Sep 25 2026)
--
-- WHAT: steps_skipped (smallint) — how many warm-up/main/upper-back moves
-- never got a Done tap in the jump list before the session saved. No verdict,
-- just a count; the cool-down isn't counted (it's its own checklist screen).
--
-- WHY: her ask (Sep 25 2026, 01:33 -> 04:02) — "I dont always do the workouts
-- in [order]" — the jump list lets her do exercises out of order, and the
-- post-log says so plainly ("2 moves skipped") when she finishes with some
-- still open.
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, nullable, no default, so
-- existing rows are untouched and no row is inserted, updated or deleted.
-- Older builds never send this key; their select=* simply ignores it.
--
-- GRANTS: no GRANT block needed — table-level grants on workout_sessions
-- already cover new columns (the Oct-30 2026 PostgREST flip is about new
-- TABLES, not new columns on an already-exposed table).

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS steps_skipped smallint CHECK (steps_skipped >= 0);
