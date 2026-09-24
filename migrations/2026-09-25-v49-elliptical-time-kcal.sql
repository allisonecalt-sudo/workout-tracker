-- v49 · workout_sessions: two additive, nullable columns (Fri Sep 25 2026)
--
-- WHAT: elliptical_time_sec (integer) and elliptical_kcal (numeric(6,1)) —
-- the machine's own clock and its calorie estimate, copied off the console
-- the same way distance/level/pulse already are.
--
-- WHY: her ask Sep 24 17:54 — "need a way to put this in 10:02, time, dist
-- .72 … 63.4 calories" → "every time put in". The After-ride card asked for
-- Distance/Level/Pulse but not Calories or Time; she wants everything the
-- console shows entered, every time.
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, both nullable, no default,
-- so existing rows are untouched and no row is inserted, updated or deleted.
-- v48 (live on her phone) never sends these keys; its select=* ignores them.
--
-- GRANTS: no GRANT block needed — table-level grants on workout_sessions
-- already cover new columns (the Oct-30 2026 PostgREST flip is about new
-- TABLES, not new columns on an already-exposed table).

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS elliptical_time_sec integer CHECK (elliptical_time_sec BETWEEN 0 AND 18000),
  ADD COLUMN IF NOT EXISTS elliptical_kcal numeric(6,1) CHECK (elliptical_kcal >= 0 AND elliptical_kcal < 5000);
