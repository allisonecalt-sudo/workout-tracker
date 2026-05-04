type WorkoutId = 'A' | 'B' | 'C';

type Exercise = {
  name: string;
  reps?: string;
  notes?: string;
  durationSec?: number;
  isTimed?: boolean;
  isWalk?: boolean;
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
  rightWristPain: number;
  leftWristPain: number;
  backPain: number;
  word: string;
  synced?: boolean;
};

type AppScreen = 'home' | 'pre-log' | 'workout' | 'post-log' | 'history' | 'hand-routine';

type Phase = 'warmup' | 'main' | 'cooldown';

type HandRoutineId = 'left-hand' | 'right-hand';

type HandRoutine = {
  id: HandRoutineId;
  name: string;
  shortName: string;
  status: 'active' | 'locked';
  description: string;
  lockReason?: string;
  frequency: string;
  exercises: Exercise[];
};

type HandLog = {
  id?: string;
  date: string;
  routine: HandRoutineId;
  synced?: boolean;
};

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

type AppState = {
  screen: AppScreen;
  selectedWorkout: WorkoutId | null;
  capacityBefore: number;
  capacityAfter: number;
  wallSitSec: number;
  rightWristPain: number;
  leftWristPain: number;
  backPain: number;
  word: string;
  currentRound: number;
  currentPhase: Phase;
  currentExerciseIndex: number;
  isResting: boolean;
  timerSeconds: number;
  preCountdown: number;
  selectedHandRoutine: HandRoutineId | null;
  currentHandExerciseIndex: number;
  syncStatus: SyncStatus;
};

const STORAGE_KEY = 'workout-tracker:logs';
const HAND_STORAGE_KEY = 'workout-tracker:hand-logs';
const REST_SEC = 60;

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
    description: 'Legs, glutes, abs. ~30 min, fully hands-free.',
    rounds: 3,
    warmup: [
      { name: 'Belly breathing', reps: '8 slow breaths' },
      {
        name: 'Knee-to-chest hugs',
        reps: '5 each side',
        notes: 'Forearm hook, no grip',
      },
      { name: 'Pelvic tilts', reps: '10 slow' },
      { name: 'Knee drops side-to-side', reps: '8 each way', notes: 'Small range' },
      { name: 'Glute squeezes', reps: '10 holds × 3 sec' },
    ],
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
    description: 'Variety day. ~30 min, hands-free.',
    rounds: 3,
    warmup: [
      { name: 'Belly breathing', reps: '8 slow breaths' },
      { name: 'Knee-to-chest hugs', reps: '5 each side' },
      { name: 'Pelvic tilts', reps: '10 slow' },
      { name: 'Knee drops side-to-side', reps: '8 each way' },
      { name: 'Glute squeezes', reps: '10 holds × 3 sec' },
    ],
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
    cooldown: [
      { name: 'Knees-to-chest hold', reps: '60 sec' },
      { name: 'Figure-4 stretch', reps: '45 sec each side' },
      { name: 'Seated forward fold', reps: '60 sec' },
      { name: 'Slow breathing', reps: '8 breaths' },
    ],
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
        isWalk: true,
      },
      { name: 'Glute bridges', reps: '10 reps · 2-sec hold' },
      { name: 'Modified dead bug', reps: '6 each side' },
      { name: 'Heel taps', reps: '10 each side' },
      { name: 'Figure-4 stretch', reps: '45 sec each side' },
      { name: 'Knees-to-chest hold', reps: '60 sec' },
    ],
    cooldown: [{ name: 'Slow breathing', reps: '8 breaths' }],
  },
};

const HAND_ROUTINES: Record<HandRoutineId, HandRoutine> = {
  'left-hand': {
    id: 'left-hand',
    name: 'Left hand · tendonitis recovery',
    shortName: 'Left hand',
    status: 'active',
    description: 'Gentle stretches + tendon glides for ulnar-side wrist tendonitis.',
    frequency: '3x per day · ~5 min each',
    exercises: [
      { name: 'Left tendon glides', reps: '5-10 cycles' },
      { name: 'Left wrist circles', reps: '5 each direction' },
      { name: 'Wall flexor stretch (left)', reps: '20-30 sec hold · 3 reps' },
      { name: 'Wall extensor stretch (left)', reps: '20-30 sec hold · 3 reps' },
      { name: 'Forearm self-massage (left)', reps: '30-60 sec' },
    ],
  },
  'right-hand': {
    id: 'right-hand',
    name: 'Right hand · TFCC isometrics (Eliana)',
    shortName: 'Right hand',
    status: 'locked',
    description: 'Isometric exercises from Eliana for TFCC + tennis elbow recovery.',
    lockReason:
      "Start ONLY after multiple pain-free days in a row. Day-30 test ~May 10. Confirm with Eliana before starting. You can preview the routine, but don't log it as done yet.",
    frequency: 'TBD with Eliana',
    exercises: [
      { name: 'Ponytail grip', reps: '10 reps · 5-sec hold' },
      { name: 'Bottle lift — pronated', reps: '10 reps' },
      { name: 'Bottle lift — supinated', reps: '10 reps' },
      { name: 'Tennis elbow isometric', reps: '10-sec hold · multiple reps' },
    ],
  },
};

