// tests/golden.spec.ts — GATE 1 of three (Sep 27 2026, code-shape R1a).
//
// Why this exists: stack-decision-2026-09-27.md ("The builder sequence" §R1,
// "Second opinions" adjustments). Every later code-shape step (esbuild bundle,
// file splits, the `ui` gather, screen-by-screen moves) is proved
// behaviour-neutral by reproducing THIS file's captured HTML byte-for-byte.
// A diff here means STOP AND REPORT — never silently accept it.
//
// THREE GATES, not one (2026-09-27 second-opinion adjustment: golden HTML
// alone proves too little — focus/timers/listeners/ARIA can break while
// markup stays identical, and it proves too much — whitespace/attribute-order
// is not behaviour). This file is gate 1 (deterministic structural oracle).
// Gate 2 is the existing ~530-test Playwright/Node suite (behavioural).
// Gate 3 is `tsc --noEmit` + eslint (static/compile). All three must pass —
// none stands alone. See CLAUDE.md "The three gates".
//
// RULES (builder sequence rule 3): builders may NEVER edit a file under
// tests/golden/, delete or skip one of these tests, or hand-edit the stored
// HTML. A diff is reported, not fixed. Only the checker regenerates a golden,
// only via `npm run golden:update`, and only with a written reason in the
// commit message (which golden(s), why the change is intentional).
//
// Seed data is Allison's real shape (LogEntry fields as tests/rides-page.spec.ts
// and tests/app.spec.ts already seed them) — not a synthetic minimal object —
// so the captured markup exercises the same branches her real data does.

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// Same "Done · " / skip button every other spec in this repo uses to move
// forward one step (tests/app.spec.ts's own NEXT, duplicated here on purpose —
// R2 moves shared test helpers into tests/helpers.ts; golden.spec.ts adopts
// that import once R2 lands, not before).
const NEXT = 'button:has-text("Done ·"), #ww-skip';

type Row = Record<string, unknown>;

// A frozen "now": after the completion-model launch (Sep 26 2026 22:30 JDT,
// week.ts's COMPLETION_WEEKS_FROM), inside the anchor week, so Home/Progress/
// Weekly-review/Rides/Cycle all resolve a real (not "before launch") week.
const NOW_ISO = '2026-09-29T06:00:00.000Z'; // Tue ~09:00 Asia/Jerusalem

// Every SEED_LOGS date is BEFORE the anchor on purpose: Home's own week model
// only hides a workout's entry chip once a session counts toward THIS week
// (found the hard way — seeding a same-week 'A'/'C' session made
// `button[data-workout="A"]` disappear entirely, since Home only ever offers
// what's still undone). Dating the seed history before the anchor gives
// History/Progress/Rides/Cycle real rows to render while leaving the current
// week untouched, so every pre-log door stays open for its own fixture.

function log(id: string, date: string, workout: 'A' | 'B' | 'C', extra: Row = {}): Row {
  return {
    id,
    date,
    workout,
    capacityBefore: 7,
    capacityAfter: 7,
    wallSitSec: 20,
    backPain: 1,
    word: 'steady',
    synced: true,
    ...extra,
  };
}

// Two past sessions this week: a plain strength day and an elliptical ride,
// so History/Progress/Weekly-review/Rides/Cycle all have one real row each —
// an empty-state fixture would hide branches those screens actually render.
const SEED_LOGS: Row[] = [
  log('golden-s1', '2026-09-20', 'A'),
  log('golden-s2', '2026-09-21', 'C', {
    cardioLane: 'elliptical',
    ellipticalLevel: 5,
    ellipticalKm: 1.2,
    ellipticalKcal: 90,
    ellipticalTimeSec: 900,
    ellipticalPulse: 122,
    sessionNote: 'Fixture ride — golden seed, not a real session.',
  }),
];

// Same movable-clock technique as tests/app.spec.ts's own movableClock/
// mockDate: overrides window.Date so app code reads a fixed instant, with an
// offset advanceClock can move forward for the ride timer fixtures. Always
// skips the 3-2-1 "Get ready" pre-countdown (tests/app.spec.ts's own
// skipPreCountdown option, zeroing workout-tracker:setting-pre-count) — a
// big instant advanceClock jump while that SEPARATE short timer is still
// live crashed the renderer mid-step (found running this fixture: `.timer-
// display` vanished entirely, not just a stale "30:00"). Real phones never
// jump the clock 5-30 minutes in one tick, so this is a test-harness need,
// not a product fix.
async function movableClock(page: Page, iso: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('workout-tracker:setting-pre-count', '0');
  });
  await page.addInitScript((isoArg: string) => {
    const base = new Date(isoArg).getTime();
    (window as unknown as { __clockOffset: number }).__clockOffset = 0;
    const nowMs = (): number =>
      base + Number((window as unknown as { __clockOffset?: number }).__clockOffset ?? 0);
    const RealDate = Date;
    class MovableDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) super(nowMs());
        else super(...args);
      }
      static override now(): number {
        return nowMs();
      }
    }
    (window as unknown as { Date: typeof Date }).Date = MovableDate;
  }, iso);
}

