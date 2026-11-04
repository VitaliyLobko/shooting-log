// Студійне фото: предмет без фону на темному студійному тлі з тінню — як демо-фото.
// Звідки береться вирізаний предмет: сервер («✨ Студія», studioPhoto) або телефон (PNG без фону → laid у photos.js).
import { h, backLayer } from './ui.js';
import { t } from './i18n.js';

export const STUDIO_URL = 'https://shooters-studio.hobbyplanner338.workers.dev';
const W = 1600;
const H = 900;
const TILT = 28; // ° — нахил довгого предмета: приклад унизу, дуло вгорі
const LONG = 6; // відношення осей, від якого предмет «довгий» (ствол), а не шолом чи рюкзак

const REASONS = {
  day: 'Сегодня лимит студийных фото исчерпан — попробуйте завтра',
  busy: 'Сегодня студийных фото уже слишком много — попробуйте завтра',
  month: 'Лимит студийных фото на этот месяц исчерпан',
};

function canvas(w, hh) {
  return Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, hh) });
}

/** Будь-яке джерело (ImageBitmap, img, canvas) → canvas, довша сторона не більша за max. */
function toCanvas(src, max = Infinity) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = canvas(Math.round(src.width * k), Math.round(src.height * k));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Обрізка по непрозорих пікселях. */
function crop(c) {
  const a = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (a[(y * c.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return c;
  const r = canvas(x1 - x0 + 1, y1 - y0 + 1);
  r.getContext('2d').drawImage(c, -x0, -y0);
  return r;
}

/** Фото без фону: кути прозорі й прозорого щонайменше 8 % кадру. */
export function isCutout(src) {
  const n = 64;
  const c = toCanvas(src);
  const m = canvas(n, n);
  const g = m.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0, n, n);
  const a = g.getImageData(0, 0, n, n).data;
  let clear = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 200) clear++;
  const corner = [0, n - 1, n * (n - 1), n * n - 1].filter((i) => a[i * 4 + 3] < 40).length;
  return corner >= 3 && clear / (n * n) >= 0.08;
}

/**
 * Початкове положення за формою (головні компоненти маски).
 * Довгий предмет: вирівняти вісь і нахилити на TILT° так, щоб важчий кінець (приклад — більше площі) був унизу.
 * Короткий (шолом, рюкзак) — як був.
 */
export function orient(c) {
  const step = Math.max(1, Math.round(Math.max(c.width, c.height) / 200));
  const a = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) if (a[(y * c.width + x) * 4 + 3] > 128) pts.push(x, y);
  }
  const n = pts.length / 2;
  if (n < 20) return { level: 0, tilt: 0, flip: false };
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
  cx /= n; cy /= n;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - cx, dy = pts[i + 1] - cy;
    xx += dx * dx; yy += dy * dy; xy += dx * dy;
  }
  const th = 0.5 * Math.atan2(2 * xy, xx - yy);
  const tr = (xx + yy) / 2, det = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  if ((tr + det) / Math.max(1e-6, tr - det) <= LONG) return { level: 0, tilt: 0, flip: false };
  // Після вирівнювання (поворот на −th) напрям осі +u стає «праворуч»
  const ux = Math.cos(th), uy = Math.sin(th);
  let side = 0;
  for (let i = 0; i < pts.length; i += 2) side += (pts[i] - cx) * ux + (pts[i + 1] - cy) * uy > 0 ? 1 : -1;
  // Приклад ліворуч — дуло праворуч угору (+TILT); приклад праворуч — дуло ліворуч угору (−TILT)
  return { level: -th, tilt: side > 0 ? -TILT : TILT, flip: false };
}

/** Спершу вирівнювання (level), потім дзеркало, потім нахил — дзеркало не подвоює кут. */
function turned(src, { level, tilt, flip }) {
  const d = Math.ceil(Math.hypot(src.width, src.height));
  const r = canvas(d, d);
  const g = r.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.translate(d / 2, d / 2);
  g.rotate((-tilt * Math.PI) / 180);
  if (flip) g.scale(-1, 1);
  g.rotate(level);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return crop(r);
}

