// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import {
  setupPage,
  NEXT,
  openCue,
  openWeekByWeek,
  mockDate,
  TESTS_DIR as __dirname,
} from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// --- Multi-week PROGRAM (2026-05-15) ---------------------------------------
//
// The single static WORKOUTS record was replaced by a PROGRAM: WeekPlan[]
// array with weeks 1-4. Today's date picks which week is active. These tests
// lock in: weeks 1-4 exist, the right week is chosen for May 16-22 (Week 3)
// and May 23-29 (Week 4), the Week badge shows on pre-log, and the
// "Coming next week" preview renders on home with an open diff.
test('multi-week: pre-log overview shows Week 3 badge in May 16-22 range', async ({ page }) => {
  await mockDate(page, '2026-05-18T10:00:00.000Z'); // Mon May 18 = Week 3
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // v48 · P5: the week leads the pre-log's one quiet line (was a badge).
  await expect(page.locator('.prelog-meta')).toHaveText(/^Week 3 · /);
});

test('multi-week: Week 4 content active for May 25 (Session A holds — squats 12, plank 1x15s)', async ({
  page,
}) => {
  await mockDate(page, '2026-05-25T10:00:00.000Z'); // Mon May 25 = Week 4
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // The quiet line says Week 4 (v48 · P5: was a badge).
  await expect(page.locator('.prelog-meta')).toHaveText(/^Week 4 · /);
  // Open "What's in it" and verify Week 4 numbers are encoded (v48 · P5: one
  // fold; the phases list their moves inside it).
  await page.locator('.prelog-overview-summary').click();
  const mainNames = await page
    .locator('.overview-phase')
    .nth(1)
    .locator('.overview-phase-items')
    .innerText();
  // Forearm plank still in the pool (replaced heel taps in Week 3 — should
  // persist in Week 4). And Bodyweight squats present.
  expect(mainNames).toContain('Forearm plank');
  expect(mainNames).toContain('Bodyweight squats');
  // Walk into the workout and check Session A HELD at Week-3 numbers (decision
  // 2026-05-21: hold A, bump only B & C). Squats stay at 12, not 14.
  await page.locator('button:has-text("Start")').click();
  // Tap through warmup (4 exercises) to reach Main → Squats.
  for (let i = 0; i < 4; i++) {
    await page.locator(NEXT).click();
  }
  await expect(page.locator('.exercise-name')).toHaveText('Bodyweight squats');
  await expect(page.locator('.exercise-reps')).toContainText('12');
});

// v48 · P4 (Sep 24 2026): the preview moved from home to Progress › Program.
test('multi-week: "Coming next week" preview renders in Progress with diff', async ({ page }) => {
  await mockDate(page, '2026-05-18T10:00:00.000Z'); // Week 3 — next is Week 4
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.program-archive-label')).toHaveText('Program');
  // First preview is the immediate-next week. Multiple may render for future weeks.
  const preview = page.locator('.next-week-preview').first();
  await expect(preview).toBeVisible();
  await expect(preview.locator('.next-week-summary-label')).toHaveText('Coming next week');
  // Caption shows when next week starts.
  await expect(preview.locator('.next-week-summary-meta')).toContainText('Week 4');
  // Expand and check the diff. Decision 2026-05-21: Session A HOLDS, only B & C
  // bump — so Workout A reads "unchanged" and the bump (leg raises → 14) lives
  // in Workout B.
  await preview.locator('.next-week-summary').click();
  const aBlock = preview.locator('.next-week-block').nth(0);
  await expect(aBlock.locator('.next-week-block-title')).toContainText('Workout A');
  await expect(aBlock.locator('.next-week-block-empty')).toContainText('unchanged');
  const bBlock = preview.locator('.next-week-block').nth(1);
  await expect(bBlock.locator('.next-week-block-title')).toContainText('Workout B');
  // Week 3 leg raises 12 → Week 4 14 should be in Workout B's list.
  await expect(bBlock.locator('.next-week-block-list')).toContainText('14');
});

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Settings › About": "Program
// weeks: 15" becomes "Round 2 · Week 5" once "now" is past the completion
// launch — real "now" always is, so this replaces the old always-live
// assertion; the pre-launch behavior it used to cover gets its own test
// right below, with mockDate pinning "now" to before the launch.
test('Settings About: post-launch shows the completion model’s own Round/Week, not a raw program-week count', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#open-settings').click();
  await expect(page.locator('.settings-screen')).toBeVisible();
  const row = page.locator('.settings-about-row').filter({ hasText: 'Round 2' });
  await expect(row.locator('.settings-row-title')).toHaveText('Round 2 · Week 5');
  await expect(row.locator('.settings-row-caption')).toHaveText('since Aug 29');
  await expect(
    page.locator('.settings-about-row').filter({ hasText: 'Program weeks' })
  ).toHaveCount(0);
});

