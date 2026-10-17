// «Кучність»: розмітка фото мішені (масштаб, точка прицілювання, пробоїни груп) і її вигляд.
// Координати міток — частки ширини й висоти фото (0–1): мініатюра й статистика не потребують повного файлу.
import { h, vibrate } from './ui.js';
import { t, locale } from './i18n.js';
import { decode } from './photos.js';
import * as M from './model.js';
import { findHoles } from './holes.js';

export const COLORS = ['#ff4d4d', '#38b6ff', '#ffd23f', '#4ade80', '#d27bff', '#ff9f43'];
export const UNITS = [['cm', 'см'], ['moa', 'MOA'], ['mil', 'MRAD']];
export const CLICKS = [['mil0.1', '0,1 MRAD'], ['mil0.05', '0,05 MRAD'], ['moa0.25', '¼ MOA'], ['moa0.125', '⅛ MOA'], ['moa0.5', '½ MOA'], ['moa1', '1 MOA'],
  ['mm13', '13 мм / 100 м'], ['mm16', '16 мм / 100 м']];
export const SCALE_MM = [10, 25.4, 50, 100];

const HIT = 24;
const LOUPE = 128;
const LOUPE_ZOOM = 3;
const MOVE = 6;

// Мітка кінця лінії масштабу → [лінія, кінець]
const END = { a: ['scale', 'a'], b: ['scale', 'b'], c: ['scale2', 'a'], d: ['scale2', 'b'] };

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// Ключ пробоїни для позначок «знайдено автоматично»: переживає ↶ (історія — JSON), а перетягнута пробоїна — вже своя.
const holeKey = (p) => `${p[0]},${p[1]}`;
const color = (i) => COLORS[i % COLORS.length];
// Кольори розмітки — поза палітрою пробоїн і лінії масштабу: світлі відтінки зливалися з папером.
const SPAN = '#ff2d95';   // лінія між двома найдальшими пробоїнами — розкид
const RING = '#00e5c0';   // кільце від СТВ — середній радіус
const BOX = '#5ea8ff';    // рамка габариту — ширина × висота

