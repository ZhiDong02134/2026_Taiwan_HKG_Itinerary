/* Offline-first application shell for Taiwan + Hong Kong 2026. */
const CACHE_PREFIX = 'twhk-field-';
const LEGACY_CACHE_PREFIXES = ['twhk-2026-'];
const CACHE = `${CACHE_PREFIX}e1d12fd3e6f08fed`;
const SHELL_KEY = new URL('./index.html', self.location).href;
const PRECACHE = [
  "./index.html",
  "./manifest.webmanifest",
  "./assets/app.css",
  "./assets/app.js",
  "./assets/runtime.js",
  "./assets/vendor/lucide.js",
  "./assets/vendor/alpine.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./assets/taipei.webp",
  "./assets/kaohsiung.webp",
  "./assets/hk.webp",
  "./screenshots/today-dark.png",
  "./screenshots/today-light.png",
  "./splash-1080x2340.png",
  "./splash-1125x2436.png",
  "./splash-1170x2532.png",
  "./splash-1179x2556.png",
  "./splash-1206x2622.png",
  "./splash-1242x2688.png",
  "./splash-1284x2778.png",
  "./splash-1290x2796.png",
  "./splash-1320x2868.png",
  "./splash-750x1334.png",
  "./splash-828x1792.png"
];
const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);

const canonicalNavigationKey = () => new Request(SHELL_KEY, { credentials: 'same-origin' });
const reloadRequest = url => new Request(url, { cache: 'reload', credentials: 'same-origin' });
const timeout = ms => new Promise(resolve => setTimeout(() => resolve(null), ms));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(reloadRequest('./index.html'));
    await Promise.all(
      PRECACHE.filter(url => url !== './index.html')
        .map(url => cache.add(reloadRequest(url)).catch(() => null))
    );
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key =>
        (key.startsWith(CACHE_PREFIX) && key !== CACHE) ||
        LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))
      ).map(key => caches.delete(key))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING' || event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => client.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow('./?tab=today');
  })());
});

async function networkFirstNavigation(event) {
  const cache = await caches.open(CACHE);
  const key = canonicalNavigationKey();
  const networkTask = (async () => {
    try {
      const response = await event.preloadResponse || await fetch(event.request);
      if (response?.ok) {
        try { await cache.put(key, response.clone()); } catch {}
        return response;
      }
    } catch {}
    return null;
  })();

  const quick = await Promise.race([networkTask, timeout(2600)]);
  if (quick) return quick;

  const cached = await cache.match(key) || await cache.match('./index.html');
  if (cached) {
    event.waitUntil(networkTask);
    return cached;
  }

  const eventual = await networkTask;
  return eventual || Response.error();
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then(async response => {
    if (response?.ok) {
      try { await cache.put(event.request, response.clone()); } catch {}
    }
    return response;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return await refresh || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.searchParams.has('swBypass')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (
    STATIC_DESTINATIONS.has(request.destination) ||
    PRECACHE.some(item => new URL(item, self.location).href === request.url)
  ) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
