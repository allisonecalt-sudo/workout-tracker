// ui.ts - the app's transient UI state in ONE object (code-shape step 10a, Oct 14 2026).
//
// WHAT: every module-level `let` that used to sit at the top level of app.ts
// (timers, wake-lock and tick handles, the walk lane, the cycle page's undo and
// compare state, view toggles, scroll-restore keys ...), as properties of one
// exported object. Same names, same initial values, same meaning - moved, not
// redesigned. They are NOT persisted and NOT session progress (that is state.ts).
// WHY: a `let` in app.ts cannot be reached by a module that is not app.ts, so
// every function that touched one was stuck there. As properties of an imported
// object they can follow their functions out (steps 10b-17).
// RULE: always read and write `ui.x` in place. Never destructure it
// (`const { x } = ui`) - the copy would silently stop tracking; ESLint forbids it.
// DECIDED: app-side, type imports only - no value import, so this file can never
// take part in an import cycle.
// BUILT: scripts/ui-rename.mjs did the rewrite (TypeScript language service, not
// text search-and-replace).

import type { ActiveSessionSnapshot, AppScreen } from './state.js';
import type { HistoryEditDraft, TimerHandle, WorkoutWalkResult } from './types.js';

export interface Ui {
  // v50 · jump list (Sep 25 2026): whether the "List" sheet is open. Transient
  // UI, not session progress — deliberately NOT on AppState/the resume
  // snapshot, the same way the quit-confirm panel isn't: a reload should land
  // her back on the step she was on, sheet closed, not reopen a sheet she'd
  // already dismissed.
  stepListOpen: boolean;
  // v53 (Sep 26 2026): whether the running-timer pip's Pause/Stop sheet is
  // open. Same reasoning as stepListOpen above — transient UI, not session
  // progress, so it's deliberately outside AppState/the resume snapshot; a
  // reload lands her back on the step with the sheet closed. stopTimer() (every
  // path that ends a running timer — Stop, Back, advancing, quitting) resets it,
  // so it can never outlive the timer it belongs to.
  timerPipOpen: boolean;
  // v60 (Sep 28 2026): whether the timed hold about to run/running is a REDO of
  // the last completed SET, not a fresh next one — same transient-UI reasoning
  // as stepListOpen/timerPipOpen above (not session progress, not persisted).
  // Only read by recordHeldSet, and only matters for a multi-set hold
  // (hold-sets.ts setsPrescribed > 1); a single-set hold's Redo still goes
  // through the untouched recordHeld/heldSecFor path.
  holdRedoInProgress: boolean;
  audioCtx: AudioContext | null;
  activeTimer: TimerHandle | null;
  rafHandle: number | null;
  timerHoldsWakeLock: boolean;
  walkWakeLock: { release: () => Promise<void> } | null;
  walkTickId: number | null;
  // T1 (Sep 27 2026): the pre-log/post-log "is this the time?" minute ticks —
  // see beginPreLogClockTick/beginPostLogClockTick below, same shape as
  // walkTickId just above.
  preLogTickId: number | null;
  postLogTickId: number | null;
  // In-workout walk tracking (v13 — her actual idea, Jul 4: "each time I go on a
  // walk WITHIN each workout it tracks information, saves it"). The 'Outdoor
  // walk' step that opens A/B (10 min) and C (25 min) times the walk (v48: minutes
  // only), and the minutes save WITH that session. render() drives
  // start/stop, so advancing, quitting, and resume-after-close all behave.
  workoutWalk: WorkoutWalkResult | null;
  // v48 · P4 (Sep 24 2026) — today's steps from Google Fit, zero taps (DECISIONS
  // §2 #8): one quiet "· 4,210 steps today" on home's walk row. Asked once after
  // boot; shown only when Fit answers — when it doesn't, nothing is invented
  // (fail-loud: a missing number stays missing, never a 0).
  stepsToday: number | null;
  // v45: one save at a time. The walk lane awaits Google Fit (up to 5 s) before
  // saving, and a second tap on "Save & finish" in that window wrote a 2nd row.
  savingLog: boolean;
  // A snapshot too old to resume silently (see STALE_SESSION_MS). Held here until
  // she answers the home card; the snapshot stays in localStorage meanwhile so a
  // reload asks again rather than losing it.
  staleSnapshot: ActiveSessionSnapshot | null;
  cycleUndoTimer: ReturnType<typeof setTimeout> | null;
  cycleUndoStartDate: string | null;
  // v50 · fix (Sep 25 2026): Undo must only ever delete a row THIS tap created.
  // Before this flag, re-logging an already-logged date (a second tap on a day
  // she'd logged earlier, or re-logging today) then tapping Undo deleted the
  // ORIGINAL row — it's gone from localStorage and a DELETE reaches Supabase
  // too. false = "the date already existed; nothing for Undo to remove."
  cycleUndoCreated: boolean;
  // (The cycle PAGE's own return-to / compare-metric / scroll fields moved into screens/cycle.ts
  // as module-local lets in step 12c: nothing but that page touched them.)
  historyEditDraft: HistoryEditDraft | null;
  // Which week the user is currently looking at on the home screen. 0 = this
  // (current) Sat-Fri week. 1 = one week ago. Etc. Module-level — purely UI state.
  viewedWeekOffset: number;
  // Module-level UI state: is Home showing the last CLOSED week instead of the
  // current open/pending one? Set by tapping "‹ Week 4"; cleared by "Week 5 ›"
  // (§8c: "the same link becomes 'Week 5 ›' to return"). Purely a view toggle —
  // never changes what week a new session counts toward or trains.
  viewingLastClosedWeek: boolean;
  // ---------- per-exercise voice note (Allison Jul 9 2026) ----------
  // One <audio> plays at a time. The button toggles play/pause; button visuals
  // reflect playback and are re-synced after a re-render (opening a dropdown
  // re-renders the card, but the detached Audio keeps playing).
  voiceAudio: HTMLAudioElement | null;
  voiceAudioSrc: string | null;
  // v48 · P6: the Data fold stays open across its own re-render (an import or a
  // clear re-renders, then shows its status line inside the fold).
  settingsDataOpen: boolean;
  // v46: WHERE she is, for the scroll reset in render(). Done·Next at the bottom
  // of one step used to open the next step at the same scroll depth — the
  // exercise name 69px off the top, another Done·Next under her thumb, 22 of 22
  // steps (UX audit Sep 24). Keyed on position, not on render: the timer
  // re-renders every second and must never move the page.
  lastNavKey: string | null;
  pendingScrollRestore: number | null;
  // v48 · P6: the list's scroll when a Session was opened from it, per screen (written by the
  // data-detail click in app.ts, read by the Session screen's × Back in screens/history.ts).
  detailOpenedAtScroll: Partial<Record<AppScreen, number>>;
}

export const ui: Ui = {
  stepListOpen: false,
  timerPipOpen: false,
  holdRedoInProgress: false,
  audioCtx: null,
  activeTimer: null,
  rafHandle: null,
  timerHoldsWakeLock: false,
  walkWakeLock: null,
  walkTickId: null,
  preLogTickId: null,
  postLogTickId: null,
  workoutWalk: null,
  stepsToday: null,
  savingLog: false,
  staleSnapshot: null,
  cycleUndoTimer: null,
  cycleUndoStartDate: null,
  cycleUndoCreated: false,
  historyEditDraft: null,
  viewedWeekOffset: 0,
  viewingLastClosedWeek: false,
  voiceAudio: null,
  voiceAudioSrc: null,
  settingsDataOpen: false,
  lastNavKey: null,
  pendingScrollRestore: null,
  detailOpenedAtScroll: {},
};
