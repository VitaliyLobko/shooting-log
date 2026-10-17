import * as db from './db.js';
import * as M from './model.js';
import * as sync from './sync.js';
import { t, plural, lang, setLang, LANGS, collate, applyStatic, locale } from './i18n.js';
import { prepare as preparePhoto, editPhoto, viewer } from './photos.js';
import { loadGuide, parseGuide, initGuide } from './guide.js';
import { COLORS, UNITS, CLICKS, num, length, size, offsetText, corrections, groupRows, elevText, holdText, paintPreview, shareImage, markTarget } from './target.js';
import { cartridgeIcon, caliberHue } from './ammo.js';
import { lineChart, barChart } from './chart.js';
import { ammoLevel, shotLevel, levelArt, rankRing } from './levels.js';
import { timerPanel, stopTimerPanel } from './timer.js';
import { exercisesPanel, exerciseName, newExercise, openScore } from './exercises.js';
import { CHANGES, newer } from './changelog.js';
import {
  h, fmt, sheet, refreshSheets, toast, form, chips, swipeable, confirmSheet, selectOptions, isoToDmy, toolBtn,
  confirmed, setUndo, fieldError, formError,
} from './ui.js';

let state = { weapons: [], cartridges: [], components: [], recipes: [], movements: [], photos: [], targets: [], drills: [], scores: [], exercises: [], chrono: [] };
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

/**
 * Записує рухи однією транзакцією. Підтвердження — підсвіченою карткою; «Скасувати» з'являється в шапці
 * (label — що саме скасується). Табличкою — лише попередження, яке треба прочитати.
 */
async function addMovements(list, label, extra = {}, warning = null) {
  await db.write({ movements: { put: list }, ...extra });
  await refresh();
  confirmed(list.flatMap((m) => [m.id, m.cartridgeId, m.componentId, m.weaponId]));
  if (warning) toast(warning);
  setUndo(label, async () => {
    await db.write({ movements: { del: list.map((m) => m.id) } });
    await refresh();
  });
}

async function saveEntity(store, obj) {
  await db.write({ [store]: { put: [obj] } });
  await refresh();
  confirmed([obj.id]);
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

// Застосунок перейменовано: налаштування зі старого префікса переносимо один раз,
// щоб після оновлення не злетіли тема, мова, одиниці й згорнуті блоки.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('scouts-log:')) continue;
    const moved = `shooters-log:${key.slice('scouts-log:'.length)}`;
    if (localStorage.getItem(moved) === null) localStorage.setItem(moved, localStorage.getItem(key));
    localStorage.removeItem(key);
  }
} catch { /* приватний режим */ }

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

/**
 * Вибір набою як на вкладці БК: кнопка з поточним набоєм, а за нею — шторка з групами
 * за калібром і залишком у рядку. Рідний select лишається у формі (з нього читають
 * значення й на нього вішають обробники), просто сховано. Повертає функцію перемальовування —
 * її кличуть, коли список набоїв перебудували (наприклад, змінили ствол).
 */
function ammoPicker(select, caliber = null) {
  if (!select) return () => {};
  const face = h('button', { type: 'button', class: 'picker' });
  const paint = () => {
    const c = findCartridge(select.value);
    const text = c
      ? t('{name} · ост. {n}', { name: c.name, n: fmt.num(M.cartridgeStock(state, c.id)) })
      : ([...select.options].find((o) => o.value === select.value)?.textContent ?? t('— не указывать —'));
    // replaceChildren — метод DOM: null він вставив би текстом «null»
    face.replaceChildren(...[
      c ? cartridgeIcon(c.caliber) : null,
      h('span', { class: 'picker-main' }, text),
      h('span', { class: 'chevron', 'aria-hidden': 'true' })].filter(Boolean));
  };
  face.addEventListener('click', () => {
    const pick = (value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      paint();
      close();
    };
    const row = (value, body, extra = null) => h('button', {
      type: 'button', class: `row${value === select.value ? ' on' : ''}`, onclick: () => pick(value),
    }, body, extra);
    const opts = [...select.options].map((o) => ({ value: o.value, text: o.textContent, c: findCartridge(o.value) }));
    const own = opts.filter((o) => o.c);
    const plain = opts.filter((o) => !o.c);
    // Свій калібр — зверху й розгорнутим, решта калібрів — згортками, як у «+ → Купити вже заведений».
    const want = caliber ?? findCartridge(select.value)?.caliber ?? null;
    const groups = groupBy(own, (o) => o.c.caliber || t('Без калибра'))
      .sort((a, b) => (M.sameCaliber(b[0], want) ? 1 : 0) - (M.sameCaliber(a[0], want) ? 1 : 0) || collate(a[0], b[0]));
    const rows = (items) => h('div', { class: 'rows' }, items.map((o) => row(o.value,
      [cartridgeIcon(o.c.caliber), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, o.c.name))],
      h('span', { class: 'row-qty' }, fmt.num(M.cartridgeStock(state, o.c.id))))));
    const close = sheet(t('Патроны'), h('div', {},
      groups.map(([cal, items], i) => {
        const g = fold(`pick:${cal}`,
          [cartridgeIcon(cal), h('span', { class: 'fold-title' }, cal),
            h('span', { class: 'fold-meta' }, t('{n} поз.', { n: items.length }))],
          rows(items));
        // Свій калібр одразу розгорнутий — по нього й прийшли.
        if (i === 0) g.open = true;
        return g;
      }),
      plain.length ? h('div', { class: 'rows' }, plain.map((o) => row(o.value, h('span', { class: 'row-main' }, o.text)))) : null));
  });
  select.hidden = true;
  select.after(face);
  paint();
  select.addEventListener('change', paint);
  return paint;
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
const unfolded = storedSet('shooters-log:unfolded');

function setUnfolded(key, open) {
  if (open) unfolded.add(key); else unfolded.delete(key);
  remember('shooters-log:unfolded', JSON.stringify([...unfolded]));
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
  // Подія input — щоб залежне від поля (вартість, попередження) оновлювалося й від кнопки
  const row = chips(values.map((v) => [v, String(v)]), input.value, (v) => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  input.closest('.field').after(row);
  input.addEventListener('input', () => { row.value = input.value; row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === input.value)); });
  return row;
}

function btn(label, onclick, kind = '') {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
}

/**
 * Блок із заголовком на лінії рамки (як в 1С); fold — ключ згортання (як у груп: згорнутий, стан пам'ятає),
 * count — кількість у заголовку, tools — кнопки в заголовку поруч із назвою.
 */
function box(title, content, { fold, count, tools = null } = {}) {
  if (!fold) return h('fieldset', { class: 'box' }, h('legend', {}, title, tools), content);
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
  el.append(h('legend', {}, toggle, tools), h('div', { class: 'box-body' }, content));
  return el;
}

/** «Змінити» і «В архів» / «Видалити» (якщо рухів немає) — іконками в шапці шторки. */
function cardTools(onEdit, hasMoves, onRemove) {
  return [
    toolBtn('edit', t('Изменить'), onEdit),
    hasMoves ? toolBtn('archive', t('В архив'), onRemove) : toolBtn('delete', t('Удалить'), onRemove, 'danger'),
  ];
}

/** Сума для вузької плитки: від 100 грн — без копійок, «грн» дрібніше й не відривається від числа. */
function tileMoney(n) {
  const value = n >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  return h('span', { class: 'nw' }, fmt.num(value), h('small', { class: 'unit' }, ' грн'));
}

function stat(label, value, cls = '') {
  return h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-value' }, value), h('div', { class: 'muted small' }, label));
}

function invalidField(f) {
  const bad = f.invalid();
  if (bad) fieldError(f.inputs[bad.name], t('Заполните поле «{label}»', { label: bad.label }));
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
  const card = h('article', { class: 'card', 'data-id': c.id },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'muted small' }, cartridgeDetails(c))),
      h('div', { class: `big ${stock < 0 ? 'neg' : stock === 0 ? 'zero' : ''}` }, fmt.num(stock))));
  const recipe = recipeOf(c);
  return swipeable(card, {
    rightLabel: recipe ? t('Снарядить') : t('+ Купить'), leftLabel: t('Списать −'),
    onRight: () => (recipe ? reloadSheet(recipe) : buySheet(c)),
    onLeft: () => shootSheet({ cartridge: c }),
    onTap: () => cartridgeDetail(c),
  });
}

/** Рецепт, за яким спорядили набій; видалений рецепт — null. */
const recipeOf = (c) => (c?.recipeId ? state.recipes.find((r) => r.id === c.recipeId) ?? null : null);

/**
 * Поле «Зібрав гільз» при списанні свого набою — порожнє: гільзи збирають не завжди, рахуються лише вписані.
 * cartridgeId() — поточний набій форми; value() — {component, qty} або null.
 */
function collectField(cartridgeId) {
  const input = h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', autocomplete: 'off', placeholder: t('если собирал') });
  const label = h('span', { class: 'field-label' });
  const el = h('label', { class: 'field wide' }, label, input);
  const target = () => cartridgeCaseTarget(findCartridge(cartridgeId()));
  const update = () => {
    const c = target();
    el.hidden = !c;
    if (c) label.textContent = t('Собрал гильз → «{name}»', { name: c.name });
  };
  update();
  return {
    el, update,
    value: () => {
      const c = target();
      const n = Math.max(0, Math.round(Number(String(input.value).replace(',', '.')) || 0));
      return c && n ? { component: c, qty: n } : null;
    },
  };
}

// Як називають гільзи після першого пострілу — шукаємо пару обома мовами.
const FIRED = ['стріляні', 'стреляные'];
const FIRED_END = /\s(стріляні|стреляные|fired)$/i;
const NEW_END = /\s+(нові|новые|new)$/i;

/** Компонент «гільза» з назвою «{base} стріляні» (будь-якою мовою) або заготовка для нього без id. */
function firedCase(bases) {
  return state.components.find((c) => c.kind === 'case' && bases.some((b) => FIRED.some((w) => c.name === `${b} ${w}`)))
    ?? { name: `${bases[0]} ${t('стреляные')}` };
}

/**
 * Куди повертаються зібрані гільзи набоїв за рецептом: стріляні — туди ж, нові — у «… стріляні» тієї ж гільзи.
 * Нові чи стріляні — спершу за назвою, без підказки в назві — за ціною (стріляні зазвичай без ціни).
 * Без id — такого компонента ще немає, він з'явиться при першому зборі.
 */
function caseTarget(recipe) {
  const own = M.recipeCase(state, recipe);
  if (!own) return null;
  if (FIRED_END.test(own.name)) return own;
  if (!NEW_END.test(own.name) && !(M.unitPrice(state, own) > 0)) return own;
  return firedCase([own.name.replace(NEW_END, '')]);
}

/** Куди йдуть гільзи набою: самоспоряджений — за рецептом, заводський — у «Гільза {калібр} стріляні». */
function cartridgeCaseTarget(c) {
  if (!c) return null;
  if (c.recipeId) return caseTarget(recipeOf(c));
  return c.caliber ? firedCase([`${t('Гильза')} ${c.caliber}`, `Гільза ${c.caliber}`, `Гильза ${c.caliber}`]) : null;
}

/** Записує стрільбу; зібрані гільзи — окремим рухом у тій самій пачці, тож видаляються разом зі стрільбою. */
async function addShot(shot, collected, label, extra = {}, warning = null) {
  if (!collected) { await addMovements([shot], label, extra, warning); return; }
  const batch = db.uid();
  const c = collectMovement(collected, batch, shot.date, extra);
  await addMovements([{ ...shot, batch }, c.move], label, c.extra, warning);
}

/** Рух зібраних гільз у пачці стрільби; компонента «… стріляні» ще немає — він додається в extra. */
function collectMovement(collected, batch, date, extra = {}) {
  let target = collected.component;
  if (!target.id) {
    target = { id: db.uid(), created: Date.now(), updated: Date.now(), name: target.name, kind: 'case', unit: 'шт' };
    extra = { ...extra, components: { put: [target] } };
  }
  return { move: movement({ kind: 'collect', batch, componentId: target.id, qty: collected.qty, date }), extra };
}

/**
 * Гільзи до вже записаної стрільби. Стрільба без пачки отримує її окремим записом —
 * «Скасувати» прибирає лише збір, а видалення стрільби забирає й гільзи.
 */
async function addCollected(shot, collected) {
  let batch = shot.batch;
  if (!batch) {
    batch = db.uid();
    await db.write({ movements: { put: [{ ...shot, batch }] } });
  }
  const c = collectMovement(collected, batch, shot.date);
  await addMovements([c.move], t('Собранные гильзы → «{name}»', { name: collected.component.name }), c.extra);
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
  $('subtitle').textContent = active.some(recipeOf) ? t('Свайп → купить или снарядить, ← списать') : t('Свайп → купить, ← списать');
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
  saveEntity('cartridges', { ...c, archived: false });
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
    if (invalidField(f)) return;
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
      await saveEntity('cartridges', obj);
    }
  }
}

/** Ціна одного набою в покупці: сума / кількість; null — чогось не вказали. */
function buyUnitPrice(m) {
  return m.kind === 'buy' && (m.cartridgeId || m.componentId) && m.qty > 0 && Number(m.price) > 0 ? Number(m.price) / m.qty : null;
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
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Укажите количество')); return; }
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

/** Ствол у записі стрільби: свій (і приціл окремо), чужий або нічого. */
function shotGun(m) {
  const w = findWeapon(m.weaponId);
  if (w) return { name: w.name, scope: w.scopes?.find((s) => s.id === m.scopeId)?.name ?? null };
  return m.foreignWeapon ? { name: foreignLabel(m.foreignWeaponName), scope: null } : null;
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
    { name: 'foreignName', label: t('Какое оружие'), placeholder: t('АКМ'), list: 'foreign-list' },
    { name: 'date', label: t('Дата'), type: 'date', value: M.today(), half: true },
    { name: 'time', label: t('Время'), type: 'time', value: nowHm(), half: true },
    { name: 'note', label: t('Где / что'), placeholder: t('Полигон, тренировка…') },
  ]);
  f.el.append(caliberList(), foreignList());
  qtyChips(f.inputs.qty);
  const close = sheet(t('Стрельба: чужое оружие и патроны'), h('div', {},
    h('p', { class: 'muted small' }, t('Идёт только в общий настрел и настрел по калибрам: склад и свои стволы не меняются. Свою стрельбу записывайте свайпом патрона или ствола; там же есть пункты «Чужое оружие» и «Чужие патроны».')),
    f.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Записать'), save, 'primary shoot')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Укажите количество')); return; }
    close();
    const qty = Math.round(v.qty);
    await addMovements([movement({
      kind: 'shot', cartridgeId: null, weaponId: null, caliber: v.caliber, qty: -qty, date: v.date || null, time: v.time || undefined, note: v.note,
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
    { name: 'date', label: t('Дата'), type: 'date', value: M.today(), half: true },
    { name: 'time', label: t('Время'), type: 'time', value: nowHm(), half: true });
  const f = form(fields);
  ammoPicker(f.inputs.cartridgeId, caliber);
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
  const collect = collectField(() => cartridge?.id ?? f.inputs.cartridgeId?.value);
  // Під кнопками кількості (10 / 20 / 50…), щоб не розривати їх із полем пострілів.
  (costLine.nextElementSibling?.classList.contains('chips') ? costLine.nextElementSibling : costLine).after(collect.el);
  const updateAll = () => { updateCost(); collect.update(); };
  f.inputs.qty.addEventListener('input', updateAll);
  f.inputs.cartridgeId?.addEventListener('change', updateAll);
  f.el.addEventListener('click', () => setTimeout(updateAll));
  updateCost();
  const withTarget = h('input', { type: 'checkbox', id: 'shot-target' });
  const targetRow = h('label', { class: 'check', for: 'shot-target' }, withTarget,
    h('span', {}, t('Сразу разметить мишень')));
  const close = sheet(title, h('div', {}, info, f.el, targetRow), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Списать'), save, 'primary shoot')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Укажите количество')); return; }
    const c = cartridge ?? findCartridge(v.cartridgeId) ?? null;
    const w = weapon ?? findWeapon(v.weaponId) ?? null;
    if (cartridge) remember(`gun:${caliber}`, v.weaponId);
    else remember(`ammo:${weapon.id}`, v.cartridgeId);
    const qty = Math.round(v.qty);
    const stock = c ? M.cartridgeStock(state, c.id) : null;
    close();
    const gunName = w?.name ?? (v.weaponId === FOREIGN ? foreignLabel(v.foreignName) : null);
    const label = `−${fmt.num(qty)}${gunName ? ` · ${gunName}` : ''}`;
    // Попередження — табличкою: їх треба прочитати, а не лише побачити, що запис з'явився.
    const warnings = [stock !== null && qty > stock ? t('Остаток ушёл в минус') : null];
    const s = w ? M.cleaningStatus(state, w) : null;
    if (s?.every) {
      const after = s.unit === 'sessions' ? s.count + (s.dates.has(v.date || '') ? 0 : 1) : s.since + qty;
      if (after >= s.every) {
        warnings.push(s.unit === 'sessions'
          ? t('Пора почистить (стрельб после чистки: {n})', { n: fmt.num(after) })
          : t('Пора почистить ({n} после чистки)', { n: fmt.num(after) }));
      }
    }
    // Вартість фіксуємо на момент списання, щоб подальші покупки за іншою ціною її не змінювали.
    const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
    const price = unit ? +(unit * qty).toFixed(2) : null;
    const scopeId = w?.scopes?.some((sc) => sc.id === v.scopeId) ? v.scopeId : null;
    const isForeign = v.weaponId === FOREIGN;
    if (isForeign) remember(`foreign-gun:${caliber}`, v.foreignName);
    const foreign = {
      foreignWeapon: isForeign || undefined,
      foreignWeaponName: (isForeign && v.foreignName) || undefined,
      foreignAmmo: (!cartridge && !c) || undefined,
    };
    const shot = movement({ kind: 'shot', cartridgeId: c?.id ?? null, weaponId: w?.id ?? null, scopeId, caliber: c?.caliber ?? caliber, qty: -qty, price, date: v.date || null, time: v.time || undefined, note: v.note, ...foreign });
    await addShot(shot, collect.value(), label, {}, warnings.filter(Boolean).join(' · ') || null);
    // Мішень чіпляється до запису, тож питаємо одразу після збереження, поки стрілець не пішов із екрана.
    if (withTarget.checked) newTarget({ movement: shot });
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
    if (invalidField(f)) return;
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
  const loadedQty = moves.filter((m) => m.kind === 'reload').reduce((s, m) => s + m.qty, 0);
  const recipe = recipeOf(c);
  const priced = bought.filter((m) => m.price > 0);
  const avg = priced.length ? priced.reduce((s, m) => s + m.price, 0) / priced.reduce((s, m) => s + m.qty, 0) : null;
  const fired = -moves.filter((m) => m.kind === 'shot').reduce((s, m) => s + m.qty, 0);
  return h('div', {},
    h('p', { class: 'muted' }, [c.caliber, cartridgeDetails(c)].filter(Boolean).join(' · ')),
    c.recipeId ? h('p', { class: 'muted small' }, `${t('Рецепт')}: `, recipe
      ? h('button', { type: 'button', class: 'link-btn', onclick: () => { close(); recipeDetail(recipe); } }, recipe.name)
      : t('(удалён)')) : null,
    h('div', { class: 'stats' },
      stat(t('остаток'), fmt.num(M.cartridgeStock(state, c.id)), 'accent'),
      // Самоспорядження не купують: «куплено 0» біля сотні споряджених тільки збиває з пантелику.
      boughtQty || !loadedQty ? stat(t('куплено'), fmt.num(boughtQty), 'minor') : null,
      loadedQty ? stat(t('снаряжено'), fmt.num(loadedQty), 'minor') : null,
      stat(t('выстрелено'), fmt.num(fired), 'minor'),
      avg ? stat(t('ср. цена'), fmt.money(avg), 'minor') : null),
    h('div', { class: 'btn-row' },
      recipe
        ? btn(t('Снарядить'), () => { close(); reloadSheet(recipe); }, 'buy')
        : btn(t('+ Купить'), () => { close(); buySheet(c); }, 'buy'),
      btn(t('Списать −'), () => { close(); shootSheet({ cartridge: c }); }, 'shoot'),
      btn(t('Пересчёт'), () => { close(); adjustSheet(c, 'cartridges'); })),
    box(t('История'), movementRows(moves, { skip: { cartridge: true } }), { fold: `hist:${c.id}`, count: moves.length }));
}

