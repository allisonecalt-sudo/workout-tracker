// tests/week.test.ts — the week model (Sep 26-27 2026)
//
// Pure-logic tests, same shape as tests/cycle.test.ts / tests/progression.test.ts:
// no `page` fixture, so Playwright runs these in Node.
//
// Covers §2.7's Node tests 1-10 (PLAN-2026-09-26.md), reinterpreted under her
// 23:14-23:16 amendment (weeks anchor to a Saturday/Sunday start, not to the
// instant the last one closes) — a few of the original 10 (e.g. "a Thu
// session is Week 6 day 1") describe the PRE-amendment rule and are replaced
// here with the amended behavior they became; each test says which one it
// stands in for. Two bonus tests (11-12) cover canMoveOn/dayOfWeek directly.

import { test, expect } from '@playwright/test';
import {
  walkWeeks,
  dayOfWeek,
  canMoveOn,
  COMPLETION_WEEKS_FROM,
  type SessionLite,
  type MoveOn,
  type RoundStart,
  type WeekSpan,
} from '../week';

// Small helper so every test's console.warn calls are captured and the real
// console.warn is always restored, even if an assertion throws.
function withWarnSpy(run: (warnings: string[]) => void): void {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    run(warnings);
  } finally {
    console.warn = original;
  }
}

// Her real 42 rows (self/health/workout-app-audit-2026-09-24/next-level-2026-09-26,
// read-only: `select id,date,workout_type from workout_sessions order by date.asc`,
// pulled Sep 27 2026 — every one of them is dated before COMPLETION_WEEKS_FROM).
const HER_42_REAL_ROWS: SessionLite[] = [
  { id: 'S1', date: '2026-05-02T19:00:00+00:00', workout: 'A' },
  { id: 'S2', date: '2026-05-05T17:05:28.158+00:00', workout: 'B' },
  { id: 'S3', date: '2026-05-08T12:40:19.438+00:00', workout: 'C' },
  { id: 'S4', date: '2026-05-11T17:29:18.803+00:00', workout: 'A' },
  { id: 'S5', date: '2026-05-14T16:54:22.183+00:00', workout: 'B' },
  { id: 'S6', date: '2026-05-15T15:15:29.83+00:00', workout: 'C' },
  { id: 'S7', date: '2026-05-19T16:53:03.373+00:00', workout: 'A' },
  { id: 'S8', date: '2026-05-20T19:32:46.138+00:00', workout: 'B' },
  { id: 'S9', date: '2026-05-21T14:31:56.384+00:00', workout: 'C' },
  { id: 'S10', date: '2026-05-26T18:20:30.352+00:00', workout: 'A' },
  { id: 'S11', date: '2026-05-28T17:00:00+00:00', workout: 'B' },
  { id: 'S12', date: '2026-05-29T11:09:16.001+00:00', workout: 'C' },
  { id: 'S13', date: '2026-06-03T15:04:22.483+00:00', workout: 'A' },
  { id: 'S14', date: '2026-06-04T12:39:57.74+00:00', workout: 'B' },
  { id: 'S15', date: '2026-06-05T15:05:47.998+00:00', workout: 'C' },
  { id: 'S16', date: '2026-06-09T17:54:47.191+00:00', workout: 'A' },
  { id: 'S17', date: '2026-06-11T17:29:07.923+00:00', workout: 'B' },
  { id: 'S18', date: '2026-06-12T04:44:37.836+00:00', workout: 'C' },
  { id: 'S19', date: '2026-06-16T15:31:58.887+00:00', workout: 'A' },
  { id: 'S20', date: '2026-06-17T18:21:07.205+00:00', workout: 'B' },
  { id: 'S21', date: '2026-06-19T14:46:30.22+00:00', workout: 'C' },
  { id: 'S22', date: '2026-06-24T16:18:34.182+00:00', workout: 'A' },
  { id: 'S23', date: '2026-06-25T15:42:11.092+00:00', workout: 'B' },
  { id: 'S24', date: '2026-06-26T15:00:18.015+00:00', workout: 'C' },
  { id: 'S25', date: '2026-07-01T17:25:08.83+00:00', workout: 'A' },
  { id: 'S26', date: '2026-07-02T18:29:43.471+00:00', workout: 'B' },
  { id: 'S27', date: '2026-07-03T14:55:26.462+00:00', workout: 'C' },
  { id: 'S28', date: '2026-07-07T14:58:23.734+00:00', workout: 'A' },
  { id: 'S29', date: '2026-07-09T19:13:21.69+00:00', workout: 'B' },
  { id: 'S30', date: '2026-07-10T15:48:51.751+00:00', workout: 'C' },
  { id: 'S31', date: '2026-08-30T16:48:14.744+00:00', workout: 'A' },
  { id: 'S32', date: '2026-09-03T15:00:00+00:00', workout: 'B' },
  { id: 'S33', date: '2026-09-04T14:22:39.062+00:00', workout: 'C' },
  { id: 'S34', date: '2026-09-07T15:00:00+00:00', workout: 'A' },
  { id: 'S35', date: '2026-09-11T15:07:03.104+00:00', workout: 'B' },
  { id: 'S36', date: '2026-09-11T15:25:26.058+00:00', workout: 'C' },
  { id: 'S37', date: '2026-09-14T15:50:35.507+00:00', workout: 'A' },
  { id: 'S38', date: '2026-09-18T15:02:34.467+00:00', workout: 'B' },
  { id: 'S39', date: '2026-09-19T19:21:30.241+00:00', workout: 'C' },
  { id: 'S40', date: '2026-09-24T15:56:36.82+00:00', workout: 'A' },
  { id: 'S41', date: '2026-09-25T11:53:48.879+00:00', workout: 'C' },
  { id: 'S42', date: '2026-09-26T19:14:51.421+00:00', workout: 'B' },
];

