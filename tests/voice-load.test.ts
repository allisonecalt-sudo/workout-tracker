// tests/voice-load.test.ts — v60 (Sep 28 2026), spec item 4: the curl voice
// line + the voice-note↔variant test the plan asked for (PLAN-2026-09-26.md
// §7 F3's own idea, scoped here to load only). Health check Sep 28: the 1 kg
// biceps curl's mp3 still said "one kilogram" — a fixed number the reps text
// no longer has (rule 8e, v55: "1–2 kg (your pick)", her own LOAD CHIP,
// picked live by pain, never "ask Lisa"). Fixed this pass; the row's own mp3
// was already fixed at v55 fix r3. This test is what keeps both fixed —
// pure-logic, no `page` fixture, same reasoning as pain-rule.test.ts's own
// header (a real import, no DOM needed).
//
// Widened (v60 fix pass, same day, checker's should #3): the hardcoded
// 2-move list only caught curl/row. Now loops EVERY EXERCISE_DETAIL entry
// with a voiceScript against its own PROGRAM reps text pulled from app.ts —
// same "can't import app.ts in Node" workaround pain-rule.test.ts already
// uses (regex extraction, not the DOM). Flags any move whose spoken script
// names a specific kg/kilo number ("one kilogram", "1 kg") that its current
// reps text doesn't also carry — the exact bug class the curl mp3 had.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { EXERCISE_DETAIL } from '../exercise-detail';

// The two 1–2 kg LOAD CHIP moves (app.ts's ARM_FEEL_STEPS — curl/row, rule
// 8e). Hardcoded rather than imported: app.ts can't be imported directly in
// Node (its bottom document.addEventListener(...) needs a real DOM), and
// this is the same short, documented list CLAUDE.md itself keeps ("the two
// 1–2 kg moves (curl, prone row)") — a third LOAD CHIP move would need this
// test updated alongside it, the same way ARM_FEEL_STEPS itself would grow.
const LOAD_CHIP_MOVES = ['1 kg biceps curl', 'Prone row (bodyweight)'];

test.describe('voice-note ↔ variant: a LOAD CHIP move states no fixed kilogram number', () => {
  for (const name of LOAD_CHIP_MOVES) {
    test(`"${name}"'s voiceScript says "one or two kilos", never a fixed "one kilogram"/"1 kg"`, () => {
      const script = EXERCISE_DETAIL[name]?.voiceScript ?? '';
      expect(script.length).toBeGreaterThan(0); // fail loud if the entry ever goes missing
      const lower = script.toLowerCase();
      expect(lower).not.toMatch(/\bone kilogram\b/);
      expect(lower).not.toMatch(/\btwo kilograms\b/);
      expect(lower).not.toMatch(/\b1\s*kg\b/);
      expect(lower).not.toMatch(/\b2\s*kg\b/);
      // The positive half: it DOES say the range, live-picked, not baked in.
      expect(lower).toMatch(/one or two kilos/);
    });
  }
});

// --- general sweep: every voiceScript vs. its own program reps text -------

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Every kg/kilo(gram) number mentioned in `text`, digit or word form. */
function kgMentions(text: string): Set<number> {
  const out = new Set<number>();
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/\b(\d+(?:\.\d+)?)\s*kg\b/g)) out.add(parseFloat(m[1]!));
  for (const m of lower.matchAll(/\b(\d+(?:\.\d+)?)\s*kilo(?:gram)?s?\b/g))
    out.add(parseFloat(m[1]!));
  for (const m of lower.matchAll(/\b(one|two|three|four|five)\s*kilo(?:gram)?s?\b/g))
    out.add(WORD_NUM[m[1]!]!);
  return out;
}

test('voice-note ↔ variant sweep: no voiceScript names a kg/kilo number its own reps text lacks', () => {
  // Every `name: '...'` followed by that SAME object's `reps: '...'` in
  // app.ts's Exercise object literals — the PROGRAM's own prescribed
  // reps/load text for that move, name -> all reps strings seen for it (a
  // move can appear in more than one workout/week, sometimes with a `label:`
  // field or several comment lines between `name:` and `reps:` — e.g.
  // HIP_HINGE_R2W4 — so this stops at the next `name:` rather than a fixed
  // char window, which a first pass got wrong: a too-tight window missed
  // that object's own "1–2 kg" reps text and flagged its voiceScript as a
  // false positive).
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const nameRepsRe =
    /name:\s*'((?:\\.|[^'])*)',(?:(?!name:\s*')[\s\S])*?reps:\s*'((?:\\.|[^'])*)'/g;
  const repsByName = new Map<string, string[]>();
  let nm: RegExpExecArray | null;
  while ((nm = nameRepsRe.exec(appSrc))) {
    const name = nm[1]!;
    const reps = nm[2]!;
    const arr = repsByName.get(name) ?? [];
    arr.push(reps);
    repsByName.set(name, arr);
  }

  const offenders: string[] = [];
  for (const [name, d] of Object.entries(EXERCISE_DETAIL)) {
    if (!d.voiceScript) continue;
    const scriptKg = kgMentions(d.voiceScript);
    if (scriptKg.size === 0) continue; // nothing kg-shaped spoken — not this test's concern
    const repsTexts = repsByName.get(name);
    // v61 (Sep 28 2026), checker's carry-over k (v60 round-2 should #6,
    // CLAUDE.md's own fail-loud rule): this used to `continue` here — a
    // voiceScript naming a kg number with NO program reps text to check it
    // against was silently passed, not silently correct. A move whose
    // voiceScript talks about kilos but whose own PROGRAM entry this
    // extraction regex can't find is exactly the kind of gap the fail-loud
    // rule exists for — flag it instead of skipping it.
    if (!repsTexts || repsTexts.length === 0) {
      offenders.push(
        `"${name}" voiceScript names a kg/kilo number but no "name: '${name}', ... reps: '...'" pair was found in app.ts to check it against`
      );
      continue;
    }
    const repsKg = new Set<number>();
    for (const r of repsTexts) for (const n of kgMentions(r)) repsKg.add(n);
    const missing = [...scriptKg].filter((n) => !repsKg.has(n));
    if (missing.length > 0) {
      offenders.push(
        `"${name}" voiceScript names ${missing.join('/')} kg but its reps text (${repsTexts.join(' | ')}) doesn't`
      );
    }
  }
  expect(offenders).toEqual([]);
});
