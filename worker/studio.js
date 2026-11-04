// Shooter's Log — студійне фото: вирізає зброю з фону (Cloudflare Worker).
// Один файл без збірки: вставляється в редактор Cloudflare як є.
//
// Що потрібно в налаштуваннях Worker:
//   IMAGES — прив'язка Images (Settings → Bindings → Images);
//   DB     — прив'язка бази D1 для лічильників; таблицю Worker створює сам.
// Необов'язково: PER_IP_MONTH (за замовчуванням 30), PER_IP_DAY (20), PER_DAY (150) — ліміти.
//
// Вирізання робить Cloudflare Images (segment=foreground, модель BiRefNet).
// Безкоштовний план — 5000 перетворень на місяць; понад це Cloudflare не бере грошей,
// а відповідає помилкою 9422 — тоді застосунок каже, що ліміт місяця вичерпано.
// Денний загальний ліміт (≈5000/31) не дає одному дню з'їсти весь місяць.
// Фото не зберігається: лише проходить через Worker. У базі — тільки лічильники
// за день і за місяць (хеш IP + дата чи місяць), старі прибираються.
//
// GET /quota — скільки ще можна сьогодні й цього місяця (для підпису в застосунку).
// Відповідь /cutout несе те саме в заголовках X-Left-Day, X-Left-Month і X-Limit-Month.
// Невдала спроба (ліміт, помилка Images) лічильники не з'їдає.

const ORIGINS = ['https://vitaliylobko.github.io', 'http://127.0.0.1:8091', 'http://127.0.0.1:8092'];
const MAX_BYTES = 6 * 2 ** 20;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function cors(req) {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Left-Day, X-Left-Month, X-Limit-Month',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (req, status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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

/** Повернути спробу, що не вдалася. */
async function unbump(db, keys) {
  await db.batch(keys.map(([day, who]) => db.prepare('UPDATE usage SET n = n - 1 WHERE day = ?1 AND who = ?2 AND n > 0').bind(day, who)));
}

async function count(db, day, who) {
  return (await db.prepare('SELECT n FROM usage WHERE day = ?1 AND who = ?2').bind(day, who).first())?.n ?? 0;
}

/** Замість IP — хеш IP разом із датою чи місяцем: лічильнику досить, а адрес людей у базі немає. */
async function hashIp(ip, period) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${period}|${ip}`));
  return [...new Uint8Array(buf).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ключі лічильників людини: [день, хеш] і [місяць, хеш]; плюс ліміти. */
async function person(req, env) {
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  return {
    day, month,
    dayKey: [day, await hashIp(ip, day)],
    monthKey: [month, await hashIp(ip, month)],
    perDay: Number(env.PER_IP_DAY || 20),
    perMonth: Number(env.PER_IP_MONTH || 30),
  };
}

const left = (limit, used) => Math.max(0, limit - used);

async function quota(req, env) {
  await init(env.DB);
  const p = await person(req, env);
  const [d, m] = await Promise.all([count(env.DB, ...p.dayKey), count(env.DB, ...p.monthKey)]);
  return json(req, 200, {
    day: { left: left(p.perDay, d), limit: p.perDay },
    month: { left: left(p.perMonth, m), limit: p.perMonth },
  });
}

async function cutout(req, env) {
  if (!ORIGINS.includes(req.headers.get('Origin'))) return json(req, 403, { reason: 'origin' });
  const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
  const size = Number(req.headers.get('Content-Length') || 0);
  if (!TYPES.includes(type)) return json(req, 415, { reason: 'type' });
  if (!size || size > MAX_BYTES) return json(req, 413, { reason: 'size' });

  await init(env.DB);
  const p = await person(req, env);
  const all = [p.day, '*'];
  const m = await bump(env.DB, ...p.monthKey);
  if (m > p.perMonth) { await unbump(env.DB, [p.monthKey]); return json(req, 429, { reason: 'mine' }); }
  const d = await bump(env.DB, ...p.dayKey);
  if (d > p.perDay) { await unbump(env.DB, [p.monthKey, p.dayKey]); return json(req, 429, { reason: 'day' }); }
  if (await bump(env.DB, ...all) > Number(env.PER_DAY || 150)) {
    await unbump(env.DB, [p.monthKey, p.dayKey, all]);
    return json(req, 429, { reason: 'busy' });
  }
  // Старі дні й місяці не потрібні — прибираємо зрідка, щоб таблиця не росла.
  // Довжина розрізняє день і місяць: рядок '2026-11' «менший» за '2026-11-04'.
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM usage WHERE (length(day) = 10 AND day < ?1) OR (length(day) = 7 AND day < ?2)')
      .bind(p.day, p.month).run();
  }

  try {
    const out = await env.IMAGES.input(req.body)
      .transform({ segment: 'foreground' })
      .output({ format: 'image/webp', quality: 90 });
    return out.response({
      headers: {
        ...cors(req), 'Cache-Control': 'no-store',
        'X-Left-Day': String(left(p.perDay, d)), 'X-Left-Month': String(left(p.perMonth, m)), 'X-Limit-Month': String(p.perMonth),
      },
    });
  } catch (err) {
    await unbump(env.DB, [p.monthKey, p.dayKey, all]);
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
    if (url.pathname === '/quota' && req.method === 'GET') return quota(req, env);
    if (url.pathname === '/') return new Response('Shooter’s Log studio', { headers: cors(req) });
    return json(req, 404, { reason: 'path' });
  },
};
