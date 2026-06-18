// exercise-visuals.ts — sourced 2026-05-15 for the Phase 2 visual layer.
//
// Each exercise gets:
//   - loop: optional path to a still JPG (relative to index.html). When present,
//     the exercise screen shows this as the primary visual. (Phase 2 sources
//     are stills from yuhonas/free-exercise-db — Unlicense / public domain.)
//   - youtubeId: a hand-picked instructional video. Embedded inline via
//     iframe when the user taps "Watch full video"; never navigates away.
//     Chosen for: visible form cues, reputable channel (PT / OT / clinical
//     where possible), short-to-medium length.
//   - source: where the visual comes from. 'free-exercise-db' = Unlicense,
//     'youtube-only' = no still, video embed is primary.
//   - license: short note on legal basis for inclusion.
//   - attribution: optional credit text rendered in the report / UI tooltip.
//
// Coverage notes: MuscleWiki was the original first choice but their ToS
// (api.musclewiki.com/api-terms, checked 2026-05-15) explicitly forbids
// scraping or offline caching of their images/videos. ExerciseDB is paywalled.
// So free-exercise-db (Unlicense, 800+ exercises) is the only no-attribution
// permissive source — we got JPG pairs for ~12 of the 24 exercises. The rest
// use YouTube embeds as primary, which Allison explicitly requested ("can you
// embed the videos") and which YouTube's ToS permits via the iframe API.

export interface ExerciseVisual {
  loop?: string;
  youtubeId?: string;
  source: 'free-exercise-db' | 'youtube-only';
  license: string;
  attribution?: string;
}

