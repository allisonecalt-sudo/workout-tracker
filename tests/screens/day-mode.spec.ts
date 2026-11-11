// tests/screens/day-mode.spec.ts — "Not my best day?" on the pre-workout page (v74, Nov 11 2026), at phone size.
// The logic half (what each mode does to the workout, the wire, coming back) is tests/day-mode.test.ts.
//
// WHAT: a quiet link under the Round 3 path picker opens a sheet (3 rows, 6 buttons). Sore (back / knee
// / wrist) = a swap day; a cold = an easy day; fever / Crohn's = a rest day with a calm card and "Log
// rest day". Nothing is ever pre-selected; undo / change until Start; D and Round 2 have no link.
// WHY: her words (Wed Nov 11 2026): "Ok but he's if I'm ick" · "figure out how to incorporate this clearly".

import { test, expect, type Page } from '@playwright/test';
import { mockDate } from '../helpers';

const SUN_R3 = '2026-11-15T07:00:00.000Z'; // Sun Nov 15 09:00 Jerusalem: Round 3 Week 1
const SAT_R2 = '2026-11-14T10:00:00.000Z'; // Sat Nov 14: still Round 2
const LOGS_KEY = 'workout-tracker:logs';
const REST_KEY = 'workout-tracker:rest-days';

type Row = Record<string, unknown>;

async function openPreLog(page: Page, iso: string, letter: string, seed?: Row[]): Promise<void> {
  await mockDate(page, iso);
  await page.addInitScript(
    ([logsKey, rows]) => {
      window.localStorage.clear();
      if (rows) window.localStorage.setItem(logsKey as string, JSON.stringify(rows));
    },
    [LOGS_KEY, seed ?? null] as const
  );
  await page.goto('/');
  // 'any' = whichever workout Home offers (a seeded week may already have A done)
  const sel =
    letter === 'any'
      ? 'button[data-workout]:not([data-workout="D"])'
      : `button[data-workout="${letter}"]`;
  await page.locator(sel).first().click();
  await expect(page.locator('#day-link, #begin').first()).toBeVisible();
}

async function pickDay(page: Page, mode: string): Promise<void> {
  await page.locator('#day-link').click();
  await page.locator(`[data-day-mode="${mode}"]`).click();
}

async function readKey(page: Page, key: string): Promise<Row[]> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), key);
  return JSON.parse(raw ?? '[]') as Row[];
}

/** Walk to the post-log, returning every exercise title seen and every top swap line seen. */
async function walkToPostLog(page: Page): Promise<{ seen: string[]; swaps: string[] }> {
  const seen: string[] = [];
  const swaps: string[] = [];
  for (let i = 0; i < 120; i++) {
    if (await page.locator('#save-log').isVisible()) break;
    const name = await page
      .locator('.exercise-name')
      .first()
      .textContent({ timeout: 500 })
      .catch(() => null);
    if (name && seen[seen.length - 1] !== name) seen.push(name);
    const swap = await page
      .locator('#swap-line')
      .first()
      .textContent({ timeout: 100 })
      .catch(() => null);
    if (swap && !swaps.includes(swap)) swaps.push(swap);
    if (await page.locator('#start-round-2').isVisible()) {
      await page.locator('#start-round-2').click();
      continue;
    }
    const next = page.locator('#next, #ww-skip');
    if (!(await next.isVisible())) break;
    await next.click();
  }
  await expect(page.locator('#save-log')).toBeVisible();
  return { seen, swaps };
}

