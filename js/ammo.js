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

/** Тип за калібром: shot — гладкий ствол, rimfire — кільцевий запал, pistol, rifle. */
export function caliberKind(caliber) {
  const c = String(caliber ?? '');
  if (M.barrelLifeFor(c)?.smooth) return 'shot';
  if (/22\s*(lr|wmr|short)/i.test(c)) return 'rimfire';
  return PISTOL_CAL.test(c) ? 'pistol' : 'rifle';
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
  </defs>`;
  document.body.append(svg);
}

// Набій збоку, куля вгорі; viewBox обрізаний під кожен тип, щоб короткі набої не губились.
const CARTRIDGE_SVG = {
  rifle: ['0 0 20 64', `<path fill="url(#sl-copper)" d="M7 15C7 9 9 4 10 1.5 11 4 13 9 13 15Z"/>
    <path fill="url(#sl-brass)" d="M7 14h6v6l3 5v32H4V25l3-5Z"/><rect fill="#5e3f0e" x="5" y="57" width="10" height="2"/><rect fill="url(#sl-brass)" x="3.5" y="59" width="13" height="3.5" rx="1"/>`],
  pistol: ['0 23 20 40', `<path fill="url(#sl-copper)" d="M4.5 37C4.5 29 7 25.5 10 24.5 13 25.5 15.5 29 15.5 37Z"/>
    <rect fill="url(#sl-brass)" x="4" y="36" width="12" height="22" rx="1"/><rect fill="#5e3f0e" x="5" y="57" width="10" height="1.6"/><rect fill="url(#sl-brass)" x="4" y="58.6" width="12" height="3.6" rx="1"/>`],
  rimfire: ['0 34 20 29', `<path fill="url(#sl-lead)" d="M6.5 45C6.5 39 8.3 36 10 35 11.7 36 13.5 39 13.5 45Z"/>
    <rect fill="url(#sl-brass)" x="6" y="44" width="8" height="15" rx=".8"/><rect fill="url(#sl-brass)" x="5" y="58.5" width="10" height="3" rx="1"/>`],
  shot: ['0 6 20 57', `<rect fill="url(#sl-hull)" x="3" y="8" width="14" height="42" rx="2"/><path stroke="#3a0707" stroke-width="1" d="M5 10.5h10M5 13h10"/>
    <rect fill="url(#sl-brass)" x="3" y="45" width="14" height="14"/><rect fill="url(#sl-brass)" x="2" y="58.5" width="16" height="3.6" rx="1"/>`],
};

/** Плитка з набоєм: колір — від калібру, форма — за типом. */
export function cartridgeIcon(caliber) {
  ensureGradients();
  const kind = caliberKind(caliber);
  const [box, body] = CARTRIDGE_SVG[kind];
  const el = h('span', { class: 'ammo-ico', style: `--h:${caliberHue(caliber)}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg class="${kind}" viewBox="${box}">${body}</svg>`;
  return el;
}

