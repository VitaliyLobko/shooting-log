// Фото зброї: стиснення на пристрої, мініатюра для списку, перегляд на весь екран.
// Мініатюра (~10 КБ) їде в запис photos і синхронізується в JSON, повне фото — окремим файлом.
import * as db from './db.js';
import { h } from './ui.js';
import { t } from './i18n.js';

const FULL = 1600;
const THUMB = 240;

/** Декодування з урахуванням EXIF-орієнтації — інакше фото з телефона лягають боком. */
async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* нижче — запасний шлях */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src, max) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.width * k));
  canvas.height = Math.max(1, Math.round(src.height * k));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function jpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('Не удалось обработать фото')))), 'image/jpeg', quality);
  });
}

/** Файл з галереї чи камери → { blob, thumb, w, h }. */
export async function prepare(file) {
  let src;
  try {
    src = await decode(file);
  } catch {
    throw new Error(t('Формат фото не поддерживается'));
  }
  const full = draw(src, FULL);
  src.close?.();
  return { blob: await jpeg(full, 0.82), thumb: draw(full, THUMB).toDataURL('image/jpeg', 0.7), w: full.width, h: full.height };
}

/** Готове полотно → { blob, thumb, w, h }, як у prepare(). */
async function pack(canvas) {
  return { blob: await jpeg(canvas, 0.85), thumb: draw(canvas, THUMB).toDataURL('image/jpeg', 0.7), w: canvas.width, h: canvas.height };
}

/**
 * Поворот на rot×90° і на angle° з дзеркалом по горизонталі.
 * Дзеркало — у координатах екрана, тож напрям поворотів у редакторі не плутається.
 * При вирівнюванні кадр збільшується рівно настільки, щоб не було порожніх кутів.
 */
function transform(source, { rot, flip, angle }) {
  const swap = rot % 2 === 1;
  const w = swap ? source.height : source.width;
  const hh = swap ? source.width : source.height;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const k = Math.max((w * cos + hh * sin) / w, (w * sin + hh * cos) / hh);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2, hh / 2);
  if (flip) ctx.scale(-1, 1);
  ctx.rotate((rot * Math.PI) / 2 + rad);
  ctx.scale(k, k);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const ASPECTS = [['free', 'Свободно'], ['1:1', '1:1'], ['4:3', '4:3'], ['16:9', '16:9']];
const MIN_CROP = 0.05;

