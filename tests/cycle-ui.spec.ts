// tests/cycle-ui.spec.ts — "Your cycle" page (v51, Sep 25 2026) + the
// "Period started today" tap. The phase math itself (n<3 rule, pre-v48-5
// exclusion, estimate math, the plain-words remap, cycleSummaryLine,
// isComparable) is exercised without a browser in tests/cycle.test.ts — this
// file covers only what needs a real DOM: Progress keeps one door row, the
// page it opens (SPEC-cycle-page.md), the tap writes a local row + the right
// payload under automation (sync is off — see app.ts syncDisabled()), the
// quiet/primary window on the button and the Home door, "Started on a
// different day?" folds/unfolds the date input, undo removes it, and the
// page never causes sideways scroll at phone width.

import { test, expect, type Page } from '@playwright/test';

type Row = Record<string, unknown>;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

async function mockDate(page: Page, iso: string): Promise<void> {
  await page.addInitScript((isoArg: string) => {
    const fixed = new Date(isoArg).getTime();
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(fixed);
        } else {
          super(...args);
        }
      }
      static override now(): number {
        return fixed;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Date = MockDate;
  }, iso);
}

// Her real logged period starts — the exact seed the v50 migration wrote.
// Aug5 -> Sep1 = 27 days; median of the last 6 gaps = 27.5 -> estimated next
// start (mocked "today" 2026-09-25) is 2026-09-29 — same fixture as
// tests/cycle.test.ts's HER_PERIODS, so the day-math facts pinned there
// (menstrual 1-5, follicular 6-12, ovulatory 13-15/Aug17-19, luteal 16-27,
// week-before = Aug25-31) carry straight over.
const HER_PERIODS = [
  { startDate: '2026-02-21', source: 'reproductive.md', synced: true },
  { startDate: '2026-03-20', source: 'reproductive.md', synced: true },
  { startDate: '2026-04-15', source: 'reproductive.md', synced: true },
  { startDate: '2026-05-13', source: 'reproductive.md', synced: true },
  { startDate: '2026-06-10', source: 'reproductive.md', synced: true },
  { startDate: '2026-07-09', source: 'reproductive.md', synced: true },
  { startDate: '2026-08-05', source: 'reproductive.md', synced: true },
  { startDate: '2026-09-01', source: 'reproductive.md', synced: true },
];

async function seedCyclePeriods(page: Page, periods: unknown[]): Promise<void> {
  await page.addInitScript((p: unknown[]) => {
    window.localStorage.setItem('workout-tracker:cycle-periods', JSON.stringify(p));
  }, periods);
}

async function seedLogs(page: Page, rows: Row[]): Promise<void> {
  await page.addInitScript((r: Row[]) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(r));
  }, rows);
}

function log(
  id: string,
  date: string,
  before: number,
  after: number,
  // v50 · mood: optional so every existing call site (capacity-only) is untouched.
  mood?: { before: number; after: number },
  // v51 · back & wrist before -> after: same optional shape as mood above.
  backWrist?: { backBefore: number; backAfter: number; wristBefore: number; wristAfter: number }
): Row {
  return {
    id,
    date,
    workout: 'A',
    capacityBefore: before,
    capacityAfter: after,
    moodBefore: mood?.before ?? null,
    moodAfter: mood?.after ?? null,
    wallSitSec: 0,
    backPain: backWrist?.backAfter ?? 0,
    backPainBefore: backWrist?.backBefore ?? null,
    wristPain: backWrist?.wristAfter ?? null,
    wristPainBefore: backWrist?.wristBefore ?? null,
    word: '',
    durationSec: 1800,
  };
}

async function openProgress(page: Page): Promise<void> {
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.screen-header h2')).toHaveText('Progress');
}

// v51 · the page opens from Progress's own door row.
async function openCycle(page: Page): Promise<void> {
  await openProgress(page);
  await page.locator('#open-cycle').click();
  await expect(page.locator('.screen-header h2')).toHaveText('Your cycle');
}

