-- v73 (Wed Nov 11 2026): workout_sessions.session_path — the Round 3 time path she tapped on the
-- pre-workout page ('38' | '48' | '60' minutes). Nullable: every older row, and Workout D, stay null.
-- Her yes: Wed Nov 11 14:32 ("yes" to the new session_path column). Spec: second-brain
-- projects/workout-tracker/R3-PLAN-2026-11-11.md, BUILD SPEC v73 item 2.
-- Additive only: no row is touched. The column inherits the table's existing grants (the table already
-- has its anon/authenticated/service_role GRANTs; a new COLUMN needs none of its own).
-- If the app is ahead of this migration the session still saves: sync.ts's tiered retry drops the
-- column on PGRST204 (V73_SESSION_PATH_COLUMNS).
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS session_path text;
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_session_path_check;
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_session_path_check CHECK (session_path IS NULL OR session_path IN ('38', '48', '60'));