test('multi-week: Settings About shows Program weeks count (17) — pre-launch, unchanged', async ({
  page,
}) => {
  await mockDate(page, '2026-09-22T10:00:00.000Z'); // Tue Sep 22 2026 — before the launch, Week 4
  await page.goto('/');
  await page.locator('#open-settings').click();
  await expect(page.locator('.settings-screen')).toBeVisible();
  // About section has a "Program weeks: 16" row
  // (11 round-1 weeks + R2 W1 + R2 W2 + R2 W3 + R2 W4 + R2 W5 (v52.2, Sep 26 2026)
  // + R2 W6 (v61.2, Oct 13 2026 — the light restart after being sick)).
  await expect(
    page.locator('.settings-about-row').filter({ hasText: 'Program weeks' })
  ).toContainText('Program weeks: 17');
});

test('multi-week: home week-banner reads Week 3 for May 16-22 range', async ({ page }) => {
  await mockDate(page, '2026-05-20T10:00:00.000Z'); // Wed in Week 3
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 3');
});

test('sick week Jul 11-17 holds a blank slot and Jul 18-24 is Week 11', async ({ page }) => {
  // Her calls Jul 17+19 2026: the sick week stays blank and doesn't count
  // ("it should be week 11" + "show a space for the missing week").
  await mockDate(page, '2026-07-19T10:00:00.000Z'); // Sun in the resume week
  await page.goto('/');
  // Banner: the skipped week doesn't advance the count — Week 11, not 12.
  await expect(page.locator('.home-header h1')).toContainText('Week 11');
  // The weekly grid keeps a visible row for the missed week, labeled Sick,
  // with all 3 slots empty. (v48 · P4: Weekly review › Week by week.)
  await openWeekByWeek(page);
  const sickRow = page.locator('.weekly-row').filter({ hasText: 'Sick' });
  await expect(sickRow).toHaveCount(1);
  await expect(sickRow.locator('.weekly-slot-empty')).toHaveCount(3);
});

test('home order: the workout sits first; the week-by-week list is collapsed in Weekly review', async ({
  page,
}) => {
  // Her call Aug 30 2026: "consistency should be collapsible and the
  // workouts should be first." v48 · P4 (DECISIONS Q3): the list moved off
  // home into Weekly review, still collapsed; home keeps the one week line.
  await page.goto('/');
  await expect(page.locator('.consistency-wrap')).toHaveCount(0);
  const heroBox = await page.locator('.home-hero').boundingBox();
  const weekBox = await page.locator('.week-card').boundingBox();
  expect(heroBox!.y).toBeLessThan(weekBox!.y);
  // WK2 (Sep 27 2026): see the "zero sessions" test's own comment above.
  // v61 (Sep 28 2026), spec item d: "of 4" now.
  await expect(page.locator('.week-line')).toContainText('of 4 · A, B and C to go');
  await page.locator('#open-weekly-review').click();
  const wrap = page.locator('.consistency-wrap');
  await expect(wrap).toHaveJSProperty('open', false);
  await expect(wrap.locator('.next-week-summary-label')).toHaveText('Week by week');
});

