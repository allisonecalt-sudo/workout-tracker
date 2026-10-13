// tests/replay.test.ts — the week-clock replay golden (code-shape step 5a,
// Oct 13 2026). Pure Node, no browser.
//
// WHAT: replays a SYNTHETIC set of sessions through the current week clock for
// every day 2026-09-26 .. 2026-12-12 at 09:00 / 21:00 / 23:59 Asia/Jerusalem
// (tests/replay-core.ts) and requires the answers to equal
// tests/fixtures/replay-expected.json, generated from the code as it stood
// BEFORE step 5's week.ts reshape. The fixture mirrors her real shape and holds
// no real data: Round 2 from Aug 29, 3-4 sessions a week incl. D, the Oct 1
// B-labelled hike, the Oct 3-9 Sick week with a session on its first edge, one
// inside it and one on its end edge, a Move on, sessions around the DST change
// on Oct 25, a second Move on, a future-dated session, and a hypothetical
// Round 3 (step 5f widened it).
// WHY: week.ts / program-week.ts are being reshaped with "same inputs, same
// outputs" as the whole contract. This is the CI half of that proof; the other
// half is scripts/replay-week-clock.mjs on her real rows (local only).
//
// If a diff here is on purpose (a real behaviour change), regenerate with
//   node scripts/replay-week-clock.mjs --fixture tests/fixtures/replay-shape.json \
//        --today 2026-10-13 --out tests/fixtures/replay-expected.json
// and say why in the commit. A refactor never regenerates it.

import { test, expect } from '@playwright/test';
import {
  addDays,
  compareReplays,
  computeReplay,
  REPLAY_FROM,
  type ReplayInput,
} from './replay-core';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const FIXTURES = path.join(__dirname, 'fixtures');
const TODAY = '2026-10-13'; // frozen: the golden never moves with the calendar
const input = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'replay-shape.json'), 'utf8')
) as ReplayInput;
const expected = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'replay-expected.json'), 'utf8')
) as ReturnType<typeof computeReplay>;

