// week.ts — the week model, as a pure module (Sep 26-27 2026)
//
// WHAT: turns a list of logged sessions (+ "Move on without it" taps + Round
// starts) into WeekSpans — which week each session counts toward, when a week
// opened, when/how it closed, and what's still missing. Pure logic only (no
// DOM, no fetch, no Supabase — same discipline as cycle.ts / progression.ts):
// app.ts does the reading and rendering; everything decided here is exercised
// by tests/week.test.ts without a browser. NO UI READS THIS YET (that's WK2 -
// see PLAN-2026-09-26.md item WK2). This item (WK1) is the foundation only.
//
// WHY: three separate meanings of "week" (the calendar plan, the swing
// counting, and the engine) had been patched five times (v42, v48, v51.1,
// v52, v52.1) for the same root cause. Her rule, Sat Sep 26 2026 21:28:
// "I think once all three are done and then it can go to the next week."
//
// THE RULE — completion-based, ANCHORED to a Saturday/Sunday start (her
// amendment, 23:14-23:16, which REPLACES the plan's original "opens the
// instant the last one closes"):
//   1. A week opens on a Saturday or Sunday — whichever day she actually
//      starts it on. "Ok so a week always has to be start sat or sun not
//      just mid week."
//   2. A short week (fewer than 3 done) stays OPEN past Friday — it does not
//      silently roll to a new number.
//   3. The next week NEVER starts mid-week. Once the open week closes (three
//      distinct letters, or her "Move on"), the next week's NUMBER is
//      assigned, but its own start still waits for the next Saturday or
//      Sunday. The days in between are a gap with NO open week: a session
//      landing in that gap counts backward to the week that just closed (an
//      extra rep), same as today's swing-Saturday sessions counting back.
//   4. Lite and "Log what I did" sessions count the same as any other -
//      nothing in SessionLite distinguishes them, on purpose.
//   5. A repeated letter (a second A before B and C) counts toward the open
//      week's `sessions`, but doesn't add to `done` and can't close it.
//   6. "Move on without it" is a quiet, explicit event (`MoveOn`), never
//      inferred. A move for a week that isn't the currently open one is
//      stale (Undo, a second phone, a duplicate tap) and is ignored with a
//      console.warn, never a throw (§2.1).
//   7. A new Round starts at its OWN moment (her call) — it does not wait
//      for a Saturday/Sunday, and the week number restarts at 1.
//
// HISTORY: nothing in the past changes. `COMPLETION_WEEKS_FROM` is the exact
// instant this model takes over (right after her Sat Sep 26 2026 B session
// closed Week 4 at 3 of 3). Every session dated before it is filtered out
// before the walk runs — those weeks keep EXACTLY the counts the live
// `attributeSessionsToWeeks` (app.ts) already gives them; that function is
// untouched by this item, and the switch-over is WK2/WK4's job, not this
// one's.
//
// A KNOWN OPEN EDGE (flagged for the Opus check, §2.8 item 3 - "a week can't
// close twice or skip a number"): this module recomputes fresh from whatever
// session list it's given, so deleting one of the THREE distinct-letter
// sessions that closed a week would, on a naive recompute, reopen it
// (because it no longer sees 3 distinct letters). Deleting a REPEAT/extra
// session never has this problem (tests/week.test.ts #8) - deleting one of
// the 3 closing letters themselves is real, but rarer (the app never lets
// her delete a session's date/letter, only its numbers/note, and a plain
// delete of a closing session is not yet guarded here). Don't silently
// "fix" this without her/Opus weighing in on the right rule.
//
// DELIBERATELY STILL OPEN after the Sep 27 2026 fix round (checker's "should"
// #1): the suggested fix ("a span with a later span or session stays closed")
// can't be built as a pure time-based rule here, because rule 3/8d.2 says the
// OPPOSITE for a legitimate short week - it stays open through as many
// Saturdays/Sundays as it takes (tests/week.test.ts #3, 10 real days). A
// pure recompute genuinely cannot tell "week 5 is still short and open" apart
// from "week 5 was reopened because its closing letter got deleted" - both
// look identical from a session list alone. The real fix needs the week's
// close to survive a session's deletion, i.e. persisted memory, which is what
// PLAN-2026-09-26.md §2.2's optional `counted_round`/`counted_week` audit
// columns are for. That's a schema decision (her yes first), not a WK1 patch.
// The app still has no UI path to delete a closing session, so this stays a
// flagged edge, not a live bug. WK1 fix r2 (Sep 27 2026): carried forward as
// an explicit GATE on WK2 in PLAN-2026-09-26.md — the counting switch-over
// must not go live until a closed week survives a deleted session.
//
// ALSO STILL OPEN, "nice", deferred by choice (checker's "nice" #3): weekday
// math here (isWeekendAnchorDay, nextSaturdayBoundary) reads the DEVICE's
// local time (getDay/getDate), same convention as app.ts's
// calendarSaturdayMs. Tests pin TZ=Asia/Jerusalem so they're exact; a real
// phone traveling outside it could see its Sat/Sun boundary shift by a few
// hours. Fixing it means switching every weekday/anchor calc to an explicit
// Intl.DateTimeFormat(..., { timeZone: 'Asia/Jerusalem' }) read — a wider
// change than this fix round's must/should items, and not something she's
// hit yet (she isn't traveling). Left for a future round, not blocking WK2.

