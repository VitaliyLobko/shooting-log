// Вирівнювання фото мішені: чотири кути прямокутника → прямокутник. Перспектива, нахил і кадр — одним кроком.
import { h, backLayer, toast } from './ui.js';
import { t } from './i18n.js';
import { decode, draw, pack } from './photos.js';

// робоча копія для перетворення: трохи більша за готове фото, щоб не втрачати різкість
const WORK = 3200;
const PAD = 28;
const HIT = 44;
const SHEET_KEY = 'shooters-log:sheet';
const CROP_KEY = 'shooters-log:align-crop';
// без обрізання поле довкола рамки — не далі за півтори рамки: за обрієм перспективи точки летять у нескінченність
const SPREAD = 1.5;
const BG = 24;
// [ключ, назва, ширина × висота в мм]
const SHEETS = [['', 'Не знаю'], ['a4', 'A4', [210, 297]], ['a3', 'A3', [297, 420]], ['50', '50×50 см', [500, 500]]];

function recall(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* не критично */ }
}

/** Поворот полотна на 90°: dir = 1 — за годинниковою стрілкою. */
function turn90(src, dir) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Та сама точка (у частках кадру) після повороту кадру на rot × 90° за годинниковою. */
function rotatePoint([x, y], rot) {
  let p = [x, y];
  for (let i = 0; i < rot; i += 1) p = [1 - p[1], p[0]];
  return p;
}

/**
 * Проєктивне перетворення одиничного квадрата в чотирикутник q = [TL, TR, BR, BL] (за Хекбертом):
 * x = (a·u + b·v + c) / (g·u + h·v + 1), y = (d·u + e·v + f) / (g·u + h·v + 1).
 */
export function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const hh = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  return {
    a: x1 - x0 + g * x1, b: x3 - x0 + hh * x3, c: x0,
    d: y1 - y0 + g * y1, e: y3 - y0 + hh * y3, f: y0, g, h: hh,
  };
}

const mapPoint = (m, u, v) => {
  const w = m.g * u + m.h * v + 1;
  return [(m.a * u + m.b * v + m.c) / w, (m.d * u + m.e * v + m.f) / w];
};

/**
 * Зворотне перетворення: точка фото → (u, v) одиничного квадрата. null — точка за обрієм перспективи.
 * Матриця [[a, b, c], [d, e, f], [g, h, 1]] обертається через приєднану; множник не важливий.
 */
export function quadToSquare(m) {
  const A = m.e - m.f * m.h;
  const B = m.f * m.g - m.d;
  const C = m.d * m.h - m.e * m.g;
  const D = m.c * m.h - m.b;
  const E = m.a - m.c * m.g;
  const F = m.b * m.g - m.a * m.h;
  const G = m.b * m.f - m.c * m.e;
  const H = m.c * m.d - m.a * m.f;
  const I = m.a * m.e - m.b * m.d;
  // знак третьої координати всередині рамки: з протилежним точка вже по той бік обрію
  const [cx, cy] = mapPoint(m, 0.5, 0.5);
  const side = Math.sign(C * cx + F * cy + I);
  return ([x, y]) => {
    const w = C * x + F * y + I;
    if (Math.sign(w) !== side) return null;
    return [(A * x + D * y + G) / w, (B * x + E * y + H) / w];
  };
}

