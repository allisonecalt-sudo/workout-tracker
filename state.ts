// state.ts - the app's shared state and its localStorage layer (code-shape step 7a,
// Oct 14 2026). Moved out of app.ts with NO change in behaviour, in a single
// stored key or in any stored JSON shape.
//
// What lives here: the AppState / ActiveSessionSnapshot types and the `state`
// object, EVERY localStorage key constant (one registry - a new key goes here),
// the settings getters/setters, the logs and week-moves readers/writers and the
// log-row validator they read through.
//
// What does NOT: the ~34 module-level `let`s (step 10), the other readers/writers
// (walks, cycle periods, last-done, the active-session snapshot: they stay in
// app.ts for now and import their keys from here), anything that renders or syncs.
// There is no `storage()` wrapper in this app (the plan guessed one): the access
// layer is getSetting/setSetting and the try/catch readers below.
//
// Imports: only pure data modules (program, week, move-feel, types). Never app.ts,
// never bus.ts; tests/import-graph.test.ts enforces both. The only top-level code
// is the literals below (constants and the initial `state` object): nothing reads
// another module's binding at load, so evaluation order cannot change what this
// file builds.

import type { AnyWorkoutId, Phase } from './program.js';
import type { WeekKey } from './week.js';
import type { MoveFeelValue } from './move-feel.js';
import type { LogEntry, StoredWeekMove, WalkEntry, StoredCyclePeriod } from './types.js';
import type { CyclePeriod } from './cycle.js';
import type { WeekClockInput } from './program-week.js';

// ---------- types ----------

export type AppScreen =
  | 'home'
  | 'pre-log'
  | 'workout'
  | 'post-log'
  | 'history'
  | 'history-detail'
  // v53 (Sep 26 2026): fix a past session's ride numbers — her words: "I
  // don't know how to update this information... there have to be an easy
  // way to enter the data." Reached from history-detail's Edit button.
  | 'history-edit'
  | 'weekly-review'
  | 'progress'
  | 'settings'
  | 'cycle'
  // THE RIDES PAGE (Sep 27 2026), replacing plan items R1+R2 per her
  // amendments (Sep 26 2026, 23:16-23:20): "Also I want elliptical data
  // page." One door from Progress ("🚴 Your rides ›"), one way back
  // ("‹ Progress") — simpler than Your cycle's two doors, since nothing
  // else on Home opens it.
  | 'rides';

export type SyncStatus = 'syncing' | 'synced' | 'offline';

