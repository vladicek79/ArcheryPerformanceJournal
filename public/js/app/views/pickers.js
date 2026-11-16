// Date and time pickers: a field showing the value that opens a panel below it (a month calendar,
// or hour and minute grids). The panel manages its own DOM while open (paging, keyboard focus) and
// only calls `onChange` when a value is picked, so the page re-renders once, with the new value.
import { h, formatDate, todayIso } from '../../core/dom.js';
import {
  addDays,
  addMonths,
  monthGrid,
  monthStart,
  inRange,
  clampIso,
  weekdayMon,
} from '../../core/calendar.js';
import { icons } from '../icons.js';
import { Icon } from '../../ui/apl/index.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LONG_DATE = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const pad = (n) => String(n).padStart(2, '0');

let uid = 0;

/**
 * Field + popup panel shared by the pickers: opens on tap, closes on Escape, an outside tap or focus
 * leaving it. `render(focus)` fills the panel each time it opens.
 * The field is an APL FieldButton: `field` ({ icon, value, hint }) gives its accent-bright icon and
 * the value over the hint.
 */
function popupField({ fieldClass, ariaLabel, dialogLabel, fk, render, field }) {
  const id = `pk-${++uid}`;
  let open = false;
  const content = [
    Icon({ name: field.icon }),
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, field.value),
      field.hint ? h('span', { class: 'apl-cap' }, field.hint) : null,
    ),
  ];
  const trigger = h(
    'button',
    {
      type: 'button',
      class: ['apl', 'apl-field', 'picker-apl', fieldClass],
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-controls': id,
      'aria-label': ariaLabel,
      dataset: fk ? { fk } : undefined,
      onClick: () => (open ? close() : show()),
    },
    content,
  );
  const panel = h('div', {
    class: 'picker-panel',
    id,
    role: 'dialog',
    'aria-label': dialogLabel,
    hidden: true,
  });
  const wrap = h('div', { class: 'picker' }, trigger, panel);

  const onDocPointer = (e) => {
    if (!wrap.isConnected) return detach();
    if (!wrap.contains(e.target)) close({ refocus: false });
  };
  const detach = () => document.removeEventListener('pointerdown', onDocPointer, true);
  wrap.addEventListener('focusout', (e) => {
    if (open && e.relatedTarget && !wrap.contains(e.relatedTarget)) close({ refocus: false });
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  });

  function show() {
    open = true;
    trigger.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    panel.classList.remove('is-in');
    void panel.offsetWidth; // replay the opening animation
    panel.classList.add('is-in');
    document.addEventListener('pointerdown', onDocPointer, true);
    render({ focus: true });
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function close({ refocus = true } = {}) {
    if (!open) return;
    open = false;
    trigger.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    detach();
    // focus goes back to the field first, so the page's re-render keeps it there
    if (refocus) trigger.focus({ preventScroll: true });
  }

  return { wrap, panel, close };
}

/** The APL field of a date: "Today" / "Yesterday" over the day, or the day over its year. */
function aplDate(value, today) {
  const day = formatDate(value, { weekday: 'short', day: 'numeric', month: 'short' });
  const named = value === today ? 'Today' : value === addDays(today, -1) ? 'Yesterday' : null;
  return { icon: 'calendar', value: named || day, hint: named ? day : value.slice(0, 4) };
}

/** Arrow keys move focus between the buttons of a grid with `cols` columns. */
function gridKeys(container, cols) {
  container.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (!step) return;
    const items = [...container.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    items[Math.min(items.length - 1, Math.max(0, i + step))].focus();
  });
}

/**
 * Date field with a month calendar.
 * @param {object} o
 * @param {string} o.value      selected ISO date
 * @param {(iso: string) => void} o.onChange  called with the picked date
 * @param {string} [o.min]      first pickable date
 * @param {string} [o.max]      last pickable date (e.g. today: sessions are not logged ahead)
 * @param {Set<string>} [o.marks] dates shown with a dot (days that already have a session)
 * @param {string} [o.label]    accessible name of the field
 * @param {string} [o.fk]       focus key, so focus returns to the field after the re-render
 */
