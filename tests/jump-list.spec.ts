// tests/jump-list.spec.ts — the "List" sheet + Done · Next skip-awareness
// (v50, Sep 25 2026). Her words: "I dont always do the workouts in [order]"
// -> "2" = the exercises INSIDE a workout. The flatten/skip/count math itself
// is exercised without a browser in tests/step-list.test.ts — this file
// covers only what needs a real DOM: the sheet renders and groups correctly,
// a jump lands without logging anything, Done marks ✓ and returns to what
// was skipped, the count reads "reached" not "position", the ✓ marks survive
// a reload, and the post-log/saved row both carry the skipped count.

import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
});

// Round 2 · Week 4 (startsOn Sep 19 2026) — the same fixed week
// tests/app.spec.ts's "(b) one count for the whole workout" and the Back
// (v47) test already pin: Workout A has 2 main rounds and an upper-back
// block there, so the round-1 floor and both Main groups are exercised.
const TUE_WEEK4 = '2026-09-22T14:00:00.000Z';

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

async function startWorkoutA(page: Page, { lite = false }: { lite?: boolean } = {}): Promise<void> {
  await mockDate(page, TUE_WEEK4);
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  if (lite) await page.locator('#lite-toggle').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toBeVisible();
}

type Row = { key: string; name: string };

// Every movable row (warm-up/main×rounds/upper-back) in list order — the
// sheet's LAST group is always Cool-down (one row, excluded here since it
// isn't part of the skip/complete mechanic).
async function readMovableRows(page: Page): Promise<Row[]> {
  const rows = page.locator('.step-list-row');
  const n = await rows.count();
  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    const key = await rows.nth(i).getAttribute('data-jump-key');
    if (!key || key.startsWith('cooldown:')) continue;
    // The row's name span also carries " · reps" (renderStepListRow); the
    // step screen's .exercise-name is the bare name only — split them apart.
    const raw = (await rows.nth(i).locator('.step-list-name').textContent()) ?? '';
    const name = raw.split(' · ')[0]!;
    out.push({ key, name });
  }
  return out;
}

test('List button sits beside Pause, 44px, opens and closes the sheet', async ({ page }) => {
  await startWorkoutA(page);
  const btn = page.locator('#step-list-open');
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await btn.click();
  await expect(page.locator('.step-list-panel')).toBeVisible();

  // Close via the × button.
  await page.locator('#step-list-close').click();
  await expect(page.locator('.step-list-panel')).toHaveCount(0);

  // Close via a tap outside the card (the backdrop itself).
  await btn.click();
  await page.locator('.step-list-panel').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.step-list-panel')).toHaveCount(0);
});

test('sheet groups by phase: Warm-up, Main round 1, Main round 2, Upper back, Cool-down', async ({
  page,
}) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const labels = await page.locator('.step-list-group-label').allTextContents();
  expect(labels).toContain('Warm-up');
  expect(labels).toContain('Main round 1');
  expect(labels).toContain('Main round 2');
  expect(labels).toContain('Upper back');
  expect(labels).toContain('Cool-down');
});

test('Lite day: the list shows only Main round 1', async ({ page }) => {
  await startWorkoutA(page, { lite: true });
  await page.locator('#step-list-open').click();
  const labels = await page.locator('.step-list-group-label').allTextContents();
  expect(labels).toContain('Main round 1');
  expect(labels).not.toContain('Main round 2');
});

test('jump forward three steps lands there and logs nothing', async ({ page }) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);
  expect(rows.length).toBeGreaterThan(4);

  const target = rows[3]!;
  await page.locator(`[data-jump-key="${target.key}"]`).click();

  // The sheet closes and she's standing on the jumped-to step.
  await expect(page.locator('.step-list-panel')).toHaveCount(0);
  await expect(page.locator('.exercise-name')).toHaveText(target.name);

  // Nothing was marked done by the jump itself (her spec: "nothing is logged
  // by jumping") — reopen and check every row is still unchecked.
  await page.locator('#step-list-open').click();
  const checks = await page.locator('.step-list-check').allTextContents();
  expect(checks.every((c) => c.trim() === '')).toBe(true);
  // ...and the one she jumped to is marked as where she is now.
  await expect(page.locator(`[data-jump-key="${target.key}"]`)).toHaveClass(
    /step-list-row-current/
  );
});

test('Done marks the step done and goes to the next undone one', async ({ page }) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);
  await page.locator(`[data-jump-key="${rows[3]!.key}"]`).click(); // jump to row 3

  await page.locator('button:has-text("Done ·"), #ww-skip').first().click();
  // Nothing between row 3 and row 4 was skipped, so this is the plain next
  // step in list order.
  await expect(page.locator('.exercise-name')).toHaveText(rows[4]!.name);

  await page.locator('#step-list-open').click();
  await expect(page.locator(`[data-jump-key="${rows[3]!.key}"] .step-list-check`)).toHaveText('✓');
  await expect(page.locator(`[data-jump-key="${rows[4]!.key}"]`)).toHaveClass(
    /step-list-row-current/
  );
});

