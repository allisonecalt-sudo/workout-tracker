// workout-lanes.ts - the ride lanes' shared state helpers (code-shape step 17b, Oct 15 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the cardio lane CHOICE and its progress, kept in localStorage - choose / clear the
// apartment lane, choose / clear the elliptical lane (and her typed ride numbers), the lane's
// started / done-minutes keys, and captureLaneMinutesIfLeaving (the minutes she actually did).
// WHY here: BOTH session-resume.ts (resetState / resume) and screens/workout.ts (the state machine:
// beginExercises, the step advance, and the lane handlers) call them, and a screen cannot import
// app.ts - so they live in the shared layer.
// RULE: shared layer - imports state / ui / the pure modules, never app.ts or a screen, and
// writes no DOM (localStorage is the app's storage layer, not the page; a redraw is the
// caller's: the workout screen calls bus.requestRender()).

import {
  state,
  WW_APARTMENT_KEY,
  WW_ELLIPTICAL_KEY,
  WW_ELLIPTICAL_LEVEL_KEY,
  WW_ELLIPTICAL_KM_KEY,
  WW_ELLIPTICAL_PULSE_KEY,
  WW_ELLIPTICAL_TIME_KEY,
  WW_ELLIPTICAL_KCAL_KEY,
  WW_LANE_STARTED_KEY,
  WW_LANE_DONE_MIN_KEY,
  WW_LANE_PAUSE_BASE_KEY,
  WW_HOLD_START_KEY,
} from './state.js';
import { ui } from './ui.js';
import { laneDoneMinutes } from './cardio-readings.js';
import { getCurrentExercise, isIndoorLane } from './workout-now.js';

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
export function chooseApartmentCardio(minutes: number): void {
  clearElliptical(); // one lane at a time
  localStorage.setItem(WW_APARTMENT_KEY, String(minutes));
}

export function clearApartmentCardio(): void {
  clearLaneProgress();
  localStorage.removeItem(WW_APARTMENT_KEY);
}

export function chooseElliptical(minutes: number): void {
  clearApartmentCardio(); // one lane at a time
  localStorage.setItem(WW_ELLIPTICAL_KEY, String(minutes));
  // v48 · P3: no level pre-set any more — it's recorded on touch, after the ride.
}

// v45 — minutes actually done on an indoor lane (elliptical / apartment). Set
// when she leaves the step after running its timer: the timer's elapsed time,
// or the full block if it ran out. Never started the timer → nothing stored,
// and the prescription stands (she may have used the machine's own clock).

// v62.3 F9: the lane timer starts. The start time is a wall-clock instant (it survives a
// reload, unlike the countdown), and the session's paused total at that instant is kept
// with it, so the minutes can be worked out again later without the timer.
export function markLaneStarted(): void {
  localStorage.setItem(WW_LANE_STARTED_KEY, String(Date.now()));
  localStorage.setItem(WW_LANE_PAUSE_BASE_KEY, String(state.pausedMs));
  localStorage.removeItem(WW_LANE_DONE_MIN_KEY); // a fresh ride, fresh minutes
}

// v62.3 F9: seconds the lane timer would have run by now if the app had never reloaded:
// wall clock since it started, minus the time the session was paused since then (a pause
// still open counts only up to the moment it began). null = the app cannot know (no start
// time, or the lane started in an older build with a pause already on the books) - the
// caller then stores nothing rather than the full block.
export function laneElapsedSec(nowMs: number = Date.now()): number | null {
  const started = Number(localStorage.getItem(WW_LANE_STARTED_KEY));
  if (!Number.isFinite(started) || started <= 0) return null;
  const baseRaw = localStorage.getItem(WW_LANE_PAUSE_BASE_KEY);
  let base = 0;
  if (baseRaw !== null) {
    base = Number(baseRaw);
    if (!Number.isFinite(base)) return null;
  } else if (state.pausedMs > 0 || state.pausedAt !== null) {
    return null;
  }
  const pausedInLane = state.pausedMs - base;
  if (pausedInLane < 0) return null;
  const end = state.pausedAt !== null ? state.pausedAt : nowMs;
  return Math.max(0, (end - started - pausedInLane) / 1000);
}

// The minutes the lane timer shows for a `blockSec` block: elapsed, capped at the block,
// at least 1 (the same rounding captureLaneMinutesIfLeaving always used). null = not known.
export function laneMinutesNow(blockSec: number): number | null {
  const elapsed = laneElapsedSec();
  if (elapsed === null) return null;
  return Math.max(1, Math.round(Math.min(blockSec, elapsed) / 60));
}

