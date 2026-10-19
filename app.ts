// app.ts — workout-tracker
// Lead-dev pass 2026-05-15 consolidates: code-correctness fixes (timer rewrite,
// audio unlock, sync hygiene), UX restructure (Done·Next primary, Quit demoted,
// hold-to-skip rest, today's pick, week-dots, history-detail), and visual
// layer (still images + YouTube embeds + collapsible how-to).

import { renderRides, attachRidesHandlers, ridesVsDelta } from './screens/rides.js';
import { renderPausedOverlay } from './workout-breaks.js';
import {
  restoreActiveSession,
  applyActiveSnapshot,
  resetState,
  setResumeHooks,
} from './session-resume.js';
import {
  injectMarkerProgramWeek,
  replaceCalendarMarks,
  appendRounds,
  type WorkoutId,
  type AnyWorkoutId,
  type Phase,
  type CalendarMarks,
} from './program.js';
import type { LogEntry } from './types.js';
import { ui } from './ui.js';
import {
  saveActiveSession,
  clearActiveSession,
  logStaleSessionAsDone,
  logPeriodStart,
  flushPendingSyncs,
  setActionHooks,
} from './actions.js';
import { state, isValidLogEntry, loadLogs } from './state.js';
import { setRenderer, setScrollRestoreSink } from './bus.js';
import { installTimerVisibilityHandler } from './timer.js';
import {
  setWalkLineUpdater,
  walkFeelReady,
  activeWalkStart,
  walkLiveText,
  beginWalkTracking,
  startWalk,
  finishWalk,
  cancelWalk,
  workoutWalkStart,
  harvestWorkoutWalk,
  resumeWalkTracking,
  fetchStepsToday,
} from './walk.js';
import { unlockAudio } from './audio.js';
import { bindClick } from './dom.js';
import {
  renderPostLog,
  attachPostLogHandlers,
  beginPostLogClockTick,
  endPostLogClockTick,
} from './screens/postlog.js';
import {
  renderPreLog,
  attachPreLogHandlers,
  fitSteppedLine,
  beginPreLogClockTick,
  endPreLogClockTick,
} from './screens/prelog.js';
import { renderSettings, attachSettingsHandlers } from './screens/settings.js';
import { mountNoteButton, flushNotesNow } from './screens/notesheet.js';
import {
  renderHome,
  attachHomeHandlers,
  attachHomeHandlers2,
  attachHomeHandlers3,
  attachHomeHandlers4,
} from './screens/home.js';
import { renderCycle, attachCycleHandlers } from './screens/cycle.js';
import {
  renderHistory,
  renderHistoryDetail,
  renderHistoryEdit,
  attachHistoryHandlers,
} from './screens/history.js';
import {
  sessionPayload,
  legacySessionPayload,
  timingStrippedSessionPayload,
  pushSessionTiered,
  patchSessionRequest,
  patchMatchedARow,
  pullFromSupabase,
  mergeRemoteSessions,
  syncIndicatorText,
} from './sync.js';
import { flushPendingWalks } from './sync-movement.js';
import { pullCyclePeriodsFromSupabase, cyclePeriodPayload } from './sync-cycle.js';
import { mergeWeekMoves, pullWeekMovesFromSupabase, weekMovePayload } from './sync-week-moves.js';
import {
  setWorkoutDProvider,
  preLaunchPlanDate,
  planKeyForLog,
  isNowAfterCompletionLaunch,
  shownWeek,
  gapCountsBackToWeekKey,
  currentHowToWeekKey,
} from './week-clock.js';
import { attributeSessionsToWeeks } from './program-week.js';
import {
  getWorkoutD,
  currentSteppedMoves,
  getCurrentWorkout,
  skippedStepsCount,
  tonightNames,
  getCurrentExercise,
} from './workout-now.js';
import {
  renderWorkout,
  renderStepListSheet,
  renderTimerPip,
  attachWorkoutStepListHandlers,
  attachWorkoutFeelHandlers,
  attachWorkoutFeelHandlers2,
  attachWorkoutRideFeelHandlers,
  attachWorkoutLaneHandlers,
  attachWorkoutLaneStopHandler,
  attachWorkoutLaneSkipHandler,
  attachWorkoutCardHandlers,
  attachWorkoutNavHandlers,
  attachWorkoutCooldownHandlers,
  attachWorkoutControlHandlers,
  attachWorkoutHoldHandlers,
  setWorkoutHooks,
} from './screens/workout.js';
import { renderProgress } from './screens/progress.js';
import { renderWeeklyReview, computeWeekTotals, attachReviewHandlers } from './screens/review.js';

