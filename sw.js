// Workout Tracker — service worker
// Strategy (deliberately simpler than the budget app — this app has NO offline-write queue):
//   - Code (HTML navigation + dist/app.js): network-first, cache fallback. Online
//     users always get the freshest build; a stale cached build can't strand the app.
//   - Static shell (CSS/manifest/icons + local exercise images): cache-first,
//     refreshed in the background so workouts render fully offline at the gym.
//   - Supabase REST GET: network-first, fall back to cache, fall back to empty array.
//   - Everything else: passthrough (default browser behavior).

// code-shape R1b (Sep 27 2026): the "version lives in 3 places" bug + the
// hand-kept-twice-over per-module precache list (decision doc, "Hand-kept
// lists and versions" / the M1 bug class) are both fixed the same way — one
// bundle, one build-info.js written by scripts/build.mjs on every `npm run
// build`, imported here so VERSION and the precached filename always follow
// the actual build. Never hand-edit VERSION or a dist/*.js entry below again.
importScripts('./dist/build-info.js');
// eslint-disable-next-line no-undef -- self.__BUILD_INFO__ is written by scripts/build.mjs's importScripts above
const BUILD_INFO = self.__BUILD_INFO__ || { version: 'unknown', bundle: 'app.js' };
// code-shape R1 · fix r1 (must #1, Sep 27 2026): the shell cache used to be
// keyed on appVersion ALONE. Code-shape rounds never bump appVersion (that's
// the rule), so every R2..R13 deploy installed its new worker into the SAME
// cache the old one was still serving from — a failed critical download (bad
// gym Wi-Fi, or a genuinely broken build) still let `cache.add('./')` and
// `cache.add('./index.html')` succeed and overwrite the live entries before
// the bundle download failed and the whole install rejected, leaving the OLD
// worker serving NEW html that pointed at an uncached bundle: blank offline
// start. Proven with a stopped-server harness (CHECK-code-shape-R1-2026-09-
// 27.md S5): same appVersion, blank; different appVersion, fine. Keying on
// the bundle name too means two builds NEVER share a cache, so a failed
// install can only ever corrupt a cache nothing live is using.
const SHELL_CACHE = `workout-tracker-${BUILD_INFO.version}-${BUILD_INFO.bundle}-shell`;
const RUNTIME_CACHE = `workout-tracker-${BUILD_INFO.version}-runtime`;
const APP_BUNDLE = `./dist/${BUILD_INFO.bundle}`;

// code-shape R1c (Sep 27 2026): split into CRITICAL (the app can't boot
// without these — install must succeed on ALL of them or not at all) vs
// OPTIONAL (nice-to-have offline: exercise photos, voice notes — one missing
// image must never block the app itself from updating). Before this, EVERY
// asset used a tolerant `cache.add().catch()` — including the app bundle —
// so a failed download of `app.js` on bad gym Wi-Fi still let the install
// finish, activate, and delete the OLD cache: the next offline start was a
// blank page (Gemini Pro's pushback, Sep 27 dialogue, stack-decision-2026-
// 09-27.md). Now a critical-asset failure aborts the WHOLE install — the
// still-registered OLD service worker (and its cache) keeps serving.
const CRITICAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  // R1b: ONE bundle now (esbuild), content-hashed by scripts/build.mjs — the
  // 12 hand-listed per-module dist/*.js entries this used to carry (and the
  // M1 bug they caused: a module missing from this list = blank app offline)
  // are gone because there's nothing left to hand-list.
  APP_BUNDLE,
  './manifest.webmanifest',
];

