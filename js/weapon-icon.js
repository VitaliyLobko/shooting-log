// Заглушка зброї без фото: силует за типом навскіс через плитку кольору калібру.
import { h } from './ui.js';
import { caliberHue, caliberKind } from './ammo.js';

/** Тип для значка; auto — вгадати за калібром. Підписи — ключі перекладу. */
export const WEAPON_KINDS = {
  auto: 'Авто (по калибру)',
  ar: 'AR / M4',
  ak: 'АК',
  bolt: 'Болтовая винтовка',
  rimfire: 'Мелкашка',
  pistol: 'Пистолет',
  shotgun: 'Гладкоствольное',
};

/** Тип зброї: вибраний вручну, інакше за калібром (7.62×39 і 5.45 — АК, .223/5.56 — AR, решта гвинтівок — болтові). */
export function weaponKind(w) {
  if (w?.kind && w.kind !== 'auto' && SILHOUETTES[w.kind]) return w.kind;
  const caliber = String(w?.caliber ?? '');
  const kind = caliberKind(caliber);
  if (kind === 'shot') return 'shotgun';
  if (kind !== 'rifle') return kind;
  if (/7[.,]62\s*[x×х*]\s*39|5[.,]45/i.test(caliber)) return 'ak';
  if (/(^|[^\d])[.,]?(223|5[.,]56)|300\s*(blk|aac)/i.test(caliber)) return 'ar';
  return 'bolt';
}

