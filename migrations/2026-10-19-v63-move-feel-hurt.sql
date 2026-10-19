-- v63 item 3 (Mon Oct 19 2026): move_feel may carry `hurt` for a move she skipped with "This hurts",
-- e.g. 'wallsit=hurt;glutebridges=easy'. Additive: every value that passed before still passes.
-- NOT APPLIED by the builder (it never writes to Supabase): until this runs on the live table, a session
-- whose move_feel contains `hurt` is refused by the CHECK (HTTP 400, code 23514, not the PGRST204 the app
-- falls back on), stays unsynced on the phone, and is retried on every open until the migration is applied;
-- nothing is lost, it just waits. Same drop-and-add shape as 2026-09-28-v55-arm-feel-load.sql.
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_move_feel_check;
ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_move_feel_check CHECK (move_feel IS NULL OR move_feel ~ '^([a-z]+=(easy|right|hard|hurt)?(@[0-9]+(kg|s|min))?)(;[a-z]+=(easy|right|hard|hurt)?(@[0-9]+(kg|s|min))?)*$');
