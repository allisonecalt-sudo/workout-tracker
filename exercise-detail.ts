// exercise-detail.ts — the enriched, low-overwhelm per-exercise detail card
// (Allison Jul 9 2026).
//
// WHY this exists (separate from exercise-howto.ts): her Jul-7 voice notes asked
// for every exercise to carry a proper breakdown — numbered form steps, do/don't,
// common mistakes, a muscle-target picture, and a playable voice note. But she
// then set the hard constraint that governs the whole design:
//   "if cards have too much im gonna get overwhelmed... show whats important...
//    everything else i click to open."  (memory feedback_cards_show_important_dropdown_rest)
// So the card face shows ONLY the important, low-reading things — the ▶ voice
// note and the muscle-target picture — and Steps / Do & Don't / Common mistakes
// are each a COLLAPSED dropdown she opens on tap.
//
// CONTENT SOURCING: every cue here is derived from the already-vetted
// EXERCISE_GUIDE / EXERCISE_HOWTO text in app.ts — no new clinical claims. Her
// standing constraints are preserved verbatim (no hand/palm load — wrist stays
// out; knee pain ceiling; tall chest / flat back).
//
// VOICE NOTES: pre-generated with edge-tts (en-US-AvaMultilingualNeural — the
// same voice Claude speaks her notes in; her call Jul 9: "no i want your voice").
// MP3s live in ./assets/voice/<slug>.mp3, committed + shell-cached for offline
// gym use. The spoken script is kept in `voiceScript` so it's regenerable.
//
// ROLLOUT: this file starts with two exemplars (Bodyweight squats + the
// previously-bare Eccentric step-down) to validate the format on the live app
// before fanning the card out to all ~50 exercises.

export interface ExerciseMistake {
  mistake: string;
  fix: string;
}

export interface ExerciseDetail {
  exercise: string;
  /** Path to the pre-generated voice-note MP3 (relative to index.html). */
  voiceSrc: string;
  /** The spoken script — kept so the MP3 can be regenerated deterministically. */
  voiceScript: string;
  /** Muscle regions to highlight in the target diagram (see MUSCLE_REGIONS). */
  muscles: MuscleRegion[];
  /** Human label for the target, e.g. "Quads, glutes, core". */
  muscleLabel: string;
  /** Numbered form steps — concise, one action each. */
  steps: string[];
  dos: string[];
  donts: string[];
  mistakes: ExerciseMistake[];
}

// ---------- muscle-target diagram ----------
// A simple front-facing body silhouette. Target muscles light up in the accent
// color; everything else stays muted. Deliberately schematic — glanceability on
// a phone shelf beats anatomical precision (same philosophy as exercise-howto).

// The diagram is a body-AREA cue, not a precise anatomy chart — the muscleLabel
// text carries the exact target. So a few regions light the nearest visible
// area (e.g. 'back' lights the shoulder yoke on a front view; 'forearms' lights
// the arms for wrist work). Glanceability beats precision, same as
// exercise-howto's stick figures.
export type MuscleRegion =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'back' // upper-back work — lit at the shoulder yoke on this front view
  | 'forearms' // arms/wrist work (tuna-can, wall lean, curls, prone row)
  | 'core'
  | 'hips' // hip flexors / hip mobility
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

const MUSCLE_BASE = '#525c54'; // muted body fill
const MUSCLE_ON = 'var(--accent)'; // highlighted target

