// tests/program.test.ts — program.ts (code-shape step 2b, Oct 13 2026)
//
// What this is: Node-side checks over the PROGRAM data itself, run by test:fast
// (no `page` fixture, so Playwright runs it in Node — same as tests/week.test.ts).
// Why it exists: the program is ~2,500 lines of hand-written rows; a typo'd
// exercise name or a hold without its timer only showed up when she reached
// that move. These assert today's truth over every row, so the next week's
// row can't quietly break a lookup.
// What's pinned: every exercise name resolves where the app looks it up; every
// sustained timed hold carries durationSec + isTimed (the Jul 8 2026 timer
// rule — see the Exercise type's comment in program.ts); every startsOn is a
// Saturday; (round, weekNum) is unique and ascending; 17 weeks.

import { test, expect } from '@playwright/test';
import { PROGRAM, SAFETY_LINE, type Exercise, type Phase, type WeekPlan } from '../program';
import { EXERCISE_DETAIL } from '../exercise-detail';
import { slugFor } from '../move-feel';

// The ONE "how many program weeks" constant. The Settings > About "Program
// weeks" assertion in tests/screens/program-weeks.spec.ts reads the same number
// (17): 11 round-1 weeks + R2 W1..W5 + R2 W6 (the Oct 10 light restart).
// Adding a week = change this and that spec's text together.
const PROGRAM_WEEK_COUNT = 17;

const PHASES: Phase[] = ['warmup', 'main', 'upperBack', 'cooldown'];
const WORKOUT_IDS = ['A', 'B', 'C'] as const;

type Row = { wp: WeekPlan; where: string; phase: Phase; ex: Exercise };

function weekTag(wp: WeekPlan): string {
  return `R${wp.round ?? 1}W${wp.weekNum}`;
}

// Every exercise in every row, with a human-readable location.
function allExercises(): Row[] {
  const out: Row[] = [];
  for (const wp of PROGRAM) {
    for (const id of WORKOUT_IDS) {
      for (const phase of PHASES) {
        for (const ex of wp.workouts[id][phase] ?? []) {
          out.push({ wp, where: `${weekTag(wp)} ${id} ${phase}`, phase, ex });
        }
      }
    }
  }
  return out;
}

test.describe('PROGRAM — shape', () => {
  test(`has exactly ${PROGRAM_WEEK_COUNT} weeks (the Settings "Program weeks" number)`, () => {
    expect(PROGRAM.length).toBe(PROGRAM_WEEK_COUNT);
  });

  test('every startsOn is a Saturday (weeks are Sat-Fri throughout the app)', () => {
    const notSaturday = PROGRAM.filter(
      (wp) => new Date(wp.startsOn + 'T00:00:00').getDay() !== 6
    ).map((wp) => `${weekTag(wp)} ${wp.startsOn}`);
    expect(notSaturday).toEqual([]);
  });

  test('(round, weekNum) is unique and ascending; startsOn strictly ascends with it', () => {
    const keys = PROGRAM.map((wp) => (wp.round ?? 1) * 1000 + wp.weekNum);
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i], `${weekTag(PROGRAM[i]!)} after ${weekTag(PROGRAM[i - 1]!)}`).toBeGreaterThan(
        keys[i - 1]!
      );
      expect(PROGRAM[i]!.startsOn > PROGRAM[i - 1]!.startsOn).toBe(true);
    }
  });
});