const EXERCISE_GUIDE: Record<string, { howTo: string; videoQuery: string }> = {
  'Belly breathing': {
    howTo:
      "Lie on your back, knees bent, feet flat. Rest one arm at your side (no weight on the hand). Inhale through your nose for 4 counts — your BELLY should rise, not your chest. Exhale slowly through your mouth for 6 counts. Common mistake: chest rising instead of belly. If that happens, slow down and put less effort into the inhale. This wakes up your diaphragm and signals your nervous system it's safe to work.",
    videoQuery: 'diaphragmatic belly breathing exercise',
  },
  'Knee-to-chest hugs': {
    howTo:
      "On your back, knees bent. Slowly draw ONE thigh toward your chest. Hook your forearm behind the thigh (NOT your hand) and let the leg rest there — don't actively pull. Hold for 2-3 breaths, then switch. Keep the other foot flat on the mat. Common mistake: lifting the head off the mat — let it stay heavy. Wakes up the hips and lower back gently.",
    videoQuery: 'single knee to chest stretch',
  },
  'Pelvic tilts': {
    howTo:
      "On your back, knees bent, feet flat hip-width apart. Tilt your pelvis so your lower back gently flattens into the mat (you're tucking your tailbone slightly toward you). Hold 1-2 sec, then release back to neutral. Movement is small — 1-2 inches at the hip. Exhale on the tilt, inhale on the release. Common mistake: over-arching on the release. Just go to neutral, not into a backbend. Trains the pelvis-spine connection your back has been missing.",
    videoQuery: 'supine pelvic tilt exercise lower back',
  },
  'Knee drops side-to-side': {
    howTo:
      'On your back, knees bent, feet flat hip-width apart, arms relaxed at sides palms up. Slowly drop both knees a SHORT distance to one side (not all the way to the floor — only as far as feels easy). Pause, breathe, then return to center, then the other side. Keep both shoulders pressed to the mat the whole time. Common mistake: forcing knees too far — that twists the back. Small range = safer + just as effective. Loosens the lower back rotation gently.',
    videoQuery: 'supine knee drops mobility exercise',
  },
  'Glute squeezes': {
    howTo:
      "On your back, knees bent, feet flat. Gently tighten your butt muscles like you're holding a coin. Hold 3 sec, fully relax 2 sec, repeat. The goal is awareness, not max effort — aim for 50% squeeze, not 100%. Breathe normally throughout. Common mistake: squeezing the abs or pelvic floor too. Try to isolate ONLY the glutes. Wakes up the muscle group that's about to do most of today's work.",
    videoQuery: 'glute squeeze isometric exercise',
  },
  'Bodyweight squats': {
    howTo:
      'Feet hip- to shoulder-width apart, toes pointed slightly out. Arms crossed over chest. Slowly lower for 3 SECONDS into a comfortable squat depth (knees can stay above 90° — no need to go deep). Pause 1 SECOND at the bottom. Stand up over 3 SECONDS. Inhale on the way down, exhale on the way up. Common mistakes: knees collapsing inward (push them out toward your pinky toes); chest dropping (stay tall). If balance is wobbly, stand near a wall and let your shoulder lightly touch — NOT your hand.',
    videoQuery: 'bodyweight squat slow tempo proper form',
  },
  'Glute bridges': {
    howTo:
      "On your back, knees bent, feet flat hip-width apart, arms relaxed at sides. Squeeze glutes FIRST, then lift hips to a comfortable height (don't go super high — your body should make a straight line from knees to shoulders, not an arch). Hold 2 sec at the top, then lower slowly. Exhale on the lift, inhale on the lower. Common mistakes: pushing the lower back into a backbend (drive through your HEELS, not your toes); hips coming up before glutes engage (hence: squeeze first). The single best lower-back-friendly glute exercise.",
    videoQuery: 'glute bridge exercise form beginner',
  },
  'Wall sit': {
    howTo:
      'Stand with your back flat against a wall. Slide down until your knees are between 90° and 120° (steeper = harder, shallower = easier — pick what feels safe today). Knees should NOT go past your toes. Hands rest on thighs or hang loose at sides — no pushing on the wall. Breathe normally. Common mistake: holding your breath. Stay relaxed in the upper body. This is your weekly progress benchmark — track the time held.',
    videoQuery: 'wall sit exercise proper form',
  },
  'Side-lying clamshells': {
    howTo:
      "Lie on your SIDE, knees bent ~90°, hips and shoulders stacked vertically (don't roll back). Head rests directly on the mat or on a thin pillow — DO NOT prop up on your forearm. Bottom arm extends along the floor under your head, relaxed. Keep feet together. Open the TOP knee like a clam shell while keeping the bottom knee on the mat — only lift to comfortable range. Lower with control. Inhale up, exhale down. Common mistake: hips rolling backward as the knee opens — keep them stacked.",
    videoQuery: 'side lying clamshell glute exercise',
  },
  'Modified dead bug': {
    howTo:
      'On your back, hips and knees both at 90° in the air (shins parallel to ceiling — tabletop position). Arms relaxed FLAT at sides on the mat, palms UP (not down — protects wrists). Slowly extend ONE leg straight out, hovering it above the floor. Bring it back to tabletop. Switch sides. Keep your lower back glued to the mat the whole time — if it arches, your range is too big. Exhale on the leg extension. Common mistake: speed. Slow = harder = better.',
    videoQuery: 'dead bug exercise beginner legs only',
  },
  'Heel taps': {
    howTo:
      "On your back, knees bent, feet flat near your butt. Slowly extend ONE leg out and tap your heel toward the floor (don't slam it down). Return to start. Alternate sides. Arms relaxed at sides, palms up. Lower back stays in contact with the mat — if it arches, reduce the leg extension. Exhale on the tap. Common mistake: bending the back. Keep it steady — this is an anti-arch exercise, not a stretch.",
    videoQuery: 'lying heel tap ab exercise',
  },
  'Knees-to-chest hold': {
    howTo:
      'On your back, gently bring BOTH thighs toward your chest. Forearms hook behind the thighs to support — NOT your hands gripping. The leg position should be passive: legs resting on your forearms, not actively pulled. Breathe slowly. If your tailbone lifts off the mat, the angle is too tight — let the legs come a little further from your chest. Common mistake: gripping with hands (defeats the wrist protection). Releases the lower back fully.',
    videoQuery: 'double knee to chest stretch',
  },
  'Figure-4 stretch': {
    howTo:
      "On your back, knees bent, feet flat. Cross your RIGHT ankle over your LEFT knee (the right leg makes a '4' shape). Let the right knee fall outward — that opens the right hip. To deepen: use your forearms (not your hands) to draw the LEFT leg gently toward you. Hold 45 sec, breathing slowly. Switch sides. Common mistake: forcing the bent knee down with the other hand — let it open passively. Targets piriformis + outer hip — huge for back tightness.",
    videoQuery: 'figure 4 stretch supine',
  },
  'Seated forward fold': {
    howTo:
      "Sit on the mat with legs extended in front of you (slight knee bend totally fine — don't lock them). Arms rest in your lap, NOT reaching forward. Hinge forward at the HIPS (not by rounding your back) until you feel a gentle stretch in the back of your legs. Stop at 2/10 stretch — this isn't a depth competition. Hold and breathe. Common mistake: rounding the upper back to look like the stretch is deeper. Better to stay tall with a smaller fold than collapse.",
    videoQuery: 'seated forward fold hamstring stretch',
  },
  'Slow breathing': {
    howTo:
      "Sit comfortably or stay lying down. Inhale through your nose for 4 counts, exhale through your mouth for 6 counts (longer exhale than inhale = activates the rest-and-recover nervous system). 8 full rounds. Eyes can close. This is the official 'workout is over' signal — your body needs the cue to switch out of effort mode. Common mistake: rushing because the workout is done. The cool-down is when adaptation actually happens — don't skip it.",
    videoQuery: 'slow breathing relaxation exercise',
  },
  'Side-lying leg raises': {
    howTo:
      "Lie on your SIDE, hips stacked, head on the mat (or thin pillow) — NOT propped on your forearm. Bottom leg bent for stability, top leg straight. Slowly lift the top leg 30-45° (not super high — height isn't the point). Lower with control over 3 seconds. Keep your toes pointing FORWARD, not toward the ceiling — that targets the right glute muscle (glute medius). Exhale on the lift. Common mistake: rolling the hip backward as you lift, which makes the leg go higher but turns it into a hip flexor exercise instead of a glute one.",
    videoQuery: 'side lying leg raise exercise',
  },
  'Single-leg glute bridges': {
    howTo:
      'Setup like a glute bridge: on your back, knees bent, feet flat, arms at sides palms up. Lift ONE foot off the mat (either knee tucked toward chest or leg extended straight). Squeeze the glute on the standing leg, push through that heel, lift hips. Hold 2 sec. Lower slow. Switch legs after the set. Common mistake: hips dropping toward the lifted-leg side. Keep them level — imagine balancing a glass of water on your pelvis. Bigger glute challenge than the regular bridge.',
    videoQuery: 'single leg glute bridge form',
  },
  'Slow supine bicycle': {
    howTo:
      'On your back, knees bent, feet flat. Bring one knee up toward your chest. Arms STAY relaxed at sides — NEVER behind the head (protects the neck and the wrists). As you slowly extend that leg out, bring the OTHER knee up. Continuous slow alternation, like pedaling underwater. Lower back glued to mat the whole time. Exhale on each leg extension. Common mistake: speed (this is supposed to be slow and controlled, not a cardio move).',
    videoQuery: 'supine bicycle exercise slow no hands behind head',
  },
  'Standing calf raises': {
    howTo:
      "Stand tall with feet hip-width apart. Light fingertip touch on a wall for balance — NO grip, NO weight on the hand. Slowly lift your heels until you're on the balls of your feet (3 seconds up). Hold 1 sec at the top. Lower slowly (3 seconds down). Inhale on the lift, exhale on the lower. Common mistake: bouncing for momentum — kills the work the calves are doing. Slow tempo is doing the heavy lifting here.",
    videoQuery: 'standing calf raise exercise',
  },
  'Outdoor walk': {
    howTo:
      "Conversational pace — you should be able to talk in full sentences without getting breathless. 20 minutes minimum. Walking is genuinely your most underrated exercise: it preserves joint health, supports digestion (especially good with Crohn's), aids GLP-1 medication's effect, and clears mental fog. Take it outdoors when possible — the visual variety and sunlight matter. Tap done when you finish.",
    videoQuery: 'walking exercise pace',
  },
  'Left tendon glides': {
    howTo:
      'Cycle slowly through 5 hand positions on your LEFT hand: STRAIGHT (fingers extended) → HOOK (knuckles straight, fingers curled) → FIST (full curl) → TABLETOP (knuckles bent, fingers straight) → STRAIGHT FIST (fingers folded onto palm with knuckles straight). Hold each shape for 1-2 sec. Slow, no pain. 5-10 full cycles.',
    videoQuery: 'tendon glide exercise hand therapy 5 positions',
  },
  'Left wrist circles': {
    howTo:
      'Hold your LEFT hand out in front of you, fingers relaxed (not making a fist), no load. Slowly draw circles with your wrist — like drawing the outline of a quarter, not a dinner plate. 5 clockwise, then 5 counterclockwise. Range of motion only — no force, no end-range push. Breathe normally. If any motion produces a pinch or sharp pain, reduce the circle size further. Goal: keep the joint mobile without provoking inflammation.',
    videoQuery: 'gentle wrist circle range of motion',
  },
  'Wall flexor stretch (left)': {
    howTo:
      'Stand near a wall. Place LEFT palm flat on the wall, fingers pointing DOWN. Slowly lean forward to feel a gentle stretch in the front of your forearm. Hold 20-30 sec. 3 reps.',
    videoQuery: 'wrist flexor stretch wall',
  },
  'Wall extensor stretch (left)': {
    howTo:
      'Place the BACK of your LEFT hand flat against the wall, fingers pointing DOWN. Slowly lean forward to stretch the back of your forearm. This is the main one for ECU/extensors. Hold 20-30 sec. 3 reps.',
    videoQuery: 'wrist extensor stretch ECU',
  },
  'Forearm self-massage (left)': {
    howTo:
      'Press your LEFT forearm muscle (top side, between elbow and wrist) against a tennis ball pressed to a wall, or the edge of a doorframe. Slowly roll/glide for 30-60 sec. Work the MUSCLE BELLY — avoid pressing on the wrist tendon directly.',
    videoQuery: 'forearm self massage tennis ball',
  },
  'Ponytail grip': {
    howTo:
      "Hand fully open. Gently close into a SOFT fist as if grabbing a ponytail you don't want to break — light squeeze, not a hard grip. Hold 5 seconds. Open fully (fingers all the way extended). That's one rep. 10 reps. Breathe normally throughout — don't hold your breath. Wakes up the finger flexors and extensors with controlled tendon loading. Common mistake: squeezing too hard (defeats the gentle-rehab purpose).",
    videoQuery: 'ponytail grip hand therapy exercise',
  },
  'Bottle lift — pronated': {
    howTo:
      "Stand or sit with your shoulder at 90° abduction (arm OUT to the side at shoulder height, like making a 'T' shape). Bend the elbow 90° so the forearm points straight up. Wrist NEUTRAL (not bent). Hold a light bottle (start with empty or very light) with palm facing DOWN (pronated). Slowly lift the bottle up by tilting your wrist forward, then lower it. Small range — this is wrist control work, not weight training. 10 reps each side. Common mistake: using shoulder/elbow to do the lift — keep them still, only the wrist moves.",
    videoQuery: 'wrist bottle lift exercise rehabilitation',
  },
  'Bottle lift — supinated': {
    howTo:
      "Same setup as pronated: shoulder at 90° abduction, elbow bent 90°, wrist neutral. But now palm faces UP (supinated — like holding a tray). Slowly tilt the wrist back and forward in a small range, lifting the bottle. 10 reps. Slow and controlled. Common mistake: letting the elbow drift — keep it locked at 90° so only the wrist works. This direction is often weaker than pronated for TFCC patients — that's normal and improves with practice.",
    videoQuery: 'wrist supination strengthening bottle',
  },
  'Tennis elbow isometric': {
    howTo:
      "Sit at a table or stand. Elbow bent ~90°, forearm parallel to the floor, wrist neutral (straight, not bent). Place the BACK of your hand under the table edge or against your other hand. Push UP gently against the resistance — this fires the wrist extensors without movement (isometric). Hold 10 seconds at maybe 30-50% effort. Breathe steadily — don't hold your breath. Multiple reps as Eliana prescribes. Common mistake: max-effort push (gentler is more effective for tendon healing). Targets the lateral epicondyle / tennis elbow tendons.",
    videoQuery: 'tennis elbow isometric exercise',
  },
};

