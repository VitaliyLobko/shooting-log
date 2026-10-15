// Стрілецькі вправи: правила (за відео RIFLEMAN і Стрілецької ліги) і підрахунок очок.
// Тексти правил двомовні прямо тут — це довідка, а не рядки інтерфейсу.
import { t, lang } from './i18n.js';
import { h, form, sheet, toast, chips, confirmSheet, fmt } from './ui.js';
import * as M from './model.js';

const L = (o) => (typeof o === 'string' ? o : o[lang()] ?? o.ru);
const btn = (label, onclick, kind = '') => h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);

/**
 * zones — зони мішені й очки за влучання; miss рахується сам (постріли мінус влучання).
 * late — штраф турніру Купера: за кожен постріл поза часом знімається одне найкраще влучання.
 * time — сумарний час; perHit — очки за влучання вводяться вручну (таблиця Уайта залежить від часу).
 * ranks — [мінімум очок, назва], від вищого.
 */
export const EXERCISES = [
  {
    id: 'baza20',
    name: 'Baza-20',
    sub: { ru: 'Квалификационное · 20 выстрелов · 50–150 м', uk: 'Кваліфікаційна · 20 пострілів · 50–150 м' },
    rules: {
      ru: [
        'Одна грудная мишень (IDPA/IPSC) на стрелка. Позиции 50 → 75 → 100 → 125 → 150 м и обратно, 4 прохода, по 1 выстрелу с позиции.',
        'Старт с разряженным оружием, 15 с на выстрел с зарядкой.',
        '50 м: винтовка на слабом плече стволом вниз. 75 м: на сильном плече стволом вверх, рука держит ремень. 100 и 125 м: приклад в плече, ствол вниз 45°.',
        '125 м — с колена (последняя дистанция для дробовиков), 150 м — с колена, только нарезное.',
        'Без сошек, мешков и упоров.',
      ],
      uk: [
        'Одна грудна мішень (IDPA/IPSC) на стрільця. Позиції 50 → 75 → 100 → 125 → 150 м і назад, 4 проходи, по 1 пострілу з позиції.',
        'Старт з розрядженою зброєю, 15 с на постріл разом із заряджанням.',
        '50 м: гвинтівка на слабкому плечі стволом униз. 75 м: на сильному плечі стволом угору, рука тримає ремінь. 100 і 125 м: приклад у плечі, ствол униз 45°.',
        '125 м — з коліна (остання дистанція для дробовиків), 150 м — з коліна, лише нарізна.',
        'Без сошок, мішків і упорів.',
      ],
    },
    scoring: {
      ru: 'Alpha (круг 20 см) — 5, Charlie — 4, Delta — 1. Максимум 100. Звания: Basic → Shooter → Sharpshooter → Marksman → Scout → Expert → Pro; пороги в открытых источниках не найдены. Звание подтверждается вторым матчем.',
      uk: 'Alpha (коло 20 см) — 5, Charlie — 4, Delta — 1. Максимум 100. Звання: Basic → Shooter → Sharpshooter → Marksman → Scout → Expert → Pro; пороги у відкритих джерелах не знайдені. Звання підтверджується другим матчем.',
    },
    shots: 20,
    zones: [['A', 'Alpha', 5], ['C', 'Charlie', 4], ['D', 'Delta', 1]],
  },
  {
    id: 'white5',
    name: { ru: 'Пятёрка Уайта', uk: "П'ятірка Уайта" },
    sub: { ru: '5 выстрелов навскидку · 91 м · на время', uk: '5 пострілів навскидку · 91 м · на час' },
    rules: {
      ru: [
        'Дистанция 91 м (100 ярдов), грудная мишень.',
        'Патрон в патроннике, предохранитель снят, приклад у пояса, ствол на мишень.',
        'По сигналу — один выстрел. Так 5 раз, время каждого выстрела фиксируется и суммируется.',
      ],
      uk: [
        'Дистанція 91 м (100 ярдів), грудна мішень.',
        'Набій у патроннику, запобіжник знято, приклад біля пояса, ствол на мішень.',
        'За сигналом — один постріл. Так 5 разів, час кожного пострілу фіксується й сумується.',
      ],
    },
    scoring: {
      ru: 'Две зоны: Alpha (круг 20 см) и Bravo — остальная мишень. Цена попадания зависит от суммарного времени по таблице Уилана (1923); известная точка: 9,87 с → A = 15, B = 10. Уровни: 40 Marksman, 55 Sharpshooter, 65 Expert, 75 — максимум.',
      uk: 'Дві зони: Alpha (коло 20 см) і Bravo — решта мішені. Ціна влучання залежить від сумарного часу за таблицею Уїлена (1923); відома точка: 9,87 с → A = 15, B = 10. Рівні: 40 Marksman, 55 Sharpshooter, 65 Expert, 75 — максимум.',
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
        'Мишень — лист A4 (20×30 см) для новичков, механики и коллиматора; A5 (15×20 см) — для опытных.',
        'A4 и A5 стоя со 100 м; продвинутый уровень — A5 с колена с ремнём с 200 м. Без упоров.',
        'Один выстрел → дойти до мишени → подписать пробоину номером → вернуться. 10 выстрелов ≈ 30 мин и 2 км.',
        'По номерам видно, как ложились выстрелы: дыхание, спуск, стойка.',
      ],
      uk: [
        'Мішень — аркуш A4 (20×30 см) для новачків, механіки й коліматора; A5 (15×20 см) — для досвідчених.',
        'A4 і A5 стоячи зі 100 м; просунутий рівень — A5 з коліна з ременем з 200 м. Без упорів.',
        'Один постріл → дійти до мішені → підписати пробоїну номером → повернутися. 10 пострілів ≈ 30 хв і 2 км.',
        'За номерами видно, як лягали постріли: дихання, спуск, стійка.',
      ],
    },
    scoring: {
      ru: 'Считаются попадания в лист. Меньше 8 из 10 — разобрать ошибки; 8 из 10 стабильно на A4 — переходить на A5; 10 из 10 на A5 — норма для опытного. Бонус-вызов: все попадания в круг 10 см (стандарт Стюарта Уайта).',
      uk: 'Рахуються влучання в аркуш. Менше 8 з 10 — розібрати помилки; 8 з 10 стабільно на A4 — переходити на A5; 10 з 10 на A5 — норма для досвідченого. Бонус-виклик: усі влучання в коло 10 см (стандарт Стюарта Уайта).',
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
        'Маршрут как в Baza-20, но дистанции растут от 50 до ~300 м; 2–3 выстрела с позиции (например, «2S75» — 2 выстрела стоя с 75 м).',
        '30 с на позицию с принятием положения. Старт с разряженным оружием, дозарядка только из патронташа или подсумка.',
        'До 155 м — стоя с рук, дальше — с колена, на ~200 и 300 м — лёжа без упоров. Ремень разрешён.',
        'Мишень A3 с чёрной картонкой за головой — для поправок. Сквад 6 человек, 60 минут.',
      ],
      uk: [
        'Маршрут як у Baza-20, але дистанції ростуть від 50 до ~300 м; 2–3 постріли з позиції (наприклад, «2S75» — 2 постріли стоячи з 75 м).',
        '30 с на позицію разом із прийняттям положення. Старт з розрядженою зброєю, дозарядка лише з патронташа чи підсумка.',
        'До 155 м — стоячи з рук, далі — з коліна, на ~200 і 300 м — лежачи без упорів. Ремінь дозволено.',
        'Мішень A3 з чорною картонкою за головою — для поправок. Сквад 6 людей, 60 хвилин.',
      ],
    },
    scoring: {
      ru: 'Зоны как в Baza-20 (5 / 4 / 1), максимум 100. За каждый выстрел после 30 с снимается одно лучшее попадание. Звания по сумме (пример из видео: 80 = Scout), официальные пороги не найдены.',
      uk: 'Зони як у Baza-20 (5 / 4 / 1), максимум 100. За кожен постріл після 30 с знімається одне найкраще влучання. Звання за сумою (приклад з відео: 80 = Scout), офіційні пороги не знайдені.',
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
        'Марафон: логика Baza-20, но дистанции до 300 м и «дикие», заранее неизвестные локации.',
        'Тропа скаута (Hit&Run): маршрут ~500 м с инструктором, ~10 позиций по 2 выстрела — к финишу 20 попаданий. Бывает этап с дробовиком и картечью («скаутская спарка»).',
      ],
      uk: [
        'Марафон: логіка Baza-20, але дистанції до 300 м і «дикі», заздалегідь невідомі локації.',
        'Стежка скаута (Hit&Run): маршрут ~500 м з інструктором, ~10 позицій по 2 постріли — до фінішу 20 влучань. Буває етап з дробовиком і картеччю («скаутська спарка»).',
      ],
    },
    scoring: {
      ru: 'Подсчёт по зонам грудной мишени, как в Baza-20.',
      uk: 'Підрахунок за зонами грудної мішені, як у Baza-20.',
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
        'По мотивам скандинавского felthurtigskyting. Официальные правила Nordic-10 в открытых источниках не найдены.',
        'Оригинал: 3 мишени на неизвестных дистанциях (две до 150 м, третья до 225–275 м), не больше 6 патронов, старт стоя с заряженным оружием на предохранителе, сначала ближние мишени. Результат — время.',
      ],
      uk: [
        'За мотивами скандинавського felthurtigskyting. Офіційні правила Nordic-10 у відкритих джерелах не знайдені.',
        'Оригінал: 3 мішені на невідомих дистанціях (дві до 150 м, третя до 225–275 м), не більше 6 набоїв, старт стоячи із зарядженою зброєю на запобіжнику, спершу ближні мішені. Результат — час.',
      ],
    },
    scoring: {
      ru: 'Считаются попадания и время прохождения: три мишени, не больше 6 патронов. Чем меньше время при тех же попаданиях, тем лучше.',
      uk: 'Рахуються влучання й час проходження: три мішені, не більше 6 набоїв. Що менший час за тих самих влучань, то краще.',
    },
    shots: 6,
    zones: [['hit', { ru: 'Попадания', uk: 'Влучання' }, 1]],
    time: true,
  },
];

