// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import {
  setupPage,
  NEXT,
  mockDate,
  movableClock,
  advanceClock,
  appSourceFiles,
  TESTS_DIR as __dirname,
} from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
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
  // v61 (Sep 28 2026), spec item e: no app timer any more — one plain plan
  // line (minutes · level · aim · hands light), Done · Next opens the
  // numbers screen directly.
  await expect(page.locator('#ride-plan-line')).toContainText('10 min');
  await expect(page.locator('#ride-plan-line')).toContainText('hands light');
  await expect(page.locator('.timer-display')).toHaveCount(0);
  await expect(page.locator('#start-timed')).toHaveCount(0);
  // v48 · P3 (decision Q5): no level before the ride — the ride starts AND ends
  // on 3, so the level is logged after it. One line says how to start instead.
  await expect(page.locator('#ell-level')).toHaveCount(0);
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
  // v61 (Sep 28 2026), spec item e: no app timer — level + readings are
  // filled straight off Done · Next, which is already sage the moment the
  // ride card shows.
  await movableClock(page, '2026-09-24T08:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator('#ww-elliptical').click();
  await expect(page.locator('#ride-plan-line')).toContainText('25 min');
  // v51 (Sep 25 2026): Done · Next opens the ride-numbers screen — the
  // readings only exist there.
  await page.locator('#next').click();
  await expect(page.locator('#ell-time')).toBeVisible();
  await page.locator('#ell-time').fill('25:00');
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
  // v61 (Sep 28 2026), spec item e: no app timer — the ride card is a plain
  // plan line, Done · Next already sage.
  await expect(page.locator('#ride-plan-line')).toContainText('30 min');
  await expect(page.locator('.timer-display')).toHaveCount(0);
  await page.locator('#next').click(); // opens the ride-numbers screen
  await expect(page.locator('#ell-time')).toBeVisible();
  await page.locator('#ell-time').fill('30:00');
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

  // v61 (Sep 28 2026), spec item d: D never closes the week (A, B and C are
  // still all to go), but it DOES count into the number shown now — "1 of 4".
  await expect(page.locator('.week-line')).toContainText('1 of 4 · A, B and C to go');
  await expect(page.locator('.week-line')).not.toContainText('D');
});

