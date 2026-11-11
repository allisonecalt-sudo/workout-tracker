// tests/day-mode.test.ts — "Not my best day?" (v74, Nov 11 2026). Pure Node, no browser.
//
// WHAT: each of the six day modes' effect on the workout (rounds, swaps, ride, path lock, no workout
// for a rest day), D and Round 2 untouched, the three new variant cards (detail, video, voice file),
// day_mode on the wire, a rest day kept out of every session reader, the coming-back rule (the next
// 3 workouts after a logged easy / rest day open with 38 pre-picked, and she can override), and
// Nov 11-14 still Round 2 Week 8.
// WHY: her words (Wed Nov 11 2026 15:43/15:49): "Ok but he's if I'm ick" · "figure out how to
// incorporate this clearly". Design: second-brain projects/workout-tracker/R3-PLAN-2026-11-11.md.
// The UI half (the link, the sheet, the cards, Home) is tests/screens/day-mode.spec.ts.

import { test, expect } from '@playwright/test';
import { planForWeekKey, PROGRAM, SAFETY_LINE, EXERCISE_GUIDE, type WorkoutId } from '../program';
import { workoutForPath } from '../paths';
import {
  applyDayMode,
  comingBackActive,
  pathInForce,
  isRestMode,
  isSwapMode,
  isSickMode,
  DAY_MODES,
  DAY_MODE_NEW_CARDS,
  SWAP_NOTE,
  SEE_A_DOCTOR,
  type DayMode,
} from '../day-mode';
import { EXERCISE_DETAIL } from '../exercise-detail';
import { EXERCISE_VISUALS } from '../exercise-visuals';
import { shownWeek, type WeekClockInput } from '../program-week';
import {
  sessionPayload,
  legacySessionPayload,
  restDayPayload,
  mergeRestDays,
  mergeRemoteSessions,
  type RemoteSession,
} from '../sync';
import { isValidLogEntry } from '../state';
import { setWorkoutDProvider } from '../week-clock';
import { getWorkoutD } from '../workout-now';
import type { LogEntry, RestDay } from '../types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const R3W1 = planForWeekKey({ round: 3, week: 1 }).plan;
const LETTERS: WorkoutId[] = ['A', 'B', 'C'];
const today = (id: WorkoutId, p: '38' | '48' | '60', mode: DayMode | null) =>
  applyDayMode(workoutForPath(R3W1.workouts[id], pathInForce(p, mode)), mode);
const names = (w: { main: { name: string }[] }): string[] => w.main.map((e) => e.name);

test.describe('v74 - the six modes', () => {
  test('there are six, in three kinds', () => {
    expect([...DAY_MODES].sort()).toEqual(['back', 'cold', 'crohns', 'fever', 'knee', 'wrist']);
    expect(DAY_MODES.filter(isSwapMode).length).toBe(3);
    expect(DAY_MODES.filter(isRestMode).length).toBe(2);
    expect(DAY_MODES.filter(isSickMode).length).toBe(3);
  });

  test('a normal day is the very same workout object', () => {
    for (const id of LETTERS) {
      const w = workoutForPath(R3W1.workouts[id], '48');
      expect(applyDayMode(w, null)).toBe(w);
    }
  });

  test('a REST day has no workout to change (same object back); the page shows a card instead', () => {
    for (const id of LETTERS) {
      const w = workoutForPath(R3W1.workouts[id], '48');
      expect(applyDayMode(w, 'fever')).toBe(w);
      expect(applyDayMode(w, 'crohns')).toBe(w);
    }
  });

  test('SWAP and EASY days are 1 round on every path, A, B and C', () => {
    for (const id of LETTERS) {
      for (const p of ['38', '48', '60'] as const) {
        for (const m of ['back', 'knee', 'wrist', 'cold'] as const) {
          expect(today(id, p, m).rounds).toBe(1);
        }
      }
    }
  });

  test('D and every Round 2 week have no day modes: the workout comes back untouched', () => {
    const d = getWorkoutD();
    for (const m of DAY_MODES) expect(applyDayMode(d, m)).toBe(d);
    for (const wp of PROGRAM.filter((x) => (x.round ?? 1) < 3)) {
      for (const id of LETTERS) {
        const w = wp.workouts[id];
        for (const m of DAY_MODES) expect(applyDayMode(w, m)).toBe(w);
      }
    }
  });

  test('the cool-down and the primer are never touched by a day mode', () => {
    for (const id of LETTERS) {
      for (const m of DAY_MODES) {
        const w = today(id, '60', m);
        expect(w.cooldown).toEqual(R3W1.workouts[id].cooldown);
        expect(w.warmup[1]).toEqual(R3W1.workouts[id].warmup[1]);
      }
    }
  });
});

