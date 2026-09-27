// ride.ts — elliptical ride numbers, as a pure module (Sep 27 2026)
//
// WHAT: turns one ride's raw console readings (kcal, km, level, time) into the
// numbers that mean something — kcal a minute, km/h, pace — plus the small
// set of derived facts across many rides ("usual", "best", totals). Pure
// logic only (no DOM, no fetch — same discipline as week.ts / timing.ts):
// app.ts builds RideRecord[] from LogEntry (via its existing sessionCardio()
// helper) and does the rendering; everything decided here is exercised by
// tests/ride.test.ts without a browser.
//
// WHY: THE RIDES PAGE, replacing plan items R1+R2 per her amendments (Sep 26
// 2026, 23:16-23:20) — "Also I want elliptical data page" · "Elliptical
// calories per min, 10 min, 30, hour I can toggle. Kph, anything that you can
// think of". Her earlier words (21:39-21:40, PLAN-2026-09-26.md §4): "the
// eliptical detials the calioes like kph averages" · "Maybe like two calories
// per minute Kilometer per minute ... ways that I can like really see the
// data and understand it ... it's all mobile".
//
// THE RULE (§4.2's exclusion, restated exactly): "Rides with kcal 0 or
// missing time are excluded from rates but listed as 'no numbers'." A ride
// with no calories or no time isn't a worse ride — it's a ride she didn't
// read the console on. hasRideNumbers() is the base gate every rate/chart
// function below checks before it computes anything; a missing value is
// never guessed as 0. usualKcalPerMin/bestRide layer isPlausibleRideRate()
// on top of it (v54 fix r3) — still "has numbers", just not trusted for
// arithmetic that keeps an outlier forever (see that function's comment).
//
// ROUNDING: one decimal for a rate (kcal/min, km/h — matches the console's
// own 1-decimal calorie precision), two decimals for a distance sum (km),
// whole seconds->minutes for a time sum. Every rounding goes through round1/
// round2 below so two call sites can never quietly disagree by a decimal.

