// version.ts - the build's version and date, in ONE home (code-shape step 12a, Oct 14 2026).
//
// What: scripts/build.mjs replaces `__APP_VERSION__` / `__BUILD_DATE__` at bundle time
// (esbuild --define; package.json's "appVersion" is the one source). app.ts shows them in
// the home-header tag; screens/settings.ts shows them in Settings > About. A screen may not
// import app.ts, so the two constants live here instead of being declared twice.
// Moved verbatim out of app.ts - no behaviour change. Imports nothing, touches nothing.

// Visible build version + date+TIME (shown in the home header as "vN · Mon D, YYYY · HH:MM")
// so she can tell at a glance whether a new build actually loaded, and when.
// Her rule (Jul 1 2026): version tags carry the TIME too, not just the date.
// code-shape R1b (Sep 27 2026): the "version lives in 3 places" bug (decision
// doc, "Hand-kept lists and versions") is fixed by making package.json's
// "appVersion" the ONE source. scripts/build.mjs reads it and injects both
// consts below via esbuild `--define`; sw.js reads the same value at runtime
// from the generated dist/build-info.js. Bump appVersion in package.json —
// never here, and never in sw.js.
// v48 (Sep 24 2026): the home + workout redesign, P1-P8 on branch redesign-v48
// (DECISIONS-v48-2026-09-24.md). Her words: "look at home ux ui and make it
// better i feel like its a bit all over the place".
// v49 (Sep 25 2026): the visual pass (SPEC-v49.md) + the two more machine
// readings, calories and time ("every time put in").
// v50 (Sep 25 2026): capacity & cycle (cycle.ts) + the jump list — the List
// sheet, out-of-order Done, skip-count on the log — + mood (a second 1-10
// chip row, pre-log and post-log, and its own gated phase table on the card).
// v51 (Sep 25 2026): the Progress page in plain words — her words "the
// period part is so confusing" -> "show gemini get some help". "Your cycle"
// (plain-word phases, no jargon table, no dot chart, one collapsed "how
// these are counted" row, quiet/sage period-log button) + the rest of the
// page's "everything presentation" (combined elliptical line, compact
// wall-sit sparkline).
// v52 (Sep 26 2026, main/live): swing-Saturday home — the week tonight
// counts toward (Week 4 on top, 8 days shown, A + C done) + Up next fix
// (getTodaysPick / homeWeekOffset).
// v52.1/v52.2 (Sep 26 2026, main/live): after a swung Saturday the new week
// offers A, B and C; Round 2 Week 5 (A/B ride 10 -> 12 min); the plan
// follows the week a session counts toward.
// v53 (Sep 26 2026): merges main's swing-week + Week 5 fixes into this
// branch's ride numbers (Next -> "from the machine" entry screen) + Cue ->
// Tips (no program notes in what she reads) + W0's offline-list fix. Her
// words: "dont go to next week till i approve".

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
