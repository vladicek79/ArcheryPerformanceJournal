// Bootstrap (ARCHITECTURE §7.4): service worker → persistence → repository → router → backup reminder.
import { APP_ID, STORAGE_KEY, SCHEMA_VERSION } from './config.js';
import { h } from './core/dom.js';
import { createRouter } from './core/router.js';
import { createState } from './core/state.js';
import { createRepository } from './storage/repository.js';
import { createLocalStorageAdapter } from './storage/localStorageAdapter.js';
import { migrations } from './storage/migrations.js';
import { needsBackupReminder } from './backup/backup.js';
import { registerServiceWorker, requestPersistence } from './pwa/updates.js';
import { collections, defaultSettings, DEFAULT_SIGHT_DISTANCES } from './app/collections.js';
import { T } from './app/strings.js';
import { icons } from './app/icons.js';
import { guideSheet } from './app/views/common.js';
import { renderLog, logSubtitle } from './app/views/log.js';
import { renderHistory } from './app/views/history.js';
import { renderGear } from './app/views/gear.js';
import { renderSights } from './app/views/sights.js';
import { renderSettings } from './app/views/settings.js';

const repo = createRepository({
  adapter: createLocalStorageAdapter(),
  storageKey: STORAGE_KEY,
  appId: APP_ID,
  schemaVersion: SCHEMA_VERSION,
  collections,
  defaultSettings,
  migrations,
});
const ui = createState({ guide: false, bannerDismissed: false, toast: null, update: null });

const TABS = [
  ['log', T.tabs.log, icons.log],
  ['history', T.tabs.history, icons.history],
  ['gear', T.tabs.gear, icons.gear],
  ['sights', T.tabs.sights, icons.sights],
];
const VIEWS = { log: renderLog, history: renderHistory, gear: renderGear, sights: renderSights, settings: renderSettings };

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
  const app = h('div', { class: 'app' }, header, banner, main, nav, overlay, toast);
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
  const subs = { log: logSubtitle(repo), history: T.sub.history, gear: T.sub.gear, sights: T.sub.sights, settings: T.sub.settings };
  shell.sub.textContent = subs[route.name] || '';
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
  // Only after at least one finished session, and never over the logging screen of an active session.
  const sessions = repo.list('sessions');
  const hasData = sessions.some((x) => x.status === 'finished');
  const logging = route.name === 'log' && sessions.some((x) => x.status === 'active');
  if (hasData && !logging && !st.bannerDismissed && route.name !== 'settings' && needsBackupReminder(repo.getMeta().lastBackupAt)) {
    items.push(
      h(
        'div',
        { class: 'banner banner-warn' },
        h('span', null, T.backupReminder),
        h('a', { class: 'btn btn-outline-thin btn-sm', href: '#/settings' }, T.backupNow),
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': T.dismiss, onClick: () => ui.set({ bannerDismissed: true }) }, icons.close()),
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
      for (const d of DEFAULT_SIGHT_DISTANCES) repo.save('sightMarks', { distance: `${d} m`, elevation: '', windage: '', note: '' });
    }
    repo.saveSettings({ sightsSeeded: true });
  }
}

function fatal(message) {
  document.getElementById('app').replaceChildren(
    h('div', { class: 'fatal' }, h('h1', null, 'The journal could not start'), h('p', null, message)),
  );
}

async function boot() {
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
  });
  ui.subscribe(() => renderNow());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayClose) {
      e.preventDefault();
      overlayClose();
    }
  });
  router.start();
}

boot();
