// «Поправки зараз»: ствол, приціл, набій, дистанція, погода й вітер → що крутити й куди виносити, крупно.
// Джерело — своя таблиця DOPE (з поправкою на погоду, якщо відомо, за якої погоди її складено) або розрахунок за BC і швидкістю.
// Тут же клітинки поправок для таблиці DOPE у картці зброї: одна логіка одиниць на обидва місця.
import { h, fmt, sheet, toast, chips, selectOptions } from './ui.js';
import { t } from './i18n.js';
import * as M from './model.js';
import { solve } from './ballistics.js';
import { num } from './target.js';
import { tripWeather, forecastAt } from './forecast.js';

const unitName = (u) => (u === 'moa' ? 'MOA' : 'MRAD');
const gridUnit = (reticle) => (reticle === 'mil' || reticle === 'moa' ? reticle : null);
// Знаки після коми для кроку кліку: 0,1 MRAD — один, ¼ MOA і 0,13 MRAD — два
const clickDigits = (c) => (Number.isInteger(Number((c.value * 10).toFixed(6))) ? 1 : 2);

/** Кліки барабана на кут mrad (без знака); null — ціни кліку немає. toFixed прибирає 3,4999… → 3. */
export function clicksOf(mrad, click) {
  const c = M.clickValue(click);
  return c ? Math.round(Number((Math.abs(M.fromMrad(mrad, c.unit)) / c.value).toFixed(6))) : null;
}

/**
 * Барабан і сітка в одних одиницях — одна колонка «Поправка» (крутити чи виносити — те саме число); інакше дві.
 * Ціни кліку немає, а сітка в мілах чи MOA — теж одна: барабан тоді в тих самих одиницях.
 */
export const oneColumn = (click, reticle) => {
  const c = M.clickValue(click); const grid = gridUnit(reticle);
  return c ? c.unit === grid : !!grid;
};

/**
 * Вертикальна поправка клітинками [{ main, sub }]: одна (oneColumn) або «Барабан» і «Винос».
 * main — що робити, sub — ті самі числа в решті одиниць; сантиметри — на цілі на дистанції distance.
 */
export function elevCells(mrad, distance, click, reticle) {
  const c = M.clickValue(click); const grid = gridUnit(reticle);
  const cm = M.fromMrad(Math.abs(mrad), 'cm', distance);
  const cmText = cm === null ? null : `${num(cm, 0)} ${t('см')}`;
  if (Math.abs(mrad) < 0.0005) return oneColumn(click, reticle) ? [{ main: '0', sub: null }] : [{ main: '0', sub: null }, { main: '0', sub: null }];
  const arrow = mrad > 0 ? '↑' : '↓';
  const clicks = clicksOf(mrad, click);
  if (oneColumn(click, reticle)) {
    return c ? [{ main: `${arrow} ${num(clicks * c.value, clickDigits(c))} ${unitName(c.unit)}`, sub: [t('{n} кл.', { n: clicks }), cmText].filter(Boolean).join(' · ') }]
      : [{ main: `${arrow} ${num(Math.abs(M.fromMrad(mrad, grid)), 1)} ${unitName(grid)}`, sub: cmText }];
  }
  const dial = c ? { main: `${arrow} ${t('{n} кл.', { n: clicks })}`, sub: `${num(clicks * c.value, clickDigits(c))} ${unitName(c.unit)}` }
    : { main: `${arrow} ${num(Math.abs(mrad), 2)} MRAD`, sub: null };
  const hold = grid ? { main: `${arrow} ${num(Math.abs(M.fromMrad(mrad, grid)), 1)} ${unitName(grid)}`, sub: cmText } : { main: `${arrow} ${cmText}`, sub: null };
  return [dial, hold];
}

