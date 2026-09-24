import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

// v48 (Sep 24 2026): the full cue sits behind a closed "Cue ▸" — the card face
// carries only the one safety line. Tests that read the cue open it first.
async function openCue(page: Page): Promise<void> {
  const toggle = page.locator('.cue-toggle[aria-expanded="false"]');
  if (await toggle.count()) await toggle.first().click();
}

test('home screen shows three workout options and zero sessions', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Workout Tracker');
  await expect(page.locator('button[data-workout]')).toHaveCount(3);
  await expect(page.locator('text=A · Lower Body + Core')).toBeVisible();
  await expect(page.locator('text=B · Glutes + Mobility + Core')).toBeVisible();
  await expect(page.locator('text=C · Cardio + Lower Body + Core')).toBeVisible();
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
  // Label reworded Sep 7 2026 (was "Capacity right now") — see the anchor-label
  // test below for why. This assertion only needs a marker that pre-log rendered.
  await expect(page.locator('text=not your mood')).toBeVisible();
  await expect(page.locator('button:has-text("Start")')).toBeVisible();
});

test('pre-log shows current wrist banner (Sep-7 bird dog, not stale wall-lean or May text)', async ({
  page,
}) => {
  // Group 2K, refreshed twice. May 2026: "cleared by Lisa Cohen (May 10)".
  // Jul 3 2026: the wall-lean on-ramp (her relay). Sep 7 2026: her relay
  // "i can go on my arms i just have to stop with pain" opened palms-on-floor
  // at the bird-dog rung, so the banner must name the bird dog and must NOT
  // regress to either older wording. This banner is the last thing she reads
  // before every session — it has to describe today's actual permission.
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.warning-banner')).toContainText('bird dog');
  await expect(page.locator('.warning-banner')).not.toContainText('wall-lean on-ramp');
  await expect(page.locator('.warning-banner')).not.toContainText('May 10');
});

test('pre-log capacity slider asks about the BODY, not mood, and shows anchor labels', async ({
  page,
}) => {
  // Group 2L: anchor labels. Reworded Sep 7 2026 — she said of her three
  // Round-2 logs "5 is just my mood its getting beter ... but stil lets say
  // now at 8", i.e. the slider had been collecting a mood reading under a
  // capacity label, which quietly invalidated the under-recovery watch
  // signal (capacity-after < capacity-before for 2+ sessions → dial back).
  // The label now says which one it wants; the anchors avoid mood words.
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.label-text').first()).toContainText('not your mood');
  await expect(page.locator('.range-anchors').first()).toContainText('running on empty');
  await expect(page.locator('.range-anchors').first()).toContainText('an ordinary day');
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
    // Matches both the stepped "Done · Next" and the cool-down list's
    // single "Done · Finish" button.
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    if (phase.includes('Cool-down')) {
      reachedStretch = true;
      break;
    }
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    const nextBtn = page.locator('button:has-text("Done · Next"), #start-round-2');
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
    await page.locator('button:has-text("Done · Next")').click();
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

test('capacity slider updates value display', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  const slider = page.locator('#cap-before');
  await slider.fill('8');
  await expect(page.locator('#cap-before-val')).toHaveText('8');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else return;
  }
}

test('untouched sliders (v46): a workout with no slider moved saves null, not 5/5/0', async ({
  page,
}) => {
  await page.locator('button[data-workout="C"]').click();
  // The pre-log slider still SHOWS 5 as its starting position.
  await expect(page.locator('#cap-before-val')).toHaveText('5');
  await page.locator('button:has-text("Start")').click();
  await walkToPostLog(page);
  await expect(page.locator('#cap-after-val')).toHaveText('5');
  await expect(page.locator('#back-val')).toHaveText('0');
  await page.locator('button:has-text("Save & finish")').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs).toHaveLength(1);
  expect(logs[0]?.['capacityBefore']).toBeNull();
  expect(logs[0]?.['capacityAfter']).toBeNull();
  expect(logs[0]?.['backPain']).toBeNull();
  // And the row reads "—", never an invented number.
  await expect(page.locator('.last-line')).toContainText('capacity —→—');
});

