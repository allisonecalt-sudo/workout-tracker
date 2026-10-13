// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import {
  setupPage,
  mockDate,
  movableClock,
  advanceClock,
  advanceToExercise,
  TESTS_DIR as __dirname,
} from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// v48 · P8 (Sep 24 2026) — the copy + consistency sweep, and the version. Every
// screen of a real Workout A is walked once: no developer words or streak talk
// on her screen, labels readable (>= 4.5:1), one sage action per step, tap
// targets >= 44 px, and the version she checks after a deploy says v48.
test.describe('v48 P8 sweep', () => {
  type Row = Record<string, unknown>;
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4
  const BANNED = ['streak', 'Do a workout', 'app.ts', 'localStorage', 'oEmbed'];
  const SAGE = ['rgb(143, 188, 143)', 'rgb(163, 207, 163)'];

  const log = (id: string, date: string, workout: 'A' | 'B' | 'C'): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: workout === 'A' ? 44 : 0,
    backPain: 0,
    word: '',
    synced: true,
    durationSec: 2400,
  });
  // Two weeks of history, so Sessions, the review and Progress have rows.
  const history = (): Row[] => [
    log('h1', '2026-09-20T15:00:00.000Z', 'C'),
    log('h2', '2026-09-17T15:00:00.000Z', 'B'),
    log('h3', '2026-09-15T15:00:00.000Z', 'A'),
    log('h4', '2026-09-13T15:00:00.000Z', 'C'),
  ];
  const seed = async (page: Page): Promise<void> => {
    await mockDate(page, TUE_WEEK4);
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, history());
    await page.goto('/');
  };

  const appText = (page: Page): Promise<string> =>
    page.evaluate(() => document.getElementById('app')?.textContent ?? '');
  const expectClean = async (page: Page, where: string): Promise<void> => {
    const text = (await appText(page)).toLowerCase();
    for (const word of BANNED) {
      expect(text, `${where}: "${word}"`).not.toContain(word.toLowerCase());
    }
  };

  // Visible elements painted with the sage primary (fill or gradient), plus any
  // .btn-primary — the "one sage per screen" rule.
  // v49 · look fix (Sep 25 2026): this only ever counted .btn-primary +
  // background — it missed sage text/border on a :active press and sage
  // SVG fill/stroke in the how-to illustrations, both real "second sage"
  // violations the Opus check found. Now it checks every paint a sage token
  // can land on: background, text color, border and SVG fill/stroke.
  const sageCount = (page: Page): Promise<string[]> =>
    page.evaluate((sage) => {
      return [...document.querySelectorAll<HTMLElement>('#app *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = getComputedStyle(el);
          return (
            el.classList.contains('btn-primary') ||
            sage.includes(cs.backgroundColor) ||
            sage.some((c) => cs.backgroundImage.includes(c)) ||
            sage.includes(cs.color) ||
            sage.includes(cs.borderTopColor) ||
            sage.includes(cs.fill) ||
            sage.includes(cs.stroke)
          );
        })
        .map((el) => el.id || String(el.className));
    }, SAGE);

  // Every visible tap target under 44 px tall. A switch's hidden checkbox is
  // measured by the row label that carries the tap.
  const smallTargets = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
      const sel = [
        'button',
        'a[href]',
        'select',
        'textarea',
        'summary',
        '[role="button"]',
        '[role="radio"]',
        'input',
      ]
        .map((s) => `#app ${s}`)
        .join(', ');
      return [...document.querySelectorAll<HTMLElement>(sel)]
        .map((el) => (el instanceof HTMLInputElement && el.closest('label')) || el)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        })
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => {
          const h = Math.round(el.getBoundingClientRect().height);
          return `${el.id || String(el.className) || el.tagName} ${h}px`;
        });
    });

  // Walk Workout A from pre-log to the post-log, calling `check` on every step.
  const walkA = async (page: Page, check: (label: string) => Promise<void>): Promise<void> => {
    await page.locator('button[data-workout="A"]').first().click();
    await check('pre-log');
    await page.locator('#begin').click();
    await expect(page.locator('.exercise-name, #start-round-2').first()).toBeVisible();
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Quick log').isVisible()) break;
      const onStep = await page.locator('.exercise-name').first().isVisible();
      const name = onStep ? await page.locator('.exercise-name').first().textContent() : '';
      const isCooldown = await page.locator('.stretch-list').isVisible();
      await check(isCooldown ? 'cool-down' : `step ${i} · ${(name ?? '').trim() || 'round break'}`);
      await page.locator('#next, #ww-skip, #start-round-2').first().click();
    }
    await expect(page.locator('text=Quick log')).toBeVisible();
    await check('post-log');
  };

  test('(a) no "streak", "Do a workout", "app.ts", "localStorage" or "oEmbed" on any screen', async ({
    page,
  }) => {
    await seed(page);
    await expectClean(page, 'home');
    await walkA(page, async (where) => {
      // Open Tips and the video on each step, so the closed text is read too.
      if (where.startsWith('step')) {
        const cue = page.locator('.tips-section .detail-section-toggle[aria-expanded="false"]');
        if (await cue.count()) await cue.first().click();
        const video = page.locator('.visual-video-toggle[aria-expanded="false"]');
        if (await video.count()) await video.first().click();
      }
      await expectClean(page, where);
    });
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    await expectClean(page, 'home after save');
    await page.locator('#view-history').click();
    await expectClean(page, 'Sessions');
    await page.locator('#back-home').click();
    await page.locator('#open-weekly-review .week-card-head').click();
    await expectClean(page, 'weekly review');
    await page.locator('#back-home').click();
    await page.locator('#open-progress-link').click();
    await expectClean(page, 'Progress');
    await page.locator('#back-home').click();
    await page.locator('#open-settings').click();
    await expectClean(page, 'Settings');
  });

  test('(b) label tier (timer label, session meta, review tile label) >= 4.5:1 on its card', async ({
    page,
  }) => {
    await seed(page);
    // Parse "rgb(...)", "rgba(...)" and "color(srgb r g b)" into 0-255 channels.
    const ratio = (sel: string): Promise<number> =>
      page.evaluate((selector) => {
        type RGBA = [number, number, number, number];
        const parse = (c: string): RGBA | null => {
          let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
          if (m) return [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]];
          m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(c);
          if (m) {
            return [+m[1]! * 255, +m[2]! * 255, +m[3]! * 255, m[4] === undefined ? 1 : +m[4]];
          }
          return null;
        };
        const lum = (c: RGBA): number => {
          const f = (v: number): number => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return -1;
        const fg = parse(getComputedStyle(el).color);
        if (!fg) return -1;
        // The card behind it: the nearest ancestor with a solid fill; for a
        // gradient card every stop counts and the worst one is reported.
        const backs: RGBA[] = [];
        for (let a: HTMLElement | null = el; a && !backs.length; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const stops = [...cs.backgroundImage.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))/g)]
            .map((s) => parse(s[0]))
            .filter((s): s is RGBA => s !== null && s[3] > 0.5);
          if (stops.length) {
            backs.push(...stops);
            break;
          }
          const bg = parse(cs.backgroundColor);
          if (bg && bg[3] > 0.5) backs.push(bg);
        }
        if (!backs.length) {
          const body = parse(getComputedStyle(document.body).backgroundColor);
          if (body) backs.push(body);
        }
        const lf = lum(fg);
        return Math.min(
          ...backs.map((b) => {
            const lb = lum(b);
            return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
          })
        );
      }, sel);

    // Sessions: the meta line under each row.
    await page.locator('#view-history').click();
    expect(await ratio('.history-meta')).toBeGreaterThanOrEqual(4.5);
    await page.locator('#back-home').click();
    // Weekly review: a totals tile label.
    await page.locator('#open-weekly-review .week-card-head').click();
    expect(await ratio('.weekly-review-total-lbl')).toBeGreaterThanOrEqual(4.5);
    await page.locator('#back-home').click();
    // A hold: the timer card's label (the wall sit on A).
    await page.locator('button[data-workout="A"]').first().click();
    await page.locator('#begin').click();
    for (let i = 0; i < 20 && !(await page.locator('.timer-label').isVisible()); i++) {
      await page.locator('#next, #ww-skip').first().click();
    }
    expect(await ratio('.timer-label')).toBeGreaterThanOrEqual(4.5);
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(c) every Workout A screen has at most one sage primary', async ({ page }) => {
      await seed(page);
      expect(await sageCount(page), 'home').toHaveLength(1);
      await walkA(page, async (where) => {
        const sage = await sageCount(page);
        expect(sage.length, `${where}: ${sage.join(', ')}`).toBeLessThanOrEqual(1);
      });
    });

    test('(e) every tap target on home, Settings and each Workout A step is >= 44 px tall', async ({
      page,
    }) => {
      await seed(page);
      expect(await smallTargets(page), 'home').toEqual([]);
      await page.locator('#open-settings').click();
      const data = page.locator('details.settings-data > summary');
      if (await data.count()) await data.click();
      expect(await smallTargets(page), 'Settings').toEqual([]);
      await page.locator('#back-home').click();
      await walkA(page, async (where) => {
        expect(await smallTargets(page), where).toEqual([]);
      });
    });
  });

  test('(d) the version: home "<version> · <date, no year>", Settings "Build <version> · <full date>"', async ({
    page,
  }) => {
    // code-shape R1b (Sep 27 2026): APP_VERSION/BUILD_DATE are no longer
    // string literals in app.ts's source (they're `--define`-injected from
    // package.json's "appVersion" + a build-time timestamp — see app.ts's
    // own comment there), so this reads the single source of truth instead
    // of regexing source text. sw.js's version string is covered by its own
    // "deploy hygiene: version is single-sourced" test now — not duplicated
    // here, since this test's own job is the RENDERED text, not the source.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
      appVersion?: string;
    };
    const version = pkg.appVersion;
    const buildInfoSrc = fs.readFileSync(
      path.join(__dirname, '..', 'dist', 'build-info.js'),
      'utf8'
    );
    const built = /"buildDate":"([^"]+)"/.exec(buildInfoSrc)?.[1] ?? '';
    // v61 (Sep 28 2026): no app timer on the elliptical, the always-on ride
    // feel, the derived distance aim, optional pulse, D ✓ today + its dot,
    // the week counting D — a whole-number bump (v51/v52/v53's own shape:
    // sub-versions are same-day fixes, a new number is a new build).
    // v61.1 (Oct 2 2026, CHECK-v61.md round 3 fix): a same-day dotted bump —
    // D on the closing Sat/Sun stays in its own week, one window for both
    // the count and the dots.
    // v61.2 (Oct 13 2026): R2 Week 6 — the light restart after being sick.
    expect(version).toMatch(/^v\d+(\.\d+)*$/);
    expect(built).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{2}:\d{2}$/);
    await expect(page.locator('.app-version')).toHaveText(
      `${version} · ${built.replace(/,\s*\d{4}/, '')}`
    );
    await page.locator('#open-settings').click();
    await expect(page.locator('#app')).toContainText(`Build ${version} · ${built}`);
  });
});

