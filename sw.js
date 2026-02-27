const CACHE = 'Weltkind-v5';
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
  // Google APIs и шрифты — всегда из сети, без кэша
  if (
    e.request.url.includes('script.google.com') ||
    e.request.url.includes('googleapis.com') ||
    e.request.url.includes('fonts.googleapis.com') ||
    e.request.url.includes('fonts.gstatic.com')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // index.html — ВСЕГДА сначала сеть, кэш только если нет интернета
  // Это исправляет зависание при входе: SW не отдаёт устаревшую версию
  const url = e.request.url;
  const isHtml = url.endsWith('/') || url.includes('index.html') ||
                 url === self.location.origin + '/' ||
                 url === self.registration.scope;
  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Обновляем кэш свежей версией
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Всё остальное (иконки, manifest, sw) — кэш первый, сеть как fallback
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

// ★ Главное — показ уведомления через SW (работает на мобильном!)
self.addEventListener('message', e => {
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = e.data;
    e.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: tag || 'weltkind',
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: './' }
      })
    );
  }

  // Фоновая проверка от periodicsync
  if (e.data?.type === 'bg_check') {
    checkSubBackground();
  }
});

// Клик по уведомлению — открыть/сфокусировать приложение
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const app = list.find(c => c.url.includes(self.location.origin));
      if (app) return app.focus();
      return clients.openWindow('./');
    })
  );
});

// Периодический фоновый синк (Android Chrome)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-subscription') e.waitUntil(checkSubBackground());
});

async function checkSubBackground() {
  // Читаем данные из кэша (сохранены через Cache API)
  try {
    const cache = await caches.open(CACHE);
    const resp = await cache.match('weltkind-sub-data');
    if (!resp) return;
    const sub = await resp.json();
    if (!sub?.date) return;

    const days = Math.ceil((new Date(sub.date) - Date.now()) / 86400000);
    if (days <= 3 && days >= -7) {
      const title = days <= 0 ? '🚨 Подписка истекла!' : `⚠️ Подписка истекает через ${days} дн.`;
      const body = days <= 0 ? 'Продлите подписку прямо сейчас!' : 'Осталось совсем немного — продлите подписку.';
      await self.registration.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'sub-expiry',
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { url: './' }
      });
    }
  } catch(e) {}
}
