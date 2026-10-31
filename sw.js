/* Service worker: ưu tiên bản MỚI NHẤT từ mạng, nhưng KHÔNG bắt người dùng chờ mạng chậm.
   - Mở trang (navigate): chờ mạng tối đa 2,5 giây; quá hạn (hoặc mất mạng) thì mở ngay bản lưu sẵn để chữ hiện lập tức,
     trong khi bản mới vẫn tải ngầm và được lưu cho lần mở sau.
   - Tệp dữ liệu .json KHÔNG đi qua đây: dữ liệu Kinh Thánh nằm trong IndexedDB của app, không nằm trong Cache Storage.
   - Kho 'kt-store-v1' (kho dự phòng cũ của app) được GIỮ LẠI ở bản này để app chuyển dữ liệu sang IndexedDB rồi tự xóa.
   - Khóa lưu sẵn bỏ phần “?…”: mở trang với tham số khác nhau (?kho=…) vẫn dùng chung một bản lưu. */
const CACHE = 'kt-20261101-a';
const LEGACY_STORE = 'kt-store-v1';
const NAV_WAIT_MS = 2500;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== LEGACY_STORE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (/\.json$/i.test(u.pathname)) return;
  const key = u.origin + u.pathname;
  const net = fetch(r.url, { cache:'no-store' }).then(res => {
    if (res.status === 200){ const cp = res.clone(); caches.open(CACHE).then(c => c.put(key, cp)).catch(() => {}); }
    return res;
  });
  const fallback = () => caches.match(key).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : undefined));
  if (r.mode === 'navigate'){
    e.waitUntil(net.catch(() => {}));                    // giữ worker sống để bản mới tải xong và được lưu
    e.respondWith((async () => {
      const cached = await fallback();
      if (!cached) return net.catch(() => Response.error());          // chưa có bản lưu (lần đầu): đành chờ mạng
      return Promise.race([net.catch(() => cached), new Promise(res => setTimeout(() => res(cached), NAV_WAIT_MS))]);
    })());
    return;
  }
  e.respondWith(net.catch(() => fallback().then(m => m || Response.error())));
});
