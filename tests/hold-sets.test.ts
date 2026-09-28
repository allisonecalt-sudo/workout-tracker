// tests/hold-sets.test.ts — v60 (Sep 28 2026), F1: the wall-lean set counter.
// Her words Sat Sep 26 22:13: "Wall lean I need to be able to do the timer
// again." Pure-logic tests for hold-sets.ts (no `page` fixture, so Playwright
// runs this in Node — same reasoning as tests/pain-feel.test.ts's own header
// comment: app.ts can't be imported directly, its bottom
// document.addEventListener(...) needs a real DOM).

import { test, expect } from '@playwright/test';
import { setsPrescribed, holdSetsFace, formatHeldSeconds } from '../hold-sets';

test.describe('setsPrescribed — generalized off the reps text, never hardcoded to Wall lean', () => {
  test('"2 × 15-20 sec" (Wall lean, the real PROGRAM text) -> 2', () => {
    expect(setsPrescribed('2 × 15-20 sec')).toBe(2);
  });

  test('a lowercase "x" and a plain "2x" both read as 2', () => {
    expect(setsPrescribed('2x 20 sec')).toBe(2);
    expect(setsPrescribed('2 x 20 sec')).toBe(2);
  });

  test('a plain single-set hold ("45 sec", Wall sit/Forearm plank) -> 1, untouched', () => {
    expect(setsPrescribed('45 sec')).toBe(1);
  });

  test('no reps text at all -> 1', () => {
    expect(setsPrescribed(undefined)).toBe(1);
  });

  test('a future 3-set hold ("3 × 30 sec") -> 3 — generalizes without a code change', () => {
    expect(setsPrescribed('3 × 30 sec')).toBe(3);
  });

  test('"1 × 20 sec" -> 1 (a leading "1 ×" is still single-set, same as no count at all)', () => {
    expect(setsPrescribed('1 × 20 sec')).toBe(1);
  });
});

test.describe('formatHeldSeconds', () => {
  test('one set: "20 s"', () => {
    expect(formatHeldSeconds([20])).toBe('20 s');
  });

  test('two sets: "20 s · 18 s" — her exact plan wording', () => {
    expect(formatHeldSeconds([20, 18])).toBe('20 s · 18 s');
  });
});

test.describe('holdSetsFace — the 3 done-face states a multi-set hold walks through', () => {
  test('nothing held yet -> ready (app.ts keeps its own existing Ready face for this)', () => {
    expect(holdSetsFace(2, [])).toEqual({ kind: 'ready' });
  });

  test('set 1 of 2 done -> more-sets, "Set 1 ✓ 20 s" + Start set 2', () => {
    expect(holdSetsFace(2, [20])).toEqual({
      kind: 'more-sets',
      setDone: 1,
      setsTotal: 2,
      heldSec: 20,
    });
  });

  test('both sets done -> all-done, "2 sets ✓ · 20 s · 18 s"', () => {
    expect(holdSetsFace(2, [20, 18])).toEqual({ kind: 'all-done', setsTotal: 2, sets: [20, 18] });
  });

  test('a 3-set hold, 2 of 3 done -> still more-sets (generalizes past 2 sets)', () => {
    expect(holdSetsFace(3, [30, 28])).toEqual({
      kind: 'more-sets',
      setDone: 2,
      setsTotal: 3,
      heldSec: 28,
    });
  });

  test('a redo that raised the LAST set stays reflected (app.ts writes via max, this just reads the array back)', () => {
    // recordHeldSet's own max rule lives in app.ts (state-touching); this
    // only proves the face reads whatever array it's handed, in order.
    expect(holdSetsFace(2, [15, 20])).toEqual({ kind: 'all-done', setsTotal: 2, sets: [15, 20] });
  });
});
