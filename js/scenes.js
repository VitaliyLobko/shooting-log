// Святкові мініатюри при запуску: ~4 с поверх готового застосунку, тап — пропустити
import { t } from './i18n.js';

// Приціл, що наводиться на --ax/--ay, і спалах пострілу — спільні для сценок з пострілом
const RETICLE = `<g class="sc-ret" fill="none" stroke="#e9ece6" stroke-width="2">
    <circle r="38"/><path d="M-50 0h36M14 0h36M0-50v36M0 14v36"/><circle r="2.5" fill="#e23a2a" stroke="none"/>
  </g>
  <rect class="sc-flash" x="-2000" y="-2000" width="4360" height="4640" fill="#fff4dc"/>`;

// Геловін: гарбуз на мішенній стійці, приціл, постріл — гарбуз усміхається й світиться, вилітають кажани
// Кажан анфас: крила з «пальцями» й фестонами махають від плечей, тіло з вухами нерухоме, очі світяться
const WING = 'M3-4Q11-17 31-15Q27-7 26 1Q21-5 18 4Q13-1 10 6Q6 2 3 3Z';
const BAT = `<path class="sc-wing r" d="${WING}"/><g transform="scale(-1 1)"><path class="sc-wing l" d="${WING}"/></g>
    <path d="M0-6L-2.4-11-3.4-4.5Q-4.2 1.5-1.8 6.5Q0 9 1.8 6.5Q4.2 1.5 3.4-4.5L2.4-11Z"/>
    <g fill="#ffb347" stroke="none"><circle cx="-1.3" cy="-4.2" r=".75"/><circle cx="1.3" cy="-4.2" r=".75"/></g>`;
const HALLOWEEN = `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="sc-moon"><stop offset="0" stop-color="#f6ecc8" stop-opacity=".45"/><stop offset="1" stop-color="#f6ecc8" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-glow"><stop offset="0" stop-color="#ffcf5a" stop-opacity=".75"/><stop offset=".6" stop-color="#ff8a1e" stop-opacity=".25"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="276" cy="120" r="90" fill="url(#sc-moon)"/>
  <circle cx="276" cy="120" r="34" fill="#f1e6c2"/>
  <g fill="#cfd3dc"><circle cx="48" cy="80" r="1.3"/><circle cx="120" cy="140" r="1"/><circle cx="196" cy="60" r="1.2"/><circle cx="70" cy="210" r="1"/><circle cx="330" cy="230" r=".9"/><circle cx="160" cy="190" r=".8"/></g>
  <path d="M-2000 478H0q90-14 180-6t180-4H2360V2000H-2000z" fill="#11130f"/>
  <g fill="#5d4128"><rect x="146" y="392" width="8" height="92" rx="1"/><rect x="206" y="392" width="8" height="92" rx="1"/><rect x="134" y="386" width="92" height="9" rx="2"/></g>
  <g fill="#15121b" stroke="#7a6f92" stroke-width=".6" stroke-linejoin="round" transform="translate(180 300)">
    <g class="sc-bat b1">${BAT}</g>
    <g class="sc-bat b2">${BAT}</g>
    <g class="sc-bat b3">${BAT}</g>
  </g>
  <circle class="sc-halo" cx="180" cy="335" r="110" fill="url(#sc-glow)"/>
  <g class="sc-pk">
    <path d="M178 290c0-10 4-17 12-21l4 6c-6 3-8 8-8 15z" fill="#56722e"/>
    <ellipse cx="140" cy="338" rx="30" ry="45" fill="#b9520f"/>
    <ellipse cx="220" cy="338" rx="30" ry="45" fill="#b9520f"/>
    <ellipse cx="158" cy="338" rx="30" ry="48" fill="#d8681a"/>
    <ellipse cx="202" cy="338" rx="30" ry="48" fill="#d8681a"/>
    <ellipse cx="180" cy="338" rx="30" ry="50" fill="#ec7f2f"/>
    <g class="sc-face" fill="#ffd56b">
      <path d="M146 328l15-17 15 17z"/><path d="M184 328l15-17 15 17z"/>
      <path d="M174 344l6-9 6 9z"/>
      <path d="M140 352q40 26 80 0l-6 12-8-6-8 9-8-7-8 9-8-9-8 7-8-9-8 6z"/>
    </g>
    <circle class="sc-hole" cx="180" cy="302" r="3" fill="#2a1406"/>
  </g>
  ${RETICLE}
</svg>`;