/** Скаутське триборство — три вправи з цього списку, очки етапів складаються. */
const TRIATHLON = {
  ru: 'Скаутское троеборье: Baza-20 + Пятёрка Уайта + Nordic-10 = 35 выстрелов, очки этапов складываются.',
  uk: 'Скаутське триборство: Baza-20 + П\'ятірка Уайта + Nordic-10 = 35 пострілів, очки етапів складаються.',
};

/** Довгий текст під розкриттям: правила й підрахунок читають раз, а блок відкривають щоразу. */
const more = (title, node) => h('details', { class: 'ex-more' }, h('summary', {}, title), node);

/** Пороги звань: свої (localStorage) або зашиті у вправі. */
const RANKS_KEY = 'shooting-log:ex-ranks';
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
export const ranksOf = (ex) => allRanks()[ex.id] ?? ex.ranks;

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
export const exById = (id) => EXERCISES.find((e) => e.id === id);

/**
 * Таблиця Уїлена (1923) у відкритих джерелах не знайдена — відома одна точка: 9,87 с → A 15, B 10.
 * Тому ціну влучання лише оцінюємо: швидше за точку — дорожче, повільніше — дешевше, пропорційно часу.
 * Значення підставляється в поля, які завжди можна виправити руками.
 */
const WHELAN_T = 9.87;
export const whelanPoints = (time, base) => (time > 0 ? Math.max(0, Math.round((base * WHELAN_T) / time)) : base);

