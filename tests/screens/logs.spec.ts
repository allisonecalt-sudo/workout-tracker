// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate, movableClock, advanceClock, NOTE_STRIP_EXTRA } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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
          // v58 (Sep 28 2026): the new "Stepped this week: …" line (her spec
          // item 2) is real, intended content — on a week with several
          // stepped moves it used to run past one line and legitimately push
          // the Lite chip past this exact floor, so round 1 loosened the
          // assertion below to a plain visibility check whenever the line
          // existed (checker's should #1 / R2-S1).
          // v59 fix pass (Sep 28 2026, CHECK-v58 round 2 must #R2-S1): fixed
          // at the source instead — steppedLineText (move-feel.ts) caps the
          // line to one line's worth of text ("+N more" for the rest), so the
          // line never wins back the height the exception used to excuse.
          // R2·Week4 A (3 stepped moves) now fits: floor restored
          // unconditionally, no exception left to take.
          const bar = (await page.locator('.action-bar').boundingBox())!;
          const lite = (await page.locator('#lite-toggle').boundingBox())!;
          expect(lite.y + lite.height - NOTE_STRIP_EXTRA).toBeLessThanOrEqual(bar.y);
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
      'Wrist + back: pressure fine — back off if it is sharp, climbing, or still there tomorrow.'
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
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
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
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    await expect(page.locator('.exercise-reps')).toContainText('1–2 kg (your pick)');
  });

  // v55 · fix r3 (Sep 28 2026, should #2): the reps text said "1–2 kg" from
  // fix r1, but the hand-coded how-to SVG (SVG_PRONE_ROW_DOWN,
  // SVG_BICEPS_CURL_DOWN — getPrimaryStill's fallback still, always on
  // screen for these two moves since EXERCISE_VISUALS has no `.loop` JPG for
  // either) still drew "1 kg" right on the frame she's looking at while she
  // picks her load — seen live under a curl step with 2 kg already picked.
  // Checks the actual DOM text (SVG <text> content), not just the caption
  // text beside it.
  test('(f) v55 fix r3: the how-to still SVG drops the fixed "1 kg" caption too', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Prone row');
    const rowSvg = await page
      .locator('.exercise-visual-still-svg')
      .first()
      .evaluate((el) => el.textContent ?? '');
    expect(rowSvg).not.toMatch(/\b1 kg\b/);
    expect(rowSvg).toContain('1–2 kg');
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    const curlSvg = await page
      .locator('.exercise-visual-still-svg')
      .first()
      .evaluate((el) => el.textContent ?? '');
    expect(curlSvg).not.toMatch(/\b1 kg\b/);
    expect(curlSvg).toContain('1–2 kg');
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
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-arm-step="curl"][data-arm-feel="right"]').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBe('curl=right@1kg;row=easy@2kg');
  });

  // v55 · fix r3 (Sep 28 2026, should #1): the feel chip is optional; the
  // load pick is not — before this fix they were saved by the same "did she
  // tap a feel?" gate, so Probe B (checker) picked 2 kg, marked both sets
  // done, never touched Easy/Right/Hard, and Save wiped armFeel to null. The
  // 2 kg set left no trace and the next session silently defaulted back.
  test('(f) LOAD CHIP: 2 kg + both sets done + no feel tap still saves the load ("curl=@2kg")', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    await page.locator('[data-arm-load-step="curl"][data-arm-load="2kg"]').click();
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    // Now on "How did it feel?" — skip it entirely, no chip tap.
    await expect(page.locator('[data-arm-step="curl"][aria-pressed="true"]')).toHaveCount(0);
    await toPostLog(page); // never visits the row's own chips either — row untouched
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBe('curl=@2kg');
  });

  // v55 · fix r1 (Sep 27 2026): the pace rule says try 2 kg on set 1, then
  // drop back if it's too much. Before this fix, armLoad was "last tap wins"
  // — dropping to 1 kg for set 2 silently erased the 2 kg attempt from the
  // save. Now it records the HEAVIEST load tapped this session.
  test('(f) LOAD CHIP: 2 kg on set 1, back to 1 kg for set 2 — the save still remembers the 2 kg', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    await page.locator('[data-arm-load-step="curl"][data-arm-load="2kg"]').click();
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    // Drop back to 1 kg for set 2 — the CHIP itself now shows 1 kg (her
    // current pick), but the save should still carry the 2 kg attempt.
    await page.locator('[data-arm-load-step="curl"][data-arm-load="1kg"]').click();
    await expect(page.locator('[data-arm-load-step="curl"][data-arm-load="1kg"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await page.locator('[data-arm-step="curl"][data-arm-feel="easy"]').click();
    await toPostLog(page);
    const log = await saveAndRead(page);
    expect(log['armFeel']).toBe('curl=easy@2kg');
  });

  // v55 · fix r1 (Sep 27 2026): shipped with no CSS at all — the picked chip
  // and the other one had the same computed border/background, so mid-set
  // she couldn't tell which load was recorded (a headless check + the
  // shipped screenshot both showed it). Same recipe as .arm-chip/.arm-chip-on
  // already gets — this asserts the on/off chips are visually distinct.
  test('(f) LOAD CHIP: the picked chip looks different from the other one', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    const styles = await page.evaluate(() => {
      const on = document.querySelector('.arm-load-chip.arm-load-chip-on');
      const off = document.querySelector('.arm-load-chip:not(.arm-load-chip-on)');
      if (!on || !off) return null;
      const csOn = getComputedStyle(on);
      const csOff = getComputedStyle(off);
      return {
        onBorder: csOn.borderColor,
        offBorder: csOff.borderColor,
        onBg: csOn.backgroundColor,
        offBg: csOff.backgroundColor,
      };
    });
    expect(styles).not.toBeNull();
    const distinct = styles!.onBorder !== styles!.offBorder || styles!.onBg !== styles!.offBg;
    expect(distinct).toBe(true);
  });

  test('(f) LOAD CHIP: defaults to last used, not always 1 kg', async ({ page }) => {
    await mockDate(page, TUE_WEEK4);
    // Her last logged curl was @2kg — the default this session should pick
    // that up, per spec ("default = last used, initially 1 kg").
    await seedLogs(page, [logRow('s1', '2026-09-19T15:00:00.000Z', 'curl=easy@2kg')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    await expect(page.locator('[data-arm-load-step="curl"][data-arm-load="2kg"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  // v55 · fix r3 (Sep 28 2026, should #1): the feel-less save format
  // ("curl=@2kg", no feel half at all) has to read back as a default too —
  // lastUsedArmLoad's regex is `@(1kg|2kg)$`, which doesn't care whether
  // anything comes before the "@".
  test('(f) LOAD CHIP: a feel-less past load ("curl=@2kg") still sets the default', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await seedLogs(page, [logRow('s1', '2026-09-19T15:00:00.000Z', 'curl=@2kg')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
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
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
    await expect(page.locator('.arm-load-pace-rule')).toHaveText(
      'Easy twice at 15 slow reps + pain gone by morning → try 2 kg on the first set.'
    );
    // Any interaction re-renders the step — it's seen now, so it's gone.
    await page.locator('[data-mark-set="1 kg biceps curl"]').click();
    await expect(page.locator('.arm-load-pace-rule')).toHaveCount(0);
  });

  // ---------------------------------------------------------------------
  // v58 (Sep 28 2026) — Easy/Right/Hard on EVERY move that stepped this
  // week, generalized from arm_feel. R2·Week4 (TUE_WEEK4) is real PROGRAM
  // data for this exact case: Workout A swaps "Bodyweight squats" for the
  // brand-new "Supported split squat" and bumps Wall sit 40s -> 45s; Workout
  // C is untouched on purpose ("C's exercises unchanged on purpose", the
  // PROGRAM's own comment) — the cleanest real "nothing stepped" control.
  // ---------------------------------------------------------------------

  test('v58 (a) which moves ask: Workout A has real stepped moves this week, unchanged Workout C has none', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    type Stepped = { name: string; slug: string; kind: string; qty?: number; summary: string };
    const resultA = await page.evaluate(() => {
      const w = window as unknown as {
        __wtStartWorkout: (id: 'A' | 'B' | 'C' | 'D') => void;
        __wtCurrentSteppedMoves: () => Stepped[];
      };
      w.__wtStartWorkout('A');
      return w.__wtCurrentSteppedMoves();
    });
    expect(resultA.some((m) => m.name === 'Supported split squat' && m.kind === 'reps')).toBe(true);
    expect(resultA.some((m) => m.name === 'Wall sit' && m.kind === 'seconds' && m.qty === 45)).toBe(
      true
    );
    // Curl/row never appear here — arm_feel owns them, unmigrated.
    expect(resultA.some((m) => m.name.includes('curl') || m.name.includes('row'))).toBe(false);

    const resultC = await page.evaluate(() => {
      const w = window as unknown as {
        __wtStartWorkout: (id: 'A' | 'B' | 'C' | 'D') => void;
        __wtCurrentSteppedMoves: () => Stepped[];
      };
      w.__wtStartWorkout('C');
      return w.__wtCurrentSteppedMoves();
    });
    expect(resultC).toEqual([]);
  });

  test('v58 (b) the pre-log "Stepped this week" line names the real moves, with their real qty', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    const stepped = page.locator('.prelog-stepped');
    await expect(stepped).toContainText('Stepped this week:');
    await expect(stepped).toContainText('supported split squat');
    // v59 fix pass (Sep 28 2026, CHECK-v58 round 2 must #R2-S1): three moves
    // step this week (split squat, hip hinge, wall sit) — the live one-line
    // fit (fitSteppedLine) truncated the PREVIEW to what fit, "+N more" for
    // the rest.
    // v59 fix pass round 2 (Sep 28 2026, checker's nice — displayLabel now
    // reads ex.label): hip hinge's own summary shortened from "bodyweight
    // hip hinge 1–2 kg" to "hip hinge 1–2 kg" — 11 fewer characters, which
    // is enough for all three stepped moves to fit on the one line now, so
    // the truncation this comment used to describe no longer fires here. The
    // computed list underneath (what the mid-workout chip actually reads)
    // always carried every one of them regardless — this proves the PREVIEW
    // text now does too, untruncated.
    await expect(stepped).toContainText('hip hinge');
    await expect(stepped).toContainText('wall sit');
    await expect(stepped).not.toContainText('bodyweight hip hinge'); // the fixed contradiction (nice #R2-N... hinge label)
    await expect(stepped).not.toContainText('+2 more');
    const namesA = await page.evaluate(() =>
      (window as unknown as { __wtCurrentSteppedMoves: () => { name: string }[] })
        .__wtCurrentSteppedMoves()
        .map((m) => m.name)
    );
    expect(namesA).toEqual(
      expect.arrayContaining(['Supported split squat', 'Bodyweight hip hinge', 'Wall sit'])
    );
    // Workout C: nothing stepped -> no line at all.
    await page.locator('#back-home').click();
    await page.locator('button[data-workout="C"]').click();
    await expect(page.locator('.prelog-stepped')).toHaveCount(0);
  });

  test('v63 item 2: the row shows in round 1 and in the last round; a tap saves the right slug — no qty on a reps-only move', async ({
    page,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    let seenSplitSquat = 0;
    for (let i = 0; i < 60; i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (name === 'Supported split squat') {
        seenSplitSquat++;
        if (seenSplitSquat === 1) {
          // v63 item 2: round 1 asks too (the row is on every move page, every round).
          await expect(page.locator('.move-feel')).toHaveCount(1);
        }
        if (seenSplitSquat === 2) break; // round 2 — her last round on it
      }
      if (!(await tapForward(page))) break;
    }
    expect(seenSplitSquat).toBe(2);
    await expect(page.locator('.exercise-name')).toHaveText('Supported split squat');
    await expect(page.locator('.move-feel-label').first()).toHaveText('How was this one?');
    await page
      .locator('[data-move-feel-slug="supportedsplitsquat"][data-move-feel="easy"]')
      .click();
    await expect(
      page.locator('[data-move-feel-slug="supportedsplitsquat"][data-move-feel="easy"]')
    ).toHaveAttribute('aria-pressed', 'true');
    await toPostLog(page);
    const log = await saveAndRead(page);
    // Reps-only step: no "@qty" suffix (her spec item 1: "reps? no").
    expect(log['moveFeel']).toContain('supportedsplitsquat=easy');
    expect(log['moveFeel']).not.toContain('supportedsplitsquat=easy@');
  });

  test('v58 (d) a hold step (Wall sit, 40s -> 45s) never shows the chip before the hold has actually run', async ({
    page,
  }) => {
    // mockDate's clock is FIXED (never advances — see its own comment), so a
    // REAL held-seconds walkthrough belongs to the movable-clock describe
    // blocks (e.g. "v53: timer as a pip + Back while it runs"); the seconds/
    // qty shape itself ("wallsit=hard@45s") is proved directly by
    // move-feel.test.ts's pure suite and by v58 (e)'s push -> pull round
    // trip below. This test covers what belongs here: the SAME "after the
    // hold has actually run" gate renderArmFeel's own CHIP AFTER THE LAST
    // SET already proved for curl/row, generalized to a hold.
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    let seenWallSit = 0;
    for (let i = 0; i < 80; i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (name === 'Wall sit') {
        seenWallSit++;
        if (seenWallSit === 2) break; // her last round on it
      }
      if (!(await tapForward(page))) break;
    }
    expect(seenWallSit).toBe(2);
    // Reached her LAST round on it, but the hold hasn't run yet this round —
    // the chip waits for holdRan, same rule as CHIP AFTER THE LAST SET.
    await expect(page.locator('.move-feel')).toHaveCount(0);
    await expect(page.locator('#start-timed')).toBeVisible();
  });

  // v63 fix round 2 (Oct 19 2026): v58's waits are back. A feel BEFORE doing the move means nothing, so a
  // hold asks only after it has run, and a cardio lane only after the lane has run and its timer is idle.
  test('v58 (d2) a hold asks "How was this one?" only once the hold has run, then a tap saves it', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await goToStep(page, 'Wall sit');
    await expect(page.locator('.move-feel')).toHaveCount(0); // before the hold: no row
    await page.locator('#start-timed').click();
    await advanceClock(page, 30_000);
    await page.locator('#timer-pip').click();
    await page.locator('#stop-timed').click();
    await expect(page.locator('.move-feel')).toHaveCount(1); // the hold has run: the row is here
    await expect(page.locator('.move-feel-label')).toHaveText('How was this one?');
    await page.locator('[data-move-feel-slug="wallsit"][data-move-feel="right"]').click();
    await expect(
      page.locator('[data-move-feel-slug="wallsit"][data-move-feel="right"]')
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('v58 (d3) the apartment lane asks "How was this one?" only after the lane has run and its timer is idle', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    await page.locator('#ww-apartment').click();
    await expect(page.locator('.exercise-name')).toBeVisible();
    await expect(page.locator('.move-feel')).toHaveCount(0); // not started: no row
    await page.locator('#start-timed').click();
    await expect(page.locator('.move-feel')).toHaveCount(0); // running: still none
    await advanceClock(page, 30_000);
    await page.locator('#timer-pip').click();
    await page.locator('#stop-lane').click();
    await expect(page.locator('.move-feel')).toHaveCount(1); // ran and idle: the row is here
    await expect(page.locator('.move-feel .arm-chip')).toHaveText(['Easy', 'Right', 'Hard']);
  });

  // v63 fix round 3 (Oct 19 2026): the "Set N done" count is per ROUND. It used to be per move name for the
  // whole session, so round 1's two taps used it up and round 2 showed the row at once.
  test('v58 (d4) Hip hinge: every round runs Set 1 -> Set 2 -> the feel row, and a reload mid-round keeps that round count', async ({
    page,
    context,
  }) => {
    const SEP21 = TUE_WEEK4; // Round 2 Week 4: the week Hip hinge is the stepped, two-set move
    await mockDate(page, SEP21);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    const toHinge = async (p: Page, round: number): Promise<void> => {
      for (let i = 0; i < 80; i++) {
        const name =
          (await p
            .locator('.exercise-name')
            .textContent({ timeout: 1000 })
            .catch(() => '')) ?? '';
        const ind =
          (await p
            .locator('.round-indicator')
            .textContent()
            .catch(() => '')) ?? '';
        if (name === 'Hip hinge' && ind.includes(`Round ${round}`)) return;
        if (!(await tapForward(p))) break;
      }
      throw new Error(`never reached Hip hinge in round ${round}`);
    };
    const sets = (p: Page) => p.locator('.move-feel-sets');
    const sequence = async (p: Page, from: number): Promise<void> => {
      for (let n = from; n <= 2; n++) {
        await expect(sets(p).locator('.move-feel-label')).toHaveText(`Set ${n} of 2`);
        await expect(sets(p).locator('[data-mark-set]')).toHaveText(`Set ${n} done`);
        await expect(p.locator('.move-feel .arm-chip')).toHaveCount(0);
        await sets(p).locator('[data-mark-set]').click();
      }
      await expect(sets(p)).toHaveCount(0);
      await expect(p.locator('.move-feel-label')).toHaveText('How was this one?');
    };
    await toHinge(page, 1);
    await sequence(page, 1); // round 1: the full counter, then the row
    await toHinge(page, 2);
    // round 2 starts again at Set 1 (round 1 did not use it up), and one set in:
    await expect(sets(page).locator('.move-feel-label')).toHaveText('Set 1 of 2');
    await expect(page.locator('.move-feel .arm-chip')).toHaveCount(0);
    await sets(page).locator('[data-mark-set]').click();
    await expect(sets(page).locator('.move-feel-label')).toHaveText('Set 2 of 2');

    // the app is closed and reopened mid-round-2: the session resumes with THIS round's count
    const reopened = await context.newPage();
    await mockDate(reopened, SEP21);
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Hip hinge');
    await expect(reopened.locator('.move-feel-sets .move-feel-label')).toHaveText('Set 2 of 2');
    await sets(reopened).locator('[data-mark-set]').click();
    await expect(reopened.locator('.move-feel-sets')).toHaveCount(0);
    await expect(reopened.locator('.move-feel-label')).toHaveText('How was this one?');
  });

  // v58 fix r3-style proof (Sep 28 2026), same shape as the arm_feel v55
  // push -> pull round trip above: the move_feel column round-trips through
  // the real push shape and the real pull-merge, byte for byte.
  test('v58 (e) push -> pull round trip: move_feel survives sessionPayload + mergeRemoteSessions untouched', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      type Entry = Record<string, unknown>;
      const w = window as unknown as {
        __wtSessionPayload: (e: Entry) => Record<string, unknown>;
        __wtMergeRemoteSessions: (local: unknown[], remote: unknown[]) => Entry[];
        __wtIsValidLogEntry: (x: unknown) => boolean;
      };
      const entry = {
        id: 'move-feel-rt',
        date: '2026-09-28T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 7,
        wallSitSec: 45,
        backPain: 0,
        word: '',
        moveFeel: 'supportedsplitsquat=right;wallsit=easy@45s;ride=right@12min',
      };
      const remoteRow = w.__wtSessionPayload(entry);
      const merged = w.__wtMergeRemoteSessions([], [remoteRow]);
      return {
        validEntry: w.__wtIsValidLogEntry(entry),
        payloadMoveFeel: remoteRow['move_feel'],
        mergedMoveFeel: merged.find((r) => r['id'] === 'move-feel-rt')?.['moveFeel'],
      };
    });
    expect(result.validEntry).toBe(true);
    expect(result.payloadMoveFeel).toBe(
      'supportedsplitsquat=right;wallsit=easy@45s;ride=right@12min'
    );
    expect(result.mergedMoveFeel).toBe(
      'supportedsplitsquat=right;wallsit=easy@45s;ride=right@12min'
    );
  });

  test('v58 (f) a tapped feel survives an app close mid-session (the resume snapshot)', async ({
    page,
    context,
  }) => {
    await mockDate(page, TUE_WEEK4);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('#begin').click();
    for (let i = 0; i < 60; i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (name === 'Supported split squat' && (await page.locator('.move-feel').count()) > 0) break;
      if (!(await tapForward(page))) break;
    }
    await page
      .locator('[data-move-feel-slug="supportedsplitsquat"][data-move-feel="right"]')
      .click();
    await expect(
      page.locator('[data-move-feel-slug="supportedsplitsquat"][data-move-feel="right"]')
    ).toHaveAttribute('aria-pressed', 'true');
    // v51's own established pattern (see "reload on the numbers screen"): a
    // real page.reload() re-fires this FILE's addInitScript localStorage
    // clear before the app's own restore runs — context.newPage(), same
    // storage, no reload, is how this file simulates a real app close/reopen.
    const reopened = await context.newPage();
    await mockDate(reopened, TUE_WEEK4);
    await reopened.goto('/');
    await expect(
      reopened.locator('[data-move-feel-slug="supportedsplitsquat"][data-move-feel="right"]')
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
