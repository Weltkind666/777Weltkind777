/* Weltkind PWA Service Worker — v56 */
const SW_VER = 56;
const CACHE = 'Weltkind-v56';
const SUB_KEY = 'weltkind-sub-data';
const SUB_CACHE = 'Weltkind-user-data';
const ASSETS = [
  './',
  './index.html',
  './account.js',
  './manifest.json',
  './version.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

function isBypass(url) {
  return /script\.google\.com|googleusercontent\.com|googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|allorigins\.win/i.test(url);
}

async function navigationFetch(req) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try { return await fetch(req, { cache:'no-cache', signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

function notifyHtmlUpdated() {
  self.clients.matchAll({ type: 'window' }).then((list) => {
    list.forEach((c) => {
      try { c.postMessage({ type: 'HTML_UPDATED', version: SW_VER }); } catch (err) {}
    });
  });
}

async function maybeNotifyHtmlChange(cached, fresh) {
  if (!cached || !fresh) return;
  try {
    const [oldText, newText] = await Promise.all([cached.clone().text(), fresh.clone().text()]);
    if (oldText !== newText) notifyHtmlUpdated();
  } catch (err) {}
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const target = await caches.open(SUB_CACHE);
      const saved = await target.match(SUB_KEY) || await caches.match(SUB_KEY);
      if (saved) await (await caches.open(SUB_CACHE)).put(SUB_KEY,saved);
    })().then(() => caches.keys()).then((keys) =>
      Promise.all(keys.filter((k) => /^Weltkind-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() =>
      self.clients.matchAll({ type: 'window' }).then((list) => {
        list.forEach((c) => {
          try { c.postMessage({ type: 'SW_READY', version: SW_VER }); } catch (err) {}
        });
      })
    )
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (isBypass(req.url)) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('version.json')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('./version.json'))
    );
    return;
  }

  const isHtml =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html');

  if (isHtml) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html') || await cache.match('./');
      const net = navigationFetch(req).then((res) => {
        if (!res || !res.ok) throw new Error('Navigation unavailable');
        cache.put('./index.html', res.clone()).catch(() => {});
        maybeNotifyHtmlChange(cached, res).catch(() => {});
        return res;
      });
      if (cached) {
        net.catch(() => {});
        return cached;
      }
      return net.catch(async () => {
        const fallback = await cache.match('./index.html') || await cache.match('./');
        if (fallback) return fallback;
        throw new Error('offline');
      });
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    });
    if (cached) {
      net.catch(() => {});
      return cached;
    }
    return net.catch(() => cached);
  })());
});

function daysLeftCeil_(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - Date.now()) / 86400000);
}

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
    data: { url: './?source=pwa#renew', type: 'expiry', milestone: content.milestone }
  });
}

self.addEventListener('message', (e) => {
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

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const raw = (e.notification.data && e.notification.data.url) || './?source=pwa#renew';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          return c.focus().then(() => {
            try { c.postMessage({ type: 'open_renew' }); } catch (err) {}
          });
        }
      }
      const abs = raw.indexOf('http') === 0 ? raw : new URL(raw, self.location.origin).href;
      return clients.openWindow(abs);
    })
  );
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'check-subscription') e.waitUntil(checkSubBackground());
});

async function checkSubBackground() {
  try {
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
    const entries = Object.keys(map).sort((a, b) => (map[b] || 0) - (map[a] || 0));
    const trimmed = {};
    for (let i = 0; i < Math.min(20, entries.length); i++) trimmed[entries[i]] = map[entries[i]];
    sub.pwaNotifs = trimmed;
    sub.lastNotifAt = Date.now();
    sub.lastNotifMilestone = content.milestone;

    const cache = await caches.open(SUB_CACHE);
    await cache.put(SUB_KEY, new Response(JSON.stringify(sub)));
  } catch (e) {}
}