// Her real Round 2 rows only (S31-S42, Aug 30 - Sep 26 2026) — 4 real 3/3
// weeks, module-scoped so both #2c (shifted) and the REAL-parity test below
// (unshifted) can reuse the exact same fixture.
const HER_REAL_ROUND2_ROWS: SessionLite[] = HER_42_REAL_ROWS.slice(30); // S31..S42

test.describe('#1 — pre-launch rows predate the launch and are filtered out (NOT a full parity test)', () => {
  // Sep 27 2026 · WK1 fix r1 (checker should #3): this test's old name
  // ("same counts per week as today's attributeSessionsToWeeks") over-promised
  // — it only proves every one of her 42 real rows predates the launch, so
  // the new model never touches them. attributeSessionsToWeeks (app.ts)
  // stays untouched by WK1 on purpose, so week-by-week parity against IT
  // can't be proven from inside this pure module. That comparison is WK2's
  // job, the moment counting switches over (§2.7 test #1's real intent).
  test('all 42 of her real rows predate the launch and are filtered out untouched', () => {
    for (const row of HER_42_REAL_ROWS) {
      expect(new Date(row.date).getTime()).toBeLessThan(
        new Date(COMPLETION_WEEKS_FROM.at).getTime()
      );
    }
    const { spans, open, weekOf } = walkWeeks(HER_42_REAL_ROWS, [], []);
    // Nothing closes and nothing is attributed — these counts stay exactly
    // what today's (untouched) attributeSessionsToWeeks already gives them.
    expect(spans).toEqual([]);
    expect(weekOf.size).toBe(0);
    expect(open).not.toBeNull();
    expect(open?.key).toEqual({ round: 2, week: 5 });
    expect(open?.openedAt).toBe(COMPLETION_WEEKS_FROM.at);
    expect(open?.sessions).toEqual([]);
    expect(open?.done).toEqual([]);
    expect(open?.missing).toEqual(['A', 'B', 'C']);
  });
});

test.describe('#2 — closes on the 3rd letter, then a weekday gap counts backward, then Sat opens the next week', () => {
  // Stands in for the original "Sat, Mon, Wed closes Wk5, Thu is Wk6 day 1" —
  // amended: Thu/Fri can't open a week (rule 3), so they count back to Wk5.
  test('Sun/Mon/Wed closes Week 5; Thu+Fri repeats count back; Sat opens Week 6', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' }, // Sun
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' }, // Mon
      { id: 'C1', date: '2026-09-30T10:00:00+03:00', workout: 'C' }, // Wed — closes
      { id: 'D1', date: '2026-10-01T10:00:00+03:00', workout: 'A' }, // Thu — gap, backward
      { id: 'E1', date: '2026-10-02T10:00:00+03:00', workout: 'A' }, // Fri — gap, backward
      { id: 'F1', date: '2026-10-03T10:00:00+03:00', workout: 'A' }, // Sat — opens Wk6
    ];
    const { spans, open, weekOf } = walkWeeks(sessions, [], []);

    expect(spans).toHaveLength(1);
    const wk5 = spans[0] as WeekSpan;
    expect(wk5.key).toEqual({ round: 2, week: 5 });
    expect(wk5.how).toBe('three');
    expect(wk5.closedAt).toBe('2026-09-30T10:00:00+03:00');
    expect(wk5.done).toEqual(['A', 'B', 'C']);
    expect(wk5.missing).toEqual([]);
    expect(wk5.sessions.map((s) => s.id)).toEqual(['A1', 'B1', 'C1', 'D1', 'E1']);

    expect(open).not.toBeNull();
    expect(open?.key).toEqual({ round: 2, week: 6 });
    expect(open?.openedAt).toBe('2026-10-03T10:00:00+03:00');
    expect(open?.sessions.map((s) => s.id)).toEqual(['F1']);
    expect(open?.done).toEqual(['A']);
    expect(open?.missing).toEqual(['B', 'C']);

    expect(weekOf.get('D1')).toEqual({ round: 2, week: 5 });
    expect(weekOf.get('F1')).toEqual({ round: 2, week: 6 });
  });
});

