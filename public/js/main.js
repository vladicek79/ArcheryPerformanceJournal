// Bootstrap (ARCHITECTURE §7.4): service worker → persistence → repository → router → backup reminder.
import {
  APP_ID,
  APP_ENV,
  STORAGE_KEY,
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
import { collections, defaultSettings, DEFAULT_SIGHT_DISTANCES, SYNCED_SETTING_KEYS } from './app/collections.js';
import { createGoogleAuth } from './sync/googleAuth.js';
import { createDriveStore } from './sync/driveStore.js';
import { createSyncService } from './sync/syncService.js';
import { createSyncController } from './sync/syncController.js';
import { T } from './app/strings.js';
import { icons } from './app/icons.js';
import { guideSheet } from './app/views/common.js';
import { renderLog, renderNewSession, logSubtitle } from './app/views/log.js';
import { renderHistory } from './app/views/history.js';
import { renderGear } from './app/views/gear.js';
import { renderSights } from './app/views/sights.js';
import { renderSettings } from './app/views/settings.js';

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
const auth = createGoogleAuth({ clientId: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE, keyPrefix: STORAGE_KEY });
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
  // the status is shown only on Settings; avoid re-rendering (and disturbing typing) elsewhere
  onStatus: () => route.name === 'settings' && shell && renderNow(),
  onPulled: () => {
    dedupeSeededSightMarks();
    if (shell) renderNow();
  },
});

const ui = createState({ guide: false, toast: null, update: null });

const TABS = [
  ['new', T.tabs.dashboard, icons.dashboard],
  ['log', T.tabs.log, icons.log],
  ['history', T.tabs.history, icons.history],
  ['gear', T.tabs.gear, icons.gear],
  ['sights', T.tabs.sights, icons.sights],
];
const VIEWS = { log: renderLog, new: renderNewSession, history: renderHistory, gear: renderGear, sights: renderSights, settings: renderSettings };

let route = { name: 'log', params: [] };
let shell;
let overlayClose = null;
let lastOverlayKey = null;

function buildShell() {
  const sub = h('div', { class: 'header-sub' });
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const banner = h('div', { class: 'banners' });
  const tabButtons = {};
  const nav = h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Sections' },
    TABS.map(([name, label, icon]) => {
      tabButtons[name] = h('a', { href: `#/${name}`, class: 'tab' }, icon(), h('span', null, label));
      return tabButtons[name];
    }),
  );
  const header = h(
    'header',
    { class: 'app-header' },
    h('div', { class: 'brand' }, icons.logo(), h('div', null, h('div', { class: 'brand-title' }, T.appTitle), sub)),
    h(
      'div',
      { class: 'header-actions' },
      h('button', { type: 'button', class: 'header-btn', onClick: () => ui.set({ guide: true }) }, icons.help(), T.grades),
      h('a', { class: 'header-btn icon-only', href: '#/settings', 'aria-label': T.settings }, icons.settings()),
    ),
  );
  const overlay = h('div', { class: 'overlay-root' });
  const toast = h('div', { class: 'toast-root', role: 'status', 'aria-live': 'polite' });
  // the test build (main-test, /test/) is marked on every screen so it is never mistaken for the real journal
  const envBadge = APP_ENV === 'test' ? h('div', { class: 'env-badge', 'aria-label': 'Test environment' }, 'TEST') : null;
  const app = h('div', { class: ['app', APP_ENV === 'test' && 'env-test'] }, envBadge, header, banner, main, nav, overlay, toast);
  document.getElementById('app').replaceChildren(app);
  return { header, sub, main, banner, nav, tabButtons, overlay, toast };
}

