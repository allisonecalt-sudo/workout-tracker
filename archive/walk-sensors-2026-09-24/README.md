# Walk sensors: GPS distance + motion step count (archived 2026-09-24)

## What this was

The live counters on a walk, both the standalone "Start a walk" card on home
and the in-workout walk lane on the cardio step:

- **GPS distance.** `navigator.geolocation.watchPosition`, fixes worse than 25 m
  dropped, displacement banked only in hops of 10 m or more (the Jul-4 slow-walker
  research number).
- **Motion step estimate.** A `devicemotion` peak detector on acceleration
  magnitude (a gate of 400 ms or more between steps, about 1.2 m/s² over a rolling baseline).
- The live line `12 min · 840 steps · 0.62 km`, and `walk_meters` / `walk_steps`
  saved from these counters (the motion estimate was the fallback when Google
  Fit didn't answer).

Born Jul 4 2026 from her words: _"it should make the screen stay open"_ and
_"it can't track my steps at least?"_

## Why retired

- **The numbers were wrong.** Saved steps never matched Google Fit: 3 steps in a
  29-minute walk on Sep 4. GPS gave 16 m for a 12-minute walk. A PWA can't keep
  either sensor alive reliably, and at her slow pace GPS measures jitter, not walking.
- **Her words, Sep 7 2026:** _"walk counter not important now."_
- **The fail-loud rule:** a tool that shows a confident number it can't back up
  is lying about its own competence. DECISIONS-v48 §4 (slow walking): minutes only.

## What replaced it (v48 · P3)

- A walk is **minutes only**. The live line reads `Walking · 12 min`. The wake
  lock stays, so the screen stays on and the minute tick keeps running.
- `walk_minutes` / `cardio_minutes` = the minutes. `walk_meters` = null.
- `walk_steps` = **Google Fit's** count for the walk window when Fit answers, else
  null. It's never the motion estimate, and it's never displayed.
- `movement_log` rows: `meters` and `steps` null. The `date` is the **local** day
  (it used to be the UTC slice, which put an evening walk under the wrong day).

## Where the data lives

- Old `walk_meters` / `walk_steps` values stay in `workout_sessions` and are still
  readable (archive-not-delete). No row was touched.
- Leftover `workout-tracker:walk-meters` / `workout-tracker:walk-steps` keys on a
  phone are harmless. The app no longer reads them and clears them when a new
  walk starts.

## What's in this folder

- `README.md`: this file.
- `walk-sensors.ts.txt`: the removed code, copied **verbatim** from `app.ts`
  (branch `redesign-v48` @ `3ca6b38`). It's a snapshot for reference and does not
  compile standalone.

## How to re-enable

1. Copy the constants and sensor state (`walkWatchId`, `walkLastFix`,
   `walkMotionHandler`, the step-gate variables), `walkCounter` and
   `haversineMeters` back into `app.ts` next to `WALK_ACTIVE_KEY`.
2. Swap `beginWalkTracking` / `endWalkTracking` / `updateWalkLiveLine` for the
   archived versions. The minutes-only versions keep the same names, so the
   callers don't change.
3. In `finishWalk` and `harvestWorkoutWalk`, read the counters again and pass
   `meters` into `logWalk` / `WorkoutWalkResult`. Restore the motion fallback
   for `steps` if it's wanted.
4. Restore `saveCompletedSession`'s `walkMeters` from `workoutWalk.meters`.
5. Update the v48 P3 tests (`(g) walk lane: minutes only`), which assert that
   no km or steps show.