test.describe('Progress: one door row, nothing else (spec §1)', () => {
  test("the row names the page and today's phase, in plain words", async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const row = page.locator('#open-cycle');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Your cycle');
    await expect(row).toContainText('Week before your period · day 25');

    // v51 · fix (Sep 25 2026, checker MUST 1): a malformed CSS comment ("*/"
    // mid-text) used to drop `.progress-card:has(.cycle-door) { padding: 0 }`
    // entirely, double-padding and misaligning the door card. Pin the
    // computed value so a regression here fails loud, not just visually.
    const doorCard = page.locator('.progress-card:has(#open-cycle)');
    await expect(doorCard).toHaveCSS('padding-top', '0px');

    // Nothing else cycle-related stays on Progress.
    await expect(page.locator('.cc2-card')).toHaveCount(0);
    await expect(page.locator('#cc-log-today')).toHaveCount(0);
    await expect(page.locator('.progress-card', { hasText: 'Compare' })).toHaveCount(0);
  });
});

test.describe('open and back (spec §2.2)', () => {
  test('opens to "Your cycle", and back returns to Progress at the same scroll spot', async ({
    page,
  }) => {
    // v51 · fix (Sep 25 2026, checker SHOULD 5): the original test never left
    // scrollY 0, so "#open-cycle is in the viewport" after back proved
    // nothing about restore — it would have passed even if restore did
    // nothing at all. Phone width + a real pre-tap offset makes the
    // assertion mean something.
    await page.setViewportSize({ width: 412, height: 892 });
    await seedCyclePeriods(page, HER_PERIODS);
    // Progress renders its short (count < 2) empty state below 2 sessions —
    // too short to scroll at all at phone height. A few real sessions push
    // it into the full layout (Start Now, cycle door, trend cards, program
    // archive) so there is an actual offset to leave and come back to.
    await seedLogs(page, [
      log('sl1', '2026-08-25T10:00:00.000Z', 7, 7),
      log('sl2', '2026-08-26T10:00:00.000Z', 7, 7),
      log('sl3', '2026-08-27T10:00:00.000Z', 7, 7),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    // window.scrollTo, not a simulated mouse wheel: this only needs a real,
    // reproducible offset to leave and come back to — not to prove wheel
    // input itself scrolls the page.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(50);

    // dispatchEvent, not .click(): a real .click() auto-scrolls the target
    // into view first, which would silently overwrite the very scrollY the
    // app is about to capture and defeat the point of scrolling first.
    await page.locator('#open-cycle').dispatchEvent('click');
    await expect(page.locator('.screen-header h2')).toHaveText('Your cycle');
    await expect(page.locator('#back-from-cycle')).toHaveText('‹ Progress');

    await page.locator('#back-from-cycle').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Progress');
    await expect(page.locator('#open-cycle')).toBeInViewport();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(5);
  });
});

test.describe('the predicted window (spec §3, §2.3)', () => {
  test('inside the window: Progress sub, the sage button, and the Home door', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-27T10:00:00.000Z'); // 2 days before the ~Sep29 estimate
    await page.goto('/');
    await openProgress(page);
    await expect(page.locator('#open-cycle')).toContainText(
      'Period expected around Sep 29 · started?'
    );

    await page.locator('#open-cycle').click();
    await expect(page.locator('#cc-log-today')).toHaveClass(/cc-log-btn-primary/);
    await page.locator('#back-from-cycle').click();

    await page.locator('#back-home').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const homeRow = page.locator('#home-open-cycle');
    await expect(homeRow).toBeVisible();

    await homeRow.click();
    await expect(page.locator('.screen-header h2')).toHaveText('Your cycle');
    await expect(page.locator('#back-from-cycle')).toHaveText('‹ Home');
    await page.locator('#back-from-cycle').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
  });

  test('overdue: the Progress sub reads "due any day"', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-10-01T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);
    await expect(page.locator('#open-cycle')).toContainText('Period due any day · started?');
  });

  test('outside the window: no Home door, and the page button is quiet', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-15T10:00:00.000Z'); // well clear of the ~Sep29 estimate
    await page.goto('/');
    await expect(page.locator('#home-open-cycle')).toHaveCount(0);
    await openCycle(page);
    await expect(page.locator('#cc-log-today')).not.toHaveClass(/cc-log-btn-primary/);
  });
});

