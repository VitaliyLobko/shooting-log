// Святкові мініатюри при запуску: ~4 с поверх готового застосунку, тап — пропустити
import { t } from './i18n.js';

// Спалах пострілу чи вибуху й приціл, що наводиться на --ax/--ay, — спільні для сценок з пострілом
const FLASH = '<rect class="sc-flash" x="-2000" y="-2000" width="4360" height="4640" fill="#fff4dc"/>';
const RETICLE = `<g class="sc-ret" fill="none" stroke="#e9ece6" stroke-width="2">
    <circle r="38"/><path d="M-50 0h36M14 0h36M0-50v36M0 14v36"/><circle r="2.5" fill="#e23a2a" stroke="none"/>
  </g>
  ${FLASH}`;

// Геловін: світний гарбуз на мішенній стійці, приціл, постріл у лоб — гарбуз розлітається на шматки, вилітають кажани
// Кажан анфас: крила з «пальцями» й фестонами махають від плечей, тіло з вухами нерухоме, очі світяться
const WING = 'M3-4Q11-17 31-15Q27-7 26 1Q21-5 18 4Q13-1 10 6Q6 2 3 3Z';
const BAT = `<path class="sc-wing r" d="${WING}"/><g transform="scale(-1 1)"><path class="sc-wing l" d="${WING}"/></g>
    <path d="M0-6L-2.4-11-3.4-4.5Q-4.2 1.5-1.8 6.5Q0 9 1.8 6.5Q4.2 1.5 3.4-4.5L2.4-11Z"/>
    <g fill="#ffb347" stroke="none"><circle cx="-1.3" cy="-4.2" r=".75"/><circle cx="1.3" cy="-4.2" r=".75"/></g>`;
const PK = [180, 338]; // центр гарбуза
const PK_FILL = ['#b9520f', '#d8681a', '#ec7f2f'];

/** Шматки гарбуза: рвані уламки по всьому гарбузу, частина — зі світним клаптем вирізаної пики; летять дугою й падають на землю. */
function pumpkinBits(rnd) {
  let bits = '', pulp = '';
  for (let j = 0; j < 16; j++) {
    const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd());
    const px = PK[0] + Math.cos(a) * d * 62, py = PK[1] + Math.sin(a) * d * 42, s = 9 + rnd() * 9;
    let shard = '';
    for (let k = 0; k < 6; k++) {
      const b = (k / 6) * 2 * Math.PI + rnd() * 0.5, l = s * (0.55 + rnd() * 0.45);
      shard += `${k ? 'L' : 'M'}${(px + l * Math.cos(b)).toFixed(1)} ${(py + l * Math.sin(b)).toFixed(1)}`;
    }
    const lit = j % 5 === 0 ? `<path d="M${px - s * 0.3} ${py + s * 0.2}l${s * 0.3} ${-s * 0.45} ${s * 0.3} ${s * 0.45}z" fill="#ffd56b"/>` : '';
    bits += `<g style="--dx:${((px - PK[0]) * 2.4 + (rnd() - 0.5) * 60).toFixed(0)}px;--up:-${(50 + rnd() * 110).toFixed(0)}px;`
      + `--land:${(482 + rnd() * 16 - py).toFixed(0)}px;--r:${(rnd() * 900 - 450).toFixed(0)}deg;animation-duration:${(1 + rnd() * 0.35).toFixed(2)}s">`
      + `<path d="${shard}Z" fill="${PK_FILL[j % 3]}" stroke="#8a3c0b" stroke-width="1.5" stroke-linejoin="round"/>${lit}</g>`;
  }
  // мʼякоть і насіння бризкають навсібіч і тануть
  for (let j = 0; j < 26; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 5, r = 50 + rnd() * 110;
    pulp += j % 3
      ? `<circle cx="${PK[0]}" cy="${PK[1] - 20}" r="${(1.8 + rnd() * 2.6).toFixed(1)}" fill="${j % 2 ? '#f0a03c' : '#ffcf5a'}" `
      : `<ellipse cx="${PK[0]}" cy="${PK[1] - 20}" rx="2.6" ry="1.5" fill="#f4ead2" `;
    pulp += `style="--dx:${(Math.cos(a) * r).toFixed(1)}px;--dy:${(Math.sin(a) * r).toFixed(1)}px;animation-delay:${(1.27 + rnd() * 0.08).toFixed(2)}s"/>`;
  }
  return { bits, pulp };
}

