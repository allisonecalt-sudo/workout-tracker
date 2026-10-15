#!/usr/bin/env node
// scripts/worktree.mjs - code-shape step 15-0 (Oct 15 2026): safe worktree add / remove.
// WHY: at 18:00:44 on Oct 15 the main checkout's node_modules was emptied, one second after a
// builder removed a temporary worktree: `git worktree remove --force` FOLLOWS a node_modules
// junction on Windows and deletes what it points at. The class fix: never link, never --force.
//
//   npm run wt:add -- <path> <ref>    creates the worktree (detached at <ref>) and runs a REAL
//                                     `npm ci` inside it. No link, no junction, ever.
//   npm run wt:remove -- <path>       REFUSES (loud, deletes nothing) if ANY link/junction sits
//                                     at the worktree root's top level (node_modules included).
//                                     Otherwise fs.rmSync the folder, then `git worktree prune`.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topLevelLinks } from './wt-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function die(lines, code = 2) {
  console.error(['', ...lines].join('\n'));
  process.exit(code);
}

const [cmd, target, ref] = process.argv.slice(2);

if (cmd === 'add') {
  if (!target || !ref) die(['usage: wt:add <path> <ref>'], 1);
  const wt = resolve(target);
  if (existsSync(wt)) die([`[worktree] refusing: ${wt} already exists`], 1);
  git(['worktree', 'add', '--detach', wt, ref]);
  console.log(`[worktree] created ${wt} at ${ref}; running npm ci (real install, no links)`);
  const ci = spawnSync(npm, ['ci'], {
    cwd: wt,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (ci.status !== 0) die([`[worktree] npm ci failed in ${wt}; remove it with wt:remove`], 1);
  console.log(`[worktree] ready: ${wt}`);
} else if (cmd === 'remove') {
  if (!target) die(['usage: wt:remove <path>'], 1);
  const wt = resolve(target);
  if (!existsSync(wt)) die([`[worktree] nothing at ${wt}`], 1);
  const links = topLevelLinks(wt);
  if (links.length > 0) {
    die([
      `[worktree] REFUSED, NOTHING DELETED: ${wt}`,
      `  link/junction at its top level: ${links.join(', ')}`,
      '  Deleting now could empty the REAL folder the link points at (the Oct 15 18:00 incident).',
      '  Remove each link by hand (cmd: rmdir <link>, NO /s), then re-run wt:remove.',
    ]);
  }
  rmSync(wt, { recursive: true, force: true });
  try {
    git(['worktree', 'prune']);
  } catch {
    /* a stale registration is harmless */
  }
  console.log(`[worktree] removed ${wt}`);
} else {
  die(['usage: worktree.mjs add <path> <ref> | remove <path>'], 1);
}
