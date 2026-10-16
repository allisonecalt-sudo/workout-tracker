// number-rules.ts - ONE home for the small rules that decide a number on more
// than one screen (v62.3 "make every number true", Oct 16 2026).
//
// Why: the progress audit found the same number saying different things on two
// screens (Progress "45 sessions" vs Home "44 +1 ride"; a bar filled 2/3 under
// a "3 / 4" label). Each fix is one rule used by every screen that shows the
// number, so the screens can never disagree again. Pure: values in, values
// out; no DOM, no storage, no clock.

// F1 - a per-week bar fills from the SAME two numbers as its label
// ("3 / 4" fills 75%, never 2/3 because the bar looked at A/B/C alone).
export function perWeekFillPct(shownValue: number, shownTarget: number): number {
  if (shownTarget <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, shownValue / shownTarget)) * 100);
}

// F2 - the number of sessions a week SHOWS: A/B/C done, plus one when this is a
// completion-model week (it counts D) and a D ride landed in it. The Weekly
// review header ("3 of 4") and its "vs previous week" box both call this, so
// the box can never say 2 under a "3 of 4" title (and the previous week is
// counted by the same rule as this one).
export function shownSessionCount(abcDone: number, countsD: boolean, dRides: number): number {
  return abcDone + (countsD && dRides > 0 ? 1 : 0);
}