function removeCartridge(c, hasMoves) {
  if (hasMoves) {
    saveEntity('cartridges', { ...c, archived: true });
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
  // Число — перед смугою: праворуч на плитці висить кнопка «+», і там його не видно.
  return inline
    ? h('div', { class: 'progress inline small' }, label, right, bar)
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

function scopeLine(s, full = false, more = 0) {
  // У списку параметри — значками поруч із назвою (пристрілка й ціна клацання),
  // у картці — словами під назвою: там місця вистачає.
  if (!full) {
    return h('div', { class: `scope ${s.default ? 'default' : ''}` },
      h('span', { class: 'scope-mark', 'aria-hidden': 'true' }, s.default ? '◉' : '⊕'),
      h('span', { class: 'scope-text row-chips' },
        h('span', { class: 'scope-name' }, s.name),
        s.zero ? h('span', { class: 'scope-chip', title: t('пристрелка {n} м', { n: fmt.num(s.zero) }) }, zeroIco(), t('{n} м', { n: fmt.num(s.zero) })) : null,
        s.click ? h('span', { class: 'scope-chip', title: t('Цена щелчка прицела') }, clickIco(), clickLabel(s.click)) : null,
        more > 0 ? h('span', { class: 'scope-more', title: t('ещё прицелов: {n}', { n: more }) }, scopeIco(), `+${more}`) : null));
  }
  const sub = [];
  if (full && SCOPE_KINDS[s.kind]) sub.push(t(SCOPE_KINDS[s.kind]));
  if (s.zero) sub.push(t('пристрелка {n} м', { n: fmt.num(s.zero) }));
  if (s.click) sub.push(clickLabel(s.click));
  if (full && s.reticle) sub.push(t(RETICLES.find(([k]) => k === s.reticle)?.[1] ?? ''));
  if (full && s.note) sub.push(s.note);
  return h('div', { class: `scope ${s.default ? 'default' : ''}` },
    h('span', { class: 'scope-mark', 'aria-hidden': 'true' }, s.default ? '◉' : '⊕'),
    h('span', { class: 'scope-text' },
      // Основний приціл позначає ◉ ліворуч, зайвої мітки не треба; інші приціли — значком із кількістю.
      h('span', { class: 'scope-name' }, s.name,
        more > 0 ? h('span', { class: 'scope-more', title: t('ещё прицелов: {n}', { n: more }) }, scopeIco(), `+${more}`) : null),
      sub.length ? h('span', { class: 'muted small' }, sub.filter(Boolean).join(' · ')) : null));
}

function scopeList(w, full = false) {
  if (!w.scopes?.length) return null;
  // У списку — лише основний приціл: решта в картці, інакше плитка росте на пів екрана.
  const list = full ? w.scopes : [M.defaultScope(w) ?? w.scopes[0]];
  const more = full ? 0 : w.scopes.length - list.length;
  return h('div', { class: `scopes ${full ? '' : 'small'}` }, list.map((s) => scopeLine(s, full, more)));
}

function weaponPhotos(weaponId) {
  return state.photos.filter((p) => p.weaponId === weaponId).sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
}

function coverPhoto(w) {
  const list = weaponPhotos(w.id);
  return list.find((p) => p.id === w.coverId) ?? list[0] ?? null;
}

/** Без фото — монограма за назвою на плитці кольору калібру: стволи видно один від одного. */
function weaponThumb(w) {
  const cover = coverPhoto(w);
  if (cover) return h('img', { class: 'thumb', src: cover.thumb, alt: '' });
  const letters = String(w.name ?? '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('');
  return h('div', { class: 'thumb mono', style: `--h:${caliberHue(w.caliber)}`, 'aria-hidden': 'true' }, letters.toUpperCase() || '—');
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
  // Кожна частина переноситься цілком: «№» не відривається від номера, калібр — від своїх цифр.
  const info = [w.caliber, w.serial && `№ ${w.serial}`, kitText(w) || null].filter(Boolean)
    .flatMap((x, i) => [i ? ' · ' : null, h('span', { class: 'nw' }, x)]).filter(Boolean);
  const card = h('article', { class: 'card tall', 'data-id': w.id },
    h('div', { class: 'swipe-body wrap' },
      weaponThumb(w),
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, w.name),
        info.length ? h('div', { class: 'muted small' }, info) : null),
      // Настріл і розкид — значками замість підписів: колонка вужча, назві й номеру лишається місце.
      h('div', { class: 'big-col' },
        h('div', { class: 'big', title: t('настрел') }, bigIco(KIND_ICON.shot), fmt.num(shots), h('span', { class: 'sr' }, t('настрел'))),
        precisionBadge(w)),
      // Приціл — рядком на всю ширину: між фото й настрілом на телефоні його назва рвалась посеред слова.
      w.scopes?.length ? h('div', { class: 'card-foot weapon-info' }, scopeList(w)) : null,
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
  const archived = archiveBlock(state.weapons.filter((w) => w.archived), (w) => saveEntity('weapons', { ...w, archived: false }));
  if (!active.length) return h('div', {}, empty(t('Оружие не добавлено'), t('Нажмите «+», чтобы добавить ствол: калибр, настрел до начала учёта, ресурс ствола и интервал чистки.')), archived);
  // Загальний настріл зі званням — лише тут; розбивка: свої стволи, чужа зброя, без ствола, до початку обліку.
  const shots = M.totalShots(state);
  const split = [
    [fmt.num(active.length), t('стволов')],
    shots.foreign || shots.noGun ? [fmt.num(shots.own), t('из своих стволов')] : null,
    shots.foreign ? [fmt.num(shots.foreign), t('из чужого оружия')] : null,
    shots.noGun ? [fmt.num(shots.noGun), t('без ствола')] : null,
    shots.initial ? [fmt.num(shots.initial), t('до начала учёта — из карточек стволов')] : null,
  ].filter(Boolean);
  $('subtitle').textContent = t('Свайп ← записать стрельбу, → почистил');
  return h('div', {},
    shotsHero(shots.total, split),
    urgentPermitsBlock(),
    active.sort(byName).map(weaponCard),
    archived);
}

/** Дульні звуження гладкого ствола: позначення й звужувальна вставка. */
const CHOKES = [['cyl', 'Цилиндр'], ['ic', 'Получок 1/4'], ['mod', 'Получок 1/2'],
  ['im', 'Чок 3/4'], ['full', 'Полный чок'], ['xf', 'Усиленный чок'], ['var', 'Сменный']];

/** Що навішано на ствол: глушник, сошки, дульне звуження. Усе необов'язкове. */
function kitBox(w) {
  const yesNo = (value) => chips([['', t('нет')], ['1', t('да')]], value ? '1' : '');
  const suppressor = yesNo(w?.suppressor);
  const bipod = yesNo(w?.bipod);
  const choke = h('select', {},
    [['', t('— нет —')], ...CHOKES].map(([k, label]) => h('option', { value: k, selected: k === (w?.choke ?? '') }, k ? t(label) : label)));
  const el = box(t('Оснащение'), h('div', { class: 'form' },
    h('label', { class: 'field half' }, h('span', { class: 'field-label' }, t('Глушитель')), suppressor),
    h('label', { class: 'field half' }, h('span', { class: 'field-label' }, t('Сошки')), bipod),
    h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, t('Дульное сужение')), choke,
      h('small', { class: 'muted' }, t('Для гладкого ствола. Для нарезного оставьте «нет».')))));
  return { el, values: () => ({ suppressor: suppressor.value === '1', bipod: bipod.value === '1', choke: choke.value || null }) };
}

/** Підпис оснащення для картки й плитки: «глушник · сошки · чок 1/2» або порожньо. */
function kitText(w) {
  return [w?.suppressor ? t('глушитель') : null, w?.bipod ? t('сошки') : null,
    w?.choke ? t(CHOKES.find(([k]) => k === w.choke)?.[1] ?? '') : null].filter(Boolean).join(' · ');
}

function weaponForm(w = null) {
  const f = form([
    { name: 'name', label: t('Название'), required: true, value: w?.name, placeholder: 'AR-15 16"', half: true },
    { name: 'serial', label: t('Серийный номер'), value: w?.serial, half: true },
    { name: 'caliber', label: t('Калибр'), required: true, value: w?.caliber, list: 'cal-list', half: true },
    { name: 'initialShots', label: t('Настрел до начала учёта'), type: 'number', step: 1, min: 0, value: w?.initialShots ?? 0, half: true },
    { name: 'barrelLife', label: t('Ресурс ствола, выстрелов'), type: 'number', step: 1, min: 0, value: w?.barrelLife, half: true },
    { name: 'note', label: t('Примечание'), value: w?.note, wide: true },
  ]);
  f.el.append(caliberList());
  barrelHint(f);
  const remind = cleanReminderBox(w);
  const kit = kitBox(w);
  const permit = permitFields(w);
  const scopesBox = h('div', { class: 'items' });
  const addScope = (s = {}) => {
    const name = h('input', { type: 'text', placeholder: t('Модель: Vortex Diamondback 4-12x40'), autocomplete: 'off', class: 'sc-name' });
    name.value = s.name ?? '';
    const kind = h('select', { class: 'sc-kind' },
      Object.entries(SCOPE_KINDS).map(([k, label]) => h('option', { value: k, selected: k === (s.kind ?? 'optic') }, t(label))));
    const zero = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: t('Пристрелка, м'), class: 'sc-zero' });
    zero.value = s.zero ?? '';
    // ціна клацання прицілу — підставляється в мішень, коли вибрали цей приціл; нестандартна — «Своє значення»
    const own = s.click && !CLICKS.some(([k]) => k === s.click) ? CLICK_KEY.exec(s.click) : null;
    const click = h('select', { class: 'sc-click', 'aria-label': t('Цена щелчка прицела') },
      [['', t('— цена щелчка —')], ...CLICKS, [OWN_CLICK, 'Своё значение…']]
        .map(([k, label]) => h('option', { value: k, selected: k === (own ? OWN_CLICK : s.click ?? '') }, k ? t(label) : label)));
    const ownValue = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: t('Цена щелчка'), class: 'sc-own-value' });
    ownValue.value = own ? Number(own[2]) : '';
    const ownUnit = h('select', { class: 'sc-own-unit', 'aria-label': t('Единица') },
      [['mil', 'MRAD'], ['moa', 'MOA'], ['mm', t('мм / 100 м')]].map(([k, label]) => h('option', { value: k, selected: k === (own?.[1] ?? 'mil') }, label)));
    const ownBox = h('div', { class: 'sc-own', hidden: !own }, ownValue, ownUnit);
    click.addEventListener('change', () => {
      ownBox.hidden = click.value !== OWN_CLICK;
      if (!ownBox.hidden) ownValue.focus();
    });
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
      kind, reticle, zero, click, ownBox, note,
      h('label', { class: 'sc-def small' }, def, t('Использовать по умолчанию при записи стрельбы')));
    scopesBox.append(row);
  };
  (w?.scopes ?? []).forEach(addScope);
  const close = sheet(w ? t('Изменить оружие') : t('Новое оружие'), h('div', {},
    f.el, kit.el, remind.el, permit.el, h('h3', {}, t('Прицелы')), scopesBox, btn(t('+ прицел'), () => addScope())), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f) || permit.invalid()) return;
    // «Своє значення» без числа інакше тихо стерло б ціну клацання
    const noOwn = [...scopesBox.querySelectorAll('.scope-row')].find((row) => row.querySelector('.sc-click').value === OWN_CLICK
      && row.querySelector('.sc-name').value.trim() && !ownClickKey(row.querySelector('.sc-own-value').value, 'mil'));
    if (noOwn) {
      fieldError(noOwn.querySelector('.sc-own-value'), t('Укажите цену щелчка'));
      noOwn.querySelector('.sc-own-value').focus();
      return;
    }
    const v = f.values();
    const scopes = [...scopesBox.querySelectorAll('.scope-row')].map((row) => {
      const zero = Number(String(row.querySelector('.sc-zero').value).replace(',', '.'));
      const click = row.querySelector('.sc-click').value;
      return {
        id: row.dataset.id,
        name: row.querySelector('.sc-name').value.trim(),
        kind: row.querySelector('.sc-kind').value,
        zero: zero > 0 ? zero : null,
        click: click === OWN_CLICK ? ownClickKey(row.querySelector('.sc-own-value').value, row.querySelector('.sc-own-unit').value) : click || null,
        reticle: row.querySelector('.sc-ret').value || null,
        note: row.querySelector('.sc-note').value.trim(),
        default: row.querySelector('.sc-def input').checked,
      };
    }).filter((s) => s.name);
    close();
    await saveEntity('weapons', { ...(w ?? { id: db.uid(), created: Date.now() }), ...v, ...remind.values(), ...kit.values(), ...permit.values(), initialShots: v.initialShots ?? 0, scopes });
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
  if (added) confirmed();
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
  confirmed();
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
    onCover: async (p) => { await saveEntity('weapons', { ...findWeapon(weaponId), coverId: p.id }); fill(); },
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
  const tools = [toolBtn('report', t('Отчёт'), () => reportSheet(findWeapon(w.id) ?? w)),
    ...cardTools(() => { close(); weaponForm(findWeapon(w.id) ?? w); }, weaponHasMoves(w),
      () => { close(); removeWeapon(findWeapon(w.id) ?? w); })];
  const close = sheet(w.name, body(), { live: body, tools });
}

const REPORT_PERIODS = [['all', 'За всё время'], ['year', 'Этот год'], ['last', 'Прошлый год'], ['12m', 'Последние 12 месяцев']];

/** Межі періоду звіту [від, до] включно; null — без межі. */
function reportRange(period) {
  const today = M.today();
  const y = Number(today.slice(0, 4));
  if (period === 'year') return [`${y}-01-01`, today];
  if (period === 'last') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (period === '12m') return [M.addDays(today, -365), today];
  return [null, null];
}

/** Звіт по стволу: перегляд у шторці, а PDF — з вікна друку браузера («Зберегти як PDF»). */
function reportSheet(w) {
  let period = REPORT_PERIODS.some(([k]) => k === recall('shooters-log:report-period')) ? recall('shooters-log:report-period') : 'all';
  const preview = h('div', { class: 'report-preview' });
  const draw = () => preview.replaceChildren(weaponReport(findWeapon(w.id) ?? w, reportRange(period)));
  const periods = chips(REPORT_PERIODS.map(([k, label]) => [k, t(label)]), period, (v) => {
    period = v;
    remember('shooters-log:report-period', v);
    draw();
  });
  draw();
  const close = sheet(t('Отчёт по оружию'),
    h('div', {}, periods, h('p', { class: 'muted small' }, t('В окне печати выберите «Сохранить как PDF», чтобы получить файл.')), preview), {
      actions: [btn(t('Закрыть'), () => close()), btn(t('Печать / PDF'), () => printReport(preview.firstChild), 'primary')],
    });
}

/** Друк: копія звіту поверх застосунку (решту ховає @media print), після друку прибирається. */
function printReport(report) {
  document.getElementById('print-report')?.remove();
  const page = h('div', { id: 'print-report' }, report.cloneNode(true));
  document.body.append(page);
  window.addEventListener('afterprint', () => page.remove(), { once: true });
  window.print();
}

/** Таблиця звіту; numeric — індекси колонок із числами (вирівнювання праворуч). */
function reportTable(head, rows, numeric = []) {
  const cls = (i) => (numeric.includes(i) ? 'num' : null);
  return h('div', { class: 'report-scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: cls(i) }, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((x, i) => h('td', { class: cls(i) }, x ?? '')))))));
}

/** Зміст звіту: підсумки за період, купчастість за набоями й таблиця стрільб і чисток. */
function weaponReport(w, [from, to]) {
  const inRange = (x) => (!from || (x.date ?? '') >= from) && (!to || (x.date ?? '') <= to);
  const all = state.movements.filter((m) => m.weaponId === w.id && (m.kind === 'shot' || m.kind === 'clean'));
  const moves = all.filter(inRange).sort((a, b) => M.byDateDesc(b, a));
  const shots = moves.filter((m) => m.kind === 'shot');
  const fired = -M.sumBy(shots, () => true);
  const cost = M.shotsCost(state, shots);
  const total = M.weaponShots(state, w);
  const life = Number(w.barrelLife);
  const lastClean = all.filter((m) => m.kind === 'clean').sort(M.byDateDesc)[0];
  const p = w.permit;
  const permit = p ? [p.number && `№ ${p.number}`, p.expires && t('действует до {date}', { date: fmt.date(p.expires) })].filter(Boolean).join(' · ') : '';
  const summary = [
    [t('Настрел за период'), fmt.num(fired)],
    [t('Настрел всего'), fmt.num(total)],
    [t('Дней со стрельбой'), fmt.num(new Set(shots.map((m) => m.date)).size)],
    cost ? [t('Стоимость стрельб'), fmt.money(cost)] : null,
    cost && fired ? [t('Средняя за выстрел'), fmt.money(cost / fired)] : null,
    [t('Чисток за период'), fmt.num(moves.length - shots.length)],
    lastClean ? [t('Последняя чистка'), fmt.date(lastClean.date)] : null,
    [t('Выстрелов после чистки'), fmt.num(M.cleaningStatus(state, w).since)],
    life > 0 ? [t('Ресурс ствола'), `${fmt.num(total)} / ${fmt.num(life)} (${Math.round((total / life) * 100)}%)`] : null,
    permit ? [t('Разрешение на оружие'), permit] : null,
    w.scopes?.length ? [t('Прицелы'), w.scopes.map((s) => s.name).join(', ')] : null,
  ].filter(Boolean);
  const len = (mm) => length(mm, targetUnit, 100);
  const precision = M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id && inRange(x)), state.photos);
  return h('article', { class: 'report' },
    h('h2', {}, w.name),
    h('p', { class: 'muted small' }, [w.caliber, w.serial && `№ ${w.serial}`, kitText(w) || null].filter(Boolean).join(' · ')),
    h('p', { class: 'muted small' }, from || to
      ? t('Период: {from} — {to}', { from: from ? fmt.date(from) : '…', to: fmt.date(to) })
      : t('Период: всё время')),
    h('dl', { class: 'kv report-kv' }, summary.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    precision.length ? [h('h3', {}, t('Кучность по патронам (на 100 м)')),
      reportTable([t('Патрон'), t('Групп'), t('Выстр.'), t('Ср. радиус'), t('Лучший размах')],
        precision.map((r) => [findCartridge(r.cartridgeId)?.name ?? t('(удалено)'), fmt.num(r.groups), fmt.num(r.shots), len(r.meanRadius), len(r.best)]),
        [1, 2, 3, 4])] : null,
    h('h3', {}, t('Стрельбы и чистки')),
    moves.length
      ? reportTable([t('Дата'), t('Тип'), t('Патрон'), t('Кол-во'), t('Сумма'), t('Примечание')],
        moves.map((m) => {
          const money = m.kind === 'shot' ? M.shotCost(state, m) : 0;
          return [fmt.date(m.date), t(M.KINDS[m.kind]), m.kind === 'shot' ? movementTitle(m) : '',
            m.kind === 'shot' ? fmt.num(-m.qty) : '', money ? fmt.money(money) : '', m.note ?? ''];
        }), [3, 4])
      : h('p', { class: 'muted small' }, t('За период записей нет')),
    h('p', { class: 'muted small report-foot' }, t('Создано в Shooters Log {date}', { date: fmt.date(M.today()) })));
}

const weaponHasMoves = (w) => state.movements.some((m) => m.weaponId === w.id);

/** Зброя з рухами — в архів (історія лишається), без рухів — видалити разом із фото. */
function removeWeapon(w) {
  if (weaponHasMoves(w)) {
    saveEntity('weapons', { ...w, archived: true });
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
    h('p', { class: 'muted' }, [w.caliber, w.serial && `№ ${w.serial}`, kitText(w) || null, w.note].filter(Boolean).join(' · ')),
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
    precisionChart(w),
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
  const windy = d.windSpeed > 0 && d.rows.some((r) => r.wind > 0);
  // Колонка вузька: винос у поділках сітки, без сітки — сантиметри
  const windCell = (dist) => {
    const mrad = M.windAt(d.rows, dist);
    if (mrad === null) return '—';
    return reticle === 'mil' || reticle === 'moa' ? `${num(M.fromMrad(mrad, reticle), 1)} ${reticle === 'moa' ? 'MOA' : 'MRAD'}`
      : `${num(M.fromMrad(mrad, 'cm', dist), 0)} ${t('см')}`;
  };
  const table = h('table', { class: 'dope' },
    h('thead', {}, h('tr', {}, h('th', {}, t('м')), h('th', {}, t('Барабан')), h('th', {}, t('Вынос')),
      windy ? h('th', {}, t('Ветер {v} м/с', { v: fmt.num(d.windSpeed) })) : null)),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.zero ? 'zero' : '' },
      h('td', {}, fmt.num(r.distance)),
      h('td', {}, r.zero ? t('пристрелка') : elevText(r.mrad, scope?.click)),
      h('td', {}, r.zero ? '0' : holdText(r.mrad, r.distance, reticle)),
      windy ? h('td', {}, windCell(r.distance)) : null))));
  const out = h('p', { class: 'dope-out small' });
  const at = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, placeholder: t('Другая дистанция, м'), class: 'dope-at' });
  const speed = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: t('Ветер, м/с') });
  // Звідки дме: 3 і 9 — повний боковий, 12 і 6 — поправки немає
  const clock = h('select', { 'aria-label': t('Откуда ветер') },
    selectOptions(Array.from({ length: 12 }, (_, i) => [String(i + 1), t('на {n} ч', { n: i + 1 })]), '3'));
  const windLine = (dist) => {
    const v = Number(speed.value.replace(',', '.'));
    const base = M.windAt(d.rows, dist);
    if (!(v > 0) || base === null) return null;
    const h12 = Number(clock.value);
    const mrad = (base * v * M.windShare(h12)) / d.windSpeed;
    if (mrad < 0.0005) return `${t('ветер')}: ${t('без поправки')}`;
    // Вітер справа зносить кулю вліво — виносимо назустріч вітру
    return `${t('ветер')}: ${t('вынос')} ${holdText(mrad, dist, reticle, h12 < 6 ? '→' : '←')}`;
  };
  const calc = () => {
    const dist = Number(at.value);
    const mrad = dist > 0 ? M.dopeAt(d.rows, dist, scope?.zero) : null;
    out.textContent = !(dist > 0) ? '' : mrad === null ? t('вне таблицы — добавьте строку')
      : [`${elevText(mrad, scope?.click)} · ${t('вынос')} ${holdText(mrad, dist, reticle)}`, windy ? windLine(dist) : null]
        .filter(Boolean).join('\n');
  };
  for (const el of [at, speed]) el.addEventListener('input', calc);
  clock.addEventListener('change', calc);
  return h('div', { class: 'dope-card' },
    h('div', { class: 'dope-head' }, h('span', { class: 'row-title' }, dopeTitle(w, d)),
      toolBtn('edit', t('Изменить'), () => dopeForm(w, d), 'small')),
    d.note ? h('p', { class: 'muted small' }, d.note) : null,
    table, h('div', { class: `dope-calc ${windy ? 'windy' : ''}` }, at, windy ? speed : null, windy ? clock : null), out);
}

