// number-rules.ts - ONE home for the small rules that decide a number on more
// than one screen (v62.3 "make every number true", Oct 16 2026).
//
// Why: the progress audit found the same number saying different things on two
// screens (Progress "45 sessions" vs Home "44 +1 ride"; a bar filled 2/3 under
// a "3 / 4" label). Each fix is one rule used by every screen that shows the
// number, so the screens can never disagree again. Pure: values in, values
// out; no DOM, no storage, no clock.

import { SHORT_MONTHS, formatMmSs, formatMonthDay } from './format.js';

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

// v64 (Oct 20 2026) - "44 workouts + 1 ride", Progress's hero sub-line, from the SAME two
// counts (F3) Home used to show as "44 +1 ride": A/B/C are workouts, a D ride is its own tag.
export function workoutsAndRides(counts: SessionCounts): string {
  const workouts = `${counts.sessions} workout${counts.sessions === 1 ? '' : 's'}`;
  return counts.dRides > 0 ? `${workouts} ${dRideTag(counts.dRides).replace('+', '+ ')}` : workouts;
}

// v64 - the weeks-you-showed-up words, ONE phrase for Progress's hero ("14 full weeks") and
// Home's one line ("Since May: 14 full weeks"). A full week = A, B and C met (weeks-grid.ts).
export function fullWeeksWords(n: number): string {
  return `${n} full ${n === 1 ? 'week' : 'weeks'}`;
}

/** Home's one line (Q4): "Since May: 14 full weeks". With none yet, no count (a zero is a
 *  gentle empty state, not "0 full weeks": guide §2) - the line still opens Progress. */
export function sinceFullWeeksLine(firstIso: string, fullWeeks: number): string {
  const month = SHORT_MONTHS[new Date(firstIso).getMonth()];
  return fullWeeks > 0
    ? `Since ${month}: ${fullWeeksWords(fullWeeks)}`
    : `Your weeks since ${month}`;
}

// F4 - every Start -> Now row says its OWN "since": the card used to carry one
// "since May 2" that was true of Sessions only, while Elliptical began Sep 24
// and the honest wall-sit readings Sep 24 too.
export function sinceText(iso: string): string {
  return `since ${formatMonthDay(iso)}`;
}

/** The small dim "since Sep 24" that sits after a row's value. */
export function sinceTag(iso: string): string {
  return `<span class="sn-since">${sinceText(iso)}</span>`;
}

// F5 - an elliptical level only means something next to how long the ride was:
// "level 5 -> 3" compared a 10-minute ride with a 12-minute one and read as
// going backwards. ONE phrase for both Start -> Now cards: "level 5 for 10 min"
// (minutes = that ride's console time, rounded the way the card always rounded
// it). A ride with no time recorded shows just "level 5"; no level, no phrase.
export function levelForLength(level: number | null, timeSec: number | null): string | null {
  if (level === null) return null;
  const minutes = timeSec !== null && timeSec > 0 ? Math.round(timeSec / 60) : 0;
  return minutes > 0 ? `level ${level} for ${minutes} min` : `level ${level}`;
}

// F7 - "no numbers" only when a ride really has none. A ride that is out of the
// rates (no console time, or an implausible one) can still carry readings -
// show them, "-" for each one missing, in the list's own order:
// "time · km · kcal · level". null = none of time, km, kcal or level, so the
// caller says "no numbers". Shared by the All-rides list and the Progress
// door's sub-line.
export type RideReadings = {
  timeSec: number | null;
  km: number | null;
  kcal: number | null;
  level: number | null;
};

export function rideReadingsLine(r: RideReadings): string | null {
  const has = (v: number | null): boolean => typeof v === 'number' && v > 0;
  if (!has(r.timeSec) && !has(r.km) && !has(r.kcal) && !has(r.level)) return null;
  // 0 is "not read" on the console (the rides rule: kcal 0 = unread), so a
  // zero shows as "—" like a missing value.
  const timeStr = has(r.timeSec) ? formatMmSs(r.timeSec as number) : '—';
  const kmStr = has(r.km) ? `${r.km} km` : '—';
  const kcalStr = has(r.kcal) ? `${r.kcal} kcal` : '—';
  const levelStr = has(r.level) ? `L${r.level}` : '—';
  return `${timeStr} · ${kmStr} · ${kcalStr} · ${levelStr}`;
}
