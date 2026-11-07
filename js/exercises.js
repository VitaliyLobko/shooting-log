// Стрілецькі вправи: правила (за відео RIFLEMAN і Стрілецької ліги) і підрахунок очок.
// Тексти правил прямо тут — це довідка, а не рядки інтерфейсу.
import { t } from './i18n.js';
import { h, form, sheet, chips, confirmSheet, fmt, toolBtn, fieldError, formError, starIcon } from './ui.js';
import * as M from './model.js';
import { lineChart } from './chart.js';

const L = (o) => (typeof o === 'string' ? o : o.uk);
const btn = (label, onclick, kind = '') => h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);

/**
 * zones — зони мішені й очки за влучання; miss рахується сам (постріли мінус влучання).
 * late — штраф турніру Купера: за кожен постріл поза часом знімається одне найкраще влучання.
 * time — сумарний час; perHit — очки за влучання вводяться вручну (таблиця Уайта залежить від часу).
 * ranks — [мінімум очок, назва], від вищого.
 */
/** Назва вправи поточною мовою — журналу, щоб підписати стрільбу з тренування. */
export const exerciseName = (id) => {
  const ex = exById(id);
  return ex ? L(ex.name) : null;
};

export const EXERCISES = [
  {
    id: 'baza20',
    name: 'База-20',
    sub: 'Кваліфікаційна · 20 пострілів · 50–150 м',
    rules: {
      uk: [
        'Мішень: одна грудна (IDPA/IPSC) на стрільця.',
        'Маршрут: 50 → 75 → 100 → 125 → 150 м і назад, 4 проходи, по 1 пострілу з позиції.',
        'Час: 15 с на постріл разом із заряджанням, старт з розрядженою зброєю.',
        'Зброя на старті:',
        '- 50 м — на слабкому плечі стволом униз',
        '- 75 м — на сильному плечі стволом угору, рука тримає ремінь',
        '- 100 і 125 м — приклад у плечі, ствол униз 45°',
        'Положення:',
        '- 125 м — з коліна (остання дистанція для дробовиків)',
        '- 150 м — з коліна, лише нарізна',
        'Заборонено: сошки, мішки й упори.',
      ],
    },
    scoring: {
      uk: [
        'Alpha: коло 20 см.',
        'Максимум: 100 очок.',
        'Звання: Basic → Shooter → Sharpshooter → Marksman → Scout → Expert → Pro — присвоює організатор, пороги в очках не опубліковані; свої можна задати в налаштуваннях вправи (✎).',
        'Звання підтверджується другим матчем.',
      ],
    },
    shots: 20,
    zones: [['A', 'Alpha', 5], ['C', 'Charlie', 4], ['D', 'Delta', 1]],
    ranksNote: false,
  },
  {
    id: 'white5',
    name: 'П’ятірка Уайта',
    sub: '5 пострілів навскидку · 91 м · на час',
    rules: {
      uk: [
        'Дистанція: 91 м (100 ярдів), грудна мішень.',
        'Старт: набій у патроннику, запобіжник знято, приклад біля пояса, ствол на мішень.',
        'Хід: за сигналом — один постріл, і так 5 разів.',
        'Час: фіксується в кожного пострілу, у залік іде сума.',
      ],
    },
    scoring: {
      uk: [
        'Зони: Alpha — коло 20 см, Bravo — решта мішені.',
        'Ціна влучання: залежить від сумарного часу (таблиця Уїлена, 1923).',
        'Відома точка: 9,87 с → A = 15, B = 10.',
      ],
    },
    shots: 5,
    zones: [['A', 'Alpha', 15], ['B', 'Bravo', 10]],
    time: true,
    perHit: true,
    whelan: true,
    ranks: [[75, 'Distinguished'], [65, 'Expert'], [55, 'Sharpshooter'], [40, 'Marksman']],
  },
  {
    id: 'scout10',
    name: 'Scout-10',
    sub: 'Самопідготовка · 10 холодних пострілів · аркуш A4/A5',
    variants: [
      ['a4-100', 'A4 · стоячи · 100 м'],
      ['a5-100', 'A5 · стоячи · 100 м'],
      ['a5-200', 'A5 · коліно · 200 м'],
    ],
    rules: {
      uk: [
        'Мішень:',
        '- A4 (20×30 см) — для новачків, механіки й коліматора',
        '- A5 (15×20 см) — для досвідчених',
        'Положення:',
        '- A4 і A5 — стоячи зі 100 м',
        '- складніший рівень — A5 з коліна з ременем з 200 м',
        'Без упорів.',
        'Хід: один постріл → дійти до мішені → підписати пробоїну номером → повернутися.',
        'Тривалість: 10 пострілів ≈ 30 хв і 2 км.',
        'За номерами видно, як лягали постріли: дихання, спуск, стійка.',
      ],
    },
    scoring: {
      uk: [
        'Рахуються влучання в аркуш.',
        'Менше 8 з 10: розібрати помилки.',
        '8 з 10 стабільно на A4: переходити на A5.',
        '10 з 10 на A5: норма для досвідченого.',
        'Бонус-виклик: усі влучання в коло 10 см (стандарт Стюарта Уайта).',
      ],
    },
    shots: 10,
    zones: [['hit', 'Влучання', 1]],
    ranks: [[10, '10 / 10'], [8, 'норма'], [0, 'розібрати помилки']],
  },
  {
    id: 'cooper',
    name: 'Турнір Купера',
    sub: '20 пострілів · 50–300 м · 30 с на позицію',
    rules: {
      uk: [
        'Маршрут: як у База-20, але дистанції ростуть від 50 до ~300 м.',
        'Позиції: 2–3 постріли з кожної, наприклад «2S75» — 2 постріли стоячи з 75 м.',
        'Час: 30 с на позицію разом із прийняттям положення.',
        'Старт: з розрядженою зброєю, дозарядка лише з патронташа чи підсумка.',
        'Положення:',
        '- до 155 м — стоячи з рук',
        '- далі — з коліна',
        '- ~200 і 300 м — лежачи без упорів',
        'Ремінь дозволено.',
        'Мішень: A3 з чорною картонкою за головою — для поправок.',
        'Сквад: 6 людей, 60 хвилин.',
      ],
    },
    scoring: {
      uk: [
        'Зони: як у База-20.',
        'Максимум: 100 очок.',
        'Прострочка: за кожен постріл після 30 с знімається одне найкраще влучання.',
        'Звання: за сумою, приклад з відео — 80 = Scout; решта порогів не опублікована — свої можна задати в налаштуваннях вправи (✎).',
      ],
    },
    shots: 20,
    zones: [['A', 'Alpha', 5], ['C', 'Charlie', 4], ['D', 'Delta', 1]],
    late: true,
    ranksNote: false,
  },
  {
    id: 'marathon',
    name: 'Скаутський марафон / Стежка скаута',
    sub: '20 влучань у свою мішень на маршруті',
    rules: {
      uk: [
        'Марафон: логіка База-20, але дистанції до 300 м і «дикі», заздалегідь невідомі локації.',
        'Стежка скаута (Hit&Run): маршрут ~500 м з інструктором, ~10 позицій по 2 постріли — до фінішу 20 влучань.',
        'Буває етап з дробовиком і картеччю («скаутська спарка»).',
      ],
    },
    scoring: {
      uk: [
        'Зони: грудної мішені, як у База-20.',
      ],
    },
    shots: 20,
    zones: [['A', 'Alpha', 5], ['C', 'Charlie', 4], ['D', 'Delta', 1]],
  },
  {
    id: 'nordic10',
    name: 'Nordic-10',
    sub: 'Третій етап триборства · до 6 пострілів · на час',
    rules: {
      uk: [
        'За мотивами скандинавського felthurtigskyting.',
        'Офіційні правила Nordic-10 у відкритих джерелах не знайдені.',
        'Оригінал:',
        '- 3 мішені на невідомих дистанціях: дві до 150 м, третя до 225–275 м',
        '- не більше 6 набоїв',
        '- старт стоячи, зброя заряджена й на запобіжнику',
        '- спершу ближні мішені',
        'Результат: час.',
      ],
    },
    scoring: {
      uk: [
        'Рахуються влучання й час проходження.',
        'Умови: три мішені, не більше 6 набоїв.',
        'Що менший час за тих самих влучань, то краще.',
      ],
    },
    shots: 6,
    zones: [['hit', 'Влучання', 1]],
    time: true,
    // за тих самих влучань кращий — швидший
    timeTie: true,
  },
];

