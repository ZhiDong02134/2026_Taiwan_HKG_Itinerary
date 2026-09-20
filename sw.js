/*
  Offline service worker for Taiwan + Hong Kong 2026.

  Strategy: cache-first with background revalidation.
  A cached shell is served immediately for reliable offline use. When online,
  successful same-origin responses refresh the current cache in the background.
  The page's bypass check stores a detected HTML update under the canonical shell
  key and reloads automatically.

  Bump CACHE when older cache namespaces must be evicted.
*/
const CACHE_PREFIX = 'twhk-2026-';
const CACHE = `${CACHE_PREFIX}v19`;
const SHELL = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

// Every navigation is stored and retrieved under this one key. The app writes its current
// tab and day into the query string, so without normalising, `?tab=plan` and `?tab=today`
// become separate cache entries — the worker then reads one key and writes another, and the
// cached copy can never be replaced. That silently freezes an installed app on whatever
// version it first cached.
const SHELL_KEY = new URL('./index.html', self.location).href;
const keyFor = request =>
  request.mode === 'navigate' ? new Request(SHELL_KEY, { credentials: 'same-origin' }) : request;

// cache.add() rejects on a 404, so a single missing file in SHELL used to reject the
// whole Promise.all, fail waitUntil, and make the browser discard the worker entirely —
// leaving the app with no offline copy at all. Verified by accident: a deploy whose
// icons lagged its sw.js registered zero workers while still creating an empty cache.
// Only the shell document is worth failing over; every other entry is best-effort, so a
// forgotten icon degrades one asset instead of the entire offline story.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache => {
        await cache.add(SHELL[0]);
        await Promise.all(
          SHELL.slice(1).map(url => cache.add(url).catch(() => {}))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // The page's automatic version check needs a real network round trip. Persist that
  // response under the canonical shell key so its reload displays the detected version.
  if (new URL(request.url).searchParams.has('swBypass')) {
    event.respondWith((async () => {
      const response = await fetch(request);
      if (response && response.ok) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(SHELL_KEY, response.clone());
        } catch {}
      }
      return response;
    })());
    return;
  }

  // Leave cross-origin requests alone — this is what keeps the Frankfurter FX call going
  // straight to the network, so its own 6s abort and cached-rate fallback still govern it.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = keyFor(request);
    const cached = await cache.match(key);

    // The page owns automatic version checking and reload because a navigation client is not
    // guaranteed to be discoverable via clients.matchAll() until shortly after this resolves.
    const fromNetwork = fetch(request).then(async response => {
      if (response && response.ok) {
        // Storage pressure must not turn a valid network response into a failed request.
        try { await cache.put(key, response.clone()); } catch {}
      }
      return response;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(fromNetwork);
      return cached;
    }

    const network = await fromNetwork;
    if (network) return network;

    // Cold cache and no network: still answer a navigation with the app shell if we have it.
    if (request.mode === 'navigate') {
      const shell = await cache.match(SHELL_KEY);
      if (shell) return shell;
    }
    return Response.error();
  })());
});