test('v60: wall lean multi-set hold — Set 1 ✓, Start set 2, both sets done turns Next sage, Redo keeps the max', async ({
  page,
  context,
}) => {
  await movableClock(page, '2026-09-22T14:00:00.000Z', { skipPreCountdown: true }); // TUE, R2 Week 4
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await advanceToExercise(page, 'Wall lean (wrist on-ramp)');

  // Ready face — nothing held yet this step.
  await expect(page.locator('#start-timed')).toBeVisible();
  await expect(page.locator('#hold-set-next')).toHaveCount(0);
  await expect(page.locator('#next')).toHaveClass(/btn-done-quiet/); // not ready — quiet

  // Set 1: run the full 20 s.
  await page.locator('#start-timed').click();
  await advanceClock(page, 20_000);
  await expect(page.locator('.timer-label')).toHaveText('Set 1 ✓');
  await expect(page.locator('.timer-done')).toHaveText('20 s');
  const startSet2 = page.locator('#hold-set-next');
  await expect(startSet2).toHaveText('Start set 2');
  await expect(startSet2).toHaveClass(/btn-primary/); // the ONE sage action on this screen
  await expect(page.locator('#hold-redo')).toHaveText('↻ Redo set 1');
  await expect(page.locator('#next')).toHaveClass(/btn-done-quiet/); // still not ready — one set isn't both

  // v61 (Sep 28 2026), checker's carry-over k (v60 round-2 should #6): "the
  // resume fix has no test" — heldSetsFor is carried in the resume snapshot
  // (v60 commit 9a206ba) so set 1 survives an app close, but nothing ever
  // proved that. NOT a literal `page.reload()` (the task's own wording) — this
  // file's beforeEach installs a localStorage.clear() addInitScript that
  // RE-FIRES on every navigation of the same page, wiping storage before the
  // app's own restore runs (see "reload on the numbers screen restores it"
  // below, same file, same gotcha, already solved this way). `context.newPage()`
  // is this file's own established "simulate a real reopen" pattern.
  const reopened = await context.newPage();
  await movableClock(reopened, '2026-09-22T14:00:00.000Z', { skipPreCountdown: true });
  await reopened.goto('/');
  await expect(reopened.locator('.timer-label')).toHaveText('Set 1 ✓');
  await expect(reopened.locator('.timer-done')).toHaveText('20 s');
  await expect(reopened.locator('#hold-set-next')).toHaveText('Start set 2');
  await reopened.close();

  // Set 2: a shorter hold (12 s, cut short on purpose) — the face reports
  // EACH set's own seconds. A shorter-than-prescribed hold only exists via
  // the real Stop path (the running pip → its sheet → #stop-timed) — letting
  // the clock run to the full 20 s would just auto-finish at 20, same as set
  // 1, and never exercise "her own real seconds" (stopTimedHold's own why).
  await startSet2.click();
  await advanceClock(page, 12_000);
  await page.locator('#timer-pip').click();
  await page.locator('#stop-timed').click();
  await expect(page.locator('.timer-label')).toHaveText('Done');
  await expect(page.locator('.timer-done')).toHaveText('2 sets ✓ · 20 s · 12 s');
  await expect(page.locator('#hold-set-next')).toHaveCount(0); // nothing left to start
  await expect(page.locator('#hold-redo')).toHaveText('↻ Redo set 2');
  await expect(page.locator('#next')).toHaveClass(/btn-primary/); // BOTH sets done — Next turns sage
  await expect(page.locator('#next')).not.toHaveClass(/btn-done-quiet/);

  // Redo set 2 with a SHORTER hold (5 s, stopped the same way) — recordHeldSet's
  // max rule keeps 12 s, never erasing the real one she already banked.
  await page.locator('#hold-redo').click();
  await advanceClock(page, 5_000);
  await page.locator('#timer-pip').click();
  await page.locator('#stop-timed').click();
  await expect(page.locator('.timer-done')).toHaveText('2 sets ✓ · 20 s · 12 s');
});

