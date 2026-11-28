// The exercises of a gym session, drawn with the APL look: one card per exercise with its sets (done,
// reps, kg), "+ Add set (copy last)" and "− Remove last set", the ⋯ menu (rename, move, remove) and
// "Add an exercise". The running gym session (gymRunning.js) and a saved one in History
// (sessionForms.js) both use it.
//
// `change(update, { rerender })` stores a change: `update(current) → patch` runs on the current fields,
// as in sessionForms.js. `ui` is the page's ui state ({ get, set }) for which menu or field is open.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { icons } from '../icons.js';
import { GYM_EXERCISES } from '../sessionTypes.js';
import {
  KG_STEP,
  repsStep,
  clampReps,
  clampKg,
  kgText,
  lastTimeOf,
  progressText,
  setCounts,
  withAddedSet,
  withoutSet,
  newExercise,
  moved,
} from '../gym.js';
import { confirmDialog } from './confirm.js';

/**
 * A value that turns into a field when tapped; Enter or leaving it keeps the typed value, Escape
 * keeps the old one. `commit(text)` gets what was typed.
 */
function editableValue({ text, unit, label, inputmode, fk, dim, commit }) {
  const btn = h(
    'button',
    { type: 'button', class: 'gym-step-value', 'aria-label': `${label}. Tap to type it`, dataset: { fk }, onClick: () => edit() },
    h('span', { class: 'gym-step-n' }, text),
    unit ? h('span', { class: 'gym-step-unit' }, ` ${unit}`) : null,
  );
  function edit() {
    const input = h('input', {
      class: 'input gym-step-input',
      type: 'text',
      inputmode,
      value: text === 'BW' ? '0' : text,
      'aria-label': label,
      dataset: { fk: `${fk}-input` },
    });
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (keep && input.value.trim() !== '') commit(input.value);
      else input.replaceWith(btn);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    btn.replaceWith(input);
    input.focus();
    input.select();
  }
  if (dim) btn.classList.add('is-dim');
  return btn;
}

/** −, the value, +. */
function stepper({ value, unit, label, less, more, inputmode, fk, commit, dim }) {
  const stepBtn = (sign, aria, onClick) =>
    h('button', { type: 'button', class: 'gym-step-btn', 'aria-label': aria, dataset: { fk: `${fk}-${sign === '−' ? 'minus' : 'plus'}` }, onClick }, sign);
  return h(
    'div',
    { class: ['gym-step', dim && 'is-dim'], role: 'group', 'aria-label': label },
    stepBtn('−', less[0], less[1]),
    editableValue({ text: value, unit, label, inputmode, fk, commit }),
    stepBtn('+', more[0], more[1]),
  );
}

/** The inline name field (rename, or a new exercise from Other…). */
function nameInput({ value = '', label, fk, onDone }) {
  const input = h('input', { class: 'input gym-name-input', type: 'text', maxlength: 80, value, 'aria-label': label, dataset: { fk } });
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    onDone(keep ? input.value.trim() : null);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  return input;
}

function setRow(e, s, i, k, updSet) {
  const n = k + 1;
  const timed = e.unit === 's';
  const step = repsStep(e.unit);
  const what = timed ? 'seconds' : 'reps';
  return h(
    'div',
    { class: ['gym-set', s.done && 'is-done'] },
    h(
      'button',
      {
        type: 'button',
        class: 'gym-done',
        'aria-pressed': String(!!s.done),
        'aria-label': `Set ${n} done`,
        dataset: { fk: `gym-${i}-${k}-done` },
        onClick: () => updSet((x) => ({ ...x, done: !x.done })),
      },
      s.done ? icons.check() : String(n),
    ),
    stepper({
      value: String(s.reps ?? 0),
      unit: timed ? 's' : 'reps',
      label: `Set ${n} ${what}`,
      less: [`Fewer ${what}, set ${n}`, () => updSet((x) => ({ ...x, reps: clampReps((x.reps || 0) - step) }))],
      more: [`More ${what}, set ${n}`, () => updSet((x) => ({ ...x, reps: clampReps((x.reps || 0) + step) }))],
      inputmode: 'numeric',
      fk: `gym-${i}-${k}-reps`,
      commit: (t) => updSet((x) => ({ ...x, reps: clampReps(t) })),
      dim: s.done,
    }),
    stepper({
      value: kgText(s.kg),
      unit: s.kg ? 'kg' : '',
      label: `Set ${n} weight${s.kg ? '' : ', body weight'}`,
      less: [`Less weight, set ${n}`, () => updSet((x) => ({ ...x, kg: clampKg((x.kg || 0) - KG_STEP) }))],
      more: [`More weight, set ${n}`, () => updSet((x) => ({ ...x, kg: clampKg((x.kg || 0) + KG_STEP) }))],
      inputmode: 'decimal',
      fk: `gym-${i}-${k}-kg`,
      commit: (t) => updSet((x) => ({ ...x, kg: clampKg(t) })),
      dim: s.done,
    }),
  );
}

