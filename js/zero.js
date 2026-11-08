// Майстер пристрілки: ствол і приціл відомі з картки. Стріляєш групу → тапаєш влучання на схемі мішені (або розмічаєш фото) →
// поправка барабана в кліках, як прийнято: кучність нормальна й СТВ поза допуском — крутиш усю поправку одразу.
// «Готово» — пристрілка записується в приціл.
// Сесія пам'ятається на пристрої (на приціл): закрив застосунок між групами — продовжиш з того ж місця.
import { h, fmt, sheet, chips, toast } from './ui.js';
import { t } from './i18n.js';
import * as M from './model.js';
import { solve } from './ballistics.js';
import { corrections, num } from './target.js';

const ZEROS = [50, 100, 200, 300];
const RANGES = [25, 50, 100, 200, 300];
const SPANS = [5, 10, 20, 40, 80, 160];
// Клітинка сітки на схемі: пів-розміру схеми ±5 см → 1 см … ±160 см → 40 см
const cellOf = (S) => (S <= 5 ? 1 : S <= 10 ? 2 : S <= 20 ? 5 : S <= 40 ? 10 : S <= 80 ? 20 : 40);
const KEY = (id) => `shooters-log:zero:${id}`;
const btn = (label, onclick, kind = '') => h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
const recall = (id) => { try { return JSON.parse(localStorage.getItem(KEY(id))) ?? null; } catch { return null; } };
const keep = (id, v) => { try { if (v) localStorage.setItem(KEY(id), JSON.stringify(v)); else localStorage.removeItem(KEY(id)); } catch { /* приватний режим */ } };
const spanFor = (d) => (d <= 50 ? 10 : d <= 150 ? 20 : 40);

/**
 * Де має влучати група на дистанції стрільби d, щоб приціл був пристріляний на zero: мм вище точки прицілювання (нижче — мінус).
 * Спершу таблиця DOPE цього прицілу (перепристрілка — зсув усіх поправок на сталий кут), далі балістика набою; null — нема чим порахувати.
 */
export function wantUpMm({ d, zero, dope, c, mv, sh }) {
  if (d === zero) return { mm: 0, src: 'same' };
  const fromDope = dope?.(d); const atZero = dope?.(zero);
  if (fromDope != null && atZero != null) return { mm: -(fromDope - atZero) * d, src: 'dope' };
  if (c?.bc > 0 && mv > 0) {
    const step = 5; const max = Math.ceil(Math.max(d, zero) / step) * step;
    const res = solve({ bc: c.bc, model: c.dragModel || 'G7', mv, sh: sh ?? M.SIGHT_H, zero, max, step });
    const hold = res?.H?.[Math.round(d / step) - 1];
    if (hold != null) return { mm: -hold * d, src: 'calc' };
  }
  return null;
}

/**
 * ctx: weapon, scope, ammo — набої калібру [{ id, name, bc, mv, dragModel }], cartridgeId — останній,
 * chronoMv(c) — швидкість із хронографа, dope(cid) → (d) → мрад поправки з таблиці або null,
 * saveScope(patch), photoGroup({ cartridgeId, distance, zeroUp }, onStats) — розмітка фото мішені.
 */
