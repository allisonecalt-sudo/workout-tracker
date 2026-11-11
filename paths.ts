// paths.ts — Round 3's three time paths (v73, Nov 11 2026). Pure logic, no DOM.
//
// What this is: the pick on the pre-workout page — 38 / 48 / 60 minutes — and
// the one function that turns a workout plus a pick into the workout she
// actually does today.
// Why it exists: her words (Wed Nov 11 2026): "each one has 30,45,hour and i
// click the path" · "if im goign to show up it needs to be realistic". It
// replaces the old Lite chip (Lite = one round less; the paths do that job
// better). The old `lite_day` column and `state.liteDay` still exist: "Finish
// here" and "Log what I did" set it, and old sessions keep showing it.
// What's decided: a workout with `paths` lists its `main` moves in PRIORITY
// order. 38 -> the first 3, 48 -> the first 4, 60 -> all of them plus the
// optional move(s). The ride (the 'Outdoor walk' step — that exact name, the
// cardio lanes key off it) gets the path's minutes. No pick = 48. D and every
// R1/R2 week have no `paths`, so they pass through untouched.
// What's next: the pick is saved as workout_sessions.session_path
// ('38' | '48' | '60'; migrations/2026-11-11-v73-session-path.sql).
// Links: second-brain projects/workout-tracker/R3-PLAN-2026-11-11.md (BUILD SPEC v73).

import type { Exercise, PathId, Workout } from './program.js';

export const PATH_IDS: readonly PathId[] = ['38', '48', '60'];

/** Start without a pick means this path. */
export const DEFAULT_PATH: PathId = '48';

/** How many of the priority-ordered `main` moves each path shows (60 = all). */
export const PATH_MOVE_COUNT: Record<PathId, number> = { '38': 3, '48': 4, '60': Infinity };

export function isPathId(v: unknown): v is PathId {
  return v === '38' || v === '48' || v === '60';
}

export function pathLabel(p: PathId): string {
  return `${p} min`;
}

/** The workout she does today: `w` cut to `path` (null = the default, 48).
 * A workout with no `paths` comes back as the very same object. */
export function workoutForPath(w: Workout, path: PathId | null): Workout {
  const spec = w.paths;
  if (!spec) return w;
  const p = path ?? DEFAULT_PATH;
  const count = PATH_MOVE_COUNT[p];
  const main: Exercise[] = [
    ...w.main.slice(0, count),
    ...(p === '60' ? (spec.optional ?? []) : []),
  ];
  const rideMin = spec.rideMin[p];
  return {
    ...w,
    description: w.description.replace(/~\d+\s*min/, `~${p} min`),
    warmup: w.warmup.map((ex) =>
      ex.name === 'Outdoor walk' ? { ...ex, reps: `${rideMin} min` } : ex
    ),
    main,
  };
}