/** Форма таблиці DOPE: приціл, набій, одиниці й рядки «дистанція — поправка» (плюс — вгору). */
/**
 * «Вставити таблицю» у формі DOPE: текст зі Strelok, Excel чи блокнота → рядки форми.
 * Дистанція — перша колонка; яка колонка поправка, а яка вітер — вибирають (у Strelok їх багато).
 */
function dopePaste(onRows) {
  const text = h('textarea', { class: 'dope-paste-text', rows: 5, placeholder: '100  0\n200  0,9  0,3\n300  2,1  0,6', 'aria-label': t('Таблица') });
  const valueCol = h('select', { 'aria-label': t('Поправка — колонка') });
  const windCol = h('select', { 'aria-label': t('Ветер — колонка') });
  const found = h('small', { class: 'muted' });
  let table = [];
  // Колонку вітру, вибрану руками (зокрема «без вітру»), нове вставлення не перебиває
  let windPicked = false;
  windCol.addEventListener('change', () => { windPicked = true; });
  const read = () => {
    table = M.parseTable(text.value);
    const n = Math.max(0, ...table.map((r) => r.length));
    const first = table[0] ?? [];
    const cols = Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1)
      .map((i) => [i, `${t('колонка {n}', { n: i + 1 })}${first[i] === undefined ? '' : ` · ${num(first[i], 2)}`}`]);
    const keep = (sel, fallback) => (cols.some(([i]) => String(i) === sel.value) ? sel.value : fallback);
    const value = keep(valueCol, 1);
    const wind = windPicked ? keep(windCol, '') : n >= 3 ? 2 : '';
    valueCol.replaceChildren(...selectOptions(cols, value));
    windCol.replaceChildren(...selectOptions([['', t('без ветра')], ...cols], wind));
    found.textContent = text.value.trim() ? t('Строк: {n}', { n: table.length }) : '';
  };
  text.addEventListener('input', read);
  const cell = (row, col) => (col === '' || row[col] === undefined ? '' : String(row[col]).replace('.', ','));
  const panel = h('div', { class: 'dope-paste', hidden: true },
    h('p', { class: 'muted small' }, t('Скопируйте таблицу из баллистического калькулятора (Стрілець, Strelok) или Excel либо напишите строками: дистанция, поправка, ветер. Числа — в единицах, выбранных выше.')),
    text, found,
    h('div', { class: 'dope-paste-cols' },
      h('label', { class: 'small' }, t('Поправка — колонка'), valueCol),
      h('label', { class: 'small' }, t('Ветер — колонка'), windCol)),
    btn(t('Заполнить строки'), () => {
      if (!table.length) { fieldError(text, t('Не нашёл строк: в начале строки — дистанция, дальше поправка')); return; }
      onRows(table.map((r) => ({ distance: Math.round(r[0]), value: cell(r, Number(valueCol.value)), wind: cell(r, windCol.value === '' ? '' : Number(windCol.value)) }))
        .filter((r) => r.value !== ''));
      panel.hidden = true;
    }, 'primary'));
  read();
  const button = btn(t('Вставить таблицу'), () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) text.focus();
  });
  return { button, panel };
}

function dopeForm(w, d = null) {
  const scopes = w.scopes ?? [];
  const cartridges = caliberOptions(state.cartridges.filter((c) => !c.archived || c.id === d?.cartridgeId), w.caliber);
  const f = form([
    { name: 'scopeId', label: t('Прицел'), type: 'select', value: d ? d.scopeId ?? '' : M.defaultScope(w)?.id ?? scopes[0]?.id ?? '', options: [...scopes.map((s) => [s.id, s.name]), ['', t('Без прицела')]], wide: true },
    { name: 'cartridgeId', label: t('Патрон'), type: 'select', value: d?.cartridgeId ?? cartridges.match[0]?.id ?? '', options: [['', t('— не указывать —')], ...cartridges.options], wide: true },
    { name: 'note', label: t('Примечание'), value: d?.note, placeholder: t('Погода, высота, источник цифр…'), wide: true },
  ]);
  ammoPicker(f.inputs.cartridgeId, w.caliber);
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
    wind: row.querySelector('.dope-w').value.trim(),
  }));
  const mradOf = (text, u, distance) => M.toMrad(Number(text.replace(',', '.')), dopeUnitKey(u, scope()), distance);
  // Знос вітром — величина без знака: напрям обирають під час розрахунку
  const toMradRows = (list, u) => list.filter((r) => r.distance > 0 && r.value !== '')
    .map((r) => ({ distance: r.distance, mrad: mradOf(r.value, u, r.distance), wind: r.wind === '' ? null : Math.abs(mradOf(r.wind, u, r.distance)) }));
  const addRow = (distance = '', value = '', wind = '') => {
    const dist = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, placeholder: t('м'), class: 'dope-d' });
    dist.value = distance;
    const val = h('input', { type: 'text', inputmode: 'decimal', placeholder: '+0', class: 'dope-v' });
    val.value = value;
    const windIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', class: 'dope-w' });
    windIn.value = wind;
    const row = h('div', { class: 'dope-row' }, dist, val, windIn,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Удалить'), onclick: () => row.remove() }, '✕'));
    rowsBox.append(row);
  };
  const windForm = form([{ name: 'windSpeed', label: t('Колонка «Ветер» — при ветре, м/с'), type: 'number', step: 'any', min: 0,
    value: d?.windSpeed ?? 5, hint: t('Поправка при боковом ветре (на 3 или 9 ч) с такой скоростью. Направление и силу ветра выберете при расчёте.') }]);
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
      const convert = (text, distance) => {
        const mrad = text === '' ? null : mradOf(text, prev, distance);
        return mrad === null || !Number.isFinite(mrad) ? text : toText(mrad, distance);
      };
      rows.forEach((r) => addRow(r.distance || '', convert(r.value, r.distance), convert(r.wind, r.distance)));
      if (!rows.length) addRow();
      drawUnits();
    });
    next.classList.add('segmented');
    units.replaceChildren(next);
    unitHint.textContent = unit === 'cm' ? t('Сантиметры на цели: насколько попадание ниже точки прицеливания без поправки.') : t('Плюс — вверх (дальше пристрелки), минус — вниз.');
  };
  if (d) d.rows.forEach((r) => addRow(r.distance, toText(r.mrad, r.distance), r.wind > 0 ? toText(r.wind, r.distance) : ''));
  else (scope()?.zero >= 100 ? [200, 300, 400, 500] : [100, 200, 300]).forEach((x) => addRow(x));
  f.inputs.scopeId.addEventListener('change', drawUnits);
  windForm.el.classList.add('dope-wind');
  const paste = dopePaste((rows) => {
    rowsBox.replaceChildren();
    rows.forEach((r) => addRow(r.distance, r.value, r.wind));
  });
  const body = h('div', {}, f.el, h('h3', {}, t('Поправки')), units, unitHint, windForm.el,
    h('div', { class: 'dope-row dope-cols muted small' }, h('span', {}, t('Дистанция, м')), h('span', {}, t('Поправка')), h('span', {}, t('Ветер'))),
    rowsBox, h('div', { class: 'btn-row' }, btn(t('+ строка'), () => addRow()), paste.button), paste.panel);
  drawUnits();
  const remove = d ? () => confirmSheet(t('Удалить таблицу?'), dopeTitle(w, d), t('Удалить'), async () => {
    close();
    const cur = findWeapon(w.id) ?? w;
    await saveEntity('weapons', { ...cur, dope: (cur.dope ?? []).filter((x) => x.id !== d.id) });
  }) : null;
  const close = sheet(d ? t('Таблица поправок') : t('Новая таблица поправок'), body, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
    tools: remove ? [toolBtn('delete', t('Удалить'), remove, 'danger')] : [],
  });
  async function save() {
    const raw = readRows().filter((r) => r.distance > 0 && r.value !== '');
    const notNumber = (text) => text !== '' && !Number.isFinite(Number(text.replace(',', '.')));
    if (raw.some((r) => notNumber(r.value) || notNumber(r.wind))) { formError(t('Поправка — число, например 1,2 или -0,5')); return; }
    const byDistance = new Map(toMradRows(raw, unit).filter((r) => r.mrad !== null)
      .map(({ wind, ...r }) => [r.distance, wind > 0 ? { ...r, wind } : r]));
    const rows = [...byDistance.values()].sort((a, b) => a.distance - b.distance);
    if (!rows.length) { formError(t('Заполните хотя бы одну строку')); return; }
    const windSpeed = Number(windForm.values().windSpeed);
    if (rows.some((r) => r.wind) && !(windSpeed > 0)) {
      fieldError(windForm.inputs.windSpeed, t('Укажите, при каком ветре составлена колонка'));
      return;
    }
    const v = f.values();
    const card = { id: d?.id ?? db.uid(), scopeId: v.scopeId || null, cartridgeId: v.cartridgeId || null, unit, note: v.note || null, rows,
      windSpeed: windSpeed > 0 ? windSpeed : null };
    const cur = findWeapon(w.id) ?? w;
    const list = cur.dope ?? [];
    close();
    await saveEntity('weapons', { ...cur, dope: d ? list.map((x) => (x.id === d.id ? card : x)) : [...list, card] });
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
      if (!issued) { fieldError(f.inputs.issued, t('Сначала укажите дату выдачи')); return; }
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
    if (bad) fieldError(f.inputs[bad.name], t('Дата «{label}» — в виде ДД.ММ.ГГГГ', { label: bad.label }));
    return Boolean(bad);
  };
  return { el: box([t('Разрешение на оружие'), toAll], [f.el, h('div', { class: 'chips permit-quick' }, plus3)]), values, invalid };
}

/** Ті самі дати видачі й закінчення — решті стволів (номери в кожного свої, їх не чіпаємо). */
function permitDatesToAll(w, v) {
  if (Number.isNaN(v.issued) || Number.isNaN(v.expires)) { formError(t('Дата — в виде ДД.ММ.ГГГГ')); return; }
  if (!v.issued && !v.expires) { formError(t('Сначала укажите даты')); return; }
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
  if (!urgent.length || recall('shooters-log:docs-reminded') === M.today()) return false;
  remember('shooters-log:docs-reminded', M.today());
  toast(t('Разрешение на оружие: {names}', { names: urgent.map((w) => w.name).join(', ') }), {
    action: t('Показать'),
    onAction: () => { location.hash = '#guns'; },
  });
  return true;
}

// ---------- журнал ----------

const KIND_ICON = {
  buy: '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  shot: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  // Набій і велика лійка з порохом: споряджено власноруч.
  reload: '<path d="M2.5 21V11l.8-1.5V7c0-1.4.6-2.8 1.2-3.5.6.7 1.2 2.1 1.2 3.5v2.5l.8 1.5v10z"/><path d="M2.5 14h4"/><path d="M9.5 3h13l-5 6v4.5h-3V9z"/><path d="M16 16.8h0M16 20.3h0"/>',
  consume: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M9 12h6"/>',
  adjust: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  // Крапля мастила над лінією ствола: чистка — це догляд, а не прибирання.
  // Гільза й стрілка вниз: зібране повертається на склад.
  collect: '<path d="M6 21v-9l.8-1.6V8c0-1.3.5-2.5 1.2-3.2.7.7 1.2 1.9 1.2 3.2v2.4L10 12v9z"/><path d="M17 4v9M13.5 9.5 17 13l3.5-3.5M14 18h6"/>',
  clean: '<path d="M4 17.5h16"/><path d="M12 4c2.2 2.8 3.4 4.8 3.4 6.4a3.4 3.4 0 0 1-6.8 0C8.6 8.8 9.8 6.8 12 4z"/>',
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
 * видно з іконки. day — число й місяць на початку рядка (Журнал по тижнях, місяцях, роках).
 * skip.weapon / skip.cartridge — не повторювати ствол чи набій картки.
 */
function logRow(m, { date = false, day = false, skip = {} } = {}) {
  const money = m.kind === 'shot' ? M.shotCost(state, m) : m.price;
  const gun = m.kind === 'clean' || skip.weapon ? null : shotGun(m);
  // У картці набій — поруч із датою в заголовку; стрільба без набою з БК — калібр і чому без списання.
  const name = date && m.kind !== 'clean' && !(skip.cartridge && m.cartridgeId) && !(skip.component && m.componentId) ? movementTitle(m) : null;
  // Витрата компонента — на який рецепт пішла.
  const forRecipe = m.kind === 'consume' && m.recipeId ? state.recipes.find((r) => r.id === m.recipeId)?.name : null;
  const noStock = date && m.kind === 'shot' && !m.cartridgeId && !m.foreignAmmo ? t('без списания из БК') : null;
  const title = date ? [fmt.date(m.date), name].filter(Boolean).join(' · ') : movementTitle(m);
  const each = buyUnitPrice(m);
  // Скільки мішеней прив'язано до цієї стрільби — інакше про них видно лише в картці.
  const targets = m.kind === 'shot' ? state.targets.filter((x) => x.movementId === m.id).length : 0;
  // Стрільба, записана з результату вправи: видно, що це тренування, а не просто настріл.
  const score = m.kind === 'shot' ? state.scores.find((x) => x.movementId === m.id) : null;
  const fromExercise = score ? t('упражнение: {name}', { name: exerciseName(score.exercise) ?? '—' }) : null;
  // Вправу виділяємо жирним — у списку одразу видно, що стрільба з тренування.
  const rest = [forRecipe, fromExercise ? h('b', { class: 'row-ex' }, fromExercise) : null,
    m.foreignAmmo ? t('чужие патроны') : noStock,
    fromExercise ? null : m.note, money ? fmt.money(money) : null,
    each ? t('{price} за {unit}', { price: fmt.money(each), unit: m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : 'шт' }) : null];
  // Ствол і приціл — кожен своїм рядком: «ствол (приціл) · вправа · …» в одному рядку на телефоні рвався посеред назви.
  const lines = [[day && m.date ? h('b', { class: 'row-day' }, fmt.date(m.date).slice(0, 5)) : null, date ? null : t(M.KINDS[m.kind]), gun?.name], [gun?.scope], rest]
    .map((line) => line.filter(Boolean))
    .filter((line) => line.length)
    .map((line) => h('span', { class: 'muted small' }, line.flatMap((p, i) => (i ? [' · ', p] : [p]))));
  const unit = m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : '';
  return h('button', { type: 'button', class: `row kind-${m.kind}`, 'data-id': m.id, onclick: () => movementDetail(m) },
    kindIcon(m.kind),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), ...lines),
    m.kind === 'clean' ? null : h('span', { class: 'row-side' },
      h('span', { class: `row-qty ${m.qty < 0 ? 'neg' : m.qty > 0 ? 'pos' : ''}` }, `${fmt.signed(m.qty)}${unit ? ` ${unit}` : ''}`),
      // Значок мішені з числом: у будь-якому списку стрільб видно, що її вже розібрано по фото.
      targets ? h('span', { class: 'row-targets small muted', title: t('мишеней: {n}', { n: targets }) },
        targetIco(), fmt.num(targets)) : null));
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
      await saveEntity('movements', { ...rest, weaponId, scopeId: M.defaultScope(findWeapon(weaponId))?.id ?? null, ...(foreignWeapon ? { foreignWeapon } : {}) });
      if (warn) toast(warn);
      onChange?.();
    },
  }, selectOptions([['', t('— не указывать —')], [FOREIGN, t('Чужое оружие')], ...guns.options], m.foreignWeapon ? FOREIGN : m.weaponId ?? ''));
}

/** Набій у записі стрільби можна змінити: калібр і вартість — від нового набою, залишки перерахуються самі. */
function shotCartridgeSelect(m) {
  const w = findWeapon(m.weaponId);
  const own = caliberOptions(state.cartridges.filter((c) => c.id === m.cartridgeId || !c.archived), w?.caliber ?? m.caliber);
  return h('select', {
    class: 'inline-select', 'aria-label': t('Патрон'),
    onchange: async (e) => {
      const c = findCartridge(e.target.value);
      const { foreignAmmo: _foreign, price: _price, ...rest } = freshMovement(m);
      // Стара вартість належала іншому набою — рахуємо за поточною середньою ціною нового.
      const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
      const warn = caliberMismatch(c, w);
      await saveEntity('movements', {
        ...rest, cartridgeId: c?.id ?? null, caliber: c?.caliber ?? rest.caliber,
        ...(unit ? { price: +(unit * -rest.qty).toFixed(2) } : {}),
        ...(e.target.value === FOREIGN ? { foreignAmmo: true } : {}),
      });
      if (warn) toast(warn);
    },
  }, selectOptions([['', t('— без списания из БК —')], [FOREIGN, t('Чужие патроны')], ...own.options],
    m.cartridgeId ?? (m.foreignAmmo ? FOREIGN : '')));
}

/** Інший набій для покупки чи перерахунку: залишки переходять на нього, сума покупки лишається як заплатили. */
function movementCartridgeSelect(m) {
  const own = caliberOptions(state.cartridges.filter((c) => c.id === m.cartridgeId || !c.archived), m.caliber);
  return h('select', {
    class: 'inline-select', 'aria-label': t('Патрон'),
    onchange: async (e) => {
      const c = findCartridge(e.target.value);
      if (c) await saveEntity('movements', { ...freshMovement(m), cartridgeId: c.id, caliber: c.caliber });
    },
  }, selectOptions(own.options, m.cartridgeId));
}

