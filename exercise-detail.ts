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

export type MuscleRegion =
  | 'shoulders'
  | 'chest'
  | 'core'
  | 'back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

const MUSCLE_BASE = '#525c54'; // muted body fill
const MUSCLE_ON = 'var(--accent)'; // highlighted target

export function muscleDiagram(regions: MuscleRegion[]): string {
  const on = new Set(regions);
  const fill = (r: MuscleRegion): string => (on.has(r) ? MUSCLE_ON : MUSCLE_BASE);
  // viewBox 0 0 120 200, front view, arms at sides.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" class="muscle-svg" role="img" aria-label="Muscle target">
    <!-- head + neck -->
    <circle cx="60" cy="20" r="12" fill="${MUSCLE_BASE}" />
    <rect x="55" y="31" width="10" height="8" rx="3" fill="${MUSCLE_BASE}" />
    <!-- shoulders -->
    <rect x="38" y="39" width="44" height="12" rx="6" fill="${fill('shoulders')}" />
    <!-- chest -->
    <rect x="43" y="52" width="34" height="16" rx="6" fill="${fill('chest')}" />
    <!-- core / abdomen -->
    <rect x="45" y="69" width="30" height="26" rx="6" fill="${fill('core')}" />
    <!-- arms -->
    <rect x="30" y="41" width="8" height="52" rx="4" fill="${MUSCLE_BASE}" />
    <rect x="82" y="41" width="8" height="52" rx="4" fill="${MUSCLE_BASE}" />
    <!-- hips / glutes -->
    <rect x="44" y="96" width="32" height="16" rx="6" fill="${fill('glutes')}" />
    <!-- thighs / quads -->
    <rect x="45" y="113" width="14" height="40" rx="6" fill="${fill('quads')}" />
    <rect x="61" y="113" width="14" height="40" rx="6" fill="${fill('quads')}" />
    <!-- hamstrings share the thigh block visually; a thin back-strip cue -->
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
      'Keep your weight in your heels.',
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
};