const sumTime = (drill) => (drill.shots ?? []).reduce((s, x) => s + x, 0);
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Розділ «Вправи» в «Полігоні». scores — збережені результати; box/stat — примітиви app.js;
 * cartridges — [id, назва, залишок] для списання з БК; drills — серії таймера (час для вправ на час);
 * onSave(record, consume) зберігає (consume = {cartridgeId, qty} або null), onDelete(record) видаляє,
 * targetsOf(record) віддає блок мішеней результату (або null).
 */
export function exercisesPanel({ scores, weapons, cartridges = [], drills = [], box, stat, onSave, onDelete, targetsOf }) {
  const ctx = { scores, weapons, cartridges, drills, box, stat, onSave, onDelete, targetsOf };
  return h('div', {},
    planBox(cartridges, box),
    EXERCISES.map((ex) => {
      const mine = scores.filter((s) => s.exercise === ex.id).sort(M.byDateDesc);
      const best = mine.length ? Math.max(...mine.map((s) => s.score)) : null;
      const avgOf = Math.min(3, mine.length);
      // Спершу свої результати й кнопки, правила — нижче під розкриттям: щодня потрібні цифри, а не текст.
      return box(h('span', {}, L(ex.name), h('span', { class: 'muted small' }, ` · ${L(ex.sub)}`)), h('div', {},
        mine.length ? h('div', { class: 'stats even' },
          stat(t('рекорд'), fmt.num(best), 'accent'),
          stat(t('среднее из {n}', { n: avgOf }), fmt.num(Math.round(mine.slice(0, avgOf).reduce((s, x) => s + x.score, 0) / avgOf))),
          stat(t('последний'), fmt.num(mine[0].score))) : null,
        ex.zones ? h('div', { class: 'btn-row' },
          btn(t('Записать результат'), () => scoreSheet(ex, ctx), 'primary'),
          btn(t('Пороги званий'), () => ranksSheet(ex))) : null,
        mine.length ? h('div', { class: 'rows' }, mine.map((s) => scoreRow(ex, s, best, ctx))) : null,
        more(t('Правила'), h('ul', { class: 'ex-rules' }, L(ex.rules).map((line) => h('li', {}, line)))),
        ex.scoring ? more(t('Подсчёт очков'), h('p', { class: 'ex-scoring' }, L(ex.scoring))) : null,
      ), { fold: `ex-${ex.id}`, count: mine.length });
    }));
}

