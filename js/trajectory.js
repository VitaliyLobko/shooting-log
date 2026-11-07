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

const round5 = (d) => Math.round(d / 5) * 5;
const cmText = (cm) => `${cm > 0 ? '+' : cm < 0 ? '−' : ''}${fmt.num(Math.round(Math.abs(cm) * 10) / 10)}`;

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

/**
 * Графік: висота кулі над лінією прицілу, смуга ±r, пристрілка, відрізки прямого пострілу.
 * Тап чи рух мишею — висота на тій дистанції рядком під графіком.
 */
export function trajectoryChart(pts, { r, zero, spans, apex }) {
  const far = spans.length ? spans[spans.length - 1][1] : zero;
  const xMax = Math.min(pts[pts.length - 1].d, Math.max(300, Math.ceil((Math.max(far, zero) * 1.35 + 30) / 100) * 100));
  const yHi = Math.max(r, apex.cm) + 3;
  const yLo = -Math.max(3 * r, pts[0].cm * -1 + 2);
  const xs = (d) => L + ((W - L - R) * d) / xMax;
  const ys = (cm) => T + ((H - T - B) * (yHi - cm)) / (yHi - yLo);
  const shown = pts.filter((p) => p.d <= xMax);
  const line = shown.map((p) => `${xs(p.d).toFixed(1)},${ys(p.cm).toFixed(1)}`).join(' ');
  const xTicks = Array.from({ length: Math.floor(xMax / 100) + 1 }, (_, i) => i * 100);
  const yTicks = [r, 0, -r, -2 * r, -3 * r].filter((v) => v <= yHi && v >= yLo);
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Траєкторія відносно лінії прицілу')}">
    <defs><clipPath id="tr-clip"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/></clipPath></defs>
    ${xTicks.map((d) => `<line class="tr-grid" x1="${xs(d)}" x2="${xs(d)}" y1="${T}" y2="${H - B}"/><text class="tr-txt" x="${xs(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('')}
    ${yTicks.map((v) => `<text class="tr-txt" x="${L - 4}" y="${ys(v) + 3}" text-anchor="end">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</text>`).join('')}
    <rect class="tr-band" x="${L}" y="${ys(r)}" width="${W - L - R}" height="${ys(-r) - ys(r)}"/>
    ${spans.filter(([a]) => a <= xMax).map(([a, b]) => `<line class="tr-span" x1="${xs(a)}" x2="${xs(Math.min(b, xMax))}" y1="${H - B}" y2="${H - B}"/>`).join('')}
    <line class="tr-los" x1="${L}" x2="${W - R}" y1="${ys(0)}" y2="${ys(0)}"/>
    <g clip-path="url(#tr-clip)"><polyline class="tr-curve" points="${line}"/></g>
    ${zero <= xMax ? `<circle class="tr-zero" cx="${xs(zero)}" cy="${ys(0)}" r="3.5"/>` : ''}
    <line class="tr-cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
  </svg>`;
  const plot = h('div', { class: 'tr-plot' });
  plot.innerHTML = svg;
  const cursor = plot.querySelector('.tr-cursor');
  const read = h('p', { class: 'muted small tr-read' }, t('Торкніться графіка — покаже висоту кулі на дистанції'));
  const pick = (e) => {
    const box = plot.firstElementChild.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const d = Math.max(0, Math.min(xMax, Math.round((((x - L) / (W - L - R)) * xMax) / 5) * 5));
    const cm = heightAt(pts, d);
    if (cm === null) return;
    cursor.setAttribute('x1', xs(d)); cursor.setAttribute('x2', xs(d)); cursor.setAttribute('visibility', 'visible');
    read.textContent = Math.abs(cm) < 0.5 ? t('{d} м: куля в точці прицілювання', { d })
      : t('{d} м: куля на {cm} см {side} точки прицілювання', { d, cm: fmt.num(Math.round(Math.abs(cm) * 10) / 10), side: cm > 0 ? t('вище') : t('нижче') });
  };
  plot.addEventListener('pointerdown', pick);
  plot.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); });
  const legend = h('p', { class: 'muted small tr-legend' }, t('Ліворуч — сантиметри над лінією прицілу, внизу — метри. Смуга — ±{r} см, крапка — пристрілка, риска внизу — де барабан крутити не треба.', { r }));
  return h('div', { class: 'tr' }, plot, read, legend);
}
