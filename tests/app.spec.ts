import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

// v48 (Sep 24 2026): the full note sits behind a closed toggle — the card face
// carries only the one safety line. v53 (Sep 26 2026): that toggle is "Tips ▸"
// now, was "Cue ▸" (her words: "it seems to do nothing"). Tests that read it
// open it first.
// v48 · P3 (Sep 24 2026): the cardio CHOICE step has no Done · Next — its way
// on is the quiet "Skip cardio today" (#ww-skip). One tap forward on any step.
const NEXT = 'button:has-text("Done ·"), #ww-skip';

// WK2 (Sep 27 2026): the completion-based week model's real launch instant —
// week.ts's own COMPLETION_WEEKS_FROM.at, duplicated here (not imported —
// this file mocks `window.Date`, and week.ts is a Node-side import in
// week.test.ts, not loaded into the page) so tests that need a deterministic
// "day 1" can mockDate to the exact same moment app.ts reads.
const COMPLETION_WEEKS_FROM_ISO = '2026-09-26T22:30:00+03:00';

async function openCue(page: Page): Promise<void> {
  const toggle = page.locator('.tips-section .detail-section-toggle[aria-expanded="false"]');
  if (await toggle.count()) await toggle.first().click();
}

// v48 · P4 (Sep 24 2026): home = the "Up next" hero + B/C chips — still three
// ways in (all data-workout), and the one week line carries the count.
// v54 (Sep 27 2026): a 4th data-workout button joined — Workout D's own
// "D · Cardio 30" chip, always on Home, extra to the A/B/C rotation.
test('home screen shows three workout options and zero sessions', async ({ page }) => {
  await expect(page.locator('.home-header h1')).toBeVisible();
  await expect(page.locator('button[data-workout]')).toHaveCount(4);
  await expect(page.locator('.home-hero')).toContainText('Workout A');
  // v55 (Sep 27 2026): the hero line + chips read her fixed short label
  // ("Lower + back", not the workout's own longer `name`) — see
  // WORKOUT_SHORT_LABEL's comment (her Sep 27 20:30 "is it only glutes?").
  await expect(page.locator('.home-hero')).toContainText('Lower + back');
  await expect(page.locator('button.btn-chip[data-workout="B"]')).toHaveText('B · Glutes + back');
  await expect(page.locator('button.btn-chip[data-workout="C"]')).toHaveText('C · Cardio');
  await expect(page.locator('button.btn-chip[data-workout="D"]')).toHaveText('D · Cardio 30');
  // WK2 (Sep 27 2026): "now" (no mockDate here) is permanently past the real
  // completion-model launch (Sep 26 2026 22:30) from here on, so a clean,
  // zero-session fixture reads the completion model's own "nothing done yet"
  // line (§2.4's #week-count table), not the old calendar "this week" line.
  await expect(page.locator('.week-line')).toContainText('0 of 3 · A, B and C to go');
  // v49 · look (Sep 25 2026): the lifetime count moved off the week line and
  // onto the Start → Now card's "Sessions" row — which itself only appears
  // once there's at least one session (spec: "Only one count on Home").
  await expect(page.locator('.week-line')).not.toContainText('total');
  await expect(page.locator('.home-startnow-card')).toHaveCount(0);
});

test("today's pick highlights A when no history exists", async ({ page }) => {
  // Group 2I: empty history → A is the pick (v48 · P4: the "Up next" hero).
  await expect(page.locator('button.workout-card-pick[data-workout="A"]')).toContainText('Up next');
});

test('week-dots row is rendered with 7 day labels', async ({ page }) => {
  // WK2 (Sep 27 2026): the strip is now exactly as long as the shown week
  // (§2.4), not a fixed calendar 7 — pinned to the launch instant itself
  // (day 1) for a deterministic single-column count; a real "now" days later
  // would show more columns, capped at 10 (completionWeekDots).
  await mockDate(page, COMPLETION_WEEKS_FROM_ISO);
  await page.goto('/');
  await expect(page.locator('.week-dots .week-dot')).toHaveCount(1);
});

test('selecting workout A goes to pre-log screen', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('h2')).toContainText('Workout A');
  // Label reworded Sep 7 2026 (was "Capacity right now") — see the anchor-label
  // test below for why. This assertion only needs a marker that pre-log rendered.
  await expect(page.locator('text=not your mood')).toBeVisible();
  await expect(page.locator('button:has-text("Start")')).toBeVisible();
});

test('pre-log wrist line: one grey line on A (pressure fine, pain = stop), no amber banner', async ({
  page,
}) => {
  // Group 2K, refreshed twice (May 10 → the Jul 3 wall-lean on-ramp → Sep 7:
  // "i can go on my arms i just have to stop with pain"). v48 · P5 (Sep 24
  // 2026): the 58-word amber box, the same every session, became ONE grey line
  // on workouts with a palm or grip move (DECISIONS §5). It still states
  // today's permission — pressure fine, pain = stop — and never the old
  // "cleared May 10" wording.
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.warning-banner')).toHaveCount(0);
  await expect(page.locator('.safety-line')).toHaveText(
    'Wrist + back: pressure fine, pain = stop.'
  );
  await expect(page.locator('#app')).not.toContainText('May 10');
});

test('pre-log body reading asks about the BODY, not mood, and shows anchor labels', async ({
  page,
}) => {
  // Group 2L: anchor labels. Reworded Sep 7 2026 — she said of her three
  // Round-2 logs "5 is just my mood its getting beter ... but stil lets say
  // now at 8", i.e. the slider had been collecting a mood reading under a
  // capacity label, which quietly invalidated the under-recovery watch
  // signal (capacity-after < capacity-before for 2+ sessions → dial back).
  // The label now says which one it wants; the anchors avoid mood words.
  // v48 · P5: the slider became 1-10 chips; the anchors are one short line.
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.label-text').first()).toContainText('not your mood');
  await expect(page.locator('.body-anchor').first()).toHaveText('1 empty · 5 ordinary · 10 strong');
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
    // Matches both the stepped "Done · Next" and the cool-down list's
    // single "Done · Finish" button.
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
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

  // v48 · P5: C has no wall sit, so no wall-sit field; the one-word box merged
  // into the note, which the Sessions row shows.
  await expect(page.locator('#wallsit')).toHaveCount(0);
  await page.locator('#session-note').fill('proud');

  await page.locator('#save-log').click();

  await expect(page.locator('.home-header h1')).toBeVisible();
  // v49 · look (Sep 25 2026): the lifetime count lives in the Start → Now
  // card's "Sessions" row, not the week line (spec: "Only one count on Home").
  await expect(page.locator('.home-startnow-card .start-now-row').last()).toContainText('Sessions');
  await expect(page.locator('.home-startnow-card .start-now-row').last()).toContainText('1');
  await page.locator('#view-history').click();
  await expect(page.locator('.history-word').first()).toContainText('proud');
});

// Cool-down stretches render as ONE scrollable list (Allison 2026-06-06), not
// stepped cards — no per-stretch video, no per-stretch timer.
test('cool-down renders as a single stretch list with no per-stretch video', async ({ page }) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toBeVisible();

  let reachedStretch = false;
  for (let i = 0; i < 40; i++) {
    const phase =
      (await page
        .locator('.round-indicator')
        .textContent()
        .catch(() => '')) ?? '';
    // v48 · P7: the cool-down chip counts her rows ("Stretch · 11").
    if (phase.includes('Stretch ·')) {
      reachedStretch = true;
      break;
    }
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    } else {
      const skipRest = page.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
        }
      }
    }
  }

  expect(reachedStretch).toBe(true);
  // Single list, multiple rows, and NO per-stretch video on this screen.
  await expect(page.locator('.stretch-list')).toBeVisible();
  expect(await page.locator('.stretch-row').count()).toBeGreaterThan(1);
  await expect(page.locator('.exercise-visual')).toHaveCount(0);
  // The single finish button ends the session straight to post-log.
  await page.locator('button:has-text("Done · Finish")').click();
  await expect(page.locator('text=Quick log')).toBeVisible();
});

// Upper-back block (Lisa Cohen May 31) — a once-per-session phase between main
// and cooldown, in workouts A + B only. Workout B has no timed exercises before
// it, so we can drive straight through with Done·Next / skip-rest.
test('workout B reaches the upper-back phase after main (wall angels, unloaded)', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toBeVisible();

  let reachedUpperBack = false;
  for (let i = 0; i < 40; i++) {
    const phase =
      (await page
        .locator('.round-indicator')
        .textContent()
        .catch(() => '')) ?? '';
    if (phase.includes('Upper back')) {
      reachedUpperBack = true;
      break;
    }
    const nextBtn = page.locator('button:has-text("Done · Next"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    } else {
      const skipRest = page.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
        }
      }
    }
  }

  expect(reachedUpperBack).toBe(true);
  // First upper-back move is the unloaded wall angels — no 1 kg yet.
  await expect(page.locator('.exercise-name')).toHaveText('Wall angels');
});

// Workout C is the walk day — it must NOT get the upper-back block.
test('workout C has no upper-back phase in its overview', async ({ page }) => {
  await page.locator('button[data-workout="C"]').click();
  const labels = await page.locator('.overview-phase-label').allTextContents();
  expect(labels).not.toContain('Upper back');
});

// v48 · fix r1 (Sep 24 2026): a plain tap on Quit opens the in-app panel —
// Cancel / Quit / Log what I did — never the native OK/Cancel window.confirm
// (which had no "Log what I did" and threw the half session away).
test('quit during workout asks for confirmation and returns home', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click();
  await page.locator('.quit-link').click();
  const panel = page.locator('#quit-confirm-panel');
  await expect(panel).toBeVisible();
  // v48 · fix r2 (Sep 25 2026): the kind way out first — Log what I did, then
  // Cancel, then a quiet "Quit without saving" (no filled orange Quit).
  await expect(panel.locator('button')).toHaveText([
    'Log what I did',
    'Cancel',
    'Quit without saving',
  ]);
  await expect(panel.locator('#quit-yes')).toHaveClass(/back-link/);
  // The panel slides in; measure once it has settled (flaked once on CI,
  // Sep 25 2026, when the boxes were read mid-animation).
  await expect(async () => {
    const log = (await panel.locator('#quit-log').boundingBox())!;
    const cancel = (await panel.locator('#quit-cancel').boundingBox())!;
    const quit = (await panel.locator('#quit-yes').boundingBox())!;
    expect(log.y).toBeLessThan(cancel.y);
    expect(cancel.y).toBeLessThan(quit.y);
    expect(log.width).toBeGreaterThan(cancel.width - 1); // full width
  }).toPass({ timeout: 3000 });
  await panel.locator('#quit-yes').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
  // WK2 (Sep 27 2026): see the "zero sessions" test's own comment above.
  await expect(page.locator('.week-line')).toContainText('0 of 3 · A, B and C to go');
  expect(dialogs).toEqual([]);
});

test('quit panel Cancel keeps user in workout', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click();
  const nameBefore = await page.locator('.exercise-name').textContent();
  await page.locator('.quit-link').click();
  await page.locator('#quit-cancel').click();
  await expect(page.locator('#quit-confirm-panel')).toHaveCount(0);
  // Still in workout, on the same step
  await expect(page.locator('h2')).toContainText('Workout A');
  await expect(page.locator('.exercise-name')).toHaveText(nameBefore ?? '');
  expect(dialogs).toEqual([]);
});

// Pause (Allison Jul 7 2026): the pill freezes the workout behind a full
// overlay and Resume returns her to the same exercise, nothing lost.
test('pause overlay opens and resume returns to the same exercise', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toBeVisible();
  const firstExercise = await page.locator('.exercise-name').textContent();

  // v46: the control lives in the screen header, left of Quit (the old fixed
  // pill sat on top of Start timer on the elliptical screen); tapping it opens
  // the overlay.
  await expect(page.locator('.screen-header #pause-toggle')).toBeVisible();
  await expect(page.locator('.pause-fab')).toHaveCount(0);
  await page.locator('#pause-toggle').click();
  await expect(page.locator('#paused-overlay')).toBeVisible();
  await expect(page.locator('#pause-toggle')).toHaveCount(0); // button hidden while paused

  // Resume closes the overlay and lands back on the same exercise.
  await page.locator('#pause-resume').click();
  await expect(page.locator('#paused-overlay')).toHaveCount(0);
  await expect(page.locator('#pause-toggle')).toBeVisible();
  await expect(page.locator('.exercise-name')).toHaveText(firstExercise ?? '');
});

// Enriched detail card (Allison Jul 9 2026): the face shows only the important,
// low-reading things (voice note + muscle target); Steps / Do & Don't / Common
// mistakes are collapsed dropdowns she taps to open. "show whats important,
// everything else i click to open."
test('enriched detail card: face shows voice + muscle, sections are click-to-open dropdowns', async ({
  page,
}) => {
  await mockDate(page, '2026-05-25T10:00:00.000Z'); // Week 4 — Session A reaches squats after 4 warmup taps
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 4; i++) {
    await page.locator(NEXT).click();
  }
  await expect(page.locator('.exercise-name')).toHaveText('Bodyweight squats');

  // Face: voice note + muscle diagram visible with no tap; label names the target.
  await expect(page.locator('.voice-note-btn')).toBeVisible();
  await expect(page.locator('.muscle-svg')).toBeVisible();
  await expect(page.locator('.muscle-target-label')).toContainText('Quads');

  // Dropdowns closed by default — the step list isn't in the DOM until opened.
  await expect(page.locator('.detail-steps')).toHaveCount(0);

  // Open "Steps" → the 5 numbered steps appear.
  await page.locator('.detail-section-toggle', { hasText: 'Steps' }).click();
  await expect(page.locator('.detail-steps li')).toHaveCount(5);

  // Open "Common mistakes" independently — both stay open (not an accordion).
  await page.locator('.detail-section-toggle', { hasText: 'Common mistakes' }).click();
  await expect(page.locator('.detail-mistakes li')).toHaveCount(3);
  await expect(page.locator('.detail-steps li')).toHaveCount(5);

  // Collapse "Steps" again → gone from the DOM.
  await page.locator('.detail-section-toggle', { hasText: 'Steps' }).click();
  await expect(page.locator('.detail-steps')).toHaveCount(0);
});

// v48 · P5: the body reading is a chip — tap selects it, tap again clears it.
test('body chip: tap selects the number, a second tap clears it', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('#cap-before-8').click();
  await expect(page.locator('#cap-before-8')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-body-chip="cap-before"][aria-checked="true"]')).toHaveCount(1);
  await page.locator('#cap-before-8').click();
  await expect(page.locator('[data-body-chip="cap-before"][aria-checked="true"]')).toHaveCount(0);
});

// v50 · mood (Sep 25 2026): the same chip component, a second row under BODY —
// her words (04:45): "mood 1 being irritable to being happy and or calm".
test('mood chip: tap selects the number, a second tap clears it — independent of the BODY row', async ({
  page,
}) => {
  await page.locator('button[data-workout="A"]').click();
  // Both rows present, blank by default.
  await expect(page.locator('[data-body-chip="cap-before"]')).toHaveCount(10);
  await expect(page.locator('[data-body-chip="mood-before"]')).toHaveCount(10);
  await expect(page.locator('[data-body-chip][aria-checked="true"]')).toHaveCount(0);

  await page.locator('#mood-before-9').click();
  await expect(page.locator('#mood-before-9')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-body-chip="mood-before"][aria-checked="true"]')).toHaveCount(1);
  // The BODY row is untouched by the mood tap.
  await expect(page.locator('[data-body-chip="cap-before"][aria-checked="true"]')).toHaveCount(0);

  await page.locator('#mood-before-9').click();
  await expect(page.locator('[data-body-chip="mood-before"][aria-checked="true"]')).toHaveCount(0);
});

// v46: a slider she never moved is not a reading. The three sliders start at
// 5/5/0 and used to save as if she chose them — capacity-after was exactly 5 in
// 6 of 8 sessions since Aug 30, a "decline" the mirror invented (UX audit
// Sep 24). Untouched → null ("—"); moved → her number.
async function walkToPostLog(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) return;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else return;
  }
}

test('untouched sliders (v46): a workout with no slider moved saves null, not 5/5/0', async ({
  page,
}) => {
  await page.locator('button[data-workout="C"]').click();
  // v48 · P5 (DECISIONS Q6): the chips start BLANK — no number is shown as
  // chosen, so there is nothing to mistake for a reading.
  await expect(page.locator('[data-body-chip][aria-checked="true"]')).toHaveCount(0);
  await page.locator('button:has-text("Start")').click();
  await walkToPostLog(page);
  await expect(page.locator('[data-body-chip][aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator('#back-fine')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs).toHaveLength(1);
  expect(logs[0]?.['capacityBefore']).toBeNull();
  expect(logs[0]?.['capacityAfter']).toBeNull();
  expect(logs[0]?.['backPain']).toBeNull();
  // v50 · mood: a mood chip never tapped is not a reading either — same rule.
  expect(logs[0]?.['moodBefore']).toBeNull();
  expect(logs[0]?.['moodAfter']).toBeNull();
  // And the row reads "—", never an invented number. (v48 · P4: the "Last: …
  // capacity" line left home; the same row reads it in Sessions.)
  await page.locator('#view-history').click();
  await expect(page.locator('.history-row .history-meta').first()).toContainText('cap —→—');
});

test('untouched sliders (v46): a slider she DID move saves her number; the others stay null', async ({
  page,
}) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('#cap-before-7').click();
  await page.locator('button:has-text("Start")').click();
  await walkToPostLog(page);
  await page.locator('#back-some').click();
  // v53 (Sep 26 2026): the back/wrist chip is drawn in FEEL now (her fix:
  // "It was the opposite of what it meant" / "flip it... make it all
  // align") — button #back-2 still means "feel 2", which now SAVES as pain
  // 8 (painFromFeel: pain = 10 − feel), not pain 2.
  await page.locator('#back-2').click();
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs[0]?.['capacityBefore']).toBe(7);
  expect(logs[0]?.['capacityAfter']).toBeNull();
  expect(logs[0]?.['backPain']).toBe(8);
});

// v50 · mood: mood-before survives from pre-log, mood-after from post-log —
// independently of capacity, the same way the two capacity chips are independent.
test('mood chips (v50): a moved mood chip saves her number; the untouched half stays null', async ({
  page,
}) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('#mood-before-8').click();
  await page.locator('button:has-text("Start")').click();
  await walkToPostLog(page);
  await page.locator('#mood-after-3').click();
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs[0]?.['moodBefore']).toBe(8);
  expect(logs[0]?.['moodAfter']).toBe(3);
  // Capacity was never touched this session — still null.
  expect(logs[0]?.['capacityBefore']).toBeNull();
  expect(logs[0]?.['capacityAfter']).toBeNull();
});

// v46: every new screen / step lands at the top. Done·Next at the bottom of one
// step used to open the next step at the same scroll depth, with the exercise
// name off the top of the screen (22 of 22 steps, UX audit Sep 24).
test('scroll (v46): Done·Next opens the next step at the top of the page', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toBeVisible();
  // Two steps in: the second step carries a long detail card, so the Done·Next
  // tap on it happens well below the fold.
  await page.locator(NEXT).click();
  await page.locator(NEXT).click();
  await expect(page.locator('.exercise-name')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await page.locator('.exercise-name').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
});

test('exercise visual renders for known exercises', async ({ page }) => {
  // Group 3N: visual layer integration
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // Walk past warmup walk to Belly breathing (no curated JPG).
  await page.locator(NEXT).click();
  await expect(page.locator('.exercise-visual')).toBeVisible();
});

// Allison 2026-06-06: every actual exercise shows a PICTURE + a video. Exercises
// with no curated JPG promote their how-to illustration to the main screen
// instead of showing only a "watch video" poster.
test('video-only exercise still shows a picture, with the video one tap away', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // Off the walk → Belly breathing (no loop JPG; promotes its how-to SVG).
  await page.locator(NEXT).click();
  await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');
  await expect(page.locator('.exercise-visual-still')).toBeVisible();
  await expect(page.locator('.visual-video-toggle')).toBeVisible();
});

// Allison 2026-06-06: "when i leave the page i want it to open on the workout im
// in unless i exit." Reopening mid-session resumes the same exercise. (We open a
// fresh page in the same context to mimic a real reopen — the beforeEach clears
// localStorage on every load of `page`, which a real PWA reopen does not.)
test('resume: reopening the app returns to the in-progress workout', async ({ page, context }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toBeVisible();
  // Advance two exercises into the warm-up.
  await page.locator(NEXT).click();
  await page.locator(NEXT).click();
  const nameBefore = await page.locator('.exercise-name').textContent();

  const reopened = await context.newPage();
  await reopened.goto('/');

  // Lands back in the workout (not home), on the same exercise.
  await expect(reopened.locator('.round-indicator')).toBeVisible();
  await expect(reopened.locator('.screen-header h2')).toContainText('Workout A');
  await expect(reopened.locator('.exercise-name')).toHaveText(nameBefore ?? '');
  await reopened.close();
});

// Quitting clears the resume snapshot — reopening goes home, not back in.
test('resume: quitting clears the session so reopening goes home', async ({ page, context }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click();
  await page.locator('.quit-link').click();
  await page.locator('#quit-yes').click(); // v48 · fix r1: the in-app panel
  await expect(page.locator('.home-header h1')).toBeVisible();

  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('.home-header h1')).toBeVisible();
  await reopened.close();
});

// ---------- Left-open workout gate (v32, Sep 11 2026) ----------
// She did Workout A on Mon Sep 7 and never tapped Done. The app kept the
// snapshot and, on the next open, would have dropped her straight back into it
// — days later — with no idea it was stale; tapping through to Done from there
// is what logged the Sep 2→4 "B" row as a 46-hour workout. Now a snapshot older
// than 3 hours is a QUESTION on home (did it / throw it away / keep going), not
// a silent resume. Snapshots are seeded on the beforeEach page and read from a
// fresh context page, which has no localStorage-clearing init script.
const ACTIVE_SESSION_KEY = 'workout-tracker:active-session';
const LOGS_KEY = 'workout-tracker:logs';

function leftOpenSnapshot(ageMs: number, workout: 'A' | 'B' | 'C' = 'A') {
  return {
    screen: 'workout',
    selectedWorkout: workout,
    capacityBefore: 6,
    capacityAfter: 5,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    currentRound: 1,
    currentPhase: 'warmup',
    currentExerciseIndex: 0,
    startedAt: new Date(Date.now() - ageMs).toISOString(),
    pausedAt: null,
    pausedMs: 0,
    liteDay: false,
  };
}

const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

test('left-open gate: a 4-day-old workout is a question on home, not a silent resume', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FOUR_DAYS),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('.home-header h1')).toBeVisible();
  await expect(reopened.locator('#stale-session-card')).toBeVisible();
  await expect(reopened.locator('#stale-session-card')).toContainText('Workout A was left open');
  await expect(reopened.locator('#stale-session-card')).toContainText('never tapped Done');
  await expect(reopened.locator('.round-indicator')).toHaveCount(0);
  await reopened.close();
});

test('left-open gate: "Yes, I did it" logs it for the day it was STARTED with no invented numbers', async ({
  page,
  context,
}) => {
  const snap = leftOpenSnapshot(FOUR_DAYS);
  await page.evaluate(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [
    ACTIVE_SESSION_KEY,
    snap,
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-finished').click();

  await expect(reopened.locator('#stale-session-card')).toHaveCount(0);
  // Assert the session LANDED, not the week counter. The original assertion
  // here was `.stat-number` = 1, which broke on Mon Sep 14 the moment the
  // Sat-Fri week rolled over: a snapshot four days old is deliberately in the
  // PAST, so it can fall outside the current week and the week stat stays 0.
  // The row's own presence is the thing under test; "recent" is not week-scoped.
  // v48 · P4: Recent left home — the row is read in Sessions (one tap).
  await reopened.locator('#view-history').click();
  await expect(reopened.locator('.history-row')).toHaveCount(1);
  // Duration is unknown → no duration at all, never a multi-day number.
  await expect(reopened.locator('.history-date').first()).not.toContainText(/\d+\s*(h|min|m)\b/);

  const saved = await reopened.evaluate(
    ([logsKey, activeKey]) => ({
      logs: JSON.parse(localStorage.getItem(logsKey) ?? '[]') as Array<Record<string, unknown>>,
      active: localStorage.getItem(activeKey),
    }),
    [LOGS_KEY, ACTIVE_SESSION_KEY] as const
  );
  expect(saved.active).toBeNull();
  expect(saved.logs).toHaveLength(1);
  const row = saved.logs[0]!;
  expect(row['workout']).toBe('A');
  expect(row['date']).toBe(snap.startedAt); // dated the day she started it
  expect(row['capacityBefore']).toBe(6); // the one number she really entered
  expect(row['capacityAfter']).toBeNull();
  expect(row['backPain']).toBeNull();
  expect(row['durationSec']).toBeUndefined();
  expect(row['completedAt']).toBeUndefined();
  expect(String(row['notes'])).toContain('Done was never tapped');
  await reopened.close();
});

test('left-open gate: "No, throw it away" discards it and clears the snapshot', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FOUR_DAYS),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-discard').click();
  await expect(reopened.locator('#stale-session-card')).toHaveCount(0);
  // WK2 (Sep 27 2026): see the "zero sessions" test's own comment above.
  await expect(reopened.locator('.week-line')).toContainText('0 of 3 · A, B and C to go');
  const active = await reopened.evaluate((key) => localStorage.getItem(key), ACTIVE_SESSION_KEY);
  expect(active).toBeNull();
  await reopened.close();
});

test('left-open gate: "Keep going" resumes the workout where she left it', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FOUR_DAYS),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-continue').click();
  await expect(reopened.locator('.round-indicator')).toBeVisible();
  await expect(reopened.locator('.screen-header h2')).toContainText('Workout A');
  await reopened.close();
});

test('left-open gate: a 10-minute-old workout still resumes silently (no card)', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(TEN_MINUTES),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('.round-indicator')).toBeVisible();
  await expect(reopened.locator('#stale-session-card')).toHaveCount(0);
  await reopened.close();
});

// v33 (Sep 11 2026): a row deleted in Supabase must vanish from the phone. The
// pull used to only add and update, so the false Thu-Sep-10 "B" (deleted on
// the server the same morning) would have sat in her history forever. The
// merge is pure; the network is off under automation, so the app exposes it
// as window.__wtMergeRemoteSessions only when navigator.webdriver is true.
test('pull merge (v33): a row deleted on the server disappears; unsynced, out-of-window and empty-answer cases stay safe', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; date: string; synced?: boolean };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const local = (id: string, date: string, synced: boolean) => ({
      id,
      date,
      workout: 'A',
      capacityBefore: 5,
      capacityAfter: 5,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced,
    });
    const remote = (id: string, date: string) => ({
      id,
      date,
      workout_type: 'B',
      capacity_before_1_10: 5,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    });
    const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

    // Case 1: the server answered with its WHOLE history (fewer than PULL_LIMIT = 200 rows).
    const whole = merge(
      [
        local('deleted-on-server', '2026-09-10T17:24:38.715Z', true),
        local('unsynced-local', '2026-09-11T08:00:00.000Z', false),
        local('ancient-synced', '2026-01-01T10:00:00.000Z', true),
        local('still-there', '2026-09-04T14:22:39.062Z', true),
      ],
      [
        remote('still-there', '2026-09-04T14:22:39.062+00:00'),
        remote('server-new', '2026-09-07T15:00:00+00:00'),
      ]
    );

    // Case 2: the server answered with a full 200-row WINDOW (v45 raised PULL_LIMIT 50 → 200).
    const window50 = Array.from({ length: 200 }, (_, i) =>
      remote(`w${i}`, `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00+00:00`)
    );
    const windowed = merge(
      [
        local('missing-inside-window', '2026-09-15T10:00:00.000Z', true),
        local('older-than-window', '2025-12-31T10:00:00.000Z', true),
        local('unsynced-local', '2026-09-30T10:00:00.000Z', false),
      ],
      window50
    );

    // Case 3: an empty server answer never deletes anything.
    const empty = merge([local('keep-me', '2026-09-04T14:22:39.062Z', true)], []);

    return {
      whole: ids(whole),
      windowedKept: ids(windowed).filter((id) => !id.startsWith('w')),
      windowedCount: windowed.length,
      empty: ids(empty),
      serverNewSynced: whole.find((r) => r.id === 'server-new')?.synced,
    };
  });

  expect(result.whole).toEqual(['server-new', 'still-there', 'unsynced-local']);
  expect(result.serverNewSynced).toBe(true);
  expect(result.windowedKept).toEqual(['older-than-window', 'unsynced-local']);
  expect(result.windowedCount).toBe(202); // 200-row window + older-than-window + unsynced-local
  expect(result.empty).toEqual(['keep-me']);
});

// WK2 fix r2 (Sep 27 2026, checker's must #1 / GATE 1): mergeRemoteSessions
// already drops a synced row the server no longer has (v33, above) — but if
// that row is the ONE that closed a completion-model week (the 3rd distinct
// letter), a naive drop lets week.ts's walkWeeks recompute fresh, see only 2
// distinct letters, and silently REOPEN that week, renumbering everything
// after it. This already happened once, pre-model (the false Thu Sep 10 B,
// deleted Sep 11, covered by the v33 test above) — a future delete of a
// POST-launch closing session would cascade the same way here. The real fix
// (counted_round/counted_week columns, or a stored closed-week record) is a
// schema decision that needs her yes first — this proves the non-schema
// guard that closes the practical risk in the meantime.
test('pull merge (WK2 fix r2, GATE 1): a DELETED closing session survives instead of silently reopening + renumbering the week', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; date: string; workout: string; staleRemoteDelete?: boolean };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const local = (id: string, date: string, workout: string) => ({
      id,
      date,
      workout,
      capacityBefore: 8,
      capacityAfter: 8,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced: true,
    });
    const remote = (id: string, date: string, workout_type: string) => ({
      id,
      date,
      workout_type,
      capacity_before_1_10: 8,
      capacity_after_1_10: 8,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    });
    // Week 5 (post-launch, real COMPLETION_WEEKS_FROM): A Sun, B Mon, then C
    // Tue closes it — 'wk5-c' is the CLOSING session (week.ts: the session
    // whose own date === the span's closedAt). 'wk5-extra' is an ordinary
    // repeat A the next day — no special status, must still behave like v33.
    const localRows = [
      local('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
      local('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
      local('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5
      local('wk5-extra', '2026-09-30T15:00:00.000Z', 'A'), // ordinary repeat
    ];
    // The pull is missing BOTH the closing session AND the ordinary repeat —
    // same "deleted on the server" shape either way.
    const remoteRows = [
      remote('wk5-a', '2026-09-27T15:00:00+00:00', 'A'),
      remote('wk5-b', '2026-09-28T15:00:00+00:00', 'B'),
    ];
    const merged = merge(localRows, remoteRows);
    return {
      ids: merged.map((r) => r.id).sort(),
      closing: merged.find((r) => r.id === 'wk5-c'),
    };
  });

  // The ordinary repeat still disappears — v33 behavior, unchanged.
  expect(result.ids).not.toContain('wk5-extra');
  // The closing session survives instead, flagged rather than silently gone.
  expect(result.ids).toContain('wk5-c');
  expect(result.closing?.staleRemoteDelete).toBe(true);
});

// v50 · mood (Sep 25 2026): mood_before/mood_after round-trip through the pull
// merge the same way capacity does — present → her number, missing (a
// pre-v50 server row) → null, never invented.
test('pull merge (v50): mood_before/mood_after round-trip; a pre-v50 row (no mood keys) merges as null', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; moodBefore?: number | null; moodAfter?: number | null };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const remoteBase = {
      workout_type: 'A',
      capacity_before_1_10: null,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    };
    const merged = merge(
      [],
      [
        {
          ...remoteBase,
          id: 'with-mood',
          date: '2026-09-25T10:00:00+00:00',
          mood_before: 9,
          mood_after: 3,
        },
        {
          ...remoteBase,
          id: 'pre-v50',
          date: '2026-09-20T10:00:00+00:00',
          // no mood_before/mood_after keys at all — a server row from before v50
        },
      ]
    );
    return {
      withMood: merged.find((r) => r.id === 'with-mood'),
      preV50: merged.find((r) => r.id === 'pre-v50'),
    };
  });

  expect(result.withMood?.moodBefore).toBe(9);
  expect(result.withMood?.moodAfter).toBe(3);
  expect(result.preV50?.moodBefore).toBeNull();
  expect(result.preV50?.moodAfter).toBeNull();
});

// v51 (Sep 25 2026): back_pain_before/wrist_pain_before round-trip the same
// way — present → her number, missing (a pre-v51 server row) → null.
test('pull merge (v51): back_pain_before/wrist_pain_before round-trip; a pre-v51 row (no keys) merges as null', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; backPainBefore?: number | null; wristPainBefore?: number | null };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const remoteBase = {
      workout_type: 'A',
      capacity_before_1_10: null,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    };
    const merged = merge(
      [],
      [
        {
          ...remoteBase,
          id: 'with-before',
          date: '2026-09-25T10:00:00+00:00',
          back_pain_before: 3,
          wrist_pain_before: 0,
        },
        {
          ...remoteBase,
          id: 'pre-v51',
          date: '2026-09-20T10:00:00+00:00',
          // no back_pain_before/wrist_pain_before keys at all — a server row from before v51
        },
      ]
    );
    return {
      withBefore: merged.find((r) => r.id === 'with-before'),
      preV51: merged.find((r) => r.id === 'pre-v51'),
    };
  });

  expect(result.withBefore?.backPainBefore).toBe(3);
  expect(result.withBefore?.wristPainBefore).toBe(0);
  expect(result.preV51?.backPainBefore).toBeNull();
  expect(result.preV51?.wristPainBefore).toBeNull();
});

// T1 fix r1 (Sep 27 2026, checker's must #1): the same round-trip PROVEN
// through the real push shape, not a hand-built remote row — sessionPayload
// (a save's own POST body) fed straight into mergeRemoteSessions (a pull's
// own mapper), the way a push-then-pull actually happens. Before this fix,
// RemoteSession simply didn't declare the 5 columns, so this exact round
// trip lost herStartAt/herStartConfirmed/herEndAt/herEndConfirmed/
// breakMinutes on the very next pull. A pre-T1 row (no keys at all,
// same shape mergeRemoteSessions has always had to handle) must still
// merge with all 5 as null, never invented.
test('pull merge (T1 fix r1, must #1): her timing answers survive a push -> pull round trip; a pre-T1 row merges as null', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = {
      id: string;
      herStartAt?: string | null;
      herStartConfirmed?: boolean | null;
      herEndAt?: string | null;
      herEndConfirmed?: boolean | null;
      breakMinutes?: number | null;
    };
    type Entry = Record<string, unknown>;
    const w = window as unknown as {
      __wtSessionPayload: (e: Entry) => Record<string, unknown>;
      __wtMergeRemoteSessions: (local: unknown[], remote: unknown[]) => Row[];
    };
    const entry = {
      id: 'with-timing',
      date: '2026-09-27T10:00:00.000Z',
      workout: 'A',
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      herStartAt: '2026-09-27T09:04:00.000Z',
      herStartConfirmed: true,
      herEndAt: '2026-09-27T09:52:00.000Z',
      herEndConfirmed: true,
      breakMinutes: 5,
    };
    // The exact row a save's POST sends — id/date/workout_type match a real
    // remote row's shape (sessionPayload already names them that way).
    const remoteRow = w.__wtSessionPayload(entry);
    // A pre-T1 row: no her_*/break_minutes keys at all, same as any server
    // row saved before this migration existed.
    const preT1Remote = {
      id: 'pre-t1',
      date: '2026-09-20T10:00:00+00:00',
      workout_type: 'A',
      capacity_before_1_10: null,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    };
    const merged = w.__wtMergeRemoteSessions([], [remoteRow, preT1Remote]);
    return {
      withTiming: merged.find((r) => r.id === 'with-timing'),
      preT1: merged.find((r) => r.id === 'pre-t1'),
    };
  });

  expect(result.withTiming?.herStartAt).toBe('2026-09-27T09:04:00.000Z');
  expect(result.withTiming?.herStartConfirmed).toBe(true);
  expect(result.withTiming?.herEndAt).toBe('2026-09-27T09:52:00.000Z');
  expect(result.withTiming?.herEndConfirmed).toBe(true);
  expect(result.withTiming?.breakMinutes).toBe(5);
  // Never false/0 for a row that simply never had the keys.
  expect(result.preT1?.herStartAt).toBeNull();
  expect(result.preT1?.herStartConfirmed).toBeNull();
  expect(result.preT1?.herEndAt).toBeNull();
  expect(result.preT1?.herEndConfirmed).toBeNull();
  expect(result.preT1?.breakMinutes).toBeNull();
});

// --- Round 2 Week 3: the band goes on the clamshells (v35, Sep 14 2026) ------
// Her word: "build week 3". One change only — the yellow band, in B, looped.
// These assert BOTH halves: the change landed, and nothing else moved.
test('R2 W3: a date inside Sep 12-18 2026 resolves to Round 2 · Week 3', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Date;
    const fixed = new real('2026-09-14T10:00:00').getTime();
    class MockDate extends real {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(...(args.length ? args : [fixed]));
      }
      static override now(): number {
        return fixed;
      }
    }
    (globalThis as unknown as { Date: DateConstructor }).Date =
      MockDate as unknown as DateConstructor;
  });
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Round 2 · Week 3');
});

test('R2 W3: workout B carries the yellow band on the clamshells, reps back to 10', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  // The pre-log overview lists exercise NAMES only, so the name must be
  // unchanged there (the detail card, illustration and recorded voice note are
  // all keyed to it) and the band must show up on the step itself.
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Side-lying clamshells');

  await page.locator('button:has-text("Start")').click();
  let repsSeen = '';
  let notesSeen = '';
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Side-lying clamshells')) {
      await openCue(page);
      repsSeen =
        (await page
          .locator('.exercise-reps')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      notesSeen =
        (await page
          .locator('.exercise-notes')
          .first()
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      break;
    }
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  // The band is the increase, so reps RESET — 10 a side, never 15 this week.
  expect(repsSeen).toContain('10 each side');
  expect(repsSeen).toContain('yellow band');
  // The notes stay about the MOVEMENT (the tying moved to the setup block, so
  // she isn't reading the same paragraph twice).
  expect(notesSeen).toContain('the band is the increase');
  expect(notesSeen).toContain('finish bodyweight');
});

// v37: her kit is FLAT strips, so the step must explain AND show the tying.
// Her ask: "make sure there s avideo and expalation".
test('R2 W3: the clamshell step carries a tying explanation AND its own video, open by default', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Side-lying clamshells')) break;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }

  const setup = page.locator('.setup-block');
  await expect(setup).toBeVisible();
  // Open by DEFAULT — a step she has never done should not hide behind a tap.
  await expect(setup.locator('.setup-body')).toBeVisible();
  await expect(setup).toContainText('Tie the band into a loop');

  // The explanation: the knot, the sizing, the knot position, and the gate line.
  const steps = setup.locator('.setup-steps li');
  expect(await steps.count()).toBeGreaterThanOrEqual(4);
  const allSteps = (await steps.allTextContents()).join(' | ');
  expect(allSteps).toContain('square knot');
  expect(allSteps).toContain('Overlap');
  expect(allSteps).toContain('just above your knees');
  expect(allSteps).toContain('outside');
  await expect(setup.locator('.setup-footnote')).toContainText('not the gripping gate');

  // The video is a SECOND video, separate from the movement video, and it only
  // loads on tap (no unrequested embed).
  await expect(setup.locator('iframe')).toHaveCount(0);
  await setup.locator('.visual-video-toggle').click();
  const frame = page.locator('.setup-block iframe');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', /youtube\.com\/embed\/ESNXHhPdIos/);
  await expect(page.locator('.setup-block .visual-attribution')).toContainText('Total Therapy');

  // And the toggle actually CLOSES on the first tap (the default-open bug).
  await page.locator('.setup-toggle').click();
  await expect(page.locator('.setup-block .setup-body')).toHaveCount(0);
});

// The leak this design exists to prevent: EXERCISE_VISUALS and the detail cards
// are keyed by exercise NAME, so anything hung there appears on every week
// carrying that name. Week 2's clamshell is the SAME name and is bodyweight —
// if the tying setup shows up there, the app is lying about last week.
test('R2 W3: the tying setup does NOT leak onto Week 2, whose clamshell is bodyweight', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z'); // inside Round 2 Week 2
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 2');
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Side-lying clamshells')) {
      await expect(page.locator('.setup-block')).toHaveCount(0);
      await expect(page.locator('.exercise-reps')).not.toContainText('yellow band');
      // v53 fix (CHECK M6, Sep 26 2026): "Bodyweight this week" was pure
      // program bookkeeping, not movement guidance — moved to a PROGRAM
      // comment (Tips audit). No notes left on this step means no Tips row.
      await openCue(page);
      await expect(page.locator('.tips-section')).toHaveCount(0);
      return;
    }
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  throw new Error("never reached Week 2's clamshells");
});

// And nothing in Workout C gets a setup block — C has no banded move at all.
test('R2 W3: workout C carries no setup block anywhere', async ({ page }) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    await expect(page.locator('.setup-block')).toHaveCount(0);
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
});

test('R2 W3: the band is in B ONLY, and the bird dog has NOT been levelled up', async ({
  page,
}) => {
  // C also has clamshells — they stay bodyweight.
  await page.locator('button[data-workout="C"]').click();
  await expect(page.locator('body')).not.toContainText('yellow band');
  await page.locator('.quit-link, #back-home').first().click();

  // The opposite-arm bird dog is gated on legs-only feeling "like nothing";
  // her word was "good". Both A and B must still say legs only.
  for (const w of ['A', 'B']) {
    await page.locator(`button[data-workout="${w}"]`).click();
    await expect(page.locator('body')).toContainText('Bird dog (legs only)');
    await expect(page.locator('body')).not.toContainText('opposite arm reaches back');
    await page.locator('.quit-link, #back-home').first().click();
  }
});

// v42 (Sep 19 2026): Round 2 Week 4 — two raises, two catch-ups, C untouched.
test('R2 W4: split squat replaces the squat in A only, wall sit reads 45, the 1 kg is back in A+B', async ({
  page,
}) => {
  await mockDate(page, '2026-09-22T10:00:00.000Z'); // Tue inside Round 2 Week 4
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 4');

  // A: split squat in, bodyweight squat out, wall sit 45, 1 kg pair present.
  await page.locator('button[data-workout="A"]').click();
  const bodyA = page.locator('body');
  await expect(bodyA).toContainText('Supported split squat');
  await expect(bodyA).not.toContainText('Bodyweight squats');
  await expect(bodyA).toContainText('1 kg biceps curl');
  await expect(bodyA).toContainText('Prone row');
  // (The overview lists NAMES only — reps like "holding the 1 kg" are checked on
  // the running step in the walk-the-steps test below.)
  // Holds: bird dog still legs-only; wall lean still last.
  await expect(bodyA).toContainText('Bird dog (legs only)');
  await expect(bodyA).toContainText('Wall lean');
  await page.locator('.quit-link, #back-home').first().click();

  // B: no split squat (B never had a squat), hinge says 1 kg, 1 kg pair present, band clamshell held.
  await page.locator('button[data-workout="B"]').click();
  const bodyB = page.locator('body');
  await expect(bodyB).not.toContainText('Supported split squat');
  await expect(bodyB).toContainText('1 kg biceps curl');
  await expect(bodyB).toContainText('Prone row');
  await expect(bodyB).toContainText('Side-lying clamshells');
  await page.locator('.quit-link, #back-home').first().click();

  // C: untouched — its 10 squats stay, no split squat, no 1 kg, no band.
  await page.locator('button[data-workout="C"]').click();
  const bodyC = page.locator('body');
  await expect(bodyC).toContainText('Bodyweight squats');
  await expect(bodyC).not.toContainText('Supported split squat');
  await expect(bodyC).not.toContainText('1 kg biceps curl');
  await expect(bodyC).not.toContainText('yellow band');
});

// ---------- Saturday is the swing day (v42, Sep 19 2026) ----------
// Her rule: a Saturday session counts toward the week that just ended if that
// week is short of 3; otherwise it opens the new week. Sunday+ never swings.
// The seeded rows keep their TRUE timestamps — only the counting moves.
const SWING_WEEK3_A = {
  id: 'swing-a',
  date: '2026-09-14T15:50:00.000Z', // Mon Sep 14 — Week 3
  workout: 'A',
  capacityBefore: 7,
  capacityAfter: null,
  wallSitSec: 43,
  backPain: null,
  word: '',
};
const SWING_WEEK3_B = {
  id: 'swing-b',
  date: '2026-09-18T15:02:00.000Z', // Fri Sep 18 — Week 3
  workout: 'B',
  capacityBefore: 8,
  capacityAfter: 5,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  durationSec: 2100,
};
const SWING_SAT_C = {
  id: 'swing-c',
  date: '2026-09-19T19:21:00.000Z', // Sat Sep 19, 22:21 Jerusalem — the swing day
  workout: 'C',
  capacityBefore: 7,
  capacityAfter: 9,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  durationSec: 720,
};

// v48 · P4 (Sep 24 2026): the week-by-week list moved off home into Weekly
// review, collapsed as "Week by week" (DECISIONS Q3); the week card is its door.
async function openWeekByWeek(page: Page): Promise<void> {
  await page.locator('#open-weekly-review').click();
  await page.locator('.consistency-wrap > summary').click();
}

test('swing: a Saturday session completes a 2-session week — last week shows 3 of 3, this week 0', async ({
  page,
}) => {
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B, SWING_SAT_C]
  );
  await mockDate(page, '2026-09-20T10:00:00.000Z'); // Sun Sep 20 — Week 4
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 4');

  // v48 · P4: home's one week line says where Saturday's C went, in words.
  const line = page.locator('.week-line');
  await expect(line).toContainText('0 of 3 this week');
  await expect(line).toContainText("Sat's C went to Week 3");

  await openWeekByWeek(page);
  // This week: three open slots.
  await expect(page.locator('.weekly-row-current .weekly-slot-empty')).toHaveCount(3);
  // Last week (R2 · Wk 3): A, B, C — the Saturday C is its third pill.
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(3);
  await expect(wk3.locator('button.weekly-slot').nth(2)).toHaveText('C');
});

test('swing: a Saturday session does NOT swing when last week already has 3 — it opens the new week', async ({
  page,
}) => {
  const full = [
    { ...SWING_WEEK3_A, id: 'full-a', date: '2026-09-13T15:00:00.000Z' }, // Sun
    { ...SWING_WEEK3_B, id: 'full-b', date: '2026-09-15T15:00:00.000Z' }, // Tue
    { ...SWING_WEEK3_B, id: 'full-c', workout: 'C', date: '2026-09-17T15:00:00.000Z' }, // Thu
    SWING_SAT_C,
  ];
  await page.addInitScript((rows: unknown[]) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
  }, full);
  await mockDate(page, '2026-09-20T10:00:00.000Z');
  await page.goto('/');
  const line = page.locator('.week-line');
  await expect(line).toContainText('1 of 3 this week');
  await expect(line).not.toContainText("Sat's");
  await openWeekByWeek(page);
  await expect(page.locator('.weekly-row-current button.weekly-slot')).toHaveCount(1);
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(3);
});

test('swing: a SUNDAY session never swings, even when last week is short', async ({ page }) => {
  const sunday = { ...SWING_SAT_C, id: 'sun-c', date: '2026-09-20T19:21:00.000Z' }; // Sun Sep 20
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B, sunday]
  );
  await mockDate(page, '2026-09-21T10:00:00.000Z'); // Mon Sep 21
  await page.goto('/');
  const line = page.locator('.week-line');
  await expect(line).toContainText('1 of 3 this week');
  await expect(line).not.toContainText("Sat's");
  await openWeekByWeek(page);
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(2);
});

// v46: the swing must show where the big number is. On the Saturday night she
// closed Week 3, home read "0 OF 3 THIS WEEK" next to a lit Saturday dot — the
// win invisible at the moment she earned it (UX audit Sep 24).
// v48 · P4 (DECISIONS Q2): in WORDS, every day — not a Saturday-only swap of
// the big number: "0 of 3 this week · Sat's C went to Week 3". (v49 · look,
// Sep 25 2026: "· N total" moved off this line onto the Start → Now card's
// own Sessions row — "Only one count on Home".)
test('swing (v46): on the Saturday itself the week card carries the week it closed', async ({
  page,
}) => {
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B, SWING_SAT_C]
  );
  await mockDate(page, '2026-09-19T19:30:00.000Z'); // Sat Sep 19, 22:30 Jerusalem — right after the C
  await page.goto('/');
  await expect(page.locator('.week-line')).toHaveText("0 of 3 this week · Sat's C went to Week 3");
  await expect(page.locator('.home-startnow-card .start-now-row').last()).toContainText('3');
  await expect(page.locator('.swing-note')).toHaveCount(0);
  // The next morning (Sunday) the words stay — the swing is worked out every day.
  await mockDate(page, '2026-09-20T10:00:00.000Z');
  await page.goto('/');
  await expect(page.locator('.week-line')).toHaveText("0 of 3 this week · Sat's C went to Week 3");
});

// v52 (Sep 26 2026, main): the standalone ".swing-note" line was folded into
// ".week-line" itself ("N of 3 · <workout> left — tonight counts for Week N")
// so the count and the swing explanation read as one sentence, not two.
test('swing (v52, was v46): Saturday morning with last week at 2 says today will count for it', async ({
  page,
}) => {
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B]
  );
  await mockDate(page, '2026-09-19T06:00:00.000Z'); // Sat Sep 19, 09:00 Jerusalem — nothing done yet
  await page.goto('/');
  // v52 (Sep 26 2026): a swing Saturday now SHOWS last week (her "I want to be
  // very clear that I'm in week 4 right now"), so the count is last week's
  // and the old "today will count for it" note is replaced by the week line.
  await expect(page.locator('.week-line')).toHaveText(
    '2 of 3 · C left — tonight counts for Week 3'
  );
  await expect(page.locator('.home-header h1')).toContainText('Week 3');
  await expect(page.locator('.swing-note')).toHaveCount(0);
});

// v46: only completed program weeks are judged. Break + sick weeks and the week
// in progress were counted as misses, turning 13 of 13 training weeks into
// "13 of 21" (UX audit Sep 24).
// v48 · fix r1 (Sep 24 2026): the line is a plain count ("N full weeks") — no
// "target", no "of N" verdict — and a 0-session week inside the sick/break
// stretch (her real wk 11, Jul 18-24, between "sick" and "break") is "—" with
// no track, never "0 / 3". A 0 week in the middle of training still shows.
test('progress: "N full weeks" counts training weeks only — no break, sick, in-progress or held weeks', async ({
  page,
}) => {
  const mk = (id: string, date: string, workout: 'A' | 'B' | 'C') => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 6,
    wallSitSec: 0,
    backPain: 0,
    word: '',
  });
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [
      // R1 Week 10 (Jul 4–10): 3 — full; her last Round 1 session is Jul 8.
      mk('r1a', '2026-07-05T15:00:00.000Z', 'A'),
      mk('r1b', '2026-07-07T15:00:00.000Z', 'B'),
      mk('r1c', '2026-07-08T15:00:00.000Z', 'C'),
      // R2 Week 1 (Aug 29–Sep 4): 3 — hit.
      mk('w1a', '2026-08-30T15:00:00.000Z', 'A'),
      mk('w1b', '2026-09-01T15:00:00.000Z', 'B'),
      mk('w1c', '2026-09-03T15:00:00.000Z', 'C'),
      // R2 Week 2 (Sep 5–11): 3 — hit.
      mk('w2a', '2026-09-06T15:00:00.000Z', 'A'),
      mk('w2b', '2026-09-08T15:00:00.000Z', 'B'),
      mk('w2c', '2026-09-10T15:00:00.000Z', 'C'),
      // R2 Week 3 (Sep 12–18): 2 — a real miss, stays counted.
      mk('w3a', '2026-09-13T15:00:00.000Z', 'A'),
      mk('w3b', '2026-09-15T15:00:00.000Z', 'B'),
      // R2 Week 4, in progress: 1 — not judged yet.
      mk('w4a', '2026-09-22T15:00:00.000Z', 'A'),
    ]
  );
  await mockDate(page, '2026-09-24T08:00:00.000Z'); // Thu inside R2 Week 4
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  const card = page.locator('.progress-card').filter({ hasText: 'Sessions per week' });
  // R1 wk 10 + the two 3/3 R2 weeks = 3 full weeks. No verdict words.
  const meta = card.locator('.progress-card-meta');
  await expect(meta).toHaveText('3 full weeks');
  await expect(meta).not.toContainText('target');
  await expect(meta).not.toContainText(' of ');
  // The bars still show every week, breaks included.
  await expect(card).toContainText('break');
  await expect(card).toContainText('now');
  await card.locator('.spw-older-summary').click();
  // Round 1's rows live in its fold (R2 has its own "wk 1").
  const row = (label: string) =>
    card
      .locator('details.spw-older .spw-row')
      .filter({ has: page.locator(`.spw-label:text-is("${label}")`) });
  // wk 11 sits between "sick" and "break": held, not scored.
  await expect(row('wk 11')).toHaveClass(/spw-row-skipped/);
  await expect(row('wk 11')).toContainText('—');
  await expect(row('wk 11').locator('.spw-track')).toHaveCount(0);
  await expect(row('wk 11')).not.toContainText('/ 3');
  // wk 10 is full; wk 1 (0 sessions mid-round, no break beside it) still shows.
  await expect(row('wk 10')).toContainText('3 / 3');
  await expect(row('wk 1').locator('.spw-track')).toHaveCount(1);
  await expect(row('wk 1')).toContainText('0 / 3');
});

// The overview lists names, not reps — so the wall-sit seconds are checked inside
// the running workout, on the step itself (same walk-the-steps grammar as W3).
test('R2 W4: the wall sit step itself reads 45 sec (the earned nudge from 40)', async ({
  page,
}) => {
  await mockDate(page, '2026-09-22T10:00:00.000Z'); // Tue inside Round 2 Week 4
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Wall sit')) {
      await expect(page.locator('.exercise-reps')).toContainText('45 sec');
      await openCue(page);
      // v53 Tips audit: "40 → 45" (the bump history) is PROGRAM bookkeeping,
      // moved to a code comment — the movement guidance is what stays visible.
      await expect(page.locator('.exercise-notes').first()).toContainText(
        'Keep the depth: knees toward 90'
      );
      await expect(page.locator('.exercise-notes').first()).not.toContainText('40 → 45');
      return;
    }
    if (name.includes('Supported split squat')) {
      await expect(page.locator('.exercise-reps')).toContainText('6-8 each side');
    }
    // v48 · fix r2 (Sep 25 2026): Week 4 titles it "Hip hinge" (label only).
    if (/hip hinge/i.test(name)) {
      // Catch-up, not a raise: the hinge now says she holds the 1 kg.
      await expect(page.locator('.exercise-reps')).toContainText('holding the 1 kg');
    }
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  throw new Error("never reached Week 4's wall sit");
});

// The leak guard, same shape as W3's: the split squat is keyed by NAME, so it must
// not appear on any earlier week — Week 3's A still says bodyweight squats.
test('R2 W4: the split squat does NOT leak onto Week 3', async ({ page }) => {
  await mockDate(page, '2026-09-15T10:00:00.000Z'); // Tue inside Round 2 Week 3
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 3');
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('body')).toContainText('Bodyweight squats');
  await expect(page.locator('body')).not.toContainText('Supported split squat');
  await expect(page.locator('body')).not.toContainText('holding the 1 kg');
});

test('R2 W3: gear card no longer says the band is waiting for a future week', async ({ page }) => {
  // v48 · P4: Gear & recovery lives in Settings now. v48 · P6 (Sep 24 2026):
  // chips — the band is a ✅ chip ("in the workout"), not a waiting line.
  await page.locator('#open-settings').click();
  const gear = page.locator('.gear-card');
  await expect(gear.locator('.gear-chip-have')).toContainText([
    '1 kg',
    'Yellow band · B clamshells',
  ]);
  await expect(gear).not.toContainText('Not in a workout yet');
  await expect(gear).not.toContainText('Booked for');
});

// v39 (Sep 14 2026): before-capacity goes nullable. The sync used to coerce a
// missing reading with `?? 0`, and 0 is not a value the slider can produce (its
// range is 1-10) — so it was a hole wearing a number. Named in the May-14 audit,
// fixed on her word "ok so fix it". One REAL row has this: her very first
// session, May 2 2026, has both capacity columns null and was rendering "0→0".
test('capacity before (v39): a missing reading stays missing through the sync, the week average and the import', async ({
  page,
}) => {
  const out = await page.evaluate(() => {
    const w = window as unknown as {
      __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Array<Record<string, unknown>>;
      __wtComputeWeekTotals: (s: unknown[]) => { avgCapBefore: number | null; count: number };
      __wtIsValidLogEntry: (x: unknown) => boolean;
    };
    // The real May-2 shape: both capacity columns null on the server.
    const merged = w.__wtMergeRemoteSessions(
      [],
      [
        {
          id: 'first-ever',
          date: '2026-05-02T19:00:00+00:00',
          workout_type: 'A',
          capacity_before_1_10: null,
          capacity_after_1_10: null,
          wall_sit_seconds: 20,
          pain_back_0_10: null,
          one_word: null,
          started_at: null,
          completed_at: null,
          duration_seconds: null,
          notes: null,
        },
      ]
    );
    const mk = (before: number | null) => ({
      log: {
        id: `x${String(before)}`,
        date: '2026-09-14T10:00:00.000Z',
        workout: 'A',
        capacityBefore: before,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: '',
      },
      durationStr: '—',
    });
    return {
      mergedBefore: merged[0]?.['capacityBefore'],
      // 6 and 8 known, one missing → average must be 7, NOT (6+8+0)/3 = 4.67.
      totals: w.__wtComputeWeekTotals([mk(6), mk(8), mk(null)]),
      allMissing: w.__wtComputeWeekTotals([mk(null)]).avgCapBefore,
      importAcceptsNull: w.__wtIsValidLogEntry({
        date: '2026-05-02',
        workout: 'A',
        capacityBefore: null,
        capacityAfter: null,
        wallSitSec: 20,
        backPain: null,
      }),
      importRejectsJunk: w.__wtIsValidLogEntry({
        date: '2026-05-02',
        workout: 'A',
        capacityBefore: 'five',
        capacityAfter: null,
        wallSitSec: 20,
        backPain: null,
      }),
    };
  });

  // The whole point: null survives the sync instead of becoming 0.
  expect(out.mergedBefore).toBeNull();
  // The average is over the readings that EXIST, so a hole cannot drag it down.
  expect(out.totals.count).toBe(3);
  expect(out.totals.avgCapBefore).toBe(7);
  // Nothing to average → "—", not 0.
  expect(out.allMissing).toBeNull();
  // And a backup containing that row still restores.
  expect(out.importAcceptsNull).toBe(true);
  expect(out.importRejectsJunk).toBe(false);
});

test('capacity before (v39): the history row shows an em dash, never "0"', async ({
  page,
  context,
}) => {
  // Seed on THIS page, then read from a fresh page in the same context: the
  // suite's beforeEach installs an init script that clears localStorage on
  // every navigation, so a goto() here would wipe the row we just wrote.
  await page.evaluate(() => {
    localStorage.setItem(
      'workout-tracker:logs',
      JSON.stringify([
        {
          id: 'first-ever',
          date: '2026-05-02T19:00:00.000Z',
          workout: 'A',
          capacityBefore: null,
          capacityAfter: null,
          wallSitSec: 20,
          backPain: null,
          word: '',
          synced: true,
        },
      ])
    );
  });
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#view-history').click();
  const meta = reopened.locator('.history-meta').first();
  await expect(meta).toContainText('cap —→—');
  await expect(meta).not.toContainText('cap 0');
  await reopened.close();
});

// v41 (Sep 14 2026): her word — "ok but planks come back in and the wall learn",
// then "plank on forearms still" / "but can do stuff on forearms".
test('R2 W3 (v41): the wall lean is back in A and B, after the bird dog', async ({ page }) => {
  for (const w of ['A', 'B']) {
    await page.goto('/');
    await page.locator(`button[data-workout="${w}"]`).click();
    const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
    expect(overview).toContain('Wall lean (wrist on-ramp)');
    expect(overview).toContain('Bird dog (legs only)');
    // The wall lean must come AFTER the bird dog: a stop-at-pain exit on the
    // easier move should not cost her the harder one she has already earned.
    expect(overview.indexOf('Wall lean')).toBeGreaterThan(overview.indexOf('Bird dog'));
  }
});

test('R2 W3 (v41): the forearm plank now runs in B too, and stays on FOREARMS', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Forearm plank');
  // The hands plank stays out — her own ladder puts it at the top and she is on
  // rung 3. "plank on forearms still" is the ruling this pins.
  expect(overview).not.toContain('Plank on hands');
  expect(overview).not.toContain('High plank');
});

test('R2 W3 (v41): the plank in B is the SAME prescription as the one in A', async ({ page }) => {
  const read = async (w: string) => {
    await page.goto('/');
    await page.locator(`button[data-workout="${w}"]`).click();
    await page.locator('button:has-text("Start")').click();
    for (let i = 0; i < 60; i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (name.includes('Forearm plank')) {
        await openCue(page);
        const reps =
          (await page
            .locator('.exercise-reps')
            .textContent({ timeout: 1000 })
            .catch(() => '')) ?? '';
        const notes =
          (await page
            .locator('.exercise-notes')
            .first()
            .textContent({ timeout: 1000 })
            .catch(() => '')) ?? '';
        return `${reps.trim()} :: ${notes.trim()}`;
      }
      const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
      if (await nextBtn.isVisible()) await nextBtn.click();
      else {
        const skipRest = page.locator('#skip-rest');
        if (await skipRest.isVisible()) {
          const box = await skipRest.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(700);
            await page.mouse.up();
          }
        } else break;
      }
    }
    return null;
  };
  const inA = await read('A');
  const inB = await read('B');
  expect(inA).not.toBeNull();
  expect(inB).toBe(inA);
  expect(String(inA)).toContain('Forearms only, NOT hands');
});

// v40 (Sep 14 2026): `setup` must work on every phase whose type allows it.
// The cooldown list renders Exercise[] through its own markup, so it was the
// one phase where a setup block would have silently vanished. Asserted against
// the renderer rather than the program, since no real stretch carries one.
test('setup blocks (v40): every phase that renders an Exercise also renders its setup', async ({
  page,
}) => {
  const callSites = await page.evaluate(() => {
    // renderExerciseSetup is not exported; count its call sites in the shipped
    // bundle instead. Both the stepped-exercise renderer and the cooldown list
    // must call it.
    return fetch('dist/app.js')
      .then((r) => r.text())
      .then((src) => (src.match(/renderExerciseSetup\(/g) ?? []).length);
  });
  // 1 definition + 2 call sites.
  expect(callSites).toBeGreaterThanOrEqual(3);

  // And the cooldown list still renders normally with no setup present.
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 60; i++) {
    if (
      await page
        .locator('.stretch-list')
        .isVisible()
        .catch(() => false)
    )
      break;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else {
      const skipRest = page.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
        }
      } else break;
    }
  }
  await expect(page.locator('.stretch-list')).toBeVisible();
  await expect(page.locator('.stretch-row').first()).toBeVisible();
  // No stretch carries a setup today, so none should show.
  await expect(page.locator('.stretch-list .setup-block')).toHaveCount(0);
});

// v34 (Sep 14 2026): both of these were found by the close's bleed check, not
// by a test — the v32 nullable change had two readers that were never updated.
test('backup restore (v34): a row with null after-capacity / back pain survives the import', async ({
  page,
}) => {
  // The real shape of her Mon Sep 7 row: logged after the fact, so no post-log.
  // Before v34 `isValidLogEntry` demanded `typeof === 'number'` and this row was
  // silently dropped on import — a real session lost with no error shown.
  const dropped = await page.evaluate(() => {
    const rows = [
      {
        id: 'after-the-fact',
        date: '2026-09-07T15:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: null,
        wallSitSec: 0,
        backPain: null,
        word: '',
        notes: 'logged after the fact',
      },
      {
        id: 'ordinary',
        date: '2026-09-11T15:07:00.000Z',
        workout: 'B',
        capacityBefore: 7,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'good',
      },
    ];
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    return rows.filter((r) => !fn(r)).map((r) => r.id);
  });
  expect(dropped).toEqual([]);

  // And the guard still rejects genuinely broken rows.
  const rejected = await page.evaluate(() => {
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    return [
      // v54 fix r1 (Sep 27 2026): 'D' joined the valid letters (Workout D, the
      // elliptical extra) — this fixture used to be 'D' as a stand-in for "an
      // unknown workout letter", which the fix would otherwise have silently
      // started accepting. 'E' is a letter the app has never had.
      fn({
        date: '2026-09-07',
        workout: 'E',
        capacityBefore: 5,
        capacityAfter: null,
        wallSitSec: 0,
      }),
      fn({ date: '2026-09-07', workout: 'A', capacityBefore: 'six', wallSitSec: 0 }),
      fn({ workout: 'A', capacityBefore: 5, wallSitSec: 0 }),
      fn({
        date: '2026-09-07',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 'none',
        wallSitSec: 0,
        backPain: null,
      }),
      fn(null),
    ];
  });
  expect(rejected).toEqual([false, false, false, false, false]);
});

// v50 · mood: optional AND nullable, same shape as wristPain — a pre-v50
// export has neither key and must still restore; junk in either is rejected.
test('isValidLogEntry (v50): moodBefore/moodAfter are optional, nullable, and typed', async ({
  page,
}) => {
  const out = await page.evaluate(() => {
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    const base = {
      date: '2026-09-25',
      workout: 'A',
      capacityBefore: 5,
      capacityAfter: 5,
      wallSitSec: 0,
      backPain: 0,
    };
    return {
      noMoodKeysAtAll: fn(base), // pre-v50 export
      nullMood: fn({ ...base, moodBefore: null, moodAfter: null }),
      numberMood: fn({ ...base, moodBefore: 8, moodAfter: 3 }),
      junkMood: fn({ ...base, moodBefore: 'happy', moodAfter: 3 }),
    };
  });
  expect(out.noMoodKeysAtAll).toBe(true);
  expect(out.nullMood).toBe(true);
  expect(out.numberMood).toBe(true);
  expect(out.junkMood).toBe(false);
});

test('isValidLogEntry (v51): backPainBefore/wristPainBefore are optional, nullable, and typed', async ({
  page,
}) => {
  const out = await page.evaluate(() => {
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    const base = {
      date: '2026-09-25',
      workout: 'A',
      capacityBefore: 5,
      capacityAfter: 5,
      wallSitSec: 0,
      backPain: 0,
    };
    return {
      noKeysAtAll: fn(base), // pre-v51 export
      nullBefore: fn({ ...base, backPainBefore: null, wristPainBefore: null }),
      numberBefore: fn({ ...base, backPainBefore: 4, wristPainBefore: 0 }),
      junkBefore: fn({ ...base, backPainBefore: 'ouch', wristPainBefore: 0 }),
    };
  });
  expect(out.noKeysAtAll).toBe(true);
  expect(out.nullBefore).toBe(true);
  expect(out.numberBefore).toBe(true);
  expect(out.junkBefore).toBe(false);
});

test('weekly total (v34, rebased on confirmed timing T2 fix r1): a week with an unconfirmed session says how many it counted', async ({
  page,
}) => {
  // T2 fix r1 (Sep 27 2026, checker's "must"): this used to fold `durationSec`
  // — the app's own tap-time — into the total, so a plain `durationSec` on an
  // otherwise-unconfirmed row silently counted as workout time. The total now
  // comes ONLY from confirmed her_start/her_end pairs (timing.ts's
  // trainingMinutes); a row with `durationSec` but no confirm contributes
  // nothing, same as one with neither.
  const out = await page.evaluate(() => {
    const mk = (id: string, date: string, timing?: { herStartAt: string; herEndAt: string }) => ({
      log: {
        id,
        date,
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        durationSec: 1951, // app tap-time present either way — must be ignored
        herStartAt: timing ? timing.herStartAt : null,
        herStartConfirmed: !!timing,
        herEndAt: timing ? timing.herEndAt : null,
        herEndConfirmed: !!timing,
      },
    });
    const fn = (
      window as unknown as {
        __wtComputeWeekTotals: (s: unknown[]) => {
          count: number;
          trainingMinSum: number;
          trainingKnownCount: number;
        };
      }
    ).__wtComputeWeekTotals;
    const partial = fn([
      mk('a', '2026-09-07T15:00:00.000Z'), // no confirm — logged after the fact
      mk('b', '2026-09-11T15:07:00.000Z', {
        herStartAt: '2026-09-11T15:07:00.000Z',
        herEndAt: '2026-09-11T15:52:00.000Z', // 45 min
      }),
      mk('c', '2026-09-11T15:25:00.000Z', {
        herStartAt: '2026-09-11T15:25:00.000Z',
        herEndAt: '2026-09-11T15:45:00.000Z', // 20 min
      }),
    ]);
    const complete = fn([
      mk('b', '2026-09-11T15:07:00.000Z', {
        herStartAt: '2026-09-11T15:07:00.000Z',
        herEndAt: '2026-09-11T15:52:00.000Z',
      }),
    ]);
    return { partial, complete };
  });
  // The unconfirmed session must NOT drag the total down, and must be declared.
  expect(out.partial.trainingMinSum).toBe(45 + 20);
  expect(out.partial.count).toBe(3);
  expect(out.partial.trainingKnownCount).toBe(2);
  // A complete week says nothing extra.
  expect(out.complete.count).toBe(1);
  expect(out.complete.trainingKnownCount).toBe(1);
});

// The Done safety net: "Keep going" on a 5-hour-old C, walk it to Save, and the
// duration comes out as 5h+. That is a session that sat open, not a workout
// length — it must be blanked ("—") and explained in the note, never logged.
test('Done safety net: a session that comes out longer than 3h logs no duration, with a note', async ({
  page,
  context,
}) => {
  const FIVE_HOURS = 5 * 60 * 60 * 1000;
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FIVE_HOURS, 'C'),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-continue').click();
  await expect(reopened.locator('.exercise-name')).toBeVisible();

  for (let i = 0; i < 30; i++) {
    const isPostLog = await reopened
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    const nextBtn = reopened.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    } else {
      const skipRest = reopened.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          await reopened.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await reopened.mouse.down();
          await reopened.waitForTimeout(700);
          await reopened.mouse.up();
        }
      }
    }
  }
  await expect(reopened.locator('text=Quick log')).toBeVisible();
  await reopened.locator('#save-log').click();
  await expect(reopened.locator('.home-header h1')).toBeVisible();

  const row = await reopened.evaluate(
    (logsKey) =>
      (JSON.parse(localStorage.getItem(logsKey) ?? '[]') as Array<Record<string, unknown>>)[0],
    LOGS_KEY
  );
  expect(row).toBeDefined();
  expect(row!['durationSec']).toBeUndefined();
  expect(String(row!['notes'])).toContain('left open');
  // v48 · P4: the row is read in Sessions — no duration shown, never 5h+.
  await reopened.locator('#view-history').click();
  await expect(reopened.locator('.history-date').first()).not.toContainText(/\d+\s*(h|min|m)\b/);
  await reopened.close();
});

// As of v19 (Jul 9 2026) every program exercise has an enriched EXERCISE_DETAIL
// card, so renderWorkout shows the detail card (voice note + muscle target +
// dropdowns) instead of the legacy how-to card. The old how-to card + its
// EXERCISE_HOWTO/EXERCISE_GUIDE data stay in source as the fallback for any
// future unmapped exercise (archive-not-delete). These three tests moved from
// asserting the how-to card to asserting the detail card that now renders on
// the first exercise (Outdoor walk).
test('detail card: a dropdown section opens and closes on click', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // A opens on the walk step, which deliberately has NO card (stripped Jul 12) —
  // advance one step to the first real exercise before asserting the card.
  await page.locator(NEXT).click();
  // v48: scoped to the detail card — the step card now has its own "Cue ▸".
  const toggle = page.locator('.detail-card .detail-section-toggle').first();
  await expect(toggle).toBeVisible();
  await toggle.click(); // open
  await expect(page.locator('.detail-section-body')).toHaveCount(1);
  await toggle.click(); // close
  await expect(page.locator('.detail-section-body')).toHaveCount(0);
});

test("detail card: Do & Don't dropdown shows do + don't cues", async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click(); // past the card-less walk step
  await page.locator('.detail-section-toggle', { hasText: "Do & Don't" }).click();
  await expect(page.locator('.detail-cue-do').first()).toBeVisible();
  await expect(page.locator('.detail-cue-dont').first()).toBeVisible();
});

test('detail card: face shows the voice note + muscle target on the first exercise', async ({
  page,
}) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click(); // past the card-less walk step
  // Form guidance always renders — now as the detail card, not the how-to card.
  await expect(page.locator('.voice-note-btn')).toBeVisible();
  await expect(page.locator('.muscle-svg')).toBeVisible();
});

test('walk step: shows no form card — Start walk is the whole interface', async ({ page }) => {
  // The v19 card on the walk step was clutter (handoff note, stripped Jul 12 2026).
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('.detail-card')).toHaveCount(0);
  await expect(page.locator('.voice-note-btn')).toHaveCount(0);
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

// v48 · P4 (Sep 24 2026): the 44px stat numbers left home (DECISIONS §2 #2:
// one quiet count, not 3-5). The one large thing on home is now the hero's
// "Workout A" — it keeps the D-1 ramp's heading size (32px), still well above
// the old 28px ceiling this test was written against.
test('redesign: the home hero title uses the heading type scale (>=30px)', async ({ page }) => {
  const title = page.locator('.home-hero .hero-title');
  await expect(title).toBeVisible();
  const fontSize = await title.evaluate(
    (el) => parseFloat(window.getComputedStyle(el).fontSize) || 0
  );
  expect(fontSize).toBeGreaterThanOrEqual(30);
  await expect(page.locator('.stat-number')).toHaveCount(0);
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

// --- Ship 3 (2026-05-15 data viz: sparkline + year-grid) ---------------------
//
// Two inline SVG components: wall-sit sparkline on history rows, year-grid
// heatmap on home. These tests lock in:
//  - year-grid always renders with 7 day-rows (her week, Sat → Fri)
//  - sparkline renders when a history row has ≥2 wall-sit values
//  - sparkline is skipped when a row has 0 or 1 wall-sit value (flat line
//    reads as broken; better to render nothing)

test('ship 3 (replaced): weekly-target grid renders with 3 slots per row', async ({ page }) => {
  // The year-grid was replaced 2026-05-15 with a 3-per-week target view
  // per Allison's "its 3 a week" call. Each row now shows 3 slot pills.
  // With empty history, the current week renders one row with 3 empty slots.
  // v48 · P4: the grid lives in Weekly review › "Week by week".
  await openWeekByWeek(page);
  await expect(page.locator('.consistency-wrap .next-week-summary-label')).toHaveText(
    'Week by week'
  );
  const slots = page.locator('.weekly-row').first().locator('.weekly-slot');
  await expect(slots).toHaveCount(3);
  // The card heading still calls out Consistency, now with "3 per week".
  await expect(page.locator('.weekly-target-title')).toContainText('Consistency');
  await expect(page.locator('.weekly-target-sub')).toContainText('3 per week');
  // The current week is labeled.
  await expect(page.locator('.weekly-row-current .weekly-row-label')).toHaveText('This week');
});

test('ship 3: sparkline renders for history row with >=2 wall-sit values', async ({ page }) => {
  // Seed two B-workouts with wall-sit values, then visit history.
  // localStorage shape is the JSON-stringified array of LogEntry rows.
  // v49 · look fix (Sep 25 2026): dates moved to on/after Sep 24 2026 — the
  // sparkline now reads honestWallSitLogs() only (real v45+ measurements,
  // never a pre-v45 row that saved the week's PRESCRIBED hold as if measured).
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'spark-2',
        date: '2026-09-25T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 28,
        backPain: 1,
        word: 'strong',
        durationSec: 600,
      },
      {
        id: 'spark-1',
        date: '2026-09-24T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 20,
        backPain: 2,
        word: 'tired',
        durationSec: 580,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  // The Sessions list should have a sparkline on the newest row (the one whose
  // trend includes itself + the older value = 2 points). v48 · P4: Recent
  // workouts left home — the same rows live one tap away in Sessions.
  await page.locator('#view-history').click();
  const sparks = page.locator('.history-row .sparkline');
  expect(await sparks.count()).toBeGreaterThanOrEqual(1);
  // Aria label encodes the trend direction.
  const firstSpark = sparks.first();
  await expect(firstSpark).toHaveAttribute('aria-label', /wall sit/);
});

test('ship 3: sparkline NOT rendered for row with 0 or 1 wall-sit value', async ({ page }) => {
  // Single log with wallSitSec=0 (workout C, no wall sit) → no sparkline.
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'no-spark',
        date: '2026-05-13T10:00:00.000Z',
        workout: 'C',
        capacityBefore: 4,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'walked',
        durationSec: 720,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#view-history').click(); // v48 · P4: rows live in Sessions
  // Row exists, but no sparkline (flat-line render would read as broken).
  await expect(page.locator('.history-row').first()).toBeVisible();
  await expect(page.locator('.history-row .sparkline')).toHaveCount(0);
});

// --- Ship 4 (2026-05-15 Weekly review screen) -------------------------------
//
// New AppScreen `weekly-review` reached from home via the "Weekly review →"
// button (below the consistency card) or by tapping the week-nav label.
// Respects viewedWeekOffset so a past-week label tap opens THAT week's review.
//
// These tests lock in:
//  - reachable from home button
//  - header shows session count for the viewed week
//  - empty state renders calmly for a week with no sessions
//  - per-session cards render her one-word entry verbatim (voice rule —
//    typos preserved, never paraphrased)

test('ship 4: weekly review reachable from home button', async ({ page }) => {
  // v48 · P4: the whole week card is the one door (the separate "📊 Weekly
  // review" row is gone).
  await expect(page.locator('#open-weekly-review-link')).toHaveCount(0);
  const reviewBtn = page.locator('#open-weekly-review');
  await expect(reviewBtn).toBeVisible();
  await reviewBtn.click();
  // Header should now be the weekly-review screen header. WK4 (Sep 27 2026):
  // real "now" is always past the completion launch, so the live page reads
  // the completion model's own title ("Week 5 · since Sat Sep 26", §2.4) —
  // never "This week", which only the legacy calendar pages still say.
  await expect(page.locator('h2').first()).toContainText('Week 5');
  // Subtitle reports session count.
  await expect(page.locator('.weekly-review-subtitle')).toContainText('Sessions:');
});

test('ship 4: weekly review header shows session count for current week', async ({ page }) => {
  // Seed two sessions inside the CURRENT Sat–Fri window, computed at runtime so
  // the test doesn't rot as the calendar advances (it formerly hardcoded the
  // week of 2026-05-15). The app anchors weeks to Saturday (Shabbat); mirror
  // saturdayForOffset(0) here and place sessions on Sat+2 and Sat+4 (noon).
  await page.addInitScript(() => {
    const now = new Date();
    const satOffset = (now.getDay() + 1) % 7; // Sat=0, Sun=1, ..., Fri=6
    const saturday = new Date(now);
    saturday.setDate(now.getDate() - satOffset);
    saturday.setHours(12, 0, 0, 0);
    const dayInWeek = (add: number): string => {
      const d = new Date(saturday);
      d.setDate(saturday.getDate() + add);
      return d.toISOString();
    };
    const logs = [
      {
        id: 's-1',
        date: dayInWeek(2),
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 25,
        backPain: 0,
        word: 'good',
        durationSec: 420,
      },
      {
        id: 's-2',
        date: dayInWeek(4),
        workout: 'B',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'tired',
        durationSec: 480,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-weekly-review').click();
  // 2 of 3 — the count number in the subtitle.
  const subtitle = page.locator('.weekly-review-subtitle');
  await expect(subtitle).toContainText('Sessions:');
  await expect(subtitle.locator('strong')).toHaveText('2');
  // Two session rows rendered (v48 · P6: the same row as Sessions).
  await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(2);
});

test('ship 4: weekly review shows one-word verbatim including typos', async ({ page }) => {
  // Voice rule (CLAUDE.md): her one-word entries must appear VERBATIM, never
  // edited or omitted. Even if she typed a typo, render the typo.
  await page.addInitScript(() => {
    // WK4 (Sep 27 2026): dated at "now" itself (real "now" is always after
    // the completion launch) instead of "this calendar week's Saturday" — the
    // live weekly-review page is now the completion model's OPEN span, not a
    // calendar Sat–Fri week, so the session must land inside THAT span, not
    // just "sometime this week".
    const logs = [
      {
        id: 'verbatim',
        date: new Date().toISOString(),
        workout: 'A',
        capacityBefore: 4,
        capacityAfter: 6,
        wallSitSec: 30,
        backPain: 0,
        word: 'gooood start', // intentional typo — must survive untouched
        durationSec: 450,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-weekly-review').click();
  const wordEl = page.locator('.weekly-review-sessions .history-word').first();
  await expect(wordEl).toBeVisible();
  await expect(wordEl).toContainText('gooood start');
});

test('ship 4: weekly review empty state for week with no sessions', async ({ page }) => {
  // No logs → empty state. Subtle line, no nudge, no motivational language.
  await page.goto('/');
  await page.locator('#open-weekly-review').click();
  await expect(page.locator('.weekly-review-empty')).toBeVisible();
  await expect(page.locator('.weekly-review-empty')).toContainText('No sessions this week');
  // No motivational language — the empty state should NOT contain "great",
  // "keep going", "you got this", etc. The system reports, doesn't judge.
  const empty = await page.locator('.weekly-review-empty').textContent();
  expect(empty?.toLowerCase()).not.toContain('great');
  expect(empty?.toLowerCase()).not.toContain('keep going');
  expect(empty?.toLowerCase()).not.toContain('you got');
});

// --- COOLER-LOOK (2026-05-15 evening) → retired by v49 · look (2026-09-25) ---
//
// COOLER-LOOK layered gradients, restrained glass and spring-physics motion on
// top of D-1. The v49 visual pass (SPEC-v49.md §3, §7) retires all of it —
// "Borders, not shadows... No new shadows, glass or gradients" — and aliases
// the old token names to flat/no-op values so the sheet still resolves. These
// tests now lock in THAT: the old names still resolve (nothing references an
// undefined var), but to the new flat, no-glow values — not that glass exists.

test('v49 · look: the retired glass/gradient tokens still resolve, to flat/no-op values', async ({
  page,
}) => {
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      easeSpring: cs.getPropertyValue('--ease-spring').trim(),
      durBase: cs.getPropertyValue('--dur-base').trim(),
      glassBg: cs.getPropertyValue('--glass-bg').trim(),
      gradSurface: cs.getPropertyValue('--grad-surface').trim(),
      gradHero: cs.getPropertyValue('--grad-hero').trim(),
    };
  });
  // Motion still settles (no bounce) — the alias points at the new --ease.
  expect(tokens.easeSpring).toContain('cubic-bezier');
  expect(tokens.durBase).toBeTruthy();
  // Glass retired: transparent, not an rgba wash.
  expect(tokens.glassBg).toBe('transparent');
  // Gradients retired: both resolve to the same flat surface now.
  expect(tokens.gradSurface).toBeTruthy();
  expect(tokens.gradHero).toBeTruthy();
  expect(tokens.gradHero).toBe(tokens.gradSurface);
});

// v48 · P4 (Sep 24 2026): the three tiles became one "Up next" hero + two
// chips. The faint letter sat under the hero's Start, so it went; the letter
// is the hero's own title now, and each chip leads with its letter.
test('cooler-look: the hero names its letter; the chips lead with theirs', async ({ page }) => {
  await expect(page.locator('.workout-card-monogram')).toHaveCount(0);
  await expect(page.locator('.home-hero .hero-title')).toHaveText('Workout A');
  await expect(page.locator('.home-chip').nth(0)).toHaveText(/^B · /);
  await expect(page.locator('.home-chip').nth(1)).toHaveText(/^C · /);
});

test("v49 · look: today's-pick card is a flat hair-strong card, no gradient or glow", async ({
  page,
}) => {
  // Empty history → A is today's pick (per existing test). Spec §6
  // .workout-card-pick: "background: var(--surface)... box-shadow: none" —
  // depth now comes only from the hair-strong border, never a fill or glow.
  const pick = page.locator('.workout-card-pick');
  await expect(pick).toBeVisible();
  const styles = await pick.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      backgroundImage: cs.backgroundImage,
      boxShadow: cs.boxShadow,
      borderRadius: cs.borderRadius,
    };
  });
  expect(styles.backgroundImage).toBe('none');
  expect(styles.boxShadow).toBe('none');
  // Hero radius is the bigger lg value (20px) — visually breaks from the
  // sibling tiles which sit at the default 14px.
  expect(parseFloat(styles.borderRadius)).toBeGreaterThanOrEqual(18);
});

// --- Ship 5 (2026-05-15 Progress screen) -----------------------------------
//
// New AppScreen `progress` — read-only longitudinal view. Reached from home
// via the "📈 Progress →" link below the weekly-review link, and from any
// history-detail screen via "View progress". The screen reports her data; it
// does NOT editorialize. Charts are hand-built inline SVG; no libraries.
//
// These tests lock in:
//  - reachable from home button
//  - wall-sit line chart renders with 2+ data points
//  - empty state renders for fewer than 2 sessions
//  - back-pain bars render only for sessions with backPain > 0

test('ship 5: progress screen reachable from home button', async ({ page }) => {
  const progressBtn = page.locator('#open-progress-link');
  await expect(progressBtn).toBeVisible();
  await progressBtn.click();
  // Header is the progress screen header.
  await expect(page.locator('h2').first()).toHaveText('Progress');
  // v48 · P6: with no sessions there are no A/B/C count chips to show — the
  // count lives in the Start → Now card once sessions exist.
  await expect(page.locator('.progress-subtitle')).toHaveCount(0);
  await expect(page.locator('.progress-empty')).toBeVisible();
});

test('ship 5: wall-sit line chart renders with 2+ wall-sit values', async ({ page }) => {
  // Seed three A-workouts with rising wall-sit values across the program.
  // Progress screen should render the wall-sit chart with a 6px emphasized
  // last-point and a dashed max guideline.
  // v49 · look fix (Sep 25 2026): dates moved to on/after Sep 24 2026 — the
  // trend card now reads honestWallSitLogs() only (real v45+ measurements,
  // never a pre-v45 row that saved the week's PRESCRIBED hold as if measured).
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'p-3',
        date: '2026-09-26T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 30,
        backPain: 1,
        word: 'strong',
        durationSec: 600,
      },
      {
        id: 'p-2',
        date: '2026-09-25T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 25,
        backPain: 0,
        word: 'ok',
        durationSec: 580,
      },
      {
        id: 'p-1',
        date: '2026-09-24T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 4,
        capacityAfter: 5,
        wallSitSec: 18,
        backPain: 2,
        word: 'tired',
        durationSec: 540,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  // v48 · P6: the hero is the LATEST hold (here also the best).
  const card = page.locator('.wall-sit-card');
  await expect(card.locator('.progress-stat-big')).toHaveText('30 s');
  // v51 · her ask: "remove the big empty chart area" — a compact sparkline
  // (.progress-sparkline) replaces the old axis'd .progress-chart line chart.
  await expect(card.locator('.progress-sparkline')).toBeVisible();
  // v51 · the numbers are said in words now ("best 30 s · latest 30 s"),
  // not a "+Ns since <date>" delta. No motivational language allowed: must
  // NOT contain "great", "amazing", "you", etc.
  const meta = await card.locator('.progress-card-meta').textContent();
  expect(meta).toContain('best 30 s');
  expect(meta).toContain('latest 30 s');
  expect(meta?.toLowerCase()).not.toContain('great');
  expect(meta?.toLowerCase()).not.toContain('you got');
});

test('ship 5: empty state renders for fewer than 2 sessions', async ({ page }) => {
  // No logs → empty state. Calm, no nudge.
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.progress-empty')).toBeVisible();
  await expect(page.locator('.progress-empty')).toContainText('Progress shows once you have 2+');
  // No motivational language anywhere on the empty screen.
  const body = await page.locator('.progress-empty').textContent();
  expect(body?.toLowerCase()).not.toContain('keep going');
  expect(body?.toLowerCase()).not.toContain('great');
  // No chart rendered when empty.
  await expect(page.locator('.progress-chart')).toHaveCount(0);
});

test('ship 5: back-pain bars render only for sessions with backPain > 0', async ({ page }) => {
  // 4 sessions: 2 with pain (3, 1), 2 with no pain (0, 0). Bar chart should
  // render 2 visible bars (transparent fill omitted for backPain=0 rows).
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'bp-4',
        date: '2026-05-15T10:00:00.000Z',
        workout: 'B',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 0,
        backPain: 0,
        word: 'fine',
        durationSec: 500,
      },
      {
        id: 'bp-3',
        date: '2026-05-13T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 20,
        backPain: 1,
        word: 'twinge',
        durationSec: 520,
      },
      {
        id: 'bp-2',
        date: '2026-05-10T10:00:00.000Z',
        workout: 'C',
        capacityBefore: 4,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'walked',
        durationSec: 720,
      },
      {
        id: 'bp-1',
        date: '2026-05-05T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 4,
        capacityAfter: 4,
        wallSitSec: 15,
        backPain: 3,
        word: 'sore',
        durationSec: 540,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  // Bar chart SVG exists. Its bars only render for backPain > 0 rows — so we
  // expect exactly 2 bars (backPain = 1 and backPain = 3). v48 · P6: the two
  // pain-free sessions get a faint tick each (witnessed, not blank).
  const barChart = page.locator('.progress-chart-bar');
  await expect(barChart).toBeVisible();
  expect(await barChart.locator('rect.pain-bar').count()).toBe(2);
  expect(await barChart.locator('rect.pain-tick').count()).toBe(2);
  await expect(page.locator('.progress-card').filter({ hasText: 'Back pain' })).toContainText(
    'Pain-free 2 of 4 · avg 2.0 when it hurt'
  );
  // v51 · fix (Sep 25 2026, look-check sev 3): was 140px against a yMax of
  // 10 — mostly empty dark space above near-zero values, uneven next to the
  // wall-sit card's compact treatment. Same ≤64px cap now.
  // v51 · fix (Sep 25 2026): boundingBox() returns sub-pixel float heights
  // (64.00003...px seen locally) that are real layout, not a regression —
  // 0.5px of headroom keeps the cap honest without chasing browser rounding.
  const wrapBox = await page.locator('.progress-chart-wrap-bar').boundingBox();
  expect(wrapBox?.height).toBeLessThanOrEqual(64.5);
});

// ============================================================================
// Ship 6 — Settings screen + motion polish (2026-05-15)
// ============================================================================

test('ship 6: settings reachable from gear icon in home header', async ({ page }) => {
  // Gear button visible top-right of home header.
  await expect(page.locator('#open-settings')).toBeVisible();
  await page.locator('#open-settings').click();
  // Lands on Settings screen.
  await expect(page.locator('h2')).toHaveText('Settings');
  // v48 · P6: Audio, Timing, Display, Gear, Neck release, About as titled
  // cards; Data is one closed fold ("Data · export · import · clear").
  // v50 · cycle (Sep 25 2026): a Cycle card ("Period started today") joins
  // the lineup, between Display and Gear.
  await expect(page.locator('.settings-section-label')).toHaveText([
    'Audio',
    'Timing',
    'Display',
    'Cycle',
    'Gear',
    'Neck release · Lisa · ~10 min',
    'About',
  ]);
  await expect(page.locator('details.settings-data')).toHaveJSProperty('open', false);
  // Back returns to home.
  await page.locator('#back-home').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
});

test('ship 6: beep toggle persists to localStorage', async ({ page }) => {
  await page.locator('#open-settings').click();
  // Default = on. Toggle off via the input (force-click bypasses the visual
  // thumb overlay which sits above the input for styling).
  const input = page.locator('#setting-beeps');
  await expect(input).toBeChecked();
  await input.click({ force: true });
  await expect(input).not.toBeChecked();
  // Setting persists in localStorage as JSON literal `false`.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('workout-tracker:setting-beeps')
  );
  expect(stored).toBe('false');
});

test('ship 6: rest duration stepper updates value and persists', async ({ page }) => {
  await page.locator('#open-settings').click();
  // Default updated 2026-05-15 18:07 to 0s (skip rest entirely) per Allison's
  // "i do not need the brakes anymore" call.
  await expect(page.locator('#rest-val')).toHaveText('0s');
  // Bump up twice — 0 → 5 → 10.
  await page.locator('#rest-inc').click();
  await page.locator('#rest-inc').click();
  await expect(page.locator('#rest-val')).toHaveText('10s');
  // Persisted.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('workout-tracker:setting-rest-sec')
  );
  expect(stored).toBe('10');
  // Decrement bounded — go to 0 and stop (no negative rest).
  for (let i = 0; i < 20; i++) {
    await page.locator('#rest-dec').click();
  }
  await expect(page.locator('#rest-val')).toHaveText('0s');
});

test('ship 6: export sessions downloads a JSON file', async ({ page }) => {
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'export-1',
        date: '2026-05-15T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 25,
        backPain: 0,
        word: 'ok',
        durationSec: 540,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-settings').click();
  await page.locator('.settings-data > summary').click(); // v48 · P6: Data is a fold
  await page.locator('#export-sessions').scrollIntoViewIfNeeded();
  // Trigger download. Playwright's waitForEvent captures the file.
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-sessions').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^workout-tracker-export-\d{4}-\d{2}-\d{2}\.json$/);
});

test('ship 6: clear-data hold-to-confirm wipes localStorage', async ({ page }) => {
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'clear-1',
        date: '2026-05-14T10:00:00.000Z',
        workout: 'B',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 20,
        backPain: 0,
        word: 'fine',
        durationSec: 520,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-settings').click();
  // Hold the clear button for 700ms (HOLD_TO_CLEAR_MS = 500ms). Scroll into
  // view first — the Data card lives near the bottom of the screen so on a
  // 1280×720 viewport the mouse coordinates would otherwise be outside it.
  await page.locator('.settings-data > summary').click(); // v48 · P6: Data is a fold
  const clearBtn = page.locator('#clear-local');
  await clearBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await clearBtn.boundingBox();
  if (!box) throw new Error('clear-local button not visible');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  // localStorage cleared.
  const remaining = await page.evaluate(() => window.localStorage.getItem('workout-tracker:logs'));
  expect(remaining).toBeNull();
  // Status banner confirms.
  await expect(page.locator('#data-status')).toContainText('cleared');
});

// --- Multi-week PROGRAM (2026-05-15) ---------------------------------------
//
// The single static WORKOUTS record was replaced by a PROGRAM: WeekPlan[]
// array with weeks 1-4. Today's date picks which week is active. These tests
// lock in: weeks 1-4 exist, the right week is chosen for May 16-22 (Week 3)
// and May 23-29 (Week 4), the Week badge shows on pre-log, and the
// "Coming next week" preview renders on home with an open diff.

// Helper: mock the system clock via Date.now() override BEFORE the page loads.
// addInitScript runs in the page context before any of our app code.
async function mockDate(page: import('@playwright/test').Page, iso: string): Promise<void> {
  await page.addInitScript((isoArg: string) => {
    const fixed = new Date(isoArg).getTime();
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        // No-arg form is the case the app uses most (`new Date()` / `Date.now()`).
        // Forward any explicit args to the real Date so date math still works.
        if (args.length === 0) {
          super(fixed);
        } else {
          super(...args);
        }
      }
      static override now(): number {
        return fixed;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Date = MockDate;
  }, iso);
}

test('multi-week: pre-log overview shows Week 3 badge in May 16-22 range', async ({ page }) => {
  await mockDate(page, '2026-05-18T10:00:00.000Z'); // Mon May 18 = Week 3
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // v48 · P5: the week leads the pre-log's one quiet line (was a badge).
  await expect(page.locator('.prelog-meta')).toHaveText(/^Week 3 · /);
});

test('multi-week: Week 4 content active for May 25 (Session A holds — squats 12, plank 1x15s)', async ({
  page,
}) => {
  await mockDate(page, '2026-05-25T10:00:00.000Z'); // Mon May 25 = Week 4
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // The quiet line says Week 4 (v48 · P5: was a badge).
  await expect(page.locator('.prelog-meta')).toHaveText(/^Week 4 · /);
  // Open "What's in it" and verify Week 4 numbers are encoded (v48 · P5: one
  // fold; the phases list their moves inside it).
  await page.locator('.prelog-overview-summary').click();
  const mainNames = await page
    .locator('.overview-phase')
    .nth(1)
    .locator('.overview-phase-items')
    .innerText();
  // Forearm plank still in the pool (replaced heel taps in Week 3 — should
  // persist in Week 4). And Bodyweight squats present.
  expect(mainNames).toContain('Forearm plank');
  expect(mainNames).toContain('Bodyweight squats');
  // Walk into the workout and check Session A HELD at Week-3 numbers (decision
  // 2026-05-21: hold A, bump only B & C). Squats stay at 12, not 14.
  await page.locator('button:has-text("Start")').click();
  // Tap through warmup (4 exercises) to reach Main → Squats.
  for (let i = 0; i < 4; i++) {
    await page.locator(NEXT).click();
  }
  await expect(page.locator('.exercise-name')).toHaveText('Bodyweight squats');
  await expect(page.locator('.exercise-reps')).toContainText('12');
});

// v48 · P4 (Sep 24 2026): the preview moved from home to Progress › Program.
test('multi-week: "Coming next week" preview renders in Progress with diff', async ({ page }) => {
  await mockDate(page, '2026-05-18T10:00:00.000Z'); // Week 3 — next is Week 4
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.program-archive-label')).toHaveText('Program');
  // First preview is the immediate-next week. Multiple may render for future weeks.
  const preview = page.locator('.next-week-preview').first();
  await expect(preview).toBeVisible();
  await expect(preview.locator('.next-week-summary-label')).toHaveText('Coming next week');
  // Caption shows when next week starts.
  await expect(preview.locator('.next-week-summary-meta')).toContainText('Week 4');
  // Expand and check the diff. Decision 2026-05-21: Session A HOLDS, only B & C
  // bump — so Workout A reads "unchanged" and the bump (leg raises → 14) lives
  // in Workout B.
  await preview.locator('.next-week-summary').click();
  const aBlock = preview.locator('.next-week-block').nth(0);
  await expect(aBlock.locator('.next-week-block-title')).toContainText('Workout A');
  await expect(aBlock.locator('.next-week-block-empty')).toContainText('unchanged');
  const bBlock = preview.locator('.next-week-block').nth(1);
  await expect(bBlock.locator('.next-week-block-title')).toContainText('Workout B');
  // Week 3 leg raises 12 → Week 4 14 should be in Workout B's list.
  await expect(bBlock.locator('.next-week-block-list')).toContainText('14');
});

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Settings › About": "Program
// weeks: 15" becomes "Round 2 · Week 5" once "now" is past the completion
// launch — real "now" always is, so this replaces the old always-live
// assertion; the pre-launch behavior it used to cover gets its own test
// right below, with mockDate pinning "now" to before the launch.
test('Settings About: post-launch shows the completion model’s own Round/Week, not a raw program-week count', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#open-settings').click();
  await expect(page.locator('.settings-screen')).toBeVisible();
  const row = page.locator('.settings-about-row').filter({ hasText: 'Round 2' });
  await expect(row.locator('.settings-row-title')).toHaveText('Round 2 · Week 5');
  await expect(row.locator('.settings-row-caption')).toHaveText('since Aug 29');
  await expect(
    page.locator('.settings-about-row').filter({ hasText: 'Program weeks' })
  ).toHaveCount(0);
});

test('multi-week: Settings About shows Program weeks count (16) — pre-launch, unchanged', async ({
  page,
}) => {
  await mockDate(page, '2026-09-22T10:00:00.000Z'); // Tue Sep 22 2026 — before the launch, Week 4
  await page.goto('/');
  await page.locator('#open-settings').click();
  await expect(page.locator('.settings-screen')).toBeVisible();
  // About section has a "Program weeks: 16" row
  // (11 round-1 weeks + R2 W1 + R2 W2 + R2 W3 + R2 W4 + R2 W5 (v52.2, Sep 26 2026)).
  await expect(
    page.locator('.settings-about-row').filter({ hasText: 'Program weeks' })
  ).toContainText('Program weeks: 16');
});

test('multi-week: home week-banner reads Week 3 for May 16-22 range', async ({ page }) => {
  await mockDate(page, '2026-05-20T10:00:00.000Z'); // Wed in Week 3
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 3');
});

test('sick week Jul 11-17 holds a blank slot and Jul 18-24 is Week 11', async ({ page }) => {
  // Her calls Jul 17+19 2026: the sick week stays blank and doesn't count
  // ("it should be week 11" + "show a space for the missing week").
  await mockDate(page, '2026-07-19T10:00:00.000Z'); // Sun in the resume week
  await page.goto('/');
  // Banner: the skipped week doesn't advance the count — Week 11, not 12.
  await expect(page.locator('.home-header h1')).toContainText('Week 11');
  // The weekly grid keeps a visible row for the missed week, labeled Sick,
  // with all 3 slots empty. (v48 · P4: Weekly review › Week by week.)
  await openWeekByWeek(page);
  const sickRow = page.locator('.weekly-row').filter({ hasText: 'Sick' });
  await expect(sickRow).toHaveCount(1);
  await expect(sickRow.locator('.weekly-slot-empty')).toHaveCount(3);
});

test('home order: the workout sits first; the week-by-week list is collapsed in Weekly review', async ({
  page,
}) => {
  // Her call Aug 30 2026: "consistency should be collapsible and the
  // workouts should be first." v48 · P4 (DECISIONS Q3): the list moved off
  // home into Weekly review, still collapsed; home keeps the one week line.
  await page.goto('/');
  await expect(page.locator('.consistency-wrap')).toHaveCount(0);
  const heroBox = await page.locator('.home-hero').boundingBox();
  const weekBox = await page.locator('.week-card').boundingBox();
  expect(heroBox!.y).toBeLessThan(weekBox!.y);
  // WK2 (Sep 27 2026): see the "zero sessions" test's own comment above.
  await expect(page.locator('.week-line')).toContainText('of 3 · A, B and C to go');
  await page.locator('#open-weekly-review').click();
  const wrap = page.locator('.consistency-wrap');
  await expect(wrap).toHaveJSProperty('open', false);
  await expect(wrap.locator('.next-week-summary-label')).toHaveText('Week by week');
});

// v53 (Sep 26 2026) Tips audit: her words, "Cue in the app? It says to cue
// something, that seems to do nothing" — the fold worked, the label and the
// program bookkeeping leaking through it didn't. Scans every exercise `notes`
// string the app can show (PROGRAM's every week/round in app.ts + every rung
// in ladders.ts) and fails on the PROGRAM-not-movement tells: another
// workout letter, "keeps its", a stale number ("was N"), a version tag, or a
// week number. Reading straight from source, not a live page, so it covers
// past/future weeks too — not just whatever week today happens to land on.
test('Tips audit: no exercise notes string leaks PROGRAM bookkeeping instead of movement guidance', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const bannedPatterns: [RegExp, string][] = [
    [/\b(in|for) [ABC]\b/, 'references another workout (in/for A|B|C)'],
    [/keeps its/i, '"keeps its" (program comparison)'],
    [/\bwas \d/, '"was N" (stale-number bookkeeping)'],
    [/\bv\d{2}\b/, 'a version tag (vNN)'],
    [/week \d/i, 'a week number'],
    // v53 fix (CHECK M6, Sep 26 2026): the 6 patterns that let R2 Week 2's
    // citation text ("81% MVIC, best of 12 tested — DiStefano 2009") and
    // program-comparison tells ("stays exactly as it is", "the change is
    // EFFORT") through — the gate was green while she'd have read them.
    [/MVIC/, 'a study measure (MVIC)'],
    [/\d+%/, 'a percentage (study data)'],
    [/best of \d+ tested/i, 'a study-selection citation'],
    [/\b[A-Z][a-z]+ (19|20)\d{2}\b/, 'a Name-YYYY citation'],
    [/stays exactly as it is/i, 'a program-comparison tell'],
    [/the change is/i, 'a program-comparison tell'],
  ];
  const noteRe = /notes:\s*\n?\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const offenders: string[] = [];
  for (const file of ['app.ts', 'ladders.ts']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = noteRe.exec(src))) {
      const text = m[2]!;
      const line = src.slice(0, m.index).split(/\r?\n/).length;
      for (const [re, why] of bannedPatterns) {
        if (re.test(text)) offenders.push(`${file}:${line} — ${why} — "${text}"`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

test('deploy hygiene: every dist/*.js module app.js imports (transitively) is precached', () => {
  // v53 fix (CHECK M1, Sep 26 2026): dist/pain-feel.js was imported by
  // app.js but missing from BOTH sw.js precache lists — the ONE gap in nine
  // modules was enough for an offline start to fail the whole module graph
  // on a blank page (Playwright's setOffline doesn't exercise the service
  // worker, so a naive offline test passed falsely; only a stopped-server
  // drive with the HTTP cache cleared caught it). This walks the REAL import
  // graph from the BUILT dist/*.js output — not a hand-kept list of module
  // names — so a future import can never repeat the gap silently.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const distDir = path.join(__dirname, '..', 'dist');
  const importRe = /from\s+'\.\/([\w-]+\.js)'/g;

  function localImports(file: string): string[] {
    const src = fs.readFileSync(path.join(distDir, file), 'utf8');
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) found.push(m[1]!);
    return found;
  }

  const graph = new Set<string>();
  const queue: string[] = ['app.js'];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const dep of localImports(file)) {
      if (!graph.has(dep)) {
        graph.add(dep);
        queue.push(dep);
      }
    }
  }
  // Sanity: the graph actually found something, so an empty/broken build
  // doesn't pass this test by vacuous truth.
  expect(graph.size).toBeGreaterThan(0);

  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const missingFromShell: string[] = [];
  const missingFromCodeRequest: string[] = [];
  for (const mod of graph) {
    if (!swSrc.includes(`'./dist/${mod}'`)) missingFromShell.push(mod);
    if (!swSrc.includes(`endsWith('/dist/${mod}')`)) missingFromCodeRequest.push(mod);
  }
  expect({ missingFromShell, missingFromCodeRequest }).toEqual({
    missingFromShell: [],
    missingFromCodeRequest: [],
  });
});

test('deploy hygiene: sw.js cache VERSION stays in sync with APP_VERSION', () => {
  // v25 shipped with sw.js still saying v24 — an installed PWA then kept the
  // old cache name and the new build didn't visibly land on her phone. The
  // sync rule was only a comment; this makes it a failing test instead.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  // v52.2 (Sep 26 2026): versions can carry a dot now (v52.1, v52.2, …) — the
  // pattern must accept that or a dotted bump falsely reads as "out of sync".
  const appVersion = /APP_VERSION = '(v\d+(?:\.\d+)?)'/.exec(appSrc)?.[1];
  const swVersion = /VERSION = 'workout-tracker-(v\d+(?:\.\d+)?)'/.exec(swSrc)?.[1];
  expect(appVersion).toBeTruthy();
  expect(swVersion).toBe(appVersion);
});

test('round 2: banner reads Round 2 · Week 1 from Aug 29 2026 and restart numbers are live', async ({
  page,
}) => {
  // Her call Aug 30 2026: past data = a closed chapter (archived, pullable);
  // a new round starts. Week numbers restart at 1; the restart week is the
  // compact 2-round version with pulled-back numbers.
  await mockDate(page, '2026-08-30T15:00:00.000Z'); // Sun in R2 Week 1
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Round 2 · Week 1');
  // The pre-log's quiet line carries the round too (v48 · P5: was a badge).
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.prelog-meta')).toHaveText(/^R2 · Week 1 · /);
});

test('round 2: break weeks Jul 25–Aug 28 hold blank labeled rows, round-1 weeks keep plain labels', async ({
  page,
}) => {
  await mockDate(page, '2026-08-30T15:00:00.000Z');
  await page.goto('/');
  // Consistency is collapsed by default (v26) — expand it to see the rows.
  // (v48 · P4: in Weekly review.)
  await openWeekByWeek(page);
  // Five Break rows, each with 3 empty slots (nothing logged over the summer).
  const breakRows = page.locator('.weekly-row').filter({ hasText: 'Break' });
  await expect(breakRows).toHaveCount(5);
  // Round-1 rows keep their old plain "Wk N" labels (no R1 prefix).
  await expect(page.locator('.weekly-row-label', { hasText: /Wk 10 ·/ }).first()).toBeVisible();
  await expect(page.locator('.weekly-row-label', { hasText: /R1/ })).toHaveCount(0);
});

test('walk credit: start/stop timer logs a walk, bumps week count, streak untouched', async ({
  page,
}) => {
  // Jul 4 2026 — her Jun-18 ask, upgraded same night to her timer idea
  // ("click walking and you automatically start tracking until I tell you
  // I'm done"). Walks are extra credit: the "of 3 this week" streak number
  // must NOT move when a walk is logged.
  // v48 · P4: the count is in home's one week line now.
  const streakBefore = await page.locator('.week-line').textContent();
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  await page.locator('#log-walk-start').click();
  // v48 · P3: minutes only — "Walking · 0 min" (was "Walking since 18:02 · …").
  await expect(page.locator('#walk-live')).toHaveText(/^Walking · \d+ min$/);
  await expect(page.locator('#finish-walk')).toBeVisible();
  await page.locator('#finish-walk').click();
  await expect(page.locator('.walk-text')).toContainText('1 this week');
  await expect(page.locator('.week-line')).toHaveText(streakBefore ?? '');
  // A second walk works the same way — repeat laps are legitimate.
  await page.locator('#log-walk-start').click();
  await page.locator('#finish-walk').click();
  await expect(page.locator('.walk-text')).toContainText('2 this week');
});

test('in-workout walk: does NOT auto-start on the step — needs an explicit Start tap', async ({
  page,
}) => {
  // Allison Jul 9 2026: "just because I'm on the page doesn't mean it started
  // walking." Landing on the Outdoor-walk step (workout A's first exercise) must
  // NOT begin tracking or stamp a start; only tapping Start does.
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click(); // pre-log Start
  // On the walk step: the Start button is shown, nothing is tracking yet.
  await expect(page.locator('#ww-start')).toBeVisible();
  await expect(page.locator('#walk-live')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))).toBeNull();
  // Tap Start → tracking begins and the start is stamped.
  await page.locator('#ww-start').click();
  await expect(page.locator('#walk-live')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))
  ).not.toBeNull();
});

test('lite day: pre-log toggle drops one round and marks the session lite', async ({ page }) => {
  // Allison Jul 12 2026 (from the Jul-9 deep-dive): a low-energy day needs a real
  // mechanic, not advice — tap Lite on pre-log → one round less (C: 2→1), streak
  // intact. The round indicator carries the "lite" tag.
  await page.locator('button[data-workout="C"]').click();
  await expect(page.locator('#lite-toggle')).toBeVisible();
  await page.locator('#lite-toggle').click();
  // v48 · P5: the chip says what Lite is today, and how to undo it.
  await expect(page.locator('#lite-toggle')).toHaveText('✓ Lite · 1 round today · tap to undo');
  await page.locator('button:has-text("Start")').click();
  // C's warmup is the walk step — advance past it into the main block.
  await page.locator(NEXT).click();
  // v48: one progress line — "Main · Round 1 of 1 · lite".
  await expect(page.locator('.round-indicator')).toContainText('Main · Round 1 of 1 · lite');
});

test('walk: Cancel discards an opened walk without logging it', async ({ page }) => {
  // Allison Jul 9 2026: "only log walks where i finish the walk — if i just
  // open [it] to check, [it] doesn't count." Cancel is the non-logging exit.
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  await page.locator('#log-walk-start').click();
  await expect(page.locator('#finish-walk')).toBeVisible();
  await expect(page.locator('#cancel-walk')).toBeVisible();
  await page.locator('#cancel-walk').click();
  // Back to the start state, and NOTHING logged.
  await expect(page.locator('#log-walk-start')).toBeVisible();
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  const walks = await page.evaluate(() => localStorage.getItem('workout-tracker:walks'));
  expect(walks === null || (JSON.parse(walks) as unknown[]).length === 0).toBeTruthy();
});

test.describe('walk distance (GPS granted)', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 31.771, longitude: 35.2137 },
  });

  test('v48 · P3: a walk is minutes only — GPS movement shows no km and saves no meters', async ({
    page,
    context,
  }) => {
    // Jul 4 2026 her call was GPS distance; Sep 7 her words were "walk counter
    // not important now", and the numbers never matched Fit (3 steps in 29 min,
    // 16 m in 12 min). v48 archives the sensors: even with GPS granted and the
    // phone moving ~55 m a hop, nothing but minutes shows, and nothing else saves.
    await page.locator('#log-walk-start').click();
    await expect(page.locator('#walk-live')).toHaveText(/^Walking · \d+ min$/);
    await context.setGeolocation({ latitude: 31.7715, longitude: 35.2137 });
    await context.setGeolocation({ latitude: 31.772, longitude: 35.2137 });
    await page.waitForTimeout(500);
    await expect(page.locator('.walk-card')).not.toContainText('km');
    await expect(page.locator('.walk-card')).not.toContainText(/steps/i);
    await page.locator('#finish-walk').click();
    await expect(page.locator('.walk-text')).toContainText('1 this week');
    const walks = JSON.parse(
      (await page.evaluate(() => localStorage.getItem('workout-tracker:walks'))) ?? '[]'
    ) as { minutes: number | null; meters: number | null; steps: number | null }[];
    expect(walks[0]?.minutes).toBeGreaterThanOrEqual(1);
    expect(walks[0]?.meters).toBeNull();
    expect(walks[0]?.steps).toBeNull();
  });
});

// --- Round 2 · Week 2 (Sep 5-11 2026) --------------------------------------
//
// "Harder versions, not reps" — her ask Sep 7: "ok but its not always about
// adding its abut tehactual execrises". These lock in the three real changes
// (the plank held WITH a posterior pelvic tilt, the modified dead bug
// graduating to the full one in A + B, and bird dog legs-only as the first
// hands-on-floor move since April), the deeper wall sit, and the fact that C
// deliberately stays on the modified dead bug.

test('R2 W2: a date inside Sep 5-11 2026 resolves to Round 2 · Week 2', async ({ page }) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z'); // Tue inside Sep 5-11
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Round 2 · Week 2');
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.prelog-meta')).toHaveText(/^R2 · Week 2 · /); // v48 · P5
});

test('R2 W2: workout A carries the full dead bug, bird dog legs-only, the tilted plank and a 40 s wall sit', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // The overview lists every phase's exercise names (textContent is in the DOM
  // whether or not the <details> is open).
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Full dead bug');
  expect(overview).toContain('Bird dog (legs only)');
  expect(overview).toContain('Forearm plank');
  expect(overview).toContain('Wall sit');
  // The modified version is GONE from A — it graduated.
  expect(overview).not.toContain('Modified dead bug');

  // Walk into the session and read the actual step content.
  await page.locator('button:has-text("Start")').click();
  const seen: Record<string, string> = {};
  for (let i = 0; i < 40; i++) {
    // Short timeouts: several steps legitimately have no notes element, and the
    // default 30 s auto-wait would burn the whole test budget on them.
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name) {
      await openCue(page);
      const notes =
        (await page
          .locator('.exercise-notes')
          .first()
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      const reps =
        (await page
          .locator('.exercise-reps')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      seen[name] = `${reps} :: ${notes}`;
    }
    if (seen['Forearm plank']) break;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }

  await expect(page.locator('.exercise-name')).toHaveText('Forearm plank');
  // Wall sit: 40 s, and the cue is DEEPER not longer. v53 fix (CHECK M6, Sep
  // 26 2026): "You held 38 s last week" was program-comparison talk, not
  // movement guidance — moved to a PROGRAM comment (Tips audit).
  expect(seen['Wall sit']).toContain('40 sec');
  expect(seen['Wall sit']).toContain('DEEPER, not longer');
  expect(seen['Wall sit']).not.toContain('38 s');
  // Forearm plank: same 20 s, held WITH a posterior pelvic tilt.
  expect(seen['Forearm plank']).toContain('20 sec');
  expect(seen['Forearm plank']).toContain('posterior pelvic tilt');
  expect(seen['Forearm plank']).toContain('tailbone');
  // Full dead bug: opposite arm overhead, 8 each side.
  expect(seen['Full dead bug']).toContain('8 each side');
  expect(seen['Full dead bug']).toContain('OPPOSITE ARM');
});

test('R2 W2: workout C stays on the MODIFIED dead bug (no full dead bug, no bird dog)', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Modified dead bug');
  expect(overview).not.toContain('Full dead bug');
  // C is the cardio day — no upper-back block, so no bird dog either.
  expect(overview).not.toContain('Bird dog');
});

test('R2 W2: bird dog legs-only sits at the END of the upper-back block in A and B', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  for (const id of ['A', 'B']) {
    await page.goto('/');
    await page.locator(`button[data-workout="${id}"]`).click();
    const upperBack = await page
      .locator('.overview-phase')
      .filter({ hasText: 'Upper back' })
      .locator('.overview-phase-items')
      .textContent();
    expect(upperBack ?? '').toMatch(/Wall angels.*IWYT raises.*Bird dog \(legs only\)$/);
  }
});

// Every exercise the week references must carry form guidance, or she lands on
// a bare step mid-workout. The app renders EXERCISE_DETAIL first and falls back
// to EXERCISE_GUIDE, so the UNION is what has to cover the week (several
// long-standing moves — Wall angels, Forearm plank, the stretches — only ever
// got detail cards). Source-level, so it also covers steps a UI walk-through
// would need 40 taps to reach.
test('R2 W2: every exercise name in the week has a detail card or a how-to guide entry', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.join(__dirname, '..');
  const appSrc = fs.readFileSync(path.join(root, 'app.ts'), 'utf8');
  const detailSrc = fs.readFileSync(path.join(root, 'exercise-detail.ts'), 'utf8');

  const weekStart = appSrc.indexOf('// --- ROUND 2 · WEEK 2');
  const weekEnd = appSrc.indexOf('// --- Resolvers', weekStart);
  expect(weekStart).toBeGreaterThan(-1);
  expect(weekEnd).toBeGreaterThan(weekStart);

  // A shared building block's full declaration, found by balanced-bracket scan
  // (string-aware) so single-line and multi-line consts both resolve exactly.
  const declBlock = (id: string): string | null => {
    const head = new RegExp(`\\nconst ${id}\\b[^\\n=]*=\\s*`).exec(appSrc);
    if (!head) return null;
    let i = head.index + head[0].length;
    const open = appSrc[i];
    if (open !== '[' && open !== '{') return null;
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr: string | null = null;
    for (; i < appSrc.length; i++) {
      const ch = appSrc[i] as string;
      if (inStr !== null) {
        if (ch === '\\') i += 1;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return appSrc.slice(head.index, i + 1);
      }
    }
    return null;
  };

  // Collect `name: '...'`, then follow any shared const the block references
  // (WALK_WARMUP_AB, UPPER_BACK_SAFE_R2W2, …). PROGRAM is skipped — that one is
  // every week ever encoded.
  const collect = (block: string, seen: Set<string>, out: Set<string>): void => {
    const code = block
      .replace(/^\s*\/\/.*$/gm, '')
      // Drop the WORKOUT `name:` ("Lower Body + Core") that sits right under
      // `id: 'A'` — those are session titles, not exercises.
      .replace(/id: '[ABC]',\s*\n\s*name: '[^']*',/g, '');
    for (const m of code.matchAll(/name: '((?:[^'\\]|\\.)*)'/g)) {
      out.add((m[1] ?? '').replace(/\\'/g, "'"));
    }
    for (const m of code.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
      const id = m[1] ?? '';
      if (id === 'PROGRAM' || seen.has(id)) continue;
      seen.add(id);
      const decl = declBlock(id);
      if (decl) collect(decl, seen, out);
    }
  };
  const names = new Set<string>();
  collect(appSrc.slice(weekStart, weekEnd), new Set<string>(), names);

  // Sanity: resolution actually reached the shared blocks + the new moves.
  expect(names.has('Full dead bug')).toBe(true);
  expect(names.has('Bird dog (legs only)')).toBe(true);
  expect(names.has('Wall angels')).toBe(true); // via UPPER_BACK_SAFE_R2W2
  expect(names.has('Outdoor walk')).toBe(true); // via WALK_WARMUP_AB
  expect(names.has('Neck stretch')).toBe(true); // via STRETCH_COOLDOWN
  expect(names.size).toBeGreaterThan(20);

  const guideStart = appSrc.indexOf('const EXERCISE_GUIDE');
  const guideBlock = appSrc.slice(guideStart, appSrc.indexOf('\n};', guideStart));
  const keysIn = (src: string): Set<string> =>
    new Set(
      [...src.matchAll(/^ {2}'((?:[^'\\]|\\.)*)': \{/gm)].map((m) =>
        (m[1] ?? '').replace(/\\'/g, "'")
      )
    );
  const guideKeys = keysIn(guideBlock);
  const detailKeys = keysIn(detailSrc);

  const uncovered = [...names].filter((n) => !guideKeys.has(n) && !detailKeys.has(n));
  expect(uncovered).toEqual([]);
  // The two NEW moves carry BOTH — a how-to entry and a full detail card.
  for (const n of ['Full dead bug', 'Bird dog (legs only)']) {
    expect(guideKeys.has(n)).toBe(true);
    expect(detailKeys.has(n)).toBe(true);
  }
  // The apartment-cardio step is a named exercise too, so it needs guidance.
  expect(guideKeys.has('Apartment cardio')).toBe(true);
});

// --- Cardio either/or (Sep 7 2026) -----------------------------------------
// Her ask, verbatim: "also i want cardio i can do in apt or walk like pick
// either or". Walk outside = the tracked flow, untouched. Apartment = the same
// minutes on a plain countdown, nothing tracked, marked in the session notes.

test('cardio either/or: the walk step offers an apartment option that swaps in a same-length timer', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // Both lanes are offered on the cardio step; nothing is tracking yet.
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#ww-start')).toBeVisible();
  await expect(page.locator('#ww-apartment')).toBeVisible();

  // Pick the apartment → the step becomes a 10-minute countdown, same minutes.
  await page.locator('#ww-apartment').click();
  await expect(page.locator('.exercise-name')).toHaveText('Apartment cardio');
  await expect(page.locator('.exercise-reps')).toContainText('10 min');
  await expect(page.locator('.timer-display')).toHaveText('10:00');
  await expect(page.locator('#start-timed')).toBeVisible();
  // Nothing from the walk engine is running.
  expect(await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))).toBeNull();

  // And she can change her mind back to the outdoor walk.
  await page.locator('#ww-outdoor').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#ww-start')).toBeVisible();
});

test('cardio either/or: finishing after the apartment option saves the lane + its minutes, and never POSTs', async ({
  page,
}) => {
  // C's cardio block is 25 min, so the saved marker must read 25. Sync is off
  // under automation (navigator.webdriver), so this can never reach the real
  // workout_sessions table — asserted below, not assumed.
  const posted: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') posted.push(req.url());
  });
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await page.locator('#ww-apartment').click();
  await expect(page.locator('.exercise-name')).toHaveText('Apartment cardio');
  await expect(page.locator('.timer-display')).toHaveText('25:00');

  for (let i = 0; i < 30; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#session-note').fill('inside');
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as {
    walkMinutes?: number | null;
    notes?: string | null;
    cardioLane?: string | null;
    cardioMinutes?: number | null;
  }[];
  expect(logs.length).toBe(1);
  // v48: the lane + its minutes have their own fields; walk_minutes is for real
  // walks only and `notes` no longer carries a marker.
  expect(logs[0]?.cardioLane).toBe('apartment');
  expect(logs[0]?.cardioMinutes).toBe(25);
  expect(logs[0]?.walkMinutes).toBeNull();
  expect(logs[0]?.notes).toBeNull();
  expect(posted.filter((u) => u.includes('workout_sessions'))).toEqual([]);

  // The choice is per-session — it must not leak into the next workout.
  expect(
    await page.evaluate(() => localStorage.getItem('workout-tracker:ww-apartment'))
  ).toBeNull();
});

// --- Guided indoor strip (v30, Sep 7 2026) ---------------------------------
// Her words: "Also did you make alternative to outdoor walk / Because I often
// don't want to go outside" → "Something similar with a similar amount of like
// movement warm up cardio". v29's apartment lane was a countdown plus a written
// menu — a timer and a DECISION. Now it runs five 2-minute segments that cycle
// for the whole block, and the screen says which one is live, derived from the
// countdown itself. Still ONE step in the phase array.

// A clock the TEST can move. mockDate FREEZES time, which is right for
// date-based content but can never advance a countdown. This pins Date.now() to
// a base plus a window-level offset the test bumps — so the app's own (real)
// rAF loop sees the jump on its very next frame and re-renders, with no
// thousands of synthetic frames to grind through.
async function movableClock(
  page: import('@playwright/test').Page,
  iso: string,
  opts: { skipPreCountdown?: boolean } = {}
): Promise<void> {
  await page.addInitScript((isoArg: string) => {
    const base = new Date(isoArg).getTime();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__clockOffset = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nowMs = (): number => base + Number((window as any).__clockOffset ?? 0);
    const RealDate = Date;
    class MovableDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(nowMs());
        } else {
          super(...args);
        }
      }
      static override now(): number {
        return nowMs();
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Date = MovableDate;
  }, iso);
  if (opts.skipPreCountdown) {
    // The 3-2-1 "Get ready" is a separate timer; zero it so the block timer —
    // the one the strip is derived from — starts on the tap.
    await page.addInitScript(() => {
      window.localStorage.setItem('workout-tracker:setting-pre-count', '0');
    });
  }
}

async function advanceClock(page: import('@playwright/test').Page, ms: number): Promise<void> {
  await page.evaluate((msArg: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__clockOffset = Number((window as any).__clockOffset ?? 0) + msArg;
  }, ms);
}

test('indoor strip: choosing the apartment option shows the first segment, ready to go', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-apartment').click();
  await expect(page.locator('.exercise-name')).toHaveText('Apartment cardio');

  // Segment 1 is live before she taps Start, labelled as what's coming.
  const strip = page.locator('.cardio-routine');
  await expect(strip).toHaveAttribute('data-segment-index', '0');
  await expect(page.locator('.cardio-seg-label')).toHaveText('Starts with');
  await expect(page.locator('.cardio-seg-now')).toHaveText('Easy marching in place');
  await expect(page.locator('.cardio-seg-cue')).toHaveText('Loose arms swinging. Just get moving.');
  // The whole list is visible, in order, with the live one highlighted.
  await expect(page.locator('.cardio-seg-item')).toHaveCount(5);
  await expect(page.locator('.cardio-seg-item.is-current')).toHaveCount(1);
  await expect(page.locator('.cardio-seg-item').nth(0)).toHaveClass(/is-current/);
  await expect(page.locator('.cardio-seg-item').nth(1)).toContainText('Step touch, side to side');
  await expect(page.locator('.cardio-seg-item').nth(4)).toContainText('Marching, a bit quicker');
  // Stairs stay offered — but as an alternative in the footnote, never the default.
  await expect(page.locator('.cardio-seg-foot')).toContainText('building stairs');
  // And the escape hatch back outside is still right there.
  await expect(page.locator('#ww-outdoor')).toBeVisible();
});

test('indoor strip: the live segment advances by itself as the countdown crosses a boundary', async ({
  page,
}) => {
  await movableClock(page, '2026-09-08T10:00:00.000Z', { skipPreCountdown: true });
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-apartment').click();
  await expect(page.locator('.timer-display')).toHaveText('10:00');

  await page.locator('#start-timed').click();
  await expect(page.locator('.cardio-seg-label')).toHaveText('Right now');
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '0');

  // 1:30 in — still inside the first two-minute segment.
  await advanceClock(page, 90_000);
  // v53 (Sep 26 2026): the running countdown lives in the pip now.
  await expect(page.locator('.timer-pip-time')).toHaveText('8:30');
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '0');

  // Cross 2:00 → segment 2, with no tap from her.
  await advanceClock(page, 40_000);
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '1');
  await expect(page.locator('.cardio-seg-now')).toHaveText('Step touch, side to side');
  await expect(page.locator('.cardio-seg-item').nth(1)).toHaveClass(/is-current/);
  await expect(page.locator('.cardio-seg-item').nth(0)).not.toHaveClass(/is-current/);

  // Cross 4:00 → segment 3, and the per-move countdown reads the time left in it.
  await advanceClock(page, 120_000);
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '2');
  await expect(page.locator('.cardio-seg-now')).toHaveText('Knee lifts');
  await expect(page.locator('.cardio-seg-left')).toContainText('left in this move');
});

test('indoor strip: a 25-minute block cycles past segment five back to segment one', async ({
  page,
}) => {
  // Workout C's cardio block is 25 min = twelve and a half segments, so it must
  // loop — and end mid-list rather than stopping dead after the fifth move.
  await movableClock(page, '2026-09-08T10:00:00.000Z', { skipPreCountdown: true });
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-apartment').click();
  await expect(page.locator('.timer-display')).toHaveText('25:00');
  await page.locator('#start-timed').click();

  // 8:20 in = the fifth (last) segment of the first pass.
  await advanceClock(page, 500_000);
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '4');
  await expect(page.locator('.cardio-seg-now')).toHaveText('Marching, a bit quicker');

  // 10:20 in = past the end of the list → wraps to the first move again.
  await advanceClock(page, 120_000);
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '0');
  await expect(page.locator('.cardio-seg-now')).toHaveText('Easy marching in place');
  await expect(page.locator('.timer-pip-time')).toHaveText('14:40');

  // …and keeps cycling on the second pass.
  await advanceClock(page, 130_000);
  await expect(page.locator('.cardio-routine')).toHaveAttribute('data-segment-index', '1');
  await expect(page.locator('.cardio-seg-now')).toHaveText('Step touch, side to side');
});

test('indoor strip: the outdoor walk is untouched — no strip, tracking still starts on tap', async ({
  page,
}) => {
  // The strip belongs to the indoor lane only. The walk keeps its own interface
  // (Start → tracking line), and none of the GPS/step path may be disturbed.
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('.cardio-routine')).toHaveCount(0);

  await page.locator('#ww-start').click();
  await expect(page.locator('#walk-live')).toBeVisible();
  await expect(page.locator('.cardio-routine')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))
  ).not.toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem('workout-tracker:ww-apartment'))
  ).toBeNull();
});

test('indoor strip: the card carries no baked duration (the block is 10 min in A/B, 25 in C)', () => {
  // A weekly-changing number baked into a card went stale in this repo once
  // already. The detail card + guide entry must talk in "your minutes".
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const detailSrc = fs.readFileSync(path.join(__dirname, '..', 'exercise-detail.ts'), 'utf8');
  const start = detailSrc.indexOf("'Apartment cardio': {");
  expect(start).toBeGreaterThan(-1);
  const end = detailSrc.indexOf("'Belly breathing': {", start);
  const card = detailSrc.slice(start, end);
  // No "10 min"/"25 minutes"/"ten minutes" style duration claims inside the card.
  expect(card).not.toMatch(/\b\d+\s*(?:-|\s)?min(?:ute)?s?\b/i);
  expect(card).not.toMatch(/\b(?:ten|twenty-five|twenty five)\s+minutes\b/i);
  // The two-minute segment length is the routine's own shape, not a weekly
  // number — it's allowed, and it's what makes the strip legible.
  expect(card).toContain('two minutes each');
});

// --- Elliptical lane (v43, Sep 24 2026) --------------------------------------
// The York BX200 arrived Thu Sep 24. Her words: "let's start putting the
// elliptical in" → "So no more walk it could be walk or elliptical". The cardio
// step is now a three-way pick; the elliptical is a same-minutes timer plus the
// level she rode at, saved in the notes marker and read back next session.

test('elliptical: the cardio step offers three lanes and the elliptical swaps in a same-length timer', async ({
  page,
}) => {
  await mockDate(page, '2026-09-24T08:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#ww-elliptical')).toBeVisible();
  await expect(page.locator('#ww-start')).toBeVisible();
  await expect(page.locator('#ww-apartment')).toBeVisible();

  await page.locator('#ww-elliptical').click();
  await expect(page.locator('.exercise-name')).toHaveText('Elliptical');
  await expect(page.locator('.exercise-reps')).toContainText('10 min');
  await expect(page.locator('.timer-display')).toHaveText('10:00');
  await expect(page.locator('#start-timed')).toBeVisible();
  // v48 · P3 (decision Q5): no level before the ride — the ride starts AND ends
  // on 3, so the level is logged after it. One line says how to start instead.
  await expect(page.locator('#ell-level')).toHaveCount(0);
  await expect(page.locator('.exercise-safety')).toHaveText(
    'Start on level 3, easy · stand tall, hands light'
  );
  // The walk engine never started.
  expect(await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))).toBeNull();

  // Back to the choice, then apartment — only one lane is ever live.
  await page.locator('#ww-outdoor').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await page.locator('#ww-apartment').click();
  await expect(page.locator('.exercise-name')).toHaveText('Apartment cardio');
  expect(
    await page.evaluate(() => localStorage.getItem('workout-tracker:ww-elliptical'))
  ).toBeNull();
});

test('elliptical: finishing saves the minutes + level + readings, never POSTs, and clears the lane', async ({
  page,
}) => {
  const posted: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') posted.push(req.url());
  });
  // v48 · P3: the level + readings are filled AFTER the ride, so the ride runs.
  await movableClock(page, '2026-09-24T08:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-elliptical').click();
  await expect(page.locator('.timer-display')).toHaveText('25:00');
  await page.locator('#start-timed').click();
  await advanceClock(page, 25 * 60_000 + 2_000);
  await expect(page.locator('.timer-done')).toHaveText('✓ 25 min done');
  // v51 (Sep 25 2026): Done · Next now opens the ride-numbers screen instead
  // of sitting under an inline card — the readings only exist there.
  await page.locator('#next').click();
  await expect(page.locator('#ell-time')).toBeVisible();
  // First tap on a first ride starts from level 3 and moves one: 4, then 5.
  await page.locator('#ell-level-up').click();
  await page.locator('#ell-level-up').click();
  await expect(page.locator('#ell-level')).toHaveText('5');
  // Copied off the machine's screen, before STOP.
  await page.locator('#ell-km').fill('2.15');
  await page.locator('#ell-pulse').fill('128');

  for (let i = 0; i < 30; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    // v51: ID-based — "Save · Next" on the ride-numbers screen shares #next
    // with every other Done · Next.
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#session-note').fill('Knee fine, legs heavy on the elliptical');
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs.length).toBe(1);
  // v48: the readings off the machine's screen are numbers in their own fields,
  // and her note is its own field, verbatim — nothing is glued into `notes`.
  expect(logs[0]?.['cardioLane']).toBe('elliptical');
  expect(logs[0]?.['cardioMinutes']).toBe(25);
  expect(logs[0]?.['ellipticalLevel']).toBe(5);
  expect(logs[0]?.['ellipticalKm']).toBe(2.15);
  expect(logs[0]?.['ellipticalPulse']).toBe(128);
  expect(logs[0]?.['sessionNote']).toBe('Knee fine, legs heavy on the elliptical');
  expect(logs[0]?.['walkMinutes']).toBeNull();
  expect(logs[0]?.['notes']).toBeNull();
  expect(posted.filter((u) => u.includes('workout_sessions'))).toEqual([]);
  for (const key of [
    'workout-tracker:ww-elliptical',
    'workout-tracker:ww-elliptical-level',
    'workout-tracker:ww-elliptical-km',
    'workout-tracker:ww-elliptical-pulse',
  ]) {
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  }
});

// v54 (Sep 27 2026) — WORKOUT D: her Sep 27 NotebookLM reflection ("30
// minutes on the elliptical separately... call it Workout D"). One step, no
// lane picker (D IS the ride), no cool-down list, saves as workout 'D' and
// never counts toward the week's "N of 3".
test('Workout D: straight onto the 30-min ride, no lane picker, no cool-down, saves as D and never counts toward the week', async ({
  page,
}) => {
  const posted: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') posted.push(req.url());
  });
  await movableClock(page, '2026-09-27T08:00:00.000Z'); // Sunday, after the completion-model launch
  await page.goto('/');
  await expect(page.locator('button.btn-chip[data-workout="D"]')).toHaveText('D · Cardio 30');
  await page.locator('button[data-workout="D"]').click();
  await expect(page.locator('h2')).toContainText('Workout D');
  await page.locator('#begin').click();
  // v55 (Sep 27 2026) — CHECK N1/N3 (round 1-3): D's one step used to read
  // "Warm-up · 1 of 2" (the trailing "+1" stood for a cool-down D never has).
  // It's the ride itself — "Ride · 1 of 1".
  await expect(page.locator('.round-indicator')).toHaveText('Ride');
  await expect(page.locator('.step-count')).toHaveText('1 of 1');
  // Straight onto the ride face — no "▶ Elliptical / Walk / Apartment" choice,
  // and no "↩ Walk or apartment instead" link (D has no lane to swap into).
  await expect(page.locator('#ww-elliptical')).toHaveCount(0);
  await expect(page.locator('#ww-outdoor')).toHaveCount(0);
  await expect(page.locator('.timer-display')).toHaveText('30:00');
  await page.locator('#start-timed').click();
  await advanceClock(page, 30 * 60_000 + 2_000);
  await expect(page.locator('.timer-done')).toHaveText('✓ 30 min done');
  await page.locator('#next').click(); // opens the ride-numbers screen
  await expect(page.locator('#ell-time')).toBeVisible();
  await page.locator('#ell-km').fill('3.0');
  await page.locator('#ell-pulse').fill('120');
  // No cool-down list for D — Save · Next on the ride goes straight to post-log.
  await page.locator('#next').click();
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs.length).toBe(1);
  expect(logs[0]?.['workout']).toBe('D');
  expect(logs[0]?.['cardioLane']).toBe('elliptical');
  expect(logs[0]?.['cardioMinutes']).toBe(30);
  expect(posted.filter((u) => u.includes('workout_sessions'))).toEqual([]);

  // D is extra — the week still reads 0 of 3 (A, B and C still all to go).
  await expect(page.locator('.week-line')).toContainText('0 of 3');
  await expect(page.locator('.week-line')).not.toContainText('D');
});

// v54 fix r1 (Sep 27 2026) — checker's must #1: isValidLogEntry accepted only
// A/B/C, and loadLogs() runs every read through it, so a saved D row vanished
// the moment anything re-read storage (a reload, Save's own re-render of Home,
// the next writeLogs rewriting storage without it). The test above never
// caught this because it only ever reads localStorage raw and renders once —
// this one forces a second read the same way a reload does.
test('Workout D survives a second read: Done card, Sessions, the rides page and the push queue all still see it, and Week 5 still reads 0 of 3', async ({
  page,
  context,
}) => {
  await movableClock(page, '2026-09-27T08:00:00.000Z'); // Sunday, after the completion-model launch
  await page.goto('/');
  await page.locator('button[data-workout="D"]').click();
  await page.locator('#begin').click();
  await page.locator('#start-timed').click();
  await advanceClock(page, 30 * 60_000 + 2_000);
  await expect(page.locator('.timer-done')).toHaveText('✓ 30 min done');
  await page.locator('#next').click(); // opens the ride-numbers screen
  await expect(page.locator('#ell-time')).toBeVisible();
  await page.locator('#ell-km').fill('3.0');
  await page.locator('#ell-kcal').fill('180');
  await page.locator('#ell-pulse').fill('120');
  await page.locator('#next').click();
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#save-log').click();
  await expect(page.locator('#home-done-card .home-done-title')).toHaveText('Done ✓ · Workout D');
  // v55 (Sep 27 2026) — CHECK N3: the D Done card used to read flat (title +
  // week lines, no ride numbers at all). Now it carries a real ride line.
  await expect(page.locator('#home-done-card .home-done-ride')).toContainText('30 min');
  await expect(page.locator('#home-done-card .home-done-ride')).toContainText('3 km');
  await expect(page.locator('#home-done-card .home-done-ride')).toContainText('180 kcal');

  // Still in the push queue (synced:false) — under automation (navigator.
  // webdriver) sync never actually fires (syncDisabled), so this is the
  // honest state a real phone would retry from; it must not have been
  // dropped by the next writeLogs() the way loadLogs()'s D-rejecting filter
  // used to drop it.
  const stored = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('workout-tracker:logs') ?? '[]') as Array<
      Record<string, unknown>
    >;
    return rows.find((r) => r['workout'] === 'D');
  });
  expect(stored).toBeTruthy();
  expect(stored?.['synced']).toBe(false);

  // A fresh page, same context/storage — a real reload (see "reload on the
  // numbers screen" test's own comment on why context.newPage() is used
  // instead of page.reload() in this file).
  const reopened = await context.newPage();
  await movableClock(reopened, '2026-09-27T08:00:00.000Z');
  await reopened.goto('/');

  await expect(reopened.locator('#home-done-card .home-done-title')).toHaveText(
    'Done ✓ · Workout D'
  );
  // Week 5 still reads 0 of 3 — D never counts toward it, on the SECOND read
  // same as the first.
  await expect(reopened.locator('.week-line')).toContainText('0 of 3');
  // v55 (Sep 27 2026) — CHECK N2 (round 1/2): the Home "Sessions" count used
  // to read "1" here as if D were a 4th A/B/C session. Her call: A/B/C only
  // (0, none yet), D folded in as its own "+1 ride".
  const sessionsRow = reopened.locator('.home-startnow-card .start-now-row').last();
  await expect(sessionsRow).toContainText('0');
  await expect(sessionsRow).toContainText('+1 ride');

  await reopened.locator('#view-history').click();
  await expect(reopened.locator('.session-list .history-workout-badge')).toHaveText('D');
  await reopened.locator('#back-home').click();

  await reopened.locator('#open-progress-link').click();
  await reopened.locator('#open-rides').click();
  await expect(reopened.locator('.rides-list-row')).toHaveCount(1);
  await expect(reopened.locator('.rides-list-row')).toContainText('D');
  await expect(reopened.locator('.rides-list-row')).toContainText('3 km');

  // v54 fix r2 (Sep 27 2026), checker's must #2: "This week" was filtered by
  // weekModel().open.sessions, and week.ts drops D from that on purpose (it's
  // extra, never one of the three) — so this exact D ride, saved inside Week
  // 5, read "This week 0 rides · 0 min · 0 km · 0 kcal" while "This month"
  // already said 1. Now it counts by date against the week's own start.
  const weekRow = reopened.locator('.rides-totals-row').filter({ hasText: 'This week' });
  await expect(weekRow).toContainText('1 ride · 30 min · 3 km · 180 kcal');
});

test("rides \"This week\": the Saturday-closing ride doesn't leak into the new week (membership, not date); Sunday's D still counts (v54 fix r3, checker's must)", async ({
  page,
  context,
}) => {
  // v54 fix r3 (Sep 27 2026), checker's must (round 3 — round 2's own fix
  // just above is what caused this): week.ts opens the next span at the
  // CLOSING session's own timestamp, so a plain "date >= since" filter
  // matched that same closing ride's own date and double-counted it — once
  // (correctly) in the week it closed, and again in the brand-new week that
  // opened at its own instant. This is her NORMAL swing rhythm (a week
  // closing on Sat/Sun), reproduced here on the checker's own dates: her
  // real Thu/Fri/Sat A/C/B pattern, moved one week past the completion-model
  // launch (Sat Sep 26 22:30) so it lands inside the completion model
  // instead of the legacy calendar week — A Thu Oct 1, C Fri Oct 2, B Sat
  // Oct 3 closes the week (Oct 3 is a Saturday, same as Sep 26); D Sun Oct 4
  // opens the new one.
  await movableClock(page, '2026-10-03T23:00:00+03:00'); // Sat night, just after B closed the week
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'workout-tracker:logs',
      JSON.stringify([
        {
          id: 'r3-thu-a',
          date: '2026-10-01T15:56:00+03:00',
          workout: 'A',
          capacityBefore: 8,
          capacityAfter: 8,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
          notes: 'cardio: elliptical 10 min · level 8 · 1.9 km · pulse 130',
        },
        {
          id: 'r3-fri-c',
          date: '2026-10-02T11:53:00+03:00',
          workout: 'C',
          capacityBefore: 8,
          capacityAfter: 8,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
          notes: 'cardio: elliptical 12 min · level 5 · 2.0 km · pulse 120',
        },
        {
          id: 'r3-sat-b',
          date: '2026-10-03T22:14:00+03:00',
          workout: 'B',
          capacityBefore: 8,
          capacityAfter: 8,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
          notes: 'cardio: elliptical 10 min · level 6 · 1.5 km · pulse 118',
        },
      ])
    );
  });
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await page.locator('#open-rides').click();
  const satWeekRow = page.locator('.rides-totals-row').filter({ hasText: 'This week' });
  await expect(satWeekRow).toContainText('0 rides');

  // Sunday, a fresh context page — no beforeEach clear script, so the three
  // rows above survive (same storage, same origin); this init script just
  // appends the D ride to them before the app itself ever reads the store.
  const sunday = await context.newPage();
  await movableClock(sunday, '2026-10-04T10:00:00+03:00');
  await sunday.addInitScript(() => {
    const rows = JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]') as Array<
      Record<string, unknown>
    >;
    rows.push({
      id: 'r3-sun-d',
      date: '2026-10-04T09:00:00+03:00',
      workout: 'D',
      capacityBefore: 8,
      capacityAfter: 8,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced: true,
      notes: 'cardio: elliptical 30 min · level 6 · 3.0 km · pulse 120',
    });
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
  });
  await sunday.goto('/');
  await sunday.locator('#open-progress-link').click();
  await sunday.locator('#open-rides').click();
  const sunWeekRow = sunday.locator('.rides-totals-row').filter({ hasText: 'This week' });
  await expect(sunWeekRow).toContainText('1 ride');
});

test('elliptical: the next ride opens on the elliptical and offers the last level again', async ({
  page,
}) => {
  await movableClock(page, '2026-09-24T08:00:00.000Z');
  // Runs after the beforeEach clear, so the seeded history survives each load.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'workout-tracker:logs',
      JSON.stringify([
        {
          id: 'seed-old',
          date: '2026-09-22T15:00:00.000Z',
          workout: 'B',
          capacityBefore: 6,
          capacityAfter: 7,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          notes: 'cardio: elliptical 10 min · level 6',
          synced: true,
        },
        {
          id: 'seed-new',
          date: '2026-09-23T15:00:00.000Z',
          workout: 'A',
          capacityBefore: 6,
          capacityAfter: 7,
          wallSitSec: 45,
          backPain: 0,
          word: '',
          notes: 'cardio: elliptical 10 min · level 8 · 1.9 km · pulse 130 · felt good',
          synced: true,
        },
      ])
    );
  });
  await page.goto('/');
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  // v48 · P3 lane memory: her last session rode the elliptical (the v47 marker
  // says so), so the step opens straight on it — no choice screen.
  await expect(page.locator('.exercise-name')).toHaveText('Elliptical');
  await expect(page.locator('.new-tonight-badge')).toHaveCount(0); // not a first ride
  // She knows the machine now — the setup is a one-line expander UNDER Start
  // (v48: Start sits inside the fold), closed until tapped.
  const guide = page.locator('.ell-guide');
  await expect(guide.locator('.detail-section-toggle')).toContainText('Set up the machine');
  await expect(guide.locator('.ell-steps')).toHaveCount(0);
  const guideBox = await guide.boundingBox();
  const timerBox = await page.locator('.timer-card').boundingBox();
  expect(timerBox!.y).toBeLessThan(guideBox!.y);
  await guide.locator('.detail-section-toggle').click();
  await expect(guide.locator('.ell-steps li')).toHaveCount(3);
  await expect(guide).toContainText('MANUAL');
  await expect(guide).toContainText('your buttons may differ'); // v48 · fix r1: one line
  // The old 6-step ride list became the live line — it is not in the setup.
  await expect(guide).not.toContainText('Not sure of your level?');
  // After the ride: "—" until touched, and "8 again" (the newest ride) is one tap.
  await page.locator('#start-timed').click();
  await advanceClock(page, 10 * 60_000 + 2_000);
  // v51: Done · Next opens the ride-numbers screen — the level lives there now.
  await page.locator('#next').click();
  await expect(page.locator('#ell-level')).toHaveText('—');
  await expect(page.locator('#ell-level-same')).toHaveText('8 again');
  await page.locator('#ell-level-same').click();
  await expect(page.locator('#ell-level')).toHaveText('8');
});

test('elliptical: the step carries how-to guidance', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const guideStart = appSrc.indexOf('const EXERCISE_GUIDE');
  const guideBlock = appSrc.slice(guideStart, appSrc.indexOf('\n};', guideStart));
  // Prettier unquotes a single-word key, so accept either spelling.
  expect(guideBlock).toMatch(/^ {2}'?Elliptical'?: \{/m);
});

test('elliptical: the reading boxes + setup steps hide while the timer runs, and only open on Done · Next after', async ({
  page,
}) => {
  // The timer re-renders every second; a box shown mid-ride would lose what
  // she is typing. v48 · P3: the boxes exist only AFTER the ride (decision Q5).
  // v51 (Sep 25 2026): "after" no longer means inline on the done face either —
  // the boxes live on the ride-numbers screen, opened by Done · Next, so the
  // ride ending on its own still shows nothing until she taps it.
  await movableClock(page, '2026-09-24T08:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-elliptical').click();
  await expect(page.locator('#ell-km')).toHaveCount(0);
  await expect(page.locator('#ell-pulse')).toHaveCount(0);
  // First ride (no level on record) → the setup expander is open by default.
  await expect(page.locator('.ell-guide')).toContainText('MANUAL');
  await expect(page.locator('#ww-outdoor')).toBeVisible();

  await page.locator('#start-timed').click();
  await expect(page.locator('#ell-km')).toHaveCount(0);
  await expect(page.locator('.ell-guide')).toHaveCount(0);
  // v53 (Sep 26 2026): "Running" shows on the pip now, not an inline label.
  await expect(page.locator('.timer-pip')).toBeVisible();
  await expect(page.locator('#ell-level-up')).toHaveCount(0);
  await expect(page.locator('#ww-outdoor')).toHaveCount(0);

  await advanceClock(page, 10 * 60_000 + 2_000);
  // v51: the ride ending on its own still shows no readings — Done · Next
  // opens them, it doesn't just witness them.
  await expect(page.locator('#ell-km')).toHaveCount(0);
  await expect(page.locator('#ell-pulse')).toHaveCount(0);
  // v46: the ride ran — the card says so instead of resetting to
  // "Ready 10:00 / Start timer", and the back-out (which wipes the readings)
  // is gone. v48: the setup stays shut.
  await expect(page.locator('.timer-done')).toHaveText('✓ 10 min done');
  await expect(page.locator('#start-timed')).toHaveCount(0);
  await expect(page.locator('#ww-outdoor')).toHaveCount(0);
  await expect(page.locator('.ell-guide .ell-steps')).toHaveCount(0);

  // Tapping Done · Next opens the ride-numbers screen — the boxes are here.
  await page.locator('#next').click();
  await expect(page.locator('#ell-km')).toBeVisible();
  await expect(page.locator('#ell-pulse')).toBeVisible();
});

test('post-log: the free-text note saves verbatim on a session with no cardio lane picked', async ({
  page,
}) => {
  await mockDate(page, '2026-09-24T08:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  await expect(page.locator('#session-note')).toBeVisible();
  await page.locator('#session-note').fill('skipped the bird dog, wrist tired');
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as { notes?: string | null; sessionNote?: string | null }[];
  // v48: her words land in their own field, verbatim; `notes` stays system-only.
  expect(logs[0]?.sessionNote).toBe('skipped the bird dog, wrist tired');
  expect(logs[0]?.notes).toBeNull();
});

// --- Back (v47, Sep 24 2026) -------------------------------------------------
// Her words: "this app needs back button like i can go back an exercise or a
// round" → "i need to be able to go back". One step backwards, across rounds.

test('back (v47): Back steps to the previous exercise, and crosses the round boundary; v53 fix: step 1 has a Back too (see the dedicated pre-log test)', async ({
  page,
}) => {
  await mockDate(page, '2026-09-24T14:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // v53 fix (CHECK M4): step 1 used to hide Back ("nothing behind her") — it
  // shows now too; from here it goes to the pre-log, not a step further back.
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#step-back')).toBeVisible();

  await page.locator(NEXT).click();
  await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');
  await expect(page.locator('#step-back')).toBeVisible();
  await page.locator('#step-back').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#step-back')).toBeVisible();

  // Walk forward into Round 2, then Back → Round 1's last exercise.
  // v48: the one progress line reads "Main · Round 2 of 2" and one count for the
  // whole workout; the round-1 floor screen sits between the rounds.
  let lastRoundOneName = '';
  for (let i = 0; i < 40; i++) {
    const label = await page.locator('.round-indicator').first().textContent();
    if (label && label.includes('Round 2 of')) break;
    if (await page.locator('#start-round-2').isVisible()) {
      await page.locator('#start-round-2').click();
      continue;
    }
    lastRoundOneName = (await page.locator('.exercise-name').textContent()) ?? '';
    await page.locator(NEXT).click();
  }
  await expect(page.locator('.round-indicator').first()).toContainText('Main · Round 2 of 2');
  const roundTwoStep = Number(
    (await page.locator('.step-count').textContent())?.match(/^(\d+) of/)?.[1]
  );
  await page.locator('#step-back').click();
  await expect(page.locator('.round-indicator').first()).toContainText('Main · Round 1 of 2');
  await expect(page.locator('.exercise-name')).toHaveText(lastRoundOneName);
  await expect(page.locator('.step-count')).toHaveText(new RegExp(`^${roundTwoStep - 1} of`));
});

// --- v53: timer as a pip + Back while it runs (Sep 26 2026) ------------------
// Her words: "from the timer I need to be able to go back like it wasn't able
// to go back" · "Maybe the timer should just be like a small circle that pops
// up or something." First shipped with Back's OLD rule unchanged (no step
// before the very first one), so a running ride only had a testable Back on
// Week 1's Workout C, where a real warmup step (Belly breathing) sits before
// it — every later week's A/B/C opens straight on the ride, so Back read as
// correctly absent there. CHECK M4 (Sep 26 2026) caught that as the actual
// bug: R2 Week 4 — the week she's IN — opens A, B and C on the ride, so "no
// Back on step 1" meant no Back on the one ride she does this week, exactly
// where her words above asked for it. Fixed: step 1 now has a Back too; it
// goes to the pre-log (there's no earlier step to land on) — true for ANY
// step 1, not just a ride, so the Week-1-C test below (a real warm-up
// exercise on its true first step) needed the same update; the new "step 1"
// test covers the ride case specifically.
test.describe('v53: timer as a pip + Back while it runs', () => {
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4

  const toWallSit = async (page: Page): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      if ((await page.locator('.exercise-name').textContent()) === 'Wall sit') return;
      await page.locator(NEXT).click();
    }
    throw new Error('never reached Wall sit');
  };

  test('ride: Back is visible while the ride is running, stops the timer, and keeps the real minutes', async ({
    page,
  }) => {
    await movableClock(page, '2026-05-05T10:00:00.000Z'); // Week 1 — cardio is main[0], not warmup[0]
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');
    // v53 fix (CHECK M4): the true first step now shows Back too — it goes to
    // the pre-log instead of a step further back (there is none).
    await expect(page.locator('#step-back')).toBeVisible();

    await page.locator(NEXT).click();
    await expect(page.locator('.exercise-name')).toHaveText('Cardio');
    await expect(page.locator('#step-back')).toBeVisible(); // main[0] here, not warmup[0] — Belly breathing IS behind it

    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip')).toBeVisible();
    await expect(page.locator('#step-back')).toBeVisible(); // v53: still there while the ride runs

    await advanceClock(page, 3 * 60_000);
    await page.locator('#step-back').click();

    // One step back: the real 3 minutes were kept, the timer stopped, and
    // she's on Belly breathing again — not a redo-from-scratch discard.
    await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');
    await expect(page.locator('.timer-pip')).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem('workout-tracker:ww-lane-done-min'))
    ).toBe('3');

    // Forward again: the ride shows its kept minutes, not a fresh Ready face.
    await page.locator(NEXT).click();
    await expect(page.locator('.timer-done')).toHaveText('✓ 3 min done');
  });

  test('ride: Back from step 1 (this week opens A/B/C on the ride) goes to the pre-log, keeps her answer and the real minutes', async ({
    page,
  }) => {
    // v53 fix (CHECK M4, Sep 26 2026): R2 Week 4 opens on the ride in warmup[0]
    // for A, B and C — "no Back on step 1" meant no Back on the ride she does
    // THIS week. canGoBack is true here now; Back goes to the pre-log (her
    // "lead's call" — there's no step further back to land on).
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    // Leave a mark on the pre-log so Back-to-pre-log can be proven to keep it.
    await page.locator('[data-body-chip="cap-before"][data-value="7"]').click();
    await page.locator('button:has-text("Start")').click();

    await expect(page.locator('.exercise-name')).toHaveText('Cardio');
    await expect(page.locator('#step-back')).toBeVisible(); // the fix: step 1 has a Back

    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip')).toBeVisible();
    await expect(page.locator('#step-back')).toBeVisible(); // still there while it runs

    await advanceClock(page, 3 * 60_000);
    await page.locator('#step-back').click();

    // Lands on the pre-log, not a step further back — there is none — and her
    // capacity answer from before Start is still there.
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
    await expect(
      page.locator('[data-body-chip="cap-before"][data-value="7"][aria-checked="true"]')
    ).toBeVisible();

    // The real 3 minutes were kept — same rule as any other Back-while-running.
    expect(
      await page.evaluate(() => localStorage.getItem('workout-tracker:ww-lane-done-min'))
    ).toBe('3');
  });

  test('hold: Back is visible while a hold is running, stops the timer, and keeps the real seconds', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await toWallSit(page);
    await expect(page.locator('#step-back')).toBeVisible(); // Wall sit is nowhere near the first step

    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip')).toBeVisible();
    await expect(page.locator('#step-back')).toBeVisible(); // v53: still there while it holds

    await advanceClock(page, 20_000); // 20 of 45 s
    await page.locator('#step-back').click();

    // One step back: the hold stopped and the 20 s she held is kept.
    await expect(page.locator('.exercise-name')).not.toHaveText('Wall sit');
    await expect(page.locator('.timer-pip')).toHaveCount(0);

    // Forward again: Wall sit shows the held seconds, not a reset Ready face.
    await page.locator(NEXT).click();
    await expect(page.locator('.exercise-name')).toHaveText('Wall sit');
    await expect(page.locator('.timer-done')).toContainText('✓ held 20 s');
  });

  test('pip: shows the running countdown and a shrinking progress ring', async ({ page }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await toWallSit(page);

    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip-time')).toHaveText('45');
    const ring = page.locator('.timer-pip-progress');
    const offsetAtStart = Number(await ring.getAttribute('stroke-dashoffset'));
    expect(offsetAtStart).toBeCloseTo(0, 0); // the full ring — nothing elapsed yet

    await advanceClock(page, 15_000);
    await expect(page.locator('.timer-pip-time')).toHaveText('30');
    const offsetLater = Number(await ring.getAttribute('stroke-dashoffset'));
    expect(offsetLater).toBeGreaterThan(offsetAtStart); // the ring has emptied by a third
  });

  test('tap the pip → Pause/Stop sheet → Stop keeps the real seconds', async ({ page }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await toWallSit(page);

    await page.locator('#start-timed').click();
    await advanceClock(page, 12_000);
    await page.locator('#timer-pip').click();
    await expect(page.locator('.timer-pip-sheet')).toBeVisible();
    await expect(page.locator('.timer-pip-sheet-time')).toHaveText('33'); // 45 - 12 left
    await page.locator('#stop-timed').click();
    await expect(page.locator('.timer-done')).toHaveText('✓ held 12 s');
    await expect(page.locator('.timer-pip-sheet')).toHaveCount(0);
  });

  test('tap the pip → Cancel closes the sheet without touching the timer', async ({ page }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await toWallSit(page);

    await page.locator('#start-timed').click();
    await page.locator('#timer-pip').click();
    await expect(page.locator('.timer-pip-sheet')).toBeVisible();
    await page.locator('#timer-pip-close').click();
    await expect(page.locator('.timer-pip-sheet')).toHaveCount(0);
    await expect(page.locator('.timer-pip')).toBeVisible(); // still running, untouched
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('running pip: no horizontal scroll, and it never sits over Done · Next', async ({
      page,
    }) => {
      await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
      await page.goto('/');
      await page.locator('button[data-workout="A"]').click();
      await page.locator('button:has-text("Start")').click();
      await toWallSit(page);
      await page.locator('#start-timed').click();
      await expect(page.locator('.timer-pip')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      const pipBox = (await page.locator('.timer-pip').boundingBox())!;
      const barBox = (await page.locator('.action-bar').boundingBox())!;
      expect(pipBox.y + pipBox.height).toBeLessThanOrEqual(barBox.y + 1);
    });
  });
});

// --- v48 P1 · data (Sep 24 2026) ---------------------------------------------
// The lead's decision (DECISIONS-v48 §3): nine additive columns on
// workout_sessions, so the numbers she copies off the machine come back to her
// as numbers — her words: "make it measurable whatever you say I'm gonna copy
// it". Her note gets its own column (verbatim), notes = system annotations only.
test.describe('v48 P1 data', () => {
  type Row = Record<string, unknown>;

  async function finishToPostLog(page: import('@playwright/test').Page): Promise<void> {
    for (let i = 0; i < 80; i++) {
      const isPostLog = await page
        .locator('text=Quick log')
        .isVisible()
        .catch(() => false);
      if (isPostLog) break;
      const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
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

  async function payloadOf(page: import('@playwright/test').Page, entry: Row): Promise<Row> {
    return page.evaluate(
      (e) =>
        (window as unknown as { __wtSessionPayload: (x: unknown) => Row }).__wtSessionPayload(e),
      entry
    );
  }

  test('(a) an elliptical A session sends the lane, minutes and readings as columns', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await finishToPostLog(page);
    // The lane as it stands at Done: 10 min on the elliptical, level 7, and the
    // two readings copied off the console; she ran the full 10.
    await page.evaluate(() => {
      localStorage.setItem('workout-tracker:ww-elliptical', '10');
      localStorage.setItem('workout-tracker:ww-elliptical-level', '7');
      localStorage.setItem('workout-tracker:ww-elliptical-km', '1.4');
      localStorage.setItem('workout-tracker:ww-elliptical-pulse', '128');
      localStorage.setItem('workout-tracker:ww-elliptical-kcal', '63.4');
      localStorage.setItem('workout-tracker:ww-elliptical-time-sec', '10:02');
      localStorage.setItem('workout-tracker:ww-lane-done-min', '10');
    });
    const log = await saveAndReadLog(page);
    const p = await payloadOf(page, log);
    expect(p['cardio_lane']).toBe('elliptical');
    expect(p['cardio_minutes']).toBe(10);
    expect(p['elliptical_level']).toBe(7);
    expect(p['elliptical_km']).toBe(1.4);
    expect(p['elliptical_pulse']).toBe(128);
    // v49 (Sep 25 2026): the two more the machine shows.
    expect(p['elliptical_kcal']).toBe(63.4);
    expect(p['elliptical_time_sec']).toBe(602);
    expect(p['walk_minutes']).toBeNull();
    expect(p['notes']).toBeNull();
    expect(p['lite_day']).toBe(false);
    expect(p['voice_plays']).toBe(0);
    expect(p['arm_feel']).toBeNull();
  });

  test('(b) wall_sit_seconds is null on B and C (no wall sit), the number on A', async ({
    page,
  }) => {
    const base = {
      id: 'x',
      date: '2026-09-24T14:00:00.000Z',
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 45,
      backPain: null,
      word: '',
    };
    const a = await payloadOf(page, { ...base, workout: 'A' });
    const b = await payloadOf(page, { ...base, workout: 'B', wallSitSec: 0 });
    const c = await payloadOf(page, { ...base, workout: 'C', wallSitSec: 0 });
    expect(a['wall_sit_seconds']).toBe(45);
    expect(b['wall_sit_seconds']).toBeNull();
    expect(c['wall_sit_seconds']).toBeNull();
  });

  // v50 · mood (Sep 25 2026): mood_before/mood_after go out as their own
  // columns, same shape as capacity — touched → her number, untouched → null.
  test('(b2) mood_before/mood_after send her numbers, or null when untouched', async ({ page }) => {
    const base = {
      id: 'x',
      date: '2026-09-24T14:00:00.000Z',
      workout: 'A' as const,
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 45,
      backPain: null,
      word: '',
    };
    const touched = await payloadOf(page, { ...base, moodBefore: 9, moodAfter: 3 });
    expect(touched['mood_before']).toBe(9);
    expect(touched['mood_after']).toBe(3);
    const untouched = await payloadOf(page, base); // no moodBefore/moodAfter key at all
    expect(untouched['mood_before']).toBeNull();
    expect(untouched['mood_after']).toBeNull();
  });

  // v51 (Sep 25 2026): back_pain_before/wrist_pain_before go out as their own
  // columns, same shape as mood above — touched → her number, untouched → null.
  test('(b3) back_pain_before/wrist_pain_before send her numbers, or null when untouched', async ({
    page,
  }) => {
    const base = {
      id: 'x',
      date: '2026-09-24T14:00:00.000Z',
      workout: 'A' as const,
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 45,
      backPain: null,
      word: '',
    };
    const touched = await payloadOf(page, { ...base, backPainBefore: 4, wristPainBefore: 0 });
    expect(touched['back_pain_before']).toBe(4);
    expect(touched['wrist_pain_before']).toBe(0);
    const untouched = await payloadOf(page, base); // no backPainBefore/wristPainBefore key at all
    expect(untouched['back_pain_before']).toBeNull();
    expect(untouched['wrist_pain_before']).toBeNull();
  });

  test('(c) the post-log note lands in session_note, never in notes', async ({ page }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="B"]').click();
    await page.locator('button:has-text("Start")').click();
    await finishToPostLog(page);
    const words = 'cardio: elliptical 10 min · level 9 — just kidding';
    await page.locator('#session-note').fill(words);
    const log = await saveAndReadLog(page);
    expect(log['sessionNote']).toBe(words);
    expect(log['notes']).toBeNull();
    const p = await payloadOf(page, log);
    expect(p['session_note']).toBe(words);
    expect(p['notes']).toBeNull();
    // A B session has no wall sit: null, not a 0 wearing a number.
    expect(p['wall_sit_seconds']).toBeNull();
    // Her note is in the shape of the old marker — and is NOT read as her level
    // or her lane (v48 · P3): the next A opens on the choice, and the
    // elliptical is still a first ride.
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.exercise-name')).toHaveText('Cardio');
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('.new-tonight-badge')).toHaveText('First ride');
  });

  test('(d) Lite on pre-log saves liteDay true', async ({ page }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#lite-toggle').click();
    await page.locator('button:has-text("Start")').click();
    await finishToPostLog(page);
    const log = await saveAndReadLog(page);
    expect(log['liteDay']).toBe(true);
    expect((await payloadOf(page, log))['lite_day']).toBe(true);
  });

  test('(e) each voice-note play that starts is counted onto the saved session', async ({
    page,
  }) => {
    // A stand-in for the audio element: play() starts and finishes at once, so
    // each tap is a fresh play (a real tap mid-play would be a stop, not a play).
    await page.addInitScript(() => {
      class FakeAudio extends EventTarget {
        paused = true;
        src: string;
        constructor(src: string) {
          super();
          this.src = src;
        }
        play(): Promise<void> {
          this.paused = false;
          this.dispatchEvent(new Event('play'));
          this.paused = true;
          this.dispatchEvent(new Event('ended'));
          return Promise.resolve();
        }
        pause(): void {
          this.paused = true;
          this.dispatchEvent(new Event('pause'));
        }
      }
      (window as unknown as { Audio: unknown }).Audio = FakeAudio;
    });
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator(NEXT).click(); // past the cardio step
    await expect(page.locator('.voice-note-btn')).toBeVisible();
    await page.locator('.voice-note-btn').click();
    await page.locator('.voice-note-btn').click();
    await finishToPostLog(page);
    const log = await saveAndReadLog(page);
    expect(log['voicePlays']).toBe(2);
    expect((await payloadOf(page, log))['voice_plays']).toBe(2);
  });

  test('(f) the nine new columns round-trip through the pull; a row without them still loads', async ({
    page,
  }) => {
    const out = await page.evaluate(() => {
      const merge = (
        window as unknown as {
          __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Record<string, unknown>[];
        }
      ).__wtMergeRemoteSessions;
      const common = {
        workout_type: 'A',
        capacity_before_1_10: 6,
        capacity_after_1_10: 7,
        wall_sit_seconds: 45,
        pain_back_0_10: 0,
        one_word: null,
        started_at: null,
        completed_at: null,
        duration_seconds: null,
        notes: null,
      };
      return merge(
        [],
        [
          {
            ...common,
            id: 'new-shape',
            date: '2026-09-24T14:00:00+00:00',
            cardio_lane: 'elliptical',
            cardio_minutes: 10,
            elliptical_level: 7,
            elliptical_km: '1.40', // numeric(5,2) can come back as a string
            elliptical_pulse: 128,
            session_note: 'knee fine',
            lite_day: true,
            arm_feel: 'curl=easy;row=right',
            voice_plays: 3,
          },
          { ...common, id: 'old-shape', date: '2026-09-20T14:00:00+00:00' },
        ]
      );
    });
    const byId = new Map(out.map((r) => [r['id'], r]));
    const n = byId.get('new-shape')!;
    expect(n['cardioLane']).toBe('elliptical');
    expect(n['cardioMinutes']).toBe(10);
    expect(n['ellipticalLevel']).toBe(7);
    expect(n['ellipticalKm']).toBe(1.4);
    expect(n['ellipticalPulse']).toBe(128);
    expect(n['sessionNote']).toBe('knee fine');
    expect(n['liteDay']).toBe(true);
    expect(n['armFeel']).toBe('curl=easy;row=right');
    expect(n['voicePlays']).toBe(3);
    const o = byId.get('old-shape')!;
    expect(o['wallSitSec']).toBe(45);
    for (const k of [
      'cardioLane',
      'cardioMinutes',
      'ellipticalLevel',
      'ellipticalKm',
      'ellipticalPulse',
      'sessionNote',
      'liteDay',
      'armFeel',
      'voicePlays',
    ]) {
      expect(o[k] ?? null).toBeNull();
    }
  });

  test('(g) the import accepts an old-shape and a new-shape entry, and refuses junk in a new field', async ({
    page,
  }) => {
    const out = await page.evaluate(() => {
      const ok = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
        .__wtIsValidLogEntry;
      const old = {
        date: '2026-09-01T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 7,
        wallSitSec: 40,
        backPain: 0,
        word: '',
        notes: 'cardio: elliptical 10 min · level 6',
      };
      const fresh = {
        ...old,
        notes: null,
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 6,
        ellipticalKm: 1.4,
        ellipticalPulse: 128,
        sessionNote: 'knee fine',
        liteDay: false,
        armFeel: null,
        voicePlays: 0,
      };
      return {
        old: ok(old),
        fresh: ok(fresh),
        nulls: ok({ ...fresh, cardioLane: null, ellipticalKm: null, liteDay: null }),
        badLane: ok({ ...fresh, cardioLane: 'rowing' }),
        badPlays: ok({ ...fresh, voicePlays: 'two' }),
      };
    });
    expect(out).toEqual({ old: true, fresh: true, nulls: true, badLane: false, badPlays: false });
  });

  test('(h) the Week-4 hinge reads 2 sets in EACH round', async ({ page }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    for (let i = 0; i < 20; i++) {
      const name = (await page.locator('.exercise-name').textContent()) ?? '';
      if (/hip hinge/i.test(name)) {
        await expect(page.locator('.exercise-reps')).toContainText(
          '12 reps · 2 sets each round · holding the 1 kg'
        );
        // v48 · fix r2 (Sep 25 2026): the title no longer says "Bodyweight"
        // over "holding the 1 kg" — display label only, the key is unchanged.
        await expect(page.locator('.exercise-name')).toHaveText('Hip hinge');
        expect(name).not.toContain('Bodyweight');
        return;
      }
      await page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip').click();
    }
    throw new Error('never reached the hip hinge');
  });

  test('(i) the next ride reads the level column first, and a marker-only legacy row still works', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-24T14:00:00.000Z');
    const legacy: Row = {
      id: 'legacy',
      date: '2026-09-22T15:00:00.000Z',
      workout: 'B',
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      notes: 'cardio: elliptical 10 min · level 6',
      synced: true,
    };
    const v48Row: Row = {
      ...legacy,
      id: 'v48-row',
      date: '2026-09-23T15:00:00.000Z',
      notes: null,
      cardioLane: 'elliptical',
      cardioMinutes: 10,
      ellipticalLevel: 9,
    };
    for (const [logs, expected] of [
      [[legacy], '6'],
      [[legacy, v48Row], '9'],
    ] as const) {
      // Init scripts run in the order added, so each seed replaces the last.
      await page.addInitScript((l) => {
        window.localStorage.setItem('workout-tracker:logs', JSON.stringify(l));
      }, logs);
      await page.goto('/');
      await page.locator('button[data-workout="A"]').click();
      await page.locator('button:has-text("Start")').click();
      // v48 · P3: lane memory opens the elliptical; the last level is offered
      // after the ride as the one-tap "N again".
      await expect(page.locator('.exercise-name')).toHaveText('Elliptical');
      await page.locator('#start-timed').click();
      await advanceClock(page, 10 * 60_000 + 2_000);
      // v51: Done · Next opens the ride-numbers screen — the "N again" chip lives there.
      await page.locator('#next').click();
      await expect(page.locator('#ell-level-same')).toHaveText(`${expected} again`);
    }
  });

  test('legacy push: a server without the v48 columns gets the v47 row, nothing lost', async ({
    page,
  }) => {
    const p = await page.evaluate(() =>
      (
        window as unknown as { __wtLegacySessionPayload: (x: unknown) => Record<string, unknown> }
      ).__wtLegacySessionPayload({
        id: 'x',
        date: '2026-09-24T14:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 7,
        // v50 · mood: also stripped for a server that hasn't run the mood migration.
        moodBefore: 5,
        moodAfter: 3,
        wallSitSec: 45,
        backPain: 0,
        word: '',
        walkMinutes: null,
        notes: 'duration not recorded — session was left open 4h before Done',
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 7,
        ellipticalKm: 1.4,
        ellipticalPulse: 128,
        sessionNote: 'knee fine',
        liteDay: true,
        voicePlays: 2,
        // T1 (Sep 27 2026): also stripped — legacySessionPayload is the full
        // v47-shaped fallback, so it drops these 5 too even though the v53
        // migration is APPLIED now (T1 fix r1, checker's should #6); a
        // server on an older mirror/branch of the schema still lands safely.
        herStartAt: '2026-09-24T13:04:00.000Z',
        herStartConfirmed: true,
        herEndAt: '2026-09-24T13:52:00.000Z',
        herEndConfirmed: true,
        breakMinutes: 5,
      })
    );
    for (const col of [
      'cardio_lane',
      'cardio_minutes',
      'elliptical_level',
      'elliptical_km',
      'elliptical_pulse',
      'session_note',
      'lite_day',
      'arm_feel',
      'voice_plays',
      'mood_before',
      'mood_after',
      'her_start_at',
      'her_start_confirmed',
      'her_end_at',
      'her_end_confirmed',
      'break_minutes',
    ]) {
      expect(col in p).toBe(false);
    }
    expect(p['notes']).toBe(
      'cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee fine · duration not recorded — session was left open 4h before Done'
    );
    expect(p['walk_minutes']).toBe(10);
    expect(p['wall_sit_seconds']).toBe(45);
  });

  // T1 fix r1 (Sep 27 2026, checker's must #2): the spec'd PGRST204 test —
  // "a faked PGRST204 -> the retry drops the new groups and still saves" —
  // proven as a TIERED retry (checker's own fix suggestion), so a server
  // that's ahead by only the 5 T1 columns keeps every other group instead of
  // the old single-retry losing mood/wrist/ride numbers along with them.
  // pushSessionTiered takes `post` so this drives it with faked Response
  // objects — real sync stays off under automation everywhere else
  // (syncDisabled gates pushLogToSupabase, never pushSessionTiered itself).
  test('push (T1 fix r1, must #2): a faked PGRST204 retries with ONLY the timing columns dropped; mood/wrist/ride numbers survive', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:logs',
        JSON.stringify([
          {
            id: 'tiered-1',
            date: '2026-09-27T10:00:00.000Z',
            workout: 'A',
            capacityBefore: 6,
            capacityAfter: 7,
            wallSitSec: 0,
            backPain: 0,
            word: '',
            synced: false,
          },
        ])
      );
    });
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const w = window as unknown as {
        __wtPushSessionTiered: (
          e: unknown,
          post: (payload: Record<string, unknown>) => Promise<Response>
        ) => Promise<boolean>;
      };
      const entry = {
        id: 'tiered-1',
        date: '2026-09-27T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 7,
        moodBefore: 5,
        moodAfter: 3,
        wallSitSec: 0,
        backPain: 0,
        wristPain: 4,
        word: '',
        ellipticalKcal: 88.5,
        herStartAt: '2026-09-27T09:04:00.000Z',
        herStartConfirmed: true,
        herEndAt: '2026-09-27T09:52:00.000Z',
        herEndConfirmed: true,
        breakMinutes: 5,
      };
      const bodies: Record<string, unknown>[] = [];
      const post = async (payload: Record<string, unknown>): Promise<Response> => {
        bodies.push(payload);
        if (bodies.length === 1) {
          return new Response(JSON.stringify({ code: 'PGRST204', message: 'unknown column' }), {
            status: 400,
          });
        }
        return new Response(null, { status: 201 });
      };
      const ok = await w.__wtPushSessionTiered(entry, post);
      const rawLogs = window.localStorage.getItem('workout-tracker:logs');
      const logs = JSON.parse(rawLogs ?? '[]') as { id: string; synced?: boolean }[];
      return { ok, bodies, synced: logs.find((l) => l.id === 'tiered-1')?.synced };
    });

    expect(result.ok).toBe(true);
    expect(result.bodies.length).toBe(2); // one PGRST204, one retry that lands
    expect(result.synced).toBe(true); // the local log ends synced
    const retried = result.bodies[1] as Record<string, unknown>;
    for (const col of [
      'her_start_at',
      'her_start_confirmed',
      'her_end_at',
      'her_end_confirmed',
      'break_minutes',
    ]) {
      expect(col in retried).toBe(false);
    }
    // Not lossy beyond the T1 group — mood, wrist and the ride number all
    // survive the FIRST retry (this is exactly what the single-tier legacy
    // retry used to wipe, per the checker's finding).
    expect(retried['mood_before']).toBe(5);
    expect(retried['wrist_pain_0_10']).toBe(4);
    expect(retried['elliptical_kcal']).toBe(88.5);
  });

  // T1 fix r1: the THIRD tier — a server missing even MORE than the T1
  // group still saves, falling all the way back to the v47-shaped legacy
  // row (unchanged behavior from before T1, just reached one step later now).
  test('push (T1 fix r1): two PGRST204s in a row fall back to the full legacy row and still save', async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const w = window as unknown as {
        __wtPushSessionTiered: (
          e: unknown,
          post: (payload: Record<string, unknown>) => Promise<Response>
        ) => Promise<boolean>;
      };
      const entry = {
        id: 'tiered-2',
        date: '2026-09-27T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 7,
        moodBefore: 5,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        sessionNote: 'knee fine',
        herStartConfirmed: true,
      };
      const bodies: Record<string, unknown>[] = [];
      const post = async (payload: Record<string, unknown>): Promise<Response> => {
        bodies.push(payload);
        if (bodies.length < 3) {
          return new Response(JSON.stringify({ code: 'PGRST204', message: 'unknown column' }), {
            status: 400,
          });
        }
        return new Response(null, { status: 201 });
      };
      const ok = await w.__wtPushSessionTiered(entry, post);
      return { ok, count: bodies.length, third: bodies[2] };
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
    expect('mood_before' in result.third).toBe(false);
    expect('her_start_confirmed' in result.third).toBe(false);
  });

  test('session detail shows her note verbatim under "Note", apart from system notes', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:logs',
        JSON.stringify([
          {
            id: 'with-note',
            date: '2026-09-24T12:00:00.000Z',
            workout: 'A',
            capacityBefore: 6,
            capacityAfter: 7,
            wallSitSec: 45,
            backPain: 0,
            word: '',
            notes: null,
            sessionNote: 'Knee fine, legs heavy on the last round',
            cardioLane: 'elliptical',
            cardioMinutes: 10,
            ellipticalLevel: 7,
            synced: true,
          },
        ])
      );
    });
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('[data-detail="with-note"]').first().click();
    const note = page.locator('#detail-session-note');
    await expect(note).toHaveText('Knee fine, legs heavy on the last round');
    await expect(note).toHaveAttribute('dir', 'auto');
    // v48 · P6: the row is "Note" (DECISIONS §5 Session detail).
    await expect(page.locator('.detail-card')).toContainText('Note');
  });
});

// --- v48 P2 · the workout step shell (Sep 24 2026) ---------------------------
// DECISIONS-v48 §4-5 (Workout rows). Her words: "look at home ux ui and make it
// better i feel like its a bit all over the place". Back/Done pinned, one bar
// for the whole workout, one safety line on the face, holds that witness the
// real seconds, and the round-1 floor ("Finish here — it still counts").
test.describe('v48 P2 shell', () => {
  type Row = Record<string, unknown>;
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4 (startsOn Sep 19)

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };
  const aLog = (id: string, date: string, wallSitSec: number): Row => ({
    id,
    date,
    workout: 'A',
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec,
    backPain: 0,
    word: '',
    synced: true,
  });

  // One tap forward: Done · Next / Done · Finish, "Start round 2" on the
  // round-break screen, or (v48 · P3) "Skip cardio today" on the cardio choice.
  // Returns false once nothing is left to tap.
  const tapForward = async (page: Page): Promise<boolean> => {
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
  };

  const goToStep = async (page: Page, name: string): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      const now =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (now === name) return;
      if (!(await tapForward(page))) break;
    }
    throw new Error(`never reached ${name}`);
  };

  const startA = async (page: Page): Promise<void> => {
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.exercise-name')).toBeVisible();
  };

  const toRoundBreak = async (page: Page): Promise<string> => {
    let lastName = '';
    for (let i = 0; i < 40 && !(await page.locator('#start-round-2').isVisible()); i++) {
      lastName = (await page.locator('.exercise-name').textContent()) ?? '';
      await page.locator('#next, #ww-skip').click();
    }
    await expect(page.locator('#start-round-2')).toBeVisible();
    return lastName;
  };

  const saveAndRead = async (page: Page): Promise<Row> => {
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    const logs = JSON.parse(raw ?? '[]') as Row[];
    return logs[0]!;
  };

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(a) Done is inside the fold on every step of A, without scrolling', async ({ page }) => {
      await mockDate(page, TUE_WEEK4);
      await page.goto('/');
      await startA(page);
      let steps = 0;
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        const target = (await page.locator('#start-round-2').isVisible())
          ? page.locator('#start-round-2')
          : page.locator('#next, #ww-skip'); // v48 · P3: Skip is the cardio choice's way on
        await expect(target).toBeVisible();
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y + box!.height).toBeLessThanOrEqual(915);
        await target.click();
        steps++;
      }
      await expect(page.locator('text=Quick log')).toBeVisible();
      expect(steps).toBeGreaterThan(15);
    });
  });

  test('(b) one count for the whole workout: 1 of N, +1 per Done across phases and rounds', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    // The old three counters are gone.
    await expect(page.locator('.progress-text')).toHaveCount(0);
    await expect(page.locator('.exercise-phase')).toHaveCount(0);
    const read = async (): Promise<[number, number]> => {
      const t = (await page.locator('.step-count').textContent()) ?? '';
      const m = t.match(/^(\d+) of (\d+)$/);
      expect(m, t).not.toBeNull();
      return [Number(m![1]), Number(m![2])];
    };
    const [first, total] = await read();
    expect(first).toBe(1);
    await expect(page.locator('.round-indicator')).toHaveText('Warm-up');
    await expect(page.locator('.progress-bar')).toHaveCount(1);
    let prev = first;
    const labels = new Set<string>();
    for (let i = 0; i < 60; i++) {
      if (await page.locator('#start-round-2').isVisible()) {
        await page.locator('#start-round-2').click(); // not a step — the count holds
      } else {
        await page.locator('#next, #ww-skip').click();
      }
      if (await page.locator('text=Quick log').isVisible()) break;
      if (await page.locator('#start-round-2').isVisible()) continue;
      labels.add((await page.locator('.round-indicator').textContent()) ?? '');
      // v48 · P8: the cool-down (always the last step) drops "N of N" — its
      // own "~13 min · N of 11" line is the one count there. The bar stays full.
      if (await page.locator('.stretch-list').isVisible()) {
        await expect(page.locator('.step-count')).toHaveCount(0);
        await expect(page.locator('.progress-bar-fill')).toHaveAttribute('style', /width: 100%/);
        prev += 1;
        continue;
      }
      const [idx, n] = await read();
      expect(n).toBe(total);
      expect(idx).toBe(prev + 1);
      prev = idx;
    }
    expect(prev).toBe(total); // the cool-down list is the last step
    expect([...labels]).toEqual(
      expect.arrayContaining([
        'Warm-up',
        'Main · Round 1 of 2',
        'Main · Round 2 of 2',
        'Upper back',
        'Stretch · 11', // v48 · P7: the cool-down chip counts her 11 rows
      ])
    );
  });

  // v53 (Sep 26 2026): "Cue" → "Tips" — her words, "Cue in the app? It says
  // to cue something, that seems to do nothing." Same fold, plain label.
  test('(c) the split squat face shows the safety line, and the full tip only behind "Tips ▸"', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    await expect(page.locator('.exercise-safety')).toHaveText(
      'Fingertips on the couch for balance only — no weight through the hands.'
    );
    await expect(page.locator('.exercise-notes')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Front foot flat, back heel up');
    const tips = page.locator('.tips-section .detail-section-toggle');
    await expect(tips).toContainText('Tips');
    await expect(tips).toHaveAttribute('aria-expanded', 'false');
    await tips.click();
    await expect(page.locator('.exercise-notes')).toContainText('Front foot flat, back heel up');
    // v53 Tips audit: "in for the squats in A (C keeps its 10)" was program
    // bookkeeping, not hers to read — dropped from the visible note.
    await expect(page.locator('.exercise-notes')).not.toContainText('in for the squats in A');
  });

  // v53 (Sep 26 2026): "Cue" is gone everywhere — walk every step of A, B and
  // C for the current week and confirm no visible "Cue" text survives, and
  // that Tips (where an exercise has one) actually opens on tap.
  test('(c2) no visible "Cue" on any A/B/C step; Tips opens where an exercise has one', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    for (const workout of ['A', 'B', 'C'] as const) {
      await page.goto('/');
      await page.locator(`button[data-workout="${workout}"]`).first().click();
      await page.locator('button:has-text("Start")').click();
      let sawATip = false;
      for (let i = 0; i < 40; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        const tips = page.locator('.tips-section .detail-section-toggle[aria-expanded="false"]');
        if (await tips.count()) {
          await expect(tips.first()).not.toContainText('Cue');
          await tips.first().click();
          await expect(page.locator('.exercise-notes').first()).toBeVisible();
          sawATip = true;
        }
        await expect(page.locator('body')).not.toContainText('Cue');
        const next = page.locator('#next, #ww-skip, #start-round-2').first();
        if (await next.isVisible()) await next.click();
        else break;
      }
      expect(sawATip, `workout ${workout} should show at least one Tips row`).toBe(true);
    }
  });

  test('(d) "New tonight" on the split squat until an A is logged this plan week', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await seedLogs(page, [aLog('last-week-a', '2026-09-17T15:00:00.000Z', 43)]);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    await expect(page.locator('.new-tonight-badge')).toHaveText('New tonight');
    // A move that was already in last week's A carries no badge.
    await goToStep(page, 'Hip hinge'); // v48 · fix r2: Week 4's display label
    await expect(page.locator('.new-tonight-badge')).toHaveCount(0);
  });

  // v48 · fix r1 (Sep 24 2026): the 1 kg curl sat in Round 1 Week 7 (Jun 13-19)
  // before the arm pause — it's a return, not a first.
  test('(d) a move from an earlier week reads "Again tonight", not "New tonight"', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await seedLogs(page, [aLog('last-week-a', '2026-09-17T15:00:00.000Z', 43)]);
    await page.goto('/');
    await startA(page);
    await goToStep(page, '1 kg biceps curl');
    await expect(page.locator('.new-tonight-badge')).toHaveText('Again tonight');
  });

  test('(d) no "New tonight" once an A is logged on/after the week started', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await seedLogs(page, [aLog('this-week-a', '2026-09-20T15:00:00.000Z', 45)]);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    await expect(page.locator('.new-tonight-badge')).toHaveCount(0);
  });

  test('(e)(f) wall sit: Stop instead of "Running…", then "✓ held 45 s · last time 43"; one sage either side', async ({
    page,
  }) => {
    // v49 · look fix (Sep 25 2026): "last time" now reads honestWallSitLogs()
    // only (real v45+ measurements, not a pre-v45 row that saved the week's
    // PRESCRIBED hold) — so the seed moves to Sep 24 2026 (still Round 2 Week
    // 4). Clock moves a day later (Fri Sep 25, still week 4) — same day as
    // the seed would read as "already done today" on Home (no data-workout
    // button to start a fresh A from).
    await movableClock(page, '2026-09-25T14:00:00.000Z', { skipPreCountdown: true });
    await seedLogs(page, [aLog('seed-43', '2026-09-24T15:00:00.000Z', 43)]);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Wall sit');
    // Before the run: Start is the one sage; Done is quiet; the idle number is not sage.
    await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
    await expect(page.locator('#start-timed')).toHaveClass(/btn-primary/);
    await expect(page.locator('#next')).not.toHaveClass(/btn-primary/);
    await expect(page.locator('.timer-display')).toHaveClass(/timer-idle/);
    // The timer sits right under the name/reps/safety card, above the detail card.
    const timerY = (await page.locator('.timer-card').boundingBox())!.y;
    const detailY = (await page.locator('.detail-card').boundingBox())!.y;
    expect(timerY).toBeLessThan(detailY);

    await page.locator('#start-timed').click();
    // v53 (Sep 26 2026): the running countdown moved into the floating pip —
    // Stop now lives in its Pause/Stop sheet (same #stop-timed id/handler).
    await expect(page.locator('#timer-pip')).toBeVisible();
    await expect(page.getByText('Running…')).toHaveCount(0);
    await page.locator('#timer-pip').click();
    await expect(page.locator('#stop-timed')).toBeVisible();
    await page.locator('#timer-pip-close').click();
    await advanceClock(page, 45_000);
    await expect(page.locator('.timer-done')).toHaveText('✓ held 45 s · last time 43');
    await expect(page.locator('.timer-label')).toHaveText('Done');
    await expect(page.locator('#redo-timed')).toBeVisible();
    // After the run: Done · Next is the one sage.
    await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
    await expect(page.locator('#next')).toHaveClass(/btn-primary/);
  });

  test('(e) wall sit: Stop mid-hold saves the REAL seconds to the post-log', async ({ page }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await expect(page.getByText('Running…')).toHaveCount(0);
    await advanceClock(page, 20_000);
    // v53: the countdown reads off the pip now, not an inline .timer-display.
    await expect(page.locator('.timer-pip-time')).toHaveText('25');
    await page.locator('#timer-pip').click();
    await page.locator('#stop-timed').click();
    await expect(page.locator('.timer-done')).toHaveText('✓ held 20 s'); // no earlier wall sit on record
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      if (!(await tapForward(page))) break;
    }
    await expect(page.locator('#wallsit')).toHaveValue('20');
  });

  test('(g) round-1 floor: "Finish here — it still counts" lands on the lite cool-down and saves lite', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await toRoundBreak(page);
    await expect(page.locator('.round-break-title')).toHaveText('Round 1 done ✓');
    await expect(page.locator('.round-break-next')).toContainText('Next · Round 2 · ');
    await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
    await page.locator('#finish-here').click();
    await expect(page.locator('.stretch-list')).toBeVisible();
    await expect(page.locator('.subtitle')).toContainText('Lite day');
    await expect(page.locator('.round-indicator')).toHaveText('Stretch · 11 · lite');
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    const log = await saveAndRead(page);
    expect(log['liteDay']).toBe(true);
  });

  test('(g) Back from the lite cool-down undoes "Finish here" (round-break screen, Lite as before)', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await toRoundBreak(page);
    await page.locator('#finish-here').click();
    await page.locator('#step-back').click();
    await expect(page.locator('.round-break-title')).toHaveText('Round 1 done ✓');
    await expect(page.locator('.round-indicator')).toHaveText('Main · Round 1 of 2');
  });

  // T2 fix r1 (Sep 27 2026, checker's should #1): T1 fix r1 already took app
  // time out of postLogWitnessLine, but nothing checked it — reaching the
  // post-log right after Start (a session a few seconds long, via "Finish
  // here" at the first round break) must never show her a duration built
  // from the app's own open/close tap-time, only the round count. #time-
  // result stays hidden too: nothing confirmed her start/finish in this flow.
  test('(should) T2 fix r1: the post-log right after Start shows no app-time duration', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await toRoundBreak(page);
    await page.locator('#finish-here').click();
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await expect(page.locator('#time-result')).toHaveCount(0);
    const witness = (await page.locator('.postlog-witness').textContent()) ?? '';
    const title = (await page.locator('h2').first().textContent()) ?? '';
    expect(witness).not.toMatch(/\b\d+\s?s\b/);
    expect(witness).not.toMatch(/\bmin\b/);
    expect(title).not.toMatch(/\b\d+\s?s\b/);
    expect(title).not.toMatch(/\bmin\b/);
  });

  // v49 · look fix (Sep 25 2026): the post-log witness line used to read
  // w.rounds (the full program) instead of the day's EFFECTIVE rounds, so it
  // said "both rounds" even on a day she only did one — exactly the two paths
  // that reduce rounds: Lite (toggled before Start) and "Finish here" (mid-
  // session). Neither should ever say "both rounds" when she stopped at 1.
  test('(h) v49 · look fix: "Finish here" on A witnesses "1 round", never "both rounds"', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await toRoundBreak(page);
    await page.locator('#finish-here').click();
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await expect(page.locator('.postlog-witness')).toContainText('1 round');
    await expect(page.locator('.postlog-witness')).not.toContainText('both rounds');
    const log = await saveAndRead(page);
    expect(log['liteDay']).toBe(true);
  });

  // v50 · fix (Sep 25 2026): "Finish here" told her round 2 + upper-back
  // "still counts" — the post-log must not then say "6 moves skipped" right
  // underneath. She did every warm-up + round-1 move in order (toRoundBreak),
  // so nothing the floor left in the count is actually skipped.
  test('(fix) "Finish here" never counts the round-2/upper-back moves it deliberately dropped as skipped', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await toRoundBreak(page);
    await page.locator('#finish-here').click();
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await expect(page.locator('.postlog-skipped')).toHaveCount(0);
  });

  test('(h) v49 · look fix: Lite toggled before Start on C (2 → 1 round) witnesses "1 round", never "both rounds"', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#lite-toggle').click();
    await page.locator('button:has-text("Start")').click();
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
      if (await nextBtn.isVisible()) await nextBtn.click();
      else break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
    // C's own round-break never even fires (effectiveRounds is 1, the floor).
    await expect(page.locator('#start-round-2')).toHaveCount(0);
    await expect(page.locator('.postlog-witness')).toContainText('1 round');
    await expect(page.locator('.postlog-witness')).not.toContainText('both rounds');
  });

  test('(g) round-1 floor: "Start round 2" lands on round 2 step 1; Back returns to round 1', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    const lastRoundOne = await toRoundBreak(page);
    const nextLine = (await page.locator('.round-break-next').textContent()) ?? '';
    const firstMain = nextLine.replace('Next · Round 2 · ', '');
    // Back from the break → round 1's last move.
    await page.locator('#step-back').click();
    await expect(page.locator('.exercise-name')).toHaveText(lastRoundOne);
    await expect(page.locator('.round-indicator')).toHaveText('Main · Round 1 of 2');
    await page.locator('#next').click();
    await page.locator('#start-round-2').click();
    await expect(page.locator('.round-indicator')).toHaveText('Main · Round 2 of 2');
    await expect(page.locator('.exercise-name')).toHaveText(firstMain);
  });

  test('(h) the quit panel\'s "Log what I did" keeps the half session', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    // v48 · fix r1: a plain tap (it used to take a 500 ms hold nothing mentioned).
    await page.locator('#quit').click();
    await expect(page.locator('#quit-confirm-panel')).toBeVisible();
    await expect(page.locator('.quit-confirm-sub')).toHaveText('What you did so far still counts.'); // v48 · fix r2
    await page.locator('#quit-log').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    // A stopped session is not called "done", and its Back goes to the workout.
    await expect(page.locator('h2')).toHaveText('Stopped early · Workout A');
    await expect(page.locator('#back-to-stretches')).toHaveCount(0);
    await expect(page.locator('#back-to-workout')).toHaveText('‹ Back to the workout');
    const log = await saveAndRead(page);
    expect(String(log['notes'])).toContain('stopped early at Supported split squat');
    expect(log['liteDay']).toBe(true); // round 2 never started
  });

  test('(h) "‹ Back to the workout" after a stop returns to the step she stopped on and undoes the stop', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    const indicator = (await page.locator('.round-indicator').textContent()) ?? '';
    await page.locator('#quit').click();
    await page.locator('#quit-log').click();
    await expect(page.locator('h2')).toHaveText('Stopped early · Workout A');
    await page.locator('#back-to-workout').click();
    await expect(page.locator('.exercise-name')).toHaveText('Supported split squat');
    await expect(page.locator('.round-indicator')).toHaveText(indicator);
    // Finish normally from here: the marker is gone, Lite is back to off.
    await toRoundBreak(page);
    await page.locator('#start-round-2').click();
    for (let i = 0; i < 80; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      if (!(await tapForward(page))) break;
    }
    await expect(page.locator('h2')).toHaveText('Nice. Workout A done.');
    await expect(page.locator('#back-to-stretches')).toBeVisible();
    const log = await saveAndRead(page);
    expect(String(log['notes'] ?? '')).not.toContain('stopped early');
    expect(log['liteDay'] ?? false).toBe(false);
  });

  test('(i) round 2: the split squat shows the compact "Watch how it looks" row, never the poster', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    // Round 1 too: a move with no still gets the row, not the black poster.
    await expect(page.locator('.visual-video-poster')).toHaveCount(0);
    await page.locator('.tips-section .detail-section-toggle').click(); // opened in round 1…
    await expect(page.locator('.exercise-notes')).toBeVisible();
    await toRoundBreak(page);
    await page.locator('#start-round-2').click();
    await goToStep(page, 'Supported split squat');
    await expect(page.locator('.round-indicator')).toHaveText('Main · Round 2 of 2');
    // …closed again in round 2 ("Round 2 notes closed").
    await expect(page.locator('.tips-section .detail-section-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.locator('.exercise-notes')).toHaveCount(0);
    const row = page.locator('.exercise-visual-compact .visual-video-toggle');
    await expect(row).toHaveText('▶ Watch how it looks');
    await expect(page.locator('.visual-video-poster')).toHaveCount(0);
    await row.click();
    await expect(page.locator('.visual-video-wrap iframe')).toHaveCount(1);
    // A move WITH a still is folded in round 2 as well.
    await goToStep(page, 'Hip hinge'); // v48 · fix r2: Week 4's display label
    await expect(page.locator('.exercise-visual-still')).toHaveCount(0);
    await expect(page.locator('.exercise-visual-compact')).toHaveCount(1);
  });

  test('rest screen: one "Next ·" line and a quiet ‹ Back link', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.addInitScript(() => {
      window.localStorage.setItem('workout-tracker:setting-rest-sec', '30');
    });
    await page.goto('/');
    await startA(page);
    await goToStep(page, 'Supported split squat');
    await page.locator('#next').click();
    await expect(page.locator('.rest-card')).toBeVisible();
    await expect(page.locator('.rest-next')).toContainText('Next · Hip hinge · 12 reps'); // v48 · fix r2: label
    await expect(page.locator('.rest-card #step-back')).toHaveText('‹ Back');
    await expect(page.locator('.rest-card #step-back')).toHaveClass(/back-link/);
  });
});

// --- v48 P3 · cardio (Sep 24 2026) --------------------------------------------
// DECISIONS-v48 §1 Q4/Q5/Q7/Q8, §2 #3, §4 (slow walking). Her walk: "one green
// Elliptical button, Walk and Apartment small and side by side, and a quiet
// 'Skip cardio today' link"; the elliptical in the order she rides it; no 3-2-1
// before a 10-minute ride; walks are minutes only ("walk counter not important
// now", Sep 7).
test.describe('v48 P3 cardio', () => {
  type Row = Record<string, unknown>;
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };
  const log = (id: string, date: string, extra: Row = {}): Row => ({
    id,
    date,
    workout: 'C',
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    synced: true,
    ...extra,
  });

  const startA = async (page: Page): Promise<void> => {
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.exercise-name')).toBeVisible();
  };

  // v51 (Sep 25 2026): ID-based, not text-based — Done · Next on the elliptical
  // step now opens the ride-numbers screen (id="next", text "Save · Next")
  // before it advances; a text match on "Done ·" would stall there for good.
  const tapForward = async (page: Page): Promise<boolean> => {
    const next = page.locator('#next, #start-round-2, #ww-skip');
    if (await next.isVisible()) {
      await next.click();
      return true;
    }
    return false;
  };

  const goToStep = async (page: Page, name: string): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      const now =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (now === name) return;
      if (!(await tapForward(page))) break;
    }
    throw new Error(`never reached ${name}`);
  };

  const finishAndRead = async (page: Page): Promise<Row> => {
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      if (!(await tapForward(page))) break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    const logs = JSON.parse(raw ?? '[]') as Row[];
    return [...logs].sort((a, b) => String(b['date']).localeCompare(String(a['date'])))[0]!;
  };

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(a) fresh A: one sage (Elliptical), Walk + Apartment side by side, Skip; no picture, no Done', async ({
      page,
    }) => {
      await mockDate(page, TUE_WEEK4);
      await page.goto('/');
      await startA(page);
      await expect(page.locator('.exercise-name')).toHaveText('Cardio');
      await expect(page.locator('.exercise-reps')).toHaveText('10 min');
      await expect(page.locator('.exercise-safety')).toHaveText('Conversational pace');
      await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
      await expect(page.locator('#ww-elliptical')).toHaveClass(/btn-primary/);
      await expect(page.locator('#ww-elliptical')).toHaveText('▶ Elliptical');
      await expect(page.locator('#ww-start')).toContainText('Walk outside');
      await expect(page.locator('#ww-start')).toContainText('tap as you head out');
      await expect(page.locator('#ww-apartment')).toContainText('Apartment');
      const walk = (await page.locator('#ww-start').boundingBox())!;
      const apt = (await page.locator('#ww-apartment').boundingBox())!;
      expect(Math.abs(walk.y - apt.y)).toBeLessThan(1);
      expect(Math.abs(walk.width - apt.width)).toBeLessThan(1);
      expect(walk.x).toBeLessThan(apt.x);
      await expect(page.locator('#ww-skip')).toHaveText('Skip cardio today');
      // No trail-runner photo, no 30-min video, no detail card, no Done.
      await expect(page.locator('.exercise-visual')).toHaveCount(0);
      await expect(page.locator('#app img')).toHaveCount(0);
      await expect(page.locator('#app iframe')).toHaveCount(0);
      await expect(page.locator('.detail-card, .how-to-card')).toHaveCount(0);
      await expect(page.locator('#next')).toHaveCount(0);

      await page.locator('#ww-skip').click();
      await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');
      const saved = await finishAndRead(page);
      expect(saved['cardioLane'] ?? null).toBeNull();
      expect(saved['cardioMinutes'] ?? null).toBeNull();
      expect(saved['walkMinutes'] ?? null).toBeNull();
    });

    test('(c) elliptical first ride: Start inside the fold, "First ride", setup open, no boxes yet', async ({
      page,
    }) => {
      await mockDate(page, TUE_WEEK4);
      await page.goto('/');
      await startA(page);
      await page.locator('#ww-elliptical').click();
      await expect(page.locator('.exercise-name')).toHaveText('Elliptical');
      await expect(page.locator('.exercise-reps')).toHaveText('10 min');
      await expect(page.locator('.new-tonight-badge')).toHaveText('First ride');
      await expect(page.locator('.exercise-safety')).toHaveText(
        'Start on level 3, easy · stand tall, hands light'
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const start = (await page.locator('#start-timed').boundingBox())!;
      // v48 · fix r1: Start clears the pinned Done · Next bar, not just the screen.
      const bar = (await page.locator('.action-bar').boundingBox())!;
      expect(start.y + start.height).toBeLessThanOrEqual(bar.y);
      // v48 · fix r1: on the first ride the setup comes BEFORE Start — she sets
      // the machine up, then starts the timer.
      const steps = (await page.locator('.ell-guide .ell-steps').boundingBox())!;
      expect(steps.y + steps.height).toBeLessThan(start.y);
      await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
      await expect(page.locator('#next')).not.toHaveClass(/btn-primary/);
      // The back-out sits right under Start.
      const out = (await page.locator('#ww-outdoor').boundingBox())!;
      expect(out.y).toBeGreaterThan(start.y);
      // v48 · fix r2 (Sep 25 2026): …and clears the pinned bar with no scroll —
      // it's the way out on a day the machine won't start (was 807-851 px under
      // a bar at 827).
      expect(out.y + out.height).toBeLessThanOrEqual(bar.y);
      await expect(page.locator('#ww-outdoor')).toHaveText('↩ Walk or apartment instead');
      // Setup: open on the first ride, three short steps.
      await expect(page.locator('.ell-guide .ell-steps li')).toHaveCount(3);
      await expect(page.locator('.ell-guide')).toContainText('Choose MANUAL');
      // Nothing to fill in before the ride, and no generic how-to card.
      await expect(page.locator('#ell-level')).toHaveCount(0);
      await expect(page.locator('#ell-km')).toHaveCount(0);
      await expect(page.locator('#ell-pulse')).toHaveCount(0);
      await expect(page.locator('.how-to-card, .detail-card')).toHaveCount(0);
      await expect(page.locator('#app')).not.toContainText('How to do it');
      // v48 · fix r1: scrolled to the end, nothing sits under the pinned bar.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const lastCard = (await page.locator('#app > .card').last().boundingBox())!;
      const barEnd = (await page.locator('.action-bar').boundingBox())!;
      expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(barEnd.y);
      // Tapping Start closes the setup card (not drawn while the ride runs).
      await page.locator('#start-timed').click();
      await expect(page.locator('.ell-guide')).toHaveCount(0);
    });
  });

  test('(b) lane memory: last lane elliptical → straight onto the Elliptical; walk → the choice', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    for (const [lane, expected] of [
      ['elliptical', 'Elliptical'],
      ['walk', 'Cardio'],
      ['apartment', 'Apartment cardio'],
    ] as const) {
      await seedLogs(page, [
        log('older', '2026-09-19T15:00:00.000Z', { cardioLane: 'apartment', cardioMinutes: 10 }),
        log('newest', '2026-09-21T15:00:00.000Z', { cardioLane: lane, cardioMinutes: 10 }),
      ]);
      await page.goto('/');
      await startA(page);
      await expect(page.locator('.exercise-name')).toHaveText(expected);
      // The apartment step isn't in PROGRAM — it must not read as "New tonight".
      if (expected === 'Apartment cardio') {
        await expect(page.locator('.new-tonight-badge')).toHaveCount(0);
      }
      // Nothing has started on its own.
      expect(
        await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))
      ).toBeNull();
      expect(
        await page.evaluate(() => localStorage.getItem('workout-tracker:ww-lane-started'))
      ).toBeNull();
    }
  });

  test('(d) no 3-2-1 before a ride; the wall sit still gets it', async ({ page }) => {
    await movableClock(page, TUE_WEEK4); // pre-count left at its default (3 s)
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await expect(page.locator('.countdown-big')).toHaveCount(0);
    await expect(page.getByText('Get ready')).toHaveCount(0);
    // v53 (Sep 26 2026): the ride countdown lives in the floating pip now —
    // the "Right now" line is still the elliptical's own face underneath it.
    await expect(page.locator('.timer-pip-time')).toHaveText('10:00');
    await expect(page.locator('.cardio-seg-label')).toHaveText('Right now');
    await page.locator('#timer-pip').click();
    await expect(page.locator('#stop-lane')).toBeVisible();
    await page.locator('#timer-pip-close').click();
    await expect(page.getByText('Running…')).toHaveCount(0);
    // Stop keeps what she did; the step shows the after-ride face.
    await advanceClock(page, 4 * 60_000);
    await expect(page.locator('.timer-pip-time')).toHaveText('6:00');
    await page.locator('#timer-pip').click();
    await page.locator('#stop-lane').click();
    await expect(page.locator('.timer-done')).toHaveText('✓ 4 min done');
    await goToStep(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-label')).toHaveText('Get ready');
    await expect(page.locator('.countdown-big')).toBeVisible();
  });

  test('(e) the live "Right now" line follows the ride; a buzz on the grips and the ease-off', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vib: unknown[] };
      w.__vib = [];
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (p: unknown) => {
          w.__vib.push(p);
          return true;
        },
      });
    });
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    const line = page.locator('#ride-line');
    // During: the timer, a quiet Stop, the one line — and nothing else.
    await expect(page.locator('.ride-title')).toContainText('Elliptical');
    await expect(page.locator('.ride-title')).toContainText('10 min');
    await expect(page.locator('.cardio-seg-label')).toHaveText('Right now');
    await expect(page.locator('.ell-guide, .ell-after-card, .exercise-safety')).toHaveCount(0);
    await expect(page.locator('.btn-primary:visible')).toHaveCount(0);

    await advanceClock(page, 30_000); // elapsed 30 s
    await expect(line).toHaveText('Easy on level 3');
    await advanceClock(page, 270_000); // elapsed 5 min
    await expect(line).toHaveText('Raise the level until talking takes effort — then hold it');
    expect(await page.evaluate(() => (window as unknown as { __vib: unknown[] }).__vib)).toEqual(
      []
    );
    await advanceClock(page, 255_000); // remaining 45 s
    await expect(line).toHaveText('Hands on the fixed grips — read your pulse');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __vib: unknown[] }).__vib.length))
      .toBe(1);
    await advanceClock(page, 25_000); // remaining 20 s
    await expect(line).toHaveText('Back to level 3, easy');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __vib: unknown[] }).__vib))
      .toEqual([200, 200]);
  });

  test('(f) v51: Done · Next opens "Your ride — from the machine" — time, km, kcal, level, pulse, in that order; untouched level saves null', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await expect(page.locator('.timer-done')).toHaveText('✓ 10 min done');
    // v51 (Sep 25 2026): the ride ending on its own shows nothing — Done ·
    // Next is what opens the numbers screen (her words: "I click the next
    // button and then I fill in information").
    await expect(page.locator('.ell-after-card')).toHaveCount(0);
    await page.locator('#next').click();
    const card = page.locator('.ell-after-card');
    await expect(card.locator('.ell-readings-title')).toHaveText('Your ride — from the machine');
    await expect(card).toContainText('Read them before you press STOP on the machine.');
    await expect(card).toContainText('Level you rode at');
    await expect(page.locator('#ell-level')).toHaveText('—');
    await expect(page.locator('#ell-level-same')).toHaveCount(0); // no last level yet
    // v51: reordered — time, distance, calories, level, pulse (her lead's
    // spec), each its own row, stacked — the order check is vertical (y).
    const time = (await page.locator('#ell-time').boundingBox())!;
    const km = (await page.locator('#ell-km').boundingBox())!;
    const kcal = (await page.locator('#ell-kcal').boundingBox())!;
    const lvl = (await page.locator('#ell-level').boundingBox())!;
    const pulse = (await page.locator('#ell-pulse').boundingBox())!;
    expect(time.y).toBeLessThan(km.y);
    expect(km.y).toBeLessThan(kcal.y);
    expect(kcal.y).toBeLessThan(lvl.y);
    expect(lvl.y).toBeLessThan(pulse.y);
    // v49: Time prefills from the app's own timer when it ran — "10:00" for a
    // ride that ran its full 10 minutes — with an "app timer" caption (v49 ·
    // look fix Sep 25 2026: shortened from "from the app", one line not three).
    await expect(page.locator('#ell-time')).toHaveValue('10:00');
    await expect(card).toContainText('app timer');
    // …and all five come before Save · Next (pinned at the bottom).
    const order = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '#ell-time, #ell-km, #ell-kcal, #ell-level, #ell-pulse, #next'
        ),
      ].map((e) => e.id)
    );
    expect(order).toEqual(['ell-time', 'ell-km', 'ell-kcal', 'ell-level', 'ell-pulse', 'next']);
    // The setup never shows on this screen.
    await expect(page.locator('.ell-guide')).toHaveCount(0);
    await expect(page.locator('#next')).toHaveClass(/btn-primary/);
    await expect(page.locator('#next')).toHaveText('Save · Next');
    await page.locator('#ell-km').fill('1.4');
    await page.locator('#ell-kcal').fill('63.4');
    await page.locator('#ell-time').fill('10:02');
    await page.locator('#ell-pulse').fill('128');
    const saved = await finishAndRead(page);
    expect(saved['cardioLane']).toBe('elliptical');
    expect(saved['cardioMinutes']).toBe(10);
    expect(saved['ellipticalLevel']).toBeNull();
    expect(saved['ellipticalKm']).toBe(1.4);
    expect(saved['ellipticalKcal']).toBe(63.4);
    expect(saved['ellipticalTimeSec']).toBe(602);
    expect(saved['ellipticalPulse']).toBe(128);
  });

  test('(f) v49 · look fix: the Time box reads bare digits as mm:ss (the numeric pad has no colon key), and typing over the prefill drops the "app timer" caption', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    // v51: Done · Next opens the ride-numbers screen — the Time box lives there.
    await page.locator('#next').click();
    const card = page.locator('.ell-after-card');
    // Before she types: still prefilled "app timer".
    await expect(page.locator('#ell-time')).toHaveValue('10:00');
    await expect(card).toContainText('app timer');
    // She types what her console shows, no ':' key on the numeric pad —
    // "1002" for 10:02. parseMmSs must read the last two digits as seconds,
    // not 1002 raw seconds (16:42).
    await page.locator('#ell-time').fill('1002');
    await expect(card).not.toContainText('app timer');
    const saved = await finishAndRead(page);
    expect(saved['ellipticalTimeSec']).toBe(602); // 10:02, not 1002
  });

  test('(f) v49 · look fix: bare "958" (no colon) reads as 9:58, not 958 raw seconds', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    // v51: Done · Next opens the ride-numbers screen — the Time box lives there.
    await page.locator('#next').click();
    await page.locator('#ell-time').fill('958');
    const saved = await finishAndRead(page);
    expect(saved['ellipticalTimeSec']).toBe(598); // 9:58, not 958
  });

  test('(f) "7 again" sets the last level in one tap and saves 7', async ({ page }) => {
    await movableClock(page, TUE_WEEK4);
    await seedLogs(page, [
      log('last-ride', '2026-09-21T15:00:00.000Z', {
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 7,
      }),
    ]);
    await page.goto('/');
    await startA(page);
    await expect(page.locator('.exercise-name')).toHaveText('Elliptical'); // lane memory
    await expect(page.locator('.new-tonight-badge')).toHaveCount(0);
    await expect(page.locator('.ell-guide .ell-steps')).toHaveCount(0); // not a first ride
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    // v51: Done · Next opens the ride-numbers screen — the level lives there.
    await page.locator('#next').click();
    await expect(page.locator('#ell-level')).toHaveText('—');
    await page.locator('#ell-level-same').click();
    await expect(page.locator('#ell-level')).toHaveText('7');
    const saved = await finishAndRead(page);
    expect(saved['ellipticalLevel']).toBe(7);
  });

  // v49 · look fix (Sep 25 2026): "first ride tonight" was shown whenever no
  // log had a level COLUMN — true even after a real ride where the level was
  // left null on purpose (Decision Q5). Now it only fires when she has never
  // ridden at all.
  test('(h) v49 · look fix: Home says "level not recorded yet" after a real ride with no level — not "first ride tonight"', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await seedLogs(page, [
      log('ride', TUE_WEEK4, {
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: null,
        notes: 'cardio: elliptical 10 min · level 5', // stale v47 marker, still on the row
      }),
    ]);
    await page.goto('/');
    await expect(page.locator('.home-startnow-card')).toContainText('level not recorded yet');
    await expect(page.locator('.home-startnow-card')).not.toContainText('first ride tonight');
  });

  // v49 · look fix (Sep 25 2026): lastEllipticalLevel() used to fall back to
  // the old notes marker even on a row that HAS cardioLane — so a level left
  // null on purpose ("5 again") got offered back as a guess.
  test('(h) v49 · look fix: the after-ride "N again" chip never guesses a level from an old notes marker once cardioLane is set', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await seedLogs(page, [
      log('ride', '2026-09-21T15:00:00.000Z', {
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: null,
        notes: 'cardio: elliptical 10 min · level 5', // stale v47 marker; the level itself was left null on purpose
      }),
    ]);
    await page.goto('/');
    await startA(page);
    await expect(page.locator('.exercise-name')).toHaveText('Elliptical'); // lane memory
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    // v51: Done · Next opens the ride-numbers screen — the chip lives there.
    await page.locator('#next').click();
    // No "5 again" chip — a deliberately null level is never offered back.
    await expect(page.locator('#ell-level-same')).toHaveCount(0);
  });

  test('(g) walk lane: "Walking · N min", no km or steps anywhere; saved walkMeters null', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    // The standalone walk card on home: minutes only too.
    await page.locator('#log-walk-start').click();
    await expect(page.locator('#walk-live')).toHaveText(/^Walking · \d+ min$/);
    await expect(page.locator('.walk-card')).not.toContainText('km');
    await expect(page.locator('.walk-card')).not.toContainText(/steps/i);
    await page.locator('#cancel-walk').click();

    await startA(page);
    await page.locator('#ww-start').click();
    await expect(page.locator('#walk-live')).toHaveText(/^Walking · \d+ min$/);
    const text = (await page.locator('#app').innerText()) ?? '';
    expect(text).not.toMatch(/\bkm\b/);
    expect(text).not.toMatch(/steps/i);
    await expect(page.locator('.exercise-visual')).toHaveCount(0);
    const saved = await finishAndRead(page);
    expect(saved['cardioLane']).toBe('walk');
    expect(saved['walkMeters']).toBeNull();
    expect(saved['walkSteps']).toBeNull(); // Fit doesn't answer under automation
  });

  test('display name: the pre-log list says "Cardio", never "Outdoor walk"', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('.prelog-overview-summary').click(); // v48 · P5: one fold
    await expect(page.locator('.overview-phase-items').first()).toContainText('Cardio');
    await expect(page.locator('#app')).not.toContainText('Outdoor walk');
  });
});

// --- v51 · ride numbers (Sep 25 2026) ----------------------------------------
// Her words mid-Workout C on the live v50: "right when I finish with the
// elliptical I should then be able to put in the data... it's right in front
// of me" / "I just finished eliptical for c and it didn't show up for me" /
// "I don't know what I was supposed to see or where I was supposed to see
// it." → "I feel like it should be like I click the next button and then I
// fill in information. That's how simple it is." Done · Next on the
// elliptical step now opens a "from the machine" screen instead of advancing,
// in any ride state.
test.describe('v51 ride numbers screen', () => {
  const finishAndRead = async (page: Page): Promise<Record<string, unknown>> => {
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      const next = page.locator('#next, #start-round-2, #ww-skip');
      if (await next.isVisible()) await next.click();
      else break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    const logs = JSON.parse(raw ?? '[]') as Record<string, unknown>[];
    return logs[0]!;
  };

  test('Done · Next during a RUNNING ride opens the numbers screen, stops the timer, and keeps the real minutes', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 9 * 60_000); // 9 of 25 min in — still running
    // v53 (Sep 26 2026): "Running" now shows on the pip, not an inline label.
    await expect(page.locator('.timer-pip-time')).toHaveText('16:00'); // 25 - 9 left

    await page.locator('#next').click(); // Done · Next mid-ride

    // The numbers screen is up, not the running face.
    await expect(page.locator('#ell-time')).toBeVisible();
    await expect(page.locator('#timer-pip')).toHaveCount(0);
    // The real minutes she rode (9, not the full 25) were kept.
    expect(
      await page.evaluate(() => localStorage.getItem('workout-tracker:ww-lane-done-min'))
    ).toBe('9');
    await expect(page.locator('#ell-time')).toHaveValue('9:00');
  });

  test('after an explicit Stop, Done · Next opens the numbers screen', async ({ page }) => {
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 6 * 60_000);
    await page.locator('#timer-pip').click(); // v53: Stop lives in the pip's sheet now
    await page.locator('#stop-lane').click();
    await expect(page.locator('.timer-done')).toHaveText('✓ 6 min done');
    await expect(page.locator('#ell-time')).toHaveCount(0); // not shown yet

    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toBeVisible();
    await expect(page.locator('#ell-time')).toHaveValue('6:00');
  });

  test('a never-started ride: Done · Next opens the numbers screen straight from the before face', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('#start-timed')).toBeVisible(); // the before face — never started
    await expect(page.locator('#ell-time')).toHaveCount(0);

    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toBeVisible();
    // Nothing was ridden — no app-timer prefill, no lane-done minutes.
    expect(
      await page.evaluate(() => localStorage.getItem('workout-tracker:ww-lane-done-min'))
    ).toBeNull();
  });

  test('Skip — no numbers today advances with every reading left null', async ({ page }) => {
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toBeVisible();
    await page.locator('#ride-numbers-skip').click();
    // Advanced off the elliptical step.
    await expect(page.locator('#ell-time')).toHaveCount(0);
    const saved = await finishAndRead(page);
    expect(saved['cardioLane']).toBe('elliptical');
    expect(saved['cardioMinutes']).toBe(10);
    expect(saved['ellipticalKm']).toBeNull();
    expect(saved['ellipticalKcal']).toBeNull();
    expect(saved['ellipticalPulse']).toBeNull();
    expect(saved['ellipticalLevel']).toBeNull();
  });

  test('‹ Back returns to the ride face with her values kept, and Done · Next reopens the screen holding them', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('1.87');
    await page.locator('#ell-pulse').fill('140');

    await page.locator('#ride-numbers-back').click();
    // Back on the ride face (the after-ride done line), not a step further back.
    await expect(page.locator('.ell-done-line')).toHaveText(/10 min done/);
    await expect(page.locator('#ell-km')).toHaveCount(0);

    await page.locator('#next').click(); // Done · Next reopens the screen
    await expect(page.locator('#ell-km')).toHaveValue('1.87');
    await expect(page.locator('#ell-pulse')).toHaveValue('140');
  });

  test('the step count ("N of M") is unchanged by opening the numbers screen', async ({ page }) => {
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    const before = await page.locator('.step-count').textContent();
    await page.locator('#next').click();
    const opened = await page.locator('.step-count').textContent();
    expect(opened).toBe(before);
  });

  test('reload on the numbers screen restores it, values kept', async ({ page, context }) => {
    // v51: a real page.reload() would re-fire this file's beforeEach
    // addInitScript (it persists across navigations on the SAME page) and wipe
    // localStorage right before the app's own restore runs — context.newPage()
    // is the established way this file simulates a fresh app open instead (see
    // the "(e) after Save today" reopen test above).
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('1.87');

    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-25T08:10:02.000Z');
    await reopened.goto('/');
    await expect(reopened.locator('#ell-time')).toBeVisible();
    await expect(reopened.locator('#ell-km')).toHaveValue('1.87');
    await expect(reopened.locator('#ride-numbers-back')).toBeVisible();
    await reopened.close();
  });

  test('walk lane: Done · Next still advances directly — no numbers screen', async ({ page }) => {
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-start').click(); // the walk lane
    await expect(page.locator('#walk-live')).toBeVisible();
    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toHaveCount(0);
    await expect(page.locator('.exercise-name')).not.toHaveText('Elliptical');
  });

  test('at 412×915, Save · Next and all 5 fields sit above the pinned bar with no page scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await movableClock(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await page.locator('#next').click();
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThanOrEqual(915);
    for (const id of ['ell-time', 'ell-km', 'ell-kcal', 'ell-level', 'ell-pulse', 'next']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });
});

// --- v48 P4 · home (Sep 24 2026) ---------------------------------------------
// DECISIONS-v48 §1 Q1-Q3, §2 #1-2 #8, §5 Home rows. Her words: "look at home ux
// ui and make it better i feel like its a bit all over the place". One next
// action (the "Up next" hero — the only sage on home), B/C one chip away, ONE
// honest week line, a one-row walk, two quiet doors; everything else re-homed
// one tap away.
test.describe('v48 P4 home', () => {
  type Row = Record<string, unknown>;
  const THU_WEEK4 = '2026-09-24T15:00:00.000Z'; // Thu Sep 24, 18:00 Jerusalem
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z';

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };

  // 39 sessions, A→B→C, the newest a C on Sat Sep 19 — her real shape.
  const thirtyNine = (): Row[] => {
    const rows: Row[] = [];
    let t = new Date('2026-09-19T16:30:00.000Z').getTime();
    for (let i = 0; i < 39; i++) {
      const workout = ['C', 'B', 'A'][i % 3];
      rows.push({
        id: `seed-${i}`,
        date: new Date(t).toISOString(),
        workout,
        capacityBefore: 7,
        capacityAfter: 7,
        wallSitSec: workout === 'A' ? 43 : 0,
        backPain: 0,
        word: '',
        synced: true,
        durationSec: 2400,
      });
      t -= (i % 3 === 0 ? 3 : 2) * 86_400_000;
    }
    return rows;
  };

  // Every visible element with a SAGE fill (the --accent / --accent-hover
  // primary surface), and whether it sits inside the A hero.
  const sageFills = (page: Page): Promise<{ cls: string; inHero: boolean }[]> =>
    page.evaluate(() => {
      const SAGE = ['rgb(143, 188, 143)', 'rgb(163, 207, 163)'];
      return [...document.querySelectorAll<HTMLElement>('#app *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = getComputedStyle(el);
          return (
            SAGE.includes(cs.backgroundColor) || SAGE.some((c) => cs.backgroundImage.includes(c))
          );
        })
        .map((el) => ({
          cls: String(el.className),
          inHero: el.closest('button.home-hero[data-workout="A"]') !== null,
        }));
    });

  // v51 (Sep 25 2026): ID-based, not text-based — see the matching comment on
  // the "v48 P3 cardio" describe's tapForward above.
  const tapForward = async (page: Page): Promise<boolean> => {
    const next = page.locator('#next, #start-round-2, #ww-skip');
    if (await next.isVisible()) {
      await next.click();
      return true;
    }
    return false;
  };

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(a) 39 sessions, last = C: one sage thing (the A hero), the whole hero in the fold, home < 1300 px', async ({
      page,
    }) => {
      await mockDate(page, THU_WEEK4);
      await seedLogs(page, thirtyNine());
      await page.goto('/');
      const hero = page.locator('button.workout-card.workout-card-pick[data-workout="A"]');
      await expect(hero).toContainText('Up next');
      await expect(hero.locator('.hero-title')).toHaveText('Workout A');
      // v55: the hero line reads her fixed short label now, not the workout's
      // own longer `name` (see WORKOUT_SHORT_LABEL's comment).
      await expect(hero).toContainText('Lower + back · 2 rounds · ~30 min');
      // v48 · fix r1: only the true first is "New"; Round 1's arm moves are "Back".
      await expect(hero.locator('.hero-new')).toHaveText('New tonight: supported split squat');
      await expect(hero.locator('.hero-back')).toHaveText(
        'Again tonight: prone row · 1 kg biceps curl'
      );
      await expect(hero).toContainText('Cardio: 10 min, your pick'); // no lane on the seeds
      await expect(hero.locator('.hero-start')).toHaveText('Start');
      const fills = await sageFills(page);
      expect(fills, JSON.stringify(fills)).toHaveLength(1);
      expect(fills[0]!.inHero).toBe(true);
      const box = (await hero.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(915);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(1300);
      // The one week line.
      await expect(page.locator('.week-line')).toContainText('of 3 this week');
      // v49 · look (Sep 25 2026): the lifetime count moved to the Start → Now
      // card's own Sessions row.
      await expect(page.locator('.home-startnow-card .start-now-row').last()).toContainText('39');
    });

    // v52.2 (Sep 26 2026): R2W5 shipped, so Sat Sep 26 morning (no sessions
    // yet, so no swing — homeWeekOffset() is 0 before any session logs) now
    // gets its OWN plan, not a Week-4 fallback — no more "· Week 4's plan"
    // suffix. Title updated from "(no Week 5 encoded)"; the fail-loud plan-note
    // itself is still covered above ((f) and the swing-plan tests below).
    test('(g) Sat Sep 26 morning (Week 5 now encoded, no sessions yet): the header reads Week 5 clean, still one line', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-26T09:00:00.000Z');
      await page.goto('/');
      const h1 = page.locator('.home-header h1');
      await expect(h1).toHaveText('Round 2 · Week 5');
      expect((await h1.boundingBox())!.height).toBeLessThan(40);
      const h1Box = (await h1.boundingBox())!;
      const gear = (await page.locator('#open-settings').boundingBox())!;
      expect(h1Box.x + h1Box.width).toBeLessThanOrEqual(gear.x);
      expect((await page.locator('.home-header .app-version').boundingBox())!.height).toBeLessThan(
        24
      );
    });

    test('(g) the version tag is one line and carries the version + a time', async ({ page }) => {
      const tag = page.locator('.home-header .app-version');
      // "v4" was v48/v49-specific; match any "v<digits>" (with an optional
      // dotted patch, v52.2 (Sep 26 2026)) so this doesn't need a hand-edit on
      // every version bump.
      await expect(tag).toHaveText(/^v\d+(\.\d+)? ·/);
      await expect(tag).toHaveText(/\d{2}:\d{2}$/);
      await expect(tag).not.toContainText(/20\d\d/); // the year lives in Settings › About
      expect((await tag.boundingBox())!.height).toBeLessThan(24);
      const h1 = (await page.locator('.home-header h1').boundingBox())!;
      expect(h1.height).toBeLessThan(40); // the title stays on one line too
      // v48 · P5: measure after home's 0.22 s entry slide settles — mid-slide
      // the fractional translateY read the 44 px gear as 43.999998 under load.
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running')
      );
      const gear = (await page.locator('#open-settings').boundingBox())!;
      expect(gear.width).toBeGreaterThanOrEqual(44);
      expect(gear.height).toBeGreaterThanOrEqual(44);
    });
  });

  test('(b) the B and C chips start their own workout: chip → pre-log → Start (2 taps)', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await page.goto('/');
    await expect(page.locator('.home-chips')).toContainText('or do');
    for (const id of ['B', 'C'] as const) {
      const chip = page.locator(`button.btn-chip[data-workout="${id}"]`);
      await expect(chip).toHaveText(id === 'B' ? 'B · Glutes + back' : 'C · Cardio');
      await chip.click();
      await expect(page.locator('.screen-header h2')).toContainText(`Workout ${id}`);
      await page.locator('#begin').click();
      await expect(page.locator('.exercise-name')).toBeVisible();
      await expect(page.locator('.screen-header h2')).toContainText(`Workout ${id}`);
      // Back out without logging (the resume snapshot is cleared by a quit).
      await page.evaluate(() => localStorage.removeItem('workout-tracker:active-session'));
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toBeVisible();
    }
  });

  test("(c) a Saturday that swung to last week reads in words on Thursday: 0 of 3 · Sat's C went to Week 3", async ({
    page,
  }) => {
    await seedLogs(page, [SWING_WEEK3_A, SWING_WEEK3_B, SWING_SAT_C]);
    await mockDate(page, THU_WEEK4);
    await page.goto('/');
    const line = page.locator('.week-line');
    await expect(line).toContainText('0 of 3 this week');
    await expect(line).toContainText("Sat's");
    await expect(line).toContainText('went to');
    await expect(line).toHaveText("0 of 3 this week · Sat's C went to Week 3");
    // v52.1 (Sep 26 2026, her "I need b back for 5"): a session that COUNTED
    // for last week gets no dot in this week's strip — the line already says
    // where it went — so the Saturday dot is empty here.
    await expect(page.locator('.week-card .week-dot.dot-C')).toHaveCount(0);
    await expect(page.locator('.week-card .week-dot.dot-empty')).toHaveCount(7);
  });

  test('(d) what left home: no title/subtitle/pick copy, no Recent, no streak, no week arrows', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, thirtyNine());
    await page.goto('/');
    const text = await page.locator('#app').innerText();
    for (const gone of [
      'Workout Tracker',
      'Show up 3x/week',
      'Pick today',
      'Recent workouts',
      'streak',
      'Weekly review',
      'capacity',
      'Gear',
      'Past weeks',
      'Coming next week',
    ]) {
      expect(text.toLowerCase(), gone).not.toContain(gone.toLowerCase());
    }
    await expect(page.locator('#prev-week, #next-week')).toHaveCount(0);
    await expect(page.locator('.week-banner, .stat-number, .last-line')).toHaveCount(0);
    await expect(page.locator('#open-weekly-review-link')).toHaveCount(0);
    // The two doors: one component, same height, stacked with no gap.
    const doors = page.locator('.home-doors .door-row');
    await expect(doors).toHaveCount(2);
    await expect(doors.nth(0)).toContainText('Progress');
    await expect(doors.nth(1)).toContainText('Sessions');
    const p = (await doors.nth(0).boundingBox())!;
    const s = (await doors.nth(1).boundingBox())!;
    expect(p.height).toBeGreaterThanOrEqual(48);
    expect(Math.abs(p.height - s.height)).toBeLessThan(1);
    expect(Math.abs(p.y + p.height - s.y)).toBeLessThan(2);
    // "synced ✓" hides; the sync word shows only when something is pending.
    await expect(page.locator('#sync-indicator')).toHaveText('');
  });

  test('(e) after Save today: "Done ✓ · Workout A", no sage; a first elliptical ride + 1.4 km are its firsts', async ({
    page,
    context,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await expect(page.locator('.timer-done')).toHaveText('✓ 10 min done');
    // v51 (Sep 25 2026): Done · Next opens the ride-numbers screen first.
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('1.4');
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      if (!(await tapForward(page))) break;
    }
    await page.locator('#save-log').click();
    const done = page.locator('#home-done-card');
    await expect(done.locator('.home-done-title')).toHaveText('Done ✓ · Workout A');
    await expect(done).toContainText('1 of 3 this week');
    const firsts = done.locator('.home-done-firsts');
    await expect(firsts).toContainText('first elliptical ride');
    await expect(firsts).toContainText('1.4 km');
    await expect(firsts).toContainText('supported split squat');
    // v48 · fix r1: the 1 kg curl and the prone row were in Round 1 Week 7 —
    // returns, not firsts. They get their own "Back:" line.
    await expect(firsts).not.toContainText('biceps curl');
    await expect(firsts).not.toContainText('prone row');
    await expect(done.locator('.home-done-back')).toHaveText('Again: prone row · 1 kg biceps curl');
    await expect(page.locator('.home-hero')).toHaveCount(0);
    expect(await sageFills(page)).toHaveLength(0);
    // The chips stay — the other two workouts, one tap each.
    await expect(page.locator('button.btn-chip[data-workout="B"]')).toBeVisible();
    await expect(page.locator('button.btn-chip[data-workout="C"]')).toBeVisible();
    // Without the per-phone firsts key the card still witnesses the session.
    // (A fresh page in the same context: `page` clears storage on every load.)
    await page.evaluate(() => localStorage.removeItem('workout-tracker:last-done'));
    const reopened = await context.newPage();
    await movableClock(reopened, TUE_WEEK4);
    await reopened.goto('/');
    await expect(reopened.locator('.home-done-title')).toHaveText('Done ✓ · Workout A');
    await expect(reopened.locator('#home-done-card')).toContainText('1 of 3 this week');
    await expect(reopened.locator('.home-done-firsts')).toHaveText('Elliptical · 1.4 km');
    await reopened.close();
  });

  test('(e) the next day the hero is back, pointing at the next workout', async ({ page }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      {
        id: 'wed-a',
        date: '2026-09-23T15:00:00.000Z',
        workout: 'A',
        capacityBefore: 7,
        capacityAfter: 7,
        wallSitSec: 45,
        backPain: 0,
        word: '',
        synced: true,
      },
    ]);
    await page.goto('/');
    await expect(page.locator('#home-done-card')).toHaveCount(0);
    await expect(page.locator('button.home-hero[data-workout="B"]')).toContainText('Up next');
  });

  // Sat Sep 26 2026 — her words, 21:21: "its saturday night i was supposed to
  // be able to do workout b of last week tonight". Last week = A (Thu) + C (Fri),
  // so Saturday's session swings back to it and Up next must be the missing B,
  // not the rotation's A.
  const swingLog = (id: string, date: string, workout: 'A' | 'B' | 'C') => ({
    id,
    date,
    workout,
    capacityBefore: 8,
    capacityAfter: 8,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    synced: true,
  });

  test('(e2) swing Saturday: Up next is the workout last week is still missing', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-26T18:20:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
    ]);
    await page.goto('/');
    await expect(page.locator('button.home-hero[data-workout="B"]')).toContainText('Up next');
  });

  test('(e2b) swing Saturday: home shows LAST week — Week 4 on top, its 8 days, A + C done, B left', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-26T18:20:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
    ]);
    await page.goto('/');
    const h1 = page.locator('.home-header h1');
    await expect(h1).toContainText('Week 4');
    await expect(h1).not.toContainText('Week 5');
    await expect(page.locator('.week-card .week-dot')).toHaveCount(8);
    await expect(page.locator('.week-card .dot-A')).toHaveCount(1);
    await expect(page.locator('.week-card .dot-C')).toHaveCount(1);
    await expect(page.locator('.week-card .week-card-range')).toContainText('Week 4');
    await expect(page.locator('.week-line')).toHaveText(
      '2 of 3 · B left — tonight counts for Week 4'
    );
    await expect(page.locator('.swing-note')).toHaveCount(0);
  });

  test("(e2c) after Saturday's B the Done card reports Week 4, not the new week", async ({
    page,
  }) => {
    // WK2 (Sep 27 2026): kept strictly BEFORE the real completion-model launch
    // (Sep 26 2026 22:30 = 19:30 UTC) so this still exercises the swing model
    // it was written for — "now" at/after that instant reads the completion
    // model instead (isNowAfterCompletionLaunch), which is a DIFFERENT,
    // deliberately-covered scenario (see (swing-plan b) below). sat-b's own
    // timestamp is her real Sep 26 2026 B session end (COMPLETION_WEEKS_FROM's
    // own anchor), not the synthetic :30 this test used before.
    await mockDate(page, '2026-09-26T19:20:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
      swingLog('sat-b', '2026-09-26T19:14:51.000Z', 'B'),
    ]);
    await page.goto('/');
    await expect(page.locator('.home-done-line')).toHaveText('3 of 3 in Week 4');
    // "I need b back for 5" (22:18): the new week is at 0 of 3, so all three
    // workouts stay on offer, led by the week's name; the swung B gets no dot
    // in the new week's strip (the line already says where it went).
    await expect(page.locator('.home-chips .home-chip')).toHaveCount(3);
    await expect(page.locator('.home-chips-lead')).toHaveText('Week 5');
    await expect(page.locator('.week-card .dot-B')).toHaveCount(0);
    await expect(page.locator('.week-line')).toHaveText(
      "0 of 3 this week · Sat's B went to Week 4"
    );
  });

  test('(e3) once Saturday completes last week, Up next starts the new week at A', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-27T09:00:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
      swingLog('sat-b', '2026-09-26T19:30:00.000Z', 'B'),
    ]);
    await page.goto('/');
    await expect(page.locator('button.home-hero[data-workout="A"]')).toContainText('Up next');
  });

  // THE SWING FIX (v52.2, Sep 26 2026): R2W5 starts the same Saturday a swing
  // session can still count toward Week 4. The plan must follow the week the
  // session COUNTS toward, not the calendar — see planDateNow()/planDateForLog()
  // next to homeWeekOffset() in app.ts.
  // WEEK5-PROPOSAL-2026-09-26.md §e.
  test("(swing-plan a) Sat Sep 26 evening, Thu A + Fri C logged: B still trains on Week 4's plan (10-min ride) — the swing", async ({
    page,
  }) => {
    await mockDate(page, '2026-09-26T18:20:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
    ]);
    await page.goto('/');
    // B is still Week 4's B — last week is short (A + C only), so tonight's
    // session swings back to it (same rule as (e2)/(e2b) above).
    await page.locator('button[data-workout="B"]').click();
    await expect(page.locator('.prelog-meta')).toContainText('R2 · Week 4');
    await expect(page.locator('.prelog-meta')).not.toContainText('Week 5');
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.exercise-name')).toHaveText('Cardio');
    await expect(page.locator('.exercise-reps')).toHaveText('10 min'); // Week 4's ride, not Week 5's 12
  });

  test("(swing-plan b → WK2) Sun Sep 27, now past the real launch: A opens on Week 5's plan (12-min ride), header plain", async ({
    page,
  }) => {
    // WK2 (Sep 27 2026): "now" here is at/after the real completion-model
    // launch (Sep 26 2026 22:30), so this is no longer the swing model's
    // territory (that's (swing-plan a) above, kept strictly before it) — it's
    // the completion model's OWN "Week 5, nothing done yet but B" state. The
    // ride-minutes behavior this test was really guarding (a session started
    // now trains WEEK 5's plan, not Week 4's) still holds, under the new
    // model's own plan lookup (planForWeekKey/completionWeekSyntheticDate) —
    // only the header/meta TEXT changed ("Round 2 ·"/"R2 ·" left Home and
    // pre-log, §2.4).
    await mockDate(page, '2026-09-27T09:00:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
      swingLog('sat-b', '2026-09-26T19:30:00.000Z', 'B'),
    ]);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toHaveText('Week 5');
    await page.locator('button[data-workout="A"]').click();
    await expect(page.locator('.prelog-meta')).toContainText('Week 5');
    await expect(page.locator('.prelog-meta')).not.toContainText("'s plan");
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.exercise-name')).toHaveText('Cardio');
    await expect(page.locator('.exercise-reps')).toHaveText('12 min'); // Week 5's ride
  });

  test.describe('WK2 (Sep 27 2026): the completion-based week model', () => {
    // Her words that drove this: 21:32 "it says week 5 on top … I'm in week 4",
    // 22:18 "I need b back for 5", 23:08 "how do I see week four?".

    test('a doneToday from BEFORE the launch reads the OLD model\'s line, not "0 of 3 in Week 5" (checker\'s nice #1)', async ({
      page,
    }) => {
      // Her real Sat Sep 26 22:14 B closed the OLD model's Week 4 — but "now"
      // here is 23:00, already past the 22:30 launch. Before the fix, the
      // completion model (which filters this session out entirely) fell
      // through to "0 of 3 in Week 5", a week the session never touched.
      await mockDate(page, '2026-09-26T20:00:00.000Z'); // Sat Sep 26, 23:00 Israel
      await seedLogs(page, [
        swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
        swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
        swingLog('sat-b', '2026-09-26T19:14:51.000Z', 'B'), // 22:14 local — before the 22:30 launch
      ]);
      await page.goto('/');
      // WK2 fix r2 (Sep 27 2026, checker's nice #1): this real moment closed
      // the OLD model's Week 4 AND opened the new model's Week 5 at once — it
      // deserves the same second line the doneTodayClosedSpan branch already
      // gives a completion-model close ("Week N starts now" / "opens ...").
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 4 done · 3 of 3 ✓',
        'Week 5 starts now',
      ]);
    });

    test('Home on Week 5 day 3, one session (A) done: sub-line, count, Up next = B, one chip (C)', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-28T10:00:00.000Z'); // day 3 (opened Sat Sep 26)
      await seedLogs(page, [swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A')]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 5');
      await expect(page.locator('.week-sub-line').first()).toHaveText('since Sat Sep 26 · day 3');
      await expect(page.locator('.week-line')).toHaveText('1 of 3 · B and C left');
      await expect(page.locator('.week-card .week-dot')).toHaveCount(3);
      await expect(page.locator('.week-card .dot-A')).toHaveCount(1);
      await expect(page.locator('button.home-hero[data-workout="B"]')).toContainText('Up next');
      await expect(page.locator('.home-chips .home-chip')).toHaveCount(1);
      await expect(page.locator('.home-chips .home-chip')).toHaveText('C · Cardio');
      // No "‹ Week 4" yet — she hasn't tapped it (that's its own test below).
    });

    test('post-log line: "2 of 3 in Week 5" mid-workout, then the Done card after Save', async ({
      page,
    }) => {
      await movableClock(page, '2026-09-28T08:00:00.000Z'); // Mon, day 3
      await seedLogs(page, [swingLog('wk5-b', '2026-09-27T15:00:00.000Z', 'B')]);
      await page.goto('/');
      await page.locator('button[data-workout="A"]').click();
      await page.locator('#begin').click();
      await page.locator('#ww-elliptical').click();
      await page.locator('#start-timed').click();
      await advanceClock(page, 10 * 60_000 + 2_000);
      await page.locator('#next').click();
      await page.locator('#ell-km').fill('1.4');
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        if (!(await tapForward(page))) break;
      }
      await expect(page.locator('.postlog-witness')).toContainText('2 of 3 in Week 5');
      await page.locator('#save-log').click();
      await expect(page.locator('.home-done-line')).toHaveText('2 of 3 in Week 5 · C left');
    });

    test('post-log line: a REPEAT letter (B again) still reads "1 of 3", never overcounts to "2 of 3"', async ({
      page,
    }) => {
      // WK2 fix r1 (Sep 27 2026, checker's should #2): `.done.length + 1`
      // always added one, so repeating B here used to say "2 of 3" while Home
      // and the Done card (distinct-letter counters) both correctly say "1".
      await movableClock(page, '2026-09-28T08:00:00.000Z'); // Mon, day 3
      await seedLogs(page, [swingLog('wk5-b', '2026-09-27T15:00:00.000Z', 'B')]);
      await page.goto('/');
      // B already closed the week's own "done" set, so Home offers no button
      // for it (§2.4: chips are the OTHER MISSING letters only) — the repeat
      // is reached through startWorkout() directly, the same function a tap
      // would call, via the test-only hook (see its own app.ts comment).
      await page.evaluate(() =>
        (window as unknown as { __wtStartWorkout: (id: string) => void }).__wtStartWorkout('B')
      );
      await page.locator('#begin').click();
      await page.locator('#ww-elliptical').click();
      await page.locator('#start-timed').click();
      await advanceClock(page, 10 * 60_000 + 2_000);
      await page.locator('#next').click();
      await page.locator('#ell-km').fill('1.4');
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        if (!(await tapForward(page))) break;
      }
      await expect(page.locator('.postlog-witness')).toContainText('1 of 3 in Week 5');
      await expect(page.locator('.postlog-witness')).not.toContainText('2 of 3');
      await page.locator('#save-log').click();
      await expect(page.locator('.home-done-line')).toHaveText('1 of 3 in Week 5 · A and C left');
    });

    test('a closing save mid-week (Tue): "Week 5 done · 3 of 3 ✓" then "Week 6 opens" the next Sat/Sun', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-29T16:00:00.000Z'); // Tue Sep 29 — not a Sat/Sun
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // today — the closing save
      ]);
      await page.goto('/');
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 5 done · 3 of 3 ✓',
        'Week 6 opens Sat Oct 3',
      ]);
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // WK2 fix r1 (Sep 27 2026, checker's should #1): said ONCE, truthfully —
      // a session logged before Week 6 actually opens counts back as an extra
      // for Week 5 (week.ts rule 3), not toward Week 6's own count.
      await expect(page.locator('.week-sub-line').first()).toHaveText(
        'opens Sat Oct 3 · a session before then counts as an extra for Week 5'
      );
      await expect(page.locator('.week-line')).toHaveText('0 of 3 · A, B and C to go');
      // WK2 fix r2 (Sep 27 2026, checker's should #2): the chip lead used to
      // always say "Week 6 ·" here even though a tap on any of these chips
      // right now would actually count BACKWARD as an extra rep into Week 5
      // (week.ts rule 3, same gap the sub-line above already names truthfully)
      // — the exact class of bug the v52.2 swing fix existed to close, just
      // moved to a new spot. Say the truth the tap will actually produce.
      await expect(page.locator('.home-chips-lead')).toHaveText('Week 5 ·');
      await expect(page.locator('.home-chips .home-chip')).toHaveCount(3);
    });

    test('during the gap, pre-log and post-log say the truth: this session is an extra for the CLOSED week, not the pending one', async ({
      page,
    }) => {
      // WK2 fix r1 (checker's should #1 exact repro): Week 5 closes Tue, it's
      // now Thu — nothing logged yet today. Before the fix, pre-log/post-log
      // both named the PENDING week ("Week 6 · same moves as Week 5", "1 of 3
      // in Week 6") even though week.ts would actually count today's save
      // backward into the already-closed Week 5 as an extra rep.
      await mockDate(page, '2026-10-01T10:00:00.000Z'); // Thu Oct 1 — mid-gap
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // Tue — closed Week 5
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      await page.locator('button[data-workout="A"]').click();
      // The Week 6 DATE is still said (when it opens) — what must never
      // happen is a claim that this save counts TOWARD Week 6.
      await expect(page.locator('.prelog-meta')).toContainText('Week 5 · an extra rep');
      await expect(page.locator('.prelog-meta')).not.toContainText('in Week 6');
      await page.locator('#begin').click();
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        if (!(await tapForward(page))) break;
      }
      await expect(page.locator('.postlog-witness')).toContainText('an extra for Week 5');
      await expect(page.locator('.postlog-witness')).not.toContainText('in Week 6');
    });

    test('a closing save that lands ON a Sat/Sun: "Week 6 starts now", not a gap', async ({
      page,
    }) => {
      await mockDate(page, '2026-10-03T16:00:00.000Z'); // Sat Oct 3 — an anchor day itself
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-10-03T15:00:00.000Z', 'C'), // today, Saturday — closes AND opens
      ]);
      await page.goto('/');
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 5 done · 3 of 3 ✓',
        'Week 6 starts now',
      ]);
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      await expect(page.locator('.week-sub-line').first()).toHaveText('since Sat Oct 3 · day 1');
      await expect(page.locator('.week-line')).toHaveText('0 of 3 · A, B and C to go');
    });

    test('"‹ Week 4" peeks at the OLD model\'s last week (nothing has closed under the new one yet); "Week 5 ›" returns', async ({
      page,
    }) => {
      // The very first thing the new model can show her — her literal 23:08
      // ask ("how do I see week four?") was made on exactly this state.
      await mockDate(page, '2026-09-27T10:00:00.000Z'); // Sun, day 2 — Week 5 still empty
      await seedLogs(page, [
        swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
        swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
        swingLog('sat-b', '2026-09-26T19:14:51.000Z', 'B'), // her real Week 4 close
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 5');
      const back = page.locator('#week-nav-back');
      await expect(back).toHaveText('‹ Week 4');
      await back.click();
      // WK2 fix r1 (checker's should #5): the peek is read-only — it changes
      // only the week CARD's head, never the page title (the hero right below
      // it is still offering Week 5's own workout the whole time).
      await expect(page.locator('.home-header h1')).toHaveText('Week 5');
      await expect(page.locator('.week-card-range')).toHaveText('Week 4');
      await expect(page.locator('.week-line')).toHaveText('3 of 3 ✓');
      await expect(page.locator('.week-card .week-dot')).toHaveCount(8);
      const forward = page.locator('#week-nav-forward');
      await expect(forward).toHaveText('Week 5 ›');
      await forward.click();
      await expect(page.locator('.home-header h1')).toHaveText('Week 5');
      await expect(page.locator('.week-card-range')).toHaveText('Week 5');
      await expect(page.locator('#week-nav-back')).toHaveText('‹ Week 4');
    });

    test('"‹ Week 4" stays pinned to Week 4 even once "today" drifts past it (checker\'s must #2 repro)', async ({
      page,
    }) => {
      // Her 42 live rows plus A on Mon Sep 28 and B on Wed Sep 30, clock set to
      // Sat Oct 3 — Week 5 is still open at day 8 (canMoveOn's own threshold).
      // Before the fix, the legacy fallback read `saturdayForOffset(1)` off
      // THIS "today" (Oct 3), landing on Sep 26 = Week 5 itself, so the peek
      // read "‹ Week 5" while she's still IN Week 5 — the exact confusion this
      // model exists to fix. It must stay pinned to the real last-closed week
      // (Week 4) regardless of how long Week 5 stays open.
      await mockDate(page, '2026-10-03T13:00:00.000Z'); // Sat Oct 3, day 8
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-28T15:00:00.000Z', 'A'), // Mon
        swingLog('wk5-b', '2026-09-30T15:00:00.000Z', 'B'), // Wed
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 5');
      const back = page.locator('#week-nav-back');
      await expect(back).toHaveText('‹ Week 4');
      await back.click();
      await expect(page.locator('.home-header h1')).toHaveText('Week 5'); // title never moves off the live week
      await expect(page.locator('.week-card-range')).toHaveText('Week 4');
      // No sessions were seeded IN Week 4 itself (Sep 19-25) this time — the
      // fixed anchor still resolves it correctly, it just has nothing logged.
      await expect(page.locator('.week-line')).toHaveText('0 of 3');
    });

    test('once a NEW week has closed, "‹ Week 4" becomes "‹ Week 5" (the completion model\'s own, not the legacy fallback)', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-30T10:00:00.000Z'); // Wed — no log today, Up next hero shows
      await seedLogs(page, [
        // Her real pre-launch Week 4 (kept, so the fallback is available too —
        // it must NOT win once Week 5 itself has closed).
        swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
        swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
        swingLog('sat-b', '2026-09-26T19:14:51.000Z', 'B'),
        // Week 5, closed under the new model.
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'),
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      const back = page.locator('#week-nav-back');
      await expect(back).toHaveText('‹ Week 5');
      await back.click();
      await expect(page.locator('.home-header h1')).toHaveText('Week 6'); // title stays on the live week
      await expect(page.locator('.week-card-range')).toHaveText('Week 5');
      await expect(page.locator('.week-line')).toHaveText('3 of 3 ✓');
    });

    test('week strip: a repeat day gets a small "2" badge, and an 11-day short week folds its empty middle', async ({
      page,
    }) => {
      // WK2 fix r1 (Sep 27 2026, checker's should #4). Week 5 opens Sat Sep 26
      // (day 1, A logged) and is STILL short at day 11 (Tue Oct 6) — two
      // sessions land on Oct 6 itself (B, then a repeat B). Before the fix,
      // the strip capped at the last 10 days and simply dropped day 1 (an
      // actual session day), and a repeat day showed only its first letter.
      await mockDate(page, '2026-10-06T13:00:00.000Z'); // day 11
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-26T19:30:00.000Z', 'A'), // day 1 — must survive the fold
        swingLog('wk5-b1', '2026-10-06T10:00:00.000Z', 'B'), // day 11, first
        swingLog('wk5-b2', '2026-10-06T15:00:00.000Z', 'B'), // day 11, repeat
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 5');
      await expect(page.locator('.week-line')).toHaveText('2 of 3 · C left');
      // Day 1 (A) kept, ONE fold column for the empty middle, then the last
      // 7 days (days 5-11) kept whole — 8 real day columns + 1 fold.
      await expect(page.locator('#week-strip .week-dot')).toHaveCount(8);
      await expect(page.locator('#week-strip .week-fold-col')).toHaveCount(1);
      await expect(page.locator('#week-strip .dot-A').first()).toBeVisible();
      const repeatDay = page.locator('#week-strip .week-dot.is-today');
      await expect(repeatDay.locator('.week-dot-count')).toHaveText('2');
    });

    test("REAL parity (GATE 2, checker's should #6): her 14 real weeks are each exactly 3 of 3 under the LIVE attributeSessionsToWeeks", async ({
      page,
    }) => {
      // WK2 fix r1 (Sep 27 2026). tests/week.test.ts's own "REAL parity" test
      // can only prove week.ts never touches her pre-launch rows — app.ts
      // isn't Node-importable (DOM + localStorage throughout), so it can't
      // compare against the OLD model's real attribution from there. This
      // runs the actual live attributeSessionsToWeeks (via the __wt test
      // hook, same pattern as every other pure-function hook above) over her
      // real 42 rows and freezes the per-week table GATE 2 asked for: 10
      // Round-1 weeks + Round-2 Weeks 1-4, each 3 of 3, A→B→C.
      const her42RealRows = [
        { id: 'S1', date: '2026-05-02T19:00:00+00:00', workout: 'A' },
        { id: 'S2', date: '2026-05-05T17:05:28.158+00:00', workout: 'B' },
        { id: 'S3', date: '2026-05-08T12:40:19.438+00:00', workout: 'C' },
        { id: 'S4', date: '2026-05-11T17:29:18.803+00:00', workout: 'A' },
        { id: 'S5', date: '2026-05-14T16:54:22.183+00:00', workout: 'B' },
        { id: 'S6', date: '2026-05-15T15:15:29.83+00:00', workout: 'C' },
        { id: 'S7', date: '2026-05-19T16:53:03.373+00:00', workout: 'A' },
        { id: 'S8', date: '2026-05-20T19:32:46.138+00:00', workout: 'B' },
        { id: 'S9', date: '2026-05-21T14:31:56.384+00:00', workout: 'C' },
        { id: 'S10', date: '2026-05-26T18:20:30.352+00:00', workout: 'A' },
        { id: 'S11', date: '2026-05-28T17:00:00+00:00', workout: 'B' },
        { id: 'S12', date: '2026-05-29T11:09:16.001+00:00', workout: 'C' },
        { id: 'S13', date: '2026-06-03T15:04:22.483+00:00', workout: 'A' },
        { id: 'S14', date: '2026-06-04T12:39:57.74+00:00', workout: 'B' },
        { id: 'S15', date: '2026-06-05T15:05:47.998+00:00', workout: 'C' },
        { id: 'S16', date: '2026-06-09T17:54:47.191+00:00', workout: 'A' },
        { id: 'S17', date: '2026-06-11T17:29:07.923+00:00', workout: 'B' },
        { id: 'S18', date: '2026-06-12T04:44:37.836+00:00', workout: 'C' },
        { id: 'S19', date: '2026-06-16T15:31:58.887+00:00', workout: 'A' },
        { id: 'S20', date: '2026-06-17T18:21:07.205+00:00', workout: 'B' },
        { id: 'S21', date: '2026-06-19T14:46:30.22+00:00', workout: 'C' },
        { id: 'S22', date: '2026-06-24T16:18:34.182+00:00', workout: 'A' },
        { id: 'S23', date: '2026-06-25T15:42:11.092+00:00', workout: 'B' },
        { id: 'S24', date: '2026-06-26T15:00:18.015+00:00', workout: 'C' },
        { id: 'S25', date: '2026-07-01T17:25:08.83+00:00', workout: 'A' },
        { id: 'S26', date: '2026-07-02T18:29:43.471+00:00', workout: 'B' },
        { id: 'S27', date: '2026-07-03T14:55:26.462+00:00', workout: 'C' },
        { id: 'S28', date: '2026-07-07T14:58:23.734+00:00', workout: 'A' },
        { id: 'S29', date: '2026-07-09T19:13:21.69+00:00', workout: 'B' },
        { id: 'S30', date: '2026-07-10T15:48:51.751+00:00', workout: 'C' },
        { id: 'S31', date: '2026-08-30T16:48:14.744+00:00', workout: 'A' },
        { id: 'S32', date: '2026-09-03T15:00:00+00:00', workout: 'B' },
        { id: 'S33', date: '2026-09-04T14:22:39.062+00:00', workout: 'C' },
        { id: 'S34', date: '2026-09-07T15:00:00+00:00', workout: 'A' },
        { id: 'S35', date: '2026-09-11T15:07:03.104+00:00', workout: 'B' },
        { id: 'S36', date: '2026-09-11T15:25:26.058+00:00', workout: 'C' },
        { id: 'S37', date: '2026-09-14T15:50:35.507+00:00', workout: 'A' },
        { id: 'S38', date: '2026-09-18T15:02:34.467+00:00', workout: 'B' },
        { id: 'S39', date: '2026-09-19T19:21:30.241+00:00', workout: 'C' },
        { id: 'S40', date: '2026-09-24T15:56:36.82+00:00', workout: 'A' },
        { id: 'S41', date: '2026-09-25T11:53:48.879+00:00', workout: 'C' },
        { id: 'S42', date: '2026-09-26T19:14:51.421+00:00', workout: 'B' },
      ];

      await page.goto('/');
      const summary = await page.evaluate((logs) => {
        const fn = (
          window as unknown as {
            __wtWeekAttributionSummary: (
              l: { id: string; date: string; workout: string }[]
            ) => { saturdayIso: string; count: number; letters: string[] }[];
          }
        ).__wtWeekAttributionSummary;
        return fn(logs);
      }, her42RealRows);

      expect(summary).toHaveLength(14); // 10 Round-1 weeks + 4 Round-2 weeks
      for (const week of summary) {
        expect(week.count).toBe(3);
        // Chronological order isn't always A-then-B-then-C (her real Round-2
        // Week 4 did A, C, then the swung B) — what GATE 2 actually asks is
        // that each week has all three DISTINCT letters, not a fixed order.
        expect([...week.letters].sort()).toEqual(['A', 'B', 'C']);
      }
      expect(summary.reduce((sum, week) => sum + week.count, 0)).toBe(42);
    });

    test("during the gap, the workout actually TRAINS the closed week's plan too, not just its label (checker's should #2)", async ({
      page,
    }) => {
      // WK2 fix r2 (Sep 27 2026, checker's should #2): the test above proves
      // pre-log/post-log's TEXT already says the truth — this proves the
      // CONTENT does too (planDateNow, and getCurrentWorkout's unpinned
      // fallback, both used to read the PENDING week's key during a gap). A
      // real Round-2 Week-6 PROGRAM row doesn't exist yet, so before this fix
      // Week 6 silently repeated Week 5's own moves either way — invisible
      // until a real row lands. A clearly-marked fake row makes the two
      // weeks' content provably different, so this can't pass by accident.
      await mockDate(page, '2026-10-01T10:00:00.000Z'); // Thu Oct 1 — mid-gap
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // Tue — closed Week 5
      ]);
      await page.goto('/');
      await page.evaluate(() => {
        (
          window as unknown as {
            __wtInjectMarkerProgramWeek: (
              round: number,
              week: number,
              startsOn: string,
              workoutId: string,
              marker: string
            ) => void;
          }
        ).__wtInjectMarkerProgramWeek(2, 6, '2026-10-03', 'A', 'TEST-MARKER-WEEK6');
      });
      await page.locator('button[data-workout="A"]').click();
      await expect(page.locator('.prelog-meta')).toContainText('Week 5 · an extra rep');
      // The PREVIEW (before Start is even tapped) must already agree with
      // that label — not just the workout once it begins.
      await page.locator('.prelog-overview-summary').click();
      await expect(page.locator('.prelog-overview')).not.toContainText('TEST-MARKER-WEEK6');
      await page.locator('#begin').click();
      await expect(page.locator('.exercise-name')).not.toHaveText('TEST-MARKER-WEEK6');
    });

    test('the pinned plan survives an app close — even once a background sync closes the week under it (§2.8 item 4)', async ({
      page,
      context,
    }) => {
      // WK2 fix r2 (Sep 27 2026, checker's should #3 / §2.8 item 4): no test
      // covered "the pinned plan survives midnight and an app close" —
      // week.test.ts #7 was repurposed for ties (week.ts's own comment), and
      // nothing in tests/ asserted pinnedPlanDateIso across a reload. Week 5
      // is open with A and C already done (B missing) — she starts B, pinning
      // Week 5's plan. While her session sits open (unsaved), a background
      // sync lands a SECOND, earlier B (a queued offline write from another
      // day flushing, or a second phone) — completing A+B+C and closing
      // Week 5 out from under her, with no action of her own. A fake
      // Round-2 Week-6 row (a real one doesn't exist yet) makes the two
      // weeks' content provably different, same as the test above.
      await mockDate(page, '2026-09-28T10:00:00.000Z'); // Mon, day 3 — Week 5 still open
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-c', '2026-09-27T16:00:00.000Z', 'C'),
      ]);
      await page.goto('/');
      await page.evaluate(() => {
        (
          window as unknown as {
            __wtInjectMarkerProgramWeek: (
              round: number,
              week: number,
              startsOn: string,
              workoutId: string,
              marker: string
            ) => void;
          }
        ).__wtInjectMarkerProgramWeek(2, 6, '2026-10-03', 'B', 'TEST-MARKER-WEEK6');
      });
      await expect(page.locator('button.home-hero[data-workout="B"]')).toContainText('Up next');
      await page.locator('button[data-workout="B"]').click();
      await page.locator('#begin').click();
      const exerciseName = page.locator('.exercise-name');
      await expect(exerciseName).not.toHaveText('TEST-MARKER-WEEK6');
      const beforeText = await exerciseName.textContent();

      // The background sync: a DIFFERENT, already-saved B — closes Week 5
      // without her in-progress one ever saving.
      await page.evaluate(() => {
        const raw = window.localStorage.getItem('workout-tracker:logs');
        const rows: unknown[] = raw ? JSON.parse(raw) : [];
        rows.push({
          id: 'wk5-b-other-device',
          date: '2026-09-28T09:00:00.000Z',
          workout: 'B',
          capacityBefore: 8,
          capacityAfter: 8,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
        });
        window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
      });

      // The app close + reopen — same pattern as the "resume" tests above: a
      // new page in the SAME context keeps the same localStorage, a real PWA
      // reopen does too.
      const reopened = await context.newPage();
      await mockDate(reopened, '2026-09-28T10:05:00.000Z');
      await reopened.goto('/');
      await expect(reopened.locator('.round-indicator')).toBeVisible();
      await expect(reopened.locator('.exercise-name')).toHaveText(beforeText ?? '__never_empty__');
      await expect(reopened.locator('.exercise-name')).not.toHaveText('TEST-MARKER-WEEK6');
      await reopened.close();
    });
  });

  test('(f) the re-homed pieces: week card → Weekly review › Week by week; Gear in Settings; Past weeks in Progress', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, thirtyNine());
    await page.goto('/');
    await page.locator('#open-weekly-review').click();
    await expect(page.locator('h2').first()).toContainText('This week');
    const wbw = page.locator('details.consistency-wrap');
    await expect(wbw.locator('.next-week-summary-label')).toHaveText('Week by week');
    await expect(wbw).toHaveJSProperty('open', false);
    await page.locator('#back-home').click();
    await page.locator('#open-settings').click();
    await expect(page.locator('.settings-screen .gear-card')).toContainText('Gear');
    // The auto-suggest switch went with the tiles (DECISIONS §5).
    await expect(page.locator('#setting-suggest')).toHaveCount(0);
    await page.locator('#back-home').click();
    await page.locator('#open-progress-link').click();
    await expect(page.locator('.program-archive')).toContainText('Past weeks');
    await page.locator('#back-home').click();
    await page.locator('#view-history').click();
    await expect(page.locator('.history-row')).toHaveCount(39);
  });

  test('(f) the week card opens from the keyboard too', async ({ page }) => {
    await page.locator('#open-weekly-review').focus();
    await page.keyboard.press('Enter');
    // WK4 (Sep 27 2026): real "now" (no mockDate here) reads the completion
    // model's live page — "Week 5", never "This week" (see the ship-4 "reachable
    // from home button" test's own comment).
    await expect(page.locator('h2').first()).toContainText('Week 5');
  });

  test('(h) the walk row: "4,210 steps today" only when Fit answered; one row, no paragraph', async ({
    page,
  }) => {
    const walk = page.locator('.walk-card');
    await expect(page.locator('#log-walk-start')).toHaveText('🚶 Start a walk');
    await expect(walk).not.toContainText(/steps/i);
    await expect(walk.locator('p')).toHaveCount(0);
    await page.evaluate(() =>
      (window as unknown as { __wtSetStepsToday: (n: number) => void }).__wtSetStepsToday(4210)
    );
    await expect(walk.locator('.walk-text')).toHaveText('4,210 steps today');
    await page.locator('#log-walk-start').click();
    await expect(page.locator('#finish-walk')).toHaveText('■ Done');
    await page.locator('#finish-walk').click();
    await expect(walk.locator('.walk-text')).toHaveText('1 this week · 4,210 steps today');
  });
});

// --- v48 P5 · logs (Sep 24 2026) ---------------------------------------------
// DECISIONS-v48 §1 Q6, §4 (2 kg row), §5 Pre-log / Post-log rows. The body
// reading is 1-10 tap chips, BLANK until she taps (the v46 fix against the
// invented 5); one quiet line + one wrist line on pre-log; one-tap back
// ("Fine / Something"); one note box; a way back to the stretches; one-tap arm
// feel on the 1 kg moves, and home ASKS about 2 kg (her Jul 3 ask) — a
// question, never a tell.
test.describe('v48 P5 logs', () => {
  type Row = Record<string, unknown>;
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4
  const THU_WEEK4 = '2026-09-24T15:00:00.000Z';

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };

  const tapForward = async (page: Page): Promise<boolean> => {
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
  };

  const goToStep = async (page: Page, name: string): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      const now =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (now === name) return;
      if (!(await tapForward(page))) break;
    }
    throw new Error(`never reached ${name}`);
  };

  const toPostLog = async (page: Page): Promise<void> => {
    for (let i = 0; i < 80; i++) {
      if (await page.locator('#save-log').isVisible()) break;
      if (!(await tapForward(page))) break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
  };

  const readLogs = async (page: Page): Promise<Row[]> => {
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    return JSON.parse(raw ?? '[]') as Row[];
  };

  const saveAndRead = async (page: Page): Promise<Row> => {
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = await readLogs(page);
    expect(logs.length).toBe(1);
    return logs[0]!;
  };

  const logRow = (id: string, date: string, armFeel: string | null): Row => ({
    id,
    date,
    workout: 'A',
    capacityBefore: 7,
    capacityAfter: 7,
    wallSitSec: 45,
    backPain: 0,
    word: '',
    armFeel,
    synced: true,
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(a) pre-log: blank chips, one quiet line, Start in the fold on A, B and C with Lite on and off', async ({
      page,
    }) => {
      await mockDate(page, TUE_WEEK4);
      await page.goto('/');
      for (const id of ['A', 'B', 'C'] as const) {
        await page.locator(`button[data-workout="${id}"]`).click();
        await expect(page.locator('.screen-header h2')).toHaveText(`Workout ${id}`);
        await expect(page.locator('.prelog-header .subtitle-inline')).not.toBeEmpty();
        await expect(page.locator('.prelog-meta')).toContainText('R2 · Week 4');
        await expect(page.locator('.prelog-meta')).toContainText('min');
        await expect(page.locator('[data-body-chip="cap-before"]')).toHaveCount(10);
        await expect(page.locator('[data-body-chip][aria-checked="true"]')).toHaveCount(0);
        await expect(page.locator('.warning-banner')).toHaveCount(0);
        expect((await page.locator('#app').innerText()).toLowerCase()).not.toContain(
          'how do you feel'
        );
        // Chips: >= 56 × 48, two rows of five.
        const one = (await page.locator('#cap-before-1').boundingBox())!;
        const six = (await page.locator('#cap-before-6').boundingBox())!;
        expect(one.width).toBeGreaterThanOrEqual(56);
        expect(one.height).toBeGreaterThanOrEqual(48);
        expect(six.y).toBeGreaterThan(one.y);
        for (const liteOn of [false, true]) {
          if (liteOn) await page.locator('#lite-toggle').click();
          const begin = (await page.locator('#begin').boundingBox())!;
          expect(begin.y + begin.height).toBeLessThanOrEqual(915);
          // Everything she decides on sits above the pinned bar, no scroll.
          // T1 (Sep 27 2026): the start-time "Right?" row (§3.1) added real,
          // intended height here, enough to push the Lite chip ~17px past
          // the exact floor below on Workout A specifically (its own longer
          // "new tonight: X · again: Y" meta line stacked with the new row).
          // T1 fix r1 (checker's should #3): the original commit widened
          // this floor by +24px instead of finding the height back — that
          // hid a real overlap (the Lite chip's bottom clipped under the
          // action bar, see shots/T1/1). Fixed properly by tightening the
          // pre-log's own margins (.prelog-header/.prelog-meta/
          // .prelog-overview/.body-card in styles.css) instead: the exact
          // floor is back, never loosened.
          const bar = (await page.locator('.action-bar').boundingBox())!;
          const lite = (await page.locator('#lite-toggle').boundingBox())!;
          expect(lite.y + lite.height).toBeLessThanOrEqual(bar.y);
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
        }
        await expect(page.locator('#lite-toggle')).toContainText('✓ Lite');
        await page.locator('#back-home').click();
      }
    });
  });

  test("(a) the wrist + back line shows on A and not on C; What's in it is one closed row", async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await expect(page.locator('.safety-line')).toHaveText(
      'Wrist + back: pressure fine, pain = stop.'
    );
    await expect(page.locator('.prelog-meta')).toContainText('new tonight: supported split squat');
    const fold = page.locator('details.prelog-overview');
    await expect(fold).toHaveJSProperty('open', false);
    await expect(fold.locator('summary')).toHaveText("What's in it");
    await page.locator('#back-home').click();
    await page.locator('button[data-workout="C"]').click();
    await expect(page.locator('.safety-line')).toHaveCount(0);
  });

  test('(a) chip 7 then Start saves capacityBefore 7; untouched saves null', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#cap-before-7').click();
    await expect(page.locator('#cap-before-7')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#begin').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['capacityBefore']).toBe(7);
    // …and a session where she taps nothing saves null (v46 intent kept). A
    // fresh load (storage cleared): C is done today, so home has no C chip.
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    const blank = await saveAndRead(page);
    expect(blank['capacityBefore']).toBeNull();
    expect(blank['capacityAfter']).toBeNull();
    expect(blank['backPain']).toBeNull();
  });

  test('(b) a body reading of 2 SUGGESTS Lite (outline) but never switches it on', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await expect(page.locator('#lite-toggle')).not.toHaveClass(/lite-suggest/);
    await page.locator('#cap-before-2').click();
    await expect(page.locator('#lite-toggle')).toHaveClass(/lite-suggest/);
    await expect(page.locator('#lite-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#lite-toggle')).toContainText(
      'Hard day? Lite — one round, still counts'
    );
    await page.locator('#begin').click();
    await expect(page.locator('.round-indicator')).not.toContainText('lite');
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['liteDay']).toBe(false);
    expect(log['capacityBefore']).toBe(2);
  });

  test('(b) once Lite is on, the outline goes and the chip says how to undo it', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#cap-before-3').click();
    await page.locator('#lite-toggle').click();
    await expect(page.locator('#lite-toggle')).toHaveText('✓ Lite · 1 round today · tap to undo');
    await expect(page.locator('#lite-toggle')).not.toHaveClass(/lite-suggest/);
    await page.locator('#lite-toggle').click();
    await expect(page.locator('#lite-toggle')).toHaveClass(/lite-suggest/);
  });

  test('(c) post-log on C has no wall-sit field', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    await expect(page.locator('#wallsit')).toHaveCount(0);
    await expect(page.locator('#app')).not.toContainText('Wall sit');
  });

  test('(c) post-log on A after a held wall sit: the field is pre-filled with the real seconds', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await advanceClock(page, 30_000);
    await expect(page.locator('.timer-pip-time')).toHaveText('15'); // v53: reads off the pip now
    await page.locator('#timer-pip').click();
    await page.locator('#stop-timed').click();
    await toPostLog(page);
    await expect(page.locator('#wallsit')).toHaveValue('30');
    await expect(page.locator('.postlog-card')).toContainText('Wall sit 30 s (tap to adjust)');
    // A chip tap re-renders the screen — an edited number survives it.
    await page.locator('#wallsit').fill('33');
    await page.locator('#cap-after-6').click();
    await expect(page.locator('#wallsit')).toHaveValue('33');
    const log = await saveAndRead(page);
    expect(log['wallSitSec']).toBe(33);
    expect(log['capacityAfter']).toBe(6);
  });

  test('(d) back: "Fine" saves 0', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    await expect(page.locator('#back-1')).toHaveCount(0);
    await page.locator('#back-fine').click();
    await expect(page.locator('#back-fine')).toHaveAttribute('aria-pressed', 'true');
    const log = await saveAndRead(page);
    expect(log['backPain']).toBe(0);
  });

  test('(d) back: untouched saves null; "Fine" tapped twice is untouched again', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    await page.locator('#back-fine').click();
    await page.locator('#back-fine').click();
    await expect(page.locator('#back-fine')).toHaveAttribute('aria-pressed', 'false');
    const log = await saveAndRead(page);
    expect(log['backPain']).toBeNull();
  });

  // v53 (Sep 26 2026): the row reads FEEL now ("How does your back feel?",
  // 1 hurts a lot · 10 feels fine) — her fix for "It was the opposite of
  // what it meant". Tapping the "4" chip (feel 4) SAVES pain 6
  // (painFromFeel: pain = 10 − feel), not pain 4. Storage stays pain-shaped.
  test('(d) back: "Something" opens a blank 1-10 row; tapping feel 4 saves pain 6', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    await page.locator('#back-some').click();
    await expect(page.locator('[data-body-chip="back"]')).toHaveCount(10);
    await expect(page.locator('[data-body-chip="back"][aria-checked="true"]')).toHaveCount(0);
    await page.locator('#back-4').click();
    await expect(page.locator('#back-4')).toHaveAttribute('aria-checked', 'true');
    const log = await saveAndRead(page);
    expect(log['backPain']).toBe(6);
  });

  test('(d) back: "Something" opened but no number tapped saves null', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    await page.locator('#back-some').click();
    const log = await saveAndRead(page);
    expect(log['backPain']).toBeNull();
  });

  // v51 (Sep 25 2026): the SAME control, pre-log instead of post-log — her
  // words: "and all metrics bf workout have after as well". Same 4 cases as
  // (d) above, "-pre" ids, backPainBefore/wristPainBefore instead of
  // backPain/wristPain.
  test('(d2) back & wrist BEFORE: "Fine" saves both 0', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await expect(page.locator('#back-before-1')).toHaveCount(0);
    await page.locator('#back-fine-pre').click();
    await expect(page.locator('#back-fine-pre')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#begin').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['backPainBefore']).toBe(0);
    expect(log['wristPainBefore']).toBe(0);
  });

  test('(d2) back & wrist BEFORE: untouched saves null; "Fine" tapped twice is untouched again', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    const blank = await saveAndRead(page);
    expect(blank['backPainBefore']).toBeNull();
    expect(blank['wristPainBefore']).toBeNull();

    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#back-fine-pre').click();
    await page.locator('#back-fine-pre').click();
    await expect(page.locator('#back-fine-pre')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#begin').click();
    await toPostLog(page);
    const untouched = await saveAndRead(page);
    expect(untouched['backPainBefore']).toBeNull();
  });

  // v53 (Sep 26 2026): feel 4 -> pain 6 at the edge, same conversion as the
  // post-log row (renderBackWristControl is shared between the two).
  test('(d2) back BEFORE: "Something" opens a blank 1-10 row; tapping feel 4 saves pain 6', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#back-some-pre').click();
    await expect(page.locator('[data-body-chip="back-before"]')).toHaveCount(10);
    await expect(page.locator('[data-body-chip="back-before"][aria-checked="true"]')).toHaveCount(
      0
    );
    await page.locator('#back-before-4').click();
    await expect(page.locator('#back-before-4')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#begin').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['backPainBefore']).toBe(6);
  });

  // v53 (Sep 26 2026): feel 3 -> pain 7 at the edge.
  test('(d2) wrist BEFORE: "Something" opens a blank 1-10 row; tapping feel 3 saves pain 7, back stays untouched', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#wrist-some-pre').click();
    await page.locator('#wrist-before-3').click();
    await expect(page.locator('#wrist-before-3')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#begin').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['wristPainBefore']).toBe(7);
    expect(log['backPainBefore']).toBeNull();
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    // v51 (Sep 25 2026): the new pre-log Back & wrist control sits between
    // Mood and the Lite chip — must not push Start off the first screen (her
    // walk, uxui, kept alive since v48 P5: "Start is cut off at the bottom").
    test('(d2) pre-log Start stays visible without scrolling on every workout', async ({
      page,
    }) => {
      await mockDate(page, TUE_WEEK4);
      for (const w of ['A', 'B', 'C']) {
        await page.goto('/');
        await page.locator(`button[data-workout="${w}"]`).click();
        const begin = page.locator('.action-bar #begin');
        await expect(begin).toBeVisible();
        const box = (await begin.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(915);
      }
    });

    test('(e) one note box: no #word, the note saves verbatim, Save stays in view while typing', async ({
      page,
    }) => {
      await mockDate(page, TUE_WEEK4);
      await page.goto('/');
      await page.locator('button[data-workout="C"]').click();
      await page.locator('#begin').click();
      await toPostLog(page);
      await expect(page.locator('#word')).toHaveCount(0);
      await expect(page.locator('.postlog-card')).toContainText('Anything about today? (optional)');
      const note = page.locator('#session-note');
      await expect(note).toHaveAttribute('dir', 'auto');
      await expect(note).toHaveAttribute('maxlength', '500');
      await expect(note).toHaveAttribute('enterkeyhint', 'done');
      await note.click();
      await note.pressSequentially('knee fine');
      await expect(note).toBeFocused();
      const save = page.locator('.action-bar #save-log');
      await expect(save).toBeVisible();
      const box = (await save.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(915);
      // Enter = done typing: the field lets go, nothing is saved by itself.
      await note.press('Enter');
      await expect(note).not.toBeFocused();
      await expect(note).toHaveValue('knee fine');
      await expect(page.locator('text=Quick log')).toBeVisible();
      expect(await readLogs(page)).toHaveLength(0);
      const log = await saveAndRead(page);
      expect(log['sessionNote']).toBe('knee fine');
      expect(log['word']).toBe('');
      const p = await page.evaluate(
        (e) =>
          (window as unknown as { __wtSessionPayload: (x: unknown) => Row }).__wtSessionPayload(e),
        log
      );
      expect(p['one_word']).toBeNull();
    });
  });

  test('(e) "‹ Back to the stretches" returns to the cool-down list without saving', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await page.locator('#begin').click();
    await toPostLog(page);
    await page.locator('#session-note').fill('almost done');
    await page.locator('#back-to-stretches').click();
    await expect(page.locator('.stretch-list')).toBeVisible();
    await expect(page.locator('.round-indicator')).toContainText('Stretch ·');
    expect(await readLogs(page)).toHaveLength(0);
    // Done · Finish brings her back to the log with her words still there.
    await page.locator('#next').click();
    await expect(page.locator('#session-note')).toHaveValue('almost done');
    const log = await saveAndRead(page);
    expect(log['sessionNote']).toBe('almost done');
  });

  test('(f) arm feel: Right on the row and Easy on the curl save "curl=easy@1kg;row=right@1kg" (v55: default load)', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Prone row'); // v48 final: display label, key unchanged
    // v54 (Sep 27 2026): CHIP AFTER THE LAST SET — the row says "2 sets", so
    // the Easy/Right/Hard chip waits for both "Set N done" taps first.
    await expect(page.locator('.arm-feel-label')).toHaveText('Set 1 of 2');
    await expect(page.locator('[data-arm-step]')).toHaveCount(0);
    // v55: the LOAD CHIP is there from set 1 — never logged before, so 1 kg.
    await expect(page.locator('[data-arm-load-step="row"][data-arm-load="1kg"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.locator('[data-mark-set="Prone row (bodyweight)"]').click();
    await expect(page.locator('.arm-feel-label').first()).toHaveText('Set 2 of 2');
    await page.locator('[data-mark-set="Prone row (bodyweight)"]').click();
    await expect(page.locator('.arm-feel-label').last()).toHaveText('How did it feel?');
    await page.locator('[data-arm-step="row"][data-arm-feel="right"]').click();
    await expect(page.locator('[data-arm-step="row"][data-arm-feel="right"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Quiet: Done · Next is still the one sage on the step.
    await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
    await goToStep(page, '1 kg biceps curl');
    // v54: same two-set gate on the curl.
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    // Tap Hard, then change her mind: tap Hard again clears, then Easy.
    await page.locator('[data-arm-step="curl"][data-arm-feel="hard"]').click();
    await page.locator('[data-arm-step="curl"][data-arm-feel="hard"]').click();
    await expect(page.locator('[data-arm-step="curl"][aria-pressed="true"]')).toHaveCount(0);
    await page.locator('[data-arm-step="curl"][data-arm-feel="easy"]').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBe('curl=easy@1kg;row=right@1kg');
  });

  test('(f) v55: reps text says "1–2 kg (your pick)", never a fixed 1 kg, for both loaded moves', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Prone row');
    await expect(page.locator('.exercise-reps')).toContainText('1–2 kg (your pick)');
    await goToStep(page, '1 kg biceps curl');
    await expect(page.locator('.exercise-reps')).toContainText('1–2 kg (your pick)');
  });

  test('(f) arm feel: no tap on either move saves null; no chips (feel or load) on other moves', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Wall angels');
    await expect(page.locator('.arm-feel')).toHaveCount(0);
    await expect(page.locator('.arm-load-row')).toHaveCount(0);
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBeNull();
  });

  // v55 (Sep 27 2026) — LOAD CHIP replaces the retired "Ask Lisa about 2 kg?"
  // card (her rule 8e, "Get rid of Lisa. I decide based on pain."). She has
  // 2 kg now (20:08).
  test('(f) LOAD CHIP: tap 2 kg on the row saves "@2kg"; the curl stays at its own default (1 kg)', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Prone row');
    await page.locator('[data-arm-load-step="row"][data-arm-load="2kg"]').click();
    await expect(page.locator('[data-arm-load-step="row"][data-arm-load="2kg"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Still selected on set 2 — one pick carries through both sets, not
    // reset per tap.
    await page.locator('[data-mark-set="Prone row (bodyweight)"]').click();
    await expect(page.locator('[data-arm-load-step="row"][data-arm-load="2kg"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.locator('[data-mark-set="Prone row (bodyweight)"]').click();
    await page.locator('[data-arm-step="row"][data-arm-feel="easy"]').click();
    await goToStep(page, '1 kg biceps curl');
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-arm-step="curl"][data-arm-feel="right"]').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBe('curl=right@1kg;row=easy@2kg');
  });

  test('(f) LOAD CHIP: defaults to last used, not always 1 kg', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    // Her last logged curl was @2kg — the default this session should pick
    // that up, per spec ("default = last used, initially 1 kg").
    await seedLogs(page, [logRow('s1', '2026-09-19T15:00:00.000Z', 'curl=easy@2kg')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, '1 kg biceps curl');
    await expect(page.locator('[data-arm-load-step="curl"][data-arm-load="2kg"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('(f) v55: no "Ask Lisa" card exists any more, no matter how many easy sessions in a row', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      logRow('s1', '2026-09-19T15:00:00.000Z', 'curl=easy@1kg'),
      logRow('s2', '2026-09-22T15:00:00.000Z', 'curl=easy@1kg;row=easy@1kg'),
      logRow('s3', '2026-09-23T15:00:00.000Z', null),
    ]);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toBeVisible();
    await expect(page.locator('#twokg-card')).toHaveCount(0);
    await expect(page.locator('#app')).not.toContainText('Ask Lisa');
  });

  // v55 — the pace rule from training-review v2 item 5, said once (this
  // device, ever), only on the curl step (the one it's actually about).
  test('(f) the pace-rule caption shows once on the curl step, then never again', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Prone row');
    // Not the curl's own rule — the row step never shows it.
    await expect(page.locator('.arm-load-pace-rule')).toHaveCount(0);
    await goToStep(page, '1 kg biceps curl');
    await expect(page.locator('.arm-load-pace-rule')).toHaveText(
      'Easy twice at 15 slow reps + pain gone by morning → try 2 kg on the first set.'
    );
    // Any interaction re-renders the step — it's seen now, so it's gone.
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await expect(page.locator('.arm-load-pace-rule')).toHaveCount(0);
  });
});

// --- v48 P6 · the mirror stops misreporting her (Sep 24 2026) -----------------
// DECISIONS-v48 §2 #5-6, §5 Weekly review / Sessions / Progress / Settings rows.
// Her words today: "really challenge everything … dont take anything at face
// value". The review compares only closed weeks and prints its units; back pain
// is amber only at her own 3/10 line; one session row everywhere, and Back goes
// where she came from; Progress reports where she IS (latest, by date), with no
// chart of invented numbers; Settings loses the switch nobody used.
test.describe('v48 P6 mirror', () => {
  type Row = Record<string, unknown>;
  const THU_WEEK4 = '2026-09-24T15:00:00.000Z'; // Thu inside R2 Week 4 (Sat Sep 19 – Fri Sep 25)

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };
  const log = (id: string, date: string, workout: 'A' | 'B' | 'C', extra: Row = {}): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: workout === 'A' ? 45 : 0,
    backPain: 0,
    word: '',
    synced: true,
    durationSec: 2400,
    ...extra,
  });

  // This week: Sun + Tue. Last week (R2 W3): Sun, Tue, Thu. The week before
  // (R2 W2): Sun, Tue — so "last week" has something to be compared against.
  const threeWeeks = (): Row[] => [
    log('w4a', '2026-09-20T15:00:00.000Z', 'A'),
    log('w4b', '2026-09-22T15:00:00.000Z', 'B'),
    log('w3a', '2026-09-13T15:00:00.000Z', 'A', { durationSec: 2700, wallSitSec: 43 }),
    log('w3b', '2026-09-15T15:00:00.000Z', 'B', { durationSec: 2700 }),
    log('w3c', '2026-09-17T15:00:00.000Z', 'C', { durationSec: 2700 }),
    log('w2a', '2026-09-06T15:00:00.000Z', 'A', { durationSec: 2400, wallSitSec: 40 }),
    log('w2b', '2026-09-08T15:00:00.000Z', 'B', { durationSec: 2400 }),
  ];

  test('(a) live week: no "vs previous week", one quiet "Week still open."; ‹ to last week compares with units', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, threeWeeks());
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toHaveText('This week · R2 · Week 4 · Sep 19–25');
    await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(2);
    await expect(page.locator('.weekly-review-delta')).toHaveCount(0);
    await expect(page.locator('.weekly-review-open')).toHaveText('Week still open.');
    // v55 (Sep 27 2026) — CHECK N4 (round 1): "total time —" used to be a
    // permanent 4th tile even with zero confirmed sessions. Now that tile is
    // HIDDEN until a week has a confirmed time, so this week (none) shows
    // only the other three (capacity, max wall sit, back pain).
    await expect(page.locator('.weekly-review-total')).toHaveCount(3);
    await expect(page.locator('.weekly-review-totals')).not.toContainText('total time');
    await expect(page.locator('.weekly-review-totals')).toContainText('6.0 → 7.0');
    await expect(page.locator('.weekly-review-totals')).not.toContainText('avg capacity');
    // The live week has nothing after it: › is hidden.
    await expect(page.locator('#next-week')).toBeHidden();

    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 3 · Sep 12–18');
    const delta = page.locator('.weekly-review-delta');
    await expect(delta).toBeVisible();
    await expect(page.locator('.weekly-review-open')).toHaveCount(0);
    // T2 fix r1 (Sep 27 2026, checker's "must"): none of these seeded rows
    // has a confirmed her_start/her_end (only the app's own `durationSec`,
    // a red herring) — the weekly review must never turn that into a "total
    // time" number or arrow. The row is dropped entirely, not shown as ±0.
    const time = delta.locator('.weekly-review-delta-row').filter({ hasText: 'total time' });
    await expect(time).toHaveCount(0);
    const wall = delta.locator('.weekly-review-delta-row').filter({ hasText: 'max wall sit' });
    await expect(wall.locator('.weekly-review-delta-num')).toHaveText('↑ +3s');
    // › steps forward again.
    await page.locator('#next-week').click();
    await expect(page.locator('.review-title')).toContainText('This week');
  });

  test('(b) a held (break) week: "Held the slot — doesn\'t count.", no "of 3"', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-01T10:00:00.000Z'); // Tue in R2 Week 1
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('Break week · Aug 22–28');
    await expect(page.locator('.weekly-review-empty')).toContainText('Held the slot');
    await expect(page.locator('.weekly-review-subtitle')).toHaveCount(0);
    const text = await page.locator('#app').innerText();
    expect(text).not.toContain('of 3');
    // An ordinary past week with nothing logged says so plainly.
    await mockDate(page, '2026-09-24T10:00:00.000Z');
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await page.locator('#prev-week').click();
    await expect(page.locator('.weekly-review-empty')).toHaveText('No sessions that week.');
  });

  test('(c) back pain 2 is plain; 3 (her stop line) is amber', async ({ page }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      log('p2', '2026-09-20T15:00:00.000Z', 'A', { backPain: 2 }),
      log('p3', '2026-09-22T15:00:00.000Z', 'B', { backPain: 3 }),
    ]);
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    const two = page.locator('[data-detail="p2"] .session-back');
    const three = page.locator('[data-detail="p3"] .session-back');
    await expect(two).toHaveText('2');
    await expect(two).not.toHaveClass(/session-back-warn/);
    await expect(three).toHaveText('3');
    await expect(three).toHaveClass(/session-back-warn/);
    const colors = await page.evaluate(() => ({
      two: getComputedStyle(document.querySelector('[data-detail="p2"] .session-back')!).color,
      three: getComputedStyle(document.querySelector('[data-detail="p3"] .session-back')!).color,
    }));
    expect(colors.two).not.toBe(colors.three);
  });

  test('(d) a session opened from the review: × Back lands on the review, on the same week', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, threeWeeks());
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await page.locator('.weekly-review-sessions [data-detail="w4a"]').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await page.locator('#back-history').click();
    await expect(page.locator('.screen-header h2')).not.toHaveText('Sessions');
    await expect(page.locator('.review-title')).toContainText('This week');
    // On last week: open, back — still last week (the offset is kept).
    await page.locator('#prev-week').click();
    await page.locator('.weekly-review-sessions [data-detail="w3b"]').click();
    await page.locator('#back-history').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 3 · Sep 12–18');
    // × Back from the review goes home; home's card opens THIS week again.
    await page.locator('#back-home').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('This week');
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(e) Sessions: header × Back, no bottom slab, "Sat …" rows; Back from a Session keeps the scroll', async ({
      page,
    }) => {
      await mockDate(page, THU_WEEK4);
      const rows: Row[] = [];
      let t = new Date('2026-09-19T16:30:00.000Z').getTime(); // a Saturday
      for (let i = 0; i < 30; i++) {
        rows.push(log(`r${i}`, new Date(t).toISOString(), (['C', 'B', 'A'] as const)[i % 3]!));
        t -= 2 * 86_400_000;
      }
      await seedLogs(page, rows);
      await page.goto('/');
      await page.locator('#view-history').click();
      await expect(page.locator('.screen-header h2')).toHaveText('Sessions');
      await expect(page.locator('.screen-header #back-home')).toHaveText('× Back');
      await expect(page.locator('.btn-large')).toHaveCount(0);
      // T2 (Sep 27 2026): these seeded rows carry the app's own durationSec
      // but no her_start/her_end confirm — "old rows show no length" (§3.4),
      // so the row is the date alone, no "· N min" tacked on.
      await expect(page.locator('.history-date').first()).toHaveText(/^Sat Sep 19$/);
      // Scroll down, open a row, come back: the list is where she left it.
      const target = page.locator('[data-detail="r20"]');
      await target.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(300);
      await target.click();
      await expect(page.locator('.screen-header h2')).toHaveText('Session');
      expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
      await page.locator('#back-history').click();
      await expect(page.locator('.screen-header h2')).toHaveText('Sessions');
      const after = await page.evaluate(() => window.scrollY);
      expect(Math.abs(after - before)).toBeLessThan(4);
    });
  });

  test('(e2) T2: one time formatter — the once-only Sessions note, "about N min" only on a confirmed row, never the app tap-time', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      // Confirmed her own start/finish (T1): a real 45-minute span.
      log('confirmed', '2026-09-22T15:00:00.000Z', 'B', {
        startedAt: '2026-09-22T15:31:00.000Z',
        completedAt: '2026-09-22T20:04:00.000Z', // the app's own tap span — a red herring
        herStartAt: '2026-09-22T15:00:00.000Z',
        herStartConfirmed: true,
        herEndAt: '2026-09-22T15:45:00.000Z',
        herEndConfirmed: true,
        breakMinutes: 0,
      }),
      // Old-style row: durationSec but no her_start/her_end confirm.
      log('unconfirmed', '2026-09-20T15:00:00.000Z', 'A'),
    ]);
    await page.goto('/');
    await page.locator('#view-history').click();
    // Said once, at the top — not per row. T2 fix r1 (Sep 27 2026, checker's
    // nice): reworded to the real mechanism (her confirmed start/finish),
    // not a bare date claim.
    await expect(page.locator('.history-length-note')).toHaveText(
      "Workout length shows once you've said your start and finish times — from Sep 27 2026."
    );
    const confirmedRow = page.locator('[data-detail="confirmed"]');
    const unconfirmedRow = page.locator('[data-detail="unconfirmed"]');
    await expect(confirmedRow.locator('.history-date')).toHaveText(/^Tue Sep 22 · about 45 min$/);
    await expect(unconfirmedRow.locator('.history-date')).toHaveText(/^Sun Sep 20$/);

    // Session detail: the Time row is HER confirmed minutes, never the app's
    // 15:31–20:04 tap span (4h33m) that's sitting right there in the data.
    await confirmedRow.click();
    const card = page.locator('.detail-card');
    const time = card.locator('.detail-row').filter({ hasText: 'Time' });
    await expect(time).toHaveText('Timeabout 45 min');
    await expect(page.locator('#detail-app-time')).toHaveText(
      /^App open \d\d:\d\d–\d\d:\d\d — not workout time$/
    );
  });

  test('(e) Session: B has no Wall sit row; a ride shows one Cardio row from columns or the old marker; Note = her words only', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      log('b-new', '2026-09-22T15:00:00.000Z', 'B', {
        startedAt: '2026-09-22T15:31:00.000Z',
        completedAt: '2026-09-22T16:04:00.000Z',
        durationSec: 1980,
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 7,
        ellipticalKm: 1.4,
        ellipticalPulse: 128,
        sessionNote: 'Knee fine',
        armFeel: 'curl=easy;row=right',
        notes: null,
      }),
      log('a-old', '2026-09-20T15:00:00.000Z', 'A', {
        capacityAfter: null,
        word: '',
        notes:
          'cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee fine · duration not recorded — session was left open 4h before Done',
      }),
      log('c-apt', '2026-09-17T15:00:00.000Z', 'C', {
        notes: 'cardio: apartment 25 min',
        liteDay: true,
      }),
    ]);
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-new"]').click();
    const card = page.locator('.detail-card');
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await expect(card.locator('.detail-label')).not.toContainText(['Wall sit']);
    await expect(card).not.toContainText('Wall sit');
    await expect(page.locator('#detail-cardio')).toHaveText(
      'Elliptical 10 min · L7 · 1.4 km · pulse 128'
    );
    await expect(card).toContainText('Arms');
    await expect(card).toContainText('curl easy · row right');
    await expect(page.locator('#detail-session-note')).toHaveText('Knee fine');
    // T2 fix r1 (Sep 27 2026, checker's should #2): this row has no
    // her_start/her_end confirm, so there's no Time row at all — the once-
    // only Sessions note already said an old row shows no length, and this
    // card's own "carries nothing" rule drops a row with nothing to show.
    // The app's own open/close tap-time is on its own dim "not workout time"
    // line below the card (§3.4).
    const time = card.locator('.detail-row').filter({ hasText: 'Time' });
    await expect(time).toHaveCount(0);
    await expect(page.locator('#detail-app-time')).toHaveText(
      /^App open \d\d:\d\d–\d\d:\d\d — not workout time$/
    );
    await expect(card.locator('.detail-row').filter({ hasText: 'Capacity' })).toContainText(
      '6 → 7'
    );
    await expect(page.locator('.btn-large, #open-progress-from-detail')).toHaveCount(0);

    // The legacy marker row reads the same, and her words are only her words.
    await page.locator('#back-history').click();
    await page.locator('[data-detail="a-old"]').click();
    await expect(page.locator('#detail-cardio')).toHaveText(
      'Elliptical 10 min · L7 · 1.4 km · pulse 128'
    );
    await expect(page.locator('#detail-session-note')).toHaveText('knee fine');
    const system = card.locator('.detail-row').filter({ hasText: 'System' });
    await expect(system).toContainText('duration not recorded');
    await expect(page.locator('#detail-session-note')).not.toContainText('cardio');
    // A with an after-reading missing: "Capacity 6", and the Wall sit row is there.
    await expect(card.locator('.detail-row').filter({ hasText: 'Capacity' })).toHaveText(
      /Capacity\s*6$/
    );
    await expect(card).toContainText('Wall sit');

    // The apartment marker + lite.
    await page.locator('#back-history').click();
    await page.locator('[data-detail="c-apt"]').click();
    await expect(page.locator('#detail-cardio')).toHaveText('Apartment 25 min');
    await expect(card.locator('.detail-row').filter({ hasText: 'Lite' })).toContainText('1 round');
    await expect(page.locator('#detail-session-note')).toHaveCount(0);
  });

  test('(f) Progress: Start → Now first, no breakdown; A/B/C chips; latest by date; held weeks "—"; Round 1 folded; v51 "Your cycle" card present (no data yet)', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    // Storage order OLDEST first (the reverse of newest-first): v47's
    // `.reverse()` would have called the May 12 hold the "latest".
    await seedLogs(page, [
      log('may', '2026-05-12T15:00:00.000Z', 'A', { wallSitSec: 52 }),
      log('ride1', '2026-09-06T15:00:00.000Z', 'C', {
        cardioLane: 'elliptical',
        cardioMinutes: 25,
        ellipticalLevel: 3,
      }),
      log('sep13', '2026-09-13T15:00:00.000Z', 'A', { wallSitSec: 40 }),
      log('ride2', '2026-09-17T15:00:00.000Z', 'C', {
        cardioLane: 'elliptical',
        cardioMinutes: 25,
        ellipticalLevel: 7,
      }),
      log('sep20', '2026-09-20T15:00:00.000Z', 'A', { wallSitSec: 45 }),
      log('sep22', '2026-09-22T15:00:00.000Z', 'B'),
    ]);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const app = page.locator('#app');
    await expect(app).not.toContainText('Exercise breakdown');
    // v50 · cycle (Sep 25 2026): the OLD capacity chart (charting untouched
    // slider defaults) is still gone — DECISIONS §2 #6 below still holds.
    // v51 (Sep 25 2026, 11:56): "Your cycle" moved off Progress onto its own
    // page (her words: "it should be on its own page not in this page") —
    // Progress keeps one door row that opens it. No cycle_periods are
    // seeded in this test, so the door's own sub-line reads the empty state.
    const cc = page.locator('.progress-card', { hasText: 'Your cycle' });
    await expect(cc).toContainText('No period logged yet');
    await expect(cc.locator('svg')).toHaveCount(0);
    const cards = page.locator('.progress-screen > .progress-card');
    await expect(cards.first()).toHaveClass(/start-now-card/);
    const sn = page.locator('.start-now-card');
    await expect(sn.locator('.start-now-hero')).toHaveText('6 sessions');
    // v51 · the old separate "Elliptical level" / "Elliptical km" rows are
    // now one combined "Elliptical" line (level 3 -> 7; no km seeded here).
    await expect(sn.locator('.start-now-row').filter({ hasText: 'Elliptical' })).toContainText(
      'level 3 → 7'
    );
    // v49 · look fix (Sep 25 2026): every wallSitSec here predates the v45
    // real-timing capture (Sep 24), so honestWallSitLogs() excludes all of
    // them — the row and the trend card both omit rather than show a
    // prescribed number as measured (the exact "Progress disagrees with
    // Home" bug this fix closes).
    await expect(sn.locator('.start-now-row').filter({ hasText: 'Wall sit' })).toHaveCount(0);
    await expect(sn.locator('.progress-card-meta')).toHaveText('since May 12');
    const wall = page.locator('.wall-sit-card');
    await expect(wall).toHaveCount(0);
    // Subtitle chips.
    const sub = page.locator('.progress-subtitle');
    await expect(sub).toContainText('A 3');
    await expect(sub).toContainText('B 1');
    await expect(sub).toContainText('C 2');
    // Sessions per week: held weeks are "—", never "0 / 3"; Round 1 is folded.
    const spw = page.locator('.spw-card');
    const older = spw.locator('details.spw-older');
    await expect(older).toHaveJSProperty('open', false);
    await expect(older.locator('.spw-older-summary')).toContainText('Round 1 · 11 wks');
    const breakRow = older.locator('.spw-row-skipped').filter({ hasText: 'break' }).first();
    await expect(breakRow).toContainText('—');
    await expect(breakRow).not.toContainText('/ 3');
    await expect(breakRow.locator('.spw-track')).toHaveCount(0);
    // The open rows are this round's only (R2: 4 weeks, the last "now").
    await expect(spw.locator(':scope > .spw-rows .spw-row')).toHaveCount(4);
    await expect(spw.locator(':scope > .spw-rows .spw-row').last()).toContainText('now');
    // v48 · fix r1: a plain count, no "target" verdict.
    await expect(spw.locator('.progress-card-meta')).toContainText('full week');
    await expect(spw.locator('.progress-card-meta')).not.toContainText('target');
    // No sage chart ink anywhere on Progress.
    const sage = await page.evaluate(
      () =>
        [...document.querySelectorAll('#app svg [fill], #app svg [stroke]')].filter((el) =>
          /var\(--accent(-hover)?\)/.test(
            `${el.getAttribute('fill') ?? ''} ${el.getAttribute('stroke') ?? ''}`
          )
        ).length
    );
    expect(sage).toBe(0);
  });

  test('(g) Settings: no auto-suggest, Gear chips + Neck release, Data folded, honest captions, 44 px steppers', async ({
    page,
  }) => {
    await page.locator('#open-settings').click();
    const app = page.locator('#app');
    await expect(app).not.toContainText(/auto-suggest/i);
    await expect(page.locator('.gear-chip')).toHaveCount(5);
    await expect(page.locator('.gear-chip').first()).toHaveText('✅ 1 kg · A+B arm block');
    // v55 (Sep 27 2026): she has the 2 kg now, and the Lisa-GATING copy is
    // retired everywhere (rule 8e) — the gear line says so, checked (have).
    // "Neck release · Lisa" stays — that's attribution, not a gate.
    await expect(page.locator('.gear-chip').nth(3)).toHaveText(
      '✅ 1 kg + 2 kg pairs · your pick by pain'
    );
    await expect(app).not.toContainText('tell Claude');
    await expect(app).not.toContainText(/ask lisa/i);
    await expect(page.locator('.neck-card')).toContainText('Two tennis balls in a sock');
    const data = page.locator('details.settings-data');
    await expect(data).toHaveJSProperty('open', false);
    await expect(data.locator('summary')).toContainText('Data · export · import · clear');
    await expect(app).toContainText('0 = straight on');
    await expect(app).toContainText('Rides never count down.');
    await expect(app).toContainText('Open how-to on first visit');
    await data.locator('summary').click();
    const text = await app.innerText();
    expect(text).not.toContain('app.ts');
    expect(text).not.toContain('localStorage');
    expect(text).not.toContain('Supabase');
    await expect(app).toContainText('This phone only. Cloud copy stays.');
    await expect(page.locator('#data-status')).toBeHidden();
    for (const id of ['#rest-dec', '#rest-inc', '#pre-dec', '#pre-inc']) {
      const box = (await page.locator(id).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // A switch that's on is a state, not the one sage action.
    const onTrack = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.settings-toggle.on .settings-toggle-track')!)
          .backgroundColor
    );
    expect(onTrack).not.toBe('rgb(143, 188, 143)');
  });
});

// --- v48 P7 · the cool-down: her 18 stretches as 11 tick-off rows (Sep 24 2026) ---
// DECISIONS-v48 §4 (cool-down row). Her routine — "i dont do yur stretches i do
// this" (May 29) — and her Jun 6 call: one list, no timer. All 18 stay in the
// data; right/left pairs fold into one "each side" row; rows tick off; one
// honest line instead of "No timer" over "45 sec"; Done · Finish stays pinned.
test.describe('v48 P7 cool-down', () => {
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4
  const STARTED = '2026-09-22T13:30:00.000Z'; // 30 min earlier → a silent resume

  const coolSnap = (liteDay = false): Record<string, unknown> => ({
    screen: 'workout',
    selectedWorkout: 'A',
    capacityBefore: 6,
    capacityAfter: 5,
    wallSitSec: 45,
    backPain: 0,
    word: '',
    currentRound: 2,
    currentPhase: 'cooldown',
    currentExerciseIndex: 0,
    startedAt: STARTED,
    pausedAt: null,
    pausedMs: 0,
    liteDay,
  });

  // Seeded after the beforeEach clear, so every load of `page` lands on A's
  // cool-down list (a fresh snapshot resumes silently).
  const toCooldown = async (page: Page, liteDay = false): Promise<void> => {
    await mockDate(page, TUE_WEEK4);
    await page.addInitScript(([key, snap]) => window.localStorage.setItem(key, snap), [
      'workout-tracker:active-session',
      JSON.stringify(coolSnap(liteDay)),
    ] as const);
    await page.goto('/');
    await expect(page.locator('.stretch-list')).toBeVisible();
  };

  test('(a) A has 11 rows, the chip reads "Stretch · 11", pairs read "~45 s each side"', async ({
    page,
  }) => {
    await toCooldown(page);
    await expect(page.locator('.stretch-row')).toHaveCount(11);
    await expect(page.locator('.round-indicator')).toHaveText('Stretch · 11');
    const wrist = page.locator('.stretch-row', { hasText: 'Wrist extension' });
    await expect(wrist).toHaveCount(1);
    await expect(wrist.locator('.stretch-name')).toHaveText('Wrist extension');
    await expect(wrist.locator('.stretch-reps')).toHaveText('~45 s each side');
    // The hip-flexor pair folds too; a single reads a plain "~45 s".
    await expect(page.locator('.stretch-name', { hasText: 'Hip flexor' })).toHaveText('Hip flexor');
    await expect(
      page.locator('.stretch-row', { hasText: 'Doorway pec stretch' }).locator('.stretch-reps')
    ).toHaveText('~45 s');
    // All 18 are still there: 7 pairs + 4 singles.
    await expect(page.locator('.stretch-reps', { hasText: 'each side' })).toHaveCount(7);
  });

  test('(b) one honest line: "no timer" in the subtitle, no "45 sec" anywhere on the list', async ({
    page,
  }) => {
    await toCooldown(page);
    await expect(page.locator('.subtitle')).toHaveText('About 45 s each — no timer, go by feel.');
    const list = await page.locator('.stretch-list').innerText();
    expect(list).not.toContain('45 sec');
    expect(list).not.toContain('No timer');
    await expect(page.locator('.stretch-reps').first()).toHaveText('~45 s each side');
    await expect(page.locator('.stretch-progress')).toHaveText('~13 min · 0 of 11');
  });

  test('(c) a tick updates the live line and survives an app close mid-cool-down', async ({
    page,
    context,
  }) => {
    await toCooldown(page);
    const check = (p: Page) => p.locator('[data-stretch-tick="Wrist extension"]');
    await expect(check(page)).toHaveAttribute('aria-pressed', 'false');
    await check(page).click();
    await expect(page.locator('.stretch-progress')).toHaveText('~13 min · 1 of 11');
    await expect(check(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.stretch-row').first()).toHaveClass(/stretch-row-done/);
    // The check fills in ink-2 (v49 · look: --accent-progress is ink, not
    // green), never the sage of the one action.
    const fill = await check(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fill).toBe('rgb(184, 181, 171)');
    // Tap again = untick; then tick it back for the close.
    await check(page).click();
    await expect(page.locator('.stretch-progress')).toHaveText('~13 min · 0 of 11');
    await check(page).click();
    await expect(page.locator('.stretch-progress')).toHaveText('~13 min · 1 of 11');
    const snap = await page.evaluate(() => localStorage.getItem('workout-tracker:active-session'));
    expect(snap).not.toBeNull();
    // A fresh page in the same context (`page` re-seeds on every load).
    const reopened = await context.newPage();
    await mockDate(reopened, TUE_WEEK4);
    await reopened.addInitScript(([key, s]) => window.localStorage.setItem(key, s), [
      'workout-tracker:active-session',
      snap ?? '',
    ] as const);
    await reopened.goto('/');
    await expect(reopened.locator('.stretch-list')).toBeVisible();
    await expect(reopened.locator('.stretch-progress')).toHaveText('~13 min · 1 of 11');
    await expect(check(reopened)).toHaveAttribute('aria-pressed', 'true');
    await reopened.close();
  });

  test('(d) a placeholder cue has no ▸; a real cue opens behind ▸, closed by default', async ({
    page,
  }) => {
    await toCooldown(page);
    const neck = page.locator('.stretch-row', { hasText: 'Neck stretch' });
    await expect(neck.locator('.stretch-cue-toggle')).toHaveCount(0);
    await expect(page.locator('.stretch-cue')).toHaveCount(0);
    const pec = page.locator('.stretch-row', { hasText: 'Doorway pec stretch' });
    await expect(pec.locator('.stretch-cue-toggle')).toHaveAttribute('aria-expanded', 'false');
    await pec.locator('.stretch-cue-toggle').click();
    await expect(pec.locator('.stretch-cue')).toContainText('Stand in a doorway');
    await expect(pec.locator('.stretch-cue-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.stretch-cue')).toHaveCount(1);
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(e) the whole list fits: Done · Finish pinned in view, page ≤ 1400 px, one sage', async ({
      page,
    }) => {
      await toCooldown(page);
      const done = page.locator('.action-bar #next');
      await expect(done).toHaveText('Done · Finish');
      await expect(done).toBeInViewport();
      const box = (await done.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(915);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(h).toBeLessThanOrEqual(1400);
      await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
      // Every check is a real 44×44 target.
      for (const c of await page.locator('.stretch-check').all()) {
        const b = (await c.boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test('(f) a lite day keeps its own subtitle', async ({ page }) => {
    await toCooldown(page, true);
    await expect(page.locator('.subtitle')).toHaveText(
      'Lite day — do the stretches you need, skip the rest. Done · Finish whenever.'
    );
    await expect(page.locator('.round-indicator')).toHaveText('Stretch · 11 · lite');
  });

  test('(g) Done · Finish lands on the post-log; the ticks go nowhere', async ({ page }) => {
    await toCooldown(page);
    await page.locator('[data-stretch-tick="Neck stretch"]').click();
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const raw = (await page.evaluate(() => localStorage.getItem('workout-tracker:logs'))) ?? '';
    expect(raw).toContain('"workout":"A"');
    expect(raw).not.toMatch(/stretch/i);
  });
});

// v48 · P8 (Sep 24 2026) — the copy + consistency sweep, and the version. Every
// screen of a real Workout A is walked once: no developer words or streak talk
// on her screen, labels readable (>= 4.5:1), one sage action per step, tap
// targets >= 44 px, and the version she checks after a deploy says v48.
test.describe('v48 P8 sweep', () => {
  type Row = Record<string, unknown>;
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4
  const BANNED = ['streak', 'Do a workout', 'app.ts', 'localStorage', 'oEmbed'];
  const SAGE = ['rgb(143, 188, 143)', 'rgb(163, 207, 163)'];

  const log = (id: string, date: string, workout: 'A' | 'B' | 'C'): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: workout === 'A' ? 44 : 0,
    backPain: 0,
    word: '',
    synced: true,
    durationSec: 2400,
  });
  // Two weeks of history, so Sessions, the review and Progress have rows.
  const history = (): Row[] => [
    log('h1', '2026-09-20T15:00:00.000Z', 'C'),
    log('h2', '2026-09-17T15:00:00.000Z', 'B'),
    log('h3', '2026-09-15T15:00:00.000Z', 'A'),
    log('h4', '2026-09-13T15:00:00.000Z', 'C'),
  ];
  const seed = async (page: Page): Promise<void> => {
    await mockDate(page, TUE_WEEK4);
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, history());
    await page.goto('/');
  };

  const appText = (page: Page): Promise<string> =>
    page.evaluate(() => document.getElementById('app')?.textContent ?? '');
  const expectClean = async (page: Page, where: string): Promise<void> => {
    const text = (await appText(page)).toLowerCase();
    for (const word of BANNED) {
      expect(text, `${where}: "${word}"`).not.toContain(word.toLowerCase());
    }
  };

  // Visible elements painted with the sage primary (fill or gradient), plus any
  // .btn-primary — the "one sage per screen" rule.
  // v49 · look fix (Sep 25 2026): this only ever counted .btn-primary +
  // background — it missed sage text/border on a :active press and sage
  // SVG fill/stroke in the how-to illustrations, both real "second sage"
  // violations the Opus check found. Now it checks every paint a sage token
  // can land on: background, text color, border and SVG fill/stroke.
  const sageCount = (page: Page): Promise<string[]> =>
    page.evaluate((sage) => {
      return [...document.querySelectorAll<HTMLElement>('#app *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = getComputedStyle(el);
          return (
            el.classList.contains('btn-primary') ||
            sage.includes(cs.backgroundColor) ||
            sage.some((c) => cs.backgroundImage.includes(c)) ||
            sage.includes(cs.color) ||
            sage.includes(cs.borderTopColor) ||
            sage.includes(cs.fill) ||
            sage.includes(cs.stroke)
          );
        })
        .map((el) => el.id || String(el.className));
    }, SAGE);

  // Every visible tap target under 44 px tall. A switch's hidden checkbox is
  // measured by the row label that carries the tap.
  const smallTargets = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
      const sel = [
        'button',
        'a[href]',
        'select',
        'textarea',
        'summary',
        '[role="button"]',
        '[role="radio"]',
        'input',
      ]
        .map((s) => `#app ${s}`)
        .join(', ');
      return [...document.querySelectorAll<HTMLElement>(sel)]
        .map((el) => (el instanceof HTMLInputElement && el.closest('label')) || el)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        })
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => {
          const h = Math.round(el.getBoundingClientRect().height);
          return `${el.id || String(el.className) || el.tagName} ${h}px`;
        });
    });

  // Walk Workout A from pre-log to the post-log, calling `check` on every step.
  const walkA = async (page: Page, check: (label: string) => Promise<void>): Promise<void> => {
    await page.locator('button[data-workout="A"]').first().click();
    await check('pre-log');
    await page.locator('#begin').click();
    await expect(page.locator('.exercise-name, #start-round-2').first()).toBeVisible();
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      const onStep = await page.locator('.exercise-name').first().isVisible();
      const name = onStep ? await page.locator('.exercise-name').first().textContent() : '';
      const isCooldown = await page.locator('.stretch-list').isVisible();
      await check(isCooldown ? 'cool-down' : `step ${i} · ${(name ?? '').trim() || 'round break'}`);
      await page.locator('#next, #ww-skip, #start-round-2').first().click();
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
    await check('post-log');
  };

  test('(a) no "streak", "Do a workout", "app.ts", "localStorage" or "oEmbed" on any screen', async ({
    page,
  }) => {
    await seed(page);
    await expectClean(page, 'home');
    await walkA(page, async (where) => {
      // Open Tips and the video on each step, so the closed text is read too.
      if (where.startsWith('step')) {
        const cue = page.locator('.tips-section .detail-section-toggle[aria-expanded="false"]');
        if (await cue.count()) await cue.first().click();
        const video = page.locator('.visual-video-toggle[aria-expanded="false"]');
        if (await video.count()) await video.first().click();
      }
      await expectClean(page, where);
    });
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    await expectClean(page, 'home after save');
    await page.locator('#view-history').click();
    await expectClean(page, 'Sessions');
    await page.locator('#back-home').click();
    await page.locator('#open-weekly-review .week-card-head').click();
    await expectClean(page, 'weekly review');
    await page.locator('#back-home').click();
    await page.locator('#open-progress-link').click();
    await expectClean(page, 'Progress');
    await page.locator('#back-home').click();
    await page.locator('#open-settings').click();
    await expectClean(page, 'Settings');
  });

  test('(b) label tier (timer label, session meta, review tile label) >= 4.5:1 on its card', async ({
    page,
  }) => {
    await seed(page);
    // Parse "rgb(...)", "rgba(...)" and "color(srgb r g b)" into 0-255 channels.
    const ratio = (sel: string): Promise<number> =>
      page.evaluate((selector) => {
        type RGBA = [number, number, number, number];
        const parse = (c: string): RGBA | null => {
          let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
          if (m) return [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]];
          m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(c);
          if (m) {
            return [+m[1]! * 255, +m[2]! * 255, +m[3]! * 255, m[4] === undefined ? 1 : +m[4]];
          }
          return null;
        };
        const lum = (c: RGBA): number => {
          const f = (v: number): number => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return -1;
        const fg = parse(getComputedStyle(el).color);
        if (!fg) return -1;
        // The card behind it: the nearest ancestor with a solid fill; for a
        // gradient card every stop counts and the worst one is reported.
        const backs: RGBA[] = [];
        for (let a: HTMLElement | null = el; a && !backs.length; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const stops = [...cs.backgroundImage.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))/g)]
            .map((s) => parse(s[0]))
            .filter((s): s is RGBA => s !== null && s[3] > 0.5);
          if (stops.length) {
            backs.push(...stops);
            break;
          }
          const bg = parse(cs.backgroundColor);
          if (bg && bg[3] > 0.5) backs.push(bg);
        }
        if (!backs.length) {
          const body = parse(getComputedStyle(document.body).backgroundColor);
          if (body) backs.push(body);
        }
        const lf = lum(fg);
        return Math.min(
          ...backs.map((b) => {
            const lb = lum(b);
            return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
          })
        );
      }, sel);

    // Sessions: the meta line under each row.
    await page.locator('#view-history').click();
    expect(await ratio('.history-meta')).toBeGreaterThanOrEqual(4.5);
    await page.locator('#back-home').click();
    // Weekly review: a totals tile label.
    await page.locator('#open-weekly-review .week-card-head').click();
    expect(await ratio('.weekly-review-total-lbl')).toBeGreaterThanOrEqual(4.5);
    await page.locator('#back-home').click();
    // A hold: the timer card's label (the wall sit on A).
    await page.locator('button[data-workout="A"]').first().click();
    await page.locator('#begin').click();
    for (let i = 0; i < 20 && !(await page.locator('.timer-label').isVisible()); i++) {
      await page.locator('#next, #ww-skip').first().click();
    }
    expect(await ratio('.timer-label')).toBeGreaterThanOrEqual(4.5);
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(c) every Workout A screen has at most one sage primary', async ({ page }) => {
      await seed(page);
      expect(await sageCount(page), 'home').toHaveLength(1);
      await walkA(page, async (where) => {
        const sage = await sageCount(page);
        expect(sage.length, `${where}: ${sage.join(', ')}`).toBeLessThanOrEqual(1);
      });
    });

    test('(e) every tap target on home, Settings and each Workout A step is >= 44 px tall', async ({
      page,
    }) => {
      await seed(page);
      expect(await smallTargets(page), 'home').toEqual([]);
      await page.locator('#open-settings').click();
      const data = page.locator('details.settings-data > summary');
      if (await data.count()) await data.click();
      expect(await smallTargets(page), 'Settings').toEqual([]);
      await page.locator('#back-home').click();
      await walkA(page, async (where) => {
        expect(await smallTargets(page), where).toEqual([]);
      });
    });
  });

  test('(d) the version: home "v55 · <date, no year>", Settings "Build v55 · <full date>", sw.js v55', async ({
    page,
  }) => {
    const src = await (await page.request.get('/app.ts')).text();
    const version = /const APP_VERSION = '([^']+)'/.exec(src)?.[1];
    const built = /const BUILD_DATE = '([^']+)'/.exec(src)?.[1] ?? '';
    // v55 (Sep 27 2026): the LOAD CHIP + no-Lisa-copy batch — a whole-number
    // bump (v51/v52/v53's own shape: sub-versions are same-day fixes, a new
    // number is a new build).
    expect(version).toBe('v55');
    expect(built).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{2}:\d{2}$/);
    await expect(page.locator('.app-version')).toHaveText(
      `${version} · ${built.replace(/,\s*\d{4}/, '')}`
    );
    await page.locator('#open-settings').click();
    await expect(page.locator('#app')).toContainText(`Build ${version} · ${built}`);
    const sw = await (await page.request.get('/sw.js')).text();
    expect(sw).toContain(`'workout-tracker-${version}'`);
  });
});

// v49 · look fix (Sep 25 2026): the self-hosted DM Sans ships no tabular
// figures — font-variant-numeric: tabular-nums was a no-op on it, so every
// centred running timer shifted sideways digit to digit. Fixed by giving
// timer digits a system-font fallback that DOES carry tnum (--font-numeric).
// This measures two same-length strings with maximally different digit
// shapes off the live .timer-display CSS — no width drift means the digits
// are truly fixed-width, not just visually close.
test('v49 · look fix: .timer-display renders tabular digits — "1:11" and "0:00" measure the same width', async ({
  page,
}) => {
  await page.goto('/');
  const widths = await page.evaluate(async () => {
    await document.fonts.ready;
    const measure = (text: string): number => {
      const el = document.createElement('div');
      el.className = 'timer-display';
      el.style.position = 'absolute';
      el.style.visibility = 'hidden';
      el.style.left = '-9999px';
      el.textContent = text;
      document.body.appendChild(el);
      const w = el.getBoundingClientRect().width;
      el.remove();
      return w;
    };
    return { a: measure('1:11'), b: measure('0:00'), c: measure('8:88') };
  });
  expect(Math.abs(widths.a - widths.b)).toBeLessThanOrEqual(1); // sub-pixel rounding only
  expect(Math.abs(widths.a - widths.c)).toBeLessThanOrEqual(1);
});

// v53 (Sep 26 2026) — A5: fix a past session's ride numbers. Her words: "I
// don't know how to update this information but ok workout b week 4 did on
// level 5, 10 min, .69 distant 62.4 calories" / "there have to be an easy way
// to enter the data." Sessions → a row → Edit → the same five console fields
// as the live ride-numbers screen, plus her note.
test.describe('v53 · edit a past session (A5)', () => {
  type Row = Record<string, unknown>;

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };
  // The exact session her words describe: an elliptical B day whose ride
  // numbers were never entered (null) — the case "an easy way to enter the
  // data" exists for.
  const rideLog = (extra: Row = {}): Row => ({
    id: 'b-week4',
    date: '2026-09-20T15:00:00.000Z',
    workout: 'B',
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    durationSec: 2400,
    cardioLane: 'elliptical',
    cardioMinutes: null,
    ellipticalLevel: null,
    ellipticalKm: null,
    ellipticalKcal: null,
    ellipticalPulse: null,
    ellipticalTimeSec: null,
    sessionNote: null,
    synced: true,
    ...extra,
  });

  async function readLog(page: Page, id: string): Promise<Row> {
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    const logs = JSON.parse(raw ?? '[]') as Row[];
    const found = logs.find((l) => l['id'] === id);
    if (!found) throw new Error(`log ${id} not found`);
    return found;
  }

  async function openEdit(page: Page): Promise<void> {
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-week4"]').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await page.locator('#edit-history-session').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Edit session');
  }

  test('(a) open → edit → save: the detail shows the new numbers, only the ride fields + note change', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await openEdit(page);

    // "—" until she touches it — the level stepper starts empty, same rule as
    // the live ride-numbers screen.
    await expect(page.locator('#hist-level')).toHaveText('—');
    await page.locator('#hist-time').fill('10:00');
    await page.locator('#hist-km').fill('0.69');
    await page.locator('#hist-kcal').fill('62.4');
    await page.locator('#hist-level-up').click();
    await page.locator('#hist-level-up').click();
    await expect(page.locator('#hist-level')).toHaveText('5');
    await page.locator('#hist-pulse').fill('118');
    await page.locator('#hist-note').fill('Felt strong.');
    await page.locator('#save-history-edit').click();

    // Back on the Session screen, the numbers she just typed.
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    const cardio = page.locator('#detail-cardio');
    await expect(cardio).toContainText('L5');
    await expect(cardio).toContainText('0.69 km');
    await expect(cardio).toContainText('62.4 kcal');
    await expect(cardio).toContainText('10:00');
    await expect(cardio).toContainText('pulse 118');
    await expect(page.locator('#detail-session-note')).toHaveText('Felt strong.');

    // Only the six fields changed — the date, workout letter and every other
    // reading on the row are exactly what they were.
    const log = await readLog(page, 'b-week4');
    expect(log['date']).toBe('2026-09-20T15:00:00.000Z');
    expect(log['workout']).toBe('B');
    expect(log['capacityBefore']).toBe(6);
    expect(log['capacityAfter']).toBe(7);
    expect(log['backPain']).toBe(0);
    expect(log['ellipticalTimeSec']).toBe(600);
    expect(log['ellipticalKm']).toBe(0.69);
    expect(log['ellipticalKcal']).toBe(62.4);
    expect(log['ellipticalLevel']).toBe(5);
    expect(log['ellipticalPulse']).toBe(118);
    expect(log['sessionNote']).toBe('Felt strong.');
    // Queued like a new session — synced:false — plus pendingEdit so the
    // flush PATCHes the existing row instead of posting a duplicate.
    expect(log['synced']).toBe(false);
    expect(log['pendingEdit']).toBe(true);

    // The pushed payload carries them (sessionPayload is pure — see
    // __wtSessionPayload).
    const payload = await page.evaluate(
      (e) =>
        (window as unknown as { __wtSessionPayload: (x: unknown) => Row }).__wtSessionPayload(e),
      log
    );
    expect(payload['elliptical_level']).toBe(5);
    expect(payload['elliptical_km']).toBe(0.69);
    expect(payload['elliptical_kcal']).toBe(62.4);
    expect(payload['elliptical_time_sec']).toBe(600);
    expect(payload['elliptical_pulse']).toBe(118);
    expect(payload['session_note']).toBe('Felt strong.');

    // And the edit's own request is a PATCH by id, never another POST — the
    // row already exists in Supabase (patchSessionRequest, pure, no fetch).
    const patchReq = await page.evaluate(
      (e) =>
        (
          window as unknown as {
            __wtPatchSessionRequest: (x: unknown) => { url: string; body: Row };
          }
        ).__wtPatchSessionRequest(e),
      log
    );
    expect(patchReq.url).toContain('id=eq.b-week4');
    expect(patchReq.body['id']).toBeUndefined();
    expect(patchReq.body['elliptical_level']).toBe(5);
    // v53 fix (CHECK M3, Sep 26 2026): the body used to be the full
    // sessionPayload minus id (30-odd columns, including date and
    // workout_type) — an explicit allow-list now, so the exact key set is the
    // contract, not just a spot check on one field.
    expect(Object.keys(patchReq.body).sort()).toEqual(
      [
        'elliptical_kcal',
        'elliptical_km',
        'elliptical_level',
        'elliptical_pulse',
        'elliptical_time_sec',
        'session_note',
      ].sort()
    );
    expect(patchReq.body['date']).toBeUndefined();
    expect(patchReq.body['workout_type']).toBeUndefined();
  });

  test('(f) the PATCH body — CHECK M3: only the 6 ride/note columns, never date, workout_type or anything else on the row', async ({
    page,
  }) => {
    // Pure-function test, same shape as (a)'s payload check but exhaustive:
    // walks a REALISTIC full LogEntry (every field a real session carries)
    // through __wtPatchSessionRequest and asserts the body key set exactly —
    // so a future field added to sessionPayload can't silently leak back in.
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    const patchReq = await page.evaluate(() => {
      const entry = {
        id: 'b-week4',
        date: '2026-09-20T15:00:00.000Z',
        workout: 'B',
        capacityBefore: 6,
        capacityAfter: 7,
        moodBefore: 5,
        moodAfter: 6,
        wallSitSec: 0,
        backPain: 0,
        wristPain: 0,
        backPainBefore: 0,
        wristPainBefore: 0,
        stepFeel: 'fine',
        word: 'strong',
        startedAt: '2026-09-20T15:00:00.000Z',
        completedAt: '2026-09-20T16:00:00.000Z',
        durationSec: 3600,
        walkMinutes: 10,
        walkSteps: 1200,
        walkMeters: 900,
        notes: 'some system note',
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 5,
        ellipticalKm: 0.69,
        ellipticalPulse: 118,
        ellipticalTimeSec: 600,
        ellipticalKcal: 62.4,
        sessionNote: 'Felt strong.',
        liteDay: false,
        armFeel: null,
        voicePlays: 2,
        stepsSkipped: 1,
        synced: true,
        pendingEdit: true,
      };
      const w = window as unknown as {
        __wtPatchSessionRequest: (x: unknown) => { url: string; body: Record<string, unknown> };
      };
      return {
        normal: w.__wtPatchSessionRequest(entry, false),
        legacy: w.__wtPatchSessionRequest(entry, true),
      };
    });
    expect(Object.keys(patchReq.normal.body).sort()).toEqual(
      [
        'elliptical_kcal',
        'elliptical_km',
        'elliptical_level',
        'elliptical_pulse',
        'elliptical_time_sec',
        'session_note',
      ].sort()
    );
    // The legacy (pre-v48-schema) fallback has no ride-number columns at all —
    // legacySessionPayload folds everything into `notes`, so that's the one
    // key the legacy PATCH body carries.
    expect(Object.keys(patchReq.legacy.body)).toEqual(['notes']);
  });

  // v53 fix (CHECK M2, Sep 26 2026): return=minimal gave a bare 204 on EVERY
  // PATCH, including one that matched 0 rows — `res.ok` alone can't tell an
  // update from a no-op, and the old code read a no-op as saved. Unit-level
  // (pure function, no network — same reasoning as the payload tests above).
  test('(g) CHECK M2 — a PATCH matching 0 rows never reads as success', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const w = window as unknown as { __wtPatchMatchedARow: (rows: unknown) => boolean };
      return {
        empty: w.__wtPatchMatchedARow([]),
        oneRow: w.__wtPatchMatchedARow([{ id: 'b-week4' }]),
        twoRows: w.__wtPatchMatchedARow([{ id: 'a' }, { id: 'b' }]),
        notAnArray: w.__wtPatchMatchedARow(null),
        undefinedBody: w.__wtPatchMatchedARow(undefined),
      };
    });
    expect(result.empty).toBe(false); // 0 rows matched — the exact CHECK M2 case
    expect(result.oneRow).toBe(true);
    expect(result.twoRows).toBe(true);
    expect(result.notAnArray).toBe(false);
    expect(result.undefinedBody).toBe(false);
  });

  // v53 fix (CHECK M2, Sep 26 2026): saveHistoryEdit used to set pendingEdit
  // unconditionally. A session that finished OFFLINE and never reached
  // Supabase (synced:false, no pendingEdit) has no server row for a PATCH to
  // find — every attempt would match 0 rows (see (g)) and never fall back to
  // a POST, so the whole session (not just the edit) was unrecoverable. Now
  // it stays a normal queued row and routes through the same POST path any
  // other never-synced session does.
  test('(h) CHECK M2 — editing a session that never reached Supabase keeps it a normal queued row (POST path), not pendingEdit (PATCH path)', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog({ synced: false, pendingEdit: undefined })]);
    await page.goto('/');
    await openEdit(page);
    await page.locator('#hist-km').fill('0.69');
    await page.locator('#save-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');

    const log = await readLog(page, 'b-week4');
    expect(log['ellipticalKm']).toBe(0.69);
    expect(log['synced']).toBe(false);
    // The whole point: NOT pendingEdit — a PATCH-by-id would match nothing.
    expect(log['pendingEdit']).toBeFalsy();

    // Never disappears: mergeRemoteSessions' drop rule only fires on
    // `synced === true` rows missing from the remote pull — this row is
    // synced:false, so a pull where the server has never heard of it (the
    // exact offline-finished case) must keep it, not drop it.
    const survived = await page.evaluate((entry) => {
      const w = window as unknown as {
        __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Array<Record<string, unknown>>;
      };
      // Remote pull has OTHER sessions but nothing with this id — the server
      // genuinely never received it, same as "PATCH matched 0 rows" would say.
      return w.__wtMergeRemoteSessions(
        [entry],
        [
          {
            id: 'some-other-session',
            date: '2026-09-01T15:00:00.000Z',
            workout_type: 'A',
            capacity_before_1_10: 5,
            capacity_after_1_10: 5,
            wall_sit_seconds: 0,
            pain_back_0_10: 0,
            one_word: '',
            started_at: null,
            completed_at: null,
            duration_seconds: null,
            notes: null,
          },
        ]
      );
    }, log);
    expect(survived.some((r) => r['id'] === 'b-week4')).toBe(true);
    expect(survived.find((r) => r['id'] === 'b-week4')?.['ellipticalKm']).toBe(0.69);
  });

  // v53 fix (CHECK M2, Sep 26 2026): a queued edit must be VISIBLE on the one
  // session it could be lost from — not just folded into the header's generic
  // "offline · N pending" count.
  test('(i) CHECK M2 — a still-queued edit shows "Not saved online yet — will retry" on the session screen', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog({ synced: false, pendingEdit: true, ellipticalKm: 0.69 })]);
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-week4"]').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await expect(page.locator('#detail-edit-unsynced')).toHaveText(
      'Not saved online yet — will retry'
    );
  });

  // mergeRemoteSessions used to mark ANY local-unsynced row synced the moment
  // the server had its id (v45's "an earlier push DID land" rule) — true for
  // a brand-new session, but not for an EDIT: the server already had this id
  // BEFORE the fix, so its presence here proves nothing about whether the
  // PATCH landed. Without the pendingEdit check this pull would wipe out
  // synced:false and the flush would never retry the fix.
  test('(e) a pull mid-flush never marks a pendingEdit row synced off the server’s still-stale copy', async ({
    page,
  }) => {
    const out = await page.evaluate(() => {
      const w = window as unknown as {
        __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Array<Record<string, unknown>>;
      };
      const merged = w.__wtMergeRemoteSessions(
        [
          {
            id: 'b-week4',
            date: '2026-09-20T15:00:00.000Z',
            workout: 'B',
            capacityBefore: 6,
            capacityAfter: 7,
            wallSitSec: 0,
            backPain: 0,
            word: '',
            ellipticalKm: 0.69, // her fix — not yet confirmed landed
            synced: false,
            pendingEdit: true,
          },
        ],
        [
          {
            // The server's answer still carries the OLD number: this row
            // existed on the server long before today's edit, so an id match
            // here says nothing about the PATCH's fate.
            id: 'b-week4',
            date: '2026-09-20T15:00:00.000Z',
            workout_type: 'B',
            capacity_before_1_10: 6,
            capacity_after_1_10: 7,
            wall_sit_seconds: 0,
            pain_back_0_10: 0,
            one_word: '',
            started_at: null,
            completed_at: null,
            duration_seconds: null,
            notes: null,
            elliptical_km: 1.4,
          },
        ]
      );
      return merged[0];
    });
    expect(out?.['synced']).toBe(false);
    expect(out?.['pendingEdit']).toBe(true);
    expect(out?.['ellipticalKm']).toBe(0.69); // her fix wins, not the server's stale 1.4
  });

  test('(b) × Back on the edit screen discards the draft — nothing saved', async ({ page }) => {
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await openEdit(page);
    await page.locator('#hist-km').fill('9.99');
    await page.locator('#back-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await expect(page.locator('#detail-cardio')).not.toContainText('9.99');
    const log = await readLog(page, 'b-week4');
    expect(log['ellipticalKm']).toBeNull();
    expect(log['synced']).toBe(true);
  });

  test('(c) an edit made offline queues (synced:false, pendingEdit:true), survives an app close, and reconnecting never corrupts or drops it', async ({
    page,
    context,
  }) => {
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await openEdit(page);
    await page.locator('#hist-km').fill('0.69');
    await page.locator('#save-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');

    // Home shows it queued (real sync is off under automation — see
    // syncDisabled — so it stays pending exactly like a brand-new session
    // saved offline would).
    await page.locator('#back-history').click();
    await page.locator('#back-home').click();
    await expect(page.locator('#sync-indicator')).toHaveText('offline · 1 pending');

    // Survives an app close: a fresh page in the SAME context (not another
    // page.goto on `page` — its own init script re-clears+re-seeds storage on
    // every load of `page` itself, same trick the elliptical-firsts test above
    // uses). localStorage is shared per-origin across pages in one context, so
    // `reopened` sees exactly what the edit left there.
    const reopened = await context.newPage();
    const errors: string[] = [];
    reopened.on('pageerror', (e) => errors.push(String(e)));
    await reopened.goto('/');
    await expect(reopened.locator('#sync-indicator')).toHaveText('offline · 1 pending');
    let log = await readLog(reopened, 'b-week4');
    expect(log['pendingEdit']).toBe(true);
    expect(log['ellipticalKm']).toBe(0.69);

    // Reconnecting fires the same flush a brand-new session's does
    // (flushPendingSyncs → patchLogToSupabase for a pendingEdit row). No real
    // network happens under automation (never write to Supabase in tests),
    // so nothing here proves the server accepted it — this proves the new
    // routing doesn't throw or corrupt the queued row while it waits.
    await reopened.evaluate(() => window.dispatchEvent(new Event('online')));
    await reopened.waitForTimeout(200);
    expect(errors).toEqual([]);
    log = await readLog(reopened, 'b-week4');
    expect(log['pendingEdit']).toBe(true);
    expect(log['ellipticalKm']).toBe(0.69);
  });

  test("(d) the Done card on Home opens today's session — same Edit door as Sessions", async ({
    page,
  }) => {
    await mockDate(page, '2026-09-20T18:00:00.000Z'); // same day as rideLog's date
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await expect(page.locator('#home-done-card')).toBeVisible();
    await page.locator('#home-done-card').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await page.locator('#edit-history-session').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Edit session');
  });
});

// WK3 (Sep 27 2026) — PLAN-2026-09-26.md §2.4/§10: "Move on without it" +
// week_moves + sync + Undo. Her words, 21:24: "dont go to next week till i
// approve" — the button is quiet and explicit, never automatic. Fixture
// shape matches week.test.ts's own #11 canMoveOn tests exactly (same real
// launch instant, same day-7/day-8 boundary) so the UI and the pure module
// agree on the same real dates.
test.describe('WK3 · "Move on without it" + week_moves', () => {
  type Row = Record<string, unknown>;

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };

  const readWeekMoves = async (page: Page): Promise<Row[]> => {
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:week-moves'));
    return JSON.parse(raw ?? '[]') as Row[];
  };

  const log = (id: string, date: string, workout: 'A' | 'B' | 'C'): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    // Sep 27 fix: these fixture sessions are seeded already-synced (the
    // convention every other describe block in this file uses, e.g. line
    // 5115/7300) — this block is testing the week_moves queue in isolation,
    // not the unrelated session-log queue, so an unsynced seed row was
    // double-counting into #sync-indicator's "N pending" and breaking the
    // one test that reads it (WK3's own offline-queue test).
    synced: true,
  });

  // Week 5 opens at the real launch instant (Sat Sep 26 2026 22:30 +03:00).
  // An A the next day + a B two days later leave it at 2 of 3, missing only
  // C — done.length > 0 and < 3 is canMoveOn's own gate.
  const TWO_DONE = [
    log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
    log('wk5-b', '2026-09-29T10:00:00+03:00', 'B'),
  ];
  const DAY_7 = '2026-10-02T12:00:00+03:00'; // Fri — canMoveOn's own "hidden" day
  const DAY_8 = '2026-10-03T12:00:00+03:00'; // Sat — canMoveOn's own "shown" day

  test('hidden on day 7, even with 2 of 3 done', async ({ page }) => {
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_7);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('2 of 3');
    await expect(page.locator('#week-move-on')).toHaveCount(0);
  });

  test('shown on day 8 with 2 of 3 done — "Move on to Week 6 without C"', async ({ page }) => {
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 6 without C');
  });

  test('never shown at 0 done, even well past day 8', async ({ page }) => {
    // No logs seeded at all — Week 5 sits at 0 of 3.
    await mockDate(page, '2026-10-16T12:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('0 of 3');
    await expect(page.locator('#week-move-on')).toHaveCount(0);
  });

  test('tap → Week 6 opens; the moved-note + Undo appear under the header', async ({ page }) => {
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    // Day 8 (Sat) is itself an anchor day, so Week 6 opens immediately as the
    // live open week — not a pending gap (§2.4's #week-count table).
    await expect(page.locator('.week-line')).toContainText('0 of 3');
    await expect(page.locator('#week-moved-note')).toContainText('Week 5 closed at 2 of 3');
    await expect(page.locator('#week-undo')).toBeVisible();
  });

  test('a WEEKDAY tap: Week 6 is next but stays a gap until the coming Saturday — the note says so', async ({
    page,
  }) => {
    // Checker's should #3: every other WK3 test in this file taps on a
    // Saturday (DAY_8 itself is an anchor day, so Week 6 opens immediately).
    // canMoveOn only requires day 8+, not day 8 exactly — a tap on day 10
    // (still ≥8, but a Monday) is exactly as real. week.ts's own anchor rule
    // (her rule 1, "a week always has to start Sat or Sun") means the close
    // still happens right on her tap, but Week 6 doesn't OPEN until the next
    // Sat/Sun — this is NOT a decided-here behavior change (that's the
    // checker's "ask her": should a tap instead open immediately, like a
    // Round start?) — this test locks in what's actually built today and
    // proves the gap sub-label is honest about the wait, so nothing here
    // silently promises an immediate Week 6 that isn't real yet.
    const MONDAY_DAY_10 = '2026-10-05T12:00:00+03:00'; // Mon, day 10 (≥ day 8)
    await seedLogs(page, TWO_DONE);
    await mockDate(page, MONDAY_DAY_10);
    await page.goto('/');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 6 without C');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    // Week 6's NUMBER is assigned, but it's a gap, not a live open week —
    // the sub-label must say when it actually opens and where a session
    // logged now would count.
    await expect(page.locator('#week-sub')).toContainText('opens Sat');
    await expect(page.locator('#week-sub')).toContainText('counts as an extra for Week 5');
    await expect(page.locator('.week-line')).toContainText('0 of 3');
    // The button itself only ever renders on a LIVE open week (canMoveOn
    // needs a span) — during the gap there's nothing left to move on from.
    await expect(page.locator('#week-move-on')).toHaveCount(0);
    // The moved-note is still about today's real close (Week 5, moved_on) —
    // that part doesn't change just because Week 6 hasn't opened yet.
    await expect(page.locator('#week-moved-note')).toContainText('Week 5 closed at 2 of 3');
  });

  test('Undo → back to Week 5 open, "Move on" reappears (tombstone queued, not silently dropped)', async ({
    page,
  }) => {
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');
    await page.locator('#week-undo').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('2 of 3');
    await expect(page.locator('#week-move-on')).toHaveText('Move on to Week 6 without C');
    await expect(page.locator('#week-moved-note')).toHaveCount(0);
    // WK3 fix r1 (checker must #1): Undo no longer just empties the row —
    // it queues a delete tombstone the same way any other write in this app
    // queues offline (real sync is off under automation). See the dedicated
    // race test right below for why a plain empty-out was the actual bug.
    const moves = await readWeekMoves(page);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['round']).toBe(2);
    expect(moves[0]?.['week']).toBe(5);
    expect(moves[0]?.['deleted']).toBe(true);
    expect(moves[0]?.['synced']).toBe(false);
  });

  test('Undo holds even after a pull still carrying the row it undid — the tombstone outranks it', async ({
    page,
    context,
  }) => {
    // Checker's exact race (must #1): "If she tapped Move on while online (so
    // the row reached Supabase), then taps Undo while offline, or the DELETE
    // fails, the next pull ... merges the remote row back in as
    // synced:true. The week moves on again with no tap." Simulate the
    // "reached Supabase" half by hand (real sync is off under automation),
    // then prove the merge + a reopen both still show Week 5.
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 6');

    // Mark the row synced — as if the push had already reached Supabase
    // before she tapped Undo.
    await page.evaluate(() => {
      const raw = localStorage.getItem('workout-tracker:week-moves');
      const moves = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
      moves[0]!['synced'] = true;
      localStorage.setItem('workout-tracker:week-moves', JSON.stringify(moves));
    });

    await page.locator('#week-undo').click();
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    const afterUndo = await readWeekMoves(page);
    expect(afterUndo).toHaveLength(1);
    expect(afterUndo[0]?.['deleted']).toBe(true);
    expect(afterUndo[0]?.['synced']).toBe(false);

    // Feed a remote pull that STILL has the row (the DELETE hadn't landed
    // yet) through the real, pure merge function — the tombstone must win,
    // exactly like any other unsynced local write already does.
    const merged = await page.evaluate((local) => {
      const w = window as unknown as {
        __wtMergeWeekMoves: (local: unknown[], remote: unknown[]) => unknown[];
      };
      return w.__wtMergeWeekMoves(local, [
        { round: 2, week: 5, moved_at: (local[0] as { at: string }).at, missing: 'C' },
      ]);
    }, afterUndo);
    expect(merged).toEqual(afterUndo); // the tombstone, not the resurrected remote row

    // Write that merged (still-tombstoned) result to localStorage and open a
    // fresh page (this file's beforeEach clears storage on ITS OWN page's
    // navigations only — a new page in the same context sees real storage,
    // same trick the offline-queue test above uses) — Week 5, not a
    // silently-resurrected Week 6.
    await page.evaluate((m) => {
      localStorage.setItem('workout-tracker:week-moves', JSON.stringify(m));
    }, merged);
    const reopened = await context.newPage();
    await mockDate(reopened, DAY_8);
    await reopened.goto('/');
    await expect(reopened.locator('.home-header h1')).toContainText('Week 5');
    await expect(reopened.locator('.week-line')).toContainText('2 of 3');
  });

  test('a stale move (a week that was never the open one) is ignored, not thrown', async ({
    page,
  }) => {
    // week.ts's own rule (§2.1): a move for a week that isn't the currently
    // open one is stale and is ignored with a console.warn, never a throw.
    // round 2 week 99 was never open at any point in this fixture's history
    // — the exact shape a stray/duplicate pull from another phone could
    // leave behind — so Week 5 must stay exactly as it was.
    await seedLogs(page, TWO_DONE);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:week-moves',
        JSON.stringify([
          { round: 2, week: 99, at: '2026-09-27T08:00:00+03:00', missing: 'C', synced: true },
        ])
      );
    });
    const errors: string[] = [];
    const warnings: string[] = [];
    // WK3 fix r1 (checker should #4): the listeners used to attach AFTER
    // page.goto() — a throw during the very first render would have already
    // happened and the test would still pass. Attach both before goto, and
    // actually assert the console.warn §2.1 requires, not just "no throw".
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    await mockDate(page, DAY_8);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toContainText('Week 5');
    await expect(page.locator('.week-line')).toContainText('2 of 3');
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('ignoring a stale "move on"'))).toBe(true);
  });

  test('an offline tap queues (synced:false), survives a reload, and reconnecting never throws or drops it', async ({
    page,
    context,
  }) => {
    await seedLogs(page, TWO_DONE);
    await mockDate(page, DAY_8);
    await page.goto('/');
    await page.locator('#week-move-on').click();
    // Real sync is off under automation (never write to Supabase in tests) —
    // it stays pending exactly like a brand-new session saved offline would,
    // same as the edit-a-past-session offline test above.
    await expect(page.locator('#sync-indicator')).toHaveText('offline · 1 pending');

    const moves = await readWeekMoves(page);
    expect(moves).toHaveLength(1);
    expect(moves[0]?.['round']).toBe(2);
    expect(moves[0]?.['week']).toBe(5);
    expect(moves[0]?.['synced']).toBe(false);

    // Survives an app close — same trick the edit-offline test above uses: a
    // fresh page in the SAME context sees whatever real localStorage the tap
    // left behind (shared per-origin across pages in one context).
    const reopened = await context.newPage();
    const errors: string[] = [];
    reopened.on('pageerror', (e) => errors.push(String(e)));
    await mockDate(reopened, DAY_8);
    await reopened.goto('/');
    await expect(reopened.locator('#sync-indicator')).toHaveText('offline · 1 pending');
    await expect(reopened.locator('.home-header h1')).toContainText('Week 6');

    // Reconnecting fires the same flush a brand-new session's does
    // (flushPendingSyncs → pushWeekMove). No real network happens under
    // automation, so nothing here proves the server accepted it — this
    // proves the new routing doesn't throw or corrupt the queued row.
    await reopened.evaluate(() => window.dispatchEvent(new Event('online')));
    await reopened.waitForTimeout(200);
    expect(errors).toEqual([]);
    const movesAfter = await readWeekMoves(reopened);
    expect(movesAfter).toHaveLength(1);
    expect(movesAfter[0]?.['synced']).toBe(false);
  });

  test('the push payload + pure merge are exact (window hooks, no real network)', async ({
    page,
  }) => {
    await page.goto('/');
    const out = await page.evaluate(() => {
      const w = window as unknown as {
        __wtWeekMovePayload: (m: unknown) => unknown;
        __wtMergeWeekMoves: (local: unknown[], remote: unknown[]) => unknown[];
      };
      const payload = w.__wtWeekMovePayload({
        round: 2,
        week: 5,
        at: '2026-10-03T09:30:00+03:00',
        missing: 'C',
        synced: false,
      });
      // A remote row for a DIFFERENT week merges alongside an unsynced local
      // write for week 5 — the local unsynced write must win on content
      // (same "local unsynced wins" rule cycle_periods' merge already has).
      const merged = w.__wtMergeWeekMoves(
        [{ round: 2, week: 5, at: '2026-10-03T09:30:00+03:00', missing: 'C', synced: false }],
        [
          { round: 2, week: 5, moved_at: '2026-10-03T00:00:00+03:00', missing: 'BC' },
          { round: 2, week: 6, moved_at: '2026-10-11T00:00:00+03:00', missing: 'A' },
        ]
      );
      return { payload, merged };
    });
    expect(out.payload).toEqual({
      round: 2,
      week: 5,
      moved_at: '2026-10-03T09:30:00+03:00',
      missing: 'C',
    });
    expect(out.merged).toEqual([
      { round: 2, week: 5, at: '2026-10-03T09:30:00+03:00', missing: 'C', synced: false },
      { round: 2, week: 6, at: '2026-10-11T00:00:00+03:00', missing: 'A', synced: true },
    ]);
  });
});

// WK4 (Sep 27 2026) — PLAN-2026-09-26.md §2.6 "Remaining week sites": the
// weekly review pager, the Progress "Sessions per week" card, Settings About
// (its own test sits with the rest of Settings, above), the how-to "seen this
// week" key, walksThisWeek, and the saved-session plan lookup (planForLog) —
// everything §2.4/§7's own launch comment named as "WK4's job, not this
// one's". Her words that drove the underlying model: 21:32 "it says week 5 on
// top … I'm in week 4"; the launch instant is week.ts's own
// COMPLETION_WEEKS_FROM (Sat Sep 26 2026 22:30).
test.describe('WK4 (Sep 27 2026): weekly review / Progress / how-to / walks / saved-session plan', () => {
  type Row = Record<string, unknown>;

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };

  const log = (id: string, date: string, workout: 'A' | 'B' | 'C'): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    synced: true,
  });

  test('weekly review pages from the legacy calendar week (Week 4) into the completion model (Week 5) — a FIXED anchor, never "today minus N weeks"', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('thu-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('fri-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('sat-b', '2026-09-26T19:14:51+03:00', 'B'), // 22:14 local — before the 22:30 launch, closes legacy Week 4
      log('wk5-a', '2026-09-27T12:00:00+03:00', 'A'), // after the launch — Week 5's own first session
    ]);
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();

    // Page 0: the live completion span, "since" (no range yet, still open).
    await expect(page.locator('.review-title')).toHaveText('Week 5 · since Sat Sep 26');
    await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(1);
    await expect(page.locator('#next-week')).toBeHidden();
    await expect(page.locator('.weekly-review-open')).toHaveText('Week still open.');

    // Page 1: the pager falls through into the LEGACY calendar model, at the
    // FIXED Week-4 anchor — not whatever "today minus a week" would be.
    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 4 · Sep 19–25');
    await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(3);
    await expect(page.locator('.weekly-review-subtitle')).toContainText('3');

    // Back to page 0.
    await page.locator('#next-week').click();
    await expect(page.locator('.review-title')).toHaveText('Week 5 · since Sat Sep 26');
  });

  // v54 fix r3 (Sep 27 2026), checker's should #1 (round 3 — round 2's own
  // fix, right above r2's comment on this test file, only half-closed it):
  // "No sessions this week." directly above a "D · ... · extra ride" line
  // flatly contradicted itself — she DID ride, it just wasn't one of A/B/C.
  test('a D-only live week (no A/B/C yet) reads "None of A, B, C yet.", never the old blanket line that contradicted the D row below it', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('thu-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('fri-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('sat-b', '2026-09-26T19:14:51+03:00', 'B'), // before the launch — closes legacy Week 4 only
      {
        id: 'wk5-d',
        date: '2026-09-27T12:00:00+03:00', // Sun, inside Week 5, after the launch
        workout: 'D',
        capacityBefore: 6,
        capacityAfter: 7,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        synced: true,
      },
    ]);
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toHaveText('Week 5 · since Sat Sep 26');
    await expect(page.locator('.weekly-review-empty')).toHaveText('None of A, B, C yet.');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
    await expect(page.locator('.weekly-review-extra-row')).toContainText('D');
    await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');
  });

  // v55 (Sep 27 2026) — CHECK round 3 N1: a D ride dated in the GAP after a
  // weekday close (before the next Saturday) fell between every span's own
  // window — the closed week's own closedAt cut it off, and nothing had
  // opened yet to claim it either. It belongs to the week it follows, both
  // while still mid-gap and after the next week genuinely opens.
  test('a gap-dated D ride is listed under the CLOSED week it follows, mid-gap and after the next week opens', async ({
    page,
  }) => {
    const week5Rows = [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-b', '2026-09-28T10:00:00+03:00', 'B'),
      log('wk5-c', '2026-09-29T10:00:00+03:00', 'C'), // closes Week 5 on Tue, 3 of 3
      {
        id: 'wk5-d',
        date: '2026-09-30T10:00:00+03:00', // Wed — the gap, before Sat Oct 3
        workout: 'D' as const,
        capacityBefore: 6,
        capacityAfter: 7,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        synced: true,
      },
    ];
    await seedLogs(page, week5Rows);
    await mockDate(page, '2026-10-01T08:00:00+03:00'); // Thu — mid-gap, Week 6 still pending
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
    await expect(page.locator('.weekly-review-extra-row')).toContainText('D');
    await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');

    // Week 6 genuinely opens now (a real session on/after Sat Oct 3) — the
    // gap ride must STAY on Week 5's page, and Week 6's own page must not
    // pick it up just because it's now the "next" span.
    await seedLogs(page, [...week5Rows, log('wk6-a', '2026-10-03T10:00:00+03:00', 'A')]);
    await mockDate(page, '2026-10-05T08:00:00+03:00'); // Mon — Week 6 open, day 3
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('Week 6');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(0);
    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
    await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');
  });

  test('Progress · Sessions per week: a closed completion week reads "wk 5 · 3 / 3", never a recomputed calendar count', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-b', '2026-09-28T10:00:00+03:00', 'B'),
      log('wk5-c', '2026-09-29T10:00:00+03:00', 'C'), // closes Week 5 on Tue, 3 of 3
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00'); // Wed, mid-gap (Week 6 pending until Sat Oct 3)
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const spw = page.locator('.spw-card');
    // Scoped to the CURRENT (unfolded) rows only — Round 1 has its own,
    // unrelated "wk 5" folded under .spw-older, and an unscoped .spw-row
    // filter matches both.
    const wk5 = spw
      .locator(':scope > .spw-rows > .spw-row')
      .filter({ has: page.locator('.spw-label:text-is("wk 5")') });
    await expect(wk5.locator('.spw-count')).toHaveText('3 / 3');
    await expect(wk5.locator('.spw-track')).toHaveCount(1); // a real track, never held's "—"
  });

  test('Progress · Sessions per week: a moved-on week reads "moved on", the live week reads "open"', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-b', '2026-09-29T10:00:00+03:00', 'B'), // 2 of 3 — C never comes
    ]);
    // A move-on for Week 5, landing on the following Saturday (Oct 3, itself
    // an anchor day — Week 6 opens the same instant, no gap). Seeded directly
    // (bypassing the UI tap), same shape weekMovePayload writes.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:week-moves',
        JSON.stringify([
          { round: 2, week: 5, at: '2026-10-03T09:00:00+03:00', missing: 'C', synced: true },
        ])
      );
    });
    await mockDate(page, '2026-10-05T08:00:00+03:00'); // Mon, Week 6 open (day 3)
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const spw = page.locator('.spw-card');
    const wk5 = spw
      .locator(':scope > .spw-rows > .spw-row')
      .filter({ has: page.locator('.spw-label:text-is("wk 5")') });
    await expect(wk5.locator('.spw-count')).toHaveText('2 / 3 · moved on');
    const wk6 = spw
      .locator(':scope > .spw-rows > .spw-row')
      .filter({ has: page.locator('.spw-label:text-is("wk 6")') });
    await expect(wk6.locator('.spw-count')).toHaveText('0 / 3 · open');
  });

  test('planForLog: a post-launch A resolves Week 5’s own key, not the old swing/calendar model’s', async ({
    page,
  }) => {
    await seedLogs(page, [log('wk5-a', '2026-09-27T12:00:00+03:00', 'A')]);
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28, Week 5 day 3
    await page.goto('/');
    const key = await page.evaluate(() => {
      const w = window as unknown as {
        __wtPlanKeyForLog: (e: unknown) => unknown;
      };
      return w.__wtPlanKeyForLog({ id: 'wk5-a', date: '2026-09-27T12:00:00+03:00', workout: 'A' });
    });
    expect(key).toEqual({ round: 2, week: 5 });
  });

  test('planForLog: a session dated BEFORE the launch still resolves through the old calendar model (null key)', async ({
    page,
  }) => {
    await seedLogs(page, [log('wk4-a', '2026-09-24T15:56:00+03:00', 'A')]);
    await mockDate(page, '2026-09-24T15:00:00.000Z');
    await page.goto('/');
    const key = await page.evaluate(() => {
      const w = window as unknown as {
        __wtPlanKeyForLog: (e: unknown) => unknown;
      };
      return w.__wtPlanKeyForLog({ id: 'wk4-a', date: '2026-09-24T15:56:00+03:00', workout: 'A' });
    });
    expect(key).toBeNull();
  });

  test('the how-to "seen this week" key follows the completion model’s OPEN week post-launch, the calendar model pre-launch', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    const postLaunchKey = await page.evaluate(() =>
      (
        window as unknown as {
          __wtCurrentHowToWeekKey: () => { num: number; round: number };
        }
      ).__wtCurrentHowToWeekKey()
    );
    expect(postLaunchKey).toEqual({ num: 5, round: 2 });

    await mockDate(page, '2026-09-22T10:00:00.000Z'); // pre-launch, Tue — Week 4
    await page.goto('/');
    const preLaunchKey = await page.evaluate(() =>
      (
        window as unknown as {
          __wtCurrentHowToWeekKey: () => { num: number; round: number };
        }
      ).__wtCurrentHowToWeekKey()
    );
    // The pre-launch branch returns getProgramWeek()'s FULL object (start/end/
    // skippedLabel too, unchanged pre-existing shape) — only num/round matter
    // to howToWeekKey, so this checks those two, not exact equality.
    expect(preLaunchKey).toMatchObject({ num: 4, round: 2 });
  });

  test('walksThisWeek counts since the completion model’s own week start, not today’s calendar Saturday', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'workout-tracker:walks',
        JSON.stringify([
          { id: 'w1', date: '2026-09-20T10:00:00+03:00' }, // before Week 5 opened — doesn't count
          { id: 'w2', date: '2026-09-27T10:00:00+03:00' }, // after — counts
        ])
      );
    });
    await mockDate(page, '2026-09-28T08:00:00+03:00'); // Mon Sep 28 — Week 5, day 3
    await page.goto('/');
    await expect(page.locator('.walk-row .walk-text')).toContainText('1 this week');
  });
});

// T1 (Sep 27 2026), PLAN-2026-09-26.md §3/§7: her start/finish "Right?" +
// breaks chips + timing.ts. Her words, 22:33-22:36: "you don't know timing
// that's a big thing ... Maybe you could just say like starting workout is
// this the time so I don't always have to like check it and then it's not
// the time I'll correct it."
test.describe('T1 · Timing: her start/finish "Right?" + breaks', () => {
  type Row = Record<string, unknown>;

  // Same shape as 'v48 P1 data's own finishToPostLog (line ~4116) — that one
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
      const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
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
