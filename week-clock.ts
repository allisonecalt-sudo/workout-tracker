// week-clock.ts - the week clock's thin wrappers, in ONE shared module (code-shape
// step 9-0, Oct 14 2026). They used to live in app.ts (step 4, Oct 13 2026) with two
// of them copied into screens/rides.ts; app.ts and every screen now import them from
// here. Moved verbatim.
//
// The logic lives in program-week.ts and is PURE: it takes the logs, the stored week
// moves and the clock ("now") as parameters. These wrappers keep every call site
// unchanged by supplying today's values - the storage reads (loadLogs, loadWeekMoves)
// and `new Date()` are gathered by weekClockInput() in state.ts. (Sick/break weeks are
// entries in SKIPPED_WEEKS, program.ts; there is no app branch for tests.)
//
// App-side module: may read state.ts / storage, never imports app.ts or a screen.
// 13a (Oct 15 2026): getWeekPlan, weekHasDFor and firstProgramSaturday joined, moved verbatim -
// Progress and Weekly review (screens) and Home all read them. Pure value imports only
// (program.ts, week-d.ts): no load-order change.
// One seam: planForLog needs Workout D (getWorkoutD, which still lives in app.ts), so
// app.ts hands it over once at boot with setWorkoutDProvider (same pattern as bus.ts).

import { loadLogs, weekClockInput } from './state.js';
import * as pw from './program-week.js';
import {
  programWeekPlan,
  PROGRAM_START_DATE,
  type WeekPlan,
  type WorkoutId,
  type Workout,
} from './program.js';
import type { WeekKey, WeekSpan, PendingWeek } from './week.js';
import {
  weekHasD,
  type DWeekModel,
  type DLogLite as WeekDLogLite,
  type DWeekTarget,
} from './week-d.js';
import type { LogEntry } from './types.js';

let workoutDProvider: (() => Workout) | null = null;

/** app.ts registers getWorkoutD here once, at boot (planForLog needs the fixed D workout). */
export function setWorkoutDProvider(fn: () => Workout): void {
  workoutDProvider = fn;
}

function getWorkoutD(): Workout {
  if (workoutDProvider === null) {
    throw new Error('week-clock.planForLog() called before setWorkoutDProvider()');
  }
  return workoutDProvider();
}

export function getProgramWeek(date: Date = new Date()): ReturnType<typeof pw.getProgramWeek> {
  return pw.getProgramWeek(date);
}

export function getTodaysPick(): WorkoutId {
  return pw.getTodaysPick(loadLogs(), new Date());
}

export function saturdayForOffset(offset: number): Date {
  return pw.saturdayForOffset(offset, new Date());
}

export function homeWeekOffset(): number {
  return pw.homeWeekOffset(loadLogs(), new Date());
}

/** PRE-launch only: the date a new session pins (see startWorkout). */
export function preLaunchPlanDate(): Date {
  return pw.preLaunchPlanDate(weekClockInput());
}

export function planKeyForLog(entry: LogEntry): WeekKey | null {
  return pw.planKeyForLog(entry, weekClockInput());
}

export function planForLog(entry: LogEntry): Workout {
  return pw.planForLog(entry, weekClockInput(), getWorkoutD);
}

export function getViewedProgramWeek(offset = 0): ReturnType<typeof pw.getProgramWeek> {
  return pw.getViewedProgramWeek(offset, new Date());
}

export function isNowAfterCompletionLaunch(now: Date = new Date()): boolean {
  return pw.isNowAfterCompletionLaunch(now);
}

export function weekModel(): ReturnType<typeof pw.weekModel> {
  return pw.weekModel(weekClockInput());
}

export function completionClosingSessionIds(logs: LogEntry[]): Set<string> {
  return pw.completionClosingSessionIds(weekClockInput(logs));
}

export function shownWeek(): ReturnType<typeof pw.shownWeek> {
  return pw.shownWeek(weekClockInput());
}

export function gapCountsBackToWeekKey(): WeekKey | null {
  return pw.gapCountsBackToWeekKey(weekClockInput());
}

export function gapCountsBackToWeekNum(): number | null {
  return pw.gapCountsBackToWeekNum(weekClockInput());
}

export function weekSubLabel(shown: {
  span: WeekSpan | null;
  pending: PendingWeek | null;
}): string {
  return pw.weekSubLabel(shown, weekClockInput());
}

export function currentHowToWeekKey(): { num: number; round: number } {
  return pw.currentHowToWeekKey(weekClockInput());
}

// Thin wrappers over program.ts's pure resolvers. With NO date they answer for
// "now": program-week.ts's currentWeekPlan() - post-launch the completion
// model's week KEY resolves straight to its PROGRAM row (v62, step 5c; no
// synthetic calendar date), pre-launch the original calendar + swing lookup.
// With a date they are the plain calendar scan (history, pinned pre-launch
// sessions). Every call site stays untouched and tests can still mock the
// system clock.
export function getWeekPlan(date?: Date): WeekPlan {
  return date ? programWeekPlan(date) : pw.currentWeekPlan(weekClockInput());
}

// v61 (Sep 28 2026), spec item d — her words 15:35, looking at her first
// Workout D: "she did not say one of four." D never counts toward the week
// CLOSING (week.ts's own completion rule is untouched — three distinct
// A/B/C letters, D never required, never part of `span.missing`), but it
// DOES count toward the number shown to her. week.ts drops D entirely by
// design (its own header comment), so this reads it straight off her logs
// instead.
//
// v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 must #1): the window a D
// counts against moved out of here into week-d.ts (a pure module, unit-
// tested — round 1's should #7) — a strict [openedAt, closedAt] window
// undercounted a D logged before the opening session or after the closing
// one, both real on her rows. `weekHasDFor` below is a thin app.ts-side
// wrapper: it builds the `DWeekTarget` week-d.ts needs from whichever of
// `span`/`open`/`pending` a call site already has in hand, so every call
// site below only changes its OWN local target-selection, never the window
// math itself (that lives once, in week-d.ts, covered by its own tests).
export function weekHasDFor(
  which: { span: WeekSpan } | { open: WeekSpan } | { pending: true } | null,
  model: DWeekModel,
  dLogs: readonly WeekDLogLite[]
): boolean {
  if (!which) return false;
  const target: DWeekTarget =
    'open' in which
      ? { kind: 'open' }
      : 'pending' in which
        ? { kind: 'pending' }
        : { kind: 'span', key: which.span.key };
  return weekHasD(target, model, dLogs);
}

// The Saturday the program's first week starts on — the ‹ arrow stops there.
export function firstProgramSaturday(): Date {
  const start = new Date(PROGRAM_START_DATE + 'T00:00:00');
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}