// v61 (Sep 28 2026), spec items a + b — her words looking at her first D:
// "D should be gone now cuz I just did it" (a) and the week strip's own D
// dot, asked for in v54 and never rendering (b). One real D save, checked
// from Home right after.
test('Workout D today: the home chip reads "D ✓ today" (disabled), A/B/C are still offered, and the week strip shows a D dot on today\'s column', async ({
  page,
}) => {
  await movableClock(page, '2026-09-27T08:00:00.000Z'); // Sunday, after the completion-model launch
  await page.goto('/');
  await page.locator('button[data-workout="D"]').click();
  await page.locator('#begin').click();
  await page.locator('#next').click(); // opens the ride-numbers screen
  await page.locator('#ell-time').fill('30:00');
  await page.locator('#ell-km').fill('3.0');
  await page.locator('#next').click();
  await expect(page.locator('text=Quick log')).toBeVisible();
  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();

  // (a) D is disabled, witnessed rather than offered — A/B/C are untouched.
  const dChip = page.locator('.home-chip-d');
  await expect(dChip).toHaveText('D ✓ today');
  await expect(dChip).toBeDisabled();
  await expect(page.locator('button[data-workout="A"]')).toBeVisible();
  await expect(page.locator('button[data-workout="B"]')).toBeVisible();
  await expect(page.locator('button[data-workout="C"]')).toBeVisible();

  // (b) today's column on the week strip carries its own small "D" dot,
  // distinct from the A/B/C bubble (which stays empty — D never fills it).
  const todayDot = page.locator('.week-dot.is-today');
  const dDot = todayDot.locator('.week-dot-d');
  await expect(dDot).toHaveText('D');
  await expect(todayDot).toHaveAttribute('aria-label', /plus Workout D/);
  // A DOM-only check isn't enough here — .week-dot-d absolute-positions
  // itself against its nearest positioned ancestor, and .week-dot not being
  // one of those (fixed this session) put the badge somewhere else entirely
  // while it still passed every text/attribute assertion above. Confirm it
  // actually sits ON today's own circle, not off in the wrong spot.
  const dotBox = (await todayDot.boundingBox())!;
  const badgeBox = (await dDot.boundingBox())!;
  expect(badgeBox.x).toBeGreaterThan(dotBox.x - 10);
  expect(badgeBox.x).toBeLessThan(dotBox.x + dotBox.width + 10);
  expect(badgeBox.y).toBeGreaterThan(dotBox.y - 10);
  expect(badgeBox.y).toBeLessThan(dotBox.y + dotBox.height);
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
  await page.locator('#next').click(); // opens the ride-numbers screen — no timer to run first
  await expect(page.locator('#ell-time')).toBeVisible();
  await page.locator('#ell-time').fill('30:00');
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
  // v61 (Sep 28 2026), spec item d: Week 5 still reads "1 of 4" (D counted,
  // A/B/C still all to go) on the SECOND read same as the first.
  await expect(reopened.locator('.week-line')).toContainText('1 of 4 · A, B and C to go');
  // v55 (Sep 27 2026) — CHECK N2 (round 1/2): the Home "Sessions" count used
  // to read "1" here as if D were a 4th A/B/C session. Her call: A/B/C only
  // (0, none yet), D folded in as its own "+1 ride".
  // v64: Home's count is now the one "Since ..." line (full weeks); the "0 + 1 ride"
  // split lives on Progress's hero sub-line.
  await expect(reopened.locator('.home-startnow-card')).toHaveCount(0);
  await expect(reopened.locator('#home-since-line')).toBeVisible();

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
  // v64: the hero counts the D ride's 30 minutes (this week), and the Weeks card has its row.
  await expect(reopened.locator('.rides-minutes-n')).toHaveText('30');
  await expect(reopened.locator('.rides-week-row').first()).toContainText(
    '1 ride · 30 min · 3 km · 180 kcal'
  );
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
  // instead of the legacy calendar week — A Thu Oct 15, C Fri Oct 16, B Sat
  // Oct 17 closes the week (Oct 17 is a Saturday, same as Sep 26); D Sun Oct 18
  // opens the new one. (Step 1b-3, Oct 13 2026: re-dated +14 days from Oct 1-4 so it
  // clears the Oct 3-9 Sick week; the assertions name no date or week number.)
  await movableClock(page, '2026-10-17T23:00:00+03:00'); // Sat night, just after B closed the week
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'workout-tracker:logs',
      JSON.stringify([
        {
          id: 'r3-thu-a',
          date: '2026-10-15T15:56:00+03:00',
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
          date: '2026-10-16T11:53:00+03:00',
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
          date: '2026-10-17T22:14:00+03:00',
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
  // v64: the new week (opened at B's own instant) has no ride yet: the hero reads 0 and the
  // Weeks card collapses the empty week to one "Last ride" line (never the closing B counted twice).
  await expect(page.locator('.rides-minutes-n')).toHaveText('0');
  await expect(page.locator('.rides-last-ride')).toContainText('Last ride Oct 17');

  // Sunday, a fresh context page — no beforeEach clear script, so the three
  // rows above survive (same storage, same origin); this init script just
  // appends the D ride to them before the app itself ever reads the store.
  const sunday = await context.newPage();
  await movableClock(sunday, '2026-10-18T10:00:00+03:00');
  await sunday.addInitScript(() => {
    const rows = JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]') as Array<
      Record<string, unknown>
    >;
    rows.push({
      id: 'r3-sun-d',
      date: '2026-10-18T09:00:00+03:00',
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
  await expect(sunday.locator('.rides-minutes-n')).toHaveText('30'); // Sunday's 30-minute D counts
});

// v55 fix r2 (Sep 27 2026, checker's should #5): renderRidesTotalsCard reads
// "This month" off localIsoDate(r.date), not a raw UTC-prefix slice — but
// nothing exercised the exact case that distinction matters: a ride logged
// at LOCAL 00:30 on the 1st is still UTC 21:30 the DAY BEFORE (Israel is
// UTC+3 in Oct 2026), so a UTC-prefix reading would put it in the wrong,
// earlier month. "Now" is mocked well into October so the assertion can only
// pass if the ride's own month is read locally.
test('rides list (v64, was "This month") reads the LOCAL date: a ride at local Oct 1 00:30 (+03:00) is Oct 1, not September', async ({
  page,
}) => {
  await movableClock(page, '2026-10-15T10:00:00+03:00'); // "now" — safely inside October, local and UTC
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'workout-tracker:logs',
      JSON.stringify([
        {
          id: 'r-midnight-d',
          date: '2026-09-30T21:30:00.000Z', // = 2026-10-01T00:30:00+03:00 local
          workout: 'D',
          capacityBefore: 8,
          capacityAfter: 8,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
          notes: 'cardio: elliptical 30 min · level 6 · 3.0 km · pulse 120',
        },
      ])
    );
  });
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await page.locator('#open-rides').click();
  // v64: "This month" is gone (one Weeks card). The ride's date is still read LOCALLY: the list says
  // Oct 1, not Sep 30.
  await expect(page.locator('.rides-list-row')).toContainText('Oct 1');
  await expect(page.locator('.rides-list-row')).not.toContainText('Sep 30');
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
  // She knows the machine now — the setup is a one-line expander, closed
  // until tapped.
  const guide = page.locator('.ell-guide');
  await expect(guide.locator('.detail-section-toggle')).toContainText('Set up the machine');
  await expect(guide.locator('.ell-steps')).toHaveCount(0);
  await guide.locator('.detail-section-toggle').click();
  await expect(guide.locator('.ell-steps li')).toHaveCount(3);
  await expect(guide).toContainText('MANUAL');
  await expect(guide).toContainText('your buttons may differ'); // v48 · fix r1: one line
  // The old 6-step ride list became the live line — it is not in the setup.
  await expect(guide).not.toContainText('Not sure of your level?');
  // After the ride: "—" until touched, and "8 again" (the newest ride) is one tap.
  // v61 (Sep 28 2026), spec item e: no app timer — Done · Next is already
  // sage, straight onto the ride-numbers screen.
  await page.locator('#next').click();
  await expect(page.locator('#ell-level')).toHaveText('—');
  await expect(page.locator('#ell-level-same')).toHaveText('8 again');
  await page.locator('#ell-level-same').click();
  await expect(page.locator('#ell-level')).toHaveText('8');
});

test('elliptical: the step carries how-to guidance', () => {
  // Whichever module holds EXERCISE_GUIDE today (program.ts since step 2) —
  // found by scanning every app module, not by file name.
  const appSrc = appSourceFiles().find((f) => f.src.includes('const EXERCISE_GUIDE'))?.src ?? '';
  expect(appSrc, 'EXERCISE_GUIDE not found in any app module').not.toBe('');
  const guideStart = appSrc.indexOf('const EXERCISE_GUIDE');
  const guideBlock = appSrc.slice(guideStart, appSrc.indexOf('\n};', guideStart));
  // Prettier unquotes a single-word key, so accept either spelling.
  expect(guideBlock).toMatch(/^ {2}'?Elliptical'?: \{/m);
});

test('elliptical: the reading boxes never show on the plain ride card, only after Done · Next opens the numbers screen', async ({
  page,
}) => {
  // v61 (Sep 28 2026), spec item e: there's no timer/running state left to
  // hide the boxes from any more — the ride card is one plain, static face
  // the whole time she's on this step. The boxes live ONLY on the
  // ride-numbers screen (decision Q5, unchanged), which Done · Next opens.
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
  await expect(page.locator('#ride-plan-line')).toContainText('10 min');

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
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
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
