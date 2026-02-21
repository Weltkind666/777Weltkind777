const CACHE='Weltkind-v2';
const ASSETS=['./', './index.html','./manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.url.includes('script.google.com')||e.request.url.includes('googleapis')){e.respondWith(fetch(e.request).catch(()=>new Response('Offline',{status:503})));return;}e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));return res;})));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(list=>{if(list.length>0)return list[0].focus();return clients.openWindow('./');})  );});
