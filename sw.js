/**
 * Cloudflare Worker – cầu nối an toàn giữa app Kinh Thánh và GitHub.
 * Token GitHub nằm ở ĐÂY (biến bí mật của Worker), KHÔNG nằm trong app → người dùng không thấy, không phải nhập gì.
 *
 * Mỗi người dùng có một "mã đồng bộ" ngẫu nhiên do app tự tạo; dữ liệu của họ nằm ở  users/<mã>.json  trong kho GitHub.
 *   GET  /u/<mã>  → { sha, data }            (404 nếu chưa có bản sao lưu)
 *   PUT  /u/<mã>  body { base, data }         base = sha lần cuối app biết ('' nếu chưa có) → { sha }; 409 nếu máy khác đã ghi trước
 *
 * Cài đặt (Cloudflare → Workers & Pages → Create Worker → dán file này → Deploy), rồi vào Settings → Variables:
 *   GITHUB_TOKEN   (Secret)  PAT fine-grained, chỉ cho đúng 1 kho, quyền Contents: Read and write
 *   REPO           (Text)    ví dụ  ten-nguoi-dung/kinh-thanh-userdata   (nên là kho RIÊNG TƯ)
 *   ALLOWED_ORIGIN (Text)    địa chỉ web của app, ví dụ  https://ten.github.io   (nhiều địa chỉ: ngăn cách bằng dấu phẩy; bỏ trống = cho mọi nơi)
 *   BRANCH         (Text, tùy chọn)  mặc định nhánh mặc định của kho
 */
const MAX_BYTES = 2 * 1024 * 1024;

export default {
  async fetch(req, env) {
    const origins = String(env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const okOrigin = origins.includes('*') || !origin || origins.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': origins.includes('*') ? '*' : (origins.includes(origin) ? origin : origins[0]),
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const out = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!okOrigin) return out({ error: 'Nguồn truy cập không được phép.' }, 403);
    if (!env.GITHUB_TOKEN || !env.REPO) return out({ error: 'Worker chưa được cấu hình (thiếu GITHUB_TOKEN hoặc REPO).' }, 500);

    const m = new URL(req.url).pathname.match(/^\/u\/([A-Z2-9]{20,32})$/);
    if (!m) return out({ error: 'Mã đồng bộ không hợp lệ.' }, 400);
    const path = `users/${m[1]}.json`;

    try {
      const cur = await getFile(env, path);

      if (req.method === 'GET') {
        if (!cur) return out({ error: 'Chưa có bản sao lưu cho mã này.' }, 404);
        return out({ sha: cur.sha, data: JSON.parse(cur.text) });
      }

      if (req.method === 'PUT') {
        const len = +req.headers.get('Content-Length') || 0;
        if (len > MAX_BYTES) return out({ error: 'Dữ liệu quá lớn.' }, 413);
        const text = await req.text();
        if (text.length > MAX_BYTES) return out({ error: 'Dữ liệu quá lớn.' }, 413);
        let body; try { body = JSON.parse(text); } catch (e) { return out({ error: 'Dữ liệu không phải JSON.' }, 400); }
        const d = body && body.data;
        if (!d || d.app !== 'kinhthanh' || d.kind !== 'user-data') return out({ error: 'Sai định dạng dữ liệu.' }, 400);
        if (cur && String(body.base || '') !== cur.sha) return out({ error: 'Dữ liệu trên máy chủ đã thay đổi.', sha: cur.sha }, 409);

        const put = { message: 'Cập nhật dữ liệu người dùng ' + new Date().toISOString(), content: toB64(JSON.stringify(d, null, 2)) };
        if (cur) put.sha = cur.sha;
        if (env.BRANCH) put.branch = env.BRANCH;
        const r = await gh(env, path, { method: 'PUT', body: JSON.stringify(put) });
        if (r.status === 409 || r.status === 422) return out({ error: 'Dữ liệu trên máy chủ vừa thay đổi.', sha: (await getFile(env, path) || {}).sha || '' }, 409);
        if (!r.ok) return out({ error: 'GitHub trả lỗi ' + r.status }, 502);
        return out({ sha: (await r.json()).content.sha });
      }

      return out({ error: 'Phương thức không được hỗ trợ.' }, 405);
    } catch (e) {
      return out({ error: 'Lỗi máy chủ: ' + (e && e.message || e) }, 500);
    }
  }
};

function gh(env, path, init = {}) {
  const q = env.BRANCH && (!init.method || init.method === 'GET') ? '?ref=' + encodeURIComponent(env.BRANCH) : '';
  return fetch(`https://api.github.com/repos/${env.REPO}/contents/${path}${q}`, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kinhthanh-sync-worker',
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
}
async function getFile(env, path) {
  const r = await gh(env, path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub trả lỗi ' + r.status);
  const j = await r.json();
  let text;
  if (j.content && j.encoding === 'base64') text = fromB64(j.content);
  else {                                                         // file > 1MB: tải bản raw
    const raw = await fetch(`https://api.github.com/repos/${env.REPO}/contents/${path}${env.BRANCH ? '?ref=' + encodeURIComponent(env.BRANCH) : ''}`, {
      headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'kinhthanh-sync-worker' }
    });
    if (!raw.ok) throw new Error('GitHub trả lỗi ' + raw.status);
    text = await raw.text();
  }
  return { sha: j.sha, text };
}
function toB64(str) {
  const b = new TextEncoder().encode(str); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const bin = atob(String(b64).replace(/\s/g, '')), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(u);
}
