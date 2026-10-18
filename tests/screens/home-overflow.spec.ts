// tests/screens/home-overflow.spec.ts - v62.4 S4 (Oct 18 2026): Home must never scroll sideways.
// The week strip holds up to 9 columns (7 days + a swing Saturday + a fold) and used to need 338 px
// whatever the screen: at 360 px today's dot stuck out 19 px on a day she had logged.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// Sun Oct 18 2026, "S A" - the day it was found.
const seedToday = async (page: Page, workouts: string[]): Promise<void> => {
  await page.addInitScript((ws) => {
    const rows = (ws as string[]).map((w, i) => ({
      id: `today-${i}`,
      date: `2026-10-18T0${7 + i}:00:00+03:00`,
      workout: w,
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced: true,
    }));
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
  }, workouts);
};

for (const width of [320, 360, 412]) {
  for (const [label, workouts] of [
    ['one session today', ['A']],
    ['two sessions + a D today', ['A', 'B', 'D']],
  ] as const) {
    test(`Home at ${width} px does not scroll sideways (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await seedToday(page, [...workouts]);
      await mockDate(page, '2026-10-18T12:00:00+03:00');
      await page.goto('/');
      await expect(page.locator('#week-strip .week-dot.is-today')).toBeVisible();
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        stripRight: document.getElementById('week-strip')!.getBoundingClientRect().right,
        lastDotRight: Math.max(
          ...[...document.querySelectorAll('#week-strip > *')].map(
            (e) => e.getBoundingClientRect().right
          )
        ),
      }));
      expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
      // every column sits inside the strip itself, not just inside the page
      expect(m.lastDotRight).toBeLessThanOrEqual(m.stripRight + 0.5);
    });
  }
}