/** Чотирикутник опуклий і не вивернутий — інакше перетворення дасть кашу. */
export function convex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = q[i];
    const [bx, by] = q[(i + 1) % 4];
    const [cx, cy] = q[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

/** Розмір рамки після вирівнювання: за довшими сторонами чотирикутника, а з відомим листом — точно в його пропорціях. */
function rectSize(P, sheet) {
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let w = Math.max(len(P[0], P[1]), len(P[3], P[2]));
  let hh = Math.max(len(P[0], P[3]), len(P[1], P[2]));
  if (!sheet) return { w, h: hh, mm: null };
  let [mw, mh] = sheet;
  // книжкова чи альбомна — за середніми сторонами: у перспективі одна сторона завжди довша за протилежну
  const landscape = len(P[0], P[1]) + len(P[3], P[2]) > len(P[0], P[3]) + len(P[1], P[2]);
  if (landscape !== (mw > mh) && mw !== mh) [mw, mh] = [mh, mw];
  const area = w * hh;
  w = Math.sqrt((area * mw) / mh);
  hh = (w * mh) / mw;
  return { w, h: hh, mm: { w: mw, h: mh } };
}

/** Яку частину площини (у координатах рамки, рамка = 0…1) займе все фото — для вирівнювання без обрізання. */
function wholeFrame(unproject, sw, sh) {
  const pts = [];
  for (let i = 0; i <= 10; i += 1) {
    const s = i / 10;
    for (const p of [[s * sw, 0], [s * sw, sh], [0, s * sh], [sw, s * sh]]) {
      const uv = unproject(p);
      if (uv) pts.push(uv);
    }
  }
  const lim = (v) => Math.min(1 + SPREAD, Math.max(-SPREAD, v));
  return {
    x0: Math.min(0, ...pts.map((p) => lim(p[0]))), x1: Math.max(1, ...pts.map((p) => lim(p[0]))),
    y0: Math.min(0, ...pts.map((p) => lim(p[1]))), y1: Math.max(1, ...pts.map((p) => lim(p[1]))),
  };
}

/** Перенести на полотно W×H ділянку frame (у координатах рамки) — білінійна вибірка; поза фото — темне тло. */
function warp(work, quad, frame, W, H) {
  const sw = work.width;
  const sh = work.height;
  const sd = work.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const od = img.data;
  const m = squareToQuad(quad);
  const du = (frame.x1 - frame.x0) / W;
  const dv = (frame.y1 - frame.y0) / H;
  let o = 0;
  for (let y = 0; y < H; y += 1) {
    const v = frame.y0 + (y + 0.5) * dv;
    for (let x = 0; x < W; x += 1, o += 4) {
      const u = frame.x0 + (x + 0.5) * du;
      const w = m.g * u + m.h * v + 1;
      const sx = (m.a * u + m.b * v + m.c) / w - 0.5;
      const sy = (m.d * u + m.e * v + m.f) / w - 0.5;
      od[o + 3] = 255;
      if (!(w > 0) || sx < -0.5 || sy < -0.5 || sx > sw - 0.5 || sy > sh - 0.5) {
        od[o] = BG; od[o + 1] = BG; od[o + 2] = BG;
        continue;
      }
      const ix = Math.min(sw - 2, Math.max(0, Math.floor(sx)));
      const iy = Math.min(sh - 2, Math.max(0, Math.floor(sy)));
      const fx = Math.min(1, Math.max(0, sx - ix));
      const fy = Math.min(1, Math.max(0, sy - iy));
      const i00 = (iy * sw + ix) * 4;
      const i01 = i00 + sw * 4;
      for (let c = 0; c < 3; c += 1) {
        const top = sd[i00 + c] + (sd[i00 + 4 + c] - sd[i00 + c]) * fx;
        const bot = sd[i01 + c] + (sd[i01 + 4 + c] - sd[i01 + c]) * fx;
        od[o + c] = top + (bot - top) * fy;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Крок «Вирівняти» для фото мішені. Повертає { blob, thumb, w, h, sheet, transform } або null, якщо скасовано.
 * sheet — { w, h } у мм, якщо вказано розмір листа: тоді краї фото — краї листа, масштаб відомий.
 * transform(p) — куди потрапила точка старого фото (у частках кадру); null — за обрієм.
 */
export async function alignTarget(file, { max }) {
  let src;
  try {
    src = await decode(file);
  } catch {
    throw new Error(t('Формат фото не поддерживается'));
  }
  let work = draw(src, WORK);
  src.close?.();
  return new Promise((done) => {
    let preview = draw(work, 1400);
    let corners;
    // скільки разів повернули на 90° за годинниковою — щоб перенести відмітки старого фото
    let rot = 0;
    let sheetKey = recall(SHEET_KEY, '');
    if (!SHEETS.some(([k]) => k === sheetKey)) sheetKey = '';
    let crop = recall(CROP_KEY, '1') !== '0';
    const reset = () => { corners = [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]]; };
    reset();
    let drag = null;
    let view = { x: 0, y: 0, w: 1, h: 1 };
    const canvas = h('canvas', { class: 'align-canvas' });
    const stage = h('div', { class: 'align-stage' }, canvas);
    const toScreen = ([x, y]) => [view.x + x * view.w, view.y + y * view.h];

    function layout() {
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      const k = Math.min((cw - PAD * 2) / preview.width, (ch - PAD * 2) / preview.height);
      view = { w: preview.width * k, h: preview.height * k };
      view.x = (cw - view.w) / 2;
      view.y = (ch - view.h) / 2;
      paint();
    }

    function paint() {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(preview, view.x, view.y, view.w, view.h);
      const S = corners.map(toScreen);
      const ok = convex(S);
      // з обрізанням поза рамкою притемнено: видно, що лишиться в кадрі
      if (crop) {
        ctx.beginPath();
        ctx.rect(view.x, view.y, view.w, view.h);
        S.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = 'rgb(0 0 0 / .55)';
        ctx.fill('evenodd');
      }
      // сітка в перспективі: лінії мішені мають іти вздовж неї
      if (ok) {
        const m = squareToQuad(S);
        ctx.strokeStyle = 'rgb(255 154 60 / .55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const s of [0.25, 0.5, 0.75]) {
          ctx.moveTo(...mapPoint(m, s, 0));
          ctx.lineTo(...mapPoint(m, s, 1));
          ctx.moveTo(...mapPoint(m, 0, s));
          ctx.lineTo(...mapPoint(m, 1, s));
        }
        ctx.stroke();
      }
      ctx.strokeStyle = ok ? '#ff9a3c' : '#ff5a4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      S.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      S.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, y, drag?.i === i ? 13 : 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(255 154 60 / .35)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      if (drag) loupe(ctx, drag.i);
      doneBtn.disabled = !ok;
    }

    /** Лупа над пальцем: кут ставиться точно, хоч палець його й закриває. */
    function loupe(ctx, i) {
      const R = 58;
      const zoom = 3;
      const [px] = toScreen(corners[i]);
      const cx = px < stage.clientWidth / 2 ? stage.clientWidth - R - 12 : R + 12;
      const cy = R + 12;
      const k = (view.w / work.width) * zoom;
      const [wx, wy] = [corners[i][0] * work.width, corners[i][1] * work.height];
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.clip();
      ctx.drawImage(work, wx - R / k, wy - R / k, (2 * R) / k, (2 * R) / k, cx - R, cy - R, 2 * R, 2 * R);
      ctx.strokeStyle = '#ff9a3c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Кут тягнеться на зсув пальця, а не стрибає під нього — так палець не закриває точку.
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      const p = [e.clientX - r.left, e.clientY - r.top];
      let best = -1;
      let dist = HIT;
      corners.forEach((c, i) => {
        const [x, y] = toScreen(c);
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < dist) { dist = d; best = i; }
      });
      if (best < 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = { i: best, id: e.pointerId, x: e.clientX, y: e.clientY, from: [...corners[best]] };
      paint();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const clamp = (v) => Math.min(1, Math.max(0, v));
      corners[drag.i] = [clamp(drag.from[0] + (e.clientX - drag.x) / view.w), clamp(drag.from[1] + (e.clientY - drag.y) / view.h)];
      paint();
    });
    const endDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; paint(); } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const turn = (dir) => {
      work = turn90(work, dir);
      rot = (rot + dir + 4) % 4;
      preview = draw(work, 1400);
      reset();
      layout();
    };
    const sheetChips = h('div', { class: 'editor-aspects' }, SHEETS.map(([key, label]) => h('button', {
      type: 'button', class: key === sheetKey ? 'on' : null,
      onclick: (e) => {
        sheetKey = key;
        remember(SHEET_KEY, key);
        sheetChips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      },
    }, t(label))));
    const sheetRow = h('div', { class: 'align-sheet' }, h('span', {}, t('Размер листа')), sheetChips);
    const hint = h('p', { class: 'align-hint' });
    // Без обрізання рамку можна ставити на будь-який прямокутник сітки; розмір листа тоді ні до чого.
    const showCrop = () => {
      hint.textContent = crop
        ? t('Перетащите углы рамки на углы листа — фото выпрямится по ним.')
        : t('Поставьте углы на любой прямоугольник сетки — выпрямится всё фото, без обрезки.');
      sheetRow.hidden = !crop;
      paint();
    };
    const cropBox = h('input', {
      type: 'checkbox', checked: crop,
      onchange: (e) => { crop = e.target.checked; remember(CROP_KEY, crop ? '1' : '0'); showCrop(); },
    });

    const close = (result) => {
      root.remove();
      unlayer();
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey);
      done(result);
    };
    const cancel = () => close(null);
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    const skip = async () => close({
      ...(await pack(draw(work, max))), sheet: null, transform: (p) => rotatePoint(p, rot),
    });
    const finish = async () => {
      doneBtn.disabled = true;
      doneBtn.textContent = t('Обработка…');
      // дати кнопці перемалюватися: далі кілька сотень мілісекунд рахунку
      await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); });
      const sw = work.width;
      const sh = work.height;
      const P = corners.map(([x, y]) => [x * sw, y * sh]);
      const unproject = quadToSquare(squareToQuad(P));
      const rect = rectSize(P, crop ? SHEETS.find(([k]) => k === sheetKey)?.[2] : null);
      const frame = crop ? { x0: 0, y0: 0, x1: 1, y1: 1 } : wholeFrame(unproject, sw, sh);
      const fw = rect.w * (frame.x1 - frame.x0);
      const fh = rect.h * (frame.y1 - frame.y0);
      const k = Math.min(1, max / Math.max(fw, fh));
      const W = Math.max(1, Math.round(fw * k));
      const H = Math.max(1, Math.round(fh * k));
      const transform = (p) => {
        const [x, y] = rotatePoint(p, rot);
        const uv = unproject([x * sw, y * sh]);
        return uv && [(uv[0] - frame.x0) / (frame.x1 - frame.x0), (uv[1] - frame.y0) / (frame.y1 - frame.y0)];
      };
      try {
        close({ ...(await pack(warp(work, P, frame, W, H))), sheet: rect.mm, transform });
      } catch (err) {
        toast(err.message);
        doneBtn.disabled = false;
        doneBtn.textContent = `✓ ${t('Готово')}`;
      }
    };
    const tool = (label, title, onclick) => h('button', { type: 'button', class: 'editor-tool', title, 'aria-label': title, onclick }, label);
    const doneBtn = h('button', { type: 'button', class: 'btn primary', onclick: finish }, `✓ ${t('Готово')}`);

    const root = h('div', { class: 'viewer editor align', role: 'dialog', 'aria-label': t('Выровнять мишень') },
      h('header', { class: 'viewer-head' },
        h('button', { type: 'button', class: 'icon-btn', title: t('Закрыть'), 'aria-label': t('Закрыть'), onclick: cancel }, '✕'),
        h('span', {}, t('Выровнять мишень')),
        h('div', { class: 'editor-row' },
          tool('⟲', t('Повернуть влево'), () => turn(-1)),
          tool('⟳', t('Повернуть вправо'), () => turn(1)))),
      stage,
      h('div', { class: 'editor-tools' },
        hint,
        h('label', { class: 'align-crop' }, cropBox, h('span', {}, t('Обрезать по рамке'))),
        sheetRow),
      h('footer', { class: 'viewer-actions' },
        h('button', { type: 'button', class: 'btn', onclick: skip }, t('Пропустить')), doneBtn));

    document.getElementById('layer').append(root);
    const unlayer = backLayer(cancel);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', onKey);
    layout();
    showCrop();
  });
}
