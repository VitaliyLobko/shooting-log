// Перевірка перед публікацією: зламаний модуль кладе весь застосунок у всіх, хто оновився.
// Модулі розбираються й зв'язуються без виконання — ловить синтаксис і імпорт імені, якого немає.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

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
for (const path of ['sw.js', 'version.js']) {
  try { new vm.Script(read(path), { filename: path }); } catch (e) { errors.push(`${path}: ${e.message}`); }
}

// новий модуль, якого немає в кеші service worker'а, офлайн не завантажиться — і застосунок разом з ним
const assets = read('sw.js');
for (const file of readdirSync('js').filter((f) => f.endsWith('.js'))) {
  if (!assets.includes(`'./js/${file}'`)) errors.push(`sw.js: js/${file} немає в ASSETS — офлайн не завантажиться`);
}

for (const path of ['demo.json', 'manifest.webmanifest']) {
  try { JSON.parse(read(path)); } catch (e) { errors.push(`${path}: ${e.message}`); }
}

// кожен реліз — запис у «Що нового» обома мовами
const self = {};
vm.runInNewContext(read('version.js'), { self });
try {
  const changelog = load('js/changelog.js');
  await changelog.evaluate();
  const [top] = changelog.namespace.CHANGES;
  if (top?.v !== self.APP_VERSION) errors.push(`js/changelog.js: немає запису для ${self.APP_VERSION} (зверху ${top?.v})`);
  else if (!top.uk?.length || top.uk.length !== top.ru?.length) errors.push(`js/changelog.js: ${top.v} — uk і ru мають бути з однаковою кількістю пунктів`);
} catch (e) {
  errors.push(`js/changelog.js: ${e.message}`);
}

if (errors.length) {
  // ::error:: — GitHub показує текст помилки прямо на сторінці запуску
  console.error(errors.map((e) => (process.env.GITHUB_ACTIONS ? `::error::${e}` : e)).join('\n'));
  process.exit(1);
}
console.log(`ok: ${modules.size} модулів, версія ${self.APP_VERSION}`);
