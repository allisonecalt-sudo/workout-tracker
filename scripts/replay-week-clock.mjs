#!/usr/bin/env node
// scripts/replay-week-clock.mjs — code-shape step 5a (Oct 13 2026). LOCAL tool,
// NOT in CI (it reads her real rows; CI has no secrets and must never).
//
// WHAT: replays the week clock over her real sessions. For every day from the
// completion launch (2026-09-26) to today+60, at 09:00 / 21:00 / 23:59
// Asia/Jerusalem, it asks the CURRENT code (program-week.ts / week.ts) the same
// questions the app asks and writes one JSON. Run it before and after a week-
// clock refactor, then `--compare` the two: any difference is a behaviour change.
// The shared computation is tests/replay-core.ts (also used by the CI test
// tests/replay.test.ts on a synthetic, data-free fixture); this script bundles
// it with esbuild into a temp file so plain Node can run it.
//
// READ-ONLY: only GET requests, ever (the fetch helper below refuses anything
// else). Reads workout_sessions, week_moves and cycle_periods (cycle count is
// recorded for context; the week clock does not use it) from the budget-2026
// Supabase project with the key in ~/.supabase-budget-key. The key is never
// printed or written. The output holds her real session ids/dates: it is
// refused inside ANY git checkout (a `.git` dir or file in any parent of the
// --out path) — write it to a scratch folder.
//
// Usage:
//   node scripts/replay-week-clock.mjs --out <file.json> [--today YYYY-MM-DD]
//   node scripts/replay-week-clock.mjs --fixture tests/fixtures/replay-shape.json \
//        --today 2026-10-13 --out tests/fixtures/replay-expected.json   (synthetic golden)
//   node scripts/replay-week-clock.mjs --compare <before.json> <after.json>

process.env.TZ = 'Asia/Jerusalem';

import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const FROM = '2026-09-26';
const AHEAD_DAYS = 60;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function loadCore() {
  const dir = mkdtempSync(join(tmpdir(), 'wt-replay-'));
  const outfile = join(dir, 'replay-core.mjs');
  await build({
    entryPoints: [join(root, 'tests', 'replay-core.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  try {
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** GET only. */
async function get(path) {
  const key = readFileSync(join(homedir(), '.supabase-budget-key'), 'utf8').trim();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} -> HTTP ${res.status}`);
  const rows = await res.json();
  if (rows.length >= 1000) throw new Error(`GET ${path.split('?')[0]}: 1000+ rows, paginate first`);
  return rows;
}

/** The nearest ancestor folder of `target` that is a git checkout (has a `.git`
 * directory OR file - a worktree/submodule has a file), or null. Walks up from
 * the target path itself, whether or not it exists yet. */
function gitCheckoutAbove(target) {
  let dir = dirname(resolve(target));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function todayJerusalem() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const core = await loadCore();

if (process.argv.includes('--compare')) {
  const i = process.argv.indexOf('--compare');
  const a = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
  const b = JSON.parse(readFileSync(process.argv[i + 2], 'utf8'));
  const r = core.compareReplays(a, b);
  console.log(`compared ${r.snapshots} instants, ${r.fields} fields, ${r.diffs.length} diffs`);
  for (const d of r.diffs.slice(0, 40)) console.log('  DIFF ' + d);
  if (r.diffs.length > 40) console.log(`  ... and ${r.diffs.length - 40} more`);
  process.exit(r.diffs.length === 0 ? 0 : 1);
}

const out = arg('--out');
if (!out) {
  console.error('usage: --out <file.json> [--today YYYY-MM-DD] [--fixture <file>] | --compare a b');
  process.exit(2);
}
const fixture = arg('--fixture');
const today = arg('--today') ?? todayJerusalem();
const to = core.addDays(today, AHEAD_DAYS);

let input;
let source;
if (fixture) {
  input = JSON.parse(readFileSync(resolve(fixture), 'utf8'));
  source = { kind: 'fixture', sessions: input.sessions.length, moves: input.moves.length };
} else {
  // Her real session ids/dates must never land in ANY git checkout (this repo,
  // second-brain, a worktree...), not only this one.
  const repo = gitCheckoutAbove(out);
  if (repo) {
    console.error(
      `refusing to write her real data inside a git checkout (${repo}); pick a scratch path outside any repo`
    );
    process.exit(2);
  }
  const sessions = await get('workout_sessions?select=id,date,workout_type&order=date.asc&limit=1000');
  const moves = await get('week_moves?select=round,week,moved_at&order=moved_at.asc&limit=1000');
  const cycles = await get('cycle_periods?select=start_date&limit=1000');
  input = {
    sessions: sessions.map((s) => ({ id: s.id, date: s.date, workout: s.workout_type })),
    moves: moves.map((m) => ({ round: m.round, week: m.week, at: m.moved_at })),
  };
  source = {
    kind: 'supabase (GET only)',
    sessions: sessions.length,
    moves: moves.length,
    cyclePeriods: cycles.length,
  };
}

const result = core.computeReplay(input, FROM, to);
result.meta.today = today;
result.meta.source = source;
writeFileSync(out, core.replayToJson(result));
console.log(
  `wrote ${out}: ${result.meta.snapshots} instants (${FROM}..${to} x ${result.meta.times.join(', ')}), ` +
    `source ${JSON.stringify(source)}`
);
