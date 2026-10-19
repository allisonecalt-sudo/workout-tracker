// screens/workout.ts - the workout screen: the exercise step (code-shape step 17a), the ride
// lanes (step 17b) and the state machine + overlays' bindings (step 17c), Oct 15-16 2026. Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT (17a): renderWorkout (the render entry for state.screen === 'workout' - it picks the
// sub-view), the exercise step itself (name + reps + feel chips + safety + Tips + setup card +
// picture + how-to / detail card + Done / Back), the hold timer card (single-set and the
// wall-lean N-set counter), the tempo bar, the step list sheet ("List": rows, open / close /
// jump), the running-timer pip, the voice-note button, and four handler groups:
// attachWorkoutStepListHandlers (List + pip + jump rows), attachWorkoutFeelHandlers /
// attachWorkoutFeelHandlers2 (Easy/Right/Hard + load chip + "Set N done"; the ride's own
// always-on feel binding, attachWorkoutRideFeelHandlers, runs BETWEEN them) and attachWorkoutCardHandlers
// (video / section / how-to / voice-note taps, bound document-wide - the cool-down rows' setup
// block uses the same data attributes).
//
// ONE SCREEN, SUB-VIEWS: the workout is one screen with sub-views (exercise step, ride lanes,
// rest, round break, cool-down, paused). Screens may not import each other, so the sub-views
// are not separate screens. The rule from here: pure render-string helpers shared by two or
// more sub-views are shared-layer modules named workout-*.ts (workout-now.ts: lookups;
// workout-parts.ts: step nav / progress line / header buttons; workout-feel.ts: feel chips;
// workout-cards.ts: picture / setup / detail / how-to cards); everything that binds, saves or
// moves the state machine lives in THIS file. 17b brought the ride lanes' renderers and handlers
// here; workout-lanes.ts is the shared lane-choice STATE (localStorage) that these handlers and the
// state machine both call. 17c (done) brought in the state machine (advanceExercise, goBack,
// jumpToStep, begin / next / step-back, the hold start / stop logic, round two / finish here, quit
// and "Log what I did") and the bindings of rest / round break / cool-down / paused; their strings
// are in the shared workout-breaks.ts. app.ts is now the shell: render()'s switch,
// attachHandlers() calling every screen's attach* in the original order, boot, and the test hooks.
//
// What the state machine calls back for and cannot import (the session reset, which lives in session-resume.ts,
// and the pre-log and post-log clock ticks, which belong to other screens) comes in ONCE at boot through
// setWorkoutHooks(), like actions.ts' setActionHooks(). timer.ts / actions.ts / walk.ts need no
// callback into the machine: they take the caller's closure (startTimerCore's onComplete,
// startPreCountdown's then) and only set state + requestRender().
//
// ui: stepListOpen is written by session-resume.ts (applyActiveSnapshot, resetState) and here (jumpToStep), and read by
// render(); timerPipOpen is written by timer.ts (the timer's end) - both stay on `ui`. 17c made
// holdRedoInProgress module-local (below the state machine's header): no other file touched it.

