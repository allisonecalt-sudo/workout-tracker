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
  date: string;
  workout: WorkoutId;
  capacityBefore: number;
  capacityAfter: number;
  wallSitSec: number;
  rightWristPain: number;
  leftWristPain: number;
  backPain: number;
  word: string;
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
  date: string;
  routine: HandRoutineId;
};

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
  selectedHandRoutine: HandRoutineId | null;
  currentHandExerciseIndex: number;
};

const STORAGE_KEY = 'workout-tracker:logs';
const HAND_STORAGE_KEY = 'workout-tracker:hand-logs';
const REST_SEC = 60;

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
      'Lie on your back, knees bent. Breathe in through your nose so your belly rises (not your chest). Exhale long and slow through your mouth.',
    videoQuery: 'diaphragmatic belly breathing exercise',
  },
  'Knee-to-chest hugs': {
    howTo:
      'On your back, bend one knee and slowly draw the thigh toward your chest. Hook your forearm behind the thigh — no gripping with hands.',
    videoQuery: 'single knee to chest stretch',
  },
  'Pelvic tilts': {
    howTo:
      'On your back, knees bent, feet flat. Gently flatten your lower back into the mat by tilting your pelvis. Release to neutral. Small movement.',
    videoQuery: 'supine pelvic tilt exercise lower back',
  },
  'Knee drops side-to-side': {
    howTo:
      'On your back, knees bent, feet hip-width apart. Slowly drop both knees a small distance to one side, return to center, then the other side.',
    videoQuery: 'supine knee drops mobility exercise',
  },
  'Glute squeezes': {
    howTo:
      'On your back, lightly tighten your butt muscles. Hold 3 seconds, fully relax. That is one rep.',
    videoQuery: 'glute squeeze isometric exercise',
  },
  'Bodyweight squats': {
    howTo:
      'Feet hip- to shoulder-width. 3 seconds down into a comfortable squat (no need for deep), 1 sec pause, 3 sec up. Arms crossed over chest.',
    videoQuery: 'bodyweight squat slow tempo proper form',
  },
  'Glute bridges': {
    howTo:
      'On your back, knees bent, feet flat, arms at sides. Squeeze glutes and lift hips to a comfortable height. Hold 2 sec at top. Lower slow.',
    videoQuery: 'glute bridge exercise form beginner',
  },
  'Wall sit': {
    howTo:
      'Back flat against a wall. Slide down until knees are at 90-120 degrees (whatever feels safe). Hands rest on thighs. Hold.',
    videoQuery: 'wall sit exercise proper form',
  },
  'Side-lying clamshells': {
    howTo:
      'Lie on your side, knees bent ~90 degrees, hips stacked. Head on mat (or pillow) — DO NOT prop on your forearm. Open top knee like a clam, close with control.',
    videoQuery: 'side lying clamshell glute exercise',
  },
  'Modified dead bug': {
    howTo:
      'On your back, hips and knees at 90 degrees (tabletop). Arms relaxed flat at sides. Slowly extend ONE leg out to hover above the floor, return, switch sides.',
    videoQuery: 'dead bug exercise beginner legs only',
  },
  'Heel taps': {
    howTo:
      'On your back, knees bent, feet flat near your butt. Slowly tap one heel to the floor (or extend out further), return, alternate sides. Slow and controlled.',
    videoQuery: 'lying heel tap ab exercise',
  },
  'Knees-to-chest hold': {
    howTo:
      'On your back, gently bring both thighs toward your chest. Forearms can rest behind thighs — no pulling with hands. Hold and breathe.',
    videoQuery: 'double knee to chest stretch',
  },
  'Figure-4 stretch': {
    howTo:
      'On your back, cross right ankle over left knee. Let the hip open. Optionally use forearms (not hands) to draw the bottom leg closer for more stretch.',
    videoQuery: 'figure 4 stretch supine',
  },
  'Seated forward fold': {
    howTo:
      'Sit with legs extended (slight knee bend ok). Arms in lap. Hinge forward gently from the hips until you feel a light stretch. No reaching with hands.',
    videoQuery: 'seated forward fold hamstring stretch',
  },
  'Slow breathing': {
    howTo:
      'Same as belly breathing — slow inhale through nose, longer exhale through mouth. 8 rounds to wind down.',
    videoQuery: 'slow breathing relaxation exercise',
  },
  'Side-lying leg raises': {
    howTo:
      'On your side, bottom leg bent for stability, top leg straight. Slowly lift top leg ~30-45 degrees, lower with control. Head on mat — no propping forearm.',
    videoQuery: 'side lying leg raise exercise',
  },
  'Single-leg glute bridges': {
    howTo:
      'Same as glute bridge but with one foot lifted (knee tucked toward chest or leg straight). Squeeze glutes, lift hips, hold 2 sec. Switch legs.',
    videoQuery: 'single leg glute bridge form',
  },
  'Slow supine bicycle': {
    howTo:
      'On your back, hands relaxed at sides (NO hands behind head). Bring one knee up, slowly extend it out as the other knee comes in. Slow alternating.',
    videoQuery: 'supine bicycle exercise slow no hands behind head',
  },
  'Standing calf raises': {
    howTo:
      'Stand with feet hip-width. Light fingertip touch on a wall for balance — NO grip, NO weight on hand. Lift heels, slow lower.',
    videoQuery: 'standing calf raise exercise',
  },
  'Outdoor walk': {
    howTo:
      'Conversational pace — you can talk in full sentences. 20 minutes outdoors. Tap done when you finish.',
    videoQuery: 'walking exercise pace',
  },
  'Left tendon glides': {
    howTo:
      'Cycle slowly through 5 hand positions on your LEFT hand: STRAIGHT (fingers extended) → HOOK (knuckles straight, fingers curled) → FIST (full curl) → TABLETOP (knuckles bent, fingers straight) → STRAIGHT FIST (fingers folded onto palm with knuckles straight). Hold each shape for 1-2 sec. Slow, no pain. 5-10 full cycles.',
    videoQuery: 'tendon glide exercise hand therapy 5 positions',
  },
  'Left wrist circles': {
    howTo:
      'Hold your LEFT hand out, no load. Make slow gentle circles with the wrist. 5 clockwise, 5 counterclockwise. Stop if any sharp pain.',
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
      'Hand open. Gently close into a soft fist as if grabbing a ponytail (no real squeeze yet). Hold 5 sec. Open fully. 10 reps.',
    videoQuery: 'ponytail grip hand therapy exercise',
  },
  'Bottle lift — pronated': {
    howTo:
      'Shoulder at 90° abduction (arm out to your side at shoulder height). Wrist NEUTRAL. Hold a light bottle with palm facing DOWN. Lift the bottle up and down (small range). 10 reps.',
    videoQuery: 'wrist bottle lift exercise rehabilitation',
  },
  'Bottle lift — supinated': {
    howTo:
      'Same setup as pronated, but palm facing UP. Lift the bottle up and down. 10 reps. Stay slow and controlled.',
    videoQuery: 'wrist supination strengthening bottle',
  },
  'Tennis elbow isometric': {
    howTo:
      'Elbow flexed (bent at ~90°). Wrist neutral. Press the back of your hand DOWN against resistance (your other hand or a table edge). Hold 10 sec. Multiple reps as Eliana recommends.',
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
  selectedHandRoutine: null,
  currentHandExerciseIndex: 0,
};

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

