// day-mode.ts — "Not my best day?" (v74, Nov 11 2026). Pure logic, no DOM.
//
// What this is: the six day modes she can pick on the pre-workout page before Start, and the one
// function that turns today's workout into the version for that day.
//   back | knee | wrist  = a SWAP day: the same workout, 1 round, a few moves swapped
//   cold                 = an EASY day: the 38 path forced, 1 round, an easy ride
//   fever | crohns       = a REST day: no workout (a calm card + "Log rest day")
// Why it exists: her words (Wed Nov 11 2026 15:43): "Ok but he's if I'm ick" (yes to a sick/flare
// button) and 15:49 "figure out how to incorporate this clearly". Design: second-brain
// projects/workout-tracker/R3-PLAN-2026-11-11.md "v74 DESIGN". The research behind every rule and
// every card word: self/health/research-2026-11-11-workout/README.md §11 (flare swaps) and §12
// (sick days). No medical advice beyond it.
// What's decided: only a Round 3 A/B/C (a workout with `paths`) has the button; D and Round 2 never do.
// Nothing is ever auto-selected: a low body reading may only SUGGEST it (a gentle outline).
// A swapped move keeps its NAME (the detail card, voice note, history and move_feel slug key off it)
// unless it becomes a different move (Wall sit, Glute bridges, or one of the three new variant cards).
// What's next: nothing queued. Links: paths.ts (the path cut this runs after), workout-now.ts
// (getCurrentWorkout calls applyDayMode), migrations/2026-11-11-v74-day-mode.sql.

import { R3_RIDE_NOTE, type Exercise, type PathId, type Workout } from './program.js';
import type { DayMode, LogEntry, RestDay } from './types.js';

export type { DayMode };
export type SwapMode = 'back' | 'knee' | 'wrist';

export const DAY_MODES: readonly DayMode[] = ['back', 'knee', 'wrist', 'cold', 'fever', 'crohns'];

export function isDayMode(v: unknown): v is DayMode {
  return typeof v === 'string' && (DAY_MODES as readonly string[]).includes(v);
}
export function isSwapMode(m: DayMode | null): m is SwapMode {
  return m === 'back' || m === 'knee' || m === 'wrist';
}
/** A rest day: no workout. */
export function isRestMode(m: DayMode | null): m is 'fever' | 'crohns' {
  return m === 'fever' || m === 'crohns';
}
/** A day that makes the next few workouts easy: a logged EASY day or REST day. */
export function isSickMode(m: DayMode | null): boolean {
  return m === 'cold' || isRestMode(m);
}

/** The six buttons, in the sheet's three rows. */
export const DAY_MODE_ROWS: readonly { title: string; modes: readonly DayMode[] }[] = [
  { title: 'Sore today', modes: ['back', 'knee', 'wrist'] },
  { title: 'Under the weather', modes: ['cold'] },
  { title: 'Rest today', modes: ['fever', 'crohns'] },
];

export const DAY_MODE_LABEL: Record<DayMode, string> = {
  back: 'Back',
  knee: 'Knee',
  wrist: 'Wrist',
  cold: 'A cold, no fever',
  fever: 'Fever / body aches / chest cough / stomach bug',
  crohns: "Crohn's flare",
};

/** Short word for a history row / the line on the workout screen. */
export const DAY_MODE_SHORT: Record<DayMode, string> = {
  back: 'Sore back day',
  knee: 'Sore knee day',
  wrist: 'Sore wrist day',
  cold: 'Easy day (a cold)',
  fever: 'Rest day (fever / stomach bug)',
  crohns: "Rest day (Crohn's flare)",
};

// ---- the words (research §11 + §12; her design) ----

export const SWAP_NOTE = 'About half your usual reps · effort 5–6 · your pain rule';

export const EASY_CARD =
  'No fever, nothing in your chest, feel OK once warm? Easy session. Stop if you feel worse.';

export const REST_CARD_FEVER =
  "Rest today. Back once you've had 24 hours with no fever, without fever medicine.";

export const REST_CARD_CROHNS =
  'A gentle walk only if you feel up to it. Drink with electrolytes, not just water. Dizzy, dark pee or cramps → no exercise.';

export const SEE_A_DOCTOR_TITLE = 'See a doctor if…';
export const SEE_A_DOCTOR: readonly string[] = [
  'chest pain or tightness',
  'racing or pounding heart',
  'breathless out of proportion',
  'faint or dizzy',
  'fever coming back',
  'a crash 1–2 days after exercise',
];

/** Swap-day card: a calm "Get checked if…" list by mode (research §11). Not orders. */
export const GET_CHECKED_TITLE = 'Get checked if…';
export const GET_CHECKED: Record<SwapMode, readonly string[]> = {
  back: [
    'new leg weakness or numbness',
    'a change in bladder or bowel, or a numb saddle area',
    'back pain that stays at night or at rest',
    'fever with new back pain',
  ],
  knee: ['the knee locks', "you can't put weight on it", 'big swelling (or swelling with a fever)'],
  wrist: [
    'numbness or tingling',
    'a new lump or deformity',
    "you can't bear any load after an injury",
  ],
};

