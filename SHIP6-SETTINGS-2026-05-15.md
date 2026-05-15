# Workout-Tracker Ship 6 — Settings + Final Motion Polish (2026-05-15)

**Branch merged:** `ship6-settings-2026-05-15` → `main`
**Commits on main:** `b1ae7ea` (Ship 6 implementation), `24321b5` (merge)
**Live URL:** https://allisonecalt-sudo.github.io/workout-tracker/
**Tests:** 36 of 36 green (31 carried forward + 5 new for Ship 6)
**CI:** success on run `25922818664`
**Author:** Lead-developer agent (autonomous per `feedback_lead_developer_autonomy.md`, "just go till the end")

This is the FINAL ship of the multi-day redesign sequence. After this, the app's redesign pass is complete.

---

## What shipped — Ship 6

A new `AppScreen` mode `'settings'` reached from a quiet gear icon (`⚙`) in the home header — NOT another chip below the Weekly review / Progress links. Settings doesn't deserve that primacy: it's reference, not action. The icon is a 36px circular text-icon in `--text-dim`, top-right of the title row, with a spring-eased press-back rotate that reads "tap-to-settle" without being playful.

### Screen layout — five cards, top to bottom

| Card        | What's inside                                                                                                                                                                                         | Persistence key                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Audio**   | Beep sounds toggle (default on)                                                                                                                                                                       | `workout-tracker:setting-beeps`                                                      |
| **Timing**  | Rest duration stepper (5-180s, step 5, default 60) + Pre-countdown stepper (0-10s, step 1, default 3; 0 skips entirely)                                                                               | `workout-tracker:setting-rest-sec`, `workout-tracker:setting-pre-count`              |
| **Display** | "Expand How to do it first time per week" toggle (default on) + "Auto-suggest today's workout" toggle (default on)                                                                                    | `workout-tracker:setting-howto-first-expand`, `workout-tracker:setting-auto-suggest` |
| **Data**    | Export sessions (downloads `workout-tracker-export-YYYY-MM-DD.json`) + Import sessions (file picker, merge-by-id with local-wins) + Hold-to-clear destructive button (500ms hold, Supabase preserved) | n/a (uses `workout-tracker:logs` directly)                                           |
| **About**   | "Workout Tracker" title + build stamp (`2026-05-15 build`) + Source-on-GitHub link + "Made by Allison + Claude." caption                                                                              | n/a                                                                                  |

### Settings helpers — safe-default contract

A generic `getSetting<T>(key, defaultValue)` + `setSetting<T>(key, value)` pair hides localStorage details. The contract: if a value is missing, corrupt, type-mismatched, or out-of-range, fall back to default. **The app never crashes on a bad setting value.** All five setting-specific getters (`getBeepsEnabled`, `getRestSec`, `getPreCountSec`, `getHowToFirstExpand`, `getAutoSuggestEnabled`) clamp + sanity-check before returning.

### Where each setting actually fires

| Setting            | Wired into                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beeps              | `playBeep()` — returns early when off, before audio context check. Skips count beeps, finish beep, go beep.                                                                                                                        |
| Rest duration      | `startRestTimer()` reads `getRestSec()` instead of a constant. Rest screen's ring also reads it for the dasharray math.                                                                                                            |
| Pre-countdown      | `startPreCountdown()` reads `getPreCountSec()`. If 0, skips the timer entirely and proceeds to next phase.                                                                                                                         |
| How-to auto-expand | `renderHowToCard()` resolves `isOpen` as "user-opened OR (autoExpand AND isFirstThisWeek AND not userClosed)". When the setting is off, the auto-expand branch never fires, so the panel stays collapsed unless the user opens it. |
| Auto-suggest       | `renderHome()` — `todaysPick: WorkoutId \| null` is null when off. The pick badge + accent-gradient treatment don't render; all three tiles read equally.                                                                          |

### Data section — Allison's archive rule

The Clear button is explicit about preservation: `Wipes localStorage only. Your Supabase rows are preserved.` Hits her archive-not-delete principle. The Supabase keep-alive is independent; clearing local data doesn't disable sync.

Import is **merge-only**: existing local entries win on conflict. Three reasons:

1. Local is the source-of-truth between syncs.
2. Bad imports can't overwrite good data.
3. Re-imports of the same file are idempotent.

The validator (`isValidLogEntry`) accepts only entries with valid `date`, `workout` (A/B/C), and numeric capacity/wallSit/backPain fields. Anything else is dropped silently from the merge, with a status banner reporting how many entries were imported vs how many were new.

---

## Part B — Final motion polish

### 1. Screen transitions

The `#app` root element gets `.screen-enter` class on every render that isn't `workout`, `pre-log`, or `post-log` (which would feel laggy mid-rep). The class drives a 220ms keyframe:

```css
@keyframes screen-enter-anim {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
#app.screen-enter {
  animation: screen-enter-anim 0.22s var(--ease-spring);
}
```

