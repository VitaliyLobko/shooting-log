// Залишки й настріл не зберігаються — завжди рахуються з журналу рухів.
//
// movement: { id, batch, date, kind, qty, caliber, cartridgeId?, componentId?,
//             weaponId?, recipeId?, price?, note?, foreignWeapon?, foreignWeaponName?, foreignAmmo? }
//   kind: buy | shot | reload | consume | adjust
//   qty: зі знаком, у штуках патронів або в одиницях компонента.
//   shot без cartridgeId — історичний запис або чужі набої (foreignAmmo): рахується в настріл, але не в залишок БК.
//   foreignWeapon — стріляли з чужої зброї: у загальний настріл, але не в настріл своїх стволів.
// Підписи нижче — ключі перекладу, на екран вони йдуть через t().
import { collate } from './i18n.js';

export const KINDS = {
  buy: 'Покупка',
  shot: 'Стрельба',
  reload: 'Снаряжение',
  consume: 'Расход компонента',
  adjust: 'Корректировка',
  clean: 'Чистка',
  collect: 'Сбор гильз',
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
 * з інтервалом cleanEvery — після чистки набралося стільки пострілів або стрільб
 * (cleanUnit 'sessions'; стрільба — день, коли зі ствола стріляли). count — у тих самих одиницях.
 * Відстрочка cleanDelay (днів): reached — чистити вже треба, а due настає через стільки днів
 * після останньої стрільби (dueDate), якщо ствол так і не почистили.
 */
export function cleaningStatus(state, weapon) {
  const last = cleanings(state, weapon)[0] ?? null;
  const shots = state.movements.filter((m) => m.kind === 'shot' && m.weaponId === weapon.id && (!last || later(m, last)));
  const since = Math.max(0, -sumBy(shots, () => true));
  const dates = new Set(shots.map((m) => m.date ?? ''));
  const unit = weapon.cleanUnit === 'sessions' ? 'sessions' : 'shots';
  const count = unit === 'sessions' ? dates.size : since;
  const every = Number(weapon.cleanEvery) || 0;
  const delay = Number(weapon.cleanDelay) || 0;
  const lastShot = shots.map((m) => m.date).filter(Boolean).sort().pop() ?? null;
  const reached = every > 0 ? count >= every : since > 0;
  const dueDate = reached && delay && lastShot ? addDays(lastShot, delay) : null;
  const due = reached && (!dueDate || today() >= dueDate);
  return { last, since, dates, unit, count, every, delay, lastShot, reached, due, dueDate };
}

/** Дата 'YYYY-MM-DD' плюс n днів; рахунок в UTC, щоб перехід на літній час не зсував день. */
export function addDays(date, n) {
  const d = new Date(Date.parse(date) + n * 864e5);
  return d.toISOString().slice(0, 10);
}

/** Прицел для запису стрільби: позначений «за замовчуванням», а якщо прицел один — він. */
export function defaultScope(weapon) {
  const scopes = weapon?.scopes ?? [];
  return scopes.find((s) => s.default) ?? (scopes.length === 1 ? scopes[0] : null);
}

/**
 * Загальний настріл: усі записи стрільби (будь-який калібр, зі стволом чи без) і настріл до обліку.
 * Розбивка: foreign — з чужої зброї, noGun — ствол не вказано, own — свої стволи (з настрілом до обліку).
 */
export function totalShots(state) {
  const fired = -sumBy(state.movements, (m) => m.kind === 'shot');
  const initial = state.weapons.reduce((sum, w) => sum + (Number(w.initialShots) || 0), 0);
  const foreign = -sumBy(state.movements, (m) => m.kind === 'shot' && !m.weaponId && m.foreignWeapon);
  const noGun = -sumBy(state.movements, (m) => m.kind === 'shot' && !m.weaponId && !m.foreignWeapon);
  const total = fired + initial;
  return { fired, initial, total, foreign, noGun, own: total - foreign - noGun };
}

/**
 * Середній настріл за виїзд (день зі стрільбою) за останні last виїздів; pred відбирає записи.
 * null — менше двох виїздів, середнє ще нічого не каже.
 */
export function perSession(state, pred = () => true, last = 10) {
  const byDate = new Map();
  for (const m of state.movements) {
    if (m.kind !== 'shot' || !m.date || !pred(m)) continue;
    byDate.set(m.date, (byDate.get(m.date) ?? 0) - (Number(m.qty) || 0));
  }
  const days = [...byDate].sort((a, b) => b[0].localeCompare(a[0])).slice(0, last);
  if (days.length < 2) return null;
  const avg = days.reduce((sum, [, n]) => sum + n, 0) / days.length;
  return avg > 0 ? avg : null;
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

// Різні написання одного калібру: .223 Rem і 5.56×45, .308 Win і 7.62×51 тощо.
const CALIBER_SAME = [
  [/(^|[^\d.,])[.,]?(223|5[.,]56)/, '5.56x45'],
  [/(^|[^\d.,])[.,]?308|7[.,]62\s*[x×х*]\s*51/, '7.62x51'],
  [/7[.,]62\s*[x×х*]\s*39/, '7.62x39'],
  [/7[.,]62\s*[x×х*]\s*54/, '7.62x54'],
  [/5[.,]45/, '5.45x39'],
  [/9\s*[x×х*]\s*19|luger|para/, '9x19'],
  [/(^|[^\d])(12)\s*(кал|ga|g\b|калібр|$)/, '12ga'],
];

function caliberKey(caliber) {
  const c = String(caliber ?? '').toLowerCase().trim();
  return CALIBER_SAME.find(([re]) => re.test(c))?.[1] ?? c.replace(/[\s.]+/g, '');
}

/** Той самий калібр з урахуванням різних написань; без калібру — підходить до будь-якого. */
export function sameCaliber(a, b) {
  return !a || !b || caliberKey(a) === caliberKey(b);
}

/** Настріл із журналу: калібр → загалом і по кожному стволу (null — ствол не вказано, 'foreign:Назва' — чужа зброя). */
export function shotsByCaliber(state) {
  const totals = new Map();
  for (const m of state.movements) {
    if (m.kind !== 'shot') continue;
    const n = -(Number(m.qty) || 0);
    const row = totals.get(m.caliber) ?? { caliber: m.caliber, total: 0, weapons: new Map() };
    row.total += n;
    const gun = m.weaponId ?? (m.foreignWeapon ? `foreign:${m.foreignWeaponName?.trim() ?? ''}` : null);
    row.weapons.set(gun, (row.weapons.get(gun) ?? 0) + n);
    totals.set(m.caliber, row);
  }
  return [...totals.values()]
    .map((row) => ({ ...row, weapons: [...row.weapons].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.total - a.total);
}

/** Ціна за одиницю з картки компонента: ціна упаковки / кількість у ній. */
export function packUnitPrice(component) {
  const price = Number(component?.packPrice);
  const qty = Number(component?.packQty);
  return price > 0 && qty > 0 ? price / qty : 0;
}

/**
 * Ціна компонента за одиницю: середня за покупками із сумою (скільки реально заплатив),
 * без таких покупок — за ціною упаковки з картки.
 */
export function unitPrice(state, component) {
  if (!component) return 0;
  let money = 0;
  let qty = 0;
  for (const m of state.movements) {
    if (m.kind !== 'buy' || m.componentId !== component.id || !(Number(m.price) > 0) || !(m.qty > 0)) continue;
    money += Number(m.price);
    qty += m.qty;
  }
  return qty > 0 ? money / qty : packUnitPrice(component);
}

/** Навеска пороху в гранах: 1 gr = 0,06479891 г. */
export const GRAIN = 0.06479891;

export function recipeLines(state, recipe) {
  return recipe.items.map((item) => {
    const component = state.components.find((c) => c.id === item.componentId);
    const perRound = Number(item.perRound) || 0;
    const price = unitPrice(state, component);
    return {
      component,
      perRound,
      grains: item.grains ? perRound / GRAIN : null,
      cost: price * perRound,
      perPack: perRound > 0 && component?.packQty ? Math.floor(component.packQty / perRound) : null,
      fromStock: perRound > 0 && component ? Math.floor(componentStock(state, component.id) / perRound) : null,
      noPrice: !(price > 0),
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
  return recipeLines(state, recipe).filter((l) => l.component && l.fromStock !== null);
}

/** Гільза рецепта (перший компонент типу «гільза») або null. */
export function recipeCase(state, recipe) {
  return recipe?.items.map((i) => state.components.find((c) => c.id === i.componentId)).find((c) => c?.kind === 'case') ?? null;
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
  return state.components.reduce((sum, c) => sum + Math.max(0, componentStock(state, c.id)) * unitPrice(state, c), 0);
}

// ---------- кучність ----------

// 1 MOA на 100 м ≈ 29,09 мм (на 1 м — 0,2909 мм), 1 мрад на 100 м = 100 мм.
const MM_PER_MOA_AT_1M = 0.29089;

/** Відрізок mm мм на дистанції distance м → MOA або мрад; null без дистанції. */
export function toAngle(mm, distance, unit) {
  if (!(distance > 0)) return null;
  return unit === 'moa' ? mm / (distance * MM_PER_MOA_AT_1M) : mm / distance;
}

/** Ціна клацання з ключа виду 'mil0.1', 'moa0.25' чи 'mm13' (мм на 100 м — у мрад, 13 мм = 0,13 мрад). */
export function clickValue(key) {
  const m = /^(mil|moa|mm)([\d.]+)$/.exec(key ?? '');
  if (!m) return null;
  return m[1] === 'mm' ? { unit: 'mil', value: Number(m[2]) / 100 } : { unit: m[1], value: Number(m[2]) };
}

// ---------- таймер ----------

/**
 * Підсумок серії таймера; shots — секунди від сигналу. first — реакція й перший постріл, total — останній,
 * splits — інтервали між сусідніми, avg — середній інтервал, best — найкоротший.
 */
/**
 * Серія хронографа, м/с: середня, мін і макс, ES (найшвидший мінус найповільніший) і SD — вибіркове (n − 1),
 * як рахують хронографи; з одного пострілу SD немає.
 */
export function chronoStats(speeds) {
  const list = (speeds ?? []).filter((v) => v > 0);
  const n = list.length;
  if (!n) return { n: 0, avg: null, min: null, max: null, es: null, sd: null };
  const avg = list.reduce((sum, v) => sum + v, 0) / n;
  const [min, max] = [Math.min(...list), Math.max(...list)];
  const sd = n > 1 ? Math.sqrt(list.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (n - 1)) : null;
  return { n, avg, min, max, es: max - min, sd };
}

/**
 * Швидкості з тексту. Роздільники — пробіл, новий рядок, «;» і кома; але «812,5» (одна-дві цифри після коми) —
 * десятковий дріб, бо в українській розкладці дріб пишуть через кому.
 */
export function parseSpeeds(text) {
  return String(text ?? '').trim().split(/[\s;]+/)
    .flatMap((part) => (/^\d+,\d{1,2}$/.test(part) ? [part.replace(',', '.')] : part.split(',')))
    .filter(Boolean).map(Number);
}

export function drillStats(shots) {
  const list = [...(shots ?? [])].sort((a, b) => a - b);
  const splits = list.slice(1).map((x, i) => x - list[i]);
  return {
    n: list.length,
    first: list[0] ?? null,
    total: list.at(-1) ?? null,
    splits,
    best: splits.length ? Math.min(...splits) : null,
    avg: splits.length ? (list.at(-1) - list[0]) / splits.length : null,
  };
}

// ---------- DOPE ----------

/**
 * Кут у мрад з одиниць unit: 'mil', 'moa', 'cm' (на дистанції distance) або ключ ціни клацання ('mil0.1',
 * 'moa0.25', 'mm13') — тоді value є кількістю клацань. null — не перевести (см без дистанції, невідомий ключ).
 */
export function toMrad(value, unit, distance) {
  if (unit === 'mil') return value;
  if (unit === 'moa') return value * MM_PER_MOA_AT_1M;
  if (unit === 'cm') return distance > 0 ? (value * 10) / distance : null;
  const c = clickValue(unit);
  return c ? toMrad(value * c.value, c.unit, distance) : null;
}

/** Обернене до toMrad: мрад → одиниці unit (для ключа клацання — дробова кількість клацань). */
export function fromMrad(mrad, unit, distance) {
  if (unit === 'mil') return mrad;
  if (unit === 'moa') return mrad / MM_PER_MOA_AT_1M;
  if (unit === 'cm') return distance > 0 ? (mrad * distance) / 10 : null;
  const c = clickValue(unit);
  return c ? fromMrad(mrad, c.unit, distance) / c.value : null;
}

/**
 * Рядки DOPE за дистанцією; дистанція пристрілки прицілу — рядок з нулем, якщо його не вписали
 * (zero: true — щоб показати, що він не з таблиці).
 */
export function dopeRows(rows, zero = null) {
  const list = [...(rows ?? [])];
  if (zero > 0 && !list.some((r) => r.distance === zero)) list.push({ distance: zero, mrad: 0, zero: true });
  return list.sort((a, b) => a.distance - b.distance);
}

/**
 * Поправка на довільну дистанцію: лінійно між сусідніми рядками. За межами таблиці — null:
 * траєкторія не пряма, тож вгадувати далі останнього рядка не беремося.
 */
export function dopeAt(rows, distance, zero = null) {
  return lerpAt(dopeRows(rows, zero), distance, 'mrad');
}

/**
 * Знос вітром на довільну дистанцію, мрад (за швидкості, на яку складена колонка, вітер збоку):
 * лінійно між рядками з вітром, від нуля біля дула; далі останнього рядка — null.
 */
export function windAt(rows, distance) {
  const list = (rows ?? []).filter((r) => r.wind > 0).sort((a, b) => a.distance - b.distance);
  return list.length ? lerpAt([{ distance: 0, wind: 0 }, ...list], distance, 'wind') : null;
}

/** Частка бокового вітру за годинником: 3 і 9 — повний, 12 і 6 — нуль. */
export const windShare = (clock) => Math.abs(Math.sin((clock * Math.PI) / 6));

function lerpAt(list, distance, key) {
  const exact = list.find((r) => r.distance === distance);
  if (exact) return exact[key];
  for (let i = 1; i < list.length; i += 1) {
    const [a, b] = [list[i - 1], list[i]];
    if (a.distance < distance && distance < b.distance) return a[key] + ((b[key] - a[key]) * (distance - a.distance)) / (b.distance - a.distance);
  }
  return null;
}

/** Масштаб фото мішені, мм на піксель: дві точки (частки ширини й висоти) і відстань між ними. */
export function mmPerPx(scale, photo) {
  if (!scale?.a || !scale?.b || !(scale.mm > 0) || !photo?.w || !photo?.h) return null;
  const d = Math.hypot((scale.a[0] - scale.b[0]) * photo.w, (scale.a[1] - scale.b[1]) * photo.h);
  return d > 0 ? scale.mm / d : null;
}

/**
 * Масштаб по осях, мм на піксель: { x, y, two }. Одна лінія — однаковий по обох осях. Друга, поперечна,
 * рахує висоту окремо (фото під кутом стискає мішень по одній осі): для лінії з проєкціями dx, dy
 * і довжиною L маємо L² = x²·dx² + y²·dy², дві лінії — система з двох рівнянь. two — другу лінію враховано.
 */
export function scaleXY(scale, scale2, photo) {
  const k = mmPerPx(scale, photo);
  if (!k) return null;
  const same = { x: k, y: k, two: false };
  if (!mmPerPx(scale2, photo)) return same;
  const line = (s) => [((s.a[0] - s.b[0]) * photo.w) ** 2, ((s.a[1] - s.b[1]) * photo.h) ** 2, s.mm ** 2];
  const [x1, y1, l1] = line(scale);
  const [x2, y2, l2] = line(scale2);
  const det = x1 * y2 - x2 * y1;
  // лінії майже паралельні — друга нічого не уточнює
  if (Math.abs(det) < 0.1 * (x1 + y1) * (x2 + y2)) return same;
  const xx = (l1 * y2 - l2 * y1) / det;
  const yy = (x1 * l2 - x2 * l1) / det;
  return xx > 0 && yy > 0 ? { x: Math.sqrt(xx), y: Math.sqrt(yy), two: true } : same;
}

/**
 * Купчастість групи за центрами пробоїн, усе в мм: розкид (найбільша відстань між центрами),
 * середній радіус від СТП і габарит (ширина × висота). offset — СТП від точки прицілювання:
 * x — праворуч, y — вгору (на фото y росте вниз).
 */
export function groupStats(points, aim = null) {
  const n = points.length;
  if (!n) return null;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;
  let spread = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) spread = Math.max(spread, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    n,
    center: [cx, cy],
    spread,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    meanRadius: points.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n,
    offset: aim ? [cx - aim[0], aim[1] - cy] : null,
  };
}

/** Статистика кожної групи мішені; stats null — немає масштабу або пробоїн. */
export function targetStats(target, photo) {
  const k = scaleXY(target.scale, target.scale2, photo);
  const toMm = (p) => [p[0] * photo.w * k.x, p[1] * photo.h * k.y];
  const aim = k && target.poa ? toMm(target.poa) : null;
  return (target.groups ?? []).map((g, index) => ({
    index, holes: g.holes, stats: k && g.holes.length ? groupStats(g.holes.map(toMm), aim) : null,
  }));
}

/**
 * Поправка середнього радіуса на кількість пострілів. СТВ рахується з тих самих пробоїн, що й радіуси,
 * тому вибіркове середнє занижує справжнє розсіювання: група з 3 пострілів виглядає приблизно
 * на 17% кучнішою за групу з 10 того самого набою. Множник √(n/(n−1)) це прибирає, і групи
 * з різною кількістю пострілів стають порівнянними (перевірено симуляцією на 20 000 групах).
 */
export const mrBias = (n) => (n > 1 ? Math.sqrt(n / (n - 1)) : 1);

/** Найменше пробоїн у групі, щоб порівнювати набої: з двох розмах — випадковість. */
export const PRECISION_MIN_HOLES = 3;

/**
 * Кучність набоїв одного ствола за розміченими мішенями. Мішені на різних дистанціях зводяться до 100 м
 * (кут той самий: мм × 100 / дистанція), тож усі розміри — мм на 100 м. Для кожного набою:
 * { cartridgeId, groups, shots, meanRadius, best, offset, targets }; meanRadius — зважений за пострілами
 * і виправлений на малу вибірку (див. mrBias),
 * best — найменший розмах, offset — середнє зміщення СТП [x праворуч, y вгору] або null.
 * Порядок — за середнім радіусом: він бере всі пробоїни, а не дві крайні, і менше залежить від кількості
 * пострілів у групі, ніж розмах.
 */
export function ammoPrecision(targets, photos) {
  const byCartridge = new Map();
  for (const tg of targets) {
    const photo = photos.find((p) => p.id === tg.photoId);
    if (!tg.cartridgeId || !(tg.distance > 0) || !photo) continue;
    const k = 100 / tg.distance;
    for (const g of targetStats(tg, photo)) {
      if (!g.stats || g.stats.n < PRECISION_MIN_HOLES) continue;
      const row = byCartridge.get(tg.cartridgeId) ?? { cartridgeId: tg.cartridgeId, list: [], targets: new Set() };
      row.list.push({ ...g.stats, k });
      row.targets.add(tg.id);
      byCartridge.set(tg.cartridgeId, row);
    }
  }
  const avg = (list, fn) => list.reduce((s, x) => s + fn(x), 0) / list.length;
  // Групи зважуємо за кількістю пострілів: десятка знає про набій більше, ніж трійка.
  const weighted = (list, fn) => list.reduce((s, x) => s + fn(x) * x.n, 0) / list.reduce((s, x) => s + x.n, 0);
  return [...byCartridge.values()].map(({ cartridgeId, list, targets: ids }) => {
    const shifted = list.filter((s) => s.offset);
    return {
      cartridgeId,
      groups: list.length,
      shots: list.reduce((s, x) => s + x.n, 0),
      meanRadius: weighted(list, (s) => s.meanRadius * mrBias(s.n) * s.k),
      best: Math.min(...list.map((s) => s.spread * s.k)),
      offset: shifted.length ? [avg(shifted, (s) => s.offset[0] * s.k), avg(shifted, (s) => s.offset[1] * s.k)] : null,
      targets: [...ids],
    };
  }).sort((a, b) => a.meanRadius - b.meanRadius);
}

// ---------- ряди для графіків ----------

/** Результати вправи за датами, від старих до нових: [{ date, value }]. */
export function scoreSeries(scores, exerciseId) {
  return scores.filter((s) => s.exercise === exerciseId && s.date)
    .map((s) => ({ date: s.date, value: Number(s.score) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Купчастість ствола за датами: середній радіус груп кожної мішені, зведений до 100 м.
 * Менше — краще. Групи менші за PRECISION_MIN_HOLES не рахуються, мішені без дистанції й фото — теж.
 */
export function precisionSeries(targets, photos, weaponId) {
  const rows = [];
  for (const tg of targets) {
    if (tg.weaponId !== weaponId || !(tg.distance > 0) || !tg.date) continue;
    const photo = photos.find((p) => p.id === tg.photoId);
    if (!photo) continue;
    const groups = targetStats(tg, photo).filter((g) => g.stats && g.stats.n >= PRECISION_MIN_HOLES);
    if (!groups.length) continue;
    const k = 100 / tg.distance;
    rows.push({
      date: tg.date,
      // Та сама поправка, що й у порівнянні набоїв, інакше точки графіка стрибали б від кількості пострілів.
      value: groups.reduce((sum, g) => sum + g.stats.meanRadius * mrBias(g.stats.n) * g.stats.n * k, 0)
        / groups.reduce((sum, g) => sum + g.stats.n, 0),
      cartridgeId: tg.cartridgeId ?? null,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Постріли й гроші по місяцях: [{ key: '2026-10', shots, cost }], останні limit місяців із записами. */
/** list — рухи, які потрапили у фільтри журналу; ціни однаково беруться з усього обліку. */
/** Настріл і вартість за періодами: keyOf(date) — ключ періоду, що сортується як рядок; останні limit періодів. */
export function shotsByPeriod(state, keyOf, limit = 12, list = state.movements) {
  const map = new Map();
  for (const m of list) {
    if (m.kind !== 'shot' || !m.date) continue;
    const key = keyOf(m.date);
    const row = map.get(key) ?? { key, shots: 0, cost: 0 };
    row.shots += -(Number(m.qty) || 0);
    row.cost += shotCost(state, m) ?? 0;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-limit);
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

// ---------- дозвіл на зброю ----------

/**
 * Строк дії дозволу на сьогодні або null без дати «діє до». days — днів до кінця (0 — останній день,
 * менше — прострочено), months — цілих місяців до кінця, level — over (менше місяця або вже скінчився),
 * warn (1–3 місяці), ok (від 3), left — яка частка строку ще лишилася (від дати видачі; без неї — від року).
 */
export function permitStatus(permit, day = today()) {
  if (!permit?.expires) return null;
  const end = Date.parse(permit.expires);
  const now = Date.parse(day);
  const plus = (n) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
  let months = 0;
  while (months < 600 && plus(months + 1) <= end) months += 1;
  const start = permit.issued ? Date.parse(permit.issued) : end - 365 * 86_400_000;
  return {
    days: Math.round((end - now) / 86_400_000),
    months,
    level: end < plus(1) ? 'over' : end < plus(3) ? 'warn' : 'ok',
    left: Math.max(0, Math.min(1, (end - now) / Math.max(1, end - start))),
  };
}

/** Набій, яким востаннє стріляли з цього ствола: ним і підставляємо списання у вправах. */
export function lastAmmo(state, weaponId) {
  if (!weaponId) return null;
  const shots = state.movements.filter((m) => m.kind === 'shot' && m.weaponId === weaponId && m.cartridgeId);
  return shots.sort(byDateDesc)[0]?.cartridgeId ?? null;
}

export function byDateDesc(a, b) {
  return (b.date ?? '').localeCompare(a.date ?? '') || (b.created ?? 0) - (a.created ?? 0);
}
