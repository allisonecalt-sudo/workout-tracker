// tests/screens/r3-fix-round.spec.ts - v73.1 (Nov 11 2026), the fix round after the blind checker on v73.
//
// WHAT: the optional Hammer curl has a "Skip - no time" button that saves NO load (Done after really
// doing it still does); Home names a Round 3 workout by its own name (Round 2 days keep the old
// labels); the Round 3 ride note shows on the ride lane she uses; the hammer-curl "try 2 kg" hint
// hides when 2 kg is picked; the "What's in it" fold keeps its state across a path tap; the
// Back & wrist row scrolls clear of the pinned bar; "New tonight" lists only moves Start would show.
// WHY: her words (Wed Nov 11 2026): "make usre all videos wording etc also up to date per execise".
import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const SUN_R3 = '2026-11-15T07:00:00.000Z';
const SAT_R2 = '2026-11-14T10:00:00.000Z';
const CURL = 'Hammer curl (if time)';

type Row = Record<string, unknown>;

async function readLogs(page: Page): Promise<Row[]> {
  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  return JSON.parse(raw ?? '[]') as Row[];
}

async function openPreLog(page: Page, iso: string, letter: string): Promise<void> {
  await mockDate(page, iso);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  await page.locator(`button[data-workout="${letter}"]`).first().click();
  await expect(page.locator('#begin')).toBeVisible();
}

async function exerciseName(page: Page): Promise<string | null> {
  return page
    .locator('.exercise-name')
    .first()
    .textContent({ timeout: 500 })
    .catch(() => null);
}

/** Tap forward to the next Hammer curl page (any round). */
async function walkToCurl(page: Page): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if ((await exerciseName(page)) === CURL) return;
    if (await page.locator('#start-round-2').isVisible()) {
      await page.locator('#start-round-2').click();
      continue;
    }
    const next = page.locator('#next, #ww-skip');
    if (!(await next.isVisible())) break;
    await next.click();
  }
  throw new Error('never reached the Hammer curl page');
}

/** To the post-log page. `skipCurl` taps "Skip - no time" on the curl page instead of Done. */
async function walkToPostLog(page: Page, skipCurl: boolean): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (await page.locator('#save-log').isVisible()) return;
    if (skipCurl && (await page.locator('#skip-optional').isVisible())) {
      await page.locator('#skip-optional').click();
      continue;
    }
    if (await page.locator('#start-round-2').isVisible()) {
      await page.locator('#start-round-2').click();
      continue;
    }
    const next = page.locator('#next, #ww-skip');
    if (!(await next.isVisible())) break;
    await next.click();
  }
  await expect(page.locator('#save-log')).toBeVisible();
}

test.describe('v73.1 - the optional Hammer curl', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('only the optional move has a "Skip - no time" button', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await page.locator('#begin').click();
    await expect(page.locator('#skip-optional')).toHaveCount(0); // the ride
    await walkToCurl(page);
    await expect(page.locator('#skip-optional')).toHaveText('Skip — no time');
  });

  test('skipping it saves NO arm_feel load and counts it as skipped, not hurt', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await page.locator('#begin').click();
    await walkToPostLog(page, true);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const row = (await readLogs(page))[0]!;
    expect(row['armFeel'] ?? null).toBeNull();
    expect(String(row['moveFeel'] ?? '')).not.toContain('hammercurl');
    expect(Number(row['stepsSkipped'])).toBeGreaterThanOrEqual(2); // the curl, both rounds
  });

  test('doing it and tapping Done still saves the load she picked', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await page.locator('#begin').click();
    await walkToCurl(page);
    await page.locator('[data-arm-load-step="curl"][data-arm-load="2kg"]').click();
    await walkToPostLog(page, false);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    expect((await readLogs(page))[0]!['armFeel']).toBe('curl=@2kg');
  });

  test('the "try 2 kg" hint hides once 2 kg is picked', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await page.locator('#begin').click();
    await walkToCurl(page);
    await page.locator('[data-arm-load-step="curl"][data-arm-load="1kg"]').click();
    await expect(page.locator('.arm-load-pace-rule')).toHaveCount(1);
    await page.locator('[data-arm-load-step="curl"][data-arm-load="2kg"]').click();
    await expect(page.locator('.arm-load-pace-rule')).toHaveCount(0);
  });
});

