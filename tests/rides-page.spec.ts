// tests/rides-page.spec.ts — THE RIDES PAGE (Sep 27 2026)
//
// Replaces plan items R1+R2 per her amendments (Sep 26 2026, 23:16-23:20):
// "Also I want elliptical data page." · "Elliptical calories per min, 10
// min, 30, hour I can toggle. Kph, anything that you can think of." The
// derived-number math (kcal/min, km/h, usual, best, totals) is exercised
// without a browser in tests/ride.test.ts — this file covers only what
// needs a real DOM: the door on Progress, the hero + its toggle, the
// usual/best gates, the chart + its tap readout, the list's order, and no
// sideways scroll at phone width. Same seeding shape as tests/cycle-ui.spec.ts.

import { test, expect, type Page } from '@playwright/test';
import { installTestClock } from './helpers';

type Row = Record<string, unknown>;

test.beforeEach(async ({ page, context }) => {
  await installTestClock(context);
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

async function seedLogs(page: Page, rows: Row[]): Promise<void> {
  await page.addInitScript((r: Row[]) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(r));
  }, rows);
}

// One elliptical ride, her own real-column shape (sessionCardio's 'ell'
// branch in app.ts reads ellipticalLevel/Km/Kcal/TimeSec directly off the
// log — cardioMinutes is never read for an elliptical ride's own numbers).
function rideLog(
  id: string,
  date: string,
  opts: {
    level?: number | null;
    km?: number | null;
    kcal?: number | null;
    timeSec?: number | null;
    // v61.1 fix 3 (Oct 2 2026): 'D' added so a genuine Workout D ride can be
    // seeded here too (it never joins week.ts's own A/B/C session model —
    // see sessionsForWeekModel's own filter — so it's a real test of the
    // D-fallback path, unlike WEEK6_D below which uses 'A' on purpose).
    workout?: 'A' | 'B' | 'C' | 'D';
  } = {}
): Row {
  return {
    id,
    date,
    workout: opts.workout ?? 'A',
    capacityBefore: 8,
    capacityAfter: 8,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    cardioLane: 'elliptical',
    ellipticalLevel: opts.level ?? 5,
    ellipticalKm: opts.km ?? null,
    ellipticalKcal: opts.kcal ?? null,
    ellipticalTimeSec: opts.timeSec ?? null,
  };
}

// Her three real rides (PLAN-2026-09-26.md §4.2 / the task spec).
const RIDE_A = { level: 5, km: 0.72, kcal: 63.4, timeSec: 602 }; // Sep 24 -> 6.3 kcal/min, 4.3 km/h
const RIDE_C = { level: 3, km: 1.87, kcal: 140.5, timeSec: 1501 }; // Sep 25 -> 5.6 kcal/min
const RIDE_B = { level: 5, km: 0.69, kcal: 62.4, timeSec: 600 }; // Sep 26 -> 6.2 kcal/min, 4.1 km/h

async function openProgress(page: Page): Promise<void> {
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.screen-header h2')).toHaveText('Progress');
}

async function openRides(page: Page): Promise<void> {
  await openProgress(page);
  await page.locator('#open-rides').click();
  await expect(page.locator('.screen-header h2')).toHaveText('Your rides');
}

test.describe('the door on Progress', () => {
  test('opens Your rides, and back returns to Progress', async ({ page }) => {
    await seedLogs(page, [rideLog('r1', '2026-09-24', RIDE_A)]);
    await page.goto('/');
    await openProgress(page);

    const row = page.locator('#open-rides');
    await expect(row).toBeVisible();
    await expect(row).toContainText('🚴 Your rides');
    await expect(row).toContainText('6.3 kcal/min'); // ridesDoorSub's latest-ride line

    await row.click();
    await expect(page.locator('.screen-header h2')).toHaveText('Your rides');
    await expect(page.locator('#back-from-rides')).toHaveText('‹ Progress');

    await page.locator('#back-from-rides').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Progress');
  });

  test('an honest empty state when she has never ridden', async ({ page }) => {
    await seedLogs(page, [
      {
        id: 'w1',
        date: '2026-09-24',
        workout: 'A',
        capacityBefore: 8,
        capacityAfter: 8,
        wallSitSec: 0,
        backPain: 0,
        word: '',
      },
    ]);
    await page.goto('/');
    await openProgress(page);
    await expect(page.locator('#open-rides')).toContainText('No rides yet');
    await page.locator('#open-rides').click();
    await expect(page.locator('.progress-empty')).toContainText(
      "Ride data shows here once you've ridden the elliptical."
    );
  });
});

