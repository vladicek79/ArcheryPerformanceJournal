// Settings (ARCHITECTURE §6.6, §8): an overview of grouped rows, each opening a page of its own
// (#/settings/<page>), drawn with the APL components. The pages have no bottom bar, so no primary
// button: every action is a secondary one.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { versionLabel, SUPPORT_URL, PAYPAL_ME, TIP_AMOUNTS, STORAGE_KEY } from '../../config.js';
import { journalBytes, formatBytes } from '../../storage/localStorageAdapter.js';
import { exportBackup, parseBackup } from '../../backup/backup.js';
import { exportForAI } from './sessionExport.js';
import { checkForUpdate, storageInfo } from '../../pwa/updates.js';
import { card } from './common.js';
import { paypalMeUrl } from '../support.js';
import { renderGrades } from './settingsGrades.js';
import { renderCatalog, CATALOG_PAGES } from './settingsCatalog.js';
import { drillTypes, gymExercises, gymFocus, mentalTechniques, isBuiltInList } from '../catalog.js';
import { isDefault, scaleName } from '../gradeTexts.js';
import { renderScanSettings, scanPhotosSub, scanMethod } from './settingsScan.js';
import { icons } from '../icons.js';
import { plotMode, plotZoom, autoSpotZoom, ZOOM_LEVELS } from '../plotZoom.js';

// the APL themes; 'system' follows the device (this device only, not synced)
const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const COLLECTION_LABELS = {
  sessions: 'Sessions',
  setups: 'Gear setups',
  competitions: 'Competitions',
};

/** A card holding one APL section. */
const sectionCard = (id, label, children) =>
  card({ class: 'apl-card' }, APL.Section({ label, id, children }));
const caption = (text) => h('p', { class: 'apl-cap13' }, text);

const versionText = (ctx, long = false) => versionLabel({ env: ctx.env }, { long });
const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB') : 'never');

// The sub-pages, by the part after #/settings/. An unknown part shows the overview.
const PAGES = {
  appearance: { title: 'Appearance', render: (ctx) => [appearanceCard(ctx)] },
  plotting: { title: 'Plotting arrows', render: (ctx) => [plottingCard(ctx)] },
  sync: { title: 'Sync & backup', render: (ctx) => [syncCard(ctx), backupCard(ctx)] },
  app: { title: 'Storage & app', render: (ctx) => [aboutCard(ctx)] },
};

export function renderSettings(ctx, params = []) {
  if (params[0] === 'grades') return renderGrades(ctx);
  if (params[0] === 'scan') return renderScanSettings(ctx);
  if (CATALOG_PAGES.includes(params[0])) return renderCatalog(ctx, params[0]);
  const page = PAGES[params[0]];
  if (!page) return overview(ctx);
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: page.title, onBack: () => ctx.navigate('settings'), backLabel: 'Back to settings' }),
      h('div', { class: 'apl-screen-body history-body' }, page.render(ctx)),
    ),
  };
}

// ---------------------------------------------------------------- Overview

/** One row of the overview: icon well, title, a one-line current value, chevron; a link to its page. */
function settingsRow({ page, icon, title, sub, accent = false }) {
  return h(
    'a',
    { class: 'set-row', href: `#/settings/${page}`, dataset: { fk: `settings-${page}` } },
    h('span', { class: ['set-row-icon', accent && 'set-row-icon--accent'], 'aria-hidden': 'true' }, icon),
    h('span', { class: 'set-row-text' }, h('span', { class: 'set-row-title' }, title), sub),
    h('span', { class: 'set-row-chevron', 'aria-hidden': 'true' }, APL.Icon({ name: 'chevron', size: 18 })),
  );
}

