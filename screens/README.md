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
`cardio-notes.ts`, `types.ts` ...). Never `app.ts`, never another screen, no
`index.ts` barrels. Dependency direction: `app.ts` -> screens -> state/bus/domain.

Enforced by `tests/import-graph.test.ts` ("a screen imports only the shared layer" has
the allowed list: add a module there only when a screen genuinely needs it).

If a screen needs something that lives in `app.ts` today, it moves to a shared module
FIRST, in its own commit (8a: `dom.ts`, `bus.ts`; 8b: `format.ts`, `cardio-notes.ts`,
and small moves into `state.ts` / `week.ts`), verbatim. Do not copy a helper into the
screen and do not pass `app.ts` functions in as arguments.

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

## Tests and goldens

- A move changes no output: `tests/golden/*.html` stay BYTE-identical with no
  regeneration (rides: `rides-page.html`). A golden diff means stop and report.
- `tsconfig.json` includes `screens/**/*.ts`; the import-graph guard, `allSourceFiles()`
  (clock/pain scans) and `bundledSourceFiles()` all cover `screens/**`.
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
