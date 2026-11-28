// Settings › My drills (#/settings/drills), My exercises (#/settings/exercises), Gym focus
// (#/settings/focus) and Mental techniques (#/settings/techniques): the archer's own lists
// (catalog.js), edited with one list editor. A row is tapped to edit it in place; the arrows
// move it, Hide / Show take it off or put it back on the session's "+ …" chips. Entries are never
// deleted: sessions that have them keep reading right. Each edit is saved when it is made.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import {
  allDrillTypes,
  gymExercises,
  gymFocus,
  mentalTechniques,
  drillTypeUsed,
  editList,
  isBuiltInList,
  EDIT_ERRORS,
  NAME_MAX,
  NOUN_MAX,
} from '../catalog.js';

const PAGES = {
  drills: {
    title: 'My drills',
    intro: 'The drills an SPT session offers. A drill with a hold gets the hold and rest tiles, the presets and the interval timer.',
    all: (settings) => allDrillTypes(settings),
    keyOf: (d) => d.id,
    nameOf: (d) => d.label,
    detail: (d) => (d.hold ? `Hold · timer · counted in ${d.noun}s` : `Counted in ${d.noun}s`),
    blank: () => ({ label: '', short: '', hold: false, noun: 'rep' }),
    addLabel: 'Add a drill',
  },
  exercises: {
    title: 'My exercises',
    intro: 'The exercises a gym session offers as chips. Renaming one here leaves past sessions as they were.',
    all: (settings) => gymExercises(settings, { includeHidden: true }),
    keyOf: (e) => e.name,
    nameOf: (e) => e.name,
    detail: (e) => (e.unit === 's' ? 'Held for seconds' : 'Counted in reps'),
    blank: () => ({ name: '', unit: 'reps' }),
    addLabel: 'Add an exercise',
  },
  focus: {
    title: 'Gym focus',
    intro: 'What a gym session can work on, picked on the Gym page. Renaming one here leaves past sessions as they were.',
    all: (settings) => gymFocus(settings, { includeHidden: true }).map((name) => ({ name, hidden: !gymFocus(settings).includes(name) })),
    keyOf: (e) => e.name,
    nameOf: (e) => e.name,
    detail: () => null,
    blank: () => ({ name: '' }),
    addLabel: 'Add a focus',
  },
  techniques: {
    title: 'Mental techniques',
    intro: 'What a mental session can practise. Renaming one here leaves past sessions as they were.',
    all: (settings) =>
      mentalTechniques(settings, { includeHidden: true }).map((name) => ({ name, hidden: !mentalTechniques(settings).includes(name) })),
    keyOf: (e) => e.name,
    nameOf: (e) => e.name,
    detail: () => null,
    blank: () => ({ name: '' }),
    addLabel: 'Add a technique',
  },
};

/** The page names, for the Settings router. */
export const CATALOG_PAGES = Object.keys(PAGES);

const gap = () => h('span', { class: 'cat-move-gap', 'aria-hidden': 'true' });

/** The page of one list: `list` 'drills' or 'exercises'. */
export function renderCatalog(ctx, list) {
  const P = PAGES[list];
  const settings = ctx.repo.getSettings();
  const all = P.all(settings);
  const editing = ctx.ui.get().catalogEdit?.list === list ? ctx.ui.get().catalogEdit : null;
  const sessions = list === 'drills' ? ctx.repo.list('sessions') : [];

  const apply = (edit) => {
    const res = editList(ctx.repo.getSettings(), list, edit);
    if (res.error) return res.error;
    ctx.saveSettings(res.patch);
    return null;
  };
  const act = (edit) => {
    const err = apply(edit);
    ctx.ui.set({ catalogEdit: err ? { list, key: null, error: err } : null });
  };

  async function reset() {
    const ok = await confirmDialog({
      title: `Reset ${P.title}?`,
      message: 'The list goes back to the built-in one. Sessions you saved keep their drills and exercises.',
      confirmLabel: 'Reset',
    });
    if (ok) act({ reset: true });
  }
  const resetBtn = h(
    'button',
    { type: 'button', class: 'grades-reset', disabled: isBuiltInList(settings, list), dataset: { fk: 'catalog-reset' }, onClick: reset },
    'Reset',
  );

  const edit = (key, fields) => ctx.ui.set({ catalogEdit: { list, key, fields, error: null } });
  const visible = all.filter((x) => !x.hidden);
  const hidden = all.filter((x) => x.hidden);

  const row = (x) => {
    const key = P.keyOf(x);
    if (editing?.key === key) return editForm(ctx, list, P, editing, { entry: x, locked: list === 'drills' && drillTypeUsed(x.id, sessions), apply });
    const i = visible.indexOf(x);
    return h(
      'div',
      { class: ['set-row', 'cat-row', x.hidden && 'is-hidden'], dataset: { fk: `catalog-row-${key}` } },
      h(
        'button',
        {
          type: 'button',
          class: 'cat-row-main',
          'aria-label': `Edit ${P.nameOf(x)}`,
          dataset: { fk: `catalog-edit-${key}` },
          onClick: () => edit(key, { ...x }),
        },
        h(
          'span',
          { class: 'set-row-text' },
          h('span', { class: 'set-row-title' }, P.nameOf(x)),
          P.detail(x) ? h('span', { class: 'set-row-sub' }, P.detail(x)) : null,
        ),
      ),
      x.hidden
        ? null
        : h(
            'span',
            { class: 'cat-row-moves' },
            // an empty slot where an arrow is not offered keeps the arrows of the rows lined up
            i > 0 ? APL.IconButton({ icon: 'up', label: `Move ${P.nameOf(x)} up`, onClick: () => act({ move: key, by: -1 }), fk: `catalog-up-${key}` }) : gap(),
            i < visible.length - 1
              ? APL.IconButton({ icon: 'down', label: `Move ${P.nameOf(x)} down`, onClick: () => act({ move: key, by: 1 }), fk: `catalog-down-${key}` })
              : gap(),
          ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-text btn-sm cat-row-toggle',
          'aria-label': `${x.hidden ? 'Show' : 'Hide'} ${P.nameOf(x)}`,
          dataset: { fk: `catalog-${x.hidden ? 'show' : 'hide'}-${key}` },
          onClick: () => act(x.hidden ? { show: key } : { hide: key }),
        },
        x.hidden ? 'Show' : 'Hide',
      ),
    );
  };

  const adding = editing?.key === '';
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: P.title, onBack: () => ctx.navigate('settings'), backLabel: 'Back to settings', trailing: resetBtn }),
      h(
        'div',
        { class: 'apl-screen-body grades-body' },
        h('p', { class: 'apl-cap13' }, P.intro),
        editing?.error && editing.key == null ? h('p', { class: 'cat-error', role: 'alert' }, EDIT_ERRORS[editing.error] || editing.error) : null,
        h('div', { class: 'set-list' }, visible.map(row)),
        adding
          ? editForm(ctx, list, P, editing, { entry: null, locked: false, apply })
          : APL.Button({ children: P.addLabel, variant: 'secondary', leadingIcon: 'plus', onClick: () => edit('', P.blank()), fk: 'catalog-add' }),
        hidden.length
          ? h(
              'section',
              { class: 'set-group', 'aria-labelledby': 'catalog-hidden' },
              h('h2', { class: 'apl-label', id: 'catalog-hidden' }, 'Hidden'),
              h('p', { class: 'apl-cap13' }, 'Not offered in new sessions; sessions that have them still show them.'),
              h('div', { class: 'set-list' }, hidden.map(row)),
            )
          : null,
      ),
    ),
  };
}