test('jumping back to a skipped step, completing it, and the count reading "reached" not "position"', async ({
  page,
}) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);

  // Skip ahead to row 3, mark it done, land on row 4 — leaves rows 0-2 open.
  await page.locator(`[data-jump-key="${rows[3]!.key}"]`).click();
  await page.locator('button:has-text("Done ·"), #ww-skip').first().click();

  // Jump BACK to the very first, still-open row.
  await page.locator('#step-list-open').click();
  await page.locator(`[data-jump-key="${rows[0]!.key}"]`).click();
  await expect(page.locator('.exercise-name')).toHaveText(rows[0]!.name);

  // Complete it.
  await page.locator('button:has-text("Done ·"), #ww-skip').first().click();
  await expect(page.locator('.exercise-name')).toHaveText(rows[1]!.name);

  await page.locator('#step-list-open').click();
  await expect(page.locator(`[data-jump-key="${rows[0]!.key}"] .step-list-check`)).toHaveText('✓');
  await expect(page.locator(`[data-jump-key="${rows[3]!.key}"] .step-list-check`)).toHaveText('✓');
  await page.locator('#step-list-close').click();

  // Two are done (rows 0 and 3), she's viewing row 1 (not done) — reached =
  // 2 + 1 = 3, regardless of row 1's position (2nd) in the list. This is the
  // "counts completed steps, not position" behaviour her spec asks for.
  const text = (await page.locator('.step-count').textContent()) ?? '';
  const n = Number(text.match(/^(\d+) of/)?.[1]);
  expect(n).toBe(3);
});

test('the resume snapshot survives a reload', async ({ page, context }) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);
  await page.locator(`[data-jump-key="${rows[3]!.key}"]`).click();
  await page.locator('button:has-text("Done ·"), #ww-skip').first().click(); // marks row 3 done

  // A fresh page in the same context, the way tests/app.spec.ts's resume test
  // does it — `page.reload()` would re-fire this file's beforeEach init
  // script and clear localStorage, which a real app reopen never does.
  const reopened = await context.newPage();
  await mockDate(reopened, TUE_WEEK4);
  await reopened.goto('/');
  await expect(reopened.locator('.exercise-name')).toHaveText(rows[4]!.name);
  await reopened.locator('#step-list-open').click();
  await expect(reopened.locator(`[data-jump-key="${rows[3]!.key}"] .step-list-check`)).toHaveText(
    '✓'
  );
  await reopened.close();
});

test('skipped-count shows on the log and saves to the row', async ({ page }) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);

  // Complete exactly two of the movable steps (rows 0 and 3), then jump
  // straight to the cool-down and finish — everything else stays skipped.
  await page.locator(`[data-jump-key="${rows[0]!.key}"]`).click();
  await page.locator('button:has-text("Done ·"), #ww-skip').first().click();
  await page.locator('#step-list-open').click();
  await page.locator(`[data-jump-key="${rows[3]!.key}"]`).click();
  await page.locator('button:has-text("Done ·"), #ww-skip').first().click();
  await page.locator('#step-list-open').click();
  await page.locator('[data-jump-key="cooldown:1:0"]').click();
  await expect(page.locator('.stretch-list')).toBeVisible();
  await page.locator('button:has-text("Done ·")').click(); // Done · Finish

  const expectedSkipped = rows.length - 2;
  await expect(page.locator('.postlog-skipped')).toHaveText(
    new RegExp(`^${expectedSkipped} moves? skipped$`)
  );

  await page.locator('#save-log').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
  const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
  const logs = JSON.parse(raw ?? '[]') as { stepsSkipped?: number | null }[];
  expect(logs[0]?.stepsSkipped).toBe(expectedSkipped);
});

// v50 · fix (Sep 25 2026, severity 4): finishing the LAST of a run of
// skipped moves used to fall through to the plain in-order walk instead of
// the jump list (nextUndoneStep returns null once everything's done), which
// marched her forward through every move she'd already finished — round-1
// floor included — instead of going straight to cool-down.
test('finishing the last of 2 skipped moves goes straight to cool-down, not back through finished moves', async ({
  page,
}) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);
  expect(rows.length).toBeGreaterThan(5);

  // Skip the first 2 moves by jumping straight to the 3rd.
  await page.locator(`[data-jump-key="${rows[2]!.key}"]`).click();

  // Walk Done through everything else, including the round break — the jump
  // list should wrap back to the 2 skipped moves on its own once everything
  // else is done, and land on cool-down right after the 2nd one. Bounded
  // loop: a regression here used to need ~21 EXTRA taps past this bound.
  for (let i = 0; i < rows.length + 8; i++) {
    if (await page.locator('.stretch-list').isVisible()) break;
    if (await page.locator('#start-round-2').isVisible()) {
      await page.locator('#start-round-2').click();
      continue;
    }
    const btn = page.locator('button:has-text("Done ·"), #ww-skip').first();
    if (await btn.isVisible()) {
      await btn.click();
      continue;
    }
    break;
  }

  await expect(page.locator('.stretch-list')).toBeVisible();
  await page.locator('#step-list-open').click();
  await expect(page.locator(`[data-jump-key="${rows[0]!.key}"] .step-list-check`)).toHaveText('✓');
  await expect(page.locator(`[data-jump-key="${rows[1]!.key}"] .step-list-check`)).toHaveText('✓');
});

test('the round-1 floor still shows even with an earlier step skipped', async ({ page }) => {
  await startWorkoutA(page);
  await page.locator('#step-list-open').click();
  const rows = await readMovableRows(page);
  // Skip the very first warm-up step by jumping to the second.
  await page.locator(`[data-jump-key="${rows[1]!.key}"]`).click();

  for (let i = 0; i < 40; i++) {
    if (await page.locator('#start-round-2').isVisible()) break;
    const btn = page.locator('button:has-text("Done ·"), #ww-skip');
    if (await btn.isVisible()) {
      await btn.first().click();
    }
  }
  await expect(page.locator('#start-round-2')).toBeVisible();
  await expect(page.locator('.round-break-title')).toHaveText('Round 1 done ✓');
});
