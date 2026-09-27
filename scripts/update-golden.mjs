#!/usr/bin/env node
// scripts/update-golden.mjs — Sep 27 2026 (code-shape R1a).
//
// The ONLY sanctioned way to regenerate tests/golden/*.html. Builders may
// never hand-edit a golden file or run this themselves (builder-sequence
// rule 3) — a golden diff means STOP AND REPORT. Only the checker runs this,
// and only with a written reason in the commit message naming which
// golden(s) changed and why the change is an intentional behaviour change,
// not a refactor regression.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['playwright', 'test', 'tests/golden.spec.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, UPDATE_GOLDEN: '1' },
});

process.exit(result.status ?? 1);
