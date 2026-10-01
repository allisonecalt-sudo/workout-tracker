// tests/move-feel.test.ts — move-feel.ts (v58, Sep 28 2026)
//
// Pure-logic tests, same shape as tests/ride.test.ts / tests/step-list.test.ts:
// no `page` fixture, so Playwright runs these in Node.
//
// Covers the task spec exactly: "which moves ask (a stepped move asks, an
// unchanged one doesn't); tap saves the right slug/qty" — plus the CHECK
// regex parity migrations/2026-09-28-v58-move-feel.sql needs.

import { test, expect } from '@playwright/test';
import {
  slugFor,
  canonicalMoveName,
  steppedMovesForPhase,
  steppedMovesForWorkout,
  steppedLineText,
  steppedLineFor,
  moveFeelString,
  parseMoveFeelString,
  isValidMoveFeelString,
  isMoveFeelValue,
  withOverrideFeel,
  RIDE_NAMES,
  type MoveFeelExercise,
  type MoveFeelWorkout,
  type SteppedMove,
} from '../move-feel';

// v61 (Sep 28 2026), spec item f: the ride's Easy/Right/Hard is ALWAYS asked
// (never gated on "stepped"), saved through this one bypass function.
test.describe('withOverrideFeel', () => {
  test('adds the slug fresh when there is no base string', () => {
    expect(withOverrideFeel(null, 'ride', 'right', 30, 'min')).toBe('ride=right@30min');
  });

  test('appends alongside an existing (different) stepped-move feel', () => {
    expect(withOverrideFeel('splitsquat=easy', 'ride', 'hard', 12, 'min')).toBe(
      'splitsquat=easy;ride=hard@12min'
    );
  });

  test('replaces its own prior segment rather than duplicating it', () => {
    expect(withOverrideFeel('ride=easy@10min', 'ride', 'hard', 12, 'min')).toBe('ride=hard@12min');
  });

  test('replacing keeps every OTHER segment untouched', () => {
    expect(withOverrideFeel('wallsit=easy@45s;ride=easy@10min', 'ride', 'right', 30, 'min')).toBe(
      'wallsit=easy@45s;ride=right@30min'
    );
  });

  test('round-trips through parseMoveFeelString and isValidMoveFeelString', () => {
    const s = withOverrideFeel('splitsquat=right', 'ride', 'hard', 30, 'min');
    expect(isValidMoveFeelString(s)).toBe(true);
    expect(parseMoveFeelString(s)).toEqual([
      { slug: 'splitsquat', feel: 'right', qtyRaw: null },
      { slug: 'ride', feel: 'hard', qtyRaw: '30min' },
    ]);
  });
});

test.describe('slugFor', () => {
  test('lowercases and strips everything but a-z', () => {
    expect(slugFor('Split squat')).toBe('splitsquat');
    expect(slugFor('Wall sit')).toBe('wallsit');
    expect(slugFor('Supported split squat')).toBe('supportedsplitsquat');
  });

  test('every cardio-slot name (walk / apartment / elliptical) slugs to "ride"', () => {
    expect(slugFor('Outdoor walk')).toBe('ride');
    expect(slugFor('Elliptical')).toBe('ride');
    expect(slugFor('Apartment cardio')).toBe('ride');
  });
});

test.describe('canonicalMoveName', () => {
  test('any ride-name lane maps back to the one PROGRAM ever encodes', () => {
    expect(canonicalMoveName('Elliptical')).toBe('Outdoor walk');
    expect(canonicalMoveName('Apartment cardio')).toBe('Outdoor walk');
    expect(canonicalMoveName('Outdoor walk')).toBe('Outdoor walk');
  });

  test('a plain move name passes through unchanged', () => {
    expect(canonicalMoveName('Wall sit')).toBe('Wall sit');
  });
});

test.describe('isMoveFeelValue', () => {
  test('accepts exactly the three values, rejects everything else', () => {
    expect(isMoveFeelValue('easy')).toBe(true);
    expect(isMoveFeelValue('right')).toBe(true);
    expect(isMoveFeelValue('hard')).toBe(true);
    expect(isMoveFeelValue('meh')).toBe(false);
    expect(isMoveFeelValue(undefined)).toBe(false);
    expect(isMoveFeelValue(null)).toBe(false);
  });
});

