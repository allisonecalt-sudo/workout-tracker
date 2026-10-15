// workout-now.ts - "which workout is she on, and what does it ask" (code-shape step 15a,
// Oct 15 2026). Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the live workout lookups the pre-log, the workout and the post-log screens all
// read: getCurrentWorkout (pinned week key -> pinned date -> the completion model's key),
// Workout D (getWorkoutD / ellipticalStep / ELLIPTICAL_NAME), effectiveRounds (Lite),
// the stepped-moves list (currentSteppedMoves), the "new / back tonight" names,
// skippedStepsCount, reachedWallSit, lastCardioLane, workoutMinutesLabel, displayName.
// WHY: screens/prelog.ts and screens/postlog.ts (15b / 15c) cannot import app.ts, and the
// workout + home screens (16 / 17) will read the same functions: ONE home, no copies.
// RULE: reads state / program / week-clock / the pure modules; never app.ts or a screen;
// writes no DOM (tests/import-graph.test.ts covers it the day app.ts imports it).

import {
  PROGRAM,
  planForWeekKey,
  type WorkoutId,
  type AnyWorkoutId,
  type Exercise,
  type Workout,
  type Phase,
  type WeekPlan,
} from './program.js';
import type { LogEntry } from './types.js';
import { state, loadLogs, type ArmFeelState } from './state.js';
import { flattenSteps, type WorkoutSteps } from './step-list.js';
import { steppedMovesForWorkout, type SteppedMove } from './move-feel.js';
import type { WeekSpan, PendingWeek } from './week.js';
import {
  getWeekPlan,
  isNowAfterCompletionLaunch,
  gapCountsBackToWeekKey,
  shownWeek,
} from './week-clock.js';

export const ELLIPTICAL_NAME = 'Elliptical';

export const ARM_FEEL_STEPS: Record<string, keyof ArmFeelState> = {
  '1 kg biceps curl': 'curl',
  'Prone row (bodyweight)': 'row',
};

export function ellipticalStep(minutes: number): Exercise {
  return {
    name: ELLIPTICAL_NAME,
    reps: `${minutes} min`,
    notes:
      'First two minutes easy. Then raise the level until you can still talk in full sentences, and stay there. Ease off for the last minute.',
    durationSec: minutes * 60,
    isTimed: true,
  };
}

export function getWorkoutById(id: WorkoutId, date?: Date): Workout {
  return getWeekPlan(date).workouts[id];
}

// v54 (Sep 27 2026) — Workout D: "Cardio · 30 min elliptical". Her Sep 27
// NotebookLM reflection: "I definitely don't do enough cardio... maybe what I
// could add is 30 minutes on the elliptical separately... we definitely need
// a 4th element a week... call it Workout D... ideally not the same day as
// another workout, but it can also be if it needs to be." Fixed, not week-
// programmed — it never bumps, never appears in PROGRAM/WeekPlan, and is
// available any day (including a day with A/B/C already done — she was
// explicit it's allowed on the same day, just not the ideal). ONE step: the
// elliptical itself, straight in (no "Outdoor walk" lane picker — D IS the
// ride, so beginExercisesForWorkoutD below forces chooseElliptical(30)
// directly, same as if she'd tapped ▶ Elliptical). No warmup list beyond the
// ride's own note ("First two minutes easy...", ellipticalStep's built-in
// line — her "short warm-up line"), no strength main block, no cool-down
// list (empty cooldown; advanceExercise's cooldown-skip below sends her
// straight to post-log once the ride's done).
export function getWorkoutD(): Workout {
  return {
    id: 'D',
    name: 'Cardio · 30 min elliptical',
    description: 'Steady elliptical, talk-test level 3-5 — extra, on top of A/B/C.',
    warmup: [ellipticalStep(30)],
    main: [],
    cooldown: [],
    rounds: 1,
  };
}

