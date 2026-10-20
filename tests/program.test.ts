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
import {
  PROGRAM,
  ROUNDS,
  SAFETY_LINE,
  SKIPPED_WEEKS,
  planForWeekKey,
  type Exercise,
  type Phase,
  type WeekPlan,
} from '../program';
import { EXERCISE_DETAIL } from '../exercise-detail';
import { slugFor } from '../move-feel';
import { allSourceFiles, appSourceFiles, bundledSourceFiles, nextRoundNum } from './helpers';

// The ONE "how many program weeks" constant. The Settings > About "Program
// weeks" assertion in tests/screens/program-weeks.spec.ts reads the same number
// (18): 11 round-1 weeks + R2 W1..W5 + R2 W6 (the Oct 10 light restart)
// + R2 W7 (Oct 24, 35% of Week 5 — v65).
// Adding a week = change this and that spec's text together.
const PROGRAM_WEEK_COUNT = 18;

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
  // stretches — both the cool-down phase (COOLDOWN_AB / COOLDOWN_C) AND the
  // R1W1 C main-phase Knees-to-chest hold + Figure-4 stretch — written in May,
  // predate the Jul 8
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

  test('the exceptions list holds no stale name (each listed stretch still occurs in Round 1 weeks 1-4)', () => {
    const early = allExercises().filter(({ wp }) => (wp.round ?? 1) === 1 && wp.weekNum <= 4);
    for (const name of Object.keys(UNTIMED_BEFORE_RULE)) {
      expect(
        early.some(({ ex }) => ex.name === name && isSustainedHold(ex) && !ex.isTimed),
        name
      ).toBe(true);
    }
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

test.describe('appSourceFiles() — the source-scan tests can never go quiet again', () => {
  test('includes app.ts AND program.ts, and every module app.ts imports', () => {
    const files = appSourceFiles();
    const names = files.map((f) => f.file);
    expect(names).toContain('app.ts');
    expect(names).toContain('program.ts');
    for (const f of files) expect(f.src.length, f.file).toBeGreaterThan(0);
    const app = files.find((f) => f.file === 'app.ts')!.src;
    const imported = [...app.matchAll(/from '\.\/([\w-]+)\.js'/g)].map((m) => `${m[1]}.ts`);
    expect(imported.length).toBeGreaterThan(0);
    for (const mod of imported) expect(names, `app.ts imports ${mod}`).toContain(mod);
  });

  test('bundledSourceFiles() is a subset of allSourceFiles(): app.ts, program.ts and every import, and the unwired engine only if app.ts reaches it', () => {
    const all = allSourceFiles().map((f) => f.file);
    expect(appSourceFiles().map((f) => f.file)).toEqual(all);
    const bundledFiles = bundledSourceFiles();
    const bundled = bundledFiles.map((f) => f.file);
    for (const f of bundled) expect(all, f).toContain(f);
    expect(bundled).toContain('app.ts');
    expect(bundled).toContain('program.ts');
    const app = bundledFiles.find((f) => f.file === 'app.ts')!.src;
    for (const m of app.matchAll(/from '\.\/([\w-]+)\.js'/g))
      expect(bundled, `app.ts imports ${m[1]}`).toContain(`${m[1]}.ts`);
    // ladders.ts / progression.ts are tested pure modules not wired into app.ts
    // (CLAUDE.md file map). They stay out of the bundled set exactly as long as
    // nothing in the bundle imports them; this goes red the day that changes
    // and tells the next person voice-load's scope just grew.
    for (const f of ['ladders', 'progression']) {
      const reached = bundledFiles.some((b) => new RegExp(`from '\\./${f}\\.js'`).test(b.src));
      expect(bundled.includes(`${f}.ts`), `${f}.ts`).toBe(reached);
      expect(reached, `${f}.ts is not imported by the bundle`).toBe(false);
    }
  });
});

// v62.1 (Oct 14 2026) — guards on the two hand-typed calendar tables. A typo in
// either today only logs a console.warn her phone never shows, so it fails here.
test.describe('v62.1 — ROUNDS and SKIPPED_WEEKS are real Saturdays, and every round has a plan', () => {
  const isRealSaturday = (iso: string): boolean => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(y, mo - 1, d);
    return (
      dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && dt.getDay() === 6
    );
  };

  test('every SKIPPED_WEEKS key is a valid date AND a Saturday', () => {
    const bad = Object.keys(SKIPPED_WEEKS).filter((k) => !isRealSaturday(k));
    expect(bad).toEqual([]);
  });

  test('every ROUNDS start is a valid date AND a Saturday', () => {
    const bad = ROUNDS.filter((r) => !isRealSaturday(r.start)).map((r) => `R${r.num} ${r.start}`);
    expect(bad).toEqual([]);
  });

  test('the Saturday check itself notices a Friday, a Sunday, a rolled-over date and junk', () => {
    expect(isRealSaturday('2026-10-10')).toBe(true);
    expect(isRealSaturday('2026-10-09')).toBe(false);
    expect(isRealSaturday('2026-10-11')).toBe(false);
    expect(isRealSaturday('2026-02-30')).toBe(false);
    expect(isRealSaturday('Oct 10')).toBe(false);
  });

  test('every ROUNDS entry has at least one PROGRAM row (adding Round 3 forces writing its plan)', () => {
    const noPlan = ROUNDS.filter((r) => !PROGRAM.some((wp) => (wp.round ?? 1) === r.num)).map(
      (r) => `Round ${r.num}`
    );
    expect(noPlan).toEqual([]);
  });

  test('ROUNDS numbers are 1..N in order, starts strictly ascending', () => {
    ROUNDS.forEach((r, i) => {
      expect(r.num).toBe(i + 1);
      if (i > 0) expect(r.start > ROUNDS[i - 1]!.start).toBe(true);
    });
  });
});

// v62.1 (Oct 14 2026) — a round with NO program rows must not fall to PROGRAM[0]
// ("Round 1 Week 1 Starter"), silently. It falls back to the last written row and
// SAYS so (noPlanForRound), which Home turns into a visible line.
test.describe('v62.1 — planForWeekKey for a round with no PROGRAM rows', () => {
  const last = PROGRAM[PROGRAM.length - 1]!;
  // The hypothetical round is "the one after the highest real round", so writing a
  // REAL Round 3 later does not break these (step 7-0): today that is Round 3.
  const N = nextRoundNum();

  test('the next round, Week 1 (no rows), gets the LAST written row, never PROGRAM[0]', () => {
    const r = planForWeekKey({ round: N, week: 1 });
    expect(r.plan).toBe(last);
    expect(r.plan).not.toBe(PROGRAM[0]);
    expect(r.noPlanForRound).toBe(N);
  });

  test('the next round, Week 4 (still no rows), gets the same last row', () => {
    const r = planForWeekKey({ round: N, week: 4 });
    expect(r.plan).toBe(last);
    expect(r.noPlanForRound).toBe(N);
  });

  test('a round that HAS rows never reports a missing plan (exact and repeat)', () => {
    // Round-agnostic (step 8-0): rounds and weeks come from PROGRAM itself, so
    // writing Round 3 later does not leave a hard-coded Round 2 as "the last row".
    const lastRound = last.round ?? 1;
    const first = PROGRAM[0]!;
    expect(planForWeekKey({ round: lastRound, week: last.weekNum }).noPlanForRound).toBeNull();
    expect(planForWeekKey({ round: lastRound, week: last.weekNum + 3 }).noPlanForRound).toBeNull();
    expect(planForWeekKey({ round: lastRound, week: last.weekNum + 3 }).repeatsWeek).toBe(
      last.weekNum
    );
    expect(
      planForWeekKey({ round: first.round ?? 1, week: first.weekNum }).noPlanForRound
    ).toBeNull();
  });

  test('the fallback is the highest row AT OR BELOW the key: the next round falls to the end of the last written round, not the end of the table by accident', () => {
    // A synthetic row for the round AFTER the next one, appended: the next round must still fall to the last real row.
    const r4 = JSON.parse(JSON.stringify(last)) as WeekPlan;
    r4.round = N + 1;
    r4.weekNum = 1;
    PROGRAM.push(r4);
    try {
      expect(planForWeekKey({ round: N, week: 1 }).plan).toBe(last);
      expect(planForWeekKey({ round: N + 1, week: 1 }).plan).toBe(r4);
    } finally {
      PROGRAM.pop();
    }
  });
});
