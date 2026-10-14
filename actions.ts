// actions.ts - the SAVE side of the app (code-shape step 10b, Oct 14 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: every place the app WRITES a session, a walk, a cycle period or a week
// move, and the retry loop that pushes unsynced rows: saveLog / genId,
// saveCompletedSession (+ the post-log save), logStaleSessionAsDone,
// saveHistoryEdit, logWalk, logPeriodStart / undoPeriodStart (+ their 10 s undo
// timer, state in ui.ts), moveOnWithoutIt / undoWeekMove, flushPendingSyncs, and
// their private helpers (armFeelString, saveLastDone, clearActiveSession ...).
// WHY: the screens leaving app.ts (steps 12-17) have handlers that save; a screen
// may import this file but never app.ts, so the save side had to leave app.ts first.
// RULE: imports state / ui / sync* / week-clock / program* / bus / the pure modules -
// NEVER app.ts or a screen (tests/import-graph.test.ts). A redraw is
// bus.requestRender(), as it is everywhere outside app.ts.
// NO DOM here: the one DOM write the save path used to make (the sync pill,
// updateSyncIndicator) and the few UI-side effects a save triggers (stop the
// post-log clock tick, end a workout walk, reset the session screen state, read the
// live workout / stepped moves) STAY in app.ts and are handed over ONCE at boot with
// setActionHooks(), same pattern as week-clock.ts's setWorkoutDProvider and bus.ts.
// They are called at exactly the points the old inline calls ran, in the same order.

import type { Workout } from './program.js';
import type { WeekKey } from './week.js';
import type {
  LogEntry,
  StoredWeekMove,
  StoredCyclePeriod,
  WalkEntry,
  LastDone,
  WorkoutWalkResult,
} from './types.js';
import {
  state,
  loadLogs,
  writeLogs,
  loadWalks,
  writeWalks,
  loadCyclePeriods,
  writeCyclePeriods,
  loadWeekMoves,
  writeWeekMoves,
  WW_RESULT_KEY,
  LAST_DONE_KEY,
  ACTIVE_SESSION_KEY,
  type ArmLoadState,
  type ArmFeel,
  type ArmFeelState,
} from './state.js';
import { ui } from './ui.js';
import { requestRender } from './bus.js';
import { moveFeelString, withOverrideFeel, type SteppedMove } from './move-feel.js';
import { pushLogToSupabase, patchLogToSupabase, syncDisabled } from './sync.js';
import { pushCyclePeriod, deleteCyclePeriod } from './sync-cycle.js';
import { pushWeekMove, deleteWeekMove, weekMoveKey } from './sync-week-moves.js';
import { pushWalk, fetchFitSteps } from './sync-movement.js';
import {
  laneDoneMinutes,
  ellipticalMinutes,
  apartmentCardioMinutes,
  ellipticalTimeSec,
  ellipticalLevel,
  ellipticalKm,
  ellipticalPulse,
  ellipticalKcal,
  parseMmSs,
  parseKmReading,
  parseKcalReading,
  parsePulseReading,
} from './cardio-readings.js';

// ---- the seam back into app.ts (registered once, at boot) ----

export type ActionHooks = {
  /** The sync pill's DOM write (app.ts keeps it: document.getElementById). */
  updateSyncIndicator: () => void;
  /** The workout on screen, resolved from the live session state. */
  getCurrentWorkout: () => Workout | null;
  /** End the in-workout walk step's tracking and keep its minutes (walk engine, timers). */
  harvestWorkoutWalk: () => void;
  /** Stop the post-log clock tick (a timer + DOM text write). */
  endPostLogClockTick: () => void;
  /** The firsts of the session being saved ("New tonight"), worked out before the save. */
  sessionFirsts: (onElliptical: boolean) => { firsts: string[]; back: string[] };
  /** This workout's stepped moves (feeds move_feel). */
  currentSteppedMoves: () => SteppedMove[];
  skippedStepsCount: (w: Workout) => number;
  /** Wipe the session screen state after a save (timers, wake lock, state.ts reset). */
  resetState: () => void;
};

let actionHooks: ActionHooks | null = null;

/** app.ts registers its UI-side effects here once, at boot (before any tap can save). */
export function setActionHooks(h: ActionHooks): void {
  actionHooks = h;
}

function hooks(): ActionHooks {
  if (actionHooks === null) {
    throw new Error('actions.ts used before setActionHooks()');
  }
  return actionHooks;
}

