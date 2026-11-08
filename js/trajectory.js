// Траєкторія відносно лінії прицілу й прямий постріл: де куля тримається в межах ±R см від точки прицілювання.
// Малюнок — свій inline-SVG: вісь дистанції числова, а lineChart з chart.js розставляє точки рівномірно.
import { h, fmt } from './ui.js';
import { t } from './i18n.js';

/** Висоти над лінією прицілу, см: [{ d, cm }] від дула (−висота прицілу) з кроком step; H — поправки solve() у мрад. */
export function trajectoryPoints(H, step, sh) {
  return [{ d: 0, cm: -sh }, ...H.map((mrad, i) => ({ d: (i + 1) * step, cm: (-mrad * (i + 1) * step) / 10 }))];
}

/** Висота на дистанції d між точками, см; null — далі за таблицю. */
export function heightAt(pts, d) {
  const i = pts.findIndex((p) => p.d >= d);
  if (i < 0) return null;
  if (i === 0) return pts[0].cm;
  const a = pts[i - 1]; const b = pts[i];
  return a.cm + ((b.cm - a.cm) * (d - a.d)) / (b.d - a.d);
}

/**
 * Прямий постріл: відрізки [від, до] м, де |висота| ≤ r см (перевірка через 1 м між точками таблиці),
 * і найвища точка траєкторії { d, cm }.
 */
export function pointBlank(pts, r) {
  const spans = [];
  let from = null;
  const end = pts[pts.length - 1].d;
  for (let d = 0; d <= end; d++) {
    const inside = Math.abs(heightAt(pts, d)) <= r;
    if (inside && from === null) from = d;
    if (!inside && from !== null) { spans.push([from, d - 1]); from = null; }
  }
  if (from !== null) spans.push([from, end]);
  const apex = pts.reduce((best, p) => (p.cm > best.cm ? p : best), pts[0]);
  return { spans, apex };
}

/** Та сама траєкторія при пристрілці на z м: лінія прицілу повернута навколо прицілу, y_Z(d) = y(d) − y(z)·d/z. */
export function rezero(pts, z) {
  const yz = heightAt(pts, z);
  return pts.map((p) => ({ d: p.d, cm: p.d === 0 ? p.cm : p.cm - (yz * p.d) / z }));
}

/** Другий перетин лінії прицілу після пристрілки z (куля йде вгору й опускається), м; null — не перетинає в таблиці. */
export function farCross(pts, z) {
  const end = pts[pts.length - 1].d;
  for (let d = z + 5; d <= end; d++) {
    const a = heightAt(pts, d - 1); const b = heightAt(pts, d);
    if (a > 0 && b <= 0) return d;
  }
  return null;
}

/** Обидва нулі траєкторії: де куля перетинає лінію прицілу знизу вгору (ближній) і згори вниз (дальній), м; null — немає. */
export function zeros(pts) {
  const end = pts[pts.length - 1].d;
  let up = null; let down = null;
  for (let d = 1; d <= end; d++) {
    const a = heightAt(pts, d - 1); const b = heightAt(pts, d);
    if (up === null && a < 0 && b >= 0) up = d;
    else if (up !== null && a > 0 && b <= 0) { down = d; break; }
  }
  return { up, down };
}

/** Підпис пристрілки двома нулями: «30/195»; один перетин (нуль на вершині траєкторії) — одним числом. */
export function zerosLabel(pts, z) {
  const { up, down } = zeros(rezero(pts, z));
  const r5 = (d) => Math.round(d / 5) * 5;
  return up !== null && down !== null && r5(down) - r5(up) >= 10 ? `${r5(up)}/${r5(down)}` : `${z}`;
}

/** Схема пристрілки для порівняння на графіку: { pts, zero, span, far } у смузі ±r. */
export function schemeAt(pts, z, r) {
  const moved = rezero(pts, z);
  const { spans } = pointBlank(moved, r);
  return { pts: moved, zero: z, span: spans[0] ?? [0, 0], far: farCross(moved, z) };
}