test.describe('v74 - the link and the sheet', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('Round 3 A: a quiet "Not my best day?" link under the picker; the sheet has 3 rows and 6 buttons', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    const picker = (await page.locator('.path-picker').boundingBox())!;
    const link = (await page.locator('#day-link').boundingBox())!;
    expect(link.y).toBeGreaterThanOrEqual(picker.y + picker.height - 1);
    await expect(page.locator('#day-link')).toHaveText('Not my best day?');
    await expect(page.locator('#day-sheet')).toHaveCount(0);
    await page.locator('#day-link').click();
    await expect(page.locator('#day-sheet')).toBeVisible();
    await expect(page.locator('.day-row-title')).toHaveText([
      'Sore today',
      'Under the weather',
      'Rest today',
    ]);
    await expect(page.locator('.day-btn')).toHaveText([
      'Back',
      'Knee',
      'Wrist',
      'A cold, no fever',
      'Fever / body aches / chest cough / stomach bug',
      "Crohn's flare",
    ]);
    // nothing is lit: it is never pre-selected
    await expect(page.locator('.day-btn[aria-pressed="true"]')).toHaveCount(0);
  });

  test('no link on Workout D, and none the day before Round 3 (Sat Nov 14 is Round 2)', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'D');
    await expect(page.locator('#day-link')).toHaveCount(0);
    await openPreLog(page, SAT_R2, 'C');
    await expect(page.locator('#day-link')).toHaveCount(0);
    await expect(page.locator('.path-picker')).toHaveCount(0);
  });

  test('a low body reading only SUGGESTS it (an outline); nothing switches on', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await expect(page.locator('#day-link')).not.toHaveClass(/day-link-suggest/);
    await page.locator('#cap-before-2').click();
    await expect(page.locator('#day-link')).toHaveClass(/day-link-suggest/);
    await expect(page.locator('#day-card')).toHaveCount(0);
    await expect(page.locator('#rest-card')).toHaveCount(0);
    await expect(page.locator('.path-chip-on')).toHaveCount(0);
    await page.locator('#cap-before-8').click();
    await expect(page.locator('#day-link')).not.toHaveClass(/day-link-suggest/);
  });

  test('undo / change before Start: tap the lit button, "change", or "Back to a normal day"', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'knee');
    await expect(page.locator('.day-link-row')).toContainText('Today: Knee');
    await page.locator('#day-link').click();
    await expect(page.locator('.day-btn[aria-pressed="true"]')).toHaveText('Knee');
    await page.locator('[data-day-mode="wrist"]').click(); // change
    await expect(page.locator('.day-link-row')).toContainText('Today: Wrist');
    await page.locator('#day-link').click();
    await page.locator('#day-clear').click(); // undo
    await expect(page.locator('#day-link')).toHaveText('Not my best day?');
    await expect(page.locator('#day-card')).toHaveCount(0);
    await pickDay(page, 'back');
    await page.locator('#day-link').click();
    await page.locator('[data-day-mode="back"]').click(); // the lit one again = off
    await expect(page.locator('#day-link')).toHaveText('Not my best day?');
  });
});

