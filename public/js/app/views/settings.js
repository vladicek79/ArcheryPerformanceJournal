// Settings: theme, sync, backup / restore and storage diagnostics (ARCHITECTURE §6.6, §8), drawn with the
// APL components. The page has no bottom bar, so no primary button: every action is a secondary one.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { APP_VERSION, SUPPORT_URL, SUPPORT_QR } from '../../config.js';
import { exportBackup, parseBackup } from '../../backup/backup.js';
import { checkForUpdate, storageInfo } from '../../pwa/updates.js';
import { card } from './common.js';

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

export function renderSettings(ctx) {
  const meta = ctx.repo.getMeta();
  const pending = ctx.ui.get().importPreview;

  const storageLine = caption('Checking storage…');
  storageInfo().then((i) => {
    const kb = (n) => (n == null ? '?' : `${Math.round(n / 1024)} KB`);
    storageLine.textContent = `Persistent storage: ${i.persisted == null ? 'unknown' : i.persisted ? 'granted' : 'not granted'} · Used ${kb(i.usage)}${i.quota ? ` of ${Math.round(i.quota / 1048576)} MB` : ''}`;
  });

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

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Settings' }),
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        sectionCard('set-theme', 'Appearance', [
          APL.SegmentedControl({
            label: 'Theme',
            options: THEMES,
            value: ctx.repo.getSettings().theme || 'system',
            onChange: (theme) => ctx.saveSettings({ theme }) && ctx.rerender(),
            fk: 'theme',
          }),
          caption('Light reads better outdoors in daylight. System follows the setting of this device.'),
        ]),
        syncCard(ctx),
        supportCard(),
        sectionCard('set-backup', 'Backup', [
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
          ctx.repo.hasUndoImport()
            ? h('button', { type: 'button', class: 'btn btn-text', onClick: undoImport }, 'Undo last import')
            : null,
          status,
        ]),
        sectionCard('set-about', 'Storage and app', [
          storageLine,
          caption(
            `Version ${APP_VERSION === '__APP_VERSION__' ? 'dev' : APP_VERSION} · ${ctx.env} environment`,
          ),
          APL.Button({
            children: 'Check for new version',
            variant: 'secondary',
            onClick: checkUpdate,
            fk: 'check-update',
          }),
        ]),
      ),
    ),
  };
}

// ---------------------------------------------------------------- Support

/**
 * The "Support the journal" card: a link that opens the tip page in the browser and, when there is
 * one, a QR code of that page for another phone to scan. Nothing when no link is set. The app stays
 * free; this is only an offer.
 */
export function supportCard(url = SUPPORT_URL, qr = SUPPORT_QR) {
  if (!url) return null;
  return sectionCard('set-support', 'Support the journal', [
    caption(
      'The journal is free and stays free, with no ads and no account. If it helps your shooting, you can buy me a coffee to keep it going.',
    ),
    h(
      'a',
      {
        class: ['apl', 'apl-btn', 'apl-btn--secondary', 'support-link'],
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        dataset: { fk: 'support' },
      },
      '☕ Buy me a coffee',
    ),
    qr
      ? h(
          'figure',
          { class: 'support-qr' },
          h('img', { src: qr, alt: 'QR code of the support page', width: 180, height: 180 }),
          h('figcaption', { class: 'apl-cap13' }, 'Or let a friend scan this to tip from their phone.'),
        )
      : null,
  ]);
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