// Новий рік: цинк відкривається, трасери креслять у небі рік і розсипаються салютом.
// Цифри — один штрих у клітинці 36×60; рік складається з них, тож щороку нічого не перемальовуємо
const DIGITS = [
  'M18 2C6 2 2 16 2 30s4 28 16 28 16-14 16-28S30 2 18 2',
  'M8 14L20 2V58',
  'M4 16C4 7 10 2 18 2s14 5 14 14c0 10-8 17-28 42h30',
  'M4 9C7 4 12 2 18 2c8 0 13 5 13 13s-6 13-14 13c9 0 16 5 16 15S26 58 17 58c-7 0-12-3-15-8',
  'M26 58V2L2 40h32',
  'M30 2H8L5 28c4-3 8-4 13-4 9 0 15 7 15 17s-7 17-16 17c-7 0-12-3-15-8',
  'M29 7c-3-3-7-5-11-5C8 2 3 14 3 32c0 16 6 26 15 26s15-8 15-18-6-17-15-17S3 30 3 36',
  'M2 2h31L13 58',
  'M18 29C10 29 5 23 5 16S10 2 18 2s13 6 13 14-5 13-13 13c-9 0-15 6-15 14s6 15 15 15 15-6 15-15-6-14-15-14',
  'M32 22c0 9-6 16-14 16S3 31 3 20 9 2 18 2s15 8 15 22c0 18-6 34-17 34-5 0-8-2-10-4',
];
const SPARK = ['#ffd56b', '#ff9a3c', '#9fd3ff', '#fff4dc'];
const MOUTH = [180, 472]; // звідки вилітають трасери — відкритий цинк

const isNewYearDay = (d = new Date()) => d.getMonth() === 0 && d.getDate() === 1;

/** Рік, що настає, або той, що настав сьогодні (1 січня). */
function comingYear(d = new Date()) {
  return d.getFullYear() + (isNewYearDay(d) ? 0 : 1);
}

/** Псевдовипадкові числа з зерном — сніг і зірки щоразу на тих самих місцях. */
function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Зимова ніч: зірки й засніжена земля (back) та сніг, що падає (snow). */
function winterNight(rnd) {
  let stars = '', snow = '';
  for (let j = 0; j < 22; j++) {
    stars += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="${(rnd() * 420).toFixed(0)}" r="${(0.6 + rnd() * 0.8).toFixed(1)}"/>`;
  }
  for (let j = 0; j < 16; j++) {
    snow += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="-10" r="${(1 + rnd() * 1.4).toFixed(1)}" `
      + `style="animation-duration:${(5 + rnd() * 4).toFixed(1)}s;animation-delay:-${(rnd() * 8).toFixed(1)}s"/>`;
  }
  return {
    back: `<g fill="#cfd8ea">${stars}</g>
  <path d="M-2000 500H0q90-12 180-4t180-6H2360V2000H-2000z" fill="#1a2233"/>
  <path d="M-2000 500H0q90-12 180-4t180-6H2360" fill="none" stroke="#3a4864" stroke-width="1.5"/>`,
    snow: `<g class="sc-snow" fill="#e8eef8">${snow}</g>`,
  };
}

function newYear() {
  const digits = [...String(comingYear())].map(Number);
  const cell = 50, k = 1.25, y0 = 130;
  const x0 = 180 - (k * (cell * (digits.length - 1) + 36)) / 2;
  const night = winterNight(seeded(2027));
  let ink = '', tracers = '', sparks = '';
  digits.forEach((dg, i) => {
    const d = DIGITS[dg];
    const [mx, my] = d.match(/-?[\d.]+/g).slice(0, 2).map(Number);
    const tx = x0 + k * (i * cell + mx) - MOUTH[0], ty = y0 + k * my - MOUTH[1];
    const go = 0.8 + i * 0.15;
    tracers += `<g class="sc-tr" style="--tx:${tx.toFixed(1)}px;--ty:${ty.toFixed(1)}px;animation-delay:${go}s">`
      + `<g transform="rotate(${(Math.atan2(ty, tx) * 180 / Math.PI).toFixed(1)})"><path d="M-32 0H0"/><circle r="3"/></g></g>`;
    ink += `<g style="--d:${(go + 0.42).toFixed(2)}s" transform="translate(${i * cell} 0)">`
      + `<path class="sc-glow" pathLength="1" d="${d}"/><path class="sc-ink" pathLength="1" d="${d}"/></g>`;
    const cx = x0 + k * (i * cell + 18), cy = y0 + k * 30;
    // салют: іскри-рисочки летять радіально від центру цифри
    for (let j = 0; j < 18; j++) {
      const a = (j / 18) * 2 * Math.PI + i, r = 55 + (j % 3) * 28, c = Math.cos(a), sn = Math.sin(a);
      sparks += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)}l${(c * 8).toFixed(1)} ${(sn * 8).toFixed(1)}" stroke="${SPARK[(i + j) % 4]}" `
        + `style="--dx:${(c * r).toFixed(1)}px;--dy:${(sn * r).toFixed(1)}px;animation-delay:${(2.8 + i * 0.09).toFixed(2)}s"/>`;
    }
  });
  const tips = [158, 166, 174, 182, 190, 198].map((x) => `<path d="M${x} 479v-5l2-5 2 5v5z"/>`).join('');
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="sc-warm"><stop offset="0" stop-color="#ffd56b" stop-opacity=".8"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
  </defs>
  ${night.back}
  <ellipse class="sc-can-glow" cx="180" cy="472" rx="46" ry="22" fill="url(#sc-warm)"/>
  <g fill="#c99a3c">${tips}</g>
  <rect x="152" y="478" width="56" height="34" rx="2" fill="#3f4d33"/>
  <path d="M152 489h56M152 500h56" stroke="#33402a" stroke-width="2"/>
  <rect class="sc-lid" x="149" y="470" width="62" height="9" rx="1.5" fill="#4d5d3d"/>
  <g transform="translate(${MOUTH[0]} ${MOUTH[1]})" fill="#fffbe8" stroke="#ffcf6a" stroke-width="2" stroke-linecap="round">${tracers}</g>
  <g class="sc-year" transform="translate(${x0.toFixed(1)} ${y0}) scale(${k})" fill="none" stroke-linecap="round" stroke-linejoin="round">${ink}</g>
  <g class="sc-sparks" stroke-width="2.4" stroke-linecap="round">${sparks}</g>
  ${night.snow}