/** The ⋯ menu of an exercise, shown in its card while open. */
function menuRow(i, count, act) {
  const item = (label, fk, onClick, { disabled = false, danger = false } = {}) =>
    h('button', { type: 'button', class: ['gym-menu-item', danger && 'danger'], disabled, dataset: { fk }, onClick }, label);
  return h(
    'div',
    { class: 'gym-menu', role: 'group', 'aria-label': 'Exercise actions' },
    item('Rename', `gym-${i}-rename`, () => act('rename')),
    item('Move up', `gym-${i}-up`, () => act('up'), { disabled: i === 0 }),
    item('Move down', `gym-${i}-down`, () => act('down'), { disabled: i === count - 1 }),
    item('Remove', `gym-${i}-remove`, () => act('remove'), { danger: true }),
  );
}

function exerciseCard(e, i, value, change, { sessions, ui }) {
  const st = ui.get();
  const exercises = value.exercises || [];
  const upd = (fn) => change((cur) => ({ exercises: (cur.exercises || []).map((x, j) => (j === i ? fn(x) : x)) }));
  const updSet = (k) => (fn) => upd((x) => ({ ...x, sets: x.sets.map((s, j) => (j === k ? fn(s) : s)) }));
  const menuOpen = st.gymMenu === i;
  const renaming = st.gymRename === i;
  const { done, total } = setCounts(e);
  const last = lastTimeOf(e.name, sessions);

  const act = async (what) => {
    if (what === 'rename') return ui.set({ gymMenu: null, gymRename: i });
    if (what === 'up' || what === 'down') {
      ui.quietSet({ gymMenu: what === 'up' ? i - 1 : i + 1 });
      return change((cur) => ({ exercises: moved(cur.exercises || [], i, what === 'up' ? -1 : 1) }));
    }
    const ok = await confirmDialog({
      title: `Remove ${e.name}?`,
      message: 'The exercise and its sets are taken out of this session.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    ui.quietSet({ gymMenu: null });
    change((cur) => ({ exercises: (cur.exercises || []).filter((_, j) => j !== i) }));
  };

  const title = renaming
    ? nameInput({
        value: e.name,
        label: 'Exercise name',
        fk: `gym-${i}-name`,
        onDone: (name) => {
          ui.quietSet({ gymRename: null });
          if (name) upd((x) => ({ ...x, name }));
          else ui.set({});
        },
      })
    : h('h3', { class: 'gym-card-name' }, e.name);

  return h(
    'section',
    { class: ['gym-card', total > 0 && done === total && 'is-complete'], 'aria-label': e.name },
    h(
      'div',
      { class: 'gym-card-head' },
      h('div', { class: 'gym-card-text' }, title, h('span', { class: 'apl-cap' }, `${progressText(e)} · last time ${last || 'new'}`)),
      h(
        'button',
        {
          type: 'button',
          class: 'gym-more',
          'aria-label': `More for ${e.name}: rename, move, remove`,
          'aria-expanded': String(menuOpen),
          dataset: { fk: `gym-${i}-more` },
          onClick: () => ui.set({ gymMenu: menuOpen ? null : i, gymRename: null }),
        },
        icons.more(),
      ),
    ),
    menuOpen ? menuRow(i, exercises.length, act) : null,
    h('div', { class: 'gym-sets' }, (e.sets || []).map((s, k) => setRow(e, s, i, k, updSet(k)))),
    h(
      'div',
      { class: 'gym-set-actions' },
      h(
        'button',
        { type: 'button', class: 'gym-add-set', dataset: { fk: `gym-${i}-add-set` }, onClick: () => upd(withAddedSet) },
        '+ Add set (copy last)',
      ),
      total
        ? h(
            'button',
            {
              type: 'button',
              class: 'gym-remove-set',
              'aria-label': `Remove set ${total} of ${e.name}`,
              dataset: { fk: `gym-${i}-remove-set` },
              onClick: () => removeLastSet(e, upd),
            },
            '− Remove last set',
          )
        : null,
    ),
  );
}

/** Take out an exercise's last set; one marked done is asked about first. */
async function removeLastSet(e, upd) {
  const last = e.sets.at(-1);
  if (last?.done) {
    const ok = await confirmDialog({
      title: `Remove set ${e.sets.length}?`,
      message: `This set of ${e.name} is marked done. It is taken out of the session.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
  }
  upd((x) => withoutSet(x));
}

/**
 * "Add an exercise": a chip per exercise of My exercises (`choices`) not added yet, and Other… (a
 * name and reps or seconds). With `onSave`, Other… also offers to keep a new name in My exercises.
 */
function addExercise(value, change, ui, { choices, onSave }) {
  const st = ui.get();
  const have = new Set((value.exercises || []).map((e) => e.name.trim().toLowerCase()));
  const add = (name, unit) => change((cur) => ({ exercises: [...(cur.exercises || []), newExercise(name, unit)] }));
  const other = st.gymOther;
  const known = (name) => choices.some((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  const otherForm = other
    ? h(
        'div',
        { class: 'gym-other' },
        nameInput({
          value: other.name || '',
          label: 'New exercise name',
          fk: 'gym-other-name',
          onDone: (name) => ui.quietSet({ gymOther: { ...ui.get().gymOther, name: name ?? '' } }),
        }),
        APL.SegmentedControl({
          label: 'Counted in',
          value: other.unit || 'reps',
          options: [
            { value: 'reps', label: 'Reps' },
            { value: 's', label: 'Seconds' },
          ],
          onChange: (unit) => ui.set({ gymOther: { ...ui.get().gymOther, unit } }),
          fk: 'gym-other-unit',
        }),
        onSave
          ? APL.Switch({
              title: 'Save to My exercises',
              detail: 'Offer it as a chip in every gym session',
              checked: other.save !== false,
              onChange: (on) => ui.set({ gymOther: { ...ui.get().gymOther, save: on } }),
              fk: 'gym-other-save',
            })
          : null,
        h(
          'div',
          { class: 'gym-other-actions' },
          h('button', { type: 'button', class: 'btn btn-text', dataset: { fk: 'gym-other-cancel' }, onClick: () => ui.set({ gymOther: null }) }, 'Cancel'),
          APL.Button({
            children: 'Add exercise',
            variant: 'secondary',
            fk: 'gym-other-add',
            onClick: (ev) => {
              const field = ev.currentTarget.closest('.gym-other')?.querySelector('.gym-name-input');
              const name = (field?.value ?? ui.get().gymOther?.name ?? '').trim();
              if (!name) return field?.focus();
              const form = ui.get().gymOther || other;
              const unit = form.unit || 'reps';
              ui.quietSet({ gymOther: null });
              if (onSave && form.save !== false && !known(name)) onSave(name, unit);
              add(name, unit);
            },
          }),
        ),
      )
    : null;

  return h(
    'section',
    { class: 'gym-add', 'aria-labelledby': 'gym-add-label' },
    h('h2', { class: 'apl-label', id: 'gym-add-label' }, 'Add an exercise'),
    h(
      'div',
      { class: 'gym-chips' },
      choices.filter((x) => !have.has(x.name.toLowerCase())).map((x) =>
        h(
          'button',
          { type: 'button', class: 'gym-chip', dataset: { fk: `gym-suggest-${x.name}` }, onClick: () => add(x.name, x.unit) },
          `+ ${x.name}`,
        ),
      ),
      other
        ? null
        : h(
            'button',
            { type: 'button', class: 'gym-chip gym-chip--other', dataset: { fk: 'gym-other' }, onClick: () => ui.set({ gymOther: { name: '', unit: 'reps' } }) },
            'Other…',
          ),
    ),
    otherForm,
  );
}

/**
 * The exercise cards and "Add an exercise". `sessions`: the saved gym sessions, newest first, for the
 * "last time" lines (leave out the session being edited). `choices`: the visible exercises of My
 * exercises (catalog.js), the built-in ones by default. `onSave(name, unit)`: keeps an exercise
 * added through Other… in My exercises (the running session only).
 */
export function gymExercises(value, change, { sessions = [], ui, choices = GYM_EXERCISES, onSave = null }) {
  return [
    ...(value.exercises || []).map((e, i) => exerciseCard(e, i, value, change, { sessions, ui })),
    addExercise(value, change, ui, { choices, onSave }),
  ];
}