test.describe('steppedMovesForPhase / steppedMovesForWorkout — which moves ask', () => {
  test('an unchanged move (same reps, same durationSec) never steps', () => {
    const prev: MoveFeelExercise[] = [{ name: 'Bird dog', reps: '8 each side' }];
    const next: MoveFeelExercise[] = [{ name: 'Bird dog', reps: '8 each side' }];
    expect(steppedMovesForPhase(prev, next, new Set())).toEqual([]);
  });

  test('a reps bump steps, carries NO qty (her spec: "reps? no")', () => {
    const prev: MoveFeelExercise[] = [{ name: 'Split squat', reps: '6-8 each side' }];
    const next: MoveFeelExercise[] = [{ name: 'Split squat', reps: '8-10 each side' }];
    const stepped = steppedMovesForPhase(prev, next, new Set());
    expect(stepped).toHaveLength(1);
    expect(stepped[0]).toMatchObject({ name: 'Split squat', slug: 'splitsquat', kind: 'reps' });
    expect(stepped[0]!.qty).toBeUndefined();
    // v59 fix pass (Sep 28 2026, CHECK-v58 round 2 must #R2-S1): the summary
    // keeps only the stepped NUMBER now ("8-10"), not the whole prose
    // segment ("8-10 each side") — the pre-log line's own one-line budget
    // (steppedLineText below) needs every move's text short, not just
    // capped to its first segment.
    expect(stepped[0]!.summary).toBe('split squat 8-10');
  });

  test('a brand-new variant (not in prev at all, by name) steps', () => {
    const prev: MoveFeelExercise[] = [{ name: 'Bodyweight squats', reps: '10 reps' }];
    const next: MoveFeelExercise[] = [
      { name: 'Supported split squat', reps: '6-8 each side · one set per round' },
    ];
    const stepped = steppedMovesForPhase(prev, next, new Set());
    expect(stepped).toHaveLength(1);
    expect(stepped[0]!.name).toBe('Supported split squat');
    // v58 fix pass (Sep 28 2026): only the first ' · '-segment survives —
    // the "· one set per round" extra used the same separator the pre-log
    // line joins several moves with, which made a multi-move week unreadable.
    // v59: and now just the number out of that segment (see the reps-bump
    // test above).
    expect(stepped[0]!.summary).toBe('supported split squat 6-8');
  });

  test('v59 (CHECK-v58 round 2 nice #R2-N1): a reps move whose only real change is a LATER, appended segment shows THAT segment — not the unchanged first one', () => {
    // Her real data: hip hinge went from Week 3's "2 sets · 12 reps" to Week
    // 4's "12 reps · 2 sets each round · holding 1–2 kg (your pick)" — same
    // "12 reps" (just reworded), the actual step is the added load, three
    // segments later. The old first-segment cut said "hip hinge 12 reps",
    // which reads as though the rep count changed when it didn't.
    const prev: MoveFeelExercise[] = [{ name: 'Bodyweight hip hinge', reps: '2 sets · 12 reps' }];
    const next: MoveFeelExercise[] = [
      {
        name: 'Bodyweight hip hinge',
        // Real app data (app.ts's HIP_HINGE_R2W4) carries this same label —
        // 'Hip hinge' over the PROGRAM name 'Bodyweight hip hinge', on
        // purpose, because the name contradicts the "holding 1-2 kg" line
        // right under it (v48 fix r2).
        label: 'Hip hinge',
        reps: '12 reps · 2 sets each round · holding 1–2 kg (your pick)',
      },
    ];
    const stepped = steppedMovesForPhase(prev, next, new Set());
    expect(stepped).toHaveLength(1);
    // Fix pass (Sep 28 2026, v59 CHECK nice): was 'bodyweight hip hinge 1–2
    // kg' — displayLabel ignored ex.label and fell right back into the same
    // "bodyweight vs holding a kg" contradiction the label exists to avoid.
    expect(stepped[0]!.summary).toBe('hip hinge 1–2 kg');
  });

  test('a hold whose seconds went up steps with a seconds qty', () => {
    const prev: MoveFeelExercise[] = [
      { name: 'Wall sit', reps: '40 sec hold', durationSec: 40, isTimed: true },
    ];
    const next: MoveFeelExercise[] = [
      { name: 'Wall sit', reps: '45 sec hold', durationSec: 45, isTimed: true },
    ];
    const stepped = steppedMovesForPhase(prev, next, new Set());
    expect(stepped).toEqual([
      {
        name: 'Wall sit',
        slug: 'wallsit',
        kind: 'seconds',
        qty: 45,
        summary: 'wall sit 45s',
      },
    ]);
  });

  test('the cardio slot (walk/elliptical/apartment) steps with a MINUTES qty, read off reps text', () => {
    const prev: MoveFeelExercise[] = [{ name: 'Outdoor walk', reps: '10 min' }];
    const next: MoveFeelExercise[] = [{ name: 'Outdoor walk', reps: '12 min' }];
    const stepped = steppedMovesForPhase(prev, next, new Set());
    expect(stepped).toEqual([
      { name: 'Outdoor walk', slug: 'ride', kind: 'minutes', qty: 12, summary: 'ride 12 min' },
    ]);
  });

  test('curl/row (an excluded name) never steps here even when its reps changed — arm_feel owns it', () => {
    const excluded = new Set(['1 kg biceps curl']);
    const prev: MoveFeelExercise[] = [{ name: '1 kg biceps curl', reps: '2 sets · 12 reps' }];
    const next: MoveFeelExercise[] = [{ name: '1 kg biceps curl', reps: '2 sets · 15 reps' }];
    expect(steppedMovesForPhase(prev, next, excluded)).toEqual([]);
  });

  test('a move REMOVED from next (in prev, not in next) is never "stepped" — nothing to ask a feel about', () => {
    const prev: MoveFeelExercise[] = [
      { name: 'Bodyweight squats', reps: '10 reps' },
      { name: 'Wall sit', reps: '40 sec hold', durationSec: 40, isTimed: true },
    ];
    const next: MoveFeelExercise[] = [
      { name: 'Wall sit', reps: '40 sec hold', durationSec: 40, isTimed: true },
    ];
    expect(steppedMovesForPhase(prev, next, new Set())).toEqual([]);
  });

  test('steppedMovesForWorkout walks warmup -> main -> upper back, never cooldown', () => {
    const prev: MoveFeelWorkout = {
      warmup: [{ name: 'Outdoor walk', reps: '10 min' }],
      main: [{ name: 'Wall sit', reps: '40 sec hold', durationSec: 40, isTimed: true }],
      upperBack: [{ name: 'Bird dog', reps: '8 each side' }],
    };
    const next: MoveFeelWorkout = {
      warmup: [{ name: 'Outdoor walk', reps: '12 min' }],
      main: [{ name: 'Wall sit', reps: '45 sec hold', durationSec: 45, isTimed: true }],
      upperBack: [{ name: 'Bird dog', reps: '8 each side' }], // unchanged
    };
    const stepped = steppedMovesForWorkout(prev, next);
    expect(stepped.map((s) => s.slug).sort()).toEqual(['ride', 'wallsit']);
  });

  test('the very first encoded week (no predecessor) reads every move as new', () => {
    const next: MoveFeelWorkout = {
      warmup: [{ name: 'Outdoor walk', reps: '10 min' }],
      main: [{ name: 'Bodyweight squats', reps: '10 reps' }],
    };
    const stepped = steppedMovesForWorkout(undefined, next);
    expect(stepped).toHaveLength(2);
  });
});

