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

// Люди живого ланцюга — різні: шапка з помпоном, берет і довге волосся, капюшон, дитина, червона хустка
const COATS = ['#26304a', '#3d2f48', '#2f4038', '#4a3328', '#2b3d57', '#45384a'];
const SKIN = ['#ecd2b8', '#e2bf9c', '#f0d9c4', '#d9b08e'];
const HATS = ['#c8343c', '#2f6fd0', '#e8b23a', '#3d8a5a', '#e6e2d8'];

/** Людина живого ланцюга, стопи в (x, y): вигляд за номером n — щоб сусіди відрізнялися. */
function person(x, y, n) {
  const kind = (n * 7 + 3) % 5, kid = kind === 3, coat = COATS[n % COATS.length], skin = SKIN[(n * 3) % SKIN.length];
  const hat = HATS[(n * 2 + 1) % HATS.length], scarf = SCARF[n % 2];
  const back = kind === 1 ? '<path d="M-3.4-18.5q-.6 6 .4 8.5h6q1-2.5.4-8.5z" fill="#6b4226"/>'
    : kind === 2 ? `<circle cx="0" cy="-16.9" r="3.9" fill="${coat}"/>` : '';
  const top = kind === 0 || kind === 3 ? `<path d="M-3-17.4a3 3 0 0 1 6 0z" fill="${hat}"/><path d="M-3.1-17.6h6.2v1.1h-6.2z" fill="#f2efe6" opacity=".85"/><circle cx="0" cy="-20.8" r="1.2" fill="#f2efe6"/>`
    : kind === 1 ? `<ellipse cx=".6" cy="-19.4" rx="3.4" ry="1.3" fill="${hat}"/>`
      : kind === 4 ? '<path d="M-3.4-16.2Q0-22.6 3.4-16.2L2.7-13.8H-2.7Z" fill="#c8343c"/><circle cx="-1.2" cy="-17.8" r=".45" fill="#f2efe6"/><circle cx="1.3" cy="-18.4" r=".45" fill="#f2efe6"/><circle cx=".2" cy="-15.6" r=".45" fill="#f2efe6"/>'
        : '';
  const coatPath = kind === 1 || kind === 4 ? 'M-3.2-13h6.4l2 11h-10.4z' : 'M-3.2-13h6.4l1.3 9h-9z';
  const legsY = kind === 1 || kind === 4 ? -2 : -4;
  return `<g transform="translate(${f1(x)} ${f1(y)})${kid ? ' scale(.76)' : ''}">${back}`
    + `<path d="M-1.8 ${legsY}V-.6M1.8 ${legsY}V-.6" stroke="#151c2e" stroke-width="1.8" stroke-linecap="round"/>`
    + '<path d="M-3-.8h2.6v1.3h-2.6zM.6-.8h2.6v1.3h-2.6z" fill="#0d1220"/>'
    + `<path d="${coatPath}" fill="${coat}"/><path d="M0-12.6v${kind === 1 || kind === 4 ? 10 : 8}" stroke="#000" stroke-opacity=".25" stroke-width=".6"/>`
    + `<circle cx="0" cy="-16.8" r="${kind === 2 ? 2.5 : 2.8}" fill="${skin}"/><circle cx="1.6" cy="-16" r=".7" fill="#e58a8a" opacity=".6"/>`
    + `<path d="M-3.2-13.2h6.4v2h-6.4z" fill="${scarf}"/><path d="M1.2-11.4l.9 3.2h1.2l-.6-3.2z" fill="${scarf}"/>`
    + `${top}</g>`;
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
  for (let j = 0; j < 34; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 3, r = 26 + rnd() * 70;
    drops += `<circle cx="196" cy="${ICE}" r="${(1.2 + rnd()).toFixed(1)}" style="--dx:${(Math.cos(a) * r).toFixed(1)}px;`
      + `--dy:${(Math.sin(a) * r).toFixed(1)}px;animation-delay:${(1.5 + rnd() * 0.1).toFixed(2)}s"/>`;
  }
  for (const dir of [-1, 1]) {
    for (const dy of [-7, -2, 3, 8]) {
      let d = `M196 ${ICE}`, x = 196, y = ICE;
      for (let s = 0; s < 14; s++) {
        x += dir * (11 + rnd() * 10); y += dy * 0.5 + (rnd() - 0.5) * 7;
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
        if (s % 4 === 2) cracks += `<path pathLength="1" d="M${x.toFixed(1)} ${y.toFixed(1)}l${(dir * (8 + rnd() * 10)).toFixed(1)} ${((rnd() - 0.5) * 22).toFixed(1)}"/>`;
      }
      cracks += `<path pathLength="1" d="${d}"/>`;
    }
  }
  let feathers = '';
  for (let j = 0; j < 14; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 3.4, r = 24 + rnd() * 46;
    feathers += `<ellipse cx="196" cy="404" rx="3.2" ry="1.2" transform="rotate(${(rnd() * 180).toFixed(0)} 196 404)" `
      + `style="--dx:${(Math.cos(a) * r).toFixed(1)}px;--dy:${(Math.sin(a) * r).toFixed(1)}px;animation-delay:${(1.27 + rnd() * 0.1).toFixed(2)}s"/>`;
  }
  const wing = '<path d="M-5-20Q-16-27-24-40L-23-31-30-34-25-25-32-24-26-17-31-14-21-11Q-12-11-5-11Z"/>';
  const head = '<path d="M-3-22Q-6-28-9-31"  stroke="#6b5212" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    + '<circle cx="-10.5" cy="-33" r="3.3"/><path d="M-13.5-33.5l-4 1.8 4 1.2z" fill="#e2b04a"/>'
    + '<path d="M-13-36.4h5l-.8-3.4-1.2 1.6-1-1.8-1 1.8-1.2-1.6z"/>';
  const eagle = `<g transform="translate(196 418)" fill="#b8902c" stroke="#5a4510" stroke-width=".7" stroke-linejoin="round">`
    + `${wing}<g transform="scale(-1 1)">${wing}</g>${head}<g transform="scale(-1 1)">${head}</g>`
    + '<ellipse cx="0" cy="-15" rx="7" ry="10.5"/><path d="M-6-7L0 4 6-7z"/>'
    + '<path d="M-3.5-6l-1 7M3.5-6l1 7" stroke="#3a2c0a" stroke-width="1.6" stroke-linecap="round"/></g>';
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
      people += `<g class="sc-man" style="animation-delay:${go}s">${person(x, y, i * 2 + side * 5)}</g>`;
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
    <clipPath id="sc-above-ice"><rect x="-400" y="-700" width="1160" height="${ICE + 701}"/></clipPath>
  </defs>
  <g class="sc-sobcam"><g class="sc-shake">
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
  <g class="sc-bank-r">
  <g class="sc-city">${blocks}<g class="sc-windows" fill="#ffd27a">${windows}</g></g>
  <path d="M236 418Q252 402 284 400H760V420H236Z" fill="#1a2338"/>
  <path d="M236 418Q252 402 284 400H760" fill="none" stroke="#dfe8f2" stroke-width="2.5" opacity=".75"/>
  </g>
  <g class="sc-bank-l">
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
  </g>
  <g class="sc-cracks" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#0a1424" stroke-width="3">${cracks}</g>
    <g stroke="#e4eef8" stroke-width=".8" opacity=".7" transform="translate(0 1.6)">${cracks}</g>
  </g>
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
  <g clip-path="url(#sc-above-ice)"><g class="sc-fall"><g class="sc-stake">
    <rect x="193" y="420" width="6" height="${ICE - 420 + 2}" fill="#6b4a32"/><path d="M193 ${ICE + 2}l3 4 3-4z" fill="#6b4a32"/>
    <path d="M194 426v36" stroke="#8a5a2e" stroke-width="1.2" opacity=".6"/>
    <g class="sc-rag"><rect x="199" y="422" width="26" height="5" fill="#e6e2d8"/><rect x="199" y="427" width="26" height="5" fill="#2b4d9a"/><rect x="199" y="432" width="26" height="5" fill="#b8322a"/></g>
    ${eagle}
  </g></g></g>
  <g class="sc-feathers" fill="#c9a23a">${feathers}</g>
  <g class="sc-splash" fill="#cfe2f5">${drops}</g>
  <path d="M-400 514Q-100 500 60 512T360 508T760 512V1040H-400Z" fill="#141c2e"/>
  <path d="M-400 514Q-100 500 60 512T360 508T760 512" fill="none" stroke="#dfe8f2" stroke-width="2" opacity=".45"/>
  <path d="M14 520l-4-26M22 520l2-30M30 520l-6-20M330 516l4-24M340 516l-2-30M348 516l6-18" stroke="#2c3550" stroke-width="2" stroke-linecap="round"/>
  <g transform="translate(196 278)">
    <g class="sc-half" style="--fx:-135px;--fy:-96px"><g transform="scale(.3)">${half('l')}</g></g>
    <g class="sc-half" style="--fx:135px;--fy:-96px"><g transform="scale(.3)">${half('r')}</g></g>
    <g class="sc-whole" transform="scale(.3)">
      <path d="${COA_SHIELD}" fill="#005bbb" stroke="#ffd500" stroke-width="5"/>
      <g fill="#ffd500"><path d="${COA_MID}"/><path d="${COA_SIDE}"/><path d="${COA_SIDE}" transform="scale(-1 1)"/></g>
    </g>
    <circle class="sc-click" cx="0" cy="34" r="12" fill="#fff4dc"/>
  </g>
  <g class="sc-snow" fill="#e8eef8">${snow}</g>
  </g></g>
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

// Секретна сценка (≈1 з 30 запусків): печиво з передбаченням на мішенній поличці — постріл, печиво розколюється,
// вилітає папірець зі щасливими числами (калібри), передбачення — у підписі
const FORTUNES = [
  'Сьогодні всі кулі ляжуть в одну дірку',
  'Сьогодні дихатимеш рівно, і група збереться',
  'Цинк сам себе не розстріляє. Час на стрільбище',
  'Незабаром у сейфі доведеться посунутись',
  'Твоя наступна група буде менша за монету',
  'Не вір першому пострілу — вір групі',
  'Холодний ствол сьогодні не підведе',
  'Сьогодні гонг задзвенить з першого разу',
  'Удача любить тих, хто перевіряє нуль',
  'Мішень боїться тебе більше, ніж ти її',
  'Найкращий постріл ще попереду. Набій для нього вже купено',
  'На тебе чекає приємний сюрприз. Можливо, в коробці з набоями',
  'Повільно — це плавно. Плавно — це швидко',
  'Незабаром прийде несподівана посилка. Сподіваємось, з капсулями',
  'Удача тобі всміхнеться. Вітер — ні',
  'Чудовий день, щоб нарешті почистити ствол',
  'Купчастість любить тих, хто чекає, поки ствол охолоне',
  'Усе, що пішло в молоко, повернеться досвідом',
  'Допомога прийде, звідки не чекаєш. З таблиці DOPE',
  'У твоєму сейфі незабаром з’явиться хтось важливий',
  'Ти знайдеш ту саму гільзу',
  'Не все, що блищить, — латунь. Але все одно підбери',
  'Останнім сміється той, хто пристрілявся',
  'Промах — теж дані. Запиши його',
  'Друзі тебе цінують. Особливо коли в тебе зайвий цинк',
  'Зорі сьогодні на твоєму боці. Марево — ні',
  'Шлях у тисячу метрів починається з пристрілки на сто',
  'Гроші прийдуть до тебе. І одразу підуть на набої',
  'Ти на правильному шляху. Поправка: два кліки праворуч',
  'Усе буде добре. Особливо СТВ',
  'Хронограф знає більше, ніж це печиво',
  'Рятуйте, мене тримають у цеху спорядження набоїв',
  'На тебе чекає далека дорога. На стрільбище',
  'Спуск сьогодні буде м’якший, ніж зазвичай',
  'Набоїв на полиці менше, ніж ти думаєш. Перерахуй',
  'Твоя впертість незабаром окупиться. Десяткою',
  'Навушники сьогодні не забудеш. Ми нагадали',
  'Сьогодні краще стріляти, ніж сперечатися про калібри',
  'Промаху не було. Мішень просто зсунулась',
  'Хто не записав постріл — той не стріляв',
  'Хтось на рубежі спитає твій рецепт. Не кажи',
  'Сьогодні мушка дружитиме з ціликом',
  'Незабаром дізнаєшся, куди зникають усі набої. На стрільбищі',
  'Не квап спуск — він сам знає коли',
  'Чистий ствол — чиста совість',
  'Вітер зміниться на твою користь. Ненадовго',
  'Сьогодні в приціл побачиш пробоїну там, куди цілишся',
  'Вдих. Пауза. Постріл. Повтори',
  'На тебе чекає зустріч зі старим другом. Шомполом',
  'Порахуй кліки двічі. Промахів буде менше',
  'Сьогодні мішень здасться без бою',
  'Твоя купчастість викличе заздрість сусіда по рубежу',
  'Незабаром тобі запропонують обмін. Не міняй свій ствол',
  'Мудрість приходить з досвідом. Досвід — з набоями',
  'Сьогодні рука не здригнеться',
  'Удача ближче, ніж здається. Приблизно на сто метрів',
  'Незабаром ти купиш ще один приціл. Так написано',
  'Не шукай винних — шукай СТВ',
  'Сьогодні твоя мішень буде як решето. У доброму сенсі',
  'Рік буде багатий на гільзи',
  'Великі стрільці теж починали з молока',
  'Сьогодні всі магазини повернуться додому',
  'Ключ від сейфа сьогодні знайдеться з першого разу',
  'Сусід по рубежу позичить тобі шомпол і забуде забрати',
  'У кишені старої куртки чекають забуті набої',
  'У цьому печиві немає пороху. Перевірено',
  'Добра новина: сьогодні все в межах MOA',
  'Хронограф незабаром скаже тобі щось приємне',
  'Мішень пам’ятає кожного. Тебе — з повагою',
  'Сусідня мішень сьогодні виглядатиме гірше за твою',
  'Безпека понад усе. Навіть понад передбачення',
  'Сьогодні кліки на барабанчику зійдуться з таблицею',
  'У цьому печиві захований 25-й кадр. Тобі вже хочеться почистити ствол',
  '25-го кадру тут немає. Просто сходи на стрільбище. Сходи. На стрільбище',
  'Оптика сьогодні не поцілує тебе в брову. Тримай відстань',
  'Сошки стануть рівно з першої спроби. Навіть на камінні',
  'Тобі дістанеться остання пачка капсулів у магазині',
  'Гвинти кріплень тримають момент. Динамометрична викрутка тобою пишається',
  'Тебе спитають: MOA чи MRAD? Не відповідай, тікай',
  'Набивач магазинів знайдеться в першій же кишені',
  'Ціна набоїв не зміниться. Ти просто не дивитимешся',
  'Дробовик буде слухняний. Плече подякує ввечері',
  'Глушник буде тихіший за твої думки про новий приціл',
  'Пристрілка займе три постріли. Ну, п’ять',
  'Порох у банці скінчиться рівно на останньому набої партії',
  'Потрібний шестигранник виявиться в кишені',
  'Хтось на рубежі попросить сфотографувати твою мішень',
  'Сусід по рубежу принесе каву. На двох',
  'Захисні окуляри не запітніють. Цього разу',
];
// печиво спереду: два рум'яні пелюстки, загнуті до середини, між ними — складка в тіні; світло зліва
const COOKIE_ART = '<path d="M180 334Q148 329 139 349Q133 366 145 374Q158 363 172 367Q177 350 180 334Z" fill="url(#sc-fc-ckl)"/>'
  + '<path d="M180 334Q212 329 221 349Q227 366 215 374Q202 363 188 367Q183 350 180 334Z" fill="url(#sc-fc-ckr)"/>'
  + '<path d="M172 367Q176 350 180 334Q184 350 188 367Q180 373 172 367Z" fill="url(#sc-fc-ckm)"/>'
  + '<path d="M145 374Q133 366 139 349Q148 329 180 334Q212 329 221 349Q227 366 215 374" fill="none" stroke="#a0621c" stroke-width="1.6" opacity=".6"/>'
  + '<path d="M145 374Q158 363 172 367M188 367Q202 363 215 374" fill="none" stroke="#b5732a" stroke-width="1.2" opacity=".7"/>'
  + '<path d="M172 367Q176 350 180 334Q184 350 188 367" fill="none" stroke="#8a5216" stroke-width="1.1" opacity=".8"/>'
  + '<path d="M144 352Q151 337 170 336" stroke="#fff3cf" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".85"/>'
  + '<path d="M148 362Q150 356 154 352" stroke="#fff3cf" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>'
  + '<path d="M194 338Q209 340 214 349" stroke="#fde1a2" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>'
  + '<g fill="#a8681f" opacity=".35"><circle cx="152" cy="346" r=".8"/><circle cx="160" cy="352" r=".7"/><circle cx="148" cy="365" r=".8"/>'
  + '<circle cx="165" cy="342" r=".6"/><circle cx="163" cy="359" r=".7"/><circle cx="198" cy="347" r=".8"/><circle cx="206" cy="355" r=".7"/>'
  + '<circle cx="212" cy="364" r=".8"/><circle cx="200" cy="360" r=".6"/><circle cx="208" cy="343" r=".6"/></g>';

// Передбачення з власного журналу (app.js підставляє: стволи, настріл, чистки, БК) — уже перекладені рядки
let fortuneSource = () => [];
export function setFortuneSource(fn) { fortuneSource = fn; }

/** Усі передбачення для перегляду в панелі сценок: звичайні, золоті й ті, що зараз складаються з журналу. */
export function fortuneList() {
  return { plain: FORTUNES.map((x) => t(x)), gold: GOLD_FORTUNES.map((x) => t(x)), own: fortuneSource() };
}

// Золоте печиво — рідкісне (≈ 1 з 20), свої передбачення
const GOLD_FORTUNES = [
  'Золоте печиво! Сьогодні кожна куля — в десятку',
  'Рідкісна удача: сьогодні жодної осічки',
  'Одне на двадцять. Як і твій найкращий постріл',
  'Сфотографуй це печиво. Без фото ніхто не повірить',
  'Сьогодні можна все. Крім поспіху',
  'Сьогодні навіть перший постріл з холодного ствола ляже в центр',
  'Удача вже заряджена. Лишилося натиснути на спуск',
  'Цього разу печиво пригощає: наступний цинк знайдеться дешевше',
  'Купи сьогодні лотерейний квиток. А краще цинк',
];
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

/** Печиво на цей показ; ?gold=1 ?own=1 ?season=winter ?tod=night — для перегляду. */
function fortuneParams() {
  const q = new URLSearchParams(location.search), h = new Date().getHours();
  const gold = q.has('gold') ? q.get('gold') === '1' : Math.random() < 1 / 20;
  const mine = gold ? [] : fortuneSource();
  const own = mine.length && (q.get('own') === '1' || Math.random() < 0.4) ? mine[Math.floor(Math.random() * mine.length)] : null;
  return {
    gold, own, i: Math.floor(Math.random() * (gold ? GOLD_FORTUNES : FORTUNES).length), n: 1 + Math.floor(Math.random() * 1e6),
    season: q.get('season') ?? SEASONS[new Date().getMonth()],
    tod: q.get('tod') ?? (h >= 21 || h < 5 ? 'night' : h < 9 ? 'morning' : h < 17 ? 'day' : 'evening'),
  };
}

function fortuneText(p) {
  const list = p.gold ? GOLD_FORTUNES : FORTUNES;
  return p.own ?? t(list[(p.i ?? 0) % list.length]);
}

/**
 * Рядки записки: кожне речення — з нового рядка (у «фраза. Несподіваний хвіст» хвіст читається окремо);
 * довге речення — на стільки рядків, скільки треба для ~24 літер, але слова розкладено рівно, без самотнього
 * слова в кінці. Прийменник чи сполучник (до 2 літер) не лишається в кінці рядка, тире — на початку.
 */
function fortuneLines(text) {
  const MAX = 24;
  const greedy = (words) => words.reduce((out, w) => {
    if (out.length && `${out[out.length - 1]} ${w}`.length <= MAX) out[out.length - 1] += ` ${w}`;
    else out.push(w);
    return out;
  }, []).length;
  const glue = (words) => words.reduce((out, w) => {
    const prev = out[out.length - 1];
    if (prev && (/^[—–-]$/.test(w) || (/^\p{L}{1,2}$/u.test(prev.split(' ').pop()) && !/[.,!?…:;]$/.test(prev)))) out[out.length - 1] = `${prev} ${w}`;
    else out.push(w);
    return out;
  }, []);
  const widest = (ls) => Math.max(...ls.map((l) => l.length));
  const split = (words, k) => {
    if (k <= 1) return [words.join(' ')];
    let best = null;
    for (let i = 1; i <= words.length - k + 1; i++) {
      const cand = [words.slice(0, i).join(' '), ...split(words.slice(i), k - 1)];
      if (!best || widest(cand) < widest(best)) best = cand;
    }
    return best;
  };
  return text.split(/(?<=[.!?…])\s+(?=[«"А-ЯІЇЄҐA-Z])/u).flatMap((s) => {
    const words = glue(s.split(' '));
    return split(words, Math.min(greedy(s.split(' ')), words.length));
  });
}

const LUCKY = ['.22', '5,45', '5,56', '6,5', '7,62', '7,92', '9', '.308', '.338', '.45', '12', '12,7', '14,5', '16', '20', '30-06'];

function fortuneCookie(p = {}) {
  const rnd = seeded(77), pick = seeded(p.n ?? 1), season = p.season ?? 'spring', gold = !!p.gold;
  // час доби: небо, озеро, вулкан, хмари; сонце вдень, низьке сонце ввечері, місяць уночі; ліхтарик світить сильніше в темряві
  const PAL = {
    day: { sky: ['#e4cfae', '#f0bf92', '#f5d6a2'], lake: ['#b9bfc6', '#8c9db3', '#6c7f9a'], fuji: ['#5d6f96', '#8fa0bc'], cloud: '#fbf1de', sun: [238, 214, 66, '#d9442e'], glow: 0.22, shade: 0 },
    morning: { sky: ['#cdd8e6', '#f1d5c6', '#f8e4c8'], lake: ['#d4dbe3', '#adbbcc', '#8a9bb3'], fuji: ['#7a8bab', '#b3c0d4'], cloud: '#ffffff', sun: [238, 290, 48, '#ee7a54'], glow: 0.18, shade: 0 },
    evening: { sky: ['#4b3a6e', '#c96a7a', '#f2a46a'], lake: ['#c08a8c', '#7d6b8f', '#4f4a6e'], fuji: ['#463f68', '#7f6f92'], cloud: '#f5b896', sun: [240, 330, 58, '#e9573a'], glow: 0.4, shade: 0.16 },
    night: { sky: ['#131b3e', '#2b3668', '#4a548c'], lake: ['#46547c', '#323d62', '#222a48'], fuji: ['#6a78a8', '#56628e'], cloud: '#5d669a', sun: [252, 160, 30, '#f3ecd0'], glow: 0.6, shade: 0.24 },
  };
  const tod = PAL[p.tod] ? p.tod : 'day', pal = PAL[tod], night = tod === 'night', [sunX, sunY, sunR, sunC] = pal.sun;
  let stars = '';
  if (night) {
    for (let j = 0; j < 200; j++) stars += `<circle cx="${f1(-700 + rnd() * 1760)}" cy="${f1(-380 + rnd() * 700)}" r="${f1(0.4 + rnd() * 0.9)}" opacity="${f1(0.4 + rnd() * 0.6)}"/>`;
  }
  const lucky = [...LUCKY].sort(() => pick() - 0.5).slice(0, 4)
    .sort((a, b) => parseFloat(a.replace(',', '.').replace(/^\./, '0.')) * (a.startsWith('.') ? 25.4 : 1)
      - parseFloat(b.replace(',', '.').replace(/^\./, '0.')) * (b.startsWith('.') ? 25.4 : 1));
  let crumbs = '', trees = '', twinkles = '';
  for (let j = 0; j < 16; j++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 3.6, r = 30 + rnd() * 60;
    crumbs += `<circle cx="180" cy="360" r="${f1(1.2 + rnd() * 2)}" style="--dx:${f1(Math.cos(a) * r)}px;--dy:${f1(Math.sin(a) * r)}px;animation-delay:${(0.1 + rnd() * 0.08).toFixed(2)}s"/>`;
  }
  // японські сосни — пласкі хмаринки хвої на обрії
  for (let x = -1400; x < 1760; x += 18 + rnd() * 22) {
    const w = 10 + rnd() * 10, y = 420 - rnd() * 6;
    trees += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w)}" ry="${f1(w * 0.42)}" fill="#3a4632"/>`
      + `<ellipse cx="${f1(x + w * 0.4)}" cy="${f1(y - w * 0.5)}" rx="${f1(w * 0.6)}" ry="${f1(w * 0.3)}" fill="#46543b"/>`;
  }
  // гілка сакури з кутка: квіти по п'ять пелюсток; пелюстки летять униз скісно
  const bloom = (x, y, r) => [0, 1, 2, 3, 4].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return `<circle cx="${f1(x + Math.cos(a) * r)}" cy="${f1(y + Math.sin(a) * r)}" r="${f1(r * 0.75)}"/>`;
  }).join('') + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.45)}" fill="#d9577a"/>`;
  // гілка сакури виходить з-під стріхи в лівому куті (не з краю малюнка — на широкому екрані край посеред вікна): стовбур ламається зигзагом і тоншає, бічні пагони під різними кутами, трохи никнуть;
  // цвіт — гронами на кінчиках і поодинці вздовж тонких гілок
  const sk = seeded(5), twigs = [], flowers = [], buds = [];
  const grow = (x, y, a, len, w, depth, max) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, bend = (sk() - 0.5) * len * 0.4;
    const mx = (x + ex) / 2 - Math.sin(a) * bend, my = (y + ey) / 2 + Math.cos(a) * bend;
    const at = (t) => [(1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * ey];
    twigs.push([`M${f1(x)} ${f1(y)}Q${f1(mx)} ${f1(my)} ${f1(ex)} ${f1(ey)}`, w]);
    for (let k = depth >= 1 ? 3 + Math.floor(sk() * 3) : 1; k > 0; k--) {
      const [px, py] = at(0.15 + sk() * 0.8);
      flowers.push([px + (sk() - 0.5) * 13, py + (sk() - 0.5) * 13, 3.6 + sk() * 1.8]);
    }
    if (depth >= max || ex > 205 || ey > 200) {
      for (let k = 8 + Math.floor(sk() * 4); k > 0; k--) flowers.push([ex + (sk() - 0.5) * 30, ey + (sk() - 0.5) * 26, 3.8 + sk() * 2.2]);
      if (sk() < 0.7) buds.push([ex + Math.cos(a) * 9, ey + Math.sin(a) * 9]);
      return;
    }
    // бічні пагони — з різних місць гілки, по черзі в різні боки
    let side = sk() < 0.5 ? -1 : 1;
    for (let n = depth === 0 ? 2 : depth < 3 ? 1 : 0; n > 0; n--, side = -side) {
      const t = 0.35 + sk() * 0.5, [sx, sy] = at(t);
      grow(sx, sy, a + side * (0.55 + sk() * 0.5) + 0.12, len * (0.45 + sk() * 0.25), w * 0.55, depth + 1, max);
    }
    grow(ex, ey, a + (sk() - 0.5) * 0.7 + 0.1, len * (0.72 + sk() * 0.15), w * 0.7, depth + 1, max);
  };
  grow(4, -14, 0.72, 78, 8.5, 0, 4);
  grow(-6, -14, 1.3, 58, 6, 1, 4);
  let blossoms = '', petals = '';
  const open = flowers.filter(([, y]) => y > 26);
  // пора року: весна — сакура, літо — зелене листя, осінь — червоний клен, зима — сніг на гілках і рідкі червоні квіти сливи
  const PINK = ['#f6c1cf', '#fbdde6', '#f3a9c0', '#f8cad6'], GREEN = ['#5f9a4a', '#7bb35c', '#4a7f3a'], MAPLE = ['#d9452b', '#e8732c', '#f0a030', '#b8322a'];
  const LEAF = {
    spring: (x, y, r, i) => `<g fill="${PINK[(i * 7) % 4]}">${bloom(x, y, r)}</g>`,
    summer: (x, y, r, i) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 1.5)}" ry="${f1(r * 0.65)}" transform="rotate(${(i * 47) % 180} ${f1(x)} ${f1(y)})" fill="${GREEN[i % 3]}"/>`,
    autumn: (x, y, r, i) => `<path d="${star(x, y, r * 1.5, r * 0.75)}" fill="${MAPLE[(i * 5) % 4]}"/>`,
    winter: (x, y, r, i) => (i % 6 === 0 ? `<g fill="#d8364a">${bloom(x, y, r * 0.8)}</g>`
      : `<ellipse cx="${f1(x)}" cy="${f1(y - r * 0.3)}" rx="${f1(r * 1.2)}" ry="${f1(r * 0.6)}" fill="#f4f7fb"/>`),
  };
  const leaf = LEAF[season] ?? LEAF.spring;
  // що летить униз: пелюстки, листя, сніжинки (влітку — кілька листків)
  const FALL = {
    spring: (x, y) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="2.6" ry="1.5" fill="#f6b3c6"`,
    summer: (x, y) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="3" ry="1.4" fill="#6fa852"`,
    autumn: (x, y, j) => `<path d="${star(x, y, 3.6, 1.8)}" fill="${MAPLE[j % 4]}"`,
    winter: (x, y, j) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1.4 + (j % 3) * 0.5)}" fill="#ffffff"`,
  };
  // золоте печиво: замість пелюсток і листя з гілки сиплються золоті пластівці
  const GOLDS = ['#f3c93e', '#ffe27a', '#d9a520'];
  const fall = gold ? (x, y, j) => `<path d="M${f1(x)} ${f1(y - 2.6)}l2 2.6-2 2.6-2-2.6z" fill="${GOLDS[j % 3]}"` : FALL[season] ?? FALL.spring;
  open.forEach(([x, y, r], i) => { blossoms += leaf(x, y, r, i); });
  // світлячки — літнього вечора й уночі
  let fireflies = '';
  if (season === 'summer' && (night || tod === 'evening')) {
    for (let j = 0; j < 16; j++) {
      const x = f1(-20 + rnd() * 400), y = f1(300 + rnd() * 160);
      // ореол — градієнт, а не CSS-фільтр: фільтр на кожному кадрі перемальовується й гальмує слабкі телефони
      fireflies += `<g style="animation-delay:-${(rnd() * 3).toFixed(2)}s;animation-duration:${(2 + rnd() * 2).toFixed(1)}s"><circle cx="${x}" cy="${y}" r="5" fill="url(#sc-fc-ffglow)"/><circle cx="${x}" cy="${y}" r="1.6"/></g>`;
    }
  }
  // від тапу гілка струшує пелюстки — скінченна анімація, стоїть на паузі разом зі сценкою
  let gust = '';
  for (let j = 0; j < 18; j++) {
    const [px, py] = open[Math.floor(rnd() * open.length)];
    gust += `${fall(px, py, j)} style="--dx:${f1(40 + rnd() * 140)}px;--dy:${f1(60 + rnd() * 220)}px;animation-delay:${(0.02 + rnd() * 0.25).toFixed(2)}s"/>`;
  }
  // 20, а не 30: пелюстки — найдорожча анімація сценки, а густоти вистачає
  for (let j = 0; j < (season === 'summer' && !gold ? 6 : 20); j++) {
    // пелюстки (листя, сніг) обсипаються з гілки
    const [px, py] = open[Math.floor(rnd() * open.length)];
    petals += `${fall(px, py, j)} `
      + `style="animation-duration:${(6 + rnd() * 4).toFixed(1)}s;animation-delay:-${(rnd() * 9).toFixed(1)}s"/>`;
  }
  // стовпчики з кроком 116 по всій ширині; біля чашки чаю крок ширший (112 → 248), як було
  const posts = [...Array.from({ length: 9 }, (_, k) => -1396 + k * 116), -352, -236, -120, -4, 112,
    ...Array.from({ length: 14 }, (_, k) => 248 + k * 116)]
    .map((x) => `<rect x="${x - 5}" y="396" width="10" height="170" fill="#3b2418"/><rect x="${x - 5}" y="396" width="3" height="170" fill="#5a3a26"/>`).join('');
  // крокви під стріхою — на високому екрані там видно стелю веранди
  let rafters = '';
  for (let x = -1400; x < 1760; x += 22) rafters += `<path d="M${x} -400V0" stroke="#35241f" stroke-width="7"/><rect x="${x - 3.5}" y="-4" width="7" height="8" rx="1" fill="#5a3d2c"/>`;
  // журавлі над озером: летять через небо, махають крилами
  const crane = (x, y, d) => `<g transform="translate(${x} ${y})"><path class="sc-fc-wing" d="M-9 0Q-4-5 0 0Q4-5 9 0" style="animation-delay:-${d}s"/><path d="M0 0l3.5 1" stroke-width="1.2"/></g>`;
  // передбачення на папірці; щасливі числа дрібно внизу
  const lines = fortuneLines(fortuneText(p));
  const slipH = 16 + lines.length * 13 + 20, top = -slipH / 2;
  const slipText = lines.map((l, k) => `<text y="${f1(top + 17 + k * 13)}">${l}</text>`).join('');
  // пагода на пагорбі праворуч: п'ять дахів з загнутими краями — верхні три видно над поручнями
  let pagoda = '';
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const y = 404 - i * 16, w = 19 - i * 3;
    pagoda += `<rect x="${f1(306 - w * 0.55)}" y="${y}" width="${f1(w * 1.1)}" height="13" fill="${night ? '#7a2e26' : '#b03a2a'}"/>`
      + `<path d="M${f1(306 - w - 5)} ${y - 1}Q306 ${y - 8} ${f1(306 + w + 5)} ${y - 1}L${f1(306 + w)} ${y + 2}Q306 ${y - 3} ${f1(306 - w)} ${y + 2}Z" fill="#2b1d1c"/>`;
  }
  const spireTop = 404 - (tiers - 1) * 16 - 6;
  pagoda += `<path d="M306 ${spireTop}v-16" stroke="#2b1d1c" stroke-width="1.6"/><circle cx="306" cy="${spireTop - 8}" r="1.6" fill="#2b1d1c"/>`;
  for (let j = 0; j < 6; j++) {
    const a = (j / 6 + 1 / 12) * 2 * Math.PI;
    twinkles += `<path d="${star(Math.cos(a) * 104, Math.sin(a) * (slipH / 2 + 12), 4, 1.4)}" style="animation-delay:-${(j * 0.27).toFixed(2)}s"/>`;
  }
  // далекі хребти в серпанку обабіч Фудзі — видно лише на широкому екрані (на телефоні x 0…360);
  // свій генератор, щоб не зсунути решту випадкового малюнка
  const rr = seeded(9);
  // вершини через 80, згладжені через середини; down — з якого боку хребет плавно сходить до води (біля Фудзі)
  const ridge = (from, to, y0, amp, down) => {
    const pts = [];
    for (let x = from; x <= to; x += 80) pts.push([x, y0 + rr() * amp]);
    const n = pts.length - 1, fade = 4;
    pts.forEach((pt, i) => {
      const k = down === 'right' ? (n - i) / fade : i / fade;
      if (k < 1) pt[1] = 424 - (424 - pt[1]) * Math.max(0, k);
    });
    let d = `M${from} 424L${pts[0][0]} ${f1(pts[0][1])}`;
    for (let i = 1; i <= n; i++) {
      const [x0, y1] = pts[i - 1], [x1, y2] = pts[i];
      d += `Q${x0} ${f1(y1)} ${(x0 + x1) / 2} ${f1((y1 + y2) / 2)}`;
    }
    return `${d}L${to} ${f1(pts[n][1])}V424Z`;
  };
  const ranges = `<g fill="${pal.fuji[1]}" opacity=".3"><path d="${ridge(-1400, 40, 336, 40, 'right')}"/><path d="${ridge(280, 1760, 332, 40, 'left')}"/></g>`
    + `<g fill="${pal.fuji[0]}" opacity=".42"><path d="${ridge(-1400, 0, 380, 22, 'right')}"/><path d="${ridge(320, 1760, 378, 22, 'left')}"/></g>`;
  // ліхтарик і фурін — функціями від x: такі самі висять обабіч на широкому екрані; top — звідки звисає шнурок
  const lantern = (cx, top = 16) => `<circle cx="${cx}" cy="62" r="${night ? 70 : 48}" fill="url(#sc-fc-glow)" opacity="${f1(Math.min(1, pal.glow * 1.6))}"/>
    <path d="M${cx} ${top}V34" stroke="#221a18" stroke-width="1.5"/>
    <ellipse cx="${cx}" cy="62" rx="17" ry="24" fill="${night || tod === 'evening' ? '#f0582f' : '#d23c2c'}"/>
    <path d="M${cx - 16} 50Q${cx} 46 ${cx + 16} 50M${cx - 17} 62h34M${cx - 16} 74Q${cx} 78 ${cx + 16} 74" stroke="#a42a1f" stroke-width="1.2" fill="none"/>
    <ellipse cx="${cx - 7}" cy="57" rx="4.5" ry="12" fill="${night ? '#ffd27a' : '#ff9a6a'}" opacity="${night ? 0.7 : 0.4}"/>
    <rect x="${cx - 9}" y="34" width="18" height="6" rx="1.5" fill="#221a18"/><rect x="${cx - 9}" y="84" width="18" height="6" rx="1.5" fill="#221a18"/>
    <path d="M${cx} 90v12" stroke="#e8b23a" stroke-width="2.2" stroke-linecap="round"/>`;
  const furin = (cx, top = 20) => `<path d="M${cx} ${top}V34M${cx} 44v18" stroke="#3a2a22" stroke-width=".8"/>
    <path d="M${cx - 11} 46Q${cx - 11} 32 ${cx} 32Q${cx + 11} 32 ${cx + 11} 46Z" fill="#bfe2f4" opacity=".85"/><path d="M${cx - 9} 44Q${cx - 8} 36 ${cx - 2} 34" stroke="#fff" stroke-width="1.4" fill="none" opacity=".8"/>
    <path d="M${cx - 5} 41q3-3 6 0q-3 3-6 0zM${cx + 1} 41l3-2v4z" fill="#d23c2c"/>
    <rect x="${cx - 4}" y="62" width="8" height="24" fill="#fff5d8"/><path d="M${cx - 4} 62h8" stroke="#d23c2c" stroke-width="2"/>`;
  // [x, звідки шнурок]: на краях стріхи її нижній край вище (рівна частина)
  const sideLanterns = [[-110, 12], [720, 12]].map(([cx, tp], k) => `<g class="sc-fc-blow-lantern" style="transform-origin:${cx}px 16px">`
    + `<g class="sc-fc-lantern" style="transform-origin:${cx}px 16px;animation-delay:-${1.1 + k}s">${lantern(cx, tp)}</g></g>`).join('');
  const sideFurin = [[-330, 12], [520, 12]].map(([cx, tp], k) => `<g class="sc-fc-blow-furin" style="transform-origin:${cx}px 20px">`
    + `<g class="sc-fc-chime" style="transform-origin:${cx}px 20px;animation-delay:-${0.7 + k * 1.3}s">${furin(cx, tp)}</g></g>`).join('');
  // бамбукові вітряні дзвіночки: п'ять трубок з колінцями від довгої (соль) до короткої (мі) і калатало з вітрилом;
  // на розлам кожна трубка здригається тоді ж, коли звучить її нота (KNOCKS — нижче, біля звуку)
  const hits = {};
  for (const [at, note] of gold ? KNOCKS_GOLD : KNOCKS) hits[Math.min(note, 4)] ??= at;
  const tubes = [34, 31, 28, 25, 22].map((len, k) => {
    const x = f1(229.2 + k * 5.4);
    const knee = (p) => `<rect x="${f1(x - 1.8)}" y="${f1(34 + len * p)}" width="3.6" height=".9" rx=".4" fill="#6f6a2c"/>`;
    return `<path d="M${x} 30v4" stroke="#3a2a22" stroke-width=".6"/><g class="sc-fc-tube" style="${hits[k] == null ? 'animation:none' : `animation-delay:${(hits[k] + 0.02).toFixed(2)}s`}">`
      + `<rect x="${f1(x - 1.6)}" y="34" width="3.2" height="${len}" rx=".6" fill="url(#sc-fc-tubeg)"/>${knee(0.36)}${knee(0.74)}</g>`;
  }).join('');
  // торії в озері праворуч — на широкому екрані; з відображенням
  const toriiArt = (red) => `<g fill="${red}"><rect x="-17" y="-44" width="4" height="44"/><rect x="13" y="-44" width="4" height="44"/>`
    + '<rect x="-23" y="-35" width="46" height="3.2"/><rect x="-25" y="-45" width="50" height="3.4"/><rect x="-1.4" y="-42" width="2.8" height="7"/></g>'
    + '<path d="M-31-45.5Q0-41 31-45.5L33-50Q0-45-33-50Z" fill="#2b1d1c"/>';
  const torii = `<g transform="translate(538 456)">${toriiArt(night ? '#9a3a2e' : '#c8402c')}`
    + `<g transform="scale(1 -1)" opacity=".28">${toriiArt('#c8402c')}</g><path d="M-26 1.5h52" stroke="#eef2f6" stroke-width="1" opacity=".5"/></g>`;
  // кола на воді — ніби плеснув короп; два кільця одне за одним
  const koi = [[96, 512, 0], [300, 456, 2.6], [-160, 500, 5.1], [470, 532, 1.3], [-430, 466, 3.9], [720, 490, 6.2]]
    .map(([x, y, d]) => `<g transform="translate(${x} ${y})"><ellipse rx="15" ry="3.4" style="animation-delay:-${d}s"/><ellipse rx="15" ry="3.4" style="animation-delay:-${f1(d + 7.55)}s"/></g>`).join('');
  // доріжка сонця чи місяця на воді: риски звужуються донизу й мерехтять кожна у своєму ритмі
  const gl = seeded(13);
  let glints = '';
  for (let j = 0; j < 11; j++) {
    const w = 26 - j * 1.6, off = (gl() - 0.5) * 10;
    glints += `<path d="M${f1(238 + off - w)} ${432 + j * 12}h${f1(2 * w)}" stroke-width="${f1(3 - j * 0.12)}" style="animation-delay:-${(gl() * 1.6).toFixed(2)}s"/>`;
  }
  // на воді — те, що впало з гілки: пелюстки, листя чи золото; повільно дрейфують
  const fl = seeded(21);
  let afloat = '';
  for (let j = 0; j < (season === 'winter' && !gold ? 0 : 9); j++) {
    const x = -260 + fl() * 820, y = 440 + fl() * 110;
    afloat += `${fall(x, y, j)} style="animation-delay:-${(fl() * 6).toFixed(1)}s"/>`;
  }
  // золоте печиво: віяло променів з-за печива, лише над поручнями
  const rays = gold ? `<g clip-path="url(#sc-fc-rayclip)"><g class="sc-fc-rays-in"><g class="sc-fc-rays" fill="url(#sc-fc-ray)">${
    Array.from({ length: 18 }, (_, k) => `<path d="M177 362L169 172H191L183 362Z" transform="rotate(${k * 20} 180 362)"/>`).join('')}</g></g></g>` : '';
  // Шари — окремі svg з тим самим viewBox: нерухомий шар браузер малює раз, а нахил лише зсуває готові шари
  // (data-dx/dy — зсув у px за повного нахилу, fortuneTilt). В одному svg будь-яка пелюстка чи нахил
  // перемальовували всю сцену — на слабкому телефоні це 3–10 кадрів на секунду.
  const layer = (cls, dx, dy) => `<svg class="sc-fc-layer ${cls}"${dx == null ? '' : ` data-dx="${dx}" data-dy="${dy}"`} viewBox="0 0 360 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
  const FAR = [28, 10], MID = [14, 5], NEAR = [-15, -5.5];
  return `
