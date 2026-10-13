// tests/program-week.test.ts — the week clock glue, now pure (code-shape step 4c,
// Oct 13 2026).
//
// program-week.ts takes the logs, the stored week moves, "now" and the
// test-only sick-week switch as PARAMETERS, so every question the app asks
// ("which week is it?", "which plan did this session use?") can be asked here
// in plain Node, with no browser, no storage and no mocked window.Date.
//
// No `page` fixture, so Playwright runs these in Node (like week.test.ts).
// The Oct 3 Sick week and the Week 6 rows are the REAL program data
// (program.ts SKIPPED_WEEKS / PROGRAM); the one test that needs a second Sick
// week adds it for its own duration and restores it.

import { test, expect } from '@playwright/test';
import {
  type WeekClockInput,
  completionClosingSessionIds,
  currentHowToWeekKey,
  currentWeekPlan,
  preLaunchPlanDate,
  saturdayForOffset,
  gapCountsBackToWeekKey,
  getProgramWeek,
  getTodaysPick,
  homeWeekOffset,
  isNowAfterCompletionLaunch,
  planForLog,
  planKeyForLog,
  shownWeek,
  sickWeeksForWeekModel,
  weekModel,
  weekSubLabel,
} from '../program-week';
import { SKIPPED_WEEKS, planForWeekKey, programWeekPlan, type Workout } from '../program';
import type { LogEntry } from '../types';

/** A minimal saved session; only the fields the week clock reads matter. */
function log(id: string, date: string, workout: LogEntry['workout']): LogEntry {
  return {
    id,
    date,
    workout,
    capacityBefore: null,
    capacityAfter: null,
    wallSitSec: 0,
    backPain: null,
    word: '',
  };
}

// Her real Week 5 (Round 2): B Sep 26 22:14, A Sep 28, B-labelled hike Oct 1.
// Two distinct letters, never the third — so Week 5 never closes by itself.
const WEEK5: LogEntry[] = [
  log('b1', '2026-09-26T22:14:00+03:00', 'B'),
  log('a1', '2026-09-28T18:00:00+03:00', 'A'),
  log('b2', '2026-10-01T10:00:00+03:00', 'B'),
];

function input(over: Partial<WeekClockInput> & { now: Date }): WeekClockInput {
  return { logs: WEEK5, moves: [], ignoreSick: false, ...over };
}

const OCT_13 = new Date('2026-10-13T12:00:00+03:00');

test.describe('program-week — the Sick week and the clock it pauses', () => {
  test('the Oct 3 Sick week closes Week 5 (sick) and opens Week 6 on Sat Oct 10', () => {
    const i = input({ now: OCT_13 });
    const { spans, open } = weekModel(i);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.key).toEqual({ round: 2, week: 5 });
    expect(spans[0]!.how).toBe('sick');
    expect(spans[0]!.closedAt!.startsWith('2026-10-03')).toBe(true);
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(open!.openedAt.startsWith('2026-10-10')).toBe(true);
    expect(shownWeek(i).key).toEqual({ round: 2, week: 6 });
    expect(gapCountsBackToWeekKey(i)).toBeNull(); // no gap: Week 6 is open
  });

  test('inside the Sick week Week 6 is pending, and a session started now counts BACK into Week 5', () => {
    const i = input({ now: new Date('2026-10-06T12:00:00+03:00') });
    const shown = shownWeek(i);
    expect(shown.span).toBeNull();
    expect(shown.pending!.key).toEqual({ round: 2, week: 6 });
    expect(gapCountsBackToWeekKey(i)).toEqual({ round: 2, week: 5 });
    expect(weekSubLabel(shown, i)).toContain('opens Sat Oct 10');
    expect(weekSubLabel(shown, i)).toContain('counts as an extra for Week 5');
  });

  test('two CONTIGUOUS Sick weeks (Oct 3 + Oct 10) open Week 6 on Oct 17', () => {
    const before = SKIPPED_WEEKS['2026-10-10'];
    SKIPPED_WEEKS['2026-10-10'] = 'Sick';
    try {
      const i = input({ now: new Date('2026-10-20T12:00:00+03:00') });
      const { spans, open } = weekModel(i);
      expect(spans).toHaveLength(1);
      expect(spans[0]!.how).toBe('sick');
      expect(open!.key).toEqual({ round: 2, week: 6 });
      expect(open!.openedAt.startsWith('2026-10-17')).toBe(true);
      // (step 5c) the plan row is found by KEY, so the extra Sick week moves
      // nothing there: Week 6 is still the R2 W6 row
      expect(currentWeekPlan(i)).toBe(planForWeekKey({ round: 2, week: 6 }).plan);
    } finally {
      if (before === undefined) delete SKIPPED_WEEKS['2026-10-10'];
      else SKIPPED_WEEKS['2026-10-10'] = before;
    }
  });

  test('ignoreSick = true is the plain model: Week 5 stays open, no Sick weeks listed', () => {
    const plain = input({ now: OCT_13, ignoreSick: true });
    expect(sickWeeksForWeekModel(true)).toEqual([]);
    expect(sickWeeksForWeekModel(false)).toContain('2026-10-03');
    const { spans, open } = weekModel(plain);
    expect(spans).toEqual([]);
    expect(open!.key).toEqual({ round: 2, week: 5 });
    expect(open!.missing).toEqual(['C']);
  });

  test('completionClosingSessionIds: nothing closed by a session yet (Week 5 closed as sick); a third letter closes it', () => {
    expect(completionClosingSessionIds(input({ now: OCT_13 })).size).toBe(0);
    const three = [
      log('c1', '2026-09-27T10:00:00+03:00', 'A'),
      log('c2', '2026-09-28T10:00:00+03:00', 'B'),
      log('c3', '2026-09-29T10:00:00+03:00', 'C'),
    ];
    const ids = completionClosingSessionIds(input({ now: OCT_13, logs: three }));
    expect([...ids]).toEqual(['c3']);
  });
});

