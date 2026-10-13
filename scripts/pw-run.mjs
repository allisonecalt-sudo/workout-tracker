#!/usr/bin/env node
// scripts/pw-run.mjs - code-shape step 0 (Oct 13 2026).
// Cross-platform Playwright launcher for the fast gate and the pre-commit hook.
//  - `--fast`  runs every tests/*.test.ts file + tests/golden.spec.ts (cmd.exe
//    does not expand globs, and Playwright treats CLI args as regexes, so the
//    file list is built here with fs and passed explicitly).
//  - Port: when PW_PORT is unset, asks the OS for a free port and sets PW_PORT
//    for the child, plus PW_FRESH_SERVER=1 so playwright.config.ts never
//    reuses a stale server (e.g. from another checkout) on that port.
//  - An explicit PW_PORT is respected as-is (the old behaviour).
// Other args pass straight through to `playwright test`.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function fastFiles() {
  const unit = readdirSync(join(root, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .sort()
    .map((f) => `tests/${f}`);
  return [...unit, 'tests/golden.spec.ts'];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const fast = args[0] === '--fast';
  const rest = fast ? args.slice(1) : args;
  const env = { ...process.env };
  if (!env.PW_PORT) {
    env.PW_PORT = String(await freePort());
    env.PW_FRESH_SERVER = '1';
  }
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const files = fast ? fastFiles() : [];
  console.log(`[pw-run] port ${env.PW_PORT}${fast ? `, ${files.length} files` : ''}`);
  const r = spawnSync(process.execPath, [cli, 'test', ...files, ...rest], {
    stdio: 'inherit',
    cwd: root,
    env,
  });
  process.exit(r.status ?? 1);
}
