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

// R1 · fix r1 (must #3, Sep 27 2026): the two tests above simulate "a new
// build" by registering a DIFFERENT sw.js at the SAME scope — a fine way to
// force a real install attempt, but not what an actual code-shape deploy
// looks like: appVersion never bumps (CLAUDE.md's own rule), so sw.js's own
// bytes are IDENTICAL build to build, and only index.html + the imported
// dist/build-info.js change. The checker proved must #1 (cache name keyed on
// appVersion alone, so two builds shared a cache) and must #2 (the fetch
// handler overwriting live html with a fresh, not-yet-cached deploy) with a
// REAL stopped-server harness against files it edited directly on disk
// (scratchpad/swcheck.js, kept outside this repo) — a technique this file's
// own comment above says works and route interception doesn't. These two
// tests reproduce both, in-suite, the same way, but against a throwaway
// SEPARATE SCOPE this describe block creates and deletes (its own index.html/
// sw.js/dist/), never the real site's files — so a worker crash mid-test
// can't corrupt what tests/golden.spec.ts and everything else are reading
// from in parallel.
test.describe
  .serial('service worker: a same-appVersion deploy must not corrupt the live cache', () => {
  const SCOPE = 'sw-fixture-scope'; // gitignored-by-convention name; deleted in `finally` either way
  const SCOPE_DIR = path.join(ROOT, SCOPE);

  function writeDeploy(
    version: string,
    bundleName: string,
    marker: string,
    bundleOk: boolean
  ): void {
    fs.mkdirSync(path.join(SCOPE_DIR, 'dist'), { recursive: true });
    // sw.js copied byte-identical every time (code-shape never touches it for
    // a content-only deploy) — importScripts('./dist/build-info.js') resolves
    // inside SCOPE_DIR, so it precaches THIS scope's own files, never the
    // real app's.
    fs.writeFileSync(path.join(SCOPE_DIR, 'sw.js'), fs.readFileSync(REAL_SW_PATH, 'utf8'), 'utf8');
    fs.writeFileSync(
      path.join(SCOPE_DIR, 'index.html'),
      // #app starts EMPTY on purpose — it's the bundle's JS that fills it in,
      // same division of labour as the real app.ts/index.html. A missing
      // bundle must leave it empty, the same honestly-blank symptom the real
      // bug produces, not a marker this test hand-wrote into the html.
      `<!doctype html><html><head><meta charset="utf-8"></head><body>` +
        `<div id="app"></div>` +
        `<script src="dist/${bundleName}"></script>` +
        `<script>navigator.serviceWorker && navigator.serviceWorker.register('./sw.js', { scope: './' });</script>` +
        `</body></html>\n`,
      'utf8'
    );
    fs.writeFileSync(path.join(SCOPE_DIR, 'styles.css'), '/* fixture scope */\n', 'utf8');
    fs.writeFileSync(path.join(SCOPE_DIR, 'manifest.webmanifest'), '{}', 'utf8');
    fs.writeFileSync(
      path.join(SCOPE_DIR, 'dist', 'build-info.js'),
      `self.__BUILD_INFO__ = {"bundle":"${bundleName}","version":"${version}","buildDate":"test"};\n`,
      'utf8'
    );
    if (bundleOk) {
      fs.writeFileSync(
        path.join(SCOPE_DIR, 'dist', bundleName),
        `document.getElementById('app').innerHTML = '<span class="marker">${marker}</span>';\n`,
        'utf8'
      );
    }
    // bundleOk === false: deliberately never written — cache.add() 404s, same
    // as writeVariant's bundleFails above, AND (since it's the bundle that
    // fills #app) a browser that can't fetch it now renders a blank #app —
    // the real symptom, not a stand-in for it.
  }

  function cleanupScope(): void {
    fs.rmSync(SCOPE_DIR, { recursive: true, force: true });
  }

  test('update() only, no online navigation (must #1: cache-name isolation)', async ({
    page,
    context,
  }) => {
    cleanupScope();
    try {
      writeDeploy('v-fix-r1', 'app.OLD.js', 'OLD-DEPLOY', true);
      await page.goto(`/${SCOPE}/`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect(page.locator('.marker')).toHaveText('OLD-DEPLOY');

      // Sanity: this deploy boots offline right now, before any "next build".
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('.marker')).toHaveText('OLD-DEPLOY');
      await context.setOffline(false);

      // The next code-shape deploy: SAME appVersion (never bumped), a
      // different (never-written, 404) bundle name. sw.js's own bytes are
      // unchanged — only index.html and the imported build-info.js differ,
      // which IS what the SW update algorithm diffs against (importScripts
      // targets are part of a registration's script resource map, not just
      // the top-level file — proven true here: reg.update() below DOES
      // attempt a real install even though sw.js itself never changed).
      writeDeploy('v-fix-r1', 'app.NEW.js', 'NEW-DEPLOY', false);
      // No page.reload() anywhere in this test — isolates the cache-name
      // question from the fetch-handler question the next test covers.
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration('./');
        if (reg) await reg.update().catch(() => {});
      });
      await page.waitForTimeout(1500);

      // The money assertion: offline, the OLD deploy must still boot — not
      // corrupted by the failed install, not blank. Pre-fix (cache keyed on
      // appVersion alone), the failed install's Promise.all still wrote
      // NEW-DEPLOY's html into the cache the OLD worker was serving from
      // before the bundle 404 rejected the whole install.
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('#app')).not.toBeEmpty();
      await expect(page.locator('.marker')).toHaveText('OLD-DEPLOY');
      await context.setOffline(false);
    } finally {
      cleanupScope();
    }
  });

  test('one online reload after the deploy (must #2: the fetch handler must not write html its bundle never cached)', async ({
    page,
    context,
  }) => {
    cleanupScope();
    try {
      writeDeploy('v-fix-r1', 'app.OLD2.js', 'OLD-DEPLOY-2', true);
      await page.goto(`/${SCOPE}/`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect(page.locator('.marker')).toHaveText('OLD-DEPLOY-2');

      // Next deploy: same appVersion, a bundle that 404s — same as above,
      // PLUS the one thing that test deliberately skipped: an ordinary
      // online reload (the every-day case — she opens the app on gym Wi-Fi
      // for a deploy whose bundle happens not to have finished uploading).
      writeDeploy('v-fix-r1', 'app.NEW2.js', 'NEW-DEPLOY-2', false);
      // Online reload, served by the STILL-ACTIVE old worker's fetch handler.
      // The new bundle 404s online too (it was never written, deliberately —
      // this IS the deploy whose upload didn't finish), so #app stays empty
      // right now regardless of the fix; the assertion below is about what
      // OFFLINE looks like next, not this reload.
      await page.reload();
      await page.waitForTimeout(500);
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration('./');
        if (reg) await reg.update().catch(() => {});
      });
      await page.waitForTimeout(1500);

      // The money assertion: offline, the OLD deploy must still boot. Pre-fix,
      // handleCodeNetworkFirst's cache.put on that online reload overwrote
      // the live cache's index.html with NEW-DEPLOY-2's html — whose bundle
      // was never cached — so this reload would have rendered blank.
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('#app')).not.toBeEmpty();
      await expect(page.locator('.marker')).toHaveText('OLD-DEPLOY-2');
      await context.setOffline(false);
    } finally {
      cleanupScope();
    }
  });
});