/** Збори на полігон: скільки набоїв вимагають вибрані вправи і чи вистачає їх у БК. */
function planBox(cartridges, box) {
  const picked = new Set();
  const out = h('p', { class: 'muted small' });
  const stock = cartridges.reduce((s, c) => s + (c[2] || 0), 0);
  const update = () => {
    const need = [...picked].reduce((s, id) => s + (exById(id)?.shots || 0), 0);
    out.textContent = !need
      ? t('Отметьте упражнения — посчитаю, сколько патронов брать.')
      : [t('Нужно выстрелов: {n}', { n: fmt.num(need) }), t('в БК: {n}', { n: fmt.num(stock) }),
        need > stock ? t('не хватает {n}', { n: fmt.num(need - stock) }) : null].filter(Boolean).join(' · ');
  };
  const row = h('div', { class: 'chips' }, EXERCISES.filter((ex) => ex.shots).map((ex) => {
    const chip = h('button', {
      type: 'button',
      onclick: () => {
        if (picked.has(ex.id)) picked.delete(ex.id); else picked.add(ex.id);
        chip.classList.toggle('on', picked.has(ex.id));
        update();
      },
    }, `${L(ex.name)} · ${ex.shots}`);
    return chip;
  }));
  update();
  return box(t('Сборы на полигон'), h('div', {}, row, out, h('p', { class: 'muted small' }, L(TRIATHLON))), { fold: 'ex-plan' });
}

function scoreRow(ex, s, best, ctx) {
  const rank = rankOf(ex, s.score);
  const variant = ex.variants?.find(([k]) => k === s.variant)?.[1];
  const sub = [fmt.date(s.date), variant && L(variant), ctx.weapons.find(([id]) => id === s.weaponId)?.[1],
    s.time ? `${fmt.num(s.time)} ${t('с')}` : null, s.note].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'row', onclick: () => scoreCard(ex, s, ctx) },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, `${hitsOf(s)}/${ex.shots} ${t('попад.')}`, rank ? ` · ${L(rank)}` : '', s.score === best ? ' ★' : ''),
      h('span', { class: 'muted small' }, sub),
      best ? h('div', { class: 'bar' }, h('div', { class: `fill ${s.score === best ? '' : 'ap'}`, style: `width:${Math.max(4, (s.score / best) * 100)}%` })) : null),
    h('span', { class: 'tg-best' }, fmt.num(s.score)));
}

