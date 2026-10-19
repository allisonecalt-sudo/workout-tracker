// tests/screens/this-hurts.spec.ts - v63 item 3 (Oct 19 2026): "This hurts".
//
// On every move page: one tap skips the move ("Got it, skipped."), records it as hurt in move_feel
// (`slug=hurt`, no qty) and counts it in steps_skipped; the post-log skipped line says how many were
// because it hurt. Her pain rule (workout-rules section 0) is unchanged: this only RECORDS it.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, LOGS_KEY } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

const FORWARD = '#next, #start-round-2, #ww-skip';
type Row = Record<string, unknown>;

/** The move's name; '' on a screen with no move (round break, cool-down, post-log). */
const NAME = async (page: Page): Promise<string> => {
  if (await page.locator('#start-round-2, .stretch-card, #save-log').first().isVisible()) return '';
  return ((await page.locator('.exercise-name').first().textContent({ timeout: 10_000 })) ??
    '') as string;
};
const ROUND = async (page: Page): Promise<string> =>
  ((await page.locator('.round-indicator').first().textContent({ timeout: 10_000 })) ??
    '') as string;

async function forward(page: Page): Promise<boolean> {
  const f = page.locator(FORWARD);
  if (await f.first().isVisible()) {
    await f.first().click();
    return true;
  }
  return false;
}

async function startA(page: Page): Promise<void> {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('#begin').click();
}

async function walkUntil(page: Page, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 90; i++) {
    if (await done()) return;
    if (!(await forward(page))) return;
  }
  throw new Error('walked 90 steps and never got there');
}

const goToMove = (page: Page, name: string, round?: number): Promise<void> =>
  walkUntil(page, async () => {
    if ((await NAME(page)) !== name) return false;
    return round === undefined || (await ROUND(page)).includes(`Round ${round}`);
  });

const chip = (page: Page, slug: string, feel: 'easy' | 'right' | 'hard') =>
  page.locator(`[data-move-feel-slug="${slug}"][data-move-feel="${feel}"]`);

async function readLogs(page: Page): Promise<Row[]> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), LOGS_KEY);
  return JSON.parse(raw ?? '[]') as Row[];
}

async function toPostLog(page: Page): Promise<void> {
  await walkUntil(page, () => page.locator('#save-log').isVisible());
}

async function saveAndRead(page: Page): Promise<Row> {
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
  const logs = await readLogs(page);
  expect(logs).toHaveLength(1);
  return logs[0]!;
}

const hurt = (page: Page) => page.locator('#this-hurts');

/** Tap This hurts and wait until the page has really moved on (the redraw is not synchronous: a walker that
 *  read the old page next would tap its Done · Next and skip a second move). */
async function tapHurt(page: Page): Promise<void> {
  const before = `${await NAME(page)}|${await ROUND(page)}`;
  await hurt(page).click();
  await expect
    .poll(async () => `${await NAME(page).catch(() => '')}|${await ROUND(page).catch(() => '')}`)
    .not.toBe(before);
}
const skippedLine = (page: Page) => page.locator('.postlog-skipped');

