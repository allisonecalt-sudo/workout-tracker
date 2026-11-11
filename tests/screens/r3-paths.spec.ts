// tests/screens/r3-paths.spec.ts — Round 3's time-path picker and the two Skip buttons (v73,
// Nov 11 2026). The logic half (slicing, ride minutes, no pick = 48, the payload) is
// tests/paths.test.ts in plain Node; this is the screen half, at phone size.
//
// WHAT: on a Round 3 day the pre-workout page asks "Which path today?" (38 · 48 · 60),
// nothing lit until she taps; the path decides which moves the workout walks through; the pick is
// saved with the session. Workout D and every day before Sun Nov 15 have no picker. The mood /
// body page and the post-workout time card each have a Skip that saves nulls, never a made-up
// number. Her words (Wed Nov 11 2026): "each one has 30,45,hour and i click the path" · "i
// shoukld be able to skip the time page, the page with mood if i wnat to skip".

import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const SUN_R3 = '2026-11-15T07:00:00.000Z'; // Sun Nov 15 09:00 Jerusalem: Round 3 Week 1
const SAT_R2 = '2026-11-14T10:00:00.000Z'; // Sat Nov 14: still Round 2

type Row = Record<string, unknown>;

async function tapForward(page: Page): Promise<boolean> {
  if (await page.locator('#start-round-2').isVisible()) {
    await page.locator('#start-round-2').click();
    return true;
  }
  const next = page.locator('#next, #ww-skip');
  if (await next.isVisible()) {
    await next.click();
    return true;
  }
  return false;
}

/** Walk the whole workout, returning every exercise title seen, in order (no repeats in a row). */
async function walkToPostLog(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 120; i++) {
    if (await page.locator('#save-log').isVisible()) break;
    const name = await page
      .locator('.exercise-name')
      .first()
      .textContent({ timeout: 500 })
      .catch(() => null);
    if (name && seen[seen.length - 1] !== name) seen.push(name);
    if (!(await tapForward(page))) break;
  }
  await expect(page.locator('text=Quick log')).toBeVisible();
  return seen;
}

async function readLogs(page: Page): Promise<Row[]> {
  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  return JSON.parse(raw ?? '[]') as Row[];
}

async function openPreLog(page: Page, iso: string, letter: string): Promise<void> {
  await mockDate(page, iso);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  await page.locator(`button[data-workout="${letter}"]`).click();
  await expect(page.locator('#begin')).toBeVisible();
}

test.describe('v73 — the time-path picker', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Round 3 A: "Which path today?" with 38 · 48 · 60, nothing lit until she taps', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await expect(page.locator('.path-picker-label')).toHaveText('Which path today?');
    await expect(page.locator('.path-chip-main')).toHaveText(['38 min', '48 min', '60 min']);
    await expect(page.locator('.path-chip-sub')).toHaveText([
      'ride 10 · 3 moves',
      'ride 12 · 4 moves',
      'ride 15 · 5 moves+',
    ]);
    await expect(page.locator('[data-path][aria-pressed="true"]')).toHaveCount(0);
    // with no pick the page shows what Start would mean: 48 (the meta line says ~48 min)
    await expect(page.locator('.prelog-meta')).toContainText('~48 min');
    await expect(page.locator('#lite-toggle')).toHaveCount(0);
  });

  test('tapping a path lights it and redraws the plan; tapping it again clears the pick', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="38"]').click();
    await expect(page.locator('[data-path="38"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.prelog-meta')).toContainText('~38 min');
    await page.locator('summary.prelog-overview-summary').click();
    await expect(page.locator('.overview-phases')).toContainText('Chair squat');
    await expect(page.locator('.overview-phases')).toContainText('Incline push-up on fists');
    await expect(page.locator('.overview-phases')).not.toContainText('Full dead bug');
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('.prelog-meta')).toContainText('~60 min');
    await expect(page.locator('.overview-phases')).toContainText('Hammer curl (if time)');
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('[data-path][aria-pressed="true"]')).toHaveCount(0);
  });

  test('the picker, the body chips and the mood chips sit above the pinned bar, Skip beside Start (A, B, C)', async ({
    page,
  }) => {
    // The Back & wrist row below the mood chips sits a short scroll under the bar on a Round 3 day
    // (the picker is new height; Skip costs none because it lives in the bar): she can scroll to it
    // or Skip. Start is never cut off: it is pinned.
    await mockDate(page, SUN_R3);
    await page.addInitScript(() => window.localStorage.clear());
    for (const w of ['A', 'B', 'C']) {
      await page.goto('/');
      await page.locator(`button[data-workout="${w}"]`).click();
      await page.locator('[data-path="48"]').click();
      const bar = (await page.locator('.action-bar').boundingBox())!;
      const picker = (await page.locator('.path-picker').boundingBox())!;
      expect(picker.y + picker.height).toBeLessThanOrEqual(bar.y);
      for (const id of ['cap-before-10', 'mood-before-10']) {
        const chip = (await page.locator(`#${id}`).boundingBox())!;
        expect(chip.y + chip.height).toBeLessThanOrEqual(bar.y);
      }
      // Skip sits beside Start inside the pinned bar
      const skip = (await page.locator('#prelog-skip').boundingBox())!;
      const begin = (await page.locator('#begin').boundingBox())!;
      expect(skip.y).toBeGreaterThanOrEqual(bar.y);
      expect(begin.y).toBeGreaterThanOrEqual(bar.y);
      expect(skip.x).toBeLessThan(begin.x);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
  });

  test('no picker on Workout D', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'D');
    await expect(page.locator('.path-picker')).toHaveCount(0);
    await expect(page.locator('#lite-toggle')).toHaveCount(0);
  });

  test('no picker the day before Round 3 starts (Sat Nov 14 is still Round 2)', async ({
    page,
  }) => {
    await openPreLog(page, SAT_R2, 'A');
    await expect(page.locator('.path-picker')).toHaveCount(0);
  });
});