test.describe('program-week — before the launch the calendar model is kept', () => {
  test('isNowAfterCompletionLaunch: Sep 1 is before, Oct 13 is after', () => {
    expect(isNowAfterCompletionLaunch(new Date(2026, 8, 1, 12))).toBe(false);
    expect(isNowAfterCompletionLaunch(OCT_13)).toBe(true);
  });

  test('a pre-launch "now" uses the calendar: planDateNow is just now; the how-to week is the calendar week', () => {
    const now = new Date(2026, 8, 15, 12, 0, 0); // Tue Sep 15, Round 2 calendar week 3
    const i = input({ now, logs: [] });
    expect(preLaunchPlanDate(i).getTime()).toBe(now.getTime()); // (was planDateNow before step 5c)
    expect(currentHowToWeekKey(i)).toMatchObject({ num: 3, round: 2 });
  });

  test('a pre-launch session has no completion-model week key and its plan comes from the calendar lookup', () => {
    const early = log('e1', new Date(2026, 8, 1, 10).toISOString(), 'A');
    const i = input({ now: OCT_13, logs: [early] });
    expect(planKeyForLog(early, i)).toBeNull();
    const plan = planForLog(early, i, () => {
      throw new Error('D is not asked for here');
    });
    expect(plan.id).toBe('A');
  });
});

test.describe('program-week — which plan a saved session used', () => {
  test("a session in Week 6 (Oct 11) resolves to key 2/6 and to that week's own A", () => {
    const w6 = log('w6', '2026-10-11T10:00:00+03:00', 'A');
    const i = input({ now: OCT_13, logs: [...WEEK5, w6] });
    expect(planKeyForLog(w6, i)).toEqual({ round: 2, week: 6 });
    expect(planForLog(w6, i, () => ({}) as Workout)).toBe(
      planForWeekKey({ round: 2, week: 6 }).plan.workouts.A
    );
  });

  test('the same answer when the session is not saved yet (sessionPayload runs before the save)', () => {
    const w6 = log('w6', '2026-10-11T10:00:00+03:00', 'A');
    expect(planKeyForLog(w6, input({ now: OCT_13, logs: WEEK5 }))).toEqual({ round: 2, week: 6 });
  });

  test('a Week 5 session (Sep 28) still resolves to 2/5, not the week after the Sick pause', () => {
    const i = input({ now: OCT_13 });
    expect(planKeyForLog(WEEK5[1]!, i)).toEqual({ round: 2, week: 5 });
  });

  test('Workout D never has a week key: planForLog hands back the fixed D workout', () => {
    const d = log('d1', '2026-10-12T10:00:00+03:00', 'D');
    const fixedD = { id: 'D' } as Workout;
    expect(planForLog(d, input({ now: OCT_13, logs: [...WEEK5, d] }), () => fixedD)).toBe(fixedD);
  });
});