function halloween() {
  const { bits, pulp } = pumpkinBits(seeded(1031));
  return `
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
  </g>
  <g class="sc-bits">${bits}
    <g style="--dx:46px;--up:-190px;--land:186px;--r:620deg;animation-duration:1.4s"><path d="M178 290c0-10 4-17 12-21l4 6c-6 3-8 8-8 15z" fill="#56722e"/></g>
  </g>
  <g class="sc-pulp">${pulp}</g>
  ${RETICLE}
</svg>`;
}

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

// 31.12: злий сніговик-ватник з автоматом — постріл у груди: діра з ватою, конфеті замість крові, вушанка злітає, сам розсипається в замет
const CONFETTI = ['#ffd56b', '#ff9a3c', '#9fd3ff', '#fff4dc', '#7bd88f', '#ff7aa8'];
// плечі ватника йдуть по контуру середньої грудки (r 40 від 180, 378) з запасом — сніг зверху не визирає
const VATNIK = 'M138 372Q140 340 180 334Q220 340 222 372L222 414Q180 426 138 414Z';
// Автомат збоку, ствол праворуч, (0, 0) — середина ствольної коробки: приклад, коробка, руків'я, ріжок, цівка, газова трубка, ствол
const RIFLE = `<path d="M-58 3L-26-4V4L-56 12Z" fill="#6b3f1f"/>
    <g fill="#2a2d30"><path d="M-27-5H15V4H-27Z"/><path d="M-17 4l-5 12h5l4-12Z"/><path d="M2 4q2 10 8 18l7-3q-5-7-6-15Z"/>
      <path d="M14-8H42V-5H14Z"/><path d="M38-1.6H62V1.6H38Z"/><path d="M53-1.6v-5h2v5Z"/></g>
    <path d="M15-4.5H38V3.5H15Z" fill="#7a4a24"/>`;

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
    <circle cx="180" cy="378" r="40" fill="url(#sc-ball)"/>
    <path d="${VATNIK}" fill="#3d4436"/>
    <g clip-path="url(#sc-vat)" fill="none">
      <path d="M130 352h100M130 365h100M130 378h100M130 391h100M130 404h100" stroke="#2b3027" stroke-width="1.6"/>
      <path d="M130 353.6h100M130 366.6h100M130 379.6h100M130 392.6h100M130 405.6h100" stroke="#4b5343" stroke-width=".8"/>
      <path d="M180 340V424" stroke="#262a22" stroke-width="2"/>
    </g>
    <path d="M162 346Q180 356 198 346L194 340Q180 348 166 340Z" fill="#4b5343"/>
    <rect x="199" y="393" width="12" height="10" fill="#565d4b" transform="rotate(8 205 398)"/>
    <g class="sc-gap">${wad}<path d="${gap}" fill="#0c1425"/></g>
    <path d="M148 364L126 398 160 430M212 364L238 396 204 414" stroke="#3d4436" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <g transform="translate(182 420) rotate(-12)">${RIFLE}</g>
    <path d="M160 430l7 1M160 433l6 4M204 414l7-3M205 417l7-1" stroke="#5a3d24" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="180" cy="300" r="30" fill="url(#sc-ball)"/>
    <circle class="sc-eye" cx="170" cy="296" r="2.8" fill="#1b1b1b"/><circle class="sc-eye" cx="191" cy="296" r="2.8" fill="#1b1b1b"/>
    <path class="sc-brow" d="M162 286L177 292M199 286L184 292" stroke="#1b1b1b" stroke-width="3.2" stroke-linecap="round"/>
    <g fill="#1b1b1b"><circle cx="167" cy="318" r="1.6"/><circle cx="173" cy="314" r="1.6"/><circle cx="180" cy="313" r="1.6"/><circle cx="187" cy="314" r="1.6"/><circle cx="193" cy="318" r="1.6"/></g>
    <path class="sc-nose" d="M181 301L210 307 181 311Z" fill="#e8742a"/>
  </g>
  <g class="sc-pile">
    <g transform="translate(210 452) rotate(-58) scale(.85)">${RIFLE}</g>
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

