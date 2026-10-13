// Довідник стрілка: розділи курсу з guide/marksman.html, калькулятор мил і тренажер сітки.
import { locale } from './i18n.js';

let cached = null;

/** Текст курсу; кешується на сесію (офлайн його віддає service worker). */
export function loadGuide() {
  cached ??= fetch('./guide/marksman.html').then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }).catch((err) => { cached = null; throw err; });
  return cached;
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

const f = (x, d) => x.toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: d });
const fm = (m) => f(m, m % 1 ? 1 : 0);

/** Три калькулятори розділу «Калькулятор мил». */
export function initCalc(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  if (!$('r-out')) return;
  const v = (id) => { const x = parseFloat($(id).value); return Number.isFinite(x) ? x : NaN; };
  const range = () => {
    const s = v('r-size'); const m = v('r-mil'); const o = $('r-out');
    if (!(s > 0 && m > 0)) { o.innerHTML = '<small>Введите размер и мил больше нуля</small>'; return; }
    o.innerHTML = `≈ ${f(s * 1000 / m, 0)} м<small>дальность = размер × 1000 ÷ мил</small>`;
  };
  const clicks = () => {
    const c = v('c-cm'); const d = v('c-d'); const o = $('c-out');
    if (!(c >= 0 && d > 0)) { o.innerHTML = '<small>Введите отклонение и дистанцию</small>'; return; }
    const mil = c * 10 / d; const moa = c / (d / 100) / 2.908;
    o.innerHTML = `${f(mil, 2)} мил → ${Math.round(mil * 10)} щелч. по 0,1`
      + `<small>${f(moa, 2)} MOA → ${Math.round(moa * 4)} щелч. по ¼ MOA</small>`;
  };
  const lead = () => {
    const s = v('l-v'); const tm = v('l-t'); const d = v('l-d'); const o = $('l-out');
    if (!(s >= 0 && tm >= 0 && d > 0)) { o.innerHTML = '<small>Введите скорость, время и дистанцию</small>'; return; }
    o.innerHTML = `${f(s * tm * 1000 / d, 1)} мил вперёд<small>${f(s * tm, 2)} м по ходу движения</small>`;
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
function dsmr(g, R) {
  const t = 0.18;
  mk('line', { x1: -14, y1: 0, x2: 14, y2: 0, class: 'r-l', 'stroke-width': t }, g);
  mk('line', { x1: 0, y1: -R, x2: 0, y2: 14, class: 'r-l', 'stroke-width': t }, g);
  mk('line', { x1: -R, y1: 0, x2: -14, y2: 0, class: 'r-l', 'stroke-width': 0.5 }, g);
  mk('line', { x1: 14, y1: 0, x2: R, y2: 0, class: 'r-l', 'stroke-width': 0.5 }, g);
  mk('line', { x1: 0, y1: 14, x2: 0, y2: R, class: 'r-l', 'stroke-width': 0.5 }, g);
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

// Ballistic Plex у MOA (на 7×): нитка 0,26, стовпи 0,69 MOA, бічні та верхній від 2,9, нижній від 14,8.
function bplex(g, R) {
  const t = 0.26; const p = 0.69; const s = 2.9;
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
  post(s, 0, R, 0); post(-s, 0, -R, 0); post(0, -s, 0, -R); post(0, 14.8, 0, R);
  [2.0, 5.9, 9.9].forEach((y) => mk('rect', { x: -0.55, y: y - 0.2, width: 1.1, height: 0.4, rx: 0.2, class: 'r-d' }, g));
}

const RET = {
  dsmr: { u: 'мил', cal: 6, R: 29.5, draw: dsmr, size: (m, d) => m * 1000 / d },
  bplex: { u: 'MOA', cal: 7, R: 46, draw: bplex, size: (m, d) => m * 100 * 34.377 / d },
};

const MAN = 'M-.055 .135L.055 .135L.14 .165Q.155 .17 .155 .19L.15 .47L.115 .47L.11 .25L.1 .52L.075 1L.02 1L0 .6L-.02 1L-.075 1L-.1 .52L-.11 .25L-.115 .47L-.15 .47L-.155 .19Q-.155 .17 -.14 .165Z';
const CHEST = 'M-.5 1L-.5 .62Q-.5 .42 -.28 .42L.28 .42Q.5 .42 .5 .62L.5 1Z';
const TGT = {
  man: { h: 1.7, w: 0.31, ap: 0.3, path: MAN, head: [0, 0.065, 0.062] },
  chest: { h: 0.5, w: 1, ap: 0.65, path: CHEST, head: [0, 0.22, 0.18] },
};

/** Вид у приціл: o.ret, o.mag, o.dist, o.tgt, o.mode ('range'|'aim'), o.hx, o.hy — винос в одиницях сітки на калібрувальній кратності. */
function scope(svg, o) {
  const C = RET[o.ret]; const R = C.R; const k = o.mag / C.cal; const T = TGT[o.tgt];
  svg.replaceChildren();
  svg.setAttribute('viewBox', [-R - 1, -R - 1, 2 * R + 2, 2 * R + 2].join(' '));
  const id = `guide-clip${uid++}`;
  const cp = mk('clipPath', { id }, mk('defs', {}, svg));
  mk('circle', { cx: 0, cy: 0, r: R }, cp);
  const g = mk('g', { 'clip-path': `url(#${id})` }, svg);
  mk('rect', { x: -R, y: -R, width: 2 * R, height: 2 * R, class: 'r-sky' }, g);
  const H = C.size(T.h, o.dist) * k;
  let cx; let top;
  if (o.mode === 'range') { cx = T.w * H / 2 + R * 0.03; top = 0; } else { cx = o.hx * k; top = o.hy * k - T.ap * H; }
  mk('rect', { x: -R, y: top + H, width: 2 * R, height: 2 * R, class: 'r-gr' }, g);
  const tg = mk('g', { transform: `translate(${cx} ${top}) scale(${H})` }, g);
  mk('path', { d: T.path, class: 'r-tgt' }, tg);
  mk('circle', { cx: T.head[0], cy: T.head[1], r: T.head[2], class: 'r-tgt' }, tg);
  C.draw(g, R);
  if (o.mode === 'aim' && (Math.abs(o.hx) > 0.05 || Math.abs(o.hy) > 0.05)) {
    mk('circle', { cx: o.hx * k, cy: o.hy * k, r: R * 0.026, class: 'r-hold', 'stroke-width': R * 0.0075 }, g);
  }
  mk('circle', { cx: 0, cy: 0, r: R, class: 'r-l', 'stroke-width': R * 0.02 }, svg);
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
      `<b>${d} м</b>рост ${f(1700 / d, 1)} мил`));
  }
  const pair = $('sfp-pair');
  if (pair) {
    mini(pair, { ret: 'dsmr', mag: 6, dist: 300, tgt: 'man', mode: 'range' }, '<b>300 м на 6×</b>5,7 деления = 5,7 мил');
    mini(pair, { ret: 'dsmr', mag: 3, dist: 300, tgt: 'man', mode: 'range' }, '<b>300 м на 3×</b>2,8 деления, но это те же 5,7 мил');
  }
  const bgal = $('bplex-gallery');
  if (bgal) {
    [200, 300, 400, 500, 600, 700].forEach((d) => mini(bgal, { ret: 'bplex', mag: 7, dist: d, tgt: 'man', mode: 'range' },
      `<b>${d} м</b>рост ${f(170 * 34.377 / d, 1)} MOA`));
  }
}

