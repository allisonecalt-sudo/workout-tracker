# Year-grid heatmap (archived 2026-05-15)

## What this was

A GitHub-contributions-style heatmap that shipped in Ship 3 (data viz) on
2026-05-15 around 14:55 JDT. Showed 7 rows (Sat → Fri) × N columns of weeks,
each cell colored by the workout letter logged that day (or empty outline).

## Why retired

Allison's words 2026-05-15 15:13 JDT: *"i think theres too many sessions"* +
*"its 3 a week"* + *"go back to 3 per week."* The 7-cells-per-week grid
implied a daily target, but she only targets 3 workouts per week. The empty
cells read as gamification pressure (the "you should be filling every day"
register she rejects).

## What replaced it

`renderWeeklyTargetGrid()` in `app.ts` — one row per program week × 3 slot
pills. Each pill filled with the workout letter she actually did (A/B/C),
or a quiet dashed outline if the slot is open. Current week gets an accent
side-stripe. Same `--dot-a / --dot-b / --dot-c` color tokens. No "you missed
a day" cells anymore — just "3 slots, here's what you put in them."

## Files in this folder
- `README.md` — this file
- `year-grid.archived.ts` — extracted code (does not compile standalone —
  references `LogEntry`, `loadLogs`, `getWeekCount`, `formatDate`,
  `escapeHtml`, `PROGRAM_START_DATE` from `app.ts`)
- `year-grid.archived.css` — the CSS rules that styled the year-grid

## How to revive

1. Copy `buildYearGrid` + `renderYearGrid` + `YearGridCell` + `YearGridWeek`
   back into `app.ts`.
2. Copy the CSS block back into `styles.css`.
3. In `renderHome()`, change `${renderWeeklyTargetGrid()}` to
   `${renderYearGrid()}`.
4. Restore the test "ship 3: year-grid heatmap renders with 7 day-rows on
   home" if it was removed.

## Timeline

- 2026-05-15 ~14:55 JDT — shipped in Ship 3 (commit `f0605aa`)
- 2026-05-15 15:13 JDT — Allison flagged "too many sessions, 3 a week"
- 2026-05-15 ~15:18 JDT — archived to here, replaced with 3-per-week view
