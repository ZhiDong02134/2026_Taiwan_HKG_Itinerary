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
const CACHE = 'twhk-2026-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll rejects the whole install if any single entry 404s; tolerate that so a
      // missing optional icon can never prevent the page itself from being cached.
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Leave cross-origin requests alone — this is what keeps the Frankfurter FX call going
  // straight to the network, so its own 6s abort and cached-rate fallback still govern it.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });

    const fromNetwork = fetch(request).then(async response => {
      if (response && response.ok) {
        const fresh = response.clone();
        // Compare validators rather than bodies: the document is ~930 KB and this runs
        // on every navigation.
        const tag = r => r.headers.get('ETag') || r.headers.get('Last-Modified');
        if (cached && request.mode === 'navigate' && tag(cached) && tag(response) && tag(cached) !== tag(response)) {
          const clients = await self.clients.matchAll({ type: 'window' });
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        }
        await cache.put(request, fresh);
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
      const shell = await cache.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
    }
    return Response.error();
  })());
});
