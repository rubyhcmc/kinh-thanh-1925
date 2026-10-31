/* Service worker: luôn thử lấy bản MỚI NHẤT từ mạng trước, chỉ dùng bản lưu sẵn khi mất mạng. */
const CACHE = 'kt-20261027-d';
self.addEventListener('install', e => {
  self.skipWaiting();                                   // bản mới kích hoạt ngay, không chờ đóng hết tab
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html'])).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;              // GitHub API / raw không đi qua đây
  e.respondWith(
    fetch(r.url, { cache:'no-store' })
      .then(res => { if (res.ok){ const cp = res.clone(); caches.open(CACHE).then(c => c.put(r.url, cp)); } return res; })
      .catch(() => caches.match(r.url).then(m => m || caches.match('./index.html')))
  );
});
