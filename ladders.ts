// ladders.ts — the progression engine's DATA (Sep 25 2026)
//
// WHAT: the 14 ladders (12 strength + 2 cardio), transcribed from
// PROGRESSION-ENGINE-SPEC-2026-09-24.md Part 1 §3 + §4, and START_STATE /
// CLEARANCES per Part 2 §8/§11.
//
// WHY a separate file from progression.ts: the spec's own split (§7) — the
// rungs' reps/notes/gates can be edited (and new content added as it's
// authored, S6) without touching the decision logic, and vice versa.
//
// WHY these types MIRROR app.ts's Exercise/Workout/WorkoutId/WeekPlan shapes
// instead of importing them: app.ts imports getWeekPlan()'s pieces FROM this
// file (via progression.ts), so importing the other way would be circular.
// TypeScript's structural typing makes the two interchangeable as long as the
// shapes match — verified by the golden-cutover test in progression.test.ts.
//
// DEVIATION FROM THE SPEC'S §8 TYPE: `Rung.slots` here is
// `Partial<Record<Letter, Exercise[]>>` (an ARRAY per letter), not a single
// Exercise. Reason: several ladders put more than one exercise on the same
// letter at once — Bridges (C carries both the double bridge AND the
// single-leg bridge) and Side hip (B carries both the leg raise AND the
// clamshell). A single Exercise per letter can't express that.

export type WorkoutId = 'A' | 'B' | 'C';
export type Letter = WorkoutId;

export type Exercise = {
  name: string;
  reps?: string;
  notes?: string;
  durationSec?: number;
  isTimed?: boolean;
  label?: string;
  safety?: string;
};

export type Workout = {
  id: WorkoutId;
  name: string;
  description: string;
  warmup: Exercise[];
  main: Exercise[];
  upperBack?: Exercise[];
  cooldown: Exercise[];
  rounds: number;
};

export type WeekPlan = {
  weekNum: number;
  round?: number;
  startsOn: string;
  label?: string;
  workouts: Record<WorkoutId, Workout>;
};

export type Lane = 'UPPER' | 'CARDIO' | 'CORE' | 'LEGS';
export type RungKind = 'T' | 'V' | 'MIN' | 'LISA';
export type Block = 'main' | 'upperBack' | 'none';

export type Rung = {
  id: string;
  kind: RungKind;
  slots: Partial<Record<Letter, Exercise[]>>;
  minutesDelta: number;
  resetsReps: boolean;
  contentReady: boolean;
  gate?: 'wallSitHeld' | 'cardioMinutes';
  /** Display-only: fires the "earned moment" copy (spec §5) when this rung is reached. */
  earnedMoment?: string;
};

export type Ladder = {
  id: string;
  lane: Lane;
  order: number;
  block: Block;
  rungs: Rung[]; // rungs[0] = R0 = today
};

export type LadderState = {
  rung: number;
  changedWeek: string | null;
  herAsk: boolean;
};

export type Clearance = {
  rungId: string;
  date: string;
  words: string;
  source: 'her relay of Lisa';
};

// Empty on purpose (Sep 25 2026): the four historical clearances the spec
// names (1 kg grip + hinge Sep 19, forearm plank position May 15, back green
// light Jul 4, bird dog legs-only Sep 7) are already BAKED INTO the R0 rungs
// below — they don't gate any future rung, so there's nothing to seed here.
// Claude appends a row here only after relaying a NEW Lisa yes (never an
// in-app tap) — starting with the 8 "Questions for Lisa" the spec puts on the
// card at Week 5 (none of which are answered yet).
export const CLEARANCES: Clearance[] = [];

// ---------------------------------------------------------------------------
// LEGS
// ---------------------------------------------------------------------------