// 24.08: світанок; зверху небо з кремлем на обрії, знизу пшеничне поле. Наша ракета — спалах, ядерний гриб,
// кремль стирається з лиця землі; а в нас просто сходить сонце й у полі проявляється Малий Державний Герб
// Контури герба — з офіційного SVG (Wikimedia Commons, Lesser_Coat_of_Arms_of_Ukraine.svg, viewBox -82.5 0 165 230.5);
// бічна частина тризуба — права, ліва — її дзеркало
const COA_SHIELD = 'M-81.25 1.25h162.5v172.5a31.25 31.25 0 0 1-18.578029 28.565428L0 228.867475l-62.671971-27.802047A31.25 31.25 0 0 1-81.25 172.5z';
const COA_MID = 'M5.985561 78.82382a104.079383 104.079383 0 0 0 14.053598 56.017033 55 55 0 0 1-13.218774 70.637179A20 20 0 0 0 0 212.5a20 20 0 0 0-6.820384-7.021968 55 55 0 0 1-13.218774-70.637179A104.079383 104.079383 0 0 0-5.98556 78.82382l-1.599642-45.260519A30.103986 30.103986 0 0 1 0 12.5a30.103986 30.103986 0 0 1 7.585202 21.063301zM5 193.624749a45 45 0 0 0 6.395675-53.75496A114.079383 114.079383 0 0 1 0 112.734179a114.079383 114.079383 0 0 1-11.395675 27.13561A45 45 0 0 0-5 193.624749V162.5H5z';
const COA_SIDE = 'M27.779818 75.17546A62.64982 62.64982 0 0 1 60 27.5v145H0l-5-10a22.5 22.5 0 0 1 17.560976-21.95122l14.634147-3.292683a10 10 0 1 0-4.427443-19.503751zm5.998315 34.353887a20 20 0 0 1-4.387889 37.482848l-14.634146 3.292683A12.5 12.5 0 0 0 5 162.5h45V48.265462a52.64982 52.64982 0 0 0-12.283879 28.037802zM42 122.5h10v10H42z';
// Обрій HZ — посередині екрана. Кремль малюємо в координатах (основа 74, 482) і збільшуємо KREMLIN разів,
// переносячи основу в (KX, HZ + 3) — трохи нижче лінії поля, щоб стояв на обрії, а не висів над ним
const HZ = 320, KREMLIN = 1.5, KX = 84;
const kremlinAt = (x, y) => [KX + (x - 74) * KREMLIN, HZ + 3 + (y - 482) * KREMLIN];
const STRIKE = { at: [72, 428], from: [300, -520], go: 0.35 }; // ціль у координатах кремля, звідки летить, старт; падіння — через 0,9 с

/** Ядерний гриб з основою в (0, 0): пилова хвиля, стовп, кільце конденсації, широка клубчаста шапка з вогняним ядром. */
function mushroom() {
  return '<path d="M-92 0C-90-16-62-26-40-18-24-30 24-30 40-18 62-26 90-16 92 0Z" fill="#8a6a58"/>'
    + '<path d="M-11-10C-8-50-10-95-19-128H19C10-95 8-50 11-10Z" fill="url(#sc-mstem)"/>'
    + '<ellipse class="sc-mglow" cx="0" cy="-40" rx="16" ry="34" fill="url(#sc-mcore)"/>'
    + '<ellipse cx="0" cy="-72" rx="32" ry="7" fill="none" stroke="#efe0cc" stroke-width="3" opacity=".55"/>'
    + '<path d="M-64-152C-70-178-42-198-21-194-10-213 12-213 23-196 46-200 72-180 64-152 72-138 56-121 38-126 24-115-24-115-38-126-57-121-72-138-64-152Z" fill="url(#sc-mcap)"/>'
    + '<ellipse cx="0" cy="-124" rx="44" ry="8" fill="#4a2e2a" opacity=".55"/>'
    + '<ellipse class="sc-mglow" cx="0" cy="-158" rx="48" ry="28" fill="url(#sc-mcore)"/>';
}

