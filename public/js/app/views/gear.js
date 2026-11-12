// Gear tab: current equipment setup + saved setup snapshots (HANDOFF §7).
import { h, formatDate, todayIso } from '../../core/dom.js';
import { GEAR_GROUPS, GEAR_KEYS, filledCount } from '../gearFields.js';
import { T } from '../strings.js';
import { card } from './common.js';

export function renderGear(ctx) {
  const settings = ctx.repo.getSettings();
  const gear = settings.gear || {};
  const counter = h('span', { class: 'muted small', 'aria-live': 'polite' }, `${filledCount(gear)} / ${GEAR_KEYS.length} filled`);

  const onInput = (key) => (e) => {
    const next = { ...ctx.repo.getSettings().gear, [key]: e.target.value };
    // Editing detaches the setup from the snapshot it was loaded from.
    if (ctx.saveSettings({ gear: next, activeSnapshotId: null })) {
      counter.textContent = `${filledCount(next)} / ${GEAR_KEYS.length} filled`;
    }
  };

  const snapshots = ctx.repo.list('gearSnapshots', { sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  const nameInput = h('input', {
    id: 'setup-name',
    class: 'input grow',
    placeholder: T.snapshotPh,
    value: ctx.ui.get().snapName || '',
    autocomplete: 'off',
    onInput: (e) => ctx.ui.quietSet({ snapName: e.target.value }),
  });

  const saveSnap = () => {
    const name = nameInput.value.trim() || `Setup ${snapshots.length + 1}`;
    const saved = ctx.save('gearSnapshots', { name, date: todayIso(), fields: { ...ctx.repo.getSettings().gear } });
    if (saved) {
      ctx.saveSettings({ activeSnapshotId: saved.id, loadedSnapshotId: saved.id });
      ctx.ui.quietSet({ snapName: '' });
      ctx.rerender();
    }
  };

  // The setup loaded from a saved one can be written back to it (sessions keep their own copy).
  const loaded = snapshots.find((sn) => sn.id === (settings.loadedSnapshotId ?? settings.activeSnapshotId));
  const updateSnap = () => {
    const cur = ctx.repo.get('gearSnapshots', loaded.id);
    if (!cur) return;
    const saved = ctx.save('gearSnapshots', { ...cur, date: todayIso(), fields: { ...ctx.repo.getSettings().gear } });
    if (saved) {
      ctx.saveSettings({ activeSnapshotId: saved.id, loadedSnapshotId: saved.id });
      ctx.toast(`"${saved.name}" updated`);
      ctx.rerender();
    }
  };

  return {
    content: h(
      'div',
      { class: 'stack' },
      h('div', { class: 'title-row' }, h('h1', { class: 'page-title' }, T.equipment), counter),
      GEAR_GROUPS.map((gr) =>
        card(
          { 'aria-label': gr.title },
          h('h2', { class: 'card-title' }, gr.title),
          gr.fields.map(([key, label, ph]) =>
            h(
              'div',
              { class: 'form-row' },
              h('label', { for: `g-${key}` }, label),
              h('input', { id: `g-${key}`, class: 'input', value: gear[key] || '', placeholder: ph, autocomplete: 'off', onInput: onInput(key) }),
            ),
          ),
        ),
      ),
      card(
        { 'aria-labelledby': 'snap-title' },
        h('h2', { class: 'card-title', id: 'snap-title' }, T.snapshots),
        loaded
          ? h(
              'button',
              { type: 'button', class: 'btn btn-primary', dataset: { fk: 'update-snap' }, onClick: updateSnap },
              `Update "${loaded.name}"`,
            )
          : null,
        h(
          'div',
          { class: 'row' },
          h('label', { for: 'setup-name', class: 'sr-only' }, T.snapshotName),
          nameInput,
          h(
            'button',
            { type: 'button', class: loaded ? 'btn btn-outline' : 'btn btn-primary', onClick: saveSnap },
            loaded ? 'Save as new' : T.save,
          ),
        ),
        snapshots.length ? null : h('p', { class: 'muted small' }, T.noSnaps),
        h(
          'ul',
          { class: 'plain-list' },
          snapshots.map((sn) =>
            h(
              'li',
              { class: 'list-row' },
              h(
                'div',
                { class: 'grow' },
                h('div', { class: 'strong' }, sn.name, settings.activeSnapshotId === sn.id ? h('span', { class: 'tag' }, 'current') : null),
                h('div', { class: 'muted small' }, `${formatDate(sn.date)} · ${filledCount(sn.fields)} fields`),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-outline-thin',
                  'aria-label': `${T.load} ${sn.name}`,
                  onClick: () => {
                    if (filledCount(ctx.repo.getSettings().gear) && !confirm(T.confirmLoadSnap(sn.name))) return;
                    if (ctx.saveSettings({ gear: { ...sn.fields }, activeSnapshotId: sn.id, loadedSnapshotId: sn.id })) ctx.rerender();
                  },
                },
                T.load,
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-outline-thin',
                  'aria-label': `${T.delete} ${sn.name}`,
                  onClick: () => {
                    if (!confirm(T.confirmDeleteSnap(sn.name))) return;
                    ctx.remove('gearSnapshots', sn.id);
                    const st = ctx.repo.getSettings();
                    if (st.activeSnapshotId === sn.id || st.loadedSnapshotId === sn.id) {
                      ctx.saveSettings({
                        activeSnapshotId: st.activeSnapshotId === sn.id ? null : st.activeSnapshotId,
                        loadedSnapshotId: st.loadedSnapshotId === sn.id ? null : st.loadedSnapshotId,
                      });
                    }
                    ctx.rerender();
                  },
                },
                T.delete,
              ),
            ),
          ),
        ),
      ),
    ),
  };
}