export type AppState = {
  screen: AppScreen;
  selectedWorkout: AnyWorkoutId | null;
  // WK2 (Sep 27 2026), PLAN-2026-09-26.md §2.3 "pin the plan for a session in
  // progress": the plan a session trains follows the week it's PICKED in, not
  // whatever week.ts says "now" is on every later render — otherwise a
  // session that straddles a week's own Sat/Sun open boundary (started right
  // before midnight, still running after) could switch which week's moves
  // it's showing mid-workout. Set once in startWorkout(); null = no session
  // chosen yet (Home reads live). Pre-launch: an ISO date string, feeding
  // straight into getWeekPlan(date)'s calendar lookup (see preLaunchPlanDate()).
  pinnedPlanDateIso: string | null;
  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.3's own "land WK4's planForLog
  // before any Week 6 PROGRAM row is written": at/after the launch, the pin
  // is the RESOLVED completion-model key itself, not a synthetic calendar
  // date to re-derive it from — closing the gap §2.8 item 4 (Opus check)
  // flagged (getCurrentWorkout's own earlier comment named this exact field
  // as the fix). Exactly one of the two pins is ever set for a given session
  // (see startWorkout) — pinnedWeekKey wins in getCurrentWorkout when present.
  pinnedWeekKey: WeekKey | null;
  capacityBefore: number;
  capacityAfter: number;
  // v50 · mood: same 1-10/touched shape as capacity, kept as a separate pair
  // of fields — the two are two different questions (her spec §2).
  moodBefore: number;
  moodAfter: number;
  moodBeforeTouched: boolean;
  moodAfterTouched: boolean;
  wallSitSec: number;
  backPain: number;
  // v49 · engine: wrist half of the combined body tap, same shape as backPain.
  wristPain: number;
  wristPainTouched: boolean;
  // v48 · P5: post-log "Wrist: Something" was tapped — the 1-10 row is open but
  // no number is chosen yet. Transient, mirrors backSomethingOpen below.
  wristSomethingOpen: boolean;
  // v51 (Sep 25 2026): the pre-log twin of backPain/wristPain above — same
  // shape, same "Fine · Back · Wrist" component, asked before the workout
  // instead of after (her words: "and all metrics bf workout have after as
  // well").
  backPainBefore: number;
  backPainBeforeTouched: boolean;
  backBeforeSomethingOpen: boolean;
  wristPainBefore: number;
  wristPainBeforeTouched: boolean;
  wristBeforeSomethingOpen: boolean;
  // T1 (Sep 27 2026), PLAN-2026-09-26.md §3.1: null until she confirms (✓)
  // or fixes (✎) it — the pre-log clock shows "now" live instead (computed
  // at render, never stored while unconfirmed). beginExercises() finalizes
  // an untouched one at Start-tap time, confirmed still false (§3.1's own
  // "Untouched at Start" rule).
  herStartAt: string | null;
  herStartConfirmed: boolean;
  herStartEditingOpen: boolean; // the ✎ time box + "N min ago" chips are open
  // T1 §3.2: same shape, asked at the other end. saveCompletedSession()
  // finalizes an untouched one the same way beginExercises() does above.
  herEndAt: string | null;
  herEndConfirmed: boolean;
  herEndEditingOpen: boolean;
  // T1 §3.2: 0/5/15/30 once she taps a chip; null = untouched (never 0 —
  // "None" is its own explicit tap).
  breakMinutes: number | null;
  // v49 · engine: the new-rung "Fine · Too much" tap. Transient, unset most
  // sessions (only offered when a rung changed recently — see
  // needsStepFeelPrompt()). Reset to null at the start of every session.
  stepFeel: 'fine' | 'too_much' | null;
  // v46: did she actually MOVE the slider? The three sliders start at 5/5/0 and
  // used to save as if she chose them — capacity-after was exactly 5 in 6 of 8
  // sessions since Aug 30, a "decline" the mirror invented (UX audit Sep 24).
  // Untouched → saved as null ("—"), the sliders still show 5/5/0 to start.
  capacityBeforeTouched: boolean;
  capacityAfterTouched: boolean;
  backPainTouched: boolean;
  word: string;
  // Post-log free text (v44): "any information at the end about what I did".
  sessionNote: string;
  // v48 (Sep 24 2026): voice notes STARTED this session (a stop doesn't count).
  // Her words: "I can hear details in audio better"; Gemini said she never plays
  // them. There was no play data at all — count instead of guessing.
  voicePlays: number;
  currentRound: number;
  currentPhase: Phase;
  currentExerciseIndex: number;
  isResting: boolean;
  timerSeconds: number;
  preCountdown: number;
  syncStatus: SyncStatus;
  startedAt: string | null;
  // Pause (Allison Jul 7 2026): step away mid-workout (e.g. "now I'm going to
  // wash some dishes") without inflating the logged duration. `pausedAt` = the
  // timestamp the CURRENT pause began (null when running); `pausedMs` = total
  // paused time this session, subtracted from duration at save. Persisted in the
  // resume snapshot so a pause survives an app close.
  pausedAt: number | null;
  pausedMs: number;
  // Lite day (Allison Jul 12 2026, from the Jul-9 deep-dive): a real mechanic for
  // low-energy / Crohn's / PMS days — one tap on pre-log drops the main block by
  // one round (A/B 3→2, C 2→1) and marks the stretch list "do what you need."
  // Same moves, same walk, streak intact. Showing up IS the win.
  liteDay: boolean;
  // Wall-sit timing capture (group 1D): when the user starts a timed wall sit
  // we stash the start timestamp here so we can compute actual held duration
  // even if she taps Done before the timer expires.
  wallSitStartedAt: number | null;
  // history-detail navigation target (group 2J)
  historyDetailId: string | null;
  // v48 · P6 (Sep 24 2026): where the Session screen's Back goes — the screen
  // that opened it (Weekly review, Sessions, or home's day dots). v47 always
  // went to the Sessions list, so a session opened from the review dropped her
  // out of the week she was reading (uxui weekly). null = Sessions.
  detailReturnTo: AppScreen | null;
  // expander state for visual layer (group 3N) — per-render; not persisted.
  videoExpandedFor: string | null;
  // collapse state for "How to do it" — collapsed by default after first-seen-this-week.
  howToOpenFor: string | null;
  // (v48 · P6: the Progress "Exercise breakdown" toggle is gone with its card.)
  // Enriched detail card (Allison Jul 9 2026): which dropdown sections are open,
  // keyed "<exercise>::<section>". Independent toggles, all closed by default so
  // the card face stays minimal — "show whats important, everything else i click
  // to open." Per-render/transient; not persisted.
  openSections: Record<string, boolean>;
  // v48 (Sep 24 2026) — the round-1 floor. True while the "Round 1 done ✓"
  // screen is up (between round 1's last main step and round 2). Her weeks are
  // 3/3 or 0; on a bad day the "stop here" choice comes mid-session, not on
  // pre-log. Persisted in the resume snapshot.
  roundBreak: boolean;
  // "Finish here — it still counts" jumped to the cool-down: the liteDay value
  // from BEFORE that tap, so Back from the cool-down can undo it honestly (back
  // to the round-break screen, not into an upper-back block she skipped).
  // null = she didn't finish here.
  finishHereLitePrev: boolean | null;
  // v48: the quit panel's "Log what I did" — the step she stopped on, saved as a
  // "stopped early at …" annotation (ux.md #8: "a half session vanishing is the
  // quiet quit"). null = she didn't stop early.
  stoppedEarlyAt: string | null;
  // v48 · fix r1 (Sep 24 2026): the liteDay value from BEFORE "Log what I did"
  // (which marks a round-1 stop as lite), so "‹ Back to the workout" undoes it
  // honestly. null = she didn't stop early.
  stoppedEarlyLitePrev: boolean | null;
  // v48: real seconds held on each hold STEP (wall sit, plank, wall lean), keyed
  // "phase|round|index" — for the "✓ held 45 s" done-face only (the saved wall
  // sit number stays wallSitSec). Transient; not in the resume snapshot.
  heldSecFor: Record<string, number>;
  // v60 (Sep 28 2026) — the SAME keying, for a hold prescribed "N ×" (today:
  // Wall lean, "2 × 15-20 sec"; hold-sets.ts's setsPrescribed generalizes to
  // any future one). One array entry per completed SET, in order; a redo
  // replaces the LAST entry (max, never erase a real one — recordHeldSet's own
  // rule, same as recordHeld's). Untouched by a single-set hold (heldSecFor
  // above keeps owning those, unchanged). v60 fix (Sep 28 2026, checker's
  // should #5): unlike heldSecFor (a live timer's display-only seconds, safe
  // to lose), this is REAL completed-set progress — a PWA killed between set
  // 1 and set 2 was losing set 1. Now carried in the resume snapshot, same as
  // setsDoneFor.
  heldSetsFor: Record<string, number[]>;
  // v48 · P5 (Sep 24 2026): the one-tap Easy / Right / Hard on the 1 kg curl
  // and the prone row — saved as arm_feel "curl=easy;row=right". The 2 kg
  // trigger is her Jul 3 ask, and until now it depended on her "telling
  // Claude" (DECISIONS §4). Optional; a step she doesn't tap stays unset.
  armFeel: ArmFeelState;
  // v58 (Sep 28 2026) — the generalized version of armFeel above, for every
  // OTHER move that stepped this week (never curl/row — those stay on
  // armFeel). Keyed by move-feel.ts's slugFor(name), so it survives whichever
  // lane a cardio step is in (walk/apartment/elliptical all slug to "ride").
  moveFeel: MoveFeelState;
  // v61 (Sep 28 2026), spec item f — her words: "I want to be able to also
  // say if it was easy, hard, right" about the ride, EVERY ride (never
  // gated on "stepped" the way moveFeel above is) — one value per session
  // (there's only ever one ride/D step), saved through move-feel.ts's
  // withOverrideFeel at buildLogEntry time, never through moveFeelString.
  rideFeel: MoveFeelValue | null;
  // v55 (Sep 27 2026) — LOAD CHIP: which weight she picked for THIS session's
  // curl / row, her own call by pain, never Lisa's ("no Lisa approval, I
  // decide based on pain", Sep 26 23:15). Defaults to whatever she used last
  // (lastUsedArmLoad reads her real logs), 1 kg if she's never logged one.
  // Folded into the same arm_feel string on save (armFeelString) for LOCAL
  // storage. v55 fix r2 (Sep 27 2026): the "no schema change" premise above
  // was wrong — the checker read the live workout_sessions.arm_feel CHECK
  // (migrations/2026-09-24-v48-session-columns.sql) and it rejected any
  // "@1kg"/"@2kg" suffix (400/23514), so fix r2 stripped it before send —
  // meaning it lived local-only and was wiped on the next sync pull (fix r3's
  // must). v55 fix r3 (Sep 28 2026): she said go; migrations/2026-09-28-v55-
  // arm-feel-load.sql widened the CHECK to accept the suffix (additive — a
  // pre-v55 row with no suffix still passes), applied live. The strip is
  // gone (see sessionPayload) — this now round-trips through Supabase like
  // every other field.
  armLoad: ArmLoadState;
  // v55 · fix r1 (Sep 27 2026): the HEAVIEST load actually tapped THIS
  // session, per key — separate from armLoad above (which is "current pick,"
  // driving the chip's on/off display and the default for her NEXT tap). Her
  // pace rule says try 2 kg on set 1, then drop back if it's too much — with
  // only armLoad, that drop-back silently erased the 2 kg attempt from the
  // save ("last tap wins"). This tracks the max instead, so "curl=easy@2kg"
  // survives even if set 2 was 1 kg. Starts equal to armLoad at session start
  // (defaultArmLoad), same convention.
  armLoadMax: ArmLoadState;
  // v54 (Sep 27 2026) — CHIP AFTER THE LAST SET: how many sets of a multi-set
  // arm-feel move (curl, prone row) she's marked done THIS visit, keyed by
  // exercise name (upperBack runs once per session — see Workout's own
  // comment — so there's only ever one visit to key against). Local/UI only,
  // never saved to Supabase; renderArmFeel reads it to hold the Easy/Right/
  // Hard chip back until the last set. Reset with armFeel each fresh session.
  setsDoneFor: Record<string, number>;
  // v48 · P5: post-log "Back: Something" was tapped — the 1-10 row is open but
  // no number is chosen yet (untouched = null). Transient.
  backSomethingOpen: boolean;
  // v48 · P7 (Sep 24 2026): the cool-down rows she has ticked, keyed by the
  // stretch group (groupStretchPairs). A place-keeper for HER list ("i dont do
  // yur stretches i do this", May 29), not tracking: never saved to Supabase,
  // nothing reads it after the session. Kept in the resume snapshot so an app
  // close mid-stretch doesn't lose her place.
  stretchTicks: Record<string, boolean>;
  // v50 · jump list (Sep 25 2026): every warm-up/main/upper-back step she has
  // tapped Done on THIS session, keyed by step-list.ts's `phase:round:index`.
  // Drives the List sheet's ✓ marks, the "N of 23" count (steps reached, not
  // position — step-list.ts's reachedCount) and the post-log skipped-count.
  // Cleared on begin/reset; persisted in the resume snapshot so an app close
  // mid-workout doesn't lose her place. Her words (Sep 25 2026): "I dont
  // always do the workouts in [order]".
  completedSteps: Record<string, boolean>;
  // v51 (Sep 25 2026) — the ride-numbers sub-screen: Done · Next on the
  // elliptical step opens it instead of advancing (her words: "I click the
  // next button and then I fill in information"). A flag on THIS step, not a
  // new step — the "N of M" count and the jump list are untouched. Cleared on
  // advancing/reset/leaving the step by any route (advanceExercise, goBack,
  // jumpToStep, beginExercises, resetState); persisted in the resume snapshot
  // so a reload on the screen restores it.
  rideNumbersOpen: boolean;
};

