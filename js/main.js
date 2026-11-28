// Bootstrap (ARCHITECTURE §7.4): service worker → persistence → repository → router → backup reminder.
import {
  APP_ID,
  APP_ENV,
  STORAGE_KEY,
  TRASH_DAYS,
  SCHEMA_VERSION,
  GOOGLE_CLIENT_ID,
  DRIVE_SCOPE,
  DRIVE_FILE_NAME,
  SYNC_DEBOUNCE_MS,
  SYNC_TOMBSTONE_RETENTION_DAYS,
} from './config.js';
import { h } from './core/dom.js';
import { createRouter } from './core/router.js';
import { createState } from './core/state.js';
import { createRepository } from './storage/repository.js';
import { createLocalStorageAdapter } from './storage/localStorageAdapter.js';
import { migrations } from './storage/migrations.js';
import { registerServiceWorker, requestPersistence } from './pwa/updates.js';
import { collections, defaultSettings, SYNCED_SETTING_KEYS } from './app/collections.js';
import { createGoogleAuth } from './sync/googleAuth.js';
import { createDriveStore } from './sync/driveStore.js';
import { createPhotosUploader, PHOTOS_SCOPE } from './sync/photosUploader.js';
import { createPhotoQueue } from './storage/photoQueue.js';
import { saveScanPhoto, scanPhotoMode } from './app/scanPhoto.js';
import { createSyncService } from './sync/syncService.js';
import { createSyncController } from './sync/syncController.js';
import { T } from './app/strings.js';
import { icons } from './app/icons.js';
import * as L from './app/sessionLogic.js';
import { TYPE_LABELS } from './app/sessionTypes.js';
import { guideSheet } from './app/views/common.js';
import { renderLog, renderNewSession, renderBlankBale, renderGym, askAboutOngoingSession } from './app/views/log.js';
import * as APL from './ui/apl/index.js';
import { startTimerTicker } from './app/views/timer.js';
import { createOngoingSessions } from './app/ongoingSessions.js';
import { createFinishedSessions } from './app/finishedSession.js';
import { renderDashboard } from './app/views/dashboard.js';
import { renderInsights } from './app/views/insights.js';
import { renderHistory, askAboutFinishedSession } from './app/views/history.js';
import { renderGear } from './app/views/gear.js';
import { renderSettings } from './app/views/settings.js';
import { confirmDialog } from './app/views/confirm.js';

const repo = createRepository({
  adapter: createLocalStorageAdapter(),
  // keep deletion markers only while Drive sync is on (they let a deletion reach other devices)
  keepDeletionMarkers: () => auth.isSignedIn(),
  storageKey: STORAGE_KEY,
  appId: APP_ID,
  schemaVersion: SCHEMA_VERSION,
  collections,
  defaultSettings,
  syncedSettingKeys: SYNCED_SETTING_KEYS,
  migrations,
});

// ---------------------------------------------------------------- optional Google Drive sync
// Google Photos (scan photos) is asked for only once the user allows it; from then on every
// sign-in and silent renewal asks for it too, so the token keeps it
const auth = createGoogleAuth({
  clientId: GOOGLE_CLIENT_ID,
  scope: () => (auth.hasScope(PHOTOS_SCOPE) ? `${DRIVE_SCOPE} ${PHOTOS_SCOPE}` : DRIVE_SCOPE),
  keyPrefix: STORAGE_KEY,
});
const driveStore = createDriveStore({ getToken: () => auth.getToken(), fileName: DRIVE_FILE_NAME });
const syncService = createSyncService({
  repo,
  store: driveStore,
  collections,
  syncedSettingKeys: SYNCED_SETTING_KEYS,
  appId: APP_ID,
  schemaVersion: SCHEMA_VERSION,
  migrations,
  retentionDays: SYNC_TOMBSTONE_RETENTION_DAYS,
});
const sync = createSyncController({
  auth,
  service: syncService,
  store: driveStore,
  debounceMs: SYNC_DEBOUNCE_MS,
  // the status is shown only on Settings › Sync & backup; avoid re-rendering (and disturbing typing) elsewhere
  onStatus: () => route.name === 'settings' && route.params[0] === 'sync' && shell && renderNow(),
  onPulled: () => {
    if (shell) renderNow();
  },
});

const ui = createState({ guide: false, toast: null });