// Same bar at Done: a computed duration longer than this is a session that sat
// open, not a workout length. Blank it and say so in notes rather than log it.
const MAX_PLAUSIBLE_DURATION_SEC = 3 * 60 * 60;

export function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Total paused milliseconds so far, including an in-progress pause. Used at save
// to subtract step-away time from the workout's wall-clock duration.
function totalPausedMs(): number {
  return state.pausedMs + (state.pausedAt !== null ? Date.now() - state.pausedAt : 0);
}

export function saveLog(entry: LogEntry): LogEntry {
  const stored: LogEntry = { ...entry, id: entry.id ?? genId(), synced: false };
  const logs = loadLogs();
  logs.unshift(stored);
  // Newest-first by DATE, not by save order — an after-the-fact log (v32) is
  // dated the day it was started, which may be older than rows already here.
  logs.sort((a, b) => b.date.localeCompare(a.date));
  writeLogs(logs);
  return stored;
}

export function logWalk(
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

function saveLastDone(d: LastDone): void {
  try {
    localStorage.setItem(LAST_DONE_KEY, JSON.stringify(d));
  } catch {
    // storage full or blocked — the Done card still shows without firsts
  }
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

export async function saveCompletedSession(): Promise<void> {
  if (!state.selectedWorkout) return;
  // v50 · jump list: read before resetState() wipes completedSteps.
  const w = hooks().getCurrentWorkout();
  hooks().harvestWorkoutWalk(); // no-op unless a walk step is somehow still open
  if (!ui.workoutWalk) ui.workoutWalk = storedWorkoutWalk(); // survived an app close (v45)
  // By now the walk (first exercise) ended long ago, so Google Fit has synced it.
  // v48 · P3 (Sep 24 2026): Fit's count is the ONLY step number — saved to
  // walk_steps when Fit answers, else null (the motion estimate is archived),
  // and never displayed. Brief await (Fit replies fast); never blocks the log.
  let walkFitSteps: number | null = null;
  if (ui.workoutWalk && ui.workoutWalk.startMs && ui.workoutWalk.endMs) {
    const fit = await fetchFitSteps(ui.workoutWalk.startMs, ui.workoutWalk.endMs);
    if (fit !== null && fit > 0) walkFitSteps = fit;
  }
  const completedAt = new Date().toISOString();
  const startedAt = state.startedAt ?? completedAt;
  // T1 (Sep 27 2026), §3.2 "Untouched at Start"'s own twin at the other end:
  // if she never tapped ✓/✎ on the finish question, this Save-tap instant
  // becomes her_end_at — her_end_confirmed stays false either way. Read
  // BEFORE endPostLogClockTick() below so the tick's own textContent write
  // race (if it somehow still fires this same tick) can't win against this.
  hooks().endPostLogClockTick();
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
        : ui.workoutWalk
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
        : cardioLane === 'walk' && ui.workoutWalk
          ? ui.workoutWalk.minutes
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
  const { firsts, back } = hooks().sessionFirsts(onElliptical);
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
    walkMinutes: ui.workoutWalk ? ui.workoutWalk.minutes : null,
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
      const base = moveFeelString(state.moveFeel, hooks().currentSteppedMoves());
      if (!onElliptical || !state.rideFeel) return base;
      const sec = ellipticalTimeSec();
      const minutes = sec !== null ? Math.max(1, Math.round(sec / 60)) : null;
      return withOverrideFeel(base, 'ride', state.rideFeel, minutes, 'min');
    })(),
    voicePlays: state.voicePlays,
    stepsSkipped: w ? hooks().skippedStepsCount(w) : null,
  });
  if (stored.id) saveLastDone({ id: stored.id, firsts, back });
  hooks().resetState();
  requestRender();
  state.syncStatus = 'syncing';
  hooks().updateSyncIndicator();
  void pushLogToSupabase(stored).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    hooks().updateSyncIndicator();
  });
}

export function clearActiveSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Non-fatal.
  }
}

// "Yes, I did it": log the left-open workout for the day it was STARTED. No
// post-log ever happened, so after-capacity, back pain, end time and duration
// are unknown — saved as null (shown "—"), with a note saying why. The one
// number that was really entered, capacity-before, is kept.
export function logStaleSessionAsDone(): void {
  const snap = ui.staleSnapshot;
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
  ui.staleSnapshot = null;
  clearActiveSession();
  requestRender();
  state.syncStatus = 'syncing';
  hooks().updateSyncIndicator();
  void pushLogToSupabase(stored).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    hooks().updateSyncIndicator();
  });
}