/**
 * Найкраща пристрілка для смуги ±r: та, за якої прямий постріл (одним шматком від дула) сягає найдалі.
 * Інша пристрілка — та сама траєкторія відносно лінії прицілу, повернутої навколо прицілу: y_Z(d) = y(d) − y(Z)·d/Z.
 * Повертає { zero, span, pts } або null, якщо таблиця закоротка.
 */
export function bestZero(pts, r) {
  let best = null;
  const end = pts[pts.length - 1].d;
  for (let z = 25; z <= Math.min(400, end); z += 5) {
    const moved = rezero(pts, z);
    const { spans } = pointBlank(moved, r);
    // Прямий постріл — суцільно від дула: перший відрізок, і пристрілка в ньому (інакше посередині куля вилітає за смугу)
    const span = spans[0] && z >= spans[0][0] && z <= spans[0][1] ? spans[0] : null;
    if (span && (!best || span[1] > best.span[1])) best = { zero: z, span, pts: moved };
  }
  return best;
}

const round5 = (d) => Math.round(d / 5) * 5;
const cmText = (cm) => `${cm > 0 ? '+' : cm < 0 ? '−' : ''}${fmt.num(Math.abs(cm) >= 20 ? Math.round(Math.abs(cm)) : Math.round(Math.abs(cm) * 10) / 10)}`;

/** Лише про вершину траєкторії — для екрана, де «від–до» вже крупно в плитці. */
export function apexText({ spans, apex }, r) {
  if (!spans.length) return t('Ні на якій дистанції куля не тримається в межах ±{r} см', { r });
  const span = ([a, b]) => (a === 0 ? t('від дула до {b} м', { b: round5(b) }) : t('від {a} до {b} м', { a: round5(a), b: round5(b) }));
  if (apex.cm < 0.5) return t('Вище лінії прицілу куля не піднімається.');
  if (spans.length === 1 || apex.cm <= r) return t('Найвище куля йде на {d} м, {cm} см.', { d: apex.d, cm: cmText(apex.cm) });
  return t('Посередині куля йде вище ніж на {r} см, до {cm} см на {d} м. У межах ±{r} см — {spans}.',
    { r, cm: cmText(apex.cm), d: apex.d, spans: spans.map(span).join(t(' і ')) });
}

/** Висновок одним-двома реченнями: від скількох до скількох метрів крутити не треба. */
export function pointBlankText({ spans, apex }, r, zero) {
  if (!spans.length) return t('Ні на якій дистанції куля не тримається в межах ±{r} см', { r });
  const span = ([a, b]) => (a === 0 ? t('від дула до {b} м', { b: round5(b) }) : t('від {a} до {b} м', { a: round5(a), b: round5(b) }));
  const main = spans.find(([a, b]) => zero >= a && zero <= b) ?? spans[0];
  if (spans.length === 1 || apex.cm <= r) {
    const head = t('Пристрілка {z} м: {span} куля відхиляється не більше ніж на {r} см: цільтеся в центр, барабан не крутіть.', { z: zero, span: span(main), r });
    return apex.cm < 0.5 ? `${head} ${t('Вище лінії прицілу куля не піднімається.')}`
      : `${head} ${t('Найвище куля йде на {d} м, {cm} см.', { d: apex.d, cm: cmText(apex.cm) })}`;
  }
  return t('Пристрілка {z} м: посередині куля йде вище ніж на {r} см, до {cm} см на {d} м. У межах ±{r} см — {spans}.',
    { z: zero, r, cm: cmText(apex.cm), d: apex.d, spans: spans.map(span).join(t(' і ')) });
}

const W = 340; const H = 176;
const L = 34; const R = 8; const T = 8; const B = 22;
const W_ = W; const H_ = H; const T_ = T;