const HELP = {
  uk: [
    ['Як це працює', ['Вибери набій, на яку дистанцію пристрілюєш (нуль) і звідки стріляєш.', 'Відстріляй групу 3–5 пострілів у ту саму точку прицілювання.', 'Вкажи групу — майстер покаже, скільки кліків і куди крутити барабан.', 'Виставив — «Наступна група». Повторюй, доки не з’явиться «Пристріляно», тоді «Записати пристрілку» — дистанція, набій і дата ляжуть у картку прицілу.']],
    ['Три способи вказати групу', ['«Позначити на схемі» — тапай туди, куди влучила кожна куля; кружок у центрі — точка прицілювання. Повторний тап по влучанню прибирає його.', '«З фото мішені» — звичайна розмітка фото: вирівнювання, масштаб, пробоїни.', '«Ввести СТВ у см» — якщо вже знаєш, на скільки сантиметрів середня точка влучання (СТВ) пішла від точки прицілювання.']],
    ['Масштаб схеми', ['«Клітинка 1…40 см» — розмір клітинки сітки на схемі, як на твоїй мішені. Влучання не вміщаються — бери більшу клітинку; схема й сама розширюється, щоб було видно всі влучання (до ±160 см).']],
    ['Пристрілка з іншої дистанції', ['Стріляєш з 25 чи 50 м, а нуль хочеш на 100–300 м — група має лягти не в точку прицілювання, а трохи вище чи нижче. Майстер рахує це за таблицею DOPE прицілу або за балістикою набою (BC, швидкість, висота прицілу) і показує помаранчевим кільцем.']],
    ['Позначки на поправці', ['«у допуску ✓» — зсув по осі до 1 MOA (≈0,3 MRAD): крутити не треба.', 'Без позначки — крути всю поправку одразу й стріляй контрольну групу.', 'Група дуже розкидана — спершу шукай причину (упор, кріплення, набій): поправка за такою групою приблизна, крутити чи ні — вирішуєш сам.']],
    ['Коли «Пристріляно»', ['СТВ не далі 1 MOA від потрібної точки по обох осях, у групі щонайменше 3 постріли й група не «дуже розкидана». Лише тоді пристрілка записується в приціл.', 'Не встиг (скінчились набої чи час) — «Продовжу пізніше»: групи й накручені кліки збережуться на цьому пристрої, у картці прицілу буде «пристрілка не закінчена», а записана раніше пристрілка лишиться як була.']],
    ['Коли група «дуже розкидана»', ['Середній радіус (середня відстань пробоїн від СТВ) більший за 2 MOA. Це ≈ 1,5 см на 25 м, 2,9 см на 50 м, 5,8 см на 100 м; розліт крайніх пробоїн — приблизно в 2,5 раза більший (≈4 / 7 / 15 см) — як норма АК: 4 постріли в колі 15 см на 100 м.', 'Так прийнято: спершу кучність, потім барабан. Поправку видно, але «Пристріляно» за такою групою не буде — шукай причину: упор, кріплення прицілу, різні набої, хват.']],
    ['Барабан', ['Ціна кліку береться з картки прицілу; під поправкою видно, скільки це сантиметрів на дистанції стрільби.', 'Накручено від початку більше ≈12 MRAD (40 MOA) — попередження: ходу барабана може не вистачити, перевір кріплення й кільця.']],
  ],
};
const help = () => sheet(t('Як це працює'), h('div', { class: 'zero-help' },
  ...HELP.uk.map(([title, items]) => h('section', {}, h('h3', {}, title), h('ul', {}, ...items.map((x) => h('li', {}, x)))))));