/** Рядок із **жирним** і *курсивом* → вузли; HTML у тексті лишається текстом. */
function inline(text) {
  const out = []; const re = /\*\*(.+?)\*\*|\*(.+?)\*/g; let at = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(m[1] !== undefined ? h('b', {}, m[1]) : h('i', {}, m[2]));
    at = re.lastIndex;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * Рядки правил → пункти: «Заголовок: текст» виділяє заголовок, рядок з «- » — підпункт попереднього,
 * «# » — заголовок розділу без номера; усередині — **жирний** і *курсив*.
 * Та сама розмітка працює і у своїх вправах — правила там пишуть у полі, по рядку на пункт.
 */
function textItems(lines) {
  const out = [];
  for (const raw of lines ?? []) {
    const line = String(raw).trim();
    if (!line) continue;
    const head = /^#+\s+/.exec(line);
    if (head) { out.push({ head: line.slice(head[0].length) }); continue; }
    const dash = /^[-–•]\s+/.exec(line);
    if (dash && out.length) { (out.at(-1).sub ??= []).push(line.slice(dash[0].length)); continue; }
    // Короткий заголовок без ком — щоб звичайне речення з двокрапкою не стало заголовком.
    const lead = /^([^:,*]{1,30}):\s*(.*)$/.exec(line);
    out.push(lead ? { lead: lead[1], text: lead[2] } : { text: dash ? line.slice(dash[0].length) : line });
  }
  const sub = (it) => (it.sub ? h('ul', { class: 'ex-sub' }, it.sub.map((x) => h('li', {}, inline(x)))) : null);
  return out.map((it) => (it.head ? h('li', { class: 'ex-head' }, h('span', {}, inline(it.head)), sub(it)) : h('li', {},
    it.lead ? h('b', {}, `${it.lead}:`) : null,
    it.text ? [it.lead ? ' ' : '', ...inline(it.text)] : null,
    sub(it))));
}

/**
 * Кнопки над полем правил: жирний, курсив, підпункт, заголовок — ставлять розмітку навколо виділення
 * чи на початок рядків; «Перегляд» показує, як правила виглядатимуть у картці.
 */
function rulesToolbar(area) {
  const changed = () => area.dispatchEvent(new Event('input', { bubbles: true }));
  const wrap = (mark) => {
    const [a, b] = [area.selectionStart, area.selectionEnd];
    const sel = area.value.slice(a, b) || t('текст');
    area.focus();
    area.setRangeText(`${mark}${sel}${mark}`, a, b);
    area.setSelectionRange(a + mark.length, a + mark.length + sel.length);
    changed();
  };
  // Префікс на всіх рядках виділення; уже стоїть на всіх — знімаємо (інший префікс замінюємо)
  const prefix = (p) => {
    const v = area.value; const a = area.selectionStart; const b = area.selectionEnd;
    const start = v.lastIndexOf('\n', a - 1) + 1; const end = v.indexOf('\n', b) < 0 ? v.length : v.indexOf('\n', b);
    const lines = v.slice(start, end).split('\n');
    const strip = (l) => l.replace(/^(#+|[-–•])\s+/, '');
    const all = lines.every((l) => l.startsWith(p));
    const next = lines.map((l) => (all ? l.slice(p.length) : p + strip(l))).join('\n');
    area.focus();
    area.setRangeText(next, start, end);
    area.setSelectionRange(start, start + next.length);
    changed();
  };
  const preview = h('ul', { class: 'ex-rules rules-preview', hidden: true });
  const paint = () => { if (!preview.hidden) preview.replaceChildren(...textItems(area.value.split('\n'))); };
  area.addEventListener('input', paint);
  const tool = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `rules-tool ${cls}`, title, 'aria-label': title,
    onmousedown: (e) => e.preventDefault(), onclick }, label);
  const look = tool(t('Перегляд'), t('Як буде в картці'), () => {
    preview.hidden = !preview.hidden;
    look.setAttribute('aria-pressed', String(!preview.hidden));
    paint();
  }, 'rules-look');
  look.setAttribute('aria-pressed', 'false');
  const bar = h('div', { class: 'rules-bar', role: 'toolbar', 'aria-label': t('Оформлення') },
    tool(h('b', {}, t('Ж')), t('Жирний'), () => wrap('**')),
    tool(h('i', {}, t('К')), t('Курсив'), () => wrap('*')),
    tool('•', t('Підпункт'), () => prefix('- ')),
    tool('#', t('Заголовок без номера'), () => prefix('# ')),
    look);
  area.before(bar);
  area.after(preview);
}

/** Підрахунок: таблиця зон з очками (зі самої вправи — є й у своїх) і пояснення пунктами. */
function scoringContent(ex) {
  // Одна зона по очку — таблиця нічого не додає; у П'ятірці Уайта ціна залежить від часу — пояснено текстом.
  const zones = ex.zones?.length > 1 && !ex.perHit
    ? h('dl', { class: 'kv ex-zones' }, ex.zones.map(([, label, pts]) => [h('dt', {}, L(label)), h('dd', {}, fmt.num(pts))]))
    : null;
  const notes = ex.scoring ? textItems(L(ex.scoring)) : [];
  // Звання — з налаштувань вправи, тож таблиця завжди та, за якою рахує застосунок.
  const list = [...(ranksOf(ex) ?? [])].sort((a, b) => b[0] - a[0]);
  const ranks = list.length
    ? h('div', {}, h('div', { class: 'ex-scoring-title' }, t('Звання')),
      h('dl', { class: 'kv ex-zones' }, list.map(([min, name]) => [h('dt', {}, L(name)), h('dd', {}, t('від {n}', { n: fmt.num(min) }))])))
    : ex.ranksNote === false ? null
      : h('p', { class: 'muted small ex-scoring-note' }, t('Пороги звань не задані — вкажіть їх у налаштуваннях вправи (✎).'));
  return h('div', { class: 'ex-scoring' }, zones, notes.length ? h('ul', { class: 'ex-points' }, notes) : null, ranks);
}

/** Пороги звань: свої (localStorage) або зашиті у вправі. */
const RANKS_KEY = 'shooters-log:ex-ranks';
// ponytail: свої пороги лежать у localStorage — на кожному пристрої окремі й на Диск не їдуть.
// Перенести у власний стор, коли знадобиться бачити їх і на телефоні, і на комп'ютері.
function allRanks() {
  try { return JSON.parse(localStorage.getItem(RANKS_KEY) || '{}') || {}; } catch { return {}; }
}
function saveRanks(id, list) {
  const all = allRanks();
  if (list?.length) all[id] = list; else delete all[id];
  try { localStorage.setItem(RANKS_KEY, JSON.stringify(all)); } catch { /* приватний режим */ }
}
// Пороги з налаштувань вправи (їдуть на Диск); колишні пороги «на цьому пристрої» — поки вправу не збережуть.
export const ranksOf = (ex) => (ex.ownRanks ? ex.ranks : allRanks()[ex.id] ?? ex.ranks);

/** Скільки найкращих влучань знімає прострочка (турнір Купера). */
export const lateCut = (ex, r) => (ex.late ? Math.min(Math.max(0, Math.round(r.late ?? 0)), hitsOf(r)) : 0);
export const hitsOf = (r) => Object.values(r.hits ?? {}).reduce((s, n) => s + (n || 0), 0);

/** Очки результату: влучання × ціна зони, мінус найкращі влучання за постріли поза часом. */
export function scoreOf(ex, r) {
  const values = [];
  for (const [k, , pts] of ex.zones ?? []) {
    const price = ex.perHit ? Number(r.pts?.[k] ?? pts) : pts;
    for (let i = 0; i < (r.hits?.[k] ?? 0); i++) values.push(price);
  }
  values.sort((a, b) => b - a);
  return values.slice(lateCut(ex, r)).reduce((s, v) => s + v, 0);
}

export const rankOf = (ex, score) => ranksOf(ex)?.find(([min]) => score >= min)?.[1];

/** Найкращий результат: більше очок, а за рівних у вправах на час (timeTie) — швидший. */
const bestOf = (ex, list) => list.reduce((b, s) => (!b || s.score > b.score
  || (ex.timeTie && s.score === b.score && (s.time || Infinity) < (b.time || Infinity)) ? s : b), null);

// Свої вправи з бази: тримаємо тут, щоб exById і назва в журналі бачили їх як вбудовані.
let CUSTOM = [];

/**
 * Правка вбудованої вправи, збережена іншою мовою: рядки, що збігаються з текстом вбудованої
 * (назва, правила, зони, варіанти, звання), — поточною мовою; дописане самим стрільцем лишається як є.
 */
function fromBase(rec) {
  const base = EXERCISES.find((e) => e.id === rec.id);
  if (!base) return rec;
  const map = new Map();
  const add = (o) => {
    if (!o || typeof o === 'string') return;
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach((line, i) => map.set(line.trim(), L(o)[i]));
      else map.set(v.trim(), L(o));
    }
  };
  add(base.name);
  add(base.rules);
  (base.zones ?? []).forEach(([, label]) => add(label));
  (base.variants ?? []).forEach(([, label]) => add(label));
  (base.ranks ?? []).forEach(([, name]) => add(name));
  const tr = (s) => (typeof s === 'string' ? map.get(s.trim()) ?? s : s);
  return {
    ...rec,
    name: tr(rec.name),
    rules: String(rec.rules ?? '').split('\n').map(tr).join('\n'),
    zones: rec.zones?.map((z) => ({ ...z, label: tr(z.label) })),
    variants: rec.variants?.map((x) => ({ ...x, label: tr(x.label) })),
    ranks: rec.ranks?.map(([min, name]) => [min, tr(name)]),
  };
}

