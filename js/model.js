// Залишки й настріл не зберігаються — завжди рахуються з журналу рухів.
//
// movement: { id, batch, date, kind, qty, caliber, cartridgeId?, componentId?,
//             weaponId?, recipeId?, price?, note? }
//   kind: buy | shot | reload | consume | adjust
//   qty: зі знаком, у штуках патронів або в одиницях компонента.
//   shot без cartridgeId — історичний запис: рахується в настріл, але не в залишок БК.

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

export function shotsByCaliber(state) {
  const totals = new Map();
  for (const m of state.movements) {
    if (m.kind !== 'shot') continue;
    totals.set(m.caliber, (totals.get(m.caliber) ?? 0) - (Number(m.qty) || 0));
  }
  return [...totals].sort((a, b) => b[1] - a[1]);
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

/** Скільки патронів можна спорядити з наявних компонентів (без гільз — вони багаторазові). */
export function recipeEnough(state, recipe) {
  const limits = recipeLines(state, recipe)
    .filter((l) => l.component && l.component.kind !== 'case' && l.fromStock !== null)
    .map((l) => Math.max(0, l.fromStock));
  return limits.length ? Math.min(...limits) : 0;
}

export function calibers(state) {
  const set = new Set();
  for (const list of [state.weapons, state.cartridges, state.recipes]) {
    for (const x of list) if (x.caliber) set.add(x.caliber);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function byDateDesc(a, b) {
  return (b.date ?? '').localeCompare(a.date ?? '') || (b.created ?? 0) - (a.created ?? 0);
}
