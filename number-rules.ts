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
