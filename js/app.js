import * as db from './db.js';
import * as M from './model.js';
import * as sync from './sync.js';
import { t, lang, setLang, LANGS, collate, applyStatic } from './i18n.js';
import { prepare as preparePhoto, viewer } from './photos.js';
import { h, fmt, sheet, toast, form, chips, swipeable, confirmSheet } from './ui.js';

let state = { weapons: [], cartridges: [], components: [], recipes: [], movements: [], photos: [] };
let tab = 'ammo';
let logFilter = 'all';

const $ = (id) => document.getElementById(id);

// Компонент «закінчується», якщо його вистачить менше ніж на стільки патронів.
const LOW_ROUNDS = 50;

// ---------- дані ----------

async function refresh() {
  state = await db.loadAll();
  render();
}

function movement(fields) {
  return { id: db.uid(), created: Date.now(), date: M.today(), ...fields };
}

/** Записує рухи однією транзакцією і пропонує скасувати. */
async function addMovements(list, message, extra = {}) {
  await db.write({ movements: { put: list }, ...extra });
  await refresh();
  toast(message, {
    action: t('Отменить'),
    onAction: async () => {
      await db.write({ movements: { del: list.map((m) => m.id) } });
      await refresh();
      toast(t('Отменено'));
    },
  });
}

async function saveEntity(store, obj, message) {
  await db.write({ [store]: { put: [obj] } });
  await refresh();
  if (message) toast(message);
}

const findWeapon = (id) => state.weapons.find((w) => w.id === id);
const findCartridge = (id) => state.cartridges.find((c) => c.id === id);
const findComponent = (id) => state.components.find((c) => c.id === id);
const findRecipe = (id) => state.recipes.find((r) => r.id === id);
const byName = (a, b) => collate(a.name, b.name);

function remember(key, value) {
  try { localStorage.setItem(key, value ?? ''); } catch { /* приватний режим */ }
}

function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ---------- спільні шматки UI ----------

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map].sort((a, b) => collate(a[0], b[0]));
}

const folded = new Set((() => {
  try { return JSON.parse(recall('shooting-log:folded')) ?? []; } catch { return []; }
})());

/** Група, що згортається; стан запам'ятовується між запусками. */
function fold(key, head, body) {
  const el = h('details', { class: 'fold', open: !folded.has(key), dataset: { key } },
    h('summary', { class: 'fold-head' }, h('span', { class: 'chevron', 'aria-hidden': 'true' }), head),
    h('div', { class: 'fold-body' }, body));
  el.addEventListener('toggle', () => {
    if (el.open) folded.delete(key);
    else folded.add(key);
    remember('shooting-log:folded', JSON.stringify([...folded]));
  });
  return el;
}

function empty(title, text) {
  return h('div', { class: 'empty' }, h('h3', {}, title), h('p', { class: 'muted' }, text));
}

function caliberList() {
  const defaults = ['.223 Rem', '.308 Win', '7.62×39', '7.62×54R', '9×19', '12 кал'];
  const all = [...new Set([...M.calibers(state), ...defaults])];
  return h('datalist', { id: 'cal-list' }, all.map((c) => h('option', { value: c })));
}

function qtyChips(input, values = [10, 20, 50, 100]) {
  const row = chips(values.map((v) => [v, String(v)]), input.value, (v) => { input.value = v; });
  input.closest('.field').after(row);
  input.addEventListener('input', () => { row.value = input.value; row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === input.value)); });
  return row;
}

function btn(label, onclick, kind = '') {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
}

function stat(label, value, cls = '') {
  return h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-value' }, value), h('div', { class: 'muted small' }, label));
}

function invalidToast(f) {
  const bad = f.invalid();
  if (bad) { toast(t('Заполните поле «{label}»', { label: bad.label })); f.inputs[bad.name]?.focus(); }
  return Boolean(bad);
}

function archiveBlock(items, restore) {
  if (!items.length) return null;
  return h('details', { class: 'archive' },
    h('summary', {}, `${t('Архив')} (${items.length})`),
    items.map((x) => h('div', { class: 'archive-row' },
      h('span', {}, x.name), btn(t('Вернуть'), () => restore(x)))));
}

/** Великий підсумок угорі екрана. */
function hero(label, value, sub, cls = '') {
  return h('section', { class: `hero ${cls}` },
    h('div', { class: 'hero-label' }, label),
    h('div', { class: 'hero-value' }, value),
    sub ? h('div', { class: 'hero-sub' }, sub) : null);
}

// ---------- БК ----------

function cartridgeDetails(c) {
  const parts = [];
  if (c.bulletWeight) parts.push(`${fmt.num(c.bulletWeight)} ${c.weightUnit || 'gr'}`);
  const recipe = c.recipeId && findRecipe(c.recipeId);
  if (recipe) parts.push(t('самоснаряд · {price} за шт', { price: fmt.money(M.recipeCost(state, recipe)) }));
  if (c.note) parts.push(c.note);
  return parts.join(' · ');
}

function cartridgeCard(c) {
  const stock = M.cartridgeStock(state, c.id);
  const card = h('article', { class: 'card' },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'muted small' }, cartridgeDetails(c))),
      h('div', { class: `big ${stock < 0 ? 'neg' : stock === 0 ? 'zero' : ''}` }, fmt.num(stock))));
  return swipeable(card, {
    rightLabel: t('+ Купить'), leftLabel: t('Списать −'),
    onRight: () => buySheet(c),
    onLeft: () => shootSheet({ cartridge: c }),
    onTap: () => cartridgeDetail(c),
  });
}

function openFold(key) {
  const el = [...document.querySelectorAll('.fold')].find((d) => d.dataset.key === key);
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAmmo() {
  const active = state.cartridges.filter((c) => !c.archived);
  const archived = archiveBlock(state.cartridges.filter((c) => c.archived), restoreCartridge);
  if (!active.length) {
    return h('div', {}, empty(t('Пока нет патронов'), t('Нажмите «+», чтобы добавить позицию, или импортируйте данные в разделе «Ещё».')), archived);
  }
  $('subtitle').textContent = t('Свайп → купить, ← списать');
  const groups = groupBy(active, (c) => c.caliber || t('Без калибра'))
    .map(([caliber, list]) => ({ caliber, list: list.sort(byName), sum: list.reduce((s, c) => s + M.cartridgeStock(state, c.id), 0) }));
  const total = groups.reduce((s, g) => s + g.sum, 0);
  return h('div', {},
    hero(t('Всего патронов'),
      [h('span', { class: total < 0 ? 'neg' : '' }, fmt.num(total)), h('span', { class: 'hero-unit' }, t('шт'))],
      h('div', { class: 'hero-split' }, groups.map((g) => h('button', { type: 'button', class: 'pill', onclick: () => openFold(`ammo:${g.caliber}`) },
        h('span', {}, g.caliber), h('b', {}, fmt.num(g.sum))))), 'accent'),
    groups.map((g) => fold(`ammo:${g.caliber}`,
      [h('span', { class: 'fold-title' }, g.caliber),
        h('span', { class: 'fold-meta' }, t('{n} поз.', { n: g.list.length })),
        h('span', { class: 'fold-sum' }, `${fmt.num(g.sum)} ${t('шт')}`)],
      g.list.map(cartridgeCard))),
    archived);
}

function restoreCartridge(c) {
  saveEntity('cartridges', { ...c, archived: false }, t('Возвращено из архива'));
}

function cartridgeForm(c = null) {
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: c?.name, placeholder: 'GGG 147 FMJ' },
    { name: 'caliber', label: t('Калибр'), required: true, value: c?.caliber, list: 'cal-list' },
    { name: 'bulletWeight', label: t('Вес пули / снаряда'), type: 'number', step: 'any', value: c?.bulletWeight },
    { name: 'weightUnit', label: t('Ед.'), type: 'select', value: c?.weightUnit ?? 'gr', options: [['gr', t('гран (gr)')], ['г', t('грамм (г)')]] },
    ...(c ? [] : [{ name: 'initial', label: t('Сейчас в наличии, шт'), type: 'number', step: 1, min: 0 }]),
    { name: 'note', label: t('Примечание'), value: c?.note, wide: true },
  ]);
  f.el.append(caliberList());
  const close = sheet(c ? t('Изменить патрон') : t('Новый патрон'), f.el, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const obj = { ...(c ?? { id: db.uid(), created: Date.now() }), name: v.name, caliber: v.caliber, bulletWeight: v.bulletWeight, weightUnit: v.weightUnit, note: v.note };
    close();
    if (!c && v.initial > 0) {
      await addMovements([movement({ kind: 'adjust', cartridgeId: obj.id, caliber: obj.caliber, qty: Math.round(v.initial), note: t('Начальный остаток') })],
        t('Добавлено: {name}', { name: obj.name }), { cartridges: { put: [obj] } });
    } else {
      await saveEntity('cartridges', obj, c ? t('Сохранено') : t('Добавлено: {name}', { name: obj.name }));
    }
  }
}