/** Знос вітром клітинкою { main, sub }: винос по сітці (без сітки — см), під ним кліки й сантиметри; arrow — куди виносити. */
export function windCell(mrad, distance, click, reticle, arrow = '') {
  if (!(Math.abs(mrad) >= 0.0005)) return { main: '0', sub: null };
  const grid = gridUnit(reticle); const a = Math.abs(mrad);
  const cm = `${num(M.fromMrad(a, 'cm', distance), 0)} ${t('см')}`;
  const clicks = clicksOf(a, click);
  const lead = arrow ? `${arrow} ` : '';
  return grid ? { main: `${lead}${num(M.fromMrad(a, grid), 1)} ${unitName(grid)}`, sub: [clicks ? t('{n} кл.', { n: clicks }) : null, cm].filter(Boolean).join(' · ') }
    : { main: `${lead}${cm}`, sub: clicks ? t('{n} кл.', { n: clicks }) : null };
}

/** Клітинка таблиці: головне жирним, решта дрібно другим рядком. */
export const cellTd = ({ main, sub }) => h('td', {}, h('span', { class: 'dc-main' }, main), sub ? h('small', { class: 'dc-sub' }, sub) : null);

/**
 * Чи застаріла таблиця: її рахували для іншої пристрілки чи висоти прицілу, ніж стоять у прицілі зараз.
 * Повертає текст попередження або null; таблиці без умов розрахунку (введені руками) не застарівають.
 */
export function staleText(cond, scope) {
  if (!cond) return null;
  const zero = scope?.zero > 0 ? scope.zero : 100; const sh = scope?.sh > 0 ? scope.sh : 6;
  const diff = [cond.zero && cond.zero !== zero ? t('пристрілка {a} → {b} м', { a: cond.zero, b: zero }) : null,
    cond.sh && cond.sh !== sh ? t('приціл над стволом {a} → {b} см', { a: fmt.num(cond.sh), b: fmt.num(sh) }) : null].filter(Boolean);
  return diff.length ? t('Таблицю рахували для інших налаштувань прицілу ({d}). Перерахуйте: «Змінити» → «Розрахувати».', { d: diff.join(', ') }) : null;
}

/** Умови таблиці коротко: «+15 °C · 0 м». */
export const condText = (cond) => (cond?.tC !== null && cond?.tC !== undefined
  ? `${cond.tC > 0 ? '+' : cond.tC < 0 ? '−' : ''}${fmt.num(Math.abs(cond.tC))} °C · ${fmt.num(cond.alt ?? 0)} ${t('м')}` : null);

// Значення таблиці solve() (крок 10 м) на будь-якій дистанції: лінійно між точками; ближче 10 м чи далі — null
const pick = (arr, d) => {
  if (!arr || !(d >= 10)) return null;
  const i = d / 10 - 1; const lo = Math.floor(i); const hi = Math.ceil(i);
  if (hi >= arr.length) return null;
  return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (i - lo);
};

const DISTS = [100, 200, 300, 400, 500, 600, 700, 800];
const OUT_NOTE = () => t('* Далі за свою таблицю — розрахунок за балістикою набою.');
const WX_KEY = 'shooters-log:now-wx';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) ?? null; } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватний режим */ } };
const btn = (label, onclick, kind = '') => h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);

/**
 * Екран «Поправки зараз» для ствола. ctx: weapon, ammo — набої калібру, chronoMv(c) — швидкість з хронографа,
 * suppressor — глушник стоїть (як минулого разу), clockPicker(select, opts), switchLabel(input, text), locate(),
 * reticleOf(scope) — сітка, як у картці зброї, dope() — таблиці ствола зараз, saveDope(card) — нова таблиця DOPE, uid().
 */
