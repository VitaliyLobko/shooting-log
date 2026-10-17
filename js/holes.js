// Пошук пробоїн на фото мішені без бібліотек: морфологія (top-hat) і зв'язні області.
// Темна пробоїна — у найсвітлішому каналі (кольоровий друк у ньому світлий, як папір), світла
// пробоїна в чорному чи кольоровому — у найтемнішому (жовто-зелений ореол Shoot-N-C у ньому темний).

// Пробоїна в робочому зображенні — близько стількох пікселів у діаметрі: менше — губляться краї, більше — повільно.
const WORK_D = 10;
const MAX_SIDE = 1600;
// Найменший контраст пробоїни з фоном, рівні яскравості 0–255.
const CONTRAST = 35;

/** Мінімум (max = false) чи максимум у ковзному вікні w уздовж рядків або стовпців (ван Герк — Гіль-Верман). */
function slide(src, width, height, w, max, rows) {
  const out = new Float32Array(src.length);
  const n = rows ? width : height;
  const lines = rows ? height : width;
  const r = w >> 1;
  const len = n + 2 * r;
  const a = new Float32Array(len);
  const g = new Float32Array(len);
  const hh = new Float32Array(len);
  const pick = max ? (x, y) => (x > y ? x : y) : (x, y) => (x < y ? x : y);
  for (let line = 0; line < lines; line += 1) {
    const at = rows ? (i) => line * width + i : (i) => i * width + line;
    for (let i = 0; i < len; i += 1) a[i] = src[at(Math.min(n - 1, Math.max(0, i - r)))];
    for (let i = 0; i < len; i += 1) g[i] = i % w === 0 ? a[i] : pick(g[i - 1], a[i]);
    for (let i = len - 1; i >= 0; i -= 1) hh[i] = i === len - 1 || (i + 1) % w === 0 ? a[i] : pick(hh[i + 1], a[i]);
    for (let i = 0; i < n; i += 1) out[at(i)] = pick(hh[i], g[i + w - 1]);
  }
  return out;
}

const morph = (img, width, height, w, max) => slide(slide(img, width, height, w, max, true), width, height, w, max, false);
const erode = (img, width, height, w) => morph(img, width, height, w, false);
const dilate = (img, width, height, w) => morph(img, width, height, w, true);
const odd = (v) => Math.max(3, Math.round(v) | 1);

/**
 * Відгук пробоїн: top-hat із вікном, більшим за злиплу групу, прибирає великі плями (чорне яблуко, край
 * аркуша), а відкриття малим вікном — тонкі лінії кілець і цифри. bg — фон навколо, для перевірки контексту.
 */
function response(channel, width, height, d, dark) {
  const big = odd(d * 3.5);
  const small = odd(d * 0.5);
  const bg = dark ? erode(dilate(channel, width, height, big), width, height, big) : dilate(erode(channel, width, height, big), width, height, big);
  const diff = new Float32Array(channel.length);
  for (let i = 0; i < diff.length; i += 1) diff[i] = dark ? bg[i] - channel[i] : channel[i] - bg[i];
  return { resp: dilate(erode(diff, width, height, small), width, height, small), bg };
}

