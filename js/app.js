import * as db from './db.js';
import * as M from './model.js';
import * as sync from './sync.js';
import { t, plural, lang, setLang, LANGS, collate, applyStatic, locale } from './i18n.js';
import { prepare as preparePhoto, editPhoto, viewer } from './photos.js';
import { loadGuide, parseGuide, initGuide } from './guide.js';
import { customIcon, applyIcon, setIcon, clearIcon, iconFile } from './icon.js';
import { COLORS, UNITS, CLICKS, num, length, size, offsetText, corrections, groupRows, elevText, holdText, paintPreview, shareImage, markTarget } from './target.js';
import { cartridgeIcon } from './ammo.js';
import { ammoLevel, shotLevel, levelArt } from './levels.js';
import { WEAPON_KINDS, weaponIcon } from './weapon-icon.js';
import { timerPanel } from './timer.js';
import { exercisesPanel } from './exercises.js';
import { h, fmt, sheet, refreshSheets, toast, form, chips, swipeable, confirmSheet, selectOptions, isoToDmy } from './ui.js';

let state = { weapons: [], cartridges: [], components: [], recipes: [], movements: [], photos: [], targets: [], drills: [], scores: [] };
let tab = 'ammo';
let logFilter = 'all';

const $ = (id) => document.getElementById(id);

// Компонент «закінчується», якщо його вистачить менше ніж на стільки патронів.
const LOW_ROUNDS = 50;

// ---------- дані ----------

async function refresh() {
  state = await db.loadAll();
  render();
  refreshSheets();
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
const findTarget = (id) => state.targets.find((x) => x.id === id);
const byName = (a, b) => collate(a.name, b.name);

function remember(key, value) {
  try { localStorage.setItem(key, value ?? ''); } catch { /* приватний режим */ }
}

function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ---------- спільні шматки UI ----------

/**
 * Пункти вибору ствола чи набою: спершу свого калібру, решта — групою «Другой калибр»
 * (калібр міг бути записаний інакше, вибрати все одно можна).
 */
function caliberOptions(list, caliber, label = (x) => x.name) {
  const sorted = [...list].sort(byName);
  const match = sorted.filter((x) => M.sameCaliber(x.caliber, caliber));
  const other = sorted.filter((x) => !M.sameCaliber(x.caliber, caliber));
  // Підходящі — окремою групою зверху, решта — групами за калібром: у списку одразу видно, що до чого.
  return {
    match,
    all: [...match, ...other],
    options: [
      match.length ? { group: t('Подходят: {cal}', { cal: caliber }), options: match.map((x) => [x.id, label(x)]) } : null,
      ...groupBy(other, (x) => x.caliber || t('Без калибра')).map(([cal, items]) => ({ group: cal, options: items.map((x) => [x.id, label(x)]) })),
    ].filter(Boolean),
  };
}

/** Текст попередження, якщо калібр набою й ствола різний; null — збігається або чогось не вказано. */
function caliberMismatch(cartridge, weapon) {
  if (!cartridge?.caliber || !weapon?.caliber || M.sameCaliber(cartridge.caliber, weapon.caliber)) return null;
  return t('⚠ Калибр не совпадает: патрон {a}, оружие {b}', { a: cartridge.caliber, b: weapon.caliber });
}

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map].sort((a, b) => collate(a[0], b[0]));
}

function storedSet(key) {
  try { return new Set(JSON.parse(recall(key)) ?? []); } catch { return new Set(); }
}

// Усі групи за замовчуванням згорнуті; тут — розгорнуті, між запусками.
const unfolded = storedSet('shooting-log:unfolded');

function setUnfolded(key, open) {
  if (open) unfolded.add(key); else unfolded.delete(key);
  remember('shooting-log:unfolded', JSON.stringify([...unfolded]));
}

/** Група, що згортається: за замовчуванням згорнута, розгорнуту запам'ятовує. */
function fold(key, head, body) {
  const el = h('details', { class: 'fold', open: unfolded.has(key), dataset: { key } },
    h('summary', { class: 'fold-head' }, h('span', { class: 'chevron', 'aria-hidden': 'true' }), head),
    h('div', { class: 'fold-body' }, body));
  el.addEventListener('toggle', () => setUnfolded(key, el.open));
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

/** Блок із заголовком на лінії рамки (як в 1С); fold — ключ згортання (як у груп: згорнутий, стан пам'ятає), count — кількість у заголовку. */
function box(title, content, { fold, count } = {}) {
  if (!fold) return h('fieldset', { class: 'box' }, h('legend', {}, title), content);
  const key = `box:${fold}`;
  const el = h('fieldset', { class: `box foldable ${unfolded.has(key) ? '' : 'closed'}` });
  const toggle = h('button', {
    type: 'button', class: 'box-toggle', 'aria-expanded': String(unfolded.has(key)),
    onclick: () => {
      const open = el.classList.toggle('closed') === false;
      setUnfolded(key, open);
      toggle.setAttribute('aria-expanded', String(open));
    },
  }, h('span', { class: 'box-chevron', 'aria-hidden': 'true' }, '›'), title, count ? h('span', { class: 'box-count' }, fmt.num(count)) : null);
  el.append(h('legend', {}, toggle), h('div', { class: 'box-body' }, content));
  return el;
}

const TOOL_ICON = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  archive: '<path d="M3 4h18v5H3z"/><path d="M5 9v11h14V9"/><path d="M10 13h4"/>',
  delete: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<path d="M8 8h12v12H8z"/><path d="M16 8V4H4v12h4"/>',
  share: '<path d="M12 3v13"/><path d="M8 7l4-4 4 4"/><path d="M5 14v6h14v-6"/>',
};

