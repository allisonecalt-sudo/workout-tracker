-- v53 · timing: her start/finish "Right?" + breaks (Sun Sep 27 2026)
--
-- WHAT: five additive, nullable columns on workout_sessions —
--   her_start_at / her_start_confirmed / her_end_at / her_end_confirmed
--   (timestamptz / boolean) and break_minutes (smallint, CHECK 0/5/15/30).
-- These are her OWN answers to "starting the workout, is this the time?"
-- and "finishing, is this the time?", never the app's own start/end taps
-- (started_at/completed_at/duration_seconds stay exactly as they are, kept
-- for checking only — PLAN-2026-09-26.md §3's own "two tiers of time").
--
-- WHY: her words, Sat Sep 26 2026, 22:33-22:36: "you don't know timing
-- that's a big thing ... I'm not on top of it when I started and ended" ->
-- "Maybe you could just say like starting workout is this the time so I
-- don't always have to like check it and then it's not the time I'll
-- correct it."
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, all nullable, no
-- default, so existing rows are untouched and no row is inserted, updated
-- or deleted. A build before v53's T1 never sends these keys; its
-- select=* simply ignores them (same shape as v51's back_pain_before /
-- wrist_pain_before, migrations/2026-09-25-v51-back-wrist-before.sql).
--
-- GRANTS: no GRANT block needed — table-level grants on workout_sessions
-- already cover new columns (the Oct-30 2026 PostgREST flip is about new
-- TABLES, not new columns on an already-exposed table).
--
-- NOT YET APPLIED: PLAN-2026-09-26.md marks this item (T1) **schema** —
-- her yes comes first (CLAUDE.md's schema-change rule), then Claude applies
-- it via the Supabase Management API. Until then, app.ts's V53_TIMING_
-- SESSION_COLUMNS strip group (legacySessionPayload) already keeps every
-- save landing safely on the columns that exist today — the PGRST204
-- retry drops these five and the session still saves, no data lost.

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS her_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS her_start_confirmed boolean,
  ADD COLUMN IF NOT EXISTS her_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS her_end_confirmed boolean,
  ADD COLUMN IF NOT EXISTS break_minutes smallint CHECK (break_minutes IN (0, 5, 15, 30));
