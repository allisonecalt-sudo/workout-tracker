#!/usr/bin/env node
// scripts/check-titles.mjs - code-shape step 0 (Oct 13 2026).
// Test-title ratchet. Builds the sorted list of `describe › … › title`
// strings from `playwright test --list` (file paths and line:col stripped, so
// moving tests between files changes nothing), compares with tests/titles.txt.
//   check   (default): fails if any baseline title is missing; additions are
//                      reported and fail too until `--update` (so the baseline
//                      always reflects the suite).
//   --update          : rewrites the baseline (the only way to add titles). It refuses
//                      if a baseline title would disappear, unless tests/titles-renamed.txt
//                      has a reviewed `old => new` line for it (v62.1).
// A rename is allowed only if the old title is gone AND the new one exists (see
// scripts/titles-compare.cjs); a deletion is never allowed.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { compareTitles, parseRenames } = createRequire(import.meta.url)('./titles-compare.cjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'tests', 'titles.txt');
const renamesPath = join(root, 'tests', 'titles-renamed.txt');
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');

const r = spawnSync(process.execPath, [cli, 'test', '--list'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (r.status !== 0) {
  console.error(r.stdout, r.stderr);
  process.exit(1);
}
// Lines look like: "  [chromium] › app.spec.ts:12:5 › describe › title"
const titles = r.stdout
  .split(/\r?\n/)
  .filter((l) => /^\s*\[[^\]]+\] › /.test(l))
  .map((l) => l.replace(/^\s*\[[^\]]+\] › [^›]*?:\d+:\d+ › /, '').trim())
  .sort();
if (titles.length === 0) {
  console.error('titles:check found no tests in --list output');
  process.exit(1);
}

if (process.argv.includes('--update')) {
  // Updating accepts ADDITIONS only. A baseline title that is gone must be covered
  // by a reviewed rename (tests/titles-renamed.txt), or the update refuses.
  if (existsSync(baselinePath)) {
    const oldBase = readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter(Boolean);
    const rn = existsSync(renamesPath) ? parseRenames(readFileSync(renamesPath, 'utf8')) : [];
    const gone = compareTitles(titles, oldBase, rn).missing;
    if (gone.length) {
      console.error(
        `titles:update REFUSED - ${gone.length} baseline title(s) would disappear (add an old => new line to tests/titles-renamed.txt if it is a rename):`
      );
      for (const t of gone) console.error(`  - ${t}`);
      process.exit(1);
    }
  }
  writeFileSync(baselinePath, titles.join('\n') + '\n');
  console.log(`titles baseline written: ${titles.length} titles`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error('tests/titles.txt missing - run `npm run titles:update`');
  process.exit(1);
}
const base = readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter(Boolean);
const renames = existsSync(renamesPath) ? parseRenames(readFileSync(renamesPath, 'utf8')) : [];
const { missing, added, applied } = compareTitles(titles, base, renames);
for (const r of applied) console.log(`titles:check - rename accepted: "${r.from}" => "${r.to}"`);
if (missing.length) {
  console.error(`titles:check FAILED - ${missing.length} baseline title(s) missing:`);
  for (const t of missing) console.error(`  - ${t}`);
}
if (added.length) {
  console.error(
    `titles:check - ${added.length} title(s) not in the baseline (run titles:update to accept):`
  );
  for (const t of added) console.error(`  + ${t}`);
}
if (missing.length || added.length) process.exit(1);
console.log(`titles:check OK - ${titles.length} titles match the baseline`);
