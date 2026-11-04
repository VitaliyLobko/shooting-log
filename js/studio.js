// Студійне фото: предмет без фону на студійному тлі з тінню — як демо-фото.
// Звідки береться вирізаний предмет: сервер («✨ Студія», studioPhoto) або телефон (PNG без фону → laid у photos.js).
import { h, backLayer } from './ui.js';
import { t } from './i18n.js';

export const STUDIO_URL = 'https://shooters-studio.hobbyplanner338.workers.dev';
const W = 1600;
const H = 900;
const SEND = 2048; // довша сторона фото, що йде на сервер: менше трафіку, і камера не впреться в 6 МБ
const TILT = 28; // ° — нахил довгого предмета: приклад унизу, дуло вгорі
const LONG = 6; // відношення осей, від якого предмет «довгий» (ствол), а не шолом чи рюкзак
const KEY = 'shooters-log:studio-backdrop';

const REASONS = {
  mine: 'Ваши студийные фото на этот месяц закончились — новые будут с 1-го числа',
  day: 'Сегодня лимит студийных фото исчерпан — попробуйте завтра',
  busy: 'Сегодня студийных фото уже слишком много — попробуйте завтра',
  month: 'Лимит студийных фото на этот месяц исчерпан',
};

/** Еліптичний градієнт від центру (cx, cy частками кадру) з радіусами sx, sy. */
function radial(g, w, hh, from, to, { cy = 0.45, sx = 0.62, sy = 0.75 } = {}) {
  g.save();
  g.translate(w / 2, hh * cy);
  g.scale(w * sx, hh * sy);
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  r.addColorStop(0, from);
  r.addColorStop(1, to);
  g.fillStyle = r;
  g.fillRect(-3, -3, 6, 6);
  g.restore();
}

/** Сітка креслення: дрібна клітинка й крупна кожна п'ята. */
function grid(g, w, hh) {
  const step = hh / 17;
  for (const [every, alpha] of [[1, 0.09], [5, 0.18]]) {
    g.strokeStyle = `rgb(160 200 255 / ${alpha})`;
    g.lineWidth = Math.max(1, hh / 270);
    g.beginPath();
    for (let x = 0; x < w; x += step * every) { g.moveTo(x, 0); g.lineTo(x, hh); }
    for (let y = 0; y < hh; y += step * every) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
  }
}