import {
  state,
  loadLogs,
  WW_LANE_STARTED_KEY,
  WW_ELLIPTICAL_LEVEL_KEY,
  WW_ELLIPTICAL_KM_KEY,
  WW_ELLIPTICAL_PULSE_KEY,
  WW_ELLIPTICAL_TIME_KEY,
  WW_ELLIPTICAL_KCAL_KEY,
} from '../state.js';
import { ui } from '../ui.js';
import { requestRender } from '../bus.js';
import { bindClick, showToast, wireHoldToSkip } from '../dom.js';
import { escapeHtml } from '../format.js';
import { renderActionBar } from '../action-bar.js';
import { flattenSteps, nextUndoneStep, type WorkoutStep } from '../step-list.js';
import { setsPrescribed, holdSetsFace, formatHeldSeconds } from '../hold-sets.js';
import { honestWallSitLogs } from '../viz.js';
import { isMoveFeelValue, MOVE_FEEL_VALUES, slugFor } from '../move-feel.js';
import { EXERCISE_DETAIL } from '../exercise-detail.js';
import { rideRate } from '../ride.js';
import { deriveRideAim, lastTimeAtSameAim } from '../ride-aim.js';
import { ellipticalRideRecords } from '../cardio-notes.js';
import {
  laneDoneMinutes,
  ellipticalMinutes,
  ellipticalLevel,
  parseMmSs,
  rideTimeNote,
  rideFitHint,
  parseKmReading,
  parseKcalReading,
  clampEllipticalLevel,
  ELLIPTICAL_MAX_LEVEL,
  ELLIPTICAL_START_LEVEL,
  lastEllipticalLevel,
} from '../cardio-readings.js';
import {
  chooseApartmentCardio,
  clearApartmentCardio,
  chooseElliptical,
  clearElliptical,
  captureLaneMinutesIfLeaving,
  markLaneStarted,
  markHoldStarted,
  clearHoldStart,
  heldSecAfterReload,
  laneMinutesNow,
} from '../workout-lanes.js';
import { SAFETY_LINE, type Exercise, type Workout, type Phase } from '../program.js';
import { saveActiveSession } from '../actions.js';
import {
  togglePause,
  stopTimer,
  startTimerCore,
  startRestTimer,
  skipRest,
  startPreCountdown,
} from '../timer.js';
import { toggleVoiceNote as toggleVoiceNoteAudio, unlockAudio } from '../audio.js';
import {
  workoutWalkStart,
  startWorkoutWalk,
  updateWalkLine,
  walkStepMinutes,
  clearWorkoutWalk,
  walkLiveText,
  APARTMENT_CARDIO_NAME,
} from '../walk.js';
import {
  ELLIPTICAL_NAME,
  ARM_FEEL_STEPS,
  getCurrentWorkout,
  getCurrentExercise,
  lastCardioLane,
  rawCurrentExercise,
  effectiveRounds,
  toStepWorkout,
  displayName,
  tonightKind,
  isIndoorLane,
  isHoldStep,
  isLaterRound,
  holdStepKey,
  heldOnThisStep,
  canGoBack,
  currentStepKey,
} from '../workout-now.js';
import {
  isArmFeel,
  isArmLoad,
  heavierArmLoad,
  defaultArmLoad,
  markPaceRuleSeen,
  renderArmFeel,
  renderMoveFeel,
  renderThisHurts,
} from '../workout-feel.js';
import {
  formatTimerDisplay,
  renderStepNav,
  renderProgressLine,
  renderPauseButton,
  renderListButton,
} from '../workout-parts.js';
import {
  renderExerciseSetup,
  renderExerciseVisual,
  renderDetailCard,
  renderHowToCard,
  renderTipsExpander,
  markHowToSeenThisWeek,
} from '../workout-cards.js';
import { renderRestScreen, renderRoundBreak, renderCooldownList } from '../workout-breaks.js';

// What the state machine needs from the rest of the app and cannot import (a screen never imports
// app.ts or another screen): the session reset (the code is session-resume.ts's resetState; app.ts
// passes it through), and the two clock ticks the pre-log and post-log screens own. app.ts hands them over ONCE at boot (setWorkoutHooks), like setActionHooks; the
// private forwarding functions below carry the moved code's own names, so its calls are unchanged.
export type WorkoutHooks = {
  resetState: () => void;
  beginPostLogClockTick: () => void;
  endPreLogClockTick: () => void;
};

let hooks: WorkoutHooks | null = null;

export function setWorkoutHooks(h: WorkoutHooks): void {
  hooks = h;
}

function hook(): WorkoutHooks {
  if (!hooks) throw new Error('screens/workout.ts: setWorkoutHooks() was never called');
  return hooks;
}

