# screens/ - the template for a screen module

First one: `screens/rides.ts` (code-shape step 8, Oct 14 2026). Steps 12-17 copy this
shape, one screen per run. Read `rides.ts` next to this file: it is the worked example.

## What a screen module owns

- Its `render...()` functions: strings of HTML, no DOM writes. The top one is exported
  (`renderRides`); its card helpers stay private (not exported) unless another file
  really uses them (`renderRidesDoorRow` is on Progress, `ridesVsDelta` is a test hook).
- Its `attach...Handlers()`: exported, takes no arguments, binds this screen's clicks
  after `render()` has put the HTML on the page.
- Its own transient state: the module-level `let`s only this screen reads or writes
  (rides: `ridesWindow`, `ridesChartMode`, `ridesSelectedChartId`,
  `ridesSelectedWeekChartKey`, `progressScrollForRides`). They are module-local, not
  exported. Before moving a `let`, prove only this screen's code touches it: delete it
  from `app.ts` and let `tsc` list every other reader. Any hit = a shared `let`: STOP
  and list it (step 10 gathers those into `ui`).

## What it may import

`state.ts`, `bus.ts`, `dom.ts`, `format.ts`, and the pure modules (`ride.ts`,
`ride-aim.ts`, `chart.ts`, `program-week.ts`, `week.ts`, `week-d.ts`, `dates.ts`,
`cardio-notes.ts`, `types.ts`, `week-clock.ts`, `sync.ts`, `sync-cycle.ts`, `sync-week-moves.ts`,
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

### The SAVE side is still in `app.ts` (after step 9)

Step 9 moved the network code (push / PATCH / pull / merge / delete) out. The code that
decides WHEN to save, and the local write around it, did not move. Still in `app.ts`:

- `flushPendingSyncs` (the retry loop over every unsynced row) and `updateSyncIndicator`
- `saveLog` and `genId` (the local write of a finished session, and its id)
- `logPeriodStart` / `undoPeriodStart` and their undo-timer `let`s (`cycleUndoTimer`,
  `cycleUndoStartDate`, `cycleUndoCreated`)
- `moveOnWithoutIt` / `undoWeekMove` (the week-move write and its Undo tombstone)

**Rule:** a screen whose handlers need any of these WAITS until they move to a shared module
(steps 10 / 11). It never imports `app.ts`, never copies them, never receives them as
arguments. Re-list this section when 10 / 11 move one.

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
