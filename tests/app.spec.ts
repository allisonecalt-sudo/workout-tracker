import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

// v48 (Sep 24 2026): the full cue sits behind a closed "Cue ▸" — the card face
// carries only the one safety line. Tests that read the cue open it first.
// v48 · P3 (Sep 24 2026): the cardio CHOICE step has no Done · Next — its way
// on is the quiet "Skip cardio today" (#ww-skip). One tap forward on any step.
const NEXT = 'button:has-text("Done ·"), #ww-skip';

async function openCue(page: Page): Promise<void> {
  const toggle = page.locator('.cue-toggle[aria-expanded="false"]');
  if (await toggle.count()) await toggle.first().click();
}

// v48 · P4 (Sep 24 2026): home = the "Up next" hero + B/C chips — still three
// ways in (all data-workout), and the one week line carries the count.
test('home screen shows three workout options and zero sessions', async ({ page }) => {
  await expect(page.locator('.home-header h1')).toBeVisible();
  await expect(page.locator('button[data-workout]')).toHaveCount(3);
  await expect(page.locator('.home-hero')).toContainText('Workout A');
  await expect(page.locator('.home-hero')).toContainText('Lower Body + Core');
  await expect(page.locator('button.btn-chip[data-workout="B"]')).toHaveText('B · Glutes');
  await expect(page.locator('button.btn-chip[data-workout="C"]')).toHaveText('C · Cardio');
  await expect(page.locator('.week-line')).toContainText('0 of 3 this week');
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
  await expect(page.locator('.week-dots .week-dot')).toHaveCount(7);
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
  await expect(page.locator('.week-line')).toContainText('0 of 3 this week');
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
  await page.locator('#back-2').click();
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs[0]?.['capacityBefore']).toBe(7);
  expect(logs[0]?.['capacityAfter']).toBeNull();
  expect(logs[0]?.['backPain']).toBe(2);
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
  await expect(reopened.locator('.week-line')).toContainText('0 of 3 this week');
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
      await openCue(page);
      await expect(page.locator('.exercise-notes').first()).toContainText('Bodyweight this week');
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

test('swing (v46): Saturday morning with last week at 2 says today will count for it', async ({
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
      await expect(page.locator('.exercise-notes').first()).toContainText('40 → 45');
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
      fn({ date: '2026-09-07', workout: 'D', capacityBefore: 5, wallSitSec: 0 }),
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

test('weekly total (v34): a week with an unrecorded duration says how many sessions it counted', async ({
  page,
}) => {
  // `totalSec += log.durationSec ?? 0` folded a missing duration in as zero
  // minutes, so a 3-session week reported the total of 2 as if it were all 3.
  const out = await page.evaluate(() => {
    const mk = (id: string, date: string, durationSec?: number) => ({
      log: {
        id,
        date,
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        ...(durationSec === undefined ? {} : { durationSec }),
      },
      durationStr: '—',
    });
    const fn = (
      window as unknown as {
        __wtComputeWeekTotals: (s: unknown[]) => {
          count: number;
          totalSec: number;
          durationKnownCount: number;
        };
      }
    ).__wtComputeWeekTotals;
    const partial = fn([
      mk('a', '2026-09-07T15:00:00.000Z'), // no duration — logged after the fact
      mk('b', '2026-09-11T15:07:00.000Z', 1951),
      mk('c', '2026-09-11T15:25:00.000Z', 1099),
    ]);
    const complete = fn([mk('b', '2026-09-11T15:07:00.000Z', 1951)]);
    return { partial, complete };
  });
  // The zero-duration session must NOT drag the total down, and must be declared.
  expect(out.partial.totalSec).toBe(1951 + 1099);
  expect(out.partial.count).toBe(3);
  expect(out.partial.durationKnownCount).toBe(2);
  // A complete week says nothing extra.
  expect(out.complete.count).toBe(1);
  expect(out.complete.durationKnownCount).toBe(1);
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
  // Header should now be the weekly-review screen header (v48 · P6: in home's
  // words — "This week · … · Sep 19–25").
  await expect(page.locator('h2').first()).toContainText('This week');
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
    // Seed inside the current Sat–Fri week (computed at runtime, not hardcoded)
    // so the weekly-review screen actually surfaces this session.
    const now = new Date();
    const satOffset = (now.getDay() + 1) % 7; // Sat=0..Fri=6
    const saturday = new Date(now);
    saturday.setDate(now.getDate() - satOffset);
    saturday.setHours(12, 0, 0, 0);
    const logs = [
      {
        id: 'verbatim',
        date: saturday.toISOString(),
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

test('multi-week: Settings About shows Program weeks count (15)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#open-settings').click();
  await expect(page.locator('.settings-screen')).toBeVisible();
  // About section has a "Program weeks: 14" row
  // (11 round-1 weeks + R2 W1 + R2 W2 + R2 W3).
  await expect(
    page.locator('.settings-about-row').filter({ hasText: 'Program weeks' })
  ).toContainText('Program weeks: 15');
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
  await expect(page.locator('.week-line')).toContainText('of 3 this week');
  await page.locator('#open-weekly-review').click();
  const wrap = page.locator('.consistency-wrap');
  await expect(wrap).toHaveJSProperty('open', false);
  await expect(wrap.locator('.next-week-summary-label')).toHaveText('Week by week');
});

test('deploy hygiene: sw.js cache VERSION stays in sync with APP_VERSION', () => {
  // v25 shipped with sw.js still saying v24 — an installed PWA then kept the
  // old cache name and the new build didn't visibly land on her phone. The
  // sync rule was only a comment; this makes it a failing test instead.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const appVersion = /APP_VERSION = '(v\d+)'/.exec(appSrc)?.[1];
  const swVersion = /VERSION = 'workout-tracker-(v\d+)'/.exec(swSrc)?.[1];
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
  // Wall sit: 40 s, and the cue is DEEPER not longer (she held 38 s last week).
  expect(seen['Wall sit']).toContain('40 sec');
  expect(seen['Wall sit']).toContain('38');
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
  await expect(page.locator('.timer-display')).toHaveText('8:30');
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
  await expect(page.locator('.timer-display')).toHaveText('14:40');

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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
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

test('elliptical: the reading boxes + setup steps hide while the timer runs and come back when it ends', async ({
  page,
}) => {
  // The timer re-renders every second; a box shown mid-ride would lose what
  // she is typing. v48 · P3: the boxes exist only AFTER the ride (decision Q5),
  // and the setup never shows mid-ride or reopens after it.
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
  await expect(page.locator('.timer-label')).toHaveText('Running');
  await expect(page.locator('#ell-level-up')).toHaveCount(0);
  await expect(page.locator('#ww-outdoor')).toHaveCount(0);

  await advanceClock(page, 10 * 60_000 + 2_000);
  await expect(page.locator('#ell-km')).toBeVisible();
  await expect(page.locator('#ell-pulse')).toBeVisible();
  // v46: the ride ran — the card says so instead of resetting to
  // "Ready 10:00 / Start timer", and the back-out (which wipes the readings)
  // is gone. v48: the setup stays shut.
  await expect(page.locator('.timer-done')).toHaveText('✓ 10 min done');
  await expect(page.locator('#start-timed')).toHaveCount(0);
  await expect(page.locator('#ww-outdoor')).toHaveCount(0);
  await expect(page.locator('.ell-guide .ell-steps')).toHaveCount(0);
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

test('back (v47): Back steps to the previous exercise, is hidden on the first step, and crosses the round boundary', async ({
  page,
}) => {
  await mockDate(page, '2026-09-24T14:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // First step: nothing behind her → no Back.
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#step-back')).toHaveCount(0);

  await page.locator(NEXT).click();
  await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');
  await expect(page.locator('#step-back')).toBeVisible();
  await page.locator('#step-back').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('#step-back')).toHaveCount(0);

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
    ]) {
      expect(col in p).toBe(false);
    }
    expect(p['notes']).toBe(
      'cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee fine · duration not recorded — session was left open 4h before Done'
    );
    expect(p['walk_minutes']).toBe(10);
    expect(p['wall_sit_seconds']).toBe(45);
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

  test('(c) the split squat face shows the safety line, and the full cue only behind "Cue ▸"', async ({
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
    const cue = page.locator('.cue-toggle');
    await expect(cue).toContainText('Cue');
    await expect(cue).toHaveAttribute('aria-expanded', 'false');
    await cue.click();
    await expect(page.locator('.exercise-notes')).toContainText('Front foot flat, back heel up');
    await expect(page.locator('.exercise-notes')).toContainText('In for the squats in A');
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
    await expect(page.locator('#stop-timed')).toBeVisible();
    await expect(page.getByText('Running…')).toHaveCount(0);
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
    await expect(page.locator('.timer-display')).toHaveText('25');
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
    await page.locator('.cue-toggle').click(); // opened in round 1…
    await expect(page.locator('.exercise-notes')).toBeVisible();
    await toRoundBreak(page);
    await page.locator('#start-round-2').click();
    await goToStep(page, 'Supported split squat');
    await expect(page.locator('.round-indicator')).toHaveText('Main · Round 2 of 2');
    // …closed again in round 2 ("Round 2 notes closed").
    await expect(page.locator('.cue-toggle')).toHaveAttribute('aria-expanded', 'false');
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

  const tapForward = async (page: Page): Promise<boolean> => {
    const next = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
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
    await expect(page.locator('.timer-label')).toHaveText('Running');
    await expect(page.locator('.timer-display')).toHaveText('10:00');
    await expect(page.locator('#stop-lane')).toBeVisible();
    await expect(page.getByText('Running…')).toHaveCount(0);
    // Stop keeps what she did; the step shows the after-ride face.
    await advanceClock(page, 4 * 60_000);
    await expect(page.locator('.timer-display')).toHaveText('6:00');
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

  test('(f) after the ride: one card — level "—", km, kcal, time, pulse, in that order; untouched level saves null', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 10 * 60_000 + 2_000);
    await expect(page.locator('.timer-done')).toHaveText('✓ 10 min done');
    const card = page.locator('.ell-after-card');
    await expect(card.locator('.ell-readings-title')).toHaveText('From the machine, before STOP');
    await expect(card).toContainText('Level you rode at');
    await expect(page.locator('#ell-level')).toHaveText('—');
    await expect(page.locator('#ell-level-same')).toHaveCount(0); // no last level yet
    // v49 · look (Sep 25 2026): each reading is its own row, stacked — not the
    // old 2-column grid — so the order check is vertical (y), not horizontal.
    const lvl = (await page.locator('#ell-level').boundingBox())!;
    const km = (await page.locator('#ell-km').boundingBox())!;
    const kcal = (await page.locator('#ell-kcal').boundingBox())!;
    const time = (await page.locator('#ell-time').boundingBox())!;
    const pulse = (await page.locator('#ell-pulse').boundingBox())!;
    expect(lvl.y).toBeLessThan(km.y);
    expect(km.y).toBeLessThan(kcal.y);
    expect(kcal.y).toBeLessThan(time.y);
    expect(time.y).toBeLessThan(pulse.y);
    // v49: Time prefills from the app's own timer when it ran — "10:00" for a
    // ride that ran its full 10 minutes — with an "app timer" caption (v49 ·
    // look fix Sep 25 2026: shortened from "from the app", one line not three).
    await expect(page.locator('#ell-time')).toHaveValue('10:00');
    await expect(card).toContainText('app timer');
    // …and all five come before Done · Next (pinned at the bottom).
    const order = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '#ell-level, #ell-km, #ell-kcal, #ell-time, #ell-pulse, #next'
        ),
      ].map((e) => e.id)
    );
    expect(order).toEqual(['ell-level', 'ell-km', 'ell-kcal', 'ell-time', 'ell-pulse', 'next']);
    // The setup stays shut after the ride (it used to reopen here).
    await expect(page.locator('.ell-guide .ell-steps')).toHaveCount(0);
    await expect(page.locator('#next')).toHaveClass(/btn-primary/);
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

  const tapForward = async (page: Page): Promise<boolean> => {
    const next = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
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
      await expect(hero).toContainText('Lower Body + Core · 2 rounds · ~30 min');
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

    test('(g) Sat Sep 26 (no Week 5 encoded): the header says which plan is loaded, still one line', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-26T09:00:00.000Z');
      await page.goto('/');
      const h1 = page.locator('.home-header h1');
      await expect(h1).toHaveText("Round 2 · Week 5 · Week 4's plan");
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
      // "v4" was v48/v49-specific; match any "v<digits>" so this doesn't need
      // a hand-edit on every version bump.
      await expect(tag).toHaveText(/^v\d+ ·/);
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
      await expect(chip).toHaveText(id === 'B' ? 'B · Glutes' : 'C · Cardio');
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
    // The Saturday dot is still lit, and still opens its session (not the card).
    await page.locator('.week-dot.dot-C').click();
    await expect(page.locator('#app')).toContainText('Sat, Sep 19, 2026');
    await expect(page.locator('.week-line')).toHaveCount(0);
    await expect(page.locator('.weekly-review-subtitle')).toHaveCount(0);
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
    await mockDate(page, '2026-09-26T19:40:00.000Z');
    await seedLogs(page, [
      swingLog('thu-a', '2026-09-24T15:56:00.000Z', 'A'),
      swingLog('fri-c', '2026-09-25T11:53:00.000Z', 'C'),
      swingLog('sat-b', '2026-09-26T19:30:00.000Z', 'B'),
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
    await expect(page.locator('h2').first()).toContainText('This week');
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
    await expect(page.locator('.timer-display')).toHaveText('15');
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

  test('(d) back: "Something" opens a blank 1-10 row; tapping 4 saves 4', async ({ page }) => {
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
    expect(log['backPain']).toBe(4);
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

  test('(d2) back BEFORE: "Something" opens a blank 1-10 row; tapping 4 saves 4', async ({
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
    expect(log['backPainBefore']).toBe(4);
  });

  test('(d2) wrist BEFORE: "Something" opens a blank 1-10 row; tapping 3 saves 3, back stays untouched', async ({
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
    expect(log['wristPainBefore']).toBe(3);
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

  test('(f) arm feel: Right on the row and Easy on the curl save "curl=easy;row=right"', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Prone row'); // v48 final: display label, key unchanged
    await expect(page.locator('.arm-feel-label')).toHaveText('How did it feel?');
    await page.locator('[data-arm-step="row"][data-arm-feel="right"]').click();
    await expect(page.locator('[data-arm-step="row"][data-arm-feel="right"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Quiet: Done · Next is still the one sage on the step.
    await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
    await goToStep(page, '1 kg biceps curl');
    // Tap Hard, then change her mind: tap Hard again clears, then Easy.
    await page.locator('[data-arm-step="curl"][data-arm-feel="hard"]').click();
    await page.locator('[data-arm-step="curl"][data-arm-feel="hard"]').click();
    await expect(page.locator('[data-arm-step="curl"][aria-pressed="true"]')).toHaveCount(0);
    await page.locator('[data-arm-step="curl"][data-arm-feel="easy"]').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBe('curl=easy;row=right');
  });

  test('(f) arm feel: no tap on either move saves null; no chips on other moves', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Wall angels');
    await expect(page.locator('.arm-feel')).toHaveCount(0);
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBeNull();
  });

  test('(g) two easy sessions in a row: home asks about 2 kg; "Noted" hides it, also after a reload', async ({
    page,
    context,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      logRow('s1', '2026-09-19T15:00:00.000Z', 'curl=easy'),
      logRow('s2', '2026-09-22T15:00:00.000Z', 'curl=easy;row=easy'),
      logRow('s3', '2026-09-23T15:00:00.000Z', null), // a session with no feel — skipped
    ]);
    await page.goto('/');
    const card = page.locator('#twokg-card');
    await expect(card).toContainText('The 1 kg felt easy twice. Ask Lisa about 2 kg?');
    await expect(card.locator('#twokg-noted')).toHaveText('Noted');
    // A question, never a second primary: the hero keeps the one sage.
    await expect(card.locator('.btn-primary')).toHaveCount(0);
    await page.locator('#twokg-noted').click();
    await expect(page.locator('#twokg-card')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('workout-tracker:twokg-noted'))).toBe(
      's2'
    );
    // A fresh page in the same context (`page` clears storage on every load).
    const reopened = await context.newPage();
    await mockDate(reopened, THU_WEEK4);
    await reopened.goto('/');
    await expect(reopened.locator('.home-header h1')).toBeVisible();
    await expect(reopened.locator('#twokg-card')).toHaveCount(0);
    await reopened.close();
  });

  test('(g) one easy + one right: no 2 kg question', async ({ page }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      logRow('s1', '2026-09-19T15:00:00.000Z', 'curl=easy'),
      logRow('s2', '2026-09-22T15:00:00.000Z', 'curl=right'),
    ]);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toBeVisible();
    await expect(page.locator('#twokg-card')).toHaveCount(0);
  });

  test('(g) only one session with a feel: no 2 kg question yet', async ({ page }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [logRow('s1', '2026-09-22T15:00:00.000Z', 'curl=easy;row=easy')]);
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toBeVisible();
    await expect(page.locator('#twokg-card')).toHaveCount(0);
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
    // Four even tiles; one capacity tile ("6.0 → 7.0"), not two averages.
    await expect(page.locator('.weekly-review-total')).toHaveCount(4);
    await expect(page.locator('.weekly-review-totals')).toContainText('6.0 → 7.0');
    await expect(page.locator('.weekly-review-totals')).not.toContainText('avg capacity');
    // The live week has nothing after it: › is hidden.
    await expect(page.locator('#next-week')).toBeHidden();

    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 3 · Sep 12–18');
    const delta = page.locator('.weekly-review-delta');
    await expect(delta).toBeVisible();
    await expect(page.locator('.weekly-review-open')).toHaveCount(0);
    // 3 × 45 min vs 2 × 40 min: +55 minutes, printed with its unit.
    const time = delta.locator('.weekly-review-delta-row').filter({ hasText: 'total time' });
    await expect(time.locator('.weekly-review-delta-num')).toHaveText('↑ +55m');
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
      await expect(page.locator('.history-date').first()).toHaveText(/^Sat Sep 19 · 40 min/);
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
    // One Time row: "HH:MM–HH:MM · 33 min".
    const time = card.locator('.detail-row').filter({ hasText: 'Time' });
    await expect(time).toContainText(/\d\d:\d\d–\d\d:\d\d · 33 min/);
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
    await expect(page.locator('.gear-chip').nth(3)).toHaveText(
      '⬜ 2 kg · ask Lisa when the 1 kg feels easy'
    );
    await expect(app).not.toContainText('tell Claude');
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
      // Open the cue and the video on each step, so the closed text is read too.
      if (where.startsWith('step')) {
        const cue = page.locator('.cue-toggle[aria-expanded="false"]');
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

  test('(d) the version: home "v52.1 · <date, no year>", Settings "Build v52.1 · <full date>", sw.js v52.1', async ({
    page,
  }) => {
    const src = await (await page.request.get('/app.ts')).text();
    const version = /const APP_VERSION = '([^']+)'/.exec(src)?.[1];
    const built = /const BUILD_DATE = '([^']+)'/.exec(src)?.[1] ?? '';
    expect(version).toBe('v52.1');
    expect(built).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{2}:\d{2}$/);
    await expect(page.locator('.app-version')).toHaveText(
      `v52.1 · ${built.replace(/,\s*\d{4}/, '')}`
    );
    await page.locator('#open-settings').click();
    await expect(page.locator('#app')).toContainText(`Build v52.1 · ${built}`);
    const sw = await (await page.request.get('/sw.js')).text();
    expect(sw).toContain("'workout-tracker-v52.1'");
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
