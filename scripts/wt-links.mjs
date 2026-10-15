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

/** True when p is itself a link / junction (lstat, never followed). */
export function isLink(p) {
  return lexists(p) && lstatSync(p).isSymbolicLink();
}

/** Every link / junction ANYWHERE under dir (recursive; lstat only, a link is reported and
 *  never entered). Returns paths relative to dir; stops after `max` hits (one is enough to refuse). */
export function findLinks(dir, max = 5) {
  const found = [];
  const walk = (d, rel) => {
    for (const name of readdirSync(d)) {
      if (found.length >= max) return;
      const p = join(d, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) found.push(rel ? `${rel}/${name}` : name);
      else if (st.isDirectory()) walk(p, rel ? `${rel}/${name}` : name);
    }
  };
  walk(dir, '');
  return found;
}

const norm = (p) => p.replaceAll(String.fromCharCode(92), '/').replace(/\/+$/, '');
const same = (a, b) =>
  process.platform === 'win32'
    ? norm(a).toLowerCase() === norm(b).toLowerCase()
    : norm(a) === norm(b);

/** Registered worktree paths from `git worktree list --porcelain` output; the FIRST is the main one. */
export function parseWorktrees(porcelain) {
  return porcelain
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length).trim());
}

/** Decide whether `target` (already realpath-resolved) may be removed. Pure: touches nothing.
 *  Returns null when allowed, else the reason. Allowed ONLY if registered, not main, not an
 *  ancestor of (or equal to) main. */
export function whyNotRemovable(target, registered) {
  const [main, ...others] = registered;
  if (!main) return 'git lists no worktrees';
  if (same(target, main)) return 'it is the MAIN checkout';
  const t = norm(target).toLowerCase() + '/';
  if (norm(main).toLowerCase().startsWith(t)) return 'it contains the MAIN checkout';
  if (!others.some((w) => same(w, target))) return 'it is not a registered git worktree';
  return null;
}