test.describe('v74 - SWAP days', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('back on B: 1 round, the wall hinge with its top line, saved day_mode back', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'B');
    await pickDay(page, 'back');
    await expect(page.locator('#day-card')).toContainText(
      'About half your usual reps · effort 5–6 · your pain rule'
    );
    await expect(page.locator('#day-card')).toContainText('Swapped for your back today');
    await page.locator('#begin').click();
    const { seen, swaps } = await walkToPostLog(page);
    expect(seen).toContain('Hip hinge, no weight, hands on the wall');
    expect(seen).not.toContain('Bodyweight hip hinge');
    expect(swaps.join(' ')).toContain(
      'Swapped for your back today: Hip hinge, no weight, hands on the wall instead of Bodyweight hip hinge'
    );
    // 1 round: each main move appears once (no second pass)
    expect(seen.filter((n) => n === 'One-arm dumbbell row').length).toBe(1);
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const log = (await readKey(page, LOGS_KEY))[0]!;
    expect(log['dayMode']).toBe('back');
    expect(log['workout']).toBe('B');
    expect(log['sessionPath']).toBe('48');
  });

  test('knee on C: the ride choice has no elliptical (the walk lane, same minutes), wall sit instead of split squat', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'C');
    await pickDay(page, 'knee');
    await page.locator('#begin').click();
    await expect(page.locator('#ww-elliptical')).toHaveCount(0);
    await expect(page.locator('#ww-start')).toBeVisible();
    await expect(page.locator('.exercise-reps')).toHaveText('12 min');
    await expect(page.locator('#swap-line')).toContainText(
      'Swapped for your knee today: the walk lane instead of the elliptical'
    );
    const { seen } = await walkToPostLog(page);
    expect(seen).toContain('Wall sit');
    expect(seen).not.toContain('Supported split squat');
    // the wall sit here is a comfort-angle hold: it never becomes a wall-sit reading
    await page.locator('#save-log').click();
    const log = (await readKey(page, LOGS_KEY))[0]!;
    expect(log['dayMode']).toBe('knee');
    expect(log['wallSitSec']).toBe(0);
  });

  test('wrist on A: the wall push-up on forearms shows its top line first; the picked path is kept', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await pickDay(page, 'wrist');
    await page.locator('#begin').click();
    const { seen, swaps } = await walkToPostLog(page);
    expect(seen).toContain('Wall push-up on forearms');
    expect(seen).not.toContain('Incline push-up on fists');
    expect(swaps).toContain(
      'Swapped for your wrist today: Wall push-up on forearms instead of Incline push-up on fists'
    );
    // loose grip on the row (same card, "today's version" line)
    expect(swaps.some((s) => s.includes('a loose grip'))).toBe(true);
    await page.locator('#save-log').click();
    const log = (await readKey(page, LOGS_KEY))[0]!;
    expect(log['dayMode']).toBe('wrist');
    expect(log['sessionPath']).toBe('60');
  });

  test('the wall push-up step: top line, the new card, and the day line on the page', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'wrist');
    await page.locator('#begin').click();
    for (let i = 0; i < 40; i++) {
      const name = await page.locator('.exercise-name').first().textContent();
      if (name === 'Wall push-up on forearms') break;
      await page.locator('#next, #ww-skip').click();
    }
    await expect(page.locator('.exercise-name').first()).toHaveText('Wall push-up on forearms');
    await expect(page.locator('#swap-line')).toBeVisible();
    await expect(page.locator('#day-mode-line')).toContainText('Sore wrist day');
    await expect(page.locator('.new-tonight-badge')).toHaveCount(0);
  });
});

test.describe('v74 - EASY day (a cold, no fever)', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('the card, the 38 path locked, 3 moves, 1 round, the easy ride note, saved cold + 38', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await pickDay(page, 'cold');
    await expect(page.locator('#day-card')).toContainText(
      'No fever, nothing in your chest, feel OK once warm? Easy session. Stop if you feel worse.'
    );
    await expect(page.locator('[data-path="38"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-path="60"]')).toBeDisabled();
    await expect(page.locator('.prelog-meta')).toContainText('~38 min');
    await page.locator('#begin').click();
    await expect(page.locator('.ride-note')).toHaveText('Easy — short sentences or easier.');
    const { seen } = await walkToPostLog(page);
    expect(seen).toContain('Incline push-up on fists');
    expect(seen).not.toContain('Full dead bug');
    expect(seen.filter((n) => n === 'Chair squat').length).toBe(1);
    await page.locator('#save-log').click();
    const log = (await readKey(page, LOGS_KEY))[0]!;
    expect(log['dayMode']).toBe('cold');
    expect(log['sessionPath']).toBe('38');
  });

  test('undoing the easy day gives her own path pick back', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await pickDay(page, 'cold');
    await page.locator('#day-link').click();
    await page.locator('#day-clear').click();
    await expect(page.locator('[data-path="60"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-path="60"]')).toBeEnabled();
  });

  test('a swap day mid-workout survives a reload (the resume snapshot carries it)', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'wrist');
    await page.locator('#begin').click();
    await expect(page.locator('.exercise-name').first()).toBeVisible();
    const snap = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => /active/i.test(k))
        .map((k) => localStorage.getItem(k) ?? '')
        .join('|')
    );
    expect(snap).toContain('"dayMode":"wrist"');
  });
});

