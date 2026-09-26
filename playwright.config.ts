import { defineConfig, devices } from '@playwright/test';

// Sep 27 2026 · WK1 fix r1 (checker must #2): week.ts's getDay()/getDate() calls
// read the RUNTIME's local timezone, not the +03:00 offset embedded in a test's
// ISO string — so tests/week.test.ts passes on this laptop (Asia/Jerusalem) but
// fails on CI's ubuntu-latest runner, which defaults to UTC. The app's calendar
// semantics (Saturday/Sunday anchors, the swing) are inherently Jerusalem-local
// (her own timezone, the only one that matters), so the whole suite is pinned
// to it, not left to whatever box happens to run it.
process.env.TZ = 'Asia/Jerusalem';

// Sep 26 2026: PW_PORT lets two checkouts (a hotfix worktree + the main
// checkout's builders) run the suite at once without one reusing the other's
// server — that served STALE code to the wrong suite twice tonight.
const PORT = process.env.PW_PORT ?? '3100';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // v51 · fix (Sep 25 2026): the long walk-through specs (open a phase, log,
  // read the confirmation, undo) run ~13s alone, but hit the default 30s
  // timeout when the laptop is busy — Sep 25 2026 saw 5/4/1 random timeouts
  // across three runs, and husky's pre-commit suite failed each time and
  // blocked the commit. 60s gives real headroom without hiding a genuinely
  // hung test. One local retry re-runs a flaky-timeout failure once; it does
  // NOT mask a real failure — that still fails twice and reports red.
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  // Port 3100 (not 3000): on this Windows dev box the Gmail MCP server holds
  // port 3000, so `serve -l 3000` silently falls back to a random port and the
  // webServer wait times out. 3100 is free locally and in CI. (food-log hit the
  // same conflict and moved to 4321.)
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx serve -l ${PORT} .`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