function buySheet(c) {
  const f = form([
    { name: 'qty', label: t('Количество, шт'), type: 'number', step: 1, min: 1, required: true },
    { name: 'price', label: t('Сумма покупки (необязательно)'), type: 'number', step: 'any' },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() },
    { name: 'note', label: t('Где купил / примечание') },
  ]);
  qtyChips(f.inputs.qty);
  const close = sheet(t('Купить: {name}', { name: c.name }), f.el, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Добавить'), save, 'primary buy')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast(t('Укажите количество')); return; }
    close();
    await addMovements([movement({ kind: 'buy', cartridgeId: c.id, caliber: c.caliber, qty: Math.round(v.qty), price: v.price, date: v.date || null, note: v.note })],
      `+${fmt.num(v.qty)} · ${c.name}`);
  }
}

/** Списання на стрільбі: від патрона (обираємо ствол) або від ствола (обираємо патрон). */
function shootSheet({ cartridge = null, weapon = null }) {
  const caliber = cartridge?.caliber ?? weapon?.caliber;
  const fields = [{ name: 'qty', label: t('Выстрелов, шт'), type: 'number', step: 1, min: 1, required: true }];
  if (cartridge) {
    const guns = state.weapons.filter((w) => !w.archived && (w.caliber === caliber || !caliber));
    const last = recall(`gun:${caliber}`);
    fields.push({
      name: 'weaponId', label: t('Оружие'), type: 'select',
      value: guns.some((w) => w.id === last) ? last : (guns[0]?.id ?? ''),
      options: [...guns.map((w) => [w.id, w.name]), ['', t('— не указывать —')]],
    });
  } else {
    const ammo = state.cartridges.filter((c) => !c.archived && c.caliber === caliber);
    const last = recall(`ammo:${weapon.id}`);
    fields.push({
      name: 'cartridgeId', label: t('Патроны (списать из БК)'), type: 'select',
      value: ammo.some((c) => c.id === last) ? last : (ammo[0]?.id ?? ''),
      options: [...ammo.map((c) => [c.id, t('{name} · ост. {n}', { name: c.name, n: fmt.num(M.cartridgeStock(state, c.id)) })]), ['', t('— не списывать из БК —')]],
    });
  }
  fields.push(
    { name: 'note', label: t('Где / что'), placeholder: t('Полигон, тренировка…') },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() });
  const f = form(fields);
  qtyChips(f.inputs.qty);
  const noteChips = chips([t('Полигон'), t('Тренировка'), t('Пристрелка'), t('Отстрел'), t('Охота')], '', (v) => { f.inputs.note.value = v; });
  f.inputs.note.closest('.field').after(noteChips);
  const title = cartridge ? t('Списать: {name}', { name: cartridge.name }) : t('Настрел: {name}', { name: weapon.name });
  const info = cartridge ? h('p', { class: 'muted' }, t('В наличии: {n} шт', { n: fmt.num(M.cartridgeStock(state, cartridge.id)) })) : null;
  const close = sheet(title, h('div', {}, info, f.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Списать'), save, 'primary shoot')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast(t('Укажите количество')); return; }
    const c = cartridge ?? findCartridge(v.cartridgeId) ?? null;
    const w = weapon ?? findWeapon(v.weaponId) ?? null;
    if (cartridge) remember(`gun:${caliber}`, v.weaponId);
    else remember(`ammo:${weapon.id}`, v.cartridgeId);
    const qty = Math.round(v.qty);
    const stock = c ? M.cartridgeStock(state, c.id) : null;
    close();
    await addMovements([movement({ kind: 'shot', cartridgeId: c?.id ?? null, weaponId: w?.id ?? null, caliber: c?.caliber ?? caliber, qty: -qty, date: v.date || null, note: v.note })],
      stock !== null && qty > stock ? t('−{n} · остаток ушёл в минус', { n: qty }) : `−${fmt.num(qty)}${w ? ` · ${w.name}` : ''}`);
  }
}

