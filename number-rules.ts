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

// F3 - the lifetime session count, ONE rule for Home and Progress (the v55
// "CHECK N2" decision, Sep 27 2026: A/B/C are sessions; a D ride is not a
// fourth letter, it is its own "+N ride(s)" tag). Progress used to count every
// row ("45 sessions") while Home said "44 +1 ride".
export type SessionCounts = { sessions: number; dRides: number };

export function sessionCounts(logs: readonly { workout: string }[]): SessionCounts {
  const sessions = logs.filter((l) => l.workout !== 'D').length;
  return { sessions, dRides: logs.length - sessions };
}

/** "+1 ride" / "+2 rides"; '' when there is no D ride. */
export function dRideTag(dRides: number): string {
  return dRides > 0 ? `+${dRides} ride${dRides === 1 ? '' : 's'}` : '';
}
