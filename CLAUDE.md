# workout-tracker — repo map

**This is the repo's own map — read it from whichever branch you're on**
(v58, Sep 28 2026: it used to call itself "the code-shape branch's map" and
open on `git branch --show-current` disagreeing with its own first line;
fixed branch-agnostic here). The file map, the three gates, versioning and
the data-model conventions below are true on every branch. The
code-shape-specific sections (structure-only refactor rules, the R-numbered
roadmap) describe a SEPARATE, ongoing restructuring effort — read them when
you're doing that work, on whichever branch is doing it; they don't describe
this checkout's state by default.

Code-shape's full plan: `second-brain/self/health/workout-app-audit-2026-09-24/next-level-2026-09-26/stack-decision-2026-09-27.md`
("The builder sequence") — R1 was build + oracle. **No user-visible change in
a code-shape commit — ever.** Structure moves, never behaviour, never in the
same commit (Kent Beck's rule, the plan's own).

## Data model — text-encoded columns (`workout_sessions`)

Two `workout_sessions` columns pack several per-move readings into one short
text string instead of a column each — same convention, deliberately kept
distinct by what they own:

- **`arm_feel`** (v48 · P5, widened v55) — Easy/Right/Hard + her LOAD CHIP
  pick, ONLY for the two 1–2 kg moves (curl, prone row): `"curl=easy@2kg;
row=right@1kg"`. `key=feel@load`, `;`-joined, either half optional (a load
  with no feel tap is `"curl=@2kg"`). Built by `armFeelString` (app.ts), CHECK
  in `migrations/2026-09-24-v48-session-columns.sql` (widened by
  `migrations/2026-09-28-v55-arm-feel-load.sql`). Never migrated to
  `move_feel` below — it keeps its own shape on purpose (v58 spec item 1).
