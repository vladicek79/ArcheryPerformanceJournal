// Settings: logging preferences, backup / restore and storage diagnostics (ARCHITECTURE §6.6, §8).
import { h } from '../../core/dom.js';
import { APP_VERSION } from '../../config.js';
import { exportBackup, parseBackup } from '../../backup/backup.js';
import { storageInfo } from '../../pwa/updates.js';
import { ACCENTS } from '../collections.js';
import { card } from './common.js';

const COLLECTION_LABELS = { sessions: 'Sessions', gearSnapshots: 'Gear snapshots', sightMarks: 'Sight marks', competitions: 'Competitions' };
const ACCENT_NAMES = { '#0B6E4F': 'Green', '#14181C': 'Ink', '#1D4ED8': 'Blue', '#B45309': 'Amber' };

export function renderSettings(ctx) {
  const settings = ctx.repo.getSettings();
  const meta = ctx.repo.getMeta();
  const pending = ctx.ui.get().importPreview;

  const storageLine = h('p', { class: 'muted small' }, 'Checking storage…');
  storageInfo().then((i) => {
    const kb = (n) => (n == null ? '?' : `${Math.round(n / 1024)} KB`);
    storageLine.textContent = `Persistent storage: ${i.persisted == null ? 'unknown' : i.persisted ? 'granted' : 'not granted'} · Used ${kb(i.usage)}${i.quota ? ` of ${Math.round(i.quota / 1048576)} MB` : ''}`;
  });

  const status = h('p', { class: 'small', role: 'status' });

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

  const applyImport = (mode) => {
    if (mode === 'replace' && !confirm('Replace all data on this device with the backup? A safety copy is kept so you can undo.')) return;
    try {
      ctx.repo.importDocument(pending.parsed, { mode });
      ctx.ui.set({ importPreview: null });
      ctx.toast(mode === 'replace' ? 'Backup restored (replaced).' : 'Backup merged.');
    } catch (err) {
      status.textContent = `Import failed: ${err.message}`;
    }
  };

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file', onChange: onFile });

  return {
    content: h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title' }, 'Settings'),
      card(
        { 'aria-labelledby': 'set-log' },
        h('h2', { class: 'card-title', id: 'set-log' }, 'Logging'),
        h(
          'label',
          { class: 'switch-row' },
          h('span', null, 'Ask for grades after each arrow', h('span', { class: 'muted small block' }, 'When off, tap a scored arrow to grade it later.')),
          h('input', {
            type: 'checkbox',
            class: 'switch',
            checked: settings.askGrades,
            onChange: (e) => ctx.saveSettings({ askGrades: e.target.checked }),
          }),
        ),
        h('div', { class: 'field-label', id: 'lbl-accent' }, 'Accent colour'),
        h(
          'div',
          { class: 'swatches', role: 'group', 'aria-labelledby': 'lbl-accent' },
          ACCENTS.map((c) =>
            h('button', {
              type: 'button',
              class: 'swatch',
              style: { '--swatch': c },
              'aria-label': ACCENT_NAMES[c] || c,
              'aria-pressed': String(settings.accent === c),
              dataset: { fk: `accent-${c}` },
              onClick: () => ctx.saveSettings({ accent: c }) && ctx.rerender(),
            }),
          ),
        ),
      ),
      card(
        { 'aria-labelledby': 'set-backup' },
        h('h2', { class: 'card-title', id: 'set-backup' }, 'Backup'),
        h('p', { class: 'muted small' }, 'All data stays on this device. Export a backup file regularly and keep it somewhere private (Drive, e-mail to yourself).'),
        h('p', { class: 'small' }, 'Last backup: ', h('strong', null, meta.lastBackupAt ? new Date(meta.lastBackupAt).toLocaleString('en-GB') : 'never')),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-primary grow-1', onClick: doExport }, 'Export backup'),
          h('button', { type: 'button', class: 'btn btn-outline grow-1', onClick: () => fileInput.click() }, 'Import…'),
          fileInput,
        ),
        pending
          ? h(
              'div',
              { class: 'import-preview', role: 'region', 'aria-label': 'Import preview' },
              h('div', { class: 'strong' }, pending.fileName),
              h(
                'ul',
                { class: 'plain-list small' },
                Object.entries(pending.summary.counts).map(([k, n]) => h('li', null, `${COLLECTION_LABELS[k] || k}: ${n}`)),
                h('li', { class: 'muted' }, `Newest record: ${pending.summary.newest ? new Date(pending.summary.newest).toLocaleString('en-GB') : '—'}`),
              ),
              h('p', { class: 'muted small' }, 'Merge keeps records from both sides (newer edit wins). Replace overwrites everything on this device.'),
              h(
                'div',
                { class: 'row' },
                h('button', { type: 'button', class: 'btn btn-primary grow-1', onClick: () => applyImport('merge') }, 'Merge'),
                h('button', { type: 'button', class: 'btn btn-outline grow-1', onClick: () => applyImport('replace') }, 'Replace'),
                h('button', { type: 'button', class: 'btn btn-outline-thin', onClick: () => ctx.ui.set({ importPreview: null }) }, 'Cancel'),
              ),
            )
          : null,
        ctx.repo.hasUndoImport()
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text',
                onClick: () => {
                  if (!confirm('Restore the data as it was before the last Replace import?')) return;
                  ctx.repo.undoImport();
                  ctx.toast('Last import undone.');
                },
              },
              'Undo last import',
            )
          : null,
        status,
      ),
      card(
        { 'aria-labelledby': 'set-about' },
        h('h2', { class: 'card-title', id: 'set-about' }, 'Storage & app'),
        storageLine,
        h('p', { class: 'muted small' }, `Version ${APP_VERSION === '__APP_VERSION__' ? 'dev' : APP_VERSION}`),
      ),
    ),
  };
}
