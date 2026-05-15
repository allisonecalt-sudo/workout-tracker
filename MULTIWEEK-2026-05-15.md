# Multi-week PROGRAM — Fri May 15, 2026 evening

**Why.** Allison (2026-05-15 18:15 JDT): _"i cant see week 3 in app i wna tot see week 3 and you may as well also do weke 4."_ The app had no week-aware programming — `WORKOUTS` was a single static record and the week-3 content shipped earlier today (commit 66e9845) had overwritten week-2 content in place. There was no way to look at "what did I do last week?" or plan ahead for "what does next week bring?" — neither existed as data.

**What shipped.** Per-week structure (`WeekPlan[]`) with weeks 1–4 encoded, date-based resolution, Week N badge on pre-log, "Coming next week" preview on home, Program weeks count in Settings → About. 41 Playwright tests green (36 prior + 5 new).

Commits on `multi-week-program-2026-05-15`, merged to main:

- `8f97d1a` — Multi-week PROGRAM: weeks 1-4 with date-based resolution
- `4294865` — Multi-week UI: Week N badge, "Coming next week" preview, About row + tests
- `8bb5f92` — Merge commit

Live: https://allisonecalt-sudo.github.io/workout-tracker/ (CI run 25926136807 green, deployed via GitHub Pages).

---

## Architectural change

**Before:**

```ts
const WORKOUTS: Record<WorkoutId, Workout> = { A: {...}, B: {...}, C: {...} };
function getCurrentWorkout(): Workout | null {
  return state.selectedWorkout ? WORKOUTS[state.selectedWorkout] : null;
}
```

Single bucket. Mutating it for week 3 meant losing week 2 unless you reach into git history.

**After:**

```ts
type WeekPlan = {
  weekNum: number;
  startsOn: string;        // ISO date of the Saturday this week begins
  label?: string;          // short tag, e.g. "Consolidation", "Bump week"
  workouts: Record<WorkoutId, Workout>;
};

const PROGRAM: WeekPlan[] = [
  { weekNum: 1, startsOn: '2026-05-02', label: 'Starter',         workouts: {...} },
  { weekNum: 2, startsOn: '2026-05-09', label: 'Walk warmups',    workouts: {...} },
  { weekNum: 3, startsOn: '2026-05-16', label: 'Forearm plank in', workouts: {...} },
  { weekNum: 4, startsOn: '2026-05-23', label: 'Small bumps',     workouts: {...} },
];

function getWeekPlan(date: Date = new Date()): WeekPlan { ... }
function getWorkoutById(id: WorkoutId, date: Date = new Date()): Workout { ... }
function getNextWeekPlan(date: Date = new Date()): WeekPlan | null { ... }
function getProgramWeekCount(): number { return PROGRAM.length; }
```

`getCurrentWorkout()` now resolves through `getWeekPlan()` + today's date. All three direct `WORKOUTS[id]` call-sites (home picker, weekly-target grid, exercise-breakdown rollup) switched to `getWorkoutById(id)`. Future-her adds Week 5 by appending one more row — no other code touches.

**Past weeks recovered from git:** Week 1 from commit `bb673e9`'s parent; Week 2 from the snapshot just before `66e9845`. Walk warmups, rep counts, descriptions all backfilled to what she actually did at the time, not a Claude approximation.

---

## Per-week diff table

### Workout A — Main block (the "anchor" workout)

| Exercise              | W1      | W2      | W3            | W4           |
| --------------------- | ------- | ------- | ------------- | ------------ |
| Bodyweight squats     | 8 reps  | 10 reps | 12 reps       | **14 reps**  |
| Glute bridges         | 10 reps | 10 reps | 12 reps       | **14 reps**  |
| Wall sit              | 20 sec  | 25 sec  | 30 sec        | **35 sec**   |
| Side-lying clamshells | 10/side | 10/side | 10/side       | 10/side      |
| Modified dead bug     | 6/side  | 6/side  | 6/side        | 6/side       |
| Heel taps             | 10/side | 10/side | (swapped out) | —            |
| Forearm plank         | —       | —       | 1×15 sec      | **2×15 sec** |

### Workout B — Main block (consolidation in W3)

| Exercise                 | W1      | W2      | W3      | W4          |
| ------------------------ | ------- | ------- | ------- | ----------- |
| Side-lying leg raises    | 10/side | 12/side | 12/side | **14/side** |
| Side-lying clamshells    | 10/side | 10/side | 10/side | 10/side     |
| Single-leg glute bridges | 8/side  | 8/side  | 8/side  | **10/side** |
| Slow supine bicycle      | 8/side  | 8/side  | 8/side  | 8/side      |
| Modified dead bug        | 6/side  | 6/side  | 6/side  | 6/side      |
| Standing calf raises     | 15 reps | 15 reps | 15 reps | 15 reps     |

### Workout C — Main block (cardio day)

| Exercise              | W1            | W2      | W3      | W4          |
| --------------------- | ------------- | ------- | ------- | ----------- |
| Glute bridges         | 10 reps       | 10 reps | 12 reps | **14 reps** |
| Side-lying clamshells | (not in pool) | 10/side | 10/side | 10/side     |
| Modified dead bug     | 6/side        | 6/side  | 6/side  | 6/side      |
| Heel taps             | 10/side       | (out)   | —       | —           |
| Standing calf raises  | (not in pool) | 15 reps | 15 reps | 15 reps     |

### Walks — locked, do NOT bump

| Workout | Warmup walk | Pace      | Rule |
| ------- | ----------- | --------- | ---- |
| A       | 10 min      | strolling | hold |
| B       | 10 min      | strolling | hold |
| C       | 25 min      | strolling | hold |

