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
  mergedSickSpans,
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
    // v62.1: explicit `now` after the start (a future start is not applied yet)
    const now = new Date('2026-10-07T12:00:00+03:00');
    const { spans, open } = walkWeeks(sessions, [], rounds, COMPLETION_WEEKS_FROM, [], now);

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

    // v62.1: `now` is explicit and AFTER the round start - a round start still in
    // the future no longer moves the clock, and the real wall clock must not decide.
    const now = new Date('2026-11-03T12:00:00+02:00');
    const { spans, open } = walkWeeks(sessions, [], rounds, COMPLETION_WEEKS_FROM, [], now);

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

// v61.2 (Oct 13 2026) — a Sick week pauses the completion clock. Real-shaped:
// Week 5 had B (Sep 26), A (Sep 28), a B-labeled hike (Oct 1); C never came.
// (D never reaches walkWeeks — app.ts drops it first.)
test.describe('#13 — a Sick week pauses the clock (v61.2)', () => {
  const NOW = new Date('2026-10-13T12:00:00+03:00');
  const WEEK5: SessionLite[] = [
    { id: 'b1', date: '2026-09-26T22:45:00+03:00', workout: 'B' },
    { id: 'a1', date: '2026-09-28T18:00:00+03:00', workout: 'A' },
    { id: 'b2', date: '2026-10-01T10:00:00+03:00', workout: 'B' },
  ];

  test('Week 5 closes as "sick" at the start of the sick week, C stays missing', () => {
    const { spans } = walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, ['2026-10-03'], NOW);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.key).toEqual({ round: 2, week: 5 });
    expect(spans[0]!.how).toBe('sick');
    expect(spans[0]!.closedAt!.startsWith('2026-10-03T00:00:00')).toBe(true);
    expect(spans[0]!.done).toEqual(['A', 'B']);
    expect(spans[0]!.missing).toEqual(['C']);
  });

  test('Week 6 opens immediately on Sat Oct 10 with no session and no Move on', () => {
    const { open, pending } = walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, ['2026-10-03'], NOW);
    expect(open).not.toBeNull();
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(open!.openedAt.startsWith('2026-10-10T00:00:00')).toBe(true);
    expect(open!.sessions).toEqual([]);
    expect(pending).toBeNull();
    expect(dayOfWeek(open!, new Date('2026-10-13T12:00:00+03:00'))).toBe(4);
  });

  test('a session in Week 6 counts to Week 6, not back to Week 5', () => {
    const wk6 = { id: 'x1', date: '2026-10-12T09:00:00+03:00', workout: 'A' as const };
    const { spans, open, weekOf } = walkWeeks(
      [...WEEK5, wk6],
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      NOW
    );
    expect(weekOf.get('x1')).toEqual({ round: 2, week: 6 });
    expect(spans[0]!.sessions.map((s) => s.id)).toEqual(['b1', 'a1', 'b2']);
    expect(open!.done).toEqual(['A']);
  });

  test('a session INSIDE the sick week counts back to the week that closed', () => {
    const sickDay = { id: 's1', date: '2026-10-05T09:00:00+03:00', workout: 'C' as const };
    const { spans, weekOf } = walkWeeks(
      [...WEEK5, sickDay],
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      NOW
    );
    expect(weekOf.get('s1')).toEqual({ round: 2, week: 5 });
    expect(spans[0]!.done).toEqual(['A', 'B', 'C']);
  });

  test('CONTROL: with no sick week, the same sessions leave Week 5 open (unchanged)', () => {
    const { spans, open } = walkWeeks(WEEK5, [], []);
    expect(spans).toEqual([]);
    expect(open!.key).toEqual({ round: 2, week: 5 });
    expect(open!.missing).toEqual(['C']);
    // and an explicit empty list is byte-identical to omitting it
    expect(walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, [])).toEqual(walkWeeks(WEEK5, [], []));
  });

  test('general, not Oct-only: a later sick week pauses the same way; the July one (pre-launch) is ignored', () => {
    const { spans, open } = walkWeeks(
      WEEK5,
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-07-11', '2026-11-07'],
      new Date('2026-12-01T12:00:00+02:00')
    );
    // Nov 7 is after every session: Week 5 closes 'sick' there, Week 6 opens Nov 14.
    expect(spans[0]!.how).toBe('sick');
    expect(spans[0]!.closedAt!.startsWith('2026-11-07')).toBe(true);
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(open!.openedAt.startsWith('2026-11-14')).toBe(true);
  });

  test('a sick week after a Mon-Fri close delays the next week to the end of the sick span', () => {
    const three: SessionLite[] = [
      { id: 'c1', date: '2026-09-27T10:00:00+03:00', workout: 'A' },
      { id: 'c2', date: '2026-09-28T10:00:00+03:00', workout: 'B' },
      { id: 'c3', date: '2026-09-29T10:00:00+03:00', workout: 'C' }, // Tue — gap until Sat
    ];
    const { spans, open } = walkWeeks(three, [], [], COMPLETION_WEEKS_FROM, ['2026-10-03'], NOW);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.how).toBe('three');
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(open!.openedAt.startsWith('2026-10-10')).toBe(true);
  });

  test('time-aware: before the sick week the clock is untouched; inside it, Week 6 is pending', () => {
    const before = walkWeeks(
      WEEK5,
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      new Date('2026-10-02T12:00:00+03:00')
    );
    expect(before.spans).toEqual([]);
    expect(before.open!.key).toEqual({ round: 2, week: 5 });
    const during = walkWeeks(
      WEEK5,
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      new Date('2026-10-06T12:00:00+03:00')
    );
    expect(during.spans[0]!.how).toBe('sick');
    expect(during.open).toBeNull();
    expect(during.pending!.key).toEqual({ round: 2, week: 6 });
    expect(during.pending!.opensAt.startsWith('2026-10-10')).toBe(true);
  });

  test('two CONTIGUOUS sick weeks are one held span: Week 6 opens Oct 17, not inside the second', () => {
    const now = new Date('2026-10-20T12:00:00+03:00');
    const sick = ['2026-10-03', '2026-10-10'];
    const { spans, open } = walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, sick, now);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.how).toBe('sick');
    expect(spans[0]!.closedAt!.startsWith('2026-10-03')).toBe(true);
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(open!.openedAt.startsWith('2026-10-17')).toBe(true);
    // order of the list doesn't matter
    expect(walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, [...sick].reverse(), now)).toEqual(
      walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, sick, now)
    );
    // inside the second sick week, Week 6 is pending until Oct 17
    const during = walkWeeks(
      WEEK5,
      [],
      [],
      COMPLETION_WEEKS_FROM,
      sick,
      new Date('2026-10-12T12:00:00+03:00')
    );
    expect(during.open).toBeNull();
    expect(during.pending!.opensAt.startsWith('2026-10-17')).toBe(true);
  });

  test('two NON-contiguous sick weeks each hold separately (Oct 3 and Oct 24)', () => {
    const sick = ['2026-10-03', '2026-10-24'];
    const wk6 = { id: 'y1', date: '2026-10-11T10:00:00+03:00', workout: 'A' as const };
    const now = new Date('2026-11-05T12:00:00+02:00');
    const { spans, open } = walkWeeks([...WEEK5, wk6], [], [], COMPLETION_WEEKS_FROM, sick, now);
    expect(spans.map((sp) => [sp.key.week, sp.how])).toEqual([
      [5, 'sick'],
      [6, 'sick'],
    ]);
    expect(spans[1]!.closedAt!.startsWith('2026-10-24')).toBe(true);
    expect(spans[1]!.done).toEqual(['A']);
    expect(open!.key).toEqual({ round: 2, week: 7 });
    expect(open!.openedAt.startsWith('2026-10-31')).toBe(true);
  });

  test('mergedSickSpans joins contiguous and overlapping weeks only', () => {
    const m = mergedSickSpans(['2026-10-10', '2026-10-03', '2026-10-24']);
    expect(m).toHaveLength(2);
    expect(m[0]!.start.getDate()).toBe(3);
    expect(m[0]!.end.getDate()).toBe(17);
    expect(m[1]!.start.getDate()).toBe(24);
  });

  test('shiftPastSickWeeks (the plan-date lookup) agrees: one sick week -> Oct 10, two -> Oct 17, none -> unchanged', () => {
    // Step 5c deleted shiftPastSickWeeks: the plan row is found by week KEY now,
    // so nothing needs a "shifted date". What this test pinned was where Week 6
    // starts after N sick weeks; that is the clock's answer, asserted directly.
    const week6Opens = (sick: string[], now = new Date('2026-12-01T12:00:00+02:00')): string =>
      walkWeeks([], [], [], COMPLETION_WEEKS_FROM, sick, now).open!.openedAt.slice(0, 10);
    expect(week6Opens(['2026-10-03'])).toBe('2026-10-10');
    expect(week6Opens(['2026-10-10', '2026-10-03'])).toBe('2026-10-17');
    // none: Week 5 is still the open week (the launch instant), nothing shifted
    const none = walkWeeks(
      [],
      [],
      [],
      COMPLETION_WEEKS_FROM,
      [],
      new Date('2026-12-01T12:00:00+02:00')
    );
    expect(none.open!.key).toEqual({ round: 2, week: 5 });
    // a sick week before the launch (July, Round 1) never counts
    const july = walkWeeks(
      [],
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-07-11'],
      new Date('2026-12-01T12:00:00+02:00')
    );
    expect(july.spans).toEqual([]);
    expect(july.open!.key).toEqual({ round: 2, week: 5 });
  });
});

