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

function afterLaunch(iso: string): boolean {
  return new Date(iso).getTime() >= new Date(COMPLETION_WEEKS_FROM.at).getTime();
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

/**
 * Walk sessions + moves + round starts after the launch, in time order.
 * Pure: same inputs always give the same spans (a real Undo/delete is just a
 * fresh call with that row missing from the input, tests/week.test.ts #5).
 *
 * `open` is nullable — the amendment's own words: "the days between Tuesday
 * and the next Sat/Sun are a gap with NO open week." A caller (WK2) that
 * needs something to show during that gap projects it itself; this module
 * never invents a start day she hasn't actually started on.
 */
export function walkWeeks(
  sessionsIn: SessionLite[],
  movesIn: MoveOn[],
  roundsIn: RoundStart[]
): { spans: WeekSpan[]; open: WeekSpan | null; weekOf: Map<string, WeekKey> } {
  const sessions = sessionsIn.filter((s) => afterLaunch(s.date));
  const moves = movesIn.filter((m) => afterLaunch(m.at));
  const rounds = roundsIn.filter((r) => afterLaunch(r.at));
  const events = timeline(sessions, moves, rounds);

  const spans: WeekSpan[] = [];
  const weekOf = new Map<string, WeekKey>();

  let roundNow = COMPLETION_WEEKS_FROM.round;
  let weekNow = COMPLETION_WEEKS_FROM.week;

  // The instant COMPLETION_WEEKS_FROM.at falls on IS a Saturday, so the very
  // first week never has to wait for an anchor day — it just starts open.
  let open: WeekSpan | null = freshSpan(
    { round: roundNow, week: weekNow },
    COMPLETION_WEEKS_FROM.at
  );
  let openDone = new Set<Letter>();

  // The most recently CLOSED span — a gap session (rule 3) counts backward
  // to this one instead of opening a new week itself.
  let lastClosed: WeekSpan | null = null;

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

    // A gap: no week is open. Rule 1/3 — a session opens the NEXT week only
    // when it lands on a Saturday or Sunday (whichever she actually starts
    // on); anything else counts backward to the week that just closed.
    if (isWeekendAnchorDay(session.date)) {
      weekNow += 1;
      open = freshSpan({ round: roundNow, week: weekNow }, session.date);
      open.sessions.push(session);
      openDone = new Set([session.workout]);
      weekOf.set(session.id, open.key);
    } else if (lastClosed) {
      (lastClosed as WeekSpan).sessions.push(session);
      weekOf.set(session.id, (lastClosed as WeekSpan).key);
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

  return { spans, open, weekOf };
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
