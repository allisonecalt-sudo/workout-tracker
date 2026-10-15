# screens/ - the template for a screen module

First one: `screens/rides.ts` (code-shape step 8, Oct 14 2026). Steps 13-17 copy this
shape, one screen per run. Read `rides.ts` next to this file: it is the worked example.
`screens/history.ts` (step 14) is the example for a screen whose edit form saves through `actions.ts` and whose draft is shared (`ui.historyEditDraft`). `screens/home.ts` (step 16) is the example for a screen whose bindings are interleaved with other screens' (four `attachHomeHandlers*` calls, order kept) and for what stays in app.ts (the tap that starts a workout, the shared `[data-detail]` click). `screens/settings.ts` and `screens/cycle.ts` (step 12) are two more worked examples: settings
shows a screen with many small handlers and the build-time `version.ts` import; cycle shows
module-local state (return-to, compare metric, scroll) that used to live in `ui`.

**Worktrees (builders and checkers):** never link `node_modules` into one (sole exception: `verify:commits`, in its own temp worktrees) and never `git worktree remove --force`; use `npm run wt:add -- <path> <ref>` / `npm run wt:remove -- <path>` (Oct 15 18:00 incident, see CLAUDE.md).

## What a screen module owns

- Its `render...()` functions: strings of HTML, no DOM writes. The top one is exported
  (`renderRides`); its card helpers stay private (not exported) unless another file
  really uses them (`ridesVsDelta` is a test hook). A door row that opens a page belongs to the
  screen it is drawn on: the rides door lives in `progress.ts`, not `rides.ts`.
- Its `attach...Handlers()`: exported, takes no arguments, binds this screen's clicks
  after `render()` has put the HTML on the page.
