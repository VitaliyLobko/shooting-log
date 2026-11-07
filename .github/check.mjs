// Перевірка перед публікацією: зламаний модуль кладе весь застосунок у всіх, хто оновився.
// Модулі розбираються й зв'язуються без виконання — ловить синтаксис і імпорт імені, якого немає.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { mediaJs } from './media.mjs';

const errors = [];
const read = (path) => readFileSync(path, 'utf8');

const modules = new Map();
function load(path) {
  if (!modules.has(path)) modules.set(path, new vm.SourceTextModule(read(path), { identifier: path }));
  return modules.get(path);
}
const resolve = (spec, from) => new URL(spec, `file:///${from.identifier}`).pathname.slice(1);

for (const file of readdirSync('js').filter((f) => f.endsWith('.js')).sort()) {
  const path = `js/${file}`;
  try {
    const mod = load(path);
    if (mod.status === 'unlinked') await mod.link((spec, from) => load(resolve(spec, from)));
  } catch (e) {
    errors.push(`${path}: ${e.message}`);
  }
}

// звичайні скрипти service worker'а
for (const path of ['sw.js', 'version.js', 'media.js']) {
  try { new vm.Script(read(path), { filename: path }); } catch (e) { errors.push(`${path}: ${e.message}`); }
}

// новий модуль, якого немає в кеші service worker'а, офлайн не завантажиться — і застосунок разом з ним
const assets = read('sw.js');
for (const file of readdirSync('js').filter((f) => f.endsWith('.js'))) {
  if (!assets.includes(`'./js/${file}'`)) errors.push(`sw.js: js/${file} немає в ASSETS — офлайн не завантажиться`);
}
// і навпаки: файл з ASSETS, якого нема, валить установку кешу цілком (addAll — все або нічого)
for (const [, path] of assets.matchAll(/'\.\/([^']+)'/g)) {
  if (!existsSync(path)) errors.push(`sw.js: ${path} є в ASSETS, але файлу немає — офлайн-копія не встановиться`);
}

// картинки качаються заново лише за зміненим відбитком: застарілий media.js — і нова картинка не дійде до тих, хто оновився
try {
  if (read('media.js').replace(/\r\n/g, '\n') !== mediaJs()) errors.push('media.js застарів (змінились картинки в ASSETS) — запусти node .github/media.mjs');
} catch (e) {
  errors.push(`media.js: ${e.message}`);
}

for (const path of ['demo.json', 'manifest.webmanifest']) {
  try { JSON.parse(read(path)); } catch (e) { errors.push(`${path}: ${e.message}`); }
}

// Інтерфейс український: літер ы э ъ ё в українській немає — це залишок російського тексту.
// Свідомий виняток (розбір того, що ввела людина) позначається коментарем i18n-ok.
for (const path of [...readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => `js/${f}`), 'index.html', 'demo.json']) {
  read(path).split('\n').forEach((line, i) => {
    if (/[ыэъёЫЭЪЁ]/.test(line) && !line.includes('i18n-ok')) errors.push(`${path}:${i + 1}: російський текст — ${line.trim().slice(0, 80)}`);
  });
}

// CSS-анімації: кожна названа анімація має @keyframes, і жодних двох @keyframes з одним ім'ям —
// інакше елемент з opacity: 0 тихо не з'являється (так у 0.7.102 зникли іскри чотирьох сценок)
{
  const css = read('css/app.css');
  const KW = new Set(['none', 'both', 'forwards', 'backwards', 'infinite', 'alternate', 'alternate-reverse', 'reverse', 'normal',
    'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'paused', 'running', 'step-start', 'step-end', 'jump-none', 'jump-start', 'jump-end', 'jump-both', 'start', 'end']);
  const defined = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
  const twice = defined.filter((n, i) => defined.indexOf(n) !== i);
  if (twice.length) errors.push(`css/app.css: @keyframes двічі — ${[...new Set(twice)].join(', ')}`);
  const used = new Set();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const tok of m[1].replace(/[\w-]+\([^)]*\)/g, '').split(/[\s,]+/)) if (/^[a-z][\w-]*$/.test(tok) && !KW.has(tok)) used.add(tok);
  }
  const missing = [...used].filter((n) => !defined.includes(n));
  if (missing.length) errors.push(`css/app.css: анімація без @keyframes — ${missing.join(', ')}`);
}

// кожен реліз — запис у «Що нового» обома мовами
const self = {};
vm.runInNewContext(read('version.js'), { self });
try {
  const changelog = load('js/changelog.js');
  await changelog.evaluate();
  const [top] = changelog.namespace.CHANGES;
  if (top?.v !== self.APP_VERSION) errors.push(`js/changelog.js: немає запису для ${self.APP_VERSION} (зверху ${top?.v})`);
  else if (!top.uk?.length || top.ru) errors.push(`js/changelog.js: ${top.v} — потрібні пункти uk (ru більше не пишемо)`);
} catch (e) {
  errors.push(`js/changelog.js: ${e.message}`);
}

if (errors.length) {
  // ::error:: — GitHub показує текст помилки прямо на сторінці запуску
  console.error(errors.map((e) => (process.env.GITHUB_ACTIONS ? `::error::${e}` : e)).join('\n'));
  process.exit(1);
}
console.log(`ok: ${modules.size} модулів, версія ${self.APP_VERSION}`);
