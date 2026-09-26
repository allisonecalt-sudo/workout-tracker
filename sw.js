// Workout Tracker — service worker
// Strategy (deliberately simpler than the budget app — this app has NO offline-write queue):
//   - Code (HTML navigation + dist/app.js): network-first, cache fallback. Online
//     users always get the freshest build; a stale cached build can't strand the app.
//   - Static shell (CSS/manifest/icons + local exercise images): cache-first,
//     refreshed in the background so workouts render fully offline at the gym.
//   - Supabase REST GET: network-first, fall back to cache, fall back to empty array.
//   - Everything else: passthrough (default browser behavior).

// Keep this version number in sync with APP_VERSION in app.ts (shown in the
// home header) so a deploy visibly busts the cache AND the on-screen tag moves.
// v48 (Sep 24 2026): the redesign — no new shell files in P1-P8 (the archive
// and migration files are not shell), so only the cache name moves.
// v49 (Sep 25 2026): the visual pass + the two more machine readings.
// v50 (Sep 25 2026): capacity & cycle + the jump list (List sheet, step-list.js).
// v51 (Sep 25 2026): the Progress page in plain words — no new shell files, so
// only the cache name moves.
// v52.2 (Sep 26 2026): Round 2 Week 5 (A/B ride 10 → 12 min) + the swing fix —
// no new shell files, so only the cache name moves.
const VERSION = 'workout-tracker-v52.2';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './dist/app.js',
  // app.js imports these as separate ES modules — they MUST be cached too or
  // the app fails to boot offline, and stay network-first or visual/how-to
  // data updates never reach an installed PWA.
  './dist/exercise-howto.js',
  './dist/exercise-visuals.js',
  './dist/exercise-detail.js',
  // v49 · the progression engine (Sep 25 2026, shadow mode) — app.js imports
  // these too, so they need the same offline treatment as the other modules.
  './dist/ladders.js',
  './dist/progression.js',
  // v50 · cycle (Sep 25 2026) — capacity & cycle phase math, its own module
  // the same way progression.js is (app.js imports it).
  './dist/cycle.js',
  // v50 · jump list (Sep 25 2026) — the flat step list + completion tracking
  // behind the List sheet, its own module the same way cycle.js is.
  './dist/step-list.js',
  './manifest.webmanifest',
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
    caches.open(SHELL_CACHE).then((cache) =>
      // Individual adds so one missing asset (e.g. a not-yet-shipped image)
      // doesn't abort the whole install.
      Promise.all(
        SHELL_ASSETS.map((url) =>
          // cache: 'reload' skips the browser's HTTP cache, so a new install
          // precaches THIS build, not a copy up to 10 minutes old (v45).
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[SW] Failed to cache shell asset', url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
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
function isCodeRequest(url, request) {
  if (request.mode === 'navigate') return true;
  return (
    url.pathname.endsWith('/dist/app.js') ||
    url.pathname.endsWith('/dist/exercise-howto.js') ||
    url.pathname.endsWith('/dist/exercise-visuals.js') ||
    url.pathname.endsWith('/dist/exercise-detail.js') ||
    url.pathname.endsWith('/dist/ladders.js') ||
    url.pathname.endsWith('/dist/progression.js') ||
    url.pathname.endsWith('/dist/cycle.js') ||
    url.pathname.endsWith('/dist/step-list.js') ||
    url.pathname.endsWith('/index.html')
  );
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
    if (res && res.ok) cache.put(request, res.clone());
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