export type ArmFeel = 'easy' | 'right' | 'hard';
export type ArmFeelState = { curl?: ArmFeel; row?: ArmFeel };
// v58 — one slug per stepped move (move-feel.ts's slugFor), never curl/row.
export type MoveFeelState = Record<string, MoveFeelValue>;
// v55 (Sep 27 2026) — the two dumbbells she owns now; her pick, per set.
export type ArmLoad = '1kg' | '2kg';
export type ArmLoadState = { curl?: ArmLoad; row?: ArmLoad };

export type ActiveSessionSnapshot = {
  screen: AppScreen;
  selectedWorkout: AnyWorkoutId;
  capacityBefore: number;
  capacityAfter: number;
  // v50 · mood: survives an app close the same way capacity does.
  moodBefore: number;
  moodAfter: number;
  moodBeforeTouched: boolean;
  moodAfterTouched: boolean;
  wallSitSec: number;
  backPain: number;
  // v49 · engine: survives an app close the same way backPain does.
  wristPain: number;
  wristPainTouched: boolean;
  // v51: the pre-log Back & wrist reading survives an app close the same way.
  backPainBefore: number;
  backPainBeforeTouched: boolean;
  wristPainBefore: number;
  wristPainBeforeTouched: boolean;
  // T1 (Sep 27 2026): her start/finish answers survive an app close the same
  // way — beginExercises() already finalized herStartAt before 'workout' is
  // ever a resumable screen, so it's always set by the time this is written.
  herStartAt: string | null;
  herStartConfirmed: boolean;
  herEndAt: string | null;
  herEndConfirmed: boolean;
  breakMinutes: number | null;
  stepFeel: 'fine' | 'too_much' | null;
  // v46: which sliders she actually moved (see AppState). A snapshot written
  // before v46 has no flags and is read as "chosen", the way v45 saved it.
  capacityBeforeTouched: boolean;
  capacityAfterTouched: boolean;
  backPainTouched: boolean;
  word: string;
  // v45: the post-log note survives an app close (it was lost before).
  sessionNote: string;
  // v48: voice-note plays so far — an app close mid-session keeps the count.
  voicePlays: number;
  currentRound: number;
  currentPhase: Phase;
  currentExerciseIndex: number;
  startedAt: string | null;
  pausedAt: number | null;
  pausedMs: number;
  liteDay: boolean;
  // v48: an app close on the "Round 1 done ✓" screen reopens on it; a
  // finish-here and a stop-early survive a close too.
  roundBreak: boolean;
  finishHereLitePrev: boolean | null;
  stoppedEarlyAt: string | null;
  stoppedEarlyLitePrev: boolean | null; // v48 · fix r1: Back to the workout
  // v48 · P5: the arm-feel taps so far survive an app close.
  armFeel: ArmFeelState;
  // v58: same, generalized — the stepped-move feel taps survive an app close.
  moveFeel: MoveFeelState;
  // v61: the ride's own always-on feel survives an app close too.
  rideFeel: MoveFeelValue | null;
  // v55: her load pick so far survives an app close too, same as armFeel.
  armLoad: ArmLoadState;
  // v55 · fix r1: the heaviest-so-far tracker survives an app close too, same
  // reason as armLoad — see armLoadMax's own comment on AppState.
  armLoadMax: ArmLoadState;
  // v54: how many sets of a multi-set move she's marked done survive an app
  // close too, same as armFeel — an app close mid-set shouldn't reset her
  // spot back to "Set 1".
  setsDoneFor: Record<string, number>;
  // v60 fix (Sep 28 2026, checker's should #5): a multi-set HOLD's completed
  // sets (durations, not just a count) survive an app close too — see
  // AppState.heldSetsFor's own comment for why this one, unlike heldSecFor,
  // is real progress and not just a live display.
  heldSetsFor: Record<string, number[]>;
  // v48 · P7: her cool-down ticks survive an app close (she keeps her place).
  stretchTicks: Record<string, boolean>;
  // v50 · jump list: which steps she's already done survive an app close too
  // (the List sheet's ✓ marks and the "N of 23" count both read this).
  completedSteps: Record<string, boolean>;
  // v51: an app close on the ride-numbers screen reopens on it.
  rideNumbersOpen: boolean;
  // WK2 (Sep 27 2026): the plan pinned at startWorkout() — see its comment.
  // null on a pre-WK2 snapshot (nothing to pin then); getCurrentWorkout()
  // falls back to getWeekPlan() (the live "now" plan) when it's absent, same as a fresh session.
  pinnedPlanDateIso: string | null;
  // WK4 (Sep 27 2026): the resolved-key pin (post-launch sessions) — see
  // AppState.pinnedWeekKey's own comment. null on a pre-WK4 snapshot.
  pinnedWeekKey: WeekKey | null;
};