test.describe('v74 - SWAP day: back', () => {
  test('B: hip hinge becomes the wall hinge (bridges already follow), with its top line', () => {
    const w = today('B', '60', 'back');
    expect(names(w)[0]).toBe('Hip hinge, no weight, hands on the wall');
    expect(names(w)).toContain('Glute bridges');
    expect(w.main[0]!.swap).toBe(
      'Swapped for your back today: Hip hinge, no weight, hands on the wall instead of Bodyweight hip hinge'
    );
  });

  test('A: Chair squat keeps its name (card + voice + history) with a higher seat, shorter range', () => {
    const sq = today('A', '38', 'back').main[0]!;
    expect(sq.name).toBe('Chair squat');
    expect(sq.label).toBe('Chair squat, higher seat');
    expect(sq.reps).toContain('higher seat');
    expect(sq.swap).toMatch(/^Swapped for your back today: /);
  });

  test('C: the split squat becomes a Wall sit at a comfortable angle (a timed hold)', () => {
    const w = today('C', '38', 'back');
    const ws = w.main[0]!;
    expect(ws.name).toBe('Wall sit');
    expect(ws.reps).toContain('comfortable angle');
    expect(ws.isTimed).toBe(true);
    expect(ws.durationSec).toBeGreaterThan(0);
    expect(ws.swap).toBe(
      'Swapped for your back today: Wall sit (comfortable angle) instead of Supported split squat'
    );
    // the comfort-angle safety line replaces the "Knees toward 90" one
    expect(ws.safety).toContain('comfortable');
  });

  test('the ride stays (the elliptical is still offered) and its note offers the walk lane 5-10 min', () => {
    const ride = today('A', '48', 'back').warmup[0]!;
    expect(ride.name).toBe('Outdoor walk');
    expect(ride.reps).toBe('12 min');
    expect(ride.notes).toContain('walk lane');
    expect(ride.notes).toContain('5–10 min');
    expect(ride.swap).toBeUndefined();
  });
});

test.describe('v74 - SWAP day: knee', () => {
  test('Chair squat is half depth; the split squat is a shallow, pain-free Wall sit', () => {
    expect(today('A', '38', 'knee').main[0]!.label).toBe('Chair squat, half depth');
    const ws = today('C', '38', 'knee').main[0]!;
    expect(ws.name).toBe('Wall sit');
    expect(ws.reps).toContain('shallow, pain-free');
    expect(ws.swap).toBe(
      'Swapped for your knee today: Wall sit (shallow, pain-free) instead of Supported split squat'
    );
  });

  test('the ride becomes the walk lane, same minutes; bridges and clamshells stay', () => {
    for (const p of ['38', '48', '60'] as const) {
      const ride = today('C', p, 'knee').warmup[0]!;
      expect(ride.reps).toBe(workoutForPath(R3W1.workouts.C, p).warmup[0]!.reps);
      expect(ride.swap).toContain('walk lane instead of the elliptical');
    }
    expect(names(today('B', '48', 'knee'))).toContain('Glute bridges');
    expect(names(today('C', '60', 'knee'))).toContain('Side-lying clamshells');
    // hip hinge is a back move: a knee day leaves it alone
    expect(names(today('B', '48', 'knee'))[0]).toBe('Bodyweight hip hinge');
  });
});

