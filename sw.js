/*
  Offline service worker for the Taiwan & Hong Kong '26 travel companion.

  Strategy: cache-first with background revalidation.
  A travel companion must never show an error page on a subway platform, so a cached
  copy is always served immediately. When there is signal, the network copy is fetched
  in the background and stored for next time — so an update appears one visit later,
  which is the right trade against ever showing nothing.

  Bump CACHE below after changing index.html if you want to force old caches to be
  dropped; routine content edits are picked up automatically via ETag comparison.
*/
const CACHE_PREFIX = 'twhk-2026-';
const CACHE = `${CACHE_PREFIX}v9`;
const SHELL = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// Every navigation is stored and retrieved under this one key. The app writes its current
// tab and day into the query string, so without normalising, `?tab=plan` and `?tab=today`
// become separate cache entries — the worker then reads one key and writes another, and the
// cached copy can never be replaced. That silently freezes an installed app on whatever
// version it first cached.
const SHELL_KEY = new URL('./index.html', self.location).href;
const keyFor = request =>
  request.mode === 'navigate' ? new Request(SHELL_KEY, { credentials: 'same-origin' }) : request;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url))))
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

  // The page's update check needs a real network round trip. Persist that response under
  // the canonical shell key so the prompt's single reload displays the version it detected.
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

    // Update notification is handled entirely on the page side (comparing
    // document.lastModified against a fresh fetch's own Last-Modified header) rather than
    // from here. An earlier version tried to postMessage the client the moment an ETag
    // mismatch was detected during this very fetch, but the client for a 'navigate'
    // request is not guaranteed discoverable via clients.matchAll() until shortly after
    // this event resolves — a real race, not a theoretical one. This handler's only job
    // now is what it is good at: keep the cache warm.
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
