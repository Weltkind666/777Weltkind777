/* Weltkind PWA Service Worker — v23 */
const CACHE = 'Weltkind-v23';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './version.json'
];
const SUB_KEY = 'weltkind-sub-data';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => caches.open(CACHE).then(c =>
        Promise.all(ASSETS.map(u => c.add(u).catch(() => {})))
      ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API / CDN / Google — never cache
  if (
    /script\.google\.com|googleusercontent\.com|googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|allorigins\.win/i.test(e.request.url)
  ) {
    return;
  }

  // version.json — always network (for update checks)
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => caches.match('./version.json'))
    );
    return;
  }

  const isHtml =
    e.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html');

  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

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
  if (e.data?.type === 'bg_check') checkSubBackground();
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

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

self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-subscription') e.waitUntil(checkSubBackground());
});

async function checkSubBackground() {
  try {
    const cache = await caches.open(CACHE);
    const resp = await cache.match(SUB_KEY);
    if (!resp) return;
    const sub = await resp.json();
    if (!sub?.date) return;

    const days = Math.ceil((new Date(sub.date) - Date.now()) / 86400000);
    if (days > 3 || days < -7) return;
    if (sub.lastNotifAt && Date.now() - sub.lastNotifAt < 23 * 3600 * 1000) return;

    const title = days <= 0 ? '🚨 Подписка Weltkind истекла!' : `⚠️ Подписка истекает через ${days} дн.`;
    const body = days <= 0 ? 'Продлите подписку прямо сейчас!' : 'Осталось немного — зайдите и продлите.';

    await self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'sub-expiry',
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { url: './' }
    });

    sub.lastNotifAt = Date.now();
    await cache.put(SUB_KEY, new Response(JSON.stringify(sub)));
  } catch (e) {}
}