export function zeroWizard(ctx) {
  const { weapon, scope, ammo } = ctx;
  const click = scope.click;
  const saved = recall(scope.id);
  const s = saved ?? {
    cid: ctx.cartridgeId && ammo.some((c) => c.id === ctx.cartridgeId) ? ctx.cartridgeId : ammo[0]?.id ?? '',
    zero: scope.zero ?? 100, d: scope.zero ?? 100, span: spanFor(scope.zero ?? 100), groups: [{ holes: [] }],
  };
  // З глушником чи без — DOPE за цим знає, коли поправляти барабан; сесія з минулої версії — як минулого разу
  s.sup ??= !!ctx.suppressor;
  const body = h('div', { class: 'zero' });
  const info = h('button', { type: 'button', class: 'hint-btn', 'aria-label': t('Як це працює'), onclick: () => help() }, 'i');
  const close = sheet(t('Пристрілка · {n}', { n: scope.name }), body, { full: true, tools: [info], onClose: ctx.onClose });
  const store = () => keep(scope.id, s);
  const cur = () => s.groups[s.groups.length - 1];
  const cart = () => ammo.find((c) => c.id === s.cid) ?? null;
  const want = () => {
    const c = cart();
    return wantUpMm({ d: s.d, zero: s.zero, dope: ctx.dope(s.cid), c, mv: c ? (ctx.gunMv?.(c)?.mv ?? c.mv) : null, sh: scope.sh });
  };
  const statsOf = (g) => g.stats ?? (g.holes.length ? M.groupStats(g.holes.map(([x, y]) => [x * 10, y * 10]), [0, 0]) : null);
  const reset = () => { s.groups = [{ holes: [] }]; store(); paint(); };

  // Схема мішені: сітка в см, хрестик — точка прицілювання, помаранчеве кільце — куди має лягти група (пристрілка на іншу дистанцію)
  const target = (g, wantCm) => {
    const need = Math.max(Math.abs(wantCm), ...g.holes.flat().map(Math.abs));
    const S = SPANS.find((v) => v >= s.span && v >= need) ?? SPANS[SPANS.length - 1]; const step = cellOf(S);
    let grid = '';
    for (let v = -S + step; v < S; v += step) grid += `<path d="M${v} ${-S}V${S}M${-S} ${v}H${S}" class="zg"/>`;
    const r = S * 0.04; const fs = S * 0.055;
    let labels = '';
    for (let v = step * 2; v < S; v += step * 2) {
      labels += `<text x="${v}" y="${fs * 2.1}" class="zl">${v}</text><text x="${-v}" y="${fs * 2.1}" class="zl">${v}</text>`;
      labels += `<text x="${fs * 1.3}" y="${-v + fs * 0.35}" class="zl l">${v}</text><text x="${fs * 1.3}" y="${v + fs * 0.35}" class="zl l">${v}</text>`;
    }
    // Рисочки по осях: лише посередині між лініями сітки (пів клітинки) — лінії сітки й так ділять на клітинки
    // На дрібних клітинках (1 і 2 см) ліній сітки й так багато — пів-рисок не малюємо
    const minor = S / step > 4 ? step : step / 2;
    let ticks = '';
    for (let k = Math.ceil(-S / minor); k * minor <= S; k++) {
      const v = Math.round(k * minor * 1000) / 1000; if (!v) continue;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6; const L = (major ? 0.7 : 0.4) * fs;
      ticks += `<path d="M${v} ${-L}V${L}M${-L} ${v}H${L}" class="zt${major ? ' m' : ''}"/>`;
    }
    labels = ticks + labels;
    labels += `<text x="0" y="${-S + fs * 1.3}" class="zl d">${t('вище')}</text><text x="0" y="${S - fs * 0.5}" class="zl d">${t('нижче')}</text>`;
    labels += `<text x="${-S + fs * 0.4}" y="${-fs * 0.6}" class="zl d l">${t('лівіше')}</text><text x="${S - fs * 0.4}" y="${-fs * 0.6}" class="zl d r">${t('правіше')}</text>`;
    const holes = g.holes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" class="zh"/>`).join('');
    const st = statsOf(g);
    const [mx, my] = st ? [st.center[0] / 10, st.center[1] / 10] : [0, 0];
    // Середній радіус групи — пунктирним колом навколо СТВ: видно, наскільки купно лягли постріли
    const mr = st && st.n >= 2 && !st.manual ? (st.meanRadius * M.mrBias(st.n)) / 10 : 0;
    const mid = st ? (mr ? `<circle cx="${mx}" cy="${my}" r="${mr}" class="zc-mr"/>` : '') + `<circle cx="${mx}" cy="${my}" r="${r * 1.6}" class="zc zc-ring"/><path d="M${mx - r * 2.6} ${my}h${r * 5.2}M${mx} ${my - r * 2.6}v${r * 5.2}" class="zc"/>`
      + `<text x="${mx + r * 2.2}" y="${my - r * 2.2}" class="zl zc-t">${t('СТВ')}</text>` : '';
    const goal = Math.abs(wantCm) > 0.05 ? `<circle cx="0" cy="${-wantCm}" r="${r * 2.6}" class="zw"/>` : '';
    const svg = h('div', { class: 'zero-tgt' });
    svg.innerHTML = `<svg viewBox="${-S} ${-S} ${2 * S} ${2 * S}" style="--zl:${fs}px">${grid}<path d="M${-S} 0H${S}M0 ${-S}V${S}" class="za"/>${labels}<circle r="${r * 1.2}" class="zp"/>${goal}${holes}${mid}</svg>
      <span class="zero-scale">${t('клітинка {n} см', { n: step })}</span>`;
    const el = svg.querySelector('svg');
    el.addEventListener('click', (e) => {
      if (g.stats || !el.isConnected) return;
      const m = el.getScreenCTM(); if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      // Тап біля наявної пробоїни — прибрати її, інакше — нова
      const near = g.holes.findIndex(([x, y]) => Math.hypot(x - p.x, y - p.y) < r * 1.3);
      if (near >= 0) g.holes.splice(near, 1); else g.holes.push([Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
      navigator.vibrate?.(8); store(); paint();
    });
    return svg;
  };

  let mode = 'tap';
  // Налаштування розкриті лише на початку нової пристрілки; далі — один рядок «набій · нуль · з дистанції»
  let setupOpen = !saved;
  // Розкрив налаштування сам — лишаємо розкритими; інакше з першим влучанням вони згортаються в рядок
  let setupTouched = false;
  // Ціна кліку прицілу й скільки це сантиметрів на цілі на дистанції стрільби
  const clickNote = () => {
    const cv = M.clickValue(click); if (!cv) return null;
    const mm = cv.unit === 'moa' ? cv.value * s.d * 0.29089 : cv.value * s.d;
    return h('p', { class: 'zero-click' }, t('Ціна кліку {c} — на {d} м це {cm} см', {
      c: `${num(cv.value, cv.value < 0.1 ? 3 : 2)} ${cv.unit === 'moa' ? 'MOA' : 'MRAD'}`, d: s.d, cm: num(mm / 10, mm < 10 ? 2 : 1) }));
  };
  // Масштаб, який реально показано: вибраний, але не менший, ніж треба, щоб влазили всі влучання
  const shownSpan = () => {
    const g = cur(); const need = Math.max(Math.abs((want()?.mm ?? 0) / 10), ...g.holes.flat().map(Math.abs));
    return SPANS.find((v) => v >= s.span && v >= need) ?? SPANS[SPANS.length - 1];
  };
  const manualForm = () => {
    const num = (ph) => h('input', { type: 'number', inputMode: 'decimal', step: 'any', placeholder: ph, class: 'zero-num' });
    const up = num('0'); const right = num('0'); const n = num('3'); n.value = '3';
    const add = () => {
      const v = (el) => Number(String(el.value).replace(',', '.')) || 0;
      const y = v(up) * 10; const x = v(right) * 10; const k = Math.max(1, Math.round(v(n)) || 1);
      s.groups[s.groups.length - 1] = { holes: [], stats: { manual: true, n: k, center: [x, -y], offset: [x, y], meanRadius: 0, spread: 0 } };
      mode = 'tap'; store(); paint();
    };
    return h('div', { class: 'zero-manual' },
      h('p', { class: 'muted small' }, t('Якщо вже знаєш СТВ — середню точку влучання групи (або її поміряли лінійкою на мішені, на скільки сантиметрів вона пішла від точки прицілювання), — впиши, і поправка порахується без тапів по схемі:')),
      h('label', {}, h('span', {}, t('СТВ вище, см (нижче — з мінусом)')), up),
      h('label', {}, h('span', {}, t('СТВ правіше, см (лівіше — з мінусом)')), right),
      h('label', {}, h('span', {}, t('Пострілів у групі')), n),
      btn(t('Порахувати поправку'), add, 'primary'));
  };

  function paint() {
    const c = cart(); const w = want(); const wantMm = w?.mm ?? 0; const wantCm = wantMm / 10;
    const g = cur(); const st = statsOf(g);
    // Налаштування: набій, на яку дистанцію пристрілюємо, звідки стріляємо, масштаб схеми
    const cartSel = h('select', { class: 'zero-sel', onchange: (e) => { s.cid = e.target.value; store(); paint(); } },
      ...(ammo.length ? ammo : [{ id: '', name: t('— не вказувати —') }]).map((x) => h('option', { value: x.id, selected: x.id === s.cid }, x.name)));
    const setup = h('div', { class: 'zero-setup' },
      h('label', {}, h('span', {}, t('Набій')), cartSel),
      h('div', {}, h('span', { class: 'zero-lab' }, t('Нуль на')), chips(ZEROS.map((v) => [v, `${v} ${t('м')}`]), s.zero, (v) => { s.zero = +v; reset(); })),
      h('div', {}, h('span', { class: 'zero-lab' }, t('Стріляю з')), chips(RANGES.map((v) => [v, `${v} ${t('м')}`]), s.d, (v) => { s.d = +v; s.span = spanFor(+v); reset(); })),
      ctx.hasSuppressor ? h('div', {}, h('span', { class: 'zero-lab' }, t('Глушник')),
        chips([['1', t('з глушником')], ['0', t('без')]], s.sup ? '1' : '0', (v) => { s.sup = v === '1'; store(); paint(); })) : null);
    // Куди має лягти група
    const goalText = !w ? t('Немає таблиці DOPE і BC/швидкості набою — вважаю, що влучання має бути в точку прицілювання. З {d} м на нуль {z} м це неточно.', { d: s.d, z: s.zero })
      : Math.abs(wantCm) < 0.05 ? t('Група має лягти в точку прицілювання')
        : t('З {d} м на нуль {z} м група має лягти на {cm} см {dir} точки прицілювання — помаранчеве кільце', { d: s.d, z: s.zero, cm: fmt.num(Math.round(Math.abs(wantCm) * 10) / 10), dir: t(wantCm > 0 ? 'вище' : 'нижче') })
          + (w.src === 'calc' ? ` (${t('розрахунок за BC і швидкістю набою')})` : w.src === 'dope' ? ` (${t('за таблицею DOPE')})` : '');
    // Поправка
    let verdict = null; let fixes = []; let done = false; let wide = false; let needTurn = false;
    if (st) {
      const err = [st.offset[0], st.offset[1] - wantMm];
      const moa = (mm) => M.toAngle(Math.abs(mm), s.d, 'moa');
      // По осі: до 1 MOA — у допуску (крутити не треба), далі — крутити всю поправку одразу
      const okAx = err.map((e) => moa(e) <= 1);
      fixes = corrections(st, { distance: s.d, click, wantUp: wantMm }).map((f) => ({ ...f, ok: okAx[/[↑↓]/.test(f.arrow) ? 1 : 0] }));
      // Пристріляно — лише коли СТВ близько до потрібної точки: до 1 MOA по кожній осі, або барабан грубіший і далі
      // крутити нічим (менше пів кліку). Без ціни кліку поправок нема взагалі — тоді лише за 1 MOA, а не «нема що крутити»
      const close = err.every((e) => moa(e) <= 1);
      // Як прийнято: спершу кучність. Середній радіус > 2 MOA (≈ розліт 5 MOA — норма АК «4 у колі 15 см на 100 м») —
      // пристрілку за такою групою не записуємо, хоч би СТВ і лягла в точку
      wide = st.n >= 3 && moa(st.meanRadius) > 2;
      done = st.n >= 3 && !wide && (close || (Boolean(M.clickValue(click)) && !fixes.length));
      needTurn = fixes.some((f) => !f.ok);
      // Спершу один висновок — що робити зараз; під ним плитки по осях; цифри групи — окремо нижче, дрібно.
      // Розкидана група — як у практиці: спершу кучність; поправку показуємо, але як приблизну
      const head = done ? h('p', { class: 'zero-ok' }, t('✓ СТВ у потрібній точці — приціл пристріляно'))
        : wide ? h('p', { class: 'warn-text' }, t('Група дуже розкидана — перевірте упор, кріплення прицілу й що всі постріли одним набоєм; поправка за такою групою приблизна'))
          : needTurn ? h('p', { class: 'zero-do' }, t('Вистав поправку'))
            : h('p', { class: 'muted' }, t('Майже в точку — добийте групу до 3–5 пострілів'));
      verdict = !click ? h('p', { class: 'warn-text' }, t('У прицілу не вказана ціна кліку — вкажіть її в картці зброї, і тут будуть кліки'))
        : !fixes.length && wide ? h('p', { class: 'warn-text' }, t('Група дуже розкидана — перевірте упор, кріплення прицілу й що всі постріли одним набоєм; поправка за такою групою приблизна'))
        : !fixes.length ? h('p', { class: st.n >= 3 ? 'zero-ok' : 'muted' }, st.n >= 3 ? t('✓ Пристріляно: поправка менша за пів кліку') : t('Майже в точку — добийте групу до 3–5 пострілів'))
          : h('div', { class: 'zero-fix' },
            head,
            // Плитка на вісь: кружок зі стрілкою, крупно кліки, під ними напрям і кут; у допуску — сіра з позначкою
            h('div', { class: 'zero-turns' }, ...fixes.map((f) => h('div', { class: `zero-turn ${f.ok ? 'calm ok' : ''}` },
              h('span', { class: 'zt-arrow', 'aria-hidden': 'true' }, f.arrow),
              h('span', { class: 'zt-main' }, h('b', {}, String(f.clicks)), h('small', {}, t('кл.'))),
              h('span', { class: 'zt-txt' }, h('span', {}, f.word), h('small', {}, `${num(f.angle, 1)} ${f.unit}`),
                f.ok ? h('em', { class: 'zt-tag ok' }, t('у допуску ✓')) : null)))),
            st.n < 3 && needTurn ? h('p', { class: 'muted small' }, t('За 1–2 пострілами поправка ненадійна — краще 3–5')) : null);
    }
    // Барабан від початку сесії: сума виставлених поправок по осях
    const turret = { up: 0, right: 0 };
    for (const gr of s.groups.slice(0, -1)) for (const f of gr.applied ?? []) {
      if (f.arrow === '↑') turret.up += f.clicks; else if (f.arrow === '↓') turret.up -= f.clicks;
      else if (f.arrow === '→') turret.right += f.clicks; else if (f.arrow === '←') turret.right -= f.clicks;
    }
    const turretText = turret.up || turret.right ? t('Барабан від початку: {v} · {h} кл.', {
      v: `${turret.up >= 0 ? '↑' : '↓'}${Math.abs(turret.up)}`, h: `${turret.right >= 0 ? '→' : '←'}${Math.abs(turret.right)}` }) : null;
    // Сумарно накручено багато (≈ ½ ходу типового прицілу) — попередити: хід барабана може скінчитись
    const cv = M.clickValue(click); const big = cv ? Math.max(Math.abs(turret.up), Math.abs(turret.right)) * cv.value >= (cv.unit === 'moa' ? 40 : 12) : false;
    const history = s.groups.slice(0, -1).map((gr, i) => h('li', {}, t('Група {n}: {k} постр.', { n: i + 1, k: statsOf(gr)?.n ?? 0 }),
      gr.applied?.length ? ` → ${gr.applied.map((f) => `${f.arrow}${f.clicks}`).join(' ')} ${t('кл.')}` : ''));
    const apply = () => {
      g.applied = fixes.filter((f) => !f.ok).map(({ arrow, clicks }) => ({ arrow, clicks }));
      s.groups.push({ holes: [] }); store(); paint(); body.scrollIntoView?.({ block: 'start' });
    };
    // У приціл пишемо лише справжню пристрілку: «пристріляно» з датою, коли група не в точці, — неправда в картці,
    // а нуль, що змінився посеред сесії, зсунув би DOPE і тренажер. Не закінчив — сесія лишається, продовжиш значком у прицілу
    const finish = async () => {
      await ctx.saveScope({ zero: s.zero, zeroAmmo: s.cid || null, zeroDate: M.today(), zeroSuppressor: s.sup });
      keep(scope.id, null); close();
      toast(t('Пристрілку записано: {z} м', { z: s.zero }));
    };
    const later = () => { store(); close(); toast(t('Пристрілку збережено — продовжиш значком біля прицілу')); };
    const fromPhoto = () => ctx.photoGroup({ cartridgeId: s.cid || null, distance: s.d, zeroUp: Math.round(wantCm * 10) / 10 || null, suppressor: s.sup }, (stats) => {
      if (!stats?.offset) { toast(t('На мішені немає точки прицілювання чи пробоїн — поправку не порахувати')); return; }
      s.groups[s.groups.length - 1] = { holes: [], stats }; store(); paint();
    });
    // Порядок за важливістю: налаштування згорнуті одним рядком → схема → СТВ → поправка й дії → інструменти схеми → історія
    const summary = [c?.name, t('нуль {z} м', { z: s.zero }), t('з {d} м', { d: s.d }), ctx.hasSuppressor && s.sup ? t('з глушником') : null].filter(Boolean).join(' · ');
    if (setupOpen && !setupTouched && (s.groups.length > 1 || g.holes.length || g.stats)) setupOpen = false;
    const setupBox = h('details', { class: 'zero-setup-box', open: setupOpen }, h('summary', { onclick: () => { setupTouched = true; } }, h('span', { class: 'zsb-ico', 'aria-hidden': 'true' }, '⚙'), summary, h('span', { class: 'zsb-edit' }, t('змінити'))), setup);
    setupBox.addEventListener('toggle', () => { setupOpen = setupBox.open; });
    const taps = !g.stats && mode !== 'cm';
    body.replaceChildren(...[
      setupBox,
      h('p', { class: 'zero-goal' }, goalText),
      h('div', { class: 'zero-head' }, h('b', {}, t('Група {n}', { n: s.groups.length })),
        g.stats ? h('span', { class: 'muted small' }, g.stats.manual ? t('введено вручну: {k} постр.', { k: g.stats.n }) : t('з фото: {k} пробоїн', { k: g.stats.n })) : null,
        g.holes.length || g.stats ? h('button', { type: 'button', class: 'zero-link', onclick: () => { s.groups[s.groups.length - 1] = { holes: [] }; store(); paint(); } },
          g.stats ? t('Вказати групу заново') : t('Очистити')) : null),
      g.stats ? null : h('div', { class: 'zero-modes', role: 'tablist', 'aria-label': t('Як вказати групу') },
        ...[['tap', t('Позначити на схемі')], ['photo', t('З фото мішені')], ['cm', t('Ввести СТВ у см')]].map(([m, label]) => h('button', {
          type: 'button', role: 'tab', class: mode === m ? 'on' : '', 'aria-selected': String(mode === m),
          onclick: () => { if (m === 'photo') { fromPhoto(); return; } mode = m; paint(); },
        }, label))),
      g.stats ? null : mode === 'cm' ? manualForm()
        // Повна інструкція — поки влучань нема; далі — коротко
        : h('p', { class: 'zero-how' }, g.holes.length ? t('Ще влучання — тапай; тап по влучанню прибирає його. Клітинка — {n} см.', { n: cellOf(shownSpan()) })
          : t('Кружок у центрі — куди ти цілишся. Натискай на схемі туди, куди влучила кожна куля (дивись на свою мішень: клітинка тут — {n} см). Повторне натискання на влучання прибирає його.', { n: cellOf(shownSpan()) })),
      mode === 'cm' && !g.stats ? null : target(g, wantCm),
      taps ? h('div', { class: 'zero-seg', role: 'group', 'aria-label': t('Клітинка схеми') },
        h('span', { class: 'zs-lab' }, t('Масштаб · клітинка')),
        ...SPANS.map((v) => h('button', { type: 'button', class: v === shownSpan() ? 'on' : '', 'aria-pressed': String(v === shownSpan()),
          onclick: () => { s.span = v; store(); paint(); } }, String(cellOf(v)))),
        h('span', { class: 'zs-unit' }, t('см'))) : null,
      verdict,
      st ? h('div', { class: 'zero-stats' },
        h('p', { class: 'zero-center' }, t('СТВ (центр групи): {v}', { v: [
          Math.abs(st.offset[1]) >= 1 ? `${fmt.num(Math.round(Math.abs(st.offset[1])) / 10)} ${t('см')} ${t(st.offset[1] > 0 ? 'вище' : 'нижче')}` : null,
          Math.abs(st.offset[0]) >= 1 ? `${fmt.num(Math.round(Math.abs(st.offset[0])) / 10)} ${t('см')} ${t(st.offset[0] > 0 ? 'правіше' : 'лівіше')}` : null,
        ].filter(Boolean).join(' · ') || t('у точці прицілювання') }) + (Math.abs(wantCm) > 0.05 ? ` · ${t('треба {cm} см {dir}', { cm: fmt.num(Math.round(Math.abs(wantCm) * 10) / 10), dir: t(wantCm > 0 ? 'вище' : 'нижче') })}` : '')),
        // Розкид групи: розмах (найдальші пробоїни) і середній радіус — у см і кутових; з 2 пострілів
        st.n >= 2 && !st.manual ? h('p', { class: 'zero-spread' }, t('Розкид: {s} · середній радіус {r}', {
          s: `${num(st.spread / 10, 1)} ${t('см')} (${num(M.toAngle(st.spread, s.d, 'moa'), 1)} MOA)`,
          r: `${num(st.meanRadius * M.mrBias(st.n) / 10, 1)} ${t('см')} (${num(M.toAngle(st.meanRadius * M.mrBias(st.n), s.d, 'moa'), 1)} MOA)` })) : null,
        click && fixes.length ? clickNote() : null) : null,
      h('div', { class: 'zero-acts' },
        // розкидана група без поправки — крутити нічого, але стріляти ще групу (після пошуку причини)
        !done && (needTurn || wide) ? btn(needTurn ? t('Виставлено — наступна група') : t('Наступна група'), apply, 'primary') : null,
        done ? btn(t('Готово — записати пристрілку'), finish, 'primary') : null,
        st && !done ? btn(t('Продовжу пізніше'), later) : null),
      turretText ? h('p', { class: 'muted small' }, turretText) : null,
      big ? h('p', { class: 'warn-text' }, t('Накручено багато — барабану може не вистачити ходу. Перевірте кріплення й кільця; при великому зсуві по вертикалі допомагає база з нахилом (20 MOA), по горизонталі — вивірка кілець, а не барабан.')) : null,
      history.length ? h('ol', { class: 'zero-hist' }, history) : null,
      s.groups.length > 1 || g.holes.length ? h('button', { type: 'button', class: 'zero-link danger', onclick: reset }, t('Почати пристрілку заново')) : null].filter(Boolean));
  }
  paint();
}
