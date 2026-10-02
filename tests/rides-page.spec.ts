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

  test('a week with 0 rides shows a plain "—", nothing hidden', async ({ page }) => {
    // Same Week 5, but no Week 6 ride at all yet — Week 6 is open with 0.
    await seedLogs(page, WEEK5);
    await page.goto('/');
    await openRides(page);

    const rows = page.locator('.rides-week-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Week 6');
    await expect(rows.nth(0)).toContainText('so far');
    await expect(rows.nth(0).locator('.rides-week-empty')).toHaveText('—');
    await expect(rows.nth(1)).toContainText('3 rides');
  });

  test('"This week vs last week": the same 7 numbers side by side, plain Δ, never a verdict word', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);

    const card = page.locator('.rides-vs-card');
    await expect(card).toContainText('This week vs last week');
    await expect(card).toContainText('Week 6');
    await expect(card).toContainText('(so far)');
    await expect(card).toContainText('Week 5');

    const rows = card.locator('.rides-vs-row');
    await expect(rows).toHaveCount(7); // rides, minutes, km, kcal, kcal/min, km/h, level

    const ridesRow = rows.filter({ hasText: 'Rides' });
    await expect(ridesRow.locator('.rides-vs-val').nth(0)).toHaveText('1');
    await expect(ridesRow.locator('.rides-vs-val').nth(1)).toHaveText('3');
    await expect(ridesRow.locator('.rides-vs-delta')).toHaveText('-2');

    const kcalRow = rows.filter({ hasText: 'Kcal/min' });
    await expect(kcalRow.locator('.rides-vs-val').nth(0)).toHaveText('4.7');
    await expect(kcalRow.locator('.rides-vs-val').nth(1)).toHaveText('5.9');
    await expect(kcalRow.locator('.rides-vs-delta')).toHaveText('-1.2');

    // Her rule, carried through this whole page: plain numbers, no verdicts.
    await expect(card).not.toContainText('better');
    await expect(card).not.toContainText('worse');
    await expect(card).not.toContainText('harder');
    await expect(card).not.toContainText('easier');
  });

  test('the chart\'s "per ride · per week" toggle', async ({ page }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);

    // Default is "Per ride" — the existing per-ride chart, unchanged.
    await expect(page.locator('button[data-rides-chart-mode="perRide"]')).toHaveClass(/is-on/);
    await expect(page.locator('#rides-chart-readout')).toHaveCount(1);

    await page.locator('button[data-rides-chart-mode="perWeek"]').click();
    await expect(page.locator('button[data-rides-chart-mode="perWeek"]')).toHaveClass(/is-on/);
    await expect(page.locator('button[data-rides-chart-mode="perRide"]')).not.toHaveClass(/is-on/);

    // One bar per week (Week 5, Week 6) — total minutes, not kcal/min.
    const bars = page.locator('#rides-chart [data-ride-id]');
    await expect(bars).toHaveCount(2);
    await expect(page.locator('.rides-chart-caption')).toContainText('Total minutes');
    // v58 fix pass (Sep 28 2026), nice-items list item 3: per-week mode now
    // gets the same tap -> readout mechanism as per-ride — the readout div
    // exists (empty) before a tap, same as the per-ride chart's own.
    await expect(page.locator('#rides-chart-readout')).toHaveCount(1);
    await expect(page.locator('#rides-chart-readout')).toBeEmpty();

    // Switching back to "Per ride" restores the original chart + readout.
    await page.locator('button[data-rides-chart-mode="perRide"]').click();
    await expect(page.locator('#rides-chart-readout')).toHaveCount(1);
  });

  test("v58: tapping a per-week bar shows that week's own one-line readout", async ({ page }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();

    await expect(page.locator('#rides-chart-readout')).toBeEmpty();
    await page.locator('#rides-chart [data-ride-id="2-5"]').click();
    const readout = page.locator('#rides-chart-readout');
    await expect(readout).toContainText('Week 5');
    await expect(readout).toContainText('3 rides');
    await expect(readout).toContainText('45 min');
    await expect(readout).toContainText('3.28 km');
    await expect(readout).toContainText('266.3 kcal');
    await expect(readout).toContainText('5.9 kcal/min');
    await expect(readout).toContainText('4.4 km/h');
    await expect(readout).toContainText('L4.3');

    // Tapping the open week's own bar reads "(so far)", same convention the
    // table and vs-card already use for the still-open week.
    await page.locator('#rides-chart [data-ride-id="2-6"]').click();
    await expect(readout).toContainText('Week 6');
    await expect(readout).toContainText('(so far)');
    await expect(readout).toContainText('1 ride');

    // Switching mode clears the selection, same reset rule as per-ride.
    await page.locator('button[data-rides-chart-mode="perRide"]').click();
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();
    await expect(page.locator('#rides-chart-readout')).toBeEmpty();
  });

  test('re-opening the page resets the chart toggle to "Per ride"', async ({ page }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();
    await expect(page.locator('button[data-rides-chart-mode="perWeek"]')).toHaveClass(/is-on/);

    await page.locator('#back-from-rides').click();
    await page.locator('#open-rides').click();
    await expect(page.locator('button[data-rides-chart-mode="perRide"]')).toHaveClass(/is-on/);
  });

  // v57 fix pass (Sep 28 2026) — CHECK-v57-2026-09-28.md, shoulds S1-S3.
  test('S1: the per-week chart runs oldest to newest, left to right, same as the per-ride chart', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();

    const barIds = await page
      .locator('#rides-chart [data-ride-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-ride-id')));
    // Week 5 (round 2, week 5) first, Week 6 second — oldest to newest.
    expect(barIds).toEqual(['2-5', '2-6']);
  });

  test('S2: every bar in per-week mode shows its own minutes, not just the open one', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();

    // Week 5 (closed, not highlighted) still shows its own "45" — before
    // this fix only the open bar (Week 6) had a value label.
    await expect(page.locator('#rides-chart [data-ride-id="2-5"]')).toContainText('45');
    await expect(page.locator('#rides-chart [data-ride-id="2-6"]')).toContainText('15');
  });

  test('S3: the vs-card header carries short column labels; full week names sit on their own line', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);

    await expect(page.locator('.rides-vs-names')).toContainText('Week 6');
    await expect(page.locator('.rides-vs-names')).toContainText('(so far)');
    await expect(page.locator('.rides-vs-names')).toContainText('Week 5');

    const header = page.locator('.rides-vs-header');
    await expect(header.locator('.rides-vs-val').nth(0)).toHaveText('This');
    await expect(header.locator('.rides-vs-val').nth(1)).toHaveText('Last');
    await expect(header.locator('.rides-vs-delta')).toHaveText('Δ');
  });

  // v58 fix pass (Sep 28 2026), nice-items list item 3: "Δ rounded to the
  // compared value's precision and '0' not '+0'".
  test('v58: the Km Δ keeps its own 2-decimal precision (Week 6 1 km vs Week 5 3.28 km)', async ({
    page,
  }) => {
    await seedLogs(page, [...WEEK5, WEEK6_D]);
    await page.goto('/');
    await openRides(page);

    const card = page.locator('.rides-vs-card');
    const kmRow = card.locator('.rides-vs-row').filter({ hasText: 'Km' }).first();
    await expect(kmRow.locator('.rides-vs-delta')).toHaveText('-2.28');
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

    const thisWeekRow = page.locator('.rides-totals-row').filter({ hasText: 'This week' });
    await expect(thisWeekRow).toContainText('2 rides'); // the Sat A + the Sat D, both in the open Week 6 window

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

    const rows = page.locator('.rides-week-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Week 5');
    await expect(rows.nth(0)).toContainText('so far');
    await expect(rows.nth(0).locator('.rides-week-empty')).toHaveText('—');

    await expect(rows.nth(1)).toContainText('Week 4');
    await expect(rows.nth(1)).not.toContainText('so far');
    await expect(rows.nth(1)).toContainText('3 rides');
    await expect(rows.nth(1)).toContainText('45 min');
    await expect(rows.nth(1)).toContainText('3.28 km');
    await expect(rows.nth(1)).toContainText('266.3 kcal');
    await expect(rows.nth(1)).toContainText('5.9 kcal/min');
    await expect(rows.nth(1)).toContainText('4.4 km/h');
    await expect(rows.nth(1)).toContainText('avg L4.3');

    // The Sat Sep 26 B is Week 4's own closing ride (the swing rule) — it
    // must not ALSO land in Week 5's count (the exact double-count risk
    // membership-first bucketing exists to avoid).
    const card = page.locator('.rides-vs-card');
    await expect(card).toContainText('Week 4');
    const ridesRow = card.locator('.rides-vs-row').filter({ hasText: 'Rides' });
    // v58 fix pass (Sep 28 2026), nice-items list item 3: "one empty-week
    // style for both cards" — a 0-ride week now reads as a single "—" here
    // too, the exact rule the week table (rides-week-row) already applied
    // (a 0-ride week gets ONE dash, not "0 rides · 0 min · 0 km · 0 kcal"
    // sitting next to a "—" on the very next averaged row).
    await expect(ridesRow.locator('.rides-vs-val').nth(0)).toHaveText('—'); // Week 5, so far
    await expect(ridesRow.locator('.rides-vs-val').nth(1)).toHaveText('3'); // Week 4
    await expect(ridesRow.locator('.rides-vs-delta')).toHaveText('—');
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('no horizontal scroll with a full page (hero, usual/best, totals, week-by-week, chart, list)', async ({
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

    // Same check with the "per week" chart mode showing too.
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();
    const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth2).toBeLessThanOrEqual(clientWidth);
  });
});