/** Число за мовою інтерфейсу з фіксованою кількістю знаків. */
export function num(v, digits = 1) {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Відрізок у мм — у вибраних одиницях; кутові без дистанції не порахувати, тоді см. */
export function length(mm, unit, distance) {
  if (unit !== 'cm' && distance > 0) return `${num(M.toAngle(mm, distance, unit), 2)} ${unit === 'moa' ? 'MOA' : 'MRAD'}`;
  return `${num(mm / 10, 1)} ${t('см')}`;
}

/** Ширина × висота з одиницею один раз: «3,0 × 2,4 см». */
export function size(w, hh, unit, distance) {
  if (unit !== 'cm' && distance > 0) {
    return `${num(M.toAngle(w, distance, unit), 2)} × ${num(M.toAngle(hh, distance, unit), 2)} ${unit === 'moa' ? 'MOA' : 'MRAD'}`;
  }
  return `${num(w / 10, 1)} × ${num(hh / 10, 1)} ${t('см')}`;
}

// Напрямок поправки — як позначено на барабані прицілу
const DIRS = { up: ['↑', 'вверх (UP)'], down: ['↓', 'вниз (DOWN)'], left: ['←', 'влево (L)'], right: ['→', 'вправо (R)'] };

/**
 * Поправка прицілу по осі: зсунути влучання назустріч зміщенню СТП. mm — зміщення по осі (x праворуч, y вгору).
 * { arrow, word, angle, unit, clicks } або null — немає ціни клацання чи дистанції, або менше пів клацання.
 */
function axisFix(mm, axis, distance, click) {
  const c = M.clickValue(click);
  if (!c || !(distance > 0) || Math.abs(mm) < 0.5) return null;
  const angle = M.toAngle(Math.abs(mm), distance, c.unit);
  // toFixed прибирає похибку дробу: 0,35 / 0,1 = 3,4999… мало б округлитися до 4, а не до 3
  const clicks = Math.round(Number((angle / c.value).toFixed(6)));
  if (!clicks) return null;
  const [arrow, word] = DIRS[axis === 'x' ? (mm > 0 ? 'left' : 'right') : (mm > 0 ? 'down' : 'up')];
  return { arrow, word: t(word), angle, unit: c.unit === 'moa' ? 'MOA' : 'MRAD', clicks };
}

/**
 * Поправка вертикалі з таблиці DOPE (мрад, плюс — вгору) в одиницях барабана: «↑ 1,20 MRAD = 12 клац.».
 * Без ціни клацання — лише кут у мрад; 0 — «0» (дистанція пристрілки).
 */
export function elevText(mrad, click) {
  if (Math.abs(mrad) < 0.0005) return '0';
  const [arrow] = DIRS[mrad > 0 ? 'up' : 'down'];
  const c = M.clickValue(click);
  const unit = c?.unit ?? 'mil';
  const angle = Math.abs(M.fromMrad(mrad, unit));
  const text = `${arrow} ${num(angle, 2)} ${unit === 'moa' ? 'MOA' : 'MRAD'}`;
  if (!c) return text;
  // toFixed прибирає похибку дробу, як і в поправках мішені
  return `${text} = ${Math.round(Number((angle / c.value).toFixed(6)))} ${t('щелч.')}`;
}

/** Винос у сітці прицілу: 'mil' чи 'moa' — у поділках сітки, інакше (точка, без сітки) — сантиметри на цілі; arrow — напрям (для вітру ← →). */
export function holdText(mrad, distance, reticle, arrow = mrad > 0 ? '↑' : '↓') {
  if (Math.abs(mrad) < 0.0005) return '0';
  const cm = `${num(Math.abs(M.fromMrad(mrad, 'cm', distance)), 0)} ${t('см')}`;
  if (reticle !== 'mil' && reticle !== 'moa') return `${arrow} ${cm}`;
  return `${arrow} ${num(Math.abs(M.fromMrad(mrad, reticle)), 1)} ${reticle === 'moa' ? 'MOA' : 'MRAD'} · ${cm}`;
}

/** Поправки групи: вертикаль, потім горизонталь; wantUp — мм, на скільки влучання має бути вище точки прицілювання. */
export function corrections(stats, { distance, click, wantUp = 0 }) {
  if (!stats.offset) return [];
  return [axisFix(stats.offset[1] - wantUp, 'y', distance, click), axisFix(stats.offset[0], 'x', distance, click)].filter(Boolean);
}

/** Зміщення СТП словами: «выше 1,2 см · левее 0,4 см». */
export function offsetText([dx, dy], unit, distance) {
  const parts = [];
  if (Math.abs(dy) >= 0.5) parts.push(`${dy > 0 ? t('выше') : t('ниже')} ${length(Math.abs(dy), unit, distance)}`);
  if (Math.abs(dx) >= 0.5) parts.push(`${dx > 0 ? t('правее') : t('левее')} ${length(Math.abs(dx), unit, distance)}`);
  return parts.length ? parts.join(' · ') : t('в точке прицеливания');
}

/**
 * Пари [підпис, значення] для однієї групи: деталі, картинка «Поделиться».
 * wantUp — мм, на скільки влучання має бути вище точки прицілювання (пристрілка на іншу дистанцію).
 */
export function groupRows(stats, { unit, distance, click, wantUp = 0 }) {
  // unit 'all' — кожне значення одразу в см, MOA і MRAD (кутові — лише з дистанцією)
  const units = unit !== 'all' ? [unit] : distance > 0 ? ['cm', 'moa', 'mil'] : ['cm'];
  const len = (mm) => units.map((u) => length(mm, u, distance)).join(' · ');
  const rows = [[t('Выстрелов'), String(stats.n)]];
  if (stats.n >= 2) {
    rows.push(
      [t('Размах'), len(stats.spread)],
      [t('Средний радиус'), len(stats.meanRadius)],
      [t('Ширина × высота'), units.map((u) => size(stats.width, stats.height, u, distance)).join(' · ')]);
  }
  if (stats.offset && unit === 'all') {
    const [dx, dy] = stats.offset;
    rows.push(
      [t('СТП по вертикали'), Math.abs(dy) < 0.5 ? t('в точке прицеливания') : `${dy > 0 ? t('выше') : t('ниже')} ${len(Math.abs(dy))}`],
      [t('СТП по горизонтали'), Math.abs(dx) < 0.5 ? t('в точке прицеливания') : `${dx > 0 ? t('правее') : t('левее')} ${len(Math.abs(dx))}`]);
  } else if (stats.offset) {
    rows.push([t('СТП'), offsetText(stats.offset, unit, distance)]);
  }
  if (stats.offset) {
    if (wantUp) rows.push([t('Нужное попадание'), `${wantUp > 0 ? t('выше') : t('ниже')} ${len(Math.abs(wantUp))}`]);
    const fix = corrections(stats, { distance, click, wantUp })
      .map((f) => `${f.arrow} ${f.word} ${num(f.angle, 2)} ${f.unit} = ${t('{n} щелч.', { n: f.clicks })}`);
    if (fix.length) rows.push([t('Поправка'), fix.join(' · ')]);
  }
  return rows;
}

/**
 * Мітки поверх зображення. map(p) — частки фото → пікселі полотна, r — розмір мітки.
 * active — група, що редагується (інші блідіші), selected — виділена мітка, scale — показати масштаб.
 * holeR — радіус кулі в пікселях полотна (кільце пробоїни не менше за нього), found / unsure — ключі
 * пробоїн, знайдених автоматично (пунктир) і в злиплих місцях («?»).
 */
export function drawMarks(ctx, marks, map, r, { active = null, selected = null, scale = false, aspect = 1, mm = null, unit = 'cm', distance = 0, holeR = 0, found = null, unsure = null } = {}) {
  const halo = (draw, stroke, width) => {
    ctx.lineWidth = width + r * 0.35;
    ctx.strokeStyle = 'rgb(0 0 0 / .65)';
    draw();
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    draw();
    ctx.stroke();
  };
  const isSel = (kind, g, i) => selected && selected.kind === kind && selected.g === g && selected.i === i;
  // Підпис фігури тими самими одиницями, що вибрані в картці; mm — міліметрів у пікселі полотна.
  const tag = (text, x, y, color, align = 'center') => {
    ctx.font = `700 ${Math.round(r * 1.6)}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.lineWidth = r * 0.5;
    ctx.strokeStyle = 'rgb(0 0 0 / .8)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  ctx.save();
  ctx.lineCap = 'round';
  // дві лінії масштабу: кінці першої — мітки a, b, другої — c, d
  for (const [line, ends] of scale ? [['scale', ['a', 'b']], ['scale2', ['c', 'd']]] : []) {
    if (!marks[line]) continue;
    const { a, b, mm } = marks[line];
    const pa = a && map(a);
    const pb = b && map(b);
    if (pa && pb) {
      ctx.setLineDash([r * 0.9, r * 0.6]);
      halo(() => { ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...pb); }, '#5ee6ff', r * 0.3);
      ctx.setLineDash([]);
      if (mm > 0) {
        ctx.font = `700 ${Math.round(r * 1.7)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = r * 0.5;
        ctx.strokeStyle = 'rgb(0 0 0 / .75)';
        const label = `${num(mm, mm % 1 ? 1 : 0)} ${t('мм')}`;
        const x = (pa[0] + pb[0]) / 2;
        const y = (pa[1] + pb[1]) / 2 - r;
        ctx.strokeText(label, x, y);
        ctx.fillStyle = '#5ee6ff';
        ctx.fillText(label, x, y);
      }
    }
    for (const [kind, p] of [[ends[0], pa], [ends[1], pb]]) {
      if (!p) continue;
      const s = r * (isSel(kind) ? 1.2 : 0.8);
      halo(() => { ctx.beginPath(); ctx.rect(p[0] - s, p[1] - s, s * 2, s * 2); }, isSel(kind) ? '#fff' : '#5ee6ff', r * 0.3);
    }
  }
  const labels = [];
  (marks.groups ?? []).forEach((group, g) => {
    ctx.globalAlpha = active === null || active === g ? 1 : 0.5;
    const c = color(g);
    if (group.holes.length >= 2) {
      const pts = group.holes.map(map);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const cx = xs.reduce((s, v) => s + v, 0) / pts.length;
      const cy = ys.reduce((s, v) => s + v, 0) / pts.length;
      // Кожна фігура — число з картки: лінія між двома найдальшими пробоїнами (розкид), кільце від
      // СТВ (середній радіус), пунктирна рамка (габарит). aspect — у скільки разів міліметр по
      // вертикалі «довший» за горизонтальний (друга лінія масштабу): тоді коло в міліметрах — еліпс
      // у пікселях, інакше малюнок розходився б із цифрою.
      const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * aspect);
      let span = [pts[0], pts[1]];
      let spanLen = 0;
      for (const a of pts) for (const b of pts) if (dist(a, b) > spanLen) { spanLen = dist(a, b); span = [a, b]; }
      const meanR = pts.reduce((s, [x, y]) => s + Math.hypot(x - cx, (y - cy) * aspect), 0) / pts.length;
      const [bx0, bx1, by0, by1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      ctx.save();
      ctx.globalAlpha *= 0.75;
      ctx.setLineDash([r * 0.7, r * 0.5]);
      halo(() => { ctx.beginPath(); ctx.rect(bx0, by0, bx1 - bx0, by1 - by0); }, BOX, r * 0.1);
      ctx.setLineDash([]);
      halo(() => { ctx.beginPath(); ctx.moveTo(...span[0]); ctx.lineTo(...span[1]); }, SPAN, r * 0.12);
      halo(() => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, meanR, meanR / aspect, 0, 0, Math.PI * 2);
      }, RING, r * 0.12);
      ctx.restore();
      if (mm) {
        // Розкид — над своєю лінією й уздовж неї (перевертаємо, щоб не читалося догори
        // дриґом), середній радіус — горизонтально над кільцем. Малюємо наприкінці,
        // поверх усього, щоб пробоїни не затирали цифри.
        const ang = Math.atan2(span[1][1] - span[0][1], span[1][0] - span[0][0]);
        labels.push({ text: length(spanLen * mm, unit, distance), color: SPAN, alpha: ctx.globalAlpha,
          x: (span[0][0] + span[1][0]) / 2, y: (span[0][1] + span[1][1]) / 2,
          ang: Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang, off: -r * 0.9 });
        labels.push({ text: length(meanR * mm, unit, distance), color: RING, alpha: ctx.globalAlpha,
          x: cx, y: cy - meanR / aspect - r * 0.6, ang: 0, off: 0 });
      }
    }
    group.holes.forEach((hole, i) => {
      const [x, y] = map(hole);
      const sel = isSel('hole', g, i);
      const R = Math.max(r, holeR) + (sel ? r * 0.35 : 0);
      if (found?.has(holeKey(hole))) ctx.setLineDash([r * 0.55, r * 0.4]);
      halo(() => { ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); }, sel ? '#fff' : c, r * 0.3);
      ctx.setLineDash([]);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      if (unsure?.has(holeKey(hole))) tag('?', x + R * 0.8, y - R * 0.8, c, 'left');
    });
    if (group.holes.length >= 2) {
      const n = group.holes.length;
      const [x, y] = map([group.holes.reduce((s, p) => s + p[0], 0) / n, group.holes.reduce((s, p) => s + p[1], 0) / n]);
      const s = r * 0.9;
      halo(() => { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }, c, r * 0.3);
    }
  });
  ctx.globalAlpha = 1;
  if (marks.poa) {
    const [x, y] = map(marks.poa);
    const s = r * (isSel('poa') ? 2.6 : 2.2);
    const stroke = isSel('poa') ? '#fff' : '#ff3df5';
    halo(() => {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
      ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.25, y);
      ctx.moveTo(x + s * 0.25, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s); ctx.lineTo(x, y - s * 0.25);
      ctx.moveTo(x, y + s * 0.25); ctx.lineTo(x, y + s);
    }, stroke, r * 0.25);
  }
  for (const l of labels) {
    ctx.globalAlpha = l.alpha;
    ctx.save();
    ctx.translate(l.x, l.y);
    if (l.ang) ctx.rotate(l.ang);
    tag(l.text, 0, l.off, l.color);
    ctx.restore();
  }
  ctx.restore();
}

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

