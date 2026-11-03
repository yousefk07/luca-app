// Offline support: the page is fetched network-first so updates show up right away,
// static assets are served from cache and refreshed in the background, and the cached page is the offline fallback.
const CACHE = 'mediator-dei-v2';
const SHELL = ['./', './index.html', './auth.js', './manifest.webmanifest', './icons/mediator-dei-192.png', './icons/mediator-dei-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin assets, Google Fonts and the pinned Supabase library: serve the cached copy at once
  // and refresh it in the background, so updates land on the next visit. Everything else (including
  // Supabase API calls) goes straight to the network.
  if (url.origin === location.origin || url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com' || url.host === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then(hit => {
        const fresh = fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        });
        if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
        return fresh;
      })
    );
  }
});
