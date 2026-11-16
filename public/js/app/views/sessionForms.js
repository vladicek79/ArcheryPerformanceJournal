// Forms of the non-scored session types (blank bale, SPT, mental, manual), drawn with the APL
// components. The same fields are used to create a session (New session page) and to edit a saved
// one (History detail).
import { h } from '../../core/dom.js';
import {
  DRILLS,
  DRILL_LIMITS,
  SPT_PRESETS,
  drillLabel,
  MENTAL_TECHNIQUES,
  EFFORT_MAX,
  FOCUS_MAX,
} from '../sessionTypes.js';
import {
  hasHold,
  presetOf,
  presetFields,
  drillSummary,
  drillDuration,
  stepValue,
  clampValue,
  newDrill,
} from '../drillView.js';
import { tabataTimer } from './tabataTimer.js';
import { stepperTile } from './common.js';
import { confirmDialog } from './confirm.js';
import * as APL from '../../ui/apl/index.js';

/** Empty strength / mental session fields. */
export function emptyForm(type) {
  if (type === 'blank') return { arrows: null, minutes: null, note: '' };
  if (type === 'manual') return { arrows: null, minutes: null, note: '' };
  return type === 'strength'
    ? { minutes: null, effort: null, drills: [], note: '' }
    : { minutes: null, focus: null, techniques: [] };
}

// --------------------------------------------------------------------------- SPT drills

/**
 * Whether the drills show a primary "Start timer" button: then the page's own Save button steps
 * down to the secondary style, so there are never two green buttons on screen. A done drill is a
 * read-only line: it has no timer to start again.
 */
export const showsStartTimer = (drills = []) => drills.some((d) => hasHold(d) && !d.done);

/** Remove drill `i` after a yes. */
async function removeDrill(i, name, change) {
  const ok = await confirmDialog({
    title: `Remove ${name}?`,
    message: 'The drill and its numbers are taken out of this session.',
    confirmLabel: 'Remove',
    danger: true,
  });
  if (ok) change((c) => ({ drills: (c.drills || []).filter((_, j) => j !== i) }));
}

const DRILL_FIELDS = [
  ['sets', 'Sets', ''],
  ['reps', 'Reps', ''],
  ['holdSec', 'Hold', 's'],
  ['restSec', 'Rest', 's'],
];

const drillIcon = (d) => APL.Icon({ name: hasHold(d) ? 'stopwatch' : 'bow' });

/**
 * The Drills section: a card per drill, then the "+ …" chips that add one. `change` as in
 * formSections. The −/+ tiles and preset chips change a card in place (no page redraw, so a held
 * button keeps repeating); adding, removing and finishing a drill redraw the page. A drill added
 * starts from the numbers of the last one of its kind (this session's, else `pastSessions`').
 */
function drillsSection(drills, change, pastSessions) {
  const setDrill = (i, patch, opts) =>
    change((cur) => ({ drills: (cur.drills || []).map((d, j) => (j === i ? withPatch(d, patch) : d)) }), opts);
  return APL.Section({
    label: 'Drills',
    id: 'form-drills',
    children: [
      h(
        'div',
        { class: 'drill-list' },
        drills.map((d, i) => (d.done ? doneCard(d, i, change) : drillCard(d, i, setDrill, change))),
      ),
      h(
        'div',
        { class: 'drill-add' },
        h('span', { class: 'apl-cap13', id: 'drill-add-label' }, 'Add a drill'),
        h(
          'div',
          { class: 'drill-add-chips', role: 'group', 'aria-labelledby': 'drill-add-label' },
          DRILLS.filter((d) => !d.retired).map((d) =>
            h(
              'button',
              {
                type: 'button',
                class: 'drill-add-chip',
                'aria-label': `Add ${d.label}`,
                dataset: { fk: `add-${d.id}` },
                onClick: () =>
                  change((cur) => ({
                    drills: [...(cur.drills || []), newDrill(d.id, { drills: cur.drills, sessions: pastSessions })],
                  })),
              },
              `+ ${d.short || d.label}`,
            ),
          ),
        ),
      ),
    ],
  });
}

/** A drill with a patch applied; changing its numbers means it was not run like that: no longer done. */
function withPatch(d, patch) {
  const next = { ...d, ...patch };
  if (!('done' in patch) && DRILL_FIELDS.some(([k]) => k in patch && patch[k] !== d[k])) delete next.done;
  return next;
}

