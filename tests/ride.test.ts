// tests/ride.test.ts — ride.ts (THE RIDES PAGE, Sep 27 2026)
//
// Pure-logic tests, same shape as tests/timing.test.ts / tests/week.test.ts:
// no `page` fixture, so Playwright runs these in Node.
//
// Covers the task spec exactly: "a pure ride.ts with the derived-number
// helpers (kcal/min, km/h, min/km, projections, median, best) + unit tests
// on her real numbers" — her three real rides:
//   Sep 24 A: 602 s (10:02) · 0.72 km · 63.4 kcal · L5 -> 6.3 kcal/min, 4.3 km/h
//   Sep 25 C: 1501 s (25:01) · 1.87 km · 140.5 kcal · L3 -> 5.6 kcal/min
//   Sep 26 B: 600 s (10:00) · 0.69 km · 62.4 kcal · L5

import { test, expect } from '@playwright/test';
import {
  hasRideNumbers,
  isPlausibleRideRate,
  rideRate,
  projectedKcal,
  projectedKm,
  median,
  usualKcalPerMin,
  bestRide,
  rideTotals,
  type RideRecord,
} from '../ride';

const RIDE_A: RideRecord = {
  id: 'a1',
  date: '2026-09-24',
  workout: 'A',
  level: 5,
  km: 0.72,
  kcal: 63.4,
  timeSec: 602,
};
const RIDE_C: RideRecord = {
  id: 'c1',
  date: '2026-09-25',
  workout: 'C',
  level: 3,
  km: 1.87,
  kcal: 140.5,
  timeSec: 1501,
};
const RIDE_B: RideRecord = {
  id: 'b1',
  date: '2026-09-26',
  workout: 'B',
  level: 5,
  km: 0.69,
  kcal: 62.4,
  timeSec: 600,
};

test.describe('rideRate: her three real rides', () => {
  test('Sep 24 A: 63.4 kcal / 10:02 -> 6.3 kcal/min, 4.3 km/h', () => {
    const rate = rideRate(RIDE_A);
    expect(rate.rateEligible).toBe(true);
    expect(rate.kcalPerMin).toBe(6.3);
    expect(rate.kmh).toBe(4.3);
  });

  test('Sep 25 C: 140.5 kcal / 25:01 -> 5.6 kcal/min', () => {
    const rate = rideRate(RIDE_C);
    expect(rate.kcalPerMin).toBe(5.6);
    expect(rate.kmh).toBe(4.5);
  });

  test('Sep 26 B: 62.4 kcal / 10:00 -> 6.2 kcal/min, 4.1 km/h', () => {
    const rate = rideRate(RIDE_B);
    expect(rate.kcalPerMin).toBe(6.2);
    expect(rate.kmh).toBe(4.1);
  });

  test("paceMinPerKm is km/h's inverse, mm:ss per km", () => {
    // 602s / 0.72km = 836.1s/km = 13:56
    expect(rideRate(RIDE_A).paceMinPerKm).toBe('13:56');
  });
});

test.describe("hasRideNumbers / rateEligible: §4.2's exact exclusion rule", () => {
  test('kcal 0 -> excluded, "no numbers"', () => {
    const r: RideRecord = { ...RIDE_A, kcal: 0 };
    expect(hasRideNumbers(r)).toBe(false);
    expect(rideRate(r).rateEligible).toBe(false);
    expect(rideRate(r).kcalPerMin).toBeNull();
  });

  test('missing (null) time -> excluded, "no numbers"', () => {
    const r: RideRecord = { ...RIDE_A, timeSec: null };
    expect(hasRideNumbers(r)).toBe(false);
    expect(rideRate(r).kcalPerMin).toBeNull();
  });

  test('missing kcal -> excluded even with a real time', () => {
    const r: RideRecord = { ...RIDE_A, kcal: null };
    expect(hasRideNumbers(r)).toBe(false);
  });

  test('km missing does not block the kcal/min rate — only km/h+pace go null', () => {
    const r: RideRecord = { ...RIDE_A, km: null };
    const rate = rideRate(r);
    expect(rate.rateEligible).toBe(true);
    expect(rate.kcalPerMin).toBe(6.3);
    expect(rate.kmh).toBeNull();
    expect(rate.paceMinPerKm).toBeNull();
  });

  test('a real ride with both -> has numbers', () => {
    expect(hasRideNumbers(RIDE_A)).toBe(true);
  });
});