// Step 5b (Oct 13 2026) — the sick pause is merged into closed [start, end)
// intervals BEFORE the walk. These are property-style tests: a deterministic
// generator (mulberry32, fixed seed), 200 cases per property, so a failure
// reproduces exactly. The example tests above stay the readable spec; these
// pin what must hold for ANY set of sick Saturdays.
test.describe('#15 — sick pause as intervals: property tests (step 5b)', () => {
  const SEED = 20261013;
  const CASES = 200;

  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const int = (r: () => number, lo: number, hi: number): number =>
    lo + Math.floor(r() * (hi - lo + 1));
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const ymd = (d: Date): string =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  /** The i-th Saturday on/after Sat Oct 3 2026 (local), as 'YYYY-MM-DD'. */
  const satStr = (i: number): string => ymd(new Date(2026, 9, 3 + 7 * i));
  const localDate = (ymdStr: string, plusDays = 0): Date => {
    const [y, m, d] = ymdStr.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d + plusDays);
  };
  const shuffle = <T>(r: () => number, xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(r, 0, i);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  /** Sessions between the launch and `before` (exclusive) using only two
   *  distinct letters, so the week open at `before` never closes by itself. */
  function shortWeekSessions(r: () => number, before: Date): SessionLite[] {
    const letters = pick(r, [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'C'],
    ] as const);
    const first = new Date(2026, 8, 27, 9);
    const hours = Math.max(1, Math.floor((before.getTime() - first.getTime()) / 3_600_000) - 1);
    return Array.from({ length: int(r, 1, 4) }, (_, i) => ({
      id: `p${i}`,
      date: new Date(first.getTime() + int(r, 0, hours) * 3_600_000).toISOString(),
      workout: pick(r, letters),
    }));
  }
  const NOW_FAR = new Date(2027, 1, 15, 12);

  test('any set of sick Saturdays, in any order, with duplicates, gives the same walk as its sorted de-duplicated set', () => {
    const r = rng(SEED);
    const allSats = [
      '2026-08-29',
      '2026-09-12',
      '2026-09-19', // before the launch: ignored
      ...Array.from({ length: 12 }, (_, i) => satStr(i)),
    ];
    for (let c = 0; c < CASES; c++) {
      const sessions: SessionLite[] = Array.from({ length: int(r, 0, 10) }, (_, i) => ({
        id: `q${i}`,
        date: new Date(2026, 8, 27 + int(r, 0, 80), int(r, 0, 23), int(r, 0, 59)).toISOString(),
        workout: pick(r, ['A', 'B', 'C'] as const),
      }));
      const chosen = Array.from({ length: int(r, 0, 5) }, () => pick(r, allSats));
      const messy = shuffle(r, [...chosen, ...chosen.slice(0, int(r, 0, chosen.length))]);
      const clean = [...new Set(chosen)].sort();
      const now = new Date(2026, 8, 27 + int(r, 0, 100), int(r, 0, 23));
      const a = walkWeeks(sessions, [], [], COMPLETION_WEEKS_FROM, messy, now);
      const b = walkWeeks(sessions, [], [], COMPLETION_WEEKS_FROM, clean, now);
      expect(a, `case ${c}: ${JSON.stringify(messy)} vs ${JSON.stringify(clean)}`).toEqual(b);
    }
  });

  test('two consecutive sick weeks reopen ONCE, at the end of the second', () => {
    const r = rng(SEED + 1);
    for (let c = 0; c < CASES; c++) {
      const i = int(r, 0, 8);
      const s1 = satStr(i);
      const s2 = satStr(i + 1);
      const sessions = shortWeekSessions(r, localDate(s1));
      const sick = r() < 0.5 ? [s1, s2] : [s2, s1, s2];
      const { spans, open, pending } = walkWeeks(
        sessions,
        [],
        [],
        COMPLETION_WEEKS_FROM,
        sick,
        NOW_FAR
      );
      const sickSpans = spans.filter((sp) => sp.how === 'sick');
      expect(sickSpans, `case ${c} at ${s1}`).toHaveLength(1);
      expect(new Date(sickSpans[0]!.closedAt!).getTime()).toBe(localDate(s1).getTime());
      expect(spans).toHaveLength(1);
      // the next week opens once, empty, the day the second sick week ends
      expect(open!.key).toEqual({ round: 2, week: 6 });
      expect(new Date(open!.openedAt).getTime()).toBe(localDate(s2, 7).getTime());
      expect(open!.sessions).toEqual([]);
      expect(pending).toBeNull();
    }
  });

  test('non-contiguous sick weeks (a clear week between) hold separately', () => {
    const r = rng(SEED + 2);
    for (let c = 0; c < CASES; c++) {
      const i = int(r, 0, 4);
      const j = i + int(r, 2, 5); // at least one free week between the two
      const [s1, s2] = [satStr(i), satStr(j)];
      const sessions = shortWeekSessions(r, localDate(s1));
      const { spans, open } = walkWeeks(
        sessions,
        [],
        [],
        COMPLETION_WEEKS_FROM,
        shuffle(r, [s2, s1]),
        NOW_FAR
      );
      expect(
        spans.map((sp) => [sp.key.week, sp.how]),
        `case ${c}: ${s1} ${s2}`
      ).toEqual([
        [5, 'sick'],
        [6, 'sick'],
      ]);
      expect(new Date(spans[0]!.closedAt!).getTime()).toBe(localDate(s1).getTime());
      expect(new Date(spans[1]!.closedAt!).getTime()).toBe(localDate(s2).getTime());
      expect(new Date(spans[1]!.openedAt).getTime()).toBe(localDate(s1, 7).getTime());
      expect(open!.key).toEqual({ round: 2, week: 7 });
      expect(new Date(open!.openedAt).getTime()).toBe(localDate(s2, 7).getTime());
    }
  });

  test('a session inside a sick interval lands in the week that closed', () => {
    const r = rng(SEED + 3);
    for (let c = 0; c < CASES; c++) {
      const i = int(r, 0, 6);
      const weeks = int(r, 1, 3); // 1-3 back-to-back sick weeks = one interval
      const sick = Array.from({ length: weeks }, (_, k) => satStr(i + k));
      const sessions = shortWeekSessions(r, localDate(sick[0]!));
      const insideAt = new Date(
        localDate(sick[0]!).getTime() + int(r, 0, weeks * 7 * 24 - 1) * 3_600_000
      );
      const inside: SessionLite = {
        id: 'inside',
        date: insideAt.toISOString(),
        workout: pick(r, ['A', 'B', 'C'] as const),
      };
      const { spans, weekOf } = walkWeeks(
        [...sessions, inside],
        [],
        [],
        COMPLETION_WEEKS_FROM,
        sick,
        NOW_FAR
      );
      expect(
        weekOf.get('inside'),
        `case ${c}: ${insideAt.toISOString()} in ${sick.join(',')}`
      ).toEqual({ round: 2, week: 5 });
      expect(spans[0]!.how).toBe('sick');
      expect(spans[0]!.sessions.map((s) => s.id)).toContain('inside');
    }
  });

  test('a week closed Mon-Fri just before a sick interval: nothing opens until the interval ends; sessions inside count back', () => {
    const r = rng(SEED + 5);
    for (let c = 0; c < CASES; c++) {
      const i = int(r, 0, 6);
      const weeks = int(r, 1, 3);
      const sick = Array.from({ length: weeks }, (_, k) => satStr(i + k));
      const prevSat = localDate(sick[0]!, -7);
      // three distinct letters on three weekdays (Mon-Fri) of the week before: it closes by itself
      const days = [...new Set([int(r, 2, 6), int(r, 2, 6), int(r, 2, 6)])].sort();
      while (days.length < 3) days.push(Math.min(6, days[days.length - 1]! + 1));
      const letters = shuffle(r, ['A', 'B', 'C'] as const);
      const closing: SessionLite[] = days.map((d, k) => ({
        id: `c${k}`,
        date: new Date(
          prevSat.getFullYear(),
          prevSat.getMonth(),
          prevSat.getDate() + d,
          18
        ).toISOString(),
        workout: letters[k]!,
      }));
      if (new Date(closing[0]!.date).getTime() < new Date(COMPLETION_WEEKS_FROM.at).getTime())
        continue;
      const insideAt = new Date(
        localDate(sick[0]!).getTime() + int(r, 0, weeks * 7 * 24 - 1) * 3_600_000
      );
      const inside: SessionLite = { id: 'inside', date: insideAt.toISOString(), workout: 'A' };
      const { spans, open } = walkWeeks(
        [...closing, inside],
        [],
        [],
        COMPLETION_WEEKS_FROM,
        sick,
        NOW_FAR
      );
      expect(spans, `case ${c}`).toHaveLength(1);
      expect(spans[0]!.how).toBe('three');
      expect(
        spans[0]!.sessions.map((x) => x.id),
        `case ${c}`
      ).toContain('inside');
      expect(open!.key).toEqual({ round: 2, week: 6 });
      expect(new Date(open!.openedAt).getTime()).toBe(localDate(sick[weeks - 1]!, 7).getTime());
    }
  });

  test('no sick weeks (none, all before the launch, or all after now) = byte-identical to the no-sick walk', () => {
    const r = rng(SEED + 4);
    for (let c = 0; c < CASES; c++) {
      const sessions: SessionLite[] = Array.from({ length: int(r, 0, 12) }, (_, i) => ({
        id: `n${i}`,
        date: new Date(2026, 8, 27 + int(r, 0, 70), int(r, 0, 23), int(r, 0, 59)).toISOString(),
        workout: pick(r, ['A', 'B', 'C'] as const),
      }));
      const now = new Date(2026, 9, 1 + int(r, 0, 60), 12);
      const plain = walkWeeks(sessions, [], [], COMPLETION_WEEKS_FROM, [], now);
      const preLaunch = walkWeeks(
        sessions,
        [],
        [],
        COMPLETION_WEEKS_FROM,
        ['2026-08-29', '2026-09-19'],
        now
      );
      const afterNow = walkWeeks(
        sessions,
        [],
        [],
        COMPLETION_WEEKS_FROM,
        [ymd(new Date(now.getTime() + 8 * 86_400_000))],
        now
      );
      expect(JSON.stringify(preLaunch), `case ${c} (pre-launch)`).toBe(JSON.stringify(plain));
      expect(JSON.stringify(afterNow), `case ${c} (after now)`).toBe(JSON.stringify(plain));
      expect(plain.spans.every((sp) => sp.how !== 'sick')).toBe(true);
    }
  });
});

