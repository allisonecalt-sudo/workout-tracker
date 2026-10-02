// tests/week-d.test.ts — week-d.ts's own calendar-window D attribution (Oct 2
// 2026, v61 fix pass 2). Pure-logic tests, same shape as tests/week.test.ts /
// tests/ride-aim.test.ts: no `page` fixture, runs in Node. Closes CHECK-v61.md
// round 2's should #7 ("move weekHasD + weekCountLine into a pure module with
// unit tests incl. '4 of 4 ✓', 'complete · 3 of 4', and the D-window
// attribution cases") and covers the SAME three repros that round's own must
// #1 names (the e2e versions live in tests/app.spec.ts, WK2 describe block).
//
// playwright.config.ts pins process.env.TZ = 'Asia/Jerusalem' for every test
// in this run, Node ones included — the anchor-weekend math below (and
// week.ts's own) depends on that, same as week.test.ts's own header notes.

import { test, expect } from '@playwright/test';
import { walkWeeks, type SessionLite } from '../week';
import {
  weekHasD,
  weekCountLine,
  weekTargetForD,
  weekWindowStart,
  type DWeekModel,
  type DLogLite,
} from '../week-d';

// Her real Week 5 close — A Sun Sep 27, B Mon Sep 28, C Tue Sep 29 (18:00
// local) — the exact rows tests/app.spec.ts's WK2 "closing save mid-week"
// test seeds, reused here so the unit and e2e tests agree on one timeline.
// Launch defaults to COMPLETION_WEEKS_FROM (Round 2, Week 5), so Week 5 is
// already open the instant this list starts.
const WEEK5_SESSIONS: SessionLite[] = [
  { id: 'wk5-a', date: '2026-09-27T15:00:00.000Z', workout: 'A' },
  { id: 'wk5-b', date: '2026-09-28T15:00:00.000Z', workout: 'B' },
  { id: 'wk5-c', date: '2026-09-29T15:00:00.000Z', workout: 'C' }, // closes Week 5
];

function modelFor(sessions: SessionLite[]): DWeekModel {
  const { spans, open, pending } = walkWeeks(sessions, [], []);
  return { spans, open, pending };
}

test.describe('weekCountLine', () => {
  test('0 done, no D: "0 of 4 · A, B and C to go"', () => {
    expect(weekCountLine({ span: null }, false)).toBe('0 of 4 · A, B and C to go');
  });

  test('0 done, D only: "1 of 4 · A, B and C to go" — her exact repro 1 text (CHECK-v61.md round 2)', () => {
    expect(weekCountLine({ span: null }, true)).toBe('1 of 4 · A, B and C to go');
  });

  test('one A/B/C done, no D: "... left", not "... to go"', () => {
    const model = modelFor([{ id: 'wk5-a', date: '2026-09-27T15:00:00.000Z', workout: 'A' }]);
    expect(weekCountLine({ span: model.open }, false)).toBe('1 of 4 · B and C left');
  });

  test('a CLOSED week, no D: "complete · 3 of 4" (the peek\'s own line)', () => {
    const model = modelFor(WEEK5_SESSIONS);
    expect(weekCountLine({ span: model.spans[0] ?? null }, false)).toBe('complete · 3 of 4');
  });

  test('a CLOSED week, with D: "4 of 4 ✓"', () => {
    const model = modelFor(WEEK5_SESSIONS);
    expect(weekCountLine({ span: model.spans[0] ?? null }, true)).toBe('4 of 4 ✓');
  });
});

