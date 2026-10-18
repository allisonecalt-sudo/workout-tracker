// tests/screens/number-fixes.spec.ts - v62.3 "make every number true" (Oct 16 2026).
//
// One describe per fix (F1..F9): a number that two screens (or a label and its
// bar) used to disagree about is checked on the real screens, with her real
// shapes seeded (Week 4 legacy A/B/C, Week 5 moved on with a D ride, the Sep 24
// first ride, ...). The matching pure-logic tests live in
// tests/number-fixes.test.ts.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate, movableClock, advanceClock, advanceToExercise } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

type Row = Record<string, unknown>;

const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
  await page.addInitScript((rows) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
  }, logs);
};

const log = (id: string, date: string, workout: 'A' | 'B' | 'C' | 'D', extra: Row = {}): Row => ({
  id,
  date,
  workout,
  capacityBefore: 6,
  capacityAfter: 7,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  synced: true,
  ...extra,
});

// Her Week 5 shape on Wed Sep 30 (before the Oct 3 hand-over the Sick weeks
// move): Week 4 closed legacy (A, C, B), Week 5 = A + B + a D ride ->
// "3 / 4" with the D counted in; A/B/C alone = 2.
const week5OpenWithD = async (page: Page): Promise<void> => {
  await seedLogs(page, [
    log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
    log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
    log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
    log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
    log('wk5-b', '2026-09-28T10:00:00+03:00', 'B'),
    log('wk5-d', '2026-09-29T10:00:00+03:00', 'D'),
  ]);
  await mockDate(page, '2026-09-30T08:00:00+03:00');
};

test.describe('v62.3 F1 - per-week bar fill = its label', () => {
  test('Week 5 labelled "3 / 4" fills 75%, not 2/3', async ({ page }) => {
    await week5OpenWithD(page);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const wk5 = page
      .locator('.spw-card')
      .locator(':scope > .spw-rows > .spw-row')
      .filter({ has: page.locator('.spw-label:text-is("wk 5")') });
    await expect(wk5.locator('.spw-count')).toHaveText('3 / 4 · open');
    await expect(wk5.locator('.spw-fill')).toHaveAttribute('style', 'width:75%');
  });
});