export function datePicker({
  value,
  onChange,
  min = null,
  max = null,
  marks = new Set(),
  label = 'Date',
  fk,
}) {
  const today = todayIso();
  let view = monthStart(value || today); // first day of the month shown
  let focused = value || today; // the day with the roving tab stop

  const { wrap, panel, close } = popupField({
    fieldClass: 'date-field',
    ariaLabel: `${label}: ${formatDate(value, LONG_DATE)}`,
    dialogLabel: `Choose ${label.toLowerCase()}`,
    fk,
    field: aplDate(value, today),
    render: ({ focus }) => {
      view = monthStart(value || today);
      focused = clampIso(value || today, min, max);
      render({ focus });
    },
  });
  panel.classList.add('cal');

  function pick(iso) {
    if (!inRange(iso, min, max)) return;
    close();
    if (iso !== value) onChange(iso);
  }

  const canPrev = () => !min || addDays(view, -1) >= min;
  const canNext = () => !max || addMonths(view, 1) <= max;

  function page(n) {
    if ((n < 0 && !canPrev()) || (n > 0 && !canNext())) return;
    view = addMonths(view, n);
    focused = clampIso(addMonths(focused, n), min, max);
    render({ slide: n });
  }

  // keyboard: arrows move a day / week, Home / End to the week's ends, PageUp / PageDown a month
  panel.addEventListener('keydown', (e) => {
    const moves = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekdayMon(focused)),
      End: () => addDays(focused, 6 - weekdayMon(focused)),
      PageUp: () => addMonths(focused, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move || !e.target.closest('.cal-grid')) return;
    e.preventDefault();
    const next = clampIso(move(), min, max);
    const slide = Math.sign(monthStart(next).localeCompare(view));
    focused = next;
    view = monthStart(next);
    render({ focus: true, slide });
  });

  function dayCell(iso) {
    const outside = iso.slice(0, 7) !== view.slice(0, 7);
    const selected = iso === value;
    const marked = marks.has(iso);
    return h(
      'button',
      {
        type: 'button',
        class: [
          'cal-day',
          outside && 'is-outside',
          iso === today && 'is-today',
          selected && 'is-selected',
          marked && 'has-mark',
        ],
        role: 'gridcell',
        tabindex: iso === focused ? '0' : '-1',
        disabled: !inRange(iso, min, max),
        'aria-selected': String(selected),
        'aria-current': iso === today ? 'date' : null,
        'aria-label': `${formatDate(iso, LONG_DATE)}${iso === today ? ', today' : ''}${marked ? ', has a session' : ''}`,
        dataset: { iso },
        onClick: () => pick(iso),
      },
      String(Number(iso.slice(8))),
      marked ? h('span', { class: 'cal-dot', 'aria-hidden': 'true' }) : null,
    );
  }

  const quick = (text, iso) =>
    h(
      'button',
      {
        type: 'button',
        class: ['picker-quick', iso === value && 'is-on'],
        disabled: !inRange(iso, min, max),
        onClick: () => pick(iso),
      },
      text,
    );

  function render({ focus = false, slide = 0 } = {}) {
    const title = formatDate(view, { month: 'long', year: 'numeric' });
    panel.replaceChildren(
      h(
        'div',
        { class: 'cal-head' },
        h(
          'button',
          {
            type: 'button',
            class: 'cal-nav',
            'aria-label': 'Previous month',
            disabled: !canPrev(),
            onClick: () => page(-1),
          },
          icons.back(),
        ),
        h('div', { class: 'cal-title', 'aria-live': 'polite' }, title),
        h(
          'button',
          {
            type: 'button',
            class: 'cal-nav',
            'aria-label': 'Next month',
            disabled: !canNext(),
            onClick: () => page(1),
          },
          icons.forward(),
        ),
      ),
      h(
        'div',
        {
          class: ['cal-grid', slide > 0 && 'slide-next', slide < 0 && 'slide-prev'],
          role: 'grid',
          'aria-label': title,
        },
        h(
          'div',
          { class: 'cal-row cal-weekdays', role: 'row' },
          WEEKDAYS.map((d, i) =>
            h(
              'span',
              {
                class: ['cal-weekday', i > 4 && 'is-weekend'],
                role: 'columnheader',
                title: WEEKDAYS_FULL[i],
              },
              d,
            ),
          ),
        ),
        monthGrid(view).map((week) => h('div', { class: 'cal-row', role: 'row' }, week.map(dayCell))),
      ),
      h('div', { class: 'picker-foot' }, quick('Today', today), quick('Yesterday', addDays(today, -1))),
    );
    if (focus) panel.querySelector(`[data-iso="${focused}"]`)?.focus({ preventScroll: true });
  }

  return wrap;
}

/**
 * Time field (24-hour) with hour and minute grids: pick the hour, then the minute (5-minute steps,
 * fine-tuned with −1 / +1). Picking a minute or Set saves; Now takes the clock's time.
 * @param {object} o
 * @param {string} o.value      'HH:MM', or '' / null for no time
 * @param {(time: string|null) => void} o.onChange
 * @param {boolean} [o.clearable] offer Clear (the time is optional)
 * @param {string} [o.label]
 * @param {string} [o.fk]
 * @param {string} [o.hint]     the line under the time ("Now", "Start time")
 */