const OPTIONAL_ASSETS = [
  // v49 · look (Sep 25 2026): self-hosted DM Sans (spec §3 "Font loading") —
  // precached so it renders offline on the floor, never a runtime Google
  // Fonts fetch.
  './assets/fonts/DMSans-Variable.woff2',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  // Local exercise images — so workouts render offline.
  './assets/exercises/bodyweight-squats-0.jpg',
  './assets/exercises/bodyweight-squats-1.jpg',
  './assets/exercises/figure-4-stretch-0.jpg',
  './assets/exercises/figure-4-stretch-1.jpg',
  './assets/exercises/forearm-stretch-0.jpg',
  './assets/exercises/forearm-stretch-1.jpg',
  './assets/exercises/glute-bridges-0.jpg',
  './assets/exercises/glute-bridges-1.jpg',
  './assets/exercises/knees-to-chest-hold-0.jpg',
  './assets/exercises/knees-to-chest-hold-1.jpg',
  './assets/exercises/modified-dead-bug-0.jpg',
  './assets/exercises/modified-dead-bug-1.jpg',
  './assets/exercises/outdoor-walk-0.jpg',
  './assets/exercises/outdoor-walk-1.jpg',
  './assets/exercises/pelvic-tilts-0.jpg',
  './assets/exercises/pelvic-tilts-1.jpg',
  './assets/exercises/seated-forward-fold-0.jpg',
  './assets/exercises/seated-forward-fold-1.jpg',
  './assets/exercises/side-lying-leg-raises-0.jpg',
  './assets/exercises/side-lying-leg-raises-1.jpg',
  './assets/exercises/single-leg-glute-bridges-0.jpg',
  './assets/exercises/single-leg-glute-bridges-1.jpg',
  './assets/exercises/wrist-circles-0.jpg',
  './assets/exercises/wrist-circles-1.jpg',
  // Per-exercise voice notes (Allison Jul 9 2026) — cached so they play offline
  // at the gym. One file per exercise as the enriched card rolls out.
  './assets/voice/bodyweight-squats.mp3',
  './assets/voice/eccentric-step-down.mp3',
  './assets/voice/1-kg-biceps-curl.mp3',
  './assets/voice/belly-breathing.mp3',
  // v30 (Sep 7 2026) — the guided indoor cardio strip.
  './assets/voice/apartment-cardio.mp3',
  // R2 Week 2 (Sep 7 2026).
  './assets/voice/bird-dog-legs-only.mp3',
  './assets/voice/full-dead-bug.mp3',
  './assets/voice/biceps-stretch-left.mp3',
  './assets/voice/biceps-stretch-right.mp3',
  './assets/voice/bodyweight-hip-hinge.mp3',
  './assets/voice/both-knees-to-chest.mp3',
  './assets/voice/calf-stretch-on-wall-left.mp3',
  './assets/voice/calf-stretch-on-wall-right.mp3',
  './assets/voice/doorway-pec-stretch.mp3',
  './assets/voice/figure-4-stretch.mp3',
  './assets/voice/forearm-plank.mp3',
  './assets/voice/glute-bridges.mp3',
  './assets/voice/glute-squeezes.mp3',
  './assets/voice/heel-taps.mp3',
  './assets/voice/hip-flexor-left-knee-in-right-leg-dangles.mp3',
  './assets/voice/hip-flexor-right-knee-in-left-leg-dangles.mp3',
  './assets/voice/iwyt-raises.mp3',
  './assets/voice/knee-drops-side-to-side.mp3',
  './assets/voice/knee-to-chest-hugs.mp3',
  './assets/voice/knees-to-chest-hold.mp3',
  './assets/voice/leg-cross-left.mp3',
  './assets/voice/leg-cross-right.mp3',
  './assets/voice/leg-up-in-air-left.mp3',
  './assets/voice/leg-up-in-air-right.mp3',
  './assets/voice/modified-dead-bug.mp3',
  './assets/voice/neck-stretch.mp3',
  './assets/voice/outdoor-walk.mp3',
  './assets/voice/pelvic-tilts.mp3',
  './assets/voice/prone-row-bodyweight.mp3',
  './assets/voice/scapular-squeezes.mp3',
  './assets/voice/seated-forward-fold.mp3',
  './assets/voice/shoulder-stretch.mp3',
  './assets/voice/side-lying-clamshells.mp3',
  './assets/voice/side-lying-leg-raises.mp3',
  './assets/voice/single-leg-glute-bridges.mp3',
  './assets/voice/slow-breathing.mp3',
  './assets/voice/slow-supine-bicycle.mp3',
  './assets/voice/standing-calf-raises.mp3',
  './assets/voice/wall-angels.mp3',
  './assets/voice/wall-lean-wrist-on-ramp.mp3',
  './assets/voice/wall-sit.mp3',
  // R2 Week 4 (Sep 19 2026) — was missing from the precache until v45.
  './assets/voice/supported-split-squat.mp3',
  './assets/voice/wrist-extension-left.mp3',
  './assets/voice/wrist-extension-right.mp3',
  './assets/voice/wrist-flexion-left.mp3',
  './assets/voice/wrist-flexion-right.mp3',
];