${layer('sc-fc-far', ...FAR)}
  <defs>
    <linearGradient id="sc-fc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.sky[0]}"/><stop offset=".6" stop-color="${pal.sky[1]}"/><stop offset="1" stop-color="${pal.sky[2]}"/></linearGradient>
    <linearGradient id="sc-fc-lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.lake[0]}"/><stop offset=".5" stop-color="${pal.lake[1]}"/><stop offset="1" stop-color="${pal.lake[2]}"/></linearGradient>
    <linearGradient id="sc-fc-fuji" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.fuji[0]}"/><stop offset="1" stop-color="${pal.fuji[1]}"/></linearGradient>
    <linearGradient id="sc-fc-ckl" x1="0" y1="0" x2=".5" y2="1">${gold ? '<stop offset="0" stop-color="#fff4b8"/><stop offset=".55" stop-color="#f3c93e"/><stop offset="1" stop-color="#c4921a"/>' : '<stop offset="0" stop-color="#fcdc96"/><stop offset=".55" stop-color="#eaad50"/><stop offset="1" stop-color="#c88430"/>'}</linearGradient>
    <linearGradient id="sc-fc-ckr" x1="1" y1="0" x2=".5" y2="1">${gold ? '<stop offset="0" stop-color="#fbe07a"/><stop offset=".55" stop-color="#dcac28"/><stop offset="1" stop-color="#a57a0e"/>' : '<stop offset="0" stop-color="#f0bf68"/><stop offset=".55" stop-color="#d4943c"/><stop offset="1" stop-color="#ad6e24"/>'}</linearGradient>
    <linearGradient id="sc-fc-ckm" x1="0" y1="0" x2="0" y2="1">${gold ? '<stop offset="0" stop-color="#c9961a"/><stop offset="1" stop-color="#7f5c08"/>' : '<stop offset="0" stop-color="#c47f2c"/><stop offset="1" stop-color="#8c5418"/>'}</linearGradient>
    <clipPath id="sc-fc-l"><rect x="0" y="300" width="180" height="100"/></clipPath>
    <radialGradient id="sc-fc-glow"><stop offset="0" stop-color="#ffb070"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-fc-gglow"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-fc-ffglow"><stop offset=".3" stop-color="#fff38a" stop-opacity=".8"/><stop offset="1" stop-color="#fff38a" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-fc-mglow"><stop offset=".4" stop-color="#f3ecd0"/><stop offset="1" stop-color="#f3ecd0" stop-opacity="0"/></radialGradient>
    <clipPath id="sc-fc-under"><rect x="-1400" y="16" width="3160" height="1000"/></clipPath>
    <clipPath id="sc-fc-r"><rect x="180" y="300" width="180" height="100"/></clipPath>
    <linearGradient id="sc-fc-tubeg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a7f3a"/><stop offset=".35" stop-color="#e6d68e"/><stop offset=".7" stop-color="#bfa95a"/><stop offset="1" stop-color="#7a6c2e"/></linearGradient>
    <linearGradient id="sc-fc-ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3b8" stop-opacity=".85"/><stop offset=".6" stop-color="#ffe27a" stop-opacity=".2"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></linearGradient>
    <clipPath id="sc-fc-rayclip"><rect x="-200" y="-200" width="760" height="586"/></clipPath>
  </defs>
  <rect x="-1400" y="-400" width="3160" height="830" fill="url(#sc-fc-sky)"/>
  <g fill="#fff6dc">${stars}</g>
  <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="${sunC}"/>${night ? `<circle cx="${sunX}" cy="${sunY}" r="${sunR * 2.6}" fill="url(#sc-fc-mglow)" opacity=".3"/><circle cx="${sunX - 9}" cy="${sunY - 6}" r="6" fill="#e2d8b6"/><circle cx="${sunX + 8}" cy="${sunY + 9}" r="4" fill="#e2d8b6"/><circle cx="${sunX + 10}" cy="${sunY - 10}" r="2.6" fill="#e2d8b6"/>` : ''}
  ${ranges}
  <path d="M-30 424L76 320Q98 300 118 300Q138 300 160 320L268 424Z" fill="url(#sc-fc-fuji)"/>
  <path d="M76 320Q98 300 118 300Q138 300 160 320L152 326L142 318L132 330L122 320L112 331L102 319L92 329L84 322Z" fill="#fbf6ee"/>
  ${night ? '<path d="M138 304Q150 310 160 320L268 424H232L152 326Z" fill="#9fb0de" opacity=".35"/><path d="M160 320L268 424" stroke="#c9d4f2" stroke-width="1.6" opacity=".6"/>' : ''}
  <path d="M262 424Q290 396 330 398T400 412Q480 418 760 420V424Z" fill="#5a6a4a"/>
  <path d="M-400 424Q-300 404-200 410T-30 418V424Z" fill="#5a6a4a"/>
  <path d="M-1400 418H-400V424H-1400ZM760 418H1760V424H760Z" fill="#5a6a4a"/>
  ${pagoda}
  ${trees}
  <rect x="-1400" y="423" width="3160" height="620" fill="url(#sc-fc-lake)"/>
  <g opacity=".3" transform="translate(0 848) scale(1 -1)"><path d="M-30 424L76 320Q98 300 118 300Q138 300 160 320L268 424Z" fill="#5d6f96"/><path d="M76 320Q98 300 118 300Q138 300 160 320L152 326L142 318L132 330L122 320L112 331L102 319L92 329L84 322Z" fill="#fbf6ee"/></g>
  <g opacity=".22" transform="translate(0 848) scale(1 -1)">${pagoda}</g>