test.describe('v74 - SWAP day: wrist', () => {
  test('A: the incline push-up on fists becomes the wall push-up on forearms', () => {
    const w = today('A', '48', 'wrist');
    expect(names(w)).toContain('Wall push-up on forearms');
    expect(names(w)).not.toContain('Incline push-up on fists');
  });

  test('B: bird dog becomes bird dog on forearms (60 path); one-arm rows get a loose grip', () => {
    const w = today('B', '60', 'wrist');
    expect(names(w)).toContain('Bird dog on forearms');
    expect(names(w)).not.toContain('Bird dog');
    const row = w.main.find((e) => e.name === 'One-arm dumbbell row')!;
    expect(row.reps).toContain('loose grip');
    expect(row.swap).toContain('a loose grip');
    expect(today('A', '38', 'wrist').main.find((e) => e.name === 'Band row')!.reps).toContain(
      'loose grip'
    );
  });

  test('C: floor press is thumbs in, lighter or no weight; the side plank is already on the forearm', () => {
    const w = today('C', '48', 'wrist');
    const fp = w.main.find((e) => e.name === 'Floor press')!;
    expect(fp.reps).toContain('lighter or no weight');
    expect(fp.swap).toMatch(/^Swapped for your wrist today: thumbs in/);
    const sp = w.main.find((e) => e.name === 'Side plank on knees')!;
    expect(sp.swap).toBeUndefined();
    // legs, hinge, bridge and the ride run as written
    expect(w.warmup[0]).toEqual(workoutForPath(R3W1.workouts.C, '48').warmup[0]);
    expect(names(today('B', '48', 'wrist'))[0]).toBe('Bodyweight hip hinge');
  });
});

test.describe('v74 - EASY day (a cold, no fever)', () => {
  test('the 38 path is forced whatever she had tapped; 3 moves, 1 round, easy ride note', () => {
    expect(pathInForce('60', 'cold')).toBe('38');
    expect(pathInForce(null, 'cold')).toBe('38');
    expect(pathInForce('60', 'back')).toBe('60');
    for (const id of LETTERS) {
      const w = today(id, '60', 'cold');
      expect(w.main.length).toBe(3);
      expect(w.rounds).toBe(1);
      expect(w.warmup[0]!.reps).toBe('10 min');
      expect(w.warmup[0]!.notes).toBe('Easy — short sentences or easier.');
      expect(w.description).toContain('~38 min');
    }
  });

  test('an easy day swaps no moves', () => {
    for (const id of LETTERS) {
      expect(names(today(id, '60', 'cold'))).toEqual(
        names(workoutForPath(R3W1.workouts[id], '38'))
      );
    }
  });
});

