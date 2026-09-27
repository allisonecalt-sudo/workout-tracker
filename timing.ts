// timing.ts — the two tiers of time, as a pure module (Sep 27 2026)
//
// WHAT: turns her own start/finish answers (+ an optional break) into a
// training-minutes number, or null when there isn't enough to trust one.
// Pure logic only (no DOM, no fetch — same discipline as week.ts / cycle.ts):
// app.ts reads the two confirm-taps and the break chip, writes the columns,
// and does the rendering; everything decided here is exercised by
// tests/timing.test.ts without a browser. THIS IS T1 (PLAN-2026-09-26.md §3)
// — the render/save wiring lives in app.ts; this module is the one place the
// minutes math and the one shared "about N min" string live.
//
// WHY: her words, Sat Sep 26 2026, 22:33-22:36 —
//   22:33: "you don't know timing that's a big thing ... I'm not on top of it
//     when I started and ended"
//   22:34: "Maybe you just asked me when I start what time is it ... and what
//     ends" · "I can try to estimate if I took breaks" · "what is reliable
//     for timing is anything with a timer that I listen to but the general
//     timing of how long the workout is we really don't know"
//   22:36, the final shape: "Maybe you could just say like starting workout
//     is this the time so I don't always have to like check it and then it's
//     not the time I'll correct it."
//
// TWO TIERS, everywhere in the data and on every screen (§3 exactly):
//   - TIMER time (holds, rides): measured and exact — never this module's job.
//   - WORKOUT time (her start/end answers minus any break): an ESTIMATE, and
//     only ever shown as "about N min" — never a bare number, never fed to a
//     safety gate unless BOTH ends are confirmed (§3.5, the engine's brake).
//   - `duration_seconds` / `started_at` / `completed_at` (the app's own taps)
//     stay exactly what they always were — kept for checking only, and this
//     module never reads them as workout time (that was the bug, her 22:33
//     words: "it really doesn't know timing").
//
// CONFIRMED, not just present: `herStartAt`/`herEndAt` are set the instant
// Start is tapped / the session is saved even when she never touched ✓ or ✎
// (app.ts's beginExercises()/saveCompletedSession() finalize the untouched
// case that way — §3.1/§3.2's own "Untouched at Start" rule) — so a null
// check on the timestamps alone would call an unconfirmed guess "training
// minutes". `herStartConfirmed`/`herEndConfirmed` are the only signal that
// she actually said yes to a number; this module refuses to compute anything
// without both.

export type TimingEntry = {
  herStartAt?: string | null;
  herStartConfirmed?: boolean | null;
  herEndAt?: string | null;
  herEndConfirmed?: boolean | null;
  breakMinutes?: number | null;
};

// §3.4: "only if both are confirmed", "under 5 or over 180 -> null". A
// negative span (finish saved before start) also lands here — app.ts's own
// finish-before-start guard already forces both confirmed flags back to
// false before a save reaches this shape (§3.2's "the times save as not
// confirmed"), but the bounds check is a second, independent net: this
// module never trusts the caller to have done that.
export function trainingMinutes(entry: TimingEntry): number | null {
  if (!entry.herStartConfirmed || !entry.herEndConfirmed) return null;
  if (!entry.herStartAt || !entry.herEndAt) return null;
  const startMs = new Date(entry.herStartAt).getTime();
  const endMs = new Date(entry.herEndAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const rawMinutes = (endMs - startMs) / 60_000 - (entry.breakMinutes ?? 0);
  if (rawMinutes < 5 || rawMinutes > 180) return null;
  return rawMinutes;
}

// Shared rounding: nearest 5, floor 5 — the one rule for every "about N min"
// shown to her, whether it's one entry's trainingMinutes or a week's summed
// confirmed minutes (T2 fix r1, Sep 27 2026 — the weekly review's total-time
// tile below). One function, so a week total and a single session can never
// disagree on how the number rounds.
function roundWorkoutMinutes(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

// §3.4: "formatWorkoutTime(entry) -> `about 45 min`, or ''." Rounded to the
// nearest 5, same rounding §3.2's `#time-result` uses on the post-log card
// itself — one rounding rule, not two that could ever disagree by a minute.
export function formatWorkoutTime(entry: TimingEntry): string {
  const minutes = trainingMinutes(entry);
  if (minutes === null) return '';
  return `about ${roundWorkoutMinutes(minutes)} min`;
}

// T2 fix r1 (Sep 27 2026, checker "must"): the weekly review's "Week totals"
// tile used to sum `durationSec` — the app's own open/close tap-time — into a
// "total time" number with a higher-better arrow on it. That's app time shown
// as her training (§3.4's own rule broken in the one place it names: "It's
// used by ... the weekly review"). The fix sums CONFIRMED `trainingMinutes`
// per session instead (app.ts's computeWeekTotals) and formats that sum here,
// through the exact same rounding as a single entry — never a bare number.
export function formatWorkoutMinutesTotal(totalMinutes: number): string {
  if (totalMinutes <= 0) return '';
  return `about ${roundWorkoutMinutes(totalMinutes)} min`;
}
