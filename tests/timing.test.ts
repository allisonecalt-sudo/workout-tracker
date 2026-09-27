// tests/timing.test.ts — T1's timing.ts (Sep 27 2026)
//
// Pure-logic tests, same shape as tests/week.test.ts / tests/cycle.test.ts:
// no `page` fixture, so Playwright runs these in Node.
//
// Covers PLAN-2026-09-26.md §7 T1's own test list: "trainingMinutes
// boundaries (Node)" + formatWorkoutTime's rounding/blank rule. The confirm-
// tap / breaks-chip / finish-before-start UI behavior lives in
// tests/app.spec.ts (it needs the DOM), not here.

import { test, expect } from '@playwright/test';
import { trainingMinutes, formatWorkoutTime, type TimingEntry } from '../timing';

const CONFIRMED: TimingEntry = {
  herStartAt: '2026-09-26T21:04:00+03:00',
  herStartConfirmed: true,
  herEndAt: '2026-09-26T21:52:00+03:00', // 48 min after start
  herEndConfirmed: true,
  breakMinutes: null,
};

test('both confirmed, no break: the plain minutes between them', () => {
  expect(trainingMinutes(CONFIRMED)).toBe(48);
  expect(formatWorkoutTime(CONFIRMED)).toBe('about 50 min'); // rounds to 5
});

test('breaks are subtracted before the bounds check', () => {
  const withBreak: TimingEntry = { ...CONFIRMED, breakMinutes: 15 };
  expect(trainingMinutes(withBreak)).toBe(33);
  expect(formatWorkoutTime(withBreak)).toBe('about 35 min');
});

test('untouched breakMinutes (null) reads as zero, never as a guessed break', () => {
  expect(trainingMinutes({ ...CONFIRMED, breakMinutes: null })).toBe(48);
});

test('start not confirmed -> null, even with both timestamps present', () => {
  expect(trainingMinutes({ ...CONFIRMED, herStartConfirmed: false })).toBeNull();
});

test('end not confirmed -> null, even with both timestamps present', () => {
  expect(trainingMinutes({ ...CONFIRMED, herEndConfirmed: false })).toBeNull();
});

test('either confirmed flag missing entirely (a pre-T1 row) -> null', () => {
  expect(
    trainingMinutes({ herStartAt: CONFIRMED.herStartAt, herEndAt: CONFIRMED.herEndAt })
  ).toBeNull();
});

test('a missing timestamp (confirmed true, no value) -> null, never a guess', () => {
  expect(trainingMinutes({ ...CONFIRMED, herStartAt: null })).toBeNull();
  expect(trainingMinutes({ ...CONFIRMED, herEndAt: null })).toBeNull();
});

test('under 5 min -> null (§3.4 "under 5 or over 180 -> null")', () => {
  const short: TimingEntry = {
    herStartAt: '2026-09-26T21:04:00+03:00',
    herStartConfirmed: true,
    herEndAt: '2026-09-26T21:08:00+03:00', // 4 min
    herEndConfirmed: true,
  };
  expect(trainingMinutes(short)).toBeNull();
  expect(formatWorkoutTime(short)).toBe('');
});

test('exactly 5 min is kept — the floor is inclusive', () => {
  const exactlyFive: TimingEntry = {
    herStartAt: '2026-09-26T21:04:00+03:00',
    herStartConfirmed: true,
    herEndAt: '2026-09-26T21:09:00+03:00',
    herEndConfirmed: true,
  };
  expect(trainingMinutes(exactlyFive)).toBe(5);
});

test('over 180 min -> null', () => {
  const long: TimingEntry = {
    herStartAt: '2026-09-26T21:00:00+03:00',
    herStartConfirmed: true,
    herEndAt: '2026-09-27T00:01:00+03:00', // 181 min
    herEndConfirmed: true,
  };
  expect(trainingMinutes(long)).toBeNull();
});

test('exactly 180 min is kept — the ceiling is inclusive', () => {
  const exactly180: TimingEntry = {
    herStartAt: '2026-09-26T21:00:00+03:00',
    herStartConfirmed: true,
    herEndAt: '2026-09-27T00:00:00+03:00',
    herEndConfirmed: true,
  };
  expect(trainingMinutes(exactly180)).toBe(180);
});

test('finish before start -> null, the same bounds check catches it without a special case', () => {
  const backwards: TimingEntry = {
    herStartAt: '2026-09-26T21:52:00+03:00',
    herStartConfirmed: true,
    herEndAt: '2026-09-26T21:04:00+03:00',
    herEndConfirmed: true,
  };
  expect(trainingMinutes(backwards)).toBeNull();
});

test('formatWorkoutTime rounds to the nearest 5, both directions', () => {
  expect(formatWorkoutTime({ ...CONFIRMED, herEndAt: '2026-09-26T21:51:00+03:00' })).toBe(
    'about 45 min' // 47 -> 45
  );
  expect(formatWorkoutTime({ ...CONFIRMED, herEndAt: '2026-09-26T21:53:00+03:00' })).toBe(
    'about 50 min' // 49 -> 50
  );
});

test('formatWorkoutTime is blank, never "about 0 min", when there is nothing to show', () => {
  expect(formatWorkoutTime({})).toBe('');
});
