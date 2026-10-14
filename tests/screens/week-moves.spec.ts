// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate, ignoreSickWeeks, PLAIN_WEEK5_HANDOVER } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// WK3 (Sep 27 2026) — PLAN-2026-09-26.md §2.4/§10: "Move on without it" +
// week_moves + sync + Undo. Her words, 21:24: "dont go to next week till i
// approve" — the button is quiet and explicit, never automatic. Fixture
// shape matches week.test.ts's own #11 canMoveOn tests exactly (same real
// launch instant, same day-7/day-8 boundary) so the UI and the pure module
// agree on the same real dates.
test.describe('WK3 · "Move on without it" + week_moves', () => {
  type Row = Record<string, unknown>;

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };

  const readWeekMoves = async (page: Page): Promise<Row[]> => {
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:week-moves'));
    return JSON.parse(raw ?? '[]') as Row[];
  };

  const log = (id: string, date: string, workout: 'A' | 'B' | 'C'): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    // Sep 27 fix: these fixture sessions are seeded already-synced (the
    // convention every other describe block in this file uses, e.g. line
    // 5115/7300) — this block is testing the week_moves queue in isolation,
    // not the unrelated session-log queue, so an unsynced seed row was
    // double-counting into #sync-indicator's "N pending" and breaking the
    // one test that reads it (WK3's own offline-queue test).
    synced: true,
  });

  // Week 5 opens at the real launch instant (Sat Sep 26 2026 22:30 +03:00).
  // An A the next day + a B two days later leave it at 2 of 3, missing only
  // C — done.length > 0 and < 3 is canMoveOn's own gate.
  const TWO_DONE = [
    log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
    log('wk5-b', '2026-09-29T10:00:00+03:00', 'B'),
  ];
  const DAY_7 = '2026-10-02T12:00:00+03:00'; // Fri — canMoveOn's own "hidden" day
  const DAY_8 = '2026-10-03T12:00:00+03:00'; // Sat — canMoveOn's own "shown" day

  test('hidden on day 7, even with 2 of 3 done', async ({ page }) => {
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_7);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    // v61 (Sep 28 2026), spec item d: "of 4" now — no D logged in this seed.
    await expect(page.locator('.week-line')).toContainText('2 of 4');
    await expect(page.locator('#week-move-on')).toHaveCount(0);
  });

  test('shown on day 8 with 2 of 3 done — "Move on to Week 6 without C"', async ({ page }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 6 without C');
  });

  test('v61.2: a week that reopened after a Sick week can be moved on from — Week 6 on day 9, "Move on to Week 7 without C"', async ({
    page,
  }) => {
    // The Oct 3-9 Sick week closed Week 5 and opened Week 6 on Sat Oct 10 (no
    // tap). Week 6 opened at Oct 10 00:00, so Sun Oct 18 is day 9: A + B done,
    // C missing -> the quiet button shows, and tapping it opens Week 7.
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk6-a', '2026-10-11T10:00:00+03:00', 'A'),
      log('wk6-b', '2026-10-13T10:00:00+03:00', 'B'),
    ]);
    await mockDate(page, '2026-10-18T12:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 7 without C');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 7');
  });

  test('never shown at 0 done, even well past day 8', async ({ page }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    // No logs seeded at all — Week 5 sits at 0 of 3.
    await mockDate(page, '2026-10-16T12:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('0 of 4');
    await expect(page.locator('#week-move-on')).toHaveCount(0);
  });

  test('tap → Week 6 opens; the moved-note + Undo appear under the header', async ({ page }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    // Day 8 (Sat) is itself an anchor day, so Week 6 opens immediately as the
    // live open week — not a pending gap (§2.4's #week-count table).
    await expect(page.locator('.week-line')).toContainText('0 of 4');
    await expect(page.locator('#week-moved-note')).toContainText('Week 5 closed at 2 of 3');
    await expect(page.locator('#week-undo')).toBeVisible();
  });

  test('a WEEKDAY tap: Week 6 is next but stays a gap until the coming Saturday — the note says so', async ({
    page,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    // Checker's should #3: every other WK3 test in this file taps on a
    // Saturday (DAY_8 itself is an anchor day, so Week 6 opens immediately).
    // canMoveOn only requires day 8+, not day 8 exactly — a tap on day 10
    // (still ≥8, but a Monday) is exactly as real. week.ts's own anchor rule
    // (her rule 1, "a week always has to start Sat or Sun") means the close
    // still happens right on her tap, but Week 6 doesn't OPEN until the next
    // Sat/Sun — this is NOT a decided-here behavior change (that's the
    // checker's "ask her": should a tap instead open immediately, like a
    // Round start?) — this test locks in what's actually built today and
    // proves the gap sub-label is honest about the wait, so nothing here
    // silently promises an immediate Week 6 that isn't real yet.
    const MONDAY_DAY_10 = '2026-10-05T12:00:00+03:00'; // Mon, day 10 (≥ day 8)
    await seedLogs(page, TWO_DONE);
    await mockDate(page, MONDAY_DAY_10);
    await page.goto('/');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 6 without C');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    // Week 6's NUMBER is assigned, but it's a gap, not a live open week —
    // the sub-label must say when it actually opens and where a session
    // logged now would count.
    await expect(page.locator('#week-sub')).toContainText('opens Sat');
    await expect(page.locator('#week-sub')).toContainText('counts as an extra for Week 5');
    await expect(page.locator('.week-line')).toContainText('0 of 4');
    // The button itself only ever renders on a LIVE open week (canMoveOn
    // needs a span) — during the gap there's nothing left to move on from.
    await expect(page.locator('#week-move-on')).toHaveCount(0);
    // The moved-note is still about today's real close (Week 5, moved_on) —
    // that part doesn't change just because Week 6 hasn't opened yet.
    await expect(page.locator('#week-moved-note')).toContainText('Week 5 closed at 2 of 3');
  });

  test('Undo → back to Week 5 open, "Move on" reappears (tombstone queued, not silently dropped)', async ({
    page,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    await page.locator('#week-undo').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('2 of 4');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 6 without C');
    await expect(page.locator('#week-moved-note')).toHaveCount(0);
    // WK3 fix r1 (checker must #1): Undo no longer just empties the row —
    // it queues a delete tombstone the same way any other write in this app
    // queues offline (real sync is off under automation). See the dedicated
    // race test right below for why a plain empty-out was the actual bug.
    const moves = await readWeekMoves(page);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['round']).toBe(2);
    expect(moves[0]?.['week']).toBe(5);
    expect(moves[0]?.['deleted']).toBe(true);
    expect(moves[0]?.['synced']).toBe(false);
  });

  test('Undo holds even after a pull still carrying the row it undid — the tombstone outranks it', async ({
    page,
    context,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    // Checker's exact race (must #1): "If she tapped Move on while online (so
    // the row reached Supabase), then taps Undo while offline, or the DELETE
    // fails, the next pull ... merges the remote row back in as
    // synced:true. The week moves on again with no tap." Simulate the
    // "reached Supabase" half by hand (real sync is off under automation),
    // then prove the merge + a reopen both still show Week 5.
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');

    // Mark the row synced — as if the push had already reached Supabase
    // before she tapped Undo.
    await page.evaluate(() => {
      const raw = localStorage.getItem('workout-tracker:week-moves');
      const moves = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
      moves[0]!['synced'] = true;
      localStorage.setItem('workout-tracker:week-moves', JSON.stringify(moves));
    });

    await page.locator('#week-undo').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    const afterUndo = await readWeekMoves(page);
    expect(afterUndo).toHaveLength(1);
    expect(afterUndo[0]?.['deleted']).toBe(true);
    expect(afterUndo[0]?.['synced']).toBe(false);

    // Feed a remote pull that STILL has the row (the DELETE hadn't landed
    // yet) through the real, pure merge function — the tombstone must win,
    // exactly like any other unsynced local write already does.
    const merged = await page.evaluate((local) => {
      const w = window as unknown as {
        __wtMergeWeekMoves: (local: unknown[], remote: unknown[]) => unknown[];
      };
      return w.__wtMergeWeekMoves(local, [
        { round: 2, week: 5, moved_at: (local[0] as { at: string }).at, missing: 'C' },
      ]);
    }, afterUndo);
    expect(merged).toEqual(afterUndo); // the tombstone, not the resurrected remote row

    // Write that merged (still-tombstoned) result to localStorage and open a
    // fresh page (this file's beforeEach clears storage on ITS OWN page's
    // navigations only — a new page in the same context sees real storage,
    // same trick the offline-queue test above uses) — Week 5, not a
    // silently-resurrected Week 6.
    await page.evaluate((m) => {
      localStorage.setItem('workout-tracker:week-moves', JSON.stringify(m));
    }, merged);
    const reopened = await context.newPage();
    await mockDate(reopened, DAY_8);
    await reopened.goto('/');
    await expect(reopened.locator('.home-header h1')).toContainText('Week 5');
    await expect(reopened.locator('.week-line')).toContainText('2 of 4');
  });

  test('v62.2: an EMPTY week_moves pull clears a synced move - deleting the Supabase row reopens the week (empty is the normal state of this table)', async ({
    page,
    context,
  }) => {
    // Week 6 (opened Oct 10 by the Sick week), A + B done, moved on from at 2 of 3 on Sun Oct 18.
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk6-a', '2026-10-11T10:00:00+03:00', 'A'),
      log('wk6-b', '2026-10-13T10:00:00+03:00', 'B'),
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:week-moves',
        JSON.stringify([
          { round: 2, week: 6, at: '2026-10-18T10:00:00+03:00', missing: 'C', synced: true },
        ])
      );
    });
    await mockDate(page, '2026-10-18T12:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 7'); // the synced move holds
    // The server row was deleted (the tandem path); the next pull is EMPTY. Run the real merge.
    const merged = await page.evaluate(() => {
      const w = window as unknown as {
        __wtMergeWeekMoves: (local: unknown[], remote: unknown[]) => unknown[];
      };
      const local = JSON.parse(localStorage.getItem('workout-tracker:week-moves') ?? '[]');
      return w.__wtMergeWeekMoves(local, []);
    });
    expect(merged).toEqual([]);
    await page.evaluate((m) => {
      localStorage.setItem('workout-tracker:week-moves', JSON.stringify(m));
    }, merged);
    const reopened = await context.newPage();
    await mockDate(reopened, '2026-10-18T12:00:00+03:00');
    await reopened.goto('/');
    await expect(reopened.locator('.home-header h1')).toContainText('Week 6');
    await expect(reopened.locator('.week-line')).toContainText('2 of 4');
  });

  test('a stale move (a week that was never the open one) is ignored, not thrown', async ({
    page,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    // week.ts's own rule (§2.1): a move for a week that isn't the currently
    // open one is stale and is ignored with a console.warn, never a throw.
    // round 2 week 99 was never open at any point in this fixture's history
    // — the exact shape a stray/duplicate pull from another phone could
    // leave behind — so Week 5 must stay exactly as it was.
    await seedLogs(page, TWO_DONE);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:week-moves',
        JSON.stringify([
          { round: 2, week: 99, at: '2026-09-27T08:00:00+03:00', missing: 'C', synced: true },
        ])
      );
    });
    const errors: string[] = [];
    const warnings: string[] = [];
    // WK3 fix r1 (checker should #4): the listeners used to attach AFTER
    // page.goto() — a throw during the very first render would have already
    // happened and the test would still pass. Attach both before goto, and
    // actually assert the console.warn §2.1 requires, not just "no throw".
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    await mockDate(page, DAY_8);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('2 of 4');
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('ignoring a stale "move on"'))).toBe(true);
  });

  test('an offline tap queues (synced:false), survives a reload, and reconnecting never throws or drops it', async ({
    page,
    context,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    // Real sync is off under automation (never write to Supabase in tests) —
    // it stays pending exactly like a brand-new session saved offline would,
    // same as the edit-a-past-session offline test above.
    await expect(page.locator('#sync-indicator')).toHaveText('offline · 1 pending');

    const moves = await readWeekMoves(page);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['round']).toBe(2);
    expect(moves[0]?.['week']).toBe(5);
    expect(moves[0]?.['synced']).toBe(false);

    // Survives an app close — same trick the edit-offline test above uses: a
    // fresh page in the SAME context sees whatever real localStorage the tap
    // left behind (shared per-origin across pages in one context).
    const reopened = await context.newPage();
    const errors: string[] = [];
    reopened.on('pageerror', (e) => errors.push(String(e)));
    await mockDate(reopened, DAY_8);
    await reopened.goto('/');
    await expect(reopened.locator('#sync-indicator')).toHaveText('offline · 1 pending');
    await expect(reopened.locator('.home-header h1')).toContainText('Week 6');

    // Reconnecting fires the same flush a brand-new session's does
    // (flushPendingSyncs → pushWeekMove). No real network happens under
    // automation, so nothing here proves the server accepted it — this
    // proves the new routing doesn't throw or corrupt the queued row.
    await reopened.evaluate(() => window.dispatchEvent(new Event('online')));
    await reopened.waitForTimeout(200);
    expect(errors).toEqual([]);
    const movesAfter = await readWeekMoves(reopened);
    expect(movesAfter).toHaveLength(1);
    expect(movesAfter[0]?.['synced']).toBe(false);
  });

  test('the push payload + pure merge are exact (window hooks, no real network)', async ({
    page,
  }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const w = window as unknown as {
        __wtWeekMovePayload: (m: unknown) => unknown;
        __wtMergeWeekMoves: (local: unknown[], remote: unknown[]) => unknown[];
      };
      const payload = w.__wtWeekMovePayload({
        round: 2,
        week: 5,
        at: '2026-10-03T09:30:00+03:00',
        missing: 'C',
        synced: false,
      });
      // A remote row for a DIFFERENT week merges alongside an unsynced local
      // write for week 5 — the local unsynced write must win on content
      // (same "local unsynced wins" rule cycle_periods' merge already has).
      const merged = w.__wtMergeWeekMoves(
        [{ round: 2, week: 5, at: '2026-10-03T09:30:00+03:00', missing: 'C', synced: false }],
        [
          { round: 2, week: 5, moved_at: '2026-10-03T00:00:00+03:00', missing: 'BC' },
          { round: 2, week: 6, moved_at: '2026-10-11T00:00:00+03:00', missing: 'A' },
        ]
      );
      return { payload, merged };
    });
    expect(out.payload).toEqual({
      round: 2,
      week: 5,
      moved_at: '2026-10-03T09:30:00+03:00',
      missing: 'C',
    });
    expect(out.merged).toEqual([
      { round: 2, week: 5, at: '2026-10-03T09:30:00+03:00', missing: 'C', synced: false },
      { round: 2, week: 6, at: '2026-10-11T00:00:00+03:00', missing: 'A', synced: true },
    ]);
  });
});