test('untouched sliders (v46): a slider she DID move saves her number; the others stay null', async ({
  page,
}) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('#cap-before').fill('7');
  await page.locator('button:has-text("Start")').click();
  await walkToPostLog(page);
  await page.locator('#back').fill('2');
  await page.locator('button:has-text("Save & finish")').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs[0]?.['capacityBefore']).toBe(7);
  expect(logs[0]?.['capacityAfter']).toBeNull();
  expect(logs[0]?.['backPain']).toBe(2);
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
  await page.locator('button:has-text("Done · Next")').click();
  await page.locator('button:has-text("Done · Next")').click();
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
  await page.locator('button:has-text("Done · Next")').click();
  await expect(page.locator('.exercise-visual')).toBeVisible();
});

// Allison 2026-06-06: every actual exercise shows a PICTURE + a video. Exercises
// with no curated JPG promote their how-to illustration to the main screen
// instead of showing only a "watch video" poster.
test('video-only exercise still shows a picture, with the video one tap away', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // Off the walk → Belly breathing (no loop JPG; promotes its how-to SVG).
  await page.locator('button:has-text("Done · Next")').click();
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
  await page.locator('button:has-text("Done ·")').click();
  await page.locator('button:has-text("Done ·")').click();
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
  page.on('dialog', (d) => {
    void d.accept();
  });
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('button:has-text("Done ·")').click();
  await page.locator('.quit-link').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');

  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('h1')).toHaveText('Workout Tracker');
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
  await expect(reopened.locator('h1')).toHaveText('Workout Tracker');
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
  await expect(reopened.locator('.history-row')).toHaveCount(1);
  // Duration is unknown → "—", never a multi-day number.
  await expect(reopened.locator('.history-date').first()).toContainText('—');

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
  await expect(reopened.locator('.stat-number').first()).toHaveText('0');
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
  await expect(page.locator('.week-banner')).toContainText('Round 2 · Week 3');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
  await expect(page.locator('.week-banner')).toContainText('Week 2');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
  await expect(page.locator('.week-banner')).toContainText('Week 4');

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
  await expect(page.locator('.week-banner')).toContainText('Week 4');

  const meta = page.locator('.consistency-wrap .next-week-summary-meta');
  await expect(meta).toContainText('0 of 3 this week');
  await expect(meta).toContainText('Sat counted for last week');

  await page.locator('.consistency-wrap > summary').click();
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
  const meta = page.locator('.consistency-wrap .next-week-summary-meta');
  await expect(meta).toContainText('1 of 3 this week');
  await expect(meta).not.toContainText('Sat counted');
  await page.locator('.consistency-wrap > summary').click();
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
  const meta = page.locator('.consistency-wrap .next-week-summary-meta');
  await expect(meta).toContainText('1 of 3 this week');
  await expect(meta).not.toContainText('Sat counted');
  await page.locator('.consistency-wrap > summary').click();
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(2);
});

// v46: the swing must show where the big number is. On the Saturday night she
// closed Week 3, home read "0 OF 3 THIS WEEK" next to a lit Saturday dot — the
// win invisible at the moment she earned it (UX audit Sep 24).
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
  const card = page.locator('.streak-stat .stat-block').first();
  await expect(card.locator('.stat-number')).toHaveText('3');
  await expect(card.locator('.stat-label')).toContainText('R2 · Week 3 closed ✓');
  await expect(page.locator('.swing-note')).toHaveCount(0);
  // The next morning (Sunday) it is a new week again — the v42 wording holds.
  await mockDate(page, '2026-09-20T10:00:00.000Z');
  await page.goto('/');
  await expect(page.locator('.streak-stat .stat-number').first()).toHaveText('0');
  await expect(page.locator('.streak-stat .stat-label').first()).toHaveText('of 3 this week');
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
  await expect(page.locator('.streak-stat .stat-number').first()).toHaveText('0');
  await expect(page.locator('.swing-note')).toHaveText(
    "Last week's at 2 — today's session will count for it."
  );
});

