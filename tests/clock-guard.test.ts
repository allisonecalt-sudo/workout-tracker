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

/** Source with // line comments and block comments blanked, so prose that
 *  mentions the patterns never trips the scan. */
function code(p: string): string {
  return fs
    .readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// The patterns, built from parts so this file never matches itself.
const ZERO_ARG_NEW_DATE = new RegExp('new ' + String.raw`Date\(\s*\)`, 'g');
const DATE_NOW = new RegExp('Date' + String.raw`\.now\(\)`, 'g');

// Real-clock reads that are legitimate, with the reason. Every one of these
// runs INSIDE the page (addInitScript / evaluate callbacks), where `Date` is
// the default TEST_NOW clock — NOT Node's wall clock.
const IN_PAGE_ALLOW: Record<string, { count: number; why: string }> = {
  'screens/home.spec.ts': {
    count: 1,
    why: 'page.evaluate: back-dates the stamped walk start 4 min off the in-page TEST_NOW clock',
  },
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

// Tests allowed to ask for the plain (no Sick weeks) week model, per file.
// Each is a Week 5 -> 6 hand-over (mostly Oct 3-6, one Oct 16) that the Sick week now pauses or shifts;
// the number may only go DOWN (re-date a scenario, then lower it here).
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

  test('the Sick-week switch is named only in helpers.ts, and only the listed tests ask for the plain model', () => {
    const rawSwitch: string[] = [];
    const asks: Record<string, number> = {};
    const inHooks: string[] = [];
    for (const f of testFiles()) {
      const r = rel(f);
      if (r === 'helpers.ts' || r === 'clock-guard.test.ts') continue;
      const src = code(f);
      if (src.includes('__wtIgnoreSickWeeks')) rawSwitch.push(r);
      // Every local name the helper goes by: its own, any `ignoreSickWeeks as X`
      // import alias, and a namespace member (`h.ignoreSickWeeks(`). Deliberate
      // obfuscation (string concatenation, computed property access) is NOT
      // caught on purpose: this guards against drift, not a hostile author.
      const names = new Set(['ignoreSickWeeks']);
      for (const m of src.matchAll(/\bignoreSickWeeks\s+as\s+(\w+)/g)) names.add(m[1]);
      // Also a plain alias (`const x = ignoreSickWeeks`, `const x = h.ignoreSickWeeks`)
      // or a destructure rename (`{ ignoreSickWeeks: x }`).
      for (const m of src.matchAll(
        /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:\w+\.)?ignoreSickWeeks\b(?!\s*\()/g
      ))
        names.add(m[1]);
      for (const m of src.matchAll(/\bignoreSickWeeks\s*:\s*(\w+)/g)) names.add(m[1]);
      const call = new RegExp(
        String.raw`(?<![\w.])(?:\w+\.)?(?:${[...names].join('|')})\s*\(`,
        'g'
      );
      let n = 0;
      for (const m of src.matchAll(call)) {
        n++;
        // The simple honest rule: a call inside a beforeEach/beforeAll hook
        // would silently cover a whole describe, so it is banned outright.
        // The nearest test/hook opener before the call is the block it sits in.
        const before = src.slice(0, m.index);
        const openers = [
          ...before.matchAll(
            /\b(?:test|it)(?:\.(?:only|skip|fixme|describe|beforeEach|beforeAll|afterEach|afterAll))?\s*\(/g
          ),
        ];
        const last = openers[openers.length - 1]?.[0] ?? '';
        if (/before(?:Each|All)/.test(last))
          inHooks.push(
            `${r}: ignoreSickWeeks inside ${last.trim()} (banned: call it in the test body)`
          );
      }
      if (n > 0) asks[r] = n;
    }
    expect(inHooks).toEqual([]);
    expect(rawSwitch).toEqual([]);
    expect(asks).toEqual(PLAIN_MODEL_ALLOW);
  });
});
