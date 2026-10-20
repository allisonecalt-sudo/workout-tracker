// program.ts — the workout program, as data, plus its pure resolvers.
//
// What this is: every shared Exercise block, the PROGRAM (one WeekPlan row per
// Sat-anchored week, rounds 1-2), the load-time guards, the calendar constants
// (rounds, skipped weeks), the pure resolvers over PROGRAM, and the exercise
// guide / safety lines keyed by exercise name.
// Why it exists: code-shape step 2 (Oct 13 2026) — it was ~2,500 lines of
// app.ts's 16.8k; this is a PURE MOVE, comments and order exactly as they were.
// What's decided: this module is a leaf. It imports only erased types from
// week.ts and never app.ts / state — so the resolvers here take `date` as a
// REQUIRED parameter (named program*); app.ts keeps same-named thin wrappers
// (getWeekPlan and friends) that, given no date, ask program-week.ts for the
// plan row of the week the clock is in (by week key), so every call site is
// untouched.
// What's next: step 3 turns the rows into literal data (program/program-data.json).
// Links: second-brain/projects/workout-tracker/app-audit-2026-09-24/next-level-2026-09-26/
// fable-review-restructure-2026-10-13-2000.md §4 "Step 2" + plan-amendments-2026-10-13-2030.md.

import type { WeekKey } from './week.js';

export type WorkoutId = 'A' | 'B' | 'C';

// v54 (Sep 27 2026) — Workout D: "30 min elliptical", her Sep 27 NotebookLM
// reflection ("we definitely need a 4th element a week... call it Workout D").
// Deliberately NOT folded into WorkoutId: WeekPlan.workouts is a
// Record<WorkoutId, Workout> and every encoded week (R1W1 through R2W5) would
// need a D entry too — D isn't part of the A/B/C weekly rotation or its
// PROGRAM data at all, it's one fixed extra any day, so it stays a second,
// narrower type used only where a SAVED SESSION (not a planned week) needs to
// carry it. WorkoutId itself, and every Record<WorkoutId,...>/PROGRAM site,
// is untouched.
export type AnyWorkoutId = WorkoutId | 'D';

