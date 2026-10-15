// screens/workout.ts - the workout screen: the exercise step (code-shape step 17a, Oct 15 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT (17a): renderWorkout (the render entry for state.screen === 'workout' - it picks the
// sub-view), the exercise step itself (name + reps + feel chips + safety + Tips + setup card +
// picture + how-to / detail card + Done / Back), the hold timer card (single-set and the
// wall-lean N-set counter), the tempo bar, the step list sheet ("List": rows, open / close /
// jump), the running-timer pip, the voice-note button, and four handler groups:
// attachWorkoutStepListHandlers (List + pip + jump rows), attachWorkoutFeelHandlers /
// attachWorkoutFeelHandlers2 (Easy/Right/Hard + load chip + "Set N done"; the ride's own
// always-on feel binding sits BETWEEN them in app.ts until 17b) and attachWorkoutCardHandlers
// (video / section / how-to / voice-note taps, bound document-wide - the cool-down rows' setup
// block uses the same data attributes).
//
// ONE SCREEN, SUB-VIEWS: the workout is one screen with sub-views (exercise step, ride lanes,
// rest, round break, cool-down, paused). Screens may not import each other, so the sub-views
// are not separate screens. The rule from here: pure render-string helpers shared by two or
// more sub-views are shared-layer modules named workout-*.ts (workout-now.ts: lookups;
// workout-parts.ts: step nav / progress line / header buttons; workout-feel.ts: feel chips;
// workout-cards.ts: picture / setup / detail / how-to cards); everything that binds, saves or
// moves the state machine stays in THIS file (or app.ts until its run). 17b adds the ride
// lanes' renderers (pure strings -> a shared workout-lanes.ts) and their handlers here; 17c adds
// rest / round break / cool-down / paused (strings -> a shared workout-breaks.ts) and the state
// machine here. Until then app.ts registers the sub-views this file still has to call through
// setWorkoutSubviews() (below) - each forwarding stub is deleted when its sub-view arrives.
//
// ui: nothing here is module-local. stepListOpen is written by app.ts (jumpToStep, resume,
// resetState) and read by render(); timerPipOpen is written by timer.ts (the timer's end) -
// both stay on `ui` (grep proof in the step 17a hand-off).

import { state, loadLogs, WW_LANE_STARTED_KEY } from '../state.js';
import { ui } from '../ui.js';
import { requestRender } from '../bus.js';
import { bindClick } from '../dom.js';
import { escapeHtml } from '../format.js';
import { renderActionBar } from '../action-bar.js';
import { flattenSteps } from '../step-list.js';
import { setsPrescribed, holdSetsFace, formatHeldSeconds } from '../hold-sets.js';
import { honestWallSitLogs } from '../viz.js';
import { isMoveFeelValue } from '../move-feel.js';
import { EXERCISE_DETAIL } from '../exercise-detail.js';
import { SAFETY_LINE, type Exercise, type Workout } from '../program.js';
import { saveActiveSession } from '../actions.js';
import { togglePause } from '../timer.js';
import { toggleVoiceNote as toggleVoiceNoteAudio } from '../audio.js';
import {
  workoutWalkStart,
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

// The sub-views that are still in app.ts (ride lanes: 17b; rest / round break / cool-down: 17c)
// and the jump (the state machine: 17c). app.ts registers them once at boot; the forwarding
// stubs below keep renderWorkout and the handlers byte-identical to the code that moved.
export type WorkoutSubviews = {
  renderRoundBreak: (w: Workout) => string;
  renderRestScreen: (w: Workout) => string;
  renderCooldownList: (w: Workout) => string;
  renderEllipticalStep: (ex: Exercise, header: string) => string;
  renderLaneTimerCard: (ex: Exercise, laneRan: boolean, under?: string) => string;
  renderApartmentRoutine: (totalSec: number, remainingSec: number, running: boolean) => string;
  jumpToStep: (key: string) => void;
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
function renderEllipticalStep(ex: Exercise, header: string): string {
  return sub().renderEllipticalStep(ex, header);
}
function renderLaneTimerCard(ex: Exercise, laneRan: boolean, under = ''): string {
  return sub().renderLaneTimerCard(ex, laneRan, under);
}
function renderApartmentRoutine(totalSec: number, remainingSec: number, running: boolean): string {
  return sub().renderApartmentRoutine(totalSec, remainingSec, running);
}
function jumpToStep(key: string): void {
  sub().jumpToStep(key);
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