test.describe('PROGRAM — names resolve where the app looks them up', () => {
  // The app keys everything by `ex.name` (label is display only): the card
  // face is `EXERCISE_DETAIL[ex.name] ? renderDetailCard : renderHowToCard`,
  // and today EVERY name in the program has an EXERCISE_DETAIL entry — so no
  // exceptions. If a future move legitimately has none (it would fall to the
  // how-to/guide fallback), list it HERE with a one-line reason; never loosen
  // the assertion.
  const NAMES_WITHOUT_DETAIL: Record<string, string> = {};

  test('every exercise name in every row has an EXERCISE_DETAIL entry', () => {
    const missing = new Set<string>();
    for (const { ex } of allExercises()) {
      if (!EXERCISE_DETAIL[ex.name] && !(ex.name in NAMES_WITHOUT_DETAIL)) missing.add(ex.name);
    }
    expect([...missing].sort()).toEqual([]);
  });

  test('the exceptions list holds no stale name (every listed name is still in the program)', () => {
    const inProgram = new Set(allExercises().map((r) => r.ex.name));
    for (const name of Object.keys(NAMES_WITHOUT_DETAIL)) expect(inProgram.has(name)).toBe(true);
  });

  test('every SAFETY_LINE key is an exercise name that is actually in the program', () => {
    const inProgram = new Set(allExercises().map((r) => r.ex.name));
    const orphans = Object.keys(SAFETY_LINE).filter((k) => !inProgram.has(k));
    expect(orphans).toEqual([]);
  });

  test('move-feel slugs: every name slugs to letters only, and no two names share a slug', () => {
    const bySlug = new Map<string, Set<string>>();
    for (const { ex } of allExercises()) {
      const slug = slugFor(ex.name);
      expect(slug, ex.name).toMatch(/^[a-z]+$/);
      const names = bySlug.get(slug) ?? new Set<string>();
      names.add(ex.name);
      bySlug.set(slug, names);
    }
    // The cardio slot slugs every lane to "ride" on purpose (move-feel.ts's
    // RIDE_NAMES) — the only legitimate many-names-one-slug case.
    const collisions = [...bySlug.entries()]
      .filter(([slug, names]) => slug !== 'ride' && names.size > 1)
      .map(([slug, names]) => `${slug}: ${[...names].join(' / ')}`);
    expect(collisions).toEqual([]);
  });
});

test.describe('PROGRAM — the Jul 8 timer rule', () => {
  // A SUSTAINED timed hold = reps text ending in "N sec" / "N-M sec" with an
  // optional "hold" or "each side" ("20 sec hold", "1 set · 15 sec hold",
  // "60 sec", "45 sec each side", "2 × 15-20 sec"). Per-rep micro-holds
  // ("10 holds × 3 sec", "2-sec hold at top", "5-sec hold") are NOT matched.
  const SUSTAINED_HOLD = /\b\d+(?:-\d+)? sec(?: hold| each side)?\s*$/;
  const isSustainedHold = (ex: Exercise): boolean =>
    !!ex.reps && SUSTAINED_HOLD.test(ex.reps) && !/holds/.test(ex.reps);

  // Today's one legitimate gap: the first four Round-1 weeks' cool-down
  // stretches (COOLDOWN_AB / COOLDOWN_C, written in May) predate the Jul 8
  // rule and were never retrofitted — and the cool-down list is self-paced
  // anyway (her Jun 6 call; see the Exercise type's TIMER RULE comment).
  const UNTIMED_BEFORE_RULE: Record<string, string> = {
    'Knees-to-chest hold':
      'Round 1 W1-W4 COOLDOWN_AB/C stretch, written before the Jul 8 timer rule',
    'Figure-4 stretch': 'Round 1 W1-W4 COOLDOWN_AB/C stretch, written before the Jul 8 timer rule',
    'Seated forward fold': 'Round 1 W1-W4 COOLDOWN_AB stretch, written before the Jul 8 timer rule',
  };

  test('every sustained hold has durationSec AND isTimed (except the named Round-1 W1-W4 stretches)', () => {
    const offenders: string[] = [];
    for (const { wp, where, ex } of allExercises()) {
      if (!isSustainedHold(ex)) continue;
      if (ex.isTimed === true && typeof ex.durationSec === 'number' && ex.durationSec > 0) continue;
      const early = (wp.round ?? 1) === 1 && wp.weekNum <= 4;
      if (early && ex.name in UNTIMED_BEFORE_RULE) continue;
      offenders.push(`${where}: ${ex.name} — "${ex.reps}"`);
    }
    expect(offenders).toEqual([]);
  });

  test('isTimed and durationSec always travel together (never one without the other)', () => {
    const offenders: string[] = [];
    for (const { where, ex } of allExercises()) {
      const hasDur = typeof ex.durationSec === 'number' && ex.durationSec > 0;
      if (Boolean(ex.isTimed) !== hasDur) offenders.push(`${where}: ${ex.name}`);
    }
    expect(offenders).toEqual([]);
  });
});
