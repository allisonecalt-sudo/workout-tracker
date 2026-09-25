// tests/cycle-ui.spec.ts — "Your cycle" Progress card (v51, Sep 25 2026) +
// the "Period started today" tap. The phase math itself (n<3 rule, pre-v48-5
// exclusion, estimate math, the plain-words remap) is exercised without a
// browser in tests/cycle.test.ts — this file covers only what needs a real
// DOM: the card renders in her plain vocabulary, the tap writes a local row
// + the right payload under automation (sync is off — see app.ts
// syncDisabled()), the quiet/primary window on the button, "Another day?"
// folds/unfolds the date input, undo removes it, and the card never causes
// sideways scroll at phone width.

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
  mood?: { before: number; after: number }
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
    backPain: 0,
    word: '',
    durationSec: 1800,
  };
}

async function openProgress(page: Page): Promise<void> {
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.screen-header h2')).toHaveText('Progress');
}

function cycleCard(page: Page) {
  return page.locator('.progress-card', { hasText: 'Your cycle' });
}

test.describe('"Your cycle" card — plain words', () => {
  test("the header names today's phase in plain words, with a day + next-one subline", async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    // 2026-08-06 = day 2 of the Aug5 period.
    await mockDate(page, '2026-08-06T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText('On your period');
    await expect(card).toContainText('day 2 of your period');
  });

  test('the week before her period reads "Week before your period" with a next-one estimate', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-25T10:00:00.000Z'); // open cycle, estimated next start Sep29
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    await expect(card).toContainText('Week before your period');
    await expect(card).toContainText('next one ~Sep 29');
  });

  test('a late period (predicted date passed, nothing new logged) reads "due any day"', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-10-15T10:00:00.000Z'); // well past the ~Sep29 estimate
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    await expect(card).toContainText('due any day');
  });

  test('the Compare list shows all 4 plain phase names, the current one tagged "now"', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-08-06T10:00:00.000Z'); // on her period
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    await expect(card).toContainText('On your period');
    await expect(card).toContainText('Week after period');
    await expect(card).toContainText('Mid-cycle');
    await expect(card).toContainText('Week before period');

    const rows = card.locator('.cc2-row');
    await expect(rows).toHaveCount(4);
    const nowRow = card.locator('.cc2-row-now');
    await expect(nowRow).toHaveCount(1);
    await expect(nowRow).toContainText('now');
    await expect(nowRow).toContainText('On your period');
  });

  test('a phase under 3 body readings shows "not enough yet", never a fake average', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 3, 5),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);
    await expect(cycleCard(page)).toContainText('not enough yet');
    // "not enough yet" is text, not a number — a quieter/smaller style than
    // a real average, never the giant display-size digits (would wrap to 2
    // lines and shout).
    await expect(cycleCard(page).locator('.cc2-now-val-empty')).toBeVisible();
  });

  test('3+ readings in a phase show a real "body X → Y" average and the workout count in words', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 2, 4),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8),
    ]);
    await mockDate(page, '2026-08-06T10:00:00.000Z'); // "now" = on her period
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    // avg before = (4+2+6)/3 = 4.0, avg after = (6+4+8)/3 = 6.0 — both the
    // current-phase big numbers and the Compare row read the same average.
    await expect(card.locator('.cc2-now-val').first()).toContainText('4.0 → 6.0');
    await expect(card).toContainText('body 4.0 → 6.0');
    await expect(card).toContainText('3 workouts');
  });

  // v51 · fix (Sep 25 2026, look-check): the big Body arrow needs to read as
  // one session's before/after pair, not a dropping trend (sev 4) — and the
  // current phase's own meta line must not repeat the phase name the header
  // right above it already said (sev 3, "shown 3x" — DECISIONS/look-check).
  test('the meta line under the big Body numbers says "before → after", not the phase name again', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 2, 4),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8),
    ]);
    await mockDate(page, '2026-08-06T10:00:00.000Z'); // "now" = on her period
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    const meta = card.locator('.cc2-now-meta');
    await expect(meta).toHaveText('3 workouts since Aug · before → after');
    // The header already named the phase ("On your period") — the meta line
    // must not say it a second time.
    await expect(meta).not.toContainText('on your period');
  });

  test('"How these are counted" defines the Body arrow as before a workout → after it', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-09-20T10:00:00.000Z', 5, 5), // post-cutoff so it's a trusted reading
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    const info = card.locator('.cc2-info');
    await info.locator('summary').click();
    // Was "capacity slider" — mismatched the card's own "Body" label
    // (look-check sev 4).
    await expect(info.locator('p')).toContainText('Body = your 1–10 before a workout → after it.');
    await expect(info.locator('p')).not.toContainText('capacity slider');
  });

  test('mood joins the current-phase numbers only once that phase clears 3 pairs; until then, one quiet card-level line', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6, { before: 3, after: 8 }),
      log('m2', '2026-08-06T10:00:00.000Z', 2, 4, { before: 4, after: 9 }),
    ]);
    await mockDate(page, '2026-08-06T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    // Only 2 mood pairs on her period — under 3, so no mood row yet, and the
    // one quiet whole-card line explains why.
    await expect(card).toContainText('Mood: tracking started');
    await expect(card).toContainText('it shows here after a few workouts in each phase');
  });

  test('mood shows once the current phase clears 3 pairs', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6, { before: 3, after: 8 }),
      log('m2', '2026-08-06T10:00:00.000Z', 2, 4, { before: 4, after: 9 }),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8, { before: 2, after: 7 }),
    ]);
    await mockDate(page, '2026-08-06T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    // avg mood before = (3+4+2)/3 = 3.0, avg mood after = (8+9+7)/3 = 8.0.
    const moodNow = card.locator('.cc2-now', { hasText: 'Mood' });
    await expect(moodNow).toContainText('3.0 → 8.0');
    await expect(card).not.toContainText('tracking started');
  });

  test('the question line reads in plain words, once the gap clears the gate', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    const rows: Row[] = [];
    for (const d of ['2026-08-25', '2026-08-27', '2026-08-29']) {
      rows.push(log(`pre-${d}`, `${d}T10:00:00.000Z`, 4, 6));
    }
    for (const d of ['2026-07-10', '2026-07-12', '2026-07-14']) {
      rows.push(log(`rest-${d}`, `${d}T10:00:00.000Z`, 6, 8));
    }
    await seedLogs(page, rows);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    await expect(card).toContainText(
      'Body before workouts runs about 2 points lower in the week before your period'
    );
    await expect(card).toContainText('Does that match how it feels?');
  });

  test('no jargon words, no "n=", no Δ anywhere on the card', async ({ page }) => {
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
    await openProgress(page);

    const text = (await cycleCard(page).innerText()).toLowerCase();
    for (const word of ['menstrual', 'follicular', 'ovulatory', 'luteal']) {
      expect(text).not.toContain(word);
    }
    expect(text).not.toMatch(/\bn=/);
    expect(text).not.toContain('δ');
  });

  test('the fail-loud footer folds under "How these are counted", not on the face', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-09-20T10:00:00.000Z', 5, 5), // pre-cutoff-style value but post-cutoff date — trusted
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = cycleCard(page);
    const info = card.locator('.cc2-info');
    await expect(info).toBeVisible();
    await expect(info.locator('summary')).toHaveText('ⓘ How these are counted');
    // Collapsed by default — the explanatory sentence isn't visible on the face.
    await expect(info.locator('p')).not.toBeVisible();
    await info.locator('summary').click();
    await expect(info.locator('p')).toBeVisible();
    await expect(info.locator('p')).toContainText('3 or more workouts');
  });

  test('with no cycle data yet, the card still offers the one tap', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);
    const card = cycleCard(page);
    await expect(card).toContainText('No period starts logged yet');
    await expect(card.locator('#cc-log-today')).toBeVisible();
  });
});