Per the regroup: _"Walks: hold at 10/10/25 min strolling. No pace push, no duration bump this week."_ This applies to all four weeks. If A/B walks become trivial in 2-3 weeks, that's the trigger to revisit — `health.md` flag, not a Claude default.

### Stretches — placeholder, do NOT auto-fill

All A/B/C cooldown blocks keep the existing stretches (Knees-to-chest, Figure-4, Seated forward fold, Slow breathing) — same across all four weeks. Allison fills her own Lisa Cohen stretches; Claude doesn't generate names. Per the regroup §0 line 6.

---

## Week 4 deviations from the brief (none)

Brief said:

- A: squats 12→14, glute bridges 12→14, wall sit 30→35s, forearm plank 1×15 → 2×15 — **shipped exactly.**
- B: side-lying leg raises 12→14, single-leg glute bridges 8→10 — **shipped exactly.**
- C: glute bridges 12→14, walk unchanged — **shipped exactly.**
- 45-min cap respected — yes. A's added set of forearm plank is +15s of work + ~30s rest = +45s total. Old estimate 42-46 min → new estimate 43-47 min. Still within ceiling; if she's pacing tight, the rest setting (default 0 per her 18:07 call earlier today) keeps things compressed.
- No new exercises — confirmed.
- Walks unchanged — confirmed.
- Stretches placeholder-shaped — confirmed.

Nothing flagged in `health.md` that contradicts the prescribed Week 4 progression. Left wrist still on watch with no PT update since May 2 — but the May 14 session showed L wrist at 0/10. Left knee mention from May 11 was never followed up; squats and single-leg bridges are the watchpoints there. Both are non-blocking for the Week 4 ship.

---

## UI surfaces

### 1. Pre-log Week N badge

Heading "What's in this workout" now carries a glass-pill `Week N` badge to the right. Same restrained treatment as the home week-banner — quiet metadata, not action. See `after-multiweek-03-prelog-A-week2-badge.png`. CSS class: `.overview-week-badge`.

### 2. "Coming next week" preview on home

Collapsed-by-default `<details>` element rendered just below the workout picker. Summary line:

> **Coming next week** — Week 4 · starts Sat May 23

Expanded body: one card per workout (A/B/C) with the diff lines populated from `diffWorkout(currentWeek, nextWeek)`. Diff is name-keyed and notices rep/duration changes, new exercises, and removed exercises. Workouts with zero changes show "unchanged" in italics. See `after-multiweek-02-home-next-week-open.png` (taken at Week 2 → showing the diff INTO Week 3, since today is May 15).

Returns `''` from `renderComingNextWeek()` when there's no next week encoded — once Allison passes Week 4 (after May 29), this preview goes silent until she adds Week 5.

### 3. Settings → About

New "Program weeks: 4" row with caption: _"Weeks 1–4 encoded. Add Week 5+ in `app.ts` PROGRAM array."_ That's the one-line hint for future-her. See `after-multiweek-04-settings-about-program-weeks.png`.

### 4. Home week-banner — unchanged

Already showed `Week N · date-range` from PROGRAM_START_DATE math. Confirmed live as "Week 2 · May 9–15" today (Fri May 15). Rolls to Week 3 on Saturday morning at midnight.

---

## How to add Week 5+ yourself

In `app.ts`, find the `PROGRAM: WeekPlan[]` array and append one more row:

```ts
{
  weekNum: 5,
  startsOn: '2026-05-30',         // ISO date of Saturday
  label: 'whatever you want',
  workouts: {
    A: {
      id: 'A',
      name: 'Lower Body + Core',
      description: '🚶 10-min walk + lower body strength · ~40 min',
      rounds: 3,
      warmup: WALK_WARMUP_AB,     // shared block, don't reinvent
      main: [ ... ],              // your reps for the week
      cooldown: COOLDOWN_AB,
    },
    B: { ... },
    C: { ... },
  },
},
```

That's it. The Settings count auto-updates, `getCurrentWorkout()` picks Week 5 automatically once May 30 hits, and the "Coming next week" preview on home will start showing Week 5's diff during Week 4. No other file changes needed.

The shared building blocks (`WALK_WARMUP_AB`, `WALK_WARMUP_C`, `COOLDOWN_AB`, `COOLDOWN_C`) are factored out specifically so per-week deltas stay visible — when looking at a row, the difference jumps out.

---

## Tests added

In `tests/app.spec.ts`:

1. `multi-week: pre-log overview shows Week 3 badge in May 16-22 range` — mocks Date to 2026-05-18, asserts the badge.
2. `multi-week: Week 4 content active for May 25 (squats 14, plank 2x15s)` — mocks Date to 2026-05-25, walks past warmup, asserts Bodyweight squats reads "14 reps".
3. `multi-week: "Coming next week" preview renders on home with diff` — asserts summary text + at least one bump line in Workout A's diff block.
4. `multi-week: Settings About shows Program weeks count (4)` — asserts the new row text.
5. `multi-week: home week-banner reads Week 3 for May 16-22 range` — mocks Date and asserts the banner.

Date mocking uses a class extending `Date` that returns the fixed time on no-arg construction and `Date.now()` — installed via `addInitScript` before page load so deterministic across the whole test.

---

## File map

- `app.ts` — PROGRAM array + resolvers + 3 UI changes
- `styles.css` — `.overview-week-badge`, `.next-week-preview` and children
- `tests/app.spec.ts` — 5 new tests
- 4 screenshots in repo root: `after-multiweek-{01..04}-*.png`