test.describe('projections: her toggle — "10 min, 30, hour"', () => {
  test('10 min at 6.3 kcal/min -> 63 kcal', () => {
    expect(projectedKcal(6.3, 'tenMin')).toBe(63);
  });
  test('30 min at 6.3 kcal/min -> 189 kcal', () => {
    expect(projectedKcal(6.3, 'thirtyMin')).toBe(189);
  });
  test('an hour at 6.3 kcal/min -> 378 kcal', () => {
    expect(projectedKcal(6.3, 'hour')).toBe(378);
  });
  test('projectedKm scales km/h by the same window', () => {
    expect(projectedKm(4.3, 'tenMin')).toBe(0.72); // 4.3 * (10/60)
    expect(projectedKm(4.3, 'hour')).toBe(4.3);
  });
});

test.describe('median', () => {
  test('odd count: the middle value', () => {
    expect(median([6.3, 5.6, 6.2])).toBe(6.2);
  });
  test('even count: the average of the two middle values, rounded to 1dp', () => {
    // (5.6+6.3)/2 = 5.9499999999999993 in floating point -> rounds to 5.9,
    // not 5.95 -> 6.0 — asserting the ACTUAL float behavior, not the exact
    // decimal a calculator would give.
    expect(median([6.3, 5.6])).toBe(5.9);
  });
  test('empty -> null', () => {
    expect(median([])).toBeNull();
  });
});

test.describe('usualKcalPerMin: "median of last 5 rides, shown when >= 5 rides"', () => {
  test('fewer than 5 rate-eligible rides -> null (not shown)', () => {
    expect(usualKcalPerMin([RIDE_A, RIDE_C, RIDE_B])).toBeNull();
  });

  test('exactly 5 rate-eligible rides -> the median of those 5', () => {
    const five: RideRecord[] = [
      { ...RIDE_A, id: 'r1', date: '2026-09-01' },
      { ...RIDE_A, id: 'r2', date: '2026-09-05', kcal: 60 }, // 60/10.033=5.98->6.0
      { ...RIDE_A, id: 'r3', date: '2026-09-10' },
      { ...RIDE_A, id: 'r4', date: '2026-09-15', kcal: 70 }, // 70/10.033=6.98->7.0
      { ...RIDE_A, id: 'r5', date: '2026-09-20' },
    ];
    // rates: 6.3, 6.0, 6.3, 7.0, 6.3 -> sorted 6.0,6.3,6.3,6.3,7.0 -> median 6.3
    expect(usualKcalPerMin(five)).toBe(6.3);
  });

  test('a "no numbers" ride in the mix is skipped, never treated as a 0', () => {
    const withGap: RideRecord[] = [
      { ...RIDE_A, id: 'r1', date: '2026-09-01' },
      { ...RIDE_A, id: 'gap', date: '2026-09-03', kcal: null }, // no numbers
      { ...RIDE_A, id: 'r2', date: '2026-09-05' },
      { ...RIDE_A, id: 'r3', date: '2026-09-10' },
      { ...RIDE_A, id: 'r4', date: '2026-09-15' },
      { ...RIDE_A, id: 'r5', date: '2026-09-20' },
    ];
    // 5 rate-eligible rides, all 6.3 -> median 6.3 (the gap never counted as a 5th)
    expect(usualKcalPerMin(withGap)).toBe(6.3);
  });

  // v54 fix r3 (Sep 27 2026), checker's nice #1: same reasoning as bestRide's
  // — a 1s ride shouldn't drag "Your usual" toward a number nobody rode.
  test('a 1s implausible ride in the mix is skipped, same as "no numbers"', () => {
    const withOutlier: RideRecord[] = [
      { ...RIDE_A, id: 'r1', date: '2026-09-01' },
      { ...RIDE_A, id: 'broken', date: '2026-09-03', kcal: 3, timeSec: 1 }, // 180 kcal/min
      { ...RIDE_A, id: 'r2', date: '2026-09-05' },
      { ...RIDE_A, id: 'r3', date: '2026-09-10' },
      { ...RIDE_A, id: 'r4', date: '2026-09-15' },
      { ...RIDE_A, id: 'r5', date: '2026-09-20' },
    ];
    // 5 plausible rides, all 6.3 -> median 6.3 (the outlier never counted as a 5th)
    expect(usualKcalPerMin(withOutlier)).toBe(6.3);
  });
});

