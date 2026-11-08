// Unit-тести js/model.js shooting-log: облік БК і грошей, чистка, дозвіл, хронограф, DOPE, кучність.
// Очікування пораховані вручну під кожен сценарій. Запуск:
//   node --test ".github/tests/*.test.mjs"   (з кореня репо; так само в release.py і pages.yml)
//   SL_DIR=<копія репо> — перевірити іншу копію (мутаційна перевірка)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = process.env.SL_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const M = await import(pathToFileURL(`${DIR}/js/model.js`).href);
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} проти ${b} (допуск ${tol})`);

// ---------- облік: набої, компоненти, гроші ----------

let seq = 0;
const mv = (o) => ({ id: `m${++seq}`, created: seq, ...o });
function shop() {
  return {
    weapons: [{ id: 'w1', name: 'AR', caliber: '5.56x45', initialShots: 100 }],
    cartridges: [{ id: 'c1', caliber: '5.56x45' }, { id: 'c2', caliber: '.308 Win', recipeId: 'r1' }],
    components: [
      { id: 'b', kind: 'bullet', packQty: 100, packPrice: 1000 },
      { id: 'p', kind: 'powder', packQty: 454, packPrice: 4540 },
      { id: 'pr', kind: 'primer', packQty: 1000, packPrice: 3000 },
      { id: 'cs', kind: 'case', packQty: 100, packPrice: 2000 },
    ],
    recipes: [{ id: 'r1', cartridgeId: 'c2', caliber: '.308 Win', items: [
      { componentId: 'b', perRound: 1 }, { componentId: 'p', perRound: 2.9 },
      { componentId: 'pr', perRound: 1 }, { componentId: 'cs', perRound: 1 }] }],
    movements: [
      mv({ kind: 'buy', cartridgeId: 'c1', caliber: '5.56x45', qty: 100, price: 2000, date: '2026-01-10' }),
      mv({ kind: 'buy', cartridgeId: 'c1', caliber: '5.56x45', qty: 50, price: 1500, date: '2026-02-01' }),
      mv({ kind: 'shot', cartridgeId: 'c1', weaponId: 'w1', caliber: '5.56x45', qty: -30, date: '2026-02-05' }),
      mv({ kind: 'shot', cartridgeId: 'c1', weaponId: 'w1', caliber: '5.56x45', qty: -20, date: '2026-02-05' }),
      mv({ kind: 'shot', cartridgeId: 'c1', weaponId: null, foreignWeapon: true, foreignWeaponName: ' Друг AR ', caliber: '5.56x45', qty: -10, date: '2026-03-01' }),
      mv({ kind: 'shot', cartridgeId: null, weaponId: null, caliber: '5.56x45', qty: -5, date: '2026-03-02' }),
      mv({ kind: 'adjust', cartridgeId: 'c1', qty: -2, date: '2026-03-03' }),
      mv({ kind: 'buy', componentId: 'b', qty: 100, price: 1200, date: '2026-01-01' }),
      mv({ kind: 'adjust', componentId: 'p', qty: 454, date: '2026-01-01' }),
      mv({ kind: 'buy', componentId: 'pr', qty: 1000, price: 2500, date: '2026-01-01' }),
      mv({ kind: 'adjust', componentId: 'cs', qty: 50, date: '2026-01-01' }),
    ],
  };
}

test('облік набоїв: залишок і настріл ствола', () => {
  const s = shop();
  assert.equal(M.cartridgeStock(s, 'c1'), 100 + 50 - 30 - 20 - 10 - 2, 'історичний постріл без набою в залишок не йде');
  assert.equal(M.weaponShots(s, s.weapons[0]), 100 + 50, 'настріл до обліку + свої постріли, без чужої зброї');
});

test('облік набоїв: загальний настріл і розбивка', () => {
  assert.deepEqual(M.totalShots(shop()), { fired: 65, initial: 100, total: 165, foreign: 10, noGun: 5, own: 150 });
});

test('облік набоїв: настріл за калібрами й стволами', () => {
  const [row, ...rest] = M.shotsByCaliber(shop());
  assert.equal(rest.length, 0);
  assert.equal(row.total, 65);
  assert.deepEqual(row.weapons, [['w1', 50], ['foreign:Друг AR', 10], [null, 5]], 'назва чужої зброї обрізана');
});

test('облік набоїв: написання калібру зводиться, а .223 і 5.56 — різні патрони', () => {
  const shot = (caliber, qty, weaponId = 'w1') => ({ kind: 'shot', caliber, qty: -qty, weaponId });
  const rows = M.shotsByCaliber({ movements: [shot('5.56x45', 20), shot('5.56×45', 5, 'w2'), shot(' 5,56 Х 45 ', 1),
    shot('.223 Rem', 10), shot('.223 rem', 2), shot('', 3), shot(undefined, 4)] });
  assert.deepEqual(rows.map((r) => [r.caliber, r.total]), [['5.56x45', 26], ['.223 Rem', 12], ['', 7]],
    'підпис — написання з найбільшим настрілом');
  assert.deepEqual(rows[0].weapons, [['w1', 21], ['w2', 5]]);
});

test('гроші: середня ціна набою за покупками й вартість пострілів', () => {
  const s = shop();
  near(M.cartridgeUnitCost(s, 'c1'), 3500 / 150, 1e-9, 'зважена за кількістю, не середнє двох цін');
  const [, , a, b, foreign, history] = s.movements;
  near(M.shotCost(s, a), 30 * 3500 / 150, 1e-9, 'постріл без збереженої ціни');
  near(M.shotCost(s, foreign), 10 * 3500 / 150, 1e-9, 'чужа зброя, свій набій — гроші ваші');
  assert.equal(M.shotCost(s, history), null, 'без набою ціни немає');
  assert.equal(M.shotCost(s, { kind: 'shot', qty: -25, price: 425 }), 425, 'збережена при списанні ціна головніша');
  assert.equal(M.shotCost(s, s.movements[0]), null, 'покупка — не постріл');
  near(M.shotsCost(s, [a, b, foreign, history]), 60 * 3500 / 150, 1e-9, 'невідома ціна не ламає суму');
});

test('гроші: ціна компонента — за покупками, без них — з упаковки', () => {
  const s = shop();
  const [b, p, pr, cs] = s.components;
  assert.equal(M.unitPrice(s, b), 12, 'заплатив 1200 за 100, хоч упаковка за картою по 10');
  assert.equal(M.unitPrice(s, p), 10, 'adjust без ціни — ціна з упаковки 4540/454');
  assert.equal(M.unitPrice(s, pr), 2.5);
  assert.equal(M.unitPrice(s, cs), 20);
  assert.equal(M.packUnitPrice({ packPrice: 100 }), 0, 'без кількості в упаковці — 0, не Infinity');
  assert.equal(M.unitPrice(s, null), 0);
  const str = { movements: [{ kind: 'buy', componentId: 'x', qty: '100', price: 1200 }, { kind: 'buy', componentId: 'x', qty: '50', price: '900' }] };
  assert.equal(M.unitPrice(str, { id: 'x' }), 2100 / 150, 'кількість рядком (старий імпорт) — не склеюється в «10050»');
});

test('спорядження: собівартість рецепта, на скільки вистачить, що скінчиться першим', () => {
  const s = shop();
  const r = s.recipes[0];
  near(M.recipeCost(s, r), 12 + 10 * 2.9 + 2.5 + 20, 1e-9, 'куля + порох + капсуль + гільза');
  near(M.cartridgeUnitCost(s, 'c2'), 63.5, 1e-9, 'самоспоряджений без спорядження — за рецептом');
  assert.equal(M.recipeEnough(s, r), 50, 'гільз 50 — менше за все інше');
  assert.equal(M.recipeBottleneck(s, r).id, 'cs');
  assert.deepEqual(M.componentRunway(s, s.components[1]).map((x) => x.rounds), [Math.floor(454 / 2.9)]);
  near(M.stockValue(s), 100 * 12 + 454 * 10 + 1000 * 2.5 + 50 * 20, 1e-9, 'вартість складу');
  s.movements.push(mv({ kind: 'reload', cartridgeId: 'c2', qty: 20, price: 20 * 70, date: '2026-04-01' }));
  near(M.cartridgeUnitCost(s, 'c2'), 70, 1e-9, 'після спорядження — за збереженою собівартістю');
});

test('статистика: середній настріл за виїзд і за місяцями', () => {
  const s = shop();
  near(M.perSession(s), 65 / 3, 1e-9, 'три дні зі стрільбою');
  assert.equal(M.perSession({ movements: s.movements.slice(0, 4) }), null, 'один виїзд — середнього ще немає');
  const months = M.shotsByPeriod(s, (d) => d.slice(0, 7));
  assert.deepEqual(months.map((r) => [r.key, r.shots]), [['2026-02', 50], ['2026-03', 15]]);
  near(months[0].cost, 50 * 3500 / 150, 1e-9, 'гроші за лютий');
  assert.equal(M.shotsByPeriod(s, (d) => d.slice(0, 7), 1).length, 1, 'ліміт — останні періоди');
});

// ---------- чистка ----------

test('чистка: стрільби після останньої чистки, у той самий день — за часом створення', () => {
  const w = { id: 'w1', cleanEvery: 2, cleanUnit: 'sessions' };
  const s = { movements: [
    { kind: 'shot', weaponId: 'w1', qty: -10, date: '2026-01-01', created: 1 },
    { kind: 'shot', weaponId: 'w1', qty: -10, date: '2026-01-05', created: 2 },
    { kind: 'clean', weaponId: 'w1', qty: 0, date: '2026-01-05', created: 3 },
    { kind: 'shot', weaponId: 'w1', qty: -15, date: '2026-01-10', created: 4 },
  ] };
  let st = M.cleaningStatus(s, w);
  assert.equal(st.last.date, '2026-01-05');
  assert.deepEqual([st.count, st.since, st.reached, st.due], [1, 15, false, false]);
  s.movements.push({ kind: 'shot', weaponId: 'w1', qty: -5, date: '2026-01-12', created: 5 });
  st = M.cleaningStatus(s, w);
  assert.deepEqual([st.count, st.reached, st.due], [2, true, true]);
  st = M.cleaningStatus(s, { ...w, cleanUnit: 'shots', cleanEvery: 100 });
  assert.deepEqual([st.unit, st.count, st.reached], ['shots', 20, false]);
});

test('чистка: відстрочка в днях від останньої стрільби', () => {
  const w = { id: 'w1', cleanEvery: 1, cleanUnit: 'sessions', cleanDelay: 3 };
  const today = M.today();
  let st = M.cleaningStatus({ movements: [{ kind: 'shot', weaponId: 'w1', qty: -1, date: today, created: 1 }] }, w);
  assert.deepEqual([st.reached, st.due, st.dueDate], [true, false, M.addDays(today, 3)]);
  st = M.cleaningStatus({ movements: [{ kind: 'shot', weaponId: 'w1', qty: -1, date: '2020-01-01', created: 1 }] }, w);
  assert.equal(st.due, true, 'відстрочка давно минула');
  assert.equal(M.cleanings({ movements: [] }, { id: 'w1', cleanedDate: '2025-05-05' })[0].legacy, true, 'позначка з версій до 0.4');
  assert.equal(M.addDays('2026-03-28', 2), '2026-03-30', 'перехід на літній час не зсуває день');
});

// ---------- дозвіл ----------

test('дозвіл: днів і місяців до кінця, рівень', () => {
  const p = { expires: '2027-01-15', issued: '2022-01-15' };
  const st = M.permitStatus(p, '2026-11-08');
  assert.deepEqual([st.days, st.months, st.level], [68, 2, 'warn']);
  near(st.left, 68 / (Date.parse('2027-01-15') - Date.parse('2022-01-15')) * 86_400_000, 1e-9, 'частка строку');
  assert.equal(M.permitStatus(p, '2027-01-15').level, 'over', 'останній день');
  assert.deepEqual([M.permitStatus(p, '2027-02-01').days < 0, M.permitStatus(p, '2027-02-01').left], [true, 0]);
  assert.equal(M.permitStatus(p, '2026-06-01').level, 'ok');
  assert.equal(M.permitStatus({}, '2026-11-08'), null);
});

// ---------- хронограф, таймер, буфер ----------

test('хронограф: середня, ES і вибіркове SD', () => {
  assert.deepEqual(M.chronoStats([800, 810, 820, 0, -5]), { n: 3, avg: 810, min: 800, max: 820, es: 20, sd: 10 });
  assert.equal(M.chronoStats([800]).sd, null, 'з одного пострілу SD немає');
  assert.equal(M.chronoStats(null).n, 0);
});

test('хронограф: швидкості з тексту — кома і дріб, і роздільник', () => {
  assert.deepEqual(M.parseSpeeds('812,5 815,3'), [812.5, 815.3]);
  assert.deepEqual(M.parseSpeeds('812,815,820'), [812, 815, 820]);
  assert.deepEqual(M.parseSpeeds('812; 815\n820'), [812, 815, 820]);
  assert.deepEqual(M.parseSpeeds('812, 815'), [812, 815]);
  assert.deepEqual(M.parseSpeeds(''), []);
});

test('таймер: перший постріл, інтервали', () => {
  const d = M.drillStats([1.2, 0.8, 2.0]);
  assert.deepEqual([d.n, d.first, d.total], [3, 0.8, 2.0]);
  near(d.best, 0.4, 1e-12, 'найкоротший інтервал'); near(d.avg, 0.6, 1e-12, 'середній інтервал');
  assert.equal(M.drillStats([]).first, null);
});

test('таблиця з буфера: табуляція, «;», CSV, кома в дробі, мінус', () => {
  const rows = M.parseTable('Дистанція\tПоправка\n100\t0\n200\t1,2\n300;2,5;0,4\n400,3.9,0.6\n500\t−0,5\nбез дистанції 7');
  assert.deepEqual(rows, [[100, 0], [200, 1.2], [300, 2.5, 0.4], [400, 3.9, 0.6], [500, -0.5]]);
});

test('таблиця «Стрільця»: см точніші за MRAD, вітер лише боковий без деривації', () => {
  const table = (meta) => ({
    labels: ['Дистанція, м', 'Вертикальна поправка, см', 'Вертикальна поправка, MRAD', 'Горизонтальна поправка, см'],
    meta: { 'Швидкість вітру': '4 м/с', 'Напрямок вітру': '90°', 'Деривація': 'OFF', 'Температура': '15',
      'Висота оптичного прицілу': '7 см', ...meta },
    rows: [[100, 0, 0, 1.5], [200, -12.3, -0.6, 6.0], [300.4, -40.5, -1.4, -14.2]],
  });
  const d = M.striletsDope(table({}));
  assert.equal(d.unit, 'cm');
  assert.deepEqual(d.rows, [{ distance: 100, value: 0, wind: 1.5 }, { distance: 200, value: -12.3, wind: 6 }, { distance: 300, value: -40.5, wind: 14.2 }]);
  assert.deepEqual([d.windSpeed, d.zero, d.sh, d.tC, d.windSkipped], [4, 100, 7, 15, null]);
  assert.equal(M.striletsDope(table({ 'Деривація': 'ON' })).windSkipped, 'derivation');
  assert.equal(M.striletsDope(table({ 'Напрямок вітру': '45°' })).windSkipped, 'angle');
  assert.equal(M.striletsDope(table({ 'Швидкість вітру': '0' })).windSkipped, 'calm');
  assert.equal(M.striletsDope({ labels: ['Щось'], meta: {}, rows: [] }), null, 'не таблиця Стрільця');
});

// ---------- кути, кліки, DOPE ----------

test('кути: MOA, мрад, см на дистанції, кліки', () => {
  near(M.toMrad(1, 'moa'), Math.PI / 10.8, 1e-5, '1 MOA у мрад');
  assert.equal(M.toMrad(10, 'cm', 100), 1, '10 см на 100 м = 1 мрад');
  near(M.toMrad(3, 'mil0.1'), 0.3, 1e-12, '3 кліки по 0,1');
  near(M.toMrad(4, 'moa0.25'), M.toMrad(1, 'moa'), 1e-12, '4 кліки по ¼ MOA');
  near(M.toMrad(10, 'mm13'), 1.3, 1e-12, '10 кліків по 13 мм на 100 м');
  assert.equal(M.toMrad(1, 'cm', 0), null);
  assert.equal(M.toMrad(1, 'bad'), null);
  for (const [u, d] of [['mil'], ['moa'], ['cm', 300], ['mil0.1'], ['moa0.25'], ['mm13'], ['moa0.125']]) {
    near(M.toMrad(M.fromMrad(1.37, u, d), u, d), 1.37, 1e-12, `туди-назад ${u}`);
  }
  near(M.toAngle(29.089, 100, 'moa'), 1, 1e-4, 'мм → MOA');
  assert.equal(M.toAngle(100, 100, 'mil'), 1);
  assert.equal(M.toAngle(100, 0, 'mil'), null);
  assert.deepEqual(M.clickValue('mm13'), { unit: 'mil', value: 0.13 });
});

test('DOPE: лінійно між рядками, нуль пристрілки, за межами — null', () => {
  const rows = [{ distance: 200, mrad: 1 }, { distance: 300, mrad: 2.4 }];
  near(M.dopeAt(rows, 150, 100), 0.5, 1e-12, 'між нулем і 200');
  near(M.dopeAt(rows, 250, 100), 1.7, 1e-12);
  assert.equal(M.dopeAt(rows, 100, 100), 0, 'дистанція пристрілки');
  assert.equal(M.dopeAt(rows, 350, 100), null, 'далі таблиці не вгадуємо');
  assert.equal(M.dopeAt(rows, 50, 100), null, 'ближче за нуль теж');
  assert.equal(M.dopeRows(rows, 100)[0].zero, true);
  assert.equal(M.dopeRows([{ distance: 100, mrad: 0.1 }], 100).length, 1, 'вписаний рядок не дублюємо');
  const wind = [{ distance: 100, wind: 0.3 }, { distance: 300, wind: 1.1 }, { distance: 400 }];
  near(M.windAt(wind, 50), 0.15, 1e-12, 'від нуля біля дула');
  near(M.windAt(wind, 200), 0.7, 1e-12);
  assert.equal(M.windAt(wind, 400), null, 'рядок без вітру не продовжує колонку');
  assert.deepEqual([M.windShare(3), M.windShare(9)], [1, 1]);
  near(M.windShare(12), 0, 1e-12); near(M.windShare(1.5), Math.SQRT1_2, 1e-12);
});

test('глушник: поправка назустріч зсуву', () => {
  const sh = { x: 0.1, y: 0.2 };
  assert.deepEqual(M.suppressorFix(true, false, sh), { x: -0.1, y: -0.2 }, 'поставили глушник');
  assert.deepEqual(M.suppressorFix(false, true, sh), { x: 0.1, y: 0.2 }, 'зняли');
  assert.deepEqual(M.suppressorFix(true, true, sh), { x: 0, y: 0 }, 'як при пристрілці');
  assert.equal(M.suppressorFix(true, undefined, sh), null, 'невідомо, як пристрілювали');
  assert.equal(M.suppressorFix(true, false, null), null);
  assert.deepEqual(M.supShiftFor({ supShift: sh, supShiftBy: { c1: { x: 1, y: 1 } } }, 'c1'), { x: 1, y: 1 });
  assert.deepEqual(M.supShiftFor({ supShift: sh }, 'c2'), sh);
});

// ---------- кучність ----------

test('група: розкид, габарит, середній радіус, зміщення СТП', () => {
  const g = M.groupStats([[0, 0], [10, 0], [0, 10], [10, 10]], [5, 0]);
  assert.deepEqual(g.center, [5, 5]);
  near(g.spread, Math.hypot(10, 10), 1e-12);
  assert.deepEqual([g.width, g.height], [10, 10]);
  near(g.meanRadius, Math.hypot(5, 5), 1e-12);
  assert.deepEqual(g.offset, [0, -5], 'на фото y униз: СТП нижче точки прицілювання');
  assert.equal(M.groupStats([]), null);
});

test('масштаб фото: дві лінії рахують осі окремо', () => {
  const photo = { w: 1000, h: 800 };
  const kx = 0.1; const ky = 0.12;
  const line = (a, b) => ({ a, b, mm: Math.hypot((a[0] - b[0]) * photo.w * kx, (a[1] - b[1]) * photo.h * ky) });
  const s1 = line([0, 0], [0.3, 0.4]); const s2 = line([0, 0.5], [0.4, 0.1]);
  const k = M.scaleXY(s1, s2, photo);
  assert.equal(k.two, true);
  near(k.x, kx, 1e-9, 'x'); near(k.y, ky, 1e-9, 'y');
  const one = M.scaleXY(line([0.1, 0.5], [0.6, 0.5]), null, photo);
  assert.deepEqual([one.x, one.y, one.two], [kx, kx, false], 'одна лінія — однаковий масштаб');
  const par = M.scaleXY(s1, line([0.5, 0.5], [0.8, 0.9]), photo);
  assert.equal(par.two, false, 'паралельна друга лінія нічого не уточнює');
  assert.equal(M.mmPerPx({ a: [0, 0], b: [0, 0], mm: 10 }, photo), null, 'нульова лінія');
});

test('кучність набоїв: зведення до 100 м, малі групи не рахуються', () => {
  const photo = { id: 'ph', w: 1000, h: 1000 };
  const scale = { a: [0, 0], b: [0.1, 0], mm: 10 }; // 0,1 мм на піксель
  const square = [[0.5, 0.5], [0.6, 0.5], [0.5, 0.6], [0.6, 0.6]]; // 10 × 10 мм
  const targets = [
    { id: 't1', photoId: 'ph', cartridgeId: 'A', distance: 100, scale, groups: [{ holes: square }] },
    { id: 't2', photoId: 'ph', cartridgeId: 'B', distance: 200, scale, groups: [{ holes: square }, { holes: square.slice(0, 2) }] },
    { id: 't3', photoId: 'ph', cartridgeId: 'C', distance: 0, scale, groups: [{ holes: square }] },
  ];
  const [b, a, ...rest] = M.ammoPrecision(targets, [photo]);
  assert.equal(rest.length, 0, 'мішень без дистанції не враховано');
  assert.deepEqual([b.cartridgeId, a.cartridgeId], ['B', 'A'], 'та сама група вдвічі далі — вдвічі кучніша');
  near(b.meanRadius * 2, a.meanRadius, 1e-9, 'кут той самий');
  assert.deepEqual([b.groups, b.shots], [1, 4], 'група з двох пробоїн не рахується');
  near(a.meanRadius, Math.hypot(5, 5) * M.mrBias(4), 1e-9, 'поправка на малу вибірку');
  near(a.best, Math.hypot(10, 10), 1e-9);
});

test('поправка mrBias: групи з різною кількістю пострілів порівнянні (симуляція)', () => {
  let x = 12345;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const mean = (n, groups = 20000) => {
    let sum = 0;
    for (let i = 0; i < groups; i++) sum += M.groupStats(Array.from({ length: n }, () => [gauss(), gauss()])).meanRadius * M.mrBias(n);
    return sum / groups;
  };
  const [m3, m10] = [mean(3), mean(10)];
  near(m3 / m10, 1, 0.03, 'виправлений радіус трійки ≈ десятки');
});

// ---------- калібри ----------

test('калібри: однакові написання, ресурс ствола, поправка швидкості на довжину', () => {
  assert.ok(M.sameCaliber('.223 Rem', '5.56x45') && M.sameCaliber('.308 Win', '7.62×51') && M.sameCaliber('', '9x19'));
  assert.ok(!M.sameCaliber('7.62x39', '7.62x54R') && !M.sameCaliber('5.45x39', '5.56x45'));
  assert.deepEqual(M.barrelLifeFor('5.56x45'), { min: 10000, max: 20000 });
  assert.deepEqual(M.barrelLifeFor('12 кал'), { smooth: true });
  assert.deepEqual(M.barrelLifeFor('6.5 Creedmoor'), { min: 2500, max: 3500 });
  assert.equal(M.barrelLifeFor('щось'), null);
  assert.equal(M.barrelMvDelta('.308 Win', 24, 16 * 25.4), Math.round(-8 * 7.6), 'коротший ствол — повільніше');
  assert.equal(M.barrelMvDelta('7.62×39', 20, 16 * 25.4), -18, 'АК — 4,5 м/с на дюйм');
  assert.equal(M.barrelMvDelta('.22 LR', 24, 500), null);
  assert.equal(M.barrelMvDelta('12 кал', 28, 500), null);
  assert.equal(M.barrelMvDelta('.308 Win', null, 500), null);
  assert.deepEqual([M.bulletMm('.223'), M.bulletMm('9 мм'), M.bulletMm('12/76')], [5.66, 9, null]);
});

// ---------- демо-дані: облік сходиться ----------

test('демо-дані: розбивки настрілу сходяться, залишки не мінусові', () => {
  const s = JSON.parse(readFileSync(`${DIR}/demo.json`, 'utf8')).data;
  const tot = M.totalShots(s);
  assert.equal(tot.own + tot.foreign + tot.noGun, tot.total);
  assert.equal(M.shotsByCaliber(s).reduce((n, r) => n + r.total, 0), tot.fired, 'калібри = усі постріли');
  const own = s.weapons.reduce((n, w) => n + M.weaponShots(s, w), 0);
  const ownNoInitial = s.movements.filter((m) => m.kind === 'shot' && m.weaponId).reduce((n, m) => n - m.qty, 0);
  assert.equal(own, tot.initial + ownNoInitial, 'стволи = свої постріли + настріл до обліку');
  const dated = s.movements.filter((m) => m.kind === 'shot' && m.date).reduce((n, m) => n - m.qty, 0);
  assert.equal(M.shotsByPeriod(s, (d) => d.slice(0, 7), 1e6).reduce((n, r) => n + r.shots, 0), dated, 'місяці = усі постріли з датою');
  for (const c of s.cartridges) assert.ok(M.cartridgeStock(s, c.id) >= 0, `набій ${c.id} у мінусі`);
  for (const c of s.components) assert.ok(M.componentStock(s, c.id) >= -1e-9, `компонент ${c.id} у мінусі`);
  for (const m of s.movements.filter((x) => x.kind === 'shot' && x.cartridgeId)) {
    assert.ok(M.shotCost(s, m) > 0, `постріл ${m.id} без вартості`);
  }
});