function independence() {
  const rnd = seeded(824);
  let wheat = '', wall = 'M14 482V468';
  for (let j = 0; j < 150; j++) {
    const x = rnd() * 1160 - 400, y = HZ + 4 + rnd() * 310, l = 6 + rnd() * 10;
    wheat += `M${x.toFixed(0)} ${y.toFixed(0)}l${(rnd() * 4 - 2).toFixed(1)} -${l.toFixed(0)}`;
  }
  for (let x = 14; x < 134; x += 8) wall += `H${x + 2}v-5h4v5`;
  wall += 'H134V482Z';
  const { at, from, go } = STRIKE;
  const [hx, hy] = kremlinAt(...at);
  const ang = (Math.atan2(-from[1], -from[0]) * 180) / Math.PI;
  const [mx] = kremlinAt(at[0], 482);
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="sc-dawn" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${HZ}">
      <stop offset="0" stop-color="#0f2a5c"/><stop offset=".55" stop-color="#2d5fa8"/><stop offset=".85" stop-color="#9fb6c9"/><stop offset="1" stop-color="#ffd27a"/>
    </linearGradient>
    <radialGradient id="sc-sun"><stop offset=".35" stop-color="#fff1b8"/><stop offset=".5" stop-color="#ffd34d" stop-opacity=".6"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-fireglow"><stop offset="0" stop-color="#ff7a1a" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-boom"><stop offset=".2" stop-color="#fffbe0"/><stop offset=".5" stop-color="#ffc23a" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-mcore"><stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#ff9a2e" stop-opacity=".9"/><stop offset="1" stop-color="#d2461a" stop-opacity="0"/></radialGradient>
    <linearGradient id="sc-mcap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eab98a"/><stop offset=".55" stop-color="#b4583a"/><stop offset="1" stop-color="#6a3d33"/></linearGradient>
    <linearGradient id="sc-mstem" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffcf6a"/><stop offset=".5" stop-color="#c9703f"/><stop offset="1" stop-color="#8a4f3c"/></linearGradient>
    <linearGradient id="sc-trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd27a" stop-opacity="0"/><stop offset=".8" stop-color="#ffb347" stop-opacity=".8"/><stop offset="1" stop-color="#fff6d8"/></linearGradient>
    <linearGradient id="sc-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6b437"/><stop offset=".3" stop-color="#b9861f"/><stop offset="1" stop-color="#6e4f14"/></linearGradient>
  </defs>
  <rect x="-2000" y="-2000" width="4360" height="${2000 + HZ}" fill="url(#sc-dawn)"/>
  <circle class="sc-sun" cx="250" cy="${HZ + 18}" r="80" fill="url(#sc-sun)"/>
  <g transform="translate(${KX} ${HZ + 3}) scale(${KREMLIN}) translate(-74 -482)">
    <ellipse class="sc-kglow" cx="74" cy="470" rx="120" ry="44" fill="url(#sc-fireglow)"/>
    <g class="sc-kremlin" fill="#2b2033">
      <path d="${wall}"/>
      <rect x="64" y="424" width="16" height="46"/><rect x="66" y="410" width="12" height="14"/><rect x="68" y="402" width="8" height="8"/>
      <path d="M68 402L72 380 76 402Z"/>
      <rect x="108" y="440" width="10" height="30"/><path d="M107 440L113 424 119 440Z"/>
      <rect x="32" y="447" width="10" height="23"/><path d="M30 447C30 440 37 437 37 430C37 437 44 440 44 447Z"/>
      <path d="${star(72, 376, 4.2, 1.8)}" fill="#d23a2a"/>
    </g>
    <circle class="sc-boom" cx="${at[0]}" cy="${at[1]}" r="40" fill="url(#sc-boom)"/>
  </g>
  <g transform="translate(${mx.toFixed(1)} ${HZ}) scale(1.15)"><g class="sc-mush">${mushroom()}</g></g>
  <g transform="translate(${hx.toFixed(1)} ${hy.toFixed(1)})"><g class="sc-bm" style="--fx:${from[0]}px;--fy:${from[1]}px;animation-delay:${go}s">
    <g transform="rotate(${ang.toFixed(1)})"><path d="M-150-2.2H-6V2.2H-150Z" fill="url(#sc-trail)"/>
      <path d="M-22-3.2H-4L3 0-4 3.2H-22Z" fill="#e8ecef"/><path d="M-22-3.2L-27-7.5H-18ZM-22 3.2L-27 7.5H-18Z" fill="#9aa3ab"/></g>
  </g></g>
  <path d="M-2000 ${HZ}H0q90-8 180-2t180-4H2360V2000H-2000z" fill="url(#sc-field)"/>
  <path d="${wheat}" stroke="#f3cf62" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
  <g class="sc-shield"><g transform="translate(180 ${HZ + 28}) scale(.56)">
    <path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="2.5"/>
    <g class="sc-coa" fill="#ffd500"><path d="${COA_MID}"/><path d="${COA_SIDE}"/><path d="${COA_SIDE}" transform="scale(-1 1)"/></g>
  </g></g>
  ${FLASH}
</svg>`;
}

// День народження ствола (дата покупки): торт на столі, свічка; постріл гасить полум'я — дим, конфеті, гірлянда
const FLAME = [180, 266];

function birthday(p = {}) {
  const rnd = seeded(7);
  let conf = '', bulbs = '', flags = '';
  for (let j = 0; j < 36; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 3.6, r = 80 + rnd() * 130;
    conf += `<rect x="${FLAME[0] - 2}" y="${FLAME[1] - 4}" width="4" height="7" rx="1" fill="${CONFETTI[j % CONFETTI.length]}" `
      + `style="--dx:${(Math.cos(a) * r).toFixed(1)}px;--dy:${(Math.sin(a) * r).toFixed(1)}px;`
      + `--r:${(rnd() * 720 - 360).toFixed(0)}deg;animation-delay:${(1.42 + rnd() * 0.15).toFixed(2)}s"/>`;
  }
  // гірлянда-прапорці вгорі провисає дугою; лампочки між прапорцями засвічуються після пострілу
  const sag = (x) => 64 + 46 * Math.sin((x / 360) * Math.PI);
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 40, y = sag(x);
    flags += `<path d="M${x - 13} ${y.toFixed(1)}L${x + 13} ${sag(x + 13).toFixed(1)}L${x} ${(y + 30).toFixed(1)}Z" fill="${CONFETTI[i % CONFETTI.length]}" opacity=".85"/>`;
    const bx = x + 20, by = sag(bx) + 3;
    if (i < 8) bulbs += `<circle cx="${bx}" cy="${by.toFixed(1)}" r="4" fill="#ffd56b" style="animation-delay:${(1.7 + i * 0.07).toFixed(2)}s"/>`;
  }
  const years = Number.isFinite(p.years) ? String(p.years) : '';
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="sc-candle"><stop offset="0" stop-color="#ffd56b" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="-400" y="-400" width="1160" height="1440" fill="#140f0c"/>
  <circle class="sc-candle-glow" cx="${FLAME[0]}" cy="${FLAME[1] + 60}" r="240" fill="url(#sc-candle)"/>
  <path d="M-10 ${sag(-10).toFixed(1)}Q180 ${(sag(180) * 2 - 64).toFixed(1)} 370 ${sag(370).toFixed(1)}" fill="none" stroke="#6d5a48" stroke-width="2"/>
  <g>${flags}</g>
  <g class="sc-bulbs">${bulbs}</g>
  <rect x="-400" y="470" width="1160" height="600" fill="#3a2a1f"/>
  <rect x="-400" y="466" width="1160" height="8" fill="#4a3628"/>
  <ellipse cx="180" cy="468" rx="112" ry="12" fill="#d9d4c7"/>
  <g class="sc-cake">
    <rect x="95" y="400" width="170" height="66" rx="6" fill="#6b3f2a"/>
    <path d="M95 410V404q0-6 6-6h158q6 0 6 6v6q-8 10-14 0t-14 4-14-2-14 6-14-4-14 3-14-5-14 6-14-3-14 4-14-4-14 5-12-6z" fill="#f3e6cf"/>
    <text x="180" y="452" text-anchor="middle" font-size="30" font-weight="800" font-family="system-ui, sans-serif" fill="#ffd56b">${years}</text>
    <rect x="125" y="352" width="110" height="50" rx="6" fill="#7a4a32"/>
    <path d="M125 362v-4q0-6 6-6h98q6 0 6 6v4q-8 9-13 0t-13 5-13-3-13 6-13-4-13 4-13-5-11 5z" fill="#f3e6cf"/>
    <clipPath id="sc-wax"><rect x="173" y="282" width="14" height="70" rx="2"/></clipPath>
    <rect x="173" y="282" width="14" height="70" rx="2" fill="#f4efe4"/>
    <g clip-path="url(#sc-wax)" stroke="#e8734f" stroke-width="4">
      <path d="M170 292l20-10M170 306l20-10M170 320l20-10M170 334l20-10M170 348l20-10M170 362l20-10"/>
    </g>
    <path d="M176 282q0 6 2 9" stroke="#fffaf0" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M180 282v-8" stroke="#2b2420" stroke-width="2" stroke-linecap="round"/>
  </g>
  <g class="sc-flame-out" transform="translate(${FLAME[0]} ${FLAME[1]})"><g class="sc-flame">
    <path d="M0-16q9 10 7 18a7 7 0 0 1-14 0q-2-8 7-18z" fill="#ff9a3c"/>
    <path d="M0-8q5 6 4 11a4 4 0 0 1-8 0q-1-5 4-11z" fill="#fff4dc"/>
  </g></g>
  <path class="sc-smoke" pathLength="1" d="M180 274c-8-14 8-22 0-36s8-22 0-38" fill="none" stroke="#9aa0a6" stroke-width="3" stroke-linecap="round"/>
  <g class="sc-conf">${conf}</g>
  ${RETICLE}
