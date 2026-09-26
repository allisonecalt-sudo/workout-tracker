// pain-feel.ts — the ONE helper pair that converts back/wrist pain at the UI
// edge (v53, Sep 26 2026). Pure logic, no DOM — same shape as progression.ts
// / cycle.ts, so a test can import it directly in Node (app.ts can't be
// imported directly: its bottom `document.addEventListener(...)` runs at
// module load, which needs a real DOM).
//
// WHY: her words (Fri Sep 25 2026, on the back/wrist 1-10 chip specifically):
// "It was the opposite of what it meant" / "Yes flip it and also put it in
// future build to fix and make it all align" — she saved back 9 / wrist 7
// reading the pain chips as 10 = good, the same as body and mood right above
// them on the same screen (that row was corrected by hand — never touch
// data). The chip read like body/mood (10 always the good end) but SAVED as
// pain (10 = worst).
//
// STORAGE STAYS PAIN: pain_back_0_10 / wrist_pain_0_10 (0 = none, higher =
// worse) — the progression engine's flare gate (pain >= 3, progression.ts)
// and the cycle page's before/after averages (cycle.ts) both keep reading
// this column exactly as before, untouched by this file. Only the chip she
// taps, and the chip that lights back up, are drawn in FEEL terms (10 =
// feels fine, 1 = hurts a lot) — app.ts converts at that one edge, in both
// directions, with this pair.
//
// One invertible line: pain = 10 − feel, so feel = 10 − pain too.
// Boundaries: feel 10 (feels fine / the one-tap "Fine") -> pain 0.
//             feel 1 (hurts a lot) -> pain 9 (the row's worst reachable pain
//             is 9, not 10 — there's no "feel 0").
export function painFromFeel(feel: number): number {
  return 10 - feel;
}

export function feelFromPain(pain: number): number {
  return 10 - pain;
}