/** Зв'язні області маски: площа, центр, головні осі й пікселі (для розділення злиплих). */
function regions(mask, resp, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const list = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const px = [];
    while (top) {
      const i = stack[--top];
      px.push(i);
      const x = i % width;
      const y = (i - x) / width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    let sx = 0; let sy = 0; let sr = 0; let edge = false; let peak = 0;
    let minX = width; let maxX = 0; let minY = height; let maxY = 0;
    for (const i of px) {
      const x = i % width;
      const y = (i - x) / width;
      sx += x; sy += y; sr += resp[i];
      if (resp[i] > peak) peak = resp[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
    }
    const cx = sx / px.length;
    const cy = sy / px.length;
    let xx = 0; let yy = 0; let xy = 0;
    for (const i of px) {
      const dx = (i % width) - cx;
      const dy = Math.floor(i / width) - cy;
      xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    xx /= px.length; yy /= px.length; xy /= px.length;
    const tr = (xx + yy) / 2;
    const root = Math.sqrt(Math.max(0, tr * tr - (xx * yy - xy * xy)));
    list.push({ px, cx, cy, edge, peak, box: [maxX - minX + 1, maxY - minY + 1], area: px.length, contrast: sr / px.length, long: tr + root, short: Math.max(1e-6, tr - root), angle: Math.atan2(tr + root - xx, xy || 1e-9) });
  }
  return list;
}

/** Злиплу область ділимо на k пробоїн: k-середніх, початок — уздовж довгої осі. */
function split(region, k, width) {
  const step = Math.sqrt(region.long) * 1.5 / Math.max(1, k - 1);
  const ux = Math.cos(region.angle);
  const uy = Math.sin(region.angle);
  let centers = Array.from({ length: k }, (_, j) => {
    const t = (j - (k - 1) / 2) * step;
    return [region.cx + ux * t, region.cy + uy * t];
  });
  for (let iter = 0; iter < 12; iter += 1) {
    const sum = centers.map(() => [0, 0, 0]);
    for (const i of region.px) {
      const x = i % width;
      const y = (i - x) / width;
      let best = 0;
      let bd = Infinity;
      centers.forEach(([cx, cy], j) => { const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < bd) { bd = dd; best = j; } });
      sum[best][0] += x; sum[best][1] += y; sum[best][2] += 1;
    }
    centers = centers.map((c, j) => (sum[j][2] ? [sum[j][0] / sum[j][2], sum[j][1] / sum[j][2]] : c));
  }
  return centers;
}

/**
 * Пробоїни на фото src (ImageBitmap чи Image) у прямокутнику rect = [x0, y0, x1, y1] у пікселях фото.
 * holePx — діаметр кулі в пікселях фото. Повертає { holes: [{ p: [x, y] частки фото, sure }], candidates, error }:
 * candidates — ознаки всіх плям (для налаштування на тестових фото), error 'small' — пробоїни на фото
 * надто дрібні, 'zoom' — у видиму частину влізло забагато: треба збільшити мішень.
 */
export function findHoles(src, rect, holePx) {
  const [x0, y0, x1, y1] = rect.map(Math.round);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (holePx < 4 || rw < holePx * 3 || rh < holePx * 3) return { holes: [], error: 'small' };
  const s = Math.min(1, WORK_D / holePx, MAX_SIDE / Math.max(rw, rh));
  const d = holePx * s;
  if (d < 5) return { holes: [], error: 'zoom' };
  const width = Math.max(1, Math.round(rw * s));
  const height = Math.max(1, Math.round(rh * s));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x0, y0, rw, rh, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const hi = new Float32Array(width * height);
  const lo = new Float32Array(width * height);
  for (let i = 0; i < hi.length; i += 1) {
    const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2];
    hi[i] = Math.max(r, g, b);
    lo[i] = Math.min(r, g, b);
  }
  const unit = (Math.PI * d * d) / 4;
  const found = [];
  const candidates = [];
  // яскравість — щоб відрізнити рівно залитий друк від рваної пробоїни
  const full = new Float32Array(width * height);
  for (let i = 0; i < full.length; i += 1) full[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  // темні пробоїни — на світлому фоні, світлі — на темному чи кольоровому
  for (const [channel, dark, fits] of [[hi, true, (bg) => bg > 90], [lo, false, (bg) => bg < 170]]) {
    const { resp, bg } = response(channel, width, height, d, dark);
    const mask = new Uint8Array(resp.length);
    for (let i = 0; i < mask.length; i += 1) mask[i] = resp[i] > CONTRAST && fits(bg[i]) ? 1 : 0;
    for (const region of regions(mask, resp, width, height)) {
      // обрізана краєм пляма — частіше лінія чи край аркуша, ніж пробоїна
      if (region.edge || region.area < unit * 0.45 || region.area > unit * 10) continue;
      const ratio = Math.sqrt(region.long / region.short);
      let m = 0; let m2 = 0;
      for (const i of region.px) { m += full[i]; m2 += full[i] * full[i]; }
      m /= region.area;
      const spread = Math.sqrt(Math.max(0, m2 / region.area - m * m));
      candidates.push({ x: region.cx, y: region.cy, dark, area: region.area / unit, ratio, fill: region.area / (region.box[0] * region.box[1]), contrast: region.contrast, peak: region.peak, spread });
      // велика рівно залита пляма — друк (ромб, яблучко), у пробоїні рвані волокна й підкладка
      if (region.area > unit * 2 && spread < region.contrast * 0.15) continue;
      // Розмір пробоїни гуляє (пружний папір менший за кулю, рвані краї — більші), тож кругла пляма
      // до 2,5 площі кулі — одна пробоїна; ділимо лише витягнуту або явно більшу.
      const k = ratio < 1.5 && region.area < unit * 2.5 ? 1 : Math.min(8, Math.max(1, Math.round(region.area / unit)));
      // надто витягнута пляма — залишок лінії чи цифри (щілина від кулі під кутом — ще ні)
      // і злиплих пробоїн багато, а пляма — смуга: це складка чи лінія, групи бувають компактні
      if (ratio > 3.2 || (k === 1 && ratio > 2.6) || (k >= 3 && ratio > 2.1)) continue;
      const centers = k > 1 ? split(region, k, width) : [[region.cx, region.cy]];
      for (const [cx, cy] of centers) found.push({ x: cx, y: cy, dark, sure: k === 1 && region.contrast > CONTRAST * 1.5, contrast: region.contrast });
    }
  }
  // Та сама пробоїна в обох каналах (темна діра й світлий клапоть поруч) — лишаємо контрастнішу.
  found.sort((a, b) => b.contrast - a.contrast);
  const holes = [];
  for (const f of found) {
    if (holes.some((o) => Math.hypot(o.x - f.x, o.y - f.y) < d * (o.dark === f.dark ? 0.6 : 1.1))) continue;
    holes.push(f);
  }
  const W = src.width;
  const H = src.height;
  const norm = (f) => [(x0 + f.x / s) / W, (y0 + f.y / s) / H];
  return { holes: holes.map((f) => ({ p: norm(f), sure: f.sure })), candidates: candidates.map((c) => ({ ...c, p: norm(c) })), error: null };
}
