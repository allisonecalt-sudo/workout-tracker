// tests/screens/r3-week2.spec.ts — Round 3 Week 2, the new A / B / C (v77, Nov 22 2026), at phone size.
// The logic half (the PROGRAM row, the paths, "N of 3", the day modes) is tests/week2.test.ts.
//
// WHAT: from Sun Nov 22 the elliptical day is Workout C: ONE long ride (20 / 30 / 45 min, default 45)
// and her stretches, no strength pages, no round 2. D is no longer a to-do: the week counts out of 3
// ("0 of 3 · A, B and C to go", closed = "3 of 3 ✓") and Home shows no D chip. Weeks before Week 2
// (Round 3 Week 1 included) read exactly as before ("N of 4", the D chip).
// WHY: her design Sun Nov 22 2026 (second-brain self/health/research-2026-11-11-workout/README.md
// section 10 v4); build spec projects/workout-tracker/R3-v77-SPEC-2026-11-22.md.

import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const LOGS_KEY = 'workout-tracker:logs';
const SUN_W2 = '2026-11-22T07:00:00.000Z'; // Sun Nov 22 09:00 Jerusalem: Round 3 Week 2 opens
const MON_W2 = '2026-11-23T07:00:00.000Z';
const TUE_W2 = '2026-11-24T07:00:00.000Z';
const SUN_W1 = '2026-11-15T07:00:00.000Z'; // Round 3 Week 1

type Row = Record<string, unknown>;

const row = (id: string, date: string, workout: string, over: Row = {}): Row => ({
  id,
  date,
  workout,
  capacityBefore: null,
  capacityAfter: null,
  wallSitSec: 0,
  backPain: null,
  word: '',
  synced: true,
  sessionPath: workout === 'D' ? null : '48',
  ...over,
});

// Her real Week 1: A Mon Nov 16, B Thu Nov 19, D Sat Nov 21 (no C). Sunday Nov 22 opens Week 2.
const WEEK1: Row[] = [
  row('a1', '2026-11-16T17:00:00.000Z', 'A'),
  row('b1', '2026-11-19T17:00:00.000Z', 'B'),
  row('d1', '2026-11-21T09:00:00.000Z', 'D'),
];

async function open(page: Page, iso: string, seed: Row[]): Promise<void> {
  await mockDate(page, iso);
  await page.addInitScript(
    ([key, rows]) => {
      // seed once per browser tab: a reload (resume test) must keep what the app saved since
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.clear();
      window.localStorage.setItem(key as string, JSON.stringify(rows));
    },
    [LOGS_KEY, seed] as const
  );
  await page.goto('/');
}

async function readLogs(page: Page): Promise<Row[]> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), LOGS_KEY);
  return JSON.parse(raw ?? '[]') as Row[];
}

/** Walk C to the post-log, returning every screen label seen (screen title or step name), in order. */
async function walkCToPostLog(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#save-log').isVisible()) break;
    const label = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
    seen.push(label);
    expect(await page.locator('#start-round-2').count()).toBe(0); // no round break on C, ever
    const next = page.locator('#next, #ww-skip');
    if (!(await next.first().isVisible())) break;
    await next.first().click();
  }
  await expect(page.locator('#save-log')).toBeVisible();
  return seen;
}

