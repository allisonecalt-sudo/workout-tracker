// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate, movableClock, NOTE_STRIP_EXTRA } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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
  // before it advances; a text match on "Done" would stall there for good.
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

    test('(c) elliptical first ride: plain ride card, "First ride", setup open, no boxes yet', async ({
      page,
    }) => {
      // v61 (Sep 28 2026), spec item e: no Start/timer any more — the card
      // is plain and static the whole time she's on this step.
      await mockDate(page, TUE_WEEK4);
      await page.goto('/');
      await startA(page);
      await page.locator('#ww-elliptical').click();
      await expect(page.locator('.exercise-name')).toHaveText('Elliptical');
      await expect(page.locator('#ride-plan-line')).toContainText('10 min');
      await expect(page.locator('#ride-plan-line')).toContainText('hands light');
      await expect(page.locator('.new-tonight-badge')).toHaveText('First ride');
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('#start-timed')).toHaveCount(0);
      await expect(page.locator('.btn-primary:visible')).toHaveCount(1); // Done · Next, already sage
      await expect(page.locator('#next')).toHaveClass(/btn-primary/);
      // The back-out to Walk/Apartment is still offered.
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

  test('(d) no timer/3-2-1 on the ride card any more; the wall sit still gets its 3-2-1', async ({
    page,
  }) => {
    // v61 (Sep 28 2026), spec item e: the elliptical has no app timer at all
    // any more (her words — she uses the bike's own timer), so there's
    // nothing left to prove about a missing 3-2-1 on a countdown that no
    // longer exists. What's real and unchanged: the ride card itself never
    // shows one, and Wall sit's own 3-2-1 (a real hold) still does.
    await movableClock(page, TUE_WEEK4); // pre-count left at its default (3 s)
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('.countdown-big')).toHaveCount(0);
    await expect(page.getByText('Get ready')).toHaveCount(0);
    await expect(page.locator('#ride-plan-line')).toContainText('10 min');
    await expect(page.locator('.timer-pip')).toHaveCount(0);
    await goToStep(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-label')).toHaveText('Get ready');
    await expect(page.locator('.countdown-big')).toBeVisible();
  });

  test('(f) v51: Done · Next opens "Your ride — from the machine" — time, km, kcal, level, pulse, in that order; untouched time/level save null', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
    // numbers screen directly, from the plain ride card.
    await expect(page.locator('#ride-plan-line')).toBeVisible();
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
    // v61 (Sep 28 2026), spec item e: no app timer any more — Time starts
    // blank, never a guessed prefill (item c also adds the Pulse hint text).
    await expect(page.locator('#ell-time')).toHaveValue('');
    await expect(card).toContainText("The machine's number at the end");
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

  // v61 fix pass (Sep 28 2026, CHECK-v61 must #2): saveCompletedSession used
  // to set cardioMinutes = laneDone ?? prescribedElliptical — and laneDone
  // is always null now (no app timer left to run, spec item e), so EVERY
  // save silently logged the PLANNED length, never what she actually typed.
  // A/B prescribe 10 min; typing a ride that really ran 25 min must save 25,
  // never 10 — the one number that proves this isn't just coincidentally
  // matching the plan (the test right above it, unchanged, can't tell the
  // two apart since her typed 10:02 and the 10-min plan agree).
  test('(f) v61 fix pass: cardioMinutes comes from her typed time, never the planned length', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page); // prescribes 10 min
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await page.locator('#ell-time').fill('25:00');
    const saved = await finishAndRead(page);
    expect(saved['cardioMinutes']).toBe(25); // not 10
    expect(saved['ellipticalTimeSec']).toBe(1500);
  });

  // v61 fix pass (must #2): her real Sep 28 D row is exactly this shape —
  // she skipped the Time box entirely. cardio_minutes must be null (honest
  // "unknown"), never the prescribed/planned length standing in for a
  // reading she never took.
  test('(f) v61 fix pass: Time left blank saves cardioMinutes null, never the planned length', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toHaveValue('');
    const saved = await finishAndRead(page);
    expect(saved['cardioMinutes'] ?? null).toBeNull();
    expect(saved['ellipticalTimeSec'] ?? null).toBeNull();
  });

  // v61 (Sep 28 2026), spec item f — her words Sun Sep 27 15:42: "I want to
  // be able to also say if it was easy, hard, right" about the ride, EVERY
  // ride (never gated on "stepped" the way the rest of moveFeel is).
  test('(f) v61: the ride always asks Easy · Right · Hard, tap-selects / tap-again clears, saved as a move_feel "ride=" segment keyed to her typed minutes', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await expect(page.locator('[role="group"][aria-label="How did that feel?"]')).toContainText(
      'Easy = full sentences · Right = short sentences · Hard = a few words'
    );
    const right = page.locator('[data-ride-feel="right"]');
    await expect(right).toHaveAttribute('aria-pressed', 'false');
    await right.click();
    await expect(right).toHaveAttribute('aria-pressed', 'true');
    // Her typed time (not the planned 10 min) is what rounds into the saved
    // qty — type a ride that actually ran 12 min.
    await page.locator('#ell-time').fill('12:00');
    const saved = await finishAndRead(page);
    expect(saved['moveFeel']).toBe('ride=right@12min');
  });

  test('(f) v61: tapping the same ride-feel chip again clears it — no "ride=" segment saved at all', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    const hard = page.locator('[data-ride-feel="hard"]');
    await hard.click();
    await expect(hard).toHaveAttribute('aria-pressed', 'true');
    await hard.click();
    await expect(hard).toHaveAttribute('aria-pressed', 'false');
    const saved = await finishAndRead(page);
    expect(saved['moveFeel'] ?? null).toBeNull();
  });

  // v61 fix pass (Sep 28 2026, CHECK-v61 should #8): the (f) tests above only
  // ever drove this through Workout A — D (its own, always-elliptical lane,
  // no "▶ Elliptical / Walk / Apartment" choice to click) had never been
  // exercised end-to-end; it only ever worked when driven by hand.
  test('(f) v61 fix pass: Workout D also asks Easy/Right/Hard on the ride, saved keyed to her typed minutes', async ({
    page,
  }) => {
    await movableClock(page, '2026-09-27T08:00:00.000Z'); // Sunday, after the completion-model launch
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#next').click(); // opens the ride-numbers screen directly, no lane choice for D
    const right = page.locator('[data-ride-feel="right"]');
    await expect(right).toHaveAttribute('aria-pressed', 'false');
    await right.click();
    await expect(right).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#ell-time').fill('25:00');
    await page.locator('#ell-km').fill('2.0');
    const saved = await finishAndRead(page);
    expect(saved['moveFeel']).toBe('ride=right@25min');
  });

  // v61 (Sep 28 2026), spec item g — her words Sun Sep 27 15:42: "distance is
  // probably going to be the number one indicator." DERIVED aim (ride-aim.ts),
  // no table — one prior ride sets the bucket, a second ride compares to it.
  test("(g) v61: the ride card shows a derived distance aim from history, and the numbers screen compares today's km to it", async ({
    page,
  }) => {
    // Her real Sep 24 A ride: level 5, 10:02 (602 s), 0.72 km.
    await seedLogs(page, [
      log('ride-1', '2026-09-15T08:00:00.000Z', {
        workout: 'A',
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 5,
        ellipticalKm: 0.72,
        ellipticalKcal: 63.4,
        ellipticalTimeSec: 602,
      }),
    ]);
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    // Lane memory: her last ride was the elliptical, so the cardio step opens
    // straight on it — no "▶ Elliptical / Walk / Apartment" choice to click.
    await expect(page.locator('.exercise-name')).toHaveText('Elliptical');
    // Same level (5, her last) and same planned length (10 min) as the seed
    // ride — ride-aim.ts's exact bucket match, verified in
    // tests/ride-aim.test.ts: 0.72/602*600 ≈ 0.7176, rounds to 0.70 km.
    await expect(page.locator('#ride-plan-line')).toContainText('10 min · level 5 · aim 0.7 km');
    await page.locator('#next').click();
    await expect(page.locator('#ell-aim-compare')).toBeHidden(); // not yet — she hasn't typed km
    await page.locator('#ell-km').fill('0.8');
    await expect(page.locator('#ell-aim-compare')).toHaveText('0.8 km · aim 0.7 km');
    await expect(page.locator('#ell-last-time')).toHaveText('last time → today: 0.72 km → 0.8 km');
  });

  test('(g) v61: her very first ride at a level/length shows "first ride ... sets your aim", never a guessed number', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('#ride-plan-line')).toContainText('first ride at 10 sets your aim');
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('0.5');
    // No history at all at this level/length — no aim to compare against.
    await expect(page.locator('#ell-aim-compare')).toBeHidden();
    await expect(page.locator('#ell-last-time')).toBeHidden();
  });

  test('(f) v49 · look fix: the Time box reads bare digits as mm:ss (the numeric pad has no colon key)', async ({
    page,
  }) => {
    await movableClock(page, TUE_WEEK4);
    await page.goto('/');
    await startA(page);
    await page.locator('#ww-elliptical').click();
    // v61 (Sep 28 2026), spec item e: no app timer to run first.
    await page.locator('#next').click();
    // v61: blank until she types — never a guessed prefill.
    await expect(page.locator('#ell-time')).toHaveValue('');
    // She types what her console shows, no ':' key on the numeric pad —
    // "1002" for 10:02. parseMmSs must read the last two digits as seconds,
    // not 1002 raw seconds (16:42).
    await page.locator('#ell-time').fill('1002');
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
    // v61 (Sep 28 2026), spec item e: no app timer to run first.
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
    // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
    // numbers screen directly, where the level lives.
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
    // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
    // ride-numbers screen directly, where the chip lives.
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

  test('Done · Next opens the numbers screen straight from the plain ride card (no app timer any more)', async ({
    page,
  }) => {
    // v61 (Sep 28 2026), spec item e: the elliptical has no app timer any
    // more — every ride state this described "running" / "stopped" /
    // "never-started" is now the SAME one plain card. One test proves the
    // one door in.
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('#ride-plan-line')).toBeVisible();
    await expect(page.locator('#ell-time')).toHaveCount(0);

    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toBeVisible();
    // Nothing was ridden by the app — no prefill, no lane-done minutes.
    expect(
      await page.evaluate(() => localStorage.getItem('workout-tracker:ww-lane-done-min'))
    ).toBeNull();
    await expect(page.locator('#ell-time')).toHaveValue('');
  });

  test('Skip — no numbers today advances with every reading left null', async ({ page }) => {
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await expect(page.locator('#ell-time')).toBeVisible();
    await page.locator('#ride-numbers-skip').click();
    // Advanced off the elliptical step.
    await expect(page.locator('#ell-time')).toHaveCount(0);
    const saved = await finishAndRead(page);
    expect(saved['cardioLane']).toBe('elliptical');
    // v61 fix pass (Sep 28 2026, CHECK-v61 must #2): used to fall back to
    // the PLANNED length (10) — her real Sep 28 D row is exactly this case
    // (Skip, nothing typed) and cardio_minutes must be honest "unknown",
    // never a reading she never took standing in for one.
    expect(saved['cardioMinutes'] ?? null).toBeNull();
    expect(saved['ellipticalKm']).toBeNull();
    expect(saved['ellipticalKcal']).toBeNull();
    expect(saved['ellipticalPulse']).toBeNull();
    expect(saved['ellipticalLevel']).toBeNull();
  });

  test('‹ Back returns to the plain ride card with her values kept, and Done · Next reopens the screen holding them', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('1.87');
    await page.locator('#ell-pulse').fill('140');

    await page.locator('#ride-numbers-back').click();
    // v61 (Sep 28 2026), spec item e: back on the plain ride card, not a
    // step further back — and not the old "✓ N min done" witness line
    // either (nothing ever ran to witness).
    await expect(page.locator('#ride-plan-line')).toBeVisible();
    await expect(page.locator('#ell-km')).toHaveCount(0);

    await page.locator('#next').click(); // Done · Next reopens the screen
    await expect(page.locator('#ell-km')).toHaveValue('1.87');
    await expect(page.locator('#ell-pulse')).toHaveValue('140');
  });

  test('the step count ("N of M") is unchanged by opening the numbers screen', async ({ page }) => {
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
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
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('1.87');

    const reopened = await context.newPage();
    await mockDate(reopened, '2026-09-25T08:10:02.000Z');
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
    await mockDate(page, '2026-09-25T08:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-elliptical').click();
    await page.locator('#next').click();
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight - NOTE_STRIP_EXTRA).toBeLessThanOrEqual(915);
    for (const id of ['ell-time', 'ell-km', 'ell-kcal', 'ell-level', 'ell-pulse', 'next']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });
});
