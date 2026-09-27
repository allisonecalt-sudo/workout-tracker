-- v54 · workout_sessions: widen workout_type to allow 'D' (Sat Sep 27 2026)
--
-- WHAT: widens the existing CHECK on workout_type from ('A','B','C') to
-- ('A','B','C','D') so a Workout D session (30-min elliptical, extra to
-- A/B/C) can be inserted. Nothing else changes — no new column, no new
-- table, no data rewritten.
--
-- WHY: Workout D, her Sep 27 2026 NotebookLM reflection: "I definitely don't
-- do enough cardio... maybe what I could add is 30 minutes on the elliptical
-- separately... we definitely need a 4th element a week... call it Workout
-- D." Verified live (read-only) the same day: the column's CHECK is
--   workout_sessions_workout_type_check: CHECK (workout_type = ANY (ARRAY['A','B','C']))
-- — it would reject a 'D' insert as-is (a silent-looking PGRST/Postgres
-- constraint violation, not a crash, but a real save failure).
--
-- QUEUED, NOT APPLIED: per CLAUDE.md's schema-change rule, this migration is
-- written and reviewed here but NOT run against the live database. The app
-- itself fails loud (see app.ts's pushLogToSupabase / the D-insert comment)
-- rather than silently dropping a Workout D save if it lands before this
-- runs. Apply only on her go — one ALTER, additive, safe to run any time
-- after that (existing A/B/C rows are untouched; the constraint only ever
-- widens, never narrows).
--
-- SAFETY: DROP + re-ADD the same CHECK (Postgres has no ALTER CHECK). The
-- DROP/ADD pair runs in one statement so there's no window where the column
-- has no constraint at all. No column type change, no NOT NULL change, no
-- default change, no row touched.

ALTER TABLE public.workout_sessions
  DROP CONSTRAINT IF EXISTS workout_sessions_workout_type_check,
  ADD CONSTRAINT workout_sessions_workout_type_check
    CHECK (workout_type = ANY (ARRAY['A', 'B', 'C', 'D']));
