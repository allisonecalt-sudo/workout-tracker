#!/usr/bin/env node
// scripts/verify-commits.mjs - code-shape step 7-0 (Oct 14 2026).
// WHY: husky's pre-commit gate runs on the WORKING TREE, not on what a commit
// contains, so a commit can pass on the builder's machine and still be broken on
// its own (two v62.1 intermediate commits failed their own gate that way). This
// checks every commit in a range IN ISOLATION: a temp worktree (outside the repo)
// checked out at that commit, then the pre-commit gate's five steps.
//
//   node scripts/verify-commits.mjs [range]      (default: origin/main..HEAD)
//   npm run verify:commits
//
// node_modules: when package-lock.json at the commit is byte-identical to this
// checkout's, node_modules is shared (a junction); otherwise `npm ci` runs in the
// worktree. Exit 0 only if every commit passes every step. A failing intermediate
// commit is fixed by re-splitting the commits, never by --no-verify.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const range = process.argv[2] ?? 'origin/main..HEAD';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** The pre-commit gate (.husky/pre-commit), one step at a time. */
const STEPS = [
  ['format:check', ['run', 'format:check']],
  ['lint', ['run', 'lint']],
  ['build', ['run', 'build']],
  ['test:fast', ['run', 'test:fast']],
  ['titles:check', ['run', 'titles:check']],
];

function git(args, cwd = root) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function run(cmd, args, cwd) {
  // .cmd files need a shell on Windows; args here are fixed strings, no user input.
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32',
    env: { ...process.env, PW_PORT: '', CI: '' },
  });
}

function removeLink(p) {
  if (!existsSync(p)) return;
  try {
    unlinkSync(p);
  } catch {
    try {
      rmdirSync(p); // a Windows junction is removed like an empty directory
    } catch {
      /* leave it; the worktree removal below reports it */
    }
  }
}

const commits = git(['rev-list', '--reverse', range]).split('\n').filter(Boolean);
if (commits.length === 0) {
  console.log(`[verify-commits] no commits in ${range}`);
  process.exit(0);
}

// EOL-normalised: a Windows checkout may hold the lock file as CRLF while git has LF.
const eol = (t) => t.replace(/\r\n/g, '\n');
const myLock = eol(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const base = mkdtempSync(join(tmpdir(), 'wt-verify-'));
const results = [];

try {
  for (const sha of commits) {
    const short = sha.slice(0, 7);
    const subject = git(['log', '-1', '--format=%s', sha]).trim();
    const wt = join(base, short);
    const started = Date.now();
    console.log(`\n[verify-commits] ${short} ${subject}`);
    let failed = null;
    let linked = false;
    try {
      git(['worktree', 'add', '--detach', wt, sha]);
      const lock = eol(readFileSync(join(wt, 'package-lock.json'), 'utf8'));
      if (lock === myLock) {
        symlinkSync(join(root, 'node_modules'), join(wt, 'node_modules'), 'junction');
        linked = true;
      } else {
        console.log('  package-lock.json differs from this checkout: npm ci');
        const ci = run(npm, ['ci'], wt);
        if (ci.status !== 0) failed = `npm ci\n${ci.stdout}\n${ci.stderr}`;
      }
      if (!failed) {
        for (const [name, args] of STEPS) {
          const r = run(npm, args, wt);
          const ok = r.status === 0;
          console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}`);
          if (!ok) {
            failed = `${name}\n${(r.stdout || '').slice(-3000)}\n${(r.stderr || '').slice(-1500)}`;
            break; // the first red step is the answer; later steps would only echo it
          }
        }
      }
    } catch (e) {
      failed = String(e);
    } finally {
      if (linked) removeLink(join(wt, 'node_modules'));
      try {
        git(['worktree', 'remove', '--force', wt]);
      } catch {
        rmSync(wt, { recursive: true, force: true });
        try {
          git(['worktree', 'prune']);
        } catch {
          /* best effort */
        }
      }
    }
    const secs = Math.round((Date.now() - started) / 1000);
    results.push({ short, subject, failed, secs });
    if (failed) console.log(`  --- output of the failing step ---\n${failed}`);
  }
} finally {
  rmSync(base, { recursive: true, force: true });
}

console.log('\n[verify-commits] summary');
for (const r of results) {
  console.log(`  ${r.failed ? 'FAIL' : 'pass'}  ${r.short}  ${r.subject}  (${r.secs}s)`);
}
const bad = results.filter((r) => r.failed).length;
console.log(
  bad === 0
    ? `[verify-commits] all ${results.length} commit(s) green on their own`
    : `[verify-commits] ${bad} of ${results.length} commit(s) FAILED - re-split, never --no-verify`
);
process.exit(bad === 0 ? 0 : 1);
