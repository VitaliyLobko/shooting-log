// Unit-тести js/items.js: речі (приціли й тюнінг) окремо від стволів — перенос старих стволів, «зібраний» ствол
// і розкладання назад. Запуск: node --test ".github/tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = process.env.SL_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const I = await import(pathToFileURL(`${DIR}/js/items.js`).href);

const legacy = () => ({
  id: 'w1', name: 'Zion', caliber: '.223 Rem',
  scopes: [
    { id: 'sc1', name: 'Delta Stryker HD 1-6x24', kind: 'optic', zero: 100, sh: 7, click: 'mil0.1', reticle: 'mil', default: true, price: 30000, date: '2026-10-23' },
    { id: 'sc2', name: 'Aimpoint PRO', kind: 'red', zero: 50, on: false },
  ],
  mods: [
    { id: 'm1', name: 'Сошки Atlas BT65', price: 13500, on: true, weight: 500 },
    { id: 'm2', name: 'Приціл Delta Stryker HD 1-6×24', price: 31000, place: 'ibis', weight: 600 },
    { id: 'm3', name: 'Ремінь', price: 900, soldDate: '2026-11-01', soldPrice: 500 },
  ],
  setups: [{ id: 's1', name: 'DMR', on: ['sc1', 'm1', 'm2'], main: 'sc1' }],
  dope: [{ id: 'd1', scopeId: 'sc1', rows: [] }],
});
const photos = [{ id: 'p2', modId: 'm2', thumb: 'x' }];
const migrated = () => {
  const out = I.migrateWeapons([legacy()], { weapons: [legacy()], items: [], photos });
  return { out, raw: { weapons: out.weapons.put, items: out.items.put, photos: [] } };
};

test('перенос: приціли й тюнінг стають речами, у стволі — пари', () => {
  const { out } = migrated();
  const w = out.weapons.put[0];
  assert.equal(w.itemsV, 1);
  assert.equal(w.mods, undefined);
  assert.deepEqual(w.scopes, [
    { id: 'sc1', zero: 100, sh: 7, default: true, name: 'Delta Stryker HD 1-6x24', kind: 'optic', click: 'mil0.1', reticle: 'mil' },
    { id: 'sc2', zero: 50, name: 'Aimpoint PRO', kind: 'red' },
  ], 'пари з копією назви для старих версій');
  assert.deepEqual(w.dope, legacy().dope, 'DOPE не чіпаємо');
  const it = Object.fromEntries(out.items.put.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(it).sort(), ['m1', 'm3', 'sc1', 'sc2'], 'дубль m2 злитий у приціл');
  assert.equal(it.sc1.type, 'scope'); assert.equal(it.sc1.click, 'mil0.1');
  assert.equal(it.sc1.weaponId, 'w1', 'приціл без on — стоїть');
  assert.equal(it.sc2.weaponId, null, 'on:false — знято');
  assert.equal(it.m1.type, 'part'); assert.equal(it.m1.weaponId, 'w1'); assert.equal(it.m1.forId, 'w1');
  assert.equal(it.m3.weaponId, null); assert.equal(it.m3.soldDate, '2026-11-01');
});

test('перенос: дубль — покупка й вага переходять у приціл, фото теж, набір посилається на приціл', () => {
  const { out } = migrated();
  const sc1 = out.items.put.find((x) => x.id === 'sc1');
  assert.equal(sc1.price, 31000); assert.equal(sc1.place, 'ibis'); assert.equal(sc1.weight, 600);
  assert.deepEqual(out.photos.put, [{ id: 'p2', thumb: 'x', scopeId: 'sc1' }]);
  assert.deepEqual(out.weapons.put[0].setups[0].on, ['sc1', 'm1']);
});

test('перенос ще раз (старий пристрій прислав ствол): наявних речей не перезаписує', () => {
  const { raw } = migrated();
  const again = I.migrateWeapons([legacy()], { ...raw, photos: [] });
  assert.equal(again.items.put.length, 0);
});

