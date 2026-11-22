// tests/week2.test.ts — v77 (Nov 22 2026): Round 3 Week 2, the new A / B / C. C folds into A and B and
// the elliptical day becomes Workout C; D stops being a to-do from this week on. Pure logic, runs in
// Node (the screen half is tests/screens/r3-week2.spec.ts).
//
// WHAT: the Week 2 PROGRAM row (A and B with 6 moves each in priority order, C = one long ride and her
// stretches), C's own default path (60), the "of 3" week line, and what each day mode does to C.
// WHY: her design Sun Nov 22 2026 (second-brain self/health/research-2026-11-11-workout/README.md
// section 10 v4); build spec projects/workout-tracker/R3-v77-SPEC-2026-11-22.md.
// Round 3 Week 1 stays exactly as it was: its own tests are tests/paths.test.ts.

import { test, expect } from '@playwright/test';
import {
  PROGRAM,
  planForWeekKey,
  weekCountsOutOf3,
  R3_RIDE_NOTE,
  R3W2_C_RIDE_NOTE,
  R3W2_RIDE_NOTE,
  type Workout,
  type WorkoutId,
} from '../program';
import { defaultPathFor, isRideDay, workoutForPath } from '../paths';
import {
  applyDayMode,
  RIDE_NOTES,
  comingBackActive,
  dayModeNote,
  DAY_MODE_SHORT,
  type DayMode,
} from '../day-mode';
import { weekCountLine } from '../week-d';
import { walkWeeks, type SessionLite } from '../week';
import { ellipticalRideRecords } from '../cardio-notes';
import { weeklyRideRows } from '../ride';
import type { LogEntry } from '../types';

const W2 = PROGRAM.find((wp) => wp.round === 3 && wp.weekNum === 2)!;
const W1 = PROGRAM.find((wp) => wp.round === 3 && wp.weekNum === 1)!;
const names = (w: Workout): string[] => w.main.map((e) => e.name);

