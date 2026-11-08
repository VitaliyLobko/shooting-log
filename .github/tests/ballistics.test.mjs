// Unit-тести розрахунків shooting-log: js/ballistics.js і js/stability.js без браузера.
// Еталон — ballistics-ref.json з py-ballisticcalc (ballistics-ref.py поруч). Запуск:
//   node --test ".github/tests/*.test.mjs"   (з кореня репо; так само в release.py і pages.yml)
//   SL_DIR=<копія репо> — перевірити іншу копію (мутаційна перевірка)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = process.env.SL_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const js = (f) => import(pathToFileURL(`${DIR}/js/${f}`).href);
const { solve, airRatio } = await js('ballistics.js');
const st = await js('stability.js');
const REF = JSON.parse(readFileSync(new URL('./ballistics-ref.json', import.meta.url), 'utf8'));

// Допуски: клік прицілу 0,1 MRAD — розбіжність має бути на порядок менша
const TOL = { H: 0.01, W: 0.005, relT: 0.001, relV: 0.001, relSg: 0.005 };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} проти ${b} (допуск ${tol})`);
const args = (c) => ({ bc: c.bc, model: c.model, mv: c.mv, sh: c.sh, zero: c.zero, tC: c.tC, alt: c.alt, max: c.max, step: c.step });

for (const c of REF.cases) {
  test(`збіг з ${REF.source}: ${c.name}`, () => {
    const r = solve(args(c));
    assert.ok(r, 'solve повернув null');
    assert.equal(r.H.length, c.X.length);
    c.X.forEach((x, i) => {
      near(r.H[i], c.H[i], TOL.H, `H на ${x} м, MRAD`);
      near(r.W[i], c.W[i], TOL.W, `W на ${x} м, MRAD на 1 м/с`);
      near(r.T[i], c.T[i], c.T[i] * TOL.relT, `T на ${x} м, с`);
      near(r.V[i], c.V[i], c.V[i] * TOL.relV, `V на ${x} м, м/с`);
    });
  });

  test(`ФГС Міллера як у ${REF.source}: ${c.name}`, () => {
    const sg = st.millerSg({ grains: c.gr, lengthMm: c.len_mm, diameterMm: c.dia_mm, twistIn: c.twist, mv: c.mv });
    near(sg, c.sg, c.sg * TOL.relSg, 'Sg');
  });
}

test('траєкторія: фізично осмислена', () => {
  for (const c of REF.cases) {
    const r = solve(args(c));
    const iz = c.X.indexOf(c.zero);
    near(r.H[iz], 0, 0.005, `${c.name}: поправка на дистанції пристрілки`);
    // ближня пристрілка: куля ще йде над лінією прицілу, винос росте лише після вершини
    const top = r.H.indexOf(Math.min(...r.H));
    for (let i = 1; i < r.H.length; i++) {
      assert.ok(r.V[i] < r.V[i - 1], `${c.name}: швидкість падає`);
      assert.ok(r.T[i] > r.T[i - 1], `${c.name}: час росте`);
      assert.ok(r.W[i] > r.W[i - 1] && r.W[i] > 0, `${c.name}: знесення росте`);
      if (i > top) assert.ok(r.H[i] > r.H[i - 1], `${c.name}: після вершини винос росте`);
    }
  }
});

test('траєкторія: кращий BC — менше падіння й знесення', () => {
  const lo = solve({ bc: 0.2, model: 'G7', mv: 800 }); const hi = solve({ bc: 0.3, model: 'G7', mv: 800 });
  assert.ok(hi.H.at(-1) < lo.H.at(-1) && hi.W.at(-1) < lo.W.at(-1) && hi.V.at(-1) > lo.V.at(-1));
});

test('траєкторія: розріджене повітря — менше падіння', () => {
  const sea = solve({ bc: 0.243, mv: 790 }); const high = solve({ bc: 0.243, mv: 790, tC: 15, alt: 2000 });
  assert.ok(high.H.at(-1) < sea.H.at(-1));
});

test('траєкторія: без даних — null, а не NaN у таблиці', () => {
  for (const bad of [{ bc: 0, mv: 790 }, { bc: -1, mv: 790 }, { bc: 0.243, mv: 0 }, { bc: 0.243, mv: NaN },
    { bc: 0.243, mv: 790, model: 'G2' }, {}]) assert.equal(solve(bad), null, JSON.stringify(bad));
});

test('атмосфера: стандартна = 1, холод щільніший, висота рідша', () => {
  assert.equal(airRatio(15, 0), 1);
  assert.ok(airRatio(-10, 0) > 1 && airRatio(30, 0) < 1 && airRatio(15, 1000) < 1);
  near(airRatio(8.5, 1000), 0.9075, 0.001, 'ICAO 1000 м, стандартні +8,5 °C');
  near(airRatio(15, 1000), 0.8870, 0.001, '1000 м при +15 °C — лише тиск');
});

test('крок нарізів: як на стволі', () => {
  const cases = { '1:8': 8, '1/7': 7, 8: 8, '1:10,5': 10.5, '1:9″': 9, '1:200 мм': 7.87, '1:178': 7.01, '228 mm': 8.98,
    '1:250mm': 9.84, '1 in 8': 8, '1 in 12"': 12, '1-8': 8, '1:8 (203 мм)': 8, '203 мм (1:8)': 7.99, '1 IN 7': 7 };
  for (const [s, v] of Object.entries(cases)) assert.equal(st.parseTwist(s), v, s);
  for (const s of ['', null, '1:4', '1:25', 'abc']) assert.equal(st.parseTwist(s), null, String(s));
  assert.equal(st.twistText(7.7), '1:7,7″');
  assert.equal(st.parseTwist(st.twistText(7.87).replace('″', '')), 7.9, 'туди-назад через текст');
});

test('діаметр кулі за калібром', () => {
  const cases = { '5.56x45': 5.69, '.223 Rem': 5.69, '.308 Win': 7.82, '7.62x51': 7.82, '7.62×39': 7.92, '7.62x54R': 7.92,
    '5.45x39': 5.62, '6.5 Creedmoor': 6.71, '.243 Win': 6.17, '.300 Win Mag': 7.82, '.338 Lapua': 8.59 };
  for (const [c, mm] of Object.entries(cases)) assert.equal(st.bulletDiameter(c), mm, c);
  for (const c of ['12 кал', '12ga', null, '']) assert.equal(st.bulletDiameter(c), null, String(c));
});

test('ФГС: межі вердикту, швидкість, гранули', () => {
  assert.deepEqual([0.99, 1, 1.49, 1.5].map((v) => st.sgVerdict(v).level), ['bad', 'edge', 'edge', 'ok']);
  const p = { grains: 175, lengthMm: 31.2, diameterMm: 7.82, twistIn: 10 };
  const at = (mv) => st.millerSg({ ...p, mv });
  near(at(2800 / 3.28084), st.millerSg(p), 1e-9, 'на 2800 fps поправки немає');
  near(at(1000) / at(500), Math.cbrt(2), 1e-9, 'ФГС ∝ ∛швидкості');
  assert.ok(st.millerSg({ ...p, twistIn: 8 }) > st.millerSg(p), 'швидші нарізи — стабільніше');
  assert.equal(st.millerSg({ ...p, lengthMm: 0 }), null);
  near(st.bulletGrains({ bulletWeight: 11.34, weightUnit: 'г' }), 175, 0.05, '11,34 г = 175 gr');
  assert.equal(st.bulletGrains({}), null);
});
