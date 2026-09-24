// app.ts — workout-tracker
// Lead-dev pass 2026-05-15 consolidates: code-correctness fixes (timer rewrite,
// audio unlock, sync hygiene), UX restructure (Done·Next primary, Quit demoted,
// hold-to-skip rest, today's pick, week-dots, history-detail), and visual
// layer (still images + YouTube embeds + collapsible how-to).

import { EXERCISE_VISUALS } from './exercise-visuals.js';
import { EXERCISE_HOWTO, type HowToFrame } from './exercise-howto.js';
import { EXERCISE_DETAIL, muscleDiagram } from './exercise-detail.js';

type WorkoutId = 'A' | 'B' | 'C';

type Exercise = {
  name: string;
  reps?: string;
  notes?: string;
  // TIMER RULE (Allison, 2026-07-08): any exercise whose work is a SUSTAINED
  // timed hold (a single "hold N sec" — wall sit, plank, wall lean, every
  // cooldown stretch) MUST ship with BOTH `durationSec` and `isTimed: true` so
  // the app renders a countdown + "Start timer". No timed hold without a timer.
  // NOT covered by this rule (do NOT force a single countdown onto them):
  //   • per-rep micro-holds ("10 holds × 3 sec", "12 reps · 2-sec hold at top")
  //     — these are reps, not one sustained hold; they want a rep/tempo cue.
  //   • Outdoor walk — auto-tracks steps/km + "tap done", intentionally no countdown.
  //   • The cool-down LIST (v48 · P7, Sep 24 2026) — exempt by her Jun 6 call:
  //     ONE self-paced list, no timer ("About 45 s each — no timer, go by
  //     feel"). The stretches keep isTimed/durationSec on the DATA, so a
  //     per-side timer can come back if she asks for it; only the list ignores them.
  durationSec?: number;
  isTimed?: boolean;
  // v48 · fix r2 (Sep 25 2026): what she SEES as the title, when it must differ
  // from `name`. `name` stays the key (detail card, stick figure, voice note,
  // history, "last time" lookups); `label` is display only, read by
  // displayName(). First use: the Week-4 hinge held the 1 kg under the title
  // "Bodyweight hip hinge" — the same misreading class the relabel fixed.
  label?: string;
  // v48 (Sep 24 2026): the ONE line that belongs on the card face mid-set — the
  // safety rule, not the whole cue. Falls back to SAFETY_LINE by name. The full
  // `notes` moves behind a closed "Cue ▸" (47-70 words on the face, mid-set, on 7
  // of 12 moves — uxui exercise 3/5; her words: "its a bit all over the place").
  safety?: string;
  // One-time SETUP the exercise needs before the first rep — kit you have to
  // prepare, not the movement itself (v37, Sep 14 2026, her ask: "make sure
  // there s avideo and expalation" about tying the band).
  // WHY it lives on the Exercise and NOT on EXERCISE_VISUALS: the visuals and
  // detail cards are keyed by exercise NAME, so anything attached there shows up
  // on EVERY week and every workout carrying that name — including Workout C's
  // clamshells, which are bodyweight, and the Week 1/2 history. Setup is a
  // property of THIS WEEK'S PRESCRIPTION, so it hangs off the Exercise object.
  setup?: {
    title: string;
    steps: string[];
    youtubeId?: string;
    attribution?: string;
    // Shown under the steps — what to do if the setup itself is the problem.
    footnote?: string;
  };
};

type Workout = {
  id: WorkoutId;
  name: string;
  description: string;
  warmup: Exercise[];
  main: Exercise[];
  // Optional once-per-session block run AFTER main rounds, BEFORE cooldown (not
  // multiplied by rounds). Upper-back strengthening (Lisa Cohen, May 31 2026).
  upperBack?: Exercise[];
  cooldown: Exercise[];
  rounds: number;
};

type LogEntry = {
  id?: string;
  date: string;
  workout: WorkoutId;
  // null = never recorded. BEFORE-capacity goes nullable in v39: the sync used
  // to coerce a missing reading to 0 with `?? 0`, which rendered historical rows
  // as "cap 0 → 0" — and 0 is not a value this slider can produce (its range is
  // 1-10), so it was a hole wearing a number. Named in the May-14 audit, fixed
  // Sep 14 2026 on her word ("ok so fix it").
  capacityBefore: number | null;
  // null = never recorded (v32, Sep 11 2026): a workout logged after the fact
  // from a left-open snapshot has no post-log, so after-capacity and back pain
  // are unknown — shown as "—", never invented as 5/0.
  capacityAfter: number | null;
  wallSitSec: number;
  backPain: number | null;
  word: string;
  startedAt?: string;
  completedAt?: string;
  durationSec?: number;
  // In-workout walk numbers (v13, Jul 4 — her idea): the Outdoor-walk step's
  // auto-tracked minutes/steps/meters, saved WITH the session.
  walkMinutes?: number | null;
  walkSteps?: number | null;
  walkMeters?: number | null;
  // System annotations only from v48 ("duration not recorded — left open…").
  // Until v47 it also carried the cardio-lane marker ("cardio: elliptical 10 min
  // · level 7 …") and her note; older rows still do, and are read back by regex.
  notes?: string | null;
  // v48 (Sep 24 2026): real columns instead of prose in `notes` — the numbers she
  // copies off the machine come back to her as numbers (her words: "make it
  // measurable whatever you say I'm gonna copy it"). All optional: a row saved
  // before v48, or an old export, simply has none of them.
  cardioLane?: 'walk' | 'apartment' | 'elliptical' | null;
  cardioMinutes?: number | null;
  ellipticalLevel?: number | null;
  ellipticalKm?: number | null;
  ellipticalPulse?: number | null;
  // Her free-text post-log line, verbatim — never glued to a machine marker.
  sessionNote?: string | null;
  liteDay?: boolean | null;
  // "curl=easy;row=right" — the one-tap Easy/Right/Hard on the 1 kg moves (P5).
  armFeel?: string | null;
  // How many voice notes she started this session. Her words: "I can hear
  // details in audio better"; Gemini said she never plays them — count, don't guess.
  voicePlays?: number | null;
  synced?: boolean;
};

type AppScreen =
  | 'home'
  | 'pre-log'
  | 'workout'
  | 'post-log'
  | 'history'
  | 'history-detail'
  | 'weekly-review'
  | 'progress'
  | 'settings';

type Phase = 'warmup' | 'main' | 'upperBack' | 'cooldown';

// Hand routine retired 2026-05-15 per Allison. All hand-routine types,
// constants, persistence, sync, state machine, render, and event handlers
// moved to archive/hand-routine-2026-05-15/. See that folder's README.md
// for the timeline and re-enable instructions.

type SyncStatus = 'syncing' | 'synced' | 'offline';

type AppState = {
  screen: AppScreen;
  selectedWorkout: WorkoutId | null;
  capacityBefore: number;
  capacityAfter: number;
  wallSitSec: number;
  backPain: number;
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
  // v48 · P5 (Sep 24 2026): the one-tap Easy / Right / Hard on the 1 kg curl
  // and the prone row — saved as arm_feel "curl=easy;row=right". The 2 kg
  // trigger is her Jul 3 ask, and until now it depended on her "telling
  // Claude" (DECISIONS §4). Optional; a step she doesn't tap stays unset.
  armFeel: ArmFeelState;
  // v48 · P5: post-log "Back: Something" was tapped — the 1-10 row is open but
  // no number is chosen yet (untouched = null). Transient.
  backSomethingOpen: boolean;
  // v48 · P7 (Sep 24 2026): the cool-down rows she has ticked, keyed by the
  // stretch group (groupStretchPairs). A place-keeper for HER list ("i dont do
  // yur stretches i do this", May 29), not tracking: never saved to Supabase,
  // nothing reads it after the session. Kept in the resume snapshot so an app
  // close mid-stretch doesn't lose her place.
  stretchTicks: Record<string, boolean>;
};

type ArmFeel = 'easy' | 'right' | 'hard';
type ArmFeelState = { curl?: ArmFeel; row?: ArmFeel };

const STORAGE_KEY = 'workout-tracker:logs';
const HOWTO_SEEN_KEY_PREFIX = 'workout-tracker:howto-seen-week-';
// Resume support (Allison 2026-06-06): "when i leave the page i want it to open
// on the workout im in unless i exit." We snapshot the live position of an
// in-progress session so reopening the app lands back on that workout. Quitting
// or finishing clears it (those go through resetState()).
const ACTIVE_SESSION_KEY = 'workout-tracker:active-session';
// A workout is 30-60 minutes. A snapshot older than this was LEFT OPEN, not
// paused (v32, Sep 11 2026): she did Workout A on Mon Sep 7 and never tapped
// Done; the app kept the snapshot and would have dropped her straight back into
// it on the next open, days later, with no idea it was stale — and tapping
// through to Done from there is exactly what logged the Sep 2→4 "B" row as a
// 46-hour workout. Past this age the app ASKS on home (did it / throw it away /
// keep going) instead of resuming silently.
const STALE_SESSION_MS = 3 * 60 * 60 * 1000;
// Same bar at Done: a computed duration longer than this is a session that sat
// open, not a workout length. Blank it and say so in notes rather than log it.
const MAX_PLAUSIBLE_DURATION_SEC = 3 * 60 * 60;
// Ship 6: timing defaults — overridable via Settings screen. The constants
// remain as "defaults" only; runtime values come from getSetting().
// Allison 2026-05-15 18:07: "i do not need the brakes anymore there doesn't
// need the brakes in between exercises." Default rest is now 0 (skip).
// Range allows 0-180 in Settings — bump back up if she ever wants it.
const DEFAULT_REST_SEC = 0;
const DEFAULT_PRE_COUNT_SEC = 3;
const COUNT_BEEP_FROM_SEC = 3;
const HOLD_TO_SKIP_MS = 500;
const HOLD_TO_CLEAR_MS = 500;

// ---------- Ship 6 settings helpers ----------
//
// localStorage-backed per-key settings. Safe defaults: if a value is missing,
// corrupt, or out-of-range, fall back to the supplied default. NEVER crash the
// app on a bad setting value (hard rule from the brief).
const SETTING_KEYS = {
  beeps: 'workout-tracker:setting-beeps',
  restSec: 'workout-tracker:setting-rest-sec',
  preCount: 'workout-tracker:setting-pre-count',
  howToFirstExpand: 'workout-tracker:setting-howto-first-expand',
} as const;

function getSetting<T>(key: string, defaultValue: T): T {
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

function setSetting<T>(key: string, value: T): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full / unavailable — non-fatal.
  }
}

function getRestSec(): number {
  const v = getSetting<number>(SETTING_KEYS.restSec, DEFAULT_REST_SEC);
  if (!Number.isFinite(v) || v < 0 || v > 180) return DEFAULT_REST_SEC;
  return Math.round(v);
}

function getPreCountSec(): number {
  const v = getSetting<number>(SETTING_KEYS.preCount, DEFAULT_PRE_COUNT_SEC);
  if (!Number.isFinite(v) || v < 0 || v > 10) return DEFAULT_PRE_COUNT_SEC;
  return Math.round(v);
}

function getBeepsEnabled(): boolean {
  return getSetting<boolean>(SETTING_KEYS.beeps, true);
}

function getHowToFirstExpand(): boolean {
  return getSetting<boolean>(SETTING_KEYS.howToFirstExpand, true);
}

// v48 · P4 (Sep 24 2026): getAutoSuggestEnabled() retired with its toggle.
// v48 · P6 (Sep 24 2026): its SETTING_KEYS entry went too (DECISIONS §5: "no
// evidence you ever turned it off. It turns off the one thing that carries the
// app"); an old phone's stored value just sits unread.

const SUPABASE_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

// Visible build version + date+TIME (shown in the home header as "vN · Mon D, YYYY · HH:MM")
// so she can tell at a glance whether a new build actually loaded, and when.
// Her rule (Jul 1 2026): version tags carry the TIME too, not just the date.
// BUMP APP_VERSION TOGETHER WITH sw.js VERSION on every deploy
// (sw.js workout-tracker-vN ↔ APP_VERSION 'vN'); refresh BUILD_DATE to the ship date+time.
// v48 (Sep 24 2026): the home + workout redesign, P1-P8 on branch redesign-v48
// (DECISIONS-v48-2026-09-24.md). Her words: "look at home ux ui and make it
// better i feel like its a bit all over the place".
const APP_VERSION = 'v48';
const BUILD_DATE = 'Sep 24, 2026 · 19:54';

function supabaseHeaders(): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

function syncDisabled(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Per-week programming (2026-05-15) ----------
//
// Before this refactor, WORKOUTS was a single static Record<WorkoutId, Workout>
// and each week's bumps overwrote the prior week's content in git history.
// That meant: you could never look at "what did I do in Week 2?" or plan ahead
// for "what does Week 4 look like?" — they didn't exist as data.
//
// Now: PROGRAM is a list of WeekPlan rows, one per Sat-anchored week. Today's
// date selects which row is active via `getWeekPlan(date)`. Adding Week 5 is
// literally appending one more row — no other code changes needed.
//
// Rules baked in (per Allison + WEEK-3-REGROUP-2026-05-15.md):
//  - Walks STAY at 10/10/25 min strolling pace across all weeks.
//  - Cool-down stretches stay placeholder-shaped (no Claude-generated names).
//  - Week 4 forearm-plank goes 1×15 → 2×15 ONLY (no longer hold).
//  - 45-min cap per workout — see regroup doc §5.
//  - No new exercises in Week 4 — same pool as Week 3, just larger numbers.
//
// OPERATING PRINCIPLE for any future week (2026-05-24, Allison's words):
//  "we don't wanna jump too fast or too far we're growing our ability to
//   workout slowly the goal is to workout more than anything else."
//  → Adherence > intensity. ONE change per week, max. The workout itself
//    is the win. Stacking bumps (multiple axes on same session, or new
//    exercise + load bump in same week) is the failure mode. The May 21
//    Week-4 decision (hold A, bump B & C only) is the canonical example.
//  → When research recommends N additions, queue them — do not stack.
//
// Past weeks (1, 2) recovered from git history (commits bb673e9 + 66e9845).

type WeekPlan = {
  weekNum: number;
  // Which round this week belongs to (see ROUNDS). Omitted = round 1.
  // Week numbers restart at 1 inside each round.
  round?: number;
  // ISO date (YYYY-MM-DD) of the Saturday this week starts on.
  startsOn: string;
  // Optional short tag — e.g. "Starter", "Consolidation", "Bump week".
  label?: string;
  workouts: Record<WorkoutId, Workout>;
};

// "Round 2 · Week 1" for restart rounds, plain "Week 7" for round 1 — so all
// the old surfaces keep reading exactly as they always did.
function weekPlanTitle(wp: WeekPlan): string {
  return wp.round && wp.round > 1 ? `R${wp.round} · Week ${wp.weekNum}` : `Week ${wp.weekNum}`;
}

// --- Shared building blocks (so per-week deltas are obvious) -------------

const WALK_WARMUP_AB: Exercise[] = [
  {
    name: 'Outdoor walk',
    reps: '10 min',
    notes: 'Conversational pace. Doubles as warmup + cardio.',
  },
  { name: 'Belly breathing', reps: '5 slow breaths' },
  { name: 'Pelvic tilts', reps: '10 slow' },
  { name: 'Glute squeezes', reps: '10 holds × 3 sec' },
];

const WALK_WARMUP_C: Exercise[] = [
  {
    name: 'Outdoor walk',
    reps: '25 min',
    notes: 'Conversational-to-brisk pace. Tap done when finished.',
  },
];

const COOLDOWN_AB: Exercise[] = [
  { name: 'Knees-to-chest hold', reps: '60 sec' },
  { name: 'Figure-4 stretch', reps: '45 sec each side' },
  {
    name: 'Seated forward fold',
    reps: '60 sec',
    notes: 'Arms in lap, no reaching.',
  },
  { name: 'Slow breathing', reps: '8 breaths' },
];

const COOLDOWN_C: Exercise[] = [
  { name: 'Figure-4 stretch', reps: '45 sec each side' },
  { name: 'Knees-to-chest hold', reps: '60 sec' },
  { name: 'Slow breathing', reps: '8 breaths' },
];

// Allison's own stretching routine, added 2026-05-29. Replaces COOLDOWN_AB
// and COOLDOWN_C from Week 5 onward. Her words: "i dont do yur stretches i
// do this." 9 stretches, ~11 min total. Each-side stretches split into two
// timed entries so the per-side timer runs cleanly. Weeks 1-4 keep their
// original cooldowns for historical fidelity.
const STRETCH_COOLDOWN: Exercise[] = [
  {
    name: 'Wrist extension — right',
    reps: '45 sec',
    notes:
      'Right arm extended forward, palm down. Use left hand to gently pull fingers UP toward you.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Wrist extension — left',
    reps: '45 sec',
    notes:
      'Left arm extended forward, palm down. Use right hand to gently pull fingers UP toward you.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Wrist flexion — right',
    reps: '45 sec',
    notes: 'Right arm extended forward, palm down. Use left hand to gently press fingers DOWN.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Wrist flexion — left',
    reps: '45 sec',
    notes: 'Left arm extended forward, palm down. Use right hand to gently press fingers DOWN.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Neck stretch',
    reps: '45 sec',
    notes: 'Your usual neck stretch.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Shoulder stretch',
    reps: '45 sec',
    notes: 'Your usual shoulder stretch.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Leg cross — right',
    reps: '45 sec',
    notes: 'Lying on back. Right ankle on opposite knee (figure-4). Gentle hold.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Leg cross — left',
    reps: '45 sec',
    notes: 'Lying on back. Left ankle on opposite knee (figure-4). Gentle hold.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Leg up in air — right',
    reps: '45 sec',
    notes:
      'Lying on back. Right leg straight up toward ceiling. Hamstring stretch. Strap or hand on thigh if needed.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Leg up in air — left',
    reps: '45 sec',
    notes: 'Lying on back. Left leg straight up toward ceiling. Hamstring stretch.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Both knees to chest',
    reps: '45 sec',
    notes: 'Pull BOTH knees in toward chest, hands around shins.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Calf stretch on wall — right',
    reps: '45 sec',
    notes:
      'Hands on wall. Right leg back, straight, heel pressed down. Bend left front knee, lean in.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Calf stretch on wall — left',
    reps: '45 sec',
    notes:
      'Hands on wall. Left leg back, straight, heel pressed down. Bend right front knee, lean in.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Hip flexor — right knee in, left leg dangles',
    reps: '45 sec',
    notes:
      'Lie on edge of couch/bed. Pull RIGHT knee to chest with hands. Let LEFT leg dangle off the edge — the dangling leg is the stretch (front of hip).',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Hip flexor — left knee in, right leg dangles',
    reps: '45 sec',
    notes:
      'Lie on edge of couch/bed. Pull LEFT knee to chest with hands. Let RIGHT leg dangle off the edge — the dangling leg is the stretch (front of hip).',
    durationSec: 45,
    isTimed: true,
  },
  // Pec + biceps stretches — Lisa Cohen, May 31 2026 (counter the rounded-
  // shoulder / upper-crossed pattern she flagged). Wrist stays neutral.
  {
    name: 'Doorway pec stretch',
    reps: '45 sec',
    notes:
      'Stand in a doorway, forearms on the frame at shoulder height, elbows bent ~90° (an "L" / T-shape). Step one foot through slowly until you feel a stretch across the chest. Chest forward, head neutral (no chin poke), spine tall. Don\'t let elbows drop below shoulder height.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Biceps stretch — right',
    reps: '45 sec',
    notes:
      'Stand sideways to a wall, RIGHT arm nearest. Raise arm to shoulder height, rotate palm up, place it flat on the wall (fingers spread). Slowly turn your body AWAY from the wall — feel it in the biceps + front of the shoulder. This is NOT a wrist stretch: keep the wrist comfortable; if it complains, bend the elbow slightly. Stop on any wrist pain.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Biceps stretch — left',
    reps: '45 sec',
    notes:
      'Stand sideways to a wall, LEFT arm nearest. Raise arm to shoulder height, rotate palm up, place it flat on the wall (fingers spread). Slowly turn your body AWAY from the wall — feel it in the biceps + front of the shoulder. NOT a wrist stretch: keep the wrist comfortable; bend the elbow slightly if needed. Stop on any wrist pain.',
    durationSec: 45,
    isTimed: true,
  },
];

// Upper-back strengthening block — Lisa Cohen prescription, May 31 2026. Runs
// ONCE per session (not ×rounds), after the main block, in workouts A + B only
// (C stays the walk day). Starts UNLOADED — bodyweight, zero wrist load — per
// the beginner scapular progression (setting → wall slides → squeezes → THEN
// light dumbbell). The 1 kg prone row phases in at the next change point once
// these feel clean and the wrist stays quiet. Wrist neutral on everything;
// stop on any wrist signal (Lisa owns the clinical call — not logged here).
const UPPER_BACK: Exercise[] = [
  {
    name: 'Wall angels',
    reps: '2 sets · 10 slow reps',
    notes:
      "Back against the wall, ribs down, chin gently tucked. Slide both arms up the wall keeping elbows AND wrists in light contact; if the wrists lift off, stop there — no forcing. Slide back down with control. Don't shrug or arch your low back to reach higher.",
  },
  {
    name: 'Scapular squeezes',
    reps: '2 sets · 10 reps · 5-sec hold',
    notes:
      "Sit or stand tall, arms relaxed at your sides. Gently squeeze your shoulder blades together (like pinching a pencil between them), hold 5 sec, release. Feel it BETWEEN the shoulder blades — don't shrug up toward your ears. No grip; wrists fully neutral.",
  },
];

// Week-6 1 kg arm work (1 kg prone row + 1 kg biceps curl) was DEFERRED to a
// later week on 2026-06-07 — Week 6 was right-sized to one "slow" week (KEEP the
// hip-hinge + the C bump; defer the 1 kg). Week 6 A/B therefore use the shared
// bodyweight-only UPPER_BACK block (wall angels + scapular squeezes). The 1 kg
// how-to / visual / guide map entries are intentionally retained (EXERCISE_HOWTO,
// EXERCISE_VISUALS, EXERCISE_GUIDE) so re-adding the loaded moves next week needs
// no re-curation — only an UPPER_BACK_W6-style const + the upperBack wiring.

// Bilateral bodyweight hip-hinge (RDL pattern) — added to A + B main blocks in
// Week 6 (2026-06-06). The missing standing hip-dominant move; UNLOADED start
// per the self-prescribable hinge ladder (progression-rules.md). Bodyweight
// only — no load. Shared const so A and B stay identical.
const HIP_HINGE_W6: Exercise = {
  name: 'Bodyweight hip hinge',
  reps: '2 sets · 10 reps',
  notes:
    'Hinge at the hips, soft knees, flat/neutral spine — hands slide down the thighs, feel it in hamstrings + glutes. Do NOT round the low back. Bodyweight only.',
};

// Week-8 hip-hinge bump (2026-06-20): 2×10 → 2×12. Same cues as HIP_HINGE_W6;
// the hinge completed its 2-week stabilization window (W6 + W7) and earns the
// rep bump. Still bodyweight only — no load (loaded RDL stays PT-gated).
const HIP_HINGE_W8: Exercise = {
  name: 'Bodyweight hip hinge',
  reps: '2 sets · 12 reps',
  notes:
    'Hinge at the hips, soft knees, flat/neutral spine — hands slide down the thighs, feel it in hamstrings + glutes. Do NOT round the low back. Bodyweight only.',
};

// Week-7 arm work — SPLIT 2026-06-18 (Allison's call): the BICEPS CURL goes to
// 1 kg now; the PRONE ROW stays BODYWEIGHT and builds up to the 1 kg later (add
// the load only when she says she's ready). Both sit on top of the shared
// bodyweight UPPER_BACK block (wall angels + scapular squeezes). Start at the
// bottom of the range (2×12) per the progression rule — climb reps, then add
// load/harden. Wrist stays NEUTRAL on both; on the row the (eventual) weight
// HANGS from the hand — no palm/hand weight-bearing (the wrist constraint). Runs
// ONCE per session (not ×rounds) in A + B.
const UPPER_BACK_W7: Exercise[] = [
  ...UPPER_BACK,
  {
    name: 'Prone row (bodyweight)',
    reps: '2 sets · 12 reps each side',
    notes:
      'NO weight yet — building toward the 1 kg. Arm hanging, wrist NEUTRAL/straight. Keep your HEAD DOWN — do NOT lift it (Lisa, Jun 18: lifting strains the neck). Drive the elbow UP, squeeze the shoulder blade toward your spine. Lower slow. Keep the wrist straight throughout; stop on any wrist signal. Add the 1 kg only when you say you are ready.',
  },
  {
    name: '1 kg biceps curl',
    reps: '2 sets · 12 reps',
    notes:
      'Hold the weight LIGHTLY — keep wrist AND fingers neutral, never bending back / hyperextending (Lisa, Jun 18: too-heavy / over-gripping caused that — lighter is right). Elbow tucked at your side, forearm hanging. Curl the forearm up — only the forearm moves, elbow stays pinned. Lower slow. Stop on any wrist signal.',
  },
];

// 2026-06-20 — ARM WORK PAUSED (symptom-driven de-load). Allison reported new
// LEFT thumb-base pain + a possible wrist cyst (ganglion?) + right-side neck pain.
// The evidence default for new thumb/wrist overuse signs is to pull back the grip-
// and arm-loaded moves (the 1 kg biceps curl + the prone row) until her PT, Lisa
// Cohen, reviews — and KEEP the pain-free, wrist-neutral upper-back work. So A + B
// in Weeks 8-10 run wall angels + IWYT ONLY (no grip, no load). The loaded row +
// biceps pattern is preserved in UPPER_BACK_W7 + the EXERCISE_GUIDE how-tos — re-add
// it only after Lisa clears the Jun-20 symptoms. This is a protective hold, NOT a
// clinical decision (Lisa owns that). See self/health/wrists.md (Jun-20 entry).
const UPPER_BACK_SAFE: Exercise[] = [
  {
    name: 'Wall angels',
    reps: '2 sets · 10 slow reps',
    notes:
      "Back against the wall, ribs down, chin gently tucked. Slide both arms up the wall keeping elbows AND wrists in light contact; if the wrists lift off, stop there — no forcing. Slide back down with control. Don't shrug or arch your low back to reach higher.",
  },
  {
    name: 'IWYT raises',
    reps: '2 sets · 8 each (I, W, Y, T)',
    // v46: halved — the change-log (Lisa Jun 18, the I from Jul 4) lives in the
    // week label + this comment now; the card's Steps carry the letters too.
    notes:
      'Face down, forehead on a towel, thumbs up throughout (wrist neutral, no palm load). Make the letter, small lift from the upper back, one breath, lower. Hands rest on the floor between reps. I = arms along your sides · W = elbows bent to the ribs · Y = narrow V · T = out to the sides. Neck long, eyes on the towel; stop if the neck complains.',
  },
];

// Wrist weight-bearing ON-RAMP — HER call, Jul 3 2026 ("I want to start doing the
// beginning nothing intense but weight bearing on my wrist"), per the clearance-relay
// rule. Beginner rung ONLY: standing wall lean, palms flat on the wall — the gentlest
// graded palms-load there is. This is SEPARATE from the paused LOADED arm work (that
// gate is Lisa's — task resurfaces Jul 9). Higher rungs (counter-height lean, quadruped
// hands-and-knees) stay parked until she says the wall lean feels like nothing.
const WRIST_ONRAMP: Exercise[] = [
  {
    name: 'Wall lean (wrist on-ramp)',
    reps: '2 × 15-20 sec',
    // v46: halved, and ONE stop threshold across the session — bird dog, the
    // banner and this all say "pressure fine, pain = stop" (her Sep 14: "it
    // shouldn't hurt"). The Jul-3 provenance lives in the comment above.
    notes:
      'Stand a small step from a wall, palms flat on it at shoulder height, fingers up, elbows soft. Lean in gently so the palms take light weight — breathe. 15-20 sec, shake the hands out, once more. Pressure is fine; pain = stop. When this feels like nothing, say so and the next rung (counter-height lean) unlocks.',
    // Timed hold → gets a timer (TIMER RULE, 2026-07-08). 20 sec = top of the
    // 15-20 range; do 2 rounds (restart the timer for round 2, shake out between).
    durationSec: 20,
    isTimed: true,
  },
];
const UPPER_BACK_SAFE_W10: Exercise[] = [...UPPER_BACK_SAFE, ...WRIST_ONRAMP];

// WHAT: the first palms-on-floor move since April — bird dog with the LEGS only
// (both hands stay down the whole time).
// WHY: her relay Sep 7 2026, which IS the clearance under the relay rule ("stop
// referencing Lisa, I tell you Lisa", Jun 18): "i can go on my arms i just have
// to stop with pain". The measured ladder (Uhl 2003, shoulder demand as the load
// proxy) puts static quadruped at 2-11% and legs-only bird dog just above it,
// with SYMMETRIC hand load — the full bird dog (one hand lifted, 20-40%) is the
// NEXT rung, not this one. Runs at the END of the upper-back block in A + B.
// Her stop rule governs: pressure is fine, PAIN means done for the day, and the
// next morning must not be worse.
const BIRD_DOG_LEGS: Exercise = {
  name: 'Bird dog (legs only)',
  reps: '2 sets · 6 each side · 2-sec hold',
  // v46: halved — the Sep-7 provenance is in the comment above; every safety
  // line stays (pressure fine / pain = done / tomorrow not worse).
  notes:
    'Hands and knees, hands flat under the shoulders (fists, or hands up on the couch, if flat palms complain). Both hands stay down. One leg straight back to level, hold 2 sec, lower with control. Pressure is fine; pain = shake the hands out, done for today — and tomorrow must not be worse.',
};

// A + B upper-back block for R2 Week 2 — the same wrist-safe wall angels + IWYT,
// with the hands move appended at the END (last, so the wrists are warm and any
// stop-at-pain exit costs nothing else in the session).
const UPPER_BACK_SAFE_R2W2: Exercise[] = [...UPPER_BACK_SAFE, BIRD_DOG_LEGS];

// WHAT: the modified dead bug graduates — arms join the legs.
// WHY: queued as the "free win" since Jun 22 and cashed in R2 W2. Opposite arm
// reaches overhead as the opposite leg extends; the arms move IN THE AIR, so it
// stays ZERO wrist load. The low back pressed to the mat is the whole exercise —
// if it lifts, bend the knee more (shorten the lever), don't push through.
// A + B only; C deliberately stays on the modified version (C is the lighter day).
const FULL_DEAD_BUG: Exercise = {
  name: 'Full dead bug',
  reps: '8 each side',
  notes:
    'LEVEL UP from the modified version. Same tabletop start, but now the OPPOSITE ARM reaches back overhead as the leg extends. Low back pressed to the mat the WHOLE time — if it lifts, bend the knee more and shorten the range. Arms move in the air: zero weight on the wrists.',
};

// Pre-walk-warmup era (Week 1 only). Kept exact for archive fidelity — this
// is what Allison actually did her first week.
const WEEK1_WARMUP_AB: Exercise[] = [
  { name: 'Belly breathing', reps: '8 slow breaths' },
  {
    name: 'Knee-to-chest hugs',
    reps: '5 each side',
    notes: 'Forearm hook, no grip',
  },
  { name: 'Pelvic tilts', reps: '10 slow' },
  { name: 'Knee drops side-to-side', reps: '8 each way', notes: 'Small range' },
  { name: 'Glute squeezes', reps: '10 holds × 3 sec' },
];

// --- PROGRAM: weeks 1-4 --------------------------------------------------

const PROGRAM: WeekPlan[] = [
  // Week 1 — May 2-8. Starter. No walk warmups in app yet; full supine warmup.
  // Wall sit was 20s, squats 8 reps. C was a "walk + token floor work" day.
  {
    weekNum: 1,
    startsOn: '2026-05-02',
    label: 'Starter',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: 'Legs, glutes, abs. ~30 min, fully hands-free.',
        rounds: 3,
        warmup: WEEK1_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '8 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          { name: 'Glute bridges', reps: '10 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '20 sec hold',
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
            durationSec: 20,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          { name: 'Heel taps', reps: '10 each side', notes: 'Slow.' },
        ],
        cooldown: COOLDOWN_AB,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: 'Variety day. ~30 min, hands-free.',
        rounds: 3,
        warmup: WEEK1_WARMUP_AB,
        main: [
          { name: 'Side-lying leg raises', reps: '10 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '8 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_AB,
      },
      C: {
        id: 'C',
        name: 'Walk + Light Core + Stretch',
        description: 'Low-energy day still counts. ~30 min.',
        rounds: 1,
        warmup: [{ name: 'Belly breathing', reps: '8 slow breaths' }],
        main: [
          {
            name: 'Outdoor walk',
            reps: '20 min',
            notes: 'Conversational pace. Tap done when finished.',
          },
          { name: 'Glute bridges', reps: '10 reps · 2-sec hold' },
          { name: 'Modified dead bug', reps: '6 each side' },
          { name: 'Heel taps', reps: '10 each side' },
          { name: 'Figure-4 stretch', reps: '45 sec each side' },
          { name: 'Knees-to-chest hold', reps: '60 sec' },
        ],
        cooldown: [{ name: 'Slow breathing', reps: '8 breaths' }],
      },
    },
  },
  // Week 2 — May 9-15. Walk warmups added to A & B. Squats 8→10, wall sit
  // 20→25s. B side-lying leg raises 10→12. C restructured to a real cardio
  // day (25-min walk + 2-round core).
  {
    weekNum: 2,
    startsOn: '2026-05-09',
    label: 'Walk warmups',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~38 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '10 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          { name: 'Glute bridges', reps: '10 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '25 sec hold',
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
            durationSec: 25,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          { name: 'Heel taps', reps: '10 each side', notes: 'Slow.' },
        ],
        cooldown: COOLDOWN_AB,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~38 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          { name: 'Side-lying leg raises', reps: '12 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '8 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_AB,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~37 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '10 reps · 2-sec hold' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_C,
      },
    },
  },
  // Week 3 — May 16-22. Per regroup 2026-05-15:
  //  A: squats 10→12, glute bridges 10→12, wall sit 25→30s,
  //     heel taps → forearm plank (1×15s — day-1 of Lisa Cohen clearance).
  //  B: held for consolidation (already-bumped in Week 2).
  //  C: glute bridges 10→12.
  // EXACT VALUES SHIPPED to Allison earlier today (commit 66e9845) — do not
  // change this row without her sign-off.
  {
    weekNum: 3,
    startsOn: '2026-05-16',
    label: 'Forearm plank in',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~38 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '30 sec hold',
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
            durationSec: 30,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 15 sec hold',
            notes:
              'On forearms only (NOT hands — wrists still off). Start small: day-1 of Lisa Cohen clearance. Bump to 2×15 in week 4 if quiet.',
            durationSec: 15,
            isTimed: true,
          },
        ],
        cooldown: COOLDOWN_AB,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~38 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          { name: 'Side-lying leg raises', reps: '12 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '8 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_AB,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~37 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_C,
      },
    },
  },
  // Week 4 — May 23-29. DECISION 2026-05-21 (Allison, "Hold A, bump B & C"):
  // progress only where the body had headroom. Session A was hard in Week 3;
  // B & C were easy. So A HOLDS at Week-3 numbers (incl. forearm plank stays
  // 1×15s — NOT doubled), and only B & C bump. Rationale: her own program rule
  // is "change one variable at a time," and doubling a brand-new wrist-loading
  // plank after a single exposure (with no logged wrist-pain data — the app
  // only tracks back pain) was the riskiest move. Revisit A in Week 5.
  //  A: HOLD — squats 12, glute bridges 12, wall sit 30s, forearm plank 1×15s.
  //  B: side-lying leg raises 12→14, single-leg glute bridges 8→10.
  //  C: glute bridges 12→14. Walk UNCHANGED (10/10/25 strolling — see regroup).
  // Walks DO NOT bump — pace + duration rule per Allison + health.md.
  {
    weekNum: 4,
    startsOn: '2026-05-23',
    label: 'B & C bumps · A holds',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~38 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '30 sec hold',
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
            durationSec: 30,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 15 sec hold',
            notes:
              "On forearms only (NOT hands — wrists still off; forearms-not-palms is Lisa Cohen's only constraint, it's a wrist call). HELD at 1×15s for Week 4 (not doubled): consolidate the new movement first. Stop if any wrist sensation. Hold length + a 2nd set follow the normal evidence/progression rule (climb 15→~30s, then add a set) — no extra sign-off needed.",
            durationSec: 15,
            isTimed: true,
          },
        ],
        cooldown: COOLDOWN_AB,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~40 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '10 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_AB,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~37 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '14 reps · 2-sec hold' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: COOLDOWN_C,
      },
    },
  },
  // Week 5 — May 30 - Jun 5. DECISION 2026-05-29 (Allison, after careful
  // analysis): only one bump, on the safest axis. Wall sit prescription
  // 30→33s in Workout A — formalizes what her body has organically been
  // doing (33s recorded in Supabase both May 19 and May 26, 0/10 back both
  // times). B and C HOLD at Week-4 numbers — they just got bumped last week
  // and need a stabilization window. Forearm plank stays 1×15s to keep the
  // slow cadence (NOT because of any Lisa gate — Lisa never specified plank
  // amounts; her only constraint is the position, forearms-not-palms = wrist.
  // Hold length + a 2nd set follow the normal evidence/progression rule).
  // Cadence slowed: Week 5 and Week 6 will
  // be identical (2 weeks per load) — buys 6 sessions of evidence per load
  // instead of 3 before next decision. Conditional gates: if Mounjaro dose
  // changes at Jun 1 nutritionist visit, hold Week 5 = Week 4 instead.
  {
    weekNum: 5,
    startsOn: '2026-05-30',
    label: 'Wall sit 33s',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~38 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '33 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Bumped from 30s → 33s — formalizing what your body has already been doing (May 19 + May 26 both logged 33s).',
            durationSec: 33,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 15 sec hold',
            notes:
              "On forearms only (NOT hands — wrists still off; forearms-not-palms is Lisa Cohen's only constraint, a wrist call). HELD at 1×15s again for Week 5 to stay on the slow cadence. Hold length + a 2nd set follow the normal evidence/progression rule (climb 15→~30s, then add a set) — no extra sign-off needed. Stop if any wrist sensation.",
            durationSec: 15,
            isTimed: true,
          },
        ],
        upperBack: UPPER_BACK,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~40 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '10 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        upperBack: UPPER_BACK,
        cooldown: STRETCH_COOLDOWN,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~37 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '14 reps · 2-sec hold' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: STRETCH_COOLDOWN,
      },
    },
  },
  // Week 6 — Jun 6-12. DECISION 2026-06-06, RIGHT-SIZED 2026-06-07: last night's
  // build stacked too much for one "slow" week, so Week 6 was trimmed to ONE
  // real addition + the C bump. The existing loads HOLD at Week-5 numbers (wall
  // sit 33s, squats 12, forearm plank 1×15s, etc.):
  //  - A + B: add bilateral BODYWEIGHT hip-hinge (2×10) — the missing standing
  //    hip-dominant pattern, started UNLOADED per the hinge ladder. Upper-back
  //    block stays the shared bodyweight-only UPPER_BACK (wall angels + scapular
  //    squeezes). The 1 kg prone row + 1 kg biceps curl are DEFERRED to next week
  //    (their how-to/visual/guide entries are kept for zero-re-curation re-add).
  //  - C ("can be a bit more"): small bumps on the cardio day — glute bridges
  //    14→16, modified dead bug 6→8/side, calf raises 15→18. NO hip-hinge, NO
  //    1 kg (it's the walk day). The 25-min walk stays LOCKED; rounds stay 2.
  // Net change this week = hip-hinge added (A/B) + C bump; 1 kg deferred. One
  // fresh/safe pattern on top of held hard loads — the adherence-first rule is
  // honored (nothing that makes showing up heavier). After Week 6 closes
  // (~Jun 13), review the hip-hinge's tolerance + bring in the 1 kg for Week 7.
  {
    weekNum: 6,
    startsOn: '2026-06-06',
    label: 'Hip-hinge in · C bumps · 1 kg deferred',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~39 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          // New Week 6: bodyweight hip-hinge, early while fresh (leg day).
          HIP_HINGE_W6,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '33 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Held at 33s from Week 5 — stabilization week before next decision.',
            durationSec: 33,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 15 sec hold',
            notes:
              'On forearms only (NOT hands — wrists still off). HELD at 1×15s. Stop if any wrist sensation.',
            durationSec: 15,
            isTimed: true,
          },
        ],
        upperBack: UPPER_BACK,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~40 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          // New Week 6: bodyweight hip-hinge, early while fresh.
          HIP_HINGE_W6,
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '10 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        upperBack: UPPER_BACK,
        cooldown: STRETCH_COOLDOWN,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~37 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '16 reps · 2-sec hold' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '18 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: STRETCH_COOLDOWN,
      },
    },
  },
  // Week 7 — Jun 13-19. DECISION 2026-06-07: bring back the 1 kg arm work that
  // was DEFERRED out of Week 6. This is the ONLY change this week — everything
  // else HOLDS at Week-6 numbers (hip-hinge 2×10, squats 12, wall sit 33s,
  // forearm plank 1×15s, glute bridges 12, etc.; C unchanged with its Week-6
  // bumps). A + B swap the bodyweight-only UPPER_BACK block for UPPER_BACK_W7,
  // which appends 1 kg prone row (2×12) + 1 kg biceps curl (2×12) AFTER the
  // wall angels + scapular squeezes. The loaded moves start at the bottom of
  // their rep range per the progression rule — climb reps, then harden. Wrist
  // stays neutral; weight hangs on the row (no palm load). One axis this week.
  // REVISED 2026-06-18 (Allison): arm work SPLIT — biceps curl 1 kg now, prone
  // row stays BODYWEIGHT (builds toward the 1 kg, add load only when she says).
  // Wall sit formalized 33s → 36s (Jun 9 + Jun 16 both logged 36). Everything
  // else still holds. Incremental only.
  {
    weekNum: 7,
    startsOn: '2026-06-13',
    label: 'Biceps 1 kg · row bodyweight · wall sit 36',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~41 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          HIP_HINGE_W6,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '36 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Bumped 33s → 36s (2026-06-18) — formalizing what your body has already been doing (Jun 9 + Jun 16 both logged 36s). Not asking for more, just matching the number to you.',
            durationSec: 36,
            isTimed: true,
          },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side',
            notes: 'Head on mat or pillow. Bottom arm extended on floor, NOT propped on elbow.',
          },
          {
            name: 'Modified dead bug',
            reps: '6 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 15 sec hold',
            notes:
              'On forearms only (NOT hands — wrists still off). HELD at 1×15s. Stop if any wrist sensation.',
            durationSec: 15,
            isTimed: true,
          },
        ],
        upperBack: UPPER_BACK_W7,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~42 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          HIP_HINGE_W6,
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Single-leg glute bridges', reps: '10 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '6 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        upperBack: UPPER_BACK_W7,
        cooldown: STRETCH_COOLDOWN,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~37 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '18 reps · 2-sec hold' },
          { name: 'Side-lying clamshells', reps: '10 each side' },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '18 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: STRETCH_COOLDOWN,
      },
    },
  },
  // Week 8 — Jun 20-26. REWRITTEN 2026-06-18 (deep-dive "apply everything", Stage 1):
  // un-stick the safe bodyweight numbers that had fossilized — the live data was a
  // green light (~20/20 adherence, back 0/10 x15, capacity 9-10). All the SAME
  // movements, just letting them climb; NO new patterns this week (those phase into
  // W9-W11 one at a time).
  //  - A: squats 12 → 14 (held since W3); forearm plank 15 → 20s (her own notes
  //    said to climb it, not Lisa-gated); dead bug 6 → 8.
  //  - Clamshells DE-DUPED: were in A+B+C (worst redundancy); now kept ONLY in B
  //    (bumped 10 → 12), dropped from A and C.
  //  - B: dead bug 6 → 8. C: clamshells removed (recovery day stays light).
  //  - Hip-hinge stays 2×12; arms stay UPPER_BACK_W7 (now carrying Lisa's Jun-18
  //    head-down + light-grip cues). Wall sit holds 36s.
  {
    weekNum: 8,
    startsOn: '2026-06-20',
    label: 'Un-stick: squats 14 · plank 20s · dead bug 8',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~42 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '14 reps · 3-1-3 tempo',
            notes:
              'Arms crossed over chest. Wall behind shoulder if balance wobbly. Bumped 12 → 14 (held at 12 since Week 3; back 0/10 throughout).',
          },
          HIP_HINGE_W8,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '36 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Held at 36s from Week 7 — 2-week window at this load before the next bump.',
            durationSec: 36,
            isTimed: true,
          },
          {
            name: 'Modified dead bug',
            reps: '8 each side',
            notes:
              'Arms relaxed at sides on mat. Move only legs. Bumped 6 → 8 (stuck at 6 for 9 weeks).',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 20 sec hold',
            notes:
              'On forearms only (NOT hands — wrists still off). Climbing 15 → 20s (Jun 18 — progression-rules said to climb it; back 0/10). Building toward 30s, then a 2nd set. Stop if any wrist sensation.',
            durationSec: 20,
            isTimed: true,
          },
        ],
        upperBack: UPPER_BACK_SAFE,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~43 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          HIP_HINGE_W8,
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '12 each side' },
          { name: 'Single-leg glute bridges', reps: '10 each side' },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        upperBack: UPPER_BACK_SAFE,
        cooldown: STRETCH_COOLDOWN,
      },
      C: {
        id: 'C',
        name: 'Walk + Core (cardio day)',
        description: '🚶 25-min walk + 2-round core block · ~36 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          { name: 'Glute bridges', reps: '18 reps · 2-sec hold' },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '18 reps',
            notes: 'Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: STRETCH_COOLDOWN,
      },
    },
  },
  // Week 9 — Jun 27 - Jul 3. REVISED 2026-06-29 (post full program audit — her call to
  // ACCELERATE past the slow one-change plan: bumps across A + B AND a 3-exercise jump on C).
  // Arms STILL paused (UPPER_BACK_SAFE — wall angels + IWYT, no grip/load) pending Lisa's
  // Jun-20 thumb/wrist/neck review. Every addition below is wrist-neutral + back-safe, and
  // all are moves she already knows from A/B (no new motor learning).
  //  - A: unfreeze the frozen numbers → wall sit 36 → 40s; forearm plank 25 → 30s; dead
  //    bug 8 → 10. (Squats stay 14; hip hinge held; arms paused.)
  //  - B: single-leg glute bridges 10 → 12; dead bug 8 → 10.
  //  - C: was the runt — now a real 3rd strength day. THREE new things: + bodyweight squats
  //    12 (the standing compound C lacked — #1 muscle-preservation move), + single-leg glute
  //    bridge 8/side (audit's "best glute move"), + side-lying leg raises 12 (added earlier
  //    same day). Calf raises last set near-failure (the audit's effort lever). Still 2 rounds.
  //  - Mirror (her rulebook's own line): if this makes showing up feel heavier, dial back —
  //    the streak is the asset; governor stays "did I still show up 3×". Full audit + rollout:
  //    self/health/workout-program-audit-2026-06-29.md.
  {
    weekNum: 9,
    startsOn: '2026-06-27',
    label: 'Bigger week: A/B bumps + C → 3-exercise strength day',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~45 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '14 reps · 3-1-3 tempo',
            notes:
              'Arms crossed over chest. Wall behind shoulder if balance wobbly. Held at 14 from Week 8.',
          },
          HIP_HINGE_W8,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '40 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Bumped 36 → 40s (2026-06-29; held at 36 since Wk7 — cap is 45-60s per progression-rules.md).',
            durationSec: 40,
            isTimed: true,
          },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            notes:
              'Arms relaxed at sides on mat. Move only legs. Bumped 8 → 10 (2026-06-29; was frozen at 8 — climbing toward the 12 cap).',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 30 sec hold',
            notes:
              'On forearms only (NOT hands — wrists still off). Climbing 25 → 30s (2026-06-29). At a clean 30s → add a 2nd set. Stop if any wrist sensation.',
            durationSec: 30,
            isTimed: true,
          },
        ],
        upperBack: UPPER_BACK_SAFE,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~46 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          HIP_HINGE_W8,
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '12 each side' },
          {
            name: 'Single-leg glute bridges',
            reps: '12 each side',
            notes: 'Bumped 10 → 12 (2026-06-29; toward the 15/side cap).',
          },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            notes: 'Bumped 8 → 10 (2026-06-29; toward the 12 cap).',
          },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        upperBack: UPPER_BACK_SAFE,
        cooldown: STRETCH_COOLDOWN,
      },
      C: {
        id: 'C',
        name: 'Walk + Lower Body + Core',
        description: '🚶 25-min walk + 2-round strength block · ~46 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes:
              "NEW 2026-06-29: C's biggest gap was zero standing leg strength — squats are the #1 muscle-preservation move. Start 12 (below A's 14 since C is the lighter day). Arms crossed; wall behind shoulder if wobbly.",
          },
          { name: 'Glute bridges', reps: '18 reps · 2-sec hold' },
          {
            name: 'Single-leg glute bridges',
            reps: '8 each side',
            notes:
              "NEW 2026-06-29: single-leg glute work (the audit's 'best glute move'). Start 8/side (below B's 12 — fresh slot). Climb toward 15, then tempo / foot-elevated per progression-rules.md.",
          },
          {
            name: 'Side-lying leg raises',
            reps: '12 each side',
            notes:
              'Added 2026-06-29 (meatier-Friday). Lateral-hip work C never had — back-gentle, no balance. Climb toward the 20/side cap, then ankle band / longer lever.',
          },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '18 reps',
            notes:
              "Last set near failure (0-2 reps left) — the audit's one move to push genuinely hard. Fingertip touch on wall for balance only — NO grip.",
          },
        ],
        cooldown: STRETCH_COOLDOWN,
      },
    },
  },
  // Week 10 — Jul 4-10. Carries forward W9's bigger week (A/B bumps + C as a 3-exercise
  // strength day) so nothing regresses, AND adds its own one new pattern: the ECCENTRIC
  // STEP-DOWN on A — highest-value wrist-free move for her "agile + strong for summer hikes"
  // goal (~75% of hiking injuries happen on the DESCENT, where quads work eccentrically to
  // control each step down). No wrist load, no hands.
  // Jul-3 additions (her calls, same day): wall sit 40→45s (she held 43s on Jul 1 — the plan
  // catches up to her) + WRIST_ONRAMP wall lean appended to the A/B safe block (her relay:
  // start beginner wrist weight-bearing, nothing intense). Arms STILL paused (UPPER_BACK_SAFE)
  // until Lisa reviews the Jun-20 thumb/wrist/neck symptoms. QUEUED for later weeks, one at a
  // time, all wrist-neutral: band chest press (the missing push), band Pallof press / forearm-
  // looped row (anti-rotation + the missing pull) once Lisa clears arms + bands arrive. Separate
  // from the app — the #1 lever for keeping muscle on Mounjaro is PROTEIN toward ~112-130 g/day
  // (currently ~half that) — see body-measurements.md for the tracking that makes it visible.
  {
    weekNum: 10,
    startsOn: '2026-07-04',
    label: 'Step-downs in · W9 bigger-week numbers carried',
    workouts: {
      A: {
        id: 'A',
        name: 'Lower Body + Core',
        description: '🚶 10-min walk + lower body strength · ~48 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '14 reps · 3-1-3 tempo',
            notes:
              'Arms crossed over chest. Wall behind shoulder if balance wobbly. Held at 14 from Week 8.',
          },
          HIP_HINGE_W8,
          {
            name: 'Eccentric step-down',
            reps: '2 sets · 5 each leg',
            notes:
              "NEW (Jun-20 research): the downhill-hiking move. Stand on a low, sturdy step with your weight on ONE leg; let the other foot hang just off the edge. SLOWLY lower the hanging heel toward the floor over 3-4 seconds — control it, don't drop — then drive back up through the standing leg. Light fingertip touch on a wall/rail for balance ONLY — no grip, no weight on the hand (wrist stays out of it). Keep the standing knee tracking over the toes, not caving in. Start with a low step and small range; the slow lowering is the work. Stop the set if the knee pinches.",
          },
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '45 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Bumped 40→45s (Jul 3): you held 43s on Jul 1, so the plan catches up to you + a small nudge. Cap 45-60s — graduate at a clean 60s.',
            durationSec: 45,
            isTimed: true,
          },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            notes: 'Arms relaxed at sides on mat. Move only legs. Carried 10 from Week 9 (cap 12).',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 30 sec hold',
            notes:
              'On forearms only (NOT hands — wrists still off). Carried 30s from Week 9 — at a clean 30s add a 2nd set. Stop if any wrist sensation.',
            durationSec: 30,
            isTimed: true,
          },
        ],
        upperBack: UPPER_BACK_SAFE_W10,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~46 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          HIP_HINGE_W8,
          { name: 'Side-lying leg raises', reps: '14 each side' },
          { name: 'Side-lying clamshells', reps: '12 each side' },
          {
            name: 'Single-leg glute bridges',
            reps: '12 each side',
            notes: 'Carried 12 from Week 9 (toward the 15/side cap).',
          },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            notes: 'Carried 10 from Week 9 (toward the 12 cap).',
          },
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Light fingertip touch on wall for balance only — NO grip.',
          },
        ],
        upperBack: UPPER_BACK_SAFE_W10,
        cooldown: STRETCH_COOLDOWN,
      },
      C: {
        id: 'C',
        name: 'Walk + Lower Body + Core',
        description: '🚶 25-min walk + 2-round strength block · ~46 min',
        rounds: 2,
        warmup: WALK_WARMUP_C,
        main: [
          {
            name: 'Bodyweight squats',
            reps: '12 reps · 3-1-3 tempo',
            notes:
              'Carried from Week 9. The standing compound C had lacked. Arms crossed; wall behind shoulder if wobbly.',
          },
          { name: 'Glute bridges', reps: '18 reps · 2-sec hold' },
          {
            name: 'Single-leg glute bridges',
            reps: '8 each side',
            notes: 'Carried from Week 9. Climb toward 15, then tempo / foot-elevated.',
          },
          {
            name: 'Side-lying leg raises',
            reps: '12 each side',
            notes:
              'Carried from Week 9. Climb toward the 20/side cap, then ankle band / longer lever.',
          },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '18 reps',
            notes:
              'Last set near failure (0-2 reps left) — the one move to push genuinely hard. Fingertip touch on wall for balance only — NO grip.',
          },
        ],
        cooldown: STRETCH_COOLDOWN,
      },
    },
  },
];

