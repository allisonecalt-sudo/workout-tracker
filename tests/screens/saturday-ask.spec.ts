// tests/screens/saturday-ask.spec.ts — v75 (Nov 15 2026): the Saturday card on Home, at phone size 412×915.
//
// WHAT: on a Saturday after Round 3 Week 1 closed (A, B, C done) Home asks "Week 1: D left." with
// [Finish Week 1] [Move to Week 2]; Finish keeps the week, leaves a quiet link, and Up next is D;
// Move opens Week 2 at once ("Week 2 started · Undo") and Undo brings Week 1 back; Start before an
// answer shows the two buttons first. Logic half: tests/week.test.ts, tests/program-week.test.ts.

import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const SAT_NIGHT = '2026-11-21T18:00:00.000Z'; // Sat Nov 21 20:00 Jerusalem
const LOGS_KEY = 'workout-tracker:logs';
type Row = Record<string, unknown>;

const row = (id: string, date: string, workout: string): Row => ({
  id,
  date,
  workout,
  capacityBefore: null,
  capacityAfter: null,
  wallSitSec: 0,
  backPain: null,
  word: '',
  synced: true,
});

const WEEK1_CLOSED: Row[] = [
  row('r1a', '2026-11-16T16:00:00.000Z', 'A'),
  row('r1b', '2026-11-17T16:00:00.000Z', 'B'),
  row('r1c', '2026-11-18T16:00:00.000Z', 'C'),
];

async function seed(page: Page, iso: string, rows: Row[]): Promise<void> {
  // Sync is already off under automation (sync.ts syncDisabled: navigator.webdriver); this is a second
  // lock so a test can never reach her real Supabase rows.
  await page.route('**/*.supabase.co/**', (r) => r.abort());
  await mockDate(page, iso);
  await page.addInitScript(
    ([k, r]) => {
      // only on the FIRST load of the test: a reload must keep what she tapped
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.clear();
      window.localStorage.setItem(k as string, JSON.stringify(r));
    },
    [LOGS_KEY, rows] as const
  );
  await page.goto('/');
}

