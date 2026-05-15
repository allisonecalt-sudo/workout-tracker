# How-To Multi-Frame Content Build — 2026-05-15

**Branch:** `howto-content-2026-05-15` (merged to `main`, deployed live)
**Live:** https://allisonecalt-sudo.github.io/workout-tracker/
**Trigger quote (Allison, May 15 2026):** _"i like that the videos are mebdee but the descriptions should also be images with explaantions net tot them can include what to do and comon mistake"_

## What shipped

The text-only "📖 How to do it" expander now renders a **3-4 frame visual guide** with paired **Do:** / **Avoid:** cues beside each frame. The YouTube video embeds Allison liked are unchanged — this replaces the paragraph-of-text panel, not the video poster.

**Coverage: 24 / 24 exercises in WORKOUTS** got the full multi-frame treatment. No fallback to legacy `EXERCISE_GUIDE` text in any active rotation.

| Group                 | Exercises                                                                                                                                                                                       | Frame source                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Warmup walks          | Outdoor walk                                                                                                                                                                                    | 1 SVG icon + 2 free-exercise-db JPGs                    |
| Breathing             | Belly breathing, Slow breathing                                                                                                                                                                 | Hand-coded SVG (3 + 2 frames)                           |
| Glute prep            | Glute squeezes, Pelvic tilts                                                                                                                                                                    | SVG / JPG mix                                           |
| Main A/B              | Bodyweight squats, Glute bridges, Wall sit, Clamshells, Modified dead bug, Forearm plank, Side-lying leg raises, Single-leg glute bridges, Slow supine bicycle, Standing calf raises, Heel taps | Mostly 2 free-exercise-db JPGs + 1 SVG corrective frame |
| Cooldown              | Knees-to-chest hold, Figure-4 stretch, Seated forward fold, Slow breathing                                                                                                                      | 2 JPGs + 1 timing-SVG, or pure SVG                      |
| Wrist PT (Lisa Cohen) | Left/Right wrist stretch, Left/Right flexion/extension (tuna can), Left/Right radial deviation (tuna can)                                                                                       | Hand-coded SVG (2 or 1 frame, protocol-literal cues)    |

## Frame format chosen per exercise — and why

**free-exercise-db JPGs (priority 1):** Same Unlicense / public-domain pairs we used for the primary visual layer (May 2026). They are start + end snapshots of a real human doing the move. We reused these as frames 1 & 2 of the multi-frame guide. **12 exercises** use them.

**Hand-coded SVG (priority 2):** For exercises where free-exercise-db has no clean match (wall sit, clamshells, forearm plank), or where the corrective ("don't do this") frame benefits from a glanceable diagram (bodyweight squats knees-caving-in, modified dead bug back-arching, glute bridges over-arching, knees-to-chest tailbone lift). Style: minimal stick figures, accent-green for correct, warning-amber for hint, danger-orange for wrong. Each SVG is ~10-30 lines, embedded inline (no extra HTTP requests).

**Refused: AI image gen, YouTube screen-grabs, new CDNs, custom fonts** — per the constraint list.

## Health-constraint cues integrated

Every palm-load risk surface (forearm plank, dead bug, knees-to-chest, glute bridges, single-leg bridges, side-lying leg raises) has an `Avoid:` line that explicitly says **"forearms only — wrists still off"** or **"don't load palms"**. The forearm plank entry leads with **"DON'T drop to palms — forearms only, wrists off"** in the very first frame's Avoid line, because that's the new May 15 clearance boundary and the highest-risk move.

Back protection lines on bridges, dead bug, pelvic tilts, plank ("don't arch lower back" / "don't sag"). Knee-protection line on squats ("don't push past pain ceiling"). Wrist-PT entries quote Lisa Cohen's protocol literally — no editorializing.

## Design tradeoffs

