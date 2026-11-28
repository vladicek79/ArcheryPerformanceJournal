// Service worker registration and the "New version available" prompt (ARCHITECTURE §7.3).

// how often a resumed app asks the server for a newer version
export const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Register the service worker and keep the app up to date.
 *
 * On a phone the app is rarely closed, only hidden and brought back, so the browser's own check
 * (made when the page loads) and its own switch (made when every page of the app is closed) may not
 * happen for days. So here:
 * - coming back to the front asks the server for a newer version, at most once per CHECK_EVERY_MS;
 * - a downloaded version is switched on, and the page reloaded, while the app is hidden, when
 *   `canReloadSilently()` says no unsaved work would be lost; the same at the start of the page;
 * - otherwise `onUpdateReady(apply)` is called, for the app to ask the user; `apply()` switches and
 *   reloads.
 *
 * @param {(apply: () => void) => void} onUpdateReady
 * @param {object} [o]
 * @param {() => boolean} [o.canReloadSilently]
 * @param {object} [o.env]  the browser, replaceable in tests: `{ sw, doc, now, reload }`
 */
export function registerServiceWorker(onUpdateReady, { canReloadSilently = () => true, env = {} } = {}) {
  const sw = env.sw ?? globalThis.navigator?.serviceWorker;
  if (!sw) return;
  const doc = env.doc ?? document;
  const now = env.now ?? Date.now;
  const reload = env.reload ?? (() => location.reload());

  let reloading = false;
  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    reload();
  };
  // true once this page itself asked for the switch (silently, or the user said Reload)
  let asked = false;
  const updating = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    // another tab of the app switched versions while this one is being used with unsaved work: ask
    if (updating && !asked && doc.visibilityState === 'visible' && !canReloadSilently()) onUpdateReady(reloadOnce);
    else reloadOnce();
  });

  let waiting = null;
  const apply = (worker) => {
    asked = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
    // Chrome does not always send controllerchange (see reloadOnceActive below)
    const whenActive = () => worker.state === 'activated' && reloadOnce();
    worker.addEventListener('statechange', whenActive);
    whenActive();
  };
  const offer = (worker) => {
    waiting = worker;
    if (doc.visibilityState === 'hidden' && canReloadSilently()) apply(worker);
    else onUpdateReady(() => apply(worker));
  };

  let lastCheck = now();
  sw.register('./sw.js')
    .then((reg) => {
      // a version already waiting when the page starts: nothing is on screen yet, so take it now
      if (reg.waiting && sw.controller) apply(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && sw.controller) offer(worker);
        });
      });
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'hidden') {
          if (waiting?.state === 'installed' && canReloadSilently()) apply(waiting);
        } else if (now() - lastCheck >= CHECK_EVERY_MS) {
          lastCheck = now();
          reg.update().catch(() => {}); // offline: the next resume asks again
        }
      });
    })
    .catch((e) => console.warn('Service worker registration failed', e));
}

/**
 * Ask the server for a newer version now (Settings → "Check for new version"). When there is one it
 * is downloaded and switched on at once, and the page reloads by itself (the controllerchange
 * listener above). Resolves with 'updating', 'current', 'offline' or 'unsupported'.
 */
export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsupported';
  const activate = (worker) => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    reloadOnceActive(worker);
    return 'updating';
  };
  if (reg.waiting) return activate(reg.waiting);
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  if (reg.waiting) return activate(reg.waiting);
  const worker = reg.installing;
  if (!worker) return 'current';
  // the new version is downloading: wait until it is ready
  return new Promise((resolve) => {
    const done = () => {
      if (worker.state === 'installed') resolve(activate(worker));
      else if (worker.state === 'redundant') resolve('offline');
      else if (worker.state === 'activating' || worker.state === 'activated') resolve('updating');
    };
    worker.addEventListener('statechange', done);
    done();
  });
}

/**
 * The page normally reloads on `controllerchange` when the new version takes over. Chrome does not
 * always send it (a page opened with a hard reload has no controller to change; another open tab of
 * the app can delay it), which left "New version found. Reloading…" on screen for good. So reload
 * shortly after the new worker is active, and in any case after a while.
 */
const RELOAD_AFTER_ACTIVE_MS = 1000;
const RELOAD_ANYWAY_MS = 10000;

function reloadOnceActive(worker) {
  const reload = () => location.reload();
  const whenActive = () => worker.state === 'activated' && setTimeout(reload, RELOAD_AFTER_ACTIVE_MS);
  if (!whenActive()) worker.addEventListener('statechange', whenActive);
  setTimeout(reload, RELOAD_ANYWAY_MS);
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}

export async function storageInfo() {
  const info = { persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) Object.assign(info, await navigator.storage.estimate());
  } catch {
    /* not supported */
  }
  return info;
}