function saveLog(entry: LogEntry): void {
  const logs = loadLogs();
  logs.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 50)));
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
    if (state.timerSeconds <= 0) {
      clearTimer();
      state.timerSeconds = 0;
      onComplete();
    }
    render();
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
  startTimer(ex.durationSec, () => {
    if (ex.name === 'Wall sit') {
      state.wallSitSec = Math.max(state.wallSitSec, ex.durationSec ?? 0);
    }
  });
}

function logCompleteAndHome(): void {
  if (!state.selectedWorkout) return;
  saveLog({
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

function saveHandLog(routine: HandRoutineId): void {
  const logs = loadHandLogs();
  logs.unshift({ date: new Date().toISOString(), routine });
  localStorage.setItem(HAND_STORAGE_KEY, JSON.stringify(logs.slice(0, 200)));
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
    if (routine.status === 'active') {
      saveHandLog(routine.id);
    }
    resetState();
    render();
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
        : ''
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
      ⚠️ If wrist or back pain hits 3/10 during, stop that exercise.
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
            ? `
          <div class="timer-display">${state.timerSeconds || ex.durationSec || 0}</div>
          <button class="btn-large btn-primary" id="start-timed">${state.timerSeconds > 0 ? 'Running…' : 'Start timer'}</button>
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

document.addEventListener('DOMContentLoaded', render);
