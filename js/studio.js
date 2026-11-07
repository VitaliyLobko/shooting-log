// Студійне фото: предмет без фону на студійному тлі з тінню — як демо-фото.
// Звідки береться вирізаний предмет: сервер («✨ Студія», studioPhoto) або телефон (PNG без фону → laid у photos.js).
import { h, backLayer, toast } from './ui.js';
import { t } from './i18n.js';

export const STUDIO_URL = 'https://shooters-studio.hobbyplanner338.workers.dev';
const W = 1600;
const H = 900;
const SEND = 2048; // довша сторона фото, що йде на сервер: менше трафіку, і камера не впреться в 6 МБ
const TILT = 28; // ° — нахил довгого предмета: приклад унизу, дуло вгорі
const LONG = 6; // відношення осей, від якого предмет «довгий» (ствол), а не шолом чи рюкзак
const KEY = 'shooters-log:studio-backdrop';
const OWNER = 'shooters-log:studio-key';

// Ключ власника (студія без особистих лімітів) приходить одноразовим посиланням #studio-key=…:
// запам'ятовуємо на цьому пристрої й прибираємо з адреси, щоб не лишився в історії
// (і коли застосунок уже відкритий: тоді змінюється лише # — слухач стоїть раніше за маршрутизатор)
function takeKey() {
  const key = /(?:^#|&)studio-key=([\w-]{16,})/.exec(location.hash)?.[1];
  if (!key) return;
  try { localStorage.setItem(OWNER, key); } catch { /* приватне вікно */ }
  history.replaceState(null, '', location.pathname + location.search);
  setTimeout(() => toast(t('Студія без лімітів на цьому пристрої')), 1500);
}
takeKey();
window.addEventListener('hashchange', takeKey);

function keyHeaders() {
  let key = null;
  try { key = localStorage.getItem(OWNER); } catch { /* приватне вікно */ }
  return key ? { 'X-Studio-Key': key } : {};
}

const REASONS = {
  mine: 'Ваші студійні фото на цей місяць закінчились — нові будуть з 1-го числа',
  day: 'Сьогодні ліміт студійних фото вичерпано — спробуйте завтра',
  busy: 'Сьогодні студійних фото вже забагато — спробуйте завтра',
  month: 'Ліміт студійних фото на цей місяць вичерпано',
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

/** Тінь по краях кадру: до кутів темніє до alpha, центр лишається світлим. */
function vignette(g, w, hh, alpha) {
  g.save();
  g.translate(w / 2, hh / 2);
  g.scale(w * 0.62, hh * 0.7);
  const r = g.createRadialGradient(0, 0, 0.4, 0, 0, 1.05);
  r.addColorStop(0, 'rgb(0 0 0 / 0)');
  r.addColorStop(1, `rgb(0 0 0 / ${alpha})`);
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

/**
 * Тла студії: назва, зразок для кружка, малювання, колір тіні предмета, її глибина
 * (depth — множник зсуву й розмиття: на кольорових тлах тінь довша, щоб предмет не «прилипав»)
 * і тінь по краях кадру за замовчуванням (shade, 0–1 — її змінює повзунок «Тінь»).
 */
export const BACKDROPS = [
  { id: 'graphite', name: 'Графіт', swatch: 'rgb(48 53 62)', shadow: 'rgb(0 0 0 / .55)', shade: 0.25,
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(62 68 78)', 'rgb(22 24 29)') },
  { id: 'light', name: 'Світлий каталог', swatch: 'rgb(214 216 221)', shadow: 'rgb(0 0 0 / .5)', depth: 1.3, shade: 0.75,
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(242 243 245)', 'rgb(128 132 140)') },
  { id: 'olive', name: 'Олива', swatch: 'rgb(62 69 47)', shadow: 'rgb(0 0 0 / .7)', depth: 1.4, shade: 0.7,
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(84 92 64)', 'rgb(18 20 13)') },
  { id: 'coyote', name: 'Койот', swatch: 'rgb(160 135 96)', shadow: 'rgb(30 18 2 / .65)', depth: 1.4, shade: 0.72,
    paint: (g, w, hh) => radial(g, w, hh, 'rgb(198 172 130)', 'rgb(72 55 32)') },
  { id: 'blueprint', name: 'Креслення', swatch: 'rgb(24 46 78)', shadow: 'rgb(0 0 0 / .65)', depth: 1.4, shade: 0.72,
    paint: (g, w, hh) => { radial(g, w, hh, 'rgb(30 58 96)', 'rgb(6 13 26)'); grid(g, w, hh); } },
  { id: 'softbox', name: 'Софтбокс', swatch: 'rgb(12 12 14)', shadow: 'rgb(0 0 0 / .7)', shade: 0.2,
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

/**
 * Обрізка по предмету. Вирізання лишає довкола ледь видимий пил і ореол (напівпрозорі точки далеко від предмета) —
 * за ними рамка роздувалась, і предмет стояв не по центру. Тому рахуємо лише щільні пікселі (alpha > 64)
 * і лише рядки та стовпці, де їх хоча б 3 поспіль не випадкові: окремі пилинки рамку не розсувають.
 */
function crop(c) {
  const w = c.width, hh = c.height;
  const a = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh).data;
  const rows = new Uint32Array(hh); const cols = new Uint32Array(w);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] > 64) { rows[y]++; cols[x]++; }
    }
  }
  // Поріг — частка розміру: прев'ю (900 px) і збереження (2400 px) мають обрізатись однаково, інакше предмет «з'їжджає»
  const MIN = Math.max(2, Math.round(Math.max(w, hh) * 0.004));
  let y0 = 0; while (y0 < hh && rows[y0] < MIN) y0++;
  let y1 = hh - 1; while (y1 > y0 && rows[y1] < MIN) y1--;
  let x0 = 0; while (x0 < w && cols[x0] < MIN) x0++;
  let x1 = w - 1; while (x1 > x0 && cols[x1] < MIN) x1--;
  if (y0 >= hh || x0 >= w) return c;
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hh - 1, y1 + pad);
  const r = canvas(x1 - x0 + 1, y1 - y0 + 1);
  r.getContext('2d').drawImage(c, -x0, -y0);
  return r;
}

/**
 * Прибрати ореол вирізання: на краю предмета лишається світла кайма старого фону. Маску підрізаємо всередину
 * (мінімум alpha серед сусідів, на великому фото — на 2 px), а майже прозоре прибираємо зовсім.
 * Прев'ю й збереження беруть ту саму чисту маску.
 */
function clean(c) {
  const w = c.width, hh = c.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, w, hh); const a = img.data;
  const passes = Math.max(w, hh) > 1500 ? 2 : 1;
  let al = new Uint8ClampedArray(w * hh);
  for (let p = 0; p < w * hh; p++) al[p] = a[p * 4 + 3];
  for (let n = 0; n < passes; n++) {
    const out = new Uint8ClampedArray(al);
    for (let y = 1; y < hh - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!al[p]) continue;
        out[p] = Math.min(al[p], al[p - 1], al[p + 1], al[p - w], al[p + w]);
      }
    }
    al = out;
  }
  for (let p = 0; p < w * hh; p++) a[p * 4 + 3] = al[p] < 48 ? 0 : al[p];
  g.putImageData(img, 0, 0);
  // Чисті пікселі вже в руках — orient() візьме їх звідси: повторне читання з полотна на телефоні коштує сотні мс
  pixels.set(c, a);
  return c;
}

