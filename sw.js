/* Weltkind PWA Service Worker — v62 · оболочка кабинета */
const SW_VER = 62;
const CACHE = 'Weltkind-v62';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/iphone-add-key.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => /^Weltkind-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/script\.google\.com/.test(url.href)) return;
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    }))
  );
});
