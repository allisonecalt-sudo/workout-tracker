// program-week.ts — the week clock glue: which program week is it, which plan
// does a session train/use, how many of the three are done (code-shape step 4,
// Oct 13 2026).
//
// WHAT: everything that bridges week.ts (the completion-based week model), the
// calendar/swing model for pre-launch dates, and program.ts (the PROGRAM rows)
// in ONE module. Moved out of app.ts, where "which week is it" lived in ~25
// functions scattered across the file.
// WHY: pure + Node-testable. NO DOM, browser-global or storage access in this
// file, and it never imports app.ts. Storage reads (loadLogs, loadWeekMoves,
// and the clock stay in app.ts: every function here takes what it needs as
// PARAMETERS (logs, moves, now), and
// app.ts keeps same-named thin wrappers that supply today's values, so no
// call site changed.
// DECIDED: viewedWeekOffset / viewingLastClosedWeek (UI state) stay in app.ts;
// the "peek" helpers (legacyLastClosedWeekPeek / lastClosedWeekForPeek) stay
// too — they render dot HTML. The week_moves sync stays in app.ts (step 9b).
// v62 (step 5c): the plan row for "now" is found BY WEEK KEY (planForWeekKey),
// never by turning the key into a synthetic calendar date; only PRE-launch
// dates still use the calendar scan (history fidelity).
// Tests: tests/program-week.test.ts (Node) + the existing Playwright suite.

import {
  walkWeeks,
  dayOfWeek as weekDayOfWeek,
  COMPLETION_WEEKS_FROM,
  formatLocalIso,
  type SessionLite as WeekSessionLite,
  type MoveOn as WeekMoveOn,
  type RoundStart as WeekRoundStart,
  type WeekSpan,
  type WeekKey,
  type PendingWeek,
} from './week.js';
import {
  ROUNDS,
  SKIPPED_WEEKS,
  getRoundFor,
  planForWeekKey,
  programWeekPlan,
  programWorkoutById,
  type WorkoutId,
  type Workout,
  type WeekPlan,
} from './program.js';
import { formatWeekdayDate, weekStartIso } from './dates.js';
import type { LogEntry, StoredWeekMove } from './types.js';

/** What the week clock needs to know about "today", handed in by app.ts. */
export type WeekClockInput = {
  /** The saved sessions (app.ts: loadLogs()). */
  logs: LogEntry[];
  /** The synced "Move on without it" rows (app.ts: loadWeekMoves()). */
  moves: StoredWeekMove[];
  /** The instant "now" means (app.ts: new Date(), or the test's mocked clock). */
  now: Date;
};

