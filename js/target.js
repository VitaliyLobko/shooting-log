// «Кучність»: розмітка фото мішені (масштаб, точка прицілювання, пробоїни груп) і її вигляд.
// Координати міток — частки ширини й висоти фото (0–1): мініатюра й статистика не потребують повного файлу.
import { h, vibrate } from './ui.js';
import { t, locale } from './i18n.js';
import { decode } from './photos.js';
import * as M from './model.js';

export const COLORS = ['#ff4d4d', '#38b6ff', '#ffd23f', '#4ade80', '#d27bff', '#ff9f43'];
export const UNITS = [['cm', 'см'], ['moa', 'MOA'], ['mil', 'мил']];
export const CLICKS = [['mil0.1', '0,1 мил'], ['moa0.25', '¼ MOA'], ['moa0.125', '⅛ MOA'], ['moa0.5', '½ MOA']];
export const SCALE_MM = [10, 25.4, 50, 100];

const HIT = 24;
const LOUPE = 128;
const LOUPE_ZOOM = 3;
const MOVE = 6;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const color = (i) => COLORS[i % COLORS.length];

/** Число за мовою інтерфейсу з фіксованою кількістю знаків. */
export function num(v, digits = 1) {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Відрізок у мм — у вибраних одиницях; кутові без дистанції не порахувати, тоді см. */
export function length(mm, unit, distance) {
  if (unit !== 'cm' && distance > 0) return `${num(M.toAngle(mm, distance, unit), 2)} ${unit === 'moa' ? 'MOA' : t('мил')}`;
  return `${num(mm / 10, 1)} ${t('см')}`;
}

/**
 * Поправка прицілу: зсунути влучання назустріч зміщенню СТП, у кутових одиницях і клацаннях.
 * mm — зміщення СТП по осі (x праворуч, y вгору), стрілка — куди крутити барабан.
 */
function correction(mm, axis, distance, click) {
  const c = M.clickValue(click);
  if (!c || !(distance > 0) || Math.abs(mm) < 0.5) return null;
  const angle = M.toAngle(Math.abs(mm), distance, c.unit);
  const arrow = axis === 'x' ? (mm > 0 ? '←' : '→') : (mm > 0 ? '↓' : '↑');
  const unit = c.unit === 'moa' ? 'MOA' : t('мил');
  return `${arrow} ${num(angle, 2)} ${unit} = ${t('{n} щелч.', { n: Math.round(angle / c.value) })}`;
}

/** Зміщення СТП словами: «выше 1,2 см · левее 0,4 см». */
function offsetText([dx, dy], unit, distance) {
  const parts = [];
  if (Math.abs(dy) >= 0.5) parts.push(`${dy > 0 ? t('выше') : t('ниже')} ${length(Math.abs(dy), unit, distance)}`);
  if (Math.abs(dx) >= 0.5) parts.push(`${dx > 0 ? t('правее') : t('левее')} ${length(Math.abs(dx), unit, distance)}`);
  return parts.length ? parts.join(' · ') : t('в точке прицеливания');
}

/** Пари [підпис, значення] для однієї групи: деталі, картинка «Поделиться». */
export function groupRows(stats, { unit, distance, click }) {
  const rows = [[t('Выстрелов'), String(stats.n)]];
  if (stats.n >= 2) {
    rows.push(
      [t('Размах'), length(stats.spread, unit, distance)],
      [t('Средний радиус'), length(stats.meanRadius, unit, distance)],
      [t('Ширина × высота'), `${length(stats.width, unit, distance)} × ${length(stats.height, unit, distance)}`]);
  }
  if (stats.offset) {
    rows.push([t('СТП'), offsetText(stats.offset, unit, distance)]);
    const fix = [correction(stats.offset[1], 'y', distance, click), correction(stats.offset[0], 'x', distance, click)].filter(Boolean);
    if (fix.length) rows.push([t('Поправка'), fix.join(' · ')]);
  }
  return rows;
}

/**
 * Мітки поверх зображення. map(p) — частки фото → пікселі полотна, r — розмір мітки.
 * active — група, що редагується (інші блідіші), selected — виділена мітка, scale — показати масштаб.
 */
export function drawMarks(ctx, marks, map, r, { active = null, selected = null, scale = false } = {}) {
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
  ctx.save();
  ctx.lineCap = 'round';
  if (scale && marks.scale) {
    const { a, b, mm } = marks.scale;
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
    for (const [kind, p] of [['a', pa], ['b', pb]]) {
      if (!p) continue;
      const s = r * (isSel(kind) ? 1.2 : 0.8);
      halo(() => { ctx.beginPath(); ctx.rect(p[0] - s, p[1] - s, s * 2, s * 2); }, isSel(kind) ? '#fff' : '#5ee6ff', r * 0.3);
    }
  }
  (marks.groups ?? []).forEach((group, g) => {
    ctx.globalAlpha = active === null || active === g ? 1 : 0.5;
    const c = color(g);
    group.holes.forEach((hole, i) => {
      const [x, y] = map(hole);
      const sel = isSel('hole', g, i);
      halo(() => { ctx.beginPath(); ctx.arc(x, y, r * (sel ? 1.35 : 1), 0, Math.PI * 2); }, sel ? '#fff' : c, r * 0.3);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
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
  ctx.restore();
}

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

/** Зображення мішені з мітками в canvas: ширина width пікселів (висота — за пропорцією фото). */
export async function paintPreview(canvas, src, marks, width) {
  const img = await loadImage(src);
  canvas.width = Math.round(width);
  canvas.height = Math.round((width * img.height) / img.width);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawMarks(ctx, marks, (p) => [p[0] * canvas.width, p[1] * canvas.height], Math.max(3, canvas.width / 80));
}

/**
 * Картинка, щоб поділитися: фото з мітками й підсумок під ним.
 * lines — [{ text, color?, bold? }]. Повертає JPEG.
 */
export async function shareImage(src, marks, lines) {
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
  drawMarks(ctx, marks, (p) => [p[0] * width, p[1] * photoH], width / 110);
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.font = `${line.bold ? 700 : 400} ${font}px system-ui, sans-serif`;
    ctx.fillStyle = line.color ?? '#e8ece4';
    ctx.fillText(line.text, pad, photoH + pad + lineH * (i + 0.5), width - pad * 2);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/**
 * Розмітка на весь екран. marks — { scale, poa, groups }, opts — { distance, unit, click, scaleMm }.
 * Повертає нові marks або null, якщо скасовано.
 */
export async function markTarget(blob, marks, { distance, unit, click, scaleMm = 100 }) {
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
  let mode = st.scale.a && st.scale.b ? 'holes' : 'scale';
  let active = st.groups.length - 1;
  let selected = null;
  const history = [];
  // fitted — зображення вписане в екран: тоді при зміні розміру сцени вписуємо заново
  const view = { k: 1, x: 0, y: 0, fit: 1, fitted: true };

  return new Promise((done) => {
    const canvas = h('canvas', { class: 'tg-canvas' });
    const loupe = h('canvas', { class: 'tg-loupe', hidden: true, width: LOUPE, height: LOUPE });
    const stage = h('div', { class: 'tg-stage' }, canvas, loupe);
    const modeRow = h('div', { class: 'chips tg-modes' });
    const groupRow = h('div', { class: 'chips tg-groups' });
    const mmInput = h('input', {
      type: 'number', inputmode: 'decimal', step: 'any', min: 0, 'aria-label': t('Между точками, мм'),
      oninput: () => {
        const v = Number(String(mmInput.value).replace(',', '.'));
        if (v > 0) { st.scale.mm = v; paint(); }
      },
    });
    mmInput.value = st.scale.mm ?? '';
    const scaleRow = h('div', { class: 'tg-scale' },
      h('label', {}, h('span', {}, t('Между точками, мм')), mmInput),
      h('div', { class: 'chips' }, SCALE_MM.map((v) => h('button', {
        type: 'button',
        onclick: () => { st.scale.mm = v; mmInput.value = v; paint(); },
      }, num(v, v % 1 ? 1 : 0)))));
    const hint = h('div', { class: 'tg-hint' });
    const stats = h('div', { class: 'tg-stats' });
    const tool = (label, title, onclick) => h('button', { type: 'button', class: 'editor-tool', title, 'aria-label': title, onclick }, label);
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
      drawMarks(ctx, st, toScreen, 8, { active: mode === 'holes' ? active : null, selected, scale: true });
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
      drawMarks(ctx, st, map, 8, { active: mode === 'holes' ? active : null, selected, scale: true });
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

    function panel() {
      modeRow.replaceChildren(...[['holes', t('Пробоины')], ['poa', t('Точка прицеливания')], ['scale', t('Масштаб')]].map(([key, label]) => h('button', {
        type: 'button', class: key === mode ? 'on' : '',
        onclick: () => { mode = key; selected = null; paint(); },
      }, label)));
      groupRow.hidden = mode !== 'holes';
      groupRow.replaceChildren(
        ...st.groups.map((g, i) => h('button', {
          type: 'button', class: i === active ? 'on' : '',
          onclick: () => { active = i; selected = null; paint(); },
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
        }, t('+ группа')));
      scaleRow.hidden = mode !== 'scale';
      hint.textContent = mode === 'scale'
        ? t('Отметьте две точки, расстояние между которыми знаете: клетки мишени, линейку, край листа.')
        : mode === 'poa'
          ? t('Отметьте точку, в которую целились.')
          : t('Нажмите на центр пробоины. Держите палец — появится лупа: ведите и отпустите. Двумя пальцами — увеличить.');
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

    function snapshot() {
      history.push(JSON.stringify({ scale: st.scale, poa: st.poa, groups: st.groups }));
      if (history.length > 200) history.shift();
    }
    function undo() {
      const prev = history.pop();
      if (!prev) return;
      Object.assign(st, JSON.parse(prev));
      mmInput.value = st.scale.mm ?? '';
      active = Math.min(active, st.groups.length - 1);
      selected = null;
      paint();
    }
    function removeSelected() {
      if (!selected) return;
      snapshot();
      if (selected.kind === 'hole') st.groups[selected.g].holes.splice(selected.i, 1);
      else if (selected.kind === 'poa') st.poa = null;
      else st.scale[selected.kind] = null;
      selected = null;
      paint();
    }
    function place(n) {
      snapshot();
      if (mode === 'holes') st.groups[active].holes.push(n);
      else if (mode === 'poa') st.poa = n;
      else if (!st.scale.a) st.scale.a = n;
      else if (!st.scale.b) st.scale.b = n;
      else {
        // обидві точки є — переставляємо ближчу
        const da = Math.hypot(n[0] - st.scale.a[0], n[1] - st.scale.a[1]);
        const db = Math.hypot(n[0] - st.scale.b[0], n[1] - st.scale.b[1]);
        st.scale[da < db ? 'a' : 'b'] = n;
      }
      selected = null;
      vibrate();
    }
    function setPoint(hit, n) {
      if (hit.kind === 'hole') st.groups[hit.g].holes[hit.i] = n;
      else if (hit.kind === 'poa') st.poa = n;
      else st.scale[hit.kind] = n;
    }
    /** Мітка поточного режиму під пальцем. */
    function hitTest(at) {
      const list = mode === 'holes'
        ? st.groups[active].holes.map((p, i) => ({ kind: 'hole', g: active, i, p }))
        : mode === 'poa'
          ? (st.poa ? [{ kind: 'poa', p: st.poa }] : [])
          : ['a', 'b'].filter((k) => st.scale[k]).map((k) => ({ kind: k, p: st.scale[k] }));
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
      if (hit && !moved) selected = { kind: hit.kind, g: hit.g, i: hit.i };
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
      poa: st.poa,
      groups: st.groups.filter((g) => g.holes.length),
    });

    const root = h('div', { class: 'viewer tg-editor', role: 'dialog', 'aria-label': t('Разметка мишени') },
      h('header', { class: 'viewer-head' }, h('span', {}, t('Разметка мишени')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрыть'), onclick: cancel }, '✕')),
      stage,
      h('div', { class: 'tg-panel' },
        modeRow, groupRow, scaleRow, hint, stats,
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
