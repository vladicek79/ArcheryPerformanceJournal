// Service worker: cache-first app shell (ARCHITECTURE §7.2). Never touches user data.
const VERSION = '0.1.222';
// 'test' for the main-test build (its own site); test and production share the origin and
// therefore the Cache Storage, so each environment only manages caches with its own prefix.
const ENV = 'prod';
const PREFIX = ENV === 'test' ? 'archery-journal-test-' : 'archery-journal-';
const CACHE = `${PREFIX}${VERSION}`;
const ownCache = (k) => k.startsWith(PREFIX) && (ENV === 'test' || !k.startsWith('archery-journal-test-'));
// The neural network and its runtime (nn/, some 15 MB): not part of the shell (most never use them),
// kept in a cache of their own when first fetched, across app versions (their file names carry
// their version, so a cached copy is never out of date).
const NN_CACHE = `${PREFIX}nn`;
const isNn = (url) => new URL(url).pathname.includes('/nn/');

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/apl-tokens.css',
  './css/apl.css',
  './css/base.css',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-ext-400-normal.woff2',
  './fonts/inter-latin-500-normal.woff2',
  './fonts/inter-latin-ext-500-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-ext-600-normal.woff2',
  './fonts/inter-latin-700-normal.woff2',
  './fonts/inter-latin-ext-700-normal.woff2',
  './icons/icon.svg',
  './icons/support-qr.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './js/theme-boot.js',
  './js/main.js',
  './js/config.js',
  './js/core/dom.js',
  './js/core/router.js',
  './js/core/state.js',
  './js/core/calendar.js',
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
  './js/app/lastSetup.js',
  './js/app/sessionInsights.js',
  './js/app/aiExport.js',
  './js/app/sessionReport.js',
  './js/app/equipmentReport.js',
  './js/app/gearFields.js',
  './js/app/icons.js',
  './js/app/scoring.js',
  './js/app/loupePlacement.js',
  './js/app/plotZoom.js',
  './js/app/photoDetect.js',
  './js/app/spotFit.js',
  './js/app/arrowNet.js',
  // (found missing by tests/serviceWorker.test.js: the app broke offline on these screens)
  './js/app/catalog.js',
  './js/app/gym.js',
  './js/app/timeMath.js',
  './js/app/drillView.js',
  './js/app/views/gymForm.js',
  './js/app/views/formFinish.js',
  './js/app/views/runningHeader.js',
  './js/app/views/gymSetup.js',
  './js/app/views/gymRunning.js',
  './js/app/views/settingsCatalog.js',
  './js/app/scanGeometry.js',
  './js/app/scan.js',
  './js/app/scanPhoto.js',
  './js/app/views/settingsScan.js',
  './js/sync/photosUploader.js',
  './js/storage/photoQueue.js',
  './js/app/tabata.js',
  './js/app/views/tabataTimer.js',
  './js/app/views/liveScan.js',
  './js/app/watchCode.js',
  './js/app/hrTrace.js',
  './js/app/views/watchScan.js',
  './js/app/views/watchEnd.js',
  './js/vendor/jsQR.js',
  './js/app/runningSession.js',
  './js/app/openFormSession.js',
  './js/app/ongoingSessions.js',
  './js/app/finishedSession.js',
  './js/app/sessionLogic.js',
  './js/app/rounds.js',
  './js/app/stats.js',
  './js/app/endSummary.js',
  './js/app/strings.js',
  './js/app/gradeTexts.js',
  './js/app/views/common.js',
  './js/app/views/confirm.js',
  './js/app/views/pickers.js',
  './js/app/views/face.js',
  './js/app/views/log.js',
  './js/app/views/sessionSetup.js',
  './js/app/views/shootingSetup.js',
  './js/app/views/blankBale.js',
  './js/app/views/sessionOverview.js',
  './js/app/views/sessionExport.js',
  './js/app/views/setupFaces.js',
  './js/app/views/spotOrder.js',
  './js/app/views/timer.js',
  './js/ui/apl/index.js',
  './js/app/views/history.js',
  './js/app/views/gear.js',
  './js/app/views/gearSheet.js',
  './js/app/views/gearSights.js',
  './js/app/views/competitionLog.js',
  './js/app/views/dashboard.js',
  './js/app/views/sessionForms.js',
  './js/app/sessionTypes.js',
  './js/app/insights.js',
  './js/app/views/insights.js',
  './js/app/views/charts.js',
  './js/app/views/settings.js',
  './js/app/views/settingsGrades.js',
  './js/app/support.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages sends max-age=600), so a new
  // version never stores files left over from the previous one.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ownCache(k) && k !== CACHE && k !== NN_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (isNn(req.url)) {
    // cache first: fetched once, then offline for good
    event.respondWith(
      caches.open(NN_CACHE).then((c) =>
        c.match(req, { ignoreSearch: true }).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
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