test.describe('week-clock replay — synthetic golden (step 5a)', () => {
  const actual = computeReplay(input, REPLAY_FROM, addDays(TODAY, 60));

  test('the grid is the full window: 78 days x 3 times', () => {
    expect(actual.meta.snapshots).toBe(78 * 3);
    expect(expected.snapshots.length).toBe(78 * 3);
  });

  test('every instant and field equals the golden', () => {
    const r = compareReplays(expected, actual);
    expect(r.diffs.slice(0, 20)).toEqual([]);
    expect(r.fields).toBeGreaterThan(5000);
  });

  test('the comparison itself notices a change (one field flipped)', () => {
    const tampered = JSON.parse(JSON.stringify(actual)) as typeof actual;
    (tampered.snapshots[100]!['week'] as Record<string, unknown>)['shown'] = 'R9W9';
    expect(compareReplays(expected, tampered).diffs.length).toBe(1);
  });

  test('the fixture covers the shapes it claims to', () => {
    const at = (t: string): Record<string, any> =>
      // eslint-disable-line @typescript-eslint/no-explicit-any
      actual.snapshots.find((s) => s['t'] === t) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Oct 3-9 Sick: Week 5 closed 'sick', Week 6 pending until Oct 10
    expect(at('2026-10-05T21:00')['week'].spans.at(-1).how).toBe('sick');
    expect(at('2026-10-05T21:00')['week'].pending.key).toBe('R2W6');
    // Week 6 open from Oct 10, and Moved on on Oct 24
    expect(at('2026-10-12T09:00')['week'].open.key).toBe('R2W6');
    expect(at('2026-10-24T21:00')['week'].spans.at(-1).how).toBe('moved_on');
    // the Oct 1 B-labelled hike is a repeated letter in Week 5
    expect(at('2026-10-02T09:00')['week'].open.done).toBe('AB');
  });

  test('the widened fixture (step 5f) also covers the edges and the rare shapes it claims', () => {
    const at = (t: string): Record<string, any> =>
      // eslint-disable-line @typescript-eslint/no-explicit-any
      actual.snapshots.find((s) => s['t'] === t) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    // a C exactly on the first sick edge (Oct 3 00:00) and one INSIDE the sick
    // week (Oct 5) both count back to Week 5, which closed 'sick' with A B C
    expect(at('2026-10-05T21:00')['week'].spans.at(-1).how).toBe('sick');
    expect(at('2026-10-05T21:00')['week'].spans.at(-1).done).toBe('ABC');
    expect(at('2026-10-05T21:00')['week'].spans.at(-1).sessions).toEqual(
      expect.arrayContaining(['s25', 's26'])
    );
    // an A exactly on the end edge (Oct 10 00:00) opens Week 6 right there
    expect(at('2026-10-10T09:00')['week'].open.key).toBe('R2W6');
    expect(at('2026-10-10T09:00')['week'].open.openedAt).toBe('2026-10-10T00:00:00+03:00');
    expect(at('2026-10-10T09:00')['week'].open.done).toBe('A');
    // sessions on Oct 24 / 25 (01:30, the clocks-back night) / 26 around the DST change
    expect(at('2026-10-25T09:00')['week'].open.done).toBe('BC');
    expect(at('2026-10-26T21:00')['week'].spans.at(-1).key).toBe('R2W7');
    expect(at('2026-10-26T21:00')['week'].spans.at(-1).how).toBe('three');
    // a SECOND Move on (Week 9, Nov 21) opens Week 10
    expect(at('2026-11-22T09:00')['week'].spans.at(-1).key).toBe('R2W9');
    expect(at('2026-11-22T09:00')['week'].spans.at(-1).how).toBe('moved_on');
    expect(at('2026-11-22T09:00')['week'].open.key).toBe('R2W10');
    // a future-dated session (dated Nov 11, logged Nov 9) is IN the week model
    // from the moment it exists - the app never filters rows by date
    expect(at('2026-11-09T21:00')['week'].open.sessions).toContain('s33');
    // a hypothetical Round 3 (starts Nov 28) closes Week 10 'round_ended' and
    // opens R3W1; it can be moved on once it has been open 8+ days with 1 done
    expect(at('2026-11-27T21:00')['week'].shown).toBe('R2W10');
    expect(at('2026-11-28T21:00')['week'].shown).toBe('R3W1');
    expect(at('2026-11-28T21:00')['week'].spans.at(-1).how).toBe('round_ended');
    expect(at('2026-12-07T21:00')['week'].canMoveOn).toBe(true);
    expect(at('2026-12-02T09:00')['week'].canMoveOn).toBe(false);
  });
});

// Step 5f (Oct 13 2026): the real-data replay writes her actual session ids and
// dates, so it must refuse to put them inside ANY git checkout - not only this
// repo. The refusal happens before any network read, so this needs no secrets.
test.describe('week-clock replay — the real-data tool refuses git checkouts (step 5f)', () => {
  const { spawnSync } = require('child_process') as typeof import('child_process');
  const os = require('os') as typeof import('os');
  const script = path.join(__dirname, '..', 'scripts', 'replay-week-clock.mjs');

  function runOut(out: string): { status: number | null; stderr: string } {
    const r = spawnSync(process.execPath, [script, '--out', out], { encoding: 'utf8' });
    return { status: r.status, stderr: r.stderr };
  }

  test('--out inside this repo (a .git directory above it) is refused, nothing written', () => {
    const out = path.join(__dirname, '..', 'nested-does-not-exist', 'real.json');
    const r = runOut(out);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('refusing to write her real data inside a git checkout');
    expect(fs.existsSync(out)).toBe(false);
  });

  test('--out inside ANOTHER checkout (a .git FILE, as in a worktree) is refused too', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-replay-refuse-'));
    try {
      fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /somewhere/else\n');
      const out = path.join(dir, 'a', 'b', 'real.json');
      const r = runOut(out);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(dir);
      expect(fs.existsSync(out)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