async function advanceClock(page: Page, ms: number): Promise<void> {
  await page.evaluate((msArg: number) => {
    const w = window as unknown as { __clockOffset?: number };
    w.__clockOffset = Number(w.__clockOffset ?? 0) + msArg;
  }, ms);
}

async function seed(page: Page, rows: Row[]): Promise<void> {
  await page.addInitScript((r: Row[]) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(r));
  }, rows);
}

// R1 · fix r1 (should, Sep 27 2026 — CHECK-code-shape-R1's fixture-gap item):
// shared by the sub-view fixtures added below. "Done ·"/"#start-round-2"/
// "#ww-skip" is the same forward control tests/app.spec.ts's own walk uses
// and the pre-existing 'workout — a strength step' fixture already relies on
// — one selector covers every screen that has a single forward action.
const FORWARD = 'button:has-text("Done ·"), #start-round-2, #ww-skip';

// Walks Workout A forward (rest-sec left at its default of 0 — Allison's own
// "i do not need the brakes anymore" — so this never meets a rest screen and
// needs no hold-to-skip) until one of `stopSelectors` is visible, or gives up
// after 40 steps. Empirically verified against the live program (probe-
// screens.cjs, Sep 27 2026): round-break shows at step 10, the cool-down list
// at step 23 — 40 leaves real headroom without hunting forever if a program
// change ever moves them.
async function walkWorkoutA(page: Page, stopSelectors: string[]): Promise<void> {
  for (let i = 0; i < 40; i++) {
    for (const sel of stopSelectors) {
      if (
        await page
          .locator(sel)
          .isVisible()
          .catch(() => false)
      )
        return;
    }
    const forward = page.locator(FORWARD);
    if (await forward.isVisible().catch(() => false)) {
      await forward.click();
      continue;
    }
    break;
  }
}

// Whitespace BETWEEN tags is not behaviour (a Chrome/Prettier reflow shouldn't
// fail this oracle); attribute order and text content are. Collapsing runs of
// whitespace down to a single space (not deleting it) keeps text-node
// separation intact while killing indentation noise from template strings.
//
// Dynamic ids AND times are stubbed (the task's own "normalized HTML
// (whitespace-collapsed, dynamic ids/times stubbed)"):
// - a just-saved session's data-detail is genId()'s crypto.randomUUID() — a
//   fresh value every real save, on purpose, never reproducible — so a
//   live-flow fixture (done card, session detail on a freshly-saved row)
//   would otherwise fail every run against itself. genId()'s offline
//   fallback shape (`local-<ms>-<8 base36 chars>`) is stubbed the same way.
// - BUILD_DATE (code-shape R1b) is now a real build-time timestamp injected
//   by scripts/build.mjs, not a hand-typed string — every `npm run build`
//   changes it even with zero source changes, so the version tag ("v54 ·
//   Sep 27 · 23:02" on Home, "Build v54 · Sep 27, 2026 · 22:04." on
//   Settings) would otherwise fail every re-build. Only the DATE/TIME half
//   is stubbed; the version number itself stays real and checkable.
function normalize(html: string): string {
  return html
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'GOLDEN-STUB-UUID')
    .replace(/local-\d+-[a-z0-9]{8}/gi, 'GOLDEN-STUB-LOCAL-ID')
    .replace(/[A-Z][a-z]{2} \d{1,2}(?:,\s*\d{4})? · \d{2}:\d{2}/g, 'GOLDEN-STUB-BUILD-DATE')
    .replace(/>\s+</g, '><')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

