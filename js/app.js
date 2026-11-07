import * as db from './db.js';
import * as M from './model.js';
import * as sync from './sync.js';
import { t, plural, lang, setLang, LANGS, collate, applyStatic, locale } from './i18n.js';
import { prepare as preparePhoto, editPhoto, viewer, decode, draw, pack } from './photos.js';
import { studioPhoto, studioQuota, quotaText, isCutout } from './studio.js';
import { renderMarkdown, excerpt } from './md.js';
import { COLORS, UNITS, CLICKS, num, length, size, offsetText, corrections, groupRows, elevText, holdText, paintPreview, shareImage, markTarget } from './target.js';
import { cartridgeIcon, caliberHue, componentIcon, defaultHue, setCaliberHues } from './ammo.js';
import { gearSvg, GEAR_ICON_GROUPS, GEAR_HUES } from './gear-icons.js';
import { lineChart, barChart } from './chart.js';
import { toUsd, rateOn, refreshRates, rateSeries } from './usd.js';
import { ammoLevel, shotLevel, levelArt, rankRing } from './levels.js';
import { timerPanel, stopTimerPanel } from './timer.js';
import { exercisesPanel, exerciseName, newExercise, openScore, asExercise, scoreOf, EXERCISES } from './exercises.js';
import { initLock, lockOn, lockDelay, lockAvailable, enableLock, disableLock, setLockDelay, LOCK_DELAYS } from './lock.js';
import { solve } from './ballistics.js';
import { bulletDiameter, bulletGrains, parseTwist, twistText, sgOf, sgVerdict } from './stability.js';
import { trajectoryPoints, pointBlank, pointBlankText, trajectoryChart } from './trajectory.js';
import { tripWeather } from './forecast.js';
import { nowSheet, elevCells, windCell, cellTd, oneColumn, staleText, condText } from './now.js';
import { icsCalendar, googleCalendarLink } from './ics.js';
import {
  h, fmt, sheet, refreshSheets, toast, form, chips, swipeable, confirmSheet, selectOptions, isoToDmy, toolBtn, toolIcon, goTab, reveal,
  confirmed, setUndo, fieldError, formError, icon, swipeStep, starIcon, vibrate, wheelStrip,
} from './ui.js';

// Рідкісне — розбір PDF «Стрільця», вирівнювання фото мішені, тур тренажера — підвантажується при першому використанні:
// запуск не розбирає код, який більшість днів не знадобиться (файли однаково лежать у кеші, офлайн теж працює)
const alignMod = () => import('./align.js');
const pdfMod = () => import('./pdf.js');
const simIntro = (...args) => import('./sim-tour.js').then((m) => m.simIntro(...args));
const tours = () => import('./tours.js');

/** Плавне прокручування — якщо в системі не просили менше руху. */
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

let state = { weapons: [], cartridges: [], components: [], recipes: [], movements: [], photos: [], targets: [], drills: [], scores: [], exercises: [], chrono: [], gear: [], articles: [], gearKinds: [], calibers: [], prefs: [] };
let tab = 'ammo';
let logFilter = 'all';

const $ = (id) => document.getElementById(id);

// Компонент «закінчується», якщо його вистачить менше ніж на стільки патронів.
const LOW_ROUNDS = 50;

// ---------- дані ----------

async function refresh() {
  state = await db.loadAll();
  setCaliberHues(state.calibers, state.cartridges);
  render();
  refreshSheets();
}

function movement(fields) {
  return { id: db.uid(), created: Date.now(), date: M.today(), ...fields };
}

/**
 * Записує рухи однією транзакцією. Підтвердження — підсвіченою карткою; «Скасувати» з'являється в шапці
 * (label — що саме скасується). Табличкою — лише попередження, яке треба прочитати.
 */
async function addMovements(list, label, extra = {}, warning = null) {
  // Що записується поряд із рухами (новий набій, результат вправи, компонент «стріляні»): «Скасувати»
  // прибирає створене й повертає змінене, інакше лишився б набій без залишку чи результат без стрільби.
  const undoExtra = {};
  for (const [store, change] of Object.entries(extra)) {
    const had = (id) => state[store]?.find((x) => x.id === id) ?? null;
    const puts = change.put ?? [];
    undoExtra[store] = {
      put: [...puts.map((x) => had(x.id)), ...(change.del ?? []).map(had)].filter(Boolean),
      del: puts.filter((x) => !had(x.id)).map((x) => x.id),
    };
  }
  await db.write({ movements: { put: list }, ...extra });
  await refresh();
  confirmed(list.flatMap((m) => [m.id, m.cartridgeId, m.componentId, m.weaponId]));
  if (warning) toast(warning);
  setUndo(label, async () => {
    await db.write({ movements: { del: list.map((m) => m.id) }, ...undoExtra });
    await refresh();
  });
}

async function saveEntity(store, obj) {
  await db.write({ [store]: { put: [obj] } });
  await refresh();
  confirmed([obj.id]);
}

const findWeapon = (id) => state.weapons.find((w) => w.id === id);
const findCartridge = (id) => state.cartridges.find((c) => c.id === id);
const findComponent = (id) => state.components.find((c) => c.id === id);
const findRecipe = (id) => state.recipes.find((r) => r.id === id);
const findTarget = (id) => state.targets.find((x) => x.id === id);
const byName = (a, b) => collate(a.name, b.name);

function remember(key, value) {
  try { localStorage.setItem(key, value ?? ''); } catch { /* приватний режим */ }
}

function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Підказка про свайп у підзаголовку — доки на цьому екрані жодного разу не свайпнули; потім — other. */
const swipeTip = (key, tip, other) => (recall(`shooters-log:swiped:${key}`) ? other : tip);
const learnSwipe = (key) => () => remember(`shooters-log:swiped:${key}`, '1');

// Застосунок перейменовано: налаштування зі старого префікса переносимо один раз,
// щоб після оновлення не злетіли тема, мова, одиниці й згорнуті блоки.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('scouts-log:')) continue;
    const moved = `shooters-log:${key.slice('scouts-log:'.length)}`;
    if (localStorage.getItem(moved) === null) localStorage.setItem(moved, localStorage.getItem(key));
    localStorage.removeItem(key);
  }
} catch { /* приватний режим */ }

// ---------- спільні шматки UI ----------

/**
 * Пункти вибору ствола чи набою: спершу свого калібру, решта — групою «Другой калибр»
 * (калібр міг бути записаний інакше, вибрати все одно можна).
 */
function caliberOptions(list, caliber, label = (x) => x.name) {
  const sorted = [...list].sort(byName);
  const match = sorted.filter((x) => M.sameCaliber(x.caliber, caliber));
  const other = sorted.filter((x) => !M.sameCaliber(x.caliber, caliber));
  // Підходящі — окремою групою зверху, решта — групами за калібром: у списку одразу видно, що до чого.
  return {
    match,
    all: [...match, ...other],
    options: [
      match.length ? { group: t('Підходять: {cal}', { cal: caliber }), options: match.map((x) => [x.id, label(x)]) } : null,
      ...groupBy(other, (x) => x.caliber || t('Без калібру')).map(([cal, items]) => ({ group: cal, options: items.map((x) => [x.id, label(x)]) })),
    ].filter(Boolean),
  };
}

/** Назва поля для читалки екрана: кнопки вибору не мають свого <label>. */
function fieldName(select) {
  return select.getAttribute('aria-label') ?? select.closest('.field')?.querySelector('.field-label')?.textContent ?? null;
}

/**
 * Вибір набою як на вкладці БК: кнопка з поточним набоєм, а за нею — шторка з групами
 * за калібром і залишком у рядку. Рідний select лишається у формі (з нього читають
 * значення й на нього вішають обробники), просто сховано. Повертає функцію перемальовування —
 * її кличуть, коли список набоїв перебудували (наприклад, змінили ствол).
 */
function ammoPicker(select, caliber = null) {
  if (!select) return () => {};
  const face = h('button', { type: 'button', class: 'picker' });
  const paint = () => {
    const c = findCartridge(select.value);
    // Як у виборі ствола: назва, під нею калібр і залишок — довга назва не з'їдає залишок.
    const main = c
      ? [h('span', {}, c.name), h('span', { class: 'picker-sub' },
        [c.caliber, t('У наявності: {n} шт', { n: fmt.num(M.cartridgeStock(state, c.id)) })].filter(Boolean).join(' · '))]
      : [h('span', {}, [...select.options].find((o) => o.value === select.value)?.textContent ?? t('— не вказувати —'))];
    // replaceChildren — метод DOM: null він вставив би текстом «null»
    face.replaceChildren(...[
      c ? cartridgeIcon(c.caliber) : null,
      h('span', { class: 'picker-main' }, main),
      h('span', { class: 'chevron', 'aria-hidden': 'true' })].filter(Boolean));
    const name = fieldName(select);
    if (name) face.setAttribute('aria-label', `${name}: ${main.map((x) => x.textContent).join(', ')}`);
  };
  face.addEventListener('click', () => {
    const pick = (value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      paint();
      close();
    };
    const row = (value, body, extra = null) => h('button', {
      type: 'button', class: `row${value === select.value ? ' on' : ''}`, onclick: () => pick(value),
    }, body, extra);
    const opts = [...select.options].map((o) => ({ value: o.value, text: o.textContent, c: findCartridge(o.value) }));
    const own = opts.filter((o) => o.c);
    const plain = opts.filter((o) => !o.c);
    // Свій калібр — зверху й розгорнутим, решта калібрів — згортками, як у «+ → Купити вже заведений».
    const want = caliber ?? findCartridge(select.value)?.caliber ?? null;
    const groups = groupBy(own, (o) => o.c.caliber || t('Без калібру'))
      .sort((a, b) => (M.sameCaliber(b[0], want) ? 1 : 0) - (M.sameCaliber(a[0], want) ? 1 : 0) || collate(a[0], b[0]));
    const rows = (items) => h('div', { class: 'rows' }, items.map((o) => row(o.value,
      [cartridgeIcon(o.c.caliber), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, o.c.name))],
      h('span', { class: 'row-qty' }, fmt.num(M.cartridgeStock(state, o.c.id))))));
    const close = sheet(t('Набої'), h('div', {},
      groups.map(([cal, items], i) => {
        const g = fold(`pick:${cal}`,
          [cartridgeIcon(cal), h('span', { class: 'fold-title' }, cal),
            h('span', { class: 'fold-meta' }, t('{n} поз.', { n: items.length }))],
          rows(items));
        // Свій калібр одразу розгорнутий — по нього й прийшли.
        if (i === 0) g.open = true;
        return g;
      }),
      plain.length ? h('div', { class: 'rows' }, plain.map((o) => row(o.value, h('span', { class: 'row-main' }, o.text)))) : null));
  });
  select.hidden = true;
  select.after(face);
  paint();
  select.addEventListener('change', paint);
  return paint;
}

/**
 * Вибір зі списку замість системного select: кнопка-поле з картинкою й підписом, варіанти — у шторці.
 * select лишається джерелом значення й шле change, як звичайний список. item(value) → { lead, title, sub, other }
 * для свого запису (other — у групу «інші» під підписом otherLabel); null — простий пункт із текстом option.
 * group(value) → [ключ, назва] — свої записи згортками за групами; відкрита та, де поточний вибір.
 */
function listPicker(select, { title, item, ownLabel = null, otherLabel = null, cls = '', group = null, caps = false }) {
  if (!select) return () => {};
  const face = h('button', { type: 'button', class: `picker ${cls}`.trim() });
  const describe = (value) => item(value)
    ?? { title: [...select.options].find((o) => o.value === value)?.textContent ?? t('— не вказувати —') };
  const paint = () => {
    const d = describe(select.value);
    face.replaceChildren(...[d.lead,
      h('span', { class: 'picker-main' }, h('span', {}, d.title), d.sub ? h('span', { class: 'picker-sub' }, d.sub) : null),
      h('span', { class: 'chevron', 'aria-hidden': 'true' })].filter(Boolean));
    const name = fieldName(select) ?? title;
    if (name) face.setAttribute('aria-label', `${name}: ${d.title}`);
  };
  face.addEventListener('click', () => {
    const pick = (value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };
    const opts = [...select.options].filter((o) => !o.hidden).map((o) => ({ value: o.value, own: !!item(o.value), d: describe(o.value) }));
    const row = (o) => h('button', { type: 'button', class: `row${o.value === select.value ? ' on' : ''}`, onclick: () => pick(o.value) },
      o.d.lead ?? null,
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, o.d.title), o.d.sub ? h('span', { class: 'muted small' }, o.d.sub) : null));
    const list = (items) => (items.length ? h('div', { class: 'rows' }, items.map(row)) : null);
    const first = opts.filter((o) => o.own && !o.d.other);
    const other = opts.filter((o) => o.own && o.d.other);
    const close = sheet(title, h('div', { class: 'picker-list' },
      group ? groupFolds(opts.filter((o) => o.own)) : [
        ownLabel && first.length ? h('div', { class: 'picker-cap' }, ownLabel) : null,
        list(first),
        other.length ? h('div', { class: 'picker-cap' }, otherLabel) : null,
        list(other)],
      list(opts.filter((o) => !o.own))));
    // Групи — у порядку варіантів select; поточний вибір — у розгорнутій, по нього здебільшого й прийшли
    function groupFolds(own) {
      const groups = new Map();
      for (const o of own) {
        const [key, label] = group(o.value);
        if (!groups.has(key)) groups.set(key, { label, items: [] });
        groups.get(key).items.push(o);
      }
      const current = item(select.value) ? group(select.value)[0] : null;
      // caps — розділи заголовками, усе видно одразу (їх мало, а порівнювати зручніше поруч)
      if (caps) return [...groups].flatMap(([, g]) => [h('div', { class: 'picker-cap' }, g.label), list(g.items)]);
      return [...groups].map(([key, g]) => {
        // Без запам'ятовування: інакше з часом у виборі були б розгорнуті всі групи
        const el = fold(null,
          [h('span', { class: 'fold-title' }, g.label), h('span', { class: 'fold-meta' }, t('{n} поз.', { n: g.items.length }))],
          list(g.items));
        el.open = key === current;
        return el;
      });
    }
  });
  select.hidden = true;
  select.after(face);
  paint();
  select.addEventListener('change', paint);
  return paint;
}

/**
 * Короткий вибір (одиниці, тип) кнопками замість select: усі варіанти видно одразу, вибір — одним тапом.
 * seg — сегментами в рамці, інакше чипами з переносом. select лишається джерелом значення й шле change;
 * повертає перемальовування — для випадків, коли значення чи варіанти змінили в коді.
 */
function chipPicker(select, { seg = true, label = (o) => o.textContent, cls = '' } = {}) {
  if (!select) return () => {};
  const row = h('div', { class: `chips ${seg ? 'segmented' : ''} ${cls}`.trim(), role: 'radiogroup', 'aria-label': fieldName(select) ?? undefined });
  const paint = () => {
    const opts = [...select.options];
    // Кнопки перебудовуємо, лише коли змінився сам список: інакше натиснута зникала б разом із фокусом
    const same = row.children.length === opts.length && opts.every((o, i) => row.children[i].dataset.value === o.value);
    if (!same) {
      row.replaceChildren(...opts.map((o) => h('button', {
        type: 'button', role: 'radio', 'data-value': o.value,
        onclick: () => {
          if (o.value === select.value) return;
          select.value = o.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        },
      }, label(o))));
    }
    for (const b of row.children) {
      const on = b.dataset.value === select.value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  select.hidden = true;
  select.after(row);
  paint();
  select.addEventListener('change', paint);
  return paint;
}

// Зони вітру: 2–4 і 8–10 — повний боковий, 1, 5, 7, 11 — половина зносу, 12 і 6 — майже без зносу
const windZone = (n) => ([2, 3, 4, 8, 9, 10].includes(n) ? 'full' : [1, 5, 7, 11].includes(n) ? 'half' : 'none');
const WIND_NOTE = { full: 'повний боковий вітер', half: 'половина зносу', none: 'майже без зносу — лише висота' };
// Точка на циферблаті (viewBox 100): кут від 12-ї години за стрілкою, r — відстань від центру
const dialPt = (deg, r) => [50 + Math.sin((deg * Math.PI) / 180) * r, 50 - Math.cos((deg * Math.PI) / 180) * r];
const dialWedge = (from, to, r) => {
  const [x1, y1] = dialPt(from, r);
  const [x2, y2] = dialPt(to, r);
  return `M50 50 L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
};

/**
 * Звідки вітер — циферблатом: 12 угорі, з боку цілі, стрілець у центрі; червоні сектори — зони повного бокового вітру.
 * Стрілка йде від вибраної години до стрільця. Повторний тап скидає вибір, якщо в select є порожній варіант.
 */
/** Тренажер: вибір гвинтівки й набою шторкою — своя зброя й таблиці DOPE зверху, довідкові набори під підписом. */
function kitPicker(select, describe = null) {
  // Тренажер дає опис кожного набору: розділи з заголовками, мініатюра сітки, набій і мітки (MOA/MRAD, FFP/SFP, BDC)
  if (describe) return listPicker(select, { title: t('Гвинтівка й набій'), item: describe, group: (v) => describe(v)?.section ?? ['ar', ''], caps: true });
  return listPicker(select, {
    title: t('Гвинтівка й набій'),
    ownLabel: t('Моя зброя'),
    otherLabel: t('Довідкові набори'),
    // «Ствол · приціл · набій» — назва рядком, решта дрібніше під нею
    item: (value) => {
      const text = [...select.options].find((o) => o.value === value)?.textContent ?? '';
      const [title, ...rest] = text.split(' · ');
      return { title, sub: rest.join(' · ') || null, other: !/^(my|gun):/.test(value) };
    },
  });
}

// Ознаки сили вітру — шкала розділу 13 статті: верхня межа, м/с → як виглядає; короткий підпис — на кнопках швидкого вибору
const WIND_SIGNS = [
  [1, 'дим піднімається майже вертикально, міраж «кипить» вертикально'],
  [2, 'вітер відчувається обличчям, дим помітно нахиляється, листя ворушиться'],
  [4, 'листя й тонкі гілки в постійному русі, легкий прапор розвівається'],
  [6, 'піднімає пил і папір, рухаються невеликі гілки, трава лягає хвилями'],
  [Infinity, 'розгойдуються невеликі дерева, вітер заважає тримати положення стоячи'],
];
const WIND_QUICK = [[0, 'штиль'], [2, 'дим'], [4, 'листя'], [6, 'пил'], [8, 'дерева']];
// Ручка сили: від WP_R0 (ледь дме) до WP_R0 + WP_RS (край шкали) у одиницях циферблата; тягненням — крок 1 м/с
const WP_R0 = 8;
const WP_RS = 29;

/** Виконати fn і догорнути сторінку так, щоб el лишився на тому ж місці екрана. */
function keepPlace(el, fn) {
  const before = el.getBoundingClientRect().top;
  const out = fn();
  const shift = el.getBoundingClientRect().top - before;
  if (Math.abs(shift) >= 1) window.scrollBy(0, shift);
  return out;
}

/**
 * Годинник «звідки дме». З speed (поле сили, м/с) — усе на ньому: тап по годині — напрям,
 * тягни від центру — сила (край = max поля, інакше 10), кнопки швидкого вибору й зведення під ним.
 */
function clockPicker(select, { speed = null, hideSpeed = false } = {}) {
  if (!select) return () => {};
  const dial = h('div', { class: `wind-pick${speed ? ' wp-speed' : ''}`, role: 'radiogroup', 'aria-label': fieldName(select) ?? t('Звідки вітер') });
  const canClear = [...select.options].some((o) => o.value === '');
  const current = () => Number(select.value) || 0;
  const max = Number(speed?.max) || 10;
  const force = () => Math.max(0, Number(String(speed?.value ?? '').replace(',', '.')) || 0);
  // Зміна могла перебудувати вміст над годинником (у тренажері — рядок поправки на вітер) — годинник лишається під пальцем
  const fire = (el, ...types) => keepPlace(dial, () => types.forEach((type) => el.dispatchEvent(new Event(type, { bubbles: true }))));
  const set = (value) => {
    if (select.value !== value) vibrate(8);
    select.value = value;
    fire(select, 'change');
  };
  const setForce = (v) => {
    if (v === force() && speed.value !== '') return;
    vibrate(6);
    speed.value = String(v);
    fire(speed, 'input', 'change');
  };
  // Циферблат будується раз, далі міняється лише стан — фокус лишається на натиснутій годині
  const hours = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const a = (n / 12) * 2 * Math.PI;
    return h('button', {
      type: 'button', role: 'radio', class: windZone(n), 'aria-label': t('з {n} год', { n }),
      style: `--x:${Math.sin(a).toFixed(3)};--y:${(-Math.cos(a)).toFixed(3)}`,
      onclick: () => set(n === current() && canClear ? '' : String(n)),
    }, String(n));
  });
  const face = h('span', { class: 'wp-face', 'aria-hidden': 'true' });
  // Стрілку вітру намальовано для 12-ї години й повернуто на вибрану; із силою вона починається від ручки
  const scale = speed ? [0.5, 1].map((f) => {
    const r = WP_R0 + WP_RS * f;
    const [x, y] = dialPt(45, r);
    return `<circle class="wp-scale" cx="50" cy="50" r="${r}"/><text class="wp-text wp-scale-text" x="${(x + 1).toFixed(1)}" y="${(y - 1).toFixed(1)}"></text>`;
  }).join('') : '';
  face.innerHTML = `<svg viewBox="0 0 100 100">
    <circle class="wp-ring" cx="50" cy="50" r="38"/>
    <path class="wp-zone" d="${dialWedge(60, 120, 38)}"/><path class="wp-zone" d="${dialWedge(240, 300, 38)}"/>${scale}
    <line class="wp-aim" x1="50" y1="47" x2="50" y2="19"/><path class="wp-aim-head" d="M50 13.5 L53 19 L47 19 Z"/>
    <text class="wp-text wp-aim-text" x="53.5" y="25"></text>
    <g class="wp-wind"><line x1="50" y1="16" x2="50" y2="41"/><path d="M50 44 L52.8 38.8 L47.2 38.8 Z"/></g>
    <circle class="wp-me" cx="50" cy="50" r="3"/>
    <text class="wp-text wp-me-text" x="50" y="60" text-anchor="middle"></text>${speed ? '<circle class="wp-knob" r="6"/><text class="wp-knob-text" text-anchor="middle"></text>' : ''}</svg>`;
  face.querySelector('.wp-aim-text').textContent = t('ціль');
  const scaleText = face.querySelectorAll('.wp-scale-text');
  scaleText.forEach((el, i) => { el.textContent = fmt.num(i ? max : max / 2); });
  const me = face.querySelector('.wp-me-text');
  me.textContent = t('стрілець');
  const [right, left] = face.querySelectorAll('.wp-zone');
  const wind = face.querySelector('.wp-wind');
  const shaft = wind.querySelector('line');
  const knob = face.querySelector('.wp-knob');
  const knobText = face.querySelector('.wp-knob-text');
  const note = h('p', { class: 'wp-note', 'aria-live': 'polite' });
  const more = h('p', { class: 'wp-more' });
  let pad = null;
  let quick = [];
  if (speed) {
    // Сила — тягненням усередині кільця годин; поза ним сторінка гортається як завжди
    const pick = (e) => {
      const box = dial.getBoundingClientRect();
      const dx = ((e.clientX - box.left) / box.width) * 100 - 50;
      const dy = ((e.clientY - box.top) / box.height) * 100 - 50;
      const r = Math.hypot(dx, dy);
      const v = r < 6 ? 0 : Math.min(max, Math.max(1, Math.round(((r - WP_R0) / WP_RS) * max)));
      const n = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) / 30) % 12 || 12;
      if (v > 0 && n !== current()) set(String(n));
      setForce(v);
    };
    pad = h('span', {
      class: 'wp-pad', role: 'slider', tabindex: '0', 'aria-label': t('Сила вітру'),
      'aria-valuemin': '0', 'aria-valuemax': String(max),
      onpointerdown: (e) => { pad.setPointerCapture(e.pointerId); pick(e); },
      onpointermove: (e) => { if (pad.hasPointerCapture(e.pointerId)) pick(e); },
      onkeydown: (e) => {
        const step = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5 }[e.key];
        if (!step) return;
        e.preventDefault();
        setForce(Math.min(max, Math.max(0, force() + step)));
      },
    });
    quick = WIND_QUICK.filter(([v]) => v <= max).map(([v, sign]) => h('button', { type: 'button', onclick: () => setForce(v) },
      h('b', {}, fmt.num(v)), h('small', {}, t(sign))));
  }
  dial.append(face, ...(pad ? [pad] : []), ...hours);
  const paint = () => {
    const v = current();
    const w = force();
    hours.forEach((b, i) => {
      b.classList.toggle('on', i + 1 === v);
      b.setAttribute('aria-checked', String(i + 1 === v));
    });
    right.classList.toggle('on', v >= 2 && v <= 4);
    left.classList.toggle('on', v >= 8 && v <= 10);
    wind.setAttribute('transform', `rotate(${v * 30} 50 50)`);
    wind.style.display = v && (!speed || w > 0) ? '' : 'none';
    // Вітер знизу (4–8) перекрив би підпис під стрільцем — підпис збоку, навпроти стрілки
    const side = v >= 4 && v <= 8 ? (v < 6 ? -1 : 1) : 0;
    me.setAttribute('x', side ? 50 + side * 5 : 50);
    me.setAttribute('y', side ? 51.8 : 60);
    me.setAttribute('text-anchor', side < 0 ? 'end' : side ? 'start' : 'middle');
    const zone = v ? t(WIND_NOTE[windZone(v)]) : '';
    if (!speed) {
      note.textContent = v ? t('{n} год — {what}', { n: v, what: zone }) : t('торкніться години, звідки дме');
      return;
    }
    const r = WP_R0 + WP_RS * Math.min(1, w / max);
    shaft.setAttribute('y1', String(50 - r + 6));
    shaft.setAttribute('y2', '41');
    const [kx, ky] = dialPt(v * 30, r);
    knob.setAttribute('cx', kx.toFixed(2)); knob.setAttribute('cy', ky.toFixed(2));
    knobText.setAttribute('x', kx.toFixed(2)); knobText.setAttribute('y', (ky + 2.2).toFixed(2));
    knobText.textContent = fmt.num(w);
    knob.style.display = knobText.style.display = v && w > 0 ? '' : 'none';
    dial.classList.toggle('calm', w === 0);
    pad.setAttribute('aria-valuenow', String(w));
    pad.setAttribute('aria-valuetext', `${fmt.num(w)} ${t('м/с')}`);
    quick.forEach((b, i) => b.setAttribute('aria-pressed', String(WIND_QUICK[i][0] === w)));
    const ms = `${fmt.num(w)} ${t('м/с')}`;
    note.textContent = w === 0 ? t('Штиль') : v ? t('{w} з {n} год — {what}', { w: ms, n: v, what: zone })
      : t('{w} — торкніться години, звідки дме', { w: ms });
    // Не чисто боковий — скільки з нього зносить кулю
    const share = M.windShare(v);
    const cross = w > 0 && v && share > 0.05 && share < 0.97 ? t('Бічна складова ≈{v} м/с', { v: fmt.num(Math.round(w * share * 10) / 10) }) : '';
    const look = w > 0 ? `${t('Як виглядає')}: ${t(WIND_SIGNS.find(([top]) => w <= top)[1])}` : t('тягніть від центру — сила вітру, край — {max} м/с', { max: fmt.num(max) });
    more.textContent = [cross, look].filter(Boolean).join('. ');
  };
  select.hidden = true;
  if (speed && hideSpeed) (speed.closest('label') ?? speed).hidden = true;
  select.after(h('div', { class: 'wind-pick-wrap' }, ...(speed ? [note, dial, h('div', { class: 'wp-quick' }, ...quick), more] : [dial, note])));
  paint();
  select.addEventListener('change', paint);
  speed?.addEventListener('input', paint);
  return paint;
}

/** Ствол у виборі: фото чи монограма, калібр під назвою; не свого калібру — у групі «Інший калібр». */
function weaponPicker(select, caliber = null) {
  return listPicker(select, {
    title: t('Зброя'),
    otherLabel: t('Інший калібр'),
    item: (value) => {
      const w = findWeapon(value);
      return w && { lead: weaponThumb(w), title: w.name, sub: w.caliber, other: !!caliber && !M.sameCaliber(w.caliber, caliber) };
    },
  });
}

/** Приціл у виборі: назва, під нею пристрілка й ціна кліку. */
function scopePicker(select, gun) {
  return listPicker(select, {
    title: t('Приціл'),
    item: (value) => {
      const s = gun()?.scopes?.find((x) => x.id === value);
      return s && {
        lead: scopeIco(), title: s.name,
        sub: [s.zero ? t('пристрілка {n} м', { n: fmt.num(s.zero) }) : null, s.click ? clickLabel(s.click) : null].filter(Boolean).join(' · '),
      };
    },
  });
}

/** Вибір зі списку для правки поза формою: select у власній обгортці, бо кнопка-поле стає поруч із ним. */
function inlinePicker(select, attach) {
  const el = h('div', { class: 'inline-picker' }, select);
  attach(select);
  return el;
}

/** Підказки для «Где / что»: свої часті записи першими, далі типові — разом не більше шести. */
function noteSuggestions() {
  const count = new Map();
  for (const m of state.movements) {
    const note = m.kind === 'shot' ? String(m.note ?? '').trim() : '';
    if (note && note.length <= 24) count.set(note, (count.get(note) ?? 0) + 1);
  }
  const own = [...count].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([note]) => note);
  const seen = new Set();
  return [...own, t('Тренування'), t('Пристрілка'), t('Змагання'), t('Полювання')].filter((note) => {
    const key = note.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

/** Текст попередження, якщо калібр набою й ствола різний; null — збігається або чогось не вказано. */
function caliberMismatch(cartridge, weapon) {
  if (!cartridge?.caliber || !weapon?.caliber || M.sameCaliber(cartridge.caliber, weapon.caliber)) return null;
  return t('⚠ Калібр не збігається: набій {a}, зброя {b}', { a: cartridge.caliber, b: weapon.caliber });
}

/**
 * Живе попередження в полі набою, якщо калібр набою й зброї різний (з урахуванням .223 = 5.56 тощо).
 * Рядок кладемо всередину поля — форма може переносити поля по блоках. inputs — що слухати.
 */
function caliberWarnLine(field, getCartridge, getWeapon, inputs) {
  const el = h('div', { class: 'caliber-warn small', role: 'alert' });
  const update = () => {
    const text = caliberMismatch(getCartridge(), getWeapon());
    el.textContent = text ?? '';
    el.hidden = !text;
  };
  field.append(el);
  for (const input of inputs.filter(Boolean)) input.addEventListener('change', update);
  update();
  return update;
}

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map].sort((a, b) => collate(a[0], b[0]));
}

function storedSet(key) {
  try { return new Set(JSON.parse(recall(key)) ?? []); } catch { return new Set(); }
}

// Усі групи за замовчуванням згорнуті; тут — розгорнуті, між запусками.
const unfolded = storedSet('shooters-log:unfolded');

function setUnfolded(key, open) {
  if (open) unfolded.add(key); else unfolded.delete(key);
  remember('shooters-log:unfolded', JSON.stringify([...unfolded]));
}

/**
 * Група, що згортається: за замовчуванням згорнута, розгорнуту запам'ятовує; без ключа — не запам'ятовує.
 * body-функція — вміст будується лише при розгортанні (журнал на сотні рядків не будує сховане);
 * has — id записів усередині: підсвітка після дії знайде заголовок, поки рядків ще немає.
 */
function fold(key, head, body, has = null) {
  const lazy = typeof body === 'function';
  const inner = h('div', { class: 'fold-body' }, lazy ? null : body);
  const el = h('details', { class: 'fold', open: key ? unfolded.has(key) : false, dataset: { ...(key ? { key } : {}), ...(has ? { has: has.join(' ') } : {}) } },
    h('summary', { class: 'fold-head' }, h('span', { class: 'chevron', 'aria-hidden': 'true' }), head), inner);
  if (key) el.addEventListener('toggle', () => setUnfolded(key, el.open));
  if (lazy) {
    const fill = () => { if (el.open && !inner.childNodes.length) inner.append(...[body()].flat().filter(Boolean)); };
    el.addEventListener('toggle', fill);
    fill();
  }
  return el;
}

function empty(title, text, actions = []) {
  return h('div', { class: 'empty' }, h('h3', {}, title), h('p', { class: 'muted' }, text),
    actions.length ? h('div', { class: 'btn-row' }, actions) : null);
}

/** Під порожнім розділом, який можна вимкнути: «не займаєтесь — сховайте» (лише поки в розділі нічого нема). */
function hideHint(m) {
  if (m === 'reload' && (state.components.length || state.recipes.length)) return null;
  return h('p', { class: 'muted small hide-hint' }, t('Не займаєтесь цим? Розділ можна сховати — повернути в ⚙ → «Розділи».'), ' ',
    h('button', { type: 'button', class: 'link-btn', onclick: () => { vibrate(8); setModule(m, false); toast(t('Розділ сховано')); render(); } }, t('Сховати')));
}

/** Кнопка порожнього екрана: те саме, що «+» відкритого розділу. */
function addBtn() {
  return btn(t('Додати'), () => VIEWS[tab].fab?.(), 'primary add');
}

/** Імпорт копії просто з порожнього екрана, без заходу в налаштування. */
function importBtn() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { if (e.target.files[0]) importData(e.target.files[0]); } });
  return btn(t('Імпорт'), () => input.click());
}

function caliberList() {
  const defaults = ['.223 Rem', '.308 Win', '7.62×39', '7.62×54R', '9×19', '12 кал'];
  const all = [...new Set([...M.calibers(state), ...defaults])];
  return h('datalist', { id: 'cal-list' }, all.map((c) => h('option', { value: c })));
}

function qtyChips(input, values = [10, 20, 50, 100]) {
  // Подія input — щоб залежне від поля (вартість, попередження) оновлювалося й від кнопки
  const row = chips(values.map((v) => [v, String(v)]), input.value, (v) => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  row.classList.add('chips-num');
  input.closest('.field').after(row);
  input.addEventListener('input', () => { row.value = input.value; row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === input.value)); });
  return row;
}

function btn(label, onclick, kind = '') {
  return h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
}

/**
 * Блок із заголовком на лінії рамки (як в 1С); fold — ключ згортання (як у груп: згорнутий, стан пам'ятає),
 * count — кількість у заголовку, tools — кнопки в заголовку поруч із назвою.
 */
/** corner — кнопка на рамці праворуч (на лінії, як заголовок ліворуч). */
function box(title, content, { fold, count, summary = null, tools = null, corner = null } = {}) {
  if (!fold) return h('fieldset', { class: 'box' }, h('legend', {}, title, tools), content, corner);
  const key = `box:${fold}`;
  const el = h('fieldset', { class: `box foldable ${unfolded.has(key) ? '' : 'closed'}` });
  const toggle = h('button', {
    type: 'button', class: 'box-toggle', 'aria-expanded': String(unfolded.has(key)),
    onclick: () => {
      const open = el.classList.toggle('closed') === false;
      setUnfolded(key, open);
      toggle.setAttribute('aria-expanded', String(open));
    },
  }, h('span', { class: 'box-chevron', 'aria-hidden': 'true' }, '›'), title, count ? h('span', { class: 'box-count' }, fmt.num(count)) : null, summary);
  el.append(h('legend', {}, toggle, tools), h('div', { class: 'box-body' }, content));
  if (corner) el.append(corner);
  return el;
}

/** «Змінити» і «В архів» / «Видалити» (якщо рухів немає) — іконками в шапці шторки. */
function cardTools(onEdit, hasMoves, onRemove) {
  return [
    toolBtn('edit', t('Змінити'), onEdit),
    hasMoves ? toolBtn('archive', t('В архів'), onRemove) : toolBtn('delete', t('Видалити'), onRemove, 'danger'),
  ];
}

/** Сума для вузької плитки: від 100 грн — без копійок, «грн» дрібніше й не відривається від числа. */
function tileMoney(n, usd = null) {
  const value = n >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  return h('span', { class: 'nw' }, fmt.num(value), h('small', { class: 'unit' }, ' грн'), usdLine(usd));
}

function stat(label, value, cls = '') {
  return h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-value' }, value), h('div', { class: 'muted small' }, label));
}

function invalidField(f) {
  const bad = f.invalid();
  if (bad) fieldError(f.inputs[bad.name], t('Заповніть поле «{label}»', { label: bad.label }));
  return Boolean(bad);
}

function archiveBlock(items, restore) {
  if (!items.length) return null;
  return h('details', { class: 'archive' },
    h('summary', {}, `${t('Архів')} (${items.length})`),
    items.map((x) => h('div', { class: 'archive-row' },
      h('span', {}, x.name), btn(t('Повернути'), () => restore(x)))));
}

/** Великий підсумок угорі екрана. */
function hero(label, value, sub, cls = '') {
  return h('section', { class: `hero ${cls}` },
    h('div', { class: 'hero-label' }, label),
    h('div', { class: 'hero-value' }, value),
    sub ? h('div', { class: 'hero-sub' }, sub) : null);
}

// ---------- БК ----------

/** «Всього набоїв»: картинка рівня запасу і на скільки виїздів вистачить (за середнім списанням з БК). */
function ammoHero(total) {
  const avg = M.perSession(state, (m) => !!m.cartridgeId);
  const trips = total > 0 && avg ? Math.floor(total / avg) : null;
  const runway = trips === null ? null : trips < 1 ? t('менше ніж на виїзд')
    : t('вистачить на ≈ {n} {w}', { n: fmt.num(trips), w: plural(trips, [t('виїзд'), t('виїзди'), t('виїздів')]) });
  // Підсумок — заввишки як у «Компонентах»: число й картинка; «на скільки вистачить» — рядком під ним.
  return [
    h('section', { class: 'hero accent lv ammo-hero' },
      h('div', {},
        h('div', { class: 'hero-label' }, t('Усього набоїв')),
        h('div', { class: 'hero-value' }, h('span', { class: total < 0 ? 'neg' : '' }, fmt.num(total)), h('span', { class: 'hero-unit' }, t('шт')))),
      levelArt(ammoLevel(total))),
    runway ? h('p', { class: 'ammo-runway muted small' }, runway) : null,
  ];
}

function cartridgeDetails(c) {
  const parts = [];
  if (c.bulletWeight) parts.push(`${fmt.num(c.bulletWeight)} ${c.weightUnit || 'gr'}`);
  if (c.bc > 0) parts.push(`${c.dragModel || 'G7'} ${fmt.num(c.bc)}`);
  if (c.mv > 0) parts.push(`${fmt.num(c.mv)} ${t('м/с')}`);
  const unit = M.cartridgeUnitCost(state, c.id);
  if (c.recipeId) parts.push(t('самоспорядження'));
  if (unit) parts.push(t('{price} за постріл', { price: fmt.money(unit) + usdNow(unit) }));
  if (c.note) parts.push(c.note);
  return parts.join(' · ');
}

/** Лійка перед назвою: самоспоряджений набій видно в списку з першого погляду. */
function ownMark() {
  const el = h('span', { class: 'own-mark', title: t('самоспорядження'), 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24">${KIND_ICON.reload}</svg>`;
  return el;
}

function cartridgeCard(c) {
  const stock = M.cartridgeStock(state, c.id);
  const card = h('article', { class: 'card', 'data-id': c.id },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.recipeId && moduleOn('reload') ? ownMark() : null, c.name),
        h('div', { class: 'muted small' }, cartridgeDetails(c))),
      h('div', { class: `big ${stock < 0 ? 'neg' : stock === 0 ? 'zero' : ''}` }, fmt.num(stock))));
  const recipe = reloadRecipe(c);
  return swipeable(card, {
    rightLabel: recipe ? swipeLabel('reload', t('Спорядити')) : swipeLabel('buy', t('Купити')),
    leftLabel: swipeLabel('target', t('Відстріляти'), 'left'),
    onRight: () => (recipe ? reloadSheet(recipe) : buySheet(c)),
    onLeft: () => shootSheet({ cartridge: c }),
    onTap: () => cartridgeDetail(c),
    onSwipe: learnSwipe('ammo'),
  });
}

/** Рецепт, за яким спорядили набій; видалений рецепт — null. */
const recipeOf = (c) => (c?.recipeId ? state.recipes.find((r) => r.id === c.recipeId) ?? null : null);
/** Те саме, але для дій і показу: вимкнений релоадинг (⚙ → «Розділи») — набій поводиться як покупний. */
const reloadRecipe = (c) => (moduleOn('reload') ? recipeOf(c) : null);

/**
 * Поле «Зібрав гільз» при списанні свого набою — порожнє: гільзи збирають не завжди, рахуються лише вписані.
 * cartridgeId() — поточний набій форми; value() — {component, qty} або null.
 */
function collectField(cartridgeId) {
  const input = h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', autocomplete: 'off', placeholder: t('якщо зібрано') });
  const label = h('span', { class: 'field-label' });
  const el = h('label', { class: 'field wide' }, label, input);
  const target = () => (moduleOn('reload') ? cartridgeCaseTarget(findCartridge(cartridgeId())) : null);
  const update = () => {
    const c = target();
    el.hidden = !c;
    if (c) label.textContent = t('Зібрано гільз → «{name}»', { name: c.name });
  };
  update();
  return {
    el, update,
    value: () => {
      const c = target();
      const n = Math.max(0, Math.round(Number(String(input.value).replace(',', '.')) || 0));
      return c && n ? { component: c, qty: n } : null;
    },
  };
}

// Як називають гільзи після першого пострілу. Назви вводить людина (а старі записи створено ще російською) —
// тож упізнаємо й російські та англійські; нові створюються українською.
const FIRED = ['стріляні', 'стреляные']; // i18n-ok
const FIRED_END = /\s(стріляні|стреляные|fired)$/i; // i18n-ok
const NEW_END = /\s+(нові|новые|new)$/i; // i18n-ok

/** Компонент «гільза» з назвою «{base} стріляні» (будь-якою мовою) або заготовка для нього без id. */
function firedCase(bases) {
  return state.components.find((c) => c.kind === 'case' && bases.some((b) => FIRED.some((w) => c.name === `${b} ${w}`)))
    ?? { name: `${bases[0]} ${t('стріляні')}` };
}

/**
 * Куди повертаються зібрані гільзи набоїв за рецептом: стріляні — туди ж, нові — у «… стріляні» тієї ж гільзи.
 * Нові чи стріляні — спершу за назвою, без підказки в назві — за ціною (стріляні зазвичай без ціни).
 * Без id — такого компонента ще немає, він з'явиться при першому зборі.
 */
function caseTarget(recipe) {
  const own = M.recipeCase(state, recipe);
  if (!own) return null;
  if (FIRED_END.test(own.name)) return own;
  if (!NEW_END.test(own.name) && !(M.unitPrice(state, own) > 0)) return own;
  return firedCase([own.name.replace(NEW_END, '')]);
}

/** Куди йдуть гільзи набою: самоспоряджений — за рецептом, заводський — у «Гільза {калібр} стріляні». */
function cartridgeCaseTarget(c) {
  if (!c) return null;
  if (c.recipeId) return caseTarget(recipeOf(c));
  return c.caliber ? firedCase([`${t('Гільза')} ${c.caliber}`, `Гильза ${c.caliber}`]) : null;
}

/** Записує стрільбу; зібрані гільзи — окремим рухом у тій самій пачці, тож видаляються разом зі стрільбою. */
async function addShot(shot, collected, label, extra = {}, warning = null) {
  if (!collected) { await addMovements([shot], label, extra, warning); return; }
  const batch = db.uid();
  const c = collectMovement(collected, batch, shot.date, extra);
  await addMovements([{ ...shot, batch }, c.move], label, c.extra, warning);
}

/** Рух зібраних гільз у пачці стрільби; компонента «… стріляні» ще немає — він додається в extra. */
function collectMovement(collected, batch, date, extra = {}) {
  const own = caseComponent(collected.component, extra);
  return { move: movement({ kind: 'collect', batch, componentId: own.id, qty: collected.qty, date }), extra: own.extra };
}

/** id компонента для гільз; «… стріляні» ще немає — створюється, а його запис додається в extra. */
function caseComponent(target, extra = {}) {
  if (target.id) return { id: target.id, extra };
  const made = { id: db.uid(), created: Date.now(), updated: Date.now(), name: target.name, kind: 'case', unit: 'шт' };
  return { id: made.id, extra: { ...extra, components: { put: [made] } } };
}

/**
 * Гільзи до вже записаної стрільби. Стрільба без пачки отримує її окремим записом —
 * «Скасувати» прибирає лише збір, а видалення стрільби забирає й гільзи.
 */
async function addCollected(shot, collected) {
  let batch = shot.batch;
  if (!batch) {
    batch = db.uid();
    await db.write({ movements: { put: [{ ...shot, batch }] } });
  }
  const c = collectMovement(collected, batch, shot.date);
  await addMovements([c.move], t('Зібрані гільзи → «{name}»', { name: collected.component.name }), c.extra);
}

function openFold(key) {
  const el = [...document.querySelectorAll('.fold')].find((d) => d.dataset.key === key);
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: smooth(), block: 'start' });
}

function renderAmmo() {
  const active = state.cartridges.filter((c) => !c.archived);
  const archived = archiveBlock(state.cartridges.filter((c) => c.archived), restoreCartridge);
  if (!active.length) {
    return h('div', {}, empty(t('Поки немає набоїв'), t('Додайте перший набій, завантажте копію або подивіться демодані.'), [addBtn(), importBtn(), btn(t('Демодані'), loadDemo)]), archived);
  }
  $('subtitle').textContent = swipeTip('ammo', active.some(reloadRecipe) ? t('Свайп → купити або спорядити, ← відстріляти') : t('Свайп → купити, ← відстріляти'),
    t('позицій: {n}', { n: active.length }));
  const groups = groupBy(active, (c) => c.caliber || t('Без калібру'))
    .map(([caliber, list]) => ({ caliber, list: list.sort(byName), sum: list.reduce((s, c) => s + M.cartridgeStock(state, c.id), 0) }));
  const total = groups.reduce((s, g) => s + g.sum, 0);
  return h('div', {},
    ammoHero(total),
    groups.map((g) => calGroup(g)),
    archived);
}

/** Калібр — картка: шапка в кольорі калібру з сумою, позиції рядками. */
function calGroup(g, { prefix = 'ammo', card = cartridgeCard } = {}) {
  return groupCard(`${prefix}:${g.caliber}`, {
    hue: caliberHue(g.caliber), icon: cartridgeIcon(g.caliber), title: g.caliber, count: g.list.length, onEdit: () => caliberColorForm(g.caliber),
    total: 'sum' in g ? h('div', { class: `cal-total ${g.sum < 0 ? 'neg' : ''}` }, fmt.num(g.sum), h('small', {}, t('шт'))) : null,
  }, g.list.map(card));
}

/** Група-картка: шапка в кольорі --h зі значком, назвою, «N поз.» і підсумком; тап по шапці згортає, стан запам'ятовується. */
function groupCard(key, { hue, icon, title, count, total = null, cls = '', onEdit = null }, body) {
  const el = h('details', { class: `cal-group ${cls}`, open: unfolded.has(key), style: `--h:${hue}` },
    h('summary', { class: 'cal-head' }, h('span', { class: 'chevron', 'aria-hidden': 'true' }), icon,
      h('div', { class: 'cal-name' }, h('div', { class: 'cal-title' }, title),
        h('div', { class: 'cal-meta' }, t('{n} поз.', { n: count }))),
      total,
      // Олівець — лише в розгорнутій групі (CSS), щоб згорнуті шапки лишались чистими; тап по ньому не згортає картку
      onEdit ? toolBtn('edit', t('Змінити'), (e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }, 'small cal-edit') : null),
    h('div', { class: 'cal-body' }, body));
  el.addEventListener('toggle', () => setUnfolded(key, el.open));
  if (onEdit) holdToEdit(el.querySelector('.cal-head'), onEdit);
  return el;
}

/** Довге натискання на шапку — те саме, що олівець; клік після нього шапку не згортає. */
function holdToEdit(head, onEdit) {
  let timer = 0;
  let start = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.cal-edit')) return;
    fired = false;
    start = [e.clientX, e.clientY];
    timer = setTimeout(() => { timer = 0; fired = true; vibrate(12); onEdit(); }, 550);
  });
  // Палець поїхав — це прокрутка, а не натискання
  head.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) cancel(); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) head.addEventListener(type, cancel);
  head.addEventListener('click', (e) => { if (fired) { e.preventDefault(); fired = false; } });
  head.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Колір калібру — олівцем у шапці калібру: той самий відтінок беруть набої, рецепти й стволи цього калібру.
 * «Як було» прибирає свій колір — повертається той, що рахується з назви.
 */
function caliberColorForm(caliber) {
  const id = String(caliber).trim();
  const own = state.calibers.find((r) => r.id === id);
  // Стандартний колір — перший варіант у формі: видно, який він і звідки, і повернутись до нього — той самий вибір, що й інші
  const std = defaultHue(id);
  const d = { hue: caliberHue(id), std: !own };
  const body = h('div', { class: 'kind-form' });
  const hues = huePicker(d, () => { d.std = false; paint(); });
  const why = std.by === 'shot' ? t('для гладкоствольних — один колір')
    : std.by === 'energy' ? t('за потужністю калібру: ≈ {e} Дж', { e: fmt.num(Math.round(std.energy / 50) * 50) })
      : t('за назвою калібру');
  const stdBtn = h('button', { type: 'button', class: 'hue-default', style: `--h:${std.hue}`, onclick: () => { d.std = true; d.hue = std.hue; paint(); } },
    h('span', { class: 'hue-swatch', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, t('Стандартний')), h('small', {}, why)));
  const paint = () => {
    body.style.setProperty('--h', d.hue);
    hues.paint();
    stdBtn.setAttribute('aria-pressed', String(d.std));
    // Стандартний вибрано — у палітрі нічого не підсвічуємо, навіть якщо відтінок збігся
    if (d.std) hues.el.querySelectorAll('.hue-swatch').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  };
  body.append(
    h('div', { class: 'cal-group kind-preview' }, h('div', { class: 'cal-head' }, cartridgeIcon(id), h('div', { class: 'cal-name' }, h('div', { class: 'cal-title' }, id)))),
    h('p', { class: 'muted small' }, t('Цей колір візьмуть набої, рецепти й стволи цього калібру.')),
    stdBtn,
    h('div', { class: 'muted small' }, t('Або свій')),
    hues.el);
  paint();
  // Превʼю — та сама плитка патрона: її колір теж іде від --h
  body.querySelector('.ammo-ico').style.removeProperty('--h');
  const close = sheet(t('Колір калібру'), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), async () => {
      close();
      if (d.std) { if (own) await db.write({ calibers: { del: [id] } }); } else await db.write({ calibers: { put: [{ ...(own ?? { id, created: Date.now() }), hue: d.hue }] } });
      await refresh();
    }, 'primary')],
  });
}

function restoreCartridge(c) {
  // Рецепт тим часом міг перейти до іншого набою — двом активним спорядження ділило б навмання
  const clash = c.recipeId && state.cartridges.some((x) => !x.archived && x.id !== c.id && x.recipeId === c.recipeId);
  saveEntity('cartridges', { ...c, archived: false, ...(clash ? { recipeId: null } : {}) });
}

/**
 * Поле «Рецепт» для самоспорядженого набою. Спорядження за рецептом приходує набої саме сюди,
 * тому рецепт, уже прив'язаний до іншого активного набою, не пропонуємо.
 */
function recipeField(c) {
  if (!moduleOn('reload')) return [];
  const taken = new Set(state.cartridges.filter((x) => !x.archived && x.id !== c?.id && x.recipeId).map((x) => x.recipeId));
  const free = state.recipes.filter((r) => !taken.has(r.id) || r.id === c?.recipeId);
  if (!free.length) return [];
  const recipes = caliberOptions(free, c?.caliber);
  return [{
    name: 'recipeId', label: t('Рецепт (якщо споряджаю сам)'), type: 'select', value: c?.recipeId ?? '',
    options: [['', t('— покупний —')], ...recipes.options],
    hint: t('Спорядження за рецептом приходуватиме сюди; без покупок ціна пострілу — за рецептом.'),
  }];
}

/** Форма набою; onSaved(obj) — після збереження (форма, з якої відкрили, перераховує своє). */
function cartridgeForm(c = null, { onSaved = null } = {}) {
  const f = form([
    { name: 'name', label: t('Назва'), required: true, value: c?.name, placeholder: 'GGG 147 FMJ', half: true },
    { name: 'caliber', label: t('Калібр'), required: true, value: c?.caliber, list: 'cal-list', half: true },
    { name: 'bulletWeight', label: t('Вага кулі / снаряда'), type: 'number', step: 'any', value: c?.bulletWeight, half: true },
    { name: 'weightUnit', label: t('Одиниці'), type: 'select', value: c?.weightUnit ?? 'gr', options: [['gr', t('гран (gr)')], ['г', t('грам (г)')]], half: true },
    { name: 'bc', label: t('Балістичний коефіцієнт'), type: 'number', step: 'any', min: 0, value: c?.bc, placeholder: '0,151', half: true },
    { name: 'dragModel', label: t('Модель BC'), type: 'select', value: c?.dragModel ?? 'G7', options: [['G7', 'G7'], ['G1', 'G1']], half: true },
    { name: 'mv', label: t('Швидкість кулі, м/с'), type: 'number', step: 'any', min: 0, value: c?.mv, placeholder: '915', half: true },
    { name: 'bulletLength', label: t('Довжина кулі, мм'), type: 'number', step: 'any', min: 0, value: c?.bulletLength, placeholder: '23,0', half: true },
    ...recipeField(c),
    ...(c ? [] : [
      { name: 'initial', label: t('Зараз у наявності, шт'), type: 'number', step: 1, min: 0, half: true },
      { name: 'initialPrice', label: t('Сума покупки (необов’язково)'), type: 'number', step: 'any', half: true },
    ]),
    { name: 'note', label: t('Примітка'), value: c?.note, wide: true },
  ]);
  listPicker(f.inputs.recipeId, {
    title: t('Рецепт'), otherLabel: t('Інший калібр'),
    item: (value) => {
      const r = findRecipe(value);
      return r && { lead: cartridgeIcon(r.caliber), title: r.name, sub: r.caliber, other: !!c?.caliber && !M.sameCaliber(r.caliber, c.caliber) };
    },
  });
  // У пів рядка «гран (gr)» не влазить — на кнопці лише позначка
  chipPicker(f.inputs.weightUnit, { label: (o) => o.value });
  chipPicker(f.inputs.dragModel);
  const num = (name) => Number(String(f.inputs[name]?.value ?? '').replace(',', '.')) || 0;
  // Дульна енергія з ваги кулі й швидкості — видно одразу, і від неї ж стандартний колір калібру
  const energy = h('p', { class: 'muted small cf-energy' });
  const unit = () => f.inputs.weightUnit.value;
  const paintEnergy = () => {
    const grams = num('bulletWeight') * (unit() === 'г' ? 1 : 0.0647989);
    const e = (grams / 1000) * num('mv') ** 2 / 2;
    energy.textContent = e > 0 ? t('Дульна енергія ≈ {e} Дж', { e: fmt.num(Math.round(e / 10) * 10) }) : '';
  };
  // ФГС одразу під полями: довжину кулі вводять саме заради нього
  const sgLine = h('p', { class: 'muted small cf-sg' });
  const paintSg = () => {
    const draft = { caliber: f.inputs.caliber.value, bulletWeight: num('bulletWeight'), weightUnit: unit(), bulletLength: num('bulletLength'), mv: num('mv') };
    sgLine.replaceChildren(...stabilityLines(draft).map((x) => h('span', { class: `sg-${x.level}` }, x.text)));
  };
  const ballistics = formPart(f, ['bulletWeight', 'weightUnit', 'bc', 'dragModel', 'mv', 'bulletLength'], energy, sgLine);
  const repaint = () => { paintEnergy(); paintSg(); };
  ballistics.addEventListener('input', repaint);
  ballistics.addEventListener('click', () => queueMicrotask(repaint));
  f.inputs.caliber.addEventListener('input', paintSg);
  repaint();
  const ballSum = () => [num('bulletWeight') ? `${fmt.num(num('bulletWeight'))} ${unit()}` : null,
    num('bc') ? `BC ${fmt.num(num('bc'))} ${f.inputs.dragModel.value}` : null,
    num('mv') ? `${fmt.num(num('mv'))} ${t('м/с')}` : null,
    num('bulletLength') ? `${fmt.num(num('bulletLength'))} ${t('мм')}` : null].filter(Boolean).join(' · ');
  const body = h('div', { class: 'weapon-form' },
    box(t('Набій'), formPart(f, ['name', 'caliber', 'recipeId', 'note'], caliberList())),
    c ? null : box(t('Залишок'), formPart(f, ['initial', 'initialPrice'])),
    formBox(t('Балістика'), [h('p', { class: 'muted small' }, t('Для своєї балістики в тренажері: з коробки чи сайту виробника. G7 точніший для куль із хвостовиком. Якщо є серія хронографа з цією зброєю — візьмемо її.')), ballistics], ballSum));
  const close = sheet(c ? t('Змінити набій') : t('Новий набій'), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    const obj = { ...(c ?? { id: db.uid(), created: Date.now() }), name: v.name, caliber: v.caliber, bulletWeight: v.bulletWeight, weightUnit: v.weightUnit,
      bc: v.bc > 0 ? v.bc : null, dragModel: v.bc > 0 ? v.dragModel : c?.dragModel, mv: v.mv > 0 ? v.mv : null,
      bulletLength: v.bulletLength > 0 ? v.bulletLength : null, note: v.note };
    if (f.inputs.recipeId) obj.recipeId = v.recipeId || null;
    // Новий набій — у розгорнутій групі калібру, інакше картку для свайпу ще треба знайти
    if (!c) setUnfolded(`ammo:${obj.caliber}`, true);
    close();
    if (!c && v.initial > 0) {
      // Із сумою це покупка (йде в середню ціну й у «куплено»), без суми — просто початковий залишок.
      const buying = v.initialPrice > 0;
      await addMovements([movement({
        kind: buying ? 'buy' : 'adjust', cartridgeId: obj.id, caliber: obj.caliber,
        qty: Math.round(v.initial), price: buying ? v.initialPrice : undefined,
        note: buying ? undefined : t('Початковий залишок'),
      })], t('Додано: {name}', { name: obj.name }), { cartridges: { put: [obj] } });
    } else {
      await saveEntity('cartridges', obj);
    }
    onSaved?.(obj);
  }
}

/** Ціна одного набою в покупці: сума / кількість; null — чогось не вказали. */
function buyUnitPrice(m) {
  return m.kind === 'buy' && (m.cartridgeId || m.componentId) && m.qty > 0 && Number(m.price) > 0 ? Number(m.price) / m.qty : null;
}

function buySheet(c) {
  const f = form([
    { name: 'qty', label: t('Кількість, шт'), type: 'number', step: 1, min: 1, required: true },
    { name: 'price', label: t('Сума покупки (необов’язково)'), type: 'number', step: 'any' },
    rateField('usdRate'),
    { name: 'date', label: t('Дата'), type: 'date', required: true, value: M.today() },
    { name: 'note', label: t('Де куплено / примітка') },
  ].filter(Boolean));
  rateHint(f, 'usdRate', 'date');
  // Чипи — типові пачки: коробка 20 / 50, пачка 100 / 200, цинк 500.
  const qtyRow = qtyChips(f.inputs.qty, [20, 50, 100, 200, 500]);
  qtyRow.classList.add('chips-sm');
  // Ціна за штуку — одразу, щойно вказали і кількість, і суму.
  const each = h('small', { class: 'muted' });
  const showEach = () => {
    const { qty, price } = f.values();
    const unit = buyUnitPrice({ kind: 'buy', cartridgeId: c.id, qty, price });
    each.textContent = unit ? t('{price} за шт', { price: fmt.money(unit) + usdTail([[unit, f.values().date || M.today(), f.values().usdRate]]) }) : '';
  };
  f.inputs.price.after(each);
  f.inputs.qty.addEventListener('input', showEach);
  f.inputs.price.addEventListener('input', showEach);
  f.inputs.usdRate?.addEventListener('input', showEach);
  const fieldOf = (name) => f.inputs[name]?.closest('.field') ?? null;
  const group = (title, ...parts) => box(title, h('div', { class: 'form' }, parts));
  const body = h('div', {},
    group(t('Скільки й почім'), fieldOf('qty'), qtyRow, fieldOf('price'), fieldOf('usdRate')),
    group(t('Коли й де'), fieldOf('date'), fieldOf('note')));
  body.addEventListener('click', () => setTimeout(showEach));
  const close = sheet(t('Купити: {name}', { name: c.name }), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Додати'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Вкажіть кількість')); return; }
    close();
    await addMovements([movement({ kind: 'buy', cartridgeId: c.id, caliber: c.caliber, qty: Math.round(v.qty), price: v.price, usdRate: v.usdRate || undefined, date: v.date || null, note: v.note })],
      `+${fmt.num(v.qty)} · ${c.name}`);
  }
}

// Значення пункту «Чужое оружие» у виборі ствола; у записі — прапорець foreignWeapon без weaponId.
const FOREIGN = 'foreign';

/** Підпис чужого ствола: «АКМ (чужое)» або просто «Чужое оружие», якщо назву не вказали. */
function foreignLabel(name) {
  return name ? t('{name} (чужа)', { name }) : t('Чужа зброя');
}

/** Ствол у записі стрільби: свій (і приціл окремо), чужий або нічого. */
function shotGun(m) {
  const w = findWeapon(m.weaponId);
  if (w) return { name: w.name, scope: w.scopes?.find((s) => s.id === m.scopeId)?.name ?? null };
  return m.foreignWeapon ? { name: foreignLabel(m.foreignWeaponName), scope: null } : null;
}

/** Підказки для назви чужого ствола — назви з попередніх записів. */
function foreignList() {
  const names = [...new Set(state.movements.map((m) => m.foreignWeaponName).filter(Boolean))].sort(collate);
  return h('datalist', { id: 'foreign-list' }, names.map((n) => h('option', { value: n })));
}

/**
 * Стрільба з чужої зброї чужими набоями (дали постріляти на навчанні): лише в загальний настріл
 * і настріл за калібрами — склад БК і свої стволи не змінюються.
 */
function foreignShotSheet() {
  const f = form([
    { name: 'qty', label: t('Пострілів, шт'), type: 'number', step: 1, min: 1, required: true },
    { name: 'foreignName', label: t('Яка зброя'), placeholder: t('АКМ'), list: 'foreign-list' },
    { name: 'caliber', label: t('Калібр'), required: true, list: 'cal-list' },
    { name: 'note', label: t('Де / що'), placeholder: t('Полігон, тренування…') },
    ...whenFields(null),
  ]);
  const qtyRow = qtyChips(f.inputs.qty, [5, 10, 20, 30, 60, 90]);
  qtyRow.classList.add('chips-sm');
  const noteChips = chips(noteSuggestions(), '', (v) => { f.inputs.note.value = v; });
  noteChips.classList.add('chips-sm');
  // Ті самі блоки, що й у «Списати»: скільки, з чого, де й коли.
  const fieldOf = (name) => f.inputs[name].closest('.field');
  const group = (title, ...parts) => box(title, h('div', { class: 'form' }, parts));
  const when = whereWhenBox(f, { lead: [fieldOf('note'), noteChips] });
  const close = sheet(t('Стрільба: чужа зброя й набої'), h('div', {},
    h('p', { class: 'muted small' }, t('Йде лише в загальний настріл і настріл за калібрами: склад і свої стволи не змінюються. Свою стрільбу записуйте свайпом набою чи ствола; там же є пункти «Чужа зброя» і «Чужі набої».')),
    group(t('Постріли'), fieldOf('qty'), qtyRow),
    group(t('Зброя'), fieldOf('foreignName'), fieldOf('caliber')),
    when.el,
    caliberList(), foreignList()), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Записати'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Вкажіть кількість')); return; }
    close();
    const qty = Math.round(v.qty);
    await addMovements([movement({
      kind: 'shot', cartridgeId: null, weaponId: null, caliber: v.caliber, qty: -qty, date: v.date || null, time: v.time || undefined, note: v.note,
      foreignWeapon: true, foreignWeaponName: v.foreignName || undefined, foreignAmmo: true, ...when.values(),
    })], `−${fmt.num(qty)} · ${foreignLabel(v.foreignName)}`);
  }
}

/** Списання на стрільбі: від патрона (обираємо ствол) або від ствола (обираємо патрон). */
function shootSheet({ cartridge = null, weapon = null, back = null }) {
  const caliber = cartridge?.caliber ?? weapon?.caliber;
  const fields = [{ name: 'qty', label: t('Пострілів, шт'), type: 'number', step: 1, min: 1, required: true }];
  let gun = weapon;
  if (cartridge) {
    const guns = caliberOptions(state.weapons.filter((w) => !w.archived), caliber);
    const last = recall(`gun:${caliber}`);
    gun = last === FOREIGN ? null : findWeapon(guns.all.some((w) => w.id === last) ? last : guns.match[0]?.id) ?? null;
    fields.push({
      name: 'weaponId', label: t('Зброя'), type: 'select', value: last === FOREIGN ? FOREIGN : gun?.id ?? '',
      options: [...guns.options, [FOREIGN, t('Чужа зброя')], ['', t('— не вказувати —')]],
    }, { name: 'foreignName', label: t('Яка зброя'), placeholder: t('АКМ'), list: 'foreign-list', value: recall(`foreign-gun:${caliber}`) ?? '' });
  } else {
    const ammo = caliberOptions(state.cartridges.filter((c) => !c.archived), caliber,
      (c) => t('{name} · зал. {n}', { name: c.name, n: fmt.num(M.cartridgeStock(state, c.id)) }));
    const last = recall(`ammo:${weapon.id}`);
    fields.push({
      name: 'cartridgeId', label: t('Набої (списати з БК)'), type: 'select',
      value: ammo.all.some((c) => c.id === last) ? last : (ammo.match[0]?.id ?? ''),
      options: [...ammo.options, ['', t('Чужі набої — не списувати з БК')]],
    });
  }
  fields.push(
    { name: 'scopeId', label: t('Приціл'), type: 'select', value: M.defaultScope(gun)?.id ?? '', options: scopeOptions(gun) },
    { name: 'note', label: t('Де / що'), placeholder: t('Полігон, тренування…') },
    ...whenFields(null));
  const f = form(fields);
  ammoPicker(f.inputs.cartridgeId, caliber);
  chipPicker(f.inputs.weaponId, { seg: false, cls: 'check' });
  const qtyRow = qtyChips(f.inputs.qty, [5, 10, 20, 30, 60, 90]);
  qtyRow.classList.add('chips-sm');
  // Прицели — від вибраного ствола; без прицелів поле сховане.
  const currentGun = () => weapon ?? findWeapon(f.inputs.weaponId?.value) ?? null;
  const paintScope = scopePicker(f.inputs.scopeId, currentGun);
  const updateScopes = () => {
    const w = currentGun();
    f.inputs.scopeId.replaceChildren(...selectOptions(scopeOptions(w), M.defaultScope(w)?.id ?? '').filter(Boolean));
    f.inputs.scopeId.closest('.field').hidden = !w?.scopes?.length;
    paintScope();
  };
  f.inputs.weaponId?.addEventListener('change', updateScopes);
  updateScopes();
  // Назва чужого ствола — лише коли вибрано «Чужое оружие».
  if (f.inputs.foreignName) {
    const updateForeign = () => { f.inputs.foreignName.closest('.field').hidden = f.inputs.weaponId.value !== FOREIGN; };
    f.inputs.weaponId.addEventListener('change', updateForeign);
    updateForeign();
  }
  caliberWarnLine((f.inputs.weaponId ?? f.inputs.cartridgeId).closest('.field'),
    () => cartridge ?? findCartridge(f.inputs.cartridgeId?.value), currentGun, [f.inputs.weaponId, f.inputs.cartridgeId]);
  const noteChips = chips(noteSuggestions(), '', (v) => { f.inputs.note.value = v; });
  noteChips.classList.add('chips-sm');
  const when = whereWhenBox(f, { lead: [f.inputs.note.closest('.field'), noteChips] });
  const title = t('Стрільба: {name}', { name: (cartridge ?? weapon).name });
  const info = cartridge ? h('p', { class: 'muted' }, t('У наявності: {n} шт', { n: fmt.num(M.cartridgeStock(state, cartridge.id)) })) : null;
  // Вартість стрільби одразу під кількістю: ціна набою × постріли.
  const costLine = h('div', { class: 'cost-line small' });
  const updateCost = () => {
    const c = cartridge ?? findCartridge(f.inputs.cartridgeId?.value);
    const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
    const qty = Number(String(f.inputs.qty.value).replace(',', '.')) || 0;
    costLine.textContent = unit && qty
      ? t('Вартість: {sum} · {unit} за постріл', { sum: fmt.money(unit * qty) + usdNow(unit * qty), unit: fmt.money(unit) })
      : unit ? t('{price} за постріл', { price: fmt.money(unit) + usdNow(unit) })
      : c ? t('Ціна набою невідома — вкажіть суму під час покупки') : '';
  };
  const collect = collectField(() => cartridge?.id ?? f.inputs.cartridgeId?.value);
  const updateAll = () => { updateCost(); collect.update(); };
  f.inputs.qty.addEventListener('input', updateAll);
  f.inputs.cartridgeId?.addEventListener('change', updateAll);
  updateCost();
  const withTarget = h('input', { type: 'checkbox', id: 'shot-target' });
  const targetRow = h('label', { class: 'check', for: 'shot-target' }, withTarget,
    h('span', {}, t('Одразу розмітити мішень')));
  // Поля за змістом: скільки, з чого, де й коли — як у формі мішені.
  const fieldOf = (name) => f.inputs[name]?.closest('.field') ?? null;
  const group = (title, ...parts) => box(title, h('div', { class: 'form' }, parts));
  const body = h('div', {}, info,
    // Галочка — в самому блоці пострілів: унизу форми її пропускали
    group(t('Постріли'), fieldOf('qty'), qtyRow, costLine, collect.el, targetRow),
    group(cartridge ? t('Зброя й приціл') : t('Набій і приціл'),
      fieldOf('weaponId'), fieldOf('foreignName'), fieldOf('cartridgeId'), fieldOf('scopeId')),
    when.el,
    f.inputs.foreignName ? foreignList() : null);
  body.addEventListener('click', () => setTimeout(updateAll));
  const close = sheet(title, body, {
    onClose: back,
    actions: [btn(t('Скасувати'), () => close()), btn(t('Записати'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Вкажіть кількість')); return; }
    const c = cartridge ?? findCartridge(v.cartridgeId) ?? null;
    const w = weapon ?? findWeapon(v.weaponId) ?? null;
    if (cartridge) remember(`gun:${caliber}`, v.weaponId);
    else remember(`ammo:${weapon.id}`, v.cartridgeId);
    const qty = Math.round(v.qty);
    const stock = c ? M.cartridgeStock(state, c.id) : null;
    close();
    const gunName = w?.name ?? (v.weaponId === FOREIGN ? foreignLabel(v.foreignName) : null);
    const label = `−${fmt.num(qty)}${gunName ? ` · ${gunName}` : ''}`;
    // Попередження — табличкою: їх треба прочитати, а не лише побачити, що запис з'явився.
    const warnings = [stock !== null && qty > stock ? t('Залишок пішов у мінус') : null];
    const s = w ? M.cleaningStatus(state, w) : null;
    if (s?.every) {
      const after = s.unit === 'sessions' ? s.count + (s.dates.has(v.date || '') ? 0 : 1) : s.since + qty;
      if (after >= s.every) {
        warnings.push(s.unit === 'sessions'
          ? t('Час почистити (стрільб після чистки: {n})', { n: fmt.num(after) })
          : t('Час почистити ({n} після чистки)', { n: fmt.num(after) }));
      }
    }
    // Вартість фіксуємо на момент списання, щоб подальші покупки за іншою ціною її не змінювали.
    const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
    const price = unit ? +(unit * qty).toFixed(2) : null;
    const scopeId = w?.scopes?.some((sc) => sc.id === v.scopeId) ? v.scopeId : null;
    // Набір, що стоїть на стволі зараз; назву пишемо й у запис — набір потім можуть перейменувати чи видалити
    const setup = w ? (w.setups ?? []).find((x) => setupMatches(w, x)) ?? null : null;
    const isForeign = v.weaponId === FOREIGN;
    if (isForeign) remember(`foreign-gun:${caliber}`, v.foreignName);
    const foreign = {
      foreignWeapon: isForeign || undefined,
      foreignWeaponName: (isForeign && v.foreignName) || undefined,
      foreignAmmo: (!cartridge && !c) || undefined,
    };
    const shot = movement({ kind: 'shot', cartridgeId: c?.id ?? null, weaponId: w?.id ?? null, scopeId, setupId: setup?.id, setupName: setup?.name, caliber: c?.caliber ?? caliber, qty: -qty, price, date: v.date || null, time: v.time || undefined, note: v.note, ...foreign, ...when.values() });
    await addShot(shot, collect.value(), label, {}, warnings.filter(Boolean).join(' · ') || null);
    // Мішень чіпляється до запису, тож питаємо одразу після збереження, поки стрілець не пішов із екрана.
    if (withTarget.checked) newTarget({ movement: shot });
  }
}

function adjustSheet(item, store) {
  const isCartridge = store === 'cartridges';
  // Суми дробових кількостей (0,1 + 0,2) дають хвости — у полі й у різниці їх бути не повинно
  const tidy = (x) => Math.round(x * 1e6) / 1e6;
  const stock = tidy(isCartridge ? M.cartridgeStock(state, item.id) : M.componentStock(state, item.id));
  const unit = isCartridge ? 'шт' : (item.unit || 'шт');
  const f = form([
    { name: 'actual', label: t('Фактично в наявності, {unit}', { unit }), type: 'number', step: isCartridge ? 1 : 'any', required: true, value: stock },
    { name: 'note', label: t('Причина'), placeholder: t('Перерахунок, брак, віддано…') },
  ]);
  const close = sheet(t('Коригування: {name}', { name: item.name }), h('div', {}, h('p', { class: 'muted' }, t('За обліком: {n} {unit}', { n: fmt.num(stock), unit })), f.el), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    const diff = tidy((isCartridge ? Math.round(v.actual) : v.actual) - stock);
    close();
    if (!diff) return;
    const key = isCartridge ? 'cartridgeId' : 'componentId';
    await addMovements([movement({ kind: 'adjust', [key]: item.id, caliber: item.caliber ?? null, qty: diff, note: v.note || t('Коригування') })],
      t('Коригування {n} {unit}', { n: fmt.signed(diff), unit }));
  }
}

/** Історія в картці, найновіше зверху; skip — що й так зрозуміло з картки (weapon, cartridge). */
function movementRows(list, { limit = 50, skip = {} } = {}) {
  if (!list.length) return h('p', { class: 'muted' }, t('Рухів поки немає'));
  return h('div', { class: 'rows' }, [...list].sort(M.byDateDesc).slice(0, limit).map((m) => logRow(m, { date: true, skip })));
}

/** Чи посилається на набій хоч щось: журнал, мішені, швидкості чи таблиця DOPE — тоді лише в архів. */
const cartridgeInUse = (c) => state.movements.some((m) => m.cartridgeId === c.id)
  || state.targets.some((tg) => tg.cartridgeId === c.id)
  || state.chrono.some((x) => x.cartridgeId === c.id)
  || state.weapons.some((w) => w.dope?.some((d) => d.cartridgeId === c.id));

function cartridgeDetail(c) {
  const body = () => { const cur = findCartridge(c.id); return cur ? cartridgeBody(cur, () => close()) : null; };
  const tools = cardTools(() => { close(); cartridgeForm(findCartridge(c.id) ?? c); }, cartridgeInUse(c),
    () => { close(); removeCartridge(findCartridge(c.id) ?? c); });
  const close = sheet(c.name, body(), { live: body, tools });
}

function cartridgeBody(c, close) {
  const moves = state.movements.filter((m) => m.cartridgeId === c.id);
  const bought = moves.filter((m) => m.kind === 'buy');
  const boughtQty = bought.reduce((s, m) => s + m.qty, 0);
  const loadedQty = moves.filter((m) => m.kind === 'reload').reduce((s, m) => s + m.qty, 0);
  const recipe = reloadRecipe(c);
  const fired = -moves.filter((m) => m.kind === 'shot').reduce((s, m) => s + m.qty, 0);
  return h('div', {},
    h('p', { class: 'muted' }, [c.caliber, cartridgeDetails(c)].filter(Boolean).join(' · ')),
    c.recipeId && moduleOn('reload') ? h('p', { class: 'muted small' }, `${t('Рецепт')}: `, recipe
      ? h('button', { type: 'button', class: 'link-btn', onclick: () => { close(); recipeDetail(recipe); } }, recipe.name)
      : t('(видалено)')) : null,
    // Ціна за постріл — у підзаголовку, окремою плиткою не повторюємо.
    h('div', { class: 'stats even' },
      stat(t('залишок'), fmt.num(M.cartridgeStock(state, c.id))),
      // Самоспорядження не купують: «куплено 0» біля сотні споряджених тільки збиває з пантелику.
      boughtQty || !loadedQty ? stat(t('куплено'), fmt.num(boughtQty)) : null,
      loadedQty ? stat(t('споряджено'), fmt.num(loadedQty)) : null,
      stat(t('вистріляно'), fmt.num(fired))),
    h('div', { class: 'btn-row' },
      recipe
        ? btn(t('Спорядити'), () => { close(); reloadSheet(recipe); }, 'primary')
        : btn(t('+ Купити'), () => { close(); buySheet(c); }, 'primary'),
      btn(t('Відстріляти −'), () => { close(); shootSheet({ cartridge: c }); }),
      btn(t('Перерахунок'), () => { close(); adjustSheet(c, 'cartridges'); })),
    cartridgePrecisionBox(c, close),
    stabilityBox(c),
    box(t('Історія'), movementRows(moves, { skip: { cartridge: true } }), { fold: `hist:${c.id}`, count: moves.length }));
}

/**
 * ФГС набою в кожному стволі його калібру, де вказано крок нарізів: [{ level, text }].
 * Даних не вистачає — один рядок-підказка (level 'hint'); не нарізний калібр чи нема такої зброї — порожньо.
 */
function stabilityLines(c) {
  if (!bulletDiameter(c.caliber)) return [];
  const guns = state.weapons.filter((w) => !w.archived && w.caliber && M.sameCaliber(w.caliber, c.caliber));
  if (!guns.length) return [];
  const need = [!bulletGrains(c) && t('вагу кулі'), !(c.bulletLength > 0) && t('довжину кулі')].filter(Boolean);
  if (need.length) return [{ level: 'hint', text: t('Для ФГС (стабільність кулі) вкажіть {what}', { what: need.join(t(' і ')) }) }];
  const twisted = guns.filter((w) => w.size?.twist > 0);
  if (!twisted.length) return [{ level: 'hint', text: t('Для ФГС вкажіть крок нарізів у картці зброї, блок «Габарити й вага»') }];
  return twisted.map((w) => {
    const sg = sgOf(c, w, (c.id ? chronoMv(w, c) : null) ?? c.mv);
    const v = sgVerdict(sg);
    return { level: v.level, text: t('ФГС у {gun} ({tw}): {sg} — {verdict}', { gun: w.name, tw: twistText(w.size.twist), sg: fmt.num(Math.round(sg * 100) / 100), verdict: t(v.text) }) };
  });
}

/** Блок «Стабільність кулі» в картці набою. */
function stabilityBox(c) {
  const lines = stabilityLines(c);
  if (!lines.length) return null;
  return box(t('Стабільність кулі'), [
    ...lines.map((x) => h('p', { class: `sg-${x.level}` }, x.text)),
    h('p', { class: 'muted small' }, t('ФГС показує, чи вистачає кроку нарізів, щоб куля летіла носом уперед. Від 1,5 — стабільна, від 1 до 1,5 — на межі. Рахуємо за формулою Міллера при +15 °C на рівні моря; швидкість — з хронографа, якщо є серія.')),
  ]);
}

/** Купчастість набою в кожному стволі — та сама мірка, що й «Набої за купчастістю» в картці ствола. */
function cartridgePrecisionBox(c, close) {
  const rows = state.weapons.flatMap((w) => {
    const r = M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id), state.photos).find((x) => x.cartridgeId === c.id);
    return r ? [{ w, r }] : [];
  }).sort((a, b) => a.r.meanRadius - b.r.meanRadius);
  if (!rows.length) return null;
  const groups = (n) => `${fmt.num(n)} ${plural(n, [t('група'), t('групи'), t('груп')])}`;
  return box(t('Купчастість'), h('div', { class: 'rows' }, rows.map(({ w, r }) => h('button', {
    type: 'button', class: 'row ap-row', onclick: () => { close(); precisionTargets(w, r); },
  }, weaponThumb(w),
  h('span', { class: 'row-main' },
    h('span', { class: 'row-title' }, w.name, r.groups < FEW_GROUPS ? h('span', { class: 'badge small' }, t('мало даних')) : null),
    h('span', { class: 'muted small' }, [groups(r.groups), t('{n} постр.', { n: r.shots })].join(' · '))),
  h('span', { class: 'tg-best col' }, length(r.meanRadius, targetUnit, 100), h('small', { class: 'muted' }, t('сер. радіус')))))));
}

function removeCartridge(c) {
  if (cartridgeInUse(c)) {
    saveEntity('cartridges', { ...c, archived: true });
    return;
  }
  confirmSheet(t('Видалити набій?'), c.name, t('Видалити'), async () => {
    await db.write({ cartridges: { del: [c.id] } });
    await refresh();
  });
}

// ---------- зброя ----------

const fillClass = (pct) => (pct >= 100 ? 'over' : pct >= 85 ? 'warn' : '');

/** Показник: підпис і значення над смугою; inline — усе одним рядком (картка в списку). */
function meter(label, value, pct, fill, inline) {
  const bar = h('div', { class: 'bar' }, h('div', { class: `fill ${fill}`, style: `width:${pct}%` }));
  const right = h('span', { class: 'muted' }, value);
  // Число — перед смугою: праворуч на плитці висить кнопка «+», і там його не видно.
  return inline
    ? h('div', { class: 'progress inline small' }, label, right, bar)
    : h('div', { class: 'progress' }, h('div', { class: 'progress-label small' }, label, right), bar);
}

function progress(label, value, max, { inline = false } = {}) {
  if (!(max > 0)) return null;
  const pct = Math.min(100, (value / max) * 100);
  return meter(h('span', {}, label), `${fmt.num(value)} / ${fmt.num(max)}`, pct, fillClass(pct), inline);
}

const SCOPE_KINDS = {
  optic: 'Оптичний',
  red: 'Коліматор',
  holo: 'Голографічний',
  thermal: 'Тепловізор',
  night: 'Нічний',
  other: 'Інше',
};

// Сітка прицілу — у чому рахувати винос; точка (коліматор) — винос у сантиметрах на цілі
const RETICLES = [['mil', 'Сітка MRAD'], ['moa', 'Сітка MOA'], ['dot', 'Точка, без сітки']];
const reticleOf = (s) => s?.reticle || (s?.kind === 'red' || s?.kind === 'holo' ? 'dot' : M.clickValue(s?.click)?.unit ?? 'dot');

function scopeOptions(w) {
  return [...(w?.scopes ?? []).map((s) => [s.id, s.name]), ['', t('— не вказувати —')]];
}

/** Незакінчена пристрілка майстра на цьому пристрої (js/zero.js тримає сесію в shooters-log:zero:<id>): є хоч одна група. */
function zeroPending(s) {
  try {
    const v = JSON.parse(recall(`shooters-log:zero:${s.id}`) || 'null');
    return Boolean(v?.groups?.some((g) => g.holes?.length || g.stats || g.applied?.length));
  } catch { return false; }
}

function scopeLine(s, full = false, more = 0) {
  // У списку параметри — значками поруч із назвою (пристрілка й ціна клацання),
  // у картці — словами під назвою: там місця вистачає.
  if (!full) {
    // Кілька прицілів — на місці ◉ стос із їх кількістю: у списку й так лише основний, а рядок не переноситься
    const mark = more > 0
      ? h('span', { class: 'scope-mark scope-stack', title: t('ще прицілів: {n}', { n: more }) }, scopeIco(), String(more + 1))
      : h('span', { class: 'scope-mark', 'aria-hidden': 'true' }, s.default ? '◉' : '⊕');
    return h('div', { class: `scope ${s.default ? 'default' : ''}` },
      mark,
      h('span', { class: 'scope-text row-chips' },
        h('span', { class: 'scope-name' }, s.name),
        s.zero ? h('span', { class: 'scope-chip', title: t('пристрілка {n} м', { n: fmt.num(s.zero) }) }, zeroIco(), t('{n} м', { n: fmt.num(s.zero) })) : null,
        s.click ? h('span', { class: 'scope-chip', title: t('Ціна кліку прицілу') }, clickIco(), clickLabel(s.click)) : null));
  }
  const sub = [];
  if (full && SCOPE_KINDS[s.kind]) sub.push(t(SCOPE_KINDS[s.kind]));
  if (s.zero) sub.push(t('пристрілка {n} м', { n: fmt.num(s.zero) }));
  if (full && s.zeroDate) sub.push(t('пристріляно {d}', { d: fmt.date(s.zeroDate) }) + (findCartridge(s.zeroAmmo) ? ` · ${findCartridge(s.zeroAmmo).name}` : ''));
  if (full && zeroPending(s)) sub.push(t('пристрілка не закінчена'));
  if (s.click) sub.push(clickLabel(s.click));
  if (full && s.reticle) sub.push(t(RETICLES.find(([k]) => k === s.reticle)?.[1] ?? ''));
  if (full && s.note) sub.push(s.note);
  return h('div', { class: `scope ${s.default ? 'default' : ''}` },
    h('span', { class: 'scope-mark', 'aria-hidden': 'true' }, s.default ? '◉' : '⊕'),
    h('span', { class: 'scope-text' },
      // Основний приціл позначає ◉ ліворуч, зайвої мітки не треба; інші приціли — значком із кількістю.
      h('span', { class: 'scope-name' }, s.name,
        more > 0 ? h('span', { class: 'scope-more', title: t('ще прицілів: {n}', { n: more }) }, scopeIco(), `+${more}`) : null),
      sub.length ? h('span', { class: 'muted small' }, sub.filter(Boolean).join(' · ')) : null));
}

function scopeList(w, full = false) {
  if (!w.scopes?.length) return null;
  // У списку — лише основний приціл: решта в картці, інакше плитка росте на пів екрана.
  const list = full ? w.scopes : [M.defaultScope(w) ?? w.scopes[0]];
  const more = full ? 0 : w.scopes.length - list.length;
  return h('div', { class: `scopes ${full ? '' : 'small'}` }, list.map((s) => scopeLine(s, full, more)));
}

function weaponPhotos(weaponId) {
  return state.photos.filter((p) => p.weaponId === weaponId).sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
}

function coverPhoto(w) {
  const list = weaponPhotos(w.id);
  return list.find((p) => p.id === w.coverId) ?? list[0] ?? null;
}

/** Порядок гортання — у шапці картки й на весь екран: обкладинка перша, далі решта в порядку додавання. */
function photoSlides(w) {
  const cover = coverPhoto(w);
  return cover ? [cover, ...weaponPhotos(w.id).filter((p) => p !== cover)] : [];
}

const monogram = (w) => String(w.name ?? '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '—';

/** Без фото — монограма за назвою на плитці кольору калібру: стволи видно один від одного. */
function weaponThumb(w) {
  const cover = coverPhoto(w);
  if (cover) return h('img', { class: 'thumb', src: cover.thumb, alt: '' });
  return h('div', { class: 'thumb mono', style: `--h:${caliberHue(w.caliber)}`, 'aria-hidden': 'true' }, monogram(w));
}

/** Кільце частки 0–100: сіра доріжка, дуга кольору стану (як смуги — зелена, жовта, червона). */
function ringIco(pct, fill = '') {
  const r = 9;
  const len = 2 * Math.PI * r;
  const el = h('span', { class: `ring ${fill}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24"><circle class="ring-track" cx="12" cy="12" r="${r}"/>`
    + `<circle class="ring-arc" cx="12" cy="12" r="${r}" stroke-dasharray="${((pct / 100) * len).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 12 12)"/></svg>`;
  return el;
}

/** Частка ресурсу ствола, %; без ресурсу — null. */
function barrelWear(w) {
  const life = Number(w.barrelLife);
  return life > 0 ? Math.min(100, (M.weaponShots(state, w) / life) * 100) : null;
}

/**
 * Стан ствола чипами: дозвіл, чистка, знос ствола. all — у картці (і спокійні «почищено», «дозвіл до…»),
 * без нього — на плитці списку, лише те, що потребує уваги.
 */
function gunFlags(w, all = false) {
  const p = M.permitStatus(w.permit);
  const c = M.cleaningStatus(state, w);
  const wear = barrelWear(w);
  const permit = p && (all || p.level !== 'ok')
    ? [p.level === 'over' ? 'danger' : p.level === 'warn' ? 'warn' : 'ok', t('Дозвіл: {left}', { left: permitLeft(p) })] : null;
  // У картці ствола «пора чистити» двічі пульсує при відкритті — щоб не загубилось серед чипів
  const clean = c.due ? [c.every ? 'danger' : 'warn', c.every ? t('Час чистити')
    : c.lastShot ? t('Не почищено після стрільби {date}', { date: fmt.date(c.lastShot) }) : t('Не почищено після стрільби'), all ? ' nudge' : '']
    : !all ? null
      : c.reached ? ['ok', t('Не почищено · нагадаю {date}', { date: fmt.date(c.dueDate) })]
        : c.last ? ['ok', t('Почищено {date}', { date: fmt.date(c.last.date) })] : null;
  const worn = wear >= 85 ? [wear >= 100 ? 'danger' : 'warn', t('Ресурс ствола {n}%', { n: Math.round(wear) })] : null;
  const flags = [permit, clean, worn].filter(Boolean);
  if (!flags.length) return null;
  return h('div', { class: 'gun-flags' }, flags.map(([level, text, more = '']) => h('span', { class: `badge small ${level}${more}` }, text)));
}

/** Три головні числа картки: настріл із кільцем ресурсу, після чистки, купчастість (тап — мішені ствола). */
function gunStats(w, close) {
  const shots = M.weaponShots(state, w);
  const wear = barrelWear(w);
  const c = M.cleaningStatus(state, w);
  const p = gunPrecision(w);
  const tile = (value, label, sub, attrs = {}) => h(attrs.onclick ? 'button' : 'div', { class: 'gun-stat', ...attrs },
    h('span', { class: 'gun-stat-value' }, value), h('span', { class: 'gun-stat-label' }, label), sub);
  const cleanPct = c.every ? Math.min(100, (c.count / c.every) * 100) : null;
  return h('div', { class: 'gun-stats' },
    tile(fmt.num(shots), t('настріл'), wear === null ? null
      : h('span', { class: 'gun-stat-sub' }, ringIco(Math.max(2, wear), fillClass(wear)), t('{n}% ресурсу', { n: Math.round(wear) }))),
    tile(c.every ? `${fmt.num(c.count)} / ${fmt.num(c.every)}` : fmt.num(c.since),
      c.every && c.unit === 'sessions' ? t('стрільб після чистки') : t('після чистки'),
      cleanPct === null ? null : h('div', { class: 'bar' }, h('div', { class: `fill ${c.due ? 'over' : fillClass(cleanPct)}`, style: `width:${Math.max(4, cleanPct)}%` }))),
    tile(p?.value ?? '—', p?.label ?? t('Купчастість'), null, { type: 'button', title: t('Купчастість'), onclick: () => openTargets(w, close) }),
    w.scopes?.length ? tile(toolIcon('poa'), t('Поправки зараз'), null, { type: 'button', class: 'gun-stat gun-stat-now', title: t('Поправки зараз'), onclick: () => openNow(w) }) : null);
}

/** Значок «Поправки зараз» у плитці ствола: тап не відкриває картку. */
function nowIconBtn(w) {
  const b = toolBtn('poa', t('Поправки зараз'), (e) => { e.stopPropagation(); openNow(w); }, 'small now-ico');
  b.addEventListener('keydown', (e) => e.stopPropagation());
  return b;
}

// Повні фото обкладинок — object URL на сеанс: шапка не перечитує blob при кожному оновленні картки
const coverUrls = new Map();

function dropCoverUrl(id) {
  if (coverUrls.has(id)) URL.revokeObjectURL(coverUrls.get(id));
  coverUrls.delete(id);
}

async function coverUrl(p) {
  if (coverUrls.has(p.id)) return coverUrls.get(p.id);
  const blob = await db.getBlob(p.id).catch(() => null);
  if (!blob) return null;
  coverUrls.set(p.id, URL.createObjectURL(blob));
  return coverUrls.get(p.id);
}

/**
 * Шапка картки: фото на всю ширину (повне; поки вантажиться чи не синхронізоване — мініатюра),
 * без фото — монограма на кольорі калібру. Кілька фото гортаються свайпом: обкладинка перша, далі решта.
 * Тап — це фото на весь екран, «+ Фото» — додати.
 */
function gunHero(w, caption) {
  const slides = photoSlides(w);
  const cover = slides[0];
  const input = h('input', {
    type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; addWeaponPhotos(w.id, files); },
  });
  const slide = (p) => {
    const img = h('img', { class: 'gun-hero-img', src: p.thumb, alt: '', draggable: 'false' });
    coverUrl(p).then((url) => { if (url) img.src = url; });
    return h('button', {
      type: 'button', class: 'gun-hero-pic', 'aria-label': t('Фото'), onclick: () => openPhotos(w.id, slides.indexOf(p)),
    }, img);
  };
  const many = slides.length > 1;
  const num = h('span', {}, many ? `1 / ${slides.length}` : '');
  let frame = 0;
  const track = h('div', {
    class: 'gun-hero-track',
    onscroll: () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        num.textContent = `${Math.round(track.scrollLeft / track.clientWidth) + 1} / ${slides.length}`;
      });
    },
  }, slides.map(slide));
  const nav = (dir, label, text) => h('button', {
    type: 'button', class: `gun-hero-nav ${dir > 0 ? 'next' : 'prev'}`, 'aria-label': label,
    onclick: () => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' }),
  }, text);
  return h('div', { class: `gun-hero ${cover ? '' : 'empty'}`, style: `--h:${caliberHue(w.caliber)}` },
    cover ? track : h('button', { type: 'button', class: 'gun-hero-pic', 'aria-label': t('Додати фото'), onclick: () => input.click() },
      h('span', { class: 'gun-hero-mono', 'aria-hidden': 'true' }, monogram(w))),
    many ? nav(-1, t('Попереднє'), '‹') : null,
    many ? nav(1, t('Наступне'), '›') : null,
    caption?.length ? h('span', { class: 'gun-hero-cap' }, caption) : null,
    h('span', { class: 'gun-hero-tools' },
      many ? h('span', { class: 'gun-hero-count' }, icon('camera'), num) : null,
      h('button', { type: 'button', class: 'gun-hero-add', onclick: () => input.click() }, '+ ', t('Фото'))),
    input);
}

/** Фото ствола на весь екран: обкладинка, правка, видалення; картку оновить refresh (шторка live). */
function openPhotos(weaponId, index) {
  viewer(photoSlides(findWeapon(weaponId)), Math.max(0, index), {
    isCover: (p) => coverPhoto(findWeapon(weaponId))?.id === p.id,
    onCover: (p) => saveEntity('weapons', { ...findWeapon(weaponId), coverId: p.id }),
    // Правка зберігає фото з новим id і сама оновлює стан
    onEdit: (p) => editWeaponPhoto(p),
    onStudio: (p) => studioWeaponPhoto(p),
    onDelete: (p) => new Promise((resolve) => {
      confirmSheet(t('Видалити фото?'), t('Фото видалиться на всіх пристроях.'), t('Видалити'), async () => {
        dropCoverUrl(p.id);
        await removePhotos([p]);
        resolve(true);
      });
    }),
  });
}

const needsCleaning = (w) => !w.archived && M.cleaningStatus(state, w).due;

async function recordCleaning(w, date = M.today(), note = '') {
  await addMovements([movement({ kind: 'clean', weaponId: w.id, qty: 0, date, note })], t('Чистку позначено · {name}', { name: w.name }));
}

function cleanSheet(w, back = null) {
  const f = form([
    { name: 'date', label: t('Дата'), type: 'date', value: M.today() },
    { name: 'note', label: t('Що зроблено'), placeholder: t('Повна чистка, змащення…') },
  ]);
  const kinds = chips([t('Повна'), t('Лише ствол'), t('Швидка')], '', (v) => { f.inputs.note.value = v; });
  f.inputs.note.closest('.field').after(kinds);
  const s = M.cleaningStatus(state, w);
  const close = sheet(t('Чистка: {name}', { name: w.name }), h('div', {},
    h('p', { class: 'muted' }, t('Після минулої чистки: {n} пострілів', { n: fmt.num(s.since) })), f.el), {
    onClose: back,
    actions: [btn(t('Скасувати'), () => close()), btn(t('Почищено'), save, 'primary')],
  });
  async function save() {
    const v = f.values();
    close();
    await recordCleaning(w, v.date || M.today(), v.note);
  }
}

function weaponCard(w) {
  const shots = M.weaponShots(state, w);
  const wear = barrelWear(w);
  // Кожна частина переноситься цілком: «№» не відривається від номера, калібр — від своїх цифр.
  // Набір, що стоїть зараз (DMR, ближній бій), — видно, в якій збірці ствол, не відкриваючи картку
  const setup = (w.setups ?? []).find((s) => setupMatches(w, s));
  const info = [w.caliber, w.serial && `№ ${w.serial}`, chokeText(w) || null].filter(Boolean)
    .flatMap((x, i) => [i ? ' · ' : null, h('span', { class: 'nw' }, x)]).filter(Boolean);
  if (setup) info.push(info.length ? ' · ' : null, h('span', { class: 'nw setup-tag', title: t('Набір') }, setup.name));
  const flags = gunFlags(w);
  const card = h('article', { class: 'card tall', 'data-id': w.id },
    h('div', { class: 'swipe-body wrap' },
      weaponThumb(w),
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, w.name),
        info.length ? h('div', { class: 'muted small' }, info) : null),
      // Настріл і розкид — значками замість підписів; з ресурсом ствола значок — кільце зносу.
      h('div', { class: 'big-col' },
        h('div', { class: 'big', title: wear === null ? t('настріл') : t('настріл · {n}% ресурсу', { n: Math.round(wear) }) },
          wear === null ? bigIco(KIND_ICON.shot) : ringIco(Math.max(2, wear), fillClass(wear)), fmt.num(shots),
          h('span', { class: 'sr' }, t('настріл'))),
        precisionBadge(w)),
      // Приціл — рядком на всю ширину: між фото й настрілом на телефоні його назва рвалась посеред слова.
      w.scopes?.length ? h('div', { class: 'card-foot weapon-info' }, scopeList(w), nowIconBtn(w)) : null,
      // Смуг немає: плитка говорить лише про те, що потребує уваги, решта — в картці
      flags ? h('div', { class: 'card-foot' }, flags) : null));
  return swipeable(card, {
    rightLabel: swipeLabel('clean', t('Почищено')), leftLabel: swipeLabel('shot', t('Стрільба'), 'left'),
    onRight: () => recordCleaning(w),
    onLeft: () => shootSheet({ weapon: w }),
    onTap: () => weaponDetail(w),
    onSwipe: learnSwipe('guns'),
  });
}

/** Підказка під «Ресурс ствола»: орієнтир за калібром і кнопка «Підставити». */
function barrelHint(f) {
  const box = h('div', { class: 'hint-row small' });
  const update = () => {
    const life = M.barrelLifeFor(f.inputs.caliber.value);
    box.replaceChildren();
    if (!life) return;
    if (life.smooth) {
      box.append(h('span', { class: 'muted' }, t('Гладкий ствол: ресурс зазвичай не обмежує, поле можна залишити порожнім.')));
      return;
    }
    const range = life.max ? `${fmt.num(life.min)}–${fmt.num(life.max)}` : `${fmt.num(life.min)}+`;
    box.append(
      h('span', { class: 'muted' }, t('Орієнтир для калібру: {range} пострілів. Хромований ствол — ближче до верхньої межі, матчевий — до нижньої.', { range })),
      btn(t('Підставити {n}', { n: fmt.num(life.min) }), () => { f.inputs.barrelLife.value = life.min; }, 'mini'));
  };
  f.inputs.caliber.addEventListener('input', update);
  f.inputs.barrelLife.closest('.field').after(box);
  update();
}

// Розділи, які можна вимкнути в налаштуваннях (⚙ → «Розділи»): записи не видаляються, ховаються лише вкладки й поля.
// За замовчуванням усе ввімкнено; на пристрій (localStorage), як і інші налаштування вигляду
// Вибір спільний для всіх пристроїв: запис prefs/modules їде з Google Диском і резервною копією
const MODULES_ID = 'modules';
// 0.7.100 тримав вибір лише на пристрої — переносимо в prefs при запуску (migrateModules)
const MODULES_KEY = 'shooters-log:modules-off';
const MODULE_SEGS = { reload: ['components', 'recipes'], gear: ['gear'], exercises: ['exercises'], chrono: ['chrono'], timer: ['timer'] };
const modulesRec = () => state.prefs?.find((p) => p.id === MODULES_ID) ?? null;
const modulesOff = () => new Set(modulesRec()?.off ?? []);
const moduleOn = (m) => !modulesOff().has(m);
const hiddenSegs = () => Object.entries(MODULE_SEGS).filter(([m]) => !moduleOn(m)).flatMap(([, segs]) => segs);
const visibleSegs = (segs) => { const hide = hiddenSegs(); return segs.filter(([k]) => !hide.includes(k)); };
/** Записати вибір; у state — одразу, щоб render() після виклику вже бачив новий стан, а база й Диск — слідом. */
function putModules(off) {
  const rec = { ...(modulesRec() ?? { id: MODULES_ID, created: Date.now() }), off: [...off] };
  state.prefs = [...(state.prefs ?? []).filter((p) => p.id !== MODULES_ID), rec];
  return db.write({ prefs: { put: [rec] } }).catch((err) => toast(t('Помилка: {msg}', { msg: err?.message || String(err) })));
}
function setModule(m, on) {
  const off = modulesOff();
  if (on) off.delete(m); else off.add(m);
  putModules(off);
}
/** Разовий перенос вибору 0.7.100 з localStorage у prefs (якщо запису ще нема — інакше правда вже на Диску). */
async function migrateModules() {
  let off;
  try { off = JSON.parse(recall(MODULES_KEY) || 'null'); } catch { off = null; }
  if (!Array.isArray(off)) return;
  if (!modulesRec() && off.length) await putModules(new Set(off));
  try { localStorage.removeItem(MODULES_KEY); } catch { /* приватний режим */ }
}

const GUN_SEGS = [['guns', 'Зброя', 'rifle'], ['gear', 'Екіпірування', 'vest']];
let gunsSeg = recall('shooters-log:guns-seg') === 'gear' ? 'gear' : 'guns';

/** Вкладка «Арсенал»: стволи й екіпірування панеллю segBar, розділ запам'ятовується. */
function renderGuns() {
  // Вимкнене екіпірування — лише зброя, без панелі розділів (одна вкладка — панель ні до чого)
  const segs = visibleSegs(GUN_SEGS);
  if (!segs.some(([k]) => k === gunsSeg)) gunsSeg = 'guns';
  const seg = segs.length > 1 ? segBar(segs, gunsSeg, (k) => {
    gunsSeg = k;
    remember('shooters-log:guns-seg', k);
    render();
  }) : null;
  return h('div', {}, seg, gunsSeg === 'gear' ? renderGear() : renderWeapons());
}

// Категорії екіпірування: вбудовані — [id, назва (ключ перекладу), відтінок шапки, значок].
// Стрілець правит їх олівцем у шапці категорії — це записи gearKinds: запис з id вбудованої
// міняє її (hidden — прибрана), з новим id — своя категорія.
const GEAR_KINDS = [['armor', 'Бронезахист', 95, 'armor'], ['carry', 'Розвантаження, підсумки й одяг', 35, 'vest'],
  ['devices', 'Прилади', 205, 'earmuffs'], ['cleaning', 'Чищення й догляд', 175, 'bottle'],
  ['cases', 'Чохли, кейси й сейф', 265, 'gun-case'], ['reload', 'Релоадінг', 15, 'flask'], ['other', 'Інше', 60, 'crate']];
// «Інше» не прибирається: туди потрапляє все, чия категорія зникла
const GEAR_FALLBACK = 'other';
const SOLD_LOOK = { hue: 140, icon: 'price-tag' };

/** Категорії по порядку, назви вже перекладені; hidden: true — лише прибрані вбудовані. */
function gearKinds({ hidden = false } = {}) {
  const own = new Map(state.gearKinds.map((r) => [r.id, r]));
  const list = [
    ...GEAR_KINDS.map(([id, name, hue, icon], i) => {
      const r = own.get(id);
      return { id, builtIn: true, name: r?.name || t(name), hue: r?.hue ?? hue, icon: r?.icon ?? icon, order: r?.order ?? i, hidden: Boolean(r?.hidden) };
    }),
    ...state.gearKinds.filter((r) => !GEAR_KINDS.some(([id]) => id === r.id))
      .map((r) => ({ id: r.id, name: r.name, hue: r.hue ?? 60, icon: r.icon ?? 'crate', order: r.order ?? GEAR_KINDS.length, hidden: false })),
  ];
  return list.filter((k) => k.hidden === hidden).sort((a, b) => a.order - b.order);
}

/** Категорія запису: колишня «Одяг і форма» — розвантаження, прибрана чи невідома — «Інше». */
function gearKind(k, kinds = gearKinds()) {
  const id = k === 'clothes' ? 'carry' : k;
  return kinds.find((x) => x.id === id) ?? kinds.find((x) => x.id === GEAR_FALLBACK);
}

function gearIcon(key) {
  const el = h('span', { class: 'ammo-ico gear-ico', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24">${gearSvg(key)}</svg>`;
  return el;
}

/** Підсумок у шапці категорії: гривні великим, долари — дрібним рядком під ними. */
function gearTotal(uah, usd = null) {
  return h('div', { class: 'cal-total money' }, fmt.num(Math.round(uah)), h('small', {}, ' грн'), usdLine(usd));
}

const placeLine = (date, place) => [date && fmt.date(date), place].filter(Boolean).join(' · ');
const priceOf = (x) => Number(x) || 0;
const grn = (n) => `${fmt.num(Math.round(n))} грн`;

// Долари поруч із гривнями (⚙ → «Курс НБУ»): кожна сума — за курсом НБУ на день, коли за неї платили;
// розрахункові (ціна пострілу, склад, собівартість) — за сьогоднішнім курсом
const usdOn = () => recall('shooters-log:usd') === 'on';
/** День руху: дата, а без неї — коли його внесли; покупки без дати лишаються без долара. */
const dayOf = (m) => m?.date ?? (m?.created ? M.today(new Date(m.created)) : null);
/** Гривні в $: за курсом, вписаним у запис (платили за свій курс), інакше — НБУ на дату. */
const usdOf = (uah, iso, rate) => (Number(rate) > 0 ? Number(uah) / Number(rate) : toUsd(uah, iso));
/**
 * Сума в $ за рядами [грн, дата, свій курс?]; null — долари вимкнено або в якогось ряду нема дати чи курсу.
 * always — показати й без увімкнених доларів (скільки обійшовся ствол).
 */
function usdSum(rows, always = false) {
  if (!always && !usdOn()) return null;
  let sum = 0;
  for (const [uah, iso, rate] of rows) {
    const n = Number(uah) || 0;
    if (!n) continue;
    const v = usdOf(n, iso, rate);
    if (v === null) return null;
    sum += v;
  }
  return sum || null;
}
const usdFmt = (v) => `≈$${fmt.num(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100)}`;
/** « · ≈$N» у рядок тексту; порожньо, коли доларів нема. */
const usdTail = (rows, always = false) => { const v = usdSum(rows, always); return v === null ? '' : ` · ${usdFmt(v)}`; };
/** Розрахункова сума — за сьогоднішнім курсом. */
const usdNow = (uah) => usdTail([[uah, M.today()]]);
/** Другий дрібний рядок «≈$N» під сумою на плитці чи в таблиці. */
const usdLine = (v) => (v === null ? null : h('small', { class: 'usd' }, usdFmt(v)));
/** Вартість рухів у $: постріли — за днем стрільби, покупки й спорядження — за днем запису. */
const usdMoves = (list) => usdSum(list.map((m) => (m.kind === 'shot' ? [M.shotCost(state, m), dayOf(m)] : [m.price, dayOf(m), m.usdRate])));
/**
 * Поле «Курс $» у формі покупки чи продажу — лише коли долари ввімкнено; порожнє — курс НБУ.
 * Підказка в полі — курс НБУ на вибрану дату, щоб було з чим порівняти.
 */
function rateField(name, value) {
  return usdOn() ? { name, label: t('Курс $, грн'), type: 'number', step: 'any', min: 0, value, half: true } : null;
}
function rateHint(f, name, dateName) {
  const input = f.inputs[name];
  if (!input) return;
  const show = () => {
    const rate = rateOn(f.inputs[dateName]?.value || M.today());
    input.placeholder = rate ? t('НБУ {rate}', { rate: fmt.num(Math.round(rate * 100) / 100) }) : '';
  };
  f.inputs[dateName]?.addEventListener('input', show);
  f.inputs[dateName]?.addEventListener('change', show);
  show();
}
/** Покупка ствола й увесь тюнінг — кожне за своєю датою. */
/** День для курсу $: покупка без дати — за сьогоднішнім курсом, щоб підсумок у $ не зникав. */
const gunDay = (w) => w.buyDate ?? M.today();
const modDay = (w, m) => m.date ?? M.today();
const investRows = (w) => [[w.buyPrice, gunDay(w), w.usdRate], ...tuneItems(w).map((m) => [m.price, modDay(w, m), m.usdRate])];
/** Приціл з покупкою (ціна чи дата) — та сама річ, що й тюнінг: у «Покупка й тюнінг», витратах і звіті. */
const scopeBought = (sc) => Boolean(priceOf(sc.price) || sc.date);
/** Усе куплене на ствол: тюнінг і приціли з покупкою — одним списком. */
const tuneItems = (w) => [...(w.mods ?? []), ...(w.scopes ?? []).filter(scopeBought)];
const isScopeOf = (w, x) => (w?.scopes ?? []).some((sc) => sc.id === x.id);
/** Перегляд покупки на ствол: приціл — своя шторка (без «Продав»), тюнінг — своя. */
const tuneDetail = (w, x) => (isScopeOf(w, x) ? scopeDetail(w, x) : modDetail(w, x));

const isSold = (x) => Boolean(x?.soldDate);

/** Усе продане: стволи, знятий тюнінг, екіпірування — { item, weapon?, kind }. */
function soldItems() {
  return [
    ...state.weapons.filter(isSold).map((w) => ({ item: w, kind: 'gun' })),
    ...state.weapons.flatMap((w) => (w.mods ?? []).filter(isSold).map((m) => ({ item: m, weapon: w, kind: 'mod' }))),
    ...state.gear.filter(isSold).map((g) => ({ item: g, kind: 'gear' })),
  ].sort((a, b) => b.item.soldDate.localeCompare(a.item.soldDate));
}

/**
 * Усі витрати з датою: покупка стволів (і архівних), тюнінг, екіпірування, набої й компоненти; продаж — мінусом.
 * Набої й компоненти — лише покупки: спорядження вже оплачене покупкою компонентів.
 */
function spending() {
  const all = [...state.weapons.map((w) => ['gun', w, null]), ...state.weapons.flatMap((w) => tuneItems(w).map((m) => ['mod', m, w])),
    ...state.gear.map((g) => ['gear', g, null])];
  const unit = (m) => (m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : 'шт');
  return [
    ...all.map(([kind, x, weapon]) => ({ kind, item: x, weapon, name: x.name, date: kind === 'gun' ? x.buyDate : x.date, price: priceOf(kind === 'gun' ? x.buyPrice : x.price), rate: x.usdRate })),
    ...all.filter(([, x]) => isSold(x)).map(([of, x, weapon]) => ({ kind: 'sale', of, item: x, weapon, name: x.name, date: x.soldDate, price: -priceOf(x.soldPrice), rate: x.soldUsdRate })),
    ...state.movements.filter((m) => m.kind === 'buy' && (m.cartridgeId || m.componentId))
      .map((m) => ({ kind: m.componentId ? 'reload' : 'ammo', item: m, weapon: null, name: movementTitle(m), qty: `${fmt.num(m.qty)} ${unit(m)}`, date: dayOf(m), price: priceOf(m.price), rate: m.usdRate })),
  ].filter((x) => x.price);
}

/** Частки витрат — у цьому порядку знизу вгору в стовпчику й у розборі періоду. */
// Набої — готові патрони; релоад — компоненти для спорядження (порох, капсулі, кулі, гільзи)
const SPEND_PARTS = [['gun', 'зброя'], ['mod', 'тюнінг'], ['gear', 'екіпірування'], ['ammo', 'набої'], ['reload', 'релоадінг']];
const spendPartIcon = (i) => h('i', { class: `bar-part p${i}` });
const spendPart = (x) => SPEND_PARTS.findIndex(([k]) => k === (x.of ?? x.kind));
/** Сума покупок (без продажів) — уся чи однієї категорії. */
const boughtSum = (items, kind = null) => items.reduce((s, x) => s + (x.kind !== 'sale' && (!kind || x.kind === kind) ? x.price : 0), 0);
/** Зміна до попереднього періоду: «↑35%»; попереднього нема чи там нуль — нічого. */
function spendDelta(cur, before) {
  if (!before) return null;
  const pct = Math.round(((cur - before) / before) * 100);
  return h('span', { class: 'spend-delta' }, `${pct > 0 ? '↑' : pct < 0 ? '↓' : '±'}${Math.abs(pct)}%`);
}

/** Розбір витрат за рік чи місяць: частки категорій і зміна до попереднього періоду, покупки й продажі. */
function spendingPeriodSheet(title, items, prev = null) {
  const bought = items.filter((x) => x.kind !== 'sale').sort((a, b) => b.price - a.price);
  const sales = items.filter((x) => x.kind === 'sale');
  const total = boughtSum(items);
  const before = (kind) => (prev ? boughtSum(prev.items, kind) : 0);
  // Долари — дрібно поруч із гривнями, як у решті застосунку (лише коли ввімкнено й у всіх покупок є курс)
  const usdRows = (kind = null) => bought.filter((x) => !kind || x.kind === kind).map((x) => [x.price, x.date, x.rate]);
  const shares = SPEND_PARTS.map(([k, label], i) => {
    const sum = boughtSum(items, k);
    if (!sum) return null;
    const pct = Math.round((sum / total) * 100);
    return h('div', { class: 'spend-share' },
      h('div', { class: 'progress-label' }, h('span', {}, spendPartIcon(i), t(label)),
        h('span', {}, `${grn(sum)}${usdTail(usdRows(k))} · ${pct}%`, spendDelta(sum, before(k)))),
      h('div', { class: 'bar' }, h('div', { class: `fill bar-part p${i}`, style: `width:${Math.max(2, pct)}%` })));
  });
  const head = h('div', { class: 'spend-total' }, h('span', {}, t('Разом')), h('b', {}, tileMoney(total, usdSum(usdRows()))),
    before() ? h('span', { class: 'muted small' }, spendDelta(total, before()), ' ', t('до {period}', { period: prev.label })) : null);
  const open = (x) => () => {
    close();
    const kind = x.of ?? x.kind;
    if (kind === 'gun') weaponDetail(x.item);
    else if (kind === 'mod') tuneDetail(x.weapon, x.item);
    else if (kind === 'ammo' || kind === 'reload') movementDetail(x.item);
    else gearDetail(x.item);
  };
  // Квадратик відтінку з графіка й категорія в підписі — видно, куди пішла покупка
  const row = (x) => {
    const i = spendPart(x);
    return priceRow([spendPartIcon(i), x.name], [t(SPEND_PARTS[i][1]), fmt.date(x.date), x.weapon?.name, x.qty].filter(Boolean).join(' · '),
      Math.abs(x.price), open(x), null, x.date, x.rate);
  };
  const close = sheet(title, h('div', { class: 'spend-sheet' },
    total ? box(t('Покупки'), h('div', {}, head, shares, h('div', { class: 'rows spend-rows' }, bought.map(row)))) : null,
    sales.length ? box(t('Продано'), h('div', { class: 'rows' }, sales.map(row))) : null));
}

/** Витрати в CSV для Excel: покупки й продажі (мінусом) від старих до нових, сума в грн і $. */
async function exportSpendingCsv(list) {
  if (!list.length) { toast(t('Немає записів для експорту')); return; }
  const rows = [...list].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((x) => [
    x.date ? fmt.date(x.date) : '', t(x.kind === 'sale' ? 'Продаж' : 'Покупка'), t(SPEND_PARTS[spendPart(x)][1]), x.name ?? '',
    x.weapon?.name ?? '', x.qty ?? '', csvNum(x.price), csvNum(x.date || x.rate ? usdOf(x.price, x.date, x.rate) : null)]);
  const head = [t('Дата'), t('Тип'), t('Категорія'), t('Назва'), t('Зброя'), t('Кількість'), t('Сума, грн'), t('Сума, $')];
  await offerFile(`shooters-log-spending-${M.today()}.csv`, csvText(head, rows), 'text/csv');
}

/** Продаж: ціна, дата, кому чи де; «Не продано» скасовує продаж. */
function sellForm(item, onSave) {
  const f = form([
    { name: 'soldPrice', label: t('Ціна продажу, грн'), type: 'number', step: 'any', min: 0, value: item.soldPrice, half: true },
    { name: 'soldDate', label: t('Дата продажу'), type: 'date', required: true, value: item.soldDate ?? M.today(), half: true },
    rateField('soldUsdRate', item.soldUsdRate),
    { name: 'soldPlace', label: t('Кому / де продано'), value: item.soldPlace, wide: true },
  ].filter(Boolean));
  rateHint(f, 'soldUsdRate', 'soldDate');
  const close = sheet(t('Продаж: {name}', { name: item.name }), f.el, {
    actions: [
      isSold(item) ? btn(t('Не продано'), () => { close(); onSave({ soldPrice: null, soldDate: null, soldPlace: null, soldUsdRate: null }); })
        : btn(t('Скасувати'), () => close()),
      btn(t('Зберегти'), () => {
        if (invalidField(f)) return;
        close();
        onSave(f.values());
      }, 'primary'),
    ],
  });
}

/** Витрати по роках; якщо рік один — по місяцях (останні 12). */
function spendingChart(list) {
  const dated = list.filter((x) => x.date);
  const by = (period) => [...dated.reduce((map, x) => {
    const key = periodOf(x.date, period).key;
    return map.set(key, [...(map.get(key) ?? []), x]);
  }, new Map())].sort(([a], [b]) => (a < b ? -1 : 1));
  let period = 'year';
  let rows = by(period);
  if (rows.length < 2) { period = 'month'; rows = by(period).slice(-12); }
  if (rows.length < 2) return null;
  const sumOf = (items) => items.reduce((s, x) => s + x.price, 0);
  // Стовпчик — чисті витрати (з продажами) одним кольором; тап — розбір періоду за категоріями
  const labelOf = (key) => PERIOD_CHART[period].label(key);
  const bars = rows.map(([key, items], i) => {
    const prev = rows[i - 1] ? { label: labelOf(rows[i - 1][0]), items: rows[i - 1][1] } : null;
    return { label: labelOf(key), value: sumOf(items), onclick: () => spendingPeriodSheet(labelOf(key), items, prev) };
  });
  const csv = toolBtn('share', t('Експорт у CSV'), () => exportSpendingCsv(list), 'small box-corner');
  return box(t(period === 'year' ? 'Витрати за роками' : 'Витрати за місяцями'), h('div', {},
    barChart(bars, { format: (v) => fmt.num(Math.round(v)), inside: true }),
    h('p', { class: 'muted small' }, t(period === 'year' ? 'Натисніть на рік — розбивка за категоріями' : 'Натисніть на місяць — розбивка за категоріями'))),
    { fold: 'spend-chart', corner: csv });
}

function renderGear() {
  $('subtitle').textContent = t('Екіпірування й вкладення в зброю');
  const spent = spending();
  const sum = (kind) => spent.filter((x) => x.kind === kind).reduce((s, x) => s + x.price, 0);
  const total = sum('gun') + sum('mod') + sum('gear');
  const back = -sum('sale');
  if (!state.gear.length && !total) {
    return h('div', {}, empty(t('Екіпірування не додано'), t('Додайте форму, бронежилет, плити, шолом, розвантаження. Ціну покупки ствола й тюнінг вказуйте в картці зброї.'), [addBtn()]), hideHint('gear'));
  }
  const rowsOf = (kind) => spent.filter((x) => x.kind === kind).map((x) => [Math.abs(x.price), x.date, x.rate]);
  const split = [['gun', 'зброя'], ['mod', 'тюнінг'], ['gear', 'екіпірування']]
    .filter(([k]) => sum(k)).map(([k, label]) => {
      // Тут « · » уже ділить категорії — долари в дужках, щоб не злилися з ними
      const usd = usdSum(rowsOf(k));
      return `${t(label)} ${grn(sum(k))}${usd === null ? '' : ` (${usdFmt(usd)})`}`;
    }).join(' · ');
  const usdTotal = usdSum([...rowsOf('gun'), ...rowsOf('mod'), ...rowsOf('gear')]);
  const usdBack = usdSum(rowsOf('sale'));
  const kinds = gearKinds();
  const byKind = new Map(groupBy(state.gear.filter((g) => !isSold(g)).sort(byName), (g) => gearKind(g.kind, kinds).id));
  // Порожні категорії — рядком значків під картками: видно, що є, тап — змінити
  const idle = kinds.filter((k) => !byKind.has(k.id));
  const sold = soldItems();
  const net = back ? h('div', {}, t('повернулося з продажів {back} · чисті витрати {net}', {
    back: grn(back) + (usdBack === null ? '' : ` · ${usdFmt(usdBack)}`),
    net: grn(total - back) + (usdTotal === null || usdBack === null ? '' : ` · ${usdFmt(usdTotal - usdBack)}`) })) : null;
  return h('div', {},
    hero(t('Вкладено всього'), tileMoney(total, usdTotal), [split, net], 'accent'),
    spendingChart(spent),
    kinds.filter((k) => byKind.has(k.id)).map((k) => {
      const items = byKind.get(k.id);
      return groupCard(`gear:${k.id}`, {
        hue: k.hue, icon: gearIcon(k.icon), title: k.name, count: items.length, cls: 'gear-group', onEdit: () => gearKindForm(k),
        total: gearTotal(items.reduce((s, g) => s + priceOf(g.price), 0), usdSum(items.map((g) => [g.price, g.date, g.usdRate]))),
      }, items.map((g) => priceRow(g.name, placeLine(g.date, g.place) || g.note, g.price, () => gearDetail(g), photoThumb(gearPhoto(g.id)), g.date, g.usdRate)));
    }),
    gearKindsBar(idle),
    sold.length ? groupCard('gear:sold', {
      hue: SOLD_LOOK.hue, icon: gearIcon(SOLD_LOOK.icon), title: t('Продано'), count: sold.length, cls: 'gear-group sold',
      total: gearTotal(back, usdBack),
    }, sold.map(({ item, weapon, kind }) => {
        const paid = priceOf(kind === 'gun' ? item.buyPrice : item.price);
        const got = priceOf(item.soldPrice);
        const paidOn = kind === 'gun' ? item.buyDate : item.date;
        const sub = [fmt.date(item.soldDate), weapon?.name, paid ? t('куплено за {a} → продано за {b}', {
          a: grn(paid) + usdTail([[paid, paidOn, item.usdRate]]), b: grn(got) + usdTail([[got, item.soldDate, item.soldUsdRate]]) }) : null].filter(Boolean).join(' · ');
        const open = kind === 'gun' ? () => weaponDetail(item) : kind === 'mod' ? () => modDetail(weapon, item) : () => gearDetail(item);
        return priceRow(item.name, sub, got, open, null, item.soldDate, item.soldUsdRate);
      })) : null);
}

/** Рядок покупки: назва, «дата · де», сума праворуч. */
function priceRow(title, sub, price, onclick, icon = null, iso = null, rate = null, cls = '') {
  return h('button', { type: 'button', class: `row ${icon ? 'kind-tune' : ''} ${cls}`, onclick }, icon,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'muted small' }, sub) : null),
    priceOf(price) ? h('span', { class: 'row-qty' }, tileMoney(priceOf(price), usdSum([[price, iso, rate]]))) : null);
}

/** Кнопки посилань на сторінку товару: по одному в рядку, лише http(s); підпис — домен магазину. */
function shopLinks(text) {
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
  const urls = String(text ?? '').split(/\s+/).filter((s) => /^https?:\/\//i.test(s) && host(s));
  if (!urls.length) return null;
  const seen = {};
  return h('div', { class: 'shop-links' }, urls.map((u) => {
    const d = host(u);
    // Кілька посилань на один магазин (набір) — нумеруємо, щоб кнопки розрізнялись
    const n = urls.filter((x) => host(x) === d).length > 1 ? ` · ${(seen[d] = (seen[d] ?? 0) + 1)}` : '';
    return h('a', { class: 'btn mini shop-link', href: u, target: '_blank', rel: 'noopener noreferrer', title: u }, `🔗 ${d}${n}`);
  }));
}

const linksField = (value) => ({ name: 'links', label: t('Посилання на товар'), type: 'textarea', rows: 2, value, placeholder: t('https://… — кожне з нового рядка'), wide: true });

/** Спільна форма покупки: екіпірування (з категорією) і тюнінг ствола. */
function purchaseForm(title, item, { kinds = null, placeholder, onSave, onRemove, onSell, photo = undefined, preset = null, onSearch = null, mounted = false }) {
  // preset — незбережена чернетка (повернулись із пошуку фото): лише значення полів, без «Видалити»/«Продав»
  const src = item ?? preset;
  const f = form([
    { name: 'name', label: t('Назва'), required: true, value: src?.name, placeholder, wide: true },
    kinds ? { name: 'kind', label: t('Категорія'), type: 'select', value: src?.kind ?? kinds[0][0], options: kinds, wide: true } : null,
    { name: 'price', label: t('Ціна, грн'), type: 'number', step: 'any', min: 0, value: src?.price, half: true },
    { name: 'date', label: t('Дата покупки'), type: 'date', value: src?.date ?? M.today(), half: true },
    rateField('usdRate', src?.usdRate),
    { name: 'place', label: t('Де куплено'), value: src?.place, placeholder: t('Магазин, сайт, з рук…'), wide: true },
    linksField(src?.links),
    // Вага — у «Габарити й вага» ствола складається вага з усім, що стоїть на ньому
    { name: 'weight', label: t('Вага, г'), type: 'number', step: 'any', min: 0, value: src?.weight, half: true },
    mounted ? { name: 'on', label: t('Зараз на стволі'), type: 'select', value: src?.on ? '1' : '', options: [['', t('не стоїть')], ['1', t('стоїть')]], half: true } : null,
    { name: 'note', label: t('Примітка'), value: src?.note, wide: true },
    // Характеристики — з сайту виробника чи магазину: «🔍 Характеристики» шукає в Google, текст вставляють сюди
    photo === undefined ? null : { name: 'specs', label: t('Характеристики'), type: 'textarea', rows: 4, value: src?.specs, placeholder: t('Вага, розміри, кріплення… — скопіюйте з сайту'), wide: true },
  ].filter(Boolean));
  rateHint(f, 'usdRate', 'date');
  const specsFind = f.inputs.specs ? h('div', { class: 'specs-find' }, btn(`🔍 ${t('Характеристики')}`, () => {
    const q = f.inputs.name.value.trim();
    if (!q) { toast(t('Спершу впишіть назву')); return; }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(`${q} ${t('характеристики')}`)}`, '_blank', 'noopener');
  }, 'mini')) : null;
  // Категорія — чипами, як тип компонента: видно всі одразу, без системного списку
  chipPicker(f.inputs.kind, { seg: false, cls: 'chips-sm' });
  // «Стоїть на стволі» — перемикачем, як на картці ствола; значення лишається в select, тож збереження й чернетка ті самі
  let onSwitch = null;
  if (f.inputs.on) {
    const select = f.inputs.on;
    select.closest('.field').hidden = true;
    const cb = h('input', {
      type: 'checkbox', role: 'switch', checked: select.value === '1',
      onchange: () => { select.value = cb.checked ? '1' : ''; select.dispatchEvent(new Event('change', { bubbles: true })); },
    });
    onSwitch = h('div', { class: 'field wide' }, switchLabel(cb, t('Стоїть на стволі')));
  }
  // Фото — лише там, де його передали (тюнінг); undefined — форма без фото
  const pick = photo === undefined ? null : photoPicker(photo?.current ?? null, {
    file: photo?.file ?? null,
    query: () => f.inputs.name.value.trim(),
    onSearch: onSearch && (() => onSearch(f.values())),
  });
  // Розділи: що це → покупка (у нової відкрита: ціна й дата — головне в покупці) → вага й характеристики
  const num = (name) => Number(String(f.inputs[name]?.value ?? '').replace(',', '.')) || 0;
  const buySum = () => [num('price') ? `${fmt.num(num('price'))} ${t('грн')}` : null,
    f.inputs.date.value ? fmt.date(f.inputs.date.value) : null, f.inputs.place.value.trim() || null].filter(Boolean).join(' · ');
  const specSum = () => [num('weight') ? grams(num('weight')) : null,
    f.inputs.specs?.value.trim() ? t('є характеристики') : null].filter(Boolean).join(' · ');
  const body = h('div', { class: 'weapon-form' },
    pick?.el,
    box(t('Основне'), formPart(f, ['name', 'kind', 'note', 'on'], onSwitch)),
    formBox(t('Покупка'), formPart(f, ['price', 'date', 'usdRate', 'place', 'links']), buySum, { open: !item }),
    formBox(f.inputs.specs ? t('Вага й характеристики') : t('Вага'), formPart(f, ['weight', 'specs'], specsFind), specSum));
  // Продати й кошик — ліворуч від заголовка; внизу лише «Скасувати» і «Зберегти»
  const close = sheet(title, body, {
    lead: item && onSell ? toolBtn('sell', isSold(item) ? t('Продаж') : t('Продати'), () => { close(); sellForm(item, onSell); }) : null,
    tools: item && onRemove ? [toolBtn('delete', t('Видалити'), () => { close(); confirmSheet(t('Видалити?'), item.name, t('Видалити'), onRemove); }, 'danger')] : [],
    actions: [
      btn(t('Скасувати'), () => close()),
      btn(t('Зберегти'), async () => {
        if (invalidField(f)) return;
        close();
        const v = f.values();
        await onSave({ ...(item ?? { id: db.uid(), created: Date.now() }), ...v, weight: v.weight > 0 ? v.weight : null, ...(mounted ? { on: v.on === '1', off: undefined } : {}) }, pick?.value());
      }, 'primary'),
    ],
  });
}

/**
 * Перегляд покупки (екіпірування чи тюнінг): фото, ціна, коли й де, характеристики, продаж.
 * Правка — олівцем, як у набоїв і компонентів: тап по рядку нічого не зачепить.
 */
function purchaseDetail(item, { sub, photo, onEdit, onSell, onRemove, extra = null }) {
  const kv = (rows) => h('dl', { class: 'kv' }, rows.filter(Boolean).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const money = (n, iso, rate) => (n ? tileMoney(n, usdSum([[n, iso, rate]])) : t('без ціни'));
  const paid = priceOf(item.price);
  const got = priceOf(item.soldPrice);
  const close = sheet(item.name, h('div', { class: 'purchase-view' },
    h('div', { class: 'purchase-head' },
      photo ? h('img', { class: 'purchase-photo', src: photo.thumb, alt: t('Фото'), onclick: () => viewer([photo], 0) }) : null,
      h('div', { class: 'purchase-sub' }, sub)),
    extra,
    h('div', { class: 'stats even' },
      stat(t('сплачено'), money(paid, item.date, item.usdRate), 'accent'),
      stat(t('Дата покупки'), item.date ? fmt.date(item.date) : '—')),
    kv([item.weight ? [t('Вага'), grams(item.weight)] : null, item.place ? [t('Де куплено'), item.place] : null,
      shopLinks(item.links) ? [t('Посилання'), shopLinks(item.links)] : null, item.note ? [t('Примітка'), item.note] : null]),
    isSold(item) ? box(t('Продаж'), [
      h('div', { class: 'stats even' },
        stat(t('продано за'), money(got, item.soldDate, item.soldUsdRate)),
        stat(t('Дата продажу'), fmt.date(item.soldDate))),
      kv([item.soldPlace ? [t('Кому / де продано'), item.soldPlace] : null])]) : null,
    item.specs ? box(t('Характеристики'), h('div', { class: 'purchase-specs' }, item.specs)) : null), {
    // Продати й кошик — ліворуч від заголовка, як у формі; олівець — праворуч
    lead: onSell ? toolBtn('sell', isSold(item) ? t('Продаж') : t('Продати'), () => { close(); sellForm(item, onSell); }) : null,
    tools: [
      toolBtn('edit', t('Змінити'), () => { close(); onEdit(); }),
      onRemove ? toolBtn('delete', t('Видалити'), () => { close(); confirmSheet(t('Видалити?'), item.name, t('Видалити'), onRemove); }, 'danger') : null,
    ].filter(Boolean),
  });
}

/** Продаж і видалення екіпірування — спільні для перегляду й форми. */
function gearActions(g) {
  return {
    onSell: (sale) => saveEntity('gear', { ...g, ...sale }),
    onRemove: async () => {
      await db.write({ gear: { del: [g.id] } });
      const p = gearPhoto(g.id);
      if (p) await removePhotos([p]);
      else await refresh();
    },
  };
}

function gearDetail(g) {
  purchaseDetail(g, {
    sub: gearKind(g.kind).name,
    photo: gearPhoto(g.id), onEdit: () => gearForm(g), ...gearActions(g),
  });
}

function gearForm(g = null, { file = null, preset = null } = {}) {
  purchaseForm(g ? t('Змінити') : t('Нове екіпірування'), g && { ...g, kind: gearKind(g.kind).id }, {
    kinds: gearKinds().map((k) => [k.id, k.name]), placeholder: t('Плитоноска, шолом, підсумок…'),
    photo: { current: g ? gearPhoto(g.id) : null, file },
    preset,
    onSearch: (values) => remember(PHOTO_FOR, JSON.stringify({ gearId: g?.id ?? null, draft: g ? null : values })),
    onSave: async (obj, photo) => {
      await saveEntity('gear', obj);
      await saveItemPhoto({ gearId: obj.id }, photo);
    },
    ...(g ? gearActions(g) : {}),
  });
}

/** Під картками: порожні категорії значками (тап — змінити), «+ Категорія» й повернення прибраних вбудованих. */
function gearKindsBar(idle) {
  const hidden = gearKinds({ hidden: true });
  return h('div', { class: 'kind-bar' },
    idle.length ? h('div', { class: 'muted small' }, t('Порожні категорії:')) : null,
    h('div', { class: 'kind-chips' },
      idle.map((k) => h('button', { type: 'button', class: 'kind-chip', style: `--h:${k.hue}`, onclick: () => gearKindForm(k) }, gearIcon(k.icon), k.name)),
      h('button', { type: 'button', class: 'kind-chip add', onclick: () => gearKindForm() }, `+ ${t('Категорія')}`)),
    hidden.length ? h('div', { class: 'btn-row' }, btn(t('Повернути прибрані категорії ({n})', { n: hidden.length }), () => restoreGearKinds(hidden), 'mini quiet')) : null);
}

async function restoreGearKinds(list) {
  await db.write({ gearKinds: { put: list.map((k) => ({ ...state.gearKinds.find((r) => r.id === k.id), hidden: false })) } });
  await refresh();
  toast(t('Категорії повернулися: {n}', { n: list.length }));
}

/**
 * Категорія екіпірування: назва, значок, колір шапки й місце серед інших — олівцем у шапці категорії
 * чи «+ Категорія» під картками. Незмінену назву вбудованої не записуємо: її перекладає мова застосунку.
 */
function gearKindForm(k = null) {
  const kinds = gearKinds();
  const d = { icon: k?.icon ?? 'crate', hue: k?.hue ?? GEAR_HUES[(kinds.length * 5) % GEAR_HUES.length] };
  const others = kinds.filter((x) => x.id !== k?.id);
  const here = k ? kinds.findIndex((x) => x.id === k.id) : others.length;
  const fName = form([{ name: 'name', label: t('Назва'), required: true, value: k?.name, placeholder: t('Тепловізори, медицина…'), wide: true }]);
  const fPlace = form([{
    name: 'place', label: t('Місце в списку'), type: 'select', value: String(here), wide: true,
    options: [...others.map((x, i) => [String(i), t('перед «{name}»', { name: x.name })]), [String(others.length), t('у кінці')]],
  }]);
  // Превʼю — та сама шапка, що буде над покупками
  let ico = gearIcon(d.icon);
  const title = h('div', { class: 'cal-title' });
  const preview = h('div', { class: 'cal-group kind-preview' }, h('div', { class: 'cal-head' }, ico, h('div', { class: 'cal-name' }, title)));
  const icons = gearIconPicker(d, () => paint());
  const hues = huePicker(d, () => paint());
  const iconName = h('span', { class: 'pick-value' });
  // Відтінок — на всю шторку: ним фарбуються й превʼю, і вибраний значок
  const body = h('div', { class: 'kind-form' });
  function paint() {
    body.style.setProperty('--h', d.hue);
    const next = gearIcon(d.icon);
    ico.replaceWith(next);
    ico = next;
    title.textContent = fName.inputs.name.value.trim() || t('Нова категорія');
    iconName.replaceChildren(...icons.label());
    icons.paint();
    hues.paint();
  }
  fName.inputs.name.addEventListener('input', paint);
  const iconFold = h('details', { class: 'pick-fold' }, h('summary', {}, h('span', { class: 'field-label' }, t('Значок')), iconName), icons.el);
  paint();
  body.append(preview, fName.el, iconFold, h('div', { class: 'field-label' }, t('Колір')), hues.el, fPlace.el);
  const close = sheet(k ? t('Категорія') : t('Нова категорія'), body, {
    tools: k && k.id !== GEAR_FALLBACK ? [toolBtn('delete', t('Видалити'), () => { close(); removeGearKind(k); }, 'danger')] : [],
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    if (invalidField(fName)) return;
    const name = fName.inputs.name.value.trim();
    const id = k?.id ?? db.uid();
    const base = GEAR_KINDS.find(([x]) => x === id);
    const stored = (x) => state.gearKinds.find((r) => r.id === x) ?? { id: x, created: Date.now() };
    const rec = { ...stored(id), name, icon: d.icon, hue: d.hue };
    if (base && name === t(base[1])) delete rec.name;
    // Місце — порядковим номером для всіх, щоб на іншому пристрої список став так само; пишемо лише змінені
    const at = Number(fPlace.inputs.place.value);
    const seq = [...others.slice(0, at), { id }, ...others.slice(at)];
    const put = seq.flatMap((x, i) => (x.id === id ? [{ ...rec, order: i }] : x.order === i ? [] : [{ ...stored(x.id), order: i }]));
    close();
    await db.write({ gearKinds: { put } });
    await refresh();
    if (!k) toast(t('Категорію «{name}» додано', { name }));
  }
}

/** Прибрати категорію; покупки з неї — в обрану іншу. Вбудована ховається (її можна повернути), своя видаляється. */
function removeGearKind(k) {
  const kinds = gearKinds();
  const items = state.gear.filter((g) => gearKind(g.kind, kinds).id === k.id);
  const drop = async (to = null) => {
    await db.write({
      gearKinds: k.builtIn
        ? { put: [{ ...(state.gearKinds.find((r) => r.id === k.id) ?? { id: k.id, created: Date.now() }), hidden: true }] }
        : { del: [k.id] },
      ...(to ? { gear: { put: items.map((g) => ({ ...g, kind: to })) } } : {}),
    });
    await refresh();
    toast(t('Категорію «{name}» видалено', { name: k.name }));
  };
  if (!items.length) {
    confirmSheet(t('Видалити категорію?'), k.name, t('Видалити'), () => drop());
    return;
  }
  // «Інше» — першим: найчастіше покупки переносять саме туди
  const others = kinds.filter((x) => x.id !== k.id).sort((a, b) => (b.id === GEAR_FALLBACK) - (a.id === GEAR_FALLBACK));
  const close = sheet(t('Видалити «{name}»?', { name: k.name }), h('div', {},
    h('p', { class: 'muted' }, t('У ній {n} поз. Куди їх перенести?', { n: items.length })),
    h('div', { class: 'rows kind-move' }, others.map((x) => h('button', {
      type: 'button', class: 'row', style: `--h:${x.hue}`, onclick: () => { close(); drop(x.id); },
    }, gearIcon(x.icon), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, x.name)))))), {
    actions: [btn(t('Скасувати'), () => close())],
  });
}

// Пошук значка без різниці між великими літерами й видами апострофа
const findKey = (s) => s.toLocaleLowerCase().replace(/[’ʼ`]/g, "'").trim();

/** Усі значки групами (захист, оптика, похід…), зверху — пошук за назвою; назва групи теж шукається. */
function gearIconPicker(d, onPick) {
  const buttons = [];
  const names = new Map();
  const groups = GEAR_ICON_GROUPS.map((g) => {
    const { title } = g;
    const row = h('div', { class: 'icon-opts', role: 'group', 'aria-label': title }, g.icons.map(([key, name]) => {
      names.set(key, name);
      const b = h('button', {
        type: 'button', class: 'icon-opt', title: name, 'aria-label': name, dataset: { v: key, find: findKey(name) },
        onclick: () => { d.icon = key; onPick(); },
      });
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${gearSvg(key)}</svg>`;
      buttons.push(b);
      return b;
    }));
    return h('div', { class: 'icon-group', dataset: { find: findKey(title) } }, h('div', { class: 'icon-group-title' }, title), row);
  });
  const none = h('p', { class: 'muted small', hidden: true }, t('Нічого не знайдено'));
  const filter = (q) => {
    let shown = 0;
    for (const g of groups) {
      const whole = !q || g.dataset.find.includes(q);
      let inGroup = 0;
      for (const b of g.querySelectorAll('.icon-opt')) {
        b.hidden = !(whole || b.dataset.find.includes(q));
        if (!b.hidden) inGroup += 1;
      }
      g.hidden = !inGroup;
      shown += inGroup;
    }
    none.hidden = shown > 0;
  };
  const search = h('input', {
    type: 'search', class: 'icon-search', placeholder: t('Пошук: приціл, аптечка, кейс…'), 'aria-label': t('Пошук значка'), enterkeyhint: 'search',
    oninput: (e) => filter(findKey(e.target.value)),
  });
  return {
    el: h('div', { class: 'icon-groups' }, search, none, groups),
    paint: () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === d.icon))),
    label: () => [gearIcon(d.icon), names.get(d.icon) ?? ''],
  };
}

/** Колір шапки — відтінком: готові веселкою, свій — смугою. Насиченість і яскравість кожна тема бере свої. */
function huePicker(d, onPick) {
  const swatches = GEAR_HUES.map((hue) => h('button', {
    type: 'button', class: 'hue-swatch', style: `--h:${hue}`, 'aria-label': `${hue}°`, onclick: () => { d.hue = hue; onPick(); },
  }));
  const knob = h('span', { class: 'hue-knob' });
  const strip = h('div', { class: 'hue-strip', role: 'slider', tabindex: 0, 'aria-label': t('Свій відтінок'), 'aria-valuemin': 0, 'aria-valuemax': 359 }, knob);
  const set = (v) => { d.hue = Math.round(Math.min(359, Math.max(0, v))); onPick(); };
  // Захоплення вказівника — щоб шторка не гортала сторінку, поки тягнуть смугу
  const fromPointer = (e) => { const r = strip.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 359); };
  strip.addEventListener('pointerdown', (e) => {
    try { strip.setPointerCapture(e.pointerId); } catch { /* вказівник уже відпущено */ }
    fromPointer(e);
  });
  strip.addEventListener('pointermove', (e) => { if (strip.hasPointerCapture?.(e.pointerId)) fromPointer(e); });
  strip.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    set(d.hue + dir * 5);
  });
  return {
    el: h('div', { class: 'hue-picker' }, h('div', { class: 'hue-swatches' }, swatches),
      h('div', { class: 'muted small' }, t('Свій відтінок')), strip),
    paint: () => {
      swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(GEAR_HUES[i] === d.hue)));
      knob.style.left = `${(d.hue / 359) * 100}%`;
      knob.style.setProperty('--h', d.hue);
      strip.setAttribute('aria-valuenow', String(d.hue));
    },
  };
}

/**
 * Одне фото до запису: плитка-прев'ю (тап — фото на весь екран, порожня — вибрати), «З галереї»,
 * «Знайти фото» — Google Картинки за назвою, «Вставити» — скопійоване зображення;
 * на комп'ютері ще Ctrl+V і перетягування. Пишеться разом із формою.
 */
function photoPicker(current, { file: preset = null, query = () => '', onSearch = null } = {}) {
  let file = preset;
  let removed = Boolean(preset);
  let url = null;
  const el = h('div', { class: 'photo-pick' });
  const take = (f) => {
    if (!f?.type?.startsWith('image/')) return false;
    file = f;
    removed = false;
    paint();
    return true;
  };
  const input = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onchange: (e) => { take(e.target.files[0]); e.target.value = ''; },
  });
  const search = () => {
    const q = query();
    if (!q) { toast(t('Спершу впишіть назву')); return; }
    onSearch?.();
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`, '_blank', 'noopener');
  };
  const paste = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((x) => x.startsWith('image/'));
        if (type) { take(new File([await item.getType(type)], 'clip', { type })); return; }
      }
      toast(t('У буфері немає картинки — скопіюйте зображення'));
    } catch {
      toast(t('Браузер не дав прочитати буфер — поділіться картинкою в застосунок або збережіть її в галерею'));
    }
  };
  // Ctrl+V, поки форма відкрита; закрилась — слухач знімає себе сам
  const onPaste = (e) => {
    if (!el.isConnected) { document.removeEventListener('paste', onPaste); return; }
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (f && take(f)) e.preventDefault();
  };
  document.addEventListener('paste', onPaste);
  function paint() {
    if (url) URL.revokeObjectURL(url);
    url = file ? URL.createObjectURL(file) : null;
    const src = url ?? (removed ? null : current?.thumb);
    el.replaceChildren(
      h('button', {
        type: 'button', class: `photo-pick-thumb ${src ? '' : 'empty'}`, 'aria-label': t('Фото'),
        onclick: () => (src ? viewer([file ? { id: 'new', thumb: url, file } : current], 0) : input.click()),
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => { e.preventDefault(); take(e.dataTransfer?.files?.[0]); },
      }, src ? h('img', { src, alt: '' }) : h('span', {}, '+ ', t('Фото'))),
      h('div', { class: 'photo-pick-acts' },
        btn(`🔍 ${t('Знайти фото')}`, search, 'mini'),
        h('div', { class: 'photo-pick-icons' },
          navigator.clipboard?.read ? toolBtn('paste', t('Вставити'), paste) : null,
          toolBtn('gallery', t('З галереї'), () => input.click()),
          src ? toolBtn('delete', t('Прибрати фото'), () => { file = null; removed = true; paint(); }, 'danger') : null)),
      navigator.clipboard?.read ? h('p', { class: 'muted small photo-pick-hint' },
        t('У Google: довгий тап на картинці → «Копіювати зображення» → тут'), ' ', toolIcon('paste')) : null,
      input);
  }
  paint();
  return { el, value: () => ({ file, removed: removed || Boolean(file) }) };
}

// Пошук фото тюнінгу чи екіпірування: перед переходом у Google запам'ятовуємо, куди повернути картинку
const PHOTO_FOR = 'shooters-log:photo-for';

/** Картинка, якою поділились у застосунок: service worker кладе її в кеш, тут — відкрити ту саму форму. */
async function takeSharedImage() {
  const cache = await caches.open('shared-image');
  const res = await cache.match('shared');
  if (!res) return;
  await cache.delete('shared');
  const blob = await res.blob();
  const file = new File([blob], 'shared', { type: blob.type || 'image/jpeg' });
  let target = null;
  try { target = JSON.parse(recall(PHOTO_FOR) || 'null'); } catch { /* зіпсований запис — як немає */ }
  remember(PHOTO_FOR, '');
  const w = target?.weaponId && findWeapon(target.weaponId);
  const sc = w && target.scopeId ? (w.scopes ?? []).find((x) => x.id === target.scopeId) : null;
  if (sc) scopeBuyForm(w, sc, { file });
  else if (w) {
    const m = target.modId ? (w.mods ?? []).find((x) => x.id === target.modId) : null;
    modForm(w, m, { file, preset: m ? null : target.draft });
  } else if (target && 'gearId' in target) {
    const g = target.gearId ? state.gear.find((x) => x.id === target.gearId) ?? null : null;
    gearForm(g, { file, preset: g ? null : target.draft });
  } else {
    toast(t('Відкрийте тюнінг чи екіпірування й натисніть «Знайти фото» — потім поділіться картинкою'));
    return;
  }
  toast(t('Картинку отримано — збережіть'));
}

const modPhoto = (modId) => state.photos.find((p) => p.modId === modId) ?? null;
const scopePhoto = (scopeId) => state.photos.find((p) => p.scopeId === scopeId) ?? null;
const gearPhoto = (gearId) => state.photos.find((p) => p.gearId === gearId) ?? null;
/** Мініатюра в рядку: тап по ній — фото на весь екран, по решті рядка — форма. */
const photoThumb = (p) => (p ? h('img', {
  class: 'row-thumb', src: p.thumb, alt: t('Фото'),
  onclick: (e) => { e.stopPropagation(); viewer([p], 0); },
}) : null);

/**
 * Фото тюнінгу чи екіпірування — owner { modId } або { gearId }, без weaponId, щоб не потрапило в галерею ствола.
 * Нове — записати, старе — у кошик Диска.
 */
async function saveItemPhoto(owner, change) {
  if (!change?.removed) return;
  const old = state.photos.find((p) => Object.entries(owner).every(([k, v]) => p[k] === v)) ?? null;
  if (change.file) {
    try {
      const { blob, thumb, w, h: height } = await preparePhoto(change.file, { studio: true });
      const id = db.uid();
      await db.write({
        photos: { put: [{ id, ...owner, created: Date.now(), thumb, w, h: height, driveId: null }] },
        blobs: { put: [{ id, blob }] },
      });
    } catch (err) {
      toast(err.message);
      return;
    }
  }
  if (old) await removePhotos([old]);
  else await refresh();
}

/** Тюнінг ствола з цим записом: змінений — на своєму місці (порядок «Встановлено»), новий — у кінці. */
function withMod(w, obj) {
  const list = findWeapon(w.id)?.mods ?? [];
  return list.some((x) => x.id === obj.id) ? list.map((x) => (x.id === obj.id ? obj : x)) : [...list, obj];
}

/** Продаж і видалення тюнінгу — спільні для перегляду й форми. */
function modActions(w, m) {
  const others = () => (findWeapon(w.id)?.mods ?? []).filter((x) => x.id !== m.id);
  return {
    onSell: (sale) => saveEntity('weapons', { ...findWeapon(w.id), mods: withMod(w, { ...m, ...sale }) }),
    onRemove: async () => {
      await saveEntity('weapons', { ...findWeapon(w.id), mods: others() });
      const p = modPhoto(m.id);
      if (p) await removePhotos([p]);
    },
  };
}

function modDetail(w, m) {
  const cur = findWeapon(w.id) ?? w;
  const twin = scopeTwin(cur, m);
  const scopes = isSold(m) ? [] : [...(twin ? [twin] : []), ...(cur.scopes ?? []).filter((sc) => sc !== twin)];
  // Приціл, заведений ще й тюнінгом (заради фото й ціни), — одним тапом стає одним записом прицілу
  const merge = scopes.length ? h('div', { class: 'btn-row' }, scopes.map((sc) => btn(
    scopes.length > 1 ? t('Це приціл «{name}»', { name: sc.name }) : t('Це той самий приціл'),
    () => askMerge(w, m, sc), sc === twin ? 'mini primary' : 'mini'))) : null;
  purchaseDetail(m, {
    sub: t('Тюнінг: {name}', { name: w.name }),
    photo: modPhoto(m.id), onEdit: () => modForm(w, m), ...modActions(w, m),
    extra: isSold(m) ? null : h('div', {}, mountSwitch(w, m), merge),
  });
}

/** Підтвердити й злити тюнінг-дубль у приціл. */
function askMerge(w, m, sc) {
  confirmSheet(t('Об’єднати з прицілом?'), t('Фото, ціна, дата й вага перейдуть у приціл «{name}», а тюнінг «{mod}» зникне.', { name: sc.name, mod: m.name }),
    t('Об’єднати'), () => mergeModIntoScope(w, m, sc));
}

/** Назва без «приціл/оптика…», регістру, лапок і різниці «x/×» у кратності — щоб упізнати той самий приціл. */
const scopeKey = (s) => String(s ?? '').toLowerCase()
  .replace(/(\d)\s*[x×х]\s*(\d)/g, '$1x$2')
  .replace(/(^|\s)(приціл|прицел|оптика|оптичний приціл|коліматор|коллиматор|scope)(?=\s|$)/g, ' ')
  .replace(/[«»"″'’“”()]/g, '').replace(/\s+/g, ' ').trim();

/** Приціл цього ствола, який тюнінг m дублює: та сама назва без «приціл/оптика…» (часткового збігу мало — кронштейн «… Aimpoint PRO»). */
function scopeTwin(w, m) {
  if (isSold(m)) return null;
  const mk = scopeKey(m.name);
  if (mk.length < 4) return null;
  return (w.scopes ?? []).find((sc) => {
    const sk = scopeKey(sc.name);
    return sk === mk;
  }) ?? null;
}

/** Підказка над переліком: тюнінг, схожий на приціл, — злити одним тапом (після підтвердження). */
function twinHints(w, done = null) {
  const pairs = (w.mods ?? []).map((m) => [m, scopeTwin(w, m)]).filter(([, sc]) => sc);
  return pairs.map(([m, sc]) => h('div', { class: 'twin-hint' },
    h('span', {}, t('«{mod}» — схоже, це приціл «{name}», заведений ще й тюнінгом.', { mod: m.name, name: sc.name })),
    btn(t('Об’єднати'), () => { done?.(); askMerge(w, m, sc); }, 'mini')));
}

/** Тюнінг-дубль прицілу → у приціл: покупка, вага, характеристики й фото; тюнінг зникає. */
async function mergeModIntoScope(w, m, sc) {
  const cur = findWeapon(w.id);
  const own = scopePhoto(sc.id);
  const p = modPhoto(m.id);
  const keep = (a, b) => (a === undefined || a === null || a === '' ? b : a);
  await saveEntity('weapons', {
    ...cur,
    mods: (cur.mods ?? []).filter((x) => x.id !== m.id),
    scopes: (cur.scopes ?? []).map((x) => (x.id !== sc.id ? x : {
      ...x, price: keep(m.price, x.price), date: keep(m.date, x.date), usdRate: keep(m.usdRate, x.usdRate), place: keep(m.place, x.place),
      weight: m.weight > 0 ? m.weight : x.weight, specs: keep(x.specs, m.specs), note: keep(x.note, m.note),
    })),
  });
  if (p && !own) {
    const { modId, ...rest } = p;
    await db.write({ photos: { put: [{ ...rest, scopeId: sc.id }] } });
    await refresh();
  } else if (p) await removePhotos([p]);
  toast(t('Об’єднано з прицілом «{name}»', { name: sc.name }));
}

/** Покупка прицілу: ціна, дата, де, вага, характеристики й фото — як у тюнінгу; нуль і клік — у формі зброї. */
function scopeBuyForm(w, sc, { file = null } = {}) {
  purchaseForm(t('Приціл: {name}', { name: sc.name }), sc, {
    placeholder: t('Назва прицілу'),
    photo: { current: scopePhoto(sc.id), file },
    // Пішли шукати картинку й поділились нею — відкриється ця сама форма прицілу
    onSearch: () => remember(PHOTO_FOR, JSON.stringify({ weaponId: w.id, scopeId: sc.id })),
    onSave: async (obj, photo) => {
      const cur = findWeapon(w.id);
      await saveEntity('weapons', { ...cur, scopes: (cur.scopes ?? []).map((x) => (x.id === obj.id ? { ...x, ...obj } : x)) });
      await saveItemPhoto({ scopeId: obj.id }, photo);
    },
  });
}

/** Перегляд прицілу як покупки; продаж і видалення прицілу — у формі зброї, тут їх нема. */
function scopeDetail(w, sc) {
  purchaseDetail(sc, {
    sub: t('Приціл: {name}', { name: w.name }),
    photo: scopePhoto(sc.id), onEdit: () => scopeBuyForm(w, findWeapon(w.id)?.scopes?.find((x) => x.id === sc.id) ?? sc),
    extra: mountSwitch(w, sc, true, true),
  });
}

/** Тюнінг живе в записі ствола, як і приціли; його фото — у сховищі фото з modId. */
function modForm(w, m = null, { file = null, preset = null } = {}) {
  purchaseForm(m ? t('Змінити тюнінг') : t('Тюнінг: {name}', { name: w.name }), m, {
    placeholder: t('Ліхтар, руків’я, ДТК, приклад, ремінь…'),
    mounted: true,
    photo: { current: m ? modPhoto(m.id) : null, file },
    preset,
    // Незбережений тюнінг — чернеткою: поки шукали картинку, застосунок могли закрити
    onSearch: (values) => remember(PHOTO_FOR, JSON.stringify({ weaponId: w.id, modId: m?.id ?? null, draft: m ? null : values })),
    onSave: async (obj, photo) => {
      await saveEntity('weapons', { ...findWeapon(w.id), mods: withMod(w, obj) });
      await saveItemPhoto({ modId: obj.id }, photo);
    },
    ...(m ? modActions(w, m) : {}),
  });
}

/** Проданий ствол іде в архів (історія стрільб лишається); «Не продано» повертає його. */
function sellWeapon(w) {
  sellForm(w, (sale) => saveEntity('weapons', { ...findWeapon(w.id), ...sale, archived: Boolean(sale.soldDate) }));
}

/** У скільки обійшовся ствол: покупка й увесь тюнінг. */
const weaponInvested = (w) => priceOf(w.buyPrice) + tuneItems(w).reduce((s, m) => s + priceOf(m.price), 0);

/** Підсумок «Покупки й тюнінгу»: скільки вкладено й смуга — яка частка пішла на ствол, яка на тюнінг. */
function investSummary(w, total) {
  const gun = priceOf(w.buyPrice);
  const tune = total - gun;
  const part = (cls, v) => (v > 0 ? h('span', { class: `invest-part ${cls}`, style: `flex-grow:${v}` }) : null);
  const legend = (cls, label, v) => (v > 0 ? h('span', { class: `invest-key ${cls}` }, label, ' ', h('b', {}, fmt.num(Math.round(v)))) : null);
  return h('div', { class: 'invest' },
    h('div', { class: 'invest-total' }, tileMoney(total, usdSum(investRows(w), true)), h('span', { class: 'muted small' }, t('вкладено в ствол'))),
    gun > 0 && tune > 0 ? h('div', { class: 'invest-bar' }, part('gun', gun), part('tune', tune)) : null,
    gun > 0 && tune > 0 ? h('div', { class: 'invest-legend small' }, legend('gun', t('ствол'), gun), legend('tune', t('тюнінг'), tune)) : null);
}

/** «Покупка і тюнінг» у картці ствола: за скільки купив, що доставив, разом. */
function buyBox(w, close) {
  const mods = tuneItems(w).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const total = weaponInvested(w);
  const bought = w.buyPrice || w.buyDate || w.buyPlace;
  const modRow = (m) => {
    const scope = isScopeOf(w, m);
    const p = scope ? scopePhoto(m.id) : modPhoto(m.id);
    const sub = isSold(m) ? t('продано {date}', { date: fmt.date(m.soldDate) })
      : [scope ? t('приціл') : null, placeLine(m.date, m.place) || (scope ? null : m.note)].filter(Boolean).join(' · ');
    return priceRow(m.name, sub, m.price, () => tuneDetail(w, m), photoThumb(p), modDay(w, m), m.usdRate, isSold(m) ? 'tune sold' : 'tune');
  };
  const el = box(t('Покупка й тюнінг'), [
    total ? investSummary(w, total) : null,
    h('div', { class: 'rows invest-rows' },
      bought ? priceRow(t('Покупка'), placeLine(w.buyDate, w.buyPlace), w.buyPrice, () => { close(); weaponForm(w); }, null, gunDay(w), w.usdRate, 'gun') : null,
      mods.map(modRow),
      isSold(w) ? priceRow(t('Продаж'), placeLine(w.soldDate, w.soldPlace), w.soldPrice, () => sellWeapon(w), null, w.soldDate, w.soldUsdRate) : null),
    shopLinks(w.links),
    h('div', { class: 'btn-row' },
      btn(t('+ тюнінг'), () => modForm(w), 'mini'),
      isSold(w) ? null : btn(t('Продати ствол'), () => sellWeapon(w), 'mini quiet')),
  ], { fold: `gun-buy:${w.id}`, count: mods.length, summary: total ? h('span', { class: 'box-sum' }, grn(total)) : null });
  el.dataset.buy = '';
  return el;
}

function renderWeapons() {
  const active = state.weapons.filter((w) => !w.archived);
  // Повернутий з архіву ствол уже не проданий.
  const archived = archiveBlock(state.weapons.filter((w) => w.archived),
    (w) => saveEntity('weapons', { ...w, archived: false, soldPrice: null, soldDate: null, soldPlace: null }));
  if (!active.length) return h('div', {}, empty(t('Зброю не додано'), t('Додайте ствол: калібр, настріл до початку обліку, ресурс ствола й інтервал чистки.'), [addBtn(), importBtn(), btn(t('Демодані'), loadDemo)]), archived);
  // Загальний настріл зі званням — лише тут; розбивка: свої стволи, чужа зброя, без ствола, до початку обліку.
  const shots = M.totalShots(state);
  const split = [
    [fmt.num(active.length), t('стволів')],
    shots.foreign || shots.noGun ? [fmt.num(shots.own), t('зі своїх стволів')] : null,
    shots.foreign ? [fmt.num(shots.foreign), t('з чужої зброї')] : null,
    shots.noGun ? [fmt.num(shots.noGun), t('без ствола')] : null,
    shots.initial ? [fmt.num(shots.initial), t('до початку обліку — з карток стволів')] : null,
  ].filter(Boolean);
  $('subtitle').textContent = swipeTip('guns', t('Свайп ← записати стрільбу, → чистка'), t('стволів: {n}', { n: active.length }));
  return h('div', {},
    shotsHero(shots.total, split),
    urgentPermitsBlock(),
    active.sort(byName).map(weaponCard),
    archived);
}

/** Дульні звуження гладкого ствола: позначення й звужувальна вставка. */
const CHOKES = [['cyl', 'Циліндр'], ['ic', 'Получок 1/4'], ['mod', 'Получок 1/2'],
  ['im', 'Чок 3/4'], ['full', 'Повний чок'], ['xf', 'Посилений чок'], ['var', 'Змінний']];

/**
 * Упор і положення — від них залежить купчастість, тож пишемо в мішень і результат вправи.
 * До 0.7.101 був лише прапорець «сошки» (bipod) — у старих записах читаємо його як «сошки».
 */
const RESTS = [['bipod', 'Сошки'], ['bag', 'Мішок / упор'], ['prone', 'Лежачи з руки'], ['knee', 'З коліна'], ['stand', 'Стоячи']];
const { restOf } = M;
const restLabel = (key) => t(RESTS.find(([k]) => k === key)?.[1] ?? '');

/** Чипи «Упор»: один вибір, повторний тап знімає. value — ключ або null, set(v) — поставити інше. */
function restChips() {
  const row = h('div', { class: 'chips chips-sm' });
  const buttons = RESTS.map(([key, label]) => h('button', {
    type: 'button', 'data-key': key, onclick: () => row.set(row.value === key ? null : key),
  }, t(label)));
  row.set = (v) => {
    row.value = v ?? null;
    buttons.forEach((b) => {
      const on = b.dataset.key === row.value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  row.append(...buttons);
  row.set(null);
  return row;
}

/** Дульне звуження — лише гладкому стволу; уже записане не ховаємо, щоб його можна було прибрати. */
function chokeField(w, caliber) {
  const choke = h('select', {},
    [['', t('— немає —')], ...CHOKES].map(([k, label]) => h('option', { value: k, selected: k === (w?.choke ?? '') }, k ? t(label) : label)));
  const el = h('label', { class: 'field wide choke-field' }, h('span', { class: 'field-label' }, t('Дульне звуження')), choke);
  listPicker(choke, { title: t('Дульне звуження'), item: () => null });
  const fit = () => { el.hidden = !M.barrelLifeFor(caliber.value)?.smooth && !choke.value; };
  caliber.addEventListener('input', fit);
  fit();
  return { el, values: () => ({ choke: choke.value || null }) };
}

/** Звуження для картки й плитки: «чок 1/2» або порожньо. Що стоїть на стволі — у «Встановлено». */
function chokeText(w) {
  return w?.choke ? t(CHOKES.find(([k]) => k === w.choke)?.[1] ?? '') : '';
}

/** «глушник · сошки» мішені, вправи чи старої стрільби — лише те, що було. */
function gearText(x) {
  const rest = restOf(x);
  return [x?.suppressor ? t('глушник') : null, rest ? restLabel(rest).toLowerCase() : null].filter(Boolean).join(' · ');
}

/** Глушник і упор останньої мішені чи вправи з цим стволом; ще не було — старе «Оснащення» ствола (до 0.7.101). */
function lastGear(w) {
  if (!w) return { suppressor: false, rest: null };
  const prev = [...state.targets, ...state.scores].filter((x) => x.weaponId === w.id && ('suppressor' in x || 'rest' in x)).sort(M.byDateDesc)[0];
  const src = prev ?? w;
  return { suppressor: !!src.suppressor, rest: restOf(src) };
}

/**
 * Глушник і упор саме цієї мішені чи вправи: за замовчуванням — як минулого разу з цим стволом, preset — уже записане.
 * Без свого ствола поля сховані й нічого не пишуть.
 */
function gearFields(currentGun, preset = null) {
  const sup = h('input', { type: 'checkbox', role: 'switch' });
  const supField = h('div', { class: 'field wide' }, switchLabel(sup, t('З глушником')));
  const rest = restChips();
  const restField = h('div', { class: 'field wide' }, h('span', { class: 'field-label' }, t('Упор')), rest);
  const set = (v) => {
    supField.hidden = restField.hidden = !currentGun();
    sup.checked = !!v.suppressor;
    rest.set(v.rest);
  };
  set(preset ? { suppressor: !!preset.suppressor, rest: restOf(preset) } : lastGear(currentGun()));
  return {
    fields: [supField, restField],
    // Інший ствол — як минулого разу з ним
    reset: () => set(lastGear(currentGun())),
    // bipod — старий прапорець; тепер упор пише rest
    values: () => (currentGun() ? { suppressor: sup.checked, rest: rest.value, bipod: undefined } : {}),
  };
}

/** Приціл, глушник і упор під вибраним стволом (select) — для результату вправи; prev — уже записане. */
function weaponExtras(select, prev = null) {
  const gun = () => findWeapon(select.value) ?? null;
  const same = prev && prev.weaponId === select.value;
  const scope = h('select', { 'aria-label': t('Приціл') });
  const scopeField = h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, t('Приціл')), scope);
  const paint = scopePicker(scope, gun);
  const fill = (id) => {
    const w = gun();
    scope.replaceChildren(...selectOptions(scopeOptions(w), id).filter(Boolean));
    scopeField.hidden = !w?.scopes?.length;
    paint();
  };
  fill(same && 'scopeId' in prev ? prev.scopeId ?? '' : M.defaultScope(gun())?.id ?? '');
  const gear = gearFields(gun, same && ('suppressor' in prev || 'rest' in prev) ? prev : null);
  select.addEventListener('change', () => { fill(M.defaultScope(gun())?.id ?? ''); gear.reset(); });
  return {
    fields: [scopeField, ...gear.fields],
    values: () => ({ scopeId: gun()?.scopes?.some((s) => s.id === scope.value) ? scope.value : null, ...gear.values() }),
  };
}

/**
 * Розділ форми в рамці з назвою на лінії, що згортається: у згорнутій назві — коротко, що заповнено (summary()),
 * або «не заполнено». Стан не запам'ятовується — форма щоразу відкривається компактно; поле з помилкою
 * розгорне розділ саме (fieldError). open — розгорнутий одразу.
 */
function formBox(title, content, summary = null, { tools = null, open = false } = {}) {
  const el = h('fieldset', { class: `box foldable form-box ${open ? '' : 'closed'}` });
  const sum = h('span', { class: 'box-sum' });
  const toggle = h('button', {
    type: 'button', class: 'box-toggle', 'aria-expanded': String(open),
    onclick: () => toggle.setAttribute('aria-expanded', String(el.classList.toggle('closed') === false)),
  }, h('span', { class: 'box-chevron', 'aria-hidden': 'true' }, '›'), title, sum);
  const paint = () => {
    const s = summary?.() || '';
    sum.textContent = s || t('не заповнено');
    sum.classList.toggle('none', !s);
  };
  el.append(h('legend', {}, toggle, tools), h('div', { class: 'box-body' }, content));
  for (const type of ['input', 'change']) el.addEventListener(type, paint);
  // Чіпи й перемикачі міняють значення кліком, без input
  el.addEventListener('click', () => queueMicrotask(paint));
  paint();
  return el;
}

/** Поля форми в окремий блок-сітку — щоб розкласти одну form() по розділах, не міняючи збереження. */
const formPart = (f, names, ...extra) => h('div', { class: 'form' }, ...names.map((n) => f.inputs[n]?.closest('.field')).filter(Boolean), ...extra);

function weaponForm(w = null, back = null) {
  const f = form([
    { name: 'name', label: t('Назва'), required: true, value: w?.name, placeholder: 'AR-15 16"', half: true },
    { name: 'caliber', label: t('Калібр'), required: true, value: w?.caliber, list: 'cal-list', half: true },
    { name: 'serial', label: t('Серійний номер'), value: w?.serial, wide: true },
    { name: 'note', label: t('Примітка'), value: w?.note, wide: true },
    { name: 'initialShots', label: t('Настріл до початку обліку'), type: 'number', step: 1, min: 0, value: w?.initialShots ?? 0, half: true },
    { name: 'barrelLife', label: t('Ресурс ствола, пострілів'), type: 'number', step: 1, min: 0, value: w?.barrelLife, half: true },
    { name: 'buyPrice', label: t('Ціна покупки, грн'), type: 'number', step: 'any', min: 0, value: w?.buyPrice, half: true },
    { name: 'buyDate', label: t('Дата покупки'), type: 'date', value: w?.buyDate, half: true },
    rateField('usdRate', w?.usdRate),
    { name: 'buyPlace', label: t('Де куплено'), value: w?.buyPlace, placeholder: t('Магазин, сайт, з рук…'), wide: true },
    linksField(w?.links),
  ].filter(Boolean));
  rateHint(f, 'usdRate', 'buyDate');
  // Розділи: основне й приціли — завжди відкриті, решта згорнута з коротким підсумком у назві
  const life = formPart(f, ['initialShots', 'barrelLife']);
  const buy = formPart(f, ['buyPrice', 'buyDate', 'usdRate', 'buyPlace', 'links']);
  barrelHint(f);
  const remind = cleanReminderBox(w);
  const choke = chokeField(w, f.inputs.caliber);
  // Звуження — у «Основне»: це властивість гладкого ствола, а не навіска
  const main = formPart(f, ['name', 'caliber', 'serial'], choke.el, f.inputs.note.closest('.field'), caliberList());
  const permit = permitFields(w);
  const size = sizeFields(w);
  const scopesBox = h('div', { class: 'items' });
  const num = (el) => Number(String(el?.value ?? '').replace(',', '.')) || 0;
  const addScope = (s = {}) => {
    const name = h('input', { type: 'text', placeholder: 'Vortex Diamondback 4-12x40', autocomplete: 'off', class: 'sc-name' });
    name.value = s.name ?? '';
    const kind = h('select', { class: 'sc-kind' },
      Object.entries(SCOPE_KINDS).map(([k, label]) => h('option', { value: k, selected: k === (s.kind ?? 'optic') }, t(label))));
    const zero = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: '100', class: 'sc-zero' });
    zero.value = s.zero ?? '';
    const sh = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: '6', class: 'sc-sh' });
    sh.value = s.sh ?? '';
    const wt = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: '600', class: 'sc-w' });
    wt.value = s.weight ?? '';
    // ціна клацання прицілу — підставляється в мішень, коли вибрали цей приціл; нестандартна — «Своє значення»
    const own = s.click && !CLICKS.some(([k]) => k === s.click) ? CLICK_KEY.exec(s.click) : null;
    const click = h('select', { class: 'sc-click' },
      [['', t('— не вказано —')], ...CLICKS, [OWN_CLICK, 'Своє значення…']]
        .map(([k, label]) => h('option', { value: k, selected: k === (own ? OWN_CLICK : s.click ?? '') }, k ? t(label) : label)));
    const ownValue = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: '0,1', class: 'sc-own-value', 'aria-label': t('Ціна кліку') });
    ownValue.value = own ? Number(own[2]) : '';
    const ownUnit = h('select', { class: 'sc-own-unit', 'aria-label': t('Одиниця') },
      [['mil', 'MRAD'], ['moa', 'MOA'], ['mm', t('мм / 100 м')]].map(([k, label]) => h('option', { value: k, selected: k === (own?.[1] ?? 'mil') }, label)));
    const ownBox = h('div', { class: 'field wide sc-own', hidden: !own }, h('span', { class: 'field-label' }, t('Своя ціна кліку')), ownValue, ownUnit);
    click.addEventListener('change', () => {
      ownBox.hidden = click.value !== OWN_CLICK;
      if (!ownBox.hidden) ownValue.focus();
    });
    const reticle = h('select', { class: 'sc-ret' },
      [['', t('— не вказано —')], ...RETICLES].map(([k, label]) => h('option', { value: k, selected: k === (s.reticle ?? '') }, k ? t(label) : label)));
    const note = h('input', { type: 'text', placeholder: t('Кронштейн, серійний №…'), autocomplete: 'off', class: 'sc-note' });
    note.value = s.note ?? '';
    // «За замовчуванням» — лише один прицел на ствол: позначили цей — з інших знімаємо.
    const def = h('input', {
      type: 'checkbox', checked: !!s.default,
      onchange: () => {
        if (!def.checked) return;
        scopesBox.querySelectorAll('.sc-def input').forEach((x) => { if (x !== def && x.checked) { x.checked = false; x.dispatchEvent(new Event('change', { bubbles: true })); } });
      },
    });
    const field = (label, input, cls = 'half') => h('label', { class: `field ${cls}` }, h('span', { class: 'field-label' }, label), input);
    // Згорнутий приціл — одним рядком: назва, під нею тип · нуль · клік · вага; тап — поля з підписами
    const title = h('span', { class: 'sc-title' });
    const sub = h('small', { class: 'sc-sub' });
    const head = h('button', { type: 'button', class: 'sc-toggle', 'aria-expanded': 'false', onclick: () => setOpen(!row.classList.contains('open')) },
      h('span', { class: 'box-chevron', 'aria-hidden': 'true' }, '›'), h('span', { class: 'sc-text' }, title, sub));
    const row = h('div', { class: 'scope-row', dataset: { id: s.id ?? db.uid() } },
      h('div', { class: 'sc-head' }, head,
        h('button', { type: 'button', class: 'icon-btn sc-del', 'aria-label': t('Прибрати приціл'), onclick: () => row.remove() }, '✕')),
      h('div', { class: 'sc-body form' },
        field(t('Модель'), name, 'wide'),
        field(t('Тип'), kind), field(t('Сітка'), reticle),
        field(t('Пристрілка, м'), zero), field(t('Над стволом, см'), sh),
        field(t('Ціна кліку'), click), field(t('Вага з кільцями, г'), wt),
        ownBox,
        field(t('Примітка'), note, 'wide'),
        h('label', { class: 'sc-def small' }, def, t('Використовувати за замовчуванням під час запису стрільби'))));
    const setOpen = (open) => { row.classList.toggle('open', open); head.setAttribute('aria-expanded', String(open)); };
    const paint = () => {
      title.textContent = (def.checked ? '◉ ' : '') + (name.value.trim() || t('Новий приціл'));
      const ck = click.value === OWN_CLICK ? ownClickKey(ownValue.value, ownUnit.value) : click.value;
      sub.textContent = [t(SCOPE_KINDS[kind.value] ?? ''), num(zero) ? t('нуль {z} м', { z: fmt.num(num(zero)) }) : null,
        ck ? clickLabel(ck) : null, num(wt) ? grams(num(wt)) : null].filter(Boolean).join(' · ');
    };
    for (const type of ['input', 'change']) row.addEventListener(type, paint);
    row.addEventListener('click', () => queueMicrotask(paint));
    listPicker(kind, { title: t('Тип прицілу'), item: () => null, cls: 'sc-kind' });
    listPicker(reticle, { title: t('Сітка'), item: () => null, cls: 'sc-ret' });
    listPicker(click, { title: t('Ціна кліку прицілу'), item: () => null, cls: 'sc-click' });
    chipPicker(ownUnit);
    scopesBox.append(row);
    paint();
    // Новий приціл — одразу розгорнутий
    setOpen(!s.name);
    return { name };
  };
  (w?.scopes ?? []).forEach(addScope);
  const sizeSum = () => {
    const v = size.values().size;
    if (!v) return '';
    return [v.length ? `${fmt.num(v.length)} ${t('см')}` : null, v.weight ? grams(v.weight) : null].filter(Boolean).join(' · ') || t('заповнено');
  };
  const remindSum = () => {
    const v = remind.values();
    return v.cleanEvery ? t('кожні {n} {w}', { n: fmt.num(v.cleanEvery), w: v.cleanUnit === 'sessions' ? t('стрільб') : t('пострілів') }) : t('після кожної стрільби');
  };
  const permitSum = () => {
    const p = permit.values().permit;
    return p ? [p.number, p.expires ? t('до {d}', { d: fmt.date(p.expires) }) : null].filter(Boolean).join(' · ') : '';
  };
  const lifeSum = () => [num(f.inputs.barrelLife) ? t('ресурс {n}', { n: fmt.num(num(f.inputs.barrelLife)) }) : null,
    num(f.inputs.initialShots) ? t('настріл {n}', { n: fmt.num(num(f.inputs.initialShots)) }) : null].filter(Boolean).join(' · ');
  const buySum = () => [num(f.inputs.buyPrice) ? `${fmt.num(num(f.inputs.buyPrice))} ${t('грн')}` : null,
    f.inputs.buyDate.value ? fmt.date(f.inputs.buyDate.value) : null, f.inputs.buyPlace.value.trim() || null].filter(Boolean).join(' · ');
  const close = sheet(w ? t('Змінити зброю') : t('Нова зброя'), h('div', { class: 'weapon-form' },
    box(t('Основне'), main),
    box(t('Приціли'), [scopesBox, btn(t('+ приціл'), () => addScope().name.focus(), 'mini')]),
    formBox(t('Облік ствола'), life, lifeSum),
    formBox(t('Покупка'), buy, buySum),
    formBox(t('Габарити й вага'), size.el, sizeSum),
    formBox(t('Нагадування про чистку'), remind.el, remindSum),
    formBox(t('Дозвіл на зброю'), permit.el, permitSum, { tools: permit.tools })), {
    onClose: back,
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f) || size.invalid() || permit.invalid()) return;
    // «Своє значення» без числа інакше тихо стерло б ціну клацання
    const noOwn = [...scopesBox.querySelectorAll('.scope-row')].find((row) => row.querySelector('.sc-click').value === OWN_CLICK
      && row.querySelector('.sc-name').value.trim() && !ownClickKey(row.querySelector('.sc-own-value').value, 'mil'));
    if (noOwn) {
      noOwn.classList.add('open');
      fieldError(noOwn.querySelector('.sc-own-value'), t('Вкажіть ціну кліку'));
      noOwn.querySelector('.sc-own-value').focus();
      return;
    }
    const v = f.values();
    const scopes = [...scopesBox.querySelectorAll('.scope-row')].map((row) => {
      const zero = Number(String(row.querySelector('.sc-zero').value).replace(',', '.'));
      const sh = Number(String(row.querySelector('.sc-sh').value).replace(',', '.'));
      const wt = Number(String(row.querySelector('.sc-w').value).replace(',', '.'));
      const click = row.querySelector('.sc-click').value;
      // Поля, яких у формі нема (пристрілка майстра, «стоїть на стволі»), лишаються; змінили нуль — стара пристрілка вже не про нього
      const old = (w?.scopes ?? []).find((x) => x.id === row.dataset.id) ?? {};
      const kept = (old.zero ?? null) === (zero > 0 ? zero : null) ? old : { ...old, zeroDate: undefined, zeroAmmo: undefined, zeroSuppressor: undefined };
      return {
        ...kept,
        id: row.dataset.id,
        name: row.querySelector('.sc-name').value.trim(),
        kind: row.querySelector('.sc-kind').value,
        zero: zero > 0 ? zero : null,
        sh: sh > 0 ? sh : null,
        weight: wt > 0 ? wt : null,
        click: click === OWN_CLICK ? ownClickKey(row.querySelector('.sc-own-value').value, row.querySelector('.sc-own-unit').value) : click || null,
        reticle: row.querySelector('.sc-ret').value || null,
        note: row.querySelector('.sc-note').value.trim(),
        default: row.querySelector('.sc-def input').checked,
      };
    }).filter((s) => s.name);
    close();
    await saveEntity('weapons', { ...(w ?? { id: db.uid(), created: Date.now() }), ...v, ...remind.values(), ...choke.values(), ...size.values(), ...permit.values(), initialShots: v.initialShots ?? 0, scopes });
  }
}

/** Блок «Нагадування про чистку» у формі зброї: інтервал, відстрочка й пояснення, що з цього вийде. */
function cleanReminderBox(w) {
  const numInput = (value) => {
    const el = h('input', { type: 'number', inputmode: 'numeric', step: 1, min: 0, placeholder: '—', class: 'remind-num' });
    el.value = value ?? '';
    return el;
  };
  const num = (el) => (el.value === '' ? null : Math.max(0, Math.round(Number(String(el.value).replace(',', '.')))) || null);
  const every = numInput(w?.cleanEvery);
  const delay = numInput(w?.cleanDelay);
  const unit = chips([['shots', t('пострілів')], ['sessions', t('стрільб')]], w?.cleanUnit === 'sessions' ? 'sessions' : 'shots', () => explain());
  const summary = h('p', { class: 'remind-sum small' });
  const explain = () => {
    const n = num(every);
    const d = num(delay);
    const forms = unit.value === 'sessions' ? [t('стрільба'), t('стрільби'), t('стрільб')] : [t('постріл'), t('постріли'), t('пострілів')];
    const when = n ? t('Нагадаю, коли після чистки набереться {n} {w}', { n: fmt.num(n), w: plural(n, forms) }) : t('Нагадаю після кожної стрільби');
    const wait = d ? t('не одразу, а через {n} {w}, якщо ствол так і не почистили', { n: fmt.num(d), w: plural(d, [t('день'), t('дні'), t('днів')]) }) : null;
    const session = n && unit.value === 'sessions' ? t('Стрільба — день, коли зі ствола стріляли.') : null;
    summary.replaceChildren(`${[when, wait].filter(Boolean).join(' — ')}.`, session ? ` ${session}` : '');
  };
  every.addEventListener('input', explain);
  delay.addEventListener('input', explain);
  explain();
  const el = h('div', { class: 'remind' },
    h('div', { class: 'remind-field' }, h('span', { class: 'field-label' }, t('Нагадувати кожні')), h('div', { class: 'remind-row' }, every, unit)),
    h('div', { class: 'remind-field' }, h('span', { class: 'field-label' }, t('Якщо ствол не почищено, нагадати через')), h('div', { class: 'remind-row' }, delay, h('span', { class: 'muted' }, t('дн.')))),
    summary);
  return { el, values: () => ({ cleanEvery: num(every), cleanUnit: unit.value === 'sessions' ? 'sessions' : 'shots', cleanDelay: num(delay) }) };
}

async function addPhotos(weaponId, files) {
  if (!files.length) return;
  toast(t('Обробка фото…'));
  let added = 0;
  for (const file of files) {
    try {
      const { blob, thumb, w, h: height } = await preparePhoto(file, { studio: true });
      const id = db.uid();
      await db.write({
        photos: { put: [{ id, weaponId, created: Date.now(), thumb, w, h: height, driveId: null }] },
        blobs: { put: [{ id, blob }] },
      });
      added += 1;
    } catch (err) {
      toast(err.message);
    }
  }
  await refresh();
  if (added) confirmed();
}

/**
 * «+ Фото» в картці: одне звичайне фото — вибір «як є» чи «✨ Студія» із залишком на місяць.
 * Кілька фото чи PNG без фону — одразу як є (студію можна зробити потім у перегляді).
 */
const STUDIO_EXAMPLE = './demo/zion-z15.jpg';

async function addWeaponPhotos(weaponId, files) {
  if (files.length !== 1) { addPhotos(weaponId, files); return; }
  const [file] = files;
  const bmp = await decode(file).catch(() => null);
  const cut = bmp ? isCutout(bmp) : true;
  bmp?.close?.();
  if (cut) { addPhotos(weaponId, files); return; }
  // Кожен варіант показує, що вийде: «як є» — саме це фото, студія — приклад із демо
  const own = URL.createObjectURL(file);
  const pic = (src, tag = null) => h('span', { class: 'photo-src-pic', 'aria-hidden': 'true' },
    h('img', { src, alt: '', onerror: (e) => { e.target.hidden = true; } }), tag ? h('span', { class: 'photo-src-tag' }, tag) : null);
  const left = h('small', {}, t('Перевіряю ліміт…'));
  const studioBtn = h('button', {
    type: 'button', class: 'photo-src main',
    onclick: async () => {
      close();
      const canvas = await studioPhoto(file, {
        // Сервер не вирізав — фото не губиться, зберігаємо як є
        onError: (err) => { toast(`${err.message}. ${t('Фото збережено як є')}`); addPhotos(weaponId, files); },
      });
      if (canvas) await saveStudioPhoto(weaponId, canvas);
    },
  }, pic(STUDIO_EXAMPLE, t('приклад')), h('b', {}, t('Студійне фото')), left);
  const close = sheet(t('Додати фото'), h('div', {},
    h('div', { class: 'photo-srcs' },
      h('button', { type: 'button', class: 'photo-src', onclick: () => { close(); addPhotos(weaponId, files); } },
        pic(own), h('b', {}, t('Як є')), h('small', {}, t('Без змін'))),
      studioBtn),
    h('p', { class: 'muted small' }, t('Студія вирізає зброю з фону на сервері й кладе на студійне тло. Оригінал не зберігається — лише студійне фото.'))),
  { onClose: () => URL.revokeObjectURL(own) });
  const quota = await studioQuota();
  if (!quota) { left.textContent = navigator.onLine ? '' : t('Потрібен інтернет'); return; }
  left.textContent = quotaText(quota.month);
  if (quota.month.left < 1 || quota.day.left < 1) {
    studioBtn.disabled = true;
    if (quota.month.left > 0) left.textContent = t('Сьогодні ліміт вичерпано');
  }
}

async function removePhotos(list) {
  if (!list.length) return;
  const ids = list.map((p) => p.id);
  // driveId беремо зі сховища: у state він може ще не встигнути з'явитися після вивантаження
  const driveIds = await Promise.all(ids.map(async (id) => (await db.get('photos', id))?.driveId));
  await db.write({ photos: { del: ids }, blobs: { del: ids } });
  // У кошик Диска — лише після запису: не записалось — файл на Диску ще потрібен
  driveIds.forEach((driveId) => sync.trashPhoto(driveId));
  await refresh();
}

/**
 * Відредаговане фото зберігається як нове (новий id): так інші пристрої докачають новий файл,
 * а старий піде в кошик Диска. Якщо воно було головним — головним стає нове.
 */
async function editWeaponPhoto(p) {
  const blob = await db.getBlob(p.id);
  if (!blob) { toast(t('Повне фото ще не завантажилося — змінити можна після синхронізації')); return null; }
  let result;
  try {
    result = await editPhoto(blob);
  } catch (err) {
    toast(err.message);
    return null;
  }
  if (!result) return null;
  const id = db.uid();
  const fresh = { ...p, id, thumb: result.thumb, w: result.w, h: result.h, driveId: null };
  const oldDrive = (await db.get('photos', p.id))?.driveId;
  const w = findWeapon(p.weaponId);
  await db.write({
    photos: { put: [fresh], del: [p.id] },
    blobs: { put: [{ id, blob: result.blob }], del: [p.id] },
    ...(w?.coverId === p.id ? { weapons: { put: [{ ...w, coverId: id }] } } : {}),
  });
  sync.trashPhoto(oldDrive);
  await refresh();
  confirmed();
  return fresh;
}

/** Студійне фото — нове фото ствола поруч з оригіналом, одразу головне. */
async function studioWeaponPhoto(p) {
  const blob = await db.getBlob(p.id);
  if (!blob) { toast(t('Повне фото ще не завантажилося — змінити можна після синхронізації')); return null; }
  const canvas = await studioPhoto(blob, { onError: (err) => toast(err.message) });
  return canvas ? saveStudioPhoto(p.weaponId, canvas) : null;
}

/** Студійне фото ствола зберігається новим записом і стає головним. */
async function saveStudioPhoto(weaponId, canvas) {
  const result = await pack(canvas);
  const id = db.uid();
  const fresh = { id, weaponId, created: Date.now(), thumb: result.thumb, w: result.w, h: result.h, driveId: null };
  const w = findWeapon(weaponId);
  await db.write({
    photos: { put: [fresh] },
    blobs: { put: [{ id, blob: result.blob }] },
    ...(w ? { weapons: { put: [{ ...w, coverId: id }] } } : {}),
  });
  await refresh();
  confirmed();
  return fresh;
}

function weaponDetail(w) {
  const body = () => { const cur = findWeapon(w.id); return cur ? weaponBody(cur, () => close()) : null; };
  // Форма замість картки, а закрили її (зберегли чи скасували) — знову картка цього ствола, а не список
  const back = () => { const cur = findWeapon(w.id); if (cur) weaponDetail(cur); };
  const tools = [toolBtn('report', t('Звіт'), () => reportSheet(findWeapon(w.id) ?? w)),
    ...cardTools(() => { close(); weaponForm(findWeapon(w.id) ?? w, back); }, weaponInUse(w),
      () => { close(); removeWeapon(findWeapon(w.id) ?? w); })];
  // Головні дії — внизу шторки, завжди на виду: до них не треба гортати історію стрільб
  const actions = [btn(t('Почищено'), () => { close(); cleanSheet(findWeapon(w.id) ?? w, back); }),
    btn(t('Записати стрільбу'), () => { close(); shootSheet({ weapon: findWeapon(w.id) ?? w, back }); }, 'primary')];
  const close = sheet(w.name, body(), { live: body, tools, full: true, actions });
}

const REPORT_PERIODS = [['all', 'За весь час'], ['year', 'Цей рік'], ['last', 'Минулий рік'], ['12m', 'Останні 12 місяців']];

/** Межі періоду звіту [від, до] включно; null — без межі. */
function reportRange(period) {
  const today = M.today();
  const y = Number(today.slice(0, 4));
  if (period === 'year') return [`${y}-01-01`, today];
  if (period === 'last') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (period === '12m') return [M.addDays(today, -365), today];
  return [null, null];
}

/** Звіт по стволу: перегляд у шторці, а PDF — з вікна друку браузера («Зберегти як PDF»). */
function reportSheet(w) {
  let period = REPORT_PERIODS.some(([k]) => k === recall('shooters-log:report-period')) ? recall('shooters-log:report-period') : 'all';
  const preview = h('div', { class: 'report-preview' });
  const draw = () => preview.replaceChildren(weaponReport(findWeapon(w.id) ?? w, reportRange(period)));
  const periods = chips(REPORT_PERIODS.map(([k, label]) => [k, t(label)]), period, (v) => {
    period = v;
    remember('shooters-log:report-period', v);
    draw();
  });
  draw();
  const close = sheet(t('Звіт по зброї'),
    h('div', {}, periods, h('p', { class: 'muted small' }, t('У вікні друку виберіть «Зберегти як PDF», щоб отримати файл.')), preview), {
      actions: [btn(t('Закрити'), () => close()), btn(t('Друк / PDF'), () => printReport(preview.firstChild), 'primary')],
    });
}

/** Друк: копія звіту поверх застосунку (решту ховає @media print), після друку прибирається. */
function printReport(report) {
  document.getElementById('print-report')?.remove();
  const page = h('div', { id: 'print-report' }, report.cloneNode(true));
  document.body.append(page);
  window.addEventListener('afterprint', () => page.remove(), { once: true });
  window.print();
}

/**
 * Таблиця звіту; numeric — індекси колонок із числами (праворуч), narrow — інших колонок за шириною вмісту.
 * Рядок — масив клітинок, { cells, cls } або { group } — підзаголовок на всю ширину; foot — рядок підсумку.
 */
function reportTable(head, rows, { numeric = [], narrow = [], foot = null } = {}) {
  const cls = (i) => (numeric.includes(i) ? 'num' : narrow.includes(i) ? 'narrow' : null);
  const cells = (r, tag) => r.map((x, i) => h(tag, { class: cls(i) }, x ?? ''));
  return h('div', { class: 'report-scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, cells(head, 'th'))),
    h('tbody', {}, rows.map((r) => {
      if (r.group) return h('tr', { class: 'report-group' }, h('th', { colspan: head.length }, r.group));
      return h('tr', { class: r.cls ?? null }, cells(r.cells ?? r, 'td'));
    })),
    foot ? h('tfoot', {}, h('tr', {}, cells(foot, 'td'))) : null));
}

/** Стрільби й чистки за період; якщо років кілька — підзаголовок року з його настрілом і сумою. */
function reportMoves(moves) {
  const money = (m) => (m.kind === 'shot' ? M.shotCost(state, m) : 0);
  const shots = (list) => list.filter((m) => m.kind === 'shot');
  const fired = (list) => shots(list).reduce((s, m) => s - m.qty, 0);
  const spent = (list) => list.reduce((s, m) => s + money(m), 0);
  const totals = (list) => [t('{n} постр.', { n: fmt.num(fired(list)) }), spent(list) ? `${fmt.num(Math.round(spent(list)))} грн${usdTail(shots(list).map((m) => [money(m), dayOf(m)]))}` : null].filter(Boolean).join(' · ');
  const years = [...new Set(moves.map((m) => (m.date ?? '').slice(0, 4)))];
  const rows = moves.flatMap((m, i) => {
    const year = (m.date ?? '').slice(0, 4);
    const head = years.length > 1 && (i === 0 || (moves[i - 1].date ?? '').slice(0, 4) !== year)
      ? [{ group: `${year} · ${totals(moves.filter((x) => (x.date ?? '').startsWith(year)))}` }] : [];
    // Примітка — другим рядком під назвою: окрема колонка на телефоні стискається до кількох літер.
    const title = (name) => [name, m.note && m.note !== name ? h('div', { class: 'report-note' }, m.note) : null];
    const row = m.kind === 'shot'
      ? [fmt.date(m.date), title(movementTitle(m)), fmt.num(-m.qty), money(m) ? tileMoney(money(m), usdSum([[money(m), dayOf(m)]])) : '']
      : { cls: 'report-clean', cells: [fmt.date(m.date), title(t('Чистка')), '', ''] };
    return [...head, row];
  });
  return reportTable([t('Дата'), t('Набій'), t('К-сть'), t('Сума')], rows, {
    numeric: [2, 3],
    narrow: [0],
    foot: shots(moves).length ? [t('Разом'), '', fmt.num(fired(moves)), spent(moves) ? tileMoney(spent(moves), usdMoves(shots(moves))) : ''] : null,
  });
}

/** «Покупка й тюнінг» у звіті — без періоду: це факт про ствол, а не про вибрані роки. */
function reportBuy(w) {
  const money = (n, iso, rate) => (priceOf(n) ? tileMoney(priceOf(n), usdSum([[n, iso, rate]])) : '');
  const what = (name, note) => [name, note ? h('div', { class: 'report-note' }, note) : null];
  const mods = tuneItems(w).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const rows = [
    priceOf(w.buyPrice) || w.buyDate ? [w.buyDate ? fmt.date(w.buyDate) : '', what(t('Покупка'), w.buyPlace), money(w.buyPrice, w.buyDate, w.usdRate)] : null,
    ...mods.map((m) => [m.date ? fmt.date(m.date) : '', what(m.name, isSold(m)
      ? t('продано {date} за {sum}', { date: fmt.date(m.soldDate), sum: grn(priceOf(m.soldPrice)) + usdTail([[m.soldPrice, m.soldDate, m.soldUsdRate]]) }) : m.place), money(m.price, m.date, m.usdRate)]),
    isSold(w) ? { cls: 'report-clean', cells: [fmt.date(w.soldDate), what(t('Продаж'), w.soldPlace), money(w.soldPrice, w.soldDate)] } : null,
  ].filter(Boolean);
  if (!rows.length) return null;
  return box(t('Покупка й тюнінг'), reportTable([t('Дата'), t('Що'), t('Сума')], rows, {
    numeric: [2], narrow: [0], foot: [t('Разом'), t('обійшовся'), tileMoney(weaponInvested(w), usdSum(investRows(w)))],
  }));
}

/** Зміст звіту: підсумки за період, купчастість за набоями й таблиця стрільб і чисток. */
function weaponReport(w, [from, to]) {
  const inRange = (x) => (!from || (x.date ?? '') >= from) && (!to || (x.date ?? '') <= to);
  const all = state.movements.filter((m) => m.weaponId === w.id && (m.kind === 'shot' || m.kind === 'clean'));
  const moves = all.filter(inRange).sort((a, b) => M.byDateDesc(b, a));
  const shots = moves.filter((m) => m.kind === 'shot');
  const fired = -M.sumBy(shots, () => true);
  const cost = M.shotsCost(state, shots);
  // Чужі набої й набої без ціни у вартість не входять — і в ділення «за постріл» теж
  const pricedFired = -M.sumBy(shots, (m) => M.shotCost(state, m) !== null);
  const total = M.weaponShots(state, w);
  const life = Number(w.barrelLife);
  const lastClean = all.filter((m) => m.kind === 'clean').sort(M.byDateDesc)[0];
  const p = w.permit;
  const permit = p ? [p.number && `№ ${p.number}`, p.expires && t('діє до {date}', { date: fmt.date(p.expires) })].filter(Boolean).join(' · ') : '';
  const kv = (rows) => h('dl', { class: 'kv' }, rows.filter(Boolean).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const days = new Set(shots.map((m) => m.date)).size;
  const barrel = [
    progress(t('Ресурс ствола'), total, life),
    kv([
      from || to || !(life > 0) ? [t('Настріл усього'), fmt.num(total)] : null,
      [t('Чисток за період'), fmt.num(moves.length - shots.length)],
      lastClean ? [t('Остання чистка'), fmt.date(lastClean.date)] : null,
      [t('Пострілів після чистки'), fmt.num(M.cleaningStatus(state, w).since)],
    ]),
  ];
  const papers = [
    permit ? [t('Дозвіл на зброю'), permit] : null,
    w.scopes?.length ? [t('Приціли'), w.scopes.map((s) => s.name).join(', ')] : null,
    chokeText(w) ? [t('Дульне звуження'), chokeText(w)] : null,
    ...sizeRows(w),
  ].filter(Boolean);
  const len = (mm) => length(mm, targetUnit, 100);
  const precision = M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id && inRange(x)), state.photos);
  return h('article', { class: 'report' },
    h('header', { class: 'report-head' },
      h('div', {},
        h('h2', {}, w.name),
        h('div', { class: 'muted small' }, [w.caliber, w.serial && `№ ${w.serial}`].filter(Boolean).join(' · '))),
      h('span', { class: 'report-period' }, from || to
        ? `${from ? fmt.date(from) : '…'} — ${fmt.date(to)}`
        : t('весь час'))),
    h('div', { class: 'stats report-stats' },
      stat(t('настріл'), fmt.num(fired), 'accent'),
      stat(t('днів'), fmt.num(days)),
      cost ? stat(t('вартість'), tileMoney(cost, usdMoves(shots))) : null,
      cost && pricedFired ? stat(t('за постріл'), tileMoney(cost / pricedFired, usdMoves(shots) === null ? null : usdMoves(shots) / pricedFired)) : null),
    box(t('Ствол'), barrel),
    papers.length ? box(t('Документи й оснащення'), kv(papers)) : null,
    reportBuy(w),
    precision.length ? box(t('Купчастість за набоями (на 100 м)'),
      reportTable([t('Набій'), t('Груп'), t('Постр.'), t('Сер. радіус'), t('Найкращий розмах')],
        precision.map((r) => [findCartridge(r.cartridgeId)?.name ?? t('(видалено)'), fmt.num(r.groups), fmt.num(r.shots), len(r.meanRadius), len(r.best)]),
        { numeric: [1, 2, 3, 4] })) : null,
    box(t('Стрільби й чистки'), moves.length ? reportMoves(moves) : h('p', { class: 'muted small' }, t('За період записів немає'))),
    h('p', { class: 'muted small report-foot' }, t('Створено в Shooter’s Log {date}', { date: fmt.date(M.today()) })));
}

/** Чи є в зброї історія: журнал, мішені, швидкості, результати вправ чи свої таблиці DOPE. */
const weaponInUse = (w) => state.movements.some((m) => m.weaponId === w.id)
  || state.targets.some((tg) => tg.weaponId === w.id)
  || state.chrono.some((x) => x.weaponId === w.id)
  || state.scores.some((s) => s.weaponId === w.id)
  || Boolean(w.dope?.length);

/** Зброя з історією — в архів (історія лишається), без неї — видалити разом із фото. */
function removeWeapon(w) {
  if (weaponInUse(w)) {
    saveEntity('weapons', { ...w, archived: true });
    return;
  }
  confirmSheet(t('Видалити зброю?'), w.name, t('Видалити'), async () => {
    await db.write({ weapons: { del: [w.id] } });
    await removePhotos([...weaponPhotos(w.id), ...(w.mods ?? []).map((m) => modPhoto(m.id)), ...(w.scopes ?? []).map((sc) => scopePhoto(sc.id))].filter(Boolean));
    await refresh();
  });
}

/** Приціли в картці: біля кожного — кнопка-значок майстра пристрілки. */
function zeroScopes(w) {
  return h('div', { class: 'scopes' }, (w.scopes ?? []).map((s) => h('div', { class: 'scope-zrow' },
    scopeLine(s, true),
    h('button', {
      type: 'button', class: 'icon-btn zero-ico', title: t('Пристріляти приціл'), 'aria-label': `${t('Пристріляти приціл')}: ${s.name}`,
      onclick: () => openZero(w, s),
    }, zeroWizIco()))));
}

/** Значок майстра пристрілки: перехрестя, група влучань збоку й стрілка до центру. */
function zeroWizIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 1.8v4.4M12 17.8v4.4M1.8 12h4.4M17.8 12h4.4"/>'
    + '<g fill="currentColor" stroke="none"><circle cx="16.6" cy="6.6" r="1.2"/><circle cx="18.1" cy="8.4" r="1.2"/><circle cx="15.7" cy="8.6" r="1.2"/></g>'
    + '<path d="M14.6 10.1 12.4 12.3M12.3 10.4v2h2" stroke-width="1.5"/></svg>';
  return el;
}

/** Приціли, які можна пристріляти: стволи в строю (не в архіві, не продані) × їхні приціли. */
const zeroChoices = () => state.weapons.filter((w) => !w.archived && !isSold(w)).sort(byName)
  .flatMap((w) => (w.scopes ?? []).map((s) => [w, s]));

/** «Пристрілка» в Полігон → Мішені: вибрати ствол і приціл (один варіант — одразу майстер). */
function zeroStartBtn() {
  if (!zeroChoices().length) return null;
  return h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn zero-start', onclick: zeroPicker }, zeroWizIco(), t('Пристрілка')));
}

function zeroPicker() {
  const list = zeroChoices();
  if (list.length === 1) { openZero(...list[0]); return; }
  const close = sheet(t('Що пристрілюємо?'), h('div', { class: 'rows' }, list.map(([w, s]) => h('button', {
    type: 'button', class: 'row', onclick: () => { close(); openZero(w, s); },
  }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, w.name),
    h('span', { class: 'muted small' }, [s.name, s.zero ? t('пристрілка {n} м', { n: fmt.num(s.zero) }) : null, s.zeroDate ? t('пристріляно {d}', { d: fmt.date(s.zeroDate) }) : null].filter(Boolean).join(' · ')))))));
}

/** Майстер пристрілки (js/zero.js — підвантажується, коли знадобиться). */
async function openZero(w, s) {
  const { zeroWizard } = await import('./zero.js');
  const ammo = state.cartridges.filter((c) => !c.archived && (!w.caliber || M.sameCaliber(c.caliber, w.caliber))).sort(byName);
  zeroWizard({
    weapon: w, scope: s, ammo,
    suppressor: lastGear(w).suppressor,
    hasSuppressor: !!w.suppressor || [...state.targets, ...state.scores].some((x) => x.weaponId === w.id && x.suppressor),
    // Закрили майстер — картка ствола під ним показує «пристрілка не закінчена» чи нову пристрілку
    onClose: () => refreshSheets(),
    cartridgeId: [recall(`ammo:${w.id}`), s.zeroAmmo].find((id) => id && ammo.some((c) => c.id === id)) ?? null,
    chronoMv: (c) => chronoMv(w, c),
    // Таблиця DOPE цього прицілу (свого набою чи без набою) → поправка в мрад на дистанції
    dope: (cid) => {
      const tables = (findWeapon(w.id)?.dope ?? []).filter((d) => d.scopeId === s.id);
      const table = tables.find((d) => cid && d.cartridgeId === cid) ?? tables.find((d) => !d.cartridgeId);
      return table ? (d) => M.dopeAt(table.rows, d, s.zero) : null;
    },
    saveScope: async (patch) => {
      const cur = findWeapon(w.id);
      await saveEntity('weapons', { ...cur, scopes: cur.scopes.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
    },
    // Група з фото: звичайна мішень (вирівнювання й розмітка), після збереження — її статистика назад у майстер
    photoGroup: (pre, onStats) => newTarget({
      weaponId: w.id, scopeId: s.id, cartridgeId: pre.cartridgeId, distance: pre.distance, zeroUp: pre.zeroUp, suppressor: pre.suppressor, note: t('Пристрілка'),
      onDone: (rec, photo) => onStats(M.targetStats(rec, photo).find((x) => x.stats)?.stats ?? null),
    }),
  });
}

function weaponBody(w, close) {
  const moves = state.movements.filter((m) => m.weaponId === w.id);
  const cost = M.shotsCost(state, moves);
  const main = M.defaultScope(w) ?? w.scopes?.[0];
  // Калібр у підписі шапки — іконкою набою й кольором калібру, як у Складі; номер і комплект — звичайним
  const rest = [w.serial && `№ ${w.serial}`, chokeText(w) || null].filter(Boolean).join(' · ');
  const caption = [w.caliber ? cartridgeIcon(w.caliber) : null, w.caliber ? h('span', { class: 'gun-hero-cal' }, w.caliber) : null,
    w.caliber && rest ? ' · ' : null, rest || null].filter(Boolean);
  return h('div', { class: 'gun-card' },
    gunHero(w, caption),
    sizeBox(w),
    w.note ? h('p', { class: 'muted small gun-note' }, w.note) : null,
    gunFlags(w, true),
    gunStats(w, close),
    mountBox(w),
    // Розділи згорнуті, у заголовку — головне з кожного: картка вміщається на екран, деталі — тапом
    main ? box(w.scopes.length > 1 ? t('Приціли') : t('Приціл'), zeroScopes(w), {
      fold: `scopes:${w.id}`, count: w.scopes.length > 1 ? w.scopes.length : null,
      summary: h('span', { class: 'box-sum' }, main.name),
    }) : null,
    buyBox(w, close),
    permitBox(w),
    dopeBox(w, close),
    precisionChart(w),
    ammoPrecisionBox(w, 'precision'),
    suppressorBox(w, 'precision'),
    restBox(w, 'precision'),
    box(t('Стрільби й чистки'), h('div', { class: 'gun-moves' }, movementRows(moves, { skip: { weapon: true } })), {
      fold: `shots:${w.id}`, count: moves.length,
      summary: cost ? h('span', { class: 'box-sum' }, grn(cost) + usdTail(moves.filter((m) => m.kind === 'shot').map((m) => [M.shotCost(state, m), dayOf(m)]))) : null,
    }));
}

// ---------- DOPE ----------

// Одиниці вводу таблиці: клацання (за ціною клацання прицілу), кут або сантиметри на цілі
const DOPE_UNITS = [['click', 'кл.'], ['mil', 'MRAD'], ['moa', 'MOA'], ['cm', 'см']];

const dopeScope = (w, d) => w.scopes?.find((s) => s.id === d.scopeId) ?? null;

/** Ключ для toMrad: для клацань — ціна клацання прицілу, інакше сама одиниця. */
const dopeUnitKey = (unit, scope) => (unit === 'click' ? scope?.click ?? null : unit);

/** «Приціл · Набій» таблиці; видалені — «(удалено)». */
function dopeTitle(w, d) {
  const scope = dopeScope(w, d);
  const cart = findCartridge(d.cartridgeId);
  return [scope?.name ?? (d.scopeId ? t('(видалено)') : t('Без прицілу')),
    cart?.name ?? (d.cartridgeId ? t('(видалено)') : null)].filter(Boolean).join(' · ');
}

/** Свої таблиці DOPE для тренажера: «зброя · приціл · набій», рядки в мрад, пристрілка й сітка прицілу. */
function myDopeLoads() {
  return state.weapons.filter((w) => !w.archived).flatMap((w) => (w.dope ?? []).map((d) => {
    const scope = dopeScope(w, d);
    return { id: d.id, label: `${w.name} · ${dopeTitle(w, d)}`, rows: d.rows, zero: scope?.zero ?? null, windSpeed: d.windSpeed ?? null, reticle: reticleOf(scope) };
  }));
}

/** Середня швидкість останньої серії хронографа цієї зброї з цим набоєм, м/с; null — серій немає. */
function chronoMv(w, c) {
  return [...state.chrono].sort(M.byDateDesc)
    .map((x) => (x.weaponId === w.id && x.cartridgeId === c.id ? M.chronoStats(x.speeds).avg : null)).find((v) => v > 0) ?? null;
}

/**
 * Зброя з прицілом для тренажера: на кожен набій її калібру з BC і швидкістю — своя балістика
 * (швидкість — з останньої серії хронографа цієї зброї з цим набоєм, інакше з картки набою).
 * Без таких набоїв 5.56 чи .308 рахує за довідковим набоєм калібру. Пристрілка й сітка — з картки прицілу.
 */
function myGunLoads() {
  const cal = (c) => (!c ? null : M.sameCaliber(c, '5.56') ? '556' : M.sameCaliber(c, '.308') ? '308' : null);
  return state.weapons.filter((w) => !w.archived && w.caliber).flatMap((w) => {
    const ammo = state.cartridges.filter((c) => !c.archived && c.caliber && M.sameCaliber(c.caliber, w.caliber) && c.bc > 0 && c.mv > 0)
      .sort(byName).map((c) => {
        const chrono = chronoMv(w, c);
        const gr = c.bulletWeight > 0 ? (c.weightUnit === 'г' ? c.bulletWeight * 15.4324 : c.bulletWeight) : null;
        return { id: c.id, name: c.name, bc: c.bc, model: c.dragModel || 'G7', mv: Math.round(chrono ?? c.mv), chrono: !!chrono, gr };
      });
    if (!ammo.length && !cal(w.caliber)) return [];
    return (w.scopes ?? []).flatMap((s) => {
      const g = { name: w.name, scope: s.name, cal: cal(w.caliber), zero: s.zero ?? null, sh: s.sh ?? null, reticle: reticleOf(s) };
      return ammo.length ? ammo.map((a) => ({ ...g, id: `${w.id}:${s.id}:${a.id}`, ammo: a })) : [{ ...g, id: `${w.id}:${s.id}` }];
    });
  });
}

/** Блок DOPE у картці зброї: таблиці поправок по дистанціях, згорнутий за замовчуванням. */
function dopeBox(w, close) {
  const list = w.dope ?? [];
  return box(t('DOPE — поправки за дистанціями'), [
    w.scopes?.length ? h('div', { class: 'btn-row' }, btn(t('Поправки зараз'), () => openNow(w), 'primary')) : null,
    ...list.map((d) => dopeCard(w, d, close)),
    list.length ? null : h('p', { class: 'muted small' }, t('Таблиця: на якій дистанції скільки кліків крутити або скільки виносити по сітці. Для кожного прицілу й набою — своя.')),
    btn(t('+ таблиця поправок'), () => dopeForm(w)),
  ], { fold: `dope:${w.id}`, count: list.length });
}

/** Одна таблиця: дистанція → поправка барабаном і винос; внизу — розрахунок для іншої дистанції. */
function dopeCard(w, d, close) {
  const scope = dopeScope(w, d);
  const reticle = reticleOf(scope);
  const rows = M.dopeRows(d.rows, scope?.zero);
  const windy = d.windSpeed > 0 && d.rows.some((r) => r.wind > 0);
  // Барабан і сітка в одних одиницях — одна колонка «Поправка», інакше «Барабан» і «Винос»
  const one = oneColumn(scope?.click, reticle);
  const windTd = (dist) => {
    const mrad = M.windAt(d.rows, dist);
    return cellTd(mrad === null ? { main: '—', sub: null } : windCell(mrad, dist, scope?.click, reticle));
  };
  // Глушник: зсув записано в приціл — барабан поправляється, коли зараз не так, як при пристрілці
  const supShift = M.supShiftFor(scope, d.cartridgeId);
  const sup = supShift ? h('input', { type: 'checkbox', role: 'switch' }) : null;
  if (sup) sup.checked = lastGear(w).suppressor;
  const supNote = h('p', { class: 'muted small' });
  // Менше пів кліку (без ціни кліку — 0,05 мрад) не крутять: така поправка — шум, у таблиці її не показуємо
  const worth = (mrad) => {
    const c = M.clickValue(scope?.click);
    return c ? Math.abs(M.fromMrad(mrad, c.unit)) / c.value >= 0.5 : Math.abs(mrad) >= 0.05;
  };
  const fix = () => {
    const f = sup ? M.suppressorFix(sup.checked, scope.zeroSuppressor, supShift) : null;
    return f && { x: worth(f.x) ? f.x : 0, y: worth(f.y) ? f.y : 0 };
  };
  const dial = (mrad) => mrad + (fix()?.y ?? 0);
  const tbody = h('tbody');
  // Старий нуль без відмітки про глушник — відповідь одним тапом, не чекаючи нової пристрілки
  const answer = (v) => btn(v ? t('з глушником') : t('без'), async () => {
    const cur = findWeapon(w.id);
    await saveEntity('weapons', { ...cur, scopes: cur.scopes.map((x) => (x.id === scope.id ? { ...x, zeroSuppressor: v } : x)) });
  }, 'mini');
  const paint = () => {
    const f = fix();
    const moved = f && (f.x || f.y);
    tbody.replaceChildren(...rows.map((r) => h('tr', { class: r.zero ? 'zero' : '' },
      h('td', {}, fmt.num(r.distance)),
      ...(r.zero && !moved ? (one ? [cellTd({ main: '0', sub: t('пристрілка') })] : [cellTd({ main: t('пристрілка'), sub: null }), cellTd({ main: '0', sub: null })])
        : elevCells(dial(r.mrad), r.distance, scope?.click, reticle).map(cellTd)),
      windy ? windTd(r.distance) : null)));
    if (sup && typeof scope.zeroSuppressor !== 'boolean') {
      supNote.replaceChildren(t('Приціл пристрілювали з глушником? Поки невідомо — поправку не враховано.'), ' ', answer(true), ' ', answer(false));
      return;
    }
    supNote.textContent = !moved ? ''
      : [t('З поправкою на глушник'), f.x ? `${t('по горизонталі')} ${elevText(Math.abs(f.x), scope.click).replace(/^\S+/, f.x > 0 ? '→' : '←')}` : null].filter(Boolean).join(' · ');
  };
  paint();
  const table = h('table', { class: 'dope' },
    h('thead', {}, h('tr', {}, h('th', {}, t('м')), ...(one ? [h('th', {}, t('Поправка'))] : [h('th', {}, t('Барабан')), h('th', {}, t('Винос'))]),
      windy ? h('th', {}, t('Вітер {v} м/с', { v: fmt.num(d.windSpeed) })) : null)),
    tbody);
  const out = h('p', { class: 'dope-out small' });
  const at = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, placeholder: t('Інша дистанція, м'), class: 'dope-at' });
  const speed = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: t('Вітер, м/с') });
  // Звідки дме: 3 і 9 — повний боковий, 12 і 6 — поправки немає
  const clock = h('select', { 'aria-label': t('Звідки вітер') },
    selectOptions(Array.from({ length: 12 }, (_, i) => [String(i + 1), t('з {n} год', { n: i + 1 })]), '3'));
  const windLine = (dist) => {
    const v = Number(speed.value.replace(',', '.'));
    const base = M.windAt(d.rows, dist);
    if (!(v > 0) || base === null) return null;
    const h12 = Number(clock.value);
    const mrad = (base * v * M.windShare(h12)) / d.windSpeed;
    if (mrad < 0.0005) return `${t('вітер')}: ${t('без поправки')}`;
    // Вітер справа зносить кулю вліво — виносимо назустріч вітру
    return `${t('вітер')}: ${t('винос')} ${holdText(mrad, dist, reticle, h12 < 6 ? '→' : '←')}`;
  };
  const calc = () => {
    const dist = Number(at.value);
    const raw = dist > 0 ? M.dopeAt(d.rows, dist, scope?.zero) : null;
    const mrad = raw === null ? null : dial(raw);
    out.textContent = !(dist > 0) ? '' : mrad === null ? t('поза таблицею — додайте рядок')
      : [`${elevText(mrad, scope?.click)} · ${t('винос')} ${holdText(mrad, dist, reticle)}`, windy ? windLine(dist) : null]
        .filter(Boolean).join('\n');
  };
  sup?.addEventListener('change', () => { paint(); calc(); });
  for (const el of [at, speed]) el.addEventListener('input', calc);
  clock.addEventListener('change', calc);
  const calcBox = h('div', { class: `dope-calc ${windy ? 'windy' : ''}` }, at, windy ? speed : null, windy ? clock : null);
  if (windy) clockPicker(clock, { speed, hideSpeed: true });
  const stale = staleText(d.cond, scope);
  return h('div', { class: 'dope-card' },
    h('div', { class: 'dope-head' }, h('span', { class: 'row-title' }, dopeTitle(w, d),
      condText(d.cond) ? h('span', { class: 'badge small dope-cond' }, condText(d.cond)) : null),
      toolBtn('target', t('Тренувати в тренажері'), () => trainDope(d, close), 'small'),
      toolBtn('edit', t('Змінити'), () => dopeForm(w, d), 'small')),
    d.note ? h('p', { class: 'muted small' }, d.note) : null,
    stale ? h('p', { class: 'warn-text small dope-stale' }, stale) : null,
    sup ? switchLabel(sup, t('З глушником')) : null, sup ? supNote : null,
    table, calcBox, out);
}

/** «Поправки зараз» для ствола: набої його калібру, хронограф, глушник як минулого разу, збереження в DOPE. */
function openNow(w) {
  nowSheet({
    weapon: w,
    ammo: state.cartridges.filter((c) => !c.archived && c.caliber && M.sameCaliber(c.caliber, w.caliber)).sort(byName),
    chronoMv: (c) => chronoMv(w, c),
    suppressor: lastGear(w).suppressor,
    clockPicker, switchLabel, reticleOf, box, locate: devicePosition, uid: db.uid,
    dope: () => (findWeapon(w.id) ?? w).dope ?? [],
    saveDope: async (card) => {
      const cur = findWeapon(w.id) ?? w;
      await saveEntity('weapons', { ...cur, dope: [...(cur.dope ?? []), card] });
    },
  });
}

/** Тренажер на цій таблиці: вибір набору — як збережений у тренажері, далі «Полігон → Тренажер». */
function trainDope(d, close) {
  try {
    const saved = JSON.parse(localStorage.getItem('shooters-log:sim')) ?? {};
    localStorage.setItem('shooters-log:sim', JSON.stringify({ ...saved, 's-kit': `my:${d.id}`, mode: 'aim' }));
  } catch { /* приватний режим — тренажер відкриється на першій своїй таблиці */ }
  close?.();
  goRange('sim');
}

/** «Полігон» на потрібному розділі (запам'ятовується, як і вибраний вручну). */
function goRange(seg) {
  rangeSeg = seg;
  remember('shooters-log:range-seg', rangeSeg);
  if (location.hash === '#targets') render();
  else goTab('#targets');
}
/**
 * «Вставити таблицю» у формі DOPE: PDF зі «Стрільця» — одразу в рядки; текст з Excel чи блокнота —
 * дистанція першою колонкою, а яка колонка поправка й яка вітер — вибирають.
 * onRows(rows, { unit, windSpeed, note }) — другий аргумент лише з PDF.
 */
function dopePaste(onRows) {
  const text = h('textarea', { class: 'dope-paste-text', rows: 5, placeholder: '100  0\n200  0,9  0,3\n300  2,1  0,6', 'aria-label': t('Таблиця') });
  const valueCol = h('select', { 'aria-label': t('Поправка — колонка') });
  const windCol = h('select', { 'aria-label': t('Вітер — колонка') });
  let paintCols = () => {};
  const found = h('small', { class: 'muted' });
  let table = [];
  // Колонку вітру, вибрану руками (зокрема «без вітру»), нове вставлення не перебиває
  let windPicked = false;
  windCol.addEventListener('change', () => { windPicked = true; });
  const read = () => {
    table = M.parseTable(text.value);
    const n = Math.max(0, ...table.map((r) => r.length));
    const first = table[0] ?? [];
    const cols = Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1)
      .map((i) => [i, `${t('колонка {n}', { n: i + 1 })}${first[i] === undefined ? '' : ` · ${num(first[i], 2)}`}`]);
    const keep = (sel, fallback) => (cols.some(([i]) => String(i) === sel.value) ? sel.value : fallback);
    const value = keep(valueCol, 1);
    const wind = windPicked ? keep(windCol, '') : n >= 3 ? 2 : '';
    valueCol.replaceChildren(...selectOptions(cols, value));
    windCol.replaceChildren(...selectOptions([['', t('без вітру')], ...cols], wind));
    paintCols();
    found.textContent = text.value.trim() ? t('Рядків: {n}', { n: table.length }) : '';
  };
  text.addEventListener('input', read);
  const cell = (row, col) => (col === '' || row[col] === undefined ? '' : String(row[col]).replace('.', ','));
  const decimal = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const pdfInput = h('input', {
    type: 'file', accept: '.pdf,application/pdf', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await importStrilets(file);
    },
  });
  async function importStrilets(file) {
    let runs;
    const { pdfRuns, pdfTable, runsToLines } = await pdfMod();
    try { runs = await pdfRuns(await file.arrayBuffer()); } catch { runs = []; }
    if (!runs.length) { fieldError(text, t('У PDF немає тексту — це скан чи картинка?')); return; }
    const dope = M.striletsDope(pdfTable(runs));
    if (!dope) {
      // не «Стрілець» — віддаємо текст у поле: колонки людина вибере сама
      text.value = runsToLines(runs).join('\n');
      read();
      found.textContent = t('Не схоже на таблицю Стрільця — виберіть колонки нижче');
      return;
    }
    onRows(dope.rows.map((r) => ({ distance: r.distance, value: decimal(r.value), wind: decimal(r.wind) })),
      { unit: dope.unit, windSpeed: dope.windSpeed, note: dope.note, tC: dope.tC, sh: dope.sh, zero: dope.zero });
    panel.hidden = true;
    const skipped = {
      angle: t('Колонку вітру не перенесено: у Стрільці вітер під кутом {deg}°. Порахуйте таблицю з боковим вітром (90°) — і колонка з’явиться.', { deg: fmt.num(dope.windAngle) }),
      derivation: t('Колонку вітру не перенесено: у Стрільці ввімкнена деривація, горизонтальна поправка — не лише від вітру.'),
      calm: t('Колонку вітру не перенесено: у Стрільці вітер не задано.'),
    }[dope.windSkipped];
    toast([t('Зі Стрільця: рядків {n}', { n: dope.rows.length }), skipped].filter(Boolean).join('. '), { timeout: skipped ? 9000 : 3500 });
  }
  const panel = h('div', { class: 'dope-paste', hidden: true },
    h('div', { class: 'btn-row' }, btn(t('PDF зі Стрільця'), () => pdfInput.click(), 'primary')), pdfInput,
    h('p', { class: 'muted small' }, t('PDF з таблицею поправок зі Стрільця — кнопкою вище. Або скопіюйте таблицю з Excel чи напишіть рядками: дистанція, поправка, вітер — числа в одиницях, вибраних вище.')),
    text, found,
    h('div', { class: 'dope-paste-cols' },
      h('label', { class: 'small' }, t('Поправка — колонка'), valueCol),
      h('label', { class: 'small' }, t('Вітер — колонка'), windCol)),
    btn(t('Заповнити рядки'), () => {
      if (!table.length) { fieldError(text, t('Рядків не знайдено: на початку рядка — дистанція, далі поправка')); return; }
      onRows(table.map((r) => ({ distance: Math.round(r[0]), value: cell(r, Number(valueCol.value)), wind: cell(r, windCol.value === '' ? '' : Number(windCol.value)) }))
        .filter((r) => r.value !== ''));
      panel.hidden = true;
    }));
  const paintValue = chipPicker(valueCol, { seg: false, cls: 'chips-sm' });
  const paintWind = chipPicker(windCol, { seg: false, cls: 'chips-sm' });
  paintCols = () => { paintValue(); paintWind(); };
  read();
  const button = btn(t('Вставити таблицю'), () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) text.focus();
  });
  return { button, panel };
}

/** Форма таблиці DOPE: приціл, набій, одиниці й рядки «дистанція — поправка» (плюс — вгору). */
function dopeForm(w, d = null) {
  const scopes = w.scopes ?? [];
  const cartridges = caliberOptions(state.cartridges.filter((c) => !c.archived || c.id === d?.cartridgeId), w.caliber);
  const f = form([
    { name: 'scopeId', label: t('Приціл'), type: 'select', value: d ? d.scopeId ?? '' : M.defaultScope(w)?.id ?? scopes[0]?.id ?? '', options: [...scopes.map((s) => [s.id, s.name]), ['', t('Без прицілу')]], wide: true },
    { name: 'cartridgeId', label: t('Набій'), type: 'select', value: d?.cartridgeId ?? cartridges.match[0]?.id ?? '', options: [['', t('— не вказувати —')], ...cartridges.options], wide: true },
    { name: 'note', label: t('Примітка'), value: d?.note, placeholder: t('Погода, висота, звідки цифри…'), wide: true },
    { name: 'condT', label: t('Таблиця для температури, °C'), type: 'number', step: 'any', value: d?.cond?.tC, placeholder: '15', half: true },
    { name: 'condAlt', label: t('і висоти над морем, м'), type: 'number', step: 'any', value: d?.cond?.alt, placeholder: '0', half: true },
  ]);
  f.inputs.condAlt.closest('.field').after(h('small', { class: 'muted dope-cond-hint' },
    t('Знаючи погоду таблиці, «Поправки зараз» перерахують її під сьогоднішню.')));
  // Пристрілка й висота прицілу, для яких таблицю розраховано: інші в прицілі — таблиця застаріла.
  // Рядки правили руками після розрахунку — це вже не розрахунок, і порівнювати нема з чим
  let setup = d?.cond?.zero || d?.cond?.sh ? { zero: d.cond.zero ?? null, sh: d.cond.sh ?? null, mv: d.cond.mv ?? null } : null;
  scopePicker(f.inputs.scopeId, () => w);
  ammoPicker(f.inputs.cartridgeId, w.caliber);
  caliberWarnLine(f.inputs.cartridgeId.closest('.field'), () => findCartridge(f.inputs.cartridgeId.value), () => w, [f.inputs.cartridgeId]);
  const scope = () => scopes.find((s) => s.id === f.inputs.scopeId.value) ?? null;
  let unit = d?.unit ?? (scope()?.click ? 'click' : 'mil');
  const rowsBox = h('div', { class: 'dope-rows' });
  const toText = (mrad, dist) => {
    const v = M.fromMrad(mrad, dopeUnitKey(unit, scope()), dist);
    return v === null ? '' : String(unit === 'click' ? Math.round(Number(v.toFixed(6))) : Math.round(v * 100) / 100).replace('.', ',');
  };
  const readRows = () => [...rowsBox.querySelectorAll('.dope-row')].map((row) => ({
    distance: Number(row.querySelector('.dope-d').value),
    value: row.querySelector('.dope-v').value.trim(),
    wind: row.querySelector('.dope-w').value.trim(),
    vIn: row.querySelector('.dope-v'),
    wIn: row.querySelector('.dope-w'),
  }));
  // Точне значення поля: поки число не правили, береться воно, а не перераховане з округленого
  // (кліки показуються цілими — інакше кожне збереження зсувало б 0,15 MRAD до 0,2)
  const mradIn = (input, u, distance, sc = scope()) => {
    const text = input.value.trim();
    const ex = input.exact;
    if (ex && ex.text === text && (u !== 'cm' || ex.dist === distance)) return ex.mrad;
    return text === '' ? null : M.toMrad(Number(text.replace(',', '.')), dopeUnitKey(u, sc), distance);
  };
  // Знос вітром — величина без знака: напрям обирають під час розрахунку
  const toMradRows = (list, u) => list.filter((r) => r.distance > 0 && r.value !== '')
    .map((r) => ({ distance: r.distance, mrad: mradIn(r.vIn, u, r.distance), wind: r.wind === '' ? null : Math.abs(mradIn(r.wIn, u, r.distance)) }));
  const addRow = (distance = '', value = '', wind = '', exact = {}) => {
    const keep = (input, text, mrad) => {
      input.value = text;
      input.exact = text !== '' && Number.isFinite(mrad) ? { text, mrad, dist: Number(distance) } : null;
    };
    const dist = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, placeholder: t('м'), class: 'dope-d' });
    dist.value = distance;
    const val = h('input', { type: 'text', inputmode: 'decimal', placeholder: '+0', class: 'dope-v' });
    keep(val, value, exact.v);
    const windIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0', class: 'dope-w' });
    keep(windIn, wind, exact.w);
    const row = h('div', { class: 'dope-row' }, dist, val, windIn,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Видалити'), onclick: () => row.remove() }, '✕'));
    rowsBox.append(row);
  };
  const windForm = form([{ name: 'windSpeed', label: t('Колонка «Вітер» — при вітрі, м/с'), type: 'number', step: 'any', min: 0,
    value: d?.windSpeed ?? 5, hint: t('Поправка при боковому вітрі (на 3 або 9 год) такої швидкості. Напрям і силу вітру оберете під час розрахунку.') }]);
  const unitHint = h('small', { class: 'muted' });
  // Змінили одиниці — числа перераховуються, а не тлумачаться по-новому
  const units = h('div', {});
  // Рядки — у поточних одиницях і прицілі: числа йдуть через MRAD, а не тлумачаться по-новому
  const rerender = (fromUnit, fromScope = scope()) => {
    const rows = readRows().map((r) => ({
      ...r,
      v: r.value === '' ? null : mradIn(r.vIn, fromUnit, r.distance, fromScope),
      w: r.wind === '' ? null : mradIn(r.wIn, fromUnit, r.distance, fromScope),
    }));
    rowsBox.replaceChildren();
    // Порожні рядки й ті, що не перевести (см без дистанції), лишаються як були
    const text = (mrad, raw, distance) => (mrad === null || !Number.isFinite(mrad) ? raw : toText(mrad, distance));
    rows.forEach((r) => addRow(r.distance || '', text(r.v, r.value, r.distance), text(r.w, r.wind, r.distance), { v: r.v, w: r.w }));
    if (!rows.length) addRow();
  };
  const drawUnits = () => {
    const opts = DOPE_UNITS.filter(([k]) => k !== 'click' || scope()?.click);
    if (unit === 'click' && !scope()?.click) unit = 'mil';
    const next = chips(opts.map(([k, label]) => [k, k === 'click' && scope()?.click ? `${t(label)} (${clickLabel(scope().click)})` : t(label)]), unit, (u) => {
      const prev = unit;
      unit = u;
      rerender(prev);
      drawUnits();
    });
    next.classList.add('segmented');
    units.replaceChildren(next);
    unitHint.textContent = unit === 'cm' ? t('Сантиметри на цілі: наскільки влучання нижче точки прицілювання без поправки.') : t('Плюс — вгору (далі за пристрілку), мінус — вниз.');
  };
  // Таблицю вели в кліках, а в прицілу ціни кліку вже немає — показуємо в MRAD, інакше рядки вийшли б порожніми й пропали при збереженні
  if (unit === 'click' && !scope()?.click) unit = 'mil';
  if (d) d.rows.forEach((r) => addRow(r.distance, toText(r.mrad, r.distance), r.wind > 0 ? toText(r.wind, r.distance) : '', { v: r.mrad, w: r.wind > 0 ? r.wind : null }));
  else (scope()?.zero >= 100 ? [200, 300, 400, 500] : [100, 200, 300]).forEach((x) => addRow(x));
  // Кліки належать прицілу: змінили приціл — ті самі поправки в кліках нового (або в MRAD, якщо в нього ціни кліку немає)
  let shownScope = scope();
  f.inputs.scopeId.addEventListener('change', () => {
    const was = shownScope;
    shownScope = scope();
    if (unit === 'click') {
      if (!scope()?.click) unit = 'mil';
      rerender('click', was);
    }
    drawUnits();
  });
  windForm.el.classList.add('dope-wind');
  const paste = dopePaste((rows, from = {}) => {
    // PDF зі «Стрільця» приходить у своїх одиницях (см) і зі швидкістю вітру — перемикаємо форму під них
    if (from.unit) unit = from.unit;
    if (from.windSpeed) windForm.inputs.windSpeed.value = from.windSpeed;
    if (from.note && !f.inputs.note.value.trim()) f.inputs.note.value = from.note;
    rowsBox.replaceChildren();
    rows.forEach((r) => addRow(r.distance, r.value, r.wind));
    // Зі «Стрільця» відомо, за якої температури й висоти прицілу таблиця: застарілу буде видно
    if (Number.isFinite(from.tC)) f.inputs.condT.value = String(from.tC);
    setup = from.sh || from.zero ? { zero: from.zero ?? null, sh: from.sh ?? null, mv: null } : null;
    drawUnits();
  });
  rowsBox.addEventListener('input', () => { setup = null; });
  // Розрахунок: набій з BC і швидкістю (з хронографа, якщо є серія), приціл — пристрілка й висота над стволом
  const calcForm = form([
    { name: 'temp', label: t('Температура, °C'), type: 'number', step: 'any', value: 15, half: true },
    { name: 'alt', label: t('Висота над морем, м'), type: 'number', step: 'any', value: 0, half: true },
  ]);
  const calcInfo = h('p', { class: 'muted small' });
  const calcSource = () => {
    const c = findCartridge(f.inputs.cartridgeId.value);
    if (!c) return { error: t('Виберіть набій — розрахунок за його BC і швидкістю') };
    if (!(c.bc > 0 && c.mv > 0)) return { error: t('У набою «{n}» немає BC чи швидкості, без них рахувати нема з чого.', { n: c.name }), fix: c };
    const chrono = chronoMv(w, c); const sc = scope();
    return { c, mv: Math.round(chrono ?? c.mv), chrono: !!chrono, zero: sc?.zero > 0 ? sc.zero : null, sh: sc?.sh > 0 ? sc.sh : null };
  };
  const calcText = (s) => [`${s.c.dragModel || 'G7'} ${fmt.num(s.c.bc)}`, `${s.mv} ${t('м/с')} (${s.chrono ? t('хронограф') : t('з картки набою')})`,
    s.zero ? t('пристрілка {n} м', { n: s.zero }) : t('пристрілку не вказано — від 100 м'),
    s.sh ? t('приціл {n} см над стволом', { n: fmt.num(s.sh) }) : t('висоту прицілу не вказано — 6 см')].join(' · ');
  // Прогноз на день виїзду: температура й висота місця — у поля розрахунку, звідки цифри — у примітку
  let forecastNote = '';
  const tripBox = tripWeather({
    locate: devicePosition,
    onWeather: ({ temp, elevation, place, date, time }) => {
      calcForm.inputs.temp.value = String(Math.round(temp));
      if (elevation !== null) calcForm.inputs.alt.value = String(Math.round(elevation));
      forecastNote = t('прогноз: {place}, {date} {time}', { place, date: fmt.date(date), time });
      paintCalc();
      toast(t('Прогноз: {temp} °C, висота {alt} м', { temp: fmt.num(Math.round(temp)), alt: fmt.num(Math.round(elevation ?? 0)) }));
    },
  });
  tripBox.hidden = true;
  const tripBtn = btn(t('Погода на день виїзду'), () => { tripBox.hidden = !tripBox.hidden; }, 'mini');
  // Траєкторія з цими ж числами: прямий постріл для пристрілки прицілу, смуга ±R см
  let pbR = Number(recall('shooters-log:pb-r')) || 5;
  const trajBox = h('div', { class: 'dope-traj' });
  const paintTraj = () => {
    const s = calcSource();
    const v = calcForm.values();
    if (s.error || calcForm.invalid()) { trajBox.replaceChildren(); return; }
    const sh = s.sh ?? 6; const zero = s.zero ?? 100;
    const res = solve({ bc: s.c.bc, model: s.c.dragModel || 'G7', mv: s.mv, sh, zero, tC: v.temp ?? 15, alt: v.alt ?? 0, max: 700, step: 10 })
      ?? solve({ bc: s.c.bc, model: s.c.dragModel || 'G7', mv: s.mv, sh, zero, tC: v.temp ?? 15, alt: v.alt ?? 0, max: 400, step: 10 });
    if (!res) { trajBox.replaceChildren(); return; }
    const pts = trajectoryPoints(res.H, 10, sh);
    const pb = pointBlank(pts, pbR);
    const radius = chips([5, 10, 15].map((r) => [String(r), `±${r} ${t('см')}`]), String(pbR), (r) => {
      pbR = Number(r); remember('shooters-log:pb-r', r); paintTraj();
    });
    radius.classList.add('segmented');
    trajBox.replaceChildren(h('h4', {}, t('Прямий постріл')), radius,
      h('p', { class: 'dope-pb' }, pointBlankText(pb, pbR, zero)), trajectoryChart(pts, { r: pbR, zero, ...pb }));
  };
  const paintCalc = () => {
    const s = calcSource();
    // Немає BC чи швидкості — кнопка тут же: картка набою відкривається поверх, після збереження рахуємо знову
    calcInfo.replaceChildren(s.error ?? `${calcText(s)}. ${t('Рядки 25 і 50 м та 100–700 м через 50 м замінять поточні; вітер — за швидкості з поля вище.')}`,
      ...(s.fix ? [' ', btn(t('Заповнити BC і швидкість'), () => cartridgeForm(findCartridge(s.fix.id) ?? s.fix, { onSaved: paintCalc }), 'mini')] : []));
    calcInfo.classList.toggle('warn-text', !!s.error);
    if (!calcPanel.hidden) paintTraj();
  };
  calcForm.el.addEventListener('input', () => { forecastNote = ''; paintTraj(); });
  const fillCalc = () => {
    const s = calcSource();
    // Помилку видно тут, біля кнопки, а не на полі «Набій» угорі форми, якого зараз не видно
    if (s.error) { paintCalc(); formError(s.error); calcInfo.scrollIntoView({ block: 'center', behavior: smooth() }); return; }
    if (calcForm.invalid()) { formError(t('Температура й висота — числа')); return; }
    const v = calcForm.values(); const tC = v.temp ?? 15; const alt = v.alt ?? 0;
    const res = solve({ bc: s.c.bc, model: s.c.dragModel || 'G7', mv: s.mv, sh: s.sh ?? 6, zero: s.zero ?? 100, tC, alt, max: 700, step: 25 });
    if (!res) { formError(t('Куля не долітає до 700 м — перевірте BC і швидкість')); return; }
    if (!(Number(windForm.values().windSpeed) > 0)) windForm.inputs.windSpeed.value = '5';
    const ws = Number(windForm.values().windSpeed);
    rowsBox.replaceChildren();
    // Ближні 25 і 50 м — для AR з високим прицілом там помітний винос угору
    for (const dist of [25, 50, ...Array.from({ length: 13 }, (_, k) => 100 + k * 50)]) {
      const i = dist / 25 - 1; const mrad = Math.round(res.H[i] * 1000) / 1000 || 0; const wind = Math.round(res.W[i] * ws * 1000) / 1000;
      addRow(dist, toText(mrad, dist), toText(wind, dist), { v: mrad, w: wind });
    }
    setup = { zero: s.zero ?? 100, sh: s.sh ?? 6, mv: s.mv };
    f.inputs.condT.value = String(tC);
    f.inputs.condAlt.value = String(alt);
    if (!f.inputs.note.value.trim()) {
      f.inputs.note.value = [`${t('Розрахунок')}: ${calcText(s)}`, `${tC > 0 ? '+' : ''}${fmt.num(tC)} °C`, `${fmt.num(alt)} ${t('м')}`, forecastNote || null]
        .filter(Boolean).join(' · ');
    }
    calcPanel.hidden = true;
    toast(t('Розраховано рядків: {n} — перевірте й збережіть', { n: rowsBox.children.length }));
  };
  const calcPanel = h('div', { class: 'dope-paste', hidden: true }, calcInfo, calcForm.el, h('div', { class: 'btn-row' }, tripBtn), tripBox,
    btn(t('Заповнити рядки'), fillCalc, 'primary'), trajBox);
  f.inputs.cartridgeId.addEventListener('change', paintCalc);
  f.inputs.scopeId.addEventListener('change', paintCalc);
  const calcBtn = btn(t('Розрахувати'), () => {
    calcPanel.hidden = !calcPanel.hidden;
    paste.panel.hidden = true;
    paintCalc();
    if (!calcPanel.hidden) calcPanel.scrollIntoView({ block: 'nearest', behavior: smooth() });
  });
  const body = h('div', {}, f.el, h('h3', {}, t('Поправки')), units, unitHint, windForm.el,
    h('div', { class: 'dope-row dope-cols muted small' }, h('span', {}, t('Дистанція, м')), h('span', {}, t('Поправка')), h('span', {}, t('Вітер'))),
    rowsBox, h('div', { class: 'btn-row' }, btn(t('+ рядок'), () => addRow()), calcBtn, paste.button), calcPanel, paste.panel);
  drawUnits();
  const remove = d ? () => confirmSheet(t('Видалити таблицю?'), dopeTitle(w, d), t('Видалити'), async () => {
    close();
    const cur = findWeapon(w.id) ?? w;
    await saveEntity('weapons', { ...cur, dope: (cur.dope ?? []).filter((x) => x.id !== d.id) });
  }) : null;
  const close = sheet(d ? t('Таблиця поправок') : t('Нова таблиця поправок'), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
    tools: remove ? [toolBtn('delete', t('Видалити'), remove, 'danger')] : [],
  });
  async function save() {
    const raw = readRows().filter((r) => r.distance > 0 && r.value !== '');
    const notNumber = (text) => text !== '' && !Number.isFinite(Number(text.replace(',', '.')));
    if (raw.some((r) => notNumber(r.value) || notNumber(r.wind))) { formError(t('Поправка — число, наприклад 1,2 або -0,5')); return; }
    const byDistance = new Map(toMradRows(raw, unit).filter((r) => r.mrad !== null)
      .map(({ wind, ...r }) => [r.distance, wind > 0 ? { ...r, wind } : r]));
    const rows = [...byDistance.values()].sort((a, b) => a.distance - b.distance);
    if (!rows.length) { formError(t('Заповніть хоча б один рядок')); return; }
    const windSpeed = Number(windForm.values().windSpeed);
    if (rows.some((r) => r.wind) && !(windSpeed > 0)) {
      fieldError(windForm.inputs.windSpeed, t('Вкажіть, для якого вітру складена колонка'));
      return;
    }
    const v = f.values();
    if (Number.isNaN(v.condT) || Number.isNaN(v.condAlt)) { formError(t('Температура й висота таблиці — числа')); return; }
    const air = v.condT !== null ? { tC: v.condT, alt: v.condAlt ?? 0 } : null;
    const cond = air || setup ? { ...(air ?? {}), ...(setup ?? {}) } : null;
    const card = { id: d?.id ?? db.uid(), scopeId: v.scopeId || null, cartridgeId: v.cartridgeId || null, unit, note: v.note || null, rows,
      windSpeed: windSpeed > 0 ? windSpeed : null, ...(cond ? { cond } : {}) };
    const cur = findWeapon(w.id) ?? w;
    const list = cur.dope ?? [];
    close();
    await saveEntity('weapons', { ...cur, dope: d ? list.map((x) => (x.id === d.id ? card : x)) : [...list, card] });
  }
}

// ---------- дозвіл на зброю ----------

const DOC_ICON = '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>';
const PERMIT_FILL = { over: 'over', warn: 'warn', ok: '' };

/** Скільки лишилося словами: «1 р. 3 міс.», «3 міс.», менше місяця — у днях; прострочений — на скільки. */
function permitLeft(s) {
  const days = (n) => `${fmt.num(n)} ${plural(n, [t('день'), t('дні'), t('днів')])}`;
  if (s.days < 0) return t('прострочено на {n}', { n: days(-s.days) });
  if (!s.days) return t('сьогодні останній день');
  if (!s.months) return t('лишилося {n}', { n: days(s.days) });
  const [y, m] = [Math.floor(s.months / 12), s.months % 12];
  return t('лишилося {n}', { n: [y ? t('{n} р.', { n: y }) : null, m ? t('{n} міс.', { n: m }) : null].filter(Boolean).join(' ') });
}

/** Смужка строку дозволу: убуває до кінця строку; червона — менше місяця, жовта — до 3 місяців, зелена — від 3. */
function permitMeter(w, { inline = false } = {}) {
  const s = M.permitStatus(w.permit);
  if (!s) return null;
  return meter(h('span', {}, t('Дозвіл')), permitLeft(s), Math.max(4, s.left * 100), PERMIT_FILL[s.level], inline);
}

/** Стволи, у яких дозвіл скінчився або лишилося менше місяця, — найтерміновіші першими. */
const urgentPermits = () => state.weapons.filter((w) => !w.archived && M.permitStatus(w.permit)?.level === 'over')
  .sort((a, b) => M.permitStatus(a.permit).days - M.permitStatus(b.permit).days);

/** Над списком зброї: дозволи, що потребують уваги. */
function urgentPermitsBlock() {
  const urgent = urgentPermits();
  if (!urgent.length) return null;
  return h('div', { class: 'rows doc-urgent' }, urgent.map((w) => {
    const icon = h('span', { class: 'row-icon', 'aria-hidden': 'true' });
    icon.innerHTML = `<svg viewBox="0 0 24 24">${DOC_ICON}</svg>`;
    return h('button', { type: 'button', class: 'row', onclick: () => weaponDetail(w) },
      icon,
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, t('Дозвіл: {name}', { name: w.name })),
        h('span', { class: 'muted small' }, t('діє до {date}', { date: fmt.date(w.permit.expires) }))),
      h('span', { class: 'badge danger small' }, permitLeft(M.permitStatus(w.permit))));
  }));
}

/** Блок дозволу в картці зброї: номер і дати; скільки лишилося — на плашці над плитками, тут не повторюємо. */
function permitBox(w) {
  if (!w.permit) return null;
  const p = w.permit;
  return box(t('Дозвіл на зброю'),
    h('p', { class: 'muted small' }, [p.number ? `№ ${p.number}` : null, p.issued ? t('видано {date}', { date: fmt.date(p.issued) }) : null].filter(Boolean).join(' · ') || '—'),
    { fold: `permit:${w.id}`, summary: p.expires ? h('span', { class: 'box-sum' }, t('діє до {date}', { date: fmt.date(p.expires) })) : null });
}

/** Блок «Дозвіл на зброю» у формі зброї. */
function permitFields(w) {
  const p = w?.permit ?? {};
  const f = form([
    { name: 'number', label: t('Номер'), value: p.number, wide: true },
    { name: 'issued', label: t('Видано'), type: 'dmy', value: p.issued, half: true },
    { name: 'expires', label: t('Діє до'), type: 'dmy', value: p.expires, half: true },
  ]);
  // Дозвіл на зберігання видають на 3 роки — «діє до» з дати видачі одним натиском
  const plus3 = h('button', {
    type: 'button',
    onclick: () => {
      const issued = f.values().issued;
      if (!issued) { fieldError(f.inputs.issued, t('Спершу вкажіть дату видачі')); return; }
      const d = new Date(issued);
      d.setUTCFullYear(d.getUTCFullYear() + 3);
      f.inputs.expires.value = isoToDmy(d.toISOString().slice(0, 10));
    },
  }, t('+3 роки від видачі'));
  const toAll = toolBtn('copy', t('Ці дати — всім стволам'), () => permitDatesToAll(w, f.values()), 'small');
  const values = () => {
    const v = f.values();
    const permit = { number: v.number?.trim() || null, issued: v.issued || null, expires: v.expires || null };
    return { permit: permit.number || permit.issued || permit.expires ? permit : null };
  };
  const invalid = () => {
    const bad = f.invalid();
    if (bad) fieldError(f.inputs[bad.name], t('Дата «{label}» — у вигляді ДД.ММ.РРРР', { label: bad.label }));
    return Boolean(bad);
  };
  return { el: h('div', {}, f.el, h('div', { class: 'chips permit-quick' }, plus3)), tools: toAll, values, invalid };
}

/** Ті самі дати видачі й закінчення — решті стволів (номери в кожного свої, їх не чіпаємо). */
function permitDatesToAll(w, v) {
  if (Number.isNaN(v.issued) || Number.isNaN(v.expires)) { formError(t('Дата — у вигляді ДД.ММ.РРРР')); return; }
  if (!v.issued && !v.expires) { formError(t('Спершу вкажіть дати')); return; }
  const others = state.weapons.filter((x) => !x.archived && x.id !== w?.id);
  if (!others.length) { toast(t('Інших стволів немає')); return; }
  const dates = [v.issued ? t('видано {date}', { date: fmt.date(v.issued) }) : null,
    v.expires ? t('діє до {date}', { date: fmt.date(v.expires) }) : null].filter(Boolean).join(' · ');
  confirmSheet(t('Ці дати — всім стволам?'), `${dates}: ${others.map((x) => x.name).join(', ')}`, t('Проставити'), async () => {
    await db.write({
      weapons: {
        put: others.map((x) => ({
          ...x, permit: { number: x.permit?.number ?? null, issued: v.issued || null, expires: v.expires || null },
        })),
      },
    });
    await refresh();
    toast(t('Дати проставлено: {n}', { n: others.length }));
  });
}

// Габарити: довжини, ширина й висота — см, ствол — мм, вага — г
const SIZE_KEYS = ['length', 'lengthOpen', 'width', 'height', 'barrel', 'weight'];

/** Рядки «Габарити й вага» для картки та звіту; порожньо — нічого не вказали. */
function sizeRows(w) {
  const s = w.size;
  if (!s) return [];
  const cm = (v) => (v ? `${fmt.num(v)} ${t('см')}` : null);
  const weight = s.weight ? (s.weight >= 1000 ? `${fmt.num(s.weight / 1000)} ${t('кг')}` : `${fmt.num(s.weight)} ${t('г')}`) : null;
  return [
    cm(s.length) ? [t('Довжина'), cm(s.length)] : null,
    cm(s.lengthOpen) ? [t('Розкладений приклад'), cm(s.lengthOpen)] : null,
    cm(s.width) ? [t('Ширина'), cm(s.width)] : null,
    cm(s.height) ? [t('Висота'), cm(s.height)] : null,
    s.barrel ? [t('Довжина ствола'), `${fmt.num(s.barrel)} ${t('мм')} (${fmt.num(Math.round(s.barrel / 2.54) / 10)}″)`] : null,
    s.twist ? [t('Крок нарізів'), `${twistText(s.twist)} (${fmt.num(Math.round(s.twist * 25.4))} ${t('мм')})`] : null,
    weight ? [t('Вага'), weight] : null,
    weight && s.weightNote ? [t('Вага — з чим'), s.weightNote] : null,
  ].filter(Boolean);
}

const grams = (g) => (g >= 1000 ? `${fmt.num(Math.round(g / 10) / 100)} ${t('кг')}` : `${fmt.num(Math.round(g))} ${t('г')}`);

/** Приціл стоїть на стволі, поки його явно не зняли; тюнінг — навпаки, лише позначений (щоб ЗІП не рахувався). */
const scopeOn = (x) => x.on !== false;

/** Вага з обладнанням: ствол (з картки), основний приціл і тюнінг, що зараз стоїть (не проданий і не знятий). */
function weightParts(w) {
  const parts = [
    ...(w.scopes ?? []).filter((x) => scopeOn(x) && x.weight > 0).map((x) => [x.name, x.weight]),
    ...(w.mods ?? []).filter((m) => m.weight > 0 && !isSold(m) && m.on).map((m) => [m.name, m.weight]),
  ];
  const base = w.size?.weight ?? 0;
  return { base, parts, total: base + parts.reduce((x, [, g]) => x + g, 0) };
}

/** Габарити й вага в картці зброї — рядок характеристик під фото: підпис дрібно, значення крупно; з обладнанням — виділено. */
function sizeBox(w) {
  const wp = weightParts(w);
  const rows = sizeRows(w).filter(([k]) => k !== t('Вага — з чим'));
  if (!rows.length) return null;
  const short = { [t('Розкладений приклад')]: t('З прикладом'), [t('Довжина ствола')]: t('Ствол') };
  const cells = rows.map(([k, v]) => h('div', { class: 'spec' }, h('small', {}, short[k] ?? k), h('b', {}, v)));
  if (wp.parts.length && wp.base) cells.push(h('div', { class: 'spec accent', title: t('Ствол і все встановлене') }, h('small', {}, t('З обладнанням')), h('b', {}, grams(wp.total))));
  return h('div', { class: 'spec-strip' }, ...cells);
}

/** Поставити чи зняти тюнінг зі ствола — без форми правки. */
async function setModOn(w, m, on) {
  const cur = findWeapon(w.id);
  await saveEntity('weapons', { ...cur, mods: (cur.mods ?? []).map((x) => (x.id === m.id ? { ...x, on, off: undefined } : x)) });
}

/** Поставити чи зняти приціл — так само, як тюнінг. */
async function setScopeOn(w, sc, on) {
  const cur = findWeapon(w.id);
  await saveEntity('weapons', { ...cur, scopes: (cur.scopes ?? []).map((x) => (x.id === sc.id ? { ...x, on } : x)) });
}

/** Перемикач «стоїть на стволі»: у блоці «Встановлено» й у картці тюнінгу; scope — це приціл, а не тюнінг. */
function mountSwitch(w, m, label = true, scope = false) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: scope ? scopeOn(m) : !!m.on, 'aria-label': t('Стоїть на стволі: {n}', { n: m.name }),
    onchange: () => { vibrate(8); (scope ? setScopeOn : setModOn)(w, m, input.checked); } });
  return switchLabel(input, label ? t('Стоїть на стволі') : null);
}

/** Перемикач «стоїть / знято»: чекбокс із доріжкою й підписом (без підпису — назва в aria-label чекбокса). */
function switchLabel(input, text = null) {
  return h('label', { class: 'mount-sw' }, input, h('span', { class: 'mount-track', 'aria-hidden': 'true' }), text ? h('span', {}, text) : null);
}

/** Набір у записі стрільби: нинішня назва (перейменували — нова), видалений — назва, з якою записали. */
const setupLabel = (m, w) => (w?.setups ?? []).find((x) => x.id === m.setupId)?.name ?? m.setupName ?? '';

/** Правка набору в записі стрільби: набори ствола, видалений (з яким записали) або «—». */
function shotSetupSelect(m, w) {
  const list = w.setups ?? [];
  const gone = m.setupId && !list.some((x) => x.id === m.setupId) ? { id: m.setupId, name: m.setupName } : null;
  const all = [...list, ...(gone ? [gone] : [])];
  return h('select', {
    class: 'inline-select', 'aria-label': t('Набір'),
    onchange: (e) => {
      const s = all.find((x) => x.id === e.target.value);
      saveEntity('movements', { ...freshMovement(m), setupId: s?.id, setupName: s?.name });
    },
  }, h('option', { value: '' }, '—'),
  all.map((s) => h('option', { value: s.id, selected: s.id === m.setupId }, s.name)));
}

/*
 * Набори «Встановленого» (ближній бій, DMR…): w.setups = [{ id, name, on: [id прицілів і тюнінгу, що стоять], main }].
 * Тап — поставити набір: те, що в ньому, стоїть, решта знята; main — основний приціл (запис стрільби, пристрілка, DOPE).
 */
const setupOnIds = (w) => [...(w.scopes ?? []).filter(scopeOn).map((x) => x.id),
  ...(w.mods ?? []).filter((m) => !isSold(m) && m.on).map((m) => m.id)];
/** Основний приціл для набору: поточний основний, якщо стоїть, інакше перший, що стоїть. */
function mainScopeId(w) {
  const d = M.defaultScope(w);
  return d && scopeOn(d) ? d.id : (w.scopes ?? []).find(scopeOn)?.id ?? null;
}
/** На стволі зараз рівно цей набір (і основний приціл — його). */
function setupMatches(w, s) {
  const on = new Set(s.on);
  return (w.scopes ?? []).every((x) => scopeOn(x) === on.has(x.id))
    && (w.mods ?? []).filter((m) => !isSold(m)).every((m) => !!m.on === on.has(m.id))
    // основний приціл звіряємо, лише коли він стоїть: знятий «основний» — ще не вибір користувача
    // і лише коли він ще є: видалений приціл не має робити набір назавжди «чужим» (тап тоді лише ставив би його знову)
    && (!s.main || !on.has(s.main) || !(w.scopes ?? []).some((x) => x.id === s.main)
      || !M.defaultScope(w) || !scopeOn(M.defaultScope(w)) || M.defaultScope(w).id === s.main);
}
async function applySetup(w, s) {
  const cur = findWeapon(w.id);
  const on = new Set(s.on);
  const main = s.main && on.has(s.main) && (cur.scopes ?? []).some((x) => x.id === s.main) ? s.main : null;
  vibrate(8);
  await saveEntity('weapons', {
    ...cur,
    scopes: (cur.scopes ?? []).map((x) => ({ ...x, on: on.has(x.id), ...(main ? { default: x.id === main } : {}) })),
    mods: (cur.mods ?? []).map((m) => (isSold(m) ? m : { ...m, on: on.has(m.id), off: undefined })),
  });
  toast(t('Набір «{name}» на стволі', { name: s.name }));
}
const saveSetups = (w, setups) => saveEntity('weapons', { ...findWeapon(w.id), setups });

/** Новий набір із того, що стоїть зараз; або наявний — перейменувати, записати поточне, видалити. */
function setupForm(w, s = null) {
  const cur = findWeapon(w.id) ?? w;
  const items = [...(cur.scopes ?? []).filter(scopeOn), ...(cur.mods ?? []).filter((m) => !isSold(m) && m.on)].map((x) => x.name);
  const f = form([{ name: 'name', label: t('Назва набору'), required: true, value: s?.name, placeholder: t('Ближній бій, DMR, полювання…'), wide: true }]);
  const list = setups => setups.filter(Boolean);
  const save = async (capture) => {
    if (invalidField(f)) return;
    close();
    const now = findWeapon(w.id);
    const name = f.values().name.trim();
    const snap = { on: setupOnIds(now), main: mainScopeId(now) };
    const entry = s ? { ...s, name, ...(capture ? snap : {}) } : { id: db.uid(), name, ...snap };
    const all = now.setups ?? [];
    await saveSetups(w, s ? all.map((x) => (x.id === s.id ? entry : x)) : [...all, entry]);
  };
  // Новий набір, такий самий, як уже збережений, — попереджаємо (зберегти можна: назва може бути іншою)
  const twin = s ? null : (cur.setups ?? []).find((x) => setupMatches(cur, x));
  const close = sheet(s ? t('Набір «{name}»', { name: s.name }) : t('Зберегти набір'), h('div', {},
    twin ? h('p', { class: 'warn-text small' }, t('Такий самий набір уже є: «{name}»', { name: twin.name })) : null,
    h('p', { class: 'muted small' }, s
      ? t('«Записати поточне» — набір стане таким, як зараз на стволі: {list}', { list: items.join(', ') || t('нічого') })
      : t('У набір потрапить те, що зараз стоїть на стволі: {list}', { list: items.join(', ') || t('нічого') })),
    f.el), {
    tools: s ? [toolBtn('delete', t('Видалити'), () => {
      close();
      confirmSheet(t('Видалити набір?'), s.name, t('Видалити'), () => saveSetups(w, (findWeapon(w.id).setups ?? []).filter((x) => x.id !== s.id)));
    }, 'danger')] : [],
    actions: list([btn(t('Скасувати'), () => close()), s ? btn(t('Записати поточне'), () => save(true)) : null,
      btn(t('Зберегти'), () => save(false), 'primary')]),
  });
}

/** Усі набори ствола: тап — шторка набору (перейменувати, записати поточне, видалити). */
function setupsSheet(w) {
  const close = sheet(t('Набори'), h('div', { class: 'rows' }, (findWeapon(w.id)?.setups ?? []).map((s) => {
    const cur = findWeapon(w.id);
    const names = [...(cur.scopes ?? []), ...(cur.mods ?? [])].filter((x) => s.on.includes(x.id)).map((x) => x.name);
    return h('button', { type: 'button', class: 'row', onclick: () => { close(); setupForm(w, s); } },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, s.name),
        h('span', { class: 'muted small' }, names.join(', ') || t('нічого'))));
  })));
}

/** Ряд наборів над «Встановленим»: тап — поставити; тап по вибраному — змінити; «+» — запам'ятати поточне. */
function setupsRow(w) {
  const setups = w.setups ?? [];
  // Два набори з однаковим вмістом стоять обидва — підсвічені обидва, і тап по будь-якому відкриває його, а не «ставить» те, що вже стоїть
  return h('div', { class: 'setups' },
    h('div', { class: 'chips setup-chips' },
      setups.map((s) => {
        const on = setupMatches(w, s);
        return h('button', {
          type: 'button', class: on ? 'on' : '', 'aria-pressed': String(on),
          onclick: () => (on ? setupForm(w, s) : applySetup(w, s)),
        }, s.name);
      }),
      h('button', { type: 'button', class: setups.length ? 'setup-add' : 'setup-add first', onclick: () => setupForm(w) }, setups.length ? '+' : t('+ зберегти набір')),
      // Олівець — усі набори списком: змінити чи видалити будь-який, навіть той, що зараз не стоїть
      setups.length ? toolBtn('edit', t('Змінити набори'), () => setupsSheet(w), 'small setup-edit') : null),
    setups.length ? h('p', { class: 'muted small' }, t('Тап — поставити набір; тап по вибраному — перейменувати чи оновити')) : null);
}

/** Приціл без фото — квадрат зі значком сітки. */
function reticleThumb() {
  const el = h('span', { class: 'mount-thumb none', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6"/></svg>';
  return el;
}

/**
 * «На стволі»: що зараз стоїть — основний приціл і тюнінг (не проданий) з перемикачем «стоїть / знято» й вагою;
 * унизу — вага з обладнанням: ствол + усе, що стоїть.
 */
function mountBox(w) {
  const scopes = w.scopes ?? [];
  const onScopes = scopes.filter(scopeOn);
  const mods = (w.mods ?? []).filter((m) => !isSold(m));
  const onMods = mods.filter((m) => m.on);
  const wp = weightParts(w);
  // Без фото — квадрат 36 px (у прицілу — значок сітки), а не клас empty: той — для порожніх екранів, із полями на пів екрана
  const blank = (ico = null) => { const el = h('span', { class: 'mount-thumb none', 'aria-hidden': 'true' }); if (ico) el.innerHTML = ico; return el; };
  const row = (thumb, name, sub, g, sw) => h('div', { class: 'mount-row' },
    thumb ?? blank(), h('span', { class: 'mount-name' }, name, sub ? h('small', {}, sub) : null),
    h('b', { class: 'mount-g' }, g ? grams(g) : ''), sw);
  const list = h('div', { class: 'mount-list' },
    ...onScopes.map((x) => {
      const r = row(photoThumb(scopePhoto(x.id)) ?? reticleThumb(), x.name, t('приціл'), x.weight, mountSwitch(w, x, false, true));
      r.querySelector('.mount-name').addEventListener('click', () => scopeDetail(w, x));
      return r;
    }),
    ...onMods.map((m) => {
      const r = row(photoThumb(modPhoto(m.id)), m.name, null, m.weight, mountSwitch(w, m, false));
      r.querySelector('.mount-name').addEventListener('click', () => modDetail(w, m));
      return r;
    }));
  const total = wp.parts.length ? h('div', { class: 'weight-comp' },
    wp.base ? h('div', {}, h('span', {}, t('Ствол') + (w.size?.weightNote ? ` (${w.size.weightNote})` : '')), h('b', {}, grams(wp.base))) : null,
    // Без ваги ствола проміжний рядок дублював би підсумок
    wp.base ? h('div', {}, h('span', {}, t('Обладнання')), h('b', {}, grams(wp.total - wp.base))) : null,
    h('div', { class: 'wc-total' }, h('span', {}, wp.base ? t('Вага з обладнанням') : t('Обладнання')), h('b', {}, grams(wp.total)))) : null;
  // «Встановити»: тюнінг цього ствола, що зараз не стоїть, — тапом; або новий одразу встановленим
  const add = () => {
    const freeScopes = scopes.filter((x) => !scopeOn(x));
    const free = mods.filter((m) => !m.on);
    const pick = (thumb, name, sub, g, put) => {
      const r = row(thumb, name, sub, g, null);
      r.classList.add('pick');
      r.addEventListener('click', async () => { close(); vibrate(8); await put(); });
      return r;
    };
    const close = sheet(t('Встановити на ствол'), h('div', { class: 'mount-pick' },
      ...twinHints(w, () => close()),
      freeScopes.length || free.length ? h('div', { class: 'mount-list' },
        ...freeScopes.map((x) => pick(photoThumb(scopePhoto(x.id)) ?? reticleThumb(), x.name, x.weight ? t('приціл') : `${t('приціл')} · ${t('вага не вказана')}`, x.weight, () => setScopeOn(w, x, true))),
        ...free.map((m) => pick(photoThumb(modPhoto(m.id)), m.name, m.weight ? null : t('вага не вказана'), m.weight, () => setModOn(w, m, true))))
        : h('p', { class: 'muted' }, t('Усе вже стоїть — додайте новий тюнінг.')),
      btn(t('+ новий тюнінг'), () => { close(); modForm(w, null, { preset: { on: true } }); }, 'mini')));
  };
  const on = onScopes.length + onMods.length;
  const active = (w.setups ?? []).find((s) => setupMatches(w, s));
  return box(t('Встановлено'), h('div', {},
    ...twinHints(w),
    scopes.length || mods.length ? setupsRow(w) : null,
    on ? list : h('p', { class: 'muted small' }, t('Поки нічого не позначено — додайте, що стоїть на стволі: ліхтар, руків’я, ДТК…')),
    total,
    h('div', { class: 'btn-row' }, btn(t('+ встановити'), add, 'mini'))), {
    fold: `mount:${w.id}`, count: on || null,
    summary: wp.parts.length || active ? h('span', { class: 'box-sum' }, [active?.name, wp.parts.length ? grams(wp.total) : null].filter(Boolean).join(' · ')) : null,
  });
}

/** Блок «Габарити й вага» у формі зброї. */
function sizeFields(w) {
  const s = w?.size ?? {};
  const num = (name, label, half = true) => ({ name, label, type: 'number', step: 'any', min: 0, value: s[name], half });
  const f = form([
    num('length', t('Довжина, см')),
    num('lengthOpen', t('Розкладений приклад, см')),
    num('width', t('Ширина, см')),
    num('height', t('Висота, см')),
    num('barrel', t('Довжина ствола, мм')),
    { name: 'twist', label: t('Крок нарізів'), value: s.twist ? `1:${fmt.num(s.twist)}` : '', placeholder: '1:8', half: true },
    num('weight', t('Вага, г')),
    { name: 'weightNote', label: t('Вага — з чим'), value: s.weightNote, placeholder: t('З колліматором, з набоями…'), wide: true },
  ]);
  const values = () => {
    const v = f.values();
    const size = Object.fromEntries(SIZE_KEYS.map((k) => [k, v[k] > 0 ? v[k] : null]));
    size.twist = parseTwist(v.twist);
    size.weightNote = v.weightNote || null;
    return { size: Object.values(size).some(Boolean) ? size : null };
  };
  const invalid = () => {
    const bad = f.invalid();
    if (bad) fieldError(f.inputs[bad.name], t('«{label}» — число', { label: bad.label }));
    else if (f.values().twist && !parseTwist(f.values().twist)) fieldError(f.inputs.twist, t('Крок нарізів — дюймів на оберт, як на стволі: 1:7, 1:8, 1:10'));
    else return false;
    return true;
  };
  return { el: f.el, values, invalid };
}

/** «Показати» з нагадування: список зброї, прокрутка до картки ствола id і підсвітка. */
function showWeapon(id) {
  if (gunsSeg !== 'guns') { gunsSeg = 'guns'; remember('shooters-log:guns-seg', 'guns'); if (tab === 'guns') render(); }
  goTab('#guns');
  reveal(id);
}

/** Раз на день при відкритті: дозволи, що скінчилися або лишилося менше місяця. Плашка вже на екрані — тост не потрібен. */
function permitsReminder() {
  const urgent = urgentPermits();
  if (!urgent.length || recall('shooters-log:docs-reminded') === M.today()) return false;
  remember('shooters-log:docs-reminded', M.today());
  if (tab === 'guns' && gunsSeg === 'guns') return false;
  toast(t('Дозвіл на зброю: {names}', { names: urgent.map((w) => w.name).join(', ') }), {
    action: t('Показати'),
    onAction: () => showWeapon(urgent[0].id),
    reminder: true,
  });
  return true;
}

// ---------- журнал ----------

const KIND_ICON = {
  buy: '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  // Пробоїна в мішені — не перехрестя: воно в застосунку про прицілювання
  shot: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="14.2" cy="9.8" r="1.6" fill="currentColor" stroke="none"/>',
  // Купчастість: три пробоїни купкою в центрі мішені
  group: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><g fill="currentColor" stroke="none"><circle cx="10.6" cy="10.9" r="1.45"/><circle cx="13.6" cy="11.3" r="1.45"/><circle cx="11.9" cy="14" r="1.45"/></g>',
  // Набій і велика лійка з порохом: споряджено власноруч.
  reload: '<path d="M2.5 21V11l.8-1.5V7c0-1.4.6-2.8 1.2-3.5.6.7 1.2 2.1 1.2 3.5v2.5l.8 1.5v10z"/><path d="M2.5 14h4"/><path d="M9.5 3h13l-5 6v4.5h-3V9z"/><path d="M16 16.8h0M16 20.3h0"/>',
  consume: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M9 12h6"/>',
  // Стрілки вгору-вниз: залишок поправили — олівець лишається за дією «Змінити»
  adjust: '<path d="M8 20V4M4.5 7.5 8 4l3.5 3.5M16 4v16M12.5 16.5 16 20l3.5-3.5"/>',
  // Крапля мастила над лінією ствола: чистка — це догляд, а не прибирання.
  // Гільза й стрілка вниз: зібране повертається на склад.
  collect: '<path d="M6 21v-9l.8-1.6V8c0-1.3.5-2.5 1.2-3.2.7.7 1.2 1.9 1.2 3.2v2.4L10 12v9z"/><path d="M17 4v9M13.5 9.5 17 13l3.5-3.5M14 18h6"/>',
  // Мішень із пробоїною й іскрою — свайп «відстріляти» на набої
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><g class="hit"><circle cx="15.6" cy="8.6" r="1.7" fill="currentColor" stroke="none"/><path d="M15.6 4.6v1.1M19.6 8.6h-1.1M18.5 5.7l-.8.8"/></g>',
  clean: '<path d="M4 17.5h16"/><path d="M12 4c2.2 2.8 3.4 4.8 3.4 6.4a3.4 3.4 0 0 1-6.8 0C8.6 8.8 9.8 6.8 12 4z"/>',
};

/** Підпис під карткою, що свайпається: іконка того руху, що з'явиться в журналі, — з боку, звідки тягнуть. */
function swipeLabel(kind, label, side = 'right') {
  const ico = h('span', { class: 'swipe-ico', 'aria-hidden': 'true' });
  ico.innerHTML = `<svg viewBox="0 0 24 24">${KIND_ICON[kind]}</svg>`;
  return side === 'left' ? [label, ico] : [ico, label];
}

// Значок руху розбирається з тексту один раз, далі — копія: у журналі їх сотні
const kindIconTpl = {};
function kindIcon(kind) {
  if (!kindIconTpl[kind]) {
    const el = h('span', { class: 'row-icon', 'aria-hidden': 'true' });
    el.innerHTML = KIND_ICON[kind] ? `<svg viewBox="0 0 24 24">${KIND_ICON[kind]}</svg>` : '•';
    kindIconTpl[kind] = el;
  }
  return kindIconTpl[kind].cloneNode(true);
}

function movementTitle(m) {
  if (m.kind === 'clean') return findWeapon(m.weaponId)?.name ?? t('(видалено)');
  return findCartridge(m.cartridgeId)?.name ?? findComponent(m.componentId)?.name ?? m.caliber ?? '—';
}

/**
 * Рядок руху. date — дата заголовком (у картках; у Журналі дата в заголовку групи), а тип руху
 * видно з іконки. day — число й місяць на початку рядка (Журнал по тижнях, місяцях, роках).
 * skip.weapon / skip.cartridge — не повторювати ствол чи набій картки.
 */
function logRow(m, { date = false, day = false, skip = {} } = {}) {
  const money = m.kind === 'shot' ? M.shotCost(state, m) : m.price;
  const gun = m.kind === 'clean' || skip.weapon ? null : shotGun(m);
  // У картці набій — поруч із датою в заголовку; стрільба без набою з БК — калібр і чому без списання.
  const name = date && m.kind !== 'clean' && !(skip.cartridge && m.cartridgeId) && !(skip.component && m.componentId) ? movementTitle(m) : null;
  // Витрата компонента — на який рецепт пішла.
  const forRecipe = m.kind === 'consume' && m.recipeId ? state.recipes.find((r) => r.id === m.recipeId)?.name : null;
  const noStock = date && m.kind === 'shot' && !m.cartridgeId && !m.foreignAmmo ? t('без списання з БК') : null;
  const title = date ? [fmt.date(m.date), name].filter(Boolean).join(' · ') : movementTitle(m);
  const each = buyUnitPrice(m);
  // Скільки мішеней прив'язано до цієї стрільби — інакше про них видно лише в картці.
  const targets = m.kind === 'shot' ? state.targets.filter((x) => x.movementId === m.id).length : 0;
  // Стрільба, записана з результату вправи: видно, що це тренування, а не просто настріл.
  const score = m.kind === 'shot' ? state.scores.find((x) => x.movementId === m.id) : null;
  const fromExercise = score ? t('вправа: {name}', { name: exerciseName(score.exercise) ?? '—' }) : null;
  // Вправу виділяємо жирним — у списку одразу видно, що стрільба з тренування.
  const rest = [forRecipe, fromExercise ? h('b', { class: 'row-ex' }, fromExercise) : null,
    m.foreignAmmo ? t('чужі набої') : noStock,
    fromExercise || (m.foreignAmmo && m.note === t('чужі набої')) ? null : m.note, money ? fmt.money(money) + usdTail([[money, dayOf(m), m.usdRate]]) : null,
    each ? t('{price} за {unit}', { price: fmt.money(each), unit: m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : 'шт' }) : null];
  // Ствол і приціл — кожен своїм рядком: «ствол (приціл) · вправа · …» в одному рядку на телефоні рвався посеред назви.
  const lines = [[day && m.date ? h('b', { class: 'row-day' }, fmt.date(m.date).slice(0, 5)) : null, date ? null : t(M.KINDS[m.kind]), gun?.name],
    // У картці набою приціл щоразу той самий — лише зайвий рядок.
    [skip.cartridge ? null : gun?.scope, m.kind === 'shot' ? gearText(m) || null : null], rest]
    .map((line) => line.filter(Boolean))
    .filter((line) => line.length)
    .map((line) => h('span', { class: 'muted small' }, line.flatMap((p, i) => (i ? [' · ', p] : [p]))));
  const unit = m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : '';
  return h('button', { type: 'button', class: `row kind-${m.kind}`, 'data-id': m.id, onclick: () => movementDetail(m) },
    kindIcon(m.kind),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), ...lines),
    m.kind === 'clean' ? null : h('span', { class: 'row-side' },
      h('span', { class: `row-qty ${m.qty < 0 ? 'neg' : m.qty > 0 ? 'pos' : ''}` }, `${fmt.signed(m.qty)}${unit ? ` ${unit}` : ''}`),
      // Значок мішені з числом: у будь-якому списку стрільб видно, що її вже розібрано по фото.
      targets ? h('span', { class: 'row-targets small muted', title: t('мішеней: {n}', { n: targets }) },
        targetIco(), fmt.num(targets)) : null));
}

// Свіжий запис зі стану: після зміни ствола шторка тримає старий об'єкт.
const freshMovement = (m) => state.movements.find((x) => x.id === m.id) ?? m;

/**
 * Ствол у записі стрільби можна змінити — так історичний настріл розноситься по зброї.
 * Прицел при цьому стає прицелом нового ствола за замовчуванням.
 */
function shotWeaponSelect(m, onChange) {
  const guns = caliberOptions(state.weapons.filter((w) => w.id === m.weaponId || !w.archived), m.caliber);
  const select = h('select', {
    class: 'inline-select', 'aria-label': t('Зброя'),
    onchange: async (e) => {
      const foreignWeapon = e.target.value === FOREIGN;
      const weaponId = foreignWeapon ? null : e.target.value || null;
      const { foreignWeapon: _old, foreignWeaponName: _name, ...rest } = freshMovement(m);
      await saveEntity('movements', { ...rest, weaponId, scopeId: M.defaultScope(findWeapon(weaponId))?.id ?? null, ...(foreignWeapon ? { foreignWeapon } : {}) });
      onChange?.();
    },
  }, selectOptions([...guns.options, [FOREIGN, t('Чужа зброя')], ['', t('— не вказувати —')]], m.foreignWeapon ? FOREIGN : m.weaponId ?? ''));
  const wrap = h('div', {}, select);
  chipPicker(select, { seg: false, cls: 'check' });
  return wrap;
}

/** Набій у записі стрільби можна змінити: калібр і вартість — від нового набою, залишки перерахуються самі. */
function shotCartridgeSelect(m) {
  const w = findWeapon(m.weaponId);
  const own = caliberOptions(state.cartridges.filter((c) => c.id === m.cartridgeId || !c.archived), w?.caliber ?? m.caliber);
  return inlinePicker(h('select', {
    class: 'inline-select', 'aria-label': t('Набій'),
    onchange: async (e) => {
      const c = findCartridge(e.target.value);
      const { foreignAmmo: _foreign, price: _price, ...rest } = freshMovement(m);
      // Стара вартість належала іншому набою — рахуємо за поточною середньою ціною нового.
      const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
      const shot = {
        ...rest, cartridgeId: c?.id ?? null, caliber: c?.caliber ?? rest.caliber,
        ...(unit ? { price: +(unit * -rest.qty).toFixed(2) } : {}),
        ...(e.target.value === FOREIGN ? { foreignAmmo: true } : {}),
      };
      // Зібрані гільзи — від того набою, яким стріляли: інакше вони лишились би на складі старого калібру
      const to = c ? cartridgeCaseTarget(c) : null;
      const collects = to && rest.batch
        ? state.movements.filter((x) => x.batch === rest.batch && x.kind === 'collect' && x.componentId !== to.id) : [];
      if (!collects.length) { await saveEntity('movements', shot); return; }
      const own = caseComponent(to);
      await db.write({ movements: { put: [shot, ...collects.map((x) => ({ ...x, componentId: own.id }))] }, ...own.extra });
      await refresh();
      confirmed([shot.id]);
    },
  }, selectOptions([['', t('— без списання з БК —')], [FOREIGN, t('Чужі набої')], ...own.options],
    m.cartridgeId ?? (m.foreignAmmo ? FOREIGN : ''))),
  (s) => ammoPicker(s, w?.caliber ?? m.caliber));
}

/** Інший набій для покупки чи перерахунку: залишки переходять на нього, сума покупки лишається як заплатили. */
function movementCartridgeSelect(m) {
  const own = caliberOptions(state.cartridges.filter((c) => c.id === m.cartridgeId || !c.archived), m.caliber);
  return inlinePicker(h('select', {
    class: 'inline-select', 'aria-label': t('Набій'),
    onchange: async (e) => {
      const c = findCartridge(e.target.value);
      if (c) await saveEntity('movements', { ...freshMovement(m), cartridgeId: c.id, caliber: c.caliber });
    },
  }, selectOptions(own.options, m.cartridgeId)),
  (s) => ammoPicker(s, m.caliber));
}

function shotScopeSelect(m) {
  const w = findWeapon(m.weaponId);
  return inlinePicker(h('select', {
    class: 'inline-select', 'aria-label': t('Приціл'),
    onchange: async (e) => {
      await saveEntity('movements', { ...freshMovement(m), scopeId: e.target.value || null });
    },
  }, selectOptions(scopeOptions(w), m.scopeId ?? '')),
  (s) => scopePicker(s, () => w));
}

/** Мішень на кнопці: ті самі кола, що й на вкладці «Полігон». */
/** Значок: дистанція пристрілки — перехрестя в колі. */
function zeroIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>';
  return el;
}

/** Значок: ціна клацання — барабан прицілу з рискою. */
function clickIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 5.5V2M15.5 3.4l1.4-2.4M8.5 3.4 7.1 1M12 12l3-3"/></svg>';
  return el;
}

/** Значок «є ще приціли»: два кільця одне за одним — як стос однакових речей. */
function scopeIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="15" r="5.5"/><circle cx="15" cy="9" r="5.5"/></svg>';
  return el;
}

function targetIco() {
  const el = h('span', { class: 'btn-ico', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
  return el;
}

/** Мішені запису стрільби: кожна відкривається, «+» додає ще одну (100 і 300 м за одну стрільбу тощо). */
function shotTargets(m, closeSheet) {
  return targetsBlock(state.targets.filter((x) => x.movementId === m.id), { movement: m }, closeSheet);
}

/** Мішені результату вправи, коли набої не списували: запису стрільби немає, тож мішень тримається за сам результат. */
function scoreTargets(score, closeSheet) {
  return targetsBlock(state.targets.filter((x) => x.scoreId === score.id), { score }, closeSheet);
}

function targetsBlock(targets, prefill, closeSheet) {
  const list = [...targets].sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  return h('div', {},
    list.length ? box(t('Мішені'), h('div', { class: 'rows' }, list.map((tg) => targetRow(tg, closeSheet)))) : null,
    h('div', { class: 'btn-row' }, btn([targetIco(), list.length ? t('+ ще мішень') : t('+ Мішень')], () => {
      closeSheet();
      newTarget(prefill);
    })));
}

function movementDetail(m) {
  // Спершу перегляд: правка вмикається олівцем, щоб тап по запису нічого не зачепив.
  let edit = false;
  // Шторка живе: після кожної правки тіло перемальовується, тож похідні рядки (ціна за шт, вартість) не брешуть.
  const body = () => { const cur = state.movements.find((x) => x.id === m.id); return cur ? movementBody(cur, () => close(), edit) : null; };
  const pencil = toolBtn('edit', t('Змінити'), () => {
    edit = !edit;
    pencil.classList.toggle('on', edit);
    refreshSheets();
  });
  const del = toolBtn('delete', t('Видалити запис'), () => {
    // Свіжий запис: пачка могла з'явитися вже в цій шторці (гільзи, додані з правки)
    const cur = freshMovement(m);
    // Зібрані гільзи помилково вписали — прибирається лише цей рух; стрільба (і спорядження зі списанням) — разом із пачкою
    const batch = cur.batch && cur.kind !== 'collect' ? state.movements.filter((x) => x.batch === cur.batch) : [cur];
    close();
    confirmSheet(t('Видалити запис?'), batch.length > 1 ? t('Разом із пов’язаними рухами ({n}).', { n: batch.length }) : t('Залишки й настріл перерахуються.'), t('Видалити'), async () => {
      await db.write({ movements: { del: batch.map((x) => x.id) } });
      await refresh();
      confirmed();
      setUndo(t('Запис видалено'), async () => { await db.write({ movements: { put: batch } }); await refresh(); });
    });
  }, 'danger');
  const close = sheet(t(M.KINDS[m.kind]), body(), { live: body, tools: [pencil, del] });
}

/** Усе про рух і вся його правка в одному місці: кожне поле зберігається на зміну. */
function movementBody(m, close, edit = false) {
  const batch = m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
  const w = findWeapon(m.weaponId);
  const save = (fields) => saveEntity('movements', { ...freshMovement(m), ...fields });
  const input = (attrs, onSave) => h('input', {
    class: 'inline-select', autocomplete: 'off', ...attrs,
    onchange: (e) => onSave(e.target.value.trim()),
  });
  // Пачку зі списанням компонентів звичайним полем кількості не правлять: спорядження перераховується
  // окремо (resizeReload), а зібрані гільзи — окремий рух у пачці стрільби, кількість і стрільби, і збору правиться.
  const linked = batch.filter((x) => x.id !== m.id);
  const editQty = m.kind !== 'clean' && (m.kind === 'collect' || linked.every((x) => x.kind === 'collect'));
  const editPrice = m.kind === 'buy' || Number(m.price) > 0;
  const dateInput = input({ type: 'date', value: m.date ?? M.today(), 'aria-label': t('Дата') }, async (v) => {
    if (!v) { dateInput.value = m.date ?? M.today(); return; }
    // Дата спільна для пачки: зібрані гільзи й списані компоненти — того ж дня, що стрільба чи спорядження
    const same = m.kind === 'collect' ? [] : linked;
    await db.write({ movements: { put: [{ ...freshMovement(m), date: v }, ...same.map((x) => ({ ...x, date: v }))] } });
    await refresh();
    confirmed([m.id]);
  });
  const qtyInput = h('input', {
    class: 'inline-select', type: 'number', step: 'any', min: 0, inputmode: 'decimal', autocomplete: 'off', 'aria-label': t('Кількість'),
    // Нуль або сміття замість кількості — просто повертаємо попереднє: рух без кількості не має сенсу.
    onchange: (e) => {
      const n = Math.abs(Number(e.target.value.replace(',', '.')));
      if (!n) { e.target.value = Math.abs(m.qty); return; }
      // Вартість стрільби збережена сумою — інакше 100 пострілів лишилися б за ціною 10
      const repriced = m.kind === 'shot' && Number(m.price) > 0 ? { price: +((m.price * n) / Math.abs(m.qty)).toFixed(2) } : {};
      save({ qty: n * (m.qty < 0 ? -1 : 1), ...repriced });
    },
  });
  qtyInput.value = Math.abs(m.qty);
  const priceInput = input({ type: 'number', step: 'any', min: 0, inputmode: 'decimal', value: m.price ?? '', 'aria-label': t('Сума') },
    (v) => save({ price: v ? Number(v.replace(',', '.')) : undefined }));
  // Свій курс $ — лише в покупці: спорядження й стрільба рахуються з неї
  const rateInput = m.kind === 'buy' && usdOn() ? input({ type: 'number', step: 'any', min: 0, inputmode: 'decimal', value: m.usdRate ?? '', 'aria-label': t('Курс $, грн') },
    (v) => save({ usdRate: Number(v.replace(',', '.')) > 0 ? Number(v.replace(',', '.')) : undefined })) : null;
  const noteInput = input({ type: 'text', value: m.note ?? '', placeholder: t('Примітка'), 'aria-label': t('Примітка') },
    (v) => save({ note: v || undefined }));
  const shotCost = M.shotCost(state, m);
  // Набій у покупці й перерахунку можна змінити; спорядження прив'язане до рецепта й списаних компонентів
  const swapCartridge = Boolean(m.cartridgeId) && (m.kind === 'buy' || m.kind === 'adjust') && !linked.length;
  const kv = (...pairs) => h('dl', { class: 'kv' }, pairs);
  const row = (label, value) => [h('dt', {}, t(label)), h('dd', {}, value)];
  // Головне значення блоку — без підпису: заголовок блоку вже каже, що це
  const lead = (value, ...pairs) => [h('div', { class: 'kv-lead' }, value), pairs.some(Boolean) ? kv(...pairs) : null];
  if (m.kind === 'buy' || m.kind === 'reload') return stockMoveBody(m, { edit, linked, editQty, editPrice, swapCartridge, dateInput, qtyInput, priceInput, rateInput, noteInput, kv, row, lead });
  if (m.kind === 'shot') {
    const n = Math.abs(m.qty);
    const ammo = findCartridge(m.cartridgeId);
    // Стрільба з результату вправи — як у журналі, назва вправи жирним
    const score = state.scores.find((x) => x.movementId === m.id);
    // Гільзи, не вписані під час запису, додаються з правки — так само окремим рухом у пачці стрільби
    const caseTo = edit && !linked.some((x) => x.kind === 'collect') ? cartridgeCaseTarget(ammo) : null;
    const collectRow = caseTo ? [h('dt', {}, t('Зібрані гільзи')), h('dd', {},
      h('input', {
        class: 'inline-select', type: 'number', min: 0, step: 1, inputmode: 'numeric', autocomplete: 'off',
        placeholder: t('якщо зібрано'), 'aria-label': t('Зібрано гільз → «{name}»', { name: caseTo.name }),
        onchange: (e) => {
          const qty = Math.round(Number(e.target.value.replace(',', '.')));
          if (qty > 0) addCollected(freshMovement(m), { component: caseTo, qty });
        },
      }),
      h('div', { class: 'muted small' }, `→ «${caseTo.name}»`))] : null;
    return h('div', {},
      edit ? null : h('div', { class: 'stats even' },
        stat(t('пострілів'), fmt.num(n), 'accent'),
        shotCost ? stat(t('вартість'), tileMoney(shotCost, usdSum([[shotCost, dayOf(m)]]))) : null,
        shotCost && n ? stat(t('за постріл'), tileMoney(shotCost / n, usdSum([[shotCost / n, dayOf(m)]]))) : null),
      score || edit ? box(t('Запис'), kv(
        // Тап — картка результату вправи поверх картки стрільби
        score ? row('Вправа', h('button', { type: 'button', class: 'link-btn', onclick: () => openScore(score, exerciseCtx()) },
          h('b', {}, exerciseName(score.exercise) ?? '—'), ` · ${fmt.num(score.score)}`)) : null,
        edit ? row('Кількість', editQty ? qtyInput : fmt.num(n)) : null,
        edit && editPrice ? row('Вартість', priceInput) : null)) : null,
      box(t('Зброя'), lead(
        edit ? shotWeaponSelect(m) : (w?.name ?? (m.foreignWeapon ? t('Чужа зброя') : '—')),
        m.foreignWeapon ? row('Яка', edit
          ? [input({ type: 'text', value: m.foreignWeaponName ?? '', list: 'foreign-list', placeholder: t('АКМ'), 'aria-label': t('Яка зброя') },
            (v) => save({ foreignWeaponName: v || undefined })), foreignList()]
          : (m.foreignWeaponName || '—')) : null,
        w?.scopes?.length ? row('Приціл', edit ? shotScopeSelect(m) : (w.scopes.find((sc) => sc.id === m.scopeId)?.name ?? '—')) : null,
        m.kind === 'shot' && w && (w.setups?.length || m.setupName) ? row('Набір', edit ? shotSetupSelect(m, w) : setupLabel(m, w) || '—') : null,
        // Глушник і сошки в стрільбі більше не питаємо; записане раніше — лише показуємо
        w && gearText(m) ? row('Як стріляли', gearText(m)) : null)),
      box(t('Набої'), h('div', {},
        lead(
          edit ? shotCartridgeSelect(m)
            : ammo ? h('span', { class: 'ammo-name' }, cartridgeIcon(ammo.caliber), ammo.name)
              : (m.foreignAmmo ? t('Чужі набої') : t('без списання з БК')),
          m.caliber ? row('Калібр', m.caliber) : null,
          collectRow),
        // Калібр запису не той, що в ствола — рядок видно й у перегляді, й у правці
        caliberMismatch({ caliber: ammo?.caliber ?? m.caliber }, w)
          ? h('div', { class: 'caliber-warn small', role: 'alert' }, caliberMismatch({ caliber: ammo?.caliber ?? m.caliber }, w)) : null,
        m.cartridgeId ? null : h('p', { class: 'muted small' }, m.foreignAmmo
          ? t('Чужі набої: склад БК не змінюється, постріли йдуть у настріл.')
          : t('Запис без списання з БК — враховується лише в настрілі.')))),
      edit ? whenEditBlock(m, linked) : whereWhenView(m, { lead: m.note || null }),
      shotTargets(m, close),
      linked.length ? box(t('Зібрані гільзи'), h('div', { class: 'rows' }, linked.map((x) => logRow(x)))) : null);
  }
  return h('div', {},
    h('dl', { class: 'kv' },
      h('dt', {}, t('Дата')), h('dd', {}, edit ? dateInput : fmt.date(m.date)),
      [h('dt', {}, t('Позиція')), h('dd', {}, edit && swapCartridge ? movementCartridgeSelect(m) : movementTitle(m))],
      m.caliber ? [h('dt', {}, t('Калібр')), h('dd', {}, m.caliber)] : null,
      m.kind === 'clean' ? null : [h('dt', {}, t('Кількість')), h('dd', {}, edit && editQty ? qtyInput : fmt.signed(m.qty))],
      w && m.kind !== 'clean' ? [h('dt', {}, t('Зброя')), h('dd', {}, w.name)] : null,
      editPrice ? [h('dt', {}, t('Сума')), h('dd', {}, edit ? priceInput : (m.price ? fmt.money(m.price) + usdTail([[m.price, dayOf(m), m.usdRate]]) : '—'))] : null,
      buyUnitPrice(m) ? [h('dt', {}, t('Ціна за шт')), h('dd', {}, fmt.money(buyUnitPrice(m)))] : null,
      ...(edit || m.note ? [h('dt', {}, t('Примітка')), h('dd', {}, edit ? noteInput : m.note)] : [])),
    linked.length ? box(m.kind === 'collect' ? t('Стрільба') : t('Списано компонентів'),
      h('div', { class: 'rows' }, linked.map((x) => logRow(x)))) : null);
}

/**
 * Картка покупки й спорядження: плитки «скільки · сума · за одиницю», блоки Запис і Набої / Компонент;
 * назва й рецепт — посилання на їхні картки, внизу — списані на спорядження компоненти.
 */
function stockMoveBody(m, { edit, linked, editQty, editPrice, swapCartridge, dateInput, qtyInput, priceInput, rateInput, noteInput, kv, row, lead }) {
  const ammo = findCartridge(m.cartridgeId);
  const part = ammo ? null : findComponent(m.componentId);
  const recipe = m.kind === 'reload' ? findRecipe(m.recipeId) : null;
  const unit = part?.unit || t('шт');
  const n = Math.abs(m.qty);
  const price = Number(m.price) > 0 ? Number(m.price) : null;
  const stock = ammo ? M.cartridgeStock(state, ammo.id) : part ? M.componentStock(state, part.id) : null;
  const name = ammo ? h('span', { class: 'ammo-name' }, cartridgeIcon(ammo.caliber), ammo.name) : (part?.name ?? movementTitle(m));
  const open = ammo ? () => cartridgeDetail(ammo) : part ? () => componentDetail(part) : null;
  const link = (label, onclick) => h('button', { type: 'button', class: 'link-btn', onclick }, label);
  // Кількість спорядження правиться разом зі списаними компонентами й собівартістю
  const reloadQty = edit && m.kind === 'reload' ? h('input', {
    class: 'inline-select', type: 'number', step: 1, min: 1, inputmode: 'numeric', autocomplete: 'off', value: n, 'aria-label': t('Кількість'),
    onchange: (e) => {
      const qty = Math.round(Number(e.target.value.replace(',', '.')));
      if (!(qty > 0) || qty === n) { e.target.value = n; return; }
      resizeReload(m, linked, qty);
    },
  }) : null;
  return h('div', {},
    edit ? null : h('div', { class: 'stats even' },
      stat(t(m.kind === 'buy' ? 'куплено' : 'споряджено'), h('span', { class: 'nw' }, fmt.num(n), h('small', { class: 'unit' }, ` ${unit}`)), 'accent'),
      price ? stat(t(m.kind === 'buy' ? 'вартість' : 'собівартість'), tileMoney(price, usdSum([[price, dayOf(m), m.usdRate]]))) : null,
      price && n ? stat(t('за {unit}', { unit }), tileMoney(price / n, usdSum([[price / n, dayOf(m), m.usdRate]]))) : null),
    box(t('Запис'), kv(
      row('Дата', edit ? dateInput : fmt.date(m.date)),
      edit ? row('Кількість', reloadQty ?? (editQty ? qtyInput : fmt.num(n))) : null,
      edit && editPrice ? row('Сума', priceInput) : null,
      (edit ? rateInput : m.usdRate && usdOn()) ? row('Курс $, грн', edit ? rateInput : fmt.num(m.usdRate)) : null,
      edit || m.note ? row('Примітка', edit ? noteInput : m.note) : null)),
    box(t(part ? 'Компонент' : 'Набої'), lead(
      edit && swapCartridge ? movementCartridgeSelect(m) : open ? link(name, open) : name,
      m.caliber ? row('Калібр', m.caliber) : null,
      recipe ? row('Рецепт', link(recipe.name, () => recipeDetail(recipe))) : null,
      stock === null ? null : row('Зараз на складі', `${fmt.num(stock)} ${unit}`))),
    linked.length ? box(t('Списано компонентів'), h('div', { class: 'rows' }, linked.map((x) => logRow(x)))) : null);
}

/**
 * Нова кількість спорядження: списані компоненти й собівартість — у тій самій пропорції, однією правкою.
 * Пропорція, а не рецепт заново: рецепт могли змінити після спорядження, а списано було за старим.
 */
async function resizeReload(m, linked, qty) {
  const k = qty / Math.abs(m.qty);
  const before = [m, ...linked];
  const after = [
    { ...m, qty, price: Number(m.price) > 0 ? +(m.price * k).toFixed(2) : m.price },
    ...linked.map((x) => (x.kind === 'consume' ? { ...x, qty: -+(Math.abs(x.qty) * k).toFixed(3) } : x)),
  ];
  await db.write({ movements: { put: after } });
  await refresh();
  confirmed([m.id, m.cartridgeId]);
  if (linked.some((x) => x.componentId && M.componentStock(state, x.componentId) < 0)) toast(t('Компоненти пішли в мінус'));
  setUndo(t('Споряджено {n} · {name}', { n: qty, name: findCartridge(m.cartridgeId)?.name ?? '' }), async () => {
    await db.write({ movements: { put: before } });
    await refresh();
  });
}

/** Настріл по місяцях: скільки стріляв і на скільки — видно сезонність і темп. */
// Графік настрілу за вибраним періодом журналу: заголовок, підпис стовпчика й «за N …»
const PERIOD_CHART = {
  day: { title: 'Настріл за днями', span: 'за {n} дн.', label: (key) => fmt.date(key).slice(0, 5) },
  week: { title: 'Настріл за тижнями', span: 'за {n} тиж.', label: (key) => fmt.date(key).slice(0, 5) },
  month: {
    title: 'Настріл за місяцями', span: 'за {n} міс.',
    label: (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(locale(), { month: 'short' }),
  },
  year: { title: 'Настріл за роками', span: 'за {n} р.', label: (key) => key },
};

/** corner — що поставити на рамку праворуч (у Журналі — експорт у CSV). */
function periodChartBox(list = state.movements, corner = null) {
  let period = logPeriod;
  let rows = M.shotsByPeriod(state, (date) => periodOf(date, period).key, 12, list);
  // Один рік — один стовпчик нічого не показує: тоді за місяцями, як було до вибору періоду
  if (rows.length < 2 && period === 'year') {
    period = 'month';
    rows = M.shotsByPeriod(state, (date) => periodOf(date, period).key, 12, list);
  }
  if (rows.length < 2) return null;
  const chart = PERIOD_CHART[period];
  const total = rows.reduce((sum, r) => sum + r.shots, 0);
  const cost = rows.reduce((sum, r) => sum + r.cost, 0);
  const keys = new Set(rows.map((r) => r.key));
  return box(t(chart.title), h('div', {},
    barChart(rows.map((r) => ({ label: chart.label(r.key), value: r.shots })), { format: (v) => fmt.num(v) }),
    h('p', { class: 'muted small' }, [t(chart.span, { n: rows.length }), t('{n} постр.', { n: fmt.num(total) }),
      cost ? fmt.money(cost) + usdTail(list.filter((m) => m.kind === 'shot' && keys.has(periodOf(m.date, period).key))
        .map((m) => [M.shotCost(state, m), dayOf(m)])) : null].filter(Boolean).join(' · '))), { fold: 'period-chart', corner });
}

let logWeapon = '';

const PERIODS = [['day', 'День'], ['week', 'Тиждень'], ['month', 'Місяць'], ['year', 'Рік']];
const LOG_KINDS = [['all', 'Усі'], ['shot', 'Стрільба'], ['buy', 'Покупки'], ['reload', 'Спорядження'], ['clean', 'Чистка'], ['adjust', 'Коригування']];
const logMatch = (m, kind = logFilter, weapon = logWeapon) => m.kind !== 'consume' && m.kind !== 'collect'
  && (kind === 'all' || m.kind === kind) && (!weapon || m.weaponId === weapon);
const PERIOD_KEY = 'shooters-log:log-period-v2';
let logPeriod = PERIODS.some(([k]) => k === recall(PERIOD_KEY)) ? recall(PERIOD_KEY) : 'year';

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ключ періоду (сортується як рядок) і підпис. Тиждень — з понеділка. */
function periodOf(date, period = logPeriod) {
  if (!date) return { key: '', label: t('без дати') };
  const [y, m, d] = date.split('-').map(Number);
  if (period === 'year') return { key: String(y), label: String(y) };
  if (period === 'month') {
    const label = new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
    return { key: date.slice(0, 7), label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  if (period === 'week') {
    const start = new Date(y, m - 1, d - ((new Date(y, m - 1, d).getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { key: isoDate(start), label: `${fmt.date(isoDate(start)).slice(0, 5)} – ${fmt.date(isoDate(end))}` };
  }
  return { key: date, label: fmt.date(date) };
}

function logGroups(list) {
  const groups = new Map();
  for (const m of list) {
    const p = periodOf(m.date);
    if (!groups.has(p.key)) groups.set(p.key, { ...p, rows: [] });
    groups.get(p.key).rows.push(m);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key)).map((g) => {
    const [amount, money] = groupSummary(g.rows) ?? [];
    return fold(`log:${logPeriod}:${g.key}`,
      // Дві строки з кожного боку: великий настріл і сума не вміщаються в один рядок на телефоні.
      [h('span', { class: 'fold-stack' }, h('span', { class: 'fold-title' }, g.label), h('span', { class: 'fold-meta' }, t('записів: {n}', { n: g.rows.length }))),
        amount || money ? h('span', { class: 'fold-sum stack' }, amount, money ? h('span', { class: 'fold-cost' }, fmt.money(money) + usdTail(groupMoneyRows(g.rows))) : null) : null],
      () => h('div', { class: 'rows' }, g.rows.map((m) => logRow(m, { day: logPeriod !== 'day' }))), g.rows.map((m) => m.id));
  });
}

/**
 * Підсумок групи журналу: настріл і його вартість, а без стрільби — покупки, спорядження чи перерахунок.
 * Кількість — лише набоїв і словом «набоїв», не «шт»: компоненти в різних одиницях (порох у грамах), їх
 * не додаємо, а «100 шт» поруч із «+500 шт» куль читалося як усе куплене.
 */
/** Ті самі рухи, з яких groupSummary рахує суму групи, — для доларів: [грн, дата, свій курс]. */
function groupMoneyRows(rows) {
  const kind = ['shot', 'buy', 'reload'].find((k) => rows.some((m) => m.kind === k));
  return rows.filter((m) => m.kind === kind).map((m) => (kind === 'shot' ? [M.shotCost(state, m), dayOf(m)] : [m.price, dayOf(m), m.usdRate]));
}

function groupSummary(rows) {
  const shots = -M.sumBy(rows, (m) => m.kind === 'shot');
  if (shots) return [t('{n} постр.', { n: fmt.num(shots) }), M.shotsCost(state, rows)];
  for (const kind of ['buy', 'reload', 'adjust']) {
    const list = rows.filter((m) => m.kind === kind);
    if (!list.length) continue;
    const pieces = M.sumBy(list, (m) => Boolean(m.cartridgeId));
    const money = kind === 'adjust' ? 0 : list.reduce((sum, m) => sum + (Number(m.price) || 0), 0);
    const word = plural(pieces, [t('набій'), t('набої'), t('набоїв')]);
    return [pieces ? `${kind === 'adjust' ? fmt.signed(pieces) : fmt.num(pieces)} ${word}` : null, money];
  }
  return null;
}

/** Загальний настріл: усі калібри й стволи разом, з настрілом до початку обліку. */
/**
 * Підсумок настрілу: число, звання й скільки до наступного; праворуч лички в кільці прогресу.
 * З чого складається (split — пари [число, підпис]) — під «i», щоб не займати рядок.
 */
function shotsHero(total, split) {
  const level = shotLevel(total);
  const legend = h('div', { class: 'lv-wide' }, hintLegend(t('З чого складається'), split));
  // Нове звання з минулого перегляду — кільце один раз дозаповнюється, лички спалахують; уперше лише запам'ятовуємо
  const seen = recall('shooters-log:rank-seen');
  const up = seen !== null && Number(seen) < level.max;
  remember('shooters-log:rank-seen', String(level.max));
  return h('section', { class: `hero lv${up ? ' rank-up' : ''}` },
    h('div', {},
      h('div', { class: 'hero-label' }, t('Загальний настріл'), hintButton(legend, 'shots')),
      h('div', { class: 'hero-value' }, fmt.num(total)),
      h('div', { class: 'lv-sub' }, h('b', { class: 'rank-name' }, t(level.name)), ' · ',
        level.next ? t('ще {n} до «{rank}»', { n: fmt.num(level.left), rank: t(level.next.name) }) : t('найвище звання'))),
    rankRing(level),
    legend);
}

function shotsPanel() {
  const totals = M.shotsByCaliber(state);
  if (!totals.length) return null;
  const hasInitial = state.weapons.some((w) => Number(w.initialShots) > 0);
  const all = totals.reduce((s, row) => s + row.total, 0);
  const pct = (n, of) => (of > 0 ? Math.max(0, Math.round((n / of) * 100)) : 0);
  return box(t('Настріл за калібрами та зброєю'), h('div', { class: 'shots' },
    totals.map((row) => h('div', { class: 'shots-cal' },
      h('div', { class: 'shots-head' },
        cartridgeIcon(row.caliber),
        h('span', { class: 'shots-name' }, row.caliber || t('без калібру'), h('span', { class: 'muted small' }, `${pct(row.total, all)}%`)),
        h('b', {}, fmt.num(row.total))),
      row.weapons.map(([id, n]) => h('div', { class: 'shots-gun small' },
        h('span', { class: id && !id.startsWith(`${FOREIGN}:`) ? '' : 'muted' },
          id?.startsWith(`${FOREIGN}:`) ? foreignLabel(id.slice(FOREIGN.length + 1)) : id ? (findWeapon(id)?.name ?? t('(видалено)')) : t('ствол не вказано')),
        h('span', {}, fmt.num(n)),
        h('span', { class: 'shots-bar', style: `--w:${pct(n, row.total)}%` }))))),
    hasInitial ? h('p', { class: 'muted small shots-note' }, t('Лише записи журналу. Настріл до початку обліку видно на вкладці «Арсенал».')) : null),
  { fold: 'shots', count: totals.length });
}

/** Чипи вибору для шторки фільтра; ico — значок типу запису. */
function pickChips(options, value, onPick) {
  return h('div', { class: 'chips log-pick' }, options.map(([v, label, kind]) => h('button', {
    type: 'button', class: [v === value ? 'on' : '', kind ? `kind-${kind}` : ''].join(' ').trim() || null,
    onclick: () => onPick(v),
  }, kind ? kindIcon(kind) : null, label)));
}

/** Тип і зброя Журналу в шторці: вибір застосовує «Показати N», «Скинути» — одразу показує все. */
function logFilterSheet(guns) {
  let kind = logFilter;
  let weapon = logWeapon;
  const body = h('div', {});
  const showBtn = h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => { logFilter = kind; logWeapon = weapon; close(); render(); },
  });
  const draw = () => {
    showBtn.textContent = t('Показати {n}', { n: fmt.num(state.movements.filter((m) => logMatch(m, kind, weapon)).length) });
    body.replaceChildren(
      box(t('Тип запису'), pickChips(LOG_KINDS.map(([k, label]) => [k, t(label), k === 'all' ? null : k]), kind, (v) => { kind = v; draw(); })),
      guns.length ? box(t('Зброя'), pickChips([['', t('Уся зброя')], ...guns.map((w) => [w.id, w.name])], weapon, (v) => { weapon = v; draw(); })) : null);
  };
  const close = sheet(t('Фільтр'), body, {
    dirty: false,
    actions: [h('button', { type: 'button', class: 'btn', onclick: () => { logFilter = 'all'; logWeapon = ''; close(); render(); } }, t('Скинути')), showBtn],
  });
  draw();
}

function renderLog() {
  const guns = state.weapons.filter((w) => !w.archived || state.movements.some((m) => m.weaponId === w.id)).sort(byName);
  if (logWeapon && !findWeapon(logWeapon)) logWeapon = '';
  const list = state.movements.filter((m) => logMatch(m)).sort(M.byDateDesc);
  $('subtitle').textContent = t('записів: {n}', { n: list.length });
  // Один рядок: період перемикачем і значок фільтра (тип і зброя — у шторці), увімкнене видно чипами під рядком.
  // Вивантаження потрібне рідко — кнопкою під записами.
  const period = chips(PERIODS.map(([k, label]) => [k, t(label)]), logPeriod, (v) => {
    logPeriod = v;
    remember(PERIOD_KEY, v);
    render();
  });
  period.classList.add('segmented');
  const on = [
    logFilter !== 'all' ? { kind: logFilter, label: t(LOG_KINDS.find(([k]) => k === logFilter)?.[1] ?? logFilter), clear: () => { logFilter = 'all'; } } : null,
    logWeapon ? { label: findWeapon(logWeapon).name, clear: () => { logWeapon = ''; } } : null,
  ].filter(Boolean);
  const filterBtn = h('button', {
    type: 'button', class: `log-filter${on.length ? ' on' : ''}`, title: t('Фільтр'), 'aria-label': t('Фільтр'), onclick: () => logFilterSheet(guns),
  }, icon('filter'), on.length ? h('b', { class: 'log-badge' }, on.length) : null);
  const onRow = on.length ? h('div', { class: 'chips log-on' }, on.map((f) => h('button', {
    type: 'button', class: f.kind ? `kind-${f.kind}` : null, 'aria-label': t('Прибрати фільтр: {name}', { name: f.label }),
    onclick: () => { f.clear(); render(); },
  }, f.kind ? kindIcon(f.kind) : null, f.label, h('span', { class: 'log-x', 'aria-hidden': 'true' }, '✕')))) : null;
  // Експорт потрібен рідко — маленьким значком на рамці графіка; графіка немає — кнопкою під записами.
  const csvLabel = `${t('Експорт у CSV')} · ${t('записів: {n}', { n: list.length })}`;
  const csvIcon = list.length ? toolBtn('share', csvLabel, () => exportCsv(list), 'small box-corner') : null;
  // Як і блоки над ним — залежить лише від вибраної зброї, не від типу записів
  const chartBox = periodChartBox(logWeapon ? state.movements.filter((m) => m.weaponId === logWeapon) : state.movements, csvIcon);
  const csv = list.length && !chartBox ? h('div', { class: 'log-export' }, h('button', { type: 'button', onclick: () => exportCsv(list) },
    icon('share'), t('Експорт у CSV'), h('span', { class: 'muted' }, `· ${t('записів: {n}', { n: list.length })}`))) : null;
  return h('div', {},
    logWeapon
      ? hero(findWeapon(logWeapon).name, fmt.num(M.weaponShots(state, findWeapon(logWeapon))), t('настріл загалом, разом із настрілом до початку обліку'))
      : shotsPanel(),
    chartBox,
    h('div', { class: 'log-controls' }, h('div', { class: 'log-bar' }, period, filterBtn), onRow),
    list.length
      ? logGroups(list)
      : empty(t('Записів немає'), t('Свайпніть набій на «Складі», щоб купити або відстріляти.'), [btn(t('На склад'), () => { location.hash = '#ammo'; }, 'primary')]),
    csv);
}

// ---------- кучність ----------

// Фото мішені більше за фото зброї: на 2400 px пробоїна .223 на 100 м — це ще 20+ пікселів.
const TARGET_PHOTO = 2400;

// Купчастість за замовчуванням у MOA: кутова міра не залежить від дистанції, її й називають уголос.
let targetUnit = UNITS.some(([k]) => k === recall('shooters-log:target-unit-v2')) ? recall('shooters-log:target-unit-v2') : 'moa';
let targetWeapon = '';

const targetPhoto = (tg) => state.photos.find((p) => p.id === tg.photoId);

function targetTitle(tg) {
  return [findWeapon(tg.weaponId)?.name, findCartridge(tg.cartridgeId)?.name].filter(Boolean).join(' · ') || t('Мішень');
}

/** Дата запису (мішені, стрільби), з часом, якщо вказано: «17.10.2026 14:40». */
function targetWhen(tg) {
  return [fmt.date(tg.date), tg.time].filter(Boolean).join(' ');
}

/**
 * Найкращий розмах серед мішеней: та сама мірка, що й у «Набоях за купчастістю» —
 * групи від 3 пробоїн і порівняння за кутом, інакше 3,8 см на 30 м виглядали б кращими за 5 см на 300 м.
 */
function bestSpread(targets) {
  return targets.map((tg) => {
    const g = bestGroup(tg, M.PRECISION_MIN_HOLES);
    return g ? {
      spread: g.stats.spread, distance: tg.distance, cartridgeId: tg.cartridgeId,
      at100: tg.distance > 0 ? (g.stats.spread * 100) / tg.distance : Infinity,
    } : null;
  }).filter(Boolean).sort((a, b) => a.at100 - b.at100)[0] ?? null;
}

/**
 * Купчастість ствола одним числом: середній радіус найкупчастішого набою — те саме, що перший рядок
 * «Набоїв за купчастістю». Без груп за набоями — найкращий розмах, із власним підписом.
 */
function gunPrecision(w) {
  const targets = state.targets.filter((x) => x.weaponId === w.id);
  const top = M.ammoPrecision(targets, state.photos)[0];
  if (top) return { value: length(top.meanRadius, targetUnit, 100), label: t('сер. радіус') };
  const best = bestSpread(targets);
  if (!best) return null;
  return { value: best.distance > 0 ? length(best.spread, 'moa', best.distance) : length(best.spread, 'cm'), label: t('розкид') };
}

/** Найкраща купчастість — другим числом у правій колонці плитки. */
function precisionBadge(w) {
  const p = gunPrecision(w);
  if (!p) return null;
  return h('div', { class: 'big small-big', title: p.label }, bigIco(GROUP_ICO), p.value, h('span', { class: 'sr' }, p.label));
}

// Купка пробоїн у колі — значок розкиду поруч із числом.
const GROUP_ICO = '<circle cx="12" cy="12" r="8.5"/><circle cx="10" cy="10" r="1.4"/><circle cx="14.5" cy="11" r="1.4"/><circle cx="11" cy="14.5" r="1.4"/>';

/** Значок перед великим числом картки: підпис замінює, текст лишається для читалки екрана. */
function bigIco(svg) {
  const el = h('span', { class: 'big-ico', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`;
  return el;
}

/** Найкраща група мішені — з найменшим розмахом; min — скільки пробоїн щонайменше. */
function bestGroup(tg, min = 2) {
  const photo = targetPhoto(tg);
  if (!photo) return null;
  return M.targetStats(tg, photo).filter((g) => g.stats?.n >= min).sort((a, b) => a.stats.spread - b.stats.spread)[0] ?? null;
}

const UNIT_ICON = { cm: 'scale', moa: 'angle', mil: 'mil' };

/** Одиниці купчастості — як перемикач розділів «Полігону», але тихіший: підписи на всіх (значки MOA й MRAD схожі). */
function unitChips(onPick) {
  return h('div', { class: 'range-seg unit-seg', role: 'tablist' }, UNITS.map(([k, label]) => h('button', {
    type: 'button', role: 'tab', class: k === targetUnit ? 'on' : null, 'aria-selected': String(k === targetUnit),
    onclick: () => {
      targetUnit = k;
      remember('shooters-log:target-unit-v2', k);
      onPick();
    },
  }, icon(UNIT_ICON[k]), h('span', {}, t(label)))));
}

/** Вхід у «Кучность»: з журналу — усі мішені, з картки зброї — лише її. */
function openTargets(weapon, closeSheet = null) {
  closeSheet?.();
  targetWeapon = weapon.id;
  rangeSeg = 'targets';
  remember('shooters-log:range-seg', rangeSeg);
  goTab('#targets');
}

/** Як змінюється купчастість ствола від виїзду до виїзду: середній радіус, зведений до 100 м. */
function precisionChart(w) {
  const series = M.precisionSeries(state.targets, state.photos, w.id);
  if (series.length < 2) return null;
  // Шкала — одразу в одиницях показу, щоб поділки були круглими в MOA чи см, а не в мм. Менший радіус — краще.
  const angular = targetUnit !== 'cm';
  const shown = (mm) => (angular ? M.toAngle(mm, 100, targetUnit) : mm / 10);
  const unit = angular ? (targetUnit === 'moa' ? 'MOA' : 'MRAD') : t('см');
  return box(t('Середній радіус із часом'), lineChart(series.map((x) => ({ label: fmt.date(x.date), value: shown(x.value) })), {
    up: false,
    format: (v) => `${num(v, angular ? 2 : 1)} ${unit}`,
  }), { fold: `pchart:${w.id}` });
}

/**
 * Порівняння набоїв ствола за купчастістю: найкупчастіший зверху, смужка — середній радіус відносно найгіршого.
 * Розміри зведені до 100 м, тому кутові одиниці чесні, а сантиметри — «на 100 м».
 */
// Менше груп на набій — порівняння ще випадкове, позначаємо «мало даних»
const FEW_GROUPS = 3;
const groupsText = (n) => `${fmt.num(n)} ${plural(n, [t('група'), t('групи'), t('груп')])}`;
// Відстає від найкупчастішого менше ніж на 10 % — за такої кількості груп різниця випадкова, теж «найкупчастіший»
const LEAD_SHARE = 1.1;

/** Хто серед найкупчастіших (rows — за зростанням радіуса); tie — усі в межах 10 %: виділяти нікого, а сказати це. */
function leadersOf(rows) {
  const lead = rows.map((r) => rows.length > 1 && r.meanRadius <= rows[0].meanRadius * LEAD_SHARE);
  const tie = rows.length > 1 && lead.every(Boolean);
  return { lead: tie ? lead.map(() => false) : lead, tie };
}
const tieNote = () => h('p', { class: 'muted small' }, t('Різниці поки не видно — усі в межах 10 %.'));

function ammoPrecisionBox(w, fold) {
  const rows = M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id), state.photos);
  if (!rows.length) return null;
  const worst = rows.at(-1).meanRadius;
  const len = (mm) => length(mm, targetUnit, 100);
  const { lead, tie } = leadersOf(rows);
  const list = rows.map((r, i) => {
    const c = findCartridge(r.cartridgeId);
    const sub = [groupsText(r.groups), t('{n} постр.', { n: r.shots }),
      r.offset ? `${t('СТВ')}: ${offsetText(r.offset, targetUnit, 100)}` : null].filter(Boolean).join(' · ');
    const badge = r.groups < FEW_GROUPS ? h('span', { class: 'badge small' }, t('мало даних'))
      : lead[i] ? h('span', { class: 'badge ok small' }, t('найкупчастіший')) : null;
    return h('button', { type: 'button', class: 'row ap-row', onclick: () => precisionTargets(w, r) },
      cartridgeIcon(c?.caliber ?? w.caliber),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, c?.name ?? t('(видалено)'), badge),
        h('span', { class: 'muted small' }, sub),
        h('div', { class: 'bar' }, h('div', { class: `fill ${lead[i] ? '' : 'ap'}`, style: `width:${Math.max(4, (r.meanRadius / worst) * 100)}%` }))),
      h('span', { class: 'tg-best col' }, len(r.meanRadius), h('small', { class: 'muted' }, t('сер. радіус'))));
  });
  // Пояснення цифр — за кнопкою «i», як у мішені
  const legend = hintLegend(t('Що означають цифри'), [
    [t('Число праворуч — середній радіус'), t('Середня відстань пробоїн від центру групи: менше — купчастіше. Від кількості пострілів майже не залежить, тому за ним порівнюють набої.')],
    [t('Смужка'), t('Середній радіус відносно найгіршого набою в списку.')],
    [t('Як рахується'), t('Враховано групи від {n} пострілів; мішені на різних дистанціях зведено до 100 м.', { n: M.PRECISION_MIN_HOLES })],
    [t('найкупчастіший'), t('Найкращий середній радіус — або відстає від нього менше ніж на 10 %: така різниця поки випадкова.')],
    [t('мало даних'), t('Менше {n} груп — порівняння поки випадкове.', { n: FEW_GROUPS })],
  ]);
  return box(t('Набої за купчастістю'), [legend, h('div', { class: 'rows' }, list), tie ? tieNote() : null],
    { tools: hintButton(legend, 'precision'), fold: `${fold}:${w.id}`, count: rows.length });
}

/**
 * Глушник: куди зсуває СТП — по кожному прицілу (свій нуль), з тим самим набоєм і дистанцією, — і чи кучніше з ним.
 * Зсув можна записати в приціл: DOPE тоді поправить барабан, коли глушник поставили чи зняли.
 */
function suppressorBox(w, fold) {
  const known = state.targets.filter((x) => x.weaponId === w.id && 'suppressor' in x);
  if (!known.some((x) => x.suppressor)) return null;
  const shifts = M.suppressorShift(known, state.photos);
  const radius = M.precisionBy(known, state.photos, (tg) => (tg.suppressor ? 'on' : 'off'));
  const r = (key) => radius.find((x) => x.key === key);
  const len = (mm) => length(mm, targetUnit, 100);
  // Рядок зсуву: загальний для прицілу або одного набою (cid) — зі своєю кнопкою «Записати»
  const shiftRow = (scope, s, title, cid = null) => {
    const mrad = { x: Math.round(s.shift[0] * 100) / 10000, y: Math.round(s.shift[1] * 100) / 10000 };
    const stored = cid ? scope?.supShiftBy?.[cid] : scope?.supShift;
    const same = stored && Math.abs(stored.x - mrad.x) < 0.005 && Math.abs(stored.y - mrad.y) < 0.005;
    const few = Math.min(s.on, s.off) < FEW_GROUPS;
    return h('div', { class: `row sup-row${cid ? ' sup-ammo' : ''}` },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, title, few ? h('span', { class: 'badge small' }, t('мало даних')) : null),
        h('span', { class: 'small' }, t('З глушником СТВ: {where}', { where: offsetText(s.shift, targetUnit, 100) })),
        h('span', { class: 'muted small' }, t('{on} з глушником і {off} без — той самий набій і дистанція', { on: groupsText(s.on), off: groupsText(s.off) }))),
      !scope ? null : same ? h('span', { class: 'muted small' }, t('у прицілі'))
        : btn(stored ? t('Оновити в прицілі') : t('Записати в приціл'), () => saveSupShift(w, scope, mrad, cid), 'mini'));
  };
  // Кілька набоїв — під загальним рядком ще й кожен окремо: у різних набоїв зсув буває різний
  const rows = shifts.flatMap((s) => {
    const scope = w.scopes?.find((x) => x.id === s.scopeId);
    return [shiftRow(scope, s, scope?.name ?? t('(видалено)')),
      ...(s.ammo.length > 1 ? s.ammo.map((a) => shiftRow(scope, a, findCartridge(a.cartridgeId)?.name ?? t('(видалено)'), a.cartridgeId)) : [])];
  });
  const both = r('on') && r('off');
  return box(t('Глушник'), [
    rows.length ? h('div', { class: 'rows' }, rows)
      : h('p', { class: 'muted small' }, t('Щоб дізнатися, куди глушник зсуває влучання, потрібні мішені з ним і без — тим самим прицілом і набоєм, на тій самій дистанції, з позначеною точкою прицілювання.')),
    both ? h('p', { class: 'small' }, t('Середній радіус: з глушником {on}, без — {off}', { on: len(r('on').meanRadius), off: len(r('off').meanRadius) })) : null,
    rows.length ? h('p', { class: 'muted small' }, t('Записаний у приціл зсув DOPE врахує, коли глушник зняли чи поставили, — якщо майстер пристрілки знає, з глушником чи пристрілювали.')) : null,
  ], { fold: `${fold}-sup:${w.id}` });
}

/** Зсув з глушником — у приціл (мрад): DOPE поправляє барабан, коли зараз не так, як при пристрілці. */
async function saveSupShift(w, scope, mrad, cid = null) {
  const cur = findWeapon(w.id);
  // cid — зсув свого набою (supShiftBy); DOPE бере його для таблиці цього набою, інакше загальний
  const patch = (x) => (cid ? { supShiftBy: { ...x.supShiftBy, [cid]: mrad } } : { supShift: mrad, supShiftDate: M.today() });
  await saveEntity('weapons', { ...cur, scopes: cur.scopes.map((x) => (x.id === scope.id ? { ...x, ...patch(x) } : x)) });
  toast(t('Зсув з глушником записано в приціл'));
}

/** Кучність за упором: сошки, мішок, з руки… — де ствол купчастіший; усі набої разом, зведено до 100 м. */
function restBox(w, fold) {
  const rows = M.precisionBy(state.targets.filter((x) => x.weaponId === w.id), state.photos, restOf);
  if (rows.length < 2) return null;
  const worst = rows.at(-1).meanRadius;
  const { lead, tie } = leadersOf(rows);
  const list = rows.map((r, i) => h('button', { type: 'button', class: 'row ap-row', onclick: () => precisionTargets(w, r, restLabel(r.key)) },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, restLabel(r.key), r.groups < FEW_GROUPS ? h('span', { class: 'badge small' }, t('мало даних'))
        : lead[i] ? h('span', { class: 'badge ok small' }, t('найкупчастіший')) : null),
      h('span', { class: 'muted small' }, `${groupsText(r.groups)} · ${t('{n} постр.', { n: r.shots })}`),
      h('div', { class: 'bar' }, h('div', { class: `fill ${lead[i] ? '' : 'ap'}`, style: `width:${Math.max(4, (r.meanRadius / worst) * 100)}%` }))),
    h('span', { class: 'tg-best col' }, length(r.meanRadius, targetUnit, 100), h('small', { class: 'muted' }, t('сер. радіус')))));
  return box(t('Купчастість за упором'), [h('p', { class: 'muted small' }, t('Усі набої разом, мішені зведено до 100 м.')), h('div', { class: 'rows' }, list), tie ? tieNote() : null],
    { fold: `${fold}-rest:${w.id}`, count: rows.length });
}

/** У групі ствола на вкладці мішеней — порівняння, лише коли є з чим: набоїв два й більше, глушник, різні упори. */
function precisionInGroup(weaponId) {
  const w = findWeapon(weaponId);
  if (!w) return [];
  const ammo = M.ammoPrecision(state.targets.filter((x) => x.weaponId === w.id), state.photos).length >= 2 ? ammoPrecisionBox(w, 'range-precision') : null;
  return [ammo, suppressorBox(w, 'range-precision'), restBox(w, 'range-precision')].filter(Boolean);
}

/** Мішені рядка порівняння (набій, упор) — звідки взялися цифри. */
function precisionTargets(w, r, title = findCartridge(r.cartridgeId)?.name) {
  const list = state.targets.filter((x) => r.targets.includes(x.id)).sort(M.byDateDesc);
  const top = bestTargetId(list);
  sheet(title ?? t('Мішені'),
    h('div', { class: 'rows' }, list.map((tg) => targetRow(tg, null, { inWeapon: true, best: tg.id === top }))));
}

function targetThumb(tg) {
  const canvas = h('canvas', { class: 'tg-thumb' });
  const photo = targetPhoto(tg);
  if (photo?.thumb) paintPreview(canvas, photo.thumb, tg, 160).catch(() => {});
  return canvas;
}

/**
 * Найкупчастіша мішень списку — за кутовим розкидом (розкид / дистанція), щоб 100 і 300 м порівнювались чесно;
 * групи від PRECISION_MIN_HOLES пострілів, бо дві пробоїни поруч — ще не купчастість. Одна мішень — без зірки.
 */
function bestTargetId(list) {
  if (list.length < 2) return null;
  let best = null;
  for (const tg of list) {
    const g = tg.distance > 0 ? bestGroup(tg, M.PRECISION_MIN_HOLES) : null;
    const angle = g && g.stats.spread / tg.distance;
    if (g && (!best || angle < best.angle)) best = { id: tg.id, angle };
  }
  return best?.id ?? null;
}

/**
 * inWeapon — рядок у списку одного ствола: назва зброї там зайва, тож зверху дата, а дистанція — жирним.
 * best — найкупчастіша мішень списку: зірка після дати.
 */
function targetRow(tg, beforeOpen = null, { inWeapon = false, best: top = false } = {}) {
  const best = bestGroup(tg);
  const holes = (tg.groups ?? []).reduce((sum, g) => sum + g.holes.length, 0);
  const dist = tg.distance ? t('{n} м', { n: fmt.num(tg.distance) }) : null;
  const shots = holes ? t('{n} постр.', { n: holes }) : t('не розмічена');
  const [title, parts] = inWeapon
    ? [targetWhen(tg) || t('Мішень'), [dist && h('b', { class: 'tg-dist' }, dist), findCartridge(tg.cartridgeId)?.name, shots, tg.note]]
    : [targetTitle(tg), [targetWhen(tg), dist, shots, tg.note]];
  const sub = parts.filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
  return h('button', { type: 'button', class: 'row tg-row', 'data-id': tg.id, onclick: () => { beforeOpen?.(); targetDetail(tg); } },
    targetThumb(tg),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title, top ? starIcon(t('Найкупчастіша')) : null),
      h('span', { class: 'muted small' }, sub)),
    best ? spreadCell(length(best.stats.spread, targetUnit, tg.distance)) : null);
}

/**
 * Розкид у правій колонці рядка: одиниця дрібно, а колонка однакової ширини для см, MOA й MRAD —
 * інакше перемикач одиниць міняв ширину, назва переносилась інакше, і рядки стрибали.
 */
function spreadCell(text) {
  const at = text.lastIndexOf(' ');
  const [value, unit] = at > 0 ? [text.slice(0, at), text.slice(at + 1)] : [text, ''];
  return h('span', { class: 'tg-best col tg-spread' }, h('span', {}, value, unit ? h('small', { class: 'tg-unit' }, unit) : null),
    h('small', { class: 'muted' }, t('розкид')));
}

// ---------- полігон: розділи ----------

// 4-й елемент — коротка назва для вузького екрана (до 360 px), коли повна не влазить
const RANGE_SEGS = [['exercises', 'Вправи', 'drill'], ['targets', 'Мішені', 'target'], ['chrono', 'Швидкості', 'speed', 'Швидк.'], ['timer', 'Таймер', 'timer'], ['sim', 'Тренажер', 'sim', 'Трен.']];
let rangeSeg = RANGE_SEGS.some(([k]) => k === recall('shooters-log:range-seg')) ? recall('shooters-log:range-seg') : 'exercises';

// Розділ, на який щойно перейшли тапом чи свайпом: його значок один раз грає свою анімацію
let segJust = null;

/** Панель розділів: значок і підпис під ним у кожного; свайп по панелі — сусідній розділ. */
function segBar(segs, current, go) {
  const goPlay = (k) => { if (k !== current) segJust = k; go(k); };
  const bar = h('div', { class: 'range-seg seg-nav', role: 'tablist' }, segs.map(([k, label, ico, short]) => h('button', {
    type: 'button', role: 'tab', class: k === current ? (segJust === k ? 'on play' : 'on') : null, dataset: { seg: k },
    'aria-selected': String(k === current), 'aria-label': t(label), title: t(label),
    onclick: () => goPlay(k),
  }, icon(ico), h('span', { class: short ? 'seg-long' : null }, t(label)), short ? h('span', { class: 'seg-short', 'aria-hidden': 'true' }, t(short)) : null)));
  segJust = null;
  return swipeStep(bar, (dir) => {
    const next = segs[segs.findIndex(([k]) => k === current) + dir];
    if (next) goPlay(next[0]);
    return Boolean(next);
  });
}

/** Вкладка «Полігон»: розділи панеллю segBar; розділ запам'ятовується. */
function renderRange() {
  // Вимкнені вправи — розділу нема, а «Довідник стрільця» переходить у «Мішені»
  const segs = visibleSegs(RANGE_SEGS);
  if (!segs.some(([k]) => k === rangeSeg)) rangeSeg = 'targets';
  const seg = segBar(segs, rangeSeg, (k) => {
    rangeSeg = k;
    remember('shooters-log:range-seg', k);
    render();
  });
  const panels = { timer: renderTimer, exercises: renderExercises, chrono: renderChrono, sim: renderSim };
  const guideHere = rangeSeg === 'exercises' || (rangeSeg === 'targets' && !moduleOn('exercises'));
  return h('div', {}, seg, guideHere ? guideLink() : null, (panels[rangeSeg] ?? renderTargets)());
}

function renderExercises() {
  return exercisesPanel(exerciseCtx());
}

/** Рух списання результату й решта його пачки (зібрані гільзи). */
function scoreShots(r) {
  const m = r.movementId && state.movements.find((x) => x.id === r.movementId);
  if (!m) return [];
  return m.batch ? state.movements.filter((x) => x.batch === m.batch) : [m];
}

/** Результати вправи з очками за її теперішніми зонами — лише ті, де очки змінились. */
function rescored(ex) {
  return state.scores.filter((s) => s.exercise === ex.id).map((s) => ({ ...s, score: scoreOf(ex, s) })).filter((s) => s.score !== state.scores.find((x) => x.id === s.id).score);
}

/** Що панель і картка результату беруть із застосунку: стволи, набої, збереження, мішені. */
function exerciseCtx() {
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  const cartridges = state.cartridges.filter((c) => !c.archived)
    .sort((a, b) => collate(a.caliber, b.caliber) || collate(a.name, b.name))
    .map((c) => [c.id, `${c.name} · ${c.caliber}`, M.cartridgeStock(state, c.id)]);
  return {
    scores: state.scores, weapons, cartridges, drills: state.drills, box, stat,
    lastAmmo: (weaponId) => M.lastAmmo(state, weaponId),
    pickAmmo: (select) => ammoPicker(select),
    pickWeapon: (select) => weaponPicker(select),
    weaponName: (id) => findWeapon(id)?.name ?? null,
    weaponExtras,
    // Дата результату — текстом ДД.ММ.РРРР, час дня — у clock (time у вправах на час — сума серії)
    whenFields: (prev) => whenFields(prev, { dateType: 'dmy', timeKey: 'clock' }),
    whereWhen: (f, prev) => whereWhenBox(f, { gps: prev?.gps ?? null, timeKey: 'clock' }),
    whereWhenView: (s) => whereWhenView(s, { timeKey: 'clock' }),
    // Приціл і оснащення результату — рядками умов у його картці
    extrasRows: (s) => {
      const scope = findWeapon(s.weaponId)?.scopes?.find((sc) => sc.id === s.scopeId);
      return [scope ? [t('Приціл'), scope.name] : null, gearText(s) ? [t('Як стріляли'), gearText(s)] : null].filter(Boolean);
    },
    pickList: (select, title) => listPicker(select, { title, item: () => null }),
    collectField,
    // Свої вправи лежать у базі поряд з рештою — отже, їдуть і в копію, і на Диск.
    custom: state.exercises,
    // Зони чи їхні очки змінились — очки збережених результатів перераховуються, інакше рекорд і звання за старими
    onSaveExercise: async (rec) => {
      const obj = { id: db.uid(), created: Date.now(), ...rec };
      await db.write({ exercises: { put: [obj] }, scores: { put: rescored(asExercise(obj)) } });
      await refresh();
      confirmed([obj.id]);
    },
    // Вбудовану ховаємо: повернути — «Скасувати» одразу або в Налаштуваннях
    onHideExercise: (ex, closeCard) => {
      const own = state.exercises.find((r) => r.id === ex.id);
      const used = state.scores.filter((s) => s.exercise === ex.id).length;
      confirmSheet(t('Видалити вправу?'), [used ? t('Результати ({n}) лишаться.', { n: used }) : exerciseName(ex.id),
        t('Повернути можна в Налаштуваннях → «Нагадування й вправи».')].join(' '),
      t('Видалити'), async () => {
        closeCard?.();
        await saveEntity('exercises', own ? { ...own, hidden: true } : { id: ex.id, created: Date.now(), hidden: true, hideOnly: true });
        setUndo(t('Вправу видалено'), async () => {
          await db.write(own ? { exercises: { put: [own] } } : { exercises: { del: [ex.id] } });
          await refresh();
        });
      });
    },
    // Своя вправа — разом із її результатами (стрільби в журналі лишаються); правка вбудованої — повернення до вбудованої
    onDeleteExercise: (rec, closeCard) => {
      if (!rec) return;
      const base = EXERCISES.find((e) => e.id === rec.id);
      const scores = state.scores.filter((s) => s.exercise === rec.id);
      const text = base ? t('Свої зони, звання й правила зникнуть — буде як у застосунку.')
        : scores.length ? t('Разом із результатами ({n}). Стрільби в журналі лишаться.', { n: scores.length }) : rec.name;
      confirmSheet(base ? t('Повернути вбудовану?') : t('Видалити вправу?'), text, base ? t('Повернути') : t('Видалити'), async () => {
        closeCard?.();
        await db.write(base
          ? { exercises: { del: [rec.id] }, scores: { put: rescored(base) } }
          : { exercises: { del: [rec.id] }, scores: { del: scores.map((s) => s.id) } });
        await refresh();
        confirmed();
        setUndo(base ? t('Вбудовану повернуто') : t('Вправу видалено'), async () => {
          await db.write({ exercises: { put: [rec] }, scores: { put: scores } });
          await refresh();
        });
      });
    },
    openTimer: timerSheet,
    mismatch: (cartridgeId, weaponId) => caliberMismatch(findCartridge(cartridgeId), findWeapon(weaponId)),
    // Списували набої — мішені на записі стрільби, як у звичайної стрільби; ні (чужі набої, «не списувати») — на самому результаті.
    targetsOf: (r) => {
      const m = state.movements.find((x) => x.id === r.movementId);
      return m ? shotTargets(m, () => {}) : scoreTargets(r, () => {});
    },
    onSave: async (r, consume) => {
      const score = { id: db.uid(), ...r, created: r.created ?? Date.now() };
      const done = t('Результат збережено · очки: {n}', { n: fmt.num(r.score) });
      if (!consume) {
        const had = state.scores.find((x) => x.id === r.id) ?? null;
        await db.write({ scores: { put: [score] } });
        await refresh();
        confirmed([score.id, score.exercise]);
        toast(done);
        setUndo(done, async () => { await db.write(had ? { scores: { put: [had] } } : { scores: { del: [score.id] } }); await refresh(); });
        return;
      }
      const c = findCartridge(consume.cartridgeId);
      const unit = c ? M.cartridgeUnitCost(state, c.id) : null;
      // Вартість фіксуємо на момент списання — як у звичайній стрільбі.
      const m = movement({
        kind: 'shot', cartridgeId: c.id, caliber: c.caliber, qty: -consume.qty, date: r.date,
        time: r.clock || (r.date === M.today() ? nowHm() : undefined),
        weaponId: r.weaponId || null, scopeId: 'scopeId' in r ? r.scopeId : M.defaultScope(findWeapon(r.weaponId))?.id ?? null,
        temp: r.temp ?? null, wind: r.wind ?? null, windClock: r.windClock ?? null, windGuess: r.windGuess ?? null, gps: r.gps ?? null,
        price: unit ? +(unit * consume.qty).toFixed(2) : null, note: consume.note,
      });
      score.movementId = m.id;
      await addShot(m, consume.collect, t('Результат збережено · −{n}', { n: fmt.num(consume.qty) }), { scores: { put: [score] } });
      confirmed([score.id, score.exercise]);
      toast(`${done} · −${fmt.num(consume.qty)}`);
    },
    // Списання результату — стрільба з пачкою (зібрані гільзи): видаляються разом, набої повертаються на склад
    deleteNote: (r) => {
      const qty = -(scoreShots(r).find((x) => x.kind === 'shot')?.qty ?? 0);
      return qty ? t('Списання ({n} шт) повернеться на склад, стрільба зникне з журналу', { n: fmt.num(qty) }) : null;
    },
    onDelete: async (r) => {
      const moves = scoreShots(r);
      await db.write({ scores: { del: [r.id] }, movements: { del: moves.map((x) => x.id) } });
      await refresh();
      confirmed();
      setUndo(t('Результат видалено'), async () => { await db.write({ scores: { put: [r] }, movements: { put: moves } }); await refresh(); });
    },
  };
}

/** Таймер прямо з результату вправи: серія зберігається як завжди, а її час іде в поле. */
function timerSheet(onDone) {
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  const close = sheet(t('Таймер'), timerPanel({
    pickWeapon: (select) => weaponPicker(select),
    weapons,
    onSave: async (drill) => {
      await saveEntity('drills', { id: db.uid(), created: Date.now(), ...drill });
      close();
      onDone(Math.max(0, ...drill.shots));
    },
  }), { onClose: stopTimerPanel });
}

function renderTimer() {
  const weapons = state.weapons.filter((w) => !w.archived).sort(byName).map((w) => [w.id, w.name]);
  return h('div', {},
    timerPanel({ weapons, pickWeapon: (select) => weaponPicker(select), onSave: (drill) => saveEntity('drills', { id: db.uid(), created: Date.now(), ...drill }) }),
    drillsBox());
}

/** Збережені серії: новіші зверху, підсумок рядком. */
function drillsBox() {
  const list = [...state.drills].sort(M.byDateDesc);
  if (!list.length) return null;
  return box(t('Серії'), h('div', { class: 'rows' }, list.map((d) => {
    const s = M.drillStats(d.shots);
    const sub = [fmt.date(d.date), findWeapon(d.weaponId)?.name, d.note].filter(Boolean).join(' · ');
    return h('button', { type: 'button', class: 'row', 'data-id': d.id, onclick: () => drillDetail(d) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, t('{n} постр.', { n: s.n }), ' · ', t('перший {v}', { v: num(s.first ?? 0, 2) }),
          s.avg ? ` · ${t('спліт')} ${num(s.avg, 2)}` : ''),
        h('span', { class: 'muted small' }, sub)),
      h('span', { class: `tg-best ${d.par && s.total > d.par ? 'tm-late' : ''}` }, num(s.total ?? 0, 2)));
  })), { fold: 'drills', count: list.length });
}

/** Картка серії: плитки й постріли зі сплітами; видалення іконкою вгорі. */
function drillDetail(d) {
  const s = M.drillStats(d.shots);
  const shots = [...d.shots].sort((a, b) => a - b);
  const remove = () => confirmSheet(t('Видалити серію?'), `${fmt.date(d.date)} · ${t('{n} постр.', { n: s.n })}`, t('Видалити'), async () => {
    close();
    await db.write({ drills: { del: [d.id] } });
    await refresh();
    confirmed();
  });
  const delayText = d.delay === 'random' ? t('Випадкова 2–4 с') : d.delay === '0' ? t('Без затримки') : `${d.delay} ${t('с')}`;
  const parText = d.par ? `${num(d.par, 2)} · ${s.total > d.par ? t('не вклалися') : t('вклалися')}` : null;
  const close = sheet(t('Серія {date}', { date: fmt.date(d.date) }), h('div', {},
    h('div', { class: 'stats even' },
      stat(t('перший постріл'), num(s.first ?? 0, 2), 'accent'),
      stat(t('усього'), num(s.total ?? 0, 2)),
      s.avg ? stat(t('середній спліт'), num(s.avg, 2)) : null),
    box(t('Умови'), h('dl', { class: 'kv' },
      d.weaponId ? [h('dt', {}, t('Зброя')), h('dd', {}, findWeapon(d.weaponId)?.name ?? t('(видалено)'))] : null,
      [h('dt', {}, t('Затримка сигналу')), h('dd', {}, delayText)],
      parText ? [h('dt', {}, t('Пар-тайм, с')), h('dd', {}, parText)] : null,
      d.note ? [h('dt', {}, t('Примітка')), h('dd', {}, d.note)] : null)),
    box(t('Постріли'), h('div', { class: 'tm-shots' }, shots.map((x, i) => h('div', { class: `tm-shot ${i === 0 ? 'first' : ''}` },
      h('span', { class: 'tm-n' }, String(i + 1)),
      h('span', { class: 'tm-at' }, num(x, 2)),
      h('span', { class: 'tm-split muted' }, i ? `+${num(x - shots[i - 1], 2)}` : t('перший'))))))),
  { tools: [toolBtn('delete', t('Видалити'), remove, 'danger')] });
}

// ---------- полігон: швидкості (хронограф) ----------

// Швидкість як вписали: 812 — без «,0», 812,5 — з десятими
const speedText = (v) => fmt.num(Math.round(v * 10) / 10);

const chronoWeapon = (c) => findWeapon(c.weaponId)?.name ?? (c.weaponId ? t('(видалено)') : t('Без зброї'));

function renderChrono() {
  const list = [...state.chrono].sort(M.byDateDesc);
  // Групи за набоєм: швидкість — властивість набою (і ствола); серії без набою — в кінці
  const groups = groupBy(list, (x) => x.cartridgeId || '')
    .map(([id, items]) => ({ id, items, name: id ? (findCartridge(id)?.name ?? t('(видалено)')) : t('Без набою') }))
    .sort((a, b) => Number(!a.id) - Number(!b.id) || collate(a.name, b.name));
  return h('div', {},
    list.length
      ? groups.map((g) => fold(`chrono:${g.id}`,
        [h('span', { class: 'fold-title' }, g.name), h('span', { class: 'fold-meta' }, t('серій: {n}', { n: g.items.length }))],
        h('div', { class: 'rows' }, g.items.map((c) => chronoRow(c)))))
      : [empty(t('Швидкостей поки немає'), t('Відстріляли серію через хронограф — натисніть «Додати» і впишіть швидкість кожного пострілу: застосунок порахує середню, ES і SD.'), [addBtn()]), hideHint('chrono')],
    h('p', { class: 'muted small' }, t('ES — різниця між найшвидшим і найповільнішим пострілом. SD — наскільки швидкість гуляє від пострілу до пострілу: що менше, то менший вертикальний розкид на далеких дистанціях.')));
}

function chronoRow(c) {
  const s = M.chronoStats(c.speeds);
  const sub = [fmt.date(c.date), t('{n} постр.', { n: s.n }), c.temp != null ? `${fmt.num(c.temp)} °C` : null, c.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row', 'data-id': c.id, onclick: () => chronoDetail(c) },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, chronoWeapon(c)), h('span', { class: 'muted small' }, sub)),
    s.n ? h('span', { class: 'tg-best col' }, `${fmt.num(Math.round(s.avg))} ${t('м/с')}`,
      h('small', { class: 'muted' }, s.sd === null ? '' : `SD ${num(s.sd, 1)}`)) : null);
}

/** Панель підказки «i»: заголовок і пункти [назва, пояснення]. */
function hintLegend(title, items) {
  return h('div', { class: 'ex-scoring tg-legend' },
    h('div', { class: 'ex-scoring-title' }, title),
    h('ul', { class: 'hint-legend' }, items.map(([lead, text]) => h('li', {}, h('b', {}, lead), h('div', { class: 'muted small' }, text)))));
}

/** Що означають середня, ES і SD і які значення вважати добрими. */
function chronoLegend() {
  return hintLegend(t('Що означають цифри'), [
    [t('Середня'), t('Її вписують у балістичний калькулятор — від неї рахуються поправки в таблиці DOPE.')],
    [t('ES — розмах швидкостей'), t('Різниця найшвидшого й найповільнішого пострілу. Залежить від одного пострілу, що вибився, і росте з довжиною серії.')],
    [t('SD — стандартне відхилення'), t('Наскільки зазвичай швидкість відходить від середньої. Стійкіший за ES, тому за ним порівнюють партії й навіски. Орієнтир: до 3 м/с — відмінно, 3–5 — добре, понад 8 — на 500 м і далі група помітно розтягується по вертикалі.')],
    [t('Скільки пострілів'), t('На 3–5 пострілах SD випадковий; надійніше — серія від 10.')],
  ]);
}

/** Плитки серії з кнопкою «i» праворуч і підказкою під ними. */
function chronoTiles(tiles) {
  const legend = chronoLegend();
  return [h('div', { class: 'chrono-head' }, tiles, hintButton(legend, 'chrono')), legend];
}

/** Картка серії: середня, SD і ES плитками, умови, постріли з відхиленням від середньої. */
function chronoDetail(c0) {
  const current = () => state.chrono.find((x) => x.id === c0.id);
  const body = () => {
    const c = current();
    if (!c) return null;
    const s = M.chronoStats(c.speeds);
    const ammo = findCartridge(c.cartridgeId);
    const row = (label, value) => [h('dt', {}, t(label)), h('dd', {}, value)];
    return h('div', {},
      chronoTiles(h('div', { class: 'stats even' },
        stat(t('середня, м/с'), num(s.avg ?? 0, 1), 'accent'),
        stat('SD', s.sd === null ? '—' : num(s.sd, 1)),
        stat('ES', speedText(s.es ?? 0)))),
      box(t('Серія'), h('dl', { class: 'kv' },
        row('Дата', targetWhen(c)),
        row('Зброя', chronoWeapon(c)),
        row('Набій', ammo ? h('span', { class: 'ammo-name' }, cartridgeIcon(ammo.caliber), ammo.name) : (c.cartridgeId ? t('(видалено)') : '—')),
        s.n > 1 ? row('Мін / макс', `${speedText(s.min)} / ${speedText(s.max)} ${t('м/с')}`) : null,
        c.temp != null ? row('Температура', `${fmt.num(c.temp)} °C`) : null,
        c.gps ? row('Координати', h('span', { class: 'kv-gps' }, `${c.gps.lat.toFixed(5)}, ${c.gps.lon.toFixed(5)}`,
          toolBtn('map', t('Відкрити на карті'), () => openMap(c.gps), 'small'))) : null,
        c.note ? row('Примітка', c.note) : null)),
      box(t('Постріли'), h('div', { class: 'tm-shots' }, c.speeds.map((v, i) => h('div', { class: 'tm-shot' },
        h('span', { class: 'tm-n' }, String(i + 1)),
        h('span', { class: 'tm-at' }, speedText(v)),
        h('span', { class: 'tm-split muted' }, s.n > 1 ? `${v >= s.avg ? '+' : '−'}${num(Math.abs(v - s.avg), 1)}` : ''))))));
  };
  const remove = () => confirmSheet(t('Видалити серію?'), `${fmt.date(c0.date)} · ${chronoWeapon(c0)}`, t('Видалити'), async () => {
    close();
    await db.write({ chrono: { del: [c0.id] } });
    await refresh();
    confirmed();
  });
  const close = sheet(t('Швидкості'), body(), { live: body, tools: cardTools(() => chronoForm(current() ?? c0), false, remove) });
}

/** Нова або змінена серія: ствол, набій, умови й швидкості — по одній (Enter чи «+») або списком. */
function chronoForm(c = null) {
  const last = [...state.chrono].sort(M.byDateDesc)[0];
  const gunId = [c?.weaponId, c ? null : last?.weaponId].find((id) => id && findWeapon(id)) ?? '';
  const guns = state.weapons.filter((w) => !w.archived || w.id === gunId).sort(byName);
  const ammoId = [c?.cartridgeId, !c && gunId ? recall(`ammo:${gunId}`) : null].find((id) => id && findCartridge(id)) ?? '';
  const ammo = (id) => [['', t('— не вказувати —')],
    ...caliberOptions(state.cartridges.filter((x) => !x.archived || x.id === ammoId), findWeapon(id)?.caliber).options];
  const f = form([
    { name: 'weaponId', label: t('Зброя'), type: 'select', value: gunId, options: [['', t('— не вказувати —')], ...guns.map((w) => [w.id, w.name])] },
    { name: 'cartridgeId', label: t('Набої'), type: 'select', value: ammoId, options: ammo(gunId) },
    { name: 'date', label: t('Дата'), type: 'date', half: true, value: c?.date ?? M.today() },
    { name: 'time', label: t('Час'), type: 'time', half: true, value: c ? c.time ?? '' : nowHm() },
    { name: 'note', label: t('Примітка'), placeholder: t('Хронограф, партія, навіска…'), value: c?.note ?? '', wide: true },
    { name: 'temp', label: t('Температура, °C'), type: 'number', step: 'any', half: true, value: c?.temp ?? '' },
  ]);
  // Погода — як у мішені: значок геолокації ставить температуру на місці й на час серії
  const gps = gpsEditor(c?.gps);
  const weatherInfo = h('small', { class: 'muted tg-weather-note' });
  const weatherBtn = toolBtn('locate', t('Підтягнути погоду'), async () => {
    const w = await pullWeather({ date: f.inputs.date.value, time: f.inputs.time, gps, button: weatherBtn, info: weatherInfo });
    if (!w) return;
    f.inputs.temp.value = String(Math.round(w.temp * 10) / 10);
    weatherInfo.textContent = t('Це температура повітря. Набої, що полежали на сонці чи в машині, бувають теплішими — і швидшими.');
  }, 'tg-pull');
  const weatherBox = box(t('Погода'), h('div', {},
    h('div', { class: 'form tg-weather chrono-weather' }, f.inputs.temp.closest('.field'), weatherBtn),
    weatherInfo, gps.el));
  const repaintAmmo = ammoPicker(f.inputs.cartridgeId, findWeapon(gunId)?.caliber);
  weaponPicker(f.inputs.weaponId);
  f.inputs.weaponId.addEventListener('change', () => {
    const keep = f.inputs.cartridgeId.value;
    f.inputs.cartridgeId.replaceChildren(...selectOptions(ammo(f.inputs.weaponId.value), keep).filter(Boolean));
    repaintAmmo();
  });
  caliberWarnLine(f.inputs.cartridgeId.closest('.field'), () => findCartridge(f.inputs.cartridgeId.value),
    () => findWeapon(f.inputs.weaponId.value), [f.inputs.weaponId, f.inputs.cartridgeId]);
  const speeds = [...(c?.speeds ?? [])];
  const entry = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: t('наприклад 812 або 812,5'), 'aria-label': t('Швидкість, м/с') });
  const list = h('div', { class: 'chrono-list' });
  const summary = h('span', { class: 'chrono-sum small' });
  const summaryHint = chronoLegend();
  const summaryRow = h('div', { class: 'chrono-sum-row' }, summary, hintButton(summaryHint, 'chrono'));
  const draw = () => {
    list.replaceChildren(...speeds.map((v, i) => h('span', { class: 'chrono-chip' },
      h('small', { class: 'muted' }, String(i + 1)), speedText(v),
      h('button', { type: 'button', class: 'chrono-x', 'aria-label': t('Видалити'), onclick: () => { speeds.splice(i, 1); draw(); } }, '✕'))));
    const s = M.chronoStats(speeds);
    summaryRow.hidden = !s.n;
    summaryHint.hidden = !s.n || !hintOpen.chrono;
    summary.textContent = s.n ? [t('{n} постр.', { n: s.n }), `${t('середня')} ${num(s.avg, 1)}`,
      s.sd === null ? null : `SD ${num(s.sd, 1)}`, s.n > 1 ? `ES ${speedText(s.es)}` : null].filter(Boolean).join(' · ') : '';
  };
  // Можна вставити одразу всю серію з хронографа: «812 815 809» чи стовпчиком
  const add = () => {
    if (!entry.value.trim()) return;
    const got = M.parseSpeeds(entry.value);
    if (!got.length || got.some((v) => !(v > 0))) { fieldError(entry, t('Швидкість — число, наприклад 812 або 812,5')); return; }
    speeds.push(...got);
    entry.value = '';
    entry.closest('.sheet')?.querySelector('.form-error')?.remove();
    draw();
    entry.focus();
  };
  entry.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const plus = h('button', { type: 'button', class: 'btn primary chrono-add', 'aria-label': t('Додати'), onclick: add }, '+');
  draw();
  const speedsField = h('div', { class: 'form' }, h('label', { class: 'field wide' },
    h('span', { class: 'field-label' }, t('Швидкість кожного пострілу, м/с')),
    h('div', { class: 'chrono-entry' }, entry, plus),
    h('small', { class: 'muted' }, t('Enter або «+» після кожної; можна вставити всю серію через пробіл.'))));
  const close = sheet(c ? t('Змінити серію') : t('Нова серія швидкостей'), h('div', {}, f.el, weatherBox, speedsField, list, summaryRow, summaryHint), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    // Недописане в полі — теж у серію, щоб не загубити останній постріл
    if (entry.value.trim()) { add(); if (entry.value.trim()) return; }
    if (!speeds.length) { formError(t('Додайте хоча б одну швидкість')); return; }
    const v = f.values();
    if (!v.date) { fieldError(f.inputs.date, t('Заповніть поле «{label}»', { label: t('Дата') })); return; }
    if (Number.isNaN(v.temp)) { fieldError(f.inputs.temp, t('Температура — число')); return; }
    if (v.weaponId && v.cartridgeId) remember(`ammo:${v.weaponId}`, v.cartridgeId);
    close();
    await saveEntity('chrono', {
      id: c?.id ?? db.uid(), created: c?.created ?? Date.now(), date: v.date, time: v.time || null, weaponId: v.weaponId || null,
      cartridgeId: v.cartridgeId || null, temp: v.temp, gps: gps.get(), note: v.note || null, speeds,
    });
  }
}

function renderTargets() {
  const list = [...state.targets].sort(M.byDateDesc);
  // Прийшли з картки зброї — її група розгорнута.
  if (targetWeapon) setUnfolded(`targets:${targetWeapon}`, true);
  const groupRows = (items) => {
    const top = bestTargetId(items);
    return h('div', { class: 'rows' }, items.map((tg) => targetRow(tg, null, { inWeapon: true, best: tg.id === top })));
  };
  // Групи за зброєю: за назвою, мішені без ствола — в кінці.
  const groups = groupBy(list, (x) => x.weaponId || '')
    .map(([id, items]) => ({ id, items, name: id ? (findWeapon(id)?.name ?? t('(видалено)')) : t('Без зброї') }))
    .sort((a, b) => Number(!a.id) - Number(!b.id) || collate(a.name, b.name));
  return h('div', {},
    unitChips(render),
    zeroStartBtn(),
    list.length
      ? groups.map((g) => fold(`targets:${g.id}`,
        [h('span', { class: 'fold-title' }, g.name), h('span', { class: 'fold-meta' }, t('мішеней: {n}', { n: g.items.length }))],
        [...precisionInGroup(g.id), groupRows(g.items)].filter(Boolean)))
      : empty(t('Мішеней поки немає'), t('Сфотографуйте мішень і натисніть «Додати»: позначте пробоїни — застосунок порахує купчастість, СТВ і поправки в кліках.'), [addBtn()]),
    h('p', { class: 'muted small' }, t('Розкид — між центрами найвіддаленіших пробоїн. СТВ — середня точка влучання. Перекіс фото виправляє крок «Вирівняти» після вибору фото.')));
}

/**
 * Нова мішень: камера або галерея → дані → розмітка. Окрема кнопка камери потрібна, бо Android
 * на звичайний вибір картинки відкриває системний вибір фото, де камери немає.
 */
function newTarget(prefill = {}) {
  const source = (camera, ico, title, sub) => h('button', {
    type: 'button', class: `photo-src${camera ? ' main' : ''}`, onclick: () => { close(); pickTargetPhoto(prefill, camera); },
  }, h('span', { class: 'photo-src-ico' }, icon(ico)), h('b', {}, title), h('small', {}, sub));
  const close = sheet(t('Нова мішень'), h('div', {},
    h('div', { class: 'photo-srcs' },
      source(true, 'camera', t('Сфотографувати'), t('Камера телефону')),
      source(false, 'gallery', t('З галереї'), t('Готове фото'))),
    h('p', { class: 'muted small' }, t('Мішень — повністю в кадрі: перекіс вирівняєте на наступному кроці.'))));
}

/** Вибір фото мішені. Викликати з обробника натискання — інакше браузер не відкриє камеру чи вибір файлу. */
function pickTargetPhoto(prefill, camera) {
  const input = h('input', { type: 'file', accept: 'image/*', capture: camera ? 'environment' : undefined, hidden: true });
  input.addEventListener('cancel', () => input.remove());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    let photo;
    try {
      photo = await (await alignMod()).alignTarget(file, { max: TARGET_PHOTO });
    } catch (err) {
      toast(err.message);
      return;
    }
    if (photo) targetForm(null, { photo, ...prefill });
  });
  document.body.append(input);
  input.click();
}

async function runMarking(blob, tg) {
  try {
    const marks = await markTarget(blob, tg, {
      distance: tg.distance, unit: targetUnit, click: tg.click, scaleMm: Number(recall('shooters-log:scale-mm')) || 100,
      holeMm: M.bulletMm(findWeapon(tg.weaponId)?.caliber ?? findCartridge(tg.cartridgeId)?.caliber),
    });
    if (marks?.scale?.mm) remember('shooters-log:scale-mm', marks.scale.mm);
    return marks;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function targetForm(tg, { photo = null, movement = null, score = null, weaponId = null, scopeId = null, cartridgeId = null, distance = null, zeroUp = null, suppressor = null, note = null, onDone = null } = {}) {
  const lastOf = (id) => state.targets.filter((x) => x.weaponId === id).sort(M.byDateDesc)[0];
  const gunId = [tg?.weaponId, movement?.weaponId, score?.weaponId, weaponId, recall('shooters-log:target-gun')].find((id) => id && findWeapon(id)) ?? '';
  const guns = state.weapons.filter((w) => !w.archived || w.id === gunId).sort(byName);
  const ammoId = [tg?.cartridgeId, movement?.cartridgeId, cartridgeId, gunId && recall(`ammo:${gunId}`)].find((id) => id && findCartridge(id)) ?? '';
  const ammo = (id) => [['', t('— не вказувати —')],
    ...caliberOptions(state.cartridges.filter((c) => !c.archived || c.id === ammoId), findWeapon(id)?.caliber).options];
  const scopeOf = (wid, sid) => findWeapon(wid)?.scopes?.find((s) => s.id === sid) ?? null;
  // Приціл: із запису стрільби, з останньої мішені цього ствола, інакше основний.
  const pickScope = (wid) => [movement?.weaponId === wid ? movement.scopeId : null, lastOf(wid)?.scopeId]
    .map((id) => scopeOf(wid, id)).find(Boolean) ?? M.defaultScope(findWeapon(wid));
  const scope0 = tg && 'scopeId' in tg ? scopeOf(gunId, tg.scopeId) : (scopeId && scopeOf(gunId, scopeId)) || pickScope(gunId);
  const distance0 = tg?.distance ?? score?.distance ?? distance ?? lastOf(gunId)?.distance ?? (Number(recall('shooters-log:target-distance')) || 100);
  // «Влучання вище» — як у останній мішені з тим самим прицілом на тій самій дистанції
  const lastZeroUp = (sid, distance) => (sid
    ? state.targets.filter((x) => x.scopeId === sid && x.distance === distance && x.zeroUp).sort(M.byDateDesc)[0]?.zeroUp ?? '' : '');
  // …а спершу — з таблиці DOPE цього прицілу (свого набою або без набою): поправка вгору = влучання нижче
  const dopeZeroUp = (wid, sid, cid, distance) => {
    const w = findWeapon(wid);
    const scope = scopeOf(wid, sid);
    if (!scope || !(distance > 0)) return null;
    const tables = (w.dope ?? []).filter((d) => d.scopeId === sid);
    const table = tables.find((d) => cid && d.cartridgeId === cid) ?? tables.find((d) => !d.cartridgeId);
    const mrad = table ? M.dopeAt(table.rows, distance, scope.zero) : null;
    return mrad === null ? null : { cm: Math.round(-mrad * distance) / 10, mrad, table };
  };
  // Дата, час, погода й координати — з мішені, інакше зі стрільби чи результату вправи, з яких її відкрили
  const when0 = tg ?? movement ?? (score ? { ...score, time: score.clock } : null);
  const f = form([
    { name: 'weaponId', label: t('Зброя'), type: 'select', value: gunId, options: [['', t('— не вказувати —')], ...guns.map((w) => [w.id, w.name])] },
    { name: 'scopeId', label: t('Який приціл'), type: 'select', value: scope0?.id ?? '', options: scopeOptions(findWeapon(gunId)) },
    { name: 'click', label: t('Ціна кліку'), type: 'select',
      options: clickChoices(tg?.click, ...guns.flatMap((w) => (w.scopes ?? []).map((s) => s.click))),
      value: tg?.click ?? scope0?.click ?? lastOf(gunId)?.click ?? 'mil0.1' },
    { name: 'cartridgeId', label: t('Набої'), type: 'select', value: ammoId, options: ammo(gunId) },
    { name: 'distance', label: t('Дистанція, м'), type: 'number', step: 'any', min: 0, required: true, value: distance0 },
    { name: 'zeroUp', label: t('Влучання вище точки прицілювання, см'), type: 'number', step: 'any', wide: true,
      value: tg ? tg.zeroUp ?? '' : zeroUp ?? lastZeroUp(scope0?.id, distance0),
      hint: t('Якщо пристрілка на іншу дистанцію — скільки за балістичною таблицею, нижче — з мінусом. Порожньо — у точку прицілювання.') },
    ...whenFields(when0),
    { name: 'note', label: t('Примітка'), placeholder: t('Серія, умови, що випробувано…'), value: tg?.note ?? note ?? '', wide: true },
  ]);
  const distanceChips = qtyChips(f.inputs.distance, [25, 50, 100, 200, 300, 400, 500]);
  distanceChips.classList.add('chips-sm');
  // Приціл пристріляний на іншу дистанцію — у точку прицілювання на цій дистанції куля не прийде.
  const zeroWarn = h('small', { class: 'warn-text' });
  f.inputs.zeroUp.after(zeroWarn);
  const scopeField = f.inputs.scopeId.closest('.field');
  scopeField.hidden = !findWeapon(gunId)?.scopes?.length;
  const selectedScope = () => scopeOf(f.inputs.weaponId.value, f.inputs.scopeId.value);
  // Своє значення «влучання вище» не перезаписуємо підказкою з минулих мішеней.
  let zeroTyped = !!tg || zeroUp != null;
  const repaintAmmo = ammoPicker(f.inputs.cartridgeId, findWeapon(gunId)?.caliber);
  weaponPicker(f.inputs.weaponId);
  const paintScope = scopePicker(f.inputs.scopeId, () => findWeapon(f.inputs.weaponId.value));
  const paintClick = listPicker(f.inputs.click, { title: t('Ціна кліку прицілу'), item: () => null });
  caliberWarnLine(f.inputs.cartridgeId.closest('.field'), () => findCartridge(f.inputs.cartridgeId.value),
    () => findWeapon(f.inputs.weaponId.value), [f.inputs.weaponId, f.inputs.cartridgeId]);
  const zeroSrc = h('small', { class: 'muted' });
  zeroWarn.after(zeroSrc);
  f.inputs.zeroUp.addEventListener('input', () => { zeroTyped = true; zeroSrc.textContent = ''; });
  const showZero = () => {
    const distance = Number(f.inputs.distance.value);
    const dope = dopeZeroUp(f.inputs.weaponId.value, f.inputs.scopeId.value, f.inputs.cartridgeId.value, distance);
    if (!zeroTyped) f.inputs.zeroUp.value = dope ? dope.cm || '' : lastZeroUp(selectedScope()?.id, distance);
    zeroSrc.textContent = !zeroTyped && dope?.cm
      ? t('З таблиці DOPE: {v} на {d} м', { v: elevText(dope.mrad, selectedScope()?.click), d: fmt.num(distance) }) : '';
    const zero = selectedScope()?.zero;
    zeroWarn.textContent = zero && distance > 0 && zero !== distance
      ? t('Приціл пристріляний на {z} м, мішень — {d} м.', { z: fmt.num(zero), d: fmt.num(distance) }) : '';
  };
  // Вибрали приціл — з нього ціна клацання; свого значення прицілу в списку ще може не бути.
  const onScope = () => {
    const click = selectedScope()?.click;
    if (click) {
      if (![...f.inputs.click.options].some((o) => o.value === click)) f.inputs.click.append(h('option', { value: click }, clickLabel(click)));
      f.inputs.click.value = click;
      paintClick();
    }
    showZero();
  };
  f.inputs.distance.addEventListener('input', showZero);
  f.inputs.scopeId.addEventListener('change', onScope);
  f.inputs.cartridgeId.addEventListener('change', showZero);
  showZero();
  // Записане в мішені (чи в старій стрільбі, з якої її розмічають); інакше — як минулого разу з цим стволом
  const gear = gearFields(() => findWeapon(f.inputs.weaponId.value),
    tg ?? (movement && 'suppressor' in movement && movement.weaponId === gunId ? movement
      // З майстра пристрілки — глушник, як там вибрано; упор — як минулого разу
      : typeof suppressor === 'boolean' ? { suppressor, rest: lastGear(findWeapon(gunId)).rest } : null));
  f.inputs.weaponId.addEventListener('change', () => {
    gear.reset();
    const id = f.inputs.weaponId.value;
    const keep = f.inputs.cartridgeId.value;
    f.inputs.cartridgeId.replaceChildren(...selectOptions(ammo(id), keep).filter(Boolean));
    repaintAmmo();
    const w = findWeapon(id);
    f.inputs.scopeId.replaceChildren(...selectOptions(scopeOptions(w), pickScope(id)?.id ?? '').filter(Boolean));
    paintScope();
    scopeField.hidden = !w?.scopes?.length;
    onScope();
  });
  const when = whereWhenBox(f, { gps: when0?.gps ?? null });
  // Дванадцять полів поспіль губилися: розкладаємо за змістом — чим стріляли, на яку дистанцію, коли й за якої погоди.
  const fieldOf = (name) => f.inputs[name].closest('.field');
  const group = (title, ...parts) => box(title, h('div', { class: 'form' }, parts));
  const body = h('div', { class: 'tg-form' },
    group(t('Зброя й набій'), fieldOf('weaponId'), fieldOf('cartridgeId'), ...gear.fields),
    group(t('Приціл'), fieldOf('scopeId'), fieldOf('click')),
    group(t('Дистанція'), fieldOf('distance'), distanceChips, fieldOf('zeroUp')),
    when.el,
    h('div', { class: 'form' }, fieldOf('note')));
  const close = sheet(tg ? t('Мішень: дані') : t('Нова мішень'), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(tg ? t('Зберегти') : t('Далі: розмітка'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.distance > 0)) { fieldError(f.inputs.distance, t('Вкажіть дистанцію')); return; }
    const fields = {
      weaponId: v.weaponId || null, scopeId: selectedScope()?.id ?? null, cartridgeId: v.cartridgeId || null, distance: v.distance, date: v.date || null,
      click: f.inputs.click.value || null, zeroUp: Number(v.zeroUp) || null, time: v.time || null, note: v.note, ...when.values(),
      ...gear.values(),
    };
    remember('shooters-log:target-distance', v.distance);
    remember('shooters-log:target-gun', fields.weaponId);
    close();
    if (tg) {
      await saveEntity('targets', { ...tg, ...fields });
      targetDetail(findTarget(tg.id) ?? tg);
      return;
    }
    // Нова мішень пишеться одним записом уже з розміткою; скасували розмітку — нічого не зберігаємо.
    // Вирівняли по листу відомого розміру — масштаб уже є: краї фото = краї листа. Лінії — біля країв, щоб не лягали на пробоїни.
    const sheet = photo.sheet;
    const draft = {
      id: db.uid(), created: Date.now(), photoId: db.uid(), movementId: movement?.id ?? null, scoreId: score?.id ?? null,
      scale: sheet ? { a: [0, 0.03], b: [1, 0.03], mm: sheet.w } : null,
      ...(sheet ? { scale2: { a: [0.03, 0], b: [0.03, 1], mm: sheet.h } } : {}),
      poa: null, groups: [], ...fields,
    };
    const marks = await runMarking(photo.blob, draft);
    if (!marks) { toast(t('Мішень не збережено')); return; }
    const record = { ...draft, ...marks };
    await db.write({
      targets: { put: [record] },
      photos: { put: [{ id: draft.photoId, targetId: record.id, created: Date.now(), thumb: photo.thumb, w: photo.w, h: photo.h, driveId: null }] },
      blobs: { put: [{ id: draft.photoId, blob: photo.blob }] },
    });
    await refresh();
    confirmed([record.id]);
    if (onDone) { onDone(findTarget(record.id) ?? record, { w: photo.w, h: photo.h }); return; }
    targetDetail(findTarget(record.id) ?? record);
  }
}

/**
 * Вирівняти фото вже розміченої мішені. Відмітки переносимо тим самим перетворенням, що й фото;
 * що опинилося поза кадром — прибираємо й кажемо про це.
 */
async function realignTarget(tg) {
  const photo = targetPhoto(tg);
  const back = () => targetDetail(findTarget(tg.id) ?? tg);
  const blob = await fullPhoto(photo);
  if (!blob) { toast(t('Повне фото ще не завантажилося — змінити можна після синхронізації')); back(); return; }
  // Оригінал лежить лише на цьому пристрої (не синхронізується): на іншому кнопки «Оригінал» не буде
  const origBlob = tg.orig ? await db.getBlob(tg.orig.photoId) : null;
  let res;
  try {
    res = await (await alignMod()).alignTarget(blob, { max: TARGET_PHOTO, again: true, original: Boolean(origBlob) });
  } catch (err) {
    toast(err.message);
  }
  if (!res) { back(); return; }
  if (res.original) { await restoreOriginal(tg, photo, origBlob); back(); return; }
  const inside = (p) => p && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1;
  const move = (p) => (p ? res.transform(p) : null);
  let lost = 0;
  const groups = (tg.groups ?? []).map((g) => ({
    ...g,
    holes: g.holes.map(move).filter((p) => {
      if (inside(p)) return true;
      lost += 1;
      return false;
    }),
  })).filter((g) => g.holes.length);
  // Лінія масштабу переїжджає разом із фото: міліметри між її кінцями ті самі. Кінець поза кадром — ставити заново.
  let scaleLost = false;
  const moveLine = (line) => {
    if (!line?.a || !line?.b) return line ?? null;
    const a = move(line.a);
    const b = move(line.b);
    if (inside(a) && inside(b)) return { ...line, a, b };
    scaleLost = true;
    return { a: null, b: null, mm: line.mm };
  };
  const sheet = res.sheet;
  const marks = sheet
    ? { scale: { a: [0, 0.03], b: [1, 0.03], mm: sheet.w }, scale2: { a: [0.03, 0], b: [0.03, 1], mm: sheet.h } }
    : { scale: moveLine(tg.scale), scale2: moveLine(tg.scale2) };
  const poa = move(tg.poa);
  const id = db.uid();
  const oldDrive = (await db.get('photos', photo.id))?.driveId;
  // Кути оригіналу в координатах нового фото — за ними відмітки повернуться назад (див. restoreOriginal).
  // Перше вирівнювання: оригіналом стає теперішнє фото, його файл не видаляємо. Кут за обрієм — оригінал уже не повернути
  const keep = tg.orig ?? { photoId: photo.id, quad: [[0, 0], [1, 0], [1, 1], [0, 1]] };
  const quad = keep.quad.map(move);
  const orig = quad.every(Boolean) && (tg.orig ? origBlob : true) ? { photoId: keep.photoId, quad } : null;
  const dropBlobs = [photo.id, ...(tg.orig && !orig ? [tg.orig.photoId] : [])].filter((x) => x !== orig?.photoId);
  await db.write({
    targets: { put: [{ ...tg, ...marks, poa: inside(poa) ? poa : null, groups, photoId: id, orig }] },
    photos: { put: [{ ...photo, id, thumb: res.thumb, w: res.w, h: res.h, driveId: null }], del: [photo.id] },
    blobs: { put: [{ id, blob: res.blob }], del: dropBlobs },
  });
  sync.trashPhoto(oldDrive);
  await refresh();
  confirmed([tg.id]);
  const notes = [lost ? t('Поза кадром лишилися пробоїни: {n} — прибрано', { n: lost }) : null,
    scaleLost && !sheet ? t('Лінія масштабу вийшла за кадр — поставте її заново в розмітці') : null].filter(Boolean);
  if (notes.length) toast(notes.join(' '));
  back();
}

/**
 * Повернути оригінал фото: відмітки — назад через перетворення, зворотне до збереженого (кути оригіналу в координатах
 * теперішнього фото). Що випало за оригінал — прибираємо; лінії масштабу теж повертаються.
 */
async function restoreOriginal(tg, photo, origBlob) {
  const { quadToSquare, squareToQuad } = await alignMod();
  const back = quadToSquare(squareToQuad(tg.orig.quad));
  const inside = (p) => p && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1;
  const move = (p) => (p ? back(p) : null);
  const groups = (tg.groups ?? []).map((g) => ({ ...g, holes: g.holes.map(move).filter(inside) })).filter((g) => g.holes.length);
  const moveLine = (line) => {
    if (!line?.a || !line?.b) return line ?? null;
    const a = move(line.a);
    const b = move(line.b);
    return inside(a) && inside(b) ? { ...line, a, b } : { a: null, b: null, mm: line.mm };
  };
  const poa = move(tg.poa);
  // прев'ю — зі зменшеної копії, розміри — справжні; сам файл оригіналу не перестискаємо
  const src = await decode(origBlob);
  const [w, hh] = [src.width, src.height];
  const { thumb } = await pack(draw(src, 480));
  src.close?.();
  const id = db.uid();
  const oldDrive = (await db.get('photos', photo.id))?.driveId;
  await db.write({
    targets: { put: [{ ...tg, scale: moveLine(tg.scale), scale2: moveLine(tg.scale2), poa: inside(poa) ? poa : null, groups, photoId: id, orig: null }] },
    photos: { put: [{ ...photo, id, thumb, w, h: hh, driveId: null }], del: [photo.id] },
    blobs: { put: [{ id, blob: origBlob }], del: [photo.id, tg.orig.photoId] },
  });
  sync.trashPhoto(oldDrive);
  await refresh();
  confirmed([tg.id]);
  toast(t('Фото повернуто, яким було до вирівнювання'));
}

async function editMarks(tg) {
  const blob = await fullPhoto(targetPhoto(tg));
  if (!blob) { toast(t('Повне фото ще не завантажилося — змінити можна після синхронізації')); return; }
  const marks = await runMarking(blob, tg);
  if (!marks) return;
  await saveEntity('targets', { ...tg, ...marks });
  targetDetail(findTarget(tg.id) ?? tg);
}

/**
 * Координати пристрою; null — геолокація недоступна або людина не дозволила.
 * Дозвіл питає сам браузер при першому запиті; увімкнути GPS застосунок не може — лише підказати.
 */
function devicePosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { toast(t('Геолокація недоступна')); resolve(null); return; }
    const why = {
      1: t('Доступ до місцезнаходження заборонено — дозвольте його цьому сайту в налаштуваннях браузера'),
      2: t('Увімкніть геолокацію (GPS) на телефоні'),
    };
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (err) => { toast(why[err.code] ?? t('Не вдалося визначити координати')); resolve(null); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}

/** Рядок координат у формі: записує їх кнопка погоди, тут їх видно, можна відкрити на карті й прибрати. */
function gpsEditor(initial = null, onClear = null) {
  let gps = initial;
  const text = h('span', { class: 'muted small' });
  const el = h('div', { class: 'tg-gps' }, text,
    toolBtn('map', t('Відкрити на карті'), () => openMap(gps), 'small'),
    toolBtn('delete', t('Прибрати координати'), () => { set(null); onClear?.(); }, 'small'));
  const set = (value) => {
    gps = value;
    el.hidden = !gps;
    text.textContent = gps ? `${t('Координати')}: ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} ± ${Math.round(gps.acc)} ${t('м')}` : '';
  };
  set(gps);
  return { el, get: () => gps, set };
}

/** Поля блоку «Де, коли, погода» для form(): дата, час і погода; prev — уже записане (його час — у полі timeKey). */
function whenFields(prev, { date = M.today(), dateType = 'date', timeKey = 'time' } = {}) {
  const day = prev?.date ?? date;
  const hours = Array.from({ length: 12 }, (_, i) => [String(i + 1), t('з {n} год', { n: i + 1 })]);
  return [
    { name: 'date', label: t('Дата'), type: dateType, required: true, half: true, value: day },
    // Новий запис на сьогодні — зараз; на минулу дату час невідомий
    { name: timeKey, label: t('Час'), type: 'time', half: true, value: prev?.[timeKey] ?? (day === M.today() && !prev?.date ? nowHm() : '') },
    { name: 'temp', label: t('Температура, °C'), type: 'number', step: 'any', half: true, value: prev?.temp ?? '' },
    { name: 'wind', label: t('Вітер, м/с'), type: 'number', step: 'any', min: 0, half: true, value: prev?.wind ?? '' },
    { name: 'windClock', label: t('Звідки вітер'), type: 'select', value: prev?.windClock ? String(prev.windClock) : '', options: [['', '—'], ...hours],
      hint: t('За годинником відносно напрямку стрільби: 12 — в обличчя, 3 — справа.') },
    { name: 'windGuess', label: t('Вітер на око, м/с'), type: 'number', step: 'any', min: 0, value: prev?.windGuess ?? '',
      hint: t('Своя оцінка, до приладу й прогнозу: порівняння покаже, де помиляєшся.') },
  ];
}

/**
 * Блок «Де, коли, погода» — однаковий у стрільбі, мішені й вправі: lead (де / що) зверху, дата й час,
 * погода з кнопкою «Підтягнути», вітер циферблатом, координати. f — форма з полями whenFields().
 */
function whereWhenBox(f, { gps = null, timeKey = 'time', lead = [], onChange = null, note = '' } = {}) {
  clockPicker(f.inputs.windClock, { speed: f.inputs.wind, hideSpeed: true });
  const geo = gpsEditor(gps, onChange);
  const info = h('small', { class: 'muted tg-weather-note' }, note);
  const button = toolBtn('locate', t('Підтягнути погоду'), async () => {
    const day = f.values().date;
    const w = await pullWeather({ date: typeof day === 'string' ? day : '', time: f.inputs[timeKey], gps: geo, button, info });
    if (!w) return;
    // Поля числові — значення з крапкою, не через fmt (там кома).
    f.inputs.temp.value = String(Math.round(w.temp * 10) / 10);
    f.inputs.wind.value = String(Math.round(w.wind * 10) / 10);
    f.inputs.wind.dispatchEvent(new Event('input', { bubbles: true }));
    info.textContent = t('Вітер з {dir} ({deg}°), пориви до {gust} м/с — годину оберіть самі.', {
      dir: compass()[Math.round(w.dir / 45) % 8], deg: Math.round(w.dir), gust: fmt.num(Math.round(w.gust ?? w.wind)),
    });
    onChange?.();
  }, 'tg-pull');
  const fieldOf = (name) => f.inputs[name].closest('.field');
  // Згорнутий блок не ховає головного: у шапці — що/де, дата, час і погода
  const summary = h('span', { class: 'box-sum' });
  const sum = () => {
    const v = f.values();
    summary.textContent = whenSummary({ ...v, date: typeof v.date === 'string' ? v.date : null, time: v[timeKey], note: lead.length ? v.note : null });
  };
  const el = box(t('Де, коли, погода'), h('div', {},
    lead.length ? h('div', { class: 'form' }, lead) : null,
    h('div', { class: 'form when' }, fieldOf('date'), fieldOf(timeKey)),
    h('div', { class: 'form tg-weather' }, fieldOf('temp'), fieldOf('wind'), button, fieldOf('windClock'), fieldOf('windGuess')),
    info, geo.el), { fold: 'when', summary });
  el.addEventListener('input', sum);
  el.addEventListener('change', sum);
  // Чипи «де / що» і «Підтягнути погоду» міняють поля без подій введення
  el.addEventListener('click', () => setTimeout(sum));
  if (onChange) el.addEventListener('change', onChange);
  sum();
  const values = () => {
    const v = f.values();
    return { temp: v.temp, wind: v.wind, windClock: v.windClock ? Number(v.windClock) : null, windGuess: v.windGuess, gps: geo.get() };
  };
  return { el, values, note: () => info.textContent };
}

/** Шапка згорнутого блоку «Де, коли, погода»: що/де, дата, час і погода одним рядком. */
function whenSummary({ note = null, date = null, time = null, temp = null, wind = null }) {
  return [note, date ? fmt.date(date).slice(0, 5) : null, time,
    temp !== null && temp !== undefined && temp !== '' ? `${fmt.num(temp)} °C` : null, wind ? `${fmt.num(wind)} ${t('м/с')}` : null].filter(Boolean).join(' · ');
}

/** Той самий блок для перегляду: що/де (lead), дата з часом, погода й координати; згортається разом із формами. */
function whereWhenView(x, { timeKey = 'time', lead = null } = {}) {
  const when = [x.date ? fmt.date(x.date) : null, x[timeKey]].filter(Boolean).join(' ');
  const rows = [lead ? [t('Де / що'), lead] : null, when ? [t('Дата'), when] : null, ...weatherRows(x)].filter(Boolean);
  if (!rows.length) return null;
  const summary = h('span', { class: 'box-sum' }, whenSummary({ ...x, time: x[timeKey], note: lead }));
  return box(t('Де, коли, погода'), h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])), { fold: 'when', summary });
}

// Підказка «вітер з …» після «Підтягнути погоду» у правці стрільби: шторка перемальовується після збереження
const pulledNote = new Map();

/** Правка «Де, коли, погода» стрільби в журналі: кожна зміна зберігається одразу; нова дата — і для всієї пачки. */
function whenEditBlock(m, linked) {
  const f = form([{ name: 'note', label: t('Де / що'), placeholder: t('Полігон, тренування…'), value: m.note ?? '' }, ...whenFields(m)]);
  let block = null;
  const commit = async () => {
    const v = f.values();
    if (!v.date) { fieldError(f.inputs.date, t('Заповніть поле «{label}»', { label: t('Дата') })); return; }
    pulledNote.set(m.id, block.note());
    const cur = freshMovement(m);
    // Дата спільна для пачки: зібрані гільзи — того ж дня, що стрільба
    const moved = v.date !== cur.date ? linked.map((x) => ({ ...x, date: v.date })) : [];
    await db.write({ movements: { put: [{ ...cur, note: v.note || undefined, date: v.date, time: v.time || undefined, ...block.values() }, ...moved] } });
    await refresh();
    confirmed([m.id]);
  };
  const noteChips = chips(noteSuggestions(), '', (v) => { f.inputs.note.value = v; commit(); });
  noteChips.classList.add('chips-sm');
  block = whereWhenBox(f, { gps: m.gps ?? null, lead: [f.inputs.note.closest('.field'), noteChips], onChange: commit, note: pulledNote.get(m.id) ?? '' });
  return block.el;
}

/** Координати рядком картки: цифри й кнопка карти. */
const gpsValue = (gps) => h('span', { class: 'kv-gps' }, `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`,
  toolBtn('map', t('Відкрити на карті'), () => openMap(gps), 'small'));

/** Погода й координати запису — рядками [підпис, значення] для блоку умов. */
const weatherRows = (x) => [weatherText(x) ? [t('Погода'), weatherText(x)] : null, x.gps ? [t('Координати'), gpsValue(x.gps)] : null].filter(Boolean);

/**
 * Погода за координатами (Open-Meteo, без ключа): сьогодні в межах години — поточна, інакше — на дату й годину запису.
 * Координат ще немає — бере з пристрою. null — не вийшло (причину вже показано). date — ISO.
 */
async function pullWeather({ date: day, time: timeInput, gps, button, info }) {
  const date = day || M.today();
  const time = timeInput.value;
  const now = date === M.today() && (!time || Math.abs(minutesOf(time) - minutesOf(nowHm())) <= 60);
  if (!now && !time) { fieldError(timeInput, t('Вкажіть час — погода потрібна на конкретну годину')); return null; }
  button.disabled = true;
  info.textContent = t('Визначаю…');
  try {
    if (!gps.get()) gps.set(await devicePosition());
    if (!gps.get()) { info.textContent = ''; return null; }
    return await weatherAt(gps.get(), now ? null : { date, time });
  } catch {
    info.textContent = '';
    toast(t('Не вдалося отримати погоду'));
    return null;
  } finally {
    button.disabled = false;
  }
}

/** Точка в Google Картах — на телефоні відкривається застосунок Карт. */
function openMap({ lat, lon }) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`, '_blank', 'noopener');
}

/** Звідки вітер — вісім сторін, від півночі за годинниковою стрілкою (крок 45°). */
const compass = () => [t('півночі'), t('північного сходу'), t('сходу'), t('південного сходу'),
  t('півдня'), t('південного заходу'), t('заходу'), t('північного заходу')];

/** «14:40» → 880 хвилин від півночі. */
const minutesOf = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
/** Поточний час «ГГ:ХХ». */
const nowHm = () => new Date().toTimeString().slice(0, 5);

const WEATHER_VARS = ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'];

/**
 * Погода з Open-Meteo, без ключа. at = null — зараз, інакше { date, time } — найближча година того дня
 * за місцевим часом точки. Прогнозний сервіс тримає ~3 місяці назад, старіше — архів.
 * Координати округлені до ~1 км — для погоди точніше не треба.
 */
async function weatherAt({ lat, lon }, at = null) {
  const q = { latitude: lat.toFixed(2), longitude: lon.toFixed(2), wind_speed_unit: 'ms' };
  let host = 'api.open-meteo.com/v1/forecast';
  if (at) {
    Object.assign(q, { hourly: WEATHER_VARS.join(), start_date: at.date, end_date: at.date, timezone: 'auto' });
    if (Date.now() - Date.parse(at.date) > 60 * 86_400_000) host = 'archive-api.open-meteo.com/v1/archive';
  } else {
    q.current = WEATHER_VARS.join();
  }
  const res = await fetch(`https://${host}?${new URLSearchParams(q)}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  let pick = (v) => json.current[v];
  if (at) {
    const hour = String(Math.min(23, Math.round(minutesOf(at.time) / 60))).padStart(2, '0');
    const i = json.hourly.time.indexOf(`${at.date}T${hour}:00`);
    if (i < 0 || json.hourly.temperature_2m[i] === null) throw new Error('Open-Meteo: no data');
    pick = (v) => json.hourly[v][i];
  }
  const [temp, wind, dir, gust] = WEATHER_VARS.map(pick);
  return { temp, wind, dir, gust };
}

function weatherText(tg) {
  return [tg.temp !== null && tg.temp !== undefined && tg.temp !== '' ? `${fmt.num(tg.temp)} °C` : null,
    tg.wind ? t('вітер {v} м/с', { v: fmt.num(tg.wind) }) + (tg.windClock ? ` ${t('з {n} год', { n: tg.windClock })}` : '') : null,
    tg.windGuess !== null && tg.windGuess !== undefined && tg.windGuess !== '' ? t('на око {v} м/с', { v: fmt.num(tg.windGuess) }) : null]
    .filter(Boolean).join(' · ');
}

/**
 * Пари «вітер на око — виміряний» з журналу для тренажера «Визнач вітер»: стрільби й мішені.
 * Результат вправи пише свою стрільбу з тією ж погодою, тож оцінки вправ тут уже є; однакові пари одного дня — один раз.
 */
function windGuesses() {
  const seen = new Set();
  return [...state.movements.filter((m) => m.kind === 'shot'), ...state.targets]
    .filter((x) => Number(x.wind) > 0 && x.windGuess !== null && x.windGuess !== undefined && x.windGuess !== '')
    .map((x) => ({ date: x.date, wind: Number(x.wind), guess: Number(x.windGuess) }))
    .filter((x) => { const key = `${x.date}|${x.wind}|${x.guess}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

const targetScope = (tg) => findWeapon(tg.weaponId)?.scopes?.find((s) => s.id === tg.scopeId) ?? null;

/** Приціл одним рядком: назва й дистанція пристрілки. */
function scopeText(s) {
  return [s.name, s.zero ? t('пристрілка {n} м', { n: fmt.num(s.zero) }) : null].filter(Boolean).join(' · ');
}

// Ключ ціни клацання: одиниця й число — 'mil0.1', 'moa0.25', 'mm13' (мм на 100 м); ¼″ на 100 ярдів (Burris) — 'moa0.2387'.
const CLICK_KEY = /^(mil|moa|mm)([\d.]+)$/;
const OWN_CLICK = 'own';

/** Своє значення ціни клацання → ключ виду 'mil0.2'; null — порожньо або не додатне число. */
function ownClickKey(value, unit) {
  const v = Number(String(value).replace(',', '.'));
  return v > 0 ? `${unit}${+v.toFixed(4)}` : null;
}

/** Підпис ціни клацання: зі списку або своє значення — «0,2 MRAD», «0,24 MOA», «10 мм / 100 м». */
function clickLabel(key) {
  const row = CLICKS.find(([k]) => k === key);
  if (row) return t(row[1]);
  const m = CLICK_KEY.exec(key ?? '');
  if (!m) return null;
  const v = String(Number(m[2])).replace('.', ',');
  return m[1] === 'mm' ? t('{v} мм / 100 м', { v }) : `${v} ${m[1] === 'moa' ? 'MOA' : 'MRAD'}`;
}

/** Чіпи ціни клацання в мішені: стандартні плюс свої значення з прицілів і самої мішені. */
function clickChoices(...keys) {
  const own = [...new Set(keys.filter((k) => k && !CLICKS.some(([c]) => c === k) && CLICK_KEY.test(k)))];
  return [...CLICKS.map(([k, label]) => [k, t(label)]), ...own.map((k) => [k, clickLabel(k)])];
}

/** Ціна клацання плюс скільки це сантиметрів на цій дистанції: «0,1 MRAD · 3,0 см на 300 м». */
function clickAtDistance(key, distance) {
  const label = clickLabel(key);
  const c = M.clickValue(key);
  const cm = c && distance > 0 ? M.fromMrad(M.toMrad(c.value, c.unit), 'cm', distance) : null;
  return cm ? `${label} · ${t('{v} см на {d} м', { v: fmt.num(Math.round(cm * 10) / 10), d: fmt.num(distance) })}` : label;
}

/** Поправка крупно: стрілка, клацання, напрямок як на барабані. */
function fixPanel(fixes, click) {
  if (!M.clickValue(click)) return h('p', { class: 'muted small' }, t('Вкажіть ціну кліку в даних мішені — з’явиться поправка.'));
  if (!fixes.length) return h('div', { class: 'tg-fix ok' }, `✓ ${t('Поправка не потрібна')}`);
  return h('div', { class: 'tg-fix' },
    h('div', { class: 'tg-fix-title' }, t('Поправка')),
    fixes.map((f) => h('div', { class: 'tg-fix-row' },
      h('span', { class: 'tg-fix-arrow', 'aria-hidden': 'true' }, f.arrow),
      h('b', {}, `${f.clicks} ${t('кл.')}`),
      h('span', {}, f.word),
      h('span', { class: 'muted' }, `${num(f.angle, 2)} ${f.unit}`))));
}

/** Значок мірки: що саме намальовано на фото — лінія між крайніми, коло середнього радіуса, рамка габариту. */
const METRIC_ICON = {
  spread: '<circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="5" r="2.2"/><path d="M6.6 17.4 17.4 6.6"/>',
  mpi: '<path d="M12 4 20 12 12 20 4 12z"/>',
  ring: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="1.5" stroke-dasharray="3 2.5"/>',
};
function metricLabel(icon, text, color = null) {
  const ico = h('span', { class: 'metric-ico', 'aria-hidden': 'true' });
  ico.innerHTML = `<svg viewBox="0 0 24 24">${METRIC_ICON[icon]}</svg>`;
  if (color) ico.style.color = color;
  return h('span', { class: 'metric-label' }, ico, text);
}

/** Блок групи: плитки розміру, СТВ, потрібне влучання й поправка — у вибраних одиницях. */
function groupBox(g, tg, fold = false, onFocus = null) {
  const s = g.stats;
  const len = (mm) => length(mm, targetUnit, tg.distance);
  const wantUp = (tg.zeroUp || 0) * 10;
  const line = (label, value) => h('div', { class: 'tg-line' }, h('span', { class: 'muted' }, label), h('span', {}, value));
  // Розмах — і в заголовку: згорнуті групи порівнюються без розгортання.
  // Плиток дві: третя («ширина × висота») на телефоні розвалювалась на три рядки — вона рядком нижче.
  return box([
    h('i', { class: 'tg-swatch', style: `background:${COLORS[g.index % COLORS.length]}` }),
    t('Група {n}', { n: g.index + 1 }),
    h('span', { class: 'box-count' }, [t('{n} постр.', { n: s.n }), s.n >= 2 ? len(s.spread) : null].filter(Boolean).join(' · ')),
  ], [
    s.n >= 2 ? h('div', { class: 'stats even tg-tiles' },
      stat(metricLabel('spread', t('Розкид')), len(s.spread)),
      stat(metricLabel('ring', t('Середній радіус')), len(s.meanRadius))) : null,
    s.n >= 2 ? line(metricLabel('box', t('Ширина × висота')), size(s.width, s.height, targetUnit, tg.distance)) : null,
    s.offset ? (onFocus
      ? h('button', { type: 'button', class: 'tg-line tg-goto', 'aria-label': t('Показати групу на фото'), onclick: () => onFocus(g.index) },
        h('span', { class: 'muted' }, metricLabel('mpi', t('СТВ'), COLORS[g.index % COLORS.length])),
        h('span', {}, offsetText(s.offset, targetUnit, tg.distance)))
      : line(metricLabel('mpi', t('СТВ'), COLORS[g.index % COLORS.length]), offsetText(s.offset, targetUnit, tg.distance))) : null,
    s.offset && wantUp ? line(t('Потрібне влучання'), `${wantUp > 0 ? t('вище') : t('нижче')} ${len(Math.abs(wantUp))}`) : null,
    s.offset ? fixPanel(corrections(s, { distance: tg.distance, click: tg.click, wantUp }), tg.click) : null,
  ], fold ? { fold: `tg-group:${tg.id}:${g.index}` } : {});
}

// Мініатюри фігур, як їх малює розмітка: розкид — лінія, середній радіус — кільце навколо СТВ, габарит — пунктир.
const FIGURE_ICON = {
  spread: '<circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><path d="M6.6 15.9l10.8-7.8"/>',
  radius: '<circle cx="12" cy="12" r="8"/><path d="M12 9.5v5M9.5 12h5"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="1" stroke-dasharray="3 2.5"/>',
};

/** Що означає кожна фігура на фото мішені — пунктами, як підрахунок очок у вправах. */
function figuresLegend() {
  const item = (icon, lead, text) => {
    const pic = h('span', { class: 'tg-legend-ico', 'aria-hidden': 'true' });
    pic.innerHTML = `<svg viewBox="0 0 24 24">${FIGURE_ICON[icon]}</svg>`;
    return h('li', {}, pic, h('div', {}, h('b', {}, lead), h('div', { class: 'muted small' }, text)));
  };
  return h('div', { class: 'ex-scoring tg-legend' },
    h('div', { class: 'ex-scoring-title' }, t('Фігури на фото')),
    h('ul', { class: 'tg-legend-list' },
      item('spread', t('Розкид'), t('Лінія між крайніми пробоїнами. Про нього кажуть «група 1 MOA»; росте з числом пострілів.')),
      item('radius', t('Середній радіус'), t('Кільце навколо СТВ: середня віддаленість пробоїн від центру, всередині — приблизно половина влучань. Від числа пострілів майже не залежить, тому за ним порівнюють набої.')),
      item('box', t('Габарит'), t('Пунктирна рамка: ширина й висота групи.'))));
}

// Відкрита підказка лишається відкритою при перемальовуванні й в інших картках того ж виду
const hintOpen = {};

/** Кнопка «i», що показує й ховає панель підказки; key — вид підказки (стан спільний). */
function hintButton(panel, key) {
  panel.hidden = !hintOpen[key];
  const button = h('button', {
    type: 'button', class: 'hint-btn', 'aria-label': t('Підказка'), 'aria-expanded': String(!!hintOpen[key]),
    onclick: () => {
      // У згорнутому блоці підказку не видно — розгортаємо його разом із підказкою
      const folded = button.closest('.foldable.closed');
      hintOpen[key] = folded ? true : !hintOpen[key];
      panel.hidden = !hintOpen[key];
      button.setAttribute('aria-expanded', String(hintOpen[key]));
      folded?.querySelector(':scope > legend > .box-toggle')?.click();
    },
  }, 'i');
  return button;
}

function statsBlocks(tg, photo, onUnit, onFocus = null) {
  if (!photo) return [h('p', { class: 'muted small' }, t('Фото мішені ще не синхронізовано.'))];
  if (!M.mmPerPx(tg.scale, photo)) return [h('p', { class: 'muted small' }, t('Масштаб не задано — відкрийте розмітку й позначте дві точки з відомою відстанню.'))];
  const groups = M.targetStats(tg, photo).filter((g) => g.stats);
  if (!groups.length) return [h('p', { class: 'muted small' }, t('Пробоїни не позначені.'))];
  // «i» — одразу під фото, в ряду одиниць: підказка про те, що на фото намальовано
  const legend = groups.some((g) => g.stats.n >= 2) ? figuresLegend() : null;
  const info = legend ? hintButton(legend, 'figures') : null;
  return [
    h('div', { class: 'tg-unit-row' }, unitChips(onUnit), info),
    legend,
    ...groups.map((g) => groupBox(g, tg, groups.length > 1, onFocus)),
    tg.poa ? null : h('p', { class: 'muted small' }, t('Позначте точку прицілювання — з’являться СТВ і поправки в кліках.')),
  ].filter(Boolean);
}

function shareLines(tg, photo) {
  const lines = [
    { text: targetTitle(tg), bold: true },
    { text: [targetWhen(tg), t('{n} м', { n: fmt.num(tg.distance) }), targetScope(tg)?.name, weatherText(tg)].filter(Boolean).join(' · '), color: '#aab3a6' },
  ];
  for (const g of M.targetStats(tg, photo).filter((x) => x.stats)) {
    const [, ...rows] = groupRows(g.stats, { unit: 'all', distance: tg.distance, click: tg.click, wantUp: (tg.zeroUp || 0) * 10 });
    lines.push({ text: `${t('Група {n}', { n: g.index + 1 })} · ${t('{n} постр.', { n: g.stats.n })}`, bold: true, color: COLORS[g.index % COLORS.length] });
    for (const [k, v] of rows) lines.push({ text: `${k}: ${v}` });
  }
  return lines;
}

async function shareTarget(tg) {
  const photo = targetPhoto(tg);
  if (!photo) return;
  const blob = await db.getBlob(photo.id);
  const src = blob ? URL.createObjectURL(blob) : photo.thumb;
  let image;
  try {
    image = await shareImage(src, tg, shareLines(tg, photo), { unit: targetUnit, distance: tg.distance });
  } finally {
    if (blob) URL.revokeObjectURL(src);
  }
  const file = new File([image], `target-${tg.date ?? 'shot'}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: targetTitle(tg) }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  download(file.name, file);
}

function targetDetail(tg) {
  const photo = targetPhoto(tg);
  const shot = tg.movementId ? state.movements.find((m) => m.id === tg.movementId) : null;
  const result = tg.scoreId ? state.scores.find((x) => x.id === tg.scoreId) : null;
  const figure = h('canvas', { class: 'tg-figure' });
  // фото перемальовуємо разом із цифрами: підписи на фігурах — у тих самих одиницях,
  // тап по СТВ групи підсвічує її на фото; focus має бути оголошений до першого малювання
  let focus = null;
  // Спершу — лише група з полями (на весь лист група 2 см — пляма); тап по фото — увесь лист і назад
  let whole = false;
  function opts() { return { unit: targetUnit, distance: tg.distance, active: focus, crop: !whole }; }
  const goTo = (i) => {
    focus = focus === i ? null : i;
    drawFigure();
    figure.scrollIntoView({ behavior: smooth(), block: 'center' });
  };
  function drawFigure() {
    paintPreview(figure, photo.thumb, tg, 720, opts()).then(async (cropped) => {
      figure.title = cropped ? t('Тап — увесь лист') : whole ? t('Тап — лише група') : '';
      const blob = await db.getBlob(photo.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      try { await paintPreview(figure, url, tg, 1400, opts()); } finally { URL.revokeObjectURL(url); }
    }).catch(() => {});
  }
  figure.addEventListener('click', () => { whole = !whole; drawFigure(); });
  if (photo?.thumb) drawFigure();
  const statsBox = h('div', {});
  // зміна одиниць — і в картці, і в списку під нею
  const showStats = () => statsBox.replaceChildren(...statsBlocks(tg, photo, () => { showStats(); drawFigure(); render(); }, goTo));
  showStats();
  const remove = () => {
    close();
    confirmSheet(t('Видалити мішень?'), t('Фото й розмітку буде видалено.'), t('Видалити'), async () => {
      // Запис, фото й файл — у пам'ять: «Отменить» у тості повертає все як було.
      // Фото на Диску прибираємо, лише коли тост зник без скасування
      const ph = await db.get('photos', tg.photoId);
      const blob = await db.getBlob(tg.photoId);
      const orig = tg.orig ? await db.getBlob(tg.orig.photoId) : null;
      await db.write({ targets: { del: [tg.id] }, photos: { del: [tg.photoId] }, blobs: { del: [tg.photoId, ...(tg.orig ? [tg.orig.photoId] : [])] } });
      await refresh();
      confirmed();
      let undone = false;
      const trash = setTimeout(() => { if (!undone) sync.trashPhoto(ph?.driveId); }, 9000);
      toast(t('Мішень видалено'), {
        action: t('Скасувати'),
        onAction: async () => {
          undone = true; clearTimeout(trash);
          await db.write({ targets: { put: [tg] }, ...(ph ? { photos: { put: [ph] } } : {}), blobs: { put: [...(blob ? [{ id: tg.photoId, blob }] : []), ...(orig ? [{ id: tg.orig.photoId, blob: orig }] : [])] } });
          await refresh();
          confirmed([tg.id]);
        },
      });
    });
  };
  const close = sheet(targetTitle(tg), h('div', {},
    figure,
    statsBox,
    box(t('Умови'), h('dl', { class: 'kv' },
      h('dt', {}, t('Дистанція')), h('dd', {}, t('{n} м', { n: fmt.num(tg.distance) })),
      targetScope(tg) ? [h('dt', {}, t('Приціл')), h('dd', {}, scopeText(targetScope(tg)))] : null,
      gearText(tg) ? [h('dt', {}, t('Як стріляли')), h('dd', {}, gearText(tg))] : null,
      tg.click ? [h('dt', {}, t('Ціна кліку')), h('dd', {}, clickAtDistance(tg.click, tg.distance))] : null,
      shot ? [h('dt', {}, t('Стрільба')), h('dd', {}, h('button', {
        type: 'button', class: 'link-btn', onclick: () => { close(); movementDetail(shot); },
      }, `${fmt.date(shot.date)} · ${fmt.signed(shot.qty)}`))] : null,
      result ? [h('dt', {}, t('Вправа')), h('dd', {}, `${exerciseName(result.exercise) ?? '—'} · ${fmt.date(result.date)} · ${fmt.num(result.score)}`)] : null,
      tg.note ? [h('dt', {}, t('Примітка')), h('dd', {}, tg.note)] : null)),
    whereWhenView(tg),
    h('div', { class: 'btn-row' },
      photo ? btn([icon('align'), t('Вирівняти фото')], () => { close(); realignTarget(tg); }, 'with-ico') : null,
      btn([icon('holes'), t('Розмітка')], () => { close(); editMarks(tg); }, 'primary with-ico'))), {
    tools: [toolBtn('share', t('Поділитися'), () => shareTarget(tg).catch((err) => toast(err.message))),
      toolBtn('edit', t('Змінити'), () => { close(); targetForm(tg); })],
    // кошик — ліворуч від назви, подалі від решти кнопок
    lead: toolBtn('delete', t('Видалити'), remove, 'danger'),
    full: true,
  });
}

// ---------- рецепти та склад компонентів ----------

// Розділ «Складу». Не запам'ятовується між запусками: застосунок завжди відкривається на набоях.
let stockSeg = 'ammo';
const STOCK_SEGS = [['ammo', 'Набої', 'ammo'], ['components', 'Компоненти', 'parts'], ['recipes', 'Релоадінг', 'recipe']];

function componentLevel(c, runway) {
  if (!runway.length) return '';
  const least = runway[0].rounds;
  if (least === 0) return 'out';
  return least < LOW_ROUNDS ? 'low' : '';
}

function componentCard(c) {
  const stock = M.componentStock(state, c.id);
  const price = M.unitPrice(state, c);
  const unit = c.unit || 'шт';
  const runway = M.componentRunway(state, c);
  const card = h('article', { class: `card level-${componentLevel(c, runway) || 'ok'}`, 'data-id': c.id },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, c.name),
        h('div', { class: 'muted small' }, [
          price ? t('{price} за {unit}', { price: fmt.money(price), unit }) : c.kind === 'case' ? t('без ціни') : t('ціну не вказано'),
          stock > 0 && price ? t('на суму {sum}', { sum: fmt.money(stock * price) + usdNow(stock * price) }) : null].filter(Boolean).join(' · ')),
        runway.length
          ? h('div', { class: 'runway' }, runway.map((r) => h('div', { class: 'runway-row small' },
            h('span', { class: 'runway-name' }, r.recipe.name), ' · ',
            h('b', { class: r.rounds === 0 ? 'neg' : r.rounds < LOW_ROUNDS ? 'warn-text' : '' },
              t('вистачить на {n} шт', { n: fmt.num(r.rounds) })))))
          : h('div', { class: 'muted small' }, t('не використовується в рецептах'))),
      h('div', { class: `big ${stock < 0 ? 'neg' : stock === 0 ? 'zero' : ''}` }, fmt.num(stock), h('div', { class: 'muted small unit' }, unit))));
  return swipeable(card, {
    rightLabel: swipeLabel('buy', t('Купити')), leftLabel: swipeLabel('adjust', t('Перерахунок'), 'left'),
    onRight: () => buyComponentSheet(c),
    onLeft: () => adjustSheet(c, 'components'),
    onTap: () => componentDetail(c),
    onSwipe: learnSwipe('stock'),
  });
}

function recipeCard(r) {
  const cost = M.recipeCost(state, r);
  const lines = M.recipeLines(state, r);
  const enough = M.recipeEnough(state, r);
  const neck = M.recipeBottleneck(state, r);
  const card = h('article', { class: 'card', 'data-id': r.id },
    h('div', { class: 'swipe-body' },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, r.name),
        lines.some((l) => l.noPrice && l.component?.kind !== 'case') ? h('div', { class: 'muted small' }, t('є компоненти без ціни')) : null,
        h('div', { class: 'small enough' },
          h('b', { class: enough === 0 ? 'neg' : enough < LOW_ROUNDS ? 'warn-text' : 'pos' }, t('із запасів: {n} шт', { n: fmt.num(enough) })),
          neck ? h('span', { class: 'muted' }, ` · ${t('обмежує «{name}»', { name: neck.name })}`) : null)),
      h('div', { class: 'big money' }, fmt.money(cost), usdLine(usdSum([[cost, M.today()]])), h('div', { class: 'muted small unit' }, t('за шт')))));
  return swipeable(card, {
    rightLabel: swipeLabel('reload', t('Спорядити')),
    onRight: () => reloadSheet(r),
    onTap: () => recipeDetail(r),
    onSwipe: learnSwipe('recipes'),
  });
}

function recipesPane() {
  $('subtitle').textContent = swipeTip('recipes', t('Свайп → спорядити'), t('рецептів: {n}', { n: state.recipes.length }));
  if (!state.recipes.length) return h('div', {}, reloadGuideLink(), empty(t('Рецептів немає'), t('Спершу додайте компоненти на складі, потім рецепт.')), hideHint('reload'), articlesBox());
  // Групи за калібром — такими ж картками, як набої; без суми: рецепти ділять компоненти
  return h('div', {}, reloadGuideLink(), loadedHero(), groupBy(state.recipes, (r) => r.caliber || t('Без калібру'))
    .map(([caliber, list]) => calGroup({ caliber, list: list.sort(byName) }, { prefix: 'recipes', card: recipeCard })),
  articlesBox());
}

// ---------- статті з релоаду: свої нотатки в Markdown, правляться на комп'ютері, синхронізуються з Диском ----------

const articleDay = (a) => new Date(a.updated ?? a.created).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

function articlesBox() {
  const list = [...state.articles].sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
  const add = btn(t('+ стаття'), () => articleForm());
  const rows = list.map((a) => h('button', { type: 'button', class: 'article-row', 'data-id': a.id, onclick: () => articleView(a) },
    h('span', { class: 'article-title' }, a.title),
    excerpt(a.body) ? h('span', { class: 'muted small article-sub' }, excerpt(a.body)) : null,
    h('span', { class: 'muted small' }, articleDay(a))));
  return box(t('Статті'), list.length
    ? h('div', {}, h('div', { class: 'article-list' }, rows), h('div', { class: 'btn-row' }, add))
    : h('div', {}, h('p', { class: 'muted small' }, t('Свої нотатки зі спорядження: джамп, посадка, навіски, методика. Писати зручніше на комп’ютері — на телефон прийдуть через Google Диск.')), h('div', { class: 'btn-row' }, add)), { fold: 'articles', count: list.length });
}

const articlePhotos = (articleId) => state.photos.filter((p) => p.articleId === articleId);
const ARTICLE_IMAGE = /!\[[^\]]*\]\(photo:([\w-]+)\)/g;
const articleImageIds = (body) => new Set([...String(body ?? '').matchAll(ARTICLE_IMAGE)].map((m) => m[1]));

/**
 * Картинка статті: одразу мініатюра, потім повне фото (ще не докачане з Диска — лишається мініатюра).
 * Тап — усі картинки статті на весь екран.
 */
function articleImage(articleId) {
  return (id, alt) => {
    const photo = state.photos.find((p) => p.id === id);
    if (!photo) return h('span', { class: 'muted small' }, `[${alt || t('картинка')}]`);
    const img = h('img', { class: 'md-img', src: photo.thumb, alt: alt || '', loading: 'lazy' });
    coverUrl(photo).then((url) => { if (url) img.src = url; });
    img.addEventListener('click', () => {
      const list = articlePhotos(articleId);
      viewer(list, Math.max(0, list.findIndex((p) => p.id === id)));
    });
    return img;
  };
}

function articleView(a) {
  const body = () => {
    const cur = state.articles.find((x) => x.id === a.id);
    return cur ? h('div', {}, h('div', { class: 'md' }, renderMarkdown(cur.body, { image: articleImage(a.id) })),
      h('p', { class: 'muted small article-day' }, t('Змінено {date}', { date: articleDay(cur) }))) : null;
  };
  const tools = [
    toolBtn('edit', t('Змінити'), () => { close(); articleForm(state.articles.find((x) => x.id === a.id) ?? a); }),
    toolBtn('delete', t('Видалити'), () => {
      close();
      confirmSheet(t('Видалити статтю?'), t('«{name}» видалиться й з інших пристроїв після синхронізації.', { name: a.title }), t('Видалити'),
        async () => {
          await db.write({ articles: { del: [a.id] } });
          const photos = articlePhotos(a.id);
          if (photos.length) await removePhotos(photos);
          else await refresh();
        });
    }, 'danger'),
  ];
  const close = sheet(a.title, body(), { live: body, tools, full: true });
}

/** Редактор: текст і перегляд поруч на широкому екрані, на телефоні — перемикачем. Ctrl+S — зберегти. */
function articleForm(a = null) {
  const title = h('input', { type: 'text', class: 'article-name', value: a?.title ?? '', placeholder: t('Назва статті'), 'aria-label': t('Назва статті') });
  const src = h('textarea', {
    class: 'md-src', spellcheck: 'true', 'aria-label': t('Текст статті'),
    placeholder: t('## Заголовок\nЗвичайний текст, **жирний**, *курсив*.\n\n- пункт списку\n\n| Навіска | Швидкість |\n|---|---|\n| 43,5 gr | 2620 fps |'),
  });
  src.value = a?.body ?? '';
  // id наперед: картинки записуються одразу з articleId, ще до збереження статті
  const id = a?.id ?? db.uid();
  const preview = h('div', { class: 'md md-preview' });
  let queued = false;
  const paint = () => {
    queued = false;
    preview.replaceChildren(src.value.trim()
      ? renderMarkdown(src.value, { image: articleImage(id) })
      : h('p', { class: 'muted' }, t('Тут буде видно, як стаття виглядає')));
  };
  src.addEventListener('input', () => { if (!queued) { queued = true; requestAnimationFrame(paint); } });
  paint();

  // Кнопки розмітки: обгорнути виділене або додати префікс рядкам
  const edit = (fn) => {
    const { selectionStart: s, selectionEnd: e, value } = src;
    const [text, from, to] = fn(value.slice(s, e), value, s, e);
    src.focus();
    src.setRangeText(text, from, to, 'select');
    src.dispatchEvent(new Event('input'));
  };
  const wrap = (mark, sample) => () => edit((sel, v, s, e) => [`${mark}${sel || sample}${mark}`, s, e]);
  const prefix = (mark) => () => edit((sel, v, s, e) => {
    const start = v.lastIndexOf('\n', s - 1) + 1;
    const lines = v.slice(start, e).split('\n');
    return [lines.map((l, n) => (mark === '1. ' ? `${n + 1}. ` : mark) + l).join('\n'), start, e];
  });
  const block = (text) => () => edit((sel, v, s, e) => [`${s && v[s - 1] !== '\n' ? '\n\n' : ''}${text}\n`, s, e]);

  // Картинки: кнопкою, вставкою з буфера чи перетягуванням; кожна — фото з articleId, у тексті ![](photo:id)
  const added = [];
  const addImages = async (files) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    const lines = [];
    for (const file of images) {
      try {
        const { blob, thumb, w, h: height } = await preparePhoto(file);
        const photoId = db.uid();
        await db.write({
          photos: { put: [{ id: photoId, articleId: id, created: Date.now(), thumb, w, h: height, driveId: null }] },
          blobs: { put: [{ id: photoId, blob }] },
        });
        added.push(photoId);
        lines.push(`![](photo:${photoId})`);
      } catch (err) {
        toast(err.message);
      }
    }
    await refresh();
    if (lines.length) {
      // Після виділення, курсор — за картинкою: наступна вставка не замінить попередню
      const { selectionEnd: at, value } = src;
      src.focus();
      const gap = !at || value.slice(at - 2, at) === '\n\n' ? '' : value[at - 1] === '\n' ? '\n' : '\n\n';
      src.setRangeText(`${gap}${lines.join('\n\n')}\n`, at, at, 'end');
      src.dispatchEvent(new Event('input'));
    }
    return true;
  };
  const picker = h('input', {
    type: 'file', accept: 'image/*', multiple: true, hidden: true,
    onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; addImages(files); },
  });
  src.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addImages(files); }
  });
  src.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  src.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.some((f) => f.type.startsWith('image/'))) return;
    e.preventDefault();
    src.focus();
    addImages(files);
  });

  const tool = (label, title, onclick) => h('button', { type: 'button', class: 'md-tool', title, 'aria-label': title, onclick }, label);
  const toolbar = h('div', { class: 'md-toolbar' },
    tool('H', t('Заголовок'), prefix('## ')),
    tool(h('b', {}, 'Ж'), t('Жирний'), wrap('**', t('текст'))),
    tool(h('i', {}, 'К'), t('Курсив'), wrap('*', t('текст'))),
    tool('•', t('Список'), prefix('- ')),
    tool('1.', t('Нумерований список'), prefix('1. ')),
    tool('❝', t('Цитата'), prefix('> ')),
    tool('▦', t('Таблиця'), block(`| ${t('Навіска')} | ${t('Швидкість')} | ${t('Група')} |\n|---|---|---|\n|  |  |  |`)),
    tool('🔗', t('Посилання'), wrap('', `[${t('текст')}](https://)`)),
    tool('🖼', t('Картинка'), () => picker.click()), picker);

  // Телефон: або текст, або перегляд; на широкому екрані CSS показує обидва й ховає перемикач
  const editor = h('div', { class: 'md-editor show-src' });
  const modes = chips([['src', t('Текст')], ['view', t('Перегляд')]], 'src', (m) => {
    editor.classList.toggle('show-src', m === 'src');
    editor.classList.toggle('show-view', m === 'view');
  });
  modes.classList.add('md-modes');
  editor.append(h('div', { class: 'md-pane md-pane-src' }, toolbar, src), h('div', { class: 'md-pane md-pane-view' }, preview));

  const initial = JSON.stringify([title.value, src.value]);
  const dirty = () => JSON.stringify([title.value, src.value]) !== initial;
  let saved = false;
  // Вийшли без збереження — картинки, додані цього разу, не потрібні
  const onClose = () => {
    if (!saved && added.length) removePhotos(state.photos.filter((p) => added.includes(p.id)));
  };
  const close = sheet(a ? t('Змінити статтю') : t('Нова стаття'), h('div', { class: 'article-form' }, title, modes, editor), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
    full: true, dirty, onClose,
  });
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  };
  editor.closest('.sheet')?.addEventListener('keydown', onKey);
  if (!a) title.focus();

  async function save() {
    const name = title.value.trim();
    if (!name) { formError(t('Введіть назву статті')); title.focus(); return; }
    saved = true;
    close();
    const body = src.value.replace(/\s+$/, '');
    await saveEntity('articles', { ...(a ?? { id, created: Date.now() }), title: name, body });
    // Картинки, які прибрали з тексту, — з пристрою й у кошик Диска
    const used = articleImageIds(body);
    const unused = articlePhotos(id).filter((p) => !used.has(p.id));
    if (unused.length) await removePhotos(unused);
  }
}

/** Скільки всього споряджено й на яку суму — за собівартістю на день спорядження. */
function loadedHero() {
  const loads = state.movements.filter((m) => m.kind === 'reload');
  if (!loads.length) return null;
  const qty = loads.reduce((s, m) => s + m.qty, 0);
  const sum = loads.reduce((s, m) => s + (m.price || 0), 0);
  return h('section', { class: 'hero badge-hero' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('споряджено')),
      h('div', { class: 'hero-value' }, fmt.num(qty), h('span', { class: 'hero-unit' }, t('шт')))),
    h('div', { class: 'hero-badges' },
      heroBadge(`${fmt.num(Math.round(sum))} ${t('грн')}${usdTail(loads.map((m) => [m.price, dayOf(m)]))}`, ''),
      qty ? heroBadge(fmt.money(sum / qty), t('за шт')) : null));
}

/** Плашка праворуч у підсумку: жирне значення й підпис; cls — neg / warn. */
function heroBadge(value, label, cls = '') {
  return h('span', { class: `hero-badge ${cls}` }, h('b', {}, value), label ? ` ${label}` : null);
}

/** Склад: сума ліворуч, праворуч плашки — скільки позицій, яких немає й які закінчуються. */
function stockHero(value, count, out, low) {
  const badge = (n, label, cls) => heroBadge(fmt.num(n), label, cls);
  return h('section', { class: 'hero badge-hero' },
    h('div', {},
      h('div', { class: 'hero-label' }, t('Склад на суму')),
      // Копійки в підсумку лише заважають читати — точна сума видна в картках компонентів.
      h('div', { class: 'hero-value' }, fmt.num(Math.round(value)), h('span', { class: 'hero-unit' }, t('грн'))),
      usdLine(usdSum([[value, M.today()]]))),
    h('div', { class: 'hero-badges' },
      badge(count, plural(count, [t('позиція'), t('позиції'), t('позицій')])),
      out ? badge(out, t('немає'), 'neg') : null,
      low ? badge(low, t('закінчується'), 'warn') : null));
}

function stockPane() {
  $('subtitle').textContent = swipeTip('stock', t('Свайп → купити, ← перерахунок'), t('позицій: {n}', { n: state.components.length }));
  if (!state.components.length) return h('div', {}, empty(t('Склад порожній'), t('Додайте компоненти: кулі, порох, капсулі, гільзи, дріб, пижі.'), [addBtn()]), hideHint('reload'));
  const levels = state.components.map((c) => componentLevel(c, M.componentRunway(state, c)));
  const out = levels.filter((l) => l === 'out').length;
  const low = levels.filter((l) => l === 'low').length;
  const kinds = Object.keys(M.COMPONENT_KINDS);
  const groups = kinds.map((kind) => [kind, state.components.filter((c) => (kinds.includes(c.kind) ? c.kind : 'other') === kind).sort(byName)])
    .filter(([, list]) => list.length);
  return h('div', {},
    stockHero(M.stockValue(state), state.components.length, out, low),
    groups.map(([kind, list]) => fold(`stock:${kind}`,
      [componentIcon(kind), h('span', { class: 'fold-title' }, t(M.COMPONENT_KINDS[kind])), h('span', { class: 'fold-meta' }, t('{n} поз.', { n: list.length }))],
      () => list.map(componentCard), list.map((c) => c.id))));
}

/** «Склад»: набої, компоненти й рецепти — розділи значками, як у «Полігоні», вибраний — з назвою. */
function renderStock() {
  // Вимкнений релоадинг — лише набої, без панелі розділів
  const segs = visibleSegs(STOCK_SEGS);
  if (!segs.some(([k]) => k === stockSeg)) stockSeg = 'ammo';
  const seg = segs.length > 1 ? segBar(segs, stockSeg, (k) => { stockSeg = k; render(); }) : null;
  const pane = { ammo: renderAmmo, components: stockPane, recipes: recipesPane }[stockSeg];
  return h('div', {}, seg, pane());
}

function componentForm(c = null) {
  const f = form([
    { name: 'name', label: t('Назва'), required: true, value: c?.name, placeholder: 'Sierra MatchKing 69gr' },
    { name: 'kind', label: t('Тип'), type: 'select', value: c?.kind ?? 'bullet', options: Object.entries(M.COMPONENT_KINDS).map(([k, label]) => [k, t(label)]) },
    { name: 'unit', label: t('Одиниця обліку'), type: 'select', value: c?.unit ?? 'шт', options: [['шт', t('штуки')], ['г', t('грами')]] },
    { name: 'packQty', label: t('В упаковці (шт або г)'), type: 'number', step: 'any', value: c?.packQty, half: true },
    { name: 'packPrice', label: t('Ціна упаковки'), type: 'number', step: 'any', value: c?.packPrice, half: true },
    { name: 'note', label: t('Примітка'), value: c?.note, wide: true },
    // Що вже лежить удома: із сумою — покупка (йде в ціну), без суми — початковий залишок.
    ...(c ? [] : [
      { name: 'initial', label: t('Зараз у наявності (шт або г)'), type: 'number', step: 'any', min: 0, half: true },
      { name: 'initialPrice', label: t('Сума покупки (необов’язково)'), type: 'number', step: 'any', half: true },
    ]),
  ]);
  chipPicker(f.inputs.kind, { seg: false, cls: 'chips-sm' });
  chipPicker(f.inputs.unit);
  // Підписи кількості — у вибраній одиниці замість «шт або г»; ціна одиниці з упаковки — одразу під нею
  const num = (name) => Number(String(f.inputs[name]?.value ?? '').replace(',', '.')) || 0;
  const unit = () => f.inputs.unit.value || 'шт';
  const labelOf = (name) => f.inputs[name]?.closest('.field')?.querySelector('.field-label');
  const each = h('p', { class: 'muted small' });
  const paint = () => {
    labelOf('packQty').textContent = t('В упаковці, {unit}', { unit: unit() });
    const initial = labelOf('initial');
    if (initial) initial.textContent = t('Зараз у наявності, {unit}', { unit: unit() });
    each.textContent = num('packQty') && num('packPrice')
      ? t('{price} за {unit}', { price: fmt.money(num('packPrice') / num('packQty')), unit: unit() }) : '';
  };
  const packSum = () => [num('packQty') ? `${fmt.num(num('packQty'))} ${unit()}` : null,
    num('packPrice') ? `${fmt.num(num('packPrice'))} ${t('грн')}` : null].filter(Boolean).join(' · ');
  const packBox = formBox(t('Упаковка'), [h('p', { class: 'muted small' }, t('Щоб купувати упаковками: кількість і сума порахуються самі.')),
    formPart(f, ['packQty', 'packPrice'], each)], packSum);
  const body = h('div', { class: 'weapon-form' },
    box(t('Компонент'), formPart(f, ['name', 'kind', 'unit', 'note'])),
    packBox,
    c ? null : box(t('Залишок'), formPart(f, ['initial', 'initialPrice'])));
  body.addEventListener('input', paint);
  // Нова одиниця — і в підсумку згорнутої «Упаковки» (подія без спливання, щоб не зациклитись)
  f.inputs.unit.addEventListener('change', () => { paint(); packBox.dispatchEvent(new Event('change')); });
  paint();
  const close = sheet(c ? t('Змінити: {name}', { name: c.name }) : t('Новий компонент'), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const { initial, initialPrice, ...v } = f.values();
    close();
    const obj = { ...(c ?? { id: db.uid(), created: Date.now() }), ...v };
    if (!c && initial > 0) {
      const buying = initialPrice > 0;
      await addMovements([movement({
        kind: buying ? 'buy' : 'adjust', componentId: obj.id, qty: initial,
        price: buying ? initialPrice : undefined, note: buying ? undefined : t('Початковий залишок'),
      })], t('Додано: {name}', { name: obj.name }), { components: { put: [obj] } });
      return;
    }
    await saveEntity('components', obj);
  }
}

/** Картка компонента: залишок, ціна, на скільки вистачить, покупки й витрати; правка й видалення — значками вгорі. */
function componentDetail(c) {
  const fresh = () => findComponent(c.id);
  const body = () => { const cur = fresh(); return cur ? componentBody(cur, () => close()) : null; };
  const tools = [
    toolBtn('edit', t('Змінити'), () => { close(); componentForm(fresh() ?? c); }),
    toolBtn('delete', t('Видалити'), () => {
      const cur = fresh() ?? c;
      if (state.recipes.some((r) => r.items.some((i) => i.componentId === cur.id))) { toast(t('Компонент використовується в рецепті')); return; }
      if (state.movements.some((m) => m.componentId === cur.id)) { toast(t('У компонента є рухи')); return; }
      close();
      confirmSheet(t('Видалити компонент?'), cur.name, t('Видалити'), async () => { await db.write({ components: { del: [cur.id] } }); await refresh(); });
    }, 'danger'),
  ];
  const close = sheet(c.name, body(), { live: body, tools });
}

function componentBody(c, close) {
  const unit = c.unit || 'шт';
  const stock = M.componentStock(state, c.id);
  const price = M.unitPrice(state, c);
  const moves = state.movements.filter((m) => m.componentId === c.id);
  const runway = M.componentRunway(state, c);
  return h('div', {},
    h('p', { class: 'muted' }, [t(M.COMPONENT_KINDS[c.kind] ?? 'Інше'),
      price && stock > 0 ? t('на суму {sum}', { sum: fmt.money(stock * price) + usdNow(stock * price) }) : null, c.note].filter(Boolean).join(' · ')),
    h('div', { class: 'stats even' },
      stat(t('залишок, {unit}', { unit }), fmt.num(stock), 'accent'),
      stat(t('ціна за {unit}', { unit }), price ? tileMoney(price, usdSum([[price, M.today()]])) : t('без ціни'))),
    runway.length ? h('div', { class: 'runway' }, runway.map((r) => h('div', { class: 'runway-row small' },
      h('span', { class: 'runway-name' }, r.recipe.name), ' · ',
      h('b', { class: r.rounds === 0 ? 'neg' : r.rounds < LOW_ROUNDS ? 'warn-text' : '' }, t('вистачить на {n} шт', { n: fmt.num(r.rounds) }))))) : null,
    h('div', { class: 'btn-row' },
      btn(t('+ Купити'), () => { close(); buyComponentSheet(c); }, 'buy'),
      btn(t('Перерахунок'), () => { close(); adjustSheet(c, 'components'); })),
    // Покупки, витрата на спорядження, зібрані гільзи — найновіше зверху.
    box(t('Історія'), movementRows(moves, { skip: { component: true } }), { fold: `chist:${c.id}`, count: moves.length }));
}

function buyComponentSheet(c) {
  const unit = c.unit || 'шт';
  // Упаковки має сенс рахувати, лише коли відомо, що в упаковці: кількість і сума тоді стають самі.
  const byPack = !!(c.packQty || c.packPrice);
  const f = form([
    ...(byPack ? [{ name: 'packs', label: t('Упаковок'), type: 'number', step: 'any', min: 0, value: 1, half: true }] : []),
    { name: 'qty', label: t('Кількість, {unit}', { unit }), type: 'number', step: 'any', required: true, value: c.packQty ?? '', half: byPack },
    { name: 'price', label: t('Сума покупки (необов’язково)'), type: 'number', step: 'any', value: c.packPrice ?? '' },
    rateField('usdRate'),
    { name: 'date', label: t('Дата'), type: 'date', required: true, value: M.today() },
    { name: 'note', label: t('Де куплено / примітка') },
  ].filter(Boolean));
  rateHint(f, 'usdRate', 'date');
  const packChips = byPack ? qtyChips(f.inputs.packs, [1, 2, 3, 5, 10]) : null;
  packChips?.classList.add('chips-sm');
  // Ціна за одиницю — одразу, як для набоїв.
  const each = h('small', { class: 'muted' });
  const showEach = () => {
    const { qty, price } = f.values();
    each.textContent = qty > 0 && price > 0 ? t('{price} за {unit}', { price: fmt.money(price / qty) + usdTail([[price / qty, f.values().date || M.today(), f.values().usdRate]]), unit }) : '';
  };
  f.inputs.price.after(each);
  f.inputs.packs?.addEventListener('input', () => {
    const packs = Number(String(f.inputs.packs.value).replace(',', '.')) || 0;
    if (c.packQty) f.inputs.qty.value = +(packs * c.packQty).toFixed(3);
    if (c.packPrice) f.inputs.price.value = +(packs * c.packPrice).toFixed(2);
    showEach();
  });
  f.inputs.qty.addEventListener('input', showEach);
  f.inputs.price.addEventListener('input', showEach);
  f.inputs.usdRate?.addEventListener('input', showEach);
  showEach();
  const fieldOf = (name) => f.inputs[name]?.closest('.field') ?? null;
  const group = (title, ...parts) => box(title, h('div', { class: 'form' }, parts));
  const close = sheet(t('Купити: {name}', { name: c.name }), h('div', {},
    group(t('Скільки й почім'), fieldOf('packs'), fieldOf('qty'), packChips, fieldOf('price'), fieldOf('usdRate')),
    group(t('Коли й де'), fieldOf('date'), fieldOf('note'))), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Додати'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    if (!(v.qty > 0)) { fieldError(f.inputs.qty, t('Вкажіть кількість')); return; }
    close();
    await addMovements([movement({ kind: 'buy', componentId: c.id, qty: v.qty, price: v.price, usdRate: v.usdRate || undefined, date: v.date || null, note: v.note })],
      `+${fmt.num(v.qty)} ${unit} · ${c.name}`);
  }
}

function recipeForm(r = null) {
  if (!state.components.length) { toast(t('Спершу додайте компоненти')); return; }
  const f = form([
    { name: 'name', label: t('Назва'), required: true, value: r?.name, placeholder: 'SMK 69gr + CFE 223' },
    { name: 'caliber', label: t('Калібр'), required: true, value: r?.caliber, list: 'cal-list' },
    { name: 'note', label: t('Примітка'), value: r?.note, wide: true },
  ]);
  // Свої калібри — чипами: здебільшого рецепт під уже наявну зброю.
  const own = M.calibers(state).slice(0, 6);
  const caliberChips = own.length ? chips(own, f.inputs.caliber.value, (v) => { f.inputs.caliber.value = v; }) : null;
  caliberChips?.classList.add('chips-sm');
  // У списку — за типом (кулі, порох, капсулі, гільзи…), у межах типу — за назвою.
  const kindOrder = Object.keys(M.COMPONENT_KINDS);
  const options = [...state.components]
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || byName(a, b))
    .map((c) => [c.id, `${c.name} (${c.unit || 'шт'})`]);
  const componentItem = (id) => {
    const c = findComponent(id);
    return c && { title: c.name, sub: `${t(M.COMPONENT_KINDS[c.kind] ?? 'Інше')} · ${t('залишок')} ${fmt.num(+M.componentStock(state, c.id).toFixed(2))} ${c.unit || 'шт'}` };
  };
  // У виборі компонента — згортками за типом: коли компонентів багато, шукати в одному списку незручно
  const componentGroup = (id) => {
    const kind = findComponent(id)?.kind;
    const k = M.COMPONENT_KINDS[kind] ? kind : 'other';
    return [`kind:${k}`, t(M.COMPONENT_KINDS[k])];
  };
  const itemsBox = h('div', { class: 'items' });
  // Рядки рецепта: значення кожного рахує сам рядок.
  const rows = [];
  const addItem = (item = {}) => {
    // Новий рядок — порожній: інакше select сам бере перший компонент, і забутий рядок тихо йде в рецепт
    const select = h('select', {},
      item.componentId ? null : h('option', { value: '', hidden: true, selected: true }, t('— виберіть компонент —')),
      options.map(([id, label]) => h('option', { value: id, selected: id === item.componentId }, label)));
    const per = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: t('на 1 шт') });
    // Компонент у грамах (порох) — навеску можна вводити в гранах, як у таблицях навесок; зберігається в грамах.
    const unitSel = h('select', { class: 'item-unit', 'aria-label': t('Одиниця') },
      h('option', { value: 'g' }, t('г')), h('option', { value: 'gr' }, 'gr'));
    const inGrams = () => !unitSel.classList.contains('off');
    let paintUnit = () => {};
    // Точна навеска за показаним числом: поки його не правили, перемикач і збереження рахують від неї, а не від округленого.
    let exact = null;
    const show = (grams, unit) => {
      per.value = String(unit === 'gr' ? +(grams / M.GRAIN).toFixed(2) : +grams.toFixed(3));
      exact = { text: per.value, grams };
    };
    const typed = () => Number(String(per.value).replace(',', '.')) || 0;
    const grams = (unit) => (exact?.text === per.value ? exact.grams : unit === 'gr' ? typed() * M.GRAIN : typed());
    unitSel.value = item.grains ? 'gr' : 'g';
    if (item.grains) show(Number(item.perRound), 'gr');
    else per.value = item.perRound ?? '';
    // Не в грамах — місце лишається, щоб колонки рядків не роз'їжджалися.
    const syncUnit = () => {
      unitSel.classList.toggle('off', findComponent(select.value)?.unit !== 'г');
      if (!inGrams()) unitSel.value = 'g';
      paintUnit();
    };
    select.addEventListener('change', syncUnit);
    syncUnit();
    // Перемкнули г ↔ gr — число в полі перераховується, навеска та сама.
    unitSel.addEventListener('change', () => {
      const g = grams(unitSel.value === 'gr' ? 'g' : 'gr');
      if (g > 0) show(g, unitSel.value);
    });
    // Рядок — карткою: зверху компонент на всю ширину, під ним витрата на набій і одиниця.
    const row = h('div', { class: 'item-row' }, select,
      h('button', { type: 'button', class: 'icon-btn item-del', 'aria-label': t('Прибрати'), onclick: () => { row.remove(); showCost(); } }, '✕'),
      h('span', { class: 'item-lab muted small' }, t('на 1 набій')), per, unitSel);
    listPicker(select, { title: t('Компонент'), item: componentItem, group: componentGroup });
    paintUnit = chipPicker(unitSel, { cls: 'seg-unit' });
    rows.push({
      row,
      value: () => {
        const gr = inGrams() && unitSel.value === 'gr';
        return { componentId: select.value, perRound: inGrams() ? +grams(unitSel.value).toFixed(6) : typed(), ...(gr ? { grains: true } : {}) };
      },
    });
    itemsBox.append(row);
  };
  // Собівартість набою — одразу, як змінили склад рецепта чи навеску.
  const costLine = h('div', { class: 'cost-line small' });
  const rowValues = () => rows.filter((x) => itemsBox.contains(x.row)).map((x) => x.value());
  const currentItems = () => rowValues().filter((i) => i.componentId && i.perRound > 0);
  function showCost() {
    const cost = M.recipeCost(state, { items: currentItems() });
    costLine.textContent = cost > 0 ? t('Собівартість: {price} за набій', { price: fmt.money(cost) + usdNow(cost) }) : '';
  }
  itemsBox.addEventListener('input', showCost);
  itemsBox.addEventListener('change', showCost);
  (r?.items ?? [{}]).forEach(addItem);
  showCost();
  const fieldOf = (name) => f.inputs[name].closest('.field');
  const close = sheet(r ? t('Змінити рецепт') : t('Новий рецепт'), h('div', {},
    box(t('Рецепт'), h('div', { class: 'form' }, fieldOf('name'), fieldOf('caliber'), caliberChips, fieldOf('note'))),
    box(t('Компоненти'), h('div', {}, itemsBox,
      h('div', { class: 'items-foot' }, btn(t('+ компонент'), () => { addItem(); showCost(); }), costLine))),
    caliberList()), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    // Порожній рядок відкидаємо, а заповнений наполовину — ні: це, певно, недописаний компонент
    if (rowValues().some((i) => !i.componentId !== !(i.perRound > 0))) {
      formError(t('Заповніть рядок до кінця: компонент і витрата на 1 набій'));
      return;
    }
    const items = currentItems();
    if (!items.length) { formError(t('Додайте хоча б один компонент')); return; }
    close();
    await saveEntity('recipes', { ...(r ?? { id: db.uid(), created: Date.now() }), ...f.values(), items });
  }
}

function recipeDetail(r) {
  const body = () => { const cur = state.recipes.find((x) => x.id === r.id); return cur ? recipeBody(cur, () => close()) : null; };
  // «i» — як у картці вправи: панель у тілі, а тіло перемальовується, тож стан у hintOpen і для інших рецептів теж
  const info = h('button', {
    type: 'button', class: 'hint-btn', 'aria-label': t('Як рахується'), 'aria-expanded': String(!!hintOpen.recipe),
    onclick: () => {
      hintOpen.recipe = !hintOpen.recipe;
      info.setAttribute('aria-expanded', String(hintOpen.recipe));
      const panel = info.closest('.sheet')?.querySelector('.recipe-info');
      if (panel) panel.hidden = !hintOpen.recipe;
    },
  }, 'i');
  // Правка й видалення — значками в шапці, як у картках набою, зброї й вправи.
  const tools = [
    info,
    toolBtn('edit', t('Змінити'), () => { close(); recipeForm(state.recipes.find((x) => x.id === r.id) ?? r); }),
    toolBtn('delete', t('Видалити'), () => {
      close();
      confirmSheet(t('Видалити рецепт?'), t('Споряджені набої й журнал залишаться.'), t('Видалити'), async () => { await db.write({ recipes: { del: [r.id] } }); await refresh(); });
    }, 'danger'),
  ];
  // На весь екран: картка довга (компоненти, пояснення під «i»), у шторці її доводилось гортати
  const close = sheet(r.name, body(), { live: body, tools, full: true });
}

function recipeBody(r, close) {
  const lines = M.recipeLines(state, r);
  // Компонент, що скінчиться першим, — видно одразу, без пошуку мінімуму в колонці «вистачить»
  const counted = lines.filter((l) => l.component && l.fromStock !== null);
  const least = counted.length > 1 ? Math.max(0, Math.min(...counted.map((l) => l.fromStock))) : null;
  const isLeast = (l) => least !== null && l.fromStock !== null && Math.max(0, l.fromStock) === least;
  const loads = state.movements.filter((m) => m.kind === 'reload' && m.recipeId === r.id);
  const loaded = loads.reduce((s, m) => s + m.qty, 0);
  const cartridge = state.cartridges.find((c) => c.recipeId === r.id && !c.archived) ?? state.cartridges.find((c) => c.recipeId === r.id);
  return h('div', {},
    h('p', { class: 'muted' }, [r.caliber, r.note].filter(Boolean).join(' · ')),
    recipeInfo(),
    h('div', { class: 'stats even' },
      stat(t('собівартість'), tileMoney(M.recipeCost(state, r), usdSum([[M.recipeCost(state, r), M.today()]])), 'accent'),
      stat(t('із запасів'), t('{n} шт', { n: fmt.num(M.recipeEnough(state, r)) })),
      loaded ? stat(t('споряджено'), t('{n} шт', { n: fmt.num(loaded) })) : null),
    h('table', { class: 'lines' },
      h('thead', {}, h('tr', {}, h('th', {}, t('Компонент')), h('th', {}, t('на 1')), h('th', {}, t('ціна')), h('th', {}, t('вистачить')))),
      h('tbody', {}, lines.map((l) => h('tr', { class: l.noPrice && l.component?.kind !== 'case' ? 'warn' : '' },
        h('td', {}, l.component?.name ?? t('(видалено)'), isLeast(l) ? h('div', { class: 'small warn-text' }, t('скінчиться першим')) : null),
        h('td', {}, l.grains
          ? [`${fmt.num(+l.grains.toFixed(2))} gr`, h('div', { class: 'muted small' }, `${fmt.num(+l.perRound.toFixed(3))} ${t('г')}`)]
          : `${fmt.num(l.perRound)} ${l.component?.unit || 'шт'}`),
        h('td', {}, l.noPrice ? '—' : fmt.money(l.cost)),
        h('td', {}, l.fromStock === null ? '—'
          : isLeast(l) ? h('b', { class: least === 0 ? 'neg' : 'warn-text' }, fmt.num(least)) : fmt.num(Math.max(0, l.fromStock))))))),
    caseNote(r),
    h('div', { class: 'btn-row' },
      btn(t('Спорядити'), () => { close(); reloadSheet(r); }, 'primary')),
    // Що вийшло: набій на складі й коли скільки спорядили.
    cartridge ? h('p', { class: 'muted small' }, `${t('Набій')}: `,
      h('button', { type: 'button', class: 'link-btn', onclick: () => { close(); cartridgeDetail(cartridge); } }, cartridge.name),
      ` · ${t('залишок')} ${fmt.num(M.cartridgeStock(state, cartridge.id))}`) : null,
    loads.length ? box(t('Спорядження'), movementRows(loads), { fold: `rhist:${r.id}`, count: loads.length }) : null);
}

/** Що означають цифри картки рецепта — панель під «i», групи в тому ж порядку, що й на картці. */
function recipeInfo() {
  const item = (term, text, mark = null) => h('div', {}, h('dt', {}, term, mark), h('dd', {}, text));
  const group = (title, ...items) => h('section', {}, h('h4', {}, title), h('dl', {}, items));
  return h('div', { class: 'recipe-info', hidden: !hintOpen.recipe },
    group(t('Плитки'),
      item(t('собівартість'), t('сума компонентів на один набій: витрата × середня ціна компонента за покупками із сумою (таких покупок немає — ціна упаковки).')),
      item(t('із запасів'), t('скільки набоїв можна спорядити з того, що лежить на складі; рахується за компонентом, якого вистачить найменше.')),
      item(t('споряджено'), t('скільки всього спорядили за цим рецептом.'))),
    group(t('Таблиця компонентів'),
      item(t('на 1'), t('витрата компонента на один набій; порох у гранах — ще й у грамах.')),
      item(t('ціна'), t('скільки коштує ця витрата.')),
      item(t('вистачить'), t('на скільки набоїв вистачить залишку компонента на складі.')),
      item(t('Жовтий рядок'), t('у компонента немає ціни — собівартість виходить заниженою. Гільзи без ціни не виділяються: це стріляні, за них уже заплачено.'),
        h('span', { class: 'ri-swatch', 'aria-hidden': 'true' }))),
    group(t('Спорядження'),
      item(t('Спорядити'), t('списує компоненти зі складу й додає набої на склад за собівартістю на день спорядження.')),
      item(t('Зібрані гільзи'), t('впишіть їх у картці стрільби — повернуться на склад у «… стріляні» й підуть у наступне спорядження.'))));
}

/** Куди повертаються гільзи, зібрані після стрільби. */
function caseNote(r) {
  const back = caseTarget(r);
  if (!back) return null;
  return h('p', { class: 'muted small' }, t('Зібрані гільзи → «{name}»', { name: back.name }),
    back.id ? null : ` ${t('(з’явиться при першому зборі)')}`);
}

function reloadSheet(r) {
  const enough = M.recipeEnough(state, r);
  const f = form([
    { name: 'qty', label: t('Скільки споряджено, шт'), type: 'number', step: 1, min: 1, required: true },
    { name: 'date', label: t('Дата'), type: 'date', required: true, value: M.today() },
    { name: 'note', label: t('Примітка') },
  ]);
  const qtyRow = qtyChips(f.inputs.qty, [10, 20, 50, 100]);
  qtyRow.classList.add('chips-sm');
  // Що спишеться зі складу на цю кількість; чого не вистачає — червоним.
  const unitCost = M.recipeCost(state, r);
  const costLine = h('div', { class: 'cost-line small' });
  const consume = h('div', { class: 'consume' });
  const showConsume = () => {
    const qty = Math.round(Number(String(f.inputs.qty.value).replace(',', '.')) || 0);
    costLine.textContent = unitCost > 0
      ? (qty > 0 ? t('Собівартість: {sum} · {price} за шт', { sum: fmt.money(unitCost * qty) + usdNow(unitCost * qty), price: fmt.money(unitCost) })
        : t('{price} за шт', { price: fmt.money(unitCost) }))
      : '';
    consume.replaceChildren(...M.recipeLines(state, r).filter((l) => l.component).map((l) => {
      const unit = l.component.unit || 'шт';
      const stock = M.componentStock(state, l.component.id);
      const need = l.perRound * (qty || 1);
      return h('div', { class: `consume-row ${qty && need > stock ? 'neg' : ''}` },
        h('span', { class: 'consume-name' }, l.component.name),
        h('b', {}, qty ? `−${fmt.num(+need.toFixed(2))} ${unit}` : `${fmt.num(+l.perRound.toFixed(3))} ${unit}`),
        h('span', { class: 'muted small' }, t('з {n}', { n: fmt.num(+stock.toFixed(2)) })));
    }));
  };
  f.inputs.qty.addEventListener('input', showConsume);
  showConsume();
  const fieldOf = (name) => f.inputs[name].closest('.field');
  const group = (title, ...parts) => box(title, h('div', { class: 'form' }, parts));
  const body = h('div', {},
    h('p', { class: 'muted' }, t('Компонентів вистачить на {n} шт', { n: fmt.num(enough) })),
    group(t('Скільки'), fieldOf('qty'), qtyRow, costLine),
    box(t('Спишеться зі складу'), consume),
    group(t('Коли'), fieldOf('date'), fieldOf('note')));
  body.addEventListener('click', () => setTimeout(showConsume));
  const close = sheet(t('Спорядити: {name}', { name: r.name }), body, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Спорядити'), save, 'primary')],
  });
  async function save() {
    if (invalidField(f)) return;
    const v = f.values();
    const qty = Math.round(v.qty);
    if (!(qty > 0)) { fieldError(f.inputs.qty, t('Вкажіть кількість')); return; }
    let cartridge = state.cartridges.find((c) => c.recipeId === r.id && !c.archived);
    const extra = {};
    // Набій рецепта в архіві — повертаємо його, а не заводимо двійника з розділеним залишком і цінами
    const archived = cartridge ? null : state.cartridges.find((c) => c.recipeId === r.id && c.archived);
    if (archived) {
      cartridge = { ...archived, archived: false };
      extra.cartridges = { put: [cartridge] };
    }
    if (!cartridge) {
      cartridge = { id: db.uid(), created: Date.now(), name: r.name, caliber: r.caliber, recipeId: r.id, weightUnit: 'gr' };
      extra.cartridges = { put: [cartridge] };
    }
    const batch = db.uid();
    const common = { batch, date: v.date || null, note: v.note };
    const moves = [movement({ ...common, kind: 'reload', cartridgeId: cartridge.id, caliber: r.caliber, recipeId: r.id, qty, price: +(M.recipeCost(state, r) * qty).toFixed(2) })];
    for (const line of M.recipeLines(state, r)) {
      if (!line.component) continue;
      moves.push(movement({ ...common, kind: 'consume', componentId: line.component.id, recipeId: r.id, qty: -+(line.perRound * qty).toFixed(3) }));
    }
    close();
    await addMovements(moves, t('Споряджено {n} · {name}', { n: qty, name: r.name }), extra,
      qty > enough ? t('Компоненти пішли в мінус') : null);
  }
}

// ---------- налаштування ----------

function download(name, content) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Файл — через «Поділитися» (на телефоні: Telegram, Диск…), де не вміє — завантаженням; false — скасували. */
async function offerFile(name, content, type, share = true) {
  if (share) {
    const file = new File([content], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
  }
  download(name, new Blob([content], { type }));
  return true;
}

async function exportData(share) {
  const payload = JSON.stringify({ app: 'shooters-log', format: 1, exportedAt: new Date().toISOString(), data: state }, null, 1);
  if (await offerFile(`shooters-log-${M.today()}.json`, payload, 'application/json', share)) remember(BACKUP_KEY, M.today());
}

/**
 * Журнал у CSV для Excel — ті записи, що зараз на екрані (тип і зброя з фільтра), від старих до нових.
 * «;» і десяткова кома — як чекає Excel з українськими налаштуваннями; BOM — щоб не поламалась кирилиця.
 */
async function exportCsv(list) {
  if (!list.length) { toast(t('Немає записів для експорту')); return; }
  const rows = [...list].sort((a, b) => M.byDateDesc(b, a)).map((m) => {
    const gun = m.kind === 'clean' ? findWeapon(m.weaponId)?.name : shotGun(m)?.name;
    const unit = m.kind === 'clean' ? '' : m.componentId ? (findComponent(m.componentId)?.unit || 'шт') : 'шт';
    return [fmt.date(m.date), m.time ?? '', t(M.KINDS[m.kind]), gun ?? '', m.kind === 'clean' ? '' : movementTitle(m),
      m.kind === 'clean' ? '' : String(m.qty).replace('.', ','), unit, csvNum(m.kind === 'shot' ? M.shotCost(state, m) : m.price), m.note ?? ''];
  });
  const head = [t('Дата'), t('Час'), t('Тип'), t('Зброя'), t('Набій / компонент'), t('Кількість'), t('Од.'), t('Сума'), t('Примітка')];
  await offerFile(`shooters-log-journal-${M.today()}.csv`, csvText(head, rows), 'text/csv');
}

/** Число для CSV: десяткова кома, два знаки; нуль чи не число — порожньо. */
const csvNum = (v) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? String(Math.round(Number(v) * 100) / 100).replace('.', ',') : '');
/** Таблиця в CSV: «;», лапки за потреби, BOM — щоб Excel не поламав кирилицю. */
function csvText(head, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return `\uFEFF${[head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

// Коли востаннє зберігали копію — для нагадування й рядка в ⚙ (лише на цьому пристрої).
const BACKUP_KEY = 'shooters-log:backup-at';
const BACKUP_EVERY = 30;

/** Без Google Диска раз на місяць: дані лише на пристрої — нагадати зберегти копію. */
function backupReminder() {
  // демодані мають id 'mv-…', свої записи — UUID: на демо не нагадуємо
  const own = state.movements.filter((m) => !String(m.id).startsWith('mv-')).length;
  const last = [recall(BACKUP_KEY), recall('shooters-log:backup-reminded')].filter(Boolean).sort().pop();
  if (sync.enabled() || own < 20 || (last && M.addDays(last, BACKUP_EVERY) > M.today())) return false;
  remember('shooters-log:backup-reminded', M.today());
  toast(t('Дані лише на цьому пристрої — збережіть копію'), {
    action: t('Зберегти'),
    onAction: () => exportData(true),
    reminder: true,
  });
  return true;
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch { toast(t('Файл не схожий на JSON')); return; }
    importParsed(parsed);
  };
  reader.readAsText(file);
}

/** Демодані з комплекту: облік з 2022 року з мішенями, вправами й серіями таймера — подивитися, як воно працює. */
async function loadDemo() {
  // база порожня — об'єднувати нічого: без шторки імпорту
  if (!db.DATA_STORES.some((s) => state[s]?.length)) { await loadDemoQuiet(); return; }
  toast(t('Завантажую демодані…'));
  try {
    const res = await fetch('./demo.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    importParsed(await res.json(), { demo: true });
  } catch {
    toast(t('Не вдалося завантажити демодані'));
  }
}

// ---------- знайомство: перший запуск, тури ----------

const WELCOMED = 'shooters-log:welcomed';

/** Перейти на вкладку й розділ (для туру); чекає, доки екран перемалюється. */
async function goScreen(to, seg) {
  const segs = { ammo: () => { stockSeg = seg; }, guns: () => { gunsSeg = seg; }, targets: () => { rangeSeg = seg; } };
  const segNow = { ammo: stockSeg, guns: gunsSeg, targets: rangeSeg }[to];
  if (seg && segs[to]) segs[to]();
  if (tab !== to) await new Promise((resolve) => { window.addEventListener('hashchange', resolve, { once: true }); goTab(`#${to}`); });
  else if (seg && seg !== segNow) render();
}

/** Тур: після нього — той самий екран і розділи, що були до нього; onDone(дійшов до кінця) — після повернення. */
async function withTour(start, onDone) {
  const was = { tab, stockSeg, gunsSeg, rangeSeg };
  const back = (done) => {
    ({ stockSeg, gunsSeg, rangeSeg } = was);
    if (tab !== was.tab) goTab(`#${was.tab}`);
    else render();
    onDone?.(done);
  };
  const m = await tours();
  return start(m, { onClose: back });
}

const isEmpty = () => !db.DATA_STORES.some((s) => state[s]?.length);
// Демо в базі — є його фото (ph-…); справжні фото мають UUID
const hasDemo = () => state.photos.some((p) => DEMO_PHOTO.test(p.id));

/** «?» угорі: підказки до відкритого розділу; у тренажера — його власний тур; без записів — демо й знайомство. */
function screenHelp() {
  if (tab === 'targets' && rangeSeg === 'sim') {
    import('./sim-tour.js').then((m) => m.simTour($('view')));
    return;
  }
  if (isEmpty()) { offerDemo(); return; }
  const seg = { ammo: stockSeg, guns: gunsSeg, targets: rangeSeg }[tab] ?? null;
  withTour((m, opts) => m.screenTour(tab, seg, goScreen, { ...opts, hide: hiddenSegs() })).then((shown) => {
    if (!shown) toast(t('Підказки з’являться, коли тут будуть записи'));
  });
}

/** Знайомство з усім застосунком; з демо — останнім кроком, як його прибрати, а хто пропустив — нагадуємо. */
function appTour() {
  if (isEmpty()) { offerDemo(); return; }
  const demo = hasDemo();
  withTour((m, opts) => m.appTour(goScreen, demo, { ...opts, hide: hiddenSegs() }), (done) => {
    if (demo && !done) toast(t('Демо прибирається так: ⚙ → «Видалити дані з пристрою»'), { timeout: 9000 });
  });
}

/** Тур без записів показувати нічому — пропонуємо демо й одразу знайомство з усім застосунком. */
function offerDemo() {
  const close = sheet(t('Тур на прикладі'), h('div', {},
    h('p', {}, t('Поки записів немає — показувати нічого. Завантажу демодані: три стволи з історією, покупками й мішенями — і проведу розділами.')),
    h('p', { class: 'muted' }, t('Наприкінці покажу, як прибрати демо перед своїм обліком.'))), {
    actions: [
      btn(t('Не зараз'), () => close()),
      btn(t('Завантажити й показати'), () => { close(); loadDemoQuiet().then((ok) => ok && appTour()); }, 'primary'),
    ],
  });
}

/** Демодані без шторки імпорту: база порожня — об'єднувати нічого. */
async function loadDemoQuiet() {
  toast(t('Завантажую демодані…'));
  try {
    const res = await fetch('./demo.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    await db.mergeImport(importChanges(data));
    await demoBlobs(data.photos);
    await refresh();
    return true;
  } catch {
    toast(t('Не вдалося завантажити демодані'));
    return false;
  }
}

/** Перший запуск на порожній базі: показати на прикладі чи почати самому. Раз на пристрій. */
function welcome() {
  remember(WELCOMED, '1');
  const close = sheet(t('Вітаємо'), h('div', {},
    h('p', {}, t('Shooter’s Log веде облік набоїв, зброї, стрільб і мішеней. Усе зберігається на цьому пристрої, без сервера.')),
    h('p', { class: 'muted' }, t('Подивитися на готовому прикладі? Завантажу демодані — три стволи з історією — і покажу розділи. Демо потім видаляється однією кнопкою в налаштуваннях.'))), {
    actions: [
      btn(t('Без підказок'), () => { close(); toast(t('Підказки до розділу — кнопка «?» угорі')); }),
      btn(t('Показати на прикладі'), () => { close(); loadDemoQuiet().then((ok) => ok && appTour()); }, 'primary'),
    ],
  });
}

/**
 * У демо на Диску повних файлів немає. Фото стволів лежать поруч (p.file), у мішеней повним фото
 * стає мініатюра: без нього не відкриється розмітка. Наявні файли не чіпаємо.
 */
async function demoBlobs(photos = []) {
  const have = new Set(await db.blobKeys());
  for (const p of photos) {
    if (have.has(p.id)) continue;
    const file = p.file ? await fetch(p.file).then((r) => (r.ok ? r.blob() : null)).catch(() => null) : null;
    const blob = file ?? dataUrlBlob(p.thumb);
    if (blob) await db.putBlob(p.id, blob);
  }
}

/** data:-URL → Blob; fetch(data:) не пускає CSP (connect-src), тож base64 розбираємо самі. */
function dataUrlBlob(url) {
  const [, type, b64] = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url ?? '') ?? [];
  return b64 ? new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type }) : null;
}

// Фото з демоданих: id виду ph-0046, на Диску їх немає. Справжні фото мають UUID.
const DEMO_PHOTO = /^ph-\d+$/;

/**
 * Повне фото мішені. Демоданим, завантаженим до 0.7.21, повних файлів не дали — беремо мініатюру.
 * Справжнє фото без файлу ще може приїхати з Диска, тож його не підміняємо.
 */
async function fullPhoto(photo) {
  if (!photo) return null;
  const blob = await db.getBlob(photo.id);
  if (blob || photo.driveId || !DEMO_PHOTO.test(photo.id)) return blob;
  const thumb = dataUrlBlob(photo.thumb);
  if (thumb) await db.putBlob(photo.id, thumb);
  return thumb;
}

/** Записи копії по сховищах, без порожніх id: { store: { put: [obj] } }. */
function importChanges(data) {
  const validId = (id) => (typeof id === 'string' && id !== '') || Number.isFinite(id);
  return Object.fromEntries(db.STORES.map((s) => [s, { put: (data[s] ?? []).filter((x) => x && validId(x.id)) }]));
}

/** demo — демодані з комплекту: після імпорту мініатюри стають повними фото. */
function importParsed(parsed, { demo = false } = {}) {
  {
    const data = parsed?.data;
    // Старі копії підписані колишнім ім'ям — приймаємо обидва.
    if (!['shooters-log', 'scouts-log', 'shooting-log'].includes(parsed?.app) || !data || !db.STORES.every((s) => !data[s] || Array.isArray(data[s]))) {
      toast(t('Це не резервна копія Shooter’s Log'));
      return;
    }
    const count = db.DATA_STORES.reduce((s, k) => s + (data[k]?.length ?? 0), 0);
    const changes = importChanges(data);
    const close = sheet(t('Імпорт'), h('div', {},
      h('p', {}, t('У файлі записів: {n}.', { n: count })),
      h('p', { class: 'muted small' }, t('«Об’єднати» — додасть нові записи й оновить ті, що у файлі новіші: пізніші правки на пристрої залишаться. «Замінити все» — спершу видалить поточні дані.')),
      sync.enabled() ? h('p', { class: 'muted small' }, t('Увімкнено синхронізацію: «Замінити все» замінить дані й на Google Диску, і на інших пристроях. «Об’єднати» не відкотить новіші дані з Диска.')) : null), {
      actions: [
        btn(t('Скасувати'), () => close()),
        btn(t('Об’єднати'), async () => {
          close();
          await db.mergeImport(changes);
          if (demo) await demoBlobs(data.photos);
          await refresh();
          toast(t('Імпортовано'));
        }),
        btn(t('Замінити все'), () => {
          close();
          confirmSheet(t('Замінити всі дані?'), t('Поточні дані буде видалено. Спершу зробіть експорт, якщо вони потрібні.'), t('Замінити'), async () => {
            sync.markRestore(await db.replaceAll(changes));
            if (demo) await demoBlobs(data.photos);
            await refresh();
            toast(t('Дані замінено'));
          });
        }, 'danger'),
      ],
    });
  }
}

function syncTime(ms) {
  if (!ms) return t('ще не було');
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? t('сьогодні о {time}', { time: fmt.time(ms) })
    : `${fmt.date(new Date(ms - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10))} ${fmt.time(ms)}`;
}

function connectGoogle() {
  sync.connect().then(() => toast(t('Google Диск підключено'))).catch((err) => toast(err.message));
}

/** Вміст рядка «Google Диск»: не налаштовано, не підключено або акаунт, остання синхронізація й кнопки. */
function syncBody() {
  const s = sync.status;
  const panel = h('div', { class: 'set-sub' });
  if (!sync.configured()) {
    panel.append(h('p', { class: 'muted small' }, t('Не налаштовано: у js/config.js не вказано Google Client ID.')));
  } else if (!sync.enabled()) {
    panel.append(
      h('p', { class: 'muted small' }, t('Дані зберігатимуться у файлі shooters-log.json на вашому Google Диску й збігатимуться на телефоні та комп’ютері. Застосунок бачить лише свої файли, решта Диска йому недоступна.')),
      h('div', { class: 'btn-row' }, btn(t('Підключити Google Диск'), connectGoogle, 'primary')));
  } else {
    panel.append(
      h('dl', { class: 'kv' },
        h('dt', {}, t('Акаунт')), h('dd', {}, s.email ?? '—'),
        h('dt', {}, t('Остання')), h('dd', {}, syncTime(s.lastSync)),
        s.message ? [h('dt', {}, t('Статус')), h('dd', {}, s.message)] : null),
      h('div', { class: 'btn-row' },
        s.state === 'auth' ? btn(t('Увійти в Google'), connectGoogle, 'primary') : btn(t('Синхронізувати'), () => sync.syncNow(), 'primary'),
        btn(t('Вимкнути'), () => confirmSheet(t('Вимкнути синхронізацію?'), t('Дані залишаться і на пристрої, і на Google Диску, просто перестануть обмінюватися.'), t('Вимкнути'), () => sync.disconnect()))));
  }
  return panel;
}

const CHIP = {
  idle: () => `☁ ✓ ${fmt.time(sync.status.lastSync)}`,
  syncing: () => '☁ ',
  offline: () => t('☁ офлайн'),
  auth: () => t('☁ увійти'),
  error: () => t('☁ помилка'),
};

function renderSyncChip(s) {
  const chip = $('sync-chip');
  chip.hidden = !CHIP[s.state];
  if (CHIP[s.state]) {
    chip.textContent = CHIP[s.state]();
    // Синхронізація йде — три крапки біжать по черзі, видно, що не зависло
    if (s.state === 'syncing') chip.append(h('span', { class: 'sync-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    chip.className = `sync-chip ${s.state}`;
    chip.title = s.message || t('Синхронізація з Google Диском');
  }
  // Аватар власника Google Диска в шапці — поки не під'єднано, його просто немає.
  const avatar = $('app-icon');
  avatar.hidden = !s.photo;
  if (s.photo && avatar.src !== s.photo) avatar.src = s.photo;
  avatar.title = [s.who, s.email].filter(Boolean).join(' · ');
  if (tab === 'settings') render();
}

function onSyncChip() {
  const { state: st, message } = sync.status;
  if (st === 'auth') connectGoogle();
  else if (st === 'offline') toast(t('Немає інтернету — синхронізація відбудеться, коли з’явиться зв’язок'));
  else if (st === 'error') { toast(message || t('Помилка синхронізації')); sync.syncNow(); } else sync.syncNow();
}

// Тема: auto — як у системі. Першу розстановку до малювання робить скрипт в index.html.
const THEMES = [['auto', 'Авто'], ['dark', 'Темна'], ['light', 'Світла'], ['night', 'Нічна'], ['phosphor', 'Фосфор'], ['amber', 'Бурштин'], ['white', 'Білий фосфор']];
const SPECIAL_THEMES = ['night', 'phosphor', 'amber', 'white'];
const lightScheme = matchMedia('(prefers-color-scheme: light)');

function themePref() {
  const v = recall('shooters-log:theme');
  return THEMES.some(([k]) => k === v) ? v : 'auto';
}

// Фон під картками — свій набір для темної й світлої теми; перший (без малюнка) — за замовчуванням, у нічній фону немає
const BACKDROPS = {
  dark: [['plain', 'Без малюнка'], ['map', 'Карта'], ['olive', 'Олива'], ['carbon', 'Карбон'], ['coyote', 'Койот'], ['camo', 'Чорний камуфляж'], ['camo-hex', 'Камуфляж із сотами'], ['lines', 'Лінії'], ['lines-acc', 'Лінії з акцентом']],
  light: [['l-plain', 'Без малюнка'], ['l-map', 'Карта'], ['l-mm', 'Міліметрівка'], ['l-sand', 'Пісок'], ['l-sand-acc', 'Пісок з акцентом'], ['l-khaki', 'Хакі'], ['l-khaki-acc', 'Хакі з акцентом'], ['l-camo', 'Камуфляж']],
};
const BG_KEY = { dark: 'shooters-log:bg', light: 'shooters-log:bg-light' };

function backdropPref(theme) {
  const list = BACKDROPS[theme];
  if (!list) return null;
  // «Блокнот» і «Олива» (лише 31.10) злиті з «Піском» і «Хакі», «Гадюку» замінив камуфляж, світлі соти прибрано
  const v = { 'l-note': 'l-sand', 'l-olive': 'l-khaki', viper: 'camo', 'l-viper': 'l-camo', 'l-camo-hex': 'l-camo' }[recall(BG_KEY[theme])] ?? recall(BG_KEY[theme]);
  return list.some(([k]) => k === v) ? v : list[0][0];
}

/** Яскравість червоного в нічній темі, 20–100 %. */
function nightLevel() {
  const v = Number(recall('shooters-log:night-level'));
  return v >= 20 && v <= 100 ? v : 80;
}

function applyTheme() {
  const pref = themePref();
  const theme = pref === 'auto' ? (lightScheme.matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = theme;
  const bg = backdropPref(theme);
  if (bg) document.documentElement.dataset.bg = bg; else delete document.documentElement.dataset.bg;
  const k = nightLevel() / 100;
  document.querySelector('#night-red feColorMatrix')?.setAttribute('values',
    `${(0.5 * k).toFixed(3)} ${(0.6 * k).toFixed(3)} ${(0.1 * k).toFixed(3)} 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0`);
  // Колір смуги браузера — тло вибраного фону (--bg у CSS)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#101310');
}

lightScheme.addEventListener('change', applyTheme);

function switchLang(code) {
  setLang(code);
  applyStatic();
  renderSyncChip(sync.status);
  render();
}

/** Довгий текст під розкриттям. */
const more = (title, node) => h('details', { class: 'ex-more' }, h('summary', {}, title), node);

// Кружка кави в куті портрета котика: пара — два завитки, що здіймаються й тануть
const CUP_SVG = '<svg viewBox="0 0 16 20" aria-hidden="true">'
  + '<path class="st" d="M6 8.5c-2-2 2-3 0-6"/><path class="st" d="M10 8.5c-2-2 2-3 0-6"/>'
  + '<path d="M3 10h9v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#f4f1ea" stroke="#3a2a1c"/>'
  + '<path d="M12 11.5h1.2a2 2 0 0 1 0 4H12" fill="none" stroke="#3a2a1c"/><ellipse cx="7.5" cy="10.4" rx="4" ry=".9" fill="#6b3f1f"/></svg>';

// Аватар автора кліпає: шар поверх фото (координати фото 233×233). Контур — білки очей, обведені з самого фото,
// тож повіки не заходять на обведення. Верхня повіка з опуклою кромкою опускається, нижня трохи підіймається
// назустріч; зімкнуті — на нижній третині ока, кромка лишається лінією вій. Праве око перше: ліве його перекриває.
const AVATAR_EYES = [
  { d: 'M114 63L114 65L117 71L117 78L121 78L122 77L126 77L127 76L132 76L135 79L137 79L139 77L140 72L141 71L141 68L140 67L140 64L135 59L131 57L122 57L118 59Z', box: [114, 57, 142, 80] },
  { d: 'M99 60L98 61L94 61L87 67L85 71L85 79L87 83L90 86L94 88L102 89L110 86L115 79L115 69L109 62Z', box: [85, 60, 116, 90] },
];
const AVATAR_SVG = '<svg viewBox="0 0 233 233" aria-hidden="true"><defs>'
  + AVATAR_EYES.map(({ d }, i) => `<clipPath id="av-eye${i}"><path d="${d}"/></clipPath>`).join('')
  + '</defs>'
  + AVATAR_EYES.map(({ box: [x0, y0, x1, y1] }, i) => {
    const h = y1 - y0, e = y0 + h * 0.6, k = h * 0.26, cx = (x0 + x1) / 2, l = x0 - 3, r = x1 + 3;
    const edge = `M${l} ${e}Q${cx} ${e + k} ${r} ${e}`;
    return `<g clip-path="url(#av-eye${i})" fill="#fcd901">`
      + `<path class="av-lid low" style="--o:${(y1 - e + 3).toFixed(1)}px" d="${edge}V${y1 + 3}H${l}Z"/>`
      + `<g class="av-lid" style="--o:-${(e + k - y0 + 3).toFixed(1)}px"><path d="M${l} ${y0 - 3}H${r}V${e}Q${cx} ${e + k} ${l} ${e}Z"/>`
      + `<path d="${edge}" fill="none" stroke="#1d1d1d" stroke-width="2.6" stroke-linecap="round"/></g></g>`;
  }).join('')
  + '</svg>';

/** Тап по аватару — кліпнути одразу, не чекаючи свого часу. */
function avatarHi(e) {
  const el = e.currentTarget;
  el.classList.remove('hi');
  void el.offsetWidth;
  el.classList.add('hi');
  clearTimeout(el.hiTimer);
  el.hiTimer = setTimeout(() => el.classList.remove('hi'), 600);
}

/** «Про застосунок»: що воно таке, де лежать дані й куди дивитися, якщо не довіряєш на слово. */
function aboutPanel() {
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  return h('section', { class: 'panel about' },
    h('div', { class: 'about-head' },
      // Сім тапів по аватару автора — панель святкових сценок (authorTap)
      h('span', { class: 'about-avatar', onclick: authorTap },
        h('img', { src: './icons/author.jpg', alt: '', width: 64, height: 64, loading: 'lazy' }),
        Object.assign(h('span', { class: 'av-live' }), { innerHTML: AVATAR_SVG })),
      h('div', {},
        h('h3', {}, 'Shooter’s Log'),
        h('p', { class: 'muted small' }, t('Версія {v} · збірка {b}', { v: self.APP_VERSION, b: self.APP_BUILD ?? '—' })))),
    h('p', { class: 'muted small about-desc' }, t('Облік боєприпасів, настрілу по стволах, купчастості й вправ. Працює без інтернету: усе рахується на пристрої.')),
    h('div', { class: 'btn-row' }, btn(t('Перевірити оновлення'), () => checkUpdate()), btn(t('Що нового'), () => allChanges().then(changesSheet)),
      btn(t('Тур застосунком'), appTour)),
    // Банка Монобанку — звичайне посилання, без сторонніх скриптів: CSP і обіцянка «дані нікуди не йдуть» лишаються
    h('a', { class: 'donate-card', href: 'https://send.monobank.ua/jar/XJKDMyVfW', target: '_blank', rel: 'noopener' },
      h('span', { class: 'donate-art' },
        h('span', { class: 'donate-cat' }, h('img', { src: './icons/cat-portrait.png', alt: '', width: 50, height: 50 }),
          Object.assign(h('span', { class: 'donate-cup' }), { innerHTML: CUP_SVG })),
        // табличка під рамою, як підпис під картиною: чий це котик — банка monobank
        h('span', { class: 'donate-plate', 'aria-hidden': 'true' }, 'mono')),
      h('span', { class: 'donate-text' }, h('b', {}, t('На каву автору')), h('small', {}, t('Безкоштовно й без реклами — тримається на вашій підтримці'))),
      h('span', { class: 'donate-go', 'aria-hidden': 'true' }, '→')),
    more(t('Встановлення на телефон'), h('div', { class: 'muted small' },
      h('p', {}, t('Chrome → меню ⋮ → «Додати на головний екран» / «Установити застосунок». Після встановлення працює без інтернету.')),
      h('p', {}, t('iPhone: Safari → «Поділитися» → «На початковий екран». Відкривайте застосунок із цієї іконки, а не з вкладки Safari — інакше Safari може стерти дані сайту, якщо тиждень не заходити.')))),
    more(t('Де мої дані'), h('div', { class: 'muted small' },
      h('p', {}, t('Записи й фото лежать у браузері на цьому пристрої. Сервера застосунок не має, автор не отримує ні даних, ні статистики.')),
      h('p', {}, t('Google Диск під’єднується за бажанням: копія лягає у ваш Диск, застосунок бачить лише свої файли. Браузеру заборонено надсилати дані кудись іще — це прописано в коді сторінки (Content Security Policy).')),
      h('p', {}, t('Резервна копія — ⚙ → «Поділитися копією». Вона ж переносить дані на інший пристрій через «Імпорт».')))),
    more(t('З чого почати'), h('ol', { class: 'ex-rules' },
      h('li', {}, t('Заведіть ствол на вкладці «Арсенал» і набій на вкладці «Склад».')),
      h('li', {}, t('Свайп по картці набою: вправо — покупка, вліво — списання на стрільбу.')),
      h('li', {}, t('Після стрільби сфотографуйте мішень: «Полігон» → «Мішені» → «+». Позначте масштаб і пробоїни — застосунок порахує купчастість, СТВ і поправки в кліках.')),
      h('li', {}, t('Хочете спершу подивитися — ⚙ → «Завантажити демодані», там готовий облік з 2022 року. Перед своїми записами видаліть демо: ⚙ → «Видалити дані з пристрою».')),
      h('li', {}, t('Без Google Диска дані лежать лише на цьому пристрої — підключіть його в ⚙ або час від часу зберігайте копію.')))),
    h('nav', { class: 'about-links' },
      link('./about/', t('Показати друзям')),
      link('https://github.com/VitaliyLobko/shooting-log/issues/new', t('Повідомити про помилку')),
      link('https://github.com/VitaliyLobko/shooting-log', t('Код')),
      link('https://github.com/VitaliyLobko/shooting-log/blob/main/PRIVACY.md', t('Приватність')),
      link('https://github.com/VitaliyLobko/shooting-log/blob/main/LICENSE', t('Ліцензія MIT'))));
}

// ---------- що нового ----------

const SEEN_KEY = 'shooters-log:seen-version';
// Версія, з якої ведеться журнал змін: хто оновився з неї чи раніше, ще не мав запису «бачив»
const FIRST_TRACKED = '0.7.0';

function changesSheet(list) {
  const close = sheet(t('Що нового'), h('div', {}, list.map((c) => box(`${c.label ?? c.v} · ${fmt.date(c.date)}`,
    h('ul', { class: 'changes' }, c.uk.map((x) => h('li', {}, x)))))),
  { actions: [btn(t('Зрозуміло'), () => close(), 'primary')] });
}

// Курс і тренажер (guide.js) та журнал змін (changelog.js) — сотні КБ; вантажимо, лише коли відкривають, не на старті
const guide = (kind) => import('./guide.js').then((g) => g.loadGuide(kind).then((html) => ({ g, html })));
const allChanges = () => import('./changelog.js').then((m) => m.CHANGES);

const verParts = (v) => String(v).split('.').map(Number);

/** a новіша за b (версії виду 0.7.0). */
function newer(a, b) {
  const [x, y] = [verParts(a), verParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

// Святкові мініатюри при запуску: день (ММ-ДД) → сценка; ?scene=<назва> — показати будь-коли
const SCENE_DAYS = { '01-01': 'newyear', '01-22': 'sobornist', '08-24': 'independence', '10-31': 'halloween', '12-31': 'snowman' };

// Не заходив у свято — сценка покажеться при першому запуску впродовж стількох днів після
const SCENE_LATE_DAYS = 3;
const SCENES_SEEN = 'shooters-log:scenes-seen';
// Вимкнули в налаштуваннях — сценки при запуску не показуємо (?scene= і панель перегляду працюють)
const SCENES_OFF = 'shooters-log:scenes-off';
const scenesOn = () => recall(SCENES_OFF) !== '1';
// Той самий ключ, що SCENE_SOUND_OFF у scenes.js (модуль сценок вантажиться ліниво, тож не імпортуємо)
const SCENE_SOUND_OFF = 'shooters-log:scene-sound-off';

/** Бачені сценки — «назва:рік» (і «birthday:ствол:рік»); давні відкидаємо, щоб список не ріс. */
function scenesSeen() {
  try { return JSON.parse(recall(SCENES_SEEN) || '[]'); } catch { return []; }
}

/**
 * Котру сценку показати зараз: свято в межах SCENE_LATE_DAYS — найближче до сьогодні; якщо його вже бачили, давніші
 * (31.12, коли 1.01 уже показали) не наздоганяємо. Інакше — день народження ствола (дата покупки, той самий запас днів).
 */
function sceneDue(today = M.today(), fortune = Math.random() < 1 / 6) {
  const seen = scenesSeen();
  // До 0.7.101 пам'ятали лише дату показу — свято того дня вважаємо баченим
  const legacy = recall('shooters-log:scene');
  const days = Array.from({ length: SCENE_LATE_DAYS + 1 }, (_, k) => M.addDays(today, -k));
  for (const day of days) {
    const name = SCENE_DAYS[day.slice(5)];
    if (!name) continue;
    const key = `${name}:${day.slice(0, 4)}`;
    if (seen.includes(key) || legacy === day) break;
    return { name, key };
  }
  for (const day of days) {
    for (const w of state.weapons.filter((x) => !x.archived && x.buyDate).sort(byName)) {
      const age = Number(day.slice(0, 4)) - Number(w.buyDate.slice(0, 4));
      const key = `birthday:${w.id}:${day.slice(0, 4)}`;
      if (age < 1 || birthdayOn(w.buyDate, day) !== day || seen.includes(key)) continue;
      return { name: 'birthday', key, params: birthdayParams(w, age) };
    }
  }
  // Секретна: печиво з передбаченням — без свята ≈ раз на 6 запусків (fortune — кидок), хоч і кілька разів на день;
  // у бачені не пишемо, щоб не витісняти з короткого списку свята
  if (fortune) return { name: 'fortune' };
  return null;
}

/** День народження ствола в році дати day; купленого 29.02 у невисокосний рік вітаємо 28.02. */
function birthdayOn(buyDate, day) {
  const date = `${day.slice(0, 4)}${buyDate.slice(4, 10)}`;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date ? date : `${day.slice(0, 4)}-02-28`;
}

/** Підпис сценки: назва, скільки років і пострілів. */
function birthdayParams(w, age) {
  const shots = M.weaponShots(state, w);
  return {
    name: w.name, years: age,
    age:`${fmt.num(age)} ${plural(age, [t('рік'), t('роки'), t('років')])}`,
    shots: shots > 0 ? `${fmt.num(shots)} ${plural(shots, [t('постріл'), t('постріли'), t('пострілів')])}` : '',
  };
}

/** При запуску — святкова сценка поверх застосунку (js/scenes.js вантажиться лише тоді); ?scene=<назва> — будь-яка. */
function holidayScene() {
  const forced = new URLSearchParams(location.search).get('scene');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // ?scene=fortune&i=5 — конкретне передбачення (для перегляду), без i — випадкове
  const fi = new URLSearchParams(location.search).get('i');
  if (forced) { coverForScene(); playScene(forced, forced === 'birthday' ? demoBirthday() : forced === 'fortune' && fi ? { i: Number(fi) } : undefined).then(() => uncover()); return; }
  const due = scenesOn() ? sceneDue(M.today(), sceneRoll) : null;
  if (!due) { uncover(); return; }
  if (due.key) remember(SCENES_SEEN, JSON.stringify([...scenesSeen(), due.key].slice(-40)));
  coverForScene();
  playScene(due.name, due.params).then(() => uncover());
}

// Сценка при запуску — першою: темне тло сценки лягає ще до даних, застосунок домальовується під ним, а не мелькає
let sceneCover = null;
function coverForScene() {
  if (sceneCover || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  sceneCover = h('div', { class: 'scene-cover', 'aria-hidden': 'true' });
  document.body.append(sceneCover);
}
/** Прибрати тло, коли сценка вже проявилась (її власне проявлення — 0,3 с). */
function uncover() {
  const c = sceneCover;
  sceneCover = null;
  if (c) setTimeout(() => c.remove(), 400);
}

/** Для перегляду без чекання дати: перший ствол з датою покупки (чи будь-який), вік — від покупки або рік. */
function demoBirthday() {
  const w = state.weapons.find((x) => !x.archived && x.buyDate) ?? state.weapons.find((x) => !x.archived);
  if (!w) return { name: 'Savage 110 Scout', years: 3, age: `3 ${plural(3, [t('рік'), t('роки'), t('років')])}`, shots: '' };
  return birthdayParams(w, Math.max(1, Number(M.today().slice(0, 4)) - Number((w.buyDate ?? M.today()).slice(0, 4))));
}

const playScene = (name, params) => import('./scenes.js').then((m) => {
  m.setFortuneSource(myFortunes);
  m.playScene(name, params);
}).catch(() => {});

/** Передбачення печива з власного журналу: стволи, чистка, дозвіл, ресурс, набори, виїзди, улюблений набій, спорядження, витрати, БК. */
function myFortunes() {
  const today = M.today(), out = [];
  const days = (n) => `${fmt.num(n)} ${plural(n, [t('день'), t('дні'), t('днів')])}`;
  const shots = (n) => `${fmt.num(n)} ${plural(n, [t('постріл'), t('постріли'), t('пострілів')])}`;
  const ago = (date) => Math.round((Date.parse(today) - Date.parse(date)) / 864e5);
  const guns = state.weapons.filter((w) => !w.archived);
  const fired = state.movements.filter((m) => m.kind === 'shot' && m.date);
  for (const w of guns) {
    const last = fired.filter((m) => m.weaponId === w.id).map((m) => m.date).sort().pop();
    if (last && ago(last) >= 21) out.push(t('Твій {name} сумує: вже {n} без стрільбища', { name: w.name, n: days(ago(last)) }));
    if (needsCleaning(w)) out.push(t('{name} просить чистки. Зорі не брешуть', { name: w.name }));
    const until = w.buyDate ? -ago(birthdayOn(w.buyDate, today)) : 0;
    if (until > 0 && until <= 30) out.push(t('Через {n} у {name} день народження. Готуй торт і набої', { name: w.name, n: days(until) }));
    const wear = barrelWear(w);
    if (wear >= 30 && wear < 85) out.push(t('У {name} позаду {p}% ресурсу ствола. Саме час для найкращих груп', { name: w.name, p: Math.round(wear) }));
    const permit = M.permitStatus(w.permit);
    if (permit && permit.level !== 'ok') out.push(t('Печиво бачить у твоєму майбутньому чергу: дозвіл на {name}, {left}', { name: w.name, left: permitLeft(permit) }));
    const clean = M.cleaningStatus(state, w);
    if (!clean.due && clean.since >= 150) out.push(t('У {name} уже {n} після чистки. Тримається', { name: w.name, n: shots(clean.since) }));
    const sets = w.setups?.length ?? 0;
    if (sets >= 2) out.push(t('У {name} уже {n}. Ніяк не вирішить, ким бути', { name: w.name, n: `${fmt.num(sets)} ${plural(sets, [t('набір'), t('набори'), t('наборів')])}` }));
    const owned = w.buyDate ? ago(w.buyDate) : -1;
    if (owned >= 0 && owned <= 30) out.push(t('{name} у тебе лише {n}. Ще звикає до сейфа', { name: w.name, n: days(Math.max(1, owned)) }));
  }
  const ranked = guns.map((w) => [w, M.weaponShots(state, w)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (ranked.length >= 2) out.push(t('Улюбленець — {name}: {n}. Решта ревнує', { name: ranked[0][0].name, n: shots(ranked[0][1]) }));
  if (guns.length >= 2) out.push(t('У сейфі {n}. Сейф просить ще сусіда', { n: `${fmt.num(guns.length)} ${plural(guns.length, [t('ствол'), t('стволи'), t('стволів')])}` }));
  const total = M.totalShots(state).total;
  const next = [500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000].find((x) => x > total);
  if (total > 0 && next && next - total <= next * 0.15) out.push(t('До {next} пострілів лишилося {left}. Чую ювілей', { next: fmt.num(next), left: fmt.num(next - total) }));
  const byDay = new Map();
  for (const m of fired) byDay.set(m.date, (byDay.get(m.date) ?? 0) - (Number(m.qty) || 0));
  const record = Math.max(0, ...byDay.values());
  if (record >= 50) out.push(t('Твій рекорд — {n} за день. Сьогодні його можна побити', { n: shots(record) }));
  const lastDay = [...byDay.keys()].sort().pop();
  if (lastDay && ago(lastDay) >= 30) out.push(t('Останній виїзд був {n} тому. Мішені сумують', { n: days(ago(lastDay)) }));
  const trips = [...byDay.keys()].filter((d) => d.startsWith(today.slice(0, 7))).length;
  if (trips >= 4) out.push(t('Цього місяця вже {n} на стрільбищі. Сусіди думають, що ти там живеш', { n: `${fmt.num(trips)} ${plural(trips, [t('виїзд'), t('виїзди'), t('виїздів')])}` }));
  const byAmmo = new Map();
  for (const m of fired) if (m.cartridgeId) byAmmo.set(m.cartridgeId, (byAmmo.get(m.cartridgeId) ?? 0) - (Number(m.qty) || 0));
  const fav = [...byAmmo].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const favAmmo = fav.length >= 2 ? state.cartridges.find((c) => c.id === fav[0][0]) : null;
  if (favAmmo) out.push(t('Улюблений набій — «{name}»: {n}. Решта в коробках ображається', { name: favAmmo.name, n: shots(fav[0][1]) }));
  const reloaded = state.movements.filter((m) => m.kind === 'reload').reduce((s, m) => s + Math.abs(Number(m.qty) || 0), 0);
  if (reloaded >= 100) out.push(t('Власноруч споряджено {n}. Магазинні набої нервують', { n: `${fmt.num(reloaded)} ${plural(reloaded, [t('набій'), t('набої'), t('набоїв')])}` }));
  const spent = boughtSum(spending().filter((x) => String(x.date ?? '').startsWith(today.slice(0, 4))));
  if (spent > 0) out.push(t('Цього року на хобі пішло {sum}. Печиво нікому не скаже', { sum: grn(spent) }));
  const scopes = guns.reduce((s, w) => s + (w.scopes ?? []).filter(scopeBought).length, 0);
  if (guns.length && scopes > guns.length) out.push(t('Прицілів уже {n}, стволів {g}. Діагноз зрозумілий', { n: fmt.num(scopes), g: fmt.num(guns.length) }));
  const sold = state.weapons.filter(isSold).length;
  if (sold) out.push(t('Продано стволів: {n}. Кожен згадує тебе добрим словом', { n: fmt.num(sold) }));
  let stock = 0;
  for (const c of state.cartridges) {
    if (c.archived) continue;
    const n = M.cartridgeStock(state, c.id);
    stock += Math.max(0, n);
    if (n > 0 && n <= 60) out.push(t('Лишилося {n} «{name}». Всесвіт натякає на магазин', { n: fmt.num(n), name: c.name }));
  }
  if (stock >= 1000) out.push(t('У тебе {n} набоїв. Апокаліпсис тобі не страшний', { n: fmt.num(stock) }));
  return out;
}

// Панель сценок — лише для автора: вмикається на пристрої 7 тапами по аватару автора (як режим розробника в Android)
const SCENES_PANEL_KEY = 'shooters-log:scenes-panel';
let authorTaps = [];

/** Тап по аватару: щоразу підморгує, сьомий за 3 с перемикає панель сценок. */
function authorTap(e) {
  avatarHi(e);
  const now = Date.now();
  authorTaps = [...authorTaps.filter((x) => now - x < 3000), now];
  if (authorTaps.length < 7) return;
  authorTaps = [];
  const on = recall(SCENES_PANEL_KEY) !== '1';
  remember(SCENES_PANEL_KEY, on ? '1' : '');
  toast(on ? t('Святкові сценки показано у «Вигляд»') : t('Святкові сценки сховано'));
  render();
}

/** Усі святкові сценки під рукою, щоб переглянути без чекання дати. */
function scenesRow() {
  if (recall(SCENES_PANEL_KEY) !== '1') return null;
  const list = [['sobornist', t('День Соборності'), '22.01'], ['independence', t('День Незалежності'), '24.08'], ['halloween', t('Гелловін'), '31.10'], ['snowman', t('Сніговик'), '31.12'], ['newyear', t('Новий рік'), '1.01']];
  return setRow('scenes', 'sparkle', t('Святкові сценки'), '',
    h('div', { class: 'btn-row' }, list.map(([name, label, day]) => btn(`${label} · ${day}`, () => playScene(name))),
      btn(t('День народження ствола'), () => playScene('birthday', demoBirthday())),
      btn(t('Печиво з передбаченням'), () => playScene('fortune')),
      btn(t('Усі передбачення'), fortunesSheet)));
}

/** Перелік усіх передбачень печива; тап — печиво саме з цим передбаченням (сценка лягає поверх шторки). */
function fortunesSheet() {
  import('./scenes.js').then((m) => {
    m.setFortuneSource(myFortunes);
    const { plain, gold, own } = m.fortuneList();
    // own: null — щоб випадковий вибір не підмінив обране «своїм» передбаченням
    const part = (title, list, params) => [h('h3', { class: 'fortune-head' }, `${title} · ${fmt.num(list.length)}`),
      list.length
        ? h('ol', { class: 'fortune-list' }, list.map((text, i) => h('li', {},
          h('button', { type: 'button', onclick: () => playScene('fortune', params(text, i)) }, text))))
        : h('p', { class: 'muted' }, t('Зараз з обліку нічого не складається'))];
    sheet(t('Усі передбачення'), h('div', {},
      ...part(t('Звичайні'), plain, (_, i) => ({ meteor: false, gold: false, own: null, i })),
      ...part(t('Золоті'), gold, (_, i) => ({ meteor: false, gold: true, own: null, i })),
      ...part(t('З вашого обліку'), own, (text) => ({ meteor: false, gold: false, own: text }))));
  }).catch(() => {});
}

/** Після оновлення — один раз, що змінилося з версії, яку людина бачила; нова установка — без шторки. */
function showNews() {
  const hasData = db.DATA_STORES.some((s) => state[s]?.length);
  let seen = recall(SEEN_KEY) ?? (hasData ? FIRST_TRACKED : null);
  // Нумерацію перезапускали (0.7.36 → 0.7.0): «бачена» новіша за поточну — рахуємо від поточної
  if (seen && newer(seen, self.APP_VERSION)) seen = self.APP_VERSION;
  remember(SEEN_KEY, self.APP_VERSION);
  if (!seen || !newer(self.APP_VERSION, seen)) return;
  allChanges().then((all) => {
    const list = all.filter((c) => newer(c.v, seen));
    if (list.length) changesSheet(list);
  }).catch(() => {});
}

/**
 * Строки наперед — подіями для календаря телефону: дозвіл (за 3 місяці, місяць, тиждень і в останній день)
 * і відкладена чистка. Минуле не додаємо — про нього й так нагадує сам застосунок.
 */
function calendarEvents() {
  const today = M.today();
  const out = [];
  for (const w of state.weapons.filter((x) => !x.archived)) {
    const end = w.permit?.expires;
    if (end) {
      const note = `${t('діє до {date}', { date: fmt.date(end) })} · Shooter’s Log`;
      for (const [days, title] of [
        [90, 'Дозвіл на «{name}» — лишилося 3 місяці'], [30, 'Дозвіл на «{name}» — лишився місяць'],
        [7, 'Дозвіл на «{name}» — лишився тиждень'], [0, 'Дозвіл на «{name}» — останній день']]) {
        const date = M.addDays(end, -days);
        if (date >= today) out.push({ uid: `permit-${w.id}-${days}@shooters-log`, date, title: t(title, { name: w.name }), note });
      }
    }
    // Чистка в календарі — лише відкладена: дата відома, тільки коли поріг уже набрано й задано відстрочку
    const clean = M.cleaningStatus(state, w);
    if (clean.dueDate && clean.dueDate >= today) {
      out.push({ uid: `clean-${w.id}@shooters-log`, date: clean.dueDate, title: t('Почистити «{name}»', { name: w.name }),
        note: t('Нагадування про чистку з Shooter’s Log. Почистили раніше — видаліть подію.') });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Нагадування в календарі телефону: усі строки одним файлом .ics, найближчі — і по одній у Google Календар. */
function calendarRow() {
  const events = calendarEvents();
  const title = t('Календар');
  if (!events.length) {
    return setRow('calendar', 'calendar', title, t('Немає подій'),
      h('p', { class: 'muted small' }, t('Поки нічого додати: вкажіть у формі зброї, до якого числа діє дозвіл, або відстрочку нагадування про чистку.')));
  }
  const near = events.slice(0, 6);
  return setRow('calendar', 'calendar', title, fmt.num(events.length), [
    h('p', { class: 'muted small' }, t('Строки дозволів — за 3 місяці, місяць, тиждень і в останній день — і відкладена чистка подіями в календарі телефона: він нагадає, навіть коли застосунок закритий. Дати змінилися — вивантажте ще раз.')),
    h('div', { class: 'rows' }, near.map((e) => h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, e.title), h('span', { class: 'muted small' }, fmt.date(e.date))),
      toolBtn('calendar', t('Додати в Google Календар'), () => window.open(googleCalendarLink(e), '_blank', 'noopener'), 'small')))),
    events.length > near.length ? h('p', { class: 'muted small' }, t('і ще {n} — у файлі .ics', { n: events.length - near.length })) : null,
    h('div', { class: 'btn-row' }, btn(t('Усі в календар (.ics)'),
      () => offerFile('shooters-log.ics', icsCalendar(events, { name: 'Shooter’s Log' }), 'text/calendar'), 'primary'))]);
}

/** Видалені вбудовані вправи — лише сховані: повернути всі разом, якщо прибрали зайве. */
function hiddenExercisesRow() {
  if (!moduleOn('exercises')) return null;
  const hidden = state.exercises.filter((r) => r.hidden);
  if (!hidden.length) return null;
  const restore = async () => {
    // Позначку «лише сховати» прибираємо зовсім; сховану правку — просто показуємо знову
    await db.write({ exercises: {
      del: hidden.filter((r) => r.hideOnly).map((r) => r.id),
      put: hidden.filter((r) => !r.hideOnly).map((r) => ({ ...r, hidden: false })),
    } });
    await refresh();
    toast(t('Вправи повернулися до списку: {n}', { n: hidden.length }));
  };
  return setRow('exercises', 'drill', t('Вправи'), fmt.num(hidden.length), [
    h('p', { class: 'muted small' }, t('Видалені вбудовані вправи: {list}.', { list: hidden.map((r) => exerciseName(r.id) ?? r.id).join(', ') })),
    h('div', { class: 'btn-row' }, btn(t('Повернути вбудовані вправи ({n})', { n: hidden.length }), restore))]);
}

/** ⚙ «Розділи»: вимкнути те, чим не займаєшся, — вкладки зникають, записи лишаються. */
function modulesRow() {
  const items = [
    ['reload', 'recipe', t('Релоадінг'), t('Склад → «Компоненти» й «Релоадінг», поле «Рецепт» у набої')],
    ['gear', 'vest', t('Екіпірування'), t('Арсенал → «Екіпірування»')],
    ['exercises', 'drill', t('Вправи'), t('Полігон → «Вправи»; «Довідник стрільця» переїде в «Мішені»')],
    ['chrono', 'speed', t('Швидкості'), t('Полігон → «Швидкості» (хронограф); записані серії й далі уточнюють розрахунки')],
    ['timer', 'timer', t('Таймер'), t('Полігон → «Таймер»')],
  ];
  const off = items.filter(([m]) => !moduleOn(m)).length;
  return setRow('modules', 'filter', t('Розділи'), off ? t('сховано: {n}', { n: off }) : t('усі'), [
    h('p', { class: 'muted small' }, t('Вимкніть те, чим не займаєтесь, — вкладки зникнуть. Записи не видаляються: увімкнули назад — усе на місці.')),
    h('div', { class: 'set-switches' }, items.map(([m, ico, title, sub]) => {
      const input = h('input', { type: 'checkbox', role: 'switch', checked: moduleOn(m), onchange: () => { vibrate(8); setModule(m, input.checked); render(); } });
      return h('label', { class: 'set-switch' }, toolIcon(ico), h('span', { class: 'ss-text' }, h('b', {}, title), h('small', {}, sub)),
        h('span', { class: 'mount-sw' }, input, h('span', { class: 'mount-track', 'aria-hidden': 'true' })));
    })),
  ]);
}

/** ⚙ «Вход по отпечатку»: увімкнути, через скільки блокувати у фоні, вимкнути. */
function lockRow() {
  const body = h('div', { class: 'set-sub' });
  const act = (fn, done) => async () => {
    try {
      await fn();
      toast(done);
    } catch (err) {
      if (err?.name !== 'NotAllowedError') toast(t('Помилка: {msg}', { msg: err?.message || String(err) }));
    }
    render();
  };
  if (lockOn()) {
    const delay = chips(LOCK_DELAYS.map((m) => [String(m), m ? t('{n} хв', { n: m }) : t('Одразу')]), String(lockDelay()), (v) => { setLockDelay(Number(v)); render(); });
    delay.classList.add('segmented');
    body.append(
      h('p', { class: 'muted small' }, t('Блокувати після згортання:')), delay,
      h('div', { class: 'btn-row' }, btn(t('Вимкнути'), act(disableLock, t('Вхід за відбитком вимкнено')))));
  } else {
    lockAvailable().then((ok) => body.append(ok
      ? h('div', { class: 'btn-row' }, btn(t('Увімкнути'), act(enableLock, t('Вхід за відбитком увімкнено')), 'primary'))
      : h('p', { class: 'muted small' }, t('На цьому пристрої немає відбитка, обличчя чи PIN-коду, які браузер може перевірити.'))));
  }
  const value = !lockOn() ? t('Вимкнено') : lockDelay() ? t('Через {n} хв', { n: lockDelay() }) : t('Одразу');
  return setRow('lock', 'lock', t('Вхід за відбитком'), value, [
    h('p', { class: 'muted small' }, t('Застосунок відкривається відбитком, обличчям або PIN-кодом телефона — лише на цьому пристрої. Це захист від чужих очей, дані не шифруються.')),
    body]);
}

/** Фон під картками — плитки з самим фоном, щоб видно було до вибору; набір — для поточної теми, у нічній панелі немає. */
function backdropRow() {
  const theme = document.documentElement.dataset.theme;
  const list = BACKDROPS[theme];
  if (!list) return null;
  let now = backdropPref(theme);
  const label = (k) => t(list.find(([x]) => x === k)[1]);
  const strip = h('div', { class: 'bg-picks', role: 'radiogroup', 'aria-label': t('Фон') }, list.map(([k, name]) => h('button', {
    type: 'button', class: 'bg-pick', role: 'radio', 'aria-checked': String(k === now), dataset: { bg: k },
    onclick: (e) => wheel.centerOn(e.currentTarget),
  }, h('span', { class: 'bg-sw', dataset: { bg: k } }), h('span', {}, t(name)))));
  // Як стрічка цілей: фон посередині — вибраний і одразу під картками, гортаєш — бачиш наживо
  const wheel = wheelStrip(strip, (b) => {
    if (b.dataset.bg === now) return;
    now = b.dataset.bg;
    remember(BG_KEY[theme], now);
    strip.querySelectorAll('.bg-pick').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    applyTheme();
    // Без перемальовування — інакше стрічка злетіла б посеред гортання; назву в рядку міняємо на місці
    row.querySelector('.set-val').textContent = label(now);
  }, '.bg-pick');
  // «‹ ›» по краях — видно, що стрічку гортають
  const step = (dir) => {
    const on = strip.querySelector('[aria-checked="true"]');
    const to = dir < 0 ? on?.previousElementSibling : on?.nextElementSibling;
    if (to) wheel.centerOn(to);
  };
  const nav = (dir, text, name) => h('button', { type: 'button', class: 'bg-nav', 'aria-label': t(text), onclick: () => step(dir) }, name);
  // Поля й вибраний посередині рахуються від ширини стрічки: поки її не видно, досчитуємо, щойно з'явиться
  let width = 0;
  new ResizeObserver(() => {
    if (!strip.clientWidth || strip.clientWidth === width) return;
    width = strip.clientWidth;
    wheel.settle(strip.querySelector('[aria-checked="true"]'));
  }).observe(strip);
  const row = setRow('backdrop', 'gallery', t('Фон'), label(now),
    h('div', { class: 'bg-wheel' }, nav(-1, 'Попередній', '‹'), strip, nav(1, 'Наступний', '›')));
  return row;
}

/** ⚙ «Курс НБУ»: долари поруч із гривнями і графік курсу. */
function usdRow() {
  const row = chips([['off', t('Лише гривні')], ['on', t('Гривні й $')]], usdOn() ? 'on' : 'off', (v) => {
    remember('shooters-log:usd', v);
    if (v === 'on') pullRates();
    render();
  });
  row.classList.add('segmented');
  const now = rateOn(M.today());
  return setRow('usd', 'dollar', t('Курс НБУ'), usdOn() ? t('Гривні й $') : t('Лише гривні'), [
    h('p', { class: 'muted small' }, t('Поруч із цінами — приблизно в доларах за курсом НБУ на день покупки.')),
    row,
    h('div', { class: 'btn-row' }, btn(t('Графік курсу · сьогодні {r} грн', { r: fmt.num(Math.round(now * 100) / 100) }), rateSheet))]);
}

/** Сценки при запуску — показувати чи ні; без подробиць, що саме буде: це сюрприз. */
function scenesOnRow() {
  const row = chips([['on', t('Показувати')], ['off', t('Не показувати')]], scenesOn() ? 'on' : 'off', (v) => {
    remember(SCENES_OFF, v === 'off' ? '1' : '');
    render();
  });
  row.classList.add('segmented');
  const soundOn = recall(SCENE_SOUND_OFF) !== '1';
  const sound = chips([['on', t('Зі звуком')], ['off', t('Без звуку')]], soundOn ? 'on' : 'off', (v) => {
    remember(SCENE_SOUND_OFF, v === 'off' ? '1' : '');
    render();
  });
  sound.classList.add('segmented');
  const value = scenesOn() ? [t('Показувати'), soundOn ? null : t('без звуку')].filter(Boolean).join(' · ') : t('Не показувати');
  return setRow('scenes-on', 'sparkle', t('Сценки при запуску'), value, [
    h('p', { class: 'muted small' }, t('Святкові привітання й маленькі сюрпризи, коли відкриваєте застосунок.')),
    row, scenesOn() ? sound : null]);
}

/** Графік курсу долара НБУ: рік, 5 років або з 2014. */
function rateSheet() {
  const today = M.today();
  const back = (years) => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
  const PERIODS = [['1y', t('Рік'), back(1), 3], ['5y', t('5 років'), back(5), 14], ['all', t('З 2014'), '2014-01-01', 30]];
  const body = h('div', {});
  const draw = (key) => {
    const [, , from, step] = PERIODS.find(([k]) => k === key);
    const series = rateSeries(from, today, step);
    const lo = series.reduce((a, b) => (b.rate < a.rate ? b : a));
    const hi = series.reduce((a, b) => (b.rate > a.rate ? b : a));
    const money = (r) => `${fmt.num(Math.round(r * 100) / 100)} грн`;
    body.replaceChildren(
      lineChart(series.map((x) => ({ label: fmt.date(x.iso), value: x.rate })), { format: money }),
      h('p', { class: 'muted small' }, t('мін. {lo} ({a}) · макс. {hi} ({b}) · сьогодні {now}', {
        lo: money(lo.rate), a: fmt.date(lo.iso), hi: money(hi.rate), b: fmt.date(hi.iso), now: money(rateOn(today)) })));
  };
  const row = chips(PERIODS.map(([k, label]) => [k, label]), '1y', draw);
  row.classList.add('segmented');
  draw('1y');
  sheet(t('Курс долара НБУ'), h('div', {}, row, body));
}

/** Дотягнути курс НБУ за дні після вшитої історії; є нове — перемалювати. */
async function pullRates() {
  if (await refreshRates(M.today())) { render(); refreshSheets(); }
}

function renderSettings() {
  $('subtitle').textContent = t('версія {v}', { v: self.APP_VERSION });
  // «Про застосунок» — згори, як і було; далі від того, що чіпають найчастіше, до разового
  return h('div', { class: 'settings' },
    settingsGroup(t('Про застосунок'), [aboutPanel()]),
    settingsGroup(t('Дані'), [syncRow(), lockRow(), backupRow(), storageRow(), demoRow(), wipeRow()]),
    settingsGroup(t('Вигляд'), [langRow(), themeRow(), backdropRow(), usdRow(), scenesOnRow(), scenesRow(), modulesRow()]),
    settingsGroup(t('Нагадування й вправи'), [calendarRow(), hiddenExercisesRow()]));
}

/** Група налаштувань: рамка з назвою на лінії (як в 1С), всередині — рядки через лінію. Порожня — не показується. */
function settingsGroup(title, items) {
  const list = items.filter(Boolean);
  return list.length ? h('fieldset', { class: 'box settings-group' }, h('legend', {}, title), list) : null;
}

const SET_OPEN_KEY = 'shooters-log:set-open';

/**
 * Рядок налаштувань: іконка, назва й поточне значення — видно, що де стоїть, нічого не відкриваючи.
 * Тап розгортає керування під рядком; відкритий завжди один, і його пам'ятаємо між перемальовуваннями.
 */
function setRow(key, ico, title, value, body, { tone = '', danger = false } = {}) {
  const open = recall(SET_OPEN_KEY) === key;
  const row = h('div', { class: `set-row${open ? ' open' : ''}${danger ? ' danger' : ''}` });
  const head = h('button', {
    type: 'button', class: 'set-head', 'aria-expanded': String(open), onclick: () => {
      const opening = !row.classList.contains('open');
      document.querySelectorAll('.set-row.open').forEach((r) => setOpen(r, false));
      setOpen(row, opening);
      remember(SET_OPEN_KEY, opening ? key : '');
    },
  }, toolIcon(ico), h('span', { class: 'set-title' }, title),
  h('span', { class: `set-val${tone ? ` ${tone}` : ''}` }, value), h('span', { class: 'set-chev', 'aria-hidden': 'true' }, '›'));
  row.append(head, h('div', { class: 'set-body', inert: !open }, h('div', { class: 'set-inner' }, h('div', { class: 'set-pane' }, body))));
  return row;
}

function setOpen(row, open) {
  row.classList.toggle('open', open);
  row.querySelector('.set-head').setAttribute('aria-expanded', String(open));
  row.querySelector('.set-body').inert = !open;
}

/** Час для рядка: сьогодні — година, раніше — дата. */
function shortWhen(ms) {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? fmt.time(ms)
    : fmt.date(new Date(ms - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
}

function syncRow() {
  const s = sync.status;
  const on = sync.configured() && sync.enabled();
  const bad = on && (s.state === 'auth' || s.state === 'error');
  const value = !sync.configured() ? t('Не налаштовано') : !on ? t('Вимкнено')
    : s.state === 'auth' ? t('Увійти') : s.state === 'error' ? t('Похибка') : s.state === 'offline' ? t('Офлайн')
      : s.lastSync ? shortWhen(s.lastSync) : t('Ще не було');
  return setRow('sync', 'cloud', t('Google Диск'), value, syncBody(), { tone: bad ? 'bad' : on ? 'ok' : '' });
}

function backupRow() {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; } });
  const last = recall(BACKUP_KEY);
  return setRow('backup', 'save', t('Резервна копія'), last ? fmt.date(last) : t('Ще не було'), [
    h('p', { class: 'muted small' }, sync.enabled()
      ? t('Основна копія — на Google Диску. Файл нижче — додатковий знімок про всяк випадок.')
      : t('Без синхронізації дані зберігаються лише на цьому пристрої. Робіть експорт після кожної стрільби — наприклад, «Поділитися» → Google Диск або Telegram «Збережене».')),
    h('p', { class: 'muted small' }, t('У файл копії потрапляють лише мініатюри фото; самі фото зберігаються на Google Диску.')),
    h('div', { class: 'btn-row' },
      btn(t('Поділитися копією'), () => exportData(true), 'primary'),
      btn(t('Завантажити файл'), () => exportData(false)),
      btn(t('Імпорт'), () => fileInput.click())),
    fileInput]);
}

/** «Сховище»: чи захищені дані від автоочистки браузера й скільки чого лежить. */
function storageRow() {
  const value = h('span', {}, '…');
  const persisted = h('span', {}, '…');
  navigator.storage?.persisted?.().then((p) => {
    value.textContent = p ? t('Захищено') : t('Може очиститись');
    persisted.textContent = p ? t('захищено від автоочищення') : t('браузер може очистити, якщо забракне місця');
  }).catch(() => { value.textContent = ''; persisted.textContent = t('невідомо'); });
  return setRow('storage', 'database', t('Сховище'), value, [
    h('p', {}, persisted),
    h('p', { class: 'muted small' }, t('Зброя: {w} · фото: {p} · набої: {c} · компоненти: {k} · рецепти: {r} · рухи: {m}', {
      w: state.weapons.length, p: state.photos.length, c: state.cartridges.length, k: state.components.length, r: state.recipes.length, m: state.movements.length,
    }))]);
}

function demoRow() {
  return setRow('demo', 'play', t('Демодані'), '', [
    h('p', { class: 'muted small' }, t('Облік з 2022 року для прикладу: три стволи з фото й тюнінгом, екіпірування, покупки й стрільби, самоспорядження, чистки, розмічені мішені, вправи зі зростанням результату, швидкості й серії таймера. Зручно подивитися, як усе працює, доки своїх записів немає.')),
    h('div', { class: 'btn-row' }, btn(t('Завантажити демодані'), loadDemo))]);
}

/** Видалення — останнім рядком «Даних» і згорнуте: небезпечна дія не має бути найпомітнішою на екрані. */
function wipeRow() {
  return setRow('wipe', 'delete', t('Видалити дані з пристрою'), '',
    h('div', { class: 'btn-row' }, btn(t('Видалити дані з пристрою'), () => confirmSheet(t('Видалити дані з пристрою?'), sync.enabled()
      ? t('Дані буде видалено з цього пристрою. Копія на Google Диску залишиться й повернеться під час наступної синхронізації (крім фото, що ще не встигли вивантажитися) — щоб цього не сталося, спершу вимкніть синхронізацію.')
      : t('Зброю, БК, журнал, рецепти й фото буде видалено з цього пристрою. Скасувати не можна.'), t('Видалити'), async () => {
      await db.clearAll(); await refresh(); toast(t('Дані видалено'));
    }), 'danger')),
    { danger: true });
}

function langRow() {
  if (Object.keys(LANGS).length < 2) return null;
  const c = chips(Object.entries(LANGS), lang(), switchLang);
  c.classList.add('segmented');
  return setRow('lang', 'globe', 'Мова · Language', LANGS[lang()], c);
}

function themeRow() {
  // Дві групи: щоденні теми й «Спецрежими» (нічна й монітори-кінескопи); вибрана підсвічується у своїй групі
  const themeChips = (special) => {
    const c = chips(THEMES.filter(([k]) => SPECIAL_THEMES.includes(k) === special).map(([k, label]) => [k, t(label)]), themePref(),
      (v) => { remember('shooters-log:theme', v); applyTheme(); render(); });
    c.classList.add('segmented');
    return c;
  };
  return setRow('theme', 'palette', t('Тема'), t(THEMES.find(([k]) => k === themePref())[1]), [
    themeChips(false),
    h('div', { class: 'field-label theme-group' }, t('Спецрежими')), themeChips(true),
    // Ніч буває різна: тягнеш — сторінка одразу темнішає чи світлішає
    themePref() === 'night' ? h('label', { class: 'field night-level' }, h('span', {}, t('Яскравість червоного')),
      h('input', { type: 'range', min: '20', max: '100', step: '5', value: String(nightLevel()),
        oninput: (e) => { remember('shooters-log:night-level', e.target.value); applyTheme(); } })) : null]);
}

// ---------- довідник ----------

// Книга із сіткою прицілу: рядки — кольором тексту, сітка — акцентом; темна й світла теми однаково
const GUIDE_ICON = '<svg viewBox="0 0 48 32" aria-hidden="true">'
  + '<path d="M24 7c-5-3-12-3.6-18-2.4v21.8c6-1.2 13-.6 18 2.4 5-3 12-3.6 18-2.4V4.6C36 3.4 29 4 24 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  + '<path d="M24 7v21.8" stroke="currentColor" stroke-width="1.4" opacity=".6"/>'
  + '<path d="M9.5 11h10M9.5 15h10M9.5 19h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>'
  + '<circle cx="33" cy="16" r="6.2" fill="none" stroke="var(--accent)" stroke-width="1.6"/>'
  + '<path d="M33 8.6v4.4M33 19v4.4M25.6 16H30M36 16h4.4" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/>'
  + '<circle cx="33" cy="16" r="1" fill="var(--accent)"/>'
  + '</svg>';

// Та сама книга, що в курсу марксмана; на правій сторінці замість прицілу — лійка, з якої сиплеться порох
const RELOAD_ICON = '<svg viewBox="0 0 48 32" aria-hidden="true">'
  + '<path d="M24 7c-5-3-12-3.6-18-2.4v21.8c6-1.2 13-.6 18 2.4 5-3 12-3.6 18-2.4V4.6C36 3.4 29 4 24 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  + '<path d="M24 7v21.8" stroke="currentColor" stroke-width="1.4" opacity=".6"/>'
  + '<path d="M9.5 11h10M9.5 15h10M9.5 19h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>'
  + '<path d="M28 10.6h10l-3.6 6.4v4.4l-.4.4h-2l-.4-.4v-4.4z" fill="var(--accent)" fill-opacity=".22" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>'
  + '<path d="M27.2 10.6h11.6" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/>'
  + '<circle cx="33" cy="23.5" r=".6" fill="var(--accent)"/>'
  + '<circle cx="33" cy="25.3" r=".5" fill="var(--accent)" opacity=".6"/>'
  + '</svg>';

/** Посилання на довідник: у «Полігон → Вправи» — курс марксмана, у «Склад → Релоадінг» — курс релоадінгу. */
function guideLink(href = '#guide', title = 'Довідник стрільця', sub = 'Курс марксмана', svg = GUIDE_ICON) {
  const icon = h('span', { class: 'guide-link-ico' });
  icon.innerHTML = svg;
  return h('a', { class: 'guide-link', href }, icon,
    h('span', { class: 'guide-link-text' },
      h('b', {}, t(title)),
      h('span', { class: 'muted small' }, t(sub))),
    h('span', { class: 'guide-link-go', 'aria-hidden': 'true' }, '›'));
}

const reloadGuideLink = () => guideLink('#reloading-guide', 'Довідник релоадера', 'Курс релоадінгу', RELOAD_ICON);

/** «Полігон → Тренажер»: розділ «sim» курсу окремо, розмітка одна з довідником. */
function renderSim() {
  const box = h('div', { class: 'guide' }, h('p', { class: 'muted' }, t('Завантаження…')));
  guide().then(({ g, html }) => {
    const sim = g.parseGuide(html).sections.find((s) => s.id === 'sim');
    box.replaceChildren(sim.body);
    g.initGuide(box, { clockPicker, keepPlace, kitPicker, myLoads: myDopeLoads, myGuns: myGunLoads, windGuesses });
    simIntro(box, { auto: true });
  }).catch(() => {
    box.replaceChildren(empty(t('Довідник недоступний'), t('Відкрийте застосунок з інтернетом хоча б раз, щоб він зберігся для офлайну.')));
  });
  return box;
}

const renderGuide = () => guideDoc('marksman', 'guide', 'Курс марксмана · тем: {n}');
const renderReloadGuide = () => guideDoc('reloading', 'reloading-guide', 'Курс релоадінгу · тем: {n}');

/** Розділи курсу згорнуті; пошук розкриває збіги й ховає решту. Калькулятор і тренажер — лише в курсі марксмана. */
function guideDoc(kind, view, subtitle) {
  const marksman = kind === 'marksman';
  const list = h('div', { class: 'guide' }, h('p', { class: 'muted' }, t('Завантаження…')));
  guide(kind).then(({ g, html }) => {
    const { sections, foot } = g.parseGuide(html);
    if (tab === view) $('subtitle').textContent = t(subtitle, { n: sections.length });
    // Тренажер живе в «Полігоні»; розмітка розділу лишається в статті як його джерело, тут — лише посилання
    const simLink = () => h('div', { class: 'guide-sec' },
      h('p', {}, t('Тренажер сіток із цілями, вітром, рухом і вправами — у вкладці «Полігон».')),
      h('a', {
        class: 'guide-link', href: '#targets',
        onclick: () => { rangeSeg = 'sim'; remember('shooters-log:range-seg', 'sim'); },
      }, h('span', { class: 'guide-link-text' }, h('b', {}, t('Відкрити тренажер')), h('span', { class: 'muted small' }, t('Полігон → Тренажер'))),
      h('span', { class: 'guide-link-go', 'aria-hidden': 'true' }, '›')));
    const folds = sections.map((s) => fold(`guide:${s.id}`,
      [h('span', { class: 'guide-n' }, s.num), h('span', { class: 'fold-title' }, s.title)], s.id === 'sim' ? simLink() : s.body));
    folds.forEach((el, i) => { el.id = sections[i].id; });
    const nothing = h('p', { class: 'muted guide-none', hidden: true }, t('Нічого не знайдено'));
    let before = null;
    const search = h('input', {
      type: 'search', class: 'guide-search', placeholder: t('Пошук у довіднику'), autocomplete: 'off',
      oninput: () => {
        const q = search.value.trim().toLowerCase();
        // Стан до пошуку повертаємо, коли рядок очищено.
        if (q && !before) before = folds.map((el) => el.open);
        let hits = 0;
        folds.forEach((el, i) => {
          const hit = !q || el.textContent.toLowerCase().includes(q);
          el.hidden = !hit;
          if (q) el.open = hit;
          else if (before) el.open = before[i];
          hits += hit;
        });
        if (!q) before = null;
        nothing.hidden = hits > 0;
      },
    });
    // До змісту: згорнути все й угору; кнопка видна, лише коли якийсь розділ розгорнуто.
    const toc = h('button', {
      type: 'button', class: 'fab guide-toc', 'aria-label': t('До змісту'), title: t('До змісту'),
      onclick: () => {
        search.value = '';
        search.dispatchEvent(new Event('input'));
        folds.forEach((el) => { el.open = false; });
        window.scrollTo({ top: 0, behavior: smooth() });
      },
    }, '☰');
    const updToc = () => { toc.hidden = !folds.some((el) => el.open); };
    list.addEventListener('toggle', updToc, true);
    list.replaceChildren(...[
      search, nothing, ...folds, foot, toc].filter(Boolean));
    updToc();
    if (!marksman) return;
    g.initGuide(list, { clockPicker, keepPlace, kitPicker, myLoads: myDopeLoads, myGuns: myGunLoads, windGuesses });
    simIntro(list);
  }).catch(() => {
    list.replaceChildren(empty(t('Довідник недоступний'), t('Відкрийте застосунок з інтернетом хоча б раз, щоб він зберігся для офлайну.')));
  });
  // Посилання між розділами (#wind тощо) — без зміни маршруту.
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    const target = a && list.querySelector(`details.fold[id="${CSS.escape(a.getAttribute('href').slice(1))}"]`);
    if (!target) return;
    e.preventDefault();
    target.hidden = false;
    target.open = true;
    target.scrollIntoView({ behavior: smooth(), block: 'start' });
  });
  return list;
}

// ---------- навігація ----------

/** «+» на вкладці БК: купити вже заведений набій або завести новий. */
function ammoAddMenu() {
  const list = state.cartridges.filter((c) => !c.archived).sort((a, b) => collate(a.caliber, b.caliber) || collate(a.name, b.name));
  // Купувати ще нічого — меню з однієї кнопки зайве
  if (!list.length) { cartridgeForm(); return; }
  const close = sheet(t('Додати'), h('div', {},
    h('div', { class: 'btn-col' }, btn(t('Новий набій'), () => { close(); cartridgeForm(); }, 'primary')),
    list.length ? box(t('Купити вже заведений'), groupBy(list, (c) => c.caliber || t('Без калібру')).map(([caliber, items]) =>
      fold(`buy:${caliber}`,
        [cartridgeIcon(caliber), h('span', { class: 'fold-title' }, caliber),
          h('span', { class: 'fold-meta' }, t('{n} поз.', { n: items.length })),
          h('span', { class: 'fold-sum' }, `${fmt.num(items.reduce((n, c) => n + M.cartridgeStock(state, c.id), 0))} ${t('шт')}`)],
        h('div', { class: 'rows' }, items.map((c) =>
          h('button', { type: 'button', class: 'row', onclick: () => { close(); buySheet(c); } },
            cartridgeIcon(c.caliber),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, c.name)),
            h('span', { class: 'row-qty' }, fmt.num(M.cartridgeStock(state, c.id))))))))) : null));
}

/** Розділ, з якого відкрили налаштування, — для «Назад». */
let backTab = 'ammo';

const VIEWS = {
  // «+» — у відкритому розділі: набій, компонент або рецепт.
  ammo: { title: 'Склад', render: renderStock, fab: () => ({ ammo: ammoAddMenu, components: componentForm, recipes: recipeForm }[stockSeg])() },
  guns: { title: 'Арсенал', render: renderGuns, fab: () => (gunsSeg === 'gear' ? gearForm() : weaponForm()) },
  log: { title: 'Журнал', render: renderLog, fab: foreignShotSheet },
  settings: { title: 'Налаштування', render: renderSettings },
  guide: { title: 'Довідник', render: renderGuide, tab: 'targets' },
  'reloading-guide': { title: 'Довідник', render: renderReloadGuide, tab: 'ammo' },
  // «+» — у розділі, що відкритий: своя вправа або нова мішень; у таймера кнопки немає.
  targets: { title: 'Полігон', render: renderRange, fab: () => (rangeSeg === 'exercises' ? newExercise() : rangeSeg === 'chrono' ? chronoForm() : newTarget({ weaponId: targetWeapon || null })), noFab: () => rangeSeg === 'timer' || rangeSeg === 'sim' },
};

// Перейшли на інший розділ — його значок у нижньому меню пару секунд грає свою анімацію; при старті — ні
let shownTab = null;
let tabPlay = 0;
function playTab(now) {
  const was = shownTab;
  shownTab = now;
  if (!was || was === now) return;
  const links = document.querySelectorAll('.tabs a, #settings-btn');
  links.forEach((a) => a.classList.remove('play'));
  // Налаштування — не в нижньому меню: грає шестерня вгорі
  const link = now === 'settings' ? $('settings-btn') : document.querySelector(`.tabs a[data-tab="${now}"]`);
  if (!link) return;
  void link.offsetWidth;
  link.classList.add('play');
  clearTimeout(tabPlay);
  tabPlay = setTimeout(() => link.classList.remove('play'), 2600);
}

function render() {
  const view = VIEWS[tab];
  $('title').textContent = t(view.title);
  $('subtitle').textContent = '';
  $('view').replaceChildren(view.render());
  // Таймер пішов з екрана (інша вкладка чи розділ) — мікрофон не слухає непомітно
  if (!document.querySelector('.timer')) stopTimerPanel();
  // Порожній екран має свою кнопку «Додати» — «+» поверх неї не потрібен
  $('fab').hidden = !view.fab || Boolean(view.noFab?.()) || Boolean($('view').querySelector('.empty .btn.add'));
  $('fab').classList.remove('away');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (view.tab ?? tab)));
  playTab(view.tab ?? tab);
  $('settings-btn').classList.toggle('active', (view.tab ?? tab) === 'settings');
  // У налаштуваннях — «Назад» туди, звідки прийшли; підказки «?» — лише в розділах
  $('back-btn').hidden = tab !== 'settings';
  $('tour-btn').hidden = tab === 'settings' || tab === 'guide' || tab === 'reloading-guide';
  $('back-btn').href = `#${backTab}`;
  document.querySelector('.tabs a[data-tab="guns"]').classList.toggle('alert',
    state.weapons.some(needsCleaning) || urgentPermits().length > 0);
}

/** Раз на день при відкритті: які стволи не почищені після стрільби. Повертає true, якщо нагадав. */
function cleaningReminder() {
  const dirty = state.weapons.filter(needsCleaning);
  if (!dirty.length || recall('shooters-log:clean-reminded') === M.today()) return false;
  remember('shooters-log:clean-reminded', M.today());
  toast(t('Час почистити: {names}', { names: dirty.map((w) => w.name).join(', ') }), {
    action: t('Показати'),
    onAction: () => showWeapon(dirty[0].id),
    reminder: true,
  });
  return true;
}

function route() {
  const next = location.hash.slice(1);
  // Вкладку «Рецепти» злито в «Склад» (0.7.22): старе посилання веде в розділ рецептів.
  if (next === 'reload') {
    if (moduleOn('reload')) stockSeg = 'recipes';
    history.replaceState(history.state, '', '#ammo');
  }
  const to = VIEWS[next] ? next : 'ammo';
  if (to === 'settings' && tab !== 'settings' && VIEWS[tab]) backTab = tab;
  tab = to;
  render();
  window.scrollTo(0, 0);
}

// ---------- ярлики на іконці (shortcuts у manifest.webmanifest) ----------

/** Дата останнього руху ствола (стрільба чи чистка) — щоб ті, з яких стріляли нещодавно, були зверху. */
function lastUse() {
  const at = new Map();
  for (const m of state.movements) {
    if (!m.weaponId || (m.kind !== 'shot' && m.kind !== 'clean')) continue;
    const d = m.date ?? '';
    if (d > (at.get(m.weaponId) ?? '')) at.set(m.weaponId, d);
  }
  return at;
}

/** Вибір ствола для ярлика; один ствол — одразу далі, жодного — на «Арсенал». */
function pickWeapon(title, next) {
  const at = lastUse();
  const guns = state.weapons.filter((w) => !w.archived)
    .sort((a, b) => (at.get(b.id) ?? '').localeCompare(at.get(a.id) ?? '') || byName(a, b));
  if (!guns.length) { goTab('#guns'); toast(t('Спершу додайте зброю')); return; }
  if (guns.length === 1) { next(guns[0]); return; }
  const close = sheet(title, h('div', { class: 'rows' }, guns.map((w) => h('button', {
    type: 'button', class: 'row', onclick: () => { close(); next(w); },
  }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, w.name),
    h('span', { class: 'muted small' }, [w.caliber, at.get(w.id) ? fmt.date(at.get(w.id)) : null].filter(Boolean).join(' · ')))))));
}

/** Вибір набою для ярлика «Купив»: що є на складі — зверху. */
function pickCartridge(title, next) {
  const ammo = state.cartridges.filter((c) => !c.archived)
    .map((c) => ({ c, stock: M.cartridgeStock(state, c.id) }))
    .sort((a, b) => b.stock - a.stock || byName(a.c, b.c));
  if (!ammo.length) { goTab('#ammo'); toast(t('Спершу додайте набій')); return; }
  if (ammo.length === 1) { next(ammo[0].c); return; }
  const close = sheet(title, h('div', { class: 'rows' }, ammo.map(({ c, stock }) => h('button', {
    type: 'button', class: 'row', onclick: () => { close(); next(c); },
  }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, c.name), h('span', { class: 'muted small' }, c.caliber)),
    h('span', { class: 'row-qty' }, fmt.num(stock))))));
}

// Ключ — ?go=… в адресі ярлика; набір ярликів задає manifest, тут — усі можливі дії
const SHORTCUTS = {
  shot: () => pickWeapon(t('Записати стрільбу'), (w) => shootSheet({ weapon: w })),
  shared: () => takeSharedImage().catch((err) => toast(err.message)),
  target: () => { goRange('targets'); newTarget({ weaponId: targetWeapon || null }); },
  timer: () => goRange('timer'),
  sim: () => goRange('sim'),
  clean: () => pickWeapon(t('Почищено'), cleanSheet),
  buy: () => pickCartridge(t('Купівля набоїв'), buySheet),
  chrono: () => { goRange('chrono'); if (moduleOn('chrono')) chronoForm(); },
};

/** Запуск з ярлика: дія з ?go=…, а сам параметр прибираємо — оновлення сторінки не повторить її. */
function runShortcut() {
  const go = new URLSearchParams(location.search).get('go');
  if (!go) return;
  history.replaceState(history.state, '', location.pathname + location.hash);
  SHORTCUTS[go]?.();
}

/**
 * Ручна перевірка оновлення: інколи телефон не питає сам (старий worker живий, мережа підвела).
 * Нова версія приходить плашкою вгорі — тут лише штовхаємо перевірку й кажемо, чим вона скінчилась.
 */
async function checkUpdate() {
  if (!('serviceWorker' in navigator)) { toast(t('Оновлення працюють лише через https')); return; }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) { toast(t('Застосунок ще не встановлено як офлайн-копію')); return; }
  // Без мережі reg.update() не падає, а тихо завершується — інакше вийшло б «у вас найновіша версія»
  if (!navigator.onLine) { toast(t('Немає зв’язку із сервером')); return; }
  toast(t('Перевіряю оновлення…'));
  // Wi-Fi без інтернету браузер теж вважає «онлайн» — питаємо сам сервер; HEAD іде повз service worker (той ловить лише GET)
  try {
    const res = await fetch('./version.js', { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    toast(t('Немає зв’язку із сервером'));
    return;
  }
  try {
    await reg.update();
  } catch {
    toast(t('Немає зв’язку із сервером'));
    return;
  }
  if (reg.installing || reg.waiting) toast(t('Є нова версія — натисніть «Оновити» вгорі'));
  else toast(t('У вас найновіша версія'));
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Локальна розробка: без worker і його кешу, щоб правки видно було одразу; офлайн перевіряти з ?sw
  if (['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) && !new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    return;
  }
  const offer = (worker) => {
    $('update').hidden = false;
    $('update-btn').onclick = () => worker.postMessage('skipWaiting');
  };
  // updateViaCache 'none' — перевірка оновлення не бере sw.js і version.js з HTTP-кешу.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    reg.update().catch(() => {});
  }).catch((err) => console.warn('SW registration failed', err));
  // Перший візит: worker щойно взяв сторінку під контроль (clients.claim) — це не оновлення, перезавантажувати нічого
  let controlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

applyStatic();
applyTheme();
initLock({ key: 'shooters-log:lock', name: 'Shooter’s Log', icon: 'icons/icon-192.png', text: () => ({
  locked: t('Застосунок заблоковано'), unlock: t('Розблокувати'), denied: t('Не підтверджено. Спробуйте ще раз.'),
  failed: t('Помилка: {msg}'), reset: t('Не виходить? Створити ключ наново') }) });
$('fab').addEventListener('click', () => VIEWS[tab].fab?.());
// «+» не закриває картки під собою: гортаєш униз — ховається, вгору чи дійшов до кінця — повертається
let fabY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  const end = y + innerHeight >= document.documentElement.scrollHeight - 40;
  if (Math.abs(y - fabY) < 12 && !end) return;
  $('fab').classList.toggle('away', y > fabY && y > 80 && !end);
  fabY = y;
}, { passive: true });
$('sync-chip').addEventListener('click', onSyncChip);
$('tour-btn').addEventListener('click', screenHelp);
window.addEventListener('hashchange', route);
// Нижні вкладки — свайпом по панелі, як розділи; у налаштуваннях жодна не вибрана — свайп нічого не робить
swipeStep(document.querySelector('.tabs'), (dir) => {
  const links = [...document.querySelectorAll('.tabs a')];
  const at = links.findIndex((a) => a.classList.contains('active'));
  const next = at < 0 ? null : links[at + dir];
  if (next) goTab(next.getAttribute('href'));
  return Boolean(next);
});
// Мобільний Chrome то показує, то ховає адресний рядок: видима частина екрана стає нижчою
// за сторінку, і нижня панель вкладок опиняється під краєм. Піднімаємо її на цю різницю.
// Великий відступ (клавіатура) ігноруємо — там панель має лишатись унизу.
if (window.visualViewport) {
  const placeTabs = () => {
    const vv = window.visualViewport;
    const gap = Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--vv-gap', `${gap > 0 && gap < 120 ? gap : 0}px`);
  };
  window.visualViewport.addEventListener('resize', placeTabs);
  window.visualViewport.addEventListener('scroll', placeTabs);
  placeTabs();
}
window.addEventListener('sync-applied', refresh);
// Марнотрат пише в цю ж базу (той самий сайт) — покупки патронів, тюнінг, екіпірування: показати й синхронізувати
if ('BroadcastChannel' in window) {
  new BroadcastChannel('shooting-log').addEventListener('message', async (e) => {
    if (e.data?.type !== 'external-change') return;
    await refresh();
    window.dispatchEvent(new Event('db-change'));
  });
}
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (err?.name === 'AbortError') return;
  console.error(err);
  toast(err?.name === 'QuotaExceededError'
    ? t('Не збереглося: на пристрої скінчилося місце')
    : t('Помилка: {msg}', { msg: err?.message || String(err) }), { timeout: 9000 });
});
window.addEventListener('db-blocked', () => toast(t('Закрийте інші вкладки застосунку — база оновлюється')));
registerWorker();
navigator.storage?.persist?.().catch(() => {});
// Свято й печиво відомі ще до даних (дата, бачені, кидок) — тло сценки одразу; день народження ствола — після даних
const sceneRoll = Math.random() < 1 / 6;
if (new URLSearchParams(location.search).get('scene') || (scenesOn() && sceneDue(M.today(), sceneRoll))) coverForScene();
try {
  state = await db.loadAll();
  setCaliberHues(state.calibers, state.cartridges);
  await migrateModules();
} catch (err) {
  // Приватний режим, скінчилось місце, збій браузера: без цього лишався б порожній екран без жодного слова
  window.removeEventListener('hashchange', route);
  uncover();
  $('fab').hidden = true;
  $('view').replaceChildren(h('div', { class: 'empty' },
    h('h3', {}, t('Не вдалося відкрити дані на пристрої')),
    h('p', { class: 'muted' }, err?.message || String(err)),
    btn(t('Спробувати ще раз'), () => location.reload(), 'primary')));
  throw err;
}
// Нова установка: «Що нового» ще не бачили й записів немає — showNews позначить версію баченою, тож питаємо до нього
const firstRun = !recall(SEEN_KEY) && !recall(WELCOMED) && !db.DATA_STORES.some((s) => state[s]?.length);
route();
holidayScene();
showNews();
if (firstRun) welcome();
// Після «Що нового»: шторка з ярлика має бути зверху
runShortcut();
// нагадування по черзі — наступне після показаного, щоб не перекрило; поки відкрита шторка («Що нового», ярлик) — чекають
(function remind(list) {
  if (!list.length) return;
  if ($('layer').children.length) { setTimeout(() => remind(list), 1000); return; }
  const [first, ...rest] = list;
  if (first()) setTimeout(() => remind(rest), 8500); else remind(rest);
})([cleaningReminder, permitsReminder, backupReminder]);
sync.onStatus(renderSyncChip);
sync.preload();
sync.syncNow();
if (usdOn()) pullRates();
