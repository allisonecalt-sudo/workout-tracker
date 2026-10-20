// weeks-grid.ts - the week-by-week rows behind "weeks you showed up" (v64, Oct 20 2026).
//
// What: ONE walk over every program week - the legacy calendar weeks, the completion-model
// weeks (Week 5 on) and the Sick weeks the clock paused for - giving each its count, its
// state (full / partial / sick / break / held / now) and the Weekly review page it opens.
// Why here: Progress draws the weeks grid and says "N full weeks"; Home says the same
// "Since May: N full weeks" in one line; the Weekly review reads "your usual" from the same
// rows. Three screens, one count: so the rows are built once, in a shared module (a screen
// never imports another screen). Moved out of screens/progress.ts (the v48 "Sessions per
// week" card), logic unchanged except the new `offset` / `weekNum` / sick-cell fields.
//
// Shared layer: strings and numbers out, no DOM, never imports app.ts or a screen.

import { COMPLETION_WEEKS_FROM, LEGACY_LAST_CLOSED_WEEK_INSTANT } from './week.js';
import { getRoundFor } from './program.js';
import type { LogEntry } from './types.js';
import {
  getProgramWeek,
  firstProgramSaturday,
  isNowAfterCompletionLaunch,
  weekModel,
  weekHasDFor,
} from './week-clock.js';
import {
  SESSIONS_PER_WEEK_TARGET,
  attributeSessionsToWeeks,
  sessionsAttributedTo,
  sickWeeksForWeekModel,
} from './program-week.js';