export function muscleDiagram(regions: MuscleRegion[]): string {
  const on = new Set(regions);
  const lit = (...rs: MuscleRegion[]): boolean => rs.some((r) => on.has(r));
  const fill = (...rs: MuscleRegion[]): string => (lit(...rs) ? MUSCLE_ON : MUSCLE_BASE);
  // viewBox 0 0 120 200, front view, arms at sides.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" class="muscle-svg" role="img" aria-label="Muscle target">
    <!-- head -->
    <circle cx="60" cy="20" r="12" fill="${MUSCLE_BASE}" />
    <!-- neck -->
    <rect x="55" y="31" width="10" height="8" rx="3" fill="${fill('neck')}" />
    <!-- shoulders (also lit for upper-back work) -->
    <rect x="38" y="39" width="44" height="12" rx="6" fill="${fill('shoulders', 'back')}" />
    <!-- chest -->
    <rect x="43" y="52" width="34" height="16" rx="6" fill="${fill('chest')}" />
    <!-- core / abdomen -->
    <rect x="45" y="69" width="30" height="26" rx="6" fill="${fill('core')}" />
    <!-- arms / forearms -->
    <rect x="30" y="41" width="8" height="52" rx="4" fill="${fill('forearms')}" />
    <rect x="82" y="41" width="8" height="52" rx="4" fill="${fill('forearms')}" />
    <!-- hips / glutes -->
    <rect x="44" y="96" width="32" height="16" rx="6" fill="${fill('glutes', 'hips')}" />
    <!-- thighs / quads -->
    <rect x="45" y="113" width="14" height="40" rx="6" fill="${fill('quads')}" />
    <rect x="61" y="113" width="14" height="40" rx="6" fill="${fill('quads')}" />
    <!-- hamstrings share the thigh block visually; a lower-thigh cue -->
    ${
      on.has('hamstrings')
        ? `<rect x="45" y="133" width="14" height="20" rx="6" fill="${MUSCLE_ON}" opacity="0.85" />
           <rect x="61" y="133" width="14" height="20" rx="6" fill="${MUSCLE_ON}" opacity="0.85" />`
        : ''
    }
    <!-- calves -->
    <rect x="46" y="156" width="12" height="34" rx="6" fill="${fill('calves')}" />
    <rect x="62" y="156" width="12" height="34" rx="6" fill="${fill('calves')}" />
  </svg>`;
}

// ---------- the detail data ----------

export const EXERCISE_DETAIL: Record<string, ExerciseDetail> = {
  'Bodyweight squats': {
    exercise: 'Bodyweight squats',
    voiceSrc: './assets/voice/bodyweight-squats.mp3',
    voiceScript:
      "Bodyweight squats. Feet about hip to shoulder width, toes turned slightly out, arms crossed over your chest. Lower down slowly, taking three seconds, into a comfortable depth. You don't need to go deep. Your knees can stay above ninety degrees. Pause one second at the bottom, then stand back up over three seconds. Breathe in on the way down, out on the way up. The main thing to get right: push your knees out toward your pinky toes so they don't cave inward, and stay tall through your chest. If your balance wobbles, stand near a wall and let your shoulder lightly touch it, not your hand. And never push past today's knee pain ceiling. Slow and controlled beats deep and fast.",
    muscles: ['quads', 'glutes', 'core'],
    muscleLabel: 'Quads, glutes, core',
    steps: [
      'Feet hip- to shoulder-width, toes slightly out, arms crossed over your chest.',
      'Lower for 3 seconds into a comfortable depth — knees can stay above 90°.',
      'Pause 1 second at the bottom.',
      'Stand back up over 3 seconds.',
      'Inhale on the way down, exhale on the way up.',
    ],
    dos: [
      'Push your knees out toward your pinky toes.',
      'Stay tall through your chest.',
      'Spread your weight across your whole foot — heel, big-toe base, and pinky-toe base.',
    ],
    donts: [
      "Don't let your knees cave inward.",
      "Don't grip a wall — a light shoulder-touch only if balance wobbles.",
      "Don't push past today's knee pain ceiling.",
    ],
    mistakes: [
      {
        mistake: 'Knees collapsing inward',
        fix: 'Actively push them out toward your pinky toes as you lower.',
      },
      {
        mistake: 'Chest dropping forward',
        fix: 'Cross your arms and stay tall — lead with the chest.',
      },
      {
        mistake: 'Gripping a wall for balance',
        fix: 'Stand near a wall and let your shoulder lightly touch — never your hand.',
      },
    ],
  },

  'Eccentric step-down': {
    exercise: 'Eccentric step-down',
    voiceSrc: './assets/voice/eccentric-step-down.mp3',
    voiceScript:
      'Eccentric step-down. This is the single best move for protecting your knees going downhill on a hike. Stand on a low, sturdy step, like a single stair or a thick book. Put your whole weight on one leg on the step, and let the other foot hang just off the edge. Now slowly lower the hanging heel toward the floor, taking three to four full seconds. Your standing thigh is doing all the controlling. Lightly tap the floor, or just hover, then push back up through the standing leg. A fingertip on a wall for balance is fine, but no gripping and no weight through your hand. Your wrist stays completely out of this. Keep your standing knee pointing over your toes, not caving in. Start with a low step and a small range. The magic is the slow lowering, not the height. Stop the set if the knee pinches.',
    muscles: ['quads'],
    muscleLabel: 'Quads (eccentric control)',
    steps: [
      'Stand on a low, sturdy step — a single stair or a thick book.',
      'Put your whole weight on ONE leg on the step; let the other foot hang off the edge.',
      'Slowly lower the hanging heel toward the floor over 3–4 seconds.',
      'Lightly tap the floor (or just hover), then push back up through the standing leg.',
    ],
    dos: [
      'Let the standing thigh do all the controlling — slow is the whole point.',
      'Keep the standing knee pointing over your toes.',
      'Start with a low step and a small range.',
    ],
    donts: [
      'No gripping and no weight through your hand — your wrist stays out of this.',
      "Don't let the standing knee cave inward.",
      "Don't chase height — the magic is the slow lowering, not the depth.",
    ],
    mistakes: [
      {
        mistake: 'Dropping down fast',
        fix: 'Count 3–4 full seconds on the way down — the eccentric lowering is the exercise.',
      },
      {
        mistake: 'Leaning on your hand for balance',
        fix: 'A fingertip on the wall only — no grip, no weight through the wrist.',
      },
      {
        mistake: 'Knee pinching',
        fix: 'Stop the set — lower the step height and reduce the range.',
      },
    ],
  },
  // ===== AUTO-GENERATED (workflow) — 45 exercises, verified =====
  '1 kg biceps curl': {
    exercise: '1 kg biceps curl',
    voiceSrc: './assets/voice/1-kg-biceps-curl.mp3',
    voiceScript:
      "This is the one kilogram biceps curl. Hold the weight lightly with your elbow tucked at your side and your forearm hanging straight down. Keep your wrist and fingers neutral and straight the whole time. Curl the forearm up toward your shoulder, keeping the elbow pinned in place, so only the forearm moves. Then lower slowly under control. Two sets of twelve. The main cue: hold light and stay controlled. The main don't: don't let the wrist bend back, and don't swing your body for momentum. One safety note: loaded arm work like this is on hold until Lisa clears it, so only do it once she says you're ready.",
    muscles: ['forearms'],
    muscleLabel: 'Biceps (arm)',
    steps: [
      'Hold the 1 kg lightly, elbow tucked at your side, forearm hanging down, wrist and fingers neutral and straight.',
      'Curl the forearm up toward your shoulder, keeping the elbow pinned in place so only the forearm moves.',
      'Lower slowly under control.',
      '2 sets of 12. Stop on any wrist signal.',
    ],
    dos: [
      'Hold the weight lightly, wrist and fingers neutral',
      'Keep the elbow tucked and pinned at your side',
      'Lower slow and controlled',
      'Stop on any wrist signal',
    ],
    donts: [
      "Don't let the wrist bend back or hyperextend",
      "Don't swing the body for momentum",
      "Don't let the elbow drift forward",
      "Don't over-grip or go too heavy",
    ],
    mistakes: [
      {
        mistake: 'Swinging the body or the elbow drifting forward for momentum.',
        fix: "Keep the elbow pinned and go slow and controlled — that's the work.",
      },
      {
        mistake: 'Over-gripping or too-heavy, which makes the wrist bend back.',
        fix: 'Hold lightly with a neutral wrist — lighter is right.',
      },
    ],
  },
  'Belly breathing': {
    exercise: 'Belly breathing',
    voiceSrc: './assets/voice/belly-breathing.mp3',
    voiceScript:
      "Belly breathing. Lie on your back with your knees bent and feet flat, and let your arms rest relaxed at your sides. Breathe in through your nose for four seconds, and let your belly rise while your chest stays still. Then breathe out slowly through your mouth for six seconds, longer than the inhale, and feel your belly settle flat. The main thing here: let your belly lead, not your chest. Don't put any weight on your palms — keep your arms loose. If your chest starts rising instead, slow down and put less effort into the inhale. Take five to eight slow breaths.",
    muscles: ['core'],
    muscleLabel: 'Diaphragm / core',
    steps: [
      'Lie on your back, knees bent, feet flat.',
      'Rest your arms at your sides — no weight on your hands.',
      'Inhale through your nose for 4 seconds — let your belly rise while your chest stays still.',
      'Exhale slowly through your mouth for 6 seconds, letting your belly settle flat.',
      'Repeat for 5 to 8 slow breaths.',
    ],
    dos: [
      'Let your belly rise, not your chest — the diaphragm leads.',
      'Keep the exhale slow and longer than the inhale.',
      'Keep your arms relaxed at your sides.',
    ],
    donts: [
      "Don't put weight on your palms — arms relaxed at your sides.",
      "Don't rush the exhale.",
      "Don't let your chest rise instead of your belly.",
    ],
    mistakes: [
      {
        mistake: 'Chest rises instead of the belly — breathing too shallow.',
        fix: 'Slow down and put less effort into the inhale so the belly leads.',
      },
      {
        mistake: 'Rushing the exhale.',
        fix: 'Make the exhale longer than the inhale — about 6 seconds.',
      },
    ],
  },
  'Biceps stretch — left': {
    exercise: 'Biceps stretch — left',
    voiceSrc: './assets/voice/biceps-stretch-left.mp3',
    voiceScript:
      "Biceps stretch, left side. Stand sideways to a wall with your left arm nearest it. Raise that arm to shoulder height, turn the palm up, and place it flat on the wall with your fingers spread. Now slowly turn your body away from the wall until you feel the stretch in your biceps and the front of your shoulder. Hold for about forty-five seconds and keep breathing. Remember, this is not a wrist stretch, so don't force the wrist back and don't rotate the palm down. Keep the wrist comfortable — if it complains, bend the elbow slightly, or just stop. Never push through wrist pain.",
    muscles: ['shoulders'],
    muscleLabel: 'Biceps + front of shoulder',
    steps: [
      'Stand sideways to a wall with your left arm nearest to it.',
      'Raise your left arm to shoulder height and rotate the palm up.',
      'Place the palm flat on the wall with your fingers spread.',
      'Slowly turn your body away from the wall until you feel the biceps stretch.',
      'Hold for about 45 seconds and keep breathing.',
    ],
    dos: [
      'Keep the palm flat at shoulder height, fingers spread.',
      'Turn away from the wall until you feel it in the biceps and front of the shoulder.',
      'Keep the wrist comfortable and breathe steadily.',
    ],
    donts: [
      "Don't force the wrist back — this isn't a wrist stretch.",
      "Don't rotate the palm down.",
      "Don't push through wrist pain — stop if it hurts.",
    ],
    mistakes: [
      {
        mistake: 'Treating it like a wrist stretch and forcing the wrist backward.',
        fix: 'Keep the wrist neutral and comfortable; feel the stretch in the biceps, not the wrist.',
      },
      {
        mistake: 'The wrist complains as you turn away from the wall.',
        fix: 'Bend the elbow slightly, or stop.',
      },
      {
        mistake: 'Rotating the palm down during the hold.',
        fix: "Keep the palm turned up and flat on the wall — don't rotate it down.",
      },
    ],
  },
  'Biceps stretch — right': {
    exercise: 'Biceps stretch — right',
    voiceSrc: './assets/voice/biceps-stretch-right.mp3',
    voiceScript:
      "Biceps stretch, right side. Stand sideways to the wall with your right arm closest. Raise that arm to shoulder height, rotate your palm up, and place it flat on the wall with your fingers spread. Now slowly turn your body away from the wall until you feel the stretch in your biceps and the front of your shoulder. Hold there for about forty-five seconds and keep breathing. Remember, this is not a wrist stretch, so don't force the wrist back and don't rotate the palm down. Keep the wrist comfortable. If it complains, bend the elbow slightly, or stop on any wrist pain.",
    muscles: ['shoulders', 'chest'],
    muscleLabel: 'Biceps + front of shoulder',
    steps: [
      'Stand sideways to a wall with your right arm nearest.',
      'Raise your right arm to shoulder height and rotate the palm up.',
      'Place the palm flat on the wall, fingers spread.',
      'Slowly turn your body away from the wall until you feel the stretch in the biceps and front of the shoulder.',
      'Hold about 45 seconds, breathing steadily.',
    ],
    dos: [
      'Keep the palm flat on the wall at shoulder height, fingers spread.',
      'Turn your body away from the wall until the biceps stretches.',
      'Keep the wrist comfortable.',
      'Breathe steadily through the hold.',
    ],
    donts: [
      "Don't force the wrist back — this isn't a wrist stretch.",
      "Don't rotate the palm down.",
      "Don't push through wrist pain — stop if it hurts.",
      "Don't stay locked out if the wrist complains — bend the elbow slightly.",
    ],
    mistakes: [
      {
        mistake: 'Treating it like a wrist stretch and forcing the wrist back.',
        fix: 'Keep the wrist neutral and comfortable — the stretch belongs in the biceps, not the wrist.',
      },
      { mistake: 'The wrist complains during the hold.', fix: 'Bend the elbow slightly, or stop.' },
      { mistake: 'Rotating the palm down.', fix: 'Keep the palm up and flat against the wall.' },
    ],
  },
  'Bodyweight hip hinge': {
    exercise: 'Bodyweight hip hinge',
    voiceSrc: './assets/voice/bodyweight-hip-hinge.mp3',
    voiceScript:
      "Bodyweight hip hinge. Stand tall, feet hip-width, with soft, unlocked knees and your hands resting on the front of your thighs. Now hinge at the hips — push your butt back as your hands slide down your thighs toward your knees. Keep your spine flat and neutral the whole way, and you'll feel it in your hamstrings and glutes. Then stand back up by driving your hips forward and squeezing your glutes. The main thing: push your hips back, don't squat down. And don't round your low back — keep it flat the whole way. Bodyweight only, no weight.",
    muscles: ['hamstrings', 'glutes', 'hips'],
    muscleLabel: 'Hamstrings + glutes (hip hinge)',
    steps: [
      'Stand tall, feet hip-width, knees soft and unlocked, hands resting on the front of your thighs.',
      'Hinge at the hips — push your butt back as your hands slide down your thighs toward your knees.',
      'Keep your spine flat and neutral the whole way; feel the load in your hamstrings and glutes.',
      'Stand back up by driving your hips forward and squeezing your glutes. 2 sets of 12 reps.',
    ],
    dos: [
      'Push your hips back, not down.',
      'Keep your spine flat and neutral the whole way.',
      'Keep a soft, unlocked bend in your knees.',
      'Feel it in your hamstrings and glutes.',
    ],
    donts: [
      "Don't round your low back — flat spine the whole way.",
      "Don't squat down — the move is hips back, not knees forward.",
      "Don't lock your knees.",
      "Don't add load — bodyweight only.",
    ],
    mistakes: [
      {
        mistake: 'Squatting down with the knees going forward instead of hinging.',
        fix: 'Push your hips back rather than dropping your knees forward.',
      },
      {
        mistake: 'Letting the low back round.',
        fix: 'Keep your spine flat and neutral the whole way up and down.',
      },
      { mistake: 'Locking the knees.', fix: 'Keep a soft, unlocked bend in the knees throughout.' },
    ],
  },
  'Both knees to chest': {
    exercise: 'Both knees to chest',
    voiceSrc: './assets/voice/both-knees-to-chest.mp3',
    voiceScript:
      "Both knees to chest. Lie on your back on the mat, bend both knees, and bring them up toward your chest. Wrap your hands around your shins and pull both knees gently in. Let your low back round and soften underneath you, and breathe into it. Hold here for about forty-five seconds. Keep it easy, don't grip hard or yank the knees in. And keep your head resting on the mat, don't lift your head or neck to pull harder. A gentle rock side to side is fine if it feels good. Just relax and let the low back release.",
    muscles: ['back'],
    muscleLabel: 'Low back (lumbar release)',
    steps: [
      'Lie on your back on the mat.',
      'Bend both knees and bring them up toward your chest.',
      'Wrap your hands around your shins.',
      'Pull both knees gently in and let your low back round and soften.',
      'Hold for 45 seconds, breathing into your low back.',
    ],
    dos: [
      'Pull both knees gently in, hands around your shins.',
      'Let your low back round and soften.',
      'Breathe into your low back.',
      'A gentle side-to-side rock is fine if it feels good.',
    ],
    donts: ["Don't grip hard.", "Don't lift your head or neck off the mat to pull harder."],
    mistakes: [
      {
        mistake: 'Gripping and yanking the knees in hard.',
        fix: 'Ease off and let the low back round and soften instead of forcing it.',
      },
      {
        mistake: 'Lifting the head and neck off the mat to pull deeper.',
        fix: 'Keep your head resting on the mat and let your hands do the gentle pulling.',
      },
      {
        mistake: 'Pushing into a pinch or sharp pressure in the spine.',
        fix: 'A pinch or sharp pressure IN your spine (not a gentle stretch) means ease off and shorten the range — check with your PT first if your back is sensitive to bending forward.',
      },
    ],
  },
  'Calf stretch on wall — left': {
    exercise: 'Calf stretch on wall — left',
    voiceSrc: './assets/voice/calf-stretch-on-wall-left.mp3',
    voiceScript:
      "Calf stretch on the wall, left leg. Face the wall and put both hands on it. Step your left leg back and keep it straight, then press that heel flat into the floor with your toes pointing forward. Now bend your right front knee and lean gently into the wall until you feel the stretch in your left calf. The main thing to remember: keep that back heel pressed down. If it lifts, you lose the stretch. Don't bounce, just hold a steady lean for about forty-five seconds and breathe. Nice and easy.",
    muscles: ['calves'],
    muscleLabel: 'Calf (back lower leg)',
    steps: [
      'Face the wall and place both hands on it.',
      'Step your LEFT leg back and keep it straight, with the toes pointing forward.',
      'Press the back (left) heel down flat into the floor.',
      'Bend your right front knee and lean in toward the wall.',
      'Hold the stretch for 45 seconds, steady.',
    ],
    dos: [
      'Keep the back left leg straight, heel pressed down.',
      'Point the back toes forward.',
      'Bend the front knee and lean in steadily.',
    ],
    donts: [
      "Don't let the back heel lift — that loses the stretch.",
      "Don't bounce — steady lean only.",
    ],
    mistakes: [
      {
        mistake: 'The back heel lifts off the floor.',
        fix: "Press the heel down flat — that's where the stretch comes from.",
      },
      {
        mistake: 'Bouncing to push deeper into the stretch.',
        fix: 'Hold a steady lean instead of bouncing.',
      },
    ],
  },
  'Calf stretch on wall — right': {
    exercise: 'Calf stretch on wall — right',
    voiceSrc: './assets/voice/calf-stretch-on-wall-right.mp3',
    voiceScript:
      "Calf stretch on wall, right side. Stand facing the wall and place both hands on it. Step your right leg straight back and press that heel down into the floor. Then bend your left front knee and lean in toward the wall until you feel the stretch in your right calf. Keep the back leg straight and your toes pointing forward. The main thing here: keep that back heel pressed down. If it lifts, you lose the stretch. And don't bounce, just a steady lean. Hold it for forty-five seconds and breathe.",
    muscles: ['calves'],
    muscleLabel: 'Calf (gastrocnemius)',
    steps: [
      'Stand facing a wall and place both hands on it.',
      'Step your RIGHT leg straight back, keeping it straight, and press the heel down into the floor.',
      'Bend your LEFT front knee and lean in toward the wall.',
      'Keep the back leg straight with toes pointing forward, and hold for 45 seconds.',
    ],
    dos: [
      'Press the back heel down into the floor.',
      'Keep the back (right) leg straight, toes pointing forward.',
      'Bend the front knee and lean steadily into the wall.',
    ],
    donts: [
      "Don't let the back heel lift — that loses the stretch.",
      "Don't bounce — steady lean only.",
    ],
    mistakes: [
      {
        mistake: 'The back heel lifts off the floor, so the stretch disappears.',
        fix: "Press the heel down and keep it planted the whole time — that's where the stretch lives.",
      },
      {
        mistake: 'Bouncing to try to push deeper into the stretch.',
        fix: 'Hold a steady lean instead — no bouncing.',
      },
    ],
  },
  'Doorway pec stretch': {
    exercise: 'Doorway pec stretch',
    voiceSrc: './assets/voice/doorway-pec-stretch.mp3',
    voiceScript:
      "Doorway pec stretch. Stand in a doorway and rest your forearms on the frame, elbows bent to about ninety degrees and level with your shoulders — that's your T-shape. Keep your chest forward, your spine tall, and your head neutral. Now slowly step one foot through the doorway until you feel a stretch across your chest, and hold there, breathing easily, for about thirty to forty-five seconds. The main thing: don't let your elbows drop below shoulder height. And don't arch your low back or poke your chin forward — stay tall and open through the chest.",
    muscles: ['chest'],
    muscleLabel: 'Chest (pectorals — sternal fibers)',
    steps: [
      'Stand in a doorway with your forearms flat on the frame, elbows bent about 90 degrees in an L / T-shape, at shoulder height.',
      'Set your posture: chest forward, head neutral (no chin poke), spine tall.',
      'Slowly step one foot through the doorway until you feel a stretch across your chest.',
      'Hold about 30 to 45 seconds, breathing easily and keeping your spine tall.',
    ],
    dos: [
      'Keep elbows at shoulder height, bent about 90 degrees (T-shape).',
      'Step one foot through slowly until you feel the chest stretch.',
      'Chest forward, spine tall, breathe.',
    ],
    donts: [
      "Don't let your elbows drop below shoulder height.",
      "Don't poke your chin forward — keep your head neutral.",
      "Don't arch your low back.",
    ],
    mistakes: [
      {
        mistake: 'Elbows drift below shoulder height, so the stretch misses the chest.',
        fix: 'Reset your forearms on the frame with elbows level with your shoulders in the T-shape.',
      },
      {
        mistake: 'Chin pokes forward as you step through.',
        fix: 'Keep your head neutral and your spine tall.',
      },
      {
        mistake: 'Arching the low back to reach for more stretch.',
        fix: 'Keep the spine tall and let the stretch come from stepping through, not from arching.',
      },
    ],
  },
  'Figure-4 stretch': {
    exercise: 'Figure-4 stretch',
    voiceSrc: './assets/voice/figure-4-stretch.mp3',
    voiceScript:
      "Figure-4 stretch. Lie on your back, knees bent, feet flat. Cross your right ankle over your left knee, so your right leg makes a figure-4 shape, and let that right knee fall open to the side. To go a little deeper, use your forearms, not your hands, to gently draw your left leg toward you. Keep your wrists off and hook with the forearms only. Let the bent knee open passively, don't force it down. And don't push for depth, this is about opening the hip, not deepening it. Hold for forty-five seconds, breathing slow, then switch sides.",
    muscles: ['hips', 'glutes'],
    muscleLabel: 'Piriformis + outer hip',
    steps: [
      'Lie on your back, knees bent, feet flat.',
      'Cross your right ankle over your left knee to make a figure-4 shape.',
      'Let the right knee fall open outward to open the right hip.',
      'Using your forearms (not your hands), gently draw the left leg toward you.',
      'Hold 45 seconds, breathing slowly, then switch sides.',
    ],
    dos: [
      'Let the bent knee open passively, outward.',
      'Draw the leg in with your forearms only, wrists off.',
      'Hold 45 sec each side and breathe slow.',
    ],
    donts: [
      "Don't grip with your hands, forearm-hook only.",
      "Don't force the bent knee down or outward.",
      "Don't push for depth, it's opening, not deepening.",
    ],
    mistakes: [
      {
        mistake: 'Forcing the bent knee down with your other hand.',
        fix: "Let the knee open passively, don't push it.",
      },
      {
        mistake: 'Gripping the leg with your hands to pull it in.',
        fix: 'Hook with your forearms only and keep your wrists off.',
      },
    ],
  },
  'Forearm plank': {
    exercise: 'Forearm plank',
    voiceSrc: './assets/voice/forearm-plank.mp3',
    voiceScript:
      "Forearm plank. Set your forearms on the mat with your elbows right under your shoulders, and tuck your toes. Here's the key: stay up on your forearms only — your hands and wrists stay off the floor. Lift into a straight line from your head all the way to your heels. Squeeze your glutes and your core so your hips stay level with your shoulders — don't let them sag or pike. Hold for fifteen seconds and keep breathing through it. Start small; there's no rush to go longer yet.",
    muscles: ['core', 'glutes', 'shoulders'],
    muscleLabel: 'Core + glutes (trunk stability)',
    steps: [
      'Set your forearms on the mat with elbows under your shoulders — hands and wrists stay off the floor.',
      'Tuck your toes and lift up onto your forearms.',
      'Make a straight line from head to heels, squeezing your glutes and core so your hips stay level with your shoulders.',
      'Hold for 15 seconds, breathing through the hold.',
    ],
    dos: [
      'Keep elbows under your shoulders, weight on forearms only.',
      'Squeeze glutes and core so hips stay level with your shoulders.',
      'Hold the straight line head to heels and breathe through it.',
    ],
    donts: [
      "Don't drop onto your palms — forearms only, wrists stay off.",
      "Don't let your hips sag or pike out of line.",
      "Don't bump up to 30 seconds yet — start small.",
    ],
    mistakes: [
      {
        mistake: 'Dropping down onto your hands or palms.',
        fix: 'Stay up on your forearms with your wrists off the floor.',
      },
      {
        mistake: 'Hips sagging or piking out of the line.',
        fix: 'Squeeze your glutes and core to hold a flat line from head to heels.',
      },
      {
        mistake: 'Jumping to a longer 30-second hold too soon.',
        fix: 'Keep it to 15 seconds for now and build up gradually.',
      },
    ],
  },
  'Glute bridges': {
    exercise: 'Glute bridges',
    voiceSrc: './assets/voice/glute-bridges.mp3',
    voiceScript:
      'Glute bridges. Lie on your back with your knees bent and feet flat, about hip-width apart, arms relaxed at your sides with your palms up. The key is to squeeze your glutes first, and then lift your hips. Drive up through your heels, not your toes, and hold for two seconds at the top before lowering slowly. Aim for a straight line from your knees to your shoulders. The main thing to avoid is going super high or pushing into a backbend, so keep your lower back neutral, not arched. This is the single best lower-back-friendly glute exercise, so take it slow and controlled.',
    muscles: ['glutes', 'hips'],
    muscleLabel: 'Glutes (hip extensors)',
    steps: [
      'Lie on your back, knees bent, feet flat and hip-width apart, arms relaxed at your sides with palms up.',
      'Squeeze your glutes first, then lift your hips to a comfortable height.',
      "Keep a straight line from knees to shoulders — don't go super high.",
      'Drive up through your heels, not your toes.',
      'Hold 2 seconds at the top, then lower slowly. Exhale on the lift, inhale on the lower.',
    ],
    dos: [
      'Squeeze your glutes first, then lift.',
      'Drive through your heels, not your toes.',
      'Keep a straight line from knees to shoulders.',
      'Hold 2 seconds at the top, then lower with control.',
    ],
    donts: [
      "Don't over-arch or push into a backbend at the top.",
      "Don't go super high — keep knees-to-shoulders straight, not an arch.",
      "Don't load your palms — keep arms relaxed at your sides, palms up.",
    ],
    mistakes: [
      {
        mistake: 'Pushing the lower back into a backbend at the top.',
        fix: 'Drive through your heels instead of your toes, and keep a straight line from knees to shoulders.',
      },
      {
        mistake: 'Hips coming up before the glutes engage.',
        fix: 'Squeeze your glutes first, then lift.',
      },
    ],
  },
  'Glute squeezes': {
    exercise: 'Glute squeezes',
    voiceSrc: './assets/voice/glute-squeezes.mp3',
    voiceScript:
      "Glute squeezes. Lie on your back with your knees bent and feet flat. Gently tighten your butt muscles, like you're holding a coin between them. Aim for about fifty percent effort — this is about awareness, not maximum force. Hold for three seconds, then fully release for two seconds before the next one. Keep breathing normally the whole time. The main thing to avoid is squeezing your abs or your pelvic floor along with it — try to isolate only the glutes. This wakes up the muscle group that's about to do most of today's work.",
    muscles: ['glutes'],
    muscleLabel: 'Glutes (isometric hold)',
    steps: [
      'Lie on your back, knees bent, feet flat.',
      "Gently tighten your butt muscles like you're holding a coin — about 50% effort.",
      'Hold the squeeze for 3 seconds, breathing normally.',
      'Fully release for 2 seconds, then repeat for 10 holds.',
    ],
    dos: [
      'Aim for a 50% squeeze — awareness, not max effort.',
      'Hold 3 sec, then fully release for 2 sec between reps.',
      'Breathe normally throughout.',
      'Isolate only the glutes.',
    ],
    donts: [
      "Don't max-squeeze — it's about awareness, not maximum effort.",
      "Don't squeeze your abs or pelvic floor.",
      "Don't hold your breath.",
    ],
    mistakes: [
      {
        mistake: 'Squeezing the abs or pelvic floor along with the glutes.',
        fix: 'Focus on isolating ONLY the glutes.',
      },
      {
        mistake: 'Cranking the squeeze up to 100% effort.',
        fix: 'Aim for a 50% squeeze — the goal is awareness, not max force.',
      },
    ],
  },
  'Heel taps': {
    exercise: 'Heel taps',
    voiceSrc: './assets/voice/heel-taps.mp3',
    voiceScript:
      "Heel taps. Lie on your back with your knees bent and feet flat near your butt. Let your arms rest at your sides with your palms facing up, and keep your weight off your hands. Slowly extend one leg and tap that heel toward the floor, don't slam it down, then bring it back and switch sides. Ten each side, nice and slow. The key thing: keep your lower back in contact with the mat, and exhale as you tap. If your back starts to arch, just shorten the range. Remember, this is an anti-arch exercise, not a stretch, so stay steady and controlled.",
    muscles: ['core'],
    muscleLabel: 'Deep core / lower abs (anti-arch)',
    steps: [
      'Lie on your back, knees bent, feet flat near your butt.',
      'Rest your arms at your sides with your palms facing up.',
      'Slowly extend one leg and tap that heel toward the floor, without slamming it.',
      'Return to the start and alternate sides, 10 each side, slowly.',
      'Keep your lower back in contact with the mat and exhale on each tap.',
    ],
    dos: [
      'Keep your palms facing up and arms relaxed and flat.',
      'Move slowly and tap the heel lightly.',
      'Press your lower back into the mat throughout.',
      'Exhale as you tap the heel down.',
    ],
    donts: [
      "Don't load your palms, keep the arms flat.",
      "Don't slam the heel to the floor.",
      "Don't let your lower back arch, shorten the range if it lifts.",
      "Don't treat it as a stretch, it's an anti-arch move.",
    ],
    mistakes: [
      {
        mistake: 'Lower back arches off the mat as the leg extends.',
        fix: 'Shorten the leg extension until your back stays in contact with the mat.',
      },
      {
        mistake: 'Slamming the heel down to the floor.',
        fix: 'Lower slowly and tap lightly instead of dropping the leg.',
      },
    ],
  },
  'Hip flexor — left knee in, right leg dangles': {
    exercise: 'Hip flexor — left knee in, right leg dangles',
    voiceSrc: './assets/voice/hip-flexor-left-knee-in-right-leg-dangles.mp3',
    voiceScript:
      "This is the hip flexor stretch, with your left knee in and your right leg dangling. Lie on the edge of a couch or bed. Pull your left knee up to your chest and hug it in with your hands. Now let your right leg dangle off the edge. That dangling leg is the stretch, right across the front of your hip. Let the hanging thigh relax and drop toward the floor. Don't arch your low back, and don't grip the couch. Just stay relaxed and breathe. Hold it here for forty-five seconds.",
    muscles: ['hips'],
    muscleLabel: 'Hip flexors (front of hip)',
    steps: [
      'Lie on the edge of a couch or bed.',
      'Pull your LEFT knee to your chest and hug it in with your hands.',
      'Let your RIGHT leg dangle off the edge — the dangling leg is the stretch across the front of the hip.',
      'Relax the hanging thigh toward the floor and hold 45 seconds.',
    ],
    dos: [
      'Hug the left knee in and let the right leg dangle off the edge',
      'Relax the hanging leg toward the floor',
      'Let the dangling thigh drop',
      'Stay relaxed and breathe throughout',
    ],
    donts: ["Don't arch the low back", "Don't grip the wall or couch — stay relaxed"],
    mistakes: [
      {
        mistake: 'Arching the low back to feel more stretch',
        fix: 'Keep the low back neutral and let the dangling thigh drop toward the floor instead.',
      },
      {
        mistake: 'Gripping the wall or couch for support',
        fix: 'Let go and stay relaxed — let the hanging leg drop on its own.',
      },
    ],
  },
  'Hip flexor — right knee in, left leg dangles': {
    exercise: 'Hip flexor — right knee in, left leg dangles',
    voiceSrc: './assets/voice/hip-flexor-right-knee-in-left-leg-dangles.mp3',
    voiceScript:
      "This is the hip flexor stretch, right knee in, left leg dangles. Lie on the edge of a couch or bed. Pull your right knee up to your chest and hold it there with your hands. Now let your left leg dangle off the edge — that dangling leg is the stretch, right across the front of your left hip. Let the hanging thigh relax and drop toward the floor. Keep it gentle: don't arch your low back, and don't grip the couch — just stay relaxed and let the leg fall. Hold for forty-five seconds and breathe.",
    muscles: ['hips'],
    muscleLabel: 'Hip flexors (front of hip)',
    steps: [
      'Lie on the edge of a couch or bed.',
      'Pull your RIGHT knee to your chest with your hands.',
      'Let your LEFT leg dangle off the edge — the dangling leg is the stretch across the front of the hip.',
      'Relax the hanging leg toward the floor and hold for 45 seconds.',
    ],
    dos: [
      'Hug the right knee in toward your chest.',
      'Let the dangling left thigh drop and relax toward the floor.',
      'Feel the stretch across the front of the left hip.',
    ],
    donts: ["Don't arch your low back.", "Don't grip the wall or couch — stay relaxed."],
    mistakes: [
      {
        mistake: 'Arching the low back to reach further.',
        fix: 'Keep the low back down and let the dangling thigh drop instead.',
      },
      {
        mistake: 'Gripping the wall or couch and tensing up.',
        fix: 'Stay relaxed and let the hanging leg fall toward the floor.',
      },
    ],
  },
  'IWYT raises': {
    exercise: 'IWYT raises',
    voiceSrc: './assets/voice/iwyt-raises.mp3',
    voiceScript:
      "IWYT raises. Lie face down on the mat with your forehead on a folded towel, so your neck stays long and relaxed. Keep your thumbs pointing up the whole time — that keeps your wrists neutral, with no weight through the palms. For each letter, make the shape, lift your arms just a few centimeters off the floor by squeezing your upper back, hold one breath, and lower. Rest your hands on the floor between reps — that's the rest position. Do about eight of each letter: I, W, Y, and T. Lift from the upper back, not the neck, and keep it gentle — stop if your neck complains.",
    muscles: ['back', 'shoulders'],
    muscleLabel: 'Upper back + rear shoulders',
    steps: [
      'Lie face down on the mat, forehead on a folded towel so the neck stays long and relaxed.',
      'Point your thumbs UP the entire time — this keeps the wrists neutral with no palm pressure.',
      "Make each letter's shape: I — arms straight down along your sides; W — elbows bent toward your ribs; Y — narrow overhead V; T — arms straight out at shoulder height.",
      'Lift the arms a few centimeters off the floor by squeezing your upper back, hold one breath, then lower.',
      'Rest your hands ON the floor between reps, and finish all reps of one letter before moving to the next.',
      'Do about 8 of each letter (I, W, Y, T), 2 rounds — keep it gentle for the neck.',
    ],
    dos: [
      'Thumbs up throughout — keeps the wrist neutral with no palm load.',
      'Lift from the upper back, squeezing the shoulder blades.',
      'Rest your hands on the floor between reps — the floor is the rest position.',
      'Keep the neck long, eyes on the towel.',
    ],
    donts: [
      "Don't put weight through the palms — thumbs up protects the wrist.",
      "Don't crane or lift from your neck.",
      "Don't hover the arms between reps — set them down.",
      "Don't force big swings; stop if the neck complains.",
    ],
    mistakes: [
      {
        mistake: 'Craning the neck to lift the arms.',
        fix: 'Lift from the upper back instead — if the neck starts doing the work, the lift is too big, so make it smaller.',
      },
      {
        mistake: 'Hovering the arms between reps.',
        fix: 'Set the hands down on the floor — the floor is the rest position; you only lift for the squeeze.',
      },
      {
        mistake: 'Big swings for height.',
        fix: 'Small, controlled lifts a few centimeters off the floor beat big swings.',
      },
    ],
  },
  'Knee drops side-to-side': {
    exercise: 'Knee drops side-to-side',
    voiceSrc: './assets/voice/knee-drops-side-to-side.mp3',
    voiceScript:
      "Here's knee drops side to side. With your knees bent, gently let them rock over toward one side, bring them back through the middle, and let them fall toward the other side. Keep the movement small — this is a gentle warm-up, not a deep stretch. The main thing to remember: keep the range small and easy. Don't force your knees all the way down to the floor. Just let them drop as far as feels comfortable, then come back through the middle. Aim for about eight to each side, nice and relaxed.",
    muscles: ['core', 'hips'],
    muscleLabel: 'Trunk rotation + hips (lower back)',
    steps: [
      'Bend your knees so they can rock from side to side.',
      'Gently lower your knees toward one side, keeping the range small.',
      'Bring them back through the middle.',
      'Lower them toward the other side, just as gently.',
      'Continue side to side, about 8 times each way.',
    ],
    dos: [
      'Keep the range small and gentle.',
      'Let your knees rock smoothly from side to side.',
      'Aim for about 8 to each side.',
    ],
    donts: [
      "Don't force your knees all the way down to the floor.",
      "Don't make the movement big — keep the range small.",
    ],
    mistakes: [
      {
        mistake: 'Letting the knees drop too far to each side.',
        fix: 'Keep the range small — only lower them as far as feels comfortable, then return through the middle.',
      },
    ],
  },
  'Knee-to-chest hugs': {
    exercise: 'Knee-to-chest hugs',
    voiceSrc: './assets/voice/knee-to-chest-hugs.mp3',
    voiceScript:
      "Knee-to-chest hugs. Lie on your back with your knees bent and your feet flat on the floor. Bring one knee up toward your chest. Here's the key: hook your forearm around that leg to draw the knee in. Don't grip or pull with your hands — keeping the load off your palms protects your wrist while it heals. Give it a gentle hug, then lower the leg and switch to the other side. Do five on each side, easy and slow. This is a warmup, so keep it light — no cranking the knee in hard, just a soft hug each time.",
    muscles: ['back', 'glutes'],
    muscleLabel: 'Lower back + glutes',
    steps: [
      'Lie on your back, knees bent, feet flat on the floor.',
      'Bring one knee up toward your chest.',
      "Hook your forearm around that leg to draw the knee in — don't grip with your hands.",
      'Give it a gentle hug, then lower the leg back down.',
      'Switch sides and repeat, 5 hugs on each side.',
    ],
    dos: [
      'Hook the leg with your forearm to draw the knee in.',
      "Keep each hug gentle and easy — it's a warmup.",
      'Alternate sides, 5 on each.',
    ],
    donts: [
      "Don't grip or pull the knee with your hands.",
      "Don't crank the knee in hard — keep it a soft hug.",
    ],
    mistakes: [
      {
        mistake: 'Grabbing the knee and pulling it in with your hands.',
        fix: 'Hook your forearm around the leg instead, so no load goes through your wrist.',
      },
      {
        mistake: 'Yanking the knee in too hard.',
        fix: 'Draw it in gently — this is an easy warmup hug, not a deep stretch.',
      },
      {
        mistake: 'Pushing into a pinch or sharp pressure in the spine.',
        fix: 'A pinch or sharp pressure IN your spine (not a gentle stretch) means ease off and shorten the range — check with your PT first if your back is sensitive to bending forward.',
      },
    ],
  },
  'Knees-to-chest hold': {
    exercise: 'Knees-to-chest hold',
    voiceSrc: './assets/voice/knees-to-chest-hold.mp3',
    voiceScript:
      "Knees-to-chest hold. Lie on your back and gently bring both thighs toward your chest. Here's the key: hook your forearms behind your thighs to support them, not your hands. Your wrists stay off, so don't grip with your hands. Let your legs rest passively on your forearms, don't actively pull them in, and breathe slowly. Hold for about sixty seconds. If your tailbone lifts off the mat, the angle's too tight, so just let your legs come a little further from your chest. This one releases your lower back fully. Passive release only, no crunching.",
    muscles: ['back'],
    muscleLabel: 'Lower back release',
    steps: [
      'Lie on your back on the mat.',
      'Gently bring both thighs toward your chest.',
      'Hook your forearms behind your thighs to support them, not your hands.',
      'Let your legs rest passively on your forearms and breathe slowly.',
      'Hold about 60 seconds; if your tailbone lifts off the mat, let the legs come a little further from your chest.',
    ],
    dos: [
      'Hook your forearms behind your thighs for support',
      'Let the legs rest passively on your forearms',
      'Breathe slowly through the hold',
      'If your tailbone lifts, ease the legs further from your chest',
    ],
    donts: [
      "Don't grip with your hands, wrists stay off",
      "Don't actively pull your legs in",
      "Don't crunch into the stretch",
      "Don't force the angle so tight the tailbone lifts",
    ],
    mistakes: [
      {
        mistake: 'Gripping with your hands, which defeats the wrist protection.',
        fix: 'Hook your forearms behind your thighs instead and keep your hands off.',
      },
      {
        mistake: 'Actively pulling the legs in or crunching into the stretch.',
        fix: 'Let the legs rest passively on your forearms; passive release only.',
      },
      {
        mistake: 'Angle too tight, so the tailbone lifts off the mat.',
        fix: 'Let the legs come a little further from your chest.',
      },
      {
        mistake: 'Pushing into a pinch or sharp pressure in the spine.',
        fix: 'A pinch or sharp pressure IN your spine (not a gentle stretch) means ease off and shorten the range — check with your PT first if your back is sensitive to bending forward.',
      },
    ],
  },
  'Leg cross — left': {
    exercise: 'Leg cross — left',
    voiceSrc: './assets/voice/leg-cross-left.mp3',
    voiceScript:
      "Leg cross, left side. Lie on your back with your knees bent, and cross your left ankle over the opposite bent knee, so your legs make a figure-four shape. To deepen it, forearm-hook the support thigh and draw it gently in toward you. Keep your wrists off — no gripping with your hands. Then let the crossed knee open passively toward the floor, and don't force it down. This is a gentle hold, about forty-five seconds. Just breathe and let the hip release.",
    muscles: ['glutes'],
    muscleLabel: 'Glutes / piriformis (hip)',
    steps: [
      'Lie on your back with both knees bent, feet on the floor.',
      'Cross your LEFT ankle over the opposite bent knee, into a figure-4 shape.',
      'Forearm-hook the support thigh and draw it gently in — keep your wrists off.',
      'Let the crossed knee open passively toward the floor and hold gently for 45 seconds.',
    ],
    dos: [
      'Cross the left ankle over the opposite bent knee (figure-4).',
      'Forearm-hook the thigh to draw the support leg gently in.',
      'Let the crossed knee open passively toward the floor.',
      'Keep it a gentle, easy hold.',
    ],
    donts: [
      "Don't grip with your hands — keep your wrists off.",
      "Don't force the crossed knee down with your hand.",
    ],
    mistakes: [
      {
        mistake: 'Gripping the leg with your hands to pull it in.',
        fix: 'Forearm-hook the thigh instead and keep your wrists off.',
      },
      {
        mistake: 'Forcing the crossed knee down toward the floor with your hand.',
        fix: "Let the knee open passively on its own — don't push it.",
      },
    ],
  },
  'Leg cross — right': {
    exercise: 'Leg cross — right',
    voiceSrc: './assets/voice/leg-cross-right.mp3',
    voiceScript:
      "Leg cross, right side. Lie on your back with your knees bent and feet flat. Cross your right ankle over the opposite bent knee, so your right leg makes a figure-four. Now just let that crossed knee open passively out toward the floor — no forcing it. If you want a little more, hook your forearm behind the support thigh and draw it gently in. Keep your wrists off the whole time — don't grip with your hands, and don't push the knee down with your hand. Hold gently for about forty-five seconds, breathing slow. This one opens up your glute and outer hip.",
    muscles: ['glutes', 'hips'],
    muscleLabel: 'Glutes + piriformis (outer hip)',
    steps: [
      'Lie on your back, knees bent, feet flat.',
      'Cross your RIGHT ankle over the opposite bent knee, so the right leg makes a figure-4.',
      'Let the crossed knee open passively out toward the floor.',
      'To deepen gently, forearm-hook the support thigh and draw it in — wrists stay off.',
      'Hold about 45 seconds, breathing slowly.',
    ],
    dos: [
      'Let the crossed knee open passively toward the floor.',
      'Forearm-hook the thigh to draw it gently in.',
      'Keep the hold gentle and breathe slowly.',
    ],
    donts: [
      "Don't grip with your hands — wrists stay off.",
      "Don't force the knee down with your hand.",
    ],
    mistakes: [
      {
        mistake: 'Forcing the crossed knee down with your hand.',
        fix: 'Let it open passively toward the floor on its own.',
      },
      {
        mistake: 'Gripping the thigh with your hands.',
        fix: 'Hook it with your forearm instead, keeping your wrists off.',
      },
    ],
  },
  'Leg up in air — left': {
    exercise: 'Leg up in air — left',
    voiceSrc: './assets/voice/leg-up-in-air-left.mp3',
    voiceScript:
      "Leg up in air, left side. This is a hamstring stretch. Lie on your back with your right leg relaxed along the floor. Raise your left leg straight up toward the ceiling, and rest your hands behind the thigh. If reaching is hard, loop a strap behind the thigh instead. Keep a soft bend in the knee — you don't need to lock it straight. Keep that down leg relaxed and let the stretch settle into the back of the thigh. One thing to avoid: don't pull on the back of the knee. Hold here for about forty-five seconds and just breathe.",
    muscles: ['hamstrings'],
    muscleLabel: 'Hamstrings (left leg)',
    steps: [
      'Lie on your back with your right down-leg relaxed along the floor.',
      'Raise your LEFT leg straight up toward the ceiling.',
      'Rest your hands behind the THIGH (loop a strap behind the thigh if it helps).',
      'Keep a soft bend in the knee and hold for 45 seconds.',
    ],
    dos: [
      'Keep a soft bend in the knee.',
      'Keep the down-leg relaxed along the floor.',
      'Hold behind the thigh — use a strap if it helps.',
    ],
    donts: ["Don't lock the knee straight.", "Don't pull on the back of the knee."],
    mistakes: [
      {
        mistake: 'Locking the knee straight to get the leg higher.',
        fix: 'Keep a soft bend — a slight bend in the knee is fine.',
      },
      {
        mistake: 'Gripping and pulling on the back of the knee.',
        fix: 'Hold behind the thigh instead, or loop a strap behind the thigh.',
      },
    ],
  },
  'Leg up in air — right': {
    exercise: 'Leg up in air — right',
    voiceSrc: './assets/voice/leg-up-in-air-right.mp3',
    voiceScript:
      "This is Leg up in air, right side — a supine hamstring stretch. Lie on your back and raise your right leg straight up toward the ceiling. Rest your hands behind the thigh, not behind the knee — use a strap behind the thigh if that helps you reach. Keep a soft bend in the knee; don't lock it out straight. Let your down-leg stay relaxed along the floor. Hold gently for about forty-five seconds. The main thing to avoid: don't pull on the back of the knee. Keep the stretch easy and steady behind the thigh.",
    muscles: ['hamstrings'],
    muscleLabel: 'Hamstrings',
    steps: [
      'Lie on your back.',
      'Raise your right leg straight up toward the ceiling.',
      'Hold your hands behind the thigh (use a strap behind the thigh if it helps).',
      "Keep a soft bend in the knee — don't lock it.",
      'Let the down-leg stay relaxed along the floor.',
      'Hold for 45 seconds.',
    ],
    dos: [
      'Hands behind the thigh, not the knee.',
      'Keep a soft bend in the knee.',
      'Keep the down-leg relaxed on the floor.',
      'Use a strap behind the thigh if it helps.',
    ],
    donts: ["Don't lock the knee — a soft bend is fine.", "Don't pull on the back of the knee."],
    mistakes: [
      { mistake: 'Locking the knee out straight.', fix: 'Keep a soft bend in the knee.' },
      { mistake: 'Pulling on the back of the knee.', fix: 'Hold behind the thigh instead.' },
    ],
  },
  'Modified dead bug': {
    exercise: 'Modified dead bug',
    voiceSrc: './assets/voice/modified-dead-bug.mp3',
    voiceScript:
      'Modified dead bug. Lie on your back and lift both legs so your hips and knees are at 90 degrees, shins parallel to the ceiling in a tabletop position. Rest your arms flat at your sides with your palms facing up, no weight through your hands, that protects your wrists. Slowly extend one leg straight out, hovering it above the floor, and exhale as it goes. Bring it back to tabletop, then switch sides, six each side. Keep your lower back glued to the mat the whole time. If it arches, your range is too big, so shorten it. Slow is harder and better here.',
    muscles: ['core'],
    muscleLabel: 'Abs / deep core (anti-arch)',
    steps: [
      'Lie on your back, hips and knees both at 90 degrees in the air, shins parallel to the ceiling (tabletop position).',
      'Rest your arms flat at your sides on the mat, palms UP (not down) to protect your wrists.',
      'Slowly extend ONE leg straight out, hovering it above the floor; exhale on the extension.',
      'Bring it back to tabletop, then switch sides. 6 each side.',
      'Keep your lower back glued to the mat the whole time.',
    ],
    dos: [
      'Keep shins parallel to the ceiling in tabletop.',
      'Lower back stays glued to the mat throughout.',
      'Move slowly - slow = harder = better.',
      'Exhale as you extend the leg.',
    ],
    donts: [
      "Don't put your hands behind your head - arms stay flat.",
      "Don't lift your palms or load your wrists - palms stay up.",
      "Don't let your lower back arch - shorten the range if it does.",
      "Don't rush the movement.",
    ],
    mistakes: [
      {
        mistake: 'Lower back arches off the mat as the leg extends.',
        fix: 'Shorten the leg range - if it arches, your range is too big.',
      },
      { mistake: 'Moving too fast.', fix: 'Slow down; slow is harder and better here.' },
      {
        mistake: 'Loading the wrists or resting palms down.',
        fix: 'Keep arms relaxed and flat with palms up - no weight through the hands.',
      },
    ],
  },
  'Neck stretch': {
    exercise: 'Neck stretch',
    voiceSrc: './assets/voice/neck-stretch.mp3',
    voiceScript:
      "Neck stretch. Sit or stand tall and let your shoulders drop down. Gently tilt one ear toward that shoulder until you feel an easy stretch along the side of your neck. You can rest a light hand over your head, but only for a little weight — don't pull. Let the weight of your head do the work. Keep the opposite shoulder relaxed and down, and don't let it shrug up toward your ear. Hold for about forty-five seconds, breathing slowly, then switch to the other side. Easy and gentle the whole way.",
    muscles: ['neck'],
    muscleLabel: 'Side of the neck (lateral neck)',
    steps: [
      'Sit or stand tall and let both shoulders drop down.',
      'Gently tilt one ear toward that shoulder.',
      "Rest a light hand over your head for weight only — let the head's weight do the work.",
      'Hold 45 seconds, keeping the opposite shoulder relaxed and down.',
      'Switch sides.',
    ],
    dos: [
      'Tilt your ear gently toward one shoulder.',
      'Use a light hand for weight only.',
      'Keep the opposite shoulder relaxed and down.',
    ],
    donts: [
      "Don't yank — let the head's weight do the work.",
      "Don't shrug the stretched side up toward the ear.",
    ],
    mistakes: [
      {
        mistake: 'Pulling the head down hard with your hand.',
        fix: "Let the hand be for weight only and let the head's own weight do the work.",
      },
      {
        mistake: 'Shrugging the stretched side up toward the ear.',
        fix: 'Keep the opposite shoulder relaxed and down.',
      },
    ],
  },
  'Outdoor walk': {
    exercise: 'Outdoor walk',
    voiceSrc: './assets/voice/outdoor-walk.mp3',
    voiceScript:
      "Outdoor walk. This one's simple, and it might be your most underrated exercise. Head outside if you can, because the visual variety and sunlight really do matter. Keep it at a conversational pace: you should be able to talk in full sentences without getting breathless. Slip your phone in your pocket, lift your eyes, and just scan the world around you. The main thing to avoid is power-walking until your breathing gets ragged, so ease back if it does. And don't skip on a low-energy day, because even ten minutes counts. When your minutes are up, tap done. That's cardio in the bank.",
    muscles: ['quads', 'glutes', 'calves'],
    muscleLabel: 'Legs + cardio — whole-body walk',
    steps: [
      'Head outside when you can — the visual variety and sunlight matter.',
      'Set a conversational pace: you can talk in full sentences without getting breathless.',
      'Phone in pocket, eyes up, scan your surroundings.',
      'Keep going for your minutes (aim for at least 20).',
      'Tap done when your minutes are complete — it counts as cardio.',
    ],
    dos: [
      'Keep a conversational pace — talk full sentences without panting.',
      'Take it outdoors for the visual variety and sunlight.',
      'Eyes up, phone in pocket, scan your surroundings.',
      'Tap done when your minutes are complete.',
    ],
    donts: [
      "Don't power-walk if your breathing gets ragged.",
      "Don't doom-scroll while walking — it defeats the reset.",
      "Don't skip on low-energy days; even 10 minutes counts.",
    ],
    mistakes: [
      {
        mistake: 'Pushing the pace until your breathing gets ragged.',
        fix: 'Ease back to a conversational pace where you can still talk in full sentences.',
      },
      {
        mistake: 'Doom-scrolling on your phone as you walk.',
        fix: "Pocket the phone, lift your eyes, and scan your surroundings — that's the mental reset.",
      },
      {
        mistake: 'Skipping the walk on a low-energy day.',
        fix: 'Go anyway — even 10 minutes counts.',
      },
    ],
  },
  'Pelvic tilts': {
    exercise: 'Pelvic tilts',
    voiceSrc: './assets/voice/pelvic-tilts.mp3',
    voiceScript:
      "Pelvic tilts. Lie on your back with your knees bent and your feet flat, hip-width apart. Let your arms rest at your sides, palms up, and don't push through your palms. Tilt your pelvis so your lower back gently flattens into the mat, tucking your tailbone slightly toward you. Exhale as you tilt, hold for a second or two, then inhale and release back to neutral. Keep the movement small, just an inch or two at the hip. The main thing to avoid is over-arching on the release. Just come back to neutral, never into a backbend. Do ten slow reps.",
    muscles: ['core', 'hips'],
    muscleLabel: 'Pelvis-spine connection / core',
    steps: [
      'Lie on your back, knees bent, feet flat hip-width apart, arms relaxed at your sides with palms up.',
      'Tilt your pelvis so your lower back gently flattens into the mat, tucking your tailbone slightly toward you.',
      'Exhale as you tilt and hold 1-2 seconds.',
      'Inhale and release back to neutral. Do 10 slow reps.',
    ],
    dos: [
      'Keep the movement small, just 1-2 inches at the hip.',
      'Exhale on the tilt, inhale on the release.',
      'Flatten your lower back into the mat, then return to neutral.',
    ],
    donts: [
      "Don't load your palms, keep arms relaxed at your sides, palms up.",
      "Don't over-arch on the release.",
      "Don't push into a backbend, flat back then neutral.",
    ],
    mistakes: [
      {
        mistake: 'Over-arching your lower back on the release.',
        fix: 'Just return to neutral, not into a backbend.',
      },
      {
        mistake: 'Making the tilt too big.',
        fix: 'Keep it small, only 1-2 inches of movement at the hip.',
      },
    ],
  },
  'Prone row (bodyweight)': {
    exercise: 'Prone row (bodyweight)',
    voiceSrc: './assets/voice/prone-row-bodyweight.mp3',
    voiceScript:
      "Prone row, bodyweight only. Lie face down on a bed or bench edge, or stand and hinge over, with your arm hanging straight down toward the floor and your wrist neutral and straight. No weight yet — you're building the pattern and endurance toward adding the one kilo later. Keep your head down, don't lift it, because lifting strains the neck. Drive your elbow up toward the ceiling, leading with the elbow and squeezing your shoulder blade toward your spine, then lower slowly. Two sets of twelve each side. Keep the wrist straight throughout, and stop on any wrist signal. Add the one kilo only when you say you're ready.",
    muscles: ['back'],
    muscleLabel: 'Lower trap + mid-back (shoulder blade)',
    steps: [
      'Lie face-down on a bed or bench edge (or stand and hinge over), arm hanging straight down toward the floor.',
      'Set the wrist neutral and straight — no weight yet.',
      'Keep your head DOWN — do not lift it (lifting strains the neck).',
      'Drive your elbow UP toward the ceiling, leading with the elbow.',
      'Squeeze your shoulder blade toward your spine, then lower slowly.',
      'Do 2 sets of 12 each side; add the 1 kg only when you say you are ready.',
    ],
    dos: [
      'Lead with the elbow, driving it up toward the ceiling',
      'Squeeze the shoulder blade toward your spine',
      'Keep the wrist neutral and straight throughout',
      'Lower slowly',
    ],
    donts: [
      "Don't bear weight through the palm — let the arm just hang",
      "Don't bend the wrist — keep it straight, no palm load",
      "Don't lift your head — keep it down",
      "Don't yank with the arm instead of leading with the elbow and blade",
    ],
    mistakes: [
      {
        mistake: 'Bending the wrist or loading the palm',
        fix: 'Keep the wrist straight and neutral throughout; the arm just hangs, no palm weight-bearing. Stop on any wrist signal.',
      },
      {
        mistake: 'Yanking with the arm instead of leading with the elbow and blade',
        fix: 'Drive the elbow up and squeeze the shoulder blade toward your spine, then lower slowly.',
      },
      { mistake: 'Lifting the head', fix: 'Keep your head down — lifting it strains the neck.' },
    ],
  },
  'Scapular squeezes': {
    exercise: 'Scapular squeezes',
    voiceSrc: './assets/voice/scapular-squeezes.mp3',
    voiceScript:
      "Scapular squeezes. Sit or stand up tall, with your arms relaxed at your sides. Gently squeeze your shoulder blades together, like you're pinching a pencil between them, and hold for five seconds. Then release slowly. Do two sets of ten. The main thing to feel is the squeeze between your shoulder blades, not in your neck. Don't shrug up toward your ears, so keep your shoulders down. And there's no grip in this one at all, so let your wrists stay completely neutral and relaxed the whole time. Nice and easy.",
    muscles: ['back', 'shoulders'],
    muscleLabel: 'Upper back + rear shoulders (scapular retractors)',
    steps: [
      'Sit or stand tall with your arms relaxed at your sides.',
      'Gently squeeze your shoulder blades together, like pinching a pencil between them.',
      'Hold the squeeze for 5 seconds.',
      'Release slowly. Do 2 sets of 10 reps.',
    ],
    dos: [
      'Sit or stand tall, arms relaxed at your sides.',
      'Feel it between your shoulder blades.',
      'Keep your wrists completely neutral — no grip.',
    ],
    donts: [
      "Don't shrug up toward your ears.",
      "Don't grip with your hands — wrists stay neutral.",
      "Don't feel it in your neck.",
    ],
    mistakes: [
      {
        mistake: 'Shrugging up toward the ears instead of squeezing the blades.',
        fix: 'Keep your shoulders down and draw the shoulder blades together, not up.',
      },
      {
        mistake: 'Feeling the effort in your neck rather than between the blades.',
        fix: 'Pull the shoulder blades toward your spine so you feel it between them, not in the neck.',
      },
    ],
  },
  'Seated forward fold': {
    exercise: 'Seated forward fold',
    voiceSrc: './assets/voice/seated-forward-fold.mp3',
    voiceScript:
      "Seated forward fold. Sit on the mat with your legs extended in front of you. A slight bend in the knees is totally fine, just don't lock them out. Let your arms rest in your lap; you're not reaching forward. Now hinge from your hips, not by rounding your back, until you feel a gentle stretch in the back of your legs. Stop at about a two out of ten stretch. This isn't a depth competition. The main thing: stay tall and hinge at the hips. Don't round your upper back to fake more depth. Staying tall with a smaller fold beats collapsing deep. Hold and breathe.",
    muscles: ['hamstrings'],
    muscleLabel: 'Hamstrings (back of legs)',
    steps: [
      "Sit on the mat with your legs extended in front of you; a slight knee bend is fine, don't lock the knees.",
      'Rest your arms in your lap, not reaching forward.',
      'Hinge forward from the HIPS, not by rounding your back, until you feel a gentle stretch in the back of your legs.',
      'Stop at a 2/10 stretch, then hold and breathe for about 60 seconds.',
    ],
    dos: [
      'Keep a soft bend in the knees.',
      'Hinge from the hips.',
      'Rest your arms in your lap.',
      'Stay tall with a smaller fold.',
    ],
    donts: [
      "Don't lock your knees.",
      "Don't round your upper back to fake more depth.",
      "Don't reach forward with your hands.",
      "Don't treat it as a depth competition.",
    ],
    mistakes: [
      {
        mistake: 'Rounding the upper back to make the stretch look deeper.',
        fix: 'Stay tall and hinge from the hips — a smaller fold that keeps you tall beats collapsing deep.',
      },
      {
        mistake: 'Reaching forward with your hands to get lower.',
        fix: 'Keep your arms resting in your lap; the stretch comes from the hip hinge, not the arms.',
      },
    ],
  },
  'Shoulder stretch': {
    exercise: 'Shoulder stretch',
    voiceSrc: './assets/voice/shoulder-stretch.mp3',
    voiceScript:
      "Shoulder stretch. Bring one arm straight across the front of your body. Use your opposite forearm to cradle it just above the elbow, and draw it gently in toward your chest. You should feel this in the back and outside of your shoulder. Hold for forty-five seconds, keep breathing, then switch arms. One thing to watch: cradle above the elbow, not right on the joint, so don't pull on the elbow itself. And keep your torso square. Don't twist your body to fake more range. Let the shoulder do the stretching. Nice and easy.",
    muscles: ['shoulders'],
    muscleLabel: 'Rear and outer shoulder',
    steps: [
      'Bring one arm straight across the front of your body.',
      'With the opposite forearm, cradle it just above the elbow.',
      'Draw the arm gently in toward your chest until you feel the back and outside of the shoulder.',
      'Hold 45 seconds, breathing, then switch arms.',
    ],
    dos: [
      'Cradle just above the elbow.',
      'Feel it in the back and outside of the shoulder.',
      'Keep breathing through the hold.',
    ],
    donts: ["Don't pull on the elbow joint itself.", "Don't rotate your torso to fake more range."],
    mistakes: [
      {
        mistake: 'Pulling on the elbow joint.',
        fix: 'Cradle the arm just above the elbow instead of on the joint.',
      },
      {
        mistake: 'Twisting the torso to reach further.',
        fix: 'Keep your torso square and let the stretch stay in the shoulder.',
      },
    ],
  },
  'Side-lying clamshells': {
    exercise: 'Side-lying clamshells',
    voiceSrc: './assets/voice/side-lying-clamshells.mp3',
    voiceScript:
      "Side-lying clamshells. Lie on your side with your hips and shoulders stacked vertically and your knees bent about ninety degrees. Rest your head on the mat or a thin pillow. Don't prop up on your forearm, and keep your wrists off the floor. Your bottom arm just extends along the floor, relaxed. Keep your feet together, then open your top knee like a clam shell, lifting only to a comfortable range. Exhale as you open, inhale as you lower with control. The main thing: keep those hips stacked. Don't roll the top hip backward to lift higher. Smaller and clean beats big and sloppy. Ten each side.",
    muscles: ['glutes', 'hips'],
    muscleLabel: 'Glute medius + hips',
    steps: [
      'Lie on your side with hips and shoulders stacked vertically, knees bent about 90 degrees.',
      'Rest your head on the mat or a thin pillow, not propped on your forearm. Let your bottom arm extend along the floor under your head, wrists off the ground.',
      'Keep your feet together throughout.',
      'Open your top knee like a clam shell, keeping the bottom knee on the mat. Lift only to a comfortable range, exhaling as you open.',
      'Lower with control, inhaling on the way down. Do 10 each side.',
    ],
    dos: [
      'Keep hips and shoulders stacked vertically through the whole rep.',
      'Keep your feet together and lift only to a comfortable range.',
      'Rest your head on the mat or a thin pillow.',
      'Lower with control: exhale as you open, inhale as you lower.',
    ],
    donts: [
      "Don't prop up on your forearm; wrists stay off the floor.",
      "Don't roll the top hip backward to lift higher.",
      "Don't force the range; smaller and clean beats big and sloppy.",
    ],
    mistakes: [
      {
        mistake: 'Hips roll backward as the top knee opens.',
        fix: 'Keep hips and shoulders stacked vertically the whole rep and lift only as high as you can without rolling back.',
      },
      {
        mistake: 'Propping your head up on your forearm.',
        fix: 'Rest your head directly on the mat or a thin pillow, with the bottom arm extended along the floor and wrists off the ground.',
      },
      {
        mistake: 'Forcing a bigger range of motion.',
        fix: 'Open only to a comfortable range; a smaller, clean lift beats a big, sloppy one.',
      },
    ],
  },
  'Side-lying leg raises': {
    exercise: 'Side-lying leg raises',
    voiceSrc: './assets/voice/side-lying-leg-raises.mp3',
    voiceScript:
      "Side-lying leg raises. Lie on your side with your hips stacked, head resting on the mat or a thin pillow — not propped up on your forearm. Bend your bottom leg for stability and keep your top leg straight. Slowly lift that top leg about thirty to forty-five degrees, with your toes pointing forward, not toward the ceiling — that's what targets the glute. Then lower it over a slow three-second count; the slow descent is doing the work. Don't roll your hip backward as you lift, and don't bounce — height isn't the point. Exhale as you lift, then switch sides.",
    muscles: ['glutes', 'hips'],
    muscleLabel: 'Glute medius + lateral hip',
    steps: [
      'Lie on your side with hips stacked, head resting on the mat or a thin pillow — not propped on your forearm.',
      'Bend the bottom leg for stability and keep the top leg straight.',
      'Slowly lift the top leg 30 to 45 degrees, toes pointing forward (not toward the ceiling).',
      'Lower the leg with control over 3 seconds, exhaling as you lift.',
      'Finish the set, then switch to the other side.',
    ],
    dos: [
      'Keep hips stacked and the bottom leg bent for stability.',
      'Point your toes forward, not the ceiling — that targets the glute medius.',
      'Lower slowly over 3 seconds; the slow descent does the work.',
      'Exhale on the lift.',
    ],
    donts: [
      "Don't prop on your forearm — rest your head on the mat or a thin pillow.",
      "Don't roll your hip backward — that hijacks the glute work.",
      "Don't lift super high; height isn't the point.",
      "Don't bounce.",
    ],
    mistakes: [
      {
        mistake:
          'Rolling the hip backward as you lift — the leg goes higher but it becomes a hip-flexor move instead of a glute one.',
        fix: 'Keep hips stacked and toes pointing forward so the glute medius does the work.',
      },
      {
        mistake: 'Bouncing or lowering fast.',
        fix: 'Lower over a slow 3-second count — the controlled descent is where the work is.',
      },
      {
        mistake: 'Propping your head up on your forearm.',
        fix: 'Rest your head on the mat or a thin pillow and keep the top leg straight.',
      },
    ],
  },
  'Single-leg glute bridges': {
    exercise: 'Single-leg glute bridges',
    voiceSrc: './assets/voice/single-leg-glute-bridges.mp3',
    voiceScript:
      "Single-leg glute bridges. Set up like a regular glute bridge — on your back, knees bent, feet flat, arms relaxed at your sides with your palms up. Lift one foot off the mat, either with that knee tucked toward your chest or the leg extended straight. Now squeeze the glute on your standing leg first, drive through that heel, and lift your hips. Hold two seconds at the top and keep your pelvis level — picture balancing a glass of water on it. Lower slow, then switch legs after the set. Don't let your hips drop toward the lifted side, and don't load your wrists. And don't push past today's back pain ceiling.",
    muscles: ['glutes', 'hips', 'core'],
    muscleLabel: 'Glutes (single-leg) + core',
    steps: [
      'Lie on your back, knees bent, feet flat, arms relaxed at your sides with palms up.',
      'Lift ONE foot off the mat — knee tucked toward your chest or the leg extended straight.',
      'Squeeze the glute on your standing leg first, then drive through that heel to lift your hips.',
      'Hold at the top for 2 seconds, keeping your pelvis level.',
      'Lower slowly, then switch legs after the set.',
    ],
    dos: [
      'Squeeze the standing-leg glute first, then drive through the heel.',
      'Keep your pelvis level — like balancing a glass of water on it.',
      'Hold 2 seconds at the top.',
    ],
    donts: [
      "Don't load your wrists — keep arms relaxed at your sides, palms up.",
      "Don't let your hips drop toward the lifted-leg side.",
      "Don't push past today's back pain ceiling.",
    ],
    mistakes: [
      {
        mistake: 'Hips dropping toward the lifted-leg side.',
        fix: 'Keep them level — imagine balancing a glass of water on your pelvis.',
      },
      {
        mistake: 'Bearing weight through the wrists/hands.',
        fix: 'Keep your arms relaxed at your sides with palms up — no load through the wrists.',
      },
    ],
  },
  'Slow breathing': {
    exercise: 'Slow breathing',
    voiceSrc: './assets/voice/slow-breathing.mp3',
    voiceScript:
      "Let's finish with slow breathing. Sit comfortably or stay lying down, and let your eyes close if you like. Inhale through your nose for 4 counts, then exhale through your mouth for 6 counts. The longer exhale is the key part — it activates your rest-and-recover nervous system. Do 8 full rounds. This is the official workout-is-over signal, telling your body to switch out of effort mode. The main thing to avoid: don't rush just because the workout is done. The cool-down is actually where adaptation happens, so don't skip it.",
    muscles: ['core'],
    muscleLabel: 'Diaphragm (breathing / rest-and-recover)',
    steps: [
      'Sit comfortably or stay lying down; eyes can close.',
      'Inhale through your nose for 4 counts.',
      'Exhale through your mouth for 6 counts — longer than the inhale.',
      'Repeat for 8 full rounds.',
    ],
    dos: [
      'Exhale longer than you inhale (6 out, 4 in)',
      'Breathe through the nose in, mouth out',
      'Let your eyes close and slow down',
      'Treat this as the workout-is-over signal',
    ],
    donts: [
      "Don't rush because the workout is done",
      "Don't skip the cool-down — it's where adaptation happens",
      "Don't make the exhale shorter than the inhale",
    ],
    mistakes: [
      {
        mistake: 'Rushing the breaths because the workout is over',
        fix: "Slow down — the cool-down is when adaptation actually happens, so don't skip it.",
      },
      {
        mistake: 'Exhaling as fast as you inhale',
        fix: 'Stretch the exhale to 6 counts, longer than the 4-count inhale, to activate the rest-and-recover nervous system.',
      },
    ],
  },
  'Slow supine bicycle': {
    exercise: 'Slow supine bicycle',
    voiceSrc: './assets/voice/slow-supine-bicycle.mp3',
    voiceScript:
      "Let's do the slow supine bicycle. Lie on your back with your knees bent and your feet flat. Keep your arms relaxed at your sides, never behind your head; that protects your neck and your wrists. Bring one knee up toward your chest, then slowly extend that leg out as the other knee comes up. Keep it continuous and slow, like pedaling underwater. Keep your lower back glued to the mat the whole time, and exhale each time a leg extends. The main thing to avoid is speeding up; this is a control exercise, not cardio. Eight on each side, nice and slow.",
    muscles: ['core', 'hips'],
    muscleLabel: 'Core + hip flexors',
    steps: [
      'Lie on your back with knees bent and feet flat.',
      'Rest your arms relaxed at your sides, never behind your head.',
      'Bring one knee up toward your chest.',
      'Slowly extend that leg out as you bring the other knee up.',
      'Keep alternating slowly, like pedaling underwater, 8 each side.',
      'Keep your lower back glued to the mat and exhale on each leg extension.',
    ],
    dos: [
      'Keep your arms relaxed at your sides.',
      'Move slowly and controlled, like pedaling underwater.',
      'Keep your lower back glued to the mat.',
      'Exhale on each leg extension.',
    ],
    donts: [
      "Don't put your hands behind your head.",
      "Don't speed up; this is control, not cardio.",
      "Don't let your lower back lift off the mat.",
    ],
    mistakes: [
      {
        mistake: 'Going too fast and turning it into a cardio move.',
        fix: 'Slow right down and control each pedal, like moving underwater.',
      },
      {
        mistake: 'Bringing the hands behind the head.',
        fix: 'Keep your arms relaxed at your sides to protect your neck and wrists.',
      },
    ],
  },
  'Standing calf raises': {
    exercise: 'Standing calf raises',
    voiceSrc: './assets/voice/standing-calf-raises.mp3',
    voiceScript:
      "Standing calf raises. Stand tall with your feet about hip-width apart. Rest just a light fingertip touch on the wall for balance — no gripping, and no weight on your hand. Slowly lift your heels until you're up on the balls of your feet, taking about three seconds to rise. Hold for one second at the top, then lower back down slowly over three seconds. Breathe out as you lift, and in as you lower. The main thing: don't bounce for momentum — that slow, controlled tempo is what does the work. Aim for fifteen reps.",
    muscles: ['calves'],
    muscleLabel: 'Calves',
    steps: [
      'Stand tall with your feet hip-width apart.',
      'Rest a light fingertip touch on a wall for balance — no grip, no weight on your hand.',
      "Slowly lift your heels until you're on the balls of your feet — 3 seconds up.",
      'Hold 1 second at the top.',
      'Lower slowly back down — 3 seconds down.',
      'Exhale as you rise onto your toes, inhale as you lower. 15 reps.',
    ],
    dos: [
      'Stand tall, feet hip-width apart.',
      'Use a light fingertip touch on the wall for balance only.',
      '3 seconds up, hold 1 second, 3 seconds down.',
      'Exhale as you rise, inhale as you lower.',
    ],
    donts: [
      "Don't grip the wall — fingertips only, no weight on your hand.",
      "Don't bounce for momentum — slow tempo IS the exercise.",
    ],
    mistakes: [
      {
        mistake: 'Bouncing for momentum, which kills the work the calves are doing.',
        fix: 'Slow down — take 3 seconds up and 3 seconds down; the slow tempo is doing the heavy lifting.',
      },
      {
        mistake: 'Gripping the wall or leaning weight onto your hand.',
        fix: 'Use only a light fingertip touch for balance — no grip, no weight through the hand.',
      },
    ],
  },
  'Wall angels': {
    exercise: 'Wall angels',
    voiceSrc: './assets/voice/wall-angels.mp3',
    voiceScript:
      "Wall angels. Stand with your back flat against the wall, ribs down, chin gently tucked. Rest your elbows and wrists lightly on the wall, then slide both arms up, keeping that light contact the whole way. Then lower back down slowly, with control. Do two sets of ten slow reps. The main thing to hold: keep your back flat, don't arch your low back to reach higher, and don't shrug your shoulders up toward your ears. And watch your wrists. If they lift off the wall, just stop there. No forcing. This is bodyweight only, keeping the wrists neutral the whole time.",
    muscles: ['back', 'shoulders'],
    muscleLabel: 'Upper back + shoulder blades (scapular control)',
    steps: [
      'Stand with your back flat against the wall, ribs down, chin gently tucked.',
      'Rest your elbows and wrists lightly against the wall.',
      'Slide both arms up the wall, keeping elbows and wrists in light contact.',
      'If your wrists lift off the wall, stop there — no forcing.',
      'Slide your arms back down slowly with control. Do 2 sets of 10 slow reps.',
    ],
    dos: [
      'Keep your back flat on the wall, ribs down, chin gently tucked.',
      'Keep elbows and wrists lightly touching the wall as you slide up.',
      'Lower slowly, with control.',
    ],
    donts: [
      "Don't arch your low back to reach higher.",
      "Don't shrug your shoulders up toward your ears.",
      "Don't force past the point where your wrists lift off the wall.",
    ],
    mistakes: [
      {
        mistake: 'Arching the low back to reach the arms higher.',
        fix: 'Keep your back flat and ribs down — reach only as far as you can without arching.',
      },
      {
        mistake: 'Shrugging the shoulders up toward the ears.',
        fix: 'Keep your shoulders relaxed and down as the arms slide.',
      },
      {
        mistake: 'Forcing the arms higher after the wrists lift off the wall.',
        fix: 'Stop at the point where the wrists lose contact — no forcing.',
      },
    ],
  },
  'Wall lean (wrist on-ramp)': {
    exercise: 'Wall lean (wrist on-ramp)',
    voiceSrc: './assets/voice/wall-lean-wrist-on-ramp.mp3',
    voiceScript:
      "Wall lean, your wrist on-ramp. Stand a small step back from a wall, and place your palms flat on it at shoulder height, fingers pointing up. Keep your elbows soft — don't lock them. Now lean in gently, just enough that your palms take light weight, and keep breathing. This is a gentle rehab on-ramp, not a push-up, so nothing intense. Hold for fifteen to twenty seconds, shake your hands out, then do one more round. And the important one: stop right away if you feel anything in your wrist or thumb. When this feels like nothing, tell me and the next step unlocks.",
    muscles: ['forearms'],
    muscleLabel: 'Wrist / forearm (weight-bearing on-ramp)',
    steps: [
      'Stand a small step back from a wall.',
      'Place your palms flat on the wall at shoulder height, fingers pointing up, elbows soft.',
      'Lean in gently so your palms take LIGHT weight, and breathe.',
      'Hold 15-20 seconds, then shake your hands out.',
      'Repeat once more for 2 rounds total.',
    ],
    dos: [
      'Keep your palms flat on the wall at shoulder height, fingers up.',
      'Keep your elbows soft.',
      'Let your palms take only LIGHT weight, and breathe.',
      'Shake your hands out between the two rounds.',
    ],
    donts: [
      "Don't lock your elbows.",
      "Don't push hard — this is a rehab on-ramp, not a push-up.",
      "Don't continue through any wrist or thumb sensation — stop.",
    ],
    mistakes: [
      { mistake: 'Locking your elbows straight.', fix: 'Keep them soft and slightly bent.' },
      {
        mistake: 'Leaning in hard like a push-up.',
        fix: 'Lean gently so your palms take only LIGHT weight.',
      },
      {
        mistake: 'Pushing through a wrist or thumb twinge.',
        fix: 'Stop immediately at ANY wrist or thumb sensation.',
      },
    ],
  },
  'Wall sit': {
    exercise: 'Wall sit',
    voiceSrc: './assets/voice/wall-sit.mp3',
    voiceScript:
      "Wall sit. Stand with your back flat against the wall, then slide down until your knees are somewhere between ninety and a hundred-twenty degrees. Steeper is harder, shallower is easier, so pick what feels safe today. Keep your knees over your ankles, not past your toes. Rest your hands on your thighs or let them hang loose, and don't push on the wall. Breathe normally and stay relaxed up top, because the main thing people get wrong here is holding their breath. Hold steady and track your time — this is your weekly benchmark, and always honor a sore-knee day. Shallower is completely fine.",
    muscles: ['quads'],
    muscleLabel: 'Quadriceps (front thighs)',
    steps: [
      'Stand with your back flat against a wall.',
      'Slide down until your knees are between 90 and 120 degrees — steeper is harder, shallower is easier; pick what feels safe today.',
      'Keep your knees stacked over your ankles, not past your toes.',
      'Rest your hands on your thighs or let them hang loose — no pushing on the wall.',
      'Hold steady, breathing normally. This is your weekly progress benchmark — track the time held.',
    ],
    dos: [
      'Keep your back flat against the wall.',
      'Slide deeper only as far as feels comfortable.',
      'Keep knees stacked over your ankles.',
      'Breathe normally and stay relaxed in your upper body.',
    ],
    donts: [
      "Don't push on the wall with your hands — let your arms hang.",
      "Don't let your knees travel past your toes.",
      "Don't hold your breath.",
      "Don't slide deep on a sore-knee day — shallower is fine.",
    ],
    mistakes: [
      {
        mistake: 'Holding your breath during the hold.',
        fix: 'Breathe normally and keep your upper body relaxed.',
      },
      {
        mistake: 'Letting your knees drift forward past your toes.',
        fix: 'Keep knees stacked over your ankles; slide deeper only as comfortable.',
      },
      {
        mistake: 'Pushing on the wall with your hands.',
        fix: 'Rest your hands on your thighs or let them hang loose.',
      },
    ],
  },
  'Wrist extension — left': {
    exercise: 'Wrist extension — left',
    voiceSrc: './assets/voice/wrist-extension-left.mp3',
    voiceScript:
      "Wrist extension, left side. Extend your left arm forward with your palm facing down. Use your right hand to gently pull your left fingers up toward you. You're looking for just a mild stretch on the underside of your forearm — nothing intense. Keep the elbow soft and hold for about forty-five seconds, breathing the whole time. The main thing: keep it easy and steady, no bouncing. And if you feel any pain or pins-and-needles, ease right off. Gentle is the goal here.",
    muscles: ['forearms'],
    muscleLabel: 'Wrist flexors (underside of forearm)',
    steps: [
      'Extend your left arm forward, palm facing down.',
      'With your right hand, gently pull your left fingers up toward you.',
      'Ease into a mild stretch on the underside of the forearm — keep it gentle.',
      'Hold about 45 seconds, breathing steadily with a soft elbow.',
    ],
    dos: [
      'Keep the left palm facing down.',
      'Pull the fingers up gently with your right hand.',
      'Keep an easy, steady hold with a soft elbow.',
      'Breathe throughout the hold.',
    ],
    donts: [
      "Don't bounce the stretch.",
      "Don't push into pain — ease off at any pain or pins-and-needles.",
      "Don't force it — stay gentle, only a mild stretch.",
    ],
    mistakes: [
      {
        mistake: 'Bouncing to try to deepen the stretch.',
        fix: 'Hold it easy and steady instead — no bouncing.',
      },
      {
        mistake: 'Pushing until it hurts or tingles.',
        fix: 'Ease off the moment you feel any pain or pins-and-needles.',
      },
      {
        mistake: 'Stretching too hard.',
        fix: 'Keep it gentle — you only want a mild stretch on the underside of the forearm.',
      },
    ],
  },
  'Wrist extension — right': {
    exercise: 'Wrist extension — right',
    voiceSrc: './assets/voice/wrist-extension-right.mp3',
    voiceScript:
      "Wrist extension on the right side. Extend your right arm forward with your palm facing down. Use your left hand to gently pull your right fingers up toward you. You're looking for a mild stretch on the underside of the forearm, nothing more. Hold it easy and steady for about forty-five seconds. Keep breathing, and keep the elbow soft. The main thing here is to stay gentle — no bouncing, no forcing it. And if you feel any pain or pins-and-needles, ease right off. This is a light stretch, not a strain. Nice and relaxed.",
    muscles: ['forearms'],
    muscleLabel: 'Forearm flexors (underside)',
    steps: [
      'Extend your right arm forward, palm facing down.',
      'With your left hand, gently pull your right fingers up toward you.',
      'Ease into a mild stretch on the underside of the forearm.',
      'Hold about 45 seconds — breathe steadily and keep the elbow soft.',
    ],
    dos: [
      'Keep it gentle — a mild stretch only.',
      'Hold easy and steady, no bouncing.',
      'Keep the elbow soft and keep breathing.',
    ],
    donts: [
      "Don't bounce or force the stretch.",
      "Don't push into pain or pins-and-needles — ease off.",
    ],
    mistakes: [
      {
        mistake: 'Yanking the fingers hard to get a deeper stretch.',
        fix: 'Stay gentle — you only want a mild stretch on the underside of the forearm.',
      },
      {
        mistake: 'Feeling pain or pins-and-needles and holding through it.',
        fix: "Ease off right away until it's just a light, comfortable stretch.",
      },
      {
        mistake: 'Bouncing to push the range.',
        fix: 'Hold one easy, steady position for the full 45 seconds.',
      },
    ],
  },
  'Wrist flexion — left': {
    exercise: 'Wrist flexion — left',
    voiceSrc: './assets/voice/wrist-flexion-left.mp3',
    voiceScript:
      "Wrist flexion, left side. Extend your left arm forward with your palm facing down. Use your right hand to gently press your fingers down. You should feel the stretch along the top of your forearm. Keep your elbow soft, and hold it easy and steady for about forty-five seconds, breathing the whole time. Don't bounce, and stay gentle with the pressure. If you feel any pain, or any pins-and-needles, ease off right away. That's your cue to back out of the stretch.",
    muscles: ['forearms'],
    muscleLabel: 'Wrist extensors — top of forearm',
    steps: [
      'Extend your left arm forward with the palm facing down.',
      'With your right hand, gently press your left fingers down.',
      'Feel the stretch on the TOP of the forearm; keep the elbow soft.',
      'Hold for 45 seconds, breathing steadily.',
    ],
    dos: [
      'Keep the elbow soft.',
      'Press the fingers down gently with your right hand.',
      'Feel the stretch on the top of the forearm.',
      'Hold easy and steady, breathing throughout.',
    ],
    donts: [
      "Don't bounce — keep the hold steady.",
      "Don't push into pain or pins-and-needles — ease off.",
      "Don't force it — stay gentle.",
    ],
    mistakes: [
      {
        mistake: 'Bouncing or jerking through the stretch.',
        fix: 'Hold it easy and steady with no bouncing.',
      },
      {
        mistake: 'Pushing until it hurts or you feel pins-and-needles.',
        fix: 'Ease off right away and stay gentle.',
      },
    ],
  },
  'Wrist flexion — right': {
    exercise: 'Wrist flexion — right',
    voiceSrc: './assets/voice/wrist-flexion-right.mp3',
    voiceScript:
      'Wrist flexion, right side. Reach your right arm forward with your palm facing down. Then use your left hand to gently press your right fingers down. You should feel the stretch across the top of your forearm. Keep it an easy, steady hold — no bouncing — and let your elbow stay soft while you breathe. Hold for about forty-five seconds. The main thing here is to stay gentle. If you feel any pain or pins-and-needles, ease right off. This is a stretch, not a strain.',
    muscles: ['forearms'],
    muscleLabel: 'Top of the forearm (wrist extensors)',
    steps: [
      'Extend your right arm forward with your palm facing DOWN.',
      'With your left hand, gently press your right fingers DOWN.',
      'Feel the stretch across the TOP of your forearm.',
      'Hold for 45 seconds — easy and steady, breathing, elbow soft.',
    ],
    dos: [
      'Keep the right palm down and press the fingers down gently.',
      'Keep it an easy, steady hold and breathe.',
      'Keep the elbow soft.',
    ],
    donts: [
      "Don't bounce the stretch.",
      "Don't force it — stay gentle.",
      "Don't push through pain or pins-and-needles — ease off.",
    ],
    mistakes: [
      { mistake: 'Bouncing or forcing the hold.', fix: 'Hold easy and steady — no bouncing.' },
      {
        mistake: 'Pushing on despite pain or pins-and-needles.',
        fix: 'Ease off the stretch right away.',
      },
    ],
  },
  // ===== END AUTO-GENERATED =====
};
