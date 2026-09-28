-- v58 (Mon Sep 28 2026 09:52): move_feel — her Easy/Right/Hard (+ load/seconds) on EVERY move that stepped this week, e.g.
-- 'splitsquat=right;wallsit=easy@45s;ride=right@12min;curl=easy@2kg'. Her go 09:52: '1- yes'. Additive, nullable.
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS move_feel text
  CHECK (move_feel IS NULL OR move_feel ~ '^([a-z]+=(easy|right|hard)?(@[0-9]+(kg|s|min))?)(;[a-z]+=(easy|right|hard)?(@[0-9]+(kg|s|min))?)*$');
