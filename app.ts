// app.ts — workout-tracker
// Lead-dev pass 2026-05-15 consolidates: code-correctness fixes (timer rewrite,
// audio unlock, sync hygiene), UX restructure (Done·Next primary, Quit demoted,
// hold-to-skip rest, today's pick, week-dots, history-detail), and visual
// layer (still images + YouTube embeds + collapsible how-to).

import { renderRides, attachRidesHandlers, ridesVsDelta } from './screens/rides.js';
import { isMoveFeelValue } from './move-feel.js';
import { isArmFeel, isArmLoad, heavierArmLoad, defaultArmLoad } from './workout-feel.js';
import { renderPausedOverlay } from './workout-breaks.js';
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
import { ellipticalMinutes } from './cardio-readings.js';
import { clearApartmentCardio, clearElliptical } from './workout-lanes.js';
import {
  saveActiveSession,
  RESUMABLE_SCREENS,
  clearActiveSession,
  logStaleSessionAsDone,
  logPeriodStart,
  flushPendingSyncs,
  setActionHooks,
} from './actions.js';
import {
  type AppScreen,
  type ArmFeelState,
  type MoveFeelState,
  type ArmLoadState,
  type ActiveSessionSnapshot,
  ACTIVE_SESSION_KEY,
  WW_RESULT_KEY,
  state,
  isValidLogEntry,
  loadLogs,
} from './state.js';
import { setRenderer, setScrollRestoreSink } from './bus.js';
import { stopTimer, installTimerVisibilityHandler } from './timer.js';
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
import { unlockAudio, stopVoiceNote } from './audio.js';
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
  ELLIPTICAL_NAME,
  getWorkoutById,
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

// Hand routine retired 2026-05-15 per Allison. All hand-routine types,
// constants, persistence, sync, state machine, render, and event handlers
// moved to archive/hand-routine-2026-05-15/. See that folder's README.md
// for the timeline and re-enable instructions.

// Resume support (Allison 2026-06-06): "when i leave the page i want it to open
// on the workout im in unless i exit." We snapshot the live position of an
// in-progress session so reopening the app lands back on that workout. Quitting
// or finishing clears it (those go through resetState()). The key it is stored
// under, ACTIVE_SESSION_KEY, lives in state.ts with every other storage key.
// A workout is 30-60 minutes. A snapshot older than this was LEFT OPEN, not
// paused (v32, Sep 11 2026): she did Workout A on Mon Sep 7 and never tapped
// Done; the app kept the snapshot and would have dropped her straight back into
// it on the next open, days later, with no idea it was stale — and tapping
// through to Done from there is exactly what logged the Sep 2→4 "B" row as a
// 46-hour workout. Past this age the app ASKS on home (did it / throw it away /
// keep going) instead of resuming silently.
const STALE_SESSION_MS = 3 * 60 * 60 * 1000;
// Ship 6: timing defaults — overridable via Settings screen. The constants
// remain as "defaults" only; runtime values come from getSetting().
// Allison 2026-05-15 18:07: "i do not need the brakes anymore there doesn't
// need the brakes in between exercises." Default rest is now 0 (skip).
// Range allows 0-180 in Settings — bump back up if she ever wants it.
// (DEFAULT_REST_SEC and DEFAULT_PRE_COUNT_SEC now live in state.ts, with the settings getters.)

// v48 · P4 (Sep 24 2026): getAutoSuggestEnabled() retired with its toggle.
// v48 · P6 (Sep 24 2026): its SETTING_KEYS entry went too (DECISIONS §5: "no
// evidence you ever turned it off. It turns off the one thing that carries the
// app"); an old phone's stored value just sits unread.

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

// HAND_ROUTINES retired 2026-05-15 — see archive/hand-routine-2026-05-15/.

// The timer engine lives in timer.ts (step 11a). Its visibility fast-forward is
// installed here, where the old inline listener ran.
installTimerVisibilityHandler();

// ---------- persistence ----------

