// Бот Хобі-плану (Cloudflare Worker) як ШІ-помічник: з посилання на товар заповнює форму ствола, набою, прицілу чи речі.
// Адреса й ключ — спільні для всіх застосунків автора на пристрої (bot-key.js). Свого вводу ключа тут немає:
// без ключа на пристрої помічника не видно зовсім — застосунком користуються й інші люди.
import * as BK from './bot-key.js';

// Лише бот автора: ключ від свого бота (README Хобі-плану дає підняти власний) помічника не відкриває —
// туди й CSP не пускає (connect-src https://*.hobbyplanner338.workers.dev)
const OWN_BOT = /^https:\/\/[\w-]+\.hobbyplanner338\.workers\.dev$/;

/** Адреса й ключ бота автора, які бот не відкидав; null — помічника на цьому пристрої немає. */
export function botConfig() {
  const cfg = BK.current(0);
  return cfg && OWN_BOT.test(cfg.url) ? cfg : null;
}

/** POST до бота: відповідь як є, помилка — Error з кодом (no-bot, offline, network, unauthorized, old-bot, fetch, empty, limit…). */
async function post(path, body) {
  const cfg = botConfig();
  if (!cfg) throw new Error('no-bot');
  if (!navigator.onLine) throw new Error('offline');
  let r;
  try {
    r = await fetch(`${cfg.url}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('network');
  }
  if (r.ok) { BK.markOk(cfg); return r; }
  const e = await r.json().catch(() => ({}));
  if (r.status === 401) BK.markBad(cfg);
  // Старий бот ще не знає цієї адреси — його треба перезалити
  throw new Error(r.status === 404 ? 'old-bot' : r.status === 401 ? 'unauthorized' : e.error || `HTTP ${r.status}`);
}

/** { kind, url } або { kind, text, url? } (+ cats для речі) → { item, image, note, source }. */
export const fromPage = async (body) => (await post('/api/arsenal-from-url', body)).json();

/** Фото товару через бота (магазин не віддасть його застосунку напряму) → File або null. */
export async function pageImage(url) {
  try {
    const blob = await (await post('/api/gear-image', { url })).blob();
    return blob.type.startsWith('image/') ? new File([blob], 'shop', { type: blob.type }) : null;
  } catch {
    return null;
  }
}
