// tests/paths.test.ts — Round 3's three time paths (v73, Nov 11 2026). Pure Node, no browser.
//
// WHAT: the 38 / 48 / 60 minute pick (paths.ts) cuts a Round 3 workout to 3 / 4 / 5 (+ the
// optional Hammer curl) moves and sets the ride; no pick = 48; Workout D and every R1/R2
// week have no picker; Round 3 resolves from Sun Nov 15 and not before; the load chip maps
// to the Round 3 arm moves; session_path rides the save payload.
// WHY: her words (Wed Nov 11 2026): "each one has 30,45,hour and i click the path".
// The UI half (the picker, both Skip buttons) is tests/screens/r3-paths.spec.ts.

import { test, expect } from '@playwright/test';
import { PROGRAM, ROUNDS, planForWeekKey, type WorkoutId } from '../program';
import { DEFAULT_PATH, PATH_IDS, isPathId, workoutForPath } from '../paths';
import { getWorkoutD, ARM_FEEL_STEPS } from '../workout-now';
import { shownWeek, type WeekClockInput, roundStartsForWeekModel } from '../program-week';
import { sessionPayload, legacySessionPayload } from '../sync';
import { setWorkoutDProvider } from '../week-clock';
import type { LogEntry } from '../types';

const R3W1 = planForWeekKey({ round: 3, week: 1 }).plan;
const LETTERS: WorkoutId[] = ['A', 'B', 'C'];

const MAIN_ORDER: Record<WorkoutId, string[]> = {
  A: ['Chair squat', 'Band row', 'Incline push-up on fists', 'Full dead bug', 'Band pull-apart'],
  B: ['Bodyweight hip hinge', 'One-arm dumbbell row', 'Glute bridges', 'IWYT raises', 'Bird dog'],
  C: [
    'Supported split squat',
    'Band pull-apart',
    'Floor press',
    'Side plank on knees',
    'Side-lying clamshells',
  ],
};

test.describe('v73 — Round 3 Week 1 is the written plan', () => {
  test('the row exists: round 3, week 1, from Sun Nov 15, with her label', () => {
    expect(R3W1.round).toBe(3);
    expect(R3W1.weekNum).toBe(1);
    expect(R3W1.startsOn).toBe('2026-11-15');
    expect(R3W1.label).toBe('Round 3 — Week 1 · new A/B/C, pick your path');
  });

  test('Weeks 2+ are not written: Round 3 Week 2 repeats Week 1 (she decides each week)', () => {
    expect(PROGRAM.filter((wp) => wp.round === 3).length).toBe(1);
    expect(planForWeekKey({ round: 3, week: 2 }).repeatsWeek).toBe(1);
  });

  for (const id of LETTERS) {
    test(`${id}: the five main moves are in priority order, 2 rounds`, () => {
      const w = R3W1.workouts[id];
      expect(w.main.map((e) => e.name)).toEqual(MAIN_ORDER[id]);
      expect(w.rounds).toBe(2);
    });

    test(`${id}: warm-up is the ride ('Outdoor walk', exact name) then the 1-minute primer`, () => {
      const w = R3W1.workouts[id];
      expect(w.warmup.map((e) => e.name)).toEqual(['Outdoor walk', '1-minute primer']);
    });

    test(`${id}: cool-down is chin tucks, then her stretches at 45 s, and no shoulder / calf stretch`, () => {
      const names = R3W1.workouts[id].cooldown.map((e) => e.name);
      expect(names[0]).toBe('Chin tucks');
      expect(names).toContain('Doorway pec stretch');
      expect(names).toContain('Hip flexor — left knee in, right leg dangles');
      expect(names).not.toContain('Shoulder stretch');
      expect(names.some((n) => n.startsWith('Calf stretch'))).toBe(false);
      const stretches = R3W1.workouts[id].cooldown.slice(1);
      expect(stretches.length).toBe(15);
      for (const s of stretches) expect(s.durationSec).toBe(45);
      expect(R3W1.workouts[id].cooldown.find((e) => e.name === 'Neck stretch')?.reps).toBe(
        '45 sec each side'
      );
    });
  }

  test('Hammer curl is the optional last step of the 60 path in A, B and C', () => {
    for (const id of LETTERS) {
      expect(R3W1.workouts[id].paths?.optional?.map((e) => e.name)).toEqual(['Hammer curl']);
    }
  });
});

