// Service Worker - EduCenter
// Bump this version any time you deploy changes to force cache refresh.
const CACHE_VERSION = 'educenter-v1';
const CACHE_NAME = `${CACHE_VERSION}`;

// Core files needed for the app shell to work offline.
// CDN assets (Tailwind, Chart.js, PDF.js, Font Awesome, Google Fonts) are
// cached at runtime the first time they're fetched (see fetch handler),
// since caching them upfront here would fail install if the network hiccups.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './Icon.png'
];

// ---------- INSTALL ----------
// Pre-cache the app shell so the site can load offline immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE ----------
// Clean up old caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- FETCH ----------
// Strategy:
//  - Navigation requests (HTML): network-first, fall back to cache (so
//    updates show up when online, but the app still opens offline).
//  - Everything else (CSS/JS/fonts/images/CDN libs): cache-first, then
//    fetch from network and store for next time (stale-while-revalidate-ish).
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests; let POST/PUT/etc. (e.g. API calls to Groq) pass through untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept calls to the Groq API or other cross-origin API endpoints —
  // always go straight to the network for those.
  if (url.hostname.includes('groq.com')) {
    return;
  }

  // Navigation requests -> network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Everything else -> cache-first, then network + cache
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Only cache successful, basic or CORS-ok responses.
          if (!response || response.status !== 200) return response;

          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          // Optional: return a fallback for images if offline and not cached.
          if (request.destination === 'image') {
            return caches.match('./Icon.png');
          }
          return undefined;
        });
    })
  );
});