export function timePicker({
  value,
  onChange,
  clearable = false,
  label = 'Start time',
  fk,
  hint = 'Start time',
}) {
  const now = () => {
    const d = new Date();
    return { hh: d.getHours(), mm: d.getMinutes() };
  };
  const parse = (t) => {
    const m = /^(\d{2}):(\d{2})$/.exec(t || '');
    return m ? { hh: Number(m[1]), mm: Number(m[2]) } : null;
  };
  let draft = parse(value) || now();
  let part = 'hh'; // the grid shown: hours or minutes
  const fmt = (t) => `${pad(t.hh)}:${pad(t.mm)}`;

  const { wrap, panel, close } = popupField({
    fieldClass: ['time-field', !value && 'is-empty'],
    ariaLabel: `${label}: ${value || 'not set'}`,
    dialogLabel: `Choose ${label.toLowerCase()}`,
    fk,
    field: { icon: 'clock', value: value || 'No time', hint },
    render: ({ focus }) => {
      draft = parse(value) || now();
      part = 'hh';
      render({ focus });
    },
  });
  panel.classList.add('tp');

  const commit = (t) => {
    close();
    if (t !== (value || null)) onChange(t);
  };

  const nudge = (n) => {
    const total = (draft.hh * 60 + draft.mm + n + 1440) % 1440;
    draft = { hh: Math.floor(total / 60), mm: total % 60 };
    render({ keep: true });
  };

  function render({ focus = false, keep = false } = {}) {
    const keepFocus =
      keep && panel.contains(document.activeElement) ? document.activeElement.dataset.tk : null;
    const seg = (key, text, name) =>
      h(
        'button',
        {
          type: 'button',
          class: ['tp-seg', part === key && 'is-on'],
          'aria-pressed': String(part === key),
          'aria-label': `${name} ${text}`,
          dataset: { tk: `seg-${key}` },
          onClick: () => {
            part = key;
            render({ focus: true });
          },
        },
        text,
      );
    const cell = (n, on, onClick, name) =>
      h(
        'button',
        {
          type: 'button',
          class: ['tp-cell', on && 'is-selected'],
          'aria-label': name,
          'aria-pressed': String(on),
          dataset: { tk: `c-${n}` },
          onClick,
        },
        pad(n),
      );
    const grid =
      part === 'hh'
        ? h(
            'div',
            { class: 'tp-grid tp-hours', role: 'group', 'aria-label': 'Hour' },
            Array.from({ length: 24 }, (_, n) =>
              cell(
                n,
                n === draft.hh,
                () => {
                  draft = { ...draft, hh: n };
                  part = 'mm';
                  render({ focus: true });
                },
                `${pad(n)} hours`,
              ),
            ),
          )
        : h(
            'div',
            { class: 'tp-grid tp-minutes', role: 'group', 'aria-label': 'Minute' },
            Array.from({ length: 12 }, (_, i) => i * 5).map((n) =>
              cell(n, n === draft.mm, () => commit(fmt({ ...draft, mm: n })), `${pad(n)} minutes`),
            ),
          );
    gridKeys(grid, 6);
    panel.replaceChildren(
      h(
        'div',
        { class: 'tp-head' },
        h(
          'button',
          {
            type: 'button',
            class: 'cal-nav',
            'aria-label': 'One minute earlier',
            dataset: { tk: 'minus' },
            onClick: () => nudge(-1),
          },
          '−1',
        ),
        h(
          'div',
          { class: 'tp-display', 'aria-live': 'polite' },
          seg('hh', pad(draft.hh), 'Hour'),
          h('span', { class: 'tp-colon', 'aria-hidden': 'true' }, ':'),
          seg('mm', pad(draft.mm), 'Minute'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'cal-nav',
            'aria-label': 'One minute later',
            dataset: { tk: 'plus' },
            onClick: () => nudge(1),
          },
          '+1',
        ),
      ),
      h('div', { class: 'tp-hint muted small' }, part === 'hh' ? 'Pick the hour' : 'Pick the minute'),
      grid,
      h(
        'div',
        { class: 'picker-foot' },
        h('button', { type: 'button', class: 'picker-quick', onClick: () => commit(fmt(now())) }, 'Now'),
        clearable && value
          ? h('button', { type: 'button', class: 'picker-quick', onClick: () => commit(null) }, 'Clear')
          : null,
        h(
          'button',
          { type: 'button', class: 'picker-quick is-primary', onClick: () => commit(fmt(draft)) },
          'Set',
        ),
      ),
    );
    const target = keepFocus
      ? panel.querySelector(`[data-tk="${keepFocus}"]`)
      : focus
        ? grid.querySelector('.is-selected') || grid.querySelector('button')
        : null;
    target?.focus({ preventScroll: true });
  }

  return wrap;
}
