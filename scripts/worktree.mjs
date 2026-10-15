#!/usr/bin/env node
// scripts/worktree.mjs - code-shape step 15-0 (Oct 15 2026): safe worktree add / remove.
// WHY: at 18:00:44 on Oct 15 the main checkout's node_modules was emptied, one second after a
// builder removed a temporary worktree: `git worktree remove --force` FOLLOWS a node_modules
// junction on Windows and deletes what it points at. The class fix: never link, never --force.
//
//   npm run wt:add -- <path> <ref>    creates the worktree (detached at <ref>) and runs a REAL
//                                     `npm ci` inside it. No link, no junction, ever.
//   npm run wt:remove -- <path>       REFUSES (loud, deletes nothing) unless <path> is a registered,
//                                     NON-main worktree (`git worktree list`), and REFUSES if ANY
//                                     link/junction sits anywhere under it (node_modules included).
//                                     Otherwise fs.rmSync the folder, then `git worktree prune`.
// Relative paths resolve against INIT_CWD (the folder she typed the command in; npm sets it and
// runs the script from the package root) so `npm run wt:add -- ..\x HEAD` means what it says.
// wt:remove also refuses, in plain words, when you are standing inside the worktree (Windows
// cannot delete a folder that is a process's current directory; that used to be a raw EPERM stack).
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLinks, parseWorktrees, whyNotRemovable } from './wt-links.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Where she typed the command: npm sets INIT_CWD and runs scripts from the package root.
const base = process.env.INIT_CWD || process.cwd();
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
  const wt = resolve(base, target);
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
  const asked = resolve(base, target);
  if (!existsSync(asked)) die([`[worktree] nothing at ${asked}`], 1);
  const wt = realpathSync(asked);
  const why = whyNotRemovable(wt, parseWorktrees(git(['worktree', 'list', '--porcelain'])));
  if (why) {
    die([
      `[worktree] REFUSED, NOTHING DELETED: ${wt}`,
      `  ${why}. wt:remove only removes a registered worktree that is not the main checkout.`,
    ]);
  }
  for (const here of new Set([base, process.cwd()])) {
    if (!existsSync(here)) continue;
    const rel = relative(wt, realpathSync(here));
    const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    if (inside) {
      die([
        `[worktree] NOT REMOVED: you are standing inside ${wt}`,
        `  (current folder: ${here}). Windows cannot delete the folder a program is in.`,
        '  cd out of it (for example to the main checkout), then run wt:remove again.',
      ]);
    }
  }
  const links = findLinks(wt);
  if (links.length > 0) {
    die([
      `[worktree] REFUSED, NOTHING DELETED: ${wt}`,
      `  link/junction inside it: ${links.join(', ')}`,
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
