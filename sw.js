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
const VERSION = 'workout-tracker-v17';
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
  './manifest.webmanifest',
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
          cache.add(url).catch((err) => {
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
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
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
    const res = await fetch(request);
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
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