test.describe('#2b — a weekday session AFTER the boundary has passed still opens the next week', () => {
  // Sep 27 2026 · WK1 fix r1 (checker must #1). Her real rhythm almost never
  // lands on a Sat/Sun (38 of 42 real rows are Mon-Fri) — the pre-fix code
  // only opened the next week when a session literally fell on a Sat/Sun, so
  // a plain Mon/Thu/Fri week after a close counted ALL THREE back into the
  // closed week and the next week never opened (open stayed null forever).
  // r1's fix opened the next week on the FIRST session's own day, whatever
  // weekday that was — but that broke her actual rule (r2, checker must #1):
  // "a week always has to be start sat or sun not just mid week." r2's fix:
  // the week still opens on the first post-boundary session (so it isn't
  // folded into the closed week), but its `openedAt` is the anchor Saturday
  // itself, not the weekday the session happened to land on.
  test('Mon A / Thu B / Fri C after a Wed close = Week 6 at 3 of 3, opened on the anchor Saturday', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' }, // Sun
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' }, // Mon
      { id: 'C1', date: '2026-09-30T10:00:00+03:00', workout: 'C' }, // Wed — closes Wk5
      { id: 'D1', date: '2026-10-05T10:00:00+03:00', workout: 'A' }, // Mon — boundary (Sat Oct 3) already passed
      { id: 'E1', date: '2026-10-08T10:00:00+03:00', workout: 'B' }, // Thu
      { id: 'F1', date: '2026-10-09T10:00:00+03:00', workout: 'C' }, // Fri — closes Wk6
    ];
    const { spans, open } = walkWeeks(sessions, [], []);

    expect(spans).toHaveLength(2);
    const wk5 = spans[0] as WeekSpan;
    const wk6 = spans[1] as WeekSpan;
    expect(wk5.key).toEqual({ round: 2, week: 5 });
    expect(wk5.done).toEqual(['A', 'B', 'C']);

    expect(wk6.key).toEqual({ round: 2, week: 6 });
    expect(wk6.how).toBe('three');
    // The anchor Saturday right after the Wed close — frozen at 00:00 local,
    // NOT D1's own Monday (that was r1's bug; her rule always anchors Sat/Sun).
    expect(wk6.openedAt).toBe('2026-10-03T00:00:00+03:00');
    expect(wk6.done).toEqual(['A', 'B', 'C']);
    expect(wk6.missing).toEqual([]);
    expect(wk6.sessions.map((s) => s.id)).toEqual(['D1', 'E1', 'F1']);

    // Week 7 stays a gap (no session yet) rather than being invented.
    expect(open).toBeNull();
  });
});

test.describe('#2c — replaying her real Round 2 rows, shifted after launch, keeps 4 weeks as 4 weeks', () => {
  // Sep 27 2026 · WK1 fix r1 (checker must #1, the exact regression it found):
  // her real Aug 30 – Sep 26 stretch (S31-S42 of HER_42_REAL_ROWS) is 4 real
  // weeks at 3/3. Shifting every date +28 days (4 weeks — same weekday, same
  // letters) lands them all after the launch. Pre-fix, this collapsed to 2
  // weeks (W5 got 8 sessions, W6 got 4) because most of these sessions land
  // on weekdays, not a Sat/Sun. Post-fix it must stay 4 separate weeks.
  function shiftDays(iso: string, days: number): string {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  }

  test('4 real 3/3 weeks, shifted +28 days, are still 4 closed weeks at 3/3 (not 2)', () => {
    const shifted = HER_REAL_ROUND2_ROWS.map((s) => ({ ...s, date: shiftDays(s.date, 28) }));
    const { spans, open } = walkWeeks(shifted, [], []);

    expect(spans).toHaveLength(4);
    for (const span of spans) {
      expect(span.how).toBe('three');
      expect(span.done).toEqual(['A', 'B', 'C']);
      expect(span.missing).toEqual([]);
      expect(span.sessions).toHaveLength(3);
    }
    expect(spans.map((s) => s.key.week)).toEqual([5, 6, 7, 8]);
    // The 4th week's close (Sat, shifted from her real Sep 26 close) opens
    // Week 9 immediately (no boundary to wait for) — empty until she logs.
    expect(open?.key).toEqual({ round: 2, week: 9 });
    expect(open?.sessions).toEqual([]);
  });
});

