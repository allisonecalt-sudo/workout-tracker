// tests/screens/progress-v64.spec.ts - v64 "progress, all over" (Oct 20 2026).
//
// One describe per screen: Home, Progress, Weekly review, Rides. Her shapes are seeded
// (Week 4 legacy A/B/C, Week 5 closed by the Sick week with a D ride, ...). The pure-logic
// tests live in tests/progress-v64.test.ts.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

type Row = Record<string, unknown>;

const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
  await page.addInitScript((rows) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
  }, logs);
};

const log = (id: string, date: string, workout: 'A' | 'B' | 'C' | 'D', extra: Row = {}): Row => ({
  id,
  date,
  workout,
  capacityBefore: 6,
  capacityAfter: 7,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  synced: true,
  ...extra,
});

// Round 2 Weeks 1-3 full (three letters each), then Week 4 legacy full, then Week 5 closed
// by the Oct 3 Sick week with A + B + a D ride (3 of 4), Week 6 open and empty.
const afterSickWeek = async (page: Page): Promise<void> => {
  await seedLogs(page, [
    log('r2w3-a', '2026-09-12T10:00:00+03:00', 'A'),
    log('r2w3-b', '2026-09-13T10:00:00+03:00', 'B'),
    log('r2w3-c', '2026-09-14T10:00:00+03:00', 'C'),
    log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
    log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
    log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
    log('wk5-d', '2026-09-28T12:33:00+03:00', 'D', {
      cardioLane: 'elliptical',
      cardioMinutes: 30,
      ellipticalLevel: 3,
    }),
    log('wk5-a', '2026-09-28T13:34:00+03:00', 'A', { wallSitSec: 45 }),
  ]);
  await mockDate(page, '2026-10-14T08:00:00+03:00'); // Wed of Week 6, before anything is logged
};