`--ease-spring` is the cooler-look `cubic-bezier(0.34, 1.56, 0.64, 1)` — 8% overshoot on settle. Honors `prefers-reduced-motion`. Re-trigger uses `void root.offsetWidth` after class-remove to force reflow before re-adding.

### 2. Hold-to-confirm Quit

The Quit text-link in the workout header now supports two paths:

- **Click (≤500ms press) →** `window.confirm()` (the existing `confirmQuit()` path). Keyboard activation + headless dialog tests still work unchanged.
- **Long-press (`pointerdown` ≥ 500ms) →** slide-out in-app panel with `Cancel` / `Quit` buttons. Click suppression prevents the click from also firing `window.confirm`.

The panel is a fixed-overlay on the body with `backdrop-filter: blur(4px)`, a bottom-anchored card with `transform: translateY(100%)` → `translateY(0)` driven by spring ease over 280ms. Tap-outside dismisses. The destructive Quit button uses `accent-danger` mixed at 22%.

### 3. Hold-to-confirm Clear (Settings)

Re-uses the existing `wireHoldToSkip()` helper (`hold-fill` width animates 0%→100% over 500ms via rAF). New `.hold-to-confirm` variant restyles the fill in `accent-danger` at 28% opacity. Same machinery; different visual register.

### 4. Sparkline + slot pill verified

Both the cooler-look sparkline spring scale (`history-row-btn:hover .sparkline`) and the slot-pill identity-glow on hover were checked end-to-end in the live build. Both still working.

### 5. Beep + timer respect their settings

- `playBeep()` short-circuits when `getBeepsEnabled()` is false.
- `startRestTimer()` reads `getRestSec()`. `startPreCountdown()` reads `getPreCountSec()`, and skips the timer entirely when set to 0.

---

## Tests — 31 → 36

Five new tests under a Ship 6 section header at the bottom of `tests/app.spec.ts`:

1. **`ship 6: settings reachable from gear icon in home header`** — `#open-settings` visible on home, click navigates, `h2` reads "Settings", 5 `.settings-section-label` cards render, Back returns home.
2. **`ship 6: beep toggle persists to localStorage`** — Default checked, force-click toggles off, `workout-tracker:setting-beeps` localStorage key reads `'false'`.
3. **`ship 6: rest duration stepper updates value and persists`** — Default `60s`, `#rest-inc` twice → `70s`, persists as `'70'`. 20× `#rest-dec` clamps to `5s`.
4. **`ship 6: export sessions downloads a JSON file`** — Seeds a session, opens settings, clicks Export, asserts the download's `suggestedFilename()` matches `^workout-tracker-export-\d{4}-\d{2}-\d{2}\.json$`.
5. **`ship 6: clear-data hold-to-confirm wipes localStorage`** — Seeds a session, opens settings, scrolls clear into view, holds for 700ms, asserts `workout-tracker:logs` is null and status banner contains "cleared".

All 36 tests pass via Husky pre-commit hook (`format:check && lint && build && test`) on first try.

---

## Screenshots

All saved to `c:\Users\allis\Documents\workout-tracker\after-ship6-*.png` at mobile 390×844, hitting the live production URL after the GH Pages deploy.

| File                                    | What it shows                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `after-ship6-01-home-with-gear.png`     | Home with the new gear icon top-right of the title — quiet 36px circular button, doesn't compete with the action chips below. |
| `after-ship6-02-settings-top.png`       | Settings top — Audio + Timing + start of Display. All toggles ON state (sage-gradient fill), thumb translated right.          |
| `after-ship6-03-settings-full.png`      | Full-page scroll capture of the Settings screen — Audio → Timing → Display → Data → About.                                    |
| `after-ship6-04-settings-toggles.png`   | Beep + How-to toggles in the OFF state — bg-elev-3 fill, thumb left-aligned, warm-white.                                      |
| `after-ship6-05-settings-steppers.png`  | Timing card after stepper bumps — Rest at `75s`, Pre-countdown at `5s`.                                                       |
| `after-ship6-06-quit-confirm-panel.png` | Long-press Quit confirm panel — slide-up from bottom, backdrop blur, Cancel (neutral) + Quit (warn-red) buttons.              |

---

## Constraints honored

- WORKOUTS / EXERCISE_HOWTO / EXERCISE_VISUALS / Supabase schema — untouched.
- Hand-routine archive + year-grid archive — still archived.
- No new external libraries / CDNs / fonts.
- No paternalism — every setting is invitational, defaults to "let her do the thing." Off-state caption explains the consequence, never lectures.
- All 31 pre-Ship-6 tests still pass unchanged. 5 added.
- Safe defaults: every setting has a sanity-check + clamp. A corrupted localStorage value falls back silently to default.
- Pre-commit hook (`format:check && lint && build && test`) ran the full suite green on first attempt.
- Port 3000 stray-serve killed before Playwright run.
- `npx prettier --check .` clean across the whole repo.
- Hold-to-confirm Clear preserves Supabase data — local-only wipe per the archive-not-delete rule.