/** Редактор: кадрування, дзеркало, поворот на 90° і вирівнювання. Повертає { blob, thumb, w, h } або null. */
export async function editPhoto(blob) {
  const src = await decode(blob);
  const preview = draw(src, 1000);
  return new Promise((done) => {
    const st = { rot: 0, flip: false, angle: 0, aspect: 'free', crop: { x: 0, y: 0, w: 1, h: 1 } };
    let base = null;
    const canvas = h('canvas', { class: 'editor-canvas' });
    const frame = h('div', { class: 'crop-frame' },
      ['nw', 'ne', 'sw', 'se'].map((corner) => h('span', { class: `crop-handle ${corner}`, dataset: { corner } })));
    const box = h('div', { class: 'editor-box' }, canvas, frame);
    const stage = h('div', { class: 'editor-stage' }, box);
    const angleValue = h('span', { class: 'editor-angle' }, '0°');
    const slider = h('input', {
      type: 'range', min: -45, max: 45, step: 0.5, value: 0, 'aria-label': t('Выравнивание'),
      oninput: (e) => { st.angle = Number(e.target.value); paint(); },
    });

    const ratio = () => {
      if (st.aspect === 'free') return 0;
      const [a, b] = st.aspect.split(':').map(Number);
      return base.width >= base.height ? a / b : b / a;
    };
    const fitCrop = () => {
      const r = ratio();
      if (!r) { st.crop = { x: 0, y: 0, w: 1, h: 1 }; return; }
      const w = Math.min(1, (base.height * r) / base.width);
      const hh = Math.min(1, (base.width / r) / base.height);
      st.crop = { x: (1 - w) / 2, y: (1 - hh) / 2, w, h: hh };
    };
    const placeFrame = () => {
      const c = st.crop;
      Object.assign(frame.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
    };
    const layout = () => {
      const k = Math.min(stage.clientWidth / base.width, stage.clientHeight / base.height);
      box.style.width = `${Math.floor(base.width * k)}px`;
      box.style.height = `${Math.floor(base.height * k)}px`;
    };
    function paint(refit = false) {
      const prev = base && `${base.width}x${base.height}`;
      base = transform(preview, st);
      canvas.width = base.width;
      canvas.height = base.height;
      canvas.getContext('2d').drawImage(base, 0, 0);
      if (refit || prev !== `${base.width}x${base.height}`) fitCrop();
      angleValue.textContent = `${st.angle > 0 ? '+' : ''}${st.angle}°`;
      layout();
      placeFrame();
    }
    const turn = (step) => {
      st.rot = (st.rot + (st.flip ? -step : step) + 4) % 4;
      paint(true);
    };

    // Рамка: тягнути всередині — зсув, за кут — розмір від протилежного кута.
    let drag = null;
    frame.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      frame.setPointerCapture(e.pointerId);
      const corner = e.target.dataset.corner ?? null;
      const c = st.crop;
      drag = {
        id: e.pointerId, corner, x: e.clientX, y: e.clientY, crop: { ...c },
        ax: corner?.includes('w') ? c.x + c.w : c.x, ay: corner?.includes('n') ? c.y + c.h : c.y,
      };
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const rect = box.getBoundingClientRect();
      if (!drag.corner) {
        const c = drag.crop;
        st.crop = {
          ...c,
          x: clamp(c.x + (e.clientX - drag.x) / rect.width, 0, 1 - c.w),
          y: clamp(c.y + (e.clientY - drag.y) / rect.height, 0, 1 - c.h),
        };
      } else {
        const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        let w = Math.max(MIN_CROP, Math.abs(px - drag.ax));
        let hh = Math.max(MIN_CROP, Math.abs(py - drag.ay));
        const r = ratio();
        if (r) {
          if ((w * base.width) / (hh * base.height) > r) w = (hh * base.height * r) / base.width;
          else hh = (w * base.width) / (base.height * r);
        }
        const x = px < drag.ax ? drag.ax - w : drag.ax;
        const y = py < drag.ay ? drag.ay - hh : drag.ay;
        if (x < 0 || y < 0 || x + w > 1.0001 || y + hh > 1.0001) return;
        st.crop = { x, y, w, h: hh };
      }
      placeFrame();
    });
    const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);

    const aspectChips = h('div', { class: 'editor-aspects' }, ASPECTS.map(([key, label]) => h('button', {
      type: 'button', dataset: { value: key }, class: key === st.aspect ? 'on' : '',
      onclick: (e) => {
        st.aspect = key;
        aspectChips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
        paint(true);
      },
    }, t(label))));

    const tool = (label, title, onclick) => h('button', { type: 'button', class: 'editor-tool', title, 'aria-label': title, onclick }, label);
    const close = (result) => {
      root.remove();
      window.removeEventListener('popstate', cancel);
      window.removeEventListener('resize', relayout);
      document.removeEventListener('keydown', onKey);
      src.close?.();
      done(result);
    };
    const cancel = () => close(null);
    const relayout = () => { layout(); };
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    const save = async () => {
      saveBtn.disabled = true;
      const full = transform(src, st);
      const c = st.crop;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(c.w * full.width));
      const r = ratio();
      out.height = Math.max(1, Math.min(full.height, r ? Math.round(out.width / r) : Math.round(c.h * full.height)));
      out.getContext('2d').drawImage(full, Math.round(c.x * full.width), Math.round(c.y * full.height), out.width, out.height, 0, 0, out.width, out.height);
      close(await pack(out));
    };
    const saveBtn = h('button', { type: 'button', class: 'btn primary', onclick: save }, t('Сохранить'));

    const root = h('div', { class: 'viewer editor', role: 'dialog', 'aria-label': t('Редактор фото') },
      h('header', { class: 'viewer-head' }, h('span', {}, t('Редактор фото')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрыть'), onclick: cancel }, '✕')),
      stage,
      h('div', { class: 'editor-tools' },
        h('div', { class: 'editor-row' },
          tool('⟲', t('Повернуть влево'), () => turn(-1)),
          tool('⟳', t('Повернуть вправо'), () => turn(1)),
          tool('⇋', t('Отразить по горизонтали'), () => { st.flip = !st.flip; paint(); }),
          tool('↺', t('Сбросить'), () => {
            Object.assign(st, { rot: 0, flip: false, angle: 0 });
            slider.value = 0;
            paint(true);
          })),
        h('label', { class: 'editor-row editor-straighten' }, h('span', {}, t('Выравнивание')), slider, angleValue),
        aspectChips),
      h('footer', { class: 'viewer-actions' }, h('button', { type: 'button', class: 'btn', onclick: cancel }, t('Отмена')), saveBtn));

    document.getElementById('layer').append(root);
    window.addEventListener('popstate', cancel, { once: true });
    window.addEventListener('resize', relayout);
    document.addEventListener('keydown', onKey);
    paint(true);
  });
}