/** A done drill: one read-only line (nothing to change, no timer to run again); it can only be removed. */
function doneCard(d, i, change) {
  const name = drillLabel(d.kind);
  return h(
    'section',
    { class: 'drill-done', 'aria-label': `${name}, done` },
    h('span', { class: 'drill-well drill-well--done' }, drillIcon(d)),
    h(
      'span',
      { class: 'apl-stack drill-done-text' },
      h('span', { class: 'apl-t' }, name),
      h('span', { class: 'apl-cap13' }, `${drillSummary(d, { short: true })} · done`),
    ),
    APL.IconButton({
      icon: 'close',
      label: `Remove ${name}`,
      onClick: () => removeDrill(i, name, change),
      fk: `drill-${i}-remove`,
    }),
  );
}

/** The full card of drill `i`: header with summary, presets, −/+ tiles and its action. */
function drillCard(d, i, setDrill, change) {
  const name = drillLabel(d.kind);
  const hold = hasHold(d);
  let cur = d; // the drill as now shown (the tiles change it without a redraw)

  const summary = h('span', { class: 'apl-cap13 drill-summary' });
  const presetBtns = hold
    ? SPT_PRESETS.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'drill-preset',
            dataset: { fk: `drill-${i}-preset-${p.label}` },
            onClick: () => {
              const fields = presetFields(p);
              update(fields);
              for (const [key, tile] of Object.entries(tiles)) tile.setValue(fields[key]);
            },
          },
          p.label,
        ),
      )
    : [];
  const startBtn = hold
    ? APL.Button({
        children: '',
        leadingIcon: 'play',
        fk: `drill-${i}-timer`,
        onClick: async () => {
          const res = await tabataTimer({
            title: name,
            work: cur.holdSec,
            rest: cur.restSec ?? 0,
            reps: cur.reps,
            sets: cur.sets,
          });
          if (res?.completed) setDrill(i, { done: true });
        },
      })
    : null;
  const startText = hold ? h('span') : null;
  startBtn?.append(startText);

  function refresh() {
    summary.textContent = drillSummary(cur);
    if (!hold) return;
    const on = presetOf(cur);
    presetBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(SPT_PRESETS[k] === on)));
    startText.textContent = `Start timer · ${drillDuration(cur)}`;
  }
  function update(patch) {
    cur = withPatch(cur, patch);
    setDrill(i, patch, { rerender: false });
    refresh();
  }

  const tiles = {};
  for (const [key, label, unit] of hold ? DRILL_FIELDS : DRILL_FIELDS.slice(0, 2)) {
    const [min, max, by] = DRILL_LIMITS[key];
    tiles[key] = stepperTile({
      label,
      unit,
      value: d[key],
      min,
      max,
      by,
      step: (v, dir) => stepValue(key, v, dir),
      parse: (text) => clampValue(key, text),
      onChange: (v) => update({ [key]: v }),
      fk: `drill-${i}-${key}`,
    });
  }
  refresh();

  return h(
    'section',
    { class: 'drill-card', 'aria-label': name },
    h(
      'div',
      { class: 'drill-head' },
      h('span', { class: 'drill-well' }, drillIcon(d)),
      h('div', { class: 'apl-stack drill-title' }, h('span', { class: 'drill-name' }, name), summary),
      APL.IconButton({
        icon: 'close',
        label: `Remove ${name}`,
        onClick: () => removeDrill(i, name, change),
        fk: `drill-${i}-remove`,
      }),
    ),
    hold ? h('div', { class: 'drill-presets', role: 'group', 'aria-label': 'Presets' }, presetBtns) : null,
    h('div', { class: 'drill-tiles' }, Object.values(tiles)),
    // a drill without a hold has no timer to finish it: it is marked done by hand
    hold
      ? startBtn
      : h(
          'button',
          {
            type: 'button',
            class: 'btn btn-text drill-mark',
            dataset: { fk: `drill-${i}-done` },
            onClick: () => setDrill(i, { done: true }),
          },
          'Mark done',
        ),
  );
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
 * `pastSessions`: saved sessions, newest first: a new drill starts from the numbers last used.
 */