export function getProgramWeek(date: Date): {
  num: number;
  round: number;
  start: Date;
  end: Date;
  skippedLabel: string | null;
} {
  const round = getRoundFor(date);
  const start = new Date(round.start + 'T00:00:00');
  const diffDays = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const calNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (calNum - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  // Skips only count within the active round — each round's clock starts fresh.
  const skipsBefore = Object.keys(SKIPPED_WEEKS).filter((s) => {
    const t = new Date(s + 'T00:00:00').getTime();
    return t >= start.getTime() && t < weekStart.getTime();
  }).length;
  return {
    num: Math.max(1, calNum - skipsBefore),
    round: round.num,
    start: weekStart,
    end: weekEnd,
    skippedLabel: SKIPPED_WEEKS[weekStartIso(weekStart)] ?? null,
  };
}

// Today's pick (Sat Sep 26 2026): "Up next" = the first of A/B/C still missing
// from the week the next session will COUNT toward — last week on a swing
// Saturday (same rule as attributeSessionsToWeeks), else this week. Her words,
// 21:21: "its saturday night i was supposed to be able to do workout b of last
// week tonight" — home said A (rotation after Friday's C) while last week still
// needed its B. Falls back to the old A→B→C rotation (group 2I) once that week
// has all three.
export function getTodaysPick(logs: LogEntry[], now: Date): WorkoutId {
  if (logs.length === 0) return 'A';
  const attribution = attributeSessionsToWeeks(logs);
  const lastWeek = sessionsAttributedTo(logs, saturdayForOffset(1, now), attribution);
  const swings =
    now.getDay() === 6 && lastWeek.length > 0 && lastWeek.length < SESSIONS_PER_WEEK_TARGET;
  const countsToward = swings
    ? lastWeek
    : sessionsAttributedTo(logs, saturdayForOffset(0, now), attribution);
  const done = new Set(countsToward.map((l) => l.workout));
  const missing = (['A', 'B', 'C'] as const).find((w) => !done.has(w));
  if (missing) return missing;
  const last = logs[0];
  if (!last) return 'A';
  if (last.workout === 'A') return 'B';
  if (last.workout === 'B') return 'C';
  return 'A';
}

// Saturday of the Sat-Fri week that's `offset` weeks before today.
export function saturdayForOffset(offset: number, now: Date): Date {
  const today = new Date(now);
  const day = today.getDay(); // 0=Sun..6=Sat
  const satOffset = (day + 1) % 7; // Sat=0, Sun=1, Mon=2, ..., Fri=6
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - satOffset - offset * 7);
  saturday.setHours(0, 0, 0, 0);
  return saturday;
}

// ---------------------------------------------------------------------------
// SATURDAY IS THE SWING DAY (v42, Sep 19 2026) — her rule, now automatic.
// May 15 2026: "a week is saturday to friday, but i can be flexible if i need
// saturday to be brought into week bf if i didnt do 3." That was recorded as
// "her call, situational — don't auto-attribute". Sep 19 2026, 22:46, after she
// finished Week 3's third session on Saturday night: "you just set it up, sat is
// swing." So it is a RULE now: a session logged on a SATURDAY counts toward the
// week that just ended (the previous Sat→Fri) if that week is still short of 3;
// otherwise it opens the new week. Sunday→Friday sessions never swing.
// Attribution runs chronologically, so a Saturday that swung back is already
// counted before the next Saturday is judged. The Supabase row keeps its TRUE
// timestamp — the swing lives in how the app COUNTS, never in the data.
// Every "sessions in week X" surface goes through attributeSessionsToWeeks so
// the count, the 3-slot rows, the week card and the progress bars agree.
// ---------------------------------------------------------------------------
export const SESSIONS_PER_WEEK_TARGET = 3;

// Local-midnight Saturday on/before the given moment, as ms. DST-safe (setDate).
export function calendarSaturdayMs(dateIso: string): number {
  const d = new Date(dateIso);
  const back = (d.getDay() + 1) % 7; // Sat=0, Sun=1, …, Fri=6
  const sat = new Date(d);
  sat.setDate(d.getDate() - back);
  sat.setHours(0, 0, 0, 0);
  return sat.getTime();
}

