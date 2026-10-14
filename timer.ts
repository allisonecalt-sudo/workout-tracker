// timer.ts - the clock-anchored timer (code-shape step 11a, Oct 14 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the one timer engine behind rest, the pre-countdown and every timed hold / ride:
// startTimerCore / timerLoop (one requestAnimationFrame loop reading the wall clock) /
// stopTimer, startRestTimer / skipRest / startPreCountdown, pause + resume of the session
// (togglePause shifts the clock anchors forward), the visibilitychange fast-forward, and
// the wake lock a long timed block holds (released with the timer unless a walk needs it).
// The state lives in ui.ts (ui.activeTimer, ui.rafHandle, ui.timerHoldsWakeLock,
// ui.timerPipOpen) and state.ts (timerSeconds, preCountdown, pausedAt ...).
// WHY: the workout screen (step 17a) renders from this state and drives it; a screen
// cannot import app.ts, so the engine had to leave it first.
// RULE: writes NO DOM. A redraw is bus.requestRender() (what render() was, registered at
// boot); the digits are drawn by the render the loop asks for, in app.ts / the screen.
// Imports state / ui / bus / audio / walk and the types, never app.ts or a screen
// (enforced by tests/import-graph.test.ts). stopTimer() keeps its name: ~10 call sites in
// app.ts import it unchanged.
//
// `document` is read for the visibility event and its state, and `window` for the
// setTimeout fallback where requestAnimationFrame is missing - browser APIs, not page
// writes; the import-graph test allows exactly those names here. The visibility handler
// is installed by app.ts at the spot the old inline block ran (installTimerVisibilityHandler).

import { state, getRestSec, getPreCountSec } from './state.js';
import { ui } from './ui.js';
import { requestRender } from './bus.js';
import { playCountBeep, playGoBeep, playFinishBeep } from './audio.js';
import { acquireWalkWakeLock, activeWalkStart, workoutWalkStart } from './walk.js';
import type { TimerKind } from './types.js';

// ---------- timer (clock-anchored, group 1B) ----------
//
// Why this design (audit §3): the previous setInterval-based countdown was
// throttled when the phone screen slept (iOS Safari pauses background
// intervals entirely), so a 25-sec wall-sit would freeze and never finish.
// Pre-countdown had its own closure-local interval, leaking a "ghost timer"
// on Quit. This replaces all of that with a single rAF loop reading the
// wall-clock — endsAt is captured once, every frame computes
// `endsAt - Date.now()`. Survives sleep/wake; pause is trivial.

// v46: keep the screen awake through a long timed block (the 10-25 min
// elliptical / apartment rides). Only walks held a wake lock; on a ride the
// Pixel slept, the timer loop stopped with it, and no 3-2-1 or finish chime
// played until she woke the phone (UX audit Sep 24; her Jul-4 walk rule was
// "it should make the screen stay open"). Reuses the walk's lock; released when
// the timer ends or stops — unless a walk still needs it.
const TIMER_WAKE_LOCK_MIN_SEC = 60;
const COUNT_BEEP_FROM_SEC = 3;

function releaseTimerWakeLock(): void {
  if (!ui.timerHoldsWakeLock) return;
  ui.timerHoldsWakeLock = false;
  if (activeWalkStart() !== null || workoutWalkStart() !== null) return; // a walk still holds it
  if (ui.walkWakeLock) {
    void ui.walkWakeLock.release().catch(() => undefined);
    ui.walkWakeLock = null;
  }
}

export function stopTimer(): void {
  if (ui.rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(ui.rafHandle);
  }
  ui.rafHandle = null;
  ui.activeTimer = null;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  releaseTimerWakeLock();
  ui.timerPipOpen = false; // v53: the pip's sheet never outlives the timer it belongs to
}

export function startTimerCore(kind: TimerKind, seconds: number, onComplete: () => void): void {
  stopTimer();
  ui.activeTimer = {
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
    ui.timerHoldsWakeLock = true;
    void acquireWalkWakeLock(); // guarded inside: no-op without navigator.wakeLock
  }
  requestRender();
  timerLoop();
}