/**
 * Графік: висота кулі над лінією прицілу, смуга ±r, пристрілка, відрізки прямого пострілу.
 * Тап чи рух мишею — висота на тій дистанції рядком під графіком.
 */
export function trajectoryChart(pts, { r, zero, spans, apex, alt = null, full = false, zeroNote = null, flight = null }) {
  // alt — для порівняння інша пристрілка { pts, zero, span }: пунктиром іншим кольором
  // full — уся траєкторія до кінця таблиці: униз до найнижчої точки (на 800 м куля на метри нижче лінії прицілу)
  const far = Math.max(spans.length ? spans[spans.length - 1][1] : zero, alt?.span[1] ?? 0);
  const xMax = full ? pts[pts.length - 1].d : Math.min(pts[pts.length - 1].d, Math.max(300, Math.ceil((Math.max(far, zero) * 1.35 + 30) / 100) * 100));
  const curves = alt ? [pts, alt.pts] : [pts];
  // flight — { V, T, step, tC } з solve(): швидкість і час польоту під пальцем і межа дозвуку, як у «Поправках»
  const sound = flight ? 331.3 * Math.sqrt(1 + (flight.tC ?? 15) / 273.15) : null;
  const subI = flight ? flight.V.findIndex((v) => v < sound) : -1;
  const subD = subI >= 0 ? (subI + 1) * flight.step : null;
  const fAt = (arr, d) => {
    const x = d / flight.step - 1; if (x < 0) return null;
    const i = Math.min(arr.length - 2, Math.floor(x));
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  };
  // Видиме вікно дистанцій [x0, x1]: щипок, Ctrl+коліщатко чи кнопки «+»/«−» — ближче; висота підлаштовується під видиме
  let x0 = 0; let x1 = xMax;
  const MIN_W = 30;
  const zoomed = () => x0 > 0.5 || x1 < xMax - 0.5;
  // Масштаб осей для поточного вікна: без наближення — як було (смуга, лінія прицілу); з наближенням — під видимі криві
  const scale = () => {
    const vis = curves.flatMap((list) => [x0, x1, ...list.filter((p) => p.d > x0 && p.d < x1).map((p) => p.d)].map((d) => heightAt(list, d)))
      .filter((v) => v !== null);
    let yHi; let yLo;
    if (!zoomed()) {
      const lowest = Math.min(...vis);
      yHi = Math.max(r, apex.cm, ...vis) + 3;
      yLo = full ? Math.min(-3 * r, lowest * 1.05) : -Math.max(3 * r, pts[0].cm * -1 + 2);
    } else {
      const lo = Math.min(...vis); const hi = Math.max(...vis); const pad = Math.max(1, (hi - lo) * 0.12);
      yHi = hi + pad; yLo = lo - pad;
    }
    const span = yHi - yLo;
    const tick = !zoomed() && !full ? r * Math.max(1, Math.ceil(span / r / 7)) : [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((v) => span / v <= 7) ?? 2000;
    const xStep = [5, 10, 25, 50, 100, 200, 500].find((v) => (x1 - x0) / v <= 5);
    return { yHi, yLo, tick, xStep };
  };
  let xs; let ys;
  const plot = h('div', { class: 'tr-plot' });
  // Усі нулі кривої — крапки на лінії прицілу з підписом метрів: помаранчевої під лінією, пунктиру над нею
  // (на всій траєкторії над лінією місця немає — другим рядком під). Нулі ближче 10 м — це один, як у кнопках схем
  const zeroMarks = (list, z, cls, ly) => {
    const { up, down } = zeros(list);
    const ds = (up !== null && down !== null && round5(down) - round5(up) >= 10 ? [up, down] : [z]).filter((d) => d >= x0 && d <= x1);
    const dots = ds.map((d) => `<circle class="tr-zero ${cls}" cx="${xs(d).toFixed(1)}" cy="${ys(0).toFixed(1)}" r="3.5"/>`).join('');
    // Близькі нулі — одним підписом посередині, щоб числа не налазили одне на одне
    const labels = ds.length === 2 && xs(ds[1]) - xs(ds[0]) < 26 ? [[(ds[0] + ds[1]) / 2, `${round5(ds[0])}/${round5(ds[1])}`]]
      : ds.map((d) => [d, String(round5(d))]);
    return dots + labels.map(([d, txt]) => `<text class="tr-txt tr-zero-txt ${cls}" x="${xs(d).toFixed(1)}" y="${(ys(0) + ly).toFixed(1)}" text-anchor="middle">${txt}</text>`).join('');
  };
  const draw = () => {
    const { yHi, yLo, tick, xStep } = scale();
    xs = (d) => L + ((W - L - R) * (d - x0)) / (x1 - x0);
    ys = (cm) => T + ((H - T - B) * (yHi - cm)) / (yHi - yLo);
    // Точки кривої у вікні й по одній за його краями — щоб лінія доходила до рамки
    const poly = (list) => list.filter((p, i) => (p.d >= x0 && p.d <= x1) || list[i + 1]?.d > x0 && p.d < x0 || list[i - 1]?.d < x1 && p.d > x1)
      .map((p) => `${xs(p.d).toFixed(1)},${ys(p.cm).toFixed(1)}`).join(' ');
    const xTicks = Array.from({ length: Math.floor(x1 / xStep) - Math.ceil(x0 / xStep) + 1 }, (_, i) => (Math.ceil(x0 / xStep) + i) * xStep);
    const yTicks = Array.from({ length: Math.floor((yHi - yLo) / tick) + 2 }, (_, i) => Math.floor(yLo / tick) * tick + i * tick).filter((v) => v <= yHi && v >= yLo);
    const seg = ([a, b], y, cls) => (b < x0 || a > x1 ? '' : `<line class="tr-span ${cls}" x1="${xs(Math.max(a, x0))}" x2="${xs(Math.min(b, x1))}" y1="${y}" y2="${y}"/>`);
    // Лінія прицілу за межами видимої висоти (наблизили далеку ділянку) — ні її, ні нулів не малюємо
    const los = yLo <= 0 && yHi >= 0;
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Траєкторія відносно лінії прицілу')}">
    <defs><clipPath id="tr-clip"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/></clipPath></defs>
    ${xTicks.map((d) => `<line class="tr-grid" x1="${xs(d)}" x2="${xs(d)}" y1="${T}" y2="${H - B}"/><text class="tr-txt" x="${xs(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('')}
    ${yTicks.map((v) => `<text class="tr-txt" x="${L - 4}" y="${ys(v) + 3}" text-anchor="end">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</text>`).join('')}
    <g clip-path="url(#tr-clip)"><rect class="tr-band" x="${L}" y="${ys(r)}" width="${W - L - R}" height="${ys(-r) - ys(r)}"/>
    ${los ? `<line class="tr-los" x1="${L}" x2="${W - R}" y1="${ys(0)}" y2="${ys(0)}"/>` : ''}
    <polyline class="tr-curve" points="${poly(pts)}"/>${alt ? `<polyline class="tr-curve alt" points="${poly(alt.pts)}"/>` : ''}</g>
    ${spans.map((s) => seg(s, H - B, '')).join('')}
    ${alt ? seg(alt.span, H - B - 6, 'alt') : ''}
    ${los ? zeroMarks(pts, zero, '', 12) : ''}
    ${alt && los ? zeroMarks(alt.pts, alt.zero, 'alt', full ? 23 : -6) : ''}
    ${subD !== null && subD >= x0 && subD <= x1 ? `<line class="tr-sub" x1="${xs(subD)}" x2="${xs(subD)}" y1="${T}" y2="${H - B}"/><text class="tr-txt tr-sub-txt" x="${xs(subD) - 3}" y="${T + 9}" text-anchor="end">${t('дозвук')}</text>` : ''}
    <line class="tr-cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="tr-dot" r="5" visibility="hidden"/>${alt ? '<circle class="tr-dot alt" r="5" visibility="hidden"/>' : ''}
  </svg>`;
    zoomBar.hidden = false;
    for (const b of [resetBtn, leftBtn, rightBtn]) b.hidden = !zoomed();
    outBtn.disabled = !zoomed();
    inBtn.disabled = x1 - x0 <= MIN_W + 0.5;
    if (lastD !== null && lastD >= x0 && lastD <= x1) show(lastD);
  };
  // Над графіком, а не під ним: рука, що веде пальцем, закриває те, що нижче
  const read = h('div', { class: 'tr-read' }, h('span', { class: 'muted small' }, t('Ведіть пальцем по графіку — покаже, де куля на кожній дистанції. Двома пальцями — ближче чи далі')));
  const cmShort = (v) => fmt.num(Math.abs(v) >= 20 ? Math.round(Math.abs(v)) : Math.round(Math.abs(v) * 10) / 10);
  // Біля дула куля нижче лінії прицілу на висоту прицілу — це не промах, кажемо прямо
  const chip = (cls, label, v, d, vs = null) => h('span', { class: `tr-chip ${cls}` }, h('span', { class: 'tr-chip-label' }, label),
    h('b', {}, Math.abs(v) < 0.5 ? t('у точку') : `${v > 0 ? '↑' : '↓'} ${cmShort(v)} ${t('см')}`),
    d === 0 ? h('span', { class: 'tr-chip-sub' }, t('дуло: приціл на {n} см вище ствола', { n: cmShort(v) }))
      // Уся траєкторія: криві на шкалі в метри майже зливаються — різницю з помаранчевою кажемо числом
      : full ? (vs === null || Math.abs(v - vs) < 0.5 ? null : h('span', { class: 'tr-chip-sub' },
        t(v > vs ? 'на {n} см вище за помаранчеву' : 'на {n} см нижче за помаранчеву', { n: cmShort(v - vs) }))) : h('span', { class: `tr-chip-sub ${Math.abs(v) <= r ? 'in' : 'out'}` }, Math.abs(v) <= r ? t('✓ у смузі ±{r}', { r }) : t('поза ±{r} см', { r })));
  let lastD = null;
  // Дистанція під пальцем: крок 5 м, на близькому плані (вікно до 100 м) — 1 м
  const distAt = (clientX) => {
    const box = plot.firstElementChild.getBoundingClientRect();
    const f = (((clientX - box.left) / box.width) * W - L) / (W - L - R);
    const k = x1 - x0 <= 100 ? 1 : 5;
    return Math.max(x0, Math.min(x1, Math.round((x0 + f * (x1 - x0)) / k) * k));
  };
  const show = (d) => {
    const cm = heightAt(pts, d);
    if (cm === null) return;
    lastD = d;
    const cursor = plot.querySelector('.tr-cursor');
    const dot = plot.querySelector('.tr-dot:not(.alt)'); const altDot = plot.querySelector('.tr-dot.alt');
    cursor.setAttribute('x1', xs(d)); cursor.setAttribute('x2', xs(d)); cursor.setAttribute('visibility', 'visible');
    const place = (el, v) => { el.setAttribute('cx', xs(d)); el.setAttribute('cy', Math.min(H - B, Math.max(T, ys(v)))); el.setAttribute('visibility', 'visible'); };
    place(dot, cm);
    const ac = alt ? heightAt(alt.pts, d) : null;
    if (ac !== null) place(altDot, ac);
    read.replaceChildren(...[h('span', { class: 'tr-read-d' }, `${d} ${t('м')}`),
      chip('main', t('пристрілка {z} м', { z: zero }), cm, d),
      ac !== null ? chip('alt', t('пристрілка {z} м', { z: alt.zero }), ac, d, full ? cm : null) : null,
      // Швидкість і час — дрібним рядком, як у «Поправках»
      flight && fAt(flight.V, d) !== null ? h('span', { class: 'tr-read-info muted small' }, [t('куля {v} м/с', { v: Math.round(fAt(flight.V, d)) }),
        t('летить {s} с', { s: fmt.num(Math.round(fAt(flight.T, d) * 100) / 100) }), fAt(flight.V, d) < sound ? t('дозвукова') : null].filter(Boolean).join(' · ')) : null].filter(Boolean));
  };
  /** Нове вікно шириною w, щоб дистанція d лишилась у тій самій частці f ширини графіка. */
  const zoomTo = (w, d, f) => {
    w = Math.max(MIN_W, Math.min(xMax, w));
    x0 = Math.max(0, Math.min(xMax - w, d - f * w)); x1 = x0 + w;
    draw();
  };
  const centerD = () => (lastD !== null && lastD >= x0 && lastD <= x1 ? lastD : (x0 + x1) / 2);
  const centerF = (d) => (d - x0) / (x1 - x0);
  const zbtn = (label, title, on) => h('button', { type: 'button', class: 'tr-zoom-btn', title, 'aria-label': title, onclick: on }, label);
  const inBtn = zbtn('+', t('Ближче'), () => { const d = centerD(); zoomTo((x1 - x0) / 2, d, centerF(d)); });
  const outBtn = zbtn('−', t('Далі'), () => { const d = centerD(); zoomTo((x1 - x0) * 2, d, centerF(d)); });
  const leftBtn = zbtn('‹', t('Ближчі дистанції'), () => zoomTo(x1 - x0, x0 - (x1 - x0) / 2, 0));
  const rightBtn = zbtn('›', t('Дальші дистанції'), () => zoomTo(x1 - x0, x1 + (x1 - x0) / 2, 1));
  const resetBtn = zbtn('↺', t('Увесь графік'), () => { x0 = 0; x1 = xMax; draw(); });
  const zoomBar = h('div', { class: 'tr-zoom', hidden: true }, leftBtn, outBtn, inBtn, rightBtn, resetBtn);
  // Один палець — підпис під пальцем; два — щипок: ширина вікна обернено до відстані між пальцями, середина тримає свою дистанцію
  const touches = new Map();
  let pinch = null;
  plot.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, e.clientX);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { gap: Math.max(10, Math.abs(a - b)), w: x1 - x0, d: distAt((a + b) / 2) };
    } else if (touches.size === 1) show(distAt(e.clientX));
  });
  plot.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, e.clientX);
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const box = plot.firstElementChild.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, ((((a + b) / 2 - box.left) / box.width) * W - L) / (W - L - R)));
      zoomTo(pinch.w * pinch.gap / Math.max(10, Math.abs(a - b)), pinch.d, f);
      return;
    }
    if (e.pointerType === 'mouse' || e.buttons) show(distAt(e.clientX));
  });
  const lift = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
  plot.addEventListener('pointerup', lift);
  plot.addEventListener('pointercancel', lift);
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') lift(e); });
  // Щипок на тачпаді й Ctrl+коліщатко приходять як wheel з ctrlKey; звичайне коліщатко гортає сторінку, як і було
  plot.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const d = distAt(e.clientX);
    zoomTo((x1 - x0) * Math.exp(e.deltaY * 0.01), d, centerF(d));
  }, { passive: false });
  draw();
  // Пояснення осей — лише для всієї траєкторії; у прямому пострілі все видно з плиток і підписів кривих
  const legend = full ? h('p', { class: 'muted small tr-legend' },
    [t('Ліворуч — сантиметри над лінією прицілу (мінус — нижче), внизу — метри. Без поправки барабаном куля йде так; крапка — пристрілка.'),
      subD ? t('Після {d} м куля дозвукова, точність падає.', { d: subD }) : null].filter(Boolean).join(' ')) : null;
  const altNote = alt ? h('p', { class: 'small tr-alt-note' }, [t('Пунктир — пристрілка {z} м', { z: alt.zero }),
    // Два нулі — одна траєкторія: пристрілювати можна на будь-якому, зручніше — на ближньому
    (() => { const { up, down } = zeros(alt.pts); return up !== null && down !== null && round5(down) - round5(up) >= 10 ? t('нулі на {a} і {b} м — пристрілювати можна на будь-якому', { a: round5(up), b: round5(down) }) : null; })(),
    t('±{r} см: {a}–{b} м', { r, a: round5(alt.span[0]), b: round5(alt.span[1]) })].filter(Boolean).join(' · ')) : null;
  // Підпис основної кривої: яка це пристрілка й звідки вона
  const mainNote = h('p', { class: 'small tr-main-note' }, [t('Помаранчева — пристрілка {z} м', { z: zero }), zeroNote].filter(Boolean).join(' · '));
  return h('div', { class: 'tr' }, ...[read, zoomBar, plot, mainNote, altNote, legend].filter(Boolean));
}