/**
 * Перегляд на весь екран: свайп або стрілки — сусіднє фото.
 * photos — масив записів; isCover(p), onCover(p), onDelete(p) → Promise<bool>, onEdit(p) → Promise<новий запис|null>.
 */
export function viewer(photos, index, { isCover, onCover, onDelete, onEdit }) {
  const list = [...photos];
  let i = index;
  let url = null;
  const img = h('img', { class: 'viewer-img', alt: '' });
  const note = h('div', { class: 'viewer-note' });
  const counter = h('span', { class: 'viewer-count' });
  const coverBtn = h('button', { type: 'button', class: 'btn', onclick: async () => { await onCover(list[i]); show(); } });
  const close = () => {
    if (url) URL.revokeObjectURL(url);
    root.remove();
    window.removeEventListener('popstate', close);
    document.removeEventListener('keydown', onKey);
  };
  const go = (step) => {
    if (list.length < 2) return;
    i = (i + step + list.length) % list.length;
    show();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  };
  const root = h('div', { class: 'viewer', role: 'dialog', 'aria-label': t('Фото') },
    h('header', { class: 'viewer-head' }, counter,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрыть'), onclick: close }, '✕')),
    h('div', { class: 'viewer-stage' },
      h('button', { type: 'button', class: 'viewer-nav prev', 'aria-label': t('Предыдущее'), onclick: () => go(-1) }, '‹'),
      img,
      h('button', { type: 'button', class: 'viewer-nav next', 'aria-label': t('Следующее'), onclick: () => go(1) }, '›'),
      note),
    h('footer', { class: 'viewer-actions' }, coverBtn,
      h('button', {
        type: 'button', class: 'btn',
        onclick: async () => {
          const fresh = await onEdit(list[i]);
          if (!fresh) return;
          list[i] = fresh;
          show();
        },
      }, t('✎ Изменить')),
      h('button', {
        type: 'button', class: 'btn danger',
        onclick: async () => {
          const p = list[i];
          if (!(await onDelete(p))) return;
          list.splice(i, 1);
          if (!list.length) { close(); return; }
          i = Math.min(i, list.length - 1);
          show();
        },
      }, t('Удалить'))));

  let startX = null;
  img.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  img.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });

  async function show() {
    const p = list[i];
    counter.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
    root.classList.toggle('single', list.length < 2);
    const cover = isCover(p);
    coverBtn.textContent = cover ? t('★ Главное фото') : t('☆ Сделать главным');
    coverBtn.disabled = cover;
    note.textContent = '';
    img.src = p.thumb;
    if (url) { URL.revokeObjectURL(url); url = null; }
    const blob = await db.getBlob(p.id);
    if (list[i] !== p) return;
    if (blob) {
      url = URL.createObjectURL(blob);
      img.src = url;
    } else {
      note.textContent = t('Полное фото появится после синхронизации');
    }
  }

  document.getElementById('layer').append(root);
  window.addEventListener('popstate', close, { once: true });
  document.addEventListener('keydown', onKey);
  show();
  return close;
}