const TABS = [
  // the running session (Log) is opened from the Dashboard, so it has no tab of its own
  ['home', T.tabs.dashboard, icons.dashboard],
  ['history', T.tabs.history, icons.history],
  ['insights', T.tabs.insights, icons.insights],
  ['gear', T.tabs.gear, icons.gear],
  ['settings', T.tabs.settings, icons.settings],
];
const VIEWS = { home: renderDashboard, insights: renderInsights, log: renderLog, new: renderNewSession, blank: renderBlankBale, gym: renderGym, history: renderHistory, gear: renderGear, settings: renderSettings };

let route = { name: 'home', params: [] };
let shell;
let overlayClose = null;
let lastReturnFk = null;
let lastOverlayKey = null;

function buildShell() {
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const nav = APL.TabBar({
    label: 'Sections',
    items: TABS.map(([name, label, icon]) => ({ id: name, label, icon: icon(), href: `#/${name}` })),
  });
  const tabButtons = Object.fromEntries([...nav.querySelectorAll('[data-tab]')].map((el) => [el.dataset.tab, el]));
  const overlay = h('div', { class: 'overlay-root' });
  const toast = h('div', { class: 'toast-root', role: 'status', 'aria-live': 'polite' });
  // the test build (main-test) is marked on every screen so it is never mistaken for the real journal
  const envBadge = APP_ENV === 'test' ? h('div', { class: 'env-badge', 'aria-label': 'Test environment' }, 'TEST') : null;
  // sessions still running, shown on every page above the bottom bar (see renderRunning)
  const running = h('div', { class: 'running-bars apl apl-bar' });
  const app = h('div', { class: ['app', APP_ENV === 'test' && 'env-test'] }, envBadge, main, running, nav, overlay, toast);
  document.getElementById('app').replaceChildren(app);
  return { app, main, running, nav, tabButtons, overlay, toast };
}

function renderNow({ scrollTop = false } = {}) {
  const focusKey = document.activeElement?.dataset?.fk;
  const view = VIEWS[route.name] || renderDashboard;
  let result;
  try {
    result = view(ctx, route.params);
  } catch (e) {
    console.error(e);
    result = { content: h('div', { class: 'card' }, h('p', { class: 'error' }, `Something went wrong: ${e.message}`)) };
  }

  // tabs
  // Insights uses the full width of a desktop browser
  shell.app.classList.toggle('app-wide', route.name === 'insights');
  for (const [name, el] of Object.entries(shell.tabButtons)) {
    // the new-session setup and the running session are opened from the Dashboard, so its tab stays marked
    if (name === route.name || (name === 'home' && (route.name === 'new' || route.name === 'log' || route.name === 'blank' || route.name === 'gym'))) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }

  shell.main.replaceChildren(result.content);
  if (scrollTop) shell.main.scrollTop = 0;
  // a session's own page while it runs has no tab bar: the room goes to the session (its Back and
  // Finish lead out of it)
  shell.app.classList.toggle('no-tabs', ctx.ongoing.list().some(isOwnPage));
  renderRunning();

  // overlays: the grading sheet comes from the view; the guide is global
  const st = ui.get();
  const overlay = st.guide ? { ...guideSheet(() => ui.set({ guide: false }), repo.getSettings()), key: 'guide' } : result.overlay ? { ...result.overlay, key: 'view' } : null;
  renderOverlay(overlay, focusKey);

  if (!overlay && focusKey) {
    const el = shell.main.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (el) el.focus({ preventScroll: true });
  }
}

function renderOverlay(overlay, focusKey = null) {
  const opened = overlay && lastOverlayKey !== overlay.key;
  const returnFocus = !overlay && lastOverlayKey;
  const returnFk = lastReturnFk;
  lastOverlayKey = overlay ? overlay.key : null;
  lastReturnFk = overlay ? overlay.returnFk || null : null;
  overlayClose = overlay ? overlay.onClose : null;
  for (const el of [shell.main, shell.nav, shell.running]) el.inert = !!overlay;
  if (!overlay) {
    shell.overlay.replaceChildren();
    shell.overlay.className = 'overlay-root';
    if (returnFocus && !document.activeElement?.closest?.('.main')) {
      // keep the user's place: focus returns to the active slot or the main area
      // (or to the control that opened the overlay, when it names one: `returnFk`)
      const opener = returnFk && shell.main.querySelector(`[data-fk="${CSS.escape(returnFk)}"]`);
      const target = opener || shell.main.querySelector('.slot.is-active') || shell.main;
      target.focus({ preventScroll: true });
    }
    return;
  }
  shell.overlay.className = 'overlay-root open';
  // the same sheet drawn again (a choice made in it): it keeps where its body was scrolled to, and
  // does not rise again
  const scrolled = opened ? [] : [...shell.overlay.querySelectorAll('.apl-dialog-sheetbody')].map((el) => el.scrollTop);
  if (!opened) overlay.node.classList.add('is-redrawn');
  const backdrop = h('div', { class: 'backdrop', onClick: () => overlayClose?.() });
  shell.overlay.replaceChildren(backdrop, overlay.node);
  overlay.node.querySelectorAll('.apl-dialog-sheetbody').forEach((el, i) => {
    if (scrolled[i]) el.scrollTop = scrolled[i];
  });
  if (!opened && !overlay.node.contains(document.activeElement)) {
    // the same sheet drawn again (a key tapped in it): focus stays on the control that was used
    const same = focusKey && overlay.node.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (same) {
      same.focus({ preventScroll: true });
      return;
    }
  }
  const first = overlay.node.querySelector('[data-autofocus]') || overlay.node.querySelector('button');
  if (first && (opened || !overlay.node.contains(document.activeElement))) first.focus({ preventScroll: true });
}