function adjustSheet(item, store) {
  const isCartridge = store === 'cartridges';
  const stock = isCartridge ? M.cartridgeStock(state, item.id) : M.componentStock(state, item.id);
  const unit = isCartridge ? 'шт' : (item.unit || 'шт');
  const f = form([
    { name: 'actual', label: t('Фактически в наличии, {unit}', { unit }), type: 'number', step: 'any', required: true, value: stock },
    { name: 'note', label: t('Причина'), placeholder: t('Пересчёт, брак, отдал…') },
  ]);
  const close = sheet(t('Корректировка: {name}', { name: item.name }), h('div', {}, h('p', { class: 'muted' }, t('По учёту: {n} {unit}', { n: fmt.num(stock), unit })), f.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const diff = v.actual - stock;
    close();
    if (!diff) return;
    const key = isCartridge ? 'cartridgeId' : 'componentId';
    await addMovements([movement({ kind: 'adjust', [key]: item.id, caliber: item.caliber ?? null, qty: diff, note: v.note || t('Корректировка') })],
      t('Корректировка {n} {unit}', { n: fmt.signed(diff), unit }));
  }
}

function movementRows(list, limit = 50) {
  if (!list.length) return h('p', { class: 'muted' }, t('Движений пока нет'));
  return h('div', { class: 'rows' }, [...list].sort(M.byDateDesc).slice(0, limit).map(logRow));
}

function cartridgeDetail(c) {
  const moves = state.movements.filter((m) => m.cartridgeId === c.id);
  const bought = moves.filter((m) => m.kind === 'buy');
  const boughtQty = bought.reduce((s, m) => s + m.qty, 0);
  const priced = bought.filter((m) => m.price > 0);
  const avg = priced.length ? priced.reduce((s, m) => s + m.price, 0) / priced.reduce((s, m) => s + m.qty, 0) : null;
  const fired = -moves.filter((m) => m.kind === 'shot').reduce((s, m) => s + m.qty, 0);
  const close = sheet(c.name, h('div', {},
    h('p', { class: 'muted' }, [c.caliber, cartridgeDetails(c)].filter(Boolean).join(' · ')),
    h('div', { class: 'stats' },
      stat(t('остаток'), fmt.num(M.cartridgeStock(state, c.id)), 'accent'),
      stat(t('куплено'), fmt.num(boughtQty)),
      stat(t('выстрелено'), fmt.num(fired)),
      avg ? stat(t('ср. цена'), fmt.money(avg)) : null),
    h('div', { class: 'btn-row' },
      btn(t('+ Купить'), () => { close(); buySheet(c); }, 'buy'),
      btn(t('Списать −'), () => { close(); shootSheet({ cartridge: c }); }, 'shoot')),
    h('h3', {}, t('История')),
    movementRows(moves),
    h('div', { class: 'btn-row' },
      btn(t('Изменить'), () => { close(); cartridgeForm(c); }),
      btn(t('Пересчёт'), () => { close(); adjustSheet(c, 'cartridges'); }),
      btn(moves.length ? t('В архив') : t('Удалить'), () => { close(); removeCartridge(c, moves.length); }, 'danger'))));
}

function removeCartridge(c, hasMoves) {
  if (hasMoves) {
    saveEntity('cartridges', { ...c, archived: true }, t('Перенесено в архив'));
    return;
  }
  confirmSheet(t('Удалить патрон?'), c.name, t('Удалить'), async () => {
    await db.write({ cartridges: { del: [c.id] } });
    await refresh();
  });
}

// ---------- зброя ----------

function progress(label, value, max) {
  if (!(max > 0)) return null;
  const pct = Math.min(100, (value / max) * 100);
  return h('div', { class: 'progress' },
    h('div', { class: 'progress-label small' }, h('span', {}, label), h('span', { class: 'muted' }, `${fmt.num(value)} / ${fmt.num(max)}`)),
    h('div', { class: 'bar' }, h('div', { class: `fill ${pct >= 100 ? 'over' : pct >= 85 ? 'warn' : ''}`, style: `width:${pct}%` })));
}

const SCOPE_KINDS = {
  optic: 'Оптический',
  red: 'Коллиматор',
  holo: 'Голографический',
  thermal: 'Тепловизор',
  night: 'Ночной',
  other: 'Другое',
};

const RIFLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 13.5V10l3-1.5h11V12H5.5z"/><path d="M16 9.5h6M19 8v1.5"/><path d="M8 12l-1 4.5h2.2L10.5 12M12 12l.6 4h2.1L14 12"/><path d="M9 8.5V7h4v1.5"/></svg>';

function scopeLine(s, full = false) {
  const parts = [s.name];
  if (full && s.kind) parts.push(t(SCOPE_KINDS[s.kind]));
  if (s.zero) parts.push(t('пристрелка {n} м', { n: fmt.num(s.zero) }));
  if (full && s.note) parts.push(s.note);
  return h('div', { class: 'scope' }, h('span', { class: 'scope-mark', 'aria-hidden': 'true' }, '⊕'), parts.join(' · '));
}

function scopeList(w, full = false) {
  if (!w.scopes?.length) return null;
  return h('div', { class: `scopes ${full ? '' : 'small'}` }, w.scopes.map((s) => scopeLine(s, full)));
}

function weaponPhotos(weaponId) {
  return state.photos.filter((p) => p.weaponId === weaponId).sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
}

function coverPhoto(w) {
  const list = weaponPhotos(w.id);
  return list.find((p) => p.id === w.coverId) ?? list[0] ?? null;
}

function weaponThumb(w) {
  const cover = coverPhoto(w);
  if (cover) return h('img', { class: 'thumb', src: cover.thumb, alt: '' });
  const ph = h('div', { class: 'thumb placeholder' });
  ph.innerHTML = RIFLE_SVG;
  return ph;
}

function weaponCard(w) {
  const shots = M.weaponShots(state, w);
  const sinceClean = shots - (Number(w.cleanedAt) || 0);
  const card = h('article', { class: 'card tall' },
    h('div', { class: 'swipe-body' },
      weaponThumb(w),
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, w.name),
        h('div', { class: 'muted small' }, [w.caliber, w.serial && `№ ${w.serial}`].filter(Boolean).join(' · ')),
        scopeList(w),
        progress(t('Ресурс ствола'), shots, Number(w.barrelLife)),
        progress(t('После чистки'), sinceClean, Number(w.cleanEvery))),
      h('div', { class: 'big' }, fmt.num(shots), h('div', { class: 'muted small unit' }, t('настрел')))));
  return swipeable(card, {
    leftLabel: t('Настрел −'),
    onLeft: () => shootSheet({ weapon: w }),
    onTap: () => weaponDetail(w),
  });
}

function renderGuns() {
  const active = state.weapons.filter((w) => !w.archived);
  const archived = archiveBlock(state.weapons.filter((w) => w.archived), (w) => saveEntity('weapons', { ...w, archived: false }, t('Возвращено из архива')));
  if (!active.length) return h('div', {}, empty(t('Оружие не добавлено'), t('Нажмите «+», чтобы добавить ствол: калибр, настрел до начала учёта, ресурс ствола и интервал чистки.')), archived);
  const total = active.reduce((s, w) => s + M.weaponShots(state, w), 0);
  $('subtitle').textContent = t('Свайп ← записать стрельбу');
  return h('div', {},
    hero(t('Общий настрел'), fmt.num(total), t('стволов: {n}', { n: active.length })),
    active.sort(byName).map(weaponCard), archived);
}

function weaponForm(w = null) {
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: w?.name, placeholder: 'AR-15 16"' },
    { name: 'caliber', label: t('Калибр'), required: true, value: w?.caliber, list: 'cal-list' },
    { name: 'serial', label: t('Серийный номер'), value: w?.serial },
    { name: 'initialShots', label: t('Настрел до начала учёта'), type: 'number', step: 1, min: 0, value: w?.initialShots ?? 0 },
    { name: 'barrelLife', label: t('Ресурс ствола, выстрелов'), type: 'number', step: 1, min: 0, value: w?.barrelLife },
    { name: 'cleanEvery', label: t('Чистка каждые, выстрелов'), type: 'number', step: 1, min: 0, value: w?.cleanEvery },
    { name: 'note', label: t('Примечание'), value: w?.note, wide: true },
  ]);
  f.el.append(caliberList());
  const scopesBox = h('div', { class: 'items' });
  const addScope = (s = {}) => {
    const name = h('input', { type: 'text', placeholder: t('Модель: Vortex Diamondback 4-12x40'), autocomplete: 'off', class: 'sc-name' });
    name.value = s.name ?? '';
    const kind = h('select', { class: 'sc-kind' },
      Object.entries(SCOPE_KINDS).map(([k, label]) => h('option', { value: k, selected: k === (s.kind ?? 'optic') }, t(label))));
    const zero = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: t('Пристрелка, м'), class: 'sc-zero' });
    zero.value = s.zero ?? '';
    const note = h('input', { type: 'text', placeholder: t('Кронштейн, сетка, серийный №…'), autocomplete: 'off', class: 'sc-note' });
    note.value = s.note ?? '';
    const row = h('div', { class: 'scope-row', dataset: { id: s.id ?? db.uid() } }, name,
      h('button', { type: 'button', class: 'icon-btn sc-del', 'aria-label': t('Убрать прицел'), onclick: () => row.remove() }, '✕'),
      kind, zero, note);
    scopesBox.append(row);
  };
  (w?.scopes ?? []).forEach(addScope);
  const close = sheet(w ? t('Изменить оружие') : t('Новое оружие'), h('div', {},
    f.el, h('h3', {}, t('Прицелы')), scopesBox, btn(t('+ прицел'), () => addScope())), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const scopes = [...scopesBox.querySelectorAll('.scope-row')].map((row) => {
      const zero = Number(String(row.querySelector('.sc-zero').value).replace(',', '.'));
      return {
        id: row.dataset.id,
        name: row.querySelector('.sc-name').value.trim(),
        kind: row.querySelector('.sc-kind').value,
        zero: zero > 0 ? zero : null,
        note: row.querySelector('.sc-note').value.trim(),
      };
    }).filter((s) => s.name);
    close();
    await saveEntity('weapons', { cleanedAt: 0, ...(w ?? { id: db.uid(), created: Date.now() }), ...v, initialShots: v.initialShots ?? 0, scopes }, w ? t('Сохранено') : t('Добавлено: {name}', { name: v.name }));
  }
}

