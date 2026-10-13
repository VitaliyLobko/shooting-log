// Своя іконка: картинка лише на цьому пристрої — у шапці, на вкладці й файлом для ярлика.
// Іконку встановленого застосунку Android бере з manifest на сервері, тож її сторінка не змінює.
import { t } from './i18n.js';

const KEY = 'shooting-log:icon';
const SIZE = 512;
const DEFAULT = { icon: 'icons/icon-192.png', apple: 'icons/apple-touch-icon.png' };

export function customIcon() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Підставити свою іконку (або повернути стандартну) у шапку, вкладку браузера й apple-touch-icon. */
export function applyIcon() {
  const url = customIcon();
  document.querySelector('link[rel="icon"]')?.setAttribute('href', url ?? DEFAULT.icon);
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', url ?? DEFAULT.apple);
  const img = document.getElementById('app-icon');
  if (img) {
    img.hidden = !url;
    if (url) img.src = url;
    else img.removeAttribute('src');
  }
}

function load(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

function square(img) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const k = Math.max(SIZE / img.width, SIZE / img.height);
  ctx.drawImage(img, (SIZE - img.width * k) / 2, (SIZE - img.height * k) / 2, img.width * k, img.height * k);
  return canvas;
}

/** Квадратне зображення з редактора → 512×512 у сховищі пристрою. */
export async function setIcon(blob) {
  const url = URL.createObjectURL(blob);
  let data;
  try {
    data = square(await load(url)).toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
  try {
    localStorage.setItem(KEY, data);
  } catch {
    throw new Error(t('Не удалось сохранить иконку: браузер не дал места'));
  }
}

export function clearIcon() {
  try { localStorage.removeItem(KEY); } catch { /* приватний режим */ }
}

/** PNG 512×512 для ярлика на робочому столі. */
export async function iconFile() {
  const canvas = square(await load(customIcon()));
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], 'shooting-log-icon.png', { type: 'image/png' });
}