function resetState(): void {
  hook().resetState();
}
function beginPostLogClockTick(): void {
  hook().beginPostLogClockTick();
}
function endPreLogClockTick(): void {
  hook().endPreLogClockTick();
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
export function renderStepListSheet(w: Workout): string {
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
  if (!ui.activeTimer || ui.activeTimer.kind !== 'timed-exercise' || state.timerSeconds <= 0)
    return null;
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
export function renderTimerPip(): string {
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
  if (!ui.timerPipOpen) return pip;
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

function setVoiceBtnPlaying(btn: HTMLElement, playing: boolean): void {
  btn.classList.toggle('voice-note-playing', playing);
  const icon = btn.querySelector('.voice-note-icon');
  const label = btn.querySelector('.voice-note-label');
  if (icon) icon.textContent = playing ? '⏸' : '▶';
  if (label) label.textContent = playing ? 'Playing… (tap to stop)' : 'Listen — how to do it';
}

// The voice-note player lives in audio.ts (step 11b); these two are the page's side of
// it: the button's look, and counting a play on the session.
function toggleVoiceNote(btn: HTMLButtonElement, src: string): void {
  toggleVoiceNoteAudio(src, {
    setPlaying: (playing) => setVoiceBtnPlaying(btn, playing),
    onFirstPlay: () => {
      state.voicePlays += 1;
      saveActiveSession();
    },
  });
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
    // v62.4 S1: after a reload the hold she was in is remembered - say what is already held
    // instead of "Ready" (Start continues from it).
    const reloadHeld =
      ex.name === 'Wall sit' && ex.durationSec
        ? heldSecAfterReload(holdStepKey(), ex.durationSec)
        : null;
    inner = `
      <div class="timer-label">${reloadHeld ? `${reloadHeld} s held` : 'Ready'}</div>
      <div class="timer-display timer-idle">${formatTimerDisplay(ex.durationSec ?? 0)}</div>
      <button class="btn-large btn-primary" id="start-timed" type="button">Start timer</button>`;
  }
  return `
    <div class="card timer-card">
      ${inner}
      ${showTempo ? renderTempoBar() : ''}
    </div>`;
}

export function renderWorkout(): string {
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
  // v63 item 2 (Oct 19 2026): the walk lane shows the same quiet "How was this one?" row as every other
  // move page, from the moment the page opens (v59's wait-for-elapsed-minutes gate went with v58's
  // stepped-only rule: the row is optional and never blocks Done).
  if (ex.name === 'Outdoor walk') {
    const feelHtml = renderMoveFeel(ex);
    return `
      ${header}
      <div class="card">
        <div class="exercise-display">
          <div class="exercise-name-row"><div class="exercise-name">${displayName(ex)}</div></div>
          <div class="exercise-reps">${walkStepMinutes(ex)} min</div>
          <p class="walk-live-line">🚶 <span id="walk-live">${walkLiveText(workoutWalkStart())}</span></p>
          <p class="gear-note">It saves with this workout. Tap Done · Next when you're back.</p>
          ${feelHtml}
          ${renderThisHurts()}
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
        ${renderMoveFeel(ex)}
        ${renderThisHurts()}
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

export function attachWorkoutStepListHandlers(): void {
  // v50 · jump list (Sep 25 2026): open/close the sheet, tap outside to
  // dismiss (same convention as the quit-confirm panel), tap a row to jump.
  bindClick('step-list-open', () => {
    ui.stepListOpen = true;
    requestRender();
  });
  bindClick('step-list-close', () => {
    ui.stepListOpen = false;
    requestRender();
  });
  const stepListPanel = document.getElementById('step-list-panel');
  stepListPanel?.addEventListener('click', (e) => {
    if (e.target === stepListPanel) {
      ui.stepListOpen = false;
      requestRender();
    }
  });

  // v53 (Sep 26 2026): the running-timer pip. Tap opens the Pause/Stop sheet;
  // Pause reuses togglePause() (the same "Paused" overlay + frozen clock the
  // header's Pause button gives — one pause mechanism, not two); Stop keeps
  // #stop-lane/#stop-timed exactly as before (bound below, unchanged).
  bindClick('timer-pip', () => {
    ui.timerPipOpen = true;
    requestRender();
  });
  bindClick('timer-pip-close', () => {
    ui.timerPipOpen = false;
    requestRender();
  });
  bindClick('timer-pip-pause', () => {
    ui.timerPipOpen = false;
    togglePause();
  });
  const timerPipSheet = document.getElementById('timer-pip-sheet');
  timerPipSheet?.addEventListener('click', (e) => {
    if (e.target === timerPipSheet) {
      ui.timerPipOpen = false;
      requestRender();
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-jump-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset['jumpKey'];
      if (key) jumpToStep(key);
    });
  });
}

// v63 item 3 (Oct 19 2026): "This hurts". The move is skipped, not done: it is marked in hurtSteps (so Done
// does not bring her back to it) and recorded as `slug=hurt` in move_feel; it counts in steps_skipped like
// any move she did not finish. Her pain rule is unchanged: nothing here tells her to stop or to push on.
function thisHurts(): void {
  const ex = getCurrentExercise();
  if (!ex || state.screen !== 'workout') return;
  const slug = slugFor(ex.name);
  state.moveFeel = { ...state.moveFeel, [slug]: 'hurt' };
  if (slug === 'ride') state.rideFeel = null; // the ride's own feel: the hurt is what she just said
  showToast('Got it, skipped.');
  advanceExercise({ hurtSlug: slug });
}

export function attachWorkoutFeelHandlers(): void {
  bindClick('this-hurts', thisHurts);
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
      requestRender();
    });
  });
  // v58 (Sep 28 2026) — the generalized Easy/Right/Hard: same tap-selects/tap-clears rule as arm
  // feel, keyed by slug instead of a fixed curl/row pair. v63 item 2: it is on EVERY move page and
  // every cool-down row now, so the chips are updated in place (no redraw: eleven stretch rows
  // must not jump under her thumb), and the LAST tap on a move wins, whichever round it is.
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
      const picked = next[slug];
      btn
        .closest('.move-feel')
        ?.querySelectorAll<HTMLButtonElement>('[data-move-feel]')
        .forEach((chip) => {
          const on = chip.dataset['moveFeel'] === picked;
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          chip.classList.toggle('arm-chip-on', on);
        });
    });
  });
}

export function attachWorkoutFeelHandlers2(): void {
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
      requestRender();
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
      requestRender();
    });
  });
}

export function attachWorkoutCardHandlers(): void {
  // Video expanders (group 3N)
  document.querySelectorAll<HTMLButtonElement>('[data-expand-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset['expandVideo'];
      if (!name) return;
      state.videoExpandedFor = state.videoExpandedFor === name ? null : name;
      requestRender();
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
      requestRender();
    });
  });

  // Voice-note play buttons. Re-sync visual state after a re-render if this
  // note is still playing (the Audio object survives the DOM rebuild).
  document.querySelectorAll<HTMLButtonElement>('.voice-note-btn').forEach((btn) => {
    const src = btn.dataset['voiceSrc'];
    btn.addEventListener('click', () => {
      if (src) toggleVoiceNote(btn, src);
    });
    if (ui.voiceAudio && ui.voiceAudioSrc === src && !ui.voiceAudio.paused) {
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
      requestRender();
    });
  });
}

// ---------- ride lanes (step 17b, moved verbatim from app.ts) ----------

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

// v48 · P3: the quiet Stop on a running ride (elliptical / apartment) — the
// minutes she actually did are kept, and the after-ride face shows them.
function stopLaneTimer(): void {
  captureLaneMinutesIfLeaving();
  stopTimer();
  requestRender();
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
  const fitHint = rideFitHint(
    time ? parseMmSs(time) : null,
    km ? parseKmReading(km) : null,
    parseKcalReading(kcal)
  );
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
      <p class="ell-time-readback" id="ell-time-readback"${time && rideTimeNote(time) ? '' : ' hidden'}>${escapeHtml(rideTimeNote(time))}</p>
      ${fitHint ? `<p class="ell-fit-hint" id="ell-fit-hint">${escapeHtml(fitHint)}</p>` : ''}
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
    // v62.3 F9: with no stored minutes (the app reloaded mid-block) it shows what the
    // timer would show - never the whole block - or says it does not know.
    const mins = laneDoneMinutes() ?? laneMinutesNow(ex.durationSec ?? 0);
    inner = `
      <div class="timer-label">Done</div>
      <div class="timer-done timer-held">${mins !== null ? `✓ ${mins} min done` : '✓ done · time not known'}</div>`;
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
        ${renderThisHurts()}
      </div>
    </div>
    ${guide}
    ${renderStepNav('Done · Next')}
  `;
}

export function attachWorkoutRideFeelHandlers(): void {
  // v61 (Sep 28 2026), spec item f: the ride's own always-on Easy/Right/Hard
  // — one value per session (there's only ever one ride/D step), tap-selects
  // /tap-clears same as every other feel chip in this app.
  document.querySelectorAll<HTMLButtonElement>('[data-ride-feel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const feel = btn.dataset['rideFeel'];
      if (!isMoveFeelValue(feel)) return;
      state.rideFeel = state.rideFeel === feel ? null : feel;
      saveActiveSession();
      requestRender();
    });
  });
}