// Retired-feature notes (hand routine, the auto-suggest toggle, the year grid) and the
// moved version / walk-credit / Ship 3-5 history: docs/history-notes.md and the module each now sits in.

// The timer engine lives in timer.ts (step 11a). Its visibility fast-forward is
// installed here, where the old inline listener ran.
installTimerVisibilityHandler();

// v48 · P3 (Sep 24 2026): minutes only — "Walking · 12 min", refreshed by the
// 30 s tick. The step/km parts are gone with the sensors (archived).
// v59 (Sep 28 2026, R2-N2): also the walk-lane feel chip's own reveal — the
// chip's HTML never changes once it exists (only WHETHER it's shown does,
// see walkFeelReady above), so a class toggle on its wrapper is enough; no
// need for a full render() mid-walk (app.ts keeps that discipline everywhere
// else a tick runs, see updatePreLogClockLine's own comment).
function updateWalkLiveLine(): void {
  const start = activeWalkStart() ?? workoutWalkStart();
  const el = document.getElementById('walk-live');
  if (el) el.textContent = walkLiveText(start);
  const feelSlot = document.getElementById('walk-move-feel-slot');
  if (feelSlot) feelSlot.classList.toggle('wt-hidden', !walkFeelReady(workoutWalkStart()));
}

// The in-workout walk no longer auto-starts just because she lands on the step
// (Allison Jul 9 2026: "just because I'm on the page doesn't mean it started
// walking"). Tracking begins only when she taps Start (startWorkoutWalk); before
// that, nothing is timed or logged. Once started, this keeps the wake lock + the
// minute tick alive across re-renders / app-close, and harvests when she moves
// past the step.
function syncWorkoutWalkTracking(): void {
  const onWalkStep =
    state.screen === 'workout' && !state.isResting && getCurrentExercise()?.name === 'Outdoor walk';
  const started = workoutWalkStart() !== null;
  const standaloneActive = activeWalkStart() !== null;
  if (onWalkStep && started && !standaloneActive) {
    // First tick after Start, or resumed after an app close — (re)start the
    // wake lock + minute tick (walk.ts: only if it is not already ticking); the
    // start stamp is already in localStorage.
    resumeWalkTracking();
    updateWalkLiveLine();
  } else if (!onWalkStep && started) {
    harvestWorkoutWalk();
  }
}

// Test hook (automation only — Fit is off under navigator.webdriver).
if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
  (window as unknown as { __wtSetStepsToday?: (n: number | null) => void }).__wtSetStepsToday = (
    n
  ) => {
    ui.stepsToday = n;
    if (state.screen === 'home') render();
  };
}

// ---------- state machine ----------

function startWorkout(id: AnyWorkoutId): void {
  state.selectedWorkout = id;
  // WK2 (Sep 27 2026), §2.3 "pin the plan for a session in progress": fixed
  // the instant she picks it, so a session that straddles the open week's own
  // Sat/Sun boundary (started right before it, still running after) keeps
  // training the moves she was shown at pre-log, not whatever week.ts says
  // "now" is by the time she reaches the workout screen.
  // WK4 (Sep 27 2026): post-launch, pin the RESOLVED key instead of a
  // synthetic date — the same key gapCountsBackToWeekKey/shownWeek already
  // used to pick what she was SHOWN, so the pin can never disagree with it.
  // Exactly one of the two pins is set; the other is cleared.
  if (isNowAfterCompletionLaunch()) {
    state.pinnedWeekKey = gapCountsBackToWeekKey() ?? shownWeek().key;
    state.pinnedPlanDateIso = null;
  } else {
    state.pinnedWeekKey = null;
    state.pinnedPlanDateIso = preLaunchPlanDate().toISOString();
  }
  state.screen = 'pre-log';
  state.liteDay = false; // fresh pick, full program until she says otherwise
  // T1 (Sep 27 2026), §3.1: a fresh pick asks fresh — never carry yesterday's
  // confirmed start time into a new session.
  state.herStartAt = null;
  state.herStartConfirmed = false;
  state.herStartEditingOpen = false;
  render();
  beginPreLogClockTick();
}

