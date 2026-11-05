// Димова перевірка перед випуском: справжній Chrome без вікна відкриває застосунок на чистому профілі,
// вантажить демо-дані, проходить тур, усі вкладки й розділи, «+» у кожному, і те саме з вимкненими розділами.
// Падає, якщо була хоч одна помилка JS або порожній екран. Запуск: node .github/smoke.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
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
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url ?? '')) errors.push(`[${step}] ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
});
await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 900, deviceScaleFactor: 1, mobile: true });

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
const blank = () => js(`return document.querySelector('main, #app')?.innerText.trim().length < 5`);
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

  step = 'пристрілка з Мішеней';
  await js(`location.hash = '#targets'`); await sleep(400);
  await js(`[...document.querySelectorAll('.seg-nav button')].find((b) => /Мішені/.test(b.textContent))?.click()`); await sleep(400);
  check(await js(`const b = document.querySelector('.zero-start'); b?.click(); return !!b`), 'кнопка «Пристрілка» в Мішенях');
  await sleep(500);
  await js(`document.querySelector('#layer .rows .row')?.click()`);
  check(await until(`/Пристрілка ·/.test(document.querySelector('#layer')?.innerText ?? '')`), 'майстер відкрився з вибору прицілу');
  await closeSheets();

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
if (errors.length) { console.error('ПОМИЛКИ:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
console.log('ok: димова перевірка пройдена');
