// tests/screens/number-fixes.spec.ts - v62.3 "make every number true" (Oct 16 2026).
//
// One describe per fix (F1..F9): a number that two screens (or a label and its
// bar) used to disagree about is checked on the real screens, with her real
// shapes seeded (Week 4 legacy A/B/C, Week 5 moved on with a D ride, the Sep 24
// first ride, ...). The matching pure-logic tests live in
// tests/number-fixes.test.ts.
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

// Her Week 5 shape on Wed Sep 30 (before the Oct 3 hand-over the Sick weeks
// move): Week 4 closed legacy (A, C, B), Week 5 = A + B + a D ride ->
// "3 / 4" with the D counted in; A/B/C alone = 2.
const week5OpenWithD = async (page: Page): Promise<void> => {
  await seedLogs(page, [
    log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
    log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
    log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
    log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
    log('wk5-b', '2026-09-28T10:00:00+03:00', 'B'),
    log('wk5-d', '2026-09-29T10:00:00+03:00', 'D'),
  ]);
  await mockDate(page, '2026-09-30T08:00:00+03:00');
};

test.describe('v62.3 F1 - per-week bar fill = its label', () => {
  test('Week 5 labelled "3 / 4" fills 75%, not 2/3', async ({ page }) => {
    await week5OpenWithD(page);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const wk5 = page
      .locator('.spw-card')
      .locator(':scope > .spw-rows > .spw-row')
      .filter({ has: page.locator('.spw-label:text-is("wk 5")') });
    await expect(wk5.locator('.spw-count')).toHaveText('3 / 4 · open');
    await expect(wk5.locator('.spw-fill')).toHaveAttribute('style', 'width:75%');
  });
});

test.describe('v62.3 F2 - the weekly review counts sessions one way', () => {
  test('a closed Week 5 with a D ride: header "4 of 4" and the "vs previous week" box says 3 -> 4, not 3 -> 3', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-d', '2026-09-28T12:00:00+03:00', 'D'),
      log('wk5-b', '2026-09-28T14:00:00+03:00', 'B'),
      log('wk5-c', '2026-09-29T10:00:00+03:00', 'C'), // closes Week 5
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00'); // Wed, mid-gap
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await expect(page.locator('.weekly-review-subtitle')).toContainText('4 of 4');
    const sessionsRow = page
      .locator('.weekly-review-delta-row')
      .filter({ has: page.locator('.weekly-review-delta-lbl:text-is("sessions")') });
    await expect(sessionsRow.locator('.weekly-review-delta-vals')).toHaveText('3 → 4');
  });
});

test.describe('v62.3 F3 - Home and Progress read the same session count', () => {
  test('3 sessions + 1 D ride: both screens say 3 with "+1 ride", never 4', async ({ page }) => {
    await seedLogs(page, [
      log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
      log('wk5-d', '2026-09-29T10:00:00+03:00', 'D'),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    const homeRow = page
      .locator('.home-startnow-card .start-now-row')
      .filter({ has: page.locator('.start-now-lbl:text-is("Sessions")') });
    await expect(homeRow.locator('.start-now-val')).toHaveText('3 +1 ride');
    await page.locator('#open-progress-link').click();
    await expect(page.locator('.start-now-card .start-now-hero')).toHaveText('3 sessions +1 ride');
  });
});