async function addPhotos(weaponId, files) {
  if (!files.length) return;
  toast(t('Обработка фото…'));
  let added = 0;
  for (const file of files) {
    try {
      const { blob, thumb, w, h: height } = await preparePhoto(file);
      const id = db.uid();
      await db.write({
        photos: { put: [{ id, weaponId, created: Date.now(), thumb, w, h: height, driveId: null }] },
        blobs: { put: [{ id, blob }] },
      });
      added += 1;
    } catch (err) {
      toast(err.message);
    }
  }
  await refresh();
  if (added) toast(added > 1 ? t('Добавлено фото: {n}', { n: added }) : t('Фото добавлено'));
}

async function removePhotos(list) {
  if (!list.length) return;
  const ids = list.map((p) => p.id);
  // driveId беремо зі сховища: у state він може ще не встигнути з'явитися після вивантаження
  for (const id of ids) sync.trashPhoto((await db.get('photos', id))?.driveId);
  await db.write({ photos: { del: ids }, blobs: { del: ids } });
  await refresh();
}

/** Галерея в картці зброї: мініатюри, «+ Фото», тап — перегляд на весь екран. */
function gallery(weaponId) {
  const box = h('div', { class: 'gallery' });
  const input = h('input', {
    type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      await addPhotos(weaponId, files);
      fill();
    },
  });
  const open = (index) => viewer(weaponPhotos(weaponId), index, {
    isCover: (p) => coverPhoto(findWeapon(weaponId))?.id === p.id,
    onCover: async (p) => { await saveEntity('weapons', { ...findWeapon(weaponId), coverId: p.id }, t('Главное фото выбрано')); fill(); },
    onDelete: (p) => new Promise((resolve) => {
      confirmSheet(t('Удалить фото?'), t('Фото удалится на всех устройствах.'), t('Удалить'), async () => {
        await removePhotos([p]);
        fill();
        resolve(true);
      });
    }),
  });
  function fill() {
    const w = findWeapon(weaponId);
    if (!w) return;
    const cover = coverPhoto(w);
    box.replaceChildren(
      ...weaponPhotos(weaponId).map((p, index) => h('button', {
        type: 'button', class: `gallery-item ${cover?.id === p.id ? 'cover' : ''}`, 'aria-label': t('Фото'), onclick: () => open(index),
      }, h('img', { src: p.thumb, alt: '' }))),
      h('button', { type: 'button', class: 'gallery-add', onclick: () => input.click() },
        h('span', { class: 'gallery-plus', 'aria-hidden': 'true' }, '+'), h('span', {}, t('Фото'))),
      input);
  }
  fill();
  return box;
}

function weaponDetail(w) {
  const shots = M.weaponShots(state, w);
  const moves = state.movements.filter((m) => m.weaponId === w.id);
  const close = sheet(w.name, h('div', {},
    h('p', { class: 'muted' }, [w.caliber, w.serial && `№ ${w.serial}`, w.note].filter(Boolean).join(' · ')),
    gallery(w.id),
    h('div', { class: 'stats' },
      stat(t('настрел'), fmt.num(shots), 'accent'),
      stat(t('после чистки'), fmt.num(shots - (Number(w.cleanedAt) || 0))),
      w.cleanedDate ? stat(t('чистка'), fmt.date(w.cleanedDate)) : null),
    progress(t('Ресурс ствола'), shots, Number(w.barrelLife)),
    w.scopes?.length ? [h('h3', {}, t('Прицелы')), scopeList(w, true)] : null,
    h('div', { class: 'btn-row' },
      btn(t('Записать стрельбу'), () => { close(); shootSheet({ weapon: w }); }, 'shoot'),
      btn(t('Почистил'), async () => {
        close();
        await saveEntity('weapons', { ...w, cleanedAt: shots, cleanedDate: M.today() }, t('Отмечена чистка'));
      })),
    h('h3', {}, t('Стрельбы')),
    movementRows(moves),
    h('div', { class: 'btn-row' },
      btn(t('Изменить'), () => { close(); weaponForm(findWeapon(w.id) ?? w); }),
      btn(moves.length ? t('В архив') : t('Удалить'), () => {
        close();
        if (moves.length) {
          saveEntity('weapons', { ...w, archived: true }, t('Перенесено в архив'));
          return;
        }
        confirmSheet(t('Удалить оружие?'), w.name, t('Удалить'), async () => {
          await db.write({ weapons: { del: [w.id] } });
          await removePhotos(weaponPhotos(w.id));
          await refresh();
        });
      }, 'danger'))));
}

// ---------- журнал ----------

const KIND_ICON = { buy: '＋', shot: '◎', reload: '⚒', adjust: '±', consume: '−' };

function movementTitle(m) {
  return findCartridge(m.cartridgeId)?.name ?? findComponent(m.componentId)?.name ?? m.caliber ?? '—';
}

function logRow(m) {
  const w = findWeapon(m.weaponId);
  const sub = [t(M.KINDS[m.kind]), w?.name, m.note, m.price ? `${fmt.money(m.price)}` : null]
    .filter(Boolean).join(' · ');
  const unit = m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : '';
  return h('button', { type: 'button', class: `row kind-${m.kind}`, onclick: () => movementDetail(m) },
    h('span', { class: 'row-icon' }, KIND_ICON[m.kind] ?? '•'),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, movementTitle(m)), h('span', { class: 'muted small' }, sub)),
    h('span', { class: `row-qty ${m.qty < 0 ? 'neg' : 'pos'}` }, `${fmt.signed(m.qty)}${unit ? ` ${unit}` : ''}`));
}

/** Ствол у записі стрільби можна змінити — так історичний настріл розноситься по зброї. */
function shotWeaponSelect(m) {
  const guns = state.weapons.filter((w) => w.id === m.weaponId || (!w.archived && (!m.caliber || w.caliber === m.caliber))).sort(byName);
  return h('select', {
    class: 'inline-select', 'aria-label': t('Оружие'),
    onchange: async (e) => {
      await saveEntity('movements', { ...m, weaponId: e.target.value || null }, t('Сохранено'));
    },
  }, h('option', { value: '' }, t('— не указывать —')), guns.map((w) => h('option', { value: w.id, selected: w.id === m.weaponId }, w.name)));
}

