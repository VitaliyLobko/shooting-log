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
    <linearGradient id="lv-zinc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c0b4"/><stop offset=".5" stop-color="#8b9586"/><stop offset="1" stop-color="#5f685b"/></linearGradient>
    <linearGradient id="lv-card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2c38f"/><stop offset="1" stop-color="#b08a52"/></linearGradient>
    <linearGradient id="lv-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98a52"/><stop offset="1" stop-color="#7d5428"/></linearGradient>
    <linearGradient id="lv-woodD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f6435"/><stop offset="1" stop-color="#5c3a18"/></linearGradient>
    <linearGradient id="lv-bronze" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e49a5c"/><stop offset=".45" stop-color="#c0703a"/><stop offset="1" stop-color="#7f4420"/></linearGradient>
    <linearGradient id="lv-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f5f7"/><stop offset=".45" stop-color="#bcc5cc"/><stop offset="1" stop-color="#7d868e"/></linearGradient>
    <linearGradient id="lv-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".45" stop-color="#e0ad3e"/><stop offset="1" stop-color="#9a6d14"/></linearGradient>
    <linearGradient id="lv-ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7532f"/><stop offset="1" stop-color="#a33318"/></linearGradient>
    <linearGradient id="lv-glint" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>`;
  document.body.append(svg);
}

/** Зірка з n променями для жетона. */
function star(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.44 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

/**
 * Лички звання: шеврони з металу (бронза → срібло → золото), зірки над ними й вінок на вершині.
 * Без металу — порожній пунктирний шеврон: настрілу ще немає.
 */
function chevrons(metal, count, { stars = 0, wreath = false } = {}) {
  if (!metal) return '<path d="M30 30 L48 41 L66 30 L66 37 L48 48 L30 37 Z" fill="none" stroke="#8c958a" stroke-width="2" stroke-dasharray="4 3"/>';
  const dark = { bronze: '#6b3a1c', silver: '#6d757c', gold: '#7d5610' }[metal];
  const fill = `url(#lv-${metal})`;
  const top = 46 - count * 9;
  let out = '';
  for (let i = 0; i < count; i++) {
    const y = top + i * 9;
    out += `<path d="M30 ${y} L48 ${y + 11} L66 ${y} L66 ${y + 7} L48 ${y + 18} L30 ${y + 7} Z" fill="${fill}" stroke="${dark}" stroke-width="1"/>`;
  }
  if (stars >= 1) out += star(48, top - 9, 7, fill);
  if (stars >= 3) out += star(34, top - 5, 5, fill) + star(62, top - 5, 5, fill);
  if (wreath) {
    for (const dir of [-1, 1]) {
      out += `<path d="M${48 + dir * 24} ${top + 30} q${dir * 8} -14 ${dir * 2} -32" fill="none" stroke="#e0ad3e" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
    }
  }
  return out;
}

/** Набій для значків запасу: гільза з кулею, висота 26. */
const roundSvg = (x, y, rot = 0, sc = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">`
  + '<path d="M0 0h9v17l-1.5 2.5h-6L0 17z" fill="url(#lv-br)"/>'
  + '<path d="M0 0h9v-5l-4.5-8L0-5z" fill="url(#lv-cu)"/>'
  + '<rect x="-.6" y="15.5" width="10.2" height="2.2" rx="1" fill="#8a6a1e" opacity=".55"/></g>';

/** Дерев'яний ящик: прості дошки, без написів — у дрібному розмірі важить силует. */
const crateSvg = (x, y, sc = 1) => `<g transform="translate(${x} ${y}) scale(${sc})">`
  + '<rect width="40" height="26" rx="2" fill="url(#lv-wood)"/>'
  + '<rect x="3" y="3" width="34" height="20" rx="1.5" fill="none" stroke="#5c3a18" stroke-width="1.6" opacity=".6"/>'
  + '<path d="M0 9h40M0 17h40" stroke="#5c3a18" stroke-width="1" opacity=".45"/></g>';

// Запас БК: від порожньої коробки до арсеналу. Силует простий, деталей мінімум — значок працює і в 30 px.
const AMMO = [
  { max: 0, name: 'Пусто. Совсем', art: () => '<rect x="26" y="26" width="44" height="30" rx="3" fill="none" stroke="#8c958a" stroke-width="2.4" stroke-dasharray="5 4"/>'
    + '<path d="M38 41h20" stroke="#8c958a" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>' },
  { max: 25, name: 'Россыпь', art: () => roundSvg(28, 28, -14, 1.5) + roundSvg(46, 24, 6, 1.5) + roundSvg(62, 30, 20, 1.5) },
  { max: 100, name: 'Пара пачек', art: () => [0, 1, 2, 3, 4].map((i) => roundSvg(27 + i * 8, 16, 0, 0.72)).join('')
    + '<rect x="24" y="30" width="44" height="26" rx="2.5" fill="url(#lv-card)"/>'
    + '<rect x="24" y="38" width="44" height="8" fill="#c0392b"/>'
    + '<rect x="24" y="30" width="44" height="26" rx="2.5" fill="none" stroke="#8a6534" stroke-width="1.2"/>' },
  { max: 400, name: 'Цинк', art: () => '<path d="M22 28 32 20h34l10 8z" fill="#cfd5ca"/>'
    + '<rect x="22" y="28" width="54" height="30" rx="2" fill="url(#lv-zinc)"/>'
    + '<path d="M22 34h54" stroke="#596254" stroke-width="1.2" opacity=".7"/>'
    + '<path d="M66 24c6-4 11-3 10 1-1 3-5 2-4-1" fill="none" stroke="#e9edf1" stroke-width="2.4" stroke-linecap="round"/>'
    + '<circle cx="33" cy="26" r="3" fill="none" stroke="#596254" stroke-width="1.6"/>' },
  { max: 1000, name: 'Ящик', art: () => crateSvg(29, 26, 1.1) },
  { max: 3000, name: 'Склад', art: () => crateSvg(12, 38, 0.78) + crateSvg(50, 38, 0.78) + crateSvg(31, 18, 0.78) },
  { max: Infinity, name: 'Хомяк уровня «арсенал»', art: () => crateSvg(8, 46, 0.62) + crateSvg(34, 46, 0.62) + crateSvg(60, 46, 0.62)
    + crateSvg(21, 30, 0.62) + crateSvg(47, 30, 0.62) + crateSvg(34, 14, 0.62) },
];

const SHOTS = [
  { max: 0, name: 'Всё впереди', art: () => chevrons(null, 0) },
  { max: 199, name: 'Пристрелка', art: () => chevrons('bronze', 1) },
  { max: 749, name: 'Стрелок', art: () => chevrons('bronze', 2) },
  { max: 1999, name: 'Опытный', art: () => chevrons('silver', 3) },
  { max: 4999, name: 'Ветеран', art: () => chevrons('silver', 3, { stars: 1 }) },
  { max: 9999, name: 'Мастер', art: () => chevrons('gold', 3, { stars: 3 }) },
  { max: Infinity, name: 'Легенда', art: () => chevrons('gold', 3, { stars: 3, wreath: true }) },
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
  const pos = `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`;
  // Повільний відблиск по металу й ящиках: смуга світла йде навскіс лише по намальованому (маска — сам малюнок)
  const id = `lv-shine-${++shineSeq}`;
  const shine = level.max > 0
    ? `<mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="136" height="116" style="mask-type:alpha"><g transform="${pos}">${art}</g></mask>`
      + `<g mask="url(#${id})"><g transform="skewX(-20)"><rect class="lv-shine" x="-30" y="-20" width="22" height="116" fill="url(#lv-glint)"/></g></g>`
    : '';
  el.innerHTML = `<svg viewBox="0 0 96 76"><g transform="${pos}">${art}</g>${shine}</svg>`;
  return el;
}
let shineSeq = 0;

/** Лички звання в кільці, що заповнюється до наступного звання (progress — 0..1). */
export function rankRing(level) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const el = h('div', { class: 'rank-ring', 'aria-hidden': 'true' });
  el.innerHTML = `<svg class="rank-ring-track" viewBox="0 0 92 92"><circle cx="46" cy="46" r="${r}" class="rank-ring-bg"/>`
    + `<circle cx="46" cy="46" r="${r}" class="rank-ring-fill" stroke-dasharray="${(c * level.progress).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  el.append(levelArt(level));
  return el;
}
