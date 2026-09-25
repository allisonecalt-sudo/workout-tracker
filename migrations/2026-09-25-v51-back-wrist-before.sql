-- v51 · back & wrist BEFORE: two additive, nullable columns on
-- workout_sessions (Fri Sep 25 2026)
--
-- WHAT: back_pain_before / wrist_pain_before (smallint, CHECK 0-10) — the
-- pre-log twin of the existing pain_back_0_10 / wrist_pain_0_10 (post-log)
-- columns. Same "Fine · Back · Wrist" one-tap control, asked before the
-- workout instead of after.
--
-- WHY: her words tonight (Sep 25 2026, 10:48): "and all metrics bf workout
-- have after as well" — body (capacity) and mood already ask before AND
-- after; back and wrist only ever asked after. This closes that gap.
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, both nullable, no
-- default, so existing rows are untouched and no row is inserted, updated
-- or deleted. A build before v51 never sends these keys; its select=*
-- simply ignores them.
--
-- GRANTS: no GRANT block needed — table-level grants on workout_sessions
-- already cover new columns (the Oct-30 2026 PostgREST flip is about new
-- TABLES, not new columns on an already-exposed table).

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS back_pain_before smallint CHECK (back_pain_before BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS wrist_pain_before smallint CHECK (wrist_pain_before BETWEEN 0 AND 10);