test.describe('empty states (spec §2.5)', () => {
  test('no periods logged: Card A says so, and there is no compare table', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    await expect(page.locator('.cc2-header')).toHaveText('No period logged yet');
    await expect(page.locator('#cycle-compare')).toHaveCount(0);
  });

  test('one period logged: "Not placed yet"', async ({ page }) => {
    await seedCyclePeriods(page, [{ startDate: '2026-09-01', source: 'app', synced: true }]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    await expect(page.locator('.cc2-header')).toHaveText('Not placed yet');
  });
});

test.describe('a small phase (spec §4.3)', () => {
  test('a phase under 3 workouts shows — and the real count, and the footnote appears once', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 3, 5),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);

    const onPeriodRow = page.locator('#cycle-compare tr', { hasText: 'On your period' });
    await expect(onPeriodRow).toContainText('—');
    await expect(onPeriodRow.locator('td').nth(3)).toHaveText('2');

    await expect(page.locator('.cc-quiet', { hasText: 'fewer than 3 workouts' })).toHaveCount(1);

    const text = await page.locator('#app').innerText();
    expect(text).not.toContain('not enough yet');
  });
});

test.describe('Card B: the current phase (spec §2.3)', () => {
  test('0 workouts in the current phase: one line, no Mood line', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);

    const cardB = page.locator('.card', { hasText: 'This phase · before → after' });
    await expect(cardB).toContainText('No workouts in this phase yet.');
    await expect(cardB).not.toContainText('Mood:');
  });
});

test.describe('mood (spec §2.3, §2.4)', () => {
  test('0 mood readings: the quiet line shows once, no chip row', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('w1', '2026-08-25T10:00:00.000Z', 4, 6),
      log('w2', '2026-08-26T10:00:00.000Z', 4, 6),
      log('w3', '2026-08-27T10:00:00.000Z', 4, 6),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);

    await expect(page.locator('.cc-quiet', { hasText: 'Mood: started' })).toHaveCount(1);
    await expect(page.locator('#cycle-metric-chips')).toHaveCount(0);
  });

  test('mood ready in 2 phases: the chips appear, and Mood swaps the table + drops the summary', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    // v51 · fix (Sep 25 2026, checker SHOULD 4): the original fixture only
    // logged 2 of the 4 phases, so Card C's Body summary sentence was ALREADY
    // absent before the Mood click (missing-average bail, not the metric
    // gate) — "drops the summary" passed even if the metric switch never
    // hid anything. Body is now seeded in all 4 phases (same tight fixture
    // as the "about the same" test above, so the T1 line is present first),
    // with mood pairs layered onto 2 of them.
    await seedLogs(page, [
      log('op1', '2026-08-05T10:00:00.000Z', 9, 9, { before: 3, after: 8 }),
      log('op2', '2026-08-06T10:00:00.000Z', 9, 9, { before: 4, after: 9 }),
      log('op3', '2026-08-07T10:00:00.000Z', 9, 9, { before: 2, after: 7 }),
      log('wa1', '2026-08-10T10:00:00.000Z', 9, 9, { before: 5, after: 8 }),
      log('wa2', '2026-08-11T10:00:00.000Z', 9, 9, { before: 5, after: 8 }),
      log('wa3', '2026-08-12T10:00:00.000Z', 9.75, 10.5, { before: 5, after: 8 }),
      log('mc1', '2026-08-17T10:00:00.000Z', 8, 9),
      log('mc2', '2026-08-18T10:00:00.000Z', 9, 9),
      log('mc3', '2026-08-19T10:00:00.000Z', 8.92, 10.29),
      log('wb1', '2026-08-25T10:00:00.000Z', 9, 9),
      log('wb2', '2026-08-26T10:00:00.000Z', 9, 9),
      log('wb3', '2026-08-27T10:00:00.000Z', 9, 8.67),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);

    // Before the click: Body is selected, all 4 phases are tight -> the T1
    // summary sentence is showing (the thing the click has to make go away).
    await expect(page.locator('.cc-question')).toHaveCount(1);

    const chips = page.locator('#cycle-metric-chips');
    await expect(chips).toBeVisible();
    await chips.locator('[data-cycle-metric="mood"]').click();

    const onPeriodRow = page.locator('#cycle-compare tr', { hasText: 'On your period' });
    // avg mood before = (3+4+2)/3 = 3.0, after = (8+9+7)/3 = 8.0.
    await expect(onPeriodRow).toContainText('3.0');
    await expect(onPeriodRow).toContainText('8.0');
    await expect(page.locator('.cc-question')).toHaveCount(0);
  });
});

