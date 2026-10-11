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