</svg>
${layer('sc-fc-far sc-fc-far-fx', ...FAR)}
  <g class="sc-fc-cranes" fill="none" stroke="#2b1d1c" stroke-width="1.6" stroke-linecap="round">
    ${crane(0, 150, 0)}${crane(-22, 162, 0.3)}${crane(-40, 146, 0.55)}
  </g>
  <g class="sc-fc-clouds" fill="${pal.cloud}">
    <rect x="30" y="232" width="150" height="10" rx="5"/><rect x="62" y="246" width="96" height="8" rx="4"/>
    <rect x="176" y="268" width="170" height="10" rx="5"/><rect x="216" y="282" width="110" height="7" rx="3.5"/>
    <rect x="-30" y="344" width="140" height="9" rx="4.5"/>
  </g>
  <g transform="translate(${sunX - 238} 0)"><g class="sc-fc-ripple" stroke="${night ? '#f3ecd0' : tod === 'evening' ? '#ffc08a' : '#fff0d0'}" stroke-linecap="round" opacity=".55">${glints}</g></g>
</svg>
${layer('sc-fc-mid', ...MID)}
  ${torii}
  <g class="sc-fc-koi" fill="none" stroke="#eef3f8" stroke-width="1.1">${koi}</g>
  ${afloat ? `<g class="sc-fc-afloat">${afloat}</g>` : ''}
  <path d="M-20 452q10-6 20 0t20 0M84 478q10-6 20 0t20 0M286 446q10-6 20 0t20 0M140 504q10-6 20 0t20 0t20 0M296 514q10-6 20 0t20 0M10 530q10-6 20 0t20 0M190 540q10-6 20 0t20 0" stroke="#e6ecf2" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".5"/>
  <g class="sc-fc-boat" transform="translate(52 452)">
    <path d="M-22 0Q0 8 24 0L20-4Q0 1-18-4Z" fill="#2b1d1c"/><path d="M-22 6Q0 12 24 6" stroke="#eef2f6" stroke-width="1" opacity=".5" fill="none"/>
    <path d="M2-4v-10" stroke="#2b1d1c" stroke-width="3" stroke-linecap="round"/><path d="M-5-14h14l-7-6z" fill="#c9a24a"/>
    <path d="M6-10L22 10" stroke="#2b1d1c" stroke-width="1.3"/>
  </g>
  ${tod === 'morning' ? '<g class="sc-fc-mist" fill="#ffffff" opacity=".6"><rect x="-1400" y="418" width="1640" height="9" rx="4.5"/><rect x="40" y="432" width="1720" height="7" rx="3.5"/><rect x="-1400" y="446" width="1620" height="6" rx="3"/></g>' : ''}
  ${fireflies ? `<g class="sc-fc-ff" fill="#fff7a0">${fireflies}</g>` : ''}
