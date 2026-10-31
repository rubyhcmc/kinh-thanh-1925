/* Service worker: MỞ NGAY từ bản đã lưu (không chờ mạng – mạng chập chờn/Wi-Fi không ra Internet trên iPhone có thể treo rất lâu), cập nhật bản mới ngầm cho lần mở sau.
   Kho dữ liệu 'kt-store-v1' (lưu dự phòng) và 'kt-data-v1' (bản gốc dữ liệu Kinh Thánh) KHÔNG bị xóa ở đây. */
const CACHE = 'kt-20261101-aa5', KEEP = ['kt-store-v1', 'kt-data-v1', 'kt-fallback-v1'];
async function cacheShell(){
  const c = await caches.open(CACHE);
  await Promise.all(['./', './index.html'].map(u => c.add(new Request(u, { cache:'reload' }))));     // lỗi → không cài → lần mở sau thử lại
  await Promise.all(['./manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'].map(u => c.add(new Request(u, { cache:'reload' })).catch(() => {})));
}
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(cacheShell()); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE && !KEEP.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'cache-shell') e.waitUntil(cacheShell().catch(() => {})); });
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
  const cachedP = caches.match(key).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : undefined));
  e.waitUntil(net.catch(() => {}));
  e.respondWith(cachedP.then(m => m || net).catch(() => net).catch(() => Response.error()));
});
