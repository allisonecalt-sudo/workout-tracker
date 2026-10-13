// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate, movableClock, advanceClock } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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
    await goToStep(page, 'Biceps curl'); // v55 fix r2: label, not the raw name key
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
      const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
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