test.describe('REAL parity (WK2 GATE 2) — her actual Round 2 dates, UNSHIFTED, anchored at the real Aug 29 launch', () => {
  // Sep 27 2026 · WK2. #1's own comment (above) says this is "WK2's job, the
  // moment counting switches over" — #2c already proves the SHAPE holds on a
  // shifted copy of these rows; this test is the real thing the GATE actually
  // asks for: her REAL, unshifted S31-S42 timestamps, replayed through this
  // exact walkWeeks() code path but anchored at Round 2's own real start
  // (2026-08-29, a Saturday) via the `launch` param (week.ts's own escape
  // hatch for exactly this — see its comment). The result is checked against
  // KNOWN real history, not against a re-derivation of attributeSessionsToWeeks
  // (app.ts is not Node-importable — it's full of DOM/localStorage reads) —
  // her real Sep 26 2026 B session is independently on record (COMPLETION_
  // WEEKS_FROM's own comment) as the session that "closed Week 4 at 3 of 3",
  // i.e. Round 2 Weeks 1-4 are four real, complete 3/3 weeks. If walkWeeks
  // disagreed with that on her real dates, the switch-over would NOT be
  // lossless and WK2 must not ship.
  const REAL_ROUND2_LAUNCH = { round: 2, week: 1, at: '2026-08-29T00:00:00+03:00' };

  test('her real S31-S42 timestamps resolve to exactly 4 closed 3/3 weeks (1-4), then an empty Week 5 open', () => {
    const { spans, open } = walkWeeks(HER_REAL_ROUND2_ROWS, [], [], REAL_ROUND2_LAUNCH);

    expect(spans.map((s) => s.key.week)).toEqual([1, 2, 3, 4]);
    for (const span of spans) {
      expect(span.key.round).toBe(2);
      expect(span.how).toBe('three');
      expect(span.done).toEqual(['A', 'B', 'C']);
      expect(span.missing).toEqual([]);
      expect(span.sessions).toHaveLength(3);
    }
    // Her real per-week grouping (read straight off HER_42_REAL_ROWS' own
    // dates, S31-S42): Week 1 = Aug 30/Sep 3/Sep 4; Week 2 = Sep 7/11/11;
    // Week 3 = Sep 12(anchor)/14/18/19; Week 4 = 19(open)/24/25/26.
    expect(spans[0]?.sessions.map((s) => s.id)).toEqual(['S31', 'S32', 'S33']);
    expect(spans[1]?.sessions.map((s) => s.id)).toEqual(['S34', 'S35', 'S36']);
    expect(spans[2]?.sessions.map((s) => s.id)).toEqual(['S37', 'S38', 'S39']);
    expect(spans[3]?.sessions.map((s) => s.id)).toEqual(['S40', 'S41', 'S42']);

    // Week 4 closed on her real Sep 26 2026 B session (S42) — the exact
    // instant the real COMPLETION_WEEKS_FROM is anchored right after.
    expect(spans[3]?.closedAt).toBe('2026-09-26T19:14:51.421+00:00');

    // Week 5 opens immediately (S42's close landed on a Saturday) — empty,
    // exactly matching what COMPLETION_WEEKS_FROM.week (5) already assumes.
    expect(open?.key).toEqual({ round: 2, week: 5 });
    expect(open?.sessions).toEqual([]);
  });
});

