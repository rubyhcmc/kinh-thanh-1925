const VER = 'kt-v1';
const SHELL = VER + '-shell';
const FONTS = VER + '-fonts';
const SCOPE = self.registration.scope;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll([SCOPE, SCOPE + 'index.html']))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => !k.startsWith(VER)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Đồng bộ GitHub: luôn đi thẳng mạng, không cache
  if (url.hostname === 'api.github.com' || url.hostname === 'raw.githubusercontent.com') return;

  // Google Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        } catch (err) { return hit || Response.error(); }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Trang chính: mạng trước (nhận bản mới), mất mạng thì dùng bản cache
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) caches.open(SHELL).then(c => c.put(SCOPE + 'index.html', res.clone()));
        return res;
      }).catch(async () => {
        const c = await caches.open(SHELL);
        return (await c.match(SCOPE + 'index.html')) || (await c.match(SCOPE)) || Response.error();
      })
    );
    return;
  }

  // Tài nguyên cùng nguồn khác: cache trước, cập nhật ngầm
  e.respondWith(
    caches.open(SHELL).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
