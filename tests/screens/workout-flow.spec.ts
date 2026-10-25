// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import { setupPage, NEXT, COMPLETION_WEEKS_FROM_ISO, walkToPostLog, mockDate } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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
  // v61 (Sep 28 2026), spec item d: "of 4" now — D counts into the number
  // shown (never into closing the week).
  await expect(page.locator('.week-line')).toContainText('0 of 4 · A, B, C and D to go');
  // v49 · look (Sep 25 2026): the lifetime count moved off the week line and
  // onto the Start → Now card's "Sessions" row — which itself only appears
  // once there's at least one session (spec: "Only one count on Home").
  await expect(page.locator('.week-line')).not.toContainText('total');
  await expect(page.locator('.home-startnow-card')).toHaveCount(0);
  await expect(page.locator('#home-since-line')).toHaveCount(0); // v64: nothing saved yet, no line
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

test('pre-log wrist line: one grey line on A (pressure fine, the pain rule), no amber banner', async ({
  page,
}) => {
  // Group 2K, refreshed twice (May 10 → the Jul 3 wall-lean on-ramp → Sep 7:
  // "i can go on my arms i just have to stop with pain"). v48 · P5 (Sep 24
  // 2026): the 58-word amber box, the same every session, became ONE grey line
  // on workouts with a palm or grip move (DECISIONS §5). v60 (Sep 28 2026):
  // reworded off the alarm-toned "pain = stop" to the actual pain rule (hers
  // + Lisa via her) — pressure fine, back off if it's sharp/climbing/still
  // there tomorrow — and it still never says the old "cleared May 10" wording.
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.warning-banner')).toHaveCount(0);
  await expect(page.locator('.safety-line')).toHaveText(
    'Wrist + back: pressure fine — back off if it is sharp, climbing, or still there tomorrow.'
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
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
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
  // v64: the one "Your weeks since ..." line (no full week yet), not a Start → Now card.
  await expect(page.locator('.home-startnow-card')).toHaveCount(0);
  await expect(page.locator('#home-since-line')).toContainText('Your weeks since');
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
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
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
  // v60 (Sep 28 2026) F2: "Done · Finish" -> "Done stretching ✓".
  await page.locator('button:has-text("Done stretching")').click();
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
  // v61 (Sep 28 2026), spec item d: "of 4" now.
  await expect(page.locator('.week-line')).toContainText('0 of 4 · A, B, C and D to go');
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
  // v64: the Sessions row carries no capacity (it stays in Session detail); nothing invented.
  await expect(page.locator('.history-row .history-meta').first()).not.toContainText('cap');
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