const state: AppState = {
  screen: 'home',
  selectedWorkout: null,
  capacityBefore: 5,
  capacityAfter: 5,
  wallSitSec: 0,
  rightWristPain: 0,
  leftWristPain: 0,
  backPain: 0,
  word: '',
  currentRound: 1,
  currentPhase: 'warmup',
  currentExerciseIndex: 0,
  isResting: false,
  timerSeconds: 0,
  preCountdown: 0,
  selectedHandRoutine: null,
  currentHandExerciseIndex: 0,
  syncStatus: 'idle',
};

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

function playBeep(frequency: number, durationMs: number): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
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

let timerInterval: number | null = null;

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

function writeLogs(logs: LogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 50)));
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
          pain_left_wrist_0_10: entry.leftWristPain,
          pain_right_wrist_0_10: entry.rightWristPain,
          pain_back_0_10: entry.backPain,
          one_word: entry.word || null,
        },
      ]),
    });
    if (res.ok) {
      markLogSynced(entry.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getCurrentWorkout(): Workout | null {
  return state.selectedWorkout ? WORKOUTS[state.selectedWorkout] : null;
}

function getCurrentExercise(): Exercise | null {
  const w = getCurrentWorkout();
  if (!w) return null;
  const list = w[state.currentPhase];
  return list[state.currentExerciseIndex] ?? null;
}

function clearTimer(): void {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer(seconds: number, onComplete: () => void): void {
  clearTimer();
  state.timerSeconds = seconds;
  render();
  timerInterval = window.setInterval(() => {
    state.timerSeconds -= 1;
    if (state.timerSeconds > 0 && state.timerSeconds <= 3) {
      playCountBeep();
    }
    if (state.timerSeconds <= 0) {
      clearTimer();
      state.timerSeconds = 0;
      playFinishBeep();
      onComplete();
    }
    render();
  }, 1000);
}

function startPreCountdown(then: () => void): void {
  state.preCountdown = 3;
  playCountBeep();
  render();
  const interval = window.setInterval(() => {
    state.preCountdown -= 1;
    if (state.preCountdown <= 0) {
      clearInterval(interval);
      state.preCountdown = 0;
      playGoBeep();
      render();
      then();
    } else {
      playCountBeep();
      render();
    }
  }, 1000);
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
  render();
}

function advanceExercise(): void {
  const w = getCurrentWorkout();
  if (!w) return;
  clearTimer();
  state.isResting = false;
  const list = w[state.currentPhase];
  if (state.currentExerciseIndex < list.length - 1) {
    state.currentExerciseIndex += 1;
    if (state.currentPhase === 'main') {
      startRest();
      return;
    }
  } else if (state.currentPhase === 'warmup') {
    state.currentPhase = 'main';
    state.currentExerciseIndex = 0;
  } else if (state.currentPhase === 'main') {
    if (state.currentRound < w.rounds) {
      state.currentRound += 1;
      state.currentExerciseIndex = 0;
      startRest();
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

function startRest(): void {
  state.isResting = true;
  startTimer(REST_SEC, () => {
    state.isResting = false;
    render();
  });
}

function skipRest(): void {
  clearTimer();
  state.isResting = false;
  render();
}

function startTimedExercise(): void {
  const ex = getCurrentExercise();
  if (!ex || !ex.durationSec) return;
  const duration = ex.durationSec;
  const exerciseName = ex.name;
  startPreCountdown(() => {
    startTimer(duration, () => {
      if (exerciseName === 'Wall sit') {
        state.wallSitSec = Math.max(state.wallSitSec, duration);
      }
    });
  });
}

function logCompleteAndHome(): void {
  if (!state.selectedWorkout) return;
  const stored = saveLog({
    date: new Date().toISOString(),
    workout: state.selectedWorkout,
    capacityBefore: state.capacityBefore,
    capacityAfter: state.capacityAfter,
    wallSitSec: state.wallSitSec,
    rightWristPain: state.rightWristPain,
    leftWristPain: state.leftWristPain,
    backPain: state.backPain,
    word: state.word,
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
  clearTimer();
  state.screen = 'home';
  state.selectedWorkout = null;
  state.capacityBefore = 5;
  state.capacityAfter = 5;
  state.wallSitSec = 0;
  state.rightWristPain = 0;
  state.leftWristPain = 0;
  state.backPain = 0;
  state.word = '';
  state.currentRound = 1;
  state.currentPhase = 'warmup';
  state.currentExerciseIndex = 0;
  state.isResting = false;
  state.timerSeconds = 0;
  state.preCountdown = 0;
  state.selectedHandRoutine = null;
  state.currentHandExerciseIndex = 0;
}

function loadHandLogs(): HandLog[] {
  try {
    const raw = localStorage.getItem(HAND_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HandLog[];
  } catch {
    return [];
  }
}

function writeHandLogs(logs: HandLog[]): void {
  localStorage.setItem(HAND_STORAGE_KEY, JSON.stringify(logs.slice(0, 200)));
}

function saveHandLog(routine: HandRoutineId): HandLog {
  const entry: HandLog = {
    id: genId(),
    date: new Date().toISOString(),
    routine,
    synced: false,
  };
  const logs = loadHandLogs();
  logs.unshift(entry);
  writeHandLogs(logs);
  return entry;
}

function markHandLogSynced(id: string): void {
  const logs = loadHandLogs();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const entry = logs[idx];
  if (!entry) return;
  logs[idx] = { ...entry, synced: true };
  writeHandLogs(logs);
}

async function pushHandLogToSupabase(entry: HandLog): Promise<boolean> {
  if (syncDisabled()) return false;
  if (!entry.id) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hand_routine_logs`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify([{ id: entry.id, date: entry.date, routine_id: entry.routine }]),
    });
    if (res.ok) {
      markHandLogSynced(entry.id);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function flushPendingSyncs(): Promise<void> {
  if (syncDisabled()) return;
  const pendingLogs = loadLogs().filter((l) => !l.synced && l.id);
  const pendingHand = loadHandLogs().filter((l) => !l.synced && l.id);
  if (pendingLogs.length === 0 && pendingHand.length === 0) {
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
  for (const entry of pendingHand) {
    const ok = await pushHandLogToSupabase(entry);
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
  const pending =
    loadLogs().filter((l) => !l.synced).length + loadHandLogs().filter((l) => !l.synced).length;
  if (state.syncStatus === 'syncing') return 'syncing…';
  if (pending > 0) return `offline · ${pending} pending`;
  if (loadLogs().length === 0 && loadHandLogs().length === 0) return '';
  return 'synced ✓';
}

function getLastHandDone(routine: HandRoutineId): string | null {
  const logs = loadHandLogs();
  const found = logs.find((l) => l.routine === routine);
  return found ? found.date : null;
}

function getHandTodayCount(routine: HandRoutineId): number {
  const logs = loadHandLogs();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return logs.filter((l) => l.routine === routine && new Date(l.date).getTime() >= startOfDay)
    .length;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  return `${diffDay} days ago`;
}

function startHandRoutine(id: HandRoutineId): void {
  state.selectedHandRoutine = id;
  state.currentHandExerciseIndex = 0;
  state.screen = 'hand-routine';
  render();
}

function advanceHandExercise(): void {
  if (!state.selectedHandRoutine) return;
  const routine = HAND_ROUTINES[state.selectedHandRoutine];
  if (state.currentHandExerciseIndex < routine.exercises.length - 1) {
    state.currentHandExerciseIndex += 1;
    render();
  } else {
    let stored: HandLog | null = null;
    if (routine.status === 'active') {
      stored = saveHandLog(routine.id);
    }
    resetState();
    render();
    if (stored) {
      state.syncStatus = 'syncing';
      updateSyncIndicator();
      void pushHandLogToSupabase(stored).then((ok) => {
        state.syncStatus = ok ? 'synced' : 'offline';
        updateSyncIndicator();
      });
    }
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getLast7Days(): { count: number; days: number } {
  const logs = loadLogs();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = logs.filter((l) => new Date(l.date).getTime() > sevenDaysAgo);
  return { count: recent.length, days: 7 };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderHome(): string {
  const logs = loadLogs();
  const { count } = getLast7Days();
  const recentHtml = logs
    .slice(0, 5)
    .map(
      (l) => `
    <div class="history-row">
      <span class="history-workout-badge">${l.workout}</span>
      <div>
        <div class="history-date">${formatDate(l.date)}</div>
        ${l.word ? `<div class="history-word">"${escapeHtml(l.word)}"</div>` : ''}
      </div>
      <div class="history-meta">${l.wallSitSec}s wall sit</div>
    </div>
  `
    )
    .join('');

  return `
    <h1>Workout Tracker</h1>
    <p class="subtitle">Three rotating sessions. Show up 3x/week.</p>
    <div id="sync-indicator" class="sync-indicator sync-${state.syncStatus}">${syncIndicatorText()}</div>

    <div class="card">
      <h3>This week</h3>
      <div class="streak-stat">
        <div class="stat-block">
          <div class="stat-number">${count}</div>
          <div class="stat-label">of 3 done</div>
        </div>
        <div class="stat-block">
          <div class="stat-number">${logs.length}</div>
          <div class="stat-label">total sessions</div>
        </div>
      </div>
    </div>

    <h3>Pick today's workout</h3>
    <div class="workout-picker">
      ${(['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const w = WORKOUTS[id];
          return `
        <button class="workout-card" data-workout="${id}">
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

    <div class="divider"></div>
    <h3>Hand care</h3>
    <div class="workout-picker">
      ${(['left-hand', 'right-hand'] as HandRoutineId[])
        .map((id) => {
          const r = HAND_ROUTINES[id];
          const lastDone = getLastHandDone(id);
          const todayCount = getHandTodayCount(id);
          const lastText = lastDone ? `Last: ${timeAgo(lastDone)}` : 'Not started';
          const statusBadge =
            r.status === 'active'
              ? `<span class="workout-card-badge badge-active">${todayCount}× today</span>`
              : `<span class="workout-card-badge badge-locked">🔒 not yet</span>`;
          return `
        <button class="workout-card hand-card" data-hand="${id}">
          <div class="workout-card-header">
            <span class="workout-card-title">${r.shortName}</span>
            ${statusBadge}
          </div>
          <div class="workout-card-desc">${r.description}</div>
          <div class="hand-card-meta">${r.frequency}${r.status === 'active' ? ` · ${lastText}` : ''}</div>
        </button>
      `;
        })
        .join('')}
    </div>

    ${
      logs.length > 0
        ? `
      <div class="divider"></div>
      <h3>Recent workouts</h3>
      ${recentHtml}
      <div style="margin-top: 12px;">
        <button class="text-link" id="view-history">View all →</button>
      </div>
    `
        : ''
    }
  `;
}

function renderHandRoutine(): string {
  if (!state.selectedHandRoutine) return '';
  const routine = HAND_ROUTINES[state.selectedHandRoutine];
  const ex = routine.exercises[state.currentHandExerciseIndex];
  if (!ex) return '';
  const total = routine.exercises.length;
  const guide = EXERCISE_GUIDE[ex.name];
  const videoUrl = guide
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(guide.videoQuery)}`
    : null;
  const isLastExercise = state.currentHandExerciseIndex === total - 1;
  const nextLabel =
    routine.status === 'active'
      ? isLastExercise
        ? 'Done · Save'
        : 'Done · Next'
      : isLastExercise
        ? 'Done · Back'
        : 'Done · Next';

  return `
    <h2>${routine.shortName}</h2>
    ${
      routine.status === 'locked'
        ? `<div class="warning-banner">🔒 ${routine.lockReason ?? 'Not active yet.'}</div>`
        : `<div class="warning-banner">⚠️ <strong>2/10 pain ceiling, no sharpness.</strong> Stop signs: pain ramps during a hold · lingers >30 min after · new clicking on ulnar side.</div>`
    }
    <div class="progress-text">Exercise ${state.currentHandExerciseIndex + 1} of ${total}</div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${((state.currentHandExerciseIndex + 1) / total) * 100}%"></div>
    </div>

    <div class="card">
      <div class="exercise-display">
        <div class="exercise-phase">${routine.shortName}</div>
        <div class="exercise-name">${ex.name}</div>
        <div class="exercise-reps">${ex.reps ?? ''}</div>
      </div>
    </div>

    ${
      guide
        ? `
      <div class="card how-to-card">
        <div class="how-to-header">📖 How to do it</div>
        <p class="how-to-text">${guide.howTo}</p>
        ${videoUrl ? `<a class="video-link" href="${videoUrl}" target="_blank" rel="noopener noreferrer">🎥 Show me a video</a>` : ''}
      </div>
    `
        : ''
    }

    <div class="btn-row">
      <button id="quit-hand">Quit</button>
      <button class="btn-primary" id="next-hand">${nextLabel}</button>
    </div>
  `;
}

function renderPreLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  return `
    <h2>Workout ${w.id} · ${w.name}</h2>
    <p class="subtitle">Before we start — how do you feel?</p>

    <div class="card">
      <label class="field">
        <span class="label-text">Capacity right now (1-10)</span>
        <div class="range-row">
          <input type="range" id="cap-before" min="1" max="10" value="${state.capacityBefore}" />
          <span class="range-value" id="cap-before-val">${state.capacityBefore}</span>
        </div>
      </label>
    </div>

    <div class="warning-banner">
      ⚠️ Right wrist or back pain at 3/10 → stop that exercise. <strong>Left wrist: 2/10 ceiling, no sharpness</strong> — it's actively healing tendonitis.
    </div>

    <div class="btn-row">
      <button id="back-home">Back</button>
      <button class="btn-primary" id="begin">Start</button>
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
    return `
      <h2>Workout ${w.id}</h2>
      <span class="round-indicator">${phaseLabel}</span>
      <div class="card">
        <div class="rest-display">
          <div class="timer-label">Rest</div>
          <div class="timer-display">${state.timerSeconds}</div>
          <p class="exercise-notes">Breathe. Sip water if you have it.</p>
          <button class="btn-large btn-primary" id="skip-rest">Skip rest</button>
        </div>
      </div>
    `;
  }

  if (!ex) {
    return `<div class="empty">Done!</div>`;
  }

  const showTempo = ex.reps?.includes('3-1-3') ?? false;
  const guide = EXERCISE_GUIDE[ex.name];
  const videoUrl = guide
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(guide.videoQuery)}`
    : null;

  return `
    <h2>Workout ${w.id}</h2>
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
        ${showTempo ? renderTempoBar() : ''}
        ${
          ex.isTimed
            ? state.preCountdown > 0
              ? `
            <div class="timer-label">Get ready</div>
            <div class="timer-display countdown-big">${state.preCountdown}</div>
          `
              : `
            <div class="timer-display">${state.timerSeconds || ex.durationSec || 0}</div>
            <button class="btn-large btn-primary" id="start-timed" ${state.timerSeconds > 0 ? 'disabled' : ''}>${state.timerSeconds > 0 ? 'Running…' : 'Start timer'}</button>
          `
            : ''
        }
      </div>
    </div>

    ${
      guide
        ? `
      <div class="card how-to-card">
        <div class="how-to-header">📖 How to do it</div>
        <p class="how-to-text">${guide.howTo}</p>
        ${videoUrl ? `<a class="video-link" href="${videoUrl}" target="_blank" rel="noopener noreferrer">🎥 Show me a video</a>` : ''}
      </div>
    `
        : ''
    }

    <div class="btn-row">
      <button id="quit">Quit</button>
      <button class="btn-primary" id="next">Done · Next</button>
    </div>
  `;
}

function renderPostLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
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
      </label>

      <label class="field">
        <span class="label-text">Wall sit time held (seconds)</span>
        <input type="number" id="wallsit" min="0" max="600" value="${state.wallSitSec}" />
      </label>

      <label class="field">
        <span class="label-text">Right wrist pain (0-10)</span>
        <div class="range-row">
          <input type="range" id="r-wrist" min="0" max="10" value="${state.rightWristPain}" />
          <span class="range-value" id="r-wrist-val">${state.rightWristPain}</span>
        </div>
      </label>

      <label class="field">
        <span class="label-text">Left wrist pain (0-10)</span>
        <div class="range-row">
          <input type="range" id="l-wrist" min="0" max="10" value="${state.leftWristPain}" />
          <span class="range-value" id="l-wrist-val">${state.leftWristPain}</span>
        </div>
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

    <button class="btn-large btn-primary" id="save-log">Save & finish</button>
  `;
}

function renderHistory(): string {
  const logs = loadLogs();
  if (logs.length === 0) {
    return `
      <h2>History</h2>
      <p class="empty">No sessions yet. Do a workout!</p>
      <div class="btn-row">
        <button id="back-home">Back</button>
      </div>
    `;
  }
  const rowsHtml = logs
    .map(
      (l) => `
    <div class="history-row">
      <span class="history-workout-badge">${l.workout}</span>
      <div>
        <div class="history-date">${formatDate(l.date)}</div>
        <div class="history-meta">cap ${l.capacityBefore}→${l.capacityAfter} · wall ${l.wallSitSec}s · pain R${l.rightWristPain} L${l.leftWristPain} B${l.backPain}</div>
        ${l.word ? `<div class="history-word">"${escapeHtml(l.word)}"</div>` : ''}
      </div>
    </div>
  `
    )
    .join('');
  return `
    <h2>History</h2>
    <div class="card">${rowsHtml}</div>
    <div class="btn-row">
      <button id="back-home">Back</button>
    </div>
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
    case 'hand-routine':
      html = renderHandRoutine();
      break;
  }
  root.innerHTML = html;
  attachHandlers();
}

function attachHandlers(): void {
  document.querySelectorAll<HTMLButtonElement>('.workout-card[data-workout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['workout'] as WorkoutId | undefined;
      if (id) startWorkout(id);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.workout-card[data-hand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['hand'] as HandRoutineId | undefined;
      if (id) startHandRoutine(id);
    });
  });

  bindClick('next-hand', () => {
    advanceHandExercise();
  });

  bindClick('quit-hand', () => {
    resetState();
    render();
  });

  bindClick('view-history', () => {
    state.screen = 'history';
    render();
  });

  bindClick('back-home', () => {
    resetState();
    render();
  });

  bindClick('begin', () => {
    beginExercises();
  });

  bindClick('next', () => {
    advanceExercise();
  });

  bindClick('quit', () => {
    resetState();
    render();
  });

  bindClick('skip-rest', () => {
    skipRest();
  });

  bindClick('start-timed', () => {
    startTimedExercise();
  });

  bindClick('save-log', () => {
    const wallsitEl = document.getElementById('wallsit') as HTMLInputElement | null;
    if (wallsitEl) state.wallSitSec = parseInt(wallsitEl.value, 10) || 0;
    const wordEl = document.getElementById('word') as HTMLInputElement | null;
    if (wordEl) state.word = wordEl.value.trim();
    logCompleteAndHome();
  });

  bindRange('cap-before', 'cap-before-val', (v) => {
    state.capacityBefore = v;
  });
  bindRange('cap-after', 'cap-after-val', (v) => {
    state.capacityAfter = v;
  });
  bindRange('r-wrist', 'r-wrist-val', (v) => {
    state.rightWristPain = v;
  });
  bindRange('l-wrist', 'l-wrist-val', (v) => {
    state.leftWristPain = v;
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
  void flushPendingSyncs();
});
