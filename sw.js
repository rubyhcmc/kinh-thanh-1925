/* Service worker: luôn thử lấy bản MỚI NHẤT từ mạng trước, chỉ dùng bản lưu sẵn khi mất mạng.
   - Tệp dữ liệu .json KHÔNG đi qua đây: dữ liệu Kinh Thánh đã nằm trong bộ nhớ của app (IndexedDB), và app tải kèm tham số
     thời gian (?_=…) để lấy bản mới nhất; nếu lưu từng lần tải thì bộ nhớ đầy nhanh (mỗi bản vài MB).
   - Khóa lưu sẵn bỏ phần “?…”: mở trang với tham số khác nhau (?kho=…) vẫn dùng chung một bản lưu. */
const CACHE = 'kt-20261031-e';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  self.skipWaiting();                                   // bản mới kích hoạt ngay, không chờ đóng hết tab
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).catch(() => {}));   // thiếu một tệp không làm hỏng cả gói
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;              // GitHub API / raw / Google Fonts không đi qua đây
  if (/\.json$/i.test(u.pathname)) return;               // dữ liệu Kinh Thánh: đi thẳng ra mạng, không lưu từng lần tải
  const key = u.origin + u.pathname;                     // bỏ ?tham-số khi lưu / tra cứu
  e.respondWith(
    fetch(r.url, { cache:'no-store' })
      .then(res => { if (res.status === 200){ const cp = res.clone(); caches.open(CACHE).then(c => c.put(key, cp)).catch(() => {}); } return res; })
      .catch(() => caches.match(key).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : undefined)).then(m => m || Response.error()))
  );
});