test.describe('v77 — Round 3 Week 2 is written', () => {
  test('the row: Round 3 Week 2, starts Sun Nov 22, flagged cIsRide; Week 1 is not flagged', () => {
    expect(W2.startsOn).toBe('2026-11-22');
    expect(W2.label).toBe('Round 3 — Week 2 · new A/B/C · C is the elliptical day');
    expect(W2.cIsRide).toBe(true);
    expect(W1.cIsRide).toBeUndefined();
  });

  test('Week 1 is untouched: its A / B / C names and move lists are exactly what they were', () => {
    expect(W1.workouts.A.name).toBe('Lower + Pull + Push');
    expect(names(W1.workouts.A)).toEqual([
      'Chair squat',
      'Band row',
      'Incline push-up on fists',
      'Full dead bug',
      'Band pull-apart',
    ]);
    expect(W1.workouts.B.name).toBe('Hinge + Pull + Glutes');
    expect(names(W1.workouts.B)).toEqual([
      'Bodyweight hip hinge',
      'One-arm dumbbell row',
      'Glute bridges',
      'IWYT raises',
      'Bird dog',
    ]);
    expect(W1.workouts.C.name).toBe('Legs + Pull + Push + Core');
    expect(names(W1.workouts.C)).toEqual([
      'Supported split squat',
      'Band pull-apart',
      'Floor press',
      'Side plank on knees',
      'Side-lying clamshells',
    ]);
    expect(W1.workouts.C.rounds).toBe(2);
  });

  test('A: 6 moves in priority order; 38 = first 3, 48 = first 4, 60 = all 6 + hammer curl', () => {
    const a = W2.workouts.A;
    expect(a.name).toBe('Lower + Pull + Push');
    expect(a.rounds).toBe(2);
    expect(names(a)).toEqual([
      'Chair squat',
      'Band row',
      'Incline push-up on fists',
      'Full dead bug',
      'Glute bridges',
      'Band pull-apart',
    ]);
    expect(names(workoutForPath(a, '38'))).toEqual(names(a).slice(0, 3));
    expect(names(workoutForPath(a, '48'))).toEqual(names(a).slice(0, 4));
    expect(names(workoutForPath(a, '60'))).toEqual([...names(a), 'Hammer curl']);
    expect(names(workoutForPath(a, null))).toEqual(names(a).slice(0, 4)); // no tap = 48
  });

  test('B: 6 moves in priority order; 38 = first 3, 48 = first 4, 60 = all 6 + hammer curl', () => {
    const b = W2.workouts.B;
    expect(b.name).toBe('Hinge + Pull + Push');
    expect(b.rounds).toBe(2);
    expect(names(b)).toEqual([
      'Bodyweight hip hinge',
      'One-arm dumbbell row',
      'IWYT raises',
      'Floor press',
      'Bird dog',
      'Supported split squat',
    ]);
    expect(names(workoutForPath(b, '38'))).toEqual(names(b).slice(0, 3));
    expect(names(workoutForPath(b, '48'))).toEqual(names(b).slice(0, 4));
    expect(names(workoutForPath(b, '60'))).toEqual([...names(b), 'Hammer curl']);
  });

  test('A and B reuse Week 1 moves unchanged (reps, notes, the split squat note / safety / detailKey)', () => {
    const w1 = (id: WorkoutId, n: string) => W1.workouts[id].main.find((e) => e.name === n)!;
    const w2 = (id: WorkoutId, n: string) => W2.workouts[id].main.find((e) => e.name === n)!;
    expect(w2('A', 'Glute bridges')).toEqual(w1('B', 'Glute bridges'));
    expect(w2('B', 'Floor press')).toEqual(w1('C', 'Floor press'));
    expect(w2('B', 'Supported split squat')).toEqual(w1('C', 'Supported split squat'));
    expect(w2('B', 'Supported split squat').detailKey).toBe('Supported split squat (Round 3)');
    expect(w2('A', 'Band pull-apart')).toEqual(w1('A', 'Band pull-apart'));
    expect(w2('B', 'Bird dog')).toEqual(w1('B', 'Bird dog'));
  });

  test("A / B ride note: Week 2's own text; Week 1's R3_RIDE_NOTE is unchanged", () => {
    expect(W2.workouts.A.warmup[0]!.notes).toBe(R3W2_RIDE_NOTE);
    expect(W2.workouts.B.warmup[0]!.notes).toBe(R3W2_RIDE_NOTE);
    expect(R3W2_RIDE_NOTE).toBe(
      'Ride first. Easy for the first 2–3 min, then a pace where you can talk in short sentences. Stays 10 / 12 / 15 min: the long ride is Workout C.'
    );
    expect(W1.workouts.A.warmup[0]!.notes).toBe(R3_RIDE_NOTE);
    expect(W2.workouts.A.paths?.rideMin).toEqual({ '38': 10, '48': 12, '60': 15 });
  });

  test('C: the long ride + her stretches. 1 round, no primer, no main, exact ride name', () => {
    const c = W2.workouts.C;
    expect(c.id).toBe('C');
    expect(c.name).toBe('Elliptical + stretches');
    expect(c.rounds).toBe(1);
    expect(c.main).toEqual([]);
    expect(c.warmup.map((e) => e.name)).toEqual(['Outdoor walk']);
    expect(c.warmup[0]!.notes).toBe(R3W2_C_RIDE_NOTE);
    expect(R3W2_C_RIDE_NOTE).toBe(
      'The long ride. Easy for the first 2–3 min, then a pace where you can talk in short sentences. Your usual is 45 min. It only grows when you decide, and only if your knee is fine the next morning.'
    );
    expect(c.cooldown).toEqual(W2.workouts.A.cooldown); // chin tucks + her 15 stretches, same list
    expect(c.cooldown[0]!.name).toBe('Chin tucks');
    expect(c.paths?.rideMin).toEqual({ '38': 20, '48': 30, '60': 45 });
    expect(c.paths?.optional).toBeUndefined();
  });

  test("C's default path is 60 (her usual 45-min ride); A and B keep 48", () => {
    expect(defaultPathFor(W2.workouts.C)).toBe('60');
    expect(defaultPathFor(W2.workouts.A)).toBe('48');
    expect(defaultPathFor(W2.workouts.B)).toBe('48');
    expect(defaultPathFor(W1.workouts.C)).toBe('48');
    expect(defaultPathFor(null)).toBe('48');
  });

  test('C by path: the ride is 20 / 30 / 45 min, no pick = 45; the description reads the path', () => {
    const c = W2.workouts.C;
    const ride = (w: Workout): string | undefined =>
      w.warmup.find((e) => e.name === 'Outdoor walk')?.reps;
    expect(ride(workoutForPath(c, '38'))).toBe('20 min');
    expect(ride(workoutForPath(c, '48'))).toBe('30 min');
    expect(ride(workoutForPath(c, '60'))).toBe('45 min');
    expect(ride(workoutForPath(c, null))).toBe('45 min');
    expect(workoutForPath(c, '38').description).toContain('~38 min');
    expect(workoutForPath(c, null).description).toContain('~60 min');
    expect(workoutForPath(c, '60').main).toEqual([]);
  });
});

