// Service worker registration and the "New version available" prompt (ARCHITECTURE §7.3).

export function registerServiceWorker(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const offer = (worker) => onUpdateReady(() => worker.postMessage({ type: 'SKIP_WAITING' }));
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
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
