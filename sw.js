// Offline support: cache the app shell, serve it when the network is down.
const CACHE = 'ogonz-v4';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'src/main.js', 'src/sim.js', 'src/core.js', 'src/life.js', 'src/fun.js', 'src/render.js', 'src/pixelfont.js', 'src/data.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ogonz-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so updates show up right away; cache when offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