test('«зібраний» ствол — як раніше: scopes з назвою й on, mods з on', () => {
  const v = I.hydrate(migrated().raw).weapons[0];
  assert.deepEqual(v.scopes.map((s) => [s.id, s.name, s.zero, s.on]), [['sc1', 'Delta Stryker HD 1-6x24', 100, true], ['sc2', 'Aimpoint PRO', 50, false]]);
  assert.deepEqual(v.mods.map((m) => [m.id, m.on]), [['m1', true], ['m3', false]]);
  assert.equal(v.mods[0].weaponId, undefined, 'службових полів речі не видно');
});

test('стара версія дописала в пару порожню назву — назва береться з речі', () => {
  const { raw } = migrated();
  const w = { ...raw.weapons[0], scopes: raw.weapons[0].scopes.map((p) => ({ ...p, name: '' })) };
  assert.equal(I.hydrate({ ...raw, weapons: [w] }).weapons[0].scopes[0].name, 'Delta Stryker HD 1-6x24');
});

test('зберегли без змін — ні речей, ні видалень; запис ствола той самий', () => {
  const { raw } = migrated();
  const v = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon(v, raw.items);
  assert.deepEqual(r.put, []); assert.deepEqual(r.del, []);
  assert.deepEqual(r.weapon, raw.weapons[0]);
});

test('поставили тюнінг і зняли приціл — змінюється лише «стоїть на»', () => {
  const { raw } = migrated();
  const v = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon({ ...v, mods: v.mods.map((m) => (m.id === 'm3' ? { ...m, on: true } : m)), scopes: v.scopes.map((s) => ({ ...s, on: false })) }, raw.items);
  const by = Object.fromEntries(r.put.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(by).sort(), ['m3', 'sc1']);
  assert.equal(by.m3.weaponId, 'w1'); assert.equal(by.sc1.weaponId, null);
});

test('прибрали тюнінг і приціл — речі видалено; приціл, налаштований ще на іншому стволі, лише знято', () => {
  const { raw } = migrated();
  const v = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon({ ...v, mods: v.mods.filter((m) => m.id !== 'm1'), scopes: [] }, raw.items);
  assert.deepEqual(r.del.sort(), ['m1', 'sc1', 'sc2']);
  const kept = I.splitWeapon({ ...v, scopes: [] }, raw.items, new Set(['sc1']));
  assert.deepEqual(kept.del, ['sc2']);
  assert.equal(kept.put.find((x) => x.id === 'sc1')?.weaponId, null);
});

test('новий тюнінг і приціл зі старої форми — нові речі «куплено для» цього ствола', () => {
  const { raw } = migrated();
  const v = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon({ ...v, mods: [...v.mods, { id: 'm9', name: 'Ліхтар', on: true }], scopes: [...v.scopes, { id: 'sc9', name: 'Burris', zero: 100 }] }, raw.items);
  const by = Object.fromEntries(r.put.map((x) => [x.id, x]));
  assert.equal(by.m9.forId, 'w1'); assert.equal(by.m9.weaponId, 'w1'); assert.equal(by.m9.ord, 2);
  assert.equal(by.sc9.type, 'scope'); assert.equal(by.sc9.weaponId, 'w1', 'новий приціл стоїть');
  assert.deepEqual(r.weapon.scopes.at(-1), { id: 'sc9', zero: 100, name: 'Burris' });
});

test('ствол без поля scopes — пари як були', () => {
  const { raw } = migrated();
  const { scopes, ...v } = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon(v, raw.items);
  assert.deepEqual(r.weapon.scopes, raw.weapons[0].scopes);
  assert.deepEqual(r.del, []);
  assert.equal(r.weapon.pairs, undefined, 'службове поле не пишемо');
});

test('пара без речі (ще не прийшла синхронізацією) — не губиться при збереженні', () => {
  const { raw } = migrated();
  const w = { ...raw.weapons[0], scopes: [...raw.weapons[0].scopes, { id: 'sc-late', zero: 300 }] };
  const v = I.hydrate({ ...raw, weapons: [w] }).weapons[0];
  assert.equal(v.scopes.length, 2, 'у виді її немає');
  assert.deepEqual(I.splitWeapon(v, raw.items).weapon.scopes.at(-1), { id: 'sc-late', zero: 300 });
});