export function attachWorkoutLaneHandlers(): void {
  // Explicit Start for the in-workout walk — nothing tracks until she taps it
  // (Allison Jul 9 2026: being on the page ≠ walking started).
  bindClick('ww-start', () => {
    startWorkoutWalk();
    requestRender();
    updateWalkLine();
  });

  // Cardio either/or (Allison Sep 7 2026): "i want cardio i can do in apt or
  // walk like pick either or". Same minutes, indoors, on a plain timer.
  bindClick('ww-apartment', () => {
    const raw = rawCurrentExercise();
    if (!raw) return;
    chooseApartmentCardio(walkStepMinutes(raw));
    requestRender();
  });

  // Elliptical lane (Allison Sep 24 2026): "So no more walk it could be walk
  // or elliptical". Same minutes on a timer, plus the level she rode at.
  bindClick('ww-elliptical', () => {
    const raw = rawCurrentExercise();
    if (!raw) return;
    chooseElliptical(walkStepMinutes(raw));
    requestRender();
  });
  bindClick('ell-level-down', () => {
    stepEllipticalLevel(-1);
    requestRender();
  });
  bindClick('ell-level-up', () => {
    stepEllipticalLevel(1);
    requestRender();
  });
  // v48 · P3: "7 again" — the same level as last time, one tap.
  bindClick('ell-level-same', () => {
    const last = lastEllipticalLevel();
    if (last !== null) setEllipticalLevel(last);
    requestRender();
  });
  // Console readings (v44): saved per keystroke, no re-render (keeps focus).
  const ellKm = document.getElementById('ell-km') as HTMLInputElement | null;
  ellKm?.addEventListener('input', () => {
    setEllipticalReading(WW_ELLIPTICAL_KM_KEY, ellKm.value);
    updateRideLiveLine();
    updateRideFitHint();
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
    updateRideFitHint();
  });
  const ellTime = document.getElementById('ell-time') as HTMLInputElement | null;
  ellTime?.addEventListener('input', () => {
    setEllipticalReading(WW_ELLIPTICAL_TIME_KEY, ellTime.value);
    const readback = document.getElementById('ell-time-readback');
    if (readback) {
      readback.textContent = rideTimeNote(ellTime.value);
      readback.hidden = readback.textContent === '';
    }
    updateRideLiveLine();
    updateRideFitHint();
  });

  // v51 (Sep 25 2026): the ride-numbers screen's local Back — closes the
  // screen and returns to whichever ride face she left (values kept, nothing
  // cleared). Never the global step-back, which would leave the elliptical
  // step entirely.
  bindClick('ride-numbers-back', () => {
    state.rideNumbersOpen = false;
    requestRender();
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
    requestRender();
  });
}