test.describe('v63 item 3: This hurts', () => {
  test('the button is on every kind of move page, and on no other screen', async ({ page }) => {
    await startA(page);
    await expect(page.locator('#ww-skip')).toBeVisible(); // the cardio CHOICE
    await expect(hurt(page)).toHaveCount(0);
    await page.locator('#ww-skip').click();
    const withButton: string[] = [];
    for (let i = 0; i < 60; i++) {
      const name = await NAME(page);
      if (name !== '') {
        await expect(hurt(page), name).toHaveCount(1);
        await expect(hurt(page)).toHaveText('This hurts');
        withButton.push(name);
      } else if (await page.locator('#start-round-2').isVisible()) {
        await expect(hurt(page)).toHaveCount(0); // the round break
      }
      if (!(await forward(page)) || (await page.locator('.stretch-card').isVisible())) break;
    }
    expect(withButton).toEqual(
      expect.arrayContaining(['Belly breathing', 'Glute bridges', 'Wall sit', 'Forearm plank'])
    );
    // the arm moves too (their Easy / Right / Hard is arm_feel; a hurt is the same one tap)
    expect(withButton.some((n) => /curl|row/i.test(n))).toBe(true);
    await expect(page.locator('.stretch-card')).toBeVisible();
    await expect(hurt(page)).toHaveCount(0); // the cool-down list
    await toPostLog(page);
    await expect(hurt(page)).toHaveCount(0); // the post-log
  });

  test('the walk lane has it, and a tap skips the walk', async ({ page }) => {
    await startA(page);
    await page.locator('#ww-start').click(); // Walk outside
    await expect(page.locator('#walk-live')).toBeVisible();
    await expect(hurt(page)).toHaveCount(1);
    await tapHurt(page);
    await expect(page.locator('#wt-toast')).toHaveText('Got it, skipped.');
    expect(await NAME(page)).toBe('Belly breathing'); // on to the next move
  });

  test('the ride (elliptical) page has it, and a hurt ride is saved as ride=hurt', async ({
    page,
  }) => {
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('#ride-plan-line')).toBeVisible();
    await expect(hurt(page)).toHaveCount(1);
    await tapHurt(page);
    expect(await NAME(page)).toBe('Belly breathing');
    await toPostLog(page);
    await expect(skippedLine(page)).toHaveText('1 move skipped (1 because it hurt)');
    const saved = await saveAndRead(page);
    expect(saved['moveFeel']).toBe('ride=hurt');
    expect(saved['stepsSkipped']).toBe(1);
  });

  test('one tap skips the move, says so, and Done does not bring her back to it', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await tapHurt(page);
    await expect(page.locator('#wt-toast')).toHaveText('Got it, skipped.');
    expect(await NAME(page)).toBe('Wall sit'); // the next move
    // the rest of the workout: Glute bridges comes round again in round 2 only, never again in round 1
    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      const name = await NAME(page);
      if (name === 'Glute bridges') seen.push(await ROUND(page));
      if (!(await forward(page)) || (await page.locator('.stretch-card').isVisible())) break;
    }
    expect(seen).toEqual(['Main · Round 2 of 2']);
    // the List sheet does not mark it done
    await page.locator('#next').click(); // Done stretching: on to the post-log
    await expect(page.locator('text=Quick log')).toBeVisible();
  });

  test('it is saved as hurt in move_feel (no qty, even on a hold) and counted in steps_skipped; the post-log line says so', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Wall sit', 1);
    await tapHurt(page);
    await toPostLog(page);
    await expect(skippedLine(page)).toHaveText('1 move skipped (1 because it hurt)');
    const saved = await saveAndRead(page);
    expect(saved['moveFeel']).toBe('wallsit=hurt');
    expect(saved['stepsSkipped']).toBe(1);
  });

  test('a session that never taps it says nothing about hurting', async ({ page }) => {
    await startA(page);
    await toPostLog(page);
    await expect(skippedLine(page)).toHaveCount(0);
    const saved = await saveAndRead(page);
    expect(saved['moveFeel'] ?? null).toBeNull();
    expect(saved['stepsSkipped']).toBe(0);
  });

  test('back to a hurt move and Done takes the hurt off again', async ({ page }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await tapHurt(page);
    expect(await NAME(page)).toBe('Wall sit');
    await page.locator('#step-back').click();
    expect(await NAME(page)).toBe('Glute bridges');
    await page.locator('#next').click(); // she did it after all
    await toPostLog(page);
    await expect(skippedLine(page)).toHaveCount(0);
    const saved = await saveAndRead(page);
    expect(saved['moveFeel'] ?? null).toBeNull();
    expect(saved['stepsSkipped']).toBe(0);
  });

  test('the same move hurt in round 1 and fine in round 2: the LAST word on the move wins, the skipped line still counts the hurt round', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await tapHurt(page);
    await goToMove(page, 'Glute bridges', 2);
    for (const f of ['easy', 'right', 'hard'] as const) {
      await expect(chip(page, 'glutebridges', f)).toHaveAttribute('aria-pressed', 'false'); // hurt is not a chip
    }
    await chip(page, 'glutebridges', 'hard').click();
    await toPostLog(page);
    await expect(skippedLine(page)).toHaveText('1 move skipped (1 because it hurt)');
    const saved = await saveAndRead(page);
    expect(saved['moveFeel']).toBe('glutebridges=hard');
    expect(saved['stepsSkipped']).toBe(1);
  });

  test('hurt in both rounds counts both skipped moves, and says "2 because it hurt"', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await tapHurt(page);
    await goToMove(page, 'Glute bridges', 2);
    await tapHurt(page);
    await toPostLog(page);
    await expect(skippedLine(page)).toHaveText('2 moves skipped (2 because it hurt)');
    const saved = await saveAndRead(page);
    expect(saved['moveFeel']).toBe('glutebridges=hurt');
    expect(saved['stepsSkipped']).toBe(2);
  });

  test('a hurt survives an app close mid-workout', async ({ page, context }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await tapHurt(page);
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.locator('.round-indicator')).toBeVisible();
    await toPostLog(reopened);
    await expect(skippedLine(reopened)).toHaveText('1 move skipped (1 because it hurt)');
    await reopened.locator('#save-log').click();
    await expect(reopened.locator('.home-header h1')).toBeVisible();
    const saved = (await readLogs(reopened))[0]!;
    expect(saved['moveFeel']).toBe('glutebridges=hurt');
  });

  test('the walk lane hurt is saved under "ride"', async ({ page }) => {
    await startA(page);
    await page.locator('#ww-start').click();
    await tapHurt(page);
    await toPostLog(page);
    const saved = await saveAndRead(page);
    expect(saved['moveFeel']).toBe('ride=hurt');
  });

  test('the Session screen names a hurt move with the other feels', async ({ page }) => {
    await page.addInitScript(
      ([k, row]) => window.localStorage.setItem(k as string, JSON.stringify([row])),
      [
        LOGS_KEY,
        {
          id: 'hurt-detail',
          date: '2026-09-20T10:00:00.000Z',
          workout: 'A',
          capacityBefore: 7,
          capacityAfter: 7,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
          stepsSkipped: 1,
          moveFeel: 'wallsit=hurt;glutebridges=easy',
        },
      ] as const
    );
    await page.reload();
    await page.locator('#view-history').click();
    await page.locator('.history-row').first().click();
    await expect(page.locator('#detail-move-feel')).toHaveText(
      'Wall sit hurt · Glute bridges easy'
    );
  });
});