test.describe('#3 — a short week stays open past Friday, into a second weekend', () => {
  test('A, A (repeat), B across 10 days → still open, missing = [C]', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' }, // Sun, day 2
      { id: 'A2', date: '2026-09-30T10:00:00+03:00', workout: 'A' }, // Wed, repeat
      { id: 'B1', date: '2026-10-03T10:00:00+03:00', workout: 'B' }, // Sat, day 8
    ];
    const { spans, open } = walkWeeks(sessions, [], []);

    expect(spans).toEqual([]);
    expect(open).not.toBeNull();
    const wk5 = open as WeekSpan;
    expect(wk5.key).toEqual({ round: 2, week: 5 });
    expect(wk5.closedAt).toBeNull();
    expect(wk5.sessions).toHaveLength(3);
    expect(wk5.done).toEqual(['A', 'B']);
    expect(wk5.missing).toEqual(['C']);
    expect(dayOfWeek(wk5, new Date('2026-10-05T12:00:00+03:00'))).toBe(10);
  });
});

test.describe('#4 — "Move on without it" closes the week; a duplicate tap is ignored', () => {
  test('a valid move-on closes Week 5 at 2 of 3; a later duplicate for the same week warns and is ignored', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
      { id: 'F1', date: '2026-10-03T10:00:00+03:00', workout: 'A' }, // Sat — opens Wk6
    ];
    const moves: MoveOn[] = [
      { round: 2, week: 5, at: '2026-10-02T12:00:00+03:00' }, // valid
      { round: 2, week: 5, at: '2026-10-02T15:00:00+03:00' }, // stale duplicate tap
    ];

    withWarnSpy((warnings) => {
      const { spans, open } = walkWeeks(sessions, moves, []);

      expect(spans).toHaveLength(1);
      const wk5 = spans[0] as WeekSpan;
      expect(wk5.how).toBe('moved_on');
      expect(wk5.closedAt).toBe('2026-10-02T12:00:00+03:00');
      expect(wk5.done).toEqual(['A', 'B']);
      expect(wk5.missing).toEqual(['C']);

      expect(open?.key).toEqual({ round: 2, week: 6 });
      expect(open?.openedAt).toBe('2026-10-03T10:00:00+03:00');

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('stale "move on"');
    });
  });
});

test.describe('#4a — a move for the open week at 0 done is ignored, not accepted', () => {
  // Sep 27 2026 · WK3 fix r1 (checker should #2). canMoveOn already gates the
  // real button on done.length > 0, so a real tap can't produce this — but a
  // hand-inserted row, a second phone, or a resurrected remote row could.
  // Her rule: a 0-done week never needs moving on.
  test('a move for Week 5 at 0 done warns and leaves Week 5 open', () => {
    const moves: MoveOn[] = [{ round: 2, week: 5, at: '2026-10-02T12:00:00+03:00' }];

    withWarnSpy((warnings) => {
      const { spans, open } = walkWeeks([], moves, []);

      expect(spans).toEqual([]);
      expect(open?.key).toEqual({ round: 2, week: 5 });
      expect(open?.closedAt).toBeNull();
      expect(open?.done).toEqual([]);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('0 done');
    });
  });
});

test.describe('#4b — a gap session counting back into a moved-on week updates its done/missing too', () => {
  // Sep 27 2026 · WK1 fix r1 (checker should: week.ts:244-246). A gap session
  // landing in `.sessions` while `.done`/`.missing` stayed frozen from the
  // close meant a week could list a C session AND still say `missing: ['C']`
  // — contradictory data a weekly-review screen would show as-is. `how`
  // stays 'moved_on' (the week really did close that way); done/missing now
  // reflect the letters actually in `.sessions`.
  test('a gap C after "moved on without it" (missing C) updates missing to []', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
      { id: 'D1', date: '2026-10-01T10:00:00+03:00', workout: 'C' }, // Thu, gap — backward
      { id: 'F1', date: '2026-10-03T10:00:00+03:00', workout: 'A' }, // Sat — opens Wk6
    ];
    const moves: MoveOn[] = [{ round: 2, week: 5, at: '2026-09-30T12:00:00+03:00' }]; // Wed, missing C

    const { spans, open } = walkWeeks(sessions, moves, []);

    expect(spans).toHaveLength(1);
    const wk5 = spans[0] as WeekSpan;
    expect(wk5.how).toBe('moved_on'); // still closed the way it really closed
    expect(wk5.sessions.map((s) => s.id)).toEqual(['A1', 'B1', 'D1']);
    expect(wk5.done).toEqual(['A', 'B', 'C']); // recomputed — D1 is in the list now
    expect(wk5.missing).toEqual([]); // no longer contradicts .sessions

    expect(open?.key).toEqual({ round: 2, week: 6 });
  });
});