test.describe('v74 - the three new cards (detail + video + voice + safety + how-to)', () => {
  for (const name of DAY_MODE_NEW_CARDS) {
    test(`${name}: detail card, checked video, voice file, safety line, how-to`, () => {
      const d = EXERCISE_DETAIL[name];
      expect(d, 'detail card').toBeTruthy();
      expect(d!.steps.length).toBeGreaterThanOrEqual(3);
      expect(d!.dos.length).toBeGreaterThan(0);
      expect(d!.donts.length).toBeGreaterThan(0);
      expect(d!.voiceScript).toContain('A little pain is OK');
      const mp3 = path.join(__dirname, '..', d!.voiceSrc.replace('./', ''));
      expect(fs.existsSync(mp3), mp3).toBe(true);
      expect(fs.statSync(mp3).size).toBeGreaterThan(50_000);
      const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
      expect(sw).toContain(d!.voiceSrc);
      const v = EXERCISE_VISUALS[name];
      expect(v?.youtubeId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(v?.attribution).toBeTruthy();
      expect(SAFETY_LINE[name]).toBeTruthy();
      expect(EXERCISE_GUIDE[name]?.howTo).toContain('A little pain is OK');
    });
  }

  test('every swapped-in move that is not a new card already has a card (Wall sit, Glute bridges)', () => {
    for (const n of ['Wall sit', 'Glute bridges', 'Chair squat', 'Floor press', 'Band row']) {
      expect(EXERCISE_DETAIL[n], n).toBeTruthy();
    }
  });

  test('no swapped move on any path of any day mode lacks a detail card or a safety/how-to', () => {
    for (const id of LETTERS) {
      for (const m of ['back', 'knee', 'wrist'] as const) {
        for (const ex of today(id, '60', m).main) {
          expect(EXERCISE_DETAIL[ex.name], `${id} ${m} ${ex.name}`).toBeTruthy();
        }
      }
    }
  });
});

test.describe('v74 - the rest card words are the design (no medical advice beyond it)', () => {
  test('the doctor list is the six items, exactly', () => {
    expect([...SEE_A_DOCTOR]).toEqual([
      'chest pain or tightness',
      'racing or pounding heart',
      'breathless out of proportion',
      'faint or dizzy',
      'fever coming back',
      'a crash 1–2 days after exercise',
    ]);
  });
  test('the swap note', () => {
    expect(SWAP_NOTE).toBe('About half your usual reps · effort 5–6 · your pain rule');
  });
});

const base: LogEntry = {
  id: 'd1',
  date: '2026-11-15T10:00:00+02:00',
  workout: 'A',
  capacityBefore: null,
  capacityAfter: null,
  wallSitSec: 0,
  backPain: null,
  word: '',
};

test.describe('v74 - day_mode on the wire', () => {
  test('the payload carries day_mode; a normal day carries null; a server without the column still saves', () => {
    setWorkoutDProvider(getWorkoutD);
    expect(sessionPayload({ ...base, dayMode: 'knee' })['day_mode']).toBe('knee');
    expect(sessionPayload({ ...base, dayMode: 'cold' })['day_mode']).toBe('cold');
    expect(sessionPayload(base)['day_mode']).toBeNull();
    expect('day_mode' in legacySessionPayload({ ...base, dayMode: 'wrist' })).toBe(false);
  });

  test('a pull round-trips day_mode on a working day and ignores a junk value', () => {
    const row = (id: string, dm: string | null): RemoteSession =>
      ({
        id,
        date: '2026-11-15T10:00:00+02:00',
        workout_type: 'A',
        capacity_before_1_10: null,
        one_word: null,
        started_at: null,
        completed_at: null,
        duration_seconds: null,
        day_mode: dm,
      }) as RemoteSession;
    const merged = mergeRemoteSessions([], [row('a', 'back'), row('b', 'fever'), row('c', null)]);
    expect(merged.find((l) => l.id === 'a')!.dayMode).toBe('back');
    // 'fever' is a rest-day value: it can never be a session's day mode
    expect(merged.find((l) => l.id === 'b')!.dayMode).toBeNull();
    expect(merged.find((l) => l.id === 'c')!.dayMode).toBeNull();
  });

  test('a saved row with a day mode is a valid log; a rest mode is not a valid log entry', () => {
    expect(isValidLogEntry({ ...base, dayMode: 'back' })).toBe(true);
    expect(isValidLogEntry({ ...base, dayMode: 'cold' })).toBe(true);
    expect(isValidLogEntry({ ...base, dayMode: null })).toBe(true);
    expect(isValidLogEntry({ ...base })).toBe(true);
    expect(isValidLogEntry({ ...base, dayMode: 'fever' })).toBe(false);
    expect(isValidLogEntry({ ...base, workout: 'R' })).toBe(false);
  });
});

test.describe('v74 - a rest day is never a workout', () => {
  const rest: RestDay = { id: 'r1', date: '2026-11-16T09:00:00+02:00', mode: 'fever' };

  test('the server row is workout_type R + day_mode; nothing else', () => {
    expect(restDayPayload(rest)).toEqual({
      id: 'r1',
      date: '2026-11-16T09:00:00+02:00',
      workout_type: 'R',
      day_mode: 'fever',
    });
  });

  test('mergeRemoteSessions never turns an R row into a session (and a rest day filled the window)', () => {
    const r = {
      id: 'r1',
      date: rest.date,
      workout_type: 'R',
      capacity_before_1_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      day_mode: 'fever',
    } as RemoteSession;
    expect(mergeRemoteSessions([], [r])).toEqual([]);
  });

  test('mergeRestDays: server rows win, a local unsynced rest day is kept and marked synced when the server has it', () => {
    const remote = [
      {
        id: 'r1',
        date: rest.date,
        workout_type: 'R',
        day_mode: 'fever',
      },
      { id: 'r2', date: '2026-11-17T09:00:00+02:00', workout_type: 'R', day_mode: 'crohns' },
      { id: 'x', date: '2026-11-17T09:00:00+02:00', workout_type: 'R', day_mode: 'junk' },
    ] as unknown as RemoteSession[];
    const merged = mergeRestDays(
      [
        { ...rest, synced: false },
        { ...rest, id: 'r9', synced: false },
      ],
      remote
    );
    expect(merged.map((d) => d.id).sort()).toEqual(['r1', 'r2', 'r9']);
    expect(merged.find((d) => d.id === 'r1')!.synced).toBe(true);
    expect(merged.find((d) => d.id === 'r9')!.synced).toBe(false);
  });

  test('a logged rest day does not move the week clock: the same week, the same sessions', () => {
    // rest days are not in `logs`, so the clock cannot see them: same input, same answer
    const logs: LogEntry[] = [];
    const at = (iso: string): WeekClockInput => ({ logs, moves: [], now: new Date(iso) });
    const before = shownWeek(at('2026-11-16T09:00:00+02:00'));
    const after = shownWeek(at('2026-11-16T09:05:00+02:00'));
    expect(after.key).toEqual(before.key);
    expect(before.key).toEqual({ round: 3, week: 1 });
  });
});

test.describe('v74 - coming back from being sick', () => {
  const sess = (id: string, iso: string, over: Partial<LogEntry> = {}): LogEntry => ({
    ...base,
    id,
    date: iso,
    ...over,
  });
  const rest: RestDay = { id: 'r1', date: '2026-11-16T09:00:00+02:00', mode: 'crohns' };
  const cold = sess('c1', '2026-11-16T10:00:00+02:00', { dayMode: 'cold', sessionPath: '38' });

  test('never on with no sick day logged (a swap day does not count)', () => {
    expect(comingBackActive([], [])).toBe(false);
    expect(
      comingBackActive([sess('s1', '2026-11-16T10:00:00+02:00', { dayMode: 'back' })], [])
    ).toBe(false);
  });

  test('after a logged REST day: on for the next 3 workouts, off from the 4th', () => {
    const w = (n: number, p: '38' | '48' | '60' = '38') =>
      sess(`w${n}`, `2026-11-${17 + n}T10:00:00+02:00`, { sessionPath: p });
    expect(comingBackActive([], [rest])).toBe(true);
    expect(comingBackActive([w(0)], [rest])).toBe(true);
    expect(comingBackActive([w(0), w(1)], [rest])).toBe(true);
    expect(comingBackActive([w(0), w(1), w(2)], [rest])).toBe(false);
  });

  test('after a logged EASY day (the cold session itself does not count as one of the 3)', () => {
    expect(comingBackActive([cold], [])).toBe(true);
    const w1 = sess('w1', '2026-11-18T10:00:00+02:00', { sessionPath: '38' });
    expect(comingBackActive([cold, w1], [])).toBe(true);
  });

  test('she can override: a workout done on another path ends it; workout D never counts', () => {
    const w1 = sess('w1', '2026-11-18T10:00:00+02:00', { sessionPath: '60' });
    expect(comingBackActive([cold, w1], [])).toBe(false);
    const d = sess('d1', '2026-11-18T10:00:00+02:00', { workout: 'D', sessionPath: null });
    expect(comingBackActive([cold, d], [])).toBe(true);
  });

  test('a newer sick day starts it again', () => {
    const ws = [1, 2, 3].map((n) =>
      sess(`w${n}`, `2026-11-${17 + n}T10:00:00+02:00`, { sessionPath: '38' })
    );
    expect(comingBackActive(ws, [rest])).toBe(false);
    const newer: RestDay = { id: 'r2', date: '2026-11-25T09:00:00+02:00', mode: 'fever' };
    expect(comingBackActive(ws, [rest, newer])).toBe(true);
  });
});

test.describe('v74 - Nov 11-14 is still Round 2 Week 8 with C open', () => {
  test('the shown week stays Round 2 Week 8 until Sun Nov 15, and has no time paths or day modes', () => {
    const logs: LogEntry[] = [];
    for (const iso of ['2026-11-11T12:00:00+02:00', '2026-11-14T23:59:00+02:00']) {
      const shown = shownWeek({ logs, moves: [], now: new Date(iso) });
      expect(shown.key.round).toBe(2);
    }
    const r2 = PROGRAM.filter((wp) => wp.round === 2);
    const wk = r2[r2.length - 1]!;
    for (const id of LETTERS) expect(wk.workouts[id].paths).toBeUndefined();
  });
});