// "Period started today" (or a picked day): her own logging, one tap, with a
// 10s undo (app-building-guide §1-2: <=2 taps, and every destructive-feeling
// action gets an out). Optimistic local write first — offline-safe, same as
// every other save in this app — then pushed if a network is allowed.
const CYCLE_UNDO_MS = 10_000;

export function logPeriodStart(dateISO: string): void {
  const periods = loadCyclePeriods();
  const existing = periods.find((p) => p.startDate === dateISO);
  if (ui.cycleUndoTimer) clearTimeout(ui.cycleUndoTimer);
  if (existing) {
    // Already logged — leave the row exactly as it was (never overwrite an
    // earlier 'reproductive.md' source with 'app', never re-push and risk a
    // conflict). Show "Already logged" with no Undo, since there's nothing
    // this tap created.
    ui.cycleUndoStartDate = dateISO;
    ui.cycleUndoCreated = false;
    ui.cycleUndoTimer = setTimeout(() => {
      ui.cycleUndoStartDate = null;
      requestRender();
    }, CYCLE_UNDO_MS);
    requestRender();
    return;
  }
  const stored: StoredCyclePeriod = {
    startDate: dateISO,
    source: 'app',
    note: null,
    synced: syncDisabled(), // automation: mark synced so no network is attempted
  };
  writeCyclePeriods([...periods, stored]);
  ui.cycleUndoStartDate = dateISO;
  ui.cycleUndoCreated = true;
  ui.cycleUndoTimer = setTimeout(() => {
    ui.cycleUndoStartDate = null;
    ui.cycleUndoCreated = false;
    requestRender();
  }, CYCLE_UNDO_MS);
  void pushCyclePeriod(stored);
  requestRender();
}

export function undoPeriodStart(): void {
  if (!ui.cycleUndoStartDate || !ui.cycleUndoCreated) return; // nothing this tap created — no-op
  const dateISO = ui.cycleUndoStartDate;
  if (ui.cycleUndoTimer) clearTimeout(ui.cycleUndoTimer);
  ui.cycleUndoTimer = null;
  ui.cycleUndoStartDate = null;
  ui.cycleUndoCreated = false;
  writeCyclePeriods(loadCyclePeriods().filter((p) => p.startDate !== dateISO));
  void deleteCyclePeriod(dateISO);
  requestRender();
}

export async function flushPendingSyncs(): Promise<void> {
  if (syncDisabled()) {
    // v48 · P4 (Sep 24 2026): under automation nothing syncs, so say so rather
    // than sit on "syncing…" forever (walk-in-her-shoes: the pill never settled
    // in the test setup). Nothing pending → the indicator is empty.
    state.syncStatus = 'offline';
    hooks().updateSyncIndicator();
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
    hooks().updateSyncIndicator();
    return;
  }
  state.syncStatus = 'syncing';
  hooks().updateSyncIndicator();
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
  hooks().updateSyncIndicator();
}

/** §2.4's quiet week-card button: her explicit "Move on without it" tap.
 * Optimistic local write first (offline-safe, same as every other save in
 * this app), then pushed if a network is allowed — never network-first (the
 * tap must never silently do nothing on a bad connection). */
export function moveOnWithoutIt(key: WeekKey, missing: readonly string[]): void {
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
  requestRender();
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
export function undoWeekMove(move: StoredWeekMove): void {
  const tombstone: StoredWeekMove = { ...move, deleted: true, synced: false };
  writeWeekMoves([
    tombstone,
    ...loadWeekMoves().filter(
      (m) => weekMoveKey(m.round, m.week) !== weekMoveKey(move.round, move.week)
    ),
  ]);
  void deleteWeekMove(move.round, move.week);
  requestRender();
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
export function saveHistoryEdit(): void {
  const id = state.historyDetailId;
  const draft = ui.historyEditDraft;
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
  ui.historyEditDraft = null;
  state.screen = 'history-detail';
  requestRender();
  state.syncStatus = 'syncing';
  hooks().updateSyncIndicator();
  void (existingOnServer ? patchLogToSupabase(updated) : pushLogToSupabase(updated)).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    hooks().updateSyncIndicator();
  });
}
