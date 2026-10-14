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
    if (!(s > 0 && m > 0)) { o.innerHTML = '<small>Введите размер и угол в MRAD больше нуля</small>'; return; }
    o.innerHTML = `≈ ${f(s * 1000 / m, 0)} м<small>дальность = размер × 1000 ÷ MRAD</small>`;
  };
  const clicks = () => {
    const c = v('c-cm'); const d = v('c-d'); const o = $('c-out');
    if (!(c >= 0 && d > 0)) { o.innerHTML = '<small>Введите отклонение и дистанцию</small>'; return; }
    const mil = c * 10 / d; const moa = c / (d / 100) / 2.908;
    o.innerHTML = `${f(mil, 2)} MRAD → ${Math.round(mil * 10)} щелч. по 0,1`
      + `<small>${f(moa, 2)} MOA → ${Math.round(moa * 4)} щелч. по ¼ MOA</small>`;
  };
  const lead = () => {
    const s = v('l-v'); const tm = v('l-t'); const d = v('l-d'); const o = $('l-out');
    if (!(s >= 0 && tm >= 0 && d > 0)) { o.innerHTML = '<small>Введите скорость, время и дистанцию</small>'; return; }
    o.innerHTML = `${f(s * tm * 1000 / d, 1)} MRAD вперёд<small>${f(s * tm, 2)} м по ходу движения</small>`;
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
  dsmr: { u: 'MRAD', cal: 6, R: 29.5, draw: dsmr, size: (m, d) => m * 1000 / d },
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
      `<b>${d} м</b>рост ${f(1700 / d, 1)} MRAD`));
  }
  const pair = $('sfp-pair');
  if (pair) {
    mini(pair, { ret: 'dsmr', mag: 6, dist: 300, tgt: 'man', mode: 'range' }, '<b>300 м на 6×</b>5,7 деления = 5,7 MRAD');
    mini(pair, { ret: 'dsmr', mag: 3, dist: 300, tgt: 'man', mode: 'range' }, '<b>300 м на 3×</b>2,8 деления, но это те же 5,7 MRAD');
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
    lim: 600, limTxt: 'Дальше 600 м M855 близок к дозвуку: кучность резко падает',
  },
  b308: {
    ret: 'bplex', mvs: [['720', '16,5″ · 720 м/с'], ['740', '16,5″ · 740 м/с'], ['760', '16,5″ · 760 м/с']], def: '740', zeroLbl: '200 м',
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
    const clicks = moa ? `${Math.round(ah * 4.19)} щелч. по ¼″` : `${Math.round(ah * 10)} щелч. 0,1 MRAD · ${Math.round(ah * 13.75)} щелч. ¼ MOA`;
    rows.push(`<div><span class="k">Поправка по вертикали</span><span class="v">${f(ah, moa ? 1 : 2)} ${u} ${up}</span> · ${clicks}${moa ? ` · ${f(ah / 3.4377, 2)} MRAD` : ''}</div>`);
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
