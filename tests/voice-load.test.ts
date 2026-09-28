// tests/voice-load.test.ts — v60 (Sep 28 2026), spec item 4: the curl voice
// line + the voice-note↔variant test the plan asked for (PLAN-2026-09-26.md
// §7 F3's own idea, scoped here to load only). Health check Sep 28: the 1 kg
// biceps curl's mp3 still said "one kilogram" — a fixed number the reps text
// no longer has (rule 8e, v55: "1–2 kg (your pick)", her own LOAD CHIP,
// picked live by pain, never "ask Lisa"). Fixed this pass; the row's own mp3
// was already fixed at v55 fix r3. This test is what keeps both fixed —
// pure-logic, no `page` fixture, same reasoning as pain-rule.test.ts's own
// header (a real import, no DOM needed).

import { test, expect } from '@playwright/test';
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
