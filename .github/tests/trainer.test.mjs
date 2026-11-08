// Unit-тести балістики тренажера js/guide.js: довідкові таблиці виносу (LOADS) і погода проти власного solve()
// (а він звірений з py-ballisticcalc), своя таблиця DOPE під погоду як у «Поправки зараз», інтерполяція, ближче 50 м,
// інша пристрілка, швидкість кулі.
//   node --test ".github/tests/*.test.mjs" з кореня репо · SL_DIR=<копія репо> — інша копія
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window ??= { addEventListener() {} };
globalThis.addEventListener ??= () => {};
globalThis.location ??= { search: '', hash: '' };
globalThis.document ??= { addEventListener() {}, documentElement: {}, createElement: () => ({}) };
globalThis.localStorage ??= { getItem: () => null, setItem() {} };
const DIR = process.env.SL_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const G = await import(pathToFileURL(`${DIR}/js/guide.js`).href);
const { solve, airRatio } = await import(pathToFileURL(`${DIR}/js/ballistics.js`).href);
const M = await import(pathToFileURL(`${DIR}/js/model.js`).href);

// З чого пораховано таблиці: G7 BC і висота прицілу, см. M193 (930/950/990 м/с) — G7 0,121.
// b308 — 4 см над стволом (у коментарі LOADS не вказано, підібрано: інші висоти дають похибку 0,2–1 MOA)
const KIT = { m855: { bc: 0.151, sh: 7 }, acog: { bc: 0.151, sh: 6.6 }, b308: { bc: 0.243, sh: 4 }, ebr: { bc: 0.243, sh: 4.5 } };
const M193 = ['930', '950', '990'];
const bcOf = (kit, mv) => (M193.includes(mv) ? 0.121 : KIT[kit].bc);
const unitK = (kit) => (G.RET[G.LOADS[kit].ret].u === 'MOA' ? 1 / G.MOA_IN_MRAD : 1);
const worst = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
// Таблиці округлено до сотих: 0,005 — саме округлення, 0,01 — запас
const TOL = 0.01;
// Висота при +15 °C, на якій щільність повітря — r від стандартної
const altFor = (r) => { let lo = -3000; let hi = 9000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (airRatio(15, m) > r) lo = m; else hi = m; } return lo; };
const mvsOf = (kit) => Object.keys(G.LOADS[kit].H);

test('довідкові набори: усі на місці, кожна швидкість зі списку має таблиці', () => {
  assert.deepEqual(Object.keys(KIT).filter((k) => !G.LOADS[k]), []);
  for (const kit of Object.keys(KIT)) {
    const L = G.LOADS[kit];
    for (const [mv] of L.mvs) for (const key of ['H', 'W', 'T']) assert.ok(L[key][mv]?.length >= 12, `${kit} ${mv} ${key}`);
    assert.ok(L.H[L.def], `${kit}: швидкість за замовчуванням ${L.def} є в таблицях`);
  }
});

test('таблиці виносу, вітру й часу польоту = solve() за стандартної атмосфери', () => {
  for (const kit of Object.keys(KIT)) {
    const L = G.LOADS[kit]; const k = unitK(kit);
    for (const mv of mvsOf(kit)) {
      const s = solve({ bc: bcOf(kit, mv), mv: +mv, sh: KIT[kit].sh, max: 50 * L.H[mv].length });
      assert.ok(s, `${kit} ${mv}: solve долетів`);
      assert.ok(worst(L.H[mv], s.H.map((v) => v * k)) <= TOL, `${kit} ${mv} H: ${worst(L.H[mv], s.H.map((v) => v * k)).toFixed(3)}`);
      assert.ok(worst(L.W[mv], s.W.map((v) => v * k)) <= TOL, `${kit} ${mv} W: ${worst(L.W[mv], s.W.map((v) => v * k)).toFixed(3)}`);
      assert.ok(worst(L.T[mv], s.T) <= TOL, `${kit} ${mv} T`);
      assert.equal(L.H[mv][1], 0, `${kit} ${mv}: пристрілка 100 м — нуль на 100 м`);
    }
  }
});