function timerLoop(): void {
  if (!ui.activeTimer) return;
  // Paused: freeze the countdown. `togglePause` shifts `endsAt` forward by the
  // paused span on resume and re-enters the loop, so no ticks are lost. This
  // guard also makes the visibilitychange re-entry safe while paused.
  if (state.pausedAt !== null) return;
  const remainMs = ui.activeTimer.endsAt - Date.now();
  const remainSec = Math.max(0, Math.ceil(remainMs / 1000));

  if (remainSec !== ui.activeTimer.lastSecRendered) {
    ui.activeTimer.lastSecRendered = remainSec;
    if (ui.activeTimer.kind === 'pre-countdown') {
      state.preCountdown = remainSec;
    } else {
      state.timerSeconds = remainSec;
    }
    // Count beeps at the last COUNT_BEEP_FROM_SEC seconds (audit T6 fix:
    // only the count beep, not finish beep, fires on the way down).
    if (remainSec > 0 && remainSec <= COUNT_BEEP_FROM_SEC) {
      playCountBeep();
    }
    requestRender();
  }

  if (remainMs <= 0) {
    const t = ui.activeTimer;
    ui.activeTimer = null;
    ui.rafHandle = null;
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
    ui.rafHandle = requestAnimationFrame(timerLoop);
  } else {
    // Fallback for environments without rAF (e.g. some test runners): poll @100ms.
    ui.rafHandle = window.setTimeout(timerLoop, 100) as unknown as number;
  }
}

export function startRestTimer(): void {
  // Ship 6: rest duration is user-configurable via Settings.
  // 2026-05-15 18:07 update: 0 means skip rest entirely — go straight to
  // the next exercise. Allison's call: "i do not need the brakes anymore."
  const rest = getRestSec();
  if (rest <= 0) {
    state.isResting = false;
    requestRender();
    return;
  }
  state.isResting = true;
  startTimerCore('rest', rest, () => {
    state.isResting = false;
    requestRender();
  });
}

export function skipRest(): void {
  stopTimer();
  state.isResting = false;
  state.timerSeconds = 0; // Group 1A: ensure no stale value blocks next "Start timer"
  requestRender();
}

export function startPreCountdown(then: () => void): void {
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
export function togglePause(): void {
  if (state.pausedAt === null) {
    // → pause
    state.pausedAt = Date.now();
    if (ui.rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(ui.rafHandle);
    }
    ui.rafHandle = null;
    requestRender();
    return;
  }
  // → resume
  const pausedFor = Date.now() - state.pausedAt;
  state.pausedMs += pausedFor;
  state.pausedAt = null;
  if (ui.activeTimer) ui.activeTimer.endsAt += pausedFor; // don't burn the frozen countdown
  if (state.wallSitStartedAt !== null) state.wallSitStartedAt += pausedFor; // keep held-sec honest
  requestRender();
  if (ui.activeTimer) timerLoop();
}

// Recompute on tab visibility — if the user backgrounded the app the rAF
// loop pauses and the timer would freeze. On return we fast-forward.
export function installTimerVisibilityHandler(): void {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ui.activeTimer) {
        // v45: cancel the pending frame first, or every background/foreground
        // cycle added one more parallel loop until the timer ended.
        if (ui.rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(ui.rafHandle);
        }
        ui.rafHandle = null;
        timerLoop();
      }
      // Wake lock auto-releases when the app is backgrounded; if a walk is
      // still running when she comes back, grab it again so the screen stays
      // on for the rest of the walk (her Jul-4 call). v46: same for a long
      // timed block still counting down.
      if (
        document.visibilityState === 'visible' &&
        (activeWalkStart() || (ui.activeTimer !== null && ui.timerHoldsWakeLock))
      ) {
        void acquireWalkWakeLock();
      }
    });
  }
}