</svg>
${layer('sc-fc-base')}
  ${posts}
  <rect x="-1400" y="474" width="3160" height="7" fill="#3b2418"/><rect x="-1400" y="474" width="3160" height="2" fill="#5a3a26"/>
  <rect x="-1400" y="562" width="3160" height="480" fill="#2a1a12"/>
  <path d="M-1400 563H1760" stroke="#5a3a26" stroke-width="3"/>
  <path d="M-1400 590H1760M-1400 624H1760M-1400 666H1760M-1400 716H1760" stroke="#1c100a" stroke-width="2"/>
  <path d="M-1400 388H1760V399H-1400Z" fill="#4a2e1f"/><path d="M-1400 388H1760V391H-1400Z" fill="#6b4630"/><path d="M-1400 400H1760" stroke="#22140c" stroke-width="2"/>
  ${season === 'winter' ? '<path d="M-400 389V385Q-300 381-200 385T0 385T200 385T400 385T600 385T760 385V389Z" fill="#f4f7fb"/><path d="M-1400 385H-400V389H-1400ZM760 385H1760V389H760Z" fill="#f4f7fb"/><path d="M-400 563V559Q-200 556 0 559T400 559T760 559V563Z" fill="#e8eef6"/><path d="M-1400 559H-400V563H-1400ZM760 559H1760V563H760Z" fill="#e8eef6"/>' : ''}
  ${pal.shade ? `<rect x="-1400" y="384" width="3160" height="660" fill="#0b0f2a" opacity="${pal.shade}"/>` : ''}
  <path d="M-1400-400H1760V6H760Q180 24-400 6H-1400Z" fill="#2b1d1c"/>${rafters}<path d="M-1400 6H-400Q180 24 760 6H1760V12H760Q180 30-400 12H-1400Z" fill="#4a2e22"/>${season === 'winter' ? '<path d="M-1400 11H-400Q180 29 760 11H1760V15H760Q180 33-400 15H-1400Z" fill="#f4f7fb"/>' : ''}
