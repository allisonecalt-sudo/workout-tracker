// scripts/wt-links.mjs - shared link detection for the worktree scripts (step 15-0, Oct 15 2026).
// WHY: on Windows `git worktree remove --force` and `rmSync(dir, {recursive})` FOLLOW a
// node_modules junction and empty its target (Oct 14 and Oct 15 18:00: the main checkout's
// node_modules was emptied). Every script that deletes a worktree uses these two helpers:
// lstat never follows a link, and a junction reports isSymbolicLink() in Node.
import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** True when p exists at all (a dangling link counts) - lstat never follows a link. */
export function lexists(p) {
  try {
    lstatSync(p);
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    throw e;
  }
}

/** Names at the TOP LEVEL of dir that are links / junctions (node_modules included). */
export function topLevelLinks(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (lstatSync(join(dir, name)).isSymbolicLink()) found.push(name);
  }
  return found;
}
