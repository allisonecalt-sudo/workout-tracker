#!/usr/bin/env node
// scripts/check-titles.mjs - code-shape step 0 (Oct 13 2026).
// Test-title ratchet. Builds the sorted list of `describe › … › title`
// strings from `playwright test --list` (file paths and line:col stripped, so
// moving tests between files changes nothing), compares with tests/titles.txt.
//   check   (default): fails if any baseline title is missing; additions are
//                      reported and fail too until `--update` (so the baseline
//                      always reflects the suite).
//   --update          : rewrites the baseline (the only way to add titles).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'tests', 'titles.txt');
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
  writeFileSync(baselinePath, titles.join('\n') + '\n');
  console.log(`titles baseline written: ${titles.length} titles`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error('tests/titles.txt missing - run `npm run titles:update`');
  process.exit(1);
}
const base = readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter(Boolean);
const count = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
const have = count(titles);
const want = count(base);
const missing = [];
const added = [];
for (const [t, n] of want) if ((have.get(t) ?? 0) < n) missing.push(t);
for (const [t, n] of have) if ((want.get(t) ?? 0) < n) added.push(t);
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
