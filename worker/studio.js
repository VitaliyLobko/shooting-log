// Shooter's Log — студійне фото: вирізає зброю з фону (Cloudflare Worker).
// Один файл без збірки: вставляється в редактор Cloudflare як є.
//
// Що потрібно в налаштуваннях Worker:
//   IMAGES — прив'язка Images (Settings → Bindings → Images);
//   DB     — прив'язка бази D1 для лічильників; таблицю Worker створює сам.
// Необов'язково: PER_IP_DAY (за замовчуванням 20), PER_DAY (150) — денні ліміти.
//
// Вирізання робить Cloudflare Images (segment=foreground, модель BiRefNet).
// Безкоштовний план — 5000 перетворень на місяць; понад це Cloudflare не бере грошей,
// а відповідає помилкою 9422 — тоді застосунок каже, що ліміт місяця вичерпано.
// Денний загальний ліміт (≈5000/31) не дає одному дню з'їсти весь місяць.
// Фото не зберігається: лише проходить через Worker. У базі — тільки лічильники за день (хеш IP + дата).

const ORIGINS = ['https://vitaliylobko.github.io', 'http://127.0.0.1:8091', 'http://127.0.0.1:8092'];
const MAX_BYTES = 6 * 2 ** 20;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function cors(req) {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (req, status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(req), 'Content-Type': 'application/json' },
});

let ready = false;
async function init(db) {
  if (ready) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, who))').run();
  ready = true;
}

/** +1 до лічильника й нове значення; атомарно — паралельні запити не проскочать ліміт. */
async function bump(db, day, who) {
  const row = await db.prepare('INSERT INTO usage (day, who, n) VALUES (?1, ?2, 1) ON CONFLICT (day, who) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(day, who).first();
  return row.n;
}

/** Замість IP — хеш IP разом із датою: лічильнику досить, а адрес людей у базі немає. */
async function hashIp(ip, day) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}|${ip}`));
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function cutout(req, env) {
  if (!ORIGINS.includes(req.headers.get('Origin'))) return json(req, 403, { reason: 'origin' });
  const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
  const size = Number(req.headers.get('Content-Length') || 0);
  if (!TYPES.includes(type)) return json(req, 415, { reason: 'type' });
  if (!size || size > MAX_BYTES) return json(req, 413, { reason: 'size' });

  await init(env.DB);
  const day = new Date().toISOString().slice(0, 10);
  const who = await hashIp(req.headers.get('CF-Connecting-IP') || 'unknown', day);
  if (await bump(env.DB, day, who) > Number(env.PER_IP_DAY || 20)) return json(req, 429, { reason: 'day' });
  if (await bump(env.DB, day, '*') > Number(env.PER_DAY || 150)) return json(req, 429, { reason: 'busy' });
  // старі дні не потрібні — прибираємо зрідка, щоб таблиця не росла
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM usage WHERE day < ?1').bind(day).run();

  try {
    const out = await env.IMAGES.input(req.body)
      .transform({ segment: 'foreground' })
      .output({ format: 'image/webp', quality: 90 });
    return out.response({ headers: { ...cors(req), 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = Number(err?.code) || Number(/\b(9\d{3})\b/.exec(String(err?.message || err))?.[1]) || 0;
    if (code === 9422) return json(req, 429, { reason: 'month' });
    return json(req, 502, { reason: 'images', code, message: String(err?.message || err).slice(0, 200) });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (url.pathname === '/cutout' && req.method === 'POST') return cutout(req, env);
    if (url.pathname === '/') return new Response('Shooter’s Log studio', { headers: cors(req) });
    return json(req, 404, { reason: 'path' });
  },
};
