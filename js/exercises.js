// Стрілецькі вправи: правила (за відео RIFLEMAN і Стрілецької ліги) і підрахунок очок.
// Тексти правил двомовні прямо тут — це довідка, а не рядки інтерфейсу.
import { t, lang } from './i18n.js';
import { h, form, sheet, chips, confirmSheet, fmt, toolBtn, fieldError, formError, starIcon } from './ui.js';
import * as M from './model.js';
import { lineChart } from './chart.js';

const L = (o) => (typeof o === 'string' ? o : o[lang()] ?? o.ru);
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
    name: { ru: 'База-20', uk: 'База-20' },
    sub: { ru: 'Квалификационное · 20 выстрелов · 50–150 м', uk: 'Кваліфікаційна · 20 пострілів · 50–150 м' },
    rules: {
      ru: [
        'Мишень: одна грудная (IDPA/IPSC) на стрелка.',
        'Маршрут: 50 → 75 → 100 → 125 → 150 м и обратно, 4 прохода, по 1 выстрелу с позиции.',
        'Время: 15 с на выстрел вместе с зарядкой, старт с разряженным оружием.',
        'Оружие на старте:',
        '- 50 м — на слабом плече стволом вниз',
        '- 75 м — на сильном плече стволом вверх, рука держит ремень',
        '- 100 и 125 м — приклад в плече, ствол вниз 45°',
        'Положение:',
        '- 125 м — с колена (последняя дистанция для дробовиков)',
        '- 150 м — с колена, только нарезное',
        'Запрещено: сошки, мешки и упоры.',
      ],
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
      ru: [
        'Alpha: круг 20 см.',
        'Максимум: 100 очков.',
        'Звания: Basic → Shooter → Sharpshooter → Marksman → Scout → Expert → Pro.',
        'Звание подтверждается вторым матчем.',
      ],
      uk: [
        'Alpha: коло 20 см.',
        'Максимум: 100 очок.',
        'Звання: Basic → Shooter → Sharpshooter → Marksman → Scout → Expert → Pro.',
        'Звання підтверджується другим матчем.',
      ],
    },
    shots: 20,
    zones: [['A', 'Alpha', 5], ['C', 'Charlie', 4], ['D', 'Delta', 1]],
  },
  {
    id: 'white5',
    name: { ru: 'Пятёрка Уайта', uk: 'П’ятірка Уайта' },
    sub: { ru: '5 выстрелов навскидку · 91 м · на время', uk: '5 пострілів навскидку · 91 м · на час' },
    rules: {
      ru: [
        'Дистанция: 91 м (100 ярдов), грудная мишень.',
        'Старт: патрон в патроннике, предохранитель снят, приклад у пояса, ствол на мишень.',
        'Ход: по сигналу — один выстрел, и так 5 раз.',
        'Время: фиксируется у каждого выстрела, в зачёт идёт сумма.',
      ],
      uk: [
        'Дистанція: 91 м (100 ярдів), грудна мішень.',
        'Старт: набій у патроннику, запобіжник знято, приклад біля пояса, ствол на мішень.',
        'Хід: за сигналом — один постріл, і так 5 разів.',
        'Час: фіксується в кожного пострілу, у залік іде сума.',
      ],
    },
    scoring: {
      ru: [
        'Зоны: Alpha — круг 20 см, Bravo — остальная мишень.',
        'Цена попадания: зависит от суммарного времени (таблица Уилана, 1923).',
        'Известная точка: 9,87 с → A = 15, B = 10.',
      ],
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
    sub: { ru: 'Самоподготовка · 10 холодных выстрелов · лист A4/A5', uk: 'Самопідготовка · 10 холодних пострілів · аркуш A4/A5' },
    variants: [
      ['a4-100', { ru: 'A4 · стоя · 100 м', uk: 'A4 · стоячи · 100 м' }],
      ['a5-100', { ru: 'A5 · стоя · 100 м', uk: 'A5 · стоячи · 100 м' }],
      ['a5-200', { ru: 'A5 · колено · 200 м', uk: 'A5 · коліно · 200 м' }],
    ],
    rules: {
      ru: [
        'Мишень:',
        '- A4 (20×30 см) — для новичков, механики и коллиматора',
        '- A5 (15×20 см) — для опытных',
        'Положение:',
        '- A4 и A5 — стоя со 100 м',
        '- продвинутый уровень — A5 с колена с ремнём с 200 м',
        'Без упоров.',
        'Ход: один выстрел → дойти до мишени → подписать пробоину номером → вернуться.',
        'Длительность: 10 выстрелов ≈ 30 мин и 2 км.',
        'По номерам видно, как ложились выстрелы: дыхание, спуск, стойка.',
      ],
      uk: [
        'Мішень:',
        '- A4 (20×30 см) — для новачків, механіки й коліматора',
        '- A5 (15×20 см) — для досвідчених',
        'Положення:',
        '- A4 і A5 — стоячи зі 100 м',
        '- просунутий рівень — A5 з коліна з ременем з 200 м',
        'Без упорів.',
        'Хід: один постріл → дійти до мішені → підписати пробоїну номером → повернутися.',
        'Тривалість: 10 пострілів ≈ 30 хв і 2 км.',
        'За номерами видно, як лягали постріли: дихання, спуск, стійка.',
      ],
    },
    scoring: {
      ru: [
        'Считаются попадания в лист.',
        'Меньше 8 из 10: разобрать ошибки.',
        '8 из 10 стабильно на A4: переходить на A5.',
        '10 из 10 на A5: норма для опытного.',
        'Бонус-вызов: все попадания в круг 10 см (стандарт Стюарта Уайта).',
      ],
      uk: [
        'Рахуються влучання в аркуш.',
        'Менше 8 з 10: розібрати помилки.',
        '8 з 10 стабільно на A4: переходити на A5.',
        '10 з 10 на A5: норма для досвідченого.',
        'Бонус-виклик: усі влучання в коло 10 см (стандарт Стюарта Уайта).',
      ],
    },
    shots: 10,
    zones: [['hit', { ru: 'Попадания', uk: 'Влучання' }, 1]],
    ranks: [[10, '10 / 10'], [8, { ru: 'норма', uk: 'норма' }], [0, { ru: 'разобрать ошибки', uk: 'розібрати помилки' }]],
  },
  {
    id: 'cooper',
    name: { ru: 'Турнир Купера', uk: 'Турнір Купера' },
    sub: { ru: '20 выстрелов · 50–300 м · 30 с на позицию', uk: '20 пострілів · 50–300 м · 30 с на позицію' },
    rules: {
      ru: [
        'Маршрут: как в База-20, но дистанции растут от 50 до ~300 м.',
        'Позиции: 2–3 выстрела с каждой, например «2S75» — 2 выстрела стоя с 75 м.',
        'Время: 30 с на позицию вместе с принятием положения.',
        'Старт: с разряженным оружием, дозарядка только из патронташа или подсумка.',
        'Положение:',
        '- до 155 м — стоя с рук',
        '- дальше — с колена',
        '- ~200 и 300 м — лёжа без упоров',
        'Ремень разрешён.',
        'Мишень: A3 с чёрной картонкой за головой — для поправок.',
        'Сквад: 6 человек, 60 минут.',
      ],
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
      ru: [
        'Зоны: как в База-20.',
        'Максимум: 100 очков.',
        'Просрочка: за каждый выстрел после 30 с снимается одно лучшее попадание.',
        'Звания: по сумме, пример из видео — 80 = Scout.',
      ],
      uk: [
        'Зони: як у База-20.',
        'Максимум: 100 очок.',
        'Прострочка: за кожен постріл після 30 с знімається одне найкраще влучання.',
        'Звання: за сумою, приклад з відео — 80 = Scout.',
      ],
    },
    shots: 20,
    zones: [['A', 'Alpha', 5], ['C', 'Charlie', 4], ['D', 'Delta', 1]],
    late: true,
  },
  {
    id: 'marathon',
    name: { ru: 'Скаутский марафон / Тропа скаута', uk: 'Скаутський марафон / Стежка скаута' },
    sub: { ru: '20 попаданий в свою мишень на маршруте', uk: '20 влучань у свою мішень на маршруті' },
    rules: {
      ru: [
        'Марафон: логика База-20, но дистанции до 300 м и «дикие», заранее неизвестные локации.',
        'Тропа скаута (Hit&Run): маршрут ~500 м с инструктором, ~10 позиций по 2 выстрела — к финишу 20 попаданий.',
        'Бывает этап с дробовиком и картечью («скаутская спарка»).',
      ],
      uk: [
        'Марафон: логіка База-20, але дистанції до 300 м і «дикі», заздалегідь невідомі локації.',
        'Стежка скаута (Hit&Run): маршрут ~500 м з інструктором, ~10 позицій по 2 постріли — до фінішу 20 влучань.',
        'Буває етап з дробовиком і картеччю («скаутська спарка»).',
      ],
    },
    scoring: {
      ru: [
        'Зоны: грудной мишени, как в База-20.',
      ],
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
    sub: { ru: 'Третий этап троеборья · 10 выстрелов', uk: 'Третій етап триборства · 10 пострілів' },
    rules: {
      ru: [
        'По мотивам скандинавского felthurtigskyting.',
        'Официальные правила Nordic-10 в открытых источниках не найдены.',
        'Оригинал:',
        '- 3 мишени на неизвестных дистанциях: две до 150 м, третья до 225–275 м',
        '- не больше 6 патронов',
        '- старт стоя, оружие заряжено и на предохранителе',
        '- сначала ближние мишени',
        'Результат: время.',
      ],
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
      ru: [
        'Считаются попадания и время прохождения.',
        'Условия: три мишени, не больше 6 патронов.',
        'Чем меньше время при тех же попаданиях, тем лучше.',
      ],
      uk: [
        'Рахуються влучання й час проходження.',
        'Умови: три мішені, не більше 6 набоїв.',
        'Що менший час за тих самих влучань, то краще.',
      ],
    },
    shots: 6,
    zones: [['hit', { ru: 'Попадания', uk: 'Влучання' }, 1]],
    time: true,
  },
];

/**
 * Рядки правил → пункти: «Заголовок: текст» виділяє заголовок, рядок з «- » — підпункт попереднього.
 * Та сама розмітка працює і у своїх вправах — правила там пишуть у полі, по рядку на пункт.
 */
function textItems(lines) {
  const out = [];
  for (const raw of lines ?? []) {
    const line = String(raw).trim();
    if (!line) continue;
    const dash = /^[-–•]\s+/.exec(line);
    if (dash && out.length) { (out.at(-1).sub ??= []).push(line.slice(dash[0].length)); continue; }
    // Короткий заголовок без ком — щоб звичайне речення з двокрапкою не стало заголовком.
    const lead = /^([^:,]{1,30}):\s*(.*)$/.exec(line);
    out.push(lead ? { lead: lead[1], text: lead[2] } : { text: line });
  }
  return out.map((it) => h('li', {},
    it.lead ? h('b', {}, `${it.lead}:`) : null,
    it.text ? `${it.lead ? ' ' : ''}${it.text}` : null,
    it.sub ? h('ul', { class: 'ex-sub' }, it.sub.map((x) => h('li', {}, x))) : null));
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
    ? h('div', {}, h('div', { class: 'ex-scoring-title' }, t('Звания')),
      h('dl', { class: 'kv ex-zones' }, list.map(([min, name]) => [h('dt', {}, L(name)), h('dd', {}, t('от {n}', { n: fmt.num(min) }))])))
    : h('p', { class: 'muted small ex-scoring-note' }, t('Пороги званий не заданы — укажите их в настройках упражнения (✎).'));
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

// Свої вправи з бази: тримаємо тут, щоб exById і назва в журналі бачили їх як вбудовані.
let CUSTOM = [];

/** Запис своєї вправи → той самий вигляд, що й у вбудованих (зони, правила, підпис). */
export function asExercise(rec) {
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
    sub: [rec.shots ? t('{n} выстр.', { n: rec.shots }) : null,
      rec.distance ? t('{n} м', { n: rec.distance }) : null].filter(Boolean).join(' · '),
    shots: Number(rec.shots) || 0,
    distance: Number(rec.distance) || null,
    time: !!rec.time,
    zones: (rec.zones ?? []).map((z, i) => [z.key ?? `z${i + 1}`, z.label, Number(z.pts) || 0]),
    rules: { ru: lines, uk: lines },
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
export const whelanPoints = (time, base) => (time > 0 ? Math.max(0, Math.round((base * WHELAN_T) / time)) : base);

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
function makeCtx({ scores, weapons, cartridges = [], drills = [], box, stat, onSave, onDelete, targetsOf, lastAmmo = null, mismatch = null, openTimer = null, pickAmmo = null, pickWeapon = null, weaponName = () => null, weaponExtras = null, extrasRows = () => [], pickList = null, collectField = null, custom = [], onSaveExercise = null, onDeleteExercise = null, onHideExercise = null }) {
  CUSTOM = custom;
  return { scores, weapons, cartridges, drills, box, stat, onSave, onDelete, targetsOf, lastAmmo, mismatch, openTimer, pickAmmo, pickWeapon, weaponName, weaponExtras, extrasRows, pickList, collectField, custom, onSaveExercise, onDeleteExercise, onHideExercise };
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
  const best = mine.length ? Math.max(...mine.map((s) => s.score)) : null;
  const step = best === null ? null : rankStep(ex, best);
  // Без результату — пунктирне кільце й заклик спробувати; нижче першого звання — скільки до нього;
  // у вправи без звань — просто «рекорд», щоб плитки стояли рівно.
  const status = best === null
    ? h('span', { class: 'ex-tile-try' }, `＋ ${t('Попробовать')}`)
    : step.cur ? h('span', { class: 'ex-tile-rank' }, L(step.cur[1]))
      : step.next ? h('span', { class: 'ex-tile-foot' }, t('ещё {n} до «{rank}»', { n: fmt.num(step.next[0] - best), rank: L(step.next[1]) }))
        : h('span', { class: 'ex-tile-foot' }, t('рекорд'));
  return h('button', { type: 'button', class: `ex-tile ${best === null ? 'empty' : ''}`, 'data-id': ex.id, onclick: () => exerciseSheet(ex, ctx) },
    progressRing(step?.list.length ? step.progress : 0, best === null ? '—' : fmt.num(best), 'ex-tile-ring'),
    status,
    h('span', { class: 'ex-tile-name' }, L(ex.name)),
    h('span', { class: 'ex-tile-foot' }, [ex.shots ? t('{n} выстр.', { n: ex.shots }) : L(ex.sub),
      mine.length ? t('попыток: {n}', { n: mine.length }) : null].filter(Boolean).join(' · ')));
}

/** Картка вправи: рекорд у кільці звання, кнопка, динаміка й результати; правила й підрахунок — під «i» в шапці. */
function exerciseSheet(ex, ctx) {
  const body = () => {
    const mine = myScores(ex, ctx);
    const best = mine.length ? Math.max(...mine.map((s) => s.score)) : null;
    const series = M.scoreSeries(ctx.scores, ex.id);
    return h('div', {},
      h('p', { class: 'muted' }, L(ex.sub)),
      infoPanel(ex),
      mine.length ? recordHero(ex, best, mine) : null,
      ex.zones ? h('div', { class: 'btn-row' },
        btn(t('Записать результат'), () => { close(); scoreSheet(ex, ctx); }, 'primary')) : null,
      series.length > 1 ? ctx.box(t('Динамика'), lineChart(series.map((x) => ({ label: fmt.date(x.date), value: x.value })), {
        format: (v) => fmt.num(v),
        minStep: 1,
        // Пороги звань — лініями: видно, скільки до наступного.
        refs: (ranksOf(ex) ?? []).map(([min, name]) => [min, L(name)]),
      })) : null,
      mine.length ? ctx.box(t('Результаты'), h('div', { class: 'rows' }, mine.map((x) => scoreRow(ex, x, best, ctx))),
        { fold: 'ex-results', count: mine.length }) : null);
  };
  // Правка й видалення (для вбудованої — «повернути як було») — іконками в шапці, як у картках зброї й набою.
  // Видаляються всі однаково; вбудована живе в коді, тож її ховаємо — повернути можна в Налаштуваннях.
  const own = ctx.custom.find((r) => r.id === ex.id);
  const builtIn = EXERCISES.some((e) => e.id === ex.id);
  const tools = [infoButton(), ...(ctx.onSaveExercise ? [
    toolBtn('edit', t('Изменить'), () => { close(); exerciseForm(own ?? asRecord(ex), ctx); }),
    own && builtIn ? toolBtn('reset', t('Вернуть встроенную'), () => { close(); ctx.onDeleteExercise?.(own); }) : null,
    builtIn
      ? toolBtn('delete', t('Удалить'), () => { close(); ctx.onHideExercise?.(ex); }, 'danger')
      : own ? toolBtn('delete', t('Удалить'), () => { close(); ctx.onDeleteExercise?.(own); }, 'danger') : null,
  ].filter(Boolean) : [])];
  const close = sheet(L(ex.name), body(), { live: body, tools });
}

// Панель правил відкрита чи ні — одна на всі вправи, поки застосунок відкритий.
let infoOpen = false;

/** Правила й підрахунок очок: читають раз, тож вони під «i», а не в самій картці. */
function infoPanel(ex) {
  const rules = L(ex.rules)?.length
    ? h('div', {}, h('div', { class: 'ex-scoring-title' }, t('Правила')), h('ul', { class: 'ex-rules' }, textItems(L(ex.rules))))
    : null;
  return h('div', { class: 'ex-info', hidden: !infoOpen }, rules,
    h('div', {}, h('div', { class: 'ex-scoring-title' }, t('Подсчёт очков')), scoringContent(ex)));
}

/** «i» у шапці картки: ховає й показує панель правил (тіло картки перемальовується — стан у infoOpen). */
function infoButton() {
  const button = h('button', {
    type: 'button', class: 'hint-btn', 'aria-label': t('Правила и подсчёт очков'), 'aria-expanded': String(infoOpen),
    onclick: () => {
      infoOpen = !infoOpen;
      button.setAttribute('aria-expanded', String(infoOpen));
      const panel = button.closest('.sheet')?.querySelector('.ex-info');
      if (panel) panel.hidden = !infoOpen;
    },
  }, 'i');
  return button;
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
function recordHero(ex, best, mine) {
  const { list, cur, next, progress } = rankStep(ex, best);
  const avgOf = Math.min(3, mine.length);
  const avg = Math.round(mine.slice(0, avgOf).reduce((s, x) => s + x.score, 0) / avgOf);
  return h('div', {},
    h('section', { class: 'ex-rec' },
      h('div', {},
        h('div', { class: 'hero-label' }, t('рекорд')),
        h('div', { class: 'ex-rec-value' }, fmt.num(best)),
        list.length ? h('div', { class: 'muted small' }, cur ? [h('b', { class: 'rank-name' }, L(cur[1])), ' · '] : null,
          next ? t('ещё {n} до «{rank}»', { n: fmt.num(next[0] - best), rank: L(next[1]) }) : t('высшее звание')) : null),
      list.length ? progressRing(progress, cur ? L(cur[1]) : '—') : null),
    h('div', { class: 'ex-mini' },
      h('span', {}, t('среднее из {n}', { n: avgOf }), ' ', h('b', {}, fmt.num(avg))),
      h('span', {}, t('последний'), ' ', h('b', {}, fmt.num(mine[0].score))),
      h('span', {}, t('попыток'), ' ', h('b', {}, fmt.num(mine.length)))));
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
  const zones = rec?.zones?.length ? rec.zones : [{ label: t('Попадание'), pts: 1 }];
  const ZONES = 4;
  const fields = [
    { name: 'name', label: t('Название'), value: rec?.name ?? '', required: true, wide: true },
    { name: 'shots', label: t('Выстрелов'), type: 'number', min: 1, step: 1, value: rec?.shots ?? '', half: true },
    { name: 'distance', label: t('Дистанция, м'), type: 'number', min: 0, step: 'any', value: rec?.distance ?? '', half: true },
    // На всю ширину: третє поле «в половину» зсувало зони — назва зони й її очки опинялись у різних рядках.
    { name: 'time', label: t('Считать время'), type: 'chips', value: rec?.time ? '1' : '',
      options: [['', t('нет')], ['1', t('да')]] },
    { name: 'variants', label: t('Варианты'), type: 'textarea', rows: 3, wide: true,
      value: (rec?.variants ?? []).map((x) => x.label).join(String.fromCharCode(10)),
      placeholder: t('A4 · стоя · 100 м'),
      hint: t('Каждая строка — вариант: мишень, положение, дистанция. При записи результата выбирается кнопкой.') },
  ];
  for (let i = 0; i < ZONES; i += 1) {
    fields.push(
      { name: `z${i}n`, label: i === 0 ? t('Зона') : '', value: zones[i]?.label ?? '', placeholder: t('Напр. Alpha'), half: true },
      { name: `z${i}p`, label: i === 0 ? t('Очков за попадание') : '', type: 'number', min: 0, step: 'any', value: zones[i]?.pts ?? '', half: true });
  }
  // Пороги звань — тут же, рядами «звання | від скількох очок», від вищого; свої або вбудовані, якщо своїх ще немає.
  const ranks = [...((Array.isArray(rec?.ranks) ? rec.ranks : rec?.id && ranksOf(exById(rec.id) ?? {})) || [])]
    .map(([min, name]) => [min, L(name)]).sort((a, b) => b[0] - a[0]);
  const RANKS = Math.min(8, Math.max(4, ranks.length + 1));
  for (let i = 0; i < RANKS; i += 1) {
    fields.push(
      { name: `r${i}n`, label: i === 0 ? t('Звание') : '', value: ranks[i]?.[1] ?? '', placeholder: 'Marksman', half: true },
      { name: `r${i}m`, label: i === 0 ? t('От, очков') : '', type: 'number', min: 0, step: 1, value: ranks[i]?.[0] ?? '', half: true });
  }
  fields.push({ name: 'rules', label: t('Правила'), type: 'textarea', value: rec?.rules ?? '', wide: true, rows: 8,
    hint: t('Каждая строка — отдельный пункт. «Заголовок: текст» — выделит заголовок, строка с «- » — подпункт.') });
  const f = form(fields);
  const save = () => {
    const v = f.values();
    if (!v.name) { fieldError(f.inputs.name, t('Заполните поле «{label}»', { label: t('Название') })); return; }
    const list = [];
    for (let i = 0; i < ZONES; i += 1) {
      const label = v[`z${i}n`];
      if (!label) continue;
      // Ключ зони лишаємо старий, інакше вже записані результати втратять свої влучання. Нова зона — ключ,
      // якого ще не було: «z3» після видаленої зони збігся б з наявною, а ключ видаленої забрав би її старі влучання.
      list.push({ key: rec?.zones?.[i]?.key ?? (rec ? `z-${Date.now().toString(36)}${i}` : `z${i + 1}`), label, pts: Number(v[`z${i}p`]) || 0 });
    }
    if (!list.length) { formError(t('Добавьте хотя бы одну зону')); return; }
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
  const close = sheet(rec ? L(rec.name) : t('Своё упражнение'), f.el, {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), save, 'primary')],
  });
}

function scoreRow(ex, s, best, ctx) {
  const rank = rankOf(ex, s.score);
  const variant = ex.variants?.find(([k]) => k === s.variant)?.[1];
  const sub = [variant && L(variant), s.weaponId ? ctx.weaponName(s.weaponId) : null,
    s.distance ? t('{n} м', { n: fmt.num(s.distance) }) : null,
    s.time ? `${fmt.num(s.time)} ${t('с')}` : null, s.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row', 'data-id': s.id, onclick: () => scoreCard(ex, s, ctx) },
    h('span', { class: 'row-main' },
      // Дата першою: результати шукають за днем стрільби.
      h('span', { class: 'row-title' }, `${fmt.date(s.date)} · ${hitsOf(s)}${ex.shots ? `/${ex.shots}` : ''} ${t('попад.')}`, rank ? ` · ${L(rank)}` : '', s.score === best ? starIcon(t('Лучший результат')) : null),
      h('span', { class: 'muted small' }, sub),
      best ? h('div', { class: 'bar' }, h('div', { class: `fill ${s.score === best ? '' : 'ap'}`, style: `width:${Math.max(4, (s.score / best) * 100)}%` })) : null),
    h('span', { class: 'tg-best' }, fmt.num(s.score)));
}

/** Картка результату: підсумок плитками, влучання по зонах, умови й мішені; правка й видалення іконками вгорі. */
function scoreCard(ex, s, ctx) {
  const rank = rankOf(ex, s.score);
  const cut = lateCut(ex, s);
  const hits = hitsOf(s);
  const isBest = s.score === Math.max(...myScores(ex, ctx).map((x) => x.score));
  // Влучання по зонах: скільки, по скільки очок і разом; штраф прострочки — окремим рядком, щоб сума сходилась.
  const priced = (ex.zones ?? []).map(([k, label, pts]) => {
    const n = s.hits?.[k] ?? 0;
    const price = ex.perHit ? Number(s.pts?.[k] ?? pts) : pts;
    return { label: L(label), n, price, sum: n * price };
  });
  const raw = priced.reduce((sum, z) => sum + z.sum, 0);
  const row = (label, n, price, sum, cls = '') => h('div', { class: `ex-hit ${cls}` },
    h('span', {}, label), h('span', { class: 'ex-hit-n' }, n), h('span', { class: 'muted' }, price), h('span', { class: 'ex-hit-sum' }, sum));
  const hitsBox = ctx.box(t('Попадания'), h('div', { class: 'ex-hits' },
    priced.map((z) => row(z.label, fmt.num(z.n), `× ${fmt.num(z.price)}`, fmt.num(z.sum), z.n ? '' : 'zero')),
    ex.shots > hits ? row(t('Промахи'), fmt.num(ex.shots - hits), '', '', 'miss') : null,
    cut ? row(t('Просрочка'), t('−{n} лучших', { n: cut }), '', `−${fmt.num(raw - s.score)}`, 'penalty') : null));
  const weapon = s.weaponId ? ctx.weaponName(s.weaponId) ?? '—' : null;
  const variant = s.variant ? L(ex.variants?.find(([k]) => k === s.variant)?.[1] ?? s.variant) : null;
  // Дата — у заголовку картки.
  const cond = [
    variant ? [t('Вариант'), variant] : null,
    s.clock ? [t('Время'), s.clock] : null,
    weapon ? [t('Оружие'), weapon] : null,
    ...ctx.extrasRows(s),
    s.distance ? [t('Дистанция, м'), fmt.num(s.distance)] : null,
    s.note ? [t('Примечание'), s.note] : null,
  ].filter(Boolean);
  const body = h('div', {},
    h('div', { class: 'stats even' },
      ctx.stat([[t('очки'), rank && L(rank)].filter(Boolean).join(' · '), isBest ? starIcon(t('Лучший результат')) : null],
        fmt.num(s.score), 'accent'),
      ctx.stat(t('попаданий'), ex.shots ? `${fmt.num(hits)}/${fmt.num(ex.shots)}` : fmt.num(hits)),
      s.time ? ctx.stat(t('время, с'), fmt.num(s.time)) : null),
    hitsBox,
    cond.length ? ctx.box(t('Условия'), h('dl', { class: 'kv' }, cond.map(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))) : null,
    ctx.targetsOf?.(s) ?? null);
  const del = toolBtn('delete', t('Удалить'), () => {
    close();
    confirmSheet(t('Удалить результат?'), `${L(ex.name)} · ${fmt.date(s.date)} · ${s.score}`, t('Удалить'), () => ctx.onDelete(s));
  }, 'danger');
  const edit = toolBtn('edit', t('Изменить'), () => { close(); scoreSheet(ex, ctx, s); });
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
  const ammo = ctx.cartridges.map(([id, name, n]) => [id, t('{name} · ост. {n}', { name, n: fmt.num(n) })]);
  // Дистанція — у самому результаті: та сама вправа стріляється і з 50, і з 150 м.
  const lastDistance = ctx.scores.filter((s) => s.exercise === ex.id && s.distance).sort(M.byDateDesc)[0]?.distance;
  // Зброя результату в архіві — лишаємо її у виборі, інакше збереження мовчки зітре її з результату
  const keep = prev?.weaponId && !ctx.weapons.some(([id]) => id === prev.weaponId) && ctx.weaponName(prev.weaponId);
  const condF = form([
    { name: 'weaponId', label: t('Оружие'), type: 'select', value: prev?.weaponId ?? '', options: [['', '—'], ...ctx.weapons, ...(keep ? [[prev.weaponId, keep]] : [])], wide: true },
    { name: 'date', label: t('Дата'), type: 'dmy', value: prev?.date ?? M.today(), half: true },
    // clock — час дня; time у вправах на час — сума часу серії
    { name: 'clock', label: t('Время'), type: 'time', value: prev ? prev.clock ?? '' : new Date().toTimeString().slice(0, 5), half: true },
    { name: 'distance', label: t('Дистанция, м'), type: 'number', min: 0, step: 'any', half: true,
      value: prev?.distance ?? ex.distance ?? lastDistance ?? '' },
  ]);
  const timeF = ex.time
    ? form([{ name: 'time', label: t('Сумма времени, с'), type: 'number', step: 0.01, min: 0, value: prev?.time ?? '', half: true }])
    : null;
  // Влучання й ціна зони — в одному ряду: у П'ятірці Уайта ціна своя на кожну спробу.
  const hitsF = form([
    ...ex.zones.flatMap(([k, label, pts]) => [
      { name: `hit_${k}`, label: ex.perHit ? `${L(label)}, ${t('попаданий')}` : `${L(label)} × ${fmt.num(pts)}`,
        type: 'number', min: 0, value: prev?.hits?.[k] ?? '', half: true },
      ...(ex.perHit ? [{ name: `pts_${k}`, label: `${t('Очков за')} ${L(label)}`, type: 'number', value: prev?.pts?.[k] ?? pts, min: 0, half: true }] : []),
    ]),
    ...(ex.late ? [{ name: 'late', label: t('Выстрелов после 30 с'), type: 'number', min: 0, value: prev?.late ?? 0, half: true }] : []),
  ]);
  // При правці БК не чіпаємо: набої вже списані рухом, і міняти його заднім числом — більше шкоди, ніж користі.
  const ammoF = prev ? null : form([
    { name: 'cartridgeId', label: t('Патрон'), type: 'select', options: [['', t('не списывать')], ...ammo], half: true },
    { name: 'qty', label: t('Выстрелов, шт'), type: 'number', min: 0, value: ex.shots ?? '', half: true },
  ]);
  const noteF = form([{ name: 'note', label: t('Примечание'), type: 'text', value: prev?.note ?? '', wide: true }]);
  const f = joinForms([condF, timeF, hitsF, ammoF, noteF].filter(Boolean));
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
  let pricedByHand = Boolean(prev?.pts) && ex.zones.some(([k, , pts]) => Number(prev.pts[k]) !== whelanPoints(prev.time, pts));
  if (timeF && ctx.openTimer) {
    // Вправу на час стріляють із таймером — запускаємо його звідси, час сам стане в поле.
    timeF.el.append(h('div', { class: 'field half ex-timer-btn' }, h('button', {
      type: 'button', class: 'btn',
      onclick: () => ctx.openTimer((seconds) => { f.inputs.time.value = round2(seconds); update(); }),
    }, t('Запустить таймер'))));
  }
  // Час зі збереженої серії таймера: у вправах на час його й так міряють таймером.
  const timed = ctx.drills.filter((d) => d.shots?.length);
  if (timeF && timed.length) {
    const pick = h('select', {
      'aria-label': t('Взять время из серии'),
      onchange: () => {
        const d = timed.find((x) => x.id === pick.value);
        if (!d) return;
        f.inputs.time.value = round2(sumTime(d));
        update();
      },
    }, [h('option', { value: '' }, '—'),
      ...timed.map((d) => h('option', { value: d.id }, `${fmt.date(d.date)} · ${d.shots.length} ${t('выстр.')} · ${fmt.num(round2(sumTime(d)))} ${t('с')}`))]);
    timeF.el.append(h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, t('Взять время из серии')), pick));
    ctx.pickList?.(pick, t('Взять время из серии'));
  }
  const record = () => {
    const v = f.values();
    // ...prev — щоб правка зберегла id, зв'язок зі стрільбою й дату створення.
    const r = { ...(prev ?? {}), exercise: ex.id, date: v.date, clock: v.clock || null, weaponId: v.weaponId || null, distance: v.distance || null, note: v.note, ...(extras?.values() ?? {}), hits: {} };
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
      ctx.stat(t('попаданий'), ex.shots ? `${fmt.num(hits)}/${fmt.num(ex.shots)}` : fmt.num(hits)),
      ex.shots ? ctx.stat(t('промахов'), fmt.num(Math.max(0, ex.shots - hits))) : null);
    hint.textContent = [
      cut ? t('−{n} лучших попаданий', { n: cut }) : null,
      ctx.mismatch?.(f.inputs.cartridgeId?.value, f.inputs.weaponId.value),
      ex.shots && hits > ex.shots ? t('больше {n} выстрелов', { n: ex.shots }) : null,
      ex.whelan ? t('Цена попадания — оценка по времени, её можно исправить.') : null,
    ].filter(Boolean).join(' · ');
    hint.hidden = !hint.textContent;
  };
  if (ex.perHit) for (const [k] of ex.zones) f.inputs[`pts_${k}`].addEventListener('input', () => { pricedByHand = true; });
  // Вибрали ствол — підставляємо набій, яким з нього стріляли востаннє: на полігоні це майже завжди він.
  let ammoByHand = false;
  if (f.inputs.cartridgeId) {
    f.inputs.cartridgeId.addEventListener('change', () => { ammoByHand = true; });
    f.inputs.weaponId.addEventListener('change', () => {
      if (ammoByHand) return;
      const id = ctx.lastAmmo?.(f.inputs.weaponId.value);
      if (id && [...f.inputs.cartridgeId.options].some((o) => o.value === id)) f.inputs.cartridgeId.value = id;
      collect?.update();
    });
  }
  f.onInput(update);
  update();
  const close = sheet(prev ? `${L(ex.name)} · ${t('Изменить')}` : L(ex.name), h('div', {},
    ex.variants ? chips(ex.variants.map(([k, label]) => [k, L(label)]), variant, (v) => { variant = v; }) : null,
    ctx.box(t('Условия'), condF.el),
    timeF ? ctx.box(t('Время'), timeF.el) : null,
    ctx.box(t('Попадания'), h('div', {}, hitsF.el, summary, hint)),
    ammoF ? ctx.box(t('Списать из БК'), ammoF.el)
      : h('p', { class: 'muted small' }, t('Списание из БК остаётся как было — правьте его в журнале.')),
    noteF.el), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), () => {
      const date = f.values().date;
      if (!date || Number.isNaN(date)) { fieldError(f.inputs.date, t('Заполните поле «{label}»', { label: t('Дата') })); return; }
      const r = record();
      if (ex.shots && hitsOf(r) > ex.shots) { formError(t('больше {n} выстрелов', { n: ex.shots })); return; }
      const v = f.values();
      const qty = Math.max(0, Math.round(v.qty || 0));
      close();
      ctx.onSave(r, !prev && v.cartridgeId && qty ? { cartridgeId: v.cartridgeId, qty, note: L(ex.name), collect: collect?.value() ?? null } : null);
    }, 'primary')],
  });
}