async function snapshot(page: Page, name: string): Promise<void> {
  const appHtml = await page.locator('#app').innerHTML();
  let combined = normalize(appHtml);
  // The quit-confirm panel lives outside #app (decision doc "Inside app.ts" —
  // "1 panel living outside #app"). It's only ever created on demand, so most
  // fixtures never have it; captured when a fixture happens to have opened it.
  const panel = page.locator('#quit-confirm-panel');
  if (await panel.count()) {
    combined += '\n<!-- quit-confirm-panel -->\n' + normalize(await panel.innerHTML());
  }

  const file = path.join(GOLDEN_DIR, `${name}.html`);
  if (UPDATE) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, combined, 'utf8');
    return;
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Golden fixture missing: tests/golden/${name}.html. ` +
        `Run "npm run golden:update" to create it — checker-only, with a written reason.`
    );
  }
  const expected = fs.readFileSync(file, 'utf8');
  expect(
    combined,
    `golden HTML diff for "${name}" — a structure-only step must reproduce this byte for byte`
  ).toBe(expected);
}

test.describe('golden HTML — gate 1 (structure-only refactor oracle)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('home — seeded, mid-week', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await snapshot(page, 'home');
  });

  test('pre-log A', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await snapshot(page, 'pre-log-a');
  });

  test('pre-log B', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="B"]').click();
    await snapshot(page, 'pre-log-b');
  });

  test('pre-log C', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="C"]').click();
    await snapshot(page, 'pre-log-c');
  });

  test('pre-log D', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await snapshot(page, 'pre-log-d');
  });

  test('workout — a strength step (a plain resistance exercise)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    // No ride seeded for THIS fixture on purpose: an elliptical ride in
    // history pre-selects "last lane used", so Workout A's cardio step opens
    // straight into the elliptical (and its ride-numbers screen) instead of
    // the plain 3-way lane choice — found by tracing this fixture step by
    // step (tests/_debug-a.spec.ts, since deleted) after it hung on exactly
    // that screen. A clean history + "Skip cardio today" (#ww-skip) is the
    // simple, deterministic way past cardio to a real resistance move.
    await seed(page, [log('golden-s1', '2026-09-20', 'A')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    // Same forward controls + hold-to-skip-rest handling as tests/app.spec.ts's
    // own "every phase that renders an Exercise" walk (line ~1810) — proven
    // against this exact program. Program content still shifts week to week,
    // so this stops at the first PLAIN (non-cardio) exercise name rather than
    // hardcoding which one or how many taps.
    const CARDIO_NAMES = ['Cardio', 'Elliptical', 'Apartment cardio', 'Outdoor walk'];
    for (let i = 0; i < 30; i++) {
      const name = (
        await page
          .locator('.exercise-name')
          .textContent()
          .catch(() => null)
      )?.trim();
      if (name && !CARDIO_NAMES.includes(name)) break;
      const forward = page.locator('button:has-text("Done ·"), #start-round-2, #ww-skip');
      if (await forward.isVisible().catch(() => false)) {
        await forward.click();
        continue;
      }
      const skipRest = page.locator('#skip-rest');
      if (await skipRest.isVisible().catch(() => false)) {
        const box = await skipRest.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
        }
        continue;
      }
      break;
    }
    const finalName = (await page.locator('.exercise-name').textContent())?.trim() ?? '';
    expect(CARDIO_NAMES).not.toContain(finalName);
    await snapshot(page, 'workout-strength-step');
  });

  test('ride step — before start (Workout D)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await expect(page.locator('.timer-display')).toHaveText('30:00');
    await snapshot(page, 'ride-before');
  });

  test('ride step — running', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 5 * 60_000); // 5 minutes into a 30-minute ride
    // Found by direct inspection (scratch-debug-ride.mjs): a RUNNING ride
    // swaps the pre-start `.timer-display` for a compact "ride-now" card +
    // `#timer-pip` (its aria-label carries "25:00 left") — a different
    // bespoke mechanism from the pre-start preview, not the same element
    // with new text. The 1 Hz rAF render loop needs one real tick to redraw
    // at the new (mocked) instant — waiting for the pip's own time to change
    // is the deterministic condition, not a fixed sleep.
    await expect(page.locator('#timer-pip')).not.toHaveAttribute('aria-label', /30:00/);
    await snapshot(page, 'ride-running');
  });

  test('ride step — after (done, before Save · Next)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 30 * 60_000 + 2_000);
    await expect(page.locator('.timer-done')).toHaveText('✓ 30 min done');
    await snapshot(page, 'ride-after');
  });

  test('ride numbers screen', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 30 * 60_000 + 2_000);
    await page.locator('#next').click(); // opens the ride-numbers screen
    await expect(page.locator('#ell-time')).toBeVisible();
    await snapshot(page, 'ride-numbers');
  });

  test('post-log (Quick log)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 30 * 60_000 + 2_000);
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('3.0');
    await page.locator('#ell-kcal').fill('180');
    await page.locator('#ell-pulse').fill('120');
    await page.locator('#next').click(); // D has no cool-down list — straight to Quick log
    await expect(page.locator('text=Quick log')).toBeVisible();
    await snapshot(page, 'post-log');
  });

  test('done card (Home, just after saving)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('button[data-workout="D"]').click();
    await page.locator('#begin').click();
    await page.locator('#start-timed').click();
    await advanceClock(page, 30 * 60_000 + 2_000);
    await page.locator('#next').click();
    await page.locator('#ell-km').fill('3.0');
    await page.locator('#ell-kcal').fill('180');
    await page.locator('#ell-pulse').fill('120');
    await page.locator('#next').click();
    await page.locator('#session-note').fill('Golden fixture note.');
    await page.locator('#save-log').click();
    await expect(page.locator('#home-done-card')).toBeVisible();
    await snapshot(page, 'done-card');
  });

  test('progress', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Progress');
    await snapshot(page, 'progress');
  });

  test('rides page', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    await page.locator('#open-rides').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Your rides');
    await snapshot(page, 'rides-page');
  });

  test('cycle page', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    await page.locator('#open-cycle').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Your cycle');
    await snapshot(page, 'cycle-page');
  });

  test('sessions list (History)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#view-history').click();
    await expect(page.locator('.history-row').first()).toBeVisible();
    await snapshot(page, 'sessions-list');
  });

  test('session detail', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('.history-row').first().click();
    await expect(page.locator('#edit-history-session')).toBeVisible();
    await snapshot(page, 'session-detail');
  });

  test('session detail — edit', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('.history-row').first().click();
    await page.locator('#edit-history-session').click();
    await expect(page.locator('#save-history-edit')).toBeVisible();
    await snapshot(page, 'session-edit');
  });

  test('weekly review', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#open-weekly-review').click();
    await expect(page.locator('.screen-header h2, h2')).toBeVisible();
    await snapshot(page, 'weekly-review');
  });

  test('settings', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, SEED_LOGS);
    await page.goto('/');
    await page.locator('#open-settings').click();
    await snapshot(page, 'settings');
  });

  // R1 · fix r1 (should, Sep 27 2026): the six sub-views CHECK-code-shape-R1
  // flagged as missing — the ones R13 will move, so gate 1 couldn't guard
  // them yet. Each confirmed reachable against the live program first
  // (probe-screens.cjs, kept nowhere near this suite — throwaway).

  test('home — empty log (fresh install, no prior session)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    // No seed() call — beforeEach's localStorage.clear() already leaves
    // workout-tracker:logs unset, the real first-open state.
    await page.goto('/');
    await expect(page.locator('#app')).not.toBeEmpty();
    await snapshot(page, 'home-empty');
  });

  test('rest screen (between two main-block moves)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    // Rest defaults to 0 (skipped) — this fixture is the one place that
    // overrides it, so the screen exists to snapshot at all.
    await page.addInitScript(() => {
      window.localStorage.setItem('workout-tracker:setting-rest-sec', '30');
    });
    await seed(page, [log('golden-s1', '2026-09-20', 'A')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await walkWorkoutA(page, ['#skip-rest']);
    await expect(page.locator('#skip-rest')).toBeVisible();
    await snapshot(page, 'rest-screen');
  });

  test('round break (round 1 done, before round 2)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, [log('golden-s1', '2026-09-20', 'A')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await walkWorkoutA(page, ['.round-break-card']);
    await expect(page.locator('.round-break-card')).toBeVisible();
    await snapshot(page, 'round-break');
  });

  test('cool-down list (stretches, after the last round)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, [log('golden-s1', '2026-09-20', 'A')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await walkWorkoutA(page, ['.stretch-card']);
    await expect(page.locator('.stretch-card')).toBeVisible();
    await snapshot(page, 'cooldown-list');
  });

  test('paused overlay', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, [log('golden-s1', '2026-09-20', 'A')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#pause-toggle').click();
    await expect(page.locator('#paused-overlay')).toBeVisible();
    await snapshot(page, 'paused');
  });

  test('step list open (the ☰ jump list)', async ({ page }) => {
    await movableClock(page, NOW_ISO);
    await seed(page, [log('golden-s1', '2026-09-20', 'A')]);
    await page.goto('/');
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    await page.locator('#step-list-open').click();
    await expect(page.locator('#step-list-panel')).toBeVisible();
    await snapshot(page, 'step-list-open');
  });
});