// ---------- Walk credit (Jul 4 2026) ----------
// Her Jun-18 ask: "I sometimes just walk around my apartment, the walk can be
// pretty slow that's OK — maybe even log/credit them." Born one-tap (v8),
// upgraded the same night to a start/stop TRACKED walk (v10-v13): tap once to
// start, sensors run, tap Done — still two taps total, within her capture
// budget.
// Walks are EXTRA CREDIT — they NEVER count toward the 3/week streak, so the
// streak math stays honest. Supabase movement_log is the source of truth
// (tandem rule); localStorage is the offline layer, same pattern as sessions.
// v48 · P3 (Sep 24 2026): minutes only — the meters/steps counters are
// archived (archive/walk-sensors-2026-09-24/). Fit is asked at Save instead.

// Her Jul-4 idea: "click walking and you automatically start tracking until I
// tell you I'm done." Start/stop timer — start timestamp lives in localStorage
// so an in-progress walk survives closing the app (same trick as
// ACTIVE_SESSION_KEY).
// Same night, her calls: (1) "I don't care if the screen needs to stay open —
// it should make the screen stay open" → wake lock + GPS distance for outdoor
// walks; (2) "it can't track my steps at least?" → motion-sensor step estimate
// for apartment laps, where GPS physically can't see her. Both stop the moment
// the walk ends. Screen-locked = sensors pause = numbers undercount; the
// wake lock exists precisely so that doesn't happen.
// v48 · P3 (Sep 24 2026): a walk is MINUTES ONLY. The GPS distance and the
// motion-sensor step counter are archived (archive/walk-sensors-2026-09-24/):
// saved steps never matched Fit (3 steps in 29 min on Sep 4), GPS gave 16 m in
// 12 min, and her words Sep 7 were "walk counter not important now". Fail-loud:
// stop showing numbers that are wrong. The wake lock stays.
// The v47 counters' keys — only cleared now (a phone may still hold them).

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
// v48 · P7: only string keys with `true` survive — a corrupt value is dropped,
// never crashed on (the snapshot is a convenience).
function sanitizeStretchTicks(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === true) out[k] = true;
  }
  return out;
}

function sanitizeArmFeel(v: unknown): ArmFeelState {
  if (!v || typeof v !== 'object') return {};
  const o = v as { curl?: unknown; row?: unknown };
  const out: ArmFeelState = {};
  if (isArmFeel(o.curl)) out.curl = o.curl;
  if (isArmFeel(o.row)) out.row = o.row;
  return out;
}

// v58 (Sep 28 2026) — a corrupt/unknown-shaped key or value is dropped, never
// crashed on (same convention as sanitizeArmFeel/sanitizeStretchTicks): a
// resumed snapshot is trusted only as far as its shape actually checks out.
function sanitizeMoveFeel(v: unknown): MoveFeelState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: MoveFeelState = {};
  for (const [slug, val] of Object.entries(v as Record<string, unknown>)) {
    if (/^[a-z]+$/.test(slug) && isMoveFeelValue(val)) out[slug] = val;
  }
  return out;
}

// v55 (Sep 27 2026): a pre-v55 snapshot has no load → {} (defaultArmLoad
// fills it in at session start, same convention as armFeel).
function sanitizeArmLoad(v: unknown): ArmLoadState {
  if (!v || typeof v !== 'object') return {};
  const o = v as { curl?: unknown; row?: unknown };
  const out: ArmLoadState = {};
  if (isArmLoad(o.curl)) out.curl = o.curl;
  if (isArmLoad(o.row)) out.row = o.row;
  return out;
}

// v54 (Sep 27 2026): a corrupt/out-of-range value is dropped, never crashed
// on (same convention as sanitizeStretchTicks) — a resumed count is clamped
// to a plausible range rather than trusted as-is.
function sanitizeSetsDoneFor(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 20) out[k] = val;
  }
  return out;
}

// v60 fix (Sep 28 2026, checker's should #5): same shape of guard as
// sanitizeSetsDoneFor above, for heldSetsFor's array-of-seconds-per-set —
// each key's value must be an array of small non-negative integers (a
// held-seconds count never exceeds a couple of minutes; 600 s is a generous
// ceiling), so a corrupt or pre-v60 snapshot (no key at all) degrades to {}
// rather than crashing resume.
function sanitizeHeldSetsFor(v: unknown): Record<string, number[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number[]> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(val)) continue;
    const sets = val.filter(
      (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 600
    );
    if (sets.length > 0) out[k] = sets;
  }
  return out;
}

