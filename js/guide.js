// Довідник стрілка: розділи курсу з guide/marksman.uk.html, калькулятор мил і тренажер сітки.
import { t, lang, locale } from './i18n.js';
import { solve, airRatio } from './ballistics.js';
import { MASKS, MASK_CELL } from './masks.js';
import { wheelStrip, chips, toolBtn } from './ui.js';

const cached = new Map();

/** Текст курсу (marksman, reloading) — українською; кешується на сесію (офлайн його віддає service worker). */
export function loadGuide(kind = 'marksman') {
  const file = `./guide/${kind}.uk.html`;
  if (!cached.has(file)) {
    cached.set(file, fetch(file).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }).catch((err) => { cached.delete(file); throw err; }));
  }
  return cached.get(file);
}

/** Розділи фрагмента: { id, num, title, body } — body без заголовка h2. */
export function parseGuide(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const sections = [...tpl.content.querySelectorAll('section[id]')].map((s) => {
    const h2 = s.querySelector('h2');
    const num = h2?.querySelector('.n')?.textContent ?? '';
    h2?.querySelector('.n')?.remove();
    const title = h2?.textContent.trim() ?? s.id;
    h2?.remove();
    const body = document.createElement('div');
    body.className = 'guide-sec';
    body.append(...s.childNodes);
    return { id: s.id, num, title, body };
  });
  return { sections, foot: tpl.content.querySelector('.guide-foot') };
}

// toLocaleString щоразу створює Intl.NumberFormat — це дорого, коли приціл перемальовується на кожен рух пальця.
// Готові форматери — на мову й кількість знаків (мову можна змінити без перезапуску)
const NF = new Map();
const nf = (min, max) => {
  const key = `${locale()}|${min}|${max}`;
  let n = NF.get(key);
  if (!n) { n = new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: max }); NF.set(key, n); }
  return n;
};
const f = (x, d) => nf(d, d).format(x);
const fm = (m) => f(m, m % 1 ? 1 : 0);
// Розмір цілі: 1,85 — до сотих, 0,5 — до десятих, 2 — ціле
const sizeTxt = (m) => f(m, Math.round(m * 100) % 10 ? 2 : m % 1 ? 1 : 0);
// Швидкість цілі на кнопці «Рух» — як її кажуть: крок, біг, авто в км/год
const MOVE_SHORT = { 1.4: 'крок', 3.5: 'біг', 8.3: '30 км/год', 13.9: '50 км/год' };
/** Розмір у метрах без зайвих нулів і без округлення до десятої: 1,45 · 0,25 · 1. */
const mFmt = (m) => nf(0, 2).format(m);

/** Три калькулятори розділу «Калькулятор мил». */
export function initCalc(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  if (!$('r-out')) return;
  const v = (id) => { const x = parseFloat($(id).value); return Number.isFinite(x) ? x : NaN; };
  const range = () => {
    const s = v('r-size'); const m = v('r-mil'); const o = $('r-out');
    if (!(s > 0 && m > 0)) { o.innerHTML = `<small>${t('Уведіть розмір і кут у MRAD більші за нуль')}</small>`; return; }
    o.innerHTML = `≈ ${f(s * 1000 / m, 0)} ${t('м')}<small>${t('дальність = розмір × 1000 ÷ MRAD')}</small>`;
  };
  const clicks = () => {
    const c = v('c-cm'); const d = v('c-d'); const o = $('c-out');
    if (!(c >= 0 && d > 0)) { o.innerHTML = `<small>${t('Уведіть відхилення й дистанцію')}</small>`; return; }
    const mil = c * 10 / d; const moa = c / (d / 100) / 2.908;
    o.innerHTML = `${f(mil, 2)} MRAD → ${t('{n} кл. по 0,1', { n: Math.round(mil * 10) })}`
      + `<small>${f(moa, 2)} MOA → ${t('{n} кл. по ¼ MOA', { n: Math.round(moa * 4) })}</small>`;
  };
  const lead = () => {
    const s = v('l-v'); const tm = v('l-t'); const d = v('l-d'); const o = $('l-out');
    if (!(s >= 0 && tm >= 0 && d > 0)) { o.innerHTML = `<small>${t('Уведіть швидкість, час і дистанцію')}</small>`; return; }
    o.innerHTML = `${f(s * tm * 1000 / d, 1)} ${t('MRAD уперед')}<small>${t('{v} м за ходом руху', { v: f(s * tm, 2) })}</small>`;
  };
  ['r-size', 'r-mil'].forEach((i) => $(i).addEventListener('input', range));
  ['c-cm', 'c-d'].forEach((i) => $(i).addEventListener('input', clicks));
  ['l-v', 'l-t', 'l-d'].forEach((i) => $(i).addEventListener('input', lead));
  range(); clicks(); lead();
}

// ---------- сітки прицілів ----------

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

function mk(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, val);
  parent?.appendChild(el);
  return el;
}

// Сітка DSMR у мілах (на 6×): нитка 0,18, стовпи 0,5 від 14 міл, мітки через 1 міл.
function dsmr(g, R, E = R) {
  const t = 0.18;
  mk('line', { x1: -14, y1: 0, x2: 14, y2: 0, class: 'r-l', 'stroke-width': t }, g);
  mk('line', { x1: 0, y1: -E, x2: 0, y2: 14, class: 'r-l', 'stroke-width': t }, g);
  mk('line', { x1: -E, y1: 0, x2: -14, y2: 0, class: 'r-l', 'stroke-width': 0.5 }, g);
  mk('line', { x1: 14, y1: 0, x2: E, y2: 0, class: 'r-l', 'stroke-width': 0.5 }, g);
  mk('line', { x1: 0, y1: 14, x2: 0, y2: E, class: 'r-l', 'stroke-width': 0.5 }, g);
  const mark = (x, y, onH, i) => {
    if (i % 2) {
      if (onH) mk('line', { x1: x, y1: -0.4, x2: x, y2: 0.4, class: 'r-l', 'stroke-width': t }, g);
      else mk('line', { x1: -0.4, y1: y, x2: 0.4, y2: y, class: 'r-l', 'stroke-width': t }, g);
    } else mk('circle', { cx: x, cy: y, r: 0.2, class: 'r-d' }, g);
  };
  for (let i = 1; i <= 10; i++) {
    mark(i, 0, true, i); mark(-i, 0, true, i); mark(0, i, false, i);
    if (i <= 4) mark(0, -i, false, i);
  }
  mk('circle', { cx: 0, cy: 0, r: 0.2, class: 'r-ill' }, g);
}

// Ballistic Plex у MOA (на 7×): нитка 0,26, стовпи 0,69 MOA, бічні та верхній від 5, нижній від 14,8.
// Кінці стовпів — за кресленням інструкції в масштабі (≈4,9–5,3 MOA) і за тим, як сітка виглядає в прицілі;
// таблиця Burris (W 6,1″) дала б 2,9 MOA, але з кресленням і реальним прицілом це не сходиться.
function bplex(g, R, E = R) {
  const t = 0.26; const p = 0.69; const s = 5;
  mk('line', { x1: -s, y1: 0, x2: s, y2: 0, class: 'r-l', 'stroke-width': t }, g);
  mk('line', { x1: 0, y1: -s, x2: 0, y2: 14.8, class: 'r-l', 'stroke-width': t }, g);
  const post = (x0, y0, x1, y1) => {
    const dx = x1 - x0; const dy = y1 - y0; const L = Math.hypot(dx, dy);
    const nx = -dy / L; const ny = dx / L; const a = p / 2; const b = p * 1.6;
    mk('polygon', {
      points: [x0 + nx * a, y0 + ny * a, x0 + dx * 0.12 + nx * b, y0 + dy * 0.12 + ny * b, x1 + nx * b, y1 + ny * b,
        x1 - nx * b, y1 - ny * b, x0 + dx * 0.12 - nx * b, y0 + dy * 0.12 - ny * b, x0 - nx * a, y0 - ny * a].join(' '),
      class: 'r-d',
    }, g);
  };
  post(s, 0, E, 0); post(-s, 0, -E, 0); post(0, -s, 0, -E); post(0, 14.8, 0, E);
  [2.0, 5.9, 9.9].forEach((y) => mk('rect', { x: -0.55, y: y - 0.2, width: 1.1, height: 0.4, rx: 0.2, class: 'r-d' }, g));
}

// Trijicon ACOG 4x32 TA31F (.223 Chevron): усе в MOA від вершини шеврона (пристрілка нею на 100 м), за кресленням Trijicon
// «ACOG 4x32 .223 Chevron Reticle»: шеврон 5,5 завширшки, 4,1 заввишки, промінь 1,1; пеньок 0,4 з 4,4 (300 м);
// риски 400–800 м на 7,8 / 12,6 / 18,7 / 26,4 / 35,8 завширшки 4,2 / 3,3 / 2,8 / 2,4 / 2,1 — це 19″ (плечі) на своїй дистанції
const ACOG_BARS = [[7.8, 4.2, '4'], [12.6, 3.3], [18.7, 2.8, '6'], [26.4, 2.4], [35.8, 2.1]];
function acog(g) {
  mk('polygon', { points: '0,0 2.75,4.1 1.42,4.1 0,2 -1.42,4.1 -2.75,4.1', class: 'r-chev' }, g);
  mk('rect', { x: -0.2, y: 4.4, width: 0.4, height: 31.6, class: 'r-d' }, g);
  for (const [y, w, n] of ACOG_BARS) {
    mk('rect', { x: -w / 2, y: y - 0.2, width: w, height: 0.4, class: 'r-d' }, g);
    if (n) mk('text', { x: 3.6, y: y + 1.6, class: 'r-chev-n' }, g).textContent = n;
  }
}

// Vortex AR-BDC3 MOA (друга фокальна площина, Strike Eagle 1–6×) — за векторним кресленням інструкції Vortex M-00281-3
// «Subtension Chart»: точка ⌀1, кільце ⌀16,625 (по осі) завтовшки 1,275 — дуги −40…40° і 70…108° з боків; лінії 0,25.
// Вертикаль униз 2,27–17,16; риски через кожні 50 ярдів: 300/400/500/600 — 2,8 / 2,1 / 1,7 / 1,4 завширшки на 2,4 / 5,6 / 9,5 / 14,5,
// короткі 0,74 на 3,9 / 7,4 / 11,8 / 17,0. Точки вітру ⌀0,5 — 5, 10, 15 миль/год на своїй лінії. Бічні й нижній стовпи — з 32,4.
// Угорі — далекомір: база на −23,9 (2 MOA), лінії плечей 18″ на 300–600 ярдів (5,7 / 4,2 / 3,4 / 2,8) — верх мішені 40″
const BDC3_WIND = [[2.395, [3.29, 4.98]], [5.575, [2.39, 4.78, 7.07]], [9.465, [3.19, 6.37, 9.56]], [14.545, [4.08, 8.07, 12.25]]];
const BDC3_HASH = [[2.395, 2.78], [3.885, 0.74], [5.575, 2.1], [7.375, 0.74], [9.465, 1.7], [11.755, 0.74], [14.545, 1.4], [17.035, 0.74]];
const BDC3_MARKS = [[0, 'точка'], [2.4, 'риска 300 ярдів (2,4)'], [3.9, 'коротка 350 ярдів (3,9)'], [5.6, 'риска «4» (5,6)'], [7.4, 'коротка 450 ярдів (7,4)'],
  [9.5, 'риска «5» (9,5)'], [11.8, 'коротка 550 ярдів (11,8)'], [14.5, 'риска «6» (14,5)'], [17.0, 'низ вертикалі, 650 ярдів (17,0)']];
function arbdc3(g, R, E = R) {
  const lw = 0.25;
  const ln = (x1, y1, x2, y2, w = lw) => mk('line', { x1, y1, x2, y2, class: 'r-l', 'stroke-width': w }, g);
  const num = (x, y, txt, anchor = 'middle') => { mk('text', { x, y, class: 'r-num', 'text-anchor': anchor }, g).textContent = txt; };
  // Стовпи: вістря на 32,37, до краю поля розширюються до 1,2 (як на кресленні), далі рівні
  const post = (dx, dy) => {
    const a = 32.37; const b = Math.max(a + 0.1, E); const w = (r) => 0.6 * Math.min(1, (r - a) / 7.47);
    const P = (r, s) => (dx ? [dx * r, s * w(r)] : [s * w(r), dy * r]);
    const pts = [P(a, 0), P(Math.min(b, 39.84), 1), P(b, 1), P(b, -1), P(Math.min(b, 39.84), -1)];
    mk('polygon', { points: pts.map((q) => q.join(',')).join(' '), class: 'r-d' }, g);
  };
  post(1, 0); post(-1, 0); post(0, 1);
  // Вертикаль і риски дальності
  ln(0, 2.27, 0, 17.16, 0.24);
  for (const [y, w] of BDC3_HASH) ln(-w / 2, y, w / 2, y);
  for (const [y, xs] of BDC3_WIND) for (const x of xs) { mk('circle', { cx: x, cy: y, r: 0.25, class: 'r-d' }, g); mk('circle', { cx: -x, cy: y, r: 0.25, class: 'r-d' }, g); }
  num(-9.27, 6.4, '4'); num(9.27, 6.4, '4'); num(-11.7, 10.3, '5'); num(11.7, 10.3, '5'); num(-14.54, 15.4, '6'); num(14.54, 15.4, '6');
  num(-8.87, 18.4, '10'); num(8.87, 18.4, '10');
  // Далекомір угорі: база, вертикаль і лінії плечей
  ln(-1, -23.905, 1, -23.905);
  ln(0, -36.67, 0, -30.05, 0.24);
  for (const [y, w] of [[-36.545, 5.68], [-33.365, 4.18], [-31.465, 3.38], [-30.175, 2.78]]) ln(-w / 2, y, w / 2, y);
  num(4.33, -36.0, '3', 'start'); num(-3.6, -32.85, '4', 'end'); num(3.2, -30.9, '5', 'start'); num(-2.84, -29.6, '6', 'end');
  // Точка й розірване кільце — підсвічені червоним
  const arc = (a0, a1) => {
    const p = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
    const [ri, ro] = [7.69, 8.96]; const big = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = p(ro, a0); const [x1, y1] = p(ro, a1); const [x2, y2] = p(ri, a1); const [x3, y3] = p(ri, a0);
    mk('path', { d: `M${x0} ${y0}A${ro} ${ro} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${big} 0 ${x3} ${y3}Z`, class: 'r-chev' }, g);
  };
  arc(-40, 40); arc(70, 108); arc(-108, -70);
  mk('circle', { cx: 0, cy: 0, r: 0.5, class: 'r-chev' }, g);
}

// Primary Arms ACSS Raptor 5.56 (перша фокальна площина, SLx 1–6×24 FFP) — за векторними кресленнями інструкції PA (2019);
// масштаб — з неї ж: риски дальності й основа шеврона — мішень 18″ на 300/400/500/600 ярдів (5,73 / 4,30 / 3,44 / 2,86 MOA).
// Шеврон 5,73 × 2,87 (плечі 45°, всередині з 1,25); риски під вершиною: 200 — 1,43 (середина шеврона), 300 — 2,87 (основа),
// 400 — 6,0, 500 — 9,65, 600 — 14,15 (нижня); стебло 0,5 від 3,02. Точки вітру ⌀0,5 — 5 і 10 миль/год: 400 — 4,3 (лише 10),
// 500 — 2,8 / 5,6, 600 — 3,6 / 7,2. Підкова ⌀35,9 (зовні) завтовшки 4,0 з центром на вершині — передній край для цілі 8,6 миль/год
const RAPTOR_MARKS = [[0, 'вершина шеврона'], [1.43, 'середина шеврона (200 ярдів)'], [2.87, 'основа шеврона (300 ярдів)'],
  [6.0, 'риска 400 ярдів'], [9.65, 'риска 500 ярдів'], [14.15, 'нижня риска 600 ярдів']];
function raptor(g) {
  mk('polygon', { points: '0,0 2.87,2.87 1.62,2.87 0,1.25 -1.62,2.87 -2.87,2.87', class: 'r-chev' }, g);
  mk('polygon', { points: '0,3.02 0.25,3.27 0.25,14.4 -0.25,14.4 -0.25,3.27', class: 'r-chev' }, g);
  for (const [y, w] of [[5.99, 4.3], [9.65, 3.44], [14.15, 2.86]]) mk('rect', { x: -w / 2, y: y - 0.25, width: w, height: 0.5, class: 'r-chev' }, g);
  for (const [y, xs] of [[5.99, [4.3]], [9.65, [2.8, 5.6]], [14.15, [3.6, 7.2]]]) {
    for (const x of xs) { mk('circle', { cx: x, cy: y, r: 0.25, class: 'r-chev' }, g); mk('circle', { cx: -x, cy: y, r: 0.25, class: 'r-chev' }, g); }
  }
  // Підкова: кільце 13,94–17,94 навколо вершини, розрив знизу ±45°
  const p = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
  const [ri, ro] = [13.94, 17.94];
  const [x0, y0] = p(ro, -135); const [x1, y1] = p(ro, 135); const [x2, y2] = p(ri, 135); const [x3, y3] = p(ri, -135);
  mk('path', { d: `M${x0} ${y0}A${ro} ${ro} 0 1 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 1 0 ${x3} ${y3}Z`, class: 'r-chev' }, g);
}

// Vortex VMR-2 MRAD (друга фокальна площина, Viper PST Gen II 1–6×24) — за векторним кресленням інструкції Vortex M-00367-0:
// нитки 0,15; мітки через 1 мил — по горизонталі 1–4, униз 1–7, короткі 0,65 і довгі 1,0 через одну (довгі на парних);
// бічні й нижній стовпи 0,5 від 11 мил; угорі стовпа нема — тонка нитка до краю
function vmr2(g, R, E = R) {
  const t = 0.15;
  const ln = (x1, y1, x2, y2, w = t) => mk('line', { x1, y1, x2, y2, class: 'r-l', 'stroke-width': w }, g);
  ln(-11, 0, 11, 0); ln(0, -E, 0, 11);
  ln(-E, 0, -11, 0, 0.5); ln(11, 0, E, 0, 0.5); ln(0, 11, 0, E, 0.5);
  for (let i = 1; i <= 7; i++) {
    const h = i % 2 ? 0.325 : 0.5;
    ln(-h, i, h, i);
    if (i <= 4) { ln(i, -h, i, h); ln(-i, -h, -i, h); }
  }
  mk('circle', { cx: 0, cy: 0, r: 0.075, class: 'r-chev' }, g);
}

// SIG Tango6T DVO 1–6×24 FFP, сітка DWLR-6 (Hellfire DWLR-556) — за таблицею «DWLR-6 Reticle Subtensions» інструкції SIG
// 7401308 R04, у мілах: точка ⌀0,15, підкова ⌀1,25/2,25 з розривом 0,75 знизу; стебло 0,13; риски 300–1000 м — ширина 18″
// на своїй дистанції, товщина 0,15; між ними точки ⌀0,3 на стеблі; точки вітру 5 і 10 миль/год; трикутники упередження 3/6/9;
// бічні стовпи з 15, нижній — під кінцем стебла. Пристрілка 100 м
const DWLR_HASH = [[1.79, 0.76], [3.08, 0.57], [4.57, 0.46], [6.29, 0.38], [8.26, 0.33], [10.54, 0.29], [13.19, 0.25], [16.24, 0.23]];
const DWLR_WIND = [[1.79, [0.8]], [3.08, [1.11]], [4.57, [0.72, 1.45]], [6.29, [0.92, 1.83]], [8.26, [1.12, 2.24]], [10.54, [1.35, 2.7]],
  [13.19, [1.6, 3.2]], [16.24, [1.84, 3.68]]];
const DWLR_DOTS = [1.21, 2.41, 3.8, 5.4, 7.24, 9.36, 11.81, 14.66];
const DWLR_MARKS = [[0, 'точка'], [0.7, 'коротка риска (0,7)'], [1.79, 'риска «3» (300 м)'], [2.41, 'точка 350 м'], [3.08, 'риска 400 м'],
  [3.8, 'точка 450 м'], [4.57, 'риска «5» (500 м)'], [5.4, 'точка 550 м'], [6.29, 'риска 600 м'], [7.24, 'точка 650 м'], [8.26, 'риска «7» (700 м)'],
  [9.36, 'точка 750 м'], [10.54, 'риска 800 м'], [11.81, 'точка 850 м'], [13.19, 'риска «9» (900 м)'], [14.66, 'точка 950 м'], [16.24, 'низ стебла (1000 м)']];
function dwlr(g, R, E = R) {
  const ln = (x1, y1, x2, y2, w) => mk('line', { x1, y1, x2, y2, class: 'r-l', 'stroke-width': w }, g);
  const num = (x, y, txt) => { mk('text', { x, y, class: 'r-num dwlr-num', 'text-anchor': 'start' }, g).textContent = txt; };
  ln(0, 0.27, 0, 16.24, 0.13);
  ln(-0.15, 0.7, 0.15, 0.7, 0.15);
  for (const [y, h] of DWLR_HASH) ln(-h, y, h, y, 0.15);
  for (const y of DWLR_DOTS) mk('circle', { cx: 0, cy: y, r: 0.15, class: 'r-d' }, g);
  for (const [y, xs] of DWLR_WIND) for (const x of xs) { mk('circle', { cx: x, cy: y, r: 0.15, class: 'r-d' }, g); mk('circle', { cx: -x, cy: y, r: 0.15, class: 'r-d' }, g); }
  num(1.2, 2.15, '3'); num(1.8, 4.95, '5'); num(2.6, 8.65, '7'); num(3.5, 13.6, '9');
  // Трикутники упередження: ліві дивляться праворуч, праві — ліворуч
  for (const x of [3, 6, 9]) {
    mk('polygon', { points: `${-x},0 ${-x - 0.39},-0.225 ${-x - 0.39},0.225`, class: 'r-d' }, g);
    mk('polygon', { points: `${x},0 ${x + 0.39},-0.225 ${x + 0.39},0.225`, class: 'r-d' }, g);
  }
  // Бічні стовпи — з 15 (за таблицею SIG); нижній — нижче кінця стебла (16,24), щоб не закривав риску 1000 м
  const post = (dx, dy) => {
    const a = dy ? 17.5 : 15; const b = Math.max(a + 0.1, E);
    const P = (r, s) => (dx ? [dx * r, s] : [s, dy * r]);
    mk('polygon', { points: [P(a, 0), P(a + 0.6, 0.3), P(b, 0.3), P(b, -0.3), P(a + 0.6, -0.3)].map((q) => q.join(',')).join(' '), class: 'r-d' }, g);
  };
  post(1, 0); post(-1, 0); post(0, 1);
  // Підкова: кільце 0,625–1,125 з розривом знизу 0,75 (±25°) і точка
  const p = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
  const [ri, ro] = [0.625, 1.125];
  const [x0, y0] = p(ro, -155); const [x1, y1] = p(ro, 155); const [x2, y2] = p(ri, 155); const [x3, y3] = p(ri, -155);
  mk('path', { d: `M${x0} ${y0}A${ro} ${ro} 0 1 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 1 0 ${x3} ${y3}Z`, class: 'r-chev' }, g);
  mk('circle', { cx: 0, cy: 0, r: 0.075, class: 'r-chev' }, g);
}

// Leupold AR-Ballistic (друга фокальна площина, Mark 3HD 1,5–4×20) — за кресленням Leupold «AR-Ballistic Mark 3HD», у мілах:
// тонкі нитки 0,14, товсті стовпи 0,41 з усіх боків від 4,24; під центром риски на 0,84 / 1,30 / 1,81 / 2,35 / 2,95 завширшки
// 0,75 / 0,50 / 1,00 / 0,50 / 1,38. Справжні на найбільшій кратності 4×; Leupold радить пристрілку 200 ярдів, точки до 600
const LP_HASH = [[0.84, 0.75], [1.30, 0.5], [1.81, 1.0], [2.35, 0.5], [2.95, 1.38]];
const LP_MARKS = [[0, 'перехрестя'], ...LP_HASH.map(([y], i) => [y, `риска ${i + 1} (${String(y).replace('.', ',')})`])];
function lpar(g, R, E = R) {
  const ln = (x1, y1, x2, y2, w) => mk('line', { x1, y1, x2, y2, class: 'r-l', 'stroke-width': w }, g);
  ln(-4.24, 0, 4.24, 0, 0.14); ln(0, -4.24, 0, 4.24, 0.14);
  for (const [y, w] of LP_HASH) ln(-w / 2, y, w / 2, y, 0.15);
  // Стовпи зі скошеним кінцем, як на кресленні
  const post = (dx, dy) => {
    const a = 4.24; const b = Math.max(a + 0.1, E);
    const P = (r, s) => (dx ? [dx * r, s] : [s, dy * r]);
    mk('polygon', { points: [P(a, 0.07), P(a + 0.6, 0.205), P(b, 0.205), P(b, -0.205), P(a + 0.6, -0.205), P(a, -0.07)].map((q) => q.join(',')).join(' '), class: 'r-d' }, g);
  };
  post(1, 0); post(-1, 0); post(0, 1); post(0, -1);
}

// Vortex EBR-2C MRAD (перша фокальна площина) — за інструкцією Vortex «EBR-2C Reticle MRAD»: нитки 0,03 (у прицілі тонші за
// піксель — малюємо щонайменше 0,35 % поля), відкритий центр 0,06; горизонталь до 9,1, далі пеньки 0,6; верхній і нижній
// масштаб: ціла риска 0,6, половинна 0,4, на 5–9 ще дрібні через 0,2 (0,2 завдовжки); униз — лінії 1–10 з точками вітру
// через 0,5 (ціла 0,09, половинна 0,06) на ±2, ±2, ±3, ±3 … ±6; нижній пеньок з 11
function ebr(g, R, E = R) {
  const t = Math.max(0.03, R * 0.0035);
  const ln = (x1, y1, x2, y2, w = t) => mk('line', { x1, y1, x2, y2, class: 'r-l', 'stroke-width': w }, g);
  ln(-9.1, 0, -0.03, 0); ln(0.03, 0, 9.1, 0); ln(0, -E, 0, -0.03); ln(0, 0.03, 0, 11);
  mk('rect', { x: -E, y: -0.3, width: E - 9.1, height: 0.6, class: 'r-d' }, g);
  mk('rect', { x: 9.1, y: -0.3, width: E - 9.1, height: 0.6, class: 'r-d' }, g);
  mk('rect', { x: -0.3, y: 11, width: 0.6, height: E, class: 'r-d' }, g);
  const len = (v) => (Math.abs(v - Math.round(v)) < 0.01 ? 0.6 : Math.abs(v * 2 - Math.round(v * 2)) < 0.01 ? 0.4 : 0.2);
  for (let i = 1; i <= 45; i++) {
    const v = i * 0.2;
    if (v < 5 && Math.abs(v * 2 - Math.round(v * 2)) > 0.01) continue;
    const l = len(v) / 2;
    ln(v, -l, v, l); ln(-v, -l, -v, l); ln(-l, -v, l, -v);
  }
  for (let i = 1; i <= 10; i++) {
    ln(-0.3, i, 0.3, i);
    const w = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6][i - 1];
    for (let x = 0.5; x <= w + 0.01; x += 0.5) {
      const r = Math.abs(x - Math.round(x)) < 0.01 ? 0.045 : 0.03;
      mk('circle', { cx: x, cy: i, r, class: 'r-d' }, g); mk('circle', { cx: -x, cy: i, r, class: 'r-d' }, g);
    }
    if (i < 10) mk('text', { x: 0.22, y: i - 0.12, class: 'r-ebr-n' }, g).textContent = i;
  }
  for (const n of [2, 4, 6, 8]) {
    mk('text', { x: n, y: -0.45, class: 'r-ebr-n', 'text-anchor': 'middle' }, g).textContent = n;
    mk('text', { x: -n, y: -0.45, class: 'r-ebr-n', 'text-anchor': 'middle' }, g).textContent = n;
    mk('text', { x: 0.4, y: -n + 0.12, class: 'r-ebr-n' }, g).textContent = n;
  }
}

const ACOG_MARKS = [[0, 'вершина шеврона'], [4.4, 'верх пенька (300 м)'], [7.8, 'риска 400 м'], [12.6, 'риска 500 м'], [18.7, 'риска 600 м'], [26.4, 'риска 700 м'], [35.8, 'риска 800 м']];
const BMARKS = [[0, 'центр'], [2.0, 'точка 1 (2,0)'], [5.9, 'точка 2 (5,9)'], [9.9, 'точка 3 (9,9)'], [14.8, 'кінчик стовпа (14,8)']];

export const RET = {
  // R — радіус поля зору на калібрувальній кратності, за паспортом прицілу (фт чи м на 100 ярдів/м на найбільшій кратності);
  // на меншій кратності поле ширшає в cal/m разів — у паспортах розбіжність із цим у межах кількох відсотків
  // Delta Stryker HD 1–6×24: поле на 6× 5,9 м/100 м (59 MRAD)
  dsmr: { u: 'MRAD', cal: 6, min: 1, R: 29.5, draw: dsmr, size: (m, d) => m * 1000 / d },
  bplex: { u: 'MOA', cal: 7, min: 2, R: 45.8, draw: bplex, marks: BMARKS, size: (m, d) => m * 100 * 34.377 / d },
  // ACOG TA31 — постійні 4×, поле 7° (210 MOA у радіусі); дрібні риски — лупою
  acog: { u: 'MOA', cal: 4, min: 4, R: 210, draw: acog, marks: ACOG_MARKS, beyond: 'нижче риски 800 м', size: (m, d) => m * 100 * 34.377 / d },
  // EBR-2C на Diamondback Tactical 4–16×44 FFP: сітка однакова на будь-якій кратності; поле на 16× 6,7 фт/100 ярд (22,3 MRAD)
  ebr2c: { u: 'MRAD', cal: 16, min: 4, ffp: true, R: 11.17, draw: ebr, size: (m, d) => m * 1000 / d },
  // Strike Eagle 1–6×24: друга площина, риски справжні на 6×; поле на 6× 19,2 фт/100 ярд (220 MOA)
  arbdc3: { u: 'MOA', cal: 6, min: 1, R: 110, draw: arbdc3, marks: BDC3_MARKS, beyond: 'нижче кінця вертикалі (650 ярдів) — крути барабан', size: (m, d) => m * 100 * 34.377 / d },
  // Viper PST II 1–6×24: друга площина, мітки справжні на 6×; поле на 6× 18,8 фт/100 ярд (62,7 MRAD)
  vmr2: { u: 'MRAD', cal: 6, min: 1, R: 31.3, draw: vmr2, size: (m, d) => m * 1000 / d },
  // Mark 3HD 1,5–4×20: друга площина, мітки справжні на 4×; поле на 4× 29,4 фт/100 ярд (98 MRAD)
  lpar: { u: 'MRAD', cal: 4, min: 1.5, R: 49, draw: lpar, marks: LP_MARKS, beyond: 'нижче нижньої риски — крути барабан', size: (m, d) => m * 1000 / d },
  // Tango6T DVO 1–6×24 FFP: мітки справжні на будь-якій кратності; поле на 6× 17,7 фт/100 ярд (59 MRAD)
  dwlr: { u: 'MRAD', cal: 6, min: 1, ffp: true, R: 29.5, draw: dwlr, marks: DWLR_MARKS, beyond: 'нижче низу стебла (1000 м) — крути барабан', size: (m, d) => m * 1000 / d },
  // SLx6 1–6×24 FFP: сітка росте з кратністю, риски справжні на будь-якій; поле на 6× 19,8 фт/100 ярд (227 MOA)
  raptor: { u: 'MOA', cal: 6, min: 1, ffp: true, R: 113.4, draw: raptor, marks: RAPTOR_MARKS, beyond: 'нижче нижньої риски (600 ярдів) — крути барабан', size: (m, d) => m * 100 * 34.377 / d },
};

// Руки до ≈0,65 м від землі (кінчики пальців у людини 1,7 м), завтовшки ≈8 см
const MAN = 'M-.055 .135L.055 .135L.14 .165Q.155 .17 .158 .19L.162 .6L.118 .6L.11 .25L.1 .52L.075 1L.02 1L0 .6L-.02 1L-.075 1L-.1 .52L-.11 .25L-.118 .6L-.162 .6L-.158 .19Q-.155 .17 -.14 .165Z';
const CHEST = 'M-.5 1L-.5 .62Q-.5 .42 -.28 .42L.28 .42Q.5 .42 .5 .62L.5 1Z';
// Силуети в одиницях висоти цілі (h, м): y від 0 (верх) до 1 (низ), x від центру; w — ширина в тих самих одиницях,
// ap — точка прицілювання (частка висоти), parts — кола [x, y, r]; photo — ціль лише на фото сцен (не дзеркалиться, у виборі схем її немає).
export const TGT = {
  man: { short: 'Людина', label: 'Людина 1,7 м', h: 1.7, w: 0.33, ap: 0.3, path: MAN, parts: [[0, 0.0735, 0.0735]], dims: [['голова', 0.25], ['плечі', 0.5]] },
  chest: { short: 'Грудна', label: 'Грудна 0,5 м', h: 0.5, w: 1, ap: 0.65, path: CHEST, parts: [[0, 0.22, 0.18]] },
  kneel: { short: 'На коліні', label: 'Людина на коліні ≈1 м', h: 1, w: 0.9, ap: 0.32, ax: 0.03, photo: true, parts: [[0.04, 0.09, 0.085]],
    path: 'M-.06 .19Q.04 .16 .13 .2L.17 .37L.55 .2L.58 .24L.19 .45L.15 .56L.36 .58Q.41 .6 .41 .65L.41 .95L.49 .97L.49 1L.3 1L.3 .68L.05 .7L.01 .95L-.36 .95L-.4 1L-.4 .91L-.1 .88L-.13 .58Z' },
  ipsc: { short: 'IPSC', label: 'Мішень IPSC 0,76 × 0,46 м', h: 0.76, w: 0.6, ap: 0.55, path: 'M-.1 0H.1V.2H.2L.3 .3V.88L.2 1H-.2L-.3 .88V.3L-.2 .2H-.1Z' },
  gong: { short: 'Гонг', label: 'Гонг 0,3 м', h: 0.3, w: 1, ap: 0.5, path: 'M-.5 .5a.5 .5 0 1 0 1 0a.5 .5 0 1 0-1 0Z' },
  // УАЗ Пікап: 1,85 × 5,2 м збоку, 1,95 м завширшки; іде ліворуч, водій у відчиненому вікні — точка прицілювання на ньому
  pickup: { short: 'Пікап', label: 'Пікап збоку: висота ≈1,85 м, довжина ≈5,2 м', h: 1.85, w: 2.81, ap: 0.21, ax: -0.21, photo: true, dims: [['довжина', 5.2]],
    path: 'M-1.4 .75L-1.4 .59L-1.33 .44L-.76 .32L-.42 .03L.48 .02L.5 .3L1.38 .3L1.4 .72L1.3 .8L-1.3 .8Z', parts: [[-0.97, 0.83, 0.2], [0.73, 0.83, 0.2]] },
  // Лежачи обличчям до нас: від каски до землі ≈0,5 м, по ліктях ≈0,5 м; ноги йдуть назад праворуч
  prone: { short: 'Лежачи', label: 'Лежачи: висота ≈0,5 м, по ліктях ≈0,5 м', h: 0.5, w: 1.3, ap: 0.4, photo: true, parts: [[0, 0.22, 0.24]],
    path: 'M-.26 .27Q-.24 0 0 0Q.24 0 .26 .27L.45 .38L.66 .53L.78 .6L1.54 .76L1.54 .97L.6 1L-.46 1L-.45 .8L-.26 .32Z' },
  // Пікап на нас: кермо ліворуч — водій за склом праворуч на кадрі
  pickupf: { short: 'Пікап у лоб', label: 'Пікап у лоб: висота ≈1,85 м, ширина ≈1,95 м', h: 1.85, w: 1.05, ap: 0.24, ax: 0.2, photo: true, dims: [['ширина', 1.95]],
    path: 'M-.3 .05L.3 .05L.38 .26L.52 .26L.52 .35L.49 .4L.49 1L.36 1L.36 .9L-.38 .9L-.38 1L-.51 1L-.51 .4L-.53 .35L-.53 .26L-.38 .26Z' },
};
// Цілі-схеми у виборі й у вправах; ціль на коліні й пікапи — лише на фото сцен
const PICK = Object.keys(TGT).filter((k) => !TGT[k].photo);

// Зона ураження — куди саме влучати, в одиницях цілі, як і силует; центр — точка прицілювання (ax, ap).
// ['p', x, y, w, h] — груди формою бронеплити 24 × 30 см; ['r', x, y, w, h, rx] — прямокутник; ['c', x, y, r] — коло; 'o' — лише контур (гонг увесь).
// IPSC — зона A 15 × 30 см за правилами
export const KZ = {
  man: ['p', -0.0706, 0.2118, 0.1412, 0.1765],
  chest: ['p', -0.24, 0.35, 0.48, 0.6],
  kneel: ['p', -0.09, 0.17, 0.24, 0.3],
  ipsc: ['r', -0.099, 0.352, 0.197, 0.395, 0.015],
  gong: ['c', 0, 0.5, 0.47, 'o'],
  pickup: ['c', -0.21, 0.21, 0.09],
  pickupf: ['c', 0.2, 0.24, 0.08],
  prone: ['r', -0.3, 0.1, 0.6, 0.62, 0.06],
};

// Чим міряти в далекомірі: [назва, метри, відрізок на цілі в її одиницях] — ['v', x, y1, y2] або ['h', y, x1, x2]
const MEAS = {
  // «голова–пах» — те, що кладуть у шкалу зросту на сітці (мішень 40″ у AR-BDC3): ≈ 0,53 зросту
  man: [['зріст', 1.7, ['v', 0.22, 0, 1]], ['голова', 0.25, ['v', 0.1, 0, 0.147]], ['плечі', 0.5, ['h', 0.17, -0.155, 0.155]], ['голова–пах', 0.9, ['v', 0.22, 0, 0.53]]],
  chest: [['висота', 0.5, ['v', 0.56, 0, 1]], ['ширина', 0.5, ['h', 0.8, -0.5, 0.5]]],
  kneel: [['висота', 1, ['v', 0.62, 0, 1]], ['голова', 0.25, ['v', 0.16, 0, 0.25]], ['плечі', 0.5, ['h', 0.31, -0.22, 0.28]]],
  ipsc: [['висота', 0.76, ['v', 0.36, 0, 1]], ['ширина', 0.46, ['h', 0.6, -0.3, 0.3]]],
  gong: [['діаметр', 0.3, ['v', 0.56, 0, 1]]],
  pickup: [['висота', 1.85, ['v', 1.3, 0, 1]], ['довжина', 5.2, ['h', 0.62, -1.4, 1.4]]],
  pickupf: [['висота', 1.85, ['v', 0.6, 0, 1]], ['ширина', 1.95, ['h', 0.62, -0.53, 0.53]]],
  prone: [['висота', 0.5, ['v', -0.6, 0, 1]], ['голова', 0.25, ['v', 0.33, 0, 0.49]], ['ширина', 0.5, ['h', 1.05, -0.46, 0.54]]],
};

// Іконки кнопок «чим міряти»: яскраво — саме та частина силуету, яку міряємо, решта — блідо
const ON = 'fill="currentColor" stroke="none"';
const OFF = 'fill="currentColor" stroke="none" opacity=".25"';
/** Значок «Прицілювання»: коло прицілу з рисками, усередині силует — залита та частина, куди цілимось (голова чи груди), інша — контуром. */
const aimIcon = (head) => {
  const fill = (on) => (on ? 'fill="currentColor"' : 'opacity=".55"');
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.2"/><path d="M12 .8v3M12 20.2v3M.8 12h3M20.2 12h3"/>`
    + `<g stroke-width="1.3"><circle cx="12" cy="8.4" r="2.4" ${fill(head)}/><path d="M6.6 19.4q0-5.6 5.4-5.6t5.4 5.6z" ${fill(!head)}/></g></svg>`;
};
// Людина цілком: усі варіанти видно на одній фігурі, вибране — яскраво (голова, плечі чи скоба зросту збоку)
const FIG = (head, body) => `<g transform="translate(-2.5 0)"><circle cx="12" cy="3.4" r="2.3" ${head}/><path d="M8.6 7.2h6.8q1.6 0 1.6 1.6v6.4h-2.1V22h-2.5v-6.6h-.8V22H9.1v-6.8H7V8.8q0-1.6 1.6-1.6z" ${body}/></g>`;
const MEAS_ICON = {
  зріст: `${FIG(OFF, OFF)}<path d="M20 2v20M18.3 2h3.4M18.3 22h3.4"/>`,
  голова: FIG(ON, OFF),
  плечі: `${FIG(OFF, OFF)}<path d="M3.5 8.5h12M3.5 7v3M15.5 7v3"/>`,
  висота: '<path d="M12 3v18M9 3h6M9 21h6M9.5 6.5 12 3l2.5 3.5M9.5 17.5 12 21l2.5-3.5"/>',
  ширина: '<path d="M3 12h18M3 9v6M21 9v6M6.5 9.5 3 12l3.5 2.5M17.5 9.5 21 12l-3.5 2.5"/>',
  діаметр: '<circle cx="12" cy="12" r="8.5"/><path d="M6 18 18 6"/>',
};
MEAS_ICON['довжина'] = MEAS_ICON['ширина'];
MEAS_ICON['голова–пах'] = `${FIG(OFF, OFF)}<path d="M20 2v11M18.3 2h3.4M18.3 13h3.4"/>`;
// Що в сітці для рухомої цілі
const MOVE_NOTE = { raptor: 'передній край підкови — упередження для цілі 8,6 миль/год (≈3,8 м/с, біг) на дистанції своєї риски' };
// Точки вітру в сітці — милі/год повного бокового на дистанції своєї риски
const WIND_DOTS = { arbdc3: [5, 10, 15], raptor: [5, 10], dwlr: [5, 10] };
// Шкала дальності в самій сітці: на яку мішень розрахована й які дистанції в мітках (ярди — у метрах)
const RET_STADIA = {
  arbdc3: 'шкала вгорі — мішень 40″ × 18″ (≈1 м × 46 см): від короткої риски-основи до лінії — висота (у бійця голова–пах), ширина лінії — плечі; «3 / 4 / 5 / 6» — 300–600 ярдів: 274 / 366 / 457 / 549 м',
  raptor: 'ширина рисок і основи шеврона — 18″ (46 см, плечі) на 300 / 400 / 500 / 600 ярдів: 274 / 366 / 457 / 549 м',
  dwlr: 'ширина кожної риски — 18″ (46 см, плечі) на своїй дистанції, 300–1000 м',
  acog: 'ширина рисок 400–800 м — 19″ (48 см, плечі) на своїй дистанції',
};

// Голова — [x, y] в одиницях цілі; у кого її нема (гонг, пікапи), там цілимось лише в центр
const HEAD = { man: [0, 0.09], chest: TGT.chest.parts[0], kneel: TGT.kneel.parts[0], prone: TGT.prone.parts[0], ipsc: [0, 0.1] };
// Зони в метрах — однакові для людини будь-якої пози й дистанції: голова ⌀16 см, груди (серце й легені) 24 × 30 см
const HEAD_R = 0.08;
const BODY = [0.24, 0.3];
// Легкий рівень — весь торс, а не лише плита
const BODY_BIG = [0.35, 0.5];
let aimHead = false;

/** Боєць на кадрі сцени: вибраний за номером, якщо він потрібного типу, інакше перший такого типу. */
const figOf = (real, n, tgt) => {
  const sc = SCENES[real];
  return (sc?.figs[n ?? 0]?.[0] === tgt ? sc.figs[n ?? 0] : sc?.figs.find(([g]) => g === tgt)) ?? null;
};

/**
 * Точка прицілювання й зона ураження цілі: центр мас за замовчуванням або голова, коли вибрано «голова».
 * На фото — точки, зняті з кадру (6-й елемент figs: c — груди, hd — голова, only — видно лише голову), бо пози різні.
 */
export function aimOf(key, fig = null, zone = null) {
  const zn = zone ?? (aimHead ? 'head' : 'chest');
  const z = zonesOf(key, fig, zn === 'torso');
  return (zn === 'head' || !z.body) && z.head ? z.head : z.body;
}

/** Справжній ріст бійця на кадрі (h із розмітки) — на колінах буває від 1 до 1,3 м; інакше — ріст типу цілі. */
export const figH = (key, fig) => markOf(fig)?.h ?? TGT[key].h;

/** Обидві зони цілі — груди й голова, у метрах від росту бійця (s — старий множник зон, лишився для сумісності). */
export function zonesOf(key, fig = null, big = false) {
  const T = TGT[key]; const m = markOf(fig) ?? {}; const s = m.s ?? 1; const hd = m.nohd ? null : m.hd ?? HEAD[key]; const fh = figH(key, fig);
  const head = hd ? { ax: hd[0], ap: hd[1], kz: ['c', hd[0], hd[1], (HEAD_R * s) / fh] } : null;
  if (m.only) return { head, body: null };
  // Груди людини — плита з центром у точці прицілювання (з кадру чи типова для силуету); гонг, IPSC, пікапи — своя зона з KZ
  if (!m.c && KZ[key]?.[0] !== 'p') return { head, body: { ax: T.ax ?? 0, ap: T.ap, kz: KZ[key] } };
  const [x, y] = m.c ?? [T.ax ?? 0, T.ap]; const [w, h] = (big ? BODY_BIG : BODY).map((v) => (v * s) / fh);
  // Весь торс — від тієї ж лінії плечей, що й плита грудей, донизу до пояса: по центру грудей він заходив би на підборіддя
  const top = y - (BODY[1] * s) / fh / 2;
  // Нижче низу бійця (підвіконня, бруствер, земля) плита не йде
  return { head, body: { ax: x, ap: y, kz: ['p', x - w / 2, top, w, Math.min(h, 1 - top)] } };
}

/** Контур бронеплити SAPI: верхні кути зрізано до 28 % висоти, низ трохи заокруглений. */
function plateD([, x, y, w, h]) {
  const r = w * 0.06;
  return `M${x + 0.27 * w} ${y}H${x + 0.73 * w}L${x + w} ${y + 0.28 * h}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + 0.28 * h}Z`;
}

/** Найдальша точка зони ураження від її центру, в одиницях цілі. */
export const kzReach = (key, fig, zone) => {
  const { kz } = aimOf(key, fig, zone);
  if (!kz) return 0;
  if (kz[0] === 'c') return kz[3];
  // Плита торсу не по центру точки прицілювання — найдальший кут рахуємо від неї
  const { ax, ap } = aimOf(key, fig, zone);
  return Math.max(...[kz[1], kz[1] + kz[3]].flatMap((x) => [kz[2], kz[2] + kz[4]].map((y) => Math.hypot(x - ax, y - ap))));
};

let hitCtx = null;
const maskCache = {};
/** Маска бійця з masks.js: функція (x, y) у частках висоти фігури → чи це боєць; біти розпаковуються раз. */
function maskOf(id) {
  if (!(id in maskCache)) {
    const m = MASKS[id];
    if (!m) maskCache[id] = null;
    else {
      const [u0, v0, cols, rows, b64] = m; const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      maskCache[id] = (x, y) => {
        const q = Math.floor((x - u0) / MASK_CELL); const r = Math.floor((y - v0) / MASK_CELL);
        if (q < 0 || r < 0 || q >= cols || r >= rows) return false;
        const i = r * cols + q;
        return (bytes[i >> 3] >> (7 - (i & 7))) & 1;
      };
    }
  }
  return maskCache[id];
}
/**
 * Куди лягла куля на цілі: 'zone' — у зону ураження, 'body' — у силует поза зоною, 'miss' — мимо.
 * ex, ey — влучання відносно точки прицілювання в одиницях сітки (y донизу), H — висота цілі в тих самих одиницях.
 */
export function hitBand(key, ex, ey, H, flip, fig = null, zone = null) {
  const T = TGT[key]; const { ax, ap, kz } = aimOf(key, fig, zone);
  // У координати силуету: частки висоти, x від центру; дзеркальна ціль — x навпаки
  const x = ax + ((flip ? -1 : 1) * ex) / H; const y = ap + ey / H;
  hitCtx ??= document.createElement('canvas').getContext('2d');
  // Боєць на фото — за його власною маскою з кадру (рука, нога, зброя — «у ціль», порожнє місце поруч — мимо)
  const mask = fig && maskOf(fig.id);
  // Зона, що виходить за силует (стіна під вікном, бруствер, трава), — не влучання: у зону лише по бійцю
  const onFig = !mask || mask(x, y);
  if (kz && onFig && (kz[0] === 'p' ? hitCtx.isPointInPath(new Path2D(plateD(kz)), x, y)
    : kz[0] === 'r' ? x >= kz[1] && x <= kz[1] + kz[3] && y >= kz[2] && y <= kz[2] + kz[4]
    : Math.hypot(x - kz[1], y - kz[2]) <= kz[3])) return 'zone';
  if (mask) return onFig ? 'body' : 'miss';
  if ((T.parts ?? []).some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r)) return 'body';
  const inPath = (d) => d && hitCtx.isPointInPath(new Path2D(d), x, y);
  return inPath(T.path) || inPath(T.dark) ? 'body' : 'miss';
}

/**
 * Вид у приціл: o.ret, o.mag, o.dist, o.tgt, o.mode ('range'|'aim'), o.hx, o.hy — винос в одиницях сітки на калібрувальній кратності;
 * o.zoom — лупа (1, 2, 4, 6) на точку виносу чи ціль: кільце й підпис лишаються того ж розміру на екрані.
 */
// Фото-сцени реалізму: hz — горизонт (рівень ока) у частці висоти фото, ar — висота / ширина.
// Ширина фото — 150 міл: дерева й будинки за кілька сотень метрів — кілометр мають правдоподібний кутовий розмір.
// Нижче фото — трава з його ж низу, вище — небо з його ж верху, обидва дзеркалом по вертикалі (gr, sk — висота плитки в частках висоти фото)
// Цілий кадр: бійці вже на фото — figs, кожен [тип цілі, верх, низ, центр, земля, точки] у пікселях кадру px (точки — див. aimOf; nm — чим не міряти); кадр масштабується так,
// щоб вибраний боєць мав розмір цілі. Обабіч — чиста копія кадру (-c, без людей і техніки, бесшовна), вище й нижче — небо й земля з неї;
// боки самого кадру прозорі на краях і зливаються з копією.
// rep — смуги неба й землі (sk, gr — висота в частках кадру) повторюються. Годиться лише загальний план: боєць ≲ 15 % висоти кадру,
// інакше кадр у прицілі малий і навколо самі повтори — «калейдоскоп».
// Фото: Міноборони РФ (mil.ru), CC BY 4.0. Цілі — лише російські військові.
// name — плитка в сітці цілей («Атака»): вибір її вмикає реалізм із цією сценою й ціллю першого типу бійців
// Поле з лісом на обрії: тло з постійним кутовим розміром для сцен-спрайтів (див. prone).
// src — файли real-<src>-bg / -gr; px — кадр тла, hz — рядок горизонту, mil — ширина кадру в мілах, eye — висота камери, м,
// gr — висота плитки землі (останні рядки тла, безшовно вниз) у частках висоти кадру, sky — колір неба вище кадру.
// Тло й цілі згенеровано (Nano Banana)
const FIELD = { src: 'field', px: [5504, 2072], hz: 558, mil: 423, eye: 1.6, gr: 520 / 2072, sky: '#cfd1db' };
// Власна розмітка бійців із «Розмітки сцен» — поверх вшитої у figs, лише на цьому пристрої (поки не перенесено в код)
const MARKS = 'shooters-log:scene-marks';
let marks = {};
try { marks = JSON.parse(localStorage.getItem(MARKS)) ?? {}; } catch { marks = {}; }
const markOf = (fig) => (fig ? { ...fig[5], ...marks[fig.id] } : null);
const r3 = (v) => Math.round(v * 1000) / 1000;
/** Розмітка бійця тим самим записом, що у figs, — щоб вставити в код як є. */
const markTxt = (m) => `{ ${[m.tp ? `tp: '${m.tp}'` : null, m.only ? 'only: true' : null, m.nohd ? 'nohd: true' : null, m.c ? `c: [${r3(m.c[0])}, ${r3(m.c[1])}]` : null,
  m.hd ? `hd: [${r3(m.hd[0])}, ${r3(m.hd[1])}]` : null, m.h ? `h: ${r3(m.h)}` : null, m.s && m.s !== 1 ? `s: ${r3(m.s)}` : null].filter(Boolean).join(', ')} }`;

export const SCENES = {
  // Ланцюг: п'ятеро йдуть на нас степом, двоє з них на коліні ціляться; позаду БМП і танк;
  // кадр згенеровано (Nano Banana 4K), боки дорисовано панорамою 21:9
  assault: { name: 'Ланцюг', px: [8361, 3584], tone: ['#a8c9f0', '#b57f51'], gnd: [0.225, 0.105],
    figs: [['man', 1585, 2010, 2855, null, { c: [-0.045, 0.262], hd: [-0.065, 0.091] }], ['kneel', 1765, 2285, 3470, null, { c: [-0.068, 0.348], hd: [-0.123, 0.146], h: 1.25 }], ['man', 1540, 2075, 4200, null, { c: [0, 0.249], hd: [0.004, 0.09] }], ['kneel', 1730, 2265, 4980, null, { c: [-0.019, 0.339], hd: [-0.025, 0.123], h: 1.27 }], ['man', 1527, 1925, 5520, null, { c: [-0.092, 0.262], hd: [-0.072, 0.105] }]] },
  // Колона: четверо в маскхалатах ідуть зимовою дорогою на нас уступом — по черзі правим і лівим краєм; кадр згенеровано (Nano Banana 4K), боки дорисовано панорамою 21:9
  arctic: { name: 'Колона', px: [8403, 3584], tone: ['#adb8d6', '#c3c9e2'],
    figs: [['man', 1573, 2245, 5424], ['man', 1700, 1987, 4670], ['man', 1724, 2004, 3835, null, { c: [-0.038, 0.283], hd: [-0.035, 0.1] }], ['man', 1734, 1882, 4355]] },
  // Узлісся: літо, зелена лука перед лісом — один стоїть біля куща в тіні, один іде на нас, один на коліні цілиться;
  // кадр згенеровано (Nano Banana 4K), боки й верхівки дерев дорисовано
  green: { name: 'Узлісся', px: [8358, 4687], tone: ['#91bce9', '#687a35'], gnd: [0.2249, 0.0899],
    figs: [['man', 2816, 3335, 4178, null, { c: [0.004, 0.267], hd: [0, 0.09] }], ['man', 2772, 3243, 5143, null, { c: [0.015, 0.281], hd: [0, 0.09] }], ['kneel', 2954, 3263, 3173, null, { c: [0.05, 0.37], hd: [-0.08, 0.17], h: 1.08 }]] },
  // Околиця села: один біля рогу хати, один іде вулицею, один цілиться з вікна (грудна ціль 0,5 м — за шириною шолома ≈0,27 м);
  // кадр згенеровано (Nano Banana 4K), боки дорисовано панорамою 21:9
  town: { name: 'Околиця', px: [8406, 3584], tone: ['#dce5f4', '#99867d'], gnd: [0.1874, 0.1046],
    figs: [['man', 1452, 1952, 2622, null, { c: [-0.02, 0.3], hd: [0.02, 0.1] }], ['man', 1556, 1952, 5045, null, { c: [-0.03, 0.3], hd: [-0.015, 0.11] }], ['chest', 1454, 1572, 6269, null, { c: [0.08, 0.75], hd: [-0.03, 0.38] }]] },
  // Сутінки: поле після заходу, низький контраст — двоє йдуть на нас, один на коліні цілиться;
  // кадр згенеровано (Nano Banana 4K), боки дорисовано панорамою 21:9
  dusk: { name: 'Сутінки', px: [8358, 3584], tone: ['#44505d', '#1c1812'], gnd: [0.2249, 0.12],
    figs: [['man', 1629, 1998, 3733, null, { c: [-0.002, 0.267], hd: [0, 0.09] }], ['man', 1636, 1999, 4173, null, { c: [0.004, 0.27], hd: [0, 0.09] }], ['kneel', 1737, 1994, 4648, null, { c: [-0.026, 0.374], hd: [0.006, 0.115], h: 1.3 }]] },
  // Окоп: позиція на полі — бліндаж із кулеметником у бійниці й окоп, з якого двоє визирають з-за бруствера;
  // грудна ціль 0,5 м — за шоломами (≈0,27 м), масштаб у всіх однаковий; 5-й елемент — земля під бійцем;
  // у кулеметника видно плечі — є й груди (плита під головою, за кулеметом), у двох за бруствером — лише голова
  trench: { name: 'Окоп', px: [3168, 648], bg: FIELD,
    figs: [['chest', 271, 435, 1078, 540, { c: [0.03, 0.78], hd: [0.037, 0.345] }], ['chest', 179, 343, 2059, 531, { only: true, hd: [0.042, 0.353] }], ['chest', 177, 341, 2432, 531, { only: true, hd: [0.054, 0.336] }]] },
  // Лежачи: боєць окремим спрайтом (px — його розмір) на тлі bg з постійним кутовим розміром, як у справжньому прицілі:
  // поле й ліс не змінюються з дистанцією, боєць меншає й підходить до горизонту (ноги на eye/d нижче нього)
  prone: { name: 'Лежачи', px: [1965, 1050], bg: FIELD,
    figs: [['prone', 1, 935, 501, null, { c: [0.025, 0.81], hd: [0.003, 0.379] }]] },
  // Пікап збоку й у лоб: спрайти на тому ж полі, ціль — водій; збоку спрайт розтягнуто на 5 % до пропорцій УАЗа 1,85 × 5,2 м
  pickup: { name: 'Пікап збоку', px: [3137, 1167], bg: FIELD,
    figs: [['pickup', 3, 1117, 1568]] },
  pickupf: { name: 'Пікап у лоб', px: [1122, 1114], bg: FIELD,
    figs: [['pickupf', 1, 1059, 563]] },
};
// tp0 — тип із коду: «Скинути бійця» повертає його, коли в розмітці тип змінили
Object.entries(SCENES).forEach(([sk, sc]) => sc.figs.forEach((f, i) => { f.id = `${sk}-${i}`; f.tp0 = f[0]; f[0] = marks[f.id]?.tp ?? f[0]; }));

/** Сцена й боєць для цілі tgt: вибрана сцена pref, якщо така ціль на ній є, інакше випадкова з нею, інакше будь-яка (лише тло). */
function pickScene(tgt, pref) {
  const keys = Object.keys(SCENES);
  const has = (k) => SCENES[k]?.figs.some(([g]) => g === tgt);
  const own = has(pref) ? [pref] : keys.filter(has);
  const pool = own.length ? own : keys;
  const key = pool[Math.floor(Math.random() * pool.length)];
  const idx = SCENES[key].figs.flatMap(([g], i) => (g === tgt ? [i] : []));
  return [key, idx.length ? idx[Math.floor(Math.random() * idx.length)] : 0];
}

/** Скільки триває підсвітка нашого солдата на цілому кадрі, мс (як анімація .r-flash у CSS). */
const FLASH_MS = 1800;

/** У скільки разів ціль на сітці менша, ніж на калібрувальній кратності: у FFP — завжди 1. */
const kOf = (C, mag) => (C.ffp ? 1 : mag / C.cal);

function scope(svg, o) {
  const C = RET[o.ret]; const R = C.ffp ? C.R * C.cal / o.mag : C.R; const k = kOf(C, o.mag); const T = TGT[o.tgt];
  // Фото не дзеркалиться — інакше зона ураження з'їде з водія на інший бік машини
  // і на цілому кадрі-сцені: боєць на фото не дзеркалиться, тож і зони не можна (інакше в розмітці тягнеш праворуч — плита їде ліворуч)
  if (T.photo || (o.real && SCENES[o.real])) o = { ...o, flip: false };
  // Перетягування, вітер і рух міняють лише зсув прицілу (hx, hy у «Виносі», rx, ry у далекомірі): тоді кадр із ціллю не будуємо заново,
  // а зсуваємо його групу — це в рази дешевше; позначки, що залежать від зсуву (кільце й підпис виносу, розкид), — заново лише вони.
  // Кадр ширший за коло (E), тож зсув до 0,4 R не відкриває країв; далі — знову повністю
  // aimHead — у ключі: перемкнули голова ↔ груди — кадр будуємо заново, а не зсуваємо старий зі старою зоною
  const key = JSON.stringify({ ...o, hx: 0, hy: 0, rx: 0, ry: 0, aimHead });
  const was = svg._sc;
  if (was?.key === key && svg.lastChild === was.ring && svg.childNodes.length === was.n) {
    const at = was.pos(o); const dx = at.cx - was.cx; const dy = at.top - was.top;
    if (Math.abs(dx) <= R * 0.4 && Math.abs(dy) <= R * 0.4) {
      was.g.setAttribute('transform', `translate(${dx} ${dy})`);
      svg.setAttribute('viewBox', [at.vx - was.half, at.vy - was.half, 2 * was.half, 2 * was.half].join(' '));
      was.ov.replaceChildren();
      was.marks(o, at);
      return { figs: was.shown?.map(([x, a, b]) => [x + dx, a + dy, b + dy]) ?? null, place: o.mode === 'range' ? null : { cx: at.cx, top: at.top, H: was.H } };
    }
  }
  svg.replaceChildren();
  const z = o.zoom > 1 ? o.zoom : 1;
  const E = R * 1.5;
  const id = `guide-clip${uid++}`;
  const cp = mk('clipPath', { id }, mk('defs', {}, svg));
  mk('circle', { cx: 0, cy: 0, r: R }, cp);
  const gc = mk('g', { 'clip-path': `url(#${id})` }, svg);
  // Кадр із ціллю — окрема група: її зсуває швидкий шлях; сітка й позначки поверх — у gc
  const g = mk('g', {}, gc);
  mk('rect', { x: -E, y: -E, width: 2 * E, height: 2 * E, class: 'r-sky' }, g);
  const pick = figOf(o.real, o.fig, o.tgt);
  const H = C.size(figH(o.tgt, o.noTarget ? null : pick), o.dist) * k;
  const aim = aimOf(o.tgt, o.noTarget ? null : pick, o.zone);
  // У розмітці кадр стоїть на місці (прив'язка — типова точка силуету): інакше тягнеш зону, а за нею їде й ціль — зона «втікає» з-під пальця
  const anchor = o.edit ? { ax: T.ax ?? 0, ap: T.ap } : aim;
  // Далекомір: верх цілі на горизонтальній нитці, край — впритул до міток вертикалі (риски DSMR ±0,4, точки Plex ±0,55).
  // Широка ціль (пікап) — ліворуч: скоба висоти в неї праворуч, тож поруч із мітками, а лупа дивиться на цей стик
  const wide = T.w > 1;
  // Лупа дивиться туди, де важливо: у прицілюванні — на точку виносу (після відповіді — щоб влізли центр, попадання й правильна точка), у далекомірі — на ціль; не виходить за коло
  // Запас під обвідку кола — пропорційний полю, інакше на малому R (EBR-2C на 16×) ціль виходить дрібнішою за масштаб
  const half = z > 1 ? R / z : R * 1.034;
  const lim = (v) => Math.max(-(R - half), Math.min(R - half, v));
  // Далекомір: лупа йде до середини цілі, але не далі 0,6 півкадру — близька (велика) ціль інакше відвела б перехрестя за край;
  // так у кадрі лишаються нитки й поруч із ними верх і край цілі
  const near = (v) => lim(Math.min(v, half * 0.6));
  // Де ціль і куди дивиться лупа — від зсуву прицілу; решта кадру від нього не залежить (швидкий шлях кличе це ж саме)
  const pos = (p) => {
    let cx; let top;
    if (p.mode === 'range') { cx = (wide ? -1 : 1) * (T.w * H / 2 + (C.u === 'MOA' ? 0.65 : 0.5)); top = 0; } else { cx = p.hx * k - anchor.ax * (p.flip ? -H : H); top = p.hy * k - anchor.ap * H; }
    // o.focus — точка, яку вибрали довгим натисканням (шкала зросту збоку чи внизу сітки): лупа дивиться туди, а не в центр
    const [vx, vy] = z > 1 && p.focus ? [lim(p.focus[0]), lim(p.focus[1])] : z > 1 ? (p.mode === 'range' ? [wide ? 0 : near(cx), near(top + H / 2)] : p.hit ? [lim((Math.min(0, p.hx - p.hit[0], p.hit[0]) + Math.max(0, p.hx - p.hit[0], p.hit[0])) * k / 2), lim((Math.min(0, p.hy - p.hit[1], p.hit[1]) + Math.max(0, p.hy - p.hit[1], p.hit[1])) * k / 2)] : [lim(p.hx * k), lim(p.hy * k)]) : [0, 0];
    // Далекомір: палець веде приціл, як у «Виносі» (p.rx, p.ry — зсув прицілу в його координатах): сітка в центрі, ціль іде назустріч;
    // лупа лишається там, де ціль стоїть спочатку, — інакше рух виглядав би як зсув сітки
    if (p.mode === 'range') { const cl = (v) => Math.max(-R * 0.85, Math.min(R * 0.85, v ?? 0)); cx -= cl(p.rx); top -= cl(p.ry); }
    return { cx, top, vx, vy };
  };
  const { cx, top, vx, vy } = pos(o);
  svg.setAttribute('viewBox', [vx - half, vy - half, 2 * half, 2 * half].join(' '));
  let ground = { class: 'r-gr' };
  let shown = null;
  const sk = o.real;
  const sc = SCENES[sk];
  // Боєць на кадрі — коли ціль цього типу на фото є; інакше й без цілі — лише чиста копія кадру, у масштабі першого бійця сцени
  const fig = !o.noTarget && pick ? pick.slice(1) : null;
  const bare = sc && !fig;
  // Колір сітки: вибраний кнопкою, а без вибору на фото — чорна, як у справжньому прицілі
  const ink = o.ink ?? (sc ? 'black' : null);
  svg.classList.toggle('ink-b', ink === 'black');
  svg.classList.toggle('ink-w', ink === 'white');
  svg.classList.toggle('photo', !!sc);
  if (sc) {
    // Реалізм: кадр прив'язаний до цілі — вибраний боєць на фото завбільшки з неї, решта кадру масштабується разом із ним
    const defs = cp.parentNode;
    // Плитка — бесшовна, тож просто повтор; нахлест 0,3 % в обидва боки — інакше на стиках (і вгорі неба) видно тонкий шов
    const pat = (pid, href, x, y, w, h) => {
      const p = mk('pattern', { id: pid, patternUnits: 'userSpaceOnUse', x, y, width: w, height: h }, defs);
      mk('image', { href, x: -w * 0.003, y: -h * 0.003, width: w * 1.006, height: h * 1.006, preserveAspectRatio: 'none' }, p);
    };
    const img = (n) => `guide/img/real-${sk}${n}.webp`;
    // Цілий кадр: боєць на фото має висоту цілі H, ноги — там, де ноги цілі
    const [rk, rf] = fig ? [o.tgt, fig] : [sc.figs[0][0], sc.figs[0].slice(1)];
    const [pw, ph] = sc.px; const [ft, ff, fc] = rf.map((v, i) => v / (i < 2 ? ph : pw));
    const bh = (bare ? C.size(TGT[rk].h, o.dist) * k : H) / (ff - ft); const bw = bh * pw / ph; const bx = cx - fc * bw; const by = top + H - ff * bh;
    if (fig) shown = sc.figs.map(([, a, b, c]) => [bx + c / pw * bw, by + a / ph * bh, by + b / ph * bh]);
    if (sc.bg) {
      // Тло завширшки B.mil мілів незалежно від дистанції; горизонт — на висоті камери над ногами цілі (eye/d рад).
      // Боєць посередині тла; mu — один міл у одиницях сітки з урахуванням кратності.
      // Ціль, що визирає з укриття (окоп), стоїть не на землі — тоді земля під нею в 5-му елементі figs (рядок спрайта)
      const B = sc.bg; const [qw, qh] = B.px; const mu = C.size(1, 1000) * k;
      const gw = B.mil * mu; const gh = gw * qh / qw; const gx = cx - gw / 2;
      const foot = rf[3] != null ? by + rf[3] / ph * bh : top + H;
      const gy = foot - C.size(B.eye, o.dist) * k - B.hz / qh * gh;
      // Тло — картинкою, а не pattern: pattern на краю плитки підмішує сусідній повтор, і на стику з небом видно смугу.
      // Обабіч — копії: тло ширше за поле зору навіть на 1×, вони видні лише при великому виносі.
      // Плитка землі — це низ тла, тож лягає на його останні рядки (збігається з ними) і далі повторюється вниз без шва
      const grH = gh * B.gr; const gry = gy + gh - grH;
      const bgImg = (n) => `guide/img/real-${B.src}${n}.webp`;
      pat(`${id}g`, bgImg('-gr'), gx, gry, gw, grH);
      mk('rect', { x: -E, y: -E, width: 2 * E, height: 2 * E, fill: B.sky }, g);
      if (gw > 0) for (let x = gx - gw * Math.ceil((gx + E) / gw); x < E; x += gw) mk('image', { href: bgImg('-bg'), x, y: gy, width: gw, height: gh, preserveAspectRatio: 'none' }, g);
      ground = { fill: `url(#${id}g)` };
      mk('rect', { x: -E, y: Math.max(gry, -E), width: 2 * E, height: 2 * E, ...ground }, g);
      if (!bare) {
        // Спрайт знято зблизька — з дистанцією трохи розмиваємо (0,0125 міла поблизу → 0,04 міла на 700 м),
        // інакше далекий боєць різкий, як вирізаний
        const fl = mk('filter', { id: `${id}a` }, defs);
        mk('feGaussianBlur', { stdDeviation: (0.0125 + 0.0275 * Math.min(1, o.dist / 700)) * mu }, fl);
        mk('image', { href: img(''), x: bx, y: by, width: bw, height: bh, preserveAspectRatio: 'none', filter: `url(#${id}a)` }, g);
      }
    } else {
      // Над кадром і під ним — рівний колір неба й землі (плитки на малій кратності давали смуги на стиках).
      // Обабіч — по одній дзеркальній копії, що до зовнішнього краю тане в гладке тло (колір рядків кадру), далі лише воно:
      // на 1× і великій дистанції кадр — вузька смужка, і повтори копій складались у калейдоскоп
      const [skyC, grC] = sc.tone;
      mk('rect', { x: -E, y: -E, width: 2 * E, height: Math.max(0, Math.min(by + bh * 0.03, E) + E), fill: skyC }, g);
      const side = (x, w, n) => mk('image', { href: img(n), x, y: by, width: w, height: bh, preserveAspectRatio: 'none' }, g);
      side(-E, Math.max(0, bx - bw + E) + 1, '-far'); side(bx + 2 * bw - 1, Math.max(0, E - bx - 2 * bw) + 1, '-far');
      side(bx - bw, bw + 1, '-cl'); side(bx + bw - 1, bw + 1, '-cr');
      if (!bare) mk('image', { href: img(''), x: bx, y: by, width: bw, height: bh, preserveAspectRatio: 'none' }, g);
      ground = { fill: grC };
      mk('rect', { x: -E, y: Math.max(by + bh - 1, -E), width: 2 * E, height: 2 * E, ...ground }, g);
      if (sc.gnd) {
        // Земля під кадром — плитка -gnd з його ж низу (gnd — її ширина й висота в частках кадру): перша смуга в масштабі кадру
        // лягає на місце, де кадр тане в рівний колір, кожна нижча — в 1,8 раза крупніша (земля ближче); смуга проявляється
        // зверху поступово (маска), тож стиків між смугами й з кадром не видно. Смуги зсунуті одна відносно одної — повтори не стають у стовпчики;
        // ближча земля в прицілі не в фокусі — нижчі смуги розмиті сильніше, це й ховає повтор плитки
        const fade = mk('mask', { id: `${id}f`, maskContentUnits: 'objectBoundingBox' }, defs);
        const lg = mk('linearGradient', { id: `${id}fg`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        mk('stop', { offset: 0, 'stop-color': '#000' }, lg); mk('stop', { offset: 0.25, 'stop-color': '#fff' }, lg);
        mk('rect', { width: 1, height: 1, fill: `url(#${id}fg)` }, fade);
        const [tw, th] = sc.gnd;
        let y = by + bh * 0.8; let sz = 1;
        for (let i = 0; y < E && i < 14; i++) {
          const w = tw * bw * sz; const h = th * bh * sz; const band = h * 3;
          if (y + band > -E) {
            pat(`${id}n${i}`, img('-gnd'), bx + w * ((i * 0.381) % 1), y, w, h);
            const blur = i ? { filter: `url(#${id}b${i})` } : {};
            if (i) mk('feGaussianBlur', { stdDeviation: h * 0.012 * i }, mk('filter', { id: `${id}b${i}`, x: 0, y: -0.1, width: 1, height: 1.2 }, defs));
            mk('rect', { x: -E, y, width: 2 * E, height: band, fill: `url(#${id}n${i})`, mask: `url(#${id}f)`, ...blur }, g);
          }
          y += band * 0.55; sz *= 1.8;
        }
      }
    }
  } else mk('rect', { x: -E, y: top + H, width: 2 * E, height: 2 * E, ...ground }, g);
  const tg = mk('g', { transform: `translate(${cx} ${top}) scale(${o.flip ? -H : H} ${H})` }, g);
  // Фото цілі — у тих самих одиницях, що й контур (висота = 1), тож розмір у мілах від дистанції й кратності той самий
  if (o.noTarget) tg.remove();
  // На цілому кадрі солдат уже є — малюємо лише зону ураження й підказки поверх
  else if (fig) {
    tg.setAttribute('data-fig', '');
    // На кадрі кілька солдатів — нашого коротко підсвічуємо, коли ціль з'явилась (o.flash — коли саме).
    // Приціл перемальовується при кожному русі, тож анімація продовжується з того ж місця (від'ємна затримка)
    const ago = performance.now() - (o.flash ?? -1e9);
    // Кільце облягає бійця (сусіди поруч не потрапляють), але на екрані не дрібніше за ≈3 міли без лупи —
    // на 500–600 м сам солдат завбільшки з риску. Стрілка над каскою — щоб у тісній групі було видно, хто саме
    const s = Math.max(1, 3 / (H * (o.zoom ?? 1)) / 0.62);
    if (ago < FLASH_MS) {
      const anim = { 'vector-effect': 'non-scaling-stroke', style: `animation-delay:${-ago}ms` };
      mk('ellipse', { cx: 0, cy: 0.5, rx: Math.max(0.36, T.w * 0.6) * s, ry: 0.62 * s, class: 'r-flash', ...anim }, tg);
      const y = 0.5 - 0.62 * s - 0.04; const w = 0.12 * s;
      mk('path', { d: `M${-w} ${y - 2 * w}L${w} ${y - 2 * w}L0 ${y}Z`, class: 'r-flash r-pin', ...anim }, tg);
    }
  }
  else {
    mk('path', { d: T.path, class: 'r-tgt' }, tg);
    if (T.dark) mk('path', { d: T.dark, class: 'r-tgt-d' }, tg);
    (T.parts ?? []).forEach(([x, y, r, d]) => mk('circle', { cx: x, cy: y, r, class: d ? 'r-tgt-d' : 'r-tgt' }, tg));
  }
  // Далекомір: скоба на тому відрізку цілі, яким міряємо (ріст, плечі, довжина…)
  const ms = !o.noTarget && o.mode === 'range' && o.meas ? MEAS[o.tgt]?.[o.meas - 1]?.[2] : null;
  if (ms) {
    const [dir, at, a, b] = ms; const e = 0.04;
    const d = dir === 'v' ? `M${at} ${a}V${b}M${at - e} ${a}H${at + e}M${at - e} ${b}H${at + e}` : `M${a} ${at}H${b}M${a} ${at - e}V${at + e}M${b} ${at - e}V${at + e}`;
    mk('path', { d, class: 'r-meas', 'vector-effect': 'non-scaling-stroke' }, tg);
  }
  // У далекомірі зона не потрібна — заважала б міряти
  const zs = o.noTarget || o.mode === 'range' ? []
    : o.edit ? [zonesOf(o.tgt, pick)].flatMap((z) => [z.body?.kz, z.head?.kz]).filter(Boolean) : [aim.kz];
  for (const kz of zs) {
    const a = { class: o.edit ? 'r-kz edit' : 'r-kz', 'vector-effect': 'non-scaling-stroke' };
    if (kz[0] === 'p') mk('path', { ...a, d: plateD(kz) }, tg);
    else if (kz[0] === 'r') mk('rect', { ...a, x: kz[1], y: kz[2], width: kz[3], height: kz[4], rx: kz[5] }, tg);
    else mk('circle', { ...a, class: kz[4] === 'o' ? 'r-kz o' : 'r-kz', cx: kz[1], cy: kz[2], r: kz[3] }, tg);
  }
  if (o.move && !o.noTarget) {
    // Стрілка руху над ціллю — куди вона йде так, як її видно в прицілі
    const len = Math.max(H * Math.max(T.w, 0.5) * 0.6, (R * 0.12) / z); const ay = top - (R * 0.04) / z; const x0 = cx - (o.move * len) / 2; const x1 = cx + (o.move * len) / 2;
    const hd = (R * 0.025) / z;
    mk('path', { d: `M${x0} ${ay}H${x1}M${x1 - o.move * hd * 1.6} ${ay - hd}L${x1} ${ay}L${x1 - o.move * hd * 1.6} ${ay + hd}`, class: 'r-move', 'stroke-width': (R * 0.012) / z }, g);
  }
  if (o.hide) mk('rect', { x: -E, y: top + H * (1 - o.hide), width: 2 * E, height: 2 * E, ...ground }, g);
  // Сітка залежить лише від свого типу й R — будуємо раз і переставляємо ту саму групу в новий кадр
  // (сотні рисок через setAttribute — найдорожча частина перебудови на кожен крок повзунка)
  const rk = `${o.ret}|${R}`;
  if (svg._ret?.key !== rk) { svg._ret = { key: rk, node: mk('g', {}) }; C.draw(svg._ret.node, R); }
  gc.append(svg._ret.node);
  // Позначки, що залежать від зсуву прицілу, — окремою групою: швидкий шлях перемальовує лише її
  const ov = mk('g', {}, gc);
  const marks = (p, at) => {
    if (p.mode === 'aim' && !p.noHold && (Math.abs(p.hx) > 0.05 || Math.abs(p.hy) > 0.05)) {
      // Кільце там, що ставиться на ціль, і підпис виносу поруч — щоб «де тримати» було видно на самій сітці
      // Кільце обводить зону ураження з запасом — на дальній дистанції не закриває її, а обрамлює
      const x = p.hx * k; const y = p.hy * k; const r = Math.max(R * 0.04 / z, kzReach(p.tgt, p.noTarget ? null : pick, p.zone) * H * 1.25);
      mk('circle', { cx: x, cy: y, r, class: 'r-hold', 'stroke-width': R * 0.005 / z }, ov);
      // Стрілки — куди виносити приціл (мітка ліворуч від центру = брати правіше), а не де стоїть мітка на сітці
      const parts = [Math.abs(p.hy) > 0.05 ? `${p.hy > 0 ? '↑' : '↓'}${f(Math.abs(y), C.u === 'MOA' ? 1 : 2)}` : null,
        Math.abs(p.hx) > 0.05 ? `${p.hx > 0 ? '←' : '→'}${f(Math.abs(x), C.u === 'MOA' ? 1 : 2)}` : null].filter(Boolean);
      const right = x < (R / z) * 0.45;
      // Підпис — за край цілі, щоб не закривав зону ураження; якщо ціль широка й край поза полем зору — біля кільця
      const edge = right ? at.cx + (T.w * H) / 2 + r : at.cx - (T.w * H) / 2 - r;
      const lx = right ? Math.max(x + r * 1.5, edge) : Math.min(x - r * 1.5, edge);
      const fits = right ? lx < at.vx + half * 0.35 : lx > at.vx - half * 0.35;
      const text = `${parts.join(' ')} ${C.u}`; const fs = (R * 0.095) / z;
      let ax = fits ? lx : right ? x + r * 1.5 : x - r * 1.5; let ay = y + (R * 0.033) / z; let anchor = right ? 'start' : 'end';
      // Збоку не влазить у коло (ціль ширша за поле, як людина на 25 м) — під кільцем, а внизу місця нема — над ним
      const edgeX = Math.min(half, Math.sqrt(Math.max(0, R * R - y * y))) * 0.97; const w = text.length * fs * 0.58;
      if (right ? ax + w > at.vx + edgeX : ax - w < at.vx - edgeX) {
        ax = Math.max(at.vx - edgeX + w / 2, Math.min(at.vx + edgeX - w / 2, x)); anchor = 'middle';
        ay = y + r + fs * 1.1 < at.vy + half * 0.9 ? y + r + fs * 1.1 : y - r - fs * 0.4;
      }
      const label = mk('text', {
        x: ax, y: ay, 'text-anchor': anchor,
        style: `font:700 ${fs}px system-ui,sans-serif;fill:var(--shoot);paint-order:stroke;stroke:var(--surface);stroke-width:${(R * 0.03) / z}px`,
      }, ov);
      label.textContent = text;
    }
    // Розкид гвинтівки: коло групи навколо точки, куди піде куля (p.disp — діаметр в одиницях сітки)
    if (p.disp && p.mode === 'aim' && !p.noTarget) {
      const [gx, gy] = p.hit ? p.hit : [p.hx, p.hy];
      mk('circle', { cx: gx * k, cy: gy * k, r: (p.disp / 2) * k, class: 'r-disp', 'stroke-width': (R * 0.008) / z }, ov);
    }
    if (p.hit) {
      // «Винос» після відповіді: ✕ — куди пішла куля (мітка виносу, плюс розкид), зелене кільце — куди мав дивитись центр (ціль мінус винос)
      const [px, py] = p.hit.map((v, i) => (v + (p.sp?.[i] ?? 0)) * k); const a = (R * 0.02) / z;
      mk('circle', { cx: (p.hx - p.hit[0]) * k, cy: (p.hy - p.hit[1]) * k, r: (R * 0.045) / z, class: 'r-ok', 'stroke-width': (R * 0.014) / z }, ov);
      mk('path', { d: `M${px - a} ${py - a}L${px + a} ${py + a}M${px - a} ${py + a}L${px + a} ${py - a}`, class: 'r-hit', 'stroke-width': (R * 0.012) / z }, ov);
    }
    if (p.hint) {
      // Навчальна підказка: відрізки від перехрестя до мітки виносу (у «Вітрі» — окремо вертикаль і вітер), біля кінця кожного — підпис
      const fs = (R * 0.09) / z; const sw = (R * 0.01) / z;
      for (const [i, h] of p.hint.entries()) {
        const [x0, y0] = h.from.map((v) => v * k); const [x, y] = h.to.map((v) => v * k);
        if (Math.hypot(x - x0, y - y0) > R * 0.03) mk('path', { d: `M${x0} ${y0}L${x} ${y}`, class: 'r-hint', 'stroke-width': sw }, ov);
        if (i === p.hint.length - 1) mk('circle', { cx: x, cy: y, r: (R * 0.03) / z, class: 'r-hint', 'stroke-width': sw }, ov);
        if (!h.text) continue;
        // Вертикаль — підпис збоку (з того боку, куди не йде вітер); вітер — над стрілкою
        const flat = Math.abs(y - y0) < Math.abs(x - x0);
        const side = h.side ?? (x > R * 0.3 ? -1 : 1);
        const lx = flat ? (x0 + x) / 2 : x + side * (R * 0.06) / z; const ly = flat ? (h.below ? y + fs * 1.15 : y - fs * 0.55) : y + fs * 0.35;
        const label = mk('text', { x: lx, y: ly, 'text-anchor': flat ? 'middle' : side < 0 ? 'end' : 'start', class: 'r-hint-t',
          style: `font:700 ${fs}px system-ui,sans-serif;stroke-width:${fs * 0.18}px` }, ov);
        label.textContent = h.text;
      }
    }
  };
  marks(o, { cx, vx, vy });
  const ring = mk('circle', { cx: 0, cy: 0, r: R, class: 'r-l', 'stroke-width': R * 0.02 }, svg);
  svg._sc = { key, pos, g, cx, top, half, H, shown, ring, ov, marks, n: svg.childNodes.length };
  return { figs: shown, place: o.mode === 'range' ? null : { cx, top, H } };
}

function mini(host, o, cap) {
  const fig = document.createElement('figure');
  const s = mk('svg', { class: 'ret', role: 'img', 'aria-label': cap.replace(/<[^>]+>/g, ' ') });
  fig.append(s);
  scope(s, o);
  const c = document.createElement('figcaption');
  c.innerHTML = cap;
  fig.append(c);
  host.append(fig);
}

/** Великі сітки з розмірами та галереї «як виглядає ціль на N м». */
export function initReticles(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  if ($('dsmr-big')) dsmr($('dsmr-big'), 29.5);
  if ($('bplex-big')) bplex($('bplex-big'), 46);
  const gal = $('range-gallery');
  if (gal) {
    [100, 200, 300, 400, 500, 600].forEach((d) => mini(gal, { ret: 'dsmr', mag: 6, dist: d, tgt: 'man', mode: 'range' },
      `<b>${d} ${t('м')}</b>${t('зріст {v} MRAD', { v: f(1700 / d, 1) })}`));
  }
  const pair = $('sfp-pair');
  if (pair) {
    mini(pair, { ret: 'dsmr', mag: 6, dist: 300, tgt: 'man', mode: 'range' }, `<b>${t('300 м на 6×')}</b>${t('5,7 поділки = 5,7 MRAD')}`);
    mini(pair, { ret: 'dsmr', mag: 3, dist: 300, tgt: 'man', mode: 'range' }, `<b>${t('300 м на 3×')}</b>${t('2,8 поділки, але це ті самі 5,7 MRAD')}`);
  }
  const bgal = $('bplex-gallery');
  if (bgal) {
    [200, 300, 400, 500, 600, 700].forEach((d) => mini(bgal, { ret: 'bplex', mag: 7, dist: d, tgt: 'man', mode: 'range' },
      `<b>${d} ${t('м')}</b>${t('зріст {v} MOA', { v: f(170 * 34.377 / d, 1) })}`));
  }
}

// ---------- тренажер ----------

// Балістика, пристрілка 100 м, через 50 м від 50 до 700 м. Додатне — винос угору. Таблиці — для стандартної погоди
// (+15 °C, рівень моря); під іншу погоду тренажер рахує solve() з bc (G7, за швидкістю) і sh (приціл над стволом, см).
export const LOADS = {
  m855: {
    ret: 'dsmr', gr: 62, mvs: [['905', '14,5″ · 905 м/с'], ['915', '16″ · 915 м/с'], ['948', '20″ · 948 м/с']], def: '915', zeroLbl: '50/200 м',
    sh: 7, bc: { 905: 0.151, 915: 0.151, 948: 0.151 },
    H: {
      905: [0.36, 0, 0.13, 0.42, 0.79, 1.22, 1.72, 2.28, 2.91, 3.62, 4.42, 5.33, 6.36, 7.53],
      915: [0.37, 0, 0.13, 0.4, 0.76, 1.18, 1.67, 2.21, 2.83, 3.52, 4.29, 5.17, 6.17, 7.31],
      948: [0.39, 0, 0.1, 0.35, 0.67, 1.06, 1.5, 2.01, 2.57, 3.2, 3.9, 4.7, 5.61, 6.63],
    },
    W: {
      905: [0.034, 0.07, 0.108, 0.148, 0.192, 0.238, 0.287, 0.341, 0.398, 0.46, 0.528, 0.602, 0.683, 0.77],
      915: [0.033, 0.068, 0.106, 0.146, 0.188, 0.234, 0.282, 0.335, 0.391, 0.452, 0.518, 0.59, 0.67, 0.755],
      948: [0.031, 0.065, 0.1, 0.138, 0.178, 0.221, 0.267, 0.316, 0.369, 0.426, 0.487, 0.555, 0.629, 0.709],
    },
    T: {
      905: [0.057, 0.117, 0.182, 0.251, 0.324, 0.403, 0.487, 0.578, 0.676, 0.783, 0.898, 1.024, 1.162, 1.312],
      915: [0.056, 0.116, 0.18, 0.248, 0.32, 0.398, 0.481, 0.571, 0.668, 0.772, 0.886, 1.01, 1.146, 1.294],
      948: [0.054, 0.112, 0.173, 0.239, 0.308, 0.383, 0.463, 0.548, 0.641, 0.74, 0.848, 0.966, 1.094, 1.235],
    },
    lim: 600, limTxt: 'Далі ніж 600 м M855 близький до дозвуку: кучність різко падає',  // перекладається через t() у draw()
  },
  b308: {
    ret: 'bplex', gr: 175, mvs: [['720', '16,5″ · 720 м/с'], ['740', '16,5″ · 740 м/с'], ['760', '16,5″ · 760 м/с']], def: '740', zeroLbl: '200 м',
    sh: 4, bc: { 720: 0.243, 740: 0.243, 760: 0.243 },
    H: {
      720: [-0.39, 0, 1.41, 3.17, 5.13, 7.28, 9.59, 12.07, 14.74, 17.61, 20.69, 24.01, 27.58, 31.44],
      740: [-0.3, 0, 1.31, 2.95, 4.8, 6.82, 8.99, 11.33, 13.84, 16.52, 19.41, 22.51, 25.86, 29.46],
      760: [-0.21, 0, 1.22, 2.76, 4.5, 6.4, 8.44, 10.65, 13, 15.53, 18.24, 21.15, 24.28, 27.65],
    },
    W: {
      720: [0.1, 0.2, 0.31, 0.42, 0.54, 0.66, 0.79, 0.93, 1.07, 1.22, 1.38, 1.54, 1.72, 1.91],
      740: [0.1, 0.2, 0.3, 0.41, 0.52, 0.64, 0.76, 0.89, 1.02, 1.17, 1.32, 1.48, 1.64, 1.82],
      760: [0.09, 0.19, 0.29, 0.39, 0.5, 0.61, 0.73, 0.85, 0.98, 1.12, 1.26, 1.41, 1.57, 1.74],
    },
    T: {
      720: [0.071, 0.145, 0.222, 0.302, 0.387, 0.475, 0.567, 0.664, 0.765, 0.872, 0.984, 1.103, 1.228, 1.36],
      740: [0.069, 0.141, 0.216, 0.294, 0.376, 0.461, 0.55, 0.644, 0.742, 0.845, 0.954, 1.068, 1.189, 1.316],
      760: [0.067, 0.137, 0.21, 0.286, 0.365, 0.448, 0.535, 0.626, 0.721, 0.821, 0.926, 1.036, 1.153, 1.275],
    },
    lim: 600, limTxt: 'Далі ніж 600 м з короткого ствола куля підходить до трансзвуку: розкид росте, а помилка дальності коштує дорого',
  },
  // ACOG: M855 (62 гр, G7 0,151), приціл ≈6,6 см над стволом, пристрілка 100 м; риски Trijicon лягають на 14,5″ (M4) — див. нижче
  acog: {
    ret: 'acog', gr: 62, mvs: [['905', '14,5″ · 905 м/с'], ['915', '16″ · 915 м/с'], ['948', '20″ · 948 м/с']], def: '905', zeroLbl: '200 м',
    sh: 6.6, bc: { 905: 0.151, 915: 0.151, 948: 0.151 },
    H: {
      905: [1.11, 0.0, 0.51, 1.51, 2.79, 4.3, 6.02, 7.95, 10.12, 12.57, 15.32, 18.43, 21.97, 26.0, 30.57, 35.66],
      915: [1.13, 0.0, 0.48, 1.45, 2.7, 4.16, 5.83, 7.72, 9.83, 12.2, 14.88, 17.9, 21.33, 25.24, 29.68, 34.64],
      948: [1.21, 0.0, 0.39, 1.26, 2.4, 3.74, 5.27, 7.0, 8.93, 11.1, 13.54, 16.28, 19.39, 22.92, 26.95, 31.5],
    },
    W: {
      905: [0.116, 0.239, 0.37, 0.51, 0.659, 0.818, 0.988, 1.171, 1.368, 1.582, 1.815, 2.069, 2.347, 2.646, 2.941, 3.223],
      915: [0.114, 0.235, 0.364, 0.501, 0.648, 0.804, 0.971, 1.15, 1.343, 1.553, 1.781, 2.03, 2.302, 2.597, 2.892, 3.176],
      948: [0.108, 0.222, 0.344, 0.474, 0.612, 0.76, 0.917, 1.086, 1.267, 1.463, 1.676, 1.908, 2.161, 2.438, 2.731, 3.018],
    },
    T: {
      905: [0.057, 0.117, 0.182, 0.251, 0.324, 0.403, 0.487, 0.578, 0.676, 0.783, 0.898, 1.024, 1.162, 1.312, 1.47, 1.634],
      915: [0.056, 0.116, 0.18, 0.248, 0.32, 0.398, 0.481, 0.571, 0.668, 0.772, 0.886, 1.01, 1.146, 1.294, 1.451, 1.613],
      948: [0.054, 0.112, 0.173, 0.239, 0.308, 0.383, 0.463, 0.548, 0.641, 0.74, 0.848, 0.966, 1.094, 1.235, 1.387, 1.546],
    },
    lim: 600, limTxt: 'Далі ніж 600 м M855 близький до дозвуку: кучність різко падає',
  },
  // EBR-2C: .308 175 гр (G7 0,243) з 20–24″, приціл ≈4,5 см над стволом, пристрілка 100 м
  ebr: {
    ret: 'ebr2c', gr: 175, mvs: [['775', '20″ · 775 м/с'], ['795', '22″ · 795 м/с'], ['815', '24″ · 815 м/с']], def: '795', zeroLbl: '200 м',
    sh: 4.5, bc: { 775: 0.243, 795: 0.243, 815: 0.243 },
    H: {
      775: [0.01, 0.0, 0.32, 0.74, 1.22, 1.74, 2.31, 2.92, 3.58, 4.28, 5.03, 5.84, 6.7, 7.64, 8.64, 9.73],
      795: [0.03, 0.0, 0.29, 0.69, 1.14, 1.64, 2.17, 2.75, 3.37, 4.03, 4.74, 5.5, 6.31, 7.19, 8.13, 9.15],
      815: [0.05, 0.0, 0.27, 0.64, 1.07, 1.54, 2.04, 2.59, 3.17, 3.8, 4.47, 5.18, 5.95, 6.77, 7.66, 8.62],
    },
    W: {
      775: [0.026, 0.053, 0.082, 0.111, 0.141, 0.173, 0.207, 0.241, 0.278, 0.316, 0.356, 0.398, 0.443, 0.49, 0.54, 0.593],
      795: [0.025, 0.051, 0.079, 0.107, 0.136, 0.167, 0.199, 0.232, 0.267, 0.304, 0.342, 0.382, 0.425, 0.47, 0.517, 0.567],
      815: [0.024, 0.049, 0.076, 0.103, 0.131, 0.161, 0.192, 0.224, 0.257, 0.292, 0.329, 0.368, 0.408, 0.451, 0.496, 0.544],
    },
    T: {
      775: [0.066, 0.134, 0.206, 0.28, 0.358, 0.439, 0.524, 0.613, 0.706, 0.803, 0.905, 1.013, 1.127, 1.246, 1.373, 1.506],
      795: [0.064, 0.131, 0.2, 0.273, 0.349, 0.427, 0.51, 0.596, 0.686, 0.781, 0.88, 0.984, 1.094, 1.209, 1.331, 1.46],
      815: [0.063, 0.128, 0.195, 0.266, 0.34, 0.416, 0.496, 0.58, 0.668, 0.76, 0.856, 0.957, 1.063, 1.175, 1.292, 1.417],
    },
    lim: 900, limTxt: '',
  },
};


// M193 55 гр (G7 0,121, Litz) — другий набій до наборів 5.56: тим самим розрахунком, що таблиці M855 (висота прицілу 7 / 6,6 см, пристрілка 100 м)
const M193_GR = { 930: 55, 950: 55, 990: 55 };
const M193 = {"m855":{"tab":{"930":{"H":[0.37,0,0.13,0.43,0.81,1.28,1.84,2.48,3.23,4.1,5.12,6.33,7.73,9.32],"W":[0.041,0.084,0.132,0.183,0.239,0.3,0.366,0.439,0.52,0.61,0.711,0.818,0.921,1.019],"T":[0.056,0.116,0.181,0.252,0.329,0.412,0.504,0.606,0.718,0.843,0.982,1.136,1.298,1.466]},"950":{"H":[0.38,0,0.12,0.39,0.76,1.2,1.73,2.33,3.04,3.86,4.83,5.97,7.3,8.81],"W":[0.039,0.082,0.128,0.177,0.231,0.289,0.353,0.423,0.501,0.587,0.684,0.79,0.893,0.992],"T":[0.055,0.113,0.177,0.246,0.321,0.403,0.492,0.59,0.699,0.82,0.955,1.105,1.265,1.431]},"990":{"H":[0.41,0,0.09,0.33,0.65,1.05,1.53,2.07,2.7,3.44,4.3,5.31,6.5,7.87],"W":[0.037,0.076,0.119,0.166,0.216,0.27,0.33,0.395,0.466,0.546,0.635,0.734,0.838,0.938],"T":[0.052,0.109,0.169,0.235,0.307,0.384,0.469,0.562,0.664,0.778,0.905,1.046,1.201,1.364]}}},"acog":{"tab":{"930":{"H":[1.14,0,0.5,1.53,2.88,4.5,6.41,8.62,11.2,14.2,17.73,21.89,26.71,32.14,38.18,44.8],"W":[0.14,0.29,0.453,0.63,0.821,1.03,1.257,1.508,1.786,2.096,2.443,2.812,3.166,3.503,3.824,4.133],"T":[0.056,0.116,0.181,0.252,0.329,0.412,0.504,0.606,0.718,0.843,0.982,1.136,1.298,1.466,1.641,1.822]},"950":{"H":[1.19,0,0.45,1.41,2.69,4.22,6.03,8.12,10.56,13.39,16.71,20.63,25.2,30.39,36.19,42.57],"W":[0.135,0.281,0.438,0.609,0.794,0.995,1.214,1.455,1.722,2.019,2.351,2.714,3.071,3.411,3.735,4.046],"T":[0.055,0.113,0.177,0.246,0.321,0.403,0.492,0.59,0.699,0.82,0.955,1.105,1.265,1.431,1.604,1.784]},"990":{"H":[1.27,0,0.34,1.19,2.33,3.72,5.34,7.22,9.4,11.93,14.89,18.36,22.45,27.17,32.5,38.41],"W":[0.126,0.263,0.41,0.57,0.742,0.93,1.134,1.357,1.603,1.877,2.182,2.523,2.88,3.225,3.554,3.869],"T":[0.052,0.109,0.169,0.235,0.307,0.384,0.469,0.562,0.664,0.778,0.905,1.046,1.201,1.364,1.533,1.709]}}}};
for (const key of ['m855', 'acog']) {
  const L = LOADS[key];
  for (const [mv, t] of Object.entries(M193[key].tab)) { L.H[mv] = t.H; L.W[mv] = t.W; L.T[mv] = t.T; L.bc[mv] = 0.121; }
  L.mvs = [...L.mvs.map(([v, l]) => [v, l.replace(' · ', ' · M855 · ')]), ...[["930", "14,5″ · M193 · 930 м/с"], ["950", "16″ · M193 · 950 м/с"], ["990", "20″ · M193 · 990 м/с"]]];
}

// Назви сіток — для вибору, якою сіткою дивитись на свою таблицю DOPE
// Шторка «Гвинтівка й набій»: розділи, назва прицілу й набій довідкових наборів; у сітки — тип і що показати в мініатюрі
const KIT_INFO = {
  m855: { sec: 'ar', scope: 'Delta Stryker HD 1–6', ammo: '5.56 M855' },
  se16: { sec: 'ar', scope: 'Vortex Strike Eagle 1–6', ammo: '5.56 M855' },
  pa16: { sec: 'ar', scope: 'Primary Arms SLx 1–6 FFP', ammo: '5.56 M855' },
  pst16: { sec: 'ar', scope: 'Vortex Viper PST II 1–6', ammo: '5.56 M855' },
  t6t: { sec: 'ar', scope: 'SIG Tango6T 1–6 FFP', ammo: '5.56 M855' },
  lp3: { sec: 'ar', scope: 'Leupold Mark 3HD 1,5–4', ammo: '5.56 M855' },
  acog: { sec: 'fix', scope: 'Trijicon ACOG TA31 4×', ammo: '5.56 M855' },
  b308: { sec: '308', scope: 'Burris Scout 2–7', ammo: '.308 175 гр' },
  ebr: { sec: '308', scope: 'Vortex Diamondback 4–16', ammo: '.308 175 гр' },
};
const KIT_SECTIONS = { own: 'Моя зброя', ar: 'AR-15 · змінні з 1×', fix: 'Призми', '308': '.308 · марксман і снайпер' };
// view — [центр x, центр y, півсторона] мініатюри в одиницях сітки: найхарактерніша частина
const RET_INFO = {
  dsmr: { kind: 'шкала', view: [0, 1.5, 6.5] }, bplex: { kind: 'BDC', view: [0, 4, 12] }, acog: { kind: 'BDC', view: [0, 12, 17] },
  ebr2c: { kind: 'шкала', view: [0, 2, 6] }, vmr2: { kind: 'шкала', view: [0, 2, 6] }, dwlr: { kind: 'BDC', view: [0, 5, 7] }, lpar: { kind: 'BDC', view: [0, 1.2, 4.6] }, arbdc3: { kind: 'BDC', view: [0, 4, 13] }, raptor: { kind: 'BDC', view: [0, 0, 19] },
};

/** Мініатюра сітки — та сама функція малювання, що й у прицілі, тож завжди точна. */
function retThumb(r) {
  const C = RET[r]; const v = RET_INFO[r]?.view; const box = document.createElement('span');
  box.className = 'ret-mini'; box.setAttribute('aria-hidden', 'true');
  if (!C || !v) return box;
  const [cx, cy, s] = v;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${cx - s} ${cy - s} ${2 * s} ${2 * s}`);
  const g = mk('g', {}, svg);
  C.draw(g, s * 3, s * 3);
  box.append(svg);
  return box;
}

/** Мітки сітки: одиниці, площина (де мітки вірні), тип і кратність — коротко, для рядка вибору. */
function retTags(r, unit = null) {
  const C = RET[r]; if (!C) return [];
  // Площина й кратність однією міткою: у наших сіток друга площина калібрована на найбільшій кратності
  const zoom = C.min === C.cal ? `${C.cal}×` : `${String(C.min).replace('.', ',')}–${C.cal}×`;
  const plane = C.min === C.cal ? zoom : `${C.ffp ? 'FFP' : 'SFP'} · ${zoom}`;
  return [unit ?? C.u, plane, RET_INFO[r]?.kind].filter(Boolean);
}

// Strike Eagle 1–6 на AR-15: M855 — ті самі таблиці, що в ACOG (у MOA, висота прицілу ≈6,6 см), Vortex радить пристрілку 50/200 ярдів
LOADS.se16 = { ...LOADS.acog, base: 'acog', ret: 'arbdc3', def: '915', zeroLbl: '50/200 м', bdc: { by: 'Vortex', ammo: '5.56 55–77 гр', zero: 200 } };
// Viper PST II 1–6 з VMR-2 MRAD: M855 — ті самі таблиці в мілах, що в DSMR; пристрілка 50/200
LOADS.pst16 = { ...LOADS.m855, base: 'm855', ret: 'vmr2', def: '915', zeroLbl: '50/200 м' };
// SIG Tango6T DVO з DWLR-6: M855 у мілах, пристрілка 100 м, як радить SIG
LOADS.t6t = { ...LOADS.m855, base: 'm855', ret: 'dwlr', def: '915', zeroLbl: '50/200 м', bdc: { by: 'SIG', ammo: '5.56 55 гр', gr: 55, zero: 100 } };
// Leupold Mark 3HD 1,5–4 з AR-Ballistic: M855 у мілах; Leupold радить пристрілку 200 ярдів
LOADS.lp3 = { ...LOADS.m855, base: 'm855', ret: 'lpar', def: '915', zeroLbl: '200 м', bdc: { by: 'Leupold', ammo: '.223 55 гр', gr: 55, zero: 200 } };
// SLx 1–6 FFP з ACSS Raptor: PA радить пристрілку вершини шеврона на 100 ярдів (M855 з 16″ — +0,5″ на 300 м висоти)
LOADS.pa16 = { ...LOADS.acog, base: 'acog', ret: 'raptor', def: '915', zeroLbl: '200 м', bdc: { by: 'Primary Arms', ammo: 'M855 / M193', zero: 100 } };

const RET_NAME = { dsmr: 'Stryker DSMR · MRAD', ebr2c: 'Vortex EBR-2C · MRAD', bplex: 'Burris Ballistic Plex · MOA', acog: 'Trijicon ACOG · MOA', arbdc3: 'Vortex AR-BDC3 · MOA', raptor: 'Primary Arms ACSS Raptor · MOA', vmr2: 'Vortex VMR-2 · MRAD', dwlr: 'SIG DWLR-6 · MRAD', lpar: 'Leupold AR-Ballistic · MRAD' };
export const MOA_IN_MRAD = 0.290888;

/** Лінійно між сусідніми точками; за межами — крайнє значення (повзунок дистанції однаково не виходить за таблицю). */
function lerpRows(list, d, key) {
  if (d <= list[0].distance) return list[0][key];
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]];
    if (d <= b.distance) return a[key] + ((b[key] - a[key]) * (d - a.distance)) / (b.distance - a.distance);
  }
  return list.at(-1)[key];
}

/**
 * Своя таблиця DOPE з картки зброї → набір тренажера: поправки й вітер з таблиці (через 50 м, в одиницях сітки),
 * без часу польоту — тож без упередження, швидкості й поправки на повітря. null — у таблиці замало рядків.
 */
/**
 * Своя зброя з картки; пристрілка — з картки прицілу. З набоєм (BC, швидкість) — свій розрахунок під погоду панелі,
 * сітка — довідкова тих самих одиниць; без набою — довідкова балістика калібру.
 */
function gunLoad(g) {
  const base = { 556: { mil: 'm855', moa: 'acog' }, 308: { mil: 'ebr', moa: 'b308' } }[g.cal]?.[g.reticle];
  const zero = g.zero >= 50 && g.zero <= 700 ? g.zero : null;
  if (!g.ammo) return base ? { ...LOADS[base], base, gun: true, label: `${g.name} · ${g.scope}`, zero } : null;
  if (g.reticle !== 'mil' && g.reticle !== 'moa') return null;
  const a = g.ammo; const sh = g.sh > 0 ? g.sh : 7;
  const u = g.reticle === 'moa' ? 1 / MOA_IN_MRAD : 1;
  const run = (tC, alt) => solve({ bc: a.bc, model: a.model, mv: a.mv, sh, zero: 100, tC, alt });
  const std = run(15, 0);
  if (!std) return null;
  // Межа — як у довідкових: швидкість нижче 450 м/с, далі трансзвук
  const i = std.V.findIndex((v) => v < 450); const lim = i < 0 ? Infinity : i * 50;
  // Повзунки погоди тягнуть draw() на кожен крок — таблиця на погоду рахується раз; не долетіла — лишаємо попередню
  const cache = new Map(); let last = std;
  const calc = (tC, alt) => {
    const key = `${tC}|${alt}`;
    if (!cache.has(key)) cache.set(key, run(tC, alt) ?? last);
    last = cache.get(key);
    return { H: last.H.map((v) => v * u), W: last.W.map((v) => v * u), T: last.T };
  };
  return {
    gun: true, calc, ammo: a, sh, shSet: g.sh > 0, zero, lim, label: `${g.name} · ${g.scope} · ${a.name}`,
    ret: base ? LOADS[base].ret : g.reticle === 'moa' ? 'bplex' : 'dsmr', gr: a.gr,
    mvs: [[String(a.mv), `${a.mv} ${t('м/с')} · ${a.chrono ? t('хронограф') : t('з картки набою')}`]], def: String(a.mv),
    zeroLbl: `200 ${t('м')}`, limTxt: t('Далі {n} м куля підходить до трансзвуку: розкид зростає, а помилка дальності коштує дорого', { n: lim }),
  };
}

// Пристрілка на вибір; таблиці — для 100 м, інша дистанція повертає лінію прицілу на кут поправки там
const ZEROS = [50, 100, 150, 200, 300];
export const zeroShift = (H, z) => (z === 100 ? 0 : at(H, z));

export function myLoad(m) {
  const pts = (m.rows ?? []).filter((r) => r.distance > 0 && Number.isFinite(r.mrad)).map((r) => ({ distance: r.distance, mrad: r.mrad, wind: r.wind }));
  if (m.zero > 0 && !pts.some((r) => r.distance === m.zero)) pts.push({ distance: m.zero, mrad: 0 });
  pts.sort((a, b) => a.distance - b.distance);
  if (pts.length < 2) return null;
  const dmin = Math.max(50, Math.ceil(pts[0].distance / 25) * 25); const dmax = Math.floor(pts.at(-1).distance / 25) * 25;
  if (dmax <= dmin) return null;
  const winds = [{ distance: 0, wind: 0 }, ...pts.filter((r) => r.wind > 0)];
  const windy = m.windSpeed > 0 && winds.length > 1;
  const ret = m.reticle === 'moa' ? 'bplex' : 'dsmr';
  const L = { my: true, label: m.label, unit: m.reticle === 'moa' ? 'MOA' : m.reticle === 'mil' ? 'MRAD' : null, ret, gr: null,
    mvs: [['0', 'DOPE']], def: '0', zeroLbl: '—', T: null, lim: Infinity, limTxt: '', dmin, dmax, windy, wx: m.wx ?? null, wxCache: new Map() };
  // Поправки в одиницях вибраної сітки; перераховуються, коли сітку міняють
  L.fill = () => {
    const k = RET[L.ret].u === 'MOA' ? 1 / MOA_IN_MRAD : 1;
    const n = Math.max(2, Math.ceil(dmax / 50));
    const ds = Array.from({ length: n }, (_, i) => 50 * (i + 1));
    L.H = { 0: ds.map((d) => lerpRows(pts, d, 'mrad') * k) };
    L.W = { 0: ds.map((d) => (windy ? (lerpRows(winds, d, 'wind') / m.windSpeed) * k : 0)) };
  };
  L.fill();
  return L;
}

/**
 * H, W, T для набору й швидкості за погоди: температура (°C) і висота (м). Довідкові набори — solve() з їхніми bc і sh:
 * погода змінює і щільність, і швидкість звуку. Повзунки тягнуть draw() на кожен крок — таблиця на погоду рахується раз.
 * Швидкість зі зміною температури пороху не враховано.
 */
const atmCache = new Map();

/** Зсув своєї таблиці від погоди таблиці до tC, alt — MRAD по її дистанціях (через 50 м); null — розрахунок не долетів. */
function wxDelta(L, tC, alt) {
  const key = `${tC}|${alt}`;
  if (!L.wxCache.has(key)) {
    const w = L.wx; const max = 50 * L.H[0].length;
    const run = (t0, a0) => solve({ bc: w.bc, model: w.model, mv: w.mv, sh: w.sh, zero: w.zero, tC: t0, alt: a0, max });
    const now = run(tC, alt); const base = run(w.tC, w.alt);
    L.wxCache.set(key, now && base ? now.H.map((v, i) => v - base.H[i]) : null);
  }
  return L.wxCache.get(key);
}
export function atmTab(kit, mv, tC, alt) {
  const L = LOADS[kit];
  if (L.my) {
    // Своя таблиця з погодою й набоєм з BC — як «Поправки зараз»: цифри таблиці + (розрахунок за погоди панелі −
    // розрахунок за погоди таблиці). Без цього — таблиця як є. Вітер — з таблиці, часу польоту немає
    const d = L.wx ? wxDelta(L, tC, alt) : null;
    if (!d) return { H: L.H[0], W: L.W[0], T: null };
    const k = RET[L.ret].u === 'MOA' ? 1 / MOA_IN_MRAD : 1;
    return { H: L.H[0].map((v, i) => v + d[i] * k), W: L.W[0], T: null };
  }
  if (L.calc) return L.calc(tC, alt);
  const base = L.base ?? kit; const B = LOADS[base];
  const key = `${base}|${mv}|${tC}|${alt}`;
  if (!atmCache.has(key)) {
    const k = RET[B.ret].u === 'MOA' ? 1 / MOA_IN_MRAD : 1;
    const s = solve({ bc: B.bc[mv], mv: +mv, sh: B.sh, zero: 100, tC, alt, max: 50 * B.H[mv].length });
    // Не долетіла (у межах повзунків так не буває) — стандартна таблиця, а не порожньо: винос береться з неї без перевірок
    atmCache.set(key, s ? { H: s.H.map((v) => v * k), W: s.W.map((v) => v * k), T: s.T } : { H: B.H[mv], W: B.W[mv], T: B.T[mv] });
  }
  return atmCache.get(key);
}

/** Мінілінія прогресу серій: values — чим вище, тим краще; SVG-рядок на всю ширину. */
function sparkline(values) {
  if (values.length < 2) return null;
  const lo = Math.min(...values); const hi = Math.max(...values); const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${26 - ((v - lo) / span) * 22}`).join(' ');
  const el = document.createElement('span');
  el.className = 'spark';
  el.innerHTML = `<svg viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  return el;
}

export function at(arr, d) {
  const x = d / 50 - 1;
  const i = Math.max(0, Math.min(arr.length - 2, Math.floor(x)));
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
}

/**
 * Поправка по вертикалі; ближче 50 м — не прямою в MRAD (вийшло б 0,55 замість ≈1,7 на 25 м), а з траєкторії:
 * пониження кулі під лінією прицілу (H·d) — майже парабола від дула, де воно дорівнює висоті прицілу; ведемо її через 50/100/150 м.
 */
export function holdAt(H, d) {
  if (d >= 50) return at(H, d);
  const [a, b, c] = [H[0] * 50, H[1] * 100, H[2] * 150];
  const y = (a * (d - 100) * (d - 150)) / 5000 - (b * (d - 50) * (d - 150)) / 2500 + (c * (d - 50) * (d - 100)) / 5000;
  return y / d;
}

/**
 * Швидкість кулі на дистанції d з таблиці часу польоту T (через 50 м від 50 м): похідна відстані за часом,
 * у вузлах — центральна різниця (похибка ≈1 %), від дула — mv; між вузлами — лінійно.
 */
export function speedAt(T, mv, d) {
  const t = [0, ...T]; const n = t.length;
  const v = t.map((_, i) => (i === 0 ? mv : i === n - 1 ? 50 / (t[i] - t[i - 1]) : 100 / (t[i + 1] - t[i - 1])));
  const x = Math.max(0, Math.min(n - 1, d / 50)); const i = Math.min(n - 2, Math.floor(x));
  return v[i] + (v[i + 1] - v[i]) * (x - i);
}

function bplexWhere(v, M, beyond = 'нижче за кінчик стовпа — крути барабан') {
  if (v <= 0) return `${t(M[0][1])}${v < -0.2 ? ` ${t('(тримати трохи нижче)')}` : ''}`;
  for (let i = 1; i < M.length; i++) {
    if (v <= M[i][0]) {
      const a = M[i - 1]; const b = M[i]; const part = (v - a[0]) / (b[0] - a[0]);
      if (part < 0.15) return t(a[1]);
      if (part > 0.85) return t(b[1]);
      return t('між «{a}» і «{b}», {near}', { a: t(a[1]), b: t(b[1]), near: part < 0.5 ? t('ближче до першої') : t('ближче до другої') });
    }
  }
  return t(beyond);
}

/** Тренажер: вид у приціл з ціллю, виносом і вітром. */
// Відкладене збереження тренажера — дописати, якщо сторінку закривають чи згортають
let flushSim = null;
addEventListener('pagehide', () => flushSim?.());
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSim?.(); });

export function initSim(root, { clockPicker, keepPlace = (el, fn) => fn(), kitPicker, myLoads, myGuns, windGuesses, hereWeather } = {}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const svg = $('sim-svg');
  if (!svg) return;
  // ret — зсув прицілу в далекомірі (ціль іде назустріч); не зберігаємо: нова ціль чи приціл починають з цілі на місці
  const st = { mode: 'aim', tgt: 'man', zoom: 1, ret: [0, 0], meas: 1, real: null, ink: null, head: false };
  // Реалізм: сцена й боєць — на кожне завдання свої (holder — завдання q або вільний приціл st), поки ціль та сама
  // Кілька бійців на кадрі: кнопка «Ціль» перемикає на наступного (figs — з scope: [x, верх, ноги]).
  // Зріст той самий, тож менший на кадрі стоїть далі: d · h₀ / h; масштаб кадру від зміни цілі не змінюється
  let figs = null;
  // Бійці останнього кадру — і кнопка «Ціль»: видно, лише коли їх кілька й ціль ще можна міняти
  const setFigs = (f, holder) => {
    figs = f;
    const b = $('sim-fig'); if (!b) return;
    b.hidden = !(f?.length > 1);
    if (!b.hidden) b.querySelector('span').textContent = `${holder.scene[1] + 1}/${f.length}`;
  };
  // Перейти на бійця j: дистанція до нього з дистанції попереднього — пропорційно зросту цілі й обернено висоті на кадрі
  // (на колінах 1 м, стоячи 1,7 м); тип цілі — його. Рахуємо від точної, а не округленої дистанції (повзунок — крок 25 м):
  // інакше по колу бійців похибка накопичується
  const figDist = (holder, j, dist) => {
    const [sk, i] = holder.scene; const F = SCENES[sk].figs;
    const per = (n) => figH(F[n][0], F[n]) / (F[n][2] - F[n][1]);
    const d0 = Math.abs((holder.dExact ?? Infinity) - dist) < 13 ? holder.dExact : dist;
    holder.scene = [sk, j]; holder.sceneTgt = F[j][0]; holder.dExact = d0 * per(j) / per(i);
    return { dist: Math.round(holder.dExact), tgt: F[j][0] };
  };
  const realOf = (holder, tgt) => {
    if (!st.real) return { real: null };
    if (!holder.scene || holder.sceneTgt !== tgt) { holder.scene = pickScene(tgt, st.real); holder.sceneTgt = tgt; }
    return { real: holder.scene[0], fig: holder.scene[1] };
  };
  // Далекомір: чим міряти (ріст, голова, плечі, довжина) — у верхньому рядку поруч із кнопками режимів;
  // вибране підсвічене скобою на цілі
  const measBox = document.createElement('div');
  measBox.className = 'sim-meas'; measBox.hidden = true;
  measBox.setAttribute('role', 'group');
  measBox.setAttribute('aria-label', t('Чим міряти'));
  root.querySelector('.ctl > .sim-row .sim-line').append(measBox);
  const measPop = Object.assign(document.createElement('div'), { className: 'sim-pop aim-bar meas-bar', id: 'pop-meas', hidden: true });
  measPop.setAttribute('role', 'group'); measPop.setAttribute('aria-label', t('Чим міряти'));
  $('pop-aim').after(measPop);
  // Кнопка під лупою — з'являється, коли приціл у далекомірі зсунули
  const retReset = Object.assign(document.createElement('button'), { type: 'button', className: 'sim-zoom sim-ret', textContent: '⟲', hidden: true });
  retReset.setAttribute('aria-label', t('Повернути ціль на місце'));
  retReset.title = t('Повернути ціль на місце');
  svg.parentElement.append(retReset);
  const paintRetReset = (on) => { retReset.hidden = !on; };
  retReset.addEventListener('click', () => {
    if (quiz) { quiz.cur.ret = [0, 0]; rangeScope(); } else { st.ret = [0, 0]; draw(); }
  });

  // Лупа на точці з довгого натискання; «⌖» повертає її як було (на ціль / точку виносу)
  const focusReset = Object.assign(document.createElement('button'), { type: 'button', className: 'sim-zoom sim-focus', textContent: '⌖', hidden: true });
  focusReset.setAttribute('aria-label', t('Лупа — назад до цілі'));
  focusReset.title = t('Лупа — назад до цілі');
  svg.parentElement.append(focusReset);
  const paintFocus = () => { focusReset.hidden = !st.focus || st.zoom <= 1; };
  focusReset.addEventListener('click', () => { st.focus = null; draw(); });

  // Своя зброя з карток — зверху: з прицілом на довідковій балістиці калібру (gun:<зброя>:<приціл>) і таблиці DOPE (my:<id таблиці>)
  for (const key of Object.keys(LOADS)) if (/^(my|gun):/.test(key)) delete LOADS[key];
  const kitSel = $('s-kit');
  kitSel.querySelector('optgroup.my-dope')?.remove();
  const kitName = (k) => kitSel.querySelector(`option[value="${k}"]`)?.textContent ?? '';
  const mine = [...(myGuns?.() ?? []).map((g) => [`gun:${g.id}`, gunLoad(g)]), ...(myLoads?.() ?? []).map((m) => [`my:${m.id}`, myLoad(m)])]
    .filter(([, L]) => L);
  if (mine.length) {
    // Свої — зверху; вбудовані набори тоді теж групою, щоб не висіли без заголовка під нею
    const grp = Object.assign(document.createElement('optgroup'), { label: t('Моя зброя'), className: 'my-dope' });
    for (const [key, L] of mine) {
      LOADS[key] = L;
      // Своя зброя: пристрілка з картки й чий набій у розрахунку — свій може лягти інакше
      const text = L.gun ? [L.label, L.zero ? t('пристрілка {n} м', { n: L.zero }) : t('пристрілку не вказано'),
        L.ammo ? `${L.ammo.model} ${f(L.ammo.bc, 3)} · ${L.ammo.mv} ${t('м/с')}` : t('розрахунок як {k}', { k: kitName(L.base).split(' + ')[1] })].join(' · ')
        : `${L.label} · ${t('таблиця DOPE')}`;
      grp.append(Object.assign(document.createElement('option'), { value: key, textContent: text }));
    }
    let base = kitSel.querySelector('optgroup.builtin');
    if (!base) {
      base = Object.assign(document.createElement('optgroup'), { label: t('Довідкові набори'), className: 'builtin' });
      base.append(...kitSel.querySelectorAll(':scope > option'));
      kitSel.append(base);
    }
    kitSel.prepend(grp);
  }
  // Системний список — лише сховище значення; на екрані — шторка застосунку (поза ним, у довіднику, лишається список)
  // Шторка вибору: розділи (своя зброя, AR-15, призми й коліматори, .308), у рядку — мініатюра сітки, приціл, набій і мітки
  const describeKit = (value) => {
    const L = LOADS[value]; if (!L) return null;
    const own = /^(my|gun):/.test(value);
    const parts = own ? L.label.split(' · ') : [];
    const info = KIT_INFO[value];
    const title = own ? parts[0] : info?.scope ?? kitName(value);
    const ammo = own ? (L.my ? 'DOPE' : parts.slice(1).join(' · ')) : info?.ammo ?? '';
    const sub = document.createElement('span'); sub.className = 'kit-sub';
    if (ammo) sub.append(Object.assign(document.createElement('span'), { className: 'kit-ammo', textContent: ammo }));
    for (const tag of retTags(L.ret, L.my ? L.unit : null)) sub.append(Object.assign(document.createElement('span'), { className: 'kit-tag', textContent: t(tag) }));
    const sec = own ? 'own' : info?.sec ?? 'ar';
    return { lead: retThumb(L.ret), title, sub, section: [sec, t(KIT_SECTIONS[sec])] };
  };
  const paintKit = kitPicker?.(kitSel, describeKit) ?? (() => {});
  // Сітка для своєї таблиці — у панелі «Гвинтівка й набій»; одиниці сітки — ті, що в прицілі таблиці
  const myRet = document.createElement('select'); myRet.id = 's-myret';
  const myRetLabel = document.createElement('label');
  myRetLabel.append(t('Сітка'), myRet); myRetLabel.hidden = true;
  kitSel.closest('label').after(myRetLabel);
  myRet.addEventListener('change', () => { const L = LOADS[kitSel.value]; L.ret = myRet.value; L.fill(); setupKit(); draw(); });
  const dist = $('s-dist'); const DIST0 = [dist.min, dist.max];

  const setupKit = () => {
    const L = LOADS[$('s-kit').value];
    // Своя таблиця: дистанція — у межах таблиці; пристрілка, повітря й ствол уже в ній — вимикаємо
    myRetLabel.hidden = !L.my;
    if (L.my) {
      myRet.replaceChildren(...Object.keys(RET_NAME).filter((r) => !L.unit || RET[r].u === L.unit).map((r) => {
        const op = document.createElement('option'); op.value = r; op.textContent = RET_NAME[r]; op.selected = r === L.ret;
        return op;
      }));
    }
    [dist.min, dist.max] = L.my ? [L.dmin, L.dmax] : DIST0;
    dist.value = Math.max(+dist.min, Math.min(+dist.max, +dist.value));
    // Своя таблиця з погодою й BC набою перераховується під погоду панелі — повітря тоді лишається ввімкненим
    for (const id of ['s-barrel', 's-temp', 's-alt']) $(id).disabled = !!L.my && (id === 's-barrel' || !L.wx);
    const hereB = $('s-here'); if (hereB) hereB.disabled = $('s-temp').disabled; const C = RET[L.ret]; const sel = $('s-barrel'); const mag = $('s-mag');
    sel.replaceChildren(...L.mvs.map(([value, label]) => {
      const op = document.createElement('option');
      op.value = value; op.textContent = label; op.selected = value === L.def;
      return op;
    }));
    // Пристрілка: своя зброя — з картки прицілу (міняють там), інакше — вибір; 200 м у M855 — це й 50 м
    const zs = $('s-zero'); const z0 = +zs.value || 100; const zeros = L.zero ? [L.zero] : ZEROS;
    zs.replaceChildren(...zeros.map((v) => Object.assign(document.createElement('option'), {
      value: String(v), textContent: L.zero ? t('{n} м · з картки', { n: v }) : `${v} ${t('м')}` })));
    // Новий набір — пристрілка, під яку виробник розрахував мітки (сітки-шкали й решта — 100 м); далі міняй як хочеш
    const kitNow = $('s-kit').value; const fresh = zs.dataset.kit !== kitNow; zs.dataset.kit = kitNow; fillCmp();
    zs.value = String(L.zero ?? (fresh ? L.bdc?.zero ?? 100 : zeros.includes(z0) ? z0 : 100));
    zs.disabled = !!L.my || !!L.zero;
    mag.min = C.min; mag.max = C.cal; mag.value = C.cal;
    // Замість значка — діапазон кратності прицілу; у ACOG кратність одна, діапазону нема
    $('s-mag-r').textContent = C.min === C.cal ? '' : `${fm(C.min)}–${fm(C.cal)}×`;
    // Засічки кратності — цілі значення від мінімуму до калібрувальної, як на дистанції
    let ticks = mag.parentElement.querySelector('.ticks');
    if (!ticks) { ticks = document.createElement('span'); ticks.className = 'ticks'; ticks.setAttribute('aria-hidden', 'true'); mag.after(ticks); }
    let list = root.querySelector('#mag-ticks');
    if (!list) { list = document.createElement('datalist'); list.id = 'mag-ticks'; mag.after(list); mag.setAttribute('list', 'mag-ticks'); }
    const marks = Array.from({ length: +mag.max - +mag.min + 1 }, (_, i) => +mag.min + i);
    ticks.replaceChildren(...marks.map((v) => Object.assign(document.createElement('span'), { textContent: `${v}×` })));
    list.replaceChildren(...marks.map((v) => Object.assign(document.createElement('option'), { value: String(v) })));
  };

  let drag = null; let swiped = false; let paintWind = null; let editAt = null;
  // Розмітка сцен: тягнеш плиту чи голову бійця по прицілу, «Розмір зон» — під пропорції кадру; діє одразу всюди на цьому пристрої
  const markBar = document.createElement('div');
  markBar.className = 'sim-markbar'; markBar.hidden = true;
  const markTitle = document.createElement('b');
  const markHint = Object.assign(document.createElement('span'), { className: 'muted' });
  const markScale = Object.assign(document.createElement('input'), { type: 'range', step: '0.01', id: 's-mark-scale' });
  const markScaleV = document.createElement('b');
  const markScaleL = Object.assign(document.createElement('label'), { htmlFor: 's-mark-scale', className: 'mark-scale' });
  markScaleL.append(Object.assign(document.createElement('span'), { textContent: t('Висота фігури: каска — земля') }), markScaleV, markScale);
  const markBtn = (label, fn, cls = '') => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: cls }); b.addEventListener('click', fn); return b; };
  const markText = Object.assign(document.createElement('textarea'), { readOnly: true, hidden: true, className: 'mark-text' });
  markText.setAttribute('aria-label', t('Розмітка сцен'));
  const curFig = () => { const sr = st.real ? realOf(st, st.tgt) : null; return sr?.real ? figOf(sr.real, sr.fig, st.tgt) : null; };
  const qFig = (q) => (st.real && q.scene ? figOf(q.scene[0], q.scene[1], q.tgt) : null);
  // Чим міряти цю ціль: зріст (висота) — справжній ріст бійця з розмітки; у бійців, чиї голова чи плечі на кадрі
  // намальовані не в пропорції (nm у розмітці), ці виміри не пропонуємо — дальність за ними вийшла б хибною
  const measList = (key = st.tgt, fig = curFig()) => (MEAS[key] ?? [])
    .filter(([n]) => !markOf(fig)?.nm?.includes(n))
    .map(([n, size, seg], i) => (i === 0 && (n === 'зріст' || n === 'висота') ? [n, figH(key, fig), seg]
      : n === 'голова–пах' ? [n, Math.round(figH(key, fig) * 0.53 * 100) / 100, seg] : [n, size, seg]));
  /** Зона ураження словами: назва, розмір у см і кутовий на дистанції d — MRAD і MOA, щоб порівняти з кучністю гвинтівки. */
  const zoneText = (key, fig, zone, d) => {
    const kz = aimOf(key, fig, zone)?.kz; if (!kz) return null;
    const fh = figH(key, fig);
    const [zw, zh] = kz[0] === 'c' ? [2 * kz[3] * fh, 2 * kz[3] * fh] : [kz[3] * fh, kz[4] * fh];
    const round = Math.abs(zw - zh) < 0.005;
    const ang = (k) => (round ? f(zw * k / d, 1) : `${f(zw * k / d, 1)}×${f(zh * k / d, 1)}`);
    const name = kz[0] === 'c' && HEAD[key] ? 'Зона (голова)' : kz[0] === 'p' ? (zone === 'torso' ? 'Зона (увесь торс)' : 'Зона (груди)') : 'Зона ураження';
    return { name, size: `${round ? `⌀${f(zw * 100, 0)}` : `${f(zw * 100, 0)}×${f(zh * 100, 0)}`} ${t('см')}`, ang: `${ang(1000)} MRAD · ${ang(3437.75)} MOA` };
  };
  const MODE_ICO = { aim: $('m-aim').innerHTML, range: $('m-range').innerHTML };
  // draw() іде на кожен рух пальця — значок міняємо, лише коли він справді інший
  const setIco = (btn, html) => { if (btn.dataset.ico !== html) { btn.dataset.ico = html; btn.innerHTML = html; } };
  // Є з чого вибирати, куди цілитись: у цілі є голова, і видно не лише її (в окопі — тільки голова)
  const aimChoice = () => { const z = zonesOf(st.tgt, curFig()); return !!z.head && !!z.body; };
  const saveMarks = () => { try { localStorage.setItem(MARKS, JSON.stringify(marks)); } catch { /* приватний режим */ } };
  const copyBtn = markBtn(t('Скопіювати'), async () => {
    const txt = Object.keys(marks).map((id) => {
      const cut = id.lastIndexOf('-'); const f = SCENES[id.slice(0, cut)]?.figs[+id.slice(cut + 1)];
      return f ? `${id}: ${markTxt(markOf(f))}` : null;
    }).filter(Boolean).join('\n');
    markText.value = txt; markText.hidden = !txt;
    if (!txt) copyBtn.textContent = t('Нема що копіювати');
    else {
      try { await navigator.clipboard.writeText(txt); copyBtn.textContent = t('Скопійовано'); }
      catch { markText.focus(); markText.select(); copyBtn.textContent = t('Виділено — скопіюйте'); }
    }
    setTimeout(() => { copyBtn.textContent = t('Скопіювати'); }, 1800);
  });
  // Тип бійця міняє й вибрану ціль: сцена та сама, боєць той самий — інакше realOf підбере іншу сцену під новий тип
  const setFigType = (f, tp) => {
    if (f[0] === tp) return;
    f[0] = tp; st.tgt = tp; st.sceneTgt = tp; tgtSel.value = tp; st.meas = 1; paintTgt(); draw();
  };
  const resetBtn = markBtn(t('Скинути бійця'), () => { const f = curFig(); if (f) { delete marks[f.id]; saveMarks(); if (f[0] !== f.tp0) setFigType(f, f.tp0); else draw(); } });
  // Тип бійця: поза визначає силует для влучань «у ціль», типовий ріст і що ним міряти. Ріст лишаємо тим самим — кадр не стрибає
  const FIG_TYPES = [['man', 'стоячи'], ['kneel', 'на коліні'], ['chest', 'грудна'], ['prone', 'лежачи']];
  const markType = Object.assign(document.createElement('div'), { className: 'seg mark-seg' });
  markType.setAttribute('role', 'group'); markType.setAttribute('aria-label', t('Тип бійця'));
  for (const [tp, label] of FIG_TYPES) {
    const b = markBtn(t(label), () => {
      const f = curFig(); if (!f || f[0] === tp) return;
      const h = figH(f[0], f);
      marks[f.id] = { ...marks[f.id], h, ...(tp === f.tp0 ? {} : { tp }) };
      if (tp === f.tp0) delete marks[f.id].tp;
      saveMarks(); setFigType(f, tp);
    });
    b.dataset.tp = tp; markType.append(b);
  }
  // Зони: груди (плита) і голова — вимкнути, коли їх за укриттям не видно; хоч одна лишається
  const markZones = Object.assign(document.createElement('div'), { className: 'seg mark-seg' });
  markZones.setAttribute('role', 'group'); markZones.setAttribute('aria-label', t('Зони'));
  for (const [key, label] of [['only', 'груди'], ['nohd', 'голова']]) {
    const b = markBtn(t(label), () => {
      const f = curFig(); if (!f) return;
      const m = markOf(f); const other = key === 'only' ? 'nohd' : 'only';
      if (!m[key] && m[other]) return;
      marks[f.id] = { ...marks[f.id], [key]: !m[key] };
      saveMarks(); draw();
    });
    b.dataset.key = key; markZones.append(b);
  }
  const row = (label, ctl) => { const l = Object.assign(document.createElement('div'), { className: 'mark-row' }); l.append(Object.assign(document.createElement('span'), { textContent: t(label) }), ctl); return l; };
  const markTypeRow = row('Тип', markType); const markZonesRow = row('Зони', markZones);
  const markActs = Object.assign(document.createElement('div'), { className: 'mark-acts' });
  markActs.append(resetBtn, copyBtn, markBtn(t('Готово'), () => { st.edit = false; draw(); }, 'primary'));
  // Ориентир висоти фігури для пози бійця — щоб було від чого відштовхуватися
  const POSE_H = { man: 'стоячи — 1,6–1,85 м', kneel: 'на коліні з прямою спиною — 1,15–1,3 м, присів низько — 1,0–1,1 м', prone: 'лежачи — 0,4–0,6 м', chest: 'видно частину над укриттям — від каски до краю' };
  const markPose = Object.assign(document.createElement('span'), { className: 'muted mark-pose' });
  markBar.append(markTitle, markHint, markTypeRow, markZonesRow, markScaleL, markPose, markActs, markText);
  markScale.addEventListener('input', () => {
    const f = curFig(); if (!f) return;
    // Ріст міняє масштаб кадру — дистанцію лишаємо, боєць і зони стають більшими чи меншими разом
    marks[f.id] = { ...marks[f.id], h: +markScale.value }; saveMarks(); draw();
  });
  function paintMarkBar() {
    markBar.hidden = !st.edit;
    if (!st.edit) return;
    const f = curFig(); const m = markOf(f); const cut = f ? f.id.lastIndexOf('-') : 0;
    markTitle.textContent = f ? t('Розмітка: {scene}, боєць {n}', { scene: t(SCENES[f.id.slice(0, cut)].name), n: +f.id.slice(cut + 1) + 1 }) : t('Розмітка сцен');
    markHint.textContent = !f ? t('Виберіть фото-сцену з бійцем') : st.mode === 'range' ? t('Перемкніться на прицілювання')
      : t('Тягніть плиту чи голову по прицілу. Висотою фігури (на коліні — близько 1,2 м, стоячи — ріст) підженіть коло голови ⌀16 см під обличчя. Зберігається одразу');
    markScaleL.hidden = !f; markTypeRow.hidden = !f; markZonesRow.hidden = !f; resetBtn.disabled = !f || !marks[f.id];
    if (f) {
      markType.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tp === f[0])));
      markZones.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!m[b.dataset.key])));
    }
    markPose.hidden = !f || !POSE_H[st.tgt]; markPose.textContent = POSE_H[st.tgt] ? `${t('Орієнтир')}: ${t(POSE_H[st.tgt])}` : '';
    if (f) {
      const base = TGT[st.tgt].h; const h = figH(st.tgt, f);
      markScale.min = String(r3(Math.min(base * 0.65, h))); markScale.max = String(r3(Math.max(base * 1.35, h))); markScale.value = String(h);
      markScaleV.textContent = `${h.toFixed(2).replace('.', ',')} ${t('м')}`;
    }
  }
  const tool = (key) => root.querySelector(`.sim-tool[data-panel="${key}"]`);
  const toolIco = (key) => tool(key).querySelector('svg');
  const toolHot = (key, on) => tool(key).classList.toggle('hot', on);
  // Поворот значка — плавно лише при зміні; щойно намальований значок одразу стає як треба, без прокруту при вході
  const toolTurn = (key, tf) => {
    const ico = toolIco(key);
    if (ico.dataset.set) { ico.style.transform = tf; return; }
    ico.style.transition = 'none'; ico.style.transform = tf;
    void ico.getBoundingClientRect();
    ico.style.transition = ''; ico.dataset.set = '1';
  };
  // Підпис кнопки — назва з розмітки (мовою сторінки) і, якщо є, уточнення через крапку
  const toolLabel = (key, extra) => {
    const el = tool(key).querySelector('.sim-tool-t');
    el.dataset.name ??= el.textContent;
    el.textContent = extra ? `${el.dataset.name} · ${extra}` : el.dataset.name;
  };
  // Розкид гвинтівки (s-disp, MOA групи) — в одиницях сітки
  const dispOf = (u) => (+($('s-disp')?.value ?? 0)) / (u === 'MOA' ? 1 : 3.4377);
  // Клацання барабана: скільки на одиницю сітки й підпис кроку; ACOG барабаном не тримають
  const clickStep = (ret, moa) => (ret === 'acog' ? null : ret === 'bplex' ? [4.19, '¼″'] : ret === 'arbdc3' ? [2, '½ MOA']
    : ret === 'vmr2' || ret === 'dwlr' ? [5, '0,2'] : moa ? [4, '¼ MOA'] : [10, '0,1']);
  // Мітка сітки коротко — для таблиці й підказки: назва мітки або «між A і B»
  const markShort = (v, C) => {
    const M = C.marks; if (!M) return '';
    if (v <= 0) return t(M[0][1]);
    for (let i = 1; i < M.length; i++) {
      if (v > M[i][0]) continue;
      const a = M[i - 1]; const b = M[i]; const part = (v - a[0]) / (b[0] - a[0]);
      return part < 0.15 ? t(a[1]) : part > 0.85 ? t(b[1]) : `${t(a[1])} – ${t(b[1])}`;
    }
    return t(C.beyond ?? 'нижче за кінчик стовпа — крути барабан');
  };
  // Винос будь-якого набору за тих самих умов: другий приціл бере свою пристрілку (під яку виробник розрахував мітки) і свій ствол
  const holdOf = (kit, d, { w = 0, hour = 0, vt = 0, goRight = true, mv = null, z = null } = {}) => {
    const L = LOADS[kit]; const moa = RET[L.ret].u === 'MOA';
    const tb = atmTab(kit, mv ?? L.def, +$('s-temp').value, +$('s-alt').value);
    const hy = holdAt(tb.H, d) - (L.my ? 0 : zeroShift(tb.H, z ?? L.zero ?? L.bdc?.zero ?? 100));
    const wm = L.my && !L.windy ? 0 : at(tb.W, d) * w * Math.abs(Math.sin((hour * Math.PI) / 6));
    const lead = vt && tb.T && !L.my ? (vt * at(tb.T, d) / d) * (moa ? 3437.75 : 1000) : 0;
    return { hy, hx: (hour > 6 ? wm : -wm) + (goRight ? -lead : lead), tb };
  };
  // Другий приціл під основним: та сама ціль, дистанція, вітер і рух — видно, де тримати в ньому
  const cmpBox = Object.assign(document.createElement('div'), { className: 'sim-cmp', hidden: true });
  $('sim-out').before(cmpBox);
  // Другий приціл малюється не частіше, ніж раз на кадр: при перетягуванні pointermove приходить частіше, а фото-сцена важка
  let cmpArgs = null;
  const paintCmp = (d, cond) => {
    const first = !cmpArgs; cmpArgs = [d, cond];
    if (first) requestAnimationFrame(() => { const a = cmpArgs; cmpArgs = null; paintCmpNow(...a); });
  };
  const paintCmpNow = (d, cond) => {
    const other = $('s-cmp')?.value;
    cmpBox.hidden = !other || !LOADS[other] || !!quiz;
    if (cmpBox.hidden) return;
    cmpBox.replaceChildren();
    const L = LOADS[other]; const C = RET[L.ret]; const dg = C.u === 'MOA' ? 1 : 2;
    // Кратність — та сама, що в основного, у межах цього прицілу; друга площина не на своїй кратності — мітки не ті, про це в підписі
    const mag = Math.max(C.min, Math.min(C.cal, +$('s-mag').value));
    const magTxt = ` · ${fm(mag)}×${!C.ffp && mag < C.cal ? ` (${t('мітки вірні на {n}×', { n: C.cal })})` : ''}`;
    // Зсув і точка лупи основного — той самий кут і в другому: через справжні кутові одиниці (MRAD ↔ MOA, кратність)
    const Cm = RET[LOADS[$('s-kit').value].ret]; const km = kOf(Cm, +$('s-mag').value);
    const conv = (Cm.u === C.u ? 1 : C.u === 'MOA' ? 3.4377 : 1 / 3.4377) * kOf(C, mag) / km;
    const focus = st.focus ? st.focus.map((v) => v * conv) : null;
    // Далекомір: та сама ціль і скоба «чим міряти» — скільки поділок вона займає в другій сітці
    if (st.mode === 'range') {
      const MS = measList(); const [nm, size] = MS[st.meas - 1] ?? [null, figH(st.tgt, curFig())];
      const what = nm ? t(nm).replace(/^./, (c) => c.toUpperCase()) : t('Ціль');
      const cap = `<b>${RET_NAME[L.ret] ?? kitName(other)}</b><br>${what} ${mFmt(size)} ${t('м')} = ${f(C.size(size, d) * kOf(C, mag), dg)} ${C.u}${magTxt}`;
      mini(cmpBox, { ret: L.ret, mag, dist: d, tgt: st.tgt, mode: 'range', hx: 0, hy: 0, rx: st.ret[0] * conv, ry: st.ret[1] * conv, meas: st.meas, zoom: st.zoom, focus, ...realOf(st, st.tgt), ink: st.ink }, cap);
      return;
    }
    const h = holdOf(other, d, cond);
    const cap = `<b>${RET_NAME[L.ret] ?? kitName(other)}</b><br>${h.hy >= 0 ? '↑' : '↓'}${f(Math.abs(h.hy), dg)} ${C.u}${C.marks ? ` · ${markShort(h.hy, C)}` : ''}${magTxt}`;
    // Лупа — та сама, що в основного: обидва приціли видно однаково
    mini(cmpBox, { ret: L.ret, mag, dist: d, tgt: st.tgt, mode: 'aim', hx: h.hx, hy: h.hy, zoom: st.zoom, focus, ...realOf(st, st.tgt), ink: st.ink,
      flip: cond.vt > 0 && !cond.goRight, move: cond.vt > 0 ? (cond.goRight ? 1 : -1) : 0 }, cap);
  };
  const fillCmp = () => {
    const sel = $('s-cmp'); if (!sel) return;
    const keep = sel.value;
    sel.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: t('ні') }),
      ...[...kitSel.options].filter((op) => op.value !== kitSel.value).map((op) => Object.assign(document.createElement('option'), { value: op.value, textContent: op.textContent })));
    sel.value = [...sel.options].some((op) => op.value === keep) ? keep : '';
  };
  // Картка поправок для свого набору: дистанція → тримати, кліки, вітер 1 м/с, мітка сітки; картинкою — на приклад
  const dopeCard = () => {
    const kit = $('s-kit').value; const L = LOADS[kit]; const C = RET[L.ret]; const moa = C.u === 'MOA'; const dg = moa ? 1 : 2;
    const mv = $('s-barrel').value; const z = L.zero ?? +$('s-zero').value; const cs = clickStep(L.ret, moa);
    const tb = atmTab(kit, mv, +$('s-temp').value, +$('s-alt').value);
    const [d0, d1] = L.my ? [L.dmin, L.dmax] : [100, Math.min(+DIST0[1], Number.isFinite(L.lim) ? L.lim + 100 : +DIST0[1])];
    const rows = [];
    for (let d = Math.ceil(d0 / 50) * 50; d <= d1; d += 50) {
      const hy = holdAt(tb.H, d) - (L.my ? 0 : zeroShift(tb.H, z)); const ah = Math.abs(hy);
      rows.push([String(d), `${hy >= 0 ? '↑' : '↓'}${f(ah, dg)}`, cs ? String(Math.round(ah * cs[0])) : '—',
        L.my && !L.windy ? '—' : f(at(tb.W, d), dg), markShort(hy, C)]);
    }
    const [name, ...rest] = L.gun || L.my ? L.label.split(' · ') : kitName(kit).split(' + ');
    const tC = +$('s-temp').value; const alt = +$('s-alt').value;
    const sub = [L.my || L.gun ? rest.join(' · ') || null : null, L.my ? 'DOPE' : $('s-barrel').selectedOptions[0]?.textContent, L.my ? null : `${t('пристрілка')} ${z} ${t('м')}`,
      L.my && !L.wx ? null : `${tC > 0 ? '+' : ''}${tC}°C · ${alt} ${t('м')}`].filter(Boolean).join(' · ');
    const head = [t('м'), `${t('Тримати')}, ${C.u}`, cs ? `${t('кл.')} ${cs[1]}` : t('кл.'), `${t('Вітер 1 м/с')}`, C.marks ? t('Мітка') : ''];
    // Холст: білий фон і чорний текст — щоб друкувалось і читалось на сонці
    const W = 760; const rh = 38; const top = 104; const cols = [16, 86, 220, 330, 470];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = top + rh * (rows.length + 1) + 34;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, cv.height);
    c.fillStyle = '#111'; c.font = '700 26px system-ui, sans-serif'; c.fillText(name, 16, 38);
    c.fillStyle = '#555'; c.font = '500 17px system-ui, sans-serif'; c.fillText(sub, 16, 66);
    c.font = '600 15px system-ui, sans-serif'; head.forEach((h, i) => c.fillText(h, cols[i], top));
    rows.forEach((r, j) => {
      const y = top + rh * (j + 1);
      if (j % 2 === 0) { c.fillStyle = '#f0f0ec'; c.fillRect(8, y - rh + 12, W - 16, rh); }
      c.fillStyle = '#111';
      r.forEach((v, i) => {
        c.font = i === 1 ? '700 20px ui-monospace, Consolas, monospace' : i === 4 ? '500 15px system-ui, sans-serif' : '500 19px ui-monospace, Consolas, monospace';
        let txt = v; while (i === 4 && txt.length > 3 && c.measureText(txt).width > W - cols[4] - 12) txt = `${txt.slice(0, -2)}…`;
        c.fillText(txt, cols[i], y + 8);
      });
    });
    c.fillStyle = '#888'; c.font = '500 13px system-ui, sans-serif';
    c.fillText(`Shooter’s Log · ${new Date().toLocaleDateString(locale())}`, 16, cv.height - 12);
    return { cv, file: `dope-${name.replace(/[^\p{L}\p{N}]+/gu, '-')}.png` };
  };
  const dopeDlg = Object.assign(document.createElement('dialog'), { className: 'sim-dope' });
  svg.closest('.sim').append(dopeDlg);
  dopeDlg.addEventListener('click', (e) => { if (e.target === dopeDlg) dopeDlg.close(); });
  const openDope = () => {
    const { cv, file } = dopeCard();
    const close = Object.assign(document.createElement('button'), { type: 'button', className: 'quiz-stop', textContent: t('Закрити') });
    close.addEventListener('click', () => dopeDlg.close());
    const saveBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'quiz-go', textContent: t('Зберегти картинкою') });
    saveBtn.addEventListener('click', () => cv.toBlob((b) => {
      if (!b) return;
      const fl = new File([b], file, { type: 'image/png' });
      if (navigator.canShare?.({ files: [fl] })) { navigator.share({ files: [fl] }).catch(() => {}); return; }
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: file });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png'));
    const row = Object.assign(document.createElement('div'), { className: 'quiz-row' }); row.append(saveBtn, close);
    dopeDlg.replaceChildren(cv, row);
    dopeDlg.showModal();
  };
  // Умови останнього draw(): перетягування в далекомірі міняє лише зсув прицілу, решта сторінки від нього не залежить
  let lastFree = null;
  // Що вже стоїть у подробицях під прицілом — однакове не розбираємо вдруге
  let outHtml = '';
  const dragScope = () => {
    if (!lastFree) { draw(); return; }
    const shot = scope(svg, { ...lastFree.o, rx: st.ret[0], ry: st.ret[1] });
    paintCmp(...lastFree.cmp);
    setFigs(shot.figs, st);
    editAt = shot.place;
    paintRetReset(st.ret[0] || st.ret[1]);
  };
  const draw = () => {
    if (quiz) { cmpBox.hidden = true; drawQuiz(); return; }
    const L = LOADS[$('s-kit').value]; const C = RET[L.ret]; const u = C.u; const moa = u === 'MOA';
    const d = +$('s-dist').value; const m = +$('s-mag').value; const mv = $('s-barrel').value; const z = L.zero ?? +$('s-zero').value;
    const w = +$('s-wind').value; const hour = +$('s-wdir').value || 0;
    const left = hour > 6; const share = Math.abs(Math.sin((hour * Math.PI) / 6));
    paintWind?.();
    $('s-dist-v').textContent = `${d} ${t('м')}`; $('s-mag-v').textContent = `${fm(m)}×`;
    // Кнопки ряду — зведення умов пострілу: підпис зверху, значення під ним; що зсуває поправку — в рамці
    const windOn = w > 0 && !(L.my && !L.windy);
    toolLabel('sim-wind', w > 0 ? t('{n} год', { n: hour }) : '');
    $('s-wind-sum').textContent = w > 0 ? `${fm(w)} ${t('м/с')}` : t('штиль');
    toolHot('sim-wind', windOn);
    // Значок вітру (струмені зліва направо — дме з 9 год) повернуто туди, куди дме
    toolTurn('sim-wind', w > 0 ? `rotate(${(hour - 9) * 30}deg)` : '');
    const opt = (id) => $(id).selectedOptions[0]?.textContent ?? '';
    const tSum = +$('s-temp').value; const aSum = +$('s-alt').value;
    // На кнопці — одним рядком назва й набій (своя таблиця — DOPE); пристрілка й погода — у підказці та в панелі
    const [gunName, ...gunRest] = L.gun || L.my ? L.label.split(' · ') : kitName($('s-kit').value).split(' + ');
    const gunSub = L.my ? 'DOPE' : M193_GR[mv] ? gunRest.join(' · ').replace('M855', 'M193') : gunRest.join(' · ');
    $('s-gun-name').textContent = gunName;
    $('s-gun-sum').textContent = gunSub;
    const gunBtn = tool('sim-gun'); const gunIco = gunBtn.querySelector(':scope > svg, :scope > .ret-mini');
    if (gunIco && gunBtn.dataset.ret !== L.ret) { gunBtn.dataset.ret = L.ret; gunIco.replaceWith(retThumb(L.ret)); }
    tool('sim-gun').title = [gunName, gunSub, L.my ? null : `${t('пристрілка')} ${z} ${t('м')}`,
      !L.my && (tSum !== 15 || aSum) ? `${tSum > 0 ? '+' : ''}${tSum}°${aSum ? ` ${aSum} м` : ''}` : null].filter(Boolean).join(' · ');
    save();
    const tC = +$('s-temp').value; const alt = +$('s-alt').value; const air = airRatio(tC, alt);
    const tb = atmTab($('s-kit').value, mv, tC, alt);
    const ranging = st.mode === 'range';
    const hold = holdAt(tb.H, d) - (L.my ? 0 : zeroShift(tb.H, z));
    const wm = ranging || (L.my && !L.windy) ? 0 : at(tb.W, d) * w * share; const k = kOf(C, m); const T = TGT[st.tgt];
    // Упередження: швидкість × час польоту ÷ дистанція; ціль іде праворуч — центр праворуч від неї (мітка ліворуч від центру)
    // У далекомірі вітер, рух і гвинтівка не потрібні — на їхньому місці кнопки «чим міряти»
    // У далекомірі лишається тільки «Ціль» — вона переходить у верхній рядок значком (перед «чим міряти»), нижній рядок ховається
    const tgtBtn = root.querySelector('[data-pop="pop-tgt"]'); const toolsRow = root.querySelector('.sim-tools');
    // Кнопки на тих самих місцях в обох режимах: «Ціль» і гвинтівка не переїжджають; вітер і рух далекоміру не потрібні —
    // невидимі, але місце тримають, щоб ряд не стрибав
    if (tgtBtn && tgtBtn.parentElement !== toolsRow) toolsRow.prepend(tgtBtn);
    toolsRow.hidden = false;
    for (const key of ['sim-wind', 'sim-move', 'sim-gun']) {
      const btn = tool(key);
      if (!btn) continue;
      // Своя таблиця: руху без часу польоту не порахувати, вітру — без колонки вітру
      const off = key !== 'sim-gun' && L.my && (key === 'sim-move' || !L.windy);
      const away = ranging && key !== 'sim-gun';
      btn.hidden = false;
      btn.style.visibility = away ? 'hidden' : '';
      btn.disabled = off || away;
      if (off || away) { btn.setAttribute('aria-expanded', 'false'); $(key).hidden = true; }
    }
    const vt = ranging || L.my ? 0 : +$('s-mv').value || 0; const goRight = $('s-mvdir').value === 'R'; const tof = tb.T ? at(tb.T, d) : 0;
    const lead = (vt * tof / d) * (moa ? 3437.75 : 1000);
    const hx = (left ? wm : -wm) + (goRight ? -lead : lead);
    const mvRaw = +$('s-mv').value || 0;
    $('s-mv-sum').textContent = mvRaw ? `${t(MOVE_SHORT[mvRaw] ?? `${fm(mvRaw)} м/с`)} ${goRight ? '→' : '←'}` : t('стоїть');
    toolHot('sim-move', vt > 0);
    aimHead = st.head;
    if ((ranging || !aimChoice()) && !$('pop-aim').hidden) { $('pop-aim').hidden = true; $('m-aim').setAttribute('aria-expanded', 'false'); }
    root.querySelectorAll('#pop-aim .aim-opt').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.head === '1') === st.head)));
    // Бігун на значку дивиться туди, куди йде ціль
    toolTurn('sim-move', mvRaw && !goRight ? 'scaleX(-1)' : '');
    // Зріст (висота) на фото — справжній ріст цього бійця з розмітки, а не типовий
    const MS = measList();
    // Чим міряли — за назвою, щоб на наступній цілі лишилося те саме (ріст ↔ висота, плечі ↔ ширина — одне й те саме)
    if (st.measName !== undefined) {
      const same = { зріст: 'висота', висота: 'зріст', плечі: 'ширина', ширина: 'плечі' };
      const at = st.measName === null ? -1 : MS.findIndex(([n]) => n === st.measName || n === same[st.measName]);
      st.meas = st.measName === null ? 0 : at >= 0 ? at + 1 : 1;
    }
    if (st.meas > MS.length) st.meas = 1;
    measBox.hidden = true;
    // Стрічка над прицілом — усі варіанти з картинкою; відкриває її кнопка «Далекомір»
    const measIco = (name) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MEAS_ICON[name] ?? MEAS_ICON['висота']}</svg>`;
    // Стрічка «чим міряти» — заново лише коли змінились варіанти, вибраний чи мова, а не на кожен крок повзунка
    const measKey = JSON.stringify([MS, st.meas, lang()]);
    if (measPop.dataset.key !== measKey) {
      measPop.dataset.key = measKey;
      measPop.replaceChildren(...MS.map(([name, size], i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'aim-opt';
        b.innerHTML = measIco(name);
        b.append(Object.assign(document.createElement('span'), { textContent: `${t(name)} ${mFmt(size)} ${t('м')}` }));
        b.setAttribute('aria-pressed', String(st.meas === i + 1));
        // Ще раз по вибраній — скоба зникає з прицілу (0 — нічого не підсвічено)
        b.addEventListener('click', () => {
          navigator.vibrate?.(8); st.meas = st.meas === i + 1 ? 0 : i + 1; st.measName = st.meas ? name : null;
          measPop.hidden = true; $('m-range').setAttribute('aria-expanded', 'false'); draw();
        });
        return b;
      }));
    }
    if (!ranging && !measPop.hidden) { measPop.hidden = true; $('m-range').setAttribute('aria-expanded', 'false'); }
    // Значки режимів показують вибране: куди цілимось (точка на грудях чи голові) і чим міряємо; нема вибору — звичайний значок
    setIco($('m-aim'), aimChoice() ? aimIcon(st.head) : MODE_ICO.aim);
    $('m-aim').setAttribute('aria-label', aimChoice() ? `${t('Прицілювання')}: ${st.head ? t('голова') : t('центр мас')}` : t('Прицілювання'));
    setIco($('m-range'), MS[st.meas - 1] ? measIco(MS[st.meas - 1][0]) : MODE_ICO.range);
    $('m-range').setAttribute('aria-label', MS[st.meas - 1] ? `${t('Далекомір')}: ${t(MS[st.meas - 1][0])} ${mFmt(MS[st.meas - 1][1])} ${t('м')}` : t('Далекомір'));
    const disp = st.edit ? 0 : dispOf(u);
    lastFree = { o: { ret: L.ret, mag: m, dist: d, tgt: st.tgt, mode: st.mode, hx, hy: hold, meas: ranging ? st.meas : 0, zoom: st.zoom, focus: st.focus, ...realOf(st, st.tgt), ink: st.ink, flash: st.flashAt, flip: vt > 0 && !goRight, move: vt > 0 ? (goRight ? 1 : -1) : 0, edit: st.edit, disp },
      cmp: [d, { w: windOn ? w : 0, hour, vt, goRight }] };
    const shot = scope(svg, { ...lastFree.o, rx: st.ret[0], ry: st.ret[1] });
    paintCmp(...lastFree.cmp);
    setFigs(shot.figs, st);
    editAt = shot.place; paintMarkBar(); paintFocus();
    // Палець по прицілу — свайпи й перетяг, не прокрутка сторінки
    svg.style.touchAction = 'none';
    paintRetReset(ranging && (st.ret[0] || st.ret[1]));
    const tH = figH(st.tgt, curFig()); const sz = C.size(tH, d); const rows = [];
    // У далекомірі — той розмір, що вибраний кнопкою; у прицілюванні — висота цілі
    const [mName, mSize] = ranging && MS.length ? MS[Math.max(0, st.meas - 1)] : [null, tH]; const msz = C.size(mSize, d);
    // Формула — після відповіді й цілком: на вузькому телефоні вона переходить на другий рядок, а «MRAD → м» лишається в першому
    const formula = moa ? `${f(mSize * 100, 0)} см×34,38÷${f(msz, 2)}` : `${f(mSize, 2)}×1000÷${f(msz, 2)}`;
    // Розмір уже є у формулі й на кнопці — у підписі лише що міряємо
    const what = mName ? t(mName).replace(/^./, (c) => c.toUpperCase()) : t('Ціль');
    rows.push(`<div><span class="k">${what} (${C.ffp ? fm(m) : C.cal}×)</span><span class="nw"><span class="v">${f(msz, 2)} ${u}</span> → ${d} ${t('м')}</span> <span class="fx nw">= ${formula}</span></div>`);
    if (ranging && RET_STADIA[L.ret] && !L.my) rows.push(`<div class="fx" data-g="kit"><span class="k">${t('Шкала дальності')}</span>${t(RET_STADIA[L.ret])}</div>`);
    // Яка сітка й де її риски справжні: друга площина — лише на калібрувальній кратності, перша — на будь-якій
    // Під що виробник розрахував мітки: інший набій чи пристрілка — мітки ляжуть не на підписані дистанції
    const gNow = M193_GR[mv] ?? L.gr;
    if (L.bdc && !L.my && ((L.bdc.gr && gNow !== L.bdc.gr) || z !== L.bdc.zero)) {
      rows.push(`<div class="w" data-g="kit"><span class="k">${t('Мітки не під твій постріл')}</span>${t('{by} розрахував їх на {ammo} з пристрілкою {z} м — у тебе {gr} гр, {mz} м; тримай за «Де тримати»', { by: L.bdc.by, ammo: L.bdc.ammo, z: L.bdc.zero, gr: gNow, mz: z })}</div>`);
    }
    if (!L.my) rows.push(`<div class="fx" data-g="kit"><span class="k">${t('Сітка')}</span>${RET_NAME[L.ret]} · ${C.ffp ? t('перша площина — мітки вірні на будь-якій кратності')
      : C.min === C.cal ? t('кратність одна — {n}×', { n: C.cal }) : t('друга площина — мітки вірні лише на {n}×', { n: C.cal })}</div>`);
    // Зона ураження — у подробицях (тап по зведенню), одразу під «Ціль»: видно, чи вистачить кучності
    const zt = !ranging && zoneText(st.tgt, curFig(), null, d);
    if (zt) rows.push(`<div class="fx"><span class="k">${t(zt.name)}</span>${zt.size} = <span class="v">${zt.ang}</span></div>`);
    if (!ranging && disp) rows.push(`<div class="fx"><span class="k">${t('Розкид {s} MOA', { s: $('s-disp').value })}</span>${t('група ⌀{cm} см на {d} м — пунктирне коло', { cm: f(disp * (moa ? 2.9089 : 10) * d / 100, 0), d })}</div>`);
    if (!C.ffp && m < C.cal) rows.push(`<div class="w"><span class="k">${t('Кратність {n}×', { n: fm(m) })}</span>${t('сітка ×{k} — міряй на {c}×', { k: f(C.cal / m, 2), c: C.cal })}</div>`);
    // Коротко, щоб уміщалось в один рядок: стрілка замість «вгору/вниз», кліки — лише в одиницях сітки
    const ah = Math.abs(hold); const up = hold >= 0 ? '↑' : '↓';
    const cs = clickStep(L.ret, moa);
    const clicks = cs ? t('{n} кл. по {s}', { n: Math.round(ah * cs[0]), s: cs[1] }) : t('ACOG тримають по рисках');
    rows.push(`<div><span class="k">${t('Вертикаль')}</span><span class="v">${up}${f(ah, moa ? 1 : 2)} ${u}</span> · ${clicks}</div>`);
    // Розмір зони ураження на цій дистанції — у кутових одиницях, щоб порівняти з кучністю гвинтівки (1 MOA ≈ 2,9 см на 100 м)
    if (C.marks) rows.push(`<div class="p"><span class="k">${C.ffp ? t('Де тримати') : t('Де тримати на {n}×', { n: C.cal })}</span>${bplexWhere(hold, C.marks, C.beyond)}${!C.ffp && m < C.cal ? t(' — на {n}× точки не збігаються', { n: fm(m) }) : ''}</div>`);
    if (!ranging && w > 0 && share < 0.05) rows.push(`<div><span class="k">${t('Вітер {w} м/с з {h} год', { w: fm(w), h: hour })}</span>${t('зустрічний чи попутний: бокового зносу майже немає')}</div>`);
    if (!ranging && w > 0 && share >= 0.05) rows.push(`<div><span class="k">${t('Вітер {w} м/с з {h} год, {from}', { w: fm(w), h: hour, from: left ? t('ліворуч') : t('праворуч') })}${share < 0.95 ? `<span class="fx"> · ${t('знос {p} % від бокового', { p: f(share * 100, 0) })}</span>` : ''}</span><span class="v">${left ? '←' : '→'}${f(wm, moa ? 1 : 2)} ${u}</span><span class="fx">: ${t('центр {side1} цілі, ціль на {v} {u} {side2} від центру', { side1: left ? t('лівіше') : t('правіше'), v: f(wm * k, moa ? 1 : 2), u, side2: left ? t('праворуч') : t('ліворуч') })}</span></div>`);
    if (vt > 0) rows.push(`<div><span class="k">${t('Упередження: ціль іде {v} м/с {dir}', { v: fm(vt), dir: goRight ? t('праворуч') : t('ліворуч') })}</span><span class="v">${goRight ? '→' : '←'}${f(lead, moa ? 1 : 2)} ${u}</span><span class="fx"> = ${fm(vt)} × ${f(tof, 2)} ${t('с')} × ${moa ? '3438' : '1000'} ÷ ${d} · ${t('центр на {v} {u} попереду цілі за ходом руху', { v: f(lead * k, moa ? 1 : 2), u })}</span></div>`);
    // Політ, швидкість і енергія на цій дистанції — одним рядком; швидкість з тієї ж таблиці часу (уже з поправкою на повітря)
    const kg = (M193_GR[mv] ?? L.gr ?? 0) * 6.479891e-5; const v0 = +mv; const vd = tb.T ? speedAt(tb.T, v0, d) : 0;
    const joule = (v) => Math.round((kg * v * v) / 2 / 10) * 10;
    if (L.my && !L.wx) rows.push(`<div class="fx" data-g="kit"><span class="k">${t('Поправки з твоєї таблиці DOPE')}</span>${t('{n} — пристрілка, ствол, набій і погода вже в ній; часу польоту й швидкості в таблиці немає', { n: L.label })}</div>`);
    if (L.wx) {
      const wtxt = (a, b) => `${a > 0 ? '+' : ''}${fm(a)} °C · ${fm(b)} ${t('м')}`;
      const same = L.wx.tC === tC && L.wx.alt === alt;
      const shift = same ? 0 : (wxDelta(L, tC, alt)?.[Math.round(d / 50) - 1] ?? 0) * (moa ? 1 / MOA_IN_MRAD : 1);
      rows.push(`<div class="fx" data-g="kit"><span class="k">${t('Поправки з твоєї таблиці DOPE')}</span>${same
        ? t('{n} — таблиця для {w}, як є; зміни температуру чи висоту — перерахується за набоєм {a}, як у «Поправки зараз»', { n: L.label, w: wtxt(L.wx.tC, L.wx.alt), a: L.wx.ammo })
        : t('{n} — таблиця для {w}, зараз {now}: перераховано за набоєм {a} ({s} на {d} м), як у «Поправки зараз»', { n: L.label, w: wtxt(L.wx.tC, L.wx.alt), now: wtxt(tC, alt), a: L.wx.ammo, s: `${shift >= 0 ? '+' : '−'}${f(Math.abs(shift), moa ? 1 : 2)} ${u}`, d })}</div>`);
    }
    if (L.gun) {
      const why = L.ammo ? t('свій розрахунок: {m} {bc}, {v} м/с ({src}), приціл {sh} см над стволом{dflt}, погода — з панелі', {
        m: L.ammo.model, bc: f(L.ammo.bc, 3), v: L.ammo.mv, src: L.ammo.chrono ? t('хронограф') : t('з картки набою'), sh: fm(L.sh),
        dflt: L.shSet ? '' : t(' (не вказано в картці)') })
        : t('поправки — за набором «{k}»: свій набій може лягти інакше, точно — за таблицею DOPE цієї зброї', { k: kitName(L.base) });
      rows.push(`<div class="fx" data-g="kit"><span class="k">${t('Своя зброя: {n}', { n: L.label })}</span>${why}</div>`);
    }
    // Політ на дистанції — трьома показниками з підписами
    const stat = (v, lab) => `<span class="st"><b>${v}</b><small>${t(lab)}</small></span>`;
    if (!L.my) rows.push(`<div class="fx sts" data-g="fly"><span class="k">${t('На {d} м', { d })}${vd < 343 ? ` · ${t('дозвук')}` : ''}</span>${stat(`${f(tof, 2)} ${t('с')}`, 'час польоту')}${stat(`≈${Math.round(vd / 5) * 5} ${t('м/с')}`, 'швидкість')}${L.gr ? stat(`≈${joule(vd)} ${t('Дж')}`, 'енергія') : ''}</div>`);
    if (!L.my && Math.abs(air - 1) > 0.02) rows.push(`<div class="fx" data-g="fly"><span class="k">${t('Повітря {t} °C, {a} м', { t: tC > 0 ? `+${tC}` : tC, a: alt })}</span>${t('щільність {p} % від стандартної — куля падає {more}; швидкість від температури пороху не враховано', { p: f(air * 100, 0), more: air > 1 ? t('більше') : t('менше') })}</div>`);
    if (d > L.lim) rows.push(`<div class="w" data-g="fly">${t(L.limTxt)}</div>`);
    // «Як пораховано» (лише в подробицях): кожна поправка — карткою з кроками на числах цього пострілу, як памятка у вправах
    if (!ranging) {
      const dg = moa ? 1 : 2; const U = ` ${u}`; const b = (x) => `<b>${x}</b>`;
      const cmOf = (v) => f(Math.abs(v) * (moa ? 2.9089 : 10) * d / 100, 0);
      const card = (title, steps, result) => rows.push(`<div class="fx cs" data-g="calc"><b class="cs-h">${title}</b><ol>${steps.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ol>${result ? `<span class="cs-r">${result}</span>` : ''}</div>`);
      const arrowV = (v) => `${v >= 0 ? '↑' : '↓'}${f(Math.abs(v), dg)}${U}`;
      if (L.my) card(t('Вертикаль'), [t('З твоєї таблиці DOPE на {d} м', { d: b(`${d} ${t('м')}`) })], `${arrowV(hold)} · ≈${cmOf(hold)} ${t('см')}`);
      else {
        const h100 = holdAt(tb.H, d); const zsh = zeroShift(tb.H, z);
        card(t('Вертикаль'), [
          t('Падіння кулі на {d} при пристрілці 100 м — {v}', { d: b(`${d} ${t('м')}`), v: b(f(h100, dg) + U) }),
          z !== 100 ? t('Пристрілка {z} м піднімає траєкторію: − {v}', { z, v: b(f(zsh, dg)) }) : null,
          t('На цілі це ≈ {cm} см · {c}', { cm: b(cmOf(hold)), c: clicks }),
        ], arrowV(hold));
      }
      if (wm > 0.005) {
        const w1 = at(tb.W, d);
        card(t('Вітер'), [
          t('Знос на 1 м/с на {d} — {v}', { d: b(`${d} ${t('м')}`), v: b(f(w1, dg + 1) + U) }),
          t('× сила вітру {w} = {v}', { w: b(`${fm(w)} ${t('м/с')}`), v: b(f(w1 * w, dg)) }),
          share < 0.97 ? t('× бокова частка з {h} год — {p} % = {v}', { h: hour, p: Math.round(share * 100), v: b(f(wm, dg)) }) : null,
          t(left ? 'Дме зліва — тримай лівіше' : 'Дме справа — тримай правіше'),
        ], `${left ? '←' : '→'}${f(wm, dg)}${U}`);
      }
      if (vt > 0) {
        card(t('Рух'), [
          t('Ціль {v} × {s} польоту = {m} попереду', { v: b(`${fm(vt)} ${t('м/с')}`), s: b(`${f(tof, 2)} ${t('с')}`), m: b(`${f(vt * tof, 2)} ${t('м')}`) }),
          t('{m} на {d} = {v}', { m: b(`${f(vt * tof, 2)} ${t('м')}`), d: b(`${d} ${t('м')}`), v: b(f(lead, dg) + U) }),
          t(goRight ? 'Ціль іде вправо — тримай правіше' : 'Ціль іде вліво — тримай лівіше'),
        ], `${goRight ? '→' : '←'}${f(lead, dg)}${U}`);
      }
      if (wm > 0.005 && vt > 0) card(t('Разом'), [`${t('вітер')} ${left ? '←' : '→'}${f(wm, dg)} + ${t('рух')} ${goRight ? '→' : '←'}${f(lead, dg)}`],
        `${arrowV(hold)} ${hx > 0 ? '←' : '→'}${f(Math.abs(hx), dg)}${U}`);
      if (!L.my && Math.abs(air - 1) > 0.02) card(t('Повітря'), [t('Щільність {p} % від стандартної — уже врахована в цифрах вище', { p: f(air * 100, 0) })], '');
    }
    // Подробиці — трьома розділами: постріл, сітка й набій, політ кулі; у рядку підпис і значення окремими клітинками
    const groupOf = (r) => (r.match(/^<div[^>]*data-g="(\w+)"/) ?? [])[1] ?? 'shot';
    const cell = (r) => r.replace(/^<div([^>]*)><span class="k">([\s\S]*?)<\/span>([\s\S]*)<\/div>$/, '<div$1><span class="k">$2</span><span class="rv">$3</span></div>');
    const parts = { shot: [], calc: [], kit: [], fly: [] };
    // Згорнуте — без подробиць: їх однаково не видно, а розбір цілої картки на кожен крок повзунка коштує; розгортання малює заново
    const out = $('sim-out'); const full = out.classList.contains('fx-on');
    for (const r of rows) if (full || !r.startsWith('<div class="fx')) parts[groupOf(r)].push(cell(r));
    const HEAD = { shot: t('Постріл'), calc: t('Як пораховано'), kit: t('Сітка й набій'), fly: t('Політ кулі') };
    const html = Object.entries(parts).filter(([, a]) => a.length)
      .map(([g, a]) => `<div class="ro-sec ro-${g}"><div class="ro-h">${HEAD[g]}</div>${a.join('')}</div>`).join('');
    if (outHtml !== html) { outHtml = html; out.innerHTML = html; }
  };

  // Налаштування тренажера між заходами — лише зручність на цьому пристрої
  const SAVE = 'shooters-log:sim';
  const FIELDS = ['s-kit', 's-barrel', 's-zero', 's-temp', 's-alt', 's-dist', 's-mag', 's-wind', 's-wdir', 's-mv', 's-mvdir', 's-disp', 's-cmp'];
  let restoring = true;
  let saveT = 0;
  const saveNow = () => {
    clearTimeout(saveT); saveT = 0;
    try { localStorage.setItem(SAVE, JSON.stringify({ ...Object.fromEntries(FIELDS.map((id) => [id, $(id).value])), mode: st.mode, tgt: st.tgt, zoom: st.zoom, real: st.real, ink: st.ink, head: st.head })); } catch { /* приватний режим */ }
  };
  // Пишемо, коли рука зупинилась (0,4 с), а не на кожен крок повзунка; закриття сторінки чи згортання — одразу
  const save = () => { if (restoring) return; clearTimeout(saveT); saveT = setTimeout(saveNow, 400); };
  // drawFrame — повзунок щойно рушили, а кадр ще не намальовано: значення вже в полі, зберігаємо й його
  flushSim = () => { if (saveT || drawFrame) saveNow(); };
  const seg = (a, b, key, val) => [a, b].forEach((id) => $(id).addEventListener('click', () => {
    st[key] = val[id];
    $(a).setAttribute('aria-pressed', st[key] === val[a]);
    $(b).setAttribute('aria-pressed', st[key] === val[b]);
    draw();
  }));
  // «Прицілювання» вже ввімкнене — тап перемикає точку: центр мас ↔ голова (значок одразу показує вибране).
  // Слухач стоїть перед seg — бачить режим до натискання; із далекоміра перший тап лише вмикає прицілювання
  $('m-aim').addEventListener('click', () => {
    if (st.mode !== 'aim' || quiz || !aimChoice()) return;
    st.head = !st.head; navigator.vibrate?.(8); save();
  });
  // «Далекомір» уже ввімкнений — тап бере наступне «чим міряти» по колу: зріст → голова → плечі → без скоби → зріст
  $('m-range').addEventListener('click', () => {
    const list = measList();
    if (st.mode !== 'range' || quiz || !list.length) return;
    st.meas = (Math.max(0, st.meas) + 1) % (list.length + 1); st.measName = st.meas ? list[st.meas - 1][0] : null; navigator.vibrate?.(8);
  });
  seg('m-aim', 'm-range', 'mode', { 'm-aim': 'aim', 'm-range': 'range' });
  ['m-aim', 'm-range'].forEach((id) => $(id).addEventListener('click', () => { st.ret = [0, 0]; draw(); }));
  const wdir = $('s-wdir');
  wdir.replaceChildren(...Array.from({ length: 12 }, (_, i) => {
    const op = document.createElement('option');
    op.value = String(i + 1); op.textContent = t('з {n} год', { n: i + 1 }); op.selected = i + 1 === 9;
    return op;
  }));
  paintWind = clockPicker?.(wdir, { speed: $('s-wind'), hideSpeed: true }) ?? null;
  const fill = (id, list, def, label) => $(id).replaceChildren(...list.map((v) => {
    const op = document.createElement('option');
    op.value = String(v); op.textContent = label(v); op.selected = v === def;
    return op;
  }));
  fill('s-temp', Array.from({ length: 15 }, (_, i) => -30 + i * 5), 15, (v) => `${v > 0 ? '+' : ''}${v} °C`);
  fill('s-alt', Array.from({ length: 13 }, (_, i) => i * 250), 0, (v) => `${v} ${t('м')}`);
  // Температура чи висота поза сходинками (+12 °C таблиці, погода з GPS) — окремим пунктом на своєму місці, без округлення
  const airOpt = (id, v) => {
    const sel = $(id); const n = Math.round(Number(v) * 10) / 10;
    if (v === '' || v === null || !Number.isFinite(n)) return;
    if (![...sel.options].some((o) => +o.value === n)) {
      const op = document.createElement('option'); op.value = String(n);
      op.textContent = id === 's-temp' ? `${n > 0 ? '+' : n < 0 ? '−' : ''}${fm(Math.abs(n))} °C` : `${fm(n)} ${t('м')}`;
      sel.insertBefore(op, [...sel.options].find((o) => +o.value > n) ?? null);
    }
    sel.value = String(n);
  };
  // «Зараз тут» — температура й висота за місцем телефона, як у «Поправки зараз»; без GPS чи мережі — як було
  if (hereWeather) {
    const hereBtn = toolBtn('locate', t('Зараз тут: погода за місцем телефона'), null, 'sim-here-btn');
    hereBtn.id = 's-here';
    const hereInfo = Object.assign(document.createElement('small'), { className: 'muted sim-here-info' });
    $('s-alt').closest('.sim-air').append(hereBtn, hereInfo);
    for (const id of ['s-temp', 's-alt']) $(id).addEventListener('input', () => { hereInfo.textContent = ''; });
    hereBtn.addEventListener('click', async () => {
      hereBtn.disabled = true; hereInfo.textContent = t('Визначаю…');
      try {
        const wx = await hereWeather();
        if (!Number.isFinite(wx?.temp)) { hereInfo.textContent = wx ? t('Не вдалося отримати погоду') : ''; return; }
        airOpt('s-temp', Math.round(wx.temp));
        if (Number.isFinite(wx.elevation)) airOpt('s-alt', Math.round(wx.elevation));
        hereInfo.textContent = t('Погода зараз за місцем телефона');
        $('s-temp').dispatchEvent(new Event('change'));
      } catch {
        hereInfo.textContent = t('Не вдалося отримати погоду');
      } finally {
        hereBtn.disabled = $('s-temp').disabled;
      }
    });
  }
  const tgtSel = $('s-tgt');
  tgtSel.replaceChildren(...Object.entries(TGT).map(([k, T]) => {
    const op = document.createElement('option');
    op.value = k; op.textContent = t(T.label); op.selected = k === st.tgt;
    return op;
  }));
  tgtSel.addEventListener('change', () => { st.tgt = tgtSel.value; st.ret = [0, 0]; st.meas = 1; draw(); });
  // Вибір цілі — сіткою силуетів у панелі «Ціль»; іконка на кнопці — силует поточної
  const tgtIcon = (key) => {
    const T = TGT[key]; const w = Math.max(T.w, 0.6);
    const ico = mk('svg', { viewBox: [-w / 2 - 0.08, -0.08, w + 0.16, 1.16].join(' '), class: 'tgt-ico', 'aria-hidden': 'true' });
    mk('path', { d: T.path, class: 'r-tgt' }, ico);
    if (T.dark) mk('path', { d: T.dark, class: 'r-tgt-d' }, ico);
    (T.parts ?? []).forEach(([x, y, r, d]) => mk('circle', { cx: x, cy: y, r, class: d ? 'r-tgt-d' : 'r-tgt' }, ico));
    return ico;
  };
  const tgtSize = (T) => `${f(T.skipH ? T.dims[0][1] : T.h, 2).replace(/,?0+$/, '')} ${t('м')}`;
  // Реалізм — плитками сцен на початку тієї ж сітки: сцена з навчань замість схеми, ціль — її бійці
  const sceneTgt = (sk) => SCENES[sk].figs[0][0];
  const sceneName = (sk) => t(SCENES[sk].name);
  // Зріст бійців сцени: «1,7 м» чи «1 · 1,7 м»
  const sceneSize = (sk) => `${[...new Set(SCENES[sk].figs.map(([g]) => TGT[g].h))].sort((a, b) => a - b).map((v) => f(v, 2).replace(/,?0+$/, '')).join(' · ')} ${t('м')}`;
  // Значок плитки — шматок кадру навколо першого бійця
  const sceneIcon = (sk, box = 34) => {
    const sc = SCENES[sk]; const [, top, feet, x] = sc.figs[0]; const s = box / ((feet - top) * 2.2);
    const ico = document.createElement('span'); ico.className = 'tgt-ico tgt-photo'; ico.setAttribute('aria-hidden', 'true');
    ico.style.backgroundImage = `url(guide/img/real-${sk}.webp)`;
    ico.style.backgroundSize = `${sc.px[0] * s}px ${sc.px[1] * s}px`;
    ico.style.backgroundPosition = `${box * 0.75 - x * s}px ${box / 2 - (top + feet) / 2 * s}px`;
    // Боєць окремим спрайтом — під ним трава з плитки землі
    if (sc.bg) {
      ico.style.backgroundImage += `, url(guide/img/real-${sc.bg.src}-gr.webp)`;
      ico.style.backgroundSize += ', cover';
      ico.style.backgroundPosition += ', center';
    }
    return ico;
  };
  // Скільки бійців і їхній зріст: «5 × 1,7 м», «4 × 1 · 1,7 м»; один боєць — лише зріст
  const sceneCrew = (sk) => (SCENES[sk].figs.length > 1 ? `${SCENES[sk].figs.length} × ${sceneSize(sk)}` : sceneSize(sk));
  // До якої дистанції кадр без повторів по боках: ширина кадру в метрах (за першим бійцем) займає поле зору
  // LPVO на 6× (≈60 мил); далі ціль менша, і з боків видно копії тла
  // Тло з кутовим розміром (bg) не масштабується за бійцем — повторів немає на будь-якій дистанції
  const sceneFar = (sk) => {
    const { px, bg, figs: [[g, top, feet]] } = SCENES[sk];
    if (bg) return Infinity;
    return Math.max(100, Math.floor((px[0] / (feet - top)) * TGT[g].h * 1000 / 60 / 50) * 50);
  };
  // Плитка-чип стрічки: значок і назва в рядок; name = null — лише значок (назва в title)
  const tile = (icon, name, title, data, pick) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tgt-opt'; b.title = title; b.setAttribute('aria-label', title); Object.assign(b.dataset, data);
    b.append(icon);
    if (name) b.append(Object.assign(document.createElement('span'), { textContent: name }));
    // Вибрали — стрічка закривається, як повзунок
    b.addEventListener('click', () => { pick(); closeTgtPop(); });
    return b;
  };
  // Подробиці вибраної цілі — одним рядком під стрічкою
  const sceneNote = (sk) => [sceneName(sk), sceneCrew(sk), SCENES[sk].bg ? t('тло в масштабі прицілу') : t('кадр без повторів до {d} м', { d: sceneFar(sk) })].join(' · ');
  const tgtNote = () => (st.real ? sceneNote(st.real) : t(TGT[st.tgt].label));
  // Опис плитки в рамці посередині стрічки
  const chipNote = (b) => (b.dataset.scene ? sceneNote(b.dataset.scene) : b.dataset.tgt ? t(TGT[b.dataset.tgt].label) : t('Випадкова ціль і дистанція'));
  // Вибір цілі: схема (real = null) чи сцена фото (real — ключ сцени); нова сцена — заново боєць і підсвітка
  const chooseTgt = (key, sk = null) => {
    if (st.real !== sk) { st.real = sk; st.scene = null; st.flashAt = performance.now(); paintInk(); }
    tgtSel.value = key; tgtSel.dispatchEvent(new Event('change'));
  };
  const randOf = (list) => list[Math.floor(Math.random() * list.length)];
  // Випадкова ціль у відкритій стрічці: сцена, її боєць і дистанція до межі кадру — або схема й будь-яка дистанція
  const randomPick = () => {
    const inp = $('s-dist'); const lo = Math.max(100, +inp.min); let hi = +inp.max;
    if (tgtView === 'photo') {
      const sk = randOf(Object.keys(SCENES).filter((k) => k !== st.real)); const j = Math.floor(Math.random() * SCENES[sk].figs.length);
      const g = SCENES[sk].figs[j][0];
      st.real = sk; st.scene = [sk, j]; st.sceneTgt = g; st.dExact = null; st.flashAt = performance.now(); paintInk();
      hi = Math.min(hi, sceneFar(sk));
      tgtSel.value = g;
    } else {
      st.real = null; st.scene = null; paintInk();
      tgtSel.value = randOf(PICK.filter((k) => k !== st.tgt));
    }
    tgtSel.dispatchEvent(new Event('change'));
    inp.value = lo + Math.round(Math.random() * Math.max(0, hi - lo) / +inp.step) * +inp.step;
    inp.dispatchEvent(new Event('input'));
  };
  const dice = () => {
    const ico = mk('svg', { viewBox: '0 0 24 24', class: 'tgt-ico tgt-dice', 'aria-hidden': 'true' });
    mk('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3.5 }, ico);
    [[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]].forEach(([cx, cy]) => mk('circle', { cx, cy, r: 1.3, class: 'tgt-dot' }, ico));
    return ico;
  };

  // Стрічка під прицілом в один рядок: кнопка «фото ↔ схеми», першою — «Випадкова», далі сцени чи силуети
  const grid = $('tgt-grid'); const kindBtn = $('tgt-kind');
  const KIND_ICON = {
    photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9.5" r="1.5"/>',
    scheme: '<circle cx="12" cy="4.5" r="2"/><path d="M9 8.5h6l1 7h-2l-.5 6h-3l-.5-6H8z"/>',
  };
  let tgtView = 'photo';
  const showView = (v) => {
    tgtView = v;
    if (kindBtn) {
      kindBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${KIND_ICON[v]}</svg>`;
      const label = `${t(v === 'photo' ? 'Фото' : 'Схеми')} — ${t('показати')} ${t(v === 'photo' ? 'схеми' : 'фото')}`;
      kindBtn.title = label; kindBtn.setAttribute('aria-label', label);
    }
    grid?.replaceChildren(
      tile(dice(), null, t('Випадкова ціль і дистанція'), { random: '1' }, randomPick),
      ...(v === 'photo'
        ? Object.keys(SCENES).map((sk) => tile(sceneIcon(sk, 28), sceneName(sk), sceneName(sk), { scene: sk }, () => chooseTgt(sceneTgt(sk), sk)))
        : PICK.map((key) => tile(tgtIcon(key), t(TGT[key].short), t(TGT[key].label), { tgt: key }, () => chooseTgt(key)))),
    );
    paintTgt();
  };
  kindBtn?.addEventListener('click', () => showView(tgtView === 'photo' ? 'scheme' : 'photo'));
  const closeTgtPop = () => {
    $('pop-tgt').hidden = true;
    root.querySelector('[data-pop="pop-tgt"]')?.setAttribute('aria-expanded', 'false');
  };
  const paintTgt = () => {
    $('s-tgt-ico')?.replaceChildren(st.real ? sceneIcon(st.real) : tgtIcon(st.tgt));
    // Підпис — що за ціль, значення — її висота: від неї рахують дальність
    const tgtT = root.querySelector('[data-pop="pop-tgt"] .sim-tool-t');
    if (tgtT) tgtT.textContent = st.real ? sceneName(st.real) : t(TGT[st.tgt].short);
    if ($('s-tgt-sum')) $('s-tgt-sum').textContent = `${sizeTxt(TGT[st.tgt].h)} ${t('м')}`;
    if ($('tgt-note')) $('tgt-note').textContent = tgtNote();
    let on = null;
    grid?.querySelectorAll('.tgt-opt:not([data-random])').forEach((b) => {
      const pressed = st.real ? b.dataset.scene === st.real : b.dataset.tgt === st.tgt;
      b.setAttribute('aria-pressed', String(pressed));
      if (pressed) on = b;
    });
    // Стрічку вирівнюємо, лише коли вона відкрита: вимір прихованої — марний перерахунок розкладки всієї сторінки
    // (при вході в тренажер paintTgt кличуть кілька разів). Відкриття стрічки саме кличе paintTgt
    if (!$('pop-tgt').hidden) tgtWheel?.settle(on);
  };
  const tgtWheel = grid ? wheelStrip(grid, (b) => { if ($('tgt-note')) $('tgt-note').textContent = chipNote(b); }) : null;
  tgtSel.addEventListener('change', paintTgt);
  showView(st.real ? 'photo' : 'scheme');

  // ---------- вправа «Визнач дальність»: випадкова ціль, дистанція й (на «важко») кратність ----------
  const SERIES = 10;
  // [ключ, назва, що саме складніше]. Ключі — в історії серій: старий «hard» дальності лишився найважчим,
  // нова сходинка «різні цілі» має свій ключ varied, тож статистика старих серій не перемішується
  const LEVELS = {
    range: [
      ['learn', 'Навчання', 'вибрана ціль · скоба на цілі та її розмір у сітці · формула підказана'],
      ['pick', 'Зовсім легко', 'вибрана ціль · обери з 4 відповідей'],
      ['easy', 'Легко', 'вибрана ціль · розмір підписано'],
      ['normal', 'Нормально', 'вибрана ціль · розмір пам’ятаєш сам'],
      ['varied', 'Важко', 'різні цілі · розмір пам’ятаєш сам'],
      ['hard', 'Дуже важко', 'різні цілі · і кратність не та, і за бруствером'],
      ['near', 'Своя дистанція', 'вибрана ціль · «дист.» ± 100 м · розмір пам’ятаєш сам'],
    ],
    hold: [
      ['learn', 'Навчання', 'вибрана ціль · лише дистанція · підказка просто на сітці'],
      ['wind1', 'Вітер: основи', 'вибрана ціль · вітер строго збоку, 2–6 м/с · підказка: винос на дистанцію й на вітер окремо'],
      ['wind2', 'Вітер: кут', 'вибрана ціль · вітер з будь-якої години · підказка: яка частка вітру бокова'],
      ['move1', 'Рух: основи', 'людина йде чи біжить, без вітру · підказка: упередження на сітці й розрахунок'],
      ['windmove', 'Вітер і рух', 'вітер з будь-якої години й рух · підказка: винос частинами'],
      ['easy', 'Легко', 'вибрана ціль · лише дистанція'],
      ['normal', 'Нормально', 'вибрана ціль · і вітер'],
      ['hard', 'Важко', 'вибрана ціль · вітер і рух'],
      ['varied', 'Дуже важко', 'різні цілі · вітер і рух'],
      ['head', 'Голова', 'вибрана ціль · вітер · до 400 м'],
      ['signs', 'Вітер за ознаками', 'вибрана ціль · силу вітру оціни за ознаками, бери середину сходинки'],
      ['near', 'Своя дистанція', 'вибрана ціль · «дист.» ± 100 м · і вітер'],
      ['timed', 'На час', 'різні цілі · вітер і рух · 15 с на ціль'],
      ['search', 'Пошук', 'ціль з’являється на 5 с у випадковому місці · знайди й постав на мітку'],
      ['searchMove', 'Пошук у русі', 'як «Пошук», але ціль буває й іде чи біжить'],
    ],
    // Сходинка — як у «Виносі»: ті самі назви означають ті самі умови
    combo: [
      ['easy', 'Легко', 'вибрана ціль · лише дистанція'],
      ['normal', 'Нормально', 'вибрана ціль · і вітер'],
      ['hard', 'Важко', 'вибрана ціль · вітер і рух'],
      ['varied', 'Дуже важко', 'різні цілі · вітер і рух'],
      ['near', 'Своя дистанція', 'вибрана ціль · «дист.» ± 100 м · і вітер'],
      ['timed', 'На час', 'різні цілі · вітер і рух · 25 с на ціль'],
    ],
    wind: [
      ['easy', 'Легко', 'дві ознаки на місцевості'],
      ['normal', 'Нормально', 'одна ознака, буває й міраж'],
      ['bracket', 'Вилкою', 'одна ознака · відповідь вилкою з 1–2 сходинок: вузька — 2 очки, широка — 1'],
      ['timed', 'На час', 'одна ознака · 8 с на відповідь'],
    ],
  };
  LEVELS.range.push(['timed', 'На час', 'різні цілі · розмір пам’ятаєш сам · 10 с на відповідь']);
  // «Своя дистанція» замінена рядком «Дистанції від–до», що діє на будь-якому рівні; у LEVELS лишилась для назв у статистиці старих серій
  const RETIRED = ['near'];
  // Куди треба влучити на кожному рівні. mix — голова до 300 м, якщо ціль стоїть, далі груди.
  // Груди там, де голова була б лотереєю: оцінка вітру ступенями, свій замір дальності, рух на час
  const ZONE_BY = {
    hold: { learn: 'torso', wind1: 'torso', wind2: 'torso', move1: 'torso', windmove: 'torso', easy: 'torso', normal: 'chest', hard: 'chest', varied: 'mix', head: 'head', signs: 'chest', timed: 'chest', search: 'chest', searchMove: 'chest' },
    combo: { easy: 'torso', normal: 'chest', hard: 'chest', varied: 'chest', timed: 'chest' },
  };
  const ZONE_NOTE = { torso: 'зона: увесь торс', chest: 'зона: груди', head: 'зона: голова', mix: 'зона: голова до 300 м, якщо ціль стоїть, далі груди' };
  // Рівні, де голова чи весь торс мають сенс лише ближче: до 400 м
  const NEAR_MAX = { learn: 400, wind1: 500, wind2: 500, move1: 400, windmove: 500, easy: 400, head: 400 };
  // Навчальні рівні «Виносу»: підказка на сітці; вітрові — ще й розрахунок вітру під умовою
  const LEARN = ['learn', 'wind1', 'wind2', 'move1', 'windmove'];
  // Режими — окремі вправи, а не сходинка складності: підказка «спробуй важче/легше» їх не пропонує
  const LEVEL_MODES = ['timed', 'head', 'signs', 'search', 'searchMove', 'bracket'];
  // «Винос» — 15 рівнів трьома групами, у стрічці лише група вибраного: [ключ, назва, рівні, рівень при виборі групи]
  const LEVEL_GROUPS = {
    hold: [['learn', 'Навчання', LEARN, 'learn'], ['ladder', 'Складність', ['easy', 'normal', 'hard', 'varied'], 'normal'],
      ['modes', 'Режими', ['head', 'signs', 'timed', 'search', 'searchMove'], 'head']],
  };
  const windLearn = () => ['wind1', 'wind2', 'windmove'].includes(quiz.level);
  const moveLearn = () => quiz.level === 'move1' || quiz.level === 'windmove';
  // Значок рівня: сходинки — «сигнал мережі» на 5 поділок за назвою (у вправах різні ключі, назви ті самі);
  // режими — свій значок: «Своя дистанція» — як на кнопці «дист.», «На час» — секундомір
  const LEVEL_BARS = { 'Зовсім легко': 1, 'Легко': 2, 'Нормально': 3, 'Важко': 4, 'Дуже важко': 5 };
  const MODE_ICON = {
    timed: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
    // ознаки на місцевості — дерево, а не значок вітру, як у самої вправи
    signs: '<path d="M12 3 6.5 10.5h3L5 17h14l-4.5-6.5h3z"/><path d="M12 17v4"/>',
    bracket: '<path d="M8 4H4v16h4M16 4h4v16h-4"/>',
    learn: '<path d="M2 9.5 12 4.5l10 5-10 5z"/><path d="M6 11.5v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5M22 9.5v5"/>',
    // Решта навчальних рівнів — той самий значок, що «Навчання»
    get wind1() { return this.learn; }, get wind2() { return this.learn; }, get move1() { return this.learn; }, get windmove() { return this.learn; },
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    searchMove: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M7.5 10.5h6M11.5 8.5l2 2-2 2"/>',
    head: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="9.2" r="2.6"/><path d="M7.2 18.4q0-4.6 4.8-4.6t4.8 4.6"/><circle cx="12" cy="9.2" r=".9" fill="currentColor"/>',
  };
  // Скільки часу на ціль на рівні «На час»: не встиг — промах
  const TIME = { range: 10000, hold: 15000, combo: 25000, wind: 8000 };
  // «Пошук»: скільки ціль видно
  const SEARCH_MS = 5000;
  const isSearch = () => quiz.level === 'search' || quiz.level === 'searchMove';
  // Різні цілі — лише на верхніх сходинках; нижче — та, що вибрана в «Ціль»
  const variedTargets = () => ['varied', 'timed'].includes(quiz.level) || (quiz.kind === 'range' && quiz.level === 'hard');
  const randomTarget = () => PICK[Math.floor(Math.random() * PICK.length)];
  const LEVEL_KEY = (kind) => `shooters-log:sim-level-${kind}`;
  const KINDS = [['range', 'Дальність'], ['hold', 'Винос'], ['combo', 'Постріл'], ['wind', 'Вітер']];
  // Що зараз на прицілі: у «Дальність + винос» спершу дальність, потім винос
  const phase = () => quiz.cur.phase ?? quiz.kind;
  // Ціль серії зарахована: дальність — у межах 10 %, вітер — точно, винос — у зону ураження
  const okAt = (i) => (quiz.kind === 'range' ? quiz.errs[i] <= 10 : quiz.kind === 'wind' ? quiz.errs[i] === 0 : quiz.hits[i] === 'zone');
  // Жовтий кружечок: майже — у ціль, але повз зону ураження (рука, нога…), чи дальність у межах 20 %
  const nearAt = (i) => (quiz.kind === 'range' ? quiz.errs[i] <= 20 : quiz.kind === 'wind' ? false : quiz.hits[i] === 'body');
  // «Дистанції від–до» — одні на всі вправи, на цьому пристрої; 100–800 — усі, як до появи вибору (тоді dr = null)
  const DIST_KEY = 'shooters-log:sim-dist';
  const DIST_ALL = [100, 800];
  const distPref = () => {
    try { const v = JSON.parse(localStorage.getItem(DIST_KEY)); if (Array.isArray(v) && v[0] <= v[1]) return v; } catch { /* приватний режим */ }
    return DIST_ALL;
  };
  const distRange = () => { const [a, b] = distPref(); return a <= DIST_ALL[0] && b >= DIST_ALL[1] ? null : [a, b]; };
  const saveDist = (v) => { try { localStorage.setItem(DIST_KEY, JSON.stringify(v)); } catch { /* приватний режим */ } };
  const distLabel = ([a, b]) => `${a === b ? a : `${a}–${b}`} ${t('м')}`;
  // dr — дистанції серії, з якими вона почалась: «Ще серія» й «Повтори помилки» беруть ті самі
  const newQuiz = (kind, level, queue = null, dr = distRange()) => ({ kind, level, dr, errs: [], hits: [], shots: [], done: [], queue, total: queue?.length ?? SERIES });
  // Межі дистанцій вправи, звужені до вибраних «від–до»; крок — щоб межі лягли на сітку дистанцій.
  // Не перетинаються (свій набій, навчання вітру від 200 м) — межі вправи як є
  const distBounds = (d0, d1, step) => {
    if (!quiz.dr) return [d0, d1];
    const lo = d0 + Math.ceil((Math.max(quiz.dr[0], d0) - d0) / step) * step;
    const hi = d0 + Math.floor((Math.min(quiz.dr[1], d1) - d0) / step) * step;
    return lo <= hi ? [lo, hi] : [d0, d1];
  };
  // Найдальше для «Виносу»: свій набій — до кінця його таблиці, вбудований — до краю повзунка «дист.» (до нього пораховано балістику).
  // Без вибору дистанцій — до 600 м, як було
  const holdTop = (L) => (L.my ? L.dmax : quiz?.dr === null ? 600 : +$('s-dist').max);
  // Повтор цілі з помилкою — та сама умова, без відповіді й таймера
  const replay = ({ answer, pending, show, band, opts, ret, guess, guessErr, deadline, timeout, pick, pts, at, appear, vanish, seen, tm, sp, ...q }) => ({ ...q, ...(q.kind === 'combo' ? { phase: 'range' } : {}) });
  // Відгук на відповідь: коротка вібрація — лише коли помилився
  const buzz = (ok) => { if (!ok) navigator.vibrate?.(40); };
  // Ознаки сили вітру — як у таблиці розділу «Вітер»; міраж — з пояснень під нею
  const WIND_Q = [
    ['0–1', ['дим піднімається майже вертикально', 'листя не ворушиться', 'вода гладенька, як дзеркало'], 'міраж «кипить» строго вгору'],
    ['1–2', ['вітер відчувається обличчям', 'дим помітно нахиляється', 'листя ворушиться', 'по гладкій воді біжать темні плями брижів'], 'міраж кипить і трохи хилиться, до ≈ 45°'],
    ['2–4', ['листя й тонкі гілки в постійному русі', 'легкий прапор розвівається', 'листя перевертається світлим боком'], 'міраж нахилений на ≈ 70°, майже не кипить'],
    ['4–6', ['піднімає пил і папір', 'рухаються невеликі гілки', 'трава лягає хвилями'], 'міраж плаский, «хльосткий», мерехтить'],
    ['6–8', ['розгойдуються невеликі дерева', 'вітер заважає тримати положення стоячи'], null],
  ];
  // Середина сходинки вітру — її бере «Винос» на рівні «Вітер за ознаками»
  const WIND_MID = [0.5, 1.5, 3, 5, 7];
  // Вилка сходинок a…b одним підписом: «1–2» і «2–4» → «1–4»
  const bracketLabel = (a, b) => `${WIND_Q[a][0].split('–')[0]}–${WIND_Q[b][0].split('–')[1]}`;
  // Четверте — ті самі смуги для «Дистанції від–до» (кнопка «Потренувати» під слабким місцем)
  const DIST_BANDS = [[0, 300, 'до 300 м', [100, 300]], [301, 500, '300–500 м', [300, 500]], [501, 1e4, 'понад 500 м', [500, 800]]];
  // Історія серій — лише на цьому пристрої (localStorage). ponytail: перенести в базу, якщо захочеться бачити й на іншому
  const HIST = 'shooters-log:sim-history';
  const history = () => { try { return JSON.parse(localStorage.getItem(HIST)) ?? []; } catch { return []; } };
  const remember = (rec) => { try { localStorage.setItem(HIST, JSON.stringify([...history(), rec].slice(-1000))); } catch { /* приватний режим */ } };
  let quiz = null;
  const simBox = svg.closest('.sim');
  // Закріплений приціл — одразу під шапкою застосунку, якої б висоти вона не була
  const bar = document.querySelector('.topbar');
  if (bar) simBox.style.setProperty('--sim-top', `${bar.offsetHeight}px`);
  const qBox = $('sim-quiz');
  // Вправи — у рамці з назвою на лінії: видно, що це перевірка себе, а не довідкові цифри над нею.
  // Згортається тапом по назві, як блоки налаштувань; спершу згорнуто, розгорнуте пам'ятається
  // Зведення крупно, лише відповіді; формула дальності — тапом по зведенню, вибір пам'ятається
  const out = $('sim-out');
  if (!out.dataset.fx) {
    out.dataset.fx = '1';
    try { out.classList.toggle('fx-on', localStorage.getItem('shooters-log:sim-fx') === '1'); } catch { /* приватний режим */ }
    out.title = t('Тап — формула');
    out.addEventListener('click', () => {
      const on = out.classList.toggle('fx-on');
      try { localStorage.setItem('shooters-log:sim-fx', on ? '1' : '0'); } catch { /* приватний режим */ }
      // Згорнуте зведення подробиць не містить — дописуємо їх
      if (on && !quiz) draw();
    });
  }
  const QUIZ_OPEN = 'shooters-log:sim-quiz-open';
  const quizFold = (open, keep = true) => {
    const fs = qBox.closest('.quiz-box');
    fs.classList.toggle('closed', !open);
    fs.querySelector('.box-toggle').setAttribute('aria-expanded', String(open));
    if (keep) try { localStorage.setItem(QUIZ_OPEN, open ? '1' : '0'); } catch { /* приватний режим */ }
  };
  if (!qBox.closest('.quiz-box')) {
    const fs = Object.assign(document.createElement('fieldset'), { className: 'box foldable quiz-box' });
    const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'box-toggle' });
    const chev = Object.assign(document.createElement('span'), { className: 'box-chevron', textContent: '›' });
    chev.setAttribute('aria-hidden', 'true');
    // Згорнутим — мішень, у яку час від часу влучає куля: видно, що тут вправи
    const ico = Object.assign(document.createElement('span'), { className: 'quiz-ico' });
    ico.setAttribute('aria-hidden', 'true');
    ico.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>'
      + '<path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'
      + '<circle class="quiz-ico-ring" cx="12" cy="12" r="2.4"/><circle class="quiz-ico-hit" cx="12" cy="12" r="1.6"/></svg>';
    toggle.append(chev, ico, t('Перевір себе'), Object.assign(document.createElement('span'), { className: 'box-sum', id: 'sim-quiz-sum' }));
    toggle.addEventListener('click', () => quizFold(fs.classList.contains('closed')));
    const legend = document.createElement('legend'); legend.append(toggle);
    const body = Object.assign(document.createElement('div'), { className: 'box-body' });
    qBox.replaceWith(fs);
    body.append(qBox); fs.append(legend, body);
    let open = false; try { open = localStorage.getItem(QUIZ_OPEN) === '1'; } catch { /* приватний режим */ }
    quizFold(open, false);
  }
  const el = (tag, attrs = {}, text = '') => Object.assign(document.createElement(tag), attrs, text ? { textContent: text } : {});
  // Після «Перевірити» / «Далі» початок вправи має бути одразу під закріпленим прицілом, а не сховатись під ним
  const reveal = () => {
    const stick = simBox.querySelector('.sim-stick');
    if (!stick) return;
    const gap = qBox.getBoundingClientRect().top - stick.getBoundingClientRect().bottom;
    if (gap < 0 || gap > 120) window.scrollBy({ top: gap - 8 });
  };

  // «Винос»: дистанція, (вітер), (рух) — тапнути точку сітки, яку наводиш на ціль
  const nextHold = () => {
    const L = LOADS[$('s-kit').value]; const C = RET[L.ret];
    // «Голова» далі 400 м — лотерея: межа діє й з вибраними дистанціями
    const top = Math.min(holdTop(L), quiz.level === 'head' ? NEAR_MAX.head : Infinity);
    const [d0, dTop] = distBounds(L.my ? L.dmin : windLearn() ? 200 : 100, top, 25);
    // Стеля рівня (торс, голова — до 400 м) — лише без свого вибору дистанцій: вибране важливіше
    const d1 = Math.max(d0, Math.min(dTop, quiz.dr ? Infinity : NEAR_MAX[quiz.level] ?? Infinity));
    const dist = d0 + 25 * Math.floor(Math.random() * ((d1 - d0) / 25 + 1));
    // «Вітер за ознаками»: сила — сходинка таблиці, у розрахунку — її середина; ознаки замість цифри
    const bucket = quiz.level === 'signs' && !(L.my && !L.windy) ? Math.floor(Math.random() * WIND_Q.length) : null;
    let wind = bucket !== null ? WIND_MID[bucket]
      : quiz.level === 'easy' || quiz.level === 'learn' || quiz.level === 'move1' || (L.my && !L.windy) ? 0 : Math.round(Math.random() * (isSearch() ? 8 : 12)) / 2;
    let hour = 1 + Math.floor(Math.random() * 12);
    // «Вітер: основи» — строго збоку (3 чи 9 год), «Вітер: кут» — з будь-якої години; сила 2–6 м/с
    if (quiz.level === 'wind1') hour = Math.random() < 0.5 ? 3 : 9;
    else if (windLearn() && hour % 6 === 0) hour += Math.random() < 0.5 ? 1 : -1;
    if (windLearn() && !(L.my && !L.windy)) wind = 2 + Math.round(Math.random() * 8) / 2;
    // Ціль — вибрана в тренажері, на «дуже важко» — щоразу інша; рухаються боком лише людина й легковик
    // Навчання руху — завжди людина (рухаються лише вона й легковик), крок чи біг
    const tgt = moveLearn() ? 'man' : variedTargets() ? randomTarget() : st.tgt;
    const vt = moveLearn() && !L.my ? (Math.random() < 0.5 ? 1.4 : 3.5)
      : ['hard', 'varied', 'timed', 'searchMove'].includes(quiz.level) && !L.my && tgt === 'man' ? [0, 1.4, 3.5][Math.floor(Math.random() * 3)] : 0;
    const goRight = Math.random() < 0.5;
    // Зона — у самому питанні: розбір і «Повтори помилки» показують ту саму
    let zone = ZONE_BY[quiz.kind]?.[quiz.level] ?? 'chest';
    if (zone === 'mix') zone = dist <= 300 && !vt ? 'head' : 'chest';
    const q = { kind: 'hold', tgt, dist, wind, hour, vt, goRight, zone, mag: C.cal, ...(bucket !== null ? { bucket, ...windSigns(bucket, false) } : {}) };
    return Object.assign(q, holdSolve(q));
  };
  // Правильний винос на q.dist: падіння, вітер, упередження. Окремо — ціль на кадрі можна змінити, а з нею й дистанцію
  const holdSolve = (q) => {
    const kit = $('s-kit').value; const L = LOADS[kit]; const moa = RET[L.ret].u === 'MOA';
    const z = L.zero ?? +$('s-zero').value;
    // Ствол і набій — вибрані в «Гвинтівка й набій», як і в прицілі поза серією
    const tb = atmTab(kit, $('s-barrel').value || L.def, +$('s-temp').value, +$('s-alt').value);
    const hy = holdAt(tb.H, q.dist) - (L.my ? 0 : zeroShift(tb.H, z));
    const wm = at(tb.W, q.dist) * q.wind * Math.abs(Math.sin((q.hour * Math.PI) / 6));
    const lead = q.vt ? (q.vt * at(tb.T, q.dist) / q.dist) * (moa ? 3437.75 : 1000) : 0;
    // w1 — знос на 1 м/с повного бокового вітру на цій дистанції: для розрахунку в навчальних рівнях
    // wx — частина на вітер, tof — час польоту: для підказки й розрахунку частинами
    return { hx: (q.hour > 6 ? wm : -wm) + (q.goRight ? -lead : lead), hy, w1: at(tb.W, q.dist), wx: q.hour > 6 ? wm : -wm, tof: tb.T ? at(tb.T, q.dist) : 0 };
  };

  // «Визнач вітер»: сила — одна з п'яти сходинок таблиці; на легкому дві ознаки на місцевості, далі одна, буває міраж
  // Ознаки сходинки: на легкому дві на місцевості, далі одна (буває міраж), іноді — прапорець із кутом
  const windSigns = (bucket, two) => {
    const [, land, mirage] = WIND_Q[bucket];
    const pool = [...land].sort(() => Math.random() - 0.5);
    const signs = two ? pool.slice(0, 2) : [[...pool, ...(mirage ? [mirage] : [])][Math.floor(Math.random() * (pool.length + (mirage ? 1 : 0)))]];
    // Флажок із кутом: кут ÷ 9 ≈ м/с; кут — кратний 5°, усередині сходинки, щоб відповідь була однозначна
    const [lo, hi] = WIND_Q[bucket][0].split('–').map(Number);
    const angles = Array.from({ length: 19 }, (_, i) => i * 5).filter((a) => a / 9 > lo && a / 9 < hi);
    if (angles.length && Math.random() < 0.3) {
      const flag = angles[Math.floor(Math.random() * angles.length)];
      signs[signs.length - 1] = { k: 'прапорець відхилився від древка на ≈ {a}°', p: { a: flag } };
      return { signs, flag };
    }
    return { signs };
  };
  const nextWind = () => {
    const bucket = Math.floor(Math.random() * WIND_Q.length);
    return { kind: 'wind', bucket, ...windSigns(bucket, quiz.level === 'easy') };
  };
  // Ознака — рядок для перекладу або { k, p } з числом усередині (флажок із кутом)
  const signText = (x) => (typeof x === 'string' ? t(x) : t(x.k, x.p));
  // «Вітер на око» з журналу: оцінка проти виміряного — де стрілець систематично помиляється
  const journalWind = () => {
    const xs = windGuesses?.() ?? [];
    if (!xs.length) return null;
    const d = xs.reduce((a, x) => a + (x.guess - x.wind), 0) / xs.length;
    const near = xs.filter((x) => Math.abs(x.guess - x.wind) <= 1).length;
    const box = el('div', { className: 'quiz-hist quiz-journal-wind' });
    box.append(el('span', {}, `${t('З журналу: вітер на око, записів {n}', { n: xs.length })} · ${Math.abs(d) < 0.3 ? t('у середньому точно')
      : t(d > 0 ? 'у середньому завищуєш на {v} м/с' : 'у середньому занижуєш на {v} м/с', { v: f(Math.abs(d), 1) })} · ${t('у межах 1 м/с — {p}', { p: `${Math.round((near / xs.length) * 100)} %` })}`));
    box.append(el('small', {}, t('Прогноз погоди міряє вітер на висоті 10 м, біля землі він слабший — чесніше порівнювати з приладом.')));
    return box;
  };

  const nextTarget = () => {
    if (quiz.queue?.length) return replay(quiz.queue.shift());
    if (quiz.kind === 'hold') return nextHold();
    if (quiz.kind === 'wind') return nextWind();
    const C = RET[LOADS[$('s-kit').value].ret];
    // «Дальність + винос»: умова виносу, але ціль спершу треба виміряти — тож її має бути видно хоча б на поділку
    if (quiz.kind === 'combo') {
      const dr = quiz.dr;
      for (let tries = 0; ; tries++) {
        // На вибраних дистанціях ціль так і не видно хоч на поділку (дрібна ціль далеко) — ця ціль без вибору, щоб не зависнути
        if (tries === 200) quiz.dr = null;
        const q = nextHold();
        const H = C.size(TGT[q.tgt].h, q.dist);
        if (H >= 1 && H * Math.max(1, TGT[q.tgt].w) < C.R * 1.5) { quiz.dr = dr; return { ...q, kind: 'combo', phase: 'range' }; }
      }
    }
    const mags = [];
    for (let m = C.min; m < C.cal; m += 0.5) mags.push(m);
    // Ціль має бути видно: не менше 1 поділки й не ширша за поле зору.
    // Вибрана ціль, що не влазить у жодну дистанцію (гонг на дрібній сітці), за 200 спроб поступається випадковій
    for (let tries = 0; ; tries++) {
      const tgt = variedTargets() || tries > 200 ? randomTarget() : st.tgt;
      const [d0, d1] = distBounds(...DIST_ALL, 10);
      const dist = d0 + 10 * Math.floor(Math.random() * ((d1 - d0) / 10 + 1));
      const mag = quiz.level === 'hard' && Math.random() < 0.6 ? mags[Math.floor(Math.random() * mags.length)] : C.cal;
      const H = C.size(TGT[tgt].h, dist) * kOf(C, mag);
      // На «важко» людина буває за бруствером: видно лише голову й плечі
      const hide = quiz.level === 'hard' && tgt === 'man' && Math.random() < 0.5 ? 0.6 : 0;
      if (H >= 1 && H * Math.max(1, TGT[tgt].w) < C.R * 1.5) return { tgt, dist, mag, hide };
    }
  };

  const finishSeries = () => {
    const kit = $('s-kit').value; const u = RET[LOADS[kit].ret].u;
    const avg = quiz.errs.reduce((s, x) => s + x, 0) / quiz.errs.length;
    const hold = quiz.kind === 'hold' || quiz.kind === 'combo';
    const good = quiz.errs.filter((_, i) => okAt(i)).length;
    const body = hold ? quiz.hits.filter((b) => b !== 'miss').length : null;
    // Покроково: дальність і винос — [дистанція, помилка, ціль, (куди влучив), (помилка дальності, %)]; вітер — [сходинка, помилка]
    const sh = quiz.kind === 'wind'
      ? quiz.done.map((q, i) => [q.bucket, quiz.errs[i]])
      : quiz.errs.map((e, i) => [quiz.shots[i]?.[0], Math.round(e * 100) / 100, quiz.shots[i]?.[1], ...(hold ? [quiz.hits[i]] : []),
        ...(quiz.kind === 'combo' ? [quiz.done[i]?.guessErr ?? null] : [])]);
    // Помилка дальності в «Дальність + винос» — окремо, середня по серії
    const guesses = quiz.done.map((q) => q.guessErr).filter((x) => x != null);
    const ra = guesses.length ? guesses.reduce((s, x) => s + x, 0) / guesses.length : null;
    // Очки вилки у «Визнач вітер»: вузька правильна — 2, широка — 1
    const pts = quiz.level === 'bracket' ? quiz.done.reduce((s, q) => s + (q.pts ?? 0), 0) : null;
    const tms = quiz.done.map((q) => q.tm).filter((x) => x != null);
    const tm = tms.length ? Math.round(tms.reduce((s, x) => s + x, 0) / tms.length * 10) / 10 : null;
    remember({ ...(tm != null ? { tm } : {}), at: Date.now(), kind: quiz.kind, level: quiz.level, kit, u, avg, good, ...(hold ? { body } : {}), ...(ra != null ? { ra } : {}),
      ...(pts != null ? { pts } : {}), ...(quiz.queue ? { rep: true } : {}), ...(quiz.dr ? { dr: quiz.dr } : {}), n: quiz.errs.length, sh });
    return { avg, good, body, u, ra, pts };
  };

  // Легенда результату «куди тримати» — значками, як вони намальовані на сітці
  const LEG = [
    ['<path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.8" fill="var(--accent)"/>', 'точка прицілу'],
    ['<path d="M3 3l10 10M3 13L13 3" stroke="#ff4d4d" stroke-width="2.2" stroke-linecap="round"/>', 'влучання'],
    ['<circle cx="8" cy="8" r="5.5" fill="none" stroke="#4cc38a" stroke-width="2"/>', 'треба було цілитись'],
    // Зона — та сама червона плита, що на цілі (plateD у полі 16 × 16)
    [`<path d="${plateD(['p', 3, 1, 10, 14])}" fill="rgb(255 20 35 / .55)"/>`, 'зона влучання'],
  ];
  const legend = () => {
    const box = el('span', { className: 'quiz-legend' });
    for (const [svgPath, label] of LEG) {
      const it = el('span');
      it.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${svgPath}</svg>`;
      it.append(t(label));
      box.append(it);
    }
    return box;
  };

  // Серія кружечками: сірий — ще попереду, зелений — влучив / в межах 10 %, червоний — помилився, обведений — поточна ціль
  const answered = (q) => q.answer != null || !!q.timeout;
  // Таймер рівня «На час»: один на всю вправу, перезапускається з кожним малюванням (а воно й на кожен рух пальцем)
  let tick = null;
  const clearTick = () => { clearInterval(tick); tick = null; };
  const quizHead = (q) => {
    const n = quiz.view != null ? quiz.view + 1 : quiz.errs.length + (answered(q) ? 0 : 1);
    const dots = el('span', { className: 'quiz-dots' });
    for (let i = 0; i < quiz.total; i++) {
      const dot = el('i', { className: `${i < quiz.errs.length ? (okAt(i) ? 'good' : nearAt(i) ? 'near' : 'bad') : i === n - 1 ? 'cur' : ''}${i === quiz.view ? ' picked' : ''}` });
      // Відповіданий кружечок — тап повертає до тієї цілі з її розбором
      if (i < quiz.done.length) {
        dot.tabIndex = 0; dot.setAttribute('role', 'button'); dot.setAttribute('aria-label', t('Ціль {n}: розбір', { n: i + 1 }));
        const open = () => viewDone(i);
        dot.addEventListener('click', open);
        dot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      }
      dots.append(dot);
    }
    const head = el('div', { className: 'quiz-n quiz-head' });
    const step = q.phase ? ` · ${t(q.phase === 'range' ? 'крок 1: дальність' : 'крок 2: винос')}` : '';
    head.append(dots, el('span', {}, quiz.kind === 'wind'
      ? t('Завдання {n} з {total}', { n, total: quiz.total })
      : `${t('Ціль {n} з {total} · кратність {m}×', { n, total: quiz.total, m: fm(q.mag) })}${step}`));
    const search = isSearch();
    if ((quiz.level !== 'timed' && !search) || answered(q)) return head;
    const span = search ? SEARCH_MS : TIME[quiz.kind];
    q.deadline ??= search ? q.vanish : Date.now() + span;
    const bar = el('i');
    const timer = el('span', { className: 'quiz-timer' });
    timer.append(bar);
    head.append(timer);
    const left = () => Math.max(0, q.deadline - Date.now());
    const paint = () => {
      // «Пошук»: ціль з'явилась — перемалювати приціл; до того смужка повна
      if (search && !q.seen && Date.now() >= q.appear) { q.seen = true; clearTick(); setTimeout(drawQuiz); return; }
      bar.style.width = `${Math.min(1, left() / span) * 100}%`;
      timer.classList.toggle('low', left() < 3000);
      // Не посеред малювання: timeUp сам перемальовує вправу
      if (!left()) { clearTick(); setTimeout(() => timeUp(q)); }
    };
    paint();
    if (!q.timeout) tick = setInterval(paint, 100);
    return head;
  };

  // Перегляд відповіданої цілі: та сама картка з розбором; «До поточної» повертає туди, де зупинились
  const viewDone = (i) => {
    if (quiz.view == null) quiz.live = quiz.cur;
    if (quiz.done[i] === quiz.live) { backToLive(); return; }
    quiz.view = i; quiz.cur = quiz.done[i]; drawQuiz(); reveal();
  };
  const backToLive = () => { quiz.cur = quiz.live ?? quiz.cur; quiz.view = null; quiz.live = null; drawQuiz(); reveal(); };
  // Відповідь зарахована: ціль у серію, вібрація — і новий малюнок
  const scored = (q, ok) => {
    clearTick();
    quiz.done.push(q);
    buzz(ok);
    drawQuiz();
    // Щойно зарахований кружечок і вердикт — з одноразовою анімацією; наступне малювання її знімає
    qBox.querySelectorAll('.quiz-dots i')[quiz.done.length - 1]?.classList.add('fresh');
    qBox.querySelector('.quiz-res')?.classList.add('fresh');
    reveal();
    if (quiz.done.length >= quiz.total) showEnd();
  };
  // Кінець серії: «Ще серія» й «Повтори помилки» — над нижньою панеллю, а не під нею
  const showEnd = () => {
    const row = [...qBox.querySelectorAll('.quiz-go')].pop()?.parentElement;
    if (!row) return;
    const floor = document.querySelector('nav.tabs')?.getBoundingClientRect().top ?? innerHeight;
    const over = row.getBoundingClientRect().bottom + 12 - floor;
    if (over > 0) window.scrollBy({ top: over });
  };
  // Час вийшов — промах: дальність і вітер не названо, постріл не зроблено
  const timeUp = (q) => {
    if (answered(q) || quiz?.cur !== q) return;
    q.timeout = true;
    if (quiz.kind === 'range') { quiz.errs.push(100); quiz.shots.push([q.dist, q.tgt]); scored(q, false); return; }
    if (quiz.kind === 'wind') { quiz.errs.push(WIND_Q.length); scored(q, false); return; }
    q.answer = [0, 0];
    quiz.errs.push(Math.hypot(q.hx, q.hy)); quiz.shots.push([q.dist, q.tgt]); quiz.hits.push('miss'); q.band = 'miss';
    if (q.phase) { q.guessErr = q.guess ? Math.abs(q.guess - q.dist) / q.dist * 100 : null; q.phase = 'hold'; }
    scored(q, false);
  };

  // Після відповіді: «Далі» (у кінці серії — «Ще серія») і, якщо були помилки, «Повтори помилки»
  const nextBtns = (done) => {
    if (quiz.view != null) {
      const back = iconBtn('quiz-go', 'next', t('До поточної цілі'));
      back.addEventListener('click', backToLive);
      return [back];
    }
    const next = iconBtn('quiz-go', done ? 'again' : 'next', done ? t('Ще серія') : t('Далі'));
    next.addEventListener('click', () => {
      if (done) quiz = newQuiz(quiz.kind, quiz.level, null, quiz.dr);
      quiz.cur = nextTarget(); drawQuiz(); reveal();
    });
    if (!done) return [next];
    const missed = quiz.done.filter((_, i) => !okAt(i));
    if (!missed.length) return [next];
    const again = iconBtn('quiz-show quiz-rep', 'repeat', t('Повтори помилки ({n})', { n: missed.length }));
    again.addEventListener('click', () => {
      quiz = newQuiz(quiz.kind, quiz.level, missed.map(replay), quiz.dr);
      quiz.cur = nextTarget(); drawQuiz(); reveal();
    });
    return [next, again];
  };

  // Кнопка з іконкою: «Далі», «Як треба», «Вийти з вправи»
  const BTN_ICON = {
    next: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    again: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4v4h-4"/>',
    show: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    mine: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    exit: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    repeat: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
    start: '<path d="M7 4.5v15l12-7.5z"/>',
    // «Перевірити» — куля в польоті: суцільна, з пояском, позаду — змазаний слід
    check: '<path d="M7 9h6c4 0 7.6 1.7 9.7 2.8v.4c-2.1 1.1-5.7 2.8-9.7 2.8H7z" fill="currentColor" stroke-width="1"/><path d="M13.2 9.2v5.6" style="stroke: var(--accent)" stroke-width="1"/><path d="M0 9.6h4.5M-1 12h5.5M0 14.4h4.5" stroke-width="1.5" stroke-opacity=".45"/>',
    // Вправи — ті самі значки, що в легенді «Перевір себе»
    range: '<path d="M4 3.5h5M6.5 3.5v17M4 20.5h5M5 8h3M5 12h3M5 16h3"/><circle cx="16" cy="6" r="2.2"/><path d="M16 8.5v6.5M12.5 11h7M16 15l-2.2 5.5M16 15l2.2 5.5"/>',
    hold: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    combo: '<path d="M3 4h4M5 4v16M3 20h4M4 9h2M4 14h2"/><circle cx="15.5" cy="12" r="5.5"/><path d="M15.5 4.5v4M15.5 15.5v4M8 12h4M19 12h4"/>',
    wind: '<path d="M3 8h10.5a3 3 0 1 0-3-3M3 12h15.5a3 3 0 1 1-3 3M3 16h7"/>',
  };
  // «Перевірити» як постріл: кнопка віддає, куля вилітає зі значка — і вже тоді розбір; таймер рівня стоїть,
  // поки летить куля, тож ці 0,2 с не з'їдають час; повторний тап нічого не робить
  // Напис зникає одразу, куля летить від значка за правий край кнопки
  const fire = (btn, go) => {
    if (btn.classList.contains('fire')) return;
    clearTick();
    const T = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
    btn.style.setProperty('--fly', `${btn.getBoundingClientRect().right - btn.querySelector('svg').getBoundingClientRect().left}px`);
    btn.classList.add('fire');
    setTimeout(go, T);
  };
  const iconBtn = (cls, icon, text) => {
    const b = el('button', { type: 'button', className: `${cls} quiz-ibtn` });
    b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BTN_ICON[icon]}</svg>`;
    b.append(el('span', {}, text));
    if (text) b.title = text;
    return b;
  };

  // Розбір серії: куди лягають помилки — систематичний зсув, напрям, дистанції, де гірше. Тап по точці — розбір тієї цілі
  const seriesCard = () => {
    const C = RET[LOADS[$('s-kit').value].ret]; const moa = C.u === 'MOA'; const dg = moa ? 1 : 2;
    const idx = quiz.done.map((_, i) => i).filter((i) => !quiz.done[i].timeout);
    if (!idx.length) return null;
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const box = el('div', { className: 'quiz-card' });
    const chips = [];
    if (quiz.kind === 'range') {
      const m = mean(idx.map((i) => (quiz.done[i].answer - quiz.done[i].dist) / quiz.done[i].dist * 100));
      chips.push(Math.abs(m) < 3 ? t('дальність без перекосу') : t(m > 0 ? 'завищуєш дальність у середньому на {p} %' : 'занижуєш дальність у середньому на {p} %', { p: f(Math.abs(m), 0) }));
    } else {
      const pts = idx.map((i) => { const q = quiz.done[i]; return [i, q.answer[0] + q.hx, q.answer[1] + q.hy]; });
      const mx = mean(pts.map((x) => x[1])); const my = mean(pts.map((x) => x[2]));
      const S = Math.max(moa ? 1.5 : 0.5, ...pts.flatMap(([, x, y]) => [Math.abs(x), Math.abs(y)])) * 1.2;
      const r = S * 0.05;
      const dots = pts.map(([i, x, y]) => `<circle data-i="${i}" cx="${x}" cy="${y}" r="${r}" class="${okAt(i) ? 'good' : nearAt(i) ? 'near' : 'bad'}"/>`).join('');
      const pic = el('div', { className: 'quiz-card-pic' });
      pic.innerHTML = `<svg viewBox="${-S} ${-S} ${2 * S} ${2 * S}" role="img" aria-label="${t('Куди лягли постріли серії')}">
        <path d="M${-S} 0H${S}M0 ${-S}V${S}" class="ax"/><circle r="${S * 0.5}" class="ax"/>
        ${dots}<path d="M${mx - r * 1.6} ${my}H${mx + r * 1.6}M${mx} ${my - r * 1.6}V${my + r * 1.6}" class="mid"/></svg>`;
      pic.querySelectorAll('[data-i]').forEach((c) => c.addEventListener('click', () => viewDone(+c.dataset.i)));
      box.append(pic);
      const tol = moa ? 0.5 : 0.15; const n = pts.length; const most = Math.ceil(n / 2);
      const dir = (v, a, b) => (Math.abs(v) < tol ? '' : `${v > 0 ? a : b}${f(Math.abs(v), dg)}`);
      const ctr = [dir(my, '↓', '↑'), dir(mx, '→', '←')].filter(Boolean).join(' ');
      chips.push(ctr ? t('центр серії {d} {u}', { d: ctr, u: C.u }) : t('центр серії на місці'));
      for (const [cnt, key] of [[pts.filter((x) => x[2] > tol).length, 'нижче потрібного: {n} з {total}'], [pts.filter((x) => x[2] < -tol).length, 'вище потрібного: {n} з {total}'],
        [pts.filter((x) => x[1] > tol).length, 'правіше потрібного: {n} з {total}'], [pts.filter((x) => x[1] < -tol).length, 'лівіше потрібного: {n} з {total}']]) {
        if (cnt >= most && cnt >= 3) chips.push(t(key, { n: cnt, total: n }));
      }
    }
    // Дистанції, де гірше: помилок помітно більше, ніж по серії (хоча б 2 цілі в смузі)
    const allMiss = quiz.done.filter((_, i) => !okAt(i)).length / quiz.done.length;
    const worst = DIST_BANDS.map(([a, b, label]) => {
      const xs = quiz.done.map((q, i) => [q.dist, i]).filter(([d]) => d >= a && d <= b).map(([, i]) => i);
      return [label, xs.length, xs.filter((i) => !okAt(i)).length];
    }).filter(([, n, m]) => n >= 2 && m / n >= 0.5 && m / n >= allMiss + 0.2).sort((a, b) => b[2] / b[1] - a[2] / a[1])[0];
    if (worst) chips.push(t('найгірше {b}: повз {m} з {n}', { b: t(worst[0]), m: worst[2], n: worst[1] }));
    const tms = quiz.done.map((q) => q.tm).filter((x) => x != null);
    if (tms.length) chips.push(t('у середньому {s} с на ціль', { s: f(mean(tms), 1) }));
    const list = el('div', { className: 'quiz-card-chips' });
    list.append(...chips.map((c) => el('span', {}, c)));
    box.append(list);
    return box;
  };
  // Лише приціл «Виносу»: панель під ним від положення прицілу не залежить, тож при перетягуванні її не перебудовуємо
  const holdScope = () => {
    const L = LOADS[$('s-kit').value]; const C = RET[L.ret]; const q = quiz.cur; const moa = C.u === 'MOA';
    // Сітка нерухома; ціль ставиш на мітку виносу. q.pending/q.answer — зсув центру від цілі, тож ціль стоїть у −p
    // «Як треба» — приціл стає правильно: ціль на мітці виносу, ✕ на ній, кільце на перехресті
    // «Пошук»: ціль з'являється не одразу й не в центрі, видно її SEARCH_MS
    const search = isSearch() && !answered(q);
    if (search) {
      q.appear ??= Date.now() + 700 + Math.random() * 1800; q.vanish ??= q.appear + SEARCH_MS;
      q.pending ??= [(Math.random() - 0.5) * 1.1 * C.R, (Math.random() - 0.5) * 0.9 * C.R];
    }
    const hidden = search && (Date.now() < q.appear || Date.now() >= q.vanish);
    const p = q.show ? [-q.hx, -q.hy] : q.answer ?? q.pending ?? [0, 0];
    // «Навчання»: на сітці стрілка до мітки виносу й що це за мітка
    const vText = C.marks ? markShort(q.hy, C) : Math.abs(q.hy) < 0.05 ? t('центр сітки') : `↑${f(Math.abs(q.hy), moa ? 1 : 2)} ${C.u}`;
    let hint = null;
    if (LEARN.includes(quiz.level) && !answered(q)) {
      // Вертикаль, потім частина на вітер, потім на рух — кожна своєю стрілкою; підписи зі словами, коли частин дві
      const wx = q.wx ?? 0; const lx = q.hx - wx; const both = Math.abs(wx) > 0.03 && Math.abs(lx) > 0.03;
      const hp = (v, word) => `${v > 0 ? '←' : '→'}${f(Math.abs(v), moa ? 1 : 2)}${both ? ` ${t(word)}` : ''}`;
      hint = [{ from: [0, 0], to: [0, q.hy], text: vText, side: q.hx > 0 ? -1 : 1 }];
      if (Math.abs(wx) > 0.03) hint.push({ from: [0, q.hy], to: [wx, q.hy], text: hp(wx, 'вітер') });
      if (Math.abs(lx) > 0.03) hint.push({ from: [Math.abs(wx) > 0.03 ? wx : 0, q.hy], to: [q.hx, q.hy], text: hp(lx, 'рух'), below: both });
    }
    const shot = scope(svg, { ret: L.ret, mag: q.mag, dist: q.dist, tgt: q.tgt, mode: 'aim', hx: -p[0], hy: -p[1], noHold: true, zoom: st.zoom, ...realOf(q, q.tgt), ink: st.ink, flash: (q.at ??= performance.now()), flip: q.vt > 0 && !q.goRight,
      move: q.vt ? (q.goRight ? 1 : -1) : 0, hit: q.answer && !q.timeout ? [q.hx, q.hy] : null, sp: q.sp, disp: q.answer && !q.timeout ? q.disp : 0, zone: q.zone, hint, noTarget: hidden });
    setFigs(!answered(q) && !q.phase ? shot.figs : null, q);
    svg.style.touchAction = answered(q) ? '' : 'none';
    paintRetReset(false);
    return { L, C, q, moa, search, hidden };
  };
  // Годинник бокової частки вітру: ціль у центрі, від кожної години промінь завдовжки з частку, що зносить кулю вбік
  // (3 і 9 — увесь, 12 і 6 — нуль); година цього вітру — кольором, стрілка дме до центру
  const windClock = (hour, text) => {
    const box = el('span', { className: 'memo-clock' });
    const P = (h, r) => [Math.sin(h * Math.PI / 6) * r, -Math.cos(h * Math.PI / 6) * r];
    let g = '<circle r="46" class="mc-face"/>';
    for (let h = 1; h <= 12; h++) {
      const sh = Math.abs(Math.sin(h * Math.PI / 6)); const [x0, y0] = P(h, 9); const [x1, y1] = P(h, 9 + 25 * sh);
      const [tx, ty] = P(h, 39);
      if (sh > 0.01) g += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="mc-bar${h === hour ? ' on' : ''}"/>`;
      g += `<text x="${tx}" y="${ty + 3.5}" class="mc-n${h === hour ? ' on' : ''}">${h}</text>`;
    }
    const [ax, ay] = P(hour, 31); const [bx, by] = P(hour, 12);
    g += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="mc-arrow" marker-end="url(#mc-tip)"/><circle r="4" class="mc-tgt"/>`;
    box.innerHTML = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><defs><marker id="mc-tip" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6Z" class="mc-tipp"/></marker></defs>${g}</svg>`;
    box.append(el('span', {}, text));
    return box;
  };
  const drawHold = () => {
    const { L, C, q, moa, search, hidden } = holdScope();
    qBox.replaceChildren();
    qBox.append(quizHead(q));
    // «Дальність + винос»: дистанція — та, яку назвав сам; справжню видно лише після пострілу
    // Навчальні рівні: розмір цілі в сітці на цій дистанції — «у сітці 5,23 MRAD» («Навчання» показує його окремим рядком)
    const fhNow = figH(q.tgt, qFig(q));
    const sizePart = LEARN.includes(quiz.level) && quiz.level !== 'learn' && !q.phase
      ? `${t('у сітці')} ${f(C.size(fhNow, q.dist), moa ? 1 : 2)} ${C.u}` : null;
    const facts = [t(TGT[q.tgt].short), q.phase ? t('Дистанція за твоєю оцінкою {d} м', { d: q.guess ?? '?' }) : t('Дистанція {d} м', { d: q.dist }) + (sizePart ? ` — ${sizePart}` : ''),
      q.signs ? t('вітер з {h} год', { h: q.hour }) : q.wind ? t('вітер {w} м/с з {h} год', { w: fm(q.wind), h: q.hour }) : null,
      q.vt ? t('ціль іде {v} м/с {dir}', { v: fm(q.vt), dir: q.goRight ? t('праворуч') : t('ліворуч') }) : null].filter(Boolean).join(' · ');
    // Числа умови — жирно й кольором, щоб дистанцію, вітер і швидкість видно було одразу (назву цілі не чіпаємо)
    // Кожна частина умови — плашкою (переноситься цілою), числа в ній крупно
    const factsEl = el('p', { className: 'quiz-facts quiz-chips' });
    for (const part of facts.split(' · ')) {
      const p = el('span', { className: 'qc' });
      part.split(/(\d+(?:,\d+)?)/).forEach((x, i) => p.append(i % 2 ? el('b', {}, x) : x));
      factsEl.append(p);
    }
    qBox.append(factsEl);
    // «Навчання»: під умовою — розмір цілі в метрах і як він виглядає в сітці на цій дистанції
    if (quiz.level === 'learn') {
      const fh = figH(q.tgt, qFig(q));
      // Без повтору назви цілі: «Зріст 1,7 м → у сітці 4,53 MRAD», числа жирно — як в умові над ним
      const what = t(MEAS[q.tgt]?.[0]?.[0] ?? 'висота').replace(/^./, (c) => c.toUpperCase());
      const line = el('p', { className: 'quiz-facts quiz-size' });
      line.append(`${what} `, el('b', {}, `${mFmt(fh)} ${t('м')}`), ` → ${t('у сітці')} `, el('b', {}, `${f(C.size(fh, q.dist), moa ? 1 : 2)} ${C.u}`));
      qBox.append(line);
    }
    // Памятка: як рахувати — кроками з числами цієї цілі, і табличка для набору; згорнута, розкрита лишається до наступного питання
    const memo = (title, steps, head, rows, foot) => {
      const box = el('details', { className: 'quiz-memo', open: !!q.memo });
      box.addEventListener('toggle', () => { q.memo = box.open; });
      box.append(el('summary', {}, title));
      const ol = el('ol'); steps.forEach((x) => { const li = el('li'); li.append(x); ol.append(li); }); box.append(ol);
      const tab = el('div', { className: 'quiz-memo-tab' });
      [head, ...rows].forEach((r, n) => r.forEach((c, m) => tab.append(el('span', { className: n === 0 || m === 0 ? 'h' : '' }, c))));
      box.append(tab);
      if (foot) box.append(el('small', {}, foot));
      return box;
    };
    const memos = [];
    const eq = (factors, result, note) => {
      const box = el('div', { className: 'quiz-eq' });
      factors.forEach(([v, cap], i) => {
        if (i) box.append(el('span', { className: 'eq-op' }, '×'));
        const tile = el('span', { className: 'eq-f' }); tile.append(el('b', {}, v), el('small', {}, cap)); box.append(tile);
      });
      box.append(el('span', { className: 'eq-op' }, '='));
      const res = el('span', { className: 'eq-f eq-r' }); res.append(el('b', {}, result), el('small', {}, note)); box.append(res);
      return box;
    };
    const kitNow = $('s-kit').value; const tbNow = atmTab(kitNow, $('s-barrel').value || LOADS[kitNow].def, +$('s-temp').value, +$('s-alt').value);
    const B = (x) => el('b', {}, x); const dg = moa ? 1 : 2;
    // Стовпці таблички пам'ятки: сусідні сотні й посередині дистанція цілі — її число збігається з рядком над пам'яткою
    const around = (d) => {
      const lo = Math.floor(d / 100) * 100; const hi = Math.ceil(d / 100) * 100;
      return lo === hi ? (d > 100 ? [d - 100, d, d + 100] : [d, d + 100, d + 200]) : [Math.max(100, lo), d, hi];
    };
    // «Навчання»: поправка по вертикалі — скільки й звідки: падіння кулі в см за таблицею набою → кутові одиниці
    if (quiz.level === 'learn') {
      const z = L.zero ?? +$('s-zero').value;
      const toCm = (v, d) => (moa ? v * 2.9089 * d / 100 : v * d / 10);
      const line = el('p', { className: 'quiz-facts quiz-size' });
      if (Math.abs(q.hy) < 0.05) line.append(t('Поправки немає — цілься центром сітки'));
      else {
        line.append(`${t('Поправка')} `, B(`${q.hy > 0 ? '↑' : '↓'} ${f(Math.abs(q.hy), dg)} ${C.u}`));
        if (C.marks) line.append(` · ${markShort(q.hy, C)}`);
      }
      qBox.append(line);
      // Сантиметри — з точністю, за якої «см → кут» дає ту саму поправку, що й рядок вище
      const cmDg = f(Math.round(Math.abs(toCm(q.hy, q.dist))) / toCm(1, q.dist), dg) === f(Math.abs(q.hy), dg) ? 0 : 1;
      const cm = f(Math.abs(toCm(q.hy, q.dist)), cmDg);
      const steps = Math.abs(q.hy) < 0.05 ? [t('На дистанції пристрілки куля приходить у точку прицілювання — поправка не потрібна')] : [
        t('За таблицею набою при пристрілці {z} м куля на {d} м приходить на {cm} см {dir} точки прицілювання', { z, d: q.dist, cm, dir: t(q.hy > 0 ? 'нижче' : 'вище') }),
        moa ? t('У MOA: {cm} см ÷ 2,91 × 100 ÷ {d} м = {v} MOA', { cm, d: q.dist, v: f(Math.abs(q.hy), dg) })
          : t('У мілах: {cm} см × 10 ÷ {d} м = {v} MRAD', { cm, d: q.dist, v: f(Math.abs(q.hy), dg) }),
        t(q.hy > 0 ? 'Тримай вище: на ціль наводиш мітку на {v} {u} нижче центру сітки' : 'Тримай нижче: на ціль наводиш мітку на {v} {u} вище центру сітки', { v: f(Math.abs(q.hy), dg), u: C.u }),
      ];
      // Табличка — три сусідні сотні навколо цієї дистанції: видно, як поправка росте
      const d0 = Math.max(100, Math.round(q.dist / 100) * 100 - 100); const ds = [d0, d0 + 100, d0 + 200];
      const hyAt = (d) => holdAt(tbNow.H, d) - (L.my ? 0 : zeroShift(tbNow.H, z));
      memos.push(memo(t('Як рахувати поправку'), steps, ['', ...ds.map((d) => `${d} ${t('м')}`)],
        [[`${t('падіння')}, ${t('см')}`, ...ds.map((d) => f(toCm(hyAt(d), d), 0))], [`${t('поправка')}, ${C.u}`, ...ds.map((d) => f(hyAt(d), dg))]]));
    }
    // «Вітер»: розрахунок — знос на 1 м/с × сила (× частка бокового) = винос
    if (windLearn() && q.wind) {
      const share = Math.abs(Math.sin((q.hour * Math.PI) / 6));
      const wx = q.wx ?? q.hx;
      qBox.append(eq([[`${fm(q.wind)} ${t('м/с')}`, t('вітер')], [f(q.w1, dg + 1), t('на 1 м/с')], ...(share < 0.97 ? [[f(share, 2), t('частка')]] : [])],
        `${wx > 0 ? '←' : '→'}${f(Math.abs(wx), dg)} ${C.u}`, t(wx > 0 ? 'лівіше' : 'правіше')));
      // Правило: «сотні − 1 = десяті мілу» (MRAD) чи «сотні × 0,3» (MOA), якщо для набору воно в межах 20 %; інакше — свій множник за 500 м
      const rd = [300, 400, 500]; const rw = rd.map((d) => at(tbNow.W, d));
      let rule = moa ? (d) => d / 100 * 0.3 : (d) => (d / 100 - 1) * 0.1;
      let ruleTxt = t(moa ? 'сотні метрів × 0,3' : 'сотні метрів мінус один — у десятих мілу');
      if (!rd.every((d, n) => Math.abs(rule(d) - rw[n]) <= rw[n] * 0.2)) {
        const k = Math.round(rw[2] / 5 * 100) / 100; rule = (d) => d / 100 * k; ruleTxt = t('сотні метрів × {k}', { k: f(k, 2) });
      }
      // Рахунок іде від табличного зносу (як у рядку вище), правило — лише прикидка в голові
      const v1 = q.w1; const est = rule(q.dist);
      const ds = around(q.dist); const ws = ds.map((d) => at(tbNow.W, d));
      const steps = [
        t('Знос на 1 м/с на {d} м — {v} {u} за таблицею набою', { d: q.dist, v: f(v1, dg + 1), u: C.u })
          + '. ' + t('У голові: {r} ≈ {e} {u}', { r: ruleTxt, e: f(est, dg), u: C.u })
          + (Math.abs(est - v1) > v1 * 0.1 ? ` — ${t(est < v1 ? 'тут правило занижує, бери за таблицею' : 'тут правило завищує, бери за таблицею')}` : ''),
        t('× сила вітру {w} м/с ≈ {v} {u}', { w: fm(q.wind), v: f(v1 * q.wind, dg), u: C.u }),
        ...(quiz.level !== 'wind1' ? [windClock(q.hour, t('× бокова частка: з {h} год — {p} % ≈ {v} {u}', { h: q.hour, p: Math.round(share * 100), v: f(v1 * q.wind * share, dg), u: C.u }))] : []),
        t('Виноси в той бік, звідки дме вітер'),
      ];
      const foot = WIND_DOTS[L.ret] ? t('Точки вітру сітки — {m} миль/год ({ms} м/с) повного бокового вітру на дистанції своєї риски', { m: WIND_DOTS[L.ret].join(' / '), ms: WIND_DOTS[L.ret].map((v) => f(v * 0.447, 1)).join(' / ') }) : null;
      if (quiz.level !== 'windmove') memos.push(memo(t('Як рахувати вітер'), steps, ['', ...ds.map((d) => `${d} ${t('м')}`)], [[`${t('на 1 м/с')}, ${C.u}`, ...ws.map((w) => f(w, dg + 1))]], foot));
    }
    // «Рух»: упередження — швидкість × час польоту = метри попереду, у кутових одиницях на цій дистанції
    if (moveLearn() && q.vt) {
      const ang = (m, d) => (m / d) * (moa ? 3437.75 : 1000);
      const leadM = q.vt * q.tof; const lx = q.hx - (q.wx ?? 0);
      qBox.append(eq([[`${fm(q.vt)} ${t('м/с')}`, t('швидкість')], [`${f(q.tof, 2)} ${t('с')}`, t('політ')]],
        `${lx > 0 ? '←' : '→'}${f(Math.abs(lx), dg)} ${C.u}`, `${f(leadM, 2)} ${t('м')} ${t('попереду')} · ${t(lx > 0 ? 'тримай лівіше' : 'тримай правіше')}`));
      // Кут упередження майже сталий: час польоту росте разом із дистанцією — запам'ятати два числа (за 300 м)
      const ds = around(q.dist); const lead = (v, d) => ang(v * at(tbNow.T, d), d);
      // Правило — кут за 300 м; якщо на дистанції цілі він помітно інший, кажемо прямо, яке число брати
      const est = lead(q.vt, 300);
      const steps = [
        t('Упередження майже однакове на будь-якій дистанції: крок ≈ {a}, біг ≈ {b} {u}', { a: f(lead(1.4, 300), 1), b: f(lead(3.5, 300), 1), u: C.u })
          + (Math.abs(est - Math.abs(lx)) > Math.abs(lx) * 0.1 ? `. ${t('На {d} м точніше {v} {u} — бери за таблицею', { d: q.dist, v: f(Math.abs(lx), dg), u: C.u })}` : ''),
        t('Тримай попереду цілі — у той бік, куди вона йде'),
        ...(MOVE_NOTE[L.ret] ? [t(MOVE_NOTE[L.ret])] : []),
      ];
      if (quiz.level !== 'windmove') memos.push(memo(t('Як рахувати рух'), steps, ['', ...ds.map((d) => `${d} ${t('м')}`)],
        [[`${t('крок')}, ${C.u}`, ...ds.map((d) => f(lead(1.4, d), dg))], [`${t('біг')}, ${C.u}`, ...ds.map((d) => f(lead(3.5, d), dg))]]));
    }
    if (q.signs) {
      const signs = el('ul', { className: 'quiz-signs' });
      q.signs.forEach((x) => signs.append(el('li', {}, signText(x))));
      qBox.append(signs);
    }
    if (!answered(q)) {
      const check = iconBtn('quiz-go', 'check', t('Перевірити'));
      // Без зсуву прицілу відповідь — центр сітки: ціль може вже стояти там, де треба
      check.disabled = hidden;
      check.addEventListener('click', () => {
        if (search && Date.now() < q.appear) return;
        const tm = search ? Math.round((Date.now() - q.appear) / 100) / 10 : null;
        const ans = q.pending ?? [0, 0];
        fire(check, () => {
          if (answered(q) || quiz?.cur !== q) return;
          q.answer = ans;
          if (search) q.tm = tm;
          quiz.errs.push(Math.hypot(q.answer[0] + q.hx, q.answer[1] + q.hy)); quiz.shots.push([q.dist, q.tgt]);
          // Розкид гвинтівки: куля відходить від точки випадково (нормально, σ ≈ третина групи по кожній осі); помилка виносу — без нього
          q.disp = dispOf(C.u);
          if (q.disp) { const g = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()) * q.disp / 3; q.sp = [g(), g()]; }
          const [sx, sy] = q.sp ?? [0, 0];
          // Влучання відносно точки прицілювання — там, де на сітці ✕ (сітка на калібрувальній кратності, k = 1)
          q.band = hitBand(q.tgt, q.answer[0] + q.hx + sx, q.answer[1] + q.hy + sy, C.size(figH(q.tgt, qFig(q)), q.dist), q.vt > 0 && !q.goRight && !qFig(q), qFig(q), q.zone);
          quiz.hits.push(q.band);
          if (q.phase) q.guessErr = Math.abs(q.guess - q.dist) / q.dist * 100;
          scored(q, q.band === 'zone');
        });
      });
      // «Перевірити» — над підказкою, щоб не гортати до неї
      qBox.append(check, ...memos, el('p', {}, search && Date.now() < q.appear ? t('Шукай ціль — з’явиться десь у прицілі на 5 секунд.')
        : t('Наведи на ціль мітку сітки з урахуванням виносу: веди приціл пальцем, як гвинтівку (або тапни мітку — ціль стане на неї); лупа — кнопкою над прицілом. Потім «Перевірити».')));
    } else {
      const [ax, ay] = q.answer; const e = Math.hypot(ax + q.hx, ay + q.hy);
      const cm = moa ? e * 2.9089 * q.dist / 100 : e * q.dist / 10;
      const BAND = { zone: ['good', 'У зону ураження'], body: ['ok', 'У ціль, але повз зону ураження'], miss: ['bad', 'Повз ціль'] };
      const [cls, said] = BAND[q.band ?? 'miss'];
      const res = el('div', { className: `quiz-res ${cls}` });
      const dir = (v, a, b) => (Math.abs(v) < 0.05 ? '' : `${v > 0 ? a : b} ${f(Math.abs(v), moa ? 1 : 2)}`);
      // Шапка: вердикт ліворуч, помилка крупно праворуч — головне видно без читання
      const tol = moa ? 0.3 : 0.1; const dg = moa ? 1 : 2; const ex = ax + q.hx; const ey = ay + q.hy;
      const head = el('div', { className: 'quiz-res-head' });
      head.append(el('b', {}, q.timeout ? t('Час вийшов, пострілу не було') : t(said)));
      if (!q.timeout) {
        const big = el('span', { className: 'quiz-res-err' });
        big.append(el('strong', {}, `${f(e, dg)} ${C.u}`), el('small', {}, t('{cm} см на цілі', { cm: f(cm, 0) })));
        head.append(big);
      }
      res.append(head);
      if (q.phase) {
        res.append(el('span', { className: `quiz-res-note${q.guessErr > 10 ? ' w' : ''}` }, q.guess
          ? t('Насправді {d} м, твоя оцінка {g} м — помилка {p} %', { d: q.dist, g: q.guess, p: f(q.guessErr, 0) })
          : t('Насправді {d} м', { d: q.dist })));
      }
      // Винос таблицею: стовпці — висота й горизонталь, рядки «треба», «ти виніс» і помилка по кожній осі
      const calc = el('div', { className: 'quiz-calc quiz-calc3' });
      calc.append(el('span'), el('span', { className: 'h' }, `↕ ${t('вертикаль')}`), el('span', { className: 'h' }, `↔ ${t('горизонталь')}`));
      for (const [name, y, x] of [['треба', dir(q.hy, '↑', '↓'), dir(q.hx, '←', '→')], ['твій винос', dir(ay, '↓', '↑'), dir(ax, '→', '←')]]) {
        calc.append(el('span', {}, t(name)), el('span', { className: 'n' }, y || '0'), el('span', { className: 'n' }, x || '0'));
      }
      // Помилка окремо по висоті й по горизонталі (вітер, упередження): видно, що саме не так
      if (!q.timeout) {
        const part = (v, lo, hi) => el('span', { className: `n ${Math.abs(v) < tol ? 'ok' : 'w'}` }, Math.abs(v) < tol ? t('точно') : `${v > 0 ? t(lo) : t(hi)} ${f(Math.abs(v), dg)}`);
        calc.append(el('span', { className: 'e' }, t('помилка')), part(ey, 'нижче', 'вище'), part(ex, 'правіше', 'лівіше'));
      }
      const zt = zoneText(q.tgt, qFig(q), q.zone, q.dist);
      // Решта — рядками «назва — значення» (значення може бути в кілька рядків): зона, вітер за прикметами, розкид, час
      const kv = el('dl', { className: 'quiz-kv' });
      const add = (k, ...lines) => { const dd = el('dd'); lines.forEach((x) => dd.append(el('span', {}, x))); kv.append(el('dt', {}, k), dd); };
      if (zt) add(t(zt.name), `${zt.size} ${t('на {d} м', { d: q.dist })}`, zt.ang);
      if (q.signs) add(t('Вітер за ознаками'), t('{w} м/с — у розрахунку середина сходинки, {m} м/с', { w: WIND_Q[q.bucket][0], m: fm(q.wind) }));
      if (q.sp) add(t('Розкид гвинтівки'), t('відвів кулю на {cm} см', { cm: f(Math.hypot(...q.sp) * (moa ? 2.9089 : 10) * q.dist / 100, 0) }));
      if (q.tm != null) add(t('Час'), t('на пошук і постріл — {s} с', { s: f(q.tm, 1) }));
      res.append(calc, ...(kv.childElementCount ? [kv] : []), legend());
      // «Далі» — над розбором, щоб не гортати до неї після кожної цілі
      const done = quiz.errs.length >= quiz.total;
      if (done) {
        // Серія пишеться в історію один раз: «Як треба» перемальовує той самий кінець серії
        const r = (quiz.result ??= finishSeries());
        qBox.append(el('p', { className: 'quiz-sum' }, t('Серія: у зону ураження {n} з {total}, у ціль {b}, середня помилка {e} {u}', { n: r.good, total: quiz.total, b: r.body, e: f(r.avg, moa ? 1 : 2), u: C.u })
          + (r.ra != null ? ` · ${t('помилка дальності {p} %', { p: f(r.ra, 0) })}` : '')));
        const card = seriesCard(); if (card) qBox.append(card);
      }
      const [next, again] = nextBtns(done);
      const show = iconBtn('quiz-show', q.show ? 'mine' : 'show', q.show ? t('Моя відповідь') : t('Як треба'));
      show.addEventListener('click', () => { q.show = !q.show; drawQuiz(); });
      // «Далі» й «Як треба» — в одному рядку над розбором; «Повтори помилки» — під ними
      const row = el('div', { className: 'quiz-row quiz-acts' });
      row.append(next, show);
      qBox.append(row, ...(again ? [again] : []), res);
    }
    qBox.append(stopBtn());
  };

  const stopBtn = () => {
    const stop = iconBtn('quiz-stop', 'exit', t('Вийти з вправи'));
    stop.addEventListener('click', () => { clearTick(); const k = quiz.kind; quiz = null; simBox.classList.remove('quiz-on'); svg.style.touchAction = ''; renderStart(k); draw(); });
    return stop;
  };

  // Тап по сітці у вправі «куди тримати» — відповідь; координати сітки з урахуванням лупи
  // «Ціль» — наступний боєць кадру: дистанція (і винос) — до нього. Приціл переводимо на нього, як на початку завдання:
  // інакше з лупою чи за краєм кола не видно, кого вибрано. У «Дальність + винос» на кроці виносу ціль та, до якої міряли
  const nextFig = () => {
    if (!figs || figs.length < 2) return;
    const holder = quiz ? quiz.cur : st; const j = (holder.scene[1] + 1) % figs.length;
    buzz(true);
    if (!quiz) {
      const inp = $('s-dist'); const next = figDist(st, j, +inp.value); inp.value = next.dist;
      if (next.tgt !== st.tgt) { st.tgt = next.tgt; tgtSel.value = st.tgt; st.meas = 1; paintTgt(); }
      st.ret = [0, 0]; st.flashAt = performance.now();
      inp.dispatchEvent(new Event('input'));
      return;
    }
    const q = quiz.cur;
    const next = figDist(q, j, q.dist); q.dist = next.dist; q.tgt = next.tgt;
    if (q.kind === 'hold') Object.assign(q, holdSolve(q));
    q.ret = null; q.pending = null; q.at = performance.now();
    if (phase() === 'range') rangeScope(); else drawQuiz();
  };
  const answerHold = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return;
    const { x, y } = pt.matrixTransform(m.inverse());
    const q = quiz.cur; const k = kOf(RET[LOADS[$('s-kit').value].ret], q.mag);
    // Тап ставить ціль на мітку — відповідь зараховує «Перевірити», тож можна переставити й збільшити лупою
    q.pending = [-x / k, -y / k];
    drawQuiz();
  };

  // Лише приціл вправи «Визнач дальність» — перетягування сітки не чіпає поле відповіді під ним
  const rangeScope = () => {
    const q = quiz.cur; const r = q.ret ?? [0, 0];
    const shot = scope(svg, { ret: LOADS[$('s-kit').value].ret, mag: q.mag, dist: q.dist, tgt: q.tgt, mode: 'range', hx: 0, hy: 0, rx: r[0], ry: r[1], zoom: st.zoom, focus: st.focus, ...realOf(q, q.tgt), ink: st.ink, flash: (q.at ??= performance.now()), hide: q.hide,
      meas: quiz.level === 'learn' && !answered(q) ? 1 : 0 });
    setFigs(answered(q) ? null : shot.figs, q);
    svg.style.touchAction = 'none';
    paintRetReset(r[0] || r[1]); paintFocus();
  };

  const drawQuiz = () => {
    clearTick();
    if (quiz.kind === 'wind') { drawWind(); return; }
    if (phase() === 'hold') { drawHold(); return; }
    const L = LOADS[$('s-kit').value]; const C = RET[L.ret]; const q = quiz.cur; const T = TGT[q.tgt];
    rangeScope();
    qBox.replaceChildren();
    qBox.append(quizHead(q));
    qBox.append(el('p', {}, q.phase ? t('Скільки до цілі? Потім винос — за твоєю оцінкою, справжню дальність покажу після пострілу.')
      : quiz.level === 'easy' || quiz.level === 'pick' || quiz.level === 'learn' ? t(T.label) : t('Скільки до цілі? Розмір пригадай сам.')));
    if (quiz.level === 'learn' && !answered(q)) {
      // Скоба на цілі — скільки поділок вона займає, і формула з цими числами; відповідь рахуєш сам
      const fh = figH(q.tgt, qFig(q)); const sz = C.size(fh, q.dist) * kOf(C, q.mag); const moa = C.u === 'MOA'; const sv = f(sz, moa ? 1 : 2);
      const what = t(MEAS[q.tgt]?.[0]?.[0] ?? 'висота').replace(/^./, (c) => c.toUpperCase());
      const B = (x) => el('b', {}, x);
      const line = el('p', { className: 'quiz-facts quiz-size' });
      line.append(`${what} `, B(`${mFmt(fh)} ${t('м')}`), ` = `, B(`${sv} ${C.u}`), ` ${t('у сітці')}`);
      const formula = el('p', { className: 'quiz-facts quiz-size' });
      formula.append(`${t('дальність')} = `, B(moa ? `${f(fh * 100, 0)} ${t('см')}` : mFmt(fh)), moa ? ' × 34,38 ÷ ' : ' × 1000 ÷ ', B(sv));
      qBox.append(line, formula);
      if (RET_STADIA[L.ret]) qBox.append(el('p', { className: 'quiz-n' }, `${t('Шкала дальності')}: ${t(RET_STADIA[L.ret])}`));
    }
    const take = (a) => {
      // «Дальність + винос»: оцінку не розбираємо — з нею йдемо на винос
      if (q.phase) { q.guess = a; q.phase = 'hold'; drawQuiz(); reveal(); return; }
      q.answer = a;
      const e = Math.abs(a - q.dist) / q.dist * 100;
      quiz.errs.push(e); quiz.shots.push([q.dist, q.tgt]);
      scored(q, e <= 10);
    };
    if (!answered(q) && quiz.level === 'pick') {
      // Хибні варіанти — правдоподібні: ±15–40 % від правильної, кратні 10 м
      if (!q.opts) {
        const set = new Set([q.dist]);
        while (set.size < 4) {
          const m = [0.6, 0.7, 0.8, 0.85, 1.15, 1.25, 1.4, 1.6][Math.floor(Math.random() * 8)];
          const v = Math.round(q.dist * m / 10) * 10;
          if (v >= 50 && [...set].every((x) => Math.abs(x - v) >= x * 0.1)) set.add(v);
        }
        q.opts = [...set].sort((a, b) => a - b);
      }
      const row = el('div', { className: 'seg quiz-opts' });
      for (const v of q.opts) {
        const b = el('button', { type: 'button' }, `${v} ${t('м')}`);
        b.addEventListener('click', () => take(v));
        row.append(b);
      }
      qBox.append(row);
    } else if (!answered(q)) {
      const input = el('input', { type: 'number', inputMode: 'numeric', min: 1, step: 1, placeholder: t('Твоя відповідь, м') });
      const check = iconBtn('quiz-go', 'check', t('Перевірити'));
      const submit = () => {
        const a = Math.round(Number(String(input.value).replace(',', '.')));
        if (!(a > 0)) { input.focus(); return; }
        fire(check, () => { if (!answered(q) && quiz?.cur === q) take(a); });
      };
      check.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      const row = el('div', { className: 'quiz-row' });
      row.append(input, check);
      qBox.append(row);
      input.focus({ preventScroll: true });
    } else {
      const err = q.timeout ? 0 : q.answer - q.dist; const pct = q.timeout ? 100 : Math.abs(err) / q.dist * 100; const qh = figH(q.tgt, qFig(q)); const sz = C.size(qh, q.dist); const k = kOf(C, q.mag);
      const res = el('div', { className: `quiz-res ${pct <= 10 ? 'good' : pct <= 20 ? 'ok' : 'bad'}` });
      res.append(el('b', {}, q.timeout ? `${t('Час вийшов')} · ${t('Насправді {d} м', { d: q.dist })}` : t('Насправді {d} м', { d: q.dist })),
        q.timeout ? '' : el('span', {}, t('твоя {a} м · помилка {e} м · {p} %', { a: q.answer, e: `${err > 0 ? '+' : ''}${err}`, p: f(pct, 0) })));
      // Розрахунок таблицею: формула один раз над нею, рядок на кожен вимір (зріст, плечі, голова за бруствером)
      const dims = [...(T.skipH || q.hide ? [] : [[T.short, qh]]), ...(T.dims ?? []).filter(([n]) => !markOf(qFig(q))?.nm?.includes(n))];
      const calc = el('div', { className: 'quiz-calc' });
      calc.append(el('i', {}, C.u === 'MOA' ? t('дальність = розмір, см × 34,38 ÷ MOA') : t('дальність = розмір × 1000 ÷ MRAD')));
      for (const [name, size] of dims) calc.append(el('span', {}, t(name)), ...[`${f(size, 2)} ${t('м')}`, `${f(C.size(size, q.dist), 2)} ${C.u}`, `${q.dist} ${t('м')}`].map((s) => el('span', { className: 'n' }, s)));
      res.append(calc);
      if (q.hide) res.append(el('span', { className: 'w' }, t('Ціль за укриттям: зріст міряти не можна — міряй голову або плечі')));
      // Чутливість: наскільки зсуває дальність помилка читання сітки
      const base = T.skipH || q.hide ? C.size(T.dims[0][1], q.dist) : sz; const dlt = C.u === 'MOA' ? 0.25 : 0.1;
      const span = (n) => `${Math.round(q.dist * base / (base + n * dlt))}–${Math.round(q.dist * base / Math.max(0.01, base - n * dlt))} ${t('м')}`;
      res.append(el('span', { className: 'quiz-sens' }, t('Помилка читання сітки:')),
        ...[1, 2].map((n) => el('span', { className: 'quiz-sens' }, `±${f(n * dlt, 2)} ${C.u} → ${span(n)}`)));
      if (!C.ffp && q.mag < C.cal) res.append(el('span', { className: 'w' }, t('Кратність була {m}× — по сітці видно {v} {u}, це треба помножити на {c} або поставити {cal}×', { m: fm(q.mag), v: f(sz * k, 1), u: C.u, c: f(1 / k, 2), cal: C.cal })));
      const done = quiz.errs.length >= quiz.total;
      if (done) {
        // Серія пишеться в історію один раз: «Як треба» перемальовує той самий кінець серії
        const r = (quiz.result ??= finishSeries());
        qBox.append(el('p', { className: 'quiz-sum' }, t('Серія: середня помилка {p} %, у межах 10 % — {n} з {total}', { p: f(r.avg, 0), n: r.good, total: quiz.total })));
        const card = seriesCard(); if (card) qBox.append(card);
      }
      const row = el('div', { className: 'quiz-row quiz-acts' });
      row.append(...nextBtns(done));
      qBox.append(row, res);
    }
    qBox.append(stopBtn());
  };

  // «Визнач вітер»: ознаки словами — вибери силу з п'яти сходинок таблиці розділу «Вітер»
  const drawWind = () => {
    const q = quiz.cur; setFigs(null);
    svg.style.touchAction = '';
    qBox.replaceChildren(quizHead(q));
    const signs = el('ul', { className: 'quiz-signs' });
    q.signs.forEach((x) => signs.append(el('li', {}, signText(x))));
    qBox.append(el('p', {}, t('Яка сила вітру, м/с?')), signs);
    if (!answered(q) && quiz.level === 'bracket') {
      // Вилка: тап — одна сходинка, тап по сусідній — вилка з двох, по іншій — заново
      const row = el('div', { className: 'seg quiz-opts quiz-opts5' });
      WIND_Q.forEach(([label], i) => {
        const b = el('button', { type: 'button' }, label);
        b.setAttribute('aria-pressed', String(!!q.pick && i >= q.pick[0] && i <= q.pick[1]));
        b.addEventListener('click', () => {
          const [a, z] = q.pick ?? [];
          q.pick = a === z && Math.abs(i - a) === 1 ? [Math.min(a, i), Math.max(a, i)] : [i, i];
          drawQuiz();
        });
        row.append(b);
      });
      const check = iconBtn('quiz-go', 'check', t('Перевірити'));
      check.disabled = !q.pick;
      check.addEventListener('click', () => fire(check, () => {
        if (answered(q) || quiz?.cur !== q) return;
        const [a, z] = q.pick;
        const inside = q.bucket >= a && q.bucket <= z;
        q.answer = q.pick;
        q.pts = inside ? (a === z ? 2 : 1) : 0;
        quiz.errs.push(inside ? 0 : Math.min(Math.abs(q.bucket - a), Math.abs(q.bucket - z)));
        scored(q, inside);
      }));
      qBox.append(row, check, el('p', { className: 'quiz-n' }, t('Тапни сходинку, тап по сусідній — вилка з двох. Вузька правильна вилка — 2 очки, широка — 1.')));
    } else if (!answered(q)) {
      const row = el('div', { className: 'seg quiz-opts quiz-opts5' });
      WIND_Q.forEach(([label], i) => {
        const b = el('button', { type: 'button' }, label);
        b.addEventListener('click', () => { q.answer = i; const e = Math.abs(i - q.bucket); quiz.errs.push(e); scored(q, e === 0); });
        row.append(b);
      });
      qBox.append(row);
    } else if (Array.isArray(q.answer)) {
      const [label, land, mirage] = WIND_Q[q.bucket];
      const [a, z] = q.answer;
      const res = el('div', { className: `quiz-res ${q.pts === 2 ? 'good' : q.pts === 1 ? 'ok' : 'bad'}` });
      res.append(el('b', {}, q.pts === 2 ? t('Правильно: {w} м/с · 2 очки', { w: label })
        : q.pts === 1 ? t('У вилці: {w} м/с · 1 очко — вузька вилка дала б 2', { w: label })
          : t('Насправді {w} м/с, твоя вилка {a} м/с', { w: label, a: bracketLabel(a, z) })));
      if (q.flag != null) res.append(el('span', {}, t('Прапорець: кут ÷ 9 ≈ м/с, {a}° ≈ {v} м/с.', { a: q.flag, v: f(q.flag / 9, 1) })));
      res.append(el('span', {}, `${t('Ознаки {w} м/с', { w: label })}: ${[...land, ...(mirage ? [mirage] : [])].map((x) => t(x)).join('; ')}.`));
      const done = quiz.errs.length >= quiz.total;
      if (done) {
        // Серія пишеться в історію один раз, з очками вилки
        const r = (quiz.result ??= finishSeries());
        qBox.append(el('p', { className: 'quiz-sum' }, t('Серія: у вилці {n} з {total}, очок {p} з {max}', { n: r.good, total: quiz.total, p: r.pts, max: quiz.total * 2 })));
      }
      const row = el('div', { className: 'quiz-row quiz-acts' });
      row.append(...nextBtns(done));
      qBox.append(row, res);
    } else {
      const [label, land, mirage] = WIND_Q[q.bucket];
      const e = q.timeout ? WIND_Q.length : Math.abs(q.answer - q.bucket);
      const res = el('div', { className: `quiz-res ${e === 0 ? 'good' : e === 1 ? 'ok' : 'bad'}` });
      res.append(el('b', {}, q.timeout ? `${t('Час вийшов')} · ${t('вітер {w} м/с', { w: label })}`
        : e === 0 ? t('Правильно: {w} м/с', { w: label }) : t('Насправді {w} м/с, твоя відповідь {a} м/с', { w: label, a: WIND_Q[q.answer][0] })));
      if (q.flag != null) res.append(el('span', {}, t('Прапорець: кут ÷ 9 ≈ м/с, {a}° ≈ {v} м/с.', { a: q.flag, v: f(q.flag / 9, 1) })));
      res.append(el('span', {}, `${t('Ознаки {w} м/с', { w: label })}: ${[...land, ...(mirage ? [mirage] : [])].map((x) => t(x)).join('; ')}.`));
      const done = quiz.errs.length >= quiz.total;
      if (done) {
        // Серія пишеться в історію один раз: «Як треба» перемальовує той самий кінець серії
        const r = (quiz.result ??= finishSeries());
        qBox.append(el('p', { className: 'quiz-sum' }, t('Серія: правильно {n} з {total}', { n: r.good, total: quiz.total })));
      }
      const row = el('div', { className: 'quiz-row quiz-acts' });
      row.append(...nextBtns(done));
      qBox.append(row, res);
    }
    qBox.append(stopBtn());
  };

  const renderStart = (kindNow = 'range', play = false) => {
    clearTick();
    const kind = el('div', { className: 'seg quiz-kind' });
    KINDS.forEach(([v, label]) => {
      // Щойно вибрана вправа — її значок ~2 с грає своє (як розділи Полігону)
      const b = iconBtn(play && v === kindNow ? 'play' : '', v, t(label));
      b.dataset.kind = v;
      b.setAttribute('aria-pressed', String(v === kindNow));
      b.addEventListener('click', () => { if (v !== kindNow) renderStart(v, true); });
      kind.append(b);
    });
    // Складність — випадним списком: згорнуто видно лише вибране, розгорнуто — усі рівні з поясненням; вибір пам'ятається для кожної вправи
    const all = LEVELS[kindNow].filter(([v]) => !RETIRED.includes(v));
    const stored = localStorage.getItem(LEVEL_KEY(kindNow));
    // Хто тренувався на «Своїй дистанції» — «Нормально» з тими ж дистанціями: «дист.» ± 100 м
    if (stored === 'near' && !localStorage.getItem(DIST_KEY)) {
      const c = +$('s-dist').value;
      saveDist([Math.max(DIST_ALL[0], Math.round((c - 100) / 50) * 50), Math.min(DIST_ALL[1], Math.round((c + 100) / 50) * 50)]);
    }
    let picked = all.some(([v]) => v === stored) ? stored : 'normal';
    // У «Виносі» стрічка — лише група вибраного рівня; над нею — перемикач груп
    const groups = LEVEL_GROUPS[kindNow];
    const group = groups?.find(([, , ks]) => ks.includes(picked));
    const levels = group ? all.filter(([v]) => group[2].includes(v)) : all;
    let groupChips = null;
    if (groups) {
      groupChips = chips(groups.map(([k, name]) => [k, t(name)]), group[0], (k) => {
        try { localStorage.setItem(LEVEL_KEY(kindNow), groups.find(([g]) => g === k)[3]); } catch { /* приватний режим */ }
        renderStart(kindNow);
      });
      groupChips.classList.add('segmented', 'quiz-groups');
    }
    const levelBody = (i) => {
      const [v, name, what] = levels[i];
      let mark;
      if (MODE_ICON[v]) {
        mark = el('span', { className: 'ql-mode' });
        mark.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MODE_ICON[v]}</svg>`;
      } else {
        mark = el('span', { className: 'ql-bars' });
        mark.append(...[1, 2, 3, 4, 5].map((j) => el('i', { className: j <= LEVEL_BARS[name] ? 'on' : '' })));
      }
      mark.setAttribute('aria-hidden', 'true');
      const zn = ZONE_BY[kindNow]?.[v];
      return [mark, el('b', {}, t(name)), el('small', {}, zn ? `${t(what)} · ${t(ZONE_NOTE[zn])}` : t(what))];
    };
    // Як стрічка цілей: плитки в один рядок, посередині — в рамці з описом під стрічкою, тап вибирає
    const strip = el('div', { className: 'tgt-grid quiz-level-strip', role: 'group' });
    strip.setAttribute('aria-label', t('Складність'));
    const note = el('p', { className: 'tgt-note quiz-level-note' });
    levels.forEach(([v], i) => {
      const [mark, name, what] = levelBody(i);
      const b = el('button', { type: 'button', className: 'tgt-opt quiz-level' });
      b.append(mark, el('span', {}, name.textContent));
      b.dataset.level = v; b.dataset.what = what.textContent;
      b.addEventListener('click', () => {
        picked = v;
        try { localStorage.setItem(LEVEL_KEY(kindNow), v); } catch { /* приватний режим */ }
        paintLevels();
        paintProg();
        wheel.centerOn(b);
      });
      strip.append(b);
    });
    // Рівень посередині стрічки — одразу вибраний: гортаєш і не треба ще тапати
    const wheel = wheelStrip(strip, (b) => {
      note.textContent = `${b.textContent} — ${b.dataset.what}`;
      if (b.dataset.level === picked) return;
      picked = b.dataset.level;
      try { localStorage.setItem(LEVEL_KEY(kindNow), picked); } catch { /* приватний режим */ }
      paintLevels(); paintProg();
    });
    // «‹ ›» по краях: видно, що стрічку гортають, і тап — рівень легше чи важче
    const step = (dir) => {
      const cur = strip.querySelector('[aria-pressed="true"]');
      (dir < 0 ? cur?.previousElementSibling : cur?.nextElementSibling)?.click();
    };
    const easier = el('button', { type: 'button', className: 'quiz-level-nav', textContent: '‹' });
    const harder = el('button', { type: 'button', className: 'quiz-level-nav', textContent: '›' });
    easier.setAttribute('aria-label', t('Легше')); harder.setAttribute('aria-label', t('Складніше'));
    easier.addEventListener('click', () => step(-1)); harder.addEventListener('click', () => step(1));
    const level = el('div', { className: 'quiz-levels' });
    level.append(easier, strip, harder, note);
    let paintNote = null;
    const paintLevels = () => {
      strip.querySelectorAll('.quiz-level').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === picked)));
      const cur = strip.querySelector('[aria-pressed="true"]');
      easier.disabled = !cur?.previousElementSibling; harder.disabled = !cur?.nextElementSibling;
      // Згорнутий блок підказує, що всередині: вправа, рівень і вибрані дистанції
      const dr = kindNow === 'wind' ? null : distRange();
      $('sim-quiz-sum').textContent = `${t(KINDS.find(([v]) => v === kindNow)[1])} · ${t(levels.find(([v]) => v === picked)?.[1] ?? '')}${dr ? ` · ${distLabel(dr)}` : ''}`;
      paintNote?.();
    };
    paintLevels();
    // «Дистанції від–до» (крок 50 м) — з будь-яким рівнем; одні на всі вправи, крім «Вітру», де дистанції немає
    const distBox = kindNow === 'wind' ? null : el('div', { className: 'quiz-dist' });
    const aboutEl = el('p', { className: 'quiz-n' });
    if (distBox) {
      const marks = Array.from({ length: (DIST_ALL[1] - DIST_ALL[0]) / 50 + 1 }, (_, i) => DIST_ALL[0] + i * 50);
      const select = (v, label) => {
        const s = el('select');
        s.append(...marks.map((d) => el('option', { value: String(d), selected: d === v }, String(d))));
        s.setAttribute('aria-label', label);
        return s;
      };
      const [a, b] = distPref();
      const from = select(a, t('Дистанції від')); const to = select(b, t('Дистанції до'));
      const note = el('small', { className: 'quiz-dist-note' });
      // Набій не дістає до вибраного: свій — лише в межах таблиці, вбудований — до краю повзунка «дист.»; «Голова» — до 400 м
      paintNote = () => {
        const L = LOADS[$('s-kit').value]; const dr = distRange();
        const lo = L.my ? L.dmin : DIST_ALL[0]; const table = L.my ? L.dmax : +$('s-dist').max;
        const head = kindNow === 'hold' && picked === 'head' && NEAR_MAX.head < table;
        const top = head ? NEAR_MAX.head : table;
        note.textContent = !dr || kindNow === 'range' ? ''
          : dr[0] > top || dr[1] < lo ? (head ? t('«Голова» — до {d} м: цілі будуть на {a}–{d} м', { a: lo, d: top })
            : t('У цього набору таблиця {a}–{b} м — цілі будуть на всіх її дистанціях', { a: lo, b: top }))
            : dr[1] > top ? (head ? t('«Голова» — до {d} м: далі це лотерея', { d: top })
              : t('Винос — до {d} м: далі в набору немає таблиці', { d: top })) : '';
        note.hidden = !note.textContent;
      };
      const change = (e) => {
        let lo = +from.value; let hi = +to.value;
        // «від» більше за «до» — друге підтягується до щойно вибраного
        if (lo > hi) { if (e.target === from) { hi = lo; to.value = String(hi); } else { lo = hi; from.value = String(lo); } }
        saveDist([lo, hi]);
        paintLevels(); paintAbout(); paintProg();
      };
      from.addEventListener('change', change); to.addEventListener('change', change);
      distBox.append(el('span', { className: 'quiz-dist-label' }, t('Дистанції')), el('span', {}, t('від')), from, el('span', {}, t('до')), to,
        el('span', {}, t('м')), note);
      paintNote();
    }
    requestAnimationFrame(() => wheel.settle(strip.querySelector('[aria-pressed="true"]')));
    const go = iconBtn('quiz-go', 'start', t('Почати серію з {n}', { n: SERIES }));
    go.addEventListener('click', () => {
      quiz = newQuiz(kindNow, picked, null, kindNow === 'wind' ? null : distRange());
      quiz.cur = nextTarget();
      // Під час серії блок відкритий — питання не ховаються
      quizFold(true, false);
      simBox.classList.add('quiz-on');
      drawQuiz();
      reveal();
    });
    const u = RET[LOADS[$('s-kit').value].ret].u;
    const paintAbout = () => {
      const [a, b] = distRange() ?? DIST_ALL;
      aboutEl.textContent = {
        hold: t('Дано дистанцію (і вітер, і рух), постав ціль на мітку сітки, яку наведеш на неї з урахуванням виносу. Помилка — в {u} і сантиметрах на цілі.', { u }),
        combo: t('Як у бою: спершу визнач дальність по сітці, потім винеси приціл за своєю оцінкою. Помилка в дальності сама стає промахом — справжню дальність покажу після пострілу.'),
        wind: t('Ознаки на місцевості й міраж — назви силу вітру. Шкала — як у таблиці розділу «Вітер».'),
      }[kindNow] ?? t('Ціль на {a}–{b} м: прочитай її розмір по сітці й назви дальність. Серія з {n} цілей.', { a, b, n: SERIES });
    };
    paintAbout();
    // Прогрес на вибраному рівні: стовпчик — серія, вище — більше влучних; повтори помилок не рахуємо — там лише важкі цілі
    const own = history().filter((h) => h.kind === kindNow && !h.rep);
    const prog = el('div', { className: 'quiz-hist' });
    const paintProg = () => {
      // Прогрес — на цьому рівні й на тих самих дистанціях: на 600–800 м і на всіх — різні тренування
      const dr = kindNow === 'wind' ? null : distRange();
      const mine = own.filter((h) => h.level === picked && String(h.dr ?? '') === String(dr ?? ''));
      const past = mine.slice(-10);
      const name = t(levels.find(([v]) => v === picked)[1]);
      const parts = [el('b', { className: 'quiz-hist-title' }, t('Твій прогрес · {l}', { l: dr ? `${name} · ${distLabel(dr)}` : name }))];
      if (!past.length) {
        parts.push(el('span', {}, own.length ? t('На цьому рівні серій ще немає.') : t('Пройди першу серію — тут з’явиться прогрес.')));
      } else {
        const last = past.at(-1);
        const crit = t({ range: 'у межах 10 %', wind: 'точно' }[kindNow] ?? 'у зону ураження');
        const bars = el('div', { className: 'quiz-bars', role: 'img' });
        bars.setAttribute('aria-label', past.map((h) => `${h.good}/${h.n}`).join(', '));
        past.forEach((h, i) => {
          const b = el('i', { className: i === past.length - 1 ? 'last' : '' }, String(h.good));
          b.style.height = `calc(16px + ${h.good / h.n} * (100% - 16px))`;
          b.title = `${h.good}/${h.n}`;
          bars.append(b);
        });
        const best = past.reduce((a, b) => (b.good / b.n > a.good / a.n ? b : a));
        parts.push(bars, el('small', {}, t('влучних у кожній серії з {n}, яскравий — остання', { n: last.n })),
          el('span', {}, t('Остання: {g} з {n} {crit} · найкраща {b} з {bn} · серій {s}', { g: last.good, n: last.n, crit, b: best.good, bn: best.n, s: mine.length })));
        // Сусідній рівень на сходинці: дві серії поспіль від 80 % — важче, остання нижче 40 % — легше
        const rate = (h) => h.good / h.n;
        const ladder = (b) => (b && !LEVEL_MODES.includes(b.dataset.level) ? b : null);
        const cur = ladder(strip.querySelector(`[data-level="${picked}"]`));
        const up = mine.length >= 2 && mine.slice(-2).every((h) => rate(h) >= 0.8) && ladder(cur?.nextElementSibling);
        const down = !up && rate(last) < 0.4 && ladder(cur?.previousElementSibling);
        const to = up || down;
        if (to) {
          const b = el('button', { type: 'button', className: 'quiz-stop quiz-step' },
            `${t(up ? 'Спробуй складніше: {l}' : 'Спробуй легше: {l}', { l: to.textContent })} →`);
          b.addEventListener('click', () => to.click());
          parts.push(b);
        }
        // Похибка словами й куди йде: середнє трьох останніх серій проти трьох попередніх
        if (kindNow !== 'wind') {
          const same = mine.filter((h) => h.u === last.u);
          const avgOf = (xs) => xs.reduce((s, h) => s + h.avg, 0) / xs.length;
          const e = avgOf(same.slice(-5));
          const txt = kindNow === 'range' ? t('Похибка дальності в середньому {e} %', { e: f(e, 0) })
            : t('Промах від потрібної точки в середньому {e} {u}', { e: f(e, last.u === 'MOA' ? 1 : 2), u: last.u });
          let trend = '';
          if (same.length >= 6) {
            const a = avgOf(same.slice(-3)); const b = avgOf(same.slice(-6, -3));
            trend = a < b * 0.9 ? t('стає краще') : a > b * 1.1 ? t('стало гірше') : t('тримається рівно');
          }
          parts.push(el('span', {}, trend ? `${txt} — ${trend}` : txt));
          const ra = same.filter((h) => h.ra != null).slice(-5);
          if (ra.length) parts.push(el('span', {}, t('Похибка дальності в середньому {e} %', { e: f(ra.reduce((s, h) => s + h.ra, 0) / ra.length, 0) })));
        }
      }
      const weak = weakSpot(kindNow, own);
      if (weak) {
        const w = el('span', { className: 'quiz-weak' }, weak.text);
        // Слабке місце — дистанції: кнопка сама виставляє їх у «Дистанції від–до»
        if (weak.band && String(weak.band) !== String(dr)) {
          const train = el('button', { type: 'button', className: 'quiz-stop quiz-weak-go' }, `${t('Потренувати: {d}', { d: distLabel(weak.band) })} →`);
          train.addEventListener('click', () => { saveDist(weak.band); renderStart(kindNow); });
          w.append(' ', train);
        }
        parts.push(w);
      }
      if (kindNow === 'wind') { const jw = journalWind(); if (jw) parts.push(jw); }
      if (history().length) {
        const more = el('button', { type: 'button', className: 'quiz-stop' }, `${t('Уся статистика')} →`);
        more.addEventListener('click', () => renderStats(kindNow));
        parts.push(more);
      }
      prog.replaceChildren(...parts);
    };
    paintProg();
    qBox.replaceChildren(...[kind, groupChips, level, distBox, go, aboutEl, prog].filter(Boolean));
  };

  // Ціль зарахована за покроковим записом серії: дальність — у межах 10 %, вітер — точно, винос — у зону
  const shotOk = (kind, s) => (kind === 'range' ? s[1] <= 10 : kind === 'wind' ? s[1] === 0 : s[3] === 'zone');
  /**
   * Слабке місце: дистанція, ціль чи сила вітру, де помиляєшся помітно частіше, ніж загалом.
   * Лише коли там набралося хоча б 8 цілей і помилок у півтора раза більше (і хоча б на 15 пунктів).
   */
  const weakSpot = (kind, list) => {
    const shots = list.flatMap((h) => h.sh ?? []).filter((s) => s[0] != null);
    if (shots.length < 16) return null;
    const miss = (xs) => xs.filter((s) => !shotOk(kind, s)).length / xs.length;
    const all = miss(shots);
    const groups = kind === 'wind'
      ? WIND_Q.map(([label], i) => [t('вітер {w} м/с', { w: label }), shots.filter((s) => s[0] === i)])
      : [...DIST_BANDS.map(([a, b, label, band]) => [t(label), shots.filter((s) => s[0] >= a && s[0] <= b), band]),
        ...Object.keys(TGT).map((k) => [t(TGT[k].short), shots.filter((s) => s[2] === k)])];
    const worst = groups.filter(([, xs]) => xs.length >= 8).map(([what, xs, band]) => [what, miss(xs), band])
      .filter(([, m]) => m >= all * 1.5 && m - all >= 0.15).sort((a, b) => b[1] - a[1])[0];
    if (!worst) return null;
    const [what, m, band] = worst;
    return { band, text: t('Слабке місце — {what}: правильно {p} %, а в середньому {p0} %. Потренуй це окремо.', { what, p: Math.round((1 - m) * 100), p0: Math.round((1 - all) * 100) }) };
  };

  // Статистика тренувань: окремо від журналу справжніх стрільб, лише з цього пристрою
  const renderStats = (kindNow) => {
    const tabs = el('div', { className: 'seg quiz-kind' });
    KINDS.forEach(([v, label]) => {
      const b = iconBtn('', v, t(label));
      b.setAttribute('aria-pressed', String(v === kindNow));
      b.addEventListener('click', () => renderStats(v));
      tabs.append(b);
    });
    const back = el('button', { type: 'button', className: 'quiz-stop' }, `← ${t('Назад до вправи')}`);
    back.addEventListener('click', () => renderStart(kindNow));
    // Повтори помилок не рахуємо: там лише важкі цілі, вони занизили б загальну картину
    const list = history().filter((h) => h.kind === kindNow && !h.rep);
    const hold = kindNow === 'hold' || kindNow === 'combo';
    const wind = kindNow === 'wind';
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
    const sum = (arr, k) => arr.reduce((s, h) => s + (h[k] ?? 0), 0);
    const mean = (arr, k) => { const xs = arr.filter((h) => h[k] != null); return xs.length ? xs.reduce((s, h) => s + h[k], 0) / xs.length : null; };
    // Помилка серії: у «Визнач дальність» — % дистанції, у «Виносі» — в одиницях сітки (MRAD і MOA окремо)
    const errTxt = (arr) => {
      if (!hold) return arr.length ? `${f(mean(arr, 'avg'), 0)} %` : '—';
      return [...new Set(arr.map((h) => h.u))].map((u) => {
        const xs = arr.filter((h) => h.u === u);
        return `${f(mean(xs, 'avg'), u === 'MOA' ? 1 : 2)} ${u}`;
      }).join(' · ') || '—';
    };
    // Головний показник: у «Винос» — у зону ураження, у «Визнач дальність» — у межах 10 %, у «Вітрі» — точно
    const hitTxt = (arr) => pct(sum(arr, 'good'), sum(arr, 'n'));
    const table = (title, head, rows) => {
      if (!rows.length) return null;
      const box = el('div', { className: 'sim-stats' });
      box.append(el('b', {}, title));
      const tb = el('table');
      const tr = el('tr'); head.forEach((x) => tr.append(el('th', {}, x))); tb.append(tr);
      rows.forEach((r) => { const row = el('tr'); r.forEach((x) => row.append(el('td', {}, String(x)))); tb.append(row); });
      box.append(tb);
      return box;
    };
    const parts = [tabs];
    if (!list.length) {
      parts.push(el('p', { className: 'quiz-n' }, t('Ще немає серій цієї вправи.')));
    } else {
      const month = Date.now() - 30 * 864e5;
      const shots = list.flatMap((h) => h.sh ?? []);
      parts.push(el('p', { className: 'quiz-facts' }, t('Серій {s} · цілей {n} · за 30 днів {m}', { s: list.length, n: sum(list, 'n'), m: list.filter((h) => h.at >= month).length })));
      const weak = weakSpot(kindNow, list);
      if (weak) parts.push(el('p', { className: 'quiz-weak' }, weak.text));
      const raTxt = (arr) => { const v = mean(arr, 'ra'); return v == null ? '—' : `${f(v, 0)} %`; };
      const combo = kindNow === 'combo';
      const head = wind ? [t('Правильно')] : hold ? [t('У зону'), t('У ціль'), t('Похибка'), ...(combo ? [t('Дальність')] : [])] : [t('У межах 10 %'), t('Похибка')];
      const row = (arr) => (wind ? [hitTxt(arr)]
        : hold ? [hitTxt(arr), pct(sum(arr, 'body'), sum(arr, 'n')), errTxt(arr), ...(combo ? [raTxt(arr)] : [])] : [hitTxt(arr), errTxt(arr)]);
      parts.push(table(t('Загалом'), ['', ...head], [[t('усі серії'), ...row(list)], ...(list.length > 10 ? [[t('останні 10'), ...row(list.slice(-10))]] : [])]));
      const sp = sparkline(list.slice(-30).map((h) => -h.avg));
      if (sp) { const w = el('div', { className: 'quiz-hist' }); w.append(el('small', {}, t('Похибка за серіями, вище — краще')), sp); parts.push(w); }
      // Тиждень за тижнем: частка влучних і (у «Пошуку») час на ціль — останні 8 тижнів, де були серії
      const weekOf = (at) => { const d = new Date(at); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
      const weeks = [...list.reduce((m, h) => m.set(weekOf(h.at), [...(m.get(weekOf(h.at)) ?? []), h]), new Map())].sort((a, b) => a[0] - b[0]).slice(-8);
      if (weeks.length >= 2) {
        const w = el('div', { className: 'quiz-hist' });
        const bars = el('div', { className: 'quiz-bars', role: 'img' });
        const share = (arr) => sum(arr, 'good') / Math.max(1, sum(arr, 'n'));
        bars.setAttribute('aria-label', weeks.map(([, a]) => hitTxt(a)).join(', '));
        weeks.forEach(([wk, a], i) => {
          const b = el('i', { className: i === weeks.length - 1 ? 'last' : '' }, String(Math.round(share(a) * 100)));
          b.style.height = `calc(16px + ${share(a)} * (100% - 16px))`;
          b.title = `${new Date(wk).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}: ${hitTxt(a)} · ${t('серій')} ${a.length}`;
          bars.append(b);
        });
        const tmw = weeks.map(([, a]) => mean(a, 'tm')).filter((x) => x != null);
        w.append(el('small', {}, t('Влучно по тижнях, %, яскравий — цей тиждень')), bars,
          ...(tmw.length ? [el('small', {}, tmw.length > 1 ? t('Пошук: час на ціль {a} с → {b} с', { a: f(tmw[0], 1), b: f(tmw.at(-1), 1) })
            : t('Пошук: час на ціль {a} с', { a: f(tmw[0], 1) }))] : []));
        parts.push(w);
      }
      parts.push(table(t('За складністю'), ['', t('Серій'), ...head],
        LEVELS[kindNow].map(([v, name]) => [t(name), list.filter((h) => h.level === v)]).filter(([, a]) => a.length).map(([l, a]) => [l, a.length, ...row(a)])));
      if (wind) {
        parts.push(journalWind());
        parts.push(table(t('За силою вітру'), ['', t('Завдань'), t('Правильно')], WIND_Q.map(([label], i) => [`${label} ${t('м/с')}`, shots.filter((s) => s[0] === i)])
          .filter(([, xs]) => xs.length).map(([l, xs]) => [l, xs.length, pct(xs.filter((s) => s[1] === 0).length, xs.length)])));
      } else {
        // За дистанцією й ціллю — з покрокових записів (є в серіях, зіграних після оновлення)
        const shotRow = (xs) => (hold
          ? [xs.length, pct(xs.filter((s) => s[3] === 'zone').length, xs.length), pct(xs.filter((s) => s[3] && s[3] !== 'miss').length, xs.length)]
          : [xs.length, pct(xs.filter((s) => s[1] <= 10).length, xs.length), `${f(xs.reduce((a, s) => a + s[1], 0) / xs.length, 0)} %`]);
        const shotHead = hold ? [t('Цілей'), t('У зону'), t('У ціль')] : [t('Цілей'), t('У межах 10 %'), t('Похибка')];
        parts.push(table(t('За дистанцією'), ['', ...shotHead], DIST_BANDS.map(([a, b, l]) => [t(l), shots.filter((s) => s[0] >= a && s[0] <= b)])
          .filter(([, xs]) => xs.length).map(([l, xs]) => [l, ...shotRow(xs)])));
        parts.push(table(t('За ціллю'), ['', ...shotHead], Object.keys(TGT).map((k) => [t(TGT[k].short), shots.filter((s) => s[2] === k)])
          .filter(([, xs]) => xs.length).map(([l, xs]) => [l, ...shotRow(xs)])));
        if (!shots.length) parts.push(el('p', { className: 'quiz-n' }, t('Розбивка за дистанцією й ціллю з’явиться після нових серій.')));
      }
    }
    parts.push(el('p', { className: 'quiz-n' }, t('Зберігається лише на цьому пристрої.')), back);
    qBox.replaceChildren(...parts.filter(Boolean));
  };
  renderStart();

  // Повзунок і свайп по прицілу дають input частіше за кадри — малюємо раз на кадр, останнім значенням
  let drawFrame = 0;
  const drawSoon = () => { drawFrame ||= requestAnimationFrame(() => { drawFrame = 0; draw(); }); };
  ['s-dist', 's-mag', 's-wind'].forEach((i) => $(i).addEventListener('input', drawSoon));
  ['s-barrel', 's-zero', 's-wdir', 's-mv', 's-mvdir', 's-temp', 's-alt', 's-disp', 's-cmp'].forEach((i) => $(i).addEventListener('change', draw));
  $('s-dope').addEventListener('click', openDope);
  // Своя таблиця з погодою — повітря стає на її погоду: цифри таблиці як є, доки погоду не змінили
  $('s-kit').addEventListener('change', () => { const W = LOADS[$('s-kit').value].wx; if (W) { airOpt('s-temp', W.tC); airOpt('s-alt', W.alt); } setupKit(); st.ret = [0, 0]; st.focus = null; if (quiz) { clearTick(); quiz.view = null; quiz.live = null; quiz.cur = nextTarget(); } draw(); });
  // «i» біля вибору прицілу — пояснення, як читати тренажер і з якими даними пораховано
  // Лупа на центр сітки: 1× → 2× → 4× → 6× → 1×
  const ZOOMS = [1, 2, 4, 6];
  const zoomBtn = $('sim-zoom');
  const setZoom = (z) => {
    st.zoom = z;
    if (zoomBtn) {
      zoomBtn.querySelector('span').textContent = `${st.zoom}×`;
      zoomBtn.setAttribute('aria-pressed', String(st.zoom > 1));
    }
    draw();
  };
  const nextZoom = () => setZoom(ZOOMS[(ZOOMS.indexOf(st.zoom) + 1) % ZOOMS.length]);
  zoomBtn?.addEventListener('click', nextZoom);
  // Колір сітки: чорна ↔ біла; поки не вибрано — як у теми, а на фото чорна
  const inkBtn = $('sim-ink');
  const inkNow = () => st.ink ?? (st.real ? 'black' : null);
  const paintInk = () => {
    if (!inkBtn) return;
    const ink = inkNow() ?? 'auto'; inkBtn.setAttribute('data-ink', ink);
    inkBtn.setAttribute('aria-label', `${t('Колір сітки')}: ${t({ black: 'чорна', white: 'біла', auto: 'як у теми' }[ink])}`);
  };
  inkBtn?.addEventListener('click', () => {
    const cur = inkNow() ?? (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || ['dark', 'phosphor', 'amber', 'white'].includes(document.documentElement.dataset.theme) ? 'white' : 'black');
    st.ink = cur === 'black' ? 'white' : 'black';
    paintInk(); draw();
  });
  // Свайп ліворуч/праворуч по прицілу — кратність, вгору/вниз — дистанція (крок 25 м); тап — лупа, а у вправі «куди тримати» — відповідь;
  // у далекомірі (і у вправі «Визнач дальність») палець веде приціл, як у «Виносі», щоб прикласти шкалу до цілі
  const ranging = () => (quiz ? phase() === 'range' : st.mode === 'range');
  // Розмітка: точка екрана → одиниці цілі (частки висоти від центру й верху силуету)
  const toUnits = (e) => {
    const m = svg.getScreenCTM()?.inverse(); if (!m || !editAt) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [(p.x - editAt.cx) / editAt.H, (p.y - editAt.top) / editAt.H];
  };
  svg.addEventListener('pointerdown', (e) => {
    const f = st.edit && !quiz && st.mode === 'aim' ? curFig() : null;
    const at = f && toUnits(e);
    if (at) {
      // Хапаємо ближчу зону: голову, якщо палець у її колі чи ближче до неї, інакше — груди (в окопі — лише голова)
      const { head, body } = zonesOf(st.tgt, f);
      const dh = head ? Math.hypot(at[0] - head.ax, at[1] - head.ap) : Infinity;
      const db = body ? Math.hypot(at[0] - body.ax, at[1] - body.ap) : Infinity;
      const key = head && (dh <= head.kz[3] * 1.3 || dh < db) ? 'hd' : 'c';
      const z = key === 'hd' ? head : body;
      drag = { mark: f.id, key, from: [z.ax, z.ap], at, on: false, x: e.clientX, y: e.clientY };
      try { svg.setPointerCapture(e.pointerId); } catch { /* указівник уже відпущено */ }
      return;
    }
    // Після свайпу на тачі click не приходить — інакше прапорець «з'їв» би наступний тап
    swiped = false;
    drag = { x: e.clientX, y: e.clientY, d: +$('s-dist').value, mg: +$('s-mag').value, on: false };
    if (ranging()) {
      drag.r0 = (quiz ? quiz.cur.ret : st.ret) ?? [0, 0]; drag.m = svg.getScreenCTM()?.inverse();
      try { svg.setPointerCapture(e.pointerId); } catch { /* указівник уже відпущено — тягнемо без захоплення */ }
      return;
    }
    // «Винос»: ведемо приціл — запам'ятати, звідки, і масштаб екран → одиниці сітки
    if (quiz && phase() === 'hold' && !answered(quiz.cur)) {
      drag.p0 = quiz.cur.pending ?? [0, 0]; drag.m = svg.getScreenCTM()?.inverse();
      drag.k = kOf(RET[LOADS[$('s-kit').value].ret], quiz.cur.mag);
      try { svg.setPointerCapture(e.pointerId); } catch { /* указівник уже відпущено — тягнемо без захоплення */ }
    }
  });
  // Перетягування малює не частіше, ніж раз на кадр: pointermove буває частіше за кадри, а кожен малюнок прицілу важкий.
  // Стан (зсув, винос) оновлюється одразу — «Перевірити» й відпускання пальця бачать останнє положення
  let dragFrame = 0; let dragPaint = null;
  const paintNow = () => {
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = 0; }
    const fn = dragPaint; dragPaint = null; fn?.();
  };
  const paintSoon = (fn) => { dragPaint = fn; dragFrame ||= requestAnimationFrame(() => { dragFrame = 0; paintNow(); }); };
  const holdNow = () => { if (quiz && phase() === 'hold' && !answered(quiz.cur)) holdScope(); };
  svg.addEventListener('pointermove', (e) => {
    if (drag?.mark) {
      const p = toUnits(e); if (!p) return;
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
      drag.on = true;
      marks[drag.mark] = { ...marks[drag.mark], [drag.key]: [drag.from[0] + p[0] - drag.at[0], drag.from[1] + p[1] - drag.at[1]] };
      paintSoon(() => !quiz && draw());
      return;
    }
    if (drag?.r0 && drag.m) {
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.on = true;
      const ex = e.clientX - drag.x; const ey = e.clientY - drag.y;
      // Межа та сама, що в scope(): інакше після виходу за край ціль «стоїть», поки палець не повернеться
      const C = RET[LOADS[$('s-kit').value].ret]; const R = (C.ffp ? C.R * C.cal / (quiz ? quiz.cur.mag : +$('s-mag').value) : C.R) * 0.85;
      const cl = (v) => Math.max(-R, Math.min(R, v));
      const r = [cl(drag.r0[0] + drag.m.a * ex + drag.m.c * ey), cl(drag.r0[1] + drag.m.b * ex + drag.m.d * ey)];
      if (quiz) { quiz.cur.ret = r; paintSoon(() => quiz && rangeScope()); } else { st.ret = r; paintSoon(() => !quiz && dragScope()); }
      return;
    }
    if (drag?.p0 && drag.m) {
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.on = true;
      const dx = (drag.m.a * (e.clientX - drag.x) + drag.m.c * (e.clientY - drag.y)) / drag.k;
      const dy = (drag.m.b * (e.clientX - drag.x) + drag.m.d * (e.clientY - drag.y)) / drag.k;
      // Як винтівкою: тягнеш праворуч — приціл іде праворуч, ціль у ньому зсувається ліворуч
      quiz.cur.pending = [drag.p0[0] + dx, drag.p0[1] + dy];
      paintSoon(holdNow);
      return;
    }
    if (!drag || quiz) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    // Вісь — за першим рухом: праворуч/ліворуч — кратність (праворуч — більша), вгору/вниз — дистанція (вгору — далі)
    if (!drag.on && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
      drag.on = true; drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      // Захоплюємо лише почавши свайп: щоб він не обривався за колом, а простий тап лишився тапом (із захопленням click не приходить)
      try { svg.setPointerCapture(e.pointerId); } catch { /* указівник уже відпущено */ }
    }
    if (!drag.on) return;
    const inp = $(drag.axis === 'x' ? 's-mag' : 's-dist');
    const v = drag.axis === 'x' ? drag.mg + Math.round(dx / 24) * +inp.step : drag.d - Math.round(dy / 14) * 25;
    const c = Math.max(+inp.min, Math.min(+inp.max, v));
    if (c !== +inp.value) { inp.value = c; inp.dispatchEvent(new Event('input')); }
  });
  // Приціл тягнуть і тримають пальцем — системне меню («Зберегти зображення», виділення) лише заважає
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerup', () => { paintNow(); if (drag?.mark) saveMarks(); swiped = !!drag?.on || !!drag?.mark; drag = null; });
  svg.addEventListener('pointercancel', () => { paintNow(); drag = null; });
  $('sim-fig')?.addEventListener('click', nextFig);
  // Тап — наступна лупа. Довге натискання (≈0,45 с, палець на місці) — лупа на це місце сітки (без лупи — 4×), по центру — як було
  const focusAt = (cx, cy) => {
    const m = svg.getScreenCTM(); if (!m) return;
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const { x, y } = pt.matrixTransform(m.inverse());
    const C = RET[LOADS[$('s-kit').value].ret]; const R = C.ffp ? C.R * C.cal / (quiz ? quiz.cur.mag : +$('s-mag').value) : C.R;
    st.focus = Math.hypot(x, y) < R * 0.06 ? null : [x, y];
    navigator.vibrate?.(15);
    setZoom(st.focus && st.zoom <= 1 ? 4 : st.zoom);
  };
  let press = null;
  svg.addEventListener('pointerdown', (e) => {
    clearTimeout(press?.t); press = null;
    if (st.edit || (quiz && (phase() === 'hold' || quiz.kind === 'wind'))) return;
    const p = { x: e.clientX, y: e.clientY, fired: false };
    p.t = setTimeout(() => { p.fired = true; focusAt(p.x, p.y); }, 450);
    press = p;
  });
  svg.addEventListener('pointermove', (e) => {
    if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.t); press = null; }
  });
  // Після довгого натискання click не має перемкнути лупу
  const pressEnd = () => { if (!press) return; clearTimeout(press.t); if (press.fired) swiped = true; press = null; };
  svg.addEventListener('pointerup', pressEnd);
  svg.addEventListener('pointercancel', pressEnd);
  svg.addEventListener('click', (e) => {
    if (swiped) { swiped = false; return; }
    if (quiz && phase() === 'hold' && !answered(quiz.cur)) { answerHold(e); return; }
    nextZoom();
  });
  // Свайп по кнопці вбік: ціль — сусідня в стрічці (серед сцен чи схем, що вибрано), вітер — сила (крок 1 м/с),
  // рух — швидкість і напрям, без панелі; довге натискання — нуль (у цілі нічого). Після жесту тап не відкриває панель;
  // кнопка лишається під пальцем, хоч зведення над нею й виросло
  const nudge = {
    'pop-tgt': (dir) => {
      if (!dir) return false;
      const list = st.real ? Object.keys(SCENES) : PICK;
      const i = list.indexOf(st.real ?? st.tgt) + dir;
      if (i < 0 || i >= list.length) return false;
      if (st.real) chooseTgt(sceneTgt(list[i]), list[i]); else chooseTgt(list[i]);
      return true;
    },
    'sim-wind': (dir) => {
      const el = $('s-wind');
      const v = Math.min(+el.max, Math.max(0, (dir > 0 ? Math.floor(+el.value) : Math.ceil(+el.value)) + dir));
      if (dir === 0 ? +el.value === 0 : v === +el.value) return false;
      el.value = String(dir === 0 ? 0 : v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    // Рух — шкала зі знаком: свайп у бік руху цілі — швидше, назустріч — повільніше до «стоїть» і далі в інший бік
    'sim-move': (dir) => {
      const el = $('s-mv'); const side = $('s-mvdir');
      const top = el.options.length - 1;
      const now = el.selectedIndex * (side.value === 'L' ? -1 : 1);
      const next = dir === 0 ? 0 : Math.min(top, Math.max(-top, now + dir));
      if (next === now) return false;
      el.selectedIndex = Math.abs(next);
      if (next) side.value = next < 0 ? 'L' : 'R';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
  };
  const STEP_PX = 28;
  for (const [key, step] of Object.entries(nudge)) {
    const btn = root.querySelector(`.sim-tool[data-panel="${key}"], .sim-tool[data-pop="${key}"]`);
    btn.classList.add('swipe');
    let g = null;
    const end = () => { clearTimeout(g?.timer); g = null; };
    btn.addEventListener('pointerdown', (e) => {
      g = { x: e.clientX, y: e.clientY, n: 0, moved: false };
      g.timer = setTimeout(() => {
        if (!g || g.moved) return;
        btn.dataset.gest = '1';
        if (keepPlace(btn, () => step(0))) navigator.vibrate?.(20);
      }, 550);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!g) return;
      const dx = e.clientX - g.x;
      if (!g.moved && Math.abs(e.clientY - g.y) > Math.abs(dx) && Math.abs(e.clientY - g.y) > 8) { end(); return; }
      if (!g.moved && Math.abs(dx) < 10) return;
      if (!g.moved) { g.moved = true; clearTimeout(g.timer); btn.setPointerCapture(e.pointerId); btn.dataset.gest = '1'; }
      const n = Math.trunc(dx / STEP_PX);
      while (g.n !== n) {
        const dir = Math.sign(n - g.n);
        g.n += dir;
        if (keepPlace(btn, () => step(dir))) navigator.vibrate?.(8);
      }
    });
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // Вітер, рух, гвинтівка — іконками в рядок; тап відкриває свою панель під рядком (одна за раз)
  // Куди цілитись — центр мас чи голова: зона ураження, кільце виносу й перевірка влучання — від вибраної точки
  root.querySelectorAll('#pop-aim .aim-opt').forEach((b) => b.addEventListener('click', () => {
    st.head = b.dataset.head === '1';
    $('pop-aim').hidden = true;
    $('m-aim').setAttribute('aria-expanded', 'false');
    draw(); save();
  }));
  root.querySelectorAll('.sim-tool[data-panel]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.gest) { delete btn.dataset.gest; return; }
    const open = btn.getAttribute('aria-expanded') !== 'true';
    root.querySelectorAll('.sim-tool[data-panel]').forEach((b) => {
      const on = b === btn && open;
      b.setAttribute('aria-expanded', String(on));
      $(b.dataset.panel).hidden = !on;
    });
  }));
  // Дистанція й кратність — плашками в нижніх кутах прицілу; тап відкриває повзунок поверх прицілу
  // «Ціль» у ряду інструментів відкриває так само стрічку цілей над низом прицілу
  root.querySelectorAll('[data-pop]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.gest) { delete btn.dataset.gest; return; }
    // «Прицілювання» без вибору точки (гонг, пікап, окоп) лише перемикає режим — стрічку не відкриває
    const open = btn.getAttribute('aria-expanded') !== 'true' && (btn.dataset.pop !== 'pop-aim' || aimChoice());
    root.querySelectorAll('[data-pop]').forEach((b) => {
      const on = b === btn && open;
      b.setAttribute('aria-expanded', String(on));
      $(b.dataset.pop).hidden = !on;
    });
    if (open && btn.dataset.pop === 'pop-tgt') paintTgt();
  }));
  // Тап поза відкритим повзунком закриває його; по прицілу — лише закриває, лупу не перемикає
  const closePops = (e) => {
    if (!root.isConnected) { document.removeEventListener('click', closePops, true); return; }
    const open = root.querySelector('.sim-pop:not([hidden])');
    if (!open || open.contains(e.target) || e.target.closest?.('[data-pop]')) return;
    open.hidden = true;
    root.querySelectorAll('[data-pop]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (svg.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
  };
  document.addEventListener('click', closePops, true);
  const help = $('sim-help'); const info = $('sim-i');
  root.querySelector('.ctl').prepend(markBar);
  const markOn = markBtn(t('Розмітка сцен'), () => {
    st.edit = true; st.mode = 'aim';
    $('m-aim').setAttribute('aria-pressed', 'true'); $('m-range').setAttribute('aria-pressed', 'false');
    help.hidden = true; info.setAttribute('aria-expanded', 'false'); draw();
  }, 'mark-on');
  // «Розмітка сцен» — угорі довідки, щоб не гортати до неї
  help.prepend(Object.assign(document.createElement('p'), { className: 'muted', textContent: t('Якщо зона на фото-сцені лягла повз груди чи голову, поправте її самі:') }), markOn);
  info?.addEventListener('click', () => {
    help.hidden = !help.hidden;
    info.setAttribute('aria-expanded', String(!help.hidden));
  });
  setupKit();
  // Відновити минулі налаштування: спершу набір (він перебудовує стволи й кратність), потім решту
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE));
    // Набір — збережений; якщо його нема (чи таблицю видалили), а свої таблиці є — перша своя
    const kit0 = LOADS[saved?.['s-kit']] ? saved['s-kit'] : mine[0]?.[0];
    if (kit0 && kit0 !== $('s-kit').value) { $('s-kit').value = kit0; setupKit(); paintKit(); }
    if (saved) {
      FIELDS.slice(1).forEach((id) => {
        if (saved[id] == null) return;
        if (id === 's-temp' || id === 's-alt') airOpt(id, saved[id]); else $(id).value = saved[id];
      });
      $('s-wdir').dispatchEvent(new Event('change'));
      if (saved.tgt && TGT[saved.tgt]) { tgtSel.value = saved.tgt; st.tgt = saved.tgt; paintTgt(); }
      st.head = saved.head === true;
      if (saved.mode === 'range' || saved.mode === 'aim') {
        st.mode = saved.mode;
        $('m-aim').setAttribute('aria-pressed', String(st.mode === 'aim'));
        $('m-range').setAttribute('aria-pressed', String(st.mode === 'range'));
      }
      if (ZOOMS.includes(saved.zoom)) {
        st.zoom = saved.zoom;
        if (zoomBtn) { zoomBtn.querySelector('span').textContent = `${st.zoom}×`; zoomBtn.setAttribute('aria-pressed', String(st.zoom > 1)); }
      }
      // Реалізм — сцена, вибрана плиткою; старе «on» (кнопка) — сцена з цією ціллю, якщо є
      const sk = SCENES[saved.real] ? saved.real : saved.real && Object.keys(SCENES).find((k) => SCENES[k].figs.some(([g]) => g === st.tgt));
      if (sk) { st.real = sk; if (!SCENES[sk].figs.some(([g]) => g === st.tgt)) st.tgt = sceneTgt(sk); tgtSel.value = st.tgt; paintTgt(); }
      // Збережена схема «на коліні» (її вже немає у виборі) — людина на повний зріст
      if (!st.real && !PICK.includes(st.tgt)) { st.tgt = 'man'; tgtSel.value = st.tgt; }
      showView(st.real ? 'photo' : 'scheme');
      if (['black', 'white'].includes(saved.ink)) st.ink = saved.ink;
      paintInk();
    } else {
      // Перший вхід — фото-сцена з бійцями, а не схема: тренажер і тур одразу як справжній приціл
      st.real = 'assault'; st.tgt = sceneTgt('assault'); tgtSel.value = st.tgt; paintTgt();
      showView('photo'); paintInk();
    }
  } catch { /* зіпсовані дані — лишаємо типові */ }
  restoring = false;
  draw();
}

/** Оживити розмітку всіх розділів, коли вони вже в документі. */
export function initGuide(root, deps = {}) {
  initCalc(root);
  initReticles(root);
  initSim(root, deps);
}