// Step 5f (Oct 13 2026) — hardening after the 5b double check. Both independent
// checkers asked for: a bad sick-week key must not break the merge of the weeks
// around it, an Invalid `now` must be handled on purpose, and the two exact
// sick EDGES (a session at 00:00 on the first Saturday, and at 00:00 on the
// reopening Saturday) pinned as plain examples, so flipping the `<=` that
// applies an edge to `<` fails a named test instead of passing silently.
test.describe('#16 — sick pause hardening (step 5f)', () => {
  const NOW = new Date('2026-10-13T12:00:00+03:00');
  const WEEK5: SessionLite[] = [
    { id: 'b1', date: '2026-09-26T22:45:00+03:00', workout: 'B' },
    { id: 'a1', date: '2026-09-28T18:00:00+03:00', workout: 'A' },
    { id: 'b2', date: '2026-10-01T10:00:00+03:00', workout: 'B' },
  ];

  test('mergedSickSpans drops a key that is not a real YYYY-MM-DD date (warns), and the weeks around it still merge', () => {
    withWarnSpy((warnings) => {
      // '2026-10-1x' sorts BETWEEN 10-10 and 10-17: unguarded it became an
      // Invalid Date span and stopped 10-10 and 10-17 from joining.
      const m = mergedSickSpans(['2026-10-03', '2026-10-10', '2026-10-1x', '2026-10-17']);
      expect(m).toHaveLength(1);
      expect([m[0]!.start.getMonth(), m[0]!.start.getDate()]).toEqual([9, 3]);
      expect([m[0]!.end.getMonth(), m[0]!.end.getDate()]).toEqual([9, 24]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('2026-10-1x');
    });
    withWarnSpy((warnings) => {
      const bad = ['', 'Oct 3', '2026-10-3', '2026-13-01', '2026-02-30', '2026-10-03T00:00', 'x'];
      expect(mergedSickSpans(bad)).toEqual([]);
      expect(warnings).toHaveLength(bad.length);
      // no Invalid Date ever comes out
      const m = mergedSickSpans(['2026-10-03', ...bad]);
      expect(m).toHaveLength(1);
      expect(Number.isNaN(m[0]!.start.getTime())).toBe(false);
      expect(Number.isNaN(m[0]!.end.getTime())).toBe(false);
    });
  });

  test('walkWeeks with a bad sick-week key among good ones walks exactly as with the good ones alone', () => {
    withWarnSpy(() => {
      const good = walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, ['2026-10-03'], NOW);
      const mixed = walkWeeks(
        WEEK5,
        [],
        [],
        COMPLETION_WEEKS_FROM,
        ['2026-10-03', 'garbage', '2026-02-30'],
        NOW
      );
      expect(mixed).toEqual(good);
    });
  });

  test('an Invalid `now` is handled on purpose: warn, plain walk (no sick pause), never a throw', () => {
    withWarnSpy((warnings) => {
      const bad = walkWeeks(
        WEEK5,
        [],
        [],
        COMPLETION_WEEKS_FROM,
        ['2026-10-03'],
        new Date('not a date')
      );
      const plain = walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, [], NOW);
      expect(bad.spans).toEqual(plain.spans);
      expect(bad.open).toEqual(plain.open);
      expect(bad.pending).toEqual(plain.pending);
      expect(warnings.some((w) => w.includes('Invalid `now`'))).toBe(true);
    });
    // no sick weeks listed -> nothing to ignore, nothing to warn about
    withWarnSpy((warnings) => {
      walkWeeks(WEEK5, [], [], COMPLETION_WEEKS_FROM, [], new Date('not a date'));
      expect(warnings).toEqual([]);
    });
  });

  test('EDGE TIE (start): a C dated exactly 2026-10-03T00:00:00+03:00 counts back to Week 5, which closed "sick" at that instant', () => {
    const edgeC: SessionLite = { id: 'c-edge', date: '2026-10-03T00:00:00+03:00', workout: 'C' };
    const { spans, open, weekOf } = walkWeeks(
      [...WEEK5, edgeC],
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      NOW
    );
    expect(weekOf.get('c-edge')).toEqual({ round: 2, week: 5 });
    // The pause is applied BEFORE the session at its own instant, so Week 5 did
    // not reach 'three' by this C: it closed 'sick' and the C counted back.
    expect(spans[0]!.how).toBe('sick');
    expect(spans[0]!.closedAt).toBe('2026-10-03T00:00:00+03:00');
    expect(spans[0]!.sessions.map((s) => s.id)).toEqual(['b1', 'a1', 'b2', 'c-edge']);
    expect(open!.key).toEqual({ round: 2, week: 6 });
  });

  test('EDGE TIE (end): a session dated exactly 2026-10-10T00:00:00+03:00 opens Week 6 at that very edge', () => {
    const edgeA: SessionLite = { id: 'a-edge', date: '2026-10-10T00:00:00+03:00', workout: 'A' };
    const { spans, open, weekOf } = walkWeeks(
      [...WEEK5, edgeA],
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      NOW
    );
    expect(weekOf.get('a-edge')).toEqual({ round: 2, week: 6 });
    expect(spans).toHaveLength(1);
    expect(spans[0]!.sessions.map((s) => s.id)).toEqual(['b1', 'a1', 'b2']); // not back in Week 5
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(open!.openedAt).toBe('2026-10-10T00:00:00+03:00');
    expect(open!.sessions.map((s) => s.id)).toEqual(['a-edge']);
  });

  test('a clock at exactly the first sick instant is already paused (Week 6 pending, not Week 5 open)', () => {
    const atEdge = new Date('2026-10-03T00:00:00+03:00');
    const { spans, open, pending } = walkWeeks(
      WEEK5,
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      atEdge
    );
    expect(spans[0]!.how).toBe('sick');
    expect(open).toBeNull();
    expect(pending!.key).toEqual({ round: 2, week: 6 });
    expect(pending!.opensAt).toBe('2026-10-10T00:00:00+03:00');
  });

  test('a clock at exactly the reopening instant has Week 6 open (pending gone)', () => {
    const atEnd = new Date('2026-10-10T00:00:00+03:00');
    const { open, pending } = walkWeeks(
      WEEK5,
      [],
      [],
      COMPLETION_WEEKS_FROM,
      ['2026-10-03'],
      atEnd
    );
    expect(open!.key).toEqual({ round: 2, week: 6 });
    expect(pending).toBeNull();
  });
});

