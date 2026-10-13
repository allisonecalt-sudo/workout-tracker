// Shared helpers for tests/screens/*.spec.ts and tests/golden.spec.ts.
// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1,
// Oct 13 2026): every top-level const/function of the old file, exported, plus
// setupPage (the old top-level beforeEach). Registers no test.* hook.
import { expect, type BrowserContext, type Page } from '@playwright/test';

// The old specs resolved repo files with __dirname + ".." (tests/ -> repo root).
// Specs now live one folder deeper, so they import this under that name.
export const TESTS_DIR = __dirname;

// code-shape step 1b-2 (Oct 13 2026): NO TEST READS THE REAL CLOCK. A test on
// the wall clock silently changes meaning as the calendar moves (Oct 13 sits
// after the Oct 3-9 Sick week the app now knows about). Every context gets a
// SHIFTED-BUT-RUNNING clock: Date starts at TEST_NOW_ISO and then flows at
// real speed, so the app's timers, rAF loop and the hold-to-skip's
// `Date.now() - holdStart` (700 ms) behave exactly as in production. The
// offset (TEST_NOW minus Node's real now) is fixed once per context, so a
// reopened page / context.newPage() continues the same clock instead of
// restarting at TEST_NOW. mockDate (frozen) and movableClock (steered) are
// page-level init scripts that wrap whatever Date is there, so they still
// override this default per test, exactly as before.
//
// TEST_NOW is Tue Sep 29 2026 09:00 Jerusalem: inside Round 2 Week 5 (the
// Sat Sep 26 launch week), BEFORE the Oct 3-9 Sick week, in the same week as
// the goldens' NOW_ISO. The real-clock tests were written Sep 27-Oct 2 against
// exactly this stretch of the calendar.
export const TEST_NOW_ISO = '2026-09-29T06:00:00.000Z';
export const TEST_NOW_MS = new Date(TEST_NOW_ISO).getTime();

export async function installTestClock(context: BrowserContext): Promise<void> {
  const offsetMs = TEST_NOW_MS - Date.now();
  await context.addInitScript((offset: number) => {
    const RealDate = Date;
    const nowMs = (): number => RealDate.now() + offset;
    class ShiftedDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(nowMs());
        } else {
          super(...args);
        }
      }
      static override now(): number {
        return nowMs();
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Date = ShiftedDate;
  }, offsetMs);
}

// code-shape step 1b-3 (Oct 13 2026): the ONE way a test may ask for the plain
// (no Sick weeks) week model. The app's test-only switch is set HERE and
// nowhere else; a reason is mandatory, and tests/clock-guard.test.ts caps how
// many tests may call this and bans the raw switch name outside this file.
// Context-level, so a reopened page (context.newPage()) gets it too.
export const PLAIN_WEEK5_HANDOVER =
  'this test IS a Week 5 -> 6 hand-over scenario (Oct 3-6, plus one test at Oct 16) that the Oct 3-9 Sick week now pauses or shifts (plain model only)';

export async function ignoreSickWeeks(page: Page, reason: string): Promise<void> {
  if (reason.trim().length < 10) throw new Error('ignoreSickWeeks needs a real reason');
  await page.context().addInitScript(() => {
    (window as unknown as { __wtIgnoreSickWeeks?: boolean }).__wtIgnoreSickWeeks = true;
  });
}

// The old top-level test.beforeEach of tests/app.spec.ts, as a plain function.
// Every tests/screens/*.spec.ts registers it as its first hook:
//   test.beforeEach(async ({ page, context }) => setupPage(page, context));
// helpers.ts itself registers NO test hook, so golden.spec.ts can import from it
// without inheriting the sick-week switch or the goto.
export async function setupPage(page: Page, context: BrowserContext): Promise<void> {
  await installTestClock(context);
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/');
}

// v48 (Sep 24 2026): the full note sits behind a closed toggle — the card face
// carries only the one safety line. v53 (Sep 26 2026): that toggle is "Tips ▸"
// now, was "Cue ▸" (her words: "it seems to do nothing"). Tests that read it
// open it first.
// v48 · P3 (Sep 24 2026): the cardio CHOICE step has no Done · Next — its way
// on is the quiet "Skip cardio today" (#ww-skip). One tap forward on any step.
export const NEXT = '#next, #ww-skip';

// WK2 (Sep 27 2026): the completion-based week model's real launch instant —
// week.ts's own COMPLETION_WEEKS_FROM.at, duplicated here (not imported —
// this file mocks `window.Date`, and week.ts is a Node-side import in
// week.test.ts, not loaded into the page) so tests that need a deterministic
// "day 1" can mockDate to the exact same moment app.ts reads.
export const COMPLETION_WEEKS_FROM_ISO = '2026-09-26T22:30:00+03:00';

export async function openCue(page: Page): Promise<void> {
  const toggle = page.locator('.tips-section .detail-section-toggle[aria-expanded="false"]');
  if (await toggle.count()) await toggle.first().click();
}