test.describe('moveFeelString / parseMoveFeelString — tap saves the right slug/qty', () => {
  test('only the moves she actually tapped a feel on are saved, with the stepped qty attached', () => {
    const stepped = [
      {
        name: 'Supported split squat',
        slug: 'supportedsplitsquat',
        kind: 'reps' as const,
        summary: '',
      },
      { name: 'Wall sit', slug: 'wallsit', kind: 'seconds' as const, qty: 45, summary: '' },
      { name: 'Outdoor walk', slug: 'ride', kind: 'minutes' as const, qty: 12, summary: '' },
    ];
    const s = moveFeelString(
      { supportedsplitsquat: 'right', wallsit: 'easy', ride: 'right' },
      stepped
    );
    expect(s).toBe('supportedsplitsquat=right;wallsit=easy@45s;ride=right@12min');
  });

  test('a move she never tapped is simply absent from the string', () => {
    const stepped = [
      {
        name: 'Supported split squat',
        slug: 'supportedsplitsquat',
        kind: 'reps' as const,
        summary: '',
      },
      { name: 'Wall sit', slug: 'wallsit', kind: 'seconds' as const, qty: 45, summary: '' },
    ];
    expect(moveFeelString({ wallsit: 'hard' }, stepped)).toBe('wallsit=hard@45s');
  });

  test('nothing tapped -> null, never an empty string', () => {
    expect(moveFeelString({}, [])).toBeNull();
  });

  test('a stale feel for a slug that is no longer stepped is silently dropped', () => {
    const stepped = [
      { name: 'Wall sit', slug: 'wallsit', kind: 'seconds' as const, qty: 45, summary: '' },
    ];
    expect(moveFeelString({ wallsit: 'easy', ghost: 'hard' }, stepped)).toBe('wallsit=easy@45s');
  });

  test('parseMoveFeelString reverses moveFeelString exactly', () => {
    const s = 'splitsquat=right;wallsit=easy@45s;ride=right@12min';
    expect(parseMoveFeelString(s)).toEqual([
      { slug: 'splitsquat', feel: 'right', qtyRaw: null },
      { slug: 'wallsit', feel: 'easy', qtyRaw: '45s' },
      { slug: 'ride', feel: 'right', qtyRaw: '12min' },
    ]);
  });

  test('parseMoveFeelString on null/empty returns []', () => {
    expect(parseMoveFeelString(null)).toEqual([]);
    expect(parseMoveFeelString(undefined)).toEqual([]);
    expect(parseMoveFeelString('')).toEqual([]);
  });
});

