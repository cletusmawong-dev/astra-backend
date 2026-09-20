/* Astra service worker: offline app shell; API and artifacts always network-first. */
const CACHE = 'astra-v2';
const SHELL = ['/', '/app.css', '/js/core.js', '/js/screens.js', '/js/screens2.js', '/js/screens3.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/artifacts/') || u.pathname.startsWith('/sites/') || u.pathname.startsWith('/preview/')) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, cp));
        return r;
      }).catch(() => caches.match('/'))
    )
  );
});