export type RideRecord = {
  id: string;
  date: string; // ISO (LogEntry.date) — day precision is all this module reads
  workout: string; // 'A' | 'B' | 'C', kept as a plain string on purpose: this
  // module has no dependency on app.ts's WorkoutId type
  level: number | null;
  km: number | null;
  kcal: number | null;
  timeSec: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// §4.2's exact exclusion rule. Independent of km — a ride can have a kcal/min
// rate with no km/h (she skipped Distance), and hasRideNumbers still says
// true; km/h is its own, narrower check inside rideRate().
export function hasRideNumbers(r: RideRecord): boolean {
  return typeof r.kcal === 'number' && r.kcal > 0 && typeof r.timeSec === 'number' && r.timeSec > 0;
}

export type RideRate = {
  kcalPerMin: number | null;
  kmh: number | null;
  paceMinPerKm: string | null; // "13:56" (mm:ss per km) — km/h's inverse, for
  // completeness ("anything that you can think of"); km/h is the one shown
  // big (§4.2's own reasoning: pace runs backwards, lower = faster).
  rateEligible: boolean;
};

// Takes any object with the three raw fields (a full RideRecord, or the live
// ride-numbers screen's in-progress values) — the one place kcal/min and
// km/h are computed, so the ride-numbers screen's live line and the rides
// page's hero can never disagree on the math.
export function rideRate(r: {
  kcal: number | null;
  timeSec: number | null;
  km: number | null;
}): RideRate {
  const rateEligible =
    typeof r.kcal === 'number' && r.kcal > 0 && typeof r.timeSec === 'number' && r.timeSec > 0;
  const kcalPerMin = rateEligible
    ? round1((r.kcal as number) / ((r.timeSec as number) / 60))
    : null;

  let kmh: number | null = null;
  let paceMinPerKm: string | null = null;
  if (typeof r.km === 'number' && r.km > 0 && typeof r.timeSec === 'number' && r.timeSec > 0) {
    kmh = round1(r.km / (r.timeSec / 3600));
    const secPerKm = r.timeSec / r.km;
    const mm = Math.floor(secPerKm / 60);
    const ss = Math.round(secPerKm % 60);
    paceMinPerKm = `${mm}:${String(ss).padStart(2, '0')}`;
  }
  return { kcalPerMin, kmh, paceMinPerKm, rateEligible };
}

// Her own three windows, one tap each (23:16-23:20): "10 min, 30, hour I can
// toggle". Kept as a keyed record (not a bare number) so app.ts's toggle
// state and the tests both name the window, never a raw minute count that
// could drift from the label beside it.
export type ProjectionWindow = 'tenMin' | 'thirtyMin' | 'hour';
export const PROJECTION_MINUTES: Record<ProjectionWindow, number> = {
  tenMin: 10,
  thirtyMin: 30,
  hour: 60,
};
export const PROJECTION_LABEL: Record<ProjectionWindow, string> = {
  tenMin: '10 min',
  thirtyMin: '30 min',
  hour: 'an hour',
};

export function projectedKcal(kcalPerMin: number, window: ProjectionWindow): number {
  return round1(kcalPerMin * PROJECTION_MINUTES[window]);
}

export function projectedKm(kmh: number, window: ProjectionWindow): number {
  return round2(kmh * (PROJECTION_MINUTES[window] / 60));
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round1(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
  }
  return sorted[mid] as number;
}

// "Your usual" — task spec exactly: "median of last 5 rides, numbers only,
// shown when >= 5 rides." `chronological` is oldest -> newest (same order as
// getChronologicalLogs elsewhere in the app); this reads the most recent 5
// RATE-ELIGIBLE rides in that order, so a stretch of "no numbers" rides
// doesn't silently pull in older, less-relevant ones. Null (not shown) until
// there are at least 5.
export function usualKcalPerMin(chronologicalRides: RideRecord[]): number | null {
  const rates = chronologicalRides
    .filter(isPlausibleRideRate)
    .map((r) => rideRate(r).kcalPerMin)
    .filter((v): v is number => v !== null);
  if (rates.length < 5) return null;
  return median(rates.slice(-5));
}

// v54 fix r3 (Sep 27 2026), checker's nice #1: hasRideNumbers only asks "is
// there a kcal and a time" — a 1s test ride (or a real ride where the app
// timer started before the machine did) still passes that and gives a
// kcal/min the console never actually showed (the checker's own repro: 180
// kcal/min from a 1s ride). "Your best" has no verdict language to soften a
// bad number — it just keeps whatever's highest, forever — so an
// implausible outlier would sit there permanently. This is a SEPARATE,
// narrower gate than hasRideNumbers: still "has numbers" (still gets a
// plain list row), just not trusted for best/usual's arithmetic. The
// thresholds are generous on purpose (her real rides run 6-15 min,
// 5-7 kcal/min) — this only catches clearly-broken timing, never a real
// easy or short-but-real ride.
const MIN_PLAUSIBLE_RATE_SEC = 180; // 3 min
const MAX_PLAUSIBLE_KCAL_PER_MIN = 20;

export function isPlausibleRideRate(r: RideRecord): boolean {
  if (!hasRideNumbers(r)) return false;
  const kcalPerMin = rideRate(r).kcalPerMin;
  if (kcalPerMin === null) return false;
  return (
    (r.timeSec as number) >= MIN_PLAUSIBLE_RATE_SEC && kcalPerMin <= MAX_PLAUSIBLE_KCAL_PER_MIN
  );
}

export type BestRide = { ride: RideRecord; kcalPerMin: number };

// "Your best" — the highest kcal/min ride on record, with its date. Never a
// verdict word ("harder"/"easier") — just the number and when it happened
// (her rule, carried from §4.2: no verdicts from small samples).
export function bestRide(rides: RideRecord[]): BestRide | null {
  let best: BestRide | null = null;
  for (const r of rides) {
    if (!isPlausibleRideRate(r)) continue;
    const kcalPerMin = rideRate(r).kcalPerMin;
    if (kcalPerMin === null) continue;
    if (!best || kcalPerMin > best.kcalPerMin) best = { ride: r, kcalPerMin };
  }
  return best;
}

export type RideTotals = { rides: number; minutes: number; km: number; kcal: number };

// Week/month totals sum whatever real numbers exist across ALL rides in the
// given set (not just rate-eligible ones — a "no numbers" ride still counts
// toward `rides` and toward whichever of minutes/km/kcal it did record).
// `rides` is a plain count: she still rode, even on a ride with nothing read
// off the console.
export function rideTotals(rides: RideRecord[]): RideTotals {
  let seconds = 0;
  let km = 0;
  let kcal = 0;
  for (const r of rides) {
    if (typeof r.timeSec === 'number' && r.timeSec > 0) seconds += r.timeSec;
    if (typeof r.km === 'number' && r.km > 0) km += r.km;
    if (typeof r.kcal === 'number' && r.kcal > 0) kcal += r.kcal;
  }
  return {
    rides: rides.length,
    minutes: Math.round(seconds / 60),
    km: round2(km),
    kcal: round1(kcal),
  };
}
