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
  | 'weekly-review';

type Phase = 'warmup' | 'main' | 'cooldown';

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
};

const STORAGE_KEY = 'workout-tracker:logs';
const HOWTO_SEEN_KEY_PREFIX = 'workout-tracker:howto-seen-week-';
const REST_SEC = 60;
const COUNT_BEEP_FROM_SEC = 3;
const HOLD_TO_SKIP_MS = 500;

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

const WORKOUTS: Record<WorkoutId, Workout> = {
  A: {
    id: 'A',
    name: 'Lower Body + Core',
    description: '🚶 10-min walk + lower body strength · ~38 min',
    rounds: 3,
    warmup: [
      {
        name: 'Outdoor walk',
        reps: '10 min',
        notes: 'Conversational pace. Doubles as warmup + cardio.',
      },
      { name: 'Belly breathing', reps: '5 slow breaths' },
      { name: 'Pelvic tilts', reps: '10 slow' },
      { name: 'Glute squeezes', reps: '10 holds × 3 sec' },
    ],
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
    cooldown: [
      { name: 'Knees-to-chest hold', reps: '60 sec' },
      { name: 'Figure-4 stretch', reps: '45 sec each side' },
      {
        name: 'Seated forward fold',
        reps: '60 sec',
        notes: 'Arms in lap, no reaching.',
      },
      { name: 'Slow breathing', reps: '8 breaths' },
    ],
  },
  B: {
    id: 'B',
    name: 'Glutes + Mobility + Core',
    description: '🚶 10-min walk + glutes & mobility · ~38 min',
    rounds: 3,
    warmup: [
      {
        name: 'Outdoor walk',
        reps: '10 min',
        notes: 'Conversational pace. Doubles as warmup + cardio.',
      },
      { name: 'Belly breathing', reps: '5 slow breaths' },
      { name: 'Pelvic tilts', reps: '10 slow' },
      { name: 'Glute squeezes', reps: '10 holds × 3 sec' },
    ],
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
    cooldown: [
      { name: 'Knees-to-chest hold', reps: '60 sec' },
      { name: 'Figure-4 stretch', reps: '45 sec each side' },
      { name: 'Seated forward fold', reps: '60 sec' },
      { name: 'Slow breathing', reps: '8 breaths' },
    ],
  },
  C: {
    id: 'C',
    name: 'Walk + Core (cardio day)',
    description: '🚶 25-min walk + 2-round core block · ~37 min',
    rounds: 2,
    warmup: [
      {
        name: 'Outdoor walk',
        reps: '25 min',
        notes: 'Conversational-to-brisk pace. Tap done when finished.',
      },
    ],
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
    cooldown: [
      { name: 'Figure-4 stretch', reps: '45 sec each side' },
      { name: 'Knees-to-chest hold', reps: '60 sec' },
      { name: 'Slow breathing', reps: '8 breaths' },
    ],
  },
};

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
  state.isResting = true;
  startTimerCore('rest', REST_SEC, () => {
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
  startTimerCore('pre-countdown', 3, () => {
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
  return state.selectedWorkout ? WORKOUTS[state.selectedWorkout] : null;
}

function getCurrentExercise(): Exercise | null {
  const w = getCurrentWorkout();
  if (!w) return null;
  const list = w[state.currentPhase];
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

  const list = w[state.currentPhase];
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
      state.currentPhase = 'cooldown';
      state.currentExerciseIndex = 0;
    }
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

function resetState(): void {
  stopTimer();
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

function renderExerciseVisual(exerciseName: string): string {
  const v = EXERCISE_VISUALS[exerciseName];
  if (!v) return '';

  const isExpanded = state.videoExpandedFor === exerciseName;
  const safeAlt = escapeHtml(`${exerciseName} — exercise demonstration`);
  const attribution = v.attribution ? escapeHtml(v.attribution) : '';

  if (v.loop) {
    // Primary = still image. Video is behind an expander.
    const videoBlock = v.youtubeId
      ? `
      <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
        ${isExpanded ? '× Hide video' : '▶ Watch full video'}
      </button>
      ${
        isExpanded
          ? `<div class="visual-video-wrap">
              <iframe
                src="https://www.youtube.com/embed/${escapeHtml(v.youtubeId)}?rel=0&modestbranding=1"
                title="${safeAlt}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                loading="lazy"
              ></iframe>
            </div>`
          : ''
      }`
      : '';
    return `
      <div class="exercise-visual">
        <img src="${escapeHtml(v.loop)}" alt="${safeAlt}" loading="lazy" />
        ${videoBlock}
        ${attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
  }

  // No still — iframe is primary, behind an expander still (autoplay-off is
  // intentional; YouTube embeds can't autoplay on mobile without user gesture
  // and we don't want unrequested data downloads).
  if (v.youtubeId) {
    return `
      <div class="exercise-visual exercise-visual-video-only">
        ${
          isExpanded
            ? `<div class="visual-video-wrap">
                <iframe
                  src="https://www.youtube.com/embed/${escapeHtml(v.youtubeId)}?rel=0&modestbranding=1"
                  title="${safeAlt}"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                  loading="lazy"
                ></iframe>
              </div>`
            : `<button class="visual-video-poster" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="false">
                <span class="visual-video-poster-icon">▶</span>
                <span class="visual-video-poster-label">Watch how it looks</span>
              </button>`
        }
        ${attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
  }

  return '';
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
  const isOpen = userOpened || (isFirstThisWeek && !userClosed);

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
        <span class="how-to-chev">${isOpen ? '▾' : '▸'}</span>
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

// Year-grid heatmap. Builds the date range from PROGRAM_START_DATE to today
// (or extends to 52 weeks back if she has enough sessions). Renders 7 rows
// (Sat → Fri, her week per reference_week_definition.md) × N columns of weeks.
// Each cell is 6px with 2px gap. Empty days show a 1px --border outline. Today
// gets a 1px --accent outline. Cells with a session are tappable → history-detail.
type YearGridCell = {
  date: Date;
  iso: string;
  log: LogEntry | null;
  isToday: boolean;
  isFuture: boolean;
};

type YearGridWeek = {
  cells: YearGridCell[];
  monthLabel: string | null; // shown above the first column of a new month
};

function buildYearGrid(logs: LogEntry[]): YearGridWeek[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Saturday of the CURRENT week (week column anchor)
  const todayDow = today.getDay(); // 0=Sun..6=Sat
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSaturday = new Date(today);
  thisSaturday.setDate(today.getDate() - daysSinceSat);

  // Determine start. If sparse data (< 5 sessions), scope to program start.
  // Otherwise show up to 52 weeks. Either way we render from the Saturday
  // before-or-equal to the start date.
  const programStart = new Date(PROGRAM_START_DATE + 'T00:00:00');
  let startDate: Date;
  if (logs.length < 5) {
    startDate = new Date(programStart);
  } else {
    startDate = new Date(thisSaturday);
    startDate.setDate(thisSaturday.getDate() - 51 * 7);
    if (startDate < programStart) startDate = new Date(programStart);
  }
  // Back up to the Saturday before-or-equal startDate
  const startDow = startDate.getDay();
  const startSatOffset = (startDow + 1) % 7;
  startDate.setDate(startDate.getDate() - startSatOffset);
  startDate.setHours(0, 0, 0, 0);

  // Build log-by-date lookup (ISO date string YYYY-MM-DD)
  const byDate = new Map<string, LogEntry>();
  for (const l of logs) {
    const d = new Date(l.date);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // first wins (logs are newest-first; for duplicates on same date, show the most-recent one)
    if (!byDate.has(iso)) byDate.set(iso, l);
  }

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

  const weeks: YearGridWeek[] = [];
  const cursor = new Date(startDate);
  let prevMonth = -1;
  // Render through and including the current Saturday's column (full week incl future)
  const endMs = thisSaturday.getTime() + 7 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() < endMs) {
    const cells: YearGridCell[] = [];
    const weekStartMonth = cursor.getMonth();
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(cursor);
      cellDate.setDate(cursor.getDate() + d);
      cellDate.setHours(0, 0, 0, 0);
      const iso = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
      cells.push({
        date: cellDate,
        iso,
        log: byDate.get(iso) ?? null,
        isToday: cellDate.getTime() === todayMs,
        isFuture: cellDate.getTime() > todayMs,
      });
    }
    const monthLabel = weekStartMonth !== prevMonth ? (months[weekStartMonth] ?? null) : null;
    prevMonth = weekStartMonth;
    weeks.push({ cells, monthLabel });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function renderYearGrid(): string {
  const logs = loadLogs();
  const weeks = buildYearGrid(logs);
  const dayLabels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  // Sessions this week
  const currentWeekCount = getWeekCount(0);

  // Cell geometry — kept in sync with .year-grid-cell CSS
  const CELL = 6;
  const GAP = 2;
  const ROW_LABEL_W = 28;
  const HEADER_H = 14;

  const totalCols = weeks.length;
  const gridW = totalCols * (CELL + GAP) - GAP;
  const gridH = 7 * (CELL + GAP) - GAP;
  const svgW = ROW_LABEL_W + gridW;
  const svgH = HEADER_H + gridH + 4;

  // Month headers — positioned at column transitions
  const monthHeaders = weeks
    .map((w, colIdx) => {
      if (!w.monthLabel) return '';
      const x = ROW_LABEL_W + colIdx * (CELL + GAP);
      return `<text x="${x}" y="10" class="year-grid-month">${w.monthLabel}</text>`;
    })
    .join('');

  // Row labels (Sat..Fri)
  const rowLabels = dayLabels
    .map((lbl, rowIdx) => {
      const y = HEADER_H + rowIdx * (CELL + GAP) + CELL - 1;
      return `<text x="0" y="${y}" class="year-grid-row-label">${lbl}</text>`;
    })
    .join('');

  // Cells
  const cells = weeks
    .map((w, colIdx) => {
      const x = ROW_LABEL_W + colIdx * (CELL + GAP);
      return w.cells
        .map((c, rowIdx) => {
          if (c.isFuture) return ''; // don't render future days
          const y = HEADER_H + rowIdx * (CELL + GAP);
          const colorVar = c.log
            ? c.log.workout === 'A'
              ? 'var(--dot-a)'
              : c.log.workout === 'B'
                ? 'var(--dot-b)'
                : 'var(--dot-c)'
            : 'transparent';
          const strokeVar = c.isToday ? 'var(--accent)' : c.log ? colorVar : 'var(--border-strong)';
          const tooltip = c.log
            ? `${formatDate(c.iso)} · Workout ${c.log.workout} · capacity ${c.log.capacityBefore}→${c.log.capacityAfter}`
            : `${formatDate(c.iso)} · no workout`;
          const clickAttr = c.log?.id ? `data-detail="${escapeHtml(c.log.id)}"` : '';
          const cls = [
            'year-grid-cell',
            c.log ? 'year-grid-cell-active' : 'year-grid-cell-empty',
            c.isToday ? 'year-grid-cell-today' : '',
            c.log ? 'year-grid-cell-clickable' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="1" ry="1"
                       class="${cls}" fill="${colorVar}" stroke="${strokeVar}"
                       ${clickAttr}><title>${escapeHtml(tooltip)}</title></rect>`;
        })
        .join('');
    })
    .join('');

  return `
    <div class="card year-grid-card">
      <div class="year-grid-header">
        <h3 class="year-grid-title">
          Consistency · <span class="year-grid-sub">sessions per week</span>
        </h3>
        <div class="year-grid-stat">
          <span class="year-grid-count">${currentWeekCount} of 3</span>
          <span class="year-grid-stat-label">this week</span>
        </div>
      </div>
      <div class="year-grid-scroll">
        <svg class="year-grid" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}"
             role="img" aria-label="Workout consistency heatmap, last ${weeks.length} weeks">
          ${monthHeaders}
          ${rowLabels}
          ${cells}
        </svg>
      </div>
    </div>
  `;
}

// ---------- renders ----------

function renderHome(): string {
  const logs = loadLogs();
  const week = getProgramWeek();
  const weekRange = formatWeekRange(week.start, week.end);
  // Progress card + dot strip follow viewedWeekOffset so the user can step
  // back through past weeks. Default offset 0 = current Sat-Fri week.
  const viewedWeek = getViewedProgramWeek(viewedWeekOffset);
  const viewedWeekRange = formatWeekRange(viewedWeek.start, viewedWeek.end);
  const viewedWeekCount = getWeekCount(viewedWeekOffset);
  const todaysPick = getTodaysPick();
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
    <h1>Workout Tracker</h1>
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

    ${renderYearGrid()}

    <button class="weekly-review-link" id="open-weekly-review-link" type="button">
      <span>📊 Weekly review</span>
      <span class="weekly-review-link-chev">→</span>
    </button>

    <h3>Pick today's workout</h3>
    <div class="workout-picker">
      ${(['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const w = WORKOUTS[id];
          const isPick = id === todaysPick;
          return `
        <button class="workout-card ${isPick ? 'workout-card-pick' : ''}" data-workout="${id}">
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
  return `
    <div class="screen-header">
      <h2>Workout ${w.id} · ${w.name}</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    <p class="subtitle">Before we start — how do you feel?</p>

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
  const total = REST_SEC;
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

function renderWorkout(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  const ex = getCurrentExercise();
  const phaseList = w[state.currentPhase];
  const total = phaseList.length;
  const phaseLabel =
    state.currentPhase === 'main'
      ? `Main · Round ${state.currentRound}/${w.rounds}`
      : state.currentPhase === 'warmup'
        ? 'Warm-up'
        : 'Cool-down';

  if (state.isResting) {
    return renderRestScreen(w.id, phaseLabel);
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
  }
  root.innerHTML = html;
  attachHandlers();
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

  bindClick('quit', () => {
    if (confirmQuit()) {
      resetState();
      render();
    }
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
  render();
  void pullFromSupabase().then(() => flushPendingSyncs());
});
