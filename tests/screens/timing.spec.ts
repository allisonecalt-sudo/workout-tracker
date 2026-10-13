// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import { setupPage, movableClock, advanceClock, mockDate, TEST_NOW_MS } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// T1 (Sep 27 2026), PLAN-2026-09-26.md §3/§7: her start/finish "Right?" +
// breaks chips + timing.ts. Her words, 22:33-22:36: "you don't know timing
// that's a big thing ... Maybe you could just say like starting workout is
// this the time so I don't always have to like check it and then it's not
// the time I'll correct it."
test.describe('T1 · Timing: her start/finish "Right?" + breaks', () => {
  type Row = Record<string, unknown>;

  // Same shape as 'v48 P1 data's own finishToPostLog (tests/screens/timer-pip-and-data.spec.ts) — that one
  // is scoped to its own describe block, so this is its own copy. Reaches
  // "Quick log" via "Skip cardio today" (no lane memory on a fresh session),
  // straight through main + round 2 + upper back + the cool-down list.
  async function finishToPostLog(page: import('@playwright/test').Page): Promise<void> {
    for (let i = 0; i < 80; i++) {
      const isPostLog = await page
        .locator('text=Quick log')
        .isVisible()
        .catch(() => false);
      if (isPostLog) break;
      const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
      if (await nextBtn.isVisible()) await nextBtn.click();
      else break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
  }

  async function saveAndReadLog(page: import('@playwright/test').Page): Promise<Row> {
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    const logs = JSON.parse(raw ?? '[]') as Row[];
    expect(logs.length).toBe(1);
    return logs[0]!;
  }

  test('untouched: the Start-tap time becomes her_start_at (confirmed false); Save finalizes her_end_at the same way; breaks stay null', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-28T18:00:00+03:00');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    // §3.1: untouched, the line reads the live clock — never her_start_at yet.
    await expect(page.locator('#time-start')).toHaveText('Starting the workout · 18:00. Right?');
    await page.locator('button:has-text("Start")').click();
    await advanceClock(page, 22 * 60_000); // 22 min of "workout", untouched throughout
    await finishToPostLog(page);
    await expect(page.locator('#time-end')).toHaveText('Finishing · 18:22. Right?');
    const log = await saveAndReadLog(page);
    expect(log['herStartConfirmed']).toBe(false);
    expect(log['herStartAt']).toBe('2026-09-28T15:00:00.000Z'); // 18:00 +03:00
    expect(log['herEndConfirmed']).toBe(false);
    expect(log['herEndAt']).toBe('2026-09-28T15:22:00.000Z'); // 18:22 +03:00
    expect(log['breakMinutes']).toBeNull();
  });

  test('✓ Right on both ends: confirmed true, and the result line shows the training minutes', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-28T18:00:00+03:00');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#time-start-ok').click();
    await expect(page.locator('#time-start')).toHaveText('Started 18:00 ✓');
    await page.locator('button:has-text("Start")').click();
    await advanceClock(page, 35 * 60_000); // 35 real min this time
    await finishToPostLog(page);
    await page.locator('#time-end-ok').click();
    await expect(page.locator('#time-end')).toHaveText('Finished 18:35 ✓');
    // §3.2 #time-result: "About 45 min of training" shape, only once both are
    // confirmed — 35 min, no break, rounds to 35 (already a multiple of 5).
    await expect(page.locator('#time-result')).toHaveText('About 35 min of training');
    const log = await saveAndReadLog(page);
    expect(log['herStartConfirmed']).toBe(true);
    expect(log['herEndConfirmed']).toBe(true);
    expect(log['herStartAt']).toBe('2026-09-28T15:00:00.000Z');
    expect(log['herEndAt']).toBe('2026-09-28T15:35:00.000Z');
  });

  test('✎ Fix + "10 min ago": the time moves 10 min and confirms immediately', async ({ page }) => {
    await movableClock(page, '2026-09-28T18:00:00+03:00');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#time-start-fix').click();
    await expect(page.locator('#time-start-input')).toBeVisible();
    await page.locator('[data-time-chip="start"][data-mins="10"]').click();
    // §3.1: "Picking a time sets it straight away" — no separate ✓ tap needed.
    await expect(page.locator('#time-start')).toHaveText('Started 17:50 ✓');
    await page.locator('button:has-text("Start")').click();
    await finishToPostLog(page);
    const log = await saveAndReadLog(page);
    expect(log['herStartConfirmed']).toBe(true);
    expect(log['herStartAt']).toBe('2026-09-28T14:50:00.000Z'); // 17:50 +03:00
  });

  test('Breaks: tap ~15 min (subtracts from the result), tap again clears back to null — never 0', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-28T18:00:00+03:00');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#time-start-ok').click();
    await page.locator('button:has-text("Start")').click();
    await advanceClock(page, 40 * 60_000);
    await finishToPostLog(page);
    await page.locator('#time-end-ok').click();
    await expect(page.locator('#time-result')).toHaveText('About 40 min of training');
    await page.locator('[data-break="15"]').click();
    await expect(page.locator('[data-break="15"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#time-result')).toHaveText('About 25 min of training');
    // Tap again clears it — untouched/unknown, never a real 0.
    await page.locator('[data-break="15"]').click();
    await expect(page.locator('[data-break="15"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#time-result')).toHaveText('About 40 min of training');
    const log = await saveAndReadLog(page);
    expect(log['breakMinutes']).toBeNull();
  });

  test('finish before start: the warning shows, Save still works, and both times save unconfirmed', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-28T18:00:00+03:00');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    // Fix the start to well AFTER "now" — she's correcting a clock error, not
    // a real future time; the app never validates that, same as it never
    // blocks a save (§3.2's own "never block a save" rule covers both ends).
    await page.locator('#time-start-fix').click();
    // .fill() on a native time input already dispatches its own 'change'.
    await page.locator('#time-start-input').fill('20:00');
    await expect(page.locator('#time-start')).toHaveText('Started 20:00 ✓');
    await page.locator('button:has-text("Start")').click();
    await finishToPostLog(page);
    // The finish stays at "now" (18:00), before the 20:00 start.
    await page.locator('#time-end-ok').click();
    await expect(page.locator('#time-warning')).toHaveText(
      'Finish is before the start — check the times.'
    );
    await expect(page.locator('#time-result')).toHaveCount(0); // never a negative/fake number
    const log = await saveAndReadLog(page); // never blocked
    expect(log['herStartConfirmed']).toBe(false);
    expect(log['herEndConfirmed']).toBe(false);
  });
});