function movementDetail(m) {
  const batch = m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
  const w = findWeapon(m.weaponId);
  const close = sheet(t(M.KINDS[m.kind]), h('div', {},
    h('dl', { class: 'kv' },
      h('dt', {}, t('Дата')), h('dd', {}, fmt.date(m.date)),
      h('dt', {}, t('Позиция')), h('dd', {}, movementTitle(m)),
      m.caliber ? [h('dt', {}, t('Калибр')), h('dd', {}, m.caliber)] : null,
      h('dt', {}, t('Количество')), h('dd', {}, fmt.signed(m.qty)),
      m.kind === 'shot'
        ? [h('dt', {}, t('Оружие')), h('dd', {}, shotWeaponSelect(m))]
        : w ? [h('dt', {}, t('Оружие')), h('dd', {}, w.name)] : null,
      m.price ? [h('dt', {}, t('Сумма')), h('dd', {}, fmt.money(m.price))] : null,
      m.note ? [h('dt', {}, t('Примечание')), h('dd', {}, m.note)] : null),
    m.kind === 'shot' && !m.cartridgeId ? h('p', { class: 'muted small' }, t('Запись без списания из БК — учитывается только в настреле.')) : null,
    batch.length > 1 ? [h('h3', {}, t('Списано компонентов')), h('div', { class: 'rows' }, batch.filter((x) => x.id !== m.id).map(logRow))] : null,
    h('div', { class: 'btn-row' },
      btn(t('Удалить запись'), () => {
        close();
        confirmSheet(t('Удалить запись?'), batch.length > 1 ? t('Вместе со связанными движениями ({n}).', { n: batch.length }) : t('Остатки и настрел пересчитаются.'), t('Удалить'), async () => {
          await db.write({ movements: { del: batch.map((x) => x.id) } });
          await refresh();
          toast(t('Запись удалена'), {
            action: t('Вернуть'),
            onAction: async () => { await db.write({ movements: { put: batch } }); await refresh(); },
          });
        });
      }, 'danger'))));
}

let logWeapon = '';

function shotsPanel() {
  const totals = M.shotsByCaliber(state);
  if (!totals.length) return null;
  const hasInitial = state.weapons.some((w) => Number(w.initialShots) > 0);
  return h('section', { class: 'panel' },
    h('h3', {}, t('Настрел по калибрам и оружию')),
    totals.map((row) => h('div', { class: 'shots-cal' },
      h('div', { class: 'shots-head' }, h('span', {}, row.caliber || t('без калибра')), h('b', {}, fmt.num(row.total))),
      row.weapons.map(([id, n]) => h('div', { class: 'shots-gun small' },
        h('span', { class: id ? '' : 'muted' }, id ? (findWeapon(id)?.name ?? t('(удалено)')) : t('ствол не указан')),
        h('span', {}, fmt.num(n)),
        h('span', { class: 'shots-bar', style: `--w:${row.total > 0 ? Math.max(0, (n / row.total) * 100) : 0}%` }))))),
    hasInitial ? h('p', { class: 'muted small' }, t('Только записи журнала. Настрел до начала учёта виден на вкладке «Оружие».')) : null);
}

function renderLog() {
  const filters = [['all', t('Все')], ['shot', t('Стрельба')], ['buy', t('Покупки')], ['reload', t('Снаряжение')], ['adjust', t('Корректировки')]];
  const guns = state.weapons.filter((w) => !w.archived || state.movements.some((m) => m.weaponId === w.id)).sort(byName);
  if (logWeapon && !findWeapon(logWeapon)) logWeapon = '';
  const list = state.movements
    .filter((m) => m.kind !== 'consume' && (logFilter === 'all' || m.kind === logFilter) && (!logWeapon || m.weaponId === logWeapon))
    .sort(M.byDateDesc);
  $('subtitle').textContent = t('{n} записей', { n: list.length });
  const gunSelect = guns.length ? h('select', {
    class: 'log-gun', 'aria-label': t('Оружие'),
    onchange: (e) => { logWeapon = e.target.value; render(); },
  }, h('option', { value: '' }, t('Всё оружие')), guns.map((w) => h('option', { value: w.id, selected: w.id === logWeapon }, w.name))) : null;
  return h('div', {},
    logWeapon
      ? hero(findWeapon(logWeapon).name, fmt.num(M.weaponShots(state, findWeapon(logWeapon))), t('настрел всего, вместе с настрелом до начала учёта'))
      : shotsPanel(),
    chips(filters, logFilter, (v) => { logFilter = v; render(); }),
    gunSelect,
    list.length
      ? groupBy(list, (m) => m.date ?? '').sort((a, b) => b[0].localeCompare(a[0])).map(([date, rows]) => h('section', { class: 'group' },
        h('h2', { class: 'group-head' }, fmt.date(date)), h('div', { class: 'rows' }, rows.map(logRow))))
      : empty(t('Записей нет'), t('Свайпните патрон в разделе БК, чтобы купить или списать.')));
}

// ---------- рецепти та склад компонентів ----------

let reloadPane = recall('shooting-log:pane') === 'stock' ? 'stock' : 'recipes';

function componentLevel(c, runway) {
  if (c.kind === 'case' || !runway.length) return '';
  const least = runway[0].rounds;
  if (least === 0) return 'out';
  return least < LOW_ROUNDS ? 'low' : '';
}

function componentCard(c) {
  const stock = M.componentStock(state, c.id);
  const price = M.unitPrice(c);
  const unit = c.unit || 'шт';
  const runway = M.componentRunway(state, c);
  const card = h('article', { class: `card level-${componentLevel(c, runway) || 'ok'}` },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'muted small' }, [
          price ? t('{price} за {unit}', { price: fmt.money(price), unit }) : t('цена не указана'),
          c.packQty ? t('уп. {qty} {unit} = {price}', { qty: fmt.num(c.packQty), unit, price: fmt.money(c.packPrice) }) : null,
          stock > 0 && price ? t('на сумму {sum}', { sum: fmt.money(stock * price) }) : null].filter(Boolean).join(' · ')),
        runway.length
          ? h('div', { class: 'runway' }, runway.map((r) => h('div', { class: 'runway-row small' },
            h('span', { class: 'runway-name' }, r.recipe.name),
            h('b', { class: r.rounds === 0 ? 'neg' : r.rounds < LOW_ROUNDS && c.kind !== 'case' ? 'warn-text' : '' },
              t('хватит на {n} шт', { n: fmt.num(r.rounds) })))))
          : h('div', { class: 'muted small' }, t('не используется в рецептах'))),
      h('div', { class: `big ${stock < 0 ? 'neg' : stock === 0 ? 'zero' : ''}` }, fmt.num(stock), h('div', { class: 'muted small unit' }, unit))));
  return swipeable(card, {
    rightLabel: t('+ Купить'), leftLabel: t('Пересчёт'),
    onRight: () => buyComponentSheet(c),
    onLeft: () => adjustSheet(c, 'components'),
    onTap: () => componentForm(c),
  });
}