test.describe('v62.3 F2 - the weekly review counts sessions one way', () => {
  test('a closed Week 5 with a D ride: header "4 of 4" and the "vs previous week" box says 3 -> 4, not 3 -> 3', async ({
    page,
  }) => {
    await seedLogs(page, [
      log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A'),
      log('wk5-d', '2026-09-28T12:00:00+03:00', 'D'),
      log('wk5-b', '2026-09-28T14:00:00+03:00', 'B'),
      log('wk5-c', '2026-09-29T10:00:00+03:00', 'C'), // closes Week 5
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00'); // Wed, mid-gap
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('Week 5');
    await expect(page.locator('.weekly-review-subtitle')).toContainText('4 of 4');
    const sessionsRow = page
      .locator('.weekly-review-delta-row')
      .filter({ has: page.locator('.weekly-review-delta-lbl:text-is("sessions")') });
    await expect(sessionsRow.locator('.weekly-review-delta-vals')).toHaveText('3 → 4');
  });
});

test.describe('v62.3 F3 - Home and Progress read the same session count', () => {
  test('3 sessions + 1 D ride: both screens say 3 with "+1 ride", never 4', async ({ page }) => {
    await seedLogs(page, [
      log('wk4-a', '2026-09-24T15:56:00+03:00', 'A'),
      log('wk4-c', '2026-09-25T11:53:00+03:00', 'C'),
      log('wk4-b', '2026-09-26T19:14:51+03:00', 'B'),
      log('wk5-d', '2026-09-29T10:00:00+03:00', 'D'),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    const homeRow = page
      .locator('.home-startnow-card .start-now-row')
      .filter({ has: page.locator('.start-now-lbl:text-is("Sessions")') });
    await expect(homeRow.locator('.sn-last')).toHaveText('3 +1 ride');
    await page.locator('#open-progress-link').click();
    await expect(page.locator('.start-now-card .start-now-hero')).toHaveText('3 sessions +1 ride');
  });
});

// Her Start -> Now shape: sessions since May 2 (that first A held a PRESCRIBED
// wall sit, not an honest one), the first elliptical ride and the first honest
// wall sit both on Sep 24, a second ride Sep 26.
const startNowShape = async (page: Page): Promise<void> => {
  await seedLogs(page, [
    log('may-a', '2026-05-02T15:00:00+03:00', 'A', { wallSitSec: 33 }),
    log('sep24-a', '2026-09-24T15:56:00+03:00', 'A', {
      wallSitSec: 44,
      cardioLane: 'elliptical',
      cardioMinutes: 10,
      ellipticalLevel: 5,
      ellipticalKm: 0.72,
      ellipticalKcal: 63.4,
      ellipticalTimeSec: 602,
    }),
    log('sep25-c', '2026-09-25T11:53:00+03:00', 'C'),
    log('sep26-b', '2026-09-26T19:14:51+03:00', 'B', {
      wallSitSec: 45,
      cardioLane: 'elliptical',
      cardioMinutes: 12,
      ellipticalLevel: 3,
      ellipticalKm: 0.83,
      ellipticalKcal: 70.1,
      ellipticalTimeSec: 720,
    }),
  ]);
  await mockDate(page, '2026-09-30T08:00:00+03:00');
};

test.describe('v62.3 F4 - each Start -> Now row says its own "since"', () => {
  test('Home: Sessions since May 2, Elliptical since Sep 24, Wall sit since Sep 24; no card-level "since"', async ({
    page,
  }) => {
    await startNowShape(page);
    await page.goto('/');
    const card = page.locator('.home-startnow-card');
    const since = (label: string) =>
      card
        .locator('.start-now-row')
        .filter({ has: page.locator(`.start-now-lbl:text-is("${label}")`) })
        .locator('.sn-since');
    await expect(since('Sessions')).toHaveText('since May 2');
    await expect(since('Elliptical')).toHaveText('since Sep 24');
    await expect(since('Wall sit')).toHaveText('since Sep 24');
    await expect(card.locator('.progress-card-meta')).toHaveCount(0);
  });

  test('Progress: the same three, and the card-level "since May 2" line is gone', async ({
    page,
  }) => {
    await startNowShape(page);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const card = page.locator('.start-now-card');
    await expect(card.locator('.start-now-since .sn-since')).toHaveText('since May 2');
    const since = (label: string) =>
      card
        .locator('.start-now-row')
        .filter({ has: page.locator(`.start-now-lbl:text-is("${label}")`) })
        .locator('.sn-since');
    await expect(since('Elliptical')).toHaveText('since Sep 24');
    await expect(since('Wall sit')).toHaveText('since Sep 24');
    await expect(card.locator('.progress-card-meta')).toHaveCount(0);
  });
});

test.describe('v62.3 F5 - the elliptical level shows the ride length at each end', () => {
  test('Home: "level 5 for 10 min → level 3 for 12 min", not a bare "5 → 3"', async ({ page }) => {
    await startNowShape(page);
    await page.goto('/');
    const row = page
      .locator('.home-startnow-card .start-now-row')
      .filter({ has: page.locator('.start-now-lbl:text-is("Elliptical")') });
    await expect(row.locator('.sn-first')).toHaveText('level 5 for 10 min');
    await expect(row.locator('.sn-last')).toHaveText('level 3 for 12 min');
  });

  test('Home: the row label is exactly "Elliptical"', async ({ page }) => {
    await startNowShape(page);
    await page.goto('/');
    const labels = await page.locator('.home-startnow-card .start-now-lbl').allTextContents();
    expect(labels).toContain('Elliptical');
    expect(labels).not.toContain('Elliptical level');
  });

  test('Progress: the same phrase, then only the latest km (no separate "in N min")', async ({
    page,
  }) => {
    await startNowShape(page);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const val = page
      .locator('.start-now-card .start-now-row')
      .filter({ has: page.locator('.start-now-lbl:text-is("Elliptical")') })
      .locator('.start-now-val');
    await expect(val).toContainText('level 5 for 10 min → level 3 for 12 min · 0.83 km');
    await expect(val).not.toContainText('in 12 min');
  });
});

// Rides page shapes. Week 5 (open on Wed Sep 30): a console-timed ride Sep 27
// (10 min) and her D ride Sep 28 with NO console time but 30 logged minutes.
const ride = (id: string, date: string, workout: 'A' | 'B' | 'C' | 'D', extra: Row): Row =>
  log(id, date, workout, { cardioLane: 'elliptical', ...extra });

const openRidesPage = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await page.locator('#open-rides').click();
  await expect(page.locator('.screen-header h2')).toHaveText('Your rides');
};

test.describe('v62.3 F6 - ride minutes count the D ride', () => {
  test('Week 5 minutes = 10 + 30 from the D ride; the chart caption says what it counts', async ({
    page,
  }) => {
    await seedLogs(page, [
      ride('wk5-a', '2026-09-27T10:00:00+03:00', 'A', {
        ellipticalLevel: 5,
        ellipticalKm: 0.72,
        ellipticalKcal: 63.4,
        ellipticalTimeSec: 600,
        cardioMinutes: 10,
      }),
      ride('wk5-d', '2026-09-28T10:00:00+03:00', 'D', { cardioMinutes: 30 }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await openRidesPage(page);
    const week5 = page.locator('.rides-week-row').filter({ hasText: 'Week 5' });
    await expect(week5).toContainText('2 rides');
    await expect(week5).toContainText('40 min');
    await page.locator('button[data-rides-chart-mode="perWeek"]').click();
    await expect(page.locator('.rides-chart-caption')).toHaveText(
      "Total minutes ridden that week (rides only; walks and hikes aren't counted here)."
    );
  });
});

test.describe('v62.3 F7 - "no numbers" only when there really are none', () => {
  test('a ride with km and kcal but no time shows them; one with nothing says "no numbers"; the Progress door follows the same rule', async ({
    page,
  }) => {
    await seedLogs(page, [
      ride('r-readings', '2026-09-28T10:00:00+03:00', 'D', {
        ellipticalKm: 2.1,
        ellipticalKcal: 190.8,
        cardioMinutes: 30,
      }),
      ride('r-nothing', '2026-09-29T10:00:00+03:00', 'D', { cardioMinutes: 30 }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    await expect(page.locator('#open-progress-link')).toBeVisible();
    await page.locator('#open-progress-link').click();
    // The door's sub-line names the latest ride (Sep 29: nothing recorded).
    await expect(page.locator('.rides-door-sub')).toHaveText('Sep 29 · no numbers');
    await page.locator('#open-rides').click();
    const rows = page.locator('.rides-list-row');
    await expect(rows.filter({ hasText: 'Sep 28' }).locator('.rides-list-right')).toHaveText(
      '— · 2.1 km · 190.8 kcal · —'
    );
    await expect(rows.filter({ hasText: 'Sep 29' }).locator('.rides-list-nonum')).toHaveText(
      'no numbers'
    );
  });

  test('the Progress door shows the latest ride readings when it has some but no rate', async ({
    page,
  }) => {
    await seedLogs(page, [
      ride('r-readings', '2026-09-28T10:00:00+03:00', 'D', {
        ellipticalKm: 2.1,
        ellipticalKcal: 190.8,
        cardioMinutes: 30,
      }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    await expect(page.locator('.rides-door-sub')).toHaveText(
      'Sep 28 · — · 2.1 km · 190.8 kcal · —'
    );
  });
});

test.describe("v62.3 F8 - Claude's notes are not shown as her words", () => {
  const CLAUDE_TEXT = 'Claude-logged: Oct 1 hike, 40 min, from the chat';
  const seedNotes = async (page: Page): Promise<void> => {
    await seedLogs(page, [
      log('wk5-a', '2026-09-27T10:00:00+03:00', 'A', { sessionNote: CLAUDE_TEXT }),
      log('wk5-b', '2026-09-28T10:00:00+03:00', 'B', { sessionNote: 'Knee fine' }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
  };

  test("Weekly review rows: Claude's note is plain behind a label; hers stays italic", async ({
    page,
  }) => {
    await seedNotes(page);
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    const rows = page.locator('.weekly-review-sessions .session-row');
    const claude = rows.filter({ hasText: 'Claude-logged' }).locator('.history-word');
    await expect(claude.locator('.claude-note-label')).toHaveText("Claude's note:");
    await expect(claude).toHaveCSS('font-style', 'normal');
    const hers = rows.filter({ hasText: 'Knee fine' }).locator('.history-word');
    await expect(hers).toHaveText('Knee fine');
    await expect(hers).toHaveCSS('font-style', 'italic');
  });

  test("Sessions list and Session detail: the same label on Claude's note, none on hers", async ({
    page,
  }) => {
    await seedNotes(page);
    await page.goto('/');
    await page.locator('#view-history').click();
    const claudeWord = page
      .locator('.session-row')
      .filter({ hasText: 'Claude-logged' })
      .locator('.history-word');
    await expect(claudeWord.locator('.claude-note-label')).toHaveText("Claude's note:");
    await expect(claudeWord).toHaveCSS('font-style', 'normal');
    await expect(
      page.locator('.session-row').filter({ hasText: 'Knee fine' }).locator('.claude-note-label')
    ).toHaveCount(0);
    // Session detail
    await page.locator('.session-row').filter({ hasText: 'Claude-logged' }).click();
    await expect(page.locator('#detail-session-note .claude-note-label')).toHaveText(
      "Claude's note:"
    );
    await expect(page.locator('#detail-session-note')).toContainText(CLAUDE_TEXT);
  });
});

// F9 - apartment cardio, reload mid-block. She rode 45 s of the 10-minute block,
// the app reloaded (a fresh page on the same storage, its clock 45 s on), she
// finished the session: the saved minutes are what the timer would have shown
// (1 min for 45 s), never the full block.
test.describe('v62.3 F9 - apartment cardio after a reload saves what she rode', () => {
  const START_ISO = '2026-09-08T10:00:00.000Z';

  const startApartmentBlock = async (page: Page): Promise<void> => {
    await movableClock(page, START_ISO, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-apartment').click();
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip-time')).toHaveText('10:00');
  };

  const finishAndRead = async (page: Page): Promise<Row> => {
    for (let i = 0; i < 40; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      const next = page.locator('#next, #start-round-2, #ww-skip');
      if (await next.isVisible()) await next.click();
      else break;
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = (await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]')
    )) as Row[];
    expect(logs.length).toBe(1);
    return logs[0]!;
  };

  test('45 s ridden, reload, finish: cardio_minutes is 1, not the full 10', async ({
    page,
    context,
  }) => {
    await startApartmentBlock(page);
    await advanceClock(page, 45_000);
    await expect(page.locator('.timer-pip-time')).toHaveText('9:15');

    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:00:45.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Apartment cardio');
    // The step does not claim the whole block is done.
    await expect(reopened.locator('.timer-done')).not.toContainText('10 min');

    const saved = await finishAndRead(reopened);
    expect(saved['cardioLane']).toBe('apartment');
    expect(saved['cardioMinutes']).toBe(1);
  });

  test('a block that ran past its end before the reload still saves the full block', async ({
    page,
    context,
  }) => {
    await startApartmentBlock(page);
    await advanceClock(page, 11 * 60_000);
    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:11:00.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Apartment cardio');
    const saved = await finishAndRead(reopened);
    expect(saved['cardioMinutes']).toBe(10);
  });

  test('paused time inside the block is not counted: 150 s ridden, 300 s paused, reload, resume, finish -> 3 min', async ({
    page,
    context,
  }) => {
    await startApartmentBlock(page);
    await advanceClock(page, 150_000);
    await expect(page.locator('.timer-pip-time')).toHaveText('7:30');
    await page.locator('#pause-toggle').click();
    await expect(page.locator('#paused-overlay')).toBeVisible();
    await advanceClock(page, 300_000);

    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:07:30.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await reopened.locator('#pause-resume').click();
    await expect(reopened.locator('.exercise-name')).toHaveText('Apartment cardio');
    const saved = await finishAndRead(reopened);
    // 450 s of wall clock since the start, 300 s of it paused -> 150 s -> 2.5 -> 3 min.
    expect(saved['cardioMinutes']).toBe(3);
  });

  test('"Log what I did" after a reload also saves the minutes she rode', async ({
    page,
    context,
  }) => {
    await startApartmentBlock(page);
    await advanceClock(page, 45_000);
    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:00:45.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Apartment cardio');
    await reopened.locator('#quit').click();
    await reopened.locator('#quit-log').click();
    await expect(reopened.locator('text=Quick log')).toBeVisible();
    await reopened.locator('#save-log').click();
    await expect(reopened.locator('.home-header h1')).toBeVisible();
    const logs = (await reopened.evaluate(() =>
      JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]')
    )) as Row[];
    expect(logs[0]!['cardioMinutes']).toBe(1);
  });

  test('jumping to another step while the block runs saves what she rode (45 s -> 1 min)', async ({
    page,
  }) => {
    await startApartmentBlock(page);
    await advanceClock(page, 45_000);
    await page.locator('#step-list-open').click();
    await page.locator('.step-list-row[data-jump-key]').nth(3).click();
    await expect(page.locator('.step-list-panel')).toHaveCount(0);
    await expect(page.locator('.exercise-name')).toHaveText('Glute squeezes');
    // She never comes back to the cardio step: the session is logged from where she jumped to.
    await page.locator('#quit').click();
    await page.locator('#quit-log').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = (await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]')
    )) as Row[];
    expect(logs[0]!['cardioLane']).toBe('apartment');
    expect(logs[0]!['cardioMinutes']).toBe(1);
  });

  test('after a reload, nothing is stored only when the start time truly cannot be recovered', async ({
    page,
    context,
  }) => {
    await startApartmentBlock(page);
    await advanceClock(page, 45_000);
    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:00:45.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Apartment cardio');
    await reopened.evaluate(() =>
      window.localStorage.setItem('workout-tracker:ww-lane-started', 'x')
    );
    const saved = await finishAndRead(reopened);
    expect(saved['cardioLane']).toBe('apartment');
    expect(saved['cardioMinutes']).toBeNull();
  });

  test('never started the timer: the prescription stands (unchanged)', async ({ page }) => {
    await movableClock(page, START_ISO, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#ww-apartment').click();
    const saved = await finishAndRead(page);
    expect(saved['cardioMinutes']).toBe(10);
  });
});

test.describe('v62.3 fix round 1 (item 1) - Home Elliptical value keeps the word "level" in every branch', () => {
  const eRow = (page: Page) =>
    page
      .locator('.home-startnow-card .start-now-row')
      .filter({ has: page.locator('.start-now-lbl:text-is("Elliptical")') })
      .locator('.start-now-val');

  test('one ride with a level: "level 5", then its own since', async ({ page }) => {
    await seedLogs(page, [
      log('sep24-a', '2026-09-24T15:56:00+03:00', 'A', {
        cardioLane: 'elliptical',
        ellipticalLevel: 5,
        ellipticalTimeSec: 602,
      }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    await expect(eRow(page)).toHaveText('level 5since Sep 24');
    await expect(eRow(page).locator('.sn-last')).toHaveText('level 5');
  });

  test('never ridden, tonight has the ride: "level 3 → first ride tonight"', async ({ page }) => {
    await seedLogs(page, [log('sep20-b', '2026-09-20T15:00:00+03:00', 'B')]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    await expect(eRow(page).locator('.sn-first')).toHaveText('level 3');
    await expect(eRow(page).locator('.sn-last')).toHaveText('first ride tonight');
  });

  test('ridden but no level recorded: "level not recorded yet" (unchanged)', async ({ page }) => {
    await seedLogs(page, [
      log('sep24-a', '2026-09-24T15:56:00+03:00', 'A', { cardioLane: 'elliptical' }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await page.goto('/');
    await expect(eRow(page).locator('.sn-last')).toHaveText('level not recorded yet');
  });

  test('two rides: both ends say "level N" (F5)', async ({ page }) => {
    await startNowShape(page);
    await page.goto('/');
    await expect(eRow(page).locator('.sn-first')).toHaveText('level 5 for 10 min');
    await expect(eRow(page).locator('.sn-last')).toHaveText('level 3 for 12 min');
  });
});

test.describe('v62.3 fix round 1 (item 2) - "+1 ride" is a quiet tag', () => {
  for (const width of [360, 412]) {
    test(`Home and Progress at ${width}px: "+1 ride" matches the "sessions" unit's size and weight, no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await startNowShape(page);
      await seedLogs(page, [
        log('a', '2026-05-02T15:00:00+03:00', 'A'),
        log('b', '2026-09-24T15:56:00+03:00', 'B'),
        log('d', '2026-09-29T10:00:00+03:00', 'D'),
      ]);
      await page.goto('/');
      const noSideways = async (): Promise<void> => {
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(over).toBeLessThanOrEqual(0);
      };
      await noSideways();
      await expect(page.locator('.home-startnow-card .sn-extra')).toHaveText('+1 ride');
      await page.locator('#open-progress-link').click();
      const extra = page.locator('.start-now-card .sn-extra');
      const unit = page.locator('.start-now-card .start-now-unit');
      await expect(extra).toHaveText('+1 ride');
      const style = (loc: typeof extra) =>
        loc.evaluate((el) => {
          const c = getComputedStyle(el);
          return { size: c.fontSize, weight: c.fontWeight, color: c.color };
        });
      expect(await style(extra)).toEqual(await style(unit));
      await noSideways();
    });
  }
});

test.describe('v62.3 fix round 1 (item 3) - a ride whose only reading is its level is not "no numbers"', () => {
  test('All rides shows "— · — · — · L4" for a level-only ride', async ({ page }) => {
    await seedLogs(page, [
      ride('r-level-only', '2026-09-28T10:00:00+03:00', 'D', { ellipticalLevel: 4 }),
    ]);
    await mockDate(page, '2026-09-30T08:00:00+03:00');
    await openRidesPage(page);
    const row = page.locator('.rides-list-row').filter({ hasText: 'Sep 28' });
    await expect(row.locator('.rides-list-right')).toHaveText('— · — · — · L4');
    await expect(row.locator('.rides-list-nonum')).toHaveCount(0);
  });
});

test.describe('v62.3 fix round 1 (item 6) - a bare 1-2 digit ride time means minutes', () => {
  const histRide = (): Row =>
    log('b-week4', '2026-09-20T15:00:00.000Z', 'B', {
      cardioLane: 'elliptical',
      cardioMinutes: 10,
    });

  const openEdit = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-week4"]').click();
    await page.locator('#edit-history-session').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Edit session');
  };

  const savedHistTime = async (page: Page, typed: string): Promise<unknown> => {
    await page.locator('#hist-time').fill(typed);
    await page.locator('#save-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    return page.evaluate(() => {
      const rows = JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]') as {
        id: string;
        ellipticalTimeSec?: number | null;
      }[];
      return rows.find((r) => r.id === 'b-week4')?.ellipticalTimeSec;
    });
  };

  for (const [typed, sec, readback] of [
    ['10', 600, '= 10:00'],
    ['25', 1500, '= 25:00'],
    ['1002', 602, '= 10:02'],
    ['10:02', 602, '= 10:02'],
    ['10.5', 630, '= 10:30'],
    ['10,5', 630, '= 10:30'],
  ] as const) {
    test(`history edit: "${typed}" saves ${sec} s and reads back "${readback}"`, async ({
      page,
    }) => {
      await seedLogs(page, [histRide()]);
      await openEdit(page);
      await page.locator('#hist-time').fill(typed);
      await expect(page.locator('#hist-time-readback')).toHaveText(readback);
      expect(await savedHistTime(page, typed)).toBe(sec);
    });
  }

  test('history edit: G1 the hint line shows for 0:10 + 0.58 km + 60.1 kcal and goes when they fit', async ({
    page,
  }) => {
    await seedLogs(page, [histRide()]);
    await openEdit(page);
    await page.locator('#hist-km').fill('0.58');
    await page.locator('#hist-kcal').fill('60.1');
    await page.locator('#hist-time').fill('0:10');
    await expect(page.locator('#hist-fit-hint')).toHaveText(
      "These don't fit together: 0.58 km in 0:10. Check the time?"
    );
    await page.locator('#hist-time').fill('10');
    await expect(page.locator('#hist-fit-hint')).toHaveCount(0);
    await page.locator('#hist-time').fill('0:10');
    await page.locator('#hist-km').fill('');
    await expect(page.locator('#hist-fit-hint')).toHaveText(
      "These don't fit together: 60.1 kcal in 0:10. Check the time?"
    );
    // never blocks: Save still works with the hint showing
    await page.locator('#save-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
  });

  test('ride-numbers screen: G1 the hint line shows for 0:10 + 0.58 km + 60.1 kcal, goes for "10", Next still works', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('0.58');
    await page.locator('#ell-kcal').fill('60.1');
    await expect(page.locator('#ell-fit-hint')).toHaveCount(0);
    await page.locator('#ell-time').fill('0:10');
    await expect(page.locator('#ell-fit-hint')).toHaveText(
      "These don't fit together: 0.58 km in 0:10. Check the time?"
    );
    await page.locator('#ell-time').fill('10');
    await expect(page.locator('#ell-fit-hint')).toHaveCount(0);
    await page.locator('#ell-time').fill('0:10');
    await page.locator('#ell-km').fill('');
    await expect(page.locator('#ell-fit-hint')).toHaveText(
      "These don't fit together: 60.1 kcal in 0:10. Check the time?"
    );
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
  });

  test('history edit: an unreadable time says "not a time" (v62.4 S3; was: no readback)', async ({
    page,
  }) => {
    await seedLogs(page, [histRide()]);
    await openEdit(page);
    await page.locator('#hist-time').fill('abc');
    await expect(page.locator('#hist-time-readback')).toHaveText('not a time');
  });

  for (const typed of ['abc', '0']) {
    test(`history edit: S3 "${typed}" says "not a time", saves no time, and goes when fixed`, async ({
      page,
    }) => {
      await seedLogs(page, [histRide()]);
      await openEdit(page);
      await page.locator('#hist-time').fill(typed);
      await expect(page.locator('#hist-time-readback')).toHaveText('not a time');
      await page.locator('#hist-time').fill('10');
      await expect(page.locator('#hist-time-readback')).toHaveText('= 10:00');
      await page.locator('#hist-time').fill('');
      await expect(page.locator('#hist-time-readback')).toBeHidden();
      expect(await savedHistTime(page, typed)).toBeNull();
    });

    test(`ride-numbers screen: S3 "${typed}" says "not a time" and saves no time`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.locator('button[data-workout="D"]').click();
      await page.locator('#begin').click();
      await page.locator('#next').click();
      await page.locator('#ell-time').fill(typed);
      await expect(page.locator('#ell-time-readback')).toHaveText('not a time');
      await page.locator('#ell-time').fill('');
      await expect(page.locator('#ell-time-readback')).toBeHidden();
      await page.locator('#ell-time').fill(typed);
      await page.locator('#next').click();
      await expect(page.locator('text=Quick log')).toBeVisible();
      await page.locator('#save-log').click();
      await expect(page.locator('.home-header h1')).toBeVisible();
      const saved = await page.evaluate(
        () => (JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]') as Row[])[0]
      );
      expect(saved!['ellipticalTimeSec'] ?? null).toBeNull();
    });
  }

  for (const [typed, sec, readback] of [
    ['10', 600, '= 10:00'],
    ['1002', 602, '= 10:02'],
    ['10:02', 602, '= 10:02'],
    ['10.5', 630, '= 10:30'],
    ['10,5', 630, '= 10:30'],
  ] as const) {
    test(`ride-numbers screen: "${typed}" reads back "${readback}" and saves ${sec} s`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.locator('button[data-workout="D"]').click();
      await page.locator('#begin').click();
      await page.locator('#next').click(); // opens the ride-numbers screen
      await page.locator('#ell-time').fill(typed);
      await expect(page.locator('#ell-time-readback')).toHaveText(readback);
      await page.locator('#next').click();
      await expect(page.locator('text=Quick log')).toBeVisible();
      await page.locator('#save-log').click();
      await expect(page.locator('.home-header h1')).toBeVisible();
      const saved = await page.evaluate(
        () => (JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]') as Row[])[0]
      );
      expect(saved!['ellipticalTimeSec']).toBe(sec);
    });
  }
});

// Fix round 1 item 5 - the wall sit's hold timer after a reload. She held 20 s, the app reloaded,
// she logged what she did: the saved hold is what the timer would have shown with no reload.
test.describe('v62.3 fix round 1 (item 5) - the wall sit hold after a reload saves what she held', () => {
  const START_ISO = '2026-09-08T10:00:00.000Z';

  const startWallSit = async (page: Page): Promise<void> => {
    await movableClock(page, START_ISO, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await advanceToExercise(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip-time')).toBeVisible();
  };

  const logWhatIDid = async (page: Page): Promise<Row> => {
    await page.locator('#quit').click();
    await page.locator('#quit-log').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = (await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]')
    )) as Row[];
    return logs[0]!;
  };

  test('no reload: 20 s held, "Log what I did" saves 20 (unchanged)', async ({ page }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    expect((await logWhatIDid(page))['wallSitSec']).toBe(20);
  });

  test('20 s held, reload, "Log what I did": saves 20, not 0', async ({ page, context }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:00:20.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Wall sit');
    expect((await logWhatIDid(reopened))['wallSitSec']).toBe(20);
  });

  test('paused time is not counted: 20 s held, 60 s paused, reload, resume, log -> 20', async ({
    page,
    context,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    await page.locator('#pause-toggle').click();
    await advanceClock(page, 60_000);
    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:01:20.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    await reopened.locator('#pause-resume').click();
    expect((await logWhatIDid(reopened))['wallSitSec']).toBe(20);
  });

  test('a hold that ran past its end before the reload saves the whole hold, not more', async ({
    page,
    context,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 5 * 60_000);
    const reopened = await context.newPage();
    await movableClock(reopened, '2026-09-08T10:05:00.000Z', { skipPreCountdown: true });
    await reopened.goto('/');
    const saved = (await logWhatIDid(reopened))['wallSitSec'] as number;
    expect(saved).toBeGreaterThan(0);
    expect(saved).toBeLessThan(120); // the prescribed hold, capped - never the 300 s of wall clock
  });
});

// v62.4 S1 - the wall sit started AGAIN after a reload continues from the seconds already held
// (the same as pause -> resume with no reload), instead of overwriting the first hold.
test.describe('v62.4 S1 - a wall sit restarted after a reload continues from what she held', () => {
  const START_ISO = '2026-09-08T10:00:00.000Z';

  const startWallSit = async (page: Page): Promise<void> => {
    await movableClock(page, START_ISO, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await advanceToExercise(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip-time')).toBeVisible();
  };

  const reopen = async (page: Page, iso: string): Promise<Page> => {
    const reopened = await page.context().newPage();
    await movableClock(reopened, iso, { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Wall sit');
    return reopened;
  };

  const stopHold = async (page: Page): Promise<void> => {
    await page.locator('#timer-pip').click();
    await page.locator('#stop-timed').click();
  };

  const logWhatIDid = async (page: Page): Promise<Row> => {
    await page.locator('#quit').click();
    await page.locator('#quit-log').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = (await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]')
    )) as Row[];
    return logs[0]!;
  };

  test('20 s held, reload: the step says "20 s held", not "Ready"', async ({ page }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const reopened = await reopen(page, '2026-09-08T10:00:20.000Z');
    await expect(reopened.locator('.timer-card .timer-label')).toHaveText('20 s held');
  });

  test('a wall sit never held says "Ready" (unchanged)', async ({ page }) => {
    await movableClock(page, START_ISO, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await advanceToExercise(page, 'Wall sit');
    await expect(page.locator('.timer-card .timer-label')).toHaveText('Ready');
  });

  test('hold 20 s, reload, start, hold 10 s, stop: saves 30, not 10', async ({ page }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const reopened = await reopen(page, '2026-09-08T10:00:20.000Z');
    await reopened.locator('#start-timed').click();
    await expect(reopened.locator('.timer-pip-time')).toBeVisible();
    await advanceClock(reopened, 10_000);
    await stopHold(reopened);
    expect((await logWhatIDid(reopened))['wallSitSec']).toBe(30);
  });

  test('a second reload mid-way still counts the whole hold (20 + 10, reload, log -> 30)', async ({
    page,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const second = await reopen(page, '2026-09-08T10:00:20.000Z');
    await second.locator('#start-timed').click();
    await expect(second.locator('.timer-pip-time')).toBeVisible();
    await advanceClock(second, 10_000);
    const third = await reopen(second, '2026-09-08T10:00:30.000Z');
    expect((await logWhatIDid(third))['wallSitSec']).toBe(30);
  });

  test('the carried hold is capped at the hold: running it out saves the whole hold, never more', async ({
    page,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const reopened = await reopen(page, '2026-09-08T10:00:20.000Z');
    await reopened.locator('#start-timed').click();
    await expect(reopened.locator('.timer-pip-time')).toBeVisible();
    await advanceClock(reopened, 5 * 60_000);
    await expect(reopened.locator('.timer-held')).toBeVisible();
    const saved = (await logWhatIDid(reopened))['wallSitSec'] as number;
    expect(saved).toBeGreaterThan(30);
    expect(saved).toBeLessThan(120);
  });
});

// v62.5 S1 - the label and the save agree: the seconds carried over a reload are what the timer
// showed when the page came back ("20 s held"). Idle time after the reload never counts.
test.describe('v62.5 S1 - a wall sit after a reload freezes at the label', () => {
  const START_ISO = '2026-09-08T10:00:00.000Z';
  const at = (sec: number): string => new Date(Date.parse(START_ISO) + sec * 1000).toISOString();

  const startWallSit = async (page: Page): Promise<void> => {
    await movableClock(page, START_ISO, { skipPreCountdown: true });
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await advanceToExercise(page, 'Wall sit');
    await page.locator('#start-timed').click();
    await expect(page.locator('.timer-pip-time')).toBeVisible();
  };

  const reopen = async (page: Page, sec: number): Promise<Page> => {
    const reopened = await page.context().newPage();
    await movableClock(reopened, at(sec), { skipPreCountdown: true });
    await reopened.goto('/');
    await expect(reopened.locator('.exercise-name')).toHaveText('Wall sit');
    return reopened;
  };

  const logWhatIDid = async (page: Page): Promise<Row> => {
    await page.locator('#quit').click();
    await page.locator('#quit-log').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const logs = (await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('workout-tracker:logs') ?? '[]')
    )) as Row[];
    return logs[0]!;
  };

  for (const wait of [0, 5, 15, 120]) {
    test(`held 20, reload, wait ${wait} s, hold 10: label 20, done face 30, saves 30`, async ({
      page,
    }) => {
      await startWallSit(page);
      await advanceClock(page, 20_000);
      const reopened = await reopen(page, 20);
      await expect(reopened.locator('.timer-card .timer-label')).toHaveText('20 s held');
      await advanceClock(reopened, wait * 1000);
      await expect(reopened.locator('.timer-card .timer-label')).toHaveText('20 s held');
      await reopened.locator('#start-timed').click();
      await expect(reopened.locator('.timer-pip-time')).toBeVisible();
      await advanceClock(reopened, 10_000);
      await reopened.locator('#timer-pip').click();
      await reopened.locator('#stop-timed').click();
      await expect(reopened.locator('.timer-held')).toContainText('held 30 s');
      expect((await logWhatIDid(reopened))['wallSitSec']).toBe(30);
    });
  }

  test('label = what is saved: held 20, reload, 120 s idle, "Log what I did" saves 20', async ({
    page,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const reopened = await reopen(page, 20);
    await expect(reopened.locator('.timer-card .timer-label')).toHaveText('20 s held');
    await advanceClock(reopened, 120_000);
    expect((await logWhatIDid(reopened))['wallSitSec']).toBe(20);
  });

  test('two reloads count the hold once: 20 held, reload, 100 s, reload again -> still 20, hold 10 -> 30', async ({
    page,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const second = await reopen(page, 20);
    await expect(second.locator('.timer-card .timer-label')).toHaveText('20 s held');
    const third = await reopen(second, 120);
    await expect(third.locator('.timer-card .timer-label')).toHaveText('20 s held');
    await third.locator('#start-timed').click();
    await expect(third.locator('.timer-pip-time')).toBeVisible();
    await advanceClock(third, 10_000);
    await third.locator('#timer-pip').click();
    await third.locator('#stop-timed').click();
    expect((await logWhatIDid(third))['wallSitSec']).toBe(30);
  });

  test('a reload in the middle of the carried hold freezes it at that moment (20 + 10, reload, wait, log -> 30)', async ({
    page,
  }) => {
    await startWallSit(page);
    await advanceClock(page, 20_000);
    const second = await reopen(page, 20);
    await second.locator('#start-timed').click();
    await expect(second.locator('.timer-pip-time')).toBeVisible();
    await advanceClock(second, 10_000);
    const third = await reopen(second, 30);
    await expect(third.locator('.timer-card .timer-label')).toHaveText('30 s held');
    await advanceClock(third, 90_000);
    expect((await logWhatIDid(third))['wallSitSec']).toBe(30);
  });
});
