// walk.ts - walk tracking (code-shape step 11c, Oct 14 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the standalone walk (startWalk / finishWalk / cancelWalk, its start stamp in
// localStorage), the in-workout "Outdoor walk" step (workoutWalkStart, startWorkoutWalk,
// harvestWorkoutWalk, clearWorkoutWalk - state in ui.workoutWalk), the wake lock + the
// 30 s minute tick (beginWalkTracking / endWalkTracking), today's Google Fit steps
// (fetchStepsToday), and the apartment-cardio minutes (walkStepMinutes,
// apartmentCardioStep). There is no GPS watch or step counter any more: v48 archived
// them (archive/walk-sensors-2026-09-24/) - minutes only, and the wake lock stays.
// WHY: the workout screen's walk lane and the home walk row (steps 12-17) both read
// these; a screen cannot import app.ts, so the walk logic had to leave it first.
// RULE: writes NO DOM. What stayed in app.ts because it draws: updateWalkLiveLine (the
// "Walking · N min" line + the feel-chip reveal, document.getElementById) and
// syncWorkoutWalkTracking (which reads the current exercise and then updates that line).
// The minute tick calls the updater app.ts registers at boot (setWalkLineUpdater). A
// redraw goes through bus.requestRender(). Imports state / ui / bus / actions / sync-movement
// / the pure modules, never app.ts or a screen (enforced by tests/import-graph.test.ts).
//
// `window` is read for window.setInterval / clearInterval (the 30 s tick), and
// `navigator` / `document` for the Wake Lock API and the visibility check that guards
// it - browser APIs, not page writes; the import-graph test allows exactly those names.

import {
  state,
  WALK_ACTIVE_KEY,
  LEGACY_WALK_COUNTER_KEYS,
  WW_START_KEY,
  WW_RESULT_KEY,
} from './state.js';
import { ui } from './ui.js';
import { requestRender } from './bus.js';
import { logWalk } from './actions.js';
import { fetchFitSteps } from './sync-movement.js';
import type { Exercise } from './program.js';
import type { WalkEntry } from './types.js';

// app.ts registers the live-line updater once, at boot (it is the DOM write, so it stays
// there); the minute tick calls it.
let walkLineUpdater: (() => void) | null = null;

export function setWalkLineUpdater(fn: () => void): void {
  walkLineUpdater = fn;
}

export function updateWalkLine(): void {
  if (walkLineUpdater === null) {
    throw new Error('walk.ts used before setWalkLineUpdater()');
  }
  walkLineUpdater();
}

// v59 (Sep 28 2026), CHECK-v58 round 2 nice #R2-N2: the walk-outside lane's
// Easy/Right/Hard chip (renderMoveFeel via the Outdoor-walk branch below)
// used to show the instant she tapped ▶ Walk outside — "Walking · 0 min ·
// how did it feel?" — before she'd walked at all. Gated on real elapsed time
// instead: no opinion to ask about yet under 3 min.
const WALK_FEEL_GATE_MS = 3 * 60_000;
export function walkFeelReady(start: number | null): boolean {
  return start !== null && Date.now() - start >= WALK_FEEL_GATE_MS;
}

// The v47 counters' keys — only cleared now (a phone may still hold them).

function clearLegacyWalkCounters(): void {
  for (const k of LEGACY_WALK_COUNTER_KEYS) localStorage.removeItem(k);
}

export function activeWalkStart(): number | null {
  const raw = localStorage.getItem(WALK_ACTIVE_KEY);
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

// v48 · P3: the one live line, minutes only — "Walking · 12 min".
export function walkLiveText(start: number | null): string {
  const mins = start ? Math.max(0, Math.floor((Date.now() - start) / 60000)) : 0;
  return `Walking · ${mins} min`;
}

export async function acquireWalkWakeLock(): Promise<void> {
  // Her call (Jul 4): the screen SHOULD stay on during a walk (v48: so the
  // minute tick keeps running; the sensors are archived). try/catch: headless tests and
  // older browsers have no wakeLock.
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && document.visibilityState === 'visible') {
      ui.walkWakeLock = await nav.wakeLock.request('screen');
    }
  } catch {
    ui.walkWakeLock = null;
  }
}