test.describe('the hero + its 3-chip toggle', () => {
  test('kcal a minute, km/h, pace, level/time/date — and the toggle projects kcal+km', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog('r1', '2026-09-24', RIDE_A)]);
    await page.goto('/');
    await openRides(page);

    await expect(page.locator('#rides-hero-kcal')).toHaveText('6.3');
    await expect(page.locator('.rides-sub-line')).toHaveText('4.3 km/h · 13:56 min/km');
    await expect(page.locator('.rides-detail-line')).toHaveText('level 5 · 10:02 · Sep 24');

    // Default window is "10 min" (resets on open).
    await expect(page.locator('button[data-rides-window="tenMin"]')).toHaveClass(/is-on/);
    await expect(page.locator('#rides-proj-line')).toHaveText('= 63 kcal · 0.72 km in 10 min');

    await page.locator('button[data-rides-window="thirtyMin"]').click();
    await expect(page.locator('button[data-rides-window="thirtyMin"]')).toHaveClass(/is-on/);
    await expect(page.locator('button[data-rides-window="tenMin"]')).not.toHaveClass(/is-on/);
    await expect(page.locator('#rides-proj-line')).toHaveText('= 189 kcal · 2.15 km in 30 min');

    await page.locator('button[data-rides-window="hour"]').click();
    // v55 (Sep 27 2026) — CHECK N1: projectedKm now uses the raw km/time
    // ratio (0.72 km / 602 s), not the pre-rounded 4.3 km/h sub-line above —
    // 0.72 * 3600 / 602 = 4.305648…, which rounds to 4.31, not 4.3. The old
    // 4.3 here was itself the rounding artifact the fix removes (same class
    // of bug as her real 0.69 km ride projecting as 0.68).
    await expect(page.locator('#rides-proj-line')).toHaveText('= 378 kcal · 4.31 km in an hour');
    // The hero digit itself never moves with the toggle — it's what THIS
    // ride was, not a projection (PLAN §4.2's own rule).
    await expect(page.locator('#rides-hero-kcal')).toHaveText('6.3');
  });

  test('a ride with no numbers says so honestly instead of a hero built from a guess', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r0', '2026-09-20', RIDE_A),
      rideLog('r1', '2026-09-24', { level: 5, km: null, kcal: 0, timeSec: null }),
    ]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('.rides-hero-card')).toContainText('No numbers for this ride');
    await expect(page.locator('#rides-hero-kcal')).toHaveCount(0);
  });
});

test.describe('"Your usual" / "Your best" gates', () => {
  test('fewer than 5 rides with numbers: usual is a gap line, best already shows', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-24', RIDE_A),
      rideLog('r2', '2026-09-25', RIDE_C),
    ]);
    await page.goto('/');
    await openRides(page);

    await expect(page.locator('.rides-usual-best-card')).toContainText(
      'Your usual shows after 5 rides (2 so far).'
    );
    // Best = the higher kcal/min of the two (RIDE_A, 6.3), never "harder/easier".
    await expect(page.locator('.rides-usual-best-card')).toContainText('Your best');
    await expect(page.locator('.rides-usual-best-card')).toContainText('6.3 kcal/min · Sep 24');
    await expect(page.locator('.rides-usual-best-card')).not.toContainText('harder');
    await expect(page.locator('.rides-usual-best-card')).not.toContainText('easier');
  });

  test('5+ rides with numbers: "Your usual" shows the median, in plain numbers', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-01', RIDE_A),
      rideLog('r2', '2026-09-05', RIDE_A),
      rideLog('r3', '2026-09-10', RIDE_A),
      rideLog('r4', '2026-09-15', RIDE_A),
      rideLog('r5', '2026-09-20', RIDE_A),
    ]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('.rides-usual-best-card')).toContainText('Your usual');
    await expect(page.locator('.rides-usual-best-card')).toContainText('6.3 kcal/min');
    await expect(page.locator('.rides-usual-best-card')).not.toContainText('shows after 5 rides');
  });
});

