// tests/what-grew.test.ts - v64: Progress's "What grew" rows (what-grew.ts), pure.
import { test, expect } from '@playwright/test';
import { whatGrew } from '../what-grew';
import { workoutsAndRides, sinceFullWeeksLine, fullWeeksWords } from '../number-rules';
import type { LogEntry } from '../types';

const log = (id: string, date: string, workout: LogEntry['workout'], x: Partial<LogEntry> = {}) =>
  ({
    id,
    date,
    workout,
    capacityBefore: 5,
    capacityAfter: 5,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    ...x,
  }) as LogEntry;

const ride = (id: string, date: string, min: number, level: number, x: Partial<LogEntry> = {}) =>
  log(id, date, 'A', {
    cardioLane: 'elliptical',
    ellipticalLevel: level,
    ellipticalTimeSec: min * 60,
    ...x,
  });

test.describe('v64 what grew (pure)', () => {
  test('wall sit: honest readings only (pre Sep 24 prescribed holds never count), first -> latest, own since', () => {
    const g = whatGrew([
      log('a', '2026-05-02T10:00:00Z', 'A', { wallSitSec: 33 }),
      log('b', '2026-09-24T10:00:00Z', 'A', { wallSitSec: 44 }),
      log('c', '2026-09-28T10:00:00Z', 'A', { wallSitSec: 45 }),
    ]);
    expect(g.rows).toEqual([
      { label: 'Wall sit', value: '44 s → 45 s', since: '2026-09-24T10:00:00Z' },
    ]);
  });

  test('one honest wall sit shows alone, no "from"', () => {
    const g = whatGrew([log('b', '2026-09-24T10:00:00Z', 'A', { wallSitSec: 44 })]);
    expect(g.rows[0]?.value).toBe('44 s');
  });

  test('arm curl: the load chip readings, one reading alone, a change as first -> latest', () => {
    const one = whatGrew([log('a', '2026-09-28T10:00:00Z', 'A', { armFeel: 'curl=right@2kg' })]);
    expect(one.rows).toEqual([{ label: 'Arm curl', value: '2 kg', since: '2026-09-28T10:00:00Z' }]);
    const two = whatGrew([
      log('a', '2026-09-20T10:00:00Z', 'A', { armFeel: 'curl=easy@1kg' }),
      log('b', '2026-09-28T10:00:00Z', 'A', { armFeel: 'curl=right@2kg;row=right@2kg' }),
    ]);
    expect(two.rows[0]?.value).toBe('1 kg → 2 kg');
    // a feel with no load is not a load reading
    expect(
      whatGrew([log('a', '2026-09-26T10:00:00Z', 'A', { armFeel: 'curl=right' })]).rows
    ).toEqual([]);
  });

  test('longest ride: first ride length -> longest; the console time wins, else the minutes logged', () => {
    const g = whatGrew([
      ride('r1', '2026-09-24T10:00:00Z', 10, 5),
      ride('r2', '2026-09-25T10:00:00Z', 25, 3),
      log('d', '2026-09-28T10:00:00Z', 'D', {
        cardioLane: 'elliptical',
        cardioMinutes: 30,
        ellipticalLevel: 3,
      }),
    ]);
    const row = g.rows.find((r) => r.label === 'Longest ride');
    expect(row?.value).toBe('10 min → 30 min');
    expect(row?.since).toBe('2026-09-24T10:00:00Z');
    expect(g.words).toBe('Rides got longer; the longest was at level 3.');
  });

  test('a level row only across rides of the SAME length; none otherwise', () => {
    const none = whatGrew([
      ride('r1', '2026-09-24T10:00:00Z', 10, 5),
      ride('r2', '2026-09-25T10:00:00Z', 25, 3),
    ]);
    expect(none.rows.some((r) => r.label.startsWith('Level'))).toBe(false);
    const some = whatGrew([
      ride('r1', '2026-09-24T10:00:00Z', 10, 5),
      ride('r2', '2026-09-25T10:00:00Z', 25, 3),
      ride('r3', '2026-10-18T10:00:00Z', 10, 3),
    ]);
    const lvl = some.rows.find((r) => r.label === 'Level at 10 min');
    expect(lvl?.value).toBe('L5 → L3');
    expect(lvl?.since).toBe('2026-09-24T10:00:00Z');
  });

  test('rides of the same length every time: no "got longer" words', () => {
    const g = whatGrew([
      ride('r1', '2026-09-24T10:00:00Z', 10, 5),
      ride('r2', '2026-09-26T10:00:00Z', 10, 5),
    ]);
    expect(g.words).toBe('');
    expect(g.rows.find((r) => r.label === 'Longest ride')?.value).toBe('10 min');
  });

  test('no data, no rows', () => {
    expect(whatGrew([])).toEqual({ rows: [], words: '' });
  });
});

test.describe('v64 number words (pure)', () => {
  test('workouts and rides: the F3 counts, "+ 1 ride" as its own tag', () => {
    expect(workoutsAndRides({ sessions: 44, dRides: 1 })).toBe('44 workouts + 1 ride');
    expect(workoutsAndRides({ sessions: 1, dRides: 0 })).toBe('1 workout');
    expect(workoutsAndRides({ sessions: 3, dRides: 2 })).toBe('3 workouts + 2 rides');
  });

  test('full weeks words and the Home line', () => {
    expect(fullWeeksWords(1)).toBe('1 full week');
    expect(fullWeeksWords(14)).toBe('14 full weeks');
    expect(sinceFullWeeksLine('2026-05-02T15:00:00+03:00', 14)).toBe('Since May: 14 full weeks');
    expect(sinceFullWeeksLine('2026-05-02T15:00:00+03:00', 0)).toBe('Your weeks since May');
  });
});

import { weekCardioMinutes } from '../cardio-notes';

test.describe('v64 cardio minutes for the Rides hero (pure)', () => {
  const ride = (min: number, x: Partial<LogEntry> = {}) =>
    log('r', '2026-09-28T10:00:00Z', 'A', {
      cardioLane: 'elliptical',
      ellipticalTimeSec: min * 60,
      ...x,
    });

  test('rides count their console time; the logged minutes only when there is no console time; never both', () => {
    const withTime = ride(12, { cardioMinutes: 10 });
    const noTime = log('d', '2026-09-28T10:00:00Z', 'D', {
      cardioLane: 'elliptical',
      cardioMinutes: 30,
    });
    expect(weekCardioMinutes([withTime, noTime], [])).toEqual({ rides: 42, other: 0, total: 42 });
  });

  test('a walk-lane session (a hike) and standalone walks are "other cardio"', () => {
    const hike = log('h', '2026-10-01T10:00:00Z', 'B', { cardioLane: 'walk', walkMinutes: 120 });
    const apt = log('p', '2026-10-01T11:00:00Z', 'C', {
      cardioLane: 'apartment',
      cardioMinutes: 25,
    });
    const out = weekCardioMinutes([ride(12), hike, apt], [{ minutes: 20 }, { minutes: null }, {}]);
    expect(out).toEqual({ rides: 12, other: 165, total: 177 });
  });

  test('nothing this week is 0, and a session with no cardio adds nothing', () => {
    expect(weekCardioMinutes([log('a', '2026-09-28T10:00:00Z', 'A')], [])).toEqual({
      rides: 0,
      other: 0,
      total: 0,
    });
  });
});