</svg>
${layer('sc-fc-hang')}
  ${sideFurin}${sideLanterns}
  <g class="sc-fc-blow-tubes"><g class="sc-fc-tubes">
    <path d="M240 20v9M240 30v46" stroke="#3a2a22" stroke-width=".7"/>
    ${tubes}
    <ellipse cx="240" cy="30" rx="13" ry="2.6" fill="#4a2e22"/><ellipse cx="240" cy="29" rx="11" ry="1.2" fill="#6b4630"/>
    <ellipse cx="240" cy="50" rx="4.5" ry="1.5" fill="#5a3d2c"/>
    <rect x="236.5" y="76" width="7" height="14" fill="#fff5d8"/><path d="M236.5 76h7" stroke="#d23c2c" stroke-width="2"/>
  </g></g>
  <g class="sc-fc-blow-lantern"><g class="sc-fc-lantern">${lantern(326)}</g></g>
</svg>
${layer('sc-fc-near', ...NEAR)}
  <g clip-path="url(#sc-fc-under)"><g class="sc-fc-blow-branch">
    <g class="sc-branch" stroke="#3a2622" fill="none" stroke-linecap="round">${twigs.map(([d, w]) => `<path d="${d}" stroke-width="${f1(w)}"/>`).join('')}</g>
    ${season === 'winter' ? `<g stroke="#f4f7fb" fill="none" stroke-linecap="round" transform="translate(0 -1.6)">${twigs.filter(([, w]) => w > 1.6).map(([d, w]) => `<path d="${d}" stroke-width="${f1(w * 0.45)}"/>`).join('')}</g>` : ''}
    ${blossoms}
    <g fill="#e98aa6">${(season === 'spring' ? buds : []).map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.3"/>`).join('')}</g>
  </g></g>
</svg>
${layer('sc-fc-near', ...NEAR)}
  <g class="sc-petals">${petals}</g>
</svg>
${layer('sc-fc-top')}
  <g class="sc-fc-gust">${gust}</g>
  <g class="sc-fc-wind" fill="none" stroke="${night ? '#c9d4f2' : '#fffaf0'}" stroke-width="2" stroke-linecap="round">
    <path pathLength="100" d="M-140 128C-40 112 60 144 160 124S330 104 420 126q22 8 12 20q-10 8-18-2"/>
    <path pathLength="100" d="M-160 204C-60 190 40 220 140 200S300 184 400 204q18 8 8 18q-10 6-16-4" style="animation-delay:.12s"/>
    <path pathLength="100" d="M-120 300C-20 288 80 314 180 296S340 282 440 300" style="animation-delay:.24s"/>
  </g>
  <g class="sc-fc-tea" transform="translate(30 0)">
    <path d="M232 389L231 374Q240 371 249 374L248 389Q240 391 232 389Z" fill="#7d9c86"/><path d="M231 374Q240 371 249 374Q240 377 231 374Z" fill="#4f6b58"/>
    <path d="M232 380Q240 382 248 380" stroke="#e8ecd8" stroke-width="1.6" fill="none"/>
    <path class="sc-fc-steam" d="M237 368q-3-5 0-10t0-10" stroke="#fff8ea" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path class="sc-fc-steam" d="M243 368q3-5 0-10t0-10" stroke="#fff8ea" stroke-width="1.6" fill="none" stroke-linecap="round" style="animation-delay:-1.2s"/>
  </g>
  ${pal.glow > 0.3 ? `<ellipse cx="326" cy="392" rx="90" ry="9" fill="url(#sc-fc-glow)" opacity="${f1(pal.glow)}"/>` : ''}
  ${rays}
  ${gold ? `<circle cx="180" cy="356" r="64" fill="url(#sc-fc-gglow)" opacity=".75"/><g class="sc-fc-gold" fill="#fff3b0">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<path d="${star(180 + Math.cos(k * 0.785) * 52, 356 + Math.sin(k * 0.785) * 34, 4, 1.4)}" style="animation-delay:-${(k * 0.2).toFixed(1)}s"/>`).join('')}</g>` : ''}
  <ellipse cx="180" cy="385" rx="34" ry="5.5" fill="#f2efe6"/><ellipse cx="180" cy="384" rx="26" ry="3.4" fill="#dcd6c8"/>
  <ellipse cx="180" cy="381" rx="30" ry="2.6" fill="#6b4a2a" opacity=".3"/>
  <g class="sc-cookie">
    <g class="sc-ck-l"><g clip-path="url(#sc-fc-l)">
      ${COOKIE_ART}
    </g></g>
    <g class="sc-ck-r"><g clip-path="url(#sc-fc-r)">
      ${COOKIE_ART}
    </g></g>
    <path class="sc-crease" d="M180 370Q179 352 180 336" stroke="#7a4612" stroke-width="1" fill="none" opacity=".6"/>
    <path class="sc-tip" d="M172 368.5l14-1.6 1 6.2-14 1.6z" fill="#fffdf5"/><path class="sc-tip" d="M172 368.5l14-1.6" stroke="#d9cdb2" stroke-width=".6"/>
  </g>
  <g class="sc-crumbs" fill="#d9a050">${crumbs}</g>
  <g class="sc-hint"><g class="sc-hint-in">
    <rect x="48" y="412" width="264" height="36" rx="18" fill="#22140c" opacity=".78"/>
    <text x="180" y="436" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#fff6e0">${t('Торкніться, щоб розламати')}</text>
  </g></g>
  <g transform="translate(180 250)"><g class="sc-slip">
    <g class="sc-twinkles" fill="#fff1c4">${twinkles}</g>
    <rect x="-88" y="${f1(top)}" width="176" height="${f1(slipH)}" rx="2" fill="#fffdf5"${gold ? ' stroke="#d9a520" stroke-width="2"' : ''}/>
    <path d="M-88 ${f1(top)}h176" stroke="#e8e0cc" stroke-width="1"/>
    <g text-anchor="middle" font-family="system-ui, sans-serif" font-size="10.5" font-weight="700" fill="#3a2a1c">${slipText}</g>
    <path d="M-60 ${f1(top + slipH - 19)}h120" stroke="#eadfc8" stroke-width=".8"/>
    <text y="${f1(top + slipH - 7)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="6.5" font-weight="700" fill="#b8322a" letter-spacing=".04em">${t('Щасливі числа').toUpperCase()}: <tspan font-family="ui-monospace, monospace" fill="#3a2a1c">${lucky.join(' · ')}</tspan></text>
  </g></g>
</svg>`;
}