// ---------- v48 · P4 (Sep 24 2026): the "Done ✓" card's firsts ----------
// Her words today: "look at home ux ui and make it better i feel like its a bit
// all over the place". After Save, home used to light the NEXT workout as
// "Today's pick" minutes later; now a Done card witnesses tonight, with any
// firsts ("split squat · first elliptical ride"). Per-phone display memory
// only — the session row itself is the record; without this key the card still
// reads "Done ✓ · Workout A · 1 of 3 this week".

// Names that were "New tonight" in the session being saved, plus "first
// elliptical ride" when no earlier session was on the elliptical. A session
// stopped early names no move firsts (she may not have reached them); finish-
// here at round 1 skipped the upper-back block, so its moves don't count.
// v48 · fix r1: returning moves go to `back`, never to firsts.
function sessionFirsts(onElliptical: boolean): { firsts: string[]; back: string[] } {
  let out: string[] = [];
  let back: string[] = [];
  const id = state.selectedWorkout;
  const w = getCurrentWorkout();
  if (id && w && !state.stoppedEarlyAt) {
    const phases: Phase[] =
      state.finishHereLitePrev !== null
        ? ['warmup', 'main', 'cooldown']
        : ['warmup', 'main', 'upperBack', 'cooldown'];
    out = tonightNames(w, id, 'new', phases);
    back = tonightNames(w, id, 'back', phases);
  }
  if (onElliptical) {
    const rodeBefore = loadLogs().some(
      (l) =>
        l.cardioLane === 'elliptical' ||
        (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) ||
        /cardio: elliptical\b/.test(l.notes ?? '')
    );
    if (!rodeBefore) out.push('first elliptical ride');
  }
  return { firsts: out, back };
}
function discardStaleSession(): void {
  ui.staleSnapshot = null;
  clearActiveSession();
  render();
}

// "Keep going": resume it anyway. The Done safety net will blank the duration.
function continueStaleSession(): void {
  const snap = ui.staleSnapshot;
  if (!snap) return;
  ui.staleSnapshot = null;
  applyActiveSnapshot(snap);
  render();
}

// ---------- sync ----------

// WK2 fix r1 (Sep 27 2026, checker's should #6): a pure per-week summary from
// the LIVE attributeSessionsToWeeks — app.ts isn't Node-importable (DOM +
// localStorage throughout), so tests/week.test.ts's own "REAL parity" test
// could only prove week.ts never touches pre-launch rows, not that it AGREES
// with the OLD model's real counts (GATE 2's actual ask). Reached the same
// way as the hooks below, over an arbitrary log list (not just what's in
// storage), so a test can freeze the exact per-week table her 42 real rows
// give TODAY'S live code, in Node-free Playwright.
function weekAttributionSummary(
  logs: LogEntry[]
): { saturdayIso: string; count: number; letters: WorkoutId[] }[] {
  const attribution = attributeSessionsToWeeks(logs);
  const byWeek = new Map<number, LogEntry[]>();
  for (const [log, weekMs] of attribution) {
    const arr = byWeek.get(weekMs) ?? [];
    arr.push(log);
    byWeek.set(weekMs, arr);
  }
  return Array.from(byWeek.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([weekMs, weekLogs]) => ({
      saturdayIso: new Date(weekMs).toISOString(),
      count: weekLogs.length,
      // v54: D is always after the completion-model launch (COMPLETION_WEEKS_
      // FROM), so it never legitimately lands in this OLD-model, pre-launch
      // per-week summary — excluded rather than widening this hook's type.
      letters: weekLogs
        .slice()
        .filter((l): l is LogEntry & { workout: WorkoutId } => l.workout !== 'D')
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => l.workout),
    }));
}