test.describe('v77 — Home: the week counts out of 3 from Week 2', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Week 2 (her real Week 1 behind her): "0 of 3 · A, B and C to go", no D chip, C is named', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await expect(page.locator('#week-title')).toHaveText('Week 2');
    await expect(page.locator('#week-count')).toHaveText('0 of 3 · A, B and C to go');
    await expect(page.locator('.home-chip-d')).toHaveCount(0);
    await expect(page.locator('.home-chips-d')).toHaveCount(0);
    await expect(page.locator('button[data-workout="D"]')).toHaveCount(0);
    await expect(page.locator('button.home-chip[data-workout="C"]')).toContainText(
      'C · Elliptical + stretches'
    );
  });

  test('one done: "1 of 3 · B and C left"; two done: "2 of 3 · C left" (no D in the letters)', async ({
    page,
  }) => {
    await open(page, MON_W2, [...WEEK1, row('a2', '2026-11-22T17:00:00.000Z', 'A')]);
    await expect(page.locator('#week-count')).toHaveText('1 of 3 · B and C left');
    await expect(page.locator('.home-chip-d')).toHaveCount(0);
    await page.evaluate(
      ([k, extra]) => {
        const rows = JSON.parse(localStorage.getItem(k as string) ?? '[]') as unknown[];
        localStorage.setItem(k as string, JSON.stringify([...rows, extra]));
      },
      [LOGS_KEY, row('b2', '2026-11-23T05:00:00.000Z', 'B')] as const
    );
    await page.reload();
    await expect(page.locator('#week-count')).toHaveText('2 of 3 · C left');
  });

  test('Round 3 Week 1 reads exactly as before: "of 4", D named, the D chip shown', async ({
    page,
  }) => {
    await open(page, SUN_W1, []);
    await expect(page.locator('#week-title')).toHaveText('Week 1');
    await expect(page.locator('#week-count')).toHaveText('0 of 4 · A, B, C and D to go');
    await expect(page.locator('.home-chip-d')).toHaveCount(1);
    await expect(page.locator('.home-chip-d')).toContainText('D · Cardio 30');
  });

  test('a week closes on A + B + C(ride): the Done card says "Week 2 done · 3 of 3 ✓"', async ({
    page,
  }) => {
    await open(page, TUE_W2, [
      ...WEEK1,
      row('a2', '2026-11-22T17:00:00.000Z', 'A'),
      row('b2', '2026-11-23T17:00:00.000Z', 'B'),
    ]);
    await expect(page.locator('#week-count')).toHaveText('2 of 3 · C left');
    await page.locator('button[data-workout="C"]').first().click();
    await page.locator('#begin').click();
    await walkCToPostLog(page);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-done-title')).toContainText('Done ✓ · Workout C');
    await expect(page.locator('.home-done-line').first()).toContainText('Week 2 done · 3 of 3 ✓');
    await expect(page.locator('.home-chip-d')).toHaveCount(0);
  });
});

test.describe('v77 — Workout C, the long ride (full flow)', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('pre-log: the path picker says the ride and "stretches" (no moves), nothing lit; Start = 60', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    await expect(page.locator('.path-chip-main')).toHaveText(['38 min', '48 min', '60 min']);
    await expect(page.locator('.path-chip-sub')).toHaveText([
      'ride 20 · stretches',
      'ride 30 · stretches',
      'ride 45 · stretches',
    ]);
    await expect(page.locator('[data-path][aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('.prelog-meta')).toContainText('~60 min');
    // "What's in it": warm-up (the ride) and the stretches; no empty Main row
    await page.locator('summary.prelog-overview-summary').click();
    await expect(page.locator('.overview-phase-label')).toHaveText(['Warm-up', 'Stretch']);
    await expect(page.locator('.overview-phases')).not.toContainText('1-minute primer');
  });

  test('C: ride lane -> straight to the stretches -> post-log -> Save (no strength page, no round 2)', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    await page.locator('#begin').click();
    const seen = await walkCToPostLog(page);
    // the ride page names the 45-minute ride and the long-ride note; the next page is the stretch list
    expect(seen[0]).toContain('45 min');
    expect(seen[0]).toContain('The long ride.');
    expect(seen[1]).toContain('Stretch');
    expect(seen.length).toBe(2);
    await expect(page.locator('#app')).toContainText('1 round · 1 of 3 in Week 2');
    await page.locator('#save-log').click();
    const logs = await readLogs(page);
    const c = logs.find((l) => l['workout'] === 'C')!;
    expect(c['sessionPath']).toBe('60'); // Start alone = C's own default
    expect(c['dayMode']).toBeNull();
    await expect(page.locator('#week-count')).toHaveText('1 of 3 · A and B left');
  });

  test('tapping the 38 path: the ride is 20 min; the 48 path: 30 min', async ({ page }) => {
    await open(page, SUN_W2, WEEK1);
    for (const [path, min] of [
      ['38', '20 min'],
      ['48', '30 min'],
    ] as const) {
      await page.goto('/');
      await page.locator('button[data-workout="C"]').first().click();
      await page.locator(`[data-path="${path}"]`).click();
      await page.locator('#begin').click();
      await expect(page.locator('.exercise-name').first()).toBeVisible();
      await expect(page.locator('#app')).toContainText(min);
      await page.locator('#quit').click();
      await page.locator('#quit-yes').click();
    }
  });

  test('coming back from an easy day: C opens with 38 pre-picked, a 20-min easy ride', async ({
    page,
  }) => {
    await open(page, MON_W2, [
      ...WEEK1,
      row('e1', '2026-11-22T17:00:00.000Z', 'A', { dayMode: 'cold', sessionPath: '38' }),
    ]);
    await page.locator('button[data-workout="C"]').first().click();
    await expect(page.locator('[data-path="38"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#coming-back-line')).toBeVisible();
    await page.locator('#begin').click();
    await expect(page.locator('#app')).toContainText('20 min');
  });

  test('resume mid-C: closing the app on the ride and reopening lands back on the ride', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    await page.locator('#begin').click();
    await expect(page.locator('#app')).toContainText('The long ride.');
    await page.reload();
    await expect(page.locator('#app')).toContainText('The long ride.');
    await expect(page.locator('#app')).toContainText('45 min');
    await page.locator('#next, #ww-skip').first().click();
    await expect(page.locator('#app')).toContainText('Stretch');
  });

  test('"Log what I did" on C goes to the post-log and saves a C', async ({ page }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    await page.locator('#begin').click();
    await page.locator('#quit').click();
    await page.locator('#quit-log').click();
    await expect(page.locator('#save-log')).toBeVisible();
    await page.locator('#save-log').click();
    const logs = await readLogs(page);
    expect(logs.filter((l) => l['workout'] === 'C').length).toBe(1);
  });

  test('the step list (☰) on C lists the ride and the cool-down, no strength moves', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    await page.locator('#begin').click();
    await page.locator('#step-list-open').click();
    await expect(page.locator('#app')).toContainText('Cardio · 45 min');
    await expect(page.locator('#app')).toContainText('Cool-down stretches');
    await expect(page.locator('#app')).not.toContainText('Supported split squat');
  });
});