test.describe('the chart + tap readout', () => {
  // A ride that burns clearly less per minute (4.0 kcal/min) so the bars really DIFFER
  // (v64: while the rides are about the same, words come first and the bars wait).
  const RIDE_LOW = { level: 4, km: 0.5, kcal: 40, timeSec: 600 };

  test('renders one bar per ride with numbers, latest highlighted, and a tap opens a one-line readout', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-20', { ...RIDE_A, workout: 'A' }),
      rideLog('r2', '2026-09-23', { ...RIDE_C, workout: 'C' }),
      rideLog('r3', '2026-09-25', { ...RIDE_B, workout: 'B' }),
      rideLog('r5', '2026-09-24', { ...RIDE_LOW, workout: 'A' }),
      rideLog('r4', '2026-09-26', { level: 5, km: null, kcal: 0, timeSec: null }), // no numbers -> not charted
    ]);
    await page.goto('/');
    await openRides(page);

    const bars = page.locator('#rides-chart [data-ride-id]');
    // Only the 4 rides WITH numbers are charted (§4.2's exclusion).
    await expect(bars).toHaveCount(4);

    // No readout until she taps one.
    await expect(page.locator('#rides-chart-readout')).toHaveText('');

    await bars.nth(0).click();
    await expect(page.locator('#rides-chart-readout')).toContainText('Sep 20');
    await expect(page.locator('#rides-chart-readout')).toContainText('Workout A');
    await expect(page.locator('#rides-chart-readout')).toContainText('6.3 kcal/min');

    await bars.nth(3).click();
    await expect(page.locator('#rides-chart-readout')).toContainText('Sep 25');
    await expect(page.locator('#rides-chart-readout')).toContainText('Workout B');
  });

  // v54 fix r1 (Sep 27 2026), checker's should #3 / PLAN §4.5: "level over
  // time" without a second chart — an "L5"/"L3" line under each bar, 15px dim
  // (chart.ts's ChartBar.sublabel). Level otherwise only showed in the list.
  test('each bar carries its level ("L5"/"L3") under the date, from ChartBar.sublabel', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-20', { ...RIDE_A, workout: 'A' }), // L5
      rideLog('r2', '2026-09-23', { ...RIDE_C, workout: 'C' }), // L3
      rideLog('r3', '2026-09-25', { ...RIDE_B, workout: 'B' }), // L5
      rideLog('r4', '2026-09-24', { ...RIDE_LOW, workout: 'A' }), // L4
    ]);
    await page.goto('/');
    await openRides(page);

    const chartText = await page.locator('#rides-chart').evaluate((el) => el.textContent ?? '');
    expect(chartText).toContain('L5');
    expect(chartText).toContain('L3');
  });

  // v64: words first. Her real rides (5.6-6.3 kcal/min) tell no story as bars.
  test('v64: rides about the same say so in words, and the bars wait until they really differ', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-20', { ...RIDE_A, workout: 'A' }),
      rideLog('r2', '2026-09-23', { ...RIDE_C, workout: 'C' }),
      rideLog('r3', '2026-09-25', { ...RIDE_B, workout: 'B' }),
    ]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('.rides-same-words')).toHaveText(
      'about the same each ride: 5.6–6.3 kcal/min'
    );
    await expect(page.locator('#rides-chart')).toHaveCount(0);
  });

  test('fewer than 2 rides with numbers: an honest gap line, no chart', async ({ page }) => {
    await seedLogs(page, [rideLog('r1', '2026-09-24', RIDE_A)]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('#rides-chart')).toHaveCount(0);
    await expect(page.locator('.rides-chart-card')).toContainText(
      'The chart starts at your 2nd ride with numbers.'
    );
  });
});

