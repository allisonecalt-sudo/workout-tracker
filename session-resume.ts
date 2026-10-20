// session-resume.ts - the in-progress session's snapshot, resume and reset (code-shape step 17c-3, Oct 16 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the resume snapshot read + validation (readActiveSnapshot and its sanitizers), putting a
// snapshot back into live state (applyActiveSnapshot), restoreActiveSession (the boot call; a snapshot
// older than STALE_SESSION_MS is left for Home to ask about), and resetState (the one place a finished
// or quit session is wiped).
// WHY: they span every resumable screen and are called by the shell (boot, back-home, the left-open
// card), by actions.ts (a hook) and by the workout state machine (a hook) - none of them is one
// screen's. They write no DOM; the three clock ticks they stop / start belong to the pre-log and
// post-log screens, so those come in ONCE at boot through setResumeHooks() (the actions.ts pattern),
// never by importing a screen.
// RULE: shared layer - never imports app.ts or a screen (tests/import-graph.test.ts, default-deny).

import { isMoveFeelValue, isMoveFeelMark } from './move-feel.js';
import { isArmFeel, isArmLoad, heavierArmLoad, defaultArmLoad } from './workout-feel.js';
import type { Phase } from './program.js';
import { ui } from './ui.js';
import { ellipticalMinutes } from './cardio-readings.js';
import { clearApartmentCardio, clearElliptical, clearHoldStart } from './workout-lanes.js';
import { RESUMABLE_SCREENS, clearActiveSession } from './actions.js';
import {
  type AppScreen,
  type ArmFeelState,
  type MoveFeelState,
  type ArmLoadState,
  type ActiveSessionSnapshot,
  ACTIVE_SESSION_KEY,
  WW_RESULT_KEY,
  state,
  loadLogs,
} from './state.js';
import { stopTimer } from './timer.js';
import { stopVoiceNote } from './audio.js';
import { ELLIPTICAL_NAME, getWorkoutById, getWorkoutD } from './workout-now.js';

export type ResumeHooks = {
  beginPostLogClockTick: () => void;
  endPreLogClockTick: () => void;
  endPostLogClockTick: () => void;
};

let hooks: ResumeHooks | null = null;

export function setResumeHooks(h: ResumeHooks): void {
  hooks = h;
}

function hook(): ResumeHooks {
  if (!hooks) throw new Error('session-resume.ts: setResumeHooks() was never called');
  return hooks;
}

function beginPostLogClockTick(): void {
  hook().beginPostLogClockTick();
}
function endPreLogClockTick(): void {
  hook().endPreLogClockTick();
}
function endPostLogClockTick(): void {
  hook().endPostLogClockTick();
}

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
    if (/^[a-z]+$/.test(slug) && isMoveFeelMark(val)) out[slug] = val;
  }
  return out;
}

// v63 item 3: the hurt-skipped steps, step key -> move slug. A corrupt or absent value reads as none.
function sanitizeHurtSteps(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, slug] of Object.entries(v as Record<string, unknown>)) {
    if (typeof slug === 'string' && /^[a-z]+$/.test(slug)) out[key] = slug;
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
      hurtSteps: sanitizeHurtSteps(snap.hurtSteps),
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
export function applyActiveSnapshot(snap: ActiveSessionSnapshot): void {
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
  state.hurtSteps = snap.hurtSteps ?? {};
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
export function restoreActiveSession(): boolean {
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

export function resetState(): void {
  stopTimer();
  clearActiveSession();
  state.screen = 'home';
  // Reset viewed week to current when returning to home from a session.
  ui.viewedWeekOffset = 0;
  ui.reviewBackTo = 'home';
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
  state.hurtSteps = {}; // v63 item 3
  state.rideNumbersOpen = false; // v51
  ui.stepListOpen = false; // v50 · jump list: a closed session closes the sheet too
  stopVoiceNote();
  clearApartmentCardio(); // the cardio lane is a per-session choice
  clearHoldStart(); // item 5: a hold's start belongs to one session
  clearElliptical();
  localStorage.removeItem(WW_RESULT_KEY); // the saved walk's numbers are logged now
  state.historyDetailId = null;
  state.detailReturnTo = null;
}
