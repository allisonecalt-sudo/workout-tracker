// tests/clock-guard.test.ts — code-shape step 1b-3 (Oct 13 2026): no test may
// read the REAL clock again. A test on the wall clock silently changes
// meaning as the calendar moves (Oct 13 sits after the Oct 3-9 Sick week the
// app now knows about; 40 of 363 app tests either read the real clock or pin
// Oct 1-9 dates that the Sick week moved under them). Every context gets a
// fixed, RUNNING TEST_NOW clock (helpers.ts installTestClock); a test that
// wants another instant says so with mockDate / movableClock.
//
// Pure Node, no `page` — reads the test sources as text, like pain-rule.test.ts.

import { test, expect } from '@playwright/test';
import { allSourceFiles } from './helpers';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const TESTS = __dirname;

function testFiles(dir: string = TESTS): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'golden') out.push(...testFiles(p));
    } else if (e.name.endsWith('.spec.ts') || e.name.endsWith('.test.ts')) out.push(p);
  }
  return out.sort();
}

const rel = (p: string): string => path.relative(TESTS, p).split(path.sep).join('/');

/** v62.1: the shipped/running files that are not .ts - scripts/*.mjs, sw.js, index.html. */
function otherShippedFiles(): { file: string; src: string }[] {
  const root = path.join(TESTS, '..');
  const names = [
    'sw.js',
    'index.html',
    ...fs
      .readdirSync(path.join(root, 'scripts'))
      .filter((f) => /\.(mjs|cjs)$/.test(f))
      .sort()
      .map((f) => 'scripts/' + f),
  ];
  return names.map((file) => ({ file, src: fs.readFileSync(path.join(root, file), 'utf8') }));
}

/** Source with // line comments and block comments blanked, so prose that
 *  mentions the patterns never trips the scan. */
