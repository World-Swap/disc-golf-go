// Disc Golf Go — Service Worker
// Caches scorecard page and dependencies for offline-first experience.
// Does NOT cache API responses — those fall through to network.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `dgg-swc-${CACHE_VERSION}`;

// Assets to cache on install
const PRECACHE = [
  '/scorecard',
  '/app.css',
];

// ── Install: cache precache assets ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE).catch((err) => {
        console.warn('[SW] Precaching failed (offline install OK):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('dgg-swc-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for scorecard HTML (live data),
//          cache-first for static assets (CSS, fonts, scripts) ──────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  // API calls → always network, never cache
  if (url.pathname.startsWith('/api/')) return;

  // scorecard page → network-first with cache fallback
  if (url.pathname === '/scorecard' || url.pathname.endsWith('/scorecard.html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            // Return the scorecard from cache or a basic offline fallback
            return caches.match('/scorecard') || new Response(
              '<html><body><h1>Offline</h1><p>Scorecard unavailable offline. Open the app while online first.</p></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          })
        )
    );
    return;
  }

  // Static assets → cache-first
  if (
    url.pathname.match(/\/app\\.css$|\/js\/|\/fonts\/|\/images\/|\/favicon/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }
});