test('ствол без поля mods — тюнінг не чіпаємо', () => {
  const { raw } = migrated();
  const { mods, ...v } = I.hydrate(raw).weapons[0];
  assert.deepEqual(I.splitWeapon(v, raw.items).del, []);
});

// Другий ствол: сошки Zion стоять на Savage, ремінь Savage — у наборі Zion
const two = () => {
  const { raw } = migrated();
  const items = [
    ...raw.items.map((x) => (x.id === 'm1' ? { ...x, weaponId: 'w2' } : x)),
    { id: 'r2', type: 'part', name: 'Ремінь Savage', forId: 'w2', weaponId: 'w2', ord: 0 },
  ];
  const w1 = { ...raw.weapons[0], setups: [...raw.weapons[0].setups, { id: 's2', name: 'Ремінь', on: ['r2'] }] };
  const w2 = { id: 'w2', name: 'Savage', scopes: [], itemsV: 1 };
  return { ...raw, weapons: [w1, w2], items };
};

test('чужий тюнінг: стоїть тут чи в наборі — видно в стволі; свій, що стоїть на іншому, — знятим', () => {
  const [v1, v2] = I.hydrate(two()).weapons;
  assert.deepEqual(v1.mods.map((m) => [m.id, m.on]), [['m1', false], ['m3', false], ['r2', false]]);
  assert.deepEqual(v2.mods.map((m) => [m.id, m.on]), [['r2', true], ['m1', true]], 'свій першим');
});

test('поставили чужий тюнінг — один запис речі, «куплено для» й порядок не чіпаємо', () => {
  const raw = two();
  const v1 = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon({ ...v1, mods: v1.mods.map((m) => (m.id === 'r2' ? { ...m, on: true } : m)) }, raw.items);
  assert.deepEqual(r.put, [{ id: 'r2', type: 'part', name: 'Ремінь Savage', forId: 'w2', weaponId: 'w1', ord: 0 }]);
  assert.deepEqual(r.del, []);
});

test('зберегли ствол, з якого річ переїхала, — її не повертає й не видаляє', () => {
  const raw = two();
  const v1 = I.hydrate(raw).weapons[0];
  const r = I.splitWeapon(v1, raw.items);
  assert.deepEqual(r.put, []); assert.deepEqual(r.del, []);
});

test('прибрали зі ствола чужий тюнінг, що стояв тут, — лише знято; свій — видалено', () => {
  const raw = two();
  const v2 = I.hydrate(raw).weapons[1];
  const r = I.splitWeapon({ ...v2, mods: [] }, raw.items);
  assert.deepEqual(r.del, ['r2']);
  assert.deepEqual(r.put, [{ ...raw.items.find((x) => x.id === 'm1'), weaponId: null }]);
});

test('приціл переїхав на ствол без пари — пара з копією назви, без службових полів', () => {
  const raw = two();
  const v2 = I.hydrate(raw).weapons[1];
  const { zero, ...sc } = I.hydrate(raw).weapons[0].scopes.find((s) => s.id === 'sc2');
  const r = I.splitWeapon({ ...v2, scopes: [{ ...sc, on: true }] }, raw.items, new Set(['sc1', 'sc2']));
  assert.deepEqual(r.weapon.scopes, [{ id: 'sc2', name: 'Aimpoint PRO', kind: 'red' }]);
  assert.deepEqual(r.put.map((x) => [x.id, x.weaponId, x.forId]), [['sc2', 'w2', 'w1']]);
});

test('пара речі, що стала тюнінгом, — не показується прицілом', () => {
  const { raw } = migrated();
  const items = raw.items.map((x) => (x.id === 'sc2' ? { ...x, type: 'part' } : x));
  assert.deepEqual(I.hydrate({ ...raw, items }).weapons[0].scopes.map((s) => s.id), ['sc1']);
});