test.describe('program-week — getProgramWeek counts Sick weeks out of the number', () => {
  test('Round 2 started Sat Aug 29: Oct 10 is calendar week 7 but program Week 6 (one Sick skip)', () => {
    const w = getProgramWeek(new Date(2026, 9, 12, 12)); // Mon Oct 12
    expect(w.round).toBe(2);
    expect(w.num).toBe(6);
    expect(w.skippedLabel).toBeNull();
    expect(getProgramWeek(new Date(2026, 9, 20, 12)).num).toBe(7); // Oct 17-23
  });

  test('the Sick week itself keeps the number it would have had, and says why', () => {
    const w = getProgramWeek(new Date(2026, 9, 5, 12)); // Mon Oct 5
    expect(w.num).toBe(6);
    expect(w.skippedLabel).toBe('Sick');
  });

  test('Round 1 skips (the July Sick week) never leak into Round 2 numbering', () => {
    expect(getProgramWeek(new Date(2026, 8, 1, 12))).toMatchObject({ round: 2, num: 1 });
  });
});

test.describe('program-week — the swing Saturday (calendar model)', () => {
  test("Saturday with last week at 2 of 3: home shows last week, and today's pick is the missing letter", () => {
    const logs = [
      log('s1', new Date(2026, 8, 21, 10).toISOString(), 'A'), // Mon Sep 21
      log('s2', new Date(2026, 8, 23, 10).toISOString(), 'B'), // Wed Sep 23
    ];
    const sat = new Date(2026, 8, 26, 12); // Sat Sep 26
    expect(homeWeekOffset(logs, sat)).toBe(1);
    expect(getTodaysPick(logs, sat)).toBe('C');
    // any other weekday never swings
    expect(homeWeekOffset(logs, new Date(2026, 8, 25, 12))).toBe(0);
  });

  test("no sessions at all: today's pick is A", () => {
    expect(getTodaysPick([], OCT_13)).toBe('A');
  });
});