/** Запис своєї вправи → той самий вигляд, що й у вбудованих (зони, правила, підпис). */
export function asExercise(raw) {
  const rec = fromBase(raw);
  const lines = String(rec.rules ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
  // Правка вбудованої вправи — запис із тим самим id: особливі механіки (прострочка Купера,
  // ціна влучання за часом) лишаються від неї, решту беремо з правки.
  const base = EXERCISES.find((e) => e.id === rec.id);
  return {
    ...(base ?? {}),
    id: rec.id,
    custom: true,
    builtIn: !!base,
    hidden: !!rec.hidden,
    name: rec.name,
    sub: [rec.shots ? t('{n} постр.', { n: rec.shots }) : null,
      rec.distance ? t('{n} м', { n: rec.distance }) : null].filter(Boolean).join(' · '),
    shots: Number(rec.shots) || 0,
    distance: Number(rec.distance) || null,
    time: !!rec.time,
    zones: (rec.zones ?? []).map((z, i) => [z.key ?? `z${i + 1}`, z.label, Number(z.pts) || 0]),
    rules: { uk: lines },
    // Порожній список у записі — свідомо без звань; поля немає (старий запис) — звання вбудованої.
    ranks: rec.ranks ?? base?.ranks,
    ownRanks: Array.isArray(rec.ranks),
    // Варіанти — так само: порожній список — без вибору, поля немає — як у вбудованої.
    variants: Array.isArray(rec.variants)
      ? (rec.variants.length ? rec.variants.map((x) => [x.key, x.label]) : null)
      : base?.variants,
  };
}

/** Усі вправи: вбудовані плюс свої; сховані — з hidden (їхні результати й назви в журналі лишаються). */
export const exerciseList = () => {
  const mine = CUSTOM.filter((r) => !r.hideOnly).map(asExercise);
  const edited = new Set(mine.map((e) => e.id));
  // Сховану вбудовану без правок тримає лише позначка — сама вправа як у коді.
  const hideOnly = new Set(CUSTOM.filter((r) => r.hideOnly).map((r) => r.id));
  // Відредагована вбудована лишається на своєму місці, нові свої — у кінці.
  const order = (e) => { const i = EXERCISES.findIndex((x) => x.id === e.id); return i < 0 ? EXERCISES.length : i; };
  return [...EXERCISES.filter((e) => !edited.has(e.id)).map((e) => (hideOnly.has(e.id) ? { ...e, hidden: true } : e)), ...mine]
    .sort((x, y) => order(x) - order(y));
};
export const exById = (id) => exerciseList().find((e) => e.id === id);

/**
 * Таблиця Уїлена (1923) у відкритих джерелах не знайдена — відома одна точка: 9,87 с → A 15, B 10.
 * Тому ціну влучання лише оцінюємо: швидше за точку — дорожче, повільніше — дешевше, пропорційно часу.
 * Значення підставляється в поля, які завжди можна виправити руками.
 */
const WHELAN_T = 9.87;
// Швидше за 5 с п'ять пострілів навскидку на 91 м не роблять — ціну рахуємо як за 5 с (не більше ×2 від відомої точки)
export const WHELAN_MIN = 5;
export const whelanPoints = (time, base) => (time > 0 ? Math.max(0, Math.round((base * WHELAN_T) / Math.max(WHELAN_MIN, time))) : base);

// Відмітки пострілів — від сигналу, тож час серії — останній постріл, а не їхня сума
const sumTime = (drill) => Math.max(0, ...(drill.shots ?? []));
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Розділ «Вправи» в «Полігоні». scores — збережені результати; box/stat — примітиви app.js;
 * cartridges — [id, назва, залишок] для списання з БК; drills — серії таймера (час для вправ на час);
 * onSave(record, consume) зберігає (consume = {cartridgeId, qty, collect} або null; collect — зібрані гільзи з collectField), onDelete(record) видаляє,
 * targetsOf(record) віддає блок мішеней результату (або null).
 */
/** Контекст вправ із того, що дає застосунок; свої вправи — одразу в довідник назв. */
function makeCtx({ scores, weapons, cartridges = [], drills = [], box, stat, onSave, onDelete, targetsOf, lastAmmo = null, mismatch = null, openTimer = null, pickAmmo = null, pickWeapon = null, weaponName = () => null, weaponExtras = null, extrasRows = () => [], whenFields = null, whereWhen = null, whereWhenView = () => null, pickList = null, collectField = null, custom = [], onSaveExercise = null, onDeleteExercise = null, onHideExercise = null, deleteNote = null }) {
  CUSTOM = custom;
  return { scores, weapons, cartridges, drills, box, stat, onSave, onDelete, targetsOf, lastAmmo, mismatch, openTimer, pickAmmo, pickWeapon, weaponName, weaponExtras, extrasRows, whenFields, whereWhen, whereWhenView, pickList, collectField, custom, onSaveExercise, onDeleteExercise, onHideExercise, deleteNote };
}

export function exercisesPanel(args) {
  const ctx = makeCtx(args);
  CTX = ctx;
  // Плиткою: шість вправ видно одним екраном, рекорд одразу під назвою, решта — у картці вправи.
  return h('div', { class: 'ex-grid' }, exerciseList().filter((ex) => !ex.hidden).map((ex) => exerciseTile(ex, ctx)));
}

/** Картка результату з іншого місця (картка стрільби): той самий контекст, що й у панелі вправ. */
export function openScore(s, args) {
  const ctx = makeCtx(args);
  const ex = exById(s.exercise);
  if (ex) scoreCard(ex, s, ctx);
}

// Контекст останньої відмальованої панелі — для кнопки «+» внизу екрана, яка живе поза панеллю.
let CTX = null;

/** Своя вправа з кнопки «+». */
export function newExercise() {
  if (CTX?.onSaveExercise) exerciseForm(null, CTX);
}

function myScores(ex, ctx) {
  return ctx.scores.filter((s) => s.exercise === ex.id).sort(M.byDateDesc);
}

/** Плитка вправи: рекорд у кільці до наступного звання, під ним звання, назва й спроби. */
function exerciseTile(ex, ctx) {
  const mine = myScores(ex, ctx);
  const top = bestOf(ex, mine);
  const best = top ? top.score : null;
  const step = best === null ? null : rankStep(ex, best);
  // Без результату — пунктирне кільце й заклик спробувати; нижче першого звання — скільки до нього;
  // у вправи без звань — просто «рекорд», щоб плитки стояли рівно.
  const status = best === null
    ? h('span', { class: 'ex-tile-try' }, `＋ ${t('Спробувати')}`)
    : step.cur ? h('span', { class: 'ex-tile-rank' }, L(step.cur[1]))
      : step.next ? h('span', { class: 'ex-tile-foot' }, t('ще {n} до «{rank}»', { n: fmt.num(step.next[0] - best), rank: L(step.next[1]) }))
        : h('span', { class: 'ex-tile-foot' }, t('рекорд'));
  return h('button', { type: 'button', class: `ex-tile ${best === null ? 'empty' : ''}`, 'data-id': ex.id, onclick: () => exerciseSheet(ex, ctx) },
    progressRing(step?.list.length ? step.progress : 0, best === null ? '—' : fmt.num(best), 'ex-tile-ring'),
    // рекорд на час — і час під кільцем: інакше два результати по 6 влучань не розрізнити
    ex.timeTie && top?.time ? h('span', { class: 'ex-tile-foot' }, `${fmt.num(top.time)} ${t('с')}`) : null,
    status,
    h('span', { class: 'ex-tile-name' }, L(ex.name)),
    h('span', { class: 'ex-tile-foot' }, [ex.shots ? t('{n} постр.', { n: ex.shots }) : L(ex.sub),
      mine.length ? t('спроб: {n}', { n: mine.length }) : null].filter(Boolean).join(' · ')));
}

/** Картка вправи: рекорд у кільці звання, кнопка, динаміка й результати; правила й підрахунок — згортним блоком під підзаголовком. */
function exerciseSheet(ex, ctx) {
  const body = () => {
    const mine = myScores(ex, ctx);
    const top = bestOf(ex, mine);
    const series = M.scoreSeries(ctx.scores, ex.id);
    return h('div', {},
      h('p', { class: 'muted' }, L(ex.sub)),
      infoPanel(ex, ctx),
      mine.length ? recordHero(ex, top, mine) : null,
      ex.zones ? h('div', { class: 'btn-row' },
        btn(t('Записати результат'), () => { close(); scoreSheet(ex, ctx); }, 'primary')) : null,
      series.length > 1 ? ctx.box(t('Динаміка'), lineChart(series.map((x) => ({ label: fmt.date(x.date), value: x.value })), {
        format: (v) => fmt.num(v),
        minStep: 1,
        // Пороги звань — лініями: видно, скільки до наступного.
        refs: (ranksOf(ex) ?? []).map(([min, name]) => [min, L(name)]),
      })) : null,
      mine.length ? ctx.box(t('Результати'), h('div', { class: 'rows' }, mine.map((x) => scoreRow(ex, x, top, ctx))),
        { fold: 'ex-results', count: mine.length }) : null);
  };
  // Правка й видалення (для вбудованої — «повернути як було») — іконками в шапці, як у картках зброї й набою.
  // Видаляються всі однаково; вбудована живе в коді, тож її ховаємо — повернути можна в Налаштуваннях.
  const own = ctx.custom.find((r) => r.id === ex.id);
  const builtIn = EXERCISES.some((e) => e.id === ex.id);
  const tools = [...(ctx.onSaveExercise ? [
    toolBtn('edit', t('Змінити'), () => { close(); exerciseForm(own ? fromBase(own) : asRecord(ex), ctx); }),
    own && builtIn ? toolBtn('reset', t('Повернути вбудовану'), () => ctx.onDeleteExercise?.(own, () => close())) : null,
    builtIn
      ? toolBtn('delete', t('Видалити'), () => ctx.onHideExercise?.(ex, () => close()), 'danger')
      : own ? toolBtn('delete', t('Видалити'), () => ctx.onDeleteExercise?.(own, () => close()), 'danger') : null,
  ].filter(Boolean) : [])];
  const close = sheet(L(ex.name), body(), { live: body, tools });
}

/** Правила й підрахунок очок — згортним блоком під підзаголовком: видно одразу, а читають раз, тож згорнуто, стан пам'ятає. */
function infoPanel(ex, ctx) {
  const rules = L(ex.rules)?.length
    ? h('div', {}, h('div', { class: 'ex-scoring-title' }, t('Правила')), h('ul', { class: 'ex-rules' }, textItems(L(ex.rules))))
    : null;
  return ctx.box(t('Правила й підрахунок очок'), h('div', { class: 'ex-info' }, rules,
    h('div', {}, h('div', { class: 'ex-scoring-title' }, t('Підрахунок очок')), scoringContent(ex))), { fold: 'ex-rules' });
}

/** Звання за результатом: поточне, наступне й пройдена частка шляху до нього (0..1). */
function rankStep(ex, best) {
  const list = [...(ranksOf(ex) ?? [])].sort((a, b) => a[0] - b[0]);
  const cur = [...list].reverse().find(([min]) => best >= min);
  const next = list.find(([min]) => min > best);
  const from = cur?.[0] ?? 0;
  const progress = next ? Math.max(0, Math.min(1, (best - from) / (next[0] - from))) : 1;
  return { list, cur, next, progress };
}

/** Рекорд крупно, звання й скільки до наступного, праворуч кільце прогресу; під ним середнє, останній і спроби. */
function recordHero(ex, top, mine) {
  const best = top.score;
  const { list, cur, next, progress } = rankStep(ex, best);
  const avgOf = Math.min(3, mine.length);
  const avg = Math.round(mine.slice(0, avgOf).reduce((s, x) => s + x.score, 0) / avgOf);
  return h('div', {},
    h('section', { class: 'ex-rec' },
      h('div', {},
        h('div', { class: 'hero-label' }, t('рекорд')),
        h('div', { class: 'ex-rec-value' }, fmt.num(best), ex.timeTie && top.time ? h('small', {}, ` · ${fmt.num(top.time)} ${t('с')}`) : null),
        list.length ? h('div', { class: 'muted small' }, cur ? [h('b', { class: 'rank-name' }, L(cur[1])), ' · '] : null,
          next ? t('ще {n} до «{rank}»', { n: fmt.num(next[0] - best), rank: L(next[1]) }) : t('найвище звання')) : null),
      list.length ? progressRing(progress, cur ? L(cur[1]) : '—') : null),
    h('div', { class: 'ex-mini' },
      h('span', {}, t('середнє з {n}', { n: avgOf }), ' ', h('b', {}, fmt.num(avg))),
      h('span', {}, t('останній'), ' ', h('b', {}, fmt.num(mine[0].score))),
      h('span', {}, t('спроб'), ' ', h('b', {}, fmt.num(mine.length)))));
}

/** Кільце прогресу до наступного звання (progress — 0..1), усередині — підпис (звання чи рекорд). */
function progressRing(progress, name, cls = 'ex-ring') {
  const r = 36;
  const c = 2 * Math.PI * r;
  const el = h('span', { class: `rank-ring ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg class="rank-ring-track" viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" class="rank-ring-bg"/>`
    // нульова дуга з круглими кінцями малює крапку — тоді дуги немає зовсім
    + (progress > 0 ? `<circle cx="42" cy="42" r="${r}" class="rank-ring-fill" stroke-dasharray="${(c * progress).toFixed(1)} ${c.toFixed(1)}"/>` : '')
    + '</svg>';
  el.append(h('span', { class: 'ex-ring-name' }, name));
  return el;
}

/** Вбудована вправа у вигляді запису — щоб відкрити її в тій самій формі правки. */
function asRecord(ex) {
  return {
    id: ex.id,
    name: L(ex.name),
    shots: ex.shots ?? '',
    distance: ex.distance ?? '',
    time: !!ex.time,
    zones: (ex.zones ?? []).map(([key, label, pts]) => ({ key, label: L(label), pts })),
    rules: (L(ex.rules) ?? []).join(String.fromCharCode(10)),
    variants: (ex.variants ?? []).map(([key, label]) => ({ key, label: L(label) })),
  };
}

/**
 * Рядки поля «Варіанти» → [{key, label}]. Ключ лишаємо старий — за назвою, а перейменований
 * на тому ж місці — за позицією: інакше вже записані результати втратять свій варіант.
 */
function variantList(text, old = []) {
  const labels = [...new Set(String(text ?? '').split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean))];
  return labels.map((label, i) => {
    const same = old.find((x) => x.label === label);
    if (same) return { key: same.key, label };
    const renamed = old[i] && !labels.includes(old[i].label) ? old[i] : null;
    return { key: renamed?.key ?? label, label };
  });
}

/** Своя вправа: назва, постріли, дистанція, зони з очками й довільні правила. */
function exerciseForm(rec, ctx) {
  const zones = rec?.zones?.length ? rec.zones : [{ label: t('Влучання'), pts: 1 }];
  const ZONES = 4;
  const fields = [
    { name: 'name', label: t('Назва'), value: rec?.name ?? '', required: true, wide: true },
    { name: 'shots', label: t('Пострілів'), type: 'number', min: 1, step: 1, value: rec?.shots ?? '', half: true },
    { name: 'distance', label: t('Дистанція, м'), type: 'number', min: 0, step: 'any', value: rec?.distance ?? '', half: true },
    // На всю ширину: третє поле «в половину» зсувало зони — назва зони й її очки опинялись у різних рядках.
    { name: 'time', label: t('Рахувати час'), type: 'chips', value: rec?.time ? '1' : '',
      options: [['', t('ні')], ['1', t('так')]] },
    { name: 'variants', label: t('Варіанти'), type: 'textarea', rows: 3, wide: true,
      value: (rec?.variants ?? []).map((x) => x.label).join(String.fromCharCode(10)),
      placeholder: t('A4 · стоячи · 100 м'),
      hint: t('Кожен рядок — варіант: мішень, положення, дистанція. Під час запису результату вибирається кнопкою.') },
  ];
  for (let i = 0; i < ZONES; i += 1) {
    fields.push(
      { name: `z${i}n`, label: i === 0 ? t('Зона') : '', value: zones[i]?.label ?? '', placeholder: t('Напр. Alpha'), half: true },
      { name: `z${i}p`, label: i === 0 ? t('Очок за влучання') : '', type: 'number', min: 0, step: 'any', value: zones[i]?.pts ?? '', half: true });
  }
  // Пороги звань — тут же, рядами «звання | від скількох очок», від вищого; свої або вбудовані, якщо своїх ще немає.
  const ranks = [...((Array.isArray(rec?.ranks) ? rec.ranks : rec?.id && ranksOf(exById(rec.id) ?? {})) || [])]
    .map(([min, name]) => [min, L(name)]).sort((a, b) => b[0] - a[0]);
  const RANKS = Math.min(8, Math.max(4, ranks.length + 1));
  for (let i = 0; i < RANKS; i += 1) {
    fields.push(
      { name: `r${i}n`, label: i === 0 ? t('Звання') : '', value: ranks[i]?.[1] ?? '', placeholder: 'Marksman', half: true },
      { name: `r${i}m`, label: i === 0 ? t('Від, очок') : '', type: 'number', min: 0, step: 1, value: ranks[i]?.[0] ?? '', half: true });
  }
  fields.push({ name: 'rules', label: t('Правила'), type: 'textarea', value: rec?.rules ?? '', wide: true, rows: 8,
    hint: t('Кожен рядок — пункт із номером. Кнопки вище: **жирний**, *курсив*, «- » — підпункт, «# » — заголовок без номера; «Слово: текст» виділить слово.') });
  const f = form(fields);
  rulesToolbar(f.inputs.rules);
  const save = () => {
    const v = f.values();
    if (!v.name) { fieldError(f.inputs.name, t('Заповніть поле «{label}»', { label: t('Назва') })); return; }
    const list = [];
    for (let i = 0; i < ZONES; i += 1) {
      const label = v[`z${i}n`];
      if (!label) continue;
      // Ключ зони лишаємо старий, інакше вже записані результати втратять свої влучання. Нова зона — ключ,
      // якого ще не було: «z3» після видаленої зони збігся б з наявною, а ключ видаленої забрав би її старі влучання.
      list.push({ key: rec?.zones?.[i]?.key ?? (rec ? `z-${Date.now().toString(36)}${i}` : `z${i + 1}`), label, pts: Number(v[`z${i}p`]) || 0 });
    }
    if (!list.length) { formError(t('Додайте хоча б одну зону')); return; }
    const rankList = [];
    for (let i = 0; i < RANKS; i += 1) {
      const name = v[`r${i}n`];
      if (name && Number.isFinite(v[`r${i}m`])) rankList.push([Math.round(v[`r${i}m`]), name]);
    }
    close();
    ctx.onSaveExercise?.({
      ...(rec ?? {}), name: v.name, shots: Math.max(0, Math.round(v.shots || 0)),
      distance: v.distance || null, time: v.time === '1', rules: v.rules, zones: list,
      ranks: rankList.sort((a, b) => b[0] - a[0]),
      variants: variantList(v.variants, rec?.variants),
    });
    // Пороги переїхали у вправу — старі «на цьому пристрої» більше не потрібні.
    if (rec?.id) saveRanks(rec.id, null);
  };
  const start = JSON.stringify(f.values());
  const close = sheet(rec ? L(rec.name) : t('Своя вправа'), f.el, {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), save, 'primary')],
    dirty: () => JSON.stringify(f.values()) !== start,
  });
}