- Its own transient state: the module-level `let`s only this screen reads or writes
  (rides: `ridesWindow`, `ridesChartMode`, `ridesSelectedChartId`,
  `ridesSelectedWeekChartKey`, `progressScrollForRides`). They are module-local, not
  exported. Before moving a `let`, prove only this screen's code touches it: delete it
  from `app.ts` and let `tsc` list every other reader. Any hit = a shared `let`: STOP
  and list it (step 10a gathered those into `ui`: a screen's own `let`s stay module-local; one that another file touches is a `ui` property).

## What it may import

`state.ts`, `bus.ts`, `dom.ts`, `walk.ts` (home's walk row), `format.ts`, `action-bar.ts`, `version.ts`, `ui.ts`, `actions.ts`, `cardio-readings.ts`, `viz.ts` (sparklines / wall-sit trend), `session-row.ts` (the one session row), `workout-now.ts` (the current workout lookups), `log-fields.ts` (the pre/post-log field markup), and the pure modules (`ride.ts`,
`ride-aim.ts`, `chart.ts`, `program-week.ts`, `week.ts`, `week-d.ts`, `timing.ts`, `dates.ts`,
`cardio-notes.ts`, `types.ts`, `week-clock.ts`, `cycle.ts`, `program.ts`, `sync.ts`, `sync-cycle.ts`, `sync-week-moves.ts`,
`sync-movement.ts` ...). `week-clock.ts` and `sync*.ts` are shared-layer modules in their own
right: they may never import a screen or `app.ts` (enforced by `tests/import-graph.test.ts`). Never `app.ts`, never another screen, no
`index.ts` barrels. Dependency direction: `app.ts` -> screens -> state/bus/domain.

Enforced by `tests/import-graph.test.ts` ("a screen imports only the shared layer" has
the allowed list: add a module there only when a screen genuinely needs it).

If a screen needs something that lives in `app.ts` today, it moves to a shared module
FIRST, in its own commit (8a: `dom.ts`, `bus.ts`; 8b: `format.ts`, `cardio-notes.ts`,
and small moves into `state.ts` / `week.ts`; 9-0: `week-clock.ts`), verbatim.
**No helper copies**: a screen never carries its own copy of an app.ts helper (rides.ts
once copied two week-clock wrappers; 9-0 deleted them), and `app.ts` functions are never
passed in as arguments. Import from the shared module. The week-clock wrappers
(`getProgramWeek`, `weekModel`, `shownWeek`, `planForLog` ...) live in `week-clock.ts`.

**A screen whose handlers save to Supabase needs `sync.ts` (step 9) first**: the push/pull
code must already sit in a shared module, because a screen cannot import `app.ts`.

### The SAVE side now lives in `actions.ts` (step 10b)

Step 9 moved the network code (push / PATCH / pull / merge / delete) out; step 10b moved the
code that decides WHEN to save, and the local write around it, into `actions.ts`. A screen MAY
import it (and `ui.ts`, and `cardio-readings.ts`). In `actions.ts`:

- `saveLog` / `genId` (the local write of a finished session, and its id), `logWalk`
- `saveCompletedSession` (the post-log save), `logStaleSessionAsDone`, `saveHistoryEdit`
- `logPeriodStart` / `undoPeriodStart` (their undo timer state is `ui.cycleUndo*`)
- `moveOnWithoutIt` / `undoWeekMove` (the week-move write and its Undo tombstone)
- `flushPendingSyncs` (the retry loop over every unsynced row), `clearActiveSession`

`actions.ts` never imports `app.ts` or a screen (enforced) and writes no DOM. The few
UI-side effects a save triggers stay in `app.ts` and come in once, at boot, through
`setActionHooks()`: `updateSyncIndicator` (the sync pill's DOM write), `getCurrentWorkout`,
`harvestWorkoutWalk`, `endPostLogClockTick`, `sessionFirsts`, `currentSteppedMoves`,
`skippedStepsCount`, `resetState`. A moved handler redraws with `bus.requestRender()`. A
screen that needs another UI-side effect in a save adds a hook there; it never imports
`app.ts` and never copies the function.

`cardio-readings.ts` holds the ride lane's stored readings and the typed-box parsers
(`ellipticalLevel`, `parseMmSs`, `laneDoneMinutes` ...) that both the save side and the ride
screens read.

An import also changes MODULE LOAD ORDER (ES modules run top to bottom, depth first). A
new import in `app.ts` or a screen can run another module's top-level code earlier or later
than before. Before adding one, check the target's top-level initializers (consts built from
`localStorage`, `new Date()`, other modules' exports, anything registered at import time).
Modules with only function/type/constant-literal declarations are safe; anything else: keep
the import at the position the old code ran in, and say so in the commit.

## How it redraws and navigates

- Redraw: `requestRender()` from `bus.ts` (what `render()` was), never an import of `render`.
- Back-button scroll restore: `requestScrollRestore(y)` from `bus.ts` (what writing
  `pendingScrollRestore` was).
- Screen change: `state.screen = '...'` then `requestRender()`, as before.

## How it registers

Nothing registers itself. `app.ts` imports the exports and keeps the wiring:

- `render()`'s `switch (state.screen)` calls the imported `renderX()`.
- `attachHandlers()` calls `attachXHandlers()` in the SAME position it had before the
  move. Order matters (a handler bound later can shadow an earlier one on the same id).

### Pulling a screen's bindings out of `attachHandlers()` (863 lines, interleaved)

A screen's bindings are often mixed in with other screens' bindings. The technique, which
keeps today's binding ORDER:

1. Record the order first: list every binding in `attachHandlers()` as
   `line | selector or id | event | owner screen` (grep `bindClick(`, `addEventListener`,
   `querySelectorAll` inside the function). This table is the proof sheet.
2. Mark the screen's rows. If they form ONE contiguous run: cut the run, paste it as the body
   of `attachXHandlers()`, and call it at that exact spot.
3. If they are interleaved with other screens' rows: bindings on DIFFERENT elements (distinct
   ids or selectors, neither inside the other's delegation target) commute, so the screen's rows
   may be gathered into one function called at the position of its FIRST row. Anything else (same
   element, a delegated listener on an ancestor, a `querySelectorAll` that overlaps) does NOT
   commute: split into `attachXHandlers()` then `attachXHandlers2()` (exported, no arguments), each
   called at its own original spot. When unsure, split; extra calls cost nothing.
4. Locals the cut rows read (a `const` declared earlier in `attachHandlers()`) are re-declared at
   the top of the new function from the same source; if the value is shared with rows that stay,
   STOP: it moves to a shared module first.
5. Prove order and set unchanged: log the (target, event) pair of every `addEventListener` call on
   both builds (a wrapper installed with `addInitScript`) and diff the two lists. The sequence must
   be identical, not just the set.

## Tests and goldens

- A move changes no output: `tests/golden/*.html` stay BYTE-identical with no
  regeneration (rides: `rides-page.html`). A golden diff means stop and report.
- Screen modules are FLAT: `screens/<name>.ts`, no sub-folders. `allSourceFiles()`
  (tests/helpers.ts) reads exactly `screens/*.ts`; `tsconfig.json` includes `screens/**/*.ts`.
  If a screen ever needs a nested folder, make the helper walk it in the same commit (the
  scans would go quiet otherwise). The import-graph guard, the clock/pain scans and
  `bundledSourceFiles()` all cover `screens/*.ts`.
- Behaviour tests stay in `tests/screens/*.spec.ts` (that folder is about test files,
  not these modules). A new screen needs no new test to move; if it grows pure logic,
  put that logic in a domain module with a Node test, not in the screen.
- ESLint `max-lines` warns at 800 for `screens/**`. A screen near it is a review
  trigger, not a failure.

## The move, as a checklist

1. List the screen's render helpers, handlers and `let`s (grep by symbol, never read `app.ts` end to end).
2. Anything shared with `app.ts` moves to a shared module first (own commit, verbatim).
3. Cut the blocks out of `app.ts` as whole contiguous ranges; paste into the screen unchanged except `render()` -> `requestRender()` and the scroll-restore write.
4. `app.ts` imports the exports; delete its now-unused imports.
5. `tsc`, lint, goldens (no regeneration), full suite, `git diff --color-moved=dimmed-zebra --color-moved-ws=allow-indentation-change` and list every non-moved line.
6. Render-equivalence against the previous commit's build with real-shaped data, and interaction equivalence for each handler.
7. `npm run verify:commits` on the range.

## The workout: one screen, sub-views (step 17a, Oct 15 2026)

The workout is ONE screen (`state.screen === 'workout'`) with sub-views: the exercise step, the ride
lanes (elliptical / walk / apartment), rest, round break, cool-down, paused. Screens may not import
each other, so the sub-views are NOT separate screens. The rule:

- `screens/workout.ts` owns the render entry (`renderWorkout`), every handler, and (from 17c) the
  state machine. It is the only workout file that binds, saves or moves state.
- Pure render-string helpers used by TWO OR MORE sub-views are shared-layer modules named
  `workout-*.ts` (default-deny guard covers them: strings out, no DOM writes, never app.ts or a
  screen): `workout-now.ts` (lookups), `workout-parts.ts` (step nav, progress line, header buttons),
  `workout-feel.ts` (feel / load chips + guards), `workout-cards.ts` (picture / setup / detail /
  how-to / Tips). A helper used by one sub-view only stays next to that sub-view.
- 17b adds the lane renderers (a shared `workout-lanes.ts` of strings) and moves the lane handlers
  (`ww-*`, `ell-*`, `ride-numbers-*`, `stop-lane`, the ride's own feel binding) into `workout.ts`.
  17c adds rest / round break / cool-down / paused (a shared `workout-breaks.ts` of strings), the
  state machine (`advanceExercise`, `goBack`, `jumpToStep`, `next` / `begin` / `step-back`, the hold
  bindings) and the overlays' handlers into `workout.ts`. app.ts ends as the shell.
- Until a sub-view moves, app.ts registers it through `setWorkoutSubviews({...})` (called once in the
  boot block). `workout.ts` calls it through private forwarding stubs that carry the moved code's own
  names, so the moved code stays byte-identical; delete a stub when its sub-view arrives. Today's
  registered set: round break, rest, cool-down, elliptical step, lane timer card, apartment routine,
  `jumpToStep`.
- Handler groups keep their ORIGINAL binding order: `attachWorkoutStepListHandlers` (List + pip +
  jump rows) sits where those bindings sat, `attachWorkoutFeelHandlers` / `attachWorkoutFeelHandlers2`
  surround the ride's own feel binding (still in app.ts), `attachWorkoutCardHandlers` closes
  `attachHandlers()`. The card handlers bind document-wide (the cool-down rows use the same data
  attributes), so they are not "the exercise step's" alone.
- `ui` fields: `stepListOpen` and `timerPipOpen` stay on `ui` (written outside this screen: app.ts
  jumpToStep / resume / resetState, and timer.ts). Nothing became module-local in 17a.