test.describe('v73.1 - Home names Round 3 workouts by their own names', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Round 3 day: the hero and the chips use the R3 names', async ({ page }) => {
    await mockDate(page, SUN_R3);
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');
    const hero = await page.locator('.home-hero').innerText();
    expect(hero).toContain('Lower + Pull + Push');
    expect(hero).not.toContain('Lower + back');
    // "New tonight" names only what Start (the 48 path) shows: no 5th move, no pull-apart
    expect(hero).not.toContain('band pull-apart');
    const chips = await page.locator('.home-chips').innerText();
    expect(chips).toContain('B · Hinge + Pull + Glutes');
    expect(chips).toContain('C · Legs + Pull + Push + Core');
    expect(chips).not.toContain('Glutes + back');
    expect(chips).not.toContain('Cardio');
  });

  test('Round 2 day (Sat Nov 14): the old labels stay', async ({ page }) => {
    await mockDate(page, SAT_R2);
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');
    const all = await page.locator('.home-hero, .home-chips').allInnerTexts();
    expect(all.join(' ')).not.toContain('Pull + Push');
  });
});

test.describe('v73.1 - the Round 3 ride note shows on the lane she uses', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  const NOTE = 'Ride first. Easy for the first 2–3 min';

  test('the lane choice, the elliptical, the walk and the apartment all show it', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('#begin').click();
    await expect(page.locator('.ride-note')).toContainText(NOTE); // the choice screen
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('.ride-note')).toContainText(NOTE);
    await expect(page.locator('.ride-note')).toContainText('Grows only if your knee is fine');
    await page.locator('#ww-outdoor').click(); // back to the choice
    await page.locator('#ww-apartment').click();
    await expect(page.locator('.ride-note')).toContainText(NOTE);
    await page.locator('#ww-outdoor').click();
    await page.locator('#ww-start').click();
    await expect(page.locator('.ride-note')).toContainText(NOTE);
  });

  test('a Round 2 ride shows no such note', async ({ page }) => {
    await openPreLog(page, SAT_R2, 'C');
    await page.locator('#begin').click();
    await expect(page.locator('.ride-note')).toHaveCount(0);
  });
});

test.describe('v73.1 - the pre-workout page', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('"What\'s in it" keeps its open state when a path is tapped', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    const fold = page.locator('details.prelog-overview');
    await expect(fold).not.toHaveAttribute('open', '');
    await page.locator('.prelog-overview-summary').click();
    await expect(fold).toHaveAttribute('open', '');
    await page.locator('[data-path="38"]').click();
    await expect(page.locator('details.prelog-overview')).toHaveAttribute('open', '');
    await page.locator('.prelog-overview-summary').click(); // close it again
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('details.prelog-overview')).not.toHaveAttribute('open', '');
  });

  test('Back & wrist scrolls clear of the pinned bar (A, B, C)', async ({ page }) => {
    await mockDate(page, SUN_R3);
    await page.addInitScript(() => window.localStorage.clear());
    for (const w of ['A', 'B', 'C']) {
      await page.goto('/');
      await page.locator(`button[data-workout="${w}"]`).first().click();
      await page.locator('[data-path="48"]').click();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const bar = (await page.locator('.action-bar').boundingBox())!;
      const row = (await page.locator('#back-fine-pre').boundingBox())!;
      expect(row.y + row.height).toBeLessThanOrEqual(bar.y);
    }
  });

  test('the new-tonight line never lists the cardio lane as a move', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    const meta = await page.locator('.prelog-meta').innerText();
    expect(meta).not.toContain('band pull-apart'); // 5th move, not on the 48 path
    const at = meta.indexOf('new tonight');
    if (meta.includes('elliptical')) expect(meta.indexOf('elliptical')).toBeLessThan(at);
  });
});
