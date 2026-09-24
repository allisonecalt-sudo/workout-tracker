-- v48 · workout_sessions: nine additive, nullable columns (Thu Sep 24 2026)
--
-- WHAT: real columns for the cardio lane, its minutes, the elliptical console
-- readings (level / km / pulse), her free-text session note, the lite-day flag,
-- the arm-feel tap (1 kg curl + prone row) and how many voice notes she played.
--
-- WHY: until v47 all of this was stuffed into `notes` as prose ("cardio:
-- elliptical 10 min · level 7 · 1.4 km · pulse 128 · <her note>") and read back
-- by regex. Claude could not query it, and a note of hers that happened to
-- contain the marker shape would be misread as her level (data-integrity #1).
-- Her words when the elliptical arrived: "make it measurable whatever you say
-- I'm gonna copy it" — every number she copies off the machine now comes back
-- to her as a number. Decision: DECISIONS-v48-2026-09-24.md §3.
--
-- SAFETY: additive only. ADD COLUMN IF NOT EXISTS, every column nullable, no
-- default, so existing rows are untouched and NO row is inserted, updated or
-- deleted. v47 (live on her phone) never sends these keys, and its select=*
-- simply ignores the extra fields.
--
-- GRANTS: no GRANT block needed — the table-level grants on workout_sessions
-- already cover new columns (the Oct-30 2026 PostgREST default flip is about
-- new TABLES, not new columns on an exposed table).

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS cardio_lane text CHECK (cardio_lane IN ('walk','apartment','elliptical')),
  ADD COLUMN IF NOT EXISTS cardio_minutes int CHECK (cardio_minutes BETWEEN 0 AND 300),
  ADD COLUMN IF NOT EXISTS elliptical_level smallint CHECK (elliptical_level BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS elliptical_km numeric(5,2) CHECK (elliptical_km >= 0 AND elliptical_km < 100),
  ADD COLUMN IF NOT EXISTS elliptical_pulse smallint CHECK (elliptical_pulse BETWEEN 30 AND 230),
  ADD COLUMN IF NOT EXISTS session_note text,
  ADD COLUMN IF NOT EXISTS lite_day boolean,
  ADD COLUMN IF NOT EXISTS arm_feel text CHECK (arm_feel ~ '^(curl=(easy|right|hard))?(;?row=(easy|right|hard))?$'),
  ADD COLUMN IF NOT EXISTS voice_plays smallint CHECK (voice_plays >= 0);