function scoreRow(ex, s, top, ctx) {
  const best = top?.score;
  const rank = rankOf(ex, s.score);
  const variant = ex.variants?.find(([k]) => k === s.variant)?.[1];
  const sub = [variant && L(variant), s.weaponId ? ctx.weaponName(s.weaponId) : null,
    s.distance ? t('{n} м', { n: fmt.num(s.distance) }) : null,
    s.time ? `${fmt.num(s.time)} ${t('с')}` : null, s.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row', 'data-id': s.id, onclick: () => scoreCard(ex, s, ctx) },
    h('span', { class: 'row-main' },
      // Дата першою: результати шукають за днем стрільби.
      h('span', { class: 'row-title' }, `${fmt.date(s.date)} · ${hitsOf(s)}${ex.shots ? `/${ex.shots}` : ''} ${t('влуч.')}`, rank ? ` · ${L(rank)}` : '', s === top ? starIcon(t('Найкращий результат')) : null),
      h('span', { class: 'muted small' }, sub),
      best ? h('div', { class: 'bar' }, h('div', { class: `fill ${s === top ? '' : 'ap'}`, style: `width:${Math.max(4, (s.score / best) * 100)}%` })) : null),
    h('span', { class: 'tg-best' }, fmt.num(s.score)));
}

/** Картка результату: підсумок плитками, влучання по зонах, умови й мішені; правка й видалення іконками вгорі. */
function scoreCard(ex, s, ctx) {
  const rank = rankOf(ex, s.score);
  const cut = lateCut(ex, s);
  const hits = hitsOf(s);
  const isBest = bestOf(ex, myScores(ex, ctx))?.id === s.id;
  // Влучання по зонах: скільки, по скільки очок і разом; штраф прострочки — окремим рядком, щоб сума сходилась.
  const priced = (ex.zones ?? []).map(([k, label, pts]) => {
    const n = s.hits?.[k] ?? 0;
    const price = ex.perHit ? Number(s.pts?.[k] ?? pts) : pts;
    return { label: L(label), n, price, sum: n * price };
  });
  const raw = priced.reduce((sum, z) => sum + z.sum, 0);
  const row = (label, n, price, sum, cls = '') => h('div', { class: `ex-hit ${cls}` },
    h('span', {}, label), h('span', { class: 'ex-hit-n' }, n), h('span', { class: 'muted' }, price), h('span', { class: 'ex-hit-sum' }, sum));
  const hitsBox = ctx.box(t('Влучання'), h('div', { class: 'ex-hits' },
    priced.map((z) => row(z.label, fmt.num(z.n), `× ${fmt.num(z.price)}`, fmt.num(z.sum), z.n ? '' : 'zero')),
    ex.shots > hits ? row(t('Промахи'), fmt.num(ex.shots - hits), '', '', 'miss') : null,
    cut ? row(t('Прострочка'), t('−{n} найкращих', { n: cut }), '', `−${fmt.num(raw - s.score)}`, 'penalty') : null));
  const weapon = s.weaponId ? ctx.weaponName(s.weaponId) ?? '—' : null;
  const variant = s.variant ? L(ex.variants?.find(([k]) => k === s.variant)?.[1] ?? s.variant) : null;
  // Дата — у заголовку картки.
  const cond = [
    variant ? [t('Варіант'), variant] : null,
    weapon ? [t('Зброя'), weapon] : null,
    ...ctx.extrasRows(s),
    s.distance ? [t('Дистанція, м'), fmt.num(s.distance)] : null,
    s.note ? [t('Примітка'), s.note] : null,
  ].filter(Boolean);
  const body = h('div', {},
    h('div', { class: 'stats even' },
      ctx.stat([[t('очки'), rank && L(rank)].filter(Boolean).join(' · '), isBest ? starIcon(t('Найкращий результат')) : null],
        fmt.num(s.score), 'accent'),
      ctx.stat(t('влучань'), ex.shots ? `${fmt.num(hits)}/${fmt.num(ex.shots)}` : fmt.num(hits)),
      s.time ? ctx.stat(t('час, с'), fmt.num(s.time)) : null),
    hitsBox,
    cond.length ? ctx.box(t('Умови'), h('dl', { class: 'kv' }, cond.map(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))) : null,
    ctx.whereWhenView(s),
    ctx.targetsOf?.(s) ?? null);
  // Питання — поверх картки: «Скасувати» лишає на результаті
  const del = toolBtn('delete', t('Видалити'), () => {
    confirmSheet(t('Видалити результат?'), [`${L(ex.name)} · ${fmt.date(s.date)} · ${s.score}`, ctx.deleteNote?.(s)].filter(Boolean).join('. '),
      t('Видалити'), () => { close(); ctx.onDelete(s); });
  }, 'danger');
  const edit = toolBtn('edit', t('Змінити'), () => { close(); scoreSheet(ex, ctx, s); });
  const close = sheet(`${L(ex.name)} · ${fmt.date(s.date)}`, body, { tools: [edit, del] });
}

