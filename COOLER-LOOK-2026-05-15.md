# Workout-Tracker — Cooler-Look Pass (2026-05-15 evening)

**Branch merged:** `cooler-look-2026-05-15` → `main`
**Commits on main:** `0966550` (implementation), `b987bc6` (merge)
**Live URL:** https://allisonecalt-sudo.github.io/workout-tracker/
**Tests:** 27 of 27 green (24 carried forward + 3 new)
**CI:** success on run `25921095220` (1m29s)
**Author:** Lead-developer agent (autonomous per `feedback_lead_developer_autonomy.md`)
**Trigger:** Allison 16:34 JDT: _"i wan tit o be a cooler more modenr looking app"_

---

## What "cooler / more modern" meant — and what shipped

Allison liked D-1 calm, but the visual punch was too low. The brief was Linear 2025 / Stripe 2025 / Apple Liquid Glass register — premium depth, restrained motion — without crossing into Nike-Training-Club gamification (which she's rejected today). This ship layered modern visual interest on top of the D-1 base. Zero D-1 tokens removed; everything is additive.

### Design tokens added on `:root`

| Token               | Value / role                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| `--grad-surface`    | Same-hue vertical gradient `bg-elev → bg-elev-2`. Standard card surface.             |
| `--grad-hero`       | Accent-tinted gradient — 6% sage over `bg-elev → bg-elev-2`. Today's-pick only.      |
| `--grad-primary`    | Within-sage gradient `accent-hover → accent`. Primary button.                        |
| `--glass-bg`        | `rgba(255,255,255,0.04)` — base glass.                                               |
| `--glass-bg-strong` | `rgba(255,255,255,0.06)` — pick badge glass.                                         |
| `--glass-blur`      | `blur(10px) saturate(140%)` — restrained glass.                                      |
| `--glow-accent`     | 1px accent inset + 1px white top highlight + soft outer accent glow. Hero card only. |
| `--ease-spring`     | `cubic-bezier(0.34, 1.56, 0.64, 1)` — 8% overshoot. Press-back register.             |
| `--ease-out`        | `cubic-bezier(0.22, 1, 0.36, 1)` — fade easing.                                      |
| `--dur-fast`        | `0.16s` — button press.                                                              |
| `--dur-base`        | `0.22s` — most transitions.                                                          |

### Class-by-class before / after

| Element                        | D-1 (before)                                            | Cooler-look (after)                                                                                              |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `h1`                           | `var(--text)` warm white                                | `color-mix(in srgb, var(--accent) 1%, var(--text))` — subtle warmth, never green                                 |
| `.card`                        | Flat `var(--bg-elev)` fill                              | `var(--grad-surface)` gradient, spring-eased transitions                                                         |
| `button` / `.btn`              | Linear 0.15s ease, scale 0.98 active                    | Spring `--ease-spring` on transform, scale 0.96 active                                                           |
| `.btn-primary`                 | Flat `var(--accent)` fill                               | `var(--grad-primary)` within-sage gradient + 1px white inset highlight (premium without claiming a new role)     |
| `.week-banner`                 | Transparent + 1px border                                | `var(--glass-bg)` + `backdrop-filter: var(--glass-blur)` (glass chip)                                            |
| `.sync-indicator:not(:empty)`  | Inline text only                                        | Same glass treatment as week-banner — reads as a status chip                                                     |
| `.workout-card`                | Flat `var(--bg-elev)`, 0.85 opacity, border-color hover | `var(--grad-surface)`, 0.9 opacity, spring lift on hover (translateY -2px), `overflow: hidden`                   |
| `.workout-card-monogram` (NEW) | —                                                       | A/B/C letter at 88px, 12% opacity, identity color (`--dot-a/b/c`), bottom-right. `aria-hidden`.                  |
| `.workout-card-pick`           | 1px sage border, 20px radius, sage fill on text only    | `var(--grad-hero)` accent-tinted gradient + `var(--glow-accent)` (inset stroke + soft outer glow) + 22px padding |
| `.workout-card-pick` monogram  | —                                                       | 18% opacity, 104px (brighter / bigger — the picked tile owns its identity)                                       |
| `.workout-card-pick-badge`     | Transparent + 1px accent border                         | Glass backdrop + accent border + `box-shadow` soft sage glow                                                     |
| `.stat-number`                 | `font-weight: 500` (44px display)                       | `font-weight: 650` — modern display register (Linear / Stripe), still under shouty 700+                          |
| `.how-to-chev`                 | Character swap `▸` / `▾` on open                        | Always `▸`. CSS `transform: rotate(90deg)` with spring ease when `.how-to-open` set                              |
| `.weekly-slot-A / B / C`       | Flat `color-mix(... 18%)` fill                          | Two-stop gradient `color-mix(... 28%) → color-mix(... 14%)` for depth                                            |
| `.weekly-slot:hover`           | `filter: brightness(1.2)`                               | `filter: brightness(1.15)` + `transform: scale(1.06)` + identity-color `box-shadow` glow                         |
| `.sparkline` (history row)     | Static                                                  | Spring-scale 1.08 + brightness 1.15 when row is hovered                                                          |
| `.history-row-btn`             | Background swap on hover                                | Same + spring-eased transition (parents the sparkline state)                                                     |
| `.weekly-review-link`          | Transparent + border-color hover                        | `var(--grad-surface)` + 1px lift on hover; chevron slides 4px right with spring                                  |

### App.ts changes

- `renderHome()` workout-picker tile: added `<span class="workout-card-monogram" aria-hidden="true">${w.id}</span>` as first child of each tile.
- `renderHowToCard()` chevron: removed `${isOpen ? '▾' : '▸'}` character swap; always renders `▸` so CSS rotation drives the open/close animation.

### What did NOT change

- WORKOUTS, EXERCISE_HOWTO, EXERCISE_VISUALS — locked.
- Hand-routine archive — still archived.
- AppScreen union — no new screens, visual polish only.
- All D-1 tokens still defined. D-1 color discipline preserved (sage = primary action only; rest stays blue-gray; warning stays amber).
- No new fonts, CDNs, libraries. System font stack only.
- The 17 D-1 + Ship-3 + Ship-4 tests still pass unchanged.

---

## Tests — 24 → 27

Three new tests lock in the cooler-look visual contract:

1. **motion + glass tokens defined on `:root`** — verifies `--ease-spring` is a `cubic-bezier(...)`, `--glass-bg` is an `rgba(...)`, `--grad-surface` and `--grad-hero` both resolve, and the hero gradient ≠ the surface gradient (whole point of the split).
2. **workout-picker monograms render** — three `.workout-card-monogram` elements, content "A" / "B" / "C", `aria-hidden="true"` (no screen-reader double-announce).
3. **today's-pick uses gradient + glow** — computed `background-image` contains `gradient`, `box-shadow` ≠ `"none"`, `border-radius` ≥ 18px (the bigger lg value).

If a future change strips gradients, removes monograms, or collapses the hero treatment back to a flat fill, one of these fires.

---

## Screenshots

All saved to `c:\Users\allis\Documents\workout-tracker\after-cooler-*.png` at mobile 390×844, hitting the live production URL after the GH Pages deploy completed.

| File                                | What it shows                                                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `after-cooler-01-home.png`          | Full home with seeded sessions. Top: warmth-tinted h1, glass week-banner + sync chip. Middle: weekly-progress card with gradient depth, slot pills with two-stop gradients. Bottom: workout picker with A/B/C monograms; C is the hero. |
| `after-cooler-02-prelog.png`        | Pre-log. Card has the gradient surface; Start button shows the within-sage gradient with 1px white inset highlight.                                                                                                                     |
| `after-cooler-03-exercise.png`      | Workout A exercise screen. How-to expander, exercise-visual cards, Done · Next all carry the gradient treatment.                                                                                                                        |
| `after-cooler-04-picker-area.png`   | Close-up of the workout picker — the differentiator. You can see the A/B/C monograms in the bottom-right of each card, and C's sage-tinted gradient + glow + bigger radius vs A/B's quiet tiles.                                        |
| `after-cooler-05-weekly-grid.png`   | Close-up of the consistency / 3-per-week card — slot pills now have depth from the two-stop gradient.                                                                                                                                   |
| `after-cooler-06-weekly-review.png` | Weekly review screen (was viewport-wide for this capture). All session cards + totals + delta card share the gradient treatment.                                                                                                        |
| `after-cooler-07-home-top.png`      | Mobile viewport — top of home. Glass chip pair (week-banner + SYNCED), heavier stat numbers (650 weight).                                                                                                                               |

---

## What to look at first

1. **The C card on home.** This is the headline change. Sage-tinted gradient surface + 1px accent stroke + inset accent glow + bigger radius + brighter monogram in the corner. It now answers "what do I do RIGHT NOW" in under a second.
2. **The "SYNCED ✓" chip.** Floating sync state is now a glass pill — backdrop-filter blur. Reads premium.
3. **The slot pills in the consistency card.** Hover one — it springs up 6% and gets an identity-color glow. Was flat before.
4. **The A/B/C monograms.** Quiet, behind the text at 12% (18% on picked). Gives each tile a visual identity without taking space.
5. **Button press.** Tap any button — the 0.96 scale spring-back is more alive than the old 0.98 linear feel.

---

## Risk + rollback

**Risk:** Low. CSS-additive ship + 1 small DOM addition (the monogram `<span>`) + 1 chevron simplification (character swap → CSS rotation). Zero state-machine change, zero data-layer change. Behavior identical.

**Rollback paths:**

1. **One-command revert (preferred):**

   ```bash
   cd c:/Users/allis/Documents/workout-tracker
   git revert --no-edit b987bc6 0966550
   git push origin main
   ```

   Reverts the merge commit + the implementation commit. Restores the D-1 / Ship 3 / Ship 4 baseline exactly.

2. **Surgical revert (keep tokens, drop one piece):** Most pieces are independent. To drop the hero glow but keep gradients, remove `box-shadow: var(--glow-accent);` from `.workout-card-pick`. To drop monograms but keep everything else, remove the `<span class="workout-card-monogram">` from `app.ts:renderHome()` and the 3 related CSS blocks. To drop glass, remove the 3 `backdrop-filter` declarations.

---

## Build / test / deploy log

```
Branch:        cooler-look-2026-05-15 (from main)
Build:         npm run build → tsc clean
Lint:          npm run lint → 0 errors
Format:        npx prettier --write app.ts styles.css tests/app.spec.ts
Format check:  npx prettier --check . → all good
Tests:         npx playwright test → 27 passed (16.9s)
Pre-commit:    husky hook ran format:check + lint + build + test, all green
Commit:        0966550 cooler-look: gradients, glass, spring motion on D-1 base
Merge:         cooler-look-2026-05-15 → main (no-ff, commit b987bc6)
Push:          6888638..b987bc6 main
CI:            success on run 25921095220 (1m29s)
Deploy:        GH Pages auto-deploy verified live via Playwright MCP at
               ~16:45 JDT — production URL serving new styles.css and dist/app.js.
```

---

## Hard constraints honored

- WORKOUTS / EXERCISE_HOWTO / EXERCISE_VISUALS — untouched.
- Hand-routine archive — preserved.
- No new fonts, CDNs, libraries.
- No motivational language; no streak nags; no "great job!" / no gamification.
- No paternalism — system surfaces state, never tells.
- All D-1 tokens stay defined; new tokens added, nothing removed.
- 24 → 27 tests, all green. Pre-commit hook passed first try.
- `npx prettier --check` clean.
- Hebrew RTL N/A (English app).
- No new screens; visual polish only.
