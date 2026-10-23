// Графіки: тонкі inline-SVG без бібліотек. Кольори беруться з теми через currentColor і класи,
// розміри — у координатах viewBox, тож на будь-якому екрані малюнок той самий.
import { h } from './ui.js';
import { locale } from './i18n.js';

/** Круглі поділки шкали: крок 1·2·5 × 10ⁿ, межі — кратні кроку, щоб числа читалися з ходу. */
function niceTicks(lo, hi, minStep = 0) {
  if (hi === lo) {
    const d = Math.abs(lo) * 0.1 || 1;
    lo -= d;
    hi += d;
  }
  const raw = Math.max((hi - lo) / 3, minStep);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw * (1 - 1e-9));
  const from = Math.floor(lo / step + 1e-9) * step;
  const to = Math.ceil(hi / step - 1e-9) * step;
  const list = [];
  for (let v = from; v <= to + step / 2; v += step) list.push(Number(v.toFixed(10)));
  return { lo: from, hi: to, step, list };
}

/** Позиція в області графіка: відсотки по обох осях, тож точки круглі на будь-якій ширині. */
const at = (x, y) => `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%`;

/**
 * Лінія за точками [{ label, value }], від старих до нових, зі шкалою й підказкою по дотику.
 * up — більше краще (від нього залежить, яка точка «найкраща»); format — значення з одиницею;
 * refs — пороги [[значення, назва]]: показуються ті, що в межах даних, і найближча наступна ціль.
 */
export function lineChart(points, { up = true, format = (v) => String(Math.round(v)), refs = [], minStep = 0 } = {}) {
  const el = h('div', { class: 'chart' });
  if (points.length < 2) {
    el.classList.add('chart-thin');
    el.append(h('p', { class: 'muted small' }, points.length ? format(points[0].value) : '—'));
    return el;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const best = up ? max : min;
  // Наступна ціль — найближчий поріг за найкращим результатом; дальні тільки стиснули б лінію.
  const ahead = refs.filter(([v]) => (up ? v > best : v < best)).sort((a, b) => (up ? a[0] - b[0] : b[0] - a[0]))[0];
  const shown = refs.filter(([v]) => v >= min && v <= max).concat(ahead ? [ahead] : []);
  const ticks = niceTicks(Math.min(min, ...shown.map(([v]) => v)), Math.max(max, ...shown.map(([v]) => v)), minStep);
  const n = points.length;
  const xp = (i) => (i * 100) / (n - 1);
  const yp = (v) => (1 - (v - ticks.lo) / (ticks.hi - ticks.lo)) * 100;
  const digits = Math.max(0, -Math.floor(Math.log10(ticks.step) + 1e-9));
  const tickFmt = new Intl.NumberFormat(locale(), { maximumFractionDigits: digits });

  const line = values.map((v, i) => `${xp(i).toFixed(2)},${yp(v).toFixed(2)}`).join(' ');
  const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${ticks.list.map((v) => `<line x1="0" x2="100" y1="${yp(v).toFixed(2)}" y2="${yp(v).toFixed(2)}" class="ch-grid"/>`).join('')}
      ${shown.map(([v]) => `<line x1="0" x2="100" y1="${yp(v).toFixed(2)}" y2="${yp(v).toFixed(2)}" class="ch-ref"/>`).join('')}
      <polygon points="0,100 ${line} 100,100" class="ch-area"/>
      <polyline points="${line}" class="ch-line"/>
      <line x1="0" x2="0" y1="0" y2="100" class="ch-cross" visibility="hidden"/>
    </svg>`;
  const inner = h('div', { class: 'ch-in' });
  inner.innerHTML = svg;
  const cross = inner.querySelector('.ch-cross');

  const bestAt = values.lastIndexOf(best);
  const lastAt = n - 1;
  // Багато спроб — кружечки злилися б у ковбасу; тоді лишаємо тільки найкращу й останню.
  const dense = n > 24;
  values.forEach((v, i) => {
    const key = i === bestAt ? 'best' : i === lastAt ? 'last' : '';
    if (dense && !key) return;
    inner.append(h('span', { class: `ch-pt ${key}`, style: at(xp(i), yp(v)) }));
  });
  // Підписи прямо на лінії: лише найкращий і останній, а решту видно по дотику.
  // Найкращий поруч з останнім і на тій самій висоті — його підпис під точкою, щоб не налізли.
  const close = xp(lastAt) - xp(bestAt) < 30 && Math.abs(yp(values[lastAt]) - yp(best)) < 15;
  const label = (i, cls) => {
    const below = (yp(values[i]) < 22) !== (cls === 'best' && close);
    // Біля краю (а не лише на крайній точці) підпис притискаємо всередину, щоб не обрізався
    const edge = i === lastAt || xp(i) > 85 ? 'end' : i === 0 || xp(i) < 15 ? 'start' : '';
    inner.append(h('span', { class: `ch-lab ${cls} ${edge} ${below ? 'below' : ''}`, style: at(xp(i), yp(values[i])) }, format(values[i])));
  };
  label(bestAt, 'best');
  if (bestAt !== lastAt) label(lastAt, 'last');
  for (const [v, name] of shown) inner.append(h('span', { class: 'ch-ref-lab', style: at(0, yp(v)) }, `${name} · ${tickFmt.format(v)}`));

  const tip = h('div', { class: 'ch-tip', hidden: true });
  const hit = h('span', { class: 'ch-pt hit', hidden: true });
  inner.append(hit, tip);
  const show = (i) => {
    const x = xp(i);
    const y = yp(values[i]);
    tip.replaceChildren(h('b', {}, format(values[i])), h('span', {}, points[i].label));
    tip.hidden = false;
    tip.style.cssText = at(x, y);
    tip.dataset.side = x < 25 ? 'start' : x > 75 ? 'end' : '';
    tip.classList.toggle('below', y < 40);
    hit.hidden = false;
    hit.style.cssText = at(x, y);
    cross.setAttribute('x1', x.toFixed(2));
    cross.setAttribute('x2', x.toFixed(2));
    cross.setAttribute('visibility', 'visible');
  };
  const hide = () => {
    tip.hidden = true;
    hit.hidden = true;
    cross.setAttribute('visibility', 'hidden');
  };
  // Найближча точка по горизонталі — ціль торкання на всю висоту, а не крихітний кружечок.
  const pick = (e) => {
    const r = inner.getBoundingClientRect();
    show(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const plot = h('div', { class: 'ch-plot' },
    h('div', { class: 'ch-y' }, ticks.list.map((v) => h('span', { style: `top:${yp(v).toFixed(2)}%` }, tickFmt.format(v)))),
    inner);
  plot.addEventListener('pointerdown', pick);
  plot.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pick(e); });
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });

  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${points[0].label} — ${points[lastAt].label}: ${format(values[0])} → ${format(values[lastAt])}`);
  el.append(plot, h('div', { class: 'chart-legend' },
    h('span', {}, points[0].label),
    h('span', {}, points[lastAt].label)));
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
      // Від'ємне (продав більше, ніж купив) — без стовпчика, лише підпис з мінусом.
      h('span', { class: 'bar-fill', style: `height:${r.value > 0 ? Math.max(3, (r.value / max) * 100) : 0}%` }),
      h('span', { class: 'bar-lbl' }, r.label));
    el.append(bar);
  }
  return el;
}

