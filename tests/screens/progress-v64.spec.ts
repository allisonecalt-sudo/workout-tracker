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