export type Letter = 'A' | 'B' | 'C';

export type WeekKey = { round: number; week: number };

export type SessionLite = {
  id: string;
  date: string; // ISO, LogEntry.date
  workout: Letter;
};

export type MoveOn = { round: number; week: number; at: string };

export type RoundStart = { round: number; at: string };

export type WeekSpan = {
  key: WeekKey;
  openedAt: string;
  closedAt: string | null; // null = the open week
  how: 'three' | 'moved_on' | 'round_ended' | null;
  sessions: SessionLite[]; // chronological
  done: Letter[]; // distinct, A→B→C order
  missing: Letter[];
};

// The exact instant this model takes over (her Sat Sep 26 2026 B session,
// 21:48-22:14, closed Week 4 at 3 of 3; the launch is right after it ends).
export const COMPLETION_WEEKS_FROM: { round: number; week: number; at: string } = {
  round: 2,
  week: 5,
  at: '2026-09-26T22:30:00+03:00',
};

const LETTER_ORDER: readonly Letter[] = ['A', 'B', 'C'];

function doneAndMissing(doneSet: ReadonlySet<Letter>): { done: Letter[]; missing: Letter[] } {
  return {
    done: LETTER_ORDER.filter((l) => doneSet.has(l)),
    missing: LETTER_ORDER.filter((l) => !doneSet.has(l)),
  };
}

