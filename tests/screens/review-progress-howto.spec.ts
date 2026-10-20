// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate, ignoreSickWeeks, PLAIN_WEEK5_HANDOVER } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// WK4 (Sep 27 2026) — PLAN-2026-09-26.md §2.6 "Remaining week sites": the
// weekly review pager, the Progress "Sessions per week" card, Settings About
// (its own test sits with the rest of Settings, above), the how-to "seen this
// week" key, walksThisWeek, and the saved-session plan lookup (planForLog) —
// everything §2.4/§7's own launch comment named as "WK4's job, not this
// one's". Her words that drove the underlying model: 21:32 "it says week 5 on
// top … I'm in week 4"; the launch instant is week.ts's own
// COMPLETION_WEEKS_FROM (Sat Sep 26 2026 22:30).
test.describe('WK4 (Sep 27 2026): weekly review / Progress / how-to / walks / saved-session plan', () => {
  type Row = Record<string, unknown>;

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
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
    synced: true,
  });

  test('weekly review pages from the legacy calendar week (Week 4) into the completion model (Week 5) — a FIXED anchor, never "today minus N weeks"', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('thu-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('fri-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('sat-b', '2026-09-26T19:14:51+03:00', 'B'), // 22:14 local — before the 22:30 launch, closes legacy Week 4
      log('wk5-a', '2026-09-27T12:00:00+03:00', 'A'), // after the launch — Week 5's own first session
    ]);
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();

    // Page 0: the live completion span, "since" (no range yet, still open).
    await expect(page.locator('.review-title')).toHaveText('Week 5 · since Sat Sep 26');
    await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(1);
    await expect(page.locator('#next-week')).toBeHidden();
    await expect(page.locator('.weekly-review-open')).toHaveText('Week still open.');

    // Page 1: the pager falls through into the LEGACY calendar model, at the
    // FIXED Week-4 anchor — not whatever "today minus a week" would be.
    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 4 · Sep 19–25');
    await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(3);
    await expect(page.locator('.weekly-review-subtitle')).toContainText('3');

    // Back to page 0.
    await page.locator('#next-week').click();
    await expect(page.locator('.review-title')).toHaveText('Week 5 · since Sat Sep 26');
  });

  // v54 fix r3 (Sep 27 2026), checker's should #1 (round 3 — round 2's own
  // fix, right above r2's comment on this test file, only half-closed it):
  // "No sessions this week." directly above a "D · ... · extra ride" line
  // flatly contradicted itself — she DID ride, it just wasn't one of A/B/C.
  test('a D-only live week (no A/B/C yet) reads "None of A, B, C yet.", never the old blanket line that contradicted the D row below it', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('thu-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('fri-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('sat-b', '2026-09-26T19:14:51+03:00', 'B'), // before the launch — closes legacy Week 4 only
      {
        id: 'wk5-d',
        date: '2026-09-27T12:00:00+03:00', // Sun, inside Week 5, after the launch
        workout: 'D',
        capacityBefore: 6,
        capacityAfter: 7,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        synced: true,
      },
    ]);
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toHaveText('Week 5 · since Sat Sep 26');
    await expect(page.locator('.weekly-review-empty')).toHaveText('None of A, B, C yet.');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
    await expect(page.locator('.weekly-review-extra-row')).toContainText('D');
    await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');
  });

  // v55 (Sep 27 2026) — CHECK round 3 N1: a D ride dated in the GAP after a
  // weekday close (before the next Saturday) fell between every span's own
  // window — the closed week's own closedAt cut it off, and nothing had
  // opened yet to claim it either. It belongs to the week it follows, both
  // while still mid-gap and after the next week genuinely opens.
  test('a gap-dated D ride is listed under the CLOSED week it follows, mid-gap and after the next week opens', async ({
    page,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    const week5Rows = [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-b', '2026-09-28T10:00:00+03:00', 'B'),
      log('wk5-c', '2026-09-29T10:00:00+03:00', 'C'), // closes Week 5 on Tue, 3 of 3
      {
        id: 'wk5-d',
        date: '2026-09-30T10:00:00+03:00', // Wed — the gap, before Sat Oct 3
        workout: 'D' as const,
        capacityBefore: 6,
        capacityAfter: 7,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        synced: true,
      },
    ];
    await seedLogs(page, week5Rows);
    await mockDate(page, '2026-10-01T08:00:00+03:00'); // Thu — mid-gap, Week 6 still pending
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
    await expect(page.locator('.weekly-review-extra-row')).toContainText('D');
    await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');

    // Week 6 genuinely opens now (a real session on/after Sat Oct 3) — the
    // gap ride must STAY on Week 5's page, and Week 6's own page must not
    // pick it up just because it's now the "next" span.
    await seedLogs(page, [...week5Rows, log('wk6-a', '2026-10-03T10:00:00+03:00', 'A')]);
    await mockDate(page, '2026-10-05T08:00:00+03:00'); // Mon — Week 6 open, day 3
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('Week 6');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(0);
    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
    await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');
  });

  test('Progress · weeks grid (v64): a closed completion week reads "3 of 4", never a recomputed calendar count', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-b', '2026-09-28T10:00:00+03:00', 'B'),
      log('wk5-c', '2026-09-29T10:00:00+03:00', 'C'), // closes Week 5 on Tue, 3 of 3
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00'); // Wed, mid-gap (Week 6 pending until Sat Oct 3)
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    // v64: the weeks grid; Week 5 closed at 3 of 3 with no D, so it shows "3 of 4"
    // (the "/ 4" counting is the same as Home's) and is a full week.
    await expect(page.locator('button.wk-cell[aria-label^="Week 5 (round 2)"]')).toHaveAttribute(
      'aria-label',
      'Week 5 (round 2), 3 of 4, a full week'
    );
  });

  test('Progress · weeks grid (v64): a moved-on week shows its own count, the live week is marked "now"', async ({
    page,
  }) => {
    await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-b', '2026-09-29T10:00:00+03:00', 'B'), // 2 of 3 — C never comes
    ]);
    // A move-on for Week 5, landing on the following Saturday (Oct 3, itself
    // an anchor day — Week 6 opens the same instant, no gap). Seeded directly
    // (bypassing the UI tap), same shape weekMovePayload writes.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:week-moves',
        JSON.stringify([
          { round: 2, week: 5, at: '2026-10-03T09:00:00+03:00', missing: 'C', synced: true },
        ])
      );
    });
    await mockDate(page, '2026-10-05T08:00:00+03:00'); // Mon, Week 6 open (day 3)
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    // v64: the weeks grid: the moved-on week is a partial square with its count, the live
    // week is marked "now" (no D in this seed, so "of 4").
    await expect(page.locator('button.wk-cell[aria-label^="Week 5 (round 2)"]')).toHaveAttribute(
      'aria-label',
      'Week 5 (round 2), 2 of 4'
    );
    const wk6 = page.locator('button.wk-cell[aria-label^="Week 6 (round 2)"]');
    await expect(wk6).toHaveAttribute('aria-label', 'Week 6 (round 2), 0 of 4, this week');
    await expect(wk6).toContainText('now');
  });

  test('planForLog: a post-launch A resolves Week 5’s own key, not the old swing/calendar model’s', async ({
    page,
  }) => {
    await seedLogs(page, [log('wk5-a', '2026-09-27T12:00:00+03:00', 'A')]);
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28, Week 5 day 3
    await page.goto('/');
    const key = await page.evaluate(() => {
      const w = window as unknown as {
        __wtPlanKeyForLog: (e: unknown) => unknown;
      };
      return w.__wtPlanKeyForLog({ id: 'wk5-a', date: '2026-09-27T12:00:00+03:00', workout: 'A' });
    });
    expect(key).toEqual({ round: 2, week: 5 });
  });

  test('planForLog: a session dated BEFORE the launch still resolves through the old calendar model (null key)', async ({
    page,
  }) => {
    await seedLogs(page, [log('wk4-a', '2026-09-24T15:56:00+03:00', 'A')]);
    await mockDate(page, '2026-09-24T15:00:00.000Z');
    await page.goto('/');
    const key = await page.evaluate(() => {
      const w = window as unknown as {
        __wtPlanKeyForLog: (e: unknown) => unknown;
      };
      return w.__wtPlanKeyForLog({ id: 'wk4-a', date: '2026-09-24T15:56:00+03:00', workout: 'A' });
    });
    expect(key).toBeNull();
  });

  test('the how-to "seen this week" key follows the completion model’s OPEN week post-launch, the calendar model pre-launch', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    const postLaunchKey = await page.evaluate(() =>
      (
        window as unknown as {
          __wtCurrentHowToWeekKey: () => { num: number; round: number };
        }
      ).__wtCurrentHowToWeekKey()
    );
    expect(postLaunchKey).toEqual({ num: 5, round: 2 });

    await mockDate(page, '2026-09-22T10:00:00.000Z'); // pre-launch, Tue — Week 4
    await page.goto('/');
    const preLaunchKey = await page.evaluate(() =>
      (
        window as unknown as {
          __wtCurrentHowToWeekKey: () => { num: number; round: number };
        }
      ).__wtCurrentHowToWeekKey()
    );
    // The pre-launch branch returns getProgramWeek()'s FULL object (start/end/
    // skippedLabel too, unchanged pre-existing shape) — only num/round matter
    // to howToWeekKey, so this checks those two, not exact equality.
    expect(preLaunchKey).toMatchObject({ num: 4, round: 2 });
  });

  test('walksThisWeek counts since the completion model’s own week start, not today’s calendar Saturday', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:walks',
        JSON.stringify([
          { id: 'w1', date: '2026-09-20T10:00:00+03:00' }, // before Week 5 opened — doesn't count
          { id: 'w2', date: '2026-09-27T10:00:00+03:00' }, // after — counts
        ])
      );
    });
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    await expect(page.locator('.walk-row .walk-text')).toContainText('1 this week');
  });
});
