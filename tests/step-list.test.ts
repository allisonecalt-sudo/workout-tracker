// tests/step-list.test.ts — the jump list's flatten/skip/count logic
// (Sep 25 2026). Pure-logic tests, same shape as tests/cycle.test.ts: no
// `page` fixture, so Playwright runs these in Node without a browser.

import { test, expect } from '@playwright/test';
import {
  flattenSteps,
  nextUndoneStep,
  completedCount,
  reachedCount,
  stepKey,
  type WorkoutSteps,
} from '../step-list';

const TWO_ROUND: WorkoutSteps = {
  warmup: [{ name: 'Belly breathing' }, { name: 'Pelvic tilts' }],
  main: [{ name: 'Squats', reps: '10' }, { name: 'Hinge', reps: '10' }, { name: 'Wall sit' }],
  upperBack: [{ name: '1 kg curl' }, { name: 'Prone row' }],
};

test.describe('flattenSteps', () => {
  test('warm-up -> main (each round) -> upper back, in order', () => {
    const steps = flattenSteps(TWO_ROUND, 2);
    expect(steps.map((s) => s.key)).toEqual([
      'warmup:1:0',
      'warmup:1:1',
      'main:1:0',
      'main:1:1',
      'main:1:2',
      'main:2:0',
      'main:2:1',
      'main:2:2',
      'upperBack:1:0',
      'upperBack:1:1',
    ]);
  });

  test('group labels: Warm-up, Main round N, Upper back', () => {
    const steps = flattenSteps(TWO_ROUND, 2);
    expect(steps[0]!.groupLabel).toBe('Warm-up');
    expect(steps[2]!.groupLabel).toBe('Main round 1');
    expect(steps[5]!.groupLabel).toBe('Main round 2');
    expect(steps[8]!.groupLabel).toBe('Upper back');
  });

  test('a Lite (1-round) workout lists only Main round 1', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    const mainLabels = new Set(steps.filter((s) => s.phase === 'main').map((s) => s.groupLabel));
    expect(mainLabels).toEqual(new Set(['Main round 1']));
    expect(steps.filter((s) => s.phase === 'main')).toHaveLength(3);
  });

  test('no upperBack block -> no upper-back steps, no crash', () => {
    const steps = flattenSteps({ warmup: [], main: [{ name: 'Squats' }] }, 1);
    expect(steps).toHaveLength(1);
  });

  test('carries the exercise through untouched (name/reps/label)', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    expect(steps[2]!.exercise).toEqual({ name: 'Squats', reps: '10' });
  });
});

test.describe('nextUndoneStep', () => {
  test('forward from the current step to the next undone one', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    const completed = { 'warmup:1:0': true, 'warmup:1:1': true };
    const next = nextUndoneStep(steps, 'warmup:1:1', completed);
    expect(next?.key).toBe('main:1:0');
  });

  test('wraps to an earlier skipped step when nothing is undone ahead', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    // Everything done except the very first warm-up step (she skipped it).
    const completed: Record<string, boolean> = {};
    for (const s of steps) completed[s.key] = true;
    delete completed['warmup:1:0'];
    const next = nextUndoneStep(steps, 'upperBack:1:1', completed);
    expect(next?.key).toBe('warmup:1:0');
  });

  test('never hands back the step she started from', () => {
    const steps = flattenSteps({ warmup: [], main: [{ name: 'Only one' }] }, 1);
    const next = nextUndoneStep(steps, 'main:1:0', {});
    expect(next).toBeNull();
  });

  test('null when every other step is already done', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    const completed: Record<string, boolean> = {};
    for (const s of steps) completed[s.key] = true;
    const next = nextUndoneStep(steps, 'main:1:1', completed);
    expect(next).toBeNull();
  });

  test('null on an empty list', () => {
    expect(nextUndoneStep([], 'main:1:0', {})).toBeNull();
  });

  test('an unrecognized afterKey (e.g. the cool-down sentinel) scans from the start', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    const next = nextUndoneStep(steps, 'cooldown:1:0', {});
    expect(next?.key).toBe('warmup:1:0');
  });
});

test.describe('completedCount / reachedCount', () => {
  test('completedCount only counts steps actually marked done', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    expect(completedCount(steps, { 'warmup:1:0': true, 'main:1:2': true })).toBe(2);
    expect(completedCount(steps, {})).toBe(0);
  });

  test('reachedCount = completed steps + the current one if it is not done', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    // Ordinary forward walk: steps up to "here" are done, "here" itself isn't
    // yet — reachedCount reads the same as the old position count would.
    const completed = { 'warmup:1:0': true, 'warmup:1:1': true, 'main:1:0': true };
    expect(reachedCount(steps, completed, 'main:1:1')).toBe(4); // 3 done + this one
  });

  test('reachedCount does NOT add a bonus for viewing an already-done step', () => {
    const steps = flattenSteps(TWO_ROUND, 1);
    // She jumped back to look at a step she already finished — the count
    // reads what's actually done, not "position 1".
    const completed: Record<string, boolean> = {};
    for (const s of steps) completed[s.key] = true;
    expect(reachedCount(steps, completed, 'warmup:1:0')).toBe(steps.length);
  });
});

test('stepKey builds the phase:round:index shape', () => {
  expect(stepKey('main', 2, 0)).toBe('main:2:0');
  expect(stepKey('warmup', 1, 3)).toBe('warmup:1:3');
});
