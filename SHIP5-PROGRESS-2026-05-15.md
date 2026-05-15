# Workout-Tracker Ship 5 — Progress Screen (2026-05-15)

**Branch merged:** `ship5-progress-2026-05-15` → `main`
**Commits on main:** `9a26c21` (Ship 5 implementation), `38827e7` (merge)
**Live URL:** https://allisonecalt-sudo.github.io/workout-tracker/
**Tests:** 31 of 31 green (27 carried forward + 4 new for Ship 5)
**CI:** success on run `25921836820`
**Author:** Lead-developer agent (autonomous per `feedback_lead_developer_autonomy.md`, Allison's "just go till the end")

---

## What shipped — Ship 5

A new `AppScreen` mode `'progress'` — read-only longitudinal view across her entire history. The screen reports her data; it does **not** editorialize. No motivational language, no goals beyond the 3/week target that already exists, no "you should." Charts are hand-built inline SVG; no external libraries, no chart.js, no D3.

### Where to tap to reach it

- **From home:** new `📈 Progress →` chip directly below the existing `📊 Weekly review →` chip. Same surface treatment (gradient + glass-on-hover), so the two read as a chip pair.
- **From history-detail:** new `📈 View progress →` link above the "Back to history" button. Lets her drill from a single session straight into the longitudinal view.
- Back chevron in the screen header returns to home (`× Back`).

### What she sees — cards top to bottom

| Card                          | Type                   | Headline number / line                                                                                                                                                    |
| ----------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wall sit · seconds held**   | Line chart (220px)     | Big max number in display weight 650; dashed `max` guideline; emphasized last point (6px circle).                                                                         |
| **Capacity · before → after** | Two-line chart (220px) | Avg before / avg after readout below; legend dots (before in `--text-dim`, after in `--accent-progress`).                                                                 |
| **Back pain · 0–10**          | Bar chart (140px)      | One bar per session in `--accent-warn`; zero-pain bars omitted (transparent reads cleaner than a row of zero-height rects). Avg averages only sessions where pain logged. |
| **Sessions per week**         | Horizontal bar chart   | One row per program week from May 2 forward. Dashed target line at x=3. "Hit target X of Y weeks." Just the number.                                                       |
| **Exercise breakdown**        | Collapsible list       | Closed by default. Inside: each WORKOUTS exercise with its session count + (for wall sit) max seconds. Reference, not primary.                                            |

### Calm delta voice

The wall-sit delta line is the one bit of text that could've drifted into motivational territory. It does not:

| Trend | Output                                |
| ----- | ------------------------------------- |
| up    | `+12s since first session` (sage)     |
| down  | `-4s since first session` (dim gray)  |
| flat  | `same as first session` (dimmer gray) |

No "great work." No "you got this." No "keep going." Per the voice rule + agency rule in CLAUDE.md and `feedback_no_capacity_paternalism.md`.

### Empty state

Fewer than 2 sessions logged → single italic line: _"Progress shows once you have 2+ sessions logged."_ No nudge, no encouragement. The header `N sessions since May 2` still renders honestly (0 / 1).

If she has exactly 1 wall-sit value, the wall-sit card renders the number alone with a note: _"One value logged — chart appears after 2+ wall-sit sessions."_

### Layout sequence on home

1. Header (unchanged)
2. Week-banner + sync chip (unchanged)
3. Weekly progress card (unchanged)
4. Consistency · 3 per week (unchanged)
5. **`📊 Weekly review →`** chip (existing)
6. **`📈 Progress →`** chip (NEW)
7. Pick today's workout (unchanged)
8. Recent workouts (unchanged)

---

## Implementation

### `app.ts` changes (+540 lines)

- `AppScreen` union extended with `'progress'`.
- `AppState` extended with `exerciseBreakdownOpen: boolean` (default false).
- New chronological-order helper `getChronologicalLogs()` since `loadLogs()` is newest-first.
- Three generic SVG chart builders:
  - `renderProgressLineChart(series, opts)` — 220px line chart, supports multiple series sharing the y-axis, optional dashed max guideline, optional emphasized last point.
  - `renderProgressBarChart(values, opts)` — 140px vertical bar chart for categorical data (back pain).
  - `renderProgressHorizontalBars(rows, opts)` — variable-height horizontal bars with a dashed target line (sessions-per-week).
- Five per-card render functions: `renderWallSitTrendCard`, `renderCapacityTrendCard`, `renderBackPainTrendCard`, `renderSessionsPerWeekCard`, `renderExerciseBreakdownCard`.
- Top-level `renderProgress()` composes the cards + handles empty state.
- Two new `bindClick` handlers: `open-progress-link` (home) + `open-progress-from-detail` (history-detail), plus `toggle-exercise-breakdown`.
- History-detail screen got a `📈 View progress →` link inserted before the "Back to history" button.

### `styles.css` changes (+261 lines)

All new selectors prefixed `.progress-*`. No tokens redefined; the only color-mix is in `.progress-stat-big` which echoes the cooler-look h1 treatment (`color-mix(in srgb, var(--accent) 6%, var(--text))`). Highlights:

| Selector                                      | Purpose                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `.progress-subtitle`                          | Quiet "N sessions since May 2" header                         |
| `.progress-empty`                             | Italic centered single-line empty state                       |
| `.progress-screen`                            | Flex column gap-16 wrapper for all cards                      |
| `.progress-card`                              | Inherits `.card` surface (`--grad-surface` + border + radius) |
| `.progress-card-label`                        | Small-caps `--font-micro` label with letter-spacing           |
| `.progress-stat-big`                          | Display number, weight 650, `--font-display`, slight warmth   |
| `.progress-chart-wrap` / `-bar` / `-hbar`     | Height boxes for the three chart variants                     |
| `.progress-legend` / `-dot-before` / `-after` | Two-dot legend on capacity card                               |
| `.progress-delta-up` / `-down` / `-same`      | Calm direction colors (sage / dim / dim-2 — no warn red)      |
| `.progress-breakdown-toggle`                  | Collapsible chevron with spring rotation on open              |
| `.progress-breakdown-badge-A/B/C`             | Workout-identity dot badges using `--dot-a/b/c` at 80%        |
| `.progress-chart-wrap:hover .progress-chart`  | Light filter:brightness lift on hover (no scale — calm)       |

### `tests/app.spec.ts` changes (+155 lines)

4 new tests under a Ship 5 section header:

1. **`ship 5: progress screen reachable from home button`** — `#open-progress-link` visible, click navigates, h2 reads "Progress", subtitle contains "since May 2".
2. **`ship 5: wall-sit line chart renders with 2+ wall-sit values`** — Seeds 3 A-workouts with rising wall-sit (18 → 25 → 30s). After click, big stat shows `30s`, at least one `.progress-chart` visible, delta line contains `+12s`, no motivational language (`great`, `you got`).
3. **`ship 5: empty state renders for fewer than 2 sessions`** — Empty localStorage, click → `.progress-empty` visible, text contains "Progress shows once you have 2+", zero charts rendered, no motivational language.
4. **`ship 5: back-pain bars render only for sessions with backPain > 0`** — Seeds 4 sessions (pain 0, 1, 0, 3). After click, `.progress-chart-bar` visible, `rect` count = 2 (only the pain > 0 rows render bars).

---

## Hard constraints honored

- WORKOUTS / EXERCISE_HOWTO / EXERCISE_VISUALS / Supabase schema — untouched.
- Hand-routine archive + year-grid archive — untouched.
- No new external libraries, no CDN, no font change.
- No new color tokens — only D-1 + cooler-look additions.
- No paternalism. No goals. No "you should." No motivational language anywhere.
- Voice rule honored — charts show her data; no Claude interpretation overlay.
- Pre-commit hook (`format:check && lint && build && test`): passed first try.
- Port 3000 stray PID killed before Playwright.
- `npx prettier --check .` clean across the whole repo.
- Tests: 27 → 31, all green.

---

## Screenshots

All saved to `c:\Users\allis\Documents\workout-tracker\after-ship5-*.png` at mobile 390 × 844, hitting the live production URL after the GH Pages deploy.

| File                                           | What it shows                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `after-ship5-01-home-chips.png`                | Home with both `📊 Weekly review →` and the new `📈 Progress →` chip below it. Sibling treatment, paired register.                                    |
| `after-ship5-02-progress-top.png`              | Progress screen top — "7 sessions since May 2" subtitle, **Wall sit** card with big `30s` display number, line chart with `max` guideline + emph dot. |
| `after-ship5-03-progress-full.png`             | Full-page scroll capture of the entire progress view — all 5 cards from wall sit through exercise breakdown.                                          |
| `after-ship5-04-progress-capacity.png`         | Capacity card close-up — two lines (before in dim gray, after in sage), legend dots, "Avg before 4.3 · Avg after 5.0" readout.                        |
| `after-ship5-05-progress-backpain-perweek.png` | Back-pain bars (amber, only non-zero rows render) + Sessions-per-week horizontal bars with the dashed target line.                                    |
| `after-ship5-06-progress-breakdown-open.png`   | Exercise-breakdown card after toggle interaction. (Note: the chevron caps the card; scroll-into-view ran after the re-render.)                        |
| `after-ship5-07-progress-empty.png`            | Empty-state screen — "0 sessions since May 2" subtitle + italic "Progress shows once you have 2+ sessions logged." line. No nudge anywhere.           |

---

## What's still deferred — Ship 6

The original deferred-ships plan still has one more:

| Ship                           | Scope                                                                                                                               | Effort         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Ship 6 — Settings + polish** | Settings screen (units, week-start, sync toggle, archive year-grid toggle); spring-physics screen transitions; final motion polish. | ~0.5–1 session |

Ship 6 is the closing pass. After that, the redesign sequence wraps.

---

## Risk + rollback

**Risk:** Low. Implementation is purely additive: one new `AppScreen` value, one new state-machine case, ~540 lines of read-only chart code, one new state boolean for the collapsible. Zero schema changes, zero data-layer changes, zero existing-behavior changes. The new chip on home is the only structural DOM addition outside the new screen.

**Rollback paths:**

1. **One-command revert (preferred):**

   ```bash
   cd c:/Users/allis/Documents/workout-tracker
   git revert --no-edit 38827e7 9a26c21
   git push origin main
   ```

2. **Surgical revert (keep code, hide entry point):** Remove the `<button class="weekly-review-link progress-link" id="open-progress-link" ...>` block from `renderHome()` and the `📈 View progress →` link from `renderHistoryDetail()`. The progress screen stays in code but becomes unreachable from the UI. Zero data risk.

3. **Surgical revert (drop one card):** Each `render*Card` is independently called from `renderProgress()`. Remove the call to drop that card alone.

---

## Build / test / deploy log

```
Branch:        ship5-progress-2026-05-15 (from main)
Build:         npm run build → tsc clean
Lint:          npm run lint → 0 errors
Format:        npx prettier --write app.ts styles.css tests/app.spec.ts (already clean)
Format check:  npx prettier --check . → all good
Port 3000:     killed via netstat | xargs taskkill
Tests:         npx playwright test → 31 passed (12.7s)
Pre-commit:    husky hook ran format:check + lint + build + test, all green
Commit:        9a26c21 ship 5 (progress): longitudinal progress screen with hand-built SVG charts
Merge:         ship5-progress-2026-05-15 → main (no-ff merge, commit 38827e7)
Push:          dfde1be..38827e7 main
CI:            success on run 25921836820 (build + deploy steps both green)
Deploy:        GH Pages auto-deploy verified live; production URL serving new
               styles.css and dist/app.js. 7 screenshots captured at 390×844.
```

---

## Voice + agency check — final pass

Re-read every visible string on the Progress screen against the design rules. Each line is either:

- a label of what's being shown (e.g. "Wall sit · seconds held", "Capacity · before → after"),
- her own data quoted back (e.g. "30s", "Avg 2.2 across 5 sessions where pain logged."),
- or a calm directional delta ("+12s since first session" / "same as first session").

No "should." No "you." No "great." No "keep going." No "amazing." No goal language beyond the 3/week target line that already lives elsewhere in the app. The screen reports — it never tells.