// v46: only completed program weeks are judged. Break + sick weeks and the week
// in progress were counted as misses, turning 13 of 13 training weeks into
// "13 of 21" (UX audit Sep 24).
test('progress (v46): "Hit target" counts training weeks only — no break, sick or in-progress weeks', async ({
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
  // 21 calendar weeks since May 2 = 11 R1 program weeks + 1 sick + 5 break +
  // 3 completed R2 weeks + the current one → 14 judged; the two 3/3 weeks hit.
  await expect(card.locator('.progress-card-meta')).toContainText('2 of 14 training weeks');
  // The bars still show every week, breaks included.
  await expect(card).toContainText('break');
  await expect(card).toContainText('now');
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
    if (name.includes('Bodyweight hip hinge')) {
      // Catch-up, not a raise: the hinge now says she holds the 1 kg.
      await expect(page.locator('.exercise-reps')).toContainText('holding the 1 kg');
    }
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
  await expect(page.locator('.week-banner')).toContainText('Week 3');
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('body')).toContainText('Bodyweight squats');
  await expect(page.locator('body')).not.toContainText('Supported split squat');
  await expect(page.locator('body')).not.toContainText('holding the 1 kg');
});

test('R2 W3: gear card no longer says the band is waiting for a future week', async ({ page }) => {
  const gear = page.locator('.gear-card');
  await gear.locator('.gear-summary').click();
  await expect(gear).toContainText('IN your workout as of Week 3');
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
      const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    const nextBtn = reopened.locator('button:has-text("Done ·"), #start-round-2');
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
  await reopened.locator('button:has-text("Save & finish")').click();
  await expect(reopened.locator('h1')).toHaveText('Workout Tracker');

  const row = await reopened.evaluate(
    (logsKey) =>
      (JSON.parse(localStorage.getItem(logsKey) ?? '[]') as Array<Record<string, unknown>>)[0],
    LOGS_KEY
  );
  expect(row).toBeDefined();
  expect(row!['durationSec']).toBeUndefined();
  expect(String(row!['notes'])).toContain('left open');
  await expect(reopened.locator('.history-date').first()).toContainText('—');
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
  await page.locator('button:has-text("Done ·")').click();
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
  await page.locator('button:has-text("Done ·")').click(); // past the card-less walk step
  await page.locator('.detail-section-toggle', { hasText: "Do & Don't" }).click();
  await expect(page.locator('.detail-cue-do').first()).toBeVisible();
  await expect(page.locator('.detail-cue-dont').first()).toBeVisible();
});

test('detail card: face shows the voice note + muscle target on the first exercise', async ({
  page,
}) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('button:has-text("Done ·")').click(); // past the card-less walk step
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
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'spark-2',
        date: '2026-05-14T10:00:00.000Z',
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
        date: '2026-05-11T10:00:00.000Z',
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
  // Recent-workouts list on home should now have a sparkline on the newest row
  // (the one whose trend includes itself + the older value = 2 points).
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
  // The "Weekly review →" link sits below the consistency card.
  const reviewBtn = page.locator('#open-weekly-review-link');
  await expect(reviewBtn).toBeVisible();
  await reviewBtn.click();
  // Header should now be the weekly-review screen header.
  await expect(page.locator('h2').first()).toContainText('Week of');
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
  await page.locator('#open-weekly-review-link').click();
  // 2 of 3 — the count number in the subtitle.
  const subtitle = page.locator('.weekly-review-subtitle');
  await expect(subtitle).toContainText('Sessions:');
  await expect(subtitle.locator('strong')).toHaveText('2');
  // Two session cards rendered.
  await expect(page.locator('.weekly-review-session')).toHaveCount(2);
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
  await page.locator('#open-weekly-review-link').click();
  const wordEl = page.locator('.weekly-review-session-word').first();
  await expect(wordEl).toBeVisible();
  await expect(wordEl).toContainText('gooood start');
});