/** Міліметр по вертикалі відносно міліметра по горизонталі: 1, доки не поставлено другу лінію масштабу. */
function aspectOf(marks, photo) {
  const k = M.scaleXY(marks.scale, marks.scale2, { w: photo.width ?? photo.w, h: photo.height ?? photo.h });
  return k?.two ? k.y / k.x : 1;
}

/** Скільки міліметрів в одному пікселі полотна по горизонталі — щоб підписати фігури. */
function mmPerCanvasPx(marks, photo, canvasW) {
  const dims = { w: photo.width ?? photo.w, h: photo.height ?? photo.h };
  const k = M.scaleXY(marks.scale, marks.scale2, dims);
  return k ? (k.x * dims.w) / canvasW : null;
}

/**
 * Зображення мішені з мітками в canvas: ширина width пікселів (висота — за пропорцією фото).
 * unit — підписати фігури числами в цих одиницях (на дрібних прев'ю не треба).
 */
export async function paintPreview(canvas, src, marks, width, { unit = null, distance = 0, active = null } = {}) {
  const img = await loadImage(src);
  canvas.width = Math.round(width);
  canvas.height = Math.round((width * img.height) / img.width);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawMarks(ctx, marks, (p) => [p[0] * canvas.width, p[1] * canvas.height], Math.max(3, canvas.width / 80),
    { aspect: aspectOf(marks, img), mm: unit ? mmPerCanvasPx(marks, img, canvas.width) : null, unit, distance, active });
}