// Step 5c (Oct 13 2026) — the plan row for "now" is found BY WEEK KEY
// (planForWeekKey), not by turning the key into a synthetic calendar date and
// scanning PROGRAM's startsOn column. Written BEFORE the change: these name the
// new surface (currentWeekPlan / preLaunchPlanDate) and the old one's absence.
test.describe('program-week — step 5c: the plan row is found by week key', () => {
  const rowOf = (i: WeekClockInput): string => {
    const p = currentWeekPlan(i);
    return `R${p.round ?? 1}W${p.weekNum}`;
  };

  test('Week 6 open (Oct 13): the plan is the R2 W6 row, resolved by key', () => {
    const i = input({ now: OCT_13 });
    expect(currentWeekPlan(i)).toBe(planForWeekKey({ round: 2, week: 6 }).plan);
    expect(rowOf(i)).toBe('R2W6');
  });

  test('inside the Sick week (Oct 6): a session counts back, so the plan is the CLOSED Week 5 row', () => {
    const i = input({ now: new Date('2026-10-06T12:00:00+03:00') });
    expect(gapCountsBackToWeekKey(i)).toEqual({ round: 2, week: 5 });
    expect(currentWeekPlan(i)).toBe(planForWeekKey({ round: 2, week: 5 }).plan);
  });

  test('before the Sick week (Sep 29) the plan is the Week 5 row', () => {
    expect(rowOf(input({ now: new Date('2026-09-29T09:00:00+03:00') }))).toBe('R2W5');
  });

  test('the repeat case: Week 7 has no PROGRAM row, so it repeats the Week 6 row', () => {
    const w6: LogEntry[] = [
      ...WEEK5,
      log('w6a', '2026-10-12T10:00:00+03:00', 'A'),
      log('w6c', '2026-10-14T10:00:00+03:00', 'C'),
    ];
    const moves = [
      { round: 2, week: 6, at: '2026-10-24T10:00:00+03:00', missing: '' },
    ] as WeekClockInput['moves'];
    const i = input({ now: new Date('2026-10-25T12:00:00+03:00'), logs: w6, moves });
    expect(shownWeek(i).key).toEqual({ round: 2, week: 7 });
    expect(planForWeekKey({ round: 2, week: 7 }).repeatsWeek).toBe(6);
    expect(currentWeekPlan(i)).toBe(planForWeekKey({ round: 2, week: 6 }).plan);
  });

  test('the gap case: Week 6 closed on a Wednesday; Thu-Fri a session counts back (Week 6 row), Sat on Week 7 (repeat of 6)', () => {
    const three: LogEntry[] = [
      ...WEEK5,
      log('g1', '2026-10-12T10:00:00+03:00', 'A'),
      log('g2', '2026-10-13T10:00:00+03:00', 'B'),
      log('g3', '2026-10-14T10:00:00+03:00', 'C'),
    ];
    const thu = input({ now: new Date('2026-10-15T12:00:00+03:00'), logs: three });
    expect(shownWeek(thu).pending!.key).toEqual({ round: 2, week: 7 });
    expect(gapCountsBackToWeekKey(thu)).toEqual({ round: 2, week: 6 });
    expect(currentWeekPlan(thu)).toBe(planForWeekKey({ round: 2, week: 6 }).plan);
    const sat = input({ now: new Date('2026-10-17T09:00:00+03:00'), logs: three });
    expect(shownWeek(sat).key).toEqual({ round: 2, week: 7 });
    expect(currentWeekPlan(sat)).toBe(planForWeekKey({ round: 2, week: 6 }).plan);
  });

  test('a SECOND Sick week does not move the row: the key still finds the R2 W6 row', () => {
    const before = SKIPPED_WEEKS['2026-10-10'];
    SKIPPED_WEEKS['2026-10-10'] = 'Sick';
    try {
      const i = input({ now: new Date('2026-10-20T12:00:00+03:00') });
      expect(shownWeek(i).key).toEqual({ round: 2, week: 6 });
      expect(currentWeekPlan(i)).toBe(planForWeekKey({ round: 2, week: 6 }).plan);
    } finally {
      if (before === undefined) delete SKIPPED_WEEKS['2026-10-10'];
      else SKIPPED_WEEKS['2026-10-10'] = before;
    }
  });

  test('pre-launch keeps the calendar scan: a mocked Sep 15 finds the row whose startsOn it is past', () => {
    const now = new Date(2026, 8, 15, 12, 0, 0);
    const i = input({ now, logs: [] });
    expect(currentWeekPlan(i)).toBe(programWeekPlan(now));
    expect(rowOf(i)).toBe('R2W3');
  });

  test("pre-launch swing Saturday: the plan is LAST week's row, and the pinned ISO round-trips to the same row", () => {
    const logs = [
      log('s1', new Date(2026, 8, 14, 10).toISOString(), 'A'), // Mon Sep 14
      log('s2', new Date(2026, 8, 16, 10).toISOString(), 'B'), // Wed Sep 16
    ];
    const sat = new Date(2026, 8, 19, 20, 0, 0); // Sat Sep 19 evening: last week has 2 of 3
    const i = input({ now: sat, logs });
    expect(homeWeekOffset(logs, sat)).toBe(1);
    const date = preLaunchPlanDate(i);
    expect(date.getTime()).toBe(saturdayForOffset(1, sat).getTime());
    const last = programWeekPlan(date);
    expect(currentWeekPlan(i)).toBe(last);
    // startWorkout stores pinnedPlanDateIso = preLaunchPlanDate().toISOString();
    // resuming reads it back as a Date and looks the row up again
    expect(programWeekPlan(new Date(date.toISOString()))).toBe(last);
    // and the row really is the previous week's, not this Saturday's
    expect(last).not.toBe(programWeekPlan(sat));
  });

  test('a non-swing pre-launch day pins "now" itself', () => {
    const now = new Date(2026, 8, 17, 9, 0, 0); // Thu Sep 17
    expect(preLaunchPlanDate(input({ now, logs: [] })).getTime()).toBe(now.getTime());
  });

  test("getProgramWeek's skip count reads SKIPPED_WEEKS and nothing else (one data source)", () => {
    const num = (): number => getProgramWeek(new Date(2026, 9, 24, 12)).num; // Sat Oct 24
    const base = num();
    const added = SKIPPED_WEEKS['2026-10-17'];
    SKIPPED_WEEKS['2026-10-17'] = 'Sick'; // data row only, zero code
    try {
      expect(num()).toBe(base - 1);
    } finally {
      if (added === undefined) delete SKIPPED_WEEKS['2026-10-17'];
      else SKIPPED_WEEKS['2026-10-17'] = added;
    }
    expect(num()).toBe(base);
    const sick = SKIPPED_WEEKS['2026-10-03'];
    delete SKIPPED_WEEKS['2026-10-03'];
    try {
      expect(num()).toBe(base + 1);
    } finally {
      SKIPPED_WEEKS['2026-10-03'] = sick!;
    }
  });

  test('the synthetic-date round trip is gone: no completionWeekSyntheticDate, no planDateNow, no shiftPastSickWeeks', () => {
    const pw = require('../program-week') as Record<string, unknown>;
    const wk = require('../week') as Record<string, unknown>;
    expect(pw['completionWeekSyntheticDate']).toBeUndefined();
    expect(pw['planDateNow']).toBeUndefined();
    expect(wk['shiftPastSickWeeks']).toBeUndefined();
  });
});