// Test-only hooks: these are pure functions reached through UI paths that are
// awkward or destructive to drive (a file-picker import, a whole seeded week),
// and the network is off under automation (syncDisabled). Never set outside
// automation. v34 added the two the bleed check caught untested.
if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
  const w = window as unknown as {
    __wtMergeRemoteSessions?: typeof mergeRemoteSessions;
    __wtIsValidLogEntry?: typeof isValidLogEntry;
    __wtComputeWeekTotals?: typeof computeWeekTotals;
    __wtSessionPayload?: typeof sessionPayload;
    __wtLegacySessionPayload?: typeof legacySessionPayload;
    __wtTimingStrippedSessionPayload?: typeof timingStrippedSessionPayload;
    __wtPushSessionTiered?: typeof pushSessionTiered;
    __wtPatchSessionRequest?: typeof patchSessionRequest;
    __wtPatchMatchedARow?: typeof patchMatchedARow;
    __wtWeekAttributionSummary?: typeof weekAttributionSummary;
    __wtStartWorkout?: typeof startWorkout;
    __wtInjectMarkerProgramWeek?: typeof injectMarkerProgramWeek;
    __wtPlanKeyForLog?: typeof planKeyForLog;
    __wtCurrentHowToWeekKey?: typeof currentHowToWeekKey;
    // v58 (Sep 28 2026): the rides-page Δ formatting is pure too — tested
    // directly rather than reverse-engineering it off rendered week data.
    __wtRidesVsDelta?: typeof ridesVsDelta;
    // v58: the live session's own stepped-moves list, asserted directly
    // (which moves ask tonight) instead of only through the rendered chip.
    __wtCurrentSteppedMoves?: typeof currentSteppedMoves;
    __wtSeedCalendarMarks?: typeof replaceCalendarMarks;
    __wtCalendarMarksSeed?: CalendarMarks;
    __wtRoundsSeed?: { num: number; start: string }[];
  };
  w.__wtMergeRemoteSessions = mergeRemoteSessions;
  w.__wtIsValidLogEntry = isValidLogEntry;
  w.__wtComputeWeekTotals = computeWeekTotals;
  // v48: the push payloads are pure — tested here since sync is off in tests.
  w.__wtSessionPayload = sessionPayload;
  w.__wtLegacySessionPayload = legacySessionPayload;
  // T1 fix r1 (Sep 27 2026, checker's must #2): the middle retry tier, and
  // the tiered retry ITSELF (network + markLogSynced included) — real sync
  // stays off (syncDisabled gates the caller, pushLogToSupabase, never this
  // function), so a test drives it by passing its own `post` in place of the
  // real fetch-backed postSession.
  w.__wtTimingStrippedSessionPayload = timingStrippedSessionPayload;
  w.__wtPushSessionTiered = pushSessionTiered;
  // v53: the edit PATCH request is pure too (url + body, no fetch) — same
  // reasoning, tested the same way.
  w.__wtPatchSessionRequest = patchSessionRequest;
  // v53 fix (CHECK M2): the 0-rows-matched decision, isolated the same way.
  w.__wtPatchMatchedARow = patchMatchedARow;
  w.__wtWeekAttributionSummary = weekAttributionSummary;
  // WK2 fix r1 (Sep 27 2026, checker's should #2 test): Home only ever offers
  // a data-workout button for a MISSING letter (§2.4 "chips = the other
  // missing letters") — an already-done letter has no tap target there on
  // purpose, so a test proving the REPEAT case (her doing a letter a second
  // time) needs a way in that isn't a Home click. startWorkout() itself is
  // the exact function a real tap already calls; reached here the same way.
  w.__wtStartWorkout = startWorkout;
  w.__wtInjectMarkerProgramWeek = injectMarkerProgramWeek;
  // WK4 (Sep 27 2026): the saved-session plan lookup's own resolved KEY, for a
  // test to assert directly — planForLog's plan CONTENT can't tell two weeks
  // apart when one repeats the other's moves (see planKeyForLog's own comment).
  w.__wtPlanKeyForLog = planKeyForLog;
  // WK4 (Sep 27 2026): the "seen this week" how-to key, asserted directly
  // rather than through a full pre-log → workout → how-to-card UI journey.
  w.__wtCurrentHowToWeekKey = currentHowToWeekKey;
  w.__wtRidesVsDelta = ridesVsDelta;
  w.__wtCurrentSteppedMoves = currentSteppedMoves;
  // v62 (step 5d): tests that need a different calendar (e.g. no Sick weeks)
  // SEED the data the app reads instead of flipping an app switch. A test's init
  // script leaves its marks on window.__wtCalendarMarksSeed before this file
  // loads; they replace SKIPPED_WEEKS here, once, before the first render.
  // __wtSeedCalendarMarks is the same replace, callable later (then re-render).
  w.__wtSeedCalendarMarks = replaceCalendarMarks;
  if (w.__wtCalendarMarksSeed) replaceCalendarMarks(w.__wtCalendarMarksSeed);
  // v62.1: same idea for ROUNDS (a hypothetical Round 3 with no plan rows yet).
  if (w.__wtRoundsSeed) appendRounds(w.__wtRoundsSeed);
}