test.describe('weekHasD / weekTargetForD — the calendar-window fix (CHECK-v61.md round 2 must #1)', () => {
  test('repro 1: a D logged before ANY A/B/C still counts toward the pending week it falls in', () => {
    // Week 5 closes Tue Sep 29; Week 6 is pending, opening Sat Oct 3. A D at
    // 10:00 local Sat Oct 3 — before any A/B/C opens Week 6's own span —
    // must still count toward it (her exact complaint otherwise: "she did
    // not say one of four").
    const model = modelFor(WEEK5_SESSIONS);
    expect(model.open).toBeNull();
    expect(model.pending?.key).toEqual({ round: 2, week: 6 });
    const dLogs: DLogLite[] = [{ date: '2026-10-03T07:00:00.000Z' }]; // 10:00 local
    expect(weekHasD({ kind: 'pending' }, model, dLogs)).toBe(true);
    expect(weekTargetForD('2026-10-03T07:00:00.000Z', model)).toEqual({ kind: 'pending' });
  });

  test('repro 2: a D logged BEFORE the session that actually opens the week (her real Sep 28 order, replayed at the Oct 3 boundary) still counts', () => {
    // D at 08:00 local, A at 10:00 local, both Sat Oct 3 — the span's own
    // `openedAt` is A's timestamp (10:00, later than the D). The anchor
    // floor (midnight Oct 3) is what makes the earlier D count anyway.
    const sessions: SessionLite[] = [
      ...WEEK5_SESSIONS,
      { id: 'wk6-a', date: '2026-10-03T07:00:00.000Z', workout: 'A' }, // 10:00 local — opens Week 6
    ];
    const model = modelFor(sessions);
    expect(model.open?.key).toEqual({ round: 2, week: 6 });
    const dLogs: DLogLite[] = [{ date: '2026-10-03T05:00:00.000Z' }]; // 08:00 local — before openedAt
    expect(weekHasD({ kind: 'open' }, model, dLogs)).toBe(true);
    expect(weekTargetForD('2026-10-03T05:00:00.000Z', model)).toEqual({ kind: 'open' });
  });

  test('repro 3: a D logged minutes AFTER the closing session still belongs to the week that just closed, not the pending one', () => {
    // C closes Week 5 at 18:00 local Tue Sep 29; a D at 21:00 local the SAME
    // day used to fall after `closedAt` and drop out of every window — her
    // exact complaint: "she did not say one of four."
    const model = modelFor(WEEK5_SESSIONS);
    const dLogs: DLogLite[] = [{ date: '2026-09-29T18:00:00.000Z' }]; // 21:00 local, same day as the close
    expect(weekHasD({ kind: 'span', key: { round: 2, week: 5 } }, model, dLogs)).toBe(true);
    // The pending week (Week 6) must NOT also claim the same D.
    expect(weekHasD({ kind: 'pending' }, model, dLogs)).toBe(false);
    expect(weekTargetForD('2026-09-29T18:00:00.000Z', model)).toEqual({
      kind: 'span',
      key: { round: 2, week: 5 },
    });
  });

  test("a D logged well into the gap (before the pending week even opens) counts back to the last closed week — week.ts's own gap promise, rule 3", () => {
    const model = modelFor(WEEK5_SESSIONS); // pending opens Sat Oct 3
    const dLogs: DLogLite[] = [{ date: '2026-10-01T10:00:00.000Z' }]; // Thu, mid-gap
    expect(weekHasD({ kind: 'span', key: { round: 2, week: 5 } }, model, dLogs)).toBe(true);
    expect(weekHasD({ kind: 'pending' }, model, dLogs)).toBe(false);
    expect(weekTargetForD('2026-10-01T10:00:00.000Z', model)).toEqual({
      kind: 'span',
      key: { round: 2, week: 5 },
    });
  });

  test('a stale span key (no such week in the model) never has D — fails honest, not guessed', () => {
    const model = modelFor(WEEK5_SESSIONS);
    const dLogs: DLogLite[] = [{ date: '2026-09-29T18:00:00.000Z' }];
    expect(weekHasD({ kind: 'span', key: { round: 2, week: 99 } }, model, dLogs)).toBe(false);
  });

  test('weekTargetForD on an empty model (no spans, no open, no pending) returns null', () => {
    const empty: DWeekModel = { spans: [], open: null, pending: null };
    expect(weekTargetForD('2026-09-29T18:00:00.000Z', empty)).toBeNull();
  });

  test('weekWindowStart never lands LATER than the ISO instant it is given', () => {
    const iso = '2026-10-04T12:00:00+03:00'; // a Sunday, mid-day
    expect(weekWindowStart(iso)).toBeLessThanOrEqual(new Date(iso).getTime());
  });
});