test.describe('v75 - the Saturday card', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('asks "Week 1: D left." with the two answers', async ({ page }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await expect(page.locator('#saturday-card .saturday-line')).toHaveText('Week 1: D left.');
    await expect(page.locator('#sat-finish')).toHaveText('Finish Week 1');
    await expect(page.locator('#sat-move')).toHaveText('Move to Week 2');
  });

  test('Sat Nov 21 with Week 1 done: title, week card and Up next all say Week 1 (D); after Move, Week 2', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await expect(page.locator('#week-title')).toHaveText('Week 1');
    await expect(page.locator('.week-card-range')).toHaveText('Week 1');
    await expect(page.locator('#week-count')).toHaveText('3 of 4 · D left');
    await expect(page.locator('#week-sub')).not.toContainText('Week 2');
    await expect(page.locator('.home-hero')).toContainText('Workout D');
    await page.locator('#sat-move').click();
    await expect(page.locator('#week-title')).toHaveText('Week 2');
    await expect(page.locator('.week-card-range')).toHaveText('Week 2');
  });

  test('Finish: the card becomes a quiet link, Up next is D, and a reload does not ask again', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('#sat-finish').click();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
    await expect(page.locator('#sat-move-link')).toHaveText('Move to Week 2');
    await expect(page.locator('.home-hero')).toContainText('Workout D');
    await page.reload();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
    await expect(page.locator('#sat-move-link')).toHaveCount(1);
  });

  test('Move to Week 2: Week 2 starts now, the note has Undo, and Undo brings Week 1 back', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('#sat-move').click();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
    await expect(page.locator('#week-title')).toContainText('Week 2');
    await expect(page.locator('#week-moved-note')).toContainText('Week 2 started');
    await page.locator('#week-undo').click();
    await expect(page.locator('#saturday-card .saturday-line')).toHaveText('Week 1: D left.');
  });

  test('Start before answering shows the two buttons first; the next Start goes through', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('.home-hero').click();
    await expect(page.locator('#saturday-ask')).toBeVisible();
    await expect(page.locator('#sat-finish')).toBeVisible();
    await page.locator('.home-hero').click();
    await expect(page.locator('#saturday-card')).toHaveCount(0);
  });

  test('Fri Nov 20: no card', async ({ page }) => {
    await seed(page, '2026-11-20T18:00:00.000Z', WEEK1_CLOSED);
    await expect(page.locator('#saturday-card')).toHaveCount(0);
  });

  // ---- v76 ----
  // Sat Nov 14 20:00 Jerusalem: Round 3 starts tomorrow; Week 8 closed on three letters (Mon Nov 9).
  const SAT_NOV14 = '2026-11-14T18:00:00.000Z';
  // (the app's own calendar numbers the closed week; Round 3 Week 1 is the pending week)
  const WEEK8_CLOSED: Row[] = [
    row('w8c', '2026-10-31T08:00:00.000Z', 'C'),
    row('w8a', '2026-11-04T16:00:00.000Z', 'A'),
    row('w8b', '2026-11-09T16:00:00.000Z', 'B'),
  ];

  // Her real rows through Week 8 (closed Mon Nov 9): Week 8 is the week Saturday Nov 14 counts for.
  const REAL_R2: Row[] = [
    ['w5a', '2026-09-28T15:00:00.000Z', 'A'],
    ['w5b', '2026-09-29T15:00:00.000Z', 'B'],
    ['w5c', '2026-09-30T15:00:00.000Z', 'C'],
    ['w6a', '2026-10-12T15:00:00.000Z', 'A'],
    ['w6b', '2026-10-13T15:00:00.000Z', 'B'],
    ['w6c', '2026-10-14T15:00:00.000Z', 'C'],
    ['w7a', '2026-10-18T07:00:00.000Z', 'A'],
    ['w7b', '2026-10-20T15:00:00.000Z', 'B'],
    ['w7c', '2026-10-26T16:00:00.000Z', 'C'],
    ['w8c', '2026-10-31T08:00:00.000Z', 'C'],
    ['w8a', '2026-11-04T16:00:00.000Z', 'A'],
    ['w8b', '2026-11-09T16:00:00.000Z', 'B'],
  ].map(([id, d, w]) => row(id!, d!, w!));

  test('v76: Sat Nov 14 (Round 3 starts tomorrow): title, week card head, sub-line and pre-log all name Week 8', async ({
    page,
  }) => {
    await seed(page, SAT_NOV14, REAL_R2);
    await expect(page.locator('#week-title')).toHaveText('Week 8');
    await expect(page.locator('.week-card-range')).toHaveText('Week 8');
    await expect(page.locator('#week-sub')).toHaveText('Saturday still counts for Week 8');
    await expect(page.locator('#week-count')).not.toContainText('0 of 4');
    await page.locator('.home-chip-d').click();
    await expect(page.locator('.prelog-meta')).toContainText(
      'Week 8 · counts for this week · Round 3 starts Sun Nov 15'
    );
    await expect(page.locator('.prelog-meta')).not.toContainText('Week 9');
  });

  test('v76: the same Saturday, an A (the week already has A, B, C): "an extra rep", Round 3 starts Sun Nov 15', async ({
    page,
  }) => {
    await seed(page, SAT_NOV14, REAL_R2);
    await page.locator('.home-hero').click();
    await expect(page.locator('.prelog-meta')).toContainText(
      'Week 8 · an extra rep, Round 3 starts Sun Nov 15'
    );
  });

  test('v76: a past "opens" date never shows: Week 2 pending since Sun Nov 22 reads since + day', async ({
    page,
  }) => {
    const W1 = [
      row('r1a', '2026-11-16T16:00:00.000Z', 'A'),
      row('r1b', '2026-11-17T16:00:00.000Z', 'B'),
      row('r1c', '2026-11-18T16:00:00.000Z', 'C'),
    ];
    await seed(page, '2026-11-25T10:00:00.000Z', [...REAL_R2, ...W1]);
    await expect(page.locator('#week-title')).toHaveText('Week 2');
    await expect(page.locator('#week-sub')).toHaveText('since Sun Nov 22 · day 4');
  });

  test('v76: Week 2 left empty after a three-letter close: from its ending Sunday the card asks, a tap moves on, Undo returns', async ({
    page,
  }) => {
    const W1 = [
      row('r1a', '2026-11-16T16:00:00.000Z', 'A'),
      row('r1b', '2026-11-17T16:00:00.000Z', 'B'),
      row('r1c', '2026-11-18T16:00:00.000Z', 'C'),
    ];
    await seed(page, '2026-11-29T09:00:00.000Z', [...REAL_R2, ...W1]);
    await expect(page.locator('#empty-week-card .saturday-line')).toHaveText(
      'Week 2 had no sessions. Move on to Week 3?'
    );
    await page.locator('#empty-move').click();
    await expect(page.locator('#week-title')).toHaveText('Week 3');
    await page.locator('#week-undo').click();
    await expect(page.locator('#week-title')).toHaveText('Week 2');
    await expect(page.locator('#empty-week-card')).toHaveCount(1);
  });

  test('v76: a week with only a D moves on at its Sunday (no card, not stuck on Week 1)', async ({
    page,
  }) => {
    await seed(page, '2026-11-24T09:00:00.000Z', [
      ...REAL_R2,
      row('d1', '2026-11-17T08:00:00.000Z', 'D'),
    ]);
    await expect(page.locator('#week-title')).toHaveText('Week 2');
    await expect(page.locator('#empty-week-card')).toHaveCount(0);
  });

  test('v76: Sunday Nov 15 is Round 3 Week 1 (the Saturday wording is gone)', async ({ page }) => {
    await seed(page, '2026-11-15T09:00:00.000Z', WEEK8_CLOSED);
    await expect(page.locator('#week-title')).toHaveText('Week 1');
    await expect(page.locator('#week-sub')).not.toContainText('Saturday still counts');
  });

  test('v76: pre-log of D that makes the week 4 of 4 says it counts for this week, not "an extra rep"', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, WEEK1_CLOSED);
    await page.locator('#sat-finish').click();
    await page.locator('.home-hero').click();
    const meta = page.locator('.prelog-meta');
    await expect(meta).toContainText('Week 1 · counts for this week · Week 2 opens Sun Nov 22');
    await expect(meta).not.toContainText('extra rep');
  });

  test('v76: when the week already has its D, the same pre-log is an extra rep', async ({
    page,
  }) => {
    await seed(page, SAT_NIGHT, [...WEEK1_CLOSED, row('r1d', '2026-11-19T16:00:00.000Z', 'D')]);
    await page.locator('#sat-finish').click();
    await page.locator('[data-workout="A"]').first().click();
    await expect(page.locator('.prelog-meta')).toContainText(
      'Week 1 · an extra rep, Week 2 opens Sun Nov 22'
    );
  });
});

