// tests/feel-every-move.test.ts - v63 item 2 (Oct 19 2026), the pure half.
//
// "How was this one?" is on EVERY move now, so every move (and every cool-down row, by its group
// name) needs a slug the saved move_feel string can carry, and two different moves must never share
// one (a shared slug would make the last tap on one overwrite the other).
import { test, expect } from '@playwright/test';
import { PROGRAM } from '../program';
import {
  feelMoveFor,
  isValidMoveFeelString,
  moveFeelString,
  moveFeelSummary,
  slugFor,
  type SteppedMove,
} from '../move-feel';
import { groupStretchPairs } from '../workout-parts';

test.describe('every move has a slug of its own (v63 item 2)', () => {
  test('inside every workout of every week, no two different names (stretch groups by their group name) share a slug', () => {
    const clashes: string[] = [];
    for (const wp of PROGRAM) {
      for (const id of ['A', 'B', 'C'] as const) {
        const w = wp.workouts[id];
        const names: string[] = [
          ...w.warmup.map((e) => e.name),
          ...w.main.map((e) => e.name),
          ...(w.upperBack ?? []).map((e) => e.name),
          ...groupStretchPairs(w.cooldown ?? []).map((g) => g.name),
        ];
        const bySlug = new Map<string, Set<string>>();
        names.push('Stretches'); // the cool-down's one row is saved under this slug too
        for (const n of names) {
          const slug = slugFor(n);
          expect(slug, n).toMatch(/^[a-z]+$/);
          (bySlug.get(slug) ?? bySlug.set(slug, new Set()).get(slug)!).add(n);
        }
        for (const [slug, set] of bySlug) {
          if (slug !== 'ride' && set.size > 1)
            clashes.push(`${id}: ${slug}: ${[...set].join(' / ')}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});

test.describe('feelMoveFor: the slug and qty a save needs, for any one move', () => {
  test('a reps move carries no qty', () => {
    const m = feelMoveFor({ name: 'Glute bridges', reps: '12 reps' });
    expect(m).toMatchObject({ slug: 'glutebridges', kind: 'reps' });
    expect(m.qty).toBeUndefined();
  });

  test('a hold carries its seconds', () => {
    expect(feelMoveFor({ name: 'Wall sit', isTimed: true, durationSec: 45 })).toMatchObject({
      slug: 'wallsit',
      kind: 'seconds',
      qty: 45,
    });
  });

  test('the cardio slot (any lane) is "ride" and carries its minutes, read off the reps text', () => {
    expect(feelMoveFor({ name: 'Outdoor walk', reps: '12 min' })).toMatchObject({
      slug: 'ride',
      kind: 'minutes',
      qty: 12,
    });
    expect(feelMoveFor({ name: 'Elliptical', reps: '30 min' })).toMatchObject({
      slug: 'ride',
      qty: 30,
    });
  });

  test('a stretch group is saved under its group name with its hold seconds', () => {
    const groups = groupStretchPairs([
      { name: 'Wrist extension — right', reps: '45 sec each side', isTimed: true, durationSec: 45 },
      { name: 'Wrist extension — left', reps: '45 sec each side', isTimed: true, durationSec: 45 },
    ]);
    expect(groups).toHaveLength(1);
    const first = groups[0]!.items[0]!;
    expect(feelMoveFor({ ...first, name: groups[0]!.name })).toMatchObject({
      slug: 'wristextension',
      kind: 'seconds',
      qty: 45,
    });
  });

  test('moveFeelString saves a tap on ANY move in the list, in tap order, and still drops a slug the list cannot vouch for', () => {
    const list: SteppedMove[] = [
      feelMoveFor({ name: 'Glute bridges', reps: '12 reps' }),
      feelMoveFor({ name: 'Wall sit', isTimed: true, durationSec: 45 }),
      feelMoveFor({ name: 'Outdoor walk', reps: '12 min' }),
    ];
    const s = moveFeelString(
      { glutebridges: 'easy', wallsit: 'hard', ride: 'right', ghost: 'easy' },
      list
    );
    expect(s).toBe('glutebridges=easy;wallsit=hard@45s;ride=right@12min');
    expect(isValidMoveFeelString(s!)).toBe(true);
    expect(moveFeelString({}, list)).toBeNull();
  });
});

test.describe('moveFeelSummary: the Session screen line', () => {
  const names: Record<string, string> = {
    glutebridges: 'Glute bridges',
    wallsit: 'Wall sit',
    ride: 'Cardio',
  };
  const nameFor = (slug: string): string | null => names[slug] ?? null;

  test("every move's feel, with its seconds / minutes spaced", () => {
    expect(moveFeelSummary('glutebridges=easy;wallsit=hard@45s;ride=right@12min', nameFor)).toBe(
      'Glute bridges easy · Wall sit hard 45 s · Cardio right 12 min'
    );
  });

  test('a slug the plan no longer has stays as saved; nothing saved is an empty string', () => {
    expect(moveFeelSummary('oldmove=right', nameFor)).toBe('oldmove right');
    expect(moveFeelSummary(null, nameFor)).toBe('');
    expect(moveFeelSummary('', nameFor)).toBe('');
  });
});
