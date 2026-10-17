importScripts('./version.js');

const CACHE = `shooters-log-${self.APP_VERSION}-${self.APP_BUILD}`;
const ASSETS = [
  './',
  './index.html',
  './version.js',
  './manifest.webmanifest',
  './demo.json',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/sync.js',
  './js/model.js',
  './js/ui.js',
  './js/i18n.js',
  './js/photos.js',
  './js/guide.js',
  './js/target.js',
  './js/chart.js',
  './js/ammo.js',
  './js/levels.js',
  './js/timer.js',
  './js/exercises.js',
  './js/changelog.js',
  './js/shot-detector.js',
  './js/pdf.js',
  './guide/marksman.html',
  './guide/marksman.uk.html',
  './guide/img/prone-bipod.jpg',
  './guide/img/prone-bags.jpg',
  './guide/img/sitting.jpg',
  './guide/img/kneeling.jpg',
  './guide/img/standing.jpg',
  './guide/img/barricade.jpg',
  './guide/img/barricade-kneel.jpg',
  './icons/author.jpg',
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
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