export type WeekRow = {
  label: string;
  // The A/B/C met count (the "full week" rule keys on this alone).
  value: number;
  round: number;
  // The week's number inside its round (0 for a Sick/Break cell: it has no number).
  weekNum: number;
  isCurrent: boolean;
  skipped: boolean;
  // 'Sick' / 'Break' for a skipped week, else null.
  skipLabel: string | null;
  // v48 fix r1: a 0-session week inside a sick/break stretch or after a closed
  // round's last session - shown as "held", not scored.
  held?: boolean;
  // WK4: a completion-model row's own "how" ("moved on" / "open").
  suffix?: string;
  // The Sick pause (or a round ending) closed this week before it was done: it is
  // counted, but it is not a "normal" week for "your usual".
  cutShort?: boolean;
  // v61: a completion-model row counts D into what is SHOWN ("N / 4").
  displayValue?: number;
  displayTarget?: number;
  // The Weekly review pager offset that opens this week (null = no page: a Sick
  // week the completion clock paused for has no review page of its own).
  offset: number | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const weeksBetween = (laterMs: number, earlierMs: number): number =>
  Math.round((laterMs - earlierMs) / WEEK_MS);

/** The count a week SHOWS (D counted in on a completion-model week). */
export function shownWeekCount(r: WeekRow): number {
  return r.displayValue ?? r.value;
}

/** A week that is counted (not Sick/Break, not held, not the one in progress). */
export function isJudgedWeek(r: WeekRow): boolean {
  return !r.isCurrent && !r.skipped && !r.held;
}

/** A full week = A, B and C met. */
export function isFullWeek(r: WeekRow): boolean {
  return isJudgedWeek(r) && r.value >= SESSIONS_PER_WEEK_TARGET;
}

export function buildWeekRows(logs: LogEntry[]): WeekRow[] {
  // One entry per program week from PROGRAM_START_DATE forward through the
  // current week.
  const firstSat = firstProgramSaturday();

  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4: the legacy calendar walk stops at
  // the last week the OLD swing model ever closed (Week 4, the FIXED
  // LEGACY_LAST_CLOSED_WEEK_INSTANT anchor) once "now" is past the real launch -
  // never "today". Before the launch, unchanged: the walk runs to today's own
  // calendar Saturday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSat = new Date(today);
  thisSat.setDate(today.getDate() - daysSinceSat);
  thisSat.setHours(0, 0, 0, 0);
  const afterLaunch = isNowAfterCompletionLaunch();
  const legacyWalkEnd = afterLaunch
    ? (() => {
        const d = new Date(LEGACY_LAST_CLOSED_WEEK_INSTANT);
        d.setHours(0, 0, 0, 0);
        return d;
      })()
    : thisSat;

  // The Weekly review pages are numbered newest-first: the completion pages come
  // first (the open week, then every closed one), then the legacy Saturdays back
  // from the anchor - review.ts pages the same way.
  const model = afterLaunch ? weekModel() : null;
  const completionPageCount = model ? (model.open ? 1 : 0) + model.spans.length : 0;

  const rows: WeekRow[] = [];
  const cursor = new Date(firstSat);
  // Swing-aware (v42): same attribution as the 3-slot rows and the week card.
  const attribution = attributeSessionsToWeeks(logs);
  while (cursor.getTime() <= legacyWalkEnd.getTime()) {
    const weekStart = new Date(cursor);
    const count = sessionsAttributedTo(logs, weekStart, attribution).length;
    const pw = getProgramWeek(weekStart);
    // Pre-launch, the walk's own last iteration IS "now" - post-launch, the
    // walk never reaches a live week at all (the completion rows below own
    // "now" instead).
    const isCurrent = !afterLaunch && weekStart.getTime() === legacyWalkEnd.getTime();
    rows.push({
      label: isCurrent ? 'now' : pw.skippedLabel ? pw.skippedLabel.toLowerCase() : `wk ${pw.num}`,
      value: count,
      round: pw.round,
      weekNum: pw.skippedLabel ? 0 : pw.num,
      isCurrent,
      skipped: pw.skippedLabel !== null,
      skipLabel: pw.skippedLabel,
      offset: afterLaunch
        ? completionPageCount + weeksBetween(legacyWalkEnd.getTime(), weekStart.getTime())
        : weeksBetween(thisSat.getTime(), weekStart.getTime()),
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  // v48 fix r1: a 0-session week that sits next to a sick/break week, or after a
  // closed round's last session, is part of that stretch (her Jul 19 rule: a
  // break is not a miss). Worked out from the original rows so it never chains.
  // Scoped to the legacy rows only - a completion row carries its own honest state.
  const legacyRoundNum = getRoundFor(legacyWalkEnd).num;
  const lastActiveIdx = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.value > 0) lastActiveIdx.set(r.round, i);
  });
  const held = rows.map((r, i) => {
    if (r.skipped || r.isCurrent || r.value > 0) return false;
    if (rows[i - 1]?.skipped || rows[i + 1]?.skipped) return true;
    const last = lastActiveIdx.get(r.round);
    return r.round < legacyRoundNum && last !== undefined && i > last;
  });
  held.forEach((h, i) => {
    const r = rows[i];
    if (h && r) r.held = true;
  });

  // WK4: the completion-model rows, Week 5 on - one row per CLOSED span, plus the
  // live OPEN span if one exists. The Sick weeks the clock paused for sit between
  // them (v64: a grey, labelled cell - never an empty gap, never a miss).
  if (model) {
    const { spans, open } = model;
    const dLogs = logs.filter((l) => l.workout === 'D');
    const completionRows: { at: number; row: WeekRow }[] = [];
    spans.forEach((span, i) => {
      const hasD = weekHasDFor({ span }, model, dLogs);
      completionRows.push({
        at: new Date(span.openedAt).getTime(),
        row: {
          label: `wk ${span.key.week}`,
          value: span.done.length,
          round: span.key.round,
          weekNum: span.key.week,
          isCurrent: false,
          skipped: false,
          skipLabel: null,
          suffix: span.how === 'moved_on' ? 'moved on' : undefined,
          cutShort: span.how === 'sick' || span.how === 'round_ended',
          displayValue: span.done.length + (hasD ? 1 : 0),
          displayTarget: 4,
          offset: (open ? 1 : 0) + (spans.length - 1 - i),
        },
      });
    });
    if (open) {
      const openHasD = weekHasDFor({ open }, model, dLogs);
      completionRows.push({
        at: new Date(open.openedAt).getTime(),
        row: {
          label: `wk ${open.key.week}`,
          value: open.done.length,
          round: open.key.round,
          weekNum: open.key.week,
          isCurrent: true,
          skipped: false,
          skipLabel: null,
          suffix: 'open',
          displayValue: open.done.length + (openHasD ? 1 : 0),
          displayTarget: 4,
          offset: 0,
        },
      });
    }
    // The Sick Saturdays the completion clock held (week.ts honours only those that
    // began after the launch and by now).
    const launchMs = new Date(COMPLETION_WEEKS_FROM.at).getTime();
    const nowMs = new Date().getTime();
    for (const sat of sickWeeksForWeekModel()) {
      const satMs = new Date(sat + 'T00:00:00').getTime();
      if (satMs < launchMs || satMs > nowMs) continue;
      const nearest = [...completionRows].reverse().find((c) => c.at <= satMs) ?? completionRows[0];
      completionRows.push({
        at: satMs,
        row: {
          label: 'sick',
          value: 0,
          round: nearest?.row.round ?? legacyRoundNum,
          weekNum: 0,
          isCurrent: false,
          skipped: true,
          skipLabel: 'Sick',
          offset: null,
        },
      });
    }
    completionRows.sort((a, b) => a.at - b.at);
    for (const c of completionRows) rows.push(c.row);
  }

  return rows;
}

export type FullWeeksSummary = {
  /** Weeks that were counted at all (the denominator of nothing: only to know "none yet"). */
  judged: number;
  /** Weeks with A, B and C met. */
  full: number;
};

export function fullWeeksSummary(rows: readonly WeekRow[]): FullWeeksSummary {
  const judgedRows = rows.filter(isJudgedWeek);
  return { judged: judgedRows.length, full: judgedRows.filter(isFullWeek).length };
}

/** "Your usual" for a Weekly review page: the median of the shown counts of the 4 normal
 *  weeks before it (a normal week = counted: not Sick/Break, not held, not the open one,
 *  and not one the Sick pause cut short). null until 4 such weeks exist. */
export function usualWeekCount(rows: readonly WeekRow[], pageOffset: number): number | null {
  const older = rows
    .filter((r) => r.offset !== null && r.offset > pageOffset && isJudgedWeek(r) && !r.cutShort)
    .sort((a, b) => (a.offset as number) - (b.offset as number))
    .slice(0, 4);
  if (older.length < 4) return null;
  const counts = older.map(shownWeekCount).sort((a, b) => a - b);
  const mid = counts.length / 2;
  return ((counts[mid - 1] as number) + (counts[mid] as number)) / 2;
}
