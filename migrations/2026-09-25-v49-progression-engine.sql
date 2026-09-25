-- v49 · progression engine, shadow mode: two additive session columns + one
-- new table (Fri Sep 25 2026)
--
-- WHAT:
--  1. workout_sessions.wrist_pain_0_10 (smallint 0-10, nullable) — the wrist
--     half of the combined "Back & wrist: Fine · Back · Wrist" tap the spec
--     calls for (PROGRESSION-ENGINE-SPEC-2026-09-24.md §10).
--  2. workout_sessions.step_feel (text, 'fine'|'too_much', nullable) — the
--     one-tap read on a brand-new rung's first 2 sessions.
--  3. public.progression_steps — the engine's own log: one row per week for
--     its mode/step/nudge/revert/catch-up/her-ask/not-this-one/error, tagged
--     shadow/live/superseded so a stored decision can be replayed later
--     without recomputing (spec §7, §9).
--
-- WHY: the engine (progression.ts) needs a signal it doesn't have yet —
-- wrist pain as its OWN column (not the note text) and whether a brand-new
-- step felt like too much — plus somewhere to write its weekly decisions so
-- two phones agree and a past week can be replayed instead of recomputed.
-- Her words that started this build, Sep 24 18:40: "always progressing but
-- at a pace that will still keep em engaged."
--
-- WRIST COLUMN NOTE (spec §10): list_tables (Sep 25) shows pain_left_wrist_0_10
-- and pain_right_wrist_0_10 already exist, unused by the app since Lisa
-- cleared the wrist May 10 (app.ts "Group 1F" comment, L3705). Per the spec's
-- explicit default, this migration adds ONE new wrist_pain_0_10 column (the
-- worse side, matching the one-tap design) rather than reviving the L/R pair —
-- reusing them would need a side chip (+1 tap), against the ≤2-tap rule.
-- The old L/R columns are left alone (still there, still unused).
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, both nullable, no default,
-- so existing rows are untouched and no row is inserted, updated or deleted.
-- v48 (live on her phone) never sends these keys; its select=* ignores them.
-- progression_steps is a new, empty table — nothing to touch.
--
-- GRANTS: no GRANT block needed for the two columns (table-level grants on
-- workout_sessions already cover new columns — the Oct-30 2026 PostgREST flip
-- is about new TABLES). progression_steps IS a new table, so it gets the
-- GRANT block per reference/supabase-grant-template.sql (May-30 2026 rule).

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS wrist_pain_0_10 smallint CHECK (wrist_pain_0_10 BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS step_feel text CHECK (step_feel IN ('fine', 'too_much'));

CREATE TABLE IF NOT EXISTS public.progression_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('mode', 'step', 'nudge', 'revert', 'catch_up', 'her_ask', 'not_this_one', 'error')
  ),
  lane text,
  ladder_id text,
  from_rung int,
  to_rung int,
  reason text,
  receipt text,
  source text NOT NULL CHECK (source IN ('engine', 'her', 'claude')),
  status text NOT NULL CHECK (status IN ('shadow', 'live', 'superseded')),
  engine_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS progression_steps_once
  ON public.progression_steps (week_start, kind, coalesce(ladder_id, ''), status)
  WHERE kind IN ('mode', 'step', 'nudge');

ALTER TABLE public.progression_steps ENABLE ROW LEVEL SECURITY;

-- Mirrors workout_sessions' own policy exactly (checked live, Sep 25 2026:
-- "allow_all_anon_ws", anon-only, true/true) — the app talks to Supabase with
-- the anon key only, same as every other table it writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progression_steps TO anon, authenticated, service_role;

DROP POLICY IF EXISTS allow_all_anon_progression_steps ON public.progression_steps;
CREATE POLICY allow_all_anon_progression_steps ON public.progression_steps
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