// v62.1 (Oct 14 2026) — a ROUNDS entry dated in the FUTURE must not move the
// clock until its date. walkWeeks used to apply every RoundStart after the
// launch whatever `now` was, so adding Round 3 to ROUNDS a week early would
// have jumped the Home screen to "Round 3 Week 1" at once.
test.describe('v62.1 — a future round start takes effect on its date, not at once', () => {
  const R3: RoundStart[] = [{ round: 3, at: '2026-11-28T00:00:00+02:00' }];

  test('before its date: the walk is exactly as if the round did not exist', () => {
    const now = new Date('2026-11-01T12:00:00+02:00');
    const without = walkWeeks([], [], [], COMPLETION_WEEKS_FROM, [], now);
    const withR3 = walkWeeks([], [], R3, COMPLETION_WEEKS_FROM, [], now);
    expect(withR3.open?.key).toEqual(without.open?.key);
    expect(withR3.open?.key).toEqual({ round: 2, week: 5 });
    expect(withR3.spans).toEqual(without.spans);
  });

  test('on its date (the instant itself): Round 3 Week 1 opens and Round 2 closes as round_ended', () => {
    const now = new Date('2026-11-28T00:00:00+02:00');
    const { open, spans } = walkWeeks([], [], R3, COMPLETION_WEEKS_FROM, [], now);
    expect(open?.key).toEqual({ round: 3, week: 1 });
    expect(spans.at(-1)?.how).toBe('round_ended');
  });

  test('one minute before its instant it is still not applied', () => {
    const now = new Date('2026-11-27T23:59:00+02:00');
    const { open } = walkWeeks([], [], R3, COMPLETION_WEEKS_FROM, [], now);
    expect(open?.key).toEqual({ round: 2, week: 5 });
  });

  test('a session logged before the round date still counts in Round 2 once the date has passed', () => {
    const s: SessionLite[] = [{ id: 'x1', date: '2026-11-20T10:00:00+02:00', workout: 'A' }];
    const now = new Date('2026-12-01T12:00:00+02:00');
    const { weekOf, open } = walkWeeks(s, [], R3, COMPLETION_WEEKS_FROM, [], now);
    expect(weekOf.get('x1')).toEqual({ round: 2, week: 5 });
    expect(open?.key).toEqual({ round: 3, week: 1 });
  });
});
