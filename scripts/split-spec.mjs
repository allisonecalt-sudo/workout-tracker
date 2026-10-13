#!/usr/bin/env node
// scripts/split-spec.mjs - code-shape step 1 (Oct 13 2026).
//
// What this is: the one-off, deterministic splitter that turned the 11k-line
// tests/app.spec.ts into tests/screens/<topic>.spec.ts + tests/helpers.ts.
// Kept in the repo so the split is auditable: it reads the PRE-SPLIT file from
// git (default rev c033a49, the last commit that still had tests/app.spec.ts),
// so re-running it reproduces the committed files byte for byte.
//
//   node scripts/split-spec.mjs            write tests/helpers.ts + tests/screens/*
//   node scripts/split-spec.mjs --check    write nothing; exit 1 if disk differs
//   node scripts/split-spec.mjs --rev <r>  read the source from another rev
//
// How: the source is cut into top-level STATEMENTS (a column-0 line up to its
// column-0 closer). Every statement keeps the comment lines above it. Test
// statements (test(...) / test.describe(...)) are assigned to a file by the
// ANCHORS below (a header comment or describe title that starts a new topic);
// helpers (const/let/function) go to tests/helpers.ts, exported; the top-level
// beforeEach becomes setupPage(page, context). A section-header comment that
// sat above a helper travels with the next test, not into helpers.ts. Nothing
// inside a statement is ever edited - test bodies are copied line for line.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const revIdx = args.indexOf('--rev');
const rev = revIdx >= 0 ? args[revIdx + 1] : 'c033a49';

// file name -> a string that appears in the FIRST unit of that file (its header
// comment, else its first line). Order = the original top-to-bottom order.
const FILES = [
  ['workout-flow', null],
  ['left-open-and-sync', '// ---------- Left-open workout gate'],
  ['r2-weeks-and-swing', '// --- Round 2 Week 3: the band goes on the clamshells'],
  ['redesign-ships', '// --- Redesign Ship 1'],
  ['program-weeks', '// --- Multi-week PROGRAM (2026-05-15)'],
  ['cardio-lanes', '// --- Cardio either/or (Sep 7 2026)'],
  ['timer-pip-and-data', '// --- v53: timer as a pip + Back while it runs'],
  ['workout-step-shell', '// --- v48 P2 · the workout step shell'],
  ['cardio-and-rides', '// --- v48 P3 · cardio'],
  ['home', '// --- v48 P4 · home'],
  ['logs', '// --- v48 P5 · logs'],
  ['mirror-and-cooldown', '// --- v48 P6 · the mirror stops misreporting her'],
  ['sweep-and-wall-lean', "test.describe('v48 P8 sweep'"],
  ['edit-past-session', "test.describe('v53 · edit a past session (A5)'"],
  ['week-moves', 'test.describe(\'WK3 · "Move on without it" + week_moves\''],
  ['review-progress-howto', "test.describe('WK4 (Sep 27 2026)"],
  ['timing', "test.describe('T1 · Timing"],
];

const src = execFileSync('git', ['show', `${rev}:tests/app.spec.ts`], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
}).replace(/\r\n/g, '\n');
const lines = src.split('\n');
if (lines[lines.length - 1] === '') lines.pop();