// v53 (Sep 26 2026) Tips audit: her words, "Cue in the app? It says to cue
// something, that seems to do nothing" — the fold worked, the label and the
// program bookkeeping leaking through it didn't. Scans every exercise `notes`
// string the app can show (PROGRAM's every week/round in app.ts + every rung
// in ladders.ts) and fails on the PROGRAM-not-movement tells: another
// workout letter, "keeps its", a stale number ("was N"), a version tag, or a
// week number. Reading straight from source, not a live page, so it covers
// past/future weeks too — not just whatever week today happens to land on.
test('Tips audit: no exercise notes string leaks PROGRAM bookkeeping instead of movement guidance', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const bannedPatterns: [RegExp, string][] = [
    [/\b(in|for) [ABC]\b/, 'references another workout (in/for A|B|C)'],
    [/keeps its/i, '"keeps its" (program comparison)'],
    [/\bwas \d/, '"was N" (stale-number bookkeeping)'],
    [/\bv\d{2}\b/, 'a version tag (vNN)'],
    [/week \d/i, 'a week number'],
    // v53 fix (CHECK M6, Sep 26 2026): the 6 patterns that let R2 Week 2's
    // citation text ("81% MVIC, best of 12 tested — DiStefano 2009") and
    // program-comparison tells ("stays exactly as it is", "the change is
    // EFFORT") through — the gate was green while she'd have read them.
    [/MVIC/, 'a study measure (MVIC)'],
    [/\d+%/, 'a percentage (study data)'],
    [/best of \d+ tested/i, 'a study-selection citation'],
    [/\b[A-Z][a-z]+ (19|20)\d{2}\b/, 'a Name-YYYY citation'],
    [/stays exactly as it is/i, 'a program-comparison tell'],
    [/the change is/i, 'a program-comparison tell'],
  ];
  const noteRe = /notes:\s*\n?\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const offenders: string[] = [];
  for (const file of ['app.ts', 'ladders.ts']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = noteRe.exec(src))) {
      const text = m[2]!;
      const line = src.slice(0, m.index).split(/\r?\n/).length;
      for (const [re, why] of bannedPatterns) {
        if (re.test(text)) offenders.push(`${file}:${line} — ${why} — "${text}"`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

// code-shape R1b (Sep 27 2026): both deploy-hygiene tests below moved from
// "every dist/*.js module is hand-listed in sw.js twice" (the M1 bug class —
// see the old comment this replaced, kept in git history) to the new
// invariant: ONE esbuild bundle, its name known only through dist/build-
// info.js, read by sw.js at runtime via importScripts. There is no longer a
// per-module list to drift out of sync — this instead guards that the build
// actually produced what sw.js expects, and that no hand-listed dist/*.js
// entry ever creeps back in.
test('deploy hygiene: sw.js precaches exactly the bundle dist/build-info.js names', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const distDir = path.join(__dirname, '..', 'dist');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

  expect(swSrc).toContain("importScripts('./dist/build-info.js')");

  const buildInfoPath = path.join(distDir, 'build-info.js');
  expect(fs.existsSync(buildInfoPath), 'dist/build-info.js — run "npm run build" first').toBe(true);
  const buildInfoSrc = fs.readFileSync(buildInfoPath, 'utf8');
  const bundle = /"bundle":"([^"]+)"/.exec(buildInfoSrc.replace(/\s+/g, ''))?.[1];
  expect(bundle).toBeTruthy();
  expect(
    fs.existsSync(path.join(distDir, bundle!)),
    `dist/${bundle} — the built bundle itself`
  ).toBe(true);

  // Guard against the OLD pattern quietly coming back: a hand-listed
  // 'dist/<name>.js' string literal other than build-info.js itself.
  const handListed = [...swSrc.matchAll(/'\.\/dist\/([\w.-]+\.js)'/g)]
    .map((m) => m[1]!)
    .filter((name) => name !== 'build-info.js');
  expect(handListed).toEqual([]);
});

test('deploy hygiene: version is single-sourced (package.json → build-info.js → sw.js, never hand-typed)', () => {
  // v25 shipped with sw.js still saying v24 — an installed PWA then kept the
  // old cache name and the new build didn't visibly land on her phone. R1b
  // fixes the ROOT cause (3 places to edit) instead of re-checking the
  // symptom: package.json's "appVersion" is the one place a bump happens.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
    appVersion?: string;
  };
  expect(pkg.appVersion).toBeTruthy();

  const buildInfoPath = path.join(__dirname, '..', 'dist', 'build-info.js');
  expect(fs.existsSync(buildInfoPath), 'dist/build-info.js — run "npm run build" first').toBe(true);
  const buildInfoSrc = fs.readFileSync(buildInfoPath, 'utf8');
  expect(buildInfoSrc).toContain(`"version":"${pkg.appVersion}"`.replace(/\s+/g, ''));

  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  // sw.js must read the version at RUNTIME, never a literal 'workout-tracker-vNN'.
  expect(swSrc).toContain('workout-tracker-${BUILD_INFO.version}');
  expect(/workout-tracker-v\d/.test(swSrc)).toBe(false);
  // R1 · fix r1 (must #1, Sep 27 2026): the shell cache name must fold in the
  // bundle name too, not just appVersion — a code-shape deploy never bumps
  // appVersion, so version-only keying let two different builds share (and
  // corrupt) one cache. See tests/sw-upgrade.spec.ts's "same-appVersion"
  // tests for the behavioural proof; this is the structural guard against it
  // silently regressing back to version-only.
  expect(swSrc).toContain('workout-tracker-${BUILD_INFO.version}-${BUILD_INFO.bundle}-shell');

  const bundleMatch = /"bundle":"([^"]+)"/.exec(buildInfoSrc.replace(/\s+/g, ''))?.[1];
  const bundleSrc = fs.readFileSync(path.join(__dirname, '..', 'dist', bundleMatch!), 'utf8');
  // Proves esbuild's --define actually ran against THIS build, not a stale one.
  expect(bundleSrc.includes(pkg.appVersion!)).toBe(true);
});