// v58 (Sep 28 2026) — the moves that STEPPED this week for `id`, computed the
// exact same way diffWorkout above already diffs a week against its own
// predecessor in PROGRAM (renderComingNextWeek/renderPastWeeks' own pattern:
// `PROGRAM.indexOf` + `PROGRAM[idx - 1]`) — never a second, competing notion
// of "last week's plan". `id === 'D'` never steps (D isn't in PROGRAM's A/B/C
// rotation at all — see AnyWorkoutId's own comment); the very first encoded
// week (idx 0) has no predecessor, so every one of its moves reads as new —
// same as diffWorkout's own `!prev` branch. Curl/row (ARM_FEEL_STEPS' two
// names) are always excluded — they keep arm_feel, never migrated (her spec
// item 1).
//
// v58 fix pass (Sep 28 2026, checker's must): this used to call
// `getWeekPlan()` (which then went through a made-up calendar date; since v62
// it finds the row by week key) — and diff it against
// `PROGRAM[idx-1]` unconditionally. On a REPEAT week (planForWeekKey's own
// `repeatsWeek` fallback — "same moves as Week N", no new PROGRAM row yet)
// that lands on the SAME row as the week it repeats, so the diff compared
// that row against the week BEFORE the one it repeats and found stepped
// moves that already stepped last week, not this one (repro: Week 5 steps
// the ride 10->12; Week 6 repeats Week 5 with no new row; opening Workout A
// in Week 6 still said "Stepped this week: ride 12 min"). It also ignored
// state.pinnedWeekKey, so a session pinned to one week (startWorkout) could
// ask about a DIFFERENT week's moves if "now" crossed the Sat/Sun boundary
// before she finished. Fixed by resolving the SAME key getCurrentWorkout
// uses (pinnedWeekKey -> pinnedPlanDateIso -> the live completion-model key
// -> the pre-launch calendar scan) and returning [] outright on a repeat
// week — there is nothing to diff, and diffing against the wrong
// predecessor is worse than showing nothing.
function steppedMovesForWorkoutId(id: AnyWorkoutId | null): SteppedMove[] {
  if (!id || id === 'D') return [];
  const excludeNames = new Set(Object.keys(ARM_FEEL_STEPS));
  let current: WeekPlan;
  if (state.pinnedWeekKey) {
    const { plan, repeatsWeek } = planForWeekKey(state.pinnedWeekKey);
    if (repeatsWeek !== null) return [];
    current = plan;
  } else if (state.pinnedPlanDateIso) {
    // Pre-launch pin — same calendar-date lookup getCurrentWorkout's own
    // pinnedPlanDateIso branch uses; PROGRAM has no "repeat" concept there.
    current = getWeekPlan(new Date(state.pinnedPlanDateIso));
  } else if (isNowAfterCompletionLaunch()) {
    const key = gapCountsBackToWeekKey() ?? shownWeek().key;
    const { plan, repeatsWeek } = planForWeekKey(key);
    if (repeatsWeek !== null) return [];
    current = plan;
  } else {
    current = getWeekPlan();
  }
  const idx = PROGRAM.indexOf(current);
  const prev = idx > 0 ? PROGRAM[idx - 1] : undefined;
  return steppedMovesForWorkout(prev?.workouts[id], current.workouts[id], excludeNames);
}

// The live session's own stepped-moves list — the one call site every render
// (the chip, the pre-log line) reads, so they can never quietly disagree
// about which moves stepped tonight.
export function currentSteppedMoves(): SteppedMove[] {
  return steppedMovesForWorkoutId(state.selectedWorkout);
}

export function getCurrentWorkout(): Workout | null {
  if (!state.selectedWorkout) return null;
  // v54 (Sep 27 2026): D is fixed, not week-programmed — resolve it straight
  // off getWorkoutD() and skip every plan/week lookup below (they're all
  // indexed by the PROGRAM-only WorkoutId, which never has a 'D' key). This
  // return also narrows state.selectedWorkout to WorkoutId for the rest of
  // the function, so every `.workouts[state.selectedWorkout]` index below
  // stays exactly as type-safe as it was before D existed.
  if (state.selectedWorkout === 'D') return getWorkoutD();
  // WK4 (Sep 27 2026): the RESOLVED-key pin (post-launch sessions) wins first
  // — see its own comment on AppState.pinnedWeekKey and startWorkout().
  if (state.pinnedWeekKey) {
    return planForWeekKey(state.pinnedWeekKey).plan.workouts[state.selectedWorkout];
  }
  // WK2 (Sep 27 2026): a pinned date (pre-launch sessions, set at
  // startWorkout()) wins over the live "now" — see the pin's own comment
  // there. Exactly one of pinnedWeekKey/pinnedPlanDateIso is ever set.
  if (state.pinnedPlanDateIso) {
    return getWorkoutById(state.selectedWorkout, new Date(state.pinnedPlanDateIso));
  }
  // WK2 fix r1 (Sep 27 2026, checker's should #7): post-launch and UNPINNED
  // (Home/pre-log, before Start is tapped), resolve straight off the
  // completion model's own week key — the SAME lookup that drives every
  // "Week N" / "same moves as" string she reads (preLogWeekLabel,
  // homeWeekTitle, the post-log line) — instead of round-tripping through a
  // SYNTHETIC calendar date and re-deriving the week from it via a date scan
  // (deleted in v62, step 5c; getWeekPlan() now resolves the same way). That
  // round trip could disagree
  // with planForWeekKey the moment a future PROGRAM row's own `startsOn`
  // lands off the round's 7-day grid — she'd train one week's moves while
  // the screen names a different one, with no repeat line to flag it.
  // A session already IN PROGRESS reads its pinned KEY (above) once WK4's
  // startWorkout sets one — this branch is reached only pre-launch, or for a
  // stale snapshot saved before WK4 (readActiveSnapshot resolves that case).
  // WK2 fix r2 (Sep 27 2026, checker's should #2): during a GAP, shownWeek()
  // .key is the PENDING week — exactly what preLogWeekLabel/weekSubLabel
  // already stopped naming here (gapCountsBackToWeekKey). Reading the raw key
  // instead would preview the PENDING week's content while the text right
  // above it says the save counts toward the closed one — a session that
  // hadn't even reached Start yet would already disagree with its own label.
  if (isNowAfterCompletionLaunch()) {
    const key = gapCountsBackToWeekKey() ?? shownWeek().key;
    return planForWeekKey(key).plan.workouts[state.selectedWorkout];
  }
  return getWorkoutById(state.selectedWorkout);
}