/**
 * Картинка, щоб поділитися: фото з мітками й підсумок під ним.
 * lines — [{ text, color?, bold? }]. Повертає JPEG.
 */
export async function shareImage(src, marks, lines, { unit = null, distance = 0 } = {}) {
  const img = await loadImage(src);
  const width = Math.min(1600, Math.max(900, img.width));
  const photoH = Math.round((width * img.height) / img.width);
  const font = Math.round(width / 42);
  const pad = Math.round(font * 1.2);
  const lineH = Math.round(font * 1.45);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = photoH + pad * 2 + lines.length * lineH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101310';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, photoH);
  drawMarks(ctx, marks, (p) => [p[0] * width, p[1] * photoH], width / 110,
    { aspect: aspectOf(marks, img), mm: unit ? mmPerCanvasPx(marks, img, width) : null, unit, distance });
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.font = `${line.bold ? 700 : 400} ${font}px system-ui, sans-serif`;
    ctx.fillStyle = line.color ?? '#e8ece4';
    ctx.fillText(line.text, pad, photoH + pad + lineH * (i + 0.5), width - pad * 2);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/**
 * Розмітка на весь екран. marks — { scale, poa, groups }, opts — { distance, unit, click, scaleMm, holeMm }:
 * holeMm — діаметр кулі (кільце пробоїни в справжній розмір і пошук пробоїн). Повертає нові marks або null, якщо скасовано.
 */
export async function markTarget(blob, marks, { distance, unit, click, scaleMm = 100, holeMm = null }) {
  let src;
  try {
    src = await decode(blob);
  } catch {
    throw new Error(t('Формат фото не поддерживается'));
  }
  const W = src.width;
  const H = src.height;
  const st = {
    scale: { a: null, b: null, mm: scaleMm, ...structuredClone(marks.scale ?? {}) },
    poa: marks.poa ? [...marks.poa] : null,
    groups: marks.groups?.length ? structuredClone(marks.groups) : [{ holes: [] }],
  };
  st.scale2 = { a: null, b: null, mm: st.scale.mm, ...structuredClone(marks.scale2 ?? {}) };
  let mode = st.scale.a && st.scale.b ? 'holes' : 'scale';
  // лінія масштабу, яку зараз ставимо: 'scale' — основна, 'scale2' — поперечна
  let line = 'scale';
  let active = st.groups.length - 1;
  let selected = null;
  const history = [];
  // знайдені автоматично (пунктир) і в злиплих місцях («?»); notice — що сказав пошук
  const found = new Set();
  const unsure = new Set();
  let notice = null;
  // fitted — зображення вписане в екран: тоді при зміні розміру сцени вписуємо заново
  const view = { k: 1, x: 0, y: 0, fit: 1, fitted: true };

  return new Promise((done) => {
    const canvas = h('canvas', { class: 'tg-canvas' });
    const loupe = h('canvas', { class: 'tg-loupe', hidden: true, width: LOUPE, height: LOUPE });
    const stats = h('div', { class: 'tg-stats' });
    const stage = h('div', { class: 'tg-stage' }, canvas, loupe, stats);
    const modeRow = h('div', { class: 'chips tg-modes' });
    const groupRow = h('div', { class: 'chips tg-groups' });
    const mmInput = h('input', {
      type: 'number', inputmode: 'decimal', step: 'any', min: 0, 'aria-label': t('Между точками, мм'),
      oninput: () => {
        const v = Number(String(mmInput.value).replace(',', '.'));
        if (v > 0) { st[line].mm = v; paint(); }
      },
    });
    mmInput.value = st.scale.mm ?? '';
    const lineRow = h('div', { class: 'chips tg-lines' });
    const scaleRow = h('div', { class: 'tg-scale' },
      lineRow,
      h('label', {}, h('span', {}, t('Между точками, мм')), mmInput),
      h('div', { class: 'chips' }, SCALE_MM.map((v) => h('button', {
        type: 'button',
        onclick: () => { st[line].mm = v; mmInput.value = v; paint(); },
      }, num(v, v % 1 ? 1 : 0)))));
    const hint = h('div', { class: 'tg-hint' });
    const tool = (label, title, onclick) => h('button', { type: 'button', class: 'editor-tool', title, 'aria-label': title, onclick }, label);
    const findBtn = h('button', { type: 'button', onclick: () => autoFind() }, t('🔍 Найти пробоины'));
    const findRow = h('div', { class: 'chips tg-find' }, findBtn);
    const undoBtn = tool('↶', t('Отменить последнее'), undo);
    const delBtn = tool('✕', t('Удалить метку'), removeSelected);

    const toScreen = (p) => [view.x + p[0] * W * view.k, view.y + p[1] * H * view.k];
    const toNorm = ([sx, sy]) => [(sx - view.x) / view.k / W, (sy - view.y) / view.k / H];
    const inside = (n) => n[0] >= 0 && n[0] <= 1 && n[1] >= 0 && n[1] <= 1;
    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    function fit() {
      view.fit = Math.min(stage.clientWidth / W, stage.clientHeight / H);
      view.k = view.fit;
      view.x = (stage.clientWidth - W * view.k) / 2;
      view.y = (stage.clientHeight - H * view.k) / 2;
      view.fitted = true;
    }
    // Сцена змінює висоту разом із панеллю (інший режим — інші рядки), тож полотно стежить за нею.
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(stage.clientWidth * dpr);
      const hh = Math.round(stage.clientHeight * dpr);
      if (!w || !hh || (w === canvas.width && hh === canvas.height)) return;
      canvas.width = w;
      canvas.height = hh;
      if (view.fitted) fit();
      else view.fit = Math.min(stage.clientWidth / W, stage.clientHeight / H);
      paint();
    }
    const observer = new ResizeObserver(resize);
    function paint() {
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, view.x, view.y, W * view.k, H * view.k);
      const mm = mmPerCanvasPx(st, { w: W, h: H }, W * view.k);
      drawMarks(ctx, st, toScreen, 8, { active: mode === 'holes' ? active : null, selected, scale: true,
        aspect: aspectOf(st, { w: W, h: H }), mm, unit, distance, holeR: holeR(mm), found, unsure });
      panel();
    }
    function paintLoupe(at, n) {
      const dpr = window.devicePixelRatio || 1;
      loupe.width = LOUPE * dpr;
      loupe.height = LOUPE * dpr;
      const ctx = loupe.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const z = view.k * LOUPE_ZOOM;
      const c = LOUPE / 2;
      const map = (p) => [c + (p[0] - n[0]) * W * z, c + (p[1] - n[1]) * H * z];
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, LOUPE, LOUPE);
      ctx.drawImage(src, c - n[0] * W * z, c - n[1] * H * z, W * z, H * z);
      drawMarks(ctx, st, map, 8, { active: mode === 'holes' ? active : null, selected, scale: true, aspect: aspectOf(st, { w: W, h: H }),
        holeR: holeR(mmPerCanvasPx(st, { w: W, h: H }, W * z)), found, unsure });
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgb(0 0 0 / .7)';
      const cross = () => {
        ctx.beginPath();
        ctx.moveTo(c - 18, c); ctx.lineTo(c - 4, c);
        ctx.moveTo(c + 4, c); ctx.lineTo(c + 18, c);
        ctx.moveTo(c, c - 18); ctx.lineTo(c, c - 4);
        ctx.moveTo(c, c + 4); ctx.lineTo(c, c + 18);
        ctx.stroke();
      };
      cross();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      cross();
      // над пальцем; біля верхнього краю — під ним
      let top = at[1] - LOUPE - 40;
      if (top < 4) top = at[1] + 40;
      loupe.style.left = `${clamp(at[0] - c, 4, stage.clientWidth - LOUPE - 4)}px`;
      loupe.style.top = `${top}px`;
      loupe.hidden = false;
    }

    /** Радіус кулі в пікселях полотна; mm — міліметрів у пікселі полотна. */
    const holeR = (mm) => (holeMm && mm ? holeMm / 2 / mm : 0);

    /**
     * Пошук пробоїн у видимій частині фото: збільшена мішень — менше чужого (цифри, тло) і видніші пробоїни.
     * Знайдене стає пробоїнами активної групи з позначкою «перевірити»; ↶ прибирає все разом.
     */
    function autoFind() {
      const k = M.mmPerPx(st.scale, { w: W, h: H });
      if (!k) return;
      const holePx = (holeMm || 5.6) / k;
      const rect = [Math.max(0, -view.x / view.k), Math.max(0, -view.y / view.k),
        Math.min(W, (stage.clientWidth - view.x) / view.k), Math.min(H, (stage.clientHeight - view.y) / view.k)];
      findBtn.disabled = true;
      findBtn.textContent = t('Ищу…');
      // дати кнопці перемалюватися: пошук займає до секунди
      setTimeout(() => {
        const { holes, error } = findHoles(src, rect, holePx);
        findBtn.disabled = false;
        findBtn.textContent = t('🔍 Найти пробоины');
        if (error) {
          notice = error === 'zoom' ? t('Увеличьте мишень на экране — пробоины слишком мелкие, чтобы их различить.')
            : t('Пробоины на фото слишком мелкие — снимите мишень ближе.');
          paint();
          return;
        }
        const group = st.groups[active].holes;
        const near = (p) => group.some((q) => Math.hypot((p[0] - q[0]) * W, (p[1] - q[1]) * H) < holePx * 0.6);
        const fresh = holes.filter((x) => !near(x.p));
        if (fresh.length) {
          snapshot();
          for (const x of fresh) {
            group.push(x.p);
            found.add(holeKey(x.p));
            if (!x.sure) unsure.add(holeKey(x.p));
          }
          vibrate();
        }
        const doubt = fresh.filter((x) => !x.sure).length;
        notice = fresh.length
          ? [t('Найдено {n} — проверьте: лишнюю коснитесь и ✕, пропущенную поставьте сами.', { n: fresh.length }),
            doubt ? t('Со знаком «?» — {n}: в слипшихся пробоинах или неуверенно.', { n: doubt }) : null].filter(Boolean).join(' ')
          : t('Новых пробоин не нашёл — поставьте вручную или увеличьте мишень на экране.');
        selected = null;
        paint();
      }, 30);
    }

    /**
     * Розділити активну групу за відстанню: пробоїни, ближчі за шість калібрів одна до одної,
     * лишаються разом (одиночне зчеплення). Дві серії на одній мішені розходяться самі.
     */
    function splitGroup() {
      const holes = st.groups[active].holes;
      const mm = M.mmPerPx(st.scale, { w: W, h: H });
      // діаметр кулі в пікселях фото; без калібру й масштабу беремо 2% ширини
      const px = holeMm && mm ? holeMm / mm : W * 0.02;
      const limit = px * 6;
      const parent = holes.map((_, i) => i);
      const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (let i = 0; i < holes.length; i += 1) {
        for (let j = i + 1; j < holes.length; j += 1) {
          const dx = (holes[i][0] - holes[j][0]) * W;
          const dy = (holes[i][1] - holes[j][1]) * H;
          if (Math.hypot(dx, dy) <= limit) parent[find(i)] = find(j);
        }
      }
      const buckets = new Map();
      holes.forEach((hole, i) => {
        const root = find(i);
        if (!buckets.has(root)) buckets.set(root, []);
        buckets.get(root).push(hole);
      });
      if (buckets.size < 2) {
        notice = t('Все пробоины рядом — делить не на что.');
        paint();
        return;
      }
      snapshot();
      const parts = [...buckets.values()].sort((a, b) => b.length - a.length);
      st.groups[active].holes = parts[0];
      for (const rest of parts.slice(1)) st.groups.push({ holes: rest });
      selected = null;
      notice = t('Групп стало: {n}', { n: st.groups.length });
      vibrate();
      paint();
    }

    /** Активну групу видаляє кнопка поруч із «+ група» — помилку повертає ↶. */
    function dropGroup() {
      snapshot();
      st.groups.splice(active, 1);
      if (!st.groups.length) st.groups.push({ holes: [] });
      active = Math.min(active, st.groups.length - 1);
      selected = null;
      vibrate();
      paint();
    }

    function panel() {
      modeRow.replaceChildren(...[['holes', t('Пробоины')], ['poa', t('Точка прицеливания')], ['scale', t('Масштаб')]].map(([key, label]) => h('button', {
        type: 'button', class: key === mode ? 'on' : '',
        onclick: () => { mode = key; selected = null; paint(); },
      }, label)));
      groupRow.hidden = mode !== 'holes';
      findRow.hidden = mode !== 'holes';
      findBtn.disabled = !M.mmPerPx(st.scale, { w: W, h: H });
      findBtn.title = findBtn.disabled ? t('Сначала задайте масштаб') : t('Ищет в видимой части фото');
      groupRow.replaceChildren(
        ...st.groups.map((g, i) => h('button', {
          // Вибрана пробоїна — тап по номеру групи переносить її туди: інакше довелося б
          // видаляти й ставити заново (а на одній мішені буває дві серії).
          type: 'button', class: `${i === active ? 'on' : ''} ${selected?.kind === 'hole' && selected.g !== i ? 'tg-move' : ''}`.trim(),
          onclick: () => {
            if (selected?.kind === 'hole' && selected.g !== i) {
              snapshot();
              const [p] = st.groups[selected.g].holes.splice(selected.i, 1);
              st.groups[i].holes.push(p);
              active = i;
              selected = { kind: 'hole', g: i, i: st.groups[i].holes.length - 1 };
              vibrate();
              paint();
              return;
            }
            active = i;
            selected = null;
            paint();
          },
        }, h('i', { class: 'tg-swatch', style: `background:${color(i)}` }), `${i + 1} · ${g.holes.length}`)),
        h('button', {
          type: 'button',
          onclick: () => {
            snapshot();
            st.groups.push({ holes: [] });
            active = st.groups.length - 1;
            selected = null;
            paint();
          },
        }, t('+ группа')),
        // ділити є сенс лише коли пробоїн достатньо, щоб вийшло дві купи
        h('button', {
          type: 'button',
          disabled: st.groups[active].holes.length < 4,
          onclick: () => splitGroup(),
        }, t('⫲ Разделить')),
        h('button', {
          type: 'button',
          disabled: st.groups.length === 1 && !st.groups[0].holes.length,
          onclick: dropGroup,
        }, t('✕ группа')));
      scaleRow.hidden = mode !== 'scale';
      lineRow.replaceChildren(...[['scale', t('Линия 1')], ['scale2', t('Линия 2 ↕')]].map(([key, label]) => h('button', {
        type: 'button', class: key === line ? 'on' : '',
        onclick: () => { line = key; selected = null; mmInput.value = st[line].mm ?? ''; paint(); },
      }, label)));
      hint.textContent = mode === 'scale'
        ? (line === 'scale'
          ? t('Отметьте две точки, расстояние между которыми знаете: клетки мишени, линейку, край листа.')
          : [t('Вторая линия — поперёк первой, лучше вертикально: если фото снято под углом, высота посчитается отдельно. Можно не ставить.'),
            scaleNote()].filter(Boolean).join(' '))
        : mode === 'poa'
          ? t('Отметьте точку, в которую целились.')
          : notice ?? (selected?.kind === 'hole' && st.groups.length > 1
            ? t('Пробоина выбрана: ✕ удалит её, а номер группы — перенесёт в ту группу.')
            : t('Нажмите на центр пробоины. Держите палец — появится лупа: ведите и отпустите. Двумя пальцами — увеличить.'));
      const k = M.mmPerPx(st.scale, { w: W, h: H });
      const group = M.targetStats(st, { w: W, h: H })[active];
      if (!k) stats.textContent = t('Задайте масштаб — без него размеры не посчитать');
      else if (!group?.stats || group.stats.n < 2) stats.textContent = t('Группа {n}: отметьте хотя бы две пробоины', { n: active + 1 });
      else {
        const s = group.stats;
        stats.textContent = [
          t('Группа {n}', { n: active + 1 }),
          t('{n} выстр.', { n: s.n }),
          `${t('размах')} ${length(s.spread, unit, distance)}`,
          s.offset ? `${t('СТП')} ${offsetText(s.offset, unit, distance)}` : null].filter(Boolean).join(' · ');
      }
      undoBtn.disabled = !history.length;
      delBtn.disabled = !selected;
    }

    /** Що дала друга лінія: на скільки висота відрізняється від ширини, або чому її не враховано. */
    function scaleNote() {
      if (!st.scale2.a || !st.scale2.b) return null;
      const k = M.scaleXY(st.scale, st.scale2, { w: W, h: H });
      if (!k) return null;
      if (!k.two) return t('Линии почти параллельны или не сходятся по длине — вторая не учтена.');
      return t('Масштаб по высоте отличается от ширины на {p}%.', { p: num((k.y / k.x - 1) * 100, 1) });
    }

    function snapshot() {
      history.push(JSON.stringify({ scale: st.scale, scale2: st.scale2, poa: st.poa, groups: st.groups }));
      if (history.length > 200) history.shift();
    }
    function undo() {
      const prev = history.pop();
      if (!prev) return;
      Object.assign(st, JSON.parse(prev));
      mmInput.value = st[line].mm ?? '';
      active = Math.min(active, st.groups.length - 1);
      selected = null;
      paint();
    }
    function removeSelected() {
      if (!selected) return;
      snapshot();
      if (selected.kind === 'hole') st.groups[selected.g].holes.splice(selected.i, 1);
      else if (selected.kind === 'poa') st.poa = null;
      else { const [l, end] = END[selected.kind]; st[l][end] = null; }
      selected = null;
      paint();
    }
    function place(n) {
      const s = st[line];
      // Обидві точки лінії вже стоять — тап нічого не зсуває: точку переставляють перетягуванням.
      if (mode === 'scale' && s.a && s.b) return;
      snapshot();
      notice = null;
      if (mode === 'holes') st.groups[active].holes.push(n);
      else if (mode === 'poa') st.poa = n;
      else if (!s.a) s.a = n;
      else {
        s.b = n;
        // Масштаб задано — далі майже завжди пробоїни, тож не змушуємо перемикати руками.
        if (line === 'scale') mode = 'holes';
      }
      selected = null;
      vibrate();
    }
    function setPoint(hit, n) {
      if (hit.kind === 'hole') st.groups[hit.g].holes[hit.i] = n;
      else if (hit.kind === 'poa') st.poa = n;
      else { const [l, end] = END[hit.kind]; st[l][end] = n; }
    }
    /** Мітка поточного режиму під пальцем. */
    function hitTest(at) {
      // Пробоїни беремо з усіх груп: інакше чужу не вибрати, щоб перенести чи прибрати.
      // Своя група першою — коли пробоїни двох груп злиплися, перемагає активна.
      const list = mode === 'holes'
        ? [active, ...st.groups.keys()].filter((g, i, a) => a.indexOf(g) === i)
          .flatMap((g) => st.groups[g].holes.map((p, i) => ({ kind: 'hole', g, i, p })))
        : mode === 'poa'
          ? (st.poa ? [{ kind: 'poa', p: st.poa }] : [])
          : Object.entries(END).filter(([, [l, end]]) => l === line && st[l][end]).map(([kind, [l, end]]) => ({ kind, p: st[l][end] }));
      let best = null;
      for (const item of list) {
        const [x, y] = toScreen(item.p);
        const d = Math.hypot(x - at[0], y - at[1]);
        if (d <= HIT && (!best || d < best.d)) best = { ...item, d };
      }
      return best;
    }

    // Один палець — прицілитися з лупою й поставити мітку (або тягнути наявну),
    // два — масштаб і зсув. Миша: клік — мітка, тягнути порожнє місце — зсув, колесо — масштаб.
    const pointers = new Map();
    let action = null;
    let pinch = null;
    const pair = () => [...pointers.values()];
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, pos(e));
      if (pointers.size === 2) {
        action = null;
        loupe.hidden = true;
        const [a, b] = pair();
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: { ...view } };
        return;
      }
      if (pointers.size > 2) return;
      const at = pos(e);
      action = { id: e.pointerId, start: at, hit: hitTest(at), moved: false, mouse: e.pointerType === 'mouse', touched: false };
      if (!action.mouse) paintLoupe(at, action.hit ? action.hit.p : toNorm(at));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const at = pos(e);
      const last = pointers.get(e.pointerId);
      pointers.set(e.pointerId, at);
      if (pinch && pointers.size >= 2) {
        const [a, b] = pair();
        const k = clamp(pinch.view.k * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d), view.fit * 0.5, view.fit * 16);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const ix = (pinch.m[0] - pinch.view.x) / pinch.view.k;
        const iy = (pinch.m[1] - pinch.view.y) / pinch.view.k;
        Object.assign(view, { k, x: m[0] - ix * k, y: m[1] - iy * k, fitted: false });
        paint();
        return;
      }
      if (!action || e.pointerId !== action.id) return;
      if (!action.moved && Math.hypot(at[0] - action.start[0], at[1] - action.start[1]) > MOVE) action.moved = true;
      if (action.hit && action.moved) {
        if (!action.touched) { snapshot(); action.touched = true; }
        const n = [clamp(toNorm(at)[0], 0, 1), clamp(toNorm(at)[1], 0, 1)];
        setPoint(action.hit, n);
        action.hit.p = n;
        selected = { kind: action.hit.kind, g: action.hit.g, i: action.hit.i };
        paint();
        if (!action.mouse) paintLoupe(at, n);
      } else if (action.mouse && action.moved) {
        view.x += at[0] - last[0];
        view.y += at[1] - last[1];
        view.fitted = false;
        paint();
      } else if (!action.mouse) {
        paintLoupe(at, toNorm(at));
      }
    });
    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const at = pos(e);
      pointers.delete(e.pointerId);
      if (pinch) {
        if (!pointers.size) pinch = null;
        return;
      }
      loupe.hidden = true;
      if (!action || e.pointerId !== action.id) return;
      const { hit, moved, mouse } = action;
      action = null;
      if (e.type === 'pointercancel') { paint(); return; }
      if (hit && !moved) {
        selected = { kind: hit.kind, g: hit.g, i: hit.i };
        if (hit.kind === 'hole') active = hit.g;
      }
      else if (!hit && !(mouse && moved)) {
        const n = toNorm(at);
        if (inside(n)) place(n);
      }
      paint();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const at = pos(e);
      const k = clamp(view.k * Math.exp(-e.deltaY * 0.0015), view.fit * 0.5, view.fit * 16);
      const ix = (at[0] - view.x) / view.k;
      const iy = (at[1] - view.y) / view.k;
      Object.assign(view, { k, x: at[0] - ix * k, y: at[1] - iy * k, fitted: false });
      paint();
    }, { passive: false });

    const close = (result) => {
      root.remove();
      observer.disconnect();
      window.removeEventListener('popstate', cancel);
      document.removeEventListener('keydown', onKey);
      src.close?.();
      done(result);
    };
    const cancel = () => close(null);
    const onKey = (e) => {
      if (e.key === 'Escape') cancel();
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === document.body) removeSelected();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
    };
    const save = () => close({
      scale: st.scale.a || st.scale.b ? st.scale : (st.scale.mm ? { a: null, b: null, mm: st.scale.mm } : null),
      scale2: st.scale2.a || st.scale2.b ? st.scale2 : null,
      poa: st.poa,
      groups: st.groups.filter((g) => g.holes.length),
    });

    const root = h('div', { class: 'viewer tg-editor', role: 'dialog', 'aria-label': t('Разметка мишени') },
      h('header', { class: 'viewer-head' }, h('span', {}, t('Разметка мишени')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрыть'), onclick: cancel }, '✕')),
      stage,
      h('div', { class: 'tg-panel' },
        modeRow, groupRow, findRow, scaleRow, hint,
        h('div', { class: 'editor-row' }, undoBtn, delBtn, tool('⤢', t('Вписать в экран'), () => { fit(); paint(); }))),
      h('footer', { class: 'viewer-actions' },
        h('button', { type: 'button', class: 'btn', onclick: cancel }, t('Отмена')),
        h('button', { type: 'button', class: 'btn primary', onclick: save }, t('Сохранить'))));

    document.getElementById('layer').append(root);
    window.addEventListener('popstate', cancel, { once: true });
    document.addEventListener('keydown', onKey);
    paint();
    observer.observe(stage);
  });
}