// v76 (her "a", Sun Nov 15): an empty week asks. Round 3 Week 1 opens Sun Nov 15 with no sessions;
// from Sun Nov 22 Home asks "Move on to Week 2?" and nothing moves by itself.
test.describe('v76 - the empty-week card', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  const SUN = '2026-11-22T06:00:00.000Z'; // Sun Nov 22 08:00 Jerusalem
  const SAT = '2026-11-21T18:00:00.000Z';

  test('Sunday, nothing done: the card asks and the week does not auto-advance', async ({
    page,
  }) => {
    await seed(page, SUN, []);
    await expect(page.locator('#week-title')).toHaveText('Week 1');
    await expect(page.locator('#empty-week-card .saturday-line')).toHaveText(
      'Week 1 had no sessions. Move on to Week 2?'
    );
    await expect(page.locator('#empty-move')).toHaveText('Move on to Week 2');
  });

  test('Saturday before it: no card yet', async ({ page }) => {
    await seed(page, SAT, []);
    await expect(page.locator('#empty-week-card')).toHaveCount(0);
  });

  test('tap: a week_moves row is written, Week 2 starts, and Undo brings Week 1 back', async ({
    page,
  }) => {
    await seed(page, SUN, []);
    await page.locator('#empty-move').click();
    await expect(page.locator('#empty-week-card')).toHaveCount(0);
    await expect(page.locator('#week-title')).toHaveText('Week 2');
    await expect(page.locator('#week-moved-note')).toContainText('Week 2 started');
    const moves = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage).filter((k) => k.includes('week-moves'));
      return keys.map((k) => window.localStorage.getItem(k) ?? '');
    });
    expect(moves.join('')).toContain('"week":1');
    await page.locator('#week-undo').click();
    await expect(page.locator('#week-title')).toHaveText('Week 1');
    await expect(page.locator('#empty-week-card')).toHaveCount(1);
  });

  test('a session logged instead: no card, still Week 1', async ({ page }) => {
    await seed(page, SUN, [row('s1', '2026-11-22T05:00:00.000Z', 'A')]);
    await expect(page.locator('#empty-week-card')).toHaveCount(0);
    await expect(page.locator('#week-title')).toHaveText('Week 1');
  });
});