// ---------- localStorage keys (the one registry) ----------
//
// What each key holds and who writes it is told in the comments next to the code
// that uses it in app.ts; the NAMES and VALUES live only here.

export const STORAGE_KEY = 'workout-tracker:logs';
export const HOWTO_SEEN_KEY_PREFIX = 'workout-tracker:howto-seen-week-';
export const ACTIVE_SESSION_KEY = 'workout-tracker:active-session';
export const WALKS_KEY = 'workout-tracker:walks';
export const WALK_ACTIVE_KEY = 'workout-tracker:walk-active';
export const LEGACY_WALK_COUNTER_KEYS = [
  'workout-tracker:walk-meters',
  'workout-tracker:walk-steps',
];
export const WW_START_KEY = 'workout-tracker:ww-start';
export const WW_RESULT_KEY = 'workout-tracker:ww-result';
export const WW_APARTMENT_KEY = 'workout-tracker:ww-apartment';
export const WW_ELLIPTICAL_KEY = 'workout-tracker:ww-elliptical';
export const WW_ELLIPTICAL_LEVEL_KEY = 'workout-tracker:ww-elliptical-level';
export const WW_ELLIPTICAL_KM_KEY = 'workout-tracker:ww-elliptical-km';
export const WW_ELLIPTICAL_PULSE_KEY = 'workout-tracker:ww-elliptical-pulse';
export const WW_ELLIPTICAL_TIME_KEY = 'workout-tracker:ww-elliptical-time-sec';
export const WW_ELLIPTICAL_KCAL_KEY = 'workout-tracker:ww-elliptical-kcal';
export const WW_LANE_STARTED_KEY = 'workout-tracker:ww-lane-started';
export const WW_LANE_DONE_MIN_KEY = 'workout-tracker:ww-lane-done-min';
export const LAST_DONE_KEY = 'workout-tracker:last-done';
export const CYCLE_STORAGE_KEY = 'workout-tracker:cycle-periods';
export const WEEK_MOVES_STORAGE_KEY = 'workout-tracker:week-moves';
export const PACE_RULE_SEEN_KEY = 'workout-tracker:pace-rule-seen';

