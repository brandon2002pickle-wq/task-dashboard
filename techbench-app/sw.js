// Tech Bench service worker: keeps the app itself available offline.
// Data never goes through here: jobs and photos live in IndexedDB and sync from the page.
const VERSION = 'tb-v4';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'report.js', 'parts.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'tb-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Google Fonts: cache as they're used
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('tb-fonts').then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => new Response('', { status: 504 }))));
    return;
  }
  if (url.origin !== location.origin) return;           // Supabase calls go straight to the network
  if (url.pathname.endsWith('/config.js')) {             // settings: fresh when online, cached when not
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === 'navigate') {                         // the app page: network first so updates land, cache when offline
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('index.html', cp)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  // app files: answer from cache at once, refresh the cache in the background for next launch
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; });
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