test.describe('the list: date · workout letter · min · km · kcal · level, newest first', () => {
  test('rows are ordered newest-first, and a "no numbers" ride is listed honestly, not hidden', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-20', RIDE_A),
      // v62.3 F7: level 0 (not 4) - a ride with a level reading is no longer "no numbers".
      rideLog('r2', '2026-09-25', { level: 0, km: null, kcal: 0, timeSec: null }),
      rideLog('r3', '2026-09-26', RIDE_B),
    ]);
    await page.goto('/');
    await openRides(page);

    const rows = page.locator('.rides-list-row');
    await expect(rows).toHaveCount(3);
    // Newest first: Sep 26, Sep 25 (no numbers), Sep 20.
    await expect(rows.nth(0)).toContainText('Sep 26');
    await expect(rows.nth(0)).toContainText('10:00');
    await expect(rows.nth(0)).toContainText('0.69 km');
    await expect(rows.nth(0)).toContainText('62.4 kcal');
    await expect(rows.nth(0)).toContainText('L5');
    await expect(rows.nth(1)).toContainText('Sep 25');
    await expect(rows.nth(1)).toContainText('no numbers');
    await expect(rows.nth(2)).toContainText('Sep 20');
  });
});

// v57 (Sep 28 2026) — "Week by week" (her words, Sun Sep 27 22:45): "I want
// week on week comparison with elliptical" · "Also how much time total" ·
// "Also kph". `week` here is the SAME completion model (week.ts) every other
// card on this page already reads — Week 5 opens the instant the completion
// launch (COMPLETION_WEEKS_FROM, Sat Sep 26 2026 22:30) takes over, no
// mocked clock needed (walkWeeks is pure over the session dates given).
test.describe('week by week (v57)', () => {
  // Week 5: A (Sun Sep 27), C (Wed Sep 30), B (Sat Oct 3 — the 3rd distinct
  // letter, closing the week ON a Saturday, same shape as her real Week 4
  // close). Week 6 opens immediately at that same instant (week.ts's
  // weekendAnchorDay branch) — the exact double-count risk the membership-
  // first rule (ride.ts) exists to avoid.
  const WEEK5 = [
    rideLog('w5a', '2026-09-27', { ...RIDE_A, workout: 'A' }),
    rideLog('w5c', '2026-09-30', { ...RIDE_C, workout: 'C' }),
    rideLog('w5b', '2026-10-03', { ...RIDE_B, workout: 'B' }),
  ];
  // A Workout D ride inside the now-open Week 6 (Sun Oct 4) — never part of
  // week.ts's own A/B/C membership, bucketed here by date instead.
  const WEEK6_D = rideLog('w6d', '2026-10-04', {
    level: 4,
    km: 1,
    kcal: 70,
    timeSec: 900, // 15 min -> 70/15 = 4.6666.. -> 4.7 kcal/min, 1/(900/3600)=4 km/h
    workout: 'A', // workout letter is irrelevant for D-shape rides in this seed helper
  });

  test('the table: last weeks newest first, real numbers, the open week marked "so far"', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);

    const rows = page.locator('.rides-week-row');
    await expect(rows).toHaveCount(2);
    // Newest first: Week 6 (open, "so far"), then Week 5 (closed).
    await expect(rows.nth(0)).toContainText('Week 6');
    await expect(rows.nth(0)).toContainText('so far');
    await expect(rows.nth(0)).toContainText('1 ride');
    await expect(rows.nth(0)).toContainText('15 min');
    await expect(rows.nth(0)).toContainText('1 km');
    await expect(rows.nth(0)).toContainText('70 kcal');
    await expect(rows.nth(0)).toContainText('4.7 kcal/min');
    await expect(rows.nth(0)).toContainText('4 km/h');
    await expect(rows.nth(0)).toContainText('avg L4');

    await expect(rows.nth(1)).toContainText('Week 5');
    await expect(rows.nth(1)).not.toContainText('so far');
    await expect(rows.nth(1)).toContainText('3 rides');
    await expect(rows.nth(1)).toContainText('45 min');
    await expect(rows.nth(1)).toContainText('3.28 km');
    await expect(rows.nth(1)).toContainText('266.3 kcal');
    await expect(rows.nth(1)).toContainText('5.9 kcal/min');
    await expect(rows.nth(1)).toContainText('4.4 km/h');
    await expect(rows.nth(1)).toContainText('avg L4.3');
  });

  test('a week with 0 rides collapses to one line, "Last ride Oct 3", nothing hidden', async ({
    page,
  }) => {
    // Same Week 5, but no Week 6 ride at all yet — Week 6 is open with 0 rides.
    await seedLogs(page, WEEK5);
    await page.goto('/');
    await openRides(page);

    await expect(page.locator('.rides-last-ride')).toHaveText('Last ride Oct 3');
    const rows = page.locator('.rides-week-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText('Week 5');
    await expect(rows.nth(0)).toContainText('3 rides');
    await expect(page.locator('.rides-week-empty')).toHaveCount(0);
  });

  test('v64: ONE Weeks card says "rides only"; the totals, the vs table and the per-ride/per-week toggle are gone', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('.rides-weeks-card .progress-card-label')).toHaveText(
      'Weeks · rides only'
    );
    await expect(page.locator('.rides-chart-caption')).toContainText('Rides only');
    await expect(page.locator('.rides-totals-card')).toHaveCount(0);
    await expect(page.locator('.rides-vs-card')).toHaveCount(0);
    await expect(page.locator('.rides-week-table-card')).toHaveCount(0);
    await expect(page.locator('button[data-rides-chart-mode]')).toHaveCount(0);
  });

  // Five weeks of rides (the chart needs 5+ points; under 5 the numbers themselves show).
  // Week 4 is her legacy Sep 24-26 rides; Weeks 5-7 close on their third letter, Week 8 is open.
  const FIVE_WEEKS = [
    rideLog('l4a', '2026-09-24', { ...RIDE_A, workout: 'A' }),
    rideLog('l4c', '2026-09-25', { ...RIDE_C, workout: 'C' }),
    rideLog('l4b', '2026-09-26T10:00:00.000Z', { ...RIDE_B, workout: 'B' }),
    rideLog('w5a2', '2026-09-27', { ...RIDE_A, workout: 'A' }),
    rideLog('w5b2', '2026-09-28', { ...RIDE_B, workout: 'B' }),
    rideLog('w5c2', '2026-09-29T09:00:00.000Z', { ...RIDE_C, workout: 'C' }), // closes Week 5
    rideLog('w6a', '2026-10-03T09:00:00.000Z', { ...RIDE_A, workout: 'A' }),
    rideLog('w6b', '2026-10-04T09:00:00.000Z', { ...RIDE_B, workout: 'B' }),
    rideLog('w6c', '2026-10-05T09:00:00.000Z', { ...RIDE_C, workout: 'C' }), // closes Week 6
    rideLog('w7a', '2026-10-10T09:00:00.000Z', { ...RIDE_A, workout: 'A' }),
    rideLog('w7b', '2026-10-11T09:00:00.000Z', { ...RIDE_B, workout: 'B' }),
    rideLog('w7c', '2026-10-12T09:00:00.000Z', { ...RIDE_C, workout: 'C' }), // closes Week 7
    rideLog('w8a', '2026-10-17T09:00:00.000Z', { ...RIDE_A, workout: 'A' }), // opens Week 8
  ];

  test('v64: at 5+ weeks the Weeks card is bars (not a table), the per-ride/per-week toggle is gone', async ({
    page,
  }) => {
    await seedLogs(page, FIVE_WEEKS);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('#rides-weeks-chart [data-ride-id]')).toHaveCount(5);
    // No week table next to the bars (one card, one view of the weeks).
    await expect(page.locator('.rides-week-row')).toHaveCount(0);
    await expect(page.locator('button[data-rides-chart-mode]')).toHaveCount(0);
  });

  test('v64 S1: the Weeks bars run oldest to newest, left to right', async ({ page }) => {
    await seedLogs(page, FIVE_WEEKS);
    await page.goto('/');
    await openRides(page);
    const barIds = await page
      .locator('#rides-weeks-chart [data-ride-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-ride-id')));
    // Legacy Week 4 first, then Weeks 5-8.
    expect(barIds).toEqual(['2-4', '2-5', '2-6', '2-7', '2-8']);
  });

  test('v64 S2: every Weeks bar shows its own minutes, not just the open one', async ({ page }) => {
    await seedLogs(page, FIVE_WEEKS);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('#rides-weeks-chart [data-ride-id="2-5"]')).toContainText('45');
    await expect(page.locator('#rides-weeks-chart [data-ride-id="2-8"]')).toContainText('10');
  });

  test("v58 (v64): tapping a per-week bar shows that week's own one-line readout", async ({
    page,
  }) => {
    await seedLogs(page, FIVE_WEEKS);
    await page.goto('/');
    await openRides(page);

    await expect(page.locator('#rides-weeks-readout')).toBeEmpty();
    await page.locator('#rides-weeks-chart [data-ride-id="2-5"]').click();
    const readout = page.locator('#rides-weeks-readout');
    await expect(readout).toContainText('Week 5');
    await expect(readout).toContainText('3 rides');
    await expect(readout).toContainText('45 min');
    await expect(readout).toContainText('5.9 kcal/min');
    await expect(readout).toContainText('4.4 km/h');
    await expect(readout).toContainText('L4.3');

    // Tapping the open week's own bar reads "(so far)".
    await page.locator('#rides-weeks-chart [data-ride-id="2-8"]').click();
    await expect(readout).toContainText('Week 8');
    await expect(readout).toContainText('(so far)');
    await expect(readout).toContainText('1 ride');
  });

  test('v64: the readout keeps km at its own 2-decimal precision (3.28 km), and re-opening the page clears the tapped bar', async ({
    page,
  }) => {
    await seedLogs(page, FIVE_WEEKS);
    await page.goto('/');
    await openRides(page);
    await page.locator('#rides-weeks-chart [data-ride-id="2-5"]').click();
    await expect(page.locator('#rides-weeks-readout')).toContainText('3.28 km');
    await expect(page.locator('#rides-weeks-readout')).toContainText('266.3 kcal');
    await page.locator('#back-from-rides').click();
    await page.locator('#open-rides').click();
    await expect(page.locator('#rides-weeks-readout')).toBeEmpty();
  });

  test('v64: the old vs table and its Km delta are gone; no verdict word anywhere on the Weeks card', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('.rides-vs-delta')).toHaveCount(0);
    const card = page.locator('.rides-weeks-card');
    for (const word of ['better', 'worse', 'harder', 'easier']) {
      await expect(card).not.toContainText(word);
    }
  });

  test('v64: the Weeks card names each week in full ("Week 6 · so far") on its own row, under 5 weeks', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    const rows = page.locator('.rides-week-row .rides-week-lbl');
    await expect(rows.nth(0)).toHaveText('R2 · Week 6 · so far');
    await expect(rows.nth(1)).toHaveText('R2 · Week 5');
  });

  test("v64: the hero is this week's cardio minutes toward 225-250, with its basis", async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    // Week 6 (open): the 15 minute D-shaped ride.
    await expect(page.locator('.rides-minutes-card .rides-minutes-line')).toHaveText(
      '15 of 225–250 min this week'
    );
    await expect(page.locator('.rides-minutes-basis')).toHaveText('rides 15 min');
    // Calories a minute is the second card, and stays.
    await expect(page.locator('.rides-screen > .card').nth(1)).toHaveClass(/rides-hero-card/);
  });

  test('v58: ridesVsDelta — "0" not "+0" on a real tie, at each metric\'s own precision', async ({
    page,
  }) => {
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __wtRidesVsDelta: (a: number, b: number, decimals: number) => string;
      };
      return {
        tieInt: w.__wtRidesVsDelta(3, 3, 0),
        tieOneDecimal: w.__wtRidesVsDelta(4.3, 4.3, 1),
        tieTwoDecimal: w.__wtRidesVsDelta(3.28, 3.28, 2),
        // A real tie after rounding (4.301 vs 4.299 both round to 4.3 at 1
        // decimal) must ALSO read "0", not a false "+0.0"/"-0.0".
        tieAfterRounding: w.__wtRidesVsDelta(4.301, 4.299, 1),
        positive: w.__wtRidesVsDelta(5, 3, 0),
        negative: w.__wtRidesVsDelta(1, 3.28, 2),
      };
    });
    expect(result.tieInt).toBe('0');
    expect(result.tieOneDecimal).toBe('0');
    expect(result.tieTwoDecimal).toBe('0');
    expect(result.tieAfterRounding).toBe('0');
    expect(result.positive).toBe('+2');
    expect(result.negative).toBe('-2.28');
  });
});

