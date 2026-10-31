importScripts('./version.js');

const CACHE = `shooters-log-${self.APP_VERSION}-${self.APP_BUILD}`;
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
  './css/viper.webp',
  './css/viper-light.webp',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/sync.js',
  './js/google-token.js',
  './js/model.js',
  './js/ui.js',
  './js/i18n.js',
  './js/photos.js',
  './js/guide.js',
  './js/sim-tour.js',
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
  './guide/marksman.html',
  './guide/marksman.uk.html',
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
  './media/trener.jpg',
  './media/trener.mp4',
  './icons/author.jpg',
  './icons/monobank.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Файли — повз HTTP-кеш браузера: GitHub Pages віддає max-age=600, і без reload
// оновлення 10 хвилин після релізу ставило б старі файли.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Лише свої старі версії (і під попередніми назвами): на vitaliylobko.github.io поруч живе weight-log зі своїм кешем
    const mine = (k) => ['shooters-log-', 'scouts-log-', 'shooting-log-'].some((p) => k.startsWith(p));
    await Promise.all(keys.filter((k) => mine(k) && k !== CACHE).map((k) => caches.delete(k)));
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
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
