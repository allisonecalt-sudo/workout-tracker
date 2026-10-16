// tests/screens/number-fixes.spec.ts - v62.3 "make every number true" (Oct 16 2026).
//
// One describe per fix (F1..F9): a number that two screens (or a label and its
// bar) used to disagree about is checked on the real screens, with her real
// shapes seeded (Week 4 legacy A/B/C, Week 5 moved on with a D ride, the Sep 24
// first ride, ...). The matching pure-logic tests live in
// tests/number-fixes.test.ts.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate } from '../helpers';

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
    await expect(since('Elliptical level')).toHaveText('since Sep 24');
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
      .filter({ has: page.locator('.start-now-lbl:text-is("Elliptical level")') });
    await expect(row.locator('.sn-first')).toHaveText('level 5 for 10 min');
    await expect(row.locator('.sn-last')).toHaveText('level 3 for 12 min');
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
