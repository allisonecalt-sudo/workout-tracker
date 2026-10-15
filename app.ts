// app.ts — workout-tracker
// Lead-dev pass 2026-05-15 consolidates: code-correctness fixes (timer rewrite,
// audio unlock, sync hygiene), UX restructure (Done·Next primary, Quit demoted,
// hold-to-skip rest, today's pick, week-dots, history-detail), and visual
// layer (still images + YouTube embeds + collapsible how-to).

import { setsPrescribed } from './hold-sets.js';
import { rideRate } from './ride.js';
import { renderRides, attachRidesHandlers, ridesVsDelta } from './screens/rides.js';
import { flattenSteps, nextUndoneStep, type WorkoutStep } from './step-list.js';
import { isMoveFeelValue, MOVE_FEEL_VALUES } from './move-feel.js';
import { isArmFeel, isArmLoad, heavierArmLoad } from './workout-feel.js';
import {
  formatTimerDisplay,
  renderStepNav,
  renderProgressLine,
  renderPauseButton,
  renderListButton,
  groupStretchPairs,
  type StretchGroup,
} from './workout-parts.js';
import { renderExerciseSetup } from './workout-cards.js';
import { deriveRideAim, lastTimeAtSameAim } from './ride-aim.js';
import {
  injectMarkerProgramWeek,
  replaceCalendarMarks,
  appendRounds,
  type WorkoutId,
  type AnyWorkoutId,
  type Exercise,
  type Workout,
  type Phase,
  type CalendarMarks,
} from './program.js';
import type { LogEntry } from './types.js';
import { ui } from './ui.js';
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
  laneDoneMinutes,
  ellipticalMinutes,
  ellipticalLevel,
  parseMmSs,
  parseKmReading,
  parseKcalReading,
  clampEllipticalLevel,
  ELLIPTICAL_MAX_LEVEL,
  ELLIPTICAL_START_LEVEL,
  lastEllipticalLevel,
} from './cardio-readings.js';
import {
  type AppScreen,
  type ArmFeelState,
  type MoveFeelState,
  type ArmLoad,
  type ArmLoadState,
  type ActiveSessionSnapshot,
  ACTIVE_SESSION_KEY,
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
  getRestSec,
  state,
  isValidLogEntry,
  loadLogs,
} from './state.js';
import { escapeHtml } from './format.js';
import { ellipticalRideRecords } from './cardio-notes.js';
import { renderActionBar } from './action-bar.js';
import { setRenderer, setScrollRestoreSink } from './bus.js';
import {
  stopTimer,
  startTimerCore,
  startRestTimer,
  skipRest,
  startPreCountdown,
  togglePause,
  installTimerVisibilityHandler,
} from './timer.js';
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
  clearWorkoutWalk,
  resumeWalkTracking,
  startWorkoutWalk,
  walkStepMinutes,
  fetchStepsToday,
} from './walk.js';
import { unlockAudio, stopVoiceNote } from './audio.js';
import { bindClick, wireHoldToSkip, HOLD_TO_SKIP_MS } from './dom.js';
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
  effectiveRounds,
  toStepWorkout,
  skippedStepsCount,
  displayName,
  lastCardioLane,
  tonightNames,
  rawCurrentExercise,
  getCurrentExercise,
  isIndoorLane,
  currentStepKey,
  canGoBack,
  isHoldStep,
  holdStepKey,
} from './workout-now.js';
import {
  renderWorkout,
  renderStepListSheet,
  renderTimerPip,
  attachWorkoutStepListHandlers,
  attachWorkoutFeelHandlers,
  attachWorkoutFeelHandlers2,
  attachWorkoutCardHandlers,
  setWorkoutSubviews,
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

// ---------- Cardio either/or (Allison Sep 7 2026) ----------
// WHAT: the cardio step that opens A/B (10 min) and C (25 min) is now a CHOICE —
// walk outside (the tracked flow, entirely unchanged: the walk minutes) OR the
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
function chooseApartmentCardio(minutes: number): void {
  clearElliptical(); // one lane at a time
  localStorage.setItem(WW_APARTMENT_KEY, String(minutes));
}

function clearApartmentCardio(): void {
  clearLaneProgress();
  localStorage.removeItem(WW_APARTMENT_KEY);
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

function captureLaneMinutesIfLeaving(): void {
  const ex = getCurrentExercise();
  if (!ex || !isIndoorLane(ex.name) || !ex.durationSec) return;
  if (localStorage.getItem(WW_LANE_STARTED_KEY) === null) return;
  // v48 · P3 (Sep 24 2026): a ride she STOPPED already holds its real minutes —
  // with the timer idle, the "0 left" arithmetic below would overwrite them
  // with the full block. Only a live timer (or nothing stored yet) is measured.
  const t = ui.activeTimer;
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
  const t = ui.activeTimer;
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
  ui.stepListOpen = false;
  render();
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
  const idx = ui.holdRedoInProgress ? next.length - 1 : next.length;
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
  const t = ui.activeTimer;
  if (t && t.kind === 'timed-exercise' && ex.durationSec) {
    const remainSec = Math.max(0, (t.endsAt - Date.now()) / 1000);
    const heldSec = Math.max(0, Math.round(ex.durationSec - remainSec));
    if (setsPrescribed(ex.reps) > 1) recordHeldSet(holdStepKey(), heldSec);
    else recordHeld(holdStepKey(), heldSec);
  }
  if (ex.name === 'Wall sit') captureWallSitIfPending(); // the saved number
  ui.holdRedoInProgress = false;
  stopTimer();
  render();
}

// v60 (Sep 28 2026): "Start set N" (#hold-set-next) — a fresh next set, same
// countdown+timer machinery as the very first "Start timer" tap. Kept as its
// own function (rather than reusing #start-timed's id) so a multi-set hold's
// "Set N of M" ready face never collides with the untouched single-set Ready
// face above it in renderHoldTimerCard.
function startNextHoldSet(): void {
  ui.holdRedoInProgress = false;
  startTimedExercise();
}

// v60 (Sep 28 2026): "Redo set N" (#hold-redo) on a multi-set hold — redoes
// the LAST completed set (recordHeldSet replaces it via max, never erases a
// real hold). #redo-timed (single-set) stays exactly as it was, calling
// startTimedExercise() straight — unaffected by this flag.
function redoLastHoldSet(): void {
  ui.holdRedoInProgress = true;
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
      ui.holdRedoInProgress = false;
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

  attachWorkoutStepListHandlers();

  attachPostLogHandlers();
  attachPreLogHandlers();

  attachWorkoutFeelHandlers();
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
  attachWorkoutFeelHandlers2();
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

  attachWorkoutCardHandlers();
  // v48 · P5 (Sep 24 2026): the three range sliders became tap chips (see
  // renderChipRow) — the touched flag is still what makes a number a reading.
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
  // screens/workout.ts: the sub-views and the jump that still live here (17b lanes / 17c overlays + state machine)
  setWorkoutSubviews({
    renderRoundBreak,
    renderRestScreen,
    renderCooldownList,
    renderEllipticalStep,
    renderLaneTimerCard,
    renderApartmentRoutine,
    jumpToStep,
  });
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
