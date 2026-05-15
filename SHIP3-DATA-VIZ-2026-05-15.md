# Workout-Tracker Ship 3 — Data Visualization (2026-05-15)

**Branch merged:** `ship3-data-viz-2026-05-15` → `main`
**Commits on main:** `f0605aa` (Ship 3 implementation), `347142f` (merge)
**Live URL:** https://allisonecalt-sudo.github.io/workout-tracker/
**Tests:** 20 of 20 green (17 carried forward + 3 new for Ship 3)
**CI:** success on run 25916474595
**Author:** Lead-developer agent (autonomous run per `feedback_lead_developer_autonomy.md`, Allison's 14:47 JDT "continue")

---

## What shipped — Ship 3

Two inline-SVG additions, no external libraries, no build-step changes. Both match the D-1 visual language locked in Ship 1: no drop shadows, 1px borders, role-named accent tokens, the new type scale.

### A. Wall-sit sparkline on history rows

Where: every history row whose `wallSitSec > 0`, both on the home "Recent workouts" list and the full History screen.

| Spec               | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| Geometry           | 80 × 20 px, 2px padding                                      |
| Stroke             | 1.5px, `var(--accent-progress)` (muted sage)                 |
| End-point dot      | 2px filled circle in `var(--accent)` (the only shouty green) |
| Data window        | Last 10 wall-sit values, chronological (oldest → newest)     |
| Empty-state policy | < 2 values → skip render (flat line reads as broken)         |
| Click target       | The row button itself (sparkline has `pointer-events: none`) |
| Aria-label         | "wall sit 18 to 30s, trending up" — direction-aware          |
| Native tooltip     | `<title>` element inside the SVG                             |

The sparkline reads as a quiet trend line, not a chart. It sits inline next to the date+duration line on each A-workout row. B and C rows (no wall sit) get no sparkline, no flat line, no "no data" placeholder — they're just unornamented.

The current row's value is always the rightmost point. So when she scrolls back through history, each row's sparkline shows the trend up to and including that session — past-her seeing her own progression from that vantage point. (Implementation detail: `getWallSitTrend(allLogs, uptoLogId)` slices the chronological array to the row's position before drawing.)

### B. Year-grid heatmap on home

GitHub-contributions-style grid, slotted between the weekly-progress card and the workout-picker.

| Spec              | Value                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Grid shape        | 7 rows × N weeks                                                                                                                    |
| Row order         | Sat / Sun / Mon / Tue / Wed / Thu / Fri (her week per `reference_week_definition.md`)                                               |
| Cell size         | 6 × 6 px, 2px gap                                                                                                                   |
| Cell colors       | `--dot-a` sage / `--dot-b` steel / `--dot-c` mauve (the desaturated workout-identity tokens from Ship 1)                            |
| Empty days        | Transparent fill + 1px `--border-strong` stroke (just a tiny rectangle outline)                                                     |
| Today's cell      | 1px `--accent` stroke (sage outline)                                                                                                |
| Row labels        | 8px small-caps "SAT SUN MON TUE WED THU FRI" in `--text-dim-2` at the leftmost column                                               |
| Month headers     | 9px small-caps "MAY JUN…" positioned at column transitions                                                                          |
| Date range        | < 5 sessions → from `PROGRAM_START_DATE` (May 2, 2026) forward. ≥ 5 sessions → up to 52 weeks back, but never before program start. |
| Future days       | Not rendered (no empty future cells)                                                                                                |
| Heading           | "**Consistency** · sessions per week" (small-caps `--text-dim-2`)                                                                   |
| Stat on the right | Current-week session count in `--accent-progress` muted-sage at h2 size: "**2 of 3**" / "THIS WEEK"                                 |
| Scroll            | Horizontally scrollable container; 4px sage-stroke scrollbar                                                                        |
| Click             | Cells with sessions → `data-detail` → history-detail screen for that session                                                        |
| Native tooltips   | `<title>` inside each `<rect>` — "May 11 · Workout A · capacity 5→5"                                                                |

Sparse-data scoping is the critical detail. As of today (May 15), Allison has roughly 5 sessions logged across 2 weeks of program time. A full 52-week back-look would render 357 empty cells and 5 colored ones — visually broken. The grid now scopes to program start (May 2) forward when she's under the threshold, then auto-expands once she crosses 5 sessions. The threshold is in code (`buildYearGrid()`), not config — easy to flip later if she wants it always-52-weeks.

### Layout sequence on home (top → bottom)

1. Header — `Workout Tracker` title, subtitle, sync indicator (unchanged)
2. Week-banner pill (unchanged)
3. **Weekly progress card** — prev/next week navigation, stat row, dot strip (unchanged)
4. **NEW: Year-grid heatmap card** — Consistency · sessions per week
5. **Pick today's workout** — A / B / C cards with today's pick outlined (unchanged)
6. **Last line** — "Last: A · May 15 · capacity 5→6" (unchanged)
7. **Recent workouts** — list of 5 most recent, with sparklines where applicable (UPDATED)

### Click + a11y model

- Year-grid cells with logged sessions get the same `data-detail` attribute the existing week-dots use. The handler in `attachHandlers()` was widened from `querySelectorAll<HTMLButtonElement>` to `querySelectorAll<Element>` so it picks up SVG `<rect>` cells too. Empty cells have no `data-detail` → no click handler → no false-positive taps.
- Aria-labels on the sparkline encode trend direction ("trending up / down / holding"). Screen readers reading the history row hear: "May 15 · 12 min · wall sit 18 to 30s, trending up · forearm plank cleared."
- Year-grid `<title>` elements give VoiceOver / TalkBack the date + workout + capacity readout for each cell on focus.

---

## Hard constraints honored

- WORKOUTS data: untouched.
- EXERCISE_HOWTO data: untouched.
- EXERCISE_VISUALS data: untouched.
- Hand routine archive: still archived; no restoration.
- No new external dependencies, no CDN, no font-family change, no `@import`.
- Tests: 17 → 20, all green.
- Pre-commit hook (`format:check && lint && build && test`): passed.
- Port 3000 stray PID killed before tests (per the task spec).
- D-1 visual contract: no drop shadows added; 1px borders only; role-named accent tokens used everywhere; new type scale extended (year-grid heading uses `--font-micro` small-caps, year-grid count uses `--font-subheading`).

---

## Screenshots

All saved to `c:\Users\allis\Documents\workout-tracker\after-ship3-*.png` on a 390 × 844 mobile viewport, hitting the **live production URL** (not local dev).

| File                                         | What it shows                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `after-ship3-01-home-seeded.png`             | Full home with 7 seeded sessions. Top: weekly progress + dot strip. **Middle: new year-grid card** ("Consistency · sessions per week" with "6 of 3 / THIS WEEK" callout, 7 Sat-Fri rows, May-column showing A/B/C colored cells). Bottom: workout picker + recent list with sparklines on the A rows. |
| `after-ship3-02-yeargrid-closeup.png`        | Year-grid card alone. Sat/Sun/Mon/Tue/Wed/Thu/Fri row labels, "MA" month header (would extend to "MAY" with more horizontal room), `--dot-a` sage / `--dot-b` steel / `--dot-c` mauve cells, today's cell outlined in `--accent`.                                                                     |
| `after-ship3-03-history-list-sparklines.png` | Full History page with all 7 rows. The 3 A-workout rows (May 15, May 11, May 5) carry sparklines — short rising line ending in a sage dot. The B and C rows have no sparkline (correct empty-state behavior).                                                                                         |
| `after-ship3-04-sparkline-row-closeup.png`   | Close-up of the May 15 history row. Date+duration line: "May 15 · 12 min" followed by the inline sparkline (rising from May 3 = 18s → May 15 = 30s). Below: capacity / wall / back meta row. Bottom: word "forearm plank cleared" in italic.                                                          |
| `after-ship3-05-home-final.png`              | Full home after navigating back from history → confirms state survives the round trip; everything still renders.                                                                                                                                                                                      |
| `after-ship3-06-home-empty.png`              | Home rendered against Allison's **actual production Supabase data** (after seeding was cleared). 5 total sessions, 2 this week. Year-grid renders correctly even with sparse real-world data. No sparkline on the one row with a wall-sit value (correct — needs ≥ 2 to draw).                        |

---

## Tests added

3 new Playwright tests, locking in the visual + behavioral contract:

```ts
test('ship 3: year-grid heatmap renders with 7 day-rows on home', …)
// 7 .year-grid-row-label text elements, "Sat" first, "Fri" last,
// .year-grid-title contains "Consistency". Renders with 0 sessions.

test('ship 3: sparkline renders for history row with >=2 wall-sit values', …)
// Seeds 2 wall-sit rows, expects ≥ 1 .sparkline visible, aria-label
// starts with "wall sit".

test('ship 3: sparkline NOT rendered for row with 0 or 1 wall-sit value', …)
// Seeds 1 row with wallSitSec=0. .history-row visible, but
// .history-row .sparkline count = 0.
```

If a future refactor regresses any of these — flattens the grid to a line, or starts rendering a flat sparkline on single-value rows — one of these tests fires.

---

## What's next (deferred to Ship 4-6)

The task spec was Ship 3 only. The remaining ships per `REDESIGN-SHIPPED-2026-05-15.md` deferred plan:

| Ship                              | Scope                                                                                                            | Effort        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| **Ship 4 — Navigation expansion** | Pannable 8-week strip on home + history. Long-press → month grid. New Settings + Weekly-review routes.           | ~1.5 sessions |
| **Ship 5 — In-workout layout**    | Merge name+reps+visual cards into a single hero unit. Tempo bar inline. How-to collapsed to a bottom-sheet.      | ~1 session    |
| **Ship 6 — Motion + polish**      | Spring-physics screen transitions. Press-scale. Save-confirmation overlay. Hold-to-confirm on quit/delete/reset. | ~0.5 session  |

Each ship is a separate run.

---

## Risk + rollback

**Risk:** Low. ~500 lines added across 3 source files (app.ts +296, styles.css +127, tests +85). No DOM-graph changes, no state-machine changes, no schema changes. The data-detail click handler was widened from `<HTMLButtonElement>` to `<Element>` — that's the only behavioral surface, and it's a strict superset.

**Rollback paths:**

1. **One-command revert (preferred):**

   ```bash
   cd c:/Users/allis/Documents/workout-tracker
   git revert --no-edit 347142f f0605aa
   git push origin main
   ```

2. **Surgical revert (drop year-grid only, keep sparkline):** Remove the `${renderYearGrid()}` line in `renderHome()`, leave everything else. 1-line change.

3. **Surgical revert (drop sparkline only, keep year-grid):** Remove the two `${spark}` insertions in `renderHome()` and `renderHistory()`. 2 small edits.

---

## Build / test / deploy log

```
Branch:         ship3-data-viz-2026-05-15 (from main)
Lint:           npm run lint → 0 errors (after 1 prefer-const fix on `cursor`)
Build:          npm run build → tsc clean
Format:         npx prettier --write app.ts styles.css tests/app.spec.ts
Format check:   npx prettier --check . → all good
Tests:          npx playwright test → 20 passed (14.4s) then 20 passed (12.9s)
Pre-commit:     husky hook ran format:check + lint + build + test, all green
Commit:         f0605aa ship 3 (data viz): wall-sit sparkline + year-grid heatmap
Merge:          ship3-data-viz-2026-05-15 → main (no-ff merge, commit 347142f)
Push:           356f1b4..347142f
CI:             success on run 25916474595 (1m37s)
Deploy:         GH Pages auto-deploy on push to main; verified live with the
                new components via Playwright MCP screenshots of the production
                URL at ~14:57 JDT.
```