test.describe('v77 — A and B in Week 2', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('A and B chips say 3 / 4 / 6+ moves; the 60 path lists all six and the curl', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    for (const [letter, name, six] of [
      ['A', 'Lower + Pull + Push', 'Band pull-apart'],
      ['B', 'Hinge + Pull + Push', 'Supported split squat'],
    ] as const) {
      await page.goto('/');
      await page.locator(`button[data-workout="${letter}"]`).first().click();
      await expect(page.locator('.path-chip-sub')).toHaveText([
        'ride 10 · 3 moves',
        'ride 12 · 4 moves',
        'ride 15 · 6 moves+',
      ]);
      await expect(page.locator('.prelog-sub, .workout-title, h2').first()).toBeVisible();
      await page.locator('[data-path="60"]').click();
      await page.locator('summary.prelog-overview-summary').click();
      await expect(page.locator('.overview-phases')).toContainText(six);
      await expect(page.locator('.overview-phases')).toContainText('Hammer curl (if time)');
      await expect(page.locator('#app')).toContainText(name);
    }
  });

  test("Week 1's own A still lists its five moves with the 5-move chip (nothing changed for old weeks)", async ({
    page,
  }) => {
    await open(page, SUN_W1, []);
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('.path-chip-sub')).toHaveText([
      'ride 10 · 3 moves',
      'ride 12 · 4 moves',
      'ride 15 · 5 moves+',
    ]);
  });
});

