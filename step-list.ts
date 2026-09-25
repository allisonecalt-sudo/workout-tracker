// step-list.ts — the jump list: flatten a workout into one ordered list of
// "steps" (warm-up, main × rounds, upper back) so Done · Next can track what's
// completed and a jump can land on any of them. Pure logic only (no DOM) —
// same discipline as cycle.ts/progression.ts §7: app.ts does the reading of
// live state and the HTML; everything decided here is exercised by
// tests/step-list.test.ts without a browser.
//
// WHY (Sep 25 2026): her words tonight — 01:33 "I dont always do the workouts
// in [order]", then 04:02 clarifying "2" meant the exercises INSIDE a
// workout, not the A/B/C order. The cool-down is deliberately NOT part of
// this list — it's already its own single scrollable checklist screen (v48 ·
// P7), and the whole-workout step count has always treated it as ONE step
// (workoutStepPosition's "+1"); this module keeps that boundary rather than
// inventing a second, competing way to step through the stretches.

export type StepPhase = 'warmup' | 'main' | 'upperBack';

// Structural subset of app.ts's Exercise — kept separate (not imported) so
// this file stays independently testable, the same way cycle.ts defines its
// own CyclePeriod/CapacitySession instead of reaching into app.ts.
export type StepExercise = {
  name: string;
  reps?: string;
  label?: string;
};

export type WorkoutSteps = {
  warmup: StepExercise[];
  main: StepExercise[];
  upperBack?: StepExercise[];
};

export type WorkoutStep = {
  key: string; // `${phase}:${round}:${index}` — round is 1 for warmup/upperBack
  phase: StepPhase;
  round: number;
  index: number;
  groupLabel: string; // "Warm-up" | "Main round N" | "Upper back"
  exercise: StepExercise;
};

export function stepKey(phase: StepPhase, round: number, index: number): string {
  return `${phase}:${round}:${index}`;
}

function groupLabelFor(phase: StepPhase, round: number): string {
  if (phase === 'warmup') return 'Warm-up';
  if (phase === 'upperBack') return 'Upper back';
  return `Main round ${round}`;
}

/** Every jumpable move, warm-up → main (each round in order) → upper back.
 *  `rounds` is the EFFECTIVE round count (already Lite-adjusted — a Lite
 *  session's list has one main group, not the programmed two or three). */
export function flattenSteps(w: WorkoutSteps, rounds: number): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  w.warmup.forEach((exercise, index) => {
    steps.push({
      key: stepKey('warmup', 1, index),
      phase: 'warmup',
      round: 1,
      index,
      groupLabel: groupLabelFor('warmup', 1),
      exercise,
    });
  });
  for (let round = 1; round <= Math.max(1, rounds); round++) {
    w.main.forEach((exercise, index) => {
      steps.push({
        key: stepKey('main', round, index),
        phase: 'main',
        round,
        index,
        groupLabel: groupLabelFor('main', round),
        exercise,
      });
    });
  }
  (w.upperBack ?? []).forEach((exercise, index) => {
    steps.push({
      key: stepKey('upperBack', 1, index),
      phase: 'upperBack',
      round: 1,
      index,
      groupLabel: groupLabelFor('upperBack', 1),
      exercise,
    });
  });
  return steps;
}

/** Forward from `afterKey` (wrapping to the start) for the first step NOT in
 *  `completed` — her spec: "goes to the next step that is NOT done (wrapping
 *  to earlier skipped ones before the cool-down/finish)". `afterKey` itself
 *  is never returned, whether or not it's in `completed` (the caller has
 *  either just marked it done, or is asking "what's left besides this one").
 *  Null when the list is empty or every OTHER step is already done. */
export function nextUndoneStep(
  steps: WorkoutStep[],
  afterKey: string,
  completed: Record<string, boolean>
): WorkoutStep | null {
  const n = steps.length;
  if (n === 0) return null;
  const pos = steps.findIndex((s) => s.key === afterKey);
  const start = pos === -1 ? 0 : pos + 1;
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n;
    if (idx === pos) continue; // never hand back the position we started from
    const step = steps[idx]!;
    if (!completed[step.key]) return step;
  }
  return null;
}

/** How many of `steps` are marked done — the skipped-count on the log is
 *  `steps.length - completedCount(...)`. */
export function completedCount(steps: WorkoutStep[], completed: Record<string, boolean>): number {
  return steps.reduce((n, s) => n + (completed[s.key] ? 1 : 0), 0);
}

/** "Steps reached" for the ONE progress line: every completed step, plus the
 *  step she's currently viewing if it isn't done yet. This is deliberately
 *  NOT the same as `completedCount` — on an ordinary forward walk the two
 *  agree with the old position count exactly (her Sep 24 "N of 23" stays
 *  put), and they only diverge the moment she jumps to view an
 *  already-finished step out of order, where this reads what's actually
 *  DONE instead of a misleading "you're back at step 3" position. */
export function reachedCount(
  steps: WorkoutStep[],
  completed: Record<string, boolean>,
  currentKey: string
): number {
  let n = 0;
  for (const s of steps) {
    if (completed[s.key] || s.key === currentKey) n++;
  }
  return n;
}