test.describe('v64 Home - one line instead of the Start -> Now card; a quiet line after a break', () => {
  test('the one line says "Since <month>: N full weeks" and opens Progress', async ({ page }) => {
    await afterSickWeek(page);
    await page.goto('/');
    await expect(page.locator('.home-startnow-card')).toHaveCount(0);
    const line = page.locator('#home-since-line');
    await expect(line).toContainText('Since Sep: 2 full weeks');
    await line.click();
    await expect(page.locator('.screen-header h2')).toHaveText('Progress');
  });

  test('after the Sick week, Week 6 is empty: the week card says so in one quiet line', async ({
    page,
  }) => {
    await afterSickWeek(page);
    await page.goto('/');
    await expect(page.locator('#week-after-break')).toHaveText(
      'After the sick week · Week 6 opens with whichever you do first'
    );
    await expect(page.locator('.week-card .week-after-break')).toHaveCount(1);
    // the count line itself is untouched
    await expect(page.locator('#week-count')).toContainText('0 of 4');
  });

  test('once Week 6 has a session the line is gone', async ({ page }) => {
    await seedLogs(page, [
      log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('wk5-a', '2026-09-28T13:34:00+03:00', 'A'),
      log('wk6-a', '2026-10-13T06:42:00+03:00', 'A'),
    ]);
    await mockDate(page, '2026-10-14T08:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('#week-after-break')).toHaveCount(0);
  });

  test('a normal week (no Sick/Break week before it) has no such line', async ({ page }) => {
    await mockDate(page, '2026-09-29T09:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('#week-after-break')).toHaveCount(0);
  });

  test('after the summer break (Round 2 Week 1) it says "the break"', async ({ page }) => {
    await seedLogs(page, [log('r1', '2026-07-10T10:00:00+03:00', 'A')]);
    await mockDate(page, '2026-08-30T09:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('#week-after-break')).toContainText('After the break · Week 1 opens');
  });

  test('no sideways scroll at 360 and 412', async ({ page }) => {
    await afterSickWeek(page);
    for (const width of [360, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(over, `${width}px`).toBeLessThanOrEqual(0);
    }
  });
});

// Her Progress shape: wall sits (honest from Sep 24), a curl load, rides of 10 / 25 / 30 / 10
// minutes (two of them the same length), wrist readings, back pain 0 on most days.
const progressShape = async (page: Page, wristReadings = 4): Promise<void> => {
  const wrist = [4, 3, 1, 1, 2, 1].slice(0, wristReadings);
  await seedLogs(page, [
    log('may-a', '2026-05-02T15:00:00+03:00', 'A', { wallSitSec: 33, backPain: 2 }),
    log('sep24-a', '2026-09-24T15:56:00+03:00', 'A', {
      wallSitSec: 44,
      cardioLane: 'elliptical',
      cardioMinutes: 10,
      ellipticalLevel: 5,
      ellipticalKm: 0.72,
      ellipticalKcal: 63.4,
      ellipticalTimeSec: 602,
    }),
    log('sep25-c', '2026-09-25T11:53:00+03:00', 'C', {
      wristPain: wrist[0],
      cardioLane: 'elliptical',
      cardioMinutes: 25,
      ellipticalLevel: 3,
      ellipticalTimeSec: 1501,
    }),
    log('sep26-b', '2026-09-26T19:14:51+03:00', 'B', {
      wristPain: wrist[1],
      cardioLane: 'elliptical',
      cardioMinutes: 10,
      ellipticalLevel: 5,
      ellipticalTimeSec: 600,
    }),
    log('sep28-d', '2026-09-28T12:33:00+03:00', 'D', {
      wristPain: wrist[2],
      backPain: 2,
      cardioLane: 'elliptical',
      cardioMinutes: 30,
      ellipticalLevel: 3,
    }),
    log('sep28-a', '2026-09-28T13:34:00+03:00', 'A', {
      wallSitSec: 45,
      wristPain: wrist[3],
      armFeel: 'curl=right@2kg;row=right@2kg',
    }),
    ...(wristReadings > 4
      ? [
          log('sep29-b', '2026-09-29T07:00:00+03:00', 'B', { wristPain: wrist[4] }),
          log('sep29-c', '2026-09-29T08:00:00+03:00', 'C', { wristPain: wrist[5] }),
        ]
      : []),
  ]);
  await mockDate(page, '2026-09-30T08:00:00+03:00');
};

const openProgress = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.locator('#open-progress-link').click();
};

test.describe('v64 Progress - weeks you showed up lead; what grew, body check, more', () => {
  test('the hero is "N full weeks" with its basis, and the old A/B/C chips and per-week bars are gone', async ({
    page,
  }) => {
    await afterSickWeek(page);
    await openProgress(page);
    await expect(page.locator('.progress-screen > .card').first()).toHaveClass(/weeks-card/);
    await expect(page.locator('.weeks-hero')).toContainText('2 full weeks');
    await expect(page.locator('.weeks-hero-sub')).toHaveText('since Sep 12 · 7 workouts + 1 ride');
    await expect(page.locator('.progress-chip')).toHaveCount(0);
    await expect(page.locator('.spw-card')).toHaveCount(0);
    await expect(page.locator('.start-now-card')).toHaveCount(0);
  });

  test('the grid: full = filled with its count, partial = outlined with its count, the Sick week is grey and labelled and not tappable, this week says now', async ({
    page,
  }) => {
    await afterSickWeek(page);
    await openProgress(page);
    const full = page.locator('button.wk-cell.wk-full').filter({ hasText: '3' });
    expect(await full.count()).toBeGreaterThanOrEqual(2);
    const wk5 = page.locator('button.wk-cell[aria-label^="Week 5 (round 2)"]');
    await expect(wk5).toHaveClass(/wk-partial/);
    await expect(wk5).toHaveText('2');
    await expect(wk5).toHaveAttribute('aria-label', 'Week 5 (round 2), 2 of 4');
    const sick = page.locator('span.wk-cell.wk-skip').filter({ hasText: 'S' });
    expect(await sick.count()).toBeGreaterThanOrEqual(1);
    await expect(sick.last()).toHaveAttribute('aria-label', 'Sick week, not counted');
    const now = page.locator('.wk-cell.wk-now');
    await expect(now).toHaveCount(1);
    await expect(now).toContainText('now');
    await expect(page.locator('.wk-legend')).toContainText('number: sessions that week');
  });

  test('a square opens that week review, and "× Back" returns to Progress', async ({ page }) => {
    await afterSickWeek(page);
    await openProgress(page);
    await page.locator('button.wk-cell[aria-label^="Week 5 (round 2)"]').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await page.locator('#back-home').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Progress');
  });

  test('What grew: each row first -> now with its own since; like with like', async ({ page }) => {
    await progressShape(page);
    await openProgress(page);
    const row = (label: string) =>
      page.locator('.grew-card .start-now-row').filter({ hasText: label });
    await expect(row('Wall sit')).toContainText('44 s → 45 s');
    await expect(row('Wall sit')).toContainText('since Sep 24'); // not May 2: honest readings only
    await expect(row('Arm curl')).toContainText('2 kg');
    await expect(row('Arm curl')).toContainText('since Sep 28');
    await expect(row('Longest ride')).toContainText('10 min → 30 min');
    await expect(row('Longest ride')).toContainText('since Sep 24');
    // a level row ONLY across rides of the same length (the two 10-minute rides)
    await expect(row('Level at 10 min')).toContainText('L5, the same');
    await expect(page.locator('.grew-words')).toHaveText(
      'Rides got longer; the longest was at level 3.'
    );
  });

  test('What grew: with no two rides of the same length there is no level row', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('a', '2026-09-24T15:56:00+03:00', 'A', {
        cardioLane: 'elliptical',
        ellipticalLevel: 5,
        ellipticalTimeSec: 602,
      }),
      log('c', '2026-09-25T11:53:00+03:00', 'C', {
        cardioLane: 'elliptical',
        ellipticalLevel: 3,
        ellipticalTimeSec: 1501,
      }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await openProgress(page);
    await expect(
      page.locator('.grew-card .start-now-row').filter({ hasText: 'Level at' })
    ).toHaveCount(0);
    await expect(page.locator('.grew-card')).not.toContainText('level 5 →');
  });

  test('Body check: wrist and back together in words, readings as logged; dots only at 5+ readings', async ({
    page,
  }) => {
    await progressShape(page, 4);
    await openProgress(page);
    const card = page.locator('.body-card');
    await expect(card.locator('.body-line').first()).toContainText(
      'Wrist: latest 1 · last 4: 4 → 3 → 1 → 1'
    );
    await expect(card.locator('.body-line').first()).toContainText('(readings as logged)');
    await expect(card.locator('.body-line').nth(1)).toContainText('Back: pain-free 4 of 6');
    await expect(card).toContainText('lower is better');
    await expect(page.locator('.wrist-dots')).toHaveCount(0);
  });

  test('Body check: at 5+ wrist readings the dots appear, on a fixed 0-10 scale', async ({
    page,
  }) => {
    await progressShape(page, 6);
    await openProgress(page);
    await expect(page.locator('.wrist-dots')).toHaveCount(1);
    await expect(page.locator('.wrist-dots circle')).toHaveCount(6);
    await expect(page.locator('.body-card .body-line').first()).toContainText(
      'last 4: 1 → 1 → 2 → 1'
    );
  });

  test('More: Your rides, Your cycle, Program sit together at the bottom; the Program row opens the archive', async ({
    page,
  }) => {
    await afterSickWeek(page);
    await openProgress(page);
    const cards = page.locator('.progress-screen > .card');
    await expect(cards.last()).toHaveClass(/more-card/);
    // no door row anywhere but inside More
    await expect(page.locator('.progress-screen > .card:not(.more-card) .door-row')).toHaveCount(0);
    const rows = page.locator('.more-card .door-row');
    await expect(rows.nth(0)).toContainText('Your rides');
    await expect(rows.nth(1)).toContainText('Your cycle');
    await expect(rows.nth(2)).toContainText('Program');
    await expect(page.locator('.more-program .next-week-summary').first()).toBeHidden();
    await rows.nth(2).click();
    await expect(page.locator('.more-program .next-week-summary').first()).toBeVisible();
    await page.locator('#open-rides').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Your rides');
  });

  test('under 2 sessions: the calm line and the More group', async ({ page }) => {
    await seedLogs(page, [log('a', '2026-09-24T15:56:00+03:00', 'A')]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await openProgress(page);
    await expect(page.locator('.progress-empty')).toContainText('2+ sessions');
    await expect(page.locator('.more-card #open-rides')).toBeVisible();
  });

  for (const width of [360, 412]) {
    test(`no sideways scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await progressShape(page, 6);
      await openProgress(page);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});