// v59 (Sep 28 2026), CHECK-v58 round 2 must #R2-S1: the pre-log "Stepped
// this week" line's own one-line budget — tested here (pure) since
// tests/app.spec.ts's own phone-size test proves the actual RESULT of the
// real fit (the Lite chip clears the action bar) — the live DOM measurement
// itself (app.ts's fitSteppedLine) has no browser-free unit test on purpose,
// same as this module's own "stays DOM-free" discipline. What's pure and
// tested here is the STRING each shown-count builds.
test.describe('steppedLineFor / steppedLineText — the pre-log preview text', () => {
  const move = (summary: string): SteppedMove => ({
    name: summary,
    slug: summary,
    kind: 'reps',
    summary,
  });

  test('nothing stepped -> empty string, no line at all', () => {
    expect(steppedLineText([])).toBe('');
    expect(steppedLineFor([], 1)).toBe('');
  });

  test('steppedLineText is untrimmed — every stepped move, no "more" — the live fit (app.ts) does the trimming', () => {
    const stepped = [move('split squat 8-10'), move('hip hinge 1–2 kg'), move('wall sit 45s')];
    expect(steppedLineText(stepped)).toBe(
      'Stepped this week: split squat 8-10 · hip hinge 1–2 kg · wall sit 45s'
    );
  });

  test('steppedLineFor(stepped, shown) shows exactly `shown` moves, "+N more" for the rest', () => {
    const stepped = [move('split squat 8-10'), move('hip hinge 1–2 kg'), move('wall sit 45s')];
    expect(steppedLineFor(stepped, 3)).toBe(
      'Stepped this week: split squat 8-10 · hip hinge 1–2 kg · wall sit 45s'
    );
    expect(steppedLineFor(stepped, 2)).toBe(
      'Stepped this week: split squat 8-10 · hip hinge 1–2 kg · +1 more'
    );
    expect(steppedLineFor(stepped, 1)).toBe('Stepped this week: split squat 8-10 · +2 more');
  });

  test('never drops to zero shown moves, even asked for 0', () => {
    const stepped = [move('ride 12 min')];
    expect(steppedLineFor(stepped, 0)).toBe('Stepped this week: ride 12 min');
  });
});

// Mirrors migrations/2026-09-28-v58-move-feel.sql's CHECK exactly — a future
// change to either can never quietly drift from the other.
test.describe('isValidMoveFeelString — matches the live DB CHECK', () => {
  test('accepts every real shape moveFeelString can produce', () => {
    const cases = [
      'splitsquat=right',
      'wallsit=easy@45s',
      'ride=right@12min',
      'curl=@2kg', // the arm_feel feel-less-load shape stays legal too
      'splitsquat=right;wallsit=easy@45s;ride=hard@12min',
    ];
    for (const c of cases) expect(isValidMoveFeelString(c)).toBe(true);
  });

  test('rejects a digit in the slug, an unknown feel word, and a bad unit', () => {
    expect(isValidMoveFeelString('split1squat=right')).toBe(false);
    expect(isValidMoveFeelString('wallsit=meh')).toBe(false);
    expect(isValidMoveFeelString('ride=right@12lb')).toBe(false);
    expect(isValidMoveFeelString('wallsit=easy@45s;')).toBe(false);
  });
});

test('RIDE_NAMES is exactly the three cardio-slot display names', () => {
  expect([...RIDE_NAMES].sort()).toEqual(['Apartment cardio', 'Elliptical', 'Outdoor walk']);
});
