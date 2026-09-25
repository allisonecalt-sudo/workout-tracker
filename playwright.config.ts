import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx serve -l 3100 .',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
