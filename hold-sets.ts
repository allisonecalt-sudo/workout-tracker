// hold-sets.ts — multi-set timed holds (v60, Sep 28 2026). Pure logic, no DOM
// — same discipline as pain-feel.ts / ride.ts / move-feel.ts: app.ts does the
// DOM/state reading, everything decided here is exercised by
// tests/hold-sets.test.ts in Node, no browser.
//
// WHY: her words Sat Sep 26 22:13: "Wall lean I need to be able to do the
// timer again." Wall lean is prescribed "2 × 15-20 sec" (WRIST_ONRAMP,
// app.ts) but the hold face only ever ran ONE timer per step; after set 1
// there was nothing but a quiet grey "Redo" back to the same single hold —
// no way to run set 2 as its own timed rep (PLAN-2026-09-26.md §7 F1).
//
// GENERALIZED, never hardcoded to "Wall lean" by name: `setsPrescribed`
// reads the same "N ×"/"N x" shape app.ts's own `multiSetCount` already
// parses off a REPS move's text (v54) — so a future multi-set HOLD gets the
// identical face for free, and a plain single-set hold ("45 sec", no
// leading count) is untouched — the repo's own "single-set holds don't
// change" convention (multiSetCount's header comment).
// A trailing `\b` (word-boundary) doesn't fire after "×" (the multiplication
// sign, U+00D7, is not a \w character, and neither is the space that always
// follows it in real reps text — "2 × 15-20 sec" — so \d+\s*[×x]\b never
// matched a real "×" prescription; only a plain ASCII "x" happened to work,
// because 'x' IS a word character). A lookahead for the space/string-end
// that always follows in this app's own reps text shapes works for both.
const SETS_RE = /(\d+)\s*(?:sets?|[×x])(?=\s|$)/i;

export function setsPrescribed(reps: string | undefined): number {
  const m = SETS_RE.exec((reps ?? '').trim());
  const n = m?.[1] ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 1 ? n : 1;
}

// One line under the finished sets: "20 s" per set, " · "-joined —
// "Set 1 ✓ 20 s" (one set shown, mid-sequence) or "2 sets ✓ · 20 s · 18 s"
// (every set shown, all done) — app.ts's renderHoldTimerCard builds the
// surrounding label; this owns only the number formatting so a test can
// pin it without a DOM.
export function formatHeldSeconds(sets: readonly number[]): string {
  return sets.map((s) => `${s} s`).join(' · ');
}

export type HoldSetsFace =
  | { kind: 'ready' } // nothing held yet this step — app.ts's existing Ready face
  | { kind: 'more-sets'; setDone: number; setsTotal: number; heldSec: number }
  | { kind: 'all-done'; setsTotal: number; sets: readonly number[] };

// What the done-face should show, given how many sets are prescribed and
// how many are recorded for this step so far (state.heldSetsFor[key]).
// Only meaningful for a multi-set hold (setsTotal > 1) — app.ts keeps its
// own single-set branch for setsTotal <= 1, untouched by this module.
export function holdSetsFace(setsTotal: number, sets: readonly number[]): HoldSetsFace {
  if (sets.length === 0) return { kind: 'ready' };
  if (sets.length >= setsTotal) return { kind: 'all-done', setsTotal, sets };
  return {
    kind: 'more-sets',
    setDone: sets.length,
    setsTotal,
    heldSec: sets[sets.length - 1] as number,
  };
}