/**
 * A strip per session still running (a scored session, or an open blank bale / strength / gym /
 * mental one), on every page except that session's own, so it can always be reopened.
 */
/** Whether the page shown is an ongoing session's own (the scoring screen, the blank bale's, the gym's, the form of SPT / mental). */
function isOwnPage(s) {
  const currentRoute = [route.name, ...route.params].join('/');
  return currentRoute === s.page || currentRoute.startsWith(`${s.page}/`);
}

function renderRunning() {
  const items = [];
  const bar = ({ href, title, detail, timer, fk }) => {
    const tm = timer || { running: false, startedAt: null, elapsedMs: 0 };
    return APL.Banner({
      href,
      title,
      detail,
      tone: 'accent',
      indicator: tm.running ? 'live' : 'paused',
      trailing: h(
        'span',
        { class: 'timer-value', dataset: { elapsed: String(tm.elapsedMs || 0), started: tm.running ? tm.startedAt : '' } },
        L.formatClock(L.timerElapsed(tm)),
      ),
      action: { label: T.continueSession },
      fk,
    });
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // the banner's line under the title, from the facts the ongoing session gives
  const detailOf = ({ distance, distanceUnit = 'm', ends, arrows, sets }) => {
    if (ends != null) return `${distance} ${distanceUnit} · ${plural(ends, 'end', 'ends')}`;
    if (arrows != null) return plural(arrows, 'arrow', 'arrows');
    if (sets != null) return plural(sets, 'set', 'sets');
    return null;
  };
  for (const s of ctx.ongoing.list()) {
    // not on its own page (the scoring screen, the blank bale's, the gym's, the form of SPT / mental)
    if (isOwnPage(s)) continue;
    items.push(
      bar({
        href: `#/${s.page}`,
        title: `${TYPE_LABELS[s.type]} running`,
        detail: detailOf(s.banner),
        timer: s.timer,
        // the running scored session keeps its old test hook
        fk: s.session ? 'running-log' : `running-${s.type}`,
      }),
    );
  }
  if (items.length) startTimerTicker();
  // on the Dashboard, New session sits here too, under the running sessions
  if (route.name === 'home') {
    items.push(APL.Button({ children: T.newSession, onClick: () => router.navigate('new'), fk: 'new-session' }));
  }
  shell.running.replaceChildren(...items);
}

// ---------------------------------------------------------------- new version
// Most updates are taken silently while the app is hidden (pwa/updates.js). The popup is for a
// version that arrives while the app is in use, or while unsaved work keeps the silent reload away.
let updateApply = null;
let updateAsking = false;

async function askToUpdate(apply) {
  updateApply = apply;
  if (updateAsking) return;
  updateAsking = true;
  const ok = await confirmDialog({ title: T.newVersion, message: T.newVersionMessage, confirmLabel: T.reload, cancelLabel: T.later, icon: 'refresh' });
  updateAsking = false;
  if (ok) updateApply();
}

/** What a reload would throw away: a draft kept only on the page, a field being typed in, an open sheet or dialog. */
function midEdit() {
  return route.name === 'new' || !!document.activeElement?.matches?.('input, textarea, select');
}

function canReloadSilently() {
  const dialogs = document.querySelectorAll('dialog[open]').length - (updateAsking ? 1 : 0);
  return !midEdit() && !overlayClose && dialogs === 0;
}

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  shell.toast.replaceChildren(APL.Toast({ message }));
  toastTimer = setTimeout(() => shell.toast.replaceChildren(), 4000);
}

