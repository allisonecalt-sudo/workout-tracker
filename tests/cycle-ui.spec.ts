// tests/cycle-ui.spec.ts — "Capacity & cycle" Progress card + the "Period
// started today" tap (Sep 25 2026). The phase math itself (n<3 rule,
// pre-v48-5 exclusion, estimate math) is exercised without a browser in
// tests/cycle.test.ts — this file covers only what needs a real DOM: the
// card renders, the tap writes a local row + the right payload under
// automation (sync is off — see app.ts syncDisabled()), undo removes it, and
// the card never causes sideways scroll at phone width.

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

function log(id: string, date: string, before: number, after: number): Row {
  return {
    id,
    date,
    workout: 'A',
    capacityBefore: before,
    capacityAfter: after,
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

test.describe('capacity & cycle card', () => {
  test('renders with a table row per phase, once there is cycle data', async ({ page }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    // 3+ post-v48 sessions inside the menstrual window of the Aug5->Sep1 cycle
    // (day 1-3), so the row clears MIN_PHASE_N and shows real averages, not
    // "not enough yet".
    // Values deliberately avoid 5 — these dates are before V48_CUTOFF_DATE,
    // where an exact 5 is the ambiguous untouched-slider default and gets
    // excluded, not averaged (see tests/cycle.test.ts's honest-readings suite).
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 2, 4),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const card = page.locator('.progress-card', { hasText: 'Capacity & cycle' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Menstrual');
    await expect(card).toContainText('Follicular');
    await expect(card).toContainText('Ovulatory');
    await expect(card).toContainText('Luteal');
    // avg before = (4+2+6)/3 = 4.0, avg after = (6+4+8)/3 = 6.0
    await expect(card).toContainText('4.0');
    await expect(card).toContainText('6.0');
    await expect(card.locator('.cc-legend')).toBeVisible();
  });

  // v50 · fix (Sep 25 2026): Opus's finding — the 4 phase bands were
  // near-identical greys (you couldn't decode phase, the card's whole
  // point, from the picture), and the before/after dots were the literal
  // same colour (--text-dim and --accent-progress both aliased --ink-2).
  // Assert the resolved colours are actually 4-way (band) and 2-way
  // (dot) distinct, not just that the elements exist.
  test('the 4 phase swatches resolve to 4 distinct colours, and before/after dots differ', async ({
    page,
  }) => {
    await seedCyclePeriods(page, HER_PERIODS);
    await seedLogs(page, [
      log('m1', '2026-08-05T10:00:00.000Z', 4, 6),
      log('m2', '2026-08-06T10:00:00.000Z', 2, 4),
      log('m3', '2026-08-07T10:00:00.000Z', 6, 8),
    ]);
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    const swatchColors = await page
      .locator('.cc-legend-swatch')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(swatchColors).toHaveLength(4);
    expect(new Set(swatchColors).size).toBe(4);

    const beforeDot = page.locator('.cc-legend-dot-hollow');
    const afterDot = page
      .locator('.cc-legend-item', { hasText: 'after' })
      .locator('.cc-legend-dot');
    const beforeColor = await beforeDot.evaluate((el) => getComputedStyle(el).borderColor);
    const afterColor = await afterDot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(beforeColor).not.toBe(afterColor);
  });

  test('a phase under 3 sessions shows "not enough yet", never a fake average', async ({
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
    const card = page.locator('.progress-card', { hasText: 'Capacity & cycle' });
    await expect(card).toContainText('not enough yet');
  });

  test('with no cycle data yet, the card still offers the one tap', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);
    const card = page.locator('.progress-card', { hasText: 'Capacity & cycle' });
    await expect(card).toContainText('No period starts logged yet');
    await expect(card.locator('#cc-log-today')).toBeVisible();
  });
});

test.describe('"Period started today" — the tap', () => {
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

    // The card switches to the undo row — no second tap re-adds a duplicate.
    await expect(page.locator('#cc-log-today')).toHaveCount(0);
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

  // v50 · fix (Sep 25 2026, severity 5): re-logging an already-logged date
  // and then tapping Undo was deleting the ORIGINAL row — gone from
  // localStorage, and a DELETE reached Supabase too. Seed a real logged
  // date, re-log it, confirm no Undo is offered, and confirm the row
  // survives. Driven via the __wtLogPeriodStart hook (same one the
  // "under automation (sync off)" test above uses) rather than the real
  // date-input tap: the real tap's 10s undo timer is real wall-clock time,
  // and re-logging via the date input's `change` event blocks this test's
  // dispatchEvent call until that timer actually fires and resets the
  // "Already logged" state back — which would make the test race its own
  // subject. The hook exercises the exact same logPeriodStart the tap calls.
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

    // No Undo button — re-logging an existing date created nothing.
    await expect(page.locator('#cc-undo')).toHaveCount(0);
    const card = page.locator('.progress-card', { hasText: 'Capacity & cycle' });
    await expect(card).toContainText('Already logged');

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string; source: string | null }[];
    // Still exactly her 8 seeded rows — nothing added, nothing removed.
    expect(rows).toHaveLength(HER_PERIODS.length);
    const sep1 = rows.find((r) => r.startDate === '2026-09-01');
    expect(sep1).toBeTruthy();
    expect(sep1!.source).toBe('reproductive.md'); // NOT silently overwritten to 'app'
  });

  test('a different day, via the date input', async ({ page }) => {
    await mockDate(page, '2026-09-25T10:00:00.000Z');
    await page.goto('/');
    await openProgress(page);

    await page.locator('#cc-log-date').fill('2026-09-20');
    await page.locator('#cc-log-date').dispatchEvent('change');

    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:cycle-periods'));
    const rows = JSON.parse(raw ?? '[]') as { startDate: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startDate).toBe('2026-09-20');
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

  test('the capacity & cycle card causes no sideways scroll', async ({ page }) => {
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
    await expect(page.locator('.progress-card', { hasText: 'Capacity & cycle' })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
