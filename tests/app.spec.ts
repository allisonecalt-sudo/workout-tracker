import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

test('home screen shows three workout options and zero sessions', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('button[data-workout]')).toHaveCount(3);
  await expect(page.locator('text=A · Lower Body + Core')).toBeVisible();
  await expect(page.locator('text=B · Glutes + Mobility + Core')).toBeVisible();
  await expect(page.locator('text=C · Walk + Core (cardio day)')).toBeVisible();
  await expect(page.locator('.stat-number').first()).toHaveText('0');
});

test('selecting workout A goes to pre-log screen', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('h2')).toContainText('Workout A');
  await expect(page.locator('text=Capacity right now')).toBeVisible();
  await expect(page.locator('button:has-text("Start")')).toBeVisible();
});

test('full workout C flow: pre-log → exercises → post-log → save → home with 1 session', async ({
  page,
}) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();

  await expect(page.locator('.exercise-name')).toBeVisible();

  for (let i = 0; i < 30; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    const nextBtn = page.locator('button:has-text("Done · Next")');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    } else {
      const skipRest = page.locator('button:has-text("Skip rest")');
      if (await skipRest.isVisible()) {
        await skipRest.click();
      }
    }
  }

  await expect(page.locator('text=Quick log')).toBeVisible();

  await page.locator('#wallsit').fill('25');
  await page.locator('#word').fill('proud');

  await page.locator('button:has-text("Save & finish")').click();

  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('.stat-number').first()).toHaveText('1');
  await expect(page.locator('.history-word').first()).toContainText('proud');
});

test('quit during workout returns to home without saving', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('button:has-text("Done · Next")').click();
  await page.locator('button:has-text("Quit")').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('.stat-number').first()).toHaveText('0');
});

test('warning banner shows on pre-log', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.warning-banner')).toContainText('3/10');
});

test('capacity slider updates value display', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  const slider = page.locator('#cap-before');
  await slider.fill('8');
  await expect(page.locator('#cap-before-val')).toHaveText('8');
});

// Hand care / wrist routine tests removed 2026-05-15 along with the UI itself.