export const EXERCISE_VISUALS: Record<string, ExerciseVisual> = {
  // ----- Warm-up & cool-down (slow movements) -----
  'Belly breathing': {
    youtubeId: 'kgTL5G1ibIo',
    source: 'youtube-only',
    license: 'YouTube embed (Terms of Service Section 5)',
    attribution: 'Diaphragmatic Breathing Technique — Whitney Zweeres, PTA',
  },
  'Pelvic tilts': {
    loop: 'assets/exercises/pelvic-tilts-0.jpg',
    youtubeId: 'U0dfnyfhpwk',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution: 'Still: yuhonas/free-exercise-db. Video: MedBridge — Supine Pelvic Tilt',
  },
  'Glute squeezes': {
    youtubeId: 'a63bCK4GGEc',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Isometric Glutes — Sports Surgery Clinic Physiotherapy',
  },

  // ----- Workout A & B main block -----
  'Bodyweight squats': {
    loop: 'assets/exercises/bodyweight-squats-0.jpg',
    youtubeId: 'DlS-GAF8Edg',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution: 'Still: yuhonas/free-exercise-db. Video: bodyweight squat tutorial',
  },
  'Glute bridges': {
    loop: 'assets/exercises/glute-bridges-0.jpg',
    youtubeId: 'OUgsJ8-Vi0E',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution:
      'Still: yuhonas/free-exercise-db (Butt Lift Bridge). Video: NASM glute bridge form',
  },
  'Wall sit': {
    youtubeId: 'y-wV4Venusw',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'How To: Wall-Sit — YouTube instructional',
  },
  'Side-lying clamshells': {
    youtubeId: '2c5xiz4q7ow',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Clam Shell Exercise — Margaret Martin, Physical Therapist',
  },
  'Modified dead bug': {
    loop: 'assets/exercises/modified-dead-bug-0.jpg',
    youtubeId: 'GbSC02oU3To',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution: 'Still: yuhonas/free-exercise-db. Video: Hinge Health PT — Dead Bug',
  },
  'Heel taps': {
    // ARCHIVED 2026-05-15: Heel taps swapped out of Workout A in week 3
    // (replaced by Forearm plank — Lisa Cohen cleared forearm load May 15).
    // Entry retained so re-adding heel taps in a future week needs no re-curation.
    youtubeId: 'Xxv-9mA3qLc',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Supine Heel Taps — B3 Physical Therapy',
  },
  'Forearm plank': {
    // Added 2026-05-15 for week-3 swap (replaces Heel taps in Workout A).
    // Forearms only — hands still off per Lisa Cohen wrist protocol.
    // Video curated 2026-06-06: forearm-specific (hands stay off the floor).
    youtubeId: 'mH5Sfb_KTGg',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'How to do a Forearm Plank, The Right Way — Well+Good',
  },

  // ----- Cool-down -----
  'Knees-to-chest hold': {
    loop: 'assets/exercises/knees-to-chest-hold-0.jpg',
    youtubeId: 'LugNxxfIdvo',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution: 'Still: yuhonas/free-exercise-db (One Knee To Chest). Video: Double Knee to Chest',
  },
  'Figure-4 stretch': {
    loop: 'assets/exercises/figure-4-stretch-0.jpg',
    youtubeId: '-g0nuyTHMrI',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution:
      'Still: yuhonas/free-exercise-db (Piriformis-SMR). Video: Ask Doctor Jo — Piriformis Figure 4',
  },
  'Seated forward fold': {
    loop: 'assets/exercises/seated-forward-fold-0.jpg',
    youtubeId: 'oJX8EKF3TqM',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution:
      'Still: yuhonas/free-exercise-db (Spinal Stretch, weaker match). Video: Seated Forward Fold beginner tutorial',
  },
  'Slow breathing': {
    youtubeId: 'LiUnFJ8P4gM',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: '4-7-8 Calm Breathing — Dr. Andrew Weil method',
  },

  // ----- Workout B specifics -----
  'Side-lying leg raises': {
    loop: 'assets/exercises/side-lying-leg-raises-0.jpg',
    youtubeId: 'dBQXWsdrnfo',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution:
      'Still: yuhonas/free-exercise-db (Side Leg Raises). Video: Pain Science PT — Dr. Orit Hickman',
  },
  'Single-leg glute bridges': {
    loop: 'assets/exercises/single-leg-glute-bridges-0.jpg',
    youtubeId: '18GVqjfHy-M',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution: 'Still: yuhonas/free-exercise-db. Video: Single Leg Bridge step-by-step tutorial',
  },
  'Slow supine bicycle': {
    youtubeId: 'R2RUQC8x9rY',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Supine Bicycle — Workout Dojo (slow, controlled variant)',
  },
  'Standing calf raises': {
    youtubeId: 'aZh9tCFh46o',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Standing Calf Raises — Dr. Raczkowski, DPT, Center For Total Back Care',
  },

  // ----- Walks -----
  'Outdoor walk': {
    loop: 'assets/exercises/outdoor-walk-0.jpg',
    youtubeId: 'enYITYwvPAQ',
    source: 'free-exercise-db',
    license: 'Unlicense (public domain) + YouTube embed (ToS)',
    attribution:
      'Still: yuhonas/free-exercise-db (Trail Running/Walking). Video: Fast walking 30-min reference',
  },

  // ----- Wrist PT (Lisa Cohen protocol) -----
  // No exact tuna-can-rehab video exists, so we use the closest generic wrist
  // rehab videos. The text instructions (kept in EXERCISE_GUIDE) carry the
  // specific Lisa Cohen cues.
  'Left wrist stretch': {
    youtubeId: 'D4-jQu5GfBg',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution:
      'Wrist Flexor + Extensor Stretch — AskDoctorJo. Replaced 2026-06-18 (old embed 404).',
  },
  'Right wrist stretch': {
    youtubeId: 'D4-jQu5GfBg',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution:
      'Wrist Flexor + Extensor Stretch — AskDoctorJo. Replaced 2026-06-18 (old embed 404).',
  },
  'Left flexion/extension (tuna can)': {
    youtubeId: 'Aky1uJBS5UY',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Wrist Pain Rehab Exercises — generic PT reference',
  },
  'Right flexion/extension (tuna can)': {
    youtubeId: 'Aky1uJBS5UY',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Wrist Pain Rehab Exercises — generic PT reference',
  },
  'Left radial deviation (tuna can)': {
    youtubeId: 'pwodoGsoIpM',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Wrist Radial Deviation with Weight — Ask Doctor Jo',
  },
  'Right radial deviation (tuna can)': {
    youtubeId: 'pwodoGsoIpM',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Wrist Radial Deviation with Weight — Ask Doctor Jo',
  },

  // ----- Upper-back strengthening block (Lisa Cohen, May 31 2026) -----
  // Videos curated 2026-06-06. Wrist stays neutral on both — clinical sources.
  'Wall angels': {
    youtubeId: 'BbejQ2-On5o',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Wall Angels for Scapular/Glenohumeral Coordination — TherEx',
  },
  'Scapular squeezes': {
    youtubeId: 'b1snr_g3MZY',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'How to Do a Standing Scapular Retraction — MedBridge',
  },

  // ----- Week-6 additions (2026-06-06) -----
  // Hip-hinge starts bodyweight (no load); 1 kg prone row + curl phase into the
  // upper-back block. Videos curated 2026-06-06. Wrist stays neutral on the
  // loaded moves; no still JPGs sourced — the how-to SVG renders as the still.
  'Bodyweight hip hinge': {
    youtubeId: '2W_gXhut5S8',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'How to Do a Hip Hinge — Hinge Health (PT). Replaced 2026-06-18 (old embed 404).',
  },
  'Prone row (bodyweight)': {
    youtubeId: 'CFt3WjCBbpc',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution:
      'Prone W/T/Y Scapular Retraction — Peak Form Health Center. Bodyweight, wrist-neutral. Replaced 2026-06-18 (old embed 404).',
  },
  '1 kg biceps curl': {
    youtubeId: 'ykJmrZ5v0Oo',
    source: 'youtube-only',
    license: 'YouTube embed (ToS)',
    attribution: 'Dumbbell Biceps Curl — neutral-wrist form reference',
  },
};