test.describe('#5 — Undo (the move row is deleted) → back to Week 5 open', () => {
  test('the same sessions, without the move event, leave Week 5 open at 2 of 3', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
    ];
    const { spans, open } = walkWeeks(sessions, [], []); // moves: [] — as if Undo deleted it

    expect(spans).toEqual([]);
    expect(open?.key).toEqual({ round: 2, week: 5 });
    expect(open?.closedAt).toBeNull();
    expect(open?.done).toEqual(['A', 'B']);
    expect(open?.missing).toEqual(['C']);
  });
});

test.describe('#6 — the anchor is whichever day she actually starts on, not always Saturday', () => {
  test('Week 5 closes Wed; she skips Saturday and starts Week 6 on the SUNDAY instead', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
      { id: 'C1', date: '2026-09-30T10:00:00+03:00', workout: 'C' }, // closes Wed
      // no session Sat Oct 3 at all
      { id: 'G1', date: '2026-10-04T10:00:00+03:00', workout: 'A' }, // Sun Oct 4
    ];
    const { spans, open } = walkWeeks(sessions, [], []);

    expect(spans).toHaveLength(1);
    expect(open?.key).toEqual({ round: 2, week: 6 });
    expect(open?.openedAt).toBe('2026-10-04T10:00:00+03:00'); // the Sunday, not Oct 3
    expect(open?.sessions.map((s) => s.id)).toEqual(['G1']);
  });
});

test.describe('#7 — ties: a session sorts before a move dated the same instant', () => {
  test('a move-on for Week 5 fired at the same instant the 3rd letter is saved loses to the session', () => {
    const sameInstant = '2026-10-01T09:00:00+03:00';
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
      { id: 'C1', date: sameInstant, workout: 'C' },
    ];
    const moves: MoveOn[] = [{ round: 2, week: 5, at: sameInstant }];

    withWarnSpy((warnings) => {
      const { spans } = walkWeeks(sessions, moves, []);
      expect(spans).toHaveLength(1);
      expect((spans[0] as WeekSpan).how).toBe('three'); // the session won the tie
      expect(warnings).toHaveLength(1); // the move then found no open week
    });
  });
});

test.describe('#8 — deleting a repeat session from a closed week leaves it closed', () => {
  test('removing the Thu repeat from Week 5 does not reopen it or disturb Week 6', () => {
    const withRepeat: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
      { id: 'C1', date: '2026-09-30T10:00:00+03:00', workout: 'C' },
      { id: 'D1', date: '2026-10-01T10:00:00+03:00', workout: 'A' }, // the repeat
      { id: 'F1', date: '2026-10-03T10:00:00+03:00', workout: 'A' },
    ];
    const withoutRepeat = withRepeat.filter((s) => s.id !== 'D1');

    const before = walkWeeks(withRepeat, [], []);
    const after = walkWeeks(withoutRepeat, [], []);

    expect(before.spans[0]?.sessions).toHaveLength(4); // A, B, C, D
    expect(after.spans[0]?.sessions).toHaveLength(3); // A, B, C — D gone

    for (const result of [before, after]) {
      const wk5 = result.spans[0] as WeekSpan;
      expect(wk5.how).toBe('three');
      expect(wk5.closedAt).toBe('2026-09-30T10:00:00+03:00');
      expect(wk5.done).toEqual(['A', 'B', 'C']);
      expect(result.open?.key).toEqual({ round: 2, week: 6 });
      expect(result.open?.sessions.map((s) => s.id)).toEqual(['F1']);
    }
  });
});

test.describe('#9 — a Round start closes whatever was open and begins Week 1', () => {
  test('Week 5 sitting at 1 of 3 is force-closed "round_ended" the moment Round 3 starts', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'G1', date: '2026-10-06T10:00:00+03:00', workout: 'B' }, // after the restart
    ];
    const rounds: RoundStart[] = [{ round: 3, at: '2026-10-05T09:00:00+03:00' }]; // a Monday — no anchor needed
    const { spans, open } = walkWeeks(sessions, [], rounds);

    expect(spans).toHaveLength(1);
    const wk5 = spans[0] as WeekSpan;
    expect(wk5.key).toEqual({ round: 2, week: 5 });
    expect(wk5.how).toBe('round_ended');
    expect(wk5.closedAt).toBe('2026-10-05T09:00:00+03:00');
    expect(wk5.done).toEqual(['A']);
    expect(wk5.missing).toEqual(['B', 'C']);

    expect(open?.key).toEqual({ round: 3, week: 1 });
    expect(open?.openedAt).toBe('2026-10-05T09:00:00+03:00');
    expect(open?.sessions.map((s) => s.id)).toEqual(['G1']);
    expect(open?.done).toEqual(['B']);
  });
});