// Rows kept locally / asked of Supabase per pull (see app.ts's mergeRemoteSessions).
export const PULL_LIMIT = 200;

// ---------- settings ----------

// Ship 6: timing defaults — overridable via Settings screen. The constants
// remain as "defaults" only; runtime values come from getSetting().

// Timing defaults. Allison 2026-05-15 18:07: "i do not need the brakes anymore
// there doesn't need the brakes in between exercises." Default rest is now 0
// (skip). Range allows 0-180 in Settings.
export const DEFAULT_REST_SEC = 0;
export const DEFAULT_PRE_COUNT_SEC = 3;

// ---------- Ship 6 settings helpers ----------
//
// localStorage-backed per-key settings. Safe defaults: if a value is missing,
// corrupt, or out-of-range, fall back to the supplied default. NEVER crash the
// app on a bad setting value (hard rule from the brief).
export const SETTING_KEYS = {
  beeps: 'workout-tracker:setting-beeps',
  restSec: 'workout-tracker:setting-rest-sec',
  preCount: 'workout-tracker:setting-pre-count',
  howToFirstExpand: 'workout-tracker:setting-howto-first-expand',
} as const;

export function getSetting<T>(key: string, defaultValue: T): T {
  try {
    if (typeof localStorage === 'undefined') return defaultValue;
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return defaultValue;
    // Type-match against defaultValue. If types diverge (e.g. corrupt write),
    // fall back to default rather than crash.
    if (typeof parsed !== typeof defaultValue) return defaultValue;
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

export function setSetting<T>(key: string, value: T): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full / unavailable — non-fatal.
  }
}