function guard(fn) {
  try {
    return fn();
  } catch (e) {
    console.error(e);
    toast(e.message);
    return null;
  }
}

const ctx = {
  repo,
  ui,
  rerender: () => renderNow(),
  navigate: (path, opts) => router.navigate(path, opts),
  toast,
  save: (name, record) => guard(() => repo.save(name, record)),
  remove: (name, id) => guard(() => (repo.remove(name, id), true)),
  trash: (name, id) => guard(() => (repo.trash(name, id), true)),
  restore: (name, id) => guard(() => (repo.restore(name, id), true)),
  saveSettings: (patch) => guard(() => repo.saveSettings(patch)),
  env: APP_ENV,
  sync: {
    configured: auth.configured,
    signedIn: () => auth.isSignedIn(),
    email: () => auth.email(),
    status: () => sync.status(),
    signIn: () => auth.signIn(),
    signOut: () => {
      auth.signOut();
      sync.signedOut();
    },
    now: () => sync.request(),
  },
};
// the running (scored) session: found, started, finished and discarded in one place
// scan photos (Settings › Scan): queued on the phone, uploaded to an album in Google Photos
const ALBUM_KEY = `${STORAGE_KEY}.photosAlbum`;
const photosUploader = createPhotosUploader({
  queue: createPhotoQueue(`${STORAGE_KEY}.scan-photos`),
  getToken: () => (auth.hasScope(PHOTOS_SCOPE) ? auth.getToken() : null),
  getAlbumId: () => {
    try {
      return localStorage.getItem(ALBUM_KEY);
    } catch {
      return null;
    }
  },
  setAlbumId: (id) => {
    try {
      if (id) localStorage.setItem(ALBUM_KEY, id);
      else localStorage.removeItem(ALBUM_KEY);
    } catch {
      /* storage blocked: a new album next time */
    }
  },
  onChange: (st) => {
    // Google says Photos was not allowed (unticked on the consent screen): Settings asks again
    if (st.error?.kind === 'scope') auth.forgetScope(PHOTOS_SCOPE);
    if (route.name === 'settings' && route.params[0] === 'scan') renderNow();
  },
});
ctx.scanPhotos = {
  available: auth.configured,
  allowed: () => auth.isSignedIn() && auth.hasScope(PHOTOS_SCOPE),
  allow: () => auth.signIn({ extraScopes: [PHOTOS_SCOPE] }),
  status: () => photosUploader.state,
  pending: () => photosUploader.pending(),
  uploadNow: () => photosUploader.drain(),
  /** Keep the raw picture of a Scan ({ canvas } or { file }) as Settings › Scan says. */
  save: (source, face) => {
    const mode = scanPhotoMode(repo.getSettings());
    return saveScanPhoto(source, { face, mode: mode === 'photos' && !auth.configured ? 'off' : mode, upload: (name, blob) => photosUploader.add(name, blob) });
  },
};
// the ongoing sessions: the running scored session and the open form sessions (blank bale / SPT /
// gym / mental), listed, started, finished and discarded in one place
ctx.ongoing = createOngoingSessions({
  repo,
  save: ctx.save,
  remove: ctx.remove,
  saveSettings: ctx.saveSettings,
  confirm: askAboutOngoingSession,
  requestSync: () => ctx.sync.now(), // a finished session goes to Drive right away (no-op when sync is off)
  onChange: () => ctx.rerender(),
});
// the finished sessions (History): edits, Recently deleted, restoring and deleting for good
ctx.finished = createFinishedSessions({
  repo,
  save: ctx.save,
  trash: ctx.trash,
  restore: ctx.restore,
  remove: ctx.remove,
  confirm: askAboutFinishedSession,
});

const router = createRouter((r) => {
  // sight marks moved into the Gear tab (they belong to a setup); old links land there
  if (r.name === 'sights') {
    location.replace('#/gear');
    return;
  }
  const changed = r.name !== route.name || r.params.join('/') !== route.params.join('/');
  route = r;
  if (changed) ui.quietSet({ importPreview: null, gearMenu: null, gearEdit: null, sightMenu: null, sightEdit: null, ov: null, gymMenu: null, gymRename: null, gymOther: null, formSheet: null, catalogEdit: null });
  renderNow({ scrollTop: changed });
  if (changed && auth.configured && auth.isSignedIn() && !auth.getToken()) renewIfSafe();
});