export function nowSheet(ctx) {
  const w = ctx.weapon;
  const KEY = `shooters-log:now:${w.id}`;
  const saved = read(KEY) ?? {};
  const wx = { tC: 15, alt: 0, ...(read(WX_KEY) ?? {}) };
  const scopes = w.scopes ?? [];
  const scopeSel = h('select', { 'aria-label': t('Приціл') }, selectOptions(scopes.map((s) => [s.id, s.name]),
    scopes.some((s) => s.id === saved.scopeId) ? saved.scopeId : M.defaultScope(w)?.id ?? scopes[0]?.id));
  const scope = () => scopes.find((s) => s.id === scopeSel.value) ?? null;
  // Таблиці беремо щоразу з обліку: щойно збережена тут же стає джерелом
  const tables = () => (ctx.dope?.() ?? w.dope ?? []).filter((d) => d.scopeId === scopeSel.value);
  // Набій: з BC і швидкістю або зі своєю таблицею для цього прицілу
  const ammoList = () => ctx.ammo.filter((c) => (c.bc > 0 && c.mv > 0) || tables().some((d) => d.cartridgeId === c.id));
  const cartSel = h('select', { 'aria-label': t('Набій') });
  const fillAmmo = () => {
    const list = ammoList(); const keep = cartSel.value || saved.cid;
    cartSel.replaceChildren(...selectOptions(list.map((c) => [c.id, c.name]), list.some((c) => c.id === keep) ? keep : list[0]?.id));
  };
  fillAmmo();
  const cart = () => ctx.ammo.find((c) => c.id === cartSel.value) ?? null;

  const temp = h('input', { type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': t('Температура, °C') });
  const alt = h('input', { type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': t('Висота над морем, м') });
  temp.value = String(wx.tC); alt.value = String(wx.alt);
  const wxInfo = h('p', { class: 'muted small now-wx-info' });
  const speed = h('input', { type: 'number', inputmode: 'decimal', min: 0, max: 20, step: 'any', placeholder: t('Вітер, м/с') });
  speed.value = saved.ws ? String(saved.ws) : '';
  const clock = h('select', { 'aria-label': t('Звідки вітер') },
    selectOptions(Array.from({ length: 12 }, (_, i) => [String(i + 1), t('з {n} год', { n: i + 1 })]), String(saved.clock ?? 3)));
  let dist = saved.d ?? 300;
  const distIn = h('input', { type: 'number', inputmode: 'numeric', min: 10, max: 800, step: 1, placeholder: '450', class: 'now-dist-in' });
  const sup = h('input', { type: 'checkbox', role: 'switch' });
  sup.checked = !!ctx.suppressor;
  const supRow = ctx.switchLabel(sup, t('З глушником'));

  const big = h('div', { class: 'now-big', 'aria-live': 'polite' });
  const tableBox = h('div', { class: 'now-table' });
  const distChips = h('div', {});

  /** Усе, від чого залежить відповідь: приціл, набій, пристрілка, обидві балістики й таблиця. */
  const model = () => {
    const sc = scope(); const c = cart();
    const zero = sc?.zero > 0 ? sc.zero : 100; const sh = sc?.sh > 0 ? sc.sh : 6;
    const chrono = c ? ctx.chronoMv(c) : null;
    const mv = c ? Math.round(chrono ?? c.mv ?? 0) : 0;
    const can = c?.bc > 0 && mv > 0;
    const tC = Number(temp.value.replace(',', '.')); const al = Number(alt.value.replace(',', '.'));
    const air = { tC: Number.isFinite(tC) ? tC : 15, alt: Number.isFinite(al) ? al : 0 };
    const run = (x) => (can ? solve({ bc: c.bc, model: c.dragModel || 'G7', mv, sh, zero, tC: x.tC, alt: x.alt ?? 0, max: 800, step: 10 })
      ?? solve({ bc: c.bc, model: c.dragModel || 'G7', mv, sh, zero, tC: x.tC, alt: x.alt ?? 0, max: 400, step: 10 }) : null);
    const list = c ? tables().filter((d) => d.cartridgeId === c.id) : [];
    // Свіжа таблиця з відомою погодою — найкраща; застарілу (інша пристрілка чи висота прицілу) не змішуємо
    const table = list.find((d) => d.cond?.tC !== undefined && d.cond?.tC !== null && !staleText(d.cond, sc)) ?? list.find((d) => !staleText(d.cond, sc)) ?? null;
    const stale = !table && list.length ? staleText(list[0].cond, sc) : null;
    const now = run(air);
    const base = table?.cond && table.cond.tC !== null && table.cond.tC !== undefined && can ? run(table.cond) : null;
    // Глушник — як у картці таблиці: зсув з прицілу, менше пів кліку не крутимо
    const shift = M.supShiftFor(sc, c?.id);
    const worth = (mrad) => { const k = M.clickValue(sc?.click); return k ? Math.abs(M.fromMrad(mrad, k.unit)) / k.value >= 0.5 : Math.abs(mrad) >= 0.05; };
    const f = shift ? M.suppressorFix(sup.checked, sc?.zeroSuppressor, shift) : null;
    const fix = f && { x: worth(f.x) ? f.x : 0, y: worth(f.y) ? f.y : 0 };
    return { sc, c, zero, sh, mv, chrono: !!chrono, can, air, now, base, table, stale, shift, fix };
  };

  /** Вертикаль на дистанції d, мрад (плюс — вгору), і звідки: src — table-wx | table | table-nowx | calc | calc-out. */
  const holdAt = (m, d) => {
    let r = null;
    if (m.table) {
      const tab = M.dopeAt(m.table.rows, d, m.zero);
      if (tab !== null) {
        const dn = pick(m.now?.H, d); const db = pick(m.base?.H, d);
        if (m.base && dn !== null && db !== null && Math.abs(dn - db) >= 0.005) r = { mrad: tab + dn - db, src: 'table-wx', delta: dn - db };
        else r = { mrad: tab, src: m.table.cond?.tC !== undefined && m.table.cond?.tC !== null ? 'table' : 'table-nowx' };
      }
    }
    if (!r && m.now) { const v = pick(m.now.H, d); if (v !== null) r = { mrad: v, src: m.table ? 'calc-out' : 'calc' }; }
    if (r && m.fix) r.mrad += m.fix.y;
    return r;
  };
  /** Знос при вітрі v м/с з години h12, мрад без знака; з таблиці, якщо в ній є колонка вітру, інакше з розрахунку. */
  const windAt = (m, d, v, h12) => {
    if (!(v > 0)) return 0;
    const share = M.windShare(h12);
    const p = pick(m.now?.W, d);
    if (m.table?.windSpeed > 0) {
      const b = M.windAt(m.table.rows, d);
      // Погода інша, ніж у таблиці, — знос з таблиці міняється в тій самій пропорції, що й за розрахунком
      const pb = pick(m.base?.W, d); const k = p !== null && pb > 0 ? p / pb : 1;
      if (b !== null) return ((b * v * share) / m.table.windSpeed) * k;
    }
    return p === null ? null : p * v * share;
  };

  const srcText = (m, r) => {
    const calc = m.can ? `${m.c.dragModel || 'G7'} ${fmt.num(m.c.bc)} · ${m.mv} ${t('м/с')} (${m.chrono ? t('хронограф') : t('з картки набою')}) · ${t('пристрілка {n} м', { n: m.zero })} · ${t('приціл {n} см над стволом', { n: fmt.num(m.sh) })}` : '';
    return {
      'table-wx': t('Зі своєї таблиці DOPE + поправка на погоду: таблиця для {a}, зараз {b} ({d} MRAD).', { a: condText(m.table?.cond), b: condText(m.air), d: `${r.delta >= 0 ? '+' : '−'}${num(Math.abs(r.delta), 2)}` }),
      table: m.can ? t('Зі своєї таблиці DOPE ({a}): погода та сама.', { a: condText(m.table?.cond) })
        : t('Зі своєї таблиці DOPE ({a}). У набою немає BC чи швидкості — поправки на погоду немає.', { a: condText(m.table?.cond) }),
      'table-nowx': t('Зі своєї таблиці DOPE. Погоду таблиці не вказано, тому поправки на погоду немає. Температуру можна вписати в таблиці: «Змінити».'),
      'calc-out': t('Далі за свою таблицю рахуємо за балістикою: {c}.', { c: calc }),
      calc: t('Розрахунок: {c}.', { c: calc }),
    }[r.src];
  };

  const paint = () => {
    const m = model();
    write(KEY, { scopeId: scopeSel.value, cid: cartSel.value, d: dist, ws: Number(speed.value.replace(',', '.')) || 0, clock: Number(clock.value) });
    write(WX_KEY, m.air);
    distChips.replaceChildren(Object.assign(chips(DISTS.map((x) => [String(x), String(x)]), DISTS.includes(dist) ? String(dist) : '', (v) => {
      dist = Number(v); distIn.value = ''; paint();
    }), { className: 'chips now-dists' }));
    supRow.hidden = !m.shift;
    if (!m.c) { big.replaceChildren(h('p', { class: 'muted' }, t('Немає набою з BC і швидкістю чи своєю таблицею для цього прицілу. Заповніть балістику в картці набою.'))); tableBox.replaceChildren(); return; }
    const r = holdAt(m, dist);
    const click = m.sc?.click; const ret = ctx.reticleOf(m.sc);
    if (!r) {
      big.replaceChildren(h('p', { class: 'muted' }, m.can ? t('Куля не долітає до {d} м — перевірте BC і швидкість', { d: dist })
        : t('Поза таблицею, а розрахувати нема з чого: заповніть BC і швидкість набою або додайте рядок у таблицю.')));
    } else {
      const v = Number(speed.value.replace(',', '.')) || 0; const h12 = Number(clock.value);
      const wd = windAt(m, dist, v, h12);
      const cells = elevCells(r.mrad, dist, click, ret);
      const tof = pick(m.now?.T, dist); const vel = pick(m.now?.V, dist);
      big.replaceChildren(...[
        h('div', { class: 'now-dist' }, t('{d} м', { d: dist })),
        h('div', { class: 'now-main' }, cells[0].main),
        h('div', { class: 'now-sub' }, [cells[0].sub, cells[1] ? `${t('винос')} ${cells[1].main}${cells[1].sub ? ` · ${cells[1].sub}` : ''}` : null].filter(Boolean).join(' · ')),
        v > 0 && wd !== null ? h('div', { class: 'now-wind' }, wd < 0.0005 ? `${t('Вітер')}: ${t('без поправки')}`
          : (() => { const wc = windCell(wd, dist, click, ret, h12 < 6 ? '→' : '←'); return `${t('Вітер')}: ${wc.main}${wc.sub ? ` · ${wc.sub}` : ''}`; })()) : null,
        tof !== null ? h('div', { class: 'muted small' }, t('Час польоту {t} с · швидкість {v} м/с', { t: num(tof, 2), v: Math.round(vel) })) : null,
        m.fix && (m.fix.x || m.fix.y) ? h('div', { class: 'muted small' }, t('З поправкою на глушник')) : null,
        m.shift && typeof m.sc?.zeroSuppressor !== 'boolean'
          ? h('div', { class: 'muted small' }, t('Чи пристрілювали приціл з глушником, не вказано, тож поправку на глушник не враховано. Відповісти можна в картці таблиці DOPE.')) : null,
        h('p', { class: 'muted small now-src' }, srcText(m, r)),
        m.stale ? h('p', { class: 'warn-text small' }, m.stale) : null].filter(Boolean));
    }
    paintTable(m);
  };

  const paintTable = (m) => {
    const click = m.sc?.click; const ret = ctx.reticleOf(m.sc); const one = oneColumn(click, ret);
    const v = Number(speed.value.replace(',', '.')) || 0; const h12 = Number(clock.value);
    const rows = DISTS.map((d) => ({ d, r: holdAt(m, d) })).filter((x) => x.r);
    if (!rows.length) { tableBox.replaceChildren(); return; }
    const windHead = v > 0 ? t('Вітер {v} м/с', { v: fmt.num(v) }) : null;
    tableBox.replaceChildren(h('h4', {}, t('На всі дистанції за цієї погоди')),
      h('table', { class: 'dope' },
        h('thead', {}, h('tr', {}, h('th', {}, t('м')), ...(one ? [h('th', {}, t('Поправка'))] : [h('th', {}, t('Барабан')), h('th', {}, t('Винос'))]),
          windHead ? h('th', {}, windHead) : null)),
        h('tbody', {}, ...rows.map(({ d, r }) => {
          const wd = windHead ? windAt(m, d, v, h12) : null;
          return h('tr', { class: d === dist ? 'zero' : '', onclick: () => { dist = d; distIn.value = ''; paint(); } },
            h('td', {}, `${fmt.num(d)}${r.src === 'calc-out' ? '*' : ''}`), ...elevCells(r.mrad, d, click, ret).map(cellTd),
            windHead ? cellTd(wd === null ? { main: '—', sub: null } : windCell(wd, d, click, ret, h12 < 6 ? '→' : '←')) : null);
        }))),
      rows.some((x) => x.r.src === 'calc-out') ? h('p', { class: 'muted small' }, OUT_NOTE()) : null);
  };

  /** Таблиця DOPE з цих чисел: 25, 50, 100…700 м, вітер — на 5 м/с збоку, з умовами розрахунку. */
  const saveTable = async () => {
    const m = model();
    if (!m.c) return;
    // Рядки з таблиці без відомої погоди (чи без BC, щоб її врахувати) не перераховано — погоду таким не приписуємо
    let blind = false;
    const rows = [25, 50, ...Array.from({ length: 13 }, (_, i) => 100 + i * 50)].map((d) => {
      const r = holdAt(m, d); if (!r) return null;
      if (r.src === 'table-nowx' || (r.src === 'table' && !m.can)) blind = true;
      const wd = windAt(m, d, 5, 3);
      const mrad = Math.round((r.mrad - (m.fix?.y ?? 0)) * 1000) / 1000 || 0;
      return wd > 0 ? { distance: d, mrad, wind: Math.round(wd * 1000) / 1000 } : { distance: d, mrad };
    }).filter(Boolean);
    if (!rows.length) { toast(t('Нема чого зберегти')); return; }
    const card = { id: ctx.uid(), scopeId: m.sc?.id ?? null, cartridgeId: m.c.id, unit: M.clickValue(m.sc?.click) ? 'click' : 'mil', rows,
      windSpeed: rows.some((r) => r.wind) ? 5 : null,
      note: blind ? t('Поправки зараз: зі своєї таблиці, погода невідома') : t('Поправки зараз: {c}', { c: condText(m.air) }),
      cond: blind ? { zero: m.zero, sh: m.sh, mv: m.mv } : { tC: m.air.tC, alt: m.air.alt, zero: m.zero, sh: m.sh, mv: m.mv } };
    await ctx.saveDope(card);
    toast(t('Таблицю збережено в DOPE ствола'));
  };

  /** Картка картинкою: біле тло, чорний текст — читається на сонці й друкується. */
  const picture = () => {
    const m = model(); if (!m.c) return;
    const click = m.sc?.click; const ret = ctx.reticleOf(m.sc);
    const v = Number(speed.value.replace(',', '.')) || 0; const h12 = Number(clock.value);
    const held = DISTS.map((d) => ({ d, r: holdAt(m, d) })).filter((x) => x.r);
    const out = held.some((x) => x.r.src === 'calc-out');
    const rows = held.map(({ d, r }) => {
      const c = elevCells(r.mrad, d, click, ret); const wd = v > 0 ? windAt(m, d, v, h12) : null;
      return [`${d}${r.src === 'calc-out' ? '*' : ''}`, c.map((x) => x.main).join('  '), c.map((x) => x.sub).filter(Boolean).join(' · '), wd ? windCell(wd, d, click, ret, h12 < 6 ? '→' : '←').main : ''];
    });
    const W = 760; const rh = 44; const top = 112;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = top + rh * rows.length + (out ? 64 : 40);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, cv.height);
    g.fillStyle = '#111'; g.font = '700 26px system-ui, sans-serif'; g.fillText(`${w.name} · ${m.c.name}`, 16, 38, W - 32);
    g.fillStyle = '#555'; g.font = '500 17px system-ui, sans-serif';
    g.fillText([m.sc?.name, t('пристрілка {n} м', { n: m.zero }), condText(m.air), v > 0 ? `${t('вітер')} ${fmt.num(v)} ${t('м/с')} ${t('з {n} год', { n: h12 })}` : null].filter(Boolean).join(' · '), 16, 66, W - 32);
    g.font = '600 15px system-ui, sans-serif'; g.fillText(t('м'), 16, top - 14); g.fillText(t('Поправка'), 90, top - 14); if (v > 0) g.fillText(t('Вітер'), 600, top - 14);
    rows.forEach((r, j) => {
      const y = top + rh * j;
      if (j % 2 === 0) { g.fillStyle = '#f0f0ec'; g.fillRect(8, y, W - 16, rh); }
      g.fillStyle = '#111'; g.font = '700 20px ui-monospace, Consolas, monospace'; g.fillText(r[0], 16, y + 28); g.fillText(r[1], 90, y + 22, 500);
      g.fillStyle = '#555'; g.font = '500 14px system-ui, sans-serif'; g.fillText(r[2], 90, y + 39, 500);
      g.fillStyle = '#111'; g.font = '600 18px ui-monospace, Consolas, monospace'; g.fillText(r[3], 600, y + 28, 150);
    });
    g.fillStyle = '#888'; g.font = '500 13px system-ui, sans-serif'; g.fillText(`Shooter’s Log · ${fmt.date(M.today())}`, 16, cv.height - 12);
    if (out) { g.fillStyle = '#555'; g.font = '500 15px system-ui, sans-serif'; g.fillText(OUT_NOTE(), 16, cv.height - 36, W - 32); }
    const file = `popravky-${w.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`;
    cv.toBlob((b) => {
      if (!b) return;
      const fl = new File([b], file, { type: 'image/png' });
      if (navigator.canShare?.({ files: [fl] })) { navigator.share({ files: [fl] }).catch(() => {}); return; }
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: file });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };

  // Погода: «зараз тут» — температура й висота за GPS, «на день виїзду» — прогноз на дату й місце
  const setWx = ({ temp: tc, elevation }, label) => {
    temp.value = String(Math.round(tc));
    if (elevation !== null && elevation !== undefined) alt.value = String(Math.round(elevation));
    wxInfo.textContent = label;
    paint();
  };
  const hereBtn = btn(t('Зараз тут'), async () => {
    hereBtn.disabled = true; wxInfo.textContent = t('Визначаю…');
    try {
      const pos = await ctx.locate();
      if (!pos) { wxInfo.textContent = ''; return; }
      const hr = new Date().getHours();
      setWx(await forecastAt(pos, M.today(), hr), t('Погода зараз за місцем телефона'));
    } catch { wxInfo.textContent = ''; toast(t('Не вдалося отримати погоду')); } finally { hereBtn.disabled = false; }
  }, 'mini');
  const trip = tripWeather({ locate: ctx.locate, onWeather: (x) => { setWx(x, t('Прогноз: {p}, {d} {t}', { p: x.place, d: fmt.date(x.date), t: x.time })); trip.hidden = true; } });
  trip.hidden = true;
  const tripBtn = btn(t('На день виїзду'), () => { trip.hidden = !trip.hidden; }, 'mini');

  for (const el of [temp, alt, speed]) el.addEventListener('input', () => { if (el !== speed) wxInfo.textContent = ''; paint(); });
  clock.addEventListener('change', paint);
  sup.addEventListener('change', paint);
  scopeSel.addEventListener('change', () => { fillAmmo(); paint(); });
  cartSel.addEventListener('change', paint);
  distIn.addEventListener('input', () => { const v = Number(distIn.value); if (v >= 10 && v <= 800) { dist = Math.round(v); paint(); } });

  const label = (text, el) => h('label', { class: 'field half' }, h('span', { class: 'field-label' }, text), el);
  const body = h('div', { class: 'now' },
    h('div', { class: 'form' }, scopes.length > 1 ? label(t('Приціл'), scopeSel) : null, label(t('Набій'), cartSel)),
    supRow,
    h('h4', {}, t('Дистанція')), distChips, h('div', { class: 'form' }, label(t('Інша дистанція, м'), distIn)),
    big,
    h('h4', {}, t('Погода')),
    h('div', { class: 'form' }, label(t('Температура, °C'), temp), label(t('Висота над морем, м'), alt)),
    h('div', { class: 'btn-row' }, hereBtn, tripBtn), trip, wxInfo,
    h('h4', {}, t('Вітер')), h('div', { class: 'dope-calc windy' }, speed, clock),
    tableBox,
    h('div', { class: 'btn-row' }, btn(t('Зберегти як таблицю DOPE'), saveTable), btn(t('Картинкою'), picture)));
  ctx.clockPicker(clock, { speed, hideSpeed: true });
  sheet(t('Поправки зараз · {n}', { n: w.name }), body, { full: true });
  paint();
}