/** Тла студії: назва, зразок для кружка, малювання й колір тіні. */
export const BACKDROPS = [
  { id: 'graphite', name: 'Графит', swatch: 'rgb(48 53 62)', shadow: 'rgb(0 0 0 / .55)',
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(62 68 78)', 'rgb(22 24 29)') },
  { id: 'light', name: 'Светлый каталог', swatch: 'rgb(226 228 232)', shadow: 'rgb(0 0 0 / .3)',
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(248 249 250)', 'rgb(196 200 207)') },
  { id: 'olive', name: 'Олива', swatch: 'rgb(68 75 52)', shadow: 'rgb(0 0 0 / .55)',
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(84 92 64)', 'rgb(26 29 20)') },
  { id: 'coyote', name: 'Койот', swatch: 'rgb(176 151 110)', shadow: 'rgb(40 25 5 / .45)',
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(201 176 134)', 'rgb(116 94 62)') },
  { id: 'blueprint', name: 'Чертёж', swatch: 'rgb(26 50 84)', shadow: 'rgb(0 0 0 / .5)',
    paint: (g, w, hh) => { radial(g, w, hh, 'rgb(30 58 96)', 'rgb(10 20 38)'); grid(g, w, hh); } },
  { id: 'softbox', name: 'Софтбокс', swatch: 'rgb(12 12 14)', shadow: 'rgb(0 0 0 / .7)',
    paint: (g, w, hh) => {
      g.fillStyle = '#050506';
      g.fillRect(0, 0, w, hh);
      radial(g, w, hh, 'rgb(92 94 98)', 'rgb(5 5 6 / 0)', { cy: 0.05, sx: 0.55, sy: 0.95 });
      const floor = g.createLinearGradient(0, hh * 0.72, 0, hh);
      floor.addColorStop(0, 'rgb(255 255 255 / 0)');
      floor.addColorStop(1, 'rgb(255 255 255 / .06)');
      g.fillStyle = floor;
      g.fillRect(0, hh * 0.72, w, hh);
    } },
];

/** Останнє вибране тло — зручність одного пристрою, без нього — графіт. */
function savedBackdrop() {
  let id = null;
  try { id = localStorage.getItem(KEY); } catch { /* приватне вікно */ }
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}

function saveBackdrop(b) {
  try { localStorage.setItem(KEY, b.id); } catch { /* приватне вікно */ }
}

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

/** Предмет на студійному тлі w×hh з тінню знизу — числа з dev-скрипта демо-фото. */
function compose(item, w, hh, backdrop = BACKDROPS[0]) {
  const c = canvas(w, hh);
  const g = c.getContext('2d');
  backdrop.paint(g, w, hh);
  const k = Math.min((w * 0.86) / item.width, (hh * 0.72) / item.height, 3);
  const iw = Math.round(item.width * k), ih = Math.round(item.height * k);
  g.imageSmoothingQuality = 'high';
  g.shadowColor = backdrop.shadow;
  g.shadowOffsetY = (22 * hh) / 1080;
  g.shadowBlur = (36 * hh) / 1080;
  g.drawImage(item, Math.round((w - iw) / 2), Math.round((hh - ih) / 2), iw, ih);
  return c;
}

/** Вирізаний предмет → студійне фото 1600×900 у початковому положенні на останньому вибраному тлі. */
export function laid(src) {
  const c = toCanvas(src, 2400);
  return compose(turned(c, orient(c)), W, H, savedBackdrop());
}

/** Скільки студійних фото лишилось людині: { day, month: { left, limit } } або null (немає зв'язку). */
export async function studioQuota() {
  try {
    const res = await fetch(`${STUDIO_URL}/quota`, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Фото → JPEG не більше SEND: будь-який формат галереї, що вміє браузер, і розмір у межах сервера. */
async function forUpload(blob) {
  const bmp = await createImageBitmap(blob);
  const c = toCanvas(bmp, SEND);
  bmp.close?.();
  return new Promise((resolve) => { c.toBlob(resolve, 'image/jpeg', 0.9); });
}

/** Фото → вирізаний предмет з прозорим тлом і залишок місяця. Помилка — з текстом для людини. */
async function cutout(blob) {
  let body;
  try {
    body = await forUpload(blob);
  } catch {
    throw new Error(t('Не удалось прочитать фото'));
  }
  let res;
  try {
    res = await fetch(`${STUDIO_URL}/cutout`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body });
  } catch {
    throw new Error(t('Нет связи: фон вырезается на сервере'));
  }
  if (res.ok) {
    const left = res.headers.get('X-Left-Month');
    const limit = res.headers.get('X-Limit-Month');
    return { blob: await res.blob(), month: left === null ? null : { left: Number(left), limit: Number(limit) } };
  }
  const { reason } = await res.json().catch(() => ({}));
  throw new Error(t(REASONS[reason] ?? 'Не удалось вырезать фон'));
}

/** Підпис залишку: «Цього місяця ще 12 з 30». */
export function quotaText(month) {
  if (!month) return '';
  return month.left > 0
    ? t('В этом месяце ещё {n} из {limit}', { n: month.left, limit: month.limit })
    : t('Студийные фото на этот месяц закончились');
}

/**
 * «✨ Студія»: вирізання на сервері, далі тло, нахил і дзеркало вручну.
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

  let item, month;
  try {
    const got = await Promise.race([cutout(blob), done.then(() => null)]);
    if (!got) return finish(null);
    const cut = await createImageBitmap(got.blob);
    item = toCanvas(cut);
    cut.close?.();
    month = got.month;
  } catch (err) {
    finish(null);
    onError?.(err);
    return null;
  }

  const small = toCanvas(item, 900);
  const st = orient(item);
  const auto = st.tilt;
  let backdrop = savedBackdrop();
  const view = h('canvas', { class: 'studio-canvas' });
  let frame = 0;
  const paint = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const c = compose(turned(small, st), 800, 450, backdrop);
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
  const swatches = BACKDROPS.map((b) => h('button', {
    type: 'button', class: 'studio-swatch', style: `--sw:${b.swatch}`, title: t(b.name), 'aria-label': t(b.name),
    'aria-pressed': String(b === backdrop),
    onclick: () => {
      backdrop = b;
      saveBackdrop(b);
      swatches.forEach((s, k) => s.setAttribute('aria-pressed', String(BACKDROPS[k] === b)));
      paint();
    },
  }));
  const saveBtn = h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => { saveBtn.disabled = true; close(compose(turned(item, st), W, H, backdrop)); },
  }, t('Сохранить'));
  stage.replaceChildren(view);
  root.append(
    h('div', { class: 'editor-tools' },
      h('div', { class: 'editor-row studio-swatches', role: 'group', 'aria-label': t('Фон') }, swatches),
      h('div', { class: 'editor-row' },
        tool('⇋', t('Отразить по горизонтали'), () => { st.flip = !st.flip; setTilt(-st.tilt); }),
        tool('—', t('Ровно'), () => setTilt(0)),
        tool('⟋', t('Наискосок, как в каталоге'), () => setTilt((auto || TILT) * (st.flip ? -1 : 1)))),
      h('label', { class: 'editor-row editor-straighten' }, h('span', {}, t('Наклон')), slider, value),
      month ? h('p', { class: 'studio-quota' }, quotaText(month)) : null),
    h('footer', { class: 'viewer-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, t('Отмена')), saveBtn));
  paint();
  return finish(await done);
}