// v48 · P3: the wake lock + the minute tick. No GPS watch, no devicemotion
// listener any more (archive/walk-sensors-2026-09-24/).
export function beginWalkTracking(): void {
  void acquireWalkWakeLock();
  if (ui.walkTickId === null) {
    ui.walkTickId = window.setInterval(updateWalkLine, 30000);
  }
}

export function endWalkTracking(): void {
  if (ui.walkTickId !== null) {
    window.clearInterval(ui.walkTickId);
    ui.walkTickId = null;
  }
  if (ui.walkWakeLock) {
    void ui.walkWakeLock.release().catch(() => undefined);
    ui.walkWakeLock = null;
  }
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

export function startWalk(): void {
  localStorage.setItem(WALK_ACTIVE_KEY, String(Date.now()));
  clearLegacyWalkCounters();
  beginWalkTracking();
}

export function finishWalk(): WalkEntry | null {
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
export function cancelWalk(): void {
  endWalkTracking();
  localStorage.removeItem(WALK_ACTIVE_KEY);
}

export function workoutWalkStart(): number | null {
  const raw = localStorage.getItem(WW_START_KEY);
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

export function harvestWorkoutWalk(): void {
  const start = workoutWalkStart();
  if (start === null) return;
  const end = Date.now();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  // Don't kill the engine if a STANDALONE walk is (somehow) also live.
  if (!activeWalkStart()) endWalkTracking();
  localStorage.removeItem(WW_START_KEY);
  // Keep start/end so logCompleteAndHome can ask Google Fit for the real count.
  ui.workoutWalk = { minutes, startMs: start, endMs: end };
  // v45: persisted too — the walk is the FIRST step, so if the phone drops the
  // app during the strength rounds, the numbers must still be there at Save.
  localStorage.setItem(WW_RESULT_KEY, JSON.stringify(ui.workoutWalk));
}

export function clearWorkoutWalk(): void {
  ui.workoutWalk = null;
  localStorage.removeItem(WW_RESULT_KEY);
}

/** The wake lock + minute tick, for a workout walk that is already stamped as started
 *  (first tick after Start, or resumed after an app close). */
export function resumeWalkTracking(): void {
  if (ui.walkTickId === null) beginWalkTracking();
}

// Explicit Start for the in-workout walk (her Jul-9 rule: tracking begins only when she
// taps Start). Stamps the start time, then lights up the wake lock + minute tick.
export function startWorkoutWalk(): void {
  if (activeWalkStart() !== null) return; // a standalone walk owns the engine
  localStorage.setItem(WW_START_KEY, String(Date.now()));
  clearLegacyWalkCounters();
  beginWalkTracking();
}

// ---------- Cardio either/or (Allison Sep 7 2026) ----------
// The apartment lane's minutes: the same as the walk step prescribes.
export const APARTMENT_CARDIO_NAME = 'Apartment cardio';

// Minutes the walk step prescribes — read off its own reps text ("10 min").
export function walkStepMinutes(ex: Exercise): number {
  const m = /(\d+)\s*min/.exec(ex.reps ?? '');
  return m?.[1] ? Number(m[1]) : 10;
}

export function apartmentCardioStep(minutes: number): Exercise {
  return {
    name: APARTMENT_CARDIO_NAME,
    reps: `${minutes} min`,
    notes:
      "Same minutes as the walk, inside — and you don't have to invent it. Start the timer and the strip below runs itself: five moves, two minutes each, cycling until the time is up. Conversational effort the whole way — you should still be able to talk. Rather do the building stairs? Same minutes there works too. Nothing is tracked here; the timer is the whole thing.",
    durationSec: minutes * 60,
    isTimed: true,
  };
}

export async function fetchStepsToday(): Promise<void> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const n = await fetchFitSteps(midnight.getTime(), Date.now());
  if (n === null) return;
  ui.stepsToday = n;
  if (state.screen === 'home') requestRender();
}