test.describe('#10 — an offline session synced out of array order still resolves by its own date', () => {
  test('C before A before B in the array still closes Week 5 chronologically on Wed', () => {
    const scrambled: SessionLite[] = [
      { id: 'C1', date: '2026-09-30T10:00:00+03:00', workout: 'C' }, // Wed, latest — listed FIRST
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' }, // Sun, earliest — listed SECOND
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' }, // Mon — listed THIRD
    ];
    const { spans } = walkWeeks(scrambled, [], []);

    expect(spans).toHaveLength(1);
    const wk5 = spans[0] as WeekSpan;
    expect(wk5.how).toBe('three');
    expect(wk5.closedAt).toBe('2026-09-30T10:00:00+03:00'); // the chronologically-last one
    expect(wk5.sessions.map((s) => s.id)).toEqual(['A1', 'B1', 'C1']); // stored chronological
  });
});

test.describe('#11 — canMoveOn: day 7 hidden, day 8 shown, and only at 1-2 done', () => {
  const openWeek: WeekSpan = {
    key: { round: 2, week: 5 },
    openedAt: COMPLETION_WEEKS_FROM.at, // Sat Sep 26, 22:30
    closedAt: null,
    how: null,
    sessions: [],
    done: ['A'],
    missing: ['B', 'C'],
  };

  test('hidden on day 7 (Fri), shown on day 8 (Sat), with 1 done', () => {
    expect(canMoveOn(openWeek, new Date('2026-10-02T12:00:00+03:00'))).toBe(false); // day 7
    expect(canMoveOn(openWeek, new Date('2026-10-03T12:00:00+03:00'))).toBe(true); // day 8
  });

  test('never shown at 0 done, even on day 20', () => {
    const zeroDone: WeekSpan = { ...openWeek, done: [], missing: ['A', 'B', 'C'] };
    expect(canMoveOn(zeroDone, new Date('2026-10-16T12:00:00+03:00'))).toBe(false);
  });

  test('never shown once all 3 are done', () => {
    const threeDone: WeekSpan = { ...openWeek, done: ['A', 'B', 'C'], missing: [] };
    expect(canMoveOn(threeDone, new Date('2026-10-16T12:00:00+03:00'))).toBe(false);
  });

  test('never shown once the week has already closed', () => {
    const closed: WeekSpan = { ...openWeek, closedAt: '2026-10-03T12:00:00+03:00', how: 'three' };
    expect(canMoveOn(closed, new Date('2026-10-16T12:00:00+03:00'))).toBe(false);
  });
});

test.describe('#12 — dayOfWeek: today counts as day 1', () => {
  test('the day a week opens is day 1, not day 0', () => {
    const wk5: WeekSpan = {
      key: { round: 2, week: 5 },
      openedAt: '2026-09-26T22:30:00+03:00',
      closedAt: null,
      how: null,
      sessions: [],
      done: [],
      missing: ['A', 'B', 'C'],
    };
    expect(dayOfWeek(wk5, new Date('2026-09-26T23:59:00+03:00'))).toBe(1);
    expect(dayOfWeek(wk5, new Date('2026-09-27T00:05:00+03:00'))).toBe(2);
  });
});

