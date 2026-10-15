// Дрібні UI-примітиви без фреймворку: елементи, шторка, тост, форма, свайп.
import { t, locale } from './i18n.js';

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

const formatters = new Map();

/** Форматер під поточну мову: створюється раз на мову й опції. */
function nf(options) {
  const key = `${locale()}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale(), options));
  return formatters.get(key);
}

const NUM = { maximumFractionDigits: 3 };
const MONEY = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export const fmt = {
  num: (n) => nf(NUM).format(Number(n) || 0),
  // Гривня — у самому форматері: інакше валюту довелося б дописувати в кожному рядку.
  money: (n) => `${nf(MONEY).format(Number(n) || 0)} грн`,
  signed: (n) => (n > 0 ? `+${nf(NUM).format(n)}` : nf(NUM).format(n)),
  date: (iso) => (iso ? iso.split('-').reverse().join('.') : t('без даты')),
  time: (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
};

export function vibrate(ms = 12) {
  navigator.vibrate?.(ms);
}

/** Нижня шторка. Повертає close(). */
// Відкриті «живі» шторки: картка під іншою шторкою має побачити, що там змінили чи видалили.
const liveSheets = new Set();

/** Перебудовує відкриті живі шторки за свіжим станом; live() поверне null — запису вже нема, шторка закривається. */
export function refreshSheets() {
  for (const s of [...liveSheets]) s();
}

/** live — функція, що будує тіло заново; з нею шторка оновлюється після refreshSheets(). */
export function sheet(title, body, { actions = [], onClose, live, tools = [] } = {}) {
  const layer = document.getElementById('layer');
  const close = () => {
    liveSheets.delete(rebuild);
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 180);
    window.removeEventListener('popstate', close);
    onClose?.();
  };
  const rebuild = () => {
    const next = live();
    if (!next) { close(); return; }
    const box = panel.querySelector('.sheet-body');
    const top = box.scrollTop;
    box.replaceChildren(next);
    box.scrollTop = top;
  };
  if (live) liveSheets.add(rebuild);
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-grip' }),
    h('header', { class: 'sheet-head' },
      h('h2', {}, title),
      h('div', { class: 'sheet-tools' }, tools,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Закрыть'), onclick: close }, '✕'))),
    h('div', { class: 'sheet-body' }, body),
    actions.length ? h('footer', { class: 'sheet-actions' }, actions) : null);
  // Закривати лише якщо й натиск почався на фоні: інакше на сенсорному екрані «фантомний» клік
  // після тапу по картці падає на щойно відкритий фон і одразу закриває шторку.
  let downOnBackdrop = false;
  const backdrop = h('div', {
    class: 'backdrop',
    onpointerdown: (e) => { downOnBackdrop = e.target === backdrop; },
    onclick: (e) => { if (e.target === backdrop && downOnBackdrop) close(); downOnBackdrop = false; },
  }, panel);
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

/** Пункти <select>: [value, label] або група { group, options: [[value, label], …] }. */
export function selectOptions(options, selected) {
  const option = ([value, label]) => h('option', { value, selected: String(value) === String(selected ?? '') }, label);
  return options.map((o) => (Array.isArray(o) ? option(o) : o.options.length ? h('optgroup', { label: o.group }, o.options.map(option)) : null));
}

/**
 * Проста форма. fields: [{ name, label, type, value, options, required, step, min, list, hint, half }]
 * half — поле на пів рядка: два такі поля поспіль стають в одну строку.
 * type: text | number | date | select | textarea | chips
 */
export function form(fields) {
  const inputs = {};
  const el = h('div', { class: 'form' });
  for (const f of fields) {
    let input;
    if (f.type === 'select') {
      input = h('select', { name: f.name }, selectOptions(f.options, f.value));
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.name, rows: 2 });
      input.value = f.value ?? '';
    } else if (f.type === 'chips') {
      input = chips(f.options, f.value, f.onPick);
    } else if (f.type === 'dmy') {
      input = dmyInput(f.value);
    } else {
      input = h('input', {
        name: f.name, type: f.type ?? 'text', step: f.step, min: f.min, list: f.list,
        inputmode: f.type === 'number' ? 'decimal' : undefined,
        placeholder: f.placeholder, autocomplete: 'off',
      });
      input.value = f.value ?? '';
    }
    inputs[f.name] = input;
    el.append(h('label', { class: `field ${f.wide ? 'wide' : ''} ${f.half ? 'half' : ''}` },
      f.label ? h('span', { class: 'field-label' }, f.label) : null, input,
      f.hint ? h('small', { class: 'muted' }, f.hint) : null));
  }
  const values = () => {
    const out = {};
    for (const f of fields) {
      const input = inputs[f.name];
      let v = input.value;
      if (f.type === 'number') v = v === '' ? null : Number(String(v).replace(',', '.'));
      if (f.type === 'dmy') v = dmyToIso(v) ?? (v.trim() ? NaN : '');
      out[f.name] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
  };
  const invalid = () => fields.find((f) => {
    const v = values()[f.name];
    return (f.required && (v === '' || v === null)) || ((f.type === 'number' || f.type === 'dmy') && Number.isNaN(v));
  });
  return { el, inputs, values, invalid };
}

/** «2026-11-03» → «03.11.2026». */
export function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** «03.11.2026» або «3.11.26» → «2026-11-03»; null — не дата (31.02 теж). */
export function dmyToIso(text) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? `20${m[3]}` : m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Дата цифрами замість календаря: на роки вперед чи назад календар гортає місяць за місяцем.
 * Крапки ставляться самі: 03112026 → 03.11.2026; рік можна двома цифрами.
 */
function dmyInput(iso) {
  const input = h('input', { type: 'text', inputmode: 'numeric', placeholder: t('ДД.ММ.ГГГГ'), maxlength: 10, autocomplete: 'off', class: 'dmy' });
  input.value = isoToDmy(iso);
  input.addEventListener('input', () => {
    // Частина перед роздільником завершена: «3.» — це день 03, а не початок «31»
    const parts = input.value.split(/\D+/);
    let d = '';
    parts.forEach((p, i) => { d += i < parts.length - 1 && p.length === 1 && d.length < 4 ? `0${p}` : p; });
    d = d.slice(0, 8);
    input.value = d.slice(0, 2) + (d.length > 2 ? `.${d.slice(2, 4)}` : '') + (d.length > 4 ? `.${d.slice(4)}` : '');
  });
  // Вийшли з поля — рік повністю: 14.10.23 → 14.10.2023
  input.addEventListener('blur', () => { const iso = dmyToIso(input.value); if (iso) input.value = isoToDmy(iso); });
  return input;
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
    axis = null; dx = 0; tapArmed = false;
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
      tapArmed = true;
    }
  };
  // Тап відкриваємо на click, а не на pointerup: click приходить останнім,
  // тож після відкриття шторки вже нема «фантомного» кліку, який її закриє.
  let tapArmed = false;
  card.addEventListener('click', () => {
    if (!tapArmed) return;
    tapArmed = false;
    onTap?.();
  });
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', finish);
  return card;
}

export function confirmSheet(title, text, okLabel, onOk) {
  const close = sheet(title, h('p', {}, text), {
    actions: [
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, t('Отмена')),
      h('button', { type: 'button', class: 'btn danger', onclick: () => { close(); onOk(); } }, okLabel),
    ],
  });
}
