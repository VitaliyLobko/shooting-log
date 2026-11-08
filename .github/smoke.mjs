// Димова перевірка перед випуском: справжній Chrome без вікна відкриває застосунок на чистому профілі,
// вантажить демо-дані, проходить тур, усі вкладки й розділи, «+» у кожному, і те саме з вимкненими розділами.
// Падає, якщо була хоч одна помилка JS або порожній екран. Запуск: node .github/smoke.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';

const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!CHROME) { console.error('Chrome не знайдено (змінна CHROME)'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
  if (!path || path.endsWith('/') || path.endsWith('\\')) path += 'index.html';
  try { res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profile = await mkdtemp(join(tmpdir(), 'sl-smoke-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--window-size=412,900', '--lang=uk', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, fail) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) ok(m[0]); });
  setTimeout(() => fail(new Error('Chrome не стартував')), 20000);
});

// --- мінімальний CDP-клієнт ---
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) { const { ok, fail } = pending.get(msg.id); pending.delete(msg.id); msg.error ? fail(new Error(msg.error.message)) : ok(msg.result); }
  else listeners.forEach((f) => f(msg));
});
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
  const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, sessionId);
const errors = [];
let step = 'старт';
listeners.push((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Runtime.exceptionThrown') errors.push(`[${step}] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`[${step}] console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  // navigator.vibrate без справжнього дотику Chrome блокує й пише в журнал — це не помилка застосунку
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url ?? '') && !/navigator\.vibrate/.test(m.params.entry.text)) errors.push(`[${step}] ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
});
await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 900, deviceScaleFactor: 1, mobile: true });
// Святкова сценка при запуску (печиво ≈ 1 з 6) перекрила б екран — смоук перевіряє застосунок, не сценки
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `new MutationObserver(() => document.querySelectorAll('.scene').forEach((s) => s.remove())).observe(document, { childList: true, subtree: true });` });

const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`[${step}] ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (expr, ms = 8000) => { for (let t = 0; t < ms; t += 150) { if (await js(`return !!(${expr})`)) return true; await sleep(150); } return false; };
// натиснути кнопку за текстом (у відкритій шторці — насамперед)
const click = (re) => js(`const re = ${re}; const b = [...document.querySelectorAll('button, a, summary, [role=button]')].reverse()
  .find((e) => e.offsetParent !== null && re.test(e.textContent.trim())); b?.click(); return !!b;`);
const sheetOpen = () => js(`return !!document.querySelector('#layer > *')`);
const closeSheets = async () => { for (let i = 0; i < 5 && await sheetOpen(); i++) { await js('history.back()'); await sleep(400); } };
// Порожній — якщо й за 3 с нічого не намалювалось: після перезавантаження вкладка малюється не одразу
const blank = async () => !await until(`document.querySelector('main, #app')?.innerText.trim().length >= 5`, 3000);
const checks = [];
const check = (ok, what) => { checks.push(`${ok ? '✓' : '✗'} ${what}`); if (!ok) errors.push(`[${step}] не вийшло: ${what}`); };

try {
  step = 'запуск';
  await cdp('Page.navigate', { url: base });
  check(await until(`document.querySelector('.tabbar, nav')`), 'застосунок завантажився');

  step = 'демо-дані';
  check(await until(`[...document.querySelectorAll('button')].some((b) => /на прикладі/i.test(b.textContent))`), 'вітання на чистому профілі');
  await click('/на прикладі/i');

  step = 'тур застосунком';
  check(await until(`document.querySelector('.tour-pop, .tour-tip, .tour-card')`, 15000), 'тур почався');
  let steps = 0;
  for (; steps < 40 && await js(`return !!document.querySelector('.tour-pop, .tour-tip, .tour-card')`); steps++) {
    if (!await click('/^(Далі|Далее|Зрозуміло|Понятно|Готово)$/')) break;
    await sleep(700);
  }
  check(steps > 3, `тур пройдено (${steps} кроків)`);
  await closeSheets();

  const TABS = { ammo: 'Склад', guns: 'Арсенал', log: 'Журнал', targets: 'Полігон', settings: 'Налаштування' };
  const tour = async (label) => {
    for (const [hash, name] of Object.entries(TABS)) {
      step = `${label}: ${name}`;
      await js(`location.hash = '#${hash}'`); await sleep(500);
      check(!await blank(), `${name} не порожній`);
      const segs = await js(`return [...document.querySelectorAll('.seg-nav button')].map((b) => b.textContent.trim())`);
      for (const [i, seg] of (segs.length ? segs : ['']).entries()) {
        step = `${label}: ${name}${seg ? ' → ' + seg : ''}`;
        if (seg) { await js(`document.querySelectorAll('.seg-nav button')[${i}].click()`); await sleep(500); }
        check(!await blank(), `${step} не порожній`);
        // «+» відкриває шторку чи меню, і воно закривається
        if (await js(`const f = document.querySelector('.fab'); f?.click(); return !!f`)) {
          await sleep(500); await closeSheets();
        }
      }
    }
  };
  await tour('демо');

  // Правка без змін нічого не губить: відкрити запис демо, «Зберегти», порівняти з тим, що було.
  // Порожнє (null, '', false, 0, [], {}) і час зміни не рахуємо — форма може дописати їх сама.
  const strip = (v) => {
    if (Array.isArray(v)) { const a = v.map(strip).filter((x) => x !== undefined); return a.length ? a : undefined; }
    if (v && typeof v === 'object') {
      const o = Object.fromEntries(Object.entries(v).filter(([k]) => !['updated', 'modified'].includes(k)).map(([k, x]) => [k, strip(x)]).filter(([, x]) => x !== undefined));
      return Object.keys(o).length ? o : undefined;
    }
    return v === null || v === '' || v === false || v === 0 ? undefined : v;
  };
  const flat = (o, p = '') => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [[p, JSON.stringify(o)]]);
  const diff = (a, b) => {
    const A = new Map(flat(strip(a))); const B = new Map(flat(strip(b)));
    return [...new Set([...A.keys(), ...B.keys()])].filter((k) => A.get(k) !== B.get(k)).map((k) => `${k}: ${A.get(k) ?? '—'} → ${B.get(k) ?? '—'}`);
  };
  const store = (name) => js(`return (await (await import('/js/db.js')).loadAll()).${name}`);
  const unfold = () => js(`document.querySelectorAll('main details:not([open]) > summary').forEach((s) => s.click()); await new Promise((r) => setTimeout(r, 400));`);
  // Картка зі свайпом відкривається лише справжнім дотиком або Enter — тиснемо Enter
  const tapIn = (sel) => js(`const e = [...document.querySelectorAll(${JSON.stringify(sel)})].pop(); e?.scrollIntoView();
    if (e?.classList.contains('swipe')) e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); else e?.click(); return !!e`);
  const tapText = (text) => js(`const s = document.querySelector('#layer > :last-child'); if (!s) return false; const e = [...s.querySelectorAll('.row-title, .mount-name, .price-name, b, span')]
    .find((x) => x.textContent.trim() === ${JSON.stringify(text)}); (e?.closest('button, .row') ?? e)?.click(); return !!e`);
  const editAndSave = async () => {
    await sleep(600);
    if (!await tapIn('#layer > :last-child [aria-label="Змінити"]')) return 'нема олівця «Змінити»';
    await sleep(700);
    if (!await tapIn('#layer > :last-child .btn.primary')) return 'нема «Зберегти»';
    await sleep(900);
    // Форма лишилась відкритою — збереження не пройшло (помилка в полі)
    const stuck = await js(`const s = document.querySelector('#layer > :last-child'); const b = s?.querySelector('.btn.primary');
      return b && /Зберегти|Сохранить/.test(b.textContent) ? [...s.querySelectorAll('.field-error, .form-error')].map((e) => e.textContent).join(' | ') || 'форма не закрилась' : null`);
    return stuck ? `не збереглось: ${stuck}` : null;
  };
  // Запис справді перезаписано — інакше «нічого не змінилось» нічого не доводить
  const saved = (before, after) => (after?.updated && after.updated !== before.updated ? [] : ['запис не перезаписано']);
  const richest = (list, n) => [...list].filter((x) => !x.archived).sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length).slice(0, n);
  const ROUNDTRIP = [
    ['weapons', 'guns', 'guns', 3], ['cartridges', 'ammo', 'ammo', 3], ['components', 'ammo', 'components', 2], ['recipes', 'ammo', 'recipes', 2],
    ['targets', 'targets', 'targets', 3], ['chrono', 'targets', 'chrono', 2], ['gear', 'guns', 'gear', 2],
  ];
  for (const [name, hash, seg, n] of ROUNDTRIP) {
    for (const rec of richest(await store(name), n)) {
      step = `правка без змін: ${name} «${rec.name ?? rec.id}»`;
      await closeSheets();
      await js(`location.hash = '#${hash}'`); await sleep(400);
      await js(`document.querySelector('.seg-nav [data-seg="${seg}"]')?.click()`); await sleep(400);
      await unfold();
      const opened = name === 'gear' ? await js(`const e = [...document.querySelectorAll('main .row-title, main .price-name, main b')].find((x) => x.textContent.trim() === ${JSON.stringify(rec.name)});
        (e?.closest('button, .row') ?? e)?.click(); return !!e`) : await tapIn(`main [data-id="${rec.id}"]`);
      const fail = opened ? await editAndSave() : 'запис не знайдено в списку';
      const after = (await store(name)).find((x) => x.id === rec.id);
      const d = fail ? [fail] : [...saved(rec, after), ...diff(rec, after)];
      check(!d.length, `${step}${d.length ? ` — ${d.join('; ')}` : ''}`);
    }
  }
  // Тюнінг живе в стволі: картка ствола → рядок тюнінгу → олівець
  for (const w of (await store('weapons')).filter((x) => x.mods?.length)) {
    const mod = richest(w.mods, 1)[0];
    step = `правка без змін: тюнінг «${mod.name}» (${w.name})`;
    await closeSheets();
    await js(`location.hash = '#guns'`); await sleep(400);
    await js(`document.querySelector('.seg-nav [data-seg="guns"]')?.click()`); await sleep(400);
    await tapIn(`main [data-id="${w.id}"]`); await sleep(700);
    await js(`document.querySelectorAll('#layer > :last-child .box.closed').forEach((b) => b.classList.remove('closed'))`);
    const fail = await tapText(mod.name) ? await editAndSave() : 'тюнінг не знайдено в картці';
    const after = (await store('weapons')).find((x) => x.id === w.id);
    const d = fail ? [fail] : [...saved(w, after), ...diff(w, after)];
    check(!d.length, `${step}${d.length ? ` — ${d.join('; ')}` : ''}`);
  }
  await closeSheets();

  step = 'пристрілка з Мішеней';
  await js(`location.hash = '#targets'`); await sleep(400);
  await js(`[...document.querySelectorAll('.seg-nav button')].find((b) => /Мішені/.test(b.textContent))?.click()`); await sleep(400);
  check(await js(`const b = document.querySelector('.zero-start'); b?.click(); return !!b`), 'кнопка «Пристрілка» в Мішенях');
  await sleep(500);
  await js(`document.querySelector('#layer .rows .row')?.click()`);
  check(await until(`/Пристрілка ·/.test(document.querySelector('#layer')?.innerText ?? '')`), 'майстер відкрився з вибору прицілу');
  await closeSheets();

  // Резервна копія туди-назад: файл містить усю базу, «Об’єднати» не відкочує пізніших правок і не воскрешає
  // видаленого, «Замінити все» повертає рівно файл, чужий і битий файл не приймаються.
  step = 'резервна копія';
  await closeSheets();
  const dl = await mkdtemp(join(tmpdir(), 'sl-backup-'));
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await js(`location.hash = '#settings'`); await sleep(500);
  const backupRow = `[...document.querySelectorAll('.set-row')].find((r) => /Резервна копія/.test(r.querySelector('.set-title')?.textContent))`;
  check(await js(`const r = ${backupRow}; if (r && !r.classList.contains('open')) r.querySelector('.set-head').click(); return !!r`), 'рядок «Резервна копія»');
  await sleep(500);
  const all = async () => js(`return (await import('/js/db.js')).loadAll()`);
  const noStamp = (list) => JSON.stringify((list ?? []).map(({ updated, ...x }) => x).sort((a, b) => String(a.id).localeCompare(String(b.id))));
  const db0 = await all();
  await click('/^Завантажити файл$/');
  let file = null;
  for (let i = 0; i < 40 && !file; i++) { await sleep(250); file = (await readdir(dl)).find((f) => f.endsWith('.json')); }
  check(!!file, 'копія завантажилась файлом');
  const backup = file ? JSON.parse(await readFile(join(dl, file), 'utf8')) : {};
  const lost = Object.keys(db0).filter((k) => JSON.stringify(db0[k]) !== JSON.stringify(backup.data?.[k]));
  check(backup.app === 'shooters-log' && !lost.length, `у файлі вся база${lost.length ? ` — різниться: ${lost.join(', ')}` : ''}`);

  // Після копії: ствол перейменовано, одну стрільбу видалено — обидві зміни новіші за файл
  const w0 = db0.weapons[0]; const shot0 = db0.movements.find((m) => m.kind === 'shot');
  await js(`const db = await import('/js/db.js'); const w = (await db.loadAll()).weapons.find((x) => x.id === ${JSON.stringify(w0.id)});
    await db.write({ weapons: { put: [{ ...w, name: w.name + ' (змінено)' }] }, movements: { del: [${JSON.stringify(shot0.id)}] } })`);
  const upload = async (path) => {
    await js(`const r = ${backupRow}; r.querySelector('input[type=file]').id = 'bk-file'`);
    const { root } = await cdp('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#bk-file' });
    await cdp('DOM.setFileInputFiles', { nodeId, files: [path] });
  };
  const toastIs = (re) => until(`${re}.test(document.querySelector('.toast')?.textContent ?? '')`);
  await upload(join(dl, file));
  check(await until(`/У файлі записів/.test(document.querySelector('#layer')?.innerText ?? '')`), 'шторка імпорту з кількістю записів');
  await click('/^Об’єднати$/');
  check(await toastIs('/Імпортовано/'), '«Об’єднати» виконано');
  const merged = await all();
  check(merged.weapons.find((x) => x.id === w0.id)?.name === `${w0.name} (змінено)`, '«Об’єднати» не відкотило пізнішу правку');
  check(!merged.movements.some((m) => m.id === shot0.id), '«Об’єднати» не воскресило видалене');
  check(merged.movements.length === db0.movements.length - 1 && merged.weapons.length === db0.weapons.length, '«Об’єднати» нічого не загубило');

  await upload(join(dl, file));
  await until(`/У файлі записів/.test(document.querySelector('#layer')?.innerText ?? '')`);
  await click('/^Замінити все$/'); await sleep(500);
  await click('/^Замінити$/');
  check(await toastIs('/Дані замінено/'), '«Замінити все» виконано');
  const replaced = await all();
  const off = Object.keys(backup.data ?? {}).filter((k) => k !== 'tombstones' && noStamp(replaced[k]) !== noStamp(backup.data[k]));
  check(!off.length, `після «Замінити все» база = файл${off.length ? ` — різниться: ${off.join(', ')}` : ''}`);

  const bad = join(dl, 'bad.json'); const foreign = join(dl, 'foreign.json');
  await writeFile(bad, '{ це не json'); await writeFile(foreign, JSON.stringify({ app: 'other', data: { weapons: [] } }));
  await upload(bad);
  check(await toastIs('/не схожий на JSON/'), 'битий файл — «Файл не схожий на JSON»');
  await upload(foreign);
  check(await toastIs('/не резервна копія/'), 'чужий файл — «Це не резервна копія»');
  check(noStamp((await all()).weapons) === noStamp(backup.data?.weapons), 'відхилені файли базу не змінили');
  await rm(dl, { recursive: true, force: true }).catch(() => {});
  await closeSheets();

  // Облік через інтерфейс: стрільба списує набої й додає настріл, «Скасувати» прибирає запис, правка кількості
  // перераховує залишок і вартість, видалення лишає надгробок, «Скасувати» повертає запис як був.
  step = 'облік через інтерфейс';
  const tally = (cid, wid) => js(`const M = await import('/js/model.js'); const s = (await import('/js/db.js')).loadAll();
    const st = await s; const w = st.weapons.find((x) => x.id === ${JSON.stringify(wid)});
    return { stock: M.cartridgeStock(st, ${JSON.stringify(cid)}), shots: M.weaponShots(st, w), unit: M.cartridgeUnitCost(st, ${JSON.stringify(cid)}) }`);
  const undo = () => tapIn('.undo-btn:not([hidden])');
  const gun = (await store('weapons')).filter((w) => !w.archived)
    .map((w) => ({ w, n: (replaced.movements ?? []).filter((m) => m.weaponId === w.id && m.kind === 'shot').length }))
    .sort((a, b) => b.n - a.n)[0]?.w;
  const shoot = async (qty) => {
    await closeSheets();
    await js(`location.hash = '#guns'`); await sleep(400);
    await js(`document.querySelector('.seg-nav [data-seg="guns"]')?.click()`); await sleep(400);
    await tapIn(`main [data-id="${gun.id}"]`); await sleep(700);
    if (!await click('/^Записати стрільбу$/')) return null;
    await sleep(600);
    const cid = await js(`const s = document.querySelector('#layer > :last-child select[name=cartridgeId]');
      if (s && !s.value) { s.value = [...s.options].find((o) => o.value)?.value ?? ''; s.dispatchEvent(new Event('change', { bubbles: true })); }
      const q = document.querySelector('#layer > :last-child input[name=qty]'); q.value = '${qty}'; q.dispatchEvent(new Event('input', { bubbles: true }));
      return s?.value || null`);
    return cid;
  };
  const shotsNow = async () => (await store('movements')).filter((m) => m.kind === 'shot' && m.weaponId === gun.id);
  check(!!gun, 'ствол для стрільби в демо');
  const before = await shotsNow();
  const cid = await shoot(7);
  check(!!cid, 'шторка «Записати стрільбу» з набоєм');
  const t0 = await tally(cid, gun.id);
  await click('/^Записати$/');
  check(await until(`!document.querySelector('#layer select[name=cartridgeId]')`), 'стрільбу записано, шторка закрилась');
  await sleep(400);
  let fresh = (await shotsNow()).filter((m) => !before.some((b) => b.id === m.id));
  let t1 = await tally(cid, gun.id);
  check(fresh.length === 1 && fresh[0].qty === -7 && fresh[0].cartridgeId === cid, 'рух стрільби −7 із вибраним набоєм');
  check(t1.stock === t0.stock - 7 && t1.shots === t0.shots + 7, `залишок −7 і настріл +7 (було ${t0.stock}/${t0.shots}, стало ${t1.stock}/${t1.shots})`);
  check(!t0.unit || fresh[0]?.price === +(t0.unit * 7).toFixed(2), `вартість = ціна за шт × 7 (${fresh[0]?.price})`);
  check(await undo(), 'кнопка «Скасувати» після запису');
  await sleep(500);
  t1 = await tally(cid, gun.id);
  check((await shotsNow()).length === before.length && t1.stock === t0.stock && t1.shots === t0.shots, '«Скасувати» прибрало стрільбу, залишок як був');

  await shoot(7);
  await click('/^Записати$/'); await sleep(900);
  fresh = (await shotsNow()).filter((m) => !before.some((b) => b.id === m.id));
  const shot = fresh[0];
  check(fresh.length === 1, 'стрільбу записано вдруге');
  await closeSheets();
  await js(`location.hash = '#log'`); await sleep(600);
  // Рядки групи малюються, лише коли вона розгорнута; свіжа група — перша
  await js(`const d = document.querySelector('main details.fold'); if (d) d.open = true`); await sleep(500);
  check(await tapIn(`main .row[data-id="${shot?.id}"]`), 'стрільба є в журналі');
  await sleep(600);
  await tapIn('#layer > :last-child [aria-label="Змінити"]'); await sleep(500);
  check(await js(`const q = [...document.querySelectorAll('#layer > :last-child input[aria-label="Кількість"]')].pop();
    if (!q) return false; q.value = '12'; q.dispatchEvent(new Event('change', { bubbles: true })); return true`), 'поле кількості в правці');
  await sleep(700);
  const edited = (await store('movements')).find((m) => m.id === shot?.id);
  t1 = await tally(cid, gun.id);
  check(edited?.qty === -12 && t1.stock === t0.stock - 12 && t1.shots === t0.shots + 12, `правка 7 → 12: залишок і настріл перераховано (${t1.stock}/${t1.shots})`);
  check(!shot?.price || edited?.price === +((shot.price * 12) / 7).toFixed(2), `вартість перераховано на 12 (${shot?.price} → ${edited?.price})`);

  await tapIn('#layer > :last-child [aria-label="Видалити запис"]'); await sleep(500);
  await click('/^Видалити$/'); await sleep(700);
  t1 = await tally(cid, gun.id);
  const graves = await store('tombstones');
  check(!(await store('movements')).some((m) => m.id === shot?.id) && t1.stock === t0.stock && t1.shots === t0.shots, 'видалення: залишок і настріл як до стрільби');
  check(graves.some((g) => g.id === shot?.id), 'видалення лишило надгробок для синхронізації');
  check(await undo(), 'кнопка «Скасувати» після видалення');
  await sleep(600);
  const back = (await store('movements')).find((m) => m.id === shot?.id);
  t1 = await tally(cid, gun.id);
  check(JSON.stringify({ ...back, updated: 0 }) === JSON.stringify({ ...edited, updated: 0 }) && t1.stock === t0.stock - 12,
    '«Скасувати» повернуло запис як був (12 пострілів)');
  // Надгробок лишається, але повернутий запис новіший — злиття синхронізації залишить запис
  const grave = (await store('tombstones')).find((g) => g.id === shot?.id);
  check(!grave || back?.updated > grave.updated, 'повернутий запис новіший за свій надгробок');
  await closeSheets();

  // Тренажер: точне прицілювання в точку прицілювання — у зоні ураження для кожної цілі й кожного бійця сцен
  // (зони, маски з кадру), три зрости вбік — мимо; серія «Винос»: поправка на екрані — з таблиці, «Перевірити»
  // без виносу дає помилку рівно на поправку, а вердикт — той, що й hitBand.
  step = 'тренажер: зони ураження';
  const zones = await js(`const G = await import('/js/guide.js'); const bad = []; let n = 0; const H = 10;
    const probe = (key, fig, zone, want, ex = 0, ey = 0, flip = false) => { n++; const got = G.hitBand(key, ex, ey, H, flip, fig, zone);
      if (got !== want) bad.push(\`\${fig?.id ?? key}/\${zone} (\${ex}, \${ey}\${flip ? ', дзеркально' : ''}): \${got} замість \${want}\`); };
    for (const key of Object.keys(G.TGT)) for (const zone of ['chest', 'head', 'torso']) {
      if (zone === 'head' && !G.zonesOf(key).head) continue;
      probe(key, null, zone, 'zone'); probe(key, null, zone, 'zone', 0, 0, true); probe(key, null, zone, 'miss', 3 * H, 0);
    }
    // Людина: нога й голова — у ціль, але не в груди; поруч із плечем — мимо
    probe('man', null, 'chest', 'body', 0.05 * H, 0.6 * H); probe('man', null, 'chest', 'body', 0, -0.23 * H); probe('man', null, 'chest', 'miss', 0.3 * H, 0);
    for (const sc of Object.values(G.SCENES)) for (const fig of sc.figs) for (const zone of ['chest', 'head']) {
      const z = G.zonesOf(fig[0], fig); if (zone === 'head' ? !z.head : !z.body) continue;
      probe(fig[0], fig, zone, 'zone'); probe(fig[0], fig, zone, 'miss', 3 * H, 0);
    }
    return { n, bad }`);
  check(zones.n > 60 && !zones.bad.length, `влучання в точку прицілювання — у зоні, далеко — мимо (${zones.n} перевірок)${zones.bad.length ? ` — ${zones.bad.slice(0, 6).join('; ')}` : ''}`);

  step = 'тренажер: серія «Винос»';
  await js(`location.hash = '#targets'`); await sleep(500);
  await js(`document.querySelector('.seg-nav [data-seg="sim"]')?.click()`);
  check(await until(`document.getElementById('sim-svg')`, 15000), 'тренажер відкрився');
  await sleep(800); await closeSheets();
  await js(`let s = 7; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (const [id, v] of [['s-kit', 'm855'], ['s-zero', '100'], ['s-temp', '15'], ['s-alt', '0'], ['s-barrel', '915'], ['s-disp', '0']]) {
      const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); } }`);
  await sleep(300);
  const quizBtn = (re) => js(`const b = [...document.querySelectorAll('.quiz-box button')].find((x) => ${re}.test(x.textContent.trim())); b?.click(); return !!b`);
  check(await quizBtn('/^Винос/') && (await sleep(300), await quizBtn('/^Навчання/')) && (await sleep(300), await quizBtn('/^Почати серію/')), 'Винос → Навчання → Почати серію');
  await sleep(800);
  for (let i = 0; i < 3; i++) {
    const task = await js(`const tx = document.querySelector('.quiz-box')?.innerText ?? '';
      const d = Number(tx.match(/Дистанція (\\d{2,3})/)?.[1]); const hold = /Поправки немає/.test(tx) ? 0 : Number(tx.match(/Поправка\\s*([↑↓])\\s*([\\d,]+)/)?.slice(1).map((x, j) => j ? x.replace(',', '.') : x === '↑' ? 1 : -1).reduce((a, b) => a * b));
      const tgt = Object.entries((await import('/js/guide.js')).TGT).find(([, v]) => tx.includes(v.short))?.[0];
      return { d, hold, tgt }`);
    const want = await js(`const G = await import('/js/guide.js'); return G.holdAt(G.LOADS.m855.H['915'], ${task.d})`);
    check(Number.isFinite(task.hold) && Math.abs(task.hold - want) <= 0.011, `${i + 1}-а ціль: ${task.d} м, поправка ${task.hold} = таблиця ${want?.toFixed(2)} MRAD`);
    check(await js(`const b = [...document.querySelectorAll('.quiz-box button')].find((x) => x.title === 'Перевірити'); b?.click(); return !!b`), `${i + 1}-а ціль: «Перевірити»`);
    await until(`document.querySelector('.quiz-res')`, 3000);
    const res = await js(`const r = document.querySelector('.quiz-res'); const tx = r?.innerText ?? '';
      return { tx, e: Number(tx.match(/([\\d,]+) MRAD/)?.[1]?.replace(',', '.')), cm: Number(tx.match(/(\\d+) см на цілі/)?.[1]), cls: r?.className }`);
    const band = await js(`const G = await import('/js/guide.js'); const fig = null;
      return G.hitBand(${JSON.stringify(task.tgt)}, 0, ${task.hold}, G.TGT[${JSON.stringify(task.tgt)}].h * 1000 / ${task.d}, false, fig, 'torso')`); // «Навчання» — зона «увесь торс»
    const BAND = { zone: 'good', body: 'ok', miss: 'bad' };
    check(Math.abs(res.e - Math.abs(task.hold)) <= 0.011 && Math.abs(res.cm - Math.abs(task.hold) * task.d / 10) <= 1,
      `${i + 1}-а ціль без виносу: помилка ${res.e} MRAD · ${res.cm} см = поправка`);
    check(res.cls?.includes(BAND[band]), `${i + 1}-а ціль (${task.tgt}, ${task.d} м, ${task.hold}): вердикт «${res.tx.split('\n')[0]}» = hitBand ${band}`);
    if (!await quizBtn('/^Далі/')) break;
    await sleep(600);
  }
  await closeSheets();

  // Своя таблиця DOPE з погодою (+12 °C) і набоєм з BC: «Тренувати в тренажері» відкриває її на її погоді (+12 — окремим
  // пунктом), температура й висота ввімкнені, ствол — ні; інша погода — перераховано, як у «Поправки зараз»;
  // «Зараз тут» ставить погоду за GPS (геолокація й Open-Meteo підмінені — без мережі)
  step = 'тренажер: своя таблиця DOPE';
  const dopeId = await js(`const db = await import('/js/db.js'); const all = await db.loadAll();
    const w = all.weapons.find((x) => /Zion/.test(x.name)); const c = all.cartridges.find((x) => /M855/.test(x.name));
    const d = { id: 'dope-smoke', scopeId: w.scopes[0].id, cartridgeId: c.id, cond: { tC: 12, alt: 0 },
      rows: [[100, 0], [200, 0.8], [300, 1.9], [400, 3.2], [500, 4.8], [600, 6.6]].map(([distance, mrad]) => ({ distance, mrad })) };
    await db.write({ cartridges: { put: [{ ...c, bc: 0.151, dragModel: 'G7', mv: 915 }] }, weapons: { put: [{ ...w, dope: [...(w.dope ?? []), d] }] } });
    return { w: w.id, d: d.id }`);
  // Запис повз застосунок — він перечитає базу лише після перезавантаження
  await js(`location.hash = '#guns'`);
  await cdp('Page.reload'); await until(`document.querySelector('.tabbar, nav')`); await sleep(1000);
  await js(`document.querySelector('.seg-nav [data-seg="guns"]')?.click()`); await sleep(400);
  await tapIn(`main [data-id="${dopeId.w}"]`); await sleep(700);
  // Блок DOPE і сама таблиця згорнуті, а вміст згорнутої таблиці малюється, лише коли її розгорнули
  await js(`const b = [...document.querySelectorAll('#layer > :last-child .box.foldable')].find((x) => /^›?DOPE/.test(x.querySelector('.box-toggle')?.textContent ?? ''));
    if (b && !b.querySelector('details')) b.querySelector('.box-toggle').click()`);
  await sleep(500);
  await js(`document.querySelectorAll('#layer > :last-child details.fold').forEach((d) => { if (d.dataset.key?.startsWith('dope-t:')) d.open = true; })`);
  await sleep(500);
  check(await js(`const b = [...document.querySelectorAll('#layer [aria-label="Тренувати в тренажері"]')].pop(); b?.click(); return !!b`), 'кнопка «Тренувати в тренажері» на таблиці');
  check(await until(`document.getElementById('sim-svg')`, 15000), 'тренажер відкрився з таблиці');
  await sleep(800);
  const sim = () => js(`const $ = (id) => document.getElementById(id);
    return { kit: $('s-kit').value, temp: $('s-temp').value, alt: $('s-alt').value, tOff: $('s-temp').disabled, bOff: $('s-barrel').disabled,
      here: $('s-here') ? !$('s-here').disabled : null, text: document.querySelector('.guide')?.textContent ?? '' }`);
  // Підказка — у подробицях під зведенням; вони розгортаються тапом по зведенню
  await js(`const o = document.getElementById('sim-out'); if (!o.classList.contains('fx-on')) o.click()`); await sleep(400);
  let s0 = await sim();
  check(s0.kit === `my:${dopeId.d}` && s0.temp === '12' && s0.alt === '0', `таблиця на своїй погоді (${s0.kit}, ${s0.temp} °C, ${s0.alt} м)`);
  check(!s0.tOff && s0.bOff && s0.here === true, 'температура, висота й «Зараз тут» увімкнені, ствол — ні');
  check(/таблиця для \+12 °C · 0 м, як є/.test(s0.text), 'підказка: таблиця для +12 °C, як є');
  const hold = (tC) => js(`const G = await import('/js/guide.js'); return G.at(G.atmTab('my:${dopeId.d}', '0', ${tC}, 0).H, 600)`);
  check(Math.abs(await hold(12) - 6.6) < 1e-9, 'на погоді таблиці 600 м — 6,6 MRAD, як у таблиці');
  await js(`const s = document.getElementById('s-temp'); s.value = '-20'; s.dispatchEvent(new Event('change'))`); await sleep(400);
  s0 = await sim();
  check(/зараз −?-?20 °C · 0 м: перераховано за набоєм/.test(s0.text) && await hold(-20) > 6.7, `−20 °C — перераховано (600 м: ${(await hold(-20)).toFixed(2)} MRAD)`);
  await js(`const M = await import('/js/model.js'); const date = M.today(); const hh = String(new Date().getHours()).padStart(2, '0');
    window.__fetch0 = window.fetch;
    window.fetch = async (u, o) => (/open-meteo/.test(String(u)) ? new Response(JSON.stringify({ elevation: 812, hourly: { time: [date + 'T' + hh + ':00'], temperature_2m: [7.4] } }), { headers: { 'content-type': 'application/json' } }) : window.__fetch0(u, o));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 50.45, longitude: 30.52, accuracy: 10 } }) } });
    document.getElementById('s-here').click()`);
  check(await until(`document.getElementById('s-temp').value === '7' && document.getElementById('s-alt').value === '812'`, 5000), '«Зараз тут» — +7 °C і 812 м за місцем телефона');
  check(/Погода зараз за місцем телефона/.test((await sim()).text), 'підпис «Погода зараз за місцем телефона»');
  await js(`window.fetch = window.__fetch0; delete window.__fetch0`);
  await closeSheets();

  // Мішень з фото: .github/tests/target-a4.jpg — синтетичний кадр A4 у перспективі, 5 пробоїн 5,7 мм, відомі кути й
  // координати (мм від лівого верхнього кута листа). Кути листа знаходяться самі, «Вирівняти» з A4 дає лист 210 × 297,
  // тап поруч із пробоїною стає в її центр (як snapHole у розмітці), тап по друку — ні; група й СТП — як в еталоні.
  step = 'мішень з фото';
  const TRUTH = { photo: [3000, 4000], corners: [[520, 610], [2480, 520], [2610, 3480], [430, 3390]], holeMm: 5.7,
    holes: [[140, 110], [152, 118], [147, 131], [133, 122], [141, 118]], aim: [105, 148.5], spread: 22.14, offset: [37.6, 28.7],
    // друк, що не є пробоїною: кут і край ромба, напис «A4», перетин ліній сітки, чистий папір. Білий центр ромба
    // свідомо не тут: світла пляма калібру на чорному — це й є пробоїна в чорному друці, тап у неї стає в центр
    print: [[128, 148.5], [105, 130], [37, 20], [70, 84], [60, 250]] };
  await js(`const r = await fetch('/.github/tests/target-a4.jpg'); window.__tgFile = new File([await r.blob()], 'target-a4.jpg', { type: 'image/jpeg' })`);
  const corners = await js(`const { findSheet } = await import('/js/align.js'); const { decode, draw } = await import('/js/photos.js');
    return findSheet(draw(await decode(window.__tgFile), 3200))`);
  const cornerErr = corners ? Math.max(...corners.map(([x, y], i) => Math.hypot(x * TRUTH.photo[0] - TRUTH.corners[i][0], y * TRUTH.photo[1] - TRUTH.corners[i][1]))) : Infinity;
  check(cornerErr < 0.01 * TRUTH.photo[0], `кути листа знайдено (найдальший — ${cornerErr.toFixed(0)} px від справжнього)`);
  await js(`window.__alRes = undefined; (await import('/js/align.js')).alignTarget(window.__tgFile, { max: 2400 }).then((r) => { window.__alRes = r; })`);
  check(await until(`document.querySelector('.viewer.align')`, 10000), 'вікно «Вирівняти мішень»');
  await sleep(700);
  await js(`const c = document.querySelector('.align-crop input'); if (c && !c.checked) c.click();
    [...document.querySelectorAll('.align-sheet button')].find((b) => b.textContent.trim() === 'A4')?.click();
    [...document.querySelectorAll('.viewer.align .btn.primary')].pop()?.click()`);
  check(await until(`window.__alRes !== undefined`, 20000), '«Готово» — фото вирівняно');
  const aligned = await js(`const r = window.__alRes; return r && { w: r.w, h: r.h, sheet: r.sheet }`);
  check(aligned?.sheet?.w === 210 && aligned?.sheet?.h === 297 && Math.abs(aligned.w / aligned.h - 210 / 297) < 0.005,
    `вирівняне фото — лист A4 (${aligned?.w}×${aligned?.h}, ${JSON.stringify(aligned?.sheet)})`);
  // Тап на 0,4 калібру від центру пробоїни (на друку — точно в точку); далі як snapHole: квадрат 1,6 калібру, найближча ≤ 0,8
  const snapped = await js(`const { findHoles } = await import('/js/holes.js'); const r = window.__alRes;
    const src = await createImageBitmap(r.blob); const W = src.width; const H = src.height; const T = ${JSON.stringify(TRUTH)};
    const pxMm = W / 210; const holePx = T.holeMm * pxMm;
    const snap = ([xm, ym], off) => {
      const x = xm * pxMm + off; const y = ym * pxMm + off; const rr = holePx * 1.6;
      const { holes } = findHoles(src, [Math.max(0, x - rr), Math.max(0, y - rr), Math.min(W, x + rr), Math.min(H, y + rr)], holePx);
      let best = null; let bd = Infinity;
      for (const h of holes ?? []) { const d = Math.hypot(h.p[0] * W - x, h.p[1] * H - y); if (d < bd) { bd = d; best = h.p; } }
      return bd <= holePx * 0.8 ? [best[0] * W / pxMm, best[1] * H / pxMm] : null;
    };
    return { holes: T.holes.map((p) => snap(p, holePx * 0.28)), print: T.print.map((p) => snap(p, 0)) }`);
  const holeErr = snapped.holes.map((p, i) => (p ? Math.hypot(p[0] - TRUTH.holes[i][0], p[1] - TRUTH.holes[i][1]) : Infinity));
  check(holeErr.every((e) => e < 1), `тап поруч — у центр пробоїни (похибка, мм: ${holeErr.map((e) => e.toFixed(2)).join(', ')})`);
  const falseHits = TRUTH.print.filter((_, i) => snapped.print[i]);
  check(!falseHits.length, `тап по друку пробоїни не знаходить${falseHits.length ? ` — знайдено біля ${JSON.stringify(falseHits)}` : ''}`);
  if (snapped.holes.every(Boolean)) {
    const g = await js(`const M = await import('/js/model.js'); return M.groupStats(${JSON.stringify(snapped.holes)}, ${JSON.stringify(TRUTH.aim)})`);
    check(Math.abs(g.spread - TRUTH.spread) < 1 && Math.hypot(g.offset[0] - TRUTH.offset[0], g.offset[1] - TRUTH.offset[1]) < 1,
      `група ${g.spread.toFixed(1)} мм (еталон ${TRUTH.spread}), СТП ${g.offset.map((v) => v.toFixed(1)).join(' / ')} мм (еталон ${TRUTH.offset.join(' / ')})`);
  }
  await js(`delete window.__tgFile; delete window.__alRes`);
  await closeSheets();

  // Пошук пробоїн на важчому, намальованому аркуші (калібр 20 px): сірий папір із шумом, бліда пробоїна (контраст 50),
  // світла пробоїна в чорному (Shoot-N-C), дві злиплі; лінія друку й залите яблучко — не пробоїни
  step = 'пробоїни на важкому аркуші';
  const hard = await js(`const { findHoles } = await import('/js/holes.js'); const W = 900; const H = 600; const D = 20;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = 'rgb(190 190 185)'; x.fillRect(0, 0, W, H);
    const id = x.getImageData(0, 0, W, H); let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 16;
    for (let i = 0; i < id.data.length; i += 4) { const n = rnd(); id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    x.putImageData(id, 0, 0);
    const disk = (cx, cy, d, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, d / 2, 0, 7); x.fill(); };
    x.fillStyle = '#111'; x.fillRect(560, 60, 220, 220);
    x.fillRect(80, 450, 740, 3);
    disk(450, 470, 90, '#151515');
    const want = [[150, 150, 'rgb(140 140 136)'], [670, 170, 'rgb(225 235 120)'], [300, 300, '#2a2a2a'], [316, 312, '#2a2a2a']];
    for (const [cx, cy, col] of want) disk(cx, cy, D, col);
    const { holes, error } = findHoles(c, [0, 0, W, H], D);
    const pts = holes.map((h) => [h.p[0] * W, h.p[1] * H]);
    const found = want.map(([cx, cy]) => pts.some(([px, py]) => Math.hypot(px - cx, py - cy) < D * 0.5));
    const extra = pts.filter(([px, py]) => !want.some(([cx, cy]) => Math.hypot(px - cx, py - cy) < D * 0.5)).map((p) => p.map(Math.round));
    return { error, found, extra }`);
  const NAMES = ['бліда (контраст 50)', 'світла в чорному', 'злиплі — перша', 'злиплі — друга'];
  check(!hard.error && hard.found.every(Boolean), `знайдено всі пробоїни${hard.found.some((f) => !f) ? ` — не знайдено: ${NAMES.filter((_, i) => !hard.found[i]).join(', ')}` : ''}`);
  check(!hard.extra.length, `зайвих немає (лінія, яблучко, край чорного)${hard.extra.length ? ` — зайві: ${JSON.stringify(hard.extra)}` : ''}`);

  step = 'розділи вимкнено';
  await js(`localStorage.setItem('shooters-log:modules-off', JSON.stringify(['reload','gear','exercises','chrono','timer'])); location.hash = '#guns'`);
  await cdp('Page.reload'); await until(`document.querySelector('.tabbar, nav')`); await sleep(800);
  await tour('без розділів');
  check(await js(`location.hash = '#ammo'; await new Promise((r) => setTimeout(r, 400)); return !document.querySelector('.seg-nav')`), 'Склад без панелі розділів');
} catch (e) {
  errors.push(String(e.stack ?? e));
} finally {
  ws.close(); chrome.kill(); server.close();
  await sleep(500); await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const bad = checks.filter((c) => c.startsWith('✗'));
console.log(`${checks.length - bad.length}/${checks.length} перевірок`);
// SMOKE_VERBOSE=1 — усі перевірки з цифрами (похибки кутів, пробоїн, групи)
if (process.env.SMOKE_VERBOSE) console.log(checks.join('\n'));
if (errors.length) { console.error('ПОМИЛКИ:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
console.log('ok: димова перевірка пройдена');