function renderNow({ scrollTop = false } = {}) {
  const focusKey = document.activeElement?.dataset?.fk;
  const view = VIEWS[route.name] || renderLog;
  let result;
  try {
    result = view(ctx, route.params);
  } catch (e) {
    console.error(e);
    result = { content: h('div', { class: 'card' }, h('p', { class: 'error' }, `Something went wrong: ${e.message}`)) };
  }

  // header + tabs
  const subs = { log: logSubtitle(repo), new: T.sub.new, history: T.sub.history, gear: T.sub.gear, sights: T.sub.sights, settings: T.sub.settings };
  shell.sub.textContent = subs[route.name] || '';
  // The top bar (title, Grades, Settings) is shown only on the Dashboard tab, to save space elsewhere.
  shell.header.hidden = route.name !== 'new';
  for (const [name, el] of Object.entries(shell.tabButtons)) {
    if (name === route.name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }

  shell.main.replaceChildren(result.content);
  if (scrollTop) shell.main.scrollTop = 0;
  renderBanners();

  // overlays: the grading sheet comes from the view; the guide is global
  const st = ui.get();
  const overlay = st.guide ? { ...guideSheet(() => ui.set({ guide: false })), key: 'guide' } : result.overlay ? { ...result.overlay, key: 'view' } : null;
  renderOverlay(overlay);

  if (!overlay && focusKey) {
    const el = shell.main.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (el) el.focus({ preventScroll: true });
  }
}

function renderOverlay(overlay) {
  const opened = overlay && lastOverlayKey !== overlay.key;
  const returnFocus = !overlay && lastOverlayKey;
  lastOverlayKey = overlay ? overlay.key : null;
  overlayClose = overlay ? overlay.onClose : null;
  for (const el of [shell.main, shell.nav, shell.banner]) el.inert = !!overlay;
  shell.header.inert = !!overlay;
  if (!overlay) {
    shell.overlay.replaceChildren();
    shell.overlay.className = 'overlay-root';
    if (returnFocus && !document.activeElement?.closest?.('.main')) {
      // keep the user's place: focus returns to the active slot or the main area
      const target = shell.main.querySelector('.slot.is-active') || shell.main;
      target.focus({ preventScroll: true });
    }
    return;
  }
  shell.overlay.className = `overlay-root open${overlay.below === 'header' ? ' below-header' : ''}`;
  const backdrop = h('div', { class: 'backdrop', onClick: () => overlayClose?.() });
  shell.overlay.replaceChildren(backdrop, overlay.node);
  const first = overlay.node.querySelector('[data-autofocus]') || overlay.node.querySelector('button');
  if (first && (opened || !overlay.node.contains(document.activeElement))) first.focus({ preventScroll: true });
}

function renderBanners() {
  const st = ui.get();
  const items = [];
  if (st.update) {
    items.push(
      h(
        'div',
        { class: 'banner', role: 'status' },
        h('span', null, T.newVersion),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => st.update() }, T.reload),
      ),
    );
  }
  shell.banner.replaceChildren(...items);
}

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  shell.toast.replaceChildren(h('div', { class: 'toast' }, message));
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
  navigate: (path) => router.navigate(path),
  toast,
  save: (name, record) => guard(() => repo.save(name, record)),
  remove: (name, id) => guard(() => (repo.remove(name, id), true)),
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

const router = createRouter((r) => {
  const changed = r.name !== route.name || r.params.join('/') !== route.params.join('/');
  route = r;
  if (changed) ui.quietSet({ newSightIds: [], importPreview: null });
  renderNow({ scrollTop: changed });
});

function applyTheme() {
  const accent = repo.getSettings().accent;
  document.documentElement.style.setProperty('--accent', accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#14181C');
}

function seed() {
  const s = repo.getSettings();
  if (!s.sightsSeeded) {
    if (!repo.list('sightMarks').length) {
      // fixed ids, so the same default row on two devices is one record after sync
      for (const d of DEFAULT_SIGHT_DISTANCES) repo.save('sightMarks', { id: `seed-${d}`, distance: `${d} m`, elevation: '', windage: '', note: '' });
    }
    repo.saveSettings({ sightsSeeded: true });
  }
}

/** After a sync, drop untouched default sight rows whose distance another row already covers. */
function dedupeSeededSightMarks() {
  const marks = repo.list('sightMarks');
  const empty = (m) => !(m.elevation.trim() || m.windage.trim() || m.note.trim());
  for (const m of marks) {
    if (!m.id.startsWith('seed-') || !empty(m)) continue;
    const dist = parseInt(m.distance, 10);
    if (marks.some((o) => o.id !== m.id && parseInt(o.distance, 10) === dist && !(o.id.startsWith('seed-') && empty(o)))) repo.remove('sightMarks', m.id);
  }
}

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
  const silentFailed = result.kind === 'error' && result.silent;
  if (auth.isSignedIn() && !auth.getToken() && navigator.onLine && !silentFailed && (await googleReachable())) {
    auth.signIn({ silent: true });
    return false;
  }
  return true;
}

function fatal(message) {
  document.getElementById('app').replaceChildren(
    h('div', { class: 'fatal' }, h('h1', null, 'The journal could not start'), h('p', null, message)),
  );
}

async function boot() {
  if (!(await handleSignIn())) return;
  registerServiceWorker((apply) => ui.set({ update: apply }));
  requestPersistence();
  try {
    repo.init();
  } catch (e) {
    console.error(e);
    fatal(e.message);
    return;
  }
  seed();
  shell = buildShell();
  applyTheme();
  repo.subscribe((c) => {
    if (c.type === 'settings' || c.type === 'import') applyTheme();
    if (c.type === 'import') renderNow();
    // local edits are pushed to Drive a little later (sync's own writes do not re-trigger it)
    if (['save', 'remove', 'settings', 'import'].includes(c.type)) sync.schedule();
  });
  window.addEventListener('online', () => sync.request());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync.request());
  ui.subscribe(() => renderNow());
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
