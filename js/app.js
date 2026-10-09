import * as db from './db.js';
import * as M from './model.js';
import { h, fmt, sheet, toast, form, chips, swipeable, confirmSheet } from './ui.js';

let state = { weapons: [], cartridges: [], components: [], recipes: [], movements: [] };
let tab = 'ammo';
let logFilter = 'all';

const $ = (id) => document.getElementById(id);

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
    action: 'Отменить',
    onAction: async () => {
      await db.write({ movements: { del: list.map((m) => m.id) } });
      await refresh();
      toast('Отменено');
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
  return [...map].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
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
  if (bad) { toast(`Заполните поле «${bad.label}»`); f.inputs[bad.name]?.focus(); }
  return Boolean(bad);
}

function archiveBlock(items, label, restore) {
  if (!items.length) return null;
  return h('details', { class: 'archive' },
    h('summary', {}, `${label} (${items.length})`),
    items.map((x) => h('div', { class: 'archive-row' },
      h('span', {}, x.name), btn('Вернуть', () => restore(x)))));
}

// ---------- БК ----------

function cartridgeDetails(c) {
  const parts = [];
  if (c.bulletWeight) parts.push(`${fmt.num(c.bulletWeight)} ${c.weightUnit || 'gr'}`);
  const recipe = c.recipeId && findRecipe(c.recipeId);
  if (recipe) parts.push(`самоснаряд · ${fmt.money(M.recipeCost(state, recipe))} за шт`);
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
      h('div', { class: `big ${stock < 0 ? 'neg' : ''}` }, fmt.num(stock))));
  return swipeable(card, {
    rightLabel: '+ Купить', leftLabel: 'Списать −',
    onRight: () => buySheet(c),
    onLeft: () => shootSheet({ cartridge: c }),
    onTap: () => cartridgeDetail(c),
  });
}

function renderAmmo() {
  const active = state.cartridges.filter((c) => !c.archived);
  const total = active.reduce((s, c) => s + M.cartridgeStock(state, c.id), 0);
  $('subtitle').textContent = active.length ? `Всего ${fmt.num(total)} шт · свайп → купить, ← списать` : '';
  if (!active.length) {
    return h('div', {}, empty('Пока нет патронов', 'Нажмите «+», чтобы добавить позицию, или импортируйте данные в разделе «Ещё».'),
      archiveBlock(state.cartridges.filter((c) => c.archived), 'Архив', restoreCartridge));
  }
  return h('div', {},
    groupBy(active, (c) => c.caliber || 'Без калибра').map(([caliber, list]) => h('section', { class: 'group' },
      h('h2', { class: 'group-head' }, h('span', {}, caliber),
        h('span', { class: 'muted' }, `${fmt.num(list.reduce((s, c) => s + M.cartridgeStock(state, c.id), 0))} шт`)),
      list.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(cartridgeCard))),
    archiveBlock(state.cartridges.filter((c) => c.archived), 'Архив', restoreCartridge));
}

function restoreCartridge(c) {
  saveEntity('cartridges', { ...c, archived: false }, 'Возвращено из архива');
}

