# Hand routine (archived 2026-05-15)

## What this was

A standalone routine inside the workout-tracker app: Lisa Cohen PT's 3-exercise
hand protocol (wrist stretch + flexion/extension with a tuna can + radial
deviation strengthening), performed 1x per day per side after the rehab
protocol reset on May 5, 2026. The routine had its own:

- screen mode (`hand-routine`)
- 2 routine entries (left + right) under `HAND_ROUTINES`
- localStorage persistence (`workout-tracker:hand-logs`, cap 200)
- Supabase sync to the `hand_routine_logs` table
- state machine (`startHandRoutine`, `advanceHandExercise`)
- render function (`renderHandRoutine`)
- 6 EXERCISE_GUIDE text entries (the actual Lisa Cohen cues)

## Why retired

Per Allison's call on 2026-05-15 (13:33 JDT): _"we dont need any hand at all."_

The home-screen entry button was hidden in commit 23e04c1 earlier that day;
this archive removes the rest of the wiring from `app.ts`.

## Where the data lives

- **Supabase `hand_routine_logs` table** (project `hpiyvnfhoqnnnotrmwaz`) —
  rows PRESERVED. Allison's archive-not-delete rule applies. The table is
  no longer written to from the app, but historical rows stay queryable for
  future-her.
- **localStorage `workout-tracker:hand-logs`** — any client-cached logs survive
  on the device until the user clears site data. The app no longer reads them.

## What's in this folder

- `README.md` — this file
- `hand-routine.archived.ts` — extracted code from `app.ts` (types, constants,
  persistence layer, sync, state machine, render). **Does not compile
  standalone** — references types/utilities from `app.ts`. Snapshot for
  reference only.
- `exercise-guide-wrist-entries.archived.ts` — the 6 Lisa Cohen wrist-exercise
  text instructions that lived in `EXERCISE_GUIDE`.

## How to re-enable later

1. Copy the relevant sections from these files back into `app.ts`.
2. Restore `'hand-routine'` to the `AppScreen` union.
3. Restore the state fields `selectedHandRoutine` and `currentHandExerciseIndex`
   on `AppState` (and their init/reset assignments).
4. Restore the `case 'hand-routine'` in the render dispatch (around the
   `renderHistoryDetail` case).
5. Restore the `next-hand` / `quit-hand` event handlers in `attachHandlers()`.
6. Add a home-screen entry button — that was removed in 23e04c1.
7. Re-add `EXERCISE_VISUALS` keys for the wrist exercises if not still present.

## Timeline

- 2026-05-05: Lisa Cohen prescribed the 3-exercise protocol, replacing the
  prior Eliana day-30 wrist routines.
- 2026-05-15 (morning, commit 23e04c1): home-screen entry hidden, code retained.
- 2026-05-15 (afternoon): Allison says "we don't need any hand at all."
  This archive created.

See `self/health.md` in the second-brain repo for the wrist clinical timeline.