export function attachWorkoutLaneStopHandler(): void {
  // v48 · P3: the ride's quiet Stop keeps the minutes she actually did.
  bindClick('stop-lane', () => {
    stopLaneTimer();
  });
}

export function attachWorkoutLaneSkipHandler(): void {
  // v48 · P3: "Skip cardio today" — on to the next step, no lane (cardio_lane
  // stays null). The old sage Done · Next skipped cardio without saying so.
  bindClick('ww-skip', () => {
    advanceExercise();
  });
}

// R1 (Sep 27 2026), PLAN-2026-09-26.md §4.3 — the ride-numbers screen's
// #ride-live-line, kept current per keystroke on ell-km/ell-kcal/ell-time
// (no re-render, same rule as every other reading there — see
// renderRideNumbersCard's own comment on why this reads through rideRate()).
// v62.4 G1: the "can't all be true" line under the boxes, kept current per keystroke. Made when
// there is something to say, removed when the numbers fit (so a fitting ride renders as before).
function updateRideFitHint(): void {
  const val = (id: string): string =>
    (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
  const timeRaw = val('ell-time');
  const kmRaw = val('ell-km');
  const hint = rideFitHint(
    timeRaw ? parseMmSs(timeRaw) : null,
    kmRaw ? parseKmReading(kmRaw) : null,
    parseKcalReading(val('ell-kcal'))
  );
  let el = document.getElementById('ell-fit-hint');
  if (!hint) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.id = 'ell-fit-hint';
    el.className = 'ell-fit-hint';
    document.getElementById('ell-time-readback')?.after(el);
  }
  el.textContent = hint;
}

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