test("deploy hygiene: index.html's <script src> matches dist/build-info.js's bundle", () => {
  // R1 CHECK (round 2) SHOULD 3: before this, a wrong-hash index.html only
  // failed loudly because every UI test went red (a real repro: pointing
  // index.html at a wrong hash still passed the two hygiene tests above). One
  // explicit assertion names the actual invariant instead of relying on that
  // louder, less clear failure.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const buildInfoPath = path.join(__dirname, '..', 'dist', 'build-info.js');
  expect(fs.existsSync(buildInfoPath), 'dist/build-info.js — run "npm run build" first').toBe(true);
  const buildInfoSrc = fs.readFileSync(buildInfoPath, 'utf8');
  const bundle = /"bundle":"([^"]+)"/.exec(buildInfoSrc.replace(/\s+/g, ''))?.[1];
  expect(bundle).toBeTruthy();

  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scriptSrc = /<script type="module" src="dist\/([\w.-]+\.js)">/.exec(indexSrc)?.[1];
  expect(scriptSrc).toBe(bundle);
});

test('round 2: banner reads Round 2 · Week 1 from Aug 29 2026 and restart numbers are live', async ({
  page,
}) => {
  // Her call Aug 30 2026: past data = a closed chapter (archived, pullable);
  // a new round starts. Week numbers restart at 1; the restart week is the
  // compact 2-round version with pulled-back numbers.
  await mockDate(page, '2026-08-30T15:00:00.000Z'); // Sun in R2 Week 1
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Round 2 · Week 1');
  // The pre-log's quiet line carries the round too (v48 · P5: was a badge).
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.prelog-meta')).toHaveText(/^R2 · Week 1 · /);
});

test('round 2: break weeks Jul 25–Aug 28 hold blank labeled rows, round-1 weeks keep plain labels', async ({
  page,
}) => {
  await mockDate(page, '2026-08-30T15:00:00.000Z');
  await page.goto('/');
  // Consistency is collapsed by default (v26) — expand it to see the rows.
  // (v48 · P4: in Weekly review.)
  await openWeekByWeek(page);
  // Five Break rows, each with 3 empty slots (nothing logged over the summer).
  const breakRows = page.locator('.weekly-row').filter({ hasText: 'Break' });
  await expect(breakRows).toHaveCount(5);
  // Round-1 rows keep their old plain "Wk N" labels (no R1 prefix).
  await expect(page.locator('.weekly-row-label', { hasText: /Wk 10 ·/ }).first()).toBeVisible();
  await expect(page.locator('.weekly-row-label', { hasText: /R1/ })).toHaveCount(0);
});

test('walk credit: start/stop timer logs a walk, bumps week count, streak untouched', async ({
  page,
}) => {
  // Jul 4 2026 — her Jun-18 ask, upgraded same night to her timer idea
  // ("click walking and you automatically start tracking until I tell you
  // I'm done"). Walks are extra credit: the "of 3 this week" streak number
  // must NOT move when a walk is logged.
  // v48 · P4: the count is in home's one week line now.
  const streakBefore = await page.locator('.week-line').textContent();
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  await page.locator('#log-walk-start').click();
  // v48 · P3: minutes only — "Walking · 0 min" (was "Walking since 18:02 · …").
  await expect(page.locator('#walk-live')).toHaveText(/^Walking · \d+ min$/);
  await expect(page.locator('#finish-walk')).toBeVisible();
  await page.locator('#finish-walk').click();
  await expect(page.locator('.walk-text')).toContainText('1 this week');
  await expect(page.locator('.week-line')).toHaveText(streakBefore ?? '');
  // A second walk works the same way — repeat laps are legitimate.
  await page.locator('#log-walk-start').click();
  await page.locator('#finish-walk').click();
  await expect(page.locator('.walk-text')).toContainText('2 this week');
});