export function formSections(type, value, change, { live = false, timer = null, pastSessions = [] } = {}) {
  const numberField = (label, key, fk, { suffix = '' } = {}) =>
    APL.TextField({
      label,
      type: 'number',
      inputmode: 'numeric',
      min: 0,
      suffix,
      value: value[key] ?? '',
      fk,
      onInput: (e) => change(() => ({ [key]: toInt(e.target.value) }), { rerender: false }),
    });

  // 1…max as numeric chips, five to a row; tapping the chosen value again clears it
  const scale = (label, key, max, fk) =>
    APL.Section({
      label,
      id: `form-${key}`,
      children: APL.ChipGrid({
        label,
        numeric: true,
        columns: 5,
        value: value[key],
        options: Array.from({ length: max }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
        onChange: (n) => change((cur) => ({ [key]: cur[key] === n ? null : n })),
        fk,
      }),
    });

  const noteField = (placeholder) =>
    APL.TextArea({
      label: 'Note',
      placeholder,
      value: value.note || '',
      fk: 'form-note',
      onInput: (e) => change(() => ({ note: e.target.value }), { rerender: false }),
    });

  if (type === 'blank') {
    // The count is a big number, changed with −1 / +1 / +3 / +6; tapping the number lets you type it
    // (a total from memory, or a larger correction). Changes do not re-render the page: the number
    // is updated in place and pops, and a floating "+n" rises from it.
    // Shot now (`live`): the timer sits beside the count; duration and note are asked on Save (log.js).
    // Logged afterwards or edited in History: Duration and Note fields follow.
    const count = h(
      'button',
      {
        type: 'button',
        class: 'arrow-count',
        'aria-label': `${value.arrows || 0} arrows shot. Tap to type the number`,
        dataset: { fk: 'arrows-count' },
        onClick: () => editCount(),
      },
      String(value.arrows || 0),
    );
    // no visible unit (the big number is self-explanatory); screen readers still hear "arrows"
    const status = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    const countBox = h('div', { class: 'arrow-count-box' }, count, status);
    const replay = (el, cls) => {
      el.classList.remove(cls);
      void el.offsetWidth; // restart the animation on quick repeated taps
      el.classList.add(cls);
    };
    let minusBtn;
    const show = (n) => {
      count.textContent = String(n);
      count.setAttribute('aria-label', `${n} arrows shot. Tap to type the number`);
      status.textContent = `${n} arrows`;
      minusBtn.disabled = n === 0;
    };
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
      show(next);
      if (!applied) return;
      replay(count, applied > 0 ? 'is-bumped' : 'is-dropped');
      replay(btn, applied > 0 ? 'is-flashed' : 'is-flashed-minus');
      const fly = h(
        'span',
        { class: ['arrow-count-fly', applied < 0 && 'is-minus'], 'aria-hidden': 'true' },
        applied > 0 ? `+${applied}` : `−${-applied}`,
      );
      fly.addEventListener('animationend', () => fly.remove());
      countBox.append(fly);
      if (navigator.vibrate) navigator.vibrate(15);
    };
    // the number turns into a field; Enter or leaving it keeps the typed value, Escape keeps the old one
    function editCount() {
      const input = h('input', {
        class: 'input arrow-count-input',
        type: 'number',
        inputmode: 'numeric',
        min: 0,
        value: count.textContent,
        'aria-label': 'Arrows shot',
        dataset: { fk: 'arrows-count-input' },
      });
      let done = false;
      const finish = (keep) => {
        if (done) return;
        done = true;
        const n = toInt(input.value);
        if (keep && n != null) {
          change(() => ({ arrows: n }), { rerender: false });
          show(n);
        }
        input.replaceWith(count);
        count.focus({ preventScroll: true });
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
      count.replaceWith(input);
      input.focus();
      input.select();
    }
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
    const counter = h(
      'section',
      { class: 'apl-section arrow-counter', 'aria-label': 'Arrows shot' },
      timer
        ? h('div', { class: 'arrow-count-row' }, countBox, timer)
        : [h('h2', { class: 'apl-label' }, 'Arrows shot'), countBox],
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
    );
    return live
      ? [counter]
      : [counter, numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }), noteField('…')];
  }

  if (type === 'manual') {
    // typed in afterwards (the date and time are set in the When section): arrows and / or duration
    return [
      h(
        'div',
        { class: 'apl-grid-2' },
        numberField('Arrows shot', 'arrows', 'arrows'),
        numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      ),
      noteField('…'),
    ];
  }

  if (type === 'strength') {
    return [
      drillsSection(value.drills || [], change, pastSessions),
      // While the session runs the page is just the timer and the drills (as on the blank bale
      // page): the timer is the duration, and the duration, effort and note are filled in on the
      // saved session.
      live ? null : numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      live ? null : scale(`Effort (1–${EFFORT_MAX})`, 'effort', EFFORT_MAX, 'effort'),
      live ? null : noteField('…'),
    ];
  }

  // mental
  return [
    APL.Section({
      label: 'What you practised',
      id: 'form-techniques',
      children: APL.OptionPills({
        label: 'What you practised',
        multiple: true,
        value: value.techniques || [],
        options: MENTAL_TECHNIQUES.map((t) => ({ value: t, label: t })),
        onChange: (t) =>
          change((cur) => {
            const list = cur.techniques || [];
            return { techniques: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] };
          }),
        fk: 'tech',
      }),
    }),
    numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
    scale(`Focus / quality (1 best – ${FOCUS_MAX})`, 'focus', FOCUS_MAX, 'focus'),
  ];
}
