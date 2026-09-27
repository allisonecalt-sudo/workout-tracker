-- v53 · week moves (Sun Sep 27 2026)
--
-- WHAT: a new table, week_moves, holding ONLY the exceptions — a week she
-- chose to close early with "Move on without it" (1 or 2 of A/B/C done, the
-- week open 8+ days). Completed weeks are never stored here; they're derived
-- from workout_sessions by week.ts's walkWeeks(), same as always.
--
-- WHY: PLAN-2026-09-26.md §2 (the completion-based week model). Her rule,
-- Sat Sep 26 2026 21:28: "I think once all three are done and then it can go
-- to the next week" — and 21:24: "dont go to next week till i approve". A
-- move is a quiet, EXPLICIT event (never inferred), so it needs its own row:
-- the app never moves on by itself, and this table is the only place that
-- decision lives.
--
-- GRANTS + RLS: this is a NEW TABLE (May-30-2026 rule, reference/supabase-
-- grant-template.sql) so it needs the explicit GRANT block. Mirrors
-- cycle_periods (migrations/2026-09-25-v50-cycle-periods.sql) and
-- workout_sessions' own "allow_all_anon_ws" policy shape exactly.
--
-- NOT YET APPLIED: PLAN-2026-09-26.md marks this item **schema** — her yes
-- comes first (CLAUDE.md's schema-change rule), then Claude applies it via
-- the Supabase Management API. The app's sync code (app.ts, WK3) reads/writes
-- this table already; until the table exists, every pull/push/delete just
-- fails loud (console.warn) the same way any other network hiccup does — no
-- app-side change needed once she says go and it's applied.

CREATE TABLE IF NOT EXISTS public.week_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round smallint NOT NULL CHECK (round BETWEEN 1 AND 20),
  week smallint NOT NULL CHECK (week BETWEEN 1 AND 200),
  moved_at timestamptz NOT NULL DEFAULT now(),
  missing text CHECK (missing ~ '^[ABC]{1,2}$'),
  created_at timestamptz DEFAULT now(),
  UNIQUE (round, week)
);

ALTER TABLE public.week_moves ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.week_moves TO anon, authenticated, service_role;

DROP POLICY IF EXISTS allow_all_anon_week_moves ON public.week_moves;
CREATE POLICY allow_all_anon_week_moves ON public.week_moves
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