test('in-workout walk: does NOT auto-start on the step — needs an explicit Start tap', async ({
  page,
}) => {
  // Allison Jul 9 2026: "just because I'm on the page doesn't mean it started
  // walking." Landing on the Outdoor-walk step (workout A's first exercise) must
  // NOT begin tracking or stamp a start; only tapping Start does.
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click(); // pre-log Start
  // On the walk step: the Start button is shown, nothing is tracking yet.
  await expect(page.locator('#ww-start')).toBeVisible();
  await expect(page.locator('#walk-live')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))).toBeNull();
  // Tap Start → tracking begins and the start is stamped.
  await page.locator('#ww-start').click();
  await expect(page.locator('#walk-live')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('workout-tracker:ww-start'))
  ).not.toBeNull();
});

test('lite day: pre-log toggle drops one round and marks the session lite', async ({ page }) => {
  // Allison Jul 12 2026 (from the Jul-9 deep-dive): a low-energy day needs a real
  // mechanic, not advice — tap Lite on pre-log → one round less (C: 2→1), streak
  // intact. The round indicator carries the "lite" tag.
  await page.locator('button[data-workout="C"]').click();
  await expect(page.locator('#lite-toggle')).toBeVisible();
  await page.locator('#lite-toggle').click();
  // v48 · P5: the chip says what Lite is today, and how to undo it.
  await expect(page.locator('#lite-toggle')).toHaveText('✓ Lite · 1 round today · tap to undo');
  await page.locator('button:has-text("Start")').click();
  // C's warmup is the walk step — advance past it into the main block.
  await page.locator(NEXT).click();
  // v48: one progress line — "Main · Round 1 of 1 · lite".
  await expect(page.locator('.round-indicator')).toContainText('Main · Round 1 of 1 · lite');
});

test('walk: Cancel discards an opened walk without logging it', async ({ page }) => {
  // Allison Jul 9 2026: "only log walks where i finish the walk — if i just
  // open [it] to check, [it] doesn't count." Cancel is the non-logging exit.
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  await page.locator('#log-walk-start').click();
  await expect(page.locator('#finish-walk')).toBeVisible();
  await expect(page.locator('#cancel-walk')).toBeVisible();
  await page.locator('#cancel-walk').click();
  // Back to the start state, and NOTHING logged.
  await expect(page.locator('#log-walk-start')).toBeVisible();
  await expect(page.locator('.walk-text')).not.toContainText('this week');
  const walks = await page.evaluate(() => localStorage.getItem('workout-tracker:walks'));
  expect(walks === null || (JSON.parse(walks) as unknown[]).length === 0).toBeTruthy();
});

test.describe('walk distance (GPS granted)', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 31.771, longitude: 35.2137 },
  });

  test('v48 · P3: a walk is minutes only — GPS movement shows no km and saves no meters', async ({
    page,
    context,
  }) => {
    // Jul 4 2026 her call was GPS distance; Sep 7 her words were "walk counter
    // not important now", and the numbers never matched Fit (3 steps in 29 min,
    // 16 m in 12 min). v48 archives the sensors: even with GPS granted and the
    // phone moving ~55 m a hop, nothing but minutes shows, and nothing else saves.
    await page.locator('#log-walk-start').click();
    await expect(page.locator('#walk-live')).toHaveText(/^Walking · \d+ min$/);
    await context.setGeolocation({ latitude: 31.7715, longitude: 35.2137 });
    await context.setGeolocation({ latitude: 31.772, longitude: 35.2137 });
    await page.waitForTimeout(500);
    await expect(page.locator('.walk-card')).not.toContainText('km');
    await expect(page.locator('.walk-card')).not.toContainText(/steps/i);
    await page.locator('#finish-walk').click();
    await expect(page.locator('.walk-text')).toContainText('1 this week');
    const walks = JSON.parse(
      (await page.evaluate(() => localStorage.getItem('workout-tracker:walks'))) ?? '[]'
    ) as { minutes: number | null; meters: number | null; steps: number | null }[];
    expect(walks[0]?.minutes).toBeGreaterThanOrEqual(1);
    expect(walks[0]?.meters).toBeNull();
    expect(walks[0]?.steps).toBeNull();
  });
});

