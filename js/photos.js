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

/**
 * Перегляд на весь екран: свайп або стрілки — сусіднє фото.
 * photos — масив записів; isCover(p), onCover(p), onDelete(p) → Promise.
 */
export function viewer(photos, index, { isCover, onCover, onDelete }) {
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
