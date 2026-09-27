// tests/sw-upgrade.spec.ts — code-shape R1c (Sep 27 2026).
//
// Proves the install semantics stack-decision-2026-09-27.md's "Second
// opinions" section asked for: "install only after every precache asset
// downloaded successfully (Promise.all before skipWaiting; on any failure
// keep the OLD cache and abort activation), and an offline upgrade test:
// old app cached -> new build available -> simulate a failed asset download
// -> old app still starts offline; success path -> new app starts."
//
// HOW "a new build" is simulated, and why: two attempts at page.route() /
// context.route() interception of the real sw.js and its imported build-
// info.js both silently did nothing — Chromium's service-worker update
// fetch did not go through either interception layer in this Playwright
// version, so `registration.update()` never even attempted a new install
// (confirmed empirically, not assumed). The standard, interception-free way
// to force a real update attempt is to register a DIFFERENT script URL at
// the SAME scope — the spec's own update trigger, not a heuristic byte-diff
// this test has to out-guess. So this writes two tiny REAL sibling files
// next to sw.js (`sw-test-*.js`, a byte-for-byte copy with only the
// `importScripts` target changed) and their own fake `dist/build-info-
// test-*.js` + (for the success case only) a fake bundle — genuine HTTP
// fetches, no route mocking. All of it is written INTO this worktree at
// test run time and removed in `finally`, never committed.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const REAL_SW_PATH = path.join(ROOT, 'sw.js');

function writeVariant(
  tag: string,
  opts: { bundleFails: boolean }
): { swFile: string; cleanup: () => void } {
  const realSw = fs.readFileSync(REAL_SW_PATH, 'utf8');
  const buildInfoName = `dist/build-info-test-${tag}.js`;
  const bundleName = `app.TEST${tag.toUpperCase()}.js`;
  const swVariant = realSw.replace(
    "importScripts('./dist/build-info.js');",
    `importScripts('./${buildInfoName}');`
  );
  if (!swVariant.includes(buildInfoName)) {
    throw new Error(
      'writeVariant: could not rewrite the importScripts target in sw.js — check the string it looks for.'
    );
  }
  const swFileName = `sw-test-${tag}.js`;
  const swFilePath = path.join(ROOT, swFileName);
  const buildInfoPath = path.join(ROOT, buildInfoName);
  const bundlePath = path.join(ROOT, 'dist', bundleName);

  fs.writeFileSync(swFilePath, swVariant, 'utf8');
  fs.writeFileSync(
    buildInfoPath,
    `self.__BUILD_INFO__ = {"bundle":"${bundleName}","version":"v-test-${tag}","buildDate":"test"};\n`,
    'utf8'
  );
  if (!opts.bundleFails) {
    fs.writeFileSync(
      bundlePath,
      `export const marker = 'GOLDEN-FAKE-${tag.toUpperCase()}-BUNDLE-MARKER';\n`,
      'utf8'
    );
  }
  // bundleFails: deliberately never written — cache.add() rejects on the
  // real 404, no interception/abort needed to simulate a bad download.

  return {
    swFile: swFileName,
    cleanup: () => {
      for (const f of [swFilePath, buildInfoPath, bundlePath]) {
        try {
          fs.unlinkSync(f);
        } catch {
          /* not written (the bundleFails case) or already gone — fine */
        }
      }
    },
  };
}

test.describe.serial('service worker: install only after a full download', () => {
  test('failed critical download → the OLD app keeps controlling and still starts offline', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Baseline: the real v1 build is cached and controlling right now.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#app')).not.toBeEmpty();
    await expect(page.locator('.app-version')).toBeVisible();
    await context.setOffline(false);

    const { swFile, cleanup } = writeVariant('fail', { bundleFails: true });
    try {
      const controllerChanged = await page.evaluate((scriptUrl) => {
        return new Promise<boolean>((resolve) => {
          let changed = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            changed = true;
          });
          void navigator.serviceWorker.register(scriptUrl, { scope: './' });
          // No successful state to await on the failure path — a bounded
          // real wait is the honest way to prove "nothing happened by now".
          setTimeout(() => resolve(changed), 4000);
        });
      }, `/${swFile}`);
      expect(
        controllerChanged,
        'a failed critical download must never hand control to the new worker'
      ).toBe(false);

      // The money assertion: offline, AFTER a failed update attempt, the OLD
      // app still boots — not a blank page (the exact bug this fixes: a
      // tolerant `cache.add().catch()` on the app bundle used to let a
      // broken install activate anyway and delete the old, working cache).
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('#app')).not.toBeEmpty();
      await expect(page.locator('.app-version')).toBeVisible();
      await context.setOffline(false);
    } finally {
      cleanup();
    }
  });

  test('successful critical download → the NEW build takes control and starts offline', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    const { swFile, cleanup } = writeVariant('ok', { bundleFails: false });
    try {
      const controllerChanged = await page.evaluate((scriptUrl) => {
        return new Promise<boolean>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true));
          void navigator.serviceWorker.register(scriptUrl, { scope: './' });
          setTimeout(() => resolve(false), 8000);
        });
      }, `/${swFile}`);
      expect(
        controllerChanged,
        'a fully-downloaded critical set must activate and take control'
      ).toBe(true);

      // Offline, the NEW cached bundle is what actually gets served — proof
      // this is a real cache swap, not just a controller-change coincidence.
      await context.setOffline(true);
      await page.reload();
      const bundleText = await page.evaluate(async () => {
        const res = await fetch('./dist/app.TESTOK.js');
        return res.text();
      });
      expect(bundleText).toContain('GOLDEN-FAKE-OK-BUNDLE-MARKER');
      await context.setOffline(false);
    } finally {
      cleanup();
    }
  });
});