test.describe('v74 - REST day', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('fever: the calm card, the doctor list, no workout and no Start; Change reopens the sheet', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'fever');
    await expect(page.locator('#rest-card')).toContainText(
      "Rest today. Back once you've had 24 hours with no fever, without fever medicine."
    );
    await expect(page.locator('.rest-doctor-title')).toHaveText('See a doctor if…');
    await expect(page.locator('.rest-doctor li')).toHaveText([
      'chest pain or tightness',
      'racing or pounding heart',
      'breathless out of proportion',
      'faint or dizzy',
      'fever coming back',
      'a crash 1–2 days after exercise',
    ]);
    await expect(page.locator('#begin')).toHaveCount(0);
    await expect(page.locator('.overview-card')).toHaveCount(0);
    await page.locator('#rest-change').click();
    await expect(page.locator('#day-sheet')).toBeVisible();
    await page.locator('[data-day-mode="fever"]').click(); // off again: back to a normal day
    await expect(page.locator('#begin')).toBeVisible();
  });

  test("Crohn's: gentle walk, electrolytes, dizzy / dark pee / cramps → no exercise, plus the same doctor list", async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'B');
    await pickDay(page, 'crohns');
    await expect(page.locator('#rest-card')).toContainText(
      'A gentle walk only if you feel up to it. Drink with electrolytes, not just water. Dizzy, dark pee or cramps → no exercise.'
    );
    await expect(page.locator('.rest-doctor li')).toHaveCount(6);
  });

  test('"Log rest day": Home says "Recovery day ✓"; it is NOT a workout (no session row, week unchanged, no missed)', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    const weekBefore = await (async () => {
      await page.locator('#back-home').click();
      const t = (await page.locator('#week-count').textContent()) ?? '';
      await page.locator('button[data-workout="A"]').first().click();
      return t;
    })();
    await pickDay(page, 'crohns');
    await page.locator('#log-rest').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    await expect(page.locator('#home-recovery-card')).toContainText('Recovery day ✓');
    await expect(page.locator('#home-done-card')).toHaveCount(0);
    // it is in its own store, not the sessions list
    expect(await readKey(page, LOGS_KEY)).toEqual([]);
    const rest = await readKey(page, REST_KEY);
    expect(rest.length).toBe(1);
    expect(rest[0]!['mode']).toBe('crohns');
    // the week line is what it was, and the workout chips are still there to choose
    expect((await page.locator('#week-count').textContent()) ?? '').toBe(weekBefore);
    await expect(page.locator('button[data-workout]').first()).toBeVisible();
  });

  test('Progress and Sessions never see a rest day', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'fever');
    await page.locator('#log-rest').click();
    await expect(page.locator('#home-recovery-card')).toBeVisible();
    await page.locator('#view-history').click();
    await expect(page.locator('.history-row, .session-row')).toHaveCount(0);
    await page.goBack().catch(() => undefined);
  });
});

test.describe('v74 - coming back', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  const sick = (over: Row): Row => ({
    id: 'seed-cold',
    date: '2026-11-15T08:00:00.000Z',
    workout: 'A',
    capacityBefore: null,
    capacityAfter: null,
    wallSitSec: 0,
    backPain: null,
    word: '',
    synced: true,
    dayMode: 'cold',
    sessionPath: '38',
    ...over,
  });
  const NEXT_DAY = '2026-11-17T07:00:00.000Z';

  test('after a logged easy day the next workout opens with 38 pre-picked and the line; another path overrides', async ({
    page,
  }) => {
    await openPreLog(page, NEXT_DAY, 'any', [sick({})]);
    await expect(page.locator('#coming-back-line')).toHaveText(
      'Coming back from being sick: easy for 2–3 workouts'
    );
    await expect(page.locator('[data-path="38"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-path="60"]').click();
    await expect(page.locator('[data-path="60"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-path="38"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('it lasts for 3 workouts and then is gone; with no sick day logged it never shows', async ({
    page,
  }) => {
    const after = (n: number): Row =>
      sick({ id: `w${n}`, date: `2026-11-1${6 + n}T08:00:00.000Z`, dayMode: null, workout: 'C' });
    await openPreLog(page, '2026-11-22T07:00:00.000Z', 'any', [sick({}), after(0), after(1)]);
    await expect(page.locator('#coming-back-line')).toBeVisible();
    await openPreLog(page, '2026-11-22T07:00:00.000Z', 'any', [
      sick({}),
      after(0),
      after(1),
      after(2),
    ]);
    await expect(page.locator('#coming-back-line')).toHaveCount(0);
    await expect(page.locator('.path-chip-on')).toHaveCount(0);
    await openPreLog(page, SUN_R3, 'A');
    await expect(page.locator('#coming-back-line')).toHaveCount(0);
  });

  test('a logged REST day starts it too, and Start saves the pre-picked 38', async ({ page }) => {
    await mockDate(page, NEXT_DAY);
    await page.addInitScript(
      ([restKey]) => {
        window.localStorage.clear();
        window.localStorage.setItem(
          restKey as string,
          JSON.stringify([
            { id: 'r1', date: '2026-11-16T08:00:00.000Z', mode: 'fever', synced: true },
          ])
        );
      },
      [REST_KEY] as const
    );
    await page.goto('/');
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#coming-back-line')).toBeVisible();
    await page.locator('#begin').click();
    await walkToPostLog(page);
    await page.locator('#save-log').click();
    expect((await readKey(page, LOGS_KEY))[0]!['sessionPath']).toBe('38');
  });
});

test.describe('v74 - a normal day is unchanged', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('no day mode: 2 rounds, the picker works, saved day_mode is null', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('#begin').click();
    const { seen } = await walkToPostLog(page);
    expect(seen.filter((n) => n === 'Chair squat').length).toBe(2);
    await page.locator('#save-log').click();
    const log = (await readKey(page, LOGS_KEY))[0]!;
    expect(log['dayMode'] ?? null).toBeNull();
  });
});