// --- Round 2 · Week 2 (Sep 5-11 2026) --------------------------------------
//
// "Harder versions, not reps" — her ask Sep 7: "ok but its not always about
// adding its abut tehactual execrises". These lock in the three real changes
// (the plank held WITH a posterior pelvic tilt, the modified dead bug
// graduating to the full one in A + B, and bird dog legs-only as the first
// hands-on-floor move since April), the deeper wall sit, and the fact that C
// deliberately stays on the modified dead bug.
test('R2 W2: a date inside Sep 5-11 2026 resolves to Round 2 · Week 2', async ({ page }) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z'); // Tue inside Sep 5-11
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Round 2 · Week 2');
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('.prelog-meta')).toHaveText(/^R2 · Week 2 · /); // v48 · P5
});

test('R2 W2: workout A carries the full dead bug, bird dog legs-only, the tilted plank and a 40 s wall sit', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  // The overview lists every phase's exercise names (textContent is in the DOM
  // whether or not the <details> is open).
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Full dead bug');
  expect(overview).toContain('Bird dog (legs only)');
  expect(overview).toContain('Forearm plank');
  expect(overview).toContain('Wall sit');
  // The modified version is GONE from A — it graduated.
  expect(overview).not.toContain('Modified dead bug');

  // Walk into the session and read the actual step content.
  await page.locator('button:has-text("Start")').click();
  const seen: Record<string, string> = {};
  for (let i = 0; i < 40; i++) {
    // Short timeouts: several steps legitimately have no notes element, and the
    // default 30 s auto-wait would burn the whole test budget on them.
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name) {
      await openCue(page);
      const notes =
        (await page
          .locator('.exercise-notes')
          .first()
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      const reps =
        (await page
          .locator('.exercise-reps')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      seen[name] = `${reps} :: ${notes}`;
    }
    if (seen['Forearm plank']) break;
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }

  await expect(page.locator('.exercise-name')).toHaveText('Forearm plank');
  // Wall sit: 40 s, and the cue is DEEPER not longer. v53 fix (CHECK M6, Sep
  // 26 2026): "You held 38 s last week" was program-comparison talk, not
  // movement guidance — moved to a PROGRAM comment (Tips audit).
  expect(seen['Wall sit']).toContain('40 sec');
  expect(seen['Wall sit']).toContain('DEEPER, not longer');
  expect(seen['Wall sit']).not.toContain('38 s');
  // Forearm plank: same 20 s, held WITH a posterior pelvic tilt.
  expect(seen['Forearm plank']).toContain('20 sec');
  expect(seen['Forearm plank']).toContain('posterior pelvic tilt');
  expect(seen['Forearm plank']).toContain('tailbone');
  // Full dead bug: opposite arm overhead, 8 each side.
  expect(seen['Full dead bug']).toContain('8 each side');
  expect(seen['Full dead bug']).toContain('OPPOSITE ARM');
});

test('R2 W2: workout C stays on the MODIFIED dead bug (no full dead bug, no bird dog)', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  await page.goto('/');
  await page.locator('button[data-workout="C"]').click();
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Modified dead bug');
  expect(overview).not.toContain('Full dead bug');
  // C is the cardio day — no upper-back block, so no bird dog either.
  expect(overview).not.toContain('Bird dog');
});

test('R2 W2: bird dog legs-only sits at the END of the upper-back block in A and B', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z');
  for (const id of ['A', 'B']) {
    await page.goto('/');
    await page.locator(`button[data-workout="${id}"]`).click();
    const upperBack = await page
      .locator('.overview-phase')
      .filter({ hasText: 'Upper back' })
      .locator('.overview-phase-items')
      .textContent();
    expect(upperBack ?? '').toMatch(/Wall angels.*IWYT raises.*Bird dog \(legs only\)$/);
  }
});

