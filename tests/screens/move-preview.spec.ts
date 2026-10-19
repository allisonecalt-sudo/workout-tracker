// tests/screens/move-preview.spec.ts - v63 item 4 (Oct 19 2026), pre-log half: tap a move name in the
// pre-log "What's in it" overview to open a read-only sheet with the move's existing content.
//
// (Home's Up next card is NOT part of this build: its names sit inside the card that is itself the Start
// button, and about sixty older tests tap that card's centre. See the commit message.)
//
// Read-only means: nothing about the move or the session changes. Nothing is saved, no how-to is marked
// "seen", and the sheet keeps its own open / closed choices (it never touches the workout's).
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

const TUE_WEEK4 = '2026-09-22T14:00:00.000Z';

async function prelog(page: Page): Promise<void> {
  await mockDate(page, TUE_WEEK4);
  await page.goto('/');
  await page.locator('button[data-workout="B"]').click();
  await page.locator('.prelog-overview-summary').click();
  await expect(page.locator('.overview-phase-items [data-preview-move]').first()).toBeVisible();
}

const sheet = (page: Page) => page.locator('#move-sheet');
const names = (page: Page) => page.locator('.overview-phase-items [data-preview-move]');

const footprint = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith('workout-tracker:') && !k.includes('setting-'))
      .filter((k) => !k.includes('active-session'))
      .sort();
    return JSON.stringify(keys.map((k) => [k, localStorage.getItem(k)]));
  });

test.describe('v63 item 4: tap a move in the pre-log overview to preview it', () => {
  test('every name is tappable, the text reads exactly as before, and a tap opens that move', async ({
    page,
  }) => {
    await prelog(page);
    const rows = page.locator('.overview-phase-items');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let r = 0; r < count; r++) {
      const text = ((await rows.nth(r).textContent()) ?? '').trim();
      const links = (await rows.nth(r).locator('[data-preview-move]').allTextContents()).join(
        ' · '
      );
      expect(links).toBe(text); // every word of the row is a name, joined as before
    }
    const first = names(page).first();
    const name = ((await first.textContent()) ?? '').trim();
    await first.click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator('#move-sheet-name')).toHaveText(name);
    await expect(page.locator('#begin')).toBeVisible(); // still the pre-log: nothing started
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
  });

  test("the sheet is read-only: no Done, no feel row, no hurt button, nothing to type into; closing leaves the app's state as it was", async ({
    page,
  }) => {
    await prelog(page);
    const before = await footprint(page);
    await names(page).first().click();
    for (const sel of ['#next', '.move-feel', '#this-hurts', 'input', 'textarea']) {
      await expect(sheet(page).locator(sel)).toHaveCount(0);
    }
    await sheet(page).locator('#move-sheet-x').click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await footprint(page)).toBe(before);
  });

  test("the sheet shows the move's existing picture, voice note, detail and how-to cards, and its toggles work inside it", async ({
    page,
  }) => {
    await prelog(page);
    await page.locator('[data-preview-move$="|warmup|1"]').click();
    await expect(sheet(page).locator('.exercise-visual')).toBeVisible();
    await expect(sheet(page).locator('.voice-note-btn')).toBeVisible();
    await expect(sheet(page).locator('.detail-card')).toBeVisible();
    const steps = sheet(page).locator('[data-toggle-section$="::steps"]');
    await expect(steps).toHaveAttribute('aria-expanded', 'false');
    await steps.click();
    await expect(sheet(page).locator('[data-toggle-section$="::steps"]')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(sheet(page).locator('.detail-steps')).toBeVisible();
    await sheet(page).locator('[data-toggle-section$="::steps"]').click();
    await expect(sheet(page).locator('.detail-steps')).toHaveCount(0);
    await expect(sheet(page).locator('.how-to-card')).toHaveClass(/how-to-open/);
    await sheet(page).locator('[data-toggle-howto]').click();
    await expect(sheet(page).locator('.how-to-card')).not.toHaveClass(/how-to-open/);
  });

  test('reading a how-to in the sheet does not mark it "seen" and changes no saved state', async ({
    page,
  }) => {
    await prelog(page);
    const before = await footprint(page);
    const n = await names(page).count();
    for (let i = 0; i < Math.min(n, 8); i++) {
      await names(page).nth(i).click();
      await sheet(page)
        .locator('[data-toggle-howto]')
        .first()
        .click({ timeout: 800 })
        .catch(() => undefined);
      await page.keyboard.press('Escape');
    }
    const after = await footprint(page);
    expect(after.includes('howto-seen')).toBe(false);
    expect(after).toBe(before);
  });

  test('close returns to the same scroll position, from the corner x, the Close button, Escape and the backdrop', async ({
    page,
  }) => {
    await prelog(page);
    for (const how of ['x', 'button', 'escape', 'backdrop'] as const) {
      await names(page).first().click();
      await expect(sheet(page)).toBeVisible();
      const y = await page.evaluate(() => window.scrollY);
      if (how === 'x') await sheet(page).locator('#move-sheet-x').click();
      else if (how === 'button') {
        await sheet(page).locator('#move-sheet-close').scrollIntoViewIfNeeded();
        await sheet(page).locator('#move-sheet-close').click();
      } else if (how === 'escape') await page.keyboard.press('Escape');
      else await sheet(page).click({ position: { x: 6, y: 6 } });
      await expect(sheet(page)).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(y);
    }
  });

  test('the sheet opens the move the row names, from the plan this session is pinned to', async ({
    page,
  }) => {
    await prelog(page);
    const main = page.locator('.overview-phase-items').nth(1);
    const name = ((await main.locator('[data-preview-move]').first().textContent()) ?? '').trim();
    await main.locator('[data-preview-move]').first().click();
    await expect(page.locator('#move-sheet-name')).toHaveText(name);
  });
});
