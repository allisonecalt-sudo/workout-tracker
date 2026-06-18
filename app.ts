// app.ts — workout-tracker
// Lead-dev pass 2026-05-15 consolidates: code-correctness fixes (timer rewrite,
// audio unlock, sync hygiene), UX restructure (Done·Next primary, Quit demoted,
// hold-to-skip rest, today's pick, week-dots, history-detail), and visual
// layer (still images + YouTube embeds + collapsible how-to).

import { EXERCISE_VISUALS } from './exercise-visuals.js';
import { EXERCISE_HOWTO, type HowToFrame } from './exercise-howto.js';

type WorkoutId = 'A' | 'B' | 'C';

type Exercise = {
  name: string;
  reps?: string;
  notes?: string;
  durationSec?: number;
  isTimed?: boolean;
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
  capacityBefore: number;
  capacityAfter: number;
  wallSitSec: number;
  backPain: number;
  word: string;
  startedAt?: string;
  completedAt?: string;
  durationSec?: number;
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
  word: string;
  currentRound: number;
  currentPhase: Phase;
  currentExerciseIndex: number;
  isResting: boolean;
  timerSeconds: number;
  preCountdown: number;
  syncStatus: SyncStatus;
  startedAt: string | null;
  // Wall-sit timing capture (group 1D): when the user starts a timed wall sit
  // we stash the start timestamp here so we can compute actual held duration
  // even if she taps Done before the timer expires.
  wallSitStartedAt: number | null;
  // history-detail navigation target (group 2J)
  historyDetailId: string | null;
  // expander state for visual layer (group 3N) — per-render; not persisted.
  videoExpandedFor: string | null;
  // collapse state for "How to do it" — collapsed by default after first-seen-this-week.
  howToOpenFor: string | null;
  // Ship 5 progress screen: collapsible exercise-breakdown card. Closed by
  // default — it's reference, not primary.
  exerciseBreakdownOpen: boolean;
};

const STORAGE_KEY = 'workout-tracker:logs';
const HOWTO_SEEN_KEY_PREFIX = 'workout-tracker:howto-seen-week-';
// Resume support (Allison 2026-06-06): "when i leave the page i want it to open
// on the workout im in unless i exit." We snapshot the live position of an
// in-progress session so reopening the app lands back on that workout. Quitting
// or finishing clears it (those go through resetState()).
const ACTIVE_SESSION_KEY = 'workout-tracker:active-session';
// Ship 6: timing defaults — overridable via Settings screen. The constants
// remain as "defaults" only; runtime values come from getSetting().
// Allison 2026-05-15 18:07: "i do not need the brakes anymore there doesn't
// need the brakes in between exercises." Default rest is now 0 (skip).
// Range allows 0-180 in Settings — bump back up if she ever wants it.
const DEFAULT_REST_SEC = 0;
const DEFAULT_PRE_COUNT_SEC = 3;
const COUNT_BEEP_FROM_SEC = 3;
const HOLD_TO_SKIP_MS = 500;
const HOLD_TO_QUIT_MS = 500;
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
  autoSuggest: 'workout-tracker:setting-auto-suggest',
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

function getAutoSuggestEnabled(): boolean {
  return getSetting<boolean>(SETTING_KEYS.autoSuggest, true);
}

const SUPABASE_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

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
  // ISO date (YYYY-MM-DD) of the Saturday this week starts on.
  startsOn: string;
  // Optional short tag — e.g. "Starter", "Consolidation", "Bump week".
  label?: string;
  workouts: Record<WorkoutId, Workout>;
};

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
      'NO weight yet — building toward the 1 kg. Arm hanging, wrist NEUTRAL/straight. Drive the elbow UP, squeeze the shoulder blade toward your spine. Lower slow. Keep the wrist straight throughout; stop on any wrist signal. Add the 1 kg only when you say you are ready.',
  },
  {
    name: '1 kg biceps curl',
    reps: '2 sets · 12 reps',
    notes:
      'Elbow tucked at your side, forearm hanging, wrist NEUTRAL/straight. Curl the forearm up — only the forearm moves, elbow stays pinned. Lower slow. Keep the wrist straight (no bending back). Stop on any wrist signal.',
  },
];

// Week-9 arm work (2026-06-27): rep bump 2×12 → 2×14 after the W7+W8 window.
// SPLIT held from Week 7 (2026-06-18): biceps at 1 kg, prone row still BODYWEIGHT
// (building toward the 1 kg). PROVISIONAL — see Week 9 block comment; reconcile
// against actual logs (the pending load audit) before she reaches this week.
const UPPER_BACK_W9: Exercise[] = [
  ...UPPER_BACK,
  {
    name: 'Prone row (bodyweight)',
    reps: '2 sets · 14 reps each side',
    notes:
      'NO weight yet — building toward the 1 kg. Arm hanging, wrist NEUTRAL/straight. Drive the elbow UP, squeeze the shoulder blade toward your spine. Lower slow. Keep the wrist straight throughout; stop on any wrist signal. Add the 1 kg only when you say you are ready.',
  },
  {
    name: '1 kg biceps curl',
    reps: '2 sets · 14 reps',
    notes:
      'Elbow tucked at your side, forearm hanging, wrist NEUTRAL/straight. Curl the forearm up — only the forearm moves, elbow stays pinned. Lower slow. Keep the wrist straight (no bending back). Stop on any wrist signal.',
  },
];

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
  // Week 8 — Jun 20-26. DECISION 2026-06-07 (C bump added 2026-06-18): two small
  // bumps from W7, both on moves past their 2-week window. C glute bridges held
  // at 18 (bumped 16→18 in W7 on 06-18 — her "tiny bump" call for the walk day).
  // Original Week-8 notes: two small bumps, both on moves that
  // completed their 2-week stabilization window. Everything else HOLDS at Week-7
  // numbers (1 kg arms stay 2×12 — they're brand new in W7, no double-bump).
  //  - A + B: hip-hinge 2×10 → 2×12 (HIP_HINGE_W8). Done its W6+W7 window; same
  //    cues, still bodyweight only.
  //  - A: wall sit 33s → 35s (reps text + durationSec updated).
  //  - C unchanged. One change per axis; nothing stacked on the same new move.
  {
    weekNum: 8,
    startsOn: '2026-06-20',
    label: 'Hip-hinge 12 · wall sit 35s',
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
          HIP_HINGE_W8,
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
  // Week 9 — Jun 27 - Jul 3. PROVISIONAL — THESE NUMBERS ARE TENTATIVE.
  // ⚠️ Reconcile against Allison's ACTUAL logged sessions (the pending "load
  // audit") BEFORE she reaches this week. Two changes proposed off Week 8:
  //  - A: bodyweight squats 12 → 14 reps (same 3-1-3 tempo + cues). Squats have
  //    been HELD at 12 since Week 3 — likely overdue, hence flagged for the audit.
  //  - A + B: bodyweight prone row + 1 kg biceps curl 2×12 → 2×14 (UPPER_BACK_W9).
  //    They completed their W7+W8 window.
  // Everything else HOLDS at Week-8 numbers (hip-hinge 2×12, wall sit 35s, glute
  // bridges 12/16, forearm plank 1×15s, etc.). The audit may move these; do not
  // treat as locked.
  {
    weekNum: 9,
    startsOn: '2026-06-27',
    label: 'Squats 14 · 1 kg 14 — PROVISIONAL',
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
            notes: 'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          HIP_HINGE_W8,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '36 sec hold',
            notes:
              'Hands rest on thighs or hang. No pushing on wall. Held at 36s from Week 8 (PROVISIONAL — reconcile in the load audit).',
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
        upperBack: UPPER_BACK_W9,
        cooldown: STRETCH_COOLDOWN,
      },
      B: {
        id: 'B',
        name: 'Glutes + Mobility + Core',
        description: '🚶 10-min walk + glutes & mobility · ~42 min',
        rounds: 3,
        warmup: WALK_WARMUP_AB,
        main: [
          HIP_HINGE_W8,
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
        upperBack: UPPER_BACK_W9,
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
];

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
  const currentIdx = PROGRAM.findIndex((wp) => wp.weekNum === current.weekNum);
  return PROGRAM.slice(currentIdx + 1);
}

// Encoded weeks BEFORE the current one, oldest → newest. Powers the collapsed
// "Past weeks" surface on home so previous programming stays browsable (the
// archive-not-delete principle) without expanding heavy blocks by default.
function getPastWeekPlans(date: Date = new Date()): WeekPlan[] {
  const current = getWeekPlan(date);
  const currentIdx = PROGRAM.findIndex((wp) => wp.weekNum === current.weekNum);
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
      "Conversational pace — you should be able to talk in full sentences without getting breathless. 20 minutes minimum. Walking is genuinely your most underrated exercise: it preserves joint health, supports digestion (especially good with Crohn's), aids GLP-1 medication's effect, and clears mental fog. Take it outdoors when possible — the visual variety and sunlight matter. Tap done when you finish.",
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
};

const state: AppState = {
  screen: 'home',
  selectedWorkout: null,
  capacityBefore: 5,
  capacityAfter: 5,
  wallSitSec: 0,
  backPain: 0,
  word: '',
  currentRound: 1,
  currentPhase: 'warmup',
  currentExerciseIndex: 0,
  isResting: false,
  timerSeconds: 0,
  preCountdown: 0,
  syncStatus: 'syncing',
  startedAt: null,
  wallSitStartedAt: null,
  historyDetailId: null,
  videoExpandedFor: null,
  howToOpenFor: null,
  exerciseBreakdownOpen: false,
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

function stopTimer(): void {
  if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafHandle);
  }
  rafHandle = null;
  activeTimer = null;
  state.timerSeconds = 0;
  state.preCountdown = 0;
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
  render();
  timerLoop();
}