// Light / dark (APL themes): 'system' leaves <html> without data-theme, so apl-tokens.css follows
// the device setting. The choice is mirrored to its own key, read by theme-boot.js before the first
// paint (no flash).
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const { theme = 'system' } = repo.getSettings();
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try {
    localStorage.setItem(`${STORAGE_KEY}.theme`, theme);
  } catch {
    // storage blocked: the theme is still applied from the settings once the app has loaded
  }
  // the browser / status bar colour follows the page background
  const ground = getComputedStyle(root).getPropertyValue('--ground').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground || '#0b0e10');
}
darkQuery.addEventListener('change', applyTheme);

/** Is Google reachable? navigator.onLine is often true on a dead mobile connection. */
async function googleReachable(timeoutMs = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch('https://www.googleapis.com/generate_204', { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google's answer after a sign-in redirect; renews an expired token silently at start-up, but only
 * when Google answers quickly (otherwise the app starts normally and Settings offers Reconnect).
 * Returns false when leaving the page.
 */
async function handleSignIn() {
  if (!auth.configured) return true;
  const result = auth.consumeRedirect((hash) => history.replaceState(null, '', `${location.pathname}${location.search}${hash}`));
  if (result.kind === 'error' && !result.silent) ui.quietSet({ signInError: result.error });
  silentFailed = result.kind === 'error' && result.silent;
  if (await needsRenewal()) {
    auth.signIn({ silent: true });
    return false;
  }
  return true;
}

// a silent renewal that Google refused is not retried in this page's life (no redirect loop);
// Settings then offers Reconnect
let silentFailed = false;
let renewing = false;

async function needsRenewal() {
  return auth.isSignedIn() && !auth.getToken() && navigator.onLine && !silentFailed && (await googleReachable());
}

/**
 * An installed app is often resumed from the background rather than started again, so the token
 * (about an hour) can expire while the app stays open. Renew it when the app comes back, but not
 * while the redirect could lose work: the New session screen keeps its draft in memory, and a
 * focused text field may be mid-edit. Called again on navigation, so leaving that screen renews.
 */
async function renewIfSafe() {
  if (renewing || !auth.configured || document.visibilityState !== 'visible') return false;
  if (midEdit()) return false;
  renewing = true;
  try {
    if (!(await needsRenewal())) return false;
    auth.signIn({ silent: true });
    return true;
  } finally {
    renewing = false;
  }
}

function fatal(message) {
  document.getElementById('app').replaceChildren(
    h('div', { class: 'fatal' }, h('h1', null, 'The journal could not start'), h('p', null, message)),
  );
}

async function boot() {
  if (!(await handleSignIn())) return;
  registerServiceWorker(askToUpdate, { canReloadSilently });
  requestPersistence();
  try {
    repo.init();
  } catch (e) {
    console.error(e);
    fatal(e.message);
    return;
  }
  // sessions in Recently deleted for longer than TRASH_DAYS are removed for good
  try {
    repo.purgeTrash('sessions', TRASH_DAYS * 24 * 3600 * 1000);
  } catch (e) {
    console.error(e);
  }
  shell = buildShell();
  applyTheme();
  repo.subscribe((c) => {
    if (c.type === 'settings' || c.type === 'import') applyTheme();
    if (c.type === 'import') renderNow();
    // local edits are pushed to Drive a little later (sync's own writes do not re-trigger it)
    if (['save', 'remove', 'settings', 'import'].includes(c.type)) sync.schedule();
  });
  window.addEventListener('online', () => {
    sync.request();
    photosUploader.drain();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // when no renewal happens (not safe, offline, refused) sync reports the expired sign-in as before
    renewIfSafe().then((leaving) => {
      if (leaving) return;
      sync.request();
      photosUploader.drain();
    });
  });
  // scan photos still waiting from an earlier visit
  photosUploader.drain();
  ui.subscribe(() => renderNow());
  // On a wide window the app is a column and only its main area scrolls: the wheel over the empty
  // sides of the window scrolls the main area too (not while a dialog or sheet is open).
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || shell.app.contains(e.target) || shell.main.inert || document.querySelector('dialog[open]')) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? shell.main.clientHeight : 1;
      shell.main.scrollBy({ top: e.deltaY * unit, left: 0 });
    },
    { passive: true },
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayClose) {
      e.preventDefault();
      overlayClose();
    }
  });
  router.start();
  sync.request();
}

boot();