test('atmTab: за стандартної погоди — стандартна таблиця; щільніше повітря — більший винос', () => {
  for (const kit of Object.keys(KIT)) {
    for (const mv of mvsOf(kit)) {
      const std = G.atmTab(kit, mv, 15, 0);
      for (const key of ['H', 'W', 'T']) assert.ok(worst(std[key], G.LOADS[kit][key][mv]) <= TOL, `${kit} ${mv} ${key}`);
      const at500 = (tC, alt) => G.at(G.atmTab(kit, mv, tC, alt).H, 500);
      assert.ok(at500(-25, 0) > at500(15, 0) && at500(15, 0) > at500(35, 0) && at500(15, 0) > at500(15, 2500), `${kit} ${mv}: мороз > норма > спека, гори`);
    }
  }
});

// Погода тренажера — та сама балістика, що й solve(): і щільність, і швидкість звуку від температури
// (таблиці лише під щільність давали на −20 °C, 600 м до 13 см розбіжності в 5.56)
test('тренажер за будь-якої погоди = solve() на всіх дистанціях таблиці', () => {
  for (const kit of Object.keys(KIT)) {
    const k = unitK(kit);
    for (const mv of mvsOf(kit)) {
      for (const [tC, alt] of [[-30, 0], [-20, 0], [0, 0], [30, 0], [40, 0], [25, 1500], [30, 2500]]) {
        const tb = G.atmTab(kit, mv, tC, alt);
        const s = solve({ bc: bcOf(kit, mv), mv: +mv, sh: KIT[kit].sh, tC, alt, max: 50 * G.LOADS[kit].H[mv].length });
        assert.equal(tb.H.length, G.LOADS[kit].H[mv].length, `${kit} ${mv}: дистанцій стільки ж, скільки в таблиці`);
        assert.ok(worst(tb.H, s.H.map((v) => v * k)) <= 0.001, `${kit} ${mv} ${tC} °C ${alt} м H: ${worst(tb.H, s.H.map((v) => v * k)).toFixed(3)}`);
        assert.ok(worst(tb.W, s.W.map((v) => v * k)) <= 0.001, `${kit} ${mv} ${tC} °C ${alt} м W`);
        assert.ok(worst(tb.T, s.T) <= 0.001, `${kit} ${mv} ${tC} °C ${alt} м T`);
      }
    }
  }
});

test('інтерполяція: at() у вузлах — значення таблиці, між вузлами — посередині', () => {
  const H = G.LOADS.m855.H['915'];
  for (let i = 0; i < H.length; i++) assert.ok(Math.abs(G.at(H, 50 * (i + 1)) - H[i]) < 1e-9);
  assert.ok(Math.abs(G.at(H, 325) - (H[5] + H[6]) / 2) < 1e-9);
});

test('ближче 50 м: винос з траєкторії, а не прямою в MRAD; на 50 м — як у таблиці', () => {
  for (const kit of Object.keys(KIT)) {
    const k = unitK(kit); const mv = G.LOADS[kit].def; const H = G.LOADS[kit].H[mv];
    assert.ok(Math.abs(G.holdAt(H, 50) - H[0]) < 1e-9);
    const s = solve({ bc: bcOf(kit, mv), mv: +mv, sh: KIT[kit].sh, step: 25, max: 100 });
    // Між 50 і 100 м — прямою по таблиці: у кутових одиницях неточно (на 75 м 0,18 проти 0,06 MRAD), на цілі — до 1 см
    for (const [d, i] of [[25, 0], [35, null], [75, 2]]) {
      const ref = i === null ? solve({ bc: bcOf(kit, mv), mv: +mv, sh: KIT[kit].sh, step: 35, max: 35 }).H[0] : s.H[i];
      const cm = (Math.abs(G.holdAt(H, d) / k - ref) * d) / 10;
      assert.ok(cm < 1, `${kit} ${d} м: ${(G.holdAt(H, d) / k).toFixed(2)} проти ${ref.toFixed(2)} MRAD (${cm.toFixed(1)} см)`);
    }
  }
});

