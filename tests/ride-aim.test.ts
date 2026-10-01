// tests/ride-aim.test.ts — v61 (Sep 28 2026), spec item g: the ride card's
// derived distance aim. Pure-logic, no `page` fixture (same reasoning as
// ride.test.ts's own header) — verified against her real logged rides, per
// ride-aim.ts's own header comment on why the bucket is EXACT (level +
// rounded planned minutes), not a broad short/long category.
import { test, expect } from '@playwright/test';
import { bestKmPer10MinAt, deriveRideAim, lastTimeAtSameAim } from '../ride-aim';
import type { RideRecord } from '../ride';

// Her four real rides (task spec's own list, re-verified here): Sep 24 A L5
// 10:02 (602s) 0.72 km; Sep 26 B L5 10:00 (600s) 0.69 km; Sep 25 C L3 25:01
// (1501s) 1.87 km; Sep 28 D L3 30:00 (1800s) 2.1 km.
const A: RideRecord = {
  id: 'a',
  date: '2026-09-24',
  workout: 'A',
  level: 5,
  km: 0.72,
  kcal: 63.4,
  timeSec: 602,
};
const B: RideRecord = {
  id: 'b',
  date: '2026-09-26',
  workout: 'B',
  level: 5,
  km: 0.69,
  kcal: 62.4,
  timeSec: 600,
};
const C: RideRecord = {
  id: 'c',
  date: '2026-09-25',
  workout: 'C',
  level: 3,
  km: 1.87,
  kcal: 140.5,
  timeSec: 1501,
};
const D: RideRecord = {
  id: 'd',
  date: '2026-09-28',
  workout: 'D',
  level: 3,
  km: 2.1,
  kcal: 190.8,
  timeSec: 1800,
};
const ALL = [A, B, C, D];

test('bestKmPer10MinAt: exact level + rounded-minutes match only, best (not average) of the matches', () => {
  // A and B are both L5 · 10 min (602s/600s both round to 10) — the bucket
  // picks the FASTER of the two, A's 0.72/602*600 ≈ 0.7176, not B's 0.69.
  expect(bestKmPer10MinAt(ALL, 5, 10)).toBeCloseTo(0.71761, 4);
  // C and D are L3 but at DIFFERENT rounded lengths (25 vs 30) — each is the
  // only ride in its own exact bucket.
  expect(bestKmPer10MinAt(ALL, 3, 25)).toBeCloseTo(0.7475, 4);
  expect(bestKmPer10MinAt(ALL, 3, 30)).toBeCloseTo(0.7, 4);
  // No ride at all at L5 · 12 min (only 10-min rides exist at L5) — null,
  // never an extrapolation from the 10-min bucket.
  expect(bestKmPer10MinAt(ALL, 5, 12)).toBeNull();
  // A level she's never ridden at all.
  expect(bestKmPer10MinAt(ALL, 9, 10)).toBeNull();
});

test('deriveRideAim: her worked examples — D aim 2.1, C aim 1.85 (task spec, verified)', () => {
  // D's own bucket (L3 · 30 min) has only D itself: pace 0.7/10min scaled by
  // its own 30 planned minutes recovers exactly 2.1 (an exact multiple of
  // 0.05 already).
  expect(deriveRideAim(ALL, 30, 3)).toEqual({ km: 2.1 });
  // C's own bucket (L3 · 25 min) has only C itself: pace ≈0.74750 scaled by
  // the PLANNED 25 (not C's true 25.02 elapsed minutes) gives 1.86875, which
  // rounds DOWN to 1.85 — the planned/actual gap is exactly why this isn't
  // C's own recorded 1.87.
  expect(deriveRideAim(ALL, 25, 3)).toEqual({ km: 1.85 });
});

test('deriveRideAim: a new planned length at a level she HAS ridden before → first ride, no number', () => {
  // "A/B at 12 min L5" (task spec) — L5 · 10 min history exists (A, B), but
  // never L5 · 12 min. No cross-length blending: first ride at this exact
  // length, even though the level itself is familiar.
  expect(deriveRideAim(ALL, 12, 5)).toEqual({ isFirst: true });
});

test('deriveRideAim: her very first ride ever — no history at all → first ride', () => {
  expect(deriveRideAim([], 10, 3)).toEqual({ isFirst: true });
});

test('deriveRideAim: rounds to the nearest 0.05 km both ways', () => {
  // Both rides run their planned length EXACTLY (timeSec is a clean multiple
  // of 60), so the scale factor is exactly 1 and the aim is just the km
  // itself, rounded — isolating round05's own behaviour from the
  // planned-vs-actual discrepancy the C/D examples above exercise.
  const up: RideRecord = {
    id: 'x',
    date: '2026-01-01',
    workout: 'A',
    level: 4,
    km: 1.02,
    kcal: 50,
    timeSec: 600,
  };
  const down: RideRecord = {
    id: 'y',
    date: '2026-01-01',
    workout: 'A',
    level: 4,
    km: 1.03,
    kcal: 50,
    timeSec: 600,
  };
  expect(deriveRideAim([up], 10, 4)).toEqual({ km: 1.0 }); // 1.02 rounds DOWN to 1.00
  expect(deriveRideAim([down], 10, 4)).toEqual({ km: 1.05 }); // 1.03 rounds UP to 1.05
});

test('lastTimeAtSameAim: the most recent km at this exact level+length, or null with no match', () => {
  expect(lastTimeAtSameAim(ALL, 30, 3)).toBe(2.1);
  expect(lastTimeAtSameAim(ALL, 25, 3)).toBe(1.87);
  expect(lastTimeAtSameAim(ALL, 12, 5)).toBeNull();
  // Two rides at the same exact bucket (L5 · 10 min: A on 09-24, B on
  // 09-26) — the MOST RECENT by date wins, not the best pace (that's
  // deriveRideAim's job; this is a plain "what did I do last time" readout).
  expect(lastTimeAtSameAim(ALL, 10, 5)).toBe(0.69);
});
