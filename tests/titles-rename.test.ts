// tests/titles-rename.test.ts - the reviewed-rename rule of the title ratchet
// (v62.1, Oct 14 2026). Pure Node, no browser.
//
// WHAT: scripts/titles-compare.cjs decides what `npm run titles:check` fails on.
// A test title may never disappear; the one exception is a rename written down in
// tests/titles-renamed.txt (`old title => new title`). It counts only if the old
// title is GONE from the suite AND the new one is a real addition. These tests pin
// that rule with made-up titles, and pin the committed file's own shape.

import { test, expect } from '@playwright/test';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { compareTitles, parseRenames } = require('../scripts/titles-compare.cjs') as {
  compareTitles: (
    current: string[],
    baseline: string[],
    renames?: { from: string; to: string }[]
  ) => { missing: string[]; added: string[]; applied: { from: string; to: string }[] };
  parseRenames: (text: string) => { from: string; to: string }[];
};

test.describe('title ratchet - reviewed renames (v62.1)', () => {
  test('a disappearance with no rename still fails; a pure addition still needs an update', () => {
    const r = compareTitles(['a', 'c'], ['a', 'b']);
    expect(r.missing).toEqual(['b']);
    expect(r.added).toEqual(['c']);
  });

  test('a rename is allowed when the old title is gone AND the new one exists', () => {
    const r = compareTitles(['a', 'b2'], ['a', 'b'], [{ from: 'b', to: 'b2' }]);
    expect(r.missing).toEqual([]);
    expect(r.added).toEqual([]);
    expect(r.applied).toHaveLength(1);
  });

  test('NOT allowed when the old title is still in the suite (that would hide a duplicate)', () => {
    const r = compareTitles(['a', 'b', 'b2'], ['a', 'b'], [{ from: 'b', to: 'b2' }]);
    expect(r.missing).toEqual([]); // b is still there
    expect(r.added).toEqual(['b2']); // so b2 is just an addition, still needs an update
    expect(r.applied).toEqual([]);
  });

  test('NOT allowed when the new title does not exist: the old one is still missing', () => {
    const r = compareTitles(['a'], ['a', 'b'], [{ from: 'b', to: 'ghost' }]);
    expect(r.missing).toEqual(['b']);
    expect(r.applied).toEqual([]);
  });

  test('NOT allowed onto a title the baseline already has (a deletion dressed as a rename)', () => {
    const r = compareTitles(['a'], ['a', 'b'], [{ from: 'b', to: 'a' }]);
    expect(r.missing).toEqual(['b']);
    expect(r.applied).toEqual([]);
  });

  test('one rename line never excuses two missing titles', () => {
    const r = compareTitles(['x'], ['b', 'b'], [{ from: 'b', to: 'x' }]);
    expect(r.missing).toEqual(['b']);
    expect(r.added).toEqual([]);
  });

  test('parseRenames reads "old => new" lines, ignores blanks and malformed lines', () => {
    expect(parseRenames('a => b\n\nno arrow here\n c d => e f \r\n')).toEqual([
      { from: 'a', to: 'b' },
      { from: 'c d', to: 'e f' },
    ]);
  });

  test('the committed tests/titles-renamed.txt parses cleanly, every line is old => new', () => {
    const text = fs.readFileSync(path.join(__dirname, 'titles-renamed.txt'), 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    expect(parseRenames(text)).toHaveLength(lines.length);
  });
});
