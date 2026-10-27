/* Service worker: ưu tiên mạng (để luôn nhận bản mới), mất mạng thì dùng bản đã lưu */
const CACHE = 'kinhthanh-v2';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html'])).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)).catch(() => {}); return res; })
      .catch(() => caches.match(r, { ignoreSearch:true }).then(m => m || caches.match('./index.html')))
  );
});