function previousSaturdayMs(saturdayMs: number): number {
  const d = new Date(saturdayMs);
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Each log → the local-midnight Saturday (ms) of the week it COUNTS toward. */
export function attributeSessionsToWeeks(logs: LogEntry[]): Map<LogEntry, number> {
  const out = new Map<LogEntry, number>();
  const counts = new Map<number, number>();
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  for (const l of sorted) {
    const base = calendarSaturdayMs(l.date);
    const isSaturday = new Date(l.date).getDay() === 6;
    let weekMs = base;
    if (isSaturday) {
      const prev = previousSaturdayMs(base);
      const prevCount = counts.get(prev) ?? 0;
      // Swing only to COMPLETE a week she was working (1 or 2 sessions). A week
      // with zero sessions is a skipped week (break, sickness, pre-program), and
      // the rule is "bring Saturday in if I didn't do 3", not "resurrect a week I
      // never started" — that would also make a fresh Saturday session vanish
      // from "this week" for no reason she could see.
      if (prevCount > 0 && prevCount < SESSIONS_PER_WEEK_TARGET) weekMs = prev;
    }
    out.set(l, weekMs);
    counts.set(weekMs, (counts.get(weekMs) ?? 0) + 1);
  }
  return out;
}

/** Sessions attributed to the week whose local-midnight Saturday is `saturday`, oldest first. */
export function sessionsAttributedTo(
  logs: LogEntry[],
  saturday: Date,
  attribution: Map<LogEntry, number> = attributeSessionsToWeeks(logs)
): LogEntry[] {
  const key = saturday.getTime();
  return logs
    .filter((l) => attribution.get(l) === key)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// A swing Saturday: today is Saturday and last week still needs 1-2 sessions,
// so tonight's session counts for LAST week. Home then shows last week — its
// number, its dots, its count. Her words, Sat Sep 26 2026 21:32: "I want to be
// very clear that I'm in week 4 right now like it says week 5 on top" / "I also
// would like to see workout A and c done so I feel good about that" / "if I'm on
// week 4 … I don't want to see five yet". Same condition as
// attributeSessionsToWeeks' swing, so the screen and the count always agree.
export function homeWeekOffset(logs: LogEntry[], now: Date): number {
  if (now.getDay() !== 6) return 0;
  const lastWeek = sessionsAttributedTo(logs, saturdayForOffset(1, now)).length;
  return lastWeek > 0 && lastWeek < SESSIONS_PER_WEEK_TARGET ? 1 : 0;
}

// THE SWING FIX (Sep 26 2026), SUPERSEDED for "now" by WK2 (Sep 27 2026).
// The original problem: `getWeekPlan(date)` was a pure calendar lookup, but a
// swing-Saturday session COUNTED toward last week (attributeSessionsToWeeks).
// That swing rule only ever existed to patch the calendar-week model's three-
// meanings-of-week confusion (PLAN-2026-09-26.md §2) — the completion-based
// model (week.ts) replaces it outright for "now": there IS no swing concept
// once a week only closes on its 3rd distinct letter. `homeWeekOffset` /
// `attributeSessionsToWeeks` / the swing itself stay defined and correct for
// every date BEFORE the launch (weekly review, Progress, Settings — WK4's
// job, untouched here); "now" is always after it, so this always resolves
// through the new model instead.
// second-brain/self/health/workout-app-audit-2026-09-24/next-level-2026-09-26/WEEK5-PROPOSAL-2026-09-26.md §e

/** The plan row that applies to a session starting NOW.
 * Post-launch (v62, step 5c): the completion model's current key resolves
 * STRAIGHT to its PROGRAM row via planForWeekKey - no synthetic calendar date
 * and no scan of PROGRAM's startsOn column (the old round trip went key ->
 * date -> "highest startsOn <= date" and had to be told about Sick weeks; a
 * Sick week is now just an entry in SKIPPED_WEEKS and this code never sees it).
 * During a GAP the key is the week that just CLOSED, not the pending one: a
 * session started now counts backward into it (week.ts rule 3), so it trains
 * that week's moves (WK2 fix r2, checker's should #2, Sep 27 2026).
 * Pre-launch (or a test mocking an earlier date) keeps the original calendar +
 * swing rule: programWeekPlan(preLaunchPlanDate()). */
export function currentWeekPlan(input: WeekClockInput): WeekPlan {
  if (!isNowAfterCompletionLaunch(input.now)) {
    return programWeekPlan(preLaunchPlanDate(input));
  }
  return planForWeekKey(gapCountsBackToWeekKey(input) ?? shownWeek(input).key).plan;
}

/** PRE-launch only: the calendar date whose PROGRAM row applies now - last
 * Saturday on a swing Saturday (homeWeekOffset), else "now" itself. This is
 * also what startWorkout pins as pinnedPlanDateIso for a pre-launch session
 * (resumed later by looking the row up again from that date). Post-launch
 * sessions pin a week KEY instead (pinnedWeekKey). */
export function preLaunchPlanDate(input: WeekClockInput): Date {
  return homeWeekOffset(input.logs, input.now) === 1
    ? saturdayForOffset(1, input.now)
    : new Date(input.now);
}

/** The date whose plan applied to a SAVED session: the Saturday of the week it counts toward. */
export function planDateForLog(entry: LogEntry, logs: LogEntry[]): Date {
  const same = (l: LogEntry): boolean =>
    entry.id ? l.id === entry.id : l.date === entry.date && l.workout === entry.workout;
  // (app.ts passes loadLogs(): fresh objects every call, so match by id, never by identity)
  const all = logs.some(same) ? logs : [...logs, entry]; // sessionPayload can run before the save
  for (const [l, weekMs] of attributeSessionsToWeeks(all)) {
    if (same(l)) return new Date(weekMs);
  }
  return new Date(entry.date);
}

/** WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.6 "Saved-session plan": the plan a
 * SAVED session actually used. Before the launch (or a session dated before
 * it — a real log's own date, not "now"), unchanged: planDateForLog's
 * calendar/swing lookup. At/after it, resolves through the completion
 * model's own `weekOf` map instead of round-tripping through a synthetic
 * calendar date — the SAME key Home/pre-log/post-log showed her at the time,
 * including a gap session counting backward (week.ts rule 3). sessionPayload
 * can run BEFORE the save lands in loadLogs() (same "not saved yet" case
 * planDateForLog's own comment names), so `entry` is folded into the walked
 * list exactly like planDateForLog does. Falls back to the calendar lookup in
 * the "shouldn't happen" case (an id-less entry, or a date the walk somehow
 * never attached a key to) rather than guessing — fail-loud, not silent.
 */
// WK4 (Sep 27 2026): the completion-model WeekKey a saved session resolves
// to — extracted from planForLog so a test can assert the KEY directly (via
// the __wtPlanKeyForLog hook) rather than only the plan CONTENT, which two
// adjacent weeks can share byte-for-byte (a repeat) and so can't tell apart.
// null pre-launch (that path never uses a completion key at all) or in the
// "shouldn't happen" case (see planForLog's own comment).
export function planKeyForLog(entry: LogEntry, input: WeekClockInput): WeekKey | null {
  if (!isNowAfterCompletionLaunch(new Date(entry.date))) return null;
  const same = (l: WeekSessionLite): boolean =>
    entry.id ? l.id === entry.id : l.date === entry.date && l.workout === entry.workout;
  const logs = input.logs;
  const all = logs.some((l) => (entry.id ? l.id === entry.id : false)) ? logs : [...logs, entry];
  const { weekOf } = walkWeeks(
    sessionsForWeekModel(all),
    movesForWeekModel(input.moves),
    roundStartsForWeekModel(),
    COMPLETION_WEEKS_FROM,
    sickWeeksForWeekModel(),
    input.now
  );
  const matched = sessionsForWeekModel(all).find(same);
  return matched ? (weekOf.get(matched.id) ?? null) : null;
}

export function planForLog(
  entry: LogEntry,
  input: WeekClockInput,
  getWorkoutD: () => Workout
): Workout {
  // v54 (Sep 27 2026): D never has a completion-model week key (week.ts
  // filters it out of sessionsForWeekModel below) and isn't in any
  // PROGRAM/plan.workouts row — it's the one fixed Workout, always.
  if (entry.workout === 'D') return getWorkoutD();
  const key = planKeyForLog(entry, input);
  if (key) return planForWeekKey(key).plan.workouts[entry.workout];
  if (isNowAfterCompletionLaunch(new Date(entry.date))) {
    console.warn(
      `[week] planForLog: no completion-model week found for session ${entry.id ?? entry.date}`
    );
  }
  return programWorkoutById(entry.workout, planDateForLog(entry, input.logs));
}

// Program week info anchored on the Saturday of the viewed Sat-Fri week.
export function getViewedProgramWeek(
  offset: number,
  now: Date
): {
  num: number;
  round: number;
  start: Date;
  end: Date;
  skippedLabel: string | null;
} {
  return getProgramWeek(saturdayForOffset(offset, now));
}

/** logs -> week.ts's SessionLite shape. saveLog() assigns a local id (genId())
 * the instant a session is saved, offline or not, so in practice every real
 * log has one by the time it reaches here; the filter is a fail-loud guard
 * against a malformed/legacy row, not a live gap — an id-less log is dropped
 * rather than silently miscounted (week.ts's weekOf keys by id). */
export function sessionsForWeekModel(logs: LogEntry[]): WeekSessionLite[] {
  // v54 (Sep 27 2026), her Sep 27 words ("we definitely need a 4th element a
  // week... call it Workout D"), and PLAN's own rule for it: D is EXTRA — it
  // never counts toward the week's "N of 3" and never closes/opens a week.
  // week.ts's own Letter type is 'A'|'B'|'C' on purpose (unchanged by D), so
  // a D session is dropped here, before it ever reaches walkWeeks — the one
  // place completion-model week-counting reads from a log list.
  return logs
    .filter(
      (l): l is LogEntry & { id: string; workout: 'A' | 'B' | 'C' } =>
        typeof l.id === 'string' && l.id.length > 0 && l.workout !== 'D'
    )
    .map((l) => ({ id: l.id, date: l.date, workout: l.workout }));
}

/** ROUNDS -> week.ts's RoundStart events. walkWeeks itself ignores a start
 * before the launch and one that is still in the future (v62.1: it takes
 * effect on its own date), so passing every round is harmless - and a Round 3
 * entry in ROUNDS needs no separate wiring here. */
export function roundStartsForWeekModel(): WeekRoundStart[] {
  // v62.1: local (Asia/Jerusalem, DST-aware) midnight of the start date - not a
  // hard-coded +03:00, which read a winter (UTC+2) start a day early. Built the
  // way every other Saturday anchor is (a local Date, then week.ts's
  // formatLocalIso), so it carries the offset that is true on that date.
  return ROUNDS.map((r) => {
    const [y, m, d] = r.start.split('-').map(Number) as [number, number, number];
    return { round: r.num, at: formatLocalIso(new Date(y, m - 1, d)) };
  });
}

/** v61.2 (Oct 13 2026): SKIPPED_WEEKS' 'Sick' Saturdays -> week.ts's sick
 * pause (the completion clock stops for them). Only 'Sick' pauses the
 * completion model; 'Break' rows predate it (Round 1 -> 2). */
export function sickWeeksForWeekModel(): string[] {
  // SKIPPED_WEEKS is the one data source. (Tests that want a different calendar
  // seed it through program.ts's replaceCalendarMarks - no switch lives here.)
  return Object.keys(SKIPPED_WEEKS).filter((k) => SKIPPED_WEEKS[k] === 'Sick');
}

/** week.ts's MoveOn events, from the synced local week_moves table (WK3). */
export function movesForWeekModel(storedMoves: StoredWeekMove[]): WeekMoveOn[] {
  // WK3 fix r1: a pending Undo tombstone must not count as a move — that's
  // the whole point of the tombstone (see StoredWeekMove.deleted's comment).
  return storedMoves
    .filter((m) => !m.deleted)
    .map((m) => ({ round: m.round, week: m.week, at: m.at }));
}

/** Is "now" (or a caller-supplied instant — tests mock the clock) at/after
 * the real launch? Dozens of existing Playwright tests mockDate() to dates
 * well before Sep 26 2026 to exercise the OLD calendar/swing model on
 * purpose (Round 1, skipped weeks, the Aug 30 restart, …) — every Home/
 * pre-log/post-log function below branches on this FIRST, so those tests
 * keep seeing exactly the old behavior, and only genuinely-current (or
 * later-mocked) "now" ever reads the completion model. */
export function isNowAfterCompletionLaunch(now: Date): boolean {
  return now.getTime() >= new Date(COMPLETION_WEEKS_FROM.at).getTime();
}

/** The completion-based week model, recomputed fresh from the live session
 * list on every call. Pure + cheap (week.ts is a plain array walk over at
 * most a few dozen post-launch sessions) — cheaper than caching it wrong
 * across a save. See week.ts's own file header for the one known open edge
 * (a closing session can't yet be deleted from any UI, so it's a flagged
 * risk, not a live bug — WK3's schema decision is what actually closes it). */
export function weekModel(input: WeekClockInput): ReturnType<typeof walkWeeks> {
  return walkWeeks(
    sessionsForWeekModel(input.logs),
    movesForWeekModel(input.moves),
    roundStartsForWeekModel(),
    COMPLETION_WEEKS_FROM,
    sickWeeksForWeekModel(),
    input.now
  );
}

/** WK2 fix r2 (Sep 27 2026, checker's must #1 / GATE 1): which session ids are
 * the CLOSING session (the one whose save reached 3 distinct letters) of an
 * ALREADY-CLOSED completion-model week, over the given log list. Once even
 * one span has closed, every week after it — open, pending, or another closed
 * span — depends on that span's own NUMBER staying put: mergeRemoteSessions
 * uses this to refuse silently dropping one of these ids just because a pull
 * no longer has it (a naive recompute without it would reopen the span and
 * renumber everything after it — the exact risk the WK1 fix r2 checker named,
 * carried forward as WK2's GATE 1). The real fix the plan asks for
 * (counted_round/counted_week audit columns, or a stored closed-week record
 * next to week_moves) is a SCHEMA decision that needs her yes first
 * (CLAUDE.md's schema-change rule) — this is the non-schema guard that closes
 * the practical risk in the meantime. Only 'three' closes are ever session-
 * driven ('moved_on'/'round_ended' close on a MoveOn/RoundStart event, not a
 * deletable session, so they're out of scope here on purpose). */
export function completionClosingSessionIds(input: WeekClockInput): Set<string> {
  const { spans } = walkWeeks(
    sessionsForWeekModel(input.logs),
    movesForWeekModel(input.moves),
    roundStartsForWeekModel(),
    COMPLETION_WEEKS_FROM,
    sickWeeksForWeekModel(),
    input.now
  );
  const ids = new Set<string>();
  for (const span of spans) {
    if (span.how !== 'three') continue;
    // The closing session is the one whose OWN date closeOpen used as
    // closedAt — never just "the last one in .sessions", which can also hold
    // a later gap session counted backward as an extra (week.ts's own rule 3).
    const closing = span.sessions.find((s) => s.date === span.closedAt);
    if (closing) ids.add(closing.id);
  }
  return ids;
}

/** The week to show RIGHT NOW: the open span if one exists, or (mid-gap,
 * waiting for the next Sat/Sun) the pending key with no span yet. Falls back
 * to the launch key itself only in the "shouldn't happen" case week.ts's own
 * comment names (the launch instant always opens Week 1 immediately). */
export function shownWeek(input: WeekClockInput): {
  key: WeekKey;
  span: WeekSpan | null;
  pending: PendingWeek | null;
} {
  const { open, pending } = weekModel(input);
  if (open) return { key: open.key, span: open, pending: null };
  if (pending) return { key: pending.key, span: null, pending };
  return {
    key: { round: COMPLETION_WEEKS_FROM.round, week: COMPLETION_WEEKS_FROM.week },
    span: null,
    pending: null,
  };
}

/** During a gap (pending, no span open yet), a session logged NOW resolves
 * BACKWARD into the week that just closed (week.ts rule 3 — an extra rep for
 * the week that just ended), never into the pending week itself, which
 * hasn't opened yet. Returns that already-closed week's number, or null when
 * there's no gap (an open span already exists). WK2 fix r1 (Sep 27 2026,
 * checker's should #1): Home/pre-log/post-log all used to name the PENDING
 * week during a gap — true only once it actually opens; a session saved now
 * counts back into the week that just closed instead, and the screens must
 * say so rather than promise a week number the save won't use. */
// WK2 fix r2 (Sep 27 2026, checker's should #2): the FULL key, not just the
// week number — planDateNow() needs the round too, to resolve the right
// PROGRAM row during a gap (see its own comment). gapCountsBackToWeekNum
// keeps its old (number-only) signature for its existing callers.
export function gapCountsBackToWeekKey(input: WeekClockInput): WeekKey | null {
  const shown = shownWeek(input);
  if (!shown.pending) return null;
  // v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 should #9, pre-existing
  // since WK2): a gap is only real BEFORE the pending week's own opening day
  // — week.ts's own gap-resolution (resolveGapSession) opens the week the
  // instant "now" reaches that anchor, whatever weekday it is, whether or
  // not an A/B/C session has actually landed yet to make `open` non-null.
  // This used to keep saying "a session before then counts as an extra for
  // Week N" (and the post-log's "already N of 4") on and after that very
  // day — true only during the gap itself, false the moment the pending
  // week's own day arrives, even with 0 sessions logged (her real complaint
  // was never about the DATE, only the stale CLAIM once it arrived).
  if (input.now.getTime() >= new Date(shown.pending.opensAt).getTime()) return null;
  const { spans } = weekModel(input);
  const last = spans.length ? spans[spans.length - 1] : null;
  return last ? last.key : null;
}

export function gapCountsBackToWeekNum(input: WeekClockInput): number | null {
  return gapCountsBackToWeekKey(input)?.week ?? null;
}

/** "since Sat Sep 26 · day 3" (open) / "opens Sat Oct 3 · a session before
 * then counts as an extra for Week 5" (pending gap) — §2.4's #week-sub,
 * generalised for the Sat/Sun-anchor amendment (the original spec's exact
 * string predates it; open/gap are the two real states week.ts can report
 * "now" in). The gap clause is said ONCE, here, truthfully (checker's should
 * #1 — see gapCountsBackToWeekNum's own comment). */
export function weekSubLabel(
  shown: { span: WeekSpan | null; pending: PendingWeek | null },
  input: WeekClockInput
): string {
  if (shown.span) {
    return `since ${formatWeekdayDate(shown.span.openedAt)} · day ${weekDayOfWeek(shown.span, input.now)}`;
  }
  if (shown.pending) {
    const opens = `opens ${formatWeekdayDate(shown.pending.opensAt)}`;
    const backWeek = gapCountsBackToWeekNum(input);
    return backWeek === null
      ? opens
      : `${opens} · a session before then counts as an extra for Week ${backWeek}`;
  }
  return '';
}

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.6 "Small ones": the week key the
// "seen this week" how-to state keys off. Before the launch, unchanged
// (getProgramWeek()'s calendar lookup). At/after it, the completion model's
// currently OPEN week — or, mid-gap (nothing open yet), the week that just
// closed (same fallback truth gapCountsBackToWeekKey/shownWeek already use
// everywhere a "what does now count toward" question is asked) — so "seen
// this week" tracks the week she's actually training, not a calendar week the
// completion model no longer reads for "now".
export function currentHowToWeekKey(input: WeekClockInput): { num: number; round: number } {
  if (!isNowAfterCompletionLaunch(input.now)) return getProgramWeek(input.now);
  const shown = shownWeek(input);
  const key = shown.pending ? (gapCountsBackToWeekKey(input) ?? shown.key) : shown.key;
  return { num: key.week, round: key.round };
}