// ---- v74.1 fix round ----

const hist = (id: string, lane: string): Row => ({
  id,
  date: '2026-11-12T16:00:00.000Z',
  workout: 'C',
  capacityBefore: null,
  capacityAfter: null,
  wallSitSec: 0,
  backPain: null,
  word: '',
  synced: true,
  cardioLane: lane,
});

test.describe('v74.1 - knee day ignores the saved last lane', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  for (const lane of ['elliptical', 'apartment']) {
    test(`last lane ${lane} (seeded history): the knee day opens the Walk choice, not the ${lane}`, async ({
      page,
    }) => {
      await openPreLog(page, SUN_R3, 'C', [hist(`h-${lane}`, lane)]);
      await pickDay(page, 'knee');
      await page.locator('#begin').click();
      await expect(page.locator('.cardio-choice')).toBeVisible();
      await expect(page.locator('#ww-start')).toBeVisible();
      await expect(page.locator('#ww-elliptical')).toHaveCount(0);
      await expect(page.locator('#swap-line')).toContainText('Swapped for your knee today');
      await expect(page.locator('#ww-start')).toHaveClass(/btn-primary/);
      await expect(page.locator('#ww-start .cardio-primary-sub')).toHaveText('tap as you head out');
      // readable: the small line has the button's own text colour, and nothing scrolls sideways
      const colours = await page.evaluate(() => {
        const sub = document.querySelector('#ww-start .cardio-primary-sub');
        const btn = document.querySelector('#ww-start');
        return [getComputedStyle(sub!).color, getComputedStyle(btn!).color];
      });
      expect(colours[0]).toBe(colours[1]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= 412)).toBe(true);
    });
  }

  test('a normal day still opens on the last lane (elliptical history)', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'C', [hist('h-n', 'elliptical')]);
    await page.locator('#begin').click();
    await expect(page.locator('.cardio-choice')).toHaveCount(0);
  });
});