// Read + validate the in-progress snapshot against the live program (a workout
// she was mid-way through must still exist, and the phase/index must be in
// range) — a corrupt snapshot is discarded, not crashed on. Returns a fully
// defaulted snapshot or null.
function readActiveSnapshot(): ActiveSessionSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Partial<ActiveSessionSnapshot>;
    if (!snap || typeof snap !== 'object') return null;
    if (!snap.selectedWorkout || !RESUMABLE_SCREENS.includes(snap.screen as AppScreen)) {
      clearActiveSession();
      return null;
    }
    // v54 (Sep 27 2026): D isn't in PROGRAM — getWorkoutById can't resolve it.
    const w = snap.selectedWorkout === 'D' ? getWorkoutD() : getWorkoutById(snap.selectedWorkout);
    if (!w) {
      clearActiveSession();
      return null;
    }
    const phase = (snap.currentPhase ?? 'warmup') as Phase;
    const phaseList = w[phase] ?? [];
    const idx = snap.currentExerciseIndex ?? 0;
    // cooldown is a single list (index always 0); other phases need an in-range index.
    const idxOk = phase === 'cooldown' || (idx >= 0 && idx < phaseList.length);
    if (!idxOk) {
      clearActiveSession();
      return null;
    }
    // v51: is the snapshot's phase/index genuinely the elliptical step? PROGRAM
    // always stores the cardio slot as 'Outdoor walk' — the elliptical swap is
    // a runtime read of ellipticalMinutes() (see getCurrentExercise()), not a
    // different program entry — so this mirrors that same swap rather than
    // reading phaseList[idx].name directly (which would always say 'Outdoor
    // walk' and silently drop the flag on every reload).
    const rawStepEx = phase === 'cooldown' ? null : phaseList[idx];
    const stepIsElliptical =
      rawStepEx?.name === ELLIPTICAL_NAME ||
      (rawStepEx?.name === 'Outdoor walk' && ellipticalMinutes() !== null);
    return {
      screen: snap.screen as AppScreen,
      selectedWorkout: snap.selectedWorkout,
      capacityBefore: snap.capacityBefore ?? 5,
      capacityAfter: snap.capacityAfter ?? 5,
      // v50 · mood: a pre-v50 snapshot has neither → 5/false, same as a fresh session.
      moodBefore: snap.moodBefore ?? 5,
      moodAfter: snap.moodAfter ?? 5,
      moodBeforeTouched: snap.moodBeforeTouched ?? false,
      moodAfterTouched: snap.moodAfterTouched ?? false,
      wallSitSec: snap.wallSitSec ?? 0,
      backPain: snap.backPain ?? 0,
      // v49 · engine: a pre-engine snapshot has neither → 0/false/null, never a guess.
      wristPain: snap.wristPain ?? 0,
      wristPainTouched: snap.wristPainTouched ?? false,
      // v51: a pre-v51 snapshot has none of these → 0/false, never a guess.
      backPainBefore: snap.backPainBefore ?? 0,
      backPainBeforeTouched: snap.backPainBeforeTouched ?? false,
      wristPainBefore: snap.wristPainBefore ?? 0,
      wristPainBeforeTouched: snap.wristPainBeforeTouched ?? false,
      // T1: a pre-T1 snapshot has none of these → null/false, never a guess.
      herStartAt:
        typeof snap.herStartAt === 'string' && !Number.isNaN(new Date(snap.herStartAt).getTime())
          ? snap.herStartAt
          : null,
      herStartConfirmed: snap.herStartConfirmed ?? false,
      herEndAt:
        typeof snap.herEndAt === 'string' && !Number.isNaN(new Date(snap.herEndAt).getTime())
          ? snap.herEndAt
          : null,
      herEndConfirmed: snap.herEndConfirmed ?? false,
      breakMinutes:
        snap.breakMinutes === 0 ||
        snap.breakMinutes === 5 ||
        snap.breakMinutes === 15 ||
        snap.breakMinutes === 30
          ? snap.breakMinutes
          : null,
      stepFeel: snap.stepFeel === 'fine' || snap.stepFeel === 'too_much' ? snap.stepFeel : null,
      // Pre-v46 snapshot (no flags) → the numbers were saved as chosen then;
      // keep that reading rather than blank a session already under way.
      capacityBeforeTouched: snap.capacityBeforeTouched ?? true,
      capacityAfterTouched: snap.capacityAfterTouched ?? true,
      backPainTouched: snap.backPainTouched ?? true,
      word: snap.word ?? '',
      sessionNote: typeof snap.sessionNote === 'string' ? snap.sessionNote : '',
      // v48: a pre-v48 snapshot has no count → 0, never a guess.
      voicePlays: typeof snap.voicePlays === 'number' && snap.voicePlays >= 0 ? snap.voicePlays : 0,
      currentRound: snap.currentRound ?? 1,
      currentPhase: phase,
      currentExerciseIndex: phase === 'cooldown' ? 0 : idx,
      startedAt: typeof snap.startedAt === 'string' ? snap.startedAt : null,
      pausedAt: typeof snap.pausedAt === 'number' ? snap.pausedAt : null,
      pausedMs: typeof snap.pausedMs === 'number' && snap.pausedMs >= 0 ? snap.pausedMs : 0,
      liteDay: snap.liteDay === true, // default false on old snapshots
      // v48: pre-v48 snapshots have none of these → the plain step, no marker.
      roundBreak: snap.roundBreak === true && phase === 'main',
      finishHereLitePrev:
        typeof snap.finishHereLitePrev === 'boolean' && phase === 'cooldown'
          ? snap.finishHereLitePrev
          : null,
      stoppedEarlyAt: typeof snap.stoppedEarlyAt === 'string' ? snap.stoppedEarlyAt : null,
      stoppedEarlyLitePrev:
        typeof snap.stoppedEarlyLitePrev === 'boolean' && typeof snap.stoppedEarlyAt === 'string'
          ? snap.stoppedEarlyLitePrev
          : null,
      // v48 · P5: a pre-P5 snapshot has no feel → none, never a guess.
      armFeel: sanitizeArmFeel(snap.armFeel),
      // v58: a pre-v58 snapshot has no moveFeel key at all → {}, same rule.
      moveFeel: sanitizeMoveFeel(snap.moveFeel),
      // v61: a pre-v61 snapshot has no rideFeel key at all → null, same rule.
      rideFeel: isMoveFeelValue(snap.rideFeel) ? snap.rideFeel : null,
      // v55: a pre-v55 snapshot has no load → {}; renderArmLoadChips already
      // falls back to '1kg' per key, so a mid-session resume never crashes.
      armLoad: sanitizeArmLoad(snap.armLoad),
      // v55 · fix r1: a pre-fix-r1 snapshot has no separate max → fall back to
      // the (sanitized) armLoad itself, so a mid-session resume from just
      // before this shipped doesn't lose the heaviest-so-far tracking; take
      // the heavier of the two when both exist, same rule as a live tap.
      armLoadMax: (() => {
        const max = sanitizeArmLoad(snap.armLoadMax);
        const load = sanitizeArmLoad(snap.armLoad);
        return {
          curl: heavierArmLoad(max.curl, load.curl),
          row: heavierArmLoad(max.row, load.row),
        };
      })(),
      // v54: a pre-v54 snapshot has no sets-done → {} (nothing marked yet).
      setsDoneFor: sanitizeSetsDoneFor(snap.setsDoneFor),
      // v60 fix: a pre-fix snapshot has no held-sets key → {} (nothing lost —
      // there was nothing to carry before this fix shipped).
      heldSetsFor: sanitizeHeldSetsFor(snap.heldSetsFor),
      // v48 · P7: a pre-P7 snapshot has no ticks → {} (nothing ticked).
      stretchTicks: sanitizeStretchTicks(snap.stretchTicks),
      // v50 · jump list: a pre-v50 snapshot has no done-marks → {} (same
      // string→true shape as stretchTicks, so the same sanitizer applies).
      completedSteps: sanitizeStretchTicks(snap.completedSteps),
      // v51: only meaningful on the elliptical step itself — a pre-v51
      // snapshot has no flag → false, same as a fresh session.
      rideNumbersOpen: snap.rideNumbersOpen === true && stepIsElliptical,
      // WK2: a pre-WK2 snapshot (or a corrupt string) has none → null, which
      // getCurrentWorkout() already treats as "fall back to the live plan".
      pinnedPlanDateIso:
        typeof snap.pinnedPlanDateIso === 'string' &&
        !Number.isNaN(new Date(snap.pinnedPlanDateIso).getTime())
          ? snap.pinnedPlanDateIso
          : null,
      // WK4: a pre-WK4 snapshot (or a corrupt shape) has none → null, which
      // getCurrentWorkout() falls back to pinnedPlanDateIso (above) for, same
      // as a session pinned before WK4 shipped.
      pinnedWeekKey:
        snap.pinnedWeekKey &&
        typeof snap.pinnedWeekKey === 'object' &&
        typeof snap.pinnedWeekKey.round === 'number' &&
        typeof snap.pinnedWeekKey.week === 'number'
          ? { round: snap.pinnedWeekKey.round, week: snap.pinnedWeekKey.week }
          : null,
    };
  } catch {
    clearActiveSession();
    return null;
  }
}