test.describe('v77 — which weeks count out of 3', () => {
  test('Round 3 Week 2 and a later repeat week do; Round 3 Week 1 and every older week do not', () => {
    expect(weekCountsOutOf3({ round: 3, week: 2 })).toBe(true);
    expect(weekCountsOutOf3({ round: 3, week: 3 })).toBe(true); // no row of its own: repeats Week 2
    expect(planForWeekKey({ round: 3, week: 3 }).repeatsWeek).toBe(2);
    expect(weekCountsOutOf3({ round: 3, week: 1 })).toBe(false);
    expect(weekCountsOutOf3({ round: 2, week: 9 })).toBe(false);
    expect(weekCountsOutOf3({ round: 1, week: 4 })).toBe(false);
    // no PROGRAM row before Week 2 carries the flag
    expect(PROGRAM.filter((wp) => wp.cIsRide).map((wp) => `${wp.round}.${wp.weekNum}`)).toEqual([
      '3.2',
    ]);
  });

  const sessions = (...letters: string[]): SessionLite[] =>
    letters.map((w, i) => ({
      id: `s${i}`,
      date: `2026-11-2${2 + i}T15:00:00.000Z`,
      workout: w as 'A' | 'B' | 'C',
    }));
  const lineFor = (letters: string[], outOf3: boolean, hasD = false): string => {
    const { open, spans } = walkWeeks(sessions(...letters), [], []);
    const span = open ?? spans[spans.length - 1] ?? null;
    return weekCountLine({ span }, hasD, false, outOf3);
  };

  test('the open week reads "N of 3", names only A / B / C, and D never enters the number', () => {
    expect(weekCountLine({ span: null }, false, false, true)).toBe('0 of 3 · A, B and C to go');
    expect(lineFor(['A'], true)).toBe('1 of 3 · B and C left');
    expect(lineFor(['A', 'B'], true)).toBe('2 of 3 · C left');
    expect(lineFor(['A'], true, true)).toBe('1 of 3 · B and C left'); // a D ride does not count
  });

  test('a closed week reads "3 of 3 ✓", D or not', () => {
    const { spans } = walkWeeks(sessions('A', 'B', 'C'), [], []);
    const closed = spans[spans.length - 1]!;
    expect(closed.missing).toEqual([]);
    expect(weekCountLine({ span: closed }, false, false, true)).toBe('3 of 3 ✓');
    expect(weekCountLine({ span: closed }, true, false, true)).toBe('3 of 3 ✓');
  });

  test('a week before the flag reads exactly as today ("N of 4", D named)', () => {
    expect(weekCountLine({ span: null })).toBe('0 of 4 · A, B, C and D to go');
    expect(lineFor(['A'], false)).toBe('1 of 4 · B, C and D left');
    const { spans } = walkWeeks(sessions('A', 'B', 'C'), [], []);
    const closed = spans[spans.length - 1]!;
    expect(weekCountLine({ span: closed }, false, false, false)).toBe('complete · 3 of 4');
    expect(weekCountLine({ span: closed }, true, false, false)).toBe('4 of 4 ✓');
  });
});

