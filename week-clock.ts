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
// One seam: planForLog needs Workout D (getWorkoutD, which still lives in app.ts), so
// app.ts hands it over once at boot with setWorkoutDProvider (same pattern as bus.ts).

import { loadLogs, weekClockInput } from './state.js';
import * as pw from './program-week.js';
import type { WorkoutId, Workout } from './program.js';
import type { WeekKey, WeekSpan, PendingWeek } from './week.js';
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