/** Optional Hammer curl on a wrist day: the top line (not a "Swapped for…" line). */
export const WRIST_CURL_LINE = 'Sore wrist today: skip it, or go lighter';

export const COMING_BACK_LINE = 'Coming back from being sick: easy for 2–3 workouts';
/** How many workouts after a logged EASY / REST day open with the 38 path pre-picked. */
export const COMING_BACK_SESSIONS = 3;

export const EASY_RIDE_NOTE = 'Easy — short sentences or easier.';
const BACK_RIDE_NOTE = `${R3_RIDE_NOTE} If standing tall hurts, use the walk lane for 5–10 min instead.`;
const KNEE_RIDE_NOTE =
  'Walk on flat ground at an easy pace, talking in short sentences. The elliptical sits this one out.';
/** Every text the ride step can carry as a note (screens/workout.ts shows it under the ride). */
export const RIDE_NOTES: readonly string[] = [
  R3_RIDE_NOTE,
  EASY_RIDE_NOTE,
  BACK_RIDE_NOTE,
  KNEE_RIDE_NOTE,
];

/** The path in force: an EASY day forces 38; otherwise her tap (null = not picked). */
export function pathInForce(sessionPath: PathId | null, mode: DayMode | null): PathId | null {
  return mode === 'cold' ? '38' : sessionPath;
}

// ---- the three new variant cards (the only new cards in v74) ----

export const WALL_PUSHUP_FOREARMS = 'Wall push-up on forearms';
export const BIRD_DOG_FOREARMS = 'Bird dog on forearms';
export const HIP_HINGE_WALL = 'Hip hinge, no weight, hands on the wall';
export const DAY_MODE_NEW_CARDS: readonly string[] = [
  WALL_PUSHUP_FOREARMS,
  BIRD_DOG_FOREARMS,
  HIP_HINGE_WALL,
];

const PAIN_RULE =
  'A little pain is OK. Above your usual, hold. Sharp, climbing, or still there tomorrow, step back.';

const WALL_PUSHUP_EX: Exercise = {
  name: WALL_PUSHUP_FOREARMS,
  reps: '8–12 · forearms flat on the wall',
  notes:
    'Stand an arm and a half from a wall. Forearms flat on the wall at shoulder height, elbows under the shoulders, fingers up. Lean in, then press back out. Body in one line. No weight through the hands. ' +
    PAIN_RULE,
};
const BIRD_DOG_FOREARMS_EX: Exercise = {
  name: BIRD_DOG_FOREARMS,
  reps: '6–8 each side · 3-sec hold',
  notes:
    'On hands and knees, but resting on your forearms, elbows under the shoulders. Opposite arm and leg reach out together, level with your body. Hold 3 sec, switch. Hips square, neck long. ' +
    PAIN_RULE,
};
const HIP_HINGE_WALL_EX: Exercise = {
  name: HIP_HINGE_WALL,
  reps: '10–15 · no weight',
  notes:
    'Stand facing a wall, an arm and a half away. Hands on the wall at hip height. Soft knees. Push the hips back, flat back, until you feel the hamstrings. Squeeze the glutes to stand. Do NOT round the low back. ' +
    PAIN_RULE,
};
const GLUTE_BRIDGES_EX: Exercise = {
  name: 'Glute bridges',
  reps: '12–15 reps · 2-sec hold at top',
};
const wallSit = (reps: string, safety: string): Exercise => ({
  name: 'Wall sit',
  reps,
  notes: 'Hands rest on thighs or hang. No pushing on wall.',
  durationSec: 20,
  isTimed: true,
  safety,
});

// ---- the swap table (design: "SWAP day") ----

type Swap = (ex: Exercise, w: Workout) => Exercise | null;

const line = (mode: SwapMode, text: string): string => `Swapped for your ${mode} today: ${text}`;

/** The same card, a different version today: the NAME stays, a label + a top line change. */
function sameCard(
  ex: Exercise,
  mode: SwapMode,
  label: string | null,
  swapText: string,
  over: Partial<Exercise>
): Exercise {
  return { ...ex, ...(label ? { label } : {}), ...over, swap: line(mode, swapText) };
}