test('інша пристрілка: таблиця 100 м мінус zeroShift = solve() з тією пристрілкою', () => {
  for (const kit of Object.keys(KIT)) {
    const k = unitK(kit); const mv = G.LOADS[kit].def; const H = G.LOADS[kit].H[mv];
    for (const z of [50, 200, 300]) {
      const s = solve({ bc: bcOf(kit, mv), mv: +mv, sh: KIT[kit].sh, zero: z, max: 600 });
      assert.ok(Math.abs(G.holdAt(H, z) - G.zeroShift(H, z)) < 1e-9, `${kit}: на дистанції пристрілки ${z} — нуль`);
      for (const d of [300, 500, 600]) {
        const diff = Math.abs(G.at(H, d) - G.zeroShift(H, z) - G.at(s.H, d) * k);
        assert.ok(diff < 0.02 * Math.max(1, k), `${kit} пристрілка ${z}, ${d} м: ${diff.toFixed(3)}`);
      }
    }
    assert.equal(G.zeroShift(H, 100), 0);
  }
});

test('швидкість кулі з часу польоту: біля дула — початкова, далі — як у solve() (±1,5 %)', () => {
  for (const kit of Object.keys(KIT)) {
    const mv = G.LOADS[kit].def; const T = G.LOADS[kit].T[mv];
    assert.equal(G.speedAt(T, +mv, 0), +mv);
    const s = solve({ bc: bcOf(kit, mv), mv: +mv, sh: KIT[kit].sh, max: 50 * T.length });
    for (const d of [100, 300, 500]) {
      const v = G.speedAt(T, +mv, d); const ref = s.V[d / 50 - 1];
      assert.ok(Math.abs(v - ref) / ref < 0.015, `${kit} ${d} м: ${v.toFixed(0)} проти ${ref.toFixed(0)} м/с`);
    }
  }
});

test('зони ураження в метрах: плита 24 × 30 см, IPSC A 15 × 30 см, центр плити — точка прицілювання', () => {
  const m = (key, v) => v * G.TGT[key].h;
  for (const key of ['man', 'chest', 'kneel']) {
    const [, x, y, w, hh] = G.KZ[key];
    assert.ok(Math.abs(m(key, w) - 0.24) < 0.005 && Math.abs(m(key, hh) - 0.3) < 0.005, `${key}: ${m(key, w).toFixed(3)} × ${m(key, hh).toFixed(3)} м`);
    const { ax, ap } = G.aimOf(key, null, 'chest');
    assert.ok(Math.abs(x + w / 2 - ax) < 0.01 && Math.abs(y + hh / 2 - ap) < 0.01, `${key}: точка прицілювання в центрі плити`);
  }
  const [, , , w, hh] = G.KZ.ipsc;
  assert.ok(Math.abs(m('ipsc', w) - 0.15) < 0.005 && Math.abs(m('ipsc', hh) - 0.3) < 0.005);
  assert.ok(m('gong', G.KZ.gong[3]) * 2 <= 0.3, 'зона гонга не більша за гонг');
});

test('зони ураження: торс («легкий рівень») накриває плиту, голова — коло ≈16 см', () => {
  for (const key of ['man', 'kneel']) {
    const plate = G.zonesOf(key, null, false).body.kz; const torso = G.zonesOf(key, null, true).body.kz;
    assert.ok(torso[1] <= plate[1] && torso[2] <= plate[2] + 1e-9 && torso[1] + torso[3] >= plate[1] + plate[3] && torso[2] + torso[4] >= plate[2] + plate[4], key);
    const head = G.zonesOf(key, null, false).head;
    assert.ok(head && Math.abs(head.kz[3] * G.TGT[key].h - 0.08) < 0.005, `${key}: голова`);
    assert.deepEqual(G.aimOf(key, null, 'head'), head, `${key}: «голова» цілиться в голову`);
  }
});