test.describe('bestRide: the highest kcal/min, with its date — never a verdict word', () => {
  test('picks the highest among her three real rides', () => {
    const best = bestRide([RIDE_A, RIDE_C, RIDE_B]);
    expect(best?.kcalPerMin).toBe(6.3);
    expect(best?.ride.id).toBe('a1');
  });

  test('a "no numbers" ride is never picked as best', () => {
    const noNumbers: RideRecord = { ...RIDE_A, id: 'x', kcal: 0 };
    const best = bestRide([noNumbers, RIDE_C]);
    expect(best?.ride.id).toBe('c1');
  });

  test('no rate-eligible rides -> null', () => {
    expect(bestRide([{ ...RIDE_A, kcal: null }])).toBeNull();
  });

  // v54 fix r3 (Sep 27 2026), checker's nice #1: her own repro — a 1s test
  // ride gave 180 kcal/min · 126 km/h and would otherwise sit in "Your best"
  // forever, since bestRide never ages out a max.
  test('a 1s ride (broken timer) is never picked as best, even though it "has numbers"', () => {
    const oneSecond: RideRecord = {
      ...RIDE_A,
      id: 'broken',
      date: '2026-09-27',
      kcal: 3,
      timeSec: 1, // 3/(1/60) = 180 kcal/min
    };
    expect(hasRideNumbers(oneSecond)).toBe(true); // still "has numbers"
    expect(isPlausibleRideRate(oneSecond)).toBe(false);
    const best = bestRide([oneSecond, RIDE_A, RIDE_C, RIDE_B]);
    expect(best?.ride.id).toBe('a1'); // her real best (6.3), not the broken 180
  });
});

test.describe('isPlausibleRideRate: guards a broken-timer outlier out of best/usual', () => {
  test('a normal real ride is plausible', () => {
    expect(isPlausibleRideRate(RIDE_A)).toBe(true);
  });

  test('under 3 min is implausible even with an ordinary-looking rate', () => {
    // 12 kcal / 2 min = 6.0 kcal/min — a perfectly normal rate, but too short
    // a ride to trust as a reading.
    const short: RideRecord = { ...RIDE_A, id: 'short', kcal: 12, timeSec: 120 };
    expect(isPlausibleRideRate(short)).toBe(false);
  });

  test('over 20 kcal/min is implausible even at a normal length', () => {
    // 100 kcal / (200s / 60) = 30 kcal/min at 3:20 — long enough, rate's not.
    const tooFast: RideRecord = { ...RIDE_A, id: 'fast', kcal: 100, timeSec: 200 };
    expect(isPlausibleRideRate(tooFast)).toBe(false);
  });

  test('exactly at the boundary (3 min, 20 kcal/min) is still plausible', () => {
    const boundary: RideRecord = { ...RIDE_A, id: 'boundary', kcal: 60, timeSec: 180 }; // 20.0 kcal/min
    expect(isPlausibleRideRate(boundary)).toBe(true);
  });

  test('"no numbers" is never plausible either', () => {
    expect(isPlausibleRideRate({ ...RIDE_A, kcal: null })).toBe(false);
  });
});

test.describe('rideTotals: rides · minutes · km · kcal', () => {
  test('her three real rides sum plainly', () => {
    const t = rideTotals([RIDE_A, RIDE_C, RIDE_B]);
    expect(t.rides).toBe(3);
    // 602+1501+600 = 2703s -> 45.05min -> rounds to 45
    expect(t.minutes).toBe(45);
    expect(t.km).toBe(round2(0.72 + 1.87 + 0.69));
    expect(t.kcal).toBe(round1(63.4 + 140.5 + 62.4));
  });

  test('a "no numbers" ride still counts toward `rides`, contributes nothing else', () => {
    const noNumbers: RideRecord = {
      id: 'x',
      date: '2026-09-27',
      workout: 'A',
      level: null,
      km: null,
      kcal: null,
      timeSec: null,
    };
    const t = rideTotals([RIDE_A, noNumbers]);
    expect(t.rides).toBe(2);
    expect(t.minutes).toBe(rideTotals([RIDE_A]).minutes);
    expect(t.km).toBe(rideTotals([RIDE_A]).km);
    expect(t.kcal).toBe(rideTotals([RIDE_A]).kcal);
  });

  test('empty list -> all zero, never a crash', () => {
    expect(rideTotals([])).toEqual({ rides: 0, minutes: 0, km: 0, kcal: 0 });
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
