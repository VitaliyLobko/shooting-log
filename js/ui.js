// Дрібні UI-примітиви без фреймворку: елементи, шторка, тост, форма, свайп.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const numFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = {
  num: (n) => numFmt.format(Number(n) || 0),
  money: (n) => moneyFmt.format(Number(n) || 0),
  signed: (n) => (n > 0 ? `+${numFmt.format(n)}` : numFmt.format(n)),
  date: (iso) => (iso ? iso.split('-').reverse().join('.') : 'без даты'),
};

export function vibrate(ms = 12) {
  navigator.vibrate?.(ms);
}

/** Нижня шторка. Повертає close(). */
export function sheet(title, body, { actions = [], onClose } = {}) {
  const layer = document.getElementById('layer');
  const close = () => {
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 180);
    window.removeEventListener('popstate', close);
    onClose?.();
  };
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-grip' }),
    h('header', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Закрыть', onclick: close }, '✕')),
    h('div', { class: 'sheet-body' }, body),
    actions.length ? h('footer', { class: 'sheet-actions' }, actions) : null);
  const backdrop = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, panel);
  layer.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  window.addEventListener('popstate', close, { once: true });
  return close;
}

let toastTimer;

export function toast(message, { action, onAction, timeout = action ? 8000 : 3500 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message),
    action ? h('button', { type: 'button', onclick: () => { el.remove(); onAction(); } }, action) : null);
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), timeout);
}

/**
 * Проста форма. fields: [{ name, label, type, value, options, required, step, min, list, hint }]
 * type: text | number | date | select | textarea | chips
 */
export function form(fields) {
  const inputs = {};
  const el = h('div', { class: 'form' });
  for (const f of fields) {
    let input;
    if (f.type === 'select') {
      input = h('select', { name: f.name },
        f.options.map(([value, label]) => h('option', { value, selected: String(value) === String(f.value ?? '') }, label)));
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.name, rows: 2 });
      input.value = f.value ?? '';
    } else if (f.type === 'chips') {
      input = chips(f.options, f.value, f.onPick);
    } else {
      input = h('input', {
        name: f.name, type: f.type ?? 'text', step: f.step, min: f.min, list: f.list,
        inputmode: f.type === 'number' ? 'decimal' : undefined,
        placeholder: f.placeholder, autocomplete: 'off',
      });
      input.value = f.value ?? '';
    }
    inputs[f.name] = input;
    el.append(h('label', { class: `field ${f.wide ? 'wide' : ''}` },
      f.label ? h('span', { class: 'field-label' }, f.label) : null, input,
      f.hint ? h('small', { class: 'muted' }, f.hint) : null));
  }
  const values = () => {
    const out = {};
    for (const f of fields) {
      const input = inputs[f.name];
      let v = input.value;
      if (f.type === 'number') v = v === '' ? null : Number(String(v).replace(',', '.'));
      out[f.name] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
  };
  const invalid = () => fields.find((f) => {
    const v = values()[f.name];
    return (f.required && (v === '' || v === null)) || (f.type === 'number' && v !== null && Number.isNaN(v));
  });
  return { el, inputs, values, invalid };
}

/** Ряд кнопок-чипів; клік вставляє значення. Повертає контейнер з полем .value. */
export function chips(options, value, onPick) {
  const wrap = h('div', { class: 'chips' });
  wrap.value = value ?? '';
  const sync = () => wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === String(wrap.value)));
  for (const opt of options) {
    const [val, label] = Array.isArray(opt) ? opt : [opt, opt];
    wrap.append(h('button', {
      type: 'button', dataset: { value: val },
      onclick: () => { wrap.value = String(val); sync(); onPick?.(val); },
    }, label));
  }
  sync();
  return wrap;
}

/**
 * Свайп картки: вправо — onRight, вліво — onLeft. Вертикальний скрол лишається браузеру
 * (touch-action: pan-y), горизонтальний рух перехоплюємо.
 */
export function swipeable(card, { onRight, onLeft, onTap, rightLabel, leftLabel }) {
  const body = card.querySelector('.swipe-body');
  card.classList.add('swipe');
  card.prepend(
    h('div', { class: 'swipe-bg right' }, rightLabel ?? ''),
    h('div', { class: 'swipe-bg left' }, leftLabel ?? ''));
  card.tabIndex = 0;
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') onTap?.(); });
  let start = null;
  let axis = null;
  let dx = 0;
  let armed = false;

  const reset = () => {
    body.style.transition = 'transform .18s ease';
    body.style.transform = '';
    card.classList.remove('armed', 'dir-right', 'dir-left');
    start = null; axis = null; dx = 0; armed = false;
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, a, input')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    axis = null; dx = 0;
    body.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.x;
    const my = e.clientY - start.y;
    if (!axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (axis === 'x') card.setPointerCapture(start.id);
    }
    if (axis !== 'x') return;
    dx = mx;
    if ((dx > 0 && !onRight) || (dx < 0 && !onLeft)) dx = 0;
    body.style.transform = `translateX(${dx}px)`;
    card.classList.toggle('dir-right', dx > 0);
    card.classList.toggle('dir-left', dx < 0);
    const nowArmed = Math.abs(dx) > card.clientWidth * 0.3;
    if (nowArmed !== armed) { armed = nowArmed; card.classList.toggle('armed', armed); if (armed) vibrate(); }
  });
  const finish = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const wasAxis = axis;
    const wasArmed = armed;
    const dir = dx;
    reset();
    if (wasAxis === 'x') {
      if (wasArmed) (dir > 0 ? onRight : onLeft)?.();
    } else if (!wasAxis && e.type === 'pointerup') {
      onTap?.();
    }
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', finish);
  return card;
}

export function confirmSheet(title, text, okLabel, onOk) {
  const close = sheet(title, h('p', {}, text), {
    actions: [
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { type: 'button', class: 'btn danger', onclick: () => { close(); onOk(); } }, okLabel),
    ],
  });
}