/** Кнопка-іконка в шапці шторки. */
function toolBtn(icon, label, onclick, cls = '') {
  const el = h('button', { type: 'button', class: `icon-btn tool ${cls}`, 'aria-label': label, title: label, onclick });
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${TOOL_ICON[icon]}</svg>`;
  return el;
}

/** «Змінити» і «В архів» / «Видалити» (якщо рухів немає) — іконками в шапці шторки. */
function cardTools(onEdit, hasMoves, onRemove) {
  return [
    toolBtn('edit', t('Изменить'), onEdit),
    hasMoves ? toolBtn('archive', t('В архив'), onRemove) : toolBtn('delete', t('Удалить'), onRemove, 'danger'),
  ];
}

/** Пояснення під іконкою «i»: згорнуте, бо потрібне один раз. */
function hint(text) {
  return h('details', { class: 'hint' }, h('summary', { 'aria-label': t('Подсказка') }, 'i'), h('p', { class: 'muted small' }, text));
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

/** «Всього набоїв»: картинка рівня запасу і на скільки виїздів вистачить (за середнім списанням з БК). */
function ammoHero(total) {
  const avg = M.perSession(state, (m) => !!m.cartridgeId);
  const trips = total > 0 && avg ? Math.floor(total / avg) : null;
  const runway = trips === null ? null : trips < 1 ? t('меньше чем на выезд')
    : t('хватит на ≈ {n} {w}', { n: fmt.num(trips), w: plural(trips, [t('выезд'), t('выезда'), t('выездов')]) });
  return h('section', { class: 'hero accent lv' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('Всего патронов')),
      h('div', { class: 'hero-value' }, h('span', { class: total < 0 ? 'neg' : '' }, fmt.num(total)), h('span', { class: 'hero-unit' }, t('шт'))),
      runway ? h('div', { class: 'lv-sub' }, runway) : null),
    levelArt(ammoLevel(total)));
}

function cartridgeDetails(c) {
  const parts = [];
  if (c.bulletWeight) parts.push(`${fmt.num(c.bulletWeight)} ${c.weightUnit || 'gr'}`);
  const unit = M.cartridgeUnitCost(state, c.id);
  if (c.recipeId) parts.push(t('самоснаряд'));
  if (unit) parts.push(t('{price} за выстрел', { price: fmt.money(unit) }));
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
    return h('div', {}, empty(t('Пока нет патронов'), t('Нажмите «+», чтобы добавить позицию, или импортируйте данные в настройках (⚙ вверху).')), archived);
  }
  $('subtitle').textContent = t('Свайп → купить, ← списать');
  const groups = groupBy(active, (c) => c.caliber || t('Без калибра'))
    .map(([caliber, list]) => ({ caliber, list: list.sort(byName), sum: list.reduce((s, c) => s + M.cartridgeStock(state, c.id), 0) }));
  const total = groups.reduce((s, g) => s + g.sum, 0);
  return h('div', {},
    ammoHero(total),
    groups.map((g) => fold(`ammo:${g.caliber}`,
      [cartridgeIcon(g.caliber), h('span', { class: 'fold-title' }, g.caliber),
        h('span', { class: 'fold-meta' }, t('{n} поз.', { n: g.list.length })),
        h('span', { class: 'fold-sum' }, `${fmt.num(g.sum)} ${t('шт')}`)],
      g.list.map(cartridgeCard))),
    archived);
}

function restoreCartridge(c) {
  saveEntity('cartridges', { ...c, archived: false }, t('Возвращено из архива'));
}

/**
 * Поле «Рецепт» для самоспорядженого набою. Спорядження за рецептом приходує набої саме сюди,
 * тому рецепт, уже прив'язаний до іншого активного набою, не пропонуємо.
 */
function recipeField(c) {
  const taken = new Set(state.cartridges.filter((x) => !x.archived && x.id !== c?.id && x.recipeId).map((x) => x.recipeId));
  const free = state.recipes.filter((r) => !taken.has(r.id) || r.id === c?.recipeId);
  if (!free.length) return [];
  const recipes = caliberOptions(free, c?.caliber);
  return [{
    name: 'recipeId', label: t('Рецепт (если снаряжаю сам)'), type: 'select', value: c?.recipeId ?? '',
    options: [['', t('— покупной —')], ...recipes.options],
    hint: t('Снаряжение по рецепту будет приходовать сюда; без покупок цена выстрела — по рецепту.'),
  }];
}

function cartridgeForm(c = null) {
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: c?.name, placeholder: 'GGG 147 FMJ', half: true },
    { name: 'caliber', label: t('Калибр'), required: true, value: c?.caliber, list: 'cal-list', half: true },
    { name: 'bulletWeight', label: t('Вес пули / снаряда'), type: 'number', step: 'any', value: c?.bulletWeight, half: true },
    { name: 'weightUnit', label: t('Ед.'), type: 'select', value: c?.weightUnit ?? 'gr', options: [['gr', t('гран (gr)')], ['г', t('грамм (г)')]], half: true },
    ...recipeField(c),
    ...(c ? [] : [
      { name: 'initial', label: t('Сейчас в наличии, шт'), type: 'number', step: 1, min: 0, half: true },
      { name: 'initialPrice', label: t('Сумма покупки (необязательно)'), type: 'number', step: 'any', half: true },
    ]),
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
    if (f.inputs.recipeId) obj.recipeId = v.recipeId || null;
    close();
    if (!c && v.initial > 0) {
      // Із сумою це покупка (йде в середню ціну й у «куплено»), без суми — просто початковий залишок.
      const buying = v.initialPrice > 0;
      await addMovements([movement({
        kind: buying ? 'buy' : 'adjust', cartridgeId: obj.id, caliber: obj.caliber,
        qty: Math.round(v.initial), price: buying ? v.initialPrice : undefined,
        note: buying ? undefined : t('Начальный остаток'),
      })], t('Добавлено: {name}', { name: obj.name }), { cartridges: { put: [obj] } });
    } else {
      await saveEntity('cartridges', obj, c ? t('Сохранено') : t('Добавлено: {name}', { name: obj.name }));
    }
  }
}

/** Ціна одного набою в покупці: сума / кількість; null — чогось не вказали. */
function buyUnitPrice(m) {
  return m.kind === 'buy' && m.cartridgeId && m.qty > 0 && Number(m.price) > 0 ? Number(m.price) / m.qty : null;
}

function buySheet(c) {
  const f = form([
    { name: 'qty', label: t('Количество, шт'), type: 'number', step: 1, min: 1, required: true },
    { name: 'price', label: t('Сумма покупки (необязательно)'), type: 'number', step: 'any' },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() },
    { name: 'note', label: t('Где купил / примечание') },
  ]);
  qtyChips(f.inputs.qty, [10, 20, 50, 100, 150, 200, 300]);
  // Ціна за штуку — одразу, щойно вказали і кількість, і суму.
  const each = h('small', { class: 'muted' });
  const showEach = () => {
    const { qty, price } = f.values();
    const unit = buyUnitPrice({ kind: 'buy', cartridgeId: c.id, qty, price });
    each.textContent = unit ? t('{price} за шт', { price: fmt.money(unit) }) : '';
  };
  f.inputs.price.after(each);
  f.inputs.qty.addEventListener('input', showEach);
  f.inputs.price.addEventListener('input', showEach);
  f.el.addEventListener('click', () => setTimeout(showEach));
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

// Значення пункту «Чужое оружие» у виборі ствола; у записі — прапорець foreignWeapon без weaponId.
const FOREIGN = 'foreign';

/** Підпис чужого ствола: «АКМ (чужое)» або просто «Чужое оружие», якщо назву не вказали. */
function foreignLabel(name) {
  return name ? t('{name} (чужое)', { name }) : t('Чужое оружие');
}

/** Підпис ствола в записі стрільби: свій (з прицелом), чужий або нічого. */
function shotGunLabel(m) {
  const w = findWeapon(m.weaponId);
  const scope = w?.scopes?.find((s) => s.id === m.scopeId);
  if (w) return scope ? `${w.name} (${scope.name})` : w.name;
  return m.foreignWeapon ? foreignLabel(m.foreignWeaponName) : null;
}

/** Підказки для назви чужого ствола — назви з попередніх записів. */
function foreignList() {
  const names = [...new Set(state.movements.map((m) => m.foreignWeaponName).filter(Boolean))].sort(collate);
  return h('datalist', { id: 'foreign-list' }, names.map((n) => h('option', { value: n })));
}

/**
 * Стрільба з чужої зброї чужими набоями (дали постріляти на навчанні): лише в загальний настріл
 * і настріл за калібрами — склад БК і свої стволи не змінюються.
 */
function foreignShotSheet() {
  const f = form([
    { name: 'caliber', label: t('Калибр'), required: true, list: 'cal-list', half: true },
    { name: 'qty', label: t('Выстрелов, шт'), type: 'number', step: 1, min: 1, required: true, half: true },
    { name: 'foreignName', label: t('Какое оружие'), placeholder: t('АКМ'), list: 'foreign-list', half: true },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today(), half: true },
    { name: 'note', label: t('Где / что'), placeholder: t('Учебный центр, БЗВП…') },
  ]);
  f.el.append(caliberList(), foreignList());
  qtyChips(f.inputs.qty);
  const close = sheet(t('Стрельба: чужое оружие и патроны'), h('div', {},
    h('p', { class: 'muted small' }, t('Идёт только в общий настрел и настрел по калибрам: склад и свои стволы не меняются. Свою стрельбу записывайте свайпом патрона или ствола; там же есть пункты «Чужое оружие» и «Чужие патроны».')),
    f.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Записать'), save, 'primary shoot')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { toast(t('Укажите количество')); return; }
    close();
    const qty = Math.round(v.qty);
    await addMovements([movement({
      kind: 'shot', cartridgeId: null, weaponId: null, caliber: v.caliber, qty: -qty, date: v.date || null, note: v.note,
      foreignWeapon: true, foreignWeaponName: v.foreignName || undefined, foreignAmmo: true,
    })], `−${fmt.num(qty)} · ${foreignLabel(v.foreignName)}`);
  }
}

/** Списання на стрільбі: від патрона (обираємо ствол) або від ствола (обираємо патрон). */
function shootSheet({ cartridge = null, weapon = null }) {
  const caliber = cartridge?.caliber ?? weapon?.caliber;
  const fields = [{ name: 'qty', label: t('Выстрелов, шт'), type: 'number', step: 1, min: 1, required: true }];
  let gun = weapon;
  if (cartridge) {
    const guns = caliberOptions(state.weapons.filter((w) => !w.archived), caliber);
    const last = recall(`gun:${caliber}`);
    gun = last === FOREIGN ? null : findWeapon(guns.all.some((w) => w.id === last) ? last : guns.match[0]?.id) ?? null;
    fields.push({
      name: 'weaponId', label: t('Оружие'), type: 'select', value: last === FOREIGN ? FOREIGN : gun?.id ?? '',
      options: [...guns.options, [FOREIGN, t('Чужое оружие')], ['', t('— не указывать —')]],
    }, { name: 'foreignName', label: t('Какое оружие'), placeholder: t('АКМ'), list: 'foreign-list', value: recall(`foreign-gun:${caliber}`) ?? '' });
  } else {
    const ammo = caliberOptions(state.cartridges.filter((c) => !c.archived), caliber,
      (c) => t('{name} · ост. {n}', { name: c.name, n: fmt.num(M.cartridgeStock(state, c.id)) }));
    const last = recall(`ammo:${weapon.id}`);
    fields.push({
      name: 'cartridgeId', label: t('Патроны (списать из БК)'), type: 'select',
      value: ammo.all.some((c) => c.id === last) ? last : (ammo.match[0]?.id ?? ''),
      options: [...ammo.options, ['', t('Чужие патроны — не списывать из БК')]],
    });
  }
  fields.push(
    { name: 'scopeId', label: t('Прицел'), type: 'select', value: M.defaultScope(gun)?.id ?? '', options: scopeOptions(gun) },
    { name: 'note', label: t('Где / что'), placeholder: t('Полигон, тренировка…') },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() });
  const f = form(fields);
  qtyChips(f.inputs.qty);
  // Прицели — від вибраного ствола; без прицелів поле сховане.
  const currentGun = () => weapon ?? findWeapon(f.inputs.weaponId?.value) ?? null;
  const updateScopes = () => {
    const w = currentGun();
    f.inputs.scopeId.replaceChildren(...selectOptions(scopeOptions(w), M.defaultScope(w)?.id ?? '').filter(Boolean));
    f.inputs.scopeId.closest('.field').hidden = !w?.scopes?.length;
  };
  f.inputs.weaponId?.addEventListener('change', updateScopes);
  updateScopes();
  // Назва чужого ствола — лише коли вибрано «Чужое оружие».
  if (f.inputs.foreignName) {
    f.el.append(foreignList());
    const updateForeign = () => { f.inputs.foreignName.closest('.field').hidden = f.inputs.weaponId.value !== FOREIGN; };
    f.inputs.weaponId.addEventListener('change', updateForeign);
    updateForeign();
  }
  // Попередження під вибором ствола чи набою, якщо калібри різні (з урахуванням .223 = 5.56 тощо).
  const caliberWarn = h('div', { class: 'caliber-warn small', role: 'alert' });
  const updateCaliber = () => {
    const text = caliberMismatch(cartridge ?? findCartridge(f.inputs.cartridgeId?.value), currentGun());
    caliberWarn.textContent = text ?? '';
    caliberWarn.hidden = !text;
  };
  (f.inputs.weaponId ?? f.inputs.cartridgeId).closest('.field').after(caliberWarn);
  (f.inputs.weaponId ?? f.inputs.cartridgeId).addEventListener('change', updateCaliber);
  updateCaliber();
  const noteChips = chips([t('Полигон'), t('Тренировка'), t('Пристрелка'), t('Отстрел'), t('Охота')], '', (v) => { f.inputs.note.value = v; });
  f.inputs.note.closest('.field').after(noteChips);
  const title = cartridge ? t('Списать: {name}', { name: cartridge.name }) : t('Настрел: {name}', { name: weapon.name });
  const info = cartridge ? h('p', { class: 'muted' }, t('В наличии: {n} шт', { n: fmt.num(M.cartridgeStock(state, cartridge.id)) })) : null;
  // Вартість стрільби одразу під кількістю: ціна набою × постріли.
  const costLine = h('div', { class: 'cost-line small' });
  const updateCost = () => {
    const c = cartridge ?? findCartridge(f.inputs.cartridgeId?.value);
    const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
    const qty = Number(String(f.inputs.qty.value).replace(',', '.')) || 0;
    costLine.textContent = unit
      ? t('Стоимость: {sum} · {unit} за выстрел', { sum: fmt.money(unit * qty), unit: fmt.money(unit) })
      : c ? t('Цена патрона неизвестна — укажите сумму при покупке') : '';
  };
  f.inputs.qty.closest('.field').after(costLine);
  f.inputs.qty.addEventListener('input', updateCost);
  f.inputs.cartridgeId?.addEventListener('change', updateCost);
  f.el.addEventListener('click', () => setTimeout(updateCost));
  updateCost();
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
    const gunName = w?.name ?? (v.weaponId === FOREIGN ? foreignLabel(v.foreignName) : null);
    let message = stock !== null && qty > stock ? t('−{n} · остаток ушёл в минус', { n: qty }) : `−${fmt.num(qty)}${gunName ? ` · ${gunName}` : ''}`;
    const s = w ? M.cleaningStatus(state, w) : null;
    if (s?.every) {
      const after = s.unit === 'sessions' ? s.count + (s.dates.has(v.date || '') ? 0 : 1) : s.since + qty;
      if (after >= s.every) {
        message += s.unit === 'sessions'
          ? t(' · пора чистить (стрельб после чистки: {n})', { n: fmt.num(after) })
          : t(' · пора чистить ({n} после чистки)', { n: fmt.num(after) });
      }
    }
    // Вартість фіксуємо на момент списання, щоб подальші покупки за іншою ціною її не змінювали.
    const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
    const price = unit ? +(unit * qty).toFixed(2) : null;
    if (price) message += ` · ${fmt.money(price)}`;
    const scopeId = w?.scopes?.some((sc) => sc.id === v.scopeId) ? v.scopeId : null;
    const isForeign = v.weaponId === FOREIGN;
    if (isForeign) remember(`foreign-gun:${caliber}`, v.foreignName);
    const foreign = {
      foreignWeapon: isForeign || undefined,
      foreignWeaponName: (isForeign && v.foreignName) || undefined,
      foreignAmmo: (!cartridge && !c) || undefined,
    };
    await addMovements([movement({ kind: 'shot', cartridgeId: c?.id ?? null, weaponId: w?.id ?? null, scopeId, caliber: c?.caliber ?? caliber, qty: -qty, price, date: v.date || null, note: v.note, ...foreign })], message);
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

/** Історія в картці, найновіше зверху; skip — що й так зрозуміло з картки (weapon, cartridge). */
function movementRows(list, { limit = 50, skip = {} } = {}) {
  if (!list.length) return h('p', { class: 'muted' }, t('Движений пока нет'));
  return h('div', { class: 'rows' }, [...list].sort(M.byDateDesc).slice(0, limit).map((m) => logRow(m, { date: true, skip })));
}

function cartridgeDetail(c) {
  const body = () => { const cur = findCartridge(c.id); return cur ? cartridgeBody(cur, () => close()) : null; };
  const hasMoves = state.movements.some((m) => m.cartridgeId === c.id);
  const tools = cardTools(() => { close(); cartridgeForm(findCartridge(c.id) ?? c); }, hasMoves,
    () => { close(); removeCartridge(findCartridge(c.id) ?? c, state.movements.some((m) => m.cartridgeId === c.id)); });
  const close = sheet(c.name, body(), { live: body, tools });
}

function cartridgeBody(c, close) {
  const moves = state.movements.filter((m) => m.cartridgeId === c.id);
  const bought = moves.filter((m) => m.kind === 'buy');
  const boughtQty = bought.reduce((s, m) => s + m.qty, 0);
  const priced = bought.filter((m) => m.price > 0);
  const avg = priced.length ? priced.reduce((s, m) => s + m.price, 0) / priced.reduce((s, m) => s + m.qty, 0) : null;
  const fired = -moves.filter((m) => m.kind === 'shot').reduce((s, m) => s + m.qty, 0);
  return h('div', {},
    h('p', { class: 'muted' }, [c.caliber, cartridgeDetails(c)].filter(Boolean).join(' · ')),
    h('div', { class: 'stats' },
      stat(t('остаток'), fmt.num(M.cartridgeStock(state, c.id)), 'accent'),
      stat(t('куплено'), fmt.num(boughtQty)),
      stat(t('выстрелено'), fmt.num(fired)),
      avg ? stat(t('ср. цена'), fmt.money(avg)) : null),
    h('div', { class: 'btn-row' },
      btn(t('+ Купить'), () => { close(); buySheet(c); }, 'buy'),
      btn(t('Списать −'), () => { close(); shootSheet({ cartridge: c }); }, 'shoot'),
      btn(t('Пересчёт'), () => { close(); adjustSheet(c, 'cartridges'); })),
    box(t('История'), movementRows(moves, { skip: { cartridge: true } }), { fold: `hist:${c.id}`, count: moves.length }));
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

const fillClass = (pct) => (pct >= 100 ? 'over' : pct >= 85 ? 'warn' : '');

/** Показник: підпис і значення над смугою; inline — усе одним рядком (картка в списку). */
function meter(label, value, pct, fill, inline) {
  const bar = h('div', { class: 'bar' }, h('div', { class: `fill ${fill}`, style: `width:${pct}%` }));
  const right = h('span', { class: 'muted' }, value);
  return inline
    ? h('div', { class: 'progress inline small' }, label, bar, right)
    : h('div', { class: 'progress' }, h('div', { class: 'progress-label small' }, label, right), bar);
}

function progress(label, value, max, { inline = false } = {}) {
  if (!(max > 0)) return null;
  const pct = Math.min(100, (value / max) * 100);
  return meter(h('span', {}, label), `${fmt.num(value)} / ${fmt.num(max)}`, pct, fillClass(pct), inline);
}

const SCOPE_KINDS = {
  optic: 'Оптический',
  red: 'Коллиматор',
  holo: 'Голографический',
  thermal: 'Тепловизор',
  night: 'Ночной',
  other: 'Другое',
};

// Сітка прицілу — у чому рахувати винос; точка (коліматор) — винос у сантиметрах на цілі
const RETICLES = [['mil', 'Сетка MRAD'], ['moa', 'Сетка MOA'], ['dot', 'Точка, без сетки']];
const reticleOf = (s) => s?.reticle || (s?.kind === 'red' || s?.kind === 'holo' ? 'dot' : M.clickValue(s?.click)?.unit ?? 'dot');

function scopeOptions(w) {
  return [...(w?.scopes ?? []).map((s) => [s.id, s.name]), ['', t('— не указывать —')]];
}

function scopeLine(s, full = false) {
  const parts = [s.name];
  if (full && s.kind) parts.push(t(SCOPE_KINDS[s.kind]));
  if (s.zero) parts.push(t('пристрелка {n} м', { n: fmt.num(s.zero) }));
  if (s.click) parts.push(clickLabel(s.click));
  if (full && s.reticle) parts.push(t(RETICLES.find(([k]) => k === s.reticle)?.[1] ?? ''));
  if (full && s.note) parts.push(s.note);
  if (full && s.default) parts.push(t('по умолчанию'));
  return h('div', { class: `scope ${s.default ? 'default' : ''}` }, h('span', { class: 'scope-mark', 'aria-hidden': 'true' }, s.default ? '◉' : '⊕'), parts.join(' · '));
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
  return weaponIcon(w);
}

/** Підпис прогресу чистки в одиницях інтервалу. */
/**
 * Чистка одним рядком. З інтервалом: зліва — коли чистили або «Пора чистить», справа — скільки
 * набралося з інтервалу, під ними смуга. Без інтервалу — лише плашка стану.
 */
function cleanRow(w, { inline = false } = {}) {
  const s = M.cleaningStatus(state, w);
  if (!s.every) return cleanBadge(w);
  const pct = Math.min(100, (s.count / s.every) * 100);
  const unit = s.unit === 'sessions' ? t('стрельб') : t('выстрелов');
  const status = s.due ? h('span', { class: 'clean-due' }, t('Пора чистить'))
    : s.reached ? h('span', { class: 'clean-wait' }, t('Напомню {date}', { date: fmt.date(s.dueDate) }))
      : h('span', {}, s.last ? t('Почищено {date}', { date: fmt.date(s.last.date) }) : t('Чистка'));
  const fill = s.due && pct >= 100 ? 'over' : s.reached || pct >= 85 ? 'warn' : '';
  return meter(status, `${fmt.num(s.count)} / ${fmt.num(s.every)} ${unit}`, pct, fill, inline);
}

/** Плашка стану чистки: червона — час чистити, жовта — не почищено після стрільби. */
function cleanBadge(w) {
  const s = M.cleaningStatus(state, w);
  if (s.due && s.every) {
    return h('div', { class: 'badge danger small' }, s.unit === 'sessions'
      ? t('Пора чистить: стрельб после чистки — {n}', { n: fmt.num(s.count) })
      : t('Пора чистить: {n} выстрелов после чистки', { n: fmt.num(s.since) }));
  }
  if (s.due) {
    return h('div', { class: 'badge warn small' },
      s.lastShot ? t('Не почищено после стрельбы {date}', { date: fmt.date(s.lastShot) }) : t('Не почищено после стрельбы'));
  }
  if (s.reached) return h('div', { class: 'badge ok small' }, t('Не почищено · напомню {date}', { date: fmt.date(s.dueDate) }));
  return s.last ? h('div', { class: 'badge ok small' }, t('Почищено {date}', { date: fmt.date(s.last.date) })) : null;
}

const needsCleaning = (w) => !w.archived && M.cleaningStatus(state, w).due;

async function recordCleaning(w, date = M.today(), note = '') {
  await addMovements([movement({ kind: 'clean', weaponId: w.id, qty: 0, date, note })], t('Чистка отмечена · {name}', { name: w.name }));
}

function cleanSheet(w) {
  const f = form([
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() },
    { name: 'note', label: t('Что сделано'), placeholder: t('Полная чистка, смазка…') },
  ]);
  const kinds = chips([t('Полная'), t('Только ствол'), t('Быстрая')], '', (v) => { f.inputs.note.value = v; });
  f.inputs.note.closest('.field').after(kinds);
  const s = M.cleaningStatus(state, w);
  const close = sheet(t('Чистка: {name}', { name: w.name }), h('div', {},
    h('p', { class: 'muted' }, t('После прошлой чистки: {n} выстрелов', { n: fmt.num(s.since) })), f.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Почистил'), save, 'primary')],
  });
  async function save() {
    const v = f.values();
    close();
    await recordCleaning(w, v.date || M.today(), v.note);
  }
}

function weaponCard(w) {
  const shots = M.weaponShots(state, w);
  const meters = [progress(t('Ресурс ствола'), shots, Number(w.barrelLife), { inline: true }), permitMeter(w, { inline: true }), cleanRow(w, { inline: true })].filter(Boolean);
  const card = h('article', { class: 'card tall' },
    h('div', { class: 'swipe-body wrap' },
      weaponThumb(w),
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, w.name),
        h('div', { class: 'muted small' }, [w.caliber, w.serial && `№ ${w.serial}`].filter(Boolean).join(' · ')),
        scopeList(w),
        precisionLine(w)),
      h('div', { class: 'big' }, fmt.num(shots), h('div', { class: 'muted small unit' }, t('настрел'))),
      meters.length ? h('div', { class: 'card-foot meters' }, meters) : null));
  return swipeable(card, {
    rightLabel: t('✓ Почистил'), leftLabel: t('Настрел −'),
    onRight: () => recordCleaning(w),
    onLeft: () => shootSheet({ weapon: w }),
    onTap: () => weaponDetail(w),
  });
}

/** Підказка під «Ресурс ствола»: орієнтир за калібром і кнопка «Підставити». */
function barrelHint(f) {
  const box = h('div', { class: 'hint-row small' });
  const update = () => {
    const life = M.barrelLifeFor(f.inputs.caliber.value);
    box.replaceChildren();
    if (!life) return;
    if (life.smooth) {
      box.append(h('span', { class: 'muted' }, t('Гладкий ствол: ресурс обычно не ограничивает, поле можно оставить пустым.')));
      return;
    }
    const range = life.max ? `${fmt.num(life.min)}–${fmt.num(life.max)}` : `${fmt.num(life.min)}+`;
    box.append(
      h('span', { class: 'muted' }, t('Ориентир для калибра: {range} выстрелов. Хромированный ствол — ближе к верхней границе, матчевый — к нижней.', { range })),
      btn(t('Подставить {n}', { n: fmt.num(life.min) }), () => { f.inputs.barrelLife.value = life.min; }, 'mini'));
  };
  f.inputs.caliber.addEventListener('input', update);
  f.inputs.barrelLife.closest('.field').after(box);
  update();
}

function renderGuns() {
  const active = state.weapons.filter((w) => !w.archived);
  const archived = archiveBlock(state.weapons.filter((w) => w.archived), (w) => saveEntity('weapons', { ...w, archived: false }, t('Возвращено из архива')));
  if (!active.length) return h('div', {}, empty(t('Оружие не добавлено'), t('Нажмите «+», чтобы добавить ствол: калибр, настрел до начала учёта, ресурс ствола и интервал чистки.')), archived);
  // Той самий загальний настріл, що в Журналі, з розбивкою: свої стволи, чужа зброя, без ствола.
  const shots = M.totalShots(state);
  const split = [
    t('стволов: {n}', { n: active.length }),
    shots.foreign || shots.noGun ? t('свои: {n}', { n: fmt.num(shots.own) }) : null,
    shots.foreign ? t('чужое оружие: {n}', { n: fmt.num(shots.foreign) }) : null,
    shots.noGun ? t('без ствола: {n}', { n: fmt.num(shots.noGun) }) : null,
  ].filter(Boolean).map((part, i) => [i ? ' · ' : null, h('span', {}, part)]);
  $('subtitle').textContent = t('Свайп ← записать стрельбу, → почистил');
  return h('div', {},
    h('section', { class: 'hero lv' },
      h('div', {},
        h('div', { class: 'hero-label' }, t('Общий настрел')),
        h('div', { class: 'hero-value' }, fmt.num(shots.total))),
      levelArt(shotLevel(shots.total)),
      h('div', { class: 'lv-sub lv-wide' }, split)),
    urgentPermitsBlock(),
    active.sort(byName).map(weaponCard),
    archived);
}

function weaponForm(w = null) {
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: w?.name, placeholder: 'AR-15 16"', half: true },
    { name: 'serial', label: t('Серийный номер'), value: w?.serial, half: true },
    { name: 'caliber', label: t('Калибр'), required: true, value: w?.caliber, list: 'cal-list', half: true },
    {
      name: 'kind', label: t('Значок'), type: 'select', value: w?.kind ?? 'auto', half: true,
      options: Object.entries(WEAPON_KINDS).map(([k, label]) => [k, t(label)]),
    },
    { name: 'initialShots', label: t('Настрел до начала учёта'), type: 'number', step: 1, min: 0, value: w?.initialShots ?? 0, half: true },
    { name: 'barrelLife', label: t('Ресурс ствола, выстрелов'), type: 'number', step: 1, min: 0, value: w?.barrelLife, half: true },
    { name: 'note', label: t('Примечание'), value: w?.note, wide: true },
  ]);
  f.el.append(caliberList());
  barrelHint(f);
  const remind = cleanReminderBox(w);
  const permit = permitFields(w);
  const scopesBox = h('div', { class: 'items' });
  const addScope = (s = {}) => {
    const name = h('input', { type: 'text', placeholder: t('Модель: Vortex Diamondback 4-12x40'), autocomplete: 'off', class: 'sc-name' });
    name.value = s.name ?? '';
    const kind = h('select', { class: 'sc-kind' },
      Object.entries(SCOPE_KINDS).map(([k, label]) => h('option', { value: k, selected: k === (s.kind ?? 'optic') }, t(label))));
    const zero = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: t('Пристрелка, м'), class: 'sc-zero' });
    zero.value = s.zero ?? '';
    // ціна клацання прицілу — підставляється в мішень, коли вибрали цей приціл
    const click = h('select', { class: 'sc-click', 'aria-label': t('Цена щелчка прицела') },
      [['', t('— цена щелчка —')], ...CLICKS].map(([k, label]) => h('option', { value: k, selected: k === (s.click ?? '') }, k ? t(label) : label)));
    const reticle = h('select', { class: 'sc-ret', 'aria-label': t('Сетка') },
      [['', t('— сетка —')], ...RETICLES].map(([k, label]) => h('option', { value: k, selected: k === (s.reticle ?? '') }, k ? t(label) : label)));
    const note = h('input', { type: 'text', placeholder: t('Кронштейн, сетка, серийный №…'), autocomplete: 'off', class: 'sc-note' });
    note.value = s.note ?? '';
    // «За замовчуванням» — лише один прицел на ствол: позначили цей — з інших знімаємо.
    const def = h('input', {
      type: 'checkbox', checked: !!s.default,
      onchange: () => { if (def.checked) scopesBox.querySelectorAll('.sc-def input').forEach((x) => { if (x !== def) x.checked = false; }); },
    });
    const row = h('div', { class: 'scope-row', dataset: { id: s.id ?? db.uid() } }, name,
      h('button', { type: 'button', class: 'icon-btn sc-del', 'aria-label': t('Убрать прицел'), onclick: () => row.remove() }, '✕'),
      kind, reticle, zero, click, note,
      h('label', { class: 'sc-def small' }, def, t('Использовать по умолчанию при записи стрельбы')));
    scopesBox.append(row);
  };
  (w?.scopes ?? []).forEach(addScope);
  const close = sheet(w ? t('Изменить оружие') : t('Новое оружие'), h('div', {},
    f.el, remind.el, permit.el, h('h3', {}, t('Прицелы')), scopesBox, btn(t('+ прицел'), () => addScope())), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f) || permit.invalid()) return;
    const v = f.values();
    const scopes = [...scopesBox.querySelectorAll('.scope-row')].map((row) => {
      const zero = Number(String(row.querySelector('.sc-zero').value).replace(',', '.'));
      return {
        id: row.dataset.id,
        name: row.querySelector('.sc-name').value.trim(),
        kind: row.querySelector('.sc-kind').value,
        zero: zero > 0 ? zero : null,
        click: row.querySelector('.sc-click').value || null,
        reticle: row.querySelector('.sc-ret').value || null,
        note: row.querySelector('.sc-note').value.trim(),
        default: row.querySelector('.sc-def input').checked,
      };
    }).filter((s) => s.name);
    close();
    await saveEntity('weapons', { ...(w ?? { id: db.uid(), created: Date.now() }), ...v, ...remind.values(), ...permit.values(), initialShots: v.initialShots ?? 0, scopes }, w ? t('Сохранено') : t('Добавлено: {name}', { name: v.name }));
  }
}

/** Блок «Нагадування про чистку» у формі зброї: інтервал, відстрочка й пояснення, що з цього вийде. */
function cleanReminderBox(w) {
  const numInput = (value) => {
    const el = h('input', { type: 'number', inputmode: 'numeric', step: 1, min: 0, placeholder: '—', class: 'remind-num' });
    el.value = value ?? '';
    return el;
  };
  const num = (el) => (el.value === '' ? null : Math.max(0, Math.round(Number(String(el.value).replace(',', '.')))) || null);
  const every = numInput(w?.cleanEvery);
  const delay = numInput(w?.cleanDelay);
  const unit = chips([['shots', t('выстрелов')], ['sessions', t('стрельб')]], w?.cleanUnit === 'sessions' ? 'sessions' : 'shots', () => explain());
  const summary = h('p', { class: 'remind-sum small' });
  const explain = () => {
    const n = num(every);
    const d = num(delay);
    const forms = unit.value === 'sessions' ? [t('стрельба'), t('стрельбы'), t('стрельб')] : [t('выстрел'), t('выстрела'), t('выстрелов')];
    const when = n ? t('Напомню, когда после чистки наберётся {n} {w}', { n: fmt.num(n), w: plural(n, forms) }) : t('Напомню после каждой стрельбы');
    const wait = d ? t('не сразу, а через {n} {w}, если ствол так и не почистили', { n: fmt.num(d), w: plural(d, [t('день'), t('дня'), t('дней')]) }) : null;
    const session = n && unit.value === 'sessions' ? t('Стрельба — день, когда из ствола стреляли.') : null;
    summary.replaceChildren(`${[when, wait].filter(Boolean).join(' — ')}.`, session ? ` ${session}` : '');
  };
  every.addEventListener('input', explain);
  delay.addEventListener('input', explain);
  explain();
  const el = box(t('Напоминание о чистке'), h('div', { class: 'remind' },
    h('div', { class: 'remind-field' }, h('span', { class: 'field-label' }, t('Напоминать каждые')), h('div', { class: 'remind-row' }, every, unit)),
    h('div', { class: 'remind-field' }, h('span', { class: 'field-label' }, t('Если не почистил — напомнить через')), h('div', { class: 'remind-row' }, delay, h('span', { class: 'muted' }, t('дн.')))),
    summary));
  return { el, values: () => ({ cleanEvery: num(every), cleanUnit: unit.value === 'sessions' ? 'sessions' : 'shots', cleanDelay: num(delay) }) };
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

/**
 * Відредаговане фото зберігається як нове (новий id): так інші пристрої докачають новий файл,
 * а старий піде в кошик Диска. Якщо воно було головним — головним стає нове.
 */
async function editWeaponPhoto(p) {
  const blob = await db.getBlob(p.id);
  if (!blob) { toast(t('Полное фото ещё не загрузилось — изменить можно после синхронизации')); return null; }
  let result;
  try {
    result = await editPhoto(blob);
  } catch (err) {
    toast(err.message);
    return null;
  }
  if (!result) return null;
  const id = db.uid();
  const fresh = { ...p, id, thumb: result.thumb, w: result.w, h: result.h, driveId: null };
  sync.trashPhoto((await db.get('photos', p.id))?.driveId);
  const w = findWeapon(p.weaponId);
  await db.write({
    photos: { put: [fresh], del: [p.id] },
    blobs: { put: [{ id, blob: result.blob }], del: [p.id] },
    ...(w?.coverId === p.id ? { weapons: { put: [{ ...w, coverId: id }] } } : {}),
  });
  await refresh();
  toast(t('Фото сохранено'));
  return fresh;
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
    onEdit: async (p) => {
      const fresh = await editWeaponPhoto(p);
      fill();
      return fresh;
    },
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
  const body = () => { const cur = findWeapon(w.id); return cur ? weaponBody(cur, () => close()) : null; };
  const tools = cardTools(() => { close(); weaponForm(findWeapon(w.id) ?? w); }, weaponHasMoves(w),
    () => { close(); removeWeapon(findWeapon(w.id) ?? w); });
  const close = sheet(w.name, body(), { live: body, tools });
}

const weaponHasMoves = (w) => state.movements.some((m) => m.weaponId === w.id);

/** Зброя з рухами — в архів (історія лишається), без рухів — видалити разом із фото. */
function removeWeapon(w) {
  if (weaponHasMoves(w)) {
    saveEntity('weapons', { ...w, archived: true }, t('Перенесено в архив'));
    return;
  }
  confirmSheet(t('Удалить оружие?'), w.name, t('Удалить'), async () => {
    await db.write({ weapons: { del: [w.id] } });
    await removePhotos(weaponPhotos(w.id));
    await refresh();
  });
}

function weaponBody(w, close) {
  const shots = M.weaponShots(state, w);
  const moves = state.movements.filter((m) => m.weaponId === w.id);
  const s = M.cleaningStatus(state, w);
  const cost = M.shotsCost(state, moves);
  const meters = [progress(t('Ресурс ствола'), shots, Number(w.barrelLife), { inline: true }), cleanRow(w, { inline: true })].filter(Boolean);
  return h('div', {},
    h('p', { class: 'muted' }, [w.caliber, w.serial && `№ ${w.serial}`, w.note].filter(Boolean).join(' · ')),
    h('div', { class: 'gun-top' }, gallery(w.id), targetsTile(w, () => close())),
    h('div', { class: 'stats even' },
      stat(t('настрел'), fmt.num(shots), 'accent'),
      stat(t('после чистки'), fmt.num(s.since)),
      cost ? stat(t('стоимость стрельб'), fmt.num(Math.round(cost))) : null),
    meters.length ? box(t('Состояние ствола'), h('div', { class: 'meters' }, meters)) : null,
    h('div', { class: 'btn-row' },
      btn(t('Записать стрельбу'), () => { close(); shootSheet({ weapon: w }); }, 'shoot'),
      btn(t('Почистил'), () => { close(); cleanSheet(w); }, 'buy')),
    w.scopes?.length ? box(t('Прицелы'), scopeList(w, true)) : null,
    permitBox(w),
    dopeBox(w),
    ammoPrecisionBox(w, { fold: true }),
    box(t('Стрельбы и чистки'), movementRows(moves, { skip: { weapon: true } }), { fold: `shots:${w.id}`, count: moves.length }));
}

// ---------- DOPE ----------

// Одиниці вводу таблиці: клацання (за ціною клацання прицілу), кут або сантиметри на цілі
const DOPE_UNITS = [['click', 'щелч.'], ['mil', 'MRAD'], ['moa', 'MOA'], ['cm', 'см']];

const dopeScope = (w, d) => w.scopes?.find((s) => s.id === d.scopeId) ?? null;

/** Ключ для toMrad: для клацань — ціна клацання прицілу, інакше сама одиниця. */
const dopeUnitKey = (unit, scope) => (unit === 'click' ? scope?.click ?? null : unit);

/** «Приціл · Набій» таблиці; видалені — «(удалено)». */
function dopeTitle(w, d) {
  const scope = dopeScope(w, d);
  const cart = findCartridge(d.cartridgeId);
  return [scope?.name ?? (d.scopeId ? t('(удалено)') : t('Без прицела')),
    cart?.name ?? (d.cartridgeId ? t('(удалено)') : null)].filter(Boolean).join(' · ');
}

/** Блок DOPE у картці зброї: таблиці поправок по дистанціях, згорнутий за замовчуванням. */
function dopeBox(w) {
  const list = w.dope ?? [];
  return box(t('DOPE — поправки по дистанциям'), [
    ...list.map((d) => dopeCard(w, d)),
    list.length ? null : h('p', { class: 'muted small' }, t('Таблица: на какой дистанции сколько щелчков крутить или сколько выносить по сетке. Для каждого прицела и патрона — своя.')),
    btn(t('+ таблица поправок'), () => dopeForm(w)),
  ], { fold: `dope:${w.id}`, count: list.length });
}

/** Одна таблиця: дистанція → поправка барабаном і винос; внизу — розрахунок для іншої дистанції. */
function dopeCard(w, d) {
  const scope = dopeScope(w, d);
  const reticle = reticleOf(scope);
  const rows = M.dopeRows(d.rows, scope?.zero);
  const table = h('table', { class: 'dope' },
    h('thead', {}, h('tr', {}, h('th', {}, t('м')), h('th', {}, t('Барабан')), h('th', {}, t('Вынос')))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.zero ? 'zero' : '' },
      h('td', {}, fmt.num(r.distance)),
      h('td', {}, r.zero ? t('пристрелка') : elevText(r.mrad, scope?.click)),
      h('td', {}, r.zero ? '0' : holdText(r.mrad, r.distance, reticle))))));
  const out = h('p', { class: 'dope-out small' });
  const at = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, placeholder: t('Другая дистанция, м'), class: 'dope-at' });
  at.addEventListener('input', () => {
    const dist = Number(at.value);
    const mrad = dist > 0 ? M.dopeAt(d.rows, dist, scope?.zero) : null;
    out.textContent = !(dist > 0) ? '' : mrad === null ? t('вне таблицы — добавьте строку')
      : `${elevText(mrad, scope?.click)} · ${t('вынос')} ${holdText(mrad, dist, reticle)}`;
  });
  return h('div', { class: 'dope-card' },
    h('div', { class: 'dope-head' }, h('span', { class: 'row-title' }, dopeTitle(w, d)),
      toolBtn('edit', t('Изменить'), () => dopeForm(w, d), 'small')),
    d.note ? h('p', { class: 'muted small' }, d.note) : null,
    table, h('div', { class: 'dope-calc' }, at, out));
}

/** Форма таблиці DOPE: приціл, набій, одиниці й рядки «дистанція — поправка» (плюс — вгору). */
function dopeForm(w, d = null) {
  const scopes = w.scopes ?? [];
  const cartridges = caliberOptions(state.cartridges.filter((c) => !c.archived || c.id === d?.cartridgeId), w.caliber);
  const f = form([
    { name: 'scopeId', label: t('Прицел'), type: 'select', value: d ? d.scopeId ?? '' : M.defaultScope(w)?.id ?? scopes[0]?.id ?? '', options: [...scopes.map((s) => [s.id, s.name]), ['', t('Без прицела')]], wide: true },
    { name: 'cartridgeId', label: t('Патрон'), type: 'select', value: d?.cartridgeId ?? cartridges.match[0]?.id ?? '', options: [['', t('— не указывать —')], ...cartridges.options], wide: true },
    { name: 'note', label: t('Примечание'), value: d?.note, placeholder: t('Погода, высота, источник цифр…'), wide: true },
  ]);
  const scope = () => scopes.find((s) => s.id === f.inputs.scopeId.value) ?? null;
  let unit = d?.unit ?? (scope()?.click ? 'click' : 'mil');
  const rowsBox = h('div', { class: 'dope-rows' });
  const toText = (mrad, dist) => {
    const v = M.fromMrad(mrad, dopeUnitKey(unit, scope()), dist);
    return v === null ? '' : String(unit === 'click' ? Math.round(Number(v.toFixed(6))) : Math.round(v * 100) / 100).replace('.', ',');
  };
  const readRows = () => [...rowsBox.querySelectorAll('.dope-row')].map((row) => ({
    distance: Number(row.querySelector('.dope-d').value),
    value: row.querySelector('.dope-v').value.trim(),
  }));
  const toMradRows = (list, u) => list.filter((r) => r.distance > 0 && r.value !== '')
    .map((r) => ({ distance: r.distance, mrad: M.toMrad(Number(r.value.replace(',', '.')), dopeUnitKey(u, scope()), r.distance) }));
  const addRow = (distance = '', value = '') => {
    const dist = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, placeholder: t('м'), class: 'dope-d' });
    dist.value = distance;
    const val = h('input', { type: 'text', inputmode: 'decimal', placeholder: '+0', class: 'dope-v' });
    val.value = value;
    const row = h('div', { class: 'dope-row' }, dist, val,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Удалить'), onclick: () => row.remove() }, '✕'));
    rowsBox.append(row);
  };
  const unitHint = h('small', { class: 'muted' });
  // Змінили одиниці — числа перераховуються, а не тлумачаться по-новому
  const units = h('div', {});
  const drawUnits = () => {
    const opts = DOPE_UNITS.filter(([k]) => k !== 'click' || scope()?.click);
    if (unit === 'click' && !scope()?.click) unit = 'mil';
    const next = chips(opts.map(([k, label]) => [k, k === 'click' && scope()?.click ? `${t(label)} (${clickLabel(scope().click)})` : t(label)]), unit, (u) => {
      const rows = readRows();
      const prev = unit;
      unit = u;
      rowsBox.replaceChildren();
      // Порожні рядки й ті, що не перевести (см без дистанції), лишаються як були
      rows.forEach((r) => {
        const mrad = r.value === '' ? null : M.toMrad(Number(r.value.replace(',', '.')), dopeUnitKey(prev, scope()), r.distance);
        addRow(r.distance || '', mrad === null || !Number.isFinite(mrad) ? r.value : toText(mrad, r.distance));
      });
      if (!rows.length) addRow();
      drawUnits();
    });
    next.classList.add('segmented');
    units.replaceChildren(next);
    unitHint.textContent = unit === 'cm' ? t('Сантиметры на цели: насколько попадание ниже точки прицеливания без поправки.') : t('Плюс — вверх (дальше пристрелки), минус — вниз.');
  };
  if (d) d.rows.forEach((r) => addRow(r.distance, toText(r.mrad, r.distance)));
  else (scope()?.zero >= 100 ? [200, 300, 400, 500] : [100, 200, 300]).forEach((x) => addRow(x));
  f.inputs.scopeId.addEventListener('change', drawUnits);
  const body = h('div', {}, f.el, h('h3', {}, t('Поправки')), units, unitHint,
    h('div', { class: 'dope-row dope-cols muted small' }, h('span', {}, t('Дистанция, м')), h('span', {}, t('Поправка'))),
    rowsBox, btn(t('+ строка'), () => addRow()));
  drawUnits();
  const remove = d ? () => confirmSheet(t('Удалить таблицу?'), dopeTitle(w, d), t('Удалить'), async () => {
    close();
    const cur = findWeapon(w.id) ?? w;
    await saveEntity('weapons', { ...cur, dope: (cur.dope ?? []).filter((x) => x.id !== d.id) }, t('Удалено'));
  }) : null;
  const close = sheet(d ? t('Таблица поправок') : t('Новая таблица поправок'), body, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
    tools: remove ? [toolBtn('delete', t('Удалить'), remove, 'danger')] : [],
  });
  async function save() {
    const raw = readRows().filter((r) => r.distance > 0 && r.value !== '');
    if (raw.some((r) => !Number.isFinite(Number(r.value.replace(',', '.'))))) { toast(t('Поправка — число, например 1,2 или -0,5')); return; }
    const byDistance = new Map(toMradRows(raw, unit).filter((r) => r.mrad !== null).map((r) => [r.distance, r]));
    const rows = [...byDistance.values()].sort((a, b) => a.distance - b.distance);
    if (!rows.length) { toast(t('Заполните хотя бы одну строку')); return; }
    const v = f.values();
    const card = { id: d?.id ?? db.uid(), scopeId: v.scopeId || null, cartridgeId: v.cartridgeId || null, unit, note: v.note || null, rows };
    const cur = findWeapon(w.id) ?? w;
    const list = cur.dope ?? [];
    close();
    await saveEntity('weapons', { ...cur, dope: d ? list.map((x) => (x.id === d.id ? card : x)) : [...list, card] }, t('Сохранено'));
  }
}

// ---------- дозвіл на зброю ----------

const DOC_ICON = '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>';
const PERMIT_FILL = { over: 'over', warn: 'warn', ok: '' };

/** Скільки лишилося словами: «1 р. 3 міс.», «3 міс.», менше місяця — у днях; прострочений — на скільки. */
function permitLeft(s) {
  const days = (n) => `${fmt.num(n)} ${plural(n, [t('день'), t('дня'), t('дней')])}`;
  if (s.days < 0) return t('просрочено на {n}', { n: days(-s.days) });
  if (!s.days) return t('сегодня последний день');
  if (!s.months) return t('осталось {n}', { n: days(s.days) });
  const [y, m] = [Math.floor(s.months / 12), s.months % 12];
  return t('осталось {n}', { n: [y ? t('{n} г.', { n: y }) : null, m ? t('{n} мес.', { n: m }) : null].filter(Boolean).join(' ') });
}

/** Смужка строку дозволу: убуває до кінця строку; червона — менше місяця, жовта — до 3 місяців, зелена — від 3. */
function permitMeter(w, { inline = false } = {}) {
  const s = M.permitStatus(w.permit);
  if (!s) return null;
  return meter(h('span', {}, t('Разрешение')), permitLeft(s), Math.max(4, s.left * 100), PERMIT_FILL[s.level], inline);
}

/** Стволи, у яких дозвіл скінчився або лишилося менше місяця, — найтерміновіші першими. */
const urgentPermits = () => state.weapons.filter((w) => !w.archived && M.permitStatus(w.permit)?.level === 'over')
  .sort((a, b) => M.permitStatus(a.permit).days - M.permitStatus(b.permit).days);

/** Над списком зброї: дозволи, що потребують уваги. */
function urgentPermitsBlock() {
  const urgent = urgentPermits();
  if (!urgent.length) return null;
  return h('div', { class: 'rows doc-urgent' }, urgent.map((w) => {
    const icon = h('span', { class: 'row-icon', 'aria-hidden': 'true' });
    icon.innerHTML = `<svg viewBox="0 0 24 24">${DOC_ICON}</svg>`;
    return h('button', { type: 'button', class: 'row', onclick: () => weaponDetail(w) },
      icon,
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t('Разрешение: {name}', { name: w.name })),
        h('span', { class: 'muted small' }, t('действует до {date}', { date: fmt.date(w.permit.expires) }))),
      h('span', { class: 'badge danger small' }, permitLeft(M.permitStatus(w.permit))));
  }));
}

/** Блок дозволу в картці зброї: смужка й номер з датою. */
function permitBox(w) {
  if (!w.permit) return null;
  const p = w.permit;
  return box(t('Разрешение на оружие'), [
    permitMeter(w),
    h('p', { class: 'muted small' }, [p.number ? `№ ${p.number}` : null, p.issued ? t('выдан {date}', { date: fmt.date(p.issued) }) : null,
      p.expires ? t('действует до {date}', { date: fmt.date(p.expires) }) : null].filter(Boolean).join(' · ')),
  ], { fold: `permit:${w.id}` });
}

/** Блок «Дозвіл на зброю» у формі зброї. */
function permitFields(w) {
  const p = w?.permit ?? {};
  const f = form([
    { name: 'number', label: t('Номер'), value: p.number, wide: true },
    { name: 'issued', label: t('Выдан'), type: 'dmy', value: p.issued, half: true },
    { name: 'expires', label: t('Действует до'), type: 'dmy', value: p.expires, half: true },
  ]);
  // Дозвіл на зберігання видають на 3 роки — «діє до» з дати видачі одним натиском
  const plus3 = h('button', {
    type: 'button',
    onclick: () => {
      const issued = f.values().issued;
      if (!issued) { toast(t('Сначала укажите дату выдачи')); f.inputs.issued.focus(); return; }
      const d = new Date(issued);
      d.setUTCFullYear(d.getUTCFullYear() + 3);
      f.inputs.expires.value = isoToDmy(d.toISOString().slice(0, 10));
    },
  }, t('+3 года от выдачи'));
  const toAll = toolBtn('copy', t('Эти даты — всем стволам'), () => permitDatesToAll(w, f.values()), 'small');
  const values = () => {
    const v = f.values();
    const permit = { number: v.number?.trim() || null, issued: v.issued || null, expires: v.expires || null };
    return { permit: permit.number || permit.issued || permit.expires ? permit : null };
  };
  const invalid = () => {
    const bad = f.invalid();
    if (bad) { toast(t('Дата «{label}» — в виде ДД.ММ.ГГГГ', { label: bad.label })); f.inputs[bad.name].focus(); }
    return Boolean(bad);
  };
  return { el: box([t('Разрешение на оружие'), toAll], [f.el, h('div', { class: 'chips permit-quick' }, plus3)]), values, invalid };
}

/** Ті самі дати видачі й закінчення — решті стволів (номери в кожного свої, їх не чіпаємо). */
function permitDatesToAll(w, v) {
  if (Number.isNaN(v.issued) || Number.isNaN(v.expires)) { toast(t('Дата — в виде ДД.ММ.ГГГГ')); return; }
  if (!v.issued && !v.expires) { toast(t('Сначала укажите даты')); return; }
  const others = state.weapons.filter((x) => !x.archived && x.id !== w?.id);
  if (!others.length) { toast(t('Других стволов нет')); return; }
  const dates = [v.issued ? t('выдан {date}', { date: fmt.date(v.issued) }) : null,
    v.expires ? t('действует до {date}', { date: fmt.date(v.expires) }) : null].filter(Boolean).join(' · ');
  confirmSheet(t('Эти даты — всем стволам?'), `${dates}: ${others.map((x) => x.name).join(', ')}`, t('Проставить'), async () => {
    await db.write({
      weapons: {
        put: others.map((x) => ({
          ...x, permit: { number: x.permit?.number ?? null, issued: v.issued || null, expires: v.expires || null },
        })),
      },
    });
    await refresh();
    toast(t('Даты проставлены: {n}', { n: others.length }));
  });
}

/** Раз на день при відкритті: дозволи, що скінчилися або лишилося менше місяця. */
function permitsReminder() {
  const urgent = urgentPermits();
  if (!urgent.length || recall('shooting-log:docs-reminded') === M.today()) return;
  remember('shooting-log:docs-reminded', M.today());
  toast(t('Разрешение на оружие: {names}', { names: urgent.map((w) => w.name).join(', ') }), {
    action: t('Показать'),
    onAction: () => { location.hash = '#guns'; },
  });
}

// ---------- журнал ----------

const KIND_ICON = {
  buy: '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  shot: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  reload: '<path d="M6 21V11l.8-1.5V7c0-1.4.6-2.8 1.2-3.5.6.7 1.2 2.1 1.2 3.5v2.5l.8 1.5v10z"/><path d="M6 14h4M17 7v8M13 11h8"/>',
  consume: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M9 12h6"/>',
  adjust: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  // Маслянка: корпус, горловина, ручка, носик і крапля.
  clean: '<path d="M4 11h9l3 3v6H4z"/><path d="M7.5 11V8.5h3V11"/><path d="M4 13.5H2.5V17H4"/><path d="M16 14l5-5"/><path d="M21 12.2c0 .8-.4 1.3-1 1.3s-1-.5-1-1.3c0-.6.5-1.3 1-1.9.5.6 1 1.3 1 1.9z"/>',
};

function kindIcon(kind) {
  const el = h('span', { class: 'row-icon', 'aria-hidden': 'true' });
  el.innerHTML = KIND_ICON[kind] ? `<svg viewBox="0 0 24 24">${KIND_ICON[kind]}</svg>` : '•';
  return el;
}

function movementTitle(m) {
  if (m.kind === 'clean') return findWeapon(m.weaponId)?.name ?? t('(удалено)');
  return findCartridge(m.cartridgeId)?.name ?? findComponent(m.componentId)?.name ?? m.caliber ?? '—';
}

/**
 * Рядок руху. date — дата заголовком (у картках; у Журналі дата в заголовку групи), а тип руху
 * видно з іконки. skip.weapon / skip.cartridge — не повторювати ствол чи набій картки.
 */
function logRow(m, { date = false, skip = {} } = {}) {
  const money = m.kind === 'shot' ? M.shotCost(state, m) : m.price;
  const gun = m.kind === 'clean' || skip.weapon ? null : shotGunLabel(m);
  // У картці набій — поруч із датою в заголовку; стрільба без набою з БК — калібр і чому без списання.
  const name = date && m.kind !== 'clean' && !(skip.cartridge && m.cartridgeId) ? movementTitle(m) : null;
  const noStock = date && m.kind === 'shot' && !m.cartridgeId && !m.foreignAmmo ? t('без списания из БК') : null;
  const title = date ? [fmt.date(m.date), name].filter(Boolean).join(' · ') : movementTitle(m);
  const each = buyUnitPrice(m);
  const sub = [date ? null : t(M.KINDS[m.kind]), gun, m.foreignAmmo ? t('чужие патроны') : noStock, m.note, money ? fmt.money(money) : null,
    each ? t('{price} за шт', { price: fmt.money(each) }) : null]
    .filter(Boolean).join(' · ');
  const unit = m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : '';
  return h('button', { type: 'button', class: `row kind-${m.kind}`, onclick: () => movementDetail(m) },
    kindIcon(m.kind),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'muted small' }, sub) : null),
    m.kind === 'clean' ? null : h('span', { class: `row-qty ${m.qty < 0 ? 'neg' : m.qty > 0 ? 'pos' : ''}` }, `${fmt.signed(m.qty)}${unit ? ` ${unit}` : ''}`));
}

// Свіжий запис зі стану: після зміни ствола шторка тримає старий об'єкт.
const freshMovement = (m) => state.movements.find((x) => x.id === m.id) ?? m;

/**
 * Ствол у записі стрільби можна змінити — так історичний настріл розноситься по зброї.
 * Прицел при цьому стає прицелом нового ствола за замовчуванням.
 */
function shotWeaponSelect(m, onChange) {
  const guns = caliberOptions(state.weapons.filter((w) => w.id === m.weaponId || !w.archived), m.caliber);
  return h('select', {
    class: 'inline-select', 'aria-label': t('Оружие'),
    onchange: async (e) => {
      const foreignWeapon = e.target.value === FOREIGN;
      const weaponId = foreignWeapon ? null : e.target.value || null;
      const warn = caliberMismatch({ caliber: findCartridge(m.cartridgeId)?.caliber ?? m.caliber }, findWeapon(weaponId));
      const { foreignWeapon: _old, foreignWeaponName: _name, ...rest } = freshMovement(m);
      await saveEntity('movements', { ...rest, weaponId, scopeId: M.defaultScope(findWeapon(weaponId))?.id ?? null, ...(foreignWeapon ? { foreignWeapon } : {}) },
        warn ? `${t('Сохранено')} · ${warn}` : t('Сохранено'));
      onChange?.();
    },
  }, selectOptions([['', t('— не указывать —')], [FOREIGN, t('Чужое оружие')], ...guns.options], m.foreignWeapon ? FOREIGN : m.weaponId ?? ''));
}

function shotScopeSelect(m) {
  const w = findWeapon(m.weaponId);
  return h('select', {
    class: 'inline-select', 'aria-label': t('Прицел'),
    onchange: async (e) => {
      await saveEntity('movements', { ...freshMovement(m), scopeId: e.target.value || null }, t('Сохранено'));
    },
  }, selectOptions(scopeOptions(w), m.scopeId ?? ''));
}

/** Мішень на кнопці: ті самі кола, що й на вкладці «Полігон». */
function targetIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
  return el;
}

/** Мішені запису стрільби: кожна відкривається, «+» додає ще одну (100 і 300 м за одну стрільбу тощо). */
function shotTargets(m, closeSheet) {
  const list = state.targets.filter((x) => x.movementId === m.id).sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  return h('div', {},
    list.length ? box(t('Мишени'), h('div', { class: 'rows' }, list.map((tg) => targetRow(tg, closeSheet)))) : null,
    h('div', { class: 'btn-row' }, btn([targetIco(), list.length ? t('+ ещё мишень') : t('+ Мишень')], () => {
      closeSheet();
      newTarget({ movement: m });
    })));
}

function movementDetail(m) {
  // Спершу перегляд: правка вмикається олівцем, щоб тап по запису нічого не зачепив.
  let edit = false;
  // Шторка живе: після кожної правки тіло перемальовується, тож похідні рядки (ціна за шт, вартість) не брешуть.
  const body = () => { const cur = state.movements.find((x) => x.id === m.id); return cur ? movementBody(cur, () => close(), edit) : null; };
  const pencil = toolBtn('edit', t('Изменить'), () => {
    edit = !edit;
    pencil.classList.toggle('on', edit);
    refreshSheets();
  });
  const del = toolBtn('delete', t('Удалить запись'), () => {
    const batch = m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
    close();
    confirmSheet(t('Удалить запись?'), batch.length > 1 ? t('Вместе со связанными движениями ({n}).', { n: batch.length }) : t('Остатки и настрел пересчитаются.'), t('Удалить'), async () => {
      await db.write({ movements: { del: batch.map((x) => x.id) } });
      await refresh();
      toast(t('Запись удалена'), {
        action: t('Вернуть'),
        onAction: async () => { await db.write({ movements: { put: batch } }); await refresh(); },
      });
    });
  }, 'danger');
  const close = sheet(t(M.KINDS[m.kind]), body(), { live: body, tools: [pencil, del] });
}

/** Усе про рух і вся його правка в одному місці: кожне поле зберігається на зміну. */
function movementBody(m, close, edit = false) {
  const batch = m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
  const w = findWeapon(m.weaponId);
  const save = (fields) => saveEntity('movements', { ...freshMovement(m), ...fields }, t('Сохранено'));
  const input = (attrs, onSave) => h('input', {
    class: 'inline-select', autocomplete: 'off', ...attrs,
    onchange: (e) => onSave(e.target.value.trim()),
  });
  // Пачку (спорядження зі списанням компонентів) кількістю не правлять: її треба перераховувати по всьому рецепту.
  const editQty = m.kind !== 'clean' && batch.length === 1;
  const editPrice = m.kind === 'buy' || Number(m.price) > 0;
  const dateInput = input({ type: 'date', value: m.date ?? M.today(), 'aria-label': t('Дата') }, (v) => save({ date: v || m.date }));
  const qtyInput = h('input', {
    class: 'inline-select', type: 'number', step: 'any', min: 0, inputmode: 'decimal', autocomplete: 'off', 'aria-label': t('Количество'),
    // Нуль або сміття замість кількості — просто повертаємо попереднє: рух без кількості не має сенсу.
    onchange: (e) => {
      const n = Math.abs(Number(e.target.value.replace(',', '.')));
      if (!n) { e.target.value = Math.abs(m.qty); return; }
      save({ qty: n * (m.qty < 0 ? -1 : 1) });
    },
  });
  qtyInput.value = Math.abs(m.qty);
  const priceInput = input({ type: 'number', step: 'any', min: 0, inputmode: 'decimal', value: m.price ?? '', 'aria-label': t('Сумма') },
    (v) => save({ price: v ? Number(v.replace(',', '.')) : undefined }));
  const noteInput = input({ type: 'text', value: m.note ?? '', placeholder: t('Примечание'), 'aria-label': t('Примечание') },
    (v) => save({ note: v || undefined }));
  const shotCost = M.shotCost(state, m);
  return h('div', {},
    h('dl', { class: 'kv' },
      h('dt', {}, t('Дата')), h('dd', {}, edit ? dateInput : fmt.date(m.date)),
      // Стрільба без набою з БК позиції не має — замість неї був би той самий калібр.
      m.kind === 'shot' && !m.cartridgeId ? null : [h('dt', {}, t('Позиция')), h('dd', {}, movementTitle(m))],
      m.caliber ? [h('dt', {}, t('Калибр')), h('dd', {}, m.caliber)] : null,
      m.kind === 'clean' ? null : [h('dt', {}, t('Количество')), h('dd', {}, edit && editQty ? qtyInput : fmt.signed(m.qty))],
      m.kind === 'shot'
        ? [h('dt', {}, t('Оружие')), h('dd', {}, edit ? shotWeaponSelect(m) : (w?.name ?? (m.foreignWeapon ? t('Чужое оружие') : '—'))),
          ...(m.foreignWeapon ? [h('dt', {}, t('Какое')), h('dd', {}, edit
            ? [input({ type: 'text', value: m.foreignWeaponName ?? '', list: 'foreign-list', placeholder: t('АКМ'), 'aria-label': t('Какое оружие') },
              (v) => save({ foreignWeaponName: v || undefined })), foreignList()]
            : (m.foreignWeaponName || '—'))] : []),
          ...(w?.scopes?.length ? [h('dt', {}, t('Прицел')), h('dd', {}, edit ? shotScopeSelect(m)
            : (w.scopes.find((sc) => sc.id === m.scopeId)?.name ?? '—'))] : [])]
        : w && m.kind !== 'clean' ? [h('dt', {}, t('Оружие')), h('dd', {}, w.name)] : null,
      editPrice ? [h('dt', {}, m.kind === 'shot' ? t('Стоимость') : t('Сумма')), h('dd', {}, edit ? priceInput : (m.price ? fmt.money(m.price) : '—'))]
        : m.kind === 'shot' && shotCost ? [h('dt', {}, t('Стоимость')), h('dd', {}, `${fmt.money(shotCost)} (${t('по средней цене')})`)] : null,
      buyUnitPrice(m) ? [h('dt', {}, t('Цена за шт')), h('dd', {}, fmt.money(buyUnitPrice(m)))] : null,
      ...(edit || m.note ? [h('dt', {}, t('Примечание')), h('dd', {}, edit ? noteInput : m.note)] : [])),
    m.kind === 'shot' && !m.cartridgeId
      ? h('p', { class: 'muted small' }, m.foreignAmmo ? t('Чужие патроны: склад БК не меняется, выстрелы идут в настрел.') : t('Запись без списания из БК — учитывается только в настреле.'))
      : null,
    m.kind === 'shot' ? shotTargets(m, close) : null,
    batch.length > 1 ? box(t('Списано компонентов'), h('div', { class: 'rows' }, batch.filter((x) => x.id !== m.id).map((x) => logRow(x)))) : null);
}

let logWeapon = '';

const PERIODS = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];
const PERIOD_KEY = 'shooting-log:log-period-v2';
let logPeriod = PERIODS.some(([k]) => k === recall(PERIOD_KEY)) ? recall(PERIOD_KEY) : 'year';

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ключ періоду (сортується як рядок) і підпис. Тиждень — з понеділка. */
function periodOf(date) {
  if (!date) return { key: '', label: t('без даты') };
  const [y, m, d] = date.split('-').map(Number);
  if (logPeriod === 'year') return { key: String(y), label: String(y) };
  if (logPeriod === 'month') {
    const label = new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
    return { key: date.slice(0, 7), label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  if (logPeriod === 'week') {
    const start = new Date(y, m - 1, d - ((new Date(y, m - 1, d).getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { key: isoDate(start), label: `${fmt.date(isoDate(start)).slice(0, 5)} – ${fmt.date(isoDate(end))}` };
  }
  return { key: date, label: fmt.date(date) };
}

function logGroups(list) {
  const groups = new Map();
  for (const m of list) {
    const p = periodOf(m.date);
    if (!groups.has(p.key)) groups.set(p.key, { ...p, rows: [] });
    groups.get(p.key).rows.push(m);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key)).map((g) => {
    const shots = -M.sumBy(g.rows, (m) => m.kind === 'shot');
    const cost = M.shotsCost(state, g.rows);
    return fold(`log:${logPeriod}:${g.key}`,
      // Дві строки з кожного боку: великий настріл і сума не вміщаються в один рядок на телефоні.
      [h('span', { class: 'fold-stack' }, h('span', { class: 'fold-title' }, g.label), h('span', { class: 'fold-meta' }, t('записей: {n}', { n: g.rows.length }))),
        shots ? h('span', { class: 'fold-sum stack' }, t('{n} выстр.', { n: fmt.num(shots) }), cost ? h('span', { class: 'fold-cost' }, fmt.money(cost)) : null) : null],
      h('div', { class: 'rows' }, g.rows.map((m) => logRow(m))));
  });
}

/** Загальний настріл: усі калібри й стволи разом, з настрілом до початку обліку. */
function totalHero() {
  const { fired, initial, total } = M.totalShots(state);
  if (!total) return null;
  return h('section', { class: 'hero lv' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('Общий настрел')),
      h('div', { class: 'hero-value' }, fmt.num(total))),
    levelArt(shotLevel(total)),
    h('div', { class: 'lv-sub lv-wide' }, initial
      ? t('все калибры и стволы: в журнале {a}, до начала учёта {b}', { a: fmt.num(fired), b: fmt.num(initial) })
      : t('все калибры и стволы')));
}

function shotsPanel() {
  const totals = M.shotsByCaliber(state);
  if (!totals.length) return null;
  const hasInitial = state.weapons.some((w) => Number(w.initialShots) > 0);
  const all = totals.reduce((s, row) => s + row.total, 0);
  const pct = (n, of) => (of > 0 ? Math.max(0, Math.round((n / of) * 100)) : 0);
  return box(t('Настрел по калибрам и оружию'), h('div', { class: 'shots' },
    totals.map((row) => h('div', { class: 'shots-cal' },
      h('div', { class: 'shots-head' },
        cartridgeIcon(row.caliber),
        h('span', { class: 'shots-name' }, row.caliber || t('без калибра'), h('span', { class: 'muted small' }, `${pct(row.total, all)}%`)),
        h('b', {}, fmt.num(row.total))),
      row.weapons.map(([id, n]) => h('div', { class: 'shots-gun small' },
        h('span', { class: id && !id.startsWith(`${FOREIGN}:`) ? '' : 'muted' },
          id?.startsWith(`${FOREIGN}:`) ? foreignLabel(id.slice(FOREIGN.length + 1)) : id ? (findWeapon(id)?.name ?? t('(удалено)')) : t('ствол не указан')),
        h('span', {}, fmt.num(n)),
        h('span', { class: 'shots-bar', style: `--w:${pct(n, row.total)}%` }))))),
    hasInitial ? h('p', { class: 'muted small shots-note' }, t('Только записи журнала. Настрел до начала учёта виден на вкладке «Оружие».')) : null));
}

function renderLog() {
  const filters = [['all', t('Все')], ['shot', t('Стрельба')], ['buy', t('Покупки')], ['reload', t('Снаряжение')], ['adjust', t('Корректировки')], ['clean', t('Чистка')]];
  const guns = state.weapons.filter((w) => !w.archived || state.movements.some((m) => m.weaponId === w.id)).sort(byName);
  if (logWeapon && !findWeapon(logWeapon)) logWeapon = '';
  const list = state.movements
    .filter((m) => m.kind !== 'consume' && (logFilter === 'all' || m.kind === logFilter) && (!logWeapon || m.weaponId === logWeapon))
    .sort(M.byDateDesc);
  $('subtitle').textContent = t('записей: {n}', { n: list.length });
  // Три ряди фільтрів з'їдали пів екрана: період лишили перемикачем, тип і зброю звели у два списки в один рядок.
  const period = chips(PERIODS.map(([k, label]) => [k, t(label)]), logPeriod, (v) => {
    logPeriod = v;
    remember(PERIOD_KEY, v);
    render();
  });
  period.classList.add('segmented');
  const typeSelect = h('select', {
    class: 'log-sel', 'aria-label': t('Тип записи'),
    onchange: (e) => { logFilter = e.target.value; render(); },
  }, filters.map(([k, label]) => h('option', { value: k, selected: k === logFilter }, label)));
  const gunSelect = guns.length ? h('select', {
    class: 'log-sel', 'aria-label': t('Оружие'),
    onchange: (e) => { logWeapon = e.target.value; render(); },
  }, h('option', { value: '' }, t('Всё оружие')), guns.map((w) => h('option', { value: w.id, selected: w.id === logWeapon }, w.name))) : null;
  return h('div', {},
    logWeapon
      ? hero(findWeapon(logWeapon).name, fmt.num(M.weaponShots(state, findWeapon(logWeapon))), t('настрел всего, вместе с настрелом до начала учёта'))
      : [totalHero(), shotsPanel()],
    h('div', { class: 'log-controls' }, period, h('div', { class: 'log-selects' }, typeSelect, gunSelect)),
    list.length
      ? logGroups(list)
      : empty(t('Записей нет'), t('Свайпните патрон в разделе БК, чтобы купить или списать.')));
}

// ---------- кучність ----------

// Фото мішені більше за фото зброї: на 2400 px пробоїна .223 на 100 м — це ще 20+ пікселів.
const TARGET_PHOTO = 2400;

let targetUnit = UNITS.some(([k]) => k === recall('shooting-log:target-unit')) ? recall('shooting-log:target-unit') : 'cm';
let targetWeapon = '';

const targetPhoto = (tg) => state.photos.find((p) => p.id === tg.photoId);

function targetTitle(tg) {
  return [findWeapon(tg.weaponId)?.name, findCartridge(tg.cartridgeId)?.name].filter(Boolean).join(' · ') || t('Мишень');
}

/**
 * Найкращий розмах серед мішеней: та сама мірка, що й у «Набоях за купчастістю» —
 * групи від 3 пробоїн і порівняння за кутом, інакше 3,8 см на 30 м виглядали б кращими за 5 см на 300 м.
 */
function bestSpread(targets) {
  return targets.map((tg) => {
    const g = bestGroup(tg, M.PRECISION_MIN_HOLES);
    return g ? {
      spread: g.stats.spread, distance: tg.distance, cartridgeId: tg.cartridgeId,
      at100: tg.distance > 0 ? (g.stats.spread * 100) / tg.distance : Infinity,
    } : null;
  }).filter(Boolean).sort((a, b) => a.at100 - b.at100)[0] ?? null;
}

/** Рядок купчастості для картки списку: іконка й найкращий розмах у см і MOA. */
function precisionLine(w) {
  const best = bestSpread(state.targets.filter((x) => x.weaponId === w.id));
  if (!best) return null;
  const ammo = findCartridge(best.cartridgeId)?.name;
  return h('div', { class: 'card-precision' }, kindIcon('shot'),
    h('span', {}, t('лучший размах {v}', {
      v: [length(best.spread, 'cm'), best.distance > 0 ? length(best.spread, 'moa', best.distance) : null].filter(Boolean).join(' · '),
    })),
    ammo ? h('span', { class: 'muted small' }, ammo) : null);
}

/** Найкраща група мішені — з найменшим розмахом; min — скільки пробоїн щонайменше. */
function bestGroup(tg, min = 2) {
  const photo = targetPhoto(tg);
  if (!photo) return null;
  return M.targetStats(tg, photo).filter((g) => g.stats?.n >= min).sort((a, b) => a.stats.spread - b.stats.spread)[0] ?? null;
}

function unitChips(onPick) {
  const row = chips(UNITS.map(([k, label]) => [k, t(label)]), targetUnit, (v) => {
    targetUnit = v;
    remember('shooting-log:target-unit', v);
    onPick();
  });
  row.classList.add('segmented');
  return row;
}

/** Вхід у «Кучность»: з журналу — усі мішені, з картки зброї — лише її. */
/** Плитка купчастості поруч із фото — того ж розміру: значок, найкращий розкид і підпис. */
function targetsTile(weapon, closeSheet = null) {
  const best = bestSpread(state.targets.filter((x) => x.weaponId === weapon.id));
  // На плитці — кутова мірка (групи з різних дистанцій порівнянні); без дистанції лишаються сантиметри.
  const value = best ? length(best.spread, best.distance > 0 ? 'moa' : 'cm', best.distance) : '—';
  return h('button', {
    type: 'button', class: 'tg-tile', title: t('Кучность'),
    onclick: () => {
      closeSheet?.();
      targetWeapon = weapon.id;
      rangeSeg = 'targets';
      remember('shooting-log:range-seg', rangeSeg);
      location.hash = '#targets';
    },
  }, kindIcon('shot'),
  h('span', { class: 'tg-tile-value' }, value),
  h('span', { class: 'tg-tile-label' }, t('Кучность')));
}

/**
 * Порівняння набоїв ствола за кучністю: найкучніший зверху, смужка — середній радіус відносно найгіршого.
 * Розміри зведені до 100 м, тому кутові одиниці чесні, а сантиметри — «на 100 м».
 */
// Менше груп на набій — порівняння ще випадкове, позначаємо «мало даних»
const FEW_GROUPS = 3;

function ammoPrecisionBox(w, { fold = false } = {}) {
  const rows = M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id), state.photos);
  if (!rows.length) return null;
  const worst = rows.at(-1).meanRadius;
  const len = (mm) => length(mm, targetUnit, 100);
  const groups = (n) => `${fmt.num(n)} ${plural(n, [t('группа'), t('группы'), t('групп')])}`;
  const list = rows.map((r, i) => {
    const c = findCartridge(r.cartridgeId);
    const sub = [groups(r.groups), t('{n} выстр.', { n: r.shots }), t('лучший размах {v}', { v: len(r.best) }),
      r.offset ? `${t('СТП')}: ${offsetText(r.offset, targetUnit, 100)}` : null].filter(Boolean).join(' · ');
    const badge = r.groups < FEW_GROUPS ? h('span', { class: 'badge small' }, t('мало данных'))
      : i === 0 && rows.length > 1 ? h('span', { class: 'badge ok small' }, t('самый кучный')) : null;
    return h('button', { type: 'button', class: 'row ap-row', onclick: () => precisionTargets(w, r) },
      cartridgeIcon(c?.caliber ?? w.caliber),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, c?.name ?? t('(удалено)'), badge),
        h('span', { class: 'muted small' }, sub),
        h('div', { class: 'bar' }, h('div', { class: `fill ${i === 0 && rows.length > 1 ? '' : 'ap'}`, style: `width:${Math.max(4, (r.meanRadius / worst) * 100)}%` }))),
      h('span', { class: 'tg-best col' }, len(r.meanRadius), h('small', { class: 'muted' }, t('ср. радиус'))));
  });
  const note = h('p', { class: 'muted small' }, t('Число справа — средний радиус: среднее расстояние пробоин от центра группы, меньше — кучнее. Учтены группы от {n} выстрелов; мишени на разных дистанциях приведены к 100 м.', { n: M.PRECISION_MIN_HOLES }));
  return box(t('Патроны по кучности'), [h('div', { class: 'rows' }, list), note],
    fold ? { fold: `precision:${w.id}`, count: rows.length } : {});
}

/** У групі ствола на вкладці мішеней — порівняння, лише коли є з чим: два набої і більше. */
function precisionInGroup(weaponId) {
  const w = findWeapon(weaponId);
  if (!w || M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id), state.photos).length < 2) return null;
  return ammoPrecisionBox(w);
}

/** Мішені ствола з одним набоєм — звідки взялися цифри порівняння. */
function precisionTargets(w, r) {
  const list = state.targets.filter((x) => r.targets.includes(x.id)).sort(M.byDateDesc);
  sheet(findCartridge(r.cartridgeId)?.name ?? t('Мишени'), h('div', { class: 'rows' }, list.map((tg) => targetRow(tg))));
}

function targetThumb(tg) {
  const canvas = h('canvas', { class: 'tg-thumb' });
  const photo = targetPhoto(tg);
  if (photo?.thumb) paintPreview(canvas, photo.thumb, tg, 160).catch(() => {});
  return canvas;
}

function targetRow(tg, beforeOpen = null) {
  const best = bestGroup(tg);
  const holes = (tg.groups ?? []).reduce((sum, g) => sum + g.holes.length, 0);
  const sub = [fmt.date(tg.date), tg.distance ? t('{n} м', { n: fmt.num(tg.distance) }) : null,
    holes ? t('{n} выстр.', { n: holes }) : t('не размечена'), tg.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row tg-row', onclick: () => { beforeOpen?.(); targetDetail(tg); } },
    targetThumb(tg),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, targetTitle(tg)), h('span', { class: 'muted small' }, sub)),
    best ? h('span', { class: 'tg-best' }, length(best.stats.spread, targetUnit, tg.distance)) : null);
}

// ---------- полігон: мішені й таймер ----------

const RANGE_SEGS = [['exercises', 'Упражнения'], ['targets', 'Мишени'], ['timer', 'Таймер']];
let rangeSeg = RANGE_SEGS.some(([k]) => k === recall('shooting-log:range-seg')) ? recall('shooting-log:range-seg') : 'exercises';

/** Вкладка «Полігон»: перемикач розділів, розділ запам'ятовується. */
function renderRange() {
  const seg = chips(RANGE_SEGS.map(([k, label]) => [k, t(label)]), rangeSeg, (v) => {
    rangeSeg = v;
    remember('shooting-log:range-seg', v);
    render();
  });
  seg.classList.add('segmented', 'range-seg');
  return h('div', {}, seg, rangeSeg === 'timer' ? renderTimer() : rangeSeg === 'exercises' ? renderExercises() : renderTargets());
}

function renderExercises() {
  $('subtitle').textContent = t('результатов: {n}', { n: state.scores.length });
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  const cartridges = state.cartridges.filter((c) => !c.archived)
    .sort((a, b) => collate(a.caliber, b.caliber) || collate(a.name, b.name))
    .map((c) => [c.id, `${c.name} · ${c.caliber}`, M.cartridgeStock(state, c.id)]);
  return exercisesPanel({
    scores: state.scores, weapons, cartridges, drills: state.drills, box, stat,
    // Мішені чіпляються до руху стрільби, тож у результату вони є лише там, де списували набої.
    targetsOf: (r) => {
      const m = state.movements.find((x) => x.id === r.movementId);
      return m ? shotTargets(m, () => {}) : null;
    },
    onSave: async (r, consume) => {
      const score = { id: db.uid(), created: Date.now(), ...r };
      if (!consume) { await saveEntity('scores', score, t('Результат сохранён')); return; }
      const c = findCartridge(consume.cartridgeId);
      const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
      // Вартість фіксуємо на момент списання — як у звичайній стрільбі.
      const m = movement({
        kind: 'shot', cartridgeId: c.id, caliber: c.caliber, qty: -consume.qty, date: r.date,
        weaponId: r.weaponId || null, scopeId: M.defaultScope(findWeapon(r.weaponId))?.id ?? null,
        price: unit ? +(unit * consume.qty).toFixed(2) : null, note: consume.note,
      });
      score.movementId = m.id;
      await addMovements([m], t('Результат сохранён · −{n}', { n: fmt.num(consume.qty) }), { scores: { put: [score] } });
    },
    onDelete: async (r) => {
      await db.write({ scores: { del: [r.id] } });
      await refresh();
      toast(t('Удалено'));
    },
  });
}

function renderTimer() {
  $('subtitle').textContent = t('серий: {n}', { n: state.drills.length });
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  return h('div', {},
    timerPanel({ weapons, onSave: (drill) => saveEntity('drills', { id: db.uid(), created: Date.now(), ...drill }, t('Серия сохранена')) }),
    drillsBox());
}

/** Збережені серії: новіші зверху, підсумок рядком. */
function drillsBox() {
  const list = [...state.drills].sort(M.byDateDesc);
  if (!list.length) return null;
  return box(t('Серии'), h('div', { class: 'rows' }, list.map((d) => {
    const s = M.drillStats(d.shots);
    const sub = [fmt.date(d.date), findWeapon(d.weaponId)?.name, d.note].filter(Boolean).join(' · ');
    return h('button', { type: 'button', class: 'row', onclick: () => drillDetail(d) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, t('{n} выстр.', { n: s.n }), ' · ', t('первый {v}', { v: num(s.first ?? 0, 2) }),
          s.avg ? ` · ${t('сплит')} ${num(s.avg, 2)}` : ''),
        h('span', { class: 'muted small' }, sub)),
      h('span', { class: `tg-best ${d.par && s.total > d.par ? 'tm-late' : ''}` }, num(s.total ?? 0, 2)));
  })), { fold: 'drills', count: list.length });
}

/** Картка серії: плитки й постріли зі сплітами; видалення іконкою вгорі. */
function drillDetail(d) {
  const s = M.drillStats(d.shots);
  const shots = [...d.shots].sort((a, b) => a - b);
  const remove = () => confirmSheet(t('Удалить серию?'), `${fmt.date(d.date)} · ${t('{n} выстр.', { n: s.n })}`, t('Удалить'), async () => {
    close();
    await db.write({ drills: { del: [d.id] } });
    await refresh();
    toast(t('Удалено'));
  });
  const delayText = d.delay === 'random' ? t('Случайная 2–4 с') : d.delay === '0' ? t('Без задержки') : `${d.delay} ${t('с')}`;
  const parText = d.par ? `${num(d.par, 2)} · ${s.total > d.par ? t('не уложились') : t('уложились')}` : null;
  const close = sheet(t('Серия {date}', { date: fmt.date(d.date) }), h('div', {},
    h('div', { class: 'stats even' },
      stat(t('первый выстрел'), num(s.first ?? 0, 2), 'accent'),
      stat(t('всего'), num(s.total ?? 0, 2)),
      s.avg ? stat(t('средний сплит'), num(s.avg, 2)) : null),
    box(t('Условия'), h('dl', { class: 'kv' },
      d.weaponId ? [h('dt', {}, t('Оружие')), h('dd', {}, findWeapon(d.weaponId)?.name ?? t('(удалено)'))] : null,
      [h('dt', {}, t('Задержка сигнала')), h('dd', {}, delayText)],
      parText ? [h('dt', {}, t('Пар-тайм, с')), h('dd', {}, parText)] : null,
      d.note ? [h('dt', {}, t('Примечание')), h('dd', {}, d.note)] : null)),
    box(t('Выстрелы'), h('div', { class: 'tm-shots' }, shots.map((x, i) => h('div', { class: `tm-shot ${i === 0 ? 'first' : ''}` },
      h('span', { class: 'tm-n' }, String(i + 1)),
      h('span', { class: 'tm-at' }, num(x, 2)),
      h('span', { class: 'tm-split muted' }, i ? `+${num(x - shots[i - 1], 2)}` : t('первый'))))))),
  { tools: [toolBtn('delete', t('Удалить'), remove, 'danger')] });
}

function renderTargets() {
  const list = [...state.targets].sort(M.byDateDesc);
  $('subtitle').textContent = t('мишеней: {n}', { n: list.length });
  // Прийшли з картки зброї — її група розгорнута.
  if (targetWeapon) setUnfolded(`targets:${targetWeapon}`, true);
  // Групи за зброєю: за назвою, мішені без ствола — в кінці.
  const groups = groupBy(list, (x) => x.weaponId || '')
    .map(([id, items]) => ({ id, items, name: id ? (findWeapon(id)?.name ?? t('(удалено)')) : t('Без оружия') }))
    .sort((a, b) => Number(!a.id) - Number(!b.id) || collate(a.name, b.name));
  return h('div', {},
    unitChips(render),
    list.length
      ? groups.map((g) => fold(`targets:${g.id}`,
        [h('span', { class: 'fold-title' }, g.name), h('span', { class: 'fold-meta' }, t('мишеней: {n}', { n: g.items.length }))],
        [precisionInGroup(g.id), h('div', { class: 'rows' }, g.items.map((tg) => targetRow(tg)))].filter(Boolean)))
      : empty(t('Мишеней пока нет'), t('Сфотографируйте мишень и нажмите «+»: отметьте пробоины — приложение посчитает кучность, СТП и поправки в щелчках.')),
    h('p', { class: 'muted small' }, t('Размах — между центрами самых дальних пробоин. СТП — средняя точка попадания. Фото снимайте прямо, без наклона: перспективу приложение пока не исправляет.')));
}

/**
 * Нова мішень: камера або галерея → дані → розмітка. Окрема кнопка камери потрібна, бо Android
 * на звичайний вибір картинки відкриває системний вибір фото, де камери немає.
 */
function newTarget(prefill = {}) {
  const close = sheet(t('Новая мишень'), h('div', { class: 'btn-col' },
    btn(t('📷 Сфотографировать'), () => { close(); pickTargetPhoto(prefill, true); }, 'primary'),
    btn(t('🖼 Выбрать из галереи'), () => { close(); pickTargetPhoto(prefill, false); })));
}

/** Вибір фото мішені. Викликати з обробника натискання — інакше браузер не відкриє камеру чи вибір файлу. */
function pickTargetPhoto(prefill, camera) {
  const input = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : undefined, hidden: true });
  input.addEventListener('cancel', () => input.remove());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    toast(t('Обработка фото…'));
    let photo;
    try {
      photo = await preparePhoto(file, { max: TARGET_PHOTO });
    } catch (err) {
      toast(err.message);
      return;
    }
    targetForm(null, { photo, ...prefill });
  });
  document.body.append(input);
  input.click();
}

async function runMarking(blob, tg) {
  try {
    const marks = await markTarget(blob, tg, {
      distance: tg.distance, unit: targetUnit, click: tg.click, scaleMm: Number(recall('shooting-log:scale-mm')) || 100,
    });
    if (marks?.scale?.mm) remember('shooting-log:scale-mm', marks.scale.mm);
    return marks;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function targetForm(tg, { photo = null, movement = null, weaponId = null } = {}) {
  const lastOf = (id) => state.targets.filter((x) => x.weaponId === id).sort(M.byDateDesc)[0];
  const gunId = [tg?.weaponId, movement?.weaponId, weaponId, recall('shooting-log:target-gun')].find((id) => id && findWeapon(id)) ?? '';
  const guns = state.weapons.filter((w) => !w.archived || w.id === gunId).sort(byName);
  const ammoId = [tg?.cartridgeId, movement?.cartridgeId, gunId && recall(`ammo:${gunId}`)].find((id) => id && findCartridge(id)) ?? '';
  const ammo = (id) => [['', t('— не указывать —')],
    ...caliberOptions(state.cartridges.filter((c) => !c.archived || c.id === ammoId), findWeapon(id)?.caliber).options];
  const hours = Array.from({ length: 12 }, (_, i) => [String(i + 1), t('на {n} ч', { n: i + 1 })]);
  const scopeOf = (wid, sid) => findWeapon(wid)?.scopes?.find((s) => s.id === sid) ?? null;
  // Приціл: із запису стрільби, з останньої мішені цього ствола, інакше основний.
  const pickScope = (wid) => [movement?.weaponId === wid ? movement.scopeId : null, lastOf(wid)?.scopeId]
    .map((id) => scopeOf(wid, id)).find(Boolean) ?? M.defaultScope(findWeapon(wid));
  const scope0 = tg && 'scopeId' in tg ? scopeOf(gunId, tg.scopeId) : pickScope(gunId);
  const distance0 = tg?.distance ?? lastOf(gunId)?.distance ?? (Number(recall('shooting-log:target-distance')) || 100);
  // «Влучання вище» — як у останній мішені з тим самим прицілом на тій самій дистанції
  const lastZeroUp = (sid, distance) => (sid
    ? state.targets.filter((x) => x.scopeId === sid && x.distance === distance && x.zeroUp).sort(M.byDateDesc)[0]?.zeroUp ?? '' : '');
  const f = form([
    { name: 'weaponId', label: t('Оружие'), type: 'select', value: gunId, options: [['', t('— не указывать —')], ...guns.map((w) => [w.id, w.name])] },
    { name: 'scopeId', label: t('Прицел'), type: 'select', value: scope0?.id ?? '', options: scopeOptions(findWeapon(gunId)) },
    { name: 'cartridgeId', label: t('Патроны'), type: 'select', value: ammoId, options: ammo(gunId) },
    { name: 'distance', label: t('Дистанция, м'), type: 'number', step: 'any', min: 0, required: true, value: distance0 },
    { name: 'date', label: t('Дата'), type: 'date', value: tg?.date ?? movement?.date ?? M.today() },
    { name: 'click', label: t('Цена щелчка прицела'), type: 'chips', wide: true, options: CLICKS.map(([k, label]) => [k, t(label)]),
      value: tg?.click ?? scope0?.click ?? lastOf(gunId)?.click ?? 'mil0.1' },
    { name: 'zeroUp', label: t('Попадание выше точки прицеливания, см'), type: 'number', step: 'any', wide: true,
      value: tg ? tg.zeroUp ?? '' : lastZeroUp(scope0?.id, distance0),
      hint: t('Если пристрелка на другую дистанцию — сколько по баллистической таблице, ниже — с минусом. Пусто — в точку прицеливания.') },
    { name: 'temp', label: t('Температура, °C'), type: 'number', step: 'any', value: tg?.temp ?? '' },
    { name: 'wind', label: t('Ветер, м/с'), type: 'number', step: 'any', min: 0, value: tg?.wind ?? '' },
    { name: 'windClock', label: t('Откуда ветер'), type: 'select', value: tg?.windClock ? String(tg.windClock) : '', options: [['', '—'], ...hours] },
    { name: 'note', label: t('Примечание'), placeholder: t('Положение, упор, серия…'), value: tg?.note ?? '', wide: true },
  ]);
  qtyChips(f.inputs.distance, [25, 50, 100, 200, 300]);
  // Приціл пристріляний на іншу дистанцію — у точку прицілювання на цій дистанції куля не прийде.
  const zeroWarn = h('small', { class: 'warn-text' });
  f.inputs.zeroUp.after(zeroWarn);
  const scopeField = f.inputs.scopeId.closest('.field');
  scopeField.hidden = !findWeapon(gunId)?.scopes?.length;
  const selectedScope = () => scopeOf(f.inputs.weaponId.value, f.inputs.scopeId.value);
  // Своє значення «влучання вище» не перезаписуємо підказкою з минулих мішеней.
  let zeroTyped = !!tg;
  f.inputs.zeroUp.addEventListener('input', () => { zeroTyped = true; });
  const showZero = () => {
    const distance = Number(f.inputs.distance.value);
    if (!zeroTyped) f.inputs.zeroUp.value = lastZeroUp(selectedScope()?.id, distance);
    const zero = selectedScope()?.zero;
    zeroWarn.textContent = zero && distance > 0 && zero !== distance
      ? t('Прицел пристрелян на {z} м, мишень — {d} м.', { z: fmt.num(zero), d: fmt.num(distance) }) : '';
  };
  // Вибрали приціл — з нього ціна клацання (кнопкою, щоб чіпи підсвітилися).
  const onScope = () => {
    const click = selectedScope()?.click;
    if (click) f.inputs.click.querySelector(`[data-value="${click}"]`)?.click();
    showZero();
  };
  f.inputs.distance.addEventListener('input', showZero);
  f.inputs.distance.parentElement.addEventListener('click', () => setTimeout(showZero));
  f.inputs.scopeId.addEventListener('change', onScope);
  showZero();
  f.inputs.weaponId.addEventListener('change', () => {
    const id = f.inputs.weaponId.value;
    const keep = f.inputs.cartridgeId.value;
    f.inputs.cartridgeId.replaceChildren(...selectOptions(ammo(id), keep).filter(Boolean));
    const w = findWeapon(id);
    f.inputs.scopeId.replaceChildren(...selectOptions(scopeOptions(w), pickScope(id)?.id ?? '').filter(Boolean));
    scopeField.hidden = !w?.scopes?.length;
    onScope();
  });
  let gps = tg?.gps ?? null;
  const gpsText = h('span', { class: 'muted small' });
  const gpsBtn = btn('', locate);
  const showGps = () => {
    gpsText.textContent = gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} ± ${Math.round(gps.acc)} ${t('м')}` : t('не записаны');
    gpsBtn.textContent = gps ? t('Убрать координаты') : t('Записать координаты');
  };
  function locate() {
    if (gps) { gps = null; showGps(); return; }
    if (!navigator.geolocation) { toast(t('Геолокация недоступна')); return; }
    gpsBtn.disabled = true;
    gpsText.textContent = t('Определяю…');
    navigator.geolocation.getCurrentPosition((p) => {
      gps = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      gpsBtn.disabled = false;
      showGps();
    }, () => {
      gpsBtn.disabled = false;
      showGps();
      toast(t('Не удалось определить координаты'));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  }
  showGps();
  const close = sheet(tg ? t('Мишень: данные') : t('Новая мишень'), h('div', {},
    f.el,
    h('div', { class: 'tg-gps' }, h('span', { class: 'field-label' }, t('Координаты')), gpsText, gpsBtn)), {
    actions: [btn(t('Отмена'), () => close()), btn(tg ? t('Сохранить') : t('Далее: разметка'), save, 'primary')],
  });
  async function save() {
    if (invalidToast(f)) return;
    const v = f.values();
    if (!(v.distance > 0)) { toast(t('Укажите дистанцию')); return; }
    const fields = {
      weaponId: v.weaponId || null, scopeId: selectedScope()?.id ?? null, cartridgeId: v.cartridgeId || null, distance: v.distance, date: v.date || null,
      click: f.inputs.click.value || null, zeroUp: Number(v.zeroUp) || null, temp: v.temp, wind: v.wind, windClock: v.windClock ? Number(v.windClock) : null, note: v.note, gps,
    };
    remember('shooting-log:target-distance', v.distance);
    remember('shooting-log:target-gun', fields.weaponId);
    close();
    if (tg) {
      await saveEntity('targets', { ...tg, ...fields }, t('Сохранено'));
      targetDetail(findTarget(tg.id) ?? tg);
      return;
    }
    // Нова мішень пишеться одним записом уже з розміткою; скасували розмітку — нічого не зберігаємо.
    const draft = { id: db.uid(), created: Date.now(), photoId: db.uid(), movementId: movement?.id ?? null, scale: null, poa: null, groups: [], ...fields };
    const marks = await runMarking(photo.blob, draft);
    if (!marks) { toast(t('Мишень не сохранена')); return; }
    const record = { ...draft, ...marks };
    await db.write({
      targets: { put: [record] },
      photos: { put: [{ id: draft.photoId, targetId: record.id, created: Date.now(), thumb: photo.thumb, w: photo.w, h: photo.h, driveId: null }] },
      blobs: { put: [{ id: draft.photoId, blob: photo.blob }] },
    });
    await refresh();
    toast(t('Мишень сохранена'));
    targetDetail(findTarget(record.id) ?? record);
  }
}

async function editMarks(tg) {
  const blob = await db.getBlob(tg.photoId);
  if (!blob) { toast(t('Полное фото ещё не загрузилось — изменить можно после синхронизации')); return; }
  const marks = await runMarking(blob, tg);
  if (!marks) return;
  await saveEntity('targets', { ...tg, ...marks }, t('Разметка сохранена'));
  targetDetail(findTarget(tg.id) ?? tg);
}

function weatherText(tg) {
  return [tg.temp !== null && tg.temp !== undefined && tg.temp !== '' ? `${fmt.num(tg.temp)} °C` : null,
    tg.wind ? t('ветер {v} м/с', { v: fmt.num(tg.wind) }) + (tg.windClock ? ` ${t('на {n} ч', { n: tg.windClock })}` : '') : null]
    .filter(Boolean).join(' · ');
}

const targetScope = (tg) => findWeapon(tg.weaponId)?.scopes?.find((s) => s.id === tg.scopeId) ?? null;

/** Приціл одним рядком: назва й дистанція пристрілки. */
function scopeText(s) {
  return [s.name, s.zero ? t('пристрелка {n} м', { n: fmt.num(s.zero) }) : null].filter(Boolean).join(' · ');
}

function clickLabel(key) {
  const row = CLICKS.find(([k]) => k === key);
  return row ? t(row[1]) : null;
}

/** Ціна клацання плюс скільки це сантиметрів на цій дистанції: «0,1 MRAD · 3,0 см на 300 м». */
function clickAtDistance(key, distance) {
  const label = clickLabel(key);
  const c = M.clickValue(key);
  const cm = c && distance > 0 ? M.fromMrad(M.toMrad(c.value, c.unit), 'cm', distance) : null;
  return cm ? `${label} · ${t('{v} см на {d} м', { v: fmt.num(Math.round(cm * 10) / 10), d: fmt.num(distance) })}` : label;
}

/** Поправка крупно: стрілка, клацання, напрямок як на барабані. */
function fixPanel(fixes, click) {
  if (!M.clickValue(click)) return h('p', { class: 'muted small' }, t('Укажите цену щелчка в данных мишени — появится поправка.'));
  if (!fixes.length) return h('div', { class: 'tg-fix ok' }, `✓ ${t('Поправка не нужна')}`);
  return h('div', { class: 'tg-fix' },
    h('div', { class: 'tg-fix-title' }, t('Поправка')),
    fixes.map((f) => h('div', { class: 'tg-fix-row' },
      h('span', { class: 'tg-fix-arrow', 'aria-hidden': 'true' }, f.arrow),
      h('b', {}, `${f.clicks} ${t('щелч.')}`),
      h('span', {}, f.word),
      h('span', { class: 'muted' }, `${num(f.angle, 2)} ${f.unit}`))));
}

/** Значок мірки: що саме намальовано на фото — лінія між крайніми, коло середнього радіуса, рамка габариту. */
const METRIC_ICON = {
  spread: '<circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="5" r="2.2"/><path d="M6.6 17.4 17.4 6.6"/>',
  ring: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
};
function metricLabel(icon, text) {
  const ico = h('span', { class: 'metric-ico', 'aria-hidden': 'true' });
  ico.innerHTML = `<svg viewBox="0 0 24 24">${METRIC_ICON[icon]}</svg>`;
  return h('span', { class: 'metric-label' }, ico, text);
}

/** Блок групи: плитки розміру, СТВ, потрібне влучання й поправка — у вибраних одиницях. */
function groupBox(g, tg) {
  const s = g.stats;
  const len = (mm) => length(mm, targetUnit, tg.distance);
  const wantUp = (tg.zeroUp || 0) * 10;
  const line = (label, value) => h('div', { class: 'tg-line' }, h('span', { class: 'muted' }, label), h('span', {}, value));
  return box([
    h('i', { class: 'tg-swatch', style: `background:${COLORS[g.index % COLORS.length]}` }),
    t('Группа {n}', { n: g.index + 1 }),
    h('span', { class: 'box-count' }, t('{n} выстр.', { n: s.n })),
  ], [
    s.n >= 2 ? h('div', { class: 'stats even tg-tiles' },
      stat(metricLabel('spread', t('Размах')), len(s.spread)),
      stat(metricLabel('ring', t('Средний радиус')), len(s.meanRadius)),
      stat(metricLabel('box', t('Ширина × высота')), size(s.width, s.height, targetUnit, tg.distance))) : null,
    s.offset ? line(t('СТП'), offsetText(s.offset, targetUnit, tg.distance)) : null,
    s.offset && wantUp ? line(t('Нужное попадание'), `${wantUp > 0 ? t('выше') : t('ниже')} ${len(Math.abs(wantUp))}`) : null,
    s.offset ? fixPanel(corrections(s, { distance: tg.distance, click: tg.click, wantUp }), tg.click) : null,
  ]);
}

function statsBlocks(tg, photo, onUnit) {
  if (!photo) return [h('p', { class: 'muted small' }, t('Фото мишени ещё не синхронизировано.'))];
  if (!M.mmPerPx(tg.scale, photo)) return [h('p', { class: 'muted small' }, t('Масштаб не задан — откройте разметку и отметьте две точки с известным расстоянием.'))];
  const groups = M.targetStats(tg, photo).filter((g) => g.stats);
  if (!groups.length) return [h('p', { class: 'muted small' }, t('Пробоины не отмечены.'))];
  return [
    unitChips(onUnit),
    ...groups.map((g) => groupBox(g, tg)),
    groups.some((g) => g.stats.n >= 2) ? hint(t('Когда говорят «группа 1 MOA» — речь о размахе: его задают две крайние пробоины, и он растёт с числом выстрелов. Средний радиус считает все пробоины — по нему сравнимы группы с разным числом выстрелов.')) : null,
    tg.poa ? null : h('p', { class: 'muted small' }, t('Отметьте точку прицеливания — появятся СТП и поправки в щелчках.')),
  ].filter(Boolean);
}

function shareLines(tg, photo) {
  const lines = [
    { text: targetTitle(tg), bold: true },
    { text: [fmt.date(tg.date), t('{n} м', { n: fmt.num(tg.distance) }), targetScope(tg)?.name, weatherText(tg)].filter(Boolean).join(' · '), color: '#aab3a6' },
  ];
  for (const g of M.targetStats(tg, photo).filter((x) => x.stats)) {
    const [, ...rows] = groupRows(g.stats, { unit: 'all', distance: tg.distance, click: tg.click, wantUp: (tg.zeroUp || 0) * 10 });
    lines.push({ text: `${t('Группа {n}', { n: g.index + 1 })} · ${t('{n} выстр.', { n: g.stats.n })}`, bold: true, color: COLORS[g.index % COLORS.length] });
    for (const [k, v] of rows) lines.push({ text: `${k}: ${v}` });
  }
  return lines;
}

async function shareTarget(tg) {
  const photo = targetPhoto(tg);
  if (!photo) return;
  const blob = await db.getBlob(photo.id);
  const src = blob ? URL.createObjectURL(blob) : photo.thumb;
  let image;
  try {
    image = await shareImage(src, tg, shareLines(tg, photo));
  } finally {
    if (blob) URL.revokeObjectURL(src);
  }
  const file = new File([image], `target-${tg.date ?? 'shot'}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: targetTitle(tg) }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  download(file.name, file);
}

function targetDetail(tg) {
  const photo = targetPhoto(tg);
  const shot = tg.movementId ? state.movements.find((m) => m.id === tg.movementId) : null;
  const figure = h('canvas', { class: 'tg-figure' });
  if (photo?.thumb) {
    paintPreview(figure, photo.thumb, tg, 720).then(async () => {
      const blob = await db.getBlob(photo.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      try { await paintPreview(figure, url, tg, 1400); } finally { URL.revokeObjectURL(url); }
    }).catch(() => {});
  }
  const statsBox = h('div', {});
  // зміна одиниць — і в картці, і в списку під нею
  const showStats = () => statsBox.replaceChildren(...statsBlocks(tg, photo, () => { showStats(); render(); }));
  showStats();
  const remove = () => {
    close();
    confirmSheet(t('Удалить мишень?'), t('Фото и разметка будут удалены.'), t('Удалить'), async () => {
      sync.trashPhoto((await db.get('photos', tg.photoId))?.driveId);
      await db.write({ targets: { del: [tg.id] }, photos: { del: [tg.photoId] }, blobs: { del: [tg.photoId] } });
      await refresh();
      toast(t('Мишень удалена'));
    });
  };
  const close = sheet(targetTitle(tg), h('div', {},
    figure,
    statsBox,
    box(t('Условия'), h('dl', { class: 'kv' },
      h('dt', {}, t('Дата')), h('dd', {}, fmt.date(tg.date)),
      h('dt', {}, t('Дистанция')), h('dd', {}, t('{n} м', { n: fmt.num(tg.distance) })),
      targetScope(tg) ? [h('dt', {}, t('Прицел')), h('dd', {}, scopeText(targetScope(tg)))] : null,
      tg.click ? [h('dt', {}, t('Цена щелчка')), h('dd', {}, clickAtDistance(tg.click, tg.distance))] : null,
      weatherText(tg) ? [h('dt', {}, t('Погода')), h('dd', {}, weatherText(tg))] : null,
      tg.gps ? [h('dt', {}, t('Координаты')), h('dd', {}, `${tg.gps.lat.toFixed(5)}, ${tg.gps.lon.toFixed(5)}`)] : null,
      shot ? [h('dt', {}, t('Стрельба')), h('dd', {}, h('button', {
        type: 'button', class: 'link-btn', onclick: () => { close(); movementDetail(shot); },
      }, `${fmt.date(shot.date)} · ${fmt.signed(shot.qty)}`))] : null,
      tg.note ? [h('dt', {}, t('Примечание')), h('dd', {}, tg.note)] : null)),
    h('div', { class: 'btn-row' },
      btn(t('Разметка'), () => { close(); editMarks(tg); }, 'primary'))), {
    tools: [toolBtn('share', t('Поделиться'), () => shareTarget(tg).catch((err) => toast(err.message))),
      ...cardTools(() => { close(); targetForm(tg); }, false, remove)],
  });
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
        lines.some((l) => l.noPrice && l.component?.kind !== 'case') ? h('div', { class: 'muted small' }, t('есть компоненты без цены')) : null,
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
  // Групи за калібром — як набої на вкладці БК.
  return h('div', {}, groupBy(state.recipes, (r) => r.caliber || t('Без калибра')).map(([caliber, list]) => fold(`recipes:${caliber}`,
    [cartridgeIcon(caliber), h('span', { class: 'fold-title' }, caliber), h('span', { class: 'fold-meta' }, t('{n} поз.', { n: list.length }))],
    list.sort(byName).map(recipeCard))));
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

function download(name, content) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: 'application/json' }));
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
      h('p', { class: 'muted small' }, t('«Объединить» — добавит новые записи и обновит те, что в файле новее: более поздние правки на устройстве останутся. «Заменить всё» — сначала удалит текущие данные.')),
      sync.enabled() ? h('p', { class: 'muted small' }, t('Включена синхронизация: «Заменить всё» очистит только это устройство, данные с Google Диска потом вернутся.')) : null), {
      actions: [
        btn(t('Отмена'), () => close()),
        btn(t('Объединить'), async () => { close(); await db.mergeImport(changes); await refresh(); toast(t('Импортировано')); }),
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

// Тема: auto — як у системі. Першу розстановку до малювання робить скрипт в index.html.
const THEMES = [['auto', 'Авто'], ['dark', 'Тёмная'], ['light', 'Светлая']];
const lightScheme = matchMedia('(prefers-color-scheme: light)');

function themePref() {
  const v = recall('shooting-log:theme');
  return THEMES.some(([k]) => k === v) ? v : 'auto';
}

function applyTheme() {
  const pref = themePref();
  const theme = pref === 'auto' ? (lightScheme.matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f3ee' : '#101310');
}

lightScheme.addEventListener('change', applyTheme);

function switchLang(code) {
  setLang(code);
  applyStatic();
  renderSyncChip(sync.status);
  render();
}

/** «Своя иконка»: картинка лише на цьому пристрої, файл для ярлика на робочому столі. */
function iconPanel() {
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const result = await editPhoto(file, { square: true });
        if (!result) return;
        await setIcon(result.blob);
      } catch (err) {
        toast(err.message);
        return;
      }
      applyIcon();
      render();
      toast(t('Иконка сохранена на этом устройстве'));
    },
  });
  const saveFile = async () => {
    const file = await iconFile();
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    download(file.name, file);
  };
  const url = customIcon();
  return h('section', { class: 'panel' },
    h('h3', {}, t('Своя иконка')),
    url ? h('div', { class: 'icon-preview' }, h('img', { src: url, alt: '' }),
      h('span', { class: 'muted small' }, t('Показывается в шапке и на вкладке браузера. Хранится только на этом устройстве и никуда не публикуется.'))) : null,
    h('p', { class: 'muted small' }, t('Иконку установленного приложения Android берёт с сервера, поэтому на рабочий стол свою картинку ставят вручную: сохраните файл и назначьте его ярлыку — долгое нажатие на иконку → «Изменить» (Nova, темы Samsung и Xiaomi) или приложение «Shortcut Maker». На iPhone: выберите иконку, затем «Поделиться» → «На экран Домой».')),
    h('div', { class: 'btn-row' },
      btn(url ? t('Заменить картинку') : t('Выбрать картинку'), () => fileInput.click(), url ? '' : 'primary'),
      url ? btn(t('Сохранить для рабочего стола'), saveFile, 'primary') : null,
      url ? btn(t('Убрать'), () => { clearIcon(); applyIcon(); render(); }) : null),
    fileInput);
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
    h('section', { class: 'panel guide-entry' },
      h('h3', {}, t('Справочник стрелка')),
      h('p', { class: 'muted small' }, t('Курс марксмана: изготовка, спуск, мил и MOA, пристрелка, ветер, дальность, калькулятор и тренажёр сетки. Работает без интернета.')),
      btn(t('Открыть справочник'), () => { location.hash = '#guide'; }, 'primary')),
    iconPanel(),
    h('section', { class: 'panel' }, h('h3', {}, 'Язык · Мова'), langChips),
    h('section', { class: 'panel' }, h('h3', {}, t('Тема')), (() => {
      const row = chips(THEMES.map(([k, label]) => [k, t(label)]), themePref(), (v) => { remember('shooting-log:theme', v); applyTheme(); });
      row.classList.add('segmented');
      return row;
    })()),
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

// ---------- довідник ----------

/** Розділи курсу згорнуті; пошук розкриває збіги й ховає решту. */
function renderGuide() {
  const list = h('div', { class: 'guide' }, h('p', { class: 'muted' }, t('Загрузка…')));
  loadGuide().then((html) => {
    const { sections, foot } = parseGuide(html);
    if (tab === 'guide') $('subtitle').textContent = t('Курс марксмана · тем: {n}', { n: sections.length });
    const folds = sections.map((s) => fold(`guide:${s.id}`,
      [h('span', { class: 'guide-n' }, s.num), h('span', { class: 'fold-title' }, s.title)], s.body));
    folds.forEach((el, i) => { el.id = sections[i].id; });
    const nothing = h('p', { class: 'muted guide-none', hidden: true }, t('Ничего не найдено'));
    let before = null;
    const search = h('input', {
      type: 'search', class: 'guide-search', placeholder: t('Поиск по справочнику'), autocomplete: 'off',
      oninput: () => {
        const q = search.value.trim().toLowerCase();
        // Стан до пошуку повертаємо, коли рядок очищено.
        if (q && !before) before = folds.map((el) => el.open);
        let hits = 0;
        folds.forEach((el, i) => {
          const hit = !q || el.textContent.toLowerCase().includes(q);
          el.hidden = !hit;
          if (q) el.open = hit;
          else if (before) el.open = before[i];
          hits += hit;
        });
        if (!q) before = null;
        nothing.hidden = hits > 0;
      },
    });
    list.replaceChildren(...[
      lang() === 'ru' ? null : h('p', { class: 'muted small' }, t('Справочник пока только на русском.')),
      search, nothing, ...folds, foot].filter(Boolean));
    initGuide(list);
  }).catch(() => {
    list.replaceChildren(empty(t('Справочник недоступен'), t('Откройте приложение с интернетом хотя бы раз, чтобы он сохранился для офлайна.')));
  });
  // Посилання між розділами (#wind тощо) — без зміни маршруту.
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const target = a && list.querySelector(`details.fold[id="${CSS.escape(a.getAttribute('href').slice(1))}"]`);
    if (!target) return;
    e.preventDefault();
    target.hidden = false;
    target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return list;
}

// ---------- навігація ----------

/** «+» на вкладці БК: купити вже заведений набій або завести новий. */
function ammoAddMenu() {
  const list = state.cartridges.filter((c) => !c.archived).sort((a, b) => collate(a.caliber, b.caliber) || collate(a.name, b.name));
  const close = sheet(t('Добавить'), h('div', {},
    h('div', { class: 'btn-col' }, btn(t('Новый патрон'), () => { close(); cartridgeForm(); }, 'primary')),
    list.length ? box(t('Купить уже заведённый'), groupBy(list, (c) => c.caliber || t('Без калибра')).map(([caliber, items]) =>
      fold(`buy:${caliber}`,
        [cartridgeIcon(caliber), h('span', { class: 'fold-title' }, caliber),
          h('span', { class: 'fold-meta' }, t('{n} поз.', { n: items.length })),
          h('span', { class: 'fold-sum' }, `${fmt.num(items.reduce((n, c) => n + M.cartridgeStock(state, c.id), 0))} ${t('шт')}`)],
        h('div', { class: 'rows' }, items.map((c) =>
          h('button', { type: 'button', class: 'row', onclick: () => { close(); buySheet(c); } },
            cartridgeIcon(c.caliber),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, c.name)),
            h('span', { class: 'row-qty' }, fmt.num(M.cartridgeStock(state, c.id))))))))) : null));
}

function addMenu() {
  const close = sheet(t('Добавить'), h('div', { class: 'btn-col' },
    btn(t('Новый компонент на склад'), () => { close(); componentForm(); }),
    btn(t('Новый рецепт'), () => { close(); recipeForm(); })));
}

const VIEWS = {
  ammo: { title: 'БК', render: renderAmmo, fab: ammoAddMenu },
  guns: { title: 'Оружие', render: renderGuns, fab: () => weaponForm() },
  log: { title: 'Журнал', render: renderLog, fab: foreignShotSheet },
  reload: { title: 'Рецепты', render: renderReload, fab: addMenu },
  settings: { title: 'Настройки', render: renderSettings },
  guide: { title: 'Справочник', render: renderGuide, tab: 'settings' },
  targets: { title: 'Полигон', render: renderRange, fab: () => newTarget({ weaponId: targetWeapon || null }), noFab: () => rangeSeg !== 'targets' },
};

function render() {
  const view = VIEWS[tab];
  $('title').textContent = t(view.title);
  $('subtitle').textContent = '';
  $('view').replaceChildren(view.render());
  $('fab').hidden = !view.fab || Boolean(view.noFab?.());
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (view.tab ?? tab)));
  $('settings-btn').classList.toggle('active', (view.tab ?? tab) === 'settings');
  document.querySelector('.tabs a[data-tab="guns"]').classList.toggle('alert',
    state.weapons.some(needsCleaning) || urgentPermits().length > 0);
}

/** Раз на день при відкритті: які стволи не почищені після стрільби. Повертає true, якщо нагадав. */
function cleaningReminder() {
  const dirty = state.weapons.filter(needsCleaning);
  if (!dirty.length || recall('shooting-log:clean-reminded') === M.today()) return false;
  remember('shooting-log:clean-reminded', M.today());
  toast(t('Пора почистить: {names}', { names: dirty.map((w) => w.name).join(', ') }), {
    action: t('Показать'),
    onAction: () => { location.hash = '#guns'; },
  });
  return true;
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
  // updateViaCache 'none' — перевірка оновлення не бере sw.js і version.js з HTTP-кешу.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
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
applyTheme();
applyIcon();
$('fab').addEventListener('click', () => VIEWS[tab].fab?.());
$('sync-chip').addEventListener('click', onSyncChip);
window.addEventListener('hashchange', route);
window.addEventListener('sync-applied', refresh);
window.addEventListener('db-blocked', () => toast(t('Закройте другие вкладки приложения — база обновляется')));
registerWorker();
navigator.storage?.persist?.().catch(() => {});
state = await db.loadAll();
route();
// два нагадування разом — друге після першого, щоб не перекрило
if (cleaningReminder()) setTimeout(permitsReminder, 8500); else permitsReminder();
sync.onStatus(renderSyncChip);
sync.preload();
sync.syncNow();
