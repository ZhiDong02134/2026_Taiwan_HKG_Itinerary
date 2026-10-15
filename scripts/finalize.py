#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / 'manifest.webmanifest'

manifest = json.loads(MANIFEST_PATH.read_text())
manifest['screenshots'] = [
    {
        'src': './screenshots/today-dark.png',
        'sizes': '390x844',
        'type': 'image/png',
        'form_factor': 'narrow',
        'label': 'Today view in dark appearance'
    },
    {
        'src': './screenshots/today-light.png',
        'sizes': '390x844',
        'type': 'image/png',
        'form_factor': 'narrow',
        'label': 'Today view in light appearance'
    }
]
MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

precache_paths = [
    'index.html',
    'manifest.webmanifest',
    'assets/app.css',
    'assets/app.js',
    'assets/runtime.js',
    'assets/vendor/lucide.js',
    'assets/vendor/alpine.js',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-192.png',
    'icon-maskable-512.png',
    'apple-touch-icon.png',
    'assets/taipei.webp',
    'assets/kaohsiung.webp',
    'assets/hk.webp',
    'screenshots/today-dark.png',
    'screenshots/today-light.png',
]
precache_paths += sorted(path.name for path in ROOT.glob('splash-*.png'))

missing = [name for name in precache_paths if not (ROOT / name).is_file()]
if missing:
    raise SystemExit(f'Missing precache assets: {missing}')

hasher = hashlib.sha256()
for name in sorted(precache_paths):
    hasher.update(name.encode('utf-8'))
    hasher.update(b'\0')
    hasher.update((ROOT / name).read_bytes())
    hasher.update(b'\0')
build_hash = hasher.hexdigest()[:16]
precache_urls = ['./' + name for name in precache_paths]

sw = f'''/* Offline-first application shell for Taiwan + Hong Kong 2026. */
const CACHE_PREFIX = 'twhk-field-';
const LEGACY_CACHE_PREFIXES = ['twhk-2026-'];
const CACHE = `${{CACHE_PREFIX}}{build_hash}`;
const SHELL_KEY = new URL('./index.html', self.location).href;
const PRECACHE = {json.dumps(precache_urls, ensure_ascii=False, indent=2)};
const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);

const canonicalNavigationKey = () => new Request(SHELL_KEY, {{ credentials: 'same-origin' }});
const reloadRequest = url => new Request(url, {{ cache: 'reload', credentials: 'same-origin' }});
const timeout = ms => new Promise(resolve => setTimeout(() => resolve(null), ms));

self.addEventListener('install', event => {{
  event.waitUntil((async () => {{
    const cache = await caches.open(CACHE);
    await cache.add(reloadRequest('./index.html'));
    await Promise.all(
      PRECACHE.filter(url => url !== './index.html')
        .map(url => cache.add(reloadRequest(url)).catch(() => null))
    );
    if (!self.registration.active) await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', event => {{
  event.waitUntil((async () => {{
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key =>
        (key.startsWith(CACHE_PREFIX) && key !== CACHE) ||
        LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))
      ).map(key => caches.delete(key))
    );
    if (self.registration.navigationPreload) {{
      try {{ await self.registration.navigationPreload.enable(); }} catch {{}}
    }}
    await self.clients.claim();
  }})());
}});

self.addEventListener('message', event => {{
  if (event.data?.type === 'SKIP_WAITING' || event.data === 'SKIP_WAITING') self.skipWaiting();
}});

self.addEventListener('notificationclick', event => {{
  event.notification.close();
  event.waitUntil((async () => {{
    const clients = await self.clients.matchAll({{ type: 'window', includeUncontrolled: true }});
    const existing = clients.find(client => client.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow('./?tab=today');
  }})());
}});

async function networkFirstNavigation(event) {{
  const cache = await caches.open(CACHE);
  const key = canonicalNavigationKey();
  const networkTask = (async () => {{
    try {{
      const response = await event.preloadResponse || await fetch(event.request);
      if (response?.ok) {{
        try {{ await cache.put(key, response.clone()); }} catch {{}}
        return response;
      }}
    }} catch {{}}
    return null;
  }})();

  const quick = await Promise.race([networkTask, timeout(2600)]);
  if (quick) return quick;

  const cached = await cache.match(key) || await cache.match('./index.html');
  if (cached) {{
    event.waitUntil(networkTask);
    return cached;
  }}

  const eventual = await networkTask;
  return eventual || Response.error();
}}

async function staleWhileRevalidate(event) {{
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then(async response => {{
    if (response?.ok) {{
      try {{ await cache.put(event.request, response.clone()); }} catch {{}}
    }}
    return response;
  }}).catch(() => null);

  if (cached) {{
    event.waitUntil(refresh);
    return cached;
  }}
  return await refresh || Response.error();
}}

self.addEventListener('fetch', event => {{
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.searchParams.has('swBypass')) {{
    event.respondWith(fetch(request, {{ cache: 'no-store' }}));
    return;
  }}

  if (request.mode === 'navigate') {{
    event.respondWith(networkFirstNavigation(event));
    return;
  }}

  if (
    STATIC_DESTINATIONS.has(request.destination) ||
    PRECACHE.some(item => new URL(item, self.location).href === request.url)
  ) {{
    event.respondWith(staleWhileRevalidate(event));
  }}
}});
'''
(ROOT / 'sw.js').write_text(sw)
print(f'Finalized manifest and service worker cache {build_hash}.')