// ---- 1. cut into top-level statements -------------------------------------
const stmts = [];
let prevEnd = -1;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!/^[A-Za-z_]/.test(l)) continue; // blank, comment, indented, closer
  let end = i;
  if (!/;\s*$/.test(l)) {
    end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\}\)?;?$/.test(lines[j])) {
        end = j;
        break;
      }
    }
    if (end < 0) throw new Error(`no closer for statement at line ${i + 1}`);
  }
  for (let j = i + 1; j <= end; j++) {
    if (/^(test[.(]|const |let |function |async function |import )/.test(lines[j]))
      throw new Error(`statement at line ${i + 1} swallows a statement start at ${j + 1}`);
  }
  const first = l;
  let kind;
  if (/^import\b/.test(first)) kind = 'import';
  else if (/^test\.beforeEach\(/.test(first)) kind = 'beforeEach';
  else if (/^test(\.describe)?\(/.test(first)) kind = 'test';
  else if (/^(const|let|function|async function)\s/.test(first)) kind = 'helper';
  else throw new Error(`unknown statement kind at line ${i + 1}: ${first}`);
  const prefix = lines.slice(prevEnd + 1, i);
  stmts.push({ kind, start: i + 1, prefix, body: lines.slice(i, end + 1) });
  prevEnd = end;
  i = end;
}
const tail = lines.slice(prevEnd + 1);
if (tail.some((t) => t.trim() !== '')) throw new Error('non-blank tail after last statement');

const trimBlank = (arr) => {
  let a = 0;
  let b = arr.length;
  while (a < b && arr[a].trim() === '') a++;
  while (b > a && arr[b - 1].trim() === '') b--;
  return arr.slice(a, b);
};

// ---- 2. classify: imports, beforeEach, helpers, tests ----------------------
const helpers = [];
const tests = [];
let setup = null;
let carry = []; // section-header comment lines waiting for the next test
for (const s of stmts) {
  if (s.kind === 'import') continue;
  let prefix = s.prefix;
  if (s.kind === 'helper') {
    const h = prefix.findIndex((p) => /^\/\/ (-{3,}|={3,})/.test(p));
    if (h >= 0) {
      let e = h;
      while (e + 1 < prefix.length && prefix[e + 1].startsWith('//')) e++;
      carry = carry.concat(prefix.slice(h, e + 1), ['']);
      prefix = [...prefix.slice(0, h), ...prefix.slice(e + 1)];
    }
  }
  if (s.kind === 'beforeEach') {
    setup = { ...s, prefix: trimBlank(prefix) };
  } else if (s.kind === 'helper') {
    helpers.push({ ...s, prefix: trimBlank(prefix) });
  } else {
    const text = [...trimBlank(carry), ...(carry.length ? [''] : []), ...trimBlank(prefix)];
    carry = [];
    tests.push({ ...s, text: [...trimBlank(text), ...s.body] });
  }
}
if (!setup) throw new Error('no top-level beforeEach found');
if (trimBlank(carry).length) throw new Error('section header left over at the end');

// ---- 3. assign tests to files ----------------------------------------------
const perFile = FILES.map(([name]) => ({ name, units: [] }));
let fi = 0;
for (const t of tests) {
  while (fi + 1 < FILES.length) {
    const anchor = FILES[fi + 1][1];
    if (t.text.join('\n').includes(anchor)) fi++;
    else break;
  }
  perFile[fi].units.push(t);
}
for (let k = 0; k < FILES.length; k++) {
  if (perFile[k].units.length === 0) throw new Error(`anchor never matched for ${FILES[k][0]}`);
}

// ---- 4. helpers.ts -----------------------------------------------------------
const stripComments = (arr) => arr.filter((l) => !/^\s*\/\//.test(l)).join('\n');
const helperNames = [];
const helperBlocks = [];
for (const h of helpers) {
  const m =
    /^(?:const|let)\s+(\w+)/.exec(h.body[0]) ?? /^(?:async\s+)?function\s+(\w+)/.exec(h.body[0]);
  if (!m) throw new Error(`cannot name helper at line ${h.start}`);
  helperNames.push(m[1]);
  const body = [...h.body];
  body[0] = `export ${body[0]}`;
  helperBlocks.push([...h.prefix, ...body].join('\n'));
}
const setupBody = [...setup.body];
setupBody[0] =
  'export async function setupPage(page: Page, context: BrowserContext): Promise<void> {';
if (setupBody[setupBody.length - 1] !== '});') throw new Error('unexpected beforeEach closer');
setupBody[setupBody.length - 1] = '}';
const setupBlock = [
  '// The old top-level test.beforeEach of tests/app.spec.ts, as a plain function.',
  '// Every tests/screens/*.spec.ts registers it as its first hook:',
  '//   test.beforeEach(async ({ page, context }) => setupPage(page, context));',
  '// helpers.ts itself registers NO test hook, so golden.spec.ts can import from it',
  '// without inheriting the sick-week switch or the goto.',
  ...setup.prefix,
  ...setupBody,
].join('\n');
const helperCode = helperBlocks.join('\n');
if (/^[^/\n]*\btest[.(]/m.test(stripComments(helperCode.split('\n'))))
  throw new Error('a helper uses `test` - helpers.ts would need it');
const hImports = ['type BrowserContext'];
if (/\bexpect\b/.test(stripComments((setupBlock + '\n' + helperCode).split('\n'))))
  hImports.unshift('expect');
if (/(?<![.\w])Page\b/.test(stripComments((setupBlock + '\n' + helperCode).split('\n'))))
  hImports.push('type Page');
const helpersTs = [
  '// Shared helpers for tests/screens/*.spec.ts and tests/golden.spec.ts.',
  '// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1,',
  '// Oct 13 2026): every top-level const/function of the old file, exported, plus',
  '// setupPage (the old top-level beforeEach). Registers no test.* hook.',
  `import { ${hImports.join(', ')} } from '@playwright/test';`,
  '',
  '// The old specs resolved repo files with __dirname + ".." (tests/ -> repo root).',
  '// Specs now live one folder deeper, so they import this under that name.',
  'export const TESTS_DIR = __dirname;',
  '',
  setupBlock,
  '',
  helperBlocks.join('\n\n'),
  '',
].join('\n');

// ---- 5. spec files -----------------------------------------------------------
const files = new Map([['tests/helpers.ts', helpersTs]]);
for (const f of perFile) {
  const body = f.units.map((u) => u.text.join('\n')).join('\n\n');
  const code = stripComments(body.split('\n'));
  const used = helperNames.filter((n) => new RegExp(`(?<![.\\w])${n}\\b`).test(code));
  if (/(?<![.\w])__dirname\b/.test(code)) used.push('TESTS_DIR as __dirname');
  const pw = ['test'];
  if (/\bexpect\b/.test(code)) pw.push('expect');
  if (/(?<![.\w])Page\b/.test(code)) pw.push('type Page');
  const out = [
    '// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);',
    '// the test bodies below are copied line for line.',
    `import { ${pw.join(', ')} } from '@playwright/test';`,
    `import { ${['setupPage', ...used].join(', ')} } from '../helpers';`,
    '',
    'test.beforeEach(async ({ page, context }) => setupPage(page, context));',
    '',
    body,
    '',
  ].join('\n');
  files.set(`tests/screens/${f.name}.spec.ts`, out);
}

// ---- 6. prettier-format, then write / compare -----------------------------------
const prettier = await import('prettier');
let bad = 0;
for (const [rel, text] of files) {
  const abs = join(root, rel);
  const cfg = (await prettier.resolveConfig(abs)) ?? {};
  const formatted = await prettier.format(text, { ...cfg, filepath: abs, parser: 'typescript' });
  if (check) {
    const disk = existsSync(abs) ? readFileSync(abs, 'utf8').replace(/\r\n/g, '\n') : null;
    if (disk !== formatted) {
      bad++;
      console.error(`DIFFERS: ${rel}`);
    }
  } else {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, formatted);
  }
}
if (!check) {
  console.log(`rev ${rev}: ${stmts.length} statements -> ${files.size} files`);
  for (const f of perFile)
    console.log(
      `  ${f.name}.spec.ts  from source line ${f.units[0].start}  (${f.units.length} top-level units)`
    );
  console.log(`  helpers.ts  ${helpers.length} helpers + setupPage`);
}
if (check) {
  console.log(bad ? `split-spec --check: ${bad} file(s) differ` : 'split-spec --check: identical');
  process.exit(bad ? 1 : 0);
}