function timerLoop(): void {
  if (!activeTimer) return;
  const remainMs = activeTimer.endsAt - Date.now();
  const remainSec = Math.max(0, Math.ceil(remainMs / 1000));

  if (remainSec !== activeTimer.lastSecRendered) {
    activeTimer.lastSecRendered = remainSec;
    if (activeTimer.kind === 'pre-countdown') {
      state.preCountdown = remainSec;
    } else {
      state.timerSeconds = remainSec;
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

// Recompute on tab visibility — if the user backgrounded the app the rAF
// loop pauses and the timer would freeze. On return we fast-forward.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeTimer) {
      timerLoop();
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
    return parsed as LogEntry[];
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.slice(0, 50)));
}

function saveLog(entry: LogEntry): LogEntry {
  const stored: LogEntry = { ...entry, id: entry.id ?? genId(), synced: false };
  const logs = loadLogs();
  logs.unshift(stored);
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

// Group 1F: wrist columns dropped from POST payload — Lisa Cohen cleared the
// wrist May 10. App was silently writing 0s for two columns the user no
// longer fills. Schema still has the columns (no Supabase change) so existing
// rows survive; new inserts just omit them and let the DB use NULL/default.
async function pushLogToSupabase(entry: LogEntry): Promise<boolean> {
  if (syncDisabled()) return false;
  if (!entry.id) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_sessions`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify([
        {
          id: entry.id,
          date: entry.date,
          workout_type: entry.workout,
          capacity_before_1_10: entry.capacityBefore,
          capacity_after_1_10: entry.capacityAfter,
          wall_sit_seconds: entry.wallSitSec,
          pain_back_0_10: entry.backPain,
          one_word: entry.word || null,
          started_at: entry.startedAt ?? null,
          completed_at: entry.completedAt ?? null,
          duration_seconds: entry.durationSec ?? null,
        },
      ]),
    });
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

// ---------- state machine ----------

function getCurrentWorkout(): Workout | null {
  return state.selectedWorkout ? getWorkoutById(state.selectedWorkout) : null;
}

function getCurrentExercise(): Exercise | null {
  const w = getCurrentWorkout();
  if (!w) return null;
  const list = w[state.currentPhase] ?? [];
  return list[state.currentExerciseIndex] ?? null;
}

function startWorkout(id: WorkoutId): void {
  state.selectedWorkout = id;
  state.screen = 'pre-log';
  render();
}

function beginExercises(): void {
  state.screen = 'workout';
  state.currentRound = 1;
  state.currentPhase = 'warmup';
  state.currentExerciseIndex = 0;
  state.isResting = false;
  state.startedAt = new Date().toISOString();
  state.howToOpenFor = null;
  state.videoExpandedFor = null;
  render();
}

function advanceExercise(): void {
  const w = getCurrentWorkout();
  if (!w) return;

  // Group 1D: if we're leaving a timed wall-sit and the user tapped Done
  // before the timer ran out, capture actual held duration.
  captureWallSitIfPending();

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
    if (state.currentRound < w.rounds) {
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
  if (exerciseName === 'Wall sit') {
    state.wallSitStartedAt = Date.now();
  }
  startPreCountdown(() => {
    startTimerCore('timed-exercise', duration, () => {
      if (exerciseName === 'Wall sit') {
        captureWallSitIfPending();
      }
      render();
    });
  });
}

function logCompleteAndHome(): void {
  if (!state.selectedWorkout) return;
  const completedAt = new Date().toISOString();
  const startedAt = state.startedAt ?? completedAt;
  const durationSec = Math.max(
    0,
    Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
  const stored = saveLog({
    date: completedAt,
    workout: state.selectedWorkout,
    capacityBefore: state.capacityBefore,
    capacityAfter: state.capacityAfter,
    wallSitSec: state.wallSitSec,
    backPain: state.backPain,
    word: state.word,
    startedAt,
    completedAt,
    durationSec,
  });
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
  word: string;
  currentRound: number;
  currentPhase: Phase;
  currentExerciseIndex: number;
  startedAt: string | null;
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
      word: state.word,
      currentRound: state.currentRound,
      currentPhase: state.currentPhase,
      currentExerciseIndex: state.currentExerciseIndex,
      startedAt: state.startedAt,
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

// Rehydrate an in-progress session on load. Validates the snapshot against the
// live program (a workout she was mid-way through must still exist, and the
// phase/index must be in range) — a stale or corrupt snapshot is discarded, not
// crashed on. Transient bits (timers, expanders) reset; she lands on the
// exercise she left, not mid-countdown.
function restoreActiveSession(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw) as Partial<ActiveSessionSnapshot>;
    if (!snap || typeof snap !== 'object') return false;
    if (!snap.selectedWorkout || !RESUMABLE_SCREENS.includes(snap.screen as AppScreen)) {
      clearActiveSession();
      return false;
    }
    const w = getWorkoutById(snap.selectedWorkout);
    if (!w) {
      clearActiveSession();
      return false;
    }
    const phase = (snap.currentPhase ?? 'warmup') as Phase;
    const phaseList = w[phase] ?? [];
    const idx = snap.currentExerciseIndex ?? 0;
    // cooldown is a single list (index always 0); other phases need an in-range index.
    const idxOk = phase === 'cooldown' || (idx >= 0 && idx < phaseList.length);
    if (!idxOk) {
      clearActiveSession();
      return false;
    }

    state.screen = snap.screen as AppScreen;
    state.selectedWorkout = snap.selectedWorkout;
    state.currentPhase = phase;
    state.currentExerciseIndex = phase === 'cooldown' ? 0 : idx;
    state.currentRound = snap.currentRound ?? 1;
    state.capacityBefore = snap.capacityBefore ?? 5;
    state.capacityAfter = snap.capacityAfter ?? 5;
    state.wallSitSec = snap.wallSitSec ?? 0;
    state.backPain = snap.backPain ?? 0;
    state.word = snap.word ?? '';
    state.startedAt = snap.startedAt ?? new Date().toISOString();
    // Transient — never restore a running timer or open expander.
    state.isResting = false;
    state.timerSeconds = 0;
    state.preCountdown = 0;
    state.wallSitStartedAt = null;
    state.videoExpandedFor = null;
    state.howToOpenFor = null;
    return true;
  } catch {
    clearActiveSession();
    return false;
  }
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
  state.word = '';
  state.currentRound = 1;
  state.currentPhase = 'warmup';
  state.currentExerciseIndex = 0;
  state.isResting = false;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  state.startedAt = null;
  state.wallSitStartedAt = null;
  state.videoExpandedFor = null;
  state.howToOpenFor = null;
  state.historyDetailId = null;
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
};

async function pullFromSupabase(): Promise<void> {
  if (syncDisabled()) return;
  try {
    const sRes = await fetch(
      `${SUPABASE_URL}/rest/v1/workout_sessions?select=*&order=date.desc&limit=50`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      }
    );
    if (sRes.ok) {
      const remote: RemoteSession[] = await sRes.json();
      const local = loadLogs();
      // Group 1E: id-keyed merge. Remote-synced rows replace local-synced
      // rows with same id; local-unsynced never lose their write. Tombstone
      // handling deferred (audit §11 Session C).
      const byId = new Map<string, LogEntry>();
      for (const l of local) {
        if (l.id) byId.set(l.id, l);
      }
      for (const r of remote) {
        const existing = byId.get(r.id);
        if (existing && !existing.synced) continue; // local-unsynced wins
        byId.set(r.id, {
          id: r.id,
          date: r.date,
          workout: r.workout_type,
          capacityBefore: r.capacity_before_1_10 ?? 0,
          capacityAfter: r.capacity_after_1_10 ?? 0,
          wallSitSec: r.wall_sit_seconds ?? 0,
          backPain: r.pain_back_0_10 ?? 0,
          word: r.one_word ?? '',
          startedAt: r.started_at ?? undefined,
          completedAt: r.completed_at ?? undefined,
          durationSec: r.duration_seconds ?? undefined,
          synced: true,
        });
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
      writeLogs(merged);
    } else {
      console.warn('[sync] pull sessions failed:', sRes.status);
    }
    if (state.screen === 'home') render();
  } catch (err) {
    console.warn('[sync] pull threw:', err);
  }
}

async function flushPendingSyncs(): Promise<void> {
  if (syncDisabled()) return;
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
  if (loadLogs().length === 0) return '';
  return 'synced ✓';
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

const PROGRAM_START_DATE = '2026-05-02';

function getProgramWeek(date: Date = new Date()): { num: number; start: Date; end: Date } {
  const start = new Date(PROGRAM_START_DATE + 'T00:00:00');
  const diffDays = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const num = Math.max(1, Math.floor(diffDays / 7) + 1);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (num - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { num, start: weekStart, end: weekEnd };
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
  const logs = loadLogs();
  const saturday = saturdayForOffset(offset);
  const startMs = saturday.getTime();
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;
  return logs.filter((l) => {
    const t = new Date(l.date).getTime();
    return t >= startMs && t <= endMs;
  }).length;
}

// Program week info anchored on the Saturday of the viewed Sat-Fri week.
function getViewedProgramWeek(offset = 0): { num: number; start: Date; end: Date } {
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

function renderExerciseVisual(exerciseName: string): string {
  const v = EXERCISE_VISUALS[exerciseName];
  const still = getPrimaryStill(exerciseName);
  const youtubeId = v?.youtubeId;

  // Nothing to show at all.
  if (!still && !youtubeId) return '';

  const isExpanded = state.videoExpandedFor === exerciseName;
  const safeAlt = escapeHtml(`${exerciseName} — exercise demonstration`);
  const attribution = v?.attribution ? escapeHtml(v.attribution) : '';

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

  // Still picture (trusted inline SVG, or a curated/illustration JPG). Shown as
  // the primary visual; the video sits behind a "Watch full video" expander.
  if (still) {
    const stillHtml =
      'svg' in still
        ? `<div class="exercise-visual-still exercise-visual-still-svg">${still.svg}</div>`
        : `<img class="exercise-visual-still" src="${escapeHtml(still.image)}" alt="${safeAlt}" loading="lazy" />`;

    const videoBlock = youtubeId
      ? `
      <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
        ${isExpanded ? '× Hide video' : '▶ Watch full video'}
      </button>
      ${isExpanded ? videoIframe : ''}`
      : '';

    return `
      <div class="exercise-visual">
        ${stillHtml}
        ${videoBlock}
        ${attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
  }

  // No still anywhere — video poster is primary (autoplay-off is intentional;
  // YouTube embeds can't autoplay on mobile without a user gesture and we don't
  // want unrequested data downloads).
  return `
    <div class="exercise-visual exercise-visual-video-only">
      ${
        isExpanded
          ? videoIframe
          : `<button class="visual-video-poster" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="false">
              <span class="visual-video-poster-icon">▶</span>
              <span class="visual-video-poster-label">Watch how it looks</span>
            </button>`
      }
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

function renderHowToCard(exerciseName: string): string {
  // Prefer multi-frame visual how-to. Fall back to legacy EXERCISE_GUIDE text
  // if the exercise hasn't been mapped to EXERCISE_HOWTO yet (archive-not-
  // delete principle: EXERCISE_GUIDE stays in source as a permanent fallback).
  const howto = EXERCISE_HOWTO[exerciseName];
  const guide = EXERCISE_GUIDE[exerciseName];
  if (!howto && !guide) return '';

  // First-time-this-week → open by default. After that, collapsed.
  const week = getProgramWeek();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${week.num}`;
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
  const autoExpand = getHowToFirstExpand();
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

function markHowToSeenThisWeek(exerciseName: string): void {
  const week = getProgramWeek();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${week.num}`;
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
// --accent dot.
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
      <circle cx="${lx?.toFixed(1)}" cy="${ly?.toFixed(1)}" r="2" fill="var(--accent)" />
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
  while (cursor.getTime() >= programStart.getTime() - 6 * 24 * 60 * 60 * 1000) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Find sessions in this week (chronological — oldest first)
    const weekLogs = logs
      .filter((l) => {
        const t = new Date(l.date).getTime();
        return t >= weekStart.getTime() && t < weekEnd.getTime();
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3); // cap at 3 for the 3-slot view

    rows.push({
      saturday: new Date(weekStart),
      weekNum: getProgramWeek(weekStart).num,
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
function renderWeeklyTargetGrid(): string {
  const logs = loadLogs();
  const rows = buildWeeklyTargetRows(logs);
  const currentWeekCount = getWeekCount(0);

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
            const tooltip = `${formatDate(log.date)} · Workout ${w} · capacity ${log.capacityBefore}→${log.capacityAfter}`;
            return `<button class="${cls}" type="button" ${id} aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">${w}</button>`;
          }
          return `<div class="weekly-slot weekly-slot-empty" aria-label="open slot"></div>`;
        })
        .join('');
      const cls = r.isCurrentWeek ? 'weekly-row weekly-row-current' : 'weekly-row';
      const label = r.isCurrentWeek ? 'This week' : `Wk ${r.weekNum} · ${rangeLabel}`;
      return `
        <div class="${cls}">
          <div class="weekly-row-label">${label}</div>
          <div class="weekly-slots">${slots}</div>
        </div>`;
    })
    .join('');

  return `
    <div class="card weekly-target-card">
      <div class="weekly-target-header">
        <h3 class="weekly-target-title">
          Consistency · <span class="weekly-target-sub">3 per week</span>
        </h3>
        <div class="weekly-target-stat">
          <span class="weekly-target-count">${currentWeekCount} of 3</span>
          <span class="weekly-target-stat-label">this week</span>
        </div>
      </div>
      <div class="weekly-target-rows">${rowsHtml}</div>
    </div>
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

      const summaryLabel = idx === 0 ? 'Coming next week' : `Then Week ${wp.weekNum}`;
      const caption = `Diff vs Week ${prev.weekNum}${wp.label ? ` · ${wp.label}` : ''}.`;

      return `
        <details class="next-week-preview" ${idx === 0 ? '' : ''}>
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${summaryLabel}</span>
            <span class="next-week-summary-meta">Week ${wp.weekNum} · starts Sat ${startLabel}</span>
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
      const wpIdx = PROGRAM.findIndex((p) => p.weekNum === wp.weekNum);
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
        ? `Diff vs Week ${prev.weekNum}${wp.label ? ` · ${wp.label}` : ''}.`
        : `${wp.label ? `${wp.label}. ` : ''}The starting week.`;

      return `
        <details class="next-week-preview">
          <summary class="next-week-summary">
            <span class="next-week-summary-label">Week ${wp.weekNum}</span>
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

// Gear & recovery card. Equipment is ownership-gated: a move only appears in a
// workout once Allison says she owns the kit. Until then it lives here as a
// "worth getting" item with what it unlocks. Also holds Lisa's neck-release.
function renderGearCard(): string {
  return `
    <details class="card gear-card">
      <summary class="gear-summary">🎒 Gear &amp; recovery</summary>
      <div class="gear-body">
        <div class="gear-section">
          <div class="gear-label">You have — in the workout now</div>
          <ul class="gear-list">
            <li>✅ 1 kg weight — IN the workout now for the <strong>biceps curl</strong> (2×12, wrist neutral). The <strong>prone row stays bodyweight</strong> for now, building up to the 1 kg — add the load there only when you say you are ready.</li>
          </ul>
        </div>
        <div class="gear-section">
          <div class="gear-label">Worth getting — unlocks more (not in your workout yet)</div>
          <ul class="gear-list">
            <li>⬜ A 2nd 1 kg (a pair) — lets you do both sides at once, and load the bodyweight hip-hinge later</li>
            <li>⬜ Resistance band — unlocks band pull-aparts + band pull-throughs (neutral-wrist hip-hinge progression)</li>
            <li>⬜ 2 tennis balls in a sock (“the peanut”) — for the neck release below</li>
          </ul>
          <p class="gear-note">Tell Claude when you’ve got one and the moves it unlocks get added. Nothing shows up in your workout until you own it.</p>
        </div>
        <div class="gear-section">
          <div class="gear-label">Neck release — Lisa · ~10 min, anytime (not part of the workout)</div>
          <p class="gear-note">Two tennis balls in a sock at the base of your skull — where the skull meets the neck, one ball either side of your spine. Lie back, let your head’s weight rest on them, breathe slow (3 deep breaths), and relax ~10 min. Releases the neck/shoulder tension Lisa flagged. Do it separately from your session.</p>
        </div>
      </div>
    </details>
  `;
}

function renderHome(): string {
  const logs = loadLogs();
  const week = getProgramWeek();
  const weekRange = formatWeekRange(week.start, week.end);
  // Progress card + dot strip follow viewedWeekOffset so the user can step
  // back through past weeks. Default offset 0 = current Sat-Fri week.
  const viewedWeek = getViewedProgramWeek(viewedWeekOffset);
  const viewedWeekRange = formatWeekRange(viewedWeek.start, viewedWeek.end);
  const viewedWeekCount = getWeekCount(viewedWeekOffset);
  // Ship 6: respect "Auto-suggest today's workout" setting. When off, no card
  // is marked as the pick — all three render with the quieter treatment.
  const todaysPick: WorkoutId | null = getAutoSuggestEnabled() ? getTodaysPick() : null;
  const lastLog = logs[0];
  const weekDots = getWeekDots(viewedWeekOffset);
  const canGoBack = logs.some((l) => {
    const t = new Date(l.date).getTime();
    return t < saturdayForOffset(viewedWeekOffset).getTime();
  });
  const isCurrentWeek = viewedWeekOffset === 0;

  const dotsHtml = weekDots
    .map((d) => {
      const cls = d.workout ? `dot dot-${d.workout}` : 'dot dot-empty';
      const clickAttr = d.logId ? `data-detail="${escapeHtml(d.logId)}"` : '';
      return `
        <button class="week-dot ${cls}" ${clickAttr} type="button" aria-label="${d.letter} ${formatDate(d.date.toISOString())}${d.workout ? ` workout ${d.workout}` : ' no workout'}">
          <span class="week-dot-label">${d.letter}</span>
          <span class="week-dot-bubble">${d.workout ?? ''}</span>
        </button>
      `;
    })
    .join('');

  const recentHtml = logs
    .slice(0, 5)
    .map((l) => {
      const idAttr = l.id ? `data-detail="${escapeHtml(l.id)}"` : '';
      const duration = l.durationSec ? formatDuration(l.durationSec) : '—';
      const trend = l.wallSitSec > 0 ? getWallSitTrend(logs, l.id ?? null) : [];
      const spark = renderSparkline(trend);
      return `
      <button class="history-row history-row-btn" ${idAttr} type="button">
        <span class="history-workout-badge">${l.workout}</span>
        <div>
          <div class="history-date">${formatDate(l.date)} · ${duration}${spark ? ` <span class="history-sparkline-wrap" aria-hidden="false">${spark}</span>` : ''}</div>
          ${l.word ? `<div class="history-word">"${escapeHtml(l.word)}"</div>` : ''}
        </div>
        <div class="history-meta">›</div>
      </button>
    `;
    })
    .join('');

  const lastLine = lastLog
    ? `Last: ${lastLog.workout} · ${formatDate(lastLog.date)} · capacity ${lastLog.capacityBefore}→${lastLog.capacityAfter}`
    : 'No sessions yet — pick A to start.';

  return `
    <div class="home-header">
      <h1>Workout Tracker</h1>
      <button class="settings-icon-btn" id="open-settings" type="button" aria-label="Open settings" title="Settings">
        <span class="settings-icon-glyph" aria-hidden="true">⚙</span>
      </button>
    </div>
    <p class="subtitle">Three rotating sessions. Show up 3x/week.</p>
    <div class="week-banner">Week ${week.num} · ${weekRange}</div>
    <div id="sync-indicator" class="sync-indicator sync-${state.syncStatus}">${syncIndicatorText()}</div>

    <div class="card">
      <div class="week-nav">
        <button class="week-nav-btn" id="prev-week" type="button" ${canGoBack ? '' : 'disabled'} aria-label="Previous week">‹</button>
        <button class="week-nav-label week-nav-label-btn" id="open-weekly-review" type="button" aria-label="Open weekly review for ${isCurrentWeek ? 'this week' : `week ${viewedWeek.num}`}">
          <div class="week-nav-title">${isCurrentWeek ? 'This week' : `Week ${viewedWeek.num}`}</div>
          <div class="week-nav-range">${viewedWeekRange}</div>
        </button>
        <button class="week-nav-btn" id="next-week" type="button" ${isCurrentWeek ? 'disabled' : ''} aria-label="${isCurrentWeek ? 'Already at current week' : 'Next week'}">›</button>
      </div>
      <div class="streak-stat">
        <div class="stat-block">
          <div class="stat-number">${viewedWeekCount}</div>
          <div class="stat-label">${isCurrentWeek ? 'of 3 this week' : 'sessions that week'}</div>
        </div>
        <div class="stat-block">
          <div class="stat-number">${logs.length}</div>
          <div class="stat-label">total sessions</div>
        </div>
      </div>
      <div class="week-dots">${dotsHtml}</div>
    </div>

    ${renderWeeklyTargetGrid()}

    <button class="weekly-review-link" id="open-weekly-review-link" type="button">
      <span>📊 Weekly review</span>
      <span class="weekly-review-link-chev">→</span>
    </button>

    <button class="weekly-review-link progress-link" id="open-progress-link" type="button">
      <span>📈 Progress</span>
      <span class="weekly-review-link-chev">→</span>
    </button>

    <h3>Pick today's workout</h3>
    <div class="workout-picker">
      ${(['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const w = getWorkoutById(id);
          const isPick = id === todaysPick;
          return `
        <button class="workout-card ${isPick ? 'workout-card-pick' : ''}" data-workout="${id}">
          <span class="workout-card-monogram" aria-hidden="true">${w.id}</span>
          ${isPick ? '<span class="workout-card-pick-badge">Today\'s pick</span>' : ''}
          <div class="workout-card-header">
            <span class="workout-card-title">${w.id} · ${w.name}</span>
            <span class="workout-card-badge">${w.rounds === 1 ? 'easy' : `${w.rounds} rounds`}</span>
          </div>
          <div class="workout-card-desc">${w.description}</div>
        </button>
      `;
        })
        .join('')}
    </div>
    <div class="last-line">${lastLine}</div>

    ${renderGearCard()}

    ${renderComingNextWeek()}

    ${renderPastWeeks()}

    ${
      logs.length > 0
        ? `
      <div class="divider"></div>
      <div class="history-header-row">
        <h3>Recent workouts</h3>
        <button class="btn-chip" id="view-history" type="button">📊 All workouts</button>
      </div>
      ${recentHtml}
    `
        : ''
    }
  `;
}

function renderPreLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // 2026-05-15 18:07 — overview block. Allison wants to see the structure at
  // a glance before starting so she knows what's coming.
  const overview = renderWorkoutOverview(w);
  return `
    <div class="screen-header">
      <h2>Workout ${w.id} · ${w.name}</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    <p class="subtitle">Before we start — how do you feel?</p>

    ${overview}

    <div class="card">
      <label class="field">
        <span class="label-text">Capacity right now (1-10)</span>
        <div class="range-row">
          <input type="range" id="cap-before" min="1" max="10" value="${state.capacityBefore}" />
          <span class="range-value" id="cap-before-val">${state.capacityBefore}</span>
        </div>
        <div class="range-anchors">
          <span>1 — depleted</span>
          <span>5 — baseline</span>
          <span>10 — strong</span>
        </div>
      </label>
    </div>

    <div class="warning-banner">
      ⚠️ <strong>Wrist: cleared by Lisa Cohen (May 10).</strong> Stop if anything pings. Back pain at 3/10 → stop that exercise.
    </div>

    <button class="btn-large btn-primary" id="begin" type="button">Start</button>
  `;
}

// Workout overview — three-phase summary shown on pre-log so she sees the
// structure before starting. Tap a row to expand and see the exercises.
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
      const names = p.items.map((e) => e.name).join(' · ');
      return `
        <details class="overview-phase">
          <summary class="overview-phase-summary">
            <span class="overview-phase-emoji">${p.emoji}</span>
            <span class="overview-phase-label">${p.label}</span>
            <span class="overview-phase-count">${count}</span>
          </summary>
          <div class="overview-phase-items">${escapeHtml(names)}</div>
        </details>`;
    })
    .join('');
  // Week badge in the heading so Allison sees WHICH week of programming this
  // workout is from. PROGRAM has weeks 1..N — `getWeekPlan()` resolves the
  // current one from today's date.
  const wp = getWeekPlan();
  const weekBadge = `<span class="overview-week-badge">Week ${wp.weekNum}</span>`;
  return `
    <div class="card overview-card">
      <h3 class="overview-title">What's in this workout ${weekBadge}</h3>
      <div class="overview-phases">${rows}</div>
    </div>
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
function renderRestScreen(workoutId: WorkoutId, phaseLabel: string): string {
  // Ship 6: read user-configured rest length (default 60).
  const total = getRestSec();
  const remaining = state.timerSeconds;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  // SVG ring (radius 90, circumference ~565)
  const r = 90;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - pct);
  return `
    <div class="screen-header">
      <h2>Workout ${workoutId}</h2>
      <button class="quit-link" id="quit" type="button">× Quit workout</button>
    </div>
    <span class="round-indicator">${phaseLabel}</span>
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
      <button class="btn-ghost hold-to-skip" id="skip-rest" type="button" data-hold-ms="${HOLD_TO_SKIP_MS}">
        <span class="hold-fill"></span>
        <span class="hold-label">Hold to skip rest</span>
      </button>
    </div>
  `;
}

