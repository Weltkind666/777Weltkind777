const CACHE_NAME = 'planzayavok-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Внешние запросы — только через сеть (GAS, Firebase, CDN)
  if (
    url.includes('script.google.com') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('firebaseapp.com') ||
    url.includes('firebasejs') ||
    url.includes('fonts.googleapis') ||
    url.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Локальные ресурсы — сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});

// Клик по push-уведомлению — фокус на открытое окно или открыть новое
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('planzayavok-pwa') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('https://weltkind666.github.io/planzayavok-pwa/');
    })
  );
});