// Local calendar day, Saturday or Sunday — same local-Date convention as
// app.ts's calendarSaturdayMs (getDay()/getDate() on the system's local
// time; the app and its tests run in Asia/Jerusalem, her own timezone).
function isWeekendAnchorDay(iso: string): boolean {
  const day = new Date(iso).getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

function afterLaunch(iso: string, launchAt: string): boolean {
  return new Date(iso).getTime() >= new Date(launchAt).getTime();
}

// Sep 27 2026 · WK1 fix r1 (checker must #1, spec 8d.5): "the next week ...
// only opens the next week at the first such boundary at or after the
// current week's close." Given the instant a week closes, this is that
// boundary: the next local Saturday at 00:00. If the close itself already
// falls on a Saturday or Sunday, there IS no boundary to wait for (the
// caller special-cases that and opens immediately, same as the launch
// instant always has) - this function is only ever called for a Mon-Fri
// close. Returns the boundary as a Date (not just a timestamp) - r2 needs
// the actual y/m/d to FORMAT it as the week's openedAt (see formatLocalIso).
function nextSaturdayBoundary(closedAtIso: string): Date {
  const closed = new Date(closedAtIso);
  const day = closed.getDay(); // 0 Sun .. 6 Sat; never called with 0 or 6
  const daysUntilSaturday = 6 - day;
  const boundary = new Date(closed.getFullYear(), closed.getMonth(), closed.getDate());
  boundary.setDate(boundary.getDate() + daysUntilSaturday);
  return boundary;
}

// The Monday right after a Sat boundary — i.e. the end (exclusive) of "that
// weekend". Date arithmetic (setDate), not raw milliseconds, so a DST shift
// landing on the boundary weekend still gives the right calendar day.
function mondayAfter(boundary: Date): Date {
  const monday = new Date(boundary.getFullYear(), boundary.getMonth(), boundary.getDate());
  monday.setDate(monday.getDate() + 2); // boundary is always a Saturday
  return monday;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// WK1 fix r2 (checker must #1) — a plain function taking `boundary` as a
// parameter, not read off the mutable `nextBoundary` closure variable in
// `walkWeeks` below. TS won't narrow a captured `let` that a nested function
// (`closeOpen`) also reassigns, even right after its own `!== null` check —
// a parameter binding sidesteps that entirely.
function resolveGapSession(
  boundary: Date | null,
  sessionDate: string
): { opened: true; openedAt: string } | { opened: false } {
  if (boundary === null || new Date(sessionDate).getTime() < boundary.getTime()) {
    return { opened: false };
  }
  // On the anchor weekend itself (Sat or the following Sun) → the session's
  // own date, same as always. Past it (Monday or later) → the anchor
  // Saturday, frozen — her rule 1, see the WK1 fix r2 note at the call site.
  const onAnchorWeekend = new Date(sessionDate).getTime() < mondayAfter(boundary).getTime();
  return { opened: true, openedAt: onAnchorWeekend ? sessionDate : formatLocalIso(boundary) };
}

// Sep 27 2026 · WK1 fix r2 (checker must #1): format a local Date as an ISO
// string carrying its OWN local offset (e.g. "+03:00"), not the UTC
// `toISOString()` would give. Needed once a week's openedAt is a boundary
// WE computed (Saturday 00:00) rather than a session's own already-ISO
// date string - same shape as every other openedAt in WeekSpan so callers
// never have to special-case it.
function formatLocalIso(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function freshSpan(key: WeekKey, openedAt: string): WeekSpan {
  return {
    key,
    openedAt,
    closedAt: null,
    how: null,
    sessions: [],
    done: [],
    missing: [...LETTER_ORDER],
  };
}

type TimelineEvent =
  | { at: string; kind: 'session'; session: SessionLite }
  | { at: string; kind: 'move'; move: MoveOn }
  | { at: string; kind: 'round'; round: RoundStart };

// Merge the three inputs into one chronological walk. Ties: a session sorts
// before a move or a round start dated the same instant (§2.1: "ties:
// session first") — tests/week.test.ts #7.
function timeline(sessions: SessionLite[], moves: MoveOn[], rounds: RoundStart[]): TimelineEvent[] {
  const kindOrder: Record<TimelineEvent['kind'], number> = { session: 0, round: 1, move: 2 };
  const events: TimelineEvent[] = [
    ...sessions.map((session): TimelineEvent => ({ at: session.date, kind: 'session', session })),
    ...moves.map((move): TimelineEvent => ({ at: move.at, kind: 'move', move })),
    ...rounds.map((round): TimelineEvent => ({ at: round.at, kind: 'round', round })),
  ];
  events.sort((a, b) => {
    const t = new Date(a.at).getTime() - new Date(b.at).getTime();
    return t !== 0 ? t : kindOrder[a.kind] - kindOrder[b.kind];
  });
  return events;
}

/** WK1 fix r2 (checker must #2) — the next week's number + when it opens,
 * live during a weekday-close gap even with 0 sessions logged. `opensAt` is
 * frozen the instant the gap starts (the first Sat/Sun boundary after the
 * close) — the SAME value the eventual span's `openedAt` will carry once a
 * session finally lands (see `walkWeeks` below), so a caller reading this
 * mid-gap never disagrees with what week.ts reports once a session arrives. */
export type PendingWeek = { key: WeekKey; opensAt: string };

/**
 * Walk sessions + moves + round starts after the launch, in time order.
 * Pure: same inputs always give the same spans (a real Undo/delete is just a
 * fresh call with that row missing from the input, tests/week.test.ts #5).
 *
 * `open` is nullable — the amendment's own words: "the days between Tuesday
 * and the next Sat/Sun are a gap with NO open week." During that gap,
 * `pending` (WK1 fix r2) carries the next week's key + when it opens, so a
 * caller (WK2) reads the boundary from here instead of re-deriving it and
 * risking disagreement once the first session actually lands.
 */
// WK2 (Sep 27 2026): `launch` defaults to COMPLETION_WEEKS_FROM — every real
// caller (the app) always gets that. It's a parameter (not a hard-coded
// read) so a test can replay REAL session dates through this exact code path
// anchored at an EARLIER real launch point (e.g. the true Aug 29 2026 Round-2
// start) and check the result against known real history — the "real parity"
// check PLAN-2026-09-26.md's WK2 GATE 2 asks for, without faking dates
// (tests/week.test.ts, "REAL parity"). The app itself never passes this.
export function walkWeeks(
  sessionsIn: SessionLite[],
  movesIn: MoveOn[],
  roundsIn: RoundStart[],
  launch: { round: number; week: number; at: string } = COMPLETION_WEEKS_FROM
): {
  spans: WeekSpan[];
  open: WeekSpan | null;
  pending: PendingWeek | null;
  weekOf: Map<string, WeekKey>;
} {
  const sessions = sessionsIn.filter((s) => afterLaunch(s.date, launch.at));
  const moves = movesIn.filter((m) => afterLaunch(m.at, launch.at));
  const rounds = roundsIn.filter((r) => afterLaunch(r.at, launch.at));
  const events = timeline(sessions, moves, rounds);

  const spans: WeekSpan[] = [];
  const weekOf = new Map<string, WeekKey>();

  let roundNow = launch.round;
  let weekNow = launch.week;

  // The instant `launch.at` falls on IS a Saturday for the real
  // COMPLETION_WEEKS_FROM (so the very first week never has to wait for an
  // anchor day — it just starts open). A test-supplied launch must keep that
  // same property to stay meaningful (asserted by the test itself, not here).
  let open: WeekSpan | null = freshSpan({ round: roundNow, week: weekNow }, launch.at);
  let openDone = new Set<Letter>();

  // The most recently CLOSED span — a gap session (rule 3) counts backward
  // to this one instead of opening a new week itself.
  let lastClosed: WeekSpan | null = null;

  // Set the instant a week closes (except a round restart, which never
  // waits - rule 7). Non-null while a gap is open: the amended anchor rule
  // (8d.5) - a session dated at/after this boundary opens the next week,
  // WHATEVER weekday it lands on (checker must #1); a session dated before
  // it counts backward to `lastClosed` instead (rule 3). Stored as a Date so
  // r2 can both compare it (getTime()) and format it (formatLocalIso) as the
  // eventual openedAt.
  let nextBoundary: Date | null = null;

  function closeOpen(at: string, how: 'three' | 'moved_on' | 'round_ended'): void {
    if (!open) return;
    const { done, missing } = doneAndMissing(openDone);
    open.closedAt = at;
    open.how = how;
    open.done = done;
    open.missing = missing;
    spans.push(open);
    lastClosed = open;
    open = null;

    // "round_ended" opens its own Week 1 right away (rule 7) - the caller
    // does that itself, right after calling closeOpen. For an ordinary
    // close, the next week's NUMBER is assigned now (8d.3), but its own
    // start still waits for a Saturday/Sunday boundary - UNLESS the close
    // itself already landed on one, in which case there's nothing to wait
    // for (same reasoning as the launch instant always opening straight
    // away).
    if (how !== 'round_ended') {
      weekNow += 1;
      if (isWeekendAnchorDay(at)) {
        open = freshSpan({ round: roundNow, week: weekNow }, at);
        openDone = new Set();
        nextBoundary = null;
      } else {
        nextBoundary = nextSaturdayBoundary(at);
      }
    }
  }

  for (const ev of events) {
    if (ev.kind === 'round') {
      // Her own call, "starts at its own moment" (rule 7) — closes whatever
      // was open (even mid-week, even at 0 done) and opens Round N Week 1
      // right then. No Sat/Sun wait; she chose the restart.
      if (open) closeOpen(ev.round.at, 'round_ended');
      roundNow = ev.round.round;
      weekNow = 1;
      open = freshSpan({ round: roundNow, week: weekNow }, ev.round.at);
      openDone = new Set();
      nextBoundary = null; // her own restart moment - no boundary to wait for
      continue;
    }

    if (ev.kind === 'move') {
      if (open && open.key.round === ev.move.round && open.key.week === ev.move.week) {
        closeOpen(ev.move.at, 'moved_on');
      } else {
        // Stale: Undo, a second phone, a duplicate tap, or a move for a week
        // that already closed some other way. §2.1: warn, never throw.
        const openLabel = open ? `R${open.key.round}W${open.key.week}` : 'none (a gap)';
        console.warn(
          `[week] ignoring a stale "move on" for R${ev.move.round}W${ev.move.week} ` +
            `at ${ev.move.at} — the open week is ${openLabel}`
        );
      }
      continue;
    }

    // ev.kind === 'session'
    const session = ev.session;
    if (open) {
      open.sessions.push(session);
      openDone.add(session.workout);
      weekOf.set(session.id, open.key);
      if (openDone.size === 3) closeOpen(session.date, 'three');
      continue;
    }

    // A gap: no week is open. The amended rule (8d.5, checker must #1) — a
    // session opens the NEXT week once its date is at or after the next
    // Saturday/Sunday boundary past the close, WHATEVER weekday it actually
    // lands on (her real rhythm rarely has a weekend session, so waiting
    // for an exact Sat/Sun hit meant the next week could never open at
    // all).
    //
    // WK1 fix r2 (checker must #1, her rule 1: "a week always has to be
    // start sat or sun not just mid week"): r1 used the session's OWN date
    // as openedAt whatever weekday it landed on — a Monday session gave
    // openedAt = Monday, which is exactly the mid-week start her amendment
    // forbids. The fix: `openedAt` is the session's own date ONLY when it
    // actually falls on the anchor weekend itself (Sat or the following
    // Sun — same day rule 6 already opens on); once a session lands on or
    // after the following Monday, the week's start is instead the anchor
    // Saturday at 00:00 local, frozen at the moment the gap began. That
    // freeze is deliberate (not "the latest Saturday before this session"):
    // it's the SAME instant `pending.opensAt` already reports throughout the
    // gap (below), so nothing jumps once a session finally lands, even if
    // several weekends passed with no session at all. This is a real
    // behavior decision, not just a formatting choice — flagged for her.
    const gap = resolveGapSession(nextBoundary, session.date);
    if (gap.opened) {
      // weekNow was already assigned at the close (8d.3) - just open now.
      open = freshSpan({ round: roundNow, week: weekNow }, gap.openedAt);
      open.sessions.push(session);
      openDone = new Set([session.workout]);
      weekOf.set(session.id, open.key);
      nextBoundary = null; // consumed - the week is open now
    } else if (lastClosed) {
      const closed = lastClosed as WeekSpan;
      closed.sessions.push(session);
      weekOf.set(session.id, closed.key);
      // Should-fix (checker): a gap session that counts back into a closed
      // week was landing in `.sessions` while `.done`/`.missing` stayed
      // frozen from the moment it closed — a session could show up in the
      // list AND in `missing` at once. `how` stays frozen (the week really
      // did close that way); done/missing are recomputed from the letters
      // actually in `.sessions` now.
      const doneSet = new Set(closed.sessions.map((s) => s.workout));
      const { done, missing } = doneAndMissing(doneSet);
      closed.done = done;
      closed.missing = missing;
    } else {
      // Shouldn't happen — the launch instant starts `open` immediately, so
      // there's always a `lastClosed` by the time a gap can exist. Fail
      // loud rather than lose the session silently (CLAUDE.md fail-loud rule).
      console.warn(
        `[week] session ${session.id} on ${session.date} has no week to attach to (before any close)`
      );
    }
  }

  // The still-open span's done/missing are live, not frozen — a closed span
  // already has them frozen by closeOpen, but `open` only ever tracked them
  // via `openDone` during the loop above.
  if (open) {
    const { done, missing } = doneAndMissing(openDone);
    open.done = done;
    open.missing = missing;
  }

  // WK1 fix r2 (checker must #2) — still in a gap at the end of this walk
  // (a weekday close with no session since) means the next week's number and
  // its boundary are already decided; report them instead of leaving the
  // caller to reconstruct the same rule and risk disagreeing with it.
  const pending: PendingWeek | null =
    open === null && nextBoundary !== null
      ? { key: { round: roundNow, week: weekNow }, opensAt: formatLocalIso(nextBoundary) }
      : null;

  return { spans, open, pending, weekOf };
}

/** Days since the open week opened, local calendar days, today = day N. */
export function dayOfWeek(open: WeekSpan, now: Date): number {
  const opened = new Date(open.openedAt);
  const openedMidnight = new Date(opened.getFullYear(), opened.getMonth(), opened.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nowMidnight.getTime() - openedMidnight.getTime()) / 86_400_000);
  return diffDays + 1;
}

/** Only when 1 or 2 of A/B/C are done AND the week has been open 8+ days. */
export function canMoveOn(open: WeekSpan, now: Date): boolean {
  if (open.closedAt !== null) return false;
  return open.done.length > 0 && open.done.length < 3 && dayOfWeek(open, now) >= 8;
}
