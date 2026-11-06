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

/** Фактура снігу на грудці (cx, cy, r): дрібні сірувато-сині горбки, гуще в тіні. */
function snowTex(rnd, cx, cy, r) {
  let out = '';
  for (let j = 0; j < 14; j++) {
    const a = Math.PI * (0.45 + rnd() * 1.2), d = r * (0.45 + rnd() * 0.45);
    out += `<ellipse cx="${f1(cx + Math.cos(a) * d)}" cy="${f1(cy + Math.sin(a) * d)}" rx="${f1(1.6 + rnd() * 2.4)}" ry="${f1(0.8 + rnd() * 1)}" opacity="${(0.35 + rnd() * 0.4).toFixed(2)}"/>`;
  }
  return out;
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
    <radialGradient id="sc-ball" cx=".62" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#eef3f9"/><stop offset=".8" stop-color="#b7c6dc"/><stop offset="1" stop-color="#8296b8"/></radialGradient>
    <radialGradient id="sc-carrot" cx=".3" cy=".3" r=".9"><stop offset="0" stop-color="#ffa154"/><stop offset="1" stop-color="#d0601e"/></radialGradient>
    <clipPath id="sc-vat"><path d="${VATNIK}"/></clipPath>
  </defs>
  ${night.back}
  <g fill="#141b2c">${[[34, 616], [52, 600], [64, 584], [82, 570], [94, 556], [112, 544], [122, 532], [138, 522]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${4.4 - i * 0.25}" ry="${2.6 - i * 0.14}" transform="rotate(-24 ${x} ${y})"/>`).join('')}</g>
  <ellipse cx="180" cy="500" rx="62" ry="7" fill="#0b1020" opacity=".55"/>
  <g class="sc-man">
    <circle cx="180" cy="452" r="50" fill="url(#sc-ball)"/>
    <path d="M146 416Q180 430 214 416" stroke="#8296b8" stroke-width="6" stroke-linecap="round" fill="none" opacity=".55"/>
    <g fill="#c9d5e6">${snowTex(seeded(311), 180, 452, 50)}</g>
    <ellipse cx="200" cy="428" rx="12" ry="6" fill="#fff" opacity=".55" transform="rotate(30 200 428)"/>
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
    <path d="M148 364L127 399 156 424M212 364L238 396 222 410" stroke="#3d4436" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M148 364L127 399 156 424M212 364L238 396 222 410" stroke="#4b5343" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(2 -5)" opacity=".7"/>
    <path d="M158 426L188 431M222 412L209 414M171 428l-5-9M233 406l8-6" stroke="#2e2119" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <g transform="translate(182 420) rotate(-12)">${RIFLE}</g>
    <path d="M188 431q7-1 7 5M189 433q6 1 5 7M187 429q8-4 9 1M209 414q-4-6-9-4M209 415q-3 6-8 6M210 413q2-7 7-6" stroke="#2e2119" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <circle cx="180" cy="300" r="30" fill="url(#sc-ball)"/>
    <ellipse cx="192" cy="284" rx="7" ry="4" fill="#fff" opacity=".6" transform="rotate(30 192 284)"/>
    <path d="M182 312L206 318 182 316Z" fill="#8296b8" opacity=".45"/>
    <circle class="sc-eye" cx="170" cy="296" r="2.8" fill="#1b1b1b"/><circle class="sc-eye" cx="191" cy="296" r="2.8" fill="#1b1b1b"/>
    <path class="sc-brow" d="M162 286L177 292M199 286L184 292" stroke="#1b1b1b" stroke-width="3.2" stroke-linecap="round"/>
    <g fill="#1b1b1b">${[[166, 319, 2.2, 1.7, 20], [172.5, 315, 2, 1.6, -10], [180, 313.5, 2.3, 1.8, 5], [187.5, 315, 1.9, 1.6, 15], [194, 319, 2.2, 1.7, -20]]
    .map(([x, y, rx, ry, a]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})"/><circle cx="${x + 0.6}" cy="${y - 0.6}" r=".5" fill="#5a6274"/>`).join('')}</g>
    <g class="sc-nose"><path d="M181 300L211 307 181 312Z" fill="url(#sc-carrot)"/><path d="M188 302.5l1 2.5M195 304l1 2.2M202 305.5l.8 1.8" stroke="#a8471a" stroke-width="1" stroke-linecap="round"/></g>
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
  <g class="sc-uaflag">
    <path d="M168 468V418" stroke="#6b4a32" stroke-width="2.4" stroke-linecap="round"/>
    <g class="sc-uacloth"><path d="M169 419h24v8h-24z" fill="#2f6fd0"/><path d="M169 427h24v8h-24z" fill="#ffd500"/></g>
    <ellipse cx="168" cy="468" rx="7" ry="2.2" fill="#eef3f9"/>
  </g>
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
  // зорі на все небо (і вище кадру — на високих екранах), частина мерехтить; Чумацький Шлях — густа смуга навскіс
  for (let j = 0; j < 90; j++) {
    const big = j % 9 === 0;
    stars += `<circle${big ? ' class="sc-tw"' : ''} cx="${(-30 + rnd() * 420).toFixed(0)}" cy="${(-150 + rnd() * 545).toFixed(0)}" `
      + `r="${(big ? 1.3 + rnd() * 0.6 : 0.4 + rnd() * 0.8).toFixed(1)}"${big ? ` style="animation-delay:-${(rnd() * 1.6).toFixed(2)}s"` : ''}/>`;
  }
  for (let j = 0; j < 110; j++) {
    const t = rnd(), off = (rnd() + rnd() + rnd() - 1.5) * 26;
    stars += `<circle cx="${(-30 + t * 420 + off * 0.5).toFixed(1)}" cy="${(-60 + t * 330 - off).toFixed(1)}" r="${(0.3 + rnd() * 0.5).toFixed(1)}" opacity="${(0.4 + rnd() * 0.5).toFixed(2)}"/>`;
  }
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
  // половина герба — з половиною тризуба: зійдуться — тризуб складеться цілим
  const half = (side) => `<g clip-path="url(#sc-half-${side})"><path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="5"/>`
    + `<g fill="#ffd500"><path d="${COA_MID}"/><path d="${COA_SIDE}"/><path d="${COA_SIDE}" transform="scale(-1 1)"/></g></g>`;
  const bridge = `M${BRIDGE[0][0]} ${BRIDGE[0][1]}Q${BRIDGE[1][0]} ${BRIDGE[1][1]} ${BRIDGE[2][0]} ${BRIDGE[2][1]}`;
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="sc-sob-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070f26"/><stop offset=".55" stop-color="#1b2a52"/><stop offset="1" stop-color="#4d4a72"/></linearGradient>
    <linearGradient id="sc-sob-dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d5fa8"/><stop offset=".6" stop-color="#8fb0d0"/><stop offset=".9" stop-color="#ffc98a"/><stop offset="1" stop-color="#ffb070"/></linearGradient>
    <linearGradient id="sc-sob-ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8db0"/><stop offset="1" stop-color="#a9c1da"/></linearGradient>
    <radialGradient id="sc-sob-milky"><stop offset="0" stop-color="#b8c6f0" stop-opacity=".16"/><stop offset="1" stop-color="#b8c6f0" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-sob-moon"><stop offset=".3" stop-color="#fffbe8"/><stop offset=".45" stop-color="#e8eefc" stop-opacity=".35"/><stop offset="1" stop-color="#e8eefc" stop-opacity="0"/></radialGradient>
    <clipPath id="sc-half-l"><rect x="-90" y="-10" width="90" height="250"/></clipPath>
    <clipPath id="sc-half-r"><rect x="0" y="-10" width="90" height="250"/></clipPath>
    <clipPath id="sc-above-ice"><rect x="0" y="0" width="360" height="${ICE + 1}"/></clipPath>
  </defs>
  <rect x="-400" y="-400" width="1160" height="830" fill="url(#sc-sob-night)"/>
  <rect class="sc-dawn" x="-400" y="-400" width="1160" height="830" fill="url(#sc-sob-dawn)"/>
  <g class="sc-stars" fill="#d6def0">
    <ellipse cx="180" cy="105" rx="270" ry="34" transform="rotate(38 180 105)" fill="url(#sc-sob-milky)"/>
    ${stars}
  </g>
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
    <g class="sc-half" style="--fx:-108px;--fy:-40px"><g transform="scale(.42)">${half('l')}</g></g>
    <g class="sc-half" style="--fx:108px;--fy:-40px"><g transform="scale(.42)">${half('r')}</g></g>
    <g class="sc-whole" transform="scale(.42)">
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

// ── Помічники малювання: числа з одним знаком, точка, кінцівка-трапеція (гілки дерева на Геловін) ──
const f1 = (n) => n.toFixed(1);
const pt = (p) => `${f1(p[0])} ${f1(p[1])}`;
/** Кінцівка, що звужується від w1 до w2: обрис трапецією з півколами на кінцях. */
function limb(a, b, w1, w2, col) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, r1 = w1 / 2, r2 = w2 / 2;
  const p1 = [a[0] + nx * r1, a[1] + ny * r1], p2 = [b[0] + nx * r2, b[1] + ny * r2], p3 = [b[0] - nx * r2, b[1] - ny * r2], p4 = [a[0] - nx * r1, a[1] - ny * r1];
  return `<path d="M${pt(p1)}L${pt(p2)}A${f1(r2)} ${f1(r2)} 0 0 0 ${pt(p3)}L${pt(p4)}A${f1(r1)} ${f1(r1)} 0 0 0 ${pt(p1)}Z" fill="${col}"/>`;
}

// 1.10 День захисників і захисниць: тепла кімната ввечері — батарея, чай, кіт на підвіконні, гірлянда; шибка запітніла.
// На шибці сам собою малюється пальцем сердечко — крізь нього видно холодне поле, окоп і вартового з парою з рота.
// Камера наближається до сердечка: нам тепло вдома — бо вони на варті
const HEART = 'M180 330C120 288 100 250 112 222C124 194 164 194 180 224C196 194 236 194 248 222C260 250 240 288 180 330Z';
const GLASS = [58, 110, 244, 312]; // x, y, ширина, висота скла

/** Штора з складками: від карниза (x, top) донизу до y, ширина w; side −1 — ліва (край зі збором праворуч). */
function curtain(x, w, top, y, side) {
  const edge = side < 0 ? x + w : x, out = side < 0 ? x : x + w;
  let folds = '';
  for (let i = 1; i < 4; i++) {
    const fx = x + (w * i) / 4;
    folds += `M${f1(fx)} ${top + 4}Q${f1(fx + side * 3)} ${f1((top + y) / 2)} ${f1(fx - side * 2)} ${y}`;
  }
  return `<path d="M${out} ${top}H${edge}Q${f1(edge + side * 10)} ${f1(top + (y - top) * 0.45)} ${f1(edge - side * 6)} ${f1(top + (y - top) * 0.62)}`
    + `Q${f1(edge + side * 4)} ${f1(top + (y - top) * 0.8)} ${f1(edge + side * 8)} ${y}H${out}Z" fill="#7a2c27"/>`
    + `<path d="${folds}" stroke="#5a1d1a" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`
    + `<path d="M${f1(edge - side * 2)} ${f1(top + (y - top) * 0.6)}q${side * -8} 4 ${side * -16} 2" stroke="#c9963c" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}

function defendersHome() {
  const rnd = seeded(1001);
  const [gx, gy, gw, gh] = GLASS;
  let stars = '', snow = '', bulbs = '', breath = '', drops = '', frost = '';
  for (let j = 0; j < 26; j++) stars += `<circle cx="${f1(gx + rnd() * gw)}" cy="${f1(gy + rnd() * 170)}" r="${f1(0.4 + rnd() * 0.7)}"/>`;
  // сніг надворі — лише за шибкою
  for (let j = 0; j < 22; j++) {
    snow += `<circle cx="${f1(gx + rnd() * gw)}" cy="${gy - 10}" r="${f1(0.8 + rnd() * 1.2)}" `
      + `style="animation-duration:${(5 + rnd() * 4).toFixed(1)}s;animation-delay:-${(rnd() * 8).toFixed(1)}s"/>`;
  }
  // гірлянда під карнизом: три провиси, лампочки мерехтять
  const BULB = ['#ffd56b', '#ff8a5c', '#ffb347', '#ff9ad0', '#fff1c4'];
  const sag = (t) => 104 + Math.abs(Math.sin(t * Math.PI * 3)) * 12;
  let wire = 'M58 104';
  for (let i = 1; i <= 30; i++) wire += `L${f1(58 + (244 * i) / 30)} ${f1(sag(i / 30))}`;
  for (let i = 1; i < 18; i++) {
    const t = i / 18;
    bulbs += `<circle cx="${f1(58 + 244 * t)}" cy="${f1(sag(t) + 3)}" r="2.6" fill="${BULB[i % 5]}" style="animation-delay:-${((i * 0.41) % 1.6).toFixed(2)}s"/>`;
  }
  // пара з рота вартового — клубочки здіймаються й тануть
  for (let j = 0; j < 3; j++) breath += `<circle cx="174.5" cy="283" r="${2 + j * 0.6}" style="animation-delay:${(3 + j * 0.7).toFixed(1)}s"/>`;
  // краплі стікають з нижніх країв сердечка
  for (const [x, y, l] of [[134, 296, 14], [222, 296, 11], [181, 336, 18]]) {
    drops += `<path pathLength="1" d="M${x} ${y}q1 ${l / 2} 0 ${l}"/><circle cx="${x}" cy="${y + l}" r="1.8" class="sc-dropend"/>`;
  }
  // мороз по нижніх кутках скла — гілочки
  for (const [cx, dir] of [[gx, 1], [gx + gw, -1]]) {
    for (let j = 0; j < 7; j++) {
      // гілочка під кутом b від вертикалі, всередину скла; на ній два бокові відростки
      const l = 26 + rnd() * 26, y0 = gy + gh, b = 0.25 + j * 0.2;
      const tx = cx + dir * Math.sin(b) * l, ty = y0 - Math.cos(b) * l;
      frost += `M${f1(cx)} ${y0}L${f1(tx)} ${f1(ty)}`
        + `M${f1(cx + (tx - cx) * 0.5)} ${f1(y0 + (ty - y0) * 0.5)}l${f1(dir * 6)} -4`
        + `M${f1(cx + (tx - cx) * 0.7)} ${f1(y0 + (ty - y0) * 0.7)}l${f1(-dir * 2)} -6`;
    }
  }
  return `
<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="sc-dh-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1912"/><stop offset="1" stop-color="#3f271a"/></linearGradient>
    <radialGradient id="sc-dh-lamp" cx="0" cy=".45" r=".9"><stop offset="0" stop-color="#ffb35c" stop-opacity=".34"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
    <linearGradient id="sc-dh-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081124"/><stop offset=".7" stop-color="#1c2c52"/><stop offset="1" stop-color="#3a4d78"/></linearGradient>
    <linearGradient id="sc-dh-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a6e"/><stop offset="1" stop-color="#1a2440"/></linearGradient>
    <radialGradient id="sc-dh-heat" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#ff9a4a" stop-opacity=".3"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>
    <clipPath id="sc-dh-glass"><rect x="${gx}" y="${gy}" width="${gw}" height="${gh}"/></clipPath>
    <mask id="sc-dh-mist" maskUnits="userSpaceOnUse" x="${gx}" y="${gy}" width="${gw}" height="${gh}">
      <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="#fff"/>
      <path class="sc-hfill" d="${HEART}" fill="#000"/>
      <path class="sc-hline" pathLength="1" d="${HEART}" fill="none" stroke="#000" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    </mask>
  </defs>
  <g class="sc-cam">
  <rect x="-400" y="-400" width="1160" height="1440" fill="url(#sc-dh-wall)"/>
  <g clip-path="url(#sc-dh-glass)">
    <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="url(#sc-dh-sky)"/>
    <g fill="#cfd8ee">${stars}</g>
    <path d="M268 138a9 9 0 1 0 8 13a7 7 0 1 1-8-13z" fill="#eef1ff"/>
    <path d="M${gx} 300Q110 292 150 298T240 296T${gx + gw} 300V${gy + gh}H${gx}Z" fill="url(#sc-dh-field)"/>
    <path d="M${gx} 300Q110 292 150 298T240 296T${gx + gw} 300" stroke="#5a6d96" stroke-width="1.2" fill="none"/>
    <path d="M${gx} 298l6-9 5 9 4-7 5 7 6-11 5 11 5-6 4 6M${gx + gw} 297l-6-10-5 10-5-8-4 8-6-12-5 12" fill="#0c1428"/>
    <g transform="translate(180 300) scale(1.75) translate(-180 -300)">
    <g class="sc-sentry">
      <path d="M186.5 297L193 270.5" stroke="#0b1122" stroke-width="1.5" stroke-linecap="round"/><path d="M192 274.5l2.6-1" stroke="#0b1122" stroke-width="1.2"/>
      <path d="M169.5 300v-7.5q0-6.5 9.5-7q9.5.5 9.5 7v7.5z" fill="#0f172b"/>
      <path d="M176.8 286.5v-3h4.4v3z" fill="#0f172b"/>
      <circle cx="179" cy="280.4" r="3.9" fill="#0f172b"/>
      <path d="M173.6 280.6a5.4 5.4 0 0 1 10.8 0l1.2.5v1h-13.2v-1z" fill="#1b2644"/>
      <path d="M182 276.6a5.4 5.4 0 0 1 2.4 4M186.2 288q2 1.2 2.3 4.5" stroke="#7088b8" stroke-width=".7" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M150 301q4-6 9 0q4-6 9 0q4-5 8 0M190 301q4-6 9 0q4-6 9 0q4-5 8 0" fill="#26314c"/>
    <path d="M150 297.5q4-3 9 0q4-3 9 0q4-2.5 8 0M190 297.5q4-3 9 0q4-3 9 0q4-2.5 8 0" stroke="#dfe8f6" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M214 300V276" stroke="#2a2420" stroke-width="1"/>
    <g class="sc-dflag"><path d="M214.5 276h10v3.4h-10z" fill="#2f6fd0"/><path d="M214.5 279.4h10v3.4h-10z" fill="#ffd500"/></g>
    <g class="sc-breath" fill="#dfe8f6">${breath}</g>
    </g>
    <g class="sc-snow" fill="#e8eef8">${snow}</g>
    <g mask="url(#sc-dh-mist)">
      <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="#c3ccda" opacity=".78"/>
      <path d="${frost}" stroke="#f2f6fc" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/>
    </g>
    <g class="sc-drops" stroke="#e6edf6" stroke-width="2.2" fill="#e6edf6" stroke-linecap="round" opacity=".55">${drops}</g>
  </g>
  <rect x="44" y="96" width="272" height="340" fill="none" stroke="#6b4528" stroke-width="14"/>
  <rect x="51" y="103" width="258" height="326" fill="none" stroke="#4a2e1a" stroke-width="2"/>
  <path d="M58 160H302" stroke="#6b4528" stroke-width="7"/>
  <path d="M${wire.slice(1)}" stroke="#2a1d14" stroke-width="1.2" fill="none"/>
  <g class="sc-dh-bulbs">${bulbs}</g>
  <rect x="-400" y="-400" width="760" height="1440" fill="url(#sc-dh-lamp)"/>
  <path d="M-10 72H370" stroke="#b8893c" stroke-width="4" stroke-linecap="round"/>
  ${curtain(-6, 66, 74, 480, -1)}${curtain(300, 66, 74, 480, 1)}
  <path d="M26 434H334V450H26Z" fill="#8a5a34"/><path d="M26 434H334V438H26Z" fill="#a8723f"/>
  <path d="M26 450H334" stroke="#5a3820" stroke-width="2"/>
  <ellipse cx="180" cy="500" rx="110" ry="46" fill="url(#sc-dh-heat)"/>
  <g fill="#c9c2b6">${Array.from({ length: 9 }, (_, i) => `<rect x="${92 + i * 20}" y="470" width="14" height="72" rx="6"/>`).join('')}</g>
  <g fill="#e6e0d4">${Array.from({ length: 9 }, (_, i) => `<rect x="${94 + i * 20}" y="472" width="4" height="68" rx="2"/>`).join('')}</g>
  <path d="M88 482H268M88 530H268" stroke="#a9a196" stroke-width="5" stroke-linecap="round"/>
  <path class="sc-heat" d="M120 462q-4-7 0-14t0-14M180 462q-4-7 0-14t0-14M240 462q-4-7 0-14t0-14" stroke="#ffcf95" stroke-width="1.4" fill="none" opacity=".35" stroke-linecap="round"/>
  <g>
    <rect x="80" y="414" width="22" height="22" rx="3" fill="#ece1cc"/><path d="M80 420h22v5H80z" fill="#2f6fd0"/><path d="M80 425h22v3H80z" fill="#ffd500"/>
    <path d="M102 419q8 1 7 7t-7 6" stroke="#ece1cc" stroke-width="3" fill="none"/>
    <ellipse cx="91" cy="414.5" rx="10" ry="2.2" fill="#7a4a2a"/>
    <path class="sc-steam" d="M87 410q-4-6 0-12t0-12M95 410q-4-6 0-12t0-12" stroke="#f5ead8" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>
  </g>
  <g>
    <path d="M226 434q-2-20 26-22q30 0 32 22z" fill="#2c2420"/>
    <circle cx="232" cy="422" r="10" fill="#2c2420"/>
    <path d="M224 416l1-10 6 6zM234 412l6-7 1 9z" fill="#2c2420"/>
    <path d="M226 423q3 2 6 0M235 423q3 2 6 0" stroke="#c98a4a" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M228 412q8-8 30-6q20 2 26 16" stroke="#c98a4a" stroke-width="1.4" fill="none" opacity=".6"/>
    <path class="sc-tail" d="M284 433q10-1 8 -10" stroke="#2c2420" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  </g>
</svg>`;
}

const SCENES = {
  defenders: { svg: defendersHome, text: () => t('С Днём защитников и защитниц!\nНам тепло дома — потому что вы на посту') },
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