function settingsGroup(title, rows) {
  const id = `set-group-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return h(
    'section',
    { class: 'set-group', 'aria-labelledby': id },
    h('h2', { class: 'apl-label', id }, title),
    h('div', { class: 'set-list' }, rows),
  );
}

const rowSub = (text) => h('span', { class: 'set-row-sub' }, text);
/** "3 drills · built-in" / "5 exercises · yours". */
const listSub = (n, noun, builtIn, plural = `${noun}s`) => `${n} ${n === 1 ? noun : plural} · ${builtIn ? 'built-in' : 'yours'}`;

function overview(ctx) {
  const settings = ctx.repo.getSettings();
  const meta = ctx.repo.getMeta();
  const theme = THEMES.find((t) => t.value === (settings.theme || 'system'))?.label || 'System';
  const synced = ctx.sync?.configured && ctx.sync.signedIn();

  const storageSub = rowSub('Storage, version, updates');
  storageInfo().then((i) => {
    if (i.persisted != null) storageSub.textContent = `Persistent storage ${i.persisted ? 'granted' : 'not granted'} · updates`;
  });

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Settings' }),
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        settingsGroup('Training', [
          settingsRow({
            page: 'grades',
            icon: 'M S',
            accent: true,
            title: 'Grades',
            sub: rowSub(
              isDefault(settings, 'm') && isDefault(settings, 's')
                ? 'Default wording of the M and S grades'
                : `Your wording · ${scaleName(settings, 'm')} · ${scaleName(settings, 's')}`,
            ),
          }),
          settingsRow({
            page: 'drills',
            icon: APL.Icon({ name: 'stopwatch' }),
            title: 'My drills',
            sub: rowSub(listSub(drillTypes(settings).length, 'drill', isBuiltInList(settings, 'drills'))),
          }),
          settingsRow({
            page: 'exercises',
            icon: icons.dumbbell(),
            title: 'My exercises',
            sub: rowSub(listSub(gymExercises(settings).length, 'exercise', isBuiltInList(settings, 'exercises'))),
          }),
          settingsRow({
            page: 'focus',
            icon: icons.dumbbell(),
            title: 'Gym focus',
            sub: rowSub(listSub(gymFocus(settings).length, 'focus', isBuiltInList(settings, 'focus'), 'focus areas')),
          }),
          settingsRow({
            page: 'techniques',
            icon: icons.mental(),
            title: 'Mental techniques',
            sub: rowSub(listSub(mentalTechniques(settings).length, 'technique', isBuiltInList(settings, 'techniques'))),
          }),
          settingsRow({
            page: 'plotting',
            icon: APL.Icon({ name: 'target' }),
            title: 'Plotting arrows',
            sub: rowSub(
              [plotMode(settings) === 'zoom' ? `Zoom ${plotZoom(settings)}× under the finger` : 'Loupe in a corner of the face', autoSpotZoom(settings) && 'follows the spots']
                .filter(Boolean)
                .join(' · '),
            ),
          }),
          settingsRow({
            page: 'scan',
            icon: icons.camera(),
            title: 'Scan',
            sub: rowSub(`${scanMethod(settings) === 'network' ? 'Neural network · ' : ''}${scanPhotosSub(settings, ctx.scanPhotos)}`),
          }),
        ]),
        settingsGroup('App', [
          settingsRow({ page: 'appearance', icon: APL.Icon({ name: 'theme' }), title: 'Appearance', sub: rowSub(`Theme: ${theme}`) }),
          settingsRow({
            page: 'sync',
            icon: APL.Icon({ name: 'sync' }),
            title: 'Sync & backup',
            sub: rowSub(`${synced ? 'Google Drive on' : 'Google Drive off'} · last backup ${dateText(meta.lastBackupAt)}`),
          }),
          settingsRow({ page: 'app', icon: APL.Icon({ name: 'info' }), title: 'Storage & app', sub: storageSub }),
        ]),
        supportCard(),
        h('p', { class: 'apl-cap set-version' }, versionText(ctx)),
      ),
    ),
  };
}

// ---------------------------------------------------------------- Appearance

function appearanceCard(ctx) {
  return sectionCard('set-theme', 'Appearance', [
    APL.SegmentedControl({
      label: 'Theme',
      options: THEMES,
      value: ctx.repo.getSettings().theme || 'system',
      onChange: (theme) => ctx.saveSettings({ theme }) && ctx.rerender(),
      fk: 'theme',
    }),
    caption('Light reads better outdoors in daylight. System follows the setting of this device.'),
  ]);
}

// ---------------------------------------------------------------- Plotting arrows

function plottingCard(ctx) {
  const settings = ctx.repo.getSettings();
  const mode = plotMode(settings);
  return sectionCard('set-plotting', 'Plotting arrows', [
    APL.SegmentedControl({
      label: 'Magnify with',
      options: [
        { value: 'loupe', label: 'Loupe' },
        { value: 'zoom', label: 'Zoom' },
      ],
      value: mode,
      onChange: (plotMode) => ctx.saveSettings({ plotMode }) && ctx.rerender(),
      fk: 'plot-mode',
    }),
    caption(
      mode === 'zoom'
        ? 'While you hold the face, the whole face is magnified round the arrow and slides under your finger as it moves. The arrow is always up and to the left of your finger, so it is never hidden.'
        : 'While you hold the face, a magnifier in a corner of the face shows the arrow and its score.',
    ),
    mode === 'zoom'
      ? APL.SegmentedControl({
          label: 'Zoom',
          options: ZOOM_LEVELS.map((z) => ({ value: String(z), label: `${z}×` })),
          value: String(plotZoom(settings)),
          onChange: (z) => ctx.saveSettings({ plotZoom: Number(z) }) && ctx.rerender(),
          fk: 'plot-zoom',
        })
      : null,
    APL.Switch({
      title: 'Follow the spots',
      detail: 'On a triple, Vegas or 4-spot sheet, show the next spot to shoot zoomed in; after each arrow, zoom out and into the next spot, and back to the whole sheet when the end is full',
      checked: autoSpotZoom(settings),
      onChange: (on) => ctx.saveSettings({ autoSpotZoom: on }) && ctx.rerender(),
      fk: 'auto-spot-zoom',
    }),
  ]);
}

// ---------------------------------------------------------------- Backup

function backupCard(ctx) {
  const meta = ctx.repo.getMeta();
  const pending = ctx.ui.get().importPreview;

  const status = h('p', { class: 'apl-cap13 error', role: 'status' });

  const doExport = async () => {
    try {
      if (await exportBackup(ctx.repo)) ctx.rerender();
    } catch (e) {
      status.textContent = `Export failed: ${e.message}`;
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      const { summary } = ctx.repo.prepareImport(parsed);
      ctx.ui.set({ importPreview: { parsed, summary, fileName: file.name } });
    } catch (err) {
      status.textContent = `Import refused: ${err.message}`;
    }
  };

  const applyImport = async (mode) => {
    if (
      mode === 'replace' &&
      !(await confirmDialog({
        title: 'Replace all data?',
        message:
          'All data on this device is replaced with the backup. A safety copy is kept so you can undo.',
        confirmLabel: 'Replace',
        danger: true,
      }))
    )
      return;
    try {
      ctx.repo.importDocument(pending.parsed, { mode });
      ctx.ui.set({ importPreview: null });
      ctx.toast(mode === 'replace' ? 'Backup restored (replaced).' : 'Backup merged.');
    } catch (err) {
      status.textContent = `Import failed: ${err.message}`;
    }
  };

  const undoImport = async () => {
    const ok = await confirmDialog({
      title: 'Undo the last import?',
      message: 'The data is restored as it was before the last Replace import.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    ctx.repo.undoImport();
    ctx.toast('Last import undone.');
  };

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    id: 'import-file',
    onChange: onFile,
  });

  const importPreview = pending
    ? h(
        'div',
        { class: 'import-preview', role: 'region', 'aria-label': 'Import preview' },
        h('span', { class: 'apl-t' }, pending.fileName),
        h(
          'ul',
          { class: 'plain-list apl-cap13' },
          Object.entries(pending.summary.counts).map(([k, n]) =>
            h('li', null, `${COLLECTION_LABELS[k] || k}: ${n}`),
          ),
          h(
            'li',
            null,
            `Newest record: ${pending.summary.newest ? new Date(pending.summary.newest).toLocaleString('en-GB') : '—'}`,
          ),
        ),
        caption(
          'Merge keeps records from both sides (newer edit wins). Replace overwrites everything on this device.',
        ),
        h(
          'div',
          { class: 'apl-grid-2' },
          APL.Button({
            children: 'Merge',
            variant: 'secondary',
            onClick: () => applyImport('merge'),
            fk: 'import-merge',
          }),
          APL.Button({
            children: 'Replace',
            variant: 'secondary',
            onClick: () => applyImport('replace'),
            fk: 'import-replace',
          }),
        ),
        h(
          'button',
          { type: 'button', class: 'btn btn-text', onClick: () => ctx.ui.set({ importPreview: null }) },
          'Cancel',
        ),
      )
    : null;

  return sectionCard('set-backup', 'Backup', [
    caption(
      ctx.sync?.signedIn()
        ? 'Your journal is synced to your Google Drive. A backup file is an extra copy you keep yourself.'
        : 'All data stays on this device. Export a backup file regularly and keep it somewhere private (Drive, e-mail to yourself).',
    ),
    h(
      'p',
      { class: 'apl-cap13' },
      'Last backup: ',
      h(
        'strong',
        { class: 'apl-ink' },
        meta.lastBackupAt ? new Date(meta.lastBackupAt).toLocaleString('en-GB') : 'never',
      ),
    ),
    h(
      'div',
      { class: 'apl-grid-2' },
      APL.Button({ children: 'Export backup', variant: 'secondary', onClick: doExport, fk: 'export' }),
      APL.Button({
        children: 'Import…',
        variant: 'secondary',
        onClick: () => fileInput.click(),
        fk: 'import',
      }),
    ),
    fileInput,
    importPreview,
    caption('For an AI agent such as Claude: every session as one JSON file with readable field names and a glossary, to attach in the chat.'),
    APL.Button({
      children: 'Export sessions for AI (JSON)',
      variant: 'secondary',
      onClick: () => exportForAI(ctx.repo).catch((e) => (status.textContent = `Export failed: ${e.message}`)),
      fk: 'export-ai',
    }),
    ctx.repo.hasUndoImport()
      ? h('button', { type: 'button', class: 'btn btn-text', onClick: undoImport }, 'Undo last import')
      : null,
    status,
  ]);
}

// ---------------------------------------------------------------- Storage and app

function aboutCard(ctx) {
  // the journal itself (its document on this device, and the safety copies beside it), then what the
  // browser counts: the app's files (the offline app, the scan network) and scan photos waiting to
  // upload, but not the journal (localStorage is not in its estimate), and what it allows
  const { data, copies } = journalBytes(STORAGE_KEY);
  const journalLine = caption(`Journal data: ${formatBytes(data)}${copies ? ` · safety copies ${formatBytes(copies)}` : ''}`);
  const storageLine = caption('Checking storage…');
  storageInfo().then((i) => {
    const persisted = i.persisted == null ? 'unknown' : i.persisted ? 'granted' : 'not granted';
    const used = i.usage == null ? '' : ` · app files and scan photos ${formatBytes(i.usage)}${i.quota ? ` (the browser allows ${formatBytes(i.quota)})` : ''}`;
    storageLine.textContent = `Persistent storage: ${persisted}${used}`;
  });

  const checkUpdate = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const result = await checkForUpdate().catch(() => 'offline');
    if (result === 'updating') {
      // the page reloads by itself as soon as the new version has taken over
      btn.textContent = 'New version found. Reloading…';
      return;
    }
    btn.disabled = false;
    btn.textContent = 'Check for new version';
    ctx.toast(
      result === 'current'
        ? 'You have the latest version.'
        : result === 'offline'
          ? 'Could not check for a new version. Are you online?'
          : 'Updates are not available in this browser.',
    );
  };

  return sectionCard('set-about', 'Storage and app', [
    journalLine,
    storageLine,
    caption(versionText(ctx, true)),
    APL.Button({
      children: 'Check for new version',
      variant: 'secondary',
      onClick: checkUpdate,
      fk: 'check-update',
    }),
  ]);
}

// ---------------------------------------------------------------- Support

/** A link that looks like a secondary button and opens in the browser. */
function tipLink(href, label, fk, extra = []) {
  return h(
    'a',
    {
      class: ['apl', 'apl-btn', 'apl-btn--secondary', 'support-link', ...extra],
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      dataset: { fk },
    },
    label,
  );
}

/**
 * The "Support the journal" group: PayPal buttons with the amount filled in (when a PayPal.Me name is
 * set) and a link to the tip page. Nothing when neither is set. The app stays free; this is only an offer.
 */
export function supportCard(url = SUPPORT_URL, paypal = PAYPAL_ME, amounts = TIP_AMOUNTS) {
  if (!url && !paypal) return null;
  // laid out like the overview's groups: the label above a bordered box
  return settingsGroup('Support the journal', h('div', { class: 'set-list set-box' }, [
    caption(
      'The journal is free and stays free, with no ads and no account. If it helps your shooting, you can buy me a coffee to keep it going.',
    ),
    paypal
      ? h(
          'div',
          { class: 'support-paypal' },
          h('div', { class: 'apl-cap13' }, 'Tip with PayPal'),
          h(
            'div',
            { class: 'support-amounts' },
            amounts.map((a) => tipLink(paypalMeUrl(paypal, a), `€${a}`, `support-paypal-${a}`)),
            tipLink(paypalMeUrl(paypal), 'Other', 'support-paypal-other'),
          ),
        )
      : null,
    url ? tipLink(url, paypal ? '☕ Other ways (Ko-fi)' : '☕ Buy me a coffee', 'support') : null,
  ]));
}

// ---------------------------------------------------------------- Google Drive sync

const SYNC_ERRORS = {
  offline: 'Offline — will sync when back online.',
  auth: 'Google sign-in expired.',
  'newer-version': 'Drive has data from a newer app version. Reload to update the app.',
  drive: 'Google Drive error.',
};

function syncStatusText(st) {
  if (st.state === 'syncing') return 'Syncing…';
  if (st.state === 'error') return SYNC_ERRORS[st.error] || 'Sync failed.';
  if (st.at) return `Last synced ${new Date(st.at).toLocaleString('en-GB')}`;
  return 'Not synced yet.';
}

function syncCard(ctx) {
  const s = ctx.sync;
  const title = 'Sync with Google Drive';
  if (!s || !s.configured) {
    return sectionCard(
      'set-sync',
      title,
      caption('Not set up in this build (no Google client ID configured).'),
    );
  }
  const signInError = ctx.ui.get().signInError;
  if (!s.signedIn()) {
    return sectionCard('set-sync', title, [
      caption(
        'Keep a copy of the journal in your own Google Drive (a hidden app-only folder) and use it on more than one device. The app works offline as before; it syncs when online.',
      ),
      signInError
        ? h(
            'p',
            { class: 'apl-cap13 error', role: 'alert' },
            `Google sign-in did not complete (${signInError}).`,
          )
        : null,
      APL.Button({
        children: 'Continue with Google',
        variant: 'secondary',
        onClick: () => s.signIn(),
        fk: 'sign-in',
      }),
      h('p', { class: 'apl-cap' }, 'Tip: export a backup below before the first sync.'),
    ]);
  }
  const st = s.status();
  const lastSync = ctx.repo.getMeta().lastSyncAt;
  const shown = st.state === 'idle' && lastSync ? { ...st, at: lastSync } : st;
  const signOut = async () => {
    const ok = await confirmDialog({
      title: 'Stop syncing?',
      message: 'Sync stops on this device. The journal stays on this device and in Drive.',
      confirmLabel: 'Stop syncing',
    });
    if (!ok) return;
    s.signOut();
    ctx.rerender();
  };
  return sectionCard('set-sync', title, [
    h(
      'p',
      { class: 'apl-cap13' },
      'Connected',
      s.email() ? [' as ', h('strong', { class: 'apl-ink' }, s.email())] : null,
    ),
    h(
      'p',
      { class: ['apl-cap13', shown.state === 'error' && 'error'], role: 'status' },
      syncStatusText(shown),
      st.message ? ` ${st.message}` : '',
    ),
    h(
      'div',
      { class: 'apl-grid-2' },
      st.state === 'error' && st.error === 'auth'
        ? APL.Button({
            children: 'Reconnect Google',
            variant: 'secondary',
            onClick: () => s.signIn(),
            fk: 'reconnect',
          })
        : APL.Button({
            children: 'Sync now',
            variant: 'secondary',
            disabled: st.state === 'syncing',
            onClick: () => s.now(),
            fk: 'sync-now',
          }),
      APL.Button({ children: 'Sign out', variant: 'secondary', onClick: signOut, fk: 'sign-out' }),
    ),
  ]);
}
