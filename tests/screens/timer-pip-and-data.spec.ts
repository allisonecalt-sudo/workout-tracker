// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, NEXT, openCue, mockDate, movableClock, advanceClock } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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

  test('ride: Back is visible on the plain ride card (no timer to stop any more)', async ({
    page,
  }) => {
    // v61 (Sep 28 2026), spec item e: no app timer on the elliptical any
    // more — the old "Back stops the running ride, keeps the real minutes"
    // half of this test has nothing left to exercise. What's left, and
    // still real: Back stays visible and works on the plain ride card.
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
    await expect(page.locator('#ride-plan-line')).toBeVisible();
    await expect(page.locator('#step-back')).toBeVisible();

    await page.locator('#step-back').click();
    await expect(page.locator('.exercise-name')).toHaveText('Belly breathing');

    // Forward again: the same plain ride card, unchanged.
    await page.locator(NEXT).click();
    await expect(page.locator('#ride-plan-line')).toBeVisible();
  });

  test('ride: Back from step 1 (this week opens A/B/C on the ride) goes to the pre-log, keeps her answer', async ({
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
    await expect(page.locator('#ride-plan-line')).toBeVisible();
    await expect(page.locator('#step-back')).toBeVisible();

    await page.locator('#step-back').click();

    // Lands on the pre-log, not a step further back — there is none — and her
    // capacity answer from before Start is still there.
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
    await expect(
      page.locator('[data-body-chip="cap-before"][data-value="7"][aria-checked="true"]')
    ).toBeVisible();
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
      const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
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

  // v55 fix r3 (Sep 28 2026, checker's must): the LIVE constraint, copied
  // verbatim from migrations/2026-09-28-v55-arm-feel-load.sql — she said go,
  // it's applied, and it now accepts the "@1kg"/"@2kg" suffix (additive: a
  // pre-v55 row with no suffix still passes, same as a curl-only or row-only
  // row with no feel at all, should #1's feel-less "curl=@2kg"). Runs
  // sessionPayload's arm_feel output through it for every feel/load combo on
  // both moves, so a future change that strips the suffix back off the wire
  // fails loudly here instead of quietly losing her data on the next sync
  // (fix r2's stripArmFeelLoad bug — see mergeRemoteSessions' own comment).
  const LIVE_ARM_FEEL_CHECK =
    /^(curl=(easy|right|hard)?(@[12]kg)?)?(;?row=(easy|right|hard)?(@[12]kg)?)?$/;

  test('(a2) arm_feel sent to Supabase carries the "@load" suffix as-is — matches the widened live CHECK', async ({
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
    const feels = ['easy', 'right', 'hard'] as const;
    const loads = ['1kg', '2kg'] as const;
    const cases: (string | null)[] = [null];
    for (const cf of feels) {
      cases.push(`curl=${cf}`); // pre-v55 row, no suffix at all
      for (const cl of loads) cases.push(`curl=${cf}@${cl}`);
      for (const rf of feels) {
        for (const cl of loads) {
          for (const rl of loads) {
            cases.push(`curl=${cf}@${cl};row=${rf}@${rl}`);
          }
        }
      }
    }
    // should #1: a load with no feel at all — the format the feel-less save
    // uses (armFeelString's `engaged` branch).
    for (const cl of loads) cases.push(`curl=@${cl}`);
    for (const cl of loads) for (const rl of loads) cases.push(`curl=@${cl};row=@${rl}`);
    for (const armFeel of cases) {
      const p = await payloadOf(page, { ...base, armFeel });
      const sent = p['arm_feel'] as string | null;
      expect(sent === null || LIVE_ARM_FEEL_CHECK.test(sent)).toBe(true);
      // The suffix is no longer stripped — the payload is exactly what was
      // asked to be saved (null stays null; nothing invented, nothing cut).
      expect(sent).toBe(armFeel);
    }
    // Spot check: the exact string round-trips whole, "@" and all.
    const p2 = await payloadOf(page, { ...base, armFeel: 'curl=easy@2kg;row=right@1kg' });
    expect(p2['arm_feel']).toBe('curl=easy@2kg;row=right@1kg');
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
          '12 reps · 2 sets each round · holding 1–2 kg (your pick)'
        );
        // v48 · fix r2 (Sep 25 2026): the title no longer says "Bodyweight"
        // over "holding the 1 kg" (v55 · fix r1: now "1–2 kg, your pick") —
        // display label only, the key is unchanged.
        await expect(page.locator('.exercise-name')).toHaveText('Hip hinge');
        expect(name).not.toContain('Bodyweight');
        return;
      }
      await page.locator('#next, #start-round-2, #ww-skip').click();
    }
    throw new Error('never reached the hip hinge');
  });

  // v55 · fix r1 (Sep 27 2026): the regenerated hip-hinge voice note says
  // "holding one or two kilos, whichever you pick" — but the step's own reps
  // and notes still said "holding the 1 kg" / "1 kg is the ceiling for now",
  // contradicting it on the same screen. Fixed to "1–2 kg (your pick)" +
  // the pain rule; this asserts neither stale phrase survives.
  test('(h) the hip-hinge step contradicts nothing: no "ceiling", no fixed "1 kg"', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-24T14:00:00.000Z');
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    for (let i = 0; i < 20; i++) {
      const name = (await page.locator('.exercise-name').textContent()) ?? '';
      if (/hip hinge/i.test(name)) {
        await openCue(page);
        const reps = (await page.locator('.exercise-reps').textContent()) ?? '';
        const notes = (await page.locator('.exercise-notes').first().textContent()) ?? '';
        expect(reps).not.toMatch(/ceiling/i);
        expect(reps).not.toContain('the 1 kg');
        expect(notes).not.toMatch(/ceiling/i);
        expect(notes).not.toContain('the 1 kg');
        expect(reps).toContain('1–2 kg (your pick)');
        return;
      }
      await page.locator('#next, #start-round-2, #ww-skip').click();
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
      // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
      // ride-numbers screen directly, where the "N again" chip lives.
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
