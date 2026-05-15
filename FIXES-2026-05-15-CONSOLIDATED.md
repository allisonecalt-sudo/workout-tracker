# Workout-tracker — Consolidated Fix Pass (2026-05-15)

**Branch flow:** `phase2-visual-layer-2026-05-15` → merged into `main` → pushed → GH Pages auto-deployed → smoke-tested on live URL. All 12 Playwright tests pass locally and on CI.

**Live URL:** https://allisonecalt-sudo.github.io/workout-tracker/

## What shipped, ordered by Group

### Group 1 — code correctness (audit-driven)

- **A. skipRest() zeroes `timerSeconds`** ([app.ts](app.ts) — `skipRest()`). The known one-liner: skip-rest used to leave a stale value, jamming the next "Start timer" button into permanent `disabled="Running…"`. Fixed.
- **B. Timer rewrite — clock-anchored.** Replaced `setInterval` with a single `requestAnimationFrame` loop that reads `endsAt - Date.now()` every frame (`startTimerCore`, `timerLoop`, `stopTimer`). Survives tab backgrounding / phone screen-sleep. Pre-countdown is now part of the same state machine — no more closure-local interval leaking a ghost timer on Quit. `visibilitychange` listener fast-forwards on return. Quit calls `stopTimer()` which clears everything in one place.
- **C. AudioContext resumed from user gesture.** New `unlockAudio()` called synchronously from `bindClick` handlers for workout cards, Begin, Start timer. `playBeep` now refuses to fire while the context is `suspended`. Eliminates silent-first-beep on fresh tabs.
- **D. Auto-fill wall-sit time on post-log.** When the user starts a Wall sit, `state.wallSitStartedAt = Date.now()` is captured. On Done OR timer expiry, `captureWallSitIfPending()` computes actual held duration and bumps `state.wallSitSec`. Post-log labels the input "Wall sit: 47s (tap to adjust)" when the value is populated.
- **E. Sync hardening.** `pullFromSupabase` now does id-keyed UPSERT-style merge — local-unsynced rows survive, remote replaces local-synced rows. `writeLogs`/`writeHandLogs` cap eviction sorts unsynced first so the 50-cap never silently drops a write. Push/pull failures log via `console.warn` with status code. (Full tombstone tracking deferred to audit Session C — needs Allison's input on undo semantics.)
- **F. Wrist-pain columns dropped from INSERT.** `pain_left_wrist_0_10` and `pain_right_wrist_0_10` no longer appear in the POST payload — Lisa Cohen cleared the wrist May 10. Schema unchanged; existing rows untouched.

### Group 2 — UX restructure

- **G. Quit demoted, Done · Next promoted.** Every in-workout screen has a `.screen-header` with the workout title on the left and a small `× Quit workout` text link on the right. The big bottom button is Done · Next, ~64px tall, full width. Quit triggers `window.confirm("Quit this workout? Your progress so far will be lost.")` with cancel as default.
- **H. Skip-rest hold-to-confirm.** Rest screen leads with a large SVG ring (200px) animating dashoffset → countdown shows in the centre. Skip is now a ghost button "Hold to skip rest" that fills over 500ms via pointerdown/up tracked by `wireHoldToSkip`. Touch-friendly, accident-proof.
- **I. Today's-pick chip on home.** `getTodaysPick()` reads the newest log → A→B→C→A rotation (empty→A). Recommended card gets `border: 2px solid var(--accent)` + "TODAY'S PICK" badge. Other two cards at 80% opacity. "Last: B · May 14 · capacity 5→5" line below the picker.
- **J. History visibility — three changes.** (1) "📊 All workouts" promoted to a real chip button. (2) Week-at-a-glance row of 7 dots (M T W T F S S) above the picker — colored A=green, B=blue, C=purple by what was done that day; tappable → history-detail. (3) New `history-detail` screen renders every field of one session (started_at / completed_at / duration / capacity before/after / wall sit / back / one word). Recent rows on home now show duration instead of "0s wall sit".
- **K. Wrist warning banner refresh.** Pre-log replaces the old "2/10 ceiling" with "Wrist: cleared by Lisa Cohen (May 10). Stop if anything pings." Per `self/health.md` May 15 entry.
- **L. Capacity slider anchors.** Three labels below each capacity range: "1 — depleted · 5 — baseline · 10 — strong" on pre-log + post-log.

### Group 3 — visual layer

- **M. Imports `EXERCISE_VISUALS`** from `./exercise-visuals.js` (kept at root; no `src/` shuffle).
- **N. `renderExerciseVisual()` + `renderHowToCard()`** wired into `renderWorkout()` and `renderHandRoutine()` in the order: name → reps → primary visual → "▶ Watch full video" expander (mounts a YouTube iframe with `rel=0&modestbranding=1`) → "📖 How to do it" expander (collapsed-by-default after first-of-week, persisted via `workout-tracker:howto-seen-week-{N}`) → action button.
- **O. Dark-green-themed CSS** for `.exercise-visual`, `.visual-video-toggle`, `.visual-video-wrap` (16:9 iframe), `.visual-attribution`. Mobile-first 4:3 aspect, scales to 16:9 on >=600px viewports.
- **P. Dead-code purge.** 11 Eliana-era `EXERCISE_GUIDE` entries removed; `.tempo-segment.active`, `.tempo-status`, `.hand-card-meta`, `.badge-active`, `.badge-locked` CSS dropped; `Exercise.isWalk`, `HandRoutine.lockReason`, `HandRoutine.status: 'locked'` branch, `SyncStatus 'idle'` removed; r-wrist/l-wrist bindings removed; `rightWristPain`/`leftWristPain` dropped from AppState + LogEntry + RemoteSession. Cross-checked against WORKOUTS — no live exercise loses its guide entry.
- **Q. Hand-routine code retained** with `// PENDING DECISION: hand routine UI hidden 2026-05-15, code retained pending Allison's call.` comments on every relevant function/type. `startHandRoutine` exported to `window` so it's reachable via console without re-enabling UI.
- **R. Old YouTube search-URL logic deleted.** `videoQuery` field removed from `EXERCISE_GUIDE`. Curated `youtubeId` embeds via `EXERCISE_VISUALS` replace the old "🎥 Show me a video" link-to-search.

### Bonus fix

- **Week-dots calendar week alignment** (separate commit). The dot strip was computing Mon-Sun from program-week start, which rolled back to the prior calendar week. Now anchors to today's calendar week.

## What's deferred (audit §11 — still hers to decide)

These are NOT in this pass; they need her sign-off or were sized as a separate session:

1. **Schema decision** — drop the unused `workout_exercises` table? Drop the `notes` column on `workout_sessions`? Both are schema changes → her call. ([AUDIT-2026-05-15.md §10](AUDIT-2026-05-15.md))
2. **Sync robustness — tombstones.** Audit §3 / C2 — full local-tombstone set for "I deleted this locally, don't resurrect on next pull." Today's merge is upsert-only; deletions don't have a path yet. Deferred to audit Session C.
3. **C12 / M11 — defensive validation of localStorage reads.** Today the code casts; if storage is corrupted by an external write, we'd return malformed entries. Audit Session C also.
4. **C5 / M12 — state machine `switch (currentPhase)` with `never` default.** Works today, brittle to a future "intermission" phase being added.
5. **`workout_exercises` per-exercise rows.** Allison-decision: populate for analytics, or drop.
6. **Hand routine UI** — code retained, UI hidden since May 5. Her call whether to bring back, prune, or fold into the A/B/C flow.
7. **Test coverage gaps** — timer behaviour (mock Date.now), round transitions in A/B, pull-merge unit tests, sync indicator transitions, hand routine flow. Audit §9.
8. **Custom Lisa-Cohen wrist clips.** `EXERCISE_VISUALS` uses generic PT YouTube embeds for the wrist exercises because no exact tuna-can-rehab video exists publicly. Audit-suggested fallback: she records 10s phone clips of the exact form. Not done; flagged.

## What to test first when she next opens the app

In rough priority — these are the changes most likely to feel different:

1. **Open the live URL.** Home should show: Week 2 banner; 7 week-dots (M T W T F S S); "Today's pick" badge on whichever workout is next in rotation (currently C since last was B May 14); "Last: B · May 14 · capacity 5→5"; "📊 All workouts" chip; Recent rows showing duration.
2. **Tap a week dot for a day she actually worked out** → opens that session's detail page with every field.
3. **Start workout A → reach Wall sit.** Tap Start timer. 3-2-1 ready countdown should beep audibly on first session of fresh tab (group 1C fix). Hold wall sit. If she taps Done before timer expires, post-log should pre-fill "Wall sit: Xs (tap to adjust)" with actual held seconds (group 1D).
4. **Reach a rest screen between main exercises.** Large green ring counting down from 60. Try to skip — needs a 500ms hold (group 2H). Tap-and-release does nothing.
5. **Tap × Quit workout** → confirm dialog. Cancel → still in workout. Accept → home.
6. **First exercise screen of the week** — How-to card should be open. Second exercise → How-to collapsed. (group 3N first-of-week behaviour.)
7. **Background the app mid-wall-sit** → return → timer should be at the correct elapsed value, not frozen (group 1B).

## Files touched

- `app.ts` — full rewrite of timer, render\*, attachHandlers; types pruned; new helpers (`unlockAudio`, `getTodaysPick`, `getWeekDots`, `renderExerciseVisual`, `renderHowToCard`, `wireHoldToSkip`)
- `styles.css` — added .screen-header, .quit-link, .btn-chip, .btn-ghost, .hold-fill, .week-dots/.week-dot/.dot-A/B/C, .workout-card-pick, .workout-card-pick-badge, .exercise-visual, .visual-video-_, .visual-attribution, .how-to-card/.how-to-toggle/.how-to-chev, .rest-card/.rest-ring_, .range-anchors, .last-line, .history-row-btn, .history-header-row, .detail-card/.detail-row/.detail-label. Removed .tempo-segment.active, .tempo-status, .hand-card-meta, .badge-active, .badge-locked, .text-link (no longer used).
- `tests/app.spec.ts` — 6 → 12 tests. Adapted Quit (dialog accept) and skip-rest (700ms pointerdown hold).
- `exercise-visuals.ts` — kept as Phase 2 left it (24 entries; 12 with still loops, 12 video-only).
- `assets/exercises/` — 24 JPGs (12 pairs, free-exercise-db / Unlicense).
- `package.json` / `tsconfig.json` — already modified by phase 2 prep (lint + include `exercise-visuals.ts`). Sane diffs, kept.
- `AUDIT-2026-05-15.md`, `VISUAL-EXERCISE-RESEARCH-2026-05-15.md` — committed as-is from prior agents.

## Screenshots captured

11 screenshots in this folder, mobile viewport 390×844 (iPhone 13 Pro size):

- `after-consolidated-01-home.png` — home with week-dots, today's pick, history rows
- `after-consolidated-02-prelog.png` — pre-log with new wrist banner + capacity anchors
- `after-consolidated-03-workout-walk.png` — Workout A warmup walk with still + watch-full-video + how-to open
- `after-consolidated-04-workout-video-expanded.png` — YouTube iframe expanded inline
- `after-consolidated-05-workout-bodyweight-squats.png` — main exercise with visual + tempo bar + how-to
- `after-consolidated-06-rest-screen.png` — large countdown ring + hold-to-skip
- `after-consolidated-07-workout-wallsit-ready.png` — wall-sit timer card
- `after-consolidated-08-history.png` — All workouts list view
- `after-consolidated-09-history-detail.png` — session detail page
- `after-consolidated-10-live-home.png` — same as 01 but from the deployed GH Pages URL
- `after-consolidated-11-live-workout-walk.png` — same as 03 from live

## Commits

- `5690cdd` — Consolidated lead-dev pass: code correctness + UX restructure + visual layer
- `5ccb9c8` — fix(home): week-dots anchor to today's calendar week

Both on `main`, both pushed, both deployed.