test.describe('weekHasD on a Sat/Sun close — the anchor-floor-vs-still-open window fix (CHECK-v61.md round 3 must #1)', () => {
  // `weekWindowStart` alone floors ANY instant on a weekend day to that same
  // day's midnight. That's harmless after a WEEKDAY close (the next week
  // always waits for a FUTURE Saturday/Sunday boundary, so the floor can
  // never reach backward into the week that just closed). It's wrong after a
  // SAT/SUN close: `closeOpen` (week.ts) opens the next span at the close
  // instant itself — no boundary to wait for — so flooring that instant to
  // midnight reaches back over however many hours the PREVIOUS week was
  // still open that same calendar day. `weekWindowFor`'s own prev-close
  // clamp (`start = max(anchor-floor, prevClosedAt)`) is what these three
  // tests check for.

  test('Sat close: a D logged hours BEFORE the closing C still belongs to the week that was open all morning, not the week the C opens right after it', () => {
    // A Sun Sep 27, B Mon Sep 28 (both ordinary weekdays — unchanged from
    // WEEK5_SESSIONS), then C on a SATURDAY at 12:00 local — closing Week 5
    // on a weekend opens Week 6 immediately, AT that same 12:00 instant
    // (week.ts's own isWeekendAnchorDay branch). A D at 09:00 local that
    // same Saturday — while Week 5 was still open — is her real Sep 28
    // order (D before the closing letter), replayed at a weekend close.
    const sessions: SessionLite[] = [
      { id: 'wk5-a', date: '2026-09-27T15:00:00.000Z', workout: 'A' },
      { id: 'wk5-b', date: '2026-09-28T15:00:00.000Z', workout: 'B' },
      { id: 'wk5-c-sat', date: '2026-10-03T09:00:00.000Z', workout: 'C' }, // Sat 12:00 local
    ];
    const model = modelFor(sessions);
    expect(model.spans[0]?.how).toBe('three');
    expect(model.spans[0]?.closedAt).toBe('2026-10-03T09:00:00.000Z');
    expect(model.open?.key).toEqual({ round: 2, week: 6 });
    expect(model.open?.openedAt).toBe('2026-10-03T09:00:00.000Z');
    const dLogs: DLogLite[] = [{ date: '2026-10-03T06:00:00.000Z' }]; // Sat 09:00 local
    expect(weekHasD({ kind: 'span', key: { round: 2, week: 5 } }, model, dLogs)).toBe(true);
    expect(weekHasD({ kind: 'open' }, model, dLogs)).toBe(false);
    expect(weekTargetForD('2026-10-03T06:00:00.000Z', model)).toEqual({
      kind: 'span',
      key: { round: 2, week: 5 },
    });
  });

  test('Sun close: a D logged the Saturday BEFORE a Sunday-closing C still belongs to the closing week, not the one it opens', () => {
    // Same shape, but the closing C lands on the SUNDAY instead — the other
    // weekend day `closeOpen` treats as "already on the anchor, open right
    // away."  A D on the Saturday morning before it, while Week 5 was still
    // open, must not get swept into Week 6 by the anchor floor backing
    // Sunday up to that same Saturday's midnight.
    const sessions: SessionLite[] = [
      { id: 'wk5-a', date: '2026-09-27T15:00:00.000Z', workout: 'A' },
      { id: 'wk5-b', date: '2026-09-28T15:00:00.000Z', workout: 'B' },
      { id: 'wk5-c-sun', date: '2026-10-04T09:00:00.000Z', workout: 'C' }, // Sun 12:00 local
    ];
    const model = modelFor(sessions);
    expect(model.spans[0]?.how).toBe('three');
    expect(model.open?.key).toEqual({ round: 2, week: 6 });
    const dLogs: DLogLite[] = [{ date: '2026-10-03T07:00:00.000Z' }]; // Sat 10:00 local, the day before the Sun close
    expect(weekHasD({ kind: 'span', key: { round: 2, week: 5 } }, model, dLogs)).toBe(true);
    expect(weekHasD({ kind: 'open' }, model, dLogs)).toBe(false);
  });

  test('gap + a Sunday opening: a D logged the pending Saturday stays counted once the Sunday A actually opens the week', () => {
    // C closes Week 5 on a WEEKDAY (Friday) — an ordinary gap, pending opens
    // the following Saturday. A D lands on that Saturday, before anything
    // opens Week 6 — it counts toward the pending week (unchanged from the
    // round-2 fix). Once an A finally lands the next day (Sunday), Week 6
    // becomes a real open span whose `openedAt` is the Sunday session's own
    // timestamp — the anchor floor backs that up to the Saturday before it,
    // and nothing here should clamp it forward again (Week 5's own close on
    // the FRIDAY is well before that Saturday floor already, so the prev-
    // close clamp is a no-op in this direction) — her round-2 complaint
    // ("the dot disappears from Week 6") must stay fixed.
    const baseSessions: SessionLite[] = [
      { id: 'wk5-a', date: '2026-09-27T15:00:00.000Z', workout: 'A' },
      { id: 'wk5-b', date: '2026-09-28T15:00:00.000Z', workout: 'B' },
      { id: 'wk5-c-fri', date: '2026-10-02T15:00:00.000Z', workout: 'C' }, // Fri 18:00 local
    ];
    const dLogs: DLogLite[] = [{ date: '2026-10-03T07:00:00.000Z' }]; // Sat 10:00 local

    const pendingModel = modelFor(baseSessions);
    expect(pendingModel.open).toBeNull();
    expect(pendingModel.pending?.key).toEqual({ round: 2, week: 6 });
    expect(weekHasD({ kind: 'pending' }, pendingModel, dLogs)).toBe(true);

    const sessionsWithSundayA: SessionLite[] = [
      ...baseSessions,
      { id: 'wk6-a-sun', date: '2026-10-04T07:00:00.000Z', workout: 'A' }, // Sun 10:00 local
    ];
    const openModel = modelFor(sessionsWithSundayA);
    expect(openModel.open?.key).toEqual({ round: 2, week: 6 });
    expect(weekHasD({ kind: 'open' }, openModel, dLogs)).toBe(true);
    // And it must NOT also still claim a home in the already-closed Week 5.
    expect(weekHasD({ kind: 'span', key: { round: 2, week: 5 } }, openModel, dLogs)).toBe(false);
  });
});