if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
  const w = window as unknown as {
    __wtCyclePeriodPayload?: typeof cyclePeriodPayload;
    __wtLogPeriodStart?: typeof logPeriodStart;
    __wtWeekMovePayload?: typeof weekMovePayload;
    __wtMergeWeekMoves?: typeof mergeWeekMoves;
  };
  w.__wtCyclePeriodPayload = cyclePeriodPayload;
  // v50: the tap's real timer (10s) is too slow to wait out in a test — this
  // hook drives the same function a click does, so tests assert the local
  // row + the payload without a real-time wait (her sync-is-off automation
  // rule: assert local state + payload, not a round trip).
  w.__wtLogPeriodStart = logPeriodStart;
  // WK3 (Sep 27 2026): same reasoning as __wtCyclePeriodPayload — a test can
  // assert the exact push body + the pure merge without a real network call.
  w.__wtWeekMovePayload = weekMovePayload;
  w.__wtMergeWeekMoves = mergeWeekMoves;
}

function updateSyncIndicator(): void {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.textContent = syncIndicatorText();
  el.className = `sync-indicator sync-${state.syncStatus}`;
}

function navigationKey(): string {
  if (state.screen === 'workout') {
    return `workout|${state.currentPhase}|${state.currentRound}|${state.currentExerciseIndex}|${state.isResting ? 'rest' : state.roundBreak ? 'break' : state.rideNumbersOpen ? 'ride-numbers' : 'go'}`;
  }
  if (state.screen === 'history-detail') return `history-detail|${state.historyDetailId ?? ''}`;
  return state.screen;
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;
  let html = '';
  switch (state.screen) {
    case 'home':
      html = renderHome();
      break;
    case 'pre-log':
      html = renderPreLog();
      break;
    case 'workout':
      html = renderWorkout();
      break;
    case 'post-log':
      html = renderPostLog();
      break;
    case 'history':
      html = renderHistory();
      break;
    case 'history-detail':
      html = renderHistoryDetail();
      break;
    case 'history-edit':
      html = renderHistoryEdit();
      break;
    case 'weekly-review':
      html = renderWeeklyReview();
      break;
    case 'progress':
      html = renderProgress();
      break;
    case 'settings':
      html = renderSettings();
      break;
    case 'cycle':
      html = renderCycle();
      break;
    case 'rides':
      html = renderRides();
      break;
  }
  // Pause affordance — the Pause button sits in each workout sub-view's header
  // (exercise, rest, cooldown; v46). When paused, a full overlay replaces it so
  // Resume is unmissable on any sub-view.
  if (state.screen === 'workout' && state.pausedAt !== null) {
    html += renderPausedOverlay();
  }
  // v50 · jump list (Sep 25 2026): the List sheet, over whichever workout
  // sub-view is showing. Rendered through the normal cycle (not appended to
  // document.body the way the quit-confirm panel is) so its ✓ marks and
  // current-step marker are always live state, never a stale snapshot from
  // the moment it opened.
  if (state.screen === 'workout' && state.pausedAt === null && ui.stepListOpen) {
    const w = getCurrentWorkout();
    if (w) html += renderStepListSheet(w);
  }
  // v53 (Sep 26 2026): the running-timer pip — floats over whichever step
  // face is showing (see renderTimerPip). Hidden while the List sheet is up
  // (it's a full overlay above it anyway) — the timer itself keeps running
  // underneath either way, so nothing is lost by not drawing the pip there.
  if (state.screen === 'workout' && state.pausedAt === null && !ui.stepListOpen) {
    html += renderTimerPip();
  }
  // Ship 6: screen transitions — apply enter-animation class except on
  // workout/timer screens where it would feel laggy mid-rep. The class
  // triggers a 220ms fade + 8px translateY with the spring ease curve.
  root.innerHTML = html;
  // v48 (Sep 24 2026): room under the last line for the pinned action bar, so
  // nothing scrolls out of reach behind it (same idea as the old has-pause-fab).
  root.classList.toggle('has-action-bar', root.querySelector('.action-bar') !== null);
  // v13: the in-workout walk tracker follows the screen — starts on the
  // Outdoor-walk step, harvests when she moves past it (or quits).
  syncWorkoutWalkTracking();
  if (state.screen !== 'workout' && state.screen !== 'pre-log' && state.screen !== 'post-log') {
    root.classList.remove('screen-enter');
    // Force reflow so re-adding triggers the animation.
    void root.offsetWidth;
    root.classList.add('screen-enter');
  } else {
    root.classList.remove('screen-enter');
  }
  attachHandlers();
  // v59 (Sep 28 2026, R2-S1): the pre-log "Stepped this week" line's live
  // one-line fit — see fitSteppedLine's own comment. Must run after
  // attachHandlers/innerHTML (it measures the just-mounted #prelog-stepped).
  if (state.screen === 'pre-log') fitSteppedLine(currentSteppedMoves());
  // v46: a new screen or step lands at the top (see navigationKey).
  // v48 · P6 (Sep 24 2026): except coming BACK from a Session to the list that
  // opened it — she lands where she was, not at the top of 39 rows (DECISIONS
  // §5 Sessions: "Scroll position is restored on back").
  const navKey = navigationKey();
  if (navKey !== ui.lastNavKey) {
    ui.lastNavKey = navKey;
    const restore = ui.pendingScrollRestore;
    ui.pendingScrollRestore = null;
    window.scrollTo(0, restore ?? 0);
  }
  // Persist live position so reopening the app resumes the workout (cleared on
  // quit/finish via resetState). No-op for non-resumable screens.
  saveActiveSession();
}

