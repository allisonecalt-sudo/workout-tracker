// tests/screens/saturday-ask.spec.ts — v75 (Nov 15 2026): the Saturday card on Home, at phone size 412×915.
//
// WHAT: on a Saturday after Round 3 Week 1 closed (A, B, C done) Home asks "Week 1: D left." with
// [Finish Week 1] [Move to Week 2]; Finish keeps the week, leaves a quiet link, and Up next is D;
// Move opens Week 2 at once ("Week 2 started · Undo") and Undo brings Week 1 back; Start before an
// answer shows the two buttons first. Logic half: tests/week.test.ts, tests/program-week.test.ts.

import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const SAT_NIGHT = '2026-11-21T18:00:00.000Z'; // Sat Nov 21 20:00 Jerusalem
const LOGS_KEY = 'workout-tracker:logs';
type Row = Record<string, unknown>;

const row = (id: string, date: string, workout: string): Row => ({
  id,
  date,
  workout,
  capacityBefore: null,
  capacityAfter: null,
  wallSitSec: 0,
  backPain: null,
  word: '',
  synced: true,
});

const WEEK1_CLOSED: Row[] = [
  row('r1a', '2026-11-16T16:00:00.000Z', 'A'),
  row('r1b', '2026-11-17T16:00:00.000Z', 'B'),
  row('r1c', '2026-11-18T16:00:00.000Z', 'C'),
];

async function seed(page: Page, iso: string, rows: Row[]): Promise<void> {
  await mockDate(page, iso);
  await page.addInitScript(
    ([k, r]) => {
      // only on the FIRST load of the test: a reload must keep what she tapped
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.clear();
      window.localStorage.setItem(k as string, JSON.stringify(r));
    },
    [LOGS_KEY, rows] as const
  );
  await page.goto('/');
}

test.describe('v75 - the Saturday card', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('asks "Week 1: D left." with the two answers', async ({ page }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await expect(page.locator('#saturday-card .saturday-line')).toHaveText('Week 1: D left.');
    await expect(page.locator('#sat-finish')).toHaveText('Finish Week 1');
    await expect(page.locator('#sat-move')).toHaveText('Move to Week 2');
  });

  test('Finish: the card becomes a quiet link, Up next is D, and a reload does not ask again', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('#sat-finish').click();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
    await expect(page.locator('#sat-move-link')).toHaveText('Move to Week 2');
    await expect(page.locator('.home-hero')).toContainText('Workout D');
    await page.reload();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
    await expect(page.locator('#sat-move-link')).toHaveCount(1);
  });

  test('Move to Week 2: Week 2 starts now, the note has Undo, and Undo brings Week 1 back', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('#sat-move').click();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
    await expect(page.locator('#week-title')).toContainText('Week 2');
    await expect(page.locator('#week-moved-note')).toContainText('Week 2 started');
    await page.locator('#week-undo').click();
    await expect(page.locator('#saturday-card .saturday-line')).toHaveText('Week 1: D left.');
  });

  test('Start before answering shows the two buttons first; the next Start goes through', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#saturday-ask')).toBeVisible();
    await expect(page.locator('#sat-finish')).toBeVisible();
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
  });

  test('Fri Nov 20: no card', async ({ page }) => {
    await seed(page, '2026-11-20T18:00:00.000Z', WEEK1_CLOSED);
    await expect(page.locator('#saturday-card')).toHaveCount(0);
  });
});
