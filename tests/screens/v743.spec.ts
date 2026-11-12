// tests/screens/v743.spec.ts — v74.3 fix round (Nov 12 2026), at phone size 412×915.
//
// WHAT: the "See a doctor if…" list on the EASY day and on coming-back days (and not on a normal day);
// Start stays in view; Home offers no D as a to-do while coming back (but D still opens); swap days
// show half the reps on the move page.
// WHY: research README sections 11 and 12. Logic half: tests/v743.test.ts.

import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const SUN_R3 = '2026-11-15T07:00:00.000Z';
const NEXT_DAY = '2026-11-17T07:00:00.000Z';
const LOGS_KEY = 'workout-tracker:logs';
type Row = Record<string, unknown>;

const sick = (over: Row = {}): Row => ({
  id: 'seed-cold',
  date: '2026-11-15T08:00:00.000Z',
  workout: 'A',
  capacityBefore: null,
  capacityAfter: null,
  wallSitSec: 0,
  backPain: null,
  word: '',
  synced: true,
  dayMode: 'cold',
  sessionPath: '38',
  ...over,
});

async function seed(page: Page, iso: string, rows: Row[] | null): Promise<void> {
  await mockDate(page, iso);
  await page.addInitScript(
    ([k, r]) => {
      window.localStorage.clear();
      if (r) window.localStorage.setItem(k as string, JSON.stringify(r));
    },
    [LOGS_KEY, rows] as const
  );
  await page.goto('/');
}

const SIX = [
  'chest pain or tightness',
  'racing or pounding heart',
  'breathless out of proportion',
  'faint or dizzy',
  'fever coming back',
  'a crash 1–2 days after exercise',
];

test.describe('v74.3 - See a doctor if… on easy and coming-back days', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('the EASY day card shows the six items; Start stays inside the screen', async ({ page }) => {
    await seed(page, SUN_R3, null);
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#see-doctor')).toHaveCount(0);
    await page.locator('#day-link').click();
    await page.locator('[data-day-mode="cold"]').click();
    await expect(page.locator('#day-card #see-doctor')).toBeVisible();
    await expect(page.locator('#see-doctor li')).toHaveText(SIX);
    const begin = (await page.locator('#begin').boundingBox())!;
    expect(begin.y + begin.height).toBeLessThanOrEqual(915);
  });

  test('a coming-back day shows it, even after she taps another path; a normal day does not', async ({
    page,
  }) => {
    await seed(page, NEXT_DAY, [sick()]);
    await page.locator('button[data-workout]:not([data-workout="D"])').first().click();
    await expect(page.locator('#see-doctor li')).toHaveText(SIX);
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('#see-doctor')).toBeVisible();
    await seed(page, SUN_R3, null);
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#see-doctor')).toHaveCount(0);
  });
});

test.describe('v74.3 - coming back: Home does not offer D', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Home says "D: skip while coming back", the week line does not name D, D still opens', async ({
    page,
  }) => {
    await seed(page, NEXT_DAY, [sick()]);
    await expect(page.locator('#home-chip-d-skip')).toHaveText('D: skip while coming back');
    await expect(page.locator('#week-count')).not.toContainText('D');
    await page.locator('#home-chip-d-skip').click();
    await expect(page.locator('#begin')).toBeVisible();
    await expect(page.locator('.prelog-title h2')).toHaveText('Workout D');
  });

  test('a normal Home still offers "D · Cardio 30" and names D in the week line', async ({
    page,
  }) => {
    await seed(page, SUN_R3, null);
    await expect(page.locator('.home-chip-d')).toHaveText('D · Cardio 30');
    await expect(page.locator('#home-chip-d-skip')).toHaveCount(0);
    await expect(page.locator('#week-count')).toContainText('D');
  });
});

test.describe('v74.3 - swap day shows half the reps', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('back day A: the chair squat page shows 5–8, and the push-up page has the Today line', async ({
    page,
  }) => {
    await seed(page, SUN_R3, null);
    await page.locator('button[data-workout="A"]').first().click();
    await page.locator('#day-link').click();
    await page.locator('[data-day-mode="back"]').click();
    await page.locator('#begin').click();
    let sawSquat = false;
    let sawPush = false;
    for (let i = 0; i < 40 && !(sawSquat && sawPush); i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .first()
          .textContent({ timeout: 500 })
          .catch(() => null)) ?? '';
      const body = (await page.locator('#app').textContent()) ?? '';
      if (name.startsWith('Chair squat')) {
        sawSquat = true;
        expect(body).toContain('5–8');
        expect(body).not.toContain('10–15');
      }
      if (name.startsWith('Incline push-up')) {
        sawPush = true;
        await expect(page.locator('#swap-line')).toContainText(
          "Today's version: If the position hurts your back: wall push-up instead"
        );
        expect(body).toContain('4–6');
      }
      const next = page.locator('#next, #ww-skip');
      if (!(await next.isVisible())) break;
      await next.click();
    }
    expect(sawSquat && sawPush).toBe(true);
  });
});