test('ship 4: weekly review empty state for week with no sessions', async ({ page }) => {
  // No logs → empty state. Subtle line, no nudge, no motivational language.
  await page.goto('/');
  await page.locator('#open-weekly-review-link').click();
  await expect(page.locator('.weekly-review-empty')).toBeVisible();
  await expect(page.locator('.weekly-review-empty')).toContainText('No sessions this week');
  // No motivational language — the empty state should NOT contain "great",
  // "keep going", "you got this", etc. The system reports, doesn't judge.
  const empty = await page.locator('.weekly-review-empty').textContent();
  expect(empty?.toLowerCase()).not.toContain('great');
  expect(empty?.toLowerCase()).not.toContain('keep going');
  expect(empty?.toLowerCase()).not.toContain('you got');
});

// --- COOLER-LOOK (2026-05-15 evening) -----------------------------------------
//
// Layer of modern visual interest on top of D-1: gradients, restrained glass,
// spring-physics motion, workout-card monograms. These tests lock in:
//  - new motion + glass tokens exist on :root
//  - workout-picker tiles render an aria-hidden monogram with the workout letter
//  - today's-pick card has the accent-tinted gradient + accent glow
//
// If a future change strips the depth tokens or removes the monogram, one of
// these tests fires.

test('cooler-look: motion + glass design tokens are defined on :root', async ({ page }) => {
  // Spring easing constant + base duration + glass background must resolve.
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
  expect(tokens.easeSpring).toContain('cubic-bezier');
  expect(tokens.durBase).toBeTruthy();
  expect(tokens.glassBg).toContain('rgba');
  // The hero gradient is the differentiator vs the plain surface gradient.
  expect(tokens.gradSurface).toBeTruthy();
  expect(tokens.gradHero).toBeTruthy();
  expect(tokens.gradHero).not.toBe(tokens.gradSurface);
});

test('cooler-look: workout-picker tiles render an aria-hidden monogram letter', async ({
  page,
}) => {
  // Each workout-card has a .workout-card-monogram with the workout letter
  // (A / B / C), positioned behind the text at low opacity. aria-hidden so
  // screen readers don't double-announce.
  const monograms = page.locator('.workout-card .workout-card-monogram');
  await expect(monograms).toHaveCount(3);
  await expect(monograms.nth(0)).toHaveText('A');
  await expect(monograms.nth(1)).toHaveText('B');
  await expect(monograms.nth(2)).toHaveText('C');
  // aria-hidden so the row's accessible name stays clean.
  await expect(monograms.first()).toHaveAttribute('aria-hidden', 'true');
});

test("cooler-look: today's-pick card uses gradient + glow, not flat fill", async ({ page }) => {
  // Empty history → A is today's pick (per existing test). Its computed
  // background-image should resolve to a non-"none" gradient (the --grad-hero
  // accent-tinted surface) AND its box-shadow should be non-"none" (the
  // --glow-accent inset + soft outer glow).
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
  // Hero gradient resolves to a CSS image, not "none".
  expect(styles.backgroundImage).toContain('gradient');
  // Glow shadow renders (not "none").
  expect(styles.boxShadow).not.toBe('none');
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
  // Subtitle reports session count since program start.
  await expect(page.locator('.progress-subtitle')).toContainText('since May 2');
});

