// tests/screens/no-sideways-scroll.spec.ts - v63 fix round (Oct 19 2026): at 360px wide the workout header
// (Pause · List · × Quit workout) ran 9px past the edge, so every workout screen scrolled sideways.
// Walk Workout A end to end at 360 and at 412: the page is never wider than the screen.
import { test, expect, type Page } from '@playwright/test';
import { setupPage } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

const wide = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [360, 412]) {
  test(`no sideways scroll on any workout screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    await expect.poll(() => wide(page)).toBeLessThanOrEqual(0); // Home
    await page.locator('button[data-workout="A"]').click();
    await expect.poll(() => wide(page)).toBeLessThanOrEqual(0); // pre-log
    await page.locator('button:has-text("Start")').click();
    const FORWARD = '#next, #start-round-2, #ww-skip';
    let screens = 0;
    for (let i = 0; i < 60 && !(await page.locator('text=Quick log').first().isVisible()); i++) {
      expect(await wide(page), `step ${i}`).toBeLessThanOrEqual(0);
      screens++;
      await page.locator(FORWARD).click();
    }
    expect(screens).toBeGreaterThan(10); // it really did walk the workout
    expect(await wide(page), 'post-log').toBeLessThanOrEqual(0);
  });

  test(`no sideways scroll on Paused, the step list and the ride numbers at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#step-list-open').click();
    await expect(page.locator('#step-list-panel')).toBeVisible();
    expect(await wide(page), 'step list').toBeLessThanOrEqual(0);
    await page.locator('#step-list-close').click();
    await page.locator('#pause-toggle').click();
    await expect(page.locator('#paused-overlay')).toBeVisible();
    expect(await wide(page), 'paused').toBeLessThanOrEqual(0);
    await page.locator('#pause-resume').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toBeVisible();
    expect(await wide(page), 'ride numbers').toBeLessThanOrEqual(0);
  });
}
