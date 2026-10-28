// Вкладка БК: калібр — колір і тип, іконка набою в заголовку групи.
import { h } from './ui.js';
import * as M from './model.js';

/** Відтінок від калібру: стволи й набої одного калібру одного кольору. */
export function caliberHue(caliber) {
  let hash = 7;
  for (const ch of String(caliber ?? '')) hash = (hash * 31 + ch.codePointAt(0)) % 360;
  return hash;
}

const PISTOL_CAL = /(9\s*[x×х*]\s*1[789]|\.?45\s*acp|\.?40\s*s&?w|\.?380|9\s*(mm|мм)|luger|para|makarov|макаров|5[.,]7\s*[x×х*]\s*28|7[.,]62\s*[x×х*]\s*25)/i;

// Крупні гвинтівкові: магнуми й великокаліберні. «Magnum» без марки не беремо — це й револьверні .357/.44.
const MAGNUM_CAL = /(\.?338|\.?375|\.?408|\.?416|\.?50\s*bmg|12[.,]7\s*[x×х*]\s*(99|108)|14[.,]5\s*[x×х*]\s*114|(win|rem|norma|wby|weatherby|lapua|ultra|winchester|remington)\.?\s*mag|\bprc\b|\d\s*wm\b)/i;

/** Тип за калібром: shot — гладкий ствол, rimfire — кільцевий запал, pistol, magnum — крупний гвинтівковий, rifle. */
export function caliberKind(caliber) {
  const c = String(caliber ?? '');
  if (M.barrelLifeFor(c)?.smooth) return 'shot';
  if (/22\s*(lr|wmr|short)/i.test(c)) return 'rimfire';
  if (PISTOL_CAL.test(c)) return 'pistol';
  return MAGNUM_CAL.test(c) ? 'magnum' : 'rifle';
}

// ---------- іконка набою ----------

