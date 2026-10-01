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
//
// v57 (Sep 28 2026) — "Week by week" (her words, Sun Sep 27 22:45): "I want
// week on week comparison with elliptical" · "Also how much time total" ·
// "Also kph". `WeekSpan`/`WeekKey` come straight from week.ts — THE RULE
// (task text): "the week = the app's week rule" — never a second, new
// meaning of week invented here, same discipline renderRidesTotalsCard
// (app.ts) already follows for "This week"/"This month".
import type { WeekSpan, WeekKey } from './week.js';

export type RideRecord = {
  id: string;
  date: string; // ISO (LogEntry.date) — day precision is all this module reads
  workout: string; // 'A' | 'B' | 'C', kept as a plain string on purpose: this
  // module has no dependency on app.ts's WorkoutId type
  level: number | null;
  km: number | null;
  kcal: number | null;
  timeSec: number | null;
  // v61 fix pass (Sep 28 2026, CHECK-v61 must #1): cardio_minutes off the
  // same row — her real Sep 28 D row has no elliptical_time_sec (she typed
  // nothing on the numbers screen) but DOES carry cardio_minutes 30. Optional
  // so every pre-existing RideRecord literal (ride.test.ts, this module's own
  // rate/total functions) stays untouched; only ride-aim.ts reads it, as a
  // fallback when timeSec is null — see its effectiveTimeSec().
  minutes?: number | null;
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
    // v55 (Sep 27 2026) — CHECK N2 (round 1): rounding mm and ss SEPARATELY
    // could carry ss to 60 ("14:60") when secPerKm's fraction rounded up.
    // Round the total seconds once, then split — ss is always 0-59.
    const totalSec = Math.round(secPerKm);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
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

// v55 (Sep 27 2026) — CHECK N1 (round 1-3): this used to take the already-
// ROUNDED km/h (1 decimal) and multiply, so her real 0.69 km / 10 min ride
// (true km/h 4.14, rounded to 4.1) projected back as 0.68 km for its own
// window. Raw km ÷ raw seconds, rounded only here at the end — the fix is
// literally "compute from raw, round only for display" (the checker's own
// words).
export function projectedKm(km: number, timeSec: number, window: ProjectionWindow): number {
  return round2((km / timeSec) * PROJECTION_MINUTES[window] * 60);
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

// ---------- v57 · "Week by week" (Sep 28 2026) ----------
//
// Her real 3 rides, verified against her own worked numbers (task spec —
// "verify the arithmetic yourself", and tests/ride.test.ts does exactly
// that): Sep 24 A 602s/0.72km/63.4kcal/L5, Sep 25 C 1501s/1.87km/140.5kcal/L3,
// Sep 26 B 600s/0.69km/62.4kcal/L5 -> 3 rides, 45 min, 3.28 km, 266.3 kcal,
// avg 5.9 kcal/min, avg 4.4 km/h, avg level 4.3.
//
// The averages are NOT the mean of each ride's own rate (that gives 6.1
// kcal/min for her 3 rides, not her 5.9) — they're the WEEK's aggregate rate:
// total kcal / total minutes, total km / total hours, same "sum first,
// divide once" reasoning rideTotals already uses for the plain sums. Level
// is the one plain mean (5, 3, 5 -> 4.3) since there's no time/distance axis
// to weight it by.
export type WeekRideAggregate = RideTotals & {
  avgKcalPerMin: number | null;
  avgKmh: number | null;
  avgLevel: number | null;
};

export function weekRideAggregate(rides: RideRecord[]): WeekRideAggregate {
  const totals = rideTotals(rides);
  let kcalForRate = 0;
  let secForKcalRate = 0;
  let kmForKmh = 0;
  let secForKmh = 0;
  let levelSum = 0;
  let levelCount = 0;
  for (const r of rides) {
    const hasKcalTime =
      typeof r.kcal === 'number' && r.kcal > 0 && typeof r.timeSec === 'number' && r.timeSec > 0;
    if (hasKcalTime) {
      kcalForRate += r.kcal as number;
      secForKcalRate += r.timeSec as number;
    }
    const hasKmTime =
      typeof r.km === 'number' && r.km > 0 && typeof r.timeSec === 'number' && r.timeSec > 0;
    if (hasKmTime) {
      kmForKmh += r.km as number;
      secForKmh += r.timeSec as number;
    }
    if (typeof r.level === 'number') {
      levelSum += r.level;
      levelCount += 1;
    }
  }
  return {
    ...totals,
    avgKcalPerMin: secForKcalRate > 0 ? round1(kcalForRate / (secForKcalRate / 60)) : null,
    avgKmh: secForKmh > 0 ? round1(kmForKmh / (secForKmh / 3600)) : null,
    avgLevel: levelCount > 0 ? round1(levelSum / levelCount) : null,
  };
}

export type WeeklyRideRow = WeekRideAggregate & {
  key: WeekKey;
  isOpen: boolean; // "so far" — the currently open week, her rule (§ task
  // text): "the open week included and marked 'so far'"
};

// A ride's week — membership FIRST (`weekOf`, week.ts's own attribution for
// A/B/C, including a gap session counted backward to the week it closed),
// falling back to date-range bucketing only for a ride `weekOf` never placed
// (a D ride — week.ts's sessionsForWeekModel drops D on purpose, app.ts's own
// comment on renderRidesTotalsCard — or a ride from before the first span
// here). Membership must come first: a week that closes ON a Saturday/Sunday
// opens its NEXT span at that SAME instant (week.ts's weekendAnchorDay
// branch), so a plain date>=openedAt bucketing would put the CLOSING A/B/C
// ride into the week it just closed OUT of — the exact double-count bug
// renderRidesTotalsCard's v54 fix r3 comment (app.ts) already fixed once for
// "This week"; membership-first here means this table can never reopen it.
function weekKeyStr(k: WeekKey): string {
  return `${k.round}-${k.week}`;
}

function assignRidesToWeeks(
  rides: RideRecord[],
  weekOf: ReadonlyMap<string, WeekKey>,
  ordered: readonly WeekSpan[]
): Map<string, RideRecord[]> {
  const buckets = new Map<string, RideRecord[]>();
  for (const span of ordered) buckets.set(weekKeyStr(span.key), []);
  for (const r of rides) {
    const membership = weekOf.get(r.id);
    if (membership) {
      buckets.get(weekKeyStr(membership))?.push(r);
      continue;
    }
    // Date-range fallback (D, or anything weekOf never saw): the span whose
    // [openedAt, next span's openedAt) window contains this ride's date — a
    // date landing in a weekday gap (no week open yet) counts backward to
    // the span just before it, same as week.ts's own gap rule for A/B/C.
    const t = new Date(r.date).getTime();
    for (let i = 0; i < ordered.length; i++) {
      const span = ordered[i] as WeekSpan;
      const opened = new Date(span.openedAt).getTime();
      const nextOpened =
        i + 1 < ordered.length
          ? new Date((ordered[i + 1] as WeekSpan).openedAt).getTime()
          : Infinity;
      if (t >= opened && t < nextOpened) {
        buckets.get(weekKeyStr(span.key))?.push(r);
        break;
      }
      // A ride dated before the very first span's own opening (i === 0, t <
      // opened) predates what this table can show — left unattributed on
      // purpose, same as week.ts's own launch-instant filter.
    }
  }
  return buckets;
}

// The last `count` weeks (spans + the still-open one, when there is one),
// NEWEST FIRST — her rule: "a compact table of the last 6 weeks ... newest
// first, the open week included and marked 'so far'". A week with 0 rides
// still gets its own row (rides: 0, minutes/km/kcal: 0, avgs: null) — the
// caller (app.ts) is the one that turns a 0/null into the "—" her spec asks
// for; this module only ever returns real numbers or null, never a display
// string (same discipline as the rest of ride.ts).
export function weeklyRideRows(
  rides: RideRecord[],
  weekOf: ReadonlyMap<string, WeekKey>,
  spans: readonly WeekSpan[],
  open: WeekSpan | null,
  count = 6
): WeeklyRideRow[] {
  const ordered: WeekSpan[] = open ? [...spans, open] : [...spans];
  const last = ordered.slice(-count);
  const buckets = assignRidesToWeeks(rides, weekOf, ordered);
  return last
    .map((span): WeeklyRideRow => {
      const bucketRides = buckets.get(weekKeyStr(span.key)) ?? [];
      return {
        key: span.key,
        isOpen:
          open !== null && span.key.round === open.key.round && span.key.week === open.key.week,
        ...weekRideAggregate(bucketRides),
      };
    })
    .reverse();
}
