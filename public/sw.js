/* ================================================================
   FC Superstar (v1.0.0) — L4 Static Asset Cache Service Worker
   Scoped with relative paths for GitHub Pages subpath hosting.

   Caching Policy:
   - Navigation / HTML: Network-First (instant pickup of new GitHub Pages deploys, offline fallback)
   - Content-Hashed Vite Assets (/assets/*): Cache-First (immutable bundles such as Phaser chunk)
   - Cross-origin fonts (jsDelivr Pretendard): Stale-While-Revalidate
   ================================================================ */

const APP_NAME = 'FC Superstar';
const APP_VERSION = '1.0.0';
const CACHE_PREFIX = 'fc-superstar-static';
const CACHE_NAME = `${CACHE_PREFIX}-v${APP_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Navigation / HTML -> Network-First with cache fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2. Same-origin hashed Vite assets (/assets/*) -> Cache-First
  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Pretendard font CDN -> Stale-While-Revalidate
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