</svg>`;
}

const SCENES = {
  birthday: {
    svg: birthday,
    text: (p = {}) => [t('С днём рождения, {name}!', { name: p.name ?? '' }), [p.age, p.shots].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
  },
  independence: { svg: independence, text: () => t('С Днём Независимости!\nСлава Украине!') },
  halloween: { svg: halloween, text: () => t('Счастливого Хэллоуина!') },
  snowman: { svg: snowman, text: () => t('Встречаем {year}!\nВыстоим!', { year: comingYear() }) },
  newyear: { svg: newYear, text: () => (isNewYearDay() ? t('С Новым годом!') : t('Встречаем {year}!', { year: comingYear() })) },
};

/** Програти сценку name; повертає false, якщо такої нема. */
export function playScene(name, params) {
  const s = SCENES[name];
  if (!s) return false;
  const el = document.createElement('div');
  el.className = `scene scene-${name}`;
  const stage = document.createElement('div');
  const button = (label, kind, onclick) => Object.assign(document.createElement('button'), { type: 'button', className: `btn ${kind}`, textContent: label, onclick });
  const bar = document.createElement('div');
  bar.className = 'scene-bar';
  bar.append(button(t('Повторить'), '', () => play()), button(t('Закрыть'), 'primary', () => close()));
  el.append(stage, bar);
  // скінченні анімації кадру; нескінченні (сніг, крила) лишаються жити й на останньому кадрі
  const finite = () => el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
  let run = 0;
  const end = () => {
    el.classList.add('done');
    bar.querySelector('.primary').focus({ preventScroll: true });
  };
  // Нові вузли — нові CSS-анімації: сценка йде з початку; кнопки — коли все відіграло
  const play = () => {
    const id = ++run;
    el.classList.remove('done');
    stage.innerHTML = s.svg(params);
    const cap = document.createElement('p');
    cap.className = 'scene-cap';
    // кожен рядок — окремий span, щоб сценка могла показати наступний рядок пізніше
    cap.append(...s.text(params).split('\n').map((line) => Object.assign(document.createElement('span'), { textContent: line })));
    stage.append(cap);
    Promise.all(finite().map((a) => a.finished)).then(() => id === run && end(), () => {});
  };
  // Сама не закривається: тап по сцені — одразу останній кадр, далі лише «Закрити»
  stage.addEventListener('pointerdown', () => finite().forEach((a) => a.finish()));
  const close = () => {
    if (el.classList.contains('out')) return;
    run++;
    el.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 400);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  play();
  return true;
}