// ---------- binding groups (17c): each sits where its bindings sat in attachHandlers() ----------

// begin (the pre-log's Start), next, step-back: bound after the shared [data-detail] click.
export function attachWorkoutNavHandlers(): void {
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
}

export function attachWorkoutCooldownHandlers(): void {
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
}

// Pause / resume, Quit, hold-to-skip rest, and the hold's Start / Stop.
export function attachWorkoutControlHandlers(): void {
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
}

// Redo, the multi-set hold's two buttons, and the round-1 floor.
export function attachWorkoutHoldHandlers(): void {
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
}

// ---------- the workout state machine (17c): moved verbatim from app.ts ----------

// v60 (Sep 28 2026): whether the timed hold about to run/running is a REDO of the last
// completed SET, not a fresh next one - transient UI, not session progress, not persisted.
// Only read by recordHeldSet, and only matters for a multi-set hold (hold-sets.ts
// setsPrescribed > 1); a single-set hold's Redo still goes through the untouched
// recordHeld/heldSecFor path. Module-local since 17c (was `ui.holdRedoInProgress`; grep proof:
// no other file read or wrote it).
let holdRedoInProgress = false;

// v51 (Sep 25 2026) — her words: "I click the next button and then I fill in
// information. That's how simple it is." Done · Next on the elliptical step
// used to advance straight past the after-ride readings card, which only
// showed once she'd already stopped/finished — she tapped Done · Next mid- or
// post-ride and never saw it ("it didn't show up for me... I don't know what
// I was supposed to see or where"). Now the tap opens this screen instead, in
// ANY ride state: a live timer is stopped and its real minutes kept first,
// same as the quiet Stop (stopLaneTimer, in screens/workout.ts) — nothing is lost either way.
function openRideNumbers(): void {
  captureLaneMinutesIfLeaving();
  stopTimer();
  state.rideNumbersOpen = true;
  requestRender();
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
  state.hurtSteps = {}; // v63 item 3: same
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
  clearHoldStart(); // fresh session: no hold carried over
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
  requestRender();
}

// T1 (Sep 27 2026), §3.2: the one place post-log's own fields get reset —
// every path that ends a session (cool-down's Done · Finish, the quit
// panel's "Log what I did") runs this instead of setting state.screen by
// hand, so the finish-time question and the breaks chip always start fresh.
// No requestRender()/tick here: advanceExercise's own final branch shares ONE
// requestRender() call across several outcomes, so it calls this then falls through
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
  requestRender();
  beginPostLogClockTick();
}