export function captureLaneMinutesIfLeaving(): void {
  const ex = getCurrentExercise();
  if (!ex || !isIndoorLane(ex.name) || !ex.durationSec) return;
  if (localStorage.getItem(WW_LANE_STARTED_KEY) === null) return;
  // v48 · P3 (Sep 24 2026): a ride she STOPPED already holds its real minutes —
  // with the timer idle, the "0 left" arithmetic below would overwrite them
  // with the full block. Only a live timer (or nothing stored yet) is measured.
  const t = ui.activeTimer;
  const running = t !== null && t.kind === 'timed-exercise';
  if (!running && laneDoneMinutes() !== null) return;
  if (!running) {
    // v62.3 F9: no live timer and nothing stored = the timer ran out, OR the app reloaded
    // mid-block (the countdown is never restored). The old "0 left" arithmetic read both as
    // a full block, so 45 s ridden + a reload saved 10 minutes. The start time is still
    // here: the minutes are what the timer would show had it never reloaded, capped at the
    // block (a block that really ran out still gives the whole block). Unknown -> nothing.
    const minutes = laneMinutesNow(ex.durationSec);
    if (minutes !== null) localStorage.setItem(WW_LANE_DONE_MIN_KEY, String(minutes));
    return;
  }
  // Live: read the clock itself, not the last rendered second (a tap can land
  // before the next frame). Paused: the countdown is frozen at the rendered second.
  const leftSec =
    state.pausedAt === null ? Math.max(0, (t.endsAt - Date.now()) / 1000) : state.timerSeconds;
  const doneSec = Math.max(0, ex.durationSec - leftSec);
  localStorage.setItem(WW_LANE_DONE_MIN_KEY, String(Math.max(1, Math.round(doneSec / 60))));
}

export function clearLaneProgress(): void {
  localStorage.removeItem(WW_LANE_STARTED_KEY);
  localStorage.removeItem(WW_LANE_DONE_MIN_KEY);
  localStorage.removeItem(WW_LANE_PAUSE_BASE_KEY);
}

export function clearElliptical(): void {
  clearLaneProgress();
  localStorage.removeItem(WW_ELLIPTICAL_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_LEVEL_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_KM_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_PULSE_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_TIME_KEY);
  localStorage.removeItem(WW_ELLIPTICAL_KCAL_KEY);
}

// ---------- Hold timers (v62.3 fix round 1, item 5) ----------
// A hold's countdown is never restored after a reload, so a wall sit held 20 s and then reloaded
// saved 0. Like the apartment lane, the hold's START is a wall-clock instant that survives: kept
// in localStorage with the step it belongs to and the session's paused total at that instant.
// Only the WALL SIT saves a number (wallSitSec); every other hold is display-only.
// v62.4 S1: `priorHeldSec` = seconds already held before this start (a hold restarted after a
// reload carries what she held), so the stored start is back-dated by them - a second reload then
// still counts the whole hold. 0 (every normal start) writes exactly what it always did.
export function markHoldStarted(stepKey: string, priorHeldSec = 0): void {
  localStorage.setItem(
    WW_HOLD_START_KEY,
    JSON.stringify({
      key: stepKey,
      at: Date.now() - priorHeldSec * 1000,
      pauseBase: state.pausedMs,
    })
  );
}

export function clearHoldStart(): void {
  localStorage.removeItem(WW_HOLD_START_KEY);
}

// Seconds held for the hold on `stepKey`, as the timer would show with no reload: wall clock since
// the start minus paused time (a pause still open counts up to when it began), capped at the
// hold. null = no record for this step, or the app cannot know.
export function heldSecAfterReload(stepKey: string, durationSec: number): number | null {
  let rec: { key?: unknown; at?: unknown; pauseBase?: unknown };
  try {
    rec = JSON.parse(localStorage.getItem(WW_HOLD_START_KEY) ?? 'null') ?? {};
  } catch {
    return null;
  }
  if (rec.key !== stepKey) return null;
  const at = Number(rec.at);
  const base = Number(rec.pauseBase);
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(base)) return null;
  const pausedInHold = state.pausedMs - base;
  if (pausedInHold < 0) return null;
  const end = state.pausedAt !== null ? state.pausedAt : Date.now();
  const elapsed = Math.max(0, (end - at - pausedInHold) / 1000);
  return Math.round(Math.min(durationSec, elapsed));
}
