-- v50 · capacity & cycle: cycle_periods table (Thu Sep 25 2026)
--
-- WHAT: a new table, cycle_periods, holding one row per period start date.
-- The tandem rule (CLAUDE.md "Core Role") says any data the app tracks must
-- be readable AND writable by both Allison's phone and Claude — her cycle log
-- was living only in a markdown file (self/health/reproductive.md), which the
-- app itself could never read. This table is the shared substrate: the app's
-- "Period started today" tap writes here, and Claude's cycle.ts logic reads
-- the same rows.
--
-- WHY NOW: her words tonight (Sep 25 2026, 04:01-04:02): "I also want capacity
-- analysis in progress before and after and period what phase and then
-- comparing capacity and phase" -> "you have all past cycle info". The seed
-- below is that "you have all past cycle info" — her explicit go to bring the
-- dates already logged in reproductive.md into a queryable table.
--
-- GRANTS + RLS: this is a NEW TABLE (May-30-2026 rule, reference/supabase-
-- grant-template.sql) so it needs the explicit GRANT block. Checked live via
-- the Management API (Sep 25 2026): workout_sessions' only policy is
-- "allow_all_anon_ws" — PERMISSIVE, role {anon}, cmd ALL, qual/with_check both
-- `true` — and its grants cover anon/authenticated/service_role for
-- SELECT/INSERT/UPDATE/DELETE. Mirrored exactly below, same as the v49
-- progression_steps migration did.

CREATE TABLE IF NOT EXISTS public.cycle_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL UNIQUE,
  source text,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.cycle_periods ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cycle_periods TO anon, authenticated, service_role;

DROP POLICY IF EXISTS allow_all_anon_cycle_periods ON public.cycle_periods;
CREATE POLICY allow_all_anon_cycle_periods ON public.cycle_periods
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