/**
 * Уся траєкторія: поправки в мрад по дистанції — вертикаль і знос вітром (wind — м/с бічної складової),
 * межа дозвуку (швидкість звуку — за температурою tC). H, W (знос на 1 м/с), V, T — з solve() з кроком step.
 */
export function fullChart({ H, W, V, T, step, wind = 0, tC = 15, arrow = '→' }) {
  const n = H.length;
  const xMax = n * step;
  const wd = W.map((w) => w * wind);
  // Ближче 50 м поправка на висоту прицілу над стволом велика (6 см на 10 м — 6 мрад) і ховає решту кривої
  const from = Math.max(0, Math.ceil(50 / step) - 1);
  const yMax = Math.ceil(Math.max(1, ...H.slice(from), ...(wind > 0 ? wd.slice(from) : [0])));
  const yMin = Math.min(0, Math.floor(Math.min(...H.slice(from))));
  const xs = (d) => L + ((W_ - L - R) * d) / xMax;
  const ys = (v) => T_ + ((H_ - T_ - B) * (yMax - v)) / (yMax - yMin);
  const poly = (vals) => vals.map((v, i) => [i, v]).slice(from).map(([i, v]) => `${xs((i + 1) * step).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  // Швидкість звуку залежить від температури: +15 °C — 340 м/с, −10 °C — 325
  const sound = 331.3 * Math.sqrt(1 + tC / 273.15);
  const sub = V.findIndex((v) => v < sound);
  const subD = sub >= 0 ? (sub + 1) * step : null;
  const xTicks = Array.from({ length: Math.floor(xMax / 100) + 1 }, (_, i) => i * 100).filter((d) => d % (xMax > 500 ? 200 : 100) === 0);
  const yStep = yMax > 12 ? 4 : yMax > 6 ? 2 : 1;
  // Кратні кроку — щоб нуль завжди мав підпис
  const y0 = Math.ceil(yMin / yStep) * yStep;
  const yTicks = Array.from({ length: Math.floor((yMax - y0) / yStep) + 1 }, (_, i) => y0 + i * yStep);
  const svg = `<svg viewBox="0 0 ${W_} ${H_}" role="img" aria-label="${t('Поправки за дистанцією')}">
    ${xTicks.map((d) => `<line class="tr-grid" x1="${xs(d)}" x2="${xs(d)}" y1="${T_}" y2="${H_ - B}"/><text class="tr-txt" x="${xs(d)}" y="${H_ - 6}" text-anchor="middle">${d}</text>`).join('')}
    ${yTicks.map((v) => `<line class="tr-grid" x1="${L}" x2="${W_ - R}" y1="${ys(v)}" y2="${ys(v)}"/><text class="tr-txt" x="${L - 4}" y="${ys(v) + 3}" text-anchor="end">${v < 0 ? '−' : ''}${Math.abs(v)}</text>`).join('')}
    ${subD ? `<line class="tr-sub" x1="${xs(subD)}" x2="${xs(subD)}" y1="${T_}" y2="${H_ - B}"/><text class="tr-txt tr-sub-txt" x="${xs(subD) - 3}" y="${T_ + 9}" text-anchor="end">${t('дозвук')}</text>` : ''}
    <polyline class="tr-curve" points="${poly(H)}"/>
    ${wind > 0 ? `<polyline class="tr-curve wind" points="${poly(wd)}"/>` : ''}
    <line class="tr-cursor" x1="0" x2="0" y1="${T_}" y2="${H_ - B}" visibility="hidden"/>
    <circle class="tr-dot" r="5" visibility="hidden"/>${wind > 0 ? '<circle class="tr-dot wind" r="5" visibility="hidden"/>' : ''}
  </svg>`;
  const plot = h('div', { class: 'tr-plot' });
  plot.innerHTML = svg;
  const cursor = plot.querySelector('.tr-cursor');
  const dot = plot.querySelector('.tr-dot:not(.wind)'); const windDot = plot.querySelector('.tr-dot.wind');
  const read = h('div', { class: 'tr-read' }, h('span', { class: 'muted small' }, t('Ведіть пальцем по графіку — покаже поправки на кожній дистанції')));
  const at = (arr, d) => { const i = d / step - 1; if (i < 0) return arr === V ? null : 0; const a = Math.floor(i); const b = Math.min(n - 1, a + 1); return arr[a] + (arr[b] - arr[a]) * (i - a); };
  const pick = (e) => {
    const box = plot.firstElementChild.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W_;
    const d = Math.max(50, Math.min(xMax, Math.round((((x - L) / (W_ - L - R)) * xMax) / 10) * 10));
    cursor.setAttribute('x1', xs(d)); cursor.setAttribute('x2', xs(d)); cursor.setAttribute('visibility', 'visible');
    const place = (el, v) => { el.setAttribute('cx', xs(d)); el.setAttribute('cy', Math.min(H_ - B, Math.max(T_, ys(v)))); el.setAttribute('visibility', 'visible'); };
    const up = at(H, d); const side = at(wd, d); const v = at(V, d);
    place(dot, up);
    if (windDot) place(windDot, side);
    const mr = (x) => fmt.num(Math.round(x * 10) / 10);
    const chip = (cls, label, main, sub) => h('span', { class: `tr-chip ${cls}` }, h('span', { class: 'tr-chip-label' }, label), h('b', {}, main), sub ? h('span', { class: 'tr-chip-sub' }, sub) : null);
    // Швидкість і час — дрібним рядком: на телефоні три плашки не влазять в один ряд
    read.replaceChildren(...[h('span', { class: 'tr-read-d' }, `${d} ${t('м')}`),
      chip('main', t('вертикаль'), `${up >= 0 ? '↑' : '↓'} ${mr(Math.abs(up))} MRAD`),
      wind > 0 ? chip('wind', t('вітер'), `${arrow} ${mr(side)} MRAD`) : null,
      h('span', { class: 'tr-read-info muted small' }, [t('куля {v} м/с', { v: Math.round(v) }), t('летить {s} с', { s: fmt.num(Math.round(at(T, d) * 100) / 100) }),
        v < sound ? t('дозвукова') : null].filter(Boolean).join(' · '))].filter(Boolean));
  };
  plot.addEventListener('pointerdown', pick);
  plot.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
  const legend = h('p', { class: 'muted small tr-legend' }, [t('Ліворуч — поправка в MRAD, внизу — метри (від 50 м)'), t('Помаранчева — вертикаль'),
    wind > 0 ? t('блакитна — знос вітром {w} м/с збоку', { w: fmt.num(Math.round(wind * 10) / 10) }) : t('вітер не задано'),
    subD ? t('після {d} м куля дозвукова, точність падає', { d: subD }) : null].filter(Boolean).join(' · '));
  return h('div', { class: 'tr' }, read, plot, legend);
}