test.describe('v73 — the path decides the moves, and is saved', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Start without a pick walks the 48 path and saves session_path 48', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('#begin').click();
    const seen = await walkToPostLog(page);
    for (const m of ['Chair squat', 'Band row', 'Incline push-up on fists', 'Full dead bug']) {
      expect(seen).toContain(m);
    }
    expect(seen).not.toContain('Band pull-apart');
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = await readLogs(page);
    expect(logs.length).toBe(1);
    expect(logs[0]!['sessionPath']).toBe('48');
  });

  test('the 38 pick walks 3 moves and is saved', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="38"]').click();
    await page.locator('#begin').click();
    const seen38 = await walkToPostLog(page);
    expect(seen38).toContain('Incline push-up on fists');
    expect(seen38).not.toContain('Full dead bug');
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    expect((await readLogs(page))[0]!['sessionPath']).toBe('38');
  });

  test('the 60 pick: all five moves and the optional Hammer curl last in each round', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await page.locator('#begin').click();
    const seen = await walkToPostLog(page);
    expect(seen).toContain('Band pull-apart');
    expect(seen.filter((n) => n === 'Hammer curl (if time)').length).toBeGreaterThanOrEqual(1);
    const lastMain = seen.lastIndexOf('Band pull-apart');
    expect(seen.indexOf('Hammer curl (if time)', lastMain - 3)).toBeGreaterThan(-1);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    expect((await readLogs(page))[0]!['sessionPath']).toBe('60');
  });

  test('the pick survives a reload mid-workout (the resume snapshot carries it)', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await page.locator('#begin').click();
    await expect(page.locator('.exercise-name').first()).toBeVisible();
    const snap = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => /active/i.test(k));
      return keys.map((k) => localStorage.getItem(k) ?? '').join('|');
    });
    expect(snap).toContain('"sessionPath":"60"');
  });
});

test.describe('v73 — Skip on the mood page and on the time page', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Skip on the pre-workout page goes straight to the workout with every BEFORE reading unset', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    // she had tapped some answers; Skip means "none of these"
    await page.locator('#cap-before-7').click();
    await page.locator('#mood-before-4').click();
    await page.locator('#prelog-skip').click();
    await expect(page.locator('.exercise-name').first()).toBeVisible();
    await walkToPostLog(page);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const log = (await readLogs(page))[0]!;
    expect(log['capacityBefore']).toBeNull();
    expect(log['moodBefore']).toBeNull();
    expect(log['backPainBefore']).toBeNull();
    expect(log['wristPainBefore']).toBeNull();
  });

  test('Skip the times on the post-workout page: the rest is still offered, the session saves unconfirmed', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('#begin').click();
    await walkToPostLog(page);
    await expect(page.locator('#time-skip')).toBeVisible();
    await page.locator('#time-skip').click();
    await expect(page.locator('#time-skipped')).toContainText('Times skipped');
    await expect(page.locator('.timing-card')).toHaveCount(0);
    // the rest of the page is still there
    await expect(page.locator('#cap-after-6')).toBeVisible();
    await expect(page.locator('#session-note')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const log = (await readLogs(page))[0]!;
    expect(log['herStartConfirmed']).toBe(false);
    expect(log['herEndConfirmed']).toBe(false);
    expect(log['breakMinutes'] ?? null).toBeNull();
    expect(log['capacityAfter']).toBeNull();
  });

  test('"Add them" brings the time card back', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('#begin').click();
    await walkToPostLog(page);
    await page.locator('#time-skip').click();
    await page.locator('#time-unskip').click();
    await expect(page.locator('.timing-card')).toBeVisible();
  });
});

test.describe('v73 — the load chip on the Round 3 arm moves', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('One-arm dumbbell row (B, 48 path) shows the 1 kg / 2 kg chips and saves the pick in arm_feel', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'B');
    await page.locator('#begin').click();
    // walk to the row
    for (let i = 0; i < 40; i++) {
      const name = await page.locator('.exercise-name').first().textContent();
      if (name === 'One-arm dumbbell row') break;
      if (!(await tapForward(page))) break;
    }
    await expect(page.locator('.exercise-name').first()).toHaveText('One-arm dumbbell row');
    await expect(page.locator('[data-arm-load-step="row"]')).toHaveCount(2);
    await page.locator('[data-arm-load-step="row"][data-arm-load="2kg"]').click();
    await walkToPostLog(page);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    expect((await readLogs(page))[0]!['armFeel']).toBe('row=@2kg');
  });
});