function recipeCard(r) {
  const cost = M.recipeCost(state, r);
  const lines = M.recipeLines(state, r);
  const enough = M.recipeEnough(state, r);
  const neck = M.recipeBottleneck(state, r);
  const card = h('article', { class: 'card' },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, r.name),
        h('div', { class: 'muted small' }, [r.caliber,
          lines.some((l) => l.noPrice && l.component?.kind !== 'case') ? t('есть компоненты без цены') : null].filter(Boolean).join(' · ')),
        h('div', { class: 'small enough' },
          h('b', { class: enough === 0 ? 'neg' : enough < LOW_ROUNDS ? 'warn-text' : 'pos' }, t('из запасов: {n} шт', { n: fmt.num(enough) })),
          neck ? h('span', { class: 'muted' }, ` · ${t('упирается в «{name}»', { name: neck.name })}`) : null)),
      h('div', { class: 'big money' }, fmt.money(cost), h('div', { class: 'muted small unit' }, t('за шт')))));
  return swipeable(card, {
    rightLabel: t('Снарядить'),
    onRight: () => reloadSheet(r),
    onTap: () => recipeDetail(r),
  });
}

function recipesPane() {
  $('subtitle').textContent = t('Свайп → снарядить');
  if (!state.recipes.length) return empty(t('Рецептов нет'), t('Сначала добавьте компоненты на складе, затем рецепт.'));
  return h('div', {}, [...state.recipes].sort(byName).map(recipeCard));
}

function stockPane() {
  $('subtitle').textContent = t('Свайп → купить, ← пересчёт');
  if (!state.components.length) return empty(t('Склад пуст'), t('Нажмите «+», чтобы добавить компоненты: пули, порох, капсюли, гильзы, дробь, пыжи.'));
  const levels = state.components.map((c) => componentLevel(c, M.componentRunway(state, c)));
  const out = levels.filter((l) => l === 'out').length;
  const low = levels.filter((l) => l === 'low').length;
  const kinds = Object.keys(M.COMPONENT_KINDS);
  const groups = kinds.map((kind) => [kind, state.components.filter((c) => (kinds.includes(c.kind) ? c.kind : 'other') === kind).sort(byName)])
    .filter(([, list]) => list.length);
  return h('div', {},
    hero(t('Склад компонентов на сумму'), fmt.money(M.stockValue(state)),
      [t('позиций: {n}', { n: state.components.length }),
        out ? h('span', { class: 'neg' }, ` · ${t('нет в наличии: {n}', { n: out })}`) : null,
        low ? h('span', { class: 'warn-text' }, ` · ${t('заканчивается: {n}', { n: low })}`) : null]),
    groups.map(([kind, list]) => fold(`stock:${kind}`,
      [h('span', { class: 'fold-title' }, t(M.COMPONENT_KINDS[kind])), h('span', { class: 'fold-meta' }, t('{n} поз.', { n: list.length }))],
      list.map(componentCard))));
}

function renderReload() {
  const seg = chips([['recipes', t('Рецепты')], ['stock', t('Склад')]], reloadPane, (v) => {
    reloadPane = v;
    remember('shooting-log:pane', v);
    render();
  });
  seg.classList.add('segmented');
  return h('div', {}, seg, reloadPane === 'stock' ? stockPane() : recipesPane());
}

function componentForm(c = null) {
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: c?.name, placeholder: 'Sierra MatchKing 69gr' },
    { name: 'kind', label: t('Тип'), type: 'select', value: c?.kind ?? 'bullet', options: Object.entries(M.COMPONENT_KINDS).map(([k, label]) => [k, t(label)]) },
    { name: 'unit', label: t('Единица учёта'), type: 'select', value: c?.unit ?? 'шт', options: [['шт', t('штуки')], ['г', t('граммы')]] },
    { name: 'packQty', label: t('В упаковке (шт или г)'), type: 'number', step: 'any', value: c?.packQty },
    { name: 'packPrice', label: t('Цена упаковки'), type: 'number', step: 'any', value: c?.packPrice },
    { name: 'note', label: t('Примечание'), value: c?.note, wide: true },
  ]);
  const used = c && state.movements.some((m) => m.componentId === c.id);
  const inRecipe = c && state.recipes.some((r) => r.items.some((i) => i.componentId === c.id));
  const runway = c ? M.componentRunway(state, c) : [];
  const close = sheet(c ? c.name : t('Новый компонент'), h('div', {},
    c ? h('div', { class: 'stats' },
      stat(t('остаток, {unit}', { unit: c.unit || 'шт' }), fmt.num(M.componentStock(state, c.id)), 'accent'),
      runway.map((r) => stat(r.recipe.name, t('{n} шт', { n: fmt.num(r.rounds) })))) : null,
    c ? h('div', { class: 'btn-row' },
      btn(t('+ Купить'), () => { close(); buyComponentSheet(c); }, 'buy'),
      btn(t('Пересчёт'), () => { close(); adjustSheet(c, 'components'); })) : null,
    f.el,
    c ? h('div', { class: 'btn-row' }, btn(t('Удалить'), () => {
      if (used || inRecipe) { toast(inRecipe ? t('Компонент используется в рецепте') : t('По компоненту есть движения')); return; }
      close();
      confirmSheet(t('Удалить компонент?'), c.name, t('Удалить'), async () => { await db.write({ components: { del: [c.id] } }); await refresh(); });
    }, 'danger')) : null), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    close();
    await saveEntity('components', { ...(c ?? { id: db.uid(), created: Date.now() }), ...v }, c ? t('Сохранено') : t('Добавлено: {name}', { name: v.name }));
  }
}

function buyComponentSheet(c) {
  const unit = c.unit || 'шт';
  const f = form([
    { name: 'packs', label: t('Упаковок'), type: 'number', step: 'any', min: 0, value: c.packQty ? 1 : '' },
    { name: 'qty', label: t('Количество, {unit}', { unit }), type: 'number', step: 'any', required: true, value: c.packQty ?? '' },
    { name: 'price', label: t('Сумма'), type: 'number', step: 'any', value: c.packPrice ?? '' },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() },
    { name: 'note', label: t('Примечание') },
  ]);
  f.inputs.packs.addEventListener('input', () => {
    const packs = Number(String(f.inputs.packs.value).replace(',', '.')) || 0;
    if (c.packQty) f.inputs.qty.value = +(packs * c.packQty).toFixed(3);
    if (c.packPrice) f.inputs.price.value = +(packs * c.packPrice).toFixed(2);
  });
  const close = sheet(t('Купить: {name}', { name: c.name }), f.el, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Добавить'), save, 'primary buy')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast(t('Укажите количество')); return; }
    close();
    await addMovements([movement({ kind: 'buy', componentId: c.id, qty: v.qty, price: v.price, date: v.date || null, note: v.note })],
      `+${fmt.num(v.qty)} ${unit} · ${c.name}`);
  }
}

