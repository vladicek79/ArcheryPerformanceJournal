// Service worker: cache-first app shell (ARCHITECTURE §7.2). Never touches user data.
const VERSION = '__APP_VERSION__';
// 'test' for the main-test build served under /test/; test and production share the origin and
// therefore the Cache Storage, so each environment only manages caches with its own prefix.
const ENV = '__APP_ENV__';
const PREFIX = ENV === 'test' ? 'archery-journal-test-' : 'archery-journal-';
const CACHE = `${PREFIX}${VERSION}`;
const ownCache = (k) => k.startsWith(PREFIX) && (ENV === 'test' || !k.startsWith('archery-journal-test-'));

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './js/main.js',
  './js/config.js',
  './js/core/dom.js',
  './js/core/router.js',
  './js/core/state.js',
  './js/storage/repository.js',
  './js/storage/localStorageAdapter.js',
  './js/storage/migrations.js',
  './js/backup/backup.js',
  './js/sync/errors.js',
  './js/sync/merge.js',
  './js/sync/syncService.js',
  './js/sync/googleAuth.js',
  './js/sync/driveStore.js',
  './js/sync/syncController.js',
  './js/pwa/updates.js',
  './js/app/collections.js',
  './js/app/gearFields.js',
  './js/app/icons.js',
  './js/app/scoring.js',
  './js/app/sessionLogic.js',
  './js/app/stats.js',
  './js/app/strings.js',
  './js/app/views/common.js',
  './js/app/views/face.js',
  './js/app/views/log.js',
  './js/app/views/history.js',
  './js/app/views/gear.js',
  './js/app/views/sights.js',
  './js/app/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ownCache(k) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // The deploy stamps VERSION; an unstamped placeholder (still containing "APP_VERSION") means local dev.
  if (VERSION.includes('APP_VERSION')) {
    // Unstamped local build: network first so edits show up on reload; cache only as offline fallback.
    event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
