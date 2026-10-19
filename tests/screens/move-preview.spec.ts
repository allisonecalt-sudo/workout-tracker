// tests/screens/move-preview.spec.ts - v63 item 4 (Oct 19 2026), pre-log half: tap a move name in the
// pre-log "What's in it" overview to open a read-only sheet with the move's existing content.
//
// Home: the Up next card stays ONE Start button; a separate quiet link under it opens a list of the moves.
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

test.describe('v63 item 4: Home - 👁 Preview the moves', () => {
  async function home(page: Page): Promise<void> {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await expect(page.locator('.home-hero')).toBeVisible();
  }
  const list = (page: Page) => page.locator('#move-list-sheet');

  test('the card is still one Start button and the link sits under it, outside it', async ({
    page,
  }) => {
    await home(page);
    await expect(page.locator('button.home-hero')).toHaveCount(1);
    await expect(
      page.locator('.home-hero [data-preview-move], .home-hero #home-preview-moves')
    ).toHaveCount(0);
    await expect(page.locator('#home-preview-moves')).toHaveText('👁 Preview the moves');
    const hero = (await page.locator('.home-hero').boundingBox())!;
    const link = (await page.locator('#home-preview-moves').boundingBox())!;
    expect(link.y).toBeGreaterThanOrEqual(hero.y + hero.height - 1);
    expect(link.height).toBeGreaterThanOrEqual(44);
  });

  test('the link opens the list (names + amounts), a name opens the preview, Close returns to Home at the same scroll', async ({
    page,
  }) => {
    await home(page);
    await page.evaluate(() => window.scrollTo(0, 60));
    await page.locator('#home-preview-moves').click();
    await expect(list(page)).toBeVisible();
    const y = await page.evaluate(() => window.scrollY);
    await expect(list(page).locator('.move-list-row').first()).toBeVisible();
    expect(await list(page).locator('.move-list-row').count()).toBeGreaterThan(10);
    await expect(
      list(page).locator('.move-list-row').first().locator('.move-list-reps')
    ).not.toBeEmpty();
    const name = (
      (await list(page).locator('.move-list-row span').first().textContent()) ?? ''
    ).trim();
    await list(page).locator('.move-list-row').first().click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator('#move-sheet-name')).toHaveText(name);
    await page.keyboard.press('Escape'); // closes the preview only
    await expect(sheet(page)).toHaveCount(0);
    await expect(list(page)).toBeVisible();
    await list(page).locator('#move-list-close').scrollIntoViewIfNeeded();
    await list(page).locator('#move-list-close').click();
    await expect(list(page)).toHaveCount(0);
    await expect(page.locator('.home-hero')).toBeVisible(); // still Home, nothing started
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
  });

  test('the card still starts the workout with a tap in its middle', async ({ page }) => {
    await home(page);
    await page.locator('button[data-workout="A"]').click();
    await expect(page.locator('#begin')).toBeVisible();
    await expect(list(page)).toHaveCount(0);
  });
});
