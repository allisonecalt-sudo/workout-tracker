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

type Row = Record<string, unknown>;

test.beforeEach(async ({ page }) => {
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
    workout?: 'A' | 'B' | 'C';
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
    await expect(page.locator('#rides-proj-line')).toHaveText('= 378 kcal · 4.3 km in an hour');
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
  test('renders one bar per ride with numbers, latest highlighted, and a tap opens a one-line readout', async ({
    page,
  }) => {
    await seedLogs(page, [
      rideLog('r1', '2026-09-20', { ...RIDE_A, workout: 'A' }),
      rideLog('r2', '2026-09-23', { ...RIDE_C, workout: 'C' }),
      rideLog('r3', '2026-09-25', { ...RIDE_B, workout: 'B' }),
      rideLog('r4', '2026-09-26', { level: 5, km: null, kcal: 0, timeSec: null }), // no numbers -> not charted
    ]);
    await page.goto('/');
    await openRides(page);

    const bars = page.locator('#rides-chart [data-ride-id]');
    // Only the 3 rides WITH numbers are charted (§4.2's exclusion).
    await expect(bars).toHaveCount(3);

    // No readout until she taps one.
    await expect(page.locator('#rides-chart-readout')).toHaveText('');

    await bars.nth(0).click();
    await expect(page.locator('#rides-chart-readout')).toContainText('Sep 20');
    await expect(page.locator('#rides-chart-readout')).toContainText('Workout A');
    await expect(page.locator('#rides-chart-readout')).toContainText('6.3 kcal/min');

    await bars.nth(2).click();
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
    ]);
    await page.goto('/');
    await openRides(page);

    const chartText = await page.locator('#rides-chart').evaluate((el) => el.textContent ?? '');
    expect(chartText).toContain('L5');
    expect(chartText).toContain('L3');
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
      rideLog('r2', '2026-09-25', { level: 4, km: null, kcal: 0, timeSec: null }),
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

test.describe('phone width', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('no horizontal scroll with a full page (hero, usual/best, totals, chart, list)', async ({
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
    ]);
    await page.goto('/');
    await openRides(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