const SCENES = {
  defenders: { svg: defendersHome, text: () => t('З Днем захисників і захисниць!\nНам тепло вдома — бо ви на варті') },
  // params — передбачення обирається раз на показ: «Повторити» показує те саме
  fortune: { svg: fortuneCookie, tap: true, params: fortuneParams, onTap: (p = {}) => crackFeedback(p.gold), mount: fortuneTilt,
    text: (p = {}) => `${t(p.gold ? 'Золоте печиво' : 'Печиво з передбаченням')}\n${fortuneText(p)}` },
  sobornist: { svg: sobornist, text: () => t('З Днем Соборності!\nРазом — незламні') },
  birthday: {
    svg: birthday,
    text: (p = {}) => [t('З днем народження, {name}!', { name: p.name ?? '' }), [p.age, p.shots].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
  },
  independence: { svg: independence, text: () => t('З Днем Незалежності!\nСлава Україні!') },
  halloween: { svg: halloween, text: () => t('З Гелловіном!') },
  snowman: { svg: snowman, text: () => t('Зустрічаємо {year}!\nВистоїмо!', { year: comingYear() }) },
  newyear: { svg: newYear, text: () => (isNewYearDay() ? t('З Новим роком!') : t('Зустрічаємо {year}!', { year: comingYear() })) },
};

/** Програти сценку name; повертає false, якщо такої нема. */
// Розлам печива: бамбукові вітряні дзвіночки — трубки від подуву стукаються одна об одну, — і вібрація;
// золоте — довший перестук, що йде вгору. Звук синтезується тут же, без файлів; грає лише після дотику — браузер раніше й не дасть.
export const SCENE_SOUND_OFF = 'shooters-log:scene-sound-off';
let audio = null;
let noise = null;

// Пентатоніка G4 A4 C5 D5 E5 (бамбук звучить нижче за метал); удар — [час, нота, сила]; парами — трубки стукаються двічі
const KNOCK_NOTES = [392, 440, 523.3, 587.3, 659.3];
const KNOCKS = [[0, 2, 1], [0.06, 3, 0.55], [0.2, 1, 0.75], [0.27, 4, 0.45], [0.46, 0, 0.6], [0.53, 2, 0.35], [0.78, 3, 0.3]];
const KNOCKS_GOLD = [[0, 0, 1], [0.07, 1, 0.8], [0.14, 2, 0.85], [0.22, 3, 0.8], [0.27, 2, 0.45],
  [0.36, 4, 0.85], [0.44, 3, 0.5], [0.56, 5, 0.8], [0.63, 4, 0.45], [0.84, 5, 0.55]];

function crackFeedback(gold) {
  navigator.vibrate?.(gold ? [16, 50, 16, 50, 30] : [20, 60, 14]);
  try {
    if (localStorage.getItem(SCENE_SOUND_OFF) === '1') return;
  } catch { /* сховище недоступне — звук як за замовчуванням */ }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    audio ??= new Ctx();
    if (audio.state === 'suspended') audio.resume();
    const out = audio.createGain();
    out.gain.value = 0.2;
    out.connect(audio.destination);
    const t0 = audio.currentTime + 0.02;
    // нота 5 — ля октавою вище: золотий перестук закінчується вище, ніж почався
    for (const [at, note, vel] of gold ? KNOCKS_GOLD : KNOCKS) {
      knock(note === 5 ? KNOCK_NOTES[1] * 2 : KNOCK_NOTES[note], t0 + at, vel, out);
    }
  } catch { /* без звуку — вібрації досить */ }
}