// Cool-down = stretches. Allison's call (2026-06-06): show the whole block as
// ONE scrollable list — name + cue per row — instead of stepping through each
// stretch as its own screen. No per-stretch video, no per-stretch timer; the
// reps text already carries the hold time and the notes carry the cue. Real
// (non-stretch) exercises keep their stepped screens + videos.
function renderCooldownList(w: Workout): string {
  const stretches = w.cooldown ?? [];
  const rows = stretches
    .map(
      (s) => `
      <li class="stretch-row">
        <div class="stretch-row-head">
          <span class="stretch-name">${escapeHtml(s.name)}</span>
          ${s.reps ? `<span class="stretch-reps">${escapeHtml(s.reps)}</span>` : ''}
        </div>
        ${s.notes ? `<p class="stretch-cue">${escapeHtml(s.notes)}</p>` : ''}
      </li>`
    )
    .join('');

  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <button class="quit-link" id="quit" type="button">× Quit workout</button>
    </div>
    <span class="round-indicator">Stretch · ${stretches.length} stretches</span>
    <p class="subtitle">Work down the list at your own pace. No timer — hold each as long as feels right.</p>

    <div class="card">
      <ul class="stretch-list">${rows}</ul>
    </div>

    <button class="btn-large btn-primary" id="next" type="button">Done · Finish</button>
  `;
}

function renderWorkout(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  const ex = getCurrentExercise();
  const phaseList = w[state.currentPhase] ?? [];
  const total = phaseList.length;
  const phaseLabel =
    state.currentPhase === 'main'
      ? `Main · Round ${state.currentRound}/${w.rounds}`
      : state.currentPhase === 'warmup'
        ? 'Warm-up'
        : state.currentPhase === 'upperBack'
          ? 'Upper back'
          : 'Cool-down';

  if (state.isResting) {
    return renderRestScreen(w.id, phaseLabel);
  }

  // Cool-down stretches render as a single scrollable list, not stepped cards.
  if (state.currentPhase === 'cooldown') {
    return renderCooldownList(w);
  }

  if (!ex) {
    return `<div class="empty">Done!</div>`;
  }

  const showTempo = ex.reps?.includes('3-1-3') ?? false;

  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <button class="quit-link" id="quit" type="button">× Quit workout</button>
    </div>
    <span class="round-indicator">${phaseLabel}</span>
    <div class="progress-text">Exercise ${state.currentExerciseIndex + 1} of ${total}</div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${((state.currentExerciseIndex + 1) / total) * 100}%"></div>
    </div>

    <div class="card">
      <div class="exercise-display">
        <div class="exercise-phase">${phaseLabel}</div>
        <div class="exercise-name">${ex.name}</div>
        <div class="exercise-reps">${ex.reps ?? ''}</div>
        ${ex.notes ? `<p class="exercise-notes">${ex.notes}</p>` : ''}
      </div>
    </div>

    ${renderExerciseVisual(ex.name)}

    ${
      ex.isTimed
        ? `
      <div class="card timer-card">
        ${
          state.preCountdown > 0
            ? `
          <div class="timer-label">Get ready</div>
          <div class="timer-display countdown-big">${state.preCountdown}</div>
        `
            : `
          <div class="timer-label">${state.timerSeconds > 0 ? 'Hold' : 'Ready'}</div>
          <div class="timer-display">${state.timerSeconds || ex.durationSec || 0}</div>
          <button class="btn-large btn-primary" id="start-timed" type="button" ${state.timerSeconds > 0 ? 'disabled' : ''}>${state.timerSeconds > 0 ? 'Running…' : 'Start timer'}</button>
        `
        }
        ${showTempo ? renderTempoBar() : ''}
      </div>
    `
        : showTempo
          ? `<div class="card">${renderTempoBar()}</div>`
          : ''
    }

    ${renderHowToCard(ex.name)}

    <button class="btn-large btn-primary" id="next" type="button">Done · Next</button>
  `;
}

function renderPostLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  const wallSitDisplay =
    state.wallSitSec > 0
      ? `Wall sit: <strong>${state.wallSitSec}s</strong> (tap to adjust)`
      : 'Wall sit time held (seconds)';
  return `
    <h2>Nice. Workout ${w.id} done.</h2>
    <p class="subtitle">Quick log — takes 30 seconds.</p>

    <div class="card">
      <label class="field">
        <span class="label-text">Capacity now (1-10)</span>
        <div class="range-row">
          <input type="range" id="cap-after" min="1" max="10" value="${state.capacityAfter}" />
          <span class="range-value" id="cap-after-val">${state.capacityAfter}</span>
        </div>
        <div class="range-anchors">
          <span>1 — depleted</span>
          <span>5 — baseline</span>
          <span>10 — strong</span>
        </div>
      </label>

      <label class="field">
        <span class="label-text">${wallSitDisplay}</span>
        <input type="number" id="wallsit" min="0" max="600" value="${state.wallSitSec}" />
      </label>

      <label class="field">
        <span class="label-text">Back pain (0-10)</span>
        <div class="range-row">
          <input type="range" id="back" min="0" max="10" value="${state.backPain}" />
          <span class="range-value" id="back-val">${state.backPain}</span>
        </div>
      </label>

      <label class="field">
        <span class="label-text">One word for how it felt</span>
        <input type="text" id="word" placeholder="proud, tired, looser…" maxlength="40" value="${escapeHtml(state.word)}" />
      </label>
    </div>

    <button class="btn-large btn-primary" id="save-log" type="button">Save & finish</button>
  `;
}

