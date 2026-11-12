// Forms of the non-scored session types (strength, mental). The same fields are used to create a
// session (New session page) and to edit a saved one (History detail).
import { h, todayIso } from '../../core/dom.js';
import { DRILLS, drillLabel, emptyDrill, MENTAL_TECHNIQUES, EFFORT_MAX, FOCUS_MAX } from '../sessionTypes.js';
import { icons } from '../icons.js';
import { chip, sectionLabel } from './common.js';

/** Empty strength / mental session fields. */
export function emptyForm(type) {
  if (type === 'blank') return { arrows: null, minutes: null, note: '' };
  // the date is left empty for today, so a draft kept overnight is not saved with yesterday's date
  if (type === 'manual') return { date: null, arrows: null, minutes: null, note: '' };
  return type === 'strength'
    ? { minutes: null, effort: null, drills: [], note: '' }
    : { minutes: null, focus: null, techniques: [] };
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Sections of the form. `value` holds the fields as rendered. `change(update, { rerender })` stores a
 * change: `update(current) → patch` runs on the current fields (not the rendered ones), so typing that
 * was stored without re-rendering is never overwritten by a later tap. Typing does not re-render (the
 * field keeps focus); taps do.
 */
export function formSections(type, value, change) {
  const numberField = (label, key, fk, { suffix = '' } = {}) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h(
        'div',
        { class: 'input-suffix' },
        h('input', {
          class: 'input',
          type: 'number',
          inputmode: 'numeric',
          min: 0,
          value: value[key] ?? '',
          dataset: { fk },
          onInput: (e) => change(() => ({ [key]: toInt(e.target.value) }), { rerender: false }),
        }),
        suffix ? h('span', { class: 'muted small' }, suffix) : null,
      ),
    );

  const scale = (label, key, max, fk) =>
    h(
      'section',
      { class: 'setup-section', 'aria-label': label },
      sectionLabel(label),
      h(
        'div',
        { class: 'grid-5' },
        Array.from({ length: max }, (_, i) => i + 1).map((n) =>
          chip({
            label: String(n),
            pressed: value[key] === n,
            fk: `${fk}-${n}`,
            // tapping the chosen value again clears it
            onClick: () => change((cur) => ({ [key]: cur[key] === n ? null : n })),
          }),
        ),
      ),
    );

  const noteField = (placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, 'Note'),
      h('textarea', {
        rows: 3,
        class: 'review-text',
        value: value.note || '',
        placeholder,
        dataset: { fk: 'form-note' },
        onInput: (e) => change(() => ({ note: e.target.value }), { rerender: false }),
      }),
    );

  if (type === 'blank') {
    // only the number of arrows: no score, no target face
    return [
      h(
        'section',
        { class: 'setup-section', 'aria-label': 'Arrows' },
        numberField('Arrows shot', 'arrows', 'arrows'),
        h(
          'div',
          { class: 'grid-4' },
          [3, 6, 12, 30].map((n) =>
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-outline btn-sm',
                'aria-label': `Add ${n} arrows`,
                dataset: { fk: `arrows-add-${n}` },
                onClick: () => change((cur) => ({ arrows: (cur.arrows || 0) + n })),
              },
              `+${n}`,
            ),
          ),
        ),
      ),
      numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      noteField('What you worked on, how it felt…'),
    ];
  }

  if (type === 'manual') {
    // typed in afterwards: the day, then the arrows and / or the duration
    return [
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Date'),
        h('input', {
          class: 'input',
          type: 'date',
          max: todayIso(),
          value: value.date || todayIso(),
          dataset: { fk: 'date' },
          // a cleared date picker keeps the date already stored
          onChange: (e) => e.target.value && change(() => ({ date: e.target.value }), { rerender: false }),
        }),
      ),
      h(
        'div',
        { class: 'grid-2' },
        numberField('Arrows shot', 'arrows', 'arrows'),
        numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      ),
      noteField('What you worked on, how it felt…'),
    ];
  }

  if (type === 'strength') {
    const drills = value.drills || [];
    const setDrill = (i, patch, opts) =>
      change(
        (cur) => ({ drills: (cur.drills || []).map((d, j) => (j === i ? { ...d, ...patch } : d)) }),
        opts,
      );
    const drillInput = (i, d, key, label) =>
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, label),
        h('input', {
          class: 'input',
          type: 'number',
          inputmode: 'numeric',
          min: 0,
          value: d[key] ?? '',
          dataset: { fk: `drill-${i}-${key}` },
          onInput: (e) => setDrill(i, { [key]: toInt(e.target.value) }, { rerender: false }),
        }),
      );
    return [
      h(
        'section',
        { class: 'setup-section', 'aria-label': 'Drills' },
        sectionLabel('Drills'),
        drills.length ? null : h('p', { class: 'muted small' }, 'Add the drills you did.'),
        drills.map((d, i) => {
          const hold = DRILLS.find((x) => x.id === d.kind)?.hold;
          return h(
            'div',
            { class: 'drill-row' },
            h(
              'div',
              { class: 'spread align-center' },
              h('strong', null, drillLabel(d.kind)),
              h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': `Remove ${drillLabel(d.kind)}`,
                  onClick: () => change((cur) => ({ drills: (cur.drills || []).filter((_, j) => j !== i) })),
                },
                icons.close(),
              ),
            ),
            h(
              'div',
              { class: hold ? 'grid-3' : 'grid-2' },
              drillInput(i, d, 'sets', 'Sets'),
              drillInput(i, d, 'reps', 'Reps'),
              hold ? drillInput(i, d, 'holdSec', 'Hold (s)') : null,
            ),
          );
        }),
        h(
          'div',
          { class: 'grid-2' },
          DRILLS.map((d) =>
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-dashed btn-sm',
                dataset: { fk: `add-${d.id}` },
                onClick: () => change((cur) => ({ drills: [...(cur.drills || []), emptyDrill(d.id)] })),
              },
              `+ ${d.label}`,
            ),
          ),
        ),
      ),
      numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      scale(`Effort (1–${EFFORT_MAX})`, 'effort', EFFORT_MAX, 'effort'),
      noteField('How it felt, what you changed…'),
    ];
  }

  // mental
  const techniques = value.techniques || [];
  return [
    h(
      'section',
      { class: 'setup-section', 'aria-label': 'Techniques' },
      sectionLabel('What you practised'),
      h(
        'div',
        { class: 'grid-3' },
        MENTAL_TECHNIQUES.map((t) =>
          chip({
            label: t,
            pressed: techniques.includes(t),
            fk: `tech-${t}`,
            onClick: () =>
              change((cur) => {
                const list = cur.techniques || [];
                return { techniques: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] };
              }),
          }),
        ),
      ),
    ),
    numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
    scale(`Focus / quality (1 best – ${FOCUS_MAX})`, 'focus', FOCUS_MAX, 'focus'),
  ];
}
