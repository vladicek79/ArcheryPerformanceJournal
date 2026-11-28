// Forms of the non-scored session types (blank bale, SPT, gym, mental, manual), drawn with the APL
// components. The same fields are used to create a session (New session page) and to edit a saved
// one (History detail).
import { h } from '../../core/dom.js';
import {
  DRILL_LIMITS,
  SPT_PRESETS,
  EFFORT_MAX,
  FOCUS_MAX,
} from '../sessionTypes.js';
import { gymExercises } from './gymForm.js';
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
import {
  allDrillTypes,
  drillTypeOf,
  gymExercises as catalogExercises,
  gymFocus,
  mentalTechniques,
  choicesWith,
  inListOrder,
} from '../catalog.js';
import { tabataTimer } from './tabataTimer.js';
import { stepperTile } from './common.js';
import { confirmDialog } from './confirm.js';
import * as APL from '../../ui/apl/index.js';

// --------------------------------------------------------------------------- SPT drills

/**
 * Whether the drills show a primary "Start timer" button: then the page's own Save button steps
 * down to the secondary style, so there are never two green buttons on screen. A done drill is a
 * read-only line: it has no timer to start again.
 */
export const showsStartTimer = (drills = [], types) => drills.some((d) => hasHold(d, types) && !d.done);

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

const drillIcon = (d, types) => APL.Icon({ name: hasHold(d, types) ? 'stopwatch' : 'bow' });

/**
 * The Drills section: a card per drill, then the "+ …" chips that add one (the visible drill types
 * of My drills). `change` as in formSections; `types`: all drill types. The −/+ tiles and preset
 * chips change a card in place (no page redraw, so a held button keeps repeating); adding, removing
 * and finishing a drill redraw the page. A drill added starts from the numbers of the last one of
 * its kind (this session's, else `pastSessions`').
 */
function drillsSection(drills, change, pastSessions, types) {
  const setDrill = (i, patch, opts) =>
    change((cur) => ({ drills: (cur.drills || []).map((d, j) => (j === i ? withPatch(d, patch) : d)) }), opts);
  return APL.Section({
    label: 'Drills',
    id: 'form-drills',
    children: [
      h(
        'div',
        { class: 'drill-list' },
        drills.map((d, i) => (d.done ? doneCard(d, i, change, types) : drillCard(d, i, setDrill, change, types))),
      ),
      h(
        'div',
        { class: 'drill-add' },
        h('span', { class: 'apl-cap13', id: 'drill-add-label' }, 'Add a drill'),
        h(
          'div',
          { class: 'drill-add-chips', role: 'group', 'aria-labelledby': 'drill-add-label' },
          types.filter((d) => !d.hidden).map((d) =>
            h(
              'button',
              {
                type: 'button',
                class: 'drill-add-chip',
                'aria-label': `Add ${d.label}`,
                dataset: { fk: `add-${d.id}` },
                onClick: () =>
                  change((cur) => ({
                    drills: [...(cur.drills || []), newDrill(d.id, { drills: cur.drills, sessions: pastSessions, types })],
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
function doneCard(d, i, change, types) {
  const name = drillTypeOf(d, types).label;
  return h(
    'section',
    { class: 'drill-done', 'aria-label': `${name}, done` },
    h('span', { class: 'drill-well drill-well--done' }, drillIcon(d, types)),
    h(
      'span',
      { class: 'apl-stack drill-done-text' },
      h('span', { class: 'apl-t' }, name),
      h('span', { class: 'apl-cap13' }, `${drillSummary(d, { short: true, types })} · done`),
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
function drillCard(d, i, setDrill, change, types) {
  const name = drillTypeOf(d, types).label;
  const hold = hasHold(d, types);
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
    summary.textContent = drillSummary(cur, { types });
    if (!hold) return;
    const on = presetOf(cur, types);
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
      h('span', { class: 'drill-well' }, drillIcon(d, types)),
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
    // a hold drill is done when its timer finishes, or by hand (the timer skipped); a drill
    // without a hold has no timer: it is marked done by hand only
    startBtn,
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-text drill-mark',
        dataset: { fk: `drill-${i}-done` },
        onClick: () => setDrill(i, { done: true }),
      },
      hold ? 'Mark done without timer' : 'Mark done',
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
 * `live`: the session is being done now (an SPT session with a running timer): the fields filled in
 * on the saved session are left out.
 * `pastSessions`: saved sessions, newest first: a new drill starts from the numbers last used; a gym
 * exercise shows what was done last time.
 * `ui`: the page's ui state (gym: which exercise menu or field is open).
 * `settings`: where My drills and My exercises are read from (catalog.js); the built-in lists without.
 */
export function formSections(type, value, change, { live = false, pastSessions = [], ui = null, settings = null } = {}) {
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
    // Logged afterwards or edited in History (the running blank bale has its own page, blankBale.js):
    // the count is typed, in one big field. Duration and Note follow.
    const counter = h(
      'section',
      { class: 'apl-section arrow-counter' },
      h('label', { class: 'apl-label', for: 'form-arrows' }, 'Arrows shot'),
      h('input', {
        id: 'form-arrows',
        class: 'input arrow-count-input',
        type: 'number',
        inputmode: 'numeric',
        min: 0,
        placeholder: '0',
        value: value.arrows ?? '',
        dataset: { fk: 'arrows-count-input' },
        onInput: (e) => change(() => ({ arrows: toInt(e.target.value) }), { rerender: false }),
      }),
    );
    return [counter, numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }), noteField('…')];
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

  if (type === 'gym') {
    // a saved gym session (History): the running page's exercise cards, the focus, duration and note
    return [
      APL.Section({
        label: 'Focus',
        id: 'form-gym-focus',
        children: APL.OptionPills({
          label: 'Focus',
          multiple: true,
          value: value.focus || [],
          // the archer's focus list, plus any focus of this session hidden or renamed since
          options: choicesWith(gymFocus(settings), value.focus).map((f) => ({ value: f, label: f })),
          onChange: (f) =>
            change((cur) => {
              const list = cur.focus || [];
              const next = list.includes(f) ? list.filter((x) => x !== f) : [...list, f];
              return { focus: inListOrder(next, gymFocus(settings, { includeHidden: true })) };
            }),
          fk: 'gym-focus',
        }),
      }),
      ...gymExercises(value, change, { sessions: pastSessions, ui, choices: catalogExercises(settings) }),
      numberField('Duration', 'minutes', 'minutes', { suffix: 'min' }),
      noteField('Or just write what you did…'),
    ];
  }

  if (type === 'strength') {
    return [
      drillsSection(value.drills || [], change, pastSessions, allDrillTypes(settings)),
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
        // the archer's techniques, plus any of this session hidden or renamed since
        options: choicesWith(mentalTechniques(settings), value.techniques).map((t) => ({ value: t, label: t })),
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
