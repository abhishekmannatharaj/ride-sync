const CACHE = 'ridesync-v1';

// Files to cache for offline shell
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install — cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first for socket.io and API calls, cache first for static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network-first for socket.io, APIs, and external CDNs that need fresh data
  if (
    url.pathname.startsWith('/socket.io') ||
    url.hostname === 'router.project-osrm.org' ||
    url.hostname === 'nominatim.openstreetmap.org' ||
    url.hostname === 'www.youtube.com' ||
    url.hostname === 'i.ytimg.com'
  ) {
    return; // Let browser handle these normally
  }

  // Cache-first for Leaflet and other static CDN assets
  if (
    url.hostname === 'unpkg.com' ||
    url.hostname === 'a.basemaps.cartocdn.com' ||
    url.hostname === 'b.basemaps.cartocdn.com' ||
    url.hostname === 'c.basemaps.cartocdn.com'
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // For app shell files — cache first, fall back to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
      return cached || networkFetch;
    })
  );
});