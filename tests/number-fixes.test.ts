// tests/number-fixes.test.ts - v62.3 "make every number true" (Oct 16 2026).
//
// Pure-logic tests for the shared rules in number-rules.ts / ride.ts /
// cardio-notes.ts, one describe per fix (F1..F9). Node only, no `page`.
// The matching on-screen checks live in tests/screens/number-fixes.spec.ts.

import { test, expect } from '@playwright/test';
import { perWeekFillPct, shownSessionCount, sessionCounts, dRideTag } from '../number-rules';

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

test.describe('v62.3 F3 - one session count on Home and Progress', () => {
  test('her data: 45 rows with one D ride is 44 sessions and "+1 ride"', () => {
    const logs = [...Array.from({ length: 44 }, () => ({ workout: 'A' })), { workout: 'D' }];
    expect(sessionCounts(logs)).toEqual({ sessions: 44, dRides: 1 });
    expect(dRideTag(1)).toBe('+1 ride');
  });
  test('the tag is plural for 2+ and empty for none', () => {
    expect(dRideTag(2)).toBe('+2 rides');
    expect(dRideTag(0)).toBe('');
    expect(sessionCounts([{ workout: 'B' }])).toEqual({ sessions: 1, dRides: 0 });
  });
});