function recipeForm(r = null) {
  if (!state.components.length) { toast(t('Сначала добавьте компоненты')); return; }
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: r?.name, placeholder: 'SMK 69gr + CFE 223' },
    { name: 'caliber', label: t('Калибр'), required: true, value: r?.caliber, list: 'cal-list' },
    { name: 'note', label: t('Примечание'), value: r?.note, wide: true },
  ]);
  f.el.append(caliberList());
  const options = [...state.components].sort(byName).map((c) => [c.id, `${c.name} (${c.unit || 'шт'})`]);
  const itemsBox = h('div', { class: 'items' });
  const addItem = (item = {}) => {
    const select = h('select', {}, options.map(([id, label]) => h('option', { value: id, selected: id === item.componentId }, label)));
    const per = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: t('на 1 шт') });
    per.value = item.perRound ?? 1;
    const row = h('div', { class: 'item-row' }, select, per, h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Убрать'), onclick: () => row.remove() }, '✕'));
    itemsBox.append(row);
  };
  (r?.items ?? [{}]).forEach(addItem);
  const close = sheet(r ? t('Изменить рецепт') : t('Новый рецепт'), h('div', {},
    f.el, h('h3', {}, t('Компоненты и расход на 1 патрон')), itemsBox,
    btn(t('+ компонент'), () => addItem()),
    r ? h('div', { class: 'btn-row' }, btn(t('Удалить рецепт'), () => {
      close();
      confirmSheet(t('Удалить рецепт?'), t('Снаряжённые патроны и журнал останутся.'), t('Удалить'), async () => { await db.write({ recipes: { del: [r.id] } }); await refresh(); });
    }, 'danger')) : null), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const items = [...itemsBox.querySelectorAll('.item-row')].map((row) => ({
      componentId: row.querySelector('select').value,
      perRound: Number(String(row.querySelector('input').value).replace(',', '.')) || 0,
    })).filter((i) => i.componentId && i.perRound > 0);
    if (!items.length) { toast(t('Добавьте хотя бы один компонент')); return; }
    close();
    await saveEntity('recipes', { ...(r ?? { id: db.uid(), created: Date.now() }), ...f.values(), items }, t('Рецепт сохранён'));
  }
}

function recipeDetail(r) {
  const lines = M.recipeLines(state, r);
  const close = sheet(r.name, h('div', {},
    h('p', { class: 'muted' }, [r.caliber, r.note].filter(Boolean).join(' · ')),
    h('div', { class: 'stats' },
      stat(t('себестоимость'), fmt.money(M.recipeCost(state, r)), 'accent'),
      stat(t('из запасов'), t('{n} шт', { n: fmt.num(M.recipeEnough(state, r)) }))),
    h('table', { class: 'lines' },
      h('thead', {}, h('tr', {}, h('th', {}, t('Компонент')), h('th', {}, t('на 1')), h('th', {}, t('цена')), h('th', {}, t('хватит')))),
      h('tbody', {}, lines.map((l) => h('tr', { class: l.noPrice && l.component?.kind !== 'case' ? 'warn' : '' },
        h('td', {}, l.component?.name ?? t('(удалён)')),
        h('td', {}, `${fmt.num(l.perRound)} ${l.component?.unit || 'шт'}`),
        h('td', {}, l.noPrice ? '—' : fmt.money(l.cost)),
        h('td', {}, l.fromStock === null ? '—' : fmt.num(Math.max(0, l.fromStock))))))),
    h('p', { class: 'muted small' }, t('«Хватит» — на сколько патронов хватит остатка на складе. Гильзы при снаряжении не списываются — они многоразовые.')),
    h('div', { class: 'btn-row' },
      btn(t('Снарядить'), () => { close(); reloadSheet(r); }, 'primary'),
      btn(t('Изменить'), () => { close(); recipeForm(r); }))));
}

function reloadSheet(r) {
  const enough = M.recipeEnough(state, r);
  const f = form([
    { name: 'qty', label: t('Сколько снарядил, шт'), type: 'number', step: 1, min: 1, required: true },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() },
    { name: 'note', label: t('Примечание') },
  ]);
  qtyChips(f.inputs.qty, [20, 50, 100]);
  const close = sheet(t('Снарядить: {name}', { name: r.name }), h('div', {},
    h('p', { class: 'muted' }, t('Компонентов хватит на {n} шт · себестоимость {cost}', { n: fmt.num(enough), cost: fmt.money(M.recipeCost(state, r)) })), f.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Снарядить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const qty = Math.round(v.qty);
    if (!(qty > 0)) { toast(t('Укажите количество')); return; }
    let cartridge = state.cartridges.find((c) => c.recipeId === r.id && !c.archived);
    const extra = {};
    if (!cartridge) {
      cartridge = { id: db.uid(), created: Date.now(), name: r.name, caliber: r.caliber, recipeId: r.id, weightUnit: 'gr' };
      extra.cartridges = { put: [cartridge] };
    }
    const batch = db.uid();
    const common = { batch, date: v.date || null, note: v.note };
    const moves = [movement({ ...common, kind: 'reload', cartridgeId: cartridge.id, caliber: r.caliber, recipeId: r.id, qty, price: +(M.recipeCost(state, r) * qty).toFixed(2) })];
    for (const line of M.recipeLines(state, r)) {
      if (!line.component || line.component.kind === 'case') continue;
      moves.push(movement({ ...common, kind: 'consume', componentId: line.component.id, recipeId: r.id, qty: -+(line.perRound * qty).toFixed(3) }));
    }
    close();
    await addMovements(moves, t('Снаряжено {n} · {name}', { n: qty, name: r.name }) + (qty > enough ? t(' (компоненты ушли в минус)') : ''), extra);
  }
}