// Put a validated snapshot back into live state. Transient bits (timers,
// expanders) reset; she lands on the exercise she left, not mid-countdown.
function applyActiveSnapshot(snap: ActiveSessionSnapshot): void {
  state.screen = snap.screen;
  state.selectedWorkout = snap.selectedWorkout;
  state.pinnedPlanDateIso = snap.pinnedPlanDateIso;
  state.pinnedWeekKey = snap.pinnedWeekKey;
  state.currentPhase = snap.currentPhase;
  state.currentExerciseIndex = snap.currentExerciseIndex;
  state.currentRound = snap.currentRound;
  state.capacityBefore = snap.capacityBefore;
  state.capacityAfter = snap.capacityAfter;
  state.moodBefore = snap.moodBefore;
  state.moodAfter = snap.moodAfter;
  state.moodBeforeTouched = snap.moodBeforeTouched;
  state.moodAfterTouched = snap.moodAfterTouched;
  state.wallSitSec = snap.wallSitSec;
  state.backPain = snap.backPain;
  state.wristPain = snap.wristPain;
  state.wristPainTouched = snap.wristPainTouched;
  state.backPainBefore = snap.backPainBefore;
  state.backPainBeforeTouched = snap.backPainBeforeTouched;
  state.wristPainBefore = snap.wristPainBefore;
  state.wristPainBeforeTouched = snap.wristPainBeforeTouched;
  state.herStartAt = snap.herStartAt;
  state.herStartConfirmed = snap.herStartConfirmed;
  state.herEndAt = snap.herEndAt;
  state.herEndConfirmed = snap.herEndConfirmed;
  state.breakMinutes = snap.breakMinutes;
  state.herStartEditingOpen = false; // transient UI, never restored open
  state.herEndEditingOpen = false;
  state.stepFeel = snap.stepFeel;
  state.capacityBeforeTouched = snap.capacityBeforeTouched;
  state.capacityAfterTouched = snap.capacityAfterTouched;
  state.backPainTouched = snap.backPainTouched;
  state.word = snap.word;
  state.sessionNote = snap.sessionNote;
  state.voicePlays = snap.voicePlays;
  state.startedAt = snap.startedAt ?? new Date().toISOString();
  state.liteDay = snap.liteDay;
  state.roundBreak = snap.roundBreak;
  state.finishHereLitePrev = snap.finishHereLitePrev;
  state.stoppedEarlyAt = snap.stoppedEarlyAt;
  state.stoppedEarlyLitePrev = snap.stoppedEarlyLitePrev;
  state.heldSecFor = {}; // v48: display-only, not carried across a close
  // v60 fix (Sep 28 2026, checker's should #5): heldSetsFor IS carried now —
  // real completed-set progress, unlike heldSecFor's live display seconds.
  state.heldSetsFor = snap.heldSetsFor;
  state.armFeel = snap.armFeel;
  state.moveFeel = snap.moveFeel;
  state.rideFeel = snap.rideFeel;
  state.armLoad = snap.armLoad;
  state.armLoadMax = snap.armLoadMax;
  state.setsDoneFor = snap.setsDoneFor;
  state.stretchTicks = snap.stretchTicks;
  state.completedSteps = snap.completedSteps;
  state.rideNumbersOpen = snap.rideNumbersOpen; // v51: a close on the screen reopens on it
  ui.stepListOpen = false; // v50 · jump list: never reopen the sheet on resume
  state.backSomethingOpen = false;
  state.wristSomethingOpen = false;
  state.backBeforeSomethingOpen = false;
  state.wristBeforeSomethingOpen = false;
  // Preserve pause accounting across an app close. If she closed while paused,
  // she stays paused on reopen (the closed span counts as paused, so it's
  // subtracted from duration — faithful to "I stepped away").
  state.pausedMs = snap.pausedMs;
  state.pausedAt = snap.pausedAt;
  // Transient — never restore a running timer or open expander.
  state.isResting = false;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  state.wallSitStartedAt = null;
  state.videoExpandedFor = null;
  state.howToOpenFor = null;
  // T1 (Sep 27 2026): an app close mid-post-log, still unconfirmed, resumes
  // the finish-time tick too — same as any other resumed field above.
  if (state.screen === 'post-log' && !state.herEndConfirmed) beginPostLogClockTick();
}