const SWAPS: Record<SwapMode, Record<string, Swap>> = {
  back: {
    'Bodyweight hip hinge': (ex, w) =>
      w.main.some((m) => m.name === 'Glute bridges')
        ? { ...HIP_HINGE_WALL_EX, swap: line('back', `${HIP_HINGE_WALL} instead of ${ex.name}`) }
        : { ...GLUTE_BRIDGES_EX, swap: line('back', `Glute bridges instead of ${ex.name}`) },
    'Chair squat': (ex) =>
      sameCard(
        ex,
        'back',
        'Chair squat, higher seat',
        'a higher seat and a shorter range instead of the usual chair squat.',
        { reps: '10–15 · higher seat · shorter range · no weight' }
      ),
    'Supported split squat': (ex) => ({
      ...wallSit(
        '20 sec hold · comfortable angle',
        'Only as low as is comfortable. No pushing on the wall.'
      ),
      swap: line('back', `Wall sit (comfortable angle) instead of ${ex.name}`),
    }),
  },
  knee: {
    'Chair squat': (ex) =>
      sameCard(
        ex,
        'knee',
        'Chair squat, half depth',
        'half depth instead of the usual chair squat.',
        { reps: '10–15 · half depth · no weight' }
      ),
    'Supported split squat': (ex) => ({
      ...wallSit(
        '20 sec hold · shallow, pain-free',
        'Shallow and pain-free. No pushing on the wall.'
      ),
      swap: line('knee', `Wall sit (shallow, pain-free) instead of ${ex.name}`),
    }),
  },
  wrist: {
    'Incline push-up on fists': (ex) => ({
      ...WALL_PUSHUP_EX,
      swap: line('wrist', `${WALL_PUSHUP_FOREARMS} instead of ${ex.name}`),
    }),
    'Bird dog': (ex) => ({
      ...BIRD_DOG_FOREARMS_EX,
      swap: line('wrist', `${BIRD_DOG_FOREARMS} instead of ${ex.name}`),
    }),
    'Hammer curl': (ex) => ({ ...ex, swap: WRIST_CURL_LINE }),
    'Floor press': (ex) =>
      sameCard(ex, 'wrist', null, 'thumbs in, lighter or no weight instead of the usual weight.', {
        reps: '10–15 · thumbs in · lighter or no weight',
      }),
    'Band row': (ex) =>
      sameCard(ex, 'wrist', null, 'a loose grip instead of a firm one.', {
        reps: '10–15 · thumbs up · loose grip',
      }),
    'One-arm dumbbell row': (ex) =>
      sameCard(ex, 'wrist', null, 'a loose grip instead of a firm one.', {
        reps: '10–12 each side · lighter · loose grip',
      }),
  },
};

function rideFor(mode: DayMode, ex: Exercise): Exercise {
  if (ex.name !== 'Outdoor walk') return ex;
  if (mode === 'cold') return { ...ex, notes: EASY_RIDE_NOTE };
  if (mode === 'back') return { ...ex, notes: BACK_RIDE_NOTE };
  if (mode === 'knee') {
    return {
      ...ex,
      notes: KNEE_RIDE_NOTE,
      swap: line('knee', 'the walk lane instead of the elliptical, same minutes, flat ground.'),
    };
  }
  return ex;
}

/**
 * Today's workout for `mode`. Run AFTER paths.ts has cut the workout to her path.
 * null / a rest mode → the very same object (a rest day has no workout to change).
 * cold / back / knee / wrist → a copy with 1 round; swap modes also swap the moves in the table.
 */
export function applyDayMode(w: Workout, mode: DayMode | null): Workout {
  if (mode === null || isRestMode(mode) || !w.paths) return w;
  const table = isSwapMode(mode) ? SWAPS[mode] : {};
  const swapMain = (list: Exercise[]): Exercise[] =>
    list.map((ex) => table[ex.name]?.(ex, w) ?? ex);
  return {
    ...w,
    rounds: 1,
    warmup: w.warmup.map((ex) => rideFor(mode, ex)),
    main: swapMain(w.main),
  };
}

/** The one line on the workout screen and the pre-workout card for a working (non-rest) day. */
export function dayModeNote(mode: DayMode | null): string {
  if (isSwapMode(mode)) return `${DAY_MODE_SHORT[mode]} · ${SWAP_NOTE}`;
  if (mode === 'cold') return `${DAY_MODE_SHORT[mode]} · 38 min path · 1 round · effort 5–6`;
  return '';
}

// ---- coming back (automatic, overridable) ----

const isWorkoutLog = (l: LogEntry): boolean =>
  l.workout === 'A' || l.workout === 'B' || l.workout === 'C';

/**
 * After a logged EASY day or REST day, the next COMING_BACK_SESSIONS workouts open with the 38 path
 * pre-picked. It stops early if she chose another path on one of them (that is her call), and it
 * never turns itself on without a logged sick day.
 */
export function comingBackActive(logs: readonly LogEntry[], restDays: readonly RestDay[]): boolean {
  const sickTimes = [
    ...logs.filter((l) => l.dayMode === 'cold').map((l) => new Date(l.date).getTime()),
    ...restDays.map((r) => new Date(r.date).getTime()),
  ].filter((t) => Number.isFinite(t));
  if (sickTimes.length === 0) return false;
  const since = Math.max(...sickTimes);
  const after = logs.filter((l) => isWorkoutLog(l) && new Date(l.date).getTime() > since);
  return after.length < COMING_BACK_SESSIONS && after.every((l) => l.sessionPath === '38');
}