test.describe('#13 — invariant: a span never opens on a weekday, except the launch instant or a Round start', () => {
  // Sep 27 2026 · WK1 fix r2 (checker must #1's own ask: "add a test that no
  // span's openedAt ever falls Mon-Fri, except the launch instant and round
  // starts"). Chains a Wed close → weekday-after-boundary open (like #2b),
  // then a SECOND gap that skips THREE weekends with no session at all
  // (checker must #1's "later weekend" case) — proving the anchor stays
  // frozen at the FIRST boundary rather than drifting to "whichever Saturday
  // is closest to the session" — then a Round start (which correctly opens
  // mid-week, on her own restart moment, and must be excluded).
  test('every non-launch, non-round-start openedAt falls on Saturday or Sunday', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' }, // Sun
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' }, // Mon
      { id: 'C1', date: '2026-09-30T10:00:00+03:00', workout: 'C' }, // Wed — closes Wk5
      { id: 'D1', date: '2026-10-05T10:00:00+03:00', workout: 'A' }, // Mon — boundary Sat Oct 3 passed
      { id: 'E1', date: '2026-10-08T10:00:00+03:00', workout: 'B' }, // Thu
      { id: 'F1', date: '2026-10-09T10:00:00+03:00', workout: 'C' }, // Fri — closes Wk6
      // Wk7 gets no session for THREE weekends (Oct 10/11, 17/18, 24/25) —
      // the "later weekend" case must #1 flags.
      { id: 'G1', date: '2026-10-28T10:00:00+03:00', workout: 'A' }, // Wed, 3 weekends after the Wk6 close
    ];
    const rounds: RoundStart[] = [{ round: 3, at: '2026-11-02T09:00:00+03:00' }]; // Monday — her own restart

    const { spans, open } = walkWeeks(sessions, [], rounds);

    expect(spans).toHaveLength(3);
    const [wk5, wk6, wk7] = spans as [WeekSpan, WeekSpan, WeekSpan];
    expect(wk5.key).toEqual({ round: 2, week: 5 });
    expect(wk6.key).toEqual({ round: 2, week: 6 });
    expect(wk6.openedAt).toBe('2026-10-03T00:00:00+03:00');
    expect(wk7.key).toEqual({ round: 2, week: 7 });
    expect(wk7.how).toBe('round_ended');
    // Frozen at the FIRST boundary (Sat Oct 10, right after the Wk6 close on
    // Fri Oct 9) — not "the Saturday nearest G1's Oct 28", which would be
    // Oct 24. Her rule (8d.3) is "the next Saturday or Sunday", singular.
    expect(wk7.openedAt).toBe('2026-10-10T00:00:00+03:00');
    expect(wk7.done).toEqual(['A']);
    expect(wk7.closedAt).toBe('2026-11-02T09:00:00+03:00');

    expect(open).not.toBeNull();
    expect(open?.key).toEqual({ round: 3, week: 1 });
    expect(open?.openedAt).toBe('2026-11-02T09:00:00+03:00'); // her own restart — a Monday, and that's fine

    const roundStartOpens = new Set(rounds.map((r) => r.at));
    for (const span of spans) {
      if (span.openedAt === COMPLETION_WEEKS_FROM.at || roundStartOpens.has(span.openedAt))
        continue;
      expect([0, 6]).toContain(new Date(span.openedAt).getDay());
    }
    if (open && open.openedAt !== COMPLETION_WEEKS_FROM.at && !roundStartOpens.has(open.openedAt)) {
      expect([0, 6]).toContain(new Date(open.openedAt).getDay());
    }
  });
});

test.describe('#14 — pending: the gap is visible to callers even with 0 sessions', () => {
  // Sep 27 2026 · WK1 fix r2 (checker must #2). Without this, WK2 would have
  // to re-derive the boundary itself while querying mid-gap, and disagree
  // with what week.ts reports once the first session actually lands.
  test('Fri close, then a query on Sat with no session yet: Week 6 pending, opening that Saturday', () => {
    const sessions: SessionLite[] = [
      { id: 'A1', date: '2026-09-27T10:00:00+03:00', workout: 'A' }, // Sun
      { id: 'B1', date: '2026-09-28T10:00:00+03:00', workout: 'B' }, // Mon
      { id: 'C1', date: '2026-10-02T10:00:00+03:00', workout: 'C' }, // Fri — closes Wk5
    ];
    const { spans, open, pending } = walkWeeks(sessions, [], []);

    expect(spans).toHaveLength(1);
    expect(open).toBeNull();
    expect(pending).not.toBeNull();
    expect(pending?.key).toEqual({ round: 2, week: 6 });
    expect(pending?.opensAt).toBe('2026-10-03T00:00:00+03:00'); // the Saturday right after the Fri close

    // What a caller reading `pending` mid-gap would show (day count from
    // opensAt) must match what week.ts itself will report once a session
    // finally lands — must #1's fix uses this exact same frozen value.
    const asOpenSpan: WeekSpan = {
      key: pending!.key,
      openedAt: pending!.opensAt,
      closedAt: null,
      how: null,
      sessions: [],
      done: [],
      missing: ['A', 'B', 'C'],
    };
    expect(dayOfWeek(asOpenSpan, new Date('2026-10-03T12:00:00+03:00'))).toBe(1);
  });

  test('pending is null once a week is actually open (no gap)', () => {
    const { open, pending } = walkWeeks([], [], []);
    expect(open).not.toBeNull(); // the launch instant, open immediately
    expect(pending).toBeNull();
  });
});
