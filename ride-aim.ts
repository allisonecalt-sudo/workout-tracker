// ride-aim.ts — the ride card's derived distance aim (v61, Sep 28 2026). Pure
// logic only (no DOM, no fetch, no Supabase — same discipline as ride.ts/
// week.ts/move-feel.ts): app.ts reads the live RideRecord history and level
// and renders the one line; everything decided here is exercised by
// tests/ride-aim.test.ts without a browser.
//
// WHY: her words, Sun Sep 27 15:42 (NotebookLM reflection) — "we could raise
// the goal like to reach this distance. I think distance is probably going
// to be the number one indicator. I'm not ready to move the ticker yet but
// there needs to be a way to track that." DERIVED, no `ride_targets` table
// (the research doc's own design decision, self/health/
// elliptical-progression-2026-09-28.md §C1-C4): a target she has to set and
// maintain by hand is one more thing to manage; a number the app already has
// the ingredients for is not.
//
// THE RULE (task spec, item g): "aim = her best km-per-10-min at that ride
// TYPE × LEVEL, scaled to the planned minutes, rounded to 0.05 km." Verified
// against her real rides below (the "verify the arithmetic yourself"
// discipline ride.ts's own header comment already keeps) — the bucket that
// actually reproduces both worked numbers (D aim 2.1, C aim 1.85) is EXACT:
// level + the ride's own ACTUAL minutes rounded to the nearest whole minute,
// never a broad short/long category. Her C ride ran 25:01 (25.02 min) at a
// pace that would recover exactly 1.87 km if scaled by its own true elapsed
// time — but the aim scales by the PLANNED minutes (25, the whole number the
// app shows, not 25.02), which is what actually produces 1.85, not 1.87. A
// 12-minute ride at a level she's only ever ridden for 10 has NO exact-match
// history at all — "first ride at 12 sets your aim", never a number
// extrapolated across lengths. So a same-level ride at a genuinely new
// planned length always starts a fresh aim of its own; "short"/"long" is
// user-facing vocabulary (A/B are always short in practice, C/D always
// long), not a computation the aim math itself performs — this module never
// imports or checks a workout letter.
import type { RideRecord } from './ride.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Nearest 0.05 km — the task spec's own rounding. round2 first clears the
// float dust 0.05 multiplication/division otherwise leaves behind (e.g.
// 2.0999999999999996 instead of 2.1).
function round05(n: number): number {
  return round2(Math.round(n / 0.05) * 0.05);
}

/** km covered per 10 real minutes on the machine — null when there's no
 * usable km+time pair to divide (never a guessed rate). */
function kmPer10Min(r: RideRecord): number | null {
  if (typeof r.km !== 'number' || r.km <= 0) return null;
  if (typeof r.timeSec !== 'number' || r.timeSec <= 0) return null;
  return (r.km / r.timeSec) * 600;
}

/** A ride's own length, in whole minutes — the same Math.round(durationSec/60)
 * convention renderEllipticalStep already uses for the planned-minutes label,
 * so a ride's OWN bucket key always matches what a future ride planned for
 * that same whole-minute length would look up. */
function roundedMinutes(timeSec: number): number {
  return Math.round(timeSec / 60);
}

/** Her single fastest km-per-10-min pace among rides at this EXACT level and
 * EXACT planned-minutes length — "best", not average or most-recent (her own
 * research doc: the aim is what she's already shown she CAN do at that exact
 * combination, not a softened mean). Returns null with no exact match at
 * all — the "first ride" case, never a guess extrapolated from a nearby
 * length or level. */
export function bestKmPer10MinAt(
  rides: readonly RideRecord[],
  level: number,
  plannedMinutes: number
): number | null {
  let best: number | null = null;
  for (const r of rides) {
    if (r.level !== level) continue;
    if (typeof r.timeSec !== 'number' || r.timeSec <= 0) continue;
    if (roundedMinutes(r.timeSec) !== plannedMinutes) continue;
    const pace = kmPer10Min(r);
    if (pace === null) continue;
    if (best === null || pace > best) best = pace;
  }
  return best;
}

export type RideAim = { km: number } | { isFirst: true };

/** The ride card's one-line aim — see the header comment for the exact
 * bucketing rule and its verification. `rides` is every ride she's logged so
 * far (elliptical history — D included, same as any other level+ride), used
 * exactly as history: a ride happening right now is never in this list. */
export function deriveRideAim(
  rides: readonly RideRecord[],
  plannedMinutes: number,
  level: number
): RideAim {
  const best = bestKmPer10MinAt(rides, level, plannedMinutes);
  if (best === null) return { isFirst: true };
  return { km: round05(best * (plannedMinutes / 10)) };
}

/** The after-ride comparison line's two numbers — "last time → today" (no
 * colors, no ✗, no verdict, her own rule elsewhere in this spec). `rides`
 * excludes today's own not-yet-saved ride; null when there's no prior ride
 * at this exact level+length to compare against (the first-ride case again —
 * nothing to show a "last time" for). */
export function lastTimeAtSameAim(
  rides: readonly RideRecord[],
  plannedMinutes: number,
  level: number
): number | null {
  let mostRecent: RideRecord | null = null;
  for (const r of rides) {
    if (r.level !== level) continue;
    if (typeof r.timeSec !== 'number' || r.timeSec <= 0) continue;
    if (roundedMinutes(r.timeSec) !== plannedMinutes) continue;
    if (typeof r.km !== 'number' || r.km <= 0) continue;
    if (!mostRecent || r.date > mostRecent.date) mostRecent = r;
  }
  return mostRecent?.km ?? null;
}
