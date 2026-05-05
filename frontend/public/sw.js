// Service Worker — myhomeusb
// Strategy:
//   • index.html / navigations → ALWAYS network (so users get latest chunk hashes after deploy)
//   • Hashed static assets (.js / .css with content-hash in filename) → cache-first (safe; URL changes on deploy)
//   • API requests → never intercepted (let app handle auth, errors, retries)
const CACHE_NAME = 'myhomeusb-v4';

// Install - take over immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate - clean ALL old caches (any name) and claim clients now
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Helper: detect content-hashed assets (CRA produces /static/js/main.HASH.js etc.)
function isHashedStaticAsset(url) {
  return /\/static\/(js|css|media)\//.test(url);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept non-GET or API
  if (request.method !== 'GET' || request.url.includes('/api/')) return;

  const url = new URL(request.url);

  // Always-fresh: HTML navigations + index.html + sw.js + manifest
  const isNavigation = request.mode === 'navigate' || request.destination === 'document';
  const isFreshAlways = isNavigation
    || url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname === '/manifest.json'
    || url.pathname === '/sw.js';

  if (isFreshAlways) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html').then((c) => c || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Hashed static assets: cache-first, then network
  if (isHashedStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});