// ---------- налаштування ----------

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportData(share) {
  const payload = JSON.stringify({ app: 'shooting-log', format: 1, exportedAt: new Date().toISOString(), data: state }, null, 1);
  const name = `shooting-log-${M.today()}.json`;
  if (share) {
    const file = new File([payload], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  download(name, payload);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch { toast(t('Файл не похож на JSON')); return; }
    const data = parsed?.data;
    if (parsed?.app !== 'shooting-log' || !data || !db.STORES.every((s) => !data[s] || Array.isArray(data[s]))) {
      toast(t('Это не резервная копия Shooting Log'));
      return;
    }
    const count = db.STORES.reduce((s, k) => s + (data[k]?.length ?? 0), 0);
    const changes = Object.fromEntries(db.STORES.map((s) => [s, { put: (data[s] ?? []).filter((x) => x && x.id) }]));
    const close = sheet(t('Импорт'), h('div', {},
      h('p', {}, t('В файле {n} записей.', { n: count })),
      h('p', { class: 'muted small' }, t('«Объединить» — добавит новые и обновит совпадающие записи. «Заменить всё» — сначала удалит текущие данные.')),
      sync.enabled() ? h('p', { class: 'muted small' }, t('Включена синхронизация: «Заменить всё» очистит только это устройство, данные с Google Диска потом вернутся.')) : null), {
      actions: [
        btn(t('Отмена'), () => close()),
        btn(t('Объединить'), async () => { close(); await db.write(changes); await refresh(); toast(t('Импортировано')); }),
        btn(t('Заменить всё'), () => {
          close();
          confirmSheet(t('Заменить все данные?'), t('Текущие данные будут удалены. Сначала сделайте экспорт, если они нужны.'), t('Заменить'), async () => {
            await db.clearAll(); await db.write(changes); await refresh(); toast(t('Данные заменены'));
          });
        }, 'danger'),
      ],
    });
  };
  reader.readAsText(file);
}

function syncTime(ms) {
  if (!ms) return t('ещё не было');
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? t('сегодня в {time}', { time: fmt.time(ms) })
    : `${fmt.date(new Date(ms - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10))} ${fmt.time(ms)}`;
}

function connectGoogle() {
  sync.connect().then(() => toast(t('Google Диск подключён'))).catch((err) => toast(err.message));
}

function syncPanel() {
  const s = sync.status;
  const panel = h('section', { class: 'panel' }, h('h3', {}, t('Синхронизация · Google Диск')));
  if (!sync.configured()) {
    panel.append(h('p', { class: 'muted small' }, t('Не настроена: в js/config.js не указан Google Client ID.')));
  } else if (!sync.enabled()) {
    panel.append(
      h('p', { class: 'muted small' }, t('Данные будут храниться в файле shooting-log.json на вашем Google Диске и совпадать на телефоне и компьютере. Приложение видит только свои файлы, остальной Диск ему недоступен.')),
      h('div', { class: 'btn-row' }, btn(t('Подключить Google Диск'), connectGoogle, 'primary')));
  } else {
    panel.append(
      h('dl', { class: 'kv' },
        h('dt', {}, t('Аккаунт')), h('dd', {}, s.email ?? '—'),
        h('dt', {}, t('Последняя')), h('dd', {}, syncTime(s.lastSync)),
        s.message ? [h('dt', {}, t('Статус')), h('dd', {}, s.message)] : null),
      h('div', { class: 'btn-row' },
        s.state === 'auth' ? btn(t('Войти в Google'), connectGoogle, 'primary') : btn(t('Синхронизировать'), () => sync.syncNow(), 'primary'),
        btn(t('Отключить'), () => confirmSheet(t('Отключить синхронизацию?'), t('Данные останутся и на устройстве, и на Google Диске, просто перестанут обмениваться.'), t('Отключить'), () => sync.disconnect()))));
  }
  return panel;
}

const CHIP = {
  idle: () => `☁ ✓ ${fmt.time(sync.status.lastSync)}`,
  syncing: () => '☁ …',
  offline: () => t('☁ офлайн'),
  auth: () => t('☁ войти'),
  error: () => t('☁ ошибка'),
};

function renderSyncChip(s) {
  const chip = $('sync-chip');
  chip.hidden = !CHIP[s.state];
  if (CHIP[s.state]) {
    chip.textContent = CHIP[s.state]();
    chip.className = `sync-chip ${s.state}`;
    chip.title = s.message || t('Синхронизация с Google Диском');
  }
  if (tab === 'settings') render();
}

function onSyncChip() {
  const { state: st, message } = sync.status;
  if (st === 'auth') connectGoogle();
  else if (st === 'offline') toast(t('Нет интернета — синхронизация произойдёт, когда появится связь'));
  else if (st === 'error') { toast(message || t('Ошибка синхронизации')); sync.syncNow(); } else sync.syncNow();
}

function switchLang(code) {
  setLang(code);
  applyStatic();
  renderSyncChip(sync.status);
  render();
}

function renderSettings() {
  $('subtitle').textContent = t('версия {v}', { v: self.APP_VERSION });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; } });
  const persisted = h('span', { class: 'muted' }, '…');
  navigator.storage?.persisted?.().then((p) => { persisted.textContent = p ? t('защищено от автоочистки') : t('браузер может очистить при нехватке места'); })
    .catch(() => { persisted.textContent = t('неизвестно'); });
  const langChips = chips(Object.entries(LANGS), lang(), switchLang);
  langChips.classList.add('segmented');
  return h('div', {},
    h('section', { class: 'panel' }, h('h3', {}, 'Язык · Мова'), langChips),
    syncPanel(),
    h('section', { class: 'panel' },
      h('h3', {}, t('Резервная копия')),
      h('p', { class: 'muted small' }, sync.enabled()
        ? t('Основная копия — на Google Диске. Файл ниже — дополнительный снимок на всякий случай.')
        : t('Без синхронизации данные хранятся только на этом устройстве. Делайте экспорт после каждой стрельбы — например, «Поделиться» → Google Диск или Telegram «Избранное».')),
      h('p', { class: 'muted small' }, t('В файл копии попадают только миниатюры фото; сами фото хранятся на Google Диске.')),
      h('div', { class: 'btn-row' },
        btn(t('Поделиться копией'), () => exportData(true), 'primary'),
        btn(t('Скачать файл'), () => exportData(false)),
        btn(t('Импорт'), () => fileInput.click())),
      fileInput),
    h('section', { class: 'panel' },
      h('h3', {}, t('Хранилище')),
      h('p', {}, persisted),
      h('p', { class: 'muted small' }, t('Оружие: {w} · фото: {p} · патроны: {c} · компоненты: {k} · рецепты: {r} · движения: {m}', {
        w: state.weapons.length, p: state.photos.length, c: state.cartridges.length, k: state.components.length, r: state.recipes.length, m: state.movements.length,
      }))),
    h('section', { class: 'panel' },
      h('h3', {}, t('Установка на телефон')),
      h('p', { class: 'muted small' }, t('Chrome → меню ⋮ → «Добавить на главный экран» / «Установить приложение». После установки работает без интернета.'))),
    h('section', { class: 'panel' },
      h('h3', {}, t('Опасная зона')),
      btn(t('Удалить данные с устройства'), () => confirmSheet(t('Удалить данные с устройства?'), sync.enabled()
        ? t('Данные будут удалены с этого устройства. Копия на Google Диске останется и вернётся при следующей синхронизации (кроме фото, которые ещё не успели выгрузиться) — чтобы этого не было, сначала отключите синхронизацию.')
        : t('Оружие, БК, журнал, рецепты и фото будут удалены с этого устройства. Отменить нельзя.'), t('Удалить'), async () => {
        await db.clearAll(); await refresh(); toast(t('Данные удалены'));
      }), 'danger')));
}

// ---------- навігація ----------

function addMenu() {
  const close = sheet(t('Добавить'), h('div', { class: 'btn-col' },
    btn(t('Новый компонент на склад'), () => { close(); componentForm(); }),
    btn(t('Новый рецепт'), () => { close(); recipeForm(); })));
}

const VIEWS = {
  ammo: { title: 'БК', render: renderAmmo, fab: () => cartridgeForm() },
  guns: { title: 'Оружие', render: renderGuns, fab: () => weaponForm() },
  log: { title: 'Журнал', render: renderLog },
  reload: { title: 'Рецепты', render: renderReload, fab: addMenu },
  settings: { title: 'Ещё', render: renderSettings },
};

function render() {
  const view = VIEWS[tab];
  $('title').textContent = t(view.title);
  $('subtitle').textContent = '';
  $('view').replaceChildren(view.render());
  $('fab').hidden = !view.fab;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

function route() {
  const next = location.hash.slice(1);
  tab = VIEWS[next] ? next : 'ammo';
  render();
  window.scrollTo(0, 0);
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  const offer = (worker) => {
    $('update').hidden = false;
    $('update-btn').onclick = () => worker.postMessage('skipWaiting');
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((err) => console.warn('SW registration failed', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

applyStatic();
$('fab').addEventListener('click', () => VIEWS[tab].fab?.());
$('sync-chip').addEventListener('click', onSyncChip);
window.addEventListener('hashchange', route);
window.addEventListener('sync-applied', refresh);
registerWorker();
navigator.storage?.persist?.().catch(() => {});
state = await db.loadAll();
route();
sync.onStatus(renderSyncChip);
sync.preload();
sync.syncNow();