// Every exercise the week references must carry form guidance, or she lands on
// a bare step mid-workout. The app renders EXERCISE_DETAIL first and falls back
// to EXERCISE_GUIDE, so the UNION is what has to cover the week (several
// long-standing moves — Wall angels, Forearm plank, the stretches — only ever
// got detail cards). Source-level, so it also covers steps a UI walk-through
// would need 40 taps to reach.
test('R2 W2: every exercise name in the week has a detail card or a how-to guide entry', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.join(__dirname, '..');
  const appSrc = fs.readFileSync(path.join(root, 'app.ts'), 'utf8');
  const detailSrc = fs.readFileSync(path.join(root, 'exercise-detail.ts'), 'utf8');

  const weekStart = appSrc.indexOf('// --- ROUND 2 · WEEK 2');
  const weekEnd = appSrc.indexOf('// --- Resolvers', weekStart);
  expect(weekStart).toBeGreaterThan(-1);
  expect(weekEnd).toBeGreaterThan(weekStart);

  // A shared building block's full declaration, found by balanced-bracket scan
  // (string-aware) so single-line and multi-line consts both resolve exactly.
  const declBlock = (id: string): string | null => {
    const head = new RegExp(`\\nconst ${id}\\b[^\\n=]*=\\s*`).exec(appSrc);
    if (!head) return null;
    let i = head.index + head[0].length;
    const open = appSrc[i];
    if (open !== '[' && open !== '{') return null;
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr: string | null = null;
    for (; i < appSrc.length; i++) {
      const ch = appSrc[i] as string;
      if (inStr !== null) {
        if (ch === '\\') i += 1;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return appSrc.slice(head.index, i + 1);
      }
    }
    return null;
  };

  // Collect `name: '...'`, then follow any shared const the block references
  // (WALK_WARMUP_AB, UPPER_BACK_SAFE_R2W2, …). PROGRAM is skipped — that one is
  // every week ever encoded.
  const collect = (block: string, seen: Set<string>, out: Set<string>): void => {
    const code = block
      .replace(/^\s*\/\/.*$/gm, '')
      // Drop the WORKOUT `name:` ("Lower Body + Core") that sits right under
      // `id: 'A'` — those are session titles, not exercises.
      .replace(/id: '[ABC]',\s*\n\s*name: '[^']*',/g, '');
    for (const m of code.matchAll(/name: '((?:[^'\\]|\\.)*)'/g)) {
      out.add((m[1] ?? '').replace(/\\'/g, "'"));
    }
    for (const m of code.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
      const id = m[1] ?? '';
      if (id === 'PROGRAM' || seen.has(id)) continue;
      seen.add(id);
      const decl = declBlock(id);
      if (decl) collect(decl, seen, out);
    }
  };
  const names = new Set<string>();
  collect(appSrc.slice(weekStart, weekEnd), new Set<string>(), names);

  // Sanity: resolution actually reached the shared blocks + the new moves.
  expect(names.has('Full dead bug')).toBe(true);
  expect(names.has('Bird dog (legs only)')).toBe(true);
  expect(names.has('Wall angels')).toBe(true); // via UPPER_BACK_SAFE_R2W2
  expect(names.has('Outdoor walk')).toBe(true); // via WALK_WARMUP_AB
  expect(names.has('Neck stretch')).toBe(true); // via STRETCH_COOLDOWN
  expect(names.size).toBeGreaterThan(20);

  const guideStart = appSrc.indexOf('const EXERCISE_GUIDE');
  const guideBlock = appSrc.slice(guideStart, appSrc.indexOf('\n};', guideStart));
  const keysIn = (src: string): Set<string> =>
    new Set(
      [...src.matchAll(/^ {2}'((?:[^'\\]|\\.)*)': \{/gm)].map((m) =>
        (m[1] ?? '').replace(/\\'/g, "'")
      )
    );
  const guideKeys = keysIn(guideBlock);
  const detailKeys = keysIn(detailSrc);

  const uncovered = [...names].filter((n) => !guideKeys.has(n) && !detailKeys.has(n));
  expect(uncovered).toEqual([]);
  // The two NEW moves carry BOTH — a how-to entry and a full detail card.
  for (const n of ['Full dead bug', 'Bird dog (legs only)']) {
    expect(guideKeys.has(n)).toBe(true);
    expect(detailKeys.has(n)).toBe(true);
  }
  // The apartment-cardio step is a named exercise too, so it needs guidance.
  expect(guideKeys.has('Apartment cardio')).toBe(true);
});
