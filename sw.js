const C = 'geoplot-v2', RT = 'geoplot-runtime';
const CORE = ['./', 'index.html', 'core.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== RT).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  // the app itself: network first so updates arrive, cached copy when offline
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  // map tiles, fonts and the on-phone text reader: cache first, keep for offline use
  if (/arcgisonline|openstreetmap|fonts\.(googleapis|gstatic)|cdn\.jsdelivr\.net|tessdata|projectnaptha/.test(u.host)) {
    e.respondWith(caches.open(RT).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }))));
  }
});
