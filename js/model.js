// Залишки й настріл не зберігаються — завжди рахуються з журналу рухів.
//
// movement: { id, batch, date, kind, qty, caliber, cartridgeId?, componentId?,
//             weaponId?, recipeId?, price?, note? }
//   kind: buy | shot | reload | consume | adjust
//   qty: зі знаком, у штуках патронів або в одиницях компонента.
//   shot без cartridgeId — історичний запис: рахується в настріл, але не в залишок БК.
// Підписи нижче — ключі перекладу, на екран вони йдуть через t().
import { collate } from './i18n.js';

export const KINDS = {
  buy: 'Покупка',
  shot: 'Стрельба',
  reload: 'Снаряжение',
  consume: 'Расход компонента',
  adjust: 'Корректировка',
  clean: 'Чистка',
};

export const COMPONENT_KINDS = {
  bullet: 'Пуля',
  powder: 'Порох',
  primer: 'Капсюль',
  case: 'Гильза',
  shot: 'Дробь / картечь',
  wad: 'Пыж / прокладка',
  other: 'Другое',
};

export function sumBy(movements, pred) {
  let total = 0;
  for (const m of movements) if (pred(m)) total += Number(m.qty) || 0;
  return total;
}

export function cartridgeStock(state, id) {
  return sumBy(state.movements, (m) => m.cartridgeId === id);
}

export function componentStock(state, id) {
  return sumBy(state.movements, (m) => m.componentId === id);
}

export function weaponShots(state, weapon) {
  const fired = -sumBy(state.movements, (m) => m.kind === 'shot' && m.weaponId === weapon.id);
  return (Number(weapon.initialShots) || 0) + fired;
}

// Рух m зроблено пізніше за ref: спершу за датою, в межах дня — за часом створення.
const later = (m, ref) => (m.date ?? '') > (ref.date ?? '')
  || ((m.date ?? '') === (ref.date ?? '') && (m.created ?? 0) > (ref.created ?? 0));

/**
 * Журнал чисток ствола, найновіша перша (рухи kind 'clean', qty 0).
 * Позначка cleanedDate з версій до 0.4 — як чистка наприкінці того дня.
 */
export function cleanings(state, weapon) {
  const list = state.movements.filter((m) => m.kind === 'clean' && m.weaponId === weapon.id).sort(byDateDesc);
  if (!list.length && weapon.cleanedDate) list.push({ id: null, date: weapon.cleanedDate, created: Infinity, legacy: true });
  return list;
}

/**
 * Стан чистки. Без інтервалу due — є постріли після останньої чистки;
 * з інтервалом cleanEvery — постріли після чистки досягли інтервалу.
 */
export function cleaningStatus(state, weapon) {
  const last = cleanings(state, weapon)[0] ?? null;
  const shots = state.movements.filter((m) => m.kind === 'shot' && m.weaponId === weapon.id && (!last || later(m, last)));
  const since = Math.max(0, -sumBy(shots, () => true));
  const every = Number(weapon.cleanEvery) || 0;
  const lastShot = shots.map((m) => m.date).filter(Boolean).sort().pop() ?? null;
  return { last, since, every, lastShot, due: every > 0 ? since >= every : since > 0 };
}

// Орієнтовний ресурс ствола до втрати купчастості, пострілів. Довідково: хромований ствол
// ближче до верхньої межі, матчевий — до нижньої, швидкий темп стрільби скорочує ресурс.
const BARREL_LIFE = [
  [/(^|[^\d])(223|5[.,]56)/, 10000, 20000],
  [/5[.,]45/, 10000, 20000],
  [/7[.,]62\s*[x×х]\s*39/, 15000, 20000],
  [/7[.,]62\s*[x×х]\s*54/, 6000, 10000],
  [/(308|7[.,]62\s*[x×х]\s*51)/, 5000, 10000],
  [/6[.,]5\s*(cm|creed|крід)/, 2500, 3500],
  [/300\s*(wm|win\s*mag)/, 1500, 2500],
  [/338/, 1500, 3000],
  [/(9\s*[x×х]\s*19|9\s*(mm|мм)|luger|para)/, 30000, 50000],
  [/22\s*lr/, 50000, null],
];

/** Ресурс за калібром: { min, max } або { smooth: true } для гладкоствольної; null — невідомо. */
export function barrelLifeFor(caliber) {
  const c = String(caliber ?? '').toLowerCase();
  if (!c) return null;
  if (/(^|[^\d])(12|16|20|28)\s*(кал|ga|g\b|калібр)/.test(c)) return { smooth: true };
  const row = BARREL_LIFE.find(([re]) => re.test(c));
  return row ? { min: row[1], max: row[2] } : null;
}