function renderHistory(): string {
  const logs = loadLogs();
  if (logs.length === 0) {
    return `
      <h2>History</h2>
      <p class="empty">No sessions yet. Do a workout!</p>
      <button class="btn-large" id="back-home" type="button">Back</button>
    `;
  }
  const rowsHtml = logs
    .map((l) => {
      const idAttr = l.id ? `data-detail="${escapeHtml(l.id)}"` : '';
      const trend = l.wallSitSec > 0 ? getWallSitTrend(logs, l.id ?? null) : [];
      const spark = renderSparkline(trend);
      return `
    <button class="history-row history-row-btn" ${idAttr} type="button">
      <span class="history-workout-badge">${l.workout}</span>
      <div>
        <div class="history-date">${formatDate(l.date)}${l.durationSec ? ` · ${formatDuration(l.durationSec)}` : ''}${spark ? ` <span class="history-sparkline-wrap" aria-hidden="false">${spark}</span>` : ''}</div>
        <div class="history-meta">cap ${l.capacityBefore}→${l.capacityAfter} · wall ${l.wallSitSec}s · back ${l.backPain}</div>
        ${l.word ? `<div class="history-word">"${escapeHtml(l.word)}"</div>` : ''}
      </div>
      <div class="history-meta">›</div>
    </button>
  `;
    })
    .join('');
  return `
    <h2>History</h2>
    <div class="card">${rowsHtml}</div>
    <button class="btn-large" id="back-home" type="button">Back</button>
  `;
}

function renderHistoryDetail(): string {
  const logs = loadLogs();
  const log = logs.find((l) => l.id === state.historyDetailId);
  if (!log) {
    return `
      <h2>Not found</h2>
      <p class="empty">That session isn't here anymore.</p>
      <button class="btn-large" id="back-history" type="button">Back to history</button>
    `;
  }
  const startedAt = log.startedAt ? formatTime(log.startedAt) : '—';
  const completedAt = log.completedAt ? formatTime(log.completedAt) : '—';
  const duration = log.durationSec ? formatDuration(log.durationSec) : '—';
  return `
    <div class="screen-header">
      <h2>Session detail</h2>
      <button class="quit-link" id="back-history" type="button">× Back</button>
    </div>
    <div class="card detail-card">
      <div class="detail-row"><span class="detail-label">Date</span><span>${formatDateLong(log.date)}</span></div>
      <div class="detail-row"><span class="detail-label">Workout</span><span>${log.workout}</span></div>
      <div class="detail-row"><span class="detail-label">Started</span><span>${startedAt}</span></div>
      <div class="detail-row"><span class="detail-label">Finished</span><span>${completedAt}</span></div>
      <div class="detail-row"><span class="detail-label">Duration</span><span>${duration}</span></div>
      <div class="detail-row"><span class="detail-label">Capacity before</span><span>${log.capacityBefore}</span></div>
      <div class="detail-row"><span class="detail-label">Capacity after</span><span>${log.capacityAfter}</span></div>
      <div class="detail-row"><span class="detail-label">Wall sit</span><span>${log.wallSitSec}s</span></div>
      <div class="detail-row"><span class="detail-label">Back pain</span><span>${log.backPain}/10</span></div>
      ${log.word ? `<div class="detail-row"><span class="detail-label">One word</span><span><em>"${escapeHtml(log.word)}"</em></span></div>` : ''}
    </div>
    <button class="weekly-review-link progress-link" id="open-progress-from-detail" type="button">
      <span>📈 View progress</span>
      <span class="weekly-review-link-chev">→</span>
    </button>
    <button class="btn-large" id="back-history" type="button">Back to history</button>
  `;
}

// ---------- Ship 4: weekly review (2026-05-15) ----------
//
// A per-week debrief screen reached from home — either via the "Weekly review →"
// button below the consistency card, or by tapping the week-nav label. The
// screen respects `viewedWeekOffset`, so tapping the label on a past week opens
// the review for THAT week.
//
// Design rules honored:
//  - No paternalism. No motivational language. The screen reports the week;
//    it doesn't judge it. (`feedback_no_capacity_paternalism.md` + CLAUDE.md
//    agency rule.)
//  - Voice rule: her one-word entries appear verbatim, never edited.
//  - All data reads from existing loadLogs(). No new Supabase queries.
//  - D-1 visual tokens only (no new color vars).

type WeekSession = {
  log: LogEntry;
  durationStr: string;
};

function getWeekSessions(offset: number): WeekSession[] {
  const logs = loadLogs();
  const saturday = saturdayForOffset(offset);
  const startMs = saturday.getTime();
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;
  return logs
    .filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => a.date.localeCompare(b.date)) // chronological within the week
    .map((log) => ({
      log,
      durationStr: log.durationSec ? formatDuration(log.durationSec) : '—',
    }));
}