/** Пікселі полотна, вже прочитані в clean() (лише поки полотно живе й не змінювалось). */
const pixels = new WeakMap();

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
  const a = pixels.get(c) ?? c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
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

/**
 * Предмет на студійному тлі w×hh з тінню знизу — числа з dev-скрипта демо-фото.
 * x, y — зсув від центру частками кадру, scale — розмір відносно вписаного, shade — тінь по краях.
 */
function compose(item, w, hh, backdrop = BACKDROPS[0], { x = 0, y = 0, scale = 1, shade = backdrop.shade ?? 0 } = {}) {
  const c = canvas(w, hh);
  const g = c.getContext('2d');
  backdrop.paint(g, w, hh);
  if (shade > 0) vignette(g, w, hh, shade);
  const k = Math.min((w * 0.86) / item.width, (hh * 0.72) / item.height, 3) * scale;
  const iw = Math.round(item.width * k), ih = Math.round(item.height * k);
  g.imageSmoothingQuality = 'high';
  const depth = backdrop.depth ?? 1;
  g.shadowColor = backdrop.shadow;
  g.shadowOffsetY = (22 * depth * hh) / 1080;
  g.shadowBlur = (36 * depth * hh) / 1080;
  g.drawImage(item, Math.round((w - iw) / 2 + x * w), Math.round((hh - ih) / 2 + y * hh), iw, ih);
  return c;
}

