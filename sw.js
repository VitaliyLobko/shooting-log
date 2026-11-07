importScripts('./version.js', './media.js');

const CACHE = `shooters-log-${self.APP_VERSION}-${self.APP_BUILD}`;
// Картинки — в окремому кеші без версії: 8 МБ фото тренажера змінюються рідко, а качались би з кожним релізом.
// Ключ — шлях із відбитком (?v=…), тож змінена картинка — новий запис; зайві прибирає activate
const MEDIA_CACHE = 'shooters-log-media';
const mediaKey = (path) => `./${path}?v=${self.MEDIA[path]}`;
const ASSETS = [
  './',
  './index.html',
  './version.js',
  './manifest.webmanifest',
  './demo.json',
  './css/app.css',
  './css/topo.svg',
  './css/topo-light.svg',
  './css/camo.webp',
  './css/camo-hex.webp',
  './css/camo-light.webp',
  './css/lines.webp',
  './css/lines-acc.webp',
  './css/lines-sand.webp',
  './css/lines-khaki.webp',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/sync.js',
  './js/google-token.js',
  './js/model.js',
  './js/ui.js',
  './js/i18n.js',
  './js/gear-icons.js',
  './js/icons-lucide.js',
  './js/photos.js',
  './js/zero.js',
  './js/studio.js',
  './js/guide.js',
  './js/scenes.js',
  './js/sim-tour.js',
  './js/tour.js',
  './js/tours.js',
  './js/masks.js',
  './js/md.js',
  './js/ballistics.js',
  './js/target.js',
  './js/chart.js',
  './js/ammo.js',
  './js/levels.js',
  './js/timer.js',
  './js/exercises.js',
  './js/changelog.js',
  './js/ics.js',
  './js/shot-detector.js',
  './js/pdf.js',
  './js/holes.js',
  './js/align.js',
  './js/warp-worker.js',
  './js/usd.js',
  './js/usd-rates.js',
  './js/lock.js',
  './guide/marksman.uk.html',
  './guide/reloading.uk.html',
  './guide/img/prone-bipod.jpg',
  './guide/img/prone-bags.jpg',
  './guide/img/sitting.jpg',
  './guide/img/kneeling.jpg',
  './guide/img/standing.jpg',
  './guide/img/barricade.jpg',
  './guide/img/barricade-kneel.jpg',
  './guide/img/squat.png',
  './guide/img/prone-rollover.png',
  './guide/img/prone-reverse.png',
  './guide/img/real-assault.webp',
  './guide/img/real-assault-cl.webp',
  './guide/img/real-assault-cr.webp',
  './guide/img/real-assault-far.webp',
  './guide/img/real-assault-gnd.webp',
  './guide/img/real-green.webp',
  './guide/img/real-green-cl.webp',
  './guide/img/real-green-cr.webp',
  './guide/img/real-green-far.webp',
  './guide/img/real-green-gnd.webp',
  './guide/img/real-town.webp',
  './guide/img/real-town-cl.webp',
  './guide/img/real-town-cr.webp',
  './guide/img/real-town-far.webp',
  './guide/img/real-town-gnd.webp',
  './guide/img/real-dusk.webp',
  './guide/img/real-dusk-cl.webp',
  './guide/img/real-dusk-cr.webp',
  './guide/img/real-dusk-far.webp',
  './guide/img/real-dusk-gnd.webp',
  './guide/img/real-arctic.webp',
  './guide/img/real-arctic-cl.webp',
  './guide/img/real-arctic-cr.webp',
  './guide/img/real-arctic-far.webp',
  './guide/img/real-trench.webp',
  './guide/img/real-pickup.webp',
  './guide/img/real-pickupf.webp',
  './guide/img/real-prone.webp',
  './guide/img/real-field-bg.webp',
  './guide/img/real-field-gr.webp',
  './guide/img/zero-25m.png',
  './icons/author.jpg',
  './icons/monobank.png',
  './icons/cat-portrait.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Файли — повз HTTP-кеш браузера: GitHub Pages віддає max-age=600, і без reload
// оновлення 10 хвилин після релізу ставило б старі файли.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const media = ASSETS.filter((url) => self.MEDIA[url.slice(2)]);
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.filter((url) => !media.includes(url)).map((url) => new Request(url, { cache: 'reload' })));
    // Картинка з тим самим відбитком уже є — не качаємо; будь-яка невдача валить установку, як і addAll
    const mc = await caches.open(MEDIA_CACHE);
    await Promise.all(media.map(async (url) => {
      const key = mediaKey(url.slice(2));
      if (await mc.match(key)) return;
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      await mc.put(key, res);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Лише свої старі версії (і під попередніми назвами): на vitaliylobko.github.io поруч живе weight-log зі своїм кешем
    const mine = (k) => ['shooters-log-', 'scouts-log-', 'shooting-log-'].some((p) => k.startsWith(p));
    await Promise.all(keys.filter((k) => mine(k) && k !== CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k)));
    // Картинки, яких у цій версії вже немає (чи з іншим відбитком)
    const mc = await caches.open(MEDIA_CACHE);
    const keep = new Set(Object.keys(self.MEDIA).map((path) => new URL(mediaKey(path), self.location).href));
    await Promise.all((await mc.keys()).filter((r) => !keep.has(r.url)).map((r) => mc.delete(r)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// «Поділитися» → Shooter’s Log (share_target у manifest): картинку — у кеш, застосунок забере її за ?go=shared
async function receiveShare(request) {
  try {
    const file = (await request.formData()).get('image');
    if (file) await (await caches.open('shared-image')).put('shared', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
  } catch { /* не вийшло — застосунок просто відкриється */ }
  return Response.redirect(new URL('?go=shared', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method === 'POST' && new URL(request.url).searchParams.get('go') === 'shared') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    // Картинка з ASSETS — точно під відбиток цієї версії
    const path = request.url.split(/[?#]/)[0].slice(self.registration.scope.length);
    if (self.MEDIA[path]) {
      const hit = await (await caches.open(MEDIA_CACHE)).match(mediaKey(path));
      if (hit) return hit;
    }
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(request);
      // широкі фони для комп'ютера не в ASSETS (телефону не потрібні) — кладемо в кеш при першому показі, щоб були й офлайн
      if (res.ok && /-wide\.webp$/.test(new URL(request.url).pathname)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    } catch (err) {
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