// Week 11 — Jul 18-24 2026. Resume after the sick week (Jul 11-17, left blank —
// the program clock paused, see SKIPPED_WEEKS). Reuses Week 10's workout objects
// on purpose: she missed that week, so the same programming rolls forward.
// No level-up until this week actually happens (check-in ~Jul 25).
PROGRAM.push({
  weekNum: 11,
  startsOn: '2026-07-18',
  label: 'Resume — W10 carried after sick week',
  workouts: PROGRAM.find((wp) => wp.weekNum === 10)!.workouts,
});

// ======================= ROUND 2 =======================
// Aug 29 2026 → . The restart after the summer break (5 Break weeks + the
// unrun Week 11 close out Round 1 — all of it stays browsable above).
// Design brief, her words Aug 30: "compact so I keep coming back" · "not too
// easy but it shouldn't be too hard" · back to 3×/week. So: the same known
// A/B/C moves, 2 rounds instead of 3, numbers at roughly 75-80% of the
// Week-10 peaks — restart numbers, not a new ceiling; climb back per
// progression-rules.md as sessions land clean. Eccentric step-down + supine
// bicycle are QUEUED to return in later R2 weeks (one change at a time).
// Arms STILL paused (UPPER_BACK_SAFE — no grip, no load) and the wrist
// on-ramp is parked too, until she relays what Lisa cleared at the last
// session. The walk steps stay skippable (explicit Start since v22).
//
// Sep 7 2026 — her relay: "i can go on my arms i just have to stop with pain"
// → palms-on-floor opened at beginner rung (bird dog legs-only, both hands
// down). Loaded/gripped arm work still gated.
PROGRAM.push({
  round: 2,
  weekNum: 1,
  startsOn: '2026-08-29',
  label: 'Round 2 — compact restart',
  workouts: {
    A: {
      id: 'A',
      name: 'Lower Body + Core',
      description: 'Compact restart · 2 rounds · ~30 min (walk optional)',
      rounds: 2,
      warmup: WALK_WARMUP_AB,
      main: [
        {
          name: 'Bodyweight squats',
          reps: '12 reps · 3-1-3 tempo',
          notes:
            'Restart at 12 (you were at 14 before the break). Arms crossed over chest; wall behind shoulder if balance wobbly.',
        },
        HIP_HINGE_W8,
        { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
        {
          name: 'Wall sit',
          reps: '35 sec hold',
          // Sep 24 2026, v48 P8: "streak" → "showing up" (DECISIONS §5: the word
          // is gone from the UI; there's no streak to break). Meaning unchanged.
          notes:
            "Restart at 35s (you held 45s pre-break — don't chase the old number; showing up is the asset). Hands rest on thighs or hang. No pushing on wall.",
          durationSec: 35,
          isTimed: true,
        },
        {
          name: 'Modified dead bug',
          reps: '8 each side',
          notes: 'Arms relaxed at sides on mat. Move only legs. Restart at 8 (was 10).',
        },
        {
          name: 'Forearm plank',
          reps: '1 set · 20 sec hold',
          notes:
            'On forearms only (NOT hands — wrists still off). Restart at 20s (was 30). Stop if any wrist sensation.',
          durationSec: 20,
          isTimed: true,
        },
      ],
      upperBack: UPPER_BACK_SAFE,
      cooldown: STRETCH_COOLDOWN,
    },
    B: {
      id: 'B',
      name: 'Glutes + Mobility + Core',
      description: 'Compact restart · 2 rounds · ~30 min (walk optional)',
      rounds: 2,
      warmup: WALK_WARMUP_AB,
      main: [
        HIP_HINGE_W8,
        { name: 'Side-lying leg raises', reps: '12 each side', notes: 'Restart at 12 (was 14).' },
        { name: 'Side-lying clamshells', reps: '10 each side', notes: 'Restart at 10 (was 12).' },
        {
          name: 'Single-leg glute bridges',
          reps: '10 each side',
          notes: 'Restart at 10 (was 12; toward the 15/side cap once sessions land clean).',
        },
        {
          name: 'Modified dead bug',
          reps: '8 each side',
          notes: 'Restart at 8 (was 10). Supine bicycle returns in a later week.',
        },
        {
          name: 'Standing calf raises',
          reps: '12 reps',
          notes: 'Light fingertip touch on wall for balance only — NO grip.',
        },
      ],
      upperBack: UPPER_BACK_SAFE,
      cooldown: STRETCH_COOLDOWN,
    },
    C: {
      id: 'C',
      name: 'Walk + Lower Body + Core',
      description: '🚶 25-min walk + compact 2-round strength block · ~40 min',
      rounds: 2,
      warmup: WALK_WARMUP_C,
      main: [
        {
          name: 'Bodyweight squats',
          reps: '10 reps · 3-1-3 tempo',
          notes: 'Restart at 10 (was 12). Arms crossed; wall behind shoulder if wobbly.',
        },
        { name: 'Glute bridges', reps: '15 reps · 2-sec hold', notes: 'Restart at 15 (was 18).' },
        {
          name: 'Single-leg glute bridges',
          reps: '8 each side',
          notes: 'Held at 8/side. Climb toward 15, then tempo / foot-elevated.',
        },
        {
          name: 'Side-lying leg raises',
          reps: '10 each side',
          notes: 'Restart at 10 (was 12; the 20/side cap still stands).',
        },
        { name: 'Modified dead bug', reps: '8 each side' },
        {
          name: 'Standing calf raises',
          reps: '15 reps',
          notes:
            'Restart at 15 (was 18). Last set near failure (0-2 reps left) — the one move to push genuinely hard. Fingertip touch on wall for balance only — NO grip.',
        },
      ],
      cooldown: STRETCH_COOLDOWN,
    },
  },
});

// --- ROUND 2 · WEEK 2 — Sep 5-11 2026 ------------------------------------
// WHAT: harder VERSIONS at the same reps. Three real changes (forearm plank
// WITH a posterior pelvic tilt · modified → full dead bug in A+B · bird dog
// legs-only, the hands move) + one form dial (wall sit deeper, not longer) +
// the effort dial (last round stops ~2 reps short, not 6). Still 2 rounds,
// ~30 min. Rep counts are UNCHANGED from Week 1 on purpose.
// WHY: her ask Sep 7, verbatim — "i want to go up a level nothing crazy but i
// can start to work alittle harder" and, crucially, "ok but its not always
// about adding its abut tehactual execrises". Her own Jun-29 rule says the
// same: "once it gets to a certain level … don't be dumb go to the next level
// change the exercise." The tempo dial is spent (her 3-1-3 squat is a 7-second
// rep; hypertrophy is flat from 0.5-8 s/rep, Schoenfeld 2015) and the rep caps
// are close, so VARIATION is the road left. Week 1 earned it: 3/3 sessions,
// back 0/10 ×3, capacity 5→5, wall sit 38 s against a 35 s target.
// Evidence for the two harder holds: Schoenfeld 2014 — a plank held WITH a
// posterior pelvic tilt roughly DOUBLES abdominal activity at the same
// duration; and the wall sit gains more from a deeper knee angle than from a
// longer hold.
// PACE GUARD (unchanged): ONE new movement per week. This week's is the hands
// one. UPDATED Sep 7 15:04-15:09 — she confirmed the TheraBand kit IS home, then
// four messages later said "dont raise too fast", so the band clamshell was HELD
// and the road shifted one week: Week 3 = yellow band on the clamshells, Week 4 =
// split squat, Week 5 = single-leg calf raise. None of them encoded here — the
// app deliberately holds one week at a time. Spec:
// second-brain/self/health/research/2026-09-07-1500-level-up-PLAN.md
PROGRAM.push({
  round: 2,
  weekNum: 2,
  startsOn: '2026-09-05',
  label: 'Round 2 — Week 2 · harder versions, not reps',
  workouts: {
    A: {
      id: 'A',
      name: 'Lower Body + Core',
      description: 'Harder versions, same reps · 2 rounds · ~30 min (cardio optional)',
      rounds: 2,
      warmup: WALK_WARMUP_AB,
      main: [
        {
          name: 'Bodyweight squats',
          reps: '12 reps · 3-1-3 tempo',
          notes:
            'Same 12 as last week — the change is EFFORT: on the LAST round stop about 2 reps short, not 6. Never to failure. Arms crossed over chest; wall behind shoulder if balance wobbly.',
        },
        HIP_HINGE_W8,
        { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
        {
          name: 'Wall sit',
          reps: '40 sec hold',
          notes:
            'DEEPER, not longer — slide down until the knees come toward 90°. You held 38 s last week, so seconds are not the point this week; the angle is. Hands rest on thighs or hang. No pushing on the wall.',
          durationSec: 40,
          isTimed: true,
        },
        FULL_DEAD_BUG,
        {
          name: 'Forearm plank',
          reps: '1 set · 20 sec hold',
          notes:
            'SAME 20 sec, roughly DOUBLE the work: hold it WITH a posterior pelvic tilt — tuck the tailbone under, squeeze the glutes, ribs down. Forearms only, NOT hands. Stop if any wrist sensation.',
          durationSec: 20,
          isTimed: true,
        },
      ],
      upperBack: UPPER_BACK_SAFE_R2W2,
      cooldown: STRETCH_COOLDOWN,
    },
    B: {
      id: 'B',
      name: 'Glutes + Mobility + Core',
      description: 'Harder versions, same reps · 2 rounds · ~30 min (cardio optional)',
      rounds: 2,
      warmup: WALK_WARMUP_AB,
      main: [
        HIP_HINGE_W8,
        {
          name: 'Side-lying leg raises',
          reps: '12 each side',
          notes:
            'Your best glute-med move (81% MVIC, best of 12 tested — DiStefano 2009), so it stays exactly as it is. The change is EFFORT: last round stop about 2 reps short, not 6.',
        },
        {
          name: 'Side-lying clamshells',
          reps: '10 each side',
          notes:
            'Bodyweight this week. The TheraBand kit IS home (you confirmed Sep 7) — the yellow band loops around the thighs starting WEEK 3, not now. Your words the same minute: "dont raise too fast."',
        },
        {
          name: 'Single-leg glute bridges',
          reps: '10 each side',
          notes:
            'Already the hard version — the small dial this week is a 2-3 sec SQUEEZE at the top of every rep.',
        },
        FULL_DEAD_BUG,
        {
          name: 'Standing calf raises',
          reps: '12 reps',
          notes: 'Light fingertip touch on wall for balance only — NO grip.',
        },
      ],
      upperBack: UPPER_BACK_SAFE_R2W2,
      cooldown: STRETCH_COOLDOWN,
    },
    C: {
      id: 'C',
      name: 'Walk + Lower Body + Core',
      description: '🚶 25-min cardio + 2-round strength block · ~40 min',
      rounds: 2,
      warmup: WALK_WARMUP_C,
      main: [
        {
          name: 'Bodyweight squats',
          reps: '10 reps · 3-1-3 tempo',
          notes:
            'C stays the lighter day — 10, not 12. Last round: stop about 2 reps short, not 6. Arms crossed; wall behind shoulder if wobbly.',
        },
        { name: 'Glute bridges', reps: '15 reps · 2-sec hold' },
        {
          name: 'Single-leg glute bridges',
          reps: '8 each side',
          notes: 'Small dial: 2-3 sec squeeze at the top of every rep.',
        },
        { name: 'Side-lying leg raises', reps: '10 each side' },
        {
          name: 'Modified dead bug',
          reps: '8 each side',
          notes:
            'C stays MODIFIED on purpose (legs only, arms resting) — the full dead bug lives in A and B this week.',
        },
        {
          name: 'Standing calf raises',
          reps: '15 reps',
          notes:
            'Last set near failure (0-2 reps left) — the one move to push genuinely hard. Fingertip touch on wall for balance only — NO grip.',
        },
      ],
      cooldown: STRETCH_COOLDOWN,
    },
  },
});

// --- Round 2 Week 3 — Sat Sep 12 to Fri Sep 18 2026 ------------------------
//
// WHAT: Week 2 held EXACTLY, with ONE change — the yellow TheraBand goes around
// the thighs on the clamshells in Workout B.
// WHY: her word Mon Sep 14 2026, 09:46 — "build week 3". This is the one new
// thing the Sep-7 road put here, and it was held back from Week 2 on her own
// "dont raise too fast" (Sep 7 15:09). The band is LOOPED, so there is nothing
// to grip and nothing on the hands — the grip-and-hold gate stays shut.
// Reps do NOT go up: the load is the change, so it resets at 10/side and climbs
// to 15 over the coming weeks before the red band. Her rule since Jun 29: once a
// move tops out, change the exercise, don't pile on reps.
//
// WHAT IS DELIBERATELY NOT IN THIS WEEK:
//  - The bird dog stays LEGS ONLY. The road gates the opposite-arm version on
//    legs-only feeling "like nothing"; her word after two sessions was "good"
//    (Sep 11) with clean mornings. Good is not nothing, so the gate holds.
//  - Split squat (Week 4) and single-leg calf raise (Week 5) stay unencoded —
//    the app holds one week at a time, on purpose.
//  - Nothing gripped or loaded in the hands YET. Her relay the same afternoon
//    ("baisclaly it shold nt hurt") opened that gate pain-gated, but the re-entry
//    is set for Week 4 and starts BELOW the old 1 kg — the Jun-18 injury mechanism
//    was the grip itself.
//  - The HANDS plank is still OUT, and she settled that herself at 13:08:
//    "plank on forearms still" / "but can do stuff on forearms". So forearm
//    loading is open and the palms-down plank stays on the shelf — her own Sep-7
//    ladder puts it at the top (counter lean -> quadruped -> bird dog legs-only ->
//    full bird dog -> incline push-up -> plank on hands) and she is on rung 3.
//    What "planks come back in" therefore means: the forearm plank was in A ONLY
//    for all of Round 1 and Round 2 so far; it now runs in B as well.
// PACE GUARD: one new movement per week. This week's is the band. The wall lean
// and the second forearm plank are a RETURN and a REPEAT of moves she already
// does — not new levels. Nothing on the palms changed.
// Spec: second-brain/self/health/research/2026-09-07-1500-level-up-PLAN.md (THE ROAD).
// The WALL LEAN COMES BACK (v41, her word Mon Sep 14 13:07: "ok but planks come
// back in and the wall learn"). It is the same `WRIST_ONRAMP` she ran from Jul 3,
// unchanged — palms flat on a wall, standing, 2 × 20 s, timer included.
//
// WHY it is safe to add in the same week as the band, when the pace rule says one
// new movement: it is not a level-up. On the measured ladder (Uhl 2003, shoulder
// demand as the load proxy) the wall lean sits BELOW the legs-only bird dog she is
// already doing — so this adds wrist-specific VOLUME, not intensity. It is also
// exactly what she asked for two messages earlier: "i stil need to build up wirst
// weight." It runs last in the block, after the bird dog, so a stop-at-pain exit
// costs nothing else in the session.
const UPPER_BACK_SAFE_R2W3: Exercise[] = [...UPPER_BACK_SAFE, BIRD_DOG_LEGS, ...WRIST_ONRAMP];

const R2W2_PLAN = PROGRAM[PROGRAM.length - 1]!;
// A's forearm plank, reused verbatim in B (v41). Pulled from the Week 2 plan
// rather than retyped: if the plank prescription changes, both workouts move
// together. Throws loudly at load time if A's plank is ever renamed.
const R2W3_FOREARM_PLANK: Exercise = (() => {
  const found = R2W2_PLAN.workouts.A.main.find((ex) => ex.name === 'Forearm plank');
  if (!found) throw new Error('R2W3: expected a Forearm plank in Week 2 workout A');
  return found;
})();

const R2W3_BAND_CLAMSHELL: Exercise = {
  // Name is UNCHANGED on purpose: the detail card, the exercise illustration and
  // the recorded voice note are all keyed to this exact string. The band is the
  // prescription, not a different exercise.
  name: 'Side-lying clamshells',
  reps: '10 each side · yellow band (tied into a loop)',
  // Her ask, Sep 14 11:43, right after she spotted that her bands are flat
  // strips: "make sure there s avideo and expalation". The movement video
  // (Margaret Martin, PT) already sits on the exercise itself — this is the
  // SETUP video, a different thing: how to turn a flat strip into a loop.
  // Channel checked live via YouTube oEmbed on Sep 14 (exists + embeddable +
  // title/author as quoted). NOT watched end to end — so it is offered as a
  // demonstration, not endorsed frame by frame.
  setup: {
    title: 'Tie the band into a loop (one time)',
    steps: [
      'Take the <strong>yellow</strong> one, laid flat.',
      "Overlap the two ends about <strong>a hand's width</strong>, then tie a <strong>double square knot</strong> — a shoelace bow with the ends pulled all the way through.",
      'Size it to sit <strong>just above your knees</strong>, only just snug with your knees together. Already tight before you move? Retie it bigger.',
      'Knot to the <strong>outside</strong> of your top thigh. Then leave it tied — this is a one-time job.',
    ],
    youtubeId: 'ESNXHhPdIos',
    attribution: 'Total Therapy Florida (physical therapy)',
    footnote:
      'Tying it is not the gripping gate — a tied loop needs no hands while you move. Tug the knot before each set.',
  },
  // Notes stay SHORT and about the MOVEMENT: the tying lives in `setup` above,
  // and the movement cues live in the detail card. The tying
  // lives in `setup`. Measured on her phone Sep 14: the first draft of this
  // step ran 933 px on a 915 px screen — a wall of text she would not read.
  notes:
    'NEW: the band goes on — tie it first (just below). Same movement as always. <strong>10 each side, not 15</strong> — the band is the increase. If your hips roll backward to get the knee higher, the band is too strong for now: slide it lower down your thighs, or take it off and finish bodyweight. That is the right call, not a failure.',
};
PROGRAM.push({
  round: 2,
  weekNum: 3,
  startsOn: '2026-09-12',
  label: 'Round 2 — Week 3 · the band goes on the clamshells',
  workouts: {
    // A keeps Week 2's exercises; only the upper-back block changes (wall lean back).
    A: { ...R2W2_PLAN.workouts.A, upperBack: UPPER_BACK_SAFE_R2W3 },
    B: {
      ...R2W2_PLAN.workouts.B,
      description: 'Same as last week + the band on the clamshells + the wall lean back · ~30 min',
      main: [
        ...R2W2_PLAN.workouts.B.main.map((ex) =>
          ex.name === 'Side-lying clamshells' ? R2W3_BAND_CLAMSHELL : ex
        ),
        // "planks come back in" (13:07) + "plank on forearms still" (13:08).
        // B has never carried a plank — A has had the only one since Week 1. This
        // is A's exact entry, reused rather than retyped so the two cannot drift.
        R2W3_FOREARM_PLANK,
      ],
      upperBack: UPPER_BACK_SAFE_R2W3,
    },
    C: { ...R2W2_PLAN.workouts.C },
  },
});

// ---------------------------------------------------------------------------
// ROUND 2 · WEEK 4 (Sat Sep 19 – Fri Sep 25 2026) — v42, built Sat Sep 19 22:30.
// Her brief tonight, in order: "so les get week 4 ready" → "weigh and consider
// where it should be not elipticla yet" → "just condsider whats worth raising".
// Two RAISES, two CATCH-UPS, everything else HOLDS. Trail + evidence:
//   second-brain/self/health/exercise.md (Sep 19 status line)
//   second-brain/self/health/progression-rules.md (the earn-then-nudge rule)
//
// RAISE 1 — the SUPPORTED SPLIT SQUAT replaces the bodyweight squat in A ONLY.
//   The road's Week-4 move since Sep 7 (level-up PLAN, "THE ROAD"). The squat's
//   tempo dial is spent: 3-1-3 is a 7-second rep and hypertrophy is flat past
//   ~8 s/rep (Schoenfeld 2015, confirmed by the Sep-7 blind check), so a harder
//   VARIATION is the road left. Fingertips on the couch are balance only. Her
//   words tonight — "its ok i can grip" / "ignore the wrist" — mean light hand
//   contact is no longer a gate. C keeps its 10 squats: C stays the lighter day.
//   Video Oe086pgL5fw ("SUPPORTED SPLIT SQUAT", 18STRONG) re-checked live via
//   YouTube oEmbed Sep 19 22:28 — exists + embeddable; not watched end to end.
// RAISE 2 — wall sit 40 → 45 s. Earned under the rule "2 sessions over target →
//   one nudge": she held 42 s (Sep 7) and 43 s (Sep 14) against a 40-s ask.
//   The Week-2 depth cue (knees toward 90°) stays; graduate at a clean 60.
// CATCH-UP 1 — the 1 kg comes back into the arm block because she ALREADY does
//   it, off-app: "im doing 1 kg in arms btw i do hip hinges with 1 kg" (Sep 19
//   22:26). UPPER_BACK_SAFE (no load) had been understating her since June.
//   The prone row and the 1 kg curl return at their Jun-18 prescriptions (2×12),
//   wrist-neutral cues intact. Not a raise — the app matching reality, exactly
//   the wall-sit pattern (she over-delivers, the plan catches up).
// CATCH-UP 2 — the hinge note says 1 kg. Same exercise NAME so the card, the
//   picture and the voice note still resolve. Heavier than 1 kg stays PT-gated
//   (progression-rules.md, Forward additions §1).
// HOLDS — band clamshell 10/side (only its second week); bird dog legs-only (no
//   "feels like nothing" report yet — full bird dog waits for her word); walk /
//   apartment cardio unchanged. The elliptical she bought tonight is NOT in the
//   program until it is in the room. Days this week: Yom Kippur Mon Sep 21, erev
//   Sukkot Fri Sep 25 → A Tue · B Wed · C Thu (her call).
// v43 (Thu Sep 24) — the elliptical ARRIVED. The cardio step in A, B and C is
//   now a three-way pick: elliptical (primary) · walk outside · apartment. Same
//   minutes; no exercise, rep or round changed. Days moved after she was sick
//   Wed: A Thu · B Fri · C Sat night (the Saturday swing counts C toward this
//   week once A and B are in).
// ---------------------------------------------------------------------------
const R2W3_PLAN = PROGRAM[PROGRAM.length - 1]!;

const R2W4_SPLIT_SQUAT: Exercise = {
  name: 'Supported split squat',
  // v45: was "2 sets · 6-8 each side" inside a 2-round block — readable as 4
  // sets a side on her first-ever split squat. One set per round = 2 in all.
  reps: '6-8 each side · one set per round',
  // v46: halved — "NEW" is the week label's job. Safety lines kept: balance
  // only (no weight through the hands), smaller range on a pinch or wobble.
  notes:
    'In for the squats in A (C keeps its 10). Fingertips on the couch for balance only — no gripping, no weight through the hands. Front foot flat, back heel up, chest tall. Straight down, back knee toward the floor; push through the front heel to stand. Last set stop about 2 short. Knee pinches or you wobble? Smaller range — the right call.',
};

// The Week-2 wall sit, re-read from the plan object so the depth cue and the
// timer flags travel with it; only the seconds change.
const R2W4_WALL_SIT: Exercise = (() => {
  const found = R2W3_PLAN.workouts.A.main.find((ex) => ex.name === 'Wall sit');
  if (!found) throw new Error('R2W4: expected a Wall sit in Week 3 workout A');
  return {
    ...found,
    reps: '45 sec hold',
    durationSec: 45,
    notes:
      '40 → 45. You held 42 on Sep 7 and 43 on Sep 14 — two sessions over target is the rule for one nudge. Keep the Week-2 depth: knees toward 90°. Hands on thighs or hanging, no pushing on the wall. Graduate at a clean 60.',
  };
})();

// Same NAME as HIP_HINGE_W8 on purpose — the detail card, the stick figure and the
// recorded voice note are keyed to 'Bodyweight hip hinge'. The 1 kg is her
// existing practice, now written down.
const HIP_HINGE_R2W4: Exercise = {
  name: 'Bodyweight hip hinge',
  // v48 · fix r2 (Sep 25 2026): "Bodyweight hip hinge" sat right over "holding
  // the 1 kg" — the title contradicted the line under it. Display only; the
  // key above is unchanged so the voice note and history still match.
  label: 'Hip hinge',
  // v48 (Sep 24 2026): she does 2 sets in EACH of the 2 rounds; "2 sets · 12
  // reps" inside "Round 1/2" read as 2 in total (same class as the v45 split-
  // squat label). Label only — the prescription is unchanged.
  reps: '12 reps · 2 sets each round · holding the 1 kg',
  notes:
    'Same hinge, now HOLDING the 1 kg the way you already do — it hangs from the hands, wrists neutral, light grip. Hinge at the hips, soft knees, flat/neutral spine; feel it in hamstrings + glutes. Do NOT round the low back. 1 kg is the ceiling for now; anything heavier is a Lisa question.',
};

// The Jun-18 loaded pair, pulled from UPPER_BACK_W7 by name so the cues are the
// vetted ones. Throws at load time if either was ever renamed.
const R2W4_LOADED_ARMS: Exercise[] = (() => {
  const row = UPPER_BACK_W7.find((ex) => ex.name === 'Prone row (bodyweight)');
  const curl = UPPER_BACK_W7.find((ex) => ex.name === '1 kg biceps curl');
  if (!row || !curl) throw new Error('R2W4: expected the prone row + 1 kg curl in UPPER_BACK_W7');
  return [
    // v46: the "BACK IN (Sep 19 …)" provenance moved up into this comment (her
    // words: "im doing 1 kg in arms"); the cues keep every safety line — head
    // down (Lisa's Jun-18 neck cue), wrist never bending back (the Jun-18
    // injury mechanism), pain tells.
    {
      ...row,
      notes:
        'Bodyweight or holding the 1 kg — your call. Arm hanging, wrist neutral, light grip. Head down — do not lift it. Drive the elbow up, squeeze the shoulder blade toward your spine, lower slow. Pain tells — stop on any wrist signal.',
    },
    {
      ...curl,
      notes:
        'Hold the 1 kg lightly — wrist and fingers neutral, never bending back. Elbow tucked, forearm hanging; only the forearm moves. Lower slow. Pain tells — stop on any wrist signal. 2 kg trigger unchanged: easy at 3×20, two sessions running.',
    },
  ];
})();

// Block order: the no-load pair first (wall angels, IWYT), then the 1 kg pair,
// then the hands-on-floor bird dog, then the wall lean last — so the wrists are
// warm before they take weight, and a stop-at-pain exit costs nothing else.
const UPPER_BACK_R2W4: Exercise[] = [
  ...UPPER_BACK_SAFE,
  ...R2W4_LOADED_ARMS,
  BIRD_DOG_LEGS,
  ...WRIST_ONRAMP,
];

// Load-time guards: the three Week-3 A exercises we swap must exist by name.
for (const needed of ['Bodyweight squats', 'Bodyweight hip hinge', 'Wall sit']) {
  if (!R2W3_PLAN.workouts.A.main.some((ex) => ex.name === needed)) {
    throw new Error(`R2W4: expected '${needed}' in Week 3 workout A`);
  }
}
if (!R2W3_PLAN.workouts.B.main.some((ex) => ex.name === 'Bodyweight hip hinge')) {
  throw new Error("R2W4: expected 'Bodyweight hip hinge' in Week 3 workout B");
}

PROGRAM.push({
  round: 2,
  weekNum: 4,
  startsOn: '2026-09-19',
  label: 'Round 2 — Week 4 · the split squat, and the 1 kg comes back',
  workouts: {
    A: {
      ...R2W3_PLAN.workouts.A,
      description:
        'Split squat in for the squat · wall sit 45 · 1 kg back in the arm block · 2 rounds · ~30 min (cardio optional: elliptical or walk)',
      main: R2W3_PLAN.workouts.A.main.map((ex) => {
        if (ex.name === 'Bodyweight squats') return R2W4_SPLIT_SQUAT;
        if (ex.name === 'Bodyweight hip hinge') return HIP_HINGE_R2W4;
        if (ex.name === 'Wall sit') return R2W4_WALL_SIT;
        return ex;
      }),
      upperBack: UPPER_BACK_R2W4,
    },
    B: {
      ...R2W3_PLAN.workouts.B,
      description:
        'Same as last week · hinge with the 1 kg · 1 kg back in the arm block · ~30 min (cardio optional: elliptical or walk)',
      main: R2W3_PLAN.workouts.B.main.map((ex) =>
        ex.name === 'Bodyweight hip hinge' ? HIP_HINGE_R2W4 : ex
      ),
      upperBack: UPPER_BACK_R2W4,
    },
    // C's exercises unchanged on purpose: lighter day, its 10 squats stay. Only
    // the labels move (v43, Sep 24): the cardio slot is elliptical OR walk now.
    C: {
      ...R2W3_PLAN.workouts.C,
      id: 'C',
      name: 'Cardio + Lower Body + Core',
      description: '25-min cardio (elliptical or walk) + 2-round strength block · ~40 min',
    },
  },
});

// --- Resolvers -----------------------------------------------------------
//
// All "what's the workout today?" logic flows through these two functions.
// `date` defaults to now so tests can mock the system clock and still get
// deterministic answers.

function getWeekPlan(date: Date = new Date()): WeekPlan {
  // Pick the highest-weekNum plan whose startsOn is on or before `date`. If
  // `date` is before Week 1 (shouldn't happen — PROGRAM_START_DATE is week 1),
  // fall back to Week 1. If `date` is past the last encoded week, fall back
  // to the latest plan (we're in "future" territory — keep showing the last
  // plan rather than a blank screen).
  const target = date.getTime();
  let chosen: WeekPlan = PROGRAM[0]!;
  for (const wp of PROGRAM) {
    const start = new Date(wp.startsOn + 'T00:00:00').getTime();
    if (start <= target) {
      chosen = wp;
    } else {
      break;
    }
  }
  return chosen;
}

function getWorkoutById(id: WorkoutId, date: Date = new Date()): Workout {
  return getWeekPlan(date).workouts[id];
}

function getFutureWeekPlans(date: Date = new Date()): WeekPlan[] {
  const current = getWeekPlan(date);
  // indexOf, not findIndex-by-weekNum: week numbers repeat across rounds.
  const currentIdx = PROGRAM.indexOf(current);
  return PROGRAM.slice(currentIdx + 1);
}

// Encoded weeks BEFORE the current one, oldest → newest. Powers the collapsed
// "Past weeks" surface on home so previous programming stays browsable (the
// archive-not-delete principle) without expanding heavy blocks by default.
function getPastWeekPlans(date: Date = new Date()): WeekPlan[] {
  const current = getWeekPlan(date);
  const currentIdx = PROGRAM.indexOf(current);
  return PROGRAM.slice(0, currentIdx);
}

function getProgramWeekCount(): number {
  return PROGRAM.length;
}

// Build a "this exercise: A → B" line for the next-week preview. Returns null
// if the exercise is unchanged between weeks. Comparison is intentionally
// stringy + name-keyed (the simplest thing that works for rep/duration bumps).
function diffExercise(prev: Exercise | undefined, next: Exercise): string | null {
  if (!prev) return `+ ${next.name} (new) — ${next.reps ?? ''}`;
  if (prev.reps === next.reps && prev.durationSec === next.durationSec) return null;
  return `${next.name}: ${prev.reps ?? '—'} → ${next.reps ?? '—'}`;
}

// All bump lines for a single workout (A/B/C) going current → next. Empty
// array if no changes.
function diffWorkout(prev: Workout, next: Workout): string[] {
  const out: string[] = [];
  const buckets: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  for (const phase of buckets) {
    const prevItems = prev[phase] ?? [];
    const nextItems = next[phase] ?? [];
    const prevByName = new Map(prevItems.map((e) => [e.name, e]));
    const nextNames = new Set(nextItems.map((e) => e.name));
    for (const nx of nextItems) {
      const line = diffExercise(prevByName.get(nx.name), nx);
      if (line) out.push(line);
    }
    // Dropped exercises (in prev, not in next) — show explicitly.
    for (const pv of prevItems) {
      if (!nextNames.has(pv.name)) {
        out.push(`− ${pv.name} (removed)`);
      }
    }
  }
  return out;
}

// HAND_ROUTINES retired 2026-05-15 — see archive/hand-routine-2026-05-15/.

// EXERCISE_GUIDE is keyed only by exercise names referenced in WORKOUTS.
// Eliana-era entries removed per audit §8 (group 3P); Lisa Cohen wrist
// entries moved to archive/hand-routine-2026-05-15/ on 2026-05-15.
const EXERCISE_GUIDE: Record<string, { howTo: string }> = {
  'Belly breathing': {
    howTo:
      "Lie on your back, knees bent, feet flat. Rest one arm at your side (no weight on the hand). Inhale through your nose for 4 counts — your BELLY should rise, not your chest. Exhale slowly through your mouth for 6 counts. Common mistake: chest rising instead of belly. If that happens, slow down and put less effort into the inhale. This wakes up your diaphragm and signals your nervous system it's safe to work.",
  },
  'Pelvic tilts': {
    howTo:
      "On your back, knees bent, feet flat hip-width apart. Tilt your pelvis so your lower back gently flattens into the mat (you're tucking your tailbone slightly toward you). Hold 1-2 sec, then release back to neutral. Movement is small — 1-2 inches at the hip. Exhale on the tilt, inhale on the release. Common mistake: over-arching on the release. Just go to neutral, not into a backbend. Trains the pelvis-spine connection your back has been missing.",
  },
  'Glute squeezes': {
    howTo:
      "On your back, knees bent, feet flat. Gently tighten your butt muscles like you're holding a coin. Hold 3 sec, fully relax 2 sec, repeat. The goal is awareness, not max effort — aim for 50% squeeze, not 100%. Breathe normally throughout. Common mistake: squeezing the abs or pelvic floor too. Try to isolate ONLY the glutes. Wakes up the muscle group that's about to do most of today's work.",
  },
  'Bodyweight squats': {
    howTo:
      'Feet hip- to shoulder-width apart, toes pointed slightly out. Arms crossed over chest. Slowly lower for 3 SECONDS into a comfortable squat depth (knees can stay above 90° — no need to go deep). Pause 1 SECOND at the bottom. Stand up over 3 SECONDS. Inhale on the way down, exhale on the way up. Common mistakes: knees collapsing inward (push them out toward your pinky toes); chest dropping (stay tall). If balance is wobbly, stand near a wall and let your shoulder lightly touch — NOT your hand.',
  },
  'Glute bridges': {
    howTo:
      "On your back, knees bent, feet flat hip-width apart, arms relaxed at sides. Squeeze glutes FIRST, then lift hips to a comfortable height (don't go super high — your body should make a straight line from knees to shoulders, not an arch). Hold 2 sec at the top, then lower slowly. Exhale on the lift, inhale on the lower. Common mistakes: pushing the lower back into a backbend (drive through your HEELS, not your toes); hips coming up before glutes engage (hence: squeeze first). The single best lower-back-friendly glute exercise.",
  },
  'Wall sit': {
    howTo:
      'Stand with your back flat against a wall. Slide down until your knees are between 90° and 120° (steeper = harder, shallower = easier — pick what feels safe today). Knees should NOT go past your toes. Hands rest on thighs or hang loose at sides — no pushing on the wall. Breathe normally. Common mistake: holding your breath. Stay relaxed in the upper body. This is your weekly progress benchmark — track the time held.',
  },
  'Side-lying clamshells': {
    howTo:
      "Lie on your SIDE, knees bent ~90°, hips and shoulders stacked vertically (don't roll back). Head rests directly on the mat or on a thin pillow — DO NOT prop up on your forearm. Bottom arm extends along the floor under your head, relaxed. Keep feet together. Open the TOP knee like a clam shell while keeping the bottom knee on the mat — only lift to comfortable range. Lower with control. Inhale up, exhale down. Common mistake: hips rolling backward as the knee opens — keep them stacked.",
  },
  'Modified dead bug': {
    howTo:
      'On your back, hips and knees both at 90° in the air (shins parallel to ceiling — tabletop position). Arms relaxed FLAT at sides on the mat, palms UP (not down — protects wrists). Slowly extend ONE leg straight out, hovering it above the floor. Bring it back to tabletop. Switch sides. Keep your lower back glued to the mat the whole time — if it arches, your range is too big. Exhale on the leg extension. Common mistake: speed. Slow = harder = better.',
  },
  'Heel taps': {
    howTo:
      "On your back, knees bent, feet flat near your butt. Slowly extend ONE leg out and tap your heel toward the floor (don't slam it down). Return to start. Alternate sides. Arms relaxed at sides, palms up. Lower back stays in contact with the mat — if it arches, reduce the leg extension. Exhale on the tap. Common mistake: bending the back. Keep it steady — this is an anti-arch exercise, not a stretch.",
  },
  'Knees-to-chest hold': {
    howTo:
      'On your back, gently bring BOTH thighs toward your chest. Forearms hook behind the thighs to support — NOT your hands gripping. The leg position should be passive: legs resting on your forearms, not actively pulled. Breathe slowly. If your tailbone lifts off the mat, the angle is too tight — let the legs come a little further from your chest. Common mistake: gripping with hands (defeats the wrist protection). Releases the lower back fully.',
  },
  'Figure-4 stretch': {
    howTo:
      "On your back, knees bent, feet flat. Cross your RIGHT ankle over your LEFT knee (the right leg makes a '4' shape). Let the right knee fall outward — that opens the right hip. To deepen: use your forearms (not your hands) to draw the LEFT leg gently toward you. Hold 45 sec, breathing slowly. Switch sides. Common mistake: forcing the bent knee down with the other hand — let it open passively. Targets piriformis + outer hip — huge for back tightness.",
  },
  'Seated forward fold': {
    howTo:
      "Sit on the mat with legs extended in front of you (slight knee bend totally fine — don't lock them). Arms rest in your lap, NOT reaching forward. Hinge forward at the HIPS (not by rounding your back) until you feel a gentle stretch in the back of your legs. Stop at 2/10 stretch — this isn't a depth competition. Hold and breathe. Common mistake: rounding the upper back to look like the stretch is deeper. Better to stay tall with a smaller fold than collapse.",
  },
  'Slow breathing': {
    howTo:
      "Sit comfortably or stay lying down. Inhale through your nose for 4 counts, exhale through your mouth for 6 counts (longer exhale than inhale = activates the rest-and-recover nervous system). 8 full rounds. Eyes can close. This is the official 'workout is over' signal — your body needs the cue to switch out of effort mode. Common mistake: rushing because the workout is done. The cool-down is when adaptation actually happens — don't skip it.",
  },
  'Side-lying leg raises': {
    howTo:
      "Lie on your SIDE, hips stacked, head on the mat (or thin pillow) — NOT propped on your forearm. Bottom leg bent for stability, top leg straight. Slowly lift the top leg 30-45° (not super high — height isn't the point). Lower with control over 3 seconds. Keep your toes pointing FORWARD, not toward the ceiling — that targets the right glute muscle (glute medius). Exhale on the lift. Common mistake: rolling the hip backward as you lift, which makes the leg go higher but turns it into a hip flexor exercise instead of a glute one.",
  },
  'Single-leg glute bridges': {
    howTo:
      'Setup like a glute bridge: on your back, knees bent, feet flat, arms at sides palms up. Lift ONE foot off the mat (either knee tucked toward chest or leg extended straight). Squeeze the glute on the standing leg, push through that heel, lift hips. Hold 2 sec. Lower slow. Switch legs after the set. Common mistake: hips dropping toward the lifted-leg side. Keep them level — imagine balancing a glass of water on your pelvis. Bigger glute challenge than the regular bridge.',
  },
  'Slow supine bicycle': {
    howTo:
      'On your back, knees bent, feet flat. Bring one knee up toward your chest. Arms STAY relaxed at sides — NEVER behind the head (protects the neck and the wrists). As you slowly extend that leg out, bring the OTHER knee up. Continuous slow alternation, like pedaling underwater. Lower back glued to mat the whole time. Exhale on each leg extension. Common mistake: speed (this is supposed to be slow and controlled, not a cardio move).',
  },
  'Standing calf raises': {
    howTo:
      "Stand tall with feet hip-width apart. Light fingertip touch on a wall for balance — NO grip, NO weight on the hand. Slowly lift your heels until you're on the balls of your feet (3 seconds up). Hold 1 sec at the top. Lower slowly (3 seconds down). Inhale on the lift, exhale on the lower. Common mistake: bouncing for momentum — kills the work the calves are doing. Slow tempo is doing the heavy lifting here.",
  },
  'Outdoor walk': {
    howTo:
      "Conversational pace — you should be able to talk in full sentences without getting breathless. Do the minutes on your screen. Walking is genuinely your most underrated exercise: it preserves joint health, supports digestion (especially good with Crohn's), and clears mental fog. Take it outdoors when possible — the visual variety and sunlight matter. Tap done when you finish.",
  },
  // Week-6 additions (2026-06-06).
  'Bodyweight hip hinge': {
    howTo:
      'Stand tall, feet hip-width, soft (unlocked) knees, hands resting on the front of your thighs. Hinge at the HIPS — push your butt back as your hands slide down your thighs toward your knees. Keep your spine flat and neutral the whole way (NOT rounded). You should feel a stretch/load in your hamstrings and glutes. Stand back up by driving your hips forward and squeezing your glutes. Common mistake: squatting (knees forward) instead of hinging (hips back), or letting the low back round. Bodyweight only — no load. This is the standing hip-dominant pattern your routine was missing — the real-life floor-pickup skill.',
  },
  'Prone row (bodyweight)': {
    howTo:
      'Lie face-down on a bed/bench edge (or stand and hinge over), arm hanging straight down toward the floor, wrist neutral and straight. NO weight yet — you are building the pattern and endurance toward adding the 1 kg later. Drive your elbow UP toward the ceiling, leading with the elbow and squeezing your shoulder blade toward your spine. Lower slowly. 2 sets of 12 each side. Keep the wrist straight throughout. Common mistake: bending the wrist or yanking with the arm instead of leading with the elbow + blade. Fires the lower trap even unloaded. Add the 1 kg only when you say you are ready.',
  },
  '1 kg biceps curl': {
    howTo:
      "Hold the 1 kg with your elbow tucked at your side, forearm hanging down, wrist neutral and straight. Curl the forearm up toward your shoulder, keeping the elbow pinned in place — only the forearm moves. Lower slowly under control. 2 sets of 12. Keep the wrist straight (neutral) the whole time — don't let it bend back. Common mistake: swinging the body or the elbow drifting forward for momentum. Slow and controlled is the work.",
  },
  'IWYT raises': {
    howTo:
      "Lisa Cohen's move (Jun 18), plus the I position you added (Jul 4) — so: I, W, Y, T. Lie face DOWN on the mat with your forehead resting on a folded towel, so the neck stays long and relaxed. Thumbs point UP the entire time — that keeps the wrists neutral, zero palm pressure. One rep = put your arms in the letter's shape, lift them a few centimeters OFF the floor by squeezing your upper back, hold one breath, lower. Your hands touching the ground between reps is exactly right — the floor IS the rest position; you only lift for the squeeze. The letters: I — arms straight down along your sides, lift by drawing the shoulder blades down and together. W — elbows bent and pulled toward your ribs so your arms make a W; squeeze the blades together. Y — both arms overhead in a narrow V, like a referee calling goalposts. T — arms straight out to the sides at shoulder height. Do all reps of one letter, then move to the next. Small controlled lifts beat big swings — if your neck starts doing the work, the lift is too big. About 8 of each letter, 2 rounds, and keep the whole thing gentle for the neck.",
  },
  // Week-10 addition (2026-07-04) — from the Jun-20 deep research.
  'Eccentric step-down': {
    howTo:
      'A quad-control move for stairs and slopes. Stand on a low, sturdy step: a single stair, a thick book, or a low stool. Put your whole weight on ONE leg on the step and let the other foot hang just off the edge. SLOWLY lower the hanging heel toward the floor, taking 3-4 full seconds — your standing thigh is doing the controlling. Lightly tap the floor (or just hover), then push back up through the standing leg. A fingertip on a wall or rail for balance is fine — but NO gripping and no weight through the hand (your wrist stays out of this entirely). Keep the standing knee pointing over your toes, not caving inward. Start with a low step and a small range; the magic is the SLOW lowering, not the height. Stop the set if the knee pinches.',
  },
  // Round-2 Week-2 additions (2026-09-07).
  'Full dead bug': {
    howTo:
      'The graduation from the modified version — now the arms come along. Same start: on your back, hips and knees both at 90° in the air (shins parallel to the ceiling). Reach both arms straight up toward the ceiling. Extend ONE leg out low while the OPPOSITE arm reaches back overhead toward the floor. Come back to the start, then switch sides. 8 each side. The whole exercise is the low back: it stays pressed to the mat the entire time. If it lifts off, bend the extending knee more — a shorter lever is the fix, not pushing through. Breathe out as the limbs go away from you. Your arms move through the AIR, so there is zero weight on your wrists. Common mistake: rushing, and letting the ribs flare as the arm goes overhead — keep the ribs down and go slower.',
  },
  // Round-2 Week-4 addition (2026-09-19) — the road's split squat.
  'Supported split squat': {
    howTo:
      "The squat's next rung — one leg does most of the work, so the same 6 to 8 reps are a real step up without adding any weight. Stand a long step in front of the couch or a sturdy chair and rest your fingertips on it, for BALANCE ONLY: light touch, no gripping, no weight going through your hands. One foot forward, flat on the floor; the other foot back with the heel up. Chest tall, eyes forward. Lower straight down, so the back knee travels toward the floor and the front thigh comes near parallel — think elevator, not escalator: down, not forward. Push through the front heel to stand. 6 to 8 each side, 2 sets; on the last set stop about 2 reps short. If the front knee pinches, or you wobble a lot, make the range smaller and keep the fingertips down — that is the right call. This replaces the squat in workout A only; C keeps its 10 squats.",
  },
  'Bird dog (legs only)': {
    howTo:
      "Your first hands-on-the-floor move since April, at the beginner rung — LEGS ONLY, both hands stay down the whole time. Set up on hands and knees: hands flat under the shoulders with the fingers turned slightly out, knees under the hips, back long and flat. If flat palms bother you, make fists and rest on the knuckles; if that still bothers you, put the hands up on the couch or a low step — the higher your hands, the less weight goes through them. Slide one leg straight back until it is level with your body, hold 2 seconds, and lower it with control. Alternate sides — 6 each side, 2 sets. Keep the hips square (a hip bone shouldn't roll open) and the neck long, eyes on the floor. THE RULE: stop at PAIN. Pressure and stretch are fine; pain means shake the hands out and you're done for today — and the next morning must not feel worse. The full bird dog, where one hand also lifts, is the next rung. Not this week.",
  },
  'Apartment cardio': {
    howTo:
      "The indoor half of the either/or — the same minutes as the walk, in your own front room, and you don't have to invent it. Tap the timer and the strip runs itself: five moves, two minutes each, cycling in order for however long the block is — easy marching in place, step touch side to side, knee lifts, heel kicks back, then marching a bit quicker to finish. The screen always says which one is live now, so there's nothing to remember or count. Effort stays CONVERSATIONAL the whole way: full sentences, never breathless. Nothing jumps and nothing lands hard — one foot stays on the floor throughout, which keeps it quiet for the neighbours and keeps the impact off your back. Nothing to grip and no hands on the floor either. If you'd rather do the BUILDING STAIRS instead, take the same minutes there — up at an easy effort, walk down as the rest, repeat. Stairs are the strongest option minute-for-minute (roughly 10 minutes of stairs ≈ 14 minutes of brisk walking), so it's a great swap on a day you feel like it — hand on the rail for balance is fine, no gripping and hauling. But the strip is the default, because the point of this lane is that you never have to leave the apartment. Nothing is tracked here; the timer is the whole thing.",
  },
  // v43 (2026-09-24) — the York BX200 arrived; the third cardio lane.
  Elliptical: {
    howTo:
      "Form: stand tall with your weight through your heels and midfoot, not up on your toes. Whole foot on the pedal, toes pointing forward. Don't lean on the handles. The moving arms bring your upper body in, or rest your hands on the fixed grips. Pedal forward. Effort stays conversational: you can still talk in full sentences. It's zero impact and nearly silent, so it's easy on your back and on the neighbours downstairs. How progress shows up: same minutes, but a higher level or more distance than last time.",
  },
};

// v48 (Sep 24 2026): the one safety line per move for the card FACE, keyed by
// name so every week carrying the move gets it. Face-only wording — no numbers,
// no dates (those drift week to week and live in the full cue behind "Cue ▸").
// PROGRAM notes are NOT edited: the prescription and its full cue stay hers +
// Lisa's. An Exercise's own `safety` wins over this map.
const SAFETY_LINE: Record<string, string> = {
  'Supported split squat':
    'Fingertips on the couch for balance only — no weight through the hands.',
  'Bodyweight hip hinge': 'Do NOT round the low back.',
  'Wall sit': 'Knees toward 90°. Hands on thighs or hanging — no pushing on the wall.',
  'Full dead bug': 'Low back pressed to the mat the whole time.',
  'Forearm plank': 'Forearms only, not hands. Stop if any wrist sensation.',
  'Wall angels': 'If the wrists lift off, stop there — no forcing.',
  'IWYT raises': 'Thumbs up, wrist neutral. Stop if the neck complains.',
  'Prone row (bodyweight)': 'Head down. Pain tells — stop on any wrist signal.',
  '1 kg biceps curl': 'Wrist neutral, never bending back. Pain tells.',
  'Bird dog (legs only)': 'Pressure is fine; pain = done for today.',
  'Wall lean (wrist on-ramp)': 'Pressure is fine; pain = stop.',
  'Side-lying clamshells': 'Hips rolling back? Band lower, or off.',
  'Standing calf raises': 'Fingertips on the wall for balance only.',
  'Bodyweight squats': 'Wall behind the shoulders if wobbly.',
};

const state: AppState = {
  screen: 'home',
  selectedWorkout: null,
  capacityBefore: 5,
  capacityAfter: 5,
  wallSitSec: 0,
  backPain: 0,
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
  armFeel: {},
  backSomethingOpen: false,
  stretchTicks: {},
};

// ---------- audio ----------

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// Group 1C: must be called synchronously from a user-gesture handler. The Web
// Audio autoplay policy will leave the context suspended until a real click
// resumes it. Calling this from inside a setInterval/rAF callback is too late.
function unlockAudio(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

function playBeep(frequency: number, durationMs: number): void {
  // Ship 6: beeps toggle. When off, skip silently — timer logic still runs.
  if (!getBeepsEnabled()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

function playCountBeep(): void {
  playBeep(520, 120);
}

function playGoBeep(): void {
  playBeep(880, 200);
}

function playFinishBeep(): void {
  playBeep(660, 180);
  setTimeout(() => playBeep(880, 350), 180);
}

// ---------- timer (clock-anchored, group 1B) ----------
//
// Why this design (audit §3): the previous setInterval-based countdown was
// throttled when the phone screen slept (iOS Safari pauses background
// intervals entirely), so a 25-sec wall-sit would freeze and never finish.
// Pre-countdown had its own closure-local interval, leaking a "ghost timer"
// on Quit. This replaces all of that with a single rAF loop reading the
// wall-clock — endsAt is captured once, every frame computes
// `endsAt - Date.now()`. Survives sleep/wake; pause is trivial.

type TimerKind = 'pre-countdown' | 'rest' | 'timed-exercise';

type TimerHandle = {
  kind: TimerKind;
  endsAt: number;
  onComplete: () => void;
  lastSecRendered: number;
};

let activeTimer: TimerHandle | null = null;
let rafHandle: number | null = null;

// v46: keep the screen awake through a long timed block (the 10-25 min
// elliptical / apartment rides). Only walks held a wake lock; on a ride the
// Pixel slept, the timer loop stopped with it, and no 3-2-1 or finish chime
// played until she woke the phone (UX audit Sep 24; her Jul-4 walk rule was
// "it should make the screen stay open"). Reuses the walk's lock; released when
// the timer ends or stops — unless a walk still needs it.
const TIMER_WAKE_LOCK_MIN_SEC = 60;
let timerHoldsWakeLock = false;

function releaseTimerWakeLock(): void {
  if (!timerHoldsWakeLock) return;
  timerHoldsWakeLock = false;
  if (activeWalkStart() !== null || workoutWalkStart() !== null) return; // a walk still holds it
  if (walkWakeLock) {
    void walkWakeLock.release().catch(() => undefined);
    walkWakeLock = null;
  }
}

function stopTimer(): void {
  if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafHandle);
  }
  rafHandle = null;
  activeTimer = null;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  releaseTimerWakeLock();
}

function startTimerCore(kind: TimerKind, seconds: number, onComplete: () => void): void {
  stopTimer();
  activeTimer = {
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
    timerHoldsWakeLock = true;
    void acquireWalkWakeLock(); // guarded inside: no-op without navigator.wakeLock
  }
  render();
  timerLoop();
}

function timerLoop(): void {
  if (!activeTimer) return;
  // Paused: freeze the countdown. `togglePause` shifts `endsAt` forward by the
  // paused span on resume and re-enters the loop, so no ticks are lost. This
  // guard also makes the visibilitychange re-entry safe while paused.
  if (state.pausedAt !== null) return;
  const remainMs = activeTimer.endsAt - Date.now();
  const remainSec = Math.max(0, Math.ceil(remainMs / 1000));

  if (remainSec !== activeTimer.lastSecRendered) {
    activeTimer.lastSecRendered = remainSec;
    if (activeTimer.kind === 'pre-countdown') {
      state.preCountdown = remainSec;
    } else {
      state.timerSeconds = remainSec;
      if (activeTimer.kind === 'timed-exercise') cueRidePhase(); // v48 · P3
    }
    // Count beeps at the last COUNT_BEEP_FROM_SEC seconds (audit T6 fix:
    // only the count beep, not finish beep, fires on the way down).
    if (remainSec > 0 && remainSec <= COUNT_BEEP_FROM_SEC) {
      playCountBeep();
    }
    render();
  }

  if (remainMs <= 0) {
    const t = activeTimer;
    activeTimer = null;
    rafHandle = null;
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
    rafHandle = requestAnimationFrame(timerLoop);
  } else {
    // Fallback for environments without rAF (e.g. some test runners): poll @100ms.
    rafHandle = window.setTimeout(timerLoop, 100) as unknown as number;
  }
}

function startRestTimer(): void {
  // Ship 6: rest duration is user-configurable via Settings.
  // 2026-05-15 18:07 update: 0 means skip rest entirely — go straight to
  // the next exercise. Allison's call: "i do not need the brakes anymore."
  const rest = getRestSec();
  if (rest <= 0) {
    state.isResting = false;
    render();
    return;
  }
  state.isResting = true;
  startTimerCore('rest', rest, () => {
    state.isResting = false;
    render();
  });
}

function skipRest(): void {
  stopTimer();
  state.isResting = false;
  state.timerSeconds = 0; // Group 1A: ensure no stale value blocks next "Start timer"
  render();
}

function startPreCountdown(then: () => void): void {
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
function togglePause(): void {
  if (state.pausedAt === null) {
    // → pause
    state.pausedAt = Date.now();
    if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafHandle);
    }
    rafHandle = null;
    render();
    return;
  }
  // → resume
  const pausedFor = Date.now() - state.pausedAt;
  state.pausedMs += pausedFor;
  state.pausedAt = null;
  if (activeTimer) activeTimer.endsAt += pausedFor; // don't burn the frozen countdown
  if (state.wallSitStartedAt !== null) state.wallSitStartedAt += pausedFor; // keep held-sec honest
  render();
  if (activeTimer) timerLoop();
}

// Total paused milliseconds so far, including an in-progress pause. Used at save
// to subtract step-away time from the workout's wall-clock duration.
function totalPausedMs(): number {
  return state.pausedMs + (state.pausedAt !== null ? Date.now() - state.pausedAt : 0);
}

// Recompute on tab visibility — if the user backgrounded the app the rAF
// loop pauses and the timer would freeze. On return we fast-forward.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeTimer) {
      // v45: cancel the pending frame first, or every background/foreground
      // cycle added one more parallel loop until the timer ended.
      if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafHandle);
      }
      rafHandle = null;
      timerLoop();
    }
    // Wake lock auto-releases when the app is backgrounded; if a walk is
    // still running when she comes back, grab it again so the screen stays
    // on for the rest of the walk (her Jul-4 call). v46: same for a long
    // timed block still counting down.
    if (
      document.visibilityState === 'visible' &&
      (activeWalkStart() || (activeTimer !== null && timerHoldsWakeLock))
    ) {
      void acquireWalkWakeLock();
    }
  });
}