// v49 · look fix (Sep 25 2026): the self-hosted DM Sans ships no tabular
// figures — font-variant-numeric: tabular-nums was a no-op on it, so every
// centred running timer shifted sideways digit to digit. Fixed by giving
// timer digits a system-font fallback that DOES carry tnum (--font-numeric).
// This measures two same-length strings with maximally different digit
// shapes off the live .timer-display CSS — no width drift means the digits
// are truly fixed-width, not just visually close.
test('v49 · look fix: .timer-display renders tabular digits — "1:11" and "0:00" measure the same width', async ({
  page,
}) => {
  await page.goto('/');
  const widths = await page.evaluate(async () => {
    await document.fonts.ready;
    const measure = (text: string): number => {
      const el = document.createElement('div');
      el.className = 'timer-display';
      el.style.position = 'absolute';
      el.style.visibility = 'hidden';
      el.style.left = '-9999px';
      el.textContent = text;
      document.body.appendChild(el);
      const w = el.getBoundingClientRect().width;
      el.remove();
      return w;
    };
    return { a: measure('1:11'), b: measure('0:00'), c: measure('8:88') };
  });
  expect(Math.abs(widths.a - widths.b)).toBeLessThanOrEqual(1); // sub-pixel rounding only
  expect(Math.abs(widths.a - widths.c)).toBeLessThanOrEqual(1);
});