const squat: Ladder = {
  id: 'squat',
  lane: 'LEGS',
  order: 0,
  block: 'main',
  rungs: [
    {
      id: 'squat.r0.now',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Supported split squat',
            reps: '6-8 each side · one set per round',
            // PROGRAM (Sep 26 2026, Tips audit): this rung is IN for the squat
            // slot in workout A specifically — C keeps its bodyweight 10 squats
            // unchanged. Kept here for the ladder's own bookkeeping, not on her
            // screen (that's a program fact, not a movement instruction).
            notes:
              'Fingertips on the couch for balance only — no gripping, no weight through the hands. Front foot flat, back heel up, chest tall. Straight down, back knee toward the floor; push through the front heel to stand. Last set stop about 2 short. Knee pinches or you wobble? Smaller range — the right call.',
          },
        ],
        C: [{ name: 'Bodyweight squats', reps: '10 reps · 3-1-3 tempo' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'squat.r1.a8to10',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Supported split squat',
            reps: '8-10 each side · one set per round',
            notes:
              'Fingertips on the couch for balance only — no gripping, no weight through the hands. Front foot flat, back heel up, chest tall. Last set stop about 2 short.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'squat.r2.c12',
      kind: 'T',
      slots: { C: [{ name: 'Bodyweight squats', reps: '12 reps · 3-1-3 tempo' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'squat.r3.a10to12',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Supported split squat',
            reps: '10-12 each side · one set per round',
            notes: 'Fingertips on the couch for balance only. Last set stop about 2 short.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'squat.r4.tempo8',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'Tempo split squat',
            reps: '8 each side · 3-sec down',
            notes:
              'Same split squat, now a slow 3-second lower. Fingertips on the couch for balance only, no gripping. Stop 2 reps short of the last one.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false, // new name — no card/visual/voice yet (S6)
    },
    {
      id: 'squat.r5.csplit',
      kind: 'V',
      slots: {
        C: [
          {
            name: 'Supported split squat',
            reps: '6-8 each side',
            // PROGRAM: reuses workout A's coaching for this same move.
            notes: 'Fingertips on the couch for balance only, no gripping.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true, // reuses the 'Supported split squat' name/card already in the app
    },
    {
      id: 'squat.r6.tempo10',
      kind: 'T',
      slots: {
        A: [{ name: 'Tempo split squat', reps: '10 each side · 3-sec down' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: false, // depends on r4's un-authored content
    },
    {
      id: 'squat.r7.lisa.load',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Loaded split squat (backpack or vest)', reps: '6-8 each side · 5-10 kg' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'squat.r8.lisa.handsfree',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Rear-foot-elevated split squat', reps: '6-8 each side' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
  ],
};

const hinge: Ladder = {
  id: 'hinge',
  lane: 'LEGS',
  order: 1,
  block: 'main',
  rungs: [
    {
      id: 'hinge.r0.now',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Bodyweight hip hinge',
            label: 'Hip hinge',
            reps: '12 reps · 2 sets each round · holding the 1 kg',
            // PROGRAM: "anything heavier is a Lisa question" (clearance
            // bookkeeping) dropped from the visible line — the 1 kg ceiling
            // itself stays, since that's a real safety limit, not program talk.
            notes:
              'Same hinge, now HOLDING the 1 kg the way you already do — it hangs from the hands, wrists neutral, light grip. Hinge at the hips, soft knees, flat/neutral spine. Do NOT round the low back. 1 kg is the ceiling for now.',
          },
        ],
        B: [
          {
            name: 'Bodyweight hip hinge',
            label: 'Hip hinge',
            reps: '12 reps · 2 sets each round · holding the 1 kg',
            notes:
              'Same hinge, now HOLDING the 1 kg — it hangs from the hands, wrists neutral, light grip. Do NOT round the low back. 1 kg is the ceiling for now.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'hinge.r1.tempo10',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'Bodyweight hip hinge',
            label: 'Hip hinge',
            reps: '10 reps · 2 sets each round · 3-sec lowering · holding the 1 kg',
            notes: 'Same hinge, now a slow 3-second lower. 1 kg is still the ceiling.',
          },
        ],
        B: [
          {
            name: 'Bodyweight hip hinge',
            label: 'Hip hinge',
            reps: '10 reps · 2 sets each round · 3-sec lowering · holding the 1 kg',
            notes: 'Same hinge, now a slow 3-second lower. 1 kg is still the ceiling.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true, // same name, already cleared
    },
    {
      id: 'hinge.r2.tempo12',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Bodyweight hip hinge',
            label: 'Hip hinge',
            reps: '12 reps · 2 sets each round · 3-sec lowering · holding the 1 kg',
          },
        ],
        B: [
          {
            name: 'Bodyweight hip hinge',
            label: 'Hip hinge',
            reps: '12 reps · 2 sets each round · 3-sec lowering · holding the 1 kg',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'hinge.r3.lisa.bandorkickstand',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Band pull-through or kickstand hinge', reps: '2 sets · 10 reps' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'hinge.r4.lisa.loaded',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Loaded hip hinge (dumbbell/kettlebell)', reps: '3 sets · 8-10 reps' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'hinge.r5.lisa.singleleg',
      kind: 'LISA',
      slots: { A: [{ name: 'Single-leg hip hinge', reps: '2 sets · 8 each side' }] },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
  ],
};

const bridge: Ladder = {
  id: 'bridge',
  lane: 'LEGS',
  order: 2,
  block: 'main',
  rungs: [
    {
      id: 'bridge.r0.now',
      kind: 'T',
      slots: {
        A: [{ name: 'Glute bridges', reps: '12 reps · 2-sec hold at top' }],
        B: [{ name: 'Single-leg glute bridges', reps: '10 each side' }],
        C: [
          { name: 'Glute bridges', reps: '15 reps · 2-sec hold' },
          { name: 'Single-leg glute bridges', reps: '8 each side' },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'bridge.r1.march6',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'March bridge',
            reps: '6 each side',
            notes:
              'Glute bridge, held up — now march one knee toward your chest and back, hips staying level. Squeeze the glutes to keep the hips from dropping.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false, // new name
      earnedMoment: 'Glute bridge → march bridge. At 12 since May 16 — clean every session.',
    },
    {
      id: 'bridge.r2.b12c10',
      kind: 'T',
      slots: {
        B: [{ name: 'Single-leg glute bridges', reps: '12 each side' }],
        C: [{ name: 'Single-leg glute bridges', reps: '10 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'bridge.r3.march8c18',
      kind: 'T',
      slots: {
        A: [{ name: 'March bridge', reps: '8 each side' }],
        C: [{ name: 'Glute bridges', reps: '18 reps · 2-sec hold' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: false, // touches march bridge
    },
    {
      id: 'bridge.r4.b15',
      kind: 'T',
      slots: { B: [{ name: 'Single-leg glute bridges', reps: '15 each side' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'bridge.r5.bcouch8',
      kind: 'V',
      slots: {
        B: [
          {
            name: 'Single-leg glute bridge (feet elevated)',
            reps: '8 each side',
            notes: 'Same single-leg bridge, feet up on the couch instead of the floor.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'bridge.r6.band',
      kind: 'V',
      slots: {
        A: [{ name: 'March bridge', reps: '8 each side · band above the knees' }],
        C: [{ name: 'Glute bridges', reps: '18 reps · 2-sec hold · band above the knees' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'bridge.r7.lisa.thrust',
      kind: 'LISA',
      slots: { A: [{ name: 'Loaded hip thrust', reps: '2 sets · 10 reps' }] },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
  ],
};

const wallsit: Ladder = {
  id: 'wallsit',
  lane: 'LEGS',
  order: 3,
  block: 'main',
  rungs: [
    {
      id: 'wallsit.r0.now',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Wall sit',
            reps: '45 sec hold',
            durationSec: 45,
            isTimed: true,
            // PROGRAM: the "you held 42 on Sep 7, 43 on Sep 14" history that
            // justified this rung's bump lives here, not on her screen.
            notes:
              'Keep the depth: knees toward 90°. Hands on thighs or hanging, no pushing on the wall. Graduate at a clean 60.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
      gate: 'wallSitHeld',
    },
    {
      id: 'wallsit.r1.50',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Wall sit',
            reps: '50 sec hold',
            durationSec: 50,
            isTimed: true,
            notes:
              'Same depth: knees toward 90°. Hands on thighs or hanging, no pushing on the wall.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
      gate: 'wallSitHeld',
    },
    {
      id: 'wallsit.r2.55',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Wall sit',
            reps: '55 sec hold',
            durationSec: 55,
            isTimed: true,
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
      gate: 'wallSitHeld',
    },
    {
      id: 'wallsit.r3.60',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Wall sit',
            reps: '60 sec hold',
            durationSec: 60,
            isTimed: true,
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
      gate: 'wallSitHeld',
      earnedMoment: 'Wall sit reached 60. Graduated to the finisher.',
    },
    {
      id: 'wallsit.r4.finisher',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'Wall sit',
            reps: '45 sec hold · finisher, band at the knees',
            durationSec: 45,
            isTimed: true,
            // PROGRAM: this rung relocates the wall sit to the end of A as a
            // finisher — the fact of the move isn't hers to read, the setup is.
            notes: 'Band looped just above the knees.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true, // same name, reused card
    },
  ],
};

const sidehip: Ladder = {
  id: 'sidehip',
  lane: 'LEGS',
  order: 4,
  block: 'main',
  rungs: [
    {
      id: 'sidehip.r0.now',
      kind: 'T',
      slots: {
        B: [
          { name: 'Side-lying leg raises', reps: '12 each side' },
          {
            name: 'Side-lying clamshells',
            reps: '10 each side · yellow band (tied into a loop)',
          },
        ],
        C: [{ name: 'Side-lying leg raises', reps: '10 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'sidehip.r1.legraise',
      kind: 'T',
      slots: {
        B: [{ name: 'Side-lying leg raises', reps: '14 each side' }],
        C: [{ name: 'Side-lying leg raises', reps: '12 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'sidehip.r2.clamshell12',
      kind: 'T',
      slots: { B: [{ name: 'Side-lying clamshells', reps: '12 each side · yellow band' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'sidehip.r3.legraise2',
      kind: 'T',
      slots: {
        B: [{ name: 'Side-lying leg raises', reps: '16 each side' }],
        C: [{ name: 'Side-lying leg raises', reps: '14 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'sidehip.r4.clamshell15',
      kind: 'T',
      slots: { B: [{ name: 'Side-lying clamshells', reps: '15 each side · yellow band' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'sidehip.r5.legraiseband',
      kind: 'V',
      slots: {
        B: [{ name: 'Side-lying leg raises', reps: '10 each side · band at the knees' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true, // reuses the existing name
    },
    {
      id: 'sidehip.r6.clamshellred',
      kind: 'V',
      slots: { B: [{ name: 'Side-lying clamshells', reps: '10 each side · red band' }] },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true,
    },
  ],
};

const calf: Ladder = {
  id: 'calf',
  lane: 'LEGS',
  order: 5,
  block: 'main',
  rungs: [
    {
      id: 'calf.r0.now',
      kind: 'T',
      slots: {
        B: [{ name: 'Standing calf raises', reps: '12 reps' }],
        C: [
          {
            name: 'Standing calf raises',
            reps: '15 reps',
            notes: 'Last set near failure (0-2 reps left).',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'calf.r1.b15',
      kind: 'T',
      slots: { B: [{ name: 'Standing calf raises', reps: '15 reps' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'calf.r2.c18',
      kind: 'T',
      slots: { C: [{ name: 'Standing calf raises', reps: '18 reps' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'calf.r3.b18c20',
      kind: 'T',
      slots: {
        B: [{ name: 'Standing calf raises', reps: '18 reps' }],
        C: [{ name: 'Standing calf raises', reps: '20 reps' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'calf.r4.tempo12',
      kind: 'V',
      slots: {
        B: [{ name: 'Standing calf raises', reps: '12 reps · 3-sec lowering' }],
        C: [{ name: 'Standing calf raises', reps: '12 reps · 3-sec lowering' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true,
    },
    {
      id: 'calf.r5.lisa.singleleg',
      kind: 'LISA',
      slots: { B: [{ name: 'Single-leg calf raise', reps: '10 each side' }] },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// CORE
// ---------------------------------------------------------------------------

const deadbug: Ladder = {
  id: 'deadbug',
  lane: 'CORE',
  order: 0,
  block: 'main',
  rungs: [
    {
      id: 'deadbug.r0.now',
      kind: 'T',
      slots: {
        A: [{ name: 'Full dead bug', reps: '8 each side' }],
        B: [{ name: 'Full dead bug', reps: '8 each side' }],
        C: [{ name: 'Modified dead bug', reps: '8 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'deadbug.r1.ab10',
      kind: 'T',
      slots: {
        A: [{ name: 'Full dead bug', reps: '10 each side' }],
        B: [{ name: 'Full dead bug', reps: '10 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'deadbug.r2.cfull',
      kind: 'V',
      slots: { C: [{ name: 'Full dead bug', reps: '8 each side' }] },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true, // reuses A/B's existing name
    },
    {
      id: 'deadbug.r3.ab12',
      kind: 'T',
      slots: {
        A: [{ name: 'Full dead bug', reps: '12 each side' }],
        B: [{ name: 'Full dead bug', reps: '12 each side' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'deadbug.r4.hold3s',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'Full dead bug',
            reps: '8 each side · 3-sec hold at full reach',
          },
        ],
        B: [{ name: 'Full dead bug', reps: '8 each side · 3-sec hold at full reach' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true,
    },
    {
      id: 'deadbug.r5.1kg',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'Full dead bug',
            reps: '8 each side · 1 kg in the reaching hand',
            notes: 'Still 1 kg — the ceiling everywhere else. Low back stays pressed to the mat.',
          },
        ],
        B: [
          {
            name: 'Full dead bug',
            reps: '8 each side · 1 kg in the reaching hand',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true,
    },
  ],
};

const plank: Ladder = {
  id: 'plank',
  lane: 'CORE',
  order: 1,
  block: 'main',
  rungs: [
    {
      id: 'plank.r0.now',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Forearm plank',
            reps: '1 set · 20 sec hold',
            durationSec: 20,
            isTimed: true,
            notes:
              'Hold WITH a posterior pelvic tilt — tuck the tailbone under, squeeze the glutes, ribs down. Forearms only, NOT hands. Stop if any wrist sensation.',
          },
        ],
        B: [
          {
            name: 'Forearm plank',
            reps: '1 set · 20 sec hold',
            durationSec: 20,
            isTimed: true,
            // PROGRAM: reuses workout A's coaching for this same move.
            notes: 'Forearms only, posterior pelvic tilt, ribs down.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'plank.r1.25',
      kind: 'T',
      slots: {
        A: [{ name: 'Forearm plank', reps: '1 set · 25 sec hold', durationSec: 25, isTimed: true }],
        B: [{ name: 'Forearm plank', reps: '1 set · 25 sec hold', durationSec: 25, isTimed: true }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'plank.r2.30',
      kind: 'T',
      slots: {
        A: [{ name: 'Forearm plank', reps: '1 set · 30 sec hold', durationSec: 30, isTimed: true }],
        B: [{ name: 'Forearm plank', reps: '1 set · 30 sec hold', durationSec: 30, isTimed: true }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'plank.r3.secondset',
      kind: 'MIN',
      slots: {
        A: [
          { name: 'Forearm plank', reps: '2 sets · 25 sec hold', durationSec: 25, isTimed: true },
        ],
        B: [
          { name: 'Forearm plank', reps: '2 sets · 25 sec hold', durationSec: 25, isTimed: true },
        ],
      },
      minutesDelta: 3,
      resetsReps: true,
      contentReady: true,
    },
    {
      id: 'plank.r4.secondset30',
      kind: 'T',
      slots: {
        A: [
          { name: 'Forearm plank', reps: '2 sets · 30 sec hold', durationSec: 30, isTimed: true },
        ],
        B: [
          { name: 'Forearm plank', reps: '2 sets · 30 sec hold', durationSec: 30, isTimed: true },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'plank.r5.leglift',
      kind: 'V',
      slots: {
        A: [
          {
            name: 'Forearm plank with leg lift',
            reps: '20 sec hold · slow leg lift',
          },
        ],
        B: [{ name: 'Forearm plank with leg lift', reps: '20 sec hold · slow leg lift' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false, // new name
    },
  ],
};

// Doesn't exist yet — R0 is a sentinel (nothing to show). Once rung 1 fires,
// it TAKES OVER B's forearm-plank slot (a swap, adds no time); from then on
// the `plank` ladder above writes to A only (special-cased in composeWeekPlan,
// not encoded as a rung here — see PLANK_WRITES_B_UNTIL_SIDEPLANK below).
const sideplank: Ladder = {
  id: 'sideplank',
  lane: 'CORE',
  order: 2,
  block: 'main',
  rungs: [
    {
      id: 'sideplank.r0.none',
      kind: 'T',
      slots: {},
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'sideplank.r1.kneesbent15',
      kind: 'V',
      slots: {
        B: [
          {
            name: 'Forearm side plank (knees bent)',
            reps: '2 × 15 sec/side',
            // PROGRAM: this rung takes over the plank slot in workout B.
            notes: 'Same time, a new position: on one forearm, knees bent, hips lifted.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false, // new exercise
    },
    {
      id: 'sideplank.r2.20',
      kind: 'T',
      slots: { B: [{ name: 'Forearm side plank (knees bent)', reps: '2 × 20 sec/side' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: false, // depends on r1
    },
    {
      id: 'sideplank.r3.25',
      kind: 'T',
      slots: { B: [{ name: 'Forearm side plank (knees bent)', reps: '2 × 25 sec/side' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: false,
    },
    {
      id: 'sideplank.r4.straightlegs15',
      kind: 'V',
      slots: {
        B: [
          {
            name: 'Forearm side plank',
            reps: '15 sec/side',
            notes: 'Straight legs now, same forearm position.',
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'sideplank.r5.20to30',
      kind: 'T',
      slots: { B: [{ name: 'Forearm side plank', reps: '20-30 sec/side' }] },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: false,
    },
  ],
};

/** Once the side-plank ladder has moved past R0, `plank` stops writing to B. */
export function sidePlankHasStarted(state: Record<string, LadderState>): boolean {
  return (state['sideplank']?.rung ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// UPPER
// ---------------------------------------------------------------------------

const rowcurl: Ladder = {
  id: 'rowcurl',
  lane: 'UPPER',
  order: 0,
  block: 'upperBack',
  rungs: [
    {
      id: 'rowcurl.r0.now',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 12 reps each side · bodyweight or 1 kg',
            notes:
              'Bodyweight or holding the 1 kg — your call. Arm hanging, wrist neutral, light grip. Head down. Drive the elbow up, squeeze the shoulder blade, lower slow. Pain tells — stop on any wrist signal.',
          },
          {
            name: '1 kg biceps curl',
            reps: '2 sets · 12 reps',
            notes:
              'Hold the 1 kg lightly — wrist and fingers neutral, never bending back. Elbow tucked, forearm hanging. Lower slow. Pain tells — stop on any wrist signal.',
          },
        ],
        B: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 12 reps each side · bodyweight or 1 kg',
          },
          { name: '1 kg biceps curl', reps: '2 sets · 12 reps' },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'rowcurl.r1.15',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 15 reps each side · holding the 1 kg',
            notes:
              'The 1 kg is now the written default — you already do it. Wrist neutral, light grip, head down.',
          },
          { name: '1 kg biceps curl', reps: '2 sets · 15 reps' },
        ],
        B: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 15 reps each side · holding the 1 kg',
          },
          { name: '1 kg biceps curl', reps: '2 sets · 15 reps' },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'rowcurl.r2.18',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 18 reps each side · holding the 1 kg',
          },
          { name: '1 kg biceps curl', reps: '2 sets · 18 reps' },
        ],
        B: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 18 reps each side · holding the 1 kg',
          },
          { name: '1 kg biceps curl', reps: '2 sets · 18 reps' },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'rowcurl.r3.20',
      kind: 'T',
      slots: {
        A: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 20 reps each side · holding the 1 kg',
            // PROGRAM: this rung replaces the old 3×20 trigger, which the
            // engine could never reach — pure program bookkeeping, nothing
            // for her to read (no movement guidance left once it's dropped).
          },
          { name: '1 kg biceps curl', reps: '2 sets · 20 reps' },
        ],
        B: [
          {
            name: 'Prone row (bodyweight)',
            label: 'Prone row',
            reps: '2 sets · 20 reps each side · holding the 1 kg',
          },
          { name: '1 kg biceps curl', reps: '2 sets · 20 reps' },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'rowcurl.r4.lisa.curl2kg',
      kind: 'LISA',
      slots: {
        A: [{ name: '2 kg biceps curl', reps: '2 sets · 8-10 reps' }],
        B: [{ name: '2 kg biceps curl', reps: '2 sets · 8-10 reps' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'rowcurl.r5.lisa.row2kg',
      kind: 'LISA',
      slots: {
        A: [{ name: '2 kg prone row', reps: '2 sets · 8-10 reps each side' }],
        B: [{ name: '2 kg prone row', reps: '2 sets · 8-10 reps each side' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'rowcurl.r6.lisa.bandrow',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Held band row', reps: 'yellow → red → green' }],
        B: [{ name: 'Held band row', reps: 'yellow → red → green' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
  ],
};

const scapular: Ladder = {
  id: 'scapular',
  lane: 'UPPER',
  order: 1,
  block: 'upperBack',
  rungs: [
    {
      id: 'scapular.r0.now',
      kind: 'T',
      slots: {
        A: [
          { name: 'Wall angels', reps: '2 sets · 10 slow reps' },
          { name: 'IWYT raises', reps: '2 sets · 8 each (I, W, Y, T)' },
        ],
        B: [
          { name: 'Wall angels', reps: '2 sets · 10 slow reps' },
          { name: 'IWYT raises', reps: '2 sets · 8 each (I, W, Y, T)' },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'scapular.r1.iwytpause',
      kind: 'V',
      slots: {
        A: [{ name: 'IWYT raises', reps: '2 sets · 8 each · 2-sec pause at the top' }],
        B: [{ name: 'IWYT raises', reps: '2 sets · 8 each · 2-sec pause at the top' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: true, // same name
    },
    {
      id: 'scapular.r2.angels12',
      kind: 'T',
      slots: {
        A: [{ name: 'Wall angels', reps: '2 sets · 12 slow reps' }],
        B: [{ name: 'Wall angels', reps: '2 sets · 12 slow reps' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'scapular.r3.iwyt10',
      kind: 'T',
      slots: {
        A: [{ name: 'IWYT raises', reps: '2 sets · 10 each · 2-sec pause at the top' }],
        B: [{ name: 'IWYT raises', reps: '2 sets · 10 each · 2-sec pause at the top' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'scapular.r4.angels15',
      kind: 'T',
      slots: {
        A: [{ name: 'Wall angels', reps: '2 sets · 15 slow reps' }],
        B: [{ name: 'Wall angels', reps: '2 sets · 15 slow reps' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'scapular.r5.thirdset',
      kind: 'MIN',
      slots: {
        A: [{ name: 'Wall angels', reps: '3 sets · 15 slow reps' }],
        B: [{ name: 'Wall angels', reps: '3 sets · 15 slow reps' }],
      },
      minutesDelta: 2,
      resetsReps: false,
      contentReady: true,
    },
  ],
};

const hands: Ladder = {
  id: 'hands',
  lane: 'UPPER',
  order: 2,
  block: 'upperBack',
  rungs: [
    {
      id: 'hands.r0.now',
      kind: 'T',
      slots: {
        A: [
          { name: 'Bird dog (legs only)', reps: '2 sets · 6 each side · 2-sec hold' },
          {
            name: 'Wall lean (wrist on-ramp)',
            reps: '2 × 15-20 sec',
            durationSec: 20,
            isTimed: true,
          },
        ],
        B: [
          { name: 'Bird dog (legs only)', reps: '2 sets · 6 each side · 2-sec hold' },
          {
            name: 'Wall lean (wrist on-ramp)',
            reps: '2 × 15-20 sec',
            durationSec: 20,
            isTimed: true,
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'hands.r1.lisa.wallpushup8',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Wall push-up', reps: '2 sets · 8 reps' }],
        B: [{ name: 'Wall push-up', reps: '2 sets · 8 reps' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'hands.r2.lisa.birddog8',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Bird dog (legs only)', reps: '2 sets · 8 each side · 2-sec hold' }],
        B: [{ name: 'Bird dog (legs only)', reps: '2 sets · 8 each side · 2-sec hold' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true, // reuses the existing name, but still Lisa-gated per her wrist rule
    },
    {
      id: 'hands.r3.lisa.wallpushup1012',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Wall push-up', reps: '2 sets · 10-12 reps' }],
        B: [{ name: 'Wall push-up', reps: '2 sets · 10-12 reps' }],
      },
      minutesDelta: 0,
      resetsReps: false,
      contentReady: false,
    },
    {
      id: 'hands.r4.lisa.fullbirddog',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Full bird dog', reps: '2 sets · 5 each side' }],
        B: [{ name: 'Full bird dog', reps: '2 sets · 5 each side' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'hands.r5.lisa.inclinepushup',
      kind: 'LISA',
      slots: {
        A: [{ name: 'Incline push-up (counter height)', reps: '2 sets · 6 reps' }],
        B: [{ name: 'Incline push-up (counter height)', reps: '2 sets · 6 reps' }],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
    {
      id: 'hands.r6.lisa.plank',
      kind: 'LISA',
      slots: {
        A: [
          {
            name: 'Plank on the hands',
            reps: '1 set · 20 sec hold',
            isTimed: true,
            durationSec: 20,
          },
        ],
        B: [
          {
            name: 'Plank on the hands',
            reps: '1 set · 20 sec hold',
            isTimed: true,
            durationSec: 20,
          },
        ],
      },
      minutesDelta: 0,
      resetsReps: true,
      contentReady: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// CARDIO (display-only — minutesDelta drives the target line, never Workout.main)
// ---------------------------------------------------------------------------

const CARDIO_AB: Ladder = {
  id: 'CARDIO_AB',
  lane: 'CARDIO',
  order: 0,
  block: 'none',
  rungs: [
    {
      id: 'cardioab.r0.10',
      kind: 'T',
      slots: {},
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'cardioab.r1.12',
      kind: 'T',
      slots: {},
      minutesDelta: 2,
      resetsReps: false,
      contentReady: true,
      gate: 'cardioMinutes',
    },
    {
      id: 'cardioab.r2.15',
      kind: 'T',
      slots: {},
      minutesDelta: 3,
      resetsReps: false,
      contentReady: true,
      gate: 'cardioMinutes',
    }, // cap — it's a warm-up
  ],
};

const CARDIO_C: Ladder = {
  id: 'CARDIO_C',
  lane: 'CARDIO',
  order: 1,
  block: 'none',
  rungs: [
    {
      id: 'cardioc.r0.25',
      kind: 'T',
      slots: {},
      minutesDelta: 0,
      resetsReps: false,
      contentReady: true,
    },
    {
      id: 'cardioc.r1.30',
      kind: 'T',
      slots: {},
      minutesDelta: 5,
      resetsReps: false,
      contentReady: true,
      gate: 'cardioMinutes',
    },
    {
      id: 'cardioc.r2.35',
      kind: 'T',
      slots: {},
      minutesDelta: 5,
      resetsReps: false,
      contentReady: true,
      gate: 'cardioMinutes',
    }, // cap
  ],
};

// ---------------------------------------------------------------------------

export const LADDERS: Ladder[] = [
  rowcurl,
  CARDIO_AB,
  CARDIO_C,
  deadbug,
  plank,
  sideplank,
  squat,
  hinge,
  bridge,
  wallsit,
  sidehip,
  calf,
  scapular,
  hands,
];

/** List-order tiebreak per lane, per spec §8. */
export const LANE_ORDER: Lane[] = ['UPPER', 'CARDIO', 'CORE', 'LEGS'];

export const LADDERS_BY_LANE: Record<Lane, Ladder[]> = {
  UPPER: [rowcurl, scapular, hands],
  CARDIO: [CARDIO_AB, CARDIO_C],
  CORE: [deadbug, plank, sideplank],
  LEGS: [squat, hinge, bridge, wallsit, sidehip, calf],
};

export function getLadder(id: string): Ladder {
  const l = LADDERS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown ladder id: ${id}`);
  return l;
}

// ---------------------------------------------------------------------------
// START_STATE — every ladder at R0, `changedWeek` taken from PROGRAM history
// (spec §11), `herAsk=true` on row+curl from her Sep 24 2 kg ask (used up once
// that ladder steps).
// ---------------------------------------------------------------------------

export const START_STATE: Record<string, LadderState> = {
  squat: { rung: 0, changedWeek: '2026-09-19', herAsk: false },
  hinge: { rung: 0, changedWeek: '2026-06-20', herAsk: false },
  bridge: { rung: 0, changedWeek: '2026-05-16', herAsk: false },
  wallsit: { rung: 0, changedWeek: '2026-09-19', herAsk: false },
  sidehip: { rung: 0, changedWeek: '2026-09-12', herAsk: false },
  calf: { rung: 0, changedWeek: '2026-08-29', herAsk: false },
  deadbug: { rung: 0, changedWeek: '2026-09-05', herAsk: false },
  plank: { rung: 0, changedWeek: '2026-09-05', herAsk: false }, // W2's tilt cue, still R0
  sideplank: { rung: 0, changedWeek: null, herAsk: false },
  // Its 2×12 hasn't actually changed since Jun 18 (UPPER_BACK_W7) — the Sep 19
  // reappearance was a CATCH-UP (matching what she already does off-app, app.ts
  // "CATCH-UP 1"), which the spec says is "free, not counted as a change"
  // (§9.6). A catch-up doesn't reset the freeze/staleness clock, so Jun 18 is
  // the real `changedWeek` — otherwise the freeze rule would wrongly block her
  // own W5 ask (Sep 26 is only 1 week after Sep 19, still inside a 2-week freeze).
  rowcurl: { rung: 0, changedWeek: '2026-06-18', herAsk: true },
  scapular: { rung: 0, changedWeek: '2026-06-18', herAsk: false },
  hands: { rung: 0, changedWeek: '2026-09-07', herAsk: false },
  CARDIO_AB: { rung: 0, changedWeek: null, herAsk: false },
  CARDIO_C: { rung: 0, changedWeek: null, herAsk: false },
};

export const START_LANE_QUEUE: Lane[] = ['UPPER', 'CARDIO', 'CORE', 'LEGS'];

export const ENGINE_VERSION = 'v49-shadow-1';