function markStepDone(key: string): void {
  // v63 item 3: doing a move she once skipped as hurt (back to it, Done) takes the hurt mark off, and the
  // move_feel `slug=hurt` with it when no other round of that move is still hurt.
  const hurtSlug = state.hurtSteps[key];
  if (hurtSlug !== undefined) {
    const rest = { ...state.hurtSteps };
    delete rest[key];
    state.hurtSteps = rest;
    if (state.moveFeel[hurtSlug] === 'hurt' && !Object.values(rest).includes(hurtSlug)) {
      const feels = { ...state.moveFeel };
      delete feels[hurtSlug];
      state.moveFeel = feels;
    }
  }
  if (state.completedSteps[key]) return; // no-op re-render churn on a repeat
  state.completedSteps = { ...state.completedSteps, [key]: true };
}

// v63 item 3: the step she skipped with "This hurts": not done, but handled.
function markStepHurt(key: string, slug: string): void {
  if (state.completedSteps[key]) {
    const done = { ...state.completedSteps };
    delete done[key];
    state.completedSteps = done;
  }
  state.hurtSteps = { ...state.hurtSteps, [key]: slug };
}

// Done-or-hurt: the steps Done must not walk back to (a move she only JUMPED past still is walked back to).
function handledSteps(): Record<string, boolean> {
  const handled: Record<string, boolean> = { ...state.completedSteps };
  for (const key of Object.keys(state.hurtSteps)) handled[key] = true;
  return handled;
}

function applyStepTarget(step: WorkoutStep): void {
  state.currentPhase = step.phase;
  state.currentRound = step.round;
  state.currentExerciseIndex = step.index;
}

function advanceExercise(opts: { hurtSlug?: string } = {}): void {
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
  if (opts.hurtSlug !== undefined) markStepHurt(curKey, opts.hurtSlug);
  else markStepDone(curKey);
  const handled = handledSteps();
  const movable = flattenSteps(toStepWorkout(w), effectiveRounds(w));
  const curPos = movable.findIndex((s) => s.key === curKey);
  const structuralNextKey = curPos >= 0 ? (movable[curPos + 1]?.key ?? null) : null;
  // v50 · fix (Sep 25 2026): compute target BEFORE deciding the round-1 floor.
  // Her bug — finish the last skipped move and Done marches her forward
  // through every move she already did (the Round 1 done screen even came
  // back) — was this floor firing unconditionally on the last main move of
  // round 1, with no check for whether round 2+ actually still has anything
  // undone.
  const target = nextUndoneStep(movable, curKey, handled);
  // v50 · fix 2 (Sep 25 2026): `target !== null` was "anything undone
  // ANYWHERE" (nextUndoneStep wraps the whole list, warm-up included), not
  // "round 2+ still has something undone". Her repro: jump to round 2 first,
  // finish round 2 + upper back, then skip Cardio (warm-up) via the List
  // sheet and walk round 1 last — round 1's last move still found Cardio
  // undone and threw up "Round 1 done ✓ / Start round 2" even though round 2
  // was already done, then landed the tap on an already-✓ move. The floor is
  // about round 2+, so gate it on round 2+ specifically.
  const roundTwoOpen = movable.some((s) => s.phase === 'main' && s.round > 1 && !handled[s.key]);
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
        requestRender();
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
      requestRender();
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
        requestRender();
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
  requestRender();
  // T1 (Sep 27 2026): this requestRender() is shared across several outcomes above —
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
    requestRender();
    return;
  }
  // v48: Back from the "Round 1 done ✓" screen = round 1's last move, which is
  // where the state already points (the break sits on top of it).
  if (state.roundBreak) {
    state.roundBreak = false;
    requestRender();
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
  requestRender();
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
  // v62.3 fix round 1 (item 4): jumping away from a running apartment block keeps the minutes
  // she rode, the same way Done · Next does (captureLaneMinutesIfLeaving: elapsed, floor 1,
  // cap at the block) - read BEFORE stopTimer() clears the clock.
  captureLaneMinutesIfLeaving();
  stopTimer();
  state.wallSitStartedAt = null;
  clearHoldStart(); // a jump forgets a running hold, as it always did
  state.videoExpandedFor = null;
  state.isResting = false;
  state.roundBreak = false;
  state.rideNumbersOpen = false; // v51: leaving the elliptical step by any route closes it
  state.currentPhase = parsed.phase;
  state.currentRound = parsed.round;
  state.currentExerciseIndex = parsed.index;
  ui.stepListOpen = false;
  requestRender();
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
  const t = ui.activeTimer;
  if (t && t.kind === 'timed-exercise' && ex.durationSec) {
    const remainSec = Math.max(0, (t.endsAt - Date.now()) / 1000);
    const heldSec = Math.max(0, Math.round(ex.durationSec - remainSec));
    if (setsPrescribed(ex.reps) > 1) recordHeldSet(holdStepKey(), heldSec);
    else recordHeld(holdStepKey(), heldSec);
  }
  if (ex.name === 'Wall sit') captureWallSitIfPending(); // the saved number
  holdRedoInProgress = false;
  stopTimer();
  requestRender();
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
  requestRender();
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
    clearHoldStart();
    return;
  }
  // v62.3 fix round 1 (item 5): no live start but a stored one for THIS step = the app reloaded
  // mid-hold (the start is only forgotten on a reload; every other exit clears the record). The hold
  // is what the timer would have shown with no reload, capped at the hold.
  const ex = getCurrentExercise();
  if (ex && ex.name === 'Wall sit' && ex.durationSec) {
    const held = heldSecAfterReload(holdStepKey(), ex.durationSec);
    if (held !== null) state.wallSitSec = Math.max(state.wallSitSec, held);
    clearHoldStart();
  }
}