const SUPABASE_REST_HINT = '/rest/v1/';

// ── Install / activate ──────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // CRITICAL: every one must succeed, or this whole install is REJECTED.
      // No `.catch()` here on purpose — cache.add() rejects on a non-2xx
      // response or a network failure, Promise.all propagates that
      // rejection to the extend-lifetime promise below, and per the service
      // worker spec a rejected install event's worker is discarded before it
      // ever reaches "waiting"/"active" — the OLD worker (and its cache,
      // still holding the last GOOD build) is never replaced. skipWaiting()
      // below only runs once every critical asset is confirmed cached.
      await Promise.all(
        CRITICAL_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
      );
      self.skipWaiting();
      // OPTIONAL: best-effort, one missing image/voice note must never block
      // (or undo) a critical install that already succeeded.
      await Promise.all(
        OPTIONAL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[SW] Failed to cache optional asset', url, err);
          })
        )
      );
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // v45: only OUR old caches. Her apps share one github.io origin, and
      // deleting every other cache wiped the budget app's offline copy on each
      // workout deploy (and budget's SW did the same back).
      await Promise.all(
        keys
          .filter((k) => k.startsWith('workout-tracker-'))
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch routing ─────────────────────────────────────────────────────────

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith(self.registration.scope.replace(self.location.origin, ''));
}

function isSupabaseRest(url) {
  return url.pathname.includes(SUPABASE_REST_HINT);
}

// Code = the HTML document + the app bundle. These must stay fresh when online
// so a stale cached build can't strand the app. Images/CSS/icons stay cache-first.
// R1b: one bundle name, read from BUILD_INFO — nothing left to hand-list.
function isCodeRequest(url, request) {
  if (request.mode === 'navigate') return true;
  return url.pathname.endsWith(`/${BUILD_INFO.bundle}`) || url.pathname.endsWith('/index.html');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method.toUpperCase() !== 'GET') return; // only GETs handled; rest passthrough
  const url = new URL(request.url);

  // 1) Supabase REST GET — network-first, fall back to cache, then empty array.
  if (isSupabaseRest(url)) {
    event.respondWith(handleSupabaseGet(request));
    return;
  }

  // 2) Same-origin requests. Code (HTML + app bundle) network-first; everything
  //    else in the shell (CSS/icons/images) cache-first for offline workouts.
  if (isShellRequest(url)) {
    if (isCodeRequest(url, request)) {
      event.respondWith(handleCodeNetworkFirst(request));
    } else {
      event.respondWith(handleShell(request));
    }
    return;
  }

  // Anything else: passthrough.
});

async function handleCodeNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // cache: 'no-cache' bypasses the browser's HTTP cache (GitHub Pages serves
    // max-age=600, which otherwise keeps a just-deployed build stale for up to
    // 10 minutes) while still allowing cheap ETag 304 revalidation.
    const res = await fetch(request, { cache: 'no-cache' });
    // code-shape R1 · fix r1 (must #2, Sep 27 2026): this used to
    // `cache.put(request, res.clone())` here on every online navigation. That
    // wrote the fresh index.html into the live shell cache even when THAT
    // html's own bundle was never cached (gym Wi-Fi: html arrives, ~420KB
    // bundle 404s) — the next offline start then served fresh html pointing
    // at an uncached bundle: blank page. Proven in CHECK-code-shape-R1-2026-
    // 09-27.md S1. Only install() writes the shell cache now, html and its
    // bundle together or not at all; an offline navigation falls back to
    // whatever install last cached (below), which is always a matched pair.
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function handleShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) {
    fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function handleSupabaseGet(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    // v45: offline answers are STAMPED so the app can tell them from a live
    // one. An old cached list read as "the server's truth" made the app drop
    // sessions synced after that cache was taken.
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-SW-Cache', '1');
      return new Response(await cached.text(), { status: 200, headers });
    }
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-SW-Cache': '1' },
    });
  }
}
