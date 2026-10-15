// Графіки: тонкі inline-SVG без бібліотек. Кольори беруться з теми через currentColor і класи,
// розміри — у координатах viewBox, тож на будь-якому екрані малюнок той самий.
import { h } from './ui.js';

const W = 300;
const H = 110;
const PAD = { l: 4, r: 4, t: 8, b: 16 };

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** Проєкція значень у координати полотна; однакове значення скрізь — лінія посередині. */
function scale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const lo = max === min ? min - span / 2 : min;
  const hi = max === min ? max + span / 2 : max;
  return {
    min, max,
    x: (i, n) => PAD.l + (n < 2 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1)),
    y: (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b),
  };
}

/**
 * Лінія за точками [{ label, value }], від старих до нових. up: true — більше краще (зелена стрілка).
 * caption(min, max) — підпис під графіком; без нього показуються крайні значення.
 */
export function lineChart(points, { up = true, format = (v) => String(Math.round(v)) } = {}) {
  const el = h('div', { class: 'chart' });
  if (points.length < 2) {
    el.classList.add('chart-thin');
    el.append(h('p', { class: 'muted small' }, points.length ? format(points[0].value) : '—'));
    return el;
  }
  const values = points.map((p) => p.value);
  const s = scale(values);
  const n = points.length;
  const pts = points.map((p, i) => [s.x(i, n), s.y(p.value)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${PAD.l},${H - PAD.b} ${line} ${(W - PAD.r).toFixed(1)},${H - PAD.b}`;
  const first = values[0];
  const last = values.at(-1);
  const better = up ? last >= first : last <= first;
  const dots = pts.map(([x, y], i) => {
    const best = up ? values[i] === s.max : values[i] === s.min;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${best ? 3.4 : 2.2}" class="${best ? 'ch-best' : 'ch-dot'}"/>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-hidden="true">
      <polygon points="${area}" class="ch-area"/>
      <polyline points="${line}" class="ch-line ${better ? 'up' : 'down'}"/>
      ${dots}
    </svg>`;
  el.append(h('div', { class: 'chart-legend' },
    h('span', {}, `${esc(points[0].label)} · ${format(first)}`),
    h('span', { class: better ? 'ok' : 'warn' }, `${esc(points.at(-1).label)} · ${format(last)}`)));
  return el;
}

/** Стовпчики за місяцями: [{ label, value, sub }]. Найбільший — акцентом. */
export function barChart(rows, { format = (v) => String(Math.round(v)) } = {}) {
  const el = h('div', { class: 'bars' });
  if (!rows.length) return el;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  for (const r of rows) {
    const bar = h('div', { class: `bar-col ${r.value === max ? 'top' : ''}`, title: `${r.label}: ${format(r.value)}` },
      h('span', { class: 'bar-val' }, format(r.value)),
      h('span', { class: 'bar-fill', style: `height:${Math.max(3, (r.value / max) * 100)}%` }),
      h('span', { class: 'bar-lbl' }, r.label));
    el.append(bar);
  }
  return el;
}

/** Мініатюра лінії для плитки: лише форма, без підписів. */
export function sparkline(values) {
  if (values.length < 2) return null;
  const s = scale(values);
  const n = values.length;
  const line = values.map((v, i) => `${s.x(i, n).toFixed(1)},${s.y(v).toFixed(1)}`).join(' ');
  const el = h('span', { class: 'spark', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${line}" class="ch-line"/></svg>`;
  return el;
}
