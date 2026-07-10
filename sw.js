const CACHE = 'Weltkind-v19';
const ASSETS = ['./', './index.html', './gas-embed.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

const GAS_EXEC = 'https://script.google.com/macros/s/AKfycbxfUBsBIMK6qULmIlqfxoOR9bWtjmc4uofYt3jWjGMd0Ql8kL4u32a7I9cgl22N3pJt8g/exec';

function isGasEmbedRequest(url) {
  return url.pathname.endsWith('/gas-embed.html') || url.pathname.endsWith('gas-embed.html');
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 15000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGasHtml(target) {
  const res = await fetchWithTimeout(target, { redirect: 'follow', credentials: 'omit', cache: 'no-store' }, 15000);
  if (!res.ok) throw new Error('gas_status_' + res.status);
  const html = await res.text();
  if (!html || html.length < 50) throw new Error('gas_empty');
  return html;
}

function prepareGasHtml(html) {
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, '<head$1><base href="https://script.google.com/">');
  }
  return html;
}

async function proxyGas(request) {
  const url = new URL(request.url);
  const target = GAS_EXEC + url.search;
  let html;
  try {
    html = await fetchGasHtml(target);
  } catch (e) {
    const msg = 'Не удалось загрузить панель подписки. Проверьте интернет или включите VPN.';
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;' +
      'background:#f5f7fa;color:#333;text-align:center}</style></head><body><div><p>' + msg + '</p></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }
  return new Response(prepareGasHtml(html), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

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
  const url = new URL(e.request.url);

  if (
    e.request.url.includes('script.google.com') ||
    e.request.url.includes('googleusercontent.com') ||
    e.request.url.includes('googleapis.com') ||
    e.request.url.includes('fonts.googleapis.com') ||
    e.request.url.includes('fonts.gstatic.com') ||
    e.request.url.includes('allorigins.win')
  ) {
    return;
  }

  if (isGasEmbedRequest(url)) {
    e.respondWith(proxyGas(e.request));
    return;
  }

  const isHtml = url.pathname.endsWith('/') || url.pathname.includes('index.html') || url === self.registration.scope;
  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

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
    const resp = await cache.match('weltkind-sub-data');
    if (!resp) return;
    const sub = await resp.json();
    if (!sub?.date) return;

    const days = Math.ceil((new Date(sub.date) - Date.now()) / 86400000);
    if (days > 3 || days < -7) return;

    if (sub.lastNotifAt && Date.now() - sub.lastNotifAt < 23 * 3600 * 1000) return;

    const title = days <= 0 ? '🚨 Подписка Weltkind истекла!' : `⚠️ Подписка истекает через ${days} дн.`;
    const body  = days <= 0 ? 'Продлите подписку прямо сейчас!' : 'Осталось совсем немного — зайдите и продлите.';

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
    await cache.put('weltkind-sub-data', new Response(JSON.stringify(sub)));

  } catch(e) {}
}