function startTimedExercise(): void {
  const ex = getCurrentExercise();
  if (!ex || !ex.durationSec) return;
  const duration = ex.durationSec;
  const exerciseName = ex.name;
  unlockAudio(); // Group 1C: synchronous resume in user-gesture handler
  // v62.4 S1: a wall sit started again after a RELOAD continues from the seconds already held (the
  // same as pause -> resume with no reload: 20 held, reload, start, 10 more -> 30), capped at the
  // hold. A hold that already ran its whole length is banked and a fresh one starts. A normal
  // start has no stored hold for this step: prior stays 0 and nothing below changes.
  let prior = 0;
  if (exerciseName === 'Wall sit' && state.wallSitStartedAt === null) {
    const already = heldSecAfterReload(holdStepKey(), duration);
    if (already !== null && already > 0) {
      state.wallSitSec = Math.max(state.wallSitSec, already);
      prior = already < duration ? already : 0;
      // a hold that already ran its whole length: the done face must say what the save says
      if (already >= duration) recordHeld(holdStepKey(), already);
    }
  }
  const go = (): void => {
    // v45: the hold clock starts on GO, not on the tap. It used to start
    // before the 3-2-1, so every completed wall sit logged target + 3 s
    // (10 of 10 timed holds, May 19 → Sep 14).
    if (exerciseName === 'Wall sit') {
      state.wallSitStartedAt = Date.now() - prior * 1000;
      markHoldStarted(holdStepKey(), prior); // v62.3 fix round 1 (item 5): survives a reload
    }
    if (isIndoorLane(exerciseName)) {
      markLaneStarted(); // v62.3 F9: start time + the paused total at that instant
      // v48 · P3: the setup expander never reopens after the ride — forget any
      // before-ride open/close so the after-ride face starts it closed.
      delete state.openSections[`${ELLIPTICAL_NAME}::setup`];
    }
    const stepKey = holdStepKey(); // v48: the done-face belongs to this step
    startTimerCore('timed-exercise', duration - prior, () => {
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
        clearHoldStart();
        state.wallSitSec = Math.max(state.wallSitSec, duration);
      }
      requestRender();
    });
  };
  // v48 · P3 (Sep 24 2026) — decision Q8: no 3-2-1 before a 10-25 minute ride
  // ("the page jumps", walk §2). Holds keep it: it's what stops the +3 s wall
  // sit coming back (v45).
  if (isIndoorLane(exerciseName)) go();
  else startPreCountdown(go);
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
    requestRender();
  });
  panel.addEventListener('click', (e) => {
    if (e.target === panel) dismiss();
  });
}
