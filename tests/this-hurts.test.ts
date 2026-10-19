// tests/this-hurts.test.ts - v63 item 3 (Oct 19 2026), the pure half: `hurt` in the move_feel string and in
// the DB CHECK that guards the column.
import { test, expect } from '@playwright/test';
import {
  feelMoveFor,
  isMoveFeelMark,
  isMoveFeelValue,
  isValidMoveFeelString,
  moveFeelString,
  moveFeelSummary,
  parseMoveFeelString,
  withOverrideFeel,
  type SteppedMove,
} from '../move-feel';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const LIST: SteppedMove[] = [
  feelMoveFor({ name: 'Glute bridges', reps: '12 reps' }),
  feelMoveFor({ name: 'Wall sit', isTimed: true, durationSec: 45 }),
  feelMoveFor({ name: 'Outdoor walk', reps: '12 min' }),
];

test.describe('hurt in the move_feel string', () => {
  test('hurt is a mark, not one of the three feels she can tap on the row', () => {
    expect(isMoveFeelMark('hurt')).toBe(true);
    expect(isMoveFeelValue('hurt')).toBe(false);
    for (const v of ['easy', 'right', 'hard']) expect(isMoveFeelMark(v)).toBe(true);
    expect(isMoveFeelMark('meh')).toBe(false);
  });

  test('a hurt move is saved as slug=hurt with NO qty, even a hold and the ride slot', () => {
    expect(moveFeelString({ wallsit: 'hurt', ride: 'hurt', glutebridges: 'easy' }, LIST)).toBe(
      'wallsit=hurt;ride=hurt;glutebridges=easy'
    );
  });

  test('it round-trips through parse and passes the shape check', () => {
    const s = 'wallsit=hurt;glutebridges=easy;ride=right@12min';
    expect(isValidMoveFeelString(s)).toBe(true);
    expect(parseMoveFeelString(s)).toEqual([
      { slug: 'wallsit', feel: 'hurt', qtyRaw: null },
      { slug: 'glutebridges', feel: 'easy', qtyRaw: null },
      { slug: 'ride', feel: 'right', qtyRaw: '12min' },
    ]);
  });

  test('the ride override keeps a hurt segment it does not own', () => {
    expect(withOverrideFeel('wallsit=hurt', 'ride', 'right', 12, 'min')).toBe(
      'wallsit=hurt;ride=right@12min'
    );
    expect(withOverrideFeel('ride=hurt', 'ride', 'right', 12, 'min')).toBe('ride=right@12min');
  });

  test('the Session line says hurt in her words', () => {
    const names: Record<string, string> = { wallsit: 'Wall sit', glutebridges: 'Glute bridges' };
    expect(moveFeelSummary('wallsit=hurt;glutebridges=easy', (s) => names[s] ?? null)).toBe(
      'Wall sit hurt · Glute bridges easy'
    );
  });
});

// The migration is written but not applied by the builder: this proves the file's CHECK and the app's own
// shape check accept and reject exactly the same strings, so the two can never quietly drift apart.
test.describe('migrations/2026-10-19-v63-move-feel-hurt.sql', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '2026-10-19-v63-move-feel-hurt.sql'),
    'utf8'
  );
  const pattern = /move_feel ~ '([^']+)'/.exec(sql)?.[1];

  test('it widens the v58 CHECK by exactly one word, and drops the old constraint first', () => {
    expect(pattern).toBeDefined();
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS workout_sessions_move_feel_check/);
    expect(sql).toMatch(/ADD CONSTRAINT workout_sessions_move_feel_check CHECK/);
    const v58 = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '2026-09-28-v58-move-feel.sql'),
      'utf8'
    );
    const old = /move_feel ~ '([^']+)'/.exec(v58)?.[1] ?? '';
    expect(pattern).toBe(old.split('easy|right|hard').join('easy|right|hard|hurt'));
  });

  test('the SQL regex and isValidMoveFeelString agree on every string', () => {
    const re = new RegExp(pattern ?? '(?!)');
    const cases = [
      'splitsquat=right',
      'wallsit=easy@45s',
      'wallsit=hurt',
      'wallsit=hurt;glutebridges=easy;ride=right@12min',
      'curl=@2kg',
      'ride=hurt@12min',
      'wallsit=meh',
      'split1squat=right',
      'ride=right@12lb',
      'wallsit=easy@45s;',
      'hurt',
      '',
    ];
    for (const c of cases) expect(re.test(c), c).toBe(isValidMoveFeelString(c));
  });
});