/** Предмет на студійному тлі w×hh: еліптичний градієнт і тінь знизу — числа з dev-скрипта демо-фото. */
function compose(item, w, hh) {
  const c = canvas(w, hh);
  const g = c.getContext('2d');
  g.save();
  g.translate(w / 2, hh * 0.45);
  g.scale(w * 0.62, hh * 0.75);
  const bg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  bg.addColorStop(0, 'rgb(62 68 78)');
  bg.addColorStop(1, 'rgb(22 24 29)');
  g.fillStyle = bg;
  g.fillRect(-2, -2, 4, 4);
  g.restore();
  const k = Math.min((w * 0.86) / item.width, (hh * 0.72) / item.height, 3);
  const iw = Math.round(item.width * k), ih = Math.round(item.height * k);
  g.imageSmoothingQuality = 'high';
  g.shadowColor = 'rgb(0 0 0 / .55)';
  g.shadowOffsetY = (22 * hh) / 1080;
  g.shadowBlur = (36 * hh) / 1080;
  g.drawImage(item, Math.round((w - iw) / 2), Math.round((hh - ih) / 2), iw, ih);
  return c;
}

/** Вирізаний предмет → студійне фото 1600×900 у початковому положенні (без діалогу). */
export function laid(src) {
  const c = toCanvas(src, 2400);
  return compose(turned(c, orient(c)), W, H);
}

/** Фото → вирізаний предмет з прозорим тлом (Blob). Помилка — з текстом для людини. */
async function cutout(blob) {
  let res;
  try {
    res = await fetch(`${STUDIO_URL}/cutout`, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
  } catch {
    throw new Error(t('Нет связи: фон вырезается на сервере'));
  }
  if (res.ok) return res.blob();
  const { reason } = await res.json().catch(() => ({}));
  throw new Error(t(REASONS[reason] ?? 'Не удалось вырезать фон'));
}

/**
 * «✨ Студія»: вирізання на сервері, далі нахил і дзеркало вручну.
 * Повертає canvas 1600×900 або null; помилку сервера віддає в onError і повертає null.
 */
export async function studioPhoto(blob, { onError } = {}) {
  const root = h('div', { class: 'viewer editor', role: 'dialog', 'aria-label': t('Студийное фото') });
  const stage = h('div', { class: 'editor-stage' }, h('p', { class: 'studio-status' }, t('Вырезаю фон…')));
  let close = null;
  const done = new Promise((resolve) => { close = resolve; });
  const unlayer = backLayer(() => close(null));
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  root.append(
    h('header', { class: 'viewer-head' }, h('span', {}, t('Студийное фото')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрыть'), onclick: () => close(null) }, '✕')),
    stage);
  document.getElementById('layer').append(root);
  document.addEventListener('keydown', onKey);
  const finish = (v) => { root.remove(); unlayer(); document.removeEventListener('keydown', onKey); return v; };

  let item;
  try {
    const cut = await Promise.race([cutout(blob).then((b) => createImageBitmap(b)), done.then(() => null)]);
    if (!cut) return finish(null);
    item = toCanvas(cut);
    cut.close?.();
  } catch (err) {
    finish(null);
    onError?.(err);
    return null;
  }

  const small = toCanvas(item, 900);
  const st = orient(item);
  const auto = st.tilt;
  const view = h('canvas', { class: 'studio-canvas' });
  let frame = 0;
  const paint = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const c = compose(turned(small, st), 800, 450);
      view.width = c.width;
      view.height = c.height;
      view.getContext('2d').drawImage(c, 0, 0);
    });
  };
  const sign = (v) => `${v > 0 ? '+' : ''}${v}°`;
  const value = h('span', { class: 'editor-angle' }, sign(st.tilt));
  const slider = h('input', {
    type: 'range', min: -45, max: 45, step: 1, value: st.tilt, 'aria-label': t('Наклон'),
    oninput: (e) => { st.tilt = Number(e.target.value); value.textContent = sign(st.tilt); paint(); },
  });
  const setTilt = (v) => { slider.value = v; slider.dispatchEvent(new Event('input')); };
  const tool = (label, title, onclick) => h('button', { type: 'button', class: 'editor-tool', title, 'aria-label': title, onclick }, label);
  const saveBtn = h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => { saveBtn.disabled = true; close(compose(turned(item, st), W, H)); },
  }, t('Сохранить'));
  stage.replaceChildren(view);
  root.append(
    h('div', { class: 'editor-tools' },
      h('div', { class: 'editor-row' },
        tool('⇋', t('Отразить по горизонтали'), () => { st.flip = !st.flip; setTilt(-st.tilt); }),
        tool('—', t('Ровно'), () => setTilt(0)),
        tool('⟋', t('Наискосок, как в каталоге'), () => setTilt((auto || TILT) * (st.flip ? -1 : 1)))),
      h('label', { class: 'editor-row editor-straighten' }, h('span', {}, t('Наклон')), slider, value)),
    h('footer', { class: 'viewer-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, t('Отмена')), saveBtn));
  paint();
  return finish(await done);
}
