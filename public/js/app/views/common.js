// Small shared view pieces.
import { h, todayIso } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { zoneOf } from '../scoring.js';
import { RUBRIC, T } from '../strings.js';
import { gearChoices, setupSummary } from '../gearFields.js';
import { isScored } from '../sessionTypes.js';
import { datePicker, timePicker } from './pickers.js';

export const scoreChip = (v, extra = '') => h('span', { class: `score-chip z-${zoneOf(v)} ${extra}` }, v == null ? '' : String(v));

export const gradeBadge = (g, extra = '') => h('span', { class: `grade-badge g${g} ${extra}` }, String(g));

export const card = (props, ...children) => h('section', { ...props, class: ['card', props?.class] }, ...children);

/** Bottom sheet with the full M/S rubric. */
export function guideSheet(onClose) {
  return {
    onClose,
    node: APL.Dialog({
      sheet: true,
      title: T.gradingGuide,
      idPrefix: 'guide',
      onClose,
      closeLabel: 'Close grading guide',
      children: [
        h('p', { class: 'apl-cap13' }, T.guideIntro),
        h(
          'table',
          { class: 'guide-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Grade')),
              h('th', { scope: 'col' }, T.mentalProgram),
              h('th', { scope: 'col' }, T.shootingCycle),
            ),
          ),
          h(
            'tbody',
            null,
            [1, 2, 3, 4, 5].map((g) =>
              h('tr', null, h('th', { scope: 'row' }, gradeBadge(g)), h('td', null, RUBRIC.m[g - 1]), h('td', null, RUBRIC.s[g - 1])),
            ),
          ),
        ),
      ],
    }),
  };
}

const STEP_DELAY_MS = 400; // a held −/+ starts repeating after this
const STEP_REPEAT_MS = 100; // …and then steps this often

/**
 * A −/+ tile: the label on top, a big value (with its `unit` in muted) between 44px − and +
 * buttons, on surface-sunken. Holding − or + repeats. Tapping the value turns it into a field for
 * an exact number (Enter or leaving keeps it, Escape keeps the old one).
 *
 * The tile updates itself and never needs the page to redraw (a redraw in the middle of a long
 * press would drop the button under the finger): `onChange(value)` reports each new value.
 *
 * `step(value, dir)` gives the value after one tap (dir -1 or 1); by default ±`by` within
 * `min`–`max`. `parse(text)` turns a typed value into one (null: keep the old one); by default a
 * whole number within `min`–`max`.
 */
export function stepperTile({ label, value, unit = '', min = 0, max = 999, by = 1, step, parse, onChange, fk }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const stepOf = step || ((v, dir) => clamp((v ?? min) + dir * by));
  const parseOf =
    parse ||
    ((text) => {
      const n = Math.round(Number(text));
      return text === '' || !Number.isFinite(n) ? null : clamp(n);
    });
  const name = label.toLowerCase();
  let current = value;

  const num = h('span', { class: 'stepper-num' });
  const out = h('output', { class: 'stepper-out', 'aria-live': 'polite' }, num, unit ? h('span', { class: 'stepper-unit' }, ` ${unit}`) : null);
  const valueBtn = h(
    'button',
    { type: 'button', class: 'stepper-value', dataset: fk ? { fk: `${fk}-value` } : undefined, onClick: () => edit() },
    out,
  );

  const press = (dir) => {
    let timer = 0;
    let fromPointer = false;
    const stop = () => {
      clearTimeout(timer);
      timer = 0;
    };
    const once = () => {
      const next = stepOf(current, dir);
      if (next === current) return false;
      set(next, true);
      return true;
    };
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'stepper-btn',
        'aria-label': `${dir > 0 ? 'Increase' : 'Decrease'} ${name}`,
        dataset: fk ? { fk: `${fk}-${dir > 0 ? 'up' : 'down'}` } : undefined,
        onPointerdown: (e) => {
          if (e.button !== 0) return;
          fromPointer = true;
          stop();
          if (!once()) return;
          const repeat = () => {
            timer = once() ? setTimeout(repeat, STEP_REPEAT_MS) : 0;
          };
          timer = setTimeout(repeat, STEP_DELAY_MS);
        },
        onPointerup: stop,
        onPointerleave: stop,
        onPointercancel: stop,
        onContextmenu: (e) => e.preventDefault(), // a long press is not a right-click
        // keyboard (Enter / Space) and assistive technology click without a pointer
        onClick: () => {
          if (fromPointer) fromPointer = false;
          else once();
        },
      },
      dir > 0 ? '+' : '−',
    );
    return btn;
  };
  const down = press(-1);
  const up = press(1);

  function show() {
    num.textContent = current == null ? '–' : String(current);
    valueBtn.setAttribute('aria-label', `${label}: ${current ?? 'not set'}${unit && current != null ? ` ${unit}` : ''}. Tap to type`);
    down.setAttribute('aria-disabled', String(current != null && stepOf(current, -1) === current));
    up.setAttribute('aria-disabled', String(current != null && stepOf(current, 1) === current));
  }
  function set(v, report) {
    current = v;
    show();
    if (report) onChange?.(v);
  }

  function edit() {
    const input = h('input', {
      class: 'input stepper-input',
      type: 'number',
      inputmode: 'numeric',
      min,
      max,
      value: current ?? '',
      'aria-label': unit ? `${label} (${unit})` : label,
      dataset: fk ? { fk: `${fk}-input` } : undefined,
    });
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      const n = keep ? parseOf(input.value) : null;
      input.replaceWith(valueBtn);
      if (n != null && n !== current) set(n, true);
      valueBtn.focus({ preventScroll: true });
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
    valueBtn.replaceWith(input);
    input.focus();
    input.select();
  }

  show();
  const tile = h(
    'div',
    { class: 'stepper-tile', role: 'group', 'aria-label': label },
    h('span', { class: 'stepper-label', 'aria-hidden': 'true' }, label),
    h('div', { class: 'stepper-row' }, down, valueBtn, up),
  );
  /** Show a value set from outside (a preset), without reporting it. */
  tile.setValue = (v) => set(v, false);
  return tile;
}