// ---------- тренажер ----------

// Балістика, пристрілка 100 м, через 50 м від 50 до 700 м. Додатне — винос угору.
const LOADS = {
  m855: {
    ret: 'dsmr', mvs: [['905', '14,5″ · 905 м/с'], ['915', '16″ · 915 м/с'], ['948', '20″ · 948 м/с']], def: '915', zeroLbl: '50/200 м',
    H: {
      905: [0.37, 0, 0.14, 0.43, 0.80, 1.24, 1.75, 2.32, 2.96, 3.68, 4.49, 5.41, 6.45, 7.64],
      915: [0.38, 0, 0.13, 0.41, 0.77, 1.20, 1.70, 2.25, 2.87, 3.57, 4.36, 5.25, 6.26, 7.42],
      948: [0.40, 0, 0.10, 0.35, 0.68, 1.08, 1.53, 2.04, 2.61, 3.25, 3.97, 4.78, 5.69, 6.73],
    },
    W: {
      905: [0.047, 0.094, 0.144, 0.198, 0.255, 0.316, 0.382, 0.454, 0.532, 0.617, 0.711, 0.816, 0.931, 1.057],
      915: [0.046, 0.092, 0.142, 0.194, 0.250, 0.310, 0.375, 0.446, 0.522, 0.606, 0.698, 0.799, 0.912, 1.036],
      948: [0.043, 0.087, 0.134, 0.183, 0.236, 0.293, 0.354, 0.420, 0.491, 0.569, 0.655, 0.749, 0.853, 0.969],
    },
    T: {
      905: [0.057, 0.117, 0.182, 0.251, 0.324, 0.403, 0.487, 0.578, 0.676, 0.782, 0.897, 1.022, 1.160, 1.310],
      915: [0.056, 0.116, 0.180, 0.248, 0.320, 0.398, 0.481, 0.570, 0.667, 0.771, 0.885, 1.008, 1.143, 1.291],
      948: [0.054, 0.112, 0.173, 0.238, 0.308, 0.382, 0.462, 0.548, 0.640, 0.739, 0.847, 0.964, 1.092, 1.232],
    },
    lim: 600, limTxt: 'Дальше 600 м M855 близок к дозвуку: кучность резко падает',
  },
  b308: {
    ret: 'bplex', mvs: [['720', '16,5″ · 720 м/с'], ['740', '16,5″ · 740 м/с'], ['760', '16,5″ · 760 м/с']], def: '740', zeroLbl: '200 м',
    H: {
      720: [-0.39, 0, 1.41, 3.16, 5.13, 7.27, 9.58, 12.06, 14.73, 17.59, 20.66, 23.97, 27.53, 31.38],
      740: [-0.30, 0, 1.31, 2.95, 4.80, 6.81, 8.98, 11.32, 13.82, 16.50, 19.38, 22.48, 25.81, 29.40],
      760: [-0.21, 0, 1.21, 2.76, 4.49, 6.39, 8.44, 10.63, 12.99, 15.51, 18.22, 21.12, 24.24, 27.60],
    },
    W: {
      720: [0.16, 0.32, 0.47, 0.64, 0.81, 0.99, 1.18, 1.38, 1.59, 1.81, 2.05, 2.30, 2.57, 2.86],
      740: [0.15, 0.30, 0.45, 0.61, 0.78, 0.95, 1.13, 1.32, 1.52, 1.73, 1.96, 2.20, 2.45, 2.72],
      760: [0.15, 0.29, 0.44, 0.59, 0.75, 0.91, 1.08, 1.26, 1.45, 1.66, 1.87, 2.10, 2.34, 2.60],
    },
    T: {
      720: [0.071, 0.145, 0.222, 0.302, 0.386, 0.474, 0.567, 0.663, 0.764, 0.871, 0.983, 1.102, 1.226, 1.358],
      740: [0.069, 0.141, 0.216, 0.294, 0.376, 0.461, 0.550, 0.644, 0.742, 0.845, 0.953, 1.067, 1.188, 1.315],
      760: [0.067, 0.137, 0.210, 0.286, 0.365, 0.448, 0.535, 0.625, 0.720, 0.820, 0.925, 1.035, 1.151, 1.274],
    },
    lim: 600, limTxt: 'Дальше 600 м с короткого ствола пуля подходит к трансзвуку: разброс растёт, а ошибка дальности стоит дорого',
  },
};

