-- v74 (Wed Nov 11 2026): "Not my best day?" - workout_sessions.day_mode, plus a place for a logged rest day.
-- Her yes: Wed Nov 11 15:53 ("Ok build jt" to the design and the field). Spec: second-brain
-- projects/workout-tracker/R3-PLAN-2026-11-11.md, "v74 DESIGN - one button, three kinds of day".
--
-- 1) day_mode text, nullable: which kind of day she chose before Start.
--    back | knee | wrist  = a SWAP day (a real workout, counts as A/B/C)
--    cold                 = an EASY day (a real workout, counts as A/B/C)
--    fever | crohns       = a REST day (no workout)
-- 2) A logged rest day is a workout_sessions row with workout_type 'R' and day_mode fever|crohns.
--    Chosen because it is the smallest safe change: the only other option was a new table. The app
--    never puts an 'R' row in its sessions list (sync.ts routes it to its own rest-days store), so
--    no count, week clock, Progress or history can see it as a workout. Existing rows: untouched
--    (A 18, B 18, C 16, D 3 all stay valid).
-- Additive only. A new column inherits the table's existing grants.
-- If the app is ahead of this migration a session still saves: sync.ts's tiered retry drops the
-- column on PGRST204 (V74_DAY_MODE_COLUMNS).
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS day_mode text;
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_day_mode_check;
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_day_mode_check CHECK (day_mode IS NULL OR day_mode IN ('back', 'knee', 'wrist', 'cold', 'fever', 'crohns'));
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_workout_type_check;
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_workout_type_check CHECK (workout_type IN ('A', 'B', 'C', 'D', 'R'));
-- A rest row must say which kind; a workout row must not be a rest row.
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_rest_row_check;
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_rest_row_check CHECK ((workout_type = 'R') = (day_mode IN ('fever', 'crohns')));