// v61.1 fix 3 (Oct 2 2026, CHECK-v61.1.md check 2's must #1): the Totals
// card's "This week" (renderRidesTotalsCard) had already moved onto
// week-d.ts's own calendar window in the commit right before this one —
// but its neighbours on the SAME screen (the vs-card, the table, the
// per-week chart — all built from weeklyRideRows/assignRidesToWeeks) were
// left on the old [openedAt, next openedAt)/Infinity window. This is
// CHECK-v61.1.md's own "r2" repro (C Fri closes Week 5, then D before the
// Saturday session that opens Week 6 — her real Sep 28 order), driven
// through the real page instead of the pure module.
test.describe('v61.1 fix 3: "This week" and "Week by week" agree on the same D', () => {
  test('r2: C closes Week 5 on Friday, D lands Saturday before the A that opens Week 6 — "This week" and "Week 6 · so far" read the same ride count', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r2-a', '2026-09-27', { ...RIDE_A, workout: 'A' }), // Sun — Week 5
      rideLog('r2-b', '2026-09-29', { ...RIDE_B, workout: 'B' }), // Tue — Week 5
      rideLog('r2-c', '2026-10-02T12:00:00.000Z', { ...RIDE_C, workout: 'C' }), // Fri 15:00 local — closes Week 5
      rideLog('r2-d', '2026-10-03T05:00:00.000Z', {
        level: 4,
        km: 1,
        kcal: 70,
        timeSec: 900,
        workout: 'D',
      }), // Sat 08:00 local — BEFORE the A below, her real order
      rideLog('r2-a6', '2026-10-03T10:00:00.000Z', { ...RIDE_A, workout: 'A' }), // Sat 13:00 local — opens Week 6
    ]);
    await page.goto('/');
    await openRides(page);

    // v64: the hero's minutes (the Sat A 10 min + the Sat D 15 min, both in the open Week 6 window).
    await expect(page.locator('.rides-minutes-n')).toHaveText('25');

    const rows = page.locator('.rides-week-row');
    const week6Row = rows.filter({ hasText: 'Week 6' });
    await expect(week6Row).toContainText('so far');
    // Before this fix: "1 ride" here — assignRidesToWeeks' own date-range
    // fallback put the Sat D in Week 5 (its window ran up to the A's own
    // 13:00 openedAt, which the 08:00 D fell before) while "This week"
    // above had already moved it to Week 6.
    await expect(week6Row).toContainText('2 rides');

    const week5Row = rows.filter({ hasText: 'Week 5' }).first();
    await expect(week5Row).not.toContainText('2 rides'); // the D never counted here either
  });
});