// Rehydrate an in-progress session on load — unless it was left open long
// enough that "resume" would be a lie, in which case home asks instead.
function restoreActiveSession(): boolean {
  const snap = readActiveSnapshot();
  if (!snap) return false;
  const startedMs = snap.startedAt ? new Date(snap.startedAt).getTime() : NaN;
  if (Number.isFinite(startedMs) && Date.now() - startedMs > STALE_SESSION_MS) {
    ui.staleSnapshot = snap;
    return false;
  }
  applyActiveSnapshot(snap);
  return true;
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

function resetState(): void {
  stopTimer();
  clearActiveSession();
  state.screen = 'home';
  // Reset viewed week to current when returning to home from a session.
  ui.viewedWeekOffset = 0;
  // WK2 (Sep 27 2026): a "‹ Week 4" peek never survives past the session she
  // takes next — Home always opens back on the true current week.
  ui.viewingLastClosedWeek = false;
  state.selectedWorkout = null;
  state.pinnedPlanDateIso = null;
  state.pinnedWeekKey = null;
  state.capacityBefore = 5;
  state.capacityAfter = 5;
  state.moodBefore = 5;
  state.moodAfter = 5;
  state.moodBeforeTouched = false;
  state.moodAfterTouched = false;
  state.wallSitSec = 0;
  state.backPain = 0;
  state.wristPain = 0;
  state.wristPainTouched = false;
  state.wristSomethingOpen = false;
  // v51: blank on begin/reset, same as backPain/wristPain above.
  state.backPainBefore = 0;
  state.backPainBeforeTouched = false;
  state.backBeforeSomethingOpen = false;
  state.wristPainBefore = 0;
  state.wristPainBeforeTouched = false;
  state.wristBeforeSomethingOpen = false;
  state.herStartAt = null;
  state.herStartConfirmed = false;
  state.herStartEditingOpen = false;
  state.herEndAt = null;
  state.herEndConfirmed = false;
  state.herEndEditingOpen = false;
  state.breakMinutes = null;
  endPreLogClockTick();
  endPostLogClockTick();
  state.stepFeel = null;
  state.capacityBeforeTouched = false;
  state.capacityAfterTouched = false;
  state.backPainTouched = false;
  state.word = '';
  state.sessionNote = '';
  state.voicePlays = 0;
  state.currentRound = 1;
  state.currentPhase = 'warmup';
  state.currentExerciseIndex = 0;
  state.isResting = false;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  state.startedAt = null;
  state.pausedAt = null;
  state.pausedMs = 0;
  state.liteDay = false;
  state.wallSitStartedAt = null;
  state.videoExpandedFor = null;
  state.howToOpenFor = null;
  state.openSections = {};
  // v48 (Sep 24 2026): round-1 floor, stop-early marker, hold done-faces.
  state.roundBreak = false;
  state.finishHereLitePrev = null;
  state.stoppedEarlyAt = null;
  state.stoppedEarlyLitePrev = null;
  state.heldSecFor = {};
  state.heldSetsFor = {}; // v60
  state.armFeel = {}; // v48 · P5
  state.moveFeel = {}; // v58
  state.rideFeel = null; // v61
  state.armLoad = defaultArmLoad(loadLogs()); // v55: default = last used, else 1 kg
  state.armLoadMax = { ...state.armLoad }; // v55 · fix r1
  state.setsDoneFor = {}; // v54
  state.backSomethingOpen = false;
  state.wristPain = 0;
  state.wristPainTouched = false;
  state.wristSomethingOpen = false;
  state.stepFeel = null; // v49 · engine
  state.stretchTicks = {}; // v48 · P7
  state.completedSteps = {}; // v50 · jump list
  state.rideNumbersOpen = false; // v51
  ui.stepListOpen = false; // v50 · jump list: a closed session closes the sheet too
  stopVoiceNote();
  clearApartmentCardio(); // the cardio lane is a per-session choice
  clearElliptical();
  localStorage.removeItem(WW_RESULT_KEY); // the saved walk's numbers are logged now
  state.historyDetailId = null;
  state.detailReturnTo = null;
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

// v53 (Sep 26 2026) — the history-edit screen's draft (renderHistoryEdit,
// openHistoryEdit, saveHistoryEdit). Transient, module-level, like the cycle
// fields above — the screen is reached by an explicit tap (Edit, on the
// Session she's already looking at), not something an app close needs to
// resume mid-edit. `state.historyDetailId` still says WHICH session; this is
// only what she's typed so far.

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

// ---------- formatting ----------

// ---------- visual layer (group 3) ----------

// ---------- Ship 3: data viz (2026-05-15) ----------
//
// Two inline-SVG additions: wall-sit sparkline on history rows, year-grid
// heatmap on home. No external libraries, no build step changes — just SVG
// strings rendered through the same template path as everything else.
//
// Design rules:
//  - Sparkline: 80×20px, stroke at 1.5px in --accent-progress, last point a
//    filled dot in --accent. Skip render if fewer than 2 wall-sit values
//    exist (a flat line reads broken).
//  - Year grid: 7 rows × N weeks. Cells colored --dot-a/--dot-b/--dot-c by
//    workout letter, empty days have a 1px --border. Sparse data → scope to
//    PROGRAM_START_DATE forward, not a full 52-week back-look.

// 3-per-week target view (replaces the 7-cells-per-week year-grid).
// Allison's words 2026-05-15 15:13 JDT: "i think theres too many sessions"
// + "its 3 a week" + "go back to 3 per week." The year-grid showed 7 cells
// per week which implied a daily target — but she's only doing 3/week. This
// view shows ONE row per week × 3 slot pills, each filled with the workout
// letter she actually did (or empty outline).

// year-grid heatmap retired 2026-05-15 — Allison's call ("its 3 a week").
// Full extracted code at archive/year-grid-2026-05-15/year-grid.archived.ts.

// ---------- renders ----------

// ---------- Ship 4: weekly review (2026-05-15) ----------
//
// A per-week debrief screen, reached from home's week card. The screen respects
// `viewedWeekOffset`; v48 · P6 (Sep 24 2026) moved the ‹ › week arrows here
// from home, so looking back lives on the one screen made for it.
//
// Design rules honored:
//  - No paternalism. No motivational language. The screen reports the week;
//    it doesn't judge it. (`feedback_no_capacity_paternalism.md` + CLAUDE.md
//    agency rule.)
//  - Voice rule: her words appear verbatim, never edited.
//  - All data reads from existing loadLogs(). No new Supabase queries.
//  - D-1 visual tokens only (no new color vars).

// ---------- Ship 5: Progress screen (2026-05-15) ----------
//
// A read-only longitudinal view across her entire history. Reached from home's
// Progress door. The screen reports numbers — it does NOT editorialize.
//
// Design rules honored (CLAUDE.md design rules + memory):
//  - No motivational language. No "you should." No goals beyond the 3/week target.
//  - No paternalism. The system reports state; it never tells.
//  - Voice rule: charts show the data, not Claude's interpretation of it.
//  - Archives untouched. Year-grid + hand-routine archives stay in archive/.
//  - No new external libraries — every chart is hand-built inline SVG.
//  - No new color tokens — only D-1 + cooler-look additions.
//  - v48 · P6 (Sep 24 2026): chart ink is --accent-progress, never the sage
//    that means "the primary action right now" (DECISIONS §5, one sage per screen).

// ----- Per-card render helpers -----

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
  setWalkLineUpdater(updateWalkLiveLine); // walk.ts: the minute tick calls the line updater that stays here (it writes the DOM)
  setRenderer(render); // bus.ts: screens that leave this file ask for a redraw through requestRender()
  setScrollRestoreSink((y) => {
    ui.pendingScrollRestore = y; // bus.ts: ...and for a scroll restore through requestScrollRestore()
  });
  // Resume an in-progress workout if one was left open (Allison 2026-06-06).
  restoreActiveSession();
  render();
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