export function getRestSec(): number {
  const v = getSetting<number>(SETTING_KEYS.restSec, DEFAULT_REST_SEC);
  if (!Number.isFinite(v) || v < 0 || v > 180) return DEFAULT_REST_SEC;
  return Math.round(v);
}

export function getPreCountSec(): number {
  const v = getSetting<number>(SETTING_KEYS.preCount, DEFAULT_PRE_COUNT_SEC);
  if (!Number.isFinite(v) || v < 0 || v > 10) return DEFAULT_PRE_COUNT_SEC;
  return Math.round(v);
}

export function getBeepsEnabled(): boolean {
  return getSetting<boolean>(SETTING_KEYS.beeps, true);
}

export function getHowToFirstExpand(): boolean {
  return getSetting<boolean>(SETTING_KEYS.howToFirstExpand, true);
}

// ---------- the state object ----------

export const state: AppState = {
  screen: 'home',
  selectedWorkout: null,
  pinnedPlanDateIso: null,
  pinnedWeekKey: null,
  capacityBefore: 5,
  capacityAfter: 5,
  // v50 · mood: blank by default (untouched), same as capacity's chips.
  moodBefore: 5,
  moodAfter: 5,
  moodBeforeTouched: false,
  moodAfterTouched: false,
  wallSitSec: 0,
  backPain: 0,
  wristPain: 0,
  wristPainTouched: false,
  wristSomethingOpen: false,
  // v51: blank by default (untouched), same as backPain/wristPain above.
  backPainBefore: 0,
  backPainBeforeTouched: false,
  backBeforeSomethingOpen: false,
  wristPainBefore: 0,
  wristPainBeforeTouched: false,
  wristBeforeSomethingOpen: false,
  herStartAt: null,
  herStartConfirmed: false,
  herStartEditingOpen: false,
  herEndAt: null,
  herEndConfirmed: false,
  herEndEditingOpen: false,
  breakMinutes: null,
  stepFeel: null,
  capacityBeforeTouched: false,
  capacityAfterTouched: false,
  backPainTouched: false,
  word: '',
  sessionNote: '',
  voicePlays: 0,
  currentRound: 1,
  currentPhase: 'warmup',
  currentExerciseIndex: 0,
  isResting: false,
  timerSeconds: 0,
  preCountdown: 0,
  syncStatus: 'syncing',
  startedAt: null,
  pausedAt: null,
  pausedMs: 0,
  liteDay: false,
  wallSitStartedAt: null,
  historyDetailId: null,
  detailReturnTo: null,
  videoExpandedFor: null,
  howToOpenFor: null,
  openSections: {},
  roundBreak: false,
  finishHereLitePrev: null,
  stoppedEarlyAt: null,
  stoppedEarlyLitePrev: null,
  heldSecFor: {},
  heldSetsFor: {},
  armFeel: {},
  moveFeel: {},
  rideFeel: null,
  armLoad: {},
  armLoadMax: {},
  setsDoneFor: {},
  backSomethingOpen: false,
  stretchTicks: {},
  completedSteps: {},
  rideNumbersOpen: false,
};