test.describe('"Period started today" — quiet vs primary, and the tap', () => {
  test('quiet (outline) button outside the predicted window', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-10T10:00:00.000Z'); // well clear of the ~Sep29 estimate
    await page.goto('/');
    await openProgress(page);
    const btn = page.locator('#cc-log-today');
    await expect(btn).toBeVisible();
    await expect(btn).not.toHaveClass(/cc-log-btn-primary/);
  });

  test('sage primary button inside the predicted window (3 days before through 7 days after)', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await mockDate(page, '2026-09-26T10:00:00.000Z'); // 3 days before the ~Sep29 estimate
    await page.goto('/');
    await openProgress(page);
    const btn = page.locator('#cc-log-today');
    await expect(btn).toHaveClass(/cc-log-btn-primary/);
  });

  test('"Another day?" reveals the date input only when tapped', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const summary = page.locator('.cc-date-reveal summary');
    const input = page.locator('#cc-log-date');
    await expect(summary).toHaveText('Another day?');
    await expect(input).not.toBeVisible();

    await summary.click();
    await expect(input).toBeVisible();

    await input.fill('2026-09-20');
    await input.dispatchEvent('change');

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startDate).toBe('2026-09-20');
  });

  test('writes a local row and the right payload, under automation (sync off)', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    await page.locator('#cc-log-today').click();

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string; source: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startDate).toBe('2026-09-25');
    expect(rows[0]!.source).toBe('app');

    const payload = await page.evaluate((row) => {
      const w = window as unknown as { __wtCyclePeriodPayload: (x: unknown) => Row };
      return w.__wtCyclePeriodPayload(row);
    }, rows[0]);
    expect(payload['start_date']).toBe('2026-09-25');
    expect(payload['source']).toBe('app');
    expect(payload['note']).toBeNull();

    // The card switches to the "Logged · <date> ✓ Undo" row — no second tap
    // re-adds a duplicate.
    await expect(page.locator('#cc-log-today')).toHaveCount(0);
    const undoRow = page.locator('.cc-log-undo');
    await expect(undoRow).toContainText('Logged · Sep 25 ✓');
    await expect(page.locator('#cc-undo')).toBeVisible();
  });

  test('Undo removes the row it just logged', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);
    await page.locator('#cc-log-today').click();
    await expect(page.locator('#cc-undo')).toBeVisible();

    await page.locator('#cc-undo').click();

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as unknown[];
    expect(rows).toHaveLength(0);
    await expect(page.locator('#cc-log-today')).toBeVisible();
  });

  // v50 · fix (Sep 25 2026, severity 5), still true in v51: re-logging an
  // already-logged date and then tapping Undo was deleting the ORIGINAL row.
  // Seed a real logged date, re-log it, confirm no Undo is offered, and
  // confirm the row survives. Driven via the __wtLogPeriodStart hook, same
  // reasoning as the v50 spec this replaces (the real tap's 10s undo timer
  // is real wall-clock time and would race this test).
  test('re-logging an already-logged date: no Undo, and the original row survives', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS); // includes 2026-09-01, source 'reproductive.md'
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    await page.evaluate(() => {
      const w = window as unknown as { __wtLogPeriodStart: (d: string) => void };
      w.__wtLogPeriodStart('2026-09-01');
    });

    await expect(page.locator('#cc-undo')).toHaveCount(0);
    await expect(cycleCard(page)).toContainText('Already logged');

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string; source: string | null }[];
    expect(rows).toHaveLength(HER_PERIODS.length);
    const sep1 = rows.find((r) => r.startDate === '2026-09-01');
    expect(sep1).toBeTruthy();
    expect(sep1!.source).toBe('reproductive.md'); // NOT silently overwritten to 'app'
  });

  test('the same tap also lives as a quiet row in Settings', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await page.locator('#open-settings').click();
    await expect(page.locator('.settings-section-label', { hasText: 'Cycle' })).toBeVisible();
    await page.locator('#settings-cycle-today').click();

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startDate).toBe('2026-09-25');
    await expect(page.locator('#settings-cycle-undo')).toBeVisible();
  });
});

test.describe('at phone size (412x915)', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('the "Your cycle" card causes no sideways scroll', async ({ page }) => {
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
    await openProgress(page);
    await expect(cycleCard(page)).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