test('ship 5: wall-sit line chart renders with 2+ wall-sit values', async ({ page }) => {
  // Seed three A-workouts with rising wall-sit values across the program.
  // Progress screen should render the wall-sit chart with a 6px emphasized
  // last-point and a dashed max guideline.
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'p-3',
        date: '2026-05-15T10:00:00.000Z',
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
        date: '2026-05-11T10:00:00.000Z',
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
        date: '2026-05-05T10:00:00.000Z',
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
  // Big stat shows max wall-sit (30s) as the headline number.
  await expect(page.locator('.progress-stat-big')).toContainText('30s');
  // At least one progress-chart SVG renders for wall sit.
  await expect(page.locator('.progress-chart').first()).toBeVisible();
  // Calm delta line — "+12s since first session" (30 - 18). No motivational
  // language allowed: must NOT contain "great", "amazing", "you", etc.
  const delta = await page.locator('.progress-card-meta').first().textContent();
  expect(delta).toContain('+12s');
  expect(delta?.toLowerCase()).not.toContain('great');
  expect(delta?.toLowerCase()).not.toContain('you got');
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
  // Bar chart SVG exists. Its <rect> bars only render for backPain > 0
  // rows — so we expect exactly 2 bars (backPain = 1 and backPain = 3).
  const barChart = page.locator('.progress-chart-bar');
  await expect(barChart).toBeVisible();
  const barCount = await barChart.locator('rect').count();
  expect(barCount).toBe(2);
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
  // Five section cards (Audio, Timing, Display, Data, About).
  await expect(page.locator('.settings-section-label')).toHaveCount(5);
  // Back returns to home.
  await page.locator('#back-home').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');
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
  // Heading "What's in this workout" plus a Week 3 badge.
  await expect(page.locator('.overview-week-badge')).toHaveText(/Week 3/);
});

test('multi-week: Week 4 content active for May 25 (Session A holds — squats 12, plank 1x15s)', async ({
  page,
}) => {
  await mockDate(page, '2026-05-25T10:00:00.000Z'); // Mon May 25 = Week 4
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // Badge says Week 4.
  await expect(page.locator('.overview-week-badge')).toHaveText(/Week 4/);
  // Open the Main phase and verify Week 4 numbers are encoded.
  await page.locator('.overview-phase').nth(1).locator('summary').click();
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
    await page.locator('button:has-text("Done · Next")').click();
  }
  await expect(page.locator('.exercise-name')).toHaveText('Bodyweight squats');
  await expect(page.locator('.exercise-reps')).toContainText('12');
});

test('multi-week: "Coming next week" preview renders on home with diff', async ({ page }) => {
  await mockDate(page, '2026-05-18T10:00:00.000Z'); // Week 3 — next is Week 4
  await page.goto('/');
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
  await expect(page.locator('.week-banner')).toContainText('Week 3');
});

test('sick week Jul 11-17 holds a blank slot and Jul 18-24 is Week 11', async ({ page }) => {
  // Her calls Jul 17+19 2026: the sick week stays blank and doesn't count
  // ("it should be week 11" + "show a space for the missing week").
  await mockDate(page, '2026-07-19T10:00:00.000Z'); // Sun in the resume week
  await page.goto('/');
  // Banner: the skipped week doesn't advance the count — Week 11, not 12.
  await expect(page.locator('.week-banner')).toContainText('Week 11');
  // The weekly grid keeps a visible row for the missed week, labeled Sick,
  // with all 3 slots empty.
  const sickRow = page.locator('.weekly-row').filter({ hasText: 'Sick' });
  await expect(sickRow).toHaveCount(1);
  await expect(sickRow.locator('.weekly-slot-empty')).toHaveCount(3);
});

test('home order: workout picker sits first, Consistency is collapsed by default', async ({
  page,
}) => {
  // Her call Aug 30 2026: "consistency should be collapsible and the
  // workouts should be first."
  await page.goto('/');
  const wrap = page.locator('.consistency-wrap');
  await expect(wrap).toHaveJSProperty('open', false);
  // Summary still shows the streak number while collapsed.
  await expect(wrap.locator('.next-week-summary-meta')).toContainText('of 3 this week');
  // The picker renders above the consistency section.
  const pickerBox = await page.locator('.workout-picker').boundingBox();
  const consistencyBox = await wrap.boundingBox();
  expect(pickerBox!.y).toBeLessThan(consistencyBox!.y);
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
  await expect(page.locator('.week-banner')).toContainText('Round 2 · Week 1');
  // Pre-log overview badge carries the round too.
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.overview-week-badge')).toHaveText(/R2 · Week 1/);
});