// Градієнти один раз на документ; кольори — з CSS-змінних, тож світла тема їх перефарбовує.
function ensureGradients() {
  if (document.getElementById('sl-steel')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const grad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops
    .map(([at, v]) => `<stop offset="${at}" style="stop-color:var(${v})"/>`).join('')}</linearGradient>`;
  svg.innerHTML = `<defs>
    ${grad('sl-steel', [[0, '--gun-steel-1'], [0.5, '--gun-steel-2'], [1, '--gun-steel-3']])}
    ${grad('sl-poly', [[0, '--gun-poly-1'], [1, '--gun-poly-2']])}
    ${grad('sl-wood', [[0, '--gun-wood-1'], [1, '--gun-wood-2']])}
  </defs>`;
  document.body.append(svg);
}

const S = 'fill="url(#sl-steel)"';
const P = 'fill="url(#sl-poly)"';
const W = 'fill="url(#sl-wood)"';
const D = 'fill="var(--gun-detail)"';
const guard = (d) => `<path d="${d}" fill="none" stroke="url(#sl-steel)" stroke-width="1.3" stroke-linejoin="round"/>`;

// Дуло праворуч. [viewBox, вміст]
const SILHOUETTES = {
  ar: ['0 0 120 40', `
    <path ${P} d="M3 13.5 8 13l16 2.2v6.6L8 26.5l-5 1z"/><rect ${D} x="2" y="13" width="2" height="14.6" rx=".6"/>
    <rect ${S} x="22" y="15.6" width="8" height="3.6" rx="1"/>
    <path ${P} d="M29 19h26v3.5h-8l-3 1H31z"/>
    <path ${P} d="M33 22.5h4.5L35 33.5q-.4 1.5-2 1.5h-2.8z"/>
    ${guard('M37.5 23v3h7v-3')}
    <path ${P} d="M45.5 22.5H53l-.8 10.5q-.4 2.5-2.7 2.2l-3.9-.6z"/>
    <path ${S} d="M28 14h29v5.2H28z"/><rect ${D} x="40" y="15.4" width="7" height="2" rx=".4"/>
    <rect ${S} x="29" y="11.4" width="27" height="2.6"/>
    <path d="M29 12h27" stroke="var(--gun-detail)" stroke-width=".9" stroke-dasharray="1.1 .9"/>
    <rect ${P} x="57" y="13.4" width="31" height="7" rx="1.2"/>
    <path d="M60 16.9h26" stroke="var(--gun-detail)" stroke-width="1.5" stroke-dasharray="3 2"/>
    <path ${S} d="M84 16.4v-3h1.3L86.5 7h1.6l1.2 6.4h.7v3z"/>
    <rect ${S} x="88" y="15.6" width="21" height="2.6"/>
    <rect ${S} x="108" y="14.4" width="8.5" height="5" rx=".8"/><path d="M110 15.4v3M112.4 15.4v3" stroke="var(--gun-detail)" stroke-width=".8"/>`],
  ak: ['0 0 120 40', `
    <path ${W} d="M3 13.8 7 13.6l20 3.4v5.2l-20 6.6-4 .8z"/><rect ${S} x="2" y="13.6" width="2.2" height="16" rx=".6"/>
    <path ${S} d="M26 14.6h35v7H26z"/><path ${S} d="M27 14.6q0-2 2-2h29l3 2z"/>
    <circle ${D} cx="30" cy="18" r=".7"/><circle ${D} cx="56" cy="18" r=".7"/>
    <path ${S} d="M58 12.6 61 11h3v2.6z"/>
    <path ${P} d="M35 21.6h5l-2.8 10.9q-.4 1.5-2 1.5h-2.8z"/>
    ${guard('M40 22v3.2h6V22')}
    <path fill="var(--gun-mag)" d="M46 21.6h8.5q1 6.4 6 12.4l-5.7 3.2Q48.8 30 46 21.6z"/>
    <path ${W} d="M61 15.4h20q1 0 1 1.2v3.8q0 1.2-1.4 1.2H61z"/>
    <rect ${W} x="63" y="12.2" width="20" height="3.2" rx="1.6"/><rect ${S} x="82" y="12.6" width="10" height="2.4" rx=".8"/>
    <path ${S} d="M90 18.5V12h1.4V8.2h2V12H95v6.5z"/>
    <rect ${S} x="82" y="15.8" width="27" height="2.4"/>
    <path ${S} d="M108 15h7l1 .8V18l-1 .8h-7z"/>`],
  bolt: ['0 0 120 40', `
    <path ${W} d="M2.5 12.8 6 12.5l24 4.1h56v3.8q0 1-1 1H46l-4.5 3.1-3.3 7.1q-.6 1.2-2 1.2h-3.8l3-8.6-3.8-2.6H25L6 28.8l-3.5.6z"/>
    <rect ${D} x="1.8" y="12.4" width="2.4" height="17.2" rx=".6"/>
    <rect ${S} x="33" y="13.4" width="28" height="3.6" rx="1.2"/>
    <path d="M44 16.6 46.4 21" stroke="url(#sl-steel)" stroke-width="1.4"/><circle ${S} cx="46.8" cy="21.8" r="1.9"/>
    ${guard('M41.5 21.4v2.6h6.5v-2.6')}
    <rect ${P} x="50.5" y="21.4" width="6" height="2.6" rx=".5"/>
    <path ${S} d="M61 14.2h29l26 .9v1.6L90 17H61z"/>
    <rect ${S} x="43" y="10.4" width="3" height="3.2"/><rect ${S} x="60" y="10.4" width="3" height="3.2"/>
    <rect ${P} x="40" y="7.6" width="28" height="3" rx="1"/>
    <path ${P} d="M33 6.4h8v5.4h-8q-1 0-1-1V7.4q0-1 1-1z"/>
    <path ${P} d="M66 7.6 70 5h9q1 0 1 1v6.2q0 1-1 1h-9l-4-2.6z"/>
    <rect ${P} x="51" y="4.4" width="4.4" height="3.4" rx=".6"/><circle ${S} cx="53.2" cy="9.1" r="1.3"/>
    <rect fill="var(--gun-glass)" x="79.2" y="6" width=".8" height="6.2" rx=".4"/>`],
  rimfire: ['0 0 120 40', `
    <path ${W} d="M3 14 6 13.8l24 3.4h52v3H45l-4 3-3 6.8q-.6 1-1.8 1H33l2.6-7.6-3.6-2.2h-7L6 28l-3 .6z"/>
    <rect ${D} x="2.2" y="13.6" width="2.2" height="15.2" rx=".6"/>
    <rect ${S} x="33" y="14.4" width="22" height="3" rx="1"/>
    <path d="M42 17.2 44 20.6" stroke="url(#sl-steel)" stroke-width="1.2"/><circle ${S} cx="44.3" cy="21.1" r="1.5"/>
    ${guard('M38.5 20.2v2.4h5.5v-2.4')}
    <rect ${P} x="47" y="20.2" width="5" height="2.4" rx=".5"/>
    <rect ${S} x="55" y="14.8" width="61" height="2"/>
    <path ${S} d="M66 14.8V13h3v1.8zM112 14.8l1-2.2h1.4l.6 2.2z"/>`],
  shotgun: ['0 0 120 40', `
    <path ${W} d="M3 13.4 7 13.2l21 3.2v5.4L7 28.4l-4 .6z"/><rect ${D} x="2" y="13" width="2.4" height="16.2" rx=".6"/>
    <path ${P} d="M27 14h25q1 0 1 1v6.4H27z"/>
    ${guard('M35 21.4v3.2q0 1.4 1.4 1.4H42v-4.6')}
    <rect ${S} x="52" y="14" width="64" height="2.8" rx=".4"/><circle ${S} cx="115" cy="13.6" r=".8"/>
    <rect ${S} x="52" y="17.2" width="44" height="2.6"/><rect ${S} x="95" y="16.8" width="3" height="3.4" rx=".6"/>
    <rect ${W} x="58.8" y="16.2" width="26.4" height="6" rx="1.2"/>
    <path d="M62 18.2h20M62 20.2h20" stroke="var(--gun-detail)" stroke-width=".5"/>`],
  pistol: ['2 4 54 36', `
    <path ${S} d="M6 8.5h45q2 0 2 2v6H6q-1 0-1-1v-6q0-1 1-1z"/>
    <path d="M9 9.6v5.6M10.6 9.6v5.6M12.2 9.6v5.6M13.8 9.6v5.6" stroke="var(--gun-detail)" stroke-width=".6"/>
    <rect ${D} x="24" y="9.6" width="8" height="2" rx=".4"/>
    <rect ${S} x="49" y="7.2" width="1.6" height="1.4"/><rect ${S} x="7.4" y="7.2" width="2.2" height="1.4"/>
    <path ${P} fill-rule="evenodd" d="M7 16.5h45v2.7q0 1.4-1.4 1.4H35.4q-1.2 0-1.6 1.2l-.6 1.6q-.4 1-1.6 1H25.6l-3.2 12q-.4 1.2-1.6 1.2h-9.2q-1.4 0-1-1.4l3.2-13.6q.2-1.4-1.2-1.8L7 19.4z
      M27.4 20.8h5l-.5 2.2h-3.7z"/>
    <path ${S} d="M29.6 20.8q.6 1.2.2 2.2h-.8q.2-1-.4-2.2z"/>
    <rect ${D} x="10.6" y="36.4" width="11" height="1.6" rx=".6"/>`],
};

/** Плитка-заглушка ствола без фото. */
export function weaponIcon(w) {
  ensureGradients();
  const kind = weaponKind(w);
  const [box, body] = SILHOUETTES[kind];
  const el = h('div', { class: `thumb gun-tile ${kind}`, style: `--h:${caliberHue(w?.caliber)}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="${box}">${body}</svg>`;
  return el;
}