function code(p: string): string {
  return fs
    .readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// The patterns, built from parts so this file never matches itself.
const OLD_SWITCH = '__wt' + 'IgnoreSickWeeks';
const SEED_HOOK_NAMES = [
  '__wt' + 'SeedCalendarMarks',
  '__wt' + 'CalendarMarksSeed',
  '__wt' + 'RoundsSeed', // the rounds seed (v62.1); like the marks seed, only helpers.ts + app.ts name it
];
// The helper names a test may seed marks through (helpers.ts exports both).
const SEED_HELPERS = ['ignoreSickWeeks', 'seedCalendarMarks'];
const ZERO_ARG_NEW_DATE = new RegExp('new ' + String.raw`Date\(\s*\)`, 'g');
const DATE_NOW = new RegExp('Date' + String.raw`\.now\(\)`, 'g');

// Real-clock reads that are legitimate, with the reason. Every one of these
// runs INSIDE the page (addInitScript / evaluate callbacks), where `Date` is
// the default TEST_NOW clock — NOT Node's wall clock.
const IN_PAGE_ALLOW: Record<string, { count: number; why: string }> = {
  'screens/timing.spec.ts': {
    count: 8,
    why: 'the default-clock proof tests read the IN-PAGE clock on purpose (7 evaluate calls + 1 in a describe title)',
  },
  'screens/redesign-ships.spec.ts': {
    count: 2,
    why: 'page.addInitScript: seeds "this week" / "now" sessions off the in-page TEST_NOW clock',
  },
};

// Specs that need no default clock of their own (everything else must call
// setupPage or installTestClock).
const NO_DEFAULT_CLOCK = new Set([
  'golden.spec.ts', // every golden test pins movableClock(NOW_ISO) itself
  'sw-upgrade.spec.ts', // service-worker install/cache mechanics, no dates in play
]);

// Tests allowed to seed the calendar marks (ignoreSickWeeks = no Sick weeks;
// seedCalendarMarks = any marks), per file. Each is a Week 5 -> 6 hand-over
// (mostly Oct 3-6, one Oct 16) that the Sick week now pauses or shifts; the
// number may only go DOWN (re-date a scenario, then lower it here).
const PLAIN_MODEL_ALLOW: Record<string, number> = {
  'screens/home.spec.ts': 11,
  'screens/review-progress-howto.spec.ts': 2,
  'screens/week-moves.spec.ts': 8,
};

test.describe('clock guard — no test reads the real clock (step 1b-3)', () => {
  test('no spec or test reads the wall clock outside helpers.ts, except the listed in-page reads', () => {
    const offenders: string[] = [];
    for (const f of testFiles()) {
      const r = rel(f);
      if (r === 'helpers.ts' || r === 'clock-guard.test.ts') continue;
      const src = code(f);
      const n = (src.match(ZERO_ARG_NEW_DATE)?.length ?? 0) + (src.match(DATE_NOW)?.length ?? 0);
      const allowed = IN_PAGE_ALLOW[r]?.count ?? 0;
      if (n !== allowed)
        offenders.push(`${r}: ${n} real-clock read(s), allow-list says ${allowed}`);
    }
    expect(offenders).toEqual([]);
  });

  test('every browser spec runs on the default test clock (setupPage / installTestClock) unless listed', () => {
    const offenders: string[] = [];
    for (const f of testFiles()) {
      const r = rel(f);
      if (!r.endsWith('.spec.ts') || NO_DEFAULT_CLOCK.has(r)) continue;
      const src = code(f);
      if (!/\b(setupPage|installTestClock)\(/.test(src)) offenders.push(r);
    }
    expect(offenders).toEqual([]);
  });

  test('no app branch for tests (v62 step 5d): the old Sick-week switch is named nowhere - no test file, no app source', () => {
    // Banned EVERYWHERE: every test file (helpers.ts included) and every app
    // source file (step 5d deleted it from app.ts).
    const oldSwitch: string[] = [];
    for (const f of testFiles()) {
      if (rel(f) === 'clock-guard.test.ts') continue;
      if (code(f).includes(OLD_SWITCH)) oldSwitch.push(`tests/${rel(f)}`);
    }
    for (const { file, src } of allSourceFiles()) {
      if (src.includes(OLD_SWITCH)) oldSwitch.push(file);
    }
    // v62.1: the rest of what ships or runs - every scripts/*.mjs, the service
    // worker and the shell page - is scanned too (the ban was only .ts files).
    for (const { file, src } of otherShippedFiles()) {
      if (src.includes(OLD_SWITCH)) oldSwitch.push(file);
    }
    expect(oldSwitch).toEqual([]);
  });

  test('the switch ban also covers scripts/*.mjs, sw.js and index.html (v62.1)', () => {
    const files = otherShippedFiles().map((f) => f.file);
    expect(files).toEqual(expect.arrayContaining(['sw.js', 'index.html']));
    expect(
      files.filter((f) => f.startsWith('scripts/') && f.endsWith('.mjs')).length
    ).toBeGreaterThan(3);
    // every scripts/*.mjs on disk is in the list (none skipped)
    const onDisk = fs
      .readdirSync(path.join(TESTS, '..', 'scripts'))
      .filter((f) => f.endsWith('.mjs'))
      .map((f) => 'scripts/' + f);
    for (const f of onDisk) expect(files).toContain(f);
    // step 7-0: scripts/*.cjs (titles-compare.cjs) are scanned too
    expect(files).toContain('scripts/titles-compare.cjs');
    const cjsOnDisk = fs
      .readdirSync(path.join(TESTS, '..', 'scripts'))
      .filter((f) => f.endsWith('.cjs'));
    expect(cjsOnDisk.length).toBeGreaterThan(0);
    for (const f of cjsOnDisk) expect(files).toContain('scripts/' + f);
  });

  test('the Sick-week switch is named only in helpers.ts, and only the listed tests ask for the plain model', () => {
    // (title kept from before step 5d - the ratchet never lets a title go. Now:
    // the seed-hook names live only in helpers.ts and app.ts, and only the
    // listed tests seed calendar marks, never from a beforeEach/beforeAll.)
    const rawHook: string[] = [];
    const asks: Record<string, number> = {};
    const inHooks: string[] = [];
    for (const f of testFiles()) {
      const r = rel(f);
      if (r === 'helpers.ts' || r === 'clock-guard.test.ts') continue;
      const src = code(f);
      if (SEED_HOOK_NAMES.some((n) => src.includes(n))) rawHook.push(r);
      const scan = scanPlainModelAsks(src);
      for (const h of scan.hookCalls) inHooks.push(`${r}: ${h}`);
      if (scan.calls > 0) asks[r] = scan.calls;
    }
    expect(inHooks).toEqual([]);
    expect(rawHook).toEqual([]);
    expect(asks).toEqual(PLAIN_MODEL_ALLOW);
  });

  test('the guard itself: the scanner counts a direct call, an import alias, a one-step alias, a TWO-step alias and a namespace member, and flags a call inside a hook', () => {
    const direct = scanPlainModelAsks("await ignoreSickWeeks(page, 'a long enough reason');");
    expect(direct.calls).toBe(1);
    const importAlias = scanPlainModelAsks(
      "import { ignoreSickWeeks as plain } from './helpers';\nawait plain(page, 'a long enough reason');"
    );
    expect(importAlias.calls).toBe(1);
    const oneStep = scanPlainModelAsks(
      "const y = ignoreSickWeeks;\nawait y(page, 'a long enough reason');"
    );
    expect(oneStep.calls).toBe(1);
    const twoStep = scanPlainModelAsks(
      "let z;\nz = ignoreSickWeeks;\nawait z(page, 'a long enough reason');"
    );
    expect(twoStep.calls).toBe(1);
    const twoStepMember = scanPlainModelAsks(
      "let z;\nz = h.ignoreSickWeeks;\nawait z(page, 'a long enough reason');"
    );
    expect(twoStepMember.calls).toBe(1);
    const namespace = scanPlainModelAsks("await h.ignoreSickWeeks(page, 'a long enough reason');");
    expect(namespace.calls).toBe(1);
    // a comparison is not an alias, and a bare mention is not a call
    expect(scanPlainModelAsks('if (x === ignoreSickWeeks) { x(1); }').calls).toBe(0);
    expect(scanPlainModelAsks('const names = [ignoreSickWeeks];').calls).toBe(0);
    // the general seeder is counted too, under its own name and any alias
    expect(
      scanPlainModelAsks("await seedCalendarMarks(page, { sick: [] }, 'long enough');").calls
    ).toBe(1);
    expect(
      scanPlainModelAsks("let s;\ns = h.seedCalendarMarks;\nawait s(page, {}, 'long enough');")
        .calls
    ).toBe(1);
    const hook = scanPlainModelAsks(
      "test.beforeEach(async ({ page }) => { await ignoreSickWeeks(page, 'a long enough reason'); });"
    );
    expect(hook.calls).toBe(1);
    expect(hook.hookCalls.length).toBe(1);
    const inBody = scanPlainModelAsks(
      "test('t', async ({ page }) => { await ignoreSickWeeks(page, 'a long enough reason'); });"
    );
    expect(inBody.hookCalls).toEqual([]);
  });
});

/** Scan one test source (comments already blanked) for calls to the calendar-
 *  seeding helpers (`ignoreSickWeeks`, `seedCalendarMarks`), under every local
 *  name each can go by: its own, an `X as Y` import alias, a namespace member
 *  (`h.ignoreSickWeeks(`), a one-step alias (`const y = ignoreSickWeeks`), a
 *  TWO-step alias (`let z; z = ignoreSickWeeks`), and a destructure rename
 *  (`{ ignoreSickWeeks: y }`). Deliberate obfuscation (string concatenation,
 *  computed property access) is NOT caught on purpose: this guards against
 *  drift, not a hostile author. `hookCalls` lists calls sitting inside a
 *  beforeEach/beforeAll hook (banned: it would silently cover a whole describe). */
function scanPlainModelAsks(src: string): { calls: number; hookCalls: string[] } {
  const names = new Set<string>(SEED_HELPERS);
  for (const helper of SEED_HELPERS) {
    for (const m of src.matchAll(new RegExp(String.raw`\b${helper}\s+as\s+(\w+)`, 'g')))
      names.add(m[1]!);
    // A plain assignment of the helper (not a call, not a comparison): covers
    // `const y = helper`, `let z; z = helper`, `y = h.helper`.
    for (const m of src.matchAll(
      new RegExp(String.raw`\b(\w+)\s*=(?![=>])\s*(?:\w+\.)?${helper}\b(?!\s*\()`, 'g')
    ))
      names.add(m[1]!);
    for (const m of src.matchAll(new RegExp(String.raw`\b${helper}\s*:\s*(\w+)`, 'g')))
      names.add(m[1]!);
  }
  const call = new RegExp(String.raw`(?<![\w.])(?:\w+\.)?(?:${[...names].join('|')})\s*\(`, 'g');
  let calls = 0;
  const hookCalls: string[] = [];
  for (const m of src.matchAll(call)) {
    calls++;
    // The nearest test/hook opener before the call is the block it sits in.
    const before = src.slice(0, m.index);
    const openers = [
      ...before.matchAll(
        /\b(?:test|it)(?:\.(?:only|skip|fixme|describe|beforeEach|beforeAll|afterEach|afterAll))?\s*\(/g
      ),
    ];
    const last = openers[openers.length - 1]?.[0] ?? '';
    if (/before(?:Each|All)/.test(last))
      hookCalls.push(`a calendar seed inside ${last.trim()} (banned: call it in the test body)`);
  }
  return { calls, hookCalls };
}
