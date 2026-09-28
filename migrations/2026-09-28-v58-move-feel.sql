-- v58 (Mon Sep 28 2026 09:52): move_feel — her Easy/Right/Hard (+ seconds/minutes) on EVERY OTHER move that
-- stepped this week, never curl/row (those keep arm_feel, unmigrated — her spec item 1), e.g.
-- 'splitsquat=right;wallsit=easy@45s;ride=right@12min'. Her go 09:52: '1- yes'. Additive, nullable.
-- Fix pass (Sep 28 2026, checker's nice): the example used to include 'curl=easy@2kg', which contradicted the
-- "never curl/row" rule right above it — comment only, the CHECK below was always correct.
ALTER TABLE public.workout_sessions ADD COLUMN IF NOT EXISTS move_feel text
  CHECK (move_feel IS NULL OR move_feel ~ '^([a-z]+=(easy|right|hard)?(@[0-9]+(kg|s|min))?)(;[a-z]+=(easy|right|hard)?(@[0-9]+(kg|s|min))?)*$');