// Своя таблиця DOPE: знята за +25 °C на рівні моря, M855 з 16″, приціл 7 см, пристрілка 100 м
const ROWS = [[100, 0], [200, 0.8], [300, 1.9], [400, 3.2], [500, 4.8], [600, 6.6]].map(([distance, mrad]) => ({ distance, mrad }));
const WX = { tC: 25, alt: 0, bc: 0.151, model: 'G7', mv: 915, sh: 7, zero: 100, ammo: 'M855' };
const dope = (extra = {}) => {
  const key = `my:test-${Math.random()}`;
  G.LOADS[key] = G.myLoad({ id: 'x', label: 'Тест · DOPE', rows: ROWS, zero: 100, windSpeed: null, reticle: 'mil', ...extra });
  return key;
};

test('своя таблиця без погоди чи без BC: за будь-якої погоди — цифри таблиці як є', () => {
  const kit = dope();
  const std = G.atmTab(kit, '0', 15, 0).H;
  for (const [tC, alt] of [[-30, 0], [40, 2500]]) assert.deepEqual(G.atmTab(kit, '0', tC, alt).H, std);
  assert.ok(Math.abs(G.at(std, 300) - 1.9) < 1e-9 && Math.abs(G.at(std, 500) - 4.8) < 1e-9);
});

test('своя таблиця з погодою: за її погоди — як є, за іншої — та сама поправка, що в «Поправки зараз»', () => {
  const kit = dope({ wx: WX });
  const own = G.atmTab(kit, '0', WX.tC, WX.alt).H;
  for (const d of [100, 300, 500, 600]) assert.ok(Math.abs(G.at(own, d) - M.dopeAt(ROWS, d, 100)) < 1e-9, `${d} м за погоди таблиці`);
  // now.js: tab + dn − db, де dn і db — solve() за погоди зараз і за погоди таблиці (крок 10 м)
  const run = (tC, alt) => solve({ bc: WX.bc, model: WX.model, mv: WX.mv, sh: WX.sh, zero: WX.zero, tC, alt, max: 800, step: 10 });
  for (const [tC, alt] of [[-20, 0], [40, 0], [15, 2000]]) {
    const H = G.atmTab(kit, '0', tC, alt).H; const now = run(tC, alt); const base = run(WX.tC, WX.alt);
    for (const d of [200, 400, 600]) {
      const want = M.dopeAt(ROWS, d, 100) + now.H[d / 10 - 1] - base.H[d / 10 - 1];
      assert.ok(Math.abs(G.at(H, d) - want) < 0.003, `${tC} °C ${alt} м, ${d} м: ${G.at(H, d).toFixed(3)} проти ${want.toFixed(3)}`);
    }
  }
  assert.ok(G.at(G.atmTab(kit, '0', -20, 0).H, 600) > 6.6 + 0.1, 'мороз — більше, ніж у таблиці');
});

test('своя таблиця з погодою під сітку MOA: зсув у тих самих одиницях, що й таблиця', () => {
  const mil = dope({ wx: WX }); const moa = dope({ wx: WX, reticle: 'moa' });
  const dMil = G.at(G.atmTab(mil, '0', -20, 0).H, 600) - G.at(G.atmTab(mil, '0', WX.tC, 0).H, 600);
  const dMoa = G.at(G.atmTab(moa, '0', -20, 0).H, 600) - G.at(G.atmTab(moa, '0', WX.tC, 0).H, 600);
  assert.ok(Math.abs(dMoa * G.MOA_IN_MRAD - dMil) < 1e-9 && dMil > 0.1);
});