// ---------- persistence ----------

function loadLogs(): LogEntry[] {
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
function writeLogs(logs: LogEntry[]): void {
  const sorted = [...logs].sort((a, b) => {
    const aUn = a.synced ? 1 : 0;
    const bUn = b.synced ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn; // unsynced first
    return b.date.localeCompare(a.date); // newest first
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.slice(0, PULL_LIMIT)));
}

function saveLog(entry: LogEntry): LogEntry {
  const stored: LogEntry = { ...entry, id: entry.id ?? genId(), synced: false };
  const logs = loadLogs();
  logs.unshift(stored);
  // Newest-first by DATE, not by save order — an after-the-fact log (v32) is
  // dated the day it was started, which may be older than rows already here.
  logs.sort((a, b) => b.date.localeCompare(a.date));
  writeLogs(logs);
  return stored;
}

function markLogSynced(id: string): void {
  const logs = loadLogs();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const entry = logs[idx];
  if (!entry) return;
  logs[idx] = { ...entry, synced: true };
  writeLogs(logs);
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
type WalkEntry = {
  id: string; // local id only; the DB row generates its own uuid
  date: string; // ISO datetime
  minutes?: number | null; // from the start/stop timer (Jul 4); null = logged without timing
  meters?: number | null; // GPS distance (outdoor, screen-on — her call Jul 4); null = no usable fix
  steps?: number | null; // motion-sensor step estimate (works indoors, phone on her)
  synced?: boolean;
};

// v48 · P3 (Sep 24 2026): minutes only — the meters/steps counters are
// archived (archive/walk-sensors-2026-09-24/). Fit is asked at Save instead.
type WorkoutWalkResult = {
  minutes: number;
  // The walk's clock window (epoch ms), so we can ask Google Fit how many steps
  // fell inside it — the accurate count, even if the screen was off (v16, Jul 9).
  startMs?: number;
  endMs?: number;
};

const WALKS_KEY = 'workout-tracker:walks';
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
const WALK_ACTIVE_KEY = 'workout-tracker:walk-active';
// The v47 counters' keys — only cleared now (a phone may still hold them).
const LEGACY_WALK_COUNTER_KEYS = ['workout-tracker:walk-meters', 'workout-tracker:walk-steps'];

let walkWakeLock: { release: () => Promise<void> } | null = null;
let walkTickId: number | null = null;

function clearLegacyWalkCounters(): void {
  for (const k of LEGACY_WALK_COUNTER_KEYS) localStorage.removeItem(k);
}

function activeWalkStart(): number | null {
  const raw = localStorage.getItem(WALK_ACTIVE_KEY);
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

// v48 · P3: the one live line, minutes only — "Walking · 12 min".
function walkLiveText(start: number | null): string {
  const mins = start ? Math.max(0, Math.floor((Date.now() - start) / 60000)) : 0;
  return `Walking · ${mins} min`;
}

async function acquireWalkWakeLock(): Promise<void> {
  // Her call (Jul 4): the screen SHOULD stay on during a walk (v48: so the
  // minute tick keeps running; the sensors are archived). try/catch: headless tests and
  // older browsers have no wakeLock.
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && document.visibilityState === 'visible') {
      walkWakeLock = await nav.wakeLock.request('screen');
    }
  } catch {
    walkWakeLock = null;
  }
}

// v48 · P3 (Sep 24 2026): minutes only — "Walking · 12 min", refreshed by the
// 30 s tick. The step/km parts are gone with the sensors (archived).
function updateWalkLiveLine(): void {
  const el = document.getElementById('walk-live');
  if (!el) return;
  el.textContent = walkLiveText(activeWalkStart() ?? workoutWalkStart());
}

// v48 · P3: the wake lock + the minute tick. No GPS watch, no devicemotion
// listener any more (archive/walk-sensors-2026-09-24/).
function beginWalkTracking(): void {
  void acquireWalkWakeLock();
  if (walkTickId === null) {
    walkTickId = window.setInterval(updateWalkLiveLine, 30000);
  }
}

function endWalkTracking(): void {
  if (walkTickId !== null) {
    window.clearInterval(walkTickId);
    walkTickId = null;
  }
  if (walkWakeLock) {
    void walkWakeLock.release().catch(() => undefined);
    walkWakeLock = null;
  }
}

function startWalk(): void {
  localStorage.setItem(WALK_ACTIVE_KEY, String(Date.now()));
  clearLegacyWalkCounters();
  beginWalkTracking();
}

function finishWalk(): WalkEntry | null {
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
function cancelWalk(): void {
  endWalkTracking();
  localStorage.removeItem(WALK_ACTIVE_KEY);
}

function loadWalks(): WalkEntry[] {
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

function writeWalks(walks: WalkEntry[]): void {
  const sorted = [...walks].sort((a, b) => {
    const aUn = a.synced ? 1 : 0;
    const bUn = b.synced ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn; // unsynced survive the cap first
    return b.date.localeCompare(a.date);
  });
  localStorage.setItem(WALKS_KEY, JSON.stringify(sorted.slice(0, 100)));
}

function markWalkSynced(id: string): void {
  const walks = loadWalks();
  const idx = walks.findIndex((w) => w.id === id);
  if (idx === -1) return;
  const entry = walks[idx];
  if (!entry) return;
  walks[idx] = { ...entry, synced: true };
  writeWalks(walks);
}

async function pushWalk(walk: WalkEntry): Promise<void> {
  if (syncDisabled()) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/movement_log`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        // v48 · P3 (Sep 24 2026): the LOCAL day. The UTC slice filed an evening
        // walk in Jerusalem (after 21:00 in summer) under the next day.
        date: localIsoDate(new Date(walk.date)),
        kind: 'walk',
        minutes: walk.minutes ?? null,
        // v48 · P3: minutes only. A v47 walk still waiting to sync carries the
        // archived sensors' numbers (3 steps in 29 min) — they don't travel.
        meters: null,
        steps: null,
      }),
    });
    if (res.ok) {
      markWalkSynced(walk.id);
      return;
    }
    // v48 (Sep 24 2026): fail loud, same shape as the session push. movement_log
    // has 0 rows EVER and a silent catch couldn't tell "unused" from "broken"
    // (slow-walking audit). Still stays unsynced and is flushed on next load.
    console.warn('[sync] walk push failed:', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.warn('[sync] walk push threw:', err);
  }
}

async function flushPendingWalks(): Promise<void> {
  if (syncDisabled()) return;
  for (const w of loadWalks().filter((x) => !x.synced)) {
    await pushWalk(w);
  }
}

function logWalk(
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

// In-workout walk tracking (v13 — her actual idea, Jul 4: "each time I go on a
// walk WITHIN each workout it tracks information, saves it"). The 'Outdoor
// walk' step that opens A/B (10 min) and C (25 min) times the walk (v48: minutes
// only), and the minutes save WITH that session. render() drives
// start/stop, so advancing, quitting, and resume-after-close all behave.
const WW_START_KEY = 'workout-tracker:ww-start';
let workoutWalk: WorkoutWalkResult | null = null;

function workoutWalkStart(): number | null {
  const raw = localStorage.getItem(WW_START_KEY);
  if (!raw) return null;
  const t = Number(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function harvestWorkoutWalk(): void {
  const start = workoutWalkStart();
  if (start === null) return;
  const end = Date.now();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  // Don't kill the engine if a STANDALONE walk is (somehow) also live.
  if (!activeWalkStart()) endWalkTracking();
  localStorage.removeItem(WW_START_KEY);
  // Keep start/end so logCompleteAndHome can ask Google Fit for the real count.
  workoutWalk = { minutes, startMs: start, endMs: end };
  // v45: persisted too — the walk is the FIRST step, so if the phone drops the
  // app during the strength rounds, the numbers must still be there at Save.
  localStorage.setItem(WW_RESULT_KEY, JSON.stringify(workoutWalk));
}

const WW_RESULT_KEY = 'workout-tracker:ww-result';

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

function clearWorkoutWalk(): void {
  workoutWalk = null;
  localStorage.removeItem(WW_RESULT_KEY);
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
    if (walkTickId === null) {
      // First tick after Start, or resumed after an app close — (re)start the
      // wake lock + minute tick; the start stamp is already in localStorage.
      beginWalkTracking();
    }
    updateWalkLiveLine();
  } else if (!onWalkStep && started) {
    harvestWorkoutWalk();
  }
}

// Explicit Start for the in-workout walk (her Jul-9 rule above). Stamps the
// start time, then lights up the wake lock + minute tick.
function startWorkoutWalk(): void {
  if (activeWalkStart() !== null) return; // a standalone walk owns the engine
  localStorage.setItem(WW_START_KEY, String(Date.now()));
  clearLegacyWalkCounters();
  beginWalkTracking();
}

// ---------- Cardio either/or (Allison Sep 7 2026) ----------
// WHAT: the cardio step that opens A/B (10 min) and C (25 min) is now a CHOICE —
// walk outside (the tracked flow, entirely unchanged: GPS + steps + Fit) OR the
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
const WW_APARTMENT_KEY = 'workout-tracker:ww-apartment';
const APARTMENT_CARDIO_NAME = 'Apartment cardio';

function apartmentCardioMinutes(): number | null {
  const raw = localStorage.getItem(WW_APARTMENT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Minutes the walk step prescribes — read off its own reps text ("10 min").
function walkStepMinutes(ex: Exercise): number {
  const m = /(\d+)\s*min/.exec(ex.reps ?? '');
  return m?.[1] ? Number(m[1]) : 10;
}

function chooseApartmentCardio(minutes: number): void {
  clearElliptical(); // one lane at a time
  localStorage.setItem(WW_APARTMENT_KEY, String(minutes));
}

function clearApartmentCardio(): void {
  clearLaneProgress();
  localStorage.removeItem(WW_APARTMENT_KEY);
}

function apartmentCardioStep(minutes: number): Exercise {
  return {
    name: APARTMENT_CARDIO_NAME,
    reps: `${minutes} min`,
    notes:
      "Same minutes as the walk, inside — and you don't have to invent it. Start the timer and the strip below runs itself: five moves, two minutes each, cycling until the time is up. Conversational effort the whole way — you should still be able to talk. Rather do the building stairs? Same minutes there works too. Nothing is tracked here; the timer is the whole thing.",
    durationSec: minutes * 60,
    isTimed: true,
  };
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
const WW_ELLIPTICAL_KEY = 'workout-tracker:ww-elliptical';
const WW_ELLIPTICAL_LEVEL_KEY = 'workout-tracker:ww-elliptical-level';
const ELLIPTICAL_NAME = 'Elliptical';
// York BX200: 24 computerized magnetic levels (Mega Sport spec page, Sep 24).
const ELLIPTICAL_MAX_LEVEL = 24;
// v48 · P3 (Sep 24 2026): the level every ride starts AND ends on — "Start on
// level 3, easy". Also where the after-ride stepper starts when there's no last
// level. (v47 guessed 5 before the ride while the steps said 3 — walk §2.)
const ELLIPTICAL_START_LEVEL = 3;
const ELLIPTICAL_MARKER_RE = /cardio: elliptical \d+ min · level (\d+)/;

function ellipticalMinutes(): number | null {
  const raw = localStorage.getItem(WW_ELLIPTICAL_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function clampEllipticalLevel(n: number): number {
  return Math.max(1, Math.min(ELLIPTICAL_MAX_LEVEL, Math.round(n)));
}

// The level from her most recent elliptical session. v48 (Sep 24 2026): the
// real `ellipticalLevel` column first; older rows (and a v47 ride saved tonight)
// only carry the notes marker, so the regex stays as the fallback.
function lastEllipticalLevel(): number | null {
  const newestFirst = [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date));
  for (const l of newestFirst) {
    if (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) {
      return clampEllipticalLevel(l.ellipticalLevel);
    }
    const m = ELLIPTICAL_MARKER_RE.exec(l.notes ?? '');
    if (m?.[1]) return clampEllipticalLevel(Number(m[1]));
  }
  return null;
}

// v48 · P3 (Sep 24 2026): the level she RECORDED after this ride, or null.
// Decision Q5: the level is logged after the ride ("the level you rode at is
// only known after"), and a stepper she never touched is not a reading — null
// saves elliptical_level null, the same rule as the untouched sliders (v46).
function ellipticalLevel(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_LEVEL_KEY));
  return Number.isFinite(n) && n > 0 ? clampEllipticalLevel(n) : null;
}

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
const WW_ELLIPTICAL_KM_KEY = 'workout-tracker:ww-elliptical-km';
const WW_ELLIPTICAL_PULSE_KEY = 'workout-tracker:ww-elliptical-pulse';

function ellipticalKm(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_KM_KEY) ?? '');
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
}

function ellipticalPulse(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_PULSE_KEY) ?? '');
  return Number.isFinite(n) && n >= 30 && n <= 230 ? Math.round(n) : null;
}

// Saved on every keystroke so the value survives a re-render or an app close.
function setEllipticalReading(key: string, raw: string): void {
  const v = raw.trim().replace(',', '.');
  if (v === '') localStorage.removeItem(key);
  else localStorage.setItem(key, v);
}

// The v47 notes marker, rebuilt from a saved entry's columns. v48 (Sep 24
// 2026): only the legacy push uses it now (a phone ahead of the schema — see
// pushLogToSupabase). Its "cardio: elliptical N min · level L" head is what
// lastEllipticalLevel() reads back; the readings ride after it when present.
function legacyCardioMarker(entry: LogEntry): string | null {
  const minutes = entry.cardioMinutes;
  if (entry.cardioLane === 'apartment' && minutes != null)
    return `cardio: apartment ${minutes} min`;
  if (entry.cardioLane !== 'elliptical' || minutes == null) return null;
  const parts = [`cardio: elliptical ${minutes} min`];
  if (entry.ellipticalLevel != null) parts.push(`level ${entry.ellipticalLevel}`);
  if (entry.ellipticalKm != null) parts.push(`${entry.ellipticalKm} km`);
  if (entry.ellipticalPulse != null) parts.push(`pulse ${entry.ellipticalPulse}`);
  return parts.join(' · ');
}

// v45 — minutes actually done on an indoor lane (elliptical / apartment). Set
// when she leaves the step after running its timer: the timer's elapsed time,
// or the full block if it ran out. Never started the timer → nothing stored,
// and the prescription stands (she may have used the machine's own clock).
const WW_LANE_STARTED_KEY = 'workout-tracker:ww-lane-started';
const WW_LANE_DONE_MIN_KEY = 'workout-tracker:ww-lane-done-min';

function isIndoorLane(name: string): boolean {
  return name === ELLIPTICAL_NAME || name === APARTMENT_CARDIO_NAME;
}

function captureLaneMinutesIfLeaving(): void {
  const ex = getCurrentExercise();
  if (!ex || !isIndoorLane(ex.name) || !ex.durationSec) return;
  if (localStorage.getItem(WW_LANE_STARTED_KEY) === null) return;
  // v48 · P3 (Sep 24 2026): a ride she STOPPED already holds its real minutes —
  // with the timer idle, the "0 left" arithmetic below would overwrite them
  // with the full block. Only a live timer (or nothing stored yet) is measured.
  const t = activeTimer;
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

// v48 · P3 (Sep 24 2026) — decision Q7: the generic how-to card on the
// elliptical said the same ride three times (~240 words). One live line instead,
// derived from the countdown alone: easy for 2 min, raise the level, read the
// pulse in the last minute, back to 3 for the last 30 s. Her walk §2: "No cue at
// minute 2 or for the last minute" → a live cue plus a buzz.
type RidePhase = 'easy' | 'raise' | 'grips' | 'ease-off';

function ridePhase(totalSec: number, remainingSec: number): RidePhase {
  const elapsed = totalSec - remainingSec;
  if (elapsed < 120) return 'easy';
  if (remainingSec > 60) return 'raise';
  if (remainingSec > 30) return 'grips';
  return 'ease-off';
}

const RIDE_LINE: Record<RidePhase, string> = {
  easy: 'Easy on level 3',
  raise: 'Raise the level until talking takes effort — then hold it',
  grips: 'Hands on the fixed grips — read your pulse',
  'ease-off': 'Back to level 3, easy',
};

// The phase the last tick was in, so the buzz fires once on ENTERING the grips
// and ease-off phases — never on every re-render.
let lastRidePhase: RidePhase | null = null;

function cueRidePhase(): void {
  const ex = getCurrentExercise();
  if (!ex || ex.name !== ELLIPTICAL_NAME || !ex.durationSec) return;
  const phase = ridePhase(ex.durationSec, state.timerSeconds);
  if (phase === lastRidePhase) return;
  const entering = lastRidePhase !== null && (phase === 'grips' || phase === 'ease-off');
  lastRidePhase = phase;
  if (!entering) return;
  playCountBeep(); // silent when beeps are off (Settings)
  try {
    navigator.vibrate?.(200);
  } catch {
    /* no vibration motor / not allowed — the line still changes */
  }
}

function laneDoneMinutes(): number | null {
  const n = Number(localStorage.getItem(WW_LANE_DONE_MIN_KEY) ?? '');
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
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
}

function ellipticalStep(minutes: number): Exercise {
  return {
    name: ELLIPTICAL_NAME,
    reps: `${minutes} min`,
    notes:
      'First two minutes easy. Then raise the level until you can still talk in full sentences, and stay there. Ease off for the last minute.',
    durationSec: minutes * 60,
    isTimed: true,
  };
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

function walksThisWeek(): number {
  const weekStart = saturdayForOffset(0).getTime();
  return loadWalks().filter((w) => new Date(w.date).getTime() >= weekStart).length;
}

// Group 1F: wrist columns dropped from POST payload — Lisa Cohen cleared the
// wrist May 10. App was silently writing 0s for two columns the user no
// longer fills. Schema still has the columns (no Supabase change) so existing
// rows survive; new inserts just omit them and let the DB use NULL/default.
// v48 (Sep 24 2026): does this workout have a timed wall sit anywhere in it?
// B and C don't — and a 0 sent for them was "a hole wearing a number"
// (data-integrity #3), so their payload says null instead.
function workoutHasWallSit(w: Workout): boolean {
  return [...w.warmup, ...w.main, ...(w.upperBack ?? [])].some((ex) => ex.name === 'Wall sit');
}

// v48 · fix r1 (Sep 24 2026): after "Log what I did", did she get past the wall
// sit? A stop before it (at the hinge, round 1) left an empty "Wall sit (s)"
// asking about a hold she never reached — the post-log hides it then. Reached =
// held something, or stopped on/after its step (phase order warmup → main →
// upperBack → cooldown; any later round of main is past round 1's).
function reachedWallSit(w: Workout): boolean {
  if (state.wallSitSec > 0) return true;
  const order: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  const here = order.indexOf(state.currentPhase);
  for (const p of order) {
    const i = (w[p] ?? []).findIndex((ex) => ex.name === 'Wall sit');
    if (i < 0) continue;
    const at = order.indexOf(p);
    if (here !== at) return here > at;
    if (p === 'main' && state.currentRound > 1) return true;
    return state.currentExerciseIndex > i;
  }
  return false;
}

// The nine columns added in v48 (migrations/2026-09-24-v48-session-columns.sql).
const V48_SESSION_COLUMNS = [
  'cardio_lane',
  'cardio_minutes',
  'elliptical_level',
  'elliptical_km',
  'elliptical_pulse',
  'session_note',
  'lite_day',
  'arm_feel',
  'voice_plays',
] as const;

// The workout_sessions row for a saved entry — pure, so it's testable without a
// network (v48, Sep 24 2026). Every structured number has its own column now;
// `notes` carries only system annotations.
function sessionPayload(entry: LogEntry): Record<string, unknown> {
  const hasWallSit = workoutHasWallSit(getWorkoutById(entry.workout, new Date(entry.date)));
  return {
    id: entry.id,
    date: entry.date,
    workout_type: entry.workout,
    capacity_before_1_10: entry.capacityBefore,
    capacity_after_1_10: entry.capacityAfter,
    wall_sit_seconds: hasWallSit ? entry.wallSitSec : null,
    pain_back_0_10: entry.backPain,
    one_word: entry.word || null,
    started_at: entry.startedAt ?? null,
    completed_at: entry.completedAt ?? null,
    duration_seconds: entry.durationSec ?? null,
    walk_minutes: entry.walkMinutes ?? null,
    walk_steps: entry.walkSteps ?? null,
    walk_meters: entry.walkMeters ?? null,
    notes: entry.notes ?? null,
    cardio_lane: entry.cardioLane ?? null,
    cardio_minutes: entry.cardioMinutes ?? null,
    elliptical_level: entry.ellipticalLevel ?? null,
    elliptical_km: entry.ellipticalKm ?? null,
    elliptical_pulse: entry.ellipticalPulse ?? null,
    session_note: entry.sessionNote ?? null,
    lite_day: entry.liteDay ?? null,
    arm_feel: entry.armFeel ?? null,
    voice_plays: entry.voicePlays ?? null,
  };
}

// The v47-shaped row, for a server that doesn't have the v48 columns yet
// (PostgREST 400 PGRST204). Nothing is lost: the lane marker and her note go
// back into `notes` the way v47 wrote them, and the indoor minutes back into
// walk_minutes — so a sync is never dropped for being ahead of the schema.
function legacySessionPayload(entry: LogEntry): Record<string, unknown> {
  const payload = sessionPayload(entry);
  for (const col of V48_SESSION_COLUMNS) delete payload[col];
  const noteParts = [legacyCardioMarker(entry), entry.sessionNote, entry.notes].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== ''
  );
  payload['notes'] = noteParts.length > 0 ? noteParts.join(' · ') : null;
  if (entry.cardioLane === 'elliptical' || entry.cardioLane === 'apartment') {
    payload['walk_minutes'] = entry.walkMinutes ?? entry.cardioMinutes ?? null;
  }
  return payload;
}

async function postSession(payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/workout_sessions`, {
    method: 'POST',
    // v45: ignore-duplicates — if an earlier push already landed (the reply
    // was lost), the retry is a no-op success instead of a 409 forever.
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify([payload]),
  });
}

async function pushLogToSupabase(entry: LogEntry): Promise<boolean> {
  if (syncDisabled()) return false;
  if (!entry.id) return false;
  try {
    let res = await postSession(sessionPayload(entry));
    if (res.status === 400) {
      const body = await res.text().catch(() => '');
      if (!body.includes('PGRST204')) {
        console.warn('[sync] push failed:', res.status, body);
        return false;
      }
      // v48: the phone is ahead of the schema (an unknown column). Say so, then
      // retry ONCE with the v47 shape so the session still lands.
      console.warn(
        '[sync] v48 columns missing on the server — retrying with the legacy row:',
        body
      );
      res = await postSession(legacySessionPayload(entry));
    }
    if (res.ok) {
      markLogSynced(entry.id);
      return true;
    }
    console.warn('[sync] push failed:', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.warn('[sync] push threw:', err);
    return false;
  }
}

// Google Fit step count for a clock window, via the `fit-steps` Supabase edge
// function (v16, Jul 9 2026 — her idea: "when I start walking it knows"). The
// phone counts steps NATIVELY even with the screen off / another app open, so
// asking Fit "how many steps between start and end?" gets the REAL walk count and
// sidesteps the PWA background-sensor limit entirely. The Google token lives
// server-side in the edge function (never in the app). Returns null on any
// failure (offline, test mode, Fit not linked) so callers keep the motion-sensor
// estimate as a graceful fallback — the walk still logs either way.
async function fetchFitSteps(startMs: number, endMs: number): Promise<number | null> {
  if (syncDisabled()) return null;
  if (!startMs || !endMs || endMs <= startMs) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fit-steps`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ startMillis: startMs, endMillis: endMs }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const steps = (data as { steps?: unknown }).steps;
    return typeof steps === 'number' && steps >= 0 ? steps : null;
  } catch {
    return null;
  }
}

// v48 · P4 (Sep 24 2026) — today's steps from Google Fit, zero taps (DECISIONS
// §2 #8): one quiet "· 4,210 steps today" on home's walk row. Asked once after
// boot; shown only when Fit answers — when it doesn't, nothing is invented
// (fail-loud: a missing number stays missing, never a 0).
let stepsToday: number | null = null;

async function fetchStepsToday(): Promise<void> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const n = await fetchFitSteps(midnight.getTime(), Date.now());
  if (n === null) return;
  stepsToday = n;
  if (state.screen === 'home') render();
}

// Test hook (automation only — Fit is off under navigator.webdriver).
if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
  (window as unknown as { __wtSetStepsToday?: (n: number | null) => void }).__wtSetStepsToday = (
    n
  ) => {
    stepsToday = n;
    if (state.screen === 'home') render();
  };
}

// ---------- state machine ----------

function getCurrentWorkout(): Workout | null {
  return state.selectedWorkout ? getWorkoutById(state.selectedWorkout) : null;
}

// The step exactly as PROGRAM has it — no substitutions. Use this whenever the
// programmed content is what matters (e.g. reading the walk's prescribed
// minutes after the apartment swap has already happened).
function rawCurrentExercise(): Exercise | null {
  const w = getCurrentWorkout();
  if (!w) return null;
  const list = w[state.currentPhase] ?? [];
  return list[state.currentExerciseIndex] ?? null;
}

function getCurrentExercise(): Exercise | null {
  const ex = rawCurrentExercise();
  // Cardio either/or (Sep 7 2026): while the apartment option is chosen, the
  // walk step IS the apartment timer — same minutes, no tracking.
  // Same swap for the elliptical lane (Sep 24 2026).
  if (ex && ex.name === 'Outdoor walk') {
    const ellMinutes = ellipticalMinutes();
    if (ellMinutes !== null) return ellipticalStep(ellMinutes);
    const minutes = apartmentCardioMinutes();
    if (minutes !== null) return apartmentCardioStep(minutes);
  }
  return ex;
}

// Lite day: one round less than programmed, never below 1 (A/B 3→2, C 2→1).
function effectiveRounds(w: Workout): number {
  return state.liteDay ? Math.max(1, w.rounds - 1) : w.rounds;
}

function startWorkout(id: WorkoutId): void {
  state.selectedWorkout = id;
  state.screen = 'pre-log';
  state.liteDay = false; // fresh pick, full program until she says otherwise
  render();
}

// v48 · P3 (Sep 24 2026): the cardio step's name on screen. The key stays
// 'Outdoor walk' in PROGRAM / DETAIL / HOWTO / VISUALS (and in saved data); she
// sees "Cardio" — her Sep 24 words: "no more walk it could be walk or elliptical".
// v48 · fix r2 (Sep 25 2026): takes the Exercise, so a per-week `label` (the
// Week-4 "Hip hinge") wins everywhere she reads the name — step title, the
// pre-log list, the rest screen's "Next ·" line, the round-break line.
function displayName(ex: Pick<Exercise, 'name' | 'label'>): string {
  if (ex.label) return ex.label;
  return ex.name === 'Outdoor walk' ? 'Cardio' : ex.name;
}

// v48 · P3 — lane memory (DECISIONS §2 #3): the lane of her newest saved
// session. The cardio_lane column first; a v47 row only carries the notes
// marker ("cardio: elliptical …" / "cardio: apartment …").
function lastCardioLane(): LogEntry['cardioLane'] {
  const newest = [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!newest) return null;
  if (newest.cardioLane) return newest.cardioLane;
  const m = /cardio: (elliptical|apartment)\b/.exec(newest.notes ?? '');
  return m?.[1] === 'elliptical' || m?.[1] === 'apartment' ? m[1] : null;
}

function beginExercises(): void {
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
  state.armFeel = {}; // v48 · P5: a feel belongs to one session
  state.stretchTicks = {}; // v48 · P7: ticks belong to one session
  // v46: the post-log sliders haven't been seen yet (capacity-before was just
  // set on pre-log, so its flag stays as it is).
  state.capacityAfterTouched = false;
  state.backPainTouched = false;
  state.backSomethingOpen = false;
  state.howToOpenFor = null;
  state.videoExpandedFor = null;
  clearWorkoutWalk(); // fresh session, fresh walk numbers
  clearApartmentCardio(); // fresh session, cardio lane unchosen again
  clearElliptical();
  // v48 · P3 (Sep 24 2026): open straight on the lane she used last time when
  // it was the elliptical or the apartment — nothing starts until she taps
  // Start, and the "↩ … instead" link is right there. A walk (or no history)
  // gets the choice screen: the walk only starts on her tap as she heads out.
  const cardio = getCurrentWorkout()?.warmup.find((e) => e.name === 'Outdoor walk');
  if (cardio) {
    const lane = lastCardioLane();
    if (lane === 'elliptical') chooseElliptical(walkStepMinutes(cardio));
    else if (lane === 'apartment') chooseApartmentCardio(walkStepMinutes(cardio));
  }
  render();
}

function advanceExercise(): void {
  const w = getCurrentWorkout();
  if (!w) return;

  // Group 1D: if we're leaving a timed wall-sit and the user tapped Done
  // before the timer ran out, capture actual held duration.
  captureWallSitIfPending();
  captureLaneMinutesIfLeaving(); // v45: minutes actually done on the elliptical/apartment

  stopTimer();
  state.isResting = false;
  state.videoExpandedFor = null; // collapse video when moving on

  // Cool-down is one scrollable list (not stepped) — its single "Done · Finish"
  // button ends the session regardless of how many stretches it contains.
  if (state.currentPhase === 'cooldown') {
    state.screen = 'post-log';
    render();
    return;
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
    state.screen = 'post-log';
  }
  render();
}

// ---------- Back (Allison Sep 24 2026, v47) ----------
// Her words: "this app needs back button like i can go back an exercise or a
// round" → "i need to be able to go back". One step backwards through the
// same walk advanceExercise takes forwards: within a phase, then across the
// round boundary (Round 2 step 1 → Round 1 last step), then across phases
// (main → warm-up, upper back → main last round, cool-down → the block before
// it). Nothing is logged by going back: a running timer stops, a pending
// wall-sit capture is discarded (she's redoing it), a rest is cancelled.
function canGoBack(): boolean {
  if (state.screen !== 'workout') return false;
  return !(state.currentPhase === 'warmup' && state.currentExerciseIndex === 0 && !state.isResting);
}

function goBack(): void {
  const w = getCurrentWorkout();
  if (!w || !canGoBack()) return;
  stopTimer();
  state.wallSitStartedAt = null;
  state.videoExpandedFor = null;
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

// v48 (Sep 24 2026): the pinned bottom bar. Done sat at the END of each step's
// scroll — under a video, a detail card and a cue paragraph — so on most steps
// it was below the fold (walk-in-her-shoes: "Back and Done pinned to the
// bottom"). One helper so pre-log Start and post-log Save (P5) pin the same way.
// render() gives #app the matching bottom padding whenever a bar is on screen.
function renderActionBar(inner: string): string {
  return `<div class="action-bar"><div class="action-bar-inner">${inner}</div></div>`;
}

// The Back + Done pair under every step (v47), pinned since v48. Back is hidden
// on the very first step, where there is nothing behind her. `quiet` = Done
// in the Back style (v48: a timed hold before it has run — the sage belongs to
// Start timer then; one sage per screen). Still tappable either way: she may
// have used her own clock.
function renderStepNav(doneLabel: string, quiet = false): string {
  const back = canGoBack()
    ? `<button class="btn-large btn-back" id="step-back" type="button" aria-label="Back one step">‹ Back</button>`
    : '';
  return renderActionBar(`
    <div class="step-nav">
      ${back}
      <button class="btn-large ${quiet ? 'btn-back btn-done-quiet' : 'btn-primary'}" id="next" type="button">${doneLabel}</button>
    </div>
  `);
}

// v48 (Sep 24 2026): ONE count for the whole workout, replacing the round pill +
// "Exercise N of M" (which restarted at 1 in every phase and every round) + the
// in-card phase label — three counters, none of which said how far along she
// was. Total = warm-up + main × rounds + upper back + 1 (the cool-down list is
// one step). The rest screen's index already points at the NEXT step, so it
// shows the next step's position; the round-break screen shows round 1's last.
function workoutStepPosition(w: Workout): { index: number; total: number } {
  const warm = w.warmup.length;
  const main = w.main.length;
  const rounds = effectiveRounds(w);
  const upper = w.upperBack?.length ?? 0;
  const total = warm + main * rounds + upper + 1;
  const i = state.currentExerciseIndex;
  let index: number;
  switch (state.currentPhase) {
    case 'warmup':
      index = i + 1;
      break;
    case 'main':
      index = warm + (Math.min(state.currentRound, rounds) - 1) * main + i + 1;
      break;
    case 'upperBack':
      index = warm + main * rounds + i + 1;
      break;
    default:
      index = total;
  }
  return { index: Math.max(1, Math.min(total, index)), total };
}

function phaseLabelFor(w: Workout): string {
  const base =
    state.currentPhase === 'main'
      ? `Main · Round ${state.currentRound} of ${effectiveRounds(w)}`
      : state.currentPhase === 'warmup'
        ? 'Warm-up'
        : state.currentPhase === 'upperBack'
          ? 'Upper back'
          : cooldownChipLabel(w);
  return `${base}${state.liteDay ? ' · lite' : ''}`;
}

// v48 · P7 (Sep 24 2026): the cool-down chip counts HER rows — "Stretch · 11",
// not "Stretch · 18 stretches" (a number that overstated the hill at the end of
// a workout, and said "stretch" twice — uxui cooldown). An empty list keeps the
// plain phase name rather than print "Stretch · 0".
function cooldownChipLabel(w: Workout): string {
  const n = groupStretchPairs(w.cooldown ?? []).length;
  return n > 0 ? `Stretch · ${n}` : 'Cool-down';
}

// The one progress line + the one bar (v48). `.round-indicator` stays on the
// left label — the resume tests key on it.
function renderProgressLine(w: Workout): string {
  const { index, total } = workoutStepPosition(w);
  // v48 · P8 (Sep 24 2026): no "23 of 23" on the cool-down. It's always the
  // last step, so the number only repeats the full bar. The list's own live
  // line ("~13 min · 5 of 11") is the one count on that screen (DECISIONS §2:
  // "one quiet count").
  const count =
    state.currentPhase === 'cooldown' ? '' : `<span class="step-count">${index} of ${total}</span>`;
  return `
    <div class="step-progress">
      <span class="round-indicator">${phaseLabelFor(w)}</span>
      ${count}
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${(index / total) * 100}%"></div>
    </div>`;
}

// v48 (Sep 24 2026): "New tonight" — a move that wasn't in this workout last
// encoded week AND she hasn't done this workout since the week began. Her first
// split squat sat on the same face as her 40th bridge (walk-in-her-shoes: "A
// 'New tonight' badge"). Nothing to decide — a label, gone after one session.
// Reused by P4/P5 (pre-log overview, home hero).
function isNewTonight(ex: Exercise, id: WorkoutId): boolean {
  const current = getWeekPlan();
  const idx = PROGRAM.indexOf(current);
  const prev = idx > 0 ? PROGRAM[idx - 1] : undefined;
  if (!prev) return false; // Week 1 of the program: everything is new, so nothing is
  const pw = prev.workouts[id];
  const phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  if (phases.some((p) => (pw[p] ?? []).some((e) => e.name === ex.name))) return false;
  const startMs = new Date(current.startsOn + 'T00:00:00').getTime();
  return !loadLogs().some((l) => l.workout === id && new Date(l.date).getTime() >= startMs);
}

// v48 · fix r1 (Sep 24 2026): "new" splits in two. A move that sat in ANY
// earlier week of the program (any workout, any block) is a RETURN, not a first
// — the 1 kg curl and the prone row were in her Round 1 Week 7 (UPPER_BACK_W7,
// Jun 13-19) before the arm pause, so "Firsts: 1 kg biceps curl" told her
// something untrue about her own history (fail-loud rule). Returns read "Back".
type TonightKind = 'new' | 'back';

function wasInEarlierWeek(name: string): boolean {
  const idx = PROGRAM.indexOf(getWeekPlan());
  if (idx <= 0) return false;
  const phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
  return PROGRAM.slice(0, idx).some((week) =>
    (['A', 'B', 'C'] as WorkoutId[]).some((wid) =>
      phases.some((p) => (week.workouts[wid][p] ?? []).some((e) => e.name === name))
    )
  );
}

function tonightKind(ex: Exercise, id: WorkoutId): TonightKind | null {
  if (!isNewTonight(ex, id)) return null;
  return wasInEarlierWeek(ex.name) ? 'back' : 'new';
}

// v48: is the current step a hold (wall sit, plank, wall lean) rather than a
// cardio lane? Lanes keep their v46 face — P3 owns them.
function isHoldStep(ex: Exercise): boolean {
  return !!ex.isTimed && !isIndoorLane(ex.name) && ex.name !== 'Outdoor walk';
}

// v48: round 2+ of the main block — the quieter face (visual folded, how-to
// never auto-open).
function isLaterRound(): boolean {
  return state.currentPhase === 'main' && state.currentRound > 1;
}

// The hold done-faces are keyed per STEP (phase|round|index), not per name: the
// wall sit comes round again in round 2, and that one hasn't been held yet —
// a name key would greet round 2 with "✓ held 45 s". Back to a held step
// shows its done-face again.
function holdStepKey(): string {
  return `${state.currentPhase}|${state.currentRound}|${state.currentExerciseIndex}`;
}

// Seconds held on THIS step so far (0 = not run yet).
function heldOnThisStep(): number {
  return state.heldSecFor[holdStepKey()] ?? 0;
}

function recordHeld(key: string, sec: number): void {
  // Max: a redo can add a better hold, never erase a real one (the saved wall
  // sit follows the same rule in captureWallSitIfPending).
  if (sec > 0) state.heldSecFor[key] = Math.max(state.heldSecFor[key] ?? 0, sec);
}

// v48 (Sep 24 2026): the quiet Stop on a running hold. Saves the REAL seconds
// — walk §4: "No way to say I held less". There used to be only a disabled
// "Running…" slab. Stopped during the 3-2-1 = nothing held, back to Ready.
function stopTimedHold(): void {
  const ex = getCurrentExercise();
  if (!ex) return;
  const t = activeTimer;
  if (t && t.kind === 'timed-exercise' && ex.durationSec) {
    const remainSec = Math.max(0, (t.endsAt - Date.now()) / 1000);
    recordHeld(holdStepKey(), Math.max(0, Math.round(ex.durationSec - remainSec)));
  }
  if (ex.name === 'Wall sit') captureWallSitIfPending(); // the saved number
  stopTimer();
  render();
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
  state.screen = 'post-log';
  render();
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
      lastRidePhase = null;
      // v48 · P3: the setup expander never reopens after the ride — forget any
      // before-ride open/close so the after-ride face starts it closed.
      delete state.openSections[`${ELLIPTICAL_NAME}::setup`];
    }
    const stepKey = holdStepKey(); // v48: the done-face belongs to this step
    startTimerCore('timed-exercise', duration, () => {
      if (!isIndoorLane(exerciseName)) recordHeld(stepKey, duration); // v48 "✓ held 45 s"
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
const LAST_DONE_KEY = 'workout-tracker:last-done';

// v48 · fix r1 (Sep 24 2026): `back` = moves returning from an earlier week
// (the 1 kg curl, the prone row) — kept apart from true firsts. Optional so a
// card saved before this fix still loads.
type LastDone = { id: string; firsts: string[]; back?: string[] };

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

function saveLastDone(d: LastDone): void {
  try {
    localStorage.setItem(LAST_DONE_KEY, JSON.stringify(d));
  } catch {
    // storage full or blocked — the Done card still shows without firsts
  }
}

function loadLastDone(): LastDone | null {
  try {
    const raw = localStorage.getItem(LAST_DONE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const o = v as { id?: unknown; firsts?: unknown; back?: unknown };
    if (typeof o.id !== 'string' || !Array.isArray(o.firsts)) return null;
    const strings = (a: unknown[]): string[] => a.filter((f): f is string => typeof f === 'string');
    return {
      id: o.id,
      firsts: strings(o.firsts),
      back: Array.isArray(o.back) ? strings(o.back) : [],
    };
  } catch {
    return null;
  }
}

// ---------- v48 · P5 (Sep 24 2026): arm feel + the 2 kg question ----------
// The 2 kg trigger is her Jul 3 buy-bigger ask; until now it waited on her
// "telling Claude" (gear card), and the app logs no arm reps (assumptions, 19).
// One optional tap on the two 1 kg moves — inside her 2-tap line — and home
// ASKS once two sessions in a row felt easy. A question, never a tell: the
// program is Lisa's call (DECISIONS §4).
const ARM_FEEL_STEPS: Record<string, keyof ArmFeelState> = {
  '1 kg biceps curl': 'curl',
  'Prone row (bodyweight)': 'row',
};
const ARM_FEEL_VALUES: readonly ArmFeel[] = ['easy', 'right', 'hard'];
const TWO_KG_NOTED_KEY = 'workout-tracker:twokg-noted';

function isArmFeel(v: unknown): v is ArmFeel {
  return typeof v === 'string' && (ARM_FEEL_VALUES as readonly string[]).includes(v);
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

// "curl=easy;row=right" — the shape the arm_feel CHECK accepts; null when none.
function armFeelString(f: ArmFeelState): string | null {
  const parts = [f.curl ? `curl=${f.curl}` : '', f.row ? `row=${f.row}` : ''].filter(
    (p) => p !== ''
  );
  return parts.length > 0 ? parts.join(';') : null;
}

// Every value in a saved "curl=easy;row=right" (unknown parts are ignored).
function armFeelValues(s: string): string[] {
  return s
    .split(';')
    .map((part) => part.split('=')[1] ?? '')
    .filter((v) => v !== '');
}

// The two newest sessions that carry a feel: both exist and every value in
// both is "easy" → the newer one's id (the "Noted" key). Otherwise null.
function twoKgQuestionDue(logs: LogEntry[]): string | null {
  const felt = logs
    .filter((l) => typeof l.armFeel === 'string' && l.armFeel.trim() !== '')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2);
  if (felt.length < 2) return null;
  const allEasy = felt.every((l) => {
    const values = armFeelValues(l.armFeel ?? '');
    return values.length > 0 && values.every((v) => v === 'easy');
  });
  return allEasy ? (felt[0]?.id ?? null) : null;
}

function twoKgNotedId(): string | null {
  try {
    return localStorage.getItem(TWO_KG_NOTED_KEY);
  } catch {
    return null;
  }
}

// A quiet question card, never sage (the hero keeps the one sage).
function renderTwoKgQuestion(logs: LogEntry[]): string {
  const due = twoKgQuestionDue(logs);
  if (!due || twoKgNotedId() === due) return '';
  return `
    <div class="card twokg-card" id="twokg-card">
      <p class="twokg-text">The 1 kg felt easy twice. Ask Lisa about 2 kg?</p>
      <button class="btn-chip twokg-noted" id="twokg-noted" type="button" data-twokg-id="${escapeHtml(due)}">Noted</button>
    </div>`;
}

// v45: one save at a time. The walk lane awaits Google Fit (up to 5 s) before
// saving, and a second tap on "Save & finish" in that window wrote a 2nd row.
let savingLog = false;

async function logCompleteAndHome(): Promise<void> {
  if (!state.selectedWorkout || savingLog) return;
  savingLog = true;
  try {
    await saveCompletedSession();
  } finally {
    savingLog = false;
  }
}

async function saveCompletedSession(): Promise<void> {
  if (!state.selectedWorkout) return;
  harvestWorkoutWalk(); // no-op unless a walk step is somehow still open
  if (!workoutWalk) workoutWalk = storedWorkoutWalk(); // survived an app close (v45)
  // By now the walk (first exercise) ended long ago, so Google Fit has synced it.
  // v48 · P3 (Sep 24 2026): Fit's count is the ONLY step number — saved to
  // walk_steps when Fit answers, else null (the motion estimate is archived),
  // and never displayed. Brief await (Fit replies fast); never blocks the log.
  let walkFitSteps: number | null = null;
  if (workoutWalk && workoutWalk.startMs && workoutWalk.endMs) {
    const fit = await fetchFitSteps(workoutWalk.startMs, workoutWalk.endMs);
    if (fit !== null && fit > 0) walkFitSteps = fit;
  }
  const completedAt = new Date().toISOString();
  const startedAt = state.startedAt ?? completedAt;
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
        : workoutWalk
          ? 'walk'
          : null;
  const cardioMinutes =
    cardioLane === 'elliptical'
      ? (laneDone ?? prescribedElliptical)
      : cardioLane === 'apartment'
        ? (laneDone ?? prescribedApartment)
        : cardioLane === 'walk' && workoutWalk
          ? workoutWalk.minutes
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
  const { firsts, back } = sessionFirsts(onElliptical);
  const stored = saveLog({
    date: completedAt,
    workout: state.selectedWorkout,
    // v46: a slider she never moved is not a reading — null, shown as "—".
    capacityBefore: state.capacityBeforeTouched ? state.capacityBefore : null,
    capacityAfter: state.capacityAfterTouched ? state.capacityAfter : null,
    wallSitSec: state.wallSitSec,
    backPain: state.backPainTouched ? state.backPain : null,
    word: state.word,
    startedAt,
    completedAt,
    ...(leftOpen ? {} : { durationSec: rawDurationSec }),
    walkMinutes: workoutWalk ? workoutWalk.minutes : null,
    walkSteps: walkFitSteps,
    walkMeters: null, // v48 · P3: GPS distance archived — minutes only
    notes,
    cardioLane,
    cardioMinutes,
    ellipticalLevel: onElliptical ? ellipticalLevel() : null,
    ellipticalKm: onElliptical ? ellipticalKm() : null,
    ellipticalPulse: onElliptical ? ellipticalPulse() : null,
    sessionNote,
    liteDay: state.liteDay,
    // v48 · P5 (Sep 24 2026): "curl=easy;row=right" — only the parts she
    // tapped, null when none (matches the arm_feel CHECK).
    armFeel: armFeelString(state.armFeel),
    voicePlays: state.voicePlays,
  });
  if (stored.id) saveLastDone({ id: stored.id, firsts, back });
  resetState();
  render();
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  void pushLogToSupabase(stored).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    updateSyncIndicator();
  });
}

// Screens that count as "in a workout" for resume purposes.
const RESUMABLE_SCREENS: readonly AppScreen[] = ['workout', 'post-log'];

type ActiveSessionSnapshot = {
  screen: AppScreen;
  selectedWorkout: WorkoutId;
  capacityBefore: number;
  capacityAfter: number;
  wallSitSec: number;
  backPain: number;
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
  // v48 · P7: her cool-down ticks survive an app close (she keeps her place).
  stretchTicks: Record<string, boolean>;
};

function saveActiveSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!state.selectedWorkout || !RESUMABLE_SCREENS.includes(state.screen)) return;
    const snap: ActiveSessionSnapshot = {
      screen: state.screen,
      selectedWorkout: state.selectedWorkout,
      capacityBefore: state.capacityBefore,
      capacityAfter: state.capacityAfter,
      wallSitSec: state.wallSitSec,
      backPain: state.backPain,
      capacityBeforeTouched: state.capacityBeforeTouched,
      capacityAfterTouched: state.capacityAfterTouched,
      backPainTouched: state.backPainTouched,
      word: state.word,
      sessionNote: state.sessionNote,
      voicePlays: state.voicePlays,
      currentRound: state.currentRound,
      currentPhase: state.currentPhase,
      currentExerciseIndex: state.currentExerciseIndex,
      startedAt: state.startedAt,
      pausedAt: state.pausedAt,
      pausedMs: state.pausedMs,
      liteDay: state.liteDay,
      roundBreak: state.roundBreak,
      finishHereLitePrev: state.finishHereLitePrev,
      stoppedEarlyAt: state.stoppedEarlyAt,
      stoppedEarlyLitePrev: state.stoppedEarlyLitePrev,
      armFeel: state.armFeel,
      stretchTicks: state.stretchTicks,
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snap));
  } catch {
    // Non-fatal — resume is a convenience, never block the app on it.
  }
}

function clearActiveSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Non-fatal.
  }
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
    const w = getWorkoutById(snap.selectedWorkout);
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
    return {
      screen: snap.screen as AppScreen,
      selectedWorkout: snap.selectedWorkout,
      capacityBefore: snap.capacityBefore ?? 5,
      capacityAfter: snap.capacityAfter ?? 5,
      wallSitSec: snap.wallSitSec ?? 0,
      backPain: snap.backPain ?? 0,
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
      // v48 · P7: a pre-P7 snapshot has no ticks → {} (nothing ticked).
      stretchTicks: sanitizeStretchTicks(snap.stretchTicks),
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
  state.currentPhase = snap.currentPhase;
  state.currentExerciseIndex = snap.currentExerciseIndex;
  state.currentRound = snap.currentRound;
  state.capacityBefore = snap.capacityBefore;
  state.capacityAfter = snap.capacityAfter;
  state.wallSitSec = snap.wallSitSec;
  state.backPain = snap.backPain;
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
  state.armFeel = snap.armFeel;
  state.stretchTicks = snap.stretchTicks;
  state.backSomethingOpen = false;
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
}

// A snapshot too old to resume silently (see STALE_SESSION_MS). Held here until
// she answers the home card; the snapshot stays in localStorage meanwhile so a
// reload asks again rather than losing it.
let staleSnapshot: ActiveSessionSnapshot | null = null;

// Rehydrate an in-progress session on load — unless it was left open long
// enough that "resume" would be a lie, in which case home asks instead.
function restoreActiveSession(): boolean {
  const snap = readActiveSnapshot();
  if (!snap) return false;
  const startedMs = snap.startedAt ? new Date(snap.startedAt).getTime() : NaN;
  if (Number.isFinite(startedMs) && Date.now() - startedMs > STALE_SESSION_MS) {
    staleSnapshot = snap;
    return false;
  }
  applyActiveSnapshot(snap);
  return true;
}

// "Yes, I did it": log the left-open workout for the day it was STARTED. No
// post-log ever happened, so after-capacity, back pain, end time and duration
// are unknown — saved as null (shown "—"), with a note saying why. The one
// number that was really entered, capacity-before, is kept.
function logStaleSessionAsDone(): void {
  const snap = staleSnapshot;
  if (!snap) return;
  const startedAt = snap.startedAt ?? new Date().toISOString();
  const stored = saveLog({
    date: startedAt,
    workout: snap.selectedWorkout,
    capacityBefore: snap.capacityBeforeTouched ? snap.capacityBefore : null, // v46: only if she moved it
    capacityAfter: null,
    wallSitSec: snap.wallSitSec,
    backPain: null,
    word: snap.word,
    startedAt,
    notes:
      'logged after the fact — Done was never tapped, so no end time, after-capacity or back pain',
  });
  staleSnapshot = null;
  clearActiveSession();
  render();
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  void pushLogToSupabase(stored).then((ok) => {
    state.syncStatus = ok ? 'synced' : 'offline';
    updateSyncIndicator();
  });
}

function discardStaleSession(): void {
  staleSnapshot = null;
  clearActiveSession();
  render();
}

// "Keep going": resume it anyway. The Done safety net will blank the duration.
function continueStaleSession(): void {
  const snap = staleSnapshot;
  if (!snap) return;
  staleSnapshot = null;
  applyActiveSnapshot(snap);
  render();
}

function renderStaleSessionCard(snap: ActiveSessionSnapshot): string {
  const when = snap.startedAt
    ? `${formatDateLong(snap.startedAt)} at ${formatTime(snap.startedAt)}`
    : 'earlier';
  return `
    <div class="stale-card" id="stale-session-card" role="region" aria-label="Unfinished workout">
      <div class="stale-card-title">Workout ${snap.selectedWorkout} was left open</div>
      <div class="stale-card-sub">You started it ${when} and never tapped Done. Did you do it?</div>
      <div class="btn-row stale-card-row">
        <button class="btn btn-primary" id="stale-finished" type="button">Yes, I did it</button>
        <button class="btn" id="stale-discard" type="button">No, throw it away</button>
      </div>
      <button class="quit-link stale-card-continue" id="stale-continue" type="button">Keep going where I left off</button>
    </div>
  `;
}

function resetState(): void {
  stopTimer();
  clearActiveSession();
  state.screen = 'home';
  // Reset viewed week to current when returning to home from a session.
  viewedWeekOffset = 0;
  state.selectedWorkout = null;
  state.capacityBefore = 5;
  state.capacityAfter = 5;
  state.wallSitSec = 0;
  state.backPain = 0;
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
  state.armFeel = {}; // v48 · P5
  state.backSomethingOpen = false;
  state.stretchTicks = {}; // v48 · P7
  stopVoiceNote();
  clearApartmentCardio(); // the cardio lane is a per-session choice
  clearElliptical();
  localStorage.removeItem(WW_RESULT_KEY); // the saved walk's numbers are logged now
  state.historyDetailId = null;
  state.detailReturnTo = null;
}

// ---------- sync ----------

type RemoteSession = {
  id: string;
  date: string;
  workout_type: WorkoutId;
  capacity_before_1_10: number | null;
  capacity_after_1_10: number | null;
  wall_sit_seconds: number | null;
  pain_back_0_10: number | null;
  one_word: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  notes?: string | null;
  walk_minutes?: number | null;
  walk_steps?: number | null;
  walk_meters?: number | null;
  // v48 (Sep 24 2026): the nine new columns. Optional — a server that hasn't
  // run the migration, or an old row, simply doesn't carry them.
  cardio_lane?: 'walk' | 'apartment' | 'elliptical' | null;
  cardio_minutes?: number | null;
  elliptical_level?: number | null;
  // numeric(5,2) — PostgREST may hand it back as a string.
  elliptical_km?: number | string | null;
  elliptical_pulse?: number | null;
  session_note?: string | null;
  lite_day?: boolean | null;
  arm_feel?: string | null;
  voice_plays?: number | null;
};

// How many sessions a pull fetches (newest first) and the phone keeps. The
// merge below uses it to know whether the server's answer is the WHOLE history
// or just a window. v45: 50 → 200 — she had 39 rows and ~12 a month, so the
// phone's History was about a month from silently dropping her oldest weeks.
const PULL_LIMIT = 200;

// Group 1E: id-keyed merge. Remote rows replace local-synced rows with the same
// id; a local-unsynced row never loses its write.
// v33 (Sep 11 2026): a row DELETED in Supabase must vanish from the phone too.
// Until now the pull only added and updated, so a row removed on the server
// (the false Thu-Sep-10 "B") stayed in her history forever. Rule: a local row
// the server once had (synced) that is missing from the fetched window is gone.
// Rows older than a full 50-row window are left alone (they may simply be past
// the window), and an empty server answer is never read as "delete everything".
function mergeRemoteSessions(local: LogEntry[], remote: RemoteSession[]): LogEntry[] {
  const remoteIds = new Set(remote.map((r) => r.id));
  const windowIsEverything = remote.length < PULL_LIMIT;
  const oldestRemoteMs =
    remote.length > 0 ? Math.min(...remote.map((r) => new Date(r.date).getTime())) : NaN;
  const byId = new Map<string, LogEntry>();
  for (const l of local) {
    if (!l.id) continue;
    if (l.synced && remote.length > 0 && !remoteIds.has(l.id)) {
      const insideWindow = windowIsEverything || new Date(l.date).getTime() >= oldestRemoteMs;
      if (insideWindow) continue; // deleted on the server → drop it here too
    }
    byId.set(l.id, l);
  }
  for (const r of remote) {
    const existing = byId.get(r.id);
    if (existing && !existing.synced) {
      // Local-unsynced wins on content. But the server having its id means an
      // earlier push DID land — mark it synced so it stops re-pushing (v45).
      byId.set(r.id, { ...existing, synced: true });
      continue;
    }
    byId.set(r.id, {
      id: r.id,
      date: r.date,
      workout: r.workout_type,
      // v39: no `?? 0`. A missing reading stays missing and renders as "—".
      capacityBefore: r.capacity_before_1_10,
      // null stays null (v32): a missing after-reading is "—", not 0.
      capacityAfter: r.capacity_after_1_10 ?? null,
      wallSitSec: r.wall_sit_seconds ?? 0,
      backPain: r.pain_back_0_10 ?? null,
      word: r.one_word ?? '',
      startedAt: r.started_at ?? undefined,
      completedAt: r.completed_at ?? undefined,
      durationSec: r.duration_seconds ?? undefined,
      notes: r.notes ?? null,
      // v45: the cardio numbers round-trip too — before this, every app open
      // rebuilt synced rows without them, so the phone forgot what Supabase held.
      walkMinutes: r.walk_minutes ?? null,
      walkSteps: r.walk_steps ?? null,
      walkMeters: r.walk_meters ?? null,
      // v48: the new columns round-trip the same way; null stays null.
      cardioLane: r.cardio_lane ?? null,
      cardioMinutes: r.cardio_minutes ?? null,
      ellipticalLevel: r.elliptical_level ?? null,
      ellipticalKm: r.elliptical_km == null ? null : Number(r.elliptical_km),
      ellipticalPulse: r.elliptical_pulse ?? null,
      sessionNote: r.session_note ?? null,
      liteDay: r.lite_day ?? null,
      armFeel: r.arm_feel ?? null,
      voicePlays: r.voice_plays ?? null,
      synced: true,
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
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
  };
  w.__wtMergeRemoteSessions = mergeRemoteSessions;
  w.__wtIsValidLogEntry = isValidLogEntry;
  w.__wtComputeWeekTotals = computeWeekTotals;
  // v48: the push payloads are pure — tested here since sync is off in tests.
  w.__wtSessionPayload = sessionPayload;
  w.__wtLegacySessionPayload = legacySessionPayload;
}

async function pullFromSupabase(): Promise<void> {
  if (syncDisabled()) return;
  try {
    const sRes = await fetch(
      `${SUPABASE_URL}/rest/v1/workout_sessions?select=*&order=date.desc&limit=${PULL_LIMIT}`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      }
    );
    if (sRes.ok && sRes.headers.get('X-SW-Cache') === '1') {
      // v45: offline — the service worker answered from its cache. The phone's
      // own list is at least as fresh as that copy, so don't merge (the v33
      // delete rule would drop anything synced after the cache was taken).
    } else if (sRes.ok) {
      const remote: RemoteSession[] = await sRes.json();
      writeLogs(mergeRemoteSessions(loadLogs(), remote));
    } else {
      console.warn('[sync] pull sessions failed:', sRes.status);
    }
    if (state.screen === 'home') render();
  } catch (err) {
    console.warn('[sync] pull threw:', err);
  }
}

async function flushPendingSyncs(): Promise<void> {
  if (syncDisabled()) {
    // v48 · P4 (Sep 24 2026): under automation nothing syncs, so say so rather
    // than sit on "syncing…" forever (walk-in-her-shoes: the pill never settled
    // in the test setup). Nothing pending → the indicator is empty.
    state.syncStatus = 'offline';
    updateSyncIndicator();
    return;
  }
  const pendingLogs = loadLogs().filter((l) => !l.synced && l.id);
  if (pendingLogs.length === 0) {
    state.syncStatus = 'synced';
    updateSyncIndicator();
    return;
  }
  state.syncStatus = 'syncing';
  updateSyncIndicator();
  let allOk = true;
  for (const entry of pendingLogs) {
    const ok = await pushLogToSupabase(entry);
    if (!ok) allOk = false;
  }
  state.syncStatus = allOk ? 'synced' : 'offline';
  updateSyncIndicator();
}

function updateSyncIndicator(): void {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.textContent = syncIndicatorText();
  el.className = `sync-indicator sync-${state.syncStatus}`;
}

function syncIndicatorText(): string {
  const pending = loadLogs().filter((l) => !l.synced).length;
  if (state.syncStatus === 'syncing') return 'syncing…';
  if (pending > 0) return `offline · ${pending} pending`;
  // v48 · P4 (Sep 24 2026): "synced ✓" hides — it was a third status line above
  // the first action (assumptions, Kill). The word shows only when something
  // is syncing or waiting, which is exactly when it matters.
  return '';
}

// ---------- formatting ----------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

// The big countdown face. Holds are all under a minute so they keep reading as
// bare seconds; the apartment-cardio timer runs 10-25 minutes, where a raw
// "600" reads as nonsense — those show as m:ss.
function formatTimerDisplay(sec: number): string {
  if (sec < 60) return String(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PROGRAM_START_DATE = '2026-05-02';

// Rounds — each fresh start of the program. Week numbers restart at 1 inside
// each round; everything from older rounds stays fully browsable (archive-not-
// delete). Round 2 = the post-summer restart, her call Aug 30 2026: "the past
// data goes to an archive — accessible, but that was a closed chapter. Now
// we're starting a new round." Each start date must be a Saturday (weeks are
// Sat-Fri throughout the app).
const ROUNDS: { num: number; start: string }[] = [
  { num: 1, start: PROGRAM_START_DATE },
  { num: 2, start: '2026-08-29' },
];

function getRoundFor(date: Date): { num: number; start: string } {
  let chosen = ROUNDS[0]!;
  for (const r of ROUNDS) {
    if (new Date(r.start + 'T00:00:00').getTime() <= date.getTime()) chosen = r;
  }
  return chosen;
}

// Calendar weeks that do NOT advance the program clock. The week keeps a
// visible blank row in the weekly views (her call Jul 19 2026: "show a space
// for the missing week") but the NEXT week inherits its number. Keyed by the
// Saturday the week starts on (YYYY-MM-DD) → short label shown on that row.
const SKIPPED_WEEKS: Record<string, string> = {
  '2026-07-11': 'Sick', // Jul 11-17 2026 — sick week, left blank, no level-up
  // Jul 25 – Aug 28 2026 — the summer break between Round 1 and Round 2
  // (trip prep + vacation). Labeled rows, no level-up, honest gaps.
  '2026-07-25': 'Break',
  '2026-08-01': 'Break',
  '2026-08-08': 'Break',
  '2026-08-15': 'Break',
  '2026-08-22': 'Break',
};

// v48 · P3 (Sep 24 2026): a Date's LOCAL calendar day as YYYY-MM-DD.
function localIsoDate(d: Date): string {
  return weekStartIso(d);
}

function weekStartIso(weekStart: Date): string {
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${weekStart.getFullYear()}-${m}-${d}`;
}

function getProgramWeek(date: Date = new Date()): {
  num: number;
  round: number;
  start: Date;
  end: Date;
  skippedLabel: string | null;
} {
  const round = getRoundFor(date);
  const start = new Date(round.start + 'T00:00:00');
  const diffDays = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const calNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (calNum - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  // Skips only count within the active round — each round's clock starts fresh.
  const skipsBefore = Object.keys(SKIPPED_WEEKS).filter((s) => {
    const t = new Date(s + 'T00:00:00').getTime();
    return t >= start.getTime() && t < weekStart.getTime();
  }).length;
  return {
    num: Math.max(1, calNum - skipsBefore),
    round: round.num,
    start: weekStart,
    end: weekEnd,
    skippedLabel: SKIPPED_WEEKS[weekStartIso(weekStart)] ?? null,
  };
}

function formatWeekRange(start: Date, end: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = `${months[start.getMonth()]} ${start.getDate()}`;
  const endStr = sameMonth ? `${end.getDate()}` : `${months[end.getMonth()]} ${end.getDate()}`;
  return `${startStr}–${endStr}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Today's pick rotation (group 2I): A→B→C→A.
function getTodaysPick(): WorkoutId {
  const logs = loadLogs();
  if (logs.length === 0) return 'A';
  const last = logs[0];
  if (!last) return 'A';
  if (last.workout === 'A') return 'B';
  if (last.workout === 'B') return 'C';
  return 'A';
}

// Week dots (group 2J): one entry per weekday. Color is the workout letter.
type WeekDotInfo = { letter: string; logId: string | null; date: Date; workout: WorkoutId | null };

// Which week the user is currently looking at on the home screen. 0 = this
// (current) Sat-Fri week. 1 = one week ago. Etc. Module-level — purely UI state.
let viewedWeekOffset = 0;

// Saturday of the Sat-Fri week that's `offset` weeks before today.
function saturdayForOffset(offset: number): Date {
  const today = new Date();
  const day = today.getDay(); // 0=Sun..6=Sat
  const satOffset = (day + 1) % 7; // Sat=0, Sun=1, Mon=2, ..., Fri=6
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - satOffset - offset * 7);
  saturday.setHours(0, 0, 0, 0);
  return saturday;
}

// ---------------------------------------------------------------------------
// SATURDAY IS THE SWING DAY (v42, Sep 19 2026) — her rule, now automatic.
// May 15 2026: "a week is saturday to friday, but i can be flexible if i need
// saturday to be brought into week bf if i didnt do 3." That was recorded as
// "her call, situational — don't auto-attribute". Sep 19 2026, 22:46, after she
// finished Week 3's third session on Saturday night: "you just set it up, sat is
// swing." So it is a RULE now: a session logged on a SATURDAY counts toward the
// week that just ended (the previous Sat→Fri) if that week is still short of 3;
// otherwise it opens the new week. Sunday→Friday sessions never swing.
// Attribution runs chronologically, so a Saturday that swung back is already
// counted before the next Saturday is judged. The Supabase row keeps its TRUE
// timestamp — the swing lives in how the app COUNTS, never in the data.
// Every "sessions in week X" surface goes through attributeSessionsToWeeks so
// the count, the 3-slot rows, the week card and the progress bars agree.
// ---------------------------------------------------------------------------
const SESSIONS_PER_WEEK_TARGET = 3;

// Local-midnight Saturday on/before the given moment, as ms. DST-safe (setDate).
function calendarSaturdayMs(dateIso: string): number {
  const d = new Date(dateIso);
  const back = (d.getDay() + 1) % 7; // Sat=0, Sun=1, …, Fri=6
  const sat = new Date(d);
  sat.setDate(d.getDate() - back);
  sat.setHours(0, 0, 0, 0);
  return sat.getTime();
}

function previousSaturdayMs(saturdayMs: number): number {
  const d = new Date(saturdayMs);
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Each log → the local-midnight Saturday (ms) of the week it COUNTS toward. */
function attributeSessionsToWeeks(logs: LogEntry[]): Map<LogEntry, number> {
  const out = new Map<LogEntry, number>();
  const counts = new Map<number, number>();
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  for (const l of sorted) {
    const base = calendarSaturdayMs(l.date);
    const isSaturday = new Date(l.date).getDay() === 6;
    let weekMs = base;
    if (isSaturday) {
      const prev = previousSaturdayMs(base);
      const prevCount = counts.get(prev) ?? 0;
      // Swing only to COMPLETE a week she was working (1 or 2 sessions). A week
      // with zero sessions is a skipped week (break, sickness, pre-program), and
      // the rule is "bring Saturday in if I didn't do 3", not "resurrect a week I
      // never started" — that would also make a fresh Saturday session vanish
      // from "this week" for no reason she could see.
      if (prevCount > 0 && prevCount < SESSIONS_PER_WEEK_TARGET) weekMs = prev;
    }
    out.set(l, weekMs);
    counts.set(weekMs, (counts.get(weekMs) ?? 0) + 1);
  }
  return out;
}

/** Sessions attributed to the week whose local-midnight Saturday is `saturday`, oldest first. */
function sessionsAttributedTo(
  logs: LogEntry[],
  saturday: Date,
  attribution: Map<LogEntry, number> = attributeSessionsToWeeks(logs)
): LogEntry[] {
  const key = saturday.getTime();
  return logs
    .filter((l) => attribution.get(l) === key)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// (v48 · P6, Sep 24 2026: swungOutOfWeek() retired — its one reader, the
// "Sat counted for last week" note on the Week-by-week summary, is gone; home's
// week line names the swing in words.)

function getWeekDots(offset = 0): WeekDotInfo[] {
  const logs = loadLogs();
  // Allison's week = Sat..Fri (Shabbat-anchored). See memory
  // `reference_week_definition.md`. Saturday is index 0; Friday is index 6.
  const dotLabels = ['S', 'S', 'M', 'T', 'W', 'T', 'F'];
  const saturday = saturdayForOffset(offset);

  return dotLabels.map((label, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const hit = logs.find((l) => {
      const t = new Date(l.date).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
    return {
      letter: label,
      logId: hit?.id ?? null,
      date: d,
      workout: hit?.workout ?? null,
    };
  });
}

// Count sessions in the Sat-Fri week `offset` weeks back.
function getWeekCount(offset = 0): number {
  // Swing-aware (v42): a Saturday session may count toward the week before.
  return sessionsAttributedTo(loadLogs(), saturdayForOffset(offset)).length;
}

// Program week info anchored on the Saturday of the viewed Sat-Fri week.
function getViewedProgramWeek(offset = 0): {
  num: number;
  round: number;
  start: Date;
  end: Date;
  skippedLabel: string | null;
} {
  return getProgramWeek(saturdayForOffset(offset));
}

// ---------- visual layer (group 3) ----------

// Primary on-screen still for an exercise: the curated loop JPG if we have one,
// otherwise the first how-to illustration (SVG/JPG). Allison 2026-06-06: every
// actual exercise should show a PICTURE — not just a "watch video" poster —
// AND keep its video. Every real exercise has a how-to frame, so this gives
// picture + video coverage without sourcing new assets.
function getPrimaryStill(exerciseName: string): { svg: string } | { image: string } | null {
  const v = EXERCISE_VISUALS[exerciseName];
  if (v?.loop) return { image: v.loop };
  const frame = EXERCISE_HOWTO[exerciseName]?.frames?.[0];
  if (frame?.svg) return { svg: frame.svg };
  if (frame?.image) return { image: frame.image };
  return null;
}

// One-time kit setup for THIS week's version of an exercise (v37). Opens by
// default the first time she meets it — a step she has not done yet should not
// be hidden behind a tap — and remembers being closed for the rest of the
// session. Its video is a SECOND video, separate from the movement video in
// EXERCISE_VISUALS, because tying a band and doing a clamshell are two things.
function renderExerciseSetup(ex: Exercise): string {
  const s = ex.setup;
  if (!s) return '';
  const key = `setup:${ex.name}`;
  const open = state.openSections[key] !== false; // default OPEN
  const videoOpen = state.videoExpandedFor === key;
  const stepsHtml = s.steps.map((t) => `<li>${t}</li>`).join('');
  return `
    <div class="setup-block${open ? ' setup-block-open' : ''}">
      <button class="setup-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${open}">
        <span class="setup-toggle-title">🔧 ${escapeHtml(s.title)}</span>
        <span class="setup-toggle-chev">${open ? '▾' : '▸'}</span>
      </button>
      ${
        open
          ? `<div class="setup-body">
        <ol class="setup-steps">${stepsHtml}</ol>
        ${s.footnote ? `<p class="setup-footnote">${s.footnote}</p>` : ''}
        ${
          s.youtubeId
            ? `<button class="visual-video-toggle" data-expand-video="${escapeHtml(key)}" type="button" aria-expanded="${videoOpen}">
                ${videoOpen ? '× Hide the video' : '▶ Watch someone do it (40 sec)'}
              </button>
              ${
                videoOpen
                  ? `<div class="visual-video-wrap">
                      <iframe
                        src="https://www.youtube.com/embed/${escapeHtml(s.youtubeId)}?rel=0&modestbranding=1"
                        title="${escapeHtml(s.title)}"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        loading="lazy"
                      ></iframe>
                    </div>`
                  : ''
              }
              ${s.attribution ? `<div class="visual-attribution">${escapeHtml(s.attribution)}</div>` : ''}`
            : ''
        }
      </div>`
          : ''
      }
    </div>
  `;
}

// `compact` (v48, Sep 24 2026): one quiet "▶ Watch how it looks" row that
// expands on tap — used from round 2 on (she has just done the move; walk:
// "Round 2 notes closed") and ALWAYS for moves with no still, where the old
// face was a 342×257 black poster with a play icon (split squat, bird dog).
function renderExerciseVisual(exerciseName: string, compact = false): string {
  const v = EXERCISE_VISUALS[exerciseName];
  const still = getPrimaryStill(exerciseName);
  const youtubeId = v?.youtubeId;

  // Nothing to show at all.
  if (!still && !youtubeId) return '';

  const isExpanded = state.videoExpandedFor === exerciseName;
  const safeAlt = escapeHtml(`${exerciseName} — exercise demonstration`);
  const attribution = v?.attribution ? escapeHtml(v.attribution) : '';

  const stillMarkup = still
    ? 'svg' in still
      ? `<div class="exercise-visual-still exercise-visual-still-svg">${still.svg}</div>`
      : `<img class="exercise-visual-still" src="${escapeHtml(still.image)}" alt="${safeAlt}" loading="lazy" />`
    : '';

  const videoIframe = youtubeId
    ? `<div class="visual-video-wrap">
        <iframe
          src="https://www.youtube.com/embed/${escapeHtml(youtubeId)}?rel=0&modestbranding=1"
          title="${safeAlt}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>`
    : '';

  // v48: the compact row (round 2+, or no still to show). Open = the picture
  // (if any) and the video together, closed = one quiet line.
  if (compact || !still) {
    return `
      <div class="exercise-visual exercise-visual-compact">
        <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
          ${isExpanded ? '× Hide' : '▶ Watch how it looks'}
        </button>
        ${isExpanded ? `${stillMarkup}${videoIframe}` : ''}
        ${isExpanded && attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
  }

  // Still picture (trusted inline SVG, or a curated/illustration JPG). Shown as
  // the primary visual; the video sits behind a "Watch full video" expander.
  // (v48: the no-still video POSTER that used to follow is gone — a still-less
  // move takes the compact row above. Autoplay stays off: the embed loads on tap.)
  const videoBlock = youtubeId
    ? `
      <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
        ${isExpanded ? '× Hide video' : '▶ Watch full video'}
      </button>
      ${isExpanded ? videoIframe : ''}`
    : '';

  return `
      <div class="exercise-visual">
        ${stillMarkup}
        ${videoBlock}
        ${attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
}

function renderHowToFrame(frame: HowToFrame, idx: number, exerciseName: string): string {
  const safeAlt = escapeHtml(`${exerciseName} — frame ${idx + 1}`);
  // Visual: either an <img> or inline SVG. SVG is trusted (hand-coded in our
  // own source) so we render it directly.
  const visualHtml = frame.svg
    ? `<div class="howto-frame-visual howto-frame-visual-svg">${frame.svg}</div>`
    : frame.image
      ? `<div class="howto-frame-visual"><img src="${escapeHtml(frame.image)}" alt="${safeAlt}" loading="lazy" /></div>`
      : '<div class="howto-frame-visual howto-frame-visual-empty"></div>';

  return `
    <div class="howto-frame">
      ${visualHtml}
      <div class="howto-frame-text">
        <div class="howto-cue howto-cue-do">
          <span class="howto-cue-icon" aria-hidden="true">✓</span>
          <span class="howto-cue-label">Do:</span>
          <span class="howto-cue-body">${escapeHtml(frame.do)}</span>
        </div>
        ${
          frame.avoid
            ? `<div class="howto-cue howto-cue-avoid">
            <span class="howto-cue-icon" aria-hidden="true">✗</span>
            <span class="howto-cue-label">Avoid:</span>
            <span class="howto-cue-body">${escapeHtml(frame.avoid)}</span>
          </div>`
            : ''
        }
      </div>
    </div>
  `;
}

// ---------- per-exercise voice note (Allison Jul 9 2026) ----------
// One <audio> plays at a time. The button toggles play/pause; button visuals
// reflect playback and are re-synced after a re-render (opening a dropdown
// re-renders the card, but the detached Audio keeps playing).
let voiceAudio: HTMLAudioElement | null = null;
let voiceAudioSrc: string | null = null;

function setVoiceBtnPlaying(btn: HTMLElement, playing: boolean): void {
  btn.classList.toggle('voice-note-playing', playing);
  const icon = btn.querySelector('.voice-note-icon');
  const label = btn.querySelector('.voice-note-label');
  if (icon) icon.textContent = playing ? '⏸' : '▶';
  if (label) label.textContent = playing ? 'Playing… (tap to stop)' : 'Listen — how to do it';
}

function stopVoiceNote(): void {
  if (voiceAudio) {
    voiceAudio.pause();
    voiceAudio = null;
  }
  voiceAudioSrc = null;
}

function toggleVoiceNote(btn: HTMLButtonElement, src: string): void {
  if (typeof Audio === 'undefined') return; // no audio in this environment
  // Same note already playing → stop it.
  if (voiceAudio && voiceAudioSrc === src && !voiceAudio.paused) {
    voiceAudio.pause();
    return;
  }
  stopVoiceNote(); // stop any other note first
  const audio = new Audio(src);
  voiceAudio = audio;
  voiceAudioSrc = src;
  audio.addEventListener('play', () => setVoiceBtnPlaying(btn, true));
  // v48 (Sep 24 2026): count each play that actually STARTS (a stop is not a
  // play; an autoplay-blocked tap never fires this). Her words: "I can hear
  // details in audio better"; Gemini said she never plays them — count instead
  // of guessing. Each tap makes a fresh Audio, so `once` = one count per play.
  audio.addEventListener(
    'play',
    () => {
      state.voicePlays += 1;
      saveActiveSession();
    },
    { once: true }
  );
  audio.addEventListener('pause', () => setVoiceBtnPlaying(btn, false));
  audio.addEventListener('ended', () => setVoiceBtnPlaying(btn, false));
  void audio.play().catch(() => {
    /* gesture/autoplay policy — safe to ignore, she can tap again */
  });
}

// One collapsed dropdown inside the enriched detail card. Closed by default;
// its open-state lives in state.openSections keyed "<exercise>::<section>".
function renderDetailSection(
  exerciseName: string,
  sectionKey: string,
  label: string,
  icon: string,
  innerHtml: string
): string {
  const key = `${exerciseName}::${sectionKey}`;
  const isOpen = !!state.openSections[key];
  return `
    <div class="detail-section ${isOpen ? 'detail-section-open' : ''}">
      <button class="detail-section-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${isOpen}">
        <span class="detail-section-label"><span class="detail-section-icon" aria-hidden="true">${icon}</span> ${escapeHtml(label)}</span>
        <span class="detail-chev" aria-hidden="true">▸</span>
      </button>
      ${isOpen ? `<div class="detail-section-body">${innerHtml}</div>` : ''}
    </div>`;
}

// The enriched, low-overwhelm detail card (Allison Jul 9 2026). Face shows only
// the important, low-reading things — the ▶ voice note + the muscle-target
// picture. Steps / Do & Don't / Common mistakes are each a collapsed dropdown
// she taps to open. See exercise-detail.ts for the "why".
function renderDetailCard(exerciseName: string): string {
  const d = EXERCISE_DETAIL[exerciseName];
  if (!d) return '';

  const stepsHtml = `<ol class="detail-steps">${d.steps
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('')}</ol>`;

  const doDontHtml = `<ul class="detail-cues">${d.dos
    .map(
      (x) =>
        `<li class="detail-cue-do"><span class="detail-cue-mark" aria-hidden="true">✓</span>${escapeHtml(x)}</li>`
    )
    .join('')}${d.donts
    .map(
      (x) =>
        `<li class="detail-cue-dont"><span class="detail-cue-mark" aria-hidden="true">✗</span>${escapeHtml(x)}</li>`
    )
    .join('')}</ul>`;

  const mistakesHtml = `<ul class="detail-mistakes">${d.mistakes
    .map(
      (m) =>
        `<li><span class="detail-mistake">${escapeHtml(m.mistake)}</span><span class="detail-fix">${escapeHtml(m.fix)}</span></li>`
    )
    .join('')}</ul>`;

  return `
    <div class="detail-card">
      <div class="detail-face">
        <button class="voice-note-btn is-secondary" data-voice-src="${escapeHtml(d.voiceSrc)}" type="button">
          <span class="voice-note-icon" aria-hidden="true">▶</span>
          <span class="voice-note-label">Listen — how to do it</span>
        </button>
        <div class="muscle-target">
          <div class="muscle-target-diagram">${muscleDiagram(d.muscles)}</div>
          <div class="muscle-target-label"><span class="muscle-target-title">Targets</span>${escapeHtml(d.muscleLabel)}</div>
        </div>
      </div>
      ${renderDetailSection(exerciseName, 'steps', 'Steps', '🔢', stepsHtml)}
      ${renderDetailSection(exerciseName, 'dodont', "Do & Don't", '✓', doDontHtml)}
      ${renderDetailSection(exerciseName, 'mistakes', 'Common mistakes', '⚠️', mistakesHtml)}
    </div>`;
}

function renderHowToCard(exerciseName: string): string {
  // Prefer multi-frame visual how-to. Fall back to legacy EXERCISE_GUIDE text
  // if the exercise hasn't been mapped to EXERCISE_HOWTO yet (archive-not-
  // delete principle: EXERCISE_GUIDE stays in source as a permanent fallback).
  const howto = EXERCISE_HOWTO[exerciseName];
  const guide = EXERCISE_GUIDE[exerciseName];
  if (!howto && !guide) return '';

  // First-time-this-week → open by default. After that, collapsed.
  const week = getProgramWeek();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${howToWeekKey(week)}`;
  let seen: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw) as Record<string, boolean>;
  } catch {
    seen = {};
  }
  const isFirstThisWeek = !seen[exerciseName];
  const userOpened = state.howToOpenFor === exerciseName;
  const userClosed = state.howToOpenFor === `__closed__${exerciseName}`;
  // Ship 6: respect "Show how-to expanded first time per week" setting (default
  // on). If off, never auto-expand — only show when user explicitly opens.
  // v48 (Sep 24 2026): never auto-open from round 2 on — she has just done the
  // move (walk-in-her-shoes: "Round 2 notes closed").
  const autoExpand = getHowToFirstExpand() && !isLaterRound();
  const isOpen = userOpened || (autoExpand && isFirstThisWeek && !userClosed);

  const innerHtml = howto
    ? `<div class="howto-frames">
        ${howto.frames.map((f, i) => renderHowToFrame(f, i, exerciseName)).join('')}
      </div>`
    : guide
      ? `<p class="how-to-text">${escapeHtml(guide.howTo)}</p>`
      : '';

  return `
    <div class="how-to-card ${isOpen ? 'how-to-open' : ''}">
      <button class="how-to-toggle" data-toggle-howto="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isOpen}">
        <span>📖 How to do it</span>
        <span class="how-to-chev">▸</span>
      </button>
      ${isOpen ? innerHtml : ''}
    </div>
  `;
}

// Rounds repeat week numbers, so the localStorage seen-key needs the round in
// it from round 2 on. Round-1 keys stay bare numbers (backwards compatible).
function howToWeekKey(week: { num: number; round: number }): string {
  return week.round > 1 ? `r${week.round}-${week.num}` : `${week.num}`;
}

function markHowToSeenThisWeek(exerciseName: string): void {
  const week = getProgramWeek();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${howToWeekKey(week)}`;
  let seen: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw) as Record<string, boolean>;
  } catch {
    seen = {};
  }
  seen[exerciseName] = true;
  try {
    localStorage.setItem(seenKey, JSON.stringify(seen));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

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

// Returns the last N wall-sit values from history (oldest → newest), filtered
// to values > 0. We walk in reverse-history-order (newest first), then reverse
// back to oldest-first so the sparkline draws left → right chronologically.
function getWallSitTrend(allLogs: LogEntry[], uptoLogId: string | null, max = 10): number[] {
  // logs are stored newest-first. We want all logs up-to-and-including the
  // current row, then take the last N (chronologically).
  let upto = allLogs;
  if (uptoLogId) {
    const idx = allLogs.findIndex((l) => l.id === uptoLogId);
    if (idx >= 0) upto = allLogs.slice(idx); // newest-first slice from this row backwards in time
  }
  const wallSits = upto
    .filter((l) => l.wallSitSec > 0)
    .map((l) => l.wallSitSec)
    .reverse(); // now oldest → newest
  if (wallSits.length <= max) return wallSits;
  return wallSits.slice(wallSits.length - max);
}

// Inline SVG sparkline. Returns '' if fewer than 2 points (flat-line reads
// broken). The current row's value is the rightmost point and gets a filled
// dot. v48 · P6 (Sep 24 2026): that dot is --text, not sage — sage means "the
// primary action right now" (DECISIONS §5, one sage per screen).
function renderSparkline(values: number[]): string {
  if (values.length < 2) return '';

  const W = 80;
  const H = 20;
  const PAD = 2; // breathing room so end dot isn't clipped

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const stepX = (W - 2 * PAD) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = PAD + i * stepX;
    // SVG y axis inverted; higher value = higher on chart = lower y
    const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
    return [x, y];
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x?.toFixed(1)} ${y?.toFixed(1)}`)
    .join(' ');

  const lastPoint = points[points.length - 1];
  if (!lastPoint) return '';
  const [lx, ly] = lastPoint;

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const direction = last > first ? 'trending up' : last < first ? 'trending down' : 'holding';
  const label = `wall sit ${first} to ${last}s, ${direction}`;

  return `
    <svg class="sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         role="img" aria-label="${escapeHtml(label)}">
      <title>${escapeHtml(label)}</title>
      <path d="${path}" fill="none" stroke="var(--accent-progress)" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lx?.toFixed(1)}" cy="${ly?.toFixed(1)}" r="2" fill="var(--text)" />
    </svg>
  `;
}

// 3-per-week target view (replaces the 7-cells-per-week year-grid).
// Allison's words 2026-05-15 15:13 JDT: "i think theres too many sessions"
// + "its 3 a week" + "go back to 3 per week." The year-grid showed 7 cells
// per week which implied a daily target — but she's only doing 3/week. This
// view shows ONE row per week × 3 slot pills, each filled with the workout
// letter she actually did (or empty outline).

type WeeklyTargetRow = {
  saturday: Date;
  weekNum: number;
  round: number;
  skippedLabel: string | null; // e.g. 'Sick' — week holds its slot but doesn't count
  workouts: ('A' | 'B' | 'C')[]; // in order completed (chronological)
  logs: (LogEntry | null)[]; // parallel to workouts, for click→detail
  isCurrentWeek: boolean;
};

function buildWeeklyTargetRows(logs: LogEntry[]): WeeklyTargetRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSaturday = new Date(today);
  thisSaturday.setDate(today.getDate() - daysSinceSat);
  thisSaturday.setHours(0, 0, 0, 0);

  const programStart = new Date(PROGRAM_START_DATE + 'T00:00:00');

  // Walk back from this Saturday to the Saturday on/before programStart.
  const rows: WeeklyTargetRow[] = [];
  const cursor = new Date(thisSaturday);
  // Swing-aware (v42): attribution computed once, shared by every row.
  const attribution = attributeSessionsToWeeks(logs);
  while (cursor.getTime() >= programStart.getTime() - 6 * 24 * 60 * 60 * 1000) {
    const weekStart = new Date(cursor);

    // Sessions COUNTED toward this week (chronological — oldest first)
    const weekLogs = sessionsAttributedTo(logs, weekStart, attribution).slice(0, 3); // cap at 3 for the 3-slot view

    const pw = getProgramWeek(weekStart);
    rows.push({
      saturday: new Date(weekStart),
      weekNum: pw.num,
      round: pw.round,
      skippedLabel: pw.skippedLabel,
      workouts: weekLogs.map((l) => l.workout),
      logs: weekLogs,
      isCurrentWeek: weekStart.getTime() === thisSaturday.getTime(),
    });

    cursor.setDate(cursor.getDate() - 7);
  }

  return rows;
}

// year-grid heatmap retired 2026-05-15 — Allison's call ("its 3 a week").
// Full extracted code at archive/year-grid-2026-05-15/year-grid.archived.ts.

// 3-per-week target view. One row per program week × 3 slot pills.
// v48 · P4 (Sep 24 2026): lives at the bottom of Weekly review now, collapsed
// as "Week by week ▸" (DECISIONS Q3 — her Aug 30 "consistency should be
// collapsible"; Weekly review is where looking back lives). One <details>, so
// it's still one tap open.
function renderWeeklyTargetGrid(summaryLabel = 'Consistency'): string {
  const logs = loadLogs();
  const rows = buildWeeklyTargetRows(logs);
  // v48 · P6 (Sep 24 2026): the "N of 3 this week" + swing note that sat on
  // this summary (and again inside it) are gone — in Weekly review the count
  // is the screen's own subtitle, and home's week line carries the swing in
  // words (DECISIONS §2 #2: "One quiet count, not 3-5").

  const rowsHtml = rows
    .map((r) => {
      const rangeLabel = `${r.saturday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      const slots = [0, 1, 2]
        .map((i) => {
          const w = r.workouts[i];
          const log = r.logs[i];
          if (w && log) {
            const cls = `weekly-slot weekly-slot-${w}`;
            const id = log.id ? `data-detail="${escapeHtml(log.id)}"` : '';
            const tooltip = `${formatDate(log.date)} · Workout ${w} · capacity ${log.capacityBefore ?? '—'}→${log.capacityAfter ?? '—'}`;
            return `<button class="${cls}" type="button" ${id} aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">${w}</button>`;
          }
          return `<div class="weekly-slot weekly-slot-empty" aria-label="open slot"></div>`;
        })
        .join('');
      const cls = r.isCurrentWeek ? 'weekly-row weekly-row-current' : 'weekly-row';
      const label = r.isCurrentWeek
        ? 'This week'
        : r.skippedLabel
          ? `${r.skippedLabel} · ${rangeLabel}`
          : `${r.round > 1 ? `R${r.round} · ` : ''}Wk ${r.weekNum} · ${rangeLabel}`;
      return `
        <div class="${cls}">
          <div class="weekly-row-label">${label}</div>
          <div class="weekly-slots">${slots}</div>
        </div>`;
    })
    .join('');

  // Collapsed by default (her call Aug 30 2026: "consistency should be
  // collapsible and the workouts should be first") — the summary line keeps
  // the one number she cares about visible without the full week list.
  return `
    <details class="consistency-wrap">
      <summary class="next-week-summary">
        <span class="next-week-summary-label">${summaryLabel}</span>
        <span class="next-week-summary-meta">3 per week · since ${formatMonthDay(PROGRAM_START_DATE + 'T00:00:00')}</span>
        <span class="next-week-chev">▸</span>
      </summary>
      <div class="past-weeks-body weekly-target-card">
        <div class="weekly-target-header">
          <h3 class="weekly-target-title">
            Consistency · <span class="weekly-target-sub">3 per week</span>
          </h3>
        </div>
        <div class="weekly-target-rows">${rowsHtml}</div>
      </div>
    </details>
  `;
}

// ---------- renders ----------

// "Coming next week" — collapsed-by-default <details>. Shows the diff of A/B/C
// from the current week to the next planned week. Invitational, not pushy:
// caption gives her the start date so she can ignore it cleanly if she wants.
// Returns '' if there's no next week encoded yet (i.e. she's on the last
// planned week).
function renderComingNextWeek(): string {
  const current = getWeekPlan();
  const futures = getFutureWeekPlans();
  if (futures.length === 0) return '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Each future week diffs against its predecessor (Week 5 vs Week 4,
  // Week 6 vs Week 5, etc.). Header label remains "Coming next week"
  // for the immediate next; further weeks just listed below.
  const sections = futures
    .map((wp, idx) => {
      const prev = idx === 0 ? current : futures[idx - 1]!;
      const start = new Date(wp.startsOn + 'T00:00:00');
      const startLabel = `${months[start.getMonth()]} ${start.getDate()}`;

      const blocks = (['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const lines = diffWorkout(prev.workouts[id], wp.workouts[id]);
          if (lines.length === 0) {
            return `
              <div class="next-week-block">
                <div class="next-week-block-title">Workout ${id}</div>
                <div class="next-week-block-empty">unchanged</div>
              </div>`;
          }
          const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
          return `
            <div class="next-week-block">
              <div class="next-week-block-title">Workout ${id}</div>
              <ul class="next-week-block-list">${items}</ul>
            </div>`;
        })
        .join('');

      const summaryLabel = idx === 0 ? 'Coming next week' : `Then ${weekPlanTitle(wp)}`;
      const caption = `Diff vs ${weekPlanTitle(prev)}${wp.label ? ` · ${wp.label}` : ''}.`;

      return `
        <details class="next-week-preview" ${idx === 0 ? '' : ''}>
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${summaryLabel}</span>
            <span class="next-week-summary-meta">${weekPlanTitle(wp)} · starts Sat ${startLabel}</span>
            <span class="next-week-chev">▸</span>
          </summary>
          <div class="next-week-body">
            <div class="next-week-caption">${caption}</div>
            <div class="next-week-blocks">${blocks}</div>
          </div>
        </details>
      `;
    })
    .join('');

  return sections;
}

// "Past weeks" — collapsed-by-default <details>, the mirror of "Coming next
// week". The home screen only ever expands the CURRENT week's workouts; past
// programming is otherwise only reachable through the week-dot strip + Weekly
// Review (session logs), never as expanded exercise blocks. This adds a single
// lightweight collapsed surface so the past program is browsable in the same
// compact diff form — nothing past-week renders expanded by default. Returns ''
// if there are no encoded weeks before the current one.
function renderPastWeeks(): string {
  const past = getPastWeekPlans();
  if (past.length === 0) return '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Newest past week first. Each week diffs against its own predecessor so the
  // lines read "what changed when this week started".
  const sections = [...past]
    .reverse()
    .map((wp) => {
      const wpIdx = PROGRAM.indexOf(wp);
      const prev = wpIdx > 0 ? PROGRAM[wpIdx - 1]! : null;
      const start = new Date(wp.startsOn + 'T00:00:00');
      const startLabel = `${months[start.getMonth()]} ${start.getDate()}`;

      const blocks = (['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const lines = prev ? diffWorkout(prev.workouts[id], wp.workouts[id]) : [];
          if (lines.length === 0) {
            return `
              <div class="next-week-block">
                <div class="next-week-block-title">Workout ${id}</div>
                <div class="next-week-block-empty">${prev ? 'unchanged' : 'starting point'}</div>
              </div>`;
          }
          const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
          return `
            <div class="next-week-block">
              <div class="next-week-block-title">Workout ${id}</div>
              <ul class="next-week-block-list">${items}</ul>
            </div>`;
        })
        .join('');

      const caption = prev
        ? `Diff vs ${weekPlanTitle(prev)}${wp.label ? ` · ${wp.label}` : ''}.`
        : `${wp.label ? `${wp.label}. ` : ''}The starting week.`;

      return `
        <details class="next-week-preview">
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${weekPlanTitle(wp)}</span>
            <span class="next-week-summary-meta">started Sat ${startLabel}</span>
            <span class="next-week-chev">▸</span>
          </summary>
          <div class="next-week-body">
            <div class="next-week-caption">${caption}</div>
            <div class="next-week-blocks">${blocks}</div>
          </div>
        </details>
      `;
    })
    .join('');

  // One outer collapsed wrapper so the whole past-program section is a single
  // quiet line until tapped (it never auto-expands).
  return `
    <details class="past-weeks-wrap">
      <summary class="next-week-summary">
        <span class="next-week-summary-label">Past weeks</span>
        <span class="next-week-summary-meta">${past.length} earlier week${past.length === 1 ? '' : 's'} · tap to browse</span>
        <span class="next-week-chev">▸</span>
      </summary>
      <div class="past-weeks-body">${sections}</div>
    </details>
  `;
}

// Gear & recovery. Equipment is ownership-gated: a move only appears in a
// workout once Allison says she owns the kit. Also holds Lisa's neck release.
// v48 · P6 (Sep 24 2026): the paragraphs became one row of chips (✅ = in the
// workout now, ⬜ = worth getting) plus the Neck release as its own titled
// card (DECISIONS §5). The "tell Claude" lines are gone — the 2 kg trigger is
// now a question the app asks on home, from her arm-feel taps (her Jul 3 ask).
const GEAR_CHIPS: { have: boolean; text: string }[] = [
  { have: true, text: '1 kg · A+B arm block' },
  { have: true, text: 'Yellow band · B clamshells' },
  { have: false, text: '2nd 1 kg' },
  { have: false, text: '2 kg · ask Lisa when the 1 kg feels easy' },
  { have: false, text: 'Peanut (2 tennis balls in a sock)' },
];

function renderGearCard(): string {
  const chips = GEAR_CHIPS.map(
    (g) =>
      `<span class="gear-chip${g.have ? ' gear-chip-have' : ''}">${g.have ? '✅' : '⬜'} ${escapeHtml(g.text)}</span>`
  ).join('');
  return `
    <div class="card settings-card gear-card">
      <div class="settings-section-label">Gear</div>
      <div class="gear-chips">${chips}</div>
    </div>
    <div class="card settings-card neck-card">
      <div class="settings-section-label">Neck release · Lisa · ~10 min</div>
      <p class="gear-note">Two tennis balls in a sock at the base of your skull — where the skull meets the neck, one ball either side of your spine. Lie back, let your head’s weight rest on them, breathe slow (3 deep breaths), and relax ~10 min. Releases the neck/shoulder tension Lisa flagged. Do it separately from your session.</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// HOME (v48 · P4, Sep 24 2026). Her words today: "look at home ux ui and make
// it better i feel like its a bit all over the place". DECISIONS-v48 §1 Q1-Q3,
// §2 #1-2 #8, §5 Home rows. One next action (the "Up next" hero — the only
// sage on the screen), B/C one chip away, ONE honest week line, a one-row walk,
// two quiet doors. Home used to be 14,025 px expanded with five doors to the
// same 39 rows (uxui home 4/5); everything that left is one tap from where it
// now lives (Weekly review › Week by week, Settings › Gear, Progress › Program).
// ---------------------------------------------------------------------------

// The header's one line: the week she's in. When the loaded plan is a
// different week (no Week 5 encoded yet on Sat Sep 26), say so — fail-loud
// (ux.md #10: the banner said Week 5 while pre-log said Week 4). Returns HTML:
// the plan note is a smaller span so the title stays on one line.
function homeWeekTitle(): string {
  const week = getProgramWeek();
  if (week.skippedLabel) return `${week.skippedLabel} week`;
  const title = `${week.round > 1 ? `Round ${week.round} · ` : ''}Week ${week.num}`;
  const plan = getWeekPlan();
  const planRound = plan.round ?? 1;
  if (plan.weekNum === week.num && planRound === week.round) return title;
  const planName = `${planRound !== week.round && planRound > 1 ? `R${planRound} · ` : ''}Week ${plan.weekNum}`;
  return `${title}<span class="h1-plan"> · ${planName}'s plan</span>`;
}

// "v48 · Sep 24 · 21:40" — the year stays in Settings › About (DECISIONS Q1:
// her Jul 1 rule "put time stamp too … across all apps", on one line).
function homeVersionTag(): string {
  return `${APP_VERSION} · ${BUILD_DATE.replace(/,\s*\d{4}/, '')}`;
}

// Minutes from the workout's own description ("… · ~40 min"); 30 if it has none.
function workoutMinutesLabel(w: Workout): string {
  const m = /~(\d+)\s*min/.exec(w.description);
  return `~${m?.[1] ?? '30'} min`;
}

// The hero's cardio line: the lane she used last time + this workout's minutes
// (walk-in-her-shoes: "A says 'cardio optional' → 'Today: elliptical 10 min'").
function heroCardioLine(w: Workout): string {
  const step = w.warmup.find((e) => e.name === 'Outdoor walk');
  if (!step) return '';
  const minutes = walkStepMinutes(step);
  const lane = lastCardioLane();
  return lane ? `Cardio: ${lane} ${minutes} min` : `Cardio: ${minutes} min, your pick`;
}

// Moves new (or back, v48 · fix r1) in this workout tonight, lower-cased, once
// each, over the given blocks.
function tonightNames(
  w: Workout,
  id: WorkoutId,
  want: TonightKind,
  phases: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown']
): string[] {
  const out: string[] = [];
  for (const p of phases) {
    for (const ex of w[p] ?? []) {
      // Terse: "prone row", not "prone row (bodyweight)" — the hero line stays
      // one line at phone width (the step itself keeps the full name).
      const name = displayName(ex)
        .replace(/\s*\([^)]*\)/g, '')
        .toLowerCase();
      if (tonightKind(ex, id) === want && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

// "B · Glutes" — the letter and the first word of the workout's name.
function workoutChipLabel(w: Workout): string {
  return `${w.id} · ${w.name.split(/[\s+]+/)[0] ?? ''}`;
}

function renderWorkoutChips(exclude: WorkoutId): string {
  const chips = (['A', 'B', 'C'] as WorkoutId[])
    .filter((id) => id !== exclude)
    .map((id) => {
      const w = getWorkoutById(id);
      return `<button class="btn-chip home-chip" data-workout="${id}" type="button" aria-label="Start Workout ${id} · ${escapeHtml(w.name)}">${escapeHtml(workoutChipLabel(w))}</button>`;
    })
    .join('');
  return `<div class="home-chips"><span class="home-chips-lead">or do</span>${chips}</div>`;
}

// The "Up next" hero — the ONE sage thing on home. The whole card is the tap
// target (→ pre-log), so Home → working out stays 2 taps (guide §1).
function renderUpNextHero(id: WorkoutId): string {
  const w = getWorkoutById(id);
  const fresh = tonightNames(w, id, 'new');
  // v48 · fix r1: moves she's done before (Round 1) come back — named as such.
  const back = tonightNames(w, id, 'back');
  const cardio = heroCardioLine(w);
  const rounds = `${w.rounds} round${w.rounds === 1 ? '' : 's'}`;
  return `
    <button class="workout-card workout-card-pick home-hero" data-workout="${id}" type="button">
      <span class="hero-label">Up next</span>
      <span class="hero-title">Workout ${id}</span>
      <span class="hero-line">${escapeHtml(`${w.name} · ${rounds} · ${workoutMinutesLabel(w)}`)}</span>
      ${fresh.length ? `<span class="hero-line hero-new">New tonight: ${escapeHtml(fresh.join(' · '))}</span>` : ''}
      ${back.length ? `<span class="hero-line hero-back">Back tonight: ${escapeHtml(back.join(' · '))}</span>` : ''}
      ${cardio ? `<span class="hero-line">${escapeHtml(cardio)}</span>` : ''}
      <span class="hero-start" aria-hidden="true">Start</span>
    </button>`;
}

// After Save, until midnight: the win is witnessed instead of the next workout
// lighting up minutes later (uxui post-log 4/5). Not sage — nothing to do here.
function renderDoneTodayCard(log: LogEntry, weekCount: number): string {
  const lastDone = loadLastDone();
  const firsts = lastDone && lastDone.id === log.id ? lastDone.firsts : [];
  const km =
    typeof log.ellipticalKm === 'number' && log.ellipticalKm > 0 ? `${log.ellipticalKm} km` : '';
  const firstsLine = firsts.length
    ? `Firsts: ${[...firsts, ...(km ? [km] : [])].join(' · ')}`
    : km
      ? `Elliptical · ${km}`
      : '';
  // v48 · fix r1 (Sep 24 2026): returning moves get their own honest word —
  // "Back: 1 kg biceps curl · prone row (bodyweight)" — never "Firsts".
  const back = lastDone && lastDone.id === log.id ? (lastDone.back ?? []) : [];
  const backLine = back.length ? `Back: ${back.join(' · ')}` : '';
  return `
    <div class="card home-done-card" id="home-done-card">
      <div class="home-done-title">Done ✓ · Workout ${log.workout}</div>
      <div class="home-done-line">${weekCount} of 3 this week</div>
      ${firstsLine ? `<div class="home-done-firsts" dir="auto">${escapeHtml(firstsLine)}</div>` : ''}
      ${backLine ? `<div class="home-done-back" dir="auto">${escapeHtml(backLine)}</div>` : ''}
    </div>`;
}

function renderHome(): string {
  const logs = loadLogs();
  const week = getProgramWeek();
  const weekRange = formatWeekRange(week.start, week.end);
  // v48 · P4: home always shows THIS week (the ‹ › arrows move to Weekly review
  // in P6; viewedWeekOffset stays for that screen).
  const weekCount = getWeekCount(0);
  // Newest by DATE (writeLogs keeps unsynced rows first, not newest first).
  const lastLog = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0];
  const doneToday =
    lastLog && localIsoDate(new Date(lastLog.date)) === localIsoDate(new Date()) ? lastLog : null;
  // The auto-suggest setting no longer switches the hero off (DECISIONS §5:
  // the hero is always today's rotation; B/C are one chip away).
  const pick = getTodaysPick();
  const weekWalks = walksThisWeek();
  const walkStartedAt = activeWalkStart();
  const weekDots = getWeekDots(0);

  // DECISIONS Q2 — the Saturday swing in WORDS, every day (not only on
  // Saturdays): "0 of 3 this week · Sat's C went to Week 3 · 39 total".
  const thisSaturday = saturdayForOffset(0);
  const attribution = attributeSessionsToWeeks(logs);
  const swungLogs = logs
    .filter(
      (l) =>
        calendarSaturdayMs(l.date) === thisSaturday.getTime() &&
        attribution.get(l) !== thisSaturday.getTime()
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastWeek = getViewedProgramWeek(1);
  const lastWeekCount = getWeekCount(1);
  const lastWeekTitle = lastWeek.skippedLabel
    ? `the ${lastWeek.skippedLabel.toLowerCase()} week`
    : `Week ${lastWeek.num}`;
  const swingWords =
    swungLogs.length > 0
      ? ` · Sat's ${swungLogs.map((l) => l.workout).join(' + ')} went to ${lastWeekTitle}`
      : '';
  const weekLine = `${weekCount} of 3 this week${swingWords} · ${logs.length} total`;
  // Saturday morning, last week still at 1-2: one quiet line says today will
  // count for it (v46, kept).
  const saturdayNote =
    new Date().getDay() === 6 &&
    swungLogs.length === 0 &&
    weekCount === 0 &&
    lastWeekCount > 0 &&
    lastWeekCount < SESSIONS_PER_WEEK_TARGET
      ? `<p class="swing-note">Last week's at ${lastWeekCount} — today's session will count for it.</p>`
      : '';

  const dotsHtml = weekDots
    .map((d) => {
      const cls = d.workout ? `dot dot-${d.workout}` : 'dot dot-empty';
      const clickAttr = d.logId ? `data-detail="${escapeHtml(d.logId)}"` : '';
      return `
        <button class="week-dot ${cls}" ${clickAttr} type="button" ${d.logId ? '' : 'tabindex="-1"'} aria-label="${d.letter} ${formatDate(d.date.toISOString())}${d.workout ? ` workout ${d.workout}` : ' no workout'}">
          <span class="week-dot-label">${d.letter}</span>
          <span class="week-dot-bubble">${d.workout ?? ''}</span>
        </button>
      `;
    })
    .join('');

  // The walk row (DECISIONS §4, slow walking): one row, no paragraph.
  const walkTrail = [
    weekWalks > 0 ? `${weekWalks} this week` : '',
    stepsToday !== null ? `${stepsToday.toLocaleString('en-US')} steps today` : '',
  ]
    .filter((s) => s !== '')
    .join(' · ');
  const walkRow = walkStartedAt
    ? `<div class="walk-row">
         <span class="walk-text"><span id="walk-live">${walkLiveText(walkStartedAt)}</span></span>
         <div class="walk-btn-group">
           <button class="walk-log-btn walk-log-btn-active" id="finish-walk" type="button">■ Done</button>
           <button class="walk-cancel-btn" id="cancel-walk" type="button">Cancel</button>
         </div>
       </div>`
    : `<div class="walk-row">
         <button class="walk-log-btn" id="log-walk-start" type="button">🚶 Start a walk</button>
         <span class="walk-text">${walkTrail}</span>
       </div>`;

  return `
    <div class="home-header">
      <div class="home-header-title">
        <h1>${homeWeekTitle()}</h1>
        <span class="app-version" aria-label="Build version">${homeVersionTag()}</span>
      </div>
      <button class="settings-icon-btn" id="open-settings" type="button" aria-label="Open settings" title="Settings">
        <span class="settings-icon-glyph" aria-hidden="true">⚙</span>
      </button>
    </div>
    <div id="sync-indicator" class="sync-indicator sync-${state.syncStatus}">${syncIndicatorText()}</div>
    ${staleSnapshot ? renderStaleSessionCard(staleSnapshot) : ''}

    ${doneToday ? renderDoneTodayCard(doneToday, weekCount) : renderUpNextHero(pick)}
    ${renderWorkoutChips(doneToday ? doneToday.workout : pick)}
    ${
      // v48 · P5: the 2 kg question sits right under the hero + its chips (the
      // chips read as part of the hero, so the card goes after them).
      renderTwoKgQuestion(logs)
    }

    <div class="card week-card" id="open-weekly-review" role="button" tabindex="0" aria-label="Open weekly review for this week">
      <div class="week-card-head">
        <span class="week-card-range">This week · ${weekRange}</span>
        <span class="week-card-chev" aria-hidden="true">›</span>
      </div>
      <div class="week-dots">${dotsHtml}</div>
      <div class="week-line">${weekLine}</div>
      ${saturdayNote}
    </div>

    <div class="card walk-card">${walkRow}</div>

    <div class="home-doors">
      <button class="door-row" id="open-progress-link" type="button">
        <span>📈 Progress</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
      <button class="door-row" id="view-history" type="button">
        <span>🗂 Sessions</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>
  `;
}

// v48 · P5 (Sep 24 2026) — the body reading as 1-10 tap chips (DECISIONS Q6).
// BLANK until she taps: the v46 fix was made because the invented 5 faked a
// decline (after = 5 in 6 of 8 Round-2 sessions), and a slider pre-set to her
// last number would bring the same lie back as "same as last time". A chip
// keeps an honest reading at one tap; tapping the chosen one again clears it.
// Selected = --accent-progress (a reading, not the primary action — no sage).
function renderChipRow(
  idPrefix: string,
  value: number,
  touched: boolean,
  ariaLabel: string
): string {
  const chip = (n: number): string => {
    const on = touched && value === n;
    return `<button class="body-chip${on ? ' body-chip-on' : ''}" id="${idPrefix}-${n}" type="button" role="radio" aria-checked="${on ? 'true' : 'false'}" data-body-chip="${idPrefix}" data-value="${n}">${n}</button>`;
  };
  const row = (from: number): string =>
    `<div class="body-chip-row">${[0, 1, 2, 3, 4].map((i) => chip(from + i)).join('')}</div>`;
  return `<div class="body-chips" role="radiogroup" aria-label="${escapeHtml(ariaLabel)}">${row(1)}${row(6)}</div>`;
}

function renderBodyChips(idPrefix: string, value: number, touched: boolean, label = ''): string {
  return `
    <div class="field body-field">
      <span class="label-text body-label">${escapeHtml(label)}</span>
      ${renderChipRow(idPrefix, value, touched, label)}
      <div class="body-anchor">1 empty · 5 ordinary · 10 strong</div>
    </div>`;
}

// Moves that put pressure on the palms or the grip — where the one wrist + back
// line belongs (DECISIONS §5: the amber box was 58 words, the same every
// session, and shown on C too, where none of these moves exist).
const WRIST_BACK_MOVES: readonly string[] = [
  'Bird dog (legs only)',
  'Wall lean (wrist on-ramp)',
  '1 kg biceps curl',
  'Prone row (bodyweight)',
  'Bodyweight hip hinge',
];

function workoutNeedsWristLine(w: Workout): boolean {
  return [...w.warmup, ...w.main, ...(w.upperBack ?? [])].some((ex) =>
    WRIST_BACK_MOVES.includes(ex.name)
  );
}

// "R2 · Week 4" from the calendar; when the loaded plan is a different week
// (Sat Sep 26 has no Week 5 encoded) it names the plan instead — the same
// fail-loud as the home header (DECISIONS §5).
function preLogWeekLabel(): string {
  const week = getProgramWeek();
  const plan = getWeekPlan();
  const planRound = plan.round ?? 1;
  const round = week.round > 1 ? `R${week.round} · ` : '';
  if (plan.weekNum === week.num && planRound === week.round) return `${round}Week ${week.num}`;
  return `${planRound > 1 ? `R${planRound} · ` : ''}Week ${plan.weekNum}'s plan`;
}

function renderPreLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // v48 · P5 (Sep 24 2026): one quiet line instead of a subtitle, a counts card
  // and an amber box — her walk: "it asks 'how do you feel?', then the slider
  // says 'your BODY, not your mood' … Start is cut off at the bottom".
  const fresh = tonightNames(w, w.id, 'new');
  // v48 · fix r1: returning moves are "back", not "new" (Round 1 had them).
  const back = tonightNames(w, w.id, 'back');
  const hasCardio = w.warmup.some((e) => e.name === 'Outdoor walk');
  const meta = [
    preLogWeekLabel(),
    fresh.length ? `new tonight: ${fresh.join(' · ')}` : '',
    back.length ? `back: ${back.join(' · ')}` : '',
    hasCardio && lastCardioLane() === 'elliptical' ? 'elliptical' : '',
    workoutMinutesLabel(w),
  ]
    .filter((s) => s !== '')
    .join(' · ');
  // Lite = one round less, never below 1 — the chip says how many rounds today.
  const liteRounds = Math.max(1, w.rounds - 1);
  const liteWord = liteRounds === 1 ? 'one round' : `${liteRounds} rounds`;
  // A low body reading SUGGESTS Lite with a gentle outline; it never switches
  // itself on (agency rule: ask or suggest, never tell).
  const suggestLite = !state.liteDay && state.capacityBeforeTouched && state.capacityBefore <= 3;
  const liteChip = state.liteDay
    ? `<button class="lite-chip lite-toggle-on" id="lite-toggle" type="button" aria-pressed="true">✓ Lite · ${liteRounds} round${liteRounds === 1 ? '' : 's'} today · tap to undo</button>`
    : `<button class="lite-chip${suggestLite ? ' lite-suggest' : ''}" id="lite-toggle" type="button" aria-pressed="false">🪫 Hard day? Lite — ${liteWord}, still counts</button>`;
  return `
    <div class="screen-header prelog-header">
      <div class="prelog-title">
        <h2>Workout ${w.id}</h2>
        <span class="subtitle-inline">${escapeHtml(w.name)}</span>
      </div>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    <p class="prelog-meta">${escapeHtml(meta)}</p>

    ${renderWorkoutOverview(w)}

    <div class="card body-card">
      ${renderBodyChips('cap-before', state.capacityBefore, state.capacityBeforeTouched, 'Your BODY right now, not your mood')}
    </div>

    ${liteChip}

    ${workoutNeedsWristLine(w) ? `<p class="safety-line">Wrist + back: pressure fine, pain = stop.</p>` : ''}

    ${renderActionBar(`<button class="btn-large btn-primary" id="begin" type="button">Start</button>`)}
  `;
}

// Workout overview — the structure before starting (2026-05-15 18:07: "see the
// structure at a glance"). v48 · P5 (Sep 24 2026): folded into ONE closed row
// "What's in it ▸" — the counts card (4 / 6 / 6 / 18) never said what was new
// tonight, and it pushed Start below the fold. Open, each phase lists its moves.
function renderWorkoutOverview(w: Workout): string {
  const phases: { key: Phase; label: string; emoji: string; items: Exercise[] }[] = [
    { key: 'warmup', label: 'Warm-up', emoji: '🚶', items: w.warmup },
    {
      key: 'main',
      label: `Main · ${w.rounds} round${w.rounds === 1 ? '' : 's'}`,
      emoji: '💪',
      items: w.main,
    },
    ...(w.upperBack?.length
      ? [{ key: 'upperBack' as Phase, label: 'Upper back', emoji: '🔼', items: w.upperBack }]
      : []),
    { key: 'cooldown', label: 'Stretch', emoji: '🧘', items: w.cooldown },
  ];
  const rows = phases
    .map((p) => {
      const count = p.items.length;
      // v46: the warm-up step is a three-way pick now (her Sep 24: "no more
      // walk it could be walk or elliptical") — display only; the key stays.
      // v48 · P3: one helper for it everywhere (displayName).
      const names = p.items.map((e) => displayName(e)).join(' · ');
      // v48 · P5: flat inside the one fold — a second tap per phase was a
      // second door to the same list.
      return `
        <div class="overview-phase overview-phase-flat">
          <div class="overview-phase-summary">
            <span class="overview-phase-emoji">${p.emoji}</span>
            <span class="overview-phase-label">${p.label}</span>
            <span class="overview-phase-count">${count}</span>
          </div>
          <div class="overview-phase-items">${escapeHtml(names)}</div>
        </div>`;
    })
    .join('');
  // The week now lives in the pre-log's one quiet line ("R2 · Week 4 · …").
  return `
    <details class="card overview-card prelog-overview">
      <summary class="prelog-overview-summary">What's in it</summary>
      <div class="overview-phases">${rows}</div>
    </details>
  `;
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

// Cool-down = stretches. Allison's call (2026-06-06): show the whole block as
// ONE scrollable list — name + cue per row — instead of stepping through each
// stretch as its own screen. No per-stretch video, no per-stretch timer; the
// reps text already carries the hold time and the notes carry the cue. Real
// (non-stretch) exercises keep their stepped screens + videos.
//
// v48 · P7 (Sep 24 2026): her 18 stretches as 11 tick-off rows. The list is
// HER routine — "i dont do yur stretches i do this" (May 29) — so all 18 stay
// in the data; only the right/left pairs fold into one "each side" row. It was
// 2.9 screens and 547 words under a "No timer" line with "45 sec" on every row
// (uxui cooldown 4/5; walk-in-her-shoes: "rows I tick off, and ~13 min · 5 of
// 18"). Cues sit behind a closed ▸; the one sage stays Done · Finish.
type StretchGroup = {
  key: string;
  name: string;
  eachSide: boolean;
  cue: string | null;
  items: Exercise[];
};

// "Wrist extension — right" / "— left" → one "Wrist extension" group; the two
// hip-flexor rows ("Hip flexor — right knee in, left leg dangles" / "— left
// knee in, …") → "Hip flexor". The side word right after " — " is the marker.
// Singles pass through in order. A placeholder cue ("Your usual neck
// stretch.") says nothing on a list she already knows, so it becomes null.
function groupStretchPairs(stretches: Exercise[]): StretchGroup[] {
  const groups: StretchGroup[] = [];
  const byStem = new Map<string, StretchGroup>();
  for (const s of stretches) {
    const m = s.name.match(/^(.+?) — (?:right|left)\b/i);
    const stem = m?.[1];
    if (stem) {
      const existing = byStem.get(stem);
      if (existing) {
        existing.items.push(s);
        existing.eachSide = true;
        continue;
      }
    }
    const notes = s.notes?.trim() ?? '';
    const g: StretchGroup = {
      key: stem ?? s.name,
      name: stem ?? s.name,
      // A single entry can still be "each side" by its own reps (the Week 1-4
      // "Figure-4 stretch · 45 sec each side").
      eachSide: /each side/i.test(s.reps ?? ''),
      cue: notes === '' || /^Your usual .* stretch\.$/.test(notes) ? null : notes,
      items: [s],
    };
    groups.push(g);
    if (stem) byStem.set(stem, g);
  }
  return groups;
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

function renderStretchRow(g: StretchGroup): string {
  const ticked = state.stretchTicks[g.key] === true;
  const cueKey = `stretch::${g.key}`;
  const cueOpen = g.cue !== null && state.openSections[cueKey] === true;
  const cueToggle =
    g.cue === null
      ? ''
      : `<button class="stretch-cue-toggle ${cueOpen ? 'is-open' : ''}" data-toggle-section="${escapeHtml(cueKey)}" type="button" aria-expanded="${cueOpen}" aria-label="How to do ${escapeHtml(g.name)}"><span aria-hidden="true">▸</span></button>`;
  const setups = g.items.map((s) => renderExerciseSetup(s)).join('');
  return `
      <li class="stretch-row ${ticked ? 'stretch-row-done' : ''}">
        <div class="stretch-row-head">
          <button class="stretch-check" data-stretch-tick="${escapeHtml(g.key)}" type="button" aria-pressed="${ticked}" aria-label="${escapeHtml(g.name)} done"><span aria-hidden="true">✓</span></button>
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

function renderCooldownList(w: Workout): string {
  const groups = groupStretchPairs(w.cooldown ?? []);
  const ticked = groups.filter((g) => state.stretchTicks[g.key] === true).length;
  const rows = groups.map((g) => renderStretchRow(g)).join('');

  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${/* v48: the same one progress line as every step (the list = one step). */ renderProgressLine(w)}
    <p class="subtitle">${
      state.liteDay
        ? 'Lite day — do the stretches you need, skip the rest. Done · Finish whenever.'
        : /* v48 · P7: one honest line — the old "No timer" sat over "45 sec"
             on every row (DECISIONS §4). Her Jun 6 call: one list, no timer. */
          'About 45 s each — no timer, go by feel.'
    }</p>
    <p class="stretch-progress" aria-live="polite">~${stretchListMinutes(groups)} min · ${ticked} of ${groups.length}</p>

    <div class="card stretch-card">
      <ul class="stretch-list">${rows}</ul>
    </div>

    ${renderStepNav('Done · Finish')}
  `;
}

// Pause control — a quiet button in every workout sub-view's header, left of
// Quit (v46). It was a fixed pill at the bottom-left, which sat on top of
// Start timer and the setup steps on the elliptical screen (UI audit Sep 24).
// Nothing while paused: the overlay's Resume is the only control then.
function renderPauseButton(): string {
  if (state.pausedAt !== null) return '';
  return `<button class="pause-inline" id="pause-toggle" type="button" aria-label="Pause workout">⏸ Pause</button>`;
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

// v48 · P3 (Sep 24 2026) — the elliptical in RIDE ORDER: before (one line +
// Start inside the fold + the setup, first ride only), during (the timer, a
// quiet Stop, one live "Right now" line), after (one card: level, km, pulse —
// "From the machine, before STOP"). Decision Q5: the stepper said 5 while the
// steps said 3, and the readings sat 550 px from the level (uxui timed 2/5); the
// ride ENDS on level 3, so a level set before it was a guess. Replaces v46's
// renderEllipticalControls / renderEllipticalReadings.
function renderEllipticalAfterCard(): string {
  const level = ellipticalLevel();
  const last = lastEllipticalLevel();
  const km = localStorage.getItem(WW_ELLIPTICAL_KM_KEY) ?? '';
  const pulse = localStorage.getItem(WW_ELLIPTICAL_PULSE_KEY) ?? '';
  // "—" until she touches it: an untouched stepper saves null, never a guess.
  const sameChip =
    last !== null
      ? `<button class="ell-same-chip${level === last ? ' is-on' : ''}" id="ell-level-same" type="button" aria-pressed="${level === last}">${last} again</button>`
      : '';
  return `
    <div class="card ell-after-card">
      <div class="ell-readings-title">From the machine, before STOP</div>
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
        <label class="ell-reading"><span>Distance (km)</span><input type="number" id="ell-km" inputmode="decimal" step="0.01" min="0" placeholder="—" value="${escapeHtml(km)}" /></label>
        <label class="ell-reading"><span>Pulse</span><input type="number" id="ell-pulse" inputmode="numeric" step="1" min="30" max="230" placeholder="—" value="${escapeHtml(pulse)}" /></label>
      </div>
    </div>`;
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
    inner = `
      <div class="timer-label">Running</div>
      <div class="timer-display">${formatTimerDisplay(state.timerSeconds)}</div>
      <button class="btn-ghost" id="stop-lane" type="button">Stop</button>`;
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

// The elliptical step, in the order she rides it (see renderEllipticalAfterCard).
function renderEllipticalStep(ex: Exercise, header: string): string {
  const laneRan = localStorage.getItem(WW_LANE_STARTED_KEY) !== null;
  const running = state.timerSeconds > 0 || state.preCountdown > 0;
  const minutes = Math.round((ex.durationSec ?? 0) / 60);

  if (running) {
    // DURING: the timer big at the top, a quiet Stop, one live line. Nothing
    // else — no setup, no readings sentence (it re-renders every second).
    const line = RIDE_LINE[ridePhase(ex.durationSec ?? 0, state.timerSeconds)];
    return `
      ${header}
      <div class="ride-title"><span class="exercise-name">${ELLIPTICAL_NAME}</span><span class="ride-title-reps">${minutes} min</span></div>
      ${renderLaneTimerCard(ex, laneRan)}
      <div class="card cardio-routine ride-now">
        <div class="cardio-seg-label">Right now</div>
        <div class="cardio-seg-now" id="ride-line">${escapeHtml(line)}</div>
      </div>
      ${renderStepNav('Done · Next', true)}
    `;
  }

  const firstRide = lastEllipticalLevel() === null;
  const nameCard = (extra: string): string => `
    <div class="card">
      <div class="exercise-display">
        <div class="exercise-name-row">
          <div class="exercise-name">${ELLIPTICAL_NAME}</div>
          ${extra}
        </div>
        <div class="exercise-reps">${minutes} min</div>
        ${laneRan ? '' : `<p class="exercise-safety">Start on level 3, easy · stand tall, hands light</p>`}
      </div>
    </div>`;

  if (laneRan) {
    // AFTER: the done face, then the one card, then Done · Next (sage).
    return `
      ${header}
      ${nameCard('')}
      ${renderLaneTimerCard(ex, true)}
      ${renderEllipticalAfterCard()}
      ${renderEllipticalGuide(false)}
      ${renderStepNav('Done · Next')}
    `;
  }

  // BEFORE: one line, then Start, then the setup. Done stays quiet — the sage
  // is Start's (one sage per screen).
  // v48 · fix r1 (Sep 24 2026): on the FIRST ride the 3 setup steps come BEFORE
  // Start — she sets the machine up, then starts the timer (the verifier found
  // Start at y≈470 and the steps under it, from y≈620). Tapping Start closes
  // the card (it isn't drawn while the timer runs, and stays closed after).
  const timer = renderLaneTimerCard(
    ex,
    false,
    `<button class="back-link cardio-back-out" id="ww-outdoor" type="button">↩ Walk or apartment instead</button>`
  );
  const guide = renderEllipticalGuide(firstRide);
  return `
    ${header}
    ${nameCard(firstRide ? `<span class="new-tonight-badge">First ride</span>` : '')}
    ${firstRide ? `${guide}${timer}` : `${timer}${guide}`}
    ${renderStepNav('Done · Next', true)}
  `;
}

// v48 (Sep 24 2026): the face of a hold (wall sit, plank, wall lean). Four
// states, one sage at a time: Ready (sage Start) → Get ready / Hold (a quiet
// Stop that saves the real seconds; no dead "Running…" slab) → Done ("✓ held
// 45 s · last time 43", a quiet Redo; Done · Next turns sage). uxui timed 4/5
// (the hold reset silently) and 3/5 (two sage buttons, a dead slab); walk §4:
// "No way to say I held less".
function renderHoldTimerCard(ex: Exercise, showTempo: boolean): string {
  const held = heldOnThisStep();
  const idle = state.timerSeconds === 0 && state.preCountdown === 0;
  let inner: string;
  if (state.preCountdown > 0) {
    inner = `
      <div class="timer-label">Get ready</div>
      <div class="timer-display countdown-big">${state.preCountdown}</div>
      <button class="btn-ghost" id="stop-timed" type="button">Stop</button>`;
  } else if (!idle) {
    inner = `
      <div class="timer-label">Hold</div>
      <div class="timer-display">${formatTimerDisplay(state.timerSeconds)}</div>
      <button class="btn-ghost" id="stop-timed" type="button">Stop</button>`;
  } else if (held > 0) {
    // "last time" = the most recent saved session with a real wall sit (logs
    // are newest-first; this session isn't saved yet). Omitted when none.
    const last =
      ex.name === 'Wall sit' ? loadLogs().find((l) => l.wallSitSec > 0)?.wallSitSec : undefined;
    inner = `
      <div class="timer-label">Done</div>
      <div class="timer-done timer-held">✓ held ${held} s${last ? `<span class="timer-last"> · last time ${last}</span>` : ''}</div>
      <button class="back-link" id="redo-timed" type="button">Redo</button>`;
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

// v48: the full cue behind one closed "Cue ▸" (same toggle + openSections as
// the detail-card dropdowns). The face keeps only the safety line.
function renderCueExpander(ex: Exercise): string {
  if (!ex.notes) return '';
  const key = `${ex.name}::cue`;
  const isOpen = !!state.openSections[key];
  return `
    <div class="detail-section cue-section ${isOpen ? 'detail-section-open' : ''}">
      <button class="detail-section-toggle cue-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${isOpen}">
        <span class="detail-section-label">Cue</span>
        <span class="detail-chev" aria-hidden="true">▸</span>
      </button>
      ${isOpen ? `<div class="detail-section-body"><p class="exercise-notes">${ex.notes}</p></div>` : ''}
    </div>`;
}

function renderWorkout(): string {
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
  if (ex.name === 'Outdoor walk') {
    return `
      ${header}
      <div class="card">
        <div class="exercise-display">
          <div class="exercise-name-row"><div class="exercise-name">${displayName(ex)}</div></div>
          <div class="exercise-reps">${walkStepMinutes(ex)} min</div>
          <p class="walk-live-line">🚶 <span id="walk-live">${walkLiveText(workoutWalkStart())}</span></p>
          <p class="gear-note">It saves with this workout. Tap Done · Next when you're back.</p>
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
  const holdRan = hold && heldOnThisStep() > 0;
  const safety = ex.safety ?? SAFETY_LINE[ex.name];
  // v48 · P3: never on a lane — the apartment step isn't in PROGRAM, so it read
  // as "New tonight" every week (the elliptical has its own "First ride").
  // v48 · fix r1: a returning move reads "Back tonight", never "New".
  const kind =
    !indoorLane && state.selectedWorkout !== null ? tonightKind(ex, state.selectedWorkout) : null;

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
          ${kind ? `<span class="new-tonight-badge">${kind === 'new' ? 'New tonight' : 'Back tonight'}</span>` : ''}
        </div>
        <div class="exercise-reps">${ex.reps ?? ''}</div>
        ${renderArmFeel(ex.name)}
        ${safety ? `<p class="exercise-safety">${escapeHtml(safety)}</p>` : ''}
        ${renderCueExpander(ex)}
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

// v48 · P5 (Sep 24 2026): "How did it feel?" on the 1 kg curl and the prone
// row — three small chips, optional; tap selects, tap again clears. Quiet
// (outlined), so Done · Next stays the one sage on the step.
function renderArmFeel(name: string): string {
  const step = ARM_FEEL_STEPS[name];
  if (!step) return '';
  const current = state.armFeel[step];
  const chips = ARM_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-arm-step="${step}" data-arm-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `
    <div class="arm-feel" role="group" aria-label="How did it feel?">
      <span class="arm-feel-label">How did it feel?</span>
      <div class="arm-feel-chips">${chips}</div>
    </div>`;
}

function renderPostLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // v48 · P5 (Sep 24 2026) — every field is one tap or skippable, and Save is
  // pinned (her walk: "the body slider starts at 5 again. The keyboard covers
  // Save while I type my word"). Untouched still saves null (v46).
  // Wall sit only on a workout that has one — on C it asked a question she
  // can't answer (uxui post-log 3/5). Pre-filled from the timer.
  const wallSitField =
    workoutHasWallSit(w) && (state.stoppedEarlyAt === null || reachedWallSit(w))
      ? `<label class="field">
        <span class="label-text">${state.wallSitSec > 0 ? `Wall sit ${state.wallSitSec} s (tap to adjust)` : 'Wall sit (s)'}</span>
        <input type="number" id="wallsit" min="0" max="600" inputmode="numeric" value="${state.wallSitSec > 0 ? state.wallSitSec : ''}" />
      </label>`
      : '';
  // Back: "Fine / Something" (DECISIONS §5 — 34 of 39 rows are 0, and a
  // truthful 0 used to take a drag away and back). Something opens 1-10 chips,
  // none chosen until she taps one.
  const backFine = state.backPainTouched && state.backPain === 0;
  const backSome = state.backSomethingOpen || (state.backPainTouched && state.backPain > 0);
  const backRow = backSome
    ? `${renderChipRow('back', state.backPain, state.backPainTouched && state.backPain > 0, 'Back pain, 1 to 10')}
       <div class="body-anchor">1 barely · 10 worst</div>`
    : '';
  // v48 · fix r1 (Sep 24 2026): a stopped session is not called "done", and its
  // Back goes to the step she stopped on, not to stretches she never reached.
  // Still counts, no verdict.
  const stopped = state.stoppedEarlyAt !== null;
  const title = stopped ? `Logged what you did · Workout ${w.id}` : `Nice. Workout ${w.id} done.`;
  const backLink = stopped
    ? `<button class="back-link postlog-back" id="back-to-workout" type="button">‹ Back to the workout</button>`
    : `<button class="back-link postlog-back" id="back-to-stretches" type="button">‹ Back to the stretches</button>`;
  return `
    <h2>${title}</h2>
    <p class="subtitle">Quick log — or just Save.</p>

    <div class="card postlog-card">
      ${renderBodyChips('cap-after', state.capacityAfter, state.capacityAfterTouched, 'Your BODY now, not your mood')}

      ${wallSitField}

      <div class="field back-field">
        <span class="label-text">Back</span>
        <div class="back-choice">
          <button class="back-chip${backFine ? ' body-chip-on' : ''}" id="back-fine" type="button" aria-pressed="${backFine ? 'true' : 'false'}">Fine</button>
          <button class="back-chip${backSome ? ' back-chip-open' : ''}" id="back-some" type="button" aria-pressed="${backSome ? 'true' : 'false'}">Something</button>
        </div>
        ${backRow}
      </div>

      <label class="field note-field">
        <span class="label-text">Anything about today? (optional)</span>
        <textarea id="session-note" rows="3" maxlength="500" dir="auto" enterkeyhint="done" placeholder="Knee fine, stopped the elliptical early…">${escapeHtml(state.sessionNote)}</textarea>
      </label>
    </div>

    ${renderActionBar(`
      <button class="btn-large btn-primary" id="save-log" type="button">Save</button>
      ${backLink}
    `)}
  `;
}

// v48 · P5 (Sep 24 2026): the one screen v47's Back missed — her words: "i need
// to be able to go back". Returns to the cool-down list; nothing is logged.
function backToStretches(): void {
  state.screen = 'workout';
  state.currentPhase = 'cooldown';
  state.currentExerciseIndex = 0;
  state.isResting = false;
  state.roundBreak = false;
  render();
}

// v48 · fix r1 (Sep 24 2026): after "Log what I did" the log's Back returns to
// the step she stopped on — not to stretches she never reached — and undoes the
// stop (marker cleared, Lite back to what it was). logWhatIDid left the phase,
// round and step untouched, so the workout picks up exactly there.
function backToWorkoutFromStop(): void {
  if (state.stoppedEarlyLitePrev !== null) state.liteDay = state.stoppedEarlyLitePrev;
  state.stoppedEarlyAt = null;
  state.stoppedEarlyLitePrev = null;
  state.screen = 'workout';
  state.isResting = false;
  state.roundBreak = false;
  render();
}

// ---------------------------------------------------------------------------
// SESSIONS (v48 · P6, Sep 24 2026). DECISIONS §5 Sessions + Session detail:
// "Three names for one thing, and a Back at the bottom only here" (uxui history
// 3/5) → one name (Sessions / Session), ONE row template for Sessions AND Weekly
// review, × Back in the header, the list's scroll kept when she comes back.
// Voice rule: her words verbatim, never the tail of a machine log line.
// ---------------------------------------------------------------------------

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// "Sat Sep 19" — the weekday makes the Saturday swing readable in the list.
function formatRowDate(iso: string): string {
  const d = new Date(iso);
  return `${SHORT_WEEKDAYS[d.getDay()]} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// "Sep 19" — for "since May 2" and the like.
function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// "18:31" — the 24-hour clock she reads (the old locale time could come out as
// "06:31 PM" on one phone and "18:31" on another).
function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "40 min" on a row; a sub-minute session keeps its seconds.
function formatRowDuration(sec: number): string {
  return sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`;
}

// v47 rows carry the cardio lane, the machine readings and her words as prose
// in `notes` ("cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee
// fine · duration not recorded — …"). Same head as ELLIPTICAL_MARKER_RE, with
// the readings captured too, so an old ride shows the same Cardio row as a new one.
const LEGACY_ELLIPTICAL_RE =
  /cardio: elliptical (\d+) min(?: · level (\d+))?(?: · (\d+(?:\.\d+)?) km)?(?: · pulse (\d+))?/;
const LEGACY_APARTMENT_RE = /cardio: apartment (\d+) min/;
// The app's own annotations (v32 left-open / logged after the fact, v48 "Log
// what I did") — "System", never shown as if she wrote them.
const SYSTEM_NOTE_RE = /^(duration not recorded|logged after the fact|stopped early at)/;

type SessionCardio = {
  lane: 'walk' | 'apartment' | 'elliptical';
  minutes: number | null;
  level: number | null;
  km: number | null;
  pulse: number | null;
};

function numOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Splits a `notes` string into the legacy cardio marker, her words and the
// app's annotations. A v48 row's notes are annotations only, so its words come
// back empty; a v47 row gets all three pulled apart.
function splitNotes(notes: string | null | undefined): {
  cardio: SessionCardio | null;
  words: string[];
  system: string[];
} {
  let rest = notes ?? '';
  let cardio: SessionCardio | null = null;
  const ell = LEGACY_ELLIPTICAL_RE.exec(rest);
  if (ell) {
    cardio = {
      lane: 'elliptical',
      minutes: numOrNull(ell[1]),
      level: numOrNull(ell[2]),
      km: numOrNull(ell[3]),
      pulse: numOrNull(ell[4]),
    };
    rest = rest.replace(ell[0], '');
  }
  const apt = LEGACY_APARTMENT_RE.exec(rest);
  if (apt) {
    if (!cardio) {
      cardio = {
        lane: 'apartment',
        minutes: numOrNull(apt[1]),
        level: null,
        km: null,
        pulse: null,
      };
    }
    rest = rest.replace(apt[0], '');
  }
  const words: string[] = [];
  const system: string[] = [];
  for (const part of rest.split(' · ')) {
    const t = part.trim();
    if (!t) continue;
    (SYSTEM_NOTE_RE.test(t) ? system : words).push(t);
  }
  return { cardio, words, system };
}

// The session's cardio: the v48 columns first; a v47 row falls back to its
// notes marker; an old real walk to walkMinutes.
function sessionCardio(l: LogEntry): SessionCardio | null {
  if (l.cardioLane) {
    const ell = l.cardioLane === 'elliptical';
    return {
      lane: l.cardioLane,
      minutes: l.cardioMinutes ?? (l.cardioLane === 'walk' ? (l.walkMinutes ?? null) : null),
      level: ell ? (l.ellipticalLevel ?? null) : null,
      km: ell ? (l.ellipticalKm ?? null) : null,
      pulse: ell ? (l.ellipticalPulse ?? null) : null,
    };
  }
  const legacy = splitNotes(l.notes).cardio;
  if (legacy) return legacy;
  if (typeof l.walkMinutes === 'number' && l.walkMinutes > 0) {
    return { lane: 'walk', minutes: l.walkMinutes, level: null, km: null, pulse: null };
  }
  return null;
}

// "Elliptical 10 min · L7 · 1.4 km · pulse 128" / "Apartment 10 min" / "Walk 12 min".
function cardioText(c: SessionCardio): string {
  const mins = c.minutes !== null ? ` ${c.minutes} min` : '';
  if (c.lane === 'elliptical') {
    return [
      `Elliptical${mins}`,
      c.level !== null ? `L${c.level}` : '',
      c.km !== null ? `${c.km} km` : '',
      c.pulse !== null ? `pulse ${c.pulse}` : '',
    ]
      .filter((s) => s !== '')
      .join(' · ');
  }
  return `${c.lane === 'apartment' ? 'Apartment' : 'Walk'}${mins}`;
}

// Her words for one session, verbatim: the v48 note, the old one-word box, and
// (v47 rows) whatever she wrote into notes — the machine marker and the app's
// annotations stripped off. One entry per line.
function sessionWords(l: LogEntry): string {
  const parts: string[] = [];
  const note = (l.sessionNote ?? '').trim();
  if (note) parts.push(note);
  const word = (l.word || '').trim();
  if (word && word !== note) parts.push(word);
  parts.push(...splitNotes(l.notes).words);
  return parts.join('\n');
}

// "curl=easy;row=right" → "curl easy · row right".
function armFeelText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(';')
    .map((p) => p.split('=').join(' '))
    .filter((p) => p.trim() !== '')
    .join(' · ');
}

// The back-pain number turns amber only at her own stop line — "Back pain at
// 3/10 → stop that exercise". A 1/10 lit up like a verdict (uxui weekly 2/5).
const BACK_PAIN_STOP_AT = 3;

// ONE row, everywhere a session is listed (Sessions, Weekly review):
// badge · "Sat Sep 19 · 40 min" · the wall-sit sparkline (A only) · a dim meta
// line · her words, verbatim. `logs` = newest-first by date (for the sparkline).
function renderSessionRow(l: LogEntry, logs: LogEntry[]): string {
  const idAttr = l.id ? `data-detail="${escapeHtml(l.id)}"` : '';
  const trend = l.workout === 'A' && l.wallSitSec > 0 ? getWallSitTrend(logs, l.id ?? null) : [];
  const spark = renderSparkline(trend);
  const back =
    l.backPain === null
      ? 'back —'
      : `back <span class="session-back${l.backPain >= BACK_PAIN_STOP_AT ? ' session-back-warn' : ''}">${l.backPain}</span>`;
  const wall =
    // v46: B and C have no wall sit — "wall 0s" there read as a zero.
    l.wallSitSec > 0 || l.workout === 'A' ? ` · wall ${l.wallSitSec}s` : '';
  const words = sessionWords(l).split('\n')[0] ?? '';
  return `
    <button class="history-row history-row-btn session-row" ${idAttr} type="button">
      <span class="history-workout-badge">${l.workout}</span>
      <div class="session-row-body">
        <div class="history-date">${formatRowDate(l.date)}${l.durationSec ? ` · ${formatRowDuration(l.durationSec)}` : ''}${spark ? ` <span class="history-sparkline-wrap">${spark}</span>` : ''}</div>
        <div class="history-meta">cap ${l.capacityBefore ?? '—'}→${l.capacityAfter ?? '—'}${wall} · ${back}</div>
        ${words ? `<div class="history-word" dir="auto">${escapeHtml(words)}</div>` : ''}
      </div>
      <span class="session-chev" aria-hidden="true">›</span>
    </button>`;
}

function logsNewestFirst(): LogEntry[] {
  return [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date));
}

function renderHistory(): string {
  const logs = logsNewestFirst();
  const header = `
    <div class="screen-header">
      <h2>Sessions</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;
  if (logs.length === 0) {
    return `${header}<p class="empty">No sessions yet.</p>`;
  }
  return `${header}<div class="card session-list">${logs.map((l) => renderSessionRow(l, logs)).join('')}</div>`;
}

// One label + value row on the Session screen; `stack` puts a long value under
// its label (her note), so the label never runs into the text (UX audit #12).
function detailRow(
  label: string,
  value: string,
  opts: { stack?: boolean; id?: string } = {}
): string {
  const id = opts.id ? ` id="${opts.id}"` : '';
  return opts.stack
    ? `<div class="detail-row detail-row-stack"><span class="detail-label">${label}</span><div class="detail-note"${id} dir="auto">${value}</div></div>`
    : `<div class="detail-row"><span class="detail-label">${label}</span><span${id}>${value}</span></div>`;
}

function renderHistoryDetail(): string {
  const logs = loadLogs();
  const log = logs.find((l) => l.id === state.historyDetailId);
  const header = `
    <div class="screen-header">
      <h2>Session</h2>
      <button class="quit-link" id="back-history" type="button">× Back</button>
    </div>`;
  if (!log) {
    return `${header}<p class="empty">That session isn't here anymore.</p>`;
  }
  // 10 rows → the ones that carry something (DECISIONS §5 Session detail).
  const rows: string[] = [];
  const span =
    log.startedAt && log.completedAt
      ? `${formatClock(log.startedAt)}–${formatClock(log.completedAt)}`
      : log.startedAt
        ? `from ${formatClock(log.startedAt)}`
        : '';
  const mins = log.durationSec ? formatRowDuration(log.durationSec) : '';
  rows.push(detailRow('Time', [span, mins].filter((s) => s !== '').join(' · ') || '—'));
  if (log.capacityBefore !== null || log.capacityAfter !== null) {
    rows.push(
      detailRow(
        'Capacity',
        log.capacityAfter === null
          ? `${log.capacityBefore}`
          : `${log.capacityBefore ?? '—'} → ${log.capacityAfter}`
      )
    );
  }
  // A is the only workout with a wall sit; on B/C the row asked about nothing.
  if (log.workout === 'A') {
    rows.push(detailRow('Wall sit', log.wallSitSec > 0 ? `${log.wallSitSec} s` : '—'));
  }
  rows.push(detailRow('Back pain', log.backPain === null ? '—' : `${log.backPain}/10`));
  const cardio = sessionCardio(log);
  if (cardio)
    rows.push(detailRow('Cardio', escapeHtml(cardioText(cardio)), { id: 'detail-cardio' }));
  if (log.liteDay) {
    // Lite = one round less than the plan that week had.
    const rounds = Math.max(1, getWorkoutById(log.workout, new Date(log.date)).rounds - 1);
    rows.push(detailRow('Lite', `${rounds} round${rounds === 1 ? '' : 's'}`));
  }
  const arms = armFeelText(log.armFeel);
  if (arms) rows.push(detailRow('Arms', escapeHtml(arms)));
  const words = sessionWords(log);
  if (words) {
    rows.push(detailRow('Note', escapeHtml(words), { stack: true, id: 'detail-session-note' }));
  }
  const system = splitNotes(log.notes).system;
  if (system.length > 0) {
    rows.push(detailRow('System', escapeHtml(system.join(' · ')), { stack: true }));
  }
  return `
    ${header}
    <p class="detail-sub">Workout ${log.workout} · ${formatDateLong(log.date)}</p>
    <div class="card detail-card">${rows.join('')}</div>
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

type WeekSession = {
  log: LogEntry;
  durationStr: string;
};

function getWeekSessions(offset: number): WeekSession[] {
  // Swing-aware (v42): sessions COUNTED toward this Sat→Fri week, oldest first.
  return sessionsAttributedTo(loadLogs(), saturdayForOffset(offset)).map((log) => ({
    log,
    durationStr: log.durationSec ? formatDuration(log.durationSec) : '—',
  }));
}

type WeekTotals = {
  count: number;
  totalSec: number;
  // How many of `count` sessions contributed to totalSec (v34). Less than
  // count → the total is partial and must say so.
  durationKnownCount: number;
  avgCapBefore: number | null;
  avgCapAfter: number | null;
  maxWallSit: number;
  avgBackPain: number | null; // averaged only over sessions with backPain > 0
};

function computeWeekTotals(sessions: WeekSession[]): WeekTotals {
  if (sessions.length === 0) {
    return {
      count: 0,
      totalSec: 0,
      durationKnownCount: 0,
      avgCapBefore: null,
      avgCapAfter: null,
      maxWallSit: 0,
      avgBackPain: null,
    };
  }
  let totalSec = 0;
  // v34: count how many of the week's sessions actually HAVE a duration. A
  // session logged after the fact has none, and `?? 0` quietly folded it in as
  // zero minutes — so a real 3-session week reported the total of 2 as if it
  // were the total of 3. Fail-loud rule: say the total is partial, never
  // present a hole as a number.
  let durationKnownCount = 0;
  let capBeforeSum = 0;
  let capBeforeCount = 0; // v39: before-capacity can be missing on old rows too
  let capAfterSum = 0;
  let capAfterCount = 0; // v32: after-the-fact logs have no after-reading
  let maxWallSit = 0;
  let backPainSum = 0;
  let backPainCount = 0;
  for (const { log } of sessions) {
    if (typeof log.durationSec === 'number') {
      totalSec += log.durationSec;
      durationKnownCount += 1;
    }
    if (log.capacityBefore !== null) {
      capBeforeSum += log.capacityBefore;
      capBeforeCount += 1;
    }
    if (log.capacityAfter !== null) {
      capAfterSum += log.capacityAfter;
      capAfterCount += 1;
    }
    if (log.wallSitSec > maxWallSit) maxWallSit = log.wallSitSec;
    if (log.backPain !== null && log.backPain > 0) {
      backPainSum += log.backPain;
      backPainCount += 1;
    }
  }
  return {
    count: sessions.length,
    totalSec,
    durationKnownCount,
    avgCapBefore: capBeforeCount > 0 ? capBeforeSum / capBeforeCount : null,
    avgCapAfter: capAfterCount > 0 ? capAfterSum / capAfterCount : null,
    maxWallSit,
    avgBackPain: backPainCount > 0 ? backPainSum / backPainCount : null,
  };
}

function formatAvg(n: number | null, digits = 1): string {
  if (n === null) return '—';
  return n.toFixed(digits);
}

function formatTotalDuration(sec: number): string {
  if (sec <= 0) return '0m';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

// Calmly directional delta. NOT shouty — per agency rule. Show direction with
// muted progress/dim tokens; a "worse" delta gets --text-dim, NOT a warn color.
// v48 · P6 (Sep 24 2026): with its unit — "↓ -22m", "↑ +5s" (a bare "-22" left
// her to guess minutes or seconds; uxui weekly).
function renderDelta(
  curr: number,
  prev: number,
  kind: 'higher-better' | 'lower-better',
  unit = ''
): string {
  const diff = curr - prev;
  if (diff === 0) {
    return `<span class="weekly-review-delta-num delta-same">±0${unit}</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff}${unit}</span>`;
}

function renderDeltaDecimal(
  curr: number | null,
  prev: number | null,
  kind: 'higher-better' | 'lower-better'
): string {
  if (curr === null || prev === null) {
    return `<span class="weekly-review-delta-num delta-same">—</span>`;
  }
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) {
    return `<span class="weekly-review-delta-num delta-same">±0</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff.toFixed(1)}</span>`;
}

// The Saturday the program's first week starts on — the ‹ arrow stops there.
function firstProgramSaturday(): Date {
  const start = new Date(PROGRAM_START_DATE + 'T00:00:00');
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

// The review's title in home's words: "This week · R2 · Week 4 · Sep 19–25",
// a past week "R2 · Week 3 · Sep 12–18", a held week "Sick week · Jul 11–17".
function weekReviewTitle(offset: number): string {
  const saturday = saturdayForOffset(offset);
  const friday = new Date(saturday);
  friday.setDate(saturday.getDate() + 6);
  const range = formatWeekRange(saturday, friday);
  const pw = getProgramWeek(saturday);
  if (pw.skippedLabel) return `${pw.skippedLabel} week · ${range}`;
  const week = `${pw.round > 1 ? `R${pw.round} · ` : ''}Week ${pw.num}`;
  return offset === 0 ? `This week · ${week} · ${range}` : `${week} · ${range}`;
}

function renderWeeklyReview(): string {
  const offset = viewedWeekOffset;
  const saturday = saturdayForOffset(offset);
  const skipped = getProgramWeek(saturday).skippedLabel;
  const canGoBack = saturdayForOffset(offset + 1).getTime() >= firstProgramSaturday().getTime();

  const sessions = getWeekSessions(offset);
  const totals = computeWeekTotals(sessions);
  const prevSessions = getWeekSessions(offset + 1);
  const prev = computeWeekTotals(prevSessions);

  // The ‹ › arrows sit around the title (moved from home, DECISIONS §5). The
  // live week has nothing after it, so › is hidden — not a dead button.
  const header = `
    <div class="screen-header review-header">
      <div class="review-nav">
        <button class="review-arrow${canGoBack ? '' : ' review-arrow-off'}" id="prev-week" type="button" aria-label="Previous week"${canGoBack ? '' : ' disabled'}>‹</button>
        <h2 class="review-title">${weekReviewTitle(offset)}</h2>
        <button class="review-arrow${offset > 0 ? '' : ' review-arrow-off'}" id="next-week" type="button" aria-label="Next week"${offset > 0 ? '' : ' disabled'}>›</button>
      </div>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // A held week (sick / break) is not a miss (her Jul 19 rule): no "of 3".
  const sessionCountClass = totals.count >= 3 ? 'weekly-review-count-met' : 'weekly-review-count';
  const subtitle = skipped
    ? ''
    : `<div class="weekly-review-subtitle">
        Sessions: <span class="${sessionCountClass}"><strong>${totals.count}</strong> of 3</span>
      </div>`;

  // Empty state — single subtle line, no nudge.
  if (sessions.length === 0) {
    const emptyLine = skipped
      ? 'Held the slot — doesn’t count.'
      : offset === 0
        ? 'No sessions this week.'
        : 'No sessions that week.';
    return `
      ${header}
      ${subtitle}
      <p class="weekly-review-empty">${emptyLine}</p>
      ${renderWeeklyTargetGrid('Week by week')}
    `;
  }

  const newestFirst = logsNewestFirst();
  const sessionRows = sessions.map((s) => renderSessionRow(s.log, newestFirst)).join('');

  // "6.0 → 7.0"; with no after-readings that week, just the before (the
  // Session screen's "7 when after is null" — a hole never drawn as "→ —").
  const capTile =
    totals.avgCapBefore === null && totals.avgCapAfter === null
      ? '—'
      : totals.avgCapAfter === null
        ? formatAvg(totals.avgCapBefore)
        : `${formatAvg(totals.avgCapBefore)} → ${formatAvg(totals.avgCapAfter)}`;
  const painWarn = totals.avgBackPain !== null && totals.avgBackPain >= BACK_PAIN_STOP_AT;
  // Four tiles, an even grid (v48 · P6: one "Capacity 5.5 → 6.0" tile replaced
  // the two average tiles; back pain always has its tile — "none" when no pain).
  const totalsCard = `
    <div class="card weekly-review-totals">
      <h3>Week totals</h3>
      <div class="weekly-review-totals-grid">
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${formatTotalDuration(totals.totalSec)}</div>
          <div class="weekly-review-total-lbl">${
            totals.durationKnownCount < totals.count
              ? `total time · ${totals.durationKnownCount} of ${totals.count} sessions`
              : 'total time'
          }</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${capTile}</div>
          <div class="weekly-review-total-lbl">capacity</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${totals.maxWallSit > 0 ? `${totals.maxWallSit}s` : '—'}</div>
          <div class="weekly-review-total-lbl">max wall sit</div>
        </div>
        <div class="weekly-review-total${painWarn ? ' weekly-review-total-warn' : ''}">
          <div class="weekly-review-total-num">${totals.avgBackPain === null ? 'none' : formatAvg(totals.avgBackPain)}</div>
          <div class="weekly-review-total-lbl">${totals.avgBackPain === null ? 'back pain' : 'avg back pain'}</div>
        </div>
      </div>
    </div>
  `;

  // v48 · P6 (Sep 24 2026): "vs previous week" only for a CLOSED week — on a
  // Thursday it showed "↓ -1" for a week she was on track to finish (uxui
  // weekly 4/5). The live week says so in one quiet line instead.
  const deltaCard =
    offset > 0 && prev.count > 0
      ? `
        <div class="card weekly-review-delta">
          <h3>vs previous week</h3>
          <div class="weekly-review-delta-grid">
            <div class="weekly-review-delta-row">
              <span class="weekly-review-delta-lbl">sessions</span>
              <span class="weekly-review-delta-vals">${prev.count} → ${totals.count}</span>
              ${renderDelta(totals.count, prev.count, 'higher-better')}
            </div>
            <div class="weekly-review-delta-row">
              <span class="weekly-review-delta-lbl">total time</span>
              <span class="weekly-review-delta-vals">${formatTotalDuration(prev.totalSec)} → ${formatTotalDuration(totals.totalSec)}</span>
              ${renderDelta(Math.round(totals.totalSec / 60), Math.round(prev.totalSec / 60), 'higher-better', 'm')}
            </div>
            ${
              prev.maxWallSit > 0 || totals.maxWallSit > 0
                ? `<div class="weekly-review-delta-row weekly-review-delta-row-emph">
                    <span class="weekly-review-delta-lbl">max wall sit</span>
                    <span class="weekly-review-delta-vals">${prev.maxWallSit}s → ${totals.maxWallSit}s</span>
                    ${renderDelta(totals.maxWallSit, prev.maxWallSit, 'higher-better', 's')}
                  </div>`
                : ''
            }
            ${
              prev.avgBackPain !== null || totals.avgBackPain !== null
                ? `<div class="weekly-review-delta-row">
                    <span class="weekly-review-delta-lbl">avg back pain</span>
                    <span class="weekly-review-delta-vals">${formatAvg(prev.avgBackPain)} → ${formatAvg(totals.avgBackPain)}</span>
                    ${renderDeltaDecimal(totals.avgBackPain, prev.avgBackPain, 'lower-better')}
                  </div>`
                : ''
            }
          </div>
        </div>
      `
      : offset === 0
        ? '<p class="weekly-review-open">Week still open.</p>'
        : '';

  return `
    ${header}
    ${subtitle}
    <div class="card weekly-review-sessions session-list">
      ${sessionRows}
    </div>
    ${totalsCard}
    ${deltaCard}
    ${
      // v48 · P4 (Sep 24 2026): re-homed from home; stays at the bottom, closed.
      renderWeeklyTargetGrid('Week by week')
    }
  `;
}

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

// Oldest → newest array of all logs. v48 · P6 (Sep 24 2026): sorted by DATE —
// the old `.reverse()` trusted storage order, and writeLogs keeps unsynced rows
// first, so a session saved offline could sit at the "latest" end of a chart.
function getChronologicalLogs(): LogEntry[] {
  return [...loadLogs()].sort((a, b) => a.date.localeCompare(b.date));
}

// Generic line-chart helper. Renders one or more series on a shared
// session-index x-axis. Each series has a color (CSS var name as string),
// values array, and optional "emph last point" flag. SVG dimensions: 100%
// width × 220px height via viewBox; the parent container constrains real
// pixel size.
type LineSeries = {
  values: number[];
  colorVar: string; // e.g. 'var(--accent-progress)'
  dotFill?: string; // optional fill for non-emph dots
  emphLast?: boolean;
};

function renderProgressLineChart(
  series: LineSeries[],
  opts: {
    ariaLabel: string;
    showMaxGuide?: boolean;
    maxGuideLabel?: string;
    // v48 · P6: indexes where a new round starts — a faint vertical rule before
    // that point, so the post-break dip reads as a restart (DECISIONS §5).
    boundaries?: { index: number; label: string }[];
  }
): string {
  // Flatten all values to compute shared y-range across series.
  const allVals: number[] = [];
  for (const s of series) for (const v of s.values) allVals.push(v);
  if (allVals.length < 2) return '';

  const W = 320;
  const H = 220;
  const PAD_L = 8;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 14;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  // Pad y-range by 8% on each side so the line doesn't kiss the frame.
  const span = dataMax - dataMin || 1;
  const yMin = dataMin - span * 0.08;
  const yMax = dataMax + span * 0.08;
  const yRange = yMax - yMin || 1;

  // Use the longest series for x-step.
  const maxLen = Math.max(...series.map((s) => s.values.length));
  const stepX = maxLen > 1 ? innerW / (maxLen - 1) : 0;

  function xFor(i: number): number {
    return PAD_L + i * stepX;
  }
  function yFor(v: number): number {
    return PAD_T + (1 - (v - yMin) / yRange) * innerH;
  }

  // Optional dashed max guideline. v48 · P6: its label sits at the LEFT end —
  // at the right it covered the latest point whenever the latest was the best.
  let guide = '';
  if (opts.showMaxGuide) {
    const guideY = yFor(dataMax);
    guide = `
      <line x1="${PAD_L}" y1="${guideY.toFixed(1)}" x2="${(W - PAD_R).toFixed(1)}" y2="${guideY.toFixed(1)}"
            stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" />
      <text x="${PAD_L}" y="${(guideY - 4).toFixed(1)}" text-anchor="start"
            font-size="9" fill="var(--text-dim-2)" letter-spacing="1.2px">${escapeHtml(opts.maxGuideLabel ?? 'max')}</text>
    `;
  }

  const rules = (opts.boundaries ?? [])
    .filter((b) => b.index > 0 && b.index < maxLen)
    .map((b) => {
      const x = (xFor(b.index - 1) + xFor(b.index)) / 2;
      return `
        <line class="round-rule" x1="${x.toFixed(1)}" y1="${PAD_T}" x2="${x.toFixed(1)}" y2="${(H - PAD_B).toFixed(1)}"
              stroke="var(--border-strong)" stroke-width="1" />
        <text x="${(x + 4).toFixed(1)}" y="${(PAD_T + 8).toFixed(1)}" font-size="9"
              fill="var(--text-dim-2)" letter-spacing="1.2px">${escapeHtml(b.label)}</text>`;
    })
    .join('');

  // Build a path + circles per series.
  const seriesHtml = series
    .map((s) => {
      if (s.values.length < 2) return '';
      const pts = s.values.map((v, i) => [xFor(i), yFor(v)] as [number, number]);
      const path = pts
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ');
      const dots = pts
        .map(([x, y], i) => {
          const isLast = i === pts.length - 1;
          if (isLast && s.emphLast) {
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="var(--accent-progress)" stroke="var(--text)" stroke-width="1.5" />`;
          }
          const fill = s.dotFill ?? s.colorVar;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${fill}" />`;
        })
        .join('');
      return `
        <path d="${path}" fill="none" stroke="${s.colorVar}" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      `;
    })
    .join('');

  return `
    <svg class="progress-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(opts.ariaLabel)}">
      <title>${escapeHtml(opts.ariaLabel)}</title>
      ${guide}
      ${rules}
      ${seriesHtml}
    </svg>
  `;
}

// Bar chart for back pain — categorical (0-10), bar per session.
// v48 · P6 (Sep 24 2026): a pain-free session gets a faint tick instead of
// nothing (the chart only witnessed the bad days — uxui progress 2/5), and a
// bar is amber only at her 3/10 stop line.
function renderProgressBarChart(
  values: number[],
  opts: { ariaLabel: string; yMax: number }
): string {
  if (values.length === 0) return '';
  const W = 320;
  const H = 140;
  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 12;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Bar geometry: target 4px wide, 2px gap. If too many sessions, the bar
  // shrinks but we keep at least 1px wide.
  const slot = innerW / values.length;
  const barW = Math.max(1, Math.min(4, slot - 2));

  const bars = values
    .map((v, i) => {
      const x = PAD_L + i * slot + (slot - barW) / 2;
      if (v <= 0) {
        return `<rect class="pain-tick" x="${x.toFixed(1)}" y="${(PAD_T + innerH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2"
              fill="var(--text-dim-2)" opacity="0.6" rx="1" />`;
      }
      const ratio = Math.min(1, v / opts.yMax);
      const h = ratio * innerH;
      const y = PAD_T + innerH - h;
      const fill = v >= BACK_PAIN_STOP_AT ? 'var(--accent-warn)' : 'var(--text-dim)';
      return `<rect class="pain-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              fill="${fill}" rx="1" />`;
    })
    .join('');

  return `
    <svg class="progress-chart progress-chart-bar" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(opts.ariaLabel)}">
      <title>${escapeHtml(opts.ariaLabel)}</title>
      ${bars}
    </svg>
  `;
}

// ----- Per-card render helpers -----

// The level / km she recorded on a ride: the v48 columns, else the v47 marker.
function rideLevel(l: LogEntry): number | null {
  if (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) return l.ellipticalLevel;
  return l.cardioLane ? null : (splitNotes(l.notes).cardio?.level ?? null);
}

function rideKm(l: LogEntry): number | null {
  if (typeof l.ellipticalKm === 'number' && l.ellipticalKm > 0) return l.ellipticalKm;
  return l.cardioLane ? null : (splitNotes(l.notes).cardio?.km ?? null);
}

// v48 · P6 (Sep 24 2026): "Start → Now" — DECISIONS §2 #5 (Gemini, taken):
// "elliptical level first → latest, km first → latest, wall sit first → latest,
// and '40 sessions'. That's movement with no verdict (guide §2)." Rows only
// where there's data; a latest below the first shows plainly, never coloured.
function renderStartNowCard(logs: LogEntry[]): string {
  const first = logs[0];
  if (!first) return '';
  const pair = (vals: number[], unit: string): string => {
    const a = vals[0];
    const b = vals[vals.length - 1];
    if (a === undefined || b === undefined) return '';
    return vals.length === 1
      ? `<span class="sn-last">${a}</span>${unit}`
      : `<span class="sn-first">${a}</span> → <span class="sn-last">${b}</span>${unit}`;
  };
  const rows: [string, string][] = [];
  const levels = logs.map(rideLevel).filter((v): v is number => v !== null);
  if (levels.length) rows.push(['Elliptical level', pair(levels, '')]);
  const kms = logs.map(rideKm).filter((v): v is number => v !== null);
  if (kms.length) rows.push(['Elliptical km', pair(kms, ' km')]);
  const walls = logs.filter((l) => l.wallSitSec > 0).map((l) => l.wallSitSec);
  if (walls.length) rows.push(['Wall sit', pair(walls, ' s')]);
  return `
    <div class="card progress-card start-now-card">
      <div class="progress-card-label">Start → Now</div>
      <div class="progress-stat-big start-now-hero">${logs.length} <span class="start-now-unit">session${logs.length === 1 ? '' : 's'}</span></div>
      ${rows
        .map(
          ([label, val]) =>
            `<div class="start-now-row"><span class="start-now-lbl">${label}</span><span class="start-now-val">${val}</span></div>`
        )
        .join('')}
      <div class="progress-card-meta">since ${formatMonthDay(first.date)}</div>
    </div>`;
}

function renderWallSitTrendCard(logs: LogEntry[]): string {
  // Wall-sit values only come from workouts that include a wall sit (A).
  // Use every log with wallSitSec > 0, chronological (by date — v48 · P6).
  const wallLogs = logs.filter((l) => l.wallSitSec > 0);
  const wallSits = wallLogs.map((l) => l.wallSitSec);

  if (wallSits.length < 2) {
    if (wallSits.length === 1) {
      const only = wallSits[0] ?? 0;
      return `
        <div class="card progress-card">
          <div class="progress-card-label">Wall sit · seconds held</div>
          <div class="progress-stat-big">${only} s</div>
          <p class="progress-card-empty">One value logged — chart appears after 2+ wall-sit sessions.</p>
        </div>
      `;
    }
    return '';
  }

  const first = wallSits[0] ?? 0;
  const last = wallSits[wallSits.length - 1] ?? 0;
  const maxVal = Math.max(...wallSits);
  const diff = last - first;
  // Plain words, no colour (v48 · P6): the hero reports where she IS.
  const sinceFirst =
    diff === 0 ? 'same as first session' : `${diff > 0 ? '+' : ''}${diff}s since first session`;

  // The Round 1 → 2 boundary (and any later round): the first wall sit on or
  // after each round's start.
  const boundaries = ROUNDS.slice(1)
    .map((r) => ({
      index: wallLogs.findIndex((l) => l.date >= r.start),
      label: `R${r.num}`,
    }))
    .filter((b) => b.index > 0);

  const chart = renderProgressLineChart(
    [
      {
        values: wallSits,
        colorVar: 'var(--accent-progress)',
        emphLast: true,
      },
    ],
    {
      ariaLabel: `Wall sit trend: ${first} to ${last} seconds over ${wallSits.length} sessions, best ${maxVal}`,
      showMaxGuide: true,
      maxGuideLabel: 'best',
      boundaries,
    }
  );

  // v48 · P6 (Sep 24 2026): the hero is the LATEST hold, "best" sits quiet in
  // the meta — "a hero you're not at is a misreport" (DECISIONS §5, fail-loud).
  return `
    <div class="card progress-card wall-sit-card">
      <div class="progress-card-label">Wall sit · seconds held</div>
      <div class="progress-stat-big">${last} s</div>
      <div class="progress-chart-wrap">${chart}</div>
      <div class="progress-card-meta">best ${maxVal} s · ${sinceFirst}</div>
    </div>
  `;
}

function renderBackPainTrendCard(allLogs: LogEntry[]): string {
  // Skip sessions with no back-pain reading (v32 after-the-fact logs).
  const logs = allLogs.filter((l) => l.backPain !== null);
  if (logs.length < 2) return '';

  const values = logs.map((l) => l.backPain ?? 0); // filtered above; ?? only narrows the type
  const positive = values.filter((v) => v > 0);
  const painFree = values.length - positive.length;
  const avg = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : 0;

  // Pain scale max is 10 per the post-log chips.
  const chart = renderProgressBarChart(values, {
    ariaLabel:
      positive.length === 0
        ? `Back pain: no pain logged across ${logs.length} sessions`
        : `Back pain: ${positive.length} of ${logs.length} sessions with pain, avg ${avg.toFixed(1)}`,
    yMax: 10,
  });

  // v48 · P6 (Sep 24 2026): the pain-free days are witnessed first
  // ("Pain-free 24 of 30 · avg 1.8 when it hurt", DECISIONS §5).
  const metaLine =
    positive.length === 0
      ? `Pain-free ${painFree} of ${values.length}`
      : `Pain-free ${painFree} of ${values.length} · avg ${avg.toFixed(1)} when it hurt`;

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Back pain · 0–10</div>
      <div class="progress-chart-wrap progress-chart-wrap-bar">${chart}</div>
      <div class="progress-card-meta">${metaLine}</div>
    </div>
  `;
}

type PerWeekRow = {
  label: string;
  value: number;
  round: number;
  isCurrent: boolean;
  skipped: boolean;
  // v48 · fix r1: a 0-session week inside a sick/break stretch or after a
  // closed round's last session — shown as "—", not scored.
  held?: boolean;
};

// One sessions-per-week row. v48 · P6 (Sep 24 2026): HTML, not SVG — the
// "n / 3" sits OUTSIDE the track so a full bar stays readable (her wins were
// the unreadable rows, 1.25:1), and a held week is its label + "—": no track,
// no number (break weeks were scored "0 / 3" — uxui progress 3/5 ×2).
function renderPerWeekRow(r: PerWeekRow): string {
  if (r.skipped || r.held) {
    return `<div class="spw-row spw-row-skipped"><span class="spw-label">${escapeHtml(r.label)}</span><span class="spw-skip">—</span></div>`;
  }
  const pct = Math.round(Math.min(1, r.value / SESSIONS_PER_WEEK_TARGET) * 100);
  return `
    <div class="spw-row${r.isCurrent ? ' spw-row-current' : ''}">
      <span class="spw-label">${escapeHtml(r.label)}</span>
      <span class="spw-track"><span class="spw-fill" style="width:${pct}%"></span></span>
      <span class="spw-count">${r.value} / ${SESSIONS_PER_WEEK_TARGET}</span>
    </div>`;
}

function renderSessionsPerWeekCard(logs: LogEntry[]): string {
  // One entry per program week from PROGRAM_START_DATE forward through the
  // current week.
  const firstSat = firstProgramSaturday();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSat = new Date(today);
  thisSat.setDate(today.getDate() - daysSinceSat);
  thisSat.setHours(0, 0, 0, 0);

  const rows: PerWeekRow[] = [];
  const cursor = new Date(firstSat);
  // Swing-aware (v42): same attribution as the 3-slot rows and the week card.
  const attribution = attributeSessionsToWeeks(logs);
  while (cursor.getTime() <= thisSat.getTime()) {
    const weekStart = new Date(cursor);
    const count = sessionsAttributedTo(logs, weekStart, attribution).length;
    const pw = getProgramWeek(weekStart);
    const isCurrent = weekStart.getTime() === thisSat.getTime();
    rows.push({
      label: isCurrent ? 'now' : pw.skippedLabel ? pw.skippedLabel.toLowerCase() : `wk ${pw.num}`,
      value: count,
      round: pw.round,
      isCurrent,
      skipped: pw.skippedLabel !== null,
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  if (rows.length === 0) return '';

  // v48 · fix r1 (Sep 24 2026): a 0-session week that sits next to a sick/break
  // week, or after a closed round's last session, is part of that stretch —
  // "—" with no track, never an empty "0 / 3" (her real Round 1: wk 11 sat
  // between "sick" and "break" scored 0/3; DECISIONS §5: "Skipped weeks show
  // '—' with no track"; her Jul 19 rule: a break is not a miss). The flag is
  // worked out from the original rows, so it never chains across a run.
  const currentRoundNum = getRoundFor(thisSat).num;
  const lastActiveIdx = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.value > 0) lastActiveIdx.set(r.round, i);
  });
  const held = rows.map((r, i) => {
    if (r.skipped || r.isCurrent || r.value > 0) return false;
    if (rows[i - 1]?.skipped || rows[i + 1]?.skipped) return true;
    const last = lastActiveIdx.get(r.round);
    return r.round < currentRoundNum && last !== undefined && i > last;
  });
  held.forEach((h, i) => {
    const r = rows[i];
    if (h && r) r.held = true;
  });

  // v46: only COMPLETED program weeks are counted. Break and sick weeks were
  // never a target and the week in progress isn't over. v48 · fix r1: the line
  // is a plain count of full weeks — no "target", no "of N" verdict.
  const judged = rows.filter((r) => !r.isCurrent && !r.skipped && !r.held);
  const hits = judged.filter((r) => r.value >= SESSIONS_PER_WEEK_TARGET).length;
  // A zero is a gentle empty state, not "0 full weeks" (guide §2: no guilt).
  const scoreLine =
    judged.length === 0
      ? 'The first week is in progress.'
      : hits === 0
        ? 'A full week (3 of 3) will count here.'
        : `<strong>${hits}</strong> full ${hits === 1 ? 'week' : 'weeks'}`;

  // v48 · P6 (Sep 24 2026): the current round's weeks open; each older round
  // folds into one closed row — her Aug 30 words: Round 1 is "a closed
  // chapter" (archived, still one tap away).
  const currentRound = currentRoundNum;
  const older = ROUNDS.filter((r) => r.num < currentRound)
    .map((r) => {
      const roundRows = rows.filter((row) => row.round === r.num);
      if (roundRows.length === 0) return '';
      const training = roundRows.filter((row) => !row.skipped).length;
      return `
        <details class="spw-older">
          <summary class="spw-older-summary">Round ${r.num} · ${training} wks <span class="spw-older-chev" aria-hidden="true">▸</span></summary>
          <div class="spw-rows">${roundRows.map(renderPerWeekRow).join('')}</div>
        </details>`;
    })
    .join('');
  const current = rows.filter((r) => r.round === currentRound);

  return `
    <div class="card progress-card spw-card" aria-label="Sessions per week: ${hits} full ${hits === 1 ? 'week' : 'weeks'}">
      <div class="progress-card-label">Sessions per week</div>
      <div class="spw-rows">${current.map(renderPerWeekRow).join('')}</div>
      ${older}
      <div class="progress-card-meta">
        ${scoreLine}
      </div>
    </div>
  `;
}

function renderProgress(): string {
  const logs = getChronologicalLogs(); // oldest → newest, by date
  const count = logs.length;

  // v48 · P6 (Sep 24 2026): the "Exercise breakdown" card (94 rows repeating
  // three numbers — uxui progress 3/5) became these three chips.
  const byWorkout: Record<WorkoutId, number> = { A: 0, B: 0, C: 0 };
  for (const l of logs) byWorkout[l.workout] += 1;
  const subtitle =
    count > 0
      ? `<div class="progress-subtitle">${(['A', 'B', 'C'] as WorkoutId[])
          .map((id) => `<span class="progress-chip">${id} ${byWorkout[id]}</span>`)
          .join('')}</div>`
      : '';

  const header = `
    <div class="screen-header">
      <h2>Progress</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // Empty state — fewer than 2 sessions.
  if (count < 2) {
    return `
      ${header}
      ${subtitle}
      <p class="progress-empty">Progress shows once you have 2+ sessions logged.</p>
      ${renderProgramArchive()}
    `;
  }

  // v48 · P6: the capacity chart is gone — it charted untouched defaults (6 of
  // 8 Round-2 after-readings were the invented 5; the real mean change is 0.00
  // over 24 pairs). DECISIONS §2 #6.
  return `
    ${header}
    ${subtitle}
    <div class="progress-screen">
      ${renderStartNowCard(logs)}
      ${renderWallSitTrendCard(logs)}
      ${renderBackPainTrendCard(logs)}
      ${renderSessionsPerWeekCard(logs)}
    </div>
    ${renderProgramArchive()}
  `;
}

// v48 · P4 (Sep 24 2026): "Coming next week" + "Past weeks" moved here from
// home, as-is (P6 restyles) — the program's past and next stay one tap from
// Progress (her archive rule: "just be archived nicely so i can pull when
// needed"), off the front door.
function renderProgramArchive(): string {
  const inner = `${renderComingNextWeek()}${renderPastWeeks()}`;
  if (!inner.trim()) return '';
  return `
    <div class="program-archive">
      <h3 class="program-archive-label">Program</h3>
      ${inner}
    </div>`;
}

// ---------- Ship 6: Settings screen ----------
//
// Reachable via the small gear icon in the home header (top-right). NOT a
// primary CTA — settings is reference, not action. Sections: Audio, Timing,
// Display, Gear, Neck release, Data (folded), About.
//
// All toggles persist to localStorage via setSetting/getSetting. Data section
// has export / import / hold-to-confirm clear. Import is merge-only; Clear
// is local-only (Supabase rows preserved) per the archive-not-delete rule.

// APP_VERSION is declared once near the top (single source of truth, shown in
// the home-header tag); the About caption below reuses it.
const GITHUB_REPO_URL = 'https://github.com/allisonecalt-sudo/workout-tracker';

// v48 · P6: the Data fold stays open across its own re-render (an import or a
// clear re-renders, then shows its status line inside the fold).
let settingsDataOpen = false;

function renderSettings(): string {
  const beepsOn = getBeepsEnabled();
  const restSec = getRestSec();
  const preCount = getPreCountSec();
  const howToOn = getHowToFirstExpand();
  const logCount = loadLogs().length;
  const latestRound = ROUNDS[ROUNDS.length - 1] ?? ROUNDS[0]!;

  return `
    <div class="screen-header">
      <h2>Settings</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>

    <div class="settings-screen">

      <div class="card settings-card">
        <div class="settings-section-label">Audio</div>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Beep sounds</div>
            <div class="settings-row-caption">Timer count-downs and finish chime.</div>
          </div>
          <span class="settings-toggle ${beepsOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-beeps" ${beepsOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Timing</div>
        <div class="settings-stepper-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Rest duration</div>
            <div class="settings-row-caption">Between main-set exercises. 0 = straight on · up to 180 s.</div>
          </div>
          <div class="settings-stepper" data-stepper="rest">
            <button class="settings-stepper-btn" id="rest-dec" type="button" aria-label="Decrease rest by 5 seconds">−</button>
            <span class="settings-stepper-val" id="rest-val">${restSec}s</span>
            <button class="settings-stepper-btn" id="rest-inc" type="button" aria-label="Increase rest by 5 seconds">+</button>
          </div>
        </div>
        <div class="settings-stepper-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Pre-countdown</div>
            <div class="settings-row-caption">Before holds. 0 skips. Rides never count down.</div>
          </div>
          <div class="settings-stepper" data-stepper="pre">
            <button class="settings-stepper-btn" id="pre-dec" type="button" aria-label="Decrease pre-countdown by 1 second">−</button>
            <span class="settings-stepper-val" id="pre-val">${preCount}s</span>
            <button class="settings-stepper-btn" id="pre-inc" type="button" aria-label="Increase pre-countdown by 1 second">+</button>
          </div>
        </div>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Display</div>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Open how-to on first visit</div>
            <div class="settings-row-caption">First time each week.</div>
          </div>
          <span class="settings-toggle ${howToOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-howto" ${howToOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      ${
        // v48 · P4 moved Gear & recovery here; P6 (Sep 24 2026) made it chips +
        // its own Neck release card (DECISIONS §5).
        renderGearCard()
      }

      <details class="card settings-card settings-data"${settingsDataOpen ? ' open' : ''}>
        <summary class="settings-data-summary">
          <span>Data · export · import · clear</span>
          <span class="settings-data-chev" aria-hidden="true">▸</span>
        </summary>
        <div class="settings-data-row">
          <button class="btn-ghost settings-data-btn" id="export-sessions" type="button">Export sessions</button>
          <div class="settings-row-caption">All sessions on this phone (${logCount}).</div>
        </div>
        <div class="settings-data-row">
          <button class="btn-ghost settings-data-btn" id="import-sessions-btn" type="button">Import sessions</button>
          <input type="file" id="import-sessions-input" accept="application/json,.json" style="display:none" />
          <div class="settings-row-caption">Existing entries on this phone win.</div>
        </div>
        <div class="settings-data-row">
          <button class="settings-clear-link hold-to-confirm" id="clear-local" type="button" data-hold-ms="${HOLD_TO_CLEAR_MS}">
            <span class="hold-fill"></span>
            <span class="hold-label">Hold to clear sessions on this phone</span>
          </button>
          <div class="settings-row-caption">This phone only. Cloud copy stays.</div>
        </div>
        <div class="settings-data-status" id="data-status" aria-live="polite"></div>
      </details>

      <div class="card settings-card">
        <div class="settings-section-label">About</div>
        <div class="settings-about-row">
          <div class="settings-row-title">Workout Tracker</div>
          <div class="settings-row-caption">Build ${APP_VERSION} · ${BUILD_DATE}.</div>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-title">Program weeks: ${getProgramWeekCount()}</div>
          <div class="settings-row-caption">Round ${latestRound.num} · from ${formatMonthDay(latestRound.start + 'T00:00:00')}</div>
        </div>
        <div class="settings-about-row">
          <a class="settings-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">Source on GitHub →</a>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-caption">Made by Allison + Claude.</div>
        </div>
      </div>

    </div>
  `;
}

// ---------- Ship 6: data helpers ----------

function exportSessionsToFile(): void {
  const logs = loadLogs();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `workout-tracker-export-${stamp}.json`;
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showDataStatus(`Exported ${logs.length} session${logs.length === 1 ? '' : 's'}.`);
}

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

function isValidLogEntry(x: unknown): x is LogEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const lane = o['cardioLane'];
  return (
    typeof o['date'] === 'string' &&
    (o['workout'] === 'A' || o['workout'] === 'B' || o['workout'] === 'C') &&
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
    isOptionalOf(o['voicePlays'], 'number')
  );
}

function importSessionsFromFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = reader.result;
      if (typeof raw !== 'string') {
        showDataStatus('Import failed: could not read file.');
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        showDataStatus('Import failed: file is not a session array.');
        return;
      }
      const incoming: LogEntry[] = [];
      for (const item of parsed) {
        if (isValidLogEntry(item)) {
          incoming.push({
            ...item,
            id: item.id ?? genId(),
            word: typeof item.word === 'string' ? item.word : '',
          });
        }
      }
      // Merge by id. Existing local entries win on conflict.
      const local = loadLogs();
      const byId = new Map<string, LogEntry>();
      for (const e of incoming) {
        if (e.id) byId.set(e.id, e);
      }
      for (const e of local) {
        if (e.id) byId.set(e.id, e); // local overrides incoming
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
      writeLogs(merged);
      const added = merged.length - local.length;
      // Re-render so log-count caption updates, THEN surface the status
      // (the new DOM has a fresh #data-status node).
      render();
      showDataStatus(
        `Imported ${incoming.length} entr${incoming.length === 1 ? 'y' : 'ies'}, ${added} new.`
      );
    } catch {
      showDataStatus('Import failed: file is not valid JSON.');
    }
  };
  reader.readAsText(file);
}

function clearLocalSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Re-render first (DOM gets recreated, log-count caption updates), THEN
    // surface the status. If we showed status before render(), the freshly-
    // rendered DOM would have no status node and the message would vanish.
    render();
    showDataStatus('Local sessions cleared.');
  } catch {
    showDataStatus('Clear failed.');
  }
}

function showDataStatus(msg: string): void {
  const el = document.getElementById('data-status');
  if (el) {
    el.textContent = msg;
    el.classList.add('settings-data-status-visible');
    window.setTimeout(() => {
      if (el.textContent === msg) {
        el.classList.remove('settings-data-status-visible');
      }
    }, 4000);
  }
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
    render();
  });
  panel.addEventListener('click', (e) => {
    if (e.target === panel) dismiss();
  });
}

// v46: WHERE she is, for the scroll reset in render(). Done·Next at the bottom
// of one step used to open the next step at the same scroll depth — the
// exercise name 69px off the top, another Done·Next under her thumb, 22 of 22
// steps (UX audit Sep 24). Keyed on position, not on render: the timer
// re-renders every second and must never move the page.
let lastNavKey: string | null = null;
// v48 · P6: the list's scroll when a Session was opened from it, per screen,
// and the one value render() should restore on the next screen change.
const detailOpenedAtScroll: Partial<Record<AppScreen, number>> = {};
let pendingScrollRestore: number | null = null;

function navigationKey(): string {
  if (state.screen === 'workout') {
    return `workout|${state.currentPhase}|${state.currentRound}|${state.currentExerciseIndex}|${state.isResting ? 'rest' : state.roundBreak ? 'break' : 'go'}`;
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
    case 'weekly-review':
      html = renderWeeklyReview();
      break;
    case 'progress':
      html = renderProgress();
      break;
    case 'settings':
      html = renderSettings();
      break;
  }
  // Pause affordance — the Pause button sits in each workout sub-view's header
  // (exercise, rest, cooldown; v46). When paused, a full overlay replaces it so
  // Resume is unmissable on any sub-view.
  if (state.screen === 'workout' && state.pausedAt !== null) {
    html += renderPausedOverlay();
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
  // v46: a new screen or step lands at the top (see navigationKey).
  // v48 · P6 (Sep 24 2026): except coming BACK from a Session to the list that
  // opened it — she lands where she was, not at the top of 39 rows (DECISIONS
  // §5 Sessions: "Scroll position is restored on back").
  const navKey = navigationKey();
  if (navKey !== lastNavKey) {
    lastNavKey = navKey;
    const restore = pendingScrollRestore;
    pendingScrollRestore = null;
    window.scrollTo(0, restore ?? 0);
  }
  // Persist live position so reopening the app resumes the workout (cleared on
  // quit/finish via resetState). No-op for non-resumable screens.
  saveActiveSession();
}

// Group 2H: hold-to-skip implementation. The button shows a fill that
// progresses over HOLD_TO_SKIP_MS; on release before complete, fill resets.
function wireHoldToSkip(btn: HTMLElement, onSkip: () => void): void {
  const holdMs = parseInt(btn.dataset['holdMs'] ?? `${HOLD_TO_SKIP_MS}`, 10) || HOLD_TO_SKIP_MS;
  const fill = btn.querySelector<HTMLElement>('.hold-fill');
  let holdStart: number | null = null;
  let raf: number | null = null;
  let fired = false;

  function tick(): void {
    if (holdStart === null) return;
    const elapsed = Date.now() - holdStart;
    const pct = Math.min(1, elapsed / holdMs);
    if (fill) fill.style.width = `${pct * 100}%`;
    if (pct >= 1 && !fired) {
      fired = true;
      reset();
      onSkip();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function reset(): void {
    holdStart = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (fill) fill.style.width = '0%';
  }

  function down(e: Event): void {
    e.preventDefault();
    if (fired) return;
    holdStart = Date.now();
    tick();
  }

  function up(): void {
    if (fired) return;
    reset();
  }

  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
}

function attachHandlers(): void {
  // v48 · P4: the "Up next" hero AND the B/C chips carry data-workout.
  document.querySelectorAll<HTMLButtonElement>('button[data-workout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['workout'] as WorkoutId | undefined;
      if (id) {
        unlockAudio(); // Group 1C: gesture-anchored audio unlock
        startWorkout(id);
      }
    });
  });

  bindClick('view-history', () => {
    state.screen = 'history';
    render();
  });

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

  // v48 · P6 (Sep 24 2026): the ‹ › week arrows, moved here from home (P4) —
  // stepping back through weeks lives on the screen made for looking back.
  bindClick('prev-week', () => {
    viewedWeekOffset += 1;
    render();
  });
  bindClick('next-week', () => {
    if (viewedWeekOffset > 0) viewedWeekOffset -= 1;
    render();
  });

  // Ship 6: Settings entry from home header.
  bindClick('open-settings', () => {
    settingsDataOpen = false; // v48 · P6: the Data fold opens closed
    state.screen = 'settings';
    render();
  });

  // Ship 6: Settings interactions — toggles, steppers, data buttons.
  attachSettingsHandlers();

  // Ship 4: open weekly-review screen. v48 · P4 (Sep 24 2026): home only ever
  // shows THIS week now, so it opens this week (offset 0). The whole week card is the one door to Weekly review (the
  // separate "📊 Weekly review" row is gone). It's a div (the day dots inside
  // are buttons), so Enter/Space open it too.
  const openWeeklyReview = (): void => {
    viewedWeekOffset = 0;
    state.screen = 'weekly-review';
    render();
  };
  bindClick('open-weekly-review', openWeeklyReview);
  document.getElementById('open-weekly-review')?.addEventListener('keydown', (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openWeeklyReview();
    }
  });

  // Ship 5: Progress screen — full-history longitudinal view, from home's door.
  // (v48 · P6: the Session screen's "📈 View progress" link and the Exercise
  // breakdown toggle are gone with what they opened.)
  bindClick('open-progress-link', () => {
    state.screen = 'progress';
    render();
  });

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

  // v48 · P6 (Sep 24 2026): the Session screen's × Back goes where she came
  // from (Weekly review / Sessions / home), at the scroll she left it.
  bindClick('back-history', () => {
    const target = state.detailReturnTo ?? 'history';
    pendingScrollRestore = detailOpenedAtScroll[target] ?? null;
    state.screen = target;
    state.historyDetailId = null;
    state.detailReturnTo = null;
    render();
  });

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
      detailOpenedAtScroll[state.detailReturnTo] = window.scrollY;
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
    advanceExercise();
  });
  // v47: one step back (her ask Sep 24: "i need to be able to go back").
  bindClick('step-back', () => {
    goBack();
  });

  // v45: the post-log text is kept as she types, so an app close on that
  // screen doesn't lose it (the resume snapshot carries it).
  // v48 · P5 (Sep 24 2026): the one-word box is gone (filled 0 of 9 since Aug
  // 30; its 40-character cap cut her May 11 entry mid-word) — one note box.
  const noteInput = document.getElementById('session-note') as HTMLTextAreaElement | null;
  noteInput?.addEventListener('input', () => {
    state.sessionNote = noteInput.value;
    saveActiveSession();
  });
  // Enter = "done typing" (the keyboard's Done key): it closes the keyboard so
  // Save is in view — it never saves by itself (a save she didn't choose is a
  // surprise). Shift+Enter still makes a new line.
  noteInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      noteInput.blur();
    }
  });
  // The wall-sit number survives a chip tap's re-render.
  const wallsitInput = document.getElementById('wallsit') as HTMLInputElement | null;
  wallsitInput?.addEventListener('input', () => {
    const raw = parseInt(wallsitInput.value, 10);
    state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    saveActiveSession();
  });

  // v48 · P5: the 1-10 body/back chips. Tap = that number; tap the chosen one
  // again = no reading (null), the way an untouched slider saved since v46.
  document.querySelectorAll<HTMLButtonElement>('[data-body-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset['bodyChip'];
      const v = Number(btn.dataset['value']);
      if (!Number.isFinite(v)) return;
      const again = btn.getAttribute('aria-checked') === 'true';
      if (group === 'cap-before') {
        state.capacityBefore = v;
        state.capacityBeforeTouched = !again;
      } else if (group === 'cap-after') {
        state.capacityAfter = v;
        state.capacityAfterTouched = !again;
      } else if (group === 'back') {
        state.backPain = v;
        state.backPainTouched = !again;
        state.backSomethingOpen = true;
      }
      render();
    });
  });
  // Back: Fine = 0 (one tap); tap again = no reading.
  bindClick('back-fine', () => {
    const wasFine = state.backPainTouched && state.backPain === 0;
    state.backPain = 0;
    state.backPainTouched = !wasFine;
    state.backSomethingOpen = false;
    render();
  });
  // Something = open the 1-10 row, nothing chosen yet; tap again = close it
  // and drop any number picked there.
  bindClick('back-some', () => {
    const open = state.backSomethingOpen || (state.backPainTouched && state.backPain > 0);
    if (open) {
      state.backSomethingOpen = false;
      state.backPainTouched = false;
    } else {
      state.backSomethingOpen = true;
      state.backPainTouched = false; // "Fine" is no longer the answer
    }
    render();
  });
  bindClick('back-to-stretches', () => {
    backToStretches();
  });
  bindClick('back-to-workout', () => {
    backToWorkoutFromStop();
  });
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
      render();
    });
  });
  // v48 · P7 (Sep 24 2026): tick a cool-down row off — tap again to untick.
  // Place-keeping only (her list, her pace); saved to the resume snapshot,
  // never to Supabase.
  document.querySelectorAll<HTMLButtonElement>('[data-stretch-tick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset['stretchTick'];
      if (!key) return;
      if (state.stretchTicks[key] === true) {
        const next = { ...state.stretchTicks };
        delete next[key];
        state.stretchTicks = next;
      } else {
        state.stretchTicks = { ...state.stretchTicks, [key]: true };
      }
      saveActiveSession();
      render();
    });
  });
  // v48 · P5: the 2 kg question's "Noted" — hidden until two NEW easy sessions.
  // If storage is blocked the card simply stays (nothing else depends on it).
  bindClick('twokg-noted', () => {
    const id = document.getElementById('twokg-noted')?.dataset['twokgId'];
    if (!id) return;
    try {
      localStorage.setItem(TWO_KG_NOTED_KEY, id);
    } catch {
      // storage blocked — the question stays up
    }
    render();
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
  ellKm?.addEventListener('input', () => setEllipticalReading(WW_ELLIPTICAL_KM_KEY, ellKm.value));
  const ellPulse = document.getElementById('ell-pulse') as HTMLInputElement | null;
  ellPulse?.addEventListener('input', () =>
    setEllipticalReading(WW_ELLIPTICAL_PULSE_KEY, ellPulse.value)
  );

  // …and back out again to the three-way choice, in case she changes her mind.
  bindClick('ww-outdoor', () => {
    clearApartmentCardio();
    clearElliptical();
    stopTimer();
    render();
  });

  // Lite-day toggle on pre-log (Allison Jul 12 2026): one round less, streak intact.
  bindClick('lite-toggle', () => {
    state.liteDay = !state.liteDay;
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
  // v48: the round-1 floor — go on, or finish here (it still counts).
  bindClick('start-round-2', () => {
    startRoundTwo();
  });
  bindClick('finish-here', () => {
    finishAtRoundOne();
  });

  bindClick('save-log', () => {
    const wallsitEl = document.getElementById('wallsit') as HTMLInputElement | null;
    if (wallsitEl) {
      const raw = parseInt(wallsitEl.value, 10);
      state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    }
    const noteEl = document.getElementById('session-note') as HTMLTextAreaElement | null;
    if (noteEl) state.sessionNote = noteEl.value;
    void logCompleteAndHome();
  });

  // Video expanders (group 3N)
  document.querySelectorAll<HTMLButtonElement>('[data-expand-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset['expandVideo'];
      if (!name) return;
      state.videoExpandedFor = state.videoExpandedFor === name ? null : name;
      render();
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
      render();
    });
  });

  // Voice-note play buttons. Re-sync visual state after a re-render if this
  // note is still playing (the Audio object survives the DOM rebuild).
  document.querySelectorAll<HTMLButtonElement>('.voice-note-btn').forEach((btn) => {
    const src = btn.dataset['voiceSrc'];
    btn.addEventListener('click', () => {
      if (src) toggleVoiceNote(btn, src);
    });
    if (voiceAudio && voiceAudioSrc === src && !voiceAudio.paused) {
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
      render();
    });
  });
  // v48 · P5 (Sep 24 2026): the three range sliders became tap chips (see
  // renderChipRow) — the touched flag is still what makes a number a reading.
}

