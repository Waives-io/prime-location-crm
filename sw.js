// Minimal service worker: makes the app installable and opens the last loaded shell offline.
// Network first, so a new deploy is always picked up. Supabase / map requests are never cached.
// Other apps on the same origin (the demo at /nadlan-demo/) keep their caches: only pl-shell-* is cleaned.
const CACHE = 'pl-shell-v1';
const SHELL = ['./', './index.html', './manifest.json', './assets/logo.png', './assets/pin.png',
  './assets/photo-building.jpg', './assets/photo-warehouse.jpg', './icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('pl-shell-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