// Lite day: one round less than programmed, never below 1 (A/B 3→2, C 2→1).
export function effectiveRounds(w: Workout): number {
  return state.liteDay ? Math.max(1, w.rounds - 1) : w.rounds;
}

// v48 · fix r1 (Sep 24 2026): after "Log what I did", did she get past the wall
// sit? A stop before it (at the hinge, round 1) left an empty "Wall sit (s)"
// asking about a hold she never reached — the post-log hides it then. Reached =
// held something, or stopped on/after its step (phase order warmup → main →
// upperBack → cooldown; any later round of main is past round 1's).
export function reachedWallSit(w: Workout): boolean {
  if (state.wallSitSec > 0) return true;
  const order: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  const here = order.indexOf(state.currentPhase);
  for (const p of order) {
    const i = (w[p] ?? []).findIndex((ex) => ex.name === 'Wall sit');
    if (i < 0) continue;
    const at = order.indexOf(p);
    if (here !== at) return here > at;
    if (p === 'main' && state.currentRound > 1) return true;
    return state.currentExerciseIndex > i;
  }
  return false;
}

// v50 · jump list (Sep 25 2026) — step-list.ts's flat, ordered move list needs
// only the warmup/main/upperBack arrays (never cooldown: that's already its
// own one-step checklist screen, see step-list.ts's module doc). Structural
// adapter only — Exercise already satisfies StepExercise's shape.
export function toStepWorkout(w: Workout): WorkoutSteps {
  return { warmup: w.warmup, main: w.main, upperBack: w.upperBack };
}

// v50 · jump list (Sep 25 2026): how many warm-up/main/upper-back moves never
// got a Done tap this session — the post-log's plain "N moves skipped" line
// and the steps_skipped column (no verdict either place, just the count).
//
// v50 · fix (Sep 25 2026): "Finish here — it still counts" (finishAtRoundOne)
// deliberately drops round 2+ AND the upper-back block — effectiveRounds()
// above already takes round 2+ out of `movable`, but upper-back stayed in
// it, so a floor the app itself just told her "still counts" logged "6 moves
// skipped" right under "Nice. Workout A done." — a mixed message. Leave out
// the same steps the floor removed on purpose, the same way Lite leaves out
// round 2: when finishHereLitePrev is set (non-null = "Finish here" was
// tapped this session), upper-back doesn't count as skipped either.
export function skippedStepsCount(w: Workout): number {
  const movable = flattenSteps(toStepWorkout(w), effectiveRounds(w));
  const countable =
    state.finishHereLitePrev !== null ? movable.filter((s) => s.phase !== 'upperBack') : movable;
  return countable.filter((s) => state.completedSteps[s.key] !== true).length;
}

// v48 · P3 (Sep 24 2026): the cardio step's name on screen. The key stays
// 'Outdoor walk' in PROGRAM / DETAIL / HOWTO / VISUALS (and in saved data); she
// sees "Cardio" — her Sep 24 words: "no more walk it could be walk or elliptical".
// v48 · fix r2 (Sep 25 2026): takes the Exercise, so a per-week `label` (the
// Week-4 "Hip hinge") wins everywhere she reads the name — step title, the
// pre-log list, the rest screen's "Next ·" line, the round-break line.
export function displayName(ex: Pick<Exercise, 'name' | 'label'>): string {
  if (ex.label) return ex.label;
  return ex.name === 'Outdoor walk' ? 'Cardio' : ex.name;
}