test.describe('back & wrist in Card B (spec §2.3)', () => {
  test('2 readings: no Back pain row', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('bw1', '2026-08-25T10:00:00.000Z', 4, 6, undefined, {
        backBefore: 2,
        backAfter: 0,
        wristBefore: 1,
        wristAfter: 0,
      }),
      log('bw2', '2026-08-26T10:00:00.000Z', 4, 6, undefined, {
        backBefore: 3,
        backAfter: 1,
        wristBefore: 2,
        wristAfter: 1,
      }),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    const cardB = page.locator('.card', { hasText: 'This phase · before → after' });
    await expect(cardB).not.toContainText('Back pain');
  });

  test('3+ readings: the Back pain row appears with the real average', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('bw1', '2026-08-25T10:00:00.000Z', 4, 6, undefined, {
        backBefore: 2,
        backAfter: 0,
        wristBefore: 1,
        wristAfter: 0,
      }),
      log('bw2', '2026-08-26T10:00:00.000Z', 4, 6, undefined, {
        backBefore: 4,
        backAfter: 1,
        wristBefore: 3,
        wristAfter: 1,
      }),
      log('bw3', '2026-08-27T10:00:00.000Z', 4, 6, undefined, {
        backBefore: 3,
        backAfter: 2,
        wristBefore: 2,
        wristAfter: 2,
      }),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    const cardB = page.locator('.card', { hasText: 'This phase · before → after' });
    await expect(cardB).toContainText('Back pain');
    // avg back before = (2+4+3)/3 = 3.0, after = (0+1+2)/3 = 1.0.
    await expect(cardB).toContainText('3.0 → 1.0');
  });
});

test.describe('the summary sentence under Card C (spec §2.3)', () => {
  test('all 4 phases ready and tight: the "about the same" line', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    // Same fixture as tests/cycle.test.ts's cycleSummaryLine T1 case: before
    // 9.0/9.25/8.64/9.0, after 9.0/9.5/9.43/8.89 -> lo 8.6, hi 9.5.
    await seedLogs(page, [
      log('op1', '2026-08-05T10:00:00.000Z', 9, 9),
      log('op2', '2026-08-06T10:00:00.000Z', 9, 9),
      log('op3', '2026-08-07T10:00:00.000Z', 9, 9),
      log('wa1', '2026-08-10T10:00:00.000Z', 9, 9),
      log('wa2', '2026-08-11T10:00:00.000Z', 9, 9),
      log('wa3', '2026-08-12T10:00:00.000Z', 9.75, 10.5),
      log('mc1', '2026-08-17T10:00:00.000Z', 8, 9),
      log('mc2', '2026-08-18T10:00:00.000Z', 9, 9),
      log('mc3', '2026-08-19T10:00:00.000Z', 8.92, 10.29),
      log('wb1', '2026-08-25T10:00:00.000Z', 9, 9),
      log('wb2', '2026-08-26T10:00:00.000Z', 9, 9),
      log('wb3', '2026-08-27T10:00:00.000Z', 9, 8.67),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    await expect(page.locator('.cc-question')).toHaveText(
      'So far, body numbers look about the same in every phase — all between 8.6 and 9.5.'
    );
  });

  test('the pre-period question line, when it applies', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('pre1', '2026-08-25T10:00:00.000Z', 4, 6),
      log('pre2', '2026-08-27T10:00:00.000Z', 4, 6),
      log('pre3', '2026-08-29T10:00:00.000Z', 4, 6),
      log('rest1', '2026-07-10T10:00:00.000Z', 6, 8),
      log('rest2', '2026-07-12T10:00:00.000Z', 6, 8),
      log('rest3', '2026-07-14T10:00:00.000Z', 6, 8),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    await expect(page.locator('.cc-question')).toContainText('Does that match how it feels?');
  });
});

