const CACHE = 'Weltkind-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Google Apps Script и внешние API — только сеть
  if (
    e.request.url.includes('script.google.com') ||
    e.request.url.includes('googleapis.com') ||
    e.request.url.includes('ipapi.co') ||
    e.request.url.includes('fonts.googleapis.com') ||
    e.request.url.includes('fonts.gstatic.com')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Для остального — cache-first, потом сеть
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});

// Periodic background sync (Android Chrome)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-subscription') {
    e.waitUntil(checkSubInBackground());
  }
});

async function checkSubInBackground() {
  const cache = await caches.open(CACHE);
  // Просто оповещаем клиентов что нужно проверить подписку
  const all = await clients.matchAll();
  all.forEach(c => c.postMessage({ type: 'bg_check' }));
}
