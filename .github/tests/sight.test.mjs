// Unit-тести прицільної частини shooting-log: js/trajectory.js (прямий постріл, нулі, найкраща пристрілка),
// js/zero.js (куди має лягти група при пристрілці з іншої дистанції) і js/target.js (поправка барабана в кліках).
// Модулі тягнуть ui.js — йому досить заглушок window і location. Запуск:
//   node --test ".github/tests/*.test.mjs"   (з кореня репо; так само в release.py і pages.yml)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window ??= { addEventListener() {} };
globalThis.location ??= { search: '', hash: '', href: 'http://127.0.0.1/', pathname: '/' };
const DIR = process.env.SL_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const js = (f) => import(pathToFileURL(`${DIR}/js/${f}`).href);
const T = await js('trajectory.js');
const { wantUpMm } = await js('zero.js');
const { corrections, elevText } = await js('target.js');
const { solve } = await js('ballistics.js');
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} проти ${b} (допуск ${tol})`);

// Парабола y = −7 + 0,2·d − 0,001·d² см, точки через 10 м: нулі ≈45 і ≈155 м, вершина 3 см на 100 м
const parab = () => Array.from({ length: 31 }, (_, i) => { const d = i * 10; return { d, cm: -7 + 0.2 * d - 0.001 * d * d }; });

test('траєкторія: точки з поправок solve і висота між ними', () => {
  const pts = T.trajectoryPoints([1, 0, -0.5], 100, 7);
  assert.deepEqual(pts, [{ d: 0, cm: -7 }, { d: 100, cm: -10 }, { d: 200, cm: -0 }, { d: 300, cm: 15 }],
    '1 мрад поправки вгору на 100 м = куля на 10 см нижче');
  near(T.heightAt(parab(), 15), (-5.1 + -3.4) / 2, 1e-12, 'лінійно між точками');
  assert.equal(T.heightAt(parab(), 0), -7, 'біля дула — мінус висота прицілу');
  assert.equal(T.heightAt(parab(), 301), null, 'далі таблиці');
});

test('прямий постріл: смуга ±R і вершина', () => {
  const { spans, apex } = T.pointBlank(parab(), 5);
  assert.deepEqual(spans, [[11, 189]], 'від −5 см на підйомі до −5 см на спуску');
  assert.deepEqual(apex, { d: 100, cm: 3 });
  // y = −2 на 29,3 і 170,7 м, y = +2 на 68,4 і 131,6 м
  assert.deepEqual(T.pointBlank(parab(), 2).spans, [[30, 68], [132, 170]], 'вершина вища за смугу — два відрізки');
  assert.deepEqual(T.pointBlank(parab(), 0.1).spans.length, 2);
});

test('нулі траєкторії й підпис пристрілки', () => {
  assert.deepEqual(T.zeros(parab()), { up: 46, down: 155 });
  assert.equal(T.farCross(parab(), 46), 155, 'другий перетин після ближнього нуля');
  const moved = T.rezero(parab(), 100);
  near(T.heightAt(moved, 100), 0, 1e-12, 'після перепристрілки на 100 м висота там нуль');
  assert.equal(moved[0].cm, -7, 'приціл на місці');
  assert.equal(T.zerosLabel(parab(), 100), '70/100', 'нулі 70 і 100 м');
  assert.equal(T.zerosLabel(T.rezero(parab(), 100), 85), '85', 'нуль на вершині — одним числом');
});

test('найкраща пристрілка: суцільно від дула найдалі, вершина в смузі', () => {
  const pts = parab();
  const best = T.bestZero(pts, 5);
  assert.ok(best, 'таблиця достатня');
  const { spans, apex } = T.pointBlank(best.pts, 5);
  assert.ok(apex.cm <= 5 + 1e-9, `вершина ${apex.cm} см не вилітає за смугу`);
  assert.ok(best.zero >= spans[0][0] && best.zero <= spans[0][1]);
  for (let z = 25; z <= 300; z += 5) {
    const s = T.pointBlank(T.rezero(pts, z), 5).spans[0];
    if (s && z >= s[0] && z <= s[1]) assert.ok(s[1] <= best.span[1], `пристрілка ${z} м дає далі за найкращу`);
  }
  assert.equal(T.bestZero([{ d: 0, cm: -7 }, { d: 10, cm: -6 }], 5), null, 'закоротка таблиця');
});

test('пристрілка з іншої дистанції: DOPE і балістика дають одне й те саме', () => {
  const c = { bc: 0.243, dragModel: 'G7' }; const mv = 790; const sh = 7;
  assert.deepEqual(wantUpMm({ d: 100, zero: 100 }), { mm: 0, src: 'same' });
  const res = solve({ bc: c.bc, model: 'G7', mv, sh, zero: 100, max: 300, step: 5 });
  const pts = T.trajectoryPoints(res.H, 5, sh);
  for (const d of [25, 50, 200, 300]) {
    const w = wantUpMm({ d, zero: 100, c, mv, sh });
    assert.equal(w.src, 'calc');
    near(w.mm, T.heightAt(pts, d) * 10, 1e-6, `на ${d} м група там, де куля при нулі 100`);
  }
  near(wantUpMm({ d: 25, zero: 100, c, mv, sh }).mm, -34.5, 3, '25 м при нулі 100 м: ≈3,5 см нижче');
  const dope = (x) => ({ 100: 0, 200: 0.9, 25: 1.4 })[x] ?? null;
  assert.deepEqual(wantUpMm({ d: 25, zero: 100, dope, c, mv }), { mm: -1.4 * 25, src: 'dope' }, 'DOPE головніший за балістику');
  near(wantUpMm({ d: 25, zero: 200, dope }).mm, -(1.4 - 0.9) * 25, 1e-12, 'перепристрілка — зсув на сталий кут');
  assert.equal(wantUpMm({ d: 25, zero: 300, dope }), null, 'нема чим порахувати');
});

test('поправка барабана: назустріч СТВ, кліки за ціною кліку', () => {
  const at = (x, y) => ({ offset: [x, y] });
  // 100 м, клік 0,1 MRAD = 1 см: група на 3 см вище й 2 см правіше → 3 вниз, 2 ліворуч
  const [v, h] = corrections(at(20, 30), { distance: 100, click: 'mil0.1' });
  assert.deepEqual([v.arrow, v.clicks, h.arrow, h.clicks], ['↓', 3, '←', 2]);
  const [v2, h2] = corrections(at(-20, -30), { distance: 100, click: 'mil0.1' });
  assert.deepEqual([v2.arrow, h2.arrow], ['↑', '→']);
  assert.equal(corrections(at(0, 35), { distance: 100, click: 'mil0.1' })[0].clicks, 4, '0,35/0,1 = 3,4999… → 4, не 3');
  assert.equal(corrections(at(0, 29.089), { distance: 100, click: 'moa0.25' })[0].clicks, 4, '1 MOA = 4 кліки по ¼');
  assert.equal(corrections(at(0, 13), { distance: 100, click: 'mm13' })[0].clicks, 1);
  assert.deepEqual(corrections(at(0, 0.3), { distance: 100, click: 'mil0.1' }), [], 'менше пів кліку — не крутимо');
  assert.deepEqual(corrections(at(0, 30), { distance: 100, click: 'mil0.1', wantUp: 30 }), [], 'група там, де має бути');
  assert.equal(corrections(at(0, 0), { distance: 25, click: 'mil0.1', wantUp: -35 })[0].arrow, '↓',
    'пристрілка з 25 м: група в точці прицілювання, а має бути нижче — крутимо вниз');
  assert.deepEqual(corrections({ offset: null }, { distance: 100, click: 'mil0.1' }), []);
  assert.deepEqual(corrections(at(10, 10), { distance: 0, click: 'mil0.1' }), [], 'без дистанції');
  assert.match(elevText(1.2, 'mil0.1'), /^↑ 1[,.]20 MRAD = 12 /);
  assert.equal(elevText(0, 'mil0.1'), '0');
});