function attachHandlers(): void {
  // v48 · P4: the "Up next" hero AND the B/C chips carry data-workout.
  document.querySelectorAll<HTMLButtonElement>('button[data-workout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['workout'] as AnyWorkoutId | undefined;
      if (id) {
        unlockAudio(); // Group 1C: gesture-anchored audio unlock
        startWorkout(id);
      }
    });
  });

  attachHomeHandlers();

  // v32: the left-open workout card on home (see STALE_SESSION_MS).
  bindClick('stale-finished', logStaleSessionAsDone);
  bindClick('stale-discard', discardStaleSession);
  bindClick('stale-continue', continueStaleSession);

  // v48 · P4 (Sep 24 2026): the home ‹ › week arrows are gone — home always
  // shows this week; stepping back through weeks moves to Weekly review (P6).

  bindClick('back-home', () => {
    // v48 · P6 (Sep 24 2026): leaving Weekly review is only a screen change —
    // the week she stepped back to is kept for the review flow (resetState,
    // when a session ends, is what puts it back on this week).
    if (state.screen === 'weekly-review') {
      state.screen = 'home';
      render();
      return;
    }
    resetState();
    render();
  });

  // v48 · P6: the Weekly review's ‹ › week arrows (screens/review.ts, step 13c).
  attachReviewHandlers();

  attachHomeHandlers2();

  // Ship 6: Settings interactions — toggles, steppers, data buttons.
  attachSettingsHandlers();

  // v50 · cycle: Progress card + Settings' quiet row.
  attachCycleHandlers();

  // THE RIDES PAGE (Sep 27 2026): Progress's one door row + the page itself.
  attachRidesHandlers();

  attachHomeHandlers3();

  // Walk credit (Jul 4 2026, upgraded same night to her timer idea): tap Start
  // when you head out, tap Done when finished — minutes log themselves. The
  // re-render swaps the card state; that's the feedback. No modal, no fields.
  bindClick('log-walk-start', () => {
    startWalk();
    render();
    updateWalkLiveLine();
  });
  bindClick('finish-walk', () => {
    finishWalk();
    render();
  });
  bindClick('cancel-walk', () => {
    cancelWalk();
    render();
  });

  attachHistoryHandlers();

  attachHomeHandlers4();

  // Week dots + history rows + year-grid cells — navigate to history-detail.
  // We use Element here (not HTMLButtonElement) so SVG <rect> cells in the
  // Ship 3 year-grid heatmap also pick up the handler. SVGElement.dataset
  // exists on all modern browsers.
  document.querySelectorAll<Element>('[data-detail]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const id = (el as HTMLElement | SVGElement).dataset?.['detail'];
      if (!id) return;
      // v48 · P4: a day dot inside the week card opens its session, not the card.
      e.stopPropagation();
      // v48 · P6: remember where she opened it from, and how far down.
      const from = state.screen;
      state.detailReturnTo = from === 'weekly-review' || from === 'home' ? from : 'history';
      ui.detailOpenedAtScroll[state.detailReturnTo] = window.scrollY;
      state.historyDetailId = id;
      state.screen = 'history-detail';
      render();
    });
  });

  attachWorkoutNavHandlers();

  attachWorkoutStepListHandlers();

  attachPostLogHandlers();
  attachPreLogHandlers();

  attachWorkoutFeelHandlers();
  attachWorkoutRideFeelHandlers();
  attachWorkoutFeelHandlers2();
  attachWorkoutCooldownHandlers();
  attachWorkoutLaneHandlers();

  attachWorkoutControlHandlers();
  attachWorkoutLaneStopHandler();
  attachWorkoutLaneSkipHandler();
  attachWorkoutHoldHandlers();

  attachWorkoutCardHandlers();
  // v48 · P5 (Sep 24 2026): the three range sliders became tap chips (see
  // renderChipRow) — the touched flag is still what makes a number a reading.
}