// ---------- persistence: logs and week moves ----------

// v34 (Sep 14 2026): `capacityAfter` and `backPain` may legitimately be NULL
// since v32 (a workout logged after the fact never had a post-log). This guard
// still demanded `typeof === 'number'`, so restoring a backup SILENTLY DROPPED
// every such row — her real Mon Sep 7 session would have vanished on import
// with no error shown. Found by the close's bleed check, not by a test.
function isNullableNumber(v: unknown): boolean {
  return v === null || typeof v === 'number';
}

// v48 (Sep 24 2026): the nine new fields are optional AND nullable — an export
// from before v48 has none of them and must still restore. Present → the right
// type (a hand-edited backup with junk there is refused like any other junk).
function isOptionalOf(v: unknown, type: 'number' | 'string' | 'boolean'): boolean {
  return v === undefined || v === null || typeof v === type;
}

export function isValidLogEntry(x: unknown): x is LogEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const lane = o['cardioLane'];
  return (
    typeof o['date'] === 'string' &&
    // v54 fix r1 (Sep 27 2026): 'D' (the elliptical extra) was dropped by every
    // loadLogs() read — the checker caught a saved D row vanishing on reload.
    (o['workout'] === 'A' ||
      o['workout'] === 'B' ||
      o['workout'] === 'C' ||
      o['workout'] === 'D') &&
    isNullableNumber(o['capacityBefore']) &&
    isNullableNumber(o['capacityAfter']) &&
    typeof o['wallSitSec'] === 'number' &&
    isNullableNumber(o['backPain']) &&
    (lane === undefined ||
      lane === null ||
      lane === 'walk' ||
      lane === 'apartment' ||
      lane === 'elliptical') &&
    isOptionalOf(o['cardioMinutes'], 'number') &&
    isOptionalOf(o['ellipticalLevel'], 'number') &&
    isOptionalOf(o['ellipticalKm'], 'number') &&
    isOptionalOf(o['ellipticalPulse'], 'number') &&
    isOptionalOf(o['sessionNote'], 'string') &&
    isOptionalOf(o['liteDay'], 'boolean') &&
    isOptionalOf(o['armFeel'], 'string') &&
    isOptionalOf(o['moveFeel'], 'string') &&
    isOptionalOf(o['voicePlays'], 'number') &&
    // v49 · engine: optional AND nullable, same as the v48 fields above — an
    // export from before the engine has neither key and must still restore.
    isOptionalOf(o['wristPain'], 'number') &&
    (o['stepFeel'] === undefined ||
      o['stepFeel'] === null ||
      o['stepFeel'] === 'fine' ||
      o['stepFeel'] === 'too_much') &&
    // v50 · mood: optional AND nullable, same shape — an export from before
    // v50 has neither key and must still restore.
    isOptionalOf(o['moodBefore'], 'number') &&
    isOptionalOf(o['moodAfter'], 'number') &&
    // v51: optional AND nullable, same shape — an export from before v51 has
    // neither key and must still restore.
    isOptionalOf(o['backPainBefore'], 'number') &&
    isOptionalOf(o['wristPainBefore'], 'number') &&
    // v53: optional AND boolean-typed only when present — an export from
    // before the edit feature has no key, same shape as liteDay/armFeel above.
    isOptionalOf(o['pendingEdit'], 'boolean')
  );
}