// Градієнти металу — один раз на документ, щоб id не дублювались у кожній іконці.
function ensureGradients() {
  if (document.getElementById('sl-brass')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs>
    <linearGradient id="sl-brass" x1="0" x2="1"><stop offset="0" stop-color="#7a5414"/><stop offset=".3" stop-color="#ffe7a0"/><stop offset=".55" stop-color="#d9a640"/><stop offset="1" stop-color="#6b470f"/></linearGradient>
    <linearGradient id="sl-copper" x1="0" x2="1"><stop offset="0" stop-color="#6e2c0e"/><stop offset=".32" stop-color="#ffbf8a"/><stop offset=".6" stop-color="#cf6c32"/><stop offset="1" stop-color="#55210a"/></linearGradient>
    <linearGradient id="sl-lead" x1="0" x2="1"><stop offset="0" stop-color="#4a4f55"/><stop offset=".35" stop-color="#d4d9de"/><stop offset="1" stop-color="#5d636a"/></linearGradient>
    <linearGradient id="sl-hull" x1="0" x2="1"><stop offset="0" stop-color="#6d1010"/><stop offset=".35" stop-color="#ff6a5c"/><stop offset=".6" stop-color="#c62828"/><stop offset="1" stop-color="#5a0d0d"/></linearGradient>
    <linearGradient id="sl-can" x1="0" x2="1"><stop offset="0" stop-color="#15191c"/><stop offset=".35" stop-color="#5b646c"/><stop offset="1" stop-color="#121518"/></linearGradient>
    <linearGradient id="sl-plastic" x1="0" x2="1"><stop offset="0" stop-color="#7d858c"/><stop offset=".35" stop-color="#f4f6f8"/><stop offset=".6" stop-color="#c5ccd2"/><stop offset="1" stop-color="#6f777e"/></linearGradient>
    <radialGradient id="sl-ball" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#f0f3f5"/><stop offset=".45" stop-color="#8a9096"/><stop offset="1" stop-color="#33383c"/></radialGradient>
    <radialGradient id="sl-cup" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#d9a640"/><stop offset="1" stop-color="#6b470f"/></radialGradient>
  </defs>`;
  document.body.append(svg);
}

// Набій збоку, куля вгорі; viewBox обрізаний під кожен тип, щоб короткі набої не губились.
const CARTRIDGE_SVG = {
  // Крупний: гільза майже на всю ширину, довга куля, латунний поясок над проточкою — щоб відрізнявся від .308 і в маленькій плитці
  magnum: ['0 0 22 64', `<path fill="url(#sl-copper)" d="M7.6 18C7.6 10 9.8 3.4 11 0.6 12.2 3.4 14.4 10 14.4 18Z"/>
    <path fill="url(#sl-brass)" d="M7.5 17h7v6.5l5 4V51h-17V27.5l5-4Z"/>
    <rect fill="url(#sl-brass)" x="1.8" y="50.6" width="18.4" height="4.6" rx=".7"/><rect fill="#5e3f0e" x="1.8" y="50.6" width="18.4" height=".8"/>
    <rect fill="#5e3f0e" x="4" y="55.2" width="14" height="2.2"/><rect fill="url(#sl-brass)" x="1.8" y="57.4" width="18.4" height="5.2" rx="1"/>`],
  rifle: ['0 0 20 64', `<path fill="url(#sl-copper)" d="M7 15C7 9 9 4 10 1.5 11 4 13 9 13 15Z"/>
    <path fill="url(#sl-brass)" d="M7 14h6v6l3 5v32H4V25l3-5Z"/><rect fill="#5e3f0e" x="5" y="57" width="10" height="2"/><rect fill="url(#sl-brass)" x="3.5" y="59" width="13" height="3.5" rx="1"/>`],
  pistol: ['0 23 20 40', `<path fill="url(#sl-copper)" d="M4.5 37C4.5 29 7 25.5 10 24.5 13 25.5 15.5 29 15.5 37Z"/>
    <rect fill="url(#sl-brass)" x="4" y="36" width="12" height="22" rx="1"/><rect fill="#5e3f0e" x="5" y="57" width="10" height="1.6"/><rect fill="url(#sl-brass)" x="4" y="58.6" width="12" height="3.6" rx="1"/>`],
  rimfire: ['0 34 20 29', `<path fill="url(#sl-lead)" d="M6.5 45C6.5 39 8.3 36 10 35 11.7 36 13.5 39 13.5 45Z"/>
    <rect fill="url(#sl-brass)" x="6" y="44" width="8" height="15" rx=".8"/><rect fill="url(#sl-brass)" x="5" y="58.5" width="10" height="3" rx="1"/>`],
  shot: ['0 6 20 57', `<rect fill="url(#sl-hull)" x="3" y="8" width="14" height="42" rx="2"/><path stroke="#3a0707" stroke-width="1" d="M5 10.5h10M5 13h10"/>
    <rect fill="url(#sl-brass)" x="3" y="45" width="14" height="14"/><rect fill="url(#sl-brass)" x="2" y="58.5" width="16" height="3.6" rx="1"/>`],
};

// Компоненти: витягнуті (куля, гільза, контейнер) — під нахилом, як набої; «flat» — прямо.
const COMPONENT_SVG = {
  bullet: [18, '0 0 14 40', `<path fill="url(#sl-copper)" d="M3 26C3 14 5.5 5 7 1 8.5 5 11 14 11 26V34L9.5 38.5H4.5L3 34Z"/>
    <rect fill="#6e2c0e" x="3" y="27.5" width="8" height=".9"/>`],
  case: [42, '0 12 20 52', `<path fill="url(#sl-brass)" d="M7 14h6v6l3 5v32H4V25l3-5Z"/><rect fill="#3d2908" x="7" y="14" width="6" height="1.3"/>
    <rect fill="#5e3f0e" x="5" y="57" width="10" height="2"/><rect fill="url(#sl-brass)" x="3.5" y="59" width="13" height="3.5" rx="1"/>`],
  powder: [150, '0 0 32 32', `<rect fill="url(#sl-hull)" x="10" y="3.5" width="12" height="5" rx="1"/>
    <rect fill="url(#sl-can)" x="7.5" y="8" width="17" height="21" rx="2.2"/>
    <rect fill="#e8e1cf" x="7.5" y="13.5" width="17" height="9"/><rect fill="#a33a14" x="10.5" y="16" width="11" height="1.6"/>
    <rect fill="#6b6b6b" x="10.5" y="19" width="7" height="1.3"/>`, 'flat'],
  primer: [210, '0 0 32 32', `<circle fill="url(#sl-cup)" cx="20.5" cy="20.5" r="8"/><circle fill="none" stroke="#5e3f0e" stroke-width=".8" cx="20.5" cy="20.5" r="6"/>
    <circle fill="url(#sl-cup)" cx="11.5" cy="11.5" r="8"/><circle fill="none" stroke="#5e3f0e" stroke-width=".8" cx="11.5" cy="11.5" r="6"/>`, 'flat'],
  shot: [240, '0 0 32 32', [[9, 23], [16, 23], [23, 23], [12.5, 16.5], [19.5, 16.5], [16, 10]]
    .map(([x, y]) => `<circle fill="url(#sl-ball)" cx="${x}" cy="${y}" r="3.7"/>`).join(''), 'flat'],
  wad: [190, '0 0 20 40', `<path fill="url(#sl-plastic)" d="M4 2h12v22H4Z"/><path stroke="#6f777e" stroke-width=".8" d="M8 2v14M12 2v14"/>
    <rect fill="url(#sl-plastic)" x="7" y="24" width="6" height="6"/><rect fill="url(#sl-plastic)" x="4" y="30" width="12" height="7" rx="1"/>`],
  other: [30, '0 0 32 32', `<path fill="#c9a06a" d="M5 12l11-5 11 5-11 5Z"/><path fill="#9c7440" d="M5 12v12l11 5V17Z"/>
    <path fill="#b48a55" d="M27 12v12l-11 5V17Z"/><path stroke="#6b4c22" stroke-width=".8" fill="none" d="M10.5 9.5l11 5v4"/>`, 'flat'],
};

/** Плитка з компонентом спорядження: куля, порох, капсуль, гільза, дріб, пиж чи інше. */
export function componentIcon(kind) {
  ensureGradients();
  const [hue, box, body, cls = ''] = COMPONENT_SVG[kind] ?? COMPONENT_SVG.other;
  const el = h('span', { class: 'ammo-ico', style: `--h:${hue}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg class="part-${kind} ${cls}" viewBox="${box}">${body}</svg>`;
  return el;
}

/** Плитка з набоєм: колір — від калібру, форма — за типом. */
export function cartridgeIcon(caliber) {
  ensureGradients();
  const kind = caliberKind(caliber);
  const [box, body] = CARTRIDGE_SVG[kind];
  const el = h('span', { class: 'ammo-ico', style: `--h:${caliberHue(caliber)}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg class="${kind}" viewBox="${box}">${body}</svg>`;
  return el;
}

