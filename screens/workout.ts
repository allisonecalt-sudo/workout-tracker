// screens/workout.ts - the workout screen: the exercise step (code-shape step 17a) and the ride
// lanes (step 17b), Oct 15 2026. Moved verbatim out of app.ts; no behaviour change, no version bump.
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
// moves the state machine stays in THIS file (or app.ts until its run). 17b (done, below the
// exercise step) brought the ride lanes' renderers and handlers here; workout-lanes.ts is the shared
// lane-choice STATE (localStorage) that app.ts and these handlers both call; 17c adds
// rest / round break / cool-down / paused (strings -> a shared workout-breaks.ts) and the state
// machine here. Until then app.ts registers the sub-views this file still has to call through
// setWorkoutSubviews() (below) - each forwarding stub is deleted when its sub-view arrives.
//
// ui: nothing here is module-local. stepListOpen is written by app.ts (jumpToStep, resume,
// resetState) and read by render(); timerPipOpen is written by timer.ts (the timer's end) -
// both stay on `ui` (grep proof in the step 17a hand-off).

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
import { bindClick } from '../dom.js';
import { escapeHtml } from '../format.js';
import { renderActionBar } from '../action-bar.js';
import { flattenSteps } from '../step-list.js';
import { setsPrescribed, holdSetsFace, formatHeldSeconds } from '../hold-sets.js';
import { honestWallSitLogs } from '../viz.js';
import { isMoveFeelValue, MOVE_FEEL_VALUES } from '../move-feel.js';
import { EXERCISE_DETAIL } from '../exercise-detail.js';
import { rideRate } from '../ride.js';
import { deriveRideAim, lastTimeAtSameAim } from '../ride-aim.js';
import { ellipticalRideRecords } from '../cardio-notes.js';
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
} from '../cardio-readings.js';
import {
  chooseApartmentCardio,
  clearApartmentCardio,
  chooseElliptical,
  clearElliptical,
  captureLaneMinutesIfLeaving,
} from '../workout-lanes.js';
import { SAFETY_LINE, type Exercise, type Workout } from '../program.js';
import { saveActiveSession } from '../actions.js';
import { togglePause, stopTimer } from '../timer.js';
import { toggleVoiceNote as toggleVoiceNoteAudio } from '../audio.js';
import {
  workoutWalkStart,
  startWorkoutWalk,
  updateWalkLine,
  walkStepMinutes,
  walkFeelReady,
  walkLiveText,
  APARTMENT_CARDIO_NAME,
} from '../walk.js';
import {
  ELLIPTICAL_NAME,
  ARM_FEEL_STEPS,
  getCurrentWorkout,
  getCurrentExercise,
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
  markPaceRuleSeen,
  renderArmFeel,
  renderMoveFeel,
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

// The sub-views that are still in app.ts (rest / round break / cool-down: 17c; the ride lanes live here since 17b)
// and the jump (the state machine: 17c). app.ts registers them once at boot; the forwarding
// stubs below keep renderWorkout and the handlers byte-identical to the code that moved.
export type WorkoutSubviews = {
  renderRoundBreak: (w: Workout) => string;
  renderRestScreen: (w: Workout) => string;
  renderCooldownList: (w: Workout) => string;
  jumpToStep: (key: string) => void;
  advanceExercise: () => void;
};

let subviews: WorkoutSubviews | null = null;

export function setWorkoutSubviews(s: WorkoutSubviews): void {
  subviews = s;
}

function sub(): WorkoutSubviews {
  if (!subviews) throw new Error('screens/workout.ts: setWorkoutSubviews() was never called');
  return subviews;
}

function renderRoundBreak(w: Workout): string {
  return sub().renderRoundBreak(w);
}
function renderRestScreen(w: Workout): string {
  return sub().renderRestScreen(w);
}
function renderCooldownList(w: Workout): string {
  return sub().renderCooldownList(w);
}
function jumpToStep(key: string): void {
  sub().jumpToStep(key);
}
function advanceExercise(): void {
  sub().advanceExercise();
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

export function attachWorkoutFeelHandlers(): void {
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
      requestRender();
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
