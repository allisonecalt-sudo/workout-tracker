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
  await expect(page.locator('text=C · Walk + Light Core + Stretch')).toBeVisible();
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

test('home shows hand care section with both routines', async ({ page }) => {
  await expect(page.locator('h3:has-text("Hand care")')).toBeVisible();
  await expect(page.locator('button[data-hand="left-hand"]')).toBeVisible();
  await expect(page.locator('button[data-hand="right-hand"]')).toBeVisible();
  await expect(page.locator('text=🔒 not yet')).toBeVisible();
});

test('left hand routine: walk through all exercises and save log', async ({ page }) => {
  await page.locator('button[data-hand="left-hand"]').click();
  await expect(page.locator('h2')).toContainText('Left hand');
  await expect(page.locator('.exercise-name')).toBeVisible();

  for (let i = 0; i < 10; i++) {
    const onHome = await page
      .locator('h1:has-text("Workout Tracker")')
      .isVisible()
      .catch(() => false);
    if (onHome) break;
    const next = page.locator('button:has-text("Done")').first();
    if (await next.isVisible()) {
      await next.click();
    }
  }

  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('text=1× today')).toBeVisible();
});

test('right hand routine: shows locked banner, does not log on completion', async ({ page }) => {
  await page.locator('button[data-hand="right-hand"]').click();
  await expect(page.locator('.warning-banner')).toContainText('Eliana');

  for (let i = 0; i < 10; i++) {
    const onHome = await page
      .locator('h1:has-text("Workout Tracker")')
      .isVisible()
      .catch(() => false);
    if (onHome) break;
    const next = page.locator('button:has-text("Done")').first();
    if (await next.isVisible()) {
      await next.click();
    }
  }

  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('text=🔒 not yet')).toBeVisible();
});