test.describe('v73 — path slicing', () => {
  for (const id of LETTERS) {
    test(`${id}: 38 -> first 3, 48 -> first 4, 60 -> all 5 plus the optional Hammer curl last`, () => {
      const plan = R3W1.workouts[id];
      const order = MAIN_ORDER[id];
      expect(workoutForPath(plan, '38').main.map((e) => e.name)).toEqual(order.slice(0, 3));
      expect(workoutForPath(plan, '48').main.map((e) => e.name)).toEqual(order.slice(0, 4));
      expect(workoutForPath(plan, '60').main.map((e) => e.name)).toEqual([...order, 'Hammer curl']);
    });

    test(`${id}: the ride minutes follow the path (38 -> 10, 48 -> 12, 60 -> 15), same step name`, () => {
      const plan = R3W1.workouts[id];
      const ride = (p: '38' | '48' | '60'): { name: string; reps?: string } | undefined =>
        workoutForPath(plan, p).warmup.find((e) => e.name === 'Outdoor walk');
      expect(ride('38')?.reps).toBe('10 min');
      expect(ride('48')?.reps).toBe('12 min');
      expect(ride('60')?.reps).toBe('15 min');
      // the primer and everything else in the warm-up is untouched
      expect(workoutForPath(plan, '38').warmup[1]?.name).toBe('1-minute primer');
    });

    test(`${id}: 2 rounds on every path, the cool-down is the same on every path`, () => {
      const plan = R3W1.workouts[id];
      for (const p of PATH_IDS) {
        const w = workoutForPath(plan, p);
        expect(w.rounds).toBe(2);
        expect(w.cooldown).toEqual(plan.cooldown);
      }
    });
  }

  test('no pick means 48', () => {
    expect(DEFAULT_PATH).toBe('48');
    const plan = R3W1.workouts.A;
    expect(workoutForPath(plan, null)).toEqual(workoutForPath(plan, '48'));
    expect(workoutForPath(plan, null).main.length).toBe(4);
  });

  test("the description's minutes follow the path (workoutMinutesLabel reads '~N min')", () => {
    const plan = R3W1.workouts.B;
    expect(workoutForPath(plan, '38').description).toMatch(/~38 min/);
    expect(workoutForPath(plan, '60').description).toMatch(/~60 min/);
  });

  test('the plan row itself is never changed by slicing', () => {
    const before = JSON.stringify(R3W1.workouts.A);
    workoutForPath(R3W1.workouts.A, '60');
    workoutForPath(R3W1.workouts.A, '38');
    expect(JSON.stringify(R3W1.workouts.A)).toBe(before);
  });

  test('isPathId accepts exactly 38 / 48 / 60', () => {
    expect(['38', '48', '60'].every(isPathId)).toBe(true);
    for (const bad of ['37', '47', 38, null, undefined, '', '60 '])
      expect(isPathId(bad)).toBe(false);
  });
});

test.describe('v73 — no picker outside Round 3 A/B/C', () => {
  test('Workout D has no paths: the very same object comes back for any pick', () => {
    const d = getWorkoutD();
    expect(d.paths).toBeUndefined();
    expect(workoutForPath(d, '38')).toBe(d);
    expect(workoutForPath(d, null)).toBe(d);
  });

  test('no Round 1 / Round 2 workout has paths (their A/B/C pass through untouched)', () => {
    for (const wp of PROGRAM.filter((w) => (w.round ?? 1) < 3)) {
      for (const id of LETTERS) {
        const w = wp.workouts[id];
        expect(w.paths).toBeUndefined();
        expect(workoutForPath(w, '38')).toBe(w);
      }
    }
  });
});

test.describe('v73 — Round 3 starts Sun Nov 15 and not before', () => {
  const WEEK5: LogEntry[] = [
    {
      id: 'b1',
      date: '2026-09-26T22:14:00+03:00',
      workout: 'B',
      capacityBefore: null,
      capacityAfter: null,
      wallSitSec: 0,
      backPain: null,
      word: '',
    },
  ];
  const at = (iso: string): WeekClockInput => ({ logs: WEEK5, moves: [], now: new Date(iso) });

  test('ROUNDS carries Round 3 at 2026-11-15 (Sunday)', () => {
    expect(ROUNDS.find((r) => r.num === 3)?.start).toBe('2026-11-15');
    expect(new Date('2026-11-15T12:00:00').getDay()).toBe(0);
  });

  test('Wed Nov 11 .. Sat Nov 14 23:59 is still Round 2; Sun Nov 15 00:00 is Round 3 Week 1', () => {
    expect(shownWeek(at('2026-11-11T12:00:00+02:00')).key.round).toBe(2);
    expect(shownWeek(at('2026-11-14T23:59:00+02:00')).key.round).toBe(2);
    expect(shownWeek(at('2026-11-15T00:00:00+02:00')).key).toEqual({ round: 3, week: 1 });
    expect(shownWeek(at('2026-11-16T09:00:00+02:00')).key).toEqual({ round: 3, week: 1 });
  });

  test('the round start is Jerusalem local midnight (+02:00 in November)', () => {
    expect(roundStartsForWeekModel().find((r) => r.round === 3)?.at).toBe(
      '2026-11-15T00:00:00+02:00'
    );
  });
});

test.describe('v73 — the load chip maps to Round 3', () => {
  test('Hammer curl is the curl chip and One-arm dumbbell row is the row chip; the old names stay', () => {
    expect(ARM_FEEL_STEPS['Hammer curl']).toBe('curl');
    expect(ARM_FEEL_STEPS['One-arm dumbbell row']).toBe('row');
    expect(ARM_FEEL_STEPS['1 kg biceps curl']).toBe('curl');
    expect(ARM_FEEL_STEPS['Prone row (bodyweight)']).toBe('row');
  });
});

test.describe('v73 — session_path on the wire', () => {
  const base: LogEntry = {
    id: 'p1',
    date: '2026-11-15T10:00:00+02:00',
    workout: 'A',
    capacityBefore: null,
    capacityAfter: null,
    wallSitSec: 0,
    backPain: null,
    word: '',
  };

  test('the payload carries session_path; an older row and D carry null', () => {
    setWorkoutDProvider(getWorkoutD); // app.ts does this once at boot
    expect(sessionPayload({ ...base, sessionPath: '38' })['session_path']).toBe('38');
    expect(sessionPayload({ ...base, sessionPath: '60' })['session_path']).toBe('60');
    expect(sessionPayload(base)['session_path']).toBeNull();
    expect(sessionPayload({ ...base, workout: 'D', sessionPath: null })['session_path']).toBeNull();
  });

  test('a server without the column still saves: the legacy retry drops session_path', () => {
    const legacy = legacySessionPayload({ ...base, sessionPath: '48' });
    expect('session_path' in legacy).toBe(false);
  });
});
