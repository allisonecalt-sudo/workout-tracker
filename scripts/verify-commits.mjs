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
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
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

/** True when p exists at all (a dangling link counts) - lstat never follows a link. */
function lexists(p) {
  try {
    lstatSync(p);
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    throw e;
  }
}

/** Step 8-0 (Oct 14 2026). A node_modules JUNCTION points at the real node_modules.
 *  `git worktree remove --force` and `rmSync(dir, {recursive})` have been seen to FOLLOW
 *  a junction on this machine and empty its target, so nothing here ever recurses into a
 *  path while a link may sit inside it. Remove the LINK itself (non-recursive), then
 *  PROVE it is gone with lstat. If it is not gone: throw LinkStuck, and the caller stops
 *  without deleting anything else. */
class LinkStuck extends Error {}
function removeLinkSafely(link) {
  if (!lexists(link)) return;
  if (!lstatSync(link).isSymbolicLink()) return; // a real directory (npm ci): not a link
  try {
    unlinkSync(link); // a symlink / file-style link
  } catch {
    try {
      rmdirSync(link); // a Windows junction is removed like an EMPTY directory: never its target
    } catch {
      /* checked below */
    }
  }
  if (lexists(link)) throw new LinkStuck(`could not remove the node_modules link: ${link}`);
}

/** Delete one temp worktree directory safely: link first (verified gone), then the dir,
 *  then `git worktree prune`. Never `git worktree remove`. */
function removeWorktreeSafely(wt) {
  removeLinkSafely(join(wt, 'node_modules'));
  rmSync(wt, { recursive: true, force: true });
  try {
    git(['worktree', 'prune']);
  } catch {
    /* best effort: a stale registration is harmless, a deleted target is not */
  }
}

/** On startup: sweep `wt-verify-*` dirs a killed run left behind (skip one whose owner
 *  pid is still alive: a parallel run). Same safe order; a stuck link stops everything. */
function sweepStale() {
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith('wt-verify-')) continue;
    const dir = join(tmpdir(), name);
    try {
      const pid = Number(readFileSync(join(dir, '.pid'), 'utf8'));
      if (pid > 0 && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          continue; // alive: leave it
        } catch {
          /* dead: stale */
        }
      }
    } catch {
      /* no pid file: stale */
    }
    console.log(`[verify-commits] sweeping stale ${dir}`);
    for (const sub of readdirSync(dir)) {
      if (sub.startsWith('.')) continue;
      removeLinkSafely(join(dir, sub, 'node_modules'));
    }
    rmSync(dir, { recursive: true, force: true });
  }
  unlockStaleEntries();
  try {
    git(['worktree', 'prune']);
  } catch {
    /* best effort */
  }
}

/** Step 9-0 (Oct 14 2026). `git worktree add` LOCKS its entry while it works; a kill during
 *  it leaves a locked entry whose directory is gone (or half-made), and `git worktree prune`
 *  skips locked entries, so it would linger for good. On startup: unlock THIS script's own
 *  entries (a `wt-verify-*` path in the temp dir) whose directory no longer exists, then the
 *  caller prunes. An entry whose directory still exists belongs to a live run or was swept
 *  above: untouched. `repo` is a test hook (default: this checkout). */
function unlockStaleEntries(repo = root) {
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  const prefix = norm(join(tmpdir(), 'wt-verify-'));
  for (const line of git(['worktree', 'list', '--porcelain'], repo).split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const path = line.slice('worktree '.length).trim();
    if (!norm(path).startsWith(prefix)) continue;
    if (existsSync(path)) continue;
    try {
      git(['worktree', 'unlock', path], repo);
    } catch {
      /* not locked: nothing to do */
    }
  }
}

function stopLoud(e) {
  console.error(
    [
      '',
      `[verify-commits] STOPPED, NOTHING MORE DELETED: ${e.message}`,
      '  A node_modules link could not be confirmed removed. Deleting the folder now could',
      '  empty the REAL node_modules it points at. Remove the link by hand (rmdir, no /s) and re-run.',
    ].join('\n')
  );
  process.exit(2);
}

const commits = git(['rev-list', '--reverse', range]).split('\n').filter(Boolean);
if (commits.length === 0) {
  console.log(`[verify-commits] no commits in ${range}`);
  process.exit(0);
}

// EOL-normalised: a Windows checkout may hold the lock file as CRLF while git has LF.
const eol = (t) => t.replace(/\r\n/g, '\n');
const myLock = eol(readFileSync(join(root, 'package-lock.json'), 'utf8'));
// TEST HOOKS (step 8-0 proof only, never set in real use): point the share at a DUMMY
// directory, and die right after the link exists (what a kill mid-run leaves behind).
const nmSource = process.env.VERIFY_COMMITS_NODE_MODULES ?? join(root, 'node_modules');
const dieAfterLink = process.env.VERIFY_COMMITS_DIE_AFTER_LINK === '1';
try {
  sweepStale();
} catch (e) {
  if (e instanceof LinkStuck) stopLoud(e);
  throw e;
}
const base = mkdtempSync(join(tmpdir(), 'wt-verify-'));
writeFileSync(join(base, '.pid'), String(process.pid));
const results = [];

try {
  for (const sha of commits) {
    const short = sha.slice(0, 7);
    const subject = git(['log', '-1', '--format=%s', sha]).trim();
    const wt = join(base, short);
    const started = Date.now();
    console.log(`\n[verify-commits] ${short} ${subject}`);
    let failed = null;
    try {
      git(['worktree', 'add', '--detach', wt, sha]);
      const lock = eol(readFileSync(join(wt, 'package-lock.json'), 'utf8'));
      if (lock === myLock) {
        symlinkSync(nmSource, join(wt, 'node_modules'), 'junction');
        if (dieAfterLink) process.exit(9); // simulated kill: no finally runs
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
      try {
        removeWorktreeSafely(wt);
      } catch (e) {
        if (e instanceof LinkStuck) stopLoud(e);
        throw e;
      }
    }
    const secs = Math.round((Date.now() - started) / 1000);
    results.push({ short, subject, failed, secs });
    if (failed) console.log(`  --- output of the failing step ---\n${failed}`);
  }
} finally {
  // every worktree dir is already gone and verified link-free; only the empty base is left
  // (non-recursive on purpose: if anything unexpected is left in it, it stays)
  try {
    unlinkSync(join(base, '.pid'));
    rmdirSync(base);
  } catch {
    /* leave it; the next run's sweep handles it safely */
  }
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