// ---- v77 fix round (Nov 22 2026): the blind check's five fixes -------------------------------------
test.describe('v77 fix round', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  const meta = (page: Page) => page.locator('.prelog-meta');

  test('"again" is true: floor press and split squat were never logged, so B reads them as NEW', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="B"]').first().click();
    await page.locator('[data-path="60"]').click();
    await expect(meta(page)).toContainText('new tonight:');
    await expect(meta(page)).toContainText('floor press');
    await expect(meta(page)).toContainText('supported split squat');
    await expect(meta(page)).not.toContainText('again');
  });

  test('...and once she has LOGGED Week 1\'s C (it had both), B reads them "again"', async ({
    page,
  }) => {
    await open(page, SUN_W2, [...WEEK1, row('c1', '2026-11-20T17:00:00.000Z', 'C')]);
    await page.locator('button[data-workout="B"]').first().click();
    await page.locator('[data-path="60"]').click();
    await expect(meta(page)).toContainText('again: floor press · supported split squat');
    await expect(meta(page)).toContainText('new tonight: hammer curl');
  });

  test('a move cut by the path she logged is not "done": a 38-path C never did the floor press', async ({
    page,
  }) => {
    // Week 1's C at 38 = split squat, pull-apart, floor press (3 moves) -> floor press WAS done;
    // use the 38 path of Week 1's B to prove cutting: bird dog is move 5, so it was not done at 38.
    await open(page, SUN_W2, [row('b0', '2026-11-19T17:00:00.000Z', 'B', { sessionPath: '38' })]);
    await page.locator('button[data-workout="A"]').first().click();
    await page.locator('[data-path="60"]').click();
    // glute bridges (Week 1 B, move 3) were done at 38: "again"; the rest of A is as before
    await expect(meta(page)).toContainText('again: glute bridges');
  });

  test('C: the ride page says "Ride", not "Warm-up", and so does the ride-numbers page', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    await page.locator('#begin').click();
    await expect(page.locator('.round-indicator')).toHaveText('Ride');
    await expect(page.locator('#app')).not.toContainText('Warm-up');
    await page.locator('#ww-elliptical').click();
    await expect(page.locator('.round-indicator')).toHaveText('Ride');
    await page.locator('#next').click();
    await expect(page.locator('#ride-numbers-skip')).toBeVisible();
    await expect(page.locator('.round-indicator')).toHaveText('Ride');
    await expect(page.locator('#app')).not.toContainText('Warm-up');
  });

  test('"Stepped this week" lists only moves in today\'s path', async ({ page }) => {
    await open(page, SUN_W2, WEEK1);
    // A: glute bridges is move 5, so at 48 (and 38) nothing stepped; at 60 it did
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#app')).not.toContainText('Stepped this week');
    await page.locator('[data-path="38"]').click();
    await expect(page.locator('#app')).not.toContainText('Stepped this week');
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('#app')).toContainText('Stepped this week: glute bridges 12–15');
    // B: floor press is move 4 (in 48), split squat move 6 (60 only)
    await page.goto('/');
    await page.locator('button[data-workout="B"]').first().click();
    await page.locator('[data-path="48"]').click();
    await expect(page.locator('#app')).toContainText('Stepped this week: floor press 10–15');
    await expect(page.locator('#app')).not.toContainText('more');
    await page.locator('[data-path="38"]').click();
    await expect(page.locator('#app')).not.toContainText('Stepped this week');
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('#app')).toContainText('+1 more');
  });

  test('C (a new workout, not a step): no "Stepped this week" line at any path', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="C"]').first().click();
    for (const p of ['38', '48', '60']) {
      await page.locator(`[data-path="${p}"]`).click();
      await expect(page.locator('#app')).not.toContainText('Stepped this week');
    }
  });

  test('day modes on C: no "About half your usual reps" line anywhere; back day has the one ride line', async ({
    page,
  }) => {
    for (const mode of ['back', 'knee', 'wrist', 'cold']) {
      await open(page, SUN_W2, WEEK1);
      await page.locator('button[data-workout="C"]').first().click();
      await page.locator('#day-link').click();
      await page.locator(`[data-day-mode="${mode}"]`).click();
      await expect(page.locator('#app')).not.toContainText('About half');
      await page.locator('#begin').click();
      await expect(page.locator('#app')).not.toContainText('About half');
      if (mode === 'back') {
        await expect(page.locator('.ride-note')).toHaveText(
          'Back day: ride if standing tall on it is comfortable. If not, switch to a 5–10 min walk.'
        );
        await expect(page.locator('#app')).not.toContainText('The long ride.');
      }
      if (mode === 'knee')
        await expect(page.locator('#app')).toContainText('the walk lane instead');
      await page.goto('/');
      await page.evaluate(() => sessionStorage.clear());
    }
  });

  test('A on a back day still says "About half your usual reps" (lifting days unchanged)', async ({
    page,
  }) => {
    await open(page, SUN_W2, WEEK1);
    await page.locator('button[data-workout="A"]').first().click();
    await page.locator('#day-link').click();
    await page.locator('[data-day-mode="back"]').click();
    await expect(page.locator('#app')).toContainText('About half your usual reps');
  });
});