// Ship 6: settings handlers — toggles persist immediately; steppers clamp and
// re-render label; data buttons drive export/import/clear.
function attachSettingsHandlers(): void {
  // Toggles
  const wireToggle = (
    inputId: string,
    key: string,
    onChange?: (v: boolean) => void,
    defaultVal: boolean = true
  ): void => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    input.addEventListener('change', () => {
      const v = input.checked;
      setSetting<boolean>(key, v);
      const wrap = input.closest('.settings-toggle');
      if (wrap) {
        wrap.classList.toggle('on', v);
        wrap.classList.toggle('off', !v);
      }
      if (onChange) onChange(v);
      // Read back to confirm the value persisted; ignore if default.
      void defaultVal;
    });
  };
  wireToggle('setting-beeps', SETTING_KEYS.beeps);
  wireToggle('setting-howto', SETTING_KEYS.howToFirstExpand);
  // v48 · P4 (Sep 24 2026): the auto-suggest toggle is gone (DECISIONS §5) —
  // the hero is always today's rotation and B/C are one chip away; a switch
  // that turned off the one thing carrying the app, never used.

  // Rest stepper (step = 5s, range 5-180).
  const restVal = document.getElementById('rest-val');
  bindClick('rest-dec', () => {
    const next = Math.max(0, getRestSec() - 5);
    setSetting<number>(SETTING_KEYS.restSec, next);
    if (restVal) restVal.textContent = `${next}s`;
  });
  bindClick('rest-inc', () => {
    const next = Math.min(180, getRestSec() + 5);
    setSetting<number>(SETTING_KEYS.restSec, next);
    if (restVal) restVal.textContent = `${next}s`;
  });

  // Pre-countdown stepper (step = 1s, range 0-10).
  const preVal = document.getElementById('pre-val');
  bindClick('pre-dec', () => {
    const next = Math.max(0, getPreCountSec() - 1);
    setSetting<number>(SETTING_KEYS.preCount, next);
    if (preVal) preVal.textContent = `${next}s`;
  });
  bindClick('pre-inc', () => {
    const next = Math.min(10, getPreCountSec() + 1);
    setSetting<number>(SETTING_KEYS.preCount, next);
    if (preVal) preVal.textContent = `${next}s`;
  });

  // Data: Export
  bindClick('export-sessions', () => {
    exportSessionsToFile();
  });

  // Data: Import (file picker)
  bindClick('import-sessions-btn', () => {
    const input = document.getElementById('import-sessions-input') as HTMLInputElement | null;
    input?.click();
  });
  const importInput = document.getElementById('import-sessions-input') as HTMLInputElement | null;
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) importSessionsFromFile(file);
      importInput.value = ''; // allow re-import of same filename
    });
  }

  // v48 · P6: keep the Data fold's open state across its own re-render.
  const dataFold = document.querySelector<HTMLDetailsElement>('details.settings-data');
  dataFold?.addEventListener('toggle', () => {
    settingsDataOpen = dataFold.open;
  });

  // Data: Clear — hold-to-confirm via the same wireHoldToSkip helper.
  const clearBtn = document.getElementById('clear-local');
  if (clearBtn) {
    wireHoldToSkip(clearBtn, () => {
      clearLocalSessions();
    });
  }
}

function bindClick(id: string, fn: () => void): void {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

document.addEventListener('DOMContentLoaded', () => {
  // Resume an in-progress workout if one was left open (Allison 2026-06-06).
  restoreActiveSession();
  render();
  void pullFromSupabase().then(() => {
    void flushPendingSyncs();
    void fetchStepsToday(); // v48 · P4: once, after the pull
  });
  void flushPendingWalks();
  // v45: a session saved offline (gym basement, airplane mode) now syncs the
  // moment the signal comes back — before, only on the next app open.
  window.addEventListener('online', () => {
    void flushPendingSyncs();
    void flushPendingWalks();
  });
  // Resume an in-progress WALK too (Jul 4): restart GPS + step tracking and
  // the wake lock — accumulated meters/steps live in localStorage, so a
  // mid-walk app close only pauses the sensors, it never loses the walk.
  if (activeWalkStart()) {
    beginWalkTracking();
    updateWalkLiveLine();
  }
});