const BMARKS = [[0, 'центр'], [2.0, 'точка 1 (2,0)'], [5.9, 'точка 2 (5,9)'], [9.9, 'точка 3 (9,9)'], [14.8, 'кончик столба (14,8)']];

function at(arr, d) {
  const x = d / 50 - 1;
  const i = Math.max(0, Math.min(arr.length - 2, Math.floor(x)));
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
}

function bplexWhere(v) {
  if (v <= 0) return `центр${v < -0.2 ? ' (держать чуть ниже)' : ''}`;
  for (let i = 1; i < BMARKS.length; i++) {
    if (v <= BMARKS[i][0]) {
      const a = BMARKS[i - 1]; const b = BMARKS[i]; const t = (v - a[0]) / (b[0] - a[0]);
      if (t < 0.15) return a[1];
      if (t > 0.85) return b[1];
      return `между «${a[1]}» и «${b[1]}», ${t < 0.5 ? 'ближе к первой' : 'ближе ко второй'}`;
    }
  }
  return 'ниже кончика столба — крути барабан';
}

/** Тренажер: вид у приціл з ціллю, виносом і вітром. */
export function initSim(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const svg = $('sim-svg');
  if (!svg) return;
  const st = { mode: 'aim', tgt: 'man' };

  const setupKit = () => {
    const L = LOADS[$('s-kit').value]; const C = RET[L.ret]; const sel = $('s-barrel'); const mag = $('s-mag');
    sel.replaceChildren(...L.mvs.map(([value, label]) => {
      const op = document.createElement('option');
      op.value = value; op.textContent = label; op.selected = value === L.def;
      return op;
    }));
    $('s-zero').options[1].textContent = L.zeroLbl;
    mag.min = L.ret === 'bplex' ? 2 : 1; mag.max = C.cal; mag.value = C.cal;
  };

  const draw = () => {
    const L = LOADS[$('s-kit').value]; const C = RET[L.ret]; const u = C.u; const moa = L.ret === 'bplex';
    const d = +$('s-dist').value; const m = +$('s-mag').value; const mv = $('s-barrel').value; const z = +$('s-zero').value;
    const w = +$('s-wind').value; const left = $('s-wdir').value === 'L';
    $('s-dist-v').textContent = `${d} м`; $('s-mag-v').textContent = `${fm(m)}×`; $('s-wind-v').textContent = `${fm(w)} м/с`;
    const hold = at(L.H[mv], d) - (z === 200 ? at(L.H[mv], 200) : 0);
    const wm = at(L.W[mv], d) * w; const hx = left ? wm : -wm; const k = m / C.cal; const T = TGT[st.tgt];
    scope(svg, { ret: L.ret, mag: m, dist: d, tgt: st.tgt, mode: st.mode, hx, hy: hold });
    const sz = C.size(T.h, d); const rows = [];
    const formula = moa ? `${f(T.h * 100, 0)} см × 34,4 ÷ ${f(sz, 1)}` : `${f(T.h, 1)} × 1000 ÷ ${f(sz, 1)}`;
    rows.push(`<div><span class="k">Цель занимает (на ${C.cal}×)</span><span class="v">${f(sz, 1)} ${u}</span> → ${formula} = ${d} м</div>`);
    if (m < C.cal) rows.push(`<div class="w"><span class="k">Кратность ${fm(m)}×</span>все значения сетки × ${f(C.cal / m, 2)}. Цель видна как ${f(sz * k, 1)} ${u} «по сетке» — для дальномера ставь ${C.cal}×</div>`);
    const ah = Math.abs(hold); const up = hold >= 0 ? 'вверх' : 'вниз';
    const clicks = moa ? `${Math.round(ah * 4.19)} щелч. по ¼″` : `${Math.round(ah * 10)} щелч. 0,1 мрад · ${Math.round(ah * 13.75)} щелч. ¼ MOA`;
    rows.push(`<div><span class="k">Поправка по вертикали</span><span class="v">${f(ah, moa ? 1 : 2)} ${u} ${up}</span> · ${clicks}${moa ? ` · ${f(ah / 3.4377, 2)} мил` : ''}</div>`);
    if (moa) rows.push(`<div><span class="k">Где держать на 7×</span>${bplexWhere(hold)}${m < C.cal ? ` — на ${fm(m)}× точки не совпадают` : ''}</div>`);
    else rows.push(`<div><span class="k">Вынос по сетке на ${fm(m)}×</span>метка на ${f(ah * k, 2)} деления ${hold >= 0 ? 'ниже' : 'выше'} центра ставится на цель</div>`);
    if (w > 0) rows.push(`<div><span class="k">Ветер ${fm(w)} м/с ${left ? 'слева' : 'справа'}</span><span class="v">${f(wm, moa ? 1 : 2)} ${u}</span>: центр ${left ? 'левее' : 'правее'} цели, цель на ${f(wm * k, moa ? 1 : 2)} ${u} ${left ? 'справа' : 'слева'} от центра</div>`);
    rows.push(`<div><span class="k">Время полёта</span>${f(at(L.T[mv], d), 2)} с</div>`);
    if (d > L.lim) rows.push(`<div class="w">${L.limTxt}</div>`);
    $('sim-out').innerHTML = rows.join('');
  };

  const seg = (a, b, key, val) => [a, b].forEach((id) => $(id).addEventListener('click', () => {
    st[key] = val[id];
    $(a).setAttribute('aria-pressed', st[key] === val[a]);
    $(b).setAttribute('aria-pressed', st[key] === val[b]);
    draw();
  }));
  seg('m-aim', 'm-range', 'mode', { 'm-aim': 'aim', 'm-range': 'range' });
  seg('t-man', 't-chest', 'tgt', { 't-man': 'man', 't-chest': 'chest' });
  ['s-dist', 's-mag', 's-wind'].forEach((i) => $(i).addEventListener('input', draw));
  ['s-barrel', 's-zero', 's-wdir'].forEach((i) => $(i).addEventListener('change', draw));
  $('s-kit').addEventListener('change', () => { setupKit(); draw(); });
  setupKit();
  draw();
}

/** Оживити розмітку всіх розділів, коли вони вже в документі. */
export function initGuide(root) {
  initCalc(root);
  initReticles(root);
  initSim(root);
}