/** Кілька форм як одна: поля розкладено по блоках, а значення й поля збираються разом. */
function joinForms(forms) {
  return {
    inputs: Object.assign({}, ...forms.map((x) => x.inputs)),
    values: () => Object.assign({}, ...forms.map((x) => x.values())),
    onInput: (fn) => forms.forEach((x) => x.el.addEventListener('input', fn)),
  };
}

/** Шторка запису: умови, час, влучання з живим підсумком, списання з БК — кожне своїм блоком. */
function scoreSheet(ex, ctx, prev = null) {
  let variant = prev?.variant ?? ex.variants?.[0][0];
  const ammo = ctx.cartridges.map(([id, name, n]) => [id, t('{name} · зал. {n}', { name, n: fmt.num(n) })]);
  // Дистанція — у самому результаті: та сама вправа стріляється і з 50, і з 150 м.
  const lastDistance = ctx.scores.filter((s) => s.exercise === ex.id && s.distance).sort(M.byDateDesc)[0]?.distance;
  // Зброя результату в архіві — лишаємо її у виборі, інакше збереження мовчки зітре її з результату
  const keep = prev?.weaponId && !ctx.weapons.some(([id]) => id === prev.weaponId) && ctx.weaponName(prev.weaponId);
  const condF = form([
    { name: 'weaponId', label: t('Зброя'), type: 'select', value: prev?.weaponId ?? '', options: [['', '—'], ...ctx.weapons, ...(keep ? [[prev.weaponId, keep]] : [])], wide: true },
    { name: 'distance', label: t('Дистанція, м'), type: 'number', min: 0, step: 'any', half: true,
      value: prev?.distance ?? ex.distance ?? lastDistance ?? '' },
  ]);
  const timeF = ex.time
    ? form([{ name: 'time', label: t('Сума часу, с'), type: 'number', step: 0.01, min: 0, value: prev?.time ?? '', half: true }])
    : null;
  // Влучання й ціна зони — в одному ряду: у П'ятірці Уайта ціна своя на кожну спробу.
  const hitsF = form([
    ...ex.zones.flatMap(([k, label, pts]) => [
      { name: `hit_${k}`, label: ex.perHit ? `${L(label)}, ${t('влучань')}` : `${L(label)} × ${fmt.num(pts)}`,
        type: 'number', min: 0, value: prev?.hits?.[k] ?? '', half: true },
      ...(ex.perHit ? [{ name: `pts_${k}`, label: `${t('Очок за')} ${L(label)}`, type: 'number', value: prev?.pts?.[k] ?? pts, min: 0, half: true }] : []),
    ]),
    ...(ex.late ? [{ name: 'late', label: t('Пострілів після 30 с'), type: 'number', min: 0, value: prev?.late ?? 0, half: true }] : []),
  ]);
  // При правці БК не чіпаємо: набої вже списані рухом, і міняти його заднім числом — більше шкоди, ніж користі.
  const ammoF = prev ? null : form([
    { name: 'cartridgeId', label: t('Набій'), type: 'select', options: [['', t('не списувати')], ...ammo], half: true },
    { name: 'qty', label: t('Пострілів, шт'), type: 'number', min: 0, value: ex.shots ?? '', half: true },
  ]);
  const noteF = form([{ name: 'note', label: t('Примітка'), type: 'text', value: prev?.note ?? '', wide: true }]);
  // Дата, час дня (clock), погода й координати — окремим блоком, як у стрільбі й мішені
  const whenF = form(ctx.whenFields(prev));
  const f = joinForms([condF, whenF, timeF, hitsF, ammoF, noteF].filter(Boolean));
  const when = ctx.whereWhen(whenF, prev);
  ctx.pickWeapon?.(f.inputs.weaponId);
  // Приціл, глушник і сошки — одразу під зброєю, як у записі стрільби
  const extras = ctx.weaponExtras?.(f.inputs.weaponId, prev) ?? null;
  if (extras) f.inputs.weaponId.closest('.field').after(...extras.fields);
  if (f.inputs.cartridgeId) ctx.pickAmmo?.(f.inputs.cartridgeId);
  // Скільки гільз зібрав — повернуться на склад; не збирав — поле порожнє.
  const collect = ammoF && ctx.collectField
    ? ctx.collectField(() => f.inputs.cartridgeId.value)
    : null;
  if (collect) ammoF.el.append(collect.el);
  const summary = h('div', { class: 'stats even' });
  const hint = h('p', { class: 'muted small' });
  // Ціни збереженого результату, виправлені руками (не збігаються з оцінкою за його часом), правка не перезаписує
  let seriesPick = null;
  let pricedByHand = Boolean(prev?.pts) && ex.zones.some(([k, , pts]) => Number(prev.pts[k]) !== whelanPoints(prev.time, pts));
  if (timeF && ctx.openTimer) {
    // Вправу на час стріляють із таймером — запускаємо його звідси, час сам стане в поле.
    timeF.el.append(h('div', { class: 'field half ex-timer-btn' }, h('button', {
      type: 'button', class: 'btn',
      onclick: () => ctx.openTimer((seconds) => { f.inputs.time.value = round2(seconds); if (seriesPick) seriesPick.value = ''; update(); }),
    }, t('Запустити таймер')), h('small', { class: 'muted' }, t('Серія збережеться й у «Таймері».'))));
  }
  // Час зі збереженої серії таймера: у вправах на час його й так міряють таймером.
  const timed = ctx.drills.filter((d) => d.shots?.length);
  if (timeF && timed.length) {
    seriesPick = null;
    const pick = h('select', {
      'aria-label': t('Узяти час із серії'),
      onchange: () => {
        const d = timed.find((x) => x.id === pick.value);
        if (!d) return;
        f.inputs.time.value = round2(sumTime(d));
        update();
      },
    }, [h('option', { value: '' }, '—'),
      ...timed.map((d) => h('option', { value: d.id }, `${fmt.date(d.date)} · ${d.shots.length} ${t('постр.')} · ${fmt.num(round2(sumTime(d)))} ${t('с')}`))]);
    seriesPick = pick;
    timeF.el.append(h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, t('Узяти час із серії')), pick));
    ctx.pickList?.(pick, t('Узяти час із серії'));
  }
  const record = () => {
    const v = f.values();
    // ...prev — щоб правка зберегла id, зв'язок зі стрільбою й дату створення.
    const r = { ...(prev ?? {}), exercise: ex.id, date: v.date, clock: v.clock || null, weaponId: v.weaponId || null, distance: v.distance || null, note: v.note, ...(extras?.values() ?? {}), ...when.values(), hits: {} };
    for (const [k] of ex.zones) r.hits[k] = Math.max(0, Math.round(v[`hit_${k}`] || 0));
    if (ex.perHit) r.pts = Object.fromEntries(ex.zones.map(([k, , pts]) => [k, v[`pts_${k}`] ?? pts]));
    if (ex.time) r.time = v.time;
    if (ex.late) r.late = Math.max(0, Math.round(v.late || 0));
    if (variant) r.variant = variant;
    r.score = scoreOf(ex, r);
    return r;
  };
  const update = () => {
    collect?.update();
    // Ціна влучання залежить від часу — підставляємо оцінку, поки її не виправили руками.
    if (ex.perHit && ex.whelan && f.inputs.time && !pricedByHand) {
      const time = Number(String(f.inputs.time.value).replace(',', '.')) || 0;
      if (time > 0) for (const [k, , pts] of ex.zones) f.inputs[`pts_${k}`].value = whelanPoints(time, pts);
    }
    const r = record();
    const rank = rankOf(ex, r.score);
    const cut = lateCut(ex, r);
    const hits = hitsOf(r);
    // Підсумок плитками, як у картці результату: очки зі званням, влучання й промахи — не рахуючи в голові.
    summary.replaceChildren(
      ctx.stat([t('очки'), rank && L(rank)].filter(Boolean).join(' · '), fmt.num(r.score), 'accent'),
      ctx.stat(t('влучань'), ex.shots ? `${fmt.num(hits)}/${fmt.num(ex.shots)}` : fmt.num(hits)),
      ex.shots ? ctx.stat(t('промахів'), fmt.num(Math.max(0, ex.shots - hits))) : null);
    hint.textContent = [
      cut ? t('−{n} найкращих влучань', { n: cut }) : null,
      ctx.mismatch?.(f.inputs.cartridgeId?.value, f.inputs.weaponId.value),
      ex.shots && hits > ex.shots ? t('більше {n} пострілів', { n: ex.shots }) : null,
      ex.whelan ? t('Ціна влучання — оцінка за часом, її можна виправити.') : null,
      ex.whelan && r.time > 0 && r.time < WHELAN_MIN ? t('Менше {n} с — перевірте час; ціну пораховано як за {n} с.', { n: WHELAN_MIN }) : null,
    ].filter(Boolean).join(' · ');
    hint.hidden = !hint.textContent;
  };
  if (ex.perHit) for (const [k] of ex.zones) f.inputs[`pts_${k}`].addEventListener('input', () => { pricedByHand = true; });
  // Вибрали ствол — підставляємо набій, яким з нього стріляли востаннє: на полігоні це майже завжди він.
  let ammoByHand = false;
  let autoAmmo = false;
  if (f.inputs.cartridgeId) {
    f.inputs.cartridgeId.addEventListener('change', () => { if (!autoAmmo) ammoByHand = true; });
    f.inputs.weaponId.addEventListener('change', () => {
      if (ammoByHand) return;
      const id = ctx.lastAmmo?.(f.inputs.weaponId.value);
      if (id && id !== f.inputs.cartridgeId.value && [...f.inputs.cartridgeId.options].some((o) => o.value === id)) {
        f.inputs.cartridgeId.value = id;
        autoAmmo = true;
        f.inputs.cartridgeId.dispatchEvent(new Event('change', { bubbles: true }));
        autoAmmo = false;
      }
      collect?.update();
    });
  }
  f.onInput(update);
  update();
  // Що вже ввели — порівнюємо з тим, що було на відкритті (разом із варіантом)
  const snap = () => JSON.stringify([f.values(), variant]);
  const start = snap();
  const close = sheet(prev ? `${L(ex.name)} · ${t('Змінити')}` : L(ex.name), h('div', {},
    ex.variants ? chips(ex.variants.map(([k, label]) => [k, L(label)]), variant, (v) => { variant = v; }) : null,
    ctx.box(t('Умови'), condF.el),
    timeF ? ctx.box(t('Час'), timeF.el) : null,
    ctx.box(t('Влучання'), h('div', {}, hitsF.el, summary, hint)),
    ammoF ? ctx.box(t('Списати з БК'), ammoF.el)
      : h('p', { class: 'muted small' }, t('Списання з БК лишається як було — правте його в журналі.')),
    when.el,
    noteF.el), {
    actions: [btn(t('Скасувати'), () => close()), btn(t('Зберегти'), () => {
      const date = f.values().date;
      if (!date || Number.isNaN(date)) { fieldError(f.inputs.date, t('Заповніть поле «{label}»', { label: t('Дата') })); return; }
      const r = record();
      if (ex.shots && hitsOf(r) > ex.shots) { formError(t('більше {n} пострілів', { n: ex.shots })); return; }
      const v = f.values();
      const qty = Math.max(0, Math.round(v.qty || 0));
      close();
      ctx.onSave(r, !prev && v.cartridgeId && qty ? { cartridgeId: v.cartridgeId, qty, note: L(ex.name), collect: collect?.value() ?? null } : null);
    }, 'primary')],
    dirty: () => snap() !== start,
  });
}