// v46: a slider she never moved is not a reading. The three sliders start at
// 5/5/0 and used to save as if she chose them — capacity-after was exactly 5 in
// 6 of 8 sessions since Aug 30, a "decline" the mirror invented (UX audit
// Sep 24). Untouched → null ("—"); moved → her number.
export async function walkToPostLog(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const isPostLog = await page
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) return;
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else return;
  }
}

export const ACTIVE_SESSION_KEY = 'workout-tracker:active-session';

export const LOGS_KEY = 'workout-tracker:logs';

export function leftOpenSnapshot(ageMs: number, workout: 'A' | 'B' | 'C' = 'A') {
  return {
    screen: 'workout',
    selectedWorkout: workout,
    capacityBefore: 6,
    capacityAfter: 5,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    currentRound: 1,
    currentPhase: 'warmup',
    currentExerciseIndex: 0,
    startedAt: new Date(TEST_NOW_MS - ageMs).toISOString(),
    pausedAt: null,
    pausedMs: 0,
    liteDay: false,
  };
}

export const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;

export const TEN_MINUTES = 10 * 60 * 1000;

export const SWING_WEEK3_A = {
  id: 'swing-a',
  date: '2026-09-14T15:50:00.000Z', // Mon Sep 14 — Week 3
  workout: 'A',
  capacityBefore: 7,
  capacityAfter: null,
  wallSitSec: 43,
  backPain: null,
  word: '',
};

export const SWING_WEEK3_B = {
  id: 'swing-b',
  date: '2026-09-18T15:02:00.000Z', // Fri Sep 18 — Week 3
  workout: 'B',
  capacityBefore: 8,
  capacityAfter: 5,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  durationSec: 2100,
};

export const SWING_SAT_C = {
  id: 'swing-c',
  date: '2026-09-19T19:21:00.000Z', // Sat Sep 19, 22:21 Jerusalem — the swing day
  workout: 'C',
  capacityBefore: 7,
  capacityAfter: 9,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  durationSec: 720,
};

// v48 · P4 (Sep 24 2026): the week-by-week list moved off home into Weekly
// review, collapsed as "Week by week" (DECISIONS Q3); the week card is its door.
export async function openWeekByWeek(page: Page): Promise<void> {
  await page.locator('#open-weekly-review').click();
  await page.locator('.consistency-wrap > summary').click();
}

// Helper: mock the system clock via Date.now() override BEFORE the page loads.
// addInitScript runs in the page context before any of our app code.
export async function mockDate(page: import('@playwright/test').Page, iso: string): Promise<void> {
  await page.addInitScript((isoArg: string) => {
    const fixed = new Date(isoArg).getTime();
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        // No-arg form is the case the app uses most (`new Date()` / `Date.now()`).
        // Forward any explicit args to the real Date so date math still works.
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

// A clock the TEST can move. mockDate FREEZES time, which is right for
// date-based content but can never advance a countdown. This pins Date.now() to
// a base plus a window-level offset the test bumps — so the app's own (real)
// rAF loop sees the jump on its very next frame and re-renders, with no
// thousands of synthetic frames to grind through.
export async function movableClock(
  page: import('@playwright/test').Page,
  iso: string,
  opts: { skipPreCountdown?: boolean } = {}
): Promise<void> {
  await page.addInitScript((isoArg: string) => {
    const base = new Date(isoArg).getTime();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__clockOffset = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nowMs = (): number => base + Number((window as any).__clockOffset ?? 0);
    const RealDate = Date;
    class MovableDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(nowMs());
        } else {
          super(...args);
        }
      }
      static override now(): number {
        return nowMs();
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Date = MovableDate;
  }, iso);
  if (opts.skipPreCountdown) {
    // The 3-2-1 "Get ready" is a separate timer; zero it so the block timer —
    // the one the strip is derived from — starts on the tap.
    await page.addInitScript(() => {
      window.localStorage.setItem('workout-tracker:setting-pre-count', '0');
    });
  }
}

export async function advanceClock(
  page: import('@playwright/test').Page,
  ms: number
): Promise<void> {
  await page.evaluate((msArg: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__clockOffset = Number((window as any).__clockOffset ?? 0) + msArg;
  }, ms);
}

// v60 fix (Sep 28 2026, checker's should #4): the multi-set hold UI (wall
// lean's own "2 × 15-20 sec") had no DOM/e2e coverage — hold-sets.test.ts
// only proved the pure logic (holdSetsFace/formatHeldSeconds), so the wiring
// (recordHeldSet, holdRan gating Done · Next, the Start set 2 / Redo
// handlers, the redo-keeps-the-max rule) was unguarded. Wall lean is
// currently the ONLY move whose reps text parses to setsPrescribed() > 1
// (checked app.ts: every other isTimed move is a plain "N sec" / "1 set ·
// N sec hold"), so #next/#ww-skip alone (no timer needed) reach it — #next
// is "still tappable either way" (its own comment) even in its quiet state.
// v61 (Sep 28 2026), checker's carry-over k (v60 round-2 should #6): a flat
// 5s click timeout went flaky once in the full suite — a slow render tick
// under load, not a genuinely stuck click. `screenSignature` reads the two
// things that prove a click actually landed (the exercise name — blank on a
// screen with none, e.g. the round-break face — and the step counter), and
// `advanceToExercise` now waits for EITHER to change via expect.poll instead
// of racing a fixed timeout against the click itself.
export async function screenSignature(page: import('@playwright/test').Page): Promise<string> {
  const name = await page
    .locator('.exercise-name')
    .first()
    .textContent({ timeout: 300 })
    .catch(() => null);
  const count = await page
    .locator('.step-count')
    .first()
    .textContent({ timeout: 300 })
    .catch(() => null);
  return `${name ?? ''}|${count ?? ''}`;
}

export async function advanceToExercise(
  page: import('@playwright/test').Page,
  name: string,
  maxSteps = 60
): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    // A short bounded timeout: some steps (the round-break screen) have NO
    // .exercise-name at all, and a locator action's own default wait is for
    // the element to APPEAR — with zero on the page it hangs for the whole
    // default actionability timeout (30s+) before .catch() ever fires, which
    // starved the click below and looked like a stuck click, not a stuck
    // read. 300ms is plenty once the element exists at all.
    const current = await page
      .locator('.exercise-name')
      .first()
      .textContent({ timeout: 300 })
      .catch(() => null);
    if (current === name) return;
    const before = await screenSignature(page);
    try {
      await page.locator('#next, #start-round-2, #ww-skip').first().click();
    } catch {
      throw new Error(`advanceToExercise: stuck before "${name}" (last seen "${current}")`);
    }
    await expect.poll(() => screenSignature(page), { timeout: 5000 }).not.toBe(before);
  }
  throw new Error(`advanceToExercise: did not reach "${name}" within ${maxSteps} steps`);
}