/** Настріл із журналу: калібр → загалом і по кожному стволу (weaponId null — ствол не вказано). */
export function shotsByCaliber(state) {
  const totals = new Map();
  for (const m of state.movements) {
    if (m.kind !== 'shot') continue;
    const n = -(Number(m.qty) || 0);
    const row = totals.get(m.caliber) ?? { caliber: m.caliber, total: 0, weapons: new Map() };
    row.total += n;
    row.weapons.set(m.weaponId ?? null, (row.weapons.get(m.weaponId ?? null) ?? 0) + n);
    totals.set(m.caliber, row);
  }
  return [...totals.values()]
    .map((row) => ({ ...row, weapons: [...row.weapons].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.total - a.total);
}

export function unitPrice(component) {
  const price = Number(component?.packPrice);
  const qty = Number(component?.packQty);
  return price > 0 && qty > 0 ? price / qty : 0;
}

export function recipeLines(state, recipe) {
  return recipe.items.map((item) => {
    const component = state.components.find((c) => c.id === item.componentId);
    const perRound = Number(item.perRound) || 0;
    return {
      component,
      perRound,
      cost: unitPrice(component) * perRound,
      perPack: perRound > 0 && component?.packQty ? Math.floor(component.packQty / perRound) : null,
      fromStock: perRound > 0 && component ? Math.floor(componentStock(state, component.id) / perRound) : null,
      noPrice: !(unitPrice(component) > 0),
    };
  });
}

export function recipeCost(state, recipe) {
  return recipeLines(state, recipe).reduce((sum, line) => sum + line.cost, 0);
}

/**
 * Середня ціна одного набою: покупки із сумою та спорядження за собівартістю.
 * Без таких рухів — собівартість рецепта, якщо набій самоспоряджений; інакше null.
 */
export function cartridgeUnitCost(state, id) {
  let money = 0;
  let qty = 0;
  for (const m of state.movements) {
    if (m.cartridgeId !== id || (m.kind !== 'buy' && m.kind !== 'reload') || !(Number(m.price) > 0) || !(m.qty > 0)) continue;
    money += Number(m.price);
    qty += Number(m.qty);
  }
  if (qty > 0) return money / qty;
  const recipe = state.recipes.find((r) => r.id === state.cartridges.find((c) => c.id === id)?.recipeId);
  return recipe ? recipeCost(state, recipe) || null : null;
}

/** Вартість пострілів: збережена при списанні, інакше за середньою ціною набою; null — невідомо. */
export function shotCost(state, m) {
  if (m.kind !== 'shot') return null;
  if (Number(m.price) > 0) return Number(m.price);
  const unit = m.cartridgeId ? cartridgeUnitCost(state, m.cartridgeId) : null;
  return unit ? -(Number(m.qty) || 0) * unit : null;
}

/** Сума вартості пострілів у списку рухів (лише відома). */
export function shotsCost(state, list) {
  return list.reduce((sum, m) => sum + (shotCost(state, m) ?? 0), 0);
}

/** Рядки рецепта, що обмежують спорядження (без гільз — вони багаторазові). */
function consumable(state, recipe) {
  return recipeLines(state, recipe).filter((l) => l.component && l.component.kind !== 'case' && l.fromStock !== null);
}

/** Скільки патронів можна спорядити з наявних компонентів. */
export function recipeEnough(state, recipe) {
  const limits = consumable(state, recipe).map((l) => Math.max(0, l.fromStock));
  return limits.length ? Math.min(...limits) : 0;
}

/** Компонент, який закінчиться першим. */
export function recipeBottleneck(state, recipe) {
  const lines = consumable(state, recipe);
  return lines.length ? lines.reduce((a, b) => (b.fromStock < a.fromStock ? b : a)).component : null;
}

/** На скільки патронів вистачить компонента в кожному рецепті, де він є. */
export function componentRunway(state, component) {
  const stock = componentStock(state, component.id);
  return state.recipes.flatMap((recipe) => recipe.items
    .filter((i) => i.componentId === component.id && Number(i.perRound) > 0)
    .map((i) => ({ recipe, rounds: Math.max(0, Math.floor(stock / Number(i.perRound))) })))
    .sort((a, b) => a.rounds - b.rounds);
}

/** Вартість залишку компонентів за ціною упаковки. */
export function stockValue(state) {
  return state.components.reduce((sum, c) => sum + Math.max(0, componentStock(state, c.id)) * unitPrice(c), 0);
}

export function calibers(state) {
  const set = new Set();
  for (const list of [state.weapons, state.cartridges, state.recipes]) {
    for (const x of list) if (x.caliber) set.add(x.caliber);
  }
  return [...set].sort(collate);
}

export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function byDateDesc(a, b) {
  return (b.date ?? '').localeCompare(a.date ?? '') || (b.created ?? 0) - (a.created ?? 0);
}