function shotScopeSelect(m) {
  const w = findWeapon(m.weaponId);
  return h('select', {
    class: 'inline-select', 'aria-label': t('Прицел'),
    onchange: async (e) => {
      await saveEntity('movements', { ...freshMovement(m), scopeId: e.target.value || null });
    },
  }, selectOptions(scopeOptions(w), m.scopeId ?? ''));
}

/** Мішень на кнопці: ті самі кола, що й на вкладці «Полігон». */
/** Значок: дистанція пристрілки — перехрестя в колі. */
function zeroIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>';
  return el;
}

/** Значок: ціна клацання — барабан прицілу з рискою. */
function clickIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 5.5V2M15.5 3.4l1.4-2.4M8.5 3.4 7.1 1M12 12l3-3"/></svg>';
  return el;
}

/** Значок «є ще приціли»: два кільця одне за одним — як стос однакових речей. */
function scopeIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="15" r="5.5"/><circle cx="15" cy="9" r="5.5"/></svg>';
  return el;
}

function targetIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
  return el;
}

/** Мішені запису стрільби: кожна відкривається, «+» додає ще одну (100 і 300 м за одну стрільбу тощо). */
function shotTargets(m, closeSheet) {
  return targetsBlock(state.targets.filter((x) => x.movementId === m.id), { movement: m }, closeSheet);
}

/** Мішені результату вправи, коли набої не списували: запису стрільби немає, тож мішень тримається за сам результат. */
function scoreTargets(score, closeSheet) {
  return targetsBlock(state.targets.filter((x) => x.scoreId === score.id), { score }, closeSheet);
}