/** Картка результату: усе про нього й мішені поруч; видалення іконкою вгорі. */
function scoreCard(ex, s, ctx) {
  const rank = rankOf(ex, s.score);
  const cut = lateCut(ex, s);
  const kv = [
    [t('Дата'), fmt.date(s.date)],
    [t('Очки'), `${fmt.num(s.score)}${rank ? ` · ${L(rank)}` : ''}`],
    [t('Попаданий'), `${hitsOf(s)} / ${ex.shots}`],
    ...(ex.zones ?? []).map(([k, label]) => [L(label), fmt.num(s.hits?.[k] ?? 0)]),
    ...(cut ? [[t('Просрочка'), t('−{n} лучших попаданий', { n: cut })]] : []),
    ...(s.time ? [[t('Время'), `${fmt.num(s.time)} ${t('с')}`]] : []),
    ...(s.variant ? [[t('Вариант'), L(ex.variants?.find(([k]) => k === s.variant)?.[1] ?? s.variant)]] : []),
    ...(s.weaponId ? [[t('Оружие'), ctx.weapons.find(([id]) => id === s.weaponId)?.[1] ?? '—']] : []),
    ...(s.note ? [[t('Примечание'), s.note]] : []),
  ];
  const del = h('button', {
    type: 'button', class: 'icon-btn tool danger', 'aria-label': t('Удалить'),
    onclick: () => {
      close();
      confirmSheet(t('Удалить результат?'), `${L(ex.name)} · ${fmt.date(s.date)} · ${s.score}`, t('Удалить'), () => ctx.onDelete(s));
    },
  }, '🗑');
  const close = sheet(L(ex.name), h('div', {},
    h('dl', { class: 'kv' }, kv.map(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])),
    ctx.targetsOf?.(s) ?? null), { tools: [del] });
}

/** Свої пороги звань: «очки — назва», від вищого. Порожні рядки — повернути зашиті. */
function ranksSheet(ex) {
  const list = (ranksOf(ex) ?? []).map(([min, name]) => [min, L(name)]);
  const rows = h('div', { class: 'form' });
  const addRow = (min = '', name = '') => {
    const a = h('input', { type: 'number', min: 0, inputmode: 'numeric', 'aria-label': t('Очков'), value: min });
    const b = h('input', { type: 'text', 'aria-label': t('Звание'), value: name, placeholder: 'Marksman' });
    rows.append(
      h('label', { class: 'field half' }, h('span', { class: 'field-label' }, t('Очков')), a),
      h('label', { class: 'field half' }, h('span', { class: 'field-label' }, t('Звание')), b));
    return [a, b];
  };
  const inputs = list.map(([min, name]) => addRow(min, name));
  for (let i = list.length; i < 4; i++) inputs.push(addRow());
  const close = sheet(`${L(ex.name)} · ${t('Пороги званий')}`, h('div', {},
    h('p', { class: 'muted small' }, t('Свои пороги хранятся на этом устройстве и заменяют встроенные. Пустые строки — сбросить.')), rows), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), () => {
      const next = inputs.map(([a, b]) => [Math.round(Number(a.value) || 0), b.value.trim()])
        .filter(([, name]) => name).sort((x, y) => y[0] - x[0]);
      saveRanks(ex.id, next);
      close();
      toast(t('Сохранено'));
    }, 'primary')],
  });
}

