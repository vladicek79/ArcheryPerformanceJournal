// Forms of the non-scored session types (strength, mental). The same fields are used to create a
// session (New session page) and to edit a saved one (History detail).
import { h } from '../../core/dom.js';
import { DRILLS, drillLabel, emptyDrill, MENTAL_TECHNIQUES, EFFORT_MAX, FOCUS_MAX } from '../sessionTypes.js';
import { icons } from '../icons.js';
import { chip, sectionLabel } from './common.js';

/** Empty strength / mental session fields. */
export function emptyForm(type) {
  if (type === 'blank') return { arrows: null, minutes: null, note: '' };
  if (type === 'manual') return { arrows: null, minutes: null, note: '' };
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
 * `live`: the session is being shot now (New session page with a running timer) — a blank bale count
 * is then tapped up with big +1 / +3 / +6 buttons instead of typed. Editing a saved one keeps the field.
 * `timer`: the session timer, shown on the count's row (right of it).
 */
export function formSections(type, value, change, { live = false, timer = null } = {}) {
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

  if (type === 'blank' && live) {
    // counted while shooting: the count is a big label, tapped up with +1 / +3 / +6. Taps do not
    // re-render the page; the label is updated in place and pops, and a floating "+n" rises from it.
    const count = h(
      'output',
      { class: 'arrow-count', 'aria-live': 'polite', dataset: { fk: 'arrows-count' } },
      String(value.arrows || 0),
    );
    const countBox = h('div', { class: 'arrow-count-box' }, count, h('span', { class: 'arrow-count-unit' }, 'arrows'));
    const replay = (el, cls) => {
      el.classList.remove(cls);
      void el.offsetWidth; // restart the animation on quick repeated taps
      el.classList.add(cls);
    };
    let minusBtn;
    const add = (n, btn) => {
      let next = 0;
      let applied = 0;
      change(
        (cur) => {
          next = Math.max(0, (cur.arrows || 0) + n);
          applied = next - (cur.arrows || 0);
          return { arrows: next };
        },
        { rerender: false },
      );
      count.textContent = String(next);
      minusBtn.disabled = next === 0;
      if (!applied) return;
      replay(count, applied > 0 ? 'is-bumped' : 'is-dropped');
      replay(btn, applied > 0 ? 'is-flashed' : 'is-flashed-minus');
      const fly = h('span', { class: ['arrow-count-fly', applied < 0 && 'is-minus'], 'aria-hidden': 'true' }, applied > 0 ? `+${applied}` : `−${-applied}`);
      fly.addEventListener('animationend', () => fly.remove());
      countBox.append(fly);
      if (navigator.vibrate) navigator.vibrate(15);
    };
    minusBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-outline arrow-add-btn arrow-minus-btn',
        'aria-label': 'Remove 1 arrow',
        disabled: !value.arrows,
        dataset: { fk: 'arrows-minus-1' },
        onClick: (e) => add(-1, e.currentTarget),
      },
      '−1',
    );
    return [
      h(
        'section',
        { class: 'setup-section arrow-counter', 'aria-label': 'Arrows shot' },
        h('div', { class: 'arrow-count-row' }, countBox, timer),
        h(
          'div',
          { class: 'arrow-add-row' },
          minusBtn,
          [1, 3, 6].map((n) =>
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-outline arrow-add-btn',
                'aria-label': `Add ${n} ${n === 1 ? 'arrow' : 'arrows'}`,
                dataset: { fk: `arrows-add-${n}` },
                onClick: (e) => add(n, e.currentTarget),
              },
              `+${n}`,
            ),
          ),
        ),
      ),
      // duration and note are asked when the session is saved (see saveForm in log.js)
    ];
  }

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
    // typed in afterwards (the date and time are set in the When section): arrows and / or duration
    return [
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