test('round 2: break weeks Jul 25–Aug 28 hold blank labeled rows, round-1 weeks keep plain labels', async ({
  page,
}) => {
  await mockDate(page, '2026-08-30T15:00:00.000Z');
  await page.goto('/');
  // Consistency is collapsed by default (v26) — expand it to see the rows.
  await page.locator('.consistency-wrap > summary').click();
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
  const streakBefore = await page.locator('.streak-stat .stat-number').first().textContent();
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  await page.locator('#log-walk-start').click();
  await expect(page.locator('.walk-text')).toContainText('Walking since');
  await expect(page.locator('#finish-walk')).toBeVisible();
  await page.locator('#finish-walk').click();
  await expect(page.locator('.walk-text')).toContainText('1 this week');
  await expect(page.locator('.streak-stat .stat-number').first()).toHaveText(streakBefore ?? '0');
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
  await expect(page.locator('#lite-toggle')).toContainText('Lite day');
  await page.locator('button:has-text("Start")').click();
  // C's warmup is the walk step — advance past it into the main block.
  await page.locator('button:has-text("Done ·")').click();
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

  test('outdoor walk accumulates km from GPS movement', async ({ page, context }) => {
    // Jul 4 2026 — her call: screen stays awake, GPS tracks distance.
    // Mock fixes arrive with accuracy 0 (passes the <=25 m quality gate);
    // each ~55 m hop must bank displacement into the live line.
    await page.locator('#log-walk-start').click();
    await expect(page.locator('#walk-live')).toBeVisible();
    await context.setGeolocation({ latitude: 31.7715, longitude: 35.2137 });
    await context.setGeolocation({ latitude: 31.772, longitude: 35.2137 });
    await expect(page.locator('#walk-live')).toContainText('km', { timeout: 15000 });
    await page.locator('#finish-walk').click();
    await expect(page.locator('.walk-text')).toContainText('1 this week');
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
  await expect(page.locator('.week-banner')).toContainText('Round 2 · Week 2');
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.overview-week-badge')).toHaveText(/Week 2/);
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#word').fill('inside');
  await page.locator('button:has-text("Save & finish")').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');

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
  // No history → the first-ride guess, labelled as a guess.
  await expect(page.locator('#ell-level')).toHaveText('5');
  await expect(page.locator('.ww-start-block .gear-note')).toContainText('only a guess');
  await page.locator('#ell-level-up').click();
  await page.locator('#ell-level-up').click();
  await expect(page.locator('#ell-level')).toHaveText('7');
  await page.locator('#ell-level-down').click();
  await expect(page.locator('#ell-level')).toHaveText('6');
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
  await mockDate(page, '2026-09-24T08:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-elliptical').click();
  await expect(page.locator('.timer-display')).toHaveText('25:00');
  await page.locator('#ell-level-up').click();
  await page.locator('#ell-level-up').click();
  await expect(page.locator('#ell-level')).toHaveText('7');
  // Copied off the machine's screen after the ride.
  await page.locator('#ell-km').fill('2.15');
  await page.locator('#ell-pulse').fill('128');

  for (let i = 0; i < 30; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#word').fill('smooth');
  await page.locator('#session-note').fill('Knee fine, legs heavy on the elliptical');
  await page.locator('button:has-text("Save & finish")').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');

  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as Array<Record<string, unknown>>;
  expect(logs.length).toBe(1);
  // v48: the readings off the machine's screen are numbers in their own fields,
  // and her note is its own field, verbatim — nothing is glued into `notes`.
  expect(logs[0]?.['cardioLane']).toBe('elliptical');
  expect(logs[0]?.['cardioMinutes']).toBe(25);
  expect(logs[0]?.['ellipticalLevel']).toBe(7);
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

test('elliptical: the next ride starts at the level from the last saved session', async ({
  page,
}) => {
  await mockDate(page, '2026-09-24T08:00:00.000Z');
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
  await page.locator('#ww-elliptical').click();
  await expect(page.locator('#ell-level')).toHaveText('8');
  await expect(page.locator('.ww-start-block .gear-note')).toContainText('last level (8)');
  // v46: she knows the machine now — the setup is a one-line expander above
  // the timer, closed until tapped.
  const guide = page.locator('.ell-guide');
  await expect(guide.locator('.detail-section-toggle')).toContainText('Set up the machine');
  await expect(guide.locator('.ell-steps')).toHaveCount(0);
  const guideBox = await guide.boundingBox();
  const timerBox = await page.locator('.timer-card').boundingBox();
  expect(guideBox!.y).toBeLessThan(timerBox!.y);
  await guide.locator('.detail-section-toggle').click();
  await expect(guide.locator('.ell-steps')).toHaveCount(2);
  await expect(guide).toContainText('MANUAL');
  // The ride step no longer says "First ride" on every ride.
  await expect(guide).not.toContainText('First ride:');
  await expect(guide).toContainText('Not sure of your level?');
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
  // she is typing. So the boxes (and the setup card) only show while stopped.
  await movableClock(page, '2026-09-24T08:00:00.000Z', { skipPreCountdown: true });
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-elliptical').click();
  await expect(page.locator('#ell-km')).toBeVisible();
  await expect(page.locator('#ell-pulse')).toBeVisible();
  // First ride (no level on record) → the setup expander is open by default.
  await expect(page.locator('.ell-guide')).toContainText('Setting up the machine');
  await expect(page.locator('.ell-guide')).toContainText('MANUAL');
  // v46 order: setup ABOVE the timer, readings BELOW it (she reads it in the
  // order she uses it), and the back-out is still offered before the ride.
  const guideBox = await page.locator('.ell-guide').boundingBox();
  const timerBox = await page.locator('.timer-card').boundingBox();
  const kmBox = await page.locator('#ell-km').boundingBox();
  expect(guideBox!.y).toBeLessThan(timerBox!.y);
  expect(kmBox!.y).toBeGreaterThan(timerBox!.y);
  await expect(page.locator('#ww-outdoor')).toBeVisible();
  await expect(page.locator('.ww-start-block .gear-note')).toContainText('the level you rode at');

  await page.locator('#start-timed').click();
  await expect(page.locator('#ell-km')).toHaveCount(0);
  // Mid-ride the steps fold away (the card sits above the countdown), but the
  // expander stays one tap away.
  await expect(page.locator('.ell-guide .ell-steps')).toHaveCount(0);
  await expect(page.locator('.ell-guide .detail-section-toggle')).toBeVisible();
  await expect(page.locator('.timer-label')).toHaveText('Running');
  // The level stepper stays usable mid-ride.
  await expect(page.locator('#ell-level-up')).toBeVisible();

  await advanceClock(page, 10 * 60_000 + 2_000);
  await expect(page.locator('#ell-km')).toBeVisible();
  await expect(page.locator('#ell-pulse')).toBeVisible();
  // v46: the ride ran — the card says so instead of resetting to
  // "Ready 10:00 / Start timer", and the back-out (which wipes the readings)
  // is gone.
  await expect(page.locator('.timer-done')).toHaveText('✓ 10 min done');
  await expect(page.locator('#start-timed')).toHaveCount(0);
  await expect(page.locator('#ww-outdoor')).toHaveCount(0);
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
    const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  await expect(page.locator('#session-note')).toBeVisible();
  await page.locator('#session-note').fill('skipped the bird dog, wrist tired');
  await page.locator('button:has-text("Save & finish")').click();
  await expect(page.locator('h1')).toHaveText('Workout Tracker');
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

  await page.locator('button:has-text("Done ·")').click();
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
    await page.locator('button:has-text("Done ·")').click();
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
      const nextBtn = page.locator('button:has-text("Done ·"), #start-round-2');
      if (await nextBtn.isVisible()) await nextBtn.click();
      else break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
  }

  async function saveAndReadLog(page: import('@playwright/test').Page): Promise<Row> {
    await page.locator('button:has-text("Save & finish")').click();
    await expect(page.locator('h1')).toHaveText('Workout Tracker');
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
      localStorage.setItem('workout-tracker:ww-lane-done-min', '10');
    });
    const log = await saveAndReadLog(page);
    const p = await payloadOf(page, log);
    expect(p['cardio_lane']).toBe('elliptical');
    expect(p['cardio_minutes']).toBe(10);
    expect(p['elliptical_level']).toBe(7);
    expect(p['elliptical_km']).toBe(1.4);
    expect(p['elliptical_pulse']).toBe(128);
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
    // Her note is in the shape of the old marker — and is NOT read as her level.
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('#ell-level')).toHaveText('5');
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
    await page.locator('button:has-text("Done ·")').click(); // past the cardio step
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
      if (name.includes('Bodyweight hip hinge')) {
        await expect(page.locator('.exercise-reps')).toContainText(
          '12 reps · 2 sets each round · holding the 1 kg'
        );
        return;
      }
      await page.locator('button:has-text("Done ·"), #start-round-2').click();
    }
    throw new Error('never reached the hip hinge');
  });

  test('(i) the next ride reads the level column first, and a marker-only legacy row still works', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
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
      await page.locator('#ww-elliptical').click();
      await expect(page.locator('#ell-level')).toHaveText(expected);
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
    ]) {
      expect(col in p).toBe(false);
    }
    expect(p['notes']).toBe(
      'cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee fine · duration not recorded — session was left open 4h before Done'
    );
    expect(p['walk_minutes']).toBe(10);
    expect(p['wall_sit_seconds']).toBe(45);
  });

  test('session detail shows her note verbatim under "Your note", apart from system notes', async ({
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
    await expect(page.locator('.detail-card')).toContainText('Your note');
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

  // One tap forward: Done · Next / Done · Finish, or "Start round 2" on the
  // round-break screen. Returns false once nothing is left to tap.
  const tapForward = async (page: Page): Promise<boolean> => {
    if (await page.locator('#start-round-2').isVisible()) {
      await page.locator('#start-round-2').click();
      return true;
    }
    const next = page.locator('#next');
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
      await page.locator('#next').click();
    }
    await expect(page.locator('#start-round-2')).toBeVisible();
    return lastName;
  };

  const saveAndRead = async (page: Page): Promise<Row> => {
    await page.locator('button:has-text("Save & finish")').click();
    await expect(page.locator('h1')).toHaveText('Workout Tracker');
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
          : page.locator('#next');
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
        await page.locator('#next').click();
      }
      if (await page.locator('text=Quick log').isVisible()) break;
      if (await page.locator('#start-round-2').isVisible()) continue;
      const [idx, n] = await read();
      expect(n).toBe(total);
      expect(idx).toBe(prev + 1);
      prev = idx;
      labels.add((await page.locator('.round-indicator').textContent()) ?? '');
    }
    expect(prev).toBe(total); // the cool-down list is the last step
    expect([...labels]).toEqual(
      expect.arrayContaining([
        'Warm-up',
        'Main · Round 1 of 2',
        'Main · Round 2 of 2',
        'Upper back',
        'Cool-down',
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
    await goToStep(page, 'Bodyweight hip hinge');
    await expect(page.locator('.new-tonight-badge')).toHaveCount(0);
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
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await seedLogs(page, [aLog('seed-43', '2026-09-15T15:00:00.000Z', 43)]);
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
    await expect(page.locator('.round-indicator')).toHaveText('Cool-down · lite');
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
    const box = (await page.locator('#quit').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page.locator('#quit-confirm-panel')).toBeVisible();
    await expect(page.locator('.quit-confirm-sub')).toHaveText('Quit = nothing saved.');
    await page.locator('#quit-log').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    const log = await saveAndRead(page);
    expect(String(log['notes'])).toContain('stopped early at Supported split squat');
    expect(log['liteDay']).toBe(true); // round 2 never started
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
    await goToStep(page, 'Bodyweight hip hinge');
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
    await expect(page.locator('.rest-next')).toContainText('Next · Bodyweight hip hinge · 12 reps');
    await expect(page.locator('.rest-card #step-back')).toHaveText('‹ Back');
    await expect(page.locator('.rest-card #step-back')).toHaveClass(/back-link/);
  });
});
