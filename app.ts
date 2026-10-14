// app.ts — workout-tracker
// Lead-dev pass 2026-05-15 consolidates: code-correctness fixes (timer rewrite,
// audio unlock, sync hygiene), UX restructure (Done·Next primary, Quit demoted,
// hold-to-skip rest, today's pick, week-dots, history-detail), and visual
// layer (still images + YouTube embeds + collapsible how-to).

import { EXERCISE_VISUALS } from './exercise-visuals.js';
import { EXERCISE_HOWTO, type HowToFrame } from './exercise-howto.js';
import { EXERCISE_DETAIL, muscleDiagram } from './exercise-detail.js';
import { painFromFeel, feelFromPain } from './pain-feel.js';
import { setsPrescribed, holdSetsFace, formatHeldSeconds, workoutHasWallSit } from './hold-sets.js';
import { trainingMinutes, formatWorkoutTime, formatWorkoutMinutesTotal } from './timing.js';
import { rideRate } from './ride.js';
import {
  renderRides,
  renderRidesDoorRow,
  attachRidesHandlers,
  ridesVsDelta,
} from './screens/rides.js';
import {
  excludedUntouchedCount,
  todayCycleStatus,
  periodLogUrgency,
  buildPlainPhaseTable,
  buildPlainMoodPhaseTable,
  buildPlainBackPhaseTable,
  buildPlainWristPhaseTable,
  isComparable,
  cycleSummaryLine,
  PLAIN_PHASE_LABEL,
  PLAIN_PHASE_HEADER_LABEL,
  MOOD_TRACKING_START_DATE,
  type CyclePeriod,
  type CapacitySession,
  type MoodSession,
  type BackSession,
  type WristSession,
  type TodayCycleStatus,
  type PlainPhaseTableRow,
  type CycleMetric,
} from './cycle.js';
import {
  flattenSteps,
  nextUndoneStep,
  reachedCount,
  stepKey as buildStepKey,
  type WorkoutStep,
  type WorkoutSteps,
} from './step-list.js';
import {
  // WK3 (Sep 27 2026): "Move on without it" — wired into movesForWeekModel /
  // renderHome below. Schema-gated (§2.2's week_moves table needs her yes
  // before the migration is applied), but the pure check itself has no
  // schema dependency, so it's safe to read now.
  canMoveOn as weekCanMoveOn,
  COMPLETION_WEEKS_FROM,
  LEGACY_LAST_CLOSED_WEEK_INSTANT,
  type WeekSpan,
  type WeekKey,
  type PendingWeek,
} from './week.js';
import {
  weekHasD,
  weekCountLine,
  weekTargetForD,
  weekWindowFor,
  type DWeekModel,
  type DWeekTarget,
  type DLogLite as WeekDLogLite,
} from './week-d.js';
import {
  steppedMovesForWorkout,
  steppedLineText,
  steppedLineFor,
  moveFeelString,
  isMoveFeelValue,
  canonicalMoveName,
  withOverrideFeel,
  MOVE_FEEL_VALUES,
  type SteppedMove,
} from './move-feel.js';
import { deriveRideAim, lastTimeAtSameAim } from './ride-aim.js';
import {
  PROGRAM,
  EXERCISE_GUIDE,
  SAFETY_LINE,
  PROGRAM_START_DATE,
  ROUNDS,
  getRoundFor,
  getProgramWeekCount,
  diffWorkout,
  planForWeekKey,
  noPlanLine,
  injectMarkerProgramWeek,
  replaceCalendarMarks,
  appendRounds,
  weekPlanTitle,
  programWeekPlan,
  programFutureWeekPlans,
  programFutureWeekPlansAfter,
  programPastWeekPlans,
  programPastWeekPlansBefore,
  type WorkoutId,
  type AnyWorkoutId,
  type Exercise,
  type Workout,
  type Phase,
  type WeekPlan,
  type CalendarMarks,
} from './program.js';
import type { LogEntry, StoredWeekMove, WalkEntry, StoredCyclePeriod } from './types.js';
import {
  type AppScreen,
  type ArmFeel,
  type ArmFeelState,
  type MoveFeelState,
  type ArmLoad,
  type ArmLoadState,
  type ActiveSessionSnapshot,
  STORAGE_KEY,
  HOWTO_SEEN_KEY_PREFIX,
  ACTIVE_SESSION_KEY,
  WALK_ACTIVE_KEY,
  LEGACY_WALK_COUNTER_KEYS,
  WW_START_KEY,
  WW_RESULT_KEY,
  WW_APARTMENT_KEY,
  WW_ELLIPTICAL_KEY,
  WW_ELLIPTICAL_LEVEL_KEY,
  WW_ELLIPTICAL_KM_KEY,
  WW_ELLIPTICAL_PULSE_KEY,
  WW_ELLIPTICAL_TIME_KEY,
  WW_ELLIPTICAL_KCAL_KEY,
  WW_LANE_STARTED_KEY,
  WW_LANE_DONE_MIN_KEY,
  LAST_DONE_KEY,
  PACE_RULE_SEEN_KEY,
  SETTING_KEYS,
  setSetting,
  getRestSec,
  getPreCountSec,
  getBeepsEnabled,
  getHowToFirstExpand,
  state,
  isValidLogEntry,
  loadLogs,
  writeLogs,
  loadWeekMoves,
  writeWeekMoves,
  getChronologicalLogs,
  weekClockInput,
  loadWalks,
  writeWalks,
  loadCyclePeriods,
  writeCyclePeriods,
} from './state.js';
import { escapeHtml, formatMmSs, formatMonthDay, SHORT_MONTHS } from './format.js';
import {
  splitNotes,
  sessionCardio,
  ellipticalRideRecords,
  type SessionCardio,
} from './cardio-notes.js';
import { formatDate, formatWeekdayDate, localIsoDate } from './dates.js';
import { setRenderer, setScrollRestoreSink } from './bus.js';
import { bindClick } from './dom.js';
import {
  syncDisabled,
  sessionPayload,
  legacySessionPayload,
  timingStrippedSessionPayload,
  pushSessionTiered,
  pushLogToSupabase,
  patchSessionRequest,
  patchMatchedARow,
  patchLogToSupabase,
  pullFromSupabase,
  mergeRemoteSessions,
  TIMING_LAUNCH_LABEL,
} from './sync.js';
import { pushWalk, flushPendingWalks, fetchFitSteps } from './sync-movement.js';
import {
  pullCyclePeriodsFromSupabase,
  pushCyclePeriod,
  deleteCyclePeriod,
  cyclePeriodPayload,
} from './sync-cycle.js';
import {
  weekMoveKey,
  mergeWeekMoves,
  pullWeekMovesFromSupabase,
  weekMovePayload,
  pushWeekMove,
  deleteWeekMove,
} from './sync-week-moves.js';
import * as pw from './program-week.js';
import {
  setWorkoutDProvider,
  getProgramWeek,
  getTodaysPick,
  saturdayForOffset,
  homeWeekOffset,
  preLaunchPlanDate,
  planKeyForLog,
  planForLog,
  getViewedProgramWeek,
  isNowAfterCompletionLaunch,
  weekModel,
  shownWeek,
  gapCountsBackToWeekKey,
  gapCountsBackToWeekNum,
  weekSubLabel,
  currentHowToWeekKey,
} from './week-clock.js';
import {
  SESSIONS_PER_WEEK_TARGET,
  calendarSaturdayMs,
  attributeSessionsToWeeks,
  sessionsAttributedTo,
} from './program-week.js';

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
// Same bar at Done: a computed duration longer than this is a session that sat
// open, not a workout length. Blank it and say so in notes rather than log it.
const MAX_PLAUSIBLE_DURATION_SEC = 3 * 60 * 60;
// Ship 6: timing defaults — overridable via Settings screen. The constants
// remain as "defaults" only; runtime values come from getSetting().
// Allison 2026-05-15 18:07: "i do not need the brakes anymore there doesn't
// need the brakes in between exercises." Default rest is now 0 (skip).
// Range allows 0-180 in Settings — bump back up if she ever wants it.
// (DEFAULT_REST_SEC and DEFAULT_PRE_COUNT_SEC now live in state.ts, with the settings getters.)
const COUNT_BEEP_FROM_SEC = 3;
const HOLD_TO_SKIP_MS = 500;
const HOLD_TO_CLEAR_MS = 500;

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
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
const APP_VERSION = __APP_VERSION__;
const BUILD_DATE = __BUILD_DATE__;

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Thin wrappers over program.ts's pure resolvers. With NO date they answer for
// "now": program-week.ts's currentWeekPlan() - post-launch the completion
// model's week KEY resolves straight to its PROGRAM row (v62, step 5c; no
// synthetic calendar date), pre-launch the original calendar + swing lookup.
// With a date they are the plain calendar scan (history, pinned pre-launch
// sessions). Every call site stays untouched and tests can still mock the
// system clock.
function getWeekPlan(date?: Date): WeekPlan {
  return date ? programWeekPlan(date) : pw.currentWeekPlan(weekClockInput());
}

function getWorkoutById(id: WorkoutId, date?: Date): Workout {
  return getWeekPlan(date).workouts[id];
}

function getFutureWeekPlans(date?: Date): WeekPlan[] {
  return date ? programFutureWeekPlans(date) : programFutureWeekPlansAfter(getWeekPlan());
}

function getPastWeekPlans(date?: Date): WeekPlan[] {
  return date ? programPastWeekPlans(date) : programPastWeekPlansBefore(getWeekPlan());
}

// v54 (Sep 27 2026) — Workout D: "Cardio · 30 min elliptical". Her Sep 27
// NotebookLM reflection: "I definitely don't do enough cardio... maybe what I
// could add is 30 minutes on the elliptical separately... we definitely need
// a 4th element a week... call it Workout D... ideally not the same day as
// another workout, but it can also be if it needs to be." Fixed, not week-
// programmed — it never bumps, never appears in PROGRAM/WeekPlan, and is
// available any day (including a day with A/B/C already done — she was
// explicit it's allowed on the same day, just not the ideal). ONE step: the
// elliptical itself, straight in (no "Outdoor walk" lane picker — D IS the
// ride, so beginExercisesForWorkoutD below forces chooseElliptical(30)
// directly, same as if she'd tapped ▶ Elliptical). No warmup list beyond the
// ride's own note ("First two minutes easy...", ellipticalStep's built-in
// line — her "short warm-up line"), no strength main block, no cool-down
// list (empty cooldown; advanceExercise's cooldown-skip below sends her
// straight to post-log once the ride's done).
function getWorkoutD(): Workout {
  return {
    id: 'D',
    name: 'Cardio · 30 min elliptical',
    description: 'Steady elliptical, talk-test level 3-5 — extra, on top of A/B/C.',
    warmup: [ellipticalStep(30)],
    main: [],
    cooldown: [],
    rounds: 1,
  };
}

// v58 (Sep 28 2026) — the moves that STEPPED this week for `id`, computed the
// exact same way diffWorkout above already diffs a week against its own
// predecessor in PROGRAM (renderComingNextWeek/renderPastWeeks' own pattern:
// `PROGRAM.indexOf` + `PROGRAM[idx - 1]`) — never a second, competing notion
// of "last week's plan". `id === 'D'` never steps (D isn't in PROGRAM's A/B/C
// rotation at all — see AnyWorkoutId's own comment); the very first encoded
// week (idx 0) has no predecessor, so every one of its moves reads as new —
// same as diffWorkout's own `!prev` branch. Curl/row (ARM_FEEL_STEPS' two
// names) are always excluded — they keep arm_feel, never migrated (her spec
// item 1).
//
// v58 fix pass (Sep 28 2026, checker's must): this used to call
// `getWeekPlan()` (which then went through a made-up calendar date; since v62
// it finds the row by week key) — and diff it against
// `PROGRAM[idx-1]` unconditionally. On a REPEAT week (planForWeekKey's own
// `repeatsWeek` fallback — "same moves as Week N", no new PROGRAM row yet)
// that lands on the SAME row as the week it repeats, so the diff compared
// that row against the week BEFORE the one it repeats and found stepped
// moves that already stepped last week, not this one (repro: Week 5 steps
// the ride 10->12; Week 6 repeats Week 5 with no new row; opening Workout A
// in Week 6 still said "Stepped this week: ride 12 min"). It also ignored
// state.pinnedWeekKey, so a session pinned to one week (startWorkout) could
// ask about a DIFFERENT week's moves if "now" crossed the Sat/Sun boundary
// before she finished. Fixed by resolving the SAME key getCurrentWorkout
// uses (pinnedWeekKey -> pinnedPlanDateIso -> the live completion-model key
// -> the pre-launch calendar scan) and returning [] outright on a repeat
// week — there is nothing to diff, and diffing against the wrong
// predecessor is worse than showing nothing.
function steppedMovesForWorkoutId(id: AnyWorkoutId | null): SteppedMove[] {
  if (!id || id === 'D') return [];
  const excludeNames = new Set(Object.keys(ARM_FEEL_STEPS));
  let current: WeekPlan;
  if (state.pinnedWeekKey) {
    const { plan, repeatsWeek } = planForWeekKey(state.pinnedWeekKey);
    if (repeatsWeek !== null) return [];
    current = plan;
  } else if (state.pinnedPlanDateIso) {
    // Pre-launch pin — same calendar-date lookup getCurrentWorkout's own
    // pinnedPlanDateIso branch uses; PROGRAM has no "repeat" concept there.
    current = getWeekPlan(new Date(state.pinnedPlanDateIso));
  } else if (isNowAfterCompletionLaunch()) {
    const key = gapCountsBackToWeekKey() ?? shownWeek().key;
    const { plan, repeatsWeek } = planForWeekKey(key);
    if (repeatsWeek !== null) return [];
    current = plan;
  } else {
    current = getWeekPlan();
  }
  const idx = PROGRAM.indexOf(current);
  const prev = idx > 0 ? PROGRAM[idx - 1] : undefined;
  return steppedMovesForWorkout(prev?.workouts[id], current.workouts[id], excludeNames);
}

// The live session's own stepped-moves list — the one call site every render
// (the chip, the pre-log line) reads, so they can never quietly disagree
// about which moves stepped tonight.
function currentSteppedMoves(): SteppedMove[] {
  return steppedMovesForWorkoutId(state.selectedWorkout);
}

// HAND_ROUTINES retired 2026-05-15 — see archive/hand-routine-2026-05-15/.

// v50 · jump list (Sep 25 2026): whether the "List" sheet is open. Transient
// UI, not session progress — deliberately NOT on AppState/the resume
// snapshot, the same way the quit-confirm panel isn't: a reload should land
// her back on the step she was on, sheet closed, not reopen a sheet she'd
// already dismissed.
let stepListOpen = false;

// v53 (Sep 26 2026): whether the running-timer pip's Pause/Stop sheet is
// open. Same reasoning as stepListOpen above — transient UI, not session
// progress, so it's deliberately outside AppState/the resume snapshot; a
// reload lands her back on the step with the sheet closed. stopTimer() (every
// path that ends a running timer — Stop, Back, advancing, quitting) resets it,
// so it can never outlive the timer it belongs to.
let timerPipOpen = false;

// v60 (Sep 28 2026): whether the timed hold about to run/running is a REDO of
// the last completed SET, not a fresh next one — same transient-UI reasoning
// as stepListOpen/timerPipOpen above (not session progress, not persisted).
// Only read by recordHeldSet, and only matters for a multi-set hold
// (hold-sets.ts setsPrescribed > 1); a single-set hold's Redo still goes
// through the untouched recordHeld/heldSecFor path.
let holdRedoInProgress = false;

// ---------- audio ----------

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// Group 1C: must be called synchronously from a user-gesture handler. The Web
// Audio autoplay policy will leave the context suspended until a real click
// resumes it. Calling this from inside a setInterval/rAF callback is too late.
function unlockAudio(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

function playBeep(frequency: number, durationMs: number): void {
  // Ship 6: beeps toggle. When off, skip silently — timer logic still runs.
  if (!getBeepsEnabled()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

function playCountBeep(): void {
  playBeep(520, 120);
}

function playGoBeep(): void {
  playBeep(880, 200);
}

function playFinishBeep(): void {
  playBeep(660, 180);
  setTimeout(() => playBeep(880, 350), 180);
}

// ---------- timer (clock-anchored, group 1B) ----------
//
// Why this design (audit §3): the previous setInterval-based countdown was
// throttled when the phone screen slept (iOS Safari pauses background
// intervals entirely), so a 25-sec wall-sit would freeze and never finish.
// Pre-countdown had its own closure-local interval, leaking a "ghost timer"
// on Quit. This replaces all of that with a single rAF loop reading the
// wall-clock — endsAt is captured once, every frame computes
// `endsAt - Date.now()`. Survives sleep/wake; pause is trivial.

type TimerKind = 'pre-countdown' | 'rest' | 'timed-exercise';

type TimerHandle = {
  kind: TimerKind;
  endsAt: number;
  onComplete: () => void;
  lastSecRendered: number;
};

let activeTimer: TimerHandle | null = null;
let rafHandle: number | null = null;

// v46: keep the screen awake through a long timed block (the 10-25 min
// elliptical / apartment rides). Only walks held a wake lock; on a ride the
// Pixel slept, the timer loop stopped with it, and no 3-2-1 or finish chime
// played until she woke the phone (UX audit Sep 24; her Jul-4 walk rule was
// "it should make the screen stay open"). Reuses the walk's lock; released when
// the timer ends or stops — unless a walk still needs it.
const TIMER_WAKE_LOCK_MIN_SEC = 60;
let timerHoldsWakeLock = false;

function releaseTimerWakeLock(): void {
  if (!timerHoldsWakeLock) return;
  timerHoldsWakeLock = false;
  if (activeWalkStart() !== null || workoutWalkStart() !== null) return; // a walk still holds it
  if (walkWakeLock) {
    void walkWakeLock.release().catch(() => undefined);
    walkWakeLock = null;
  }
}

function stopTimer(): void {
  if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafHandle);
  }
  rafHandle = null;
  activeTimer = null;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  releaseTimerWakeLock();
  timerPipOpen = false; // v53: the pip's sheet never outlives the timer it belongs to
}

function startTimerCore(kind: TimerKind, seconds: number, onComplete: () => void): void {
  stopTimer();
  activeTimer = {
    kind,
    endsAt: Date.now() + seconds * 1000,
    onComplete,
    lastSecRendered: seconds + 1, // force first render
  };
  if (kind === 'pre-countdown') {
    state.preCountdown = seconds;
  } else {
    state.timerSeconds = seconds;
  }
  if (kind === 'timed-exercise' && seconds >= TIMER_WAKE_LOCK_MIN_SEC) {
    timerHoldsWakeLock = true;
    void acquireWalkWakeLock(); // guarded inside: no-op without navigator.wakeLock
  }
  render();
  timerLoop();
}

function timerLoop(): void {
  if (!activeTimer) return;
  // Paused: freeze the countdown. `togglePause` shifts `endsAt` forward by the
  // paused span on resume and re-enters the loop, so no ticks are lost. This
  // guard also makes the visibilitychange re-entry safe while paused.
  if (state.pausedAt !== null) return;
  const remainMs = activeTimer.endsAt - Date.now();
  const remainSec = Math.max(0, Math.ceil(remainMs / 1000));

  if (remainSec !== activeTimer.lastSecRendered) {
    activeTimer.lastSecRendered = remainSec;
    if (activeTimer.kind === 'pre-countdown') {
      state.preCountdown = remainSec;
    } else {
      state.timerSeconds = remainSec;
    }
    // Count beeps at the last COUNT_BEEP_FROM_SEC seconds (audit T6 fix:
    // only the count beep, not finish beep, fires on the way down).
    if (remainSec > 0 && remainSec <= COUNT_BEEP_FROM_SEC) {
      playCountBeep();
    }
    render();
  }

  if (remainMs <= 0) {
    const t = activeTimer;
    activeTimer = null;
    rafHandle = null;
    releaseTimerWakeLock();
    if (t.kind === 'pre-countdown') {
      playGoBeep();
    } else {
      playFinishBeep();
    }
    t.onComplete();
    return;
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    rafHandle = requestAnimationFrame(timerLoop);
  } else {
    // Fallback for environments without rAF (e.g. some test runners): poll @100ms.
    rafHandle = window.setTimeout(timerLoop, 100) as unknown as number;
  }
}

function startRestTimer(): void {
  // Ship 6: rest duration is user-configurable via Settings.
  // 2026-05-15 18:07 update: 0 means skip rest entirely — go straight to
  // the next exercise. Allison's call: "i do not need the brakes anymore."
  const rest = getRestSec();
  if (rest <= 0) {
    state.isResting = false;
    render();
    return;
  }
  state.isResting = true;
  startTimerCore('rest', rest, () => {
    state.isResting = false;
    render();
  });
}

function skipRest(): void {
  stopTimer();
  state.isResting = false;
  state.timerSeconds = 0; // Group 1A: ensure no stale value blocks next "Start timer"
  render();
}

function startPreCountdown(then: () => void): void {
  // Ship 6: pre-countdown duration is user-configurable. If set to 0, skip
  // the countdown entirely and proceed directly to the next phase.
  const pre = getPreCountSec();
  if (pre <= 0) {
    state.preCountdown = 0;
    then();
    return;
  }
  startTimerCore('pre-countdown', pre, () => {
    state.preCountdown = 0;
    then();
  });
}

// ---------- pause (Allison Jul 7 2026) ----------
// Toggle the workout between running and paused. Pausing accumulates real
// elapsed time into `state.pausedMs` (subtracted from the logged duration at
// save) and freezes any running countdown + wall-sit hold by shifting their
// clock-anchors forward by the paused span on resume — so a 3-minute dish
// break neither inflates the workout time nor burns a rest/hold timer.
function togglePause(): void {
  if (state.pausedAt === null) {
    // → pause
    state.pausedAt = Date.now();
    if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafHandle);
    }
    rafHandle = null;
    render();
    return;
  }
  // → resume
  const pausedFor = Date.now() - state.pausedAt;
  state.pausedMs += pausedFor;
  state.pausedAt = null;
  if (activeTimer) activeTimer.endsAt += pausedFor; // don't burn the frozen countdown
  if (state.wallSitStartedAt !== null) state.wallSitStartedAt += pausedFor; // keep held-sec honest
  render();
  if (activeTimer) timerLoop();
}

// Total paused milliseconds so far, including an in-progress pause. Used at save
// to subtract step-away time from the workout's wall-clock duration.
function totalPausedMs(): number {
  return state.pausedMs + (state.pausedAt !== null ? Date.now() - state.pausedAt : 0);
}

// Recompute on tab visibility — if the user backgrounded the app the rAF
// loop pauses and the timer would freeze. On return we fast-forward.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeTimer) {
      // v45: cancel the pending frame first, or every background/foreground
      // cycle added one more parallel loop until the timer ended.
      if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafHandle);
      }
      rafHandle = null;
      timerLoop();
    }
    // Wake lock auto-releases when the app is backgrounded; if a walk is
    // still running when she comes back, grab it again so the screen stays
    // on for the rest of the walk (her Jul-4 call). v46: same for a long
    // timed block still counting down.
    if (
      document.visibilityState === 'visible' &&
      (activeWalkStart() || (activeTimer !== null && timerHoldsWakeLock))
    ) {
      void acquireWalkWakeLock();
    }
  });
}

// ---------- persistence ----------

function saveLog(entry: LogEntry): LogEntry {
  const stored: LogEntry = { ...entry, id: entry.id ?? genId(), synced: false };
  const logs = loadLogs();
  logs.unshift(stored);
  // Newest-first by DATE, not by save order — an after-the-fact log (v32) is
  // dated the day it was started, which may be older than rows already here.
  logs.sort((a, b) => b.date.localeCompare(a.date));
  writeLogs(logs);
  return stored;
}

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
type WorkoutWalkResult = {
  minutes: number;
  // The walk's clock window (epoch ms), so we can ask Google Fit how many steps
  // fell inside it — the accurate count, even if the screen was off (v16, Jul 9).
  startMs?: number;
  endMs?: number;
};

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

// v59 (Sep 28 2026), CHECK-v58 round 2 nice #R2-N2: the walk-outside lane's
// Easy/Right/Hard chip (renderMoveFeel via the Outdoor-walk branch below)
// used to show the instant she tapped ▶ Walk outside — "Walking · 0 min ·
// how did it feel?" — before she'd walked at all. Gated on real elapsed time
// instead: no opinion to ask about yet under 3 min.
const WALK_FEEL_GATE_MS = 3 * 60_000;
function walkFeelReady(start: number | null): boolean {
  return start !== null && Date.now() - start >= WALK_FEEL_GATE_MS;
}

let walkWakeLock: { release: () => Promise<void> } | null = null;
let walkTickId: number | null = null;

// T1 (Sep 27 2026): the pre-log/post-log "is this the time?" minute ticks —
// see beginPreLogClockTick/beginPostLogClockTick below, same shape as
// walkTickId just above.
let preLogTickId: number | null = null;
let postLogTickId: number | null = null;

function clearLegacyWalkCounters(): void {
  for (const k of LEGACY_WALK_COUNTER_KEYS) localStorage.removeItem(k);
}

function activeWalkStart(): number | null {
  const raw = localStorage.getItem(WALK_ACTIVE_KEY);
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

// v48 · P3: the one live line, minutes only — "Walking · 12 min".
function walkLiveText(start: number | null): string {
  const mins = start ? Math.max(0, Math.floor((Date.now() - start) / 60000)) : 0;
  return `Walking · ${mins} min`;
}

async function acquireWalkWakeLock(): Promise<void> {
  // Her call (Jul 4): the screen SHOULD stay on during a walk (v48: so the
  // minute tick keeps running; the sensors are archived). try/catch: headless tests and
  // older browsers have no wakeLock.
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && document.visibilityState === 'visible') {
      walkWakeLock = await nav.wakeLock.request('screen');
    }
  } catch {
    walkWakeLock = null;
  }
}

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

// v48 · P3: the wake lock + the minute tick. No GPS watch, no devicemotion
// listener any more (archive/walk-sensors-2026-09-24/).
function beginWalkTracking(): void {
  void acquireWalkWakeLock();
  if (walkTickId === null) {
    walkTickId = window.setInterval(updateWalkLiveLine, 30000);
  }
}

function endWalkTracking(): void {
  if (walkTickId !== null) {
    window.clearInterval(walkTickId);
    walkTickId = null;
  }
  if (walkWakeLock) {
    void walkWakeLock.release().catch(() => undefined);
    walkWakeLock = null;
  }
}

// T1 (Sep 27 2026), PLAN-2026-09-26.md §3.1: "the clock is the time the
// pre-log opened, and it updates each minute until she touches it." Same
// shape as updateWalkLiveLine/walkTickId above — a direct textContent patch
// on its own id, never a full render() (a re-render mid-typing elsewhere on
// the screen would be its own kind of bug). A no-op once she's confirmed/
// fixed it (herStartConfirmed) or the element isn't on screen any more.
function updatePreLogClockLine(): void {
  if (state.herStartConfirmed) return;
  const el = document.getElementById('time-start');
  if (!el) return;
  el.textContent = `Starting the workout · ${formatClock(new Date().toISOString())}. Right?`;
}

function beginPreLogClockTick(): void {
  if (preLogTickId === null) {
    preLogTickId = window.setInterval(updatePreLogClockLine, 60_000);
  }
}

function endPreLogClockTick(): void {
  if (preLogTickId !== null) {
    window.clearInterval(preLogTickId);
    preLogTickId = null;
  }
}

// T1 §3.2: the post-log twin — "Finishing · 21:52. Right?" ticks the same way.
function updatePostLogClockLine(): void {
  if (state.herEndConfirmed) return;
  const el = document.getElementById('time-end');
  if (!el) return;
  el.textContent = `Finishing · ${formatClock(new Date().toISOString())}. Right?`;
}

function beginPostLogClockTick(): void {
  if (postLogTickId === null) {
    postLogTickId = window.setInterval(updatePostLogClockLine, 60_000);
  }
}

function endPostLogClockTick(): void {
  if (postLogTickId !== null) {
    window.clearInterval(postLogTickId);
    postLogTickId = null;
  }
}

function startWalk(): void {
  localStorage.setItem(WALK_ACTIVE_KEY, String(Date.now()));
  clearLegacyWalkCounters();
  beginWalkTracking();
}

function finishWalk(): WalkEntry | null {
  const start = activeWalkStart();
  // v45: a second "Done walking" tap (while Fit is answering) found no walk and
  // still logged an empty one. No active walk = nothing to log.
  if (start === null) return null;
  const end = Date.now();
  endWalkTracking();
  localStorage.removeItem(WALK_ACTIVE_KEY);
  // v48 · P3: minutes only — the movement_log row carries no steps or meters
  // (DECISIONS-v48 §4). Today's Fit steps show on home instead (P4).
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return logWalk(minutes, null, null);
}

// Discard an active standalone walk WITHOUT logging it (Allison Jul 9 2026):
// "only log walks where i finish the walk — if i just open [it] to check, [it]
// doesn't count." Tapping "Start a walk" just to look needs a non-logging exit;
// this clears the active state and writes NO entry.
function cancelWalk(): void {
  endWalkTracking();
  localStorage.removeItem(WALK_ACTIVE_KEY);
}

function logWalk(
  minutes: number | null = null,
  meters: number | null = null,
  steps: number | null = null
): WalkEntry {
  const entry: WalkEntry = {
    id: genId(),
    date: new Date().toISOString(),
    minutes,
    meters,
    steps,
    synced: false,
  };
  const walks = loadWalks();
  walks.unshift(entry);
  writeWalks(walks);
  void pushWalk(entry);
  return entry;
}

// In-workout walk tracking (v13 — her actual idea, Jul 4: "each time I go on a
// walk WITHIN each workout it tracks information, saves it"). The 'Outdoor
// walk' step that opens A/B (10 min) and C (25 min) times the walk (v48: minutes
// only), and the minutes save WITH that session. render() drives
// start/stop, so advancing, quitting, and resume-after-close all behave.
let workoutWalk: WorkoutWalkResult | null = null;

function workoutWalkStart(): number | null {
  const raw = localStorage.getItem(WW_START_KEY);
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function harvestWorkoutWalk(): void {
  const start = workoutWalkStart();
  if (start === null) return;
  const end = Date.now();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  // Don't kill the engine if a STANDALONE walk is (somehow) also live.
  if (!activeWalkStart()) endWalkTracking();
  localStorage.removeItem(WW_START_KEY);
  // Keep start/end so logCompleteAndHome can ask Google Fit for the real count.
  workoutWalk = { minutes, startMs: start, endMs: end };
  // v45: persisted too — the walk is the FIRST step, so if the phone drops the
  // app during the strength rounds, the numbers must still be there at Save.
  localStorage.setItem(WW_RESULT_KEY, JSON.stringify(workoutWalk));
}

function storedWorkoutWalk(): WorkoutWalkResult | null {
  try {
    const raw = localStorage.getItem(WW_RESULT_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<WorkoutWalkResult>;
    if (typeof r.minutes !== 'number') return null;
    return {
      minutes: r.minutes,
      ...(typeof r.startMs === 'number' ? { startMs: r.startMs } : {}),
      ...(typeof r.endMs === 'number' ? { endMs: r.endMs } : {}),
    };
  } catch {
    return null;
  }
}

function clearWorkoutWalk(): void {
  workoutWalk = null;
  localStorage.removeItem(WW_RESULT_KEY);
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
    if (walkTickId === null) {
      // First tick after Start, or resumed after an app close — (re)start the
      // wake lock + minute tick; the start stamp is already in localStorage.
      beginWalkTracking();
    }
    updateWalkLiveLine();
  } else if (!onWalkStep && started) {
    harvestWorkoutWalk();
  }
}

// Explicit Start for the in-workout walk (her Jul-9 rule above). Stamps the
// start time, then lights up the wake lock + minute tick.
function startWorkoutWalk(): void {
  if (activeWalkStart() !== null) return; // a standalone walk owns the engine
  localStorage.setItem(WW_START_KEY, String(Date.now()));
  clearLegacyWalkCounters();
  beginWalkTracking();
}

// ---------- Cardio either/or (Allison Sep 7 2026) ----------
// WHAT: the cardio step that opens A/B (10 min) and C (25 min) is now a CHOICE —
// walk outside (the tracked flow, entirely unchanged: GPS + steps + Fit) OR the
// apartment on a plain countdown for the SAME minutes (building stairs in
// intervals, apartment laps, marching in place), with nothing tracked.
// WHY: her ask, verbatim — "also i want cardio i can do in apt or walk like pick
// either or". Weather, dark, chagim, or just not wanting to leave the building
// shouldn't cost her the cardio. Rounds first, reps second, the walk never
// (her Jul-3 escape hatch) — so the minutes stay identical either way.
// HOW: the choice is one localStorage key (same trick as WW_START_KEY, so it
// survives an app close mid-session) and getCurrentExercise() swaps the walk
// step for a timed apartment step while it's set. NO Supabase schema change —
// the minutes land in the existing walk_minutes column and a marker string goes
// into the existing notes column, so the two lanes stay tellable apart later.
const APARTMENT_CARDIO_NAME = 'Apartment cardio';

function apartmentCardioMinutes(): number | null {
  const raw = localStorage.getItem(WW_APARTMENT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Minutes the walk step prescribes — read off its own reps text ("10 min").
function walkStepMinutes(ex: Exercise): number {
  const m = /(\d+)\s*min/.exec(ex.reps ?? '');
  return m?.[1] ? Number(m[1]) : 10;
}

function chooseApartmentCardio(minutes: number): void {
  clearElliptical(); // one lane at a time
  localStorage.setItem(WW_APARTMENT_KEY, String(minutes));
}

function clearApartmentCardio(): void {
  clearLaneProgress();
  localStorage.removeItem(WW_APARTMENT_KEY);
}

function apartmentCardioStep(minutes: number): Exercise {
  return {
    name: APARTMENT_CARDIO_NAME,
    reps: `${minutes} min`,
    notes:
      "Same minutes as the walk, inside — and you don't have to invent it. Start the timer and the strip below runs itself: five moves, two minutes each, cycling until the time is up. Conversational effort the whole way — you should still be able to talk. Rather do the building stairs? Same minutes there works too. Nothing is tracked here; the timer is the whole thing.",
    durationSec: minutes * 60,
    isTimed: true,
  };
}

// ---------- Elliptical lane (Allison Sep 24 2026, v43) ----------
// WHAT: a third lane on the cardio step — the York BX200 elliptical, which
// arrived Thu Sep 24. Same minutes as the walk (10 in A/B, 25 in C) on a
// countdown, and the LEVEL she rode at saves with the session.
// WHY: her words the morning it arrived — "let's start putting the elliptical
// in" → "So no more walk it could be walk or elliptical". The machine was bought
// to make the cardio she already does countable (Sep 19: "its jstu hard to
// measuere"). Minutes + level are the countable part; the console's distance is
// strides × an assumed stride length, so it isn't logged.
// HOW: the apartment-lane trick again — one localStorage key holds the chosen
// minutes (survives an app close mid-session), one holds the level, and
// getCurrentExercise() swaps the walk step for a timed elliptical step. NO
// Supabase change: minutes → walk_minutes, "cardio: elliptical N min · level L"
// → notes. The next session's starting level is read back off that marker in
// the saved logs, not from a separate remembered number.
const ELLIPTICAL_NAME = 'Elliptical';
// York BX200: 24 computerized magnetic levels (Mega Sport spec page, Sep 24).
const ELLIPTICAL_MAX_LEVEL = 24;
// v48 · P3 (Sep 24 2026): the level every ride starts AND ends on — "Start on
// level 3, easy". Also where the after-ride stepper starts when there's no last
// level. (v47 guessed 5 before the ride while the steps said 3 — walk §2.)
const ELLIPTICAL_START_LEVEL = 3;
const ELLIPTICAL_MARKER_RE = /cardio: elliptical \d+ min · level (\d+)/;

function ellipticalMinutes(): number | null {
  const raw = localStorage.getItem(WW_ELLIPTICAL_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function clampEllipticalLevel(n: number): number {
  return Math.max(1, Math.min(ELLIPTICAL_MAX_LEVEL, Math.round(n)));
}

// The level from her most recent elliptical session. v48 (Sep 24 2026): the
// real `ellipticalLevel` column first; older rows (and a v47 ride saved tonight)
// only carry the notes marker, so the regex stays as the fallback.
function lastEllipticalLevel(): number | null {
  const newestFirst = [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date));
  for (const l of newestFirst) {
    if (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) {
      return clampEllipticalLevel(l.ellipticalLevel);
    }
    // v49 · look fix (Sep 25 2026): skip the notes-marker fallback once a row
    // carries cardioLane — same rule as rideLevel() at L8477. A v48+ ride with
    // a null level was left null ON PURPOSE (Decision Q5); guessing it back
    // from old notes text offered her "5 again" for a level she never rode.
    if (l.cardioLane) continue;
    const m = ELLIPTICAL_MARKER_RE.exec(l.notes ?? '');
    if (m?.[1]) return clampEllipticalLevel(Number(m[1]));
  }
  return null;
}

// v48 · P3 (Sep 24 2026): the level she RECORDED after this ride, or null.
// Decision Q5: the level is logged after the ride ("the level you rode at is
// only known after"), and a stepper she never touched is not a reading — null
// saves elliptical_level null, the same rule as the untouched sliders (v46).
function ellipticalLevel(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_LEVEL_KEY));
  return Number.isFinite(n) && n > 0 ? clampEllipticalLevel(n) : null;
}

// One tap on + or −. The first tap starts from her last level (or 3 on a first
// ride) and moves one from there; after that it moves from what's shown.
function stepEllipticalLevel(delta: number): void {
  const from = ellipticalLevel() ?? lastEllipticalLevel() ?? ELLIPTICAL_START_LEVEL;
  setEllipticalLevel(from + delta);
}

function setEllipticalLevel(n: number): void {
  localStorage.setItem(WW_ELLIPTICAL_LEVEL_KEY, String(clampEllipticalLevel(n)));
}

function chooseElliptical(minutes: number): void {
  clearApartmentCardio(); // one lane at a time
  localStorage.setItem(WW_ELLIPTICAL_KEY, String(minutes));
  // v48 · P3: no level pre-set any more — it's recorded on touch, after the ride.
}

// Console readings (v44, Sep 24 2026 — her words: "make it measurable whatever
// you say I'm gonna copy it"). Two numbers copied off the BX200's screen after
// the ride: DISTANCE (same machine, same minutes → more km = fitter; comparable
// against HER OWN rides, not against a walk) and PULSE (read off the fixed grips
// in the last 30 s — says whether the level was really conversational). The
// console's calories are its own estimate from the same inputs, so they're not
// asked for. Blank = not recorded, never a zero.
// v49 (Sep 25 2026): "every time put in" — calories and time off the console,
// alongside distance/level/pulse. Time is seconds (mm:ss typed, or prefilled
// from the app's own timer); calories is the console's own estimate.

function ellipticalKm(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_KM_KEY) ?? '');
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
}

function ellipticalPulse(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_PULSE_KEY) ?? '');
  return Number.isFinite(n) && n >= 30 && n <= 230 ? Math.round(n) : null;
}

// Typed wins; otherwise the app's own clock — by Save the elliptical step has
// always been left once (captureLaneMinutesIfLeaving, on Done · Next), so
// laneDoneMinutes() is the precise honest number, same one "✓ N min done"
// already showed her. Never null just because she didn't retype what the app
// already knows (her ask: "every time put in").
function ellipticalTimeSec(): number | null {
  const typed = parseMmSs(localStorage.getItem(WW_ELLIPTICAL_TIME_KEY) ?? '');
  if (typed !== null) return typed;
  const mins = laneDoneMinutes();
  return mins !== null ? mins * 60 : null;
}

function ellipticalKcal(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_KCAL_KEY) ?? '');
  // v51 (Sep 25 2026) fix: was `n >= 0`, so an untouched field (empty string →
  // Number('') === 0) read back as a real zero instead of null — the one
  // reading on this screen that broke "Skip — no numbers today" leaves every
  // field null (same rule as km/pulse above, and the "Blank = not recorded,
  // never a zero" contract already documented on this block).
  return Number.isFinite(n) && n > 0 && n < 5000 ? Math.round(n * 10) / 10 : null;
}

// "10:02" → 602. Bare 1-2 digits are a plain second count ("45" → 45).
// v49 · look fix (Sep 25 2026): the box opens a numeric phone pad with no ':'
// key, so she types the console's digits with nothing between them — "1002"
// for 10:02, "958" for 9:58. Bare 3-4 digits are read as mm:ss, last two
// digits the seconds (ss ≥ 60 is invalid, not a reading). Anything else
// (empty, garbled) is not a reading — null, same rule as every other field.
function parseMmSs(raw: string): number | null {
  const v = raw.trim();
  if (v === '') return null;
  const mmss = /^(\d{1,3}):([0-5]?\d)$/.exec(v);
  if (mmss?.[1] && mmss[2]) {
    const sec = Number(mmss[1]) * 60 + Number(mmss[2]);
    return sec > 0 && sec < 18000 ? sec : null;
  }
  const bareDigits = /^\d{1,4}$/.exec(v);
  if (bareDigits) {
    if (v.length <= 2) {
      const sec = Number(v);
      return sec > 0 && sec < 18000 ? sec : null;
    }
    const ss = Number(v.slice(-2));
    const mm = Number(v.slice(0, -2));
    if (ss >= 60) return null;
    const sec = mm * 60 + ss;
    return sec > 0 && sec < 18000 ? sec : null;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 18000 ? Math.round(n) : null;
}

// v53 (Sep 26 2026) — the same three console-reading validators as
// ellipticalKm()/ellipticalPulse()/ellipticalKcal() above, but pure (a plain
// string in, never localStorage): the history-edit screen (renderHistoryEdit)
// edits a saved LogEntry's fields directly, not the live in-workout keys those
// three read. Same rule as every reading in this app: blank or out-of-range
// is not a value — null, never a guess or a zero.
function parseKmReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
}

function parsePulseReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 30 && n <= 230 ? Math.round(n) : null;
}

function parseKcalReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 5000 ? Math.round(n * 10) / 10 : null;
}

// Saved on every keystroke so the value survives a re-render or an app close.
function setEllipticalReading(key: string, raw: string): void {
  const v = raw.trim().replace(',', '.');
  if (v === '') localStorage.removeItem(key);
  else localStorage.setItem(key, v);
}

// v45 — minutes actually done on an indoor lane (elliptical / apartment). Set
// when she leaves the step after running its timer: the timer's elapsed time,
// or the full block if it ran out. Never started the timer → nothing stored,
// and the prescription stands (she may have used the machine's own clock).

function isIndoorLane(name: string): boolean {
  return name === ELLIPTICAL_NAME || name === APARTMENT_CARDIO_NAME;
}

function captureLaneMinutesIfLeaving(): void {
  const ex = getCurrentExercise();
  if (!ex || !isIndoorLane(ex.name) || !ex.durationSec) return;
  if (localStorage.getItem(WW_LANE_STARTED_KEY) === null) return;
  // v48 · P3 (Sep 24 2026): a ride she STOPPED already holds its real minutes —
  // with the timer idle, the "0 left" arithmetic below would overwrite them
  // with the full block. Only a live timer (or nothing stored yet) is measured.
  const t = activeTimer;
  const running = t !== null && t.kind === 'timed-exercise';
  if (!running && laneDoneMinutes() !== null) return;
  // Live: read the clock itself, not the last rendered second (a tap can land
  // before the next frame). Idle: 0 left once it ran out.
  // Paused: the countdown is frozen at the rendered second.
  const leftSec =
    running && state.pausedAt === null
      ? Math.max(0, (t.endsAt - Date.now()) / 1000)
      : state.timerSeconds;
  const doneSec = Math.max(0, ex.durationSec - leftSec);
  localStorage.setItem(WW_LANE_DONE_MIN_KEY, String(Math.max(1, Math.round(doneSec / 60))));
}

// v48 · P3: the quiet Stop on a running ride (elliptical / apartment) — the
// minutes she actually did are kept, and the after-ride face shows them.
function stopLaneTimer(): void {
  captureLaneMinutesIfLeaving();
  stopTimer();
  render();
}

// v51 (Sep 25 2026) — her words: "I click the next button and then I fill in
// information. That's how simple it is." Done · Next on the elliptical step
// used to advance straight past the after-ride readings card, which only
// showed once she'd already stopped/finished — she tapped Done · Next mid- or
// post-ride and never saw it ("it didn't show up for me... I don't know what
// I was supposed to see or where"). Now the tap opens this screen instead, in
// ANY ride state: a live timer is stopped and its real minutes kept first,
// same as the quiet Stop (stopLaneTimer above) — nothing is lost either way.
function openRideNumbers(): void {
  captureLaneMinutesIfLeaving();
  stopTimer();
  state.rideNumbersOpen = true;
  render();
}

// v48 · P3 (Sep 24 2026) — decision Q7: the generic how-to card on the
// elliptical said the same ride three times (~240 words). A live line,
// derived from the countdown, used to run this ("easy for 2 min, raise the
// level..."). v61 (Sep 28 2026), spec item e: the elliptical has no app
// timer/countdown any more (her words — she uses the bike's own timer), so
// there's no countdown left for a live cue to derive from; removed rather
// than left dead (RidePhase/ridePhase/RIDE_LINE/cueRidePhase, and its one
// call site in the tick loop below).
function laneDoneMinutes(): number | null {
  const n = Number(localStorage.getItem(WW_LANE_DONE_MIN_KEY) ?? '');
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function clearLaneProgress(): void {
  localStorage.removeItem(WW_LANE_STARTED_KEY);
  localStorage.removeItem(WW_LANE_DONE_MIN_KEY);
}

function clearElliptical(): void {
  clearLaneProgress();
  localStorage.removeItem(WW_ELLIPTICAL_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_LEVEL_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_KM_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_PULSE_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_TIME_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_KCAL_KEY);
}

function ellipticalStep(minutes: number): Exercise {
  return {
    name: ELLIPTICAL_NAME,
    reps: `${minutes} min`,
    notes:
      'First two minutes easy. Then raise the level until you can still talk in full sentences, and stay there. Ease off for the last minute.',
    durationSec: minutes * 60,
    isTimed: true,
  };
}

// ---------- The guided indoor strip (Allison Sep 7 2026, v30) ----------
// WHAT CHANGED from v29: the apartment lane was a countdown plus a written menu
// ("pick one: stairs, laps, or marching") — i.e. a timer and a DECISION, which
// is not an equivalent to a 10-minute walk. Her words the same day: "Also did
// you make alternative to outdoor walk / Because I often don't want to go
// outside" → "Something similar with a similar amount of like movement warm up
// cardio". So the step now RUNS a routine instead of describing one.
// CONSTRAINTS these five satisfy on purpose: nothing jumps and nothing has a
// flight phase (apartment building, neighbours below, and impact is out with
// her back baseline), no hands on the floor, nothing to grip, and the effort
// stays conversational start to finish — it's a warm-up, not a session.
// SHAPE: this is still ONE exercise in the phase array. The segments are a
// DISPLAY derived from the existing countdown — never extra steps, no index
// arithmetic, nothing for the engine to know about.
type CardioSegment = { name: string; cue: string };

const APARTMENT_SEGMENT_SEC = 120;

const APARTMENT_CARDIO_SEGMENTS: readonly CardioSegment[] = [
  { name: 'Easy marching in place', cue: 'Loose arms swinging. Just get moving.' },
  {
    name: 'Step touch, side to side',
    cue: 'Step out, tap the other foot in, reach the arms as you go.',
  },
  { name: 'Knee lifts', cue: 'March taller. Bring the opposite hand toward the knee.' },
  { name: 'Heel kicks back', cue: 'Light and quiet, one foot always on the floor.' },
  { name: 'Marching, a bit quicker', cue: 'Finish warm, still able to talk.' },
];

// Which segment is live, read off the countdown alone — so it advances by
// itself as the timer runs and she never has to work out "which two minutes am
// I in". Cycles: 10 min = one pass of the five; 25 min keeps going round and
// ends mid-list; a Lite/odd duration works the same way. Elapsed is clamped one
// second short of the end so the last tick can't flip the strip back to segment
// one as the timer lands on 0:00.
function apartmentSegmentIndex(totalSec: number, remainingSec: number): number {
  const n = APARTMENT_CARDIO_SEGMENTS.length;
  if (totalSec <= 0 || n === 0) return 0;
  const remain = Math.max(0, Math.min(totalSec, remainingSec));
  const elapsed = Math.min(totalSec - remain, Math.max(0, totalSec - 1));
  return Math.floor(elapsed / APARTMENT_SEGMENT_SEC) % n;
}

// Seconds left in the CURRENT segment — capped by what's left overall, so a
// part-segment at the end of an odd block counts down honestly.
function apartmentSegmentRemainingSec(totalSec: number, remainingSec: number): number {
  if (totalSec <= 0) return 0;
  const remain = Math.max(0, Math.min(totalSec, remainingSec));
  const intoSegment = (totalSec - remain) % APARTMENT_SEGMENT_SEC;
  return Math.max(0, Math.min(APARTMENT_SEGMENT_SEC - intoSegment, remain));
}

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.6 "Small ones": before the launch,
// unchanged (the calendar Sat-Fri week). At/after it, since the completion
// model's own week start — the OPEN span's openedAt, or (no span has closed
// yet, the "shouldn't happen" edge week.ts's own comment names) the launch
// instant itself — never "today's calendar Saturday", which the completion
// model has already replaced for "now" (same reasoning as isNowAfterCompletionLaunch).
//
// v61.1 fix 3 (Oct 2 2026, CHECK-v61.1.md check 2's nice): `since` used to
// be the raw `open.openedAt` — the exact event-to-event window week-d.ts
// replaced everywhere else (see its own header). A walk logged on the
// anchor day BEFORE the session that opens the week (the same class of gap
// week-d.ts exists to close for D) dropped out of "this week" even though
// it falls on the week's own calendar day. Routed through the SAME window
// weekWindowFor/weekTargetForD give every other D/ride/walk attribution.
function walksThisWeek(): number {
  if (!isNowAfterCompletionLaunch()) {
    const weekStart = saturdayForOffset(0).getTime();
    return loadWalks().filter((w) => new Date(w.date).getTime() >= weekStart).length;
  }
  const model = weekModel();
  const { open, spans } = model;
  const target: DWeekTarget | null = open
    ? { kind: 'open' }
    : spans.length
      ? { kind: 'span', key: spans[spans.length - 1]!.key }
      : null;
  const win = target ? weekWindowFor(target, model) : null;
  const since = win ? win.start : new Date(COMPLETION_WEEKS_FROM.at).getTime();
  return loadWalks().filter((w) => new Date(w.date).getTime() >= since).length;
}

// v48 · fix r1 (Sep 24 2026): after "Log what I did", did she get past the wall
// sit? A stop before it (at the hinge, round 1) left an empty "Wall sit (s)"
// asking about a hold she never reached — the post-log hides it then. Reached =
// held something, or stopped on/after its step (phase order warmup → main →
// upperBack → cooldown; any later round of main is past round 1's).
function reachedWallSit(w: Workout): boolean {
  if (state.wallSitSec > 0) return true;
  const order: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  const here = order.indexOf(state.currentPhase);
  for (const p of order) {
    const i = (w[p] ?? []).findIndex((ex) => ex.name === 'Wall sit');
    if (i < 0) continue;
    const at = order.indexOf(p);
    if (here !== at) return here > at;
    if (p === 'main' && state.currentRound > 1) return true;
    return state.currentExerciseIndex > i;
  }
  return false;
}

// v48 · P4 (Sep 24 2026) — today's steps from Google Fit, zero taps (DECISIONS
// §2 #8): one quiet "· 4,210 steps today" on home's walk row. Asked once after
// boot; shown only when Fit answers — when it doesn't, nothing is invented
// (fail-loud: a missing number stays missing, never a 0).
let stepsToday: number | null = null;

async function fetchStepsToday(): Promise<void> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const n = await fetchFitSteps(midnight.getTime(), Date.now());
  if (n === null) return;
  stepsToday = n;
  if (state.screen === 'home') render();
}

// Test hook (automation only — Fit is off under navigator.webdriver).
if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
  (window as unknown as { __wtSetStepsToday?: (n: number | null) => void }).__wtSetStepsToday = (
    n
  ) => {
    stepsToday = n;
    if (state.screen === 'home') render();
  };
}

// ---------- state machine ----------

function getCurrentWorkout(): Workout | null {
  if (!state.selectedWorkout) return null;
  // v54 (Sep 27 2026): D is fixed, not week-programmed — resolve it straight
  // off getWorkoutD() and skip every plan/week lookup below (they're all
  // indexed by the PROGRAM-only WorkoutId, which never has a 'D' key). This
  // return also narrows state.selectedWorkout to WorkoutId for the rest of
  // the function, so every `.workouts[state.selectedWorkout]` index below
  // stays exactly as type-safe as it was before D existed.
  if (state.selectedWorkout === 'D') return getWorkoutD();
  // WK4 (Sep 27 2026): the RESOLVED-key pin (post-launch sessions) wins first
  // — see its own comment on AppState.pinnedWeekKey and startWorkout().
  if (state.pinnedWeekKey) {
    return planForWeekKey(state.pinnedWeekKey).plan.workouts[state.selectedWorkout];
  }
  // WK2 (Sep 27 2026): a pinned date (pre-launch sessions, set at
  // startWorkout()) wins over the live "now" — see the pin's own comment
  // there. Exactly one of pinnedWeekKey/pinnedPlanDateIso is ever set.
  if (state.pinnedPlanDateIso) {
    return getWorkoutById(state.selectedWorkout, new Date(state.pinnedPlanDateIso));
  }
  // WK2 fix r1 (Sep 27 2026, checker's should #7): post-launch and UNPINNED
  // (Home/pre-log, before Start is tapped), resolve straight off the
  // completion model's own week key — the SAME lookup that drives every
  // "Week N" / "same moves as" string she reads (preLogWeekLabel,
  // homeWeekTitle, the post-log line) — instead of round-tripping through a
  // SYNTHETIC calendar date and re-deriving the week from it via a date scan
  // (deleted in v62, step 5c; getWeekPlan() now resolves the same way). That
  // round trip could disagree
  // with planForWeekKey the moment a future PROGRAM row's own `startsOn`
  // lands off the round's 7-day grid — she'd train one week's moves while
  // the screen names a different one, with no repeat line to flag it.
  // A session already IN PROGRESS reads its pinned KEY (above) once WK4's
  // startWorkout sets one — this branch is reached only pre-launch, or for a
  // stale snapshot saved before WK4 (readActiveSnapshot resolves that case).
  // WK2 fix r2 (Sep 27 2026, checker's should #2): during a GAP, shownWeek()
  // .key is the PENDING week — exactly what preLogWeekLabel/weekSubLabel
  // already stopped naming here (gapCountsBackToWeekKey). Reading the raw key
  // instead would preview the PENDING week's content while the text right
  // above it says the save counts toward the closed one — a session that
  // hadn't even reached Start yet would already disagree with its own label.
  if (isNowAfterCompletionLaunch()) {
    const key = gapCountsBackToWeekKey() ?? shownWeek().key;
    return planForWeekKey(key).plan.workouts[state.selectedWorkout];
  }
  return getWorkoutById(state.selectedWorkout);
}

// The step exactly as PROGRAM has it — no substitutions. Use this whenever the
// programmed content is what matters (e.g. reading the walk's prescribed
// minutes after the apartment swap has already happened).
function rawCurrentExercise(): Exercise | null {
  const w = getCurrentWorkout();
  if (!w) return null;
  const list = w[state.currentPhase] ?? [];
  return list[state.currentExerciseIndex] ?? null;
}

function getCurrentExercise(): Exercise | null {
  const ex = rawCurrentExercise();
  // Cardio either/or (Sep 7 2026): while the apartment option is chosen, the
  // walk step IS the apartment timer — same minutes, no tracking.
  // Same swap for the elliptical lane (Sep 24 2026).
  if (ex && ex.name === 'Outdoor walk') {
    const ellMinutes = ellipticalMinutes();
    if (ellMinutes !== null) return ellipticalStep(ellMinutes);
    const minutes = apartmentCardioMinutes();
    if (minutes !== null) return apartmentCardioStep(minutes);
  }
  return ex;
}

// Lite day: one round less than programmed, never below 1 (A/B 3→2, C 2→1).
function effectiveRounds(w: Workout): number {
  return state.liteDay ? Math.max(1, w.rounds - 1) : w.rounds;
}

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

// v48 · P3 (Sep 24 2026): the cardio step's name on screen. The key stays
// 'Outdoor walk' in PROGRAM / DETAIL / HOWTO / VISUALS (and in saved data); she
// sees "Cardio" — her Sep 24 words: "no more walk it could be walk or elliptical".
// v48 · fix r2 (Sep 25 2026): takes the Exercise, so a per-week `label` (the
// Week-4 "Hip hinge") wins everywhere she reads the name — step title, the
// pre-log list, the rest screen's "Next ·" line, the round-break line.
function displayName(ex: Pick<Exercise, 'name' | 'label'>): string {
  if (ex.label) return ex.label;
  return ex.name === 'Outdoor walk' ? 'Cardio' : ex.name;
}

// v48 · P3 — lane memory (DECISIONS §2 #3): the lane of her newest saved
// session. The cardio_lane column first; a v47 row only carries the notes
// marker ("cardio: elliptical …" / "cardio: apartment …").
function lastCardioLane(): LogEntry['cardioLane'] {
  const newest = [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!newest) return null;
  if (newest.cardioLane) return newest.cardioLane;
  const m = /cardio: (elliptical|apartment)\b/.exec(newest.notes ?? '');
  return m?.[1] === 'elliptical' || m?.[1] === 'apartment' ? m[1] : null;
}

function beginExercises(): void {
  // T1 (Sep 27 2026), §3.1 "Untouched at Start": if she never tapped ✓ or ✎,
  // the Start-tap instant becomes her_start_at — her_start_confirmed stays
  // false either way (a guess is never promoted to a confirmed reading just
  // because Start was tapped). Already-confirmed values pass straight
  // through untouched.
  if (!state.herStartConfirmed) {
    state.herStartAt = new Date().toISOString();
  }
  endPreLogClockTick();
  state.screen = 'workout';
  state.currentRound = 1;
  state.currentPhase = 'warmup';
  state.currentExerciseIndex = 0;
  state.isResting = false;
  state.startedAt = new Date().toISOString();
  state.pausedAt = null; // fresh session, no paused time carried in
  state.pausedMs = 0;
  state.voicePlays = 0; // v48: plays are counted per session
  // v48 (Sep 24 2026): the round-1 floor, the stop-early marker and the hold
  // done-faces all start fresh with the session.
  state.roundBreak = false;
  state.finishHereLitePrev = null;
  state.stoppedEarlyAt = null;
  state.stoppedEarlyLitePrev = null;
  state.heldSecFor = {};
  state.heldSetsFor = {}; // v60: same as heldSecFor — a hold's sets belong to one session
  state.armFeel = {}; // v48 · P5: a feel belongs to one session
  state.moveFeel = {}; // v58: same — a feel belongs to one session
  state.rideFeel = null; // v61: same — the ride feel belongs to one session
  state.armLoad = defaultArmLoad(loadLogs()); // v55: default = last used, else 1 kg
  state.armLoadMax = { ...state.armLoad }; // v55 · fix r1: starts equal, then only climbs
  state.setsDoneFor = {}; // v54: sets-done belongs to one session, same as armFeel
  state.stretchTicks = {}; // v48 · P7: ticks belong to one session
  state.completedSteps = {}; // v50 · jump list: done-marks belong to one session
  state.rideNumbersOpen = false; // v51: the ride-numbers sub-screen belongs to one session
  // v46: the post-log sliders haven't been seen yet (capacity-before was just
  // set on pre-log, so its flag stays as it is).
  state.capacityAfterTouched = false;
  // v50 · mood: same shape — mood-before was just set on pre-log, keep it;
  // mood-after hasn't been seen yet.
  state.moodAfterTouched = false;
  state.backPainTouched = false;
  state.backSomethingOpen = false;
  state.wristPainTouched = false;
  state.wristSomethingOpen = false;
  state.stepFeel = null; // v49 · engine: a feel belongs to one session
  state.howToOpenFor = null;
  state.videoExpandedFor = null;
  clearWorkoutWalk(); // fresh session, fresh walk numbers
  clearApartmentCardio(); // fresh session, cardio lane unchosen again
  clearElliptical();
  // v48 · P3 (Sep 24 2026): open straight on the lane she used last time when
  // it was the elliptical or the apartment — nothing starts until she taps
  // Start, and the "↩ … instead" link is right there. A walk (or no history)
  // gets the choice screen: the walk only starts on her tap as she heads out.
  // v54 (Sep 27 2026): Workout D IS the elliptical — no lane choice at all.
  // Force it straight in, same as tapping ▶ Elliptical herself, so the step
  // renders on the ride face immediately (renderEllipticalStep) instead of
  // the "Outdoor walk" placeholder D's own warmup doesn't carry.
  if (state.selectedWorkout === 'D') {
    chooseElliptical(30);
  } else {
    const cardio = getCurrentWorkout()?.warmup.find((e) => e.name === 'Outdoor walk');
    if (cardio) {
      const lane = lastCardioLane();
      if (lane === 'elliptical') chooseElliptical(walkStepMinutes(cardio));
      else if (lane === 'apartment') chooseApartmentCardio(walkStepMinutes(cardio));
    }
  }
  render();
}

// T1 (Sep 27 2026), §3.2: the one place post-log's own fields get reset —
// every path that ends a session (cool-down's Done · Finish, the quit
// panel's "Log what I did") runs this instead of setting state.screen by
// hand, so the finish-time question and the breaks chip always start fresh.
// No render()/tick here: advanceExercise's own final branch shares ONE
// render() call across several outcomes, so it calls this then falls through
// to that shared render (see its own comment) — enterPostLog() below is for
// every OTHER caller, which owns its render timing outright.
function resetPostLogFields(): void {
  state.screen = 'post-log';
  state.herEndAt = null;
  state.herEndConfirmed = false;
  state.herEndEditingOpen = false;
  state.breakMinutes = null;
}

function enterPostLog(): void {
  resetPostLogFields();
  render();
  beginPostLogClockTick();
}

// v50 · jump list (Sep 25 2026) — step-list.ts's flat, ordered move list needs
// only the warmup/main/upperBack arrays (never cooldown: that's already its
// own one-step checklist screen, see step-list.ts's module doc). Structural
// adapter only — Exercise already satisfies StepExercise's shape.
function toStepWorkout(w: Workout): WorkoutSteps {
  return { warmup: w.warmup, main: w.main, upperBack: w.upperBack };
}

// The key for wherever she's standing right now, in step-list.ts's
// `phase:round:index` shape. Round is meaningless off the main phase, so it's
// pinned to 1 there — the same convention flattenSteps uses.
function currentStepKey(): string {
  const phase = state.currentPhase;
  if (phase === 'cooldown') return 'cooldown:1:0'; // never in the movable list; see below
  const round = phase === 'main' ? state.currentRound : 1;
  return buildStepKey(phase, round, state.currentExerciseIndex);
}

function markStepDone(key: string): void {
  if (state.completedSteps[key]) return; // no-op re-render churn on a repeat
  state.completedSteps = { ...state.completedSteps, [key]: true };
}

function applyStepTarget(step: WorkoutStep): void {
  state.currentPhase = step.phase;
  state.currentRound = step.round;
  state.currentExerciseIndex = step.index;
}

function advanceExercise(): void {
  const w = getCurrentWorkout();
  if (!w) return;

  // Group 1D: if we're leaving a timed wall-sit and the user tapped Done
  // before the timer ran out, capture actual held duration.
  captureWallSitIfPending();
  captureLaneMinutesIfLeaving(); // v45: minutes actually done on the elliptical/apartment
  state.rideNumbersOpen = false; // v51: the ride-numbers sub-screen belongs to one visit

  stopTimer();
  state.isResting = false;
  state.videoExpandedFor = null; // collapse video when moving on

  // Cool-down is one scrollable list (not stepped) — its single "Done · Finish"
  // button ends the session regardless of how many stretches it contains.
  if (state.currentPhase === 'cooldown') {
    enterPostLog();
    return;
  }

  // v50 · jump list — mark what she just finished, then check whether an
  // EARLIER skipped move is waiting before we walk on. Her ask: Done should
  // come back for whatever she jumped past, not plow forward as if it never
  // existed ("I dont always do the workouts in [order]"). We only ever
  // deviate from the plain phase-by-phase walk below when a gap actually
  // exists — `target.key !== structuralNextKey` is false on every ordinary
  // tap, so an untouched List sheet leaves this whole block a no-op and the
  // walk below runs exactly as it always has. The round-1 floor is a
  // deliberate pause, never skipped over just because something else is open.
  const curKey = currentStepKey();
  markStepDone(curKey);
  const movable = flattenSteps(toStepWorkout(w), effectiveRounds(w));
  const curPos = movable.findIndex((s) => s.key === curKey);
  const structuralNextKey = curPos >= 0 ? (movable[curPos + 1]?.key ?? null) : null;
  // v50 · fix (Sep 25 2026): compute target BEFORE deciding the round-1 floor.
  // Her bug — finish the last skipped move and Done marches her forward
  // through every move she already did (the Round 1 done screen even came
  // back) — was this floor firing unconditionally on the last main move of
  // round 1, with no check for whether round 2+ actually still has anything
  // undone.
  const target = nextUndoneStep(movable, curKey, state.completedSteps);
  // v50 · fix 2 (Sep 25 2026): `target !== null` was "anything undone
  // ANYWHERE" (nextUndoneStep wraps the whole list, warm-up included), not
  // "round 2+ still has something undone". Her repro: jump to round 2 first,
  // finish round 2 + upper back, then skip Cardio (warm-up) via the List
  // sheet and walk round 1 last — round 1's last move still found Cardio
  // undone and threw up "Round 1 done ✓ / Start round 2" even though round 2
  // was already done, then landed the tap on an already-✓ move. The floor is
  // about round 2+, so gate it on round 2+ specifically.
  const roundTwoOpen = movable.some(
    (s) => s.phase === 'main' && s.round > 1 && !state.completedSteps[s.key]
  );
  const isRoundOneFloor =
    state.currentPhase === 'main' &&
    state.currentRound === 1 &&
    state.currentExerciseIndex === w.main.length - 1 &&
    effectiveRounds(w) > 1 &&
    roundTwoOpen;
  if (!isRoundOneFloor) {
    if (target && target.key !== structuralNextKey) {
      applyStepTarget(target);
      if (target.phase === 'main') {
        startRestTimer();
      } else {
        render();
      }
      return;
    }
    if (!target) {
      // Nothing undone anywhere — she just finished the last thing that was
      // still open (often the last of a run of previously-skipped moves).
      // Go straight to cool-down instead of the plain in-order walk below,
      // which would re-tour every move she's already ✓.
      // v54 (Sep 27 2026): Workout D has no cool-down list at all (her spec —
      // it's the ride, nothing else) — an empty cooldown screen is nothing
      // to land on, so finish straight into post-log instead, same as the
      // existing empty-upperBack branch below already does for that block.
      if (w.cooldown.length === 0) {
        resetPostLogFields();
      } else {
        state.currentPhase = 'cooldown';
        state.currentExerciseIndex = 0;
      }
      render();
      if (state.screen === 'post-log') beginPostLogClockTick();
      return;
    }
  }

  const list = w[state.currentPhase] ?? [];
  if (state.currentExerciseIndex < list.length - 1) {
    state.currentExerciseIndex += 1;
    if (state.currentPhase === 'main') {
      startRestTimer();
      return;
    }
  } else if (state.currentPhase === 'warmup') {
    state.currentPhase = 'main';
    state.currentExerciseIndex = 0;
  } else if (state.currentPhase === 'main') {
    if (state.currentRound < effectiveRounds(w)) {
      // v48 (Sep 24 2026) — the round-1 floor: after round 1's last move, a
      // "Round 1 done ✓" screen offers "Start round 2" or "Finish here — it
      // still counts". Her weeks are 3/3 or 0 (7 zero weeks); Lite exists but
      // only before she starts, and a bad day shows up mid-session.
      if (state.currentRound === 1) {
        state.roundBreak = true;
        render();
        return;
      }
      state.currentRound += 1;
      state.currentExerciseIndex = 0;
      startRestTimer();
      return;
    } else {
      // Upper-back block (once, straight sets) sits between main and cooldown.
      state.currentPhase = w.upperBack?.length ? 'upperBack' : 'cooldown';
      state.currentExerciseIndex = 0;
    }
  } else if (state.currentPhase === 'upperBack') {
    state.currentPhase = 'cooldown';
    state.currentExerciseIndex = 0;
  } else {
    resetPostLogFields();
  }
  render();
  // T1 (Sep 27 2026): this render() is shared across several outcomes above —
  // only start the finish-time tick when this particular call actually
  // landed on post-log (the `else` branch just above).
  if (state.screen === 'post-log') beginPostLogClockTick();
}

// v53 (Sep 26 2026): "from the timer I need to be able to go back like it
// wasn't able to go back" — Back from a RUNNING ride/hold used to discard the
// minutes/seconds she'd already done (goBack called stopTimer() straight,
// same as the "she's redoing it" wall-sit discard below). That's right for a
// step she hasn't started measuring yet, but wrong once a real timer is
// counting down: leaving mid-ride or mid-hold isn't a redo, so the time she
// already put in is kept exactly the way the quiet Stop keeps it
// (captureLaneMinutesIfLeaving for the elliptical/apartment lane; the same
// held-seconds math stopTimedHold uses, plus captureWallSitIfPending for the
// wall sit's own logged number). Called BEFORE stopTimer() clears the clock.
function captureRunningProgressIfLeaving(): void {
  const ex = getCurrentExercise();
  if (!ex) return;
  if (isIndoorLane(ex.name)) {
    captureLaneMinutesIfLeaving();
    return;
  }
  if (!isHoldStep(ex)) return;
  const t = activeTimer;
  if (t && t.kind === 'timed-exercise' && ex.durationSec) {
    const remainSec = Math.max(0, (t.endsAt - Date.now()) / 1000);
    recordHeld(holdStepKey(), Math.max(0, Math.round(ex.durationSec - remainSec)));
  }
  if (ex.name === 'Wall sit') captureWallSitIfPending();
}

// ---------- Back (Allison Sep 24 2026, v47) ----------
// Her words: "this app needs back button like i can go back an exercise or a
// round" → "i need to be able to go back". One step backwards through the
// same walk advanceExercise takes forwards: within a phase, then across the
// round boundary (Round 2 step 1 → Round 1 last step), then across phases
// (main → warm-up, upper back → main last round, cool-down → the block before
// it). A pending wall-sit capture that never got a real second on the clock
// is still discarded (nothing to keep); a rest is cancelled. v53: a RUNNING
// timer is different — see captureRunningProgressIfLeaving above.
// v53 fix (CHECK M4, Sep 26 2026): step 1 (warm-up, index 0, not resting)
// used to have NO Back at all — R2 Week 4 opens A, B and C all on the ride,
// so "the ride IS step 1" this week and Back vanished on the exact step she
// most wants to leave mid-run ("from the timer I need to be able to go
// back"). The lead's call while she's asleep (undoable): Back from step 1
// goes to the pre-log instead of a step behind it — there is none. See the
// step-1 branch at the top of goBack.
function canGoBack(): boolean {
  return state.screen === 'workout';
}

function goBack(): void {
  const w = getCurrentWorkout();
  if (!w || !canGoBack()) return;
  captureRunningProgressIfLeaving(); // v53: keep the real seconds/minutes — read BEFORE stopTimer() clears the clock
  stopTimer();
  state.wallSitStartedAt = null;
  state.videoExpandedFor = null;
  state.rideNumbersOpen = false; // v51: leaving the elliptical step by any route closes it
  // v53 fix (CHECK M4): step 1 has no step behind it — Back here goes to the
  // pre-log instead. captureRunningProgressIfLeaving + stopTimer above already
  // kept a running ride's real minutes; her pre-log answers are untouched
  // (they live directly on `state`, never cleared by beginExercises).
  if (state.currentPhase === 'warmup' && state.currentExerciseIndex === 0 && !state.isResting) {
    state.screen = 'pre-log';
    render();
    return;
  }
  // v48: Back from the "Round 1 done ✓" screen = round 1's last move, which is
  // where the state already points (the break sits on top of it).
  if (state.roundBreak) {
    state.roundBreak = false;
    render();
    return;
  }
  // On the rest screen the index already points at the NEXT exercise, so
  // "back" from rest = the exercise she just finished = one index back.
  state.isResting = false;

  const lastOf = (phase: Phase): number => Math.max(0, (w[phase] ?? []).length - 1);
  if (state.currentPhase === 'cooldown' && state.finishHereLitePrev !== null) {
    // v48: she tapped "Finish here" — Back undoes exactly that: the round-break
    // screen again, with Lite as it was before the tap (she skipped round 2 and
    // the upper-back block, so they are not "one step back").
    state.liteDay = state.finishHereLitePrev;
    state.finishHereLitePrev = null;
    state.currentPhase = 'main';
    state.currentRound = 1;
    state.currentExerciseIndex = lastOf('main');
    state.roundBreak = true;
  } else if (state.currentPhase === 'cooldown') {
    if (w.upperBack?.length) {
      state.currentPhase = 'upperBack';
      state.currentExerciseIndex = lastOf('upperBack');
    } else {
      state.currentPhase = 'main';
      state.currentRound = effectiveRounds(w);
      state.currentExerciseIndex = lastOf('main');
    }
  } else if (state.currentExerciseIndex > 0) {
    state.currentExerciseIndex -= 1;
  } else if (state.currentPhase === 'main') {
    if (state.currentRound > 1) {
      state.currentRound -= 1;
      state.currentExerciseIndex = lastOf('main');
    } else {
      state.currentPhase = 'warmup';
      state.currentExerciseIndex = lastOf('warmup');
    }
  } else if (state.currentPhase === 'upperBack') {
    state.currentPhase = 'main';
    state.currentRound = effectiveRounds(w);
    state.currentExerciseIndex = lastOf('main');
  }
  render();
}

// v50 · jump list (Sep 25 2026): a row's `data-jump-key`, parsed back into a
// position. Bounds-checked against the live workout the same defensive way
// readActiveSnapshot checks a resumed index — a stale or hand-edited key is
// dropped, never crashed on.
function parseStepKey(
  w: Workout,
  key: string
): { phase: Phase; round: number; index: number } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [phaseRaw, roundRaw, indexRaw] = parts;
  const phase = phaseRaw as Phase;
  if (phase !== 'warmup' && phase !== 'main' && phase !== 'upperBack' && phase !== 'cooldown') {
    return null;
  }
  const round = Number(roundRaw);
  const index = Number(indexRaw);
  if (!Number.isInteger(round) || round < 1 || !Number.isInteger(index) || index < 0) return null;
  if (phase === 'cooldown') return { phase, round: 1, index: 0 };
  const list = w[phase] ?? [];
  if (index >= list.length) return null;
  if (phase === 'main' && round > effectiveRounds(w)) return null;
  return { phase, round, index };
}

// "Tapping a row jumps straight there" (her List-sheet spec, Sep 25 2026):
// same cleanup as goBack() — a running timer stops, a pending wall-sit
// capture is discarded, a rest is cancelled — but nothing is marked done and
// nothing is logged. Unlike goBack this can land anywhere, so it also closes
// the round-1 floor if it was up (she's jumping past the question it asks).
function jumpToStep(key: string): void {
  const w = getCurrentWorkout();
  if (!w) return;
  const parsed = parseStepKey(w, key);
  if (!parsed) return;
  stopTimer();
  state.wallSitStartedAt = null;
  state.videoExpandedFor = null;
  state.isResting = false;
  state.roundBreak = false;
  state.rideNumbersOpen = false; // v51: leaving the elliptical step by any route closes it
  state.currentPhase = parsed.phase;
  state.currentRound = parsed.round;
  state.currentExerciseIndex = parsed.index;
  stepListOpen = false;
  render();
}

// v48 (Sep 24 2026): the pinned bottom bar. Done sat at the END of each step's
// scroll — under a video, a detail card and a cue paragraph — so on most steps
// it was below the fold (walk-in-her-shoes: "Back and Done pinned to the
// bottom"). One helper so pre-log Start and post-log Save (P5) pin the same way.
// render() gives #app the matching bottom padding whenever a bar is on screen.
function renderActionBar(inner: string): string {
  return `<div class="action-bar"><div class="action-bar-inner">${inner}</div></div>`;
}

// The Back + Done pair under every step (v47), pinned since v48. v53 fix
// (CHECK M4): Back used to hide on the very first step ("nothing behind
// her") — it now always shows; from step 1 specifically it goes to the
// pre-log instead of a step further back (see goBack). `quiet` = Done in the
// Back style (v48: a timed hold before it has run — the sage belongs to
// Start timer then; one sage per screen). Still tappable either way: she may
// have used her own clock.
function renderStepNav(doneLabel: string, quiet = false): string {
  const back = canGoBack()
    ? `<button class="btn-large btn-back" id="step-back" type="button" aria-label="Back one step">‹ Back</button>`
    : '';
  return renderActionBar(`
    <div class="step-nav">
      ${back}
      <button class="btn-large ${quiet ? 'btn-back btn-done-quiet' : 'btn-primary'}" id="next" type="button">${doneLabel}</button>
    </div>
  `);
}

// v48 (Sep 24 2026): ONE count for the whole workout, replacing the round pill +
// "Exercise N of M" (which restarted at 1 in every phase and every round) + the
// in-card phase label — three counters, none of which said how far along she
// was. Total = warm-up + main × rounds + upper back + 1 (the cool-down list is
// one step).
// v50 · jump list (Sep 25 2026): the numerator is step-list.ts's reachedCount
// (every step marked done, plus the one she's currently viewing if it isn't
// done yet) — "count completed steps, not position" per her spec. On a plain
// forward walk this is numerically identical to the old position count (every
// step up to "here" really was done in order), so nothing on an untouched
// List sheet changes; it only diverges once she jumps BACK to view an
// already-finished step out of order, where it correctly stops claiming
// credit for a position she's since revisited rather than newly reached.
// Cool-down is still always the full bar — it's one step, always last,
// whether or not everything before it got done (finishAtRoundOne can reach it
// early on purpose).
function workoutStepPosition(w: Workout): { index: number; total: number } {
  const warm = w.warmup.length;
  const main = w.main.length;
  const rounds = effectiveRounds(w);
  const upper = w.upperBack?.length ?? 0;
  // v55 (Sep 27 2026) — CHECK round1/2/3 N1: the trailing "+1" stood for the
  // cool-down step, so a workout with none (Workout D: warmup:[ride], main:[],
  // cooldown:[]) still counted a step that never happens — "Warm-up · 1 of 2"
  // on a genuinely one-step ride. Only add it when there's a real cool-down
  // to reach.
  const hasCooldown = (w.cooldown ?? []).length > 0;
  const total = warm + main * rounds + upper + (hasCooldown ? 1 : 0);
  if (state.currentPhase === 'cooldown') {
    return { index: total, total };
  }
  const movable = flattenSteps(toStepWorkout(w), rounds);
  const index = reachedCount(movable, state.completedSteps, currentStepKey());
  return { index: Math.max(1, Math.min(total, index)), total };
}

// v50 · jump list (Sep 25 2026): how many warm-up/main/upper-back moves never
// got a Done tap this session — the post-log's plain "N moves skipped" line
// and the steps_skipped column (no verdict either place, just the count).
//
// v50 · fix (Sep 25 2026): "Finish here — it still counts" (finishAtRoundOne)
// deliberately drops round 2+ AND the upper-back block — effectiveRounds()
// above already takes round 2+ out of `movable`, but upper-back stayed in
// it, so a floor the app itself just told her "still counts" logged "6 moves
// skipped" right under "Nice. Workout A done." — a mixed message. Leave out
// the same steps the floor removed on purpose, the same way Lite leaves out
// round 2: when finishHereLitePrev is set (non-null = "Finish here" was
// tapped this session), upper-back doesn't count as skipped either.
function skippedStepsCount(w: Workout): number {
  const movable = flattenSteps(toStepWorkout(w), effectiveRounds(w));
  const countable =
    state.finishHereLitePrev !== null ? movable.filter((s) => s.phase !== 'upperBack') : movable;
  return countable.filter((s) => state.completedSteps[s.key] !== true).length;
}

function phaseLabelFor(w: Workout): string {
  const base =
    // v55 (Sep 27 2026) — CHECK N1/N3: Workout D's one step is the ride
    // itself, not a "Warm-up" leading up to something else. "Ride · 1 of 1".
    w.id === 'D' && state.currentPhase === 'warmup'
      ? 'Ride'
      : state.currentPhase === 'main'
        ? `Main · Round ${state.currentRound} of ${effectiveRounds(w)}`
        : state.currentPhase === 'warmup'
          ? 'Warm-up'
          : state.currentPhase === 'upperBack'
            ? 'Upper back'
            : cooldownChipLabel(w);
  return `${base}${state.liteDay ? ' · lite' : ''}`;
}

// v48 · P7 (Sep 24 2026): the cool-down chip counts HER rows — "Stretch · 11",
// not "Stretch · 18 stretches" (a number that overstated the hill at the end of
// a workout, and said "stretch" twice — uxui cooldown). An empty list keeps the
// plain phase name rather than print "Stretch · 0".
function cooldownChipLabel(w: Workout): string {
  const n = groupStretchPairs(w.cooldown ?? []).length;
  return n > 0 ? `Stretch · ${n}` : 'Cool-down';
}

// The one progress line + the one bar (v48). `.round-indicator` stays on the
// left label — the resume tests key on it.
function renderProgressLine(w: Workout): string {
  const { index, total } = workoutStepPosition(w);
  // v48 · P8 (Sep 24 2026): no "23 of 23" on the cool-down. It's always the
  // last step, so the number only repeats the full bar. The list's own live
  // line ("~13 min · 5 of 11") is the one count on that screen (DECISIONS §2:
  // "one quiet count").
  const count =
    state.currentPhase === 'cooldown' ? '' : `<span class="step-count">${index} of ${total}</span>`;
  return `
    <div class="step-progress">
      <span class="round-indicator">${phaseLabelFor(w)}</span>
      ${count}
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${(index / total) * 100}%"></div>
    </div>`;
}

// v48 (Sep 24 2026): "New tonight" — a move that wasn't in this workout last
// encoded week AND she hasn't done this workout since the week began. Her first
// split squat sat on the same face as her 40th bridge (walk-in-her-shoes: "A
// 'New tonight' badge"). Nothing to decide — a label, gone after one session.
// Reused by P4/P5 (pre-log overview, home hero).
function isNewTonight(ex: Exercise, id: AnyWorkoutId): boolean {
  // v54 (Sep 27 2026): D has no PROGRAM history to compare against (it isn't
  // week-versioned at all — see getWorkoutD's own comment) — never "new
  // tonight"/"again tonight" for it.
  if (id === 'D') return false;
  const current = getWeekPlan();
  const idx = PROGRAM.indexOf(current);
  const prev = idx > 0 ? PROGRAM[idx - 1] : undefined;
  if (!prev) return false; // Week 1 of the program: everything is new, so nothing is
  const pw = prev.workouts[id];
  const phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  if (phases.some((p) => (pw[p] ?? []).some((e) => e.name === ex.name))) return false;
  const startMs = new Date(current.startsOn + 'T00:00:00').getTime();
  return !loadLogs().some((l) => l.workout === id && new Date(l.date).getTime() >= startMs);
}

// v48 · fix r1 (Sep 24 2026): "new" splits in two. A move that sat in ANY
// earlier week of the program (any workout, any block) is a RETURN, not a first
// — the 1 kg curl and the prone row were in her Round 1 Week 7 (UPPER_BACK_W7,
// Jun 13-19) before the arm pause, so "Firsts: 1 kg biceps curl" told her
// something untrue about her own history (fail-loud rule). Returns read "Back".
type TonightKind = 'new' | 'back';

function wasInEarlierWeek(name: string): boolean {
  const idx = PROGRAM.indexOf(getWeekPlan());
  if (idx <= 0) return false;
  const phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  return PROGRAM.slice(0, idx).some((week) =>
    (['A', 'B', 'C'] as WorkoutId[]).some((wid) =>
      phases.some((p) => (week.workouts[wid][p] ?? []).some((e) => e.name === name))
    )
  );
}

function tonightKind(ex: Exercise, id: AnyWorkoutId): TonightKind | null {
  if (!isNewTonight(ex, id)) return null;
  return wasInEarlierWeek(ex.name) ? 'back' : 'new';
}

// v48: is the current step a hold (wall sit, plank, wall lean) rather than a
// cardio lane? Lanes keep their v46 face — P3 owns them.
function isHoldStep(ex: Exercise): boolean {
  return !!ex.isTimed && !isIndoorLane(ex.name) && ex.name !== 'Outdoor walk';
}

// v48: round 2+ of the main block — the quieter face (visual folded, how-to
// never auto-open).
function isLaterRound(): boolean {
  return state.currentPhase === 'main' && state.currentRound > 1;
}

// The hold done-faces are keyed per STEP (phase|round|index), not per name: the
// wall sit comes round again in round 2, and that one hasn't been held yet —
// a name key would greet round 2 with "✓ held 45 s". Back to a held step
// shows its done-face again.
function holdStepKey(): string {
  return `${state.currentPhase}|${state.currentRound}|${state.currentExerciseIndex}`;
}

// Seconds held on THIS step so far (0 = not run yet).
function heldOnThisStep(): number {
  return state.heldSecFor[holdStepKey()] ?? 0;
}

function recordHeld(key: string, sec: number): void {
  // Max: a redo can add a better hold, never erase a real one (the saved wall
  // sit follows the same rule in captureWallSitIfPending).
  if (sec > 0) state.heldSecFor[key] = Math.max(state.heldSecFor[key] ?? 0, sec);
}

// v60 (Sep 28 2026) — the multi-set hold's own recordHeld: appends a fresh
// set, or (holdRedoInProgress) replaces the LAST one, both via the same
// "never erase a real one" max rule recordHeld above already uses. Untouched
// by any single-set hold — those keep calling recordHeld/heldSecFor.
function recordHeldSet(key: string, sec: number): void {
  if (sec <= 0) return;
  const next = [...(state.heldSetsFor[key] ?? [])];
  const idx = holdRedoInProgress ? next.length - 1 : next.length;
  if (idx < 0) return; // a redo with no prior set — shouldn't happen; fail quiet
  next[idx] = Math.max(next[idx] ?? 0, sec);
  state.heldSetsFor[key] = next;
}

// v48 (Sep 24 2026): the quiet Stop on a running hold. Saves the REAL seconds
// — walk §4: "No way to say I held less". There used to be only a disabled
// "Running…" slab. Stopped during the 3-2-1 = nothing held, back to Ready.
function stopTimedHold(): void {
  const ex = getCurrentExercise();
  if (!ex) return;
  const t = activeTimer;
  if (t && t.kind === 'timed-exercise' && ex.durationSec) {
    const remainSec = Math.max(0, (t.endsAt - Date.now()) / 1000);
    const heldSec = Math.max(0, Math.round(ex.durationSec - remainSec));
    if (setsPrescribed(ex.reps) > 1) recordHeldSet(holdStepKey(), heldSec);
    else recordHeld(holdStepKey(), heldSec);
  }
  if (ex.name === 'Wall sit') captureWallSitIfPending(); // the saved number
  holdRedoInProgress = false;
  stopTimer();
  render();
}

// v60 (Sep 28 2026): "Start set N" (#hold-set-next) — a fresh next set, same
// countdown+timer machinery as the very first "Start timer" tap. Kept as its
// own function (rather than reusing #start-timed's id) so a multi-set hold's
// "Set N of M" ready face never collides with the untouched single-set Ready
// face above it in renderHoldTimerCard.
function startNextHoldSet(): void {
  holdRedoInProgress = false;
  startTimedExercise();
}

// v60 (Sep 28 2026): "Redo set N" (#hold-redo) on a multi-set hold — redoes
// the LAST completed set (recordHeldSet replaces it via max, never erases a
// real hold). #redo-timed (single-set) stays exactly as it was, calling
// startTimedExercise() straight — unaffected by this flag.
function redoLastHoldSet(): void {
  holdRedoInProgress = true;
  startTimedExercise();
}

// "Start round 2" on the round-break screen (v48). Rest (if she set one) runs
// first, exactly as it did at the round boundary before.
function startRoundTwo(): void {
  // Round 2 opens quiet: the Cue and detail dropdowns she opened in round 1
  // close again (walk-in-her-shoes: "Round 2 notes closed"). Setup blocks
  // ("setup:<name>") keep whatever she chose.
  for (const key of Object.keys(state.openSections)) {
    if (key.includes('::')) delete state.openSections[key];
  }
  state.roundBreak = false;
  state.currentRound = 2;
  state.currentExerciseIndex = 0;
  startRestTimer(); // rest 0 (her default) = straight on; it renders either way
}

// "Finish here — it still counts" (v48): skip round 2 and the upper-back block,
// land on the cool-down list in Lite, save lite_day = true. Your weeks are 3/3
// or 0 — the cheapest floor is inside the session you're already in.
function finishAtRoundOne(): void {
  state.finishHereLitePrev = state.liteDay;
  state.liteDay = true;
  state.roundBreak = false;
  state.currentPhase = 'cooldown';
  state.currentExerciseIndex = 0;
  render();
}

// Quit panel's "Log what I did" (v48): the half session is logged, not thrown
// away (assumptions Kill #10, ux.md #8). Lite if round 2 never started.
function logWhatIDid(): void {
  const ex = getCurrentExercise();
  captureWallSitIfPending(); // a hold she was in the middle of still counts
  captureLaneMinutesIfLeaving();
  stopTimer();
  state.stoppedEarlyLitePrev = state.liteDay; // v48 · fix r1: for Back to the workout
  state.stoppedEarlyAt =
    state.currentPhase === 'cooldown'
      ? 'the cool-down'
      : ex
        ? displayName(ex) // v48 · P3: "Cardio", not the internal key
        : state.currentPhase;
  if (
    state.currentRound === 1 &&
    (state.currentPhase === 'warmup' || state.currentPhase === 'main')
  ) {
    state.liteDay = true;
  }
  state.isResting = false;
  state.roundBreak = false;
  enterPostLog();
}

function captureWallSitIfPending(): void {
  if (state.wallSitStartedAt !== null) {
    const heldSec = Math.max(0, Math.round((Date.now() - state.wallSitStartedAt) / 1000));
    state.wallSitSec = Math.max(state.wallSitSec, heldSec);
    state.wallSitStartedAt = null;
  }
}

function startTimedExercise(): void {
  const ex = getCurrentExercise();
  if (!ex || !ex.durationSec) return;
  const duration = ex.durationSec;
  const exerciseName = ex.name;
  unlockAudio(); // Group 1C: synchronous resume in user-gesture handler
  const go = (): void => {
    // v45: the hold clock starts on GO, not on the tap. It used to start
    // before the 3-2-1, so every completed wall sit logged target + 3 s
    // (10 of 10 timed holds, May 19 → Sep 14).
    if (exerciseName === 'Wall sit') {
      state.wallSitStartedAt = Date.now();
    }
    if (isIndoorLane(exerciseName)) {
      localStorage.setItem(WW_LANE_STARTED_KEY, String(Date.now()));
      localStorage.removeItem(WW_LANE_DONE_MIN_KEY); // a fresh ride, fresh minutes
      // v48 · P3: the setup expander never reopens after the ride — forget any
      // before-ride open/close so the after-ride face starts it closed.
      delete state.openSections[`${ELLIPTICAL_NAME}::setup`];
    }
    const stepKey = holdStepKey(); // v48: the done-face belongs to this step
    startTimerCore('timed-exercise', duration, () => {
      if (!isIndoorLane(exerciseName)) {
        // v60: a hold prescribed "N ×" (setsPrescribed > 1) records into
        // heldSetsFor instead — one array entry per set, a redo replacing the
        // last one. Every other hold (setsPrescribed <= 1) is untouched.
        if (setsPrescribed(ex.reps) > 1) recordHeldSet(stepKey, duration);
        else recordHeld(stepKey, duration); // v48 "✓ held 45 s"
      }
      holdRedoInProgress = false;
      if (exerciseName === 'Wall sit') {
        // v48 (Sep 24 2026): a hold that ran to the end held exactly its
        // duration. Measuring the wall clock here logged 46+ when the frame
        // fired late (phone asleep → the loop resumes minutes later), and the
        // new "✓ held 45 s" face would repeat that number to her.
        state.wallSitStartedAt = null;
        state.wallSitSec = Math.max(state.wallSitSec, duration);
      }
      render();
    });
  };
  // v48 · P3 (Sep 24 2026) — decision Q8: no 3-2-1 before a 10-25 minute ride
  // ("the page jumps", walk §2). Holds keep it: it's what stops the +3 s wall
  // sit coming back (v45).
  if (isIndoorLane(exerciseName)) go();
  else startPreCountdown(go);
}

// ---------- v48 · P4 (Sep 24 2026): the "Done ✓" card's firsts ----------
// Her words today: "look at home ux ui and make it better i feel like its a bit
// all over the place". After Save, home used to light the NEXT workout as
// "Today's pick" minutes later; now a Done card witnesses tonight, with any
// firsts ("split squat · first elliptical ride"). Per-phone display memory
// only — the session row itself is the record; without this key the card still
// reads "Done ✓ · Workout A · 1 of 3 this week".

// v48 · fix r1 (Sep 24 2026): `back` = moves returning from an earlier week
// (the 1 kg curl, the prone row) — kept apart from true firsts. Optional so a
// card saved before this fix still loads.
type LastDone = { id: string; firsts: string[]; back?: string[] };

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

function saveLastDone(d: LastDone): void {
  try {
    localStorage.setItem(LAST_DONE_KEY, JSON.stringify(d));
  } catch {
    // storage full or blocked — the Done card still shows without firsts
  }
}

function loadLastDone(): LastDone | null {
  try {
    const raw = localStorage.getItem(LAST_DONE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const o = v as { id?: unknown; firsts?: unknown; back?: unknown };
    if (typeof o.id !== 'string' || !Array.isArray(o.firsts)) return null;
    const strings = (a: unknown[]): string[] => a.filter((f): f is string => typeof f === 'string');
    return {
      id: o.id,
      firsts: strings(o.firsts),
      back: Array.isArray(o.back) ? strings(o.back) : [],
    };
  } catch {
    return null;
  }
}

// ---------- v48 · P5 (Sep 24 2026): arm feel + the LOAD CHIP ----------
// The 2 kg trigger was her Jul 3 buy-bigger ask, and the app logs no arm reps
// (assumptions, 19). One optional tap on the two 1 kg moves — inside her
// 2-tap line — read her feel.
//
// v55 (Sep 27 2026): the old "Ask Lisa about 2 kg?" card is RETIRED — her
// rule 8e, "Get rid of Lisa. I decide based on pain" (Sep 26 23:15), and she
// has 2 kg now (20:08). The LOAD CHIP replaces it: she picks 1 kg or 2 kg
// herself, every set, no question asked.
const ARM_FEEL_STEPS: Record<string, keyof ArmFeelState> = {
  '1 kg biceps curl': 'curl',
  'Prone row (bodyweight)': 'row',
};
const ARM_FEEL_VALUES: readonly ArmFeel[] = ['easy', 'right', 'hard'];
const ARM_LOAD_VALUES: readonly ArmLoad[] = ['1kg', '2kg'];

function isArmFeel(v: unknown): v is ArmFeel {
  return typeof v === 'string' && (ARM_FEEL_VALUES as readonly string[]).includes(v);
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

function isArmLoad(v: unknown): v is ArmLoad {
  return v === '1kg' || v === '2kg';
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

// v55 fix r3 (Sep 28 2026): reverse of ARM_FEEL_STEPS (name -> step) — so
// armFeelString can read state.setsDoneFor (keyed by exercise name) off a
// step key without a third hand-copy of the same two literal strings.
const ARM_STEP_EXERCISE_NAME: Record<keyof ArmFeelState, string> = {
  curl: '1 kg biceps curl',
  row: 'Prone row (bodyweight)',
};

// "curl=easy@2kg;row=right@1kg" — the LOCAL storage shape (workout-tracker:
// logs, this device's loadLogs()); null when none. v55 (Sep 27 2026): the
// "@1kg"/"@2kg" suffix is new (the LOAD CHIP) — appended only when a load is
// known, so a pre-v55 row (no suffix) and the existing reader (the rowcurl
// "easy" substring match in progression.ts) still parse it exactly as
// before.
// v55 fix r2 (Sep 27 2026): the live arm_feel CHECK didn't accept the
// suffix, so this used to diverge from what sessionPayload actually sent
// (stripArmFeelLoad stripped it). v55 fix r3 (Sep 28 2026): she said go —
// migrations/2026-09-28-v55-arm-feel-load.sql widened the CHECK, the strip
// is deleted, and this is now exactly the wire shape too.
// v55 fix r3, should #1 (checker's Probe B): a feel tap used to be the ONLY
// thing that wrote anything. She can pick 2 kg, do both sets, never tap
// Easy/Right/Hard, and Save wiped the load to null. `engaged` below is the
// same "she was really here" signal the CHIP-AFTER-THE-LAST-SET UI already
// waits on (state.setsDoneFor, keyed by exercise name) — at least one set
// marked done THIS session on that move. Without it, every session (arm
// block or not — defaultArmLoad runs at the start of ALL of them) would
// write a bogus "curl=@1kg;row=@1kg" off armLoad's mere default.
function armFeelString(
  f: ArmFeelState,
  loads: ArmLoadState,
  setsDone: Record<string, number>
): string | null {
  const part = (key: 'curl' | 'row', feel: ArmFeel | undefined): string => {
    const load = loads[key];
    const engaged = feel !== undefined || (setsDone[ARM_STEP_EXERCISE_NAME[key]] ?? 0) > 0;
    if (!engaged) return '';
    // feel-less load: 'curl=@2kg' — the widened CHECK allows the feel half
    // to be empty (her pick still needs to be recorded).
    return `${key}=${feel ?? ''}${load ? `@${load}` : ''}`;
  };
  const parts = [part('curl', f.curl), part('row', f.row)].filter((p) => p !== '');
  return parts.length > 0 ? parts.join(';') : null;
}

// v55: the LOAD half of one saved "curl=easy@2kg" part, for one step key.
// null when that key isn't in the string, or carries no "@load" at all
// (every row saved before v55).
function armFeelLoad(s: string | null | undefined, key: 'curl' | 'row'): ArmLoad | null {
  if (!s) return null;
  for (const part of s.split(';')) {
    const [k, rest] = part.split('=');
    if (k !== key) continue;
    const m = /@(1kg|2kg)$/.exec(rest ?? '');
    return m ? (m[1] as ArmLoad) : null;
  }
  return null;
}

// v55 — "default = last used, initially 1 kg" (her spec): the newest past
// log that actually recorded a load for this move, newest-first; 1 kg when
// she's never recorded one (a fresh install, or every row predates v55).
function lastUsedArmLoad(logs: LogEntry[], key: 'curl' | 'row'): ArmLoad {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const l of sorted) {
    const load = armFeelLoad(l.armFeel, key);
    if (load) return load;
  }
  return '1kg';
}

function defaultArmLoad(logs: LogEntry[]): ArmLoadState {
  return { curl: lastUsedArmLoad(logs, 'curl'), row: lastUsedArmLoad(logs, 'row') };
}

// v55 · fix r1: the heavier of two loads (or the one that's set, if only one
// is) — armLoadMax's own update rule. '2kg' always wins over '1kg'.
function heavierArmLoad(a: ArmLoad | undefined, b: ArmLoad | undefined): ArmLoad | undefined {
  if (a === '2kg' || b === '2kg') return '2kg';
  return a ?? b;
}

// v45: one save at a time. The walk lane awaits Google Fit (up to 5 s) before
// saving, and a second tap on "Save & finish" in that window wrote a 2nd row.
let savingLog = false;

async function logCompleteAndHome(): Promise<void> {
  if (!state.selectedWorkout || savingLog) return;
  savingLog = true;
  try {
    await saveCompletedSession();
  } finally {
    savingLog = false;
  }
}

async function saveCompletedSession(): Promise<void> {
  if (!state.selectedWorkout) return;
  // v50 · jump list: read before resetState() wipes completedSteps.
  const w = getCurrentWorkout();
  harvestWorkoutWalk(); // no-op unless a walk step is somehow still open
  if (!workoutWalk) workoutWalk = storedWorkoutWalk(); // survived an app close (v45)
  // By now the walk (first exercise) ended long ago, so Google Fit has synced it.
  // v48 · P3 (Sep 24 2026): Fit's count is the ONLY step number — saved to
  // walk_steps when Fit answers, else null (the motion estimate is archived),
  // and never displayed. Brief await (Fit replies fast); never blocks the log.
  let walkFitSteps: number | null = null;
  if (workoutWalk && workoutWalk.startMs && workoutWalk.endMs) {
    const fit = await fetchFitSteps(workoutWalk.startMs, workoutWalk.endMs);
    if (fit !== null && fit > 0) walkFitSteps = fit;
  }
  const completedAt = new Date().toISOString();
  const startedAt = state.startedAt ?? completedAt;
  // T1 (Sep 27 2026), §3.2 "Untouched at Start"'s own twin at the other end:
  // if she never tapped ✓/✎ on the finish question, this Save-tap instant
  // becomes her_end_at — her_end_confirmed stays false either way. Read
  // BEFORE endPostLogClockTick() below so the tick's own textContent write
  // race (if it somehow still fires this same tick) can't win against this.
  endPostLogClockTick();
  const herEndAtFinal = state.herEndConfirmed ? state.herEndAt : new Date().toISOString();
  // §3.2 "If the finish is before the start: ... Save still works (never
  // block a save), and the times save as not confirmed." A confirmed-but-
  // backwards pair would otherwise let timing.ts's trainingMinutes() see two
  // confirmed timestamps and compute a negative/nonsense duration — this is
  // the one place that can never happen from, not a UI-only warning.
  const timingBackwards =
    state.herStartAt !== null &&
    herEndAtFinal !== null &&
    new Date(herEndAtFinal).getTime() < new Date(state.herStartAt).getTime();
  const herStartConfirmedFinal = timingBackwards ? false : state.herStartConfirmed;
  const herEndConfirmedFinal = timingBackwards ? false : state.herEndConfirmed;
  // Subtract any paused time — stepping away (dishes, a phone call) shouldn't
  // inflate the logged workout duration (Allison Jul 7 2026).
  const rawDurationSec = Math.max(
    0,
    Math.round(
      (new Date(completedAt).getTime() - new Date(startedAt).getTime() - totalPausedMs()) / 1000
    )
  );
  // Safety net (v32, Sep 11 2026): a session that sat open for hours or days
  // before Done has no honest duration. Blank it instead of logging 46 hours.
  const leftOpen = rawDurationSec > MAX_PLAUSIBLE_DURATION_SEC;
  // Cardio either/or (Sep 7 2026): the apartment lane has nothing to track, so
  // the PRESCRIBED minutes are the honest number.
  // v45: when she ran the lane's timer, the minutes she actually did win over
  // the prescription (Done at 4 of 10 min used to log 10).
  // v48 (Sep 24 2026): the lane, its minutes and the elliptical readings go to
  // their OWN columns — no more "cardio: elliptical 10 min · level 7 · …" prose
  // in `notes` read back by regex (a note of hers in that shape would have been
  // misread as her level, data-integrity #1). walk_minutes is for real walks only.
  const laneDone = laneDoneMinutes();
  const prescribedElliptical = ellipticalMinutes();
  const prescribedApartment = apartmentCardioMinutes();
  const cardioLane: LogEntry['cardioLane'] =
    prescribedElliptical !== null
      ? 'elliptical'
      : prescribedApartment !== null
        ? 'apartment'
        : workoutWalk
          ? 'walk'
          : null;
  // v61 fix pass (Sep 28 2026, CHECK-v61 must #2): the elliptical lane used
  // to fall back to the PRESCRIBED length (laneDone ?? prescribedElliptical)
  // — but laneDone is always null now (no app timer left to run,
  // captureLaneMinutesIfLeaving's own WW_LANE_STARTED_KEY is never set for
  // the ride any more, spec item e), so every save silently logged the
  // planned minutes as if she'd done exactly that, even when she typed a
  // real 25:00 (driven repro: saved 30). cardio_minutes means "what she
  // actually did" (ride-aim.ts/ridge.ts both read it that way) — her typed
  // time (ellipticalTimeSec, which already prefers the typed box) or
  // nothing, never a guess from the prescription.
  const typedEllipticalSec = cardioLane === 'elliptical' ? ellipticalTimeSec() : null;
  const cardioMinutes =
    cardioLane === 'elliptical'
      ? typedEllipticalSec !== null
        ? Math.round(typedEllipticalSec / 60)
        : null
      : cardioLane === 'apartment'
        ? (laneDone ?? prescribedApartment)
        : cardioLane === 'walk' && workoutWalk
          ? workoutWalk.minutes
          : null;
  const onElliptical = cardioLane === 'elliptical';
  // Her free-text line from the post-log (v44): "a way to put in any
  // information at the end about what I did". Kept verbatim, in its own column
  // from v48 — her words, not the tail of a machine log line.
  const sessionNote = state.sessionNote.trim() || null;
  // `notes` = system annotations only. v48 (Sep 24 2026): "stopped early at
  // <move>" when she logged a partial session from the quit panel.
  const notes =
    [
      leftOpen
        ? `duration not recorded — session was left open ${Math.round(rawDurationSec / 3600)}h before Done`
        : null,
      state.stoppedEarlyAt ? `stopped early at ${state.stoppedEarlyAt}` : null,
    ]
      .filter((s): s is string => s !== null)
      .join(' · ') || null;
  // v48 · P4 (Sep 24 2026): the firsts of THIS session, worked out before the
  // save (after it, "New tonight" is already false). Home's "Done ✓" card
  // shows them until midnight — uxui post-log 4/5: "the win went unwitnessed".
  const { firsts, back } = sessionFirsts(onElliptical);
  const stored = saveLog({
    date: completedAt,
    workout: state.selectedWorkout,
    // v46: a slider she never moved is not a reading — null, shown as "—".
    capacityBefore: state.capacityBeforeTouched ? state.capacityBefore : null,
    capacityAfter: state.capacityAfterTouched ? state.capacityAfter : null,
    // v50 · mood: a chip she never tapped is not a reading — null, same rule as capacity.
    moodBefore: state.moodBeforeTouched ? state.moodBefore : null,
    moodAfter: state.moodAfterTouched ? state.moodAfter : null,
    wallSitSec: state.wallSitSec,
    backPain: state.backPainTouched ? state.backPain : null,
    // v49 · engine: same null-means-not-answered shape as backPain.
    wristPain: state.wristPainTouched ? state.wristPain : null,
    // v51: a chip she never tapped is not a reading — null, same rule as above.
    backPainBefore: state.backPainBeforeTouched ? state.backPainBefore : null,
    wristPainBefore: state.wristPainBeforeTouched ? state.wristPainBefore : null,
    stepFeel: state.stepFeel,
    word: state.word,
    startedAt,
    completedAt,
    // T1 (Sep 27 2026), §3: her own start/finish answers — see the
    // `timingBackwards` guard above, which is the only place these
    // confirmed flags can differ from what's on state.
    herStartAt: state.herStartAt,
    herStartConfirmed: herStartConfirmedFinal,
    herEndAt: herEndAtFinal,
    herEndConfirmed: herEndConfirmedFinal,
    breakMinutes: state.breakMinutes,
    ...(leftOpen ? {} : { durationSec: rawDurationSec }),
    walkMinutes: workoutWalk ? workoutWalk.minutes : null,
    walkSteps: walkFitSteps,
    walkMeters: null, // v48 · P3: GPS distance archived — minutes only
    notes,
    cardioLane,
    cardioMinutes,
    ellipticalLevel: onElliptical ? ellipticalLevel() : null,
    ellipticalKm: onElliptical ? ellipticalKm() : null,
    ellipticalPulse: onElliptical ? ellipticalPulse() : null,
    ellipticalTimeSec: onElliptical ? ellipticalTimeSec() : null,
    ellipticalKcal: onElliptical ? ellipticalKcal() : null,
    sessionNote,
    liteDay: state.liteDay,
    // v48 · P5 (Sep 24 2026): "curl=easy@2kg;row=right@1kg" — only the parts
    // she engaged with, null when none. v55: the "@load" suffix carries her
    // per-set weight pick, sent to Supabase as-is since fix r3 (Sep 28 2026,
    // migrations/2026-09-28-v55-arm-feel-load.sql — see sessionPayload's
    // comment).
    // v55 · fix r1: armLoadMax (heaviest tapped this session), not armLoad
    // (current chip display) — see armLoadMax's own comment.
    // v55 · fix r3, should #1: setsDoneFor is how armFeelString knows she was
    // really on that step this session, so a load survives even without a
    // feel tap (see armFeelString's own comment).
    armFeel: armFeelString(state.armFeel, state.armLoadMax, state.setsDoneFor),
    // v58 (Sep 28 2026): only the moves she actually tapped a feel on, paired
    // with THIS week's own stepped-move list so the qty/unit is always the
    // real prescription, never a stale one from a plan that changed mid-
    // session (moveFeelString's own comment).
    // v61 (Sep 28 2026), spec item f: the ride's Easy/Right/Hard is ALWAYS
    // asked (never gated on "stepped" the way the rest of moveFeel is) —
    // withOverrideFeel replaces/adds just the 'ride' segment, minutes = her
    // typed time on the numbers screen, rounded (ellipticalTimeSec already
    // prefers what she typed over anything else).
    // v61 fix pass (CHECK-v61 should #5): a blank Time box used to fall back
    // to the PLANNED minutes (ellipticalMinutes() ?? 1), saving a qty she
    // never typed — "ride=right@30min" for a ride she logged no time for at
    // all. No typed time now saves the feel with no qty ("ride=right"), a
    // valid move_feel shape (the slug's own CHECK — see move-feel.ts's
    // isValidMoveFeelString — makes `@qty` optional).
    moveFeel: (() => {
      const base = moveFeelString(state.moveFeel, currentSteppedMoves());
      if (!onElliptical || !state.rideFeel) return base;
      const sec = ellipticalTimeSec();
      const minutes = sec !== null ? Math.max(1, Math.round(sec / 60)) : null;
      return withOverrideFeel(base, 'ride', state.rideFeel, minutes, 'min');
    })(),
    voicePlays: state.voicePlays,
    stepsSkipped: w ? skippedStepsCount(w) : null,
  });
  if (stored.id) saveLastDone({ id: stored.id, firsts, back });
  resetState();
  render();
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  void pushLogToSupabase(stored).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    updateSyncIndicator();
  });
}

// Screens that count as "in a workout" for resume purposes.
const RESUMABLE_SCREENS: readonly AppScreen[] = ['workout', 'post-log'];

function saveActiveSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!state.selectedWorkout || !RESUMABLE_SCREENS.includes(state.screen)) return;
    const snap: ActiveSessionSnapshot = {
      screen: state.screen,
      selectedWorkout: state.selectedWorkout,
      capacityBefore: state.capacityBefore,
      capacityAfter: state.capacityAfter,
      moodBefore: state.moodBefore,
      moodAfter: state.moodAfter,
      moodBeforeTouched: state.moodBeforeTouched,
      moodAfterTouched: state.moodAfterTouched,
      wallSitSec: state.wallSitSec,
      backPain: state.backPain,
      wristPain: state.wristPain,
      wristPainTouched: state.wristPainTouched,
      backPainBefore: state.backPainBefore,
      backPainBeforeTouched: state.backPainBeforeTouched,
      wristPainBefore: state.wristPainBefore,
      wristPainBeforeTouched: state.wristPainBeforeTouched,
      herStartAt: state.herStartAt,
      herStartConfirmed: state.herStartConfirmed,
      herEndAt: state.herEndAt,
      herEndConfirmed: state.herEndConfirmed,
      breakMinutes: state.breakMinutes,
      stepFeel: state.stepFeel,
      capacityBeforeTouched: state.capacityBeforeTouched,
      capacityAfterTouched: state.capacityAfterTouched,
      backPainTouched: state.backPainTouched,
      word: state.word,
      sessionNote: state.sessionNote,
      voicePlays: state.voicePlays,
      currentRound: state.currentRound,
      currentPhase: state.currentPhase,
      currentExerciseIndex: state.currentExerciseIndex,
      startedAt: state.startedAt,
      pausedAt: state.pausedAt,
      pausedMs: state.pausedMs,
      liteDay: state.liteDay,
      roundBreak: state.roundBreak,
      finishHereLitePrev: state.finishHereLitePrev,
      stoppedEarlyAt: state.stoppedEarlyAt,
      stoppedEarlyLitePrev: state.stoppedEarlyLitePrev,
      armFeel: state.armFeel,
      moveFeel: state.moveFeel,
      rideFeel: state.rideFeel,
      armLoad: state.armLoad,
      armLoadMax: state.armLoadMax,
      setsDoneFor: state.setsDoneFor,
      heldSetsFor: state.heldSetsFor,
      stretchTicks: state.stretchTicks,
      completedSteps: state.completedSteps,
      rideNumbersOpen: state.rideNumbersOpen,
      pinnedPlanDateIso: state.pinnedPlanDateIso,
      pinnedWeekKey: state.pinnedWeekKey,
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snap));
  } catch {
    // Non-fatal — resume is a convenience, never block the app on it.
  }
}

function clearActiveSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Non-fatal.
  }
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
  stepListOpen = false; // v50 · jump list: never reopen the sheet on resume
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

// A snapshot too old to resume silently (see STALE_SESSION_MS). Held here until
// she answers the home card; the snapshot stays in localStorage meanwhile so a
// reload asks again rather than losing it.
let staleSnapshot: ActiveSessionSnapshot | null = null;

// Rehydrate an in-progress session on load — unless it was left open long
// enough that "resume" would be a lie, in which case home asks instead.
function restoreActiveSession(): boolean {
  const snap = readActiveSnapshot();
  if (!snap) return false;
  const startedMs = snap.startedAt ? new Date(snap.startedAt).getTime() : NaN;
  if (Number.isFinite(startedMs) && Date.now() - startedMs > STALE_SESSION_MS) {
    staleSnapshot = snap;
    return false;
  }
  applyActiveSnapshot(snap);
  return true;
}

// "Yes, I did it": log the left-open workout for the day it was STARTED. No
// post-log ever happened, so after-capacity, back pain, end time and duration
// are unknown — saved as null (shown "—"), with a note saying why. The one
// number that was really entered, capacity-before, is kept.
function logStaleSessionAsDone(): void {
  const snap = staleSnapshot;
  if (!snap) return;
  const startedAt = snap.startedAt ?? new Date().toISOString();
  const stored = saveLog({
    date: startedAt,
    workout: snap.selectedWorkout,
    capacityBefore: snap.capacityBeforeTouched ? snap.capacityBefore : null, // v46: only if she moved it
    capacityAfter: null,
    // v50 · mood: same rule as capacity — before survives if she moved it, after is unknown.
    moodBefore: snap.moodBeforeTouched ? snap.moodBefore : null,
    moodAfter: null,
    wallSitSec: snap.wallSitSec,
    backPain: null,
    // v51: same rule as capacity/mood above — the pre-log Back & wrist
    // reading survives if she tapped it; the post-log (after) half never
    // happened, so it stays null like backPain above.
    backPainBefore: snap.backPainBeforeTouched ? snap.backPainBefore : null,
    wristPainBefore: snap.wristPainBeforeTouched ? snap.wristPainBefore : null,
    // T1: the start half survives (beginExercises() finalized it before this
    // session was ever resumable); the finish half never happened — no
    // post-log means no her_end_at/confirmed, same as capacityAfter above.
    herStartAt: snap.herStartAt,
    herStartConfirmed: snap.herStartConfirmed,
    word: snap.word,
    startedAt,
    notes:
      'logged after the fact — Done was never tapped, so no end time, after-capacity or back pain',
  });
  staleSnapshot = null;
  clearActiveSession();
  render();
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  void pushLogToSupabase(stored).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    updateSyncIndicator();
  });
}

function discardStaleSession(): void {
  staleSnapshot = null;
  clearActiveSession();
  render();
}

// "Keep going": resume it anyway. The Done safety net will blank the duration.
function continueStaleSession(): void {
  const snap = staleSnapshot;
  if (!snap) return;
  staleSnapshot = null;
  applyActiveSnapshot(snap);
  render();
}

function renderStaleSessionCard(snap: ActiveSessionSnapshot): string {
  const when = snap.startedAt
    ? `${formatDateLong(snap.startedAt)} at ${formatTime(snap.startedAt)}`
    : 'earlier';
  return `
    <div class="stale-card" id="stale-session-card" role="region" aria-label="Unfinished workout">
      <div class="stale-card-title">Workout ${snap.selectedWorkout} was left open</div>
      <div class="stale-card-sub">You started it ${when} and never tapped Done. Did you do it?</div>
      <div class="btn-row stale-card-row">
        <button class="btn btn-primary" id="stale-finished" type="button">Yes, I did it</button>
        <button class="btn" id="stale-discard" type="button">No, throw it away</button>
      </div>
      <button class="quit-link stale-card-continue" id="stale-continue" type="button">Keep going where I left off</button>
    </div>
  `;
}

function resetState(): void {
  stopTimer();
  clearActiveSession();
  state.screen = 'home';
  // Reset viewed week to current when returning to home from a session.
  viewedWeekOffset = 0;
  // WK2 (Sep 27 2026): a "‹ Week 4" peek never survives past the session she
  // takes next — Home always opens back on the true current week.
  viewingLastClosedWeek = false;
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
  stepListOpen = false; // v50 · jump list: a closed session closes the sheet too
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

// "Period started today" (or a picked day): her own logging, one tap, with a
// 10s undo (app-building-guide §1-2: <=2 taps, and every destructive-feeling
// action gets an out). Optimistic local write first — offline-safe, same as
// every other save in this app — then pushed if a network is allowed.
const CYCLE_UNDO_MS = 10_000;
let cycleUndoTimer: ReturnType<typeof setTimeout> | null = null;
let cycleUndoStartDate: string | null = null;
// v50 · fix (Sep 25 2026): Undo must only ever delete a row THIS tap created.
// Before this flag, re-logging an already-logged date (a second tap on a day
// she'd logged earlier, or re-logging today) then tapping Undo deleted the
// ORIGINAL row — it's gone from localStorage and a DELETE reaches Supabase
// too. false = "the date already existed; nothing for Undo to remove."
let cycleUndoCreated = false;

function logPeriodStart(dateISO: string): void {
  const periods = loadCyclePeriods();
  const existing = periods.find((p) => p.startDate === dateISO);
  if (cycleUndoTimer) clearTimeout(cycleUndoTimer);
  if (existing) {
    // Already logged — leave the row exactly as it was (never overwrite an
    // earlier 'reproductive.md' source with 'app', never re-push and risk a
    // conflict). Show "Already logged" with no Undo, since there's nothing
    // this tap created.
    cycleUndoStartDate = dateISO;
    cycleUndoCreated = false;
    cycleUndoTimer = setTimeout(() => {
      cycleUndoStartDate = null;
      render();
    }, CYCLE_UNDO_MS);
    render();
    return;
  }
  const stored: StoredCyclePeriod = {
    startDate: dateISO,
    source: 'app',
    note: null,
    synced: syncDisabled(), // automation: mark synced so no network is attempted
  };
  writeCyclePeriods([...periods, stored]);
  cycleUndoStartDate = dateISO;
  cycleUndoCreated = true;
  cycleUndoTimer = setTimeout(() => {
    cycleUndoStartDate = null;
    cycleUndoCreated = false;
    render();
  }, CYCLE_UNDO_MS);
  void pushCyclePeriod(stored);
  render();
}

function undoPeriodStart(): void {
  if (!cycleUndoStartDate || !cycleUndoCreated) return; // nothing this tap created — no-op
  const dateISO = cycleUndoStartDate;
  if (cycleUndoTimer) clearTimeout(cycleUndoTimer);
  cycleUndoTimer = null;
  cycleUndoStartDate = null;
  cycleUndoCreated = false;
  writeCyclePeriods(loadCyclePeriods().filter((p) => p.startDate !== dateISO));
  void deleteCyclePeriod(dateISO);
  render();
}

// v51 · cycle page (Sep 25 2026) — see renderCycle's own comment for why.
// `cycleReturnTo` says which door she came in by (the Progress row, or the
// Home "Period started?" row — see SPEC-cycle-page.md §2.1, §3), so the back
// button and its scroll restore match. `cycleCompareMetric` is Card C's own
// selected chip; it resets to 'body' every time the page is (re-)opened
// (§2.1).
let cycleReturnTo: 'progress' | 'home' = 'progress';
let cycleCompareMetric: CycleMetric = 'body';
let progressScrollForCycle = 0;

// v53 (Sep 26 2026) — the history-edit screen's draft (renderHistoryEdit,
// openHistoryEdit, saveHistoryEdit). Transient, module-level, like the cycle
// fields above — the screen is reached by an explicit tap (Edit, on the
// Session she's already looking at), not something an app close needs to
// resume mid-edit. `state.historyDetailId` still says WHICH session; this is
// only what she's typed so far.
type HistoryEditDraft = {
  timeStr: string;
  kmStr: string;
  kcalStr: string;
  level: number | null;
  pulseStr: string;
  note: string;
};
let historyEditDraft: HistoryEditDraft | null = null;

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

async function flushPendingSyncs(): Promise<void> {
  if (syncDisabled()) {
    // v48 · P4 (Sep 24 2026): under automation nothing syncs, so say so rather
    // than sit on "syncing…" forever (walk-in-her-shoes: the pill never settled
    // in the test setup). Nothing pending → the indicator is empty.
    state.syncStatus = 'offline';
    updateSyncIndicator();
    return;
  }
  const pendingLogs = loadLogs().filter((l) => !l.synced && l.id);
  // v50 · fix (Sep 25 2026): a "Period started today" tap made offline, or
  // one whose POST failed, was staying synced:false forever — nothing ever
  // retried it (flushPendingSyncs only looked at session logs). Fail-loud +
  // tandem rule: an unsynced row that never reaches cycle_periods is a row I
  // can't see either. Push those alongside pending session logs.
  const pendingPeriods = loadCyclePeriods().filter((p) => !p.synced);
  // WK3 (Sep 27 2026): a "Move on without it" tap made offline, or one whose
  // POST failed, retries here too — same fail-loud reasoning as pendingPeriods
  // above (an unsynced week_moves row is a row Claude can't see either).
  // WK3 fix r1 (checker must #1): split into live moves (retry the POST) and
  // Undo tombstones (retry the DELETE instead) — pushing a tombstone would
  // re-create on Supabase the exact row she just undid.
  const pendingWeekMoves = loadWeekMoves().filter((m) => !m.synced && !m.deleted);
  const pendingWeekMoveDeletes = loadWeekMoves().filter((m) => !m.synced && m.deleted);
  if (
    pendingLogs.length === 0 &&
    pendingPeriods.length === 0 &&
    pendingWeekMoves.length === 0 &&
    pendingWeekMoveDeletes.length === 0
  ) {
    state.syncStatus = 'synced';
    updateSyncIndicator();
    return;
  }
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  let allOk = true;
  for (const entry of pendingLogs) {
    // v53: an edited-after-the-fact row PATCHes an existing server row; a
    // brand-new session POSTs one. See patchSessionRequest's comment for why
    // the two can never share one code path.
    const ok = entry.pendingEdit ? await patchLogToSupabase(entry) : await pushLogToSupabase(entry);
    if (!ok) allOk = false;
  }
  for (const period of pendingPeriods) {
    await pushCyclePeriod(period); // marks synced:true in localStorage on success
  }
  if (loadCyclePeriods().some((p) => !p.synced)) allOk = false;
  for (const move of pendingWeekMoves) {
    await pushWeekMove(move); // marks synced:true in localStorage on success
  }
  for (const tombstone of pendingWeekMoveDeletes) {
    await deleteWeekMove(tombstone.round, tombstone.week); // drops the tombstone in localStorage on success
  }
  if (loadWeekMoves().some((m) => !m.synced)) allOk = false;
  state.syncStatus = allOk ? 'synced' : 'offline';
  updateSyncIndicator();
}

function updateSyncIndicator(): void {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.textContent = syncIndicatorText();
  el.className = `sync-indicator sync-${state.syncStatus}`;
}

function syncIndicatorText(): string {
  // v50 · fix (Sep 25 2026): pending cycle-period rows count toward the
  // indicator too — see flushPendingSyncs above. WK3 (Sep 27 2026): same for
  // a pending week_moves row.
  const pending =
    loadLogs().filter((l) => !l.synced).length +
    loadCyclePeriods().filter((p) => !p.synced).length +
    loadWeekMoves().filter((m) => !m.synced).length;
  if (state.syncStatus === 'syncing') return 'syncing…';
  if (pending > 0) return `offline · ${pending} pending`;
  // v48 · P4 (Sep 24 2026): "synced ✓" hides — it was a third status line above
  // the first action (assumptions, Kill). The word shows only when something
  // is syncing or waiting, which is exactly when it matters.
  return '';
}

// ---------- formatting ----------

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// The big countdown face. Holds are all under a minute so they keep reading as
// bare seconds; the apartment-cardio timer runs 10-25 minutes, where a raw
// "600" reads as nonsense — those show as m:ss.
function formatTimerDisplay(sec: number): string {
  if (sec < 60) return String(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatWeekRange(start: Date, end: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = `${months[start.getMonth()]} ${start.getDate()}`;
  const endStr = sameMonth ? `${end.getDate()}` : `${months[end.getMonth()]} ${end.getDate()}`;
  return `${startStr}–${endStr}`;
}

// Week dots (group 2J): one entry per weekday. Color is the workout letter.
type WeekDotInfo = {
  letter: string;
  logId: string | null;
  date: Date;
  workout: AnyWorkoutId | null;
};

// Which week the user is currently looking at on the home screen. 0 = this
// (current) Sat-Fri week. 1 = one week ago. Etc. Module-level — purely UI state.
let viewedWeekOffset = 0;

// (v48 · P6, Sep 24 2026: swungOutOfWeek() retired — its one reader, the
// "Sat counted for last week" note on the Week-by-week summary, is gone; home's
// week line names the swing in words.)

// WK2 fix r1 (Sep 27 2026, must #2): the offset-based dots every existing
// caller reads, factored out so lastClosedWeekForPeek's legacy fallback below
// can ask for a FIXED Saturday instead of "however many weeks back from
// whatever today is" (see weekDotsForSaturday's own comment for why that
// distinction matters).
function weekDotsForSaturday(
  saturday: Date,
  withSwingSaturday = false,
  attributed = false
): WeekDotInfo[] {
  const logs = loadLogs();
  // Allison's week = Sat..Fri (Shabbat-anchored). See memory
  // `reference_week_definition.md`. Saturday is index 0; Friday is index 6.
  const dotLabels = ['S', 'S', 'M', 'T', 'W', 'T', 'F'];
  // Her idea (Sep 26): "show 8 days … like two Saturday" — on a swing Saturday
  // the week gets its 8th day, tonight, and only sessions that COUNT for that
  // week get a dot (the first Saturday's session may have swung to the week
  // before it).
  if (withSwingSaturday) dotLabels.push('S');
  const attribution = withSwingSaturday || attributed ? attributeSessionsToWeeks(logs) : null;

  return dotLabels.map((label, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const hit = logs.find((l) => {
      const t = new Date(l.date).getTime();
      if (attribution && attribution.get(l) !== saturday.getTime()) return false;
      return t >= start.getTime() && t <= end.getTime();
    });
    return {
      letter: label,
      logId: hit?.id ?? null,
      date: d,
      workout: hit?.workout ?? null,
    };
  });
}

function getWeekDots(offset = 0, withSwingSaturday = false, attributed = false): WeekDotInfo[] {
  return weekDotsForSaturday(saturdayForOffset(offset), withSwingSaturday, attributed);
}

// Count sessions in the Sat-Fri week `offset` weeks back.
function getWeekCount(offset = 0): number {
  // Swing-aware (v42): a Saturday session may count toward the week before.
  return sessionsAttributedTo(loadLogs(), saturdayForOffset(offset)).length;
}

// WK2 (Sep 27 2026): factored out of renderHome's pre-launch branch so the
// "‹ Week 4" peek (§8c amendment) can reuse the exact same OLD-model dots
// when there's no COMPLETION-model week closed yet to peek at (see
// lastClosedWeekForPeek below) — the very first time she'd ever tap it.
function renderLegacyWeekDots(weekDots: WeekDotInfo[]): string {
  return weekDots
    .map((d) => {
      const isToday = localIsoDate(d.date) === localIsoDate(new Date());
      const cls =
        (d.workout ? `dot dot-${d.workout}` : 'dot dot-empty') + (isToday ? ' is-today' : '');
      const clickAttr = d.logId ? `data-detail="${escapeHtml(d.logId)}"` : '';
      return `
        <button class="week-dot ${cls}" ${clickAttr} type="button" ${d.logId ? '' : 'tabindex="-1"'} aria-label="${d.letter} ${formatDate(d.date.toISOString())}${d.workout ? ` workout ${d.workout}` : ' no workout'}">
          <span class="week-dot-label">${d.letter}</span>
          <span class="week-dot-bubble">${d.workout ?? ''}</span>
        </button>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// THE COMPLETION-BASED WEEK MODEL (WK2, Sep 27 2026) — week.ts, wired in.
// PLAN-2026-09-26.md §2: "once all three are done then it can go to the next
// week" (her 21:28), amended 23:14-23:16 to anchor a week's start to a
// Saturday/Sunday. WK1 built week.ts as a pure, tested module; this is the
// UI seam (Home, pre-log, post-log only — WK2's scope). Everything BEFORE
// COMPLETION_WEEKS_FROM keeps reading through attributeSessionsToWeeks /
// homeWeekOffset exactly as it always has (untouched, on purpose — the
// weekly-review pager, Progress weeks, Settings and the saved-session plan
// lookup are WK4's job, not this one's). "Now" is always after the launch
// instant (2026-09-26T22:30, already past), so Home/pre-log/post-log — which
// only ever show the CURRENT moment — read the new model exclusively.
// ---------------------------------------------------------------------------

/** §2.4's quiet week-card button: her explicit "Move on without it" tap.
 * Optimistic local write first (offline-safe, same as every other save in
 * this app), then pushed if a network is allowed — never network-first (the
 * tap must never silently do nothing on a bad connection). */
function moveOnWithoutIt(key: WeekKey, missing: readonly string[]): void {
  const move: StoredWeekMove = {
    round: key.round,
    week: key.week,
    at: new Date().toISOString(),
    missing: missing.join(''),
    // Sep 27 fix: always false on write, like every other save in this app
    // (logLog's `synced: false` at line 3333, logWalk's at 3575) — the push
    // below (pushWeekMove) already has its own `if (syncDisabled()) return`
    // guard, so no network is ever attempted under automation. Marking it
    // synced HERE too was a bug: it made a "Move on" tap silently skip the
    // offline queue under test automation, unlike every other save path.
    synced: false,
  };
  writeWeekMoves([
    move,
    ...loadWeekMoves().filter(
      (m) => weekMoveKey(m.round, m.week) !== weekMoveKey(key.round, key.week)
    ),
  ]);
  void pushWeekMove(move);
  render();
}

/** §2.4's Undo. Live only "for the rest of that day" (todaysWeekMove below is
 * date-driven, not a timer), so there's no undo window to manage: the button
 * simply stops rendering once local midnight passes, same as the note above
 * it.
 *
 * WK3 fix r1 (checker must #1, Sep 27 2026): this used to just filter the row
 * out locally and fire-and-forget a DELETE. If she'd tapped Move on while
 * online (row already reached Supabase), or the DELETE failed, or a push was
 * still in flight, the next pull merged the remote row straight back in as
 * synced:true — the week moved on again with no tap of hers, and past
 * midnight there was no Undo left to fix it. Now it queues like any other
 * offline write: a tombstone (deleted:true, synced:false) replaces the row
 * instead of just removing it, so a pull can't resurrect what she just
 * undid, and the real DELETE keeps retrying (flushPendingSyncs) until
 * Supabase confirms it — only then does the tombstone itself disappear. */
function undoWeekMove(move: StoredWeekMove): void {
  const tombstone: StoredWeekMove = { ...move, deleted: true, synced: false };
  writeWeekMoves([
    tombstone,
    ...loadWeekMoves().filter(
      (m) => weekMoveKey(m.round, m.week) !== weekMoveKey(move.round, move.week)
    ),
  ]);
  void deleteWeekMove(move.round, move.week);
  render();
}

/** The move (if any) she made TODAY — drives §2.4's moved-note under the
 * header. Date-driven on purpose: the note (and its Undo) stops appearing
 * once local midnight passes, with no timer to leak or clear. */
function todaysWeekMove(): StoredWeekMove | null {
  const today = localIsoDate(new Date());
  // WK3 fix r1: a pending Undo tombstone is not "today's move" — it's the
  // opposite (a move being un-done). Skipping it here means the moved-note +
  // its own Undo button both disappear the instant she taps Undo, not just
  // once the real DELETE eventually confirms.
  return loadWeekMoves().find((m) => !m.deleted && localIsoDate(new Date(m.at)) === today) ?? null;
}

/** What "‹ Week 4" (§8c amendment) peeks at: a plain weekNum + rendered dots
 * + count line, from WHICHEVER model actually closed that week. */
type WeekPeek = { weekNum: number; dotsHtml: string; countText: string };

/** The legacy calendar/swing model's own last completed week — always Week 4
 * (the fixed instant above), never "whatever today happens to be minus a
 * week". See LEGACY_LAST_CLOSED_WEEK_INSTANT's own comment. */
function legacyLastClosedWeekPeek(): WeekPeek | null {
  const legacyWeek = getProgramWeek(LEGACY_LAST_CLOSED_WEEK_INSTANT);
  // A break/sick week isn't a "Week N" worth peeking at this way — Sessions/
  // Progress (WK4) are where those already live.
  if (legacyWeek.skippedLabel) return null;
  const logs = loadLogs();
  const attribution = attributeSessionsToWeeks(logs);
  const legacyCount = sessionsAttributedTo(logs, legacyWeek.start, attribution).length;
  return {
    weekNum: legacyWeek.num,
    dotsHtml: renderLegacyWeekDots(weekDotsForSaturday(legacyWeek.start, true, true)),
    countText: `${legacyCount} of 3${legacyCount >= SESSIONS_PER_WEEK_TARGET ? ' ✓' : ''}`,
  };
}

/** The most recently CLOSED week to peek at — the completion model's own
 * last closed span once one exists, OR (the very first time she'd ever tap
 * this — her literal ask, 23:08, was made on exactly this state: Week 5 just
 * opened, nothing of Week 5's has closed yet) the OLD calendar/swing model's
 * last completed week, i.e. Week 4, closed the night before the real launch.
 * That fallback only ever matters until the FIRST new week closes; after
 * that, spans is never empty again and this always reads the new model. */
function lastClosedWeekForPeek(): WeekPeek | null {
  const model = weekModel();
  const { spans } = model;
  const lastSpan = spans.length ? (spans[spans.length - 1] ?? null) : null;
  if (lastSpan) {
    const dLogs = loadLogs().filter((l) => l.workout === 'D');
    // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 must #1): the peek's
    // own dot strip now shares `lastSpan`'s exact window with the count
    // line below it — see completionWeekDots' own header.
    const lastSpanTarget: DWeekTarget = { kind: 'span', key: lastSpan.key };
    const lastSpanWindow = weekWindowFor(lastSpanTarget, model);
    return {
      weekNum: lastSpan.key.week,
      dotsHtml: renderCompletionWeekDots(completionWeekDots(lastSpan, dLogs, lastSpanWindow)),
      countText: weekCountLine({ span: lastSpan }, weekHasDFor({ span: lastSpan }, model, dLogs)),
    };
  }
  return legacyLastClosedWeekPeek();
}

// Module-level UI state: is Home showing the last CLOSED week instead of the
// current open/pending one? Set by tapping "‹ Week 4"; cleared by "Week 5 ›"
// (§8c: "the same link becomes 'Week 5 ›' to return"). Purely a view toggle —
// never changes what week a new session counts toward or trains.
let viewingLastClosedWeek = false;

// v61 (Sep 28 2026), spec item d — her words 15:35, looking at her first
// Workout D: "she did not say one of four." D never counts toward the week
// CLOSING (week.ts's own completion rule is untouched — three distinct
// A/B/C letters, D never required, never part of `span.missing`), but it
// DOES count toward the number shown to her. week.ts drops D entirely by
// design (its own header comment), so this reads it straight off her logs
// instead.
//
// v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 must #1): the window a D
// counts against moved out of here into week-d.ts (a pure module, unit-
// tested — round 1's should #7) — a strict [openedAt, closedAt] window
// undercounted a D logged before the opening session or after the closing
// one, both real on her rows. `weekHasDFor` below is a thin app.ts-side
// wrapper: it builds the `DWeekTarget` week-d.ts needs from whichever of
// `span`/`open`/`pending` a call site already has in hand, so every call
// site below only changes its OWN local target-selection, never the window
// math itself (that lives once, in week-d.ts, covered by its own tests).
function weekHasDFor(
  which: { span: WeekSpan } | { open: WeekSpan } | { pending: true } | null,
  model: DWeekModel,
  dLogs: readonly WeekDLogLite[]
): boolean {
  if (!which) return false;
  const target: DWeekTarget =
    'open' in which
      ? { kind: 'open' }
      : 'pending' in which
        ? { kind: 'pending' }
        : { kind: 'span', key: which.span.key };
  return weekHasD(target, model, dLogs);
}

/** The {kind:'open'|'pending'} target for whichever week is LIVE right now
 * (never a specific past span — that's always `{span: ...}` at its own call
 * site) — `shown.span` set means an open week exists; `shown.pending` set
 * (mid-gap, nothing open yet) means the pending week itself owns any D from
 * its own anchor forward (week-d.ts's whole point — see its header). Both
 * null (the "shouldn't happen" launch-fallback week.ts's own comment names)
 * falls through to `weekHasDFor(null, ...)` → false, same as always. */
function liveWeekDTarget(shown: {
  span: WeekSpan | null;
  pending: PendingWeek | null;
}): { span: WeekSpan } | { open: WeekSpan } | { pending: true } | null {
  if (shown.span) return { open: shown.span };
  if (shown.pending) return { pending: true };
  return null;
}

type CompletionWeekDot =
  | {
      kind: 'day';
      date: Date;
      workout: AnyWorkoutId | null;
      logId: string | null;
      isToday: boolean;
      // WK2 fix r1 (Sep 27 2026, checker's should #4): how many sessions
      // landed on this day — 1 in the ordinary case, 2+ on a repeat day (a
      // Lite make-up, or "log what I did" logged after the fact alongside a
      // same-day session). `workout`/`logId` still name the FIRST one
      // chronologically (unchanged tap target); this is only the honest count.
      sessionCount: number;
      // v61 (Sep 28 2026), spec item b: "the week strip shows a D dot on the
      // day D was done — distinct from the A/B/C dot" (the v54 spec asked for
      // it; it wasn't showing — week.ts drops D from `span.sessions` on
      // purpose, so this reads the raw D logs given to completionWeekDots
      // separately, never from `span` itself).
      hasD: boolean;
      dLogId: string | null;
    }
  | { kind: 'fold' };

/** One column per day since the shown week opened (§2.4's week strip,
 * generalised for the Sat/Sun-anchor amendment — her own "show 8 days" ask
 * becomes "exactly as long as the week"). WK2 fix r1 (Sep 27 2026, checker's
 * should #4): a week running past 10 days used to just CUT the earliest
 * columns — including session days, which could make the count read "1 of 3"
 * with no dot anywhere to back it up. Now it keeps every day that has a
 * session PLUS the most recent 7 days, and folds any empty run in between
 * into a single "…" column (§2.4's original shape) instead of dropping real
 * session days silently.
 *
 * `window` (Oct 2 2026, v61 fix pass 3, CHECK-v61.md round 3 must #1, fix
 * (b)): the SAME `[start, end)` week-d.ts's `weekHasD`/`weekCountLine` use
 * for the "N of 4" count — passed by the caller (built via `weekWindowFor`
 * from whichever `DWeekTarget` this span is) rather than recomputed from
 * `span.openedAt` alone, so the dot strip can never disagree with the count
 * about which week a D belongs to. Two things changed because of it:
 *   - a D only lights up a day's dot when it falls INSIDE this window, not
 *     merely on the same calendar day — a Sat/Sun close can put two weeks'
 *     own columns on the exact same calendar day (see week-d.ts's header),
 *     and only one of them owns any given D.
 *   - for a CLOSED span (`window.end` non-null), the strip stops at the
 *     window's own end day, not "today" — it used to keep running past the
 *     week's own close and pick up days that already belong to the NEXT
 *     week. An OPEN/PENDING span's window is unbounded (`end: null`), so
 *     those still run to today exactly as before. */
function completionWeekDots(
  span: WeekSpan,
  dLogs: readonly LogEntry[] = [],
  window: { start: number; end: number | null } | null = null
): CompletionWeekDot[] {
  const win = window ?? { start: new Date(span.openedAt).getTime(), end: null };
  const toMidnight = (ms: number): Date => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const openedMid = toMidnight(win.start);
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // A closed span's strip never runs past its own window's end day. `end`
  // is exclusive, but it is NOT always midnight-aligned — a Sat/Sun close's
  // own prev-close clamp (weekWindowFor's own header) can leave `end` sitting
  // at the close's own mid-day instant (e.g. Saturday 12:00), not that day's
  // midnight. That calendar day still belongs PARTLY to this window (00:00
  // up to the close), so it has to stay a real column — only drop it
  // entirely when `end` lands exactly ON that day's own midnight (the
  // ordinary anchor-floored case, where the day truly has nothing before
  // the next week starts).
  const lastDayMid =
    win.end === null
      ? todayMid
      : (() => {
          const endMid = toMidnight(win.end);
          const endIsExactlyMidnight = endMid.getTime() === win.end;
          const candidate = endIsExactlyMidnight
            ? (() => {
                const d = new Date(endMid);
                d.setDate(d.getDate() - 1);
                return d;
              })()
            : endMid;
          return candidate.getTime() < todayMid.getTime() ? candidate : todayMid;
        })();
  const totalDays = Math.max(
    1,
    Math.round((lastDayMid.getTime() - openedMid.getTime()) / 86_400_000) + 1
  );

  const inWindow = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= win.start && (win.end === null || t < win.end);
  };

  const dayCol = (i: number): { i: number; col: CompletionWeekDot; hasSession: boolean } => {
    const d = new Date(openedMid);
    d.setDate(d.getDate() + i);
    const sameDay = (iso: string): boolean => {
      const sd = new Date(iso);
      return (
        sd.getFullYear() === d.getFullYear() &&
        sd.getMonth() === d.getMonth() &&
        sd.getDate() === d.getDate()
      );
    };
    const hits = span.sessions.filter((s) => sameDay(s.date));
    const dHits = dLogs.filter((l) => sameDay(l.date) && inWindow(l.date));
    const first = hits[0];
    return {
      i,
      hasSession: hits.length > 0 || dHits.length > 0,
      col: {
        kind: 'day',
        date: d,
        workout: first?.workout ?? null,
        logId: first?.id ?? null,
        isToday: d.getTime() === todayMid.getTime(),
        sessionCount: hits.length,
        hasD: dHits.length > 0,
        dLogId: dHits[0]?.id ?? null,
      },
    };
  };

  if (totalDays <= 10) {
    const cols: CompletionWeekDot[] = [];
    for (let i = 0; i < totalDays; i++) cols.push(dayCol(i).col);
    return cols;
  }

  const keepFromIdx = totalDays - 7; // the most recent 7 days are always kept
  const cols: CompletionWeekDot[] = [];
  let pendingFold = false;
  for (let i = 0; i < totalDays; i++) {
    const day = dayCol(i);
    if (day.hasSession || i >= keepFromIdx) {
      if (pendingFold) {
        cols.push({ kind: 'fold' });
        pendingFold = false;
      }
      cols.push(day.col);
    } else {
      pendingFold = true;
    }
  }
  return cols;
}

const COMPLETION_DOT_WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function renderCompletionWeekDots(cols: CompletionWeekDot[]): string {
  return cols
    .map((c) => {
      if (c.kind === 'fold') {
        // A different class than the real day columns on purpose (never
        // `.week-dot` — every existing `.week-card .week-dot` count assumes
        // one entry per REAL day; a fold marker isn't one).
        return `
        <span class="week-fold-col" aria-hidden="true">
          <span class="week-dot-label">…</span>
        </span>
      `;
      }
      const letter = COMPLETION_DOT_WEEKDAY_LETTERS[c.date.getDay()];
      const cls =
        (c.workout ? `dot dot-${c.workout}` : 'dot dot-empty') + (c.isToday ? ' is-today' : '');
      const clickAttr = c.logId ? `data-detail="${escapeHtml(c.logId)}"` : '';
      // WK2 fix r1 (should #4): a small "2" badge when a second session landed
      // the same day — an honest count, not a second tap target.
      const countBadge =
        c.sessionCount >= 2
          ? `<span class="week-dot-count" aria-hidden="true">${c.sessionCount}</span>`
          : '';
      // v61 (Sep 28 2026), spec item b: a small D dot, distinct from the
      // A/B/C bubble above it — the v54 spec asked for this and it never
      // rendered (week.ts drops D from `span.sessions`, the only thing this
      // function used to read).
      const dDot = c.hasD
        ? `<span class="week-dot-d" data-detail-d="${c.dLogId ? escapeHtml(c.dLogId) : ''}" aria-hidden="true">D</span>`
        : '';
      return `
        <button class="week-dot ${cls}" ${clickAttr} type="button" ${c.logId ? '' : 'tabindex="-1"'} aria-label="${letter} ${formatDate(c.date.toISOString())}${c.workout ? ` workout ${c.workout}` : ' no workout'}${c.sessionCount >= 2 ? `, ${c.sessionCount} sessions` : ''}${c.hasD ? ', plus Workout D' : ''}">
          <span class="week-dot-label">${letter}</span>
          <span class="week-dot-bubble">${c.workout ?? ''}</span>
          ${countBadge}
          ${dDot}
        </button>
      `;
    })
    .join('');
}

// ---------- visual layer (group 3) ----------

// Primary on-screen still for an exercise: the curated loop JPG if we have one,
// otherwise the first how-to illustration (SVG/JPG). Allison 2026-06-06: every
// actual exercise should show a PICTURE — not just a "watch video" poster —
// AND keep its video. Every real exercise has a how-to frame, so this gives
// picture + video coverage without sourcing new assets.
function getPrimaryStill(exerciseName: string): { svg: string } | { image: string } | null {
  const v = EXERCISE_VISUALS[exerciseName];
  if (v?.loop) return { image: v.loop };
  const frame = EXERCISE_HOWTO[exerciseName]?.frames?.[0];
  if (frame?.svg) return { svg: frame.svg };
  if (frame?.image) return { image: frame.image };
  return null;
}

// One-time kit setup for THIS week's version of an exercise (v37). Opens by
// default the first time she meets it — a step she has not done yet should not
// be hidden behind a tap — and remembers being closed for the rest of the
// session. Its video is a SECOND video, separate from the movement video in
// EXERCISE_VISUALS, because tying a band and doing a clamshell are two things.
function renderExerciseSetup(ex: Exercise): string {
  const s = ex.setup;
  if (!s) return '';
  const key = `setup:${ex.name}`;
  const open = state.openSections[key] !== false; // default OPEN
  const videoOpen = state.videoExpandedFor === key;
  const stepsHtml = s.steps.map((t) => `<li>${t}</li>`).join('');
  return `
    <div class="setup-block${open ? ' setup-block-open' : ''}">
      <button class="setup-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${open}">
        <span class="setup-toggle-title">🔧 ${escapeHtml(s.title)}</span>
        <span class="setup-toggle-chev">${open ? '▾' : '▸'}</span>
      </button>
      ${
        open
          ? `<div class="setup-body">
        <ol class="setup-steps">${stepsHtml}</ol>
        ${s.footnote ? `<p class="setup-footnote">${s.footnote}</p>` : ''}
        ${
          s.youtubeId
            ? `<button class="visual-video-toggle" data-expand-video="${escapeHtml(key)}" type="button" aria-expanded="${videoOpen}">
                ${videoOpen ? '× Hide the video' : '▶ Watch someone do it (40 sec)'}
              </button>
              ${
                videoOpen
                  ? `<div class="visual-video-wrap">
                      <iframe
                        src="https://www.youtube.com/embed/${escapeHtml(s.youtubeId)}?rel=0&modestbranding=1"
                        title="${escapeHtml(s.title)}"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        loading="lazy"
                      ></iframe>
                    </div>`
                  : ''
              }
              ${s.attribution ? `<div class="visual-attribution">${escapeHtml(s.attribution)}</div>` : ''}`
            : ''
        }
      </div>`
          : ''
      }
    </div>
  `;
}

// `compact` (v48, Sep 24 2026): one quiet "▶ Watch how it looks" row that
// expands on tap — used from round 2 on (she has just done the move; walk:
// "Round 2 notes closed") and ALWAYS for moves with no still, where the old
// face was a 342×257 black poster with a play icon (split squat, bird dog).
function renderExerciseVisual(exerciseName: string, compact = false): string {
  const v = EXERCISE_VISUALS[exerciseName];
  const still = getPrimaryStill(exerciseName);
  const youtubeId = v?.youtubeId;

  // Nothing to show at all.
  if (!still && !youtubeId) return '';

  const isExpanded = state.videoExpandedFor === exerciseName;
  const safeAlt = escapeHtml(`${exerciseName} — exercise demonstration`);
  const attribution = v?.attribution ? escapeHtml(v.attribution) : '';

  const stillMarkup = still
    ? 'svg' in still
      ? `<div class="exercise-visual-still exercise-visual-still-svg">${still.svg}</div>`
      : `<img class="exercise-visual-still" src="${escapeHtml(still.image)}" alt="${safeAlt}" loading="lazy" />`
    : '';

  const videoIframe = youtubeId
    ? `<div class="visual-video-wrap">
        <iframe
          src="https://www.youtube.com/embed/${escapeHtml(youtubeId)}?rel=0&modestbranding=1"
          title="${safeAlt}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>`
    : '';

  // v48: the compact row (round 2+, or no still to show). Open = the picture
  // (if any) and the video together, closed = one quiet line.
  if (compact || !still) {
    return `
      <div class="exercise-visual exercise-visual-compact">
        <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
          ${isExpanded ? '× Hide' : '▶ Watch how it looks'}
        </button>
        ${isExpanded ? `${stillMarkup}${videoIframe}` : ''}
        ${isExpanded && attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
  }

  // Still picture (trusted inline SVG, or a curated/illustration JPG). Shown as
  // the primary visual; the video sits behind a "Watch full video" expander.
  // (v48: the no-still video POSTER that used to follow is gone — a still-less
  // move takes the compact row above. Autoplay stays off: the embed loads on tap.)
  const videoBlock = youtubeId
    ? `
      <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
        ${isExpanded ? '× Hide video' : '▶ Watch full video'}
      </button>
      ${isExpanded ? videoIframe : ''}`
    : '';

  return `
      <div class="exercise-visual">
        ${stillMarkup}
        ${videoBlock}
        ${attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
}

function renderHowToFrame(frame: HowToFrame, idx: number, exerciseName: string): string {
  const safeAlt = escapeHtml(`${exerciseName} — frame ${idx + 1}`);
  // Visual: either an <img> or inline SVG. SVG is trusted (hand-coded in our
  // own source) so we render it directly.
  const visualHtml = frame.svg
    ? `<div class="howto-frame-visual howto-frame-visual-svg">${frame.svg}</div>`
    : frame.image
      ? `<div class="howto-frame-visual"><img src="${escapeHtml(frame.image)}" alt="${safeAlt}" loading="lazy" /></div>`
      : '<div class="howto-frame-visual howto-frame-visual-empty"></div>';

  return `
    <div class="howto-frame">
      ${visualHtml}
      <div class="howto-frame-text">
        <div class="howto-cue howto-cue-do">
          <span class="howto-cue-icon" aria-hidden="true">✓</span>
          <span class="howto-cue-label">Do:</span>
          <span class="howto-cue-body">${escapeHtml(frame.do)}</span>
        </div>
        ${
          frame.avoid
            ? `<div class="howto-cue howto-cue-avoid">
            <span class="howto-cue-icon" aria-hidden="true">✗</span>
            <span class="howto-cue-label">Avoid:</span>
            <span class="howto-cue-body">${escapeHtml(frame.avoid)}</span>
          </div>`
            : ''
        }
      </div>
    </div>
  `;
}

// ---------- per-exercise voice note (Allison Jul 9 2026) ----------
// One <audio> plays at a time. The button toggles play/pause; button visuals
// reflect playback and are re-synced after a re-render (opening a dropdown
// re-renders the card, but the detached Audio keeps playing).
let voiceAudio: HTMLAudioElement | null = null;
let voiceAudioSrc: string | null = null;

function setVoiceBtnPlaying(btn: HTMLElement, playing: boolean): void {
  btn.classList.toggle('voice-note-playing', playing);
  const icon = btn.querySelector('.voice-note-icon');
  const label = btn.querySelector('.voice-note-label');
  if (icon) icon.textContent = playing ? '⏸' : '▶';
  if (label) label.textContent = playing ? 'Playing… (tap to stop)' : 'Listen — how to do it';
}

function stopVoiceNote(): void {
  if (voiceAudio) {
    voiceAudio.pause();
    voiceAudio = null;
  }
  voiceAudioSrc = null;
}

function toggleVoiceNote(btn: HTMLButtonElement, src: string): void {
  if (typeof Audio === 'undefined') return; // no audio in this environment
  // Same note already playing → stop it.
  if (voiceAudio && voiceAudioSrc === src && !voiceAudio.paused) {
    voiceAudio.pause();
    return;
  }
  stopVoiceNote(); // stop any other note first
  const audio = new Audio(src);
  voiceAudio = audio;
  voiceAudioSrc = src;
  audio.addEventListener('play', () => setVoiceBtnPlaying(btn, true));
  // v48 (Sep 24 2026): count each play that actually STARTS (a stop is not a
  // play; an autoplay-blocked tap never fires this). Her words: "I can hear
  // details in audio better"; Gemini said she never plays them — count instead
  // of guessing. Each tap makes a fresh Audio, so `once` = one count per play.
  audio.addEventListener(
    'play',
    () => {
      state.voicePlays += 1;
      saveActiveSession();
    },
    { once: true }
  );
  audio.addEventListener('pause', () => setVoiceBtnPlaying(btn, false));
  audio.addEventListener('ended', () => setVoiceBtnPlaying(btn, false));
  void audio.play().catch(() => {
    /* gesture/autoplay policy — safe to ignore, she can tap again */
  });
}

// One collapsed dropdown inside the enriched detail card. Closed by default;
// its open-state lives in state.openSections keyed "<exercise>::<section>".
function renderDetailSection(
  exerciseName: string,
  sectionKey: string,
  label: string,
  icon: string,
  innerHtml: string
): string {
  const key = `${exerciseName}::${sectionKey}`;
  const isOpen = !!state.openSections[key];
  return `
    <div class="detail-section ${isOpen ? 'detail-section-open' : ''}">
      <button class="detail-section-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${isOpen}">
        <span class="detail-section-label"><span class="detail-section-icon" aria-hidden="true">${icon}</span> ${escapeHtml(label)}</span>
        <span class="detail-chev" aria-hidden="true">▸</span>
      </button>
      ${isOpen ? `<div class="detail-section-body">${innerHtml}</div>` : ''}
    </div>`;
}

// The enriched, low-overwhelm detail card (Allison Jul 9 2026). Face shows only
// the important, low-reading things — the ▶ voice note + the muscle-target
// picture. Steps / Do & Don't / Common mistakes are each a collapsed dropdown
// she taps to open. See exercise-detail.ts for the "why".
function renderDetailCard(exerciseName: string): string {
  const d = EXERCISE_DETAIL[exerciseName];
  if (!d) return '';

  const stepsHtml = `<ol class="detail-steps">${d.steps
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('')}</ol>`;

  const doDontHtml = `<ul class="detail-cues">${d.dos
    .map(
      (x) =>
        `<li class="detail-cue-do"><span class="detail-cue-mark" aria-hidden="true">✓</span>${escapeHtml(x)}</li>`
    )
    .join('')}${d.donts
    .map(
      (x) =>
        `<li class="detail-cue-dont"><span class="detail-cue-mark" aria-hidden="true">✗</span>${escapeHtml(x)}</li>`
    )
    .join('')}</ul>`;

  const mistakesHtml = `<ul class="detail-mistakes">${d.mistakes
    .map(
      (m) =>
        `<li><span class="detail-mistake">${escapeHtml(m.mistake)}</span><span class="detail-fix">${escapeHtml(m.fix)}</span></li>`
    )
    .join('')}</ul>`;

  return `
    <div class="detail-card">
      <div class="detail-face">
        <button class="voice-note-btn is-secondary" data-voice-src="${escapeHtml(d.voiceSrc)}" type="button">
          <span class="voice-note-icon" aria-hidden="true">▶</span>
          <span class="voice-note-label">Listen — how to do it</span>
        </button>
        <div class="muscle-target">
          <div class="muscle-target-diagram">${muscleDiagram(d.muscles)}</div>
          <div class="muscle-target-label"><span class="muscle-target-title">Targets</span>${escapeHtml(d.muscleLabel)}</div>
        </div>
      </div>
      ${renderDetailSection(exerciseName, 'steps', 'Steps', '🔢', stepsHtml)}
      ${renderDetailSection(exerciseName, 'dodont', "Do & Don't", '✓', doDontHtml)}
      ${renderDetailSection(exerciseName, 'mistakes', 'Common mistakes', '⚠️', mistakesHtml)}
    </div>`;
}

function renderHowToCard(exerciseName: string): string {
  // Prefer multi-frame visual how-to. Fall back to legacy EXERCISE_GUIDE text
  // if the exercise hasn't been mapped to EXERCISE_HOWTO yet (archive-not-
  // delete principle: EXERCISE_GUIDE stays in source as a permanent fallback).
  const howto = EXERCISE_HOWTO[exerciseName];
  const guide = EXERCISE_GUIDE[exerciseName];
  if (!howto && !guide) return '';

  // First-time-this-week → open by default. After that, collapsed.
  // WK4 (Sep 27 2026): currentHowToWeekKey() branches pre/post-launch — see
  // its own comment next to howToWeekKey.
  const week = currentHowToWeekKey();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${howToWeekKey(week)}`;
  let seen: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw) as Record<string, boolean>;
  } catch {
    seen = {};
  }
  const isFirstThisWeek = !seen[exerciseName];
  const userOpened = state.howToOpenFor === exerciseName;
  const userClosed = state.howToOpenFor === `__closed__${exerciseName}`;
  // Ship 6: respect "Show how-to expanded first time per week" setting (default
  // on). If off, never auto-expand — only show when user explicitly opens.
  // v48 (Sep 24 2026): never auto-open from round 2 on — she has just done the
  // move (walk-in-her-shoes: "Round 2 notes closed").
  const autoExpand = getHowToFirstExpand() && !isLaterRound();
  const isOpen = userOpened || (autoExpand && isFirstThisWeek && !userClosed);

  const innerHtml = howto
    ? `<div class="howto-frames">
        ${howto.frames.map((f, i) => renderHowToFrame(f, i, exerciseName)).join('')}
      </div>`
    : guide
      ? `<p class="how-to-text">${escapeHtml(guide.howTo)}</p>`
      : '';

  return `
    <div class="how-to-card ${isOpen ? 'how-to-open' : ''}">
      <button class="how-to-toggle" data-toggle-howto="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isOpen}">
        <span>📖 How to do it</span>
        <span class="how-to-chev">▸</span>
      </button>
      ${isOpen ? innerHtml : ''}
    </div>
  `;
}

// Rounds repeat week numbers, so the localStorage seen-key needs the round in
// it from round 2 on. Round-1 keys stay bare numbers (backwards compatible).
function howToWeekKey(week: { num: number; round: number }): string {
  return week.round > 1 ? `r${week.round}-${week.num}` : `${week.num}`;
}

function markHowToSeenThisWeek(exerciseName: string): void {
  const week = currentHowToWeekKey();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${howToWeekKey(week)}`;
  let seen: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw) as Record<string, boolean>;
  } catch {
    seen = {};
  }
  seen[exerciseName] = true;
  try {
    localStorage.setItem(seenKey, JSON.stringify(seen));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

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

// Returns the last N wall-sit values from history (oldest → newest), filtered
// to values > 0. We walk in reverse-history-order (newest first), then reverse
// back to oldest-first so the sparkline draws left → right chronologically.
function getWallSitTrend(allLogs: LogEntry[], uptoLogId: string | null, max = 10): number[] {
  // logs are stored newest-first. We want all logs up-to-and-including the
  // current row, then take the last N (chronologically).
  let upto = allLogs;
  if (uptoLogId) {
    const idx = allLogs.findIndex((l) => l.id === uptoLogId);
    if (idx >= 0) upto = allLogs.slice(idx); // newest-first slice from this row backwards in time
  }
  // v49 · look fix (Sep 25 2026): honestWallSitLogs() — same real-measurement
  // filter as Home's Start → Now card (see its comment above honestWallSitLogs),
  // so the Sessions sparkline can't show a pre-v45 prescribed number as data.
  const wallSits = honestWallSitLogs(upto)
    .map((l) => l.wallSitSec)
    .reverse(); // now oldest → newest
  if (wallSits.length <= max) return wallSits;
  return wallSits.slice(wallSits.length - max);
}

// Inline SVG sparkline. Returns '' if fewer than 2 points (flat-line reads
// broken). The current row's value is the rightmost point and gets a filled
// dot. v48 · P6 (Sep 24 2026): that dot is --text, not sage — sage means "the
// primary action right now" (DECISIONS §5, one sage per screen).
function renderSparkline(values: number[]): string {
  if (values.length < 2) return '';

  const W = 80;
  const H = 20;
  const PAD = 2; // breathing room so end dot isn't clipped

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const stepX = (W - 2 * PAD) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = PAD + i * stepX;
    // SVG y axis inverted; higher value = higher on chart = lower y
    const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
    return [x, y];
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x?.toFixed(1)} ${y?.toFixed(1)}`)
    .join(' ');

  const lastPoint = points[points.length - 1];
  if (!lastPoint) return '';
  const [lx, ly] = lastPoint;

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const direction = last > first ? 'trending up' : last < first ? 'trending down' : 'holding';
  const label = `wall sit ${first} to ${last}s, ${direction}`;

  return `
    <svg class="sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         role="img" aria-label="${escapeHtml(label)}">
      <title>${escapeHtml(label)}</title>
      <path d="${path}" fill="none" stroke="var(--accent-progress)" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lx?.toFixed(1)}" cy="${ly?.toFixed(1)}" r="2" fill="var(--text)" />
    </svg>
  `;
}

// 3-per-week target view (replaces the 7-cells-per-week year-grid).
// Allison's words 2026-05-15 15:13 JDT: "i think theres too many sessions"
// + "its 3 a week" + "go back to 3 per week." The year-grid showed 7 cells
// per week which implied a daily target — but she's only doing 3/week. This
// view shows ONE row per week × 3 slot pills, each filled with the workout
// letter she actually did (or empty outline).

type WeeklyTargetRow = {
  saturday: Date;
  weekNum: number;
  round: number;
  skippedLabel: string | null; // e.g. 'Sick' — week holds its slot but doesn't count
  workouts: ('A' | 'B' | 'C')[]; // in order completed (chronological)
  logs: (LogEntry | null)[]; // parallel to workouts, for click→detail
  isCurrentWeek: boolean;
};

function buildWeeklyTargetRows(logsIn: LogEntry[]): WeeklyTargetRow[] {
  // v54 (Sep 27 2026): this is the 3-PER-WEEK view (her "its 3 a week" rule)
  // — D is extra, never one of the three, so it's excluded before any
  // attribution/slot math the same way sessionsForWeekModel excludes it from
  // the completion model.
  const logs = logsIn.filter((l): l is LogEntry & { workout: WorkoutId } => l.workout !== 'D');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSaturday = new Date(today);
  thisSaturday.setDate(today.getDate() - daysSinceSat);
  thisSaturday.setHours(0, 0, 0, 0);

  const programStart = new Date(PROGRAM_START_DATE + 'T00:00:00');

  // Walk back from this Saturday to the Saturday on/before programStart.
  const rows: WeeklyTargetRow[] = [];
  const cursor = new Date(thisSaturday);
  // Swing-aware (v42): attribution computed once, shared by every row.
  const attribution = attributeSessionsToWeeks(logs);
  while (cursor.getTime() >= programStart.getTime() - 6 * 24 * 60 * 60 * 1000) {
    const weekStart = new Date(cursor);

    // Sessions COUNTED toward this week (chronological — oldest first)
    const weekLogs = sessionsAttributedTo(logs, weekStart, attribution).slice(0, 3); // cap at 3 for the 3-slot view

    const pw = getProgramWeek(weekStart);
    rows.push({
      saturday: new Date(weekStart),
      weekNum: pw.num,
      round: pw.round,
      skippedLabel: pw.skippedLabel,
      // v54: safe — `logs` (above) already excludes D, so nothing in
      // weekLogs (derived from it) is ever 'D'; this is a type-only
      // narrowing, not a second filter (a second filter here would
      // desync `workouts` from the parallel `logs` array below).
      workouts: weekLogs.map((l) => l.workout as 'A' | 'B' | 'C'),
      logs: weekLogs,
      isCurrentWeek: weekStart.getTime() === thisSaturday.getTime(),
    });

    cursor.setDate(cursor.getDate() - 7);
  }

  return rows;
}

// year-grid heatmap retired 2026-05-15 — Allison's call ("its 3 a week").
// Full extracted code at archive/year-grid-2026-05-15/year-grid.archived.ts.

// 3-per-week target view. One row per program week × 3 slot pills.
// v48 · P4 (Sep 24 2026): lives at the bottom of Weekly review now, collapsed
// as "Week by week ▸" (DECISIONS Q3 — her Aug 30 "consistency should be
// collapsible"; Weekly review is where looking back lives). One <details>, so
// it's still one tap open.
function renderWeeklyTargetGrid(summaryLabel = 'Consistency'): string {
  const logs = loadLogs();
  const rows = buildWeeklyTargetRows(logs);
  // v48 · P6 (Sep 24 2026): the "N of 3 this week" + swing note that sat on
  // this summary (and again inside it) are gone — in Weekly review the count
  // is the screen's own subtitle, and home's week line carries the swing in
  // words (DECISIONS §2 #2: "One quiet count, not 3-5").

  const rowsHtml = rows
    .map((r) => {
      const rangeLabel = `${r.saturday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      const slots = [0, 1, 2]
        .map((i) => {
          const w = r.workouts[i];
          const log = r.logs[i];
          if (w && log) {
            const cls = `weekly-slot weekly-slot-${w}`;
            const id = log.id ? `data-detail="${escapeHtml(log.id)}"` : '';
            const tooltip = `${formatDate(log.date)} · Workout ${w} · capacity ${log.capacityBefore ?? '—'}→${log.capacityAfter ?? '—'}`;
            return `<button class="${cls}" type="button" ${id} aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">${w}</button>`;
          }
          return `<div class="weekly-slot weekly-slot-empty" aria-label="open slot"></div>`;
        })
        .join('');
      const cls = r.isCurrentWeek ? 'weekly-row weekly-row-current' : 'weekly-row';
      const label = r.isCurrentWeek
        ? 'This week'
        : r.skippedLabel
          ? `${r.skippedLabel} · ${rangeLabel}`
          : `${r.round > 1 ? `R${r.round} · ` : ''}Wk ${r.weekNum} · ${rangeLabel}`;
      return `
        <div class="${cls}">
          <div class="weekly-row-label">${label}</div>
          <div class="weekly-slots">${slots}</div>
        </div>`;
    })
    .join('');

  // Collapsed by default (her call Aug 30 2026: "consistency should be
  // collapsible and the workouts should be first") — the summary line keeps
  // the one number she cares about visible without the full week list.
  return `
    <details class="consistency-wrap">
      <summary class="next-week-summary">
        <span class="next-week-summary-label">${summaryLabel}</span>
        <span class="next-week-summary-meta">3 per week · since ${formatMonthDay(PROGRAM_START_DATE + 'T00:00:00')}</span>
        <span class="next-week-chev">▸</span>
      </summary>
      <div class="past-weeks-body weekly-target-card">
        <div class="weekly-target-header">
          <h3 class="weekly-target-title">
            Consistency · <span class="weekly-target-sub">3 per week</span>
          </h3>
        </div>
        <div class="weekly-target-rows">${rowsHtml}</div>
      </div>
    </details>
  `;
}

// ---------- renders ----------

// "Coming next week" — collapsed-by-default <details>. Shows the diff of A/B/C
// from the current week to the next planned week. Invitational, not pushy:
// caption gives her the start date so she can ignore it cleanly if she wants.
// Returns '' if there's no next week encoded yet (i.e. she's on the last
// planned week).
function renderComingNextWeek(): string {
  const current = getWeekPlan();
  const futures = getFutureWeekPlans();
  if (futures.length === 0) return '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Each future week diffs against its predecessor (Week 5 vs Week 4,
  // Week 6 vs Week 5, etc.). Header label remains "Coming next week"
  // for the immediate next; further weeks just listed below.
  const sections = futures
    .map((wp, idx) => {
      const prev = idx === 0 ? current : futures[idx - 1]!;
      const start = new Date(wp.startsOn + 'T00:00:00');
      const startLabel = `${months[start.getMonth()]} ${start.getDate()}`;

      const blocks = (['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const lines = diffWorkout(prev.workouts[id], wp.workouts[id]);
          if (lines.length === 0) {
            return `
              <div class="next-week-block">
                <div class="next-week-block-title">Workout ${id}</div>
                <div class="next-week-block-empty">unchanged</div>
              </div>`;
          }
          const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
          return `
            <div class="next-week-block">
              <div class="next-week-block-title">Workout ${id}</div>
              <ul class="next-week-block-list">${items}</ul>
            </div>`;
        })
        .join('');

      const summaryLabel = idx === 0 ? 'Coming next week' : `Then ${weekPlanTitle(wp)}`;
      const caption = `Diff vs ${weekPlanTitle(prev)}${wp.label ? ` · ${wp.label}` : ''}.`;

      return `
        <details class="next-week-preview" ${idx === 0 ? '' : ''}>
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${summaryLabel}</span>
            <span class="next-week-summary-meta">${weekPlanTitle(wp)} · starts Sat ${startLabel}</span>
            <span class="next-week-chev">▸</span>
          </summary>
          <div class="next-week-body">
            <div class="next-week-caption">${caption}</div>
            <div class="next-week-blocks">${blocks}</div>
          </div>
        </details>
      `;
    })
    .join('');

  return sections;
}

// "Past weeks" — collapsed-by-default <details>, the mirror of "Coming next
// week". The home screen only ever expands the CURRENT week's workouts; past
// programming is otherwise only reachable through the week-dot strip + Weekly
// Review (session logs), never as expanded exercise blocks. This adds a single
// lightweight collapsed surface so the past program is browsable in the same
// compact diff form — nothing past-week renders expanded by default. Returns ''
// if there are no encoded weeks before the current one.
function renderPastWeeks(): string {
  const past = getPastWeekPlans();
  if (past.length === 0) return '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Newest past week first. Each week diffs against its own predecessor so the
  // lines read "what changed when this week started".
  const sections = [...past]
    .reverse()
    .map((wp) => {
      const wpIdx = PROGRAM.indexOf(wp);
      const prev = wpIdx > 0 ? PROGRAM[wpIdx - 1]! : null;
      const start = new Date(wp.startsOn + 'T00:00:00');
      const startLabel = `${months[start.getMonth()]} ${start.getDate()}`;

      const blocks = (['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const lines = prev ? diffWorkout(prev.workouts[id], wp.workouts[id]) : [];
          if (lines.length === 0) {
            return `
              <div class="next-week-block">
                <div class="next-week-block-title">Workout ${id}</div>
                <div class="next-week-block-empty">${prev ? 'unchanged' : 'starting point'}</div>
              </div>`;
          }
          const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
          return `
            <div class="next-week-block">
              <div class="next-week-block-title">Workout ${id}</div>
              <ul class="next-week-block-list">${items}</ul>
            </div>`;
        })
        .join('');

      const caption = prev
        ? `Diff vs ${weekPlanTitle(prev)}${wp.label ? ` · ${wp.label}` : ''}.`
        : `${wp.label ? `${wp.label}. ` : ''}The starting week.`;

      return `
        <details class="next-week-preview">
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${weekPlanTitle(wp)}</span>
            <span class="next-week-summary-meta">started Sat ${startLabel}</span>
            <span class="next-week-chev">▸</span>
          </summary>
          <div class="next-week-body">
            <div class="next-week-caption">${caption}</div>
            <div class="next-week-blocks">${blocks}</div>
          </div>
        </details>
      `;
    })
    .join('');

  // One outer collapsed wrapper so the whole past-program section is a single
  // quiet line until tapped (it never auto-expands).
  return `
    <details class="past-weeks-wrap">
      <summary class="next-week-summary">
        <span class="next-week-summary-label">Past weeks</span>
        <span class="next-week-summary-meta">${past.length} earlier week${past.length === 1 ? '' : 's'} · tap to browse</span>
        <span class="next-week-chev">▸</span>
      </summary>
      <div class="past-weeks-body">${sections}</div>
    </details>
  `;
}

// Gear & recovery. Equipment is ownership-gated: a move only appears in a
// workout once Allison says she owns the kit. Also holds Lisa's neck release.
// v48 · P6 (Sep 24 2026): the paragraphs became one row of chips (✅ = in the
// workout now, ⬜ = worth getting) plus the Neck release as its own titled
// card (DECISIONS §5). The "tell Claude" lines are gone — the 2 kg trigger is
// now a question the app asks on home, from her arm-feel taps (her Jul 3 ask).
const GEAR_CHIPS: { have: boolean; text: string }[] = [
  { have: true, text: 'Yellow band · B clamshells' },
  { have: false, text: '2nd 1 kg' },
  // v55 (Sep 27 2026): she has the 2 kg now ("I have 2kg now", 20:08) — the
  // old "ask Lisa when the 1 kg feels easy" line is gone with the rest of
  // the Lisa-gating copy (rule 8e). The LOAD CHIP is where she uses it.
  // v55 · fix r1 (Sep 27 2026): dropped "pairs" — it implied two of each
  // weight, which contradicted the unchecked "2nd 1 kg" chip below it.
  // v55 · fix r3 (Sep 28 2026, nice): "pairs" is back — she does own a pair
  // of each (that's what "your pick by pain" every set implies), and the
  // separate checked "1 kg · A+B arm block" chip above was just this same
  // fact said twice, so it's dropped instead of the word.
  { have: true, text: '1 kg + 2 kg pairs · your pick by pain' },
  { have: false, text: 'Peanut (2 tennis balls in a sock)' },
];

function renderGearCard(): string {
  const chips = GEAR_CHIPS.map(
    (g) =>
      `<span class="gear-chip${g.have ? ' gear-chip-have' : ''}">${g.have ? '✅' : '⬜'} ${escapeHtml(g.text)}</span>`
  ).join('');
  return `
    <div class="card settings-card gear-card">
      <div class="settings-section-label">Gear</div>
      <div class="gear-chips">${chips}</div>
    </div>
    <div class="card settings-card neck-card">
      <div class="settings-section-label">Neck release · ~10 min</div>
      <!-- v55 · fix r1 (Sep 27 2026): "Lisa" was still in this user-visible
           label + copy (checked live at 412x915). A source grep for "Lisa"
           as a user-visible string is the rule (rule 8e, "Get rid of Lisa");
           the attribution moves here, in a comment, not on screen — this
           release traces to Lisa Cohen's original flag, kept for history. -->
      <p class="gear-note">Two tennis balls in a sock at the base of your skull — where the skull meets the neck, one ball either side of your spine. Lie back, let your head’s weight rest on them, breathe slow (3 deep breaths), and relax ~10 min. Releases the neck/shoulder tension. Do it separately from your session.</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// HOME (v48 · P4, Sep 24 2026). Her words today: "look at home ux ui and make
// it better i feel like its a bit all over the place". DECISIONS-v48 §1 Q1-Q3,
// §2 #1-2 #8, §5 Home rows. One next action (the "Up next" hero — the only
// sage on the screen), B/C one chip away, ONE honest week line, a one-row walk,
// two quiet doors. Home used to be 14,025 px expanded with five doors to the
// same 39 rows (uxui home 4/5); everything that left is one tap from where it
// now lives (Weekly review › Week by week, Settings › Gear, Progress › Program).
// ---------------------------------------------------------------------------

// The header's one line: the week she's in. When the loaded plan is a
// different week (e.g. mid-round, before that week's row is encoded), say so
// — fail-loud (ux.md #10: the banner said Week 5 while pre-log said Week 4).
// R2W5 shipped Sep 26 2026, so this no longer fires on a plain Saturday — only
// on a genuinely un-encoded week, or (via preLaunchPlanDate) a swing Saturday whose
// NEXT week exists but hasn't been approved yet. Returns HTML: the plan note
// is a smaller span so the title stays on one line.
// WK2 (Sep 27 2026), §2.4 "Home header": plain "Week N" — no "Round 2 ·" (it
// moves to Sessions/Progress/Settings, WK4's job) and no "· Week N's plan"
// fail-loud suffix (a repeat now gets its own quiet second line, see
// weekSubLabel/planForWeekKey below — the title itself never lies about which
// week she's in, which was her whole complaint: 21:32 "it says week 5 on top
// … I'm in week 4").
// WK2 fix r1 (Sep 27 2026, checker's should #5): this used to return the
// PEEKED week's number while "‹ Week 4" was open, while the Up-next hero and
// the chips right underneath kept offering the LIVE week's workout — the same
// "says week X on top" mismatch her 21:32 words named, just re-created by the
// peek feature itself (shot 04). The page title is what she reads as "the
// week I'm in"; a peek is a read-only LOOK at a past week, so it changes only
// the week CARD's own head (renderHome's weekCardHeadText), never this H1.
function homeWeekTitle(): string {
  if (!isNowAfterCompletionLaunch()) {
    // Pre-launch (or a test mocking an earlier date): the original calendar
    // + swing logic, byte-for-byte, so every existing mockDate() test before
    // Sep 26 2026 22:30 still sees exactly what it always has.
    const week = homeWeekOffset() === 1 ? getViewedProgramWeek(1) : getProgramWeek();
    if (week.skippedLabel) return `${week.skippedLabel} week`;
    const title = `${week.round > 1 ? `Round ${week.round} · ` : ''}Week ${week.num}`;
    const plan = getWeekPlan();
    const planRound = plan.round ?? 1;
    if (plan.weekNum === week.num && planRound === week.round) return title;
    const planName = `${planRound !== week.round && planRound > 1 ? `R${planRound} · ` : ''}Week ${plan.weekNum}`;
    return `${title}<span class="h1-plan"> · ${planName}'s plan</span>`;
  }
  return `Week ${shownWeek().key.week}`;
}

// "v48 · Sep 24 · 21:40" — the year stays in Settings › About (DECISIONS Q1:
// her Jul 1 rule "put time stamp too … across all apps", on one line).
function homeVersionTag(): string {
  return `${APP_VERSION} · ${BUILD_DATE.replace(/,\s*\d{4}/, '')}`;
}

// Minutes from the workout's own description ("… · ~40 min"); 30 if it has none.
function workoutMinutesLabel(w: Workout): string {
  const m = /~(\d+)\s*min/.exec(w.description);
  return `~${m?.[1] ?? '30'} min`;
}

// The hero's cardio line: the lane she used last time + this workout's minutes
// (walk-in-her-shoes: "A says 'cardio optional' → 'Today: elliptical 10 min'").
function heroCardioLine(w: Workout): string {
  const step = w.warmup.find((e) => e.name === 'Outdoor walk');
  if (!step) return '';
  const minutes = walkStepMinutes(step);
  const lane = lastCardioLane();
  return lane ? `Cardio: ${lane} ${minutes} min` : `Cardio: ${minutes} min, your pick`;
}

// Moves new (or back, v48 · fix r1) in this workout tonight, lower-cased, once
// each, over the given blocks.
function tonightNames(
  w: Workout,
  id: AnyWorkoutId,
  want: TonightKind,
  phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown']
): string[] {
  const out: string[] = [];
  for (const p of phases) {
    for (const ex of w[p] ?? []) {
      // Terse: "prone row", not "prone row (bodyweight)" — the hero line stays
      // one line at phone width (the step itself keeps the full name).
      const name = displayName(ex)
        .replace(/\s*\([^)]*\)/g, '')
        .toLowerCase();
      if (tonightKind(ex, id) === want && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

// v55 (Sep 27 2026) — her words: "exercise B has a lot of upper body, is it
// only glutes?" (Sep 27 20:30). The old label was just the workout's first
// word ("Glutes"), which undersold the upper-back block A and B BOTH carry
// (UPPER_BACK_W7 etc.) — a fixed short label per letter instead, so the chip
// itself says what's really in there.
const WORKOUT_SHORT_LABEL: Record<AnyWorkoutId, string> = {
  A: 'Lower + back',
  B: 'Glutes + back',
  C: 'Cardio',
  D: 'Cardio 30', // matches renderWorkoutDChip's own hardcoded "D · Cardio 30"
};

// "B · Glutes + back" — the letter and its fixed short label.
function workoutChipLabel(w: Workout): string {
  return `${w.id} · ${WORKOUT_SHORT_LABEL[w.id]}`;
}

function renderWorkoutChips(exclude: WorkoutId | null, lead = 'or do'): string {
  return renderWorkoutChipsFor(
    (['A', 'B', 'C'] as WorkoutId[]).filter((id) => id !== exclude),
    lead
  );
}

// WK2 (Sep 27 2026), §2.4 "the chips = the OTHER MISSING letters" — an
// explicit id list, not an exclude-one-letter filter: with 2 of 3 already
// done, the chips must show NOTHING (not re-offer an already-done letter),
// which renderWorkoutChips(exclude) can't express. Empty list = no row at
// all, not an empty lead.
function renderWorkoutChipsFor(ids: WorkoutId[], lead = 'or do'): string {
  if (ids.length === 0) return '';
  const chips = ids
    .map((id) => {
      const w = getWorkoutById(id);
      return `<button class="btn-chip home-chip" data-workout="${id}" type="button" aria-label="Start Workout ${id} · ${escapeHtml(w.name)}">${escapeHtml(workoutChipLabel(w))}</button>`;
    })
    .join('');
  return `<div class="home-chips"><span class="home-chips-lead">${escapeHtml(lead)}</span>${chips}</div>`;
}

// v54 (Sep 27 2026) — Workout D's own chip, "D · Cardio 30". Deliberately
// separate from renderWorkoutChipsFor: that function's ids are always the
// week's still-MISSING A/B/C letters (it goes empty once all three are
// done) — D is never missing, never done, never counted toward the week's
// "3 of 3", and never excluded from the row the way a just-completed A/B/C
// letter is. It's extra, every day, including a day she's already done
// another workout on (her words: "it can also be if it needs to be"). A
// small standalone row under the real chips, not folded into their "or do"
// lead, so it never reads as a 4th thing still owed this week.
// v61 (Sep 28 2026), spec item a — her words looking at her first D: "D
// should be gone now cuz I just did it... have an option of two, cuz I
// might do two in one day." The spec's own literal ask is "disabled, not
// offered again that day" (implemented here exactly) — flagged as an open
// tension with the SAME sentence's "option of two" (a disabled chip is,
// today, the only door to D on Home): worth asking her which she actually
// wants before this goes further, not silently resolved either way.
function renderWorkoutDChip(dDoneToday: boolean): string {
  const w = getWorkoutD();
  // v54 fix (Sep 27 2026): deliberately NOT .home-chips/.home-chip — those
  // classes are what dozens of existing tests (and §2.4's own spec) use to
  // count "the other missing A/B/C letters"; reusing them here made D read
  // as a 4th missing letter to every one of those locators. Its own classes,
  // same visual weight via their own CSS.
  if (dDoneToday) {
    return `
      <div class="home-chips-d">
        <button class="btn-chip home-chip-d home-chip-d-done" type="button" disabled aria-label="Workout D already done today">D ✓ today</button>
      </div>`;
  }
  return `
    <div class="home-chips-d">
      <button class="btn-chip home-chip-d" data-workout="D" type="button" aria-label="Start Workout D · ${escapeHtml(w.name)}">D · Cardio 30</button>
    </div>`;
}

// The "Up next" hero — the ONE sage thing on home. The whole card is the tap
// target (→ pre-log), so Home → working out stays 2 taps (guide §1).
function renderUpNextHero(id: WorkoutId): string {
  const w = getWorkoutById(id);
  const fresh = tonightNames(w, id, 'new');
  // v48 · fix r1: moves she's done before (Round 1) come back — named as such.
  const back = tonightNames(w, id, 'back');
  const cardio = heroCardioLine(w);
  const rounds = `${w.rounds} round${w.rounds === 1 ? '' : 's'}`;
  return `
    <button class="workout-card workout-card-pick home-hero" data-workout="${id}" type="button">
      <span class="hero-label">Up next</span>
      <span class="hero-title">Workout ${id}</span>
      <span class="hero-line">${escapeHtml(`${WORKOUT_SHORT_LABEL[id]} · ${rounds} · ${workoutMinutesLabel(w)}`)}</span>
      ${fresh.length ? `<span class="hero-line hero-new">New tonight: ${escapeHtml(fresh.join(' · '))}</span>` : ''}
      ${back.length ? `<span class="hero-line hero-back">Again tonight: ${escapeHtml(back.join(' · '))}</span>` : ''}
      ${cardio ? `<span class="hero-line">${escapeHtml(cardio)}</span>` : ''}
      <span class="hero-start" aria-hidden="true">Start</span>
    </button>`;
}

// After Save, until midnight: the win is witnessed instead of the next workout
// lighting up minutes later (uxui post-log 4/5). Not sage — nothing to do here.
// WK2 (Sep 27 2026): `weekLines` replaces the old single weekCount/weekLabel
// pair — the completion model's closing save needs TWO lines ("Week 5 done ·
// 3 of 3 ✓" then "Week 6 starts now", §2.4's Done card spec), not one.
function renderDoneTodayCard(log: LogEntry, weekLines: string[]): string {
  const lastDone = loadLastDone();
  const firsts = lastDone && lastDone.id === log.id ? lastDone.firsts : [];
  const km =
    typeof log.ellipticalKm === 'number' && log.ellipticalKm > 0 ? `${log.ellipticalKm} km` : '';
  // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 nice): on a D (ride)
  // session, `rideLine` below already shows this same km as part of its own
  // "30 min · 2.2 km · … · L3" line — the plain "Elliptical · 2.2 km"
  // fallback used to repeat it right underneath. Skip the fallback for D;
  // the "Firsts: first elliptical ride · 2.2 km" line (her actual first-ever
  // ride) is untouched, that's a different, intentional km mention.
  const firstsLine = firsts.length
    ? `Firsts: ${[...firsts, ...(km ? [km] : [])].join(' · ')}`
    : km && log.workout !== 'D'
      ? `Elliptical · ${km}`
      : '';
  // v48 · fix r1 (Sep 24 2026): returning moves get their own honest word —
  // "Back: 1 kg biceps curl · prone row (bodyweight)" — never "Firsts".
  const back = lastDone && lastDone.id === log.id ? (lastDone.back ?? []) : [];
  // v48 · final (Sep 25 2026): "Back:" for returning moves sat one screen after
  // her back-pain check ("Back: Fine") and read like a pain report. "Again".
  const backLine = back.length ? `Again: ${back.join(' · ')}` : '';
  // v53 (Sep 26 2026): tappable, same door as a Sessions row or a week dot —
  // opens today's own Session screen, where Edit lives (her ask: "there have
  // to be an easy way to enter the data"). A div (like open-weekly-review
  // below it), so it needs its own keydown for Enter/Space — see attachHandlers.
  const detailAttrs = log.id
    ? ` data-detail="${escapeHtml(log.id)}" role="button" tabindex="0" aria-label="Open today's session"`
    : '';
  const weekLinesHtml = weekLines
    .map((l) => `<div class="home-done-line">${escapeHtml(l)}</div>`)
    .join('');
  // v55 (Sep 27 2026) — CHECK N3: the D Done card read flat (just the title +
  // "0 of 3 in Week 5 · A, B and C left", no ride data at all). A real ride
  // line — same numbers the rides page shows — same as firstsLine's km above.
  const rideMin = (() => {
    const s = rideTimeSec(log);
    return s !== null ? Math.round(s / 60) : null;
  })();
  const rideLine =
    log.workout === 'D'
      ? [
          rideMin !== null ? `${rideMin} min` : '',
          rideKm(log) !== null ? `${rideKm(log)} km` : '',
          typeof log.ellipticalKcal === 'number' ? `${log.ellipticalKcal} kcal` : '',
          rideLevel(log) !== null ? `L${rideLevel(log)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  return `
    <div class="card home-done-card" id="home-done-card"${detailAttrs}>
      <div class="home-done-title">Done ✓ · Workout ${log.workout}</div>
      ${weekLinesHtml}
      ${rideLine ? `<div class="home-done-ride" dir="auto">${escapeHtml(rideLine)}</div>` : ''}
      ${firstsLine ? `<div class="home-done-firsts" dir="auto">${escapeHtml(firstsLine)}</div>` : ''}
      ${backLine ? `<div class="home-done-back" dir="auto">${escapeHtml(backLine)}</div>` : ''}
    </div>`;
}

// WK2 (Sep 27 2026), §2.4 Done card + post-log's missing-letters phrasing:
// "B and C left" / "C left" / "" (nothing missing). Shared by weekCountLine
// and the Done-card lines below so the join rule (comma + "and") lives once.
function joinMissingLetters(missing: readonly string[]): string {
  if (missing.length === 0) return '';
  if (missing.length === 1) return missing[0] as string;
  return `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
}

function renderHome(): string {
  const logs = loadLogs();
  // v51 · cycle page §3: a conditional door, first in the list, only in the
  // ~20-day-a-month window around a predicted start — never logs anything
  // itself (a mis-tap on Home must not write a period start; the sage
  // button waits on the page).
  const homeCycleDoorRow =
    periodLogUrgency(cyclePeriodsForLogic(), localIsoDate(new Date())) === 'primary'
      ? `<button class="door-row" id="home-open-cycle" type="button">
           <span>🌙 Period started?</span><span class="door-chev" aria-hidden="true">›</span>
         </button>`
      : '';
  // Newest by DATE (writeLogs keeps unsynced rows first, not newest first).
  const lastLog = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0];
  const doneToday =
    lastLog && localIsoDate(new Date(lastLog.date)) === localIsoDate(new Date()) ? lastLog : null;
  // v61 (Sep 28 2026), spec item a: independent of `doneToday` (the LATEST
  // log, whichever workout) — she can do D and then A the same day (her own
  // words: "have an option of two"), so this asks the whole day's logs, not
  // just the most recent one.
  const todayIso = localIsoDate(new Date());
  const dDoneToday = logs.some(
    (l) => l.workout === 'D' && localIsoDate(new Date(l.date)) === todayIso
  );
  const weekWalks = walksThisWeek();
  const walkStartedAt = activeWalkStart();

  // WK2 (Sep 27 2026): everything week-shaped branches ONCE, here, on
  // whether "now" is at/after the real completion-model launch (see
  // isNowAfterCompletionLaunch's own comment — pre-launch keeps the
  // original calendar+swing model byte-for-byte, still exercised by dozens
  // of mockDate() tests). Both branches fill the SAME handful of variables
  // the template below reads, so the markup itself never forks.
  let pick: WorkoutId;
  let subLineHtml: string;
  let weekCardHeadText: string;
  let dotsHtml: string;
  let weekLineText: string;
  let saturdayNote: string;
  let doneCardLines: string[];
  let chipsHtml: string;
  let weekNavLinkHtml: string;
  // WK3 (Sep 27 2026): the "Move on without it" button + its moved-note
  // (§2.4). Both stay '' pre-launch — the old calendar model has no
  // completion week to move on FROM.
  let moveOnHtml = '';
  let movedNoteHtml = '';

  if (!isNowAfterCompletionLaunch()) {
    // ---- PRE-LAUNCH: the original calendar + Saturday-swing model, untouched ----
    // Sep 26 2026: on a swing Saturday home shows LAST week (see homeWeekOffset) —
    // its number, its 8 days (Sat → tonight), its count.
    const homeOffset = homeWeekOffset();
    const week = homeOffset === 1 ? getViewedProgramWeek(1) : getProgramWeek();
    const weekRange = formatWeekRange(week.start, homeOffset === 1 ? new Date() : week.end);
    const weekCount = getWeekCount(homeOffset);
    pick = getTodaysPick();
    const weekDots = getWeekDots(homeOffset, homeOffset === 1, true);

    // DECISIONS Q2 — the Saturday swing in WORDS, every day (not only on
    // Saturdays): "0 of 3 this week · Sat's C went to Week 3 · 39 total".
    const thisSaturday = saturdayForOffset(0);
    const attribution = attributeSessionsToWeeks(logs);
    const swungLogs = logs
      .filter(
        (l) =>
          calendarSaturdayMs(l.date) === thisSaturday.getTime() &&
          attribution.get(l) !== thisSaturday.getTime()
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const lastWeek = getViewedProgramWeek(1);
    const lastWeekCount = getWeekCount(1);
    const lastWeekTitle = lastWeek.skippedLabel
      ? `the ${lastWeek.skippedLabel.toLowerCase()} week`
      : `Week ${lastWeek.num}`;
    const swingWords =
      swungLogs.length > 0
        ? ` · Sat's ${swungLogs.map((l) => l.workout).join(' + ')} went to ${lastWeekTitle}`
        : '';
    const swingMissing =
      homeOffset === 1
        ? (['A', 'B', 'C'] as const).filter(
            (w) =>
              !sessionsAttributedTo(logs, saturdayForOffset(1), attribution).some(
                (l) => l.workout === w
              )
          )
        : [];
    weekLineText =
      homeOffset === 1
        ? `${weekCount} of 3 · ${swingMissing.join(' + ')} left — tonight counts for Week ${week.num}`
        : `${weekCount} of 3 this week${swingWords}`;
    saturdayNote =
      homeOffset === 0 &&
      new Date().getDay() === 6 &&
      swungLogs.length === 0 &&
      weekCount === 0 &&
      lastWeekCount > 0 &&
      lastWeekCount < SESSIONS_PER_WEEK_TARGET
        ? `<p class="swing-note">Last week's at ${lastWeekCount} — today's session will count for it.</p>`
        : '';
    subLineHtml = '';
    weekCardHeadText = escapeHtml(
      `${homeOffset === 1 ? `Week ${week.num}` : 'This week'} · ${weekRange}`
    );
    dotsHtml = renderLegacyWeekDots(weekDots);
    doneCardLines = doneToday
      ? attribution.get(doneToday) === saturdayForOffset(1).getTime()
        ? [`${getWeekCount(1)} of 3 in Week ${lastWeek.num}`]
        : [`${weekCount} of 3 this week`]
      : [];
    chipsHtml = doneToday
      ? attribution.get(doneToday) !== saturdayForOffset(0).getTime()
        ? renderWorkoutChips(null, `Week ${week.num}`)
        : // v54: type-only guard — this pre-launch branch never actually sees
          // a 'D' row (D didn't exist before the completion-model launch),
          // but renderWorkoutChips' exclude param is WorkoutId-only.
          renderWorkoutChips(doneToday.workout === 'D' ? null : doneToday.workout)
      : renderWorkoutChips(pick);
    weekNavLinkHtml = '';
  } else {
    // ---- WK2: the completion-based week model ----
    const model = weekModel();
    const shown = shownWeek();
    const planInfo = planForWeekKey(shown.key);
    const peek = viewingLastClosedWeek ? lastClosedWeekForPeek() : null;

    pick = shown.span ? (shown.span.missing[0] as WorkoutId) : 'A';
    // v61 (Sep 28 2026), spec item d/b: D logs, read once for both the week
    // strip's own dot (completionWeekDots) and the "of 4" counting below —
    // week.ts drops D from its model entirely (its own header comment), so
    // both readers go straight to the raw logs instead.
    const dLogs = logs.filter((l) => l.workout === 'D');

    if (peek) {
      // Peeking at "‹ Week N" — a read-only look, so no "since/opens" or
      // repeat sub-line (those describe the LIVE week, not a closed one).
      subLineHtml = '';
      weekCardHeadText = escapeHtml(`Week ${peek.weekNum}`);
      dotsHtml = peek.dotsHtml;
      weekLineText = peek.countText;
    } else {
      subLineHtml =
        `<div class="week-sub-line" id="week-sub">${escapeHtml(weekSubLabel(shown))}</div>` +
        (planInfo.noPlanForRound !== null
          ? // v62.1: a round with no plan rows yet - say so (fail loud), not "same moves"
            `<div class="week-sub-line week-sub-noplan" id="no-plan-note">${escapeHtml(noPlanLine(planInfo.noPlanForRound))}</div>`
          : planInfo.repeatsWeek !== null
            ? `<div class="week-sub-line week-sub-repeat">Same moves as Week ${planInfo.repeatsWeek}</div>`
            : '');
      weekCardHeadText = escapeHtml(`Week ${shown.key.week}`);
      // v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 must #1, repro 1):
      // mid-gap, with nothing of A/B/C logged yet, `shown.span` is null — no
      // real WeekSpan exists to hand completionWeekDots a day-range from.
      // But a D CAN already belong to the pending week (week-d.ts's own
      // point — see its header): once one does, show the same day-strip a
      // real span would, built from the pending week's own anchor day, so
      // her D dot still has somewhere to land instead of waiting for A/B/C
      // to open the week before it can render at all.
      const pendingHasD =
        !shown.span && shown.pending ? weekHasDFor({ pending: true }, model, dLogs) : false;
      // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 must #1): the live
      // strip (open or pending) shares its window with the "N of 4" count
      // below — see completionWeekDots' own header. Both are unbounded
      // (`end: null`), so the strip still runs to today exactly as before;
      // only the per-day D attribution changes.
      dotsHtml = shown.span
        ? renderCompletionWeekDots(
            completionWeekDots(shown.span, dLogs, weekWindowFor({ kind: 'open' }, model))
          )
        : pendingHasD && shown.pending
          ? renderCompletionWeekDots(
              completionWeekDots(
                {
                  key: shown.pending.key,
                  openedAt: shown.pending.opensAt,
                  closedAt: null,
                  how: null,
                  sessions: [],
                  done: [],
                  missing: ['A', 'B', 'C'],
                },
                dLogs,
                weekWindowFor({ kind: 'pending' }, model)
              )
            )
          : '';
      weekLineText = weekCountLine(shown, weekHasDFor(liveWeekDTarget(shown), model, dLogs));
    }
    saturdayNote = '';

    // WK3 (Sep 27 2026), §2.4: the quiet "Move on without it" button — only
    // on the LIVE week (never while peeking at a closed one), only when
    // week.ts's own canMoveOn says so (1-2 done, open 8+ days). The app
    // never moves on by itself — this only ever renders a button; the write
    // happens on her explicit tap (moveOnWithoutIt, bound below).
    if (!peek && shown.span && weekCanMoveOn(shown.span, new Date())) {
      moveOnHtml =
        `<button class="week-move-on-btn" id="week-move-on" type="button">` +
        `Move on to Week ${shown.key.week + 1} without ${joinMissingLetters(shown.span.missing)}</button>`;
    }
    // The moved-note is about "today" specifically, independent of whether
    // she's peeking at an older week right now — it stops matching on its
    // own once local midnight passes (todaysWeekMove is date-driven, not a
    // timer, §2.4's "for the rest of that day").
    const todaysMove = todaysWeekMove();
    // WK3 fix r1 (checker nice): a move dated today that week.ts itself
    // ignored (stale, or a 0-done move — see week.ts's move branch) closed
    // NOTHING — showing "Week 99 closed at N of 3 · Undo" for it would be
    // pure fiction. Only show the note when it matches a real 'moved_on'
    // span for that same key.
    const todaysMoveSpan = todaysMove
      ? (model.spans.find(
          (s) =>
            s.how === 'moved_on' &&
            s.key.round === todaysMove.round &&
            s.key.week === todaysMove.week
        ) ?? null)
      : null;
    if (todaysMove && todaysMoveSpan) {
      const doneCount = 3 - todaysMove.missing.length;
      movedNoteHtml =
        `<div class="week-moved-note" id="week-moved-note">Week ${todaysMove.week} closed at ${doneCount} of 3 · ` +
        `<button class="week-undo-btn" id="week-undo" type="button">Undo</button></div>`;
    }

    // Did TODAY'S save close its own week? (its week resolves to a CLOSED
    // span, not the currently open/pending one.)
    const doneTodayWeekKey = doneToday?.id ? (model.weekOf.get(doneToday.id) ?? null) : null;
    let doneTodayClosedSpan = doneTodayWeekKey
      ? (model.spans.find(
          (s) => s.key.round === doneTodayWeekKey.round && s.key.week === doneTodayWeekKey.week
        ) ?? null)
      : null;
    // v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 must #1, repro 3): D
    // is invisible to `weekOf` (week.ts drops it on purpose — her rule,
    // unchanged), so the check above never finds it, even when THIS D's own
    // calendar window (week-d.ts) already belongs to an already-closed
    // week — "C closes then D the same day" fell through to the generic
    // `else` below and read "0 of 4 in Week 6", talking about a week she
    // hasn't reached yet instead of the one this D actually landed in. A D
    // that lands in the OPEN or PENDING week's own window (the ordinary
    // case) still correctly falls through unchanged.
    if (!doneTodayClosedSpan && doneToday?.workout === 'D') {
      const dTarget = weekTargetForD(doneToday.date, model);
      doneTodayClosedSpan =
        dTarget?.kind === 'span'
          ? (model.spans.find(
              (s) => s.key.round === dTarget.key.round && s.key.week === dTarget.key.week
            ) ?? null)
          : null;
    }

    // WK2 fix r1 (Sep 27 2026, checker's nice #1): a session saved BEFORE the
    // real launch instant is invisible to the completion model — week.ts
    // filters it out entirely, so `doneTodayWeekKey`/`doneTodayClosedSpan`
    // are both null for it, same as "nothing closed yet". Checked live: her
    // Sat Sep 26 22:14 B (which closed the OLD model's Week 4) read "0 of 3
    // in Week 5" here between 22:30 and midnight — a week that session never
    // touched. The OLD model's own last-completed-week line is the honest
    // read for a pre-launch doneToday, not the new model's "0 of 3".
    const doneTodayPreLaunch =
      !!doneToday &&
      new Date(doneToday.date).getTime() < new Date(COMPLETION_WEEKS_FROM.at).getTime();

    if (!doneToday) {
      doneCardLines = [];
    } else if (doneTodayPreLaunch) {
      // `homeWeekOffset()`/`getViewedProgramWeek(offset)` are "now"-relative
      // (an OFFSET FROM TODAY) — wrong here, because "now" being past the
      // launch instant says nothing about which OLD-model week doneToday's
      // OWN date actually swung into. Ask attributeSessionsToWeeks directly
      // for the week THAT session was attributed to, whatever "now" is.
      const attribution = attributeSessionsToWeeks(logs);
      const weekMs = attribution.get(doneToday) ?? calendarSaturdayMs(doneToday.date);
      const legacyWeek = getProgramWeek(new Date(weekMs));
      const legacyCount = sessionsAttributedTo(logs, new Date(weekMs), attribution).length;
      // WK2 fix r2 (Sep 27 2026, checker's nice #1): the doneTodayClosedSpan
      // branch below already says "Week N starts now"/"opens ..." — this is
      // the SAME real moment (her Sat Sep 26 B closed the OLD model's Week 4
      // AND opened the new model's Week 5 in the same instant), so it deserves
      // the same second line, not a card that stops at "done".
      const nextLine = shown.span
        ? `Week ${shown.key.week} starts now`
        : shown.pending
          ? `Week ${shown.key.week} opens ${formatWeekdayDate(shown.pending.opensAt)}`
          : '';
      doneCardLines = [
        `Week ${legacyWeek.num} done · ${legacyCount} of 3${legacyCount >= SESSIONS_PER_WEEK_TARGET ? ' ✓' : ''}`,
        ...(nextLine ? [nextLine] : []),
      ];
    } else if (doneTodayClosedSpan) {
      const nextLine = shown.span
        ? `Week ${shown.key.week} starts now`
        : shown.pending
          ? `Week ${shown.key.week} opens ${formatWeekdayDate(shown.pending.opensAt)}`
          : '';
      // v61 (Sep 28 2026), spec item d: A/B/C alone still closes the week
      // (week.ts's own rule, untouched) — but the Done card's own line now
      // says "of 4", and whether D rode inside this closing week too.
      const closedHasD = weekHasDFor({ span: doneTodayClosedSpan }, model, dLogs);
      doneCardLines = [
        `Week ${doneTodayClosedSpan.key.week} done · ${closedHasD ? '4 of 4 ✓' : '3 of 4 · D optional'}`,
        ...(nextLine ? [nextLine] : []),
      ];
    } else {
      const doneAbc = shown.span?.done.length ?? 0;
      const openHasD = weekHasDFor(liveWeekDTarget(shown), model, dLogs);
      const done = doneAbc + (openHasD ? 1 : 0);
      const missing = shown.span?.missing ?? (['A', 'B', 'C'] as const);
      const missingWords = joinMissingLetters(missing);
      const tail = missing.length === 3 ? 'to go' : 'left';
      doneCardLines = [
        `${done} of 4 in Week ${shown.key.week}${missingWords ? ` · ${missingWords} ${tail}` : ''}`,
      ];
    }

    // §2.4: "the chips = the other missing letters" — not "the other two
    // letters" (renderWorkoutChips' old exclude-one-letter shape would
    // re-offer an already-done letter once only 1 remains). Her words 21:18
    // "I need b back for 5": once a save CLOSES a week, the next one's chips
    // lead with its number and offer all three instead.
    const missingForChips: WorkoutId[] = shown.span
      ? [...shown.span.missing]
      : (['A', 'B', 'C'] as WorkoutId[]);
    // WK2 fix r2 (Sep 27 2026, checker's should #2): the chip lead used to
    // always name the SHOWN week's number, even mid-gap — where a tap right
    // now would actually count backward as an extra rep into the week that
    // just closed (week.ts rule 3), not open the shown week at all. Lead with
    // gapCountsBackToWeekNum() during a gap, same truth pre-log/post-log
    // already say; outside a gap it's null and this is unchanged.
    const chipsWeekLead = `Week ${gapCountsBackToWeekNum() ?? shown.key.week} ·`;
    chipsHtml = doneToday
      ? doneTodayClosedSpan || doneTodayPreLaunch
        ? renderWorkoutChips(null, chipsWeekLead)
        : renderWorkoutChipsFor(missingForChips) // no letter singled out as hero right now
      : renderWorkoutChipsFor(missingForChips.slice(1)); // pick (missing[0]) is the hero already

    // §8c amendment: "‹ Week 4" / "Week 5 ›" — a plain, visible peek at the
    // last closed week, never touching what a session counts toward or trains.
    const peekTarget = viewingLastClosedWeek ? peek : lastClosedWeekForPeek();
    weekNavLinkHtml = peekTarget
      ? viewingLastClosedWeek
        ? `<button class="week-nav-link" id="week-nav-forward" type="button">Week ${shown.key.week} ›</button>`
        : `<button class="week-nav-link" id="week-nav-back" type="button">‹ Week ${peekTarget.weekNum}</button>`
      : '';
  }

  // The walk row (DECISIONS §4, slow walking): one row, no paragraph.
  const walkTrail = [
    weekWalks > 0 ? `${weekWalks} this week` : '',
    stepsToday !== null ? `${stepsToday.toLocaleString('en-US')} steps today` : '',
  ]
    .filter((s) => s !== '')
    .join(' · ');
  const walkRow = walkStartedAt
    ? `<div class="walk-row">
         <span class="walk-text"><span id="walk-live">${walkLiveText(walkStartedAt)}</span></span>
         <div class="walk-btn-group">
           <button class="walk-log-btn walk-log-btn-active" id="finish-walk" type="button">■ Done</button>
           <button class="walk-cancel-btn" id="cancel-walk" type="button">Cancel</button>
         </div>
       </div>`
    : `<div class="walk-row">
         <button class="walk-log-btn" id="log-walk-start" type="button">🚶 Start a walk</button>
         <span class="walk-text">${walkTrail}</span>
       </div>`;

  return `
    <div class="home-header">
      <div class="home-header-title">
        <h1 id="week-title">${homeWeekTitle()}</h1>
        <span class="app-version" aria-label="Build version">${homeVersionTag()}</span>
      </div>
      <button class="settings-icon-btn" id="open-settings" type="button" aria-label="Open settings" title="Settings">
        <span class="settings-icon-glyph" aria-hidden="true">⚙</span>
      </button>
    </div>
    ${subLineHtml}
    ${movedNoteHtml}
    <div id="sync-indicator" class="sync-indicator sync-${state.syncStatus}">${syncIndicatorText()}</div>
    ${staleSnapshot ? renderStaleSessionCard(staleSnapshot) : ''}

    ${doneToday ? renderDoneTodayCard(doneToday, doneCardLines) : renderUpNextHero(pick)}
    ${chipsHtml}
    ${renderWorkoutDChip(dDoneToday)}

    <div class="card week-card" id="open-weekly-review" role="button" tabindex="0" aria-label="Open weekly review for this week">
      <div class="week-card-head">
        <span class="week-card-range">${weekCardHeadText}</span>
        <span class="week-card-chev" aria-hidden="true">›</span>
      </div>
      <div class="week-dots" id="week-strip">${dotsHtml}</div>
      <div class="week-line" id="week-count">${weekLineText}</div>
      ${moveOnHtml}
      ${saturdayNote}
      ${weekNavLinkHtml}
    </div>

    ${renderHomeStartNowCard(logs)}

    <div class="card walk-card">${walkRow}</div>

    <div class="home-doors">
      ${homeCycleDoorRow}
      <button class="door-row" id="open-progress-link" type="button">
        <span>📈 Progress</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
      <button class="door-row" id="view-history" type="button">
        <span>🗂 Sessions</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>
  `;
}

// v49 · look (Sep 25 2026): Home gets its own "Start → Now" card (spec §5
// frame 1; checklist "Start → Now rows (P6 class, and on Home)") — the same
// witnessed-movement-no-verdict rows as the Progress card (guide §2), scoped
// to the three numbers tellable at a glance.
//
// HONEST WALL SIT (spec's own flag): before v45's real timing capture (group
// 1D, Sep 24 2026), a completed wall-sit step saved that WEEK'S PRESCRIBED
// hold length, not what she actually held — showing that as "measured" is
// exactly the fake precision the spec warns against ("never show the 20 s
// prescription as a measured start"). Only a log dated on/after v45 ships is
// a real measurement, so the pair only ever draws from those. Zero honest
// points → the row is omitted; one → the latest shown alone, no "from".
const V45_WALL_SIT_TIMING_SINCE = '2026-09-24';

function honestWallSitLogs(chronoLogs: LogEntry[]): LogEntry[] {
  return chronoLogs.filter((l) => l.wallSitSec > 0 && l.date >= V45_WALL_SIT_TIMING_SINCE);
}

function renderHomeStartNowCard(logs: LogEntry[]): string {
  if (logs.length === 0) return '';
  const chrono = getChronologicalLogs();
  const first = chrono[0];
  if (!first) return '';

  const levels = chrono.map(rideLevel).filter((v): v is number => v !== null);
  // v49 · look fix (Sep 25 2026): "first ride tonight" was shown whenever no
  // log had a level column — true even after a real ride (level null on
  // purpose), on a B day (no ride tonight at all), and in the morning. Now it
  // only fires when she has genuinely never ridden AND tonight's pick has the
  // ride step; a ridden-but-unrecorded level says so plainly instead (Opus
  // check).
  const hasRiddenBefore = chrono.some((l) => l.cardioLane === 'elliptical');
  const picksRideToday = getWorkoutById(getTodaysPick()).warmup.some(
    (e) => e.name === 'Outdoor walk'
  );
  const levelVal =
    levels.length === 1
      ? `<span class="sn-last">${levels[0]}</span>`
      : levels.length > 1
        ? `<span class="sn-first">${levels[0]}</span> → <span class="sn-last">${levels[levels.length - 1]}</span>`
        : !hasRiddenBefore && picksRideToday
          ? `<span class="sn-first">${ELLIPTICAL_START_LEVEL}</span> → <span class="sn-last">first ride tonight</span>`
          : `<span class="sn-last">level not recorded yet</span>`;

  const rows: [string, string][] = [['Elliptical level', levelVal]];

  const wallHonest = honestWallSitLogs(chrono);
  if (wallHonest.length === 1) {
    rows.push(['Wall sit', `<span class="sn-last">${wallHonest[0]!.wallSitSec} s</span>`]);
  } else if (wallHonest.length > 1) {
    const wFirst = wallHonest[0]!.wallSitSec;
    const wLast = wallHonest[wallHonest.length - 1]!.wallSitSec;
    rows.push([
      'Wall sit',
      `<span class="sn-first">${wFirst} s</span> → <span class="sn-last">${wLast} s</span>`,
    ]);
  }

  // v55 (Sep 27 2026) — CHECK N2: "43 sessions" after one D ride read as if D
  // were a 4th letter — it never counts toward "3 of 3" (the 19:17 decision).
  // Her call (picked here, stated so): A/B/C only, with D folded in as its
  // own "+N rides" tag when she's ridden at all.
  const abcSessionCount = logs.filter((l) => l.workout !== 'D').length;
  const dRideCount = logs.length - abcSessionCount;
  const sessionsVal =
    dRideCount > 0
      ? `${abcSessionCount} <span class="sn-extra">+${dRideCount} ride${dRideCount === 1 ? '' : 's'}</span>`
      : `${abcSessionCount}`;
  rows.push(['Sessions', `<span class="sn-last">${sessionsVal}</span>`]);

  return `
    <div class="card hero-card home-startnow-card">
      <div class="start-now-head">
        <span class="progress-card-label">📈 Start → Now</span>
        <span class="progress-card-meta">since ${formatMonthDay(first.date)}</span>
      </div>
      ${rows
        .map(
          ([label, val]) =>
            `<div class="start-now-row"><span class="start-now-lbl">${escapeHtml(label)}</span><span class="start-now-val">${val}</span></div>`
        )
        .join('')}
    </div>`;
}

// v48 · P5 (Sep 24 2026) — the body reading as 1-10 tap chips (DECISIONS Q6).
// BLANK until she taps: the v46 fix was made because the invented 5 faked a
// decline (after = 5 in 6 of 8 Round-2 sessions), and a slider pre-set to her
// last number would bring the same lie back as "same as last time". A chip
// keeps an honest reading at one tap; tapping the chosen one again clears it.
// Selected = --accent-progress (a reading, not the primary action — no sage).
function renderChipRow(
  idPrefix: string,
  value: number,
  touched: boolean,
  ariaLabel: string
): string {
  const chip = (n: number): string => {
    const on = touched && value === n;
    return `<button class="body-chip${on ? ' body-chip-on' : ''}" id="${idPrefix}-${n}" type="button" role="radio" aria-checked="${on ? 'true' : 'false'}" data-body-chip="${idPrefix}" data-value="${n}">${n}</button>`;
  };
  const row = (from: number): string =>
    `<div class="body-chip-row">${[0, 1, 2, 3, 4].map((i) => chip(from + i)).join('')}</div>`;
  return `<div class="body-chips" role="radiogroup" aria-label="${escapeHtml(ariaLabel)}">${row(1)}${row(6)}</div>`;
}

// v50 · mood: same component, a different anchor line — the default stays
// the BODY wording so every other caller is untouched.
function renderBodyChips(
  idPrefix: string,
  value: number,
  touched: boolean,
  label = '',
  anchor = '1 empty · 5 ordinary · 10 strong'
): string {
  return `
    <div class="field body-field">
      <span class="label-text body-label">${escapeHtml(label)}</span>
      ${renderChipRow(idPrefix, value, touched, label)}
      <div class="body-anchor">${escapeHtml(anchor)}</div>
    </div>`;
}

// v51 (Sep 25 2026): the Back & wrist combined control (Fine · Back · Wrist),
// shared by post-log AND pre-log now — her words: "and all metrics bf
// workout have after as well". Same component either place (one Fine tap for
// a clean session; Back/Wrist each open their own 1-10 row) — only the ids
// and which state fields feed it differ, passed in by the caller so post-
// log's already-shipped ids (and tests) never move.
// v53 (Sep 26 2026): backValue/wristValue arrive here as STORED PAIN — the
// chip row itself is drawn and read back in FEEL (feelFromPain), so the tap
// handler below is the only other place that has to know about the flip.
function renderBackWristControl(opts: {
  fineId: string;
  backSomeId: string;
  wristSomeId: string;
  backChipGroup: string;
  wristChipGroup: string;
  backValue: number;
  backTouched: boolean;
  backOpen: boolean;
  wristValue: number;
  wristTouched: boolean;
  wristOpen: boolean;
}): string {
  const bothFine =
    opts.backTouched && opts.backValue === 0 && opts.wristTouched && opts.wristValue === 0;
  // v53 fix (CHECK M5, Sep 26 2026): the lit flag used to be `touched &&
  // value > 0` — feel 10 IS pain 0, so tapping the good end (10 · feels
  // fine) saved correctly but never lit, and looked un-tappable/broken (her
  // Cue complaint again). `touched` alone is the right flag: it's already
  // reset on open by the Back/Wrist buttons, so it can't leak a stale light
  // from a previous session.
  const backRow = opts.backOpen
    ? `<div class="label-text body-label">How does your back feel?</div>
       ${renderChipRow(opts.backChipGroup, feelFromPain(opts.backValue), opts.backTouched, 'How does your back feel, 1 to 10')}
       <div class="body-anchor">1 hurts a lot · 10 feels fine</div>`
    : '';
  const wristRow = opts.wristOpen
    ? `<div class="label-text body-label">How does your wrist feel?</div>
       ${renderChipRow(opts.wristChipGroup, feelFromPain(opts.wristValue), opts.wristTouched, 'How does your wrist feel, 1 to 10')}
       <div class="body-anchor">1 hurts a lot · 10 feels fine</div>`
    : '';
  return `
    <div class="field back-field">
      <span class="label-text">Back &amp; wrist</span>
      <div class="back-choice">
        <button class="back-chip${bothFine ? ' body-chip-on' : ''}" id="${opts.fineId}" type="button" aria-pressed="${bothFine ? 'true' : 'false'}">Fine</button>
        <button class="back-chip${opts.backOpen ? ' back-chip-open' : ''}" id="${opts.backSomeId}" type="button" aria-pressed="${opts.backOpen ? 'true' : 'false'}">Back</button>
        <button class="back-chip${opts.wristOpen ? ' back-chip-open' : ''}" id="${opts.wristSomeId}" type="button" aria-pressed="${opts.wristOpen ? 'true' : 'false'}">Wrist</button>
      </div>
      ${backRow}
      ${wristRow}
    </div>`;
}

// Moves that put pressure on the palms or the grip — where the one wrist + back
// line belongs (DECISIONS §5: the amber box was 58 words, the same every
// session, and shown on C too, where none of these moves exist).
const WRIST_BACK_MOVES: readonly string[] = [
  'Bird dog (legs only)',
  'Wall lean (wrist on-ramp)',
  '1 kg biceps curl',
  'Prone row (bodyweight)',
  'Bodyweight hip hinge',
];

function workoutNeedsWristLine(w: Workout): boolean {
  return [...w.warmup, ...w.main, ...(w.upperBack ?? [])].some((ex) =>
    WRIST_BACK_MOVES.includes(ex.name)
  );
}

// "R2 · Week 4" from the calendar; when the loaded plan is a different week
// it names the plan instead — the same fail-loud as the home header (DECISIONS
// §5). Swing fix (Sep 26 2026): mirrors homeWeekTitle's viewed-week choice, so
// a swing-Saturday pre-log reads last week's label, not the calendar's.
function preLogWeekLabel(): string {
  if (!isNowAfterCompletionLaunch()) {
    // Pre-launch — original logic, untouched (see homeWeekTitle's comment).
    const week = homeWeekOffset() === 1 ? getViewedProgramWeek(1) : getProgramWeek();
    const plan = getWeekPlan();
    const planRound = plan.round ?? 1;
    const round = week.round > 1 ? `R${week.round} · ` : '';
    if (plan.weekNum === week.num && planRound === week.round) return `${round}Week ${week.num}`;
    return `${planRound > 1 ? `R${planRound} · ` : ''}Week ${plan.weekNum}'s plan`;
  }
  // WK2 (Sep 27 2026), §2.4 "Pre-log meta line": "Week 5" plain, or
  // "Week 6 · same moves as Week 5" when PROGRAM has no row for it yet.
  const shown = shownWeek();
  // WK2 fix r1 (checker's should #1): during a gap, the session she's about
  // to start counts BACKWARD (week.ts rule 3) — say that truth, not the
  // pending week's number (see gapCountsBackToWeekNum's own comment).
  const backWeek = gapCountsBackToWeekNum();
  if (backWeek !== null) {
    return `Week ${backWeek} · an extra rep, Week ${shown.key.week} opens ${formatWeekdayDate(shown.pending!.opensAt)}`;
  }
  const planInfo = planForWeekKey(shown.key);
  if (planInfo.noPlanForRound !== null) return `Week ${shown.key.week} · no plan written yet`;
  return planInfo.repeatsWeek === null
    ? `Week ${shown.key.week}`
    : `Week ${shown.key.week} · same moves as Week ${planInfo.repeatsWeek}`;
}

// T1 (Sep 27 2026), PLAN-2026-09-26.md §3.1/§3.2: the "is this the time?"
// confirm row — shared shape for the pre-log start question and the
// post-log finish question, only the label/ids/kind differing. Live
// (unconfirmed): a plain line + ✓ Right / ✎ Fix, plus the time box + "N min
// ago" chips once ✎ is tapped. Confirmed: one dim line, no buttons.
function renderTimeConfirmBlock(opts: {
  kind: 'start' | 'end';
  label: string;
  at: string | null;
  confirmed: boolean;
  editingOpen: boolean;
}): string {
  const candidateIso = opts.confirmed && opts.at ? opts.at : new Date().toISOString();
  const clock = formatClock(candidateIso);
  if (opts.confirmed) {
    const verb = opts.kind === 'start' ? 'Started' : 'Finished';
    return `<p class="timing-line timing-confirmed" id="time-${opts.kind}">${verb} ${clock} ✓</p>`;
  }
  const editRow = opts.editingOpen
    ? `<div class="timing-edit">
        <input type="time" id="time-${opts.kind}-input" value="${clock}" />
        <div class="timing-ago-row">
          ${[5, 10, 15]
            .map(
              (m) =>
                `<button class="timing-ago-chip" type="button" data-time-chip="${opts.kind}" data-mins="${m}">${m} min ago</button>`
            )
            .join('')}
        </div>
      </div>`
    : '';
  return `
    <div class="timing-row">
      <p class="timing-line" id="time-${opts.kind}">${escapeHtml(opts.label)} · ${clock}. Right?</p>
      <div class="timing-actions">
        <button class="timing-btn" type="button" id="time-${opts.kind}-ok">✓ Right</button>
        <button class="timing-btn" type="button" id="time-${opts.kind}-fix">✎ Fix</button>
      </div>
    </div>
    ${editRow}
  `;
}

function renderPreLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // v48 · P5 (Sep 24 2026): one quiet line instead of a subtitle, a counts card
  // and an amber box — her walk: "it asks 'how do you feel?', then the slider
  // says 'your BODY, not your mood' … Start is cut off at the bottom".
  const fresh = tonightNames(w, w.id, 'new');
  // v48 · fix r1: returning moves are "back", not "new" (Round 1 had them).
  const back = tonightNames(w, w.id, 'back');
  const hasCardio = w.warmup.some((e) => e.name === 'Outdoor walk');
  // v54 fix r1 (Sep 27 2026), checker's nice #6: "Week 5" read as though D
  // counted toward the week (it never does — see postLogWitnessLine's own
  // D branch). "Extra" says the true thing here too.
  const meta = [
    w.id === 'D' ? 'Extra' : preLogWeekLabel(),
    fresh.length ? `new tonight: ${fresh.join(' · ')}` : '',
    back.length ? `again: ${back.join(' · ')}` : '',
    hasCardio && lastCardioLane() === 'elliptical' ? 'elliptical' : '',
    workoutMinutesLabel(w),
  ]
    .filter((s) => s !== '')
    .join(' · ');
  // v58 (Sep 28 2026), her spec item 2: "a tiny 'what stepped this week'
  // line ... so she knows which moves will ask." Same stepped-moves list the
  // in-workout chip reads (currentSteppedMoves) — the two can never disagree
  // about which moves ask tonight. Empty when nothing stepped (a repeat
  // week) — no empty line, nothing shown.
  // v59 fix pass (Sep 28 2026, CHECK-v58 round 2 must #R2-S1): the line used
  // to join every stepped move's summary with no cap — on a several-move
  // week (R2·Week4's split squat + hip hinge + wall sit) it wrapped to a
  // second line and pushed the Lite chip's bottom past the action bar (862 vs
  // 826 at 412×915, still 0 scroll). steppedLineText (move-feel.ts) caps what
  // SHOWS to one line's worth of text, "+N more" for the rest — the chip
  // itself (renderMoveFeel, mid-workout) still reads currentSteppedMoves()
  // directly, so every move still gets asked, only the PREVIEW truncates.
  const steppedThisWeek = currentSteppedMoves();
  const steppedLine = steppedLineText(steppedThisWeek);
  // Lite = one round less, never below 1 — the chip says how many rounds today.
  const liteRounds = Math.max(1, w.rounds - 1);
  const liteWord = liteRounds === 1 ? 'one round' : `${liteRounds} rounds`;
  // A low body reading SUGGESTS Lite with a gentle outline; it never switches
  // itself on (agency rule: ask or suggest, never tell).
  const suggestLite = !state.liteDay && state.capacityBeforeTouched && state.capacityBefore <= 3;
  // v54 fix r2 (Sep 27 2026), checker's should #2: D always has one step and
  // one round already (getWorkoutD()) — "Lite — one round, still counts"
  // read as an offer to CUT something D never had two of. No Lite row on D.
  const liteChip =
    w.id === 'D'
      ? ''
      : state.liteDay
        ? `<button class="lite-chip lite-toggle-on" id="lite-toggle" type="button" aria-pressed="true">✓ Lite · ${liteRounds} round${liteRounds === 1 ? '' : 's'} today · tap to undo</button>`
        : `<button class="lite-chip${suggestLite ? ' lite-suggest' : ''}" id="lite-toggle" type="button" aria-pressed="false">🪫 Hard day? Lite — ${liteWord}, still counts</button>`;
  // v51 (Sep 25 2026): the pre-log Back & wrist reading — same "Fine · Back ·
  // Wrist" combined control as post-log (renderBackWristControl), its own ids
  // ("-pre" suffix) and its own state fields (backPainBefore/wristPainBefore)
  // so post-log's ids stay untouched. Her words: "and all metrics bf workout
  // have after as well".
  const backBeforeSome =
    state.backBeforeSomethingOpen || (state.backPainBeforeTouched && state.backPainBefore > 0);
  const wristBeforeSome =
    state.wristBeforeSomethingOpen || (state.wristPainBeforeTouched && state.wristPainBefore > 0);
  const backWristBefore = renderBackWristControl({
    fineId: 'back-fine-pre',
    backSomeId: 'back-some-pre',
    wristSomeId: 'wrist-some-pre',
    backChipGroup: 'back-before',
    wristChipGroup: 'wrist-before',
    backValue: state.backPainBefore,
    backTouched: state.backPainBeforeTouched,
    backOpen: backBeforeSome,
    wristValue: state.wristPainBefore,
    wristTouched: state.wristPainBeforeTouched,
    wristOpen: wristBeforeSome,
  });
  return `
    <div class="screen-header prelog-header">
      <div class="prelog-title">
        <h2>Workout ${w.id}</h2>
        <span class="subtitle-inline">${escapeHtml(w.name)}</span>
      </div>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    ${renderTimeConfirmBlock({
      kind: 'start',
      label: 'Starting the workout',
      at: state.herStartAt,
      confirmed: state.herStartConfirmed,
      editingOpen: state.herStartEditingOpen,
    })}
    <p class="prelog-meta">${escapeHtml(meta)}</p>
    ${steppedLine ? `<p class="prelog-stepped" id="prelog-stepped">${escapeHtml(steppedLine)}</p>` : ''}

    ${renderWorkoutOverview(w)}

    <div class="card body-card">
      ${renderBodyChips('cap-before', state.capacityBefore, state.capacityBeforeTouched, 'Your BODY right now, not your mood')}
      ${renderBodyChips('mood-before', state.moodBefore, state.moodBeforeTouched, 'Mood', '1 irritable · 10 happy / calm')}
      ${backWristBefore}
    </div>

    ${liteChip}

    ${workoutNeedsWristLine(w) ? `<p class="safety-line">Wrist + back: pressure fine — back off if it is sharp, climbing, or still there tomorrow.</p>` : ''}

    ${renderActionBar(`<button class="btn-large btn-primary" id="begin" type="button">Start</button>`)}
  `;
}

// v59 (Sep 28 2026), CHECK-v58 round 2 must #R2-S1: renderPreLog's own
// #prelog-stepped starts out UNTRIMMED (steppedLineText shows every stepped
// move) — this is the live fit, run once right after the pre-log screen
// mounts (render()'s own post-innerHTML hook). Forces one line (nowrap),
// compares the text's real rendered width (scrollWidth) against the real box
// width (clientWidth — a block <p>'s own width, set by its container,
// unaffected by nowrap), and drops trailing moves — "+N more" for the rest —
// until it actually fits. A character-count budget was tried and dropped
// here on purpose (move-feel.ts's own comment on steppedLineFor): real
// letters vary too much in width to predict this without measuring the real
// font. Always leaves at least one move shown, even if that one alone still
// doesn't fit (the fallback below restores normal wrapping rather than
// clipping it off).
function fitSteppedLine(stepped: readonly SteppedMove[]): void {
  if (stepped.length === 0) return;
  const el = document.getElementById('prelog-stepped');
  if (!el) return;
  // Fix pass (Sep 28 2026, v59 CHECK nice): the CSSOM `.style` property
  // setter has a real Chromium quirk (verified directly, isolated repro) —
  // after a SECOND touch of `.style` with no attribute read in between
  // (exactly this function's shape: set nowrap, mutate textContent in the
  // loop, unset), neither `.style.whiteSpace = ''` nor
  // `.style.removeProperty(...)` nor even a later `.removeAttribute('style')`
  // actually drops the attribute — Chromium silently leaves a stale
  // `style=""` behind (the golden HTML gate is what caught it). Going
  // through the plain attribute API for BOTH the set and the restore (never
  // touching `.style` itself) sidesteps it and was verified to work.
  const prevStyleAttr = el.getAttribute('style'); // null on a fresh pre-log mount — no inline style yet
  el.setAttribute('style', 'white-space: nowrap');
  let shown = stepped.length;
  while (shown > 1 && el.scrollWidth > el.clientWidth) {
    shown -= 1;
    el.textContent = steppedLineFor(stepped, shown);
  }
  if (prevStyleAttr === null) {
    el.removeAttribute('style');
  } else {
    el.setAttribute('style', prevStyleAttr);
  }
}

// Workout overview — the structure before starting (2026-05-15 18:07: "see the
// structure at a glance"). v48 · P5 (Sep 24 2026): folded into ONE closed row
// "What's in it ▸" — the counts card (4 / 6 / 6 / 18) never said what was new
// tonight, and it pushed Start below the fold. Open, each phase lists its moves.
function renderWorkoutOverview(w: Workout): string {
  const phases: { key: Phase; label: string; emoji: string; items: Exercise[] }[] = [
    { key: 'warmup', label: 'Warm-up', emoji: '🚶', items: w.warmup },
    {
      key: 'main',
      label: `Main · ${w.rounds} round${w.rounds === 1 ? '' : 's'}`,
      emoji: '💪',
      items: w.main,
    },
    ...(w.upperBack?.length
      ? [{ key: 'upperBack' as Phase, label: 'Upper back', emoji: '🔼', items: w.upperBack }]
      : []),
    { key: 'cooldown', label: 'Stretch', emoji: '🧘', items: w.cooldown },
  ];
  const rows = phases
    .map((p) => {
      const count = p.items.length;
      // v46: the warm-up step is a three-way pick now (her Sep 24: "no more
      // walk it could be walk or elliptical") — display only; the key stays.
      // v48 · P3: one helper for it everywhere (displayName).
      const names = p.items.map((e) => displayName(e)).join(' · ');
      // v48 · P5: flat inside the one fold — a second tap per phase was a
      // second door to the same list.
      return `
        <div class="overview-phase overview-phase-flat">
          <div class="overview-phase-summary">
            <span class="overview-phase-emoji">${p.emoji}</span>
            <span class="overview-phase-label">${p.label}</span>
            <span class="overview-phase-count">${count}</span>
          </div>
          <div class="overview-phase-items">${escapeHtml(names)}</div>
        </div>`;
    })
    .join('');
  // The week now lives in the pre-log's one quiet line ("R2 · Week 4 · …").
  return `
    <details class="card overview-card prelog-overview">
      <summary class="prelog-overview-summary">What's in it</summary>
      <div class="overview-phases">${rows}</div>
    </details>
  `;
}

function renderTempoBar(): string {
  return `
    <div class="tempo-bar" aria-label="3-1-3 tempo">
      <div class="tempo-segment" style="flex: 3;"></div>
      <div class="tempo-segment" style="flex: 1;"></div>
      <div class="tempo-segment" style="flex: 3;"></div>
    </div>
    <div style="font-size: 12px; color: var(--text-dim); text-align: center;">3 sec down · 1 sec hold · 3 sec up</div>
  `;
}

// Group 2H: rest screen now leads with a large countdown ring/arc; Skip is a
// hold-to-confirm button.
function renderRestScreen(w: Workout): string {
  // Ship 6: read user-configured rest length (default 60).
  const total = getRestSec();
  const remaining = state.timerSeconds;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  // SVG ring (radius 90, circumference ~565)
  const r = 90;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - pct);
  // v48 (Sep 24 2026): one line saying what comes next (uxui rest 3/5 — the
  // ring said how long, never what for). The index already points at it.
  const next = rawCurrentExercise();
  const roundStart =
    state.currentPhase === 'main' && state.currentExerciseIndex === 0 && state.currentRound > 1;
  const nextLine = next
    ? roundStart
      ? `Next · Round ${state.currentRound} · ${displayName(next)}`
      : `Next · ${displayName(next)}${next.reps ? ` · ${next.reps}` : ''}`
    : '';
  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${renderProgressLine(w)}
    <div class="card rest-card">
      <div class="rest-ring-wrap">
        <svg class="rest-ring" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="${r}" class="rest-ring-bg"></circle>
          <circle cx="100" cy="100" r="${r}" class="rest-ring-fg"
            stroke-dasharray="${C}" stroke-dashoffset="${offset}"
            transform="rotate(-90 100 100)"></circle>
        </svg>
        <div class="rest-ring-label">
          <div class="rest-ring-num">${remaining}</div>
          <div class="rest-ring-sub">rest</div>
        </div>
      </div>
      <p class="exercise-notes">Breathe. Sip water if you have it.</p>
      ${nextLine ? `<p class="rest-next">${escapeHtml(nextLine)}</p>` : ''}
      <button class="btn-ghost hold-to-skip" id="skip-rest" type="button" data-hold-ms="${HOLD_TO_SKIP_MS}">
        <span class="hold-fill"></span>
        <span class="hold-label">Hold to skip rest</span>
      </button>
      <button class="back-link" id="step-back" type="button" aria-label="Back to the exercise you just did">‹ Back</button>
    </div>
  `;
}

// v48 (Sep 24 2026) — the round-1 floor. Between round 1's last move and round
// 2: rest if she wants it, go on, or stop here with a session that still counts.
// Your words for Lite: one round, "still counts". One sage (Start round 2).
function renderRoundBreak(w: Workout): string {
  const first = w.main[0];
  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${renderProgressLine(w)}
    <div class="card round-break-card">
      <h2 class="round-break-title">Round 1 done ✓</h2>
      ${first ? `<p class="round-break-next">Next · Round 2 · ${escapeHtml(displayName(first))}</p>` : ''}
      <button class="back-link round-break-finish" id="finish-here" type="button">Finish here — it still counts</button>
    </div>
    ${renderActionBar(`
      <div class="step-nav">
        <button class="btn-large btn-back" id="step-back" type="button" aria-label="Back to round 1's last move">‹ Back</button>
        <button class="btn-large btn-primary" id="start-round-2" type="button">Start round 2</button>
      </div>`)}
  `;
}

// Cool-down = stretches. Allison's call (2026-06-06): show the whole block as
// ONE scrollable list — name + cue per row — instead of stepping through each
// stretch as its own screen. No per-stretch video, no per-stretch timer; the
// reps text already carries the hold time and the notes carry the cue. Real
// (non-stretch) exercises keep their stepped screens + videos.
//
// v48 · P7 (Sep 24 2026): her 18 stretches as 11 tick-off rows. The list is
// HER routine — "i dont do yur stretches i do this" (May 29) — so all 18 stay
// in the data; only the right/left pairs fold into one "each side" row. It was
// 2.9 screens and 547 words under a "No timer" line with "45 sec" on every row
// (uxui cooldown 4/5; walk-in-her-shoes: "rows I tick off, and ~13 min · 5 of
// 18"). Cues sit behind a closed ▸; the one sage stays Done · Finish.
type StretchGroup = {
  key: string;
  name: string;
  eachSide: boolean;
  cue: string | null;
  items: Exercise[];
};

// "Wrist extension — right" / "— left" → one "Wrist extension" group; the two
// hip-flexor rows ("Hip flexor — right knee in, left leg dangles" / "— left
// knee in, …") → "Hip flexor". The side word right after " — " is the marker.
// Singles pass through in order. A placeholder cue ("Your usual neck
// stretch.") says nothing on a list she already knows, so it becomes null.
function groupStretchPairs(stretches: Exercise[]): StretchGroup[] {
  const groups: StretchGroup[] = [];
  const byStem = new Map<string, StretchGroup>();
  for (const s of stretches) {
    const m = s.name.match(/^(.+?) — (?:right|left)\b/i);
    const stem = m?.[1];
    if (stem) {
      const existing = byStem.get(stem);
      if (existing) {
        existing.items.push(s);
        existing.eachSide = true;
        continue;
      }
    }
    const notes = s.notes?.trim() ?? '';
    const g: StretchGroup = {
      key: stem ?? s.name,
      name: stem ?? s.name,
      // A single entry can still be "each side" by its own reps (the Week 1-4
      // "Figure-4 stretch · 45 sec each side").
      eachSide: /each side/i.test(s.reps ?? ''),
      cue: notes === '' || /^Your usual .* stretch\.$/.test(notes) ? null : notes,
      items: [s],
    };
    groups.push(g);
    if (stem) byStem.set(stem, g);
  }
  return groups;
}

// Seconds one entry asks for: durationSec, else the number in "45 sec"/"60 sec";
// null for a count ("8 breaths").
function stretchHoldSec(s: Exercise): number | null {
  if (typeof s.durationSec === 'number' && s.durationSec > 0) return s.durationSec;
  const m = (s.reps ?? '').match(/(\d+)\s*sec/i);
  return m ? Number(m[1]) : null;
}

// "~45 s each side" / "~45 s" — the honest estimate, never a "45 sec" that
// reads like a timer under a "no timer" line. A count ("8 breaths") shows as is.
function stretchRowTime(g: StretchGroup): string {
  const first = g.items[0];
  const sec = first ? stretchHoldSec(first) : null;
  if (sec === null) return first?.reps ?? '';
  return `~${sec} s${g.eachSide ? ' each side' : ''}`;
}

// Whole-list estimate in minutes: each side counts (7 pairs × 2 + 4 singles =
// 18 holds × 45 s = 13.5 min → "~13 min", the figure in DECISIONS §4). Floor,
// not round: an estimate that sits under the truth feels like room, not a debt.
function stretchListMinutes(groups: StretchGroup[]): number {
  let sec = 0;
  for (const g of groups) {
    const sides = g.eachSide ? 2 : 1;
    const each = g.items[0] ? (stretchHoldSec(g.items[0]) ?? 45) : 45;
    sec += each * sides;
  }
  return Math.max(1, Math.floor(sec / 60));
}

// v60 (Sep 28 2026) — F2: no per-stretch tick. Her words (Sep 25 14:54):
// "when I do the stretches I just say I'm done. I don't mark them in the
// app and do it on my own." The row is read-only now (name + time + the
// ▸ how-to toggle) — state.stretchTicks stays in AppState/the resume
// snapshot untouched (nothing writes it any more; harmless dead state,
// simpler than threading its removal through sync/resume too) but nothing
// here reads or renders it either.
function renderStretchRow(g: StretchGroup): string {
  const cueKey = `stretch::${g.key}`;
  const cueOpen = g.cue !== null && state.openSections[cueKey] === true;
  const cueToggle =
    g.cue === null
      ? ''
      : `<button class="stretch-cue-toggle ${cueOpen ? 'is-open' : ''}" data-toggle-section="${escapeHtml(cueKey)}" type="button" aria-expanded="${cueOpen}" aria-label="How to do ${escapeHtml(g.name)}"><span aria-hidden="true">▸</span></button>`;
  const setups = g.items.map((s) => renderExerciseSetup(s)).join('');
  return `
      <li class="stretch-row">
        <div class="stretch-row-head">
          <span class="stretch-name">${escapeHtml(g.name)}</span>
          <span class="stretch-reps">${escapeHtml(stretchRowTime(g))}</span>
          ${cueToggle}
        </div>
        ${cueOpen && g.cue !== null ? `<p class="stretch-cue">${escapeHtml(g.cue)}</p>` : ''}
        ${
          /* v40: cooldown is Exercise[] like every other phase, so a stretch CAN
             carry `setup`. Without this call it would silently never render — a
             trap rather than a live bug (no stretch carries one today), found by
             the v32-v39 consistency audit. Rendering it here means the field
             works everywhere its type is allowed. */ setups
        }
      </li>`;
}

// v60 (Sep 28 2026) — F2: one tap, not eleven. The list stays (names + cues,
// readable), but the only controls are a sage "Done stretching ✓" and a
// quiet "Skip" — both just advance (advanceExercise() already treats the
// whole cool-down as ONE step regardless of what's in it); the app never
// recorded whether she stretched, so there's nothing for either button to
// disagree about. Back stays (renderStepNav's own canGoBack()).
function renderCooldownList(w: Workout): string {
  const groups = groupStretchPairs(w.cooldown ?? []);
  const rows = groups.map((g) => renderStretchRow(g)).join('');

  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${/* v48: the same one progress line as every step (the list = one step). */ renderProgressLine(w)}
    <p class="subtitle">${
      state.liteDay
        ? 'Lite day — do the stretches you need, skip the rest. Done stretching whenever.'
        : /* v48 · P7: one honest line — the old "No timer" sat over "45 sec"
             on every row (DECISIONS §4). Her Jun 6 call: one list, no timer. */
          'About 45 s each — no timer, go by feel.'
    }</p>
    <p class="stretch-progress" aria-live="polite">~${stretchListMinutes(groups)} min</p>

    <div class="card stretch-card">
      <ul class="stretch-list">${rows}</ul>
    </div>
    <button class="back-link cooldown-skip" id="cooldown-skip" type="button">Skip</button>

    ${renderStepNav('Done stretching ✓')}
  `;
}

// Pause control — a quiet button in every workout sub-view's header, left of
// Quit (v46). It was a fixed pill at the bottom-left, which sat on top of
// Start timer and the setup steps on the elliptical screen (UI audit Sep 24).
// Nothing while paused: the overlay's Resume is the only control then.
function renderPauseButton(): string {
  if (state.pausedAt !== null) return '';
  return `<button class="pause-inline" id="pause-toggle" type="button" aria-label="Pause workout">⏸ Pause</button>`;
}

// v50 · jump list (Sep 25 2026) — a quiet button beside Pause, same look (ink,
// not sage — this is wayfinding, not the one primary action per step). Her
// words: "I dont always do the workouts in [order]" → "2" = the exercises
// inside a workout. Opens renderStepListSheet below.
function renderListButton(): string {
  if (state.pausedAt !== null) return '';
  // Icon only (not "☰ List") — with Pause + Quit already in this row, the
  // full word pushed "Workout A" onto two lines at 412px and broke the fold
  // on the elliptical first-ride screen (P8 sweep caught it). The aria-label
  // still says the whole thing.
  return `<button class="pause-inline step-list-open-btn" id="step-list-open" type="button" aria-label="List every step">☰</button>`;
}

// One row of the List sheet: display name + reps, a ✓ once she's tapped Done
// on it this session, "here" on wherever she's standing now. Tapping jumps —
// see jumpToStep().
function renderStepListRow(
  key: string,
  exercise: { name: string; reps?: string; label?: string },
  done: boolean,
  isCurrent: boolean
): string {
  const reps = exercise.reps ? ` · ${escapeHtml(exercise.reps)}` : '';
  return `
    <button class="step-list-row${isCurrent ? ' step-list-row-current' : ''}" data-jump-key="${escapeHtml(key)}" type="button">
      <span class="step-list-check" aria-hidden="true">${done ? '✓' : ''}</span>
      <span class="step-list-name">${escapeHtml(displayName(exercise))}${reps}</span>
      ${isCurrent ? '<span class="step-list-here">here</span>' : ''}
    </button>`;
}

// The sheet: every warm-up/main(×round)/upper-back move in order, grouped by
// her named groups ("Warm-up · Main round 1 · Main round 2 · Upper back ·
// Cool-down"), plus the cool-down as its own single row — it's already one
// step everywhere else in this app (workoutStepPosition's "+1", the P7
// checklist screen), so this sheet doesn't invent a second way to step
// through the 11 stretches.
function renderStepListSheet(w: Workout): string {
  const movable = flattenSteps(toStepWorkout(w), effectiveRounds(w));
  const curKey = currentStepKey();
  const groups: { label: string; rows: string }[] = [];
  for (const step of movable) {
    const row = renderStepListRow(
      step.key,
      step.exercise,
      state.completedSteps[step.key] === true,
      step.key === curKey
    );
    const last = groups[groups.length - 1];
    if (last && last.label === step.groupLabel) {
      last.rows += row;
    } else {
      groups.push({ label: step.groupLabel, rows: row });
    }
  }
  groups.push({
    label: 'Cool-down',
    rows: renderStepListRow(
      'cooldown:1:0',
      { name: 'Cool-down stretches' },
      false,
      state.currentPhase === 'cooldown'
    ),
  });
  const body = groups
    .map(
      (g) =>
        `<div class="step-list-group"><div class="step-list-group-label">${escapeHtml(g.label)}</div>${g.rows}</div>`
    )
    .join('');
  return `
    <div class="step-list-panel" id="step-list-panel">
      <div class="step-list-card">
        <div class="step-list-header">
          <span class="step-list-title">Every step</span>
          <button class="step-list-close" id="step-list-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="step-list-body">${body}</div>
      </div>
    </div>`;
}

// v53 (Sep 26 2026) — which running timer (if any) the floating pip belongs
// to. 'timed-exercise' only: a running REST timer also lives in
// state.timerSeconds, but rest already has its own big ring + Back (see
// renderRestScreen) and isn't part of this ask. null on the round-break/
// ride-numbers/paused faces too — nothing to float over there.
function runningTimedExercise(): { ex: Exercise; kind: 'lane' | 'hold' } | null {
  if (state.screen !== 'workout') return null;
  if (state.pausedAt !== null || state.isResting || state.roundBreak || state.rideNumbersOpen) {
    return null;
  }
  if (!activeTimer || activeTimer.kind !== 'timed-exercise' || state.timerSeconds <= 0) return null;
  const ex = getCurrentExercise();
  if (!ex) return null;
  if (isIndoorLane(ex.name)) return { ex, kind: 'lane' };
  if (isHoldStep(ex)) return { ex, kind: 'hold' };
  return null;
}

// v53 (Sep 26 2026) — her words: "Maybe the timer should just be like a
// small circle that pops up or something." A running ride/hold no longer
// takes the whole screen: the countdown lives in this ~96px pip, pinned
// above the action bar (never over Done · Next), while the step's own
// content (name, Tips, Steps, picture) stays visible and scrollable
// underneath (see the running branches of renderLaneTimerCard/
// renderHoldTimerCard, which now step aside instead of drawing the old big
// slab). Tap it → a small Pause/Stop sheet; Stop reuses the exact
// #stop-lane/#stop-timed ids and handlers the old slab used, so the real
// seconds/minutes are kept exactly as before — only where they live moved.
function renderTimerPip(): string {
  const running = runningTimedExercise();
  if (!running) return '';
  const { ex, kind } = running;
  const total = ex.durationSec ?? 0;
  const remaining = state.timerSeconds;
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - ratio);
  const kindLabel = kind === 'lane' ? 'Ride' : 'Hold';
  const pip = `
    <button class="timer-pip" id="timer-pip" type="button" aria-label="${kindLabel} timer running, ${formatTimerDisplay(remaining)} left. Tap to pause or stop.">
      <svg class="timer-pip-ring" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="${r}" class="timer-pip-track"></circle>
        <circle cx="48" cy="48" r="${r}" class="timer-pip-progress"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          transform="rotate(-90 48 48)"></circle>
      </svg>
      <span class="timer-pip-time">${formatTimerDisplay(remaining)}</span>
    </button>`;
  if (!timerPipOpen) return pip;
  const stopId = kind === 'lane' ? 'stop-lane' : 'stop-timed';
  return `
    ${pip}
    <div class="timer-pip-sheet" id="timer-pip-sheet">
      <div class="timer-pip-sheet-card">
        <div class="timer-pip-sheet-time">${formatTimerDisplay(remaining)}</div>
        <div class="timer-pip-sheet-sub">${kindLabel} running</div>
        <button class="btn-large" id="timer-pip-pause" type="button">⏸ Pause</button>
        <button class="btn-large btn-back" id="${stopId}" type="button">Stop</button>
        <button class="back-link" id="timer-pip-close" type="button">Cancel</button>
      </div>
    </div>`;
}

// Full-screen "Paused" overlay — freezes the workout clock and any countdown
// until she taps Resume. Deliberately unmissable so a step-away can't be left
// silently running.
function renderPausedOverlay(): string {
  return `
    <div class="paused-overlay" id="paused-overlay">
      <div class="paused-card">
        <div class="paused-icon">⏸</div>
        <div class="paused-title">Paused</div>
        <div class="paused-sub">Workout time is on hold — take as long as you need.</div>
        <button class="btn-large btn-primary" id="pause-resume" type="button">Resume workout</button>
      </div>
    </div>`;
}

// The guided indoor strip (v30). Rendered only while the apartment cardio step
// is the current exercise. `remainingSec` mirrors the timer display's own
// fallback (idle = the whole duration), so before she taps Start the strip sits
// on segment 1 as "Starts with" — and once running it re-derives on every tick,
// because timerLoop re-renders each time the second changes.
function renderApartmentRoutine(totalSec: number, remainingSec: number, running: boolean): string {
  const idx = apartmentSegmentIndex(totalSec, remainingSec);
  const seg = APARTMENT_CARDIO_SEGMENTS[idx];
  if (!seg) return '';
  const left = apartmentSegmentRemainingSec(totalSec, remainingSec);
  const items = APARTMENT_CARDIO_SEGMENTS.map(
    (s, i) =>
      `<li class="cardio-seg-item${i === idx ? ' is-current' : ''}"><span class="cardio-seg-num" aria-hidden="true">${i + 1}</span><span class="cardio-seg-name">${escapeHtml(s.name)}</span></li>`
  ).join('');
  return `
    <div class="card cardio-routine" data-segment-index="${idx}">
      <div class="cardio-seg-label">${running ? 'Right now' : 'Starts with'}</div>
      <div class="cardio-seg-now">${escapeHtml(seg.name)}</div>
      <p class="cardio-seg-cue">${escapeHtml(seg.cue)}</p>
      ${running ? `<div class="cardio-seg-left">${formatTimerDisplay(left)} left in this move</div>` : ''}
      <ol class="cardio-seg-list">${items}</ol>
      <p class="cardio-seg-foot">Two minutes each — it moves on by itself and loops back round until your time is up. Rather do the building stairs? Take the same minutes there instead: up easy, walk down as the rest.</p>
    </div>
  `;
}

// v51 (Sep 25 2026) — the ride-numbers screen's one card: what she reads off
// the machine BEFORE she presses STOP, in the order she reads them off the
// console — Time, Distance, Calories, Level, Pulse (her lead's spec). Replaces
// v49's renderEllipticalAfterCard, whose level-first order and inline
// placement on the ride's after-face she never scrolled down to see ("it
// didn't show up for me"). Decision Q5 still holds: the ride ENDS on level 3,
// so a level set before it was a guess — the stepper still starts at "—".
function renderRideNumbersCard(ex: Exercise): string {
  const level = ellipticalLevel();
  const last = lastEllipticalLevel();
  const km = localStorage.getItem(WW_ELLIPTICAL_KM_KEY) ?? '';
  const pulse = localStorage.getItem(WW_ELLIPTICAL_PULSE_KEY) ?? '';
  const kcal = localStorage.getItem(WW_ELLIPTICAL_KCAL_KEY) ?? '';
  // v61 (Sep 28 2026), spec item e — her words 15:36: "it doesn't need a
  // timer because I use the timer on the bike now... it just says that it
  // only did one minute when that's not true cuz I just started — no timer
  // for elliptical, I'll use the bike." No app-timer prefill any more (the
  // app never ran one to begin with, but this box used to ALSO fall back to
  // "the full planned block" as a guess on a never-started ride) — blank
  // until she types it, same "blank = not recorded" rule as every other
  // field here.
  const typedTime = localStorage.getItem(WW_ELLIPTICAL_TIME_KEY);
  const time = typedTime ?? '';
  // THE RIDES PAGE / R1 (Sep 27 2026), PLAN-2026-09-26.md §4.3: "a live line,
  // no extra screen" — appears once Time + Calories are filled, adds km/h
  // once Distance is too. Computed through ride.ts's rideRate() so this line
  // and the rides page's hero can never disagree on the math. Rendered here
  // so a prefilled time (the app's own timer, laneDoneMinutes) already shows
  // it before she types anything; updateRideLiveLine() (attachWorkoutHandlers)
  // keeps it live per keystroke, same "no re-render, keeps focus" rule as
  // every other reading on this screen.
  const liveRate = rideRate({
    kcal: parseKcalReading(kcal),
    timeSec: time ? parseMmSs(time) : null,
    km: km ? parseKmReading(km) : null,
  });
  const liveLine =
    liveRate.kcalPerMin !== null
      ? `= ${liveRate.kcalPerMin} kcal a minute${liveRate.kmh !== null ? ` · ${liveRate.kmh} km/h` : ''}`
      : '';
  // v61 (Sep 28 2026), spec item g — the after-ride half of the derived aim:
  // "2.15 km · aim 2.1" + "last time → today" (no colors, no ✗, no verdict).
  // Uses whatever level she's ALREADY logged this ride (ellipticalLevel()) —
  // falling back to her last-known level before she's touched the stepper —
  // and the ride's own chosen minutes (ellipticalMinutes()), same source the
  // ride card above used for the SAME ride's own aim line.
  const kmVal = km ? parseKmReading(km) : null;
  const aimLevel = level ?? last ?? ELLIPTICAL_START_LEVEL;
  const aimMinutes = ellipticalMinutes() ?? Math.round((ex.durationSec ?? 0) / 60);
  const rideHistory = ellipticalRideRecords(loadLogs());
  const rideAim = deriveRideAim(rideHistory, aimMinutes, aimLevel);
  const lastKm = lastTimeAtSameAim(rideHistory, aimMinutes, aimLevel);
  const aimCompareLine =
    kmVal !== null && !('isFirst' in rideAim) ? `${kmVal} km · aim ${rideAim.km} km` : '';
  const lastTimeLine =
    kmVal !== null && lastKm !== null ? `last time → today: ${lastKm} km → ${kmVal} km` : '';
  // "—" until she touches it: an untouched stepper saves null, never a guess.
  const sameChip =
    last !== null
      ? `<button class="ell-same-chip${level === last ? ' is-on' : ''}" id="ell-level-same" type="button" aria-pressed="${level === last}">${last} again</button>`
      : '';
  const readingRow = (
    id: string,
    label: string,
    value: string,
    unit: string,
    opts: { type?: string; step?: string; min?: string; max?: string; sub?: string } = {}
  ): string => `
      <label class="ell-reading" for="${id}">
        <span class="ell-reading-label">${label}${opts.sub ? `<span class="ell-reading-sub" id="${id}-sub">${opts.sub}</span>` : ''}</span>
        <span class="ell-reading-field">
          <input type="${opts.type ?? 'number'}" id="${id}" inputmode="${opts.type === 'text' ? 'numeric' : 'decimal'}" ${opts.step ? `step="${opts.step}"` : ''} ${opts.min ? `min="${opts.min}"` : ''} ${opts.max ? `max="${opts.max}"` : ''} placeholder="–" value="${escapeHtml(value)}" />
          ${unit ? `<span class="ell-reading-unit">${unit}</span>` : ''}
        </span>
      </label>`;
  return `
    <div class="card ell-after-card">
      <div class="ell-readings-title">Your ride — from the machine</div>
      <p class="ell-numbers-note">Read them before you press STOP on the machine.</p>
      <div class="ell-readings-row">
        ${readingRow('ell-time', 'Time', time, '', { type: 'text' })}
        ${readingRow('ell-km', 'Distance', km, 'km', { step: '0.01', min: '0' })}
        ${readingRow('ell-kcal', 'Calories', kcal, 'kcal', { step: '0.1', min: '0' })}
      </div>
      <div class="ell-live-line" id="ride-live-line"${liveLine ? '' : ' hidden'}>${escapeHtml(liveLine)}</div>
      <p class="ell-aim-compare" id="ell-aim-compare"${aimCompareLine ? '' : ' hidden'}>${escapeHtml(aimCompareLine)}</p>
      <p class="ell-last-time" id="ell-last-time"${lastTimeLine ? '' : ' hidden'}>${escapeHtml(lastTimeLine)}</p>
      <div class="ell-field ell-field-level">
        <span class="ell-field-label">Level you rode at</span>
        <div class="ell-level-controls">
          <div class="settings-stepper ell-stepper">
            <button class="settings-stepper-btn" id="ell-level-down" type="button" aria-label="Level down" ${level !== null && level <= 1 ? 'disabled' : ''}>−</button>
            <span class="settings-stepper-val${level === null ? ' is-empty' : ''}" id="ell-level">${level ?? '—'}</span>
            <button class="settings-stepper-btn" id="ell-level-up" type="button" aria-label="Level up" ${level !== null && level >= ELLIPTICAL_MAX_LEVEL ? 'disabled' : ''}>+</button>
          </div>
          ${sameChip}
        </div>
      </div>
      <div class="ell-readings-row">
        ${readingRow('ell-pulse', 'Pulse', pulse, 'bpm', { step: '1', min: '30', max: '230' })}
      </div>
      <p class="ell-pulse-hint">The machine's number at the end, hands on the grips — or leave it blank.</p>
      ${renderRideFeel()}
    </div>`;
}

// v61 (Sep 28 2026), spec item f: the ride's Easy/Right/Hard, every ride, on
// the numbers card (never gated on "stepped" — currentSteppedMoves() has
// nothing to do with this). One tap selects, tapping the same one again
// clears — same convention as the arm-feel/move-feel chips it visually
// matches (renderArmFeel/renderMoveFeel), and just as optional: nothing
// downstream depends on it, a ride she never taps a feel on simply saves no
// 'ride=' segment at all.
function renderRideFeel(): string {
  const current = state.rideFeel;
  const chips = MOVE_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-ride-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  // v61 (Sep 28 2026), P8-style compactness (fix pass, checker's should):
  // no separate visible label line (the group aria-label carries it for
  // screen readers) — a phone-height budget can't afford one more text row
  // on top of the hint line below.
  return `
    <div class="ride-feel" role="group" aria-label="How did that feel?">
      <div class="arm-feel-chips">${chips}</div>
      <p class="ride-feel-hint">Easy = full sentences · Right = short sentences · Hard = a few words</p>
    </div>`;
}

// v51 — the sub-screen itself: the same workout header as every step, the
// fields card, a quiet way out with no numbers, then the pinned pair. `‹
// Back` here is LOCAL to this screen (just closes it, same step) — never the
// global step-back, which would leave the elliptical step entirely.
function renderRideNumbersScreen(ex: Exercise, header: string): string {
  return `
    ${header}
    ${renderRideNumbersCard(ex)}
    <button class="back-link ell-numbers-skip" id="ride-numbers-skip" type="button">Skip — no numbers today</button>
    ${renderActionBar(`
      <div class="step-nav">
        <button class="btn-large btn-back" id="ride-numbers-back" type="button" aria-label="Back to the ride">‹ Back</button>
        <button class="btn-large btn-primary" id="next" type="button">Save · Next</button>
      </div>
    `)}
  `;
}

// Setup (v44, her ask: "make sure you tell me how to do it and how to set the
// elliptical"). NO BX200 manual is published online (searched Sep 24: York,
// ManualsLib, 4 Israeli stores) — so the console steps are the standard ones
// for this class of console and SAY so, until she sends a photo of hers.
// v48 · P3 (Sep 24 2026): 3 short steps (was 4 long ones + a 6-step "ride"
// list). The ride list's content is now the live "Right now" line.
const ELLIPTICAL_SETUP_STEPS: readonly string[] = [
  'Plug it in, step on and pedal to wake the screen.',
  'Choose MANUAL. Press ENTER to skip time, age and weight.',
  'Press START and set level 3.',
];

// One expander, "🛠 Set up the machine". v48 · P3: open on the FIRST ride only
// (before it — no level on record yet), closed otherwise, NEVER reopened after
// the ride (walk §2: it reopened under the after-ride boxes), and not drawn at
// all while the timer runs. Same toggle handler as the detail-card sections.
function renderEllipticalGuide(beforeFirstRide: boolean): string {
  const key = `${ELLIPTICAL_NAME}::setup`;
  const isOpen = beforeFirstRide
    ? state.openSections[key] !== false
    : state.openSections[key] === true;
  // v48 · fix r2 (Sep 25 2026): marks the tall first-ride screen (setup open
  // above Start) so styles.css can tighten it — "↩ Walk or apartment instead"
  // sat half under the pinned Done · Next bar.
  const firstMark = isOpen && beforeFirstRide ? ' ell-guide-first' : '';
  return `
    <div class="card ell-guide ${isOpen ? 'detail-section-open' : 'ell-guide-collapsed'}${firstMark}">
      <button class="detail-section-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${isOpen}">
        <span class="detail-section-label"><span class="detail-section-icon" aria-hidden="true">🛠</span> Set up the machine</span>
        <span class="detail-chev" aria-hidden="true">▸</span>
      </button>
      ${
        isOpen
          ? `<div class="detail-section-body ell-guide-body">
        <ol class="ell-steps">${ELLIPTICAL_SETUP_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
        <p class="gear-note">${/* v48 · fix r1: one line (was 3), so Start clears the pinned bar with the steps above it. Same honesty: no BX200 manual online. */ 'Typical steps — your buttons may differ.'}</p>
      </div>`
          : ''
      }
    </div>
  `;
}

// v48 · P3: the timer card of an indoor lane (elliptical / apartment). Ready →
// sage Start (no 3-2-1 any more, Q8) · Running → the countdown + a quiet Stop
// that keeps the minutes she did (no dead "Running…" slab, same as the holds) ·
// Done → "✓ 10 min done" (v46: it used to reset to Ready as if the ride never
// happened; v48: plain text like the holds' "✓ held" — a witness, so Done · Next
// is the one sage). `under` sits below Start before the ride (the back-out link).
function renderLaneTimerCard(ex: Exercise, laneRan: boolean, under = ''): string {
  const running = state.timerSeconds > 0 || state.preCountdown > 0;
  let inner: string;
  if (running) {
    // v53 (Sep 26 2026): the countdown moved into the floating pip (her words,
    // "maybe the timer should just be like a small circle that pops up") —
    // this slab used to take the card here; now the ride/apartment content
    // (name, "Right now" line, the guided strip) stays visible underneath
    // instead, and Stop lives in the pip's sheet (same #stop-lane id/handler).
    return '';
  } else if (laneRan) {
    const mins = laneDoneMinutes() ?? Math.round((ex.durationSec ?? 0) / 60);
    inner = `
      <div class="timer-label">Done</div>
      <div class="timer-done timer-held">✓ ${mins} min done</div>`;
  } else {
    inner = `
      <div class="timer-label">Ready</div>
      <div class="timer-display timer-idle">${formatTimerDisplay(ex.durationSec ?? 0)}</div>
      <button class="btn-large btn-primary" id="start-timed" type="button">Start timer</button>
      ${under}`;
  }
  return `<div class="card timer-card">${inner}</div>`;
}

// The elliptical step (v61, Sep 28 2026, spec item e — her words 15:36:
// "it doesn't need a timer because I use the timer on the bike now... it
// just says that it only did one minute when that's not true cuz I just
// started — no timer for elliptical, I'll use the bike"). NO app timer any
// more — no Start, no running face, no pip, no "Right now" line, no "✓ N
// min done" witness. One plain card the whole time she's on this step:
// planned minutes, the level she's likely riding at (last logged, or the
// start level on a first ride), the derived distance aim (ride-aim.ts, spec
// item g), and "hands light". Done · Next opens the ride-numbers screen
// directly (openRideNumbers, unchanged) — the only door in, now the only
// door full stop. Holds (wall sit, planks, wall lean) keep their own timers;
// walk/apartment lanes are untouched (they never went through this
// function).
function renderEllipticalStep(ex: Exercise, header: string): string {
  if (state.rideNumbersOpen) {
    return renderRideNumbersScreen(ex, header);
  }
  const minutes = Math.round((ex.durationSec ?? 0) / 60);
  const level = lastEllipticalLevel() ?? ELLIPTICAL_START_LEVEL;
  const firstRide = lastEllipticalLevel() === null;
  const aim = deriveRideAim(ellipticalRideRecords(loadLogs()), minutes, level);
  const aimText = 'isFirst' in aim ? `first ride at ${minutes} sets your aim` : `aim ${aim.km} km`;
  const planLine = `${minutes} min · level ${level} · ${aimText} · hands light`;
  const instead =
    state.selectedWorkout === 'D'
      ? ''
      : `<button class="back-link cardio-back-out" id="ww-outdoor" type="button">↩ Walk or apartment instead</button>`;
  const guide = renderEllipticalGuide(firstRide);
  return `
    ${header}
    <div class="card">
      <div class="exercise-display">
        <div class="exercise-name-row">
          <div class="exercise-name">${ELLIPTICAL_NAME}</div>
          ${firstRide ? `<span class="new-tonight-badge">First ride</span>` : ''}
        </div>
        <p class="ride-plan-line" id="ride-plan-line">${escapeHtml(planLine)}</p>
        ${instead}
      </div>
    </div>
    ${guide}
    ${renderStepNav('Done · Next')}
  `;
}

// v48 (Sep 24 2026): the face of a hold (wall sit, plank, wall lean). Four
// states, one sage at a time: Ready (sage Start) → Get ready / Hold (a quiet
// Stop that saves the real seconds; no dead "Running…" slab) → Done ("✓ held
// 45 s · last time 43", a real outline Redo; Done · Next turns sage). uxui
// timed 4/5 (the hold reset silently) and 3/5 (two sage buttons, a dead
// slab); walk §4: "No way to say I held less".
// v60 (Sep 28 2026): a hold prescribed "N ×" (hold-sets.ts setsPrescribed,
// today only Wall lean, "2 × 15-20 sec") branches to its own done-face below
// — her words Sat Sep 26 22:13, "Wall lean I need to be able to do the timer
// again" (PLAN-2026-09-26.md §7 F1). Every single-set hold is the untouched
// path above, unchanged in shape; only the Redo button's class changes
// (real outline, not grey text — F1's own "Redo everywhere" line).
function renderHoldTimerCard(ex: Exercise, showTempo: boolean): string {
  const totalSets = setsPrescribed(ex.reps);
  const held = heldOnThisStep();
  const idle = state.timerSeconds === 0 && state.preCountdown === 0;
  let inner: string;
  if (state.preCountdown > 0) {
    // v53: the 3-2-1 stays a full card — her words, "hold steps ... keep
    // their Get-ready 3-2-1, then go to the pip."
    inner = `
      <div class="timer-label">Get ready</div>
      <div class="timer-display countdown-big">${state.preCountdown}</div>
      <button class="btn-ghost" id="stop-timed" type="button">Stop</button>`;
  } else if (!idle) {
    // v53 (Sep 26 2026): once the hold itself is running, the countdown moves
    // into the floating pip and Stop lives in its sheet (same #stop-timed id
    // /handler) — this card steps aside so the name/Tips/Steps/picture stay
    // visible and scrollable, not a big "Hold" slab covering them.
    return showTempo ? `<div class="card">${renderTempoBar()}</div>` : '';
  } else if (totalSets > 1) {
    const face = holdSetsFace(totalSets, state.heldSetsFor[holdStepKey()] ?? []);
    if (face.kind === 'ready') {
      inner = `
        <div class="timer-label">Ready</div>
        <div class="timer-display timer-idle">${formatTimerDisplay(ex.durationSec ?? 0)}</div>
        <button class="btn-large btn-primary" id="start-timed" type="button">Start timer</button>`;
    } else if (face.kind === 'more-sets') {
      inner = `
        <div class="timer-label">Set ${face.setDone} ✓</div>
        <div class="timer-done timer-held">${face.heldSec} s</div>
        <p class="hold-set-cue">Shake your hands out first.</p>
        <button class="btn-large btn-primary" id="hold-set-next" type="button">Start set ${face.setDone + 1}</button>
        <button class="hold-redo-btn" id="hold-redo" type="button">↻ Redo set ${face.setDone}</button>`;
    } else {
      inner = `
        <div class="timer-label">Done</div>
        <div class="timer-done timer-held">${face.setsTotal} sets ✓ · ${formatHeldSeconds(face.sets)}</div>
        <button class="hold-redo-btn" id="hold-redo" type="button">↻ Redo set ${face.setsTotal}</button>`;
    }
  } else if (held > 0) {
    // "last time" = the most recent saved session with a real wall sit (logs
    // are newest-first; this session isn't saved yet). Omitted when none.
    // v49 · look fix (Sep 25 2026): honestWallSitLogs() only — was reading any
    // wallSitSec>0, including a pre-v45 row that saved the week's PRESCRIBED
    // hold, not what she actually held (Home already excluded those; this
    // face didn't, so the two disagreed — Opus check).
    const last = ex.name === 'Wall sit' ? honestWallSitLogs(loadLogs())[0]?.wallSitSec : undefined;
    inner = `
      <div class="timer-label">Done</div>
      <div class="timer-done timer-held">✓ held ${held} s${last ? `<span class="timer-last"> · last time ${last}</span>` : ''}</div>
      <button class="hold-redo-btn" id="redo-timed" type="button">↻ Redo</button>`;
  } else {
    inner = `
      <div class="timer-label">Ready</div>
      <div class="timer-display timer-idle">${formatTimerDisplay(ex.durationSec ?? 0)}</div>
      <button class="btn-large btn-primary" id="start-timed" type="button">Start timer</button>`;
  }
  return `
    <div class="card timer-card">
      ${inner}
      ${showTempo ? renderTempoBar() : ''}
    </div>`;
}

// v53 (Sep 26 2026): "Cue" → "Tips" — her words, "Cue in the app? It says to
// cue something, that seems to do nothing." "Cue" read as an instruction to
// perform, not a label for more reading, and it duplicated "Listen — how to
// do it" + "Steps" underneath. Renamed + restyled to match the "Steps" row
// exactly (icon + label + chevron, full-width tappable, same weight — see
// renderDetailSection). Same toggle + openSections mechanism as before.
//
// tipsRedundant: every exercise notes string was hand-audited this pass to
// strip PROGRAM bookkeeping (see the // PROGRAM comments beside each one in
// PROGRAM/ladders.ts) down to form/feel/safety guidance only. This is the
// runtime backstop for the rare leftover that only restates the safety line
// or the Steps card word for word — her rule: nothing gets a Tips row that
// has nothing left to say.
function tipsRedundant(ex: Exercise, safety: string | undefined): boolean {
  if (!ex.notes) return true;
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const notesNorm = normalize(ex.notes);
  if (notesNorm === '') return true;
  if (safety && normalize(safety) === notesNorm) return true;
  const detail = EXERCISE_DETAIL[ex.name];
  if (detail && detail.steps.length > 0) {
    const stepsNorm = normalize(detail.steps.join(' '));
    if (stepsNorm.includes(notesNorm)) return true;
  }
  return false;
}

function renderTipsExpander(ex: Exercise, safety: string | undefined): string {
  if (tipsRedundant(ex, safety)) return '';
  const key = `${ex.name}::cue`;
  const isOpen = !!state.openSections[key];
  return `
    <div class="detail-section tips-section ${isOpen ? 'detail-section-open' : ''}">
      <button class="detail-section-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${isOpen}">
        <span class="detail-section-label"><span class="detail-section-icon" aria-hidden="true">💡</span> Tips</span>
        <span class="detail-chev" aria-hidden="true">▸</span>
      </button>
      ${isOpen ? `<div class="detail-section-body"><p class="exercise-notes">${ex.notes}</p></div>` : ''}
    </div>`;
}

function renderWorkout(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  const ex = getCurrentExercise();

  // v48: the round-1 floor sits on top of round 1's last move.
  if (state.roundBreak) {
    return renderRoundBreak(w);
  }

  if (state.isResting) {
    return renderRestScreen(w);
  }

  // Cool-down stretches render as a single scrollable list, not stepped cards.
  if (state.currentPhase === 'cooldown') {
    return renderCooldownList(w);
  }

  if (!ex) {
    return `<div class="empty">Done!</div>`;
  }

  const header = `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${renderProgressLine(w)}`;

  // v48 · P3 (Sep 24 2026) — the cardio CHOICE (no lane picked, no walk
  // running). Her walk: "one green Elliptical button, Walk and Apartment small
  // and side by side, and a quiet 'Skip cardio today' link" (walk-in-her-shoes
  // §Step 1). Decision Q4: Apartment kept, small, half-width next to Walk. No
  // trail-runner photo, no 30-min video, no note about the walk (all written
  // for the walk alone), and no Done · Next — it skipped cardio without saying so.
  if (ex.name === 'Outdoor walk' && workoutWalkStart() === null) {
    return `
      ${header}
      <div class="card">
        <div class="exercise-display">
          <div class="exercise-name-row"><div class="exercise-name">${displayName(ex)}</div></div>
          <div class="exercise-reps">${walkStepMinutes(ex)} min</div>
          <p class="exercise-safety">Conversational pace</p>
          <div class="cardio-choice">
            <button class="btn-large btn-primary" id="ww-elliptical" type="button">▶ Elliptical</button>
            <div class="cardio-choice-row">
              <button class="cardio-half" id="ww-start" type="button"><span class="cardio-half-main">🚶 Walk outside</span><span class="cardio-half-sub">tap as you head out</span></button>
              <button class="cardio-half" id="ww-apartment" type="button"><span class="cardio-half-main">🏠 Apartment</span></button>
            </div>
            <button class="back-link cardio-skip" id="ww-skip" type="button">Skip cardio today</button>
          </div>
        </div>
      </div>
      ${canGoBack() ? renderActionBar(`<div class="step-nav"><button class="btn-large btn-back" id="step-back" type="button" aria-label="Back one step">‹ Back</button></div>`) : ''}
    `;
  }

  // v48 · P3: the walk, once she tapped it — minutes only ("Walking · 12 min";
  // the GPS + step counters are archived). The phone is in her pocket: no
  // picture, no form card — the live line and Done are the whole interface.
  // v58 fix pass (Sep 28 2026, checker's should #4): this branch never called
  // renderMoveFeel, so the walk-outside lane — unlike the elliptical and
  // apartment lanes, which both reuse the same call — never showed the
  // Easy/Right/Hard chip on a week the ride slot stepped (0 chips after
  // ▶ Walk outside, vs. the elliptical lane, which worked). No
  // laneRan/timerIdle boundary exists here (the walk stays live the whole
  // time she's on this screen, tracked in the background, not gated behind a
  // Start/Stop timer the indoor lanes have), so `ready: true` — same as the
  // elliptical's own post-ride branch below — lets her tap it any time on
  // this screen, same as every other reps-based move.
  // v59 fix pass (Sep 28 2026, CHECK-v58 round 2 nice #R2-N2): `ready: true`
  // meant the chip appeared the instant she tapped ▶ Walk outside —
  // "Walking · 0 min · how did it feel?", nothing to have an opinion about
  // yet. renderMoveFeel's own `ready` gate stays true (curl/row-style — she
  // can tap it any time once it's showing); the WHETHER-it-shows question
  // moves to the wrapper below instead, gated on real elapsed time
  // (walkFeelReady) and kept live by the 30 s tick (updateWalkLiveLine, a
  // class toggle only — never a full render() mid-walk).
  if (ex.name === 'Outdoor walk') {
    const feelHtml = renderMoveFeel(ex, { hold: false, ready: true, isLastRoundOrNA: true });
    const feelReady = walkFeelReady(workoutWalkStart());
    return `
      ${header}
      <div class="card">
        <div class="exercise-display">
          <div class="exercise-name-row"><div class="exercise-name">${displayName(ex)}</div></div>
          <div class="exercise-reps">${walkStepMinutes(ex)} min</div>
          <p class="walk-live-line">🚶 <span id="walk-live">${walkLiveText(workoutWalkStart())}</span></p>
          <p class="gear-note">It saves with this workout. Tap Done · Next when you're back.</p>
          ${feelHtml ? `<div id="walk-move-feel-slot" class="${feelReady ? '' : 'wt-hidden'}">${feelHtml}</div>` : ''}
        </div>
      </div>
      ${renderStepNav('Done · Next')}
    `;
  }

  if (ex.name === ELLIPTICAL_NAME) {
    return renderEllipticalStep(ex, header);
  }

  const showTempo = ex.reps?.includes('3-1-3') ?? false;
  // v46: an indoor lane whose timer has RUN this session and is idle again =
  // the ride is done (the apartment lane here; the elliptical has its own step).
  const indoorLane = isIndoorLane(ex.name);
  const laneRan = indoorLane && localStorage.getItem(WW_LANE_STARTED_KEY) !== null;
  const timerIdle = state.timerSeconds === 0 && state.preCountdown === 0;
  const hold = isHoldStep(ex);
  // v60: a multi-set hold is "ran" (sage Done · Next, the move-feel chip
  // ready) only once EVERY prescribed set is done — one set in isn't the
  // green light the single-set path's `heldOnThisStep() > 0` already is.
  const holdSets = hold ? setsPrescribed(ex.reps) : 1;
  const holdRan =
    hold &&
    (holdSets > 1
      ? (state.heldSetsFor[holdStepKey()] ?? []).length >= holdSets
      : heldOnThisStep() > 0);
  const safety = ex.safety ?? SAFETY_LINE[ex.name];
  // v48 · P3: never on a lane — the apartment step isn't in PROGRAM, so it read
  // as "New tonight" every week (the elliptical has its own "First ride").
  // v48 · fix r1: a returning move reads "Back tonight", never "New".
  // v54: Workout D never reaches this generic branch (its one step is the
  // elliptical, handled above) — the 'D' exclusion here is type-safety only.
  const kind =
    !indoorLane && state.selectedWorkout !== null && state.selectedWorkout !== 'D'
      ? tonightKind(ex, state.selectedWorkout)
      : null;

  // v48: a hold's timer comes straight after name + reps + safety line — it IS
  // the step. It used to sit under a 257 px picture, below the fold.
  const holdTimer = hold ? renderHoldTimerCard(ex, showTempo) : '';

  // v48 · P3: the apartment lane shares the elliptical's timer card (no 3-2-1,
  // a quiet Stop, the done face).
  const laneTimer = indoorLane
    ? renderLaneTimerCard(ex, laneRan)
    : !ex.isTimed && showTempo
      ? `<div class="card">${renderTempoBar()}</div>`
      : '';

  return `
    ${header}

    <div class="card">
      <div class="exercise-display">
        <div class="exercise-name-row">
          <div class="exercise-name">${displayName(ex)}</div>
          ${kind ? `<span class="new-tonight-badge">${kind === 'new' ? 'New tonight' : 'Again tonight'}</span>` : ''}
        </div>
        <div class="exercise-reps">${ex.reps ?? ''}</div>
        ${renderArmFeel(ex)}
        ${renderMoveFeel(ex, {
          hold,
          ready: hold ? holdRan : indoorLane ? laneRan && timerIdle : true,
          isLastRoundOrNA:
            state.currentPhase !== 'main' || state.currentRound === effectiveRounds(w),
        })}
        ${safety ? `<p class="exercise-safety">${escapeHtml(safety)}</p>` : ''}
        ${renderTipsExpander(ex, safety)}
        ${renderExerciseSetup(ex)}
        ${
          ex.name === APARTMENT_CARDIO_NAME
            ? `<div class="ww-start-block"><button class="cardio-alt-btn" id="ww-outdoor" type="button">↩ Elliptical or walk instead</button></div>`
            : ''
        }
      </div>
    </div>

    ${holdTimer}

    ${renderExerciseVisual(ex.name, isLaterRound())}

    ${laneTimer}

    ${
      // The guided indoor strip sits directly under the countdown it's derived
      // from, so "how long left" and "what am I doing" read as one block.
      ex.name === APARTMENT_CARDIO_NAME
        ? renderApartmentRoutine(
            ex.durationSec ?? 0,
            state.timerSeconds > 0 ? state.timerSeconds : (ex.durationSec ?? 0),
            state.timerSeconds > 0
          )
        : ''
    }

    ${EXERCISE_DETAIL[ex.name] ? renderDetailCard(ex.name) : renderHowToCard(ex.name)}

    ${
      // v48: on a hold, Done stays quiet until the timer has run on this step
      // (the sage belongs to Start timer until then) — one sage per screen.
      // v48 · P3: the same for the apartment lane until its timer has run.
      renderStepNav('Done · Next', (hold && !holdRan) || (indoorLane && !(laneRan && timerIdle)))
    }
  `;
}

// v54 (Sep 27 2026) — how many sets a move's own `reps` text says ("2 sets ·
// 12 reps", "2 sets · 12 reps each side"). An "N sets" / "N ×" / "N x" count
// anywhere in the string; anything else (no match, or N <= 1) is a
// single-set move and unaffected — same "single-set holds don't change"
// convention as F1's own wall-lean-sets spec (PLAN-2026-09-26.md §7 F1),
// applied here to the Easy/Right/Hard chip instead of a timer.
// v58 fix pass (Sep 28 2026, checker's should #3): used to anchor the count
// to the very START of the string (`^`), so "12 reps · 2 sets each round"
// (hip hinge's own reps text — the count sits AFTER the reps number, not
// before it) never matched at all and read as single-set. The chip then
// showed the instant round 2's step appeared, before either set was done,
// instead of waiting for "Set 2 done" the way curl/row's own 2-set moves
// already do. Searching anywhere (dropping the `^`) finds "2 sets" wherever
// it sits; "sets?"/×/x still can't false-match a hold's "2-sec hold" or a
// tempo's "3-1-3" (no digit-then-whitespace-then-s/x there).
function multiSetCount(reps: string | undefined): number {
  const m = /(\d+)\s*(?:sets?|[×x])\b/i.exec((reps ?? '').trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 1 ? n : 1;
}

// v48 · P5 (Sep 24 2026): "How did it feel?" on the 1 kg curl and the prone
// row — three small chips, optional; tap selects, tap again clears. Quiet
// (outlined), so Done · Next stays the one sage on the step.
//
// v54 (Sep 27 2026) — CHIP AFTER THE LAST SET. Her Sep 27 reflection: "for
// the good right hard... there's two sets? Maybe I should only do on the
// second time? Should I do both times?" Both curl and the prone row say "2
// sets" in their own reps text, done off ONE screen with no timer between
// them (no Start/Stop boundary the app can see) — so before this, the chip
// simply appeared the instant the step did, with nothing marking "you've
// actually finished both sets" first. Now a multi-set move shows a plain "Set
// X done" tap instead, and the chip itself waits for the LAST one: it never
// asks the question after only set 1. A single-set move (multiSetCount <= 1)
// is unchanged — chip shows immediately, exactly as before.
// v55 (Sep 27 2026) — LOAD CHIP: "1 kg · 2 kg" per SET, her pick by pain
// ("no Lisa approval, I decide based on pain", Sep 26 23:15). Default is
// whatever state.armLoad already holds (set at session start by
// defaultArmLoad — last used, else 1 kg); tapping just selects, never clears.
function renderArmLoadChips(step: 'curl' | 'row'): string {
  const current = state.armLoad[step] ?? '1kg';
  const chips = ARM_LOAD_VALUES.map((load) => {
    const on = current === load;
    const label = load === '1kg' ? '1 kg' : '2 kg';
    return `<button class="arm-load-chip${on ? ' arm-load-chip-on' : ''}" type="button" data-arm-load-step="${step}" data-arm-load="${load}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `<div class="arm-load-row" role="group" aria-label="Load">${chips}</div>`;
}

// v55 — the pace rule from training-review v2 item 5, said ONCE (ever, this
// device) right on the step, not repeated every set/session: "Easy twice at
// 15 slow reps + pain gone by morning → try 2 kg on the first set."
// v55 · fix r1 (Sep 27 2026): used to mark itself seen INSIDE render() — so
// it vanished on the very next re-render, including her first tap on a load
// chip, before she'd necessarily read it. Now it only reads the flag here;
// markPaceRuleSeen() (below) sets it, called from the "Set N done" tap —
// same convention as the CHIP AFTER THE LAST SET timing already uses.
// Storage blocked → it just shows every time (never crashes, never blocks).
function renderPaceRuleOnce(): string {
  try {
    if (localStorage.getItem(PACE_RULE_SEEN_KEY) === '1') return '';
  } catch {
    // storage blocked — fall through and show it this render
  }
  return `<p class="arm-load-pace-rule">Easy twice at 15 slow reps + pain gone by morning → try 2 kg on the first set.</p>`;
}

function markPaceRuleSeen(): void {
  try {
    localStorage.setItem(PACE_RULE_SEEN_KEY, '1');
  } catch {
    // non-fatal — the rule just keeps showing every time
  }
}

function renderArmFeel(ex: Exercise): string {
  const step = ARM_FEEL_STEPS[ex.name];
  if (!step) return '';
  const total = multiSetCount(ex.reps);
  const done = Math.min(state.setsDoneFor[ex.name] ?? 0, total);
  const loadRow = renderArmLoadChips(step);
  if (total > 1 && done < total) {
    return `
      <div class="arm-feel arm-feel-sets" role="group" aria-label="Sets">
        <span class="arm-feel-label">Set ${done + 1} of ${total}</span>
        ${loadRow}
        ${step === 'curl' ? renderPaceRuleOnce() : ''}
        <button class="arm-set-btn" type="button" data-mark-set="${escapeHtml(ex.name)}">Set ${done + 1} done</button>
      </div>`;
  }
  const current = state.armFeel[step];
  const chips = ARM_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-arm-step="${step}" data-arm-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `
    <div class="arm-feel" role="group" aria-label="How did it feel?">
      ${total > 1 ? `<span class="arm-feel-label arm-feel-sets-done">${total} sets ✓</span>` : ''}
      ${loadRow}
      ${step === 'curl' ? renderPaceRuleOnce() : ''}
      <span class="arm-feel-label">How did it feel?</span>
      <div class="arm-feel-chips">${chips}</div>
    </div>`;
}

// v58 (Sep 28 2026) — the SAME chip, generalized to every move that stepped
// this week (never curl/row — renderArmFeel above still owns those). Gating
// is the same "after the last set (or after the timer/ride ends)" rule
// renderArmFeel already proved (CHIP AFTER THE LAST SET, v54): a hold waits
// for holdRan, a cardio lane waits for laneRan && timerIdle, a multi-set
// reps move reuses the exact same setsDoneFor + "Set N done" mechanism
// (data-mark-set is already keyed by exercise NAME, not curl/row-specific —
// no new tap handler needed for that half). A main-phase move that repeats
// across rounds only asks on its LAST round (`isLastRoundOrNA`) — asking the
// same question every round would be noise, and there's no per-round
// boundary here the way curl/row's "2 sets, one screen" already has one.
function renderMoveFeel(
  ex: Exercise,
  gate: { hold: boolean; ready: boolean; isLastRoundOrNA: boolean }
): string {
  if (ARM_FEEL_STEPS[ex.name]) return ''; // curl/row keep arm_feel, unmigrated
  if (!gate.isLastRoundOrNA) return '';
  const stepped = currentSteppedMoves().find((s) => s.name === canonicalMoveName(ex.name));
  if (!stepped) return '';
  if (!gate.ready) return '';
  const total = multiSetCount(ex.reps);
  const done = Math.min(state.setsDoneFor[ex.name] ?? 0, total);
  if (!gate.hold && total > 1 && done < total) {
    return `
      <div class="move-feel move-feel-sets" role="group" aria-label="Sets">
        <span class="move-feel-label">Set ${done + 1} of ${total}</span>
        <button class="arm-set-btn" type="button" data-mark-set="${escapeHtml(ex.name)}">Set ${done + 1} done</button>
      </div>`;
  }
  const current = state.moveFeel[stepped.slug];
  const chips = MOVE_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-move-feel-slug="${stepped.slug}" data-move-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `
    <div class="move-feel" role="group" aria-label="How did it feel?">
      <span class="move-feel-label">Stepped this week — how did it feel?</span>
      <div class="arm-feel-chips">${chips}</div>
    </div>`;
}

// v49 · look (Sep 25 2026): "41 min · both rounds · 1 of 3 this week" — every
// value already exists on state/the week count (spec §6 "Post-log sub-lines").
// Round count is an honest preview (the real save recomputes it); the week
// count includes the session about to be saved (+1), since that's the number
// she's about to see on Home the moment she taps Save.
// T1 fix r1 (Sep 27 2026, checker's should #4): the app-time minutes (the
// tap-to-tap clock, from state.startedAt) used to open this line too — once
// she answers the new Finishing "Right?" question, renderTimeResult's own
// "About N min of training" (HER times) shows up a few lines below it,
// contradicting this line's app-time minutes on the same screen (T1's own
// §3: "app time is never shown as workout time again"). Dropped here —
// her confirmed timing is the only duration this screen states now.
function postLogWitnessLine(w: Workout): string {
  const parts: string[] = [];
  // v49 · look fix (Sep 25 2026): the round count has to be the day's EFFECTIVE
  // rounds — Lite, or "Finish here — it still counts" (finishAtRoundOne sets
  // liteDay too) — not the full program's w.rounds. The line was saying "both
  // rounds" on exactly the days she only did one (Opus check).
  const rounds = effectiveRounds(w);
  if (rounds === 2) parts.push(state.currentRound >= 2 ? 'both rounds' : '1 round');
  else if (rounds > 2) parts.push(`${state.currentRound} of ${rounds} rounds`);
  else parts.push('1 round'); // effectiveRounds 1 — e.g. Lite on a 2-round day (C)
  // v54 fix r1 (Sep 27 2026): D is extra, never one of the 3 letters — the
  // checker caught this line still doing `doneLetters.add('D')`, which
  // inflated the count and contradicted the 19:17 decision that D never
  // counts toward 3 of 3. Say what's true instead of a week fraction.
  if (state.selectedWorkout === 'D') {
    parts.push('extra, on top of A/B/C');
    return parts.join(' · ');
  }
  // WK2 (Sep 27 2026): post-launch, "this week" becomes "in Week N" — the
  // completion model's own week, not the calendar's (§2.4 "Post-log line":
  // "1 round · 2 of 3 in Week 5"). Pre-launch (or a mocked earlier date)
  // keeps the original calendar count untouched.
  if (!isNowAfterCompletionLaunch()) {
    parts.push(`${getWeekCount(0) + 1} of 3 this week`);
  } else {
    const shown = shownWeek();
    // WK2 fix r1 (checker's should #1): during a gap, this save actually
    // counts BACKWARD (week.ts rule 3) into the week that just closed — say
    // that truth, consistent with what weekOf will resolve to once saved,
    // not the pending week's own (not-yet-real) count.
    // v61 fix pass (Sep 28 2026, CHECK-v61 should #4): both branches below
    // used to stay at "of 3" after the Home/weekly-review line (weekCountLine)
    // widened to "of 4" — the same D read those use (weekHasD on the raw
    // logs, week.ts drops D from its own model by design).
    // v61 fix pass 2 (Oct 2 2026): one `weekModel()` call shared by both
    // branches — the gap branch needs `open`/`pending` too now (not just
    // `spans`), for week-d.ts's own window end (see its header).
    const dLogs = loadLogs().filter((l) => l.workout === 'D');
    const model = weekModel();
    const backWeek = gapCountsBackToWeekNum();
    if (backWeek !== null) {
      // WK2 fix r2 (Sep 27 2026, checker's nice #6): "(already 3 of 3)" was
      // hard-coded — true today (a gap only ever exists after a 'three'
      // close, since WK3's "moved on" isn't shipped yet), but it'll be wrong
      // the day a moved-on week (1 or 2 done) exists. Read the real count off
      // the actual closed span instead of assuming it.
      const { spans } = model;
      const lastSpan = spans.length ? spans[spans.length - 1] : null;
      const closedDone = lastSpan ? lastSpan.done.length : 3;
      const closedHasD = weekHasDFor(lastSpan ? { span: lastSpan } : null, model, dLogs);
      parts.push(
        `an extra for Week ${backWeek} (already ${closedDone + (closedHasD ? 1 : 0)} of 4)`
      );
    } else {
      // WK2 fix r1 (Sep 27 2026, checker's should #2): `.done.length + 1`
      // overcounts a REPEAT letter — doing A a second time in a week that
      // already has A showed "2 of 3 in Week 5" here while Home and the Done
      // card (which both count DISTINCT letters, per week.ts's own `done`
      // semantics) correctly stayed at "1 of 3". Count distinct letters the
      // same way everywhere instead of always adding one.
      const doneLetters = new Set<string>(shown.span?.done ?? []);
      if (state.selectedWorkout) doneLetters.add(state.selectedWorkout);
      const hasD = weekHasDFor(liveWeekDTarget(shown), model, dLogs);
      parts.push(`${doneLetters.size + (hasD ? 1 : 0)} of 4 in Week ${shown.key.week}`);
    }
  }
  return parts.join(' · ');
}

// T1 §3.2: "Breaks?": None · ~5 · ~15 · ~30+, data-break = 0/5/15/30.
// Same toggle-again-to-clear shape as the 1-10 body chips (attachHandlers'
// [data-body-chip] block) — untouched/cleared reads back as null, never 0;
// "None" is its own explicit tap that means a real, confirmed zero.
function renderBreakChips(value: number | null): string {
  // T1 fix r1 (Sep 27 2026, checker's nice #3): "~5 min"/"~15 min" wrapped
  // onto two lines in the 4-column grid at 412px — "min" is redundant next
  // to the "Breaks?" label right above, so it's dropped instead of shrinking
  // the tap-target font.
  const chips: { label: string; mins: number }[] = [
    { label: 'None', mins: 0 },
    { label: '~5', mins: 5 },
    { label: '~15', mins: 15 },
    { label: '~30+', mins: 30 },
  ];
  const row = chips
    .map((c) => {
      const on = value === c.mins;
      return `<button class="timing-break-chip${on ? ' timing-break-chip-on' : ''}" type="button" data-break="${c.mins}" aria-pressed="${on ? 'true' : 'false'}">${c.label}</button>`;
    })
    .join('');
  return `
    <div class="field timing-break-field">
      <span class="label-text">Breaks?</span>
      <div class="timing-break-row" id="break-chips">${row}</div>
    </div>`;
}

// T1 §3.2: "only when both are confirmed: `About 45 min of training`,
// rounded to 5." Reads state directly (not formatWorkoutTime — that's T2's
// universal "about N min" string; this card's own wording is its own).
function renderTimeResult(): string {
  if (!state.herStartConfirmed || !state.herEndConfirmed) return '';
  const minutes = trainingMinutes({
    herStartAt: state.herStartAt,
    herStartConfirmed: state.herStartConfirmed,
    herEndAt: state.herEndAt,
    herEndConfirmed: state.herEndConfirmed,
    breakMinutes: state.breakMinutes,
  });
  if (minutes === null) return '';
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return `<p class="timing-result" id="time-result">About ${rounded} min of training</p>`;
}

// T1 §3.2: "If the finish is before the start: an inline ... Save still
// works (never block a save)." herStartAt is always set by this screen
// (beginExercises() finalized it) — only herEndConfirmed gates this, so the
// warning appears the moment she answers the finish question, before Save.
function finishBeforeStartWarning(): string {
  if (!state.herEndConfirmed || !state.herStartAt || !state.herEndAt) return '';
  const backwards = new Date(state.herEndAt).getTime() < new Date(state.herStartAt).getTime();
  return backwards
    ? `<p class="timing-warning" id="time-warning">Finish is before the start — check the times.</p>`
    : '';
}

function renderPostLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // v48 · P5 (Sep 24 2026) — every field is one tap or skippable, and Save is
  // pinned (her walk: "the body slider starts at 5 again. The keyboard covers
  // Save while I type my word"). Untouched still saves null (v46).
  // Wall sit only on a workout that has one — on C it asked a question she
  // can't answer (uxui post-log 3/5). Pre-filled from the timer.
  const wallSitField =
    workoutHasWallSit(w) && (state.stoppedEarlyAt === null || reachedWallSit(w))
      ? `<label class="field">
        <span class="label-text">${state.wallSitSec > 0 ? `Wall sit ${state.wallSitSec} s (tap to adjust)` : 'Wall sit (s)'}</span>
        <input type="number" id="wallsit" min="0" max="600" inputmode="numeric" value="${state.wallSitSec > 0 ? state.wallSitSec : ''}" />
      </label>`
      : '';
  // Back & wrist: ONE combined control (DECISIONS §5 — 34 of 39 rows are 0,
  // and a truthful 0 used to take a drag away and back).
  // v49 · engine fix (Sep 25 2026): the Sep 24 build gave wrist its OWN
  // Fine/Something row — a normal clean session went from 1 tap (Fine) to 2
  // (Back Fine + Wrist Fine), which the commit message wrongly called
  // "same tap cost either way" (spec §6: "Back & wrist: Fine · Back ·
  // Wrist" is ONE control). Fine now writes both back=0 and wrist=0 in one
  // tap; Back/Wrist each open their own 1-10 row (2 taps), same as before.
  // #back-fine/#back-some/#wrist-some keep their ids so the already-shipped
  // tests (tests/screens/*.spec.ts) still hold.
  // v51 (Sep 25 2026): markup now comes from the shared renderBackWristControl
  // (same component the pre-log reading uses) — ids/groups passed in exactly
  // as before, so the rendered HTML is unchanged.
  const backSome = state.backSomethingOpen || (state.backPainTouched && state.backPain > 0);
  const wristSome = state.wristSomethingOpen || (state.wristPainTouched && state.wristPain > 0);
  const backWristAfter = renderBackWristControl({
    fineId: 'back-fine',
    backSomeId: 'back-some',
    wristSomeId: 'wrist-some',
    backChipGroup: 'back',
    wristChipGroup: 'wrist',
    backValue: state.backPain,
    backTouched: state.backPainTouched,
    backOpen: backSome,
    wristValue: state.wristPain,
    wristTouched: state.wristPainTouched,
    wristOpen: wristSome,
  });
  // v48 · fix r1 (Sep 24 2026): a stopped session is not called "done", and its
  // Back goes to the step she stopped on, not to stretches she never reached.
  // Still counts, no verdict.
  const stopped = state.stoppedEarlyAt !== null;
  // v48 · final (Sep 25 2026): "Logged what you did" claimed a save before
  // Save was tapped — if she backed out, nothing was stored. Say what IS true.
  const title = stopped ? `Stopped early · Workout ${w.id}` : `Nice. Workout ${w.id} done.`;
  // v54 fix r1 (Sep 27 2026): D has no cooldown (warmup: [ellipticalStep(30)],
  // main: [], cooldown: []) — "‹ Back to the stretches" used to open an empty
  // cool-down screen ("~1 min · 0 of 0"). D's only step is the ride itself, so
  // the way back is to the ride-numbers screen (backToStretches special-cases
  // w.id === 'D' the same way).
  const backLink = stopped
    ? `<button class="back-link postlog-back" id="back-to-workout" type="button">‹ Back to the workout</button>`
    : w.id === 'D'
      ? `<button class="back-link postlog-back" id="back-to-stretches" type="button">‹ Back to the ride</button>`
      : `<button class="back-link postlog-back" id="back-to-stretches" type="button">‹ Back to the stretches</button>`;
  // v49 · look (Sep 25 2026): the witness line — spec §5 frame 5, "41 min ·
  // both rounds · 1 of 3 this week", movement with no verdict (guide §2).
  // Never shown on a stopped session: its duration and round count are both
  // honest-but-partial, and the title already says "Stopped early".
  const witnessLine = stopped ? '' : postLogWitnessLine(w);
  // v50 · jump list (Sep 25 2026): plain, no verdict — "the log screen says so
  // plainly ('2 moves skipped')" per her spec. Session still saves either way.
  const skippedCount = skippedStepsCount(w);
  const skippedLine =
    skippedCount > 0
      ? `<p class="postlog-skipped">${skippedCount} move${skippedCount === 1 ? '' : 's'} skipped</p>`
      : '';
  // v48 · final (Sep 25 2026): the way back lives at the top now. At the
  // bottom it sat exactly where Done · Finish was tapped a moment earlier, so
  // a double or slow second tap bounced her back to the stretches.
  return `
    <div class="postlog-top">${backLink}</div>
    <h2>${title}</h2>
    ${witnessLine ? `<p class="postlog-witness">${escapeHtml(witnessLine)}</p>` : ''}
    ${skippedLine}
    <p class="subtitle">Quick log — or just Save.</p>

    <div class="card timing-card">
      ${renderTimeConfirmBlock({
        kind: 'end',
        label: 'Finishing',
        at: state.herEndAt,
        confirmed: state.herEndConfirmed,
        editingOpen: state.herEndEditingOpen,
      })}
      ${renderBreakChips(state.breakMinutes)}
      ${finishBeforeStartWarning()}
      ${renderTimeResult()}
    </div>

    <div class="card postlog-card">
      ${renderBodyChips('cap-after', state.capacityAfter, state.capacityAfterTouched, 'Your BODY now, not your mood')}
      ${renderBodyChips('mood-after', state.moodAfter, state.moodAfterTouched, 'Mood', '1 irritable · 10 happy / calm')}

      ${wallSitField}

      ${backWristAfter}

      <label class="field note-field">
        <span class="label-text">Anything about today? (optional)</span>
        <textarea id="session-note" rows="3" maxlength="500" dir="auto" enterkeyhint="done" placeholder="Knee fine, stopped the elliptical early…">${escapeHtml(state.sessionNote)}</textarea>
      </label>
    </div>

    ${renderActionBar(`
      <button class="btn-large btn-primary" id="save-log" type="button">Save</button>
    `)}
  `;
}

// v48 · P5 (Sep 24 2026): the one screen v47's Back missed — her words: "i need
// to be able to go back". Returns to the cool-down list; nothing is logged.
function backToStretches(): void {
  endPostLogClockTick(); // T1: leaving post-log — the finish-time question isn't showing any more
  state.screen = 'workout';
  // v54 fix r1 (Sep 27 2026): D's cooldown is empty (getWorkoutD: main: [],
  // cooldown: []) — the button read "‹ Back to the ride" for D (see its own
  // comment), so land back on the ride-numbers screen, not an empty cool-down.
  if (state.selectedWorkout === 'D') {
    state.currentPhase = 'warmup';
    state.currentExerciseIndex = 0;
    state.rideNumbersOpen = true;
  } else {
    state.currentPhase = 'cooldown';
    state.currentExerciseIndex = 0;
  }
  state.isResting = false;
  state.roundBreak = false;
  render();
}

// v48 · fix r1 (Sep 24 2026): after "Log what I did" the log's Back returns to
// the step she stopped on — not to stretches she never reached — and undoes the
// stop (marker cleared, Lite back to what it was). logWhatIDid left the phase,
// round and step untouched, so the workout picks up exactly there.
function backToWorkoutFromStop(): void {
  endPostLogClockTick(); // T1: leaving post-log — see backToStretches's own comment
  if (state.stoppedEarlyLitePrev !== null) state.liteDay = state.stoppedEarlyLitePrev;
  state.stoppedEarlyAt = null;
  state.stoppedEarlyLitePrev = null;
  state.screen = 'workout';
  state.isResting = false;
  state.roundBreak = false;
  render();
}

// ---------------------------------------------------------------------------
// SESSIONS (v48 · P6, Sep 24 2026). DECISIONS §5 Sessions + Session detail:
// "Three names for one thing, and a Back at the bottom only here" (uxui history
// 3/5) → one name (Sessions / Session), ONE row template for Sessions AND Weekly
// review, × Back in the header, the list's scroll kept when she comes back.
// Voice rule: her words verbatim, never the tail of a machine log line.
// ---------------------------------------------------------------------------

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Sat Sep 19" — the weekday makes the Saturday swing readable in the list.
function formatRowDate(iso: string): string {
  const d = new Date(iso);
  return `${SHORT_WEEKDAYS[d.getDay()]} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// "18:31" — the 24-hour clock she reads (the old locale time could come out as
// "06:31 PM" on one phone and "18:31" on another).
function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// T1 (Sep 27 2026), §3.1's ✎ time box — formatClock's inverse. Takes the
// calendar day from `baseIso` (the candidate she's fixing — always tonight,
// never a date she has to also type) and the clock from the native
// `<input type=time>`'s own "HH:MM" value.
function combineDateAndClock(baseIso: string, hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return baseIso;
  const base = new Date(baseIso);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const combined = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hours,
    minutes,
    0,
    0
  );
  return combined.toISOString();
}

// "Elliptical 10 min · L7 · 1.4 km · 63.4 kcal · 10:02 · pulse 128" /
// "Apartment 10 min" / "Walk 12 min".
function cardioText(c: SessionCardio): string {
  const mins = c.minutes !== null ? ` ${c.minutes} min` : '';
  if (c.lane === 'elliptical') {
    return [
      `Elliptical${mins}`,
      c.level !== null ? `L${c.level}` : '',
      c.km !== null ? `${c.km} km` : '',
      c.kcal !== null ? `${c.kcal} kcal` : '',
      c.timeSec !== null ? formatMmSs(c.timeSec) : '',
      c.pulse !== null ? `pulse ${c.pulse}` : '',
    ]
      .filter((s) => s !== '')
      .join(' · ');
  }
  return `${c.lane === 'apartment' ? 'Apartment' : 'Walk'}${mins}`;
}

// Her words for one session, verbatim: the v48 note, the old one-word box, and
// (v47 rows) whatever she wrote into notes — the machine marker and the app's
// annotations stripped off. One entry per line.
function sessionWords(l: LogEntry): string {
  const parts: string[] = [];
  const note = (l.sessionNote ?? '').trim();
  if (note) parts.push(note);
  const word = (l.word || '').trim();
  if (word && word !== note) parts.push(word);
  parts.push(...splitNotes(l.notes).words);
  return parts.join('\n');
}

// "curl=easy;row=right" → "curl easy · row right".
function armFeelText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(';')
    .map((p) => p.split('=').join(' '))
    .filter((p) => p.trim() !== '')
    .join(' · ');
}

// The back-pain number turns amber only at her own stop line — "Back pain at
// 3/10 → stop that exercise". A 1/10 lit up like a verdict (uxui weekly 2/5).
const BACK_PAIN_STOP_AT = 3;

// ONE row, everywhere a session is listed (Sessions, Weekly review):
// badge · "Sat Sep 19 · 40 min" · the wall-sit sparkline (A only) · a dim meta
// line · her words, verbatim. `logs` = newest-first by date (for the sparkline).
function renderSessionRow(l: LogEntry, logs: LogEntry[]): string {
  const idAttr = l.id ? `data-detail="${escapeHtml(l.id)}"` : '';
  const trend = l.workout === 'A' && l.wallSitSec > 0 ? getWallSitTrend(logs, l.id ?? null) : [];
  const spark = renderSparkline(trend);
  // v53 (Sep 26 2026): "back pain" (was "back") — labeled, not converted. The
  // stored number here is still PAIN (higher = worse); only the live 1-10
  // TAP on the pre/post-log screens flipped to "feel" (10 = fine). Naming
  // this one plainly as pain keeps the two screens from reading as the same
  // scale in opposite directions (her ask: "make it all align").
  const back =
    l.backPain === null
      ? 'back pain —'
      : `back pain <span class="session-back${l.backPain >= BACK_PAIN_STOP_AT ? ' session-back-warn' : ''}">${l.backPain}</span>`;
  const wall =
    // v46: B and C have no wall sit — "wall 0s" there read as a zero.
    l.wallSitSec > 0 || l.workout === 'A' ? ` · wall ${l.wallSitSec}s` : '';
  const words = sessionWords(l).split('\n')[0] ?? '';
  // T2 (Sep 27 2026), PLAN-2026-09-26.md §3.4/§10: "about N min" through the
  // one shared formatter, never the app's own tap-to-tap durationSec — that
  // was "76 min"/"1s" shown as fact (her 22:33 "it really doesn't know
  // timing"). formatWorkoutTime already returns '' on an unconfirmed/old row
  // (no her_start_at/her_end_at pair), which is the honest "old rows show no
  // length" behavior §3.4 asks for — no fallback needed here.
  const workoutTime = formatWorkoutTime(l);
  return `
    <button class="history-row history-row-btn session-row" ${idAttr} type="button">
      <span class="history-workout-badge">${l.workout}</span>
      <div class="session-row-body">
        <div class="history-date">${formatRowDate(l.date)}${workoutTime ? ` · ${workoutTime}` : ''}${spark ? ` <span class="history-sparkline-wrap">${spark}</span>` : ''}</div>
        <div class="history-meta">cap ${l.capacityBefore ?? '—'}→${l.capacityAfter ?? '—'}${wall} · ${back}</div>
        ${words ? `<div class="history-word" dir="auto">${escapeHtml(words)}</div>` : ''}
      </div>
      <span class="session-chev" aria-hidden="true">›</span>
    </button>`;
}

function logsNewestFirst(): LogEntry[] {
  return [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date));
}

function renderHistory(): string {
  const logs = logsNewestFirst();
  const header = `
    <div class="screen-header">
      <h2>Sessions</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;
  if (logs.length === 0) {
    return `${header}<p class="empty">No sessions yet.</p>`;
  }
  // T2 §3.4: said once, here, not per-row — a row before the launch just
  // shows no "· N min" (formatWorkoutTime returns '' for it), which would
  // otherwise read as a silent gap instead of an honest "the app didn't ask".
  // T2 fix r1 (Sep 27 2026, checker's nice): the old wording ("shows from
  // Sep 27 2026") named a hard date, but the real mechanism is whether SHE
  // confirmed her start/finish — a plain fact she can check, not a promise
  // about which rows are old.
  const lengthNote = `<p class="history-length-note">Workout length shows once you've said your start and finish times — from ${TIMING_LAUNCH_LABEL}.</p>`;
  return `${header}${lengthNote}<div class="card session-list">${logs.map((l) => renderSessionRow(l, logs)).join('')}</div>`;
}

// One label + value row on the Session screen; `stack` puts a long value under
// its label (her note), so the label never runs into the text (UX audit #12).
function detailRow(
  label: string,
  value: string,
  opts: { stack?: boolean; id?: string } = {}
): string {
  const id = opts.id ? ` id="${opts.id}"` : '';
  return opts.stack
    ? `<div class="detail-row detail-row-stack"><span class="detail-label">${label}</span><div class="detail-note"${id} dir="auto">${value}</div></div>`
    : `<div class="detail-row"><span class="detail-label">${label}</span><span${id}>${value}</span></div>`;
}

function renderHistoryDetail(): string {
  const logs = loadLogs();
  const log = logs.find((l) => l.id === state.historyDetailId);
  const header = `
    <div class="screen-header">
      <h2>Session</h2>
      <button class="quit-link" id="back-history" type="button">× Back</button>
    </div>`;
  if (!log) {
    return `${header}<p class="empty">That session isn't here anymore.</p>`;
  }
  // 10 rows → the ones that carry something (DECISIONS §5 Session detail).
  const rows: string[] = [];
  // T2 (Sep 27 2026) §3.4: the app's own open/close tap-time (`span`, from
  // startedAt/completedAt) is kept for CHECKING only from here down — it
  // used to be glued onto this same "Time" row as if it were how long she
  // trained ("TIME 21:48–22:14 · 26 min", her 22:33 "it really doesn't know
  // timing"). The row now shows only her confirmed workout time; `span`
  // moves to its own dim line below the card.
  const span =
    log.startedAt && log.completedAt
      ? `${formatClock(log.startedAt)}–${formatClock(log.completedAt)}`
      : log.startedAt
        ? `from ${formatClock(log.startedAt)}`
        : '';
  // T2 fix r1 (Sep 27 2026, checker's should #2): an unconfirmed row used to
  // push a "Time —" row here — the Sessions list above already says once,
  // at the top, that an old row shows no length, so a dash on every detail
  // repeated a gap she already knows about, and it's a row that "carries
  // nothing" (this card's own rule). Push it only when there's a real,
  // confirmed workout time to show; the dim "App open … — not workout time"
  // line below stays the one place an unconfirmed row is acknowledged.
  const workoutTime = formatWorkoutTime(log);
  if (workoutTime) rows.push(detailRow('Time', workoutTime));
  if (log.capacityBefore !== null || log.capacityAfter !== null) {
    rows.push(
      detailRow(
        'Capacity',
        log.capacityAfter === null
          ? `${log.capacityBefore}`
          : `${log.capacityBefore ?? '—'} → ${log.capacityAfter}`
      )
    );
  }
  // A is the only workout with a wall sit; on B/C the row asked about nothing.
  if (log.workout === 'A') {
    rows.push(detailRow('Wall sit', log.wallSitSec > 0 ? `${log.wallSitSec} s` : '—'));
  }
  rows.push(detailRow('Back pain', log.backPain === null ? '—' : `${log.backPain}/10`));
  // v54 fix r1 (Sep 27 2026), checker's nice #7: wristPain is optional AND
  // nullable (a pre-v49 row has no key at all) — `=== null` missed the
  // undefined case and printed "undefined/10". `== null` catches both.
  rows.push(detailRow('Wrist pain', log.wristPain == null ? '—' : `${log.wristPain}/10`));
  const cardio = sessionCardio(log);
  if (cardio)
    rows.push(detailRow('Cardio', escapeHtml(cardioText(cardio)), { id: 'detail-cardio' }));
  if (log.liteDay) {
    // Lite = one round less than the plan that week had. Swing fix (Sep 26
    // 2026): the plan follows the week the session counted toward. WK4 (Sep 27
    // 2026): planForLog resolves through the completion model post-launch —
    // see its own comment in program-week.ts, next to planDateForLog.
    const rounds = Math.max(1, planForLog(log).rounds - 1);
    rows.push(detailRow('Lite', `${rounds} round${rounds === 1 ? '' : 's'}`));
  }
  const arms = armFeelText(log.armFeel);
  if (arms) rows.push(detailRow('Arms', escapeHtml(arms)));
  const words = sessionWords(log);
  if (words) {
    rows.push(detailRow('Note', escapeHtml(words), { stack: true, id: 'detail-session-note' }));
  }
  const system = splitNotes(log.notes).system;
  if (system.length > 0) {
    rows.push(detailRow('System', escapeHtml(system.join(' · ')), { stack: true }));
  }
  // v53 fix (CHECK M2, Sep 26 2026): pendingEdit staying true (a queued edit
  // that hasn't landed, or a PATCH that failed/matched 0 rows) must be
  // VISIBLE here, on the one session this could be lost from — not just in
  // the header's generic "offline · N pending" count.
  const unsyncedLine = log.pendingEdit
    ? `<p class="detail-edit-unsynced" id="detail-edit-unsynced">Not saved online yet — will retry</p>`
    : '';
  // T2 §3.4: "one dim line for checking" — the app's own open/close tap-time,
  // labeled plainly so it never reads as a workout-length claim. Only when
  // there's a span to show at all (an old row with just `startedAt`, or none,
  // has nothing here to check against).
  const appTimeLine = span
    ? `<p class="detail-app-time" id="detail-app-time">App open ${span} — not workout time</p>`
    : '';
  return `
    ${header}
    <p class="detail-sub">Workout ${log.workout} · ${formatDateLong(log.date)}</p>
    <div class="card detail-card">${rows.join('')}</div>
    ${appTimeLine}
    ${unsyncedLine}
    <button class="btn-chip detail-edit-btn" id="edit-history-session" type="button">Edit</button>
  `;
}

// v53 (Sep 26 2026) — fix a past session's ride numbers. Her words: "I don't
// know how to update this information but ok workout b week 4 did on level 5,
// 10 min, .69 distant 62.4 calories... there have to be an easy way to enter
// the data." The Edit button on the Session screen above opens this: the same
// five console fields as the live ride-numbers screen (renderRideNumbersCard,
// same order — Time, Distance, Calories, Level, Pulse) plus her free-text
// note, but reading from/writing to the saved LogEntry instead of the live
// in-workout localStorage keys. Only these six fields ever change here
// (saveHistoryEdit) — never the date, the workout letter, or anything else on
// the session.
function openHistoryEdit(log: LogEntry): void {
  historyEditDraft = {
    timeStr: typeof log.ellipticalTimeSec === 'number' ? formatMmSs(log.ellipticalTimeSec) : '',
    kmStr: typeof log.ellipticalKm === 'number' ? String(log.ellipticalKm) : '',
    kcalStr: typeof log.ellipticalKcal === 'number' ? String(log.ellipticalKcal) : '',
    level: typeof log.ellipticalLevel === 'number' ? log.ellipticalLevel : null,
    pulseStr: typeof log.ellipticalPulse === 'number' ? String(log.ellipticalPulse) : '',
    note: log.sessionNote ?? '',
  };
  state.screen = 'history-edit';
  render();
}

// Same reading-row markup as renderRideNumbersCard (ell-reading classes), so
// the edit screen looks like the same control she already knows from the
// live ride — just aimed at a saved session instead of the one in progress.
function renderHistoryEditReadingRow(
  id: string,
  label: string,
  value: string,
  unit: string,
  opts: { type?: string; step?: string; min?: string; max?: string } = {}
): string {
  return `
      <label class="ell-reading" for="${id}">
        <span class="ell-reading-label">${label}</span>
        <span class="ell-reading-field">
          <input type="${opts.type ?? 'number'}" id="${id}" inputmode="${opts.type === 'text' ? 'numeric' : 'decimal'}" ${opts.step ? `step="${opts.step}"` : ''} ${opts.min ? `min="${opts.min}"` : ''} ${opts.max ? `max="${opts.max}"` : ''} placeholder="–" value="${escapeHtml(value)}" />
          ${unit ? `<span class="ell-reading-unit">${unit}</span>` : ''}
        </span>
      </label>`;
}

function renderHistoryEdit(): string {
  const header = `
    <div class="screen-header">
      <h2>Edit session</h2>
      <button class="quit-link" id="back-history-edit" type="button">× Back</button>
    </div>`;
  const log = loadLogs().find((l) => l.id === state.historyDetailId);
  if (!log || !historyEditDraft) {
    return `${header}<p class="empty">That session isn't here anymore.</p>`;
  }
  const draft = historyEditDraft;
  const level = draft.level;
  return `
    ${header}
    <p class="detail-sub">Workout ${log.workout} · ${formatDateLong(log.date)}</p>
    <div class="card ell-after-card">
      <div class="ell-readings-title">Ride numbers</div>
      <p class="ell-numbers-note">Only these numbers and the note change — nothing else about this session.</p>
      <div class="ell-readings-row">
        ${renderHistoryEditReadingRow('hist-time', 'Time', draft.timeStr, '', { type: 'text' })}
        ${renderHistoryEditReadingRow('hist-km', 'Distance', draft.kmStr, 'km', { step: '0.01', min: '0' })}
        ${renderHistoryEditReadingRow('hist-kcal', 'Calories', draft.kcalStr, 'kcal', { step: '0.1', min: '0' })}
      </div>
      <div class="ell-field ell-field-level">
        <span class="ell-field-label">Level</span>
        <div class="ell-level-controls">
          <div class="settings-stepper ell-stepper">
            <button class="settings-stepper-btn" id="hist-level-down" type="button" aria-label="Level down" ${level !== null && level <= 1 ? 'disabled' : ''}>−</button>
            <span class="settings-stepper-val${level === null ? ' is-empty' : ''}" id="hist-level">${level ?? '—'}</span>
            <button class="settings-stepper-btn" id="hist-level-up" type="button" aria-label="Level up" ${level !== null && level >= ELLIPTICAL_MAX_LEVEL ? 'disabled' : ''}>+</button>
          </div>
        </div>
      </div>
      <div class="ell-readings-row">
        ${renderHistoryEditReadingRow('hist-pulse', 'Pulse', draft.pulseStr, 'bpm', { step: '1', min: '30', max: '230' })}
      </div>
      <label class="field note-field">
        <span class="label-text">Note</span>
        <textarea id="hist-note" rows="3" maxlength="500" dir="auto" enterkeyhint="done" placeholder="Knee fine, stopped the elliptical early…">${escapeHtml(draft.note)}</textarea>
      </label>
    </div>
    ${renderActionBar(`<button class="btn-large btn-primary" id="save-history-edit" type="button">Save</button>`)}
  `;
}

// Merges the draft back into the ONE saved row it came from — every other
// field on `existing` is spread through untouched.
//
// v53 fix (CHECK M2, Sep 26 2026): pendingEdit only goes true when the
// server already HAS this row (synced, or a previous edit is still queued
// for it) — that's the only case a PATCH-by-id can find anything. A session
// that finished OFFLINE and never reached Supabase has no server row yet;
// routing it through pendingEdit meant every PATCH matched 0 rows (M2) and
// the retry would never switch to a POST — the whole session, not just the
// edit, was silently unrecoverable. Such a row stays a normal unsynced entry
// here, and the flush below (matching the pendingEdit ternary everywhere
// else in this file — see patchLogToSupabase's own call site) posts it with
// the edited numbers already folded in, same as any other queued session.
function saveHistoryEdit(): void {
  const id = state.historyDetailId;
  const draft = historyEditDraft;
  if (!id || !draft) return;
  const logs = loadLogs();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const existing = logs[idx];
  if (!existing) return;
  const existingOnServer = existing.synced === true || existing.pendingEdit === true;
  const updated: LogEntry = {
    ...existing,
    ellipticalTimeSec: parseMmSs(draft.timeStr),
    ellipticalKm: parseKmReading(draft.kmStr),
    ellipticalKcal: parseKcalReading(draft.kcalStr),
    ellipticalLevel: draft.level,
    ellipticalPulse: parsePulseReading(draft.pulseStr),
    sessionNote: draft.note.trim() || null,
    synced: false,
    pendingEdit: existingOnServer,
  };
  logs[idx] = updated;
  writeLogs(logs);
  historyEditDraft = null;
  state.screen = 'history-detail';
  render();
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  void (existingOnServer ? patchLogToSupabase(updated) : pushLogToSupabase(updated)).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    updateSyncIndicator();
  });
}

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

type WeekSession = {
  log: LogEntry;
};

// WK4 (Sep 27 2026): extracted so the completion-model pager (below) can ask
// for a FIXED Saturday (legacySaturdayForOffset) instead of one relative to
// "today" — every pre-launch caller passes saturdayForOffset(offset), same
// today-relative Saturday the pre-WK4 getWeekSessions(offset) always used.
function getWeekSessionsForSaturday(saturday: Date): WeekSession[] {
  // Swing-aware (v42): sessions COUNTED toward this Sat→Fri week, oldest first.
  return sessionsAttributedTo(loadLogs(), saturday).map((log) => ({ log }));
}

// WK4 (Sep 27 2026): the completion model's own sessions for a span — its
// `sessions` are week.ts's minimal SessionLite (id/date/workout only),
// matched back to their full LogEntry by id, in the span's own chronological
// order (WeekSpan's own guarantee).
function getWeekSessionsForSpan(span: WeekSpan): WeekSession[] {
  const byId = new Map(loadLogs().map((l) => [l.id, l] as const));
  return span.sessions
    .map((s) => byId.get(s.id))
    .filter((l): l is LogEntry => !!l)
    .map((log) => ({ log }));
}

// v54 fix r2 (Sep 27 2026), checker's should #1: span.sessions never has a
// 'D' (week.ts drops it from the completion model on purpose, same as
// buildWeeklyTargetRows) — so a D ride that week made the review say "0 of
// 3 · No sessions this week" even though she'd just ridden. D still isn't
// one of the three; this only finds D logs whose DATE falls inside the
// span so the review can list them as an honest extra, same reasoning as
// renderRidesTotalsCard's "This week" fix above.
//
// v61.1 fix 2 (Oct 2 2026, CHECK-v61.1.md must #1): the span-local version of
// this function (v55's own "up to whenever the NEXT span opened, or forever
// for the newest" window) is DELETED — it carried its own D window instead of
// asking week-d.ts for the SAME one Home/Progress/the peek already use
// (weekHasDFor/completionWeekDots, v61 fix passes 2-3), so the review
// disagreed with every other screen about the same D in every gap case. Her
// real rows: r1noD (C Fri, D Sat, nothing else yet) put the Sat D in the
// review's Week 5 forever — `sinceMs` was Week 5's own `openedAt` and
// `untilMs` was `Infinity` since no span had opened after it — while
// Home/Progress/the peek had already moved it to Week 6's open window
// (week-d.ts's anchor-weekend floor). Gap + Sunday opening (C Fri, D Sat, A
// Sun) attributed the Sat D to Week 5 too, since Week 6's own `openedAt` is
// the Sunday A — strictly AFTER the Saturday D — while the other three
// screens already count it in Week 6. One D-window, built by week-d.ts,
// never two that can drift apart: `target` is `{kind:'open'}` for the page
// that's still live (`span.closedAt === null` — the same open/closed test
// `isLiveOpen` below already uses) and `{kind:'span', key}` otherwise; the
// span itself is looked up again by its own KEY inside `model.spans`
// (week-d.ts's own "key-based, not reference-based" note), not by object
// identity, since `model` here is a fresh `weekModel()` call, not the one
// `reviewCompletionPages()` used internally to build `span` in the first
// place — two structurally-identical-but-not-reference-equal results still
// have to agree.
function getExtraDSessionsForTarget(target: DWeekTarget, model: DWeekModel): LogEntry[] {
  const win = weekWindowFor(target, model);
  if (win === null) return [];
  return loadLogs()
    .filter((l) => l.workout === 'D')
    .filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= win.start && (win.end === null || t < win.end);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

type WeekTotals = {
  count: number;
  // T2 fix r1 (Sep 27 2026, checker's "must"): this used to be `totalSec`,
  // summed straight from `durationSec` — the app's own open/close tap-time,
  // not her training (§3.4's own list names "the weekly review" as a place
  // that must go through the confirmed-timing formatter). It's now the sum of
  // each CONFIRMED session's `trainingMinutes` (timing.ts) only — a session
  // she never confirmed start/finish for contributes nothing here, same rule
  // as the Sessions row and the Session detail's Time row.
  trainingMinSum: number;
  // How many of `count` sessions contributed to trainingMinSum. Less than
  // count → the total is partial and must say so; zero → nothing to show.
  trainingKnownCount: number;
  avgCapBefore: number | null;
  avgCapAfter: number | null;
  maxWallSit: number;
  avgBackPain: number | null; // averaged only over sessions with backPain > 0
};

function computeWeekTotals(sessions: WeekSession[]): WeekTotals {
  if (sessions.length === 0) {
    return {
      count: 0,
      trainingMinSum: 0,
      trainingKnownCount: 0,
      avgCapBefore: null,
      avgCapAfter: null,
      maxWallSit: 0,
      avgBackPain: null,
    };
  }
  let trainingMinSum = 0;
  // v34 (kept under the new name, T2 fix r1): count how many of the week's
  // sessions actually HAVE a confirmed workout time. A session with no
  // confirmed start/finish contributes nothing, and folding it in as zero
  // minutes would silently under-report a real week's total. Fail-loud rule:
  // say the total is partial, never present a hole as a number.
  let trainingKnownCount = 0;
  let capBeforeSum = 0;
  let capBeforeCount = 0; // v39: before-capacity can be missing on old rows too
  let capAfterSum = 0;
  let capAfterCount = 0; // v32: after-the-fact logs have no after-reading
  let maxWallSit = 0;
  let backPainSum = 0;
  let backPainCount = 0;
  for (const { log } of sessions) {
    const minutes = trainingMinutes(log);
    if (minutes !== null) {
      trainingMinSum += minutes;
      trainingKnownCount += 1;
    }
    if (log.capacityBefore !== null) {
      capBeforeSum += log.capacityBefore;
      capBeforeCount += 1;
    }
    if (log.capacityAfter !== null) {
      capAfterSum += log.capacityAfter;
      capAfterCount += 1;
    }
    if (log.wallSitSec > maxWallSit) maxWallSit = log.wallSitSec;
    if (log.backPain !== null && log.backPain > 0) {
      backPainSum += log.backPain;
      backPainCount += 1;
    }
  }
  return {
    count: sessions.length,
    trainingMinSum,
    trainingKnownCount,
    avgCapBefore: capBeforeCount > 0 ? capBeforeSum / capBeforeCount : null,
    avgCapAfter: capAfterCount > 0 ? capAfterSum / capAfterCount : null,
    maxWallSit,
    avgBackPain: backPainCount > 0 ? backPainSum / backPainCount : null,
  };
}

function formatAvg(n: number | null, digits = 1): string {
  if (n === null) return '—';
  return n.toFixed(digits);
}

// Calmly directional delta. NOT shouty — per agency rule. Show direction with
// muted progress/dim tokens; a "worse" delta gets --text-dim, NOT a warn color.
// v48 · P6 (Sep 24 2026): with its unit — "↓ -22m", "↑ +5s" (a bare "-22" left
// her to guess minutes or seconds; uxui weekly).
function renderDelta(
  curr: number,
  prev: number,
  kind: 'higher-better' | 'lower-better',
  unit = ''
): string {
  const diff = curr - prev;
  if (diff === 0) {
    return `<span class="weekly-review-delta-num delta-same">±0${unit}</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff}${unit}</span>`;
}

function renderDeltaDecimal(
  curr: number | null,
  prev: number | null,
  kind: 'higher-better' | 'lower-better'
): string {
  if (curr === null || prev === null) {
    return `<span class="weekly-review-delta-num delta-same">—</span>`;
  }
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) {
    return `<span class="weekly-review-delta-num delta-same">±0</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff.toFixed(1)}</span>`;
}

// The Saturday the program's first week starts on — the ‹ arrow stops there.
function firstProgramSaturday(): Date {
  const start = new Date(PROGRAM_START_DATE + 'T00:00:00');
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

// The review's title in home's words: "This week · R2 · Week 4 · Sep 19–25",
// a past week "R2 · Week 3 · Sep 12–18", a held week "Sick week · Jul 11–17".
// WK4 (Sep 27 2026): extracted onto an explicit Saturday + "is this the live
// page" flag so the same string logic serves both a pre-launch caller
// (saturdayForOffset(offset), offset === 0) and a legacy page reached through
// the post-launch pager (a FIXED Saturday, never "today minus N weeks" — see
// legacySaturdayForOffset — and always past, never the live page).
function weekReviewTitleForSaturday(saturday: Date, isCurrentPage: boolean): string {
  const friday = new Date(saturday);
  friday.setDate(saturday.getDate() + 6);
  const range = formatWeekRange(saturday, friday);
  const pw = getProgramWeek(saturday);
  if (pw.skippedLabel) return `${pw.skippedLabel} week · ${range}`;
  const week = `${pw.round > 1 ? `R${pw.round} · ` : ''}Week ${pw.num}`;
  return isCurrentPage ? `This week · ${week} · ${range}` : `${week} · ${range}`;
}

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Weekly review ‹ ›": "it pages
// through one list: the calendar weeks before the launch, then the program
// weeks." The Saturday of the legacy calendar week `legacyOffset` weeks
// before the last one the OLD swing model ever closed (Week 4, Sat Sep
// 19–Fri Sep 25) — anchored to the FIXED instant LEGACY_LAST_CLOSED_WEEK_INSTANT
// (already a Saturday — see that constant's own comment), never "today minus
// N weeks", which would drift as today does (the same class of bug WK2 fix r1
// already fixed for the home peek). legacyOffset 0 = Week 4 itself.
function legacySaturdayForOffset(legacyOffset: number): Date {
  const anchor = new Date(LEGACY_LAST_CLOSED_WEEK_INSTANT);
  const saturday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  saturday.setDate(saturday.getDate() - legacyOffset * 7);
  return saturday;
}

// WK4 (Sep 27 2026): the pageable completion-model spans, newest-first — the
// live OPEN span first (if one exists), then every CLOSED span, newest to
// oldest. weekModel()'s own invariant (the launch instant always opens Week 1
// immediately) means `open` and `spans` are never BOTH empty once "now" is
// past the launch, so this is never `[]` in real post-launch use.
function reviewCompletionPages(): WeekSpan[] {
  const { spans, open } = weekModel();
  return open ? [open, ...spans.slice().reverse()] : spans.slice().reverse();
}

// "Week 5 · Sep 26 – Oct 1 · 3 of 3" (closed); "Week 6 · Sep 26–Oct 1 · moved
// on at 2 of 3" (moved_on); "Week 7 · since Sat Oct 3" (still open) — §2.4's
// own exact strings. No "This week" prefix (unlike the legacy title above):
// the week number + "since"/range already say which one is current, same as
// Home's own header reads "Week N" plainly.
// v61 (Sep 28 2026), spec item d: "Progress + weekly review show the same
// 'of 4'." `hasD` comes from the SAME getExtraDSessionsForTarget the caller
// already computes for this exact span (reviewWeekViewAt below) — one
// D-detection, never a second one that could disagree with it.
function completionReviewTitle(span: WeekSpan, hasD: boolean): string {
  // No "R{n} ·" prefix — unlike the legacy title below, §2.4's own literal
  // strings ("Week 5 · Sep 26 – Oct 1 · 3 of 3", "since Sep 26") never carry
  // one; Home already dropped "Round 2" the same way (§2.4: "It shows on
  // Sessions, Progress and Settings" — this screen names it in its OWN
  // header line already, via renderWeeklyReview's "R2 · Week 4" legacy pages).
  const week = `Week ${span.key.week}`;
  if (span.closedAt === null) {
    return `${week} · since ${formatWeekdayDate(span.openedAt)}`;
  }
  const range = formatWeekRange(new Date(span.openedAt), new Date(span.closedAt));
  const done = span.done.length + (hasD ? 1 : 0);
  const doneLine =
    span.how === 'moved_on'
      ? `moved on at ${done} of 4`
      : span.missing.length === 0
        ? hasD
          ? '4 of 4 ✓'
          : 'complete · 3 of 4'
        : `${done} of 4`;
  return `${week} · ${range} · ${doneLine}`;
}

// WK4 (Sep 27 2026): the sessions at ANY combined pager offset, legacy or
// completion — used only for the "vs previous week" comparison (the delta
// card reads one offset further back than whatever page is showing).
function reviewSessionsAt(offset: number): WeekSession[] {
  if (!isNowAfterCompletionLaunch()) return getWeekSessionsForSaturday(saturdayForOffset(offset));
  const completionPages = reviewCompletionPages();
  if (offset < completionPages.length) return getWeekSessionsForSpan(completionPages[offset]!);
  return getWeekSessionsForSaturday(legacySaturdayForOffset(offset - completionPages.length));
}

type ReviewWeekView = {
  title: string;
  skippedLabel: string | null;
  sessions: WeekSession[];
  prevSessions: WeekSession[];
  // v61 (Sep 28 2026), spec item d: true only for a completion-model page —
  // a legacy (pre-launch) week has no D concept at all, so it keeps "of 3"
  // (renderWeeklyReview's own Sessions subtitle reads this, not a second
  // isNowAfterCompletionLaunch() check).
  countsD: boolean;
  // v54 fix r2 (Sep 27 2026), checker's should #1: D logs that date inside
  // this week but never count toward `sessions` (see
  // getExtraDSessionsForTarget). Empty pre-launch (D didn't exist yet).
  extraSessions: LogEntry[];
  // True only for the ONE page that's still actually live/open right now —
  // gates the "vs previous week" card vs "Week still open." (see
  // renderWeeklyReview). Pre-launch this is exactly `offset === 0` (the old
  // model's own always-live "this week"); post-launch it's the completion
  // model's live OPEN span specifically — a mid-gap page 0 (the last CLOSED
  // span, week.ts's own "nothing has opened yet" fallback) is a real past
  // week, not a live one, and reads that way.
  isLiveOpen: boolean;
};

// WK4 (Sep 27 2026): the pager's one seam — everything renderWeeklyReview
// draws comes off this view model, so the rest of that function never
// branches on legacy-vs-completion itself.
function reviewWeekViewAt(offset: number): ReviewWeekView {
  if (!isNowAfterCompletionLaunch()) {
    const saturday = saturdayForOffset(offset);
    const pw = getProgramWeek(saturday);
    return {
      title: weekReviewTitleForSaturday(saturday, offset === 0),
      skippedLabel: pw.skippedLabel,
      sessions: getWeekSessionsForSaturday(saturday),
      prevSessions: reviewSessionsAt(offset + 1),
      extraSessions: [], // pre-launch: D didn't exist yet
      countsD: false,
      isLiveOpen: offset === 0,
    };
  }
  const completionPages = reviewCompletionPages();
  if (offset < completionPages.length) {
    const span = completionPages[offset]!;
    // v61.1 fix 2 (Oct 2 2026): one shared window for count AND the review's
    // extra-ride list — see getExtraDSessionsForTarget's own header. A fresh
    // `weekModel()` call here (not the one `reviewCompletionPages()` used
    // internally) is fine: `target` is key-based, never an object-identity
    // check against this `span`.
    const model = weekModel();
    const target: DWeekTarget =
      span.closedAt === null ? { kind: 'open' } : { kind: 'span', key: span.key };
    const extraSessions = getExtraDSessionsForTarget(target, model);
    return {
      title: completionReviewTitle(span, extraSessions.length > 0),
      skippedLabel: null,
      sessions: getWeekSessionsForSpan(span),
      prevSessions: reviewSessionsAt(offset + 1),
      extraSessions,
      countsD: true,
      isLiveOpen: offset === 0 && span.closedAt === null,
    };
  }
  const saturday = legacySaturdayForOffset(offset - completionPages.length);
  const pw = getProgramWeek(saturday);
  return {
    title: weekReviewTitleForSaturday(saturday, false), // always past, once reached from here
    skippedLabel: pw.skippedLabel,
    sessions: getWeekSessionsForSaturday(saturday),
    prevSessions: reviewSessionsAt(offset + 1),
    extraSessions: [], // legacy pre-launch weeks: D didn't exist yet
    countsD: false,
    isLiveOpen: false,
  };
}

// WK4 (Sep 27 2026): the ‹ arrow's stop condition across the combined pager —
// pre-launch, unchanged (the calendar boundary). Post-launch, keep going while
// either another completion page remains, or the next legacy Saturday hasn't
// walked past the program's first week.
function reviewCanGoBack(offset: number): boolean {
  if (!isNowAfterCompletionLaunch()) {
    return saturdayForOffset(offset + 1).getTime() >= firstProgramSaturday().getTime();
  }
  const completionPages = reviewCompletionPages();
  const nextOffset = offset + 1;
  if (nextOffset < completionPages.length) return true;
  return (
    legacySaturdayForOffset(nextOffset - completionPages.length).getTime() >=
    firstProgramSaturday().getTime()
  );
}

function renderWeeklyReview(): string {
  const offset = viewedWeekOffset;
  const view = reviewWeekViewAt(offset);
  const canGoBack = reviewCanGoBack(offset);

  const sessions = view.sessions;
  const totals = computeWeekTotals(sessions);
  const prev = computeWeekTotals(view.prevSessions);

  // The ‹ › arrows sit around the title (moved from home, DECISIONS §5). The
  // live week has nothing after it, so › is hidden — not a dead button.
  const header = `
    <div class="screen-header review-header">
      <div class="review-nav">
        <button class="review-arrow${canGoBack ? '' : ' review-arrow-off'}" id="prev-week" type="button" aria-label="Previous week"${canGoBack ? '' : ' disabled'}>‹</button>
        <h2 class="review-title">${view.title}</h2>
        <button class="review-arrow${offset > 0 ? '' : ' review-arrow-off'}" id="next-week" type="button" aria-label="Next week"${offset > 0 ? '' : ' disabled'}>›</button>
      </div>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // A held week (sick / break) is not a miss (her Jul 19 rule): no "of 3"/"of 4".
  // v61 (Sep 28 2026), spec item d: "Progress + weekly review show the same
  // 'of 4'" — a completion-model page counts a D ride into the number shown;
  // the "met" styling still keys on the real A/B/C requirement (3), D never
  // required, exactly as the week itself closes.
  const sessionCountClass = totals.count >= 3 ? 'weekly-review-count-met' : 'weekly-review-count';
  const reviewDenom = view.countsD ? 4 : 3;
  const reviewShownCount = totals.count + (view.countsD && view.extraSessions.length > 0 ? 1 : 0);
  const subtitle = view.skippedLabel
    ? ''
    : `<div class="weekly-review-subtitle">
        Sessions: <span class="${sessionCountClass}"><strong>${reviewShownCount}</strong> of ${reviewDenom}</span>
      </div>`;

  // v54 fix r2 (Sep 27 2026), checker's should #1: D never counts toward
  // "N of 3" (it isn't one of the three), but a D ride that week is real and
  // hiding it made the page say something untrue ("No sessions this week"
  // right after she rode one). Listed as its own honest extra line, under
  // the count, never folded into it.
  const extraRows = view.extraSessions
    .map(
      (l) => `<div class="weekly-review-extra-row">D · ${formatRowDate(l.date)} · extra ride</div>`
    )
    .join('');

  // Empty state — single subtle line, no nudge.
  if (sessions.length === 0) {
    // v54 fix r3 (Sep 27 2026), checker's should #1 (round 3 — round 2's own
    // fix above only half-closed this): "No sessions this week." directly
    // above a "D · ... · extra ride" line contradicts itself — she DID ride,
    // it just wasn't one of A/B/C. When extraRows is non-empty the line now
    // names what's actually still open (skippedLabel never co-occurs with
    // extraSessions — completion pages always set skippedLabel: null, see
    // reviewWeekViewAt — so this branches cleanly ahead of it).
    const emptyLine = view.skippedLabel
      ? 'Held the slot — doesn’t count.'
      : extraRows
        ? view.isLiveOpen
          ? 'None of A, B, C yet.'
          : 'None of A, B, C that week.'
        : view.isLiveOpen
          ? 'No sessions this week.'
          : 'No sessions that week.';
    return `
      ${header}
      ${subtitle}
      <p class="weekly-review-empty">${emptyLine}</p>
      ${extraRows ? `<div class="weekly-review-extras">${extraRows}</div>` : ''}
      ${renderWeeklyTargetGrid('Week by week')}
    `;
  }

  const newestFirst = logsNewestFirst();
  const sessionRows = sessions.map((s) => renderSessionRow(s.log, newestFirst)).join('');

  // "6.0 → 7.0"; with no after-readings that week, just the before (the
  // Session screen's "7 when after is null" — a hole never drawn as "→ —").
  const capTile =
    totals.avgCapBefore === null && totals.avgCapAfter === null
      ? '—'
      : totals.avgCapAfter === null
        ? formatAvg(totals.avgCapBefore)
        : `${formatAvg(totals.avgCapBefore)} → ${formatAvg(totals.avgCapAfter)}`;
  const painWarn = totals.avgBackPain !== null && totals.avgBackPain >= BACK_PAIN_STOP_AT;
  // v55 (Sep 27 2026) — CHECK N4 (round 1): "TOTAL TIME —" was showing on
  // every week before her confirmed-timing rows existed (T2 removed the old
  // app-time fallback correctly; nothing replaced the tile). Fix per the
  // checker's own words: hide the tile until a week has a confirmed time,
  // rather than show an honest but permanent "—".
  const totalTimeTile =
    totals.trainingKnownCount > 0
      ? `
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${formatWorkoutMinutesTotal(totals.trainingMinSum)}</div>
          <div class="weekly-review-total-lbl">${
            totals.trainingKnownCount < totals.count
              ? `total time · ${totals.trainingKnownCount} of ${totals.count} sessions`
              : 'total time'
          }</div>
        </div>`
      : '';
  // Four tiles, an even grid (v48 · P6: one "Capacity 5.5 → 6.0" tile replaced
  // the two average tiles; back pain always has its tile — "none" when no pain).
  const totalsCard = `
    <div class="card weekly-review-totals">
      <h3>Week totals</h3>
      <div class="weekly-review-totals-grid">
        ${totalTimeTile}
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${capTile}</div>
          <div class="weekly-review-total-lbl">capacity</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${totals.maxWallSit > 0 ? `${totals.maxWallSit}s` : '—'}</div>
          <div class="weekly-review-total-lbl">max wall sit</div>
        </div>
        <div class="weekly-review-total${painWarn ? ' weekly-review-total-warn' : ''}">
          <div class="weekly-review-total-num">${totals.avgBackPain === null ? 'none' : formatAvg(totals.avgBackPain)}</div>
          <div class="weekly-review-total-lbl">${totals.avgBackPain === null ? 'back pain' : 'avg back pain'}</div>
        </div>
      </div>
    </div>
  `;

  // v48 · P6 (Sep 24 2026): "vs previous week" only for a CLOSED week — on a
  // Thursday it showed "↓ -1" for a week she was on track to finish (uxui
  // weekly 4/5). The live week says so in one quiet line instead.
  const deltaCard =
    !view.isLiveOpen && prev.count > 0
      ? `
        <div class="card weekly-review-delta">
          <h3>vs previous week</h3>
          <div class="weekly-review-delta-grid">
            <div class="weekly-review-delta-row">
              <span class="weekly-review-delta-lbl">sessions</span>
              <span class="weekly-review-delta-vals">${prev.count} → ${totals.count}</span>
              ${renderDelta(totals.count, prev.count, 'higher-better')}
            </div>
            ${
              // T2 fix r1 (Sep 27 2026, checker's "must"): only compare
              // confirmed training minutes, and only when BOTH weeks have at
              // least one confirmed session — no arrow drawn from a week (or
              // two) with nothing confirmed, and never from durationSec again.
              prev.trainingKnownCount > 0 && totals.trainingKnownCount > 0
                ? `<div class="weekly-review-delta-row">
                    <span class="weekly-review-delta-lbl">total time</span>
                    <span class="weekly-review-delta-vals">${formatWorkoutMinutesTotal(prev.trainingMinSum)} → ${formatWorkoutMinutesTotal(totals.trainingMinSum)}</span>
                    ${renderDelta(Math.round(totals.trainingMinSum), Math.round(prev.trainingMinSum), 'higher-better', 'm')}
                  </div>`
                : ''
            }
            ${
              prev.maxWallSit > 0 || totals.maxWallSit > 0
                ? `<div class="weekly-review-delta-row weekly-review-delta-row-emph">
                    <span class="weekly-review-delta-lbl">max wall sit</span>
                    <span class="weekly-review-delta-vals">${prev.maxWallSit}s → ${totals.maxWallSit}s</span>
                    ${renderDelta(totals.maxWallSit, prev.maxWallSit, 'higher-better', 's')}
                  </div>`
                : ''
            }
            ${
              prev.avgBackPain !== null || totals.avgBackPain !== null
                ? `<div class="weekly-review-delta-row">
                    <span class="weekly-review-delta-lbl">avg back pain</span>
                    <span class="weekly-review-delta-vals">${formatAvg(prev.avgBackPain)} → ${formatAvg(totals.avgBackPain)}</span>
                    ${renderDeltaDecimal(totals.avgBackPain, prev.avgBackPain, 'lower-better')}
                  </div>`
                : ''
            }
          </div>
        </div>
      `
      : view.isLiveOpen
        ? '<p class="weekly-review-open">Week still open.</p>'
        : '';

  return `
    ${header}
    ${subtitle}
    <div class="card weekly-review-sessions session-list">
      ${sessionRows}
    </div>
    ${extraRows ? `<div class="weekly-review-extras">${extraRows}</div>` : ''}
    ${totalsCard}
    ${deltaCard}
    ${
      // v48 · P4 (Sep 24 2026): re-homed from home; stays at the bottom, closed.
      renderWeeklyTargetGrid('Week by week')
    }
  `;
}

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

// Bar chart for back pain — categorical (0-10), bar per session.
// v48 · P6 (Sep 24 2026): a pain-free session gets a faint tick instead of
// nothing (the chart only witnessed the bad days — uxui progress 2/5), and a
// bar is amber only at her 3/10 stop line.
// v51 · fix (Sep 25 2026, look-check sev 3): H was 140 against a yMax of 10
// while her real back-pain values sit mostly at 0-2 — about 100px of empty
// dark space sat above a few short bars, uneven next to the wall-sit card's
// compact ≤64px treatment (her "remove the big empty chart area" ask,
// applied there in v51 already). Same cap here, same PAD as the wall-sit
// sparkline, so both cards read at the same height.
function renderProgressBarChart(
  values: number[],
  opts: { ariaLabel: string; yMax: number }
): string {
  if (values.length === 0) return '';
  const W = 320;
  const H = 64;
  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_T = 6;
  const PAD_B = 6;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Bar geometry: target 4px wide, 2px gap. If too many sessions, the bar
  // shrinks but we keep at least 1px wide.
  const slot = innerW / values.length;
  const barW = Math.max(1, Math.min(4, slot - 2));

  const bars = values
    .map((v, i) => {
      const x = PAD_L + i * slot + (slot - barW) / 2;
      if (v <= 0) {
        return `<rect class="pain-tick" x="${x.toFixed(1)}" y="${(PAD_T + innerH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2"
              fill="var(--text-dim-2)" opacity="0.6" rx="1" />`;
      }
      const ratio = Math.min(1, v / opts.yMax);
      const h = ratio * innerH;
      const y = PAD_T + innerH - h;
      const fill = v >= BACK_PAIN_STOP_AT ? 'var(--accent-warn)' : 'var(--text-dim)';
      return `<rect class="pain-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              fill="${fill}" rx="1" />`;
    })
    .join('');

  return `
    <svg class="progress-chart progress-chart-bar" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(opts.ariaLabel)}">
      <title>${escapeHtml(opts.ariaLabel)}</title>
      ${bars}
    </svg>
  `;
}

// ----- Per-card render helpers -----

// The level / km she recorded on a ride: the v48 columns, else the v47 marker.
function rideLevel(l: LogEntry): number | null {
  if (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) return l.ellipticalLevel;
  return l.cardioLane ? null : (splitNotes(l.notes).cardio?.level ?? null);
}

function rideKm(l: LogEntry): number | null {
  if (typeof l.ellipticalKm === 'number' && l.ellipticalKm > 0) return l.ellipticalKm;
  return l.cardioLane ? null : (splitNotes(l.notes).cardio?.km ?? null);
}

// v51 · Start -> Now's combined elliptical line ("... 0.72 km in 10 min"):
// the real ride duration, v49's own column only (no pre-v49 marker to fall
// back to — those rides predate the elliptical entirely).
function rideTimeSec(l: LogEntry): number | null {
  return typeof l.ellipticalTimeSec === 'number' && l.ellipticalTimeSec > 0
    ? l.ellipticalTimeSec
    : null;
}

// v48 · P6 (Sep 24 2026): "Start → Now" — DECISIONS §2 #5 (Gemini, taken):
// "elliptical level first → latest, km first → latest, wall sit first → latest,
// and '40 sessions'. That's movement with no verdict (guide §2)." Rows only
// where there's data; a latest below the first shows plainly, never coloured.
function renderStartNowCard(logs: LogEntry[]): string {
  const first = logs[0];
  if (!first) return '';
  const pair = (vals: number[], unit: string): string => {
    const a = vals[0];
    const b = vals[vals.length - 1];
    if (a === undefined || b === undefined) return '';
    return vals.length === 1
      ? `<span class="sn-last">${a}</span>${unit}`
      : `<span class="sn-first">${a}</span> → <span class="sn-last">${b}</span>${unit}`;
  };
  const rows: [string, string][] = [];
  // v51 · her ask: "look at ux ui and everything presentation" — one
  // combined elliptical line ("level 5 → 7 · 0.72 km in 10 min") replaces
  // the old two separate "Elliptical level" / "Elliptical km" rows. Level
  // shows the trend (first ride → latest, a setting she steps herself); km
  // and time are the LATEST ride only (a distance/duration trend across
  // wildly different session lengths isn't a meaningful "→"). With exactly
  // one ride logged ever, there's nothing to compare yet — just say when it
  // was (her literal words: "first ride Sep 24").
  const rides = logs.filter((l) => rideLevel(l) !== null || rideKm(l) !== null);
  if (rides.length === 1) {
    rows.push(['Elliptical', `first ride ${formatMonthDay(rides[0]!.date)}`]);
  } else if (rides.length > 1) {
    const firstRide = rides[0]!;
    const lastRide = rides[rides.length - 1]!;
    const firstLevel = rideLevel(firstRide);
    const lastLevel = rideLevel(lastRide);
    const levelPart =
      firstLevel !== null && lastLevel !== null ? `level ${firstLevel} → ${lastLevel}` : '';
    const lastKm = rideKm(lastRide);
    const lastTimeSec = rideTimeSec(lastRide);
    const distPart = [
      lastKm !== null ? `${lastKm} km` : '',
      lastTimeSec !== null ? `in ${Math.round(lastTimeSec / 60)} min` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const val = [levelPart, distPart].filter(Boolean).join(' · ');
    if (val) rows.push(['Elliptical', val]);
  }
  // v49 · look fix (Sep 25 2026): honestWallSitLogs() — was every wallSitSec>0,
  // including pre-v45 rows that saved the week's PRESCRIBED hold, not a real
  // measurement (Home's own Start → Now card already excluded them; Progress's
  // didn't, so the two disagreed on the same number — Opus check).
  const walls = honestWallSitLogs(logs).map((l) => l.wallSitSec);
  if (walls.length) rows.push(['Wall sit', pair(walls, ' s')]);
  return `
    <div class="card progress-card start-now-card">
      <div class="progress-card-label">Start → Now</div>
      <div class="progress-stat-big start-now-hero">${logs.length} <span class="start-now-unit">session${logs.length === 1 ? '' : 's'}</span></div>
      ${rows
        .map(
          ([label, val]) =>
            `<div class="start-now-row"><span class="start-now-lbl">${label}</span><span class="start-now-val">${val}</span></div>`
        )
        .join('')}
      <div class="progress-card-meta">since ${formatMonthDay(first.date)}</div>
    </div>`;
}

function renderWallSitTrendCard(logs: LogEntry[]): string {
  // Wall-sit values only come from workouts that include a wall sit (A).
  // v49 · look fix (Sep 25 2026): honestWallSitLogs() — was every wallSitSec>0,
  // chronological, including pre-v45 rows that saved the week's PRESCRIBED
  // hold, not a real measurement. That's why this card used to show "33 → 45"
  // and "best 48 s" while Home's own card (already honest) said "44 → 45" for
  // the same person — two cards, same name, different numbers (Opus check).
  const wallLogs = honestWallSitLogs(logs);
  const wallSits = wallLogs.map((l) => l.wallSitSec);

  if (wallSits.length < 2) {
    if (wallSits.length === 1) {
      const only = wallSits[0] ?? 0;
      return `
        <div class="card progress-card">
          <div class="progress-card-label">Wall sit · seconds held</div>
          <div class="progress-stat-big">${only} s</div>
          <p class="progress-card-empty">One value logged — chart appears after 2+ wall-sit sessions.</p>
        </div>
      `;
    }
    return '';
  }

  const last = wallSits[wallSits.length - 1] ?? 0;
  const maxVal = Math.max(...wallSits);

  // v51 · her ask: "remove the big empty chart area" — a compact sparkline
  // (≤80px, was 220px) with the numbers said in words ("best 45 s · latest
  // 43 s") replaces the old axis'd line chart + "+Ns since <date>" meta.
  const sparkline = renderWallSitSparkline(
    wallSits,
    `Wall sit trend: ${wallSits.length} sessions, latest ${last}, best ${maxVal}`
  );

  // v48 · P6 (Sep 24 2026): the hero is the LATEST hold, "best" sits quiet in
  // the meta — "a hero you're not at is a misreport" (DECISIONS §5, fail-loud).
  return `
    <div class="card progress-card wall-sit-card">
      <div class="progress-card-label">Wall sit · seconds held</div>
      <div class="progress-stat-big">${last} s</div>
      <div class="progress-sparkline-wrap">${sparkline}</div>
      <div class="progress-card-meta">best ${maxVal} s · latest ${last} s</div>
    </div>
  `;
}

// v51 · Progress's Wall-sit card — a quiet, compact trend line (≤80px tall,
// bigger than the row-level renderSparkline above): no axis, no guide, no
// round-boundaries. The card's own words ("best X s · latest Y s") carry the
// numbers, so the picture only needs to say "the shape of it".
function renderWallSitSparkline(values: number[], ariaLabel: string): string {
  if (values.length < 2) return '';
  const W = 320;
  const H = 64;
  const PAD = 6;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = innerW / (values.length - 1);
  const yFor = (v: number): number => PAD + (1 - (v - min) / span) * innerH;
  const pts = values.map((v, i) => [PAD + i * stepX, yFor(v)] as [number, number]);
  const path = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const lastPt = pts[pts.length - 1]!;
  return `
    <svg class="progress-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(ariaLabel)}">
      <title>${escapeHtml(ariaLabel)}</title>
      <path d="${path}" fill="none" stroke="var(--accent-progress)" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="4" fill="var(--accent-progress)" />
    </svg>`;
}

function renderBackPainTrendCard(allLogs: LogEntry[]): string {
  // Skip sessions with no back-pain reading (v32 after-the-fact logs).
  const logs = allLogs.filter((l) => l.backPain !== null);
  if (logs.length < 2) return '';

  const values = logs.map((l) => l.backPain ?? 0); // filtered above; ?? only narrows the type
  const positive = values.filter((v) => v > 0);
  const painFree = values.length - positive.length;
  const avg = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : 0;

  // Pain scale max is 10 per the post-log chips.
  const chart = renderProgressBarChart(values, {
    ariaLabel:
      positive.length === 0
        ? `Back pain: no pain logged across ${logs.length} sessions`
        : `Back pain: ${positive.length} of ${logs.length} sessions with pain, avg ${avg.toFixed(1)}`,
    yMax: 10,
  });

  // v48 · P6 (Sep 24 2026): the pain-free days are witnessed first
  // ("Pain-free 24 of 30 · avg 1.8 when it hurt", DECISIONS §5).
  const metaLine =
    positive.length === 0
      ? `Pain-free ${painFree} of ${values.length}`
      : `Pain-free ${painFree} of ${values.length} · avg ${avg.toFixed(1)} when it hurt`;

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Back pain · 0–10</div>
      <div class="progress-chart-wrap progress-chart-wrap-bar">${chart}</div>
      <div class="progress-card-meta">${metaLine}</div>
    </div>
  `;
}

type PerWeekRow = {
  label: string;
  value: number;
  round: number;
  isCurrent: boolean;
  skipped: boolean;
  // v48 · fix r1: a 0-session week inside a sick/break stretch or after a
  // closed round's last session — shown as "—", not scored.
  held?: boolean;
  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4: a completion-model row's own
  // "how" — "wk 6 · 2/3 · moved on" (never held's "—"; a moved-on week has a
  // real count) and "wk 7 · 1/3 · open" (the live span, in place of the old
  // "now" label).
  suffix?: string;
  // v61 fix pass (Sep 28 2026, CHECK-v61 must #3) — her words 15:35: "she
  // did not say one of four." A completion-model row counts D into what's
  // SHOWN ("N / 4"), same widening weekCountLine (the Home/weekly-review
  // line) already does — this card used to stay hard-coded at "N / 3" for
  // EVERY row, legacy weeks included, so Home read "2 of 4" one card above
  // the exact same week reading "1 / 3" here. `value`/pct (the bar's own
  // "met" rule) stay on A/B/C alone (undefined on a legacy row, which keeps
  // plain "N / 3" with no override).
  displayValue?: number;
  displayTarget?: number;
};

// One sessions-per-week row. v48 · P6 (Sep 24 2026): HTML, not SVG — the
// "n / 3" sits OUTSIDE the track so a full bar stays readable (her wins were
// the unreadable rows, 1.25:1), and a held week is its label + "—": no track,
// no number (break weeks were scored "0 / 3" — uxui progress 3/5 ×2).
function renderPerWeekRow(r: PerWeekRow): string {
  if (r.skipped || r.held) {
    return `<div class="spw-row spw-row-skipped"><span class="spw-label">${escapeHtml(r.label)}</span><span class="spw-skip">—</span></div>`;
  }
  const pct = Math.round(Math.min(1, r.value / SESSIONS_PER_WEEK_TARGET) * 100);
  const suffix = r.suffix ? ` · ${escapeHtml(r.suffix)}` : '';
  // v61 fix pass (must #3): displayValue/displayTarget override the shown
  // count on a completion-model row (D counted in, "/ 4") — the bar's pct
  // above is untouched, still r.value/SESSIONS_PER_WEEK_TARGET (A/B/C only).
  const shownValue = r.displayValue ?? r.value;
  const shownTarget = r.displayTarget ?? SESSIONS_PER_WEEK_TARGET;
  return `
    <div class="spw-row${r.isCurrent ? ' spw-row-current' : ''}">
      <span class="spw-label">${escapeHtml(r.label)}</span>
      <span class="spw-track"><span class="spw-fill" style="width:${pct}%"></span></span>
      <span class="spw-count">${shownValue} / ${shownTarget}${suffix}</span>
    </div>`;
}

function renderSessionsPerWeekCard(logs: LogEntry[]): string {
  // One entry per program week from PROGRAM_START_DATE forward through the
  // current week.
  const firstSat = firstProgramSaturday();

  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Progress · weeks card": the
  // legacy calendar walk stops at the last week the OLD swing model ever
  // closed (Week 4, the FIXED LEGACY_LAST_CLOSED_WEEK_INSTANT anchor) once
  // "now" is past the real launch — never "today", which the completion
  // model has already replaced for "now" (isNowAfterCompletionLaunch). Before
  // the launch, unchanged: the walk still runs all the way to today's own
  // calendar Saturday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSat = new Date(today);
  thisSat.setDate(today.getDate() - daysSinceSat);
  thisSat.setHours(0, 0, 0, 0);
  const legacyWalkEnd = isNowAfterCompletionLaunch()
    ? (() => {
        const d = new Date(LEGACY_LAST_CLOSED_WEEK_INSTANT);
        d.setHours(0, 0, 0, 0);
        return d;
      })()
    : thisSat;

  const rows: PerWeekRow[] = [];
  const cursor = new Date(firstSat);
  // Swing-aware (v42): same attribution as the 3-slot rows and the week card.
  const attribution = attributeSessionsToWeeks(logs);
  while (cursor.getTime() <= legacyWalkEnd.getTime()) {
    const weekStart = new Date(cursor);
    const count = sessionsAttributedTo(logs, weekStart, attribution).length;
    const pw = getProgramWeek(weekStart);
    // Pre-launch, the walk's own last iteration IS "now" — post-launch, the
    // walk never reaches a live week at all (the completion rows below own
    // "now" instead), so isCurrent is only ever true in the untouched
    // pre-launch path.
    const isCurrent =
      !isNowAfterCompletionLaunch() && weekStart.getTime() === legacyWalkEnd.getTime();
    rows.push({
      label: isCurrent ? 'now' : pw.skippedLabel ? pw.skippedLabel.toLowerCase() : `wk ${pw.num}`,
      value: count,
      round: pw.round,
      isCurrent,
      skipped: pw.skippedLabel !== null,
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  // v48 · fix r1 (Sep 24 2026): a 0-session week that sits next to a sick/break
  // week, or after a closed round's last session, is part of that stretch —
  // "—" with no track, never an empty "0 / 3" (her real Round 1: wk 11 sat
  // between "sick" and "break" scored 0/3; DECISIONS §5: "Skipped weeks show
  // '—' with no track"; her Jul 19 rule: a break is not a miss). The flag is
  // worked out from the original rows, so it never chains across a run. This
  // inference is scoped to the legacy rows only — a completion row already
  // carries its own honest state (a real count + suffix), never inferred.
  const legacyRoundNum = getRoundFor(legacyWalkEnd).num;
  const lastActiveIdx = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.value > 0) lastActiveIdx.set(r.round, i);
  });
  const held = rows.map((r, i) => {
    if (r.skipped || r.isCurrent || r.value > 0) return false;
    if (rows[i - 1]?.skipped || rows[i + 1]?.skipped) return true;
    const last = lastActiveIdx.get(r.round);
    return r.round < legacyRoundNum && last !== undefined && i > last;
  });
  held.forEach((h, i) => {
    const r = rows[i];
    if (h && r) r.held = true;
  });

  // WK4 (Sep 27 2026): the completion-model rows, Week 5 on — one row per
  // CLOSED span (numbered by its OWN key, never a recomputed calendar count),
  // plus the live OPEN span if one exists ("wk 7 · 1/3 · open" — §2.4's own
  // string, replacing the old "now" label; a mid-gap "now" is already
  // honestly covered by the last closed span above it, so nothing extra is
  // added then).
  if (isNowAfterCompletionLaunch()) {
    // v61 fix pass 2 (Oct 2 2026): the full model, not just `spans`/`open` —
    // the LAST closed span's own D-window (week-d.ts) needs to know where
    // the NEXT week starts, which during a gap is `pending`, not `open`.
    const model = weekModel();
    const { spans, open } = model;
    // v61 fix pass (must #3): same D read weekLineText/Home already use —
    // week.ts drops D from its own model, so this reads the raw logs instead.
    const dLogs = logs.filter((l) => l.workout === 'D');
    for (const span of spans) {
      const hasD = weekHasDFor({ span }, model, dLogs);
      rows.push({
        label: `wk ${span.key.week}`,
        value: span.done.length,
        round: span.key.round,
        isCurrent: false,
        skipped: false,
        suffix: span.how === 'moved_on' ? 'moved on' : undefined,
        displayValue: span.done.length + (hasD ? 1 : 0),
        displayTarget: 4,
      });
    }
    if (open) {
      const openHasD = weekHasDFor({ open }, model, dLogs);
      rows.push({
        label: `wk ${open.key.week}`,
        value: open.done.length,
        round: open.key.round,
        isCurrent: true,
        skipped: false,
        suffix: 'open',
        displayValue: open.done.length + (openHasD ? 1 : 0),
        displayTarget: 4,
      });
    }
  }

  if (rows.length === 0) return '';

  // v46: only COMPLETED program weeks are counted. Break and sick weeks were
  // never a target and the week in progress isn't over. v48 · fix r1: the line
  // is a plain count of full weeks — no "target", no "of N" verdict.
  const judged = rows.filter((r) => !r.isCurrent && !r.skipped && !r.held);
  const hits = judged.filter((r) => r.value >= SESSIONS_PER_WEEK_TARGET).length;
  // A zero is a gentle empty state, not "0 full weeks" (guide §2: no guilt).
  const scoreLine =
    judged.length === 0
      ? 'The first week is in progress.'
      : hits === 0
        ? // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 nice): "full
          // week" in THIS card still means A/B/C met (`hits` above never
          // counts D) — a 3-of-4 week already counts as full here, so "(4 of
          // 4)" overpromised what actually triggers it. This empty state
          // never actually shows for her (14 full weeks).
          'A full week (A, B and C) will count here.'
        : `<strong>${hits}</strong> full ${hits === 1 ? 'week' : 'weeks'}`;

  // v48 · P6 (Sep 24 2026): the current round's weeks open; each older round
  // folds into one closed row — her Aug 30 words: Round 1 is "a closed
  // chapter" (archived, still one tap away). WK4: the current round is
  // whichever round the LAST row belongs to (chronological), so a completion
  // row (always the true "now" once one exists) decides it the same way the
  // old calendar walk's own last row used to.
  const currentRound = rows[rows.length - 1]!.round;
  const older = ROUNDS.filter((r) => r.num < currentRound)
    .map((r) => {
      const roundRows = rows.filter((row) => row.round === r.num);
      if (roundRows.length === 0) return '';
      const training = roundRows.filter((row) => !row.skipped).length;
      return `
        <details class="spw-older">
          <summary class="spw-older-summary">Round ${r.num} · ${training} wks <span class="spw-older-chev" aria-hidden="true">▸</span></summary>
          <div class="spw-rows">${roundRows.map(renderPerWeekRow).join('')}</div>
        </details>`;
    })
    .join('');
  const current = rows.filter((r) => r.round === currentRound);

  return `
    <div class="card progress-card spw-card" aria-label="Sessions per week: ${hits} full ${hits === 1 ? 'week' : 'weeks'}">
      <div class="progress-card-label">Sessions per week</div>
      <div class="spw-rows">${current.map(renderPerWeekRow).join('')}</div>
      ${older}
      <div class="progress-card-meta">
        ${scoreLine}
      </div>
    </div>
  `;
}

// ---------- v50 · Capacity & cycle card (Sep 25 2026) ----------
//
// Her words (04:01-04:02): "I also want capacity analysis in progress before
// and after and period what phase and then comparing capacity and phase" ->
// "you have all past cycle info". The v48 · P6 capacity chart above was
// pulled because it charted untouched slider defaults as if she'd chosen
// them (DECISIONS §2 #6) — this card reuses that lesson: cycle.ts's
// honestBefore/honestAfter drop every ambiguous pre-v48 "5" before anything
// here sees it, and a phase with under 3 honest sessions shows "not enough
// yet" rather than an average of 1-2. Register: neutral, no PMS, no verdicts
// (app-building-guide.md §1-2 + her Sep 25 ask) — the one optional line is a
// question, never a statement.
// l.date is NOT reliably a plain 'YYYY-MM-DD': a just-saved, not-yet-synced
// row holds the full ISO datetime it was saved with (`completedAt`), while a
// row that's round-tripped through Supabase's `date` column comes back plain
// — both shapes coexist on a real phone. cycle.ts's day math needs the plain
// form, so every date crosses through localIsoDate(new Date(...)) here, the
// same normalization the walk-date and export paths already use elsewhere in
// this file — her LOCAL calendar day, not the UTC one a raw slice would give.
function capacitySessionsFrom(logs: LogEntry[]): CapacitySession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    capacityBefore: l.capacityBefore,
    capacityAfter: l.capacityAfter,
  }));
}

// v50 · mood: same normalization as capacitySessionsFrom above — same reason.
function moodSessionsFrom(logs: LogEntry[]): MoodSession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    moodBefore: l.moodBefore ?? null,
    moodAfter: l.moodAfter ?? null,
  }));
}

// v51: same normalization, back & wrist before -> after.
function backSessionsFrom(logs: LogEntry[]): BackSession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    backBefore: l.backPainBefore ?? null,
    backAfter: l.backPain,
  }));
}

function wristSessionsFrom(logs: LogEntry[]): WristSession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    wristBefore: l.wristPainBefore ?? null,
    wristAfter: l.wristPain ?? null,
  }));
}

function cyclePeriodsForLogic(): CyclePeriod[] {
  return loadCyclePeriods().map((p) => ({
    startDate: p.startDate,
    source: p.source,
    note: p.note,
  }));
}

// ---------- v51 · "Your cycle" page (Sep 25 2026) — its own screen ----------
//
// See renderCycle's own comment for her words on why. Was the "Capacity &
// cycle" Progress card (jargon 4-phase table + dot/slope chart) -> the
// v51-progress-plain "Your cycle" card (Gemini's review, plain phases, still
// one dense card) -> now its own page, reached by a single door row on
// Progress. Full spec:
// second-brain/self/health/workout-app-audit-2026-09-24/cycle-page-v51/
// SPEC-cycle-page.md. Same underlying math throughout (cycle.ts's honest
// readings, MIN_PHASE_N gate) — only the picture keeps getting plainer.

// Progress's own door row sub-line (spec §1) — checked in the order the spec
// lists: the two no-data states first, then the predicted-window states,
// then the two normal-phase states.
function cycleDoorSub(periods: CyclePeriod[], todayISO: string): string {
  if (periods.length === 0) return 'No period logged yet';
  const status = todayCycleStatus(periods, todayISO);
  if (!status) return 'Needs one more logged period';
  if (periodLogUrgency(periods, todayISO) === 'primary') {
    return status.overdue
      ? 'Period due any day · started?'
      : `Period expected around ${formatMonthDay(status.nextStart)} · started?`;
  }
  if (status.plainPhase === 'on-period') return `On your period · day ${status.cycleDay}`;
  return `${PLAIN_PHASE_HEADER_LABEL[status.plainPhase]} · day ${status.cycleDay}`;
}

// The one row that replaces the whole old card on Progress — navigation,
// never sage (sage marks the primary action; this is a door). Same position
// in both the empty and normal Progress states (spec §1).
function renderCycleDoorRow(): string {
  const periods = cyclePeriodsForLogic();
  const todayISO = localIsoDate(new Date());
  return `
    <div class="card progress-card">
      <button class="door-row cycle-door" id="open-cycle" type="button">
        <span class="cycle-door-text">
          <span class="cycle-door-title">🌙 Your cycle</span>
          <span class="cycle-door-sub">${escapeHtml(cycleDoorSub(periods, todayISO))}</span>
        </span>
        <span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>`;
}

// Card A's subline once today is placed in a phase (spec §2.3) — no "~", no
// "next one"; the header right above already names the phase in words.
function cycleCardASubline(status: TodayCycleStatus): string {
  if (status.plainPhase === 'on-period') return `day ${status.cycleDay} of your period`;
  if (status.overdue) return `day ${status.cycleDay} · period due any day`;
  return `day ${status.cycleDay} · period expected around ${formatMonthDay(status.nextStart)}`;
}

// Card A — Today (always shown). The two non-normal states (§2.5) share its
// shell; the normal state's header/subline come from today's real phase.
function renderCycleCardA(
  periods: CyclePeriod[],
  todayISO: string,
  status: TodayCycleStatus | null
): string {
  let header: string;
  let subline: string;
  if (periods.length === 0) {
    header = 'No period logged yet';
    subline = 'Phases show here once a start is logged.';
  } else if (!status) {
    header = 'Not placed yet';
    subline = 'Phases show once 2 period starts are logged.';
  } else {
    header = PLAIN_PHASE_HEADER_LABEL[status.plainPhase];
    subline = cycleCardASubline(status);
  }
  return `
    <div class="card progress-card cycle-card-a">
      <div class="cc2-header">${escapeHtml(header)}</div>
      <div class="cc2-subline">${escapeHtml(subline)}</div>
      ${renderCycleLogRow(periods, todayISO)}
    </div>`;
}

// One "This phase" / "Compare phases" number row — Body, Mood, Back pain or
// Wrist pain, shared by Card B and Card C's chip-less styling (§2.3).
function cycleNowRow(label: string, row: PlainPhaseTableRow | undefined): string {
  if (!row || row.avgBefore === null || row.avgAfter === null) return '';
  return `
    <div class="cc2-now">
      <span class="cc2-now-lbl">${escapeHtml(label)}</span>
      <span class="cc2-now-val">${row.avgBefore.toFixed(1)} → ${row.avgAfter.toFixed(1)}</span>
    </div>`;
}

// Card B — This phase (shown only when `status` is non-null; the caller
// gates that). Body ready unlocks Mood/Back/Wrist; not ready says the gap
// once and stops (spec §2.3 — "never four 'not enough yet's").
function renderCycleCardB(
  currentBody: PlainPhaseTableRow,
  currentMood: PlainPhaseTableRow | undefined,
  currentBack: PlainPhaseTableRow | undefined,
  currentWrist: PlainPhaseTableRow | undefined
): string {
  const bodyReady = currentBody.avgBefore !== null && currentBody.avgAfter !== null;
  let body: string;
  if (!bodyReady) {
    const n = currentBody.n;
    body =
      n === 0
        ? `<div class="cc-quiet">No workouts in this phase yet.</div>`
        : `<div class="cc-quiet">No body numbers for this phase yet — ${n} workout${n === 1 ? '' : 's'} so far, needs 3.</div>`;
  } else {
    const moodReady =
      currentMood && currentMood.avgBefore !== null && currentMood.avgAfter !== null;
    const moodLine = moodReady
      ? cycleNowRow('Mood', currentMood)
      : `<div class="cc-quiet">Mood: started ${formatMonthDay(MOOD_TRACKING_START_DATE)} — shows here after 3 workouts in this phase.</div>`;
    body = `
      <div class="cc2-now">
        <span class="cc2-now-lbl">Body</span>
        <span class="cc2-now-val">${currentBody.avgBefore!.toFixed(1)} → ${currentBody.avgAfter!.toFixed(1)}</span>
      </div>
      <div class="cc2-now-meta">${currentBody.n} workout${currentBody.n === 1 ? '' : 's'}</div>
      ${moodLine}
      ${cycleNowRow('Back pain', currentBack)}
      ${cycleNowRow('Wrist pain', currentWrist)}`;
  }
  return `
    <div class="card progress-card">
      <div class="cc2-compare-label">This phase · before → after</div>
      ${body}
    </div>`;
}

// Card C — Compare phases (shown only when `status` is non-null). The chip
// row only appears once a metric other than Body clears `isComparable`;
// otherwise the table just shows Body (spec §2.3).
function renderCycleCardC(
  status: TodayCycleStatus,
  bodyRows: PlainPhaseTableRow[],
  moodRows: PlainPhaseTableRow[],
  backRows: PlainPhaseTableRow[],
  wristRows: PlainPhaseTableRow[],
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): string {
  const metricRows: Record<CycleMetric, PlainPhaseTableRow[]> = {
    body: bodyRows,
    mood: moodRows,
    back: backRows,
    wrist: wristRows,
  };
  const metricLabel: Record<CycleMetric, string> = {
    body: 'Body',
    mood: 'Mood',
    back: 'Back pain',
    wrist: 'Wrist pain',
  };
  // Fixed order (spec): Body always, then whichever of Mood/Back/Wrist is
  // comparable — never a chip for a metric with fewer than 2 ready phases.
  const comparableMetrics = (['mood', 'back', 'wrist'] as CycleMetric[]).filter((m) =>
    isComparable(metricRows[m])
  );
  const showChips = comparableMetrics.length > 0;
  const chipMetrics: CycleMetric[] = ['body', ...comparableMetrics];
  const selectedMetric: CycleMetric =
    showChips && chipMetrics.includes(cycleCompareMetric) ? cycleCompareMetric : 'body';

  const chipsHtml = showChips
    ? `<div id="cycle-metric-chips" class="cycle-chips">${chipMetrics
        .map(
          (m) =>
            `<button class="cycle-chip${m === selectedMetric ? ' cycle-chip-on' : ''}" data-cycle-metric="${m}" type="button">${escapeHtml(metricLabel[m])}</button>`
        )
        .join('')}</div>`
    : '';

  const rows = metricRows[selectedMetric];
  const hasDash = rows.some((r) => r.avgBefore === null || r.avgAfter === null);
  const tableRows = rows
    .map((r) => {
      const isNow = r.plainPhase === status.plainPhase;
      const before = r.avgBefore !== null ? r.avgBefore.toFixed(1) : '—';
      const after = r.avgAfter !== null ? r.avgAfter.toFixed(1) : '—';
      return `
        <tr${isNow ? ' class="cycle-now" aria-current="true"' : ''}>
          <td>${escapeHtml(PLAIN_PHASE_LABEL[r.plainPhase])}</td>
          <td>${before}</td>
          <td>${after}</td>
          <td>${r.n}</td>
        </tr>`;
    })
    .join('');

  const footnote = hasDash
    ? `<div class="cc-quiet">— means fewer than 3 workouts with a reading so far.</div>`
    : '';
  const summary = selectedMetric === 'body' ? cycleSummaryLine(sessions, periods) : null;
  const summaryHtml = summary ? `<div class="cc-question">${escapeHtml(summary)}</div>` : '';

  // v51 · fix (Sep 25 2026, checker NICE 7): with no chip row, the table only
  // ever shows Body, but the label alone never said so — a tired reader had
  // to infer it from the numbers. Say it once, right in the label.
  const compareLabel = showChips ? 'Compare phases' : 'Compare phases · Body';

  return `
    <div class="card progress-card">
      <div class="cc2-compare-label">${compareLabel}</div>
      ${chipsHtml}
      <table id="cycle-compare" class="cycle-table">
        <thead><tr><th></th><th>Before</th><th>After</th><th>Workouts</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${footnote}
      ${summaryHtml}
    </div>`;
}

// Fold D — "ⓘ How these are counted" (shown only when `status` is
// non-null). Fail-loud rule, folded quiet instead of sitting on the face.
function renderCycleInfoFold(excluded: number): string {
  return `
    <details class="cc2-info">
      <summary>ⓘ How these are counted</summary>
      <p>Before → after = the 1–10 you pick before a workout and after it. Each workout counts in the phase of the day you did it, from your logged period dates. On your period = days 1–5. Week before period = the 7 days before the next expected start (a late period stays here). Mid-cycle = the days before that, around ovulation. Week after period = the days in between. The next start is estimated from your usual cycle length (the middle of your last 6). A number shows once a phase has 3 or more workouts with that reading. Untouched sliders don't count${
        excluded > 0
          ? `, and ${excluded} old "5" reading${excluded === 1 ? '' : 's'} from before Sep 24 ${excluded === 1 ? 'is' : 'are'} left out for the same reason.`
          : '.'
      }</p>
    </details>`;
}

// The page itself (spec §2) — her words (Fri Sep 25 2026, 11:56): "Okay
// whatever this is is still insanely confusing and I think it should be on
// its own page not in this page". `cycleReturnTo`/`cycleCompareMetric` are
// set by the doors that open it (attachCycleHandlers) before `state.screen`
// flips.
function renderCycle(): string {
  const logs = getChronologicalLogs();
  const periods = cyclePeriodsForLogic();
  const todayISO = localIsoDate(new Date());
  const status = todayCycleStatus(periods, todayISO);

  const backLabel = cycleReturnTo === 'progress' ? '‹ Progress' : '‹ Home';
  const header = `
    <div class="screen-header">
      <h2>Your cycle</h2>
      <button class="quit-link" id="back-from-cycle" type="button">${backLabel}</button>
    </div>`;

  const cardA = renderCycleCardA(periods, todayISO, status);

  // §2.5: B, C and D stay hidden until today is placed in a phase.
  if (!status) {
    return `${header}<div class="progress-screen">${cardA}</div>`;
  }

  const sessions = capacitySessionsFrom(logs);
  const moodSessions = moodSessionsFrom(logs);
  const backSessions = backSessionsFrom(logs);
  const wristSessions = wristSessionsFrom(logs);
  const bodyRows = buildPlainPhaseTable(sessions, periods);
  const moodRows = buildPlainMoodPhaseTable(moodSessions, periods);
  const backRows = buildPlainBackPhaseTable(backSessions, periods);
  const wristRows = buildPlainWristPhaseTable(wristSessions, periods);
  const excluded = excludedUntouchedCount(sessions);

  const currentBody = bodyRows.find((r) => r.plainPhase === status.plainPhase)!;
  const currentMood = moodRows.find((r) => r.plainPhase === status.plainPhase);
  const currentBack = backRows.find((r) => r.plainPhase === status.plainPhase);
  const currentWrist = wristRows.find((r) => r.plainPhase === status.plainPhase);

  const cardB = renderCycleCardB(currentBody, currentMood, currentBack, currentWrist);
  const cardC = renderCycleCardC(
    status,
    bodyRows,
    moodRows,
    backRows,
    wristRows,
    sessions,
    periods
  );

  return `
    ${header}
    <div class="progress-screen">
      ${cardA}
      ${cardB}
      ${cardC}
    </div>
    ${renderCycleInfoFold(excluded)}`;
}

// "Period started today" tap — hers, one tap, undo-able for CYCLE_UNDO_MS.
// Also lives as a quiet row in Settings (renderCycleSettingsRow below).
function renderCycleLogRow(periods: CyclePeriod[], todayISO: string): string {
  if (cycleUndoStartDate) {
    // v50 · fix (Sep 25 2026): a re-log of an already-logged date has no
    // Undo — there's no new row it created, so an Undo tap must not be able
    // to delete the original.
    if (!cycleUndoCreated) {
      return `
        <div class="cc-log-undo">
          <span>Already logged ${formatMonthDay(cycleUndoStartDate)}.</span>
        </div>`;
    }
    // v51 · her spec: "Logged · Sep 29 ✓ Undo".
    return `
      <div class="cc-log-undo">
        <span>Logged · ${formatMonthDay(cycleUndoStartDate)} ✓</span>
        <button class="cc-log-undo-btn" id="cc-undo" type="button">Undo</button>
      </div>`;
  }
  // v51 · her spec: quiet (outline) most of the month, sage PRIMARY only in
  // the window around a predicted start (periodLogUrgency, cycle.ts).
  // "Started on a different day?" stays folded — no date box sitting on the
  // card — until tapped open.
  const urgent = periodLogUrgency(periods, todayISO) === 'primary';
  return `
    <div class="cc-log-row">
      <button class="cc-log-btn${urgent ? ' cc-log-btn-primary' : ''}" id="cc-log-today" type="button">Period started today</button>
    </div>
    <details class="cc-date-reveal">
      <summary class="cc-quiet">Started on a different day?</summary>
      <div class="cc-date-row">
        <input class="cc-date-input" type="date" id="cc-log-date" max="${todayISO}" />
      </div>
    </details>`;
}

// Settings' own quiet row (spec: "the Progress card (and a quiet row in
// Settings)") — same logPeriodStart/undoPeriodStart, its own ids so both
// screens' handlers can coexist without clashing.
function renderCycleSettingsRow(): string {
  if (cycleUndoStartDate) {
    if (!cycleUndoCreated) {
      return `
        <div class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Already logged ${formatMonthDay(cycleUndoStartDate)}</div>
          </div>
        </div>`;
    }
    return `
      <div class="settings-row">
        <div class="settings-row-text">
          <div class="settings-row-title">Logged ${formatMonthDay(cycleUndoStartDate)}</div>
        </div>
        <button class="settings-inline-btn" id="settings-cycle-undo" type="button">Undo</button>
      </div>`;
  }
  return `
    <div class="settings-row">
      <div class="settings-row-text">
        <div class="settings-row-title">Period started today</div>
        <div class="settings-row-caption">Logs today's date. More in Progress › Your cycle.</div>
      </div>
      <button class="settings-inline-btn" id="settings-cycle-today" type="button">Log</button>
    </div>`;
}

function renderProgress(): string {
  const logs = getChronologicalLogs(); // oldest → newest, by date
  const count = logs.length;

  // v48 · P6 (Sep 24 2026): the "Exercise breakdown" card (94 rows repeating
  // three numbers — uxui progress 3/5) became these three chips.
  const byWorkout: Record<WorkoutId, number> = { A: 0, B: 0, C: 0 };
  // v54 (Sep 27 2026): D is extra, never one of the three — it counts in
  // cardio minutes/totals (the Rides page, via ellipticalRideRecords, which
  // reads cardioLane not workout letter) but never in this A/B/C breakdown.
  for (const l of logs) if (l.workout !== 'D') byWorkout[l.workout] += 1;
  const subtitle =
    count > 0
      ? `<div class="progress-subtitle">${(['A', 'B', 'C'] as WorkoutId[])
          .map((id) => `<span class="progress-chip">${id} ${byWorkout[id]}</span>`)
          .join('')}</div>`
      : '';

  const header = `
    <div class="screen-header">
      <h2>Progress</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // Empty state — fewer than 2 sessions. v51: the door to "Your cycle" still
  // shows (it can start from just a logged period, no sessions needed for
  // the "Period started today" tap itself).
  if (count < 2) {
    return `
      ${header}
      ${subtitle}
      <p class="progress-empty">Progress shows once you have 2+ sessions logged.</p>
      ${renderCycleDoorRow()}
      ${renderRidesDoorRow(logs)}
      ${renderProgramArchive()}
    `;
  }

  // v48 · P6: the OLD capacity chart is gone — it charted untouched defaults
  // (6 of 8 Round-2 after-readings were the invented 5; the real mean change
  // was 0.00 over 24 pairs). DECISIONS §2 #6. v51: "Your cycle" moved off
  // this screen onto its own page (renderCycle) — this is just the one door
  // row to it now (spec §1).
  return `
    ${header}
    ${subtitle}
    <div class="progress-screen">
      ${renderStartNowCard(logs)}
      ${renderCycleDoorRow()}
      ${renderRidesDoorRow(logs)}
      ${renderWallSitTrendCard(logs)}
      ${renderBackPainTrendCard(logs)}
      ${renderSessionsPerWeekCard(logs)}
    </div>
    ${renderProgramArchive()}
  `;
}

// v48 · P4 (Sep 24 2026): "Coming next week" + "Past weeks" moved here from
// home, as-is (P6 restyles) — the program's past and next stay one tap from
// Progress (her archive rule: "just be archived nicely so i can pull when
// needed"), off the front door.
function renderProgramArchive(): string {
  const inner = `${renderComingNextWeek()}${renderPastWeeks()}`;
  if (!inner.trim()) return '';
  return `
    <div class="program-archive">
      <h3 class="program-archive-label">Program</h3>
      ${inner}
    </div>`;
}

// ---------- Ship 6: Settings screen ----------
//
// Reachable via the small gear icon in the home header (top-right). NOT a
// primary CTA — settings is reference, not action. Sections: Audio, Timing,
// Display, Gear, Neck release, Data (folded), About.
//
// All toggles persist to localStorage via setSetting/getSetting. Data section
// has export / import / hold-to-confirm clear. Import is merge-only; Clear
// is local-only (Supabase rows preserved) per the archive-not-delete rule.

// APP_VERSION is declared once near the top (single source of truth, shown in
// the home-header tag); the About caption below reuses it.
const GITHUB_REPO_URL = 'https://github.com/allisonecalt-sudo/workout-tracker';

// v48 · P6: the Data fold stays open across its own re-render (an import or a
// clear re-renders, then shows its status line inside the fold).
let settingsDataOpen = false;

function renderSettings(): string {
  const beepsOn = getBeepsEnabled();
  const restSec = getRestSec();
  const preCount = getPreCountSec();
  const howToOn = getHowToFirstExpand();
  const logCount = loadLogs().length;
  const latestRound = ROUNDS[ROUNDS.length - 1] ?? ROUNDS[0]!;
  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Settings › About": before the
  // launch, unchanged ("Program weeks: N" — a raw count she'd have to
  // translate). At/after it, the same Round/Week she reads everywhere else on
  // the completion model — the round's own start is still the calendar
  // anchor pre-launch already used ("since Aug 29"); only the WEEK now comes
  // from week.ts instead of a raw PROGRAM-row count.
  const aboutWeekRow = isNowAfterCompletionLaunch()
    ? (() => {
        const key = shownWeek().key;
        const round = ROUNDS.find((r) => r.num === key.round) ?? latestRound;
        return {
          title: `Round ${key.round} · Week ${key.week}`,
          caption: `since ${formatMonthDay(round.start + 'T00:00:00')}`,
        };
      })()
    : {
        title: `Program weeks: ${getProgramWeekCount()}`,
        caption: `Round ${latestRound.num} · from ${formatMonthDay(latestRound.start + 'T00:00:00')}`,
      };

  return `
    <div class="screen-header">
      <h2>Settings</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>

    <div class="settings-screen">

      <div class="card settings-card">
        <div class="settings-section-label">Audio</div>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Beep sounds</div>
            <div class="settings-row-caption">Timer count-downs and finish chime.</div>
          </div>
          <span class="settings-toggle ${beepsOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-beeps" ${beepsOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Timing</div>
        <div class="settings-stepper-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Rest duration</div>
            <div class="settings-row-caption">Between main-set exercises. 0 = straight on · up to 180 s.</div>
          </div>
          <div class="settings-stepper" data-stepper="rest">
            <button class="settings-stepper-btn" id="rest-dec" type="button" aria-label="Decrease rest by 5 seconds">−</button>
            <span class="settings-stepper-val" id="rest-val">${restSec}s</span>
            <button class="settings-stepper-btn" id="rest-inc" type="button" aria-label="Increase rest by 5 seconds">+</button>
          </div>
        </div>
        <div class="settings-stepper-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Pre-countdown</div>
            <div class="settings-row-caption">Before holds. 0 skips. Rides never count down.</div>
          </div>
          <div class="settings-stepper" data-stepper="pre">
            <button class="settings-stepper-btn" id="pre-dec" type="button" aria-label="Decrease pre-countdown by 1 second">−</button>
            <span class="settings-stepper-val" id="pre-val">${preCount}s</span>
            <button class="settings-stepper-btn" id="pre-inc" type="button" aria-label="Increase pre-countdown by 1 second">+</button>
          </div>
        </div>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Display</div>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Open how-to on first visit</div>
            <div class="settings-row-caption">First time each week.</div>
          </div>
          <span class="settings-toggle ${howToOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-howto" ${howToOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Cycle</div>
        ${renderCycleSettingsRow()}
      </div>

      ${
        // v48 · P4 moved Gear & recovery here; P6 (Sep 24 2026) made it chips +
        // its own Neck release card (DECISIONS §5).
        renderGearCard()
      }

      <details class="card settings-card settings-data"${settingsDataOpen ? ' open' : ''}>
        <summary class="settings-data-summary">
          <span>Data · export · import · clear</span>
          <span class="settings-data-chev" aria-hidden="true">▸</span>
        </summary>
        <div class="settings-data-row">
          <button class="btn-ghost settings-data-btn" id="export-sessions" type="button">Export sessions</button>
          <div class="settings-row-caption">All sessions on this phone (${logCount}).</div>
        </div>
        <div class="settings-data-row">
          <button class="btn-ghost settings-data-btn" id="import-sessions-btn" type="button">Import sessions</button>
          <input type="file" id="import-sessions-input" accept="application/json,.json" style="display:none" />
          <div class="settings-row-caption">Existing entries on this phone win.</div>
        </div>
        <div class="settings-data-row">
          <button class="settings-clear-link hold-to-confirm" id="clear-local" type="button" data-hold-ms="${HOLD_TO_CLEAR_MS}">
            <span class="hold-fill"></span>
            <span class="hold-label">Hold to clear sessions on this phone</span>
          </button>
          <div class="settings-row-caption">This phone only. Cloud copy stays.</div>
        </div>
        <div class="settings-data-status" id="data-status" aria-live="polite"></div>
      </details>

      <div class="card settings-card">
        <div class="settings-section-label">About</div>
        <div class="settings-about-row">
          <div class="settings-row-title">Workout Tracker</div>
          <div class="settings-row-caption">Build ${APP_VERSION} · ${BUILD_DATE}.</div>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-title">${aboutWeekRow.title}</div>
          <div class="settings-row-caption">${aboutWeekRow.caption}</div>
        </div>
        <div class="settings-about-row">
          <a class="settings-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">Source on GitHub →</a>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-caption">Made by Allison + Claude.</div>
        </div>
      </div>

    </div>
  `;
}

// ---------- Ship 6: data helpers ----------

function exportSessionsToFile(): void {
  const logs = loadLogs();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `workout-tracker-export-${stamp}.json`;
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showDataStatus(`Exported ${logs.length} session${logs.length === 1 ? '' : 's'}.`);
}

function importSessionsFromFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = reader.result;
      if (typeof raw !== 'string') {
        showDataStatus('Import failed: could not read file.');
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        showDataStatus('Import failed: file is not a session array.');
        return;
      }
      const incoming: LogEntry[] = [];
      for (const item of parsed) {
        if (isValidLogEntry(item)) {
          incoming.push({
            ...item,
            id: item.id ?? genId(),
            word: typeof item.word === 'string' ? item.word : '',
          });
        }
      }
      // Merge by id. Existing local entries win on conflict.
      const local = loadLogs();
      const byId = new Map<string, LogEntry>();
      for (const e of incoming) {
        if (e.id) byId.set(e.id, e);
      }
      for (const e of local) {
        if (e.id) byId.set(e.id, e); // local overrides incoming
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
      writeLogs(merged);
      const added = merged.length - local.length;
      // Re-render so log-count caption updates, THEN surface the status
      // (the new DOM has a fresh #data-status node).
      render();
      showDataStatus(
        `Imported ${incoming.length} entr${incoming.length === 1 ? 'y' : 'ies'}, ${added} new.`
      );
    } catch {
      showDataStatus('Import failed: file is not valid JSON.');
    }
  };
  reader.readAsText(file);
}

function clearLocalSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Re-render first (DOM gets recreated, log-count caption updates), THEN
    // surface the status. If we showed status before render(), the freshly-
    // rendered DOM would have no status node and the message would vanish.
    render();
    showDataStatus('Local sessions cleared.');
  } catch {
    showDataStatus('Clear failed.');
  }
}

function showDataStatus(msg: string): void {
  const el = document.getElementById('data-status');
  if (el) {
    el.textContent = msg;
    el.classList.add('settings-data-status-visible');
    window.setTimeout(() => {
      if (el.textContent === msg) {
        el.classList.remove('settings-data-status-visible');
      }
    }, 4000);
  }
}

// ---------- Ship 6: hold-to-confirm panel (slide-out, not window.confirm) ----------
//
// Used by Quit during workout (v48 · fix r1: on every tap now — the native
// window.confirm is gone) and by destructive settings actions.

function showQuitConfirmPanel(): void {
  if (document.getElementById('quit-confirm-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'quit-confirm-panel';
  panel.className = 'quit-confirm-panel';
  // v48 · fix r2 (Sep 25 2026): the kind way out comes FIRST. It was last and
  // quiet while "Quit" (nothing saved) was a filled orange button — the panel
  // leaned toward the half session vanishing, which DECISIONS names "the quiet
  // quit" (ux.md #8), and the orange broke the no-red rule. Now: "Log what I
  // did" (full width, the panel's one sage), Cancel, then a quiet text link
  // that says exactly what it does.
  panel.innerHTML = `
    <div class="quit-confirm-card">
      <div class="quit-confirm-title">Quit this workout?</div>
      <div class="quit-confirm-sub">What you did so far still counts.</div>
      <button class="btn quit-confirm-log" id="quit-log" type="button">Log what I did</button>
      <button class="btn quit-confirm-cancel" id="quit-cancel" type="button">Cancel</button>
      <button class="back-link quit-confirm-yes" id="quit-yes" type="button">Quit without saving</button>
    </div>
  `;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('quit-confirm-open'));

  const dismiss = (): void => {
    panel.classList.remove('quit-confirm-open');
    setTimeout(() => {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    }, 220);
  };

  panel.querySelector('#quit-cancel')?.addEventListener('click', dismiss);
  // v48 (Sep 24 2026): the third choice — keep the half session (ux.md #8: "a
  // half session vanishing is the quiet quit"). Goes to the post-log as usual.
  panel.querySelector('#quit-log')?.addEventListener('click', () => {
    dismiss();
    logWhatIDid();
  });
  panel.querySelector('#quit-yes')?.addEventListener('click', () => {
    dismiss();
    resetState();
    render();
  });
  panel.addEventListener('click', (e) => {
    if (e.target === panel) dismiss();
  });
}

// v46: WHERE she is, for the scroll reset in render(). Done·Next at the bottom
// of one step used to open the next step at the same scroll depth — the
// exercise name 69px off the top, another Done·Next under her thumb, 22 of 22
// steps (UX audit Sep 24). Keyed on position, not on render: the timer
// re-renders every second and must never move the page.
let lastNavKey: string | null = null;
// v48 · P6: the list's scroll when a Session was opened from it, per screen,
// and the one value render() should restore on the next screen change.
const detailOpenedAtScroll: Partial<Record<AppScreen, number>> = {};
let pendingScrollRestore: number | null = null;

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
  if (state.screen === 'workout' && state.pausedAt === null && stepListOpen) {
    const w = getCurrentWorkout();
    if (w) html += renderStepListSheet(w);
  }
  // v53 (Sep 26 2026): the running-timer pip — floats over whichever step
  // face is showing (see renderTimerPip). Hidden while the List sheet is up
  // (it's a full overlay above it anyway) — the timer itself keeps running
  // underneath either way, so nothing is lost by not drawing the pip there.
  if (state.screen === 'workout' && state.pausedAt === null && !stepListOpen) {
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
  if (navKey !== lastNavKey) {
    lastNavKey = navKey;
    const restore = pendingScrollRestore;
    pendingScrollRestore = null;
    window.scrollTo(0, restore ?? 0);
  }
  // Persist live position so reopening the app resumes the workout (cleared on
  // quit/finish via resetState). No-op for non-resumable screens.
  saveActiveSession();
}

// Group 2H: hold-to-skip implementation. The button shows a fill that
// progresses over HOLD_TO_SKIP_MS; on release before complete, fill resets.
function wireHoldToSkip(btn: HTMLElement, onSkip: () => void): void {
  const holdMs = parseInt(btn.dataset['holdMs'] ?? `${HOLD_TO_SKIP_MS}`, 10) || HOLD_TO_SKIP_MS;
  const fill = btn.querySelector<HTMLElement>('.hold-fill');
  let holdStart: number | null = null;
  let raf: number | null = null;
  let fired = false;

  function tick(): void {
    if (holdStart === null) return;
    const elapsed = Date.now() - holdStart;
    const pct = Math.min(1, elapsed / holdMs);
    if (fill) fill.style.width = `${pct * 100}%`;
    if (pct >= 1 && !fired) {
      fired = true;
      reset();
      onSkip();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function reset(): void {
    holdStart = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (fill) fill.style.width = '0%';
  }

  function down(e: Event): void {
    e.preventDefault();
    if (fired) return;
    holdStart = Date.now();
    tick();
  }

  function up(): void {
    if (fired) return;
    reset();
  }

  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
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

  bindClick('view-history', () => {
    state.screen = 'history';
    render();
  });

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

  // v48 · P6 (Sep 24 2026): the ‹ › week arrows, moved here from home (P4) —
  // stepping back through weeks lives on the screen made for looking back.
  bindClick('prev-week', () => {
    viewedWeekOffset += 1;
    render();
  });
  bindClick('next-week', () => {
    if (viewedWeekOffset > 0) viewedWeekOffset -= 1;
    render();
  });

  // Ship 6: Settings entry from home header.
  bindClick('open-settings', () => {
    settingsDataOpen = false; // v48 · P6: the Data fold opens closed
    state.screen = 'settings';
    render();
  });

  // Ship 6: Settings interactions — toggles, steppers, data buttons.
  attachSettingsHandlers();

  // v50 · cycle: Progress card + Settings' quiet row.
  attachCycleHandlers();

  // THE RIDES PAGE (Sep 27 2026): Progress's one door row + the page itself.
  attachRidesHandlers();

  // Ship 4: open weekly-review screen. v48 · P4 (Sep 24 2026): home only ever
  // shows THIS week now, so it opens this week (offset 0). The whole week card is the one door to Weekly review (the
  // separate "📊 Weekly review" row is gone). It's a div (the day dots inside
  // are buttons), so Enter/Space open it too.
  const openWeeklyReview = (): void => {
    viewedWeekOffset = 0;
    state.screen = 'weekly-review';
    render();
  };
  bindClick('open-weekly-review', openWeeklyReview);
  document.getElementById('open-weekly-review')?.addEventListener('keydown', (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openWeeklyReview();
    }
  });

  // WK2 (Sep 27 2026), §8c amendment: "‹ Week 4" peeks at the last closed
  // week on Home's own week card; "Week 5 ›" returns. A plain view toggle —
  // never touches what a session counts toward or trains. Raw listener (not
  // bindClick), same reason as the [data-detail] dots just above: this sits
  // INSIDE .week-card, whose own click opens Weekly review — without
  // stopPropagation a tap here would fire both.
  document.getElementById('week-nav-back')?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewingLastClosedWeek = true;
    render();
  });
  document.getElementById('week-nav-forward')?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewingLastClosedWeek = false;
    render();
  });

  // WK3 (Sep 27 2026), §2.4: "Move on without it" — quiet, explicit, her own
  // tap only (the app never moves on by itself). Raw listener + stopPropagation
  // for the same reason week-nav-back/forward need it: this button sits
  // INSIDE .week-card, whose own click opens Weekly review.
  document.getElementById('week-move-on')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const shown = shownWeek();
    if (!shown.span) return; // button only ever renders when shown.span exists (canMoveOn needs it)
    moveOnWithoutIt(shown.key, shown.span.missing);
  });
  // #week-undo sits under the header (outside .week-card), so a plain
  // bindClick is enough — no propagation to stop.
  bindClick('week-undo', () => {
    const move = todaysWeekMove();
    if (move) undoWeekMove(move);
  });

  // Ship 5: Progress screen — full-history longitudinal view, from home's door.
  // (v48 · P6: the Session screen's "📈 View progress" link and the Exercise
  // breakdown toggle are gone with what they opened.)
  bindClick('open-progress-link', () => {
    state.screen = 'progress';
    render();
  });

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

  // v48 · P6 (Sep 24 2026): the Session screen's × Back goes where she came
  // from (Weekly review / Sessions / home), at the scroll she left it.
  bindClick('back-history', () => {
    const target = state.detailReturnTo ?? 'history';
    pendingScrollRestore = detailOpenedAtScroll[target] ?? null;
    state.screen = target;
    state.historyDetailId = null;
    state.detailReturnTo = null;
    render();
  });

  // v53 (Sep 26 2026) — fix a past session's ride numbers (her ask: "there
  // have to be an easy way to enter the data"). The Edit button lives on the
  // Session screen; its own × Back just closes the edit and returns there
  // (state.historyDetailId is unchanged either way — still the same session).
  bindClick('edit-history-session', () => {
    const log = loadLogs().find((l) => l.id === state.historyDetailId);
    if (!log) return;
    openHistoryEdit(log);
  });
  bindClick('back-history-edit', () => {
    historyEditDraft = null;
    state.screen = 'history-detail';
    render();
  });
  bindClick('save-history-edit', () => {
    saveHistoryEdit();
  });
  bindClick('hist-level-down', () => {
    if (!historyEditDraft) return;
    const from = historyEditDraft.level ?? lastEllipticalLevel() ?? ELLIPTICAL_START_LEVEL;
    historyEditDraft = { ...historyEditDraft, level: clampEllipticalLevel(from - 1) };
    render();
  });
  bindClick('hist-level-up', () => {
    if (!historyEditDraft) return;
    const from = historyEditDraft.level ?? lastEllipticalLevel() ?? ELLIPTICAL_START_LEVEL;
    historyEditDraft = { ...historyEditDraft, level: clampEllipticalLevel(from + 1) };
    render();
  });
  // Per-keystroke, no re-render (keeps focus) — same pattern as the live
  // ride-numbers screen's ell-km/ell-pulse/ell-kcal/ell-time listeners.
  const histTime = document.getElementById('hist-time') as HTMLInputElement | null;
  histTime?.addEventListener('input', () => {
    if (historyEditDraft) historyEditDraft.timeStr = histTime.value;
  });
  const histKm = document.getElementById('hist-km') as HTMLInputElement | null;
  histKm?.addEventListener('input', () => {
    if (historyEditDraft) historyEditDraft.kmStr = histKm.value;
  });
  const histKcal = document.getElementById('hist-kcal') as HTMLInputElement | null;
  histKcal?.addEventListener('input', () => {
    if (historyEditDraft) historyEditDraft.kcalStr = histKcal.value;
  });
  const histPulse = document.getElementById('hist-pulse') as HTMLInputElement | null;
  histPulse?.addEventListener('input', () => {
    if (historyEditDraft) historyEditDraft.pulseStr = histPulse.value;
  });
  const histNote = document.getElementById('hist-note') as HTMLTextAreaElement | null;
  histNote?.addEventListener('input', () => {
    if (historyEditDraft) historyEditDraft.note = histNote.value;
  });

  // The Done card (home-done-card) is a div, same reason open-weekly-review
  // needs its own keydown below — Enter/Space don't click a non-button by
  // default.
  document.getElementById('home-done-card')?.addEventListener('keydown', (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  });

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
      detailOpenedAtScroll[state.detailReturnTo] = window.scrollY;
      state.historyDetailId = id;
      state.screen = 'history-detail';
      render();
    });
  });

  bindClick('begin', () => {
    unlockAudio(); // Group 1C
    beginExercises();
  });

  bindClick('next', () => {
    // v51 (Sep 25 2026): Done · Next on the elliptical step opens the ride-
    // numbers screen instead of advancing, in any ride state — her words:
    // "I click the next button and then I fill in information." Once that
    // screen is open this same button reads "Save · Next" and behaves like
    // every other Done · Next (advanceExercise clears the flag on the way out).
    const ex = getCurrentExercise();
    if (
      state.screen === 'workout' &&
      !state.isResting &&
      !state.roundBreak &&
      ex?.name === ELLIPTICAL_NAME &&
      !state.rideNumbersOpen
    ) {
      openRideNumbers();
      return;
    }
    advanceExercise();
  });
  // v47: one step back (her ask Sep 24: "i need to be able to go back").
  bindClick('step-back', () => {
    goBack();
  });

  // v50 · jump list (Sep 25 2026): open/close the sheet, tap outside to
  // dismiss (same convention as the quit-confirm panel), tap a row to jump.
  bindClick('step-list-open', () => {
    stepListOpen = true;
    render();
  });
  bindClick('step-list-close', () => {
    stepListOpen = false;
    render();
  });
  const stepListPanel = document.getElementById('step-list-panel');
  stepListPanel?.addEventListener('click', (e) => {
    if (e.target === stepListPanel) {
      stepListOpen = false;
      render();
    }
  });

  // v53 (Sep 26 2026): the running-timer pip. Tap opens the Pause/Stop sheet;
  // Pause reuses togglePause() (the same "Paused" overlay + frozen clock the
  // header's Pause button gives — one pause mechanism, not two); Stop keeps
  // #stop-lane/#stop-timed exactly as before (bound below, unchanged).
  bindClick('timer-pip', () => {
    timerPipOpen = true;
    render();
  });
  bindClick('timer-pip-close', () => {
    timerPipOpen = false;
    render();
  });
  bindClick('timer-pip-pause', () => {
    timerPipOpen = false;
    togglePause();
  });
  const timerPipSheet = document.getElementById('timer-pip-sheet');
  timerPipSheet?.addEventListener('click', (e) => {
    if (e.target === timerPipSheet) {
      timerPipOpen = false;
      render();
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-jump-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset['jumpKey'];
      if (key) jumpToStep(key);
    });
  });

  // v45: the post-log text is kept as she types, so an app close on that
  // screen doesn't lose it (the resume snapshot carries it).
  // v48 · P5 (Sep 24 2026): the one-word box is gone (filled 0 of 9 since Aug
  // 30; its 40-character cap cut her May 11 entry mid-word) — one note box.
  const noteInput = document.getElementById('session-note') as HTMLTextAreaElement | null;
  noteInput?.addEventListener('input', () => {
    state.sessionNote = noteInput.value;
    saveActiveSession();
  });
  // Enter = "done typing" (the keyboard's Done key): it closes the keyboard so
  // Save is in view — it never saves by itself (a save she didn't choose is a
  // surprise). Shift+Enter still makes a new line.
  noteInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      noteInput.blur();
    }
  });
  // The wall-sit number survives a chip tap's re-render.
  const wallsitInput = document.getElementById('wallsit') as HTMLInputElement | null;
  wallsitInput?.addEventListener('input', () => {
    const raw = parseInt(wallsitInput.value, 10);
    state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    saveActiveSession();
  });

  // T1 (Sep 27 2026), §3.1/§3.2: the start/finish confirm row — ✓ Right
  // fixes it at whatever the live clock is showing RIGHT NOW (not the
  // possibly-stale last-tick value); ✎ Fix opens the time box + "N min ago"
  // chips instead. One handler pair, `kind` picked from the button's own id.
  const confirmTimeNow = (kind: 'start' | 'end'): void => {
    const iso = new Date().toISOString();
    if (kind === 'start') {
      state.herStartAt = iso;
      state.herStartConfirmed = true;
      state.herStartEditingOpen = false;
      endPreLogClockTick();
    } else {
      state.herEndAt = iso;
      state.herEndConfirmed = true;
      state.herEndEditingOpen = false;
      endPostLogClockTick();
    }
    render();
  };
  bindClick('time-start-ok', () => confirmTimeNow('start'));
  bindClick('time-end-ok', () => confirmTimeNow('end'));
  bindClick('time-start-fix', () => {
    state.herStartEditingOpen = true;
    endPreLogClockTick(); // she's deciding now — the live "now" line stops moving under her
    render();
  });
  bindClick('time-end-fix', () => {
    state.herEndEditingOpen = true;
    endPostLogClockTick();
    render();
  });
  // "N min ago" — fixes AND confirms in one tap (§3.1: "Picking a time sets
  // it straight away").
  document.querySelectorAll<HTMLButtonElement>('[data-time-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset['timeChip'];
      const mins = Number(btn.dataset['mins']);
      if (!Number.isFinite(mins)) return;
      const iso = new Date(Date.now() - mins * 60_000).toISOString();
      if (kind === 'start') {
        state.herStartAt = iso;
        state.herStartConfirmed = true;
        state.herStartEditingOpen = false;
      } else if (kind === 'end') {
        state.herEndAt = iso;
        state.herEndConfirmed = true;
        state.herEndEditingOpen = false;
      }
      render();
    });
  });
  // The time box itself (native picker) — same "sets it straight away" rule,
  // combined with the candidate's own calendar day (she's fixing a time
  // earlier tonight, not typing a date).
  const timeStartInput = document.getElementById('time-start-input') as HTMLInputElement | null;
  timeStartInput?.addEventListener('change', () => {
    if (!timeStartInput.value) return;
    state.herStartAt = combineDateAndClock(new Date().toISOString(), timeStartInput.value);
    state.herStartConfirmed = true;
    state.herStartEditingOpen = false;
    render();
  });
  const timeEndInput = document.getElementById('time-end-input') as HTMLInputElement | null;
  timeEndInput?.addEventListener('change', () => {
    if (!timeEndInput.value) return;
    state.herEndAt = combineDateAndClock(new Date().toISOString(), timeEndInput.value);
    state.herEndConfirmed = true;
    state.herEndEditingOpen = false;
    render();
  });
  // Breaks?: None · ~5 min · ~15 min · ~30+ — tap again clears to null
  // (untouched/unknown), same toggle shape as the 1-10 body chips below.
  // "None" is data-break="0", a real confirmed zero, never the default.
  document.querySelectorAll<HTMLButtonElement>('[data-break]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = Number(btn.dataset['break']);
      if (!Number.isFinite(mins)) return;
      const again = btn.getAttribute('aria-pressed') === 'true';
      state.breakMinutes = again ? null : mins;
      render();
    });
  });

  // v48 · P5: the 1-10 body/back chips. Tap = that number; tap the chosen one
  // again = no reading (null), the way an untouched slider saved since v46.
  // v53 (Sep 26 2026): the back/wrist groups are drawn in FEEL (renderBack-
  // WristControl), so `v` here is a FEEL number for those four groups — convert
  // with painFromFeel before it touches state, which stays PAIN throughout
  // (DB columns, the progression flare gate, the cycle page). Body/mood are
  // untouched — they were never inverted.
  document.querySelectorAll<HTMLButtonElement>('[data-body-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset['bodyChip'];
      const v = Number(btn.dataset['value']);
      if (!Number.isFinite(v)) return;
      const again = btn.getAttribute('aria-checked') === 'true';
      if (group === 'cap-before') {
        state.capacityBefore = v;
        state.capacityBeforeTouched = !again;
      } else if (group === 'cap-after') {
        state.capacityAfter = v;
        state.capacityAfterTouched = !again;
      } else if (group === 'mood-before') {
        state.moodBefore = v;
        state.moodBeforeTouched = !again;
      } else if (group === 'mood-after') {
        state.moodAfter = v;
        state.moodAfterTouched = !again;
      } else if (group === 'back') {
        state.backPain = painFromFeel(v);
        state.backPainTouched = !again;
        state.backSomethingOpen = true;
      } else if (group === 'wrist') {
        state.wristPain = painFromFeel(v);
        state.wristPainTouched = !again;
        state.wristSomethingOpen = true;
      } else if (group === 'back-before') {
        state.backPainBefore = painFromFeel(v);
        state.backPainBeforeTouched = !again;
        state.backBeforeSomethingOpen = true;
      } else if (group === 'wrist-before') {
        state.wristPainBefore = painFromFeel(v);
        state.wristPainBeforeTouched = !again;
        state.wristBeforeSomethingOpen = true;
      }
      render();
    });
  });
  // Back & wrist: Fine = both 0 (ONE tap; v49 engine fix Sep 25 2026 — this
  // used to be Back's own row only, and wrist had a SEPARATE Fine tap, which
  // doubled the cost of a normal clean session from 1 tap to 2). Tap again =
  // no reading, on both.
  bindClick('back-fine', () => {
    const wasBothFine =
      state.backPainTouched &&
      state.backPain === 0 &&
      state.wristPainTouched &&
      state.wristPain === 0;
    state.backPain = 0;
    state.backPainTouched = !wasBothFine;
    state.backSomethingOpen = false;
    state.wristPain = 0;
    state.wristPainTouched = !wasBothFine;
    state.wristSomethingOpen = false;
    render();
  });
  // Back = open back's 1-10 row, nothing chosen yet; tap again = close it and
  // drop any number picked there. Wrist is untouched by this button.
  bindClick('back-some', () => {
    const open = state.backSomethingOpen || (state.backPainTouched && state.backPain > 0);
    if (open) {
      state.backSomethingOpen = false;
      state.backPainTouched = false;
    } else {
      state.backSomethingOpen = true;
      state.backPainTouched = false; // "Fine" is no longer the answer
    }
    render();
  });
  // Wrist = the same shape as Back, above; Back is untouched by this button.
  bindClick('wrist-some', () => {
    const open = state.wristSomethingOpen || (state.wristPainTouched && state.wristPain > 0);
    if (open) {
      state.wristSomethingOpen = false;
      state.wristPainTouched = false;
    } else {
      state.wristSomethingOpen = true;
      state.wristPainTouched = false;
    }
    render();
  });
  // v51 (Sep 25 2026): the pre-log twin of the three handlers above — same
  // shape, its own "-pre" ids and its own (Before) state fields.
  bindClick('back-fine-pre', () => {
    const wasBothFine =
      state.backPainBeforeTouched &&
      state.backPainBefore === 0 &&
      state.wristPainBeforeTouched &&
      state.wristPainBefore === 0;
    state.backPainBefore = 0;
    state.backPainBeforeTouched = !wasBothFine;
    state.backBeforeSomethingOpen = false;
    state.wristPainBefore = 0;
    state.wristPainBeforeTouched = !wasBothFine;
    state.wristBeforeSomethingOpen = false;
    render();
  });
  bindClick('back-some-pre', () => {
    const open =
      state.backBeforeSomethingOpen || (state.backPainBeforeTouched && state.backPainBefore > 0);
    if (open) {
      state.backBeforeSomethingOpen = false;
      state.backPainBeforeTouched = false;
    } else {
      state.backBeforeSomethingOpen = true;
      state.backPainBeforeTouched = false; // "Fine" is no longer the answer
    }
    render();
  });
  bindClick('wrist-some-pre', () => {
    const open =
      state.wristBeforeSomethingOpen || (state.wristPainBeforeTouched && state.wristPainBefore > 0);
    if (open) {
      state.wristBeforeSomethingOpen = false;
      state.wristPainBeforeTouched = false;
    } else {
      state.wristBeforeSomethingOpen = true;
      state.wristPainBeforeTouched = false;
    }
    render();
  });
  bindClick('back-to-stretches', () => {
    backToStretches();
  });
  bindClick('back-to-workout', () => {
    backToWorkoutFromStop();
  });
  // v48 · P5: arm feel on the 1 kg curl / prone row — tap selects, tap clears.
  document.querySelectorAll<HTMLButtonElement>('[data-arm-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = btn.dataset['armStep'];
      const feel = btn.dataset['armFeel'];
      if ((step !== 'curl' && step !== 'row') || !isArmFeel(feel)) return;
      state.armFeel = {
        ...state.armFeel,
        [step]: state.armFeel[step] === feel ? undefined : feel,
      };
      if (state.armFeel[step] === undefined) delete state.armFeel[step];
      saveActiveSession();
      render();
    });
  });
  // v58 (Sep 28 2026) — the generalized Easy/Right/Hard on any stepped move:
  // same tap-selects/tap-clears rule as arm feel, keyed by slug instead of a
  // fixed curl/row pair.
  document.querySelectorAll<HTMLButtonElement>('[data-move-feel-slug]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset['moveFeelSlug'];
      const feel = btn.dataset['moveFeel'];
      if (!slug || !isMoveFeelValue(feel)) return;
      const next = { ...state.moveFeel };
      if (next[slug] === feel) delete next[slug];
      else next[slug] = feel;
      state.moveFeel = next;
      saveActiveSession();
      render();
    });
  });
  // v61 (Sep 28 2026), spec item f: the ride's own always-on Easy/Right/Hard
  // — one value per session (there's only ever one ride/D step), tap-selects
  // /tap-clears same as every other feel chip in this app.
  document.querySelectorAll<HTMLButtonElement>('[data-ride-feel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const feel = btn.dataset['rideFeel'];
      if (!isMoveFeelValue(feel)) return;
      state.rideFeel = state.rideFeel === feel ? null : feel;
      saveActiveSession();
      render();
    });
  });
  // v55 (Sep 27 2026) — LOAD CHIP: which weight for the NEXT set. Always one
  // selected (no clear — a set needs a weight), her pick by pain, never a
  // question the app asks.
  document.querySelectorAll<HTMLButtonElement>('[data-arm-load]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = btn.dataset['armLoadStep'];
      const load = btn.dataset['armLoad'];
      if ((step !== 'curl' && step !== 'row') || !isArmLoad(load)) return;
      state.armLoad = { ...state.armLoad, [step]: load };
      // v55 · fix r1: armLoadMax only ever climbs — a drop back to 1 kg after
      // trying 2 kg doesn't erase the 2 kg attempt from what gets saved.
      state.armLoadMax = {
        ...state.armLoadMax,
        [step]: heavierArmLoad(state.armLoadMax[step], load),
      };
      saveActiveSession();
      render();
    });
  });
  // v54 (Sep 27 2026) — CHIP AFTER THE LAST SET: "Set N done" on a multi-set
  // arm-feel move. One-way per session (no untap — a real set doesn't undo
  // itself); capped at the move's own total in renderArmFeel so a stray extra
  // tap can't push it past "N of N".
  document.querySelectorAll<HTMLButtonElement>('[data-mark-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset['markSet'];
      if (!name) return;
      state.setsDoneFor = { ...state.setsDoneFor, [name]: (state.setsDoneFor[name] ?? 0) + 1 };
      // v55 · fix r1: the pace rule now marks itself seen HERE (her first
      // "Set N done" tap on the curl), not inside render() — see
      // renderPaceRuleOnce's own comment.
      if (ARM_FEEL_STEPS[name] === 'curl') markPaceRuleSeen();
      saveActiveSession();
      render();
    });
  });
  // v60 (Sep 28 2026) — F2: "Skip" on the cool-down list does exactly what
  // Done stretching ✓ does (advanceExercise() already treats the whole
  // cool-down as one step, and the app never recorded per-stretch state) —
  // same handler, a quieter button for whenever she'd rather not tap the
  // sage one. Her words (Sep 25 14:54): "I don't mark them in the app and
  // do it on my own." (The old per-row tick handler this replaced is gone —
  // see git history / the F2 commit for its shape.)
  bindClick('cooldown-skip', () => {
    advanceExercise();
  });
  // Explicit Start for the in-workout walk — nothing tracks until she taps it
  // (Allison Jul 9 2026: being on the page ≠ walking started).
  bindClick('ww-start', () => {
    startWorkoutWalk();
    render();
    updateWalkLiveLine();
  });

  // Cardio either/or (Allison Sep 7 2026): "i want cardio i can do in apt or
  // walk like pick either or". Same minutes, indoors, on a plain timer.
  bindClick('ww-apartment', () => {
    const raw = rawCurrentExercise();
    if (!raw) return;
    chooseApartmentCardio(walkStepMinutes(raw));
    render();
  });

  // Elliptical lane (Allison Sep 24 2026): "So no more walk it could be walk
  // or elliptical". Same minutes on a timer, plus the level she rode at.
  bindClick('ww-elliptical', () => {
    const raw = rawCurrentExercise();
    if (!raw) return;
    chooseElliptical(walkStepMinutes(raw));
    render();
  });
  bindClick('ell-level-down', () => {
    stepEllipticalLevel(-1);
    render();
  });
  bindClick('ell-level-up', () => {
    stepEllipticalLevel(1);
    render();
  });
  // v48 · P3: "7 again" — the same level as last time, one tap.
  bindClick('ell-level-same', () => {
    const last = lastEllipticalLevel();
    if (last !== null) setEllipticalLevel(last);
    render();
  });
  // Console readings (v44): saved per keystroke, no re-render (keeps focus).
  const ellKm = document.getElementById('ell-km') as HTMLInputElement | null;
  ellKm?.addEventListener('input', () => {
    setEllipticalReading(WW_ELLIPTICAL_KM_KEY, ellKm.value);
    updateRideLiveLine();
    updateRideAimCompare(); // v61, spec item g: keeps the aim-compare line current too
  });
  const ellPulse = document.getElementById('ell-pulse') as HTMLInputElement | null;
  ellPulse?.addEventListener('input', () =>
    setEllipticalReading(WW_ELLIPTICAL_PULSE_KEY, ellPulse.value)
  );
  // v49: calories + time, same per-keystroke save, no re-render.
  const ellKcal = document.getElementById('ell-kcal') as HTMLInputElement | null;
  ellKcal?.addEventListener('input', () => {
    setEllipticalReading(WW_ELLIPTICAL_KCAL_KEY, ellKcal.value);
    updateRideLiveLine();
  });
  const ellTime = document.getElementById('ell-time') as HTMLInputElement | null;
  ellTime?.addEventListener('input', () => {
    setEllipticalReading(WW_ELLIPTICAL_TIME_KEY, ellTime.value);
    updateRideLiveLine();
  });

  // v51 (Sep 25 2026): the ride-numbers screen's local Back — closes the
  // screen and returns to whichever ride face she left (values kept, nothing
  // cleared). Never the global step-back, which would leave the elliptical
  // step entirely.
  bindClick('ride-numbers-back', () => {
    state.rideNumbersOpen = false;
    render();
  });
  // v51: "no numbers today" — advances with whatever she filled; an untouched
  // field stays null, same rule as every reading on this screen.
  bindClick('ride-numbers-skip', () => {
    advanceExercise();
  });

  // …and back out again to the three-way choice, in case she changes her mind.
  bindClick('ww-outdoor', () => {
    clearApartmentCardio();
    clearElliptical();
    stopTimer();
    render();
  });

  // Lite-day toggle on pre-log (Allison Jul 12 2026): one round less, streak intact.
  bindClick('lite-toggle', () => {
    state.liteDay = !state.liteDay;
    render();
  });

  // Pause / resume the active workout (Allison Jul 7 2026).
  bindClick('pause-toggle', () => {
    togglePause();
  });
  bindClick('pause-resume', () => {
    togglePause();
  });

  // v48 · fix r1 (Sep 24 2026): a plain tap on Quit opens the in-app panel
  // (Cancel / Quit / Log what I did). It used to open a native OK/Cancel
  // window.confirm on a tap and the panel only on a 500 ms hold nothing on
  // screen told her about — so the path she'd actually use still threw the
  // half session away ("a half session vanishing is the quiet quit", ux.md #8).
  // A click also fires on Enter/Space, so keyboard users get the same panel.
  bindClick('quit', () => {
    showQuitConfirmPanel();
  });

  // Hold-to-skip rest (group 2H)
  const skipBtn = document.getElementById('skip-rest');
  if (skipBtn) {
    wireHoldToSkip(skipBtn, () => {
      skipRest();
    });
  }

  bindClick('start-timed', () => {
    startTimedExercise();
  });
  // v48 (Sep 24 2026): the hold's quiet Stop (real seconds) and Redo.
  bindClick('stop-timed', () => {
    stopTimedHold();
  });
  // v48 · P3: the ride's quiet Stop keeps the minutes she actually did.
  bindClick('stop-lane', () => {
    stopLaneTimer();
  });
  // v48 · P3: "Skip cardio today" — on to the next step, no lane (cardio_lane
  // stays null). The old sage Done · Next skipped cardio without saying so.
  bindClick('ww-skip', () => {
    advanceExercise();
  });
  bindClick('redo-timed', () => {
    startTimedExercise();
  });
  // v60 (Sep 28 2026): a multi-set hold's own two buttons — "Start set N"
  // (a fresh next set) and "Redo set N" (redoes the last one). See
  // startNextHoldSet/redoLastHoldSet's own comments.
  bindClick('hold-set-next', () => {
    startNextHoldSet();
  });
  bindClick('hold-redo', () => {
    redoLastHoldSet();
  });
  // v48: the round-1 floor — go on, or finish here (it still counts).
  bindClick('start-round-2', () => {
    startRoundTwo();
  });
  bindClick('finish-here', () => {
    finishAtRoundOne();
  });

  bindClick('save-log', () => {
    const wallsitEl = document.getElementById('wallsit') as HTMLInputElement | null;
    if (wallsitEl) {
      const raw = parseInt(wallsitEl.value, 10);
      state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    }
    const noteEl = document.getElementById('session-note') as HTMLTextAreaElement | null;
    if (noteEl) state.sessionNote = noteEl.value;
    void logCompleteAndHome();
  });

  // Video expanders (group 3N)
  document.querySelectorAll<HTMLButtonElement>('[data-expand-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset['expandVideo'];
      if (!name) return;
      state.videoExpandedFor = state.videoExpandedFor === name ? null : name;
      render();
    });
  });

  // Enriched detail card (Allison Jul 9 2026): dropdown section toggles.
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset['toggleSection'];
      if (!key) return;
      // Read the state the renderer actually drew, not `!openSections[key]`.
      // Detail sections default CLOSED, the v37 setup block defaults OPEN, and
      // the old negation silently no-opped the first tap on anything
      // default-open (undefined → !undefined → true → still open).
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      state.openSections[key] = !isOpen;
      render();
    });
  });

  // Voice-note play buttons. Re-sync visual state after a re-render if this
  // note is still playing (the Audio object survives the DOM rebuild).
  document.querySelectorAll<HTMLButtonElement>('.voice-note-btn').forEach((btn) => {
    const src = btn.dataset['voiceSrc'];
    btn.addEventListener('click', () => {
      if (src) toggleVoiceNote(btn, src);
    });
    if (voiceAudio && voiceAudioSrc === src && !voiceAudio.paused) {
      setVoiceBtnPlaying(btn, true);
    }
  });

  // How-to toggles (group 3N)
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-howto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset['toggleHowto'];
      if (!name) return;
      const isOpenNow = btn.getAttribute('aria-expanded') === 'true';
      if (isOpenNow) {
        state.howToOpenFor = `__closed__${name}`;
      } else {
        state.howToOpenFor = name;
        markHowToSeenThisWeek(name);
      }
      render();
    });
  });
  // v48 · P5 (Sep 24 2026): the three range sliders became tap chips (see
  // renderChipRow) — the touched flag is still what makes a number a reading.
}

// Ship 6: settings handlers — toggles persist immediately; steppers clamp and
// re-render label; data buttons drive export/import/clear.
function attachSettingsHandlers(): void {
  // Toggles
  const wireToggle = (
    inputId: string,
    key: string,
    onChange?: (v: boolean) => void,
    defaultVal: boolean = true
  ): void => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    input.addEventListener('change', () => {
      const v = input.checked;
      setSetting<boolean>(key, v);
      const wrap = input.closest('.settings-toggle');
      if (wrap) {
        wrap.classList.toggle('on', v);
        wrap.classList.toggle('off', !v);
      }
      if (onChange) onChange(v);
      // Read back to confirm the value persisted; ignore if default.
      void defaultVal;
    });
  };
  wireToggle('setting-beeps', SETTING_KEYS.beeps);
  wireToggle('setting-howto', SETTING_KEYS.howToFirstExpand);
  // v48 · P4 (Sep 24 2026): the auto-suggest toggle is gone (DECISIONS §5) —
  // the hero is always today's rotation and B/C are one chip away; a switch
  // that turned off the one thing carrying the app, never used.

  // Rest stepper (step = 5s, range 5-180).
  const restVal = document.getElementById('rest-val');
  bindClick('rest-dec', () => {
    const next = Math.max(0, getRestSec() - 5);
    setSetting<number>(SETTING_KEYS.restSec, next);
    if (restVal) restVal.textContent = `${next}s`;
  });
  bindClick('rest-inc', () => {
    const next = Math.min(180, getRestSec() + 5);
    setSetting<number>(SETTING_KEYS.restSec, next);
    if (restVal) restVal.textContent = `${next}s`;
  });

  // Pre-countdown stepper (step = 1s, range 0-10).
  const preVal = document.getElementById('pre-val');
  bindClick('pre-dec', () => {
    const next = Math.max(0, getPreCountSec() - 1);
    setSetting<number>(SETTING_KEYS.preCount, next);
    if (preVal) preVal.textContent = `${next}s`;
  });
  bindClick('pre-inc', () => {
    const next = Math.min(10, getPreCountSec() + 1);
    setSetting<number>(SETTING_KEYS.preCount, next);
    if (preVal) preVal.textContent = `${next}s`;
  });

  // Data: Export
  bindClick('export-sessions', () => {
    exportSessionsToFile();
  });

  // Data: Import (file picker)
  bindClick('import-sessions-btn', () => {
    const input = document.getElementById('import-sessions-input') as HTMLInputElement | null;
    input?.click();
  });
  const importInput = document.getElementById('import-sessions-input') as HTMLInputElement | null;
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) importSessionsFromFile(file);
      importInput.value = ''; // allow re-import of same filename
    });
  }

  // v48 · P6: keep the Data fold's open state across its own re-render.
  const dataFold = document.querySelector<HTMLDetailsElement>('details.settings-data');
  dataFold?.addEventListener('toggle', () => {
    settingsDataOpen = dataFold.open;
  });

  // Data: Clear — hold-to-confirm via the same wireHoldToSkip helper.
  const clearBtn = document.getElementById('clear-local');
  if (clearBtn) {
    wireHoldToSkip(clearBtn, () => {
      clearLocalSessions();
    });
  }
}

// v50 · cycle: "Period started today" + its date-input alternative + undo —
// wired the same everywhere it appears (Progress card, Settings quiet row).
function attachCycleHandlers(): void {
  bindClick('cc-log-today', () => {
    logPeriodStart(localIsoDate(new Date()));
  });
  bindClick('cc-undo', () => {
    undoPeriodStart();
  });
  bindClick('settings-cycle-today', () => {
    logPeriodStart(localIsoDate(new Date()));
  });
  bindClick('settings-cycle-undo', () => {
    undoPeriodStart();
  });
  const dateInput = document.getElementById('cc-log-date') as HTMLInputElement | null;
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      const v = dateInput.value;
      if (v) logPeriodStart(v);
      dateInput.value = '';
    });
  }

  // v51 · cycle page: the two doors that open it (Progress's row, Home's
  // conditional row — spec §2.1, §3), its own back button (§2.2), and Card
  // C's metric chips (§2.3).
  bindClick('open-cycle', () => {
    cycleReturnTo = 'progress';
    progressScrollForCycle = window.scrollY;
    cycleCompareMetric = 'body';
    state.screen = 'cycle';
    render();
  });
  bindClick('home-open-cycle', () => {
    cycleReturnTo = 'home';
    cycleCompareMetric = 'body';
    state.screen = 'cycle';
    render();
  });
  bindClick('back-from-cycle', () => {
    if (cycleReturnTo === 'progress') {
      pendingScrollRestore = progressScrollForCycle;
      state.screen = 'progress';
    } else {
      state.screen = 'home';
    }
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-cycle-metric]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset['cycleMetric'] as CycleMetric | undefined;
      if (m) {
        cycleCompareMetric = m;
        render();
      }
    });
  });
}

// R1 (Sep 27 2026), PLAN-2026-09-26.md §4.3 — the ride-numbers screen's
// #ride-live-line, kept current per keystroke on ell-km/ell-kcal/ell-time
// (no re-render, same rule as every other reading there — see
// renderRideNumbersCard's own comment on why this reads through rideRate()).
function updateRideLiveLine(): void {
  const el = document.getElementById('ride-live-line');
  if (!el) return;
  const kcalRaw = (document.getElementById('ell-kcal') as HTMLInputElement | null)?.value ?? '';
  const timeRaw = (document.getElementById('ell-time') as HTMLInputElement | null)?.value ?? '';
  const kmRaw = (document.getElementById('ell-km') as HTMLInputElement | null)?.value ?? '';
  const rate = rideRate({
    kcal: parseKcalReading(kcalRaw),
    timeSec: timeRaw ? parseMmSs(timeRaw) : null,
    km: kmRaw ? parseKmReading(kmRaw) : null,
  });
  if (rate.kcalPerMin === null) {
    el.textContent = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = `= ${rate.kcalPerMin} kcal a minute${rate.kmh !== null ? ` · ${rate.kmh} km/h` : ''}`;
}

// v61 (Sep 28 2026), spec item g: "#ell-aim-compare"/"#ell-last-time", kept
// current per keystroke on ell-km — same "no re-render, keeps focus" rule as
// updateRideLiveLine above (its own fix pass found this gap: without it, the
// two lines stayed frozen at whatever they read when the screen first opened
// — blank, on a never-typed-yet km — and never caught up to what she typed).
// Level/minutes don't change per keystroke here (the level stepper and any
// other control on this screen already go through a full render()), so
// recomputing them fresh from the same sources renderRideNumbersCard itself
// reads can never disagree with what she saw when the screen opened.
function updateRideAimCompare(): void {
  const compareEl = document.getElementById('ell-aim-compare');
  const lastEl = document.getElementById('ell-last-time');
  if (!compareEl || !lastEl) return;
  const kmRaw = (document.getElementById('ell-km') as HTMLInputElement | null)?.value ?? '';
  const kmVal = kmRaw ? parseKmReading(kmRaw) : null;
  const level = ellipticalLevel();
  const last = lastEllipticalLevel();
  const aimLevel = level ?? last ?? ELLIPTICAL_START_LEVEL;
  const ex = getCurrentExercise();
  const aimMinutes = ellipticalMinutes() ?? Math.round((ex?.durationSec ?? 0) / 60);
  const rideHistory = ellipticalRideRecords(loadLogs());
  const rideAim = deriveRideAim(rideHistory, aimMinutes, aimLevel);
  const lastKm = lastTimeAtSameAim(rideHistory, aimMinutes, aimLevel);
  const aimLine =
    kmVal !== null && !('isFirst' in rideAim) ? `${kmVal} km · aim ${rideAim.km} km` : '';
  const lastLine =
    kmVal !== null && lastKm !== null ? `last time → today: ${lastKm} km → ${kmVal} km` : '';
  compareEl.textContent = aimLine;
  compareEl.hidden = aimLine === '';
  lastEl.textContent = lastLine;
  lastEl.hidden = lastLine === '';
}

document.addEventListener('DOMContentLoaded', () => {
  setWorkoutDProvider(getWorkoutD); // week-clock.ts: planForLog needs the fixed D workout
  setRenderer(render); // bus.ts: screens that leave this file ask for a redraw through requestRender()
  setScrollRestoreSink((y) => {
    pendingScrollRestore = y; // bus.ts: ...and for a scroll restore through requestScrollRestore()
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
