// tests/number-fixes.test.ts - v62.3 "make every number true" (Oct 16 2026).
//
// Pure-logic tests for the shared rules in number-rules.ts / ride.ts /
// cardio-notes.ts, one describe per fix (F1..F9). Node only, no `page`.
// The matching on-screen checks live in tests/screens/number-fixes.spec.ts.

import { test, expect } from '@playwright/test';
import { perWeekFillPct, shownSessionCount } from '../number-rules';

test.describe('v62.3 F1 - a per-week bar fills from the same numbers as its label', () => {
  test('3 / 4 fills 75%, not 2/3', () => {
    expect(perWeekFillPct(3, 4)).toBe(75);
  });
  test('3 / 3 fills 100%, a count past the target stays at 100%, 0 fills 0%', () => {
    expect(perWeekFillPct(3, 3)).toBe(100);
    expect(perWeekFillPct(5, 4)).toBe(100);
    expect(perWeekFillPct(0, 4)).toBe(0);
  });
});

test.describe('v62.3 F2 - one session count for a week', () => {
  test('a completion-model week counts a D ride as one more session', () => {
    expect(shownSessionCount(2, true, 1)).toBe(3);
    expect(shownSessionCount(3, true, 2)).toBe(4);
  });
  test('a legacy week (no D concept) and a week with no D count A/B/C alone', () => {
    expect(shownSessionCount(3, false, 1)).toBe(3);
    expect(shownSessionCount(3, true, 0)).toBe(3);
  });
});