type WeekTotals = {
  count: number;
  totalSec: number;
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
      avgCapBefore: null,
      avgCapAfter: null,
      maxWallSit: 0,
      avgBackPain: null,
    };
  }
  let totalSec = 0;
  let capBeforeSum = 0;
  let capAfterSum = 0;
  let maxWallSit = 0;
  let backPainSum = 0;
  let backPainCount = 0;
  for (const { log } of sessions) {
    totalSec += log.durationSec ?? 0;
    capBeforeSum += log.capacityBefore;
    capAfterSum += log.capacityAfter;
    if (log.wallSitSec > maxWallSit) maxWallSit = log.wallSitSec;
    if (log.backPain > 0) {
      backPainSum += log.backPain;
      backPainCount += 1;
    }
  }
  return {
    count: sessions.length,
    totalSec,
    avgCapBefore: capBeforeSum / sessions.length,
    avgCapAfter: capAfterSum / sessions.length,
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
function renderDelta(curr: number, prev: number, kind: 'higher-better' | 'lower-better'): string {
  const diff = curr - prev;
  if (diff === 0) {
    return `<span class="weekly-review-delta-num delta-same">±0</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff}</span>`;
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

function formatCapArrowColor(before: number, after: number): string {
  if (after > before) return 'cap-arrow-up';
  if (after < before) return 'cap-arrow-down';
  return 'cap-arrow-same';
}

function renderWeeklyReviewSession(s: WeekSession): string {
  const { log } = s;
  const idAttr = log.id ? `data-detail="${escapeHtml(log.id)}"` : '';
  const dateStr = formatDateLong(log.date);
  const capCls = formatCapArrowColor(log.capacityBefore, log.capacityAfter);

  const wallSitLine =
    log.wallSitSec > 0
      ? `<div class="weekly-review-session-stat"><span class="weekly-review-session-stat-num">${log.wallSitSec}s</span><span class="weekly-review-session-stat-lbl">wall sit</span></div>`
      : '';

  const backPainLine =
    log.backPain > 0
      ? `<div class="weekly-review-session-stat weekly-review-session-stat-warn"><span class="weekly-review-session-stat-num">${log.backPain}/10</span><span class="weekly-review-session-stat-lbl">back pain</span></div>`
      : '';

  // Voice rule: render her word verbatim, including any typos. Never paraphrase
  // or omit. Empty string → skip the blockquote entirely (no placeholder).
  const wordBlock = log.word
    ? `<blockquote class="weekly-review-session-word">&ldquo;${escapeHtml(log.word)}&rdquo;</blockquote>`
    : '';

  return `
    <button class="weekly-review-session" ${idAttr} type="button">
      <div class="weekly-review-session-head">
        <span class="weekly-review-session-badge weekly-review-session-badge-${log.workout}">${log.workout}</span>
        <div class="weekly-review-session-meta">
          <div class="weekly-review-session-date">${dateStr}</div>
          <div class="weekly-review-session-dur">${s.durationStr}</div>
        </div>
      </div>
      <div class="weekly-review-session-stats">
        <div class="weekly-review-session-stat">
          <span class="weekly-review-session-stat-num">
            ${log.capacityBefore}
            <span class="weekly-review-cap-arrow ${capCls}">→</span>
            ${log.capacityAfter}
          </span>
          <span class="weekly-review-session-stat-lbl">capacity</span>
        </div>
        ${wallSitLine}
        ${backPainLine}
      </div>
      ${wordBlock}
    </button>
  `;
}

function renderWeeklyReview(): string {
  const offset = viewedWeekOffset;
  const saturday = saturdayForOffset(offset);
  const friday = new Date(saturday);
  friday.setDate(saturday.getDate() + 6);
  friday.setHours(23, 59, 59, 999);

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
  const satStr = `${months[saturday.getMonth()]} ${saturday.getDate()}`;
  const friStr =
    saturday.getMonth() === friday.getMonth()
      ? `${friday.getDate()}`
      : `${months[friday.getMonth()]} ${friday.getDate()}`;
  const rangeStr = `${satStr} — ${friStr}`;

  const sessions = getWeekSessions(offset);
  const totals = computeWeekTotals(sessions);
  const prevSessions = getWeekSessions(offset + 1);
  const prev = computeWeekTotals(prevSessions);

  const sessionCountClass = totals.count >= 3 ? 'weekly-review-count-met' : 'weekly-review-count';

  // Empty state — single subtle line, no nudge.
  if (sessions.length === 0) {
    return `
      <div class="screen-header">
        <h2>Week of ${rangeStr}</h2>
        <button class="quit-link" id="back-home" type="button">× Back</button>
      </div>
      <div class="weekly-review-subtitle">
        Sessions: <span class="${sessionCountClass}"><strong>0</strong> of 3</span>
      </div>
      <p class="weekly-review-empty">No sessions this week.</p>
    `;
  }

  const sessionCards = sessions.map(renderWeeklyReviewSession).join('');

  const totalsCard = `
    <div class="card weekly-review-totals">
      <h3>Week totals</h3>
      <div class="weekly-review-totals-grid">
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${formatTotalDuration(totals.totalSec)}</div>
          <div class="weekly-review-total-lbl">total time</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${formatAvg(totals.avgCapBefore)}</div>
          <div class="weekly-review-total-lbl">avg capacity before</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${formatAvg(totals.avgCapAfter)}</div>
          <div class="weekly-review-total-lbl">avg capacity after</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${totals.maxWallSit > 0 ? `${totals.maxWallSit}s` : '—'}</div>
          <div class="weekly-review-total-lbl">max wall sit</div>
        </div>
        ${
          totals.avgBackPain !== null
            ? `<div class="weekly-review-total">
                <div class="weekly-review-total-num">${formatAvg(totals.avgBackPain)}</div>
                <div class="weekly-review-total-lbl">avg back pain</div>
              </div>`
            : ''
        }
      </div>
    </div>
  `;

  const deltaCard =
    prev.count > 0
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
              ${renderDelta(Math.round(totals.totalSec / 60), Math.round(prev.totalSec / 60), 'higher-better')}
            </div>
            ${
              prev.maxWallSit > 0 || totals.maxWallSit > 0
                ? `<div class="weekly-review-delta-row weekly-review-delta-row-emph">
                    <span class="weekly-review-delta-lbl">max wall sit</span>
                    <span class="weekly-review-delta-vals">${prev.maxWallSit}s → ${totals.maxWallSit}s</span>
                    ${renderDelta(totals.maxWallSit, prev.maxWallSit, 'higher-better')}
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
      : '';

  return `
    <div class="screen-header">
      <h2>Week of ${rangeStr}</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    <div class="weekly-review-subtitle">
      Sessions: <span class="${sessionCountClass}"><strong>${totals.count}</strong> of 3</span>
    </div>
    <div class="weekly-review-sessions">
      ${sessionCards}
    </div>
    ${totalsCard}
    ${deltaCard}
  `;
}

// ---------- Ship 5: Progress screen (2026-05-15) ----------
//
// A read-only longitudinal view across her entire history. Reached from home
// via the "📈 Progress →" link below the weekly-review link, and from any
// history-detail screen. The screen reports numbers — it does NOT editorialize.
//
// Design rules honored (CLAUDE.md design rules + memory):
//  - No motivational language. No "you should." No goals beyond the 3/week target.
//  - No paternalism. The system reports state; it never tells.
//  - Voice rule: charts show the data, not Claude's interpretation of it.
//  - Archives untouched. Year-grid + hand-routine archives stay in archive/.
//  - No new external libraries — every chart is hand-built inline SVG.
//  - No new color tokens — only D-1 + cooler-look additions.

// Oldest → newest array of all logs (loadLogs returns newest-first).
function getChronologicalLogs(): LogEntry[] {
  return loadLogs().slice().reverse();
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
  opts: { ariaLabel: string; showMaxGuide?: boolean; maxGuideLabel?: string }
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

  // Optional dashed max guideline.
  let guide = '';
  if (opts.showMaxGuide) {
    const guideY = yFor(dataMax);
    guide = `
      <line x1="${PAD_L}" y1="${guideY.toFixed(1)}" x2="${(W - PAD_R).toFixed(1)}" y2="${guideY.toFixed(1)}"
            stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" />
      <text x="${(W - PAD_R).toFixed(1)}" y="${(guideY - 4).toFixed(1)}" text-anchor="end"
            font-size="9" fill="var(--text-dim-2)" letter-spacing="1.2px">${escapeHtml(opts.maxGuideLabel ?? 'max')}</text>
    `;
  }

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
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="var(--accent-hover)" />`;
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
      ${seriesHtml}
    </svg>
  `;
}

// Bar chart for back pain — categorical (0-10), bar per session.
function renderProgressBarChart(
  values: number[],
  opts: { ariaLabel: string; yMax: number; barColorVar: string }
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
      if (v <= 0) return '';
      const ratio = Math.min(1, v / opts.yMax);
      const h = ratio * innerH;
      const x = PAD_L + i * slot + (slot - barW) / 2;
      const y = PAD_T + innerH - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              fill="${opts.barColorVar}" rx="1" />`;
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

// Horizontal bar chart for sessions-per-week. Each row = one program week,
// fill width proportional to count (capped at 3). Dashed target line at x=3.
function renderProgressHorizontalBars(
  rows: { label: string; value: number }[],
  opts: { ariaLabel: string; target: number }
): string {
  if (rows.length === 0) return '';
  const W = 320;
  const rowH = 22;
  const rowGap = 6;
  const H = rows.length * (rowH + rowGap) - rowGap + 16;
  const PAD_L = 56; // room for the week label
  const PAD_R = 12;
  const innerW = W - PAD_L - PAD_R;

  const targetX = PAD_L + (opts.target / opts.target) * innerW;

  const barsHtml = rows
    .map((r, i) => {
      const y = i * (rowH + rowGap);
      const ratio = Math.min(1, r.value / opts.target);
      const barW = ratio * innerW;
      return `
        <text x="${(PAD_L - 8).toFixed(1)}" y="${(y + rowH / 2 + 3).toFixed(1)}" text-anchor="end"
              font-size="11" fill="var(--text-dim-2)" letter-spacing="1.2px">${escapeHtml(r.label)}</text>
        <rect x="${PAD_L}" y="${y.toFixed(1)}" width="${innerW.toFixed(1)}" height="${rowH}"
              fill="var(--bg-elev-2)" rx="3" />
        ${
          barW > 0
            ? `<rect x="${PAD_L}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${rowH}"
                  fill="var(--accent-progress)" rx="3" />`
            : ''
        }
        <text x="${(W - PAD_R - 4).toFixed(1)}" y="${(y + rowH / 2 + 4).toFixed(1)}" text-anchor="end"
              font-size="11" fill="var(--text-dim)">${r.value} / ${opts.target}</text>
      `;
    })
    .join('');

  return `
    <svg class="progress-chart progress-chart-hbar" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(opts.ariaLabel)}">
      <title>${escapeHtml(opts.ariaLabel)}</title>
      ${barsHtml}
      <line x1="${targetX.toFixed(1)}" y1="0" x2="${targetX.toFixed(1)}" y2="${(H - 16).toFixed(1)}"
            stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
    </svg>
  `;
}

// ----- Per-card render helpers -----

function renderWallSitTrendCard(logs: LogEntry[]): string {
  // Wall-sit values only come from workouts that include a wall sit (A).
  // Use every log with wallSitSec > 0, chronological.
  const wallSits = logs.filter((l) => l.wallSitSec > 0).map((l) => l.wallSitSec);

  if (wallSits.length < 2) {
    if (wallSits.length === 1) {
      const only = wallSits[0] ?? 0;
      return `
        <div class="card progress-card">
          <div class="progress-card-label">Wall sit · seconds held</div>
          <div class="progress-stat-big">${only}s</div>
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

  let deltaLine: string;
  if (diff === 0) {
    deltaLine = `<span class="progress-delta-same">same as first session</span>`;
  } else if (diff > 0) {
    deltaLine = `<span class="progress-delta-up">+${diff}s since first session</span>`;
  } else {
    deltaLine = `<span class="progress-delta-down">${diff}s since first session</span>`;
  }

  const chart = renderProgressLineChart(
    [
      {
        values: wallSits,
        colorVar: 'var(--accent-progress)',
        dotFill: 'var(--accent)',
        emphLast: true,
      },
    ],
    {
      ariaLabel: `Wall sit trend: ${first} to ${last} seconds over ${wallSits.length} sessions, max ${maxVal}`,
      showMaxGuide: true,
      maxGuideLabel: 'max',
    }
  );

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Wall sit · seconds held</div>
      <div class="progress-stat-big">${maxVal}s</div>
      <div class="progress-chart-wrap">${chart}</div>
      <div class="progress-card-meta">${deltaLine}</div>
    </div>
  `;
}

function renderCapacityTrendCard(logs: LogEntry[]): string {
  if (logs.length < 2) return '';

  const before = logs.map((l) => l.capacityBefore);
  const after = logs.map((l) => l.capacityAfter);

  const avgBefore = before.reduce((a, b) => a + b, 0) / before.length;
  const avgAfter = after.reduce((a, b) => a + b, 0) / after.length;

  const chart = renderProgressLineChart(
    [
      { values: before, colorVar: 'var(--text-dim)', dotFill: 'var(--text-dim)' },
      {
        values: after,
        colorVar: 'var(--accent-progress)',
        dotFill: 'var(--accent-progress)',
        emphLast: true,
      },
    ],
    {
      ariaLabel: `Capacity trend: avg before ${avgBefore.toFixed(1)}, avg after ${avgAfter.toFixed(1)} over ${logs.length} sessions`,
    }
  );

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Capacity · before → after</div>
      <div class="progress-chart-wrap">${chart}</div>
      <div class="progress-legend">
        <span class="progress-legend-item">
          <span class="progress-legend-dot progress-legend-dot-before"></span>before
        </span>
        <span class="progress-legend-item">
          <span class="progress-legend-dot progress-legend-dot-after"></span>after
        </span>
      </div>
      <div class="progress-card-meta">
        Avg before <strong>${avgBefore.toFixed(1)}</strong> · Avg after <strong>${avgAfter.toFixed(1)}</strong>
      </div>
    </div>
  `;
}

function renderBackPainTrendCard(logs: LogEntry[]): string {
  if (logs.length < 2) return '';

  const values = logs.map((l) => l.backPain);
  const positive = values.filter((v) => v > 0);

  // Pain scale max is 10 per the post-log slider.
  const chart = renderProgressBarChart(values, {
    ariaLabel:
      positive.length === 0
        ? `Back pain: no pain logged across ${logs.length} sessions`
        : `Back pain: ${positive.length} of ${logs.length} sessions with pain, avg ${(positive.reduce((a, b) => a + b, 0) / positive.length).toFixed(1)}`,
    yMax: 10,
    barColorVar: 'var(--accent-warn)',
  });

  let metaLine: string;
  if (positive.length === 0) {
    metaLine = `No back pain logged across ${logs.length} sessions.`;
  } else {
    const avg = positive.reduce((a, b) => a + b, 0) / positive.length;
    metaLine = `Avg <strong>${avg.toFixed(1)}</strong> across ${positive.length} session${positive.length === 1 ? '' : 's'} where pain logged.`;
  }

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Back pain · 0–10</div>
      <div class="progress-chart-wrap progress-chart-wrap-bar">${chart}</div>
      <div class="progress-card-meta">${metaLine}</div>
    </div>
  `;
}

function renderSessionsPerWeekCard(logs: LogEntry[]): string {
  // Build one entry per program week from PROGRAM_START_DATE forward through
  // the current week.
  const programStart = new Date(PROGRAM_START_DATE + 'T00:00:00');
  // Find Saturday on/before programStart.
  const startDow = programStart.getDay(); // 0=Sun..6=Sat
  const daysBackToSat = (startDow + 1) % 7;
  const firstSat = new Date(programStart);
  firstSat.setDate(programStart.getDate() - daysBackToSat);
  firstSat.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSat = new Date(today);
  thisSat.setDate(today.getDate() - daysSinceSat);
  thisSat.setHours(0, 0, 0, 0);

  const rows: { label: string; value: number; isCurrent: boolean }[] = [];
  const cursor = new Date(firstSat);
  while (cursor.getTime() <= thisSat.getTime()) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const count = logs.filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= weekStart.getTime() && t < weekEnd.getTime();
    }).length;
    const weekNum = getProgramWeek(weekStart).num;
    const isCurrent = weekStart.getTime() === thisSat.getTime();
    rows.push({
      label: isCurrent ? 'now' : `wk ${weekNum}`,
      value: count,
      isCurrent,
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  if (rows.length === 0) return '';

  const hits = rows.filter((r) => r.value >= 3).length;
  const chart = renderProgressHorizontalBars(rows, {
    ariaLabel: `Sessions per week: hit target ${hits} of ${rows.length} weeks`,
    target: 3,
  });

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Sessions per week</div>
      <div class="progress-chart-wrap progress-chart-wrap-hbar">${chart}</div>
      <div class="progress-card-meta">
        Hit target <strong>${hits} of ${rows.length}</strong> ${rows.length === 1 ? 'week' : 'weeks'}.
      </div>
    </div>
  `;
}

function renderExerciseBreakdownCard(logs: LogEntry[]): string {
  // Count how many times each workout letter appears, then list every
  // exercise from WORKOUTS with its count (count of sessions where that
  // workout was logged — each session does each exercise once per round).
  const workoutCounts: Record<WorkoutId, number> = { A: 0, B: 0, C: 0 };
  let maxWallSit = 0;
  for (const l of logs) {
    workoutCounts[l.workout] += 1;
    if (l.wallSitSec > maxWallSit) maxWallSit = l.wallSitSec;
  }

  // For each exercise (warmup + main + cooldown, per workout), how many
  // sessions has it appeared in?
  type Row = {
    name: string;
    workout: WorkoutId;
    sessions: number;
    note: string;
  };
  const rows: Row[] = [];
  for (const id of ['A', 'B', 'C'] as WorkoutId[]) {
    const w = getWorkoutById(id);
    const exercises = [...w.warmup, ...w.main, ...(w.upperBack ?? []), ...w.cooldown];
    // Dedupe within a single workout in case a name appears twice.
    const seenInWorkout = new Set<string>();
    for (const ex of exercises) {
      if (seenInWorkout.has(ex.name)) continue;
      seenInWorkout.add(ex.name);
      const isWallSit = ex.name.toLowerCase() === 'wall sit';
      rows.push({
        name: ex.name,
        workout: id,
        sessions: workoutCounts[id],
        note: isWallSit && maxWallSit > 0 ? `max ${maxWallSit}s` : '',
      });
    }
  }

  const isOpen = state.exerciseBreakdownOpen;
  const inner = isOpen
    ? `
      <div class="progress-breakdown-list">
        ${rows
          .map(
            (r) => `
          <div class="progress-breakdown-row">
            <span class="progress-breakdown-badge progress-breakdown-badge-${r.workout}">${r.workout}</span>
            <span class="progress-breakdown-name">${escapeHtml(r.name)}</span>
            <span class="progress-breakdown-count">${r.sessions}×${r.note ? ` · ${escapeHtml(r.note)}` : ''}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `
    : '';

  return `
    <div class="card progress-card progress-card-breakdown ${isOpen ? 'progress-card-breakdown-open' : ''}">
      <button class="progress-breakdown-toggle" id="toggle-exercise-breakdown" type="button"
              aria-expanded="${isOpen}">
        <span class="progress-card-label">Exercise breakdown</span>
        <span class="progress-breakdown-chev">▸</span>
      </button>
      ${inner}
    </div>
  `;
}

function renderProgress(): string {
  const logs = getChronologicalLogs(); // oldest → newest
  const count = logs.length;

  // Header: subtitle counts sessions since program start.
  const subtitle = `<span class="progress-subtitle-num">${count}</span> session${count === 1 ? '' : 's'} since May 2`;

  // Empty state — fewer than 2 sessions.
  if (count < 2) {
    return `
      <div class="screen-header">
        <h2>Progress</h2>
        <button class="quit-link" id="back-home" type="button">× Back</button>
      </div>
      <div class="progress-subtitle">${subtitle}</div>
      <p class="progress-empty">Progress shows once you have 2+ sessions logged.</p>
    `;
  }

  return `
    <div class="screen-header">
      <h2>Progress</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    <div class="progress-subtitle">${subtitle}</div>
    <div class="progress-screen">
      ${renderWallSitTrendCard(logs)}
      ${renderCapacityTrendCard(logs)}
      ${renderBackPainTrendCard(logs)}
      ${renderSessionsPerWeekCard(logs)}
      ${renderExerciseBreakdownCard(logs)}
    </div>
  `;
}

// ---------- Ship 6: Settings screen ----------
//
// Reachable via the small gear icon in the home header (top-right). NOT a
// primary CTA — settings is reference, not action. Six sections (cards):
// Audio, Timing, Display, Data, About.
//
// All toggles persist to localStorage via setSetting/getSetting. Data section
// has export / import / hold-to-confirm clear. Import is merge-only; Clear
// is local-only (Supabase rows preserved) per the archive-not-delete rule.

const APP_VERSION = '2026-05-15 build';
const GITHUB_REPO_URL = 'https://github.com/allisonecalt-sudo/workout-tracker';

function renderSettings(): string {
  const beepsOn = getBeepsEnabled();
  const restSec = getRestSec();
  const preCount = getPreCountSec();
  const howToOn = getHowToFirstExpand();
  const autoSuggestOn = getAutoSuggestEnabled();
  const logCount = loadLogs().length;

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
            <div class="settings-row-caption">Between exercises in main sets. 5–180 seconds.</div>
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
            <div class="settings-row-caption">3-2-1 before a timed exercise. 0–10 seconds; 0 skips.</div>
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
            <div class="settings-row-title">Expand "How to do it" first time per week</div>
            <div class="settings-row-caption">Off = always start collapsed.</div>
          </div>
          <span class="settings-toggle ${howToOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-howto" ${howToOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Auto-suggest today's workout</div>
            <div class="settings-row-caption">Off = all three workout cards render equally.</div>
          </div>
          <span class="settings-toggle ${autoSuggestOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-suggest" ${autoSuggestOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Data</div>
        <div class="settings-data-row">
          <button class="btn settings-data-btn" id="export-sessions" type="button">Export sessions</button>
          <div class="settings-row-caption">Downloads a JSON file of all local logs (${logCount} session${logCount === 1 ? '' : 's'}).</div>
        </div>
        <div class="settings-data-row">
          <button class="btn settings-data-btn" id="import-sessions-btn" type="button">Import sessions</button>
          <input type="file" id="import-sessions-input" accept="application/json,.json" style="display:none" />
          <div class="settings-row-caption">Merges by id. Existing local entries win on conflict.</div>
        </div>
        <div class="settings-data-row">
          <button class="btn settings-destructive-btn hold-to-confirm" id="clear-local" type="button" data-hold-ms="${HOLD_TO_CLEAR_MS}">
            <span class="hold-fill"></span>
            <span class="hold-label">Hold to clear local sessions</span>
          </button>
          <div class="settings-row-caption">Wipes localStorage only. Your Supabase rows are preserved.</div>
        </div>
        <div class="settings-data-status" id="data-status" aria-live="polite"></div>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">About</div>
        <div class="settings-about-row">
          <div class="settings-row-title">Workout Tracker</div>
          <div class="settings-row-caption">Build ${APP_VERSION}.</div>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-title">Program weeks: ${getProgramWeekCount()}</div>
          <div class="settings-row-caption">Weeks 1–${getProgramWeekCount()} encoded. Add Week ${getProgramWeekCount() + 1}+ in <code>app.ts</code> PROGRAM array.</div>
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

function isValidLogEntry(x: unknown): x is LogEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o['date'] === 'string' &&
    (o['workout'] === 'A' || o['workout'] === 'B' || o['workout'] === 'C') &&
    typeof o['capacityBefore'] === 'number' &&
    typeof o['capacityAfter'] === 'number' &&
    typeof o['wallSitSec'] === 'number' &&
    typeof o['backPain'] === 'number'
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
    showDataStatus('Local sessions cleared. Supabase preserved.');
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
// Used by Quit during workout (in-app, replaces window.confirm for pointer
// users) and by destructive settings actions.

function showQuitConfirmPanel(): void {
  if (document.getElementById('quit-confirm-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'quit-confirm-panel';
  panel.className = 'quit-confirm-panel';
  panel.innerHTML = `
    <div class="quit-confirm-card">
      <div class="quit-confirm-title">Quit this workout?</div>
      <div class="quit-confirm-sub">Progress so far won't save.</div>
      <div class="quit-confirm-row">
        <button class="btn quit-confirm-cancel" id="quit-cancel" type="button">Cancel</button>
        <button class="btn quit-confirm-yes" id="quit-yes" type="button">Quit</button>
      </div>
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
  panel.querySelector('#quit-yes')?.addEventListener('click', () => {
    dismiss();
    resetState();
    render();
  });
  panel.addEventListener('click', (e) => {
    if (e.target === panel) dismiss();
  });
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
  // Ship 6: screen transitions — apply enter-animation class except on
  // workout/timer screens where it would feel laggy mid-rep. The class
  // triggers a 220ms fade + 8px translateY with the spring ease curve.
  root.innerHTML = html;
  if (state.screen !== 'workout' && state.screen !== 'pre-log' && state.screen !== 'post-log') {
    root.classList.remove('screen-enter');
    // Force reflow so re-adding triggers the animation.
    void root.offsetWidth;
    root.classList.add('screen-enter');
  } else {
    root.classList.remove('screen-enter');
  }
  attachHandlers();
  // Persist live position so reopening the app resumes the workout (cleared on
  // quit/finish via resetState). No-op for non-resumable screens.
  saveActiveSession();
}

// Group 2G: confirm dialog on Quit during workout.
function confirmQuit(): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm('Quit this workout? Your progress so far will be lost.');
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
  document.querySelectorAll<HTMLButtonElement>('.workout-card[data-workout]').forEach((btn) => {
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

  // Week navigation on home — prev/next step through past weeks of the dot strip.
  bindClick('prev-week', () => {
    viewedWeekOffset += 1;
    render();
  });
  bindClick('next-week', () => {
    if (viewedWeekOffset > 0) {
      viewedWeekOffset -= 1;
      render();
    }
  });

  bindClick('back-home', () => {
    resetState();
    render();
  });

  // Ship 6: Settings entry from home header.
  bindClick('open-settings', () => {
    state.screen = 'settings';
    render();
  });

  // Ship 6: Settings interactions — toggles, steppers, data buttons.
  attachSettingsHandlers();

  // Ship 4: open weekly-review screen — preserves viewedWeekOffset so tapping
  // the label on a past week opens that week's review (not always current).
  bindClick('open-weekly-review', () => {
    state.screen = 'weekly-review';
    render();
  });
  bindClick('open-weekly-review-link', () => {
    state.screen = 'weekly-review';
    render();
  });

  // Ship 5: Progress screen — full-history longitudinal view. Reached from
  // home button or the "View progress" link on history-detail.
  bindClick('open-progress-link', () => {
    state.screen = 'progress';
    render();
  });
  bindClick('open-progress-from-detail', () => {
    state.screen = 'progress';
    render();
  });

  // Ship 5: collapsible exercise-breakdown card on progress screen.
  bindClick('toggle-exercise-breakdown', () => {
    state.exerciseBreakdownOpen = !state.exerciseBreakdownOpen;
    render();
  });

  bindClick('back-history', () => {
    state.screen = 'history';
    state.historyDetailId = null;
    render();
  });

  // Week dots + history rows + year-grid cells — navigate to history-detail.
  // We use Element here (not HTMLButtonElement) so SVG <rect> cells in the
  // Ship 3 year-grid heatmap also pick up the handler. SVGElement.dataset
  // exists on all modern browsers.
  document.querySelectorAll<Element>('[data-detail]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement | SVGElement).dataset?.['detail'];
      if (!id) return;
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

  // Ship 6: Quit retains its native window.confirm() flow on regular click
  // (keyboard users, headless tests, screen readers all still work). NEW:
  // a long-press (pointerdown ≥ HOLD_TO_QUIT_MS) opens an in-app slide-out
  // confirm panel instead, suppressing the subsequent click.
  const quitBtn = document.getElementById('quit');
  if (quitBtn) {
    let holdTimer: number | null = null;
    let suppressClick = false;
    quitBtn.addEventListener('pointerdown', () => {
      suppressClick = false;
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        suppressClick = true;
        showQuitConfirmPanel();
      }, HOLD_TO_QUIT_MS);
    });
    const cancelHold = (): void => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    quitBtn.addEventListener('pointerup', cancelHold);
    quitBtn.addEventListener('pointercancel', cancelHold);
    quitBtn.addEventListener('pointerleave', cancelHold);
    quitBtn.addEventListener('click', (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressClick = false;
        return;
      }
      if (confirmQuit()) {
        resetState();
        render();
      }
    });
  }

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

  bindClick('save-log', () => {
    const wallsitEl = document.getElementById('wallsit') as HTMLInputElement | null;
    if (wallsitEl) {
      const raw = parseInt(wallsitEl.value, 10);
      state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    }
    const wordEl = document.getElementById('word') as HTMLInputElement | null;
    if (wordEl) state.word = wordEl.value.trim();
    logCompleteAndHome();
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

  bindRange('cap-before', 'cap-before-val', (v) => {
    state.capacityBefore = v;
  });
  bindRange('cap-after', 'cap-after-val', (v) => {
    state.capacityAfter = v;
  });
  bindRange('back', 'back-val', (v) => {
    state.backPain = v;
  });
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
  wireToggle('setting-suggest', SETTING_KEYS.autoSuggest);

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

function bindRange(rangeId: string, valId: string, onChange: (v: number) => void): void {
  const range = document.getElementById(rangeId) as HTMLInputElement | null;
  const val = document.getElementById(valId);
  if (!range || !val) return;
  range.addEventListener('input', () => {
    const n = parseInt(range.value, 10);
    val.textContent = String(n);
    onChange(n);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Resume an in-progress workout if one was left open (Allison 2026-06-06).
  restoreActiveSession();
  render();
  void pullFromSupabase().then(() => flushPendingSyncs());
});