test.describe('v77 — the day modes on C (nothing crashes; what each one does)', () => {
  const c = (mode: DayMode | null, path: '38' | '48' | '60' | null = null): Workout =>
    applyDayMode(workoutForPath(W2.workouts.C, path), mode);
  const ride = (w: Workout) => w.warmup.find((e) => e.name === 'Outdoor walk')!;

  test('no mode: the long ride as written', () => {
    expect(c(null)).toEqual(workoutForPath(W2.workouts.C, null));
  });

  test('back: the ride keeps its minutes and its note gets the back-day line', () => {
    const w = c('back');
    expect(ride(w).reps).toBe('45 min');
    // v77 fix round: on C the back-day line is the research line, exactly
    expect(ride(w).notes).toBe(
      'Back day: ride if standing tall on it is comfortable. If not, switch to a 5–10 min walk.'
    );
    expect(RIDE_NOTES).toContain(ride(w).notes);
    expect(w.main).toEqual([]);
  });

  test('knee: the ride becomes the walk lane, same minutes (the elliptical sits this one out)', () => {
    const w = c('knee');
    expect(ride(w).reps).toBe('45 min');
    expect(ride(w).swap).toContain('the walk lane instead of the elliptical');
    expect(w.main).toEqual([]);
  });

  test('wrist: nothing in C touches the wrist, so nothing changes', () => {
    const w = c('wrist');
    expect(ride(w)).toEqual(ride(workoutForPath(W2.workouts.C, null)));
    expect(w.main).toEqual([]);
  });

  test('cold (easy day): the 38 path, so a 20-min easy ride; 1 round', () => {
    const w = c('cold', '38');
    expect(ride(w).reps).toBe('20 min');
    expect(ride(w).notes).toBe('Easy — short sentences or easier.');
    expect(w.rounds).toBe(1);
  });

  test('every ride note C and A / B can show is on the allow-list the ride page reads', () => {
    expect(RIDE_NOTES).toContain(R3W2_C_RIDE_NOTE);
    for (const note of [R3_RIDE_NOTE, R3W2_RIDE_NOTE]) {
      expect(RIDE_NOTES).toContain(note);
      expect(RIDE_NOTES).toContain(
        `${note} If standing tall hurts, use the walk lane for 5–10 min instead.`
      );
    }
    // Week 1's back-day text is byte for byte what it was
    expect(applyDayMode(workoutForPath(W1.workouts.A, null), 'back').warmup[0]!.notes).toBe(
      `${R3_RIDE_NOTE} If standing tall hurts, use the walk lane for 5–10 min instead.`
    );
  });

  test('coming back from an easy day still pre-picks 38 for the next workout (C included)', () => {
    const easy: LogEntry = {
      id: 'e1',
      date: '2026-11-22T08:00:00.000Z',
      workout: 'A',
      dayMode: 'cold',
      sessionPath: '38',
    } as LogEntry;
    expect(comingBackActive([easy], [])).toBe(true);
  });
});

test.describe('v77 fix round — a ride day says no reps', () => {
  test('dayModeNote on a ride day never says "About half your usual reps" (any mode); a lifting day still does', () => {
    for (const mode of ['back', 'knee', 'wrist'] as const) {
      expect(dayModeNote(mode, true)).not.toContain('About half');
      expect(dayModeNote(mode, true)).toBe(DAY_MODE_SHORT[mode]);
      expect(dayModeNote(mode)).toContain('About half your usual reps');
    }
    expect(dayModeNote('cold', true)).toBe(dayModeNote('cold'));
  });

  test('isRideDay: C in Week 2 at every path; never A, B, Week 1 C, or D', () => {
    for (const p of ['38', '48', '60'] as const) {
      expect(isRideDay(workoutForPath(W2.workouts.C, p))).toBe(true);
    }
    expect(isRideDay(W2.workouts.A)).toBe(false);
    expect(isRideDay(W2.workouts.B)).toBe(false);
    expect(isRideDay(W1.workouts.C)).toBe(false);
  });
});

test.describe("v77 — C's ride counts in the week's ride minutes", () => {
  test('a C log with an elliptical ride lands in its week row beside A and B', () => {
    const base = {
      capacityBefore: null,
      capacityAfter: null,
      wallSitSec: 0,
      backPain: null,
      word: '',
    };
    const logs = [
      {
        ...base,
        id: 'a',
        date: '2026-11-22T15:00:00.000Z',
        workout: 'A',
        cardioLane: 'elliptical',
        cardioMinutes: 12,
        ellipticalTimeSec: 720,
      },
      {
        ...base,
        id: 'c',
        date: '2026-11-23T15:00:00.000Z',
        workout: 'C',
        cardioLane: 'elliptical',
        cardioMinutes: 45,
        ellipticalTimeSec: 2700,
      },
    ] as unknown as LogEntry[];
    const sessions: SessionLite[] = logs.map((l) => ({
      id: l.id!,
      date: l.date,
      workout: l.workout as 'A' | 'C',
    }));
    const { spans, open, pending } = walkWeeks(sessions, [], []);
    const weekOf = new Map<string, { round: number; week: number }>();
    for (const sp of [...spans, ...(open ? [open] : [])]) {
      for (const s of sp.sessions) weekOf.set(s.id, sp.key);
    }
    const rows = weeklyRideRows(ellipticalRideRecords(logs), weekOf, spans, open, pending, 6);
    const week = rows.find((r) => r.isOpen) ?? rows[0]!;
    expect(week.rides).toBe(2);
    expect(week.minutes).toBe(12 + 45);
  });
});
