// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import {
  setupPage,
  SWING_WEEK3_A,
  SWING_WEEK3_B,
  SWING_SAT_C,
  openWeekByWeek,
  mockDate,
  movableClock,
  ignoreSickWeeks,
  seedRounds,
  PLAIN_WEEK5_HANDOVER,
} from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

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
        // v55 fix r2: displayName() now reads 'Biceps curl' (label), not the
        // '1 kg biceps curl' name key — see the app.ts UPPER_BACK_W7 entry.
        'Again tonight: prone row · biceps curl'
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
    // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
    // ride-numbers screen directly.
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
    // v55 fix r2: displayName() label 'Biceps curl', lowercased same as prone row.
    await expect(done.locator('.home-done-back')).toHaveText('Again: prone row · biceps curl');
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
      // v61 (Sep 28 2026), spec item d: the week line counts D now ("of 4") —
      // no D logged in this seed, so it's just the denominator that moved.
      await expect(page.locator('.week-line')).toHaveText('1 of 4 · B and C left');
      await expect(page.locator('.week-card .week-dot')).toHaveCount(3);
      await expect(page.locator('.week-card .dot-A')).toHaveCount(1);
      await expect(page.locator('button.home-hero[data-workout="B"]')).toContainText('Up next');
      await expect(page.locator('.home-chips .home-chip')).toHaveCount(1);
      await expect(page.locator('.home-chips .home-chip')).toHaveText('C · Cardio');
      // No "‹ Week 4" yet — she hasn't tapped it (that's its own test below).
    });

    test('post-log line: "2 of 4 in Week 5" mid-workout, then the Done card after Save', async ({
      page,
    }) => {
      await movableClock(page, '2026-09-28T08:00:00.000Z'); // Mon, day 3
      await seedLogs(page, [swingLog('wk5-b', '2026-09-27T15:00:00.000Z', 'B')]);
      await page.goto('/');
      await page.locator('button[data-workout="A"]').click();
      await page.locator('#begin').click();
      await page.locator('#ww-elliptical').click();
      // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
      // ride-numbers screen directly.
      await page.locator('#next').click();
      await page.locator('#ell-km').fill('1.4');
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        if (!(await tapForward(page))) break;
      }
      // v61 fix pass (CHECK-v61 should #4): the post-log witness now counts
      // "of 4" the same way Home/the Done card already do (no D logged here,
      // so it's just the denominator that moved).
      await expect(page.locator('.postlog-witness')).toContainText('2 of 4 in Week 5');
      await page.locator('#save-log').click();
      // v61 (Sep 28 2026), spec item d: the Done card's own line counts D
      // now ("of 4") — no D logged here.
      await expect(page.locator('.home-done-line')).toHaveText('2 of 4 in Week 5 · C left');
    });

    test('post-log line: a REPEAT letter (B again) still reads "1 of 4", never overcounts to "2 of 4"', async ({
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
      // v61 (Sep 28 2026), spec item e: no app timer — Done · Next opens the
      // ride-numbers screen directly.
      await page.locator('#next').click();
      await page.locator('#ell-km').fill('1.4');
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        if (!(await tapForward(page))) break;
      }
      // v61 fix pass (CHECK-v61 should #4): "of 4" counting now.
      await expect(page.locator('.postlog-witness')).toContainText('1 of 4 in Week 5');
      await expect(page.locator('.postlog-witness')).not.toContainText('2 of 4');
      await page.locator('#save-log').click();
      // v61 (Sep 28 2026), spec item d: same "of 4" widening as above.
      await expect(page.locator('.home-done-line')).toHaveText('1 of 4 in Week 5 · A and C left');
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
      // v61 (Sep 28 2026), spec item d: no D logged this week → "3 of 4 · D
      // optional" (the Done card's own phrasing when A/B/C alone closed it).
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 5 done · 3 of 4 · D optional',
        'Week 6 opens Sat Oct 3',
      ]);
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // WK2 fix r1 (Sep 27 2026, checker's should #1): said ONCE, truthfully —
      // a session logged before Week 6 actually opens counts back as an extra
      // for Week 5 (week.ts rule 3), not toward Week 6's own count.
      await expect(page.locator('.week-sub-line').first()).toHaveText(
        'opens Sat Oct 3 · a session before then counts as an extra for Week 5'
      );
      await expect(page.locator('.week-line')).toHaveText('0 of 4 · A, B and C to go');
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
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-03T16:00:00.000Z'); // Sat Oct 3 — an anchor day itself
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-10-03T15:00:00.000Z', 'C'), // today, Saturday — closes AND opens
      ]);
      await page.goto('/');
      // v61 (Sep 28 2026), spec item d: no D logged this week.
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 5 done · 3 of 4 · D optional',
        'Week 6 starts now',
      ]);
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      await expect(page.locator('.week-sub-line').first()).toHaveText('since Sat Oct 3 · day 1');
      await expect(page.locator('.week-line')).toHaveText('0 of 4 · A, B and C to go');
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
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
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
      // v61 (Sep 28 2026), spec item d: a closed week without D reads
      // "complete · 3 of 4" (the peek's own weekCountLine call, no D seeded).
      await expect(page.locator('.week-line')).toHaveText('complete · 3 of 4');
    });

    test('week strip: a repeat day gets a small "2" badge, and an 11-day short week folds its empty middle', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
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
      // v61 (Sep 28 2026), spec item d: "of 4" now — no D logged this week.
      await expect(page.locator('.week-line')).toHaveText('2 of 4 · C left');
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

    test("v58 fix pass (Sep 28 2026, checker's must): a REPEAT week (no new PROGRAM row yet) never says a move stepped", async ({
      page,
    }) => {
      // Repro exactly, moved up one week at v61.2 (Oct 13 2026) when the real
      // R2 Week 6 row (the light restart after being sick) landed: Week 6
      // (starts Sat Oct 10 — the Oct 3 week is a SKIPPED 'Sick' week) logs
      // A/B/C, the C landing ON an anchor day (Sat Oct 17) so Week 7 opens
      // THAT SAME DAY ("starts now", not a gap). Round 2 has no Week 7
      // PROGRAM row yet, so Week 7 repeats Week 6's own moves
      // (planForWeekKey's repeatsWeek fallback). Before the original fix,
      // steppedMovesForWorkoutId ignored the repeat and diffed Week 6
      // against Week 5 anyway — the ride still read as "stepped" on a week
      // that changed NOTHING.
      await mockDate(page, '2026-10-18T10:00:00.000Z'); // Sun Oct 18 — inside the open Week 7
      // Week 7 only exists because the Oct 3 Sick week is honoured (the default now).
      await seedLogs(page, [
        swingLog('wk6-a', '2026-10-11T15:00:00.000Z', 'A'),
        swingLog('wk6-b', '2026-10-12T15:00:00.000Z', 'B'),
        swingLog('wk6-c', '2026-10-17T15:00:00.000Z', 'C'), // Sat — closes Week 6, opens Week 7 same day
      ]);
      await page.goto('/');
      await page.locator('button[data-workout="A"]').click(); // pins state.pinnedWeekKey (startWorkout)
      await expect(page.locator('.prelog-meta')).toContainText('Week 7 · same moves as Week 6');
      await expect(page.locator('.prelog-stepped')).toHaveCount(0);
      const stepped = await page.evaluate(() =>
        (
          window as unknown as { __wtCurrentSteppedMoves: () => unknown[] }
        ).__wtCurrentSteppedMoves()
      );
      expect(stepped).toEqual([]);
    });

    // v61.2 (Oct 13 2026) — the light restart after being sick. The Oct 3
    // week is a SKIPPED 'Sick' week, so Oct 10 is R2 Week 6 (not 7); Week 6's
    // A/B/C are one tiny session: a 10-min easy ride, no strength moves.
    test('v61.2: the Oct 3 week is a Sick skip and Oct 10-16 is R2 Week 6 — light, one 10-min ride, no strength', async ({
      page,
    }) => {
      await mockDate(page, '2026-10-13T10:00:00.000Z'); // Tue Oct 13 — inside Week 6
      // Real-shaped Week 5 (C never came): B Sep 26 (after the launch), A
      // Sep 28, a B-labeled hike Oct 1. The Sick week (Oct 3-9) pauses the
      // completion clock, so Week 6 is open with no Move on and no wait.
      await seedLogs(page, [
        swingLog('wk5-b1', '2026-09-26T19:45:00.000Z', 'B'),
        swingLog('wk5-a', '2026-09-28T15:00:00.000Z', 'A'),
        swingLog('wk5-b2', '2026-10-01T07:00:00.000Z', 'B'),
      ]);
      await page.goto('/');
      // Banner: the skipped week doesn't advance the count — Week 6, not 7.
      await expect(page.locator('.home-header h1')).toContainText('Week 6');
      await expect(page.locator('.home-hero')).toContainText('~20 min');
      await expect(page.locator('.home-hero')).toContainText('Cardio: 10 min');
      // The weekly grid keeps a labeled blank row for the Oct 3 week.
      await openWeekByWeek(page);
      const sickRow = page.locator('.weekly-row').filter({ hasText: 'Sick' });
      // Two Sick rows now: the July one (Round 1, unchanged) and Oct 3.
      await expect(sickRow).toHaveCount(2);
      await expect(sickRow.last().locator('.weekly-slot-empty')).toHaveCount(3);
      await page.goto('/');
      // A, B and C are the same light session: 1 round, the 10-min ride in
      // the warmup, only Belly breathing + Pelvic tilts in the main, no
      // strength moves.
      for (const id of ['A', 'B', 'C'] as const) {
        await page.goto('/');
        await page.locator(`button[data-workout="${id}"]`).click();
        await expect(page.locator('.prelog-meta')).toContainText('Week 6');
        await page.locator('.prelog-overview-summary').click();
        const phases = page.locator('.overview-phase');
        // The ride is the warmup's only step (the overview shows it as "Cardio").
        await expect(phases.nth(0).locator('.overview-phase-items')).toHaveText('Cardio');
        await expect(page.locator('.prelog-meta')).toContainText('~20 min');
        const main = await phases.nth(1).locator('.overview-phase-items').innerText();
        expect(main).toContain('Belly breathing');
        expect(main).toContain('Pelvic tilts');
        for (const strength of [
          'squat',
          'Glute bridge',
          'Bird dog',
          'plank',
          'Wall sit',
          'curl',
          'row',
        ]) {
          expect(main.toLowerCase(), `${id} main has ${strength}`).not.toContain(
            strength.toLowerCase()
          );
        }
      }
    });

    // v59 (Sep 28 2026), CHECK-v58 round 2 must #R2-S2: the repeat-week test
    // above proves the ONE branch that returns [] — nothing proved the
    // ordinary, every-week branch (pinnedWeekKey → the real row → diff vs
    // PROGRAM[idx-1]) still returns the real stepped moves. A future change
    // that returned [] too eagerly would have passed the whole suite.
    type SteppedName = { name: string; summary: string };
    test('v59 (a) post-launch, a real (non-repeat) week: A/B logged, C not yet — stepped is still [ride 12 min]', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-29T10:00:00.000Z'); // Tue Sep 29 — inside Week 5, a real PROGRAM row
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
      ]);
      await page.goto('/');
      // A/B already done this week — Home's own "Up next" hero only offers
      // the missing C (see the swing-Saturday tests above), so A isn't a
      // clickable button here. Same __wtStartWorkout hook v58 (a) above uses
      // to pick an arbitrary workout id regardless of what Home is offering.
      const stepped = await page.evaluate(() => {
        const w = window as unknown as {
          __wtStartWorkout: (id: 'A' | 'B' | 'C' | 'D') => void;
          __wtCurrentSteppedMoves: () => SteppedName[];
        };
        w.__wtStartWorkout('A');
        return w.__wtCurrentSteppedMoves();
      });
      expect(stepped.map((s) => s.name)).toEqual(['Outdoor walk']);
      expect(stepped[0]!.summary).toBe('ride 12 min');
    });

    test("v59 (b) pinned crossing: a session started at the END of Week 5 (Fri) still asks about Week 5's own stepped move after resuming past the Week-6 boundary (Sun, C logged Sat)", async ({
      page,
      context,
    }) => {
      // Same shape as "the pinned plan survives an app close" below, minus
      // the marker-row background-sync half — this is R2-S2's own repro:
      // start on the LAST day Week 5 is live, let a Saturday C close it and
      // open (repeat) Week 6 out from under the pin, resume Sunday. The fix
      // (steppedMovesForWorkoutId resolving state.pinnedWeekKey first) means
      // this session keeps training/asking about Week 5, never Week 6's
      // (empty, repeat) list.
      //
      // Fix pass (Sep 28 2026, checker's must #1): this test never actually
      // crossed the boundary it claims to — with no A/B seeded, the Saturday
      // C push below was Week 5's ONLY logged session (1 of 3), so Week 5
      // stayed open into Sunday even under the OLD, un-pinned behaviour.
      // Seed A/B first (same wk5-a/wk5-b dates v59 (a) above uses) so the
      // Friday pin + Saturday C really do finish 3 of 3 and close Week 5.
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
      ]);
      await mockDate(page, '2026-10-02T10:00:00.000Z'); // Fri Oct 2 — Week 5's own last day
      await page.goto('/');
      // A/B already logged for Week 5 — Home's hero only offers the missing
      // C (same v59 (a) reasoning above), so button[data-workout="A"] isn't
      // on the page. Force-start A via the same __wtStartWorkout hook v59
      // (a) uses, which still pins state.pinnedWeekKey to Week 5 exactly
      // like the button click did.
      await page.evaluate(() => {
        (
          window as unknown as { __wtStartWorkout: (id: 'A' | 'B' | 'C' | 'D') => void }
        ).__wtStartWorkout('A');
      });
      await expect(page.locator('.prelog-stepped')).toContainText('ride 12 min');
      await page.locator('#begin').click();

      // Sat Oct 3: a C session lands (another day/device flushing) — with
      // A/B already logged above, this is the THIRD of Week 5's three, so it
      // really does close Week 5 and open (repeat) Week 6 — same trick the
      // tests above use, done here mid-session instead of before it starts.
      await page.evaluate(() => {
        const raw = window.localStorage.getItem('workout-tracker:logs');
        const rows: unknown[] = raw ? JSON.parse(raw) : [];
        rows.push({
          id: 'wk5-c-sat',
          date: '2026-10-03T15:00:00.000Z',
          workout: 'C',
          capacityBefore: 8,
          capacityAfter: 8,
          wallSitSec: 0,
          backPain: 0,
          word: '',
          synced: true,
        });
        window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
      });

      // Resume Sunday Oct 4 — a new page in the same context, same "app
      // close/reopen" pattern as the test right below — except two full days
      // pass here (Fri -> Sun), past STALE_SESSION_MS (3h), so this resume
      // lands on the "Workout A was left open ... Did you do it?" stale card
      // instead of silently reopening it — "Keep going where I left off"
      // (#stale-continue → continueStaleSession → applyActiveSnapshot) is
      // the same pin-preserving resume, one tap further.
      const resumed = await context.newPage();
      await mockDate(resumed, '2026-10-04T10:00:00.000Z');
      await resumed.goto('/');
      await resumed.locator('#stale-continue').click();
      await expect(resumed.locator('.round-indicator')).toBeVisible();
      const stepped = await resumed.evaluate(
        () =>
          (
            window as unknown as { __wtCurrentSteppedMoves: () => SteppedName[] }
          ).__wtCurrentSteppedMoves() as SteppedName[]
      );
      expect(stepped.map((s) => s.name)).toEqual(['Outdoor walk']);
      expect(stepped[0]!.summary).toBe('ride 12 min');
      await resumed.close();
    });

    // v59 (Sep 28 2026), CHECK-v58 round 2 nice #R2-N2: the walk-outside
    // lane's own feel chip used to show the instant she tapped ▶ Walk
    // outside ("Walking · 0 min · how did it feel?"). Gated on real elapsed
    // time now (walkFeelReady, app.ts) — nothing to have an opinion about at
    // 0 min.
    test('v59 (R2-N2): the walk-outside feel chip waits for real elapsed time, not "Walking · 0 min"', async ({
      page,
      context,
    }) => {
      await mockDate(page, '2026-09-27T10:00:00.000Z'); // Sun inside Week 5 — ride steps 10 -> 12 for A
      await page.goto('/');
      await page.locator('button[data-workout="A"]').click();
      await page.locator('#begin').click();
      await page.locator('#ww-start').click(); // the walk lane, right now — 0 min elapsed
      await expect(page.locator('#walk-live')).toHaveText('Walking · 0 min');
      await expect(page.locator('#walk-move-feel-slot')).toHaveClass(/wt-hidden/);
      await expect(page.locator('.move-feel .arm-chip').first()).not.toBeVisible();

      // Back-date the stamped start 4 minutes — a real elapsed walk. A fresh
      // load re-renders the step off the (now backdated) stamp, standing in
      // for the 30 s tick without a real 4-minute wait (same "app close/
      // reopen" pattern the resume tests above use).
      await page.evaluate(() => {
        window.localStorage.setItem('workout-tracker:ww-start', String(Date.now() - 4 * 60_000));
      });
      const resumed = await context.newPage();
      await mockDate(resumed, '2026-09-27T10:00:00.000Z');
      await resumed.goto('/');
      // displayName(ex) shows "Cardio" for the Outdoor-walk slot throughout
      // (app.ts: `ex.name === 'Outdoor walk' ? 'Cardio' : ex.name`) — same on
      // this screen before AND during the walk, not just on the choice card.
      await expect(resumed.locator('.exercise-name')).toHaveText('Cardio');
      await expect(resumed.locator('#walk-move-feel-slot')).not.toHaveClass(/wt-hidden/);
      await expect(resumed.locator('.move-feel .arm-chip').first()).toBeVisible();
      await resumed.close();
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

    // v61 fix pass 2 (Oct 2 2026) — CHECK-v61.md round 2's must #1: D's own
    // window used to be the span's strict [openedAt, closedAt] — undercounting
    // a D logged before the session that opens a week, or after the one that
    // closes it. week-d.ts's own unit tests (tests/week-d.test.ts) cover the
    // same three repros directly on the model; these drive them through Home.
    const dLog = (id: string, date: string) => ({
      id,
      date,
      workout: 'D' as const,
      capacityBefore: 8,
      capacityAfter: 8,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced: true,
    });

    test('v61 fix pass 2 (repro 1): a D logged before ANY A/B/C still counts toward the pending week, with its own dot', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-03T07:05:00.000Z'); // Sat Oct 3, 10:05 local
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5 — Week 6 pending, opens Sat Oct 3
        dLog('wk6-d', '2026-10-03T07:00:00.000Z'), // 10:00 local — before any A/B/C
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // The spec's own example (CHECK-v61.md): "after D only: 1 of 4 · A, B
      // and C to go" — not "0 of 4", the bug's exact symptom.
      await expect(page.locator('.week-line')).toHaveText('1 of 4 · A, B and C to go');
      const todayDot = page.locator('.week-dot.is-today');
      await expect(todayDot.locator('.week-dot-d')).toHaveText('D');
    });

    test('v61 fix pass 2 (repro 2): a D logged before the session that opens the week still counts (her real Sep 28 order, replayed at the Oct 3 boundary)', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-03T07:30:00.000Z'); // Sat Oct 3, 10:30 local
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5
        dLog('wk6-d', '2026-10-03T05:00:00.000Z'), // 08:00 local — BEFORE the A below
        swingLog('wk6-a', '2026-10-03T07:00:00.000Z', 'A'), // 10:00 local — opens Week 6, later than the D
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // Before the fix: "1 of 4 · B and C left" — the D fell before the
      // span's own `openedAt` (A's timestamp) and dropped out.
      await expect(page.locator('.week-line')).toHaveText('2 of 4 · B and C left');
    });

    test('v61 fix pass 2 (repro 3): a D logged minutes after the closing session reads the CLOSED week — never "0 of 4 in Week 6"', async ({
      page,
    }) => {
      await mockDate(page, '2026-09-29T18:30:00.000Z'); // Tue Sep 29, 21:30 local — just after the D below
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5 at 18:00 local
        dLog('wk5-d-after-close', '2026-09-29T18:00:00.000Z'), // 21:00 local, same day, AFTER the close
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6'); // the live/pending week, unaffected
      // Before the fix: ['0 of 4 in Week 6 · A, B and C to go'] — this D
      // belongs to Week 5's own close, not a week she hasn't reached yet.
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 5 done · 4 of 4 ✓',
        'Week 6 opens Sat Oct 3',
      ]);
      // The peek ("‹ Week 5") reads 4 of 4 too.
      await page.locator('#week-nav-back').click();
      await expect(page.locator('.week-line')).toHaveText('4 of 4 ✓');
      await page.locator('#week-nav-forward').click(); // back to the live view before navigating away
      // Progress · Sessions per week reads "4 / 4" for the same week.
      await page.locator('#open-progress-link').click();
      const wk5Row = page
        .locator('.spw-card')
        .locator(':scope > .spw-rows > .spw-row')
        .filter({ has: page.locator('.spw-label:text-is("wk 5")') });
      await expect(wk5Row.locator('.spw-count')).toHaveText('4 / 4');
    });

    // v61 fix pass 2 (Oct 2 2026) — CHECK-v61.md round 2's should #9
    // (pre-existing since WK2): gapCountsBackToWeekKey used to keep naming
    // the OLD week's "extra" on and after the pending week's own opening
    // day, with nothing logged yet — true only DURING the gap, not once its
    // anchor day has arrived.
    test('v61 fix pass 2 (should): on the day the pending week opens, with nothing logged yet, the sub-line drops the stale "extra" clause', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await movableClock(page, '2026-10-03T07:00:00.000Z'); // Sat Oct 3, 10:00 local — its own opening day, nothing logged yet
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5 Tue — Week 6 pending, opens Sat Oct 3
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // Before the fix: "opens Sat Oct 3 · a session before then counts as
      // an extra for Week 5" — stale, since "then" has already arrived.
      await expect(page.locator('.week-sub-line').first()).toHaveText('opens Sat Oct 3');
      await page.locator('button[data-workout="A"]').click();
      await page.locator('#begin').click();
      for (let i = 0; i < 60; i++) {
        if (await page.locator('text=Quick log').isVisible()) break;
        if (!(await tapForward(page))) break;
      }
      // Before the fix: "an extra for Week 5 (already 4 of 4)" while the
      // save itself actually opens Week 6.
      await expect(page.locator('.postlog-witness')).toContainText('1 of 4 in Week 6');
      await expect(page.locator('.postlog-witness')).not.toContainText('Week 5');
      await page.locator('#save-log').click();
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      await expect(page.locator('.home-done-line')).toContainText('1 of 4 in Week 6');
    });

    // v61 fix pass 3 (Oct 2 2026) — CHECK-v61.md round 3's must #1: a D
    // logged while the week was still open could get swept into the NEXT
    // week when the close landed on a Saturday or Sunday (the anchor floor
    // alone backs that instant to the SAME calendar day's midnight, which
    // can land before the close). week-d.ts's own unit tests
    // (tests/week-d.test.ts) cover the window math directly; these drive it
    // through Home/the Done card/the week strip/the peek.
    test('v61 fix pass 3: a D logged hours before a Saturday-closing C stays in the closing week, not the one the close opens', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-03T10:00:00.000Z'); // Sat Oct 3, 13:00 local — after the C below
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        dLog('wk5-d-sat-morning', '2026-10-03T06:00:00.000Z'), // Sat 09:00 local — Week 5 still open
        swingLog('wk5-c-sat', '2026-10-03T09:00:00.000Z', 'C'), // Sat 12:00 local — closes Week 5, opens Week 6 right then
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // Before the fix: 'Week 5 done · 3 of 4 · D optional' — the anchor
      // floor swept the 09:00 D into Week 6's own window.
      await expect(page.locator('.home-done-line')).toHaveText([
        'Week 5 done · 4 of 4 ✓',
        'Week 6 starts now',
      ]);
      // Week 6 itself: 0 of 4, no D dot anywhere in its strip — before the
      // fix this read '1 of 4 · A, B and C to go' with a D dot on day 1,
      // though nothing had actually happened in Week 6 yet.
      await expect(page.locator('.week-line')).toHaveText('0 of 4 · A, B and C to go');
      await expect(page.locator('.week-dots#week-strip .week-dot-d')).toHaveCount(0);
      const todayCol = page.locator('.week-dot.is-today');
      await expect(todayCol).toHaveClass(/dot-empty/);
      // The peek ("‹ Week 5") is where that D actually belongs: 4 of 4 ✓,
      // with its own dot on the Saturday column.
      await page.locator('#week-nav-back').click();
      await expect(page.locator('.week-line')).toHaveText('4 of 4 ✓');
      await expect(page.locator('.week-dots#week-strip .week-dot-d')).toHaveCount(1);
    });

    test('v61 fix pass 3: a gap D on the Saturday keeps its dot once the Sunday A opens the next week, and the Week 5 peek shows none', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-04T08:00:00.000Z'); // Sun Oct 4, 11:00 local
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c-fri', '2026-10-02T15:00:00.000Z', 'C'), // Fri 18:00 local — a weekday close, gap opens
        dLog('wk6-d-sat', '2026-10-03T07:00:00.000Z'), // Sat 10:00 local, mid-gap — the pending week
        swingLog('wk6-a-sun', '2026-10-04T07:00:00.000Z', 'A'), // Sun 10:00 local — opens Week 6
      ]);
      await page.goto('/');
      await expect(page.locator('.home-header h1')).toHaveText('Week 6');
      // Her round-2 complaint was this exact shape going stale again: the D
      // must stay counted AND keep its own dot once A opens the week.
      await expect(page.locator('.week-line')).toHaveText('2 of 4 · B and C left');
      await expect(page.locator('.week-dots#week-strip .week-dot-d')).toHaveCount(1);
      // The strip itself shows a Saturday column (the D) ahead of today's
      // Sunday column (the A) — not just the count agreeing by luck.
      const strip = page.locator('.week-dots#week-strip .week-dot');
      await expect(strip).toHaveCount(2);
      await expect(strip.nth(0).locator('.week-dot-d')).toHaveText('D');
      await expect(strip.nth(1)).toHaveClass(/is-today/);
      await expect(strip.nth(1)).toHaveClass(/dot-A/);
      // The Week 5 peek must NOT also claim that Saturday D.
      await page.locator('#week-nav-back').click();
      await expect(page.locator('.week-line')).toHaveText('complete · 3 of 4');
      await expect(page.locator('.week-dots#week-strip .week-dot-d')).toHaveCount(0);
    });

    // v61.1 fix 2 (Oct 2 2026, CHECK-v61.1.md must #1): the weekly review used
    // to carry its OWN D window (getExtraDSessionsForSpan, raw `openedAt` →
    // the next span's own `openedAt`, or Infinity) instead of asking
    // week-d.ts for the SAME window Home/Progress/the peek already share —
    // so it disagreed with every other screen about the same D in exactly
    // these three gap shapes. These three tests drive the review itself
    // (the other screens are already covered by the repro tests above).
    //
    // "r1noD": a weekday close (C), then a D on the pending week's own
    // opening day, before any A/B/C has reopened it. Before the fix: the
    // review's Week 5 page read 'Sessions: 4 of 4' with a 'D · ... · extra
    // ride' line — the old window never ended, so it kept claiming the D
    // forever. The pending week itself has no review page yet (Home already
    // shows it — same "honest, not guessed" call the fix spec makes).
    test("v61.1 fix 2 (r1noD): a D on the pending week's own opening day, nothing else logged yet, reads Week 5's review at 3 of 4 with no D line", async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-03T07:05:00.000Z'); // Sat Oct 3, 10:05 local
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5 — Week 6 pending, opens Sat Oct 3
        dLog('wk6-d', '2026-10-03T07:00:00.000Z'), // 10:00 local — before any A/B/C, nothing open yet
      ]);
      await page.goto('/');
      // Week 6 has no open span yet (mid-gap), so reviewCompletionPages'
      // page 0 is Week 5 — the last CLOSED span — same as the "repro 3"
      // Done-card test above reaching it via #week-nav-back.
      await page.locator('#open-weekly-review .week-card-head').click();
      // Not a full exact-string match on the title — formatWeekRange's own
      // day formatting isn't this test's concern — just that it's Week 5,
      // closed, and reads "3 of 4" (never the pre-fix "4 of 4 ✓").
      await expect(page.locator('.review-title')).toContainText('Week 5');
      await expect(page.locator('.review-title')).toContainText('complete · 3 of 4');
      await expect(page.locator('.weekly-review-subtitle')).toContainText('Sessions:');
      await expect(page.locator('.weekly-review-subtitle strong')).toHaveText('3');
      await expect(page.locator('.weekly-review-subtitle')).toContainText('of 4');
      await expect(page.locator('.weekly-review-extra-row')).toHaveCount(0);
    });

    // "gap + Sunday opening": C Fri (weekday close), D Sat (mid-gap, the
    // pending week), A Sun (opens Week 6). Before the fix: Week 6's review
    // page read 'Sessions: 1 of 4' (the D fell before the SAME window's own
    // `openedAt`, the Sunday A) while Week 5's page wrongly claimed it —
    // 'Sessions: 4 of 4' with the Sat D listed, even though Home/Progress/
    // the peek had already moved it to Week 6.
    test('v61.1 fix 2 (gap + Sunday opening): the review and Home agree — Week 6 reads 2 of 4 with the Sat D line, Week 5 reads 3 of 4 with none', async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-04T08:00:00.000Z'); // Sun Oct 4, 11:00 local
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c-fri', '2026-10-02T15:00:00.000Z', 'C'), // Fri 18:00 local — a weekday close, gap opens
        dLog('wk6-d-sat', '2026-10-03T07:00:00.000Z'), // Sat 10:00 local, mid-gap — the pending week
        swingLog('wk6-a-sun', '2026-10-04T07:00:00.000Z', 'A'), // Sun 10:00 local — opens Week 6
      ]);
      await page.goto('/');
      // Page 0 is the live open span, Week 6, once the Sunday A has opened it.
      await page.locator('#open-weekly-review .week-card-head').click();
      await expect(page.locator('.review-title')).toContainText('Week 6');
      await expect(page.locator('.weekly-review-subtitle strong')).toHaveText('2');
      await expect(page.locator('.weekly-review-subtitle')).toContainText('of 4');
      await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
      await expect(page.locator('.weekly-review-extra-row')).toContainText('D');
      await expect(page.locator('.weekly-review-extra-row')).toContainText('extra ride');
      // Page 1, Week 5, must not also claim that same Saturday D.
      await page.locator('#prev-week').click();
      await expect(page.locator('.review-title')).toContainText('Week 5');
      await expect(page.locator('.review-title')).toContainText('complete · 3 of 4');
      await expect(page.locator('.weekly-review-subtitle strong')).toHaveText('3');
      await expect(page.locator('.weekly-review-extra-row')).toHaveCount(0);
    });

    // "D then A on the same Saturday" (her real Sep 28 order, replayed at the
    // Oct 3 boundary — same seed as "repro 2" above). Before the fix: the
    // review's Week 6 page read 'Sessions: 1 of 4' while Home already read
    // '2 of 4 · B and C left' for the exact same D.
    test("v61.1 fix 2 (D then A on the same Saturday): the review's Week 6 page also reads 2 of 4, matching Home", async ({
      page,
    }) => {
      await ignoreSickWeeks(page, PLAIN_WEEK5_HANDOVER);
      await mockDate(page, '2026-10-03T07:30:00.000Z'); // Sat Oct 3, 10:30 local
      await seedLogs(page, [
        swingLog('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
        swingLog('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
        swingLog('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5
        dLog('wk6-d', '2026-10-03T05:00:00.000Z'), // 08:00 local — BEFORE the A below
        swingLog('wk6-a', '2026-10-03T07:00:00.000Z', 'A'), // 10:00 local — opens Week 6, later than the D
      ]);
      await page.goto('/');
      await page.locator('#open-weekly-review .week-card-head').click();
      await expect(page.locator('.review-title')).toContainText('Week 6');
      await expect(page.locator('.weekly-review-subtitle strong')).toHaveText('2');
      await expect(page.locator('.weekly-review-subtitle')).toContainText('of 4');
      await expect(page.locator('.weekly-review-extra-row')).toHaveCount(1);
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

// v62.1 (Oct 14 2026) - a round whose plan rows are not written yet. Home used
// to fall to PROGRAM[0] ("Round 1 Week 1 Starter") with no word about it. Her
// rule: fail loud. It now shows the last written plan AND says so.
test.describe('v62.1 home - a round with no plan rows says so', () => {
  test('Round 3 open, no PROGRAM rows: Home names the gap and shows the last plan, not Round 1 Starter', async ({
    page,
  }) => {
    await mockDate(page, '2026-12-01T10:00:00.000Z');
    await seedRounds(page, [{ num: 3, start: '2026-11-28' }], 'Round 3 has no PROGRAM rows yet');
    await page.goto('/');
    await expect(page.locator('.home-header h1')).toHaveText('Week 1');
    const note = page.locator('#no-plan-note');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('No plan written for Round 3 yet — showing the last plan.');
    // not the repeat line: this is not "same moves as Week N", it is a missing plan
    await expect(page.locator('.week-sub-repeat')).toHaveCount(0);
    // the workout she is offered is the last written one (Round 2 Week 6: a light ride), not Starter
    await page.locator('button[data-workout="A"]').click();
    await expect(page.locator('.prelog-meta')).toContainText('no plan written yet');
  });

  test('a round that has rows shows no such line', async ({ page }) => {
    await mockDate(page, '2026-10-13T10:00:00.000Z');
    await page.goto('/');
    await expect(page.locator('#no-plan-note')).toHaveCount(0);
  });
});