function cartridgeForm(c = null) {
  const f = form([
    { name: 'name', label: 'Название', required: true, value: c?.name, placeholder: 'GGG 147 FMJ' },
    { name: 'caliber', label: 'Калибр', required: true, value: c?.caliber, list: 'cal-list' },
    { name: 'bulletWeight', label: 'Вес пули / снаряда', type: 'number', step: 'any', value: c?.bulletWeight },
    { name: 'weightUnit', label: 'Ед.', type: 'select', value: c?.weightUnit ?? 'gr', options: [['gr', 'гран (gr)'], ['г', 'грамм (г)']] },
    ...(c ? [] : [{ name: 'initial', label: 'Сейчас в наличии, шт', type: 'number', step: 1, min: 0 }]),
    { name: 'note', label: 'Примечание', value: c?.note, wide: true },
  ]);
  f.el.append(caliberList());
  const close = sheet(c ? 'Изменить патрон' : 'Новый патрон', f.el, {
    actions: [btn('Отмена', () => close()), btn('Сохранить', save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const obj = { ...(c ?? { id: db.uid(), created: Date.now() }), name: v.name, caliber: v.caliber, bulletWeight: v.bulletWeight, weightUnit: v.weightUnit, note: v.note };
    close();
    if (!c && v.initial > 0) {
      await addMovements([movement({ kind: 'adjust', cartridgeId: obj.id, caliber: obj.caliber, qty: Math.round(v.initial), note: 'Начальный остаток' })],
        `Добавлено: ${obj.name}`, { cartridges: { put: [obj] } });
    } else {
      await saveEntity('cartridges', obj, c ? 'Сохранено' : `Добавлено: ${obj.name}`);
    }
  }
}

function buySheet(c) {
  const f = form([
    { name: 'qty', label: 'Количество, шт', type: 'number', step: 1, min: 1, required: true },
    { name: 'price', label: 'Сумма покупки (необязательно)', type: 'number', step: 'any' },
    { name: 'date', label: 'Дата', type: 'date', value: M.today() },
    { name: 'note', label: 'Где купил / примечание' },
  ]);
  qtyChips(f.inputs.qty);
  const close = sheet(`Купить: ${c.name}`, f.el, {
    actions: [btn('Отмена', () => close()), btn('Добавить', save, 'primary buy')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast('Укажите количество'); return; }
    close();
    await addMovements([movement({ kind: 'buy', cartridgeId: c.id, caliber: c.caliber, qty: Math.round(v.qty), price: v.price, date: v.date || null, note: v.note })],
      `+${fmt.num(v.qty)} · ${c.name}`);
  }
}

/** Списання на стрільбі: від патрона (обираємо ствол) або від ствола (обираємо патрон). */
function shootSheet({ cartridge = null, weapon = null }) {
  const caliber = cartridge?.caliber ?? weapon?.caliber;
  const fields = [{ name: 'qty', label: 'Выстрелов, шт', type: 'number', step: 1, min: 1, required: true }];
  if (cartridge) {
    const guns = state.weapons.filter((w) => !w.archived && (w.caliber === caliber || !caliber));
    const last = recall(`gun:${caliber}`);
    fields.push({
      name: 'weaponId', label: 'Оружие', type: 'select',
      value: guns.some((w) => w.id === last) ? last : (guns[0]?.id ?? ''),
      options: [...guns.map((w) => [w.id, w.name]), ['', '— не указывать —']],
    });
  } else {
    const ammo = state.cartridges.filter((c) => !c.archived && c.caliber === caliber);
    const last = recall(`ammo:${weapon.id}`);
    fields.push({
      name: 'cartridgeId', label: 'Патроны (списать из БК)', type: 'select',
      value: ammo.some((c) => c.id === last) ? last : (ammo[0]?.id ?? ''),
      options: [...ammo.map((c) => [c.id, `${c.name} · ост. ${fmt.num(M.cartridgeStock(state, c.id))}`]), ['', '— не списывать из БК —']],
    });
  }
  fields.push(
    { name: 'note', label: 'Где / что', placeholder: 'Полигон, тренировка…' },
    { name: 'date', label: 'Дата', type: 'date', value: M.today() });
  const f = form(fields);
  qtyChips(f.inputs.qty);
  const noteChips = chips(['Полигон', 'Тренировка', 'Пристрелка', 'Отстрел', 'Охота'], '', (v) => { f.inputs.note.value = v; });
  f.inputs.note.closest('.field').after(noteChips);
  const title = cartridge ? `Списать: ${cartridge.name}` : `Настрел: ${weapon.name}`;
  const info = cartridge ? h('p', { class: 'muted' }, `В наличии: ${fmt.num(M.cartridgeStock(state, cartridge.id))} шт`) : null;
  const close = sheet(title, h('div', {}, info, f.el), {
    actions: [btn('Отмена', () => close()), btn('Списать', save, 'primary shoot')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast('Укажите количество'); return; }
    const c = cartridge ?? findCartridge(v.cartridgeId) ?? null;
    const w = weapon ?? findWeapon(v.weaponId) ?? null;
    if (cartridge) remember(`gun:${caliber}`, v.weaponId);
    else remember(`ammo:${weapon.id}`, v.cartridgeId);
    const qty = Math.round(v.qty);
    const stock = c ? M.cartridgeStock(state, c.id) : null;
    close();
    await addMovements([movement({ kind: 'shot', cartridgeId: c?.id ?? null, weaponId: w?.id ?? null, caliber: c?.caliber ?? caliber, qty: -qty, date: v.date || null, note: v.note })],
      stock !== null && qty > stock ? `−${qty} · остаток ушёл в минус` : `−${fmt.num(qty)}${w ? ` · ${w.name}` : ''}`);
  }
}

function adjustSheet(item, store) {
  const isCartridge = store === 'cartridges';
  const stock = isCartridge ? M.cartridgeStock(state, item.id) : M.componentStock(state, item.id);
  const unit = isCartridge ? 'шт' : (item.unit || 'шт');
  const f = form([
    { name: 'actual', label: `Фактически в наличии, ${unit}`, type: 'number', step: 'any', required: true, value: stock },
    { name: 'note', label: 'Причина', placeholder: 'Пересчёт, брак, отдал…' },
  ]);
  const close = sheet(`Корректировка: ${item.name}`, h('div', {}, h('p', { class: 'muted' }, `По учёту: ${fmt.num(stock)} ${unit}`), f.el), {
    actions: [btn('Отмена', () => close()), btn('Сохранить', save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const diff = v.actual - stock;
    close();
    if (!diff) return;
    const key = isCartridge ? 'cartridgeId' : 'componentId';
    await addMovements([movement({ kind: 'adjust', [key]: item.id, caliber: item.caliber ?? null, qty: diff, note: v.note || 'Корректировка' })],
      `Корректировка ${fmt.signed(diff)} ${unit}`);
  }
}

function movementRows(list, limit = 50) {
  if (!list.length) return h('p', { class: 'muted' }, 'Движений пока нет');
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
      stat('остаток', fmt.num(M.cartridgeStock(state, c.id))),
      stat('куплено', fmt.num(boughtQty)),
      stat('выстрелено', fmt.num(fired)),
      avg ? stat('ср. цена', fmt.money(avg)) : null),
    h('div', { class: 'btn-row' },
      btn('+ Купить', () => { close(); buySheet(c); }, 'buy'),
      btn('Списать −', () => { close(); shootSheet({ cartridge: c }); }, 'shoot')),
    h('h3', {}, 'История'),
    movementRows(moves),
    h('div', { class: 'btn-row' },
      btn('Изменить', () => { close(); cartridgeForm(c); }),
      btn('Пересчёт', () => { close(); adjustSheet(c, 'cartridges'); }),
      btn(moves.length ? 'В архив' : 'Удалить', () => { close(); removeCartridge(c, moves.length); }, 'danger'))));
}

function removeCartridge(c, hasMoves) {
  if (hasMoves) {
    saveEntity('cartridges', { ...c, archived: true }, 'Перенесено в архив');
    return;
  }
  confirmSheet('Удалить патрон?', c.name, 'Удалить', async () => {
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

function weaponCard(w) {
  const shots = M.weaponShots(state, w);
  const sinceClean = shots - (Number(w.cleanedAt) || 0);
  const card = h('article', { class: 'card tall' },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, w.name),
        h('div', { class: 'muted small' }, [w.caliber, w.serial && `№ ${w.serial}`].filter(Boolean).join(' · ')),
        progress('Ресурс ствола', shots, Number(w.barrelLife)),
        progress('После чистки', sinceClean, Number(w.cleanEvery))),
      h('div', { class: 'big' }, fmt.num(shots), h('div', { class: 'muted small unit' }, 'настрел'))));
  return swipeable(card, {
    leftLabel: 'Настрел −',
    onLeft: () => shootSheet({ weapon: w }),
    onTap: () => weaponDetail(w),
  });
}

function renderGuns() {
  const active = state.weapons.filter((w) => !w.archived);
  const total = active.reduce((s, w) => s + M.weaponShots(state, w), 0);
  $('subtitle').textContent = active.length ? `Общий настрел ${fmt.num(total)} · свайп ← записать стрельбу` : '';
  const archived = archiveBlock(state.weapons.filter((w) => w.archived), 'Архив', (w) => saveEntity('weapons', { ...w, archived: false }, 'Возвращено из архива'));
  if (!active.length) return h('div', {}, empty('Оружие не добавлено', 'Нажмите «+», чтобы добавить ствол: калибр, настрел до начала учёта, ресурс ствола и интервал чистки.'), archived);
  return h('div', {}, active.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(weaponCard), archived);
}

function weaponForm(w = null) {
  const f = form([
    { name: 'name', label: 'Название', required: true, value: w?.name, placeholder: 'AR-15 16"' },
    { name: 'caliber', label: 'Калибр', required: true, value: w?.caliber, list: 'cal-list' },
    { name: 'serial', label: 'Серийный номер', value: w?.serial },
    { name: 'initialShots', label: 'Настрел до начала учёта', type: 'number', step: 1, min: 0, value: w?.initialShots ?? 0 },
    { name: 'barrelLife', label: 'Ресурс ствола, выстрелов', type: 'number', step: 1, min: 0, value: w?.barrelLife },
    { name: 'cleanEvery', label: 'Чистка каждые, выстрелов', type: 'number', step: 1, min: 0, value: w?.cleanEvery },
    { name: 'note', label: 'Примечание', value: w?.note, wide: true },
  ]);
  f.el.append(caliberList());
  const close = sheet(w ? 'Изменить оружие' : 'Новое оружие', f.el, {
    actions: [btn('Отмена', () => close()), btn('Сохранить', save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    close();
    await saveEntity('weapons', { cleanedAt: 0, ...(w ?? { id: db.uid(), created: Date.now() }), ...v, initialShots: v.initialShots ?? 0 }, w ? 'Сохранено' : `Добавлено: ${v.name}`);
  }
}

function weaponDetail(w) {
  const shots = M.weaponShots(state, w);
  const moves = state.movements.filter((m) => m.weaponId === w.id);
  const close = sheet(w.name, h('div', {},
    h('p', { class: 'muted' }, [w.caliber, w.serial && `№ ${w.serial}`, w.note].filter(Boolean).join(' · ')),
    h('div', { class: 'stats' },
      stat('настрел', fmt.num(shots)),
      stat('после чистки', fmt.num(shots - (Number(w.cleanedAt) || 0))),
      w.cleanedDate ? stat('чистка', fmt.date(w.cleanedDate)) : null),
    progress('Ресурс ствола', shots, Number(w.barrelLife)),
    h('div', { class: 'btn-row' },
      btn('Записать стрельбу', () => { close(); shootSheet({ weapon: w }); }, 'shoot'),
      btn('Почистил', async () => {
        close();
        await saveEntity('weapons', { ...w, cleanedAt: shots, cleanedDate: M.today() }, 'Отмечена чистка');
      })),
    h('h3', {}, 'Стрельбы'),
    movementRows(moves),
    h('div', { class: 'btn-row' },
      btn('Изменить', () => { close(); weaponForm(w); }),
      btn(moves.length ? 'В архив' : 'Удалить', () => {
        close();
        if (moves.length) saveEntity('weapons', { ...w, archived: true }, 'Перенесено в архив');
        else confirmSheet('Удалить оружие?', w.name, 'Удалить', async () => { await db.write({ weapons: { del: [w.id] } }); await refresh(); });
      }, 'danger'))));
}

// ---------- журнал ----------

const KIND_ICON = { buy: '＋', shot: '◎', reload: '⚒', adjust: '±', consume: '−' };

function movementTitle(m) {
  return findCartridge(m.cartridgeId)?.name ?? findComponent(m.componentId)?.name ?? m.caliber ?? '—';
}

function logRow(m) {
  const w = findWeapon(m.weaponId);
  const sub = [M.KINDS[m.kind], w?.name, m.note, m.price ? `${fmt.money(m.price)}` : null]
    .filter(Boolean).join(' · ');
  const unit = m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : '';
  return h('button', { type: 'button', class: `row kind-${m.kind}`, onclick: () => movementDetail(m) },
    h('span', { class: 'row-icon' }, KIND_ICON[m.kind] ?? '•'),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, movementTitle(m)), h('span', { class: 'muted small' }, sub)),
    h('span', { class: `row-qty ${m.qty < 0 ? 'neg' : 'pos'}` }, `${fmt.signed(m.qty)}${unit ? ` ${unit}` : ''}`));
}

function movementDetail(m) {
  const batch = m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
  const w = findWeapon(m.weaponId);
  const close = sheet(M.KINDS[m.kind], h('div', {},
    h('dl', { class: 'kv' },
      h('dt', {}, 'Дата'), h('dd', {}, fmt.date(m.date)),
      h('dt', {}, 'Позиция'), h('dd', {}, movementTitle(m)),
      m.caliber ? [h('dt', {}, 'Калибр'), h('dd', {}, m.caliber)] : null,
      h('dt', {}, 'Количество'), h('dd', {}, fmt.signed(m.qty)),
      w ? [h('dt', {}, 'Оружие'), h('dd', {}, w.name)] : null,
      m.price ? [h('dt', {}, 'Сумма'), h('dd', {}, fmt.money(m.price))] : null,
      m.note ? [h('dt', {}, 'Примечание'), h('dd', {}, m.note)] : null),
    m.kind === 'shot' && !m.cartridgeId ? h('p', { class: 'muted small' }, 'Запись без списания из БК — учитывается только в настреле.') : null,
    batch.length > 1 ? [h('h3', {}, 'Списано компонентов'), h('div', { class: 'rows' }, batch.filter((x) => x.id !== m.id).map(logRow))] : null,
    h('div', { class: 'btn-row' },
      btn('Удалить запись', () => {
        close();
        confirmSheet('Удалить запись?', batch.length > 1 ? `Вместе со связанными движениями (${batch.length}).` : 'Остатки и настрел пересчитаются.', 'Удалить', async () => {
          await db.write({ movements: { del: batch.map((x) => x.id) } });
          await refresh();
          toast('Запись удалена', {
            action: 'Вернуть',
            onAction: async () => { await db.write({ movements: { put: batch } }); await refresh(); },
          });
        });
      }, 'danger'))));
}

function renderLog() {
  const totals = M.shotsByCaliber(state);
  const filters = [['all', 'Все'], ['shot', 'Стрельба'], ['buy', 'Покупки'], ['reload', 'Снаряжение'], ['adjust', 'Корректировки']];
  const list = state.movements
    .filter((m) => m.kind !== 'consume' && (logFilter === 'all' || m.kind === logFilter))
    .sort(M.byDateDesc);
  $('subtitle').textContent = `${state.movements.filter((m) => m.kind !== 'consume').length} записей`;
  return h('div', {},
    totals.length ? h('section', { class: 'panel' },
      h('h3', {}, 'Настрел по калибрам'),
      h('div', { class: 'stats' }, totals.map(([cal, n]) => stat(cal || 'без калибра', fmt.num(n))))) : null,
    chips(filters, logFilter, (v) => { logFilter = v; render(); }),
    list.length
      ? groupBy(list, (m) => m.date ?? '').sort((a, b) => b[0].localeCompare(a[0])).map(([date, rows]) => h('section', { class: 'group' },
        h('h2', { class: 'group-head' }, fmt.date(date)), h('div', { class: 'rows' }, rows.map(logRow))))
      : empty('Записей нет', 'Свайпните патрон в разделе БК, чтобы купить или списать.'));
}

// ---------- рецепти та компоненти ----------

function componentCard(c) {
  const stock = M.componentStock(state, c.id);
  const price = M.unitPrice(c);
  const card = h('article', { class: 'card' },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'muted small' }, [M.COMPONENT_KINDS[c.kind],
          price ? `${fmt.money(price)} за ${c.unit || 'шт'}` : 'цена не указана',
          c.packQty ? `уп. ${fmt.num(c.packQty)} ${c.unit || 'шт'} = ${fmt.money(c.packPrice)}` : null].filter(Boolean).join(' · '))),
      h('div', { class: `big ${stock < 0 ? 'neg' : ''}` }, fmt.num(stock), h('div', { class: 'muted small unit' }, c.unit || 'шт'))));
  return swipeable(card, {
    rightLabel: '+ Купить', leftLabel: 'Пересчёт',
    onRight: () => buyComponentSheet(c),
    onLeft: () => adjustSheet(c, 'components'),
    onTap: () => componentForm(c),
  });
}

function recipeCard(r) {
  const cost = M.recipeCost(state, r);
  const lines = M.recipeLines(state, r);
  const card = h('article', { class: 'card' },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, r.name),
        h('div', { class: 'muted small' }, [r.caliber, `из запасов: ${fmt.num(M.recipeEnough(state, r))} шт`,
          lines.some((l) => l.noPrice && l.component?.kind !== 'case') ? 'есть компоненты без цены' : null].filter(Boolean).join(' · '))),
      h('div', { class: 'big money' }, fmt.money(cost), h('div', { class: 'muted small unit' }, 'за шт'))));
  return swipeable(card, {
    rightLabel: 'Снарядить',
    onRight: () => reloadSheet(r),
    onTap: () => recipeDetail(r),
  });
}