function targetsBlock(targets, prefill, closeSheet) {
  const list = [...targets].sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  return h('div', {},
    list.length ? box(t('Мишени'), h('div', { class: 'rows' }, list.map((tg) => targetRow(tg, closeSheet)))) : null,
    h('div', { class: 'btn-row' }, btn([targetIco(), list.length ? t('+ ещё мишень') : t('+ Мишень')], () => {
      closeSheet();
      newTarget(prefill);
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
    // Свіжий запис: пачка могла з'явитися вже в цій шторці (гільзи, додані з правки)
    const cur = freshMovement(m);
    const batch = cur.batch ? state.movements.filter((x) => x.batch === cur.batch) : [cur];
    close();
    confirmSheet(t('Удалить запись?'), batch.length > 1 ? t('Вместе со связанными движениями ({n}).', { n: batch.length }) : t('Остатки и настрел пересчитаются.'), t('Удалить'), async () => {
      await db.write({ movements: { del: batch.map((x) => x.id) } });
      await refresh();
      confirmed();
      setUndo(t('Запись удалена'), async () => { await db.write({ movements: { put: batch } }); await refresh(); });
    });
  }, 'danger');
  const close = sheet(t(M.KINDS[m.kind]), body(), { live: body, tools: [pencil, del] });
}

/** Усе про рух і вся його правка в одному місці: кожне поле зберігається на зміну. */
function movementBody(m, close, edit = false) {
  const batch = m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
  const w = findWeapon(m.weaponId);
  const save = (fields) => saveEntity('movements', { ...freshMovement(m), ...fields });
  const input = (attrs, onSave) => h('input', {
    class: 'inline-select', autocomplete: 'off', ...attrs,
    onchange: (e) => onSave(e.target.value.trim()),
  });
  // Пачку зі списанням компонентів звичайним полем кількості не правлять: спорядження перераховується
  // окремо (resizeReload), а зібрані гільзи — окремий рух у пачці стрільби, кількість і стрільби, і збору правиться.
  const linked = batch.filter((x) => x.id !== m.id);
  const editQty = m.kind !== 'clean' && (m.kind === 'collect' || linked.every((x) => x.kind === 'collect'));
  const editPrice = m.kind === 'buy' || Number(m.price) > 0;
  const dateInput = input({ type: 'date', value: m.date ?? M.today(), 'aria-label': t('Дата') }, (v) => save({ date: v || m.date }));
  const timeInput = input({ type: 'time', value: m.time ?? '', 'aria-label': t('Время') }, (v) => save({ time: v || undefined }));
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
  // Набій у покупці й перерахунку можна змінити; спорядження прив'язане до рецепта й списаних компонентів
  const swapCartridge = Boolean(m.cartridgeId) && (m.kind === 'buy' || m.kind === 'adjust') && !linked.length;
  const kv = (...pairs) => h('dl', { class: 'kv' }, pairs);
  const row = (label, value) => [h('dt', {}, t(label)), h('dd', {}, value)];
  // Головне значення блоку — без підпису: заголовок блоку вже каже, що це
  const lead = (value, ...pairs) => [h('div', { class: 'kv-lead' }, value), pairs.some(Boolean) ? kv(...pairs) : null];
  if (m.kind === 'buy' || m.kind === 'reload') return stockMoveBody(m, { edit, linked, editQty, editPrice, swapCartridge, dateInput, qtyInput, priceInput, noteInput, kv, row, lead });
  if (m.kind === 'shot') {
    const n = Math.abs(m.qty);
    const ammo = findCartridge(m.cartridgeId);
    // Стрільба з результату вправи — як у журналі, назва вправи жирним
    const score = state.scores.find((x) => x.movementId === m.id);
    // Гільзи, не вписані під час запису, додаються з правки — так само окремим рухом у пачці стрільби
    const caseTo = edit && !linked.some((x) => x.kind === 'collect') ? cartridgeCaseTarget(ammo) : null;
    const collectRow = caseTo ? [h('dt', {}, t('Собранные гильзы')), h('dd', {},
      h('input', {
        class: 'inline-select', type: 'number', min: 0, step: 1, inputmode: 'numeric', autocomplete: 'off',
        placeholder: t('если собирал'), 'aria-label': t('Собрал гильз → «{name}»', { name: caseTo.name }),
        onchange: (e) => {
          const qty = Math.round(Number(e.target.value.replace(',', '.')));
          if (qty > 0) addCollected(freshMovement(m), { component: caseTo, qty });
        },
      }),
      h('div', { class: 'muted small' }, `→ «${caseTo.name}»`))] : null;
    return h('div', {},
      edit ? null : h('div', { class: 'stats even' },
        stat(t('выстрелов'), fmt.num(n), 'accent'),
        shotCost ? stat(t('стоимость'), tileMoney(shotCost)) : null,
        shotCost && n ? stat(t('за выстрел'), tileMoney(shotCost / n)) : null),
      box(t('Запись'), kv(
        row('Дата', edit ? dateInput : targetWhen(m)),
        edit ? row('Время', timeInput) : null,
        // Тап — картка результату вправи поверх картки стрільби
        score ? row('Упражнение', h('button', { type: 'button', class: 'link-btn', onclick: () => openScore(score, exerciseCtx()) },
          h('b', {}, exerciseName(score.exercise) ?? '—'), ` · ${fmt.num(score.score)}`)) : null,
        edit ? row('Количество', editQty ? qtyInput : fmt.num(n)) : null,
        edit && editPrice ? row('Стоимость', priceInput) : null,
        edit || m.note ? row('Примечание', edit ? noteInput : m.note) : null)),
      box(t('Оружие'), lead(
        edit ? shotWeaponSelect(m) : (w?.name ?? (m.foreignWeapon ? t('Чужое оружие') : '—')),
        m.foreignWeapon ? row('Какое', edit
          ? [input({ type: 'text', value: m.foreignWeaponName ?? '', list: 'foreign-list', placeholder: t('АКМ'), 'aria-label': t('Какое оружие') },
            (v) => save({ foreignWeaponName: v || undefined })), foreignList()]
          : (m.foreignWeaponName || '—')) : null,
        w?.scopes?.length ? row('Прицел', edit ? shotScopeSelect(m) : (w.scopes.find((sc) => sc.id === m.scopeId)?.name ?? '—')) : null)),
      box(t('Патроны'), h('div', {},
        lead(
          edit ? shotCartridgeSelect(m)
            : ammo ? h('span', { class: 'ammo-name' }, cartridgeIcon(ammo.caliber), ammo.name)
              : (m.foreignAmmo ? t('Чужие патроны') : t('без списания из БК')),
          m.caliber ? row('Калибр', m.caliber) : null,
          collectRow),
        m.cartridgeId ? null : h('p', { class: 'muted small' }, m.foreignAmmo
          ? t('Чужие патроны: склад БК не меняется, выстрелы идут в настрел.')
          : t('Запись без списания из БК — учитывается только в настреле.')))),
      shotTargets(m, close),
      linked.length ? box(t('Собранные гильзы'), h('div', { class: 'rows' }, linked.map((x) => logRow(x)))) : null);
  }
  return h('div', {},
    h('dl', { class: 'kv' },
      h('dt', {}, t('Дата')), h('dd', {}, edit ? dateInput : fmt.date(m.date)),
      [h('dt', {}, t('Позиция')), h('dd', {}, edit && swapCartridge ? movementCartridgeSelect(m) : movementTitle(m))],
      m.caliber ? [h('dt', {}, t('Калибр')), h('dd', {}, m.caliber)] : null,
      m.kind === 'clean' ? null : [h('dt', {}, t('Количество')), h('dd', {}, edit && editQty ? qtyInput : fmt.signed(m.qty))],
      w && m.kind !== 'clean' ? [h('dt', {}, t('Оружие')), h('dd', {}, w.name)] : null,
      editPrice ? [h('dt', {}, t('Сумма')), h('dd', {}, edit ? priceInput : (m.price ? fmt.money(m.price) : '—'))] : null,
      buyUnitPrice(m) ? [h('dt', {}, t('Цена за шт')), h('dd', {}, fmt.money(buyUnitPrice(m)))] : null,
      ...(edit || m.note ? [h('dt', {}, t('Примечание')), h('dd', {}, edit ? noteInput : m.note)] : [])),
    linked.length ? box(m.kind === 'collect' ? t('Стрельба') : t('Списано компонентов'),
      h('div', { class: 'rows' }, linked.map((x) => logRow(x)))) : null);
}

/**
 * Картка покупки й спорядження: плитки «скільки · сума · за одиницю», блоки Запис і Набої / Компонент;
 * назва й рецепт — посилання на їхні картки, внизу — списані на спорядження компоненти.
 */
function stockMoveBody(m, { edit, linked, editQty, editPrice, swapCartridge, dateInput, qtyInput, priceInput, noteInput, kv, row, lead }) {
  const ammo = findCartridge(m.cartridgeId);
  const part = ammo ? null : findComponent(m.componentId);
  const recipe = m.kind === 'reload' ? findRecipe(m.recipeId) : null;
  const unit = part?.unit || t('шт');
  const n = Math.abs(m.qty);
  const price = Number(m.price) > 0 ? Number(m.price) : null;
  const stock = ammo ? M.cartridgeStock(state, ammo.id) : part ? M.componentStock(state, part.id) : null;
  const name = ammo ? h('span', { class: 'ammo-name' }, cartridgeIcon(ammo.caliber), ammo.name) : (part?.name ?? movementTitle(m));
  const open = ammo ? () => cartridgeDetail(ammo) : part ? () => componentDetail(part) : null;
  const link = (label, onclick) => h('button', { type: 'button', class: 'link-btn', onclick }, label);
  // Кількість спорядження правиться разом зі списаними компонентами й собівартістю
  const reloadQty = edit && m.kind === 'reload' ? h('input', {
    class: 'inline-select', type: 'number', step: 1, min: 1, inputmode: 'numeric', autocomplete: 'off', value: n, 'aria-label': t('Количество'),
    onchange: (e) => {
      const qty = Math.round(Number(e.target.value.replace(',', '.')));
      if (!(qty > 0) || qty === n) { e.target.value = n; return; }
      resizeReload(m, linked, qty);
    },
  }) : null;
  return h('div', {},
    edit ? null : h('div', { class: 'stats even' },
      stat(t(m.kind === 'buy' ? 'куплено' : 'снаряжено'), h('span', { class: 'nw' }, fmt.num(n), h('small', { class: 'unit' }, ` ${unit}`)), 'accent'),
      price ? stat(t(m.kind === 'buy' ? 'стоимость' : 'себестоимость'), tileMoney(price)) : null,
      price && n ? stat(t('за {unit}', { unit }), tileMoney(price / n)) : null),
    box(t('Запись'), kv(
      row('Дата', edit ? dateInput : fmt.date(m.date)),
      edit ? row('Количество', reloadQty ?? (editQty ? qtyInput : fmt.num(n))) : null,
      edit && editPrice ? row('Сумма', priceInput) : null,
      edit || m.note ? row('Примечание', edit ? noteInput : m.note) : null)),
    box(t(part ? 'Компонент' : 'Патроны'), lead(
      edit && swapCartridge ? movementCartridgeSelect(m) : open ? link(name, open) : name,
      m.caliber ? row('Калибр', m.caliber) : null,
      recipe ? row('Рецепт', link(recipe.name, () => recipeDetail(recipe))) : null,
      stock === null ? null : row('Сейчас на складе', `${fmt.num(stock)} ${unit}`))),
    linked.length ? box(t('Списано компонентов'), h('div', { class: 'rows' }, linked.map((x) => logRow(x)))) : null);
}

/**
 * Нова кількість спорядження: списані компоненти й собівартість — у тій самій пропорції, однією правкою.
 * Пропорція, а не рецепт заново: рецепт могли змінити після спорядження, а списано було за старим.
 */
async function resizeReload(m, linked, qty) {
  const k = qty / Math.abs(m.qty);
  const before = [m, ...linked];
  const after = [
    { ...m, qty, price: Number(m.price) > 0 ? +(m.price * k).toFixed(2) : m.price },
    ...linked.map((x) => (x.kind === 'consume' ? { ...x, qty: -+(Math.abs(x.qty) * k).toFixed(3) } : x)),
  ];
  await db.write({ movements: { put: after } });
  await refresh();
  confirmed([m.id, m.cartridgeId]);
  if (linked.some((x) => x.componentId && M.componentStock(state, x.componentId) < 0)) toast(t('Компоненты ушли в минус'));
  setUndo(t('Снаряжено {n} · {name}', { n: qty, name: findCartridge(m.cartridgeId)?.name ?? '' }), async () => {
    await db.write({ movements: { put: before } });
    await refresh();
  });
}

/** Настріл по місяцях: скільки стріляв і на скільки — видно сезонність і темп. */
// Графік настрілу за вибраним періодом журналу: заголовок, підпис стовпчика й «за N …»
const PERIOD_CHART = {
  day: { title: 'Настрел по дням', span: 'за {n} дн.', label: (key) => fmt.date(key).slice(0, 5) },
  week: { title: 'Настрел по неделям', span: 'за {n} нед.', label: (key) => fmt.date(key).slice(0, 5) },
  month: {
    title: 'Настрел по месяцам', span: 'за {n} мес.',
    label: (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(locale(), { month: 'short' }),
  },
  year: { title: 'Настрел по годам', span: 'за {n} г.', label: (key) => key },
};

function periodChartBox(list = state.movements) {
  let period = logPeriod;
  let rows = M.shotsByPeriod(state, (date) => periodOf(date, period).key, 12, list);
  // Один рік — один стовпчик нічого не показує: тоді за місяцями, як було до вибору періоду
  if (rows.length < 2 && period === 'year') {
    period = 'month';
    rows = M.shotsByPeriod(state, (date) => periodOf(date, period).key, 12, list);
  }
  if (rows.length < 2) return null;
  const chart = PERIOD_CHART[period];
  const total = rows.reduce((sum, r) => sum + r.shots, 0);
  const cost = rows.reduce((sum, r) => sum + r.cost, 0);
  return box(t(chart.title), h('div', {},
    barChart(rows.map((r) => ({ label: chart.label(r.key), value: r.shots })), { format: (v) => fmt.num(v) }),
    h('p', { class: 'muted small' }, [t(chart.span, { n: rows.length }), t('{n} выстр.', { n: fmt.num(total) }),
      cost ? fmt.money(cost) : null].filter(Boolean).join(' · '))), { fold: 'period-chart' });
}

let logWeapon = '';

const PERIODS = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']];
const PERIOD_KEY = 'shooters-log:log-period-v2';
let logPeriod = PERIODS.some(([k]) => k === recall(PERIOD_KEY)) ? recall(PERIOD_KEY) : 'year';

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ключ періоду (сортується як рядок) і підпис. Тиждень — з понеділка. */
function periodOf(date, period = logPeriod) {
  if (!date) return { key: '', label: t('без даты') };
  const [y, m, d] = date.split('-').map(Number);
  if (period === 'year') return { key: String(y), label: String(y) };
  if (period === 'month') {
    const label = new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
    return { key: date.slice(0, 7), label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  if (period === 'week') {
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
    const [amount, money] = groupSummary(g.rows) ?? [];
    return fold(`log:${logPeriod}:${g.key}`,
      // Дві строки з кожного боку: великий настріл і сума не вміщаються в один рядок на телефоні.
      [h('span', { class: 'fold-stack' }, h('span', { class: 'fold-title' }, g.label), h('span', { class: 'fold-meta' }, t('записей: {n}', { n: g.rows.length }))),
        amount || money ? h('span', { class: 'fold-sum stack' }, amount, money ? h('span', { class: 'fold-cost' }, fmt.money(money)) : null) : null],
      h('div', { class: 'rows' }, g.rows.map((m) => logRow(m, { day: logPeriod !== 'day' }))));
  });
}

/**
 * Підсумок групи журналу: настріл і його вартість, а без стрільби — покупки, спорядження чи перерахунок.
 * Кількість — лише набоїв і словом «набоїв», не «шт»: компоненти в різних одиницях (порох у грамах), їх
 * не додаємо, а «100 шт» поруч із «+500 шт» куль читалося як усе куплене.
 */
function groupSummary(rows) {
  const shots = -M.sumBy(rows, (m) => m.kind === 'shot');
  if (shots) return [t('{n} выстр.', { n: fmt.num(shots) }), M.shotsCost(state, rows)];
  for (const kind of ['buy', 'reload', 'adjust']) {
    const list = rows.filter((m) => m.kind === kind);
    if (!list.length) continue;
    const pieces = M.sumBy(list, (m) => Boolean(m.cartridgeId));
    const money = kind === 'adjust' ? 0 : list.reduce((sum, m) => sum + (Number(m.price) || 0), 0);
    const word = plural(pieces, [t('патрон'), t('патрона'), t('патронов')]);
    return [pieces ? `${kind === 'adjust' ? fmt.signed(pieces) : fmt.num(pieces)} ${word}` : null, money];
  }
  return null;
}

/** Загальний настріл: усі калібри й стволи разом, з настрілом до початку обліку. */
/**
 * Підсумок настрілу: число, звання й скільки до наступного; праворуч лички в кільці прогресу.
 * З чого складається (split — пари [число, підпис]) — під «i», щоб не займати рядок.
 */
function shotsHero(total, split) {
  const level = shotLevel(total);
  const legend = h('div', { class: 'lv-wide' }, hintLegend(t('Из чего складывается'), split));
  return h('section', { class: 'hero lv' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('Общий настрел'), hintButton(legend, 'shots')),
      h('div', { class: 'hero-value' }, fmt.num(total)),
      h('div', { class: 'lv-sub' }, h('b', { class: 'rank-name' }, t(level.name)), ' · ',
        level.next ? t('ещё {n} до «{rank}»', { n: fmt.num(level.left), rank: t(level.next.name) }) : t('высшее звание'))),
    rankRing(level),
    legend);
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
    hasInitial ? h('p', { class: 'muted small shots-note' }, t('Только записи журнала. Настрел до начала учёта виден на вкладке «Оружие».')) : null),
  { fold: 'shots', count: totals.length });
}

function renderLog() {
  const filters = [['all', t('Все')], ['shot', t('Стрельба')], ['buy', t('Покупки')], ['reload', t('Снаряжение')], ['adjust', t('Корректировки')], ['clean', t('Чистка')]];
  const guns = state.weapons.filter((w) => !w.archived || state.movements.some((m) => m.weaponId === w.id)).sort(byName);
  if (logWeapon && !findWeapon(logWeapon)) logWeapon = '';
  const list = state.movements
    .filter((m) => m.kind !== 'consume' && m.kind !== 'collect' && (logFilter === 'all' || m.kind === logFilter) && (!logWeapon || m.weaponId === logWeapon))
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
  const csv = toolBtn('share', t('Экспорт в CSV'), () => exportCsv(list));
  return h('div', {},
    logWeapon
      ? hero(findWeapon(logWeapon).name, fmt.num(M.weaponShots(state, findWeapon(logWeapon))), t('настрел всего, вместе с настрелом до начала учёта'))
      : shotsPanel(),
    // Як і блоки над ним — залежить лише від вибраної зброї, не від типу записів
    periodChartBox(logWeapon ? state.movements.filter((m) => m.weaponId === logWeapon) : state.movements),
    h('div', { class: 'log-controls' }, period, h('div', { class: 'log-selects' }, typeSelect, gunSelect, csv)),
    list.length
      ? logGroups(list)
      : empty(t('Записей нет'), t('Свайпните патрон в разделе БК, чтобы купить или списать.')));
}

// ---------- кучність ----------

// Фото мішені більше за фото зброї: на 2400 px пробоїна .223 на 100 м — це ще 20+ пікселів.
const TARGET_PHOTO = 2400;

// Купчастість за замовчуванням у MOA: кутова міра не залежить від дистанції, її й називають уголос.
let targetUnit = UNITS.some(([k]) => k === recall('shooters-log:target-unit-v2')) ? recall('shooters-log:target-unit-v2') : 'moa';
let targetWeapon = '';

const targetPhoto = (tg) => state.photos.find((p) => p.id === tg.photoId);

function targetTitle(tg) {
  return [findWeapon(tg.weaponId)?.name, findCartridge(tg.cartridgeId)?.name].filter(Boolean).join(' · ') || t('Мишень');
}

/** Дата запису (мішені, стрільби), з часом, якщо вказано: «17.10.2026 14:40». */
function targetWhen(tg) {
  return [fmt.date(tg.date), tg.time].filter(Boolean).join(' ');
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
/** Найкраща купчастість — другим числом у правій колонці плитки. */
function precisionBadge(w) {
  const best = bestSpread(state.targets.filter((x) => x.weaponId === w.id));
  if (!best) return null;
  const main = best.distance > 0 ? length(best.spread, 'moa', best.distance) : length(best.spread, 'cm');
  return h('div', { class: 'big small-big', title: t('размах') }, bigIco(GROUP_ICO), main, h('span', { class: 'sr' }, t('размах')));
}

// Купка пробоїн у колі — значок розкиду поруч із числом.
const GROUP_ICO = '<circle cx="12" cy="12" r="8.5"/><circle cx="10" cy="10" r="1.4"/><circle cx="14.5" cy="11" r="1.4"/><circle cx="11" cy="14.5" r="1.4"/>';

/** Значок перед великим числом картки: підпис замінює, текст лишається для читалки екрана. */
function bigIco(svg) {
  const el = h('span', { class: 'big-ico', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`;
  return el;
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
    remember('shooters-log:target-unit-v2', v);
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
      remember('shooters-log:range-seg', rangeSeg);
      location.hash = '#targets';
    },
  }, kindIcon('shot'),
  h('span', { class: 'tg-tile-value' }, value),
  h('span', { class: 'tg-tile-label' }, t('Кучность')));
}

/** Як змінюється купчастість ствола від виїзду до виїзду: середній радіус, зведений до 100 м. */
function precisionChart(w) {
  const series = M.precisionSeries(state.targets, state.photos, w.id);
  if (series.length < 2) return null;
  // Шкала — одразу в одиницях показу, щоб поділки були круглими в MOA чи см, а не в мм. Менший радіус — краще.
  const angular = targetUnit !== 'cm';
  const shown = (mm) => (angular ? M.toAngle(mm, 100, targetUnit) : mm / 10);
  const unit = angular ? (targetUnit === 'moa' ? 'MOA' : 'MRAD') : t('см');
  return box(t('Купчастость со временем'), lineChart(series.map((x) => ({ label: fmt.date(x.date), value: shown(x.value) })), {
    up: false,
    format: (v) => `${num(v, angular ? 2 : 1)} ${unit}`,
  }), { fold: `pchart:${w.id}` });
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
  // Пояснення цифр — за кнопкою «i», як у мішені
  const legend = hintLegend(t('Что значат цифры'), [
    [t('Число справа — средний радиус'), t('Среднее расстояние пробоин от центра группы: меньше — кучнее. От числа выстрелов почти не зависит, поэтому по нему сравнивают патроны.')],
    [t('Полоска'), t('Средний радиус относительно худшего патрона в списке.')],
    [t('Как считается'), t('Учтены группы от {n} выстрелов; мишени на разных дистанциях приведены к 100 м.', { n: M.PRECISION_MIN_HOLES })],
    [t('мало данных'), t('Меньше {n} групп — сравнение пока случайное.', { n: FEW_GROUPS })],
  ]);
  return box(t('Патроны по кучности'), [legend, h('div', { class: 'rows' }, list)],
    { tools: hintButton(legend, 'precision'), ...(fold ? { fold: `precision:${w.id}`, count: rows.length } : {}) });
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
  const sub = [targetWhen(tg), tg.distance ? t('{n} м', { n: fmt.num(tg.distance) }) : null,
    holes ? t('{n} выстр.', { n: holes }) : t('не размечена'), tg.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row tg-row', 'data-id': tg.id, onclick: () => { beforeOpen?.(); targetDetail(tg); } },
    targetThumb(tg),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, targetTitle(tg)), h('span', { class: 'muted small' }, sub)),
    best ? h('span', { class: 'tg-best col' }, length(best.stats.spread, targetUnit, tg.distance),
      h('small', { class: 'muted' }, t('розкид'))) : null);
}

// ---------- полігон: розділи ----------

const RANGE_SEGS = [['exercises', 'Упражнения'], ['targets', 'Мишени'], ['chrono', 'Скорости'], ['timer', 'Таймер']];
let rangeSeg = RANGE_SEGS.some(([k]) => k === recall('shooters-log:range-seg')) ? recall('shooters-log:range-seg') : 'exercises';

/** Вкладка «Полігон»: перемикач розділів, розділ запам'ятовується. */
function renderRange() {
  const seg = chips(RANGE_SEGS.map(([k, label]) => [k, t(label)]), rangeSeg, (v) => {
    rangeSeg = v;
    remember('shooters-log:range-seg', v);
    render();
  });
  seg.classList.add('segmented', 'tab-seg');
  const panels = { timer: renderTimer, exercises: renderExercises, chrono: renderChrono };
  return h('div', {}, seg, rangeSeg === 'exercises' ? guideLink() : null, (panels[rangeSeg] ?? renderTargets)());
}

function renderExercises() {
  $('subtitle').textContent = t('результатов: {n}', { n: state.scores.length });
  return exercisesPanel(exerciseCtx());
}

/** Що панель і картка результату беруть із застосунку: стволи, набої, збереження, мішені. */
function exerciseCtx() {
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  const cartridges = state.cartridges.filter((c) => !c.archived)
    .sort((a, b) => collate(a.caliber, b.caliber) || collate(a.name, b.name))
    .map((c) => [c.id, `${c.name} · ${c.caliber}`, M.cartridgeStock(state, c.id)]);
  return {
    scores: state.scores, weapons, cartridges, drills: state.drills, box, stat,
    lastAmmo: (weaponId) => M.lastAmmo(state, weaponId),
    pickAmmo: (select) => ammoPicker(select),
    collectField,
    // Свої вправи лежать у базі поряд з рештою — отже, їдуть і в копію, і на Диск.
    custom: state.exercises,
    onSaveExercise: (rec) => saveEntity('exercises', { id: db.uid(), created: Date.now(), ...rec }),
    onDeleteExercise: (rec) => {
      if (!rec) return;
      const used = state.scores.filter((s) => s.exercise === rec.id).length;
      confirmSheet(t('Удалить упражнение?'),
        used ? t('Результатов: {n}. Они останутся в истории, но без названия упражнения.', { n: used }) : rec.name,
        t('Удалить'), async () => {
          await db.write({ exercises: { del: [rec.id] } });
          await refresh();
          confirmed();
        });
    },
    openTimer: timerSheet,
    mismatch: (cartridgeId, weaponId) => caliberMismatch(findCartridge(cartridgeId), findWeapon(weaponId)),
    // Списували набої — мішені на записі стрільби, як у звичайної стрільби; ні (чужі набої, «не списувати») — на самому результаті.
    targetsOf: (r) => {
      const m = state.movements.find((x) => x.id === r.movementId);
      return m ? shotTargets(m, () => {}) : scoreTargets(r, () => {});
    },
    onSave: async (r, consume) => {
      const score = { id: db.uid(), created: Date.now(), ...r };
      if (!consume) { await saveEntity('scores', score); return; }
      const c = findCartridge(consume.cartridgeId);
      const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
      // Вартість фіксуємо на момент списання — як у звичайній стрільбі.
      const m = movement({
        kind: 'shot', cartridgeId: c.id, caliber: c.caliber, qty: -consume.qty, date: r.date,
        time: r.date === M.today() ? nowHm() : undefined,
        weaponId: r.weaponId || null, scopeId: M.defaultScope(findWeapon(r.weaponId))?.id ?? null,
        price: unit ? +(unit * consume.qty).toFixed(2) : null, note: consume.note,
      });
      score.movementId = m.id;
      await addShot(m, consume.collect, t('Результат сохранён · −{n}', { n: fmt.num(consume.qty) }), { scores: { put: [score] } });
    },
    onDelete: async (r) => {
      await db.write({ scores: { del: [r.id] } });
      await refresh();
      confirmed();
    },
  };
}

/** Таймер прямо з результату вправи: серія зберігається як завжди, а її час іде в поле. */
function timerSheet(onDone) {
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  const close = sheet(t('Таймер'), timerPanel({
    weapons,
    onSave: async (drill) => {
      await saveEntity('drills', { id: db.uid(), created: Date.now(), ...drill });
      close();
      onDone(drill.shots.reduce((s, x) => s + x, 0));
    },
  }), { onClose: stopTimerPanel });
}

function renderTimer() {
  $('subtitle').textContent = t('серий: {n}', { n: state.drills.length });
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  return h('div', {},
    timerPanel({ weapons, onSave: (drill) => saveEntity('drills', { id: db.uid(), created: Date.now(), ...drill }) }),
    drillsBox());
}

/** Збережені серії: новіші зверху, підсумок рядком. */
function drillsBox() {
  const list = [...state.drills].sort(M.byDateDesc);
  if (!list.length) return null;
  return box(t('Серии'), h('div', { class: 'rows' }, list.map((d) => {
    const s = M.drillStats(d.shots);
    const sub = [fmt.date(d.date), findWeapon(d.weaponId)?.name, d.note].filter(Boolean).join(' · ');
    return h('button', { type: 'button', class: 'row', 'data-id': d.id, onclick: () => drillDetail(d) },
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
    confirmed();
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

// ---------- полігон: швидкості (хронограф) ----------

// Швидкість як вписали: 812 — без «,0», 812,5 — з десятими
const speedText = (v) => fmt.num(Math.round(v * 10) / 10);

const chronoWeapon = (c) => findWeapon(c.weaponId)?.name ?? (c.weaponId ? t('(удалено)') : t('Без оружия'));

function renderChrono() {
  const list = [...state.chrono].sort(M.byDateDesc);
  $('subtitle').textContent = t('серий: {n}', { n: list.length });
  // Групи за набоєм: швидкість — властивість набою (і ствола); серії без набою — в кінці
  const groups = groupBy(list, (x) => x.cartridgeId || '')
    .map(([id, items]) => ({ id, items, name: id ? (findCartridge(id)?.name ?? t('(удалено)')) : t('Без патрона') }))
    .sort((a, b) => Number(!a.id) - Number(!b.id) || collate(a.name, b.name));
  return h('div', {},
    list.length
      ? groups.map((g) => fold(`chrono:${g.id}`,
        [h('span', { class: 'fold-title' }, g.name), h('span', { class: 'fold-meta' }, t('серий: {n}', { n: g.items.length }))],
        h('div', { class: 'rows' }, g.items.map((c) => chronoRow(c)))))
      : empty(t('Скоростей пока нет'), t('Отстреляли серию через хронограф — нажмите «+» и впишите скорость каждого выстрела: приложение посчитает среднюю, ES и SD.')),
    h('p', { class: 'muted small' }, t('ES — разница самого быстрого и самого медленного выстрела. SD — насколько скорость гуляет от выстрела к выстрелу: чем меньше, тем меньше вертикальный разброс на дальних дистанциях.')));
}

function chronoRow(c) {
  const s = M.chronoStats(c.speeds);
  const sub = [fmt.date(c.date), t('{n} выстр.', { n: s.n }), c.temp != null ? `${fmt.num(c.temp)} °C` : null, c.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row', 'data-id': c.id, onclick: () => chronoDetail(c) },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, chronoWeapon(c)), h('span', { class: 'muted small' }, sub)),
    s.n ? h('span', { class: 'tg-best col' }, `${fmt.num(Math.round(s.avg))} ${t('м/с')}`,
      h('small', { class: 'muted' }, s.sd === null ? '' : `SD ${num(s.sd, 1)}`)) : null);
}

/** Панель підказки «i»: заголовок і пункти [назва, пояснення]. */
function hintLegend(title, items) {
  return h('div', { class: 'ex-scoring tg-legend' },
    h('div', { class: 'ex-scoring-title' }, title),
    h('ul', { class: 'hint-legend' }, items.map(([lead, text]) => h('li', {}, h('b', {}, lead), h('div', { class: 'muted small' }, text)))));
}

/** Що означають середня, ES і SD і які значення вважати добрими. */
function chronoLegend() {
  return hintLegend(t('Что значат цифры'), [
    [t('Средняя'), t('Её вписывают в баллистический калькулятор — от неё считаются поправки в таблице DOPE.')],
    [t('ES — размах скоростей'), t('Разница самого быстрого и самого медленного выстрела. Зависит от одного выпавшего выстрела и растёт с длиной серии.')],
    [t('SD — стандартное отклонение'), t('Насколько обычно скорость отходит от средней. Устойчивее ES, поэтому по нему сравнивают партии и навески. Ориентир: до 3 м/с — отлично, 3–5 — хорошо, больше 8 — на 500 м и дальше группа заметно растягивается по вертикали.')],
    [t('Сколько выстрелов'), t('На 3–5 выстрелах SD случаен; надёжнее серия от 10.')],
  ]);
}

/** Плитки серії з кнопкою «i» праворуч і підказкою під ними. */
function chronoTiles(tiles) {
  const legend = chronoLegend();
  return [h('div', { class: 'chrono-head' }, tiles, hintButton(legend, 'chrono')), legend];
}

/** Картка серії: середня, SD і ES плитками, умови, постріли з відхиленням від середньої. */
function chronoDetail(c0) {
  const current = () => state.chrono.find((x) => x.id === c0.id);
  const body = () => {
    const c = current();
    if (!c) return null;
    const s = M.chronoStats(c.speeds);
    const ammo = findCartridge(c.cartridgeId);
    const row = (label, value) => [h('dt', {}, t(label)), h('dd', {}, value)];
    return h('div', {},
      chronoTiles(h('div', { class: 'stats even' },
        stat(t('средняя, м/с'), num(s.avg ?? 0, 1), 'accent'),
        stat('SD', s.sd === null ? '—' : num(s.sd, 1)),
        stat('ES', speedText(s.es ?? 0)))),
      box(t('Серия'), h('dl', { class: 'kv' },
        row('Дата', targetWhen(c)),
        row('Оружие', chronoWeapon(c)),
        row('Патрон', ammo ? h('span', { class: 'ammo-name' }, cartridgeIcon(ammo.caliber), ammo.name) : (c.cartridgeId ? t('(удалено)') : '—')),
        s.n > 1 ? row('Мин / макс', `${speedText(s.min)} / ${speedText(s.max)} ${t('м/с')}`) : null,
        c.temp != null ? row('Температура', `${fmt.num(c.temp)} °C`) : null,
        c.gps ? row('Координаты', h('span', { class: 'kv-gps' }, `${c.gps.lat.toFixed(5)}, ${c.gps.lon.toFixed(5)}`,
          toolBtn('map', t('Открыть на карте'), () => openMap(c.gps), 'small'))) : null,
        c.note ? row('Примечание', c.note) : null)),
      box(t('Выстрелы'), h('div', { class: 'tm-shots' }, c.speeds.map((v, i) => h('div', { class: 'tm-shot' },
        h('span', { class: 'tm-n' }, String(i + 1)),
        h('span', { class: 'tm-at' }, speedText(v)),
        h('span', { class: 'tm-split muted' }, s.n > 1 ? `${v >= s.avg ? '+' : '−'}${num(Math.abs(v - s.avg), 1)}` : ''))))));
  };
  const remove = () => confirmSheet(t('Удалить серию?'), `${fmt.date(c0.date)} · ${chronoWeapon(c0)}`, t('Удалить'), async () => {
    close();
    await db.write({ chrono: { del: [c0.id] } });
    await refresh();
    confirmed();
  });
  const close = sheet(t('Скорости'), body(), { live: body, tools: cardTools(() => chronoForm(current() ?? c0), false, remove) });
}

/** Нова або змінена серія: ствол, набій, умови й швидкості — по одній (Enter чи «+») або списком. */
function chronoForm(c = null) {
  const last = [...state.chrono].sort(M.byDateDesc)[0];
  const gunId = [c?.weaponId, c ? null : last?.weaponId].find((id) => id && findWeapon(id)) ?? '';
  const guns = state.weapons.filter((w) => !w.archived || w.id === gunId).sort(byName);
  const ammoId = [c?.cartridgeId, !c && gunId ? recall(`ammo:${gunId}`) : null].find((id) => id && findCartridge(id)) ?? '';
  const ammo = (id) => [['', t('— не указывать —')],
    ...caliberOptions(state.cartridges.filter((x) => !x.archived || x.id === ammoId), findWeapon(id)?.caliber).options];
  const f = form([
    { name: 'weaponId', label: t('Оружие'), type: 'select', value: gunId, options: [['', t('— не указывать —')], ...guns.map((w) => [w.id, w.name])] },
    { name: 'cartridgeId', label: t('Патроны'), type: 'select', value: ammoId, options: ammo(gunId) },
    { name: 'date', label: t('Дата'), type: 'date', half: true, value: c?.date ?? M.today() },
    { name: 'time', label: t('Время'), type: 'time', half: true, value: c ? c.time ?? '' : nowHm() },
    { name: 'note', label: t('Примечание'), placeholder: t('Хронограф, партия, навеска…'), value: c?.note ?? '', wide: true },
    { name: 'temp', label: t('Температура, °C'), type: 'number', step: 'any', half: true, value: c?.temp ?? '' },
  ]);
  // Погода — як у мішені: значок геолокації ставить температуру на місці й на час серії
  const gps = gpsEditor(c?.gps);
  const weatherInfo = h('small', { class: 'muted tg-weather-note' });
  const weatherBtn = toolBtn('locate', t('Подтянуть погоду'), async () => {
    const w = await pullWeather({ date: f.inputs.date, time: f.inputs.time, gps, button: weatherBtn, info: weatherInfo });
    if (!w) return;
    f.inputs.temp.value = String(Math.round(w.temp * 10) / 10);
    weatherInfo.textContent = t('Это температура воздуха. Патроны, полежавшие на солнце или в машине, бывают теплее — и быстрее.');
  }, 'tg-pull');
  const weatherBox = box(t('Погода'), h('div', {},
    h('div', { class: 'form tg-weather chrono-weather' }, f.inputs.temp.closest('.field'), weatherBtn),
    weatherInfo, gps.el));
  const repaintAmmo = ammoPicker(f.inputs.cartridgeId, findWeapon(gunId)?.caliber);
  f.inputs.weaponId.addEventListener('change', () => {
    const keep = f.inputs.cartridgeId.value;
    f.inputs.cartridgeId.replaceChildren(...selectOptions(ammo(f.inputs.weaponId.value), keep).filter(Boolean));
    repaintAmmo();
  });
  const speeds = [...(c?.speeds ?? [])];
  const entry = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: t('например 812 или 812,5'), 'aria-label': t('Скорость, м/с') });
  const list = h('div', { class: 'chrono-list' });
  const summary = h('span', { class: 'chrono-sum small' });
  const summaryHint = chronoLegend();
  const summaryRow = h('div', { class: 'chrono-sum-row' }, summary, hintButton(summaryHint, 'chrono'));
  const draw = () => {
    list.replaceChildren(...speeds.map((v, i) => h('span', { class: 'chrono-chip' },
      h('small', { class: 'muted' }, String(i + 1)), speedText(v),
      h('button', { type: 'button', class: 'chrono-x', 'aria-label': t('Удалить'), onclick: () => { speeds.splice(i, 1); draw(); } }, '✕'))));
    const s = M.chronoStats(speeds);
    summaryRow.hidden = !s.n;
    summaryHint.hidden = !s.n || !hintOpen.chrono;
    summary.textContent = s.n ? [t('{n} выстр.', { n: s.n }), `${t('средняя')} ${num(s.avg, 1)}`,
      s.sd === null ? null : `SD ${num(s.sd, 1)}`, s.n > 1 ? `ES ${speedText(s.es)}` : null].filter(Boolean).join(' · ') : '';
  };
  // Можна вставити одразу всю серію з хронографа: «812 815 809» чи стовпчиком
  const add = () => {
    if (!entry.value.trim()) return;
    const got = M.parseSpeeds(entry.value);
    if (!got.length || got.some((v) => !(v > 0))) { fieldError(entry, t('Скорость — число, например 812 или 812,5')); return; }
    speeds.push(...got);
    entry.value = '';
    entry.closest('.sheet')?.querySelector('.form-error')?.remove();
    draw();
    entry.focus();
  };
  entry.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const plus = h('button', { type: 'button', class: 'btn primary chrono-add', 'aria-label': t('Добавить'), onclick: add }, '+');
  draw();
  const speedsField = h('div', { class: 'form' }, h('label', { class: 'field wide' },
    h('span', { class: 'field-label' }, t('Скорость каждого выстрела, м/с')),
    h('div', { class: 'chrono-entry' }, entry, plus),
    h('small', { class: 'muted' }, t('Enter или «+» после каждой; можно вставить всю серию через пробел.'))));
  const close = sheet(c ? t('Изменить серию') : t('Новая серия скоростей'), h('div', {}, f.el, weatherBox, speedsField, list, summaryRow, summaryHint), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    // Недописане в полі — теж у серію, щоб не загубити останній постріл
    if (entry.value.trim()) { add(); if (entry.value.trim()) return; }
    if (!speeds.length) { formError(t('Добавьте хотя бы одну скорость')); return; }
    const v = f.values();
    if (!v.date) { fieldError(f.inputs.date, t('Заполните поле «{label}»', { label: t('Дата') })); return; }
    if (Number.isNaN(v.temp)) { fieldError(f.inputs.temp, t('Температура — число')); return; }
    if (v.weaponId && v.cartridgeId) remember(`ammo:${v.weaponId}`, v.cartridgeId);
    close();
    await saveEntity('chrono', {
      id: c?.id ?? db.uid(), created: c?.created ?? Date.now(), date: v.date, time: v.time || null, weaponId: v.weaponId || null,
      cartridgeId: v.cartridgeId || null, temp: v.temp, gps: gps.get(), note: v.note || null, speeds,
    });
  }
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
      distance: tg.distance, unit: targetUnit, click: tg.click, scaleMm: Number(recall('shooters-log:scale-mm')) || 100,
    });
    if (marks?.scale?.mm) remember('shooters-log:scale-mm', marks.scale.mm);
    return marks;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function targetForm(tg, { photo = null, movement = null, score = null, weaponId = null } = {}) {
  const lastOf = (id) => state.targets.filter((x) => x.weaponId === id).sort(M.byDateDesc)[0];
  const gunId = [tg?.weaponId, movement?.weaponId, score?.weaponId, weaponId, recall('shooters-log:target-gun')].find((id) => id && findWeapon(id)) ?? '';
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
  const distance0 = tg?.distance ?? score?.distance ?? lastOf(gunId)?.distance ?? (Number(recall('shooters-log:target-distance')) || 100);
  // «Влучання вище» — як у останній мішені з тим самим прицілом на тій самій дистанції
  const lastZeroUp = (sid, distance) => (sid
    ? state.targets.filter((x) => x.scopeId === sid && x.distance === distance && x.zeroUp).sort(M.byDateDesc)[0]?.zeroUp ?? '' : '');
  // …а спершу — з таблиці DOPE цього прицілу (свого набою або без набою): поправка вгору = влучання нижче
  const dopeZeroUp = (wid, sid, cid, distance) => {
    const w = findWeapon(wid);
    const scope = scopeOf(wid, sid);
    if (!scope || !(distance > 0)) return null;
    const tables = (w.dope ?? []).filter((d) => d.scopeId === sid);
    const table = tables.find((d) => cid && d.cartridgeId === cid) ?? tables.find((d) => !d.cartridgeId);
    const mrad = table ? M.dopeAt(table.rows, distance, scope.zero) : null;
    return mrad === null ? null : { cm: Math.round(-mrad * distance) / 10, mrad, table };
  };
  // Нова мішень на сьогодні — зараз; на минулу дату (зі стрільби, вправи) час невідомий.
  const date0 = tg?.date ?? movement?.date ?? score?.date ?? M.today();
  const f = form([
    { name: 'weaponId', label: t('Оружие'), type: 'select', value: gunId, options: [['', t('— не указывать —')], ...guns.map((w) => [w.id, w.name])] },
    { name: 'scopeId', label: t('Прицел'), type: 'select', value: scope0?.id ?? '', options: scopeOptions(findWeapon(gunId)) },
    { name: 'click', label: t('Цена щелчка прицела'), type: 'chips', wide: true,
      options: clickChoices(tg?.click, ...guns.flatMap((w) => (w.scopes ?? []).map((s) => s.click))),
      value: tg?.click ?? scope0?.click ?? lastOf(gunId)?.click ?? 'mil0.1' },
    { name: 'cartridgeId', label: t('Патроны'), type: 'select', value: ammoId, options: ammo(gunId) },
    { name: 'distance', label: t('Дистанция, м'), type: 'number', step: 'any', min: 0, required: true, value: distance0 },
    { name: 'zeroUp', label: t('Попадание выше точки прицеливания, см'), type: 'number', step: 'any', wide: true,
      value: tg ? tg.zeroUp ?? '' : lastZeroUp(scope0?.id, distance0),
      hint: t('Если пристрелка на другую дистанцию — сколько по баллистической таблице, ниже — с минусом. Пусто — в точку прицеливания.') },
    { name: 'date', label: t('Дата'), type: 'date', half: true, value: date0 },
    { name: 'time', label: t('Время'), type: 'time', half: true, value: tg ? tg.time ?? '' : date0 === M.today() ? nowHm() : '' },
    { name: 'temp', label: t('Температура, °C'), type: 'number', step: 'any', half: true, value: tg?.temp ?? '' },
    { name: 'wind', label: t('Ветер, м/с'), type: 'number', step: 'any', min: 0, half: true, value: tg?.wind ?? '' },
    { name: 'windClock', label: t('Откуда ветер'), type: 'select', value: tg?.windClock ? String(tg.windClock) : '', options: [['', '—'], ...hours],
      hint: t('По часам относительно направления стрельбы: 12 — в лицо, 3 — справа.') },
    { name: 'note', label: t('Примечание'), placeholder: t('Положение, упор, серия…'), value: tg?.note ?? '', wide: true },
  ]);
  qtyChips(f.inputs.distance, [50, 100, 200, 300, 400, 500]);
  // Приціл пристріляний на іншу дистанцію — у точку прицілювання на цій дистанції куля не прийде.
  const zeroWarn = h('small', { class: 'warn-text' });
  f.inputs.zeroUp.after(zeroWarn);
  const scopeField = f.inputs.scopeId.closest('.field');
  scopeField.hidden = !findWeapon(gunId)?.scopes?.length;
  const selectedScope = () => scopeOf(f.inputs.weaponId.value, f.inputs.scopeId.value);
  // Своє значення «влучання вище» не перезаписуємо підказкою з минулих мішеней.
  let zeroTyped = !!tg;
  const repaintAmmo = ammoPicker(f.inputs.cartridgeId, findWeapon(gunId)?.caliber);
  const zeroSrc = h('small', { class: 'muted' });
  zeroWarn.after(zeroSrc);
  f.inputs.zeroUp.addEventListener('input', () => { zeroTyped = true; zeroSrc.textContent = ''; });
  const showZero = () => {
    const distance = Number(f.inputs.distance.value);
    const dope = dopeZeroUp(f.inputs.weaponId.value, f.inputs.scopeId.value, f.inputs.cartridgeId.value, distance);
    if (!zeroTyped) f.inputs.zeroUp.value = dope ? dope.cm || '' : lastZeroUp(selectedScope()?.id, distance);
    zeroSrc.textContent = !zeroTyped && dope?.cm
      ? t('Из таблицы DOPE: {v} на {d} м', { v: elevText(dope.mrad, selectedScope()?.click), d: fmt.num(distance) }) : '';
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
  f.inputs.scopeId.addEventListener('change', onScope);
  f.inputs.cartridgeId.addEventListener('change', showZero);
  showZero();
  f.inputs.weaponId.addEventListener('change', () => {
    const id = f.inputs.weaponId.value;
    const keep = f.inputs.cartridgeId.value;
    f.inputs.cartridgeId.replaceChildren(...selectOptions(ammo(id), keep).filter(Boolean));
      repaintAmmo();
    const w = findWeapon(id);
    f.inputs.scopeId.replaceChildren(...selectOptions(scopeOptions(w), pickScope(id)?.id ?? '').filter(Boolean));
    scopeField.hidden = !w?.scopes?.length;
    onScope();
  });
  const gps = gpsEditor(tg?.gps);
  const weatherInfo = h('small', { class: 'muted tg-weather-note' });
  const weatherBtn = toolBtn('locate', t('Подтянуть погоду'), async () => {
    const w = await pullWeather({ date: f.inputs.date, time: f.inputs.time, gps, button: weatherBtn, info: weatherInfo });
    if (w) weatherInfo.textContent = weatherNote(w);
  }, 'tg-pull');
  // Поля числові — значення з крапкою, не через fmt (там кома).
  function weatherNote(w) {
    f.inputs.temp.value = String(Math.round(w.temp * 10) / 10);
    f.inputs.wind.value = String(Math.round(w.wind * 10) / 10);
    return t('Ветер с {dir} ({deg}°), порывы до {gust} м/с — часы выберите сами.', {
      dir: compass()[Math.round(w.dir / 45) % 8], deg: Math.round(w.dir), gust: fmt.num(Math.round(w.gust ?? w.wind)),
    });
  }
  const fieldOf = (name) => f.inputs[name].closest('.field');
  const weatherBox = box(t('Погода'), h('div', {},
    h('div', { class: 'form tg-weather' }, fieldOf('temp'), fieldOf('wind'), weatherBtn, fieldOf('windClock')),
    weatherInfo, gps.el));
  const close = sheet(tg ? t('Мишень: данные') : t('Новая мишень'), h('div', {}, f.el, weatherBox), {
    actions: [btn(t('Отмена'), () => close()), btn(tg ? t('Сохранить') : t('Далее: разметка'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.distance > 0)) { fieldError(f.inputs.distance, t('Укажите дистанцию')); return; }
    const fields = {
      weaponId: v.weaponId || null, scopeId: selectedScope()?.id ?? null, cartridgeId: v.cartridgeId || null, distance: v.distance, date: v.date || null,
      click: f.inputs.click.value || null, zeroUp: Number(v.zeroUp) || null, time: v.time || null, temp: v.temp, wind: v.wind, windClock: v.windClock ? Number(v.windClock) : null, note: v.note, gps: gps.get(),
    };
    remember('shooters-log:target-distance', v.distance);
    remember('shooters-log:target-gun', fields.weaponId);
    close();
    if (tg) {
      await saveEntity('targets', { ...tg, ...fields });
      targetDetail(findTarget(tg.id) ?? tg);
      return;
    }
    // Нова мішень пишеться одним записом уже з розміткою; скасували розмітку — нічого не зберігаємо.
    const draft = { id: db.uid(), created: Date.now(), photoId: db.uid(), movementId: movement?.id ?? null, scoreId: score?.id ?? null, scale: null, poa: null, groups: [], ...fields };
    const marks = await runMarking(photo.blob, draft);
    if (!marks) { toast(t('Мишень не сохранена')); return; }
    const record = { ...draft, ...marks };
    await db.write({
      targets: { put: [record] },
      photos: { put: [{ id: draft.photoId, targetId: record.id, created: Date.now(), thumb: photo.thumb, w: photo.w, h: photo.h, driveId: null }] },
      blobs: { put: [{ id: draft.photoId, blob: photo.blob }] },
    });
    await refresh();
    confirmed([record.id]);
    targetDetail(findTarget(record.id) ?? record);
  }
}

async function editMarks(tg) {
  const blob = await db.getBlob(tg.photoId);
  if (!blob) { toast(t('Полное фото ещё не загрузилось — изменить можно после синхронизации')); return; }
  const marks = await runMarking(blob, tg);
  if (!marks) return;
  await saveEntity('targets', { ...tg, ...marks });
  targetDetail(findTarget(tg.id) ?? tg);
}

/**
 * Координати пристрою; null — геолокація недоступна або людина не дозволила.
 * Дозвіл питає сам браузер при першому запиті; увімкнути GPS застосунок не може — лише підказати.
 */
function devicePosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { toast(t('Геолокация недоступна')); resolve(null); return; }
    const why = {
      1: t('Доступ к местоположению запрещён — разрешите его этому сайту в настройках браузера'),
      2: t('Включите геолокацию (GPS) на телефоне'),
    };
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (err) => { toast(why[err.code] ?? t('Не удалось определить координаты')); resolve(null); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}

/** Рядок координат у формі: записує їх кнопка погоди, тут їх видно, можна відкрити на карті й прибрати. */
function gpsEditor(initial = null) {
  let gps = initial;
  const text = h('span', { class: 'muted small' });
  const el = h('div', { class: 'tg-gps' }, text,
    toolBtn('map', t('Открыть на карте'), () => openMap(gps), 'small'),
    toolBtn('delete', t('Убрать координаты'), () => set(null), 'small'));
  const set = (value) => {
    gps = value;
    el.hidden = !gps;
    text.textContent = gps ? `${t('Координаты')}: ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} ± ${Math.round(gps.acc)} ${t('м')}` : '';
  };
  set(gps);
  return { el, get: () => gps, set };
}

/**
 * Погода за координатами (Open-Meteo, без ключа): сьогодні в межах години — поточна, інакше — на дату й годину запису.
 * Координат ще немає — бере з пристрою. null — не вийшло (причину вже показано).
 */
async function pullWeather({ date: dateInput, time: timeInput, gps, button, info }) {
  const date = dateInput.value || M.today();
  const time = timeInput.value;
  const now = date === M.today() && (!time || Math.abs(minutesOf(time) - minutesOf(nowHm())) <= 60);
  if (!now && !time) { fieldError(timeInput, t('Укажите время — погода нужна на конкретный час')); return null; }
  button.disabled = true;
  info.textContent = t('Определяю…');
  try {
    if (!gps.get()) gps.set(await devicePosition());
    if (!gps.get()) { info.textContent = ''; return null; }
    return await weatherAt(gps.get(), now ? null : { date, time });
  } catch {
    info.textContent = '';
    toast(t('Не удалось получить погоду'));
    return null;
  } finally {
    button.disabled = false;
  }
}

/** Точка в Google Картах — на телефоні відкривається застосунок Карт. */
function openMap({ lat, lon }) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`, '_blank', 'noopener');
}

/** Звідки вітер — вісім сторін, від півночі за годинниковою стрілкою (крок 45°). */
const compass = () => [t('севера'), t('северо-востока'), t('востока'), t('юго-востока'),
  t('юга'), t('юго-запада'), t('запада'), t('северо-запада')];

/** «14:40» → 880 хвилин від півночі. */
const minutesOf = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
/** Поточний час «ГГ:ХХ». */
const nowHm = () => new Date().toTimeString().slice(0, 5);

const WEATHER_VARS = ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'];

/**
 * Погода з Open-Meteo, без ключа. at = null — зараз, інакше { date, time } — найближча година того дня
 * за місцевим часом точки. Прогнозний сервіс тримає ~3 місяці назад, старіше — архів.
 * Координати округлені до ~1 км — для погоди точніше не треба.
 */
async function weatherAt({ lat, lon }, at = null) {
  const q = { latitude: lat.toFixed(2), longitude: lon.toFixed(2), wind_speed_unit: 'ms' };
  let host = 'api.open-meteo.com/v1/forecast';
  if (at) {
    Object.assign(q, { hourly: WEATHER_VARS.join(), start_date: at.date, end_date: at.date, timezone: 'auto' });
    if (Date.now() - Date.parse(at.date) > 60 * 86_400_000) host = 'archive-api.open-meteo.com/v1/archive';
  } else {
    q.current = WEATHER_VARS.join();
  }
  const res = await fetch(`https://${host}?${new URLSearchParams(q)}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  let pick = (v) => json.current[v];
  if (at) {
    const hour = String(Math.min(23, Math.round(minutesOf(at.time) / 60))).padStart(2, '0');
    const i = json.hourly.time.indexOf(`${at.date}T${hour}:00`);
    if (i < 0 || json.hourly.temperature_2m[i] === null) throw new Error('Open-Meteo: no data');
    pick = (v) => json.hourly[v][i];
  }
  const [temp, wind, dir, gust] = WEATHER_VARS.map(pick);
  return { temp, wind, dir, gust };
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

// Ключ ціни клацання: одиниця й число — 'mil0.1', 'moa0.25', 'mm13' (мм на 100 м).
const CLICK_KEY = /^(mil|moa|mm)([\d.]+)$/;
const OWN_CLICK = 'own';

/** Своє значення ціни клацання → ключ виду 'mil0.2'; null — порожньо або не додатне число. */
function ownClickKey(value, unit) {
  const v = Number(String(value).replace(',', '.'));
  return v > 0 ? `${unit}${+v.toFixed(4)}` : null;
}

/** Підпис ціни клацання: зі списку або своє значення — «0,2 MRAD», «0,24 MOA», «10 мм / 100 м». */
function clickLabel(key) {
  const row = CLICKS.find(([k]) => k === key);
  if (row) return t(row[1]);
  const m = CLICK_KEY.exec(key ?? '');
  if (!m) return null;
  const v = String(Number(m[2])).replace('.', ',');
  return m[1] === 'mm' ? t('{v} мм / 100 м', { v }) : `${v} ${m[1] === 'moa' ? 'MOA' : 'MRAD'}`;
}

/** Чіпи ціни клацання в мішені: стандартні плюс свої значення з прицілів і самої мішені. */
function clickChoices(...keys) {
  const own = [...new Set(keys.filter((k) => k && !CLICKS.some(([c]) => c === k) && CLICK_KEY.test(k)))];
  return [...CLICKS.map(([k, label]) => [k, t(label)]), ...own.map((k) => [k, clickLabel(k)])];
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
  mpi: '<path d="M12 4 20 12 12 20 4 12z"/>',
  ring: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="1.5" stroke-dasharray="3 2.5"/>',
  find: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
};
function metricLabel(icon, text, color = null) {
  const ico = h('span', { class: 'metric-ico', 'aria-hidden': 'true' });
  ico.innerHTML = `<svg viewBox="0 0 24 24">${METRIC_ICON[icon]}</svg>`;
  if (color) ico.style.color = color;
  return h('span', { class: 'metric-label' }, ico, text);
}

/** Блок групи: плитки розміру, СТВ, потрібне влучання й поправка — у вибраних одиницях. */
function groupBox(g, tg, fold = false, onFocus = null) {
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
    s.offset ? (onFocus
      ? h('button', { type: 'button', class: 'tg-line tg-goto', 'aria-label': t('Показать группу на фото'), onclick: () => onFocus(g.index) },
        h('span', { class: 'muted' }, metricLabel('mpi', t('СТП'), COLORS[g.index % COLORS.length])),
        h('span', {}, offsetText(s.offset, targetUnit, tg.distance), metricLabel('find', '')))
      : line(metricLabel('mpi', t('СТП'), COLORS[g.index % COLORS.length]), offsetText(s.offset, targetUnit, tg.distance))) : null,
    s.offset && wantUp ? line(t('Нужное попадание'), `${wantUp > 0 ? t('выше') : t('ниже')} ${len(Math.abs(wantUp))}`) : null,
    s.offset ? fixPanel(corrections(s, { distance: tg.distance, click: tg.click, wantUp }), tg.click) : null,
  ], fold ? { fold: `tg-group:${tg.id}:${g.index}` } : {});
}

// Мініатюри фігур, як їх малює розмітка: розкид — лінія, середній радіус — кільце навколо СТВ, габарит — пунктир.
const FIGURE_ICON = {
  spread: '<circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><path d="M6.6 15.9l10.8-7.8"/>',
  radius: '<circle cx="12" cy="12" r="8"/><path d="M12 9.5v5M9.5 12h5"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="1" stroke-dasharray="3 2.5"/>',
};

/** Що означає кожна фігура на фото мішені — пунктами, як підрахунок очок у вправах. */
function figuresLegend() {
  const item = (icon, lead, text) => {
    const pic = h('span', { class: 'tg-legend-ico', 'aria-hidden': 'true' });
    pic.innerHTML = `<svg viewBox="0 0 24 24">${FIGURE_ICON[icon]}</svg>`;
    return h('li', {}, pic, h('div', {}, h('b', {}, lead), h('div', { class: 'muted small' }, text)));
  };
  return h('div', { class: 'ex-scoring tg-legend' },
    h('div', { class: 'ex-scoring-title' }, t('Фигуры на фото')),
    h('ul', { class: 'tg-legend-list' },
      item('spread', t('Размах'), t('Линия между крайними пробоинами. О нём говорят «группа 1 MOA»; растёт с числом выстрелов.')),
      item('radius', t('Средний радиус'), t('Кольцо вокруг СТП: средняя удалённость пробоин от центра, внутри — примерно половина попаданий. От числа выстрелов почти не зависит, поэтому по нему сравнивают патроны.')),
      item('box', t('Габарит'), t('Пунктирная рамка: ширина и высота группы.'))));
}

// Відкрита підказка лишається відкритою при перемальовуванні й в інших картках того ж виду
const hintOpen = {};

/** Кнопка «i», що показує й ховає панель підказки; key — вид підказки (стан спільний). */
function hintButton(panel, key) {
  panel.hidden = !hintOpen[key];
  const button = h('button', {
    type: 'button', class: 'hint-btn', 'aria-label': t('Подсказка'), 'aria-expanded': String(!!hintOpen[key]),
    onclick: () => {
      hintOpen[key] = !hintOpen[key];
      panel.hidden = !hintOpen[key];
      button.setAttribute('aria-expanded', String(hintOpen[key]));
    },
  }, 'i');
  return button;
}

function statsBlocks(tg, photo, onUnit, onFocus = null) {
  if (!photo) return [h('p', { class: 'muted small' }, t('Фото мишени ещё не синхронизировано.'))];
  if (!M.mmPerPx(tg.scale, photo)) return [h('p', { class: 'muted small' }, t('Масштаб не задан — откройте разметку и отметьте две точки с известным расстоянием.'))];
  const groups = M.targetStats(tg, photo).filter((g) => g.stats);
  if (!groups.length) return [h('p', { class: 'muted small' }, t('Пробоины не отмечены.'))];
  // «i» — одразу під фото, в ряду одиниць: підказка про те, що на фото намальовано
  const legend = groups.some((g) => g.stats.n >= 2) ? figuresLegend() : null;
  const info = legend ? hintButton(legend, 'figures') : null;
  return [
    h('div', { class: 'tg-unit-row' }, unitChips(onUnit), info),
    legend,
    ...groups.map((g) => groupBox(g, tg, groups.length > 1, onFocus)),
    tg.poa ? null : h('p', { class: 'muted small' }, t('Отметьте точку прицеливания — появятся СТП и поправки в щелчках.')),
  ].filter(Boolean);
}

function shareLines(tg, photo) {
  const lines = [
    { text: targetTitle(tg), bold: true },
    { text: [targetWhen(tg), t('{n} м', { n: fmt.num(tg.distance) }), targetScope(tg)?.name, weatherText(tg)].filter(Boolean).join(' · '), color: '#aab3a6' },
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
    image = await shareImage(src, tg, shareLines(tg, photo), { unit: targetUnit, distance: tg.distance });
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
  const result = tg.scoreId ? state.scores.find((x) => x.id === tg.scoreId) : null;
  const figure = h('canvas', { class: 'tg-figure' });
  // фото перемальовуємо разом із цифрами: підписи на фігурах — у тих самих одиницях,
  // тап по СТВ групи підсвічує її на фото; focus має бути оголошений до першого малювання
  let focus = null;
  function opts() { return { unit: targetUnit, distance: tg.distance, active: focus }; }
  const goTo = (i) => {
    focus = focus === i ? null : i;
    drawFigure();
    figure.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  function drawFigure() {
    paintPreview(figure, photo.thumb, tg, 720, opts()).then(async () => {
      const blob = await db.getBlob(photo.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      try { await paintPreview(figure, url, tg, 1400, opts()); } finally { URL.revokeObjectURL(url); }
    }).catch(() => {});
  }
  if (photo?.thumb) drawFigure();
  const statsBox = h('div', {});
  // зміна одиниць — і в картці, і в списку під нею
  const showStats = () => statsBox.replaceChildren(...statsBlocks(tg, photo, () => { showStats(); drawFigure(); render(); }, goTo));
  showStats();
  const remove = () => {
    close();
    confirmSheet(t('Удалить мишень?'), t('Фото и разметка будут удалены.'), t('Удалить'), async () => {
      sync.trashPhoto((await db.get('photos', tg.photoId))?.driveId);
      await db.write({ targets: { del: [tg.id] }, photos: { del: [tg.photoId] }, blobs: { del: [tg.photoId] } });
      await refresh();
      confirmed();
    });
  };
  const close = sheet(targetTitle(tg), h('div', {},
    figure,
    statsBox,
    box(t('Условия'), h('dl', { class: 'kv' },
      h('dt', {}, t('Дата')), h('dd', {}, targetWhen(tg)),
      h('dt', {}, t('Дистанция')), h('dd', {}, t('{n} м', { n: fmt.num(tg.distance) })),
      targetScope(tg) ? [h('dt', {}, t('Прицел')), h('dd', {}, scopeText(targetScope(tg)))] : null,
      tg.click ? [h('dt', {}, t('Цена щелчка')), h('dd', {}, clickAtDistance(tg.click, tg.distance))] : null,
      weatherText(tg) ? [h('dt', {}, t('Погода')), h('dd', {}, weatherText(tg))] : null,
      tg.gps ? [h('dt', {}, t('Координаты')), h('dd', { class: 'kv-gps' }, `${tg.gps.lat.toFixed(5)}, ${tg.gps.lon.toFixed(5)}`,
        toolBtn('map', t('Открыть на карте'), () => openMap(tg.gps), 'small'))] : null,
      shot ? [h('dt', {}, t('Стрельба')), h('dd', {}, h('button', {
        type: 'button', class: 'link-btn', onclick: () => { close(); movementDetail(shot); },
      }, `${fmt.date(shot.date)} · ${fmt.signed(shot.qty)}`))] : null,
      result ? [h('dt', {}, t('Упражнение')), h('dd', {}, `${exerciseName(result.exercise) ?? '—'} · ${fmt.date(result.date)} · ${fmt.num(result.score)}`)] : null,
      tg.note ? [h('dt', {}, t('Примечание')), h('dd', {}, tg.note)] : null)),
    h('div', { class: 'btn-row' },
      btn(t('Разметка'), () => { close(); editMarks(tg); }, 'primary'))), {
    tools: [toolBtn('share', t('Поделиться'), () => shareTarget(tg).catch((err) => toast(err.message))),
      ...cardTools(() => { close(); targetForm(tg); }, false, remove)],
  });
}

// ---------- рецепти та склад компонентів ----------

let reloadPane = recall('shooters-log:pane') === 'stock' ? 'stock' : 'recipes';

function componentLevel(c, runway) {
  if (!runway.length) return '';
  const least = runway[0].rounds;
  if (least === 0) return 'out';
  return least < LOW_ROUNDS ? 'low' : '';
}

function componentCard(c) {
  const stock = M.componentStock(state, c.id);
  const price = M.unitPrice(state, c);
  const unit = c.unit || 'шт';
  const runway = M.componentRunway(state, c);
  const card = h('article', { class: `card level-${componentLevel(c, runway) || 'ok'}`, 'data-id': c.id },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'muted small' }, [
          price ? t('{price} за {unit}', { price: fmt.money(price), unit }) : c.kind === 'case' ? t('без цены') : t('цена не указана'),
          stock > 0 && price ? t('на сумму {sum}', { sum: fmt.money(stock * price) }) : null].filter(Boolean).join(' · ')),
        runway.length
          ? h('div', { class: 'runway' }, runway.map((r) => h('div', { class: 'runway-row small' },
            h('span', { class: 'runway-name' }, r.recipe.name), ' · ',
            h('b', { class: r.rounds === 0 ? 'neg' : r.rounds < LOW_ROUNDS ? 'warn-text' : '' },
              t('хватит на {n} шт', { n: fmt.num(r.rounds) })))))
          : h('div', { class: 'muted small' }, t('не используется в рецептах'))),
      h('div', { class: `big ${stock < 0 ? 'neg' : stock === 0 ? 'zero' : ''}` }, fmt.num(stock), h('div', { class: 'muted small unit' }, unit))));
  return swipeable(card, {
    rightLabel: t('+ Купить'), leftLabel: t('Пересчёт'),
    onRight: () => buyComponentSheet(c),
    onLeft: () => adjustSheet(c, 'components'),
    onTap: () => componentDetail(c),
  });
}

function recipeCard(r) {
  const cost = M.recipeCost(state, r);
  const lines = M.recipeLines(state, r);
  const enough = M.recipeEnough(state, r);
  const neck = M.recipeBottleneck(state, r);
  const card = h('article', { class: 'card', 'data-id': r.id },
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
  return h('div', {}, loadedHero(), groupBy(state.recipes, (r) => r.caliber || t('Без калибра')).map(([caliber, list]) => fold(`recipes:${caliber}`,
    [cartridgeIcon(caliber), h('span', { class: 'fold-title' }, caliber), h('span', { class: 'fold-meta' }, t('{n} поз.', { n: list.length }))],
    list.sort(byName).map(recipeCard))));
}

/** Скільки всього споряджено й на яку суму — за собівартістю на день спорядження. */
function loadedHero() {
  const loads = state.movements.filter((m) => m.kind === 'reload');
  if (!loads.length) return null;
  const qty = loads.reduce((s, m) => s + m.qty, 0);
  const sum = loads.reduce((s, m) => s + (m.price || 0), 0);
  return h('section', { class: 'hero badge-hero' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('снаряжено')),
      h('div', { class: 'hero-value' }, fmt.num(qty), h('span', { class: 'hero-unit' }, t('шт')))),
    h('div', { class: 'hero-badges' },
      heroBadge(`${fmt.num(Math.round(sum))} ${t('грн')}`, ''),
      qty ? heroBadge(fmt.money(sum / qty), t('за шт')) : null));
}

/** Плашка праворуч у підсумку: жирне значення й підпис; cls — neg / warn. */
function heroBadge(value, label, cls = '') {
  return h('span', { class: `hero-badge ${cls}` }, h('b', {}, value), label ? ` ${label}` : null);
}

/** Склад: сума ліворуч, праворуч плашки — скільки позицій, яких немає й які закінчуються. */
function stockHero(value, count, out, low) {
  const badge = (n, label, cls) => heroBadge(fmt.num(n), label, cls);
  return h('section', { class: 'hero badge-hero' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('Склад на сумму')),
      // Копійки в підсумку лише заважають читати — точна сума видна в картках компонентів.
      h('div', { class: 'hero-value' }, fmt.num(Math.round(value)), h('span', { class: 'hero-unit' }, t('грн')))),
    h('div', { class: 'hero-badges' },
      badge(count, plural(count, [t('позиция'), t('позиции'), t('позиций')])),
      out ? badge(out, t('нет в наличии'), 'neg') : null,
      low ? badge(low, t('заканчивается'), 'warn') : null));
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
    stockHero(M.stockValue(state), state.components.length, out, low),
    groups.map(([kind, list]) => fold(`stock:${kind}`,
      [h('span', { class: 'fold-title' }, t(M.COMPONENT_KINDS[kind])), h('span', { class: 'fold-meta' }, t('{n} поз.', { n: list.length }))],
      list.map(componentCard))));
}

function renderReload() {
  const seg = chips([['recipes', t('Рецепты')], ['stock', t('Склад')]], reloadPane, (v) => {
    reloadPane = v;
    remember('shooters-log:pane', v);
    render();
  });
  seg.classList.add('segmented', 'tab-seg');
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
    // Що вже лежить удома: із сумою — покупка (йде в ціну), без суми — початковий залишок.
    ...(c ? [] : [
      { name: 'initial', label: t('Сейчас в наличии (шт или г)'), type: 'number', step: 'any', min: 0, half: true },
      { name: 'initialPrice', label: t('Сумма покупки (необязательно)'), type: 'number', step: 'any', half: true },
    ]),
  ]);
  const close = sheet(c ? t('Изменить: {name}', { name: c.name }) : t('Новый компонент'), f.el, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const { initial, initialPrice, ...v } = f.values();
    close();
    const obj = { ...(c ?? { id: db.uid(), created: Date.now() }), ...v };
    if (!c && initial > 0) {
      const buying = initialPrice > 0;
      await addMovements([movement({
        kind: buying ? 'buy' : 'adjust', componentId: obj.id, qty: initial,
        price: buying ? initialPrice : undefined, note: buying ? undefined : t('Начальный остаток'),
      })], t('Добавлено: {name}', { name: obj.name }), { components: { put: [obj] } });
      return;
    }
    await saveEntity('components', obj);
  }
}

/** Картка компонента: залишок, ціна, на скільки вистачить, покупки й витрати; правка й видалення — значками вгорі. */
function componentDetail(c) {
  const fresh = () => findComponent(c.id);
  const body = () => { const cur = fresh(); return cur ? componentBody(cur, () => close()) : null; };
  const tools = [
    toolBtn('edit', t('Изменить'), () => { close(); componentForm(fresh() ?? c); }),
    toolBtn('delete', t('Удалить'), () => {
      const cur = fresh() ?? c;
      if (state.recipes.some((r) => r.items.some((i) => i.componentId === cur.id))) { toast(t('Компонент используется в рецепте')); return; }
      if (state.movements.some((m) => m.componentId === cur.id)) { toast(t('По компоненту есть движения')); return; }
      close();
      confirmSheet(t('Удалить компонент?'), cur.name, t('Удалить'), async () => { await db.write({ components: { del: [cur.id] } }); await refresh(); });
    }, 'danger'),
  ];
  const close = sheet(c.name, body(), { live: body, tools });
}

function componentBody(c, close) {
  const unit = c.unit || 'шт';
  const stock = M.componentStock(state, c.id);
  const price = M.unitPrice(state, c);
  const moves = state.movements.filter((m) => m.componentId === c.id);
  const runway = M.componentRunway(state, c);
  return h('div', {},
    h('p', { class: 'muted' }, [t(M.COMPONENT_KINDS[c.kind] ?? 'Другое'),
      price && stock > 0 ? t('на сумму {sum}', { sum: fmt.money(stock * price) }) : null, c.note].filter(Boolean).join(' · ')),
    h('div', { class: 'stats even' },
      stat(t('остаток, {unit}', { unit }), fmt.num(stock), 'accent'),
      stat(t('цена за {unit}', { unit }), price ? fmt.money(price) : t('без цены'))),
    runway.length ? h('div', { class: 'runway' }, runway.map((r) => h('div', { class: 'runway-row small' },
      h('span', { class: 'runway-name' }, r.recipe.name), ' · ',
      h('b', { class: r.rounds === 0 ? 'neg' : r.rounds < LOW_ROUNDS ? 'warn-text' : '' }, t('хватит на {n} шт', { n: fmt.num(r.rounds) }))))) : null,
    h('div', { class: 'btn-row' },
      btn(t('+ Купить'), () => { close(); buyComponentSheet(c); }, 'buy'),
      btn(t('Пересчёт'), () => { close(); adjustSheet(c, 'components'); })),
    // Покупки, витрата на спорядження, зібрані гільзи — найновіше зверху.
    box(t('История'), movementRows(moves, { skip: { component: true } }), { fold: `chist:${c.id}`, count: moves.length }));
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
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Укажите количество')); return; }
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
  // Рядки рецепта: значення кожного рахує сам рядок.
  const rows = [];
  const addItem = (item = {}) => {
    const select = h('select', {}, options.map(([id, label]) => h('option', { value: id, selected: id === item.componentId }, label)));
    const per = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: t('на 1 шт') });
    // Компонент у грамах (порох) — навеску можна вводити в гранах, як у таблицях навесок; зберігається в грамах.
    const unitSel = h('select', { class: 'item-unit', 'aria-label': t('Единица') },
      h('option', { value: 'g' }, t('г')), h('option', { value: 'gr' }, 'gr'));
    const inGrams = () => !unitSel.classList.contains('off');
    // Точна навеска за показаним числом: поки його не правили, перемикач і збереження рахують від неї, а не від округленого.
    let exact = null;
    const show = (grams, unit) => {
      per.value = String(unit === 'gr' ? +(grams / M.GRAIN).toFixed(2) : +grams.toFixed(3));
      exact = { text: per.value, grams };
    };
    const typed = () => Number(String(per.value).replace(',', '.')) || 0;
    const grams = (unit) => (exact?.text === per.value ? exact.grams : unit === 'gr' ? typed() * M.GRAIN : typed());
    unitSel.value = item.grains ? 'gr' : 'g';
    if (item.grains) show(Number(item.perRound), 'gr');
    else per.value = item.perRound ?? 1;
    // Не в грамах — місце лишається, щоб колонки рядків не роз'їжджалися.
    const syncUnit = () => {
      unitSel.classList.toggle('off', findComponent(select.value)?.unit !== 'г');
      if (!inGrams()) unitSel.value = 'g';
    };
    select.addEventListener('change', syncUnit);
    syncUnit();
    // Перемкнули г ↔ gr — число в полі перераховується, навеска та сама.
    unitSel.addEventListener('change', () => {
      const g = grams(unitSel.value === 'gr' ? 'g' : 'gr');
      if (g > 0) show(g, unitSel.value);
    });
    const row = h('div', { class: 'item-row' }, select, per, unitSel, h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Убрать'), onclick: () => row.remove() }, '✕'));
    rows.push({
      row,
      value: () => {
        const gr = inGrams() && unitSel.value === 'gr';
        return { componentId: select.value, perRound: inGrams() ? +grams(unitSel.value).toFixed(6) : typed(), ...(gr ? { grains: true } : {}) };
      },
    });
    itemsBox.append(row);
  };
  (r?.items ?? [{}]).forEach(addItem);
  const close = sheet(r ? t('Изменить рецепт') : t('Новый рецепт'), h('div', {},
    f.el, h('h3', {}, t('Компоненты и расход на 1 патрон')), itemsBox,
    btn(t('+ компонент'), () => addItem())), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const items = rows.filter((x) => x.row.isConnected).map((x) => x.value()).filter((i) => i.componentId && i.perRound > 0);
    if (!items.length) { formError(t('Добавьте хотя бы один компонент')); return; }
    close();
    await saveEntity('recipes', { ...(r ?? { id: db.uid(), created: Date.now() }), ...f.values(), items });
  }
}

function recipeDetail(r) {
  const body = () => { const cur = state.recipes.find((x) => x.id === r.id); return cur ? recipeBody(cur, () => close()) : null; };
  // Правка й видалення — значками в шапці, як у картках набою, зброї й вправи.
  const tools = [
    toolBtn('edit', t('Изменить'), () => { close(); recipeForm(state.recipes.find((x) => x.id === r.id) ?? r); }),
    toolBtn('delete', t('Удалить'), () => {
      close();
      confirmSheet(t('Удалить рецепт?'), t('Снаряжённые патроны и журнал останутся.'), t('Удалить'), async () => { await db.write({ recipes: { del: [r.id] } }); await refresh(); });
    }, 'danger'),
  ];
  const close = sheet(r.name, body(), { live: body, tools });
}

function recipeBody(r, close) {
  const lines = M.recipeLines(state, r);
  const loads = state.movements.filter((m) => m.kind === 'reload' && m.recipeId === r.id);
  const loaded = loads.reduce((s, m) => s + m.qty, 0);
  const cartridge = state.cartridges.find((c) => c.recipeId === r.id && !c.archived) ?? state.cartridges.find((c) => c.recipeId === r.id);
  return h('div', {},
    h('p', { class: 'muted' }, [r.caliber, r.note].filter(Boolean).join(' · ')),
    h('div', { class: 'stats even' },
      stat(t('себестоимость'), fmt.money(M.recipeCost(state, r)), 'accent'),
      stat(t('из запасов'), t('{n} шт', { n: fmt.num(M.recipeEnough(state, r)) })),
      loaded ? stat(t('снаряжено'), t('{n} шт', { n: fmt.num(loaded) })) : null),
    h('table', { class: 'lines' },
      h('thead', {}, h('tr', {}, h('th', {}, t('Компонент')), h('th', {}, t('на 1')), h('th', {}, t('цена')), h('th', {}, t('хватит')))),
      h('tbody', {}, lines.map((l) => h('tr', { class: l.noPrice && l.component?.kind !== 'case' ? 'warn' : '' },
        h('td', {}, l.component?.name ?? t('(удалён)')),
        h('td', {}, l.grains
          ? [`${fmt.num(+l.grains.toFixed(2))} gr`, h('div', { class: 'muted small' }, `${fmt.num(+l.perRound.toFixed(3))} ${t('г')}`)]
          : `${fmt.num(l.perRound)} ${l.component?.unit || 'шт'}`),
        h('td', {}, l.noPrice ? '—' : fmt.money(l.cost)),
        h('td', {}, l.fromStock === null ? '—' : fmt.num(Math.max(0, l.fromStock))))))),
    h('p', { class: 'muted small' }, t('«Хватит» — на сколько патронов хватит остатка на складе.')),
    caseNote(r),
    h('div', { class: 'btn-row' },
      btn(t('Снарядить'), () => { close(); reloadSheet(r); }, 'primary')),
    // Що вийшло: набій на складі й коли скільки спорядили.
    cartridge ? h('p', { class: 'muted small' }, `${t('Патрон')}: `,
      h('button', { type: 'button', class: 'link-btn', onclick: () => { close(); cartridgeDetail(cartridge); } }, cartridge.name),
      ` · ${t('остаток')} ${fmt.num(M.cartridgeStock(state, cartridge.id))}`) : null,
    loads.length ? box(t('Снаряжения'), movementRows(loads), { fold: `rhist:${r.id}`, count: loads.length }) : null);
}

/** Куди повертаються гільзи, зібрані після стрільби. */
function caseNote(r) {
  const back = caseTarget(r);
  if (!back) return null;
  return h('p', { class: 'muted small' }, t('Собранные гильзы → «{name}»', { name: back.name }),
    back.id ? null : ` ${t('(появится при первом сборе)')}`);
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
    if (invalidField(f)) return;
    const v = f.values();
    const qty = Math.round(v.qty);
    if (!(qty > 0)) { fieldError(f.inputs.qty, t('Укажите количество')); return; }
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
      if (!line.component) continue;
      moves.push(movement({ ...common, kind: 'consume', componentId: line.component.id, recipeId: r.id, qty: -+(line.perRound * qty).toFixed(3) }));
    }
    close();
    await addMovements(moves, t('Снаряжено {n} · {name}', { n: qty, name: r.name }), extra,
      qty > enough ? t('Компоненты ушли в минус') : null);
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

/** Файл — через «Поділитися» (на телефоні: Telegram, Диск…), де не вміє — завантаженням; false — скасували. */
async function offerFile(name, content, type, share = true) {
  if (share) {
    const file = new File([content], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
  }
  download(name, new Blob([content], { type }));
  return true;
}

async function exportData(share) {
  const payload = JSON.stringify({ app: 'shooters-log', format: 1, exportedAt: new Date().toISOString(), data: state }, null, 1);
  if (await offerFile(`shooters-log-${M.today()}.json`, payload, 'application/json', share)) remember(BACKUP_KEY, M.today());
}

/**
 * Журнал у CSV для Excel — ті записи, що зараз на екрані (тип і зброя з фільтра), від старих до нових.
 * «;» і десяткова кома — як чекає Excel з українськими налаштуваннями; BOM — щоб не поламалась кирилиця.
 */
async function exportCsv(list) {
  if (!list.length) { toast(t('Нет записей для экспорта')); return; }
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const dec = (v) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? String(Math.round(Number(v) * 100) / 100).replace('.', ',') : '');
  const rows = [...list].sort((a, b) => M.byDateDesc(b, a)).map((m) => {
    const gun = m.kind === 'clean' ? findWeapon(m.weaponId)?.name : shotGun(m)?.name;
    const unit = m.kind === 'clean' ? '' : m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : 'шт';
    return [fmt.date(m.date), m.time ?? '', t(M.KINDS[m.kind]), gun ?? '', m.kind === 'clean' ? '' : movementTitle(m),
      m.kind === 'clean' ? '' : String(m.qty).replace('.', ','), unit, dec(m.kind === 'shot' ? M.shotCost(state, m) : m.price), m.note ?? ''];
  });
  const head = [t('Дата'), t('Время'), t('Тип'), t('Оружие'), t('Патрон / компонент'), t('Количество'), t('Ед.'), t('Сумма'), t('Примечание')];
  const text = `\uFEFF${[head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
  await offerFile(`shooters-log-journal-${M.today()}.csv`, text, 'text/csv');
}

// Коли востаннє зберігали копію — для нагадування й рядка в ⚙ (лише на цьому пристрої).
const BACKUP_KEY = 'shooters-log:backup-at';
const BACKUP_EVERY = 30;

/** Без Google Диска раз на місяць: дані лише на пристрої — нагадати зберегти копію. */
function backupReminder() {
  // демодані мають id 'mv-…', свої записи — UUID: на демо не нагадуємо
  const own = state.movements.filter((m) => !String(m.id).startsWith('mv-')).length;
  const last = [recall(BACKUP_KEY), recall('shooters-log:backup-reminded')].filter(Boolean).sort().pop();
  if (sync.enabled() || own < 20 || (last && M.addDays(last, BACKUP_EVERY) > M.today())) return false;
  remember('shooters-log:backup-reminded', M.today());
  toast(t('Данные только на этом устройстве — сохраните копию'), {
    action: t('Сохранить'),
    onAction: () => exportData(true),
  });
  return true;
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch { toast(t('Файл не похож на JSON')); return; }
    importParsed(parsed);
  };
  reader.readAsText(file);
}

/** Демодані з комплекту: облік з 2022 року з мішенями, вправами й серіями таймера — подивитися, як воно працює. */
async function loadDemo() {
  toast(t('Загружаю демо-данные…'));
  try {
    const res = await fetch('./demo.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    importParsed(await res.json());
  } catch {
    toast(t('Не удалось загрузить демо-данные'));
  }
}

function importParsed(parsed) {
  {
    const data = parsed?.data;
    // Старі копії підписані колишнім ім'ям — приймаємо обидва.
    if (!['shooters-log', 'scouts-log', 'shooting-log'].includes(parsed?.app) || !data || !db.STORES.every((s) => !data[s] || Array.isArray(data[s]))) {
      toast(t('Это не резервная копия Shooters Log'));
      return;
    }
    const count = db.STORES.reduce((s, k) => s + (data[k]?.length ?? 0), 0);
    const changes = Object.fromEntries(db.STORES.map((s) => [s, { put: (data[s] ?? []).filter((x) => x && x.id) }]));
    const close = sheet(t('Импорт'), h('div', {},
      h('p', {}, t('В файле {n} записей.', { n: count })),
      h('p', { class: 'muted small' }, t('«Объединить» — добавит новые записи и обновит те, что в файле новее: более поздние правки на устройстве останутся. «Заменить всё» — сначала удалит текущие данные.')),
      sync.enabled() ? h('p', { class: 'muted small' }, t('Включена синхронизация: «Заменить всё» заменит данные и на Google Диске, и на других устройствах. «Объединить» не откатит более новые данные с Диска.')) : null), {
      actions: [
        btn(t('Отмена'), () => close()),
        btn(t('Объединить'), async () => { close(); await db.mergeImport(changes); await refresh(); toast(t('Импортировано')); }),
        btn(t('Заменить всё'), () => {
          close();
          confirmSheet(t('Заменить все данные?'), t('Текущие данные будут удалены. Сначала сделайте экспорт, если они нужны.'), t('Заменить'), async () => {
            sync.markRestore(await db.replaceAll(changes)); await refresh(); toast(t('Данные заменены'));
          });
        }, 'danger'),
      ],
    });
  }
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
      h('p', { class: 'muted small' }, t('Данные будут храниться в файле shooters-log.json на вашем Google Диске и совпадать на телефоне и компьютере. Приложение видит только свои файлы, остальной Диск ему недоступен.')),
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
  // Аватар власника Google Диска в шапці — поки не під'єднано, його просто немає.
  const avatar = $('app-icon');
  avatar.hidden = !s.photo;
  if (s.photo && avatar.src !== s.photo) avatar.src = s.photo;
  avatar.title = [s.who, s.email].filter(Boolean).join(' · ');
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
  const v = recall('shooters-log:theme');
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
/** Довгий текст під розкриттям. */
const more = (title, node) => h('details', { class: 'ex-more' }, h('summary', {}, title), node);

/** «Про застосунок»: що воно таке, де лежать дані й куди дивитися, якщо не довіряєш на слово. */
function aboutPanel() {
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  return h('section', { class: 'panel about' },
    h('div', { class: 'about-head' },
      h('img', { class: 'about-avatar', src: './icons/author.jpg', alt: '', width: 64, height: 64, loading: 'lazy' }),
      h('div', {},
        h('h3', {}, t('Про приложение')),
        h('p', { class: 'muted small' }, t('Shooters Log — учёт боеприпасов, настрела по стволам, кучности и упражнений. Работает без интернета: всё считается на устройстве.')))),
    more(t('Где мои данные'), h('div', { class: 'muted small' },
      h('p', {}, t('Записи и фото лежат в браузере на этом устройстве. Сервера у приложения нет, автор не получает ни данных, ни статистики.')),
      h('p', {}, t('Google Диск подключается по желанию: копия ложится в ваш Диск, приложение видит только свои файлы. Браузеру запрещено отправлять данные куда-либо ещё — это прописано в коде страницы (Content Security Policy).')),
      h('p', {}, t('Резервная копия — ⚙ → «Поделиться копией». Она же переносит данные на другое устройство через «Импорт».')))),
    more(t('С чего начать'), h('ol', { class: 'ex-rules' },
      h('li', {}, t('Установите приложение: Android — Chrome → ⋮ → «Установить приложение»; iPhone — Safari → «Поделиться» → «На экран „Домой“».')),
      h('li', {}, t('Заведите ствол на вкладке «Оружие» и патрон на вкладке «Набої».')),
      h('li', {}, t('Свайп по карточке патрона: вправо — покупка, влево — списание на стрельбу.')),
      h('li', {}, t('После стрельбы сфотографируйте мишень: «Полигон» → «Мишени» → «+». Отметьте масштаб и пробоины — приложение посчитает кучность, СТП и поправки в щелчках.')),
      h('li', {}, t('Хотите сначала посмотреть — ⚙ → «Загрузить демо-данные», там готовый учёт с 2022 года. Перед своими записями удалите демо: ⚙ → «Удалить данные с устройства».')),
      h('li', {}, t('Без Google Диска данные лежат только на этом устройстве — подключите его в ⚙ или время от времени сохраняйте копию.')))),
    h('p', { class: 'muted small' },
      link('https://github.com/VitaliyLobko/shooting-log/issues/new', t('Сообщить об ошибке')), ' · ',
      link('https://github.com/VitaliyLobko/shooting-log', t('Исходный код')), ' · ',
      link('https://github.com/VitaliyLobko/shooting-log/blob/main/PRIVACY.md', t('Приватность')), ' · ',
      link('https://github.com/VitaliyLobko/shooting-log/blob/main/LICENSE', t('Лицензия MIT'))));
}

// ---------- що нового ----------

const SEEN_KEY = 'shooters-log:seen-version';
// Версія, з якої ведеться журнал змін: хто оновився з неї чи раніше, ще не мав запису «бачив»
const FIRST_TRACKED = '0.7.0';

function changesSheet(list) {
  const key = lang() === 'ru' ? 'ru' : 'uk';
  sheet(t('Что нового'), h('div', {}, list.map((c) => box(`${c.label ?? c.v} · ${fmt.date(c.date)}`,
    h('ul', { class: 'changes' }, c[key].map((x) => h('li', {}, x)))))));
}

/** Після оновлення — один раз, що змінилося з версії, яку людина бачила; нова установка — без шторки. */
function showNews() {
  const hasData = db.STORES.some((s) => state[s]?.length);
  let seen = recall(SEEN_KEY) ?? (hasData ? FIRST_TRACKED : null);
  // Нумерацію перезапускали (0.7.36 → 0.7.0): «бачена» новіша за поточну — рахуємо від поточної
  if (seen && newer(seen, self.APP_VERSION)) seen = self.APP_VERSION;
  remember(SEEN_KEY, self.APP_VERSION);
  const list = seen ? CHANGES.filter((c) => newer(c.v, seen)) : [];
  if (list.length) changesSheet(list);
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
    aboutPanel(),
    h('section', { class: 'panel' }, h('h3', {}, t('Версия и обновление')),
      h('p', { class: 'muted small' }, t('Сейчас установлена версия {v}. Обновление приходит плашкой вверху — если её долго нет, проверьте вручную.', { v: self.APP_VERSION })),
      h('div', { class: 'btn-row' }, btn(t('Проверить обновление'), checkUpdate, 'primary'), btn(t('Что нового'), () => changesSheet(CHANGES)))),
    h('section', { class: 'panel' }, h('h3', {}, t('Демо-данные')),
      h('p', { class: 'muted small' }, t('Учёт с 2022 года для примера: шесть стволов, покупки и стрельбы, самоснаряжение, чистки, размеченные мишени, упражнения с ростом результата, скорости и серии таймера. Удобно посмотреть, как всё работает, пока своих записей нет.')),
      h('div', { class: 'btn-row' }, btn(t('Загрузить демо-данные'), loadDemo))),
    h('section', { class: 'panel' }, h('h3', {}, 'Мова · Язык'), langChips),
    h('section', { class: 'panel' }, h('h3', {}, t('Тема')), (() => {
      const row = chips(THEMES.map(([k, label]) => [k, t(label)]), themePref(), (v) => { remember('shooters-log:theme', v); applyTheme(); });
      row.classList.add('segmented');
      return row;
    })()),
    syncPanel(),
    h('section', { class: 'panel' },
      h('h3', {}, t('Резервная копия')),
      h('p', { class: 'muted small' }, sync.enabled()
        ? t('Основная копия — на Google Диске. Файл ниже — дополнительный снимок на всякий случай.')
        : t('Без синхронизации данные хранятся только на этом устройстве. Делайте экспорт после каждой стрельбы — например, «Поделиться» → Google Диск или Telegram «Избранное».')),
      h('p', { class: 'muted small' }, t('Последняя копия: {when}', { when: recall(BACKUP_KEY) ? fmt.date(recall(BACKUP_KEY)) : t('ещё не было') })),
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
      h('p', { class: 'muted small' }, t('Chrome → меню ⋮ → «Добавить на главный экран» / «Установить приложение». После установки работает без интернета.')),
      h('p', { class: 'muted small' }, t('iPhone: Safari → «Поделиться» → «На экран „Домой“». Открывайте приложение с этой иконки, а не из вкладки Safari — иначе Safari может стереть данные сайта, если неделю не заходить.'))),
    h('section', { class: 'panel' },
      h('h3', {}, t('Опасная зона')),
      btn(t('Удалить данные с устройства'), () => confirmSheet(t('Удалить данные с устройства?'), sync.enabled()
        ? t('Данные будут удалены с этого устройства. Копия на Google Диске останется и вернётся при следующей синхронизации (кроме фото, которые ещё не успели выгрузиться) — чтобы этого не было, сначала отключите синхронизацию.')
        : t('Оружие, БК, журнал, рецепты и фото будут удалены с этого устройства. Отменить нельзя.'), t('Удалить'), async () => {
        await db.clearAll(); await refresh(); toast(t('Данные удалены'));
      }), 'danger')));
}

// ---------- довідник ----------

// Книга із сіткою прицілу: рядки — кольором тексту, сітка — акцентом; темна й світла теми однаково
const GUIDE_ICON = '<svg viewBox="0 0 48 32" aria-hidden="true">'
  + '<path d="M24 7c-5-3-12-3.6-18-2.4v21.8c6-1.2 13-.6 18 2.4 5-3 12-3.6 18-2.4V4.6C36 3.4 29 4 24 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  + '<path d="M24 7v21.8" stroke="currentColor" stroke-width="1.4" opacity=".6"/>'
  + '<path d="M9.5 11h10M9.5 15h10M9.5 19h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>'
  + '<circle cx="33" cy="16" r="6.2" fill="none" stroke="var(--accent)" stroke-width="1.6"/>'
  + '<path d="M33 8.6v4.4M33 19v4.4M25.6 16H30M36 16h4.4" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/>'
  + '<circle cx="33" cy="16" r="1" fill="var(--accent)"/>'
  + '</svg>';

/** Посилання на довідник у «Полігон → Вправи»: теорія поруч із тренуваннями. */
function guideLink() {
  const icon = h('span', { class: 'guide-link-ico' });
  icon.innerHTML = GUIDE_ICON;
  return h('a', { class: 'guide-link', href: '#guide' }, icon,
    h('span', { class: 'guide-link-text' },
      h('b', {}, t('Справочник стрелка')),
      h('span', { class: 'muted small' }, t('Курс марксмана · без интернета'))),
    h('span', { class: 'guide-link-go', 'aria-hidden': 'true' }, '›'));
}

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

const VIEWS = {
  ammo: { title: 'Патроны', render: renderAmmo, fab: ammoAddMenu },
  guns: { title: 'Оружие', render: renderGuns, fab: () => weaponForm() },
  log: { title: 'Журнал', render: renderLog, fab: foreignShotSheet },
  // «+» — у відкритому розділі: на «Складі» компонент, у «Рецептах» рецепт.
  reload: { title: 'Рецепты', render: renderReload, fab: () => (reloadPane === 'stock' ? componentForm() : recipeForm()) },
  settings: { title: 'Настройки', render: renderSettings },
  guide: { title: 'Справочник', render: renderGuide, tab: 'targets' },
  // «+» — у розділі, що відкритий: своя вправа або нова мішень; у таймера кнопки немає.
  targets: { title: 'Полигон', render: renderRange, fab: () => (rangeSeg === 'exercises' ? newExercise() : rangeSeg === 'chrono' ? chronoForm() : newTarget({ weaponId: targetWeapon || null })), noFab: () => rangeSeg === 'timer' },
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
  if (!dirty.length || recall('shooters-log:clean-reminded') === M.today()) return false;
  remember('shooters-log:clean-reminded', M.today());
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

/**
 * Ручна перевірка оновлення: інколи телефон не питає сам (старий worker живий, мережа підвела).
 * Нова версія приходить плашкою вгорі — тут лише штовхаємо перевірку й кажемо, чим вона скінчилась.
 */
async function checkUpdate() {
  if (!('serviceWorker' in navigator)) { toast(t('Обновления работают только по https')); return; }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) { toast(t('Приложение ещё не установлено как офлайн-копия')); return; }
  toast(t('Проверяю обновление…'));
  try {
    await reg.update();
  } catch {
    toast(t('Нет связи с сервером'));
    return;
  }
  if (reg.installing || reg.waiting) toast(t('Есть новая версия — нажмите «Обновить» вверху'));
  else toast(t('У вас последняя версия'));
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
    reg.update().catch(() => {});
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
$('fab').addEventListener('click', () => VIEWS[tab].fab?.());
$('sync-chip').addEventListener('click', onSyncChip);
window.addEventListener('hashchange', route);
window.addEventListener('sync-applied', refresh);
window.addEventListener('db-blocked', () => toast(t('Закройте другие вкладки приложения — база обновляется')));
registerWorker();
navigator.storage?.persist?.().catch(() => {});
state = await db.loadAll();
route();
// нагадування по черзі — наступне після показаного, щоб не перекрило
(function remind([first, ...rest]) {
  if (!first) return;
  if (first()) setTimeout(() => remind(rest), 8500); else remind(rest);
})([cleaningReminder, permitsReminder, backupReminder]);
showNews();
sync.onStatus(renderSyncChip);
sync.preload();
sync.syncNow();