// code-shape step 2c (Oct 13 2026): EVERY test that scans app SOURCE text
// reads it through this, never from a hand-written file list. The Tips audit
// once looped over ['app.ts','ladders.ts'] and, after step 2 moved the program
// into program.ts, quietly went from 143 notes checked to 7 — green while
// checking almost nothing. Derived, not listed: every root-level *.ts module
// (the app's source lives flat at the repo root) except the Playwright config.
// A new module is therefore scanned the day it is created.
// Node-side only, registers no test hook.
export type AppSourceFile = { file: string; src: string };

/** allSourceFiles: every root module, INCLUDING engine data that is not in the
 *  shipped bundle (ladders.ts, progression.ts). For audits that deliberately
 *  cover the unwired engine too (Tips audit, pain rule). */
export function allSourceFiles(): AppSourceFile[] {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.join(__dirname, '..');
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'playwright.config.ts')
    .sort()
    .map((file) => ({ file, src: fs.readFileSync(path.join(root, file), 'utf8') }));
}

/** Old name, same thing: = allSourceFiles(). */
export const appSourceFiles = allSourceFiles;

/** Every relative import in a source text, as a '<path>.ts' specifier relative
 *  to the importing file: `from './x.js'`, `from './x.ts'`, extensionless
 *  `from './x'`, side-effect `import './x.js'`, dynamic `import('./x.js')`, the
 *  template-literal form import(`./x.js`), CommonJS `require('./x')`,
 *  `export ... from`, any quote style. Comments are blanked first. A template
 *  literal with a `${}` interpolation cannot be resolved statically, so it is
 *  not read (it never matches). */
export function relativeImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const out: string[] = [];
  // The closing quote must be the same character as the opening one (\1).
  for (const m of code.matchAll(
    /\b(?:from|import|require)\s*\(?\s*(['"`])(\.{1,2}\/[^'"`\s$]+)\1/g
  ))
    out.push(`${m[2]!.replace(/\.(?:js|ts)$/, '')}.ts`);
  return [...new Set(out)].sort();
}

/** bundledSourceFiles: only the modules that actually ship in the app bundle —
 *  app.ts plus everything it imports, followed recursively (type-only imports
 *  included: erased, but still app source). For checks about what the app can
 *  show (voice-load's "accepted kg" sweep), which ladders.ts polluted. */
export function bundledSourceFiles(): AppSourceFile[] {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.join(__dirname, '..');
  const seen = new Map<string, AppSourceFile>();
  const queue = ['app.ts'];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const full = path.join(root, file);
    if (!fs.existsSync(full))
      throw new Error(`bundledSourceFiles: ${file} is imported but does not exist`);
    const src = fs.readFileSync(full, 'utf8');
    seen.set(file, { file, src });
    // Follow every relative import ('./x.js', './dir/x.js', '../x.js'),
    // resolved against the importing file's own folder (root-relative keys).
    for (const spec of relativeImports(src))
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
  }
  return [...seen.keys()].sort().map((file) => seen.get(file)!);
}