test('тюнінг став прицілом — пара в стволі (без службових полів), фото під приціл', () => {
  const raw = { ...two(), photos: [{ id: 'pm', modId: 'r2', thumb: 'x' }] };
  const out = I.retype('r2', 'scope', raw);
  assert.deepEqual(out.items.put, [{ id: 'r2', type: 'scope', name: 'Ремінь Savage', forId: 'w2', weaponId: 'w2' }]);
  assert.deepEqual(out.weapons.put.map((w) => [w.id, w.scopes.at(-1)]), [['w2', { id: 'r2', name: 'Ремінь Savage' }]]);
  assert.deepEqual(out.photos.put, [{ id: 'pm', thumb: 'x', scopeId: 'r2' }]);
  const v = I.hydrate({ ...raw, items: raw.items.map((x) => (x.id === 'r2' ? out.items.put[0] : x)), weapons: raw.weapons.map((w) => out.weapons.put.find((y) => y.id === w.id) ?? w) }).weapons[1];
  assert.deepEqual([v.scopes.map((s) => [s.id, s.on]), v.mods.map((m) => m.id)], [[['r2', true]], ['m1']]);
});

test('приціл став тюнінгом — пари прибрано в усіх стволах, у кінці тюнінгу', () => {
  const { raw } = migrated();
  const out = I.retype('sc2', 'part', raw);
  assert.equal(out.items.put[0].type, 'part'); assert.equal(out.items.put[0].ord, 2);
  assert.deepEqual(out.weapons.put[0].scopes.map((p) => p.id), ['sc1']);
});

test('тюнінг злили в приціл: порожнє — з тюнінгу, набори на приціл, фото прицілу своє', () => {
  const raw = { ...two(), photos: [{ id: 'pa', scopeId: 'sc1' }, { id: 'pb', modId: 'm1' }] };
  const out = I.mergeItems('m1', 'sc1', raw);
  const m = out.items.put[0];
  assert.equal(m.price, 31000, 'своя ціна прицілу лишається');
  assert.equal(m.weight, 600);
  assert.deepEqual(out.items.del, ['m1']);
  assert.deepEqual(out.weapons.put.map((w) => [w.id, w.setups[0].on]), [['w1', ['sc1']]]);
  assert.deepEqual(out.drop, ['pb']); assert.deepEqual(out.photos.put, []);
});

test('приціл у приціл з іншого ствола: пара, DOPE, стрільби й мішені — на той, що лишається', () => {
  const raw = two();
  raw.weapons[1] = { ...raw.weapons[1], scopes: [{ id: 'sc-s', zero: 300, default: true, name: 'Delta' }], dope: [{ id: 'd2', scopeId: 'sc-s' }] };
  raw.items.push({ id: 'sc-s', type: 'scope', name: 'Delta', forId: 'w2', weaponId: 'w2', note: 'з кільцями' });
  raw.movements = [{ id: 'mv', scopeId: 'sc-s' }, { id: 'mv2', scopeId: 'sc1' }];
  raw.targets = [{ id: 'tg', scopeId: 'sc-s' }];
  const out = I.mergeItems('sc-s', 'sc1', raw);
  assert.equal(out.items.put[0].note, 'з кільцями');
  assert.equal(out.items.put[0].weaponId, 'w1', 'стоїть, де стояв той, що лишається');
  const w2 = out.weapons.put.find((w) => w.id === 'w2');
  assert.deepEqual(w2.scopes, [{ id: 'sc1', zero: 300, default: true, name: 'Delta Stryker HD 1-6x24', kind: 'optic', click: 'mil0.1', reticle: 'mil' }]);
  assert.deepEqual(w2.dope, [{ id: 'd2', scopeId: 'sc1' }]);
  assert.equal(out.weapons.put.some((w) => w.id === 'w1'), false, 'перший ствол не змінився');
  assert.deepEqual(out.movements.put, [{ id: 'mv', scopeId: 'sc1' }]);
  assert.deepEqual(out.targets.put, [{ id: 'tg', scopeId: 'sc1' }]);
});

test('видалили ствол — його речі теж, чуже — знято', () => {
  const { raw } = migrated();
  const items = [...raw.items, { id: 'x', type: 'part', forId: 'w2', weaponId: 'w1' }];
  const r = I.dropWeapon('w1', items);
  assert.deepEqual(r.del.sort(), ['m1', 'm3', 'sc1', 'sc2']);
  assert.deepEqual(r.put, [{ id: 'x', type: 'part', forId: 'w2', weaponId: null }]);
});