export type Exercise = {
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

export type Workout = {
  id: AnyWorkoutId;
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

export type Phase = 'warmup' | 'main' | 'upperBack' | 'cooldown';

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
//  - Walks STAY at 10/10/25 min strolling pace across all weeks. SUPERSEDED Sep
//    26 2026: the A/B ride earned 10 → 12 min in Round 2 Week 5 (her "now I
//    should have ABC workout 5 available to me"); C's 25 is unearned, holds.
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

export type WeekPlan = {
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
export function weekPlanTitle(wp: WeekPlan): string {
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
      'Stand sideways to a wall, RIGHT arm nearest. Raise arm to shoulder height, rotate palm up, place it flat on the wall (fingers spread). Slowly turn your body AWAY from the wall — feel it in the biceps + front of the shoulder. This is NOT a wrist stretch: keep the wrist comfortable; if it complains, bend the elbow slightly. Back off if it is sharp, climbing, or still there tomorrow.',
    durationSec: 45,
    isTimed: true,
  },
  {
    name: 'Biceps stretch — left',
    reps: '45 sec',
    notes:
      'Stand sideways to a wall, LEFT arm nearest. Raise arm to shoulder height, rotate palm up, place it flat on the wall (fingers spread). Slowly turn your body AWAY from the wall — feel it in the biceps + front of the shoulder. NOT a wrist stretch: keep the wrist comfortable; bend the elbow slightly if needed. Back off if it is sharp, climbing, or still there tomorrow.',
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
    // v55 (Sep 27 2026): "1–2 kg (your pick)" replaces a fixed "1 kg" in the
    // reps line — the LOAD CHIP on the step is where she actually picks it,
    // by pain, every set (rule 8e).
    reps: '2 sets · 12 reps each side · 1–2 kg (your pick)',
    // PROGRAM: the "(Lisa, Jun 18: lifting strains the neck)" attribution is
    // clinical bookkeeping — the instruction itself ("don't lift it") stays.
    // v55: "NO weight yet" / "add the 1 kg only when you say you are ready"
    // retired — the LOAD CHIP is that same "when you say" call, made live.
    notes:
      'Arm hanging, wrist NEUTRAL/straight. Keep your HEAD DOWN — do NOT lift it. Drive the elbow UP, squeeze the shoulder blade toward your spine. Lower slow. Keep the wrist straight throughout; back off if it is sharp, climbing, or still there tomorrow.',
  },
  {
    name: '1 kg biceps curl',
    // v55 fix r2 (Sep 27 2026, checker's should #2): `name` stays the key
    // (progression lookups, voice note, history — see the type's own
    // comment), but the title she SEES still read "1 kg biceps curl" right
    // above the LOAD CHIP — the same fixed-weight contradiction spec item 1
    // was supposed to remove. `label` is what displayName() shows instead.
    label: 'Biceps curl',
    // v55: same "1–2 kg (your pick)" note — see the prone row comment above.
    reps: '2 sets · 12 reps · 1–2 kg (your pick)',
    // PROGRAM: the "(Lisa, Jun 18: ... caused that)" attribution dropped —
    // the instruction ("hold lightly") stays.
    notes:
      'Hold the weight LIGHTLY — keep wrist AND fingers neutral, never bending back / hyperextending. Elbow tucked at your side, forearm hanging. Curl the forearm up — only the forearm moves, elbow stays pinned. Lower slow. Back off if it is sharp, climbing, or still there tomorrow.',
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
    // v46: halved, and ONE rule across the session — bird dog, the banner and
    // this all say the pain rule (hers + Lisa via her, v60 Sep 28 2026: "a
    // little pain is OK, keep moving; back off if it's sharp, climbing, or
    // still there next morning" — supersedes her Sep 14 "it shouldn't hurt"
    // wording, which read as an alarm). The Jul-3 provenance lives above.
    notes:
      'Stand a small step from a wall, palms flat on it at shoulder height, fingers up, elbows soft. Lean in gently so the palms take light weight — breathe. 15-20 sec, shake the hands out, once more. A little pain is fine — back off if it is sharp, climbing, or still there tomorrow. When this feels like nothing, say so and the next rung (counter-height lean) unlocks.',
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
// Her pain rule governs (v60, Sep 28 2026): a little pain is OK, keep moving;
// back off if it's sharp, climbing, or still there the next morning.
const BIRD_DOG_LEGS: Exercise = {
  name: 'Bird dog (legs only)',
  reps: '2 sets · 6 each side · 2-sec hold',
  // v46: halved — the Sep-7 provenance is in the comment above; the pain rule
  // stays on every safety line (pressure fine; back off if sharp/climbing/
  // still there tomorrow).
  notes:
    'Hands and knees, hands flat under the shoulders (fists, or hands up on the couch, if flat palms complain). Both hands stay down. One leg straight back to level, hold 2 sec, lower with control. Pressure is fine — a little pain is fine too; back off if it is sharp, climbing, or still there tomorrow.',
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

export const PROGRAM: WeekPlan[] = [
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
            // PROGRAM: day-1 of Lisa Cohen's clearance, next bump planned for
            // week 4 — clearance/plan bookkeeping, not hers to read here.
            notes: 'On forearms only (NOT hands — wrists still off).',
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
            // PROGRAM: held (not doubled) for Week 4 to consolidate the new
            // movement; the climb-then-add-a-set rule needs no extra Lisa
            // sign-off — none of that is hers to read, just form + safety.
            notes:
              'On forearms only (NOT hands — wrists still off). A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
            // PROGRAM: bumped 30s -> 33s to formalize what she'd already been
            // holding (May 19 + May 26 both logged 33s) — history, not hers.
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
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
            // PROGRAM: held again for Week 5 to stay on the slow cadence;
            // climb-then-add-a-set needs no extra Lisa sign-off — bookkeeping.
            notes:
              'On forearms only (NOT hands — wrists still off). A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
            // PROGRAM: held at 33s from Week 5, a stabilization week before
            // the next bump decision — that's program pacing, not hers.
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
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
              // PROGRAM: "HELD at 1×15s" just restates the unchanged reps
              // field — dropped as noise, not a movement instruction.
              'On forearms only (NOT hands — wrists still off). A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
            // PROGRAM: bumped 33s -> 36s to formalize what she'd already
            // been holding (Jun 9 + Jun 16 both logged 36s) — history.
            notes: 'Hands rest on thighs or hang. No pushing on wall.',
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
              // PROGRAM: "HELD at 1×15s" just restates the unchanged reps
              // field — dropped as noise, not a movement instruction.
              'On forearms only (NOT hands — wrists still off). A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
              // PROGRAM: bumped 12 -> 14 (held at 12 since Week 3; back 0/10
              // the whole time) — the green light that justified the bump.
              'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          HIP_HINGE_W8,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '36 sec hold',
            notes:
              // PROGRAM: held at 36s from Week 7 — a 2-week window at this
              // load before the next bump decision.
              'Hands rest on thighs or hang. No pushing on wall.',
            durationSec: 36,
            isTimed: true,
          },
          {
            name: 'Modified dead bug',
            reps: '8 each side',
            notes:
              // PROGRAM: bumped 6 -> 8 (stuck at 6 for 9 weeks) — history.
              'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 20 sec hold',
            notes:
              // PROGRAM: climbing 15 -> 20s (Jun 18, progression-rules said
              // to climb it, back 0/10) — the history behind the target.
              'On forearms only (NOT hands — wrists still off). Building toward 30s, then a 2nd set. A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
              // PROGRAM: held at 14 from Week 8.
              'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          HIP_HINGE_W8,
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '40 sec hold',
            notes:
              // PROGRAM: bumped 36 -> 40s (held at 36 since Wk7); cap
              // 45-60s per progression-rules.md.
              'Hands rest on thighs or hang. No pushing on wall.',
            durationSec: 40,
            isTimed: true,
          },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            notes:
              // PROGRAM: bumped 8 -> 10 (was frozen at 8) — climbing toward
              // the 12 cap.
              'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 30 sec hold',
            notes:
              // PROGRAM: climbing 25 -> 30s.
              'On forearms only (NOT hands — wrists still off). At a clean 30s → add a 2nd set. A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
            // PROGRAM: bumped 10 -> 12, toward the 15/side cap. No movement
            // guidance left once the bump history is dropped — no Tips row.
          },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            // PROGRAM: bumped 8 -> 10, toward the 12 cap — same as above.
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
            // PROGRAM: new Jun 29 2026 — C's biggest gap was zero standing
            // leg strength; started at 12, below A's 14, since C is lighter.
            notes: 'Arms crossed; wall behind shoulder if wobbly.',
          },
          { name: 'Glute bridges', reps: '18 reps · 2-sec hold' },
          {
            name: 'Single-leg glute bridges',
            reps: '8 each side',
            // PROGRAM: new Jun 29 2026 (the audit's "best glute move"),
            // started at 8/side, below B's 12 — a fresh slot for C.
            notes: 'Climb toward 15, then tempo / foot-elevated.',
          },
          {
            name: 'Side-lying leg raises',
            reps: '12 each side',
            // PROGRAM: added Jun 29 2026 (meatier-Friday) — lateral-hip work
            // C never had before.
            notes:
              'Back-gentle, no balance. Climb toward the 20/side cap, then ankle band / longer lever.',
          },
          { name: 'Modified dead bug', reps: '8 each side' },
          {
            name: 'Standing calf raises',
            reps: '18 reps',
            // PROGRAM: the audit's one move meant to push genuinely hard.
            notes:
              'Last set near failure (0-2 reps left). Fingertip touch on wall for balance only — NO grip.',
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
              // PROGRAM: held at 14 from Week 8.
              'Arms crossed over chest. Wall behind shoulder if balance wobbly.',
          },
          HIP_HINGE_W8,
          {
            name: 'Eccentric step-down',
            reps: '2 sets · 5 each leg',
            // PROGRAM: new from the Jun-20 research pass — the downhill-hiking move.
            notes:
              "Stand on a low, sturdy step with your weight on ONE leg; let the other foot hang just off the edge. SLOWLY lower the hanging heel toward the floor over 3-4 seconds — control it, don't drop — then drive back up through the standing leg. Light fingertip touch on a wall/rail for balance ONLY — no grip, no weight on the hand (wrist stays out of it). Keep the standing knee tracking over the toes, not caving in. Start with a low step and small range; the slow lowering is the work. Stop the set if the knee pinches.",
          },
          { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
          {
            name: 'Wall sit',
            reps: '45 sec hold',
            notes:
              // PROGRAM: bumped 40 -> 45s (Jul 3) — she'd already held 43s
              // on Jul 1, so the plan caught up + a small nudge.
              'Hands rest on thighs or hang. No pushing on wall. Cap 45-60s — graduate at a clean 60s.',
            durationSec: 45,
            isTimed: true,
          },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            // PROGRAM: carried 10 from Week 9 (cap 12).
            notes: 'Arms relaxed at sides on mat. Move only legs.',
          },
          {
            name: 'Forearm plank',
            reps: '1 set · 30 sec hold',
            // PROGRAM: carried 30s from Week 9.
            notes:
              'On forearms only (NOT hands — wrists still off). At a clean 30s add a 2nd set. A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
            // PROGRAM: carried 12 from Week 9, toward the 15/side cap.
          },
          { name: 'Slow supine bicycle', reps: '8 each side' },
          {
            name: 'Modified dead bug',
            reps: '10 each side',
            // PROGRAM: carried 10 from Week 9, toward the 12 cap.
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
            // PROGRAM: carried from Week 9 — the standing compound C had lacked.
            notes: 'Arms crossed; wall behind shoulder if wobbly.',
          },
          { name: 'Glute bridges', reps: '18 reps · 2-sec hold' },
          {
            name: 'Single-leg glute bridges',
            reps: '8 each side',
            // PROGRAM: carried from Week 9.
            notes: 'Climb toward 15, then tempo / foot-elevated.',
          },
          {
            name: 'Side-lying leg raises',
            reps: '12 each side',
            // PROGRAM: carried from Week 9.
            notes: 'Climb toward the 20/side cap, then ankle band / longer lever.',
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
          // PROGRAM: round-2 restart at 12 (she was at 14 before the break).
          notes: 'Arms crossed over chest; wall behind shoulder if balance wobbly.',
        },
        HIP_HINGE_W8,
        { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
        {
          name: 'Wall sit',
          reps: '35 sec hold',
          // Sep 24 2026, v48 P8: "streak" → "showing up" (DECISIONS §5: the word
          // is gone from the UI; there's no streak to break). Meaning unchanged.
          // PROGRAM: round-2 restart at 35s (she held 45s pre-break) — don't
          // chase the old number; showing up is the asset.
          notes: 'Hands rest on thighs or hang. No pushing on wall.',
          durationSec: 35,
          isTimed: true,
        },
        {
          name: 'Modified dead bug',
          reps: '8 each side',
          // PROGRAM: round-2 restart at 8 (was 10).
          notes: 'Arms relaxed at sides on mat. Move only legs.',
        },
        {
          name: 'Forearm plank',
          reps: '1 set · 20 sec hold',
          // PROGRAM: round-2 restart at 20s (was 30).
          notes:
            'On forearms only (NOT hands — wrists still off). A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
        // PROGRAM (both lines below): round-2 restart, back to the pre-break number.
        { name: 'Side-lying leg raises', reps: '12 each side' },
        { name: 'Side-lying clamshells', reps: '10 each side' },
        {
          name: 'Single-leg glute bridges',
          reps: '10 each side',
          // PROGRAM: round-2 restart at 10 (was 12).
          notes: 'Toward the 15/side cap once sessions land clean.',
        },
        {
          name: 'Modified dead bug',
          reps: '8 each side',
          // PROGRAM: round-2 restart at 8 (was 10).
          notes: 'Supine bicycle returns in a later week.',
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
          // PROGRAM: round-2 restart at 10 (was 12).
          notes: 'Arms crossed; wall behind shoulder if wobbly.',
        },
        // PROGRAM: round-2 restart at 15 (was 18).
        { name: 'Glute bridges', reps: '15 reps · 2-sec hold' },
        {
          name: 'Single-leg glute bridges',
          reps: '8 each side',
          // PROGRAM: held at 8/side (no restart needed here).
          notes: 'Climb toward 15, then tempo / foot-elevated.',
        },
        {
          name: 'Side-lying leg raises',
          reps: '10 each side',
          // PROGRAM: round-2 restart at 10 (was 12).
          notes: 'The 20/side cap still stands.',
        },
        { name: 'Modified dead bug', reps: '8 each side' },
        {
          name: 'Standing calf raises',
          reps: '15 reps',
          // PROGRAM: round-2 restart at 15 (was 18) — the one move meant to
          // push genuinely hard.
          notes:
            'Last set near failure (0-2 reps left). Fingertip touch on wall for balance only — NO grip.',
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
          // PROGRAM (CHECK M6, Sep 26 2026): same 12 reps as last week — the
          // change this week is effort (stop ~2 reps short on the last round
          // instead of ~6).
          notes:
            'On the last round, stop about 2 reps short — never to failure. Arms crossed over chest; wall behind shoulder if balance is wobbly.',
        },
        HIP_HINGE_W8,
        { name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' },
        {
          name: 'Wall sit',
          reps: '40 sec hold',
          // PROGRAM (CHECK M6, Sep 26 2026): she held 38 s last week; seconds
          // aren't the point this week, the knee angle is.
          notes:
            'DEEPER, not longer — slide down until the knees come toward 90°. Hands rest on thighs or hang. No pushing on the wall.',
          durationSec: 40,
          isTimed: true,
        },
        FULL_DEAD_BUG,
        {
          name: 'Forearm plank',
          reps: '1 set · 20 sec hold',
          notes:
            'SAME 20 sec, roughly DOUBLE the work: hold it WITH a posterior pelvic tilt — tuck the tailbone under, squeeze the glutes, ribs down. Forearms only, NOT hands. A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
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
          // PROGRAM (CHECK M6, Sep 26 2026): her best glute-med move (81%
          // MVIC, best of 12 tested — DiStefano 2009), so it stays exactly as
          // it is; the change this week is effort.
          notes: 'On the last round, stop about 2 reps short, not 6.',
        },
        {
          name: 'Side-lying clamshells',
          reps: '10 each side',
          // PROGRAM: the TheraBand kit is confirmed home (Sep 7) — the band
          // loops in starting Week 3, not this week (bodyweight only for
          // now). Her words the same minute: "dont raise too fast."
        },
        {
          name: 'Single-leg glute bridges',
          reps: '10 each side',
          // PROGRAM (CHECK M6, Sep 26 2026): already the hard version — the
          // small dial this week is the squeeze hold below.
          notes: 'Squeeze for 2-3 seconds at the top of every rep.',
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
          // PROGRAM: C stays the lighter day (10, not 12 like A/B).
          notes:
            'Last round: stop about 2 reps short, not 6. Arms crossed; wall behind shoulder if wobbly.',
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
          // PROGRAM: C stays MODIFIED on purpose (legs only, arms resting) —
          // the full dead bug lives in A and B this week.
          notes: 'Legs only, arms resting.',
        },
        {
          name: 'Standing calf raises',
          reps: '15 reps',
          // PROGRAM: the one move meant to push genuinely hard this week.
          notes:
            'Last set near failure (0-2 reps left). Fingertip touch on wall for balance only — NO grip.',
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
    'The band goes on — tie it first (just below). Same movement as always. <strong>10 each side, not 15</strong> — the band is the increase. If your hips roll backward to get the knee higher, the band is too strong for now: slide it lower down your thighs, or take it off and finish bodyweight. That is the right call, not a failure.',
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
  // PROGRAM (Tips audit, Sep 26 2026): "in for the squats in A (C keeps its
  // 10)" is program bookkeeping — dropped from what she reads.
  notes:
    'Fingertips on the couch for balance only — no gripping, no weight through the hands. Front foot flat, back heel up, chest tall. Straight down, back knee toward the floor; push through the front heel to stand. Last set stop about 2 short. Knee pinches or you wobble? Smaller range — the right call.',
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
    // PROGRAM: bumped 40 -> 45 — she held 42 on Sep 7 and 43 on Sep 14, and
    // two sessions over target is the rule for one nudge.
    notes:
      'Keep the depth: knees toward 90°. Hands on thighs or hanging, no pushing on the wall. Graduate at a clean 60.',
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
  // v55 · fix r1 (Sep 27 2026): was "holding the 1 kg" — contradicted the
  // regenerated voice note on this same step, which already says "holding one
  // or two kilos, whichever you pick" (exercise-detail.ts). Her-pick language
  // now, matching the LOAD CHIP everywhere else.
  reps: '12 reps · 2 sets each round · holding 1–2 kg (your pick)',
  // PROGRAM: "anything heavier is a Lisa question" (clearance bookkeeping)
  // dropped — and so is the "1 kg ceiling" left behind it (rule 8e: no Lisa
  // gate, her pick by pain). The pain rule replaces it, same wording as the
  // voice note.
  notes:
    'Same hinge, now HOLDING 1–2 kg (your pick) the way you already do — it hangs from the hands, wrists neutral, light grip. Hinge at the hips, soft knees, flat/neutral spine; feel it in hamstrings + glutes. Do NOT round the low back. A little pain is OK, keep moving; sharp, climbing, or still there next morning — back off.',
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
      // v48 · final (Sep 25 2026): the title said "(bodyweight)" over a drawing
      // that says 1 kg — mid-set she couldn't tell which. Display only; the key
      // stays so the voice note, detail card and history still match.
      label: 'Prone row',
      // v55 (Sep 27 2026): the old "bodyweight or 1 kg" / "your call" text
      // predates the LOAD CHIP and the 2 kg — dropped in favor of `row`'s own
      // reps/notes (already "1–2 kg (your pick)"), one wording, not two.
      notes:
        'Arm hanging, wrist neutral, light grip. Head down — do not lift it. Drive the elbow up, squeeze the shoulder blade toward your spine, lower slow. Pain tells — back off if it is sharp, climbing, or still there tomorrow.',
    },
    {
      ...curl,
      // PROGRAM: the 2 kg progression trigger (easy at 3×20, two sessions
      // running) is engine bookkeeping, not hers to read.
      // v55 · fix r1 (Sep 27 2026): this override still said "the 1 kg" —
      // stale next to the LOAD CHIP, same class of bug as the row override
      // above already fixed. Weight-neutral now; the chip is where she picks.
      notes:
        'Hold the weight lightly — wrist and fingers neutral, never bending back. Elbow tucked, forearm hanging; only the forearm moves. Lower slow. Pain tells — back off if it is sharp, climbing, or still there tomorrow.',
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

// ---------------------------------------------------------------------------
// ROUND 2 · WEEK 5 (Sat Sep 26 – Fri Oct 2 2026) — shipped Sep 26 2026, on her
// go. Her words tonight: "the whole of week five is a mess because it's not
// doing week five ... now I should have ABC workout 5 available to me".
// Standing brief: "always progressing but at a pace that will still keep me
// engaged" (Sep 24), "dont raise too fast" (Sep 7). Proposal + receipts:
//   second-brain/self/health/workout-app-audit-2026-09-24/next-level-2026-09-26/WEEK5-PROPOSAL-2026-09-26.md
//
// ONE dial: the A/B ride 10 → 12 min. Everything else HOLDS.
//
// WHY one: Week 4 went 3/3 (Thu A · Fri C · Sat B via the swing) and she felt
// good (body 8→8, 8→9, 9→9), but two body signals spoke for the first time:
//   - wrist 4 after C (Fri; her 7 on a misread scale, saved as 4 on her "Yes flip
//     it") and 4 before → 3 after B (Sat). Her words: "a little bit worked
//     definitely but it's okay" (Sep 25) · "Wrist is getting used to exercise but
//     lightly doing it is important" (Sep 26).
//   - back 2 after C (same flipped row) and 0 before → 1 after B.
// Engine spec §9: wrist 3+ → the upper/hands lane rests; back 1+ in two sessions
// → legs + core rest, and "the cardio step still happens" (spec, Weeks 5-12 note).
// The ride is the one lane with neither signal in it: no spinal load, and no grip
// load if the hands stay light (fixed handles, elliptical-york-bx200.md).
//
// THE RIDE (CARDIO_AB rung 1, spec §4): earned by the ladder's own gate. The last
// two A/B rides were logged at the full 10 (10:02 Thu A, 10:00 Sat B, both level
// 5). The gate asks for target − 2 = 10. Same step NAME ('Outdoor walk'), so the
// walk, apartment and elliptical lanes all read the new minutes off `reps`
// (walkStepMinutes / heroCardioLine). No voice note bakes "10 min" (the walk
// script says "even ten minutes counts"; the how-to says "the minutes on your
// screen").
//
// DELIBERATELY NOT IN THIS WEEK:
//  - C's ride stays 25: one C ride logged (25:01 Fri), and rung 30 wants two at
//    28+. Her note on it: "Knee ok felt it one dot on eliptical".
//  - Row + curl stay 2 × 12 at 1 kg. The engine's her-ask step (2 × 15) waits: wrist
//    4 → 3, and the curl came back "right", not "easy". THE 1 KG CEILING HOLDS
//    (Sep 25: "it still needs to keep within 1K").
//  - Wall lean stays 2 × 15-20 s (wrist). Her 22:13 "I need to be able to do the
//    timer again" is the set-2 timer, an app fix, not a program change.
//  - Wall sit stays 45: she held 44 on Sep 24, under target, so not earned.
//  - Split squat exactly as Week 4 (only its 2nd week). The back spoke on the C
//    and B days, not the split-squat day (A's back wasn't answered). TRIPWIRE for
//    Week 6: back 1+ after A, or 3+ any day → A goes back to bodyweight squats.
//  - Band clamshell 10/side, bird dog legs-only, calf raises, bridges, dead bug,
//    plank: hold (back).
//  - Lisa-gated, still parked: anything above 1 kg · wall push-up · counter-height
//    lean · more palm load · the Sep-7 road's Week-5 single-leg calf raise
//    (single-leg/balance is on Lisa's list, engine spec §2).
// PACE GUARD: max one change per workout. A and B get the same small dial; C none.
// ---------------------------------------------------------------------------
const R2W4_PLAN = PROGRAM[PROGRAM.length - 1]!;
if (R2W4_PLAN.round !== 2 || R2W4_PLAN.weekNum !== 4) {
  throw new Error('R2W5: expected the last PROGRAM row to be Round 2 Week 4');
}
// A and B have carried the shared WALK_WARMUP_AB since R2W1. If that ever stops
// being true, fail loudly instead of silently dropping a warm-up move.
if (
  R2W4_PLAN.workouts.A.warmup !== WALK_WARMUP_AB ||
  R2W4_PLAN.workouts.B.warmup !== WALK_WARMUP_AB
) {
  throw new Error('R2W5: expected Week 4 A and B to use WALK_WARMUP_AB');
}

// Only the ride's minutes move. Belly breathing, pelvic tilts and glute squeezes
// travel unchanged, and the name stays 'Outdoor walk' (walkStepMinutes, the three
// cardio lanes, the detail card and the voice note all key off it).
const WALK_WARMUP_AB_12: Exercise[] = WALK_WARMUP_AB.map((ex) =>
  ex.name === 'Outdoor walk' ? { ...ex, reps: '12 min' } : ex
);

PROGRAM.push({
  round: 2,
  weekNum: 5,
  startsOn: '2026-09-26',
  label: 'Round 2 — Week 5 · a 12-minute ride in A and B, the rest holds',
  workouts: {
    A: {
      ...R2W4_PLAN.workouts.A,
      description:
        'Same moves as last week · ride 12 min (elliptical or walk) · 2 rounds · ~32 min',
      warmup: WALK_WARMUP_AB_12,
    },
    B: {
      ...R2W4_PLAN.workouts.B,
      description:
        'Same moves as last week · ride 12 min (elliptical or walk) · 2 rounds · ~32 min',
      warmup: WALK_WARMUP_AB_12,
    },
    // C unchanged on purpose: its 25-min ride isn't earned up yet (one C ride
    // logged, knee "one dot"), and C stays the lighter day.
    C: { ...R2W4_PLAN.workouts.C },
  },
});

// v61.2 (Oct 13 2026) — R2 Week 6: a LIGHT RESTART after being sick.
// WHAT: A, B and C are all the same tiny session: a 10-min easy ride + two
// gentle breath/pelvic moves + her own stretches, ~20 min. No strength moves.
// WHY: she got sick (likely COVID) ~Sep 29; last real workout Mon Sep 28, no
// sessions Oct 3-12. Her words (Oct 13): "need to start slow" · "rlly extreme on
// light" · "put in 3 light workouts for this week" · "then we can assess next
// week". The Oct 3 week is SKIPPED_WEEKS 'Sick' so this row is Week 6, not 7.
// getWeekPlan falls back to the latest plan, so this light week intentionally
// carries into Oct 17+ until the next plan is written after her assessment.
const R2W5_PLAN = PROGRAM[PROGRAM.length - 1]!;
if (R2W5_PLAN.round !== 2 || R2W5_PLAN.weekNum !== 5) {
  throw new Error('R2W6: expected the last PROGRAM row to be Round 2 Week 5');
}
// Same ride step the other weeks use (name stays EXACTLY 'Outdoor walk' — the
// cardio lanes / elliptical picker key off it), softer notes, nothing else in
// the warmup.
const LIGHT_RIDE_WARMUP: Exercise[] = [
  {
    name: 'Outdoor walk',
    reps: '10 min',
    notes:
      'Lowest level, slow. You should be able to talk the whole time. Stop early if you need to — that still counts.',
  },
];
// Reuse WALK_WARMUP_AB's own two gentle objects so name-keyed lookups match.
const LIGHT_MAIN: Exercise[] = WALK_WARMUP_AB.filter(
  (ex) => ex.name === 'Belly breathing' || ex.name === 'Pelvic tilts'
);
if (LIGHT_MAIN.length !== 2) {
  throw new Error('R2W6: expected Belly breathing + Pelvic tilts in WALK_WARMUP_AB');
}
const lightRestart = (id: WorkoutId): Workout => ({
  id,
  name: R2W5_PLAN.workouts[id].name,
  description: 'Light restart after being sick · 10 min easy ride + stretches · ~20 min',
  rounds: 1,
  warmup: LIGHT_RIDE_WARMUP,
  main: LIGHT_MAIN,
  cooldown: STRETCH_COOLDOWN,
});

PROGRAM.push({
  round: 2,
  weekNum: 6,
  startsOn: '2026-10-10',
  label: 'Round 2 — Week 6 · light restart after being sick',
  workouts: {
    A: lightRestart('A'),
    B: lightRestart('B'),
    C: lightRestart('C'),
  },
});

// v65 (Oct 20 2026) — R2 Week 7: 35% of Week 5, the first step back to 100%.
// WHAT: every Week 5 move comes back, 1 round (Week 5 = 2), at about two-thirds
// of Week 5's reps/seconds (½ × ⅔ ≈ 35%). Ride: A/B 10 min (the light week's
// number), C 15 (Week 5 = 25). Weights at the 1 kg end.
// WHY: her words (Oct 20 18:00-18:03): "the goal is to get back to 100 back to
// where we left off" · "so 25% eans ading in the other stuff but 35 percent-
// lets do 35" · "yes exactly". Road (her yes): Wk7 35% → Wk8 ~70% (2 rounds,
// ⅔ reps) → Wk9 = Week 5 as it was; each step only if the next morning's chest
// and back are not worse, else repeat the week.
// A's squat: BODYWEIGHT, not the split squat — back was 3 before B on Oct 20,
// which is Week 5's own tripwire ("back 3+ any day → A goes back to bodyweight
// squats"). The split squat returns in Week 8 if the back is quiet.
// Every name stays EXACTLY as Week 5 (voice notes, detail cards, move_feel and
// the 'Outdoor walk' cardio lanes key off it); only reps/durationSec change.
const R2W6_PLAN = PROGRAM[PROGRAM.length - 1]!;
if (R2W6_PLAN.round !== 2 || R2W6_PLAN.weekNum !== 6) {
  throw new Error('R2W7: expected the last PROGRAM row to be Round 2 Week 6');
}
// Week 7's reps per exercise name, per block. A name missing here = a Week 5
// move that was renamed: fail loudly instead of shipping Week 5's numbers.
const W7_REPS: Record<string, { reps: string; durationSec?: number }> = {
  'Bodyweight hip hinge': { reps: '8 reps · 1 set · holding 1 kg' },
  'Glute bridges': { reps: '8 reps · 2-sec hold at top' },
  'Wall sit': { reps: '30 sec hold', durationSec: 30 },
  'Full dead bug': { reps: '5 each side' },
  'Forearm plank': { reps: '1 set · 15 sec hold', durationSec: 15 },
  'Side-lying leg raises': { reps: '8 each side' },
  'Side-lying clamshells': { reps: '7 each side · yellow band (tied into a loop)' },
  'Single-leg glute bridges': { reps: '7 each side' },
  'Standing calf raises': { reps: '8 reps' },
  'Wall angels': { reps: '1 set · 7 slow reps' },
  'IWYT raises': { reps: '1 set · 5 each (I, W, Y, T)' },
  'Prone row (bodyweight)': { reps: '1 set · 8 reps each side · 1 kg' },
  '1 kg biceps curl': { reps: '1 set · 8 reps · 1 kg' },
  'Bird dog (legs only)': { reps: '1 set · 4 each side · 2-sec hold' },
  'Wall lean (wrist on-ramp)': { reps: '1 × 15 sec', durationSec: 15 },
};
// C keeps its own (lighter) Week 5 numbers, so its two-thirds differ from A/B's.
const W7_REPS_C: Record<string, { reps: string }> = {
  'Bodyweight squats': { reps: '7 reps · 3-1-3 tempo' },
  'Glute bridges': { reps: '10 reps · 2-sec hold' },
  'Single-leg glute bridges': { reps: '5 each side' },
  'Side-lying leg raises': { reps: '7 each side' },
  'Modified dead bug': { reps: '5 each side' },
  'Standing calf raises': { reps: '10 reps' },
};
const scaleW7 = (
  items: Exercise[],
  table: Record<string, { reps: string; durationSec?: number }>
) =>
  items.map((ex) => {
    const next = table[ex.name];
    if (!next) throw new Error(`R2W7: no Week 7 reps for '${ex.name}'`);
    return { ...ex, ...next };
  });
const rideW7 = (warmup: Exercise[], minutes: number): Exercise[] =>
  warmup.map((ex) => (ex.name === 'Outdoor walk' ? { ...ex, reps: `${minutes} min` } : ex));
// A's squat for Week 7: Week 3's bodyweight squat object (cues + tempo), 8 reps.
const W7_SQUAT_A: Exercise = (() => {
  const found = R2W3_PLAN.workouts.A.main.find((ex) => ex.name === 'Bodyweight squats');
  if (!found) throw new Error('R2W7: expected Bodyweight squats in Week 3 workout A');
  return { ...found, reps: '8 reps · 3-1-3 tempo' };
})();
const W5A = R2W5_PLAN.workouts.A;
const W5B = R2W5_PLAN.workouts.B;
const W5C = R2W5_PLAN.workouts.C;

PROGRAM.push({
  round: 2,
  weekNum: 7,
  startsOn: '2026-10-24',
  label: 'Round 2 — Week 7 · back toward 100%: every move, 1 round (35%)',
  workouts: {
    A: {
      ...W5A,
      description: 'Week 5 moves at 35% · 1 round · ride 10 min · ~22 min',
      rounds: 1,
      warmup: rideW7(W5A.warmup, 10),
      main: [
        W7_SQUAT_A,
        ...scaleW7(
          W5A.main.filter((ex) => ex.name !== 'Supported split squat'),
          W7_REPS
        ),
      ],
      upperBack: scaleW7(W5A.upperBack ?? [], W7_REPS),
    },
    B: {
      ...W5B,
      description: 'Week 5 moves at 35% · 1 round · ride 10 min · ~22 min',
      rounds: 1,
      warmup: rideW7(W5B.warmup, 10),
      main: scaleW7(W5B.main, W7_REPS),
      upperBack: scaleW7(W5B.upperBack ?? [], W7_REPS),
    },
    C: {
      ...W5C,
      description: '15-min cardio (elliptical or walk) + 1-round strength block · ~25 min',
      rounds: 1,
      warmup: rideW7(W5C.warmup, 15),
      main: scaleW7(W5C.main, W7_REPS_C),
    },
  },
});

// --- Resolvers -----------------------------------------------------------
//
// These two resolvers are the CALENDAR lookup: a date in, the plan row whose
// startsOn covers it out. `date` is a required parameter (program.ts never
// imports app.ts). Since v62 (step 5c) the plan row for "now" after the
// completion launch is NOT found this way: program-week.ts finds it by week key
// (planForWeekKey), so no date is faked for it. These resolvers still serve
// pre-launch dates, history and every caller that holds a real date.

export function programWeekPlan(date: Date): WeekPlan {
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

export function programWorkoutById(id: WorkoutId, date: Date): Workout {
  return programWeekPlan(date).workouts[id];
}

export function programFutureWeekPlans(date: Date): WeekPlan[] {
  return programFutureWeekPlansAfter(programWeekPlan(date));
}

/** The encoded weeks AFTER `current` (a row of PROGRAM), oldest -> newest. */
export function programFutureWeekPlansAfter(current: WeekPlan): WeekPlan[] {
  // indexOf, not findIndex-by-weekNum: week numbers repeat across rounds.
  return PROGRAM.slice(PROGRAM.indexOf(current) + 1);
}

// Encoded weeks BEFORE the current one, oldest → newest. Powers the collapsed
// "Past weeks" surface on home so previous programming stays browsable (the
// archive-not-delete principle) without expanding heavy blocks by default.
export function programPastWeekPlans(date: Date): WeekPlan[] {
  return programPastWeekPlansBefore(programWeekPlan(date));
}

/** The encoded weeks BEFORE `current` (a row of PROGRAM), oldest -> newest. */
export function programPastWeekPlansBefore(current: WeekPlan): WeekPlan[] {
  return PROGRAM.slice(0, PROGRAM.indexOf(current));
}

export function getProgramWeekCount(): number {
  return PROGRAM.length;
}

// Build a "this exercise: A → B" line for the next-week preview. Returns null
// if the exercise is unchanged between weeks. Comparison is intentionally
// stringy + name-keyed (the simplest thing that works for rep/duration bumps).
export function diffExercise(prev: Exercise | undefined, next: Exercise): string | null {
  if (!prev) return `+ ${next.name} (new) — ${next.reps ?? ''}`;
  if (prev.reps === next.reps && prev.durationSec === next.durationSec) return null;
  return `${next.name}: ${prev.reps ?? '—'} → ${next.reps ?? '—'}`;
}

// All bump lines for a single workout (A/B/C) going current → next. Empty
// array if no changes.
export function diffWorkout(prev: Workout, next: Workout): string[] {
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

// EXERCISE_GUIDE is keyed only by exercise names referenced in WORKOUTS.
// Eliana-era entries removed per audit §8 (group 3P); Lisa Cohen wrist
// entries moved to archive/hand-routine-2026-05-15/ on 2026-05-15.
export const EXERCISE_GUIDE: Record<string, { howTo: string }> = {
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
  // v55 · fix r3 (Sep 28 2026, nice): the W/Y/T set was originally introduced
  // as Lisa Cohen's move (Jun 18 2026) — attribution kept here in the
  // comment, not in the user-visible howTo text below (this EXERCISE_GUIDE
  // fallback only renders when EXERCISE_HOWTO has no entry for the name, so
  // it isn't on screen today, but the Lisa-gating copy sweep should have
  // caught it too — rule 8e is "get rid of Lisa" everywhere, not just what's
  // currently reachable).
  'IWYT raises': {
    howTo:
      "The W, Y, T set, plus the I position you added (Jul 4) — so: I, W, Y, T. Lie face DOWN on the mat with your forehead resting on a folded towel, so the neck stays long and relaxed. Thumbs point UP the entire time — that keeps the wrists neutral, zero palm pressure. One rep = put your arms in the letter's shape, lift them a few centimeters OFF the floor by squeezing your upper back, hold one breath, lower. Your hands touching the ground between reps is exactly right — the floor IS the rest position; you only lift for the squeeze. The letters: I — arms straight down along your sides, lift by drawing the shoulder blades down and together. W — elbows bent and pulled toward your ribs so your arms make a W; squeeze the blades together. Y — both arms overhead in a narrow V, like a referee calling goalposts. T — arms straight out to the sides at shoulder height. Do all reps of one letter, then move to the next. Small controlled lifts beat big swings — if your neck starts doing the work, the lift is too big. About 8 of each letter, 2 rounds, and keep the whole thing gentle for the neck.",
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
      "Your first hands-on-the-floor move since April, at the beginner rung — LEGS ONLY, both hands stay down the whole time. Set up on hands and knees: hands flat under the shoulders with the fingers turned slightly out, knees under the hips, back long and flat. If flat palms bother you, make fists and rest on the knuckles; if that still bothers you, put the hands up on the couch or a low step — the higher your hands, the less weight goes through them. Slide one leg straight back until it is level with your body, hold 2 seconds, and lower it with control. Alternate sides — 6 each side, 2 sets. Keep the hips square (a hip bone shouldn't roll open) and the neck long, eyes on the floor. THE RULE: pressure and stretch are fine, and a little pain is fine too — back off if it's sharp, climbing, or still there the next morning; shake the hands out and call it for today. The full bird dog, where one hand also lifts, is the next rung. Not this week.",
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
export const SAFETY_LINE: Record<string, string> = {
  'Supported split squat':
    'Fingertips on the couch for balance only — no weight through the hands.',
  'Bodyweight hip hinge': 'Do NOT round the low back.',
  'Wall sit': 'Knees toward 90°. Hands on thighs or hanging — no pushing on the wall.',
  'Full dead bug': 'Low back pressed to the mat the whole time.',
  'Forearm plank':
    'Forearms only, not hands. A little pain is OK — back off if it is sharp, climbing, or still there tomorrow.',
  'Wall angels': 'If the wrists lift off, stop there — no forcing.',
  'IWYT raises': 'Thumbs up, wrist neutral. Stop if the neck complains.',
  'Prone row (bodyweight)':
    'Head down. Pain tells — back off if it is sharp, climbing, or still there tomorrow.',
  '1 kg biceps curl': 'Wrist neutral, never bending back. Pain tells.',
  'Bird dog (legs only)':
    'Pressure is fine — back off if it is sharp, climbing, or still there tomorrow.',
  'Wall lean (wrist on-ramp)':
    'A little pain is fine — back off if it is sharp, climbing, or still there tomorrow.',
  'Side-lying clamshells': 'Hips rolling back? Band lower, or off.',
  'Standing calf raises': 'Fingertips on the wall for balance only.',
  'Bodyweight squats': 'Wall behind the shoulders if wobbly.',
};

export const PROGRAM_START_DATE = '2026-05-02';

// Rounds — each fresh start of the program. Week numbers restart at 1 inside
// each round; everything from older rounds stays fully browsable (archive-not-
// delete). Round 2 = the post-summer restart, her call Aug 30 2026: "the past
// data goes to an archive — accessible, but that was a closed chapter. Now
// we're starting a new round." Each start date must be a Saturday (weeks are
// Sat-Fri throughout the app).
export const ROUNDS: { num: number; start: string }[] = [
  { num: 1, start: PROGRAM_START_DATE },
  { num: 2, start: '2026-08-29' },
];

/** TEST-ONLY seed (v62.1; app.ts calls it only under automation, from its __wt
 * hook block): appends hypothetical rounds (e.g. a Round 3) to ROUNDS, skipping
 * any number already there. Same idea as replaceCalendarMarks: ROUNDS is the one
 * data source, so seeding it changes every reader together. */
export function appendRounds(rounds: { num: number; start: string }[]): void {
  for (const r of rounds) if (!ROUNDS.some((x) => x.num === r.num)) ROUNDS.push({ ...r });
}

export function getRoundFor(date: Date): { num: number; start: string } {
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
export const SKIPPED_WEEKS: Record<string, string> = {
  '2026-07-11': 'Sick', // Jul 11-17 2026 — sick week, left blank, no level-up
  '2026-10-03': 'Sick', // Oct 3-9 2026 — sick week (likely COVID, Sep 29 onset), left blank, no level-up
  // Jul 25 – Aug 28 2026 — the summer break between Round 1 and Round 2
  // (trip prep + vacation). Labeled rows, no level-up, honest gaps.
  '2026-07-25': 'Break',
  '2026-08-01': 'Break',
  '2026-08-08': 'Break',
  '2026-08-15': 'Break',
  '2026-08-22': 'Break',
};

/** Which calendar marks to put in SKIPPED_WEEKS: Saturdays (YYYY-MM-DD) per
 * kind. A kind that is left out is untouched; `sick: []` means "no Sick weeks". */
export type CalendarMarks = { sick?: string[]; break?: string[] };

/** TEST-ONLY seed (v62, step 5d; app.ts calls it only under automation, from
 * its __wt hook block): REPLACES the SKIPPED_WEEKS entries of each kind given.
 * SKIPPED_WEEKS is the ONE data source the week clock, getProgramWeek and every
 * weekly view read, so seeding it changes them all together - there is no
 * separate "test mode" branch in the app. */
export function replaceCalendarMarks(marks: CalendarMarks): void {
  const kinds: [keyof CalendarMarks, string][] = [
    ['sick', 'Sick'],
    ['break', 'Break'],
  ];
  for (const [field, label] of kinds) {
    const saturdays = marks[field];
    if (!saturdays) continue;
    for (const k of Object.keys(SKIPPED_WEEKS))
      if (SKIPPED_WEEKS[k] === label) delete SKIPPED_WEEKS[k];
    for (const sat of saturdays) SKIPPED_WEEKS[sat] = label;
  }
}

// WK2 fix r2 (Sep 27 2026, checker's should #2/#3 test coverage): a real
// Round-2 Week-6 PROGRAM row doesn't exist yet (§2.6), so a test proving "the
// live-recomputed plan differs from the pinned one" needs SOME way to make
// two weeks' content provably different without hand-writing a whole
// WeekPlan literal per test. Clones the row directly below the target week
// (the same row planForWeekKey's own "repeat" fallback would pick), re-labels
// it as the given round/week/startsOn, and swaps one exercise's display name
// for `marker` — test-only, guarded the same way as every hook below.
export function injectMarkerProgramWeek(
  round: number,
  weekNum: number,
  startsOn: string,
  workoutId: WorkoutId,
  marker: string
): void {
  const base = planForWeekKey({ round, week: weekNum - 1 }).plan;
  const clone = JSON.parse(JSON.stringify(base)) as WeekPlan;
  clone.round = round;
  clone.weekNum = weekNum;
  clone.startsOn = startsOn;
  const firstEx = clone.workouts[workoutId].warmup[0];
  // `label` (not `name`) — displayName() always prefers it, so the marker
  // shows up on screen regardless of any name-based special-casing (e.g. the
  // "Outdoor walk" → "Cardio" swap).
  if (firstEx) firstEx.label = marker;
  PROGRAM.push(clone);
}

/** The line Home shows when a round has no plan rows (see planForWeekKey). */
export function noPlanLine(round: number): string {
  return `No plan written for Round ${round} yet — showing the last plan.`;
}

/** The PROGRAM row for a completion-model week key: an exact round+weekNum
 * match if PROGRAM has one, else the highest weekNum below it in the SAME
 * round (§2.3 planFor's "repeats" fallback) - "Same moves as Week N" until
 * she writes the next row.
 *
 * v62.1 (Oct 14 2026): a round with NO rows at all (a Round 3 added to ROUNDS
 * before its plan is written) used to fall to PROGRAM[0] - Round 1 Week 1
 * "Starter" - silently. It now falls back to the highest row at or below the
 * key in (round, weekNum) order, i.e. the previous round's last written row,
 * and says so: `noPlanForRound` is that round's number (null whenever the
 * round has rows). Home turns it into a visible line (her fail-loud rule).
 * tests/program.test.ts also fails if a ROUNDS entry has no PROGRAM row, so
 * this path is a safety net, not the plan. PROGRAM[0] remains only if the key
 * sorts before every row (impossible while Round 1 exists), with a warn. */
export function planForWeekKey(key: WeekKey): {
  plan: WeekPlan;
  repeatsWeek: number | null;
  noPlanForRound: number | null;
} {
  const sameRound = PROGRAM.filter((wp) => (wp.round ?? 1) === key.round);
  const exact = sameRound.find((wp) => wp.weekNum === key.week);
  if (exact) return { plan: exact, repeatsWeek: null, noPlanForRound: null };
  const below = sameRound.filter((wp) => wp.weekNum < key.week);
  const highest = below[below.length - 1];
  if (highest) return { plan: highest, repeatsWeek: highest.weekNum, noPlanForRound: null };
  console.warn(
    `[week] no PROGRAM row at all for round ${key.round} - falling back to the last row before it`
  );
  const before = PROGRAM.filter((wp) => (wp.round ?? 1) < key.round);
  const lastWritten = before[before.length - 1];
  if (lastWritten) {
    return { plan: lastWritten, repeatsWeek: lastWritten.weekNum, noPlanForRound: key.round };
  }
  console.warn(`[week] nothing before round ${key.round} either - falling back to PROGRAM[0]`);
  const fallback = PROGRAM[0]!;
  return { plan: fallback, repeatsWeek: fallback.weekNum, noPlanForRound: key.round };
}
