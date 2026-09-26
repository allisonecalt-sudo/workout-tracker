// tests/pain-feel.test.ts — the back/wrist "10 = good" fix (v53, Sep 26 2026)
//
// Her words (Fri Sep 25 2026): "It was the opposite of what it meant" / "Yes
// flip it and also put it in future build to fix and make it all align" —
// the back/wrist 1-10 chip read like body/mood (where 10 is always the good
// end) but saved as PAIN (10 = worst). This suite covers the ONE helper pair
// that fixes it at the UI edge (pain-feel.ts's painFromFeel/feelFromPain,
// which app.ts's chip rendering + tap handler both call), proves storage
// stayed pain-shaped by checking the progression engine's flare gate still
// fires off a low "feel" reading, and proves the cycle page's back/wrist
// averages (cycle.ts) are unaffected — they read the same stored pain column
// they always did.
//
// Pure-logic tests: no `page` fixture, so Playwright runs these in Node.
// (painFromFeel/feelFromPain live in their own pure module, not app.ts,
// precisely so a test can import them without a DOM — app.ts's bottom
// `document.addEventListener(...)` runs at module load and needs a real one.)

import { test, expect } from '@playwright/test';
import { painFromFeel, feelFromPain } from '../pain-feel';
import {
  decideWeek,
  type DecideWeekInput,
  type WeekHistory,
  type SessionSignal,
  type WorkoutId,
} from '../progression';
import { buildPlainBackPhaseTable, type BackSession, type CyclePeriod } from '../cycle';

// ---------------------------------------------------------------------------
// The helper pair itself
// ---------------------------------------------------------------------------

test.describe('painFromFeel / feelFromPain — the ONE conversion at the UI edge', () => {
  test('feel 10 (feels fine) -> pain 0 — the Fine tap and the "10" chip mean the same thing', () => {
    expect(painFromFeel(10)).toBe(0);
  });

  test('feel 1 (hurts a lot) -> pain 9, not pain 10 — the row only ever reaches 9 from the top end', () => {
    expect(painFromFeel(1)).toBe(9);
  });

  test('pain 0 (Fine, stored) reads back as feel 10', () => {
    expect(feelFromPain(0)).toBe(10);
  });

  test('every whole feel 1-10 round-trips through pain and back to the same feel', () => {
    for (let feel = 1; feel <= 10; feel++) {
      expect(feelFromPain(painFromFeel(feel))).toBe(feel);
    }
  });

  test('mid-scale check from her own logged example: back 9 / wrist 7 (feel) -> pain 1 / pain 3', () => {
    // Her words: "she saved back 9 / wrist 7 reading the pain chips as
    // 10 = good... that row was corrected by hand". As FEEL readings those
    // are pain 1 and pain 3 once converted at the edge.
    expect(painFromFeel(9)).toBe(1);
    expect(painFromFeel(7)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Storage unchanged: the progression engine's flare gate (pain >= 3) still
// fires from a LOW feel reading, because painFromFeel converts before the
// value ever reaches state.backPain/wristPain.
// ---------------------------------------------------------------------------

function s(
  workout: WorkoutId,
  date: string,
  overrides: Partial<SessionSignal> = {}
): SessionSignal {
  return {
    date,
    workout,
    liteDay: false,
    stoppedEarlyAt: null,
    backPain: 0,
    wristPain: 0,
    backPainBefore: null,
    wristPainBefore: null,
    stepFeel: null,
    armFeel: null,
    wallSitSec: 60,
    cardioMinutes: 20,
    durationSec: 1800,
    ...overrides,
  };
}

function cleanWeek(weekStart: string, dateA: string, dateB: string, dateC: string): WeekHistory {
  return { weekStart, sessions: [s('A', dateA), s('B', dateB), s('C', dateC)] };
}

const R2W4_WEEK = cleanWeek('2026-09-19', '2026-09-22', '2026-09-23', '2026-09-24');

function baseInput(overrides: Partial<DecideWeekInput> = {}): DecideWeekInput {
  return {
    weekStart: '2026-09-26',
    priorWeeks: [R2W4_WEEK],
    priorDecisions: [],
    clearances: [],
    ...overrides,
  };
}

test('a flare still fires from a low FEEL reading (feel 1 -> pain 9, well over the pain >= 3 gate)', () => {
  const w5 = decideWeek(baseInput()); // establishes a change to revert
  const lowFeelWeek: WeekHistory = {
    weekStart: '2026-10-03',
    sessions: [
      // She tapped "1" meaning "hurts a lot" on the new chip — converted at
      // the edge before it ever reached this SessionSignal.
      s('A', '2026-10-06', { backPain: painFromFeel(1) }),
      s('B', '2026-10-07'),
      s('C', '2026-10-08'),
    ],
  };
  const d = decideWeek(
    baseInput({
      weekStart: '2026-10-10',
      priorWeeks: [R2W4_WEEK, lowFeelWeek],
      priorDecisions: [w5],
    })
  );
  expect(d.mode).toBe('STEP_BACK');
  expect(d.askLisaLine).toBe(true);
});

test('a genuinely fine session (feel 10 -> pain 0) never trips the flare gate', () => {
  const w5 = decideWeek(baseInput());
  const fineWeek: WeekHistory = {
    weekStart: '2026-10-03',
    sessions: [
      s('A', '2026-10-06', { backPain: painFromFeel(10) }),
      s('B', '2026-10-07'),
      s('C', '2026-10-08'),
    ],
  };
  const d = decideWeek(
    baseInput({ weekStart: '2026-10-10', priorWeeks: [R2W4_WEEK, fineWeek], priorDecisions: [w5] })
  );
  expect(d.mode).not.toBe('STEP_BACK');
});

// ---------------------------------------------------------------------------
// Cycle page stays correct: it reads the same stored PAIN column the flare
// gate does, untouched by the chip-side conversion above — a session logged
// as a low feel (high stored pain) still averages as high pain, exactly the
// direction the page's "Back pain" label promises.
// ---------------------------------------------------------------------------

const HER_PERIODS: CyclePeriod[] = [
  { startDate: '2026-07-09', source: 'reproductive.md' },
  { startDate: '2026-08-05', source: 'reproductive.md' },
  { startDate: '2026-09-01', source: 'reproductive.md' },
];

test('cycle page back-pain average shows the aligned (pain) direction — a low feel reads as high pain', () => {
  const sessions: BackSession[] = [
    // All three logged as feel 1 ("hurts a lot") -> pain 9 each time.
    { date: '2026-08-05', backBefore: null, backAfter: painFromFeel(1) },
    { date: '2026-08-06', backBefore: null, backAfter: painFromFeel(1) },
    { date: '2026-08-07', backBefore: null, backAfter: painFromFeel(1) },
  ];
  const rows = buildPlainBackPhaseTable(sessions, HER_PERIODS);
  const onPeriod = rows.find((r) => r.plainPhase === 'on-period')!;
  // Labeled "Back pain" on the page — high number here correctly means a lot
  // of pain, the opposite direction of the chip's "feel" scale, and that's
  // the intended, documented split (storage unchanged; only the tap UI flipped).
  expect(onPeriod.avgAfter).toBeCloseTo(9, 5);
});