- **`move_feel`** (v58, Sep 28 2026) — the SAME Easy/Right/Hard, generalized
  to every OTHER move that stepped this week (reps/seconds/minutes up, or a
  new variant), never curl/row: `"splitsquat=right;wallsit=easy@45s;
ride=right@12min"`. `slug=feel@qty`, `;`-joined; slug is `move-feel.ts`'s
  `slugFor(name)` (lowercased, letters only — the cardio slot, whichever lane
  it's in, always slugs to `ride`); `feel` is optional; `@qty` appears ONLY
  for a hold (`s`) or the ride/walk slot (`min`) — a plain reps bump carries
  no qty (the number already lives in the PROGRAM diff). Built by
  `moveFeelString` (move-feel.ts), CHECK in
  `migrations/2026-09-28-v58-move-feel.sql`.

## File map (as of R1d — before the R3+ module split)

- `app.ts` — still the monolith (~15k lines): every screen's render + handlers + state + sync. **The split (program.ts/state.ts/sync.ts/screens/\*) is R3+, not done yet.**
- `exercise-visuals.ts` / `exercise-howto.ts` / `exercise-detail.ts` — exercise content data.
- `cycle.ts` / `step-list.ts` / `pain-feel.ts` / `week.ts` / `timing.ts` / `ride.ts` / `chart.ts` / `move-feel.ts` — already-extracted pure modules, imported by `app.ts`. `ladders.ts` / `progression.ts` are tested pure modules, not yet wired into `app.ts` (not in the bundle) — `progression.ts` imports `ladders.ts`; only tests import `progression.ts`.
- `sw.js` — service worker. Reads `dist/build-info.js` (generated) at runtime for the version + bundle filename — never hand-edit a version or file name in here. `CRITICAL_ASSETS` (shell + the app bundle) install with strict `Promise.all` — any one failing aborts the WHOLE install and the OLD worker/cache keeps serving; `OPTIONAL_ASSETS` (photos, voice notes) stay tolerant (`.catch()`), never blocking.
- `scripts/build.mjs` — the ONE esbuild bundle (content-hashed `app.<hash>.js`) + manifest + build-info + index.html rewrite. Deterministic: re-running it with no source change reproduces the same hash (the buildDate literal is excluded from what gets hashed — see its own comment; that bit it once). `scripts/update-golden.mjs` — the ONLY way to regenerate `tests/golden/*.html`.
- `tests/golden.spec.ts` + `tests/golden/*.html` — gate 1 (below). `tests/sw-upgrade.spec.ts` — proves the install-only-after-full-download mechanism with a real (not mocked-in-page) sibling service-worker script; part of gate 2.
- `dist/` — generated, gitignored. Never edit anything in it or `index.html`'s bundle `<script src>` by hand; `npm run build` writes both.

## The three gates (all green before hand-off, every step)

1. **Golden HTML** — `PW_PORT=<your port> npx playwright test tests/golden.spec.ts`. Byte-for-byte oracle for structure-only moves. A diff = STOP AND REPORT, never fix by regenerating. Regenerate only via `npm run golden:update`, checker-only, with a written reason. Weaker than it sounds alone — pairs with gate 2's full behavioural suite (focus/timers/ARIA aren't provable by markup) and gate 3's type/lint check; none of the three stands alone.
2. **The full suite** (behavioural, incl. `sw-upgrade.spec.ts`) — `PW_PORT=<your port> npm run test`.
3. **Static** — `npm run build` (`tsc --noEmit` then esbuild) + `npm run lint`.
   Always set `PW_PORT` (default 3100) so a parallel worktree's server never collides with yours — **pick a port that's actually free in YOUR checkout; don't copy a fixed number from this file or another session's notes.** Fix pass (Sep 28 2026, checker's should #6): gates 1-2 above used to hard-code `PW_PORT=3103`; the main checkout was already serving `:3103` during one check, producing 3 false failures that all went green on a free port. Check first (`netstat -ano | grep :<port>` on Windows), kill a stray listener only from YOUR OWN prior run, never another window's. Run `npm run build` before gates 1-2 — `dist/` is gitignored and generated, so a stale or missing `dist/` fails both with confusing errors, not a real bug.

## Version — ONE source

`package.json`'s `"appVersion"` field. `scripts/build.mjs` injects it into `app.ts` (`--define`) and writes it into `dist/build-info.js`, which `sw.js` reads at runtime. Never edit `APP_VERSION`/`BUILD_DATE` in `app.ts` or `VERSION` in `sw.js` directly. **A code-shape commit bumps `BUILD_DATE` only (automatic, at build time) — never `appVersion`.**

## Never commit as "changed" with zero real diff

CRLF-only noise on Windows checkouts touches dozens of paths, not a fixed list — check with `git diff --ignore-cr-at-eol <path>` (empty output = noise only) before adding, don't just eyeball `git status`. `index.html` DOES change for real when the bundle hash changes — that's a real diff, commit it.

## Files an agent must read to make a typical change — BASELINE (R1d, Sep 27 2026)

Measured from 3 real fix commits just before this branch (`95bcc3f`, `a702a4b`, `35f21f3`): each touched exactly **4 files** — `app.ts` + 1-2 small modules (a pure module like `ride.ts`/`chart.ts`, occasionally `styles.css`) + 1-2 test files. `app.ts` was in all three — nothing in this repo can avoid it yet. Real reading cost is higher than files _changed_: `app.ts` has no internal boundary, so a builder reads toward the whole 15k-line file, not a slice. **Target after R3-R13 (the module + screen split): 2-4 small files (≤800 lines each), never the whole monolith.** Re-measure the same way once that split lands.

## Import direction (R3+, so builders don't fight the split when it lands)

Dependency direction first, screens second (the "second opinion" framing fix — a rule about direction, not a list of screens): `app.ts` → screens → `state`/`bus`/`program`/`sync`/`domain`. A screen may import those; they never import a screen or `app.ts` back. Domain modules never touch the DOM. No `index.ts` barrels — import each module by its own path.

## Builders never touch `sw.js`

Its cache-key + install/fetch semantics are the checker's own must-fix territory (`CHECK-code-shape-R1-2026-09-27.md`) — flag a needed change to the checker instead of hand-editing it.

## Structure-only proof, beyond golden HTML

Keep every test's title identical and identically sorted (`npx playwright test --list` before/after) — a renamed or reordered title is a behaviour signal hiding in a "no change" commit. Run `git diff --color-moved` on `app.ts` after a split step: moved lines should show dim/moved, not red/green — new red/green there is content that changed, not just relocated, same STOP-AND-REPORT as a golden diff.

## One builder on `app.ts` at a time

Check `git status` / `git stash list` for another window's uncommitted `app.ts` changes before a step that touches it — two builders splitting the same monolith at once is the exact collision this worktree exists to avoid.

## Never in a code-shape commit

Feature changes, Supabase writes, a golden hand-edit, `--no-verify`, touching `../workout-tracker`'s or `../wt-hotfix`'s working tree.