/** Dates that already have a session (marked with a dot in the date picker). */
export const sessionDates = (ctx) => new Set(ctx.repo.list('sessions').map((s) => s.date));

/** Date and start time of a finished session, editable in History (a cleared time is removed). */
export function whenCard(ctx, ss) {
  const redraw = ({ status }) => status === 'saved' && ctx.rerender();
  const change = (when) => redraw(ctx.finished.setWhen(ss.id, when));
  return card(
    { class: 'apl-card' },
    APL.Section({
      label: 'When',
      id: 'edit-when',
      children: [
        h(
          'div',
          { class: 'apl-grid-2' },
          datePicker({
            label: 'Date',
            value: ss.date,
            max: todayIso(),
            marks: sessionDates(ctx),
            fk: 'edit-date',
            onChange: (date) => change({ date }),
          }),
          timePicker({
            label: 'Start time',
            value: ss.time || '',
            clearable: true,
            fk: 'edit-time',
            hint: 'Start time',
            onChange: (time) => change({ time }),
          }),
        ),
        // scored sessions take their duration from the timer; it can be corrected here
        // (the other types have a Duration field in their form)
        isScored(ss.type)
          ? APL.TextField({
              label: 'Duration',
              type: 'number',
              inputmode: 'numeric',
              min: 0,
              max: 1440,
              suffix: 'min',
              value: ss.minutes ?? '',
              fk: 'edit-minutes',
              onChange: (e) => redraw(ctx.finished.setMinutes(ss.id, e.target.value)),
            })
          : null,
      ],
    }),
  );
}

/** The line under an equipment choice (gearChoices option ids). */
export function gearDetail(id, setups, activeId = null, distance = null) {
  if (id === 'none') return 'Log without a bow setup';
  if (id === 'recorded') return 'As saved with the session';
  const s = setups.find((x) => x.id === id);
  if (!s) return null;
  return id === activeId ? `Active · ${setupSummary(s, distance)}` : setupSummary(s, distance);
}

/**
 * Equipment choices (gearChoices output) as APL radio cards: the setups (the active one first), "as
 * recorded" for an edited session whose setup is gone, and none; then a link to the Gear tab. Each
 * setup's line shows its sight mark for `distance` (the session's).
 */
export function gearCards(ctx, { options, value, onChange, setups, activeId, distance = null }) {
  return h(
    'div',
    { class: 'apl-list', role: 'group', 'aria-label': 'Equipment' },
    options.map(([id, name]) =>
      APL.SelectCard({
        title: name,
        detail: gearDetail(id, setups, activeId, distance),
        selected: id === value,
        onClick: () => id !== value && onChange(id),
        fk: `gear-${id}`,
      }),
    ),
    APL.AddButton({ children: setups.length ? 'Manage setups' : 'Add equipment', onClick: () => ctx.navigate('gear'), fk: 'gear-add' }),
  );
}

/**
 * The equipment a finished session used, changeable in History (picking a setup copies its fields
 * into the session). `onChange(choice)` stores the choice. A running session shows none:
 * its equipment is chosen when it is set up.
 */
export function gearCard(ctx, ss, onChange) {
  const settings = ctx.repo.getSettings();
  const setups = ctx.repo.list('setups');
  const choices = gearChoices({ settings, setups, session: ss });
  return card(
    { class: 'gear-card' },
    APL.Section({ label: 'Equipment', id: 'gear', children: gearCards(ctx, { ...choices, onChange, setups, distance: ss.distance ?? null }) }),
  );
}
