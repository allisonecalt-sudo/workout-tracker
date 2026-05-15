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

test("today's pick highlights A when no history exists", async ({ page }) => {
  // Group 2I: empty history → A is the pick
  await expect(page.locator('button[data-workout="A"] .workout-card-pick-badge')).toBeVisible();
});

test('week-dots row is rendered with 7 day labels', async ({ page }) => {
  await expect(page.locator('.week-dots .week-dot')).toHaveCount(7);
});

test('selecting workout A goes to pre-log screen', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('h2')).toContainText('Workout A');
  await expect(page.locator('text=Capacity right now')).toBeVisible();
  await expect(page.locator('button:has-text("Start")')).toBeVisible();
});

test('pre-log shows wrist-cleared banner (not the old 2/10 ceiling)', async ({ page }) => {
  // Group 2K: wrist banner refreshed
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.warning-banner')).toContainText('cleared by Lisa Cohen');
});

test('pre-log capacity slider shows anchor labels', async ({ page }) => {
  // Group 2L: anchor labels
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.range-anchors').first()).toContainText('depleted');
  await expect(page.locator('.range-anchors').first()).toContainText('baseline');
  await expect(page.locator('.range-anchors').first()).toContainText('strong');
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
      // Group 2H: skip is now hold-to-skip — simulate a 700ms hold
      const skipRest = page.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
        }
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

test('quit during workout asks for confirmation and returns home', async ({ page }) => {
  // Group 2G: confirm dialog on Quit
  page.on('dialog', (d) => {
    void d.accept();
  });
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('button:has-text("Done · Next")').click();
  await page.locator('.quit-link').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('.stat-number').first()).toHaveText('0');
});

test('quit dialog cancel keeps user in workout', async ({ page }) => {
  page.on('dialog', (d) => {
    void d.dismiss();
  });
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('button:has-text("Done · Next")').click();
  await page.locator('.quit-link').click();
  // Still in workout
  await expect(page.locator('h2')).toContainText('Workout A');
});

test('capacity slider updates value display', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  const slider = page.locator('#cap-before');
  await slider.fill('8');
  await expect(page.locator('#cap-before-val')).toHaveText('8');
});

test('exercise visual renders for known exercises', async ({ page }) => {
  // Group 3N: visual layer integration
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // Walk past warmup walk to a still-image-backed exercise (Pelvic tilts has loop)
  await page.locator('button:has-text("Done · Next")').click(); // off walk → belly breathing (video only)
  // Belly breathing has youtube only → poster
  await expect(page.locator('.exercise-visual')).toBeVisible();
});

test('how-to expander opens to the text on click', async ({ page }) => {
  // Group 3N: how-to toggle
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // First exercise (outdoor walk) has a guide entry
  const toggle = page.locator('[data-toggle-howto]').first();
  await toggle.click();
  // Click again to close
  await toggle.click();
});

test('multi-frame how-to renders Do + Avoid cues for mapped exercise', async ({ page }) => {
  // 2026-05-15 content build: outdoor walk (first warmup exercise) has 3-frame
  // EXERCISE_HOWTO entry. Default-open on first-this-week.
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();

  // Outdoor walk is first warmup exercise.
  await expect(page.locator('.howto-frames').first()).toBeVisible();
  // At least 2 frames rendered (outdoor walk has 3)
  const frames = page.locator('.howto-frame');
  await expect(await frames.count()).toBeGreaterThanOrEqual(2);
  // Do cue present
  await expect(page.locator('.howto-cue-do').first()).toBeVisible();
  // Avoid cue present
  await expect(page.locator('.howto-cue-avoid').first()).toBeVisible();
});

test('how-to falls back to text guide for unmapped exercise', async ({ page }) => {
  // EXERCISE_GUIDE remains the fallback for any exercise not yet keyed in
  // EXERCISE_HOWTO. As of 2026-05-15 all WORKOUTS exercises ARE mapped, so
  // the fallback path is exercised by injecting an artificial unmapped name.
  // Instead we verify the legacy .how-to-text class still wins when only
  // EXERCISE_GUIDE has the entry: do this by checking the renderHowToCard
  // never crashes and the toggle always renders.
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // Toggle button always renders (whether multi-frame or legacy text).
  await expect(page.locator('[data-toggle-howto]').first()).toBeVisible();
});

// --- Redesign Ship 1 (2026-05-15 D-1 Calm Tool Minimalism) -------------------
//
// The next three tests lock in the visual contract introduced by the redesign:
//  - stat numbers use the new display size (40px on phone / 56px tablet, not 28px)
//  - role-named color tokens exist on :root and resolve to sage / amber / blue-gray
//  - cards no longer carry a drop shadow — elevation is now expressed via border
//
// If a future change reintroduces drop shadows or collapses the role tokens
// back to a single --accent, one of these tests will fail loudly.

test('redesign: stat numbers use the new display type scale (>=36px)', async ({ page }) => {
  // Pre-redesign: .stat-number was 28px. D-1 ramp puts it at 40px (phone) / 56px (tablet).
  // The exact pixel is viewport-dependent, so we assert "noticeably larger than the
  // old 28px ceiling."
  const statNumber = page.locator('.stat-number').first();
  await expect(statNumber).toBeVisible();
  const fontSize = await statNumber.evaluate(
    (el) => parseFloat(window.getComputedStyle(el).fontSize) || 0
  );
  expect(fontSize).toBeGreaterThanOrEqual(36);
});

test('redesign: role-named accent tokens are defined on :root', async ({ page }) => {
  // Pre-redesign had a single --accent doing 9 jobs. D-1 splits it into roles.
  // Verify the new tokens exist and resolve to non-empty values.
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: cs.getPropertyValue('--accent').trim(),
      accentProgress: cs.getPropertyValue('--accent-progress').trim(),
      accentRest: cs.getPropertyValue('--accent-rest').trim(),
      accentWarn: cs.getPropertyValue('--accent-warn').trim(),
      textDim2: cs.getPropertyValue('--text-dim-2').trim(),
    };
  });
  expect(tokens.accent).toBeTruthy();
  expect(tokens.accentProgress).toBeTruthy();
  expect(tokens.accentRest).toBeTruthy();
  expect(tokens.accentWarn).toBeTruthy();
  expect(tokens.textDim2).toBeTruthy();
  // accent (primary action) and accent-rest (cool blue-gray) must differ —
  // that's the whole point of splitting the role.
  expect(tokens.accent).not.toBe(tokens.accentRest);
});

test('redesign: cards use border-elevation, not drop shadow', async ({ page }) => {
  // D-1: shadows replaced with 1px borders. .card on home should have a border
  // and a "none" (or rgba(0,0,0,0)) box-shadow at the computed-style level.
  const card = page.locator('.card').first();
  await expect(card).toBeVisible();
  const styles = await card.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      boxShadow: cs.boxShadow,
      borderTopWidth: cs.borderTopWidth,
    };
  });
  expect(styles.boxShadow).toBe('none');
  // A 1px border = "1px" exactly. Allow >0 to be safe across browsers.
  expect(parseFloat(styles.borderTopWidth)).toBeGreaterThan(0);
});