// code-shape step 1b-2 (Oct 13 2026): the default clock every test runs on.
test.describe('the default test clock: a fixed start that keeps RUNNING', () => {
  test('starts at TEST_NOW, advances in real time, and is not frozen (hold-to-skip needs that)', async ({
    page,
  }) => {
    const a = await page.evaluate(() => Date.now());
    expect(Math.abs(a - TEST_NOW_MS)).toBeLessThan(60_000); // page load + setup, not the real Oct 13
    await page.waitForTimeout(300);
    const b = await page.evaluate(() => Date.now());
    expect(b - a).toBeGreaterThanOrEqual(250);
    expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe('2026-09-29');
  });

  test('a reload and a fresh context page continue the SAME clock; mockDate still overrides it', async ({
    page,
    context,
  }) => {
    const before = await page.evaluate(() => Date.now());
    await page.waitForTimeout(200);
    await page.reload();
    const afterReload = await page.evaluate(() => Date.now());
    expect(afterReload).toBeGreaterThan(before); // reload continued the clock, not restarted at TEST_NOW
    const second = await context.newPage();
    await second.goto('/');
    const onSecond = await second.evaluate(() => Date.now());
    expect(onSecond).toBeGreaterThan(before); // continued, not restarted at TEST_NOW
    await second.close();
    const frozen = await context.newPage();
    await mockDate(frozen, '2026-10-01T12:00:00.000Z');
    await frozen.goto('/');
    expect(await frozen.evaluate(() => new Date().toISOString())).toBe('2026-10-01T12:00:00.000Z');
    await frozen.close();
  });
});

test.describe('the default test clock vs hold-to-skip (measures Date.now() - holdStart)', () => {
  test('a 700 ms hold on the rest card skips it on the default running clock', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('workout-tracker:setting-rest-sec', '30');
    });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    for (let i = 0; i < 30; i++) {
      if (await page.locator('#skip-rest').isVisible()) break;
      await page.locator('#next, #start-round-2, #ww-skip').first().click();
    }
    const skipRest = page.locator('#skip-rest');
    await expect(skipRest).toBeVisible();
    const box = (await skipRest.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(skipRest).toBeHidden();
  });
});
