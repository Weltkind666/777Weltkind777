/* Weltkind PWA Service Worker — v63 · оболочка + уведомления */
const SW_VER = 64;
const CACHE = 'Weltkind-v64';
const SUB_KEY = 'weltkind-sub-data';
const SUB_CACHE = 'Weltkind-user-data';
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
      Promise.all(keys.filter((k) => /^Weltkind-v\d+$/.test(k) && k !== CACHE && k !== SUB_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function daysLeftCeil_(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - Date.now()) / 86400000);
}
function expiryNotifContent_(days) {
  if (days === null || days > 3) return null;
  if (days <= 0) return { title: 'Подписка Weltkind закончилась', body: 'Откройте кабинет и продлите подписку.', milestone: 0, tag: 'w-exp-0' };
  if (days === 1) return { title: 'Weltkind — остался 1 день', body: 'Срочно продлите подписку.', milestone: 1, tag: 'w-exp-1' };
  if (days === 2) return { title: 'Weltkind — осталось 2 дня', body: 'Не забудьте продлить.', milestone: 2, tag: 'w-exp-2' };
  return { title: 'Weltkind — осталось 3 дня', body: 'Подписка скоро закончится.', milestone: 3, tag: 'w-exp-3' };
}

async function loadSub_() {
  try {
    const cache = await caches.open(SUB_CACHE);
    const resp = await cache.match(SUB_KEY);
    if (resp) return await resp.json();
  } catch (e) {}
  return null;
}
async function saveSub_(sub) {
  const cache = await caches.open(SUB_CACHE);
  await cache.put(SUB_KEY, new Response(JSON.stringify(sub)));
}
async function checkSubBackground() {
  try {
    const sub = await loadSub_();
    if (!sub || !sub.date) return;
    const days = daysLeftCeil_(sub.date);
    const content = expiryNotifContent_(days);
    if (!content) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = String(sub.date) + ':m' + content.milestone + ':' + today;
    const map = sub.pwaNotifs || {};
    if (map[key]) return;
    await self.registration.showNotification(content.title, {
      body: content.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: content.tag,
      renotify: true,
      requireInteraction: content.milestone <= 1,
      data: { url: './?source=pwa', type: 'expiry' }
    });
    map[key] = Date.now();
    sub.pwaNotifs = map;
    await saveSub_(sub);
  } catch (e) {}
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'bg_check') e.waitUntil(checkSubBackground());
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    const d = e.data;
    e.waitUntil(self.registration.showNotification(d.title || 'Weltkind', {
      body: d.body || '',
      icon: './icons/icon-192.png',
      tag: d.tag || 'weltkind',
      renotify: true,
      requireInteraction: !!d.requireInteraction,
      data: d.data || { url: './' }
    }));
  }
});
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'check-subscription') e.waitUntil(checkSubBackground());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].url.includes(self.location.origin) && list[i].focus) return list[i].focus();
      }
      return self.clients.openWindow('./?source=pwa');
    })
  );
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
