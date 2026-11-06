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

/** Маленький гарбуз-ліхтарик на землі: світиться вирізана пика. */
function lantern(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><circle class="sc-lglow" r="26" fill="url(#sc-glow)"/>`
    + '<ellipse cx="-6" rx="8" ry="9" fill="#b9520f"/><ellipse cx="6" rx="8" ry="9" fill="#b9520f"/><ellipse rx="8" ry="10" fill="#d8681a"/>'
    + '<path d="M-1-10q0-4 3-6l1.6 1.4q-2 1.6-2 4.6z" fill="#56722e"/>'
    + '<g class="sc-lface" fill="#ffd56b"><path d="M-8-1l3.4-4 3.4 4zM1.2-1l3.4-4 3.4 4z"/><path d="M-8 3q8 6 16 0l-1.6 3-2-1.4-2 2-2-1.6-2 1.6-2-2-2 1.4z"/></g></g>';
}

function halloween() {
  const { bits, pulp } = pumpkinBits(seeded(1031));
  // сухе покручене дерево праворуч — гілки тягнуться до місяця
  const BR = [[[322, 482], [314, 330], 17, 9], [[314, 330], [284, 250], 9, 5], [[284, 250], [262, 178], 5, 2.6], [[262, 178], [246, 148], 2.6, 1],
    [[284, 250], [302, 196], 4, 1.6], [[314, 330], [346, 262], 7, 3], [[346, 262], [356, 220], 3, 1.2], [[346, 262], [372, 248], 2.6, 1],
    [[316, 388], [290, 372], 4.4, 1.4], [[262, 178], [280, 160], 2, 0.8], [[302, 196], [318, 176], 1.6, 0.8], [[290, 372], [278, 352], 1.6, 0.8]];
  const tree = BR.map(([a, b, w1, w2]) => limb(a, b, w1, w2, '#060607')).join('');
  // туман стелиться над землею
  const fg = seeded(1032);
  let fog = '';
  for (let j = 0; j < 6; j++) {
    fog += `<ellipse cx="${(fg() * 440 - 40).toFixed(0)}" cy="${(472 + fg() * 26).toFixed(0)}" rx="${(70 + fg() * 60).toFixed(0)}" ry="${(6 + fg() * 6).toFixed(0)}" style="animation-duration:${(6 + fg() * 4).toFixed(1)}s"/>`;
  }
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="sc-moon"><stop offset="0" stop-color="#f6ecc8" stop-opacity=".45"/><stop offset="1" stop-color="#f6ecc8" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-glow"><stop offset="0" stop-color="#ffcf5a" stop-opacity=".75"/><stop offset=".6" stop-color="#ff8a1e" stop-opacity=".25"/><stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="276" cy="120" r="90" fill="url(#sc-moon)"/>
  <circle cx="276" cy="120" r="34" fill="#f1e6c2"/>
  <g fill="#e0d3a6"><circle cx="266" cy="110" r="6"/><circle cx="288" cy="130" r="4.4"/><circle cx="283" cy="105" r="2.6"/><circle cx="262" cy="132" r="2.2"/></g>
  <g fill="#cfd3dc"><circle cx="48" cy="80" r="1.3"/><circle cx="120" cy="140" r="1"/><circle cx="196" cy="60" r="1.2"/><circle cx="70" cy="210" r="1"/><circle cx="330" cy="230" r=".9"/><circle cx="160" cy="190" r=".8"/></g>
  <g class="sc-clouds" fill="#1c1d27" opacity=".85">
    <path d="M150 126q10-14 28-8 10-12 28-4 18-6 24 8 14 2 10 12H146q-8-4 4-8z"/>
    <path d="M300 152q8-10 22-6 10-9 22-2 14-3 18 7 10 2 8 9H296q-6-4 4-8z"/>
  </g>
  <path d="M-400 480Q-60 432 90 452T330 440T760 470V700H-400Z" fill="#16181d"/>
  <g>${tree}</g>
  <path d="M-2000 478H0q90-14 180-6t180-4H2360V2000H-2000z" fill="#11130f"/>
  <g stroke="#2a2420" stroke-linecap="round" fill="none">
    <path d="M10 480l-3-36M38 478l2-34M66 478l-5-30M94 476l3-27" stroke-width="4"/>
    <path d="M-4 456l102-4M-4 468l70-3M70 461l28-6" stroke-width="2.6"/>
  </g>
  <path d="M0 478l3-7M5 478l1-9M120 474l-2-8M124 474l2-10M240 470l-3-8M246 470l1-10M300 470l2-7" stroke="#20251a" stroke-width="1.6" stroke-linecap="round"/>
  ${lantern(46, 492, 0.9)}${lantern(118, 504, 0.7)}${lantern(268, 496, 0.8)}
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
  <g class="sc-hfog" fill="#c9ccd8" opacity=".09">${fog}</g>
  ${RETICLE}
</svg>`;
}

// Новий рік: з поля злітають небесні ліхтарики, розходяться по точках цифр, тепла лінія з'єднує їх у рік.
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

const isNewYearDay = (d = new Date()) => d.getMonth() === 0 && d.getDate() === 1;

/** Рік, що настає, або той, що настав сьогодні (1 січня). */
function comingYear(d = new Date()) {
  return d.getFullYear() + (isNewYearDay(d) ? 0 : 1);
}

/** Псевдовипадкові числа з зерном — сніг і зірки щоразу на тих самих місцях. */
function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Нічна ялинка-силует, основа (x, y), висота h: три яруси, сніг на гілках підсвічений місяцем справа. */
function nightFir(x, y, h, dark = '#0d1422', lit = '#33415f') {
  let out = '';
  for (let i = 0; i < 3; i++) {
    const top = y - h * (1 - i * 0.27), b = y - h * (0.38 - i * 0.18), w = h * (0.22 + i * 0.1);
    out += `<path d="M${f1(x)} ${f1(top)}L${f1(x + w)} ${f1(b)}H${f1(x - w)}Z" fill="${dark}"/>`
      + `<path d="M${f1(x)} ${f1(top)}L${f1(x + w)} ${f1(b)}L${f1(x + w * 0.45)} ${f1(b - (b - top) * 0.22)}L${f1(x + 0.6)} ${f1(top + (b - top) * 0.5)}Z" fill="${lit}"/>`;
  }
  return out;
}

/** Зимова ніч: місяць, зірки, ліс на пагорбах, засніжене поле (back) та сніг, що падає (snow). */
function winterNight(rnd) {
  let stars = '', snow = '', forest = '';
  const fr = seeded(777);
  for (let x = -24; x < 384; x += 8 + fr() * 9) forest += nightFir(x, 466 + Math.sin(x / 41) * 5, 16 + fr() * 22);
  for (let j = 0; j < 22; j++) {
    stars += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="${(rnd() * 420).toFixed(0)}" r="${(0.6 + rnd() * 0.8).toFixed(1)}"/>`;
  }
  for (let j = 0; j < 16; j++) {
    snow += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="-10" r="${(1 + rnd() * 1.4).toFixed(1)}" `
      + `style="animation-duration:${(5 + rnd() * 4).toFixed(1)}s;animation-delay:-${(rnd() * 8).toFixed(1)}s"/>`;
  }
  return {
    back: `<defs>
    <radialGradient id="sc-wn-moon"><stop offset=".25" stop-color="#eef1ff" stop-opacity=".5"/><stop offset="1" stop-color="#c9d3f0" stop-opacity="0"/></radialGradient>
    <linearGradient id="sc-wn-snow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3756"/><stop offset=".35" stop-color="#1b2338"/><stop offset="1" stop-color="#111726"/></linearGradient>
  </defs>
  <g fill="#cfd8ea">${stars}</g>
  <circle cx="292" cy="92" r="64" fill="url(#sc-wn-moon)"/>
  <circle cx="292" cy="92" r="17" fill="#eef1ff"/><circle cx="286" cy="87" r="3.2" fill="#dbe0f2"/><circle cx="297" cy="99" r="2.2" fill="#dbe0f2"/><circle cx="296" cy="84" r="1.6" fill="#dbe0f2"/>
  <path d="M-400 474Q-80 446 70 458T310 450T760 462V700H-400Z" fill="#121a2a"/>
  <g>${forest}</g>
  <path d="M-400 490Q-40 472 116 484T362 478T760 488V700H-400Z" fill="#1a2338"/>
  <path d="M-400 490Q-40 472 116 484T362 478T760 488" fill="none" stroke="#33415f" stroke-width="1.5"/>
  <path d="M-2000 500H0q90-12 180-4t180-6H2360V2000H-2000z" fill="url(#sc-wn-snow)"/>
  <path d="M-2000 500H0q90-12 180-4t180-6H2360" fill="none" stroke="#4a5a80" stroke-width="1.5"/>
  <path d="M-20 560q60-10 120-2M230 590q60-8 150 2M40 620q90-8 170 0" fill="none" stroke="#2b3756" stroke-width="2" stroke-linecap="round"/>`,
    snow: `<g class="sc-snow" fill="#e8eef8">${snow}</g>`,
  };
}

/** Точки вздовж штриха цифри з кроком step (у її клітинці 36×60) — для ліхтариків. Рахує браузер, тимчасовим svg. */
function digitPoints(d, step) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
  path.setAttribute('d', d);
  svg.append(path);
  document.body.append(svg);
  const len = path.getTotalLength(), n = Math.max(5, Math.round(len / step)), pts = [];
  for (let i = 0; i <= n; i++) {
    const q = path.getPointAtLength((len * i) / n);
    pts.push([q.x, q.y]);
  }
  svg.remove();
  // замкнений штрих (0, 8) не дублює першу точку в останній
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < step / 2) pts.pop();
  return pts;
}