test.describe('v74.1 - swap-day "Get checked if..." and the small lines', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  const expectations: Record<string, string[]> = {
    back: [
      'new leg weakness or numbness',
      'numb saddle area',
      'stays at night or at rest',
      'fever with new back pain',
    ],
    knee: ['the knee locks', "can't put weight on it", 'big swelling'],
    wrist: [
      'numbness or tingling',
      'a new lump or deformity',
      "can't bear any load after an injury",
    ],
  };
  for (const [mode, bits] of Object.entries(expectations)) {
    test(`${mode}: the day card lists "Get checked if..."`, async ({ page }) => {
      await openPreLog(page, SUN_R3, 'A');
      await pickDay(page, mode);
      await expect(page.locator('#get-checked')).toContainText('Get checked if…');
      for (const b of bits) await expect(page.locator('#get-checked')).toContainText(b);
    });
  }

  test('an easy day has no "Get checked if..." list', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'cold');
    await expect(page.locator('#get-checked')).toHaveCount(0);
  });

  test('the "coming back" line hides once she taps another path', async ({ page }) => {
    const sick: Row = {
      id: 'seed-cold',
      date: '2026-11-15T08:00:00.000Z',
      workout: 'A',
      capacityBefore: null,
      capacityAfter: null,
      wallSitSec: 0,
      backPain: null,
      word: '',
      synced: true,
      dayMode: 'cold',
      sessionPath: '38',
    };
    await openPreLog(page, '2026-11-17T07:00:00.000Z', 'any', [sick]);
    await expect(page.locator('#coming-back-line')).toBeVisible();
    await page.locator('[data-path="48"]').click();
    await expect(page.locator('#coming-back-line')).toHaveCount(0);
  });

  test('wrist day on the 60 path: the Hammer curl page opens with its own top line', async ({
    page,
  }) => {
    await openPreLog(page, SUN_R3, 'A');
    await page.locator('[data-path="60"]').click();
    await pickDay(page, 'wrist');
    await page.locator('#begin').click();
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const name = await page.locator('.exercise-name').first().textContent();
      if (name?.includes('Hammer curl')) {
        await expect(page.locator('#swap-line')).toHaveText(
          'Sore wrist today: skip it, or go lighter'
        );
        found = true;
        break;
      }
      const next = page.locator('#next, #ww-skip');
      if (!(await next.isVisible())) break;
      await next.click();
    }
    expect(found).toBe(true);
  });
});

test.describe('v74.1 - rest day: start anyway and undo', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('the Recovery card offers Start anyway (rest row stays) and Undo', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'fever');
    await page.locator('#log-rest').click();
    await expect(page.locator('#recovery-start')).toContainText('Feel better? Start');
    await expect(page.locator('#recovery-undo')).toHaveText('Undo');
    await page.locator('#recovery-start').click();
    await expect(page.locator('#begin')).toBeVisible();
    expect((await readKey(page, REST_KEY)).filter((r) => r['undone'] !== true)).toHaveLength(1);
  });

  test('Undo removes the rest day and cancels the 38 pre-pick it caused', async ({ page }) => {
    await openPreLog(page, SUN_R3, 'A');
    await pickDay(page, 'fever');
    await page.locator('#log-rest').click();
    await page.locator('#recovery-start').click();
    await expect(page.locator('#coming-back-line')).toBeVisible();
    await expect(page.locator('[data-path="38"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#back-home').click();
    await page.locator('#recovery-undo').click();
    await expect(page.locator('#home-recovery-card')).toHaveCount(0);
    await expect(page.locator('button[data-workout]').first()).toBeVisible();
    // a local tombstone, never pushed; nothing visible reads it
    const rest = await readKey(page, REST_KEY);
    expect(rest).toHaveLength(1);
    expect(rest[0]!['undone']).toBe(true);
    await page.locator('button[data-workout="A"]').first().click();
    await expect(page.locator('#coming-back-line')).toHaveCount(0);
    await expect(page.locator('.path-chip-on')).toHaveCount(0);
  });

  test('a synced rest day is undone too, and a reload keeps it undone', async ({ page }) => {
    await mockDate(page, SUN_R3);
    await page.addInitScript(
      ([restKey]) => {
        if (window.sessionStorage.getItem('seeded')) return;
        window.sessionStorage.setItem('seeded', '1');
        window.localStorage.clear();
        window.localStorage.setItem(
          restKey as string,
          JSON.stringify([
            { id: 'r1', date: '2026-11-15T07:00:00.000Z', mode: 'crohns', synced: true },
          ])
        );
      },
      [REST_KEY] as const
    );
    await page.goto('/');
    await page.locator('#recovery-undo').click();
    await expect(page.locator('#home-recovery-card')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#home-recovery-card')).toHaveCount(0);
  });
});