- **Single-column stack on mobile (< 480px), image-left two-column on desktop.** Decided against horizontal carousel: the bar is "phone on shelf mid-set, 2-second glance" — scrolling vertically is what the user's already doing, no new gesture to learn.
- **All SVGs inline (no external file requests).** Each is ~10-30 lines. Total payload added: ~15 KB raw, well within the inline-everything budget for this app.
- **JPG + SVG can coexist in the same exercise.** Most squats / bridges / dead-bug entries are 2 JPGs (real frames) + 1 SVG ("here's the mistake to avoid"). The mistake-SVG is more glanceable than another JPG would be — red Xs and stark stick figures read instantly.
- **Kept `EXERCISE_GUIDE` text as a fallback.** Per archive-not-delete rule. `renderHowToCard` prefers `EXERCISE_HOWTO` and falls back to the legacy text if a future exercise is added without a mapping. Tests cover both paths.
- **First-time-this-week auto-open behavior preserved.** Allison gets the full visual guide on every new exercise the first time she sees it each week, then it collapses for the remaining 2 visits.

## What to test first on her phone

1. **Workout A → "Start" → walk through warmup.** Watch how it feels to scroll past Outdoor walk → Belly breathing → Pelvic tilts. Each should give her 2-3 second glance value without reading.
2. **Bodyweight squats** in main block. 4 frames including the knees-caving-in SVG — that's the busiest entry and the design-quality test.
3. **Wall sit.** Pure SVG, 3 frames including a "knees past toes" mistake frame.
4. **Forearm plank** (week 3 hero exercise). Pure SVG, 3 frames. First frame explicitly calls out "forearms only — wrists off" in Avoid. This is the workout-routine + medical-constraint surface where the system most has to say the right thing.
5. **Tap the expander closed and re-open.** Should preserve state per-exercise.

## Licensing summary

| Source                     | License                        | Used for                                                                         |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `yuhonas/free-exercise-db` | Unlicense (public domain)      | 12 exercises × 2 JPG frames each (already cached in `assets/exercises/`)         |
| Hand-coded SVG (this file) | CC0-equivalent — original work | All breathing, wall sit, clamshells, forearm plank, calf raises, wrist-PT frames |

No external CDN added. No AI-generated content. No YouTube content scraped or copied. YouTube embeds in `exercise-visuals.ts` remain unchanged — only the text-only how-to panel changed.

## Files touched

- **New:** `exercise-howto.ts` (~1000 lines — 24 exercise entries + SVG primitives)
- **Modified:** `app.ts` (renderHowToCard rewritten to multi-frame, EXERCISE_GUIDE preserved as fallback)
- **Modified:** `styles.css` (~125 lines added for `.howto-frame`, responsive stacking, Do/Avoid color tokens)
- **Modified:** `tests/app.spec.ts` (2 new tests: multi-frame rendering + fallback path)
- **Modified:** `package.json` (added `exercise-howto.ts` to lint scope)
- **Modified:** `.prettierignore` (added `archive/` so parallel hand-routine workstream doesn't fight format check)

## CI / deploy

- All 14 Playwright tests green (12 existing + 2 new).
- TypeScript build clean, ESLint clean, Prettier check clean.
- 2 commits on `howto-content-2026-05-15`, merged to main via `--no-ff`, pushed.
- CI run 25914875829 succeeded (1m 31s).
- Live screenshots: `after-howto-01-home.png` through `after-howto-07-wall-sit-svg.png` in repo root.

## What's NOT in scope (deferred)

- The parallel hand-routine archive workstream is running concurrently. We left `archive/hand-routine-2026-05-15/` and all hand-routine code in app.ts untouched. Stashed those unstaged changes during commit and restored them after.
- Stashed change still in working copy: a week-offset navigation feature in app.ts (`viewedWeekOffset`, `getViewedProgramWeek`, `getWeekCount`) — that's a different workstream's in-flight work. Untouched by this build.

## If she hates a specific frame

Edit `exercise-howto.ts` — each entry is a self-contained object. Change `do`, `avoid`, swap `image` for `svg` (or vice versa), or delete a frame. Order in the array = order on screen. The SVGs are inline strings; modify directly. No build pipeline gotchas — TypeScript build picks it up, push.