// Теплі кольори паперу ліхтариків: верх, середина, низ (підсвічений вогником)
const LAN_PAPER = [['#e2572a', '#ff9a3c', '#ffe08a'], ['#b8262e', '#ef4d3c', '#ffb27a'], ['#d98a1c', '#ffc23d', '#fff0a8'],
  ['#c93a5c', '#ff6f7d', '#ffc6a8'], ['#c4502a', '#ffb066', '#fff1c8']];

/** Небесний ліхтарик кольору c (з LAN_PAPER): паперовий купол, світло зсередини, вогник знизу; (0, 0) — середина. */
function skyLantern(s = 1, c = 0) {
  return `<g transform="scale(${s})"><circle r="7" fill="url(#sc-lan-halo)"/>`
    + `<path d="M-2.4-4Q0-5 2.4-4L3.6 3H-3.6Z" fill="url(#sc-lan-p${c})"/>`
    + '<path d="M-3.6 3H3.6" stroke="#7a3a12" stroke-width=".6"/><ellipse cy="3.9" rx="1.3" ry=".8" fill="#fff6d0"/></g>';
}

function newYear() {
  const digits = [...String(comingYear())].map(Number);
  const cell = 50, k = 1.25, y0 = 130;
  const x0 = 180 - (k * (cell * (digits.length - 1) + 36)) / 2;
  const night = winterNight(seeded(2027));
  const lr = seeded(1231);
  let ink = '', lans = '';
  digits.forEach((dg, i) => {
    const d = DIGITS[dg];
    ink += `<g style="--d:${(3 + i * 0.18).toFixed(2)}s" transform="translate(${i * cell} 0)">`
      + `<path class="sc-glow" pathLength="1" d="${d}"/><path class="sc-ink" pathLength="1" d="${d}"/></g>`;
    // ліхтарики злітають з поля (зграйкою з-під цифри) і повільно сходяться у свої точки
    digitPoints(d, 12).forEach(([px, py], j) => {
      const x = x0 + k * (i * cell + px), y = y0 + k * py;
      const fx = 180 + (x - 180) * 0.35 + (lr() - 0.5) * 70 - x, fy = 505 + lr() * 40 - y;
      lans += `<g transform="translate(${f1(x)} ${f1(y)})"><g class="sc-lan" style="--fx:${f1(fx)}px;--fy:${f1(fy)}px;`
        + `animation-delay:${(0.2 + i * 0.12 + lr() * 0.6).toFixed(2)}s;animation-duration:${(2.2 + lr() * 0.5).toFixed(2)}s">`
        + `<g class="sc-lbob" style="animation-delay:-${(lr() * 3).toFixed(2)}s">${skyLantern(1.4 + lr() * 0.3, (j + i * 2) % LAN_PAPER.length)}</g></g></g>`;
    });
  });
  // два великі ліхтарики ближче до глядача — пропливають знизу вгору, поки висить фінальний кадр
  const near = [[292, 2.8, 1.2, 16, 1], [118, 2.2, 4.6, 19, 3]].map(([x, sc, dl, dur, c]) => `<g transform="translate(${x} 0)">`
    + `<g class="sc-lan-near" style="animation-delay:${dl}s;animation-duration:${dur}s">${skyLantern(sc, c)}</g></g>`).join('');
  // святкова ялинка: яруси зі снігом, гірлянда вогників, що мерехтять, зірка
  const BULB = ['#ffd56b', '#ff7a5c', '#7bc8ff', '#7bd88f', '#ff9ad0'];
  let tree = '', bulbs = '';
  for (let i = 0; i < 5; i++) {
    const top = 362 + i * 24, b = 404 + i * 22, w = 16 + i * 9;
    tree += `<path d="M70 ${top}L${70 + w} ${b}Q70 ${b + 6} ${70 - w} ${b}Z" fill="${i % 2 ? '#1d4a3c' : '#225644'}"/>`
      + `<path d="M70 ${top}L${70 + w} ${b}Q${70 + w * 0.5} ${b + 2} ${70 + w * 0.2} ${b - 4}Z" fill="#cfdcea" opacity=".85"/>`;
    for (let k = 0; k < 3 + i; k++) {
      const t = (k + 0.5) / (3 + i), bx = 70 - w * 0.85 + t * w * 1.7, by = b - 3 + Math.sin(t * Math.PI) * 4;
      bulbs += `<circle cx="${f1(bx)}" cy="${f1(by)}" r="2.3" fill="${BULB[(i + k) % 5]}" style="animation-delay:-${((i * 3 + k) * 0.37 % 1.6).toFixed(2)}s"/>`;
    }
  }
  // салюти фоном: розквітають по черзі, коли рік уже склався, і повторюються
  let fw = '';
  [[64, 290, 4.4, '#ff9a3c'], [298, 318, 5.2, '#9fd3ff'], [300, 238, 6, '#ffd56b'], [60, 236, 6.7, '#ff7aa8']].forEach(([x, y, d, col]) => {
    let rays = '';
    for (let j = 0; j < 14; j++) {
      const a = (j / 14) * 2 * Math.PI;
      rays += `M${f1(Math.cos(a) * 8)} ${f1(Math.sin(a) * 8)}L${f1(Math.cos(a) * 26)} ${f1(Math.sin(a) * 26)}`;
    }
    fw += `<g transform="translate(${x} ${y})"><g class="sc-fw" style="animation-delay:${d}s"><path d="${rays}" stroke="${col}" stroke-width="2" stroke-linecap="round"/><circle r="2.6" fill="#fff4dc"/></g></g>`;
  });
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="sc-lan-halo"><stop offset="0" stop-color="#ffc768" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>
    ${LAN_PAPER.map(([a, b, c], i) => `<linearGradient id="sc-lan-p${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`).join('')}
  </defs>
  ${night.back}
  <g class="sc-fws">${fw}</g>
  <rect x="68" y="482" width="5" height="20" fill="#3a2a1c"/>
  <g>${tree}</g>
  <g class="sc-ny-bulbs">${bulbs}</g>
  <path class="sc-ny-star" d="${star(70, 360, 8, 3.4)}" fill="#ffd56b"/>
  <g class="sc-year" transform="translate(${x0.toFixed(1)} ${y0}) scale(${k})" fill="none" stroke-linecap="round" stroke-linejoin="round">${ink}</g>
  <g class="sc-lans">${lans}</g>
  ${night.snow}
  ${near}
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
  <g fill="#141b2c">${[[34, 616], [52, 600], [64, 584], [82, 570], [94, 556], [112, 544], [122, 532], [138, 522]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${4.4 - i * 0.25}" ry="${2.6 - i * 0.14}" transform="rotate(-24 ${x} ${y})"/>`).join('')}</g>
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
const HZ = 320, KREMLIN = 2.3, KX = 180;
const kremlinAt = (x, y) => [KX + (x - 74) * KREMLIN, HZ + 3 + (y - 482) * KREMLIN];
const FLY = 1.6; // скільки летить ракета, с
const STRIKE = { at: [72, 428], from: [190, -270], go: 4.25 - FLY }; // ціль у координатах кремля, звідки летить, старт; влучання — 4,25 с

/** Цибулястий купол з хрестом на барабані: центр основи (x, y), ширина w. */
function onion(x, y, w, fill = '#c79a35') {
  const r = w / 2;
  return `<rect x="${x - r * 0.62}" y="${y}" width="${r * 1.24}" height="${w * 0.7}" fill="#d9cfb8"/>`
    + `<path d="M${x - r} ${y}C${x - r} ${y - w * 0.55} ${x - r * 0.2} ${y - w * 0.7} ${x} ${y - w * 1.25}C${x + r * 0.2} ${y - w * 0.7} ${x + r} ${y - w * 0.55} ${x + r} ${y}Z" fill="${fill}"/>`
    + `<path d="M${x} ${y - w * 1.25}v-${w * 0.55}M${x - r * 0.4} ${y - w * 1.55}h${r * 0.8}" stroke="${fill}" stroke-width="${Math.max(0.6, w * 0.09)}"/>`;
}

/** Вежа з зеленим шатром і рубіновою зіркою: x — центр, top — верх зрубу, w — ширина, tent — висота шатра. */
function tower(x, top, w, tent) {
  return `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${482 - top}" fill="#7a2e26"/>`
    + `<rect x="${x - w / 2}" y="${top}" width="${w * 0.28}" height="${482 - top}" fill="#5e211c"/>`
    + `<path d="M${x - w / 2 - 1} ${top}h${w + 2}v-3h-${w + 2}Z" fill="#d9cfb8"/>`
    + `<path d="M${x - w / 2} ${top - 3}L${x} ${top - 3 - tent}L${x + w / 2} ${top - 3}Z" fill="#2f5d4a"/>`
    + `<path d="M${x} ${top - 3 - tent}L${x - w / 2} ${top - 3}H${x - w / 4}Z" fill="#244a3b"/>`
    + `<path d="${star(x, top - 6 - tent, w * 0.26, w * 0.11)}" fill="#d23a2a"/>`;
}

/**
 * Московський Кремль у координатах сцени (земля y = 482, x 14…134): стіна з «ластівчиними хвостами», Спаська вежа
 * з годинником і шатром (сюди влучає ракета), кутові вежі. Церков нема — так попросив користувач.
 */
function kremlin() {
  let teeth = '';
  for (let x = 14; x < 134; x += 6) teeth += `M${x} 462v-7l2 3.2 2-3.2v7z`;
  return `
      <rect x="14" y="462" width="120" height="20" fill="#7a2e26"/>
      <path d="${teeth}" fill="#7a2e26"/>
      <path d="M14 470h120M14 476h120" stroke="#5e211c" stroke-width=".8" opacity=".7"/>
      ${tower(22, 450, 11, 18)}${tower(118, 446, 10, 20)}${tower(132, 456, 8, 12)}
      <rect x="62" y="440" width="20" height="42" fill="#7a2e26"/><rect x="62" y="440" width="5" height="42" fill="#5e211c"/>
      <path d="M68 482v-8a4 4 0 0 1 8 0v8z" fill="#2a1416"/>
      <path d="M61 440h22v-3H61z" fill="#d9cfb8"/>
      <rect x="64" y="422" width="16" height="15" fill="#7a2e26"/><rect x="64" y="422" width="4" height="15" fill="#5e211c"/>
      <circle cx="72" cy="429.5" r="5" fill="#efe6cc" stroke="#c79a35" stroke-width="1.2"/>
      <path d="M72 429.5v-3.6M72 429.5l2.6 1.4" stroke="#2a1416" stroke-width=".9" stroke-linecap="round"/>
      <path d="M63 422h18v-2.5H63z" fill="#d9cfb8"/>
      <path d="M63.5 419.5v-5l1 -2 1 2v5zM78.5 419.5v-5l1-2 1 2v5z" fill="#d9cfb8"/>
      <rect x="66.5" y="410" width="11" height="9.5" fill="#d9cfb8"/>
      <path d="M69 419.5v-5a1.5 1.5 0 0 1 3 0v5zM73 419.5v-5a1.5 1.5 0 0 1 3 0v5z" fill="#7a2e26"/>
      <path d="M66.5 410L72 380 77.5 410Z" fill="#2f5d4a"/><path d="M72 380L66.5 410H69.5Z" fill="#244a3b"/>
      <path d="M72 380v-4" stroke="#c79a35" stroke-width="1"/>
      <path d="${star(72, 372.5, 4.4, 1.9)}" fill="#d23a2a" stroke="#ffd27a" stroke-width=".5"/>`;
}

// Блискавки над Кремлем: шлях у координатах кремля і коли спалахує (до удару ракети о 4,25 с)
const BOLTS = [
  ['M30 356l-6 18 7 2-9 20 6 1-6 26', 0.9],
  ['M112 356l5 16-7 3 9 18-6 2 7 24', 1.9],
  ['M150 354l-4 20 6 2-8 24 5 2-6 66', 2.8],
  ['M54 356l4 18-6 3 7 20-5 2 4 28', 3.6],
];

/** Гроза над Кремлем у його координатах: важка хмара, дощ, блискавки — разом з ним наближається, вибух її розганяє. */
function storm(rnd) {
  let puffs = '', tops = '', rain = '';
  for (let x = -40; x <= 190; x += 13) {
    const cy = 344 + (rnd() - 0.5) * 10, r = 13 + rnd() * 10;
    puffs += `<circle cx="${x}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/>`;
    tops += `<circle cx="${x + 3}" cy="${(cy - r * 0.35).toFixed(1)}" r="${(r * 0.7).toFixed(1)}"/>`;
  }
  for (let j = 0; j < 46; j++) {
    const x = -30 + rnd() * 200, y = 356 + rnd() * 120;
    rain += `M${x.toFixed(1)} ${y.toFixed(1)}l-2 7`;
  }
  const bolts = BOLTS.map(([d, at]) => `<g class="sc-bolt" style="animation-delay:${at}s">`
    + `<path d="${d}" stroke="#a9a3ff" stroke-width="3.2" opacity=".5"/><path d="${d}" stroke="#fffbea" stroke-width="1.1"/></g>`).join('');
  const glows = BOLTS.map(([d, at]) => `<ellipse class="sc-bolt" cx="${d.match(/M(-?[\d.]+)/)[1]}" cy="352" rx="34" ry="14" fill="#b8b2ff" style="animation-delay:${at}s"/>`).join('');
  return `<g class="sc-storm">
      <path class="sc-rain" d="${rain}" stroke="#8d97b8" stroke-width=".7" stroke-linecap="round" opacity=".55"/>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">${bolts}</g>
      <ellipse cx="75" cy="356" rx="125" ry="12" fill="#16151f"/>
      <g fill="#25243a">${puffs}</g><g fill="#38364f">${tops}</g>
      <g opacity=".5">${glows}</g>
    </g>`;
}

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
  let wheat = '';
  for (let j = 0; j < 150; j++) {
    const x = rnd() * 1160 - 400, y = HZ + 4 + rnd() * 310, l = 6 + rnd() * 10;
    wheat += `M${x.toFixed(0)} ${y.toFixed(0)}l${(rnd() * 4 - 2).toFixed(1)} -${l.toFixed(0)}`;
  }
  const { at, from, go } = STRIKE;
  const [hx, hy] = kremlinAt(...at);
  const ang = (Math.atan2(-from[1], -from[0]) * 180) / Math.PI;
  const [mx] = kremlinAt(at[0], 482);
  const smoke = `M${(hx + from[0]).toFixed(1)} ${(hy + from[1]).toFixed(1)}L${(hx - 6).toFixed(1)} ${(hy - 10).toFixed(1)}`;
  // уламки й іскри з точки влучання (у координатах кремля)
  let debris = '';
  for (let j = 0; j < 22; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.8, r = 30 + rnd() * 60;
    const dx = (Math.cos(a) * r).toFixed(1), dy = (Math.sin(a) * r).toFixed(1), d = (4.25 + rnd() * 0.08).toFixed(2);
    debris += j % 3
      ? `<circle cx="${at[0]}" cy="${at[1]}" r="${(0.8 + rnd() * 1.2).toFixed(1)}" fill="#ffd56b" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${d}s"/>`
      : `<rect x="${at[0] - 1.5}" y="${at[1] - 1}" width="3" height="2" fill="#7a2e22" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${d}s"/>`;
  }
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
  <circle class="sc-sun" cx="300" cy="${HZ + 18}" r="80" fill="url(#sc-sun)"/>
  <rect class="sc-night" x="-2000" y="-2000" width="4360" height="${2000 + HZ}" fill="#071230"/>
  ${BOLTS.map(([, at]) => `<rect class="sc-skyflash" x="-2000" y="-2000" width="4360" height="${2000 + HZ}" fill="#c9c6ff" style="animation-delay:${at}s"/>`).join('')}
  <g class="sc-kzoom" style="transform-origin:${KX}px ${HZ + 3}px"><g transform="translate(${KX} ${HZ + 3}) scale(${KREMLIN}) translate(-74 -482)">
    <ellipse class="sc-kglow" cx="74" cy="470" rx="120" ry="44" fill="url(#sc-fireglow)"/>
    <g class="sc-kremlin">${kremlin()}</g>
    ${storm(seeded(2408))}
    <circle class="sc-boom" cx="${at[0]}" cy="${at[1]}" r="40" fill="url(#sc-boom)"/>
    <circle class="sc-shock" cx="${at[0]}" cy="${at[1]}" r="20" fill="none" stroke="#fff4dc" stroke-width="2"/>
    <g class="sc-debris">${debris}</g>
  </g></g>
  <g transform="translate(${mx.toFixed(1)} ${HZ}) scale(1.15)"><g class="sc-mush">${mushroom()}</g></g>
  <g class="sc-smoke" fill="none" stroke-linecap="round">
    <path pathLength="1" d="${smoke}" stroke="#8f97ad" stroke-width="10" opacity=".22"/>
    <path pathLength="1" d="${smoke}" stroke="#c3c8d6" stroke-width="3.5" opacity=".5"/>
  </g>
  <g transform="translate(${hx.toFixed(1)} ${hy.toFixed(1)})"><g class="sc-bm" style="--fx:${from[0]}px;--fy:${from[1]}px;animation-delay:${go}s">
    <g transform="rotate(${ang.toFixed(1)}) scale(1.35)">
      <path d="M-90-1.6H-30V1.6H-90Z" fill="url(#sc-trail)"/>
      <ellipse cx="-36" cy="0" rx="9" ry="5" fill="#ffb347" opacity=".45"/>
      <path class="sc-exh" d="M-30-2.6L-44 0-30 2.6Z" fill="#fff1b8"/>
      <path d="M-29-3.2L-36-10H-31L-23-3.2ZM-29 3.2L-36 10H-31L-23 3.2Z" fill="#7d8790"/>
      <path d="M-30-3.2H-6V3.2H-30Z" fill="#e3e7ea"/><path d="M-30 0H-6V3.2H-30Z" fill="#b8c0c7"/>
      <path d="M-6-3.2Q2-2.6 7 0Q2 2.6-6 3.2Z" fill="#9aa3ab"/>
      <path d="M-15-3.2h2.4v6.4h-2.4z" fill="#005bbb"/><path d="M-12.6-3.2h2.4v6.4h-2.4z" fill="#ffd500"/>
      <path d="M-3-3L-6-6.5H-8L-7-3ZM-3 3L-6 6.5H-8L-7 3Z" fill="#7d8790"/>
      <path d="M-28 0H-7" stroke="#8a939b" stroke-width=".5"/>
    </g>
  </g></g>
  <path d="M-2000 ${HZ}H0q90-8 180-2t180-4H2360V2000H-2000z" fill="url(#sc-field)"/>
  <path d="${wheat}" stroke="#f3cf62" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
  <rect class="sc-night" x="-2000" y="${HZ - 10}" width="4360" height="2000" fill="#0a0f1c" style="--o:.6"/>
  <g class="sc-shield"><g transform="translate(180 ${HZ + 28}) scale(.56)">
    <path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="2.5"/>
    <g class="sc-coa" fill="#ffd500"><path d="${COA_MID}"/><path d="${COA_SIDE}"/><path d="${COA_SIDE}" transform="scale(-1 1)"/></g>
  </g></g>
  ${FLASH}
</svg>`;
}

// 22.01 День Соборності: зимова ніч над Дніпром — праворуч на пагорбі Софія з дзвіницею, на лівому березі місто;
// кол «руського миру» колить кригу — постріл, кол іде під лід, тріщини затягуються; на мосту запалюються ліхтарі,
// живий ланцюг сходиться посередині, дві половини щита над берегами змикаються, тризуб, світанок
const BRIDGE = [[132, 410], [196, 356], [266, 404]]; // квадратична крива настилу мосту
const onBridge = (t) => BRIDGE.reduce((acc, [x, y], i) => {
  const k = [(1 - t) ** 2, 2 * t * (1 - t), t ** 2][i];
  return [acc[0] + k * x, acc[1] + k * y];
}, [0, 0]);
const ICE = 474; // де на кризі стоїть кол
const SCARF = ['#2f6fd0', '#ffd500'];

/** Засніжена ялинка: основа (x, y), висота h. */
function fir(x, y, h) {
  const w = h * 0.5;
  let out = `<rect x="${x - 1}" y="${y - h * 0.12}" width="2" height="${h * 0.12}" fill="#2a2420"/>`;
  for (let i = 0; i < 3; i++) {
    const top = y - h * (0.42 + i * 0.29), bw = w * (1 - i * 0.26), by = y - h * (0.1 + i * 0.28);
    out += `<path d="M${x} ${top.toFixed(1)}L${(x + bw / 2).toFixed(1)} ${by.toFixed(1)}H${(x - bw / 2).toFixed(1)}Z" fill="#2a5a50"/>`
      + `<path d="M${x} ${top.toFixed(1)}L${(x + bw * 0.22).toFixed(1)} ${(top + h * 0.12).toFixed(1)}Q${x} ${(top + h * 0.08).toFixed(1)} ${(x - bw * 0.22).toFixed(1)} ${(top + h * 0.12).toFixed(1)}Z" fill="#dfe8f2"/>`;
  }
  return out;
}

/** Людина живого ланцюга: голова, пальто, ноги, шарф синій чи жовтий. */
function person(x, y, i) {
  return `<circle cx="${x.toFixed(1)}" cy="${(y - 17).toFixed(1)}" r="2.8" fill="#e9d2b8"/>`
    + `<path d="M${(x - 2.6).toFixed(1)} ${(y - 14.6).toFixed(1)}h5.2v1.6h-5.2z" fill="#151c2e"/>`
    + `<path d="M${(x - 3.2).toFixed(1)} ${(y - 13).toFixed(1)}h6.4l1.3 9h-9z" fill="#26304a"/>`
    + `<path d="M${(x - 3.2).toFixed(1)} ${(y - 13.2).toFixed(1)}h6.4v2h-6.4z" fill="${SCARF[i % 2]}"/>`
    + `<path d="M${(x - 1.8).toFixed(1)} ${(y - 4).toFixed(1)}v4M${(x + 1.8).toFixed(1)} ${(y - 4).toFixed(1)}v4" stroke="#151c2e" stroke-width="1.8" stroke-linecap="round"/>`;
}

function sobornist() {
  const rnd = seeded(2201);
  let stars = '', snow = '', drops = '', cracks = '', people = '', hands = '', windows = '', blocks = '', lamps = '', firs = '';
  for (let j = 0; j < 34; j++) stars += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="${(rnd() * 280).toFixed(0)}" r="${(0.5 + rnd() * 0.9).toFixed(1)}"/>`;
  for (let j = 0; j < 22; j++) {
    snow += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="-10" r="${(1 + rnd() * 1.4).toFixed(1)}" `
      + `style="animation-duration:${(5 + rnd() * 4).toFixed(1)}s;animation-delay:-${(rnd() * 8).toFixed(1)}s"/>`;
  }
  for (let j = 0; j < 16; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6, r = 22 + rnd() * 34;
    drops += `<circle cx="196" cy="${ICE}" r="${(1.2 + rnd()).toFixed(1)}" style="--dx:${(Math.cos(a) * r).toFixed(1)}px;`
      + `--dy:${(Math.sin(a) * r).toFixed(1)}px;animation-delay:${(1.5 + rnd() * 0.1).toFixed(2)}s"/>`;
  }
  for (const dir of [-1, 1]) {
    for (const dy of [-6, 5]) {
      let d = `M196 ${ICE}`, x = 196, y = ICE;
      for (let s = 0; s < 6; s++) { x += dir * (10 + rnd() * 8); y += dy * 0.45 + (rnd() - 0.5) * 6; d += `L${x.toFixed(1)} ${y.toFixed(1)}`; }
      cracks += `<path pathLength="1" d="${d}"/>`;
    }
  }
  // лівий берег Дніпра — багатоповерхівки з вікнами, що світяться
  for (let x = 262; x < 400; x += 14 + Math.floor(rnd() * 8)) {
    const h = 26 + rnd() * 46, w = 10 + rnd() * 5;
    blocks += `<rect x="${x}" y="${(404 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#141c30"/>`;
    for (let wy = 404 - h + 4; wy < 398; wy += 6) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (rnd() < 0.42) windows += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="1.8" height="2.4"/>`;
      }
    }
  }
  // ялинки на схилі правого берега
  for (const [x, y, h] of [[100, 324, 26], [114, 342, 22], [127, 364, 19], [139, 384, 16], [151, 402, 14], [92, 318, 18]]) firs += fir(x, y, h);
  // ліхтарі на мосту — запалюються від берегів до середини
  for (let i = 1; i < 10; i++) {
    const t = i / 10, [x, y] = onBridge(t), go = (2.65 + (0.5 - Math.abs(t - 0.5)) * 1.0).toFixed(2);
    lamps += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}v-9" stroke="#2a3550" stroke-width="1.4"/>`
      + `<circle class="sc-lamp" cx="${x.toFixed(1)}" cy="${(y - 10).toFixed(1)}" r="2.2" style="animation-delay:${go}s"/>`;
  }
  // живий ланцюг: з обох берегів назустріч; руки — лінія до сусіда ближче до середини
  const N = 7;
  for (const side of [0, 1]) {
    for (let i = 0; i < N; i++) {
      const t = side ? 0.94 - i * 0.066 : 0.06 + i * 0.066;
      const [x, y] = onBridge(t);
      const [nx, ny] = onBridge(i === N - 1 ? 0.5 : side ? t - 0.066 : t + 0.066);
      const go = (2.8 + i * 0.1).toFixed(2);
      people += `<g class="sc-man" style="animation-delay:${go}s">${person(x, y, i + side)}</g>`;
      hands += `<path d="M${x.toFixed(1)} ${(y - 10).toFixed(1)}L${nx.toFixed(1)} ${(ny - 10).toFixed(1)}" style="animation-delay:${(+go + 0.08).toFixed(2)}s"/>`;
    }
  }
  const half = (side) => `<g clip-path="url(#sc-half-${side})"><path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="5"/></g>`;
  const bridge = `M${BRIDGE[0][0]} ${BRIDGE[0][1]}Q${BRIDGE[1][0]} ${BRIDGE[1][1]} ${BRIDGE[2][0]} ${BRIDGE[2][1]}`;
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="sc-sob-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070f26"/><stop offset=".55" stop-color="#1b2a52"/><stop offset="1" stop-color="#4d4a72"/></linearGradient>
    <linearGradient id="sc-sob-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d5fa8"/><stop offset=".6" stop-color="#8fb0d0"/><stop offset=".9" stop-color="#ffc98a"/><stop offset="1" stop-color="#ffb070"/></linearGradient>
    <linearGradient id="sc-sob-ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8db0"/><stop offset="1" stop-color="#a9c1da"/></linearGradient>
    <radialGradient id="sc-sob-moon"><stop offset=".3" stop-color="#fffbe8"/><stop offset=".45" stop-color="#e8eefc" stop-opacity=".35"/><stop offset="1" stop-color="#e8eefc" stop-opacity="0"/></radialGradient>
    <clipPath id="sc-half-l"><rect x="-90" y="-10" width="90" height="250"/></clipPath>
    <clipPath id="sc-half-r"><rect x="0" y="-10" width="90" height="250"/></clipPath>
    <clipPath id="sc-above-ice"><rect x="0" y="0" width="360" height="${ICE + 1}"/></clipPath>
  </defs>
  <rect x="-400" y="-400" width="1160" height="830" fill="url(#sc-sob-night)"/>
  <rect class="sc-dawn" x="-400" y="-400" width="1160" height="830" fill="url(#sc-sob-dawn)"/>
  <g class="sc-stars" fill="#d6def0">${stars}</g>
  <circle class="sc-moon" cx="300" cy="84" r="44" fill="url(#sc-sob-moon)"/>
  <rect x="-400" y="404" width="1160" height="110" fill="url(#sc-sob-ice)"/>
  <path class="sc-moonpath" d="M282 410h36M276 424h48M286 440h30M280 458h40" stroke="#e8eefc" stroke-width="2.5" stroke-linecap="round" opacity=".35"/>
  <path d="M-40 452q40-6 80 0t70 2M120 492q50-6 100 0M232 448q40-5 90 1" stroke="#dfe8f2" stroke-width="3" stroke-linecap="round" opacity=".45" fill="none"/>
  <g class="sc-city">${blocks}<g class="sc-windows" fill="#ffd27a">${windows}</g></g>
  <path d="M236 418Q252 402 284 400H760V420H236Z" fill="#1a2338"/>
  <path d="M236 418Q252 402 284 400H760" fill="none" stroke="#dfe8f2" stroke-width="2.5" opacity=".75"/>
  <g class="sc-sophia">
    <rect x="2" y="268" width="50" height="40" fill="#ebe6d8"/><rect x="2" y="268" width="11" height="40" fill="#cbc4b2"/>
    <path d="M18 300v-12a3 3 0 0 1 6 0v12zM30 300v-12a3 3 0 0 1 6 0v12zM42 300v-9a2.5 2.5 0 0 1 5 0v9z" fill="#3a4766"/>
    <path d="M0 268h54l-4-5H4z" fill="#3f7a5c"/>
    ${onion(27, 254, 13)}${onion(9, 262, 6, '#3f7a5c')}${onion(45, 262, 6, '#3f7a5c')}${onion(17, 258, 5, '#3f7a5c')}${onion(37, 258, 5, '#3f7a5c')}
    <rect x="70" y="250" width="16" height="72" fill="#8fb4d6"/><rect x="70" y="250" width="4" height="72" fill="#6f95b9"/>
    <path d="M69 268h18M69 282h18" stroke="#ebe6d8" stroke-width="2"/>
    <rect x="72.5" y="236" width="11" height="14" fill="#8fb4d6"/><path d="M75 250v-8a3 3 0 0 1 6 0v8z" fill="#3a4766"/>
    <rect x="74.5" y="226" width="7" height="10" fill="#ebe6d8"/>
    ${onion(78, 226, 9)}
  </g>
  <path d="M-400 640V300H40Q96 300 120 350Q140 396 166 418Q178 430 198 436V446H-400Z" fill="#1a2338"/>
  <path d="M-400 300H40Q96 300 120 350Q140 396 166 418Q178 430 198 436" fill="none" stroke="#e4ecf6" stroke-width="3" opacity=".85"/>
  ${firs}
  <g class="sc-cracks" fill="none" stroke="#2f4f78" stroke-width="1.6" stroke-linecap="round">${cracks}</g>
  <ellipse class="sc-hole" cx="196" cy="${ICE}" rx="16" ry="4.5" fill="#0a1220"/>
  <g class="sc-bridge">
    <path d="M150 ${ICE - 54}Q198 384 250 ${ICE - 56}" fill="none" stroke="#1f2942" stroke-width="5"/>
    <path d="M168 ${ICE - 54}V378M198 ${ICE - 54}V368M228 ${ICE - 56}V378" stroke="#1f2942" stroke-width="2.5"/>
    <path d="${bridge}" fill="none" stroke="#1f2942" stroke-width="6" stroke-linecap="round"/>
    <path d="${bridge}" fill="none" stroke="#3a4a6e" stroke-width="1.5" transform="translate(0 -3)"/>
    <g fill="#ffd56b">${lamps}</g>
  </g>
  <g class="sc-hands" stroke="#ffd56b" stroke-width="1.6" stroke-linecap="round">${hands}</g>
  <g class="sc-people">${people}</g>
  <g clip-path="url(#sc-above-ice)"><g class="sc-stake">
    <rect x="193" y="420" width="6" height="${ICE - 420 + 2}" fill="#6b4a32"/><path d="M193 ${ICE + 2}l3 4 3-4z" fill="#6b4a32"/>
    <path d="M194 426v36" stroke="#8a5a2e" stroke-width="1.2" opacity=".6"/>
    <g class="sc-rag"><rect x="199" y="422" width="26" height="5" fill="#e6e2d8"/><rect x="199" y="427" width="26" height="5" fill="#2b4d9a"/><rect x="199" y="432" width="26" height="5" fill="#b8322a"/></g>
  </g></g>
  <g class="sc-splash" fill="#cfe2f5">${drops}</g>
  <path d="M-400 514Q-100 500 60 512T360 508T760 512V1040H-400Z" fill="#141c2e"/>
  <path d="M-400 514Q-100 500 60 512T360 508T760 512" fill="none" stroke="#dfe8f2" stroke-width="2" opacity=".45"/>
  <path d="M14 520l-4-26M22 520l2-30M30 520l-6-20M330 516l4-24M340 516l-2-30M348 516l6-18" stroke="#2c3550" stroke-width="2" stroke-linecap="round"/>
  <g class="sc-grow" style="transform-origin:180px 224px"><g transform="translate(180 190)">
    <g class="sc-half" style="--fx:-116px;--fy:-12px"><g transform="scale(.3)">${half('l')}</g></g>
    <g class="sc-half" style="--fx:120px;--fy:58px"><g transform="scale(.3)">${half('r')}</g></g>
    <g class="sc-whole" transform="scale(.3)">
      <path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="5"/>
      <g fill="#ffd500"><path d="${COA_MID}"/><path d="${COA_SIDE}"/><path d="${COA_SIDE}" transform="scale(-1 1)"/></g>
    </g>
    <circle class="sc-click" cx="0" cy="34" r="12" fill="#fff4dc"/>
  </g></g>
  <g class="sc-snow" fill="#e8eef8">${snow}</g>
  ${RETICLE}
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

// ── Риг людини: поза задається точками кистей і стоп, лікті й коліна — дволанкова IK; ріст 100, стопи в (0, 0) ──
const f1 = (n) => n.toFixed(1);
const pt = (p) => `${f1(p[0])} ${f1(p[1])}`;
const rotP = ([x, y], [cx, cy], deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const toward = (a, b, l) => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + ((b[0] - a[0]) * l) / d, a[1] + ((b[1] - a[1]) * l) / d];
};
const seg = (a, b, w, col) => `<path d="M${pt(a)}L${pt(b)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
/** Кінцівка, що звужується від w1 до w2: обрис трапецією з півколами на кінцях. */
function limb(a, b, w1, w2, col) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, r1 = w1 / 2, r2 = w2 / 2;
  const p1 = [a[0] + nx * r1, a[1] + ny * r1], p2 = [b[0] + nx * r2, b[1] + ny * r2], p3 = [b[0] - nx * r2, b[1] - ny * r2], p4 = [a[0] - nx * r1, a[1] - ny * r1];
  return `<path d="M${pt(p1)}L${pt(p2)}A${f1(r2)} ${f1(r2)} 0 0 0 ${pt(p3)}L${pt(p4)}A${f1(r1)} ${f1(r1)} 0 0 0 ${pt(p1)}Z" fill="${col}"/>`;
}

/** Суглоб між a і ціллю b для ланок l1, l2; bend +1 — згин ліворуч від напрямку a→b (для руки, що звисає, — назовні вліво). */
function ik(a, b, l1, l2, bend) {
  const d = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), l1 + l2 - 0.01);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + bend * Math.acos(Math.max(-1, Math.min(1, c)));
  return [a[0] + l1 * Math.cos(ang), a[1] + l1 * Math.sin(ang)];
}

/** Шолом навколо центру голови: high-cut з навушниками й кріпленням ПНБ (наші) або повний (o.full); o.back — вигляд ззаду. */
function helmet(c, o = {}) {
  if (o.full) {
    return `<path d="M-8.7 3.2C-9.8-8.8-4.9-11 0-11C4.9-11 9.8-8.8 8.7 3.2L6.9 3.6L6.5-1.8H-6.5L-6.9 3.6Z" fill="${c.helm}"/>${o.mark ?? ''}`;
  }
  const dome = o.back
    ? `<path d="M-7.9 1.6C-8.6-8.4-4.7-10.7 0-10.7C4.7-10.7 8.6-8.4 7.9 1.6Z" fill="${c.helm}"/>`
      + `<rect x="-3.6" y="-6.4" width="7.2" height="4.6" rx="1" fill="${c.gear}"/><rect x="-2.6" y="-9.6" width="5.2" height="2.4" rx=".6" fill="${c.patch ?? c.gear}"/>`
    : `<path d="M-7.9-.4C-8.5-8.5-4.7-10.7 0-10.7C4.7-10.7 8.5-8.5 7.9-.4L6.6 0L6.2-2.3H-6.2L-6.6 0Z" fill="${c.helm}"/>`;
  return `${dome}<rect x="-9.5" y="-2.8" width="3.7" height="6.6" rx="1.7" fill="${c.gear}"/><rect x="5.8" y="-2.8" width="3.7" height="6.6" rx="1.7" fill="${c.gear}"/>`
    + `<rect x="-2.6" y="-12.4" width="5.2" height="2.9" rx=".8" fill="${c.gear}"/>`;
}

/**
 * Людина з пози p: feet — стопи, arms — [{side 0|1, hand, el?, bend?, cls?, thumb?, point?}], lean/tilt — нахил тулуба/голови,
 * drop — присід, f — жіноча статура, back — вигляд ззаду, c — кольори (за замовчуванням силует DEF_INK).
 * Повертає { svg, j } — j із суглобами, щоб домалювати спорядження.
 */
function figure(p) {
  const f = !!p.f;
  const c = { cloth: DEF_INK, skin: DEF_INK, helm: DEF_INK, gear: DEF_INK, glove: DEF_INK, hair: DEF_INK, boot: DEF_INK, ...p.c };
  const drop = p.drop ?? 0, lean = p.lean ?? 0, pelvis = [0, -50 + drop];
  const U = (x, y) => rotP([x, y + drop], pelvis, lean);
  const sw = f ? 9.6 : 11.6, ww = f ? 6.4 : 8, hw = f ? 8.8 : 9.4;
  const sh = [U(-sw + 2.2, -78.6), U(sw - 2.2, -78.6)];
  const neck = U(0, -84);
  const head = rotP(U(0, -91), neck, p.tilt ?? 0);
  const j = { sh, head, U, hrot: lean + (p.tilt ?? 0) };
  const quad = (x, y, w, h, fill) => `<path d="M${pt(U(x, y))}L${pt(U(x + w, y))}L${pt(U(x + w, y + h))}L${pt(U(x, y + h))}Z" fill="${fill}"/>`;
  let legs = '';
  if (!p.noLegs) {
    const feet = p.feet ?? [[-7, -2.5], [7, -2.5]], kb = p.kb ?? [1, -1];
    [-1, 1].forEach((s, i) => {
      const hip = [s * (f ? 4.6 : 5), -48 + drop];
      const k = ik(hip, feet[i], 24, 23, kb[i]), a = toward(k, feet[i], 23);
      legs += limb(hip, k, f ? 10.4 : 11.4, f ? 7 : 7.8, c.cloth) + limb(k, a, f ? 7 : 7.8, f ? 5 : 5.6, c.cloth)
        + `<circle cx="${f1(k[0])}" cy="${f1(k[1])}" r="${f ? 3.5 : 4.1}" fill="${c.gear}"/>`
        + `<path d="M${pt([a[0] - 3.4, a[1] - 1.2])}h6.8l${f1(0.6 + s * 1.4)} 4.4h-9.6z" fill="${c.boot}"/>`;
    });
  }
  const torso = `<path d="M${pt(U(-sw, -75.5))}Q${pt(U(-sw + 0.3, -81))} ${pt(U(-sw + 5, -81.6))}L${pt(U(sw - 5, -81.6))}`
    + `Q${pt(U(sw - 0.3, -81))} ${pt(U(sw, -75.5))}L${pt(U(ww, -58))}L${pt(U(hw, -45))}L${pt(U(-hw, -45))}L${pt(U(-ww, -58))}Z" fill="${c.cloth}"/>`;
  const plate = p.noPlate ? '' : quad(-sw + 1.4, -79.8, 2 * sw - 2.8, 21, c.gear)
    + quad(-sw - 0.8, -68, 2.6, 7, c.gear) + quad(sw - 1.8, -68, 2.6, 7, c.gear) + quad(-ww - 0.6, -58.6, 2 * ww + 1.2, 3.4, c.gear)
    + (p.back && c.molle ? [-76, -72, -68, -64].map((y) => `<path d="M${pt(U(-sw + 3.4, y))}L${pt(U(sw - 3.4, y))}" stroke="${c.molle}" stroke-width="1.1"/>`).join('') : '');
  const arms = (p.arms ?? []).map((a) => {
    const s0 = sh[a.side], e = a.el ?? ik(s0, a.hand, 17, 15, a.bend ?? (a.side ? -1 : 1));
    const h = a.el ? a.hand : toward(e, a.hand, 15);
    const lw = p.lw ?? 1;
    let s = limb(s0, e, (f ? 7 : 8) * lw, (f ? 5.6 : 6.2) * lw, c.cloth) + limb(e, h, (f ? 5.6 : 6.2) * lw, (f ? 4.2 : 4.6) * lw, c.cloth) + (a.noHand ? '' : `<circle cx="${f1(h[0])}" cy="${f1(h[1])}" r="${f ? 2.6 : 3}" fill="${c.glove}"/>`);
    if (a.point) s += seg(h, toward(h, a.point, 4.6), 2, c.glove);
    // середній палець: кулак тильним боком до нас, палець угору
    if (a.fuck) {
      s += `<g transform="translate(${pt(h)})"><rect x="-3.6" y="-1.4" width="7.2" height="6.4" rx="2.4" fill="${c.glove}"/>`
        + '<circle cx="-2.7" cy="-1.5" r="1.15"/><circle cx="-1.6" cy="-1.9" r="1.1"/><circle cx="1.6" cy="-1.9" r="1.1"/><circle cx="2.7" cy="-1.5" r="1.1"/>'.replace(/\/>/g, ` fill="${c.glove}"/>`)
        + `<rect x="-1.1" y="-10.4" width="2.2" height="10" rx="1.1" fill="${c.glove}"/><path d="M-3.2 1.4h6.4M-3.2 3.2h6.4" stroke="#000" stroke-opacity=".3" stroke-width=".5"/></g>`;
    }
    if (a.thumb) s += seg([h[0] + 0.8, h[1] - 1.4], [h[0] + 1.1, h[1] - 5.4], 2, c.glove);
    if (p.patch && !a.noPatch) {
      const m = toward(s0, e, 4.4), deg = (Math.atan2(e[1] - s0[1], e[0] - s0[0]) * 180) / Math.PI - 90;
      s += `<g transform="translate(${pt(m)}) rotate(${f1(deg)})"><rect x="-2.3" y="-1.6" width="4.6" height="1.6" fill="#2f6fd0"/><rect x="-2.3" y="0" width="4.6" height="1.6" fill="#ffd500"/></g>`;
    }
    return a.cls ? `<g class="${a.cls}">${s}</g>` : s;
  }).join('');
  // коса: спереду — через плече назовні, ззаду — по спині
  let braid = '';
  if (p.braid) {
    const from = p.braid === 'back' ? rotP([head[0], head[1] + 5], head, j.hrot) : rotP([head[0] + p.braid * 5.4, head[1] + 2.6], head, j.hrot);
    const to = p.braid === 'back' ? U(0.5, -61) : U(p.braid * (sw + 2.4), -64);
    const mid = p.braid === 'back' ? U(-1.5, -72) : U(p.braid * (sw + 3), -78);
    for (let k = 0; k <= 7; k++) {
      const t = k / 7, q = [(1 - t) ** 2 * from[0] + 2 * t * (1 - t) * mid[0] + t * t * to[0], (1 - t) ** 2 * from[1] + 2 * t * (1 - t) * mid[1] + t * t * to[1]];
      braid += `<ellipse cx="${f1(q[0])}" cy="${f1(q[1])}" rx="${f1(2.5 - t * 0.6)}" ry="${f1(1.9 - t * 0.4)}" transform="rotate(${k % 2 ? 28 : -28} ${pt(q)})" `
        + `fill="${c.hair}"${c.hairLine ? ` stroke="${c.hairLine}" stroke-width=".5"` : ''}/>`;
    }
    if (c.tie) braid += `<rect x="${f1(to[0] - 1.6)}" y="${f1(to[1] + 1.2)}" width="3.2" height="1.3" fill="#2f6fd0"/><rect x="${f1(to[0] - 1.6)}" y="${f1(to[1] + 2.5)}" width="3.2" height="1.3" fill="#ffd500"/>`;
  }
  const face = p.back || !c.eyes ? '' : `<circle cx="-2.3" cy=".6" r=".8" fill="${c.eyes}"/><circle cx="2.3" cy=".6" r=".8" fill="${c.eyes}"/>`;
  const headSvg = seg(U(0, -80), neck, 5.6, c.skin)
    + `<g transform="translate(${pt(head)}) rotate(${f1(j.hrot)})"><circle r="6.3" fill="${c.skin}"/>${face}${p.noHelmet ? '' : helmet(c, { back: p.back, full: p.fullHelmet, mark: p.mark })}${p.helmExtra ?? ''}</g>`;
  const headG = p.headCls ? `<g class="${p.headCls}">${headSvg}</g>` : headSvg;
  const body = p.back
    ? legs + arms + torso + plate + (p.braid === 'back' ? headG + braid : headG)
    : legs + torso + plate + headG + braid + arms;
  return { svg: (p.behind?.(j) ?? '') + body + (p.gear?.(j) ?? ''), j };
}

/** Автомат: rear — кисть на пістолетній рукоятці, front — на цівці; o.scope — приціл, o.len — ствол. */
function gun(rear, front, col, o = {}) {
  const L = Math.hypot(front[0] - rear[0], front[1] - rear[1]);
  const ux = (front[0] - rear[0]) / L, uy = (front[1] - rear[1]) / L;
  const [nx, ny] = ux >= 0 ? [uy, -ux] : [-uy, ux]; // нормаль догори
  const at = (t, n = 0) => [rear[0] + ux * t + nx * n, rear[1] + uy * t + ny * n];
  const bl = o.len ?? 11;
  return seg(at(-13, -1), at(-2, 0.6), 4.4, col) + seg(at(-2, 0.6), at(L + 4, 0.6), 3.4, col) + seg(at(L + 4, 0.6), at(L + 4 + bl, 0.6), 1.6, col)
    + seg(at(L + 3 + bl, 0.6), at(L + 5.5 + bl, 0.6), 2.6, col) + seg(at(3, -1), at(6, -7.6), 3, col)
    + (o.scope ? seg(at(-1, 3.6), at(6.5, 3.6), 3.4, col) + seg(at(2, 1.6), at(2, 3), 1.2, col) : seg(at(1, 2.4), at(5, 2.4), 1.8, col));
}

// 1.10 День захисників і захисниць: передсвітанковий окоп — снайпер і корректувальниця з косою працюють у парі,
// постріл по окупанту з Z на касці; камера відʼїжджає — на гребені на тлі сходу сонця постають захисники й захисниці
const DEF_FOE = [222, 346]; // голова окупанта за кущем
const DEF_INK = '#151a22';

/** Захисники силуетами на гребені: 2 + прапороносець + 2, кожен у своїй позі. */
function defenders() {
  // природні пози: опорна нога пряма (кісточка на 47 від стегна), друга розслаблена коліном досередини, стопи на ширині стегон
  const crew = [
    // піхотинець: автомат «напоготові» стволом донизу через стегно
    [36, 482, 1.06, 4.6, {
      feet: [[-9, -1], [8, -1.8]], kb: [1, 1], lean: -1.5, patch: true,
      arms: [{ side: 0, hand: [-8, -54], bend: 1 }, { side: 1, hand: [7, -62], bend: -1 }],
      gear: () => gun([7, -62], [-8, -54], DEF_INK, { scope: true, len: 14 }),
    }],
    // медикиня: рюкзак, коса через плече, рука на лямці, сумка з хрестом
    [102, 478, 1.02, 5, {
      f: true, feet: [[-7.5, -1.8], [8, -1]], kb: [-1, -1], lean: -2, braid: -1, patch: true,
      arms: [{ side: 0, hand: [-5, -73], bend: 1, noPatch: true }, { side: 1, hand: [13, -50], bend: -1 }],
      behind: (j) => `<path d="M${pt(j.U(-9, -89))}h18v28h-18z" fill="${DEF_INK}"/>`,
      gear: () => '<path d="M11.5 -50.5v3"/><rect x="8" y="-48" width="13" height="10.5" rx="2.2"/><path d="M14.5 -46v6.4M11.3 -42.8h6.4" stroke="#e8463a" stroke-width="2.2"/>',
    }],
    // прапороносець: древко біля правого боку, рука на рівні плеча, друга вільно
    [180, 474, 1.16, 5.5, {
      feet: [[-9, -1], [9, -1.6]], kb: [1, 1], patch: true,
      arms: [{ side: 0, hand: [-12, -50], bend: 1 }, { side: 1, hand: [14, -88], bend: 1, noPatch: true }],
      behind: () => seg([14, 2], [14, -172], 2.6, DEF_INK),
      gear: () => '<g class="sc-unfurl"><g class="sc-wave"><path d="M14-172q15-5 31 0t31 0v20q-15-5-31 0t-31 0z" fill="#005bbb"/>'
        + '<path d="M14-152q15-5 31 0t31 0v20q-15-5-31 0t-31 0z" fill="#ffd500"/></g></g>',
    }],
    // оператор дрона: зігнутою рукою підкидає квадрокоптер, пульт у другій руці
    [258, 478, 1.04, 5.2, {
      feet: [[-8.5, -1.8], [8.5, -1]], kb: [-1, -1], lean: 2, patch: true,
      arms: [{ side: 0, hand: [-16, -56], bend: 1 }, { side: 1, hand: [17, -106], bend: 1 }],
      gear: () => `<rect x="-26" y="-61" width="10" height="7" rx="1.8"/>${seg([-25, -61], [-27, -69], 1.2, DEF_INK)}${seg([-17, -61], [-15, -69], 1.2, DEF_INK)}`
        + `<g class="sc-drone"><g transform="translate(18 -114)">${seg([-11, 0], [11, 0], 1.8, DEF_INK)}<ellipse rx="4.6" ry="2.6"/>`
        + '<ellipse cx="-11" cy="-2.4" rx="6.4" ry="1.2"/><ellipse cx="11" cy="-2.4" rx="6.4" ry="1.2"/><path d="M-3 2.4l-1.6 3M3 2.4l1.6 3" stroke="#151a22" stroke-width="1"/>'
        + '<circle cx="-11" cy=".4" r="1.1" fill="#ff3b30"/><circle cx="11" cy=".4" r="1.1" fill="#34c759"/></g></g>',
    }],
    // мінометник: крок до міномета, двома руками тримає міну над стволом — хвостовиком донизу
    [330, 482, 1.06, 4.8, {
      feet: [[-12, -1], [8, -1.6]], kb: [1, 1], lean: -12, patch: true,
      arms: [{ side: 0, hand: [-35, -74], bend: -1 }, { side: 1, hand: [-28, -76], bend: 1, noPatch: true }],
      behind: () => '<path d="M-31 .5h18v-3.4h-18z"/>' + limb([-22, -1], [-31, -60], 8, 6.4, DEF_INK) + seg([-30.6, -58.5], [-31.4, -62.5], 9.4, DEF_INK)
        + seg([-27, -33], [-15, 0], 2.2, DEF_INK) + seg([-27, -33], [-39, 0], 2.2, DEF_INK) + seg([-20, -14], [-35, -14], 1.4, DEF_INK),
      gear: () => '<path d="M-31.5-84q3.7 2.4 3.7 7.8v5h-7.4v-5q0-5.4 3.7-7.8z"/><path d="M-32.5-71.2h2v5h-2z"/><path d="M-34.5-66.2h6l-1.2-3h-3.6z"/>',
    }],
  ];
  return crew.map(([x, y, s, go, pose]) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="sc-def" style="animation-delay:${go}s">${figure(pose).svg}</g></g>`).join('');
}

/** Пара в окопі зі спини, кольором: снайпер у маскхалаті (голова до приклада) і корректувальниця з біноклем і косою. */
function trenchPair(rnd) {
  const UA = { cloth: 'url(#sc-mc)', skin: '#3d4832', helm: 'url(#sc-mc)', gear: '#5b5440', glove: '#2c2e24', molle: '#48422f', patch: '#7d8b62' };
  // гвинтівка снайпера: від щоки до цілі, лежить на бруствері
  const cheek = [150, 590], dir = toward(cheek, [DEF_FOE[0], DEF_FOE[1]], 1), along = (t, n = 0) => [cheek[0] + (dir[0] - cheek[0]) * t - (dir[1] - cheek[1]) * n, cheek[1] + (dir[1] - cheek[1]) * t + (dir[0] - cheek[0]) * n];
  const rifle = limb(along(0), along(40), 9, 4.4, '#1d1f1a') + limb(along(40), along(54), 2.6, 2, '#1d1f1a') + seg(along(53), along(57), 3.4, '#1d1f1a')
    + seg(along(36), [along(36)[0] - 8, along(36)[1] + 12], 2, '#1d1f1a') + seg(along(36), [along(36)[0] + 6, along(36)[1] + 12], 2, '#1d1f1a')
    + limb(along(4, 8), along(26, 7), 11, 7, '#121410') + seg(along(10, 3), along(10, 6), 3.4, '#121410') + seg(along(20, 3), along(20, 6), 3.4, '#121410')
    + `<circle cx="${f1(along(4, 8)[0])}" cy="${f1(along(4, 8)[1])}" r="4.4" fill="#2a3a4a" stroke="#0d0e0b" stroke-width="1.6"/>`
    + `<circle cx="${f1(along(4, 8)[0] - 1.2)}" cy="${f1(along(4, 8)[1] - 1.2)}" r="1.2" fill="#8fb4d6" opacity=".6"/>`;
  // маскхалат-накидка: плечі з рваним краєм, жмути джуту на шоломі
  const GH = ['#66704b', '#3b4530', '#7a7552', '#4a5638'];
  const cape = (j) => {
    let d = `M${pt(j.U(-19, -63))}Q${pt(j.U(-19.5, -82))} ${pt(j.U(-8, -84.5))}L${pt(j.U(8, -84.5))}Q${pt(j.U(19.5, -82))} ${pt(j.U(19, -63))}`;
    for (let x = 19; x > -19; x -= 1.4) d += `L${pt(j.U(x - 0.7, -63 + 2.5 + rnd() * 3.5))}L${pt(j.U(x - 1.4, -63 - rnd()))}`;
    let tufts = '';
    for (let k = 0; k < 110; k++) {
      const x = -18.5 + rnd() * 37, y = -83 + ((x / 18.5) ** 2) * 11 + rnd() * 17, w = 0.6 + rnd() * 0.8;
      tufts += `<path d="M${pt(j.U(x - w, y))}L${pt(j.U(x + w, y))}L${pt(j.U(x + (rnd() - 0.5) * 2, y + 2.4 + rnd() * 2.8))}Z" fill="${GH[k % 4]}"/>`;
    }
    return `<path d="${d}Z" fill="#4f5b3c"/>${tufts}`;
  };
  let helmTufts = '';
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * (1.05 + rnd() * 0.9), r = 4 + rnd() * 5.6, x = Math.cos(a) * r, y = Math.sin(a) * r * 1.05 - 1.5, w = 0.9 + rnd() * 0.8;
    helmTufts += `<path d="M${f1(x - w)} ${f1(y)}h${f1(2 * w)}l${f1(-w + (rnd() - 0.5))} ${f1(1.8 + rnd() * 1.6)}z" fill="${GH[k % 4]}"/>`;
  }
  const sniper = figure({
    back: true, noLegs: true, tilt: 10, lean: 3, lw: 0.85, c: UA, helmExtra: helmTufts,
    arms: [{ side: 0, el: [-21, -64], hand: [-10, -77] }, { side: 1, el: [23, -83], hand: [18, -86], noPatch: true, noHand: true }],
    headCls: 'sc-nod', gear: cape,
  });
  const spotter = figure({
    back: true, noLegs: true, f: true, braid: 'back', lw: 0.85, c: { ...UA, hair: '#a87a42', hairLine: '#7a5530', tie: true },
    patch: true,
    arms: [{ side: 0, el: [-20, -87], hand: [-7.5, -93] }, { side: 1, el: [20, -87], hand: [7.5, -93], cls: 'sc-bino' },
      { side: 1, el: [22, -94], hand: [16, -112], cls: 'sc-middle', fuck: true, noPatch: true },
      { side: 1, el: [22, -90], hand: [19, -106], cls: 'sc-thumb', thumb: true, noPatch: true }],
    behind: () => '<g class="sc-bino"><rect x="-11.6" y="-96" width="4.6" height="6.4" rx="1.4" fill="#1d2019"/><rect x="7" y="-96" width="4.6" height="6.4" rx="1.4" fill="#1d2019"/></g>',
  });
  return `${rifle}
    <g class="sc-sniper"><g transform="translate(112 864) scale(3.2)">${sniper.svg}</g></g>
    <g class="sc-spotter"><g transform="translate(278 866) scale(3)">${spotter.svg}</g></g>`;
}

function defendersDay() {
  const rnd = seeded(110);
  let stars = '', trees = '', fog = '', bags = '';
  for (let j = 0; j < 22; j++) stars += `<circle cx="${(rnd() * 360).toFixed(0)}" cy="${(rnd() * 240).toFixed(0)}" r="${(0.5 + rnd() * 0.8).toFixed(1)}"/>`;
  // лісосмуга: дальній туманний обрис + ближній ряд тополь і крон зі стовбурами; на світанку верхівки підсвічує сонце
  const tr = seeded(1101), TREE = ['#5d5a2a', '#6b5426', '#4f5528', '#7a6428', '#56482a', '#8a6f2c'];
  let far = 'M-40 338';
  for (let x = -40; x <= 410; x += 7) far += `Q${x + 3.5} ${(312 - tr() * 12).toFixed(0)} ${x + 7} ${(318 - tr() * 6).toFixed(0)}`;
  far += 'V342H-40Z';
  for (let x = -30; x < 400; x += 13 + tr() * 12) {
    const col = TREE[Math.floor(tr() * TREE.length)], base = 339;
    trees += `<path d="M${f1(x)} ${base}v-${(9 + tr() * 4).toFixed(0)}" stroke="#2e2618" stroke-width="1.6"/>`;
    if (tr() < 0.35) {
      const h = 34 + tr() * 18, w = 5 + tr() * 2.5, cy = base - 8 - h / 2;
      trees += `<ellipse cx="${f1(x)}" cy="${f1(cy)}" rx="${f1(w)}" ry="${f1(h / 2)}" fill="${col}"/>`;
          } else {
      const r = 8 + tr() * 6, top = base - 10 - r;
      for (let k = 0; k < 4; k++) {
        trees += `<circle cx="${f1(x + (k - 1.5) * r * 0.55)}" cy="${f1(top + (k % 2 ? -r * 0.35 : r * 0.15) + tr() * 3)}" r="${f1(r * (0.6 + tr() * 0.25))}" fill="${col}"/>`;
      }
    }
  }
  for (let j = 0; j < 7; j++) {
    fog += `<ellipse cx="${(rnd() * 420 - 30).toFixed(0)}" cy="${(350 + rnd() * 24).toFixed(0)}" rx="${(60 + rnd() * 50).toFixed(0)}" ry="${(7 + rnd() * 6).toFixed(0)}" `
      + `style="animation-duration:${(5 + rnd() * 4).toFixed(1)}s"/>`;
  }
  for (let r = 0; r < 4; r++) {
    for (let x = -40 + (r % 2) * 31; x < 400; x += 62) {
      bags += `<rect x="${x}" y="${552 + r * 24}" width="60" height="26" rx="12"/><path d="M${x + 9} ${565 + r * 24}h42"/>`;
    }
  }
  // окупант визирає з-за куща: поясний план, каска з Z злітає окремо
  const RU = { cloth: '#5d6140', skin: '#b89474', helm: '#4a5236', gear: '#41462f', glove: '#3a3d2c', eyes: '#2a1f18' };
  const S = 1.9, base = [DEF_FOE[0], DEF_FOE[1] + 91 * S];
  const foe = figure({ noLegs: true, noHelmet: true, c: RU, lean: -4,
    arms: [{ side: 0, hand: [-14, -70], bend: 1 }, { side: 1, hand: [4, -62], bend: -1 }],
    gear: () => gun([4, -62], [-14, -70], '#222', { len: 9 }) });
  const zmark = '<path d="M-3.2-8.4h6.4l-6.4 5.6h6.4" fill="none" stroke="#f1f1f1" stroke-width="1.5" stroke-linejoin="round"/>';
  const head = foe.j.head;
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="sc-def-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081028"/><stop offset=".7" stop-color="#1f2c52"/><stop offset="1" stop-color="#4a4466"/></linearGradient>
    <linearGradient id="sc-def-dawn" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="480"><stop offset="0" stop-color="#2d5fa8"/><stop offset=".55" stop-color="#8fb0d0"/><stop offset=".85" stop-color="#ffbf73"/><stop offset="1" stop-color="#ffd98a"/></linearGradient>
    <radialGradient id="sc-def-sun"><stop offset=".3" stop-color="#fff3c4"/><stop offset=".45" stop-color="#ffd166" stop-opacity=".85"/><stop offset="1" stop-color="#ff9f40" stop-opacity="0"/></radialGradient>
    <linearGradient id="sc-def-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7963e"/><stop offset="1" stop-color="#6e5524"/></linearGradient>
    <pattern id="sc-mc" patternUnits="userSpaceOnUse" width="16" height="16"><rect width="16" height="16" fill="#55583f"/>
      <path d="M2 3q3-2 5 0t-1 4q-3 1-4-1z" fill="#6f6b4c"/><path d="M9 9q4-1 5 2t-3 3q-3-1-2-5z" fill="#3f4a32"/><path d="M11 1q2 0 3 2-1 2-3 1z" fill="#4b3f2e"/>
      <path d="M1 11q2-1 3 1t-2 3q-2 0-1-4z" fill="#7a7456"/><path d="M6 12q1-1 2 0-1 1-2 0z" fill="#4b3f2e"/><path d="M12 5q2 0 2 2t-2 0z" fill="#7a7456"/></pattern>
    <radialGradient id="sc-def-flare"><stop offset="0" stop-color="#fff6d0" stop-opacity=".9"/><stop offset=".25" stop-color="#ffe7a0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>
    <clipPath id="sc-def-bush"><rect x="0" y="0" width="360" height="${DEF_FOE[1] + 46}"/></clipPath>
  </defs>
  <rect x="-400" y="-400" width="1160" height="1040" fill="url(#sc-def-night)"/>
  <rect class="sc-dawn" x="-400" y="-400" width="1160" height="1040" fill="url(#sc-def-dawn)"/>
  <g class="sc-stars" fill="#d6def0">${stars}</g>
  <g class="sc-flare"><circle r="70" fill="url(#sc-def-flare)"/><path d="M0-4q-4-16 2-34t-2-30" fill="none" stroke="#aab2c6" stroke-width="1.6" opacity=".3"/><circle class="sc-flare-core" r="2.8" fill="#fffbe8"/></g>
  <rect x="-400" y="334" width="1160" height="400" fill="url(#sc-def-field)"/>
  <path d="${far}" fill="#4d5444" opacity=".85"/>
  <g>${trees}</g>
  <rect x="-400" y="330" width="1160" height="10" fill="#3a3420" opacity=".55"/>
  <rect class="sc-night" x="-400" y="300" width="1160" height="400" fill="#0a0f1c" style="--o:.55"/>
  <circle class="sc-sun" cx="180" cy="452" r="130" fill="url(#sc-def-sun)"/>
  <g class="sc-fog" fill="#dfe6f2" opacity=".3">${fog}</g>
  <g class="sc-bushes">
    <g clip-path="url(#sc-def-bush)"><g class="sc-foe"><g transform="translate(${pt(base)}) scale(${S})">${foe.svg}</g></g></g>
    <g class="sc-bush" fill="#2f3a22"><circle cx="${DEF_FOE[0] - 24}" cy="${DEF_FOE[1] + 40}" r="15"/><circle cx="${DEF_FOE[0]}" cy="${DEF_FOE[1] + 34}" r="17"/>
      <circle cx="${DEF_FOE[0] + 24}" cy="${DEF_FOE[1] + 40}" r="15"/><circle cx="${DEF_FOE[0] - 12}" cy="${DEF_FOE[1] + 50}" r="16"/><circle cx="${DEF_FOE[0] + 12}" cy="${DEF_FOE[1] + 50}" r="16"/></g>
  </g>
  <g transform="translate(${pt(base)}) scale(${S})"><g transform="translate(${pt(head)})"><g class="sc-zhelm">${helmet(RU, { full: true, mark: zmark })}</g></g></g>
  <g class="sc-ridge">
    <g class="sc-crew" fill="${DEF_INK}">${defenders()}</g>
    <path d="M-400 640V478Q-100 470 60 474Q180 462 300 474Q420 482 760 476V1040H-400Z" fill="#12151c"/>
  </g>
  <g class="sc-close">
    <g fill="#4d4230" stroke="#3a3124" stroke-width="1.2">${bags}</g>
    ${trenchPair(rnd)}
  </g>
  <g class="sc-shield"><g transform="translate(180 96) scale(.48)">
    <path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="5"/>
    <g class="sc-coa" fill="#ffd500"><path d="${COA_MID}"/><path d="${COA_SIDE}"/><path d="${COA_SIDE}" transform="scale(-1 1)"/></g>
  </g></g>
  ${RETICLE}
</svg>`;
}

const SCENES = {
  defenders: { svg: defendersDay, text: () => t('С Днём защитников и защитниц!\nСпасибо за каждый рассвет') },
  sobornist: { svg: sobornist, text: () => t('С Днём Соборности!\nВместе — несокрушимы') },
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
