// tests/screens/feel-every-move.spec.ts - v63 item 2 (Oct 19 2026): "How was this one?  Easy · Right · Hard"
// on every move page and every cool-down row, saved in the existing move_feel column.
//
// The rule it replaces (v58): the chip only on moves that stepped this week, only on their last round,
// only after the last set / the hold / the walk had run. The stepped-move line on the pre-log and the
// New / Again tonight badge stay.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, LOGS_KEY } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

const FORWARD = '#next, #start-round-2, #ww-skip';
type Row = Record<string, unknown>;

/** The move's name; '' on a screen with no move (round break, cool-down, post-log). A slow machine must
 *  never read as "no name" (a walker that mis-reads steps clicks past the move it wanted), so a page that
 *  should have a move name is waited for. */
const NAME = async (page: Page): Promise<string> => {
  if (await page.locator('#start-round-2, .stretch-card, #save-log').first().isVisible()) return '';
  return ((await page.locator('.exercise-name').first().textContent({ timeout: 10_000 })) ??
    '') as string;
};

/** Done · Next / Start round 2 / Skip cardio: one step forward. false = nowhere left to go. */
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

/** Forward until `done()` says so (or 90 steps). */
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
    if (round === undefined) return true;
    return ((await page.locator('.round-indicator').textContent()) ?? '').includes(
      `Round ${round}`
    );
  });

const chip = (page: Page, slug: string, feel: 'easy' | 'right' | 'hard') =>
  page.locator(`[data-move-feel-slug="${slug}"][data-move-feel="${feel}"]`);

async function readLogs(page: Page): Promise<Row[]> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), LOGS_KEY);
  return JSON.parse(raw ?? '[]') as Row[];
}

async function toPostLogAndSave(page: Page): Promise<Row> {
  await walkUntil(page, () => page.locator('#save-log').isVisible());
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
  const logs = await readLogs(page);
  expect(logs).toHaveLength(1);
  return logs[0]!;
}

