// SokoLeo Service Worker v2
// Strategies:
//   • App shell (HTML, pwa.js)  → Cache-first, network fallback
//   • API calls (/api/*)        → Network-first, no cache
//   • Google Fonts              → Cache-first (stale-while-revalidate)

const CACHE_VERSION = 'sokoleo-v5';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const FONT_CACHE    = `${CACHE_VERSION}-fonts`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/admin.html',
  '/farmer.html',
  '/trader.html',
  '/market-prices.html',
  '/farm-services.html',
  '/route-planner.html',
  '/farmer-profile.html',
  '/manifest.json',
  '/pwa.js',
  '/logo.png',
  '/api-config.js',
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      // Cache what we can; ignore failures for pages that don't exist yet
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up stale caches ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('sokoleo-') && k !== SHELL_CACHE && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ──────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests that aren't fonts
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;

  // API calls: network-only (never cache live data)
  if (url.pathname.startsWith('/api/')) return;

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell: cache-first, fallback to network, then offline page
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Revalidate in background
        fetch(request).then(response => {
          if (response && response.status === 200) {
            caches.open(SHELL_CACHE).then(c => c.put(request, response.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        caches.open(SHELL_CACHE).then(c => c.put(request, response.clone()));
        return response;
      }).catch(() => {
        // Offline fallback: serve index for navigation requests
        if (request.destination === 'document') {
          return caches.match('/index.html') || caches.match('/');
        }
      });
    })
  );
});

// ── Push notifications (future) ───────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'SokoLeo', {
    body:  data.body  || 'You have a new update.',
    icon:  '/logo.png',
    badge: '/logo.png',
    data:  { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(target));
});
