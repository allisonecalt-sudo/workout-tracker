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
  weekRideAggregate,
  weeklyRideRows,
  type RideRecord,
} from '../ride';
import { walkWeeks, type WeekSpan, type WeekKey } from '../week';

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

  test('v55 fix — pace never rolls to ":60" seconds (CHECK N2)', () => {
    // 898 s / 5 km = 179.6 s/km exactly. Rounding minutes and seconds
    // SEPARATELY gave floor(179.6/60)=2 and round(179.6%60)=round(59.6)=60
    // — the old "2:60" bug. Rounding the total seconds once first carries
    // it correctly: 180 s = 3:00.
    const r: RideRecord = { ...RIDE_A, km: 5, timeSec: 898, kcal: 50 };
    expect(rideRate(r).paceMinPerKm).toBe('3:00');
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
  test('projectedKm scales the raw km/time ratio by the window', () => {
    // 4.3 km in 3600 s (1 hour) = exactly 4.3 km/h — round numbers, so the
    // raw-ratio fix and the old rounded-km/h approach agree here.
    expect(projectedKm(4.3, 3600, 'tenMin')).toBe(0.72); // 4.3 * (10/60)
    expect(projectedKm(4.3, 3600, 'hour')).toBe(4.3);
  });
  test('v55 fix — uses the raw ratio, not a pre-rounded km/h (CHECK N1)', () => {
    // Her real ride: 0.69 km in 600 s (10 min). True km/h is 4.14, which
    // ROUNDS to 4.1 — the old code multiplied that rounded 4.1 by the
    // window and gave 0.68 km for her own 10-min ride. The raw ratio must
    // give back exactly what she rode.
    expect(projectedKm(0.69, 600, 'tenMin')).toBe(0.69);
    expect(projectedKm(0.69, 600, 'hour')).toBe(4.14);
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

// v57 (Sep 28 2026) — "Week by week" (her words, Sun Sep 27 22:45): "I want
// week on week comparison with elliptical" · "Also how much time total" ·
// "Also kph".

test.describe('weekRideAggregate: the week-level rate (sum first, divide once)', () => {
  test('her real Week 4 (Sep 24 A / Sep 25 C / Sep 26 B) — verified by hand', () => {
    // 602+1501+600 = 2703s -> 45.05min -> 45; 0.72+1.87+0.69 = 3.28km;
    // 63.4+140.5+62.4 = 266.3kcal.
    // avg kcal/min = 266.3 / (2703/60) = 266.3/45.05 = 5.912... -> 5.9
    // (NOT the mean of the 3 rides' own rates, 6.3/5.6/6.2 -> 6.058 -> 6.1 —
    // that's the wrong average; the task spec's own worked answer is 5.9).
    // avg km/h = 3.28 / (2703/3600) = 3.28/0.75083 = 4.3688 -> 4.4
    // avg level = (5+3+5)/3 = 4.333 -> 4.3
    const agg = weekRideAggregate([RIDE_A, RIDE_C, RIDE_B]);
    expect(agg.rides).toBe(3);
    expect(agg.minutes).toBe(45);
    expect(agg.km).toBe(3.28);
    expect(agg.kcal).toBe(266.3);
    expect(agg.avgKcalPerMin).toBe(5.9);
    expect(agg.avgKmh).toBe(4.4);
    expect(agg.avgLevel).toBe(4.3);
  });

  test('empty week -> zero totals, null averages, never a crash', () => {
    const agg = weekRideAggregate([]);
    expect(agg).toEqual({
      rides: 0,
      minutes: 0,
      km: 0,
      kcal: 0,
      avgKcalPerMin: null,
      avgKmh: null,
      avgLevel: null,
    });
  });

  test('a "no numbers" ride counts toward rides but not the rate averages', () => {
    const noNumbers: RideRecord = { ...RIDE_A, id: 'x', kcal: null, timeSec: null, km: null };
    const agg = weekRideAggregate([RIDE_A, noNumbers]);
    expect(agg.rides).toBe(2);
    // Same rate as RIDE_A alone — the no-numbers ride contributes nothing.
    expect(agg.avgKcalPerMin).toBe(weekRideAggregate([RIDE_A]).avgKcalPerMin);
  });

  test('level averages independently of kcal/time (km/h-only or kcal-only rides)', () => {
    const kcalOnly: RideRecord = { ...RIDE_A, id: 'k', km: null, level: null };
    const agg = weekRideAggregate([kcalOnly, RIDE_C]);
    // Levels: null (skipped), 3 -> average of just the one real level.
    expect(agg.avgLevel).toBe(3);
  });
});

test.describe('weeklyRideRows: the table — last N weeks, newest first, "so far"', () => {
  test('her real Week 4 as a closed span + an empty open Week 5, D-ride-free', () => {
    // The exact production shape: Week 4 closes ON a Saturday (Sep 26), so
    // week.ts opens Week 5 at that SAME instant (weekendAnchorDay branch) —
    // this is the scenario renderRidesTotalsCard's v54 fix r3 comment
    // (app.ts) already had to guard against double-counting. Membership
    // (`weekOf`) must keep the closing ride in Week 4 only.
    const sessions = [
      { id: 'a1', date: '2026-09-24', workout: 'A' as const },
      { id: 'c1', date: '2026-09-25', workout: 'C' as const },
      { id: 'b1', date: '2026-09-26', workout: 'B' as const },
    ];
    const { spans, open, weekOf } = walkWeeks(sessions, [], [], {
      round: 2,
      week: 4,
      at: '2026-09-24T00:00:00+03:00',
    });
    expect(spans).toHaveLength(1);
    expect(open?.key).toEqual({ round: 2, week: 5 });

    const rows = weeklyRideRows([RIDE_A, RIDE_C, RIDE_B], weekOf, spans, open);
    expect(rows).toHaveLength(2);
    // Newest first: Week 5 (open, "so far") then Week 4 (closed).
    expect(rows[0]?.key).toEqual({ round: 2, week: 5 });
    expect(rows[0]?.isOpen).toBe(true);
    expect(rows[0]?.rides).toBe(0); // no double-count of the Sat closing ride
    expect(rows[0]?.avgKcalPerMin).toBeNull();

    expect(rows[1]?.key).toEqual({ round: 2, week: 4 });
    expect(rows[1]?.isOpen).toBe(false);
    expect(rows[1]?.rides).toBe(3);
    expect(rows[1]?.minutes).toBe(45);
    expect(rows[1]?.km).toBe(3.28);
    expect(rows[1]?.kcal).toBe(266.3);
    expect(rows[1]?.avgKcalPerMin).toBe(5.9);
    expect(rows[1]?.avgKmh).toBe(4.4);
    expect(rows[1]?.avgLevel).toBe(4.3);
  });

  test('a D ride (never in weekOf) is bucketed by date into the open week', () => {
    const sessions = [
      { id: 'a1', date: '2026-09-24', workout: 'A' as const },
      { id: 'c1', date: '2026-09-25', workout: 'C' as const },
      { id: 'b1', date: '2026-09-26', workout: 'B' as const },
    ];
    const { spans, open, weekOf } = walkWeeks(sessions, [], [], {
      round: 2,
      week: 4,
      at: '2026-09-24T00:00:00+03:00',
    });
    const dRide: RideRecord = { ...RIDE_A, id: 'd1', date: '2026-09-27', workout: 'D' };
    const rows = weeklyRideRows([RIDE_A, RIDE_C, RIDE_B, dRide], weekOf, spans, open);
    const week5 = rows.find((r) => r.key.week === 5);
    expect(week5?.rides).toBe(1);
    expect(week5?.isOpen).toBe(true);
    // Week 4 is untouched by the D ride.
    const week4 = rows.find((r) => r.key.week === 4);
    expect(week4?.rides).toBe(3);
  });

  test('a D ride landing in a weekday gap (no open week) counts back to the closed week', () => {
    // Week 4 closes on Thursday Sep 17 2026 (a weekday, not Sat/Sun) -> the
    // next week can't open until the following Saturday (Sep 19). A D ride
    // on Friday Sep 18 lands in that gap — week.ts's own rule for A/B/C
    // ("a gap session counts backward to the week that just closed"),
    // generalized here to D via date-range bucketing since D never has
    // weekOf membership to fall back on first.
    const sessions = [
      { id: 'a1', date: '2026-09-15', workout: 'A' as const },
      { id: 'c1', date: '2026-09-16', workout: 'C' as const },
      { id: 'b1', date: '2026-09-17', workout: 'B' as const },
    ];
    const { spans, open, weekOf } = walkWeeks(sessions, [], [], {
      round: 2,
      week: 4,
      at: '2026-09-15T00:00:00+03:00',
    });
    expect(open).toBeNull(); // still a gap — no session since the close
    const dRide: RideRecord = { ...RIDE_A, id: 'd1', date: '2026-09-18', workout: 'D' };
    const rows = weeklyRideRows([RIDE_A, RIDE_C, RIDE_B, dRide], weekOf, spans, open);
    expect(rows).toHaveLength(1); // no open span to add a row for
    expect(rows[0]?.key).toEqual({ round: 2, week: 4 });
    expect(rows[0]?.rides).toBe(4); // the 3 real sessions + the gap D ride
  });

  test('only the last N weeks are returned, newest first', () => {
    const span = (round: number, week: number, openedAt: string, closedAt: string): WeekSpan => ({
      key: { round, week },
      openedAt,
      closedAt,
      how: 'three',
      sessions: [],
      done: ['A', 'B', 'C'],
      missing: [],
    });
    const spans: WeekSpan[] = [
      span(2, 1, '2026-08-01', '2026-08-08'),
      span(2, 2, '2026-08-08', '2026-08-15'),
      span(2, 3, '2026-08-15', '2026-08-22'),
      span(2, 4, '2026-08-22', '2026-08-29'),
      span(2, 5, '2026-08-29', '2026-09-05'),
      span(2, 6, '2026-09-05', '2026-09-12'),
      span(2, 7, '2026-09-12', '2026-09-19'),
    ];
    const weekOf = new Map<string, WeekKey>();
    const rows = weeklyRideRows([], weekOf, spans, null, null, 6);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.key.week)).toEqual([7, 6, 5, 4, 3, 2]); // week 1 dropped
    // Every row here has 0 rides — the "—" the app shows is app.ts's own
    // display choice; this module reports the plain 0/null.
    expect(rows.every((r) => r.rides === 0 && r.avgKcalPerMin === null)).toBe(true);
  });

  test('no spans and no open week -> an empty table, never a crash', () => {
    expect(weeklyRideRows([], new Map(), [], null)).toEqual([]);
  });
});

// v61.1 fix 3 (Oct 2 2026, CHECK-v61.1.md check 2's must #1): the D fallback
// used to invent its own [openedAt, next openedAt)/Infinity window instead
// of asking week-d.ts for the SAME calendar window every other D-counting
// screen already shares (weekTargetForD) — so the Rides screen could name a
// different week than Home for the same D. These two cases are the exact
// shapes CHECK-v61.1.md's "r2" and "r1noD" repros drove through the app;
// tests/week-d.test.ts covers the underlying window math directly.
test.describe("weeklyRideRows: the D fallback shares week-d.ts's own window, not a second one", () => {
  test("a D logged BEFORE the session that opens a new week still lands in the OPEN week's row, never the one that just closed", () => {
    // C (Tue Sep 29) closes Week 5 — a weekday close, so Week 6 waits for
    // the next Sat/Sun (Oct 3). An A on Sat Oct 3 at 10:00 local opens
    // Week 6 right then (it falls ON the anchor day). A D at 08:00 local
    // that same Saturday — before the A that actually opens the week — is
    // her real Sep 28 order, replayed at this boundary (same shape as
    // week-d.test.ts's own "repro 2").
    const sessions = [
      { id: 'a1', date: '2026-09-27T15:00:00.000Z', workout: 'A' as const },
      { id: 'b1', date: '2026-09-28T15:00:00.000Z', workout: 'B' as const },
      { id: 'c1', date: '2026-09-29T15:00:00.000Z', workout: 'C' as const },
      { id: 'a2', date: '2026-10-03T07:00:00.000Z', workout: 'A' as const }, // 10:00 local — opens Week 6
    ];
    const { spans, open, pending, weekOf } = walkWeeks(sessions, [], []);
    expect(spans).toHaveLength(1);
    expect(open?.key).toEqual({ round: 2, week: 6 });
    const dRide: RideRecord = {
      ...RIDE_A,
      id: 'd1',
      date: '2026-10-03T05:00:00.000Z',
      workout: 'D',
    }; // 08:00 local, before a2
    const rows = weeklyRideRows([dRide], weekOf, spans, open, pending);
    const week5 = rows.find((r) => r.key.week === 5);
    const week6 = rows.find((r) => r.key.week === 6);
    expect(week6?.rides).toBe(1); // the open week claims it
    expect(week5?.rides).toBe(0); // never also the week that already closed
  });

  test('"r1noD" shape — C closes the week, D lands mid-gap before any A/B/C reopens it: the D is in NO closed row (it belongs to the pending week, which has no row yet)', () => {
    const sessions = [
      { id: 'a1', date: '2026-09-27T15:00:00.000Z', workout: 'A' as const },
      { id: 'b1', date: '2026-09-28T15:00:00.000Z', workout: 'B' as const },
      { id: 'c1', date: '2026-09-29T15:00:00.000Z', workout: 'C' as const }, // closes Week 5 — Week 6 pending, opens Sat Oct 3
    ];
    const { spans, open, pending, weekOf } = walkWeeks(sessions, [], []);
    expect(open).toBeNull();
    expect(pending?.key).toEqual({ round: 2, week: 6 });
    const dRide: RideRecord = {
      ...RIDE_A,
      id: 'd1',
      date: '2026-10-03T07:00:00.000Z',
      workout: 'D',
    }; // 10:00 local, Week 6's own opening day — mid-gap
    const rows = weeklyRideRows([dRide], weekOf, spans, open, pending);
    expect(rows).toHaveLength(1); // only Week 5's closed row — no open row exists to add Week 6's D to
    expect(rows[0]?.key).toEqual({ round: 2, week: 5 });
    expect(rows[0]?.rides).toBe(0); // and Week 5 never claims it either
  });
});
