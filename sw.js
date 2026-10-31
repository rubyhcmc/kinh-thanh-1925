/* Service worker: ưu tiên bản MỚI NHẤT từ mạng, nhưng KHÔNG bắt người dùng chờ mạng chậm, và luôn mở được khi mất mạng.
   - Cài đặt (install): trang chính PHẢI lưu được thì bản này mới được cài. Nếu lưu lỗi (mạng chập chờn) thì bản cũ (và kho lưu cũ) giữ nguyên,
     lần mở sau trình duyệt tự thử lại. Nhờ vậy không bao giờ có chuyện “đã cài mà kho lưu trống”.
   - Mở trang (navigate): chờ mạng tối đa 2,5 giây; quá hạn hoặc mất mạng thì mở ngay bản đã lưu; bản mới vẫn tải ngầm cho lần sau.
   - Tệp dữ liệu .json KHÔNG đi qua đây: Kinh Thánh nằm trong IndexedDB của app, không nằm trong Cache Storage.
   - Kho 'kt-store-v1' (kho dự phòng cũ của app) được GIỮ LẠI để app chuyển dữ liệu sang IndexedDB rồi tự xóa.
   - Khóa lưu sẵn bỏ phần “?…”: mở trang với tham số khác nhau (?kho=…) vẫn dùng chung một bản lưu. */
const CACHE = 'kt-20261101-b';
const LEGACY_STORE = 'kt-store-v1';
const NAV_WAIT_MS = 2500;
const ESSENTIAL = ['./', './index.html'];
const OPTIONAL = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
async function cacheShell(){
  const c = await caches.open(CACHE);
  await Promise.all(ESSENTIAL.map(u => c.add(new Request(u, { cache:'reload' }))));        // lỗi → ném ra → không cài
  await Promise.all(OPTIONAL.map(u => c.add(new Request(u, { cache:'reload' })).catch(() => {})));
}
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(cacheShell());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE && k !== LEGACY_STORE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {                  // trang yêu cầu lưu lại vỏ app (khi kiểm tra thấy chưa có)
  if (e.data === 'cache-shell') e.waitUntil(cacheShell().catch(() => {}));
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
    e.waitUntil(net.catch(() => {}));
    e.respondWith((async () => {
      const cached = await fallback();
      if (!cached) return net.catch(() => Response.error());
      return Promise.race([net.catch(() => cached), new Promise(res => setTimeout(() => res(cached), NAV_WAIT_MS))]);
    })());
    return;
  }
  e.respondWith(net.catch(() => fallback().then(m => m || Response.error())));
});