// v57 fix pass (Sep 28 2026) — CHECK-v57-2026-09-28.md M1 (must).
test.describe('v57 fix pass: legacy Week 4 (Sep 28 2026)', () => {
  test('rides logged before the completion launch (her real Week 4) show as a legacy row, not dropped', async ({
    page,
  }) => {
    // Her real 3 rides, real dates, the REAL launch instant (no test-only
    // override) — CHECK-v57 M1's own repro: on her phone today the table
    // showed one row ("Week 5 · so far") and every vs-card cell read "—",
    // even though the Totals card above it counted all of her rides.
    await seedLogs(page, [
      rideLog('a1', '2026-09-24', { ...RIDE_A, workout: 'A' }),
      rideLog('c1', '2026-09-25', { ...RIDE_C, workout: 'C' }),
      rideLog('b1', '2026-09-26', { ...RIDE_B, workout: 'B' }),
    ]);
    await page.goto('/');
    await openRides(page);

    // v64: Week 5 is open with no ride yet, so it collapses to one line; Week 4 keeps its row.
    await expect(page.locator('.rides-last-ride')).toHaveText('Last ride Sep 26');
    const rows = page.locator('.rides-week-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText('Week 4');
    await expect(rows.nth(0)).not.toContainText('so far');
    await expect(rows.nth(0)).toContainText('3 rides');
    await expect(rows.nth(0)).toContainText('45 min');
    await expect(rows.nth(0)).toContainText('3.28 km');
    await expect(rows.nth(0)).toContainText('266.3 kcal');
    await expect(rows.nth(0)).toContainText('5.9 kcal/min');
    await expect(rows.nth(0)).toContainText('4.4 km/h');
    await expect(rows.nth(0)).toContainText('avg L4.3');
    // The Sat Sep 26 B is Week 4's own closing ride (the swing rule): it must not ALSO land in
    // Week 5 (membership-first bucketing). The hero is one gentle line for the open Week 5.
    await expect(page.locator('.rides-minutes-none')).toHaveText(
      'No cardio yet this week · last ride Sep 26'
    );
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('no horizontal scroll with a full page (minutes, calories, usual/best, weeks, per-ride, list)', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-01', RIDE_A),
      rideLog('r2', '2026-09-05', RIDE_C),
      rideLog('r3', '2026-09-10', RIDE_B),
      rideLog('r4', '2026-09-15', RIDE_A),
      rideLog('r5', '2026-09-20', RIDE_C),
      rideLog('r6', '2026-09-24', { level: 5, km: null, kcal: 0, timeSec: null }),
      rideLog('r7', '2026-09-26', RIDE_B),
      // v57: real post-launch weeks too, so the vs-card + week table render
      // with actual numbers (not just empty states) under the width check.
      rideLog('r8', '2026-09-27', { ...RIDE_A, workout: 'A' }),
      rideLog('r9', '2026-09-30', { ...RIDE_C, workout: 'C' }),
      rideLog('r10', '2026-10-03', { ...RIDE_B, workout: 'B' }),
      rideLog('r11', '2026-10-04', { level: 4, km: 1, kcal: 70, timeSec: 900 }),
    ]);
    await page.goto('/');
    await openRides(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('v64: no horizontal scroll with the 5-week bar chart showing', async ({ page }) => {
    await seedLogs(page, [
      rideLog('l4a', '2026-09-24', { ...RIDE_A, workout: 'A' }),
      rideLog('w5a', '2026-09-27', { ...RIDE_A, workout: 'A' }),
      rideLog('w5b', '2026-09-28', { ...RIDE_B, workout: 'B' }),
      rideLog('w5c', '2026-09-29T09:00:00.000Z', { ...RIDE_C, workout: 'C' }),
      rideLog('w6a', '2026-10-03T09:00:00.000Z', { ...RIDE_A, workout: 'A' }),
      rideLog('w6b', '2026-10-04T09:00:00.000Z', { ...RIDE_B, workout: 'B' }),
      rideLog('w6c', '2026-10-05T09:00:00.000Z', { ...RIDE_C, workout: 'C' }),
      rideLog('w7a', '2026-10-10T09:00:00.000Z', { ...RIDE_A, workout: 'A' }),
      rideLog('w7b', '2026-10-11T09:00:00.000Z', { ...RIDE_B, workout: 'B' }),
      rideLog('w7c', '2026-10-12T09:00:00.000Z', { ...RIDE_C, workout: 'C' }),
      rideLog('w8a', '2026-10-17T09:00:00.000Z', { ...RIDE_A, workout: 'A' }),
    ]);
    await page.goto('/');
    await openRides(page);
    await expect(page.locator('#rides-weeks-chart')).toBeVisible();
    for (const width of [360, 412]) {
      await page.setViewportSize({ width, height: 915 });
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(over, `${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