// v48 · P3 — lane memory (DECISIONS §2 #3): the lane of her newest saved
// session. The cardio_lane column first; a v47 row only carries the notes
// marker ("cardio: elliptical …" / "cardio: apartment …").
export function lastCardioLane(): LogEntry['cardioLane'] {
  const newest = [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!newest) return null;
  if (newest.cardioLane) return newest.cardioLane;
  const m = /cardio: (elliptical|apartment)\b/.exec(newest.notes ?? '');
  return m?.[1] === 'elliptical' || m?.[1] === 'apartment' ? m[1] : null;
}

// Minutes from the workout's own description ("… · ~40 min"); 30 if it has none.
export function workoutMinutesLabel(w: Workout): string {
  const m = /~(\d+)\s*min/.exec(w.description);
  return `~${m?.[1] ?? '30'} min`;
}

// v48 · fix r1 (Sep 24 2026): "new" splits in two. A move that sat in ANY
// earlier week of the program (any workout, any block) is a RETURN, not a first
// — the 1 kg curl and the prone row were in her Round 1 Week 7 (UPPER_BACK_W7,
// Jun 13-19) before the arm pause, so "Firsts: 1 kg biceps curl" told her
// something untrue about her own history (fail-loud rule). Returns read "Back".
type TonightKind = 'new' | 'back';

// v48 (Sep 24 2026): "New tonight" — a move that wasn't in this workout last
// encoded week AND she hasn't done this workout since the week began. Her first
// split squat sat on the same face as her 40th bridge (walk-in-her-shoes: "A
// 'New tonight' badge"). Nothing to decide — a label, gone after one session.
// Reused by P4/P5 (pre-log overview, home hero).
function isNewTonight(ex: Exercise, id: AnyWorkoutId): boolean {
  // v54 (Sep 27 2026): D has no PROGRAM history to compare against (it isn't
  // week-versioned at all — see getWorkoutD's own comment) — never "new
  // tonight"/"again tonight" for it.
  if (id === 'D') return false;
  const current = getWeekPlan();
  const idx = PROGRAM.indexOf(current);
  const prev = idx > 0 ? PROGRAM[idx - 1] : undefined;
  if (!prev) return false; // Week 1 of the program: everything is new, so nothing is
  const pw = prev.workouts[id];
  const phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  if (phases.some((p) => (pw[p] ?? []).some((e) => e.name === ex.name))) return false;
  const startMs = new Date(current.startsOn + 'T00:00:00').getTime();
  return !loadLogs().some((l) => l.workout === id && new Date(l.date).getTime() >= startMs);
}

function wasInEarlierWeek(name: string): boolean {
  const idx = PROGRAM.indexOf(getWeekPlan());
  if (idx <= 0) return false;
  const phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  return PROGRAM.slice(0, idx).some((week) =>
    (['A', 'B', 'C'] as WorkoutId[]).some((wid) =>
      phases.some((p) => (week.workouts[wid][p] ?? []).some((e) => e.name === name))
    )
  );
}

export function tonightKind(ex: Exercise, id: AnyWorkoutId): TonightKind | null {
  if (!isNewTonight(ex, id)) return null;
  return wasInEarlierWeek(ex.name) ? 'back' : 'new';
}

// Moves new (or back, v48 · fix r1) in this workout tonight, lower-cased, once
// each, over the given blocks.
export function tonightNames(
  w: Workout,
  id: AnyWorkoutId,
  want: TonightKind,
  phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown']
): string[] {
  const out: string[] = [];
  for (const p of phases) {
    for (const ex of w[p] ?? []) {
      // Terse: "prone row", not "prone row (bodyweight)" — the hero line stays
      // one line at phone width (the step itself keeps the full name).
      const name = displayName(ex)
        .replace(/\s*\([^)]*\)/g, '')
        .toLowerCase();
      if (tonightKind(ex, id) === want && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

export function liveWeekDTarget(shown: {
  span: WeekSpan | null;
  pending: PendingWeek | null;
}): { span: WeekSpan } | { open: WeekSpan } | { pending: true } | null {
  if (shown.span) return { open: shown.span };
  if (shown.pending) return { pending: true };
  return null;
}