test.describe('logging from the page (spec §2.6)', () => {
  test('logs today, confirms with Undo, and the date-picker path', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);

    await page.locator('#cc-log-today').click();
    await expect(page.locator('.cc-log-undo')).toContainText('Logged · Sep 25 ✓');
    await expect(page.locator('#cc-undo')).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string }[];
    expect(rows.some((r) => r.startDate === '2026-09-25')).toBe(true);
    await expect(page.locator('.cc2-header')).toHaveText('On your period');

    await page.locator('#cc-undo').click();
    const raw2 = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows2 = JSON.parse(raw2 ?? '[]') as { startDate: string }[];
    expect(rows2.some((r) => r.startDate === '2026-09-25')).toBe(false);
    await expect(page.locator('.cc2-header')).toHaveText('Week before your period');

    await page.locator('.cc-date-reveal summary').click();
    await expect(page.locator('.cc-date-reveal summary')).toHaveText('Started on a different day?');
    await page.locator('#cc-log-date').fill('2026-09-24');
    await page.locator('#cc-log-date').dispatchEvent('change');
    const raw3 = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows3 = JSON.parse(raw3 ?? '[]') as { startDate: string }[];
    expect(rows3.some((r) => r.startDate === '2026-09-24')).toBe(true);
  });
});

test.describe('no jargon (spec §4)', () => {
  test('no technical phase words, no "n=", no Δ, no "est." anywhere on the page', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 3, 5),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);
    const text = await page.locator('#app').innerText();
    expect(text).not.toMatch(/luteal|follicular|ovulatory|menstrual|\bn=|Δ|\best\./i);
  });
});

test.describe('at phone size (412x892)', () => {
  test.use({ viewport: { width: 412, height: 892 } });

  test('the cycle page causes no sideways scroll, and the table fits the viewport', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 3, 5),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8),
      log('f1', '2026-08-10T10:00:00.000Z', 6, 7),
      log('f2', '2026-08-12T10:00:00.000Z', 6, 7),
      log('f3', '2026-08-14T10:00:00.000Z', 6, 7),
      log('l1', '2026-08-27T10:00:00.000Z', 4, 6),
      log('l2', '2026-08-28T10:00:00.000Z', 4, 6),
      log('l3', '2026-08-29T10:00:00.000Z', 4, 6),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openCycle(page);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);

    const box = await page.locator('#cycle-compare').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(412);
  });
});

test.describe('Settings (spec §3)', () => {
  test('the quiet row still logs, with the updated caption', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await page.locator('#open-settings').click();
    await expect(page.locator('.settings-section-label', { hasText: 'Cycle' })).toBeVisible();
    await expect(
      page.locator('.settings-row-caption', { hasText: "Logs today's date" })
    ).toContainText('More in Progress › Your cycle.');

    await page.locator('#settings-cycle-today').click();
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startDate).toBe('2026-09-25');
    await expect(page.locator('#settings-cycle-undo')).toBeVisible();
  });
});