/** Вирізаний предмет → студійне фото 1600×900 у початковому положенні на останньому вибраному тлі. */
export function laid(src) {
  const c = clean(toCanvas(src, 2400));
  return compose(turned(c, orient(c)), W, H, savedBackdrop());
}

/** Скільки студійних фото лишилось людині: { day, month: { left, limit } } або null (немає зв'язку). */
export async function studioQuota() {
  try {
    const res = await fetch(`${STUDIO_URL}/quota`, { headers: keyHeaders(), signal: AbortSignal.timeout(6000), cache: 'no-store' });
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
    throw new Error(t('Не вдалося прочитати фото'));
  }
  let res;
  try {
    res = await fetch(`${STUDIO_URL}/cutout`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...keyHeaders() }, body });
  } catch {
    throw new Error(t('Немає зв’язку: фон вирізається на сервері'));
  }
  if (res.ok) {
    if (res.headers.get('X-Owner') === '1') return { blob: await res.blob(), month: { owner: true } };
    const left = res.headers.get('X-Left-Month');
    const limit = res.headers.get('X-Limit-Month');
    return { blob: await res.blob(), month: left === null ? null : { left: Number(left), limit: Number(limit) } };
  }
  const { reason } = await res.json().catch(() => ({}));
  throw new Error(t(REASONS[reason] ?? 'Не вдалося вирізати фон'));
}

/** Підпис залишку: «Цього місяця ще 12 з 30»; з ключем власника — «Без ліміту». */
export function quotaText(month) {
  if (!month) return '';
  if (month.owner) return t('Без ліміту');
  return month.left > 0
    ? t('Цього місяця ще {n} з {limit}', { n: month.left, limit: month.limit })
    : t('Студійні фото на цей місяць закінчились');
}

/**
 * «✨ Студія»: вирізання на сервері, далі тло, нахил і дзеркало вручну.
 * Повертає canvas 1600×900 або null; помилку сервера віддає в onError і повертає null.
 */
