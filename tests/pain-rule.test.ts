// tests/pain-rule.test.ts — v60 (Sep 28 2026), spec item 3: the pain rule on
// every card. Health check Sep 28 found 6+ exercise cards still saying an
// alarm-toned "stop at/if/on any ..." / "any (wrist) sensation" — the
// opposite of the pain rule (hers + Lisa via her): "a little pain is OK,
// keep moving; back off if it's sharp, climbing, or still there next
// morning." She decides load by pain herself (never "ask Lisa").
//
// Scans every SHOWN string (steps/dos/donts/mistakes.fix in
// exercise-detail.ts, do/avoid in exercise-howto.ts, notes/SAFETY_LINE in
// app.ts + ladders.ts) for the two banned shapes. Never scans voiceScript —
// spoken, not shown, a separate pass (only the curl mp3 changed this round,
// F item 4) — so a stale spoken line surviving here is expected, not a bug
// this test should catch.
//
// Code comments are never scanned: exercise-detail.ts/exercise-howto.ts are
// real imports (a `//` comment is never a string value), and app.ts/
// ladders.ts go through the same `notes:`-string-literal extraction the
// Tips-audit test (tests/app.spec.ts) already uses — a comment can't match
// that shape either.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { EXERCISE_DETAIL } from '../exercise-detail';
import { EXERCISE_HOWTO } from '../exercise-howto';

const BANNED: [RegExp, string][] = [
  [/stop (at|if|on) any/i, 'alarm-toned "stop ... any"'],
  [/any (wrist )?sensation/i, '"any (wrist) sensation"'],
];

function violations(label: string, text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const [re, why] of BANNED) {
    if (re.test(text)) out.push(`${label} — ${why} — "${text}"`);
  }
  return out;
}

test('pain rule: no shown exercise string uses the old alarm-toned "stop at/if/on any" or "any (wrist) sensation" wording', () => {
  const offenders: string[] = [];

  // exercise-detail.ts — real import, no DOM needed.
  for (const [name, d] of Object.entries(EXERCISE_DETAIL)) {
    for (const s of d.steps) offenders.push(...violations(`exercise-detail.ts "${name}" steps`, s));
    for (const s of d.dos) offenders.push(...violations(`exercise-detail.ts "${name}" dos`, s));
    for (const s of d.donts) offenders.push(...violations(`exercise-detail.ts "${name}" donts`, s));
    for (const m of d.mistakes)
      offenders.push(...violations(`exercise-detail.ts "${name}" mistakes.fix`, m.fix));
  }

  // exercise-howto.ts — real import.
  for (const [name, h] of Object.entries(EXERCISE_HOWTO)) {
    for (const f of h.frames) {
      offenders.push(...violations(`exercise-howto.ts "${name}" do`, f.do));
      offenders.push(...violations(`exercise-howto.ts "${name}" avoid`, f.avoid));
    }
  }

  // app.ts + ladders.ts can't be imported directly (app.ts's bottom
  // document.addEventListener(...) needs a real DOM) — extract every
  // `notes:` string literal from source text, same regex tests/app.spec.ts's
  // "Tips audit" test already proved out.
  const noteRe = /notes:\s*\n?\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  for (const file of ['app.ts', 'ladders.ts']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = noteRe.exec(src))) {
      const line = src.slice(0, m.index).split(/\r?\n/).length;
      offenders.push(...violations(`${file}:${line} notes`, m[2]));
    }
  }

  // app.ts's SAFETY_LINE map — 'Exercise name': 'the card face line', not
  // shaped like `notes:` so it needs its own small extraction.
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const safetyBlock = /const SAFETY_LINE: Record<string, string> = \{([\s\S]*?)\n\};/.exec(appSrc);
  if (safetyBlock) {
    const lineRe = /'([^']+)':\s*\n?\s*'((?:\\.|[^'])*)'/g;
    let sm: RegExpExecArray | null;
    while ((sm = lineRe.exec(safetyBlock[1]!))) {
      offenders.push(...violations(`app.ts SAFETY_LINE["${sm[1]}"]`, sm[2]));
    }
  } else {
    offenders.push("app.ts — SAFETY_LINE block not found by this test's own regex — fix the test");
  }

  expect(offenders).toEqual([]);
});