document.addEventListener('DOMContentLoaded', () => {
  setWorkoutDProvider(getWorkoutD); // week-clock.ts: planForLog needs the fixed D workout
  setActionHooks({
    // actions.ts (the save side) calls these UI-side effects back, at the points the old inline calls ran.
    updateSyncIndicator,
    getCurrentWorkout,
    harvestWorkoutWalk,
    endPostLogClockTick,
    sessionFirsts,
    currentSteppedMoves,
    skippedStepsCount,
    resetState,
  });
  // screens/workout.ts: what its state machine calls back for and cannot import (the reset, the clock ticks)
  setWorkoutHooks({ resetState, beginPostLogClockTick, endPreLogClockTick });
  setResumeHooks({ beginPostLogClockTick, endPreLogClockTick, endPostLogClockTick }); // session-resume.ts: the clock ticks it starts / stops belong to the pre-log and post-log screens
  setWalkLineUpdater(updateWalkLiveLine); // walk.ts: the minute tick calls the line updater that stays here (it writes the DOM)
  setRenderer(render); // bus.ts: screens that leave this file ask for a redraw through requestRender()
  setScrollRestoreSink((y) => {
    ui.pendingScrollRestore = y; // bus.ts: ...and for a scroll restore through requestScrollRestore()
  });
  // Resume an in-progress workout if one was left open (Allison 2026-06-06).
  restoreActiveSession();
  render();
  mountNoteButton(); // v63 item 1: the 🎤 Note button, pinned outside #app on every screen
  flushNotesNow(); // ...and any note left unsent last time goes now
  void pullFromSupabase().then(() => {
    void flushPendingSyncs();
    void fetchStepsToday(); // v48 · P4: once, after the pull
  });
  void pullCyclePeriodsFromSupabase(); // v50 · cycle
  void pullWeekMovesFromSupabase(); // WK3 · week_moves
  void flushPendingWalks();
  // v45: a session saved offline (gym basement, airplane mode) now syncs the
  // moment the signal comes back — before, only on the next app open.
  window.addEventListener('online', () => {
    flushNotesNow();
    void flushPendingSyncs();
    void flushPendingWalks();
    void pullCyclePeriodsFromSupabase(); // v50 · cycle
    void pullWeekMovesFromSupabase(); // WK3 · week_moves
  });
  // Resume an in-progress WALK too (Jul 4): restart GPS + step tracking and
  // the wake lock — accumulated meters/steps live in localStorage, so a
  // mid-walk app close only pauses the sensors, it never loses the walk.
  if (activeWalkStart()) {
    beginWalkTracking();
    updateWalkLiveLine();
  }
});
