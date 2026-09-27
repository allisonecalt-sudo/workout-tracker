-- v55 (Mon Sep 28 2026 00:30): arm_feel may carry the load she picked per move, e.g. 'curl=easy@2kg;row=@1kg'.
-- Her decision: 'I have 2kg now' (Sep 27 20:08) + 'I decide based on pain' (Sep 26 23:15). Additive: every old value still passes.
-- Applied by the lead via the Management API while she slept (her rule: carry on with the best decision; she can veto).
ALTER TABLE public.workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_arm_feel_check; ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_arm_feel_check CHECK (arm_feel IS NULL OR arm_feel ~ '^(curl=(easy|right|hard)?(@[12]kg)?)?(;?row=(easy|right|hard)?(@[12]kg)?)?$');