function renderReload() {
  $('subtitle').textContent = 'Рецепт: свайп → снарядить · компонент: → купить';
  return h('div', {},
    h('section', { class: 'group' }, h('h2', { class: 'group-head' }, 'Рецепты'),
      state.recipes.length ? [...state.recipes].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(recipeCard)
        : h('p', { class: 'muted' }, 'Рецептов нет. Сначала добавьте компоненты, затем рецепт.')),
    h('section', { class: 'group' }, h('h2', { class: 'group-head' }, 'Компоненты'),
      state.components.length
        ? groupBy(state.components, (c) => M.COMPONENT_KINDS[c.kind] ?? 'Другое').map(([, list]) => list.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(componentCard))
        : h('p', { class: 'muted' }, 'Компонентов нет: пули, порох, капсюли, гильзы, дробь, пыжи.')));
}

function componentForm(c = null) {
  const f = form([
    { name: 'name', label: 'Название', required: true, value: c?.name, placeholder: 'Sierra MatchKing 69gr' },
    { name: 'kind', label: 'Тип', type: 'select', value: c?.kind ?? 'bullet', options: Object.entries(M.COMPONENT_KINDS) },
    { name: 'unit', label: 'Единица учёта', type: 'select', value: c?.unit ?? 'шт', options: [['шт', 'штуки'], ['г', 'граммы']] },
    { name: 'packQty', label: 'В упаковке (шт или г)', type: 'number', step: 'any', value: c?.packQty },
    { name: 'packPrice', label: 'Цена упаковки', type: 'number', step: 'any', value: c?.packPrice },
    { name: 'note', label: 'Примечание', value: c?.note, wide: true },
  ]);
  const used = c && state.movements.some((m) => m.componentId === c.id);
  const inRecipe = c && state.recipes.some((r) => r.items.some((i) => i.componentId === c.id));
  const close = sheet(c ? c.name : 'Новый компонент', h('div', {},
    c ? h('div', { class: 'btn-row' },
      btn('+ Купить', () => { close(); buyComponentSheet(c); }, 'buy'),
      btn('Пересчёт', () => { close(); adjustSheet(c, 'components'); })) : null,
    f.el,
    c ? h('div', { class: 'btn-row' }, btn('Удалить', () => {
      if (used || inRecipe) { toast(inRecipe ? 'Компонент используется в рецепте' : 'По компоненту есть движения'); return; }
      close();
      confirmSheet('Удалить компонент?', c.name, 'Удалить', async () => { await db.write({ components: { del: [c.id] } }); await refresh(); });
    }, 'danger')) : null), {
    actions: [btn('Отмена', () => close()), btn('Сохранить', save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    close();
    await saveEntity('components', { ...(c ?? { id: db.uid(), created: Date.now() }), ...v }, c ? 'Сохранено' : `Добавлено: ${v.name}`);
  }
}

function buyComponentSheet(c) {
  const f = form([
    { name: 'packs', label: 'Упаковок', type: 'number', step: 'any', min: 0, value: c.packQty ? 1 : '' },
    { name: 'qty', label: `Количество, ${c.unit || 'шт'}`, type: 'number', step: 'any', required: true, value: c.packQty ?? '' },
    { name: 'price', label: 'Сумма', type: 'number', step: 'any', value: c.packPrice ?? '' },
    { name: 'date', label: 'Дата', type: 'date', value: M.today() },
    { name: 'note', label: 'Примечание' },
  ]);
  f.inputs.packs.addEventListener('input', () => {
    const packs = Number(String(f.inputs.packs.value).replace(',', '.')) || 0;
    if (c.packQty) f.inputs.qty.value = +(packs * c.packQty).toFixed(3);
    if (c.packPrice) f.inputs.price.value = +(packs * c.packPrice).toFixed(2);
  });
  const close = sheet(`Купить: ${c.name}`, f.el, {
    actions: [btn('Отмена', () => close()), btn('Добавить', save, 'primary buy')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast('Укажите количество'); return; }
    close();
    await addMovements([movement({ kind: 'buy', componentId: c.id, qty: v.qty, price: v.price, date: v.date || null, note: v.note })],
      `+${fmt.num(v.qty)} ${c.unit || 'шт'} · ${c.name}`);
  }
}

function recipeForm(r = null) {
  if (!state.components.length) { toast('Сначала добавьте компоненты'); return; }
  const f = form([
    { name: 'name', label: 'Название', required: true, value: r?.name, placeholder: 'SMK 69gr + CFE 223' },
    { name: 'caliber', label: 'Калибр', required: true, value: r?.caliber, list: 'cal-list' },
    { name: 'note', label: 'Примечание', value: r?.note, wide: true },
  ]);
  f.el.append(caliberList());
  const options = [...state.components].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map((c) => [c.id, `${c.name} (${c.unit || 'шт'})`]);
  const itemsBox = h('div', { class: 'items' });
  const addItem = (item = {}) => {
    const select = h('select', {}, options.map(([id, label]) => h('option', { value: id, selected: id === item.componentId }, label)));
    const per = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'на 1 шт' });
    per.value = item.perRound ?? 1;
    const row = h('div', { class: 'item-row' }, select, per, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Убрать', onclick: () => row.remove() }, '✕'));
    itemsBox.append(row);
  };
  (r?.items ?? [{}]).forEach(addItem);
  const close = sheet(r ? 'Изменить рецепт' : 'Новый рецепт', h('div', {},
    f.el, h('h3', {}, 'Компоненты и расход на 1 патрон'), itemsBox,
    btn('+ компонент', () => addItem()),
    r ? h('div', { class: 'btn-row' }, btn('Удалить рецепт', () => {
      close();
      confirmSheet('Удалить рецепт?', 'Снаряжённые патроны и журнал останутся.', 'Удалить', async () => { await db.write({ recipes: { del: [r.id] } }); await refresh(); });
    }, 'danger')) : null), {
    actions: [btn('Отмена', () => close()), btn('Сохранить', save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const items = [...itemsBox.querySelectorAll('.item-row')].map((row) => ({
      componentId: row.querySelector('select').value,
      perRound: Number(String(row.querySelector('input').value).replace(',', '.')) || 0,
    })).filter((i) => i.componentId && i.perRound > 0);
    if (!items.length) { toast('Добавьте хотя бы один компонент'); return; }
    close();
    await saveEntity('recipes', { ...(r ?? { id: db.uid(), created: Date.now() }), ...f.values(), items }, 'Рецепт сохранён');
  }
}

function recipeDetail(r) {
  const lines = M.recipeLines(state, r);
  const close = sheet(r.name, h('div', {},
    h('p', { class: 'muted' }, [r.caliber, r.note].filter(Boolean).join(' · ')),
    h('div', { class: 'stats' },
      stat('себестоимость', fmt.money(M.recipeCost(state, r))),
      stat('из запасов', `${fmt.num(M.recipeEnough(state, r))} шт`)),
    h('table', { class: 'lines' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Компонент'), h('th', {}, 'на 1'), h('th', {}, 'цена'), h('th', {}, 'уп. хватит'))),
      h('tbody', {}, lines.map((l) => h('tr', { class: l.noPrice && l.component?.kind !== 'case' ? 'warn' : '' },
        h('td', {}, l.component?.name ?? '(удалён)'),
        h('td', {}, `${fmt.num(l.perRound)} ${l.component?.unit || 'шт'}`),
        h('td', {}, l.noPrice ? '—' : fmt.money(l.cost)),
        h('td', {}, l.perPack ?? '—'))))),
    h('p', { class: 'muted small' }, 'Гильзы при снаряжении не списываются — они многоразовые.'),
    h('div', { class: 'btn-row' },
      btn('Снарядить', () => { close(); reloadSheet(r); }, 'primary'),
      btn('Изменить', () => { close(); recipeForm(r); }))));
}

function reloadSheet(r) {
  const enough = M.recipeEnough(state, r);
  const f = form([
    { name: 'qty', label: 'Сколько снарядил, шт', type: 'number', step: 1, min: 1, required: true },
    { name: 'date', label: 'Дата', type: 'date', value: M.today() },
    { name: 'note', label: 'Примечание' },
  ]);
  qtyChips(f.inputs.qty, [20, 50, 100]);
  const close = sheet(`Снарядить: ${r.name}`, h('div', {},
    h('p', { class: 'muted' }, `Компонентов хватит на ${fmt.num(enough)} шт · себестоимость ${fmt.money(M.recipeCost(state, r))}`), f.el), {
    actions: [btn('Отмена', () => close()), btn('Снарядить', save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    const qty = Math.round(v.qty);
    if (!(qty > 0)) { toast('Укажите количество'); return; }
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
    await addMovements(moves, `Снаряжено ${qty} · ${r.name}${qty > enough ? ' (компоненты ушли в минус)' : ''}`, extra);
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
    try { parsed = JSON.parse(reader.result); } catch { toast('Файл не похож на JSON'); return; }
    const data = parsed?.data;
    if (parsed?.app !== 'shooting-log' || !data || !db.STORES.every((s) => !data[s] || Array.isArray(data[s]))) {
      toast('Это не резервная копия Shooting Log');
      return;
    }
    const count = db.STORES.reduce((s, k) => s + (data[k]?.length ?? 0), 0);
    const changes = Object.fromEntries(db.STORES.map((s) => [s, { put: (data[s] ?? []).filter((x) => x && x.id) }]));
    const close = sheet('Импорт', h('div', {},
      h('p', {}, `В файле ${count} записей.`),
      h('p', { class: 'muted small' }, '«Объединить» — добавит новые и обновит совпадающие записи. «Заменить всё» — сначала удалит текущие данные.')), {
      actions: [
        btn('Отмена', () => close()),
        btn('Объединить', async () => { close(); await db.write(changes); await refresh(); toast('Импортировано'); }),
        btn('Заменить всё', () => {
          close();
          confirmSheet('Заменить все данные?', 'Текущие данные будут удалены. Сначала сделайте экспорт, если они нужны.', 'Заменить', async () => {
            await db.clearAll(); await db.write(changes); await refresh(); toast('Данные заменены');
          });
        }, 'danger'),
      ],
    });
  };
  reader.readAsText(file);
}

function renderSettings() {
  $('subtitle').textContent = `версия ${self.APP_VERSION}`;
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; } });
  const persisted = h('span', { class: 'muted' }, '…');
  navigator.storage?.persisted?.().then((p) => { persisted.textContent = p ? 'защищено от автоочистки' : 'браузер может очистить при нехватке места'; })
    .catch(() => { persisted.textContent = 'неизвестно'; });
  return h('div', {},
    h('section', { class: 'panel' },
      h('h3', {}, 'Резервная копия'),
      h('p', { class: 'muted small' }, 'Данные хранятся только на этом телефоне. Делайте экспорт после каждой стрельбы — например, «Поделиться» → Google Диск или Telegram «Избранное».'),
      h('div', { class: 'btn-row' },
        btn('Поделиться копией', () => exportData(true), 'primary'),
        btn('Скачать файл', () => exportData(false)),
        btn('Импорт', () => fileInput.click())),
      fileInput),
    h('section', { class: 'panel' },
      h('h3', {}, 'Хранилище'),
      h('p', {}, persisted),
      h('p', { class: 'muted small' }, `Оружие: ${state.weapons.length} · патроны: ${state.cartridges.length} · компоненты: ${state.components.length} · рецепты: ${state.recipes.length} · движения: ${state.movements.length}`)),
    h('section', { class: 'panel' },
      h('h3', {}, 'Установка на телефон'),
      h('p', { class: 'muted small' }, 'Chrome → меню ⋮ → «Добавить на главный экран» / «Установить приложение». После установки работает без интернета.')),
    h('section', { class: 'panel' },
      h('h3', {}, 'Опасная зона'),
      btn('Удалить все данные', () => confirmSheet('Удалить все данные?', 'Оружие, БК, журнал и рецепты будут удалены с этого устройства. Отменить нельзя.', 'Удалить всё', async () => {
        await db.clearAll(); await refresh(); toast('Данные удалены');
      }), 'danger')));
}

// ---------- навігація ----------

function addMenu() {
  const close = sheet('Добавить', h('div', { class: 'btn-col' },
    btn('Новый рецепт', () => { close(); recipeForm(); }),
    btn('Новый компонент', () => { close(); componentForm(); })));
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
  $('title').textContent = view.title;
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

$('fab').addEventListener('click', () => VIEWS[tab].fab?.());
window.addEventListener('hashchange', route);
registerWorker();
navigator.storage?.persist?.().catch(() => {});
state = await db.loadAll();
route();
