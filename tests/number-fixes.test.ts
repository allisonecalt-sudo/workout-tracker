// tests/number-fixes.test.ts - v62.3 "make every number true" (Oct 16 2026).
//
// Pure-logic tests for the shared rules in number-rules.ts / ride.ts /
// cardio-notes.ts, one describe per fix (F1..F9). Node only, no `page`.
// The matching on-screen checks live in tests/screens/number-fixes.spec.ts.

import { test, expect } from '@playwright/test';
import {
  perWeekFillPct,
  shownSessionCount,
  sessionCounts,
  dRideTag,
  sinceText,
  levelForLength,
  rideReadingsLine,
} from '../number-rules';
import { isClaudeNote } from '../cardio-notes';
import { parseMmSs, rideTimeReadback, rideFitHint } from '../cardio-readings';

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

test.describe('v62.3 F4 - each Start -> Now row says its own "since"', () => {
  test('the format is "since Sep 24" (the existing month-day form)', () => {
    expect(sinceText('2026-09-24T15:56:00+03:00')).toBe('since Sep 24');
    expect(sinceText('2026-05-02T10:00:00+03:00')).toBe('since May 2');
  });
});

test.describe('v62.3 F5 - the elliptical level shows the ride length at each end', () => {
  test('her rides: level 5 for 10 min, level 3 for 12 min (minutes rounded from console seconds)', () => {
    expect(levelForLength(5, 602)).toBe('level 5 for 10 min');
    expect(levelForLength(3, 720)).toBe('level 3 for 12 min');
  });
  test('a ride with no time recorded shows just the level; no level, no phrase', () => {
    expect(levelForLength(5, null)).toBe('level 5');
    expect(levelForLength(5, 0)).toBe('level 5');
    expect(levelForLength(null, 600)).toBeNull();
  });
});

test.describe('v62.3 F7 - "no numbers" only when there really are none', () => {
  test('a ride out of the rates with km and kcal shows them in time · km · kcal · level order', () => {
    expect(rideReadingsLine({ timeSec: null, km: 2.1, kcal: 190.8, level: null })).toBe(
      '— · 2.1 km · 190.8 kcal · —'
    );
  });
  test('a full ride shows all four', () => {
    expect(rideReadingsLine({ timeSec: 602, km: 0.72, kcal: 63.4, level: 5 })).toBe(
      '10:02 · 0.72 km · 63.4 kcal · L5'
    );
  });
  test('a zero reads as not read: "—", like a missing value', () => {
    expect(rideReadingsLine({ timeSec: null, km: 0, kcal: 0, level: 4 })).toBe('— · — · — · L4');
  });
  test('none of time, km, kcal or level -> null (the caller says "no numbers")', () => {
    expect(rideReadingsLine({ timeSec: null, km: null, kcal: null, level: null })).toBeNull();
    expect(rideReadingsLine({ timeSec: 0, km: 0, kcal: 0, level: null })).toBeNull();
  });
});

test.describe("v62.3 F8 - Claude's notes are not shown as her words", () => {
  test("a note starting 'Claude-logged' is Claude's, case-insensitive, after trimming", () => {
    expect(isClaudeNote('Claude-logged: Oct 1 hike')).toBe(true);
    expect(isClaudeNote('  claude-LOGGED from the chat')).toBe(true);
  });
  test('her own notes are not', () => {
    expect(isClaudeNote('Knee fine')).toBe(false);
    expect(isClaudeNote('I told Claude-logged things')).toBe(false);
    expect(isClaudeNote('')).toBe(false);
  });
});

test.describe('v62.3 - the version', () => {
  test('package.json appVersion (the one source) is v62.3', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
      appVersion?: string;
    };
    expect(pkg.appVersion).toBe('v62.3');
  });
});

test.describe('v62.3 fix round 1 (item 6) - ride time parsing', () => {
  test('bare 1-2 digits are minutes; 3-4 digits and mm:ss keep their meaning', () => {
    expect(parseMmSs('10')).toBe(600);
    expect(parseMmSs('25')).toBe(1500);
    expect(parseMmSs('5')).toBe(300);
    expect(parseMmSs('1002')).toBe(602);
    expect(parseMmSs('958')).toBe(598);
    expect(parseMmSs('10:02')).toBe(602);
    expect(parseMmSs('')).toBeNull();
    expect(parseMmSs('0')).toBeNull();
    expect(parseMmSs('1090')).toBeNull(); // 90 seconds is not a console reading
  });
  test('the readback is the console format', () => {
    expect(rideTimeReadback('10')).toBe('= 10:00');
    expect(rideTimeReadback('1002')).toBe('= 10:02');
    expect(rideTimeReadback('9:05')).toBe('= 9:05');
    expect(rideTimeReadback('abc')).toBe('');
    expect(rideTimeReadback('')).toBe('');
  });
});

test.describe('v62.4 G1 - the "can\'t all be true" hint on ride numbers', () => {
  test('her Oct 18 case: "10" as 10 SECONDS (the v62.2 reading) beside 0.58 km and 60.1 kcal shows the hint', () => {
    expect(rideFitHint(10, 0.58, 60.1)).toBe(
      "These don't fit together: 0.58 km in 0:10. Check the time?"
    );
  });
  test('the same "10" under v62.3 rules is 600 s: no hint', () => {
    expect(rideFitHint(parseMmSs('10'), 0.58, 60.1)).toBe('');
  });
  test('a fitting ride has no hint', () => {
    expect(rideFitHint(602, 2.1, 52)).toBe('');
  });
  test('km missing: the hint names kcal', () => {
    expect(rideFitHint(10, null, 60.1)).toBe(
      "These don't fit together: 60.1 kcal in 0:10. Check the time?"
    );
  });
  test('nothing to judge (no time, or no kcal): no hint', () => {
    expect(rideFitHint(null, 0.58, 60.1)).toBe('');
    expect(rideFitHint(10, 0.58, null)).toBe('');
  });
  test('it agrees with the stats rule: 3:00 at 20 kcal/min is plausible, 2:59 is not', () => {
    expect(rideFitHint(180, null, 60)).toBe('');
    expect(rideFitHint(179, null, 60)).not.toBe('');
  });
});
