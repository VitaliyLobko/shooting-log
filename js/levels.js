// Рівні для підсумків: запас БК (від розсипу до «арсеналу») і загальний настріл (купа гільз і звання).
// Назви рівнів — ключі перекладу, на екран ідуть через t().
import { h } from './ui.js';

// Градієнти й деталі один раз на документ (префікс lv-, щоб не перетинатися з іконками зброї).
function ensureDefs() {
  if (document.getElementById('lv-br')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs>
    <linearGradient id="lv-br" x1="0" x2="1"><stop offset="0" stop-color="#7a5414"/><stop offset=".3" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#d9a640"/><stop offset="1" stop-color="#6b470f"/></linearGradient>
    <linearGradient id="lv-cu" x1="0" x2="1"><stop offset="0" stop-color="#6e2c0e"/><stop offset=".32" stop-color="#ffbf8a"/><stop offset=".6" stop-color="#cf6c32"/><stop offset="1" stop-color="#55210a"/></linearGradient>
    <linearGradient id="lv-olive" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8a52"/><stop offset="1" stop-color="#4a5430"/></linearGradient>
    <linearGradient id="lv-oliveD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6a3a"/><stop offset="1" stop-color="#363f22"/></linearGradient>
    <linearGradient id="lv-zinc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c0b4"/><stop offset=".5" stop-color="#8b9586"/><stop offset="1" stop-color="#5f685b"/></linearGradient>
    <linearGradient id="lv-card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2c38f"/><stop offset="1" stop-color="#b08a52"/></linearGradient>
    <linearGradient id="lv-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98a52"/><stop offset="1" stop-color="#7d5428"/></linearGradient>
    <linearGradient id="lv-woodD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f6435"/><stop offset="1" stop-color="#5c3a18"/></linearGradient>
    <linearGradient id="lv-steel" x1="0" x2="1"><stop offset="0" stop-color="#6b737b"/><stop offset=".35" stop-color="#e9edf1"/><stop offset="1" stop-color="#7d858d"/></linearGradient>
    <linearGradient id="lv-burlap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ad78"/><stop offset="1" stop-color="#8d7246"/></linearGradient>
    <pattern id="lv-net" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0h6M0 0v6" stroke="#3f5a2a" stroke-width="1.1"/></pattern>
    <g id="lv-round"><path fill="url(#lv-cu)" d="M7 15C7 9 9 4 10 1.5 11 4 13 9 13 15Z"/><path fill="url(#lv-br)" d="M7 14h6v6l3 5v32H4V25l3-5Z"/><rect fill="#5e3f0e" x="5" y="57" width="10" height="2"/><rect fill="url(#lv-br)" x="3.5" y="59" width="13" height="3.5" rx="1"/></g>
    <g id="lv-case"><path fill="url(#lv-br)" d="M7 0h6v6l3 5v32H4V11l3-5Z"/><ellipse cx="10" cy=".6" rx="3" ry=".9" fill="#3d2a08"/><rect fill="#5e3f0e" x="5" y="43" width="10" height="2"/><rect fill="url(#lv-br)" x="3.5" y="45" width="13" height="3.5" rx="1"/></g>
    <g id="lv-crate"><rect fill="url(#lv-wood)" width="40" height="28" rx="1.5"/><path d="M0 9.3h40M0 18.6h40" stroke="#5c3a18" stroke-width=".8" opacity=".7"/>
      <rect fill="url(#lv-woodD)" width="5" height="28" rx="1"/><rect fill="url(#lv-woodD)" x="35" width="5" height="28" rx="1"/>
      <path d="M1.4 11q1.1-3 2.2 0M36.4 11q1.1-3 2.2 0" fill="none" stroke="#2b1a08" stroke-width=".9"/>
      <text x="20" y="17.6" text-anchor="middle" font-size="7" font-weight="900" fill="#2b1a08" opacity=".55" font-family="system-ui">БК</text></g>
  </defs>`;
  document.body.append(svg);
}

const use = (id, x, y, rot = 0, sc = 1) => `<use href="#lv-${id}" transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"/>`;

/** Купа гільз: детермінована «випадковість» за seed, тож картинка щоразу однакова. */
function pile(count, cx, base, w, hgt, seed, scale = 0.36) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let out = '';
  for (let i = 0; i < count; i++) {
    const up = rnd();
    const x = cx + (rnd() - 0.5) * w * (1 - up * 0.85);
    out += use('case', x - 4, base - up * hgt - 4, -90 + (rnd() - 0.5) * 160, scale);
  }
  return out;
}

/** Тінь під предметом. */
const shadow = (cx, cy, rx, ry = 2.2) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".28"/>`;

/** Верхня пачка: кулі рядами, як у відкритій коробці. */
function packTips() {
  let out = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      const x = 23 + c * 5.2 + (2 - r) * 2.6;
      const y = 22.4 - (2 - r) * 1.9;
      out += `<path fill="url(#lv-cu)" d="M${x} ${y}c0-2.4.8-4.2 1.6-5.4.8 1.2 1.6 3 1.6 5.4z"/>`;
    }
  }
  return out;
}

const AMMO = [
  // Відкрита порожня коробка: павутина всередині, над нею міль.
  { max: 0, name: 'Пусто. Совсем', art: () => `
    <path fill="#8a6a3c" d="M18 34 30 25h52l-12 9z"/>
    <path fill="#3b2d19" d="M22 33 31 27h48l-9 6z"/>
    <g stroke="#e8ecef" stroke-width=".45" fill="none" opacity=".6">
      <path d="M31 27 36 33M31 27l14 3M31 27l9 6M31 27l20 1"/><path d="M33 29q2-.6 3 1M35 30.5q3-1 5 .6M37 28.6q3-.6 5 .3"/></g>
    <path fill="#c9a66d" d="M30 25 22 13l52-2 8 14z"/>
    <path fill="#b08a52" d="M18 34 30 25 20 18 8 27z"/>
    <path fill="#d9b981" d="M70 34 82 25 92 31 80 40z"/>
    <rect fill="url(#lv-card)" x="18" y="34" width="52" height="30" rx="1.5"/>
    <path fill="#9a7644" d="M70 34 82 25v30l-12 9z"/>
    <rect fill="#c0392b" x="18" y="44" width="52" height="8"/>
    <text x="44" y="50.6" text-anchor="middle" font-size="7" font-weight="900" fill="#fff" font-family="system-ui">0 шт</text>
    <g transform="translate(60 6) rotate(18)"><ellipse cx="-3.4" cy="0" rx="3.6" ry="2.4" fill="#b7ab98"/><ellipse cx="3.4" cy="0" rx="3.6" ry="2.4" fill="#a39783"/>
      <ellipse cx="0" cy=".4" rx="1" ry="3" fill="#5b5248"/></g>
    <path d="M48 12q4 3 8-1M44 16q3 2 6 0" stroke="#949e90" stroke-width=".6" fill="none" stroke-dasharray="1.4 1.6"/>` },
  // Кілька набоїв лежать, один стоїть.
  { max: 25, name: 'Россыпь', art: () => `${shadow(36, 63, 17)}${shadow(68, 61, 15)}${shadow(46, 58, 6, 1.6)}${shadow(28, 53, 12, 1.8)}
    ${use('round', 14, 54, -96, 0.42)}${use('round', 40, 19, 0, 0.64)}${use('round', 20, 66, -84, 0.5)}${use('round', 88, 59, 98, 0.5)}` },
  // Дві пачки по 20, верхня відкрита.
  { max: 100, name: 'Пара пачек', art: () => `${shadow(46, 66, 36, 2.6)}
    <path fill="#a4804a" d="M14 46 22 40h44l-8 6z"/>
    <rect fill="url(#lv-card)" x="14" y="46" width="44" height="18" rx="1.2"/>
    <path fill="#94713f" d="M58 46 66 40v18l-8 6z"/>
    <rect fill="#c0392b" x="14" y="51" width="44" height="7"/>
    <text x="36" y="56.6" text-anchor="middle" font-size="6" font-weight="900" fill="#fff" font-family="system-ui">20</text>
    <path fill="#c9a66d" d="M30 16 32 6l40-1-2 11z"/>
    <path fill="#3b2d19" d="M22 24 30 18h42l-8 6z"/>
    ${packTips()}
    <rect fill="url(#lv-card)" x="22" y="24" width="42" height="18" rx="1.2"/>
    <path fill="#94713f" d="M64 24 72 18v18l-8 6z"/>
    <rect fill="#c0392b" x="22" y="29" width="42" height="7"/>
    <text x="43" y="34.6" text-anchor="middle" font-size="6" font-weight="900" fill="#fff" font-family="system-ui">20</text>` },
  // Цинк у три чверті: канавка розкриття, ключ, відігнутий кут.
  { max: 400, name: 'Цинк', art: () => `${shadow(48, 66, 36, 2.6)}
    <path fill="#cfd5ca" d="M12 30 24 20h60L72 30z"/>
    <path d="M16 28.6 25.4 21.4h54.6L70.6 28.6z" fill="none" stroke="#7d867a" stroke-width="1.1"/>
    ${[0, 1, 2, 3].map((i) => `<path fill="url(#lv-cu)" d="M${62 + i * 3.6} ${27.6 - i * 1.4}c0-2.2.7-3.8 1.4-4.8.7 1 1.4 2.6 1.4 4.8z"/>`).join('')}
    <path d="M70.6 28.6 80 21.4" stroke="#3f463c" stroke-width="2.6"/>
    <path d="M71 27.8c2-6 5-10.6 9.4-12.4 3.4-1.4 5.6.4 4.2 2.6-1.2 2-4.4 1.4-3.6-1" fill="none" stroke="url(#lv-steel)" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="21" cy="26" r="3.2" fill="none" stroke="#6a7366" stroke-width="1.4"/><path d="M23.6 24.6l4-2" stroke="#6a7366" stroke-width="1.6" stroke-linecap="round"/>
    <rect fill="url(#lv-zinc)" x="12" y="30" width="60" height="34" rx="1.5"/>
    <path d="M12 33.5h60" stroke="#5f685b" stroke-width="1"/>
    <path fill="#6f786b" d="M72 30 84 20v34l-12 10z"/>
    <path d="M72 33.5 84 23.5" stroke="#4f574c" stroke-width="1"/>
    <text x="42" y="47" text-anchor="middle" font-size="7.5" font-weight="900" fill="#f2e7a2" opacity=".85" font-family="system-ui">7,62</text>
    <text x="42" y="57" text-anchor="middle" font-size="6" font-weight="800" fill="#f2e7a2" opacity=".7" font-family="system-ui">440 шт</text>` },
  { max: 1000, name: 'Ящик', art: () => `<g transform="translate(8 14) scale(2)">${use('crate', 0, 0)}</g>` },
  { max: 3000, name: 'Склад', art: () => `<g transform="translate(2 4) scale(1.15)">${use('crate', 0, 30)}${use('crate', 42, 30)}${use('crate', 21, 2)}</g>` },
  { max: Infinity, name: 'Хомяк уровня «арсенал»', art: () => `<g transform="translate(0 2) scale(.93)">
    ${use('crate', 0, 52)}${use('crate', 42, 52)}${use('crate', 84, 52)}${use('crate', 21, 26)}${use('crate', 63, 26)}${use('crate', 42, 0)}
    <path d="M38 -2 Q60 -8 86 0 L112 54 Q100 62 92 58 Q80 66 66 60 Q52 68 40 60 Q24 66 14 58 Q4 62 -6 54 Z" fill="url(#lv-net)" opacity=".85"/>
    <g fill="#4f6b30" opacity=".9"><ellipse cx="54" cy="4" rx="5" ry="2.4" transform="rotate(-20 54 4)"/><ellipse cx="80" cy="22" rx="5" ry="2.2" transform="rotate(30 80 22)"/>
    <ellipse cx="28" cy="34" rx="5" ry="2.4" transform="rotate(-35 28 34)"/><ellipse cx="96" cy="46" rx="4.6" ry="2" transform="rotate(20 96 46)"/><ellipse cx="62" cy="40" rx="4" ry="2" transform="rotate(-10 62 40)"/></g></g>` },
];

const SHOTS = [
  { max: 0, name: 'Всё впереди', art: () => use('round', 40, 6, 0, 1) },
  { max: 499, name: 'Пристрелка', art: () => use('case', 20, 66, -95, 0.55) + use('case', 44, 60, -70, 0.55) + use('case', 62, 70, -115, 0.55) },
  { max: 1999, name: 'Стрелок', art: () => pile(16, 48, 70, 70, 22, 7, 0.4) },
  { max: 4999, name: 'Опытный', art: () => `${pile(14, 48, 26, 46, 12, 11, 0.34)}
    <path fill="url(#lv-steel)" d="M22 24h52l-6 44H28z"/><path d="M22 24h52" stroke="#4d555c" stroke-width="2"/>
    <path d="M24 26 Q48 -6 72 26" fill="none" stroke="#8a929a" stroke-width="1.6"/>
    <path d="M27 40h42M28.6 54h38.8" stroke="#5f676f" stroke-width=".8" opacity=".7"/>` },
  { max: 9999, name: 'Ветеран', art: () => `${pile(10, 70, 72, 34, 6, 5, 0.34)}
    <path fill="url(#lv-burlap)" d="M28 70q-10-2-8-22 2-18 12-26l-4-8h24l-4 8q12 8 14 26 2 20-8 22z"/>
    <path d="M30 14h24" stroke="#6b5530" stroke-width="2.4"/><path d="M28 30q14 4 28 0M24 46q20 5 38 0" stroke="#7a6340" stroke-width=".7" fill="none"/>` },
  { max: 24999, name: 'Мастер', art: () => pile(46, 48, 72, 92, 42, 3) },
  { max: Infinity, name: 'Легенда', art: () => `${pile(56, 48, 72, 96, 46, 9)}
    <g transform="translate(48 12)"><path d="M-6 6 -9 16h6l3-5 3 5h6L6 6" fill="#c0392b"/><circle r="8" fill="url(#lv-br)" stroke="#7a5414" stroke-width="1"/>
    <path d="M0-4.6 1.4-1.4 4.8-1.2 2.2 1 3 4.4 0 2.6-3 4.4-2.2 1-4.8-1.2-1.4-1.4z" fill="#7a5414"/></g>` },
];

/** Рівень запасу набоїв за кількістю. */
export function ammoLevel(n) {
  return AMMO.find((l) => n <= l.max);
}

/**
 * Звання за загальним настрілом. next — наступне звання, left — скільки пострілів до нього,
 * progress — частка шляху від початку поточного звання (0..1).
 */
export function shotLevel(n) {
  const i = SHOTS.findIndex((l) => n <= l.max);
  const level = SHOTS[i];
  const next = SHOTS[i + 1] ?? null;
  const from = i > 0 ? SHOTS[i - 1].max + 1 : 0;
  const to = level.max + 1;
  return { ...level, next, left: next ? to - n : 0, progress: next ? Math.min(1, Math.max(0, (n - from) / (to - from))) : 1 };
}

/** Зсув, що ставить намальоване в центр рамки 96×76: малюнки рівнів лежать у ній на різній висоті. */
function centerOffset(art) {
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  probe.setAttribute('viewBox', '0 0 96 76');
  probe.style.cssText = 'position:absolute;left:-200px;top:0;width:96px;height:76px;visibility:hidden';
  probe.innerHTML = art;
  document.body.append(probe);
  const b = probe.getBBox();
  probe.remove();
  return b.width ? [48 - (b.x + b.width / 2), 38 - (b.y + b.height / 2)] : [0, 0];
}

/** Картинка рівня для правої частини підсумку. */
export function levelArt(level) {
  ensureDefs();
  const art = level.art();
  const [dx, dy] = centerOffset(art);
  const el = h('div', { class: 'lv-art', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 96 76"><g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})">${art}</g></svg>`;
  return el;
}