/**
 * The form of one entry being edited (or added, `entry` null). Typing is kept without a redraw;
 * Save applies it. `locked`: a drill type used in saved sessions keeps its hold.
 */
function editForm(ctx, list, P, editing, { entry, locked, apply }) {
  const fields = editing.fields;
  const typed = (patch) => ctx.ui.quietSet({ catalogEdit: { ...ctx.ui.get().catalogEdit, fields: Object.assign(fields, patch) } });
  const redraw = (patch) => ctx.ui.set({ catalogEdit: { ...ctx.ui.get().catalogEdit, fields: { ...fields, ...patch } } });
  const save = () => {
    const f = ctx.ui.get().catalogEdit?.fields || fields;
    const err = apply(entry ? { update: P.keyOf(entry), fields: f } : { add: f });
    if (err) ctx.ui.set({ catalogEdit: { ...ctx.ui.get().catalogEdit, error: err } });
    else ctx.ui.set({ catalogEdit: null });
  };
  const cancel = () => ctx.ui.set({ catalogEdit: null });

  const parts =
    list === 'drills'
      ? [
          APL.TextField({ label: 'Name', value: fields.label, fk: 'catalog-name', onInput: (e) => typed({ label: e.target.value.slice(0, NAME_MAX) }) }),
          APL.TextField({
            label: 'Chip name (optional, shorter)',
            value: fields.short || '',
            fk: 'catalog-short',
            onInput: (e) => typed({ short: e.target.value.slice(0, NAME_MAX) }),
          }),
          locked
            ? h('p', { class: 'apl-cap13' }, `${fields.hold ? 'Has a hold' : 'No hold'}: it is in saved sessions, so this stays. Add a new drill for the other kind.`)
            : APL.Switch({
                title: 'Hold timer',
                detail: 'Hold and rest tiles, presets and the interval timer',
                checked: !!fields.hold,
                onChange: (on) => redraw({ hold: on, noun: fields.noun || (on ? 'hold' : 'rep') }),
                fk: 'catalog-hold',
              }),
          APL.TextField({
            label: 'One repetition is called',
            placeholder: 'e.g. draw, pull, rep',
            value: fields.noun,
            fk: 'catalog-noun',
            onInput: (e) => typed({ noun: e.target.value.slice(0, NOUN_MAX) }),
          }),
        ]
      : list !== 'exercises'
        ? [APL.TextField({ label: 'Name', value: fields.name, fk: 'catalog-name', onInput: (e) => typed({ name: e.target.value.slice(0, NAME_MAX) }) })]
        : [
          APL.TextField({ label: 'Name', value: fields.name, fk: 'catalog-name', onInput: (e) => typed({ name: e.target.value.slice(0, NAME_MAX) }) }),
          APL.SegmentedControl({
            label: 'Counted in',
            value: fields.unit,
            options: [
              { value: 'reps', label: 'Reps' },
              { value: 's', label: 'Seconds' },
            ],
            onChange: (unit) => redraw({ unit }),
            fk: 'catalog-unit',
          }),
        ];

  return h(
    'div',
    { class: 'gym-other cat-edit', role: 'group', 'aria-label': entry ? `Edit ${P.nameOf(entry)}` : P.addLabel },
    ...parts,
    editing.error ? h('p', { class: 'cat-error', role: 'alert' }, EDIT_ERRORS[editing.error] || editing.error) : null,
    h(
      'div',
      { class: 'gym-other-actions' },
      h('button', { type: 'button', class: 'btn btn-text', dataset: { fk: 'catalog-cancel' }, onClick: cancel }, 'Cancel'),
      APL.Button({ children: entry ? 'Save' : 'Add', variant: 'secondary', onClick: save, fk: 'catalog-save' }),
    ),
  );
}
