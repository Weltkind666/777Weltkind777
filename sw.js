/* Weltkind PWA Service Worker — v24 */
const CACHE = 'Weltkind-v24';
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

  if (
    /script\.google\.com|googleusercontent\.com|googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|allorigins\.win/i.test(e.request.url)
  ) {
    return;
  }

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

function daysLeftCeil_(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - Date.now()) / 86400000);
}

/** Тексты как в ботах: 3 / 2 / 1 день и «закончилась». */
function expiryNotifContent_(days) {
  if (days === null || days > 3) return null;
  if (days <= 0) {
    return {
      title: '❌ Подписка Weltkind закончилась!',
      body: 'Доступ приостановлен. Откройте приложение и продлите подписку.',
      milestone: 0,
      tag: 'w-exp-0'
    };
  }
  if (days === 1) {
    return {
      title: '🔴 Weltkind — остался 1 день!',
      body: 'Срочно продлите подписку. Откройте приложение → выберите тариф.',
      milestone: 1,
      tag: 'w-exp-1'
    };
  }
  if (days === 2) {
    return {
      title: '🟠 Weltkind — осталось 2 дня',
      body: 'Не забудьте продлить. Зайдите в приложение и оплатите.',
      milestone: 2,
      tag: 'w-exp-2'
    };
  }
  if (days === 3) {
    return {
      title: '🟡 Weltkind — осталось 3 дня',
      body: 'Подписка скоро закончится. Продлите заранее в приложении.',
      milestone: 3,
      tag: 'w-exp-3'
    };
  }
  return null;
}

function notifKey_(subDate, content, days) {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (days <= 0) return String(subDate) + ':m0:' + todayKey;
  return String(subDate) + ':m' + content.milestone;
}

async function showExpiryNotification_(content) {
  await self.registration.showNotification(content.title, {
    body: content.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: content.tag,
    renotify: true,
    requireInteraction: content.milestone <= 1,
    vibrate: content.milestone === 0
      ? [300, 100, 300, 100, 300]
      : [200, 100, 200],
    data: { url: './#renew', type: 'expiry', milestone: content.milestone }
  });
}

self.addEventListener('message', e => {
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, requireInteraction, data } = e.data;
    e.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: tag || 'weltkind',
        renotify: true,
        requireInteraction: !!requireInteraction,
        vibrate: [200, 100, 200],
        data: data || { url: './' }
      })
    );
  }
  if (e.data?.type === 'bg_check') {
    e.waitUntil(checkSubBackground());
  }
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const raw = (e.notification.data && e.notification.data.url) || './';
  const target = raw.indexOf('#') >= 0 ? raw : './#renew';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          return c.focus().then(() => {
            try { c.postMessage({ type: 'open_renew' }); } catch (err) {}
          });
        }
      }
      return clients.openWindow(target.indexOf('http') === 0 ? target : new URL(target, self.location.origin).href);
    })
  );
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-subscription') e.waitUntil(checkSubBackground());
});

/** Фон: 3 / 2 / 1 день и ежедневно после окончания — как боты. */
async function checkSubBackground() {
  try {
    // Ищем кэш подписки в текущем или старых CACHE-именах
    let sub = null;
    const keys = await caches.keys();
    for (let i = 0; i < keys.length; i++) {
      try {
        const cache = await caches.open(keys[i]);
        const resp = await cache.match(SUB_KEY);
        if (resp) {
          sub = await resp.json();
          if (sub && sub.date) break;
        }
      } catch (err) {}
    }
    if (!sub || !sub.date) return;

    const days = daysLeftCeil_(sub.date);
    const content = expiryNotifContent_(days);
    if (!content) return;

    const map = sub.pwaNotifs || {};
    const key = notifKey_(sub.date, content, days);
    if (map[key]) return;

    await showExpiryNotification_(content);

    map[key] = Date.now();
    // чистим старые ключи (оставляем последние 20)
    const entries = Object.keys(map).sort((a, b) => (map[b] || 0) - (map[a] || 0));
    const trimmed = {};
    for (let i = 0; i < Math.min(20, entries.length); i++) trimmed[entries[i]] = map[entries[i]];
    sub.pwaNotifs = trimmed;
    sub.lastNotifAt = Date.now();
    sub.lastNotifMilestone = content.milestone;

    const cache = await caches.open(CACHE);
    await cache.put(SUB_KEY, new Response(JSON.stringify(sub)));
  } catch (e) {}
}