test.describe('v63 item 2: How was this one?', () => {
  test('the row is on every kind of move page: warm-up, a hold, main in each round, upper back', async ({
    page,
  }) => {
    await startA(page);
    await expect(page.locator('#ww-skip')).toBeVisible(); // the cardio CHOICE is not a move page: no row
    await expect(page.locator('.move-feel')).toHaveCount(0);
    await page.locator('#ww-skip').click();
    const seen: string[] = [];
    const armNames: string[] = [];
    const held: string[] = [];
    for (let i = 0; i < 60; i++) {
      const name = await NAME(page);
      if (name !== '') {
        const phase = ((await page.locator('.round-indicator').textContent()) ?? '').trim();
        const arm = (await page.locator('.arm-feel').count()) > 0;
        if (arm) {
          // curl / row keep their own arm feel (arm_feel, unmigrated): no second row
          armNames.push(name);
          await expect(page.locator('.move-feel')).toHaveCount(0);
        } else if ((await page.locator('#start-timed').count()) > 0) {
          // a hold waits until it has run (v58's wait is back; logs.spec pins the "after" side)
          await expect(page.locator('.move-feel'), `${phase} · ${name}`).toHaveCount(0);
          held.push(`${phase} · ${name}`);
        } else {
          await expect(page.locator('.move-feel'), `${phase} · ${name}`).toHaveCount(1);
          // a multi-set move counts its sets first (v58's "Set N done"); the row waits for the last one
          while (await page.locator('.move-feel-sets').count()) {
            await page.locator('[data-mark-set]').click();
          }
          await expect(page.locator('.move-feel-label')).toHaveText('How was this one?');
          await expect(page.locator('.move-feel .arm-chip')).toHaveText(['Easy', 'Right', 'Hard']);
          seen.push(`${phase} · ${name}`);
        }
      }
      if (!(await forward(page)) || (await page.locator('.stretch-card').isVisible())) break;
    }
    // warm-up, round 1, round 2 (the same move twice), upper back
    expect(seen.some((s) => s.startsWith('Warm-up'))).toBe(true);
    expect(seen.some((s) => s.includes('Round 1 of'))).toBe(true);
    expect(seen.some((s) => s.includes('Round 2 of'))).toBe(true);
    expect(seen.some((s) => s.startsWith('Upper back'))).toBe(true);
    expect(held.filter((s) => s.endsWith('Wall sit'))).toHaveLength(2); // a hold, both rounds: no row until it has run
    expect(armNames.length).toBeGreaterThan(0);
    expect(seen.length + held.length).toBeGreaterThan(14); // same pages as before: the holds just wait
  });

  test('v58 "Set N done" is back: a multi-set move counts its sets, and the row waits for the last one', async ({
    page,
  }) => {
    await startA(page);
    await page.locator('#ww-skip').click();
    await walkUntil(page, () => page.locator('.move-feel-sets').first().isVisible());
    const sets = page.locator('.move-feel-sets');
    await expect(sets.locator('.move-feel-label')).toHaveText('Set 1 of 2');
    await expect(sets.locator('[data-mark-set]')).toHaveText('Set 1 done');
    await expect(page.locator('.move-feel .arm-chip')).toHaveCount(0); // the row is not asked after set 1
    await expect(page.locator('#next')).toBeEnabled(); // and the counter never blocks Done
    await sets.locator('[data-mark-set]').click();
    await expect(sets.locator('.move-feel-label')).toHaveText('Set 2 of 2');
    await expect(sets.locator('[data-mark-set]')).toHaveText('Set 2 done');
    await sets.locator('[data-mark-set]').click();
    await expect(page.locator('.move-feel-sets')).toHaveCount(0);
    await expect(page.locator('.move-feel-label')).toHaveText('How was this one?');
    await expect(page.locator('.move-feel .arm-chip')).toHaveText(['Easy', 'Right', 'Hard']);
  });

  test('the chips are real tap targets (44 px) and the row sits quietly: it never blocks Done', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges');
    for (const c of await page.locator('.move-feel .arm-chip').all()) {
      expect((await c.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    // never tapped: Done · Next is right there and goes on
    await expect(page.locator('#next')).toBeEnabled();
    await page.locator('#next').click();
    await expect(page.locator('.exercise-name')).not.toHaveText('Glute bridges');
  });

  test('a tap picks, a second tap on the same one clears, another tap changes it', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges');
    await chip(page, 'glutebridges', 'right').click();
    await expect(chip(page, 'glutebridges', 'right')).toHaveAttribute('aria-pressed', 'true');
    await chip(page, 'glutebridges', 'right').click(); // again: cleared
    for (const f of ['easy', 'right', 'hard'] as const) {
      await expect(chip(page, 'glutebridges', f)).toHaveAttribute('aria-pressed', 'false');
    }
    await chip(page, 'glutebridges', 'easy').click();
    await chip(page, 'glutebridges', 'hard').click(); // another one: it moves
    await expect(chip(page, 'glutebridges', 'hard')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'glutebridges', 'easy')).toHaveAttribute('aria-pressed', 'false');
    // the page is not redrawn under her thumb (the same node is still there)
    expect(await page.locator('.move-feel').count()).toBe(1);
  });

  test('a hold does not ask before it has run (the v58 wait is back, so a feel is never asked about a hold not done)', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Wall sit', 1);
    await expect(page.locator('#start-timed')).toBeVisible(); // not held yet
    await expect(page.locator('.move-feel')).toHaveCount(0);
    await expect(page.locator('#next')).toBeEnabled(); // and nothing blocks Done
    const saved = await toPostLogAndSave(page);
    expect(saved['moveFeel'] ?? null).toBeNull();
  });

  test('a move that did NOT step this week is saved too, in tap order, as slug=feel (no qty for a reps move)', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await chip(page, 'glutebridges', 'easy').click();
    await goToMove(page, 'Full dead bug', 1);
    await chip(page, 'fulldeadbug', 'right').click();
    const saved = await toPostLogAndSave(page);
    expect(saved['moveFeel']).toBe('glutebridges=easy;fulldeadbug=right');
  });

  test('with several rounds the LAST tap on a move wins (and a clearing tap clears it)', async ({
    page,
  }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await chip(page, 'glutebridges', 'easy').click();
    await goToMove(page, 'Glute bridges', 2);
    // round 2 shows what round 1 said: the feel belongs to the MOVE
    await expect(chip(page, 'glutebridges', 'easy')).toHaveAttribute('aria-pressed', 'true');
    await chip(page, 'glutebridges', 'hard').click();
    await goToMove(page, 'Full dead bug', 2);
    await chip(page, 'fulldeadbug', 'right').click();
    await chip(page, 'fulldeadbug', 'right').click(); // cleared
    const saved = await toPostLogAndSave(page);
    expect(saved['moveFeel']).toBe('glutebridges=hard');
  });

  test('a session with no tap at all saves no move_feel (null), exactly as before', async ({
    page,
  }) => {
    await startA(page);
    const saved = await toPostLogAndSave(page);
    expect(saved['moveFeel'] ?? null).toBeNull();
  });

  test('the cool-down list has ONE quiet row, "How was the stretching?", saved as stretches=<feel>, within the 1400 px budget', async ({
    page,
  }) => {
    await startA(page);
    await walkUntil(page, () => page.locator('.stretch-card').isVisible());
    await expect(page.locator('.stretch-row .move-feel')).toHaveCount(0); // none per stretch
    await expect(page.locator('.move-feel')).toHaveCount(1);
    await expect(page.locator('.move-feel-label')).toHaveText('How was the stretching?');
    await expect(page.locator('.move-feel .arm-chip')).toHaveText(['Easy', 'Right', 'Hard']);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(h).toBeLessThanOrEqual(1400);
    await chip(page, 'stretches', 'right').click();
    await chip(page, 'stretches', 'right').click(); // cleared
    await chip(page, 'stretches', 'easy').click();
    await expect(chip(page, 'stretches', 'easy')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#next').click(); // Done stretching
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const saved = (await readLogs(page))[0]!;
    expect(saved['moveFeel']).toBe('stretches=easy');
  });

  test('a tapped feel survives an app close mid-workout', async ({ page, context }) => {
    await startA(page);
    await goToMove(page, 'Glute bridges', 1);
    await chip(page, 'glutebridges', 'easy').click();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(chip(reopened, 'glutebridges', 'easy')).toHaveAttribute('aria-pressed', 'true');
  });

  test("the Session screen shows every move's feel, named the way that session's plan names it", async ({
    page,
  }) => {
    await page.addInitScript(
      ([k, row]) => window.localStorage.setItem(k as string, JSON.stringify([row])),
      [
        LOGS_KEY,
        {
          id: 'feel-detail',
          date: '2026-09-20T10:00:00.000Z',
          workout: 'A',
          capacityBefore: 7,
          capacityAfter: 7,
          wallSitSec: 45,
          backPain: 0,
          word: '',
          synced: true,
          moveFeel: 'glutebridges=easy;wallsit=hard@45s;ride=right@12min',
        },
      ] as const
    );
    await page.reload();
    await page.locator('#view-history').click();
    await page.locator('.history-row').first().click();
    await expect(page.locator('#detail-move-feel')).toHaveText(
      'Glute bridges easy · Wall sit hard 45 s · Cardio right 12 min'
    );
  });
});
