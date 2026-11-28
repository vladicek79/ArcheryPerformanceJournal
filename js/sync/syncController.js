// Runs the sync service when it makes sense (after start-up, after changes, when back online,
// when the app comes back to the foreground, on "Sync now") and keeps a status for the Settings card.
// Sync never blocks the UI: it runs in the background and failures only change the status.

export function createSyncController({ auth, service, store, debounceMs, onStatus, onPulled, isOnline = () => navigator.onLine }) {
  let status = { state: auth.isSignedIn() ? 'idle' : 'off', error: null, at: null, message: '' };
  let timer = null;

  const set = (patch) => {
    status = { ...status, ...patch };
    onStatus(status);
  };

  const enabled = () => auth.configured && auth.isSignedIn();

  async function run() {
    clearTimeout(timer);
    timer = null;
    if (!enabled()) return;
    if (!isOnline()) return set({ state: 'error', error: 'offline', message: '' });
    if (!auth.getToken()) return set({ state: 'error', error: 'auth', message: '' });
    set({ state: 'syncing' });
    const res = await service.sync();
    if (res.status === 'ok') {
      set({ state: 'ok', error: null, at: res.at, message: res.skipped ? `${res.skipped} invalid record(s) from Drive skipped.` : '' });
      if (res.pulled) onPulled();
      if (!auth.email() && store.accountEmail) store.accountEmail().then(auth.setEmail, () => {}).then(() => onStatus(status));
      return;
    }
    if (res.error === 'auth') auth.dropToken();
    set({ state: 'error', error: res.error, message: res.message || '' });
  }

  return {
    status: () => status,

    /** Sync now (Sync now button, start-up, finished session, back online). */
    request() {
      return run();
    },

    /** Sync a little later, after a burst of changes. */
    schedule() {
      if (!enabled()) return;
      clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
    },

    signedOut() {
      clearTimeout(timer);
      set({ state: 'off', error: null, at: null, message: '' });
    },
  };
}
