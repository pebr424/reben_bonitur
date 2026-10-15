/* Service Worker der Reben-Bonitur: macht die App offline startfähig
   und merkt sich angesehene Kartenkacheln für den Einsatz ohne Netz. */
const APP_CACHE = 'rb-app-v2.0.0';
const TILE_CACHE = 'rb-tiles-v1';
const MAX_TILES = 3000;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon-192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = u => /(^|\.)tile\.openstreetmap\.org$|(^|\.)arcgisonline\.com$/.test(u.hostname);
let putsSinceTrim = 0;
async function trimTiles() {
  const c = await caches.open(TILE_CACHE), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isTile(url)) {                       // Kacheln: erst Cache, sonst Netz
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type !== 'opaque') {
        c.put(req, res.clone());
        if (++putsSinceTrim > 100) { putsSinceTrim = 0; trimTiles(); }
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || Response.error())));
    return;
  }

  if (req.mode === 'navigate') {           // App-Seite: erst Netz (für Updates), sonst Cache
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put('./index.html', copy)); }
      return res;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }

  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {   // Rest: erst Cache
    if (res.ok && res.type !== 'opaque') { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