---

## What is NOT in the app — deliberate omissions

Settings made it tempting to add a list of toggles for things we don't actually want. The following are **deliberately absent** because Allison didn't ask for them and they'd drift the app off-character:

- **Gamification** — no XP, no badges, no levels, no "PR" celebration banner.
- **Streaks** — sessions/week is shown, but streak counts (consecutive days) are intentionally absent. Streaks reward fragility.
- **Push notifications** — no reminders, no nudges, no "you haven't worked out in 3 days." She knows.
- **Social features** — no leaderboards, no share-to-Instagram, no friend invites.
- **Calorie tracking** — wrong domain. This is a movement-execution app, not a metabolic-accounting tool.
- **Goal-setting beyond 3/week** — the 3/week target already lives in the consistency card. No "set a goal" CTA.
- **Account/login** — Supabase is service-tier-anon. No user accounts; no auth complexity to maintain.
- **Music / playlist integration** — not the app's job.
- **Heart-rate / wearable sync** — out of scope.

If any of these turn out to be missing later, they can be added — but they'd be a deliberate scope expansion, not a "I forgot."

---

## Build / test / deploy log

```
Branch:        ship6-settings-2026-05-15 (from main)
Build:         npm run build → tsc clean
Lint:          npm run lint → 0 errors
Format:        prettier --check . → all good (no rewrites needed)
Port 3000:     killed via netstat | xargs taskkill
Tests:         npx playwright test → 36 passed (12-15s)
Pre-commit:    husky hook ran format:check + lint + build + test, all green
Commit:        b1ae7ea ship 6 (settings + polish): Settings screen, screen transitions, hold-to-confirm Quit
Merge:         ship6-settings-2026-05-15 → main (no-ff merge, commit 24321b5)
Push:          6f2b3eb..24321b5 main
CI:            success on run 25922818664 (1m43s; build + deploy both green)
Deploy:        GH Pages auto-deploy verified live; production URL serving new
               styles.css and dist/app.js. 6 screenshots captured at 390×844.
```

---

## The redesign sequence — wrapped

For the record, the multi-day redesign push from `REDESIGN-RESEARCH-2026-05-15.md` is now complete:

| Ship                           | Doc                                       | What it brought                                                                                  |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Ship 1 — D-1 calm**          | `D1-IMPL-2026-05-15.md`                   | Calm-tool-minimalism base. Role-named accent tokens. Display-weight stat numbers. New type ramp. |
| **Ship 2 — Visual layer**      | (folded into Ship 1)                      | Multi-frame how-to, Do/Avoid cues, video expanders, exercise-visual images.                      |
| **Ship 3 — Data viz**          | `SHIP3-DATAVIZ-2026-05-15.md`             | Wall-sit sparkline on history rows, weekly-target grid replacing year heatmap.                   |
| **Ship 4 — Weekly review**     | `SHIP4-WEEKLY-REVIEW-2026-05-15.md`       | Standalone screen aggregating the week's sessions for Friday-evening reflection.                 |
| **Cooler-look pass**           | `COOLER-LOOK-2026-05-15.md`               | Linear/Stripe register. Gradients, glassmorphism, spring overshoot, A/B/C monograms.             |
| **Ship 5 — Progress**          | `SHIP5-PROGRESS-2026-05-15.md`            | Longitudinal data view. Hand-built SVG charts, no library.                                       |
| **Ship 6 — Settings + polish** | `SHIP6-SETTINGS-2026-05-15.md` (this doc) | Settings screen. Screen transitions. Hold-to-confirm.                                            |

Today: ~60-90 minute Ship 6 budget, exact commits this session: 1 (b1ae7ea, the implementation) + merge (24321b5). Across the full redesign sequence: roughly 7 ship-commits + merges, 36 total passing tests, ~7 ship-docs, ~30 screenshots, and 8+ new AppScreen-level structures or visual registers landed.

The redesign sequence is wrapped. The app stays calm, dense, hand-built. The only thing left to do is keep using it.

---

## Risk + rollback

**Risk:** Low. All Ship 6 changes are additive: one new `AppScreen` value, one new screen render, ~370 new lines of settings logic, ~410 new lines of CSS. The pre-existing rest/pre-countdown constants now read from settings — but the defaults match the old constants exactly, so behavior is unchanged for any user who never touches Settings.

**Rollback paths:**

1. **One-command revert (preferred):**

   ```bash
   cd c:/Users/allis/Documents/workout-tracker
   git revert --no-edit 24321b5 b1ae7ea
   git push origin main
   ```

2. **Surgical revert (keep code, hide entry point):** Remove the `<button class="settings-icon-btn" id="open-settings" ...>` block from `renderHome()`. The Settings screen stays in code but becomes unreachable. Zero data risk.

3. **Surgical revert (drop one section):** Each of the 5 settings cards is a separate block in `renderSettings()`. Remove a block to drop that section.