export async function studioPhoto(blob, { onError } = {}) {
  const root = h('div', { class: 'viewer editor', role: 'dialog', 'aria-label': t('Студійне фото') });
  const stage = h('div', { class: 'editor-stage' }, h('p', { class: 'studio-status' }, t('Вирізаю фон…')));
  let close = null;
  const done = new Promise((resolve) => { close = resolve; });
  const unlayer = backLayer(() => close(null));
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  root.append(
    h('header', { class: 'viewer-head' }, h('span', {}, t('Студійне фото')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрити'), onclick: () => close(null) }, '✕')),
    stage);
  document.getElementById('layer').append(root);
  document.addEventListener('keydown', onKey);
  const finish = (v) => { root.remove(); unlayer(); document.removeEventListener('keydown', onKey); return v; };

  let item, month;
  try {
    const got = await Promise.race([cutout(blob), done.then(() => null)]);
    if (!got) return finish(null);
    const cut = await createImageBitmap(got.blob);
    item = clean(toCanvas(cut));
    cut.close?.();
    month = got.month;
  } catch (err) {
    finish(null);
    onError?.(err);
    return null;
  }

  const small = toCanvas(item, 900);
  let backdrop = savedBackdrop();
  // Положення (x, y — частки кадру), розмір і тінь по краях — разом із нахилом у st
  const st = { ...orient(item), x: 0, y: 0, scale: 1, shade: backdrop.shade ?? 0 };
  const auto = st.tilt;
  const view = h('canvas', { class: 'studio-canvas' });
  let frame = 0;
  // Поворот з обрізкою читає пікселі — дорого; тягнуть і масштабують пальцем без зміни кута, тож повернутий предмет кешуємо
  let turnKey = '';
  let turnedSmall = null;
  const paint = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const key = `${st.level}|${st.tilt}|${st.flip}`;
      if (key !== turnKey) { turnKey = key; turnedSmall = turned(small, st); }
      const c = compose(turnedSmall, 800, 450, backdrop, st);
      view.width = c.width;
      view.height = c.height;
      view.getContext('2d').drawImage(c, 0, 0);
    });
  };
  const sign = (v) => `${v > 0 ? '+' : ''}${v}°`;
  const value = h('span', { class: 'editor-angle' }, sign(st.tilt));
  const slider = h('input', {
    type: 'range', min: -45, max: 45, step: 1, value: st.tilt, 'aria-label': t('Нахил'),
    oninput: (e) => { st.tilt = Number(e.target.value); value.textContent = sign(st.tilt); paint(); },
  });
  const setTilt = (v) => { slider.value = v; slider.dispatchEvent(new Event('input')); };
  const pct = (v) => `${Math.round(v * 100)}%`;
  const shadeValue = h('span', { class: 'editor-angle' }, pct(st.shade));
  const shadeSlider = h('input', {
    type: 'range', min: 0, max: 100, step: 1, value: Math.round(st.shade * 100), 'aria-label': t('Тінь по краях'),
    oninput: (e) => { st.shade = Number(e.target.value) / 100; shadeValue.textContent = pct(st.shade); paint(); },
  });
  const setShade = (v) => { shadeSlider.value = Math.round(v * 100); shadeSlider.dispatchEvent(new Event('input')); };

  // Один палець тягне предмет, два — ще й змінюють розмір; подвійний дотик повертає в центр
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const touches = new Map();
  let start = null;
  const snap = () => {
    const [a, b] = [...touches.values()];
    return {
      x: st.x, y: st.y, scale: st.scale,
      mid: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { ...a },
      d: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
    };
  };
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = snap();
  });
  view.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = snap();
    st.x = clamp(start.x + (now.mid.x - start.mid.x) / view.clientWidth, -0.5, 0.5);
    st.y = clamp(start.y + (now.mid.y - start.mid.y) / view.clientHeight, -0.5, 0.5);
    if (start.d && now.d) st.scale = clamp((start.scale * now.d) / start.d, 0.4, 2.5);
    paint();
  });
  const lift = (e) => { touches.delete(e.pointerId); start = touches.size ? snap() : null; };
  view.addEventListener('pointerup', lift);
  view.addEventListener('pointercancel', lift);
  view.addEventListener('dblclick', () => { st.x = 0; st.y = 0; st.scale = 1; paint(); });
  const tool = (label, title, onclick) => h('button', { type: 'button', class: 'editor-tool', title, 'aria-label': title, onclick }, label);
  const swatches = BACKDROPS.map((b) => h('button', {
    type: 'button', class: 'studio-swatch', style: `--sw:${b.swatch}`, title: t(b.name), 'aria-label': t(b.name),
    'aria-pressed': String(b === backdrop),
    onclick: () => {
      backdrop = b;
      saveBackdrop(b);
      swatches.forEach((s, k) => s.setAttribute('aria-pressed', String(BACKDROPS[k] === b)));
      setShade(b.shade ?? 0);
    },
  }));
  const saveBtn = h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => { saveBtn.disabled = true; close(compose(turned(item, st), W, H, backdrop, st)); },
  }, t('Зберегти'));
  stage.replaceChildren(view, h('p', { class: 'studio-hint' }, t('Рухайте пальцем, двома — розмір; подвійний дотик — у центр')));
  root.append(
    h('div', { class: 'editor-tools' },
      h('div', { class: 'editor-row studio-swatches', role: 'group', 'aria-label': t('Фон') }, swatches),
      h('div', { class: 'editor-row' },
        tool('⇋', t('Віддзеркалити по горизонталі'), () => { st.flip = !st.flip; setTilt(-st.tilt); }),
        tool('—', t('Рівно'), () => setTilt(0)),
        tool('⟋', t('Навскіс, як у каталозі'), () => setTilt((auto || TILT) * (st.flip ? -1 : 1)))),
      h('label', { class: 'editor-row editor-straighten' }, h('span', {}, t('Нахил')), slider, value),
      h('label', { class: 'editor-row editor-straighten' }, h('span', {}, t('Тінь')), shadeSlider, shadeValue),
      month ? h('p', { class: 'studio-quota' }, quotaText(month)) : null),
    h('footer', { class: 'viewer-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, t('Скасувати')), saveBtn));
  paint();
  return finish(await done);
}