/** Шторка запису: влучання по зонах, живий підсумок, списання з БК і збереження. */
function scoreSheet(ex, ctx) {
  let variant = ex.variants?.[0][0];
  const ammo = ctx.cartridges.map(([id, name, n]) => [id, t('{name} · ост. {n}', { name, n: fmt.num(n) })]);
  const fields = [
    { name: 'date', label: t('Дата'), type: 'dmy', value: M.today(), half: true },
    { name: 'weaponId', label: t('Оружие'), type: 'select', options: [['', '—'], ...ctx.weapons], half: true },
    ...ex.zones.map(([k, label, pts]) => ({ name: `hit_${k}`, label: `${L(label)} (${ex.perHit ? t('попаданий') : `× ${pts}`})`, type: 'number', min: 0, half: true })),
    ...(ex.time ? [{ name: 'time', label: t('Сумма времени, с'), type: 'number', step: 0.01, min: 0, half: true }] : []),
    ...(ex.perHit ? ex.zones.map(([k, label, pts]) => ({ name: `pts_${k}`, label: `${t('Очков за')} ${L(label)}`, type: 'number', value: pts, min: 0, half: true })) : []),
    ...(ex.late ? [{ name: 'late', label: t('Выстрелов после 30 с'), type: 'number', min: 0, value: 0, half: true }] : []),
    { name: 'cartridgeId', label: t('Списать из БК'), type: 'select', options: [['', t('не списывать')], ...ammo], half: true },
    { name: 'qty', label: t('Выстрелов, шт'), type: 'number', min: 0, value: ex.shots ?? '', half: true },
    { name: 'note', label: t('Примечание'), type: 'text', wide: true },
  ];
  const f = form(fields);
  const total = h('div', { class: 'stat-value' });
  const hint = h('p', { class: 'muted small' });
  let pricedByHand = false;
  // Час зі збереженої серії таймера: у вправах на час його й так міряють таймером.
  const timed = ctx.drills.filter((d) => d.shots?.length);
  if (ex.time && timed.length) {
    const pick = h('select', {
      class: 'inline-select', 'aria-label': t('Взять время из серии'),
      onchange: () => {
        const d = timed.find((x) => x.id === pick.value);
        if (!d) return;
        f.inputs.time.value = round2(sumTime(d));
        update();
      },
    }, [h('option', { value: '' }, t('— взять время из серии —')),
      ...timed.map((d) => h('option', { value: d.id }, `${fmt.date(d.date)} · ${d.shots.length} ${t('выстр.')} · ${fmt.num(round2(sumTime(d)))} ${t('с')}`))]);
    f.inputs.time.closest('.field').after(pick);
  }
  const record = () => {
    const v = f.values();
    const r = { exercise: ex.id, date: v.date, weaponId: v.weaponId || null, note: v.note, hits: {} };
    for (const [k] of ex.zones) r.hits[k] = Math.max(0, Math.round(v[`hit_${k}`] || 0));
    if (ex.perHit) r.pts = Object.fromEntries(ex.zones.map(([k, , pts]) => [k, v[`pts_${k}`] ?? pts]));
    if (ex.time) r.time = v.time;
    if (ex.late) r.late = Math.max(0, Math.round(v.late || 0));
    if (variant) r.variant = variant;
    r.score = scoreOf(ex, r);
    return r;
  };
  const update = () => {
    // Ціна влучання залежить від часу — підставляємо оцінку, поки її не виправили руками.
    if (ex.perHit && ex.whelan && !pricedByHand) {
      const time = Number(String(f.inputs.time.value).replace(',', '.')) || 0;
      if (time > 0) for (const [k, , pts] of ex.zones) f.inputs[`pts_${k}`].value = whelanPoints(time, pts);
    }
    const r = record();
    const rank = rankOf(ex, r.score);
    const cut = lateCut(ex, r);
    total.textContent = `${fmt.num(r.score)}${rank ? ` · ${L(rank)}` : ''}`;
    hint.textContent = [
      cut ? t('−{n} лучших попаданий', { n: cut }) : null,
      hitsOf(r) > ex.shots ? t('больше {n} выстрелов', { n: ex.shots }) : null,
      ex.whelan ? t('Цена попадания — оценка по времени, её можно исправить.') : null,
    ].filter(Boolean).join(' · ');
  };
  if (ex.perHit) for (const [k] of ex.zones) f.inputs[`pts_${k}`].addEventListener('input', () => { pricedByHand = true; });
  f.el.addEventListener('input', update);
  update();
  const close = sheet(L(ex.name), h('div', {},
    ex.variants ? chips(ex.variants.map(([k, label]) => [k, L(label)]), variant, (v) => { variant = v; }) : null,
    f.el,
    h('div', { class: 'stat accent' }, total, h('div', { class: 'muted small' }, t('Очки'))),
    hint), {
    actions: [btn(t('Отмена'), () => close()), btn(t('Сохранить'), () => {
      if (Number.isNaN(f.values().date)) { toast(t('Заполните поле «{label}»', { label: t('Дата') })); return; }
      const r = record();
      if (hitsOf(r) > ex.shots) { toast(t('больше {n} выстрелов', { n: ex.shots })); return; }
      const v = f.values();
      const qty = Math.max(0, Math.round(v.qty || 0));
      close();
      ctx.onSave(r, v.cartridgeId && qty ? { cartridgeId: v.cartridgeId, qty, note: L(ex.name) } : null);
    }, 'primary')],
  });
}