export function loadLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // v45: one malformed row used to blank the whole app (sort on a missing
    // date threw inside render). Drop what doesn't validate.
    return parsed.filter(isValidLogEntry);
  } catch {
    return [];
  }
}

// Group 1E: don't silently drop unsynced records. When the 50-entry cap is
// reached, sort so unsynced rows survive first, then keep newest synced.
// This is upsert-style merge semantics with local-newer winning — see audit
// C2 + C3. Real tombstone tracking is deferred (Session C).
export function writeLogs(logs: LogEntry[]): void {
  const sorted = [...logs].sort((a, b) => {
    const aUn = a.synced ? 1 : 0;
    const bUn = b.synced ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn; // unsynced first
    return b.date.localeCompare(a.date); // newest first
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.slice(0, PULL_LIMIT)));
}

export function loadWeekMoves(): StoredWeekMove[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(WEEK_MOVES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredWeekMove =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as StoredWeekMove).round === 'number' &&
        typeof (m as StoredWeekMove).week === 'number' &&
        typeof (m as StoredWeekMove).at === 'string'
    );
  } catch {
    return [];
  }
}

export function writeWeekMoves(moves: StoredWeekMove[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(WEEK_MOVES_STORAGE_KEY, JSON.stringify(moves));
  } catch {
    // localStorage full/unavailable — non-fatal, same as writeCyclePeriods.
  }
}

// ---- accessors that read the stores above (code-shape step 8b, Oct 14 2026) ----------
// Moved verbatim from app.ts so a screen module can call them without importing app.ts.

// Oldest → newest array of all logs. v48 · P6 (Sep 24 2026): sorted by DATE —
// the old `.reverse()` trusted storage order, and writeLogs keeps unsynced rows
// first, so a session saved offline could sit at the "latest" end of a chart.
export function getChronologicalLogs(): LogEntry[] {
  return [...loadLogs()].sort((a, b) => a.date.localeCompare(b.date));
}

// The week clock (program-week.ts) is pure: it takes logs, stored week moves and "now"
// as parameters. This gathers today's values for it from storage + the clock.
/** Everything the week clock reads, gathered from today's storage + clock. */
export function weekClockInput(
  logs: LogEntry[] = loadLogs(),
  now: Date = new Date()
): WeekClockInput {
  return { logs, moves: loadWeekMoves(), now };
}

// ---- walks + cycle periods (code-shape step 9b, Oct 14 2026: moved from app.ts verbatim; the sync modules need them) ----

export function loadWalks(): WalkEntry[] {
  try {
    const raw = localStorage.getItem(WALKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WalkEntry[];
  } catch {
    return [];
  }
}

export function writeWalks(walks: WalkEntry[]): void {
  const sorted = [...walks].sort((a, b) => {
    const aUn = a.synced ? 1 : 0;
    const bUn = b.synced ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn; // unsynced survive the cap first
    return b.date.localeCompare(a.date);
  });
  localStorage.setItem(WALKS_KEY, JSON.stringify(sorted.slice(0, 100)));
}

export function loadCyclePeriods(): StoredCyclePeriod[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CYCLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is StoredCyclePeriod =>
        !!p && typeof p === 'object' && typeof (p as StoredCyclePeriod).startDate === 'string'
    );
  } catch {
    return [];
  }
}

// The cycle periods as the pure cycle.ts logic wants them (start / source / note, no sync flag).
// Moved verbatim out of app.ts (step 12a): Home's door, Progress's door and the Your-cycle page all read it.
export function cyclePeriodsForLogic(): CyclePeriod[] {
  return loadCyclePeriods().map((p) => ({
    startDate: p.startDate,
    source: p.source,
    note: p.note,
  }));
}

export function writeCyclePeriods(periods: StoredCyclePeriod[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const sorted = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
    localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // localStorage full/unavailable — non-fatal, same as writeLogs.
  }
}