/** Шум для «стуку» — один на весь звук, 60 мс. */
function noiseBuffer() {
  if (noise?.sampleRate === audio.sampleRate) return noise;
  noise = audio.createBuffer(1, Math.round(audio.sampleRate * 0.06), audio.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/**
 * Удар бамбукової трубки: порожниста дерев'яна нота гасне за пів секунди, вищі тони — швидше;
 * на початку — короткий стук (шум у резонансі трубки) і ледь вищий тон, що одразу сідає.
 */
function knock(freq, at, vel, out) {
  for (const [ratio, level, decay] of [[1, 0.8, 0.5], [2.01, 0.22, 0.22], [3.03, 0.08, 0.1]]) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    osc.frequency.setValueAtTime(freq * ratio * 1.035, at);
    osc.frequency.exponentialRampToValueAtTime(freq * ratio, at + 0.04);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level * vel, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
  for (const [ratio, q, level, decay] of [[1, 6, 0.6, 0.06], [2.5, 3, 0.25, 0.025]]) {
    const src = audio.createBufferSource();
    const bp = audio.createBiquadFilter();
    const g = audio.createGain();
    src.buffer = noiseBuffer();
    bp.type = 'bandpass';
    bp.frequency.value = freq * ratio;
    bp.Q.value = q;
    g.gain.setValueAtTime(level * vel, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(bp).connect(g).connect(out);
    src.start(at);
    src.stop(at + decay + 0.01);
  }
}

/**
 * Печиво: об'єм від нахилу телефона (на комп'ютері — від миші). Веранда — вісь: далеке й середнє зсуваються
 * в один бік (далеке сильніше), гілка й пелюстки попереду — у протилежний.
 * Зсуваються цілі шари-svg (transform на елементі — його робить відеокарта, без перемальовування);
 * «Повторити» малює шари наново — зсув тут же ставиться й на нові. Повертає прибирання.
 * Без руху (prefers-reduced-motion) шари не зсуваються й не збільшуються — CSS лишає їх розміром з екран.
 */
const FIT_PAD = 40;
function fortuneTilt(el) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let base = null;
  let frame = 0;
  let last = 0;
  const cur = { x: 0, y: 0 };
  const goal = { x: 0, y: 0 };
  const layers = el.getElementsByClassName('sc-fc-layer');
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  // рухомий шар на 40px (FIT_PAD, як у CSS) більший за екран з кожного боку — розширюємо й viewBox на стільки ж
  // одиниць малюнка, тоді масштаб і центр збігаються з нерухомими шарами
  const fit = () => {
    const pad = FIT_PAD / Math.min((el.clientWidth || innerWidth) / 360, (el.clientHeight || innerHeight) / 640);
    if (!Number.isFinite(pad)) return;
    const box = `${f1(-pad)} ${f1(-pad)} ${f1(360 + 2 * pad)} ${f1(640 + 2 * pad)}`;
    for (const l of layers) if (l.dataset.dx) l.setAttribute('viewBox', box);
  };
  const apply = () => {
    for (const l of layers) {
      if (l.dataset.dx) l.style.transform = `translate3d(${(cur.x * l.dataset.dx).toFixed(2)}px, ${(cur.y * l.dataset.dy).toFixed(2)}px, 0)`;
    }
  };
  // датчик шле десятки подій на секунду й тремтить — зсув щокадру лише наздоганяє ціль, тож рух плавний;
  // крок за часом, а не за кадром: на 60 і 120 Гц однаково (≈0,25 с на дві третини шляху)
  const step = (now) => {
    const k = 1 - Math.exp(-Math.min(now - (last || now - 16), 100) / 250);
    last = now;
    cur.x += (goal.x - cur.x) * k;
    cur.y += (goal.y - cur.y) * k;
    const done = Math.abs(goal.x - cur.x) < 0.002 && Math.abs(goal.y - cur.y) < 0.002;
    if (done) Object.assign(cur, goal);
    apply();
    frame = done ? 0 : requestAnimationFrame(step);
    if (done) last = 0;
  };
  // тремтіння руки (менше ≈0,7°) ціль не зсуває: спокійно тримаєш — сцена теж стоїть
  const aim = (x, y) => {
    const nx = -clamp(x), ny = -clamp(y);
    if (Math.abs(nx - goal.x) < 0.03 && Math.abs(ny - goal.y) < 0.03) return;
    goal.x = nx;
    goal.y = ny;
    frame ||= requestAnimationFrame(step);
  };
  const redraw = new MutationObserver(() => { fit(); apply(); });
  redraw.observe(el.firstElementChild ?? el, { childList: true });
  addEventListener('resize', fit);
  // нахил уперед-назад рахуємо від того, як телефон тримали на початку
  const onTilt = (e) => {
    if (e.gamma == null || e.beta == null) return;
    base ??= e.beta;
    aim(Math.abs(e.gamma) < 1.5 ? 0 : e.gamma / 22, (e.beta - base) / 22);
  };
  const onMove = (e) => { if (e.pointerType === 'mouse') aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); };
  addEventListener('deviceorientation', onTilt);
  el.addEventListener('pointermove', onMove);
  return () => {
    cancelAnimationFrame(frame);
    redraw.disconnect();
    removeEventListener('resize', fit);
    removeEventListener('deviceorientation', onTilt);
    el.removeEventListener('pointermove', onMove);
  };
}

export function playScene(name, params) {
  const s = SCENES[name];
  if (!s) return false;
  // свої params сценки (випадкові) + передані ззовні (?i= для перегляду, дані дня народження)
  params = s.params ? { ...s.params(), ...params } : params;
  const el = document.createElement('div');
  el.className = `scene scene-${name}`;
  const stage = document.createElement('div');
  const button = (label, kind, onclick) => Object.assign(document.createElement('button'), { type: 'button', className: `btn ${kind}`, textContent: label, onclick });
  const bar = document.createElement('div');
  bar.className = 'scene-bar';
  // «Повторити» — те саме печиво й те саме передбачення: перебрати всі, тапаючи «ще раз», не можна
  bar.append(button(t('Повторити'), '', () => play()), button(t('Закрити'), 'primary', () => close()));
  el.append(stage, bar);
  // скінченні анімації кадру; нескінченні (сніг, крила) лишаються жити й на останньому кадрі
  const finite = () => el.getAnimations({ subtree: true }).filter(isFinite);
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
    // сценка з tap (печиво) стоїть на паузі, доки людина сама не торкнеться — не мультик, а дія
    if (s.tap) {
      el.classList.add('wait');
      stage.getAnimations({ subtree: true }).filter(isFinite).forEach((a) => a.pause());
    }
    Promise.all(finite().map((a) => a.finished)).then(() => id === run && end(), () => {});
  };
  const isFinite = (a) => a.effect?.getComputedTiming().endTime !== Infinity;
  const start = () => {
    el.classList.remove('wait');
    if (s.onTap) s.onTap(params);
    else navigator.vibrate?.(18);
    stage.getAnimations({ subtree: true }).forEach((a) => a.play());
  };
  // Сама не закривається: перший тап по сценці з tap — запуск, далі тап — одразу останній кадр, потім лише «Закрити»
  stage.addEventListener('pointerdown', () => (el.classList.contains('wait') ? start() : finite().forEach((a) => a.finish())));
  const close = () => {
    if (el.classList.contains('out')) return;
    run++;
    el.classList.add('out');
    unmount?.();
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 400);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if ((e.key === 'Enter' || e.key === ' ') && el.classList.contains('wait')) { e.preventDefault(); start(); }
  };
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  // живе поза кадром (нахил, миша) — одне на всю сценку, прибирається в close
  const unmount = s.mount?.(el);
  play();
  return true;
}
