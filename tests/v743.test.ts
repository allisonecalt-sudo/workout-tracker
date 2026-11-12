// tests/v743.test.ts — v74.3 fix round (Nov 12 2026). Pure Node, no browser.
//
// WHAT: (1) a swap day shows about HALF the reps, computed by one helper (halveReps) from the R3 reps
// string; the ride, primer and cool-down are untouched, an EASY day keeps its reps. (2) The back day's
// "Today's version" lines on the push-up, floor press and bird dog. (3) Week line stops naming D while
// she is coming back.
// WHY: research README sections 11 and 12 (second-brain self/health/research-2026-11-11-workout).
// The UI half (doctor list, D chip) is tests/screens/v743.spec.ts.

import { test, expect } from '@playwright/test';
import { planForWeekKey, type WorkoutId } from '../program';
import { workoutForPath } from '../paths';
import {
  applyDayMode,
  halveReps,
  pathInForce,
  BACK_PUSH_LINE,
  BACK_BIRD_DOG_LINE,
  type DayMode,
} from '../day-mode';
import { weekCountLine, weekLeftWords } from '../week-d';

const R3W1 = planForWeekKey({ round: 3, week: 1 }).plan;
const today = (id: WorkoutId, mode: DayMode | null) =>
  applyDayMode(workoutForPath(R3W1.workouts[id], pathInForce('60', mode)), mode);

test.describe('v74.3 - halveReps', () => {
  test('rep ranges become their lower half', () => {
    expect(halveReps('10–15 · higher seat')).toBe('5–8 · higher seat');
    expect(halveReps('8–12 · forearms flat on the wall')).toBe('4–6 · forearms flat on the wall');
    expect(halveReps('6–8 each side · 3-sec hold')).toBe('3–4 each side · 3-sec hold');
    expect(halveReps('12–15 reps · 2-sec hold at top')).toBe('6–8 reps · 2-sec hold at top');
    expect(halveReps('10–12 each side · 2 kg')).toBe('5–6 each side · 2 kg');
    expect(halveReps('12 each side · band')).toBe('6 each side · band');
  });

  test('holds in seconds become 10–15 s style, a tempo hold is left alone', () => {
    expect(halveReps('15–25 s')).toBe('10–15 s');
    expect(halveReps('20 sec hold · comfortable angle')).toBe('10–15 sec hold · comfortable angle');
    expect(halveReps('2 × 20 sec · left side, then right (15–25 s each is fine)')).toBe(
      '2 × 10–15 sec · left side, then right (10–15 s each is fine)'
    );
    expect(halveReps('6–8 each side · 3-sec hold')).toContain('3-sec hold');
  });

  test('a ride, a primer and words with no count come back unchanged', () => {
    expect(halveReps('15 min')).toBe('15 min');
    expect(halveReps('1 min')).toBe('1 min');
    expect(halveReps('Hold gently')).toBe('Hold gently');
  });
});

test.describe('v74.3 - swap days show about half', () => {
  test('every unswapped main move on back / knee / wrist days shows halveReps of its normal line', () => {
    for (const id of ['A', 'B', 'C'] as WorkoutId[]) {
      const normal = workoutForPath(R3W1.workouts[id], '60');
      for (const mode of ['back', 'knee', 'wrist'] as const) {
        for (const ex of today(id, mode).main) {
          const orig = normal.main.find((m) => m.name === ex.name);
          if (orig?.reps && !ex.swap) {
            expect(ex.reps).toBe(halveReps(orig.reps));
          }
        }
      }
    }
  });

  test('named examples: chair squat 10–15 -> 5–8, incline push-up 8–12 -> 4–6, dead bug 6–8 -> 3–4', () => {
    const a = today('A', 'back').main;
    expect(a.find((e) => e.name === 'Chair squat')!.reps).toMatch(/^5–8 /);
    expect(a.find((e) => e.name === 'Incline push-up on fists')!.reps).toMatch(/^4–6 /);
    expect(a.find((e) => e.name === 'Full dead bug')!.reps).toBe('3–4 each side');
  });

  test('a timed hold follows: the wall sit line and its timer', () => {
    const ws = today('C', 'knee').main.find((e) => e.name === 'Wall sit')!;
    expect(ws.reps).toMatch(/^10–15 sec hold/);
    expect(ws.durationSec).toBe(15);
    const sp = today('C', 'back').main.find((e) => e.name === 'Side plank on knees')!;
    expect(sp.reps).toContain('2 × 10–15 sec');
    expect(sp.durationSec).toBe(15);
  });

  test('the ride, the primer and the cool-down are untouched; an EASY day keeps its reps', () => {
    const normal = workoutForPath(R3W1.workouts['A'], '60');
    const back = today('A', 'back');
    expect(back.warmup.map((e) => e.reps)).toEqual(normal.warmup.map((e) => e.reps));
    expect(back.cooldown).toEqual(normal.cooldown);
    const cold = today('A', 'cold');
    const n38 = workoutForPath(R3W1.workouts['A'], '38');
    expect(cold.main.map((e) => e.reps)).toEqual(n38.main.map((e) => e.reps));
  });
});

test.describe('v74.3 - back day lines', () => {
  test('push-up and floor press: wall push-up if the position hurts; the card keeps its name', () => {
    const a = today('A', 'back').main.find((e) => e.name === 'Incline push-up on fists')!;
    expect(a.swap).toBe(BACK_PUSH_LINE);
    expect(BACK_PUSH_LINE).toContain('If the position hurts your back: wall push-up instead');
    const c = today('C', 'back').main.find((e) => e.name === 'Floor press')!;
    expect(c.swap).toBe(BACK_PUSH_LINE);
  });

  test('bird dog: smaller reach; on a wrist day it is still the forearm bird dog', () => {
    const b = today('B', 'back').main.find((e) => e.name === 'Bird dog')!;
    expect(b.swap).toBe(BACK_BIRD_DOG_LINE);
    expect(BACK_BIRD_DOG_LINE).toContain(
      'smaller reach — lift the arm or leg only as far as stays comfortable'
    );
    expect(today('B', 'wrist').main.some((e) => e.name === 'Bird dog on forearms')).toBe(true);
  });
});

test.describe('v74.3 - coming back: no D in the week line', () => {
  test('D is named as left normally, dropped while coming back', () => {
    expect(weekLeftWords(['B', 'C'], false, 1)).toBe('B, C and D left');
    expect(weekLeftWords(['B', 'C'], false, 1, true)).toBe('B and C left');
    expect(weekCountLine({ span: null }, false, true)).toBe('0 of 4 · A, B and C to go');
    expect(weekCountLine({ span: null }, false, false)).toBe('0 of 4 · A, B, C and D to go');
  });
});
