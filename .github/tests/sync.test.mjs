// Unit-тести злиття синхронізації js/sync.js без Google Диска: хто перемагає, надгробки, «Замінити все»
// і два пристрої через один файл. Модулю досить заглушок window і document.
//   node --test ".github/tests/*.test.mjs" з кореня репо · SL_DIR=<копія репо> — інша копія
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window ??= { addEventListener() {} };
globalThis.window.dispatchEvent ??= () => {};
globalThis.document ??= { addEventListener() {} };
const DIR = process.env.SL_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const { merge, localChanges, bury } = await import(pathToFileURL(`${DIR}/js/sync.js`).href);

const r = (id, updated, extra = {}) => ({ id, updated, ...extra });
const ids = (list) => (list ?? []).map((x) => x.id).sort();
const byId = (list, id) => list.find((x) => x.id === id);
// Як db.writeMerged: запис лягає, якщо локальний не новіший; del — надгробок
function apply(local, changes) {
  const out = structuredClone(local);
  for (const [name, { put = [], del = [] }] of Object.entries(changes ?? {})) {
    const map = new Map((out[name] ?? []).map((x) => [x.id, x]));
    for (const obj of put) if ((Number(map.get(obj.id)?.updated) || 0) <= (Number(obj.updated) || 0)) map.set(obj.id, obj);
    for (const grave of del) if ((Number(map.get(grave.id)?.updated) || 0) <= (Number(grave.updated) || 0)) map.delete(grave.id);
    out[name] = [...map.values()];
  }
  return out;
}
// Прохід syncNow: злиття, локальні зміни, файл на Диску стає злитим
function sync(device, drive) {
  const merged = merge(device, drive.data);
  drive.data = merged;
  return apply(device, localChanges(device, merged));
}
const canon = (d) => JSON.stringify(Object.keys(d).filter((k) => (d[k] ?? []).length).sort()
  .map((k) => [k, [...d[k]].sort((a, b) => String(a.id).localeCompare(String(b.id)))]));

test('злиття: усе з обох боків, перемагає пізніша правка', () => {
  const m = merge(
    { weapons: [r('A', 10, { name: 'тут' }), r('B', 5)] },
    { weapons: [r('A', 20, { name: 'там' }), r('C', 7)] });
  assert.deepEqual(ids(m.weapons), ['A', 'B', 'C']);
  assert.equal(byId(m.weapons, 'A').name, 'там');
  assert.equal(byId(merge({ weapons: [r('A', 30, { name: 'тут' })] }, { weapons: [r('A', 20, { name: 'там' })] }).weapons, 'A').name, 'тут');
});

test('злиття: однаковий час правки — той самий переможець на будь-якому пристрої', () => {
  const x = r('A', 10, { name: 'a' }); const y = r('A', 10, { name: 'b' });
  const one = merge({ weapons: [x] }, { weapons: [y] }).weapons[0];
  const two = merge({ weapons: [y] }, { weapons: [x] }).weapons[0];
  assert.deepEqual(one, two, 'інакше файл на Диску перемикається туди-сюди на кожній синхронізації');
  const drive = { data: {} };
  let a = { weapons: [x] }; let b = { weapons: [y] };
  a = sync(a, drive); b = sync(b, drive); a = sync(a, drive);
  assert.equal(canon(a), canon(b));
});

test('злиття: надгробок перемагає старіший запис, новіша правка — надгробок', () => {
  const m = merge({ movements: [r('M', 10), r('N', 30)] }, { tombstones: [r('M', 15, { store: 'movements' }), r('N', 20, { store: 'movements' })] });
  assert.deepEqual(ids(m.movements), ['N'], 'M видалено на іншому пристрої; N правили вже після видалення');
  assert.deepEqual(ids(m.tombstones), ['M', 'N']);
  const graves = merge({ tombstones: [r('M', 15)] }, { tombstones: [r('M', 25)] }).tombstones;
  assert.equal(graves[0].updated, 25, 'надгробки теж — найновіший');
});

test('злиття: сховища новішої версії застосунку не губляться', () => {
  const m = merge({ weapons: [r('A', 1)] }, { weapons: [], futureStore: [r('F', 1)] });
  assert.deepEqual(ids(m.futureStore), ['F']);
});

test('злиття: повторне нічого не змінює, локальних змін тоді немає', () => {
  const m = merge({ weapons: [r('A', 10)], movements: [r('M', 3)] }, { weapons: [r('B', 4)], tombstones: [r('X', 2)] });
  assert.equal(canon(merge(m, m)), canon(m));
  assert.equal(localChanges(m, merge(m, m)), null);
});

test('локальні зміни: що дописати й що видалити на пристрої', () => {
  const local = { weapons: [r('A', 10), r('B', 5)], movements: [r('M', 10)] };
  const merged = merge(local, { weapons: [r('A', 20, { name: 'нове' })], tombstones: [r('M', 15, { store: 'movements' })] });
  const ch = localChanges(local, merged);
  assert.deepEqual(ids(ch.weapons.put), ['A']);
  assert.deepEqual(ch.weapons.del, []);
  assert.deepEqual(ch.movements.del, [{ id: 'M', updated: 15, store: 'movements' }], 'видалення — з надгробком Диска');
  assert.deepEqual(ids(ch.tombstones.put), ['M']);
});

test('«Замінити все»: старше за відновлення видаляється всюди, новіше й відновлене лишається', () => {
  const at = 100;
  const local = { weapons: [r('X', at), r('Y', 50)] };            // X — з копії, Y — був до відновлення
  const remote = { weapons: [r('Z', 80), r('W', 120)] };          // Z — старе з Диска, W — зроблено після відновлення
  const m = merge(local, bury(local, remote, at));
  assert.deepEqual(ids(m.weapons), ['W', 'X']);
  assert.deepEqual(ids(m.tombstones), ['Y', 'Z']);
});

test('два пристрої через Диск: після кількох проходів усі копії однакові', () => {
  const drive = { data: {} };
  let a = { weapons: [r('A', 10, { name: 'a' })], movements: [r('M1', 11)] };
  let b = { weapons: [r('A', 12, { name: 'b' }), r('B', 5)], movements: [r('M2', 13)] };
  a = sync(a, drive); b = sync(b, drive); a = sync(a, drive);
  assert.equal(canon(a), canon(b)); assert.equal(canon(a), canon(drive.data));
  assert.equal(byId(a.weapons, 'A').name, 'b', 'пізніша правка з другого пристрою');
  // A видаляє B, B тим часом дописує M3
  a = apply(a, { weapons: { del: [r('B', 20)] }, tombstones: { put: [r('B', 20, { store: 'weapons' })] } });
  b = apply(b, { movements: { put: [r('M3', 21)] } });
  a = sync(a, drive); b = sync(b, drive); a = sync(a, drive);
  assert.equal(canon(a), canon(b));
  assert.deepEqual(ids(b.weapons), ['A'], 'видалення дійшло');
  assert.deepEqual(ids(a.movements), ['M1', 'M2', 'M3'], 'новий запис дійшов');
  const before = canon(drive.data);
  a = sync(a, drive); b = sync(b, drive);
  assert.equal(canon(drive.data), before, 'далі нічого не гойдається');
});