</svg>`;
}

// 31.12: злий сніговик-ватник — постріл у груди: діра з ватою, конфеті замість крові, вушанка злітає, сам розсипається в замет
const CONFETTI = ['#ffd56b', '#ff9a3c', '#9fd3ff', '#fff4dc', '#7bd88f', '#ff7aa8'];
const VATNIK = 'M144 352Q180 334 216 352L222 414Q180 426 138 414Z';

/** П'ятикутна зірка з центром cx, cy. */
function star(cx, cy, R, r) {
  const pts = [];
  for (let j = 0; j < 10; j++) {
    const a = -Math.PI / 2 + (j * Math.PI) / 5, l = j % 2 ? r : R;
    pts.push(`${(cx + l * Math.cos(a)).toFixed(1)} ${(cy + l * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

function snowman() {
  const rnd = seeded(31);
  const night = winterNight(rnd);
  // наскрізна діра з рваним краєм, крізь неї видно небо; довкола стирчить вата з ватника
  const [hx, hy] = [180, 384];
  let gap = '', wad = '', conf = '';
  for (let j = 0; j < 16; j++) {
    const a = (j / 16) * 2 * Math.PI, l = j % 2 ? 9 + rnd() * 3 : 13 + rnd() * 4;
    gap += `${j ? 'L' : 'M'}${(hx + l * Math.cos(a)).toFixed(1)} ${(hy + l * Math.sin(a)).toFixed(1)}`;
    if (rnd() < 0.3) continue; // клоччя вати нерівне — де густо, де порожньо
    const b = a + (rnd() - 0.5) * 0.4, w = 12 + rnd() * 8;
    wad += `<circle cx="${(hx + w * Math.cos(b)).toFixed(1)}" cy="${(hy + w * Math.sin(b)).toFixed(1)}" r="${(2 + rnd() * 4.5).toFixed(1)}" fill="#eef2f7"/>`;
  }
  gap += 'Z';
  // сніговик осідає в замет — збоку здіймається хмарка снігу
  let puff = '';
  for (let j = 0; j < 16; j++) {
    const a = Math.PI + (j / 15) * Math.PI, r = 40 + rnd() * 50;
    puff += `<circle cx="180" cy="478" r="${(2 + rnd() * 2.5).toFixed(1)}" `
      + `style="--dx:${(Math.cos(a) * r * 1.6).toFixed(1)}px;--dy:${(Math.sin(a) * r * 0.7).toFixed(1)}px;animation-delay:${(2 + rnd() * 0.12).toFixed(2)}s"/>`;
  }
  // конфеті замість крові — бризкає з діри
  for (let j = 0; j < 40; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 4.4, r = 70 + rnd() * 120;
    conf += `<rect x="${hx - 2}" y="${hy - 4}" width="4" height="7" rx="1" fill="${CONFETTI[j % CONFETTI.length]}" `
      + `style="--dx:${(Math.cos(a) * r).toFixed(1)}px;--dy:${(Math.sin(a) * r).toFixed(1)}px;`
      + `--r:${(rnd() * 720 - 360).toFixed(0)}deg;animation-delay:${(1.32 + rnd() * 0.15).toFixed(2)}s"/>`;
  }
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="sc-ball" cx=".4" cy=".35" r=".7"><stop offset=".3" stop-color="#f4f8fc"/><stop offset="1" stop-color="#aebcd0"/></radialGradient>
    <clipPath id="sc-vat"><path d="${VATNIK}"/></clipPath>
  </defs>
  ${night.back}
  <ellipse cx="180" cy="500" rx="62" ry="7" fill="#0b1020" opacity=".55"/>
  <g class="sc-man">
    <circle cx="180" cy="452" r="50" fill="url(#sc-ball)"/>
    <g stroke-linecap="round">
      <path d="M152 360L126 386 144 404M208 360L234 386 216 404" stroke="#3d4436" stroke-width="15" stroke-linejoin="round" fill="none"/>
      <path d="M144 404l9 4M148 406l1 8M216 404l-9 4M212 406l-1 8" stroke="#5a3d24" stroke-width="3" fill="none"/>
    </g>
    <circle cx="180" cy="378" r="40" fill="url(#sc-ball)"/>
    <path d="${VATNIK}" fill="#3d4436"/>
    <g clip-path="url(#sc-vat)" fill="none">
      <path d="M130 365h100M130 378h100M130 391h100M130 404h100" stroke="#2b3027" stroke-width="1.6"/>
      <path d="M130 366.6h100M130 379.6h100M130 392.6h100M130 405.6h100" stroke="#4b5343" stroke-width=".8"/>
      <path d="M180 340V424" stroke="#262a22" stroke-width="2"/>
    </g>
    <path d="M162 346Q180 356 198 346L194 340Q180 348 166 340Z" fill="#4b5343"/>
    <rect x="199" y="393" width="12" height="10" fill="#565d4b" transform="rotate(8 205 398)"/>
    <g class="sc-gap">${wad}<path d="${gap}" fill="#0c1425"/></g>
    <circle cx="180" cy="300" r="30" fill="url(#sc-ball)"/>
    <circle class="sc-eye" cx="170" cy="296" r="2.8" fill="#1b1b1b"/><circle class="sc-eye" cx="191" cy="296" r="2.8" fill="#1b1b1b"/>
    <path class="sc-brow" d="M162 286L177 292M199 286L184 292" stroke="#1b1b1b" stroke-width="3.2" stroke-linecap="round"/>
    <g fill="#1b1b1b"><circle cx="167" cy="318" r="1.6"/><circle cx="173" cy="314" r="1.6"/><circle cx="180" cy="313" r="1.6"/><circle cx="187" cy="314" r="1.6"/><circle cx="193" cy="318" r="1.6"/></g>
    <path class="sc-nose" d="M181 301L210 307 181 311Z" fill="#e8742a"/>
  </g>
  <g class="sc-pile">
    <path d="M112 502Q118 474 144 470Q158 452 182 457Q206 449 222 467Q246 470 250 502Z" fill="url(#sc-ball)"/>
    <path d="M232 474L250 450M246 456l7-1" stroke="#5a3d24" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M196 460L216 434 205 464Z" fill="#e8742a"/>
    <path d="M146 474L178 465 192 476 160 486Z" fill="#3d4436"/>
    <path d="M152 477l30-8M156 482l30-8" stroke="#2b3027" stroke-width="1.4"/>
    <g fill="#1b1b1b"><circle cx="134" cy="488" r="2"/><circle cx="214" cy="482" r="2"/><circle cx="226" cy="492" r="1.6"/></g>
  </g>
  <g class="sc-puff" fill="#eef2f7">${puff}</g>
  <g class="sc-hat">
    <path d="M152 282Q153 254 180 252Q207 254 208 282Z" fill="#4a3828"/>
    <g fill="#6b5440"><rect x="146" y="274" width="68" height="14" rx="7"/><path d="M147 282h11v26q-5 5-11 0z"/><path d="M202 282h11v26q-6 5-11 0z"/></g>
    <path d="${star(180, 265, 6, 2.5)}" fill="#d23a2a"/>
  </g>
  ${RETICLE}
  <g class="sc-conf">${conf}</g>
  ${night.snow}
</svg>`;
}

const SCENES = {
  halloween: { svg: () => HALLOWEEN, text: () => t('Счастливого Хэллоуина!'), ms: 4300 },
  snowman: { svg: snowman, text: () => t('Встречаем {year}!\nВыстоим!', { year: comingYear() }), ms: 5900 },
  newyear: { svg: newYear, text: () => (isNewYearDay() ? t('С Новым годом!') : t('Встречаем {year}!', { year: comingYear() })), ms: 5000 },
};

/** Програти сценку name; повертає false, якщо такої нема. */
export function playScene(name) {
  const s = SCENES[name];
  if (!s) return false;
  const el = document.createElement('div');
  el.className = `scene scene-${name}`;
  el.innerHTML = s.svg();
  const cap = document.createElement('p');
  cap.className = 'scene-cap';
  cap.textContent = s.text();
  el.append(cap);
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  };
  el.addEventListener('pointerdown', close);
  setTimeout(close, s.ms);
  document.body.append(el);
  return true;
}
