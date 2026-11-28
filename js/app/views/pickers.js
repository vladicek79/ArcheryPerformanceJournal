// Date and time pickers: a field showing the value. The date field opens a month calendar below it,
// the time field a bottom sheet. Each manages its own DOM while open (paging, stepping, keyboard focus)
// and only calls `onChange` when a value is picked, so the page re-renders once, with the new value.
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
import {
  parseTime,
  formatTime,
  timeOf,
  dateOf,
  addMinutes,
  addHours,
  withMinute,
  withHour,
  parseTyped,
  maxTime,
  isAfterMax,
  quickTimes,
  timeHint,
} from '../timeMath.js';
import { icons } from '../icons.js';
import { Icon } from '../../ui/apl/index.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LONG_DATE = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

let uid = 0;

/**
 * Field + popup panel of the date picker: opens on tap, closes on Escape, an outside tap or focus
 * leaving it. `render(focus)` fills the panel each time it opens.
 * The field is an APL FieldButton: `field` ({ icon, value, hint }) gives its accent-bright icon and
 * the value over the hint.
 */
function popupField({ fieldClass, ariaLabel, dialogLabel, fk, render, field }) {
  const id = `pk-${++uid}`;
  let open = false;
  const trigger = fieldButton({
    fieldClass,
    ariaLabel,
    fk,
    field,
    controls: id,
    onClick: () => (open ? close() : show()),
  });
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

/** The field button of a picker (an APL FieldButton): its accent-bright icon, the value over the hint. */
function fieldButton({ fieldClass, ariaLabel, fk, field, controls = null, onClick }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['apl', 'apl-field', 'picker-apl', fieldClass],
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-controls': controls,
      'aria-label': ariaLabel,
      dataset: fk ? { fk } : undefined,
      onClick,
    },
    Icon({ name: field.icon }),
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, field.value),
      field.hint ? h('span', { class: 'apl-cap' }, field.hint) : null,
    ),
  );
}

/** The APL field of a date: "Today" / "Yesterday" over the day, or the day over its year. */
function aplDate(value, today) {
  const day = formatDate(value, { weekday: 'short', day: 'numeric', month: 'short' });
  const named = value === today ? 'Today' : value === addDays(today, -1) ? 'Yesterday' : null;
  return { icon: 'calendar', value: named || day, hint: named ? day : value.slice(0, 4) };
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

const HOLD_DELAY_MS = 400; // a held ▲ / ▼ starts repeating after this
const HOLD_REPEAT_MS = 80; // …then steps this often
const HOLD_FAST_MS = 40; // …and this often once held for HOLD_FAST_AFTER_MS
const HOLD_FAST_AFTER_MS = 1500;
const SWIPE_CLOSE_PX = 80; // dragging the sheet's top down this far cancels it
const pad2 = (n) => String(n).padStart(2, '0');

/** "Today · Mon 16 Nov", "Yesterday · Sun 15 Nov", or "Sun 8 Nov 2026". */
function dateContext(date, now) {
  if (!date) return '';
  const today = dateOf(now);
  const day = formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
  const named = date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : null;
  return named
    ? `${named} · ${day}`
    : formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A ▲ / ▼ button: one step on a tap, repeating while held (after HOLD_DELAY_MS, faster after
 * HOLD_FAST_AFTER_MS). Keyboard users step with the spinbutton's arrow keys, so it is no tab stop.
 */
function stepButton(dir, label, onStep) {
  let timer = null;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
  };
  const btn = h(
    'button',
    {
      type: 'button',
      class: ['tp-step', dir === 'up' ? 'is-up' : 'is-down'],
      tabindex: '-1',
      'aria-label': label,
    },
    Icon({ name: 'chevron', size: 28, strokeWidth: 2.4 }),
  );
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no focus move, no text selection
    btn.setPointerCapture?.(e.pointerId);
    const held = Date.now();
    onStep();
    const tick = () => {
      onStep();
      timer = setTimeout(tick, Date.now() - held > HOLD_FAST_AFTER_MS ? HOLD_FAST_MS : HOLD_REPEAT_MS);
    };
    timer = setTimeout(tick, HOLD_DELAY_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is a hold, not a menu
  // a click from the keyboard or a screen reader (a pointer already stepped on pointerdown)
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) onStep();
  });
  return btn;
}

/**
 * Time field (24-hour) that opens a bottom sheet: quick chips (Now · −15 min · −30 min · −1 h), a big
 * HH : MM with ▲ / ▼ per part (hold to repeat, tap the digits to type), round-minute chips, a hint and
 * Cancel / Set. Esc, a tap on the scrim or a swipe down cancels; focus returns to the field.
 * @param {object} o
 * @param {string} o.value      'HH:MM', or '' / null for no time
 * @param {(time: string|null) => void} o.onChange  the time set, or null when cleared
 * @param {boolean} [o.clearable] offer "Clear time" (the time is optional)
 * @param {string} [o.label]    the field's name and the sheet's title
 * @param {string} [o.fk]       focus key, so focus returns to the field after the re-render
 * @param {string} [o.hint]     the line under the time in the field ("Now", "Start time")
 * @param {string} [o.date]     ISO date the time belongs to; today: quick chips relative to now, and
 *                              times later than now are blocked
 * @param {string} [o.max]      latest time allowed, 'HH:MM' (default: now when `date` is today)
 * @param {boolean} [o.quick]   show the quick chips (only ever for today)
 * @param {boolean} [o.timer]   the page starts a session timer from this time: the hint says where
 *                              it starts (false: the hint only says how long ago)
 */
export function timePicker({
  value,
  onChange,
  clearable = false,
  label = 'Start time',
  fk,
  hint = 'Start time',
  date = null,
  max = null,
  quick = true,
  timer = true,
}) {
  const trigger = fieldButton({
    fieldClass: ['time-field', !value && 'is-empty'],
    ariaLabel: `${label}: ${value || 'not set'}`,
    fk,
    field: { icon: 'clock', value: value || 'No time', hint },
    onClick: () => openSheet(),
  });

  function openSheet() {
    const id = `tp-${++uid}`;
    const now = () => new Date();
    let draft = parseTime(value) ?? parseTime(timeOf(now()));
    let typing = false;
    let typedError = false;
    let result; // undefined: cancelled; a time, or null (cleared): picked

    const set = (min) => {
      draft = min;
      typedError = false;
      update();
    };
    const bound = () => maxTime(date, max, now());
    const tooLate = () => isAfterMax(formatTime(draft), bound());

    // ---- header
    const title = h('h2', { class: 'tp-title', id: `${id}-title` }, label);
    const context = dateContext(date, now());
    const head = h(
      'div',
      { class: 'tp-head' },
      title,
      context ? h('span', { class: 'tp-date' }, context) : null,
    );

    // ---- quick chips (today only)
    const showQuick = quick && !!date && date === dateOf(now());
    const quickBtns = showQuick
      ? quickTimes(formatTime(draft), now()).map((q, i) =>
          h(
            'button',
            {
              type: 'button',
              class: 'tp-chip',
              'aria-pressed': 'false',
              onClick: () => set(parseTime(quickTimes(formatTime(draft), now())[i].time)),
            },
            q.label,
          ),
        )
      : [];
    const quickRow = showQuick
      ? h('div', { class: 'tp-quick', role: 'group', 'aria-label': 'Quick times' }, quickBtns)
      : null;

    // ---- HH : MM: two spinbuttons; a tap (or a digit, or Enter) types the time instead
    const spin = (name, valueMax, keys) => {
      const el = h('div', {
        class: 'tp-num',
        role: 'spinbutton',
        tabindex: '0',
        'aria-label': name,
        'aria-valuemin': '0',
        'aria-valuemax': String(valueMax),
        'aria-describedby': `${id}-hint`,
      });
      el.addEventListener('keydown', (e) => {
        const step = keys[e.key];
        if (step) {
          e.preventDefault();
          set(step(draft));
        } else if (e.key === 'Enter' || /^\d$/.test(e.key)) {
          e.preventDefault();
          startTyping(/^\d$/.test(e.key) ? e.key : null);
        }
      });
      el.addEventListener('click', () => startTyping());
      return el;
    };
    const tenMinutes = { PageUp: (d) => addMinutes(d, 10), PageDown: (d) => addMinutes(d, -10) };
    const hourNum = spin('Hour', 23, {
      ArrowUp: (d) => addHours(d, 1),
      ArrowDown: (d) => addHours(d, -1),
      Home: (d) => withHour(d, 0),
      End: (d) => withHour(d, 23),
      ...tenMinutes,
    });
    const minuteNum = spin('Minute', 59, {
      ArrowUp: (d) => addMinutes(d, 1),
      ArrowDown: (d) => addMinutes(d, -1),
      Home: (d) => withMinute(d, 0),
      End: (d) => withMinute(d, 59),
      ...tenMinutes,
    });
    const colon = h('span', { class: 'tp-colon', 'aria-hidden': 'true' }, ':');
    const typed = h('input', {
      class: 'tp-type',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      enterkeyhint: 'done',
      maxlength: '5',
      'aria-label': `${label}, type hours and minutes`,
      'aria-describedby': `${id}-hint`,
      hidden: true,
    });
    const dial = h(
      'div',
      { class: 'tp-dial' },
      stepButton('up', 'Hour later', () => set(addHours(draft, 1))),
      h('span'),
      stepButton('up', 'Minute later', () => set(addMinutes(draft, 1))),
      hourNum,
      colon,
      minuteNum,
      typed,
      h('span', { class: 'tp-unit', 'aria-hidden': 'true' }, 'hour'),
      h('span'),
      h('span', { class: 'tp-unit', 'aria-hidden': 'true' }, 'minute · hold to scroll'),
      stepButton('down', 'Hour earlier', () => set(addHours(draft, -1))),
      h('span'),
      stepButton('down', 'Minute earlier', () => set(addMinutes(draft, -1))),
    );

    function startTyping(first = null) {
      typing = true;
      typed.value = first ?? formatTime(draft);
      update();
      typed.focus({ preventScroll: true });
      if (first == null) typed.select();
    }
    /** Ends typing: a real time is taken; anything else keeps the time and says how to type one. */
    function endTyping({ keep = true } = {}) {
      if (!typing) return;
      typing = false;
      const t = keep ? parseTyped(typed.value) : null;
      if (t != null) draft = t;
      typedError = keep && t == null && typed.value.trim() !== '';
      update();
    }
    typed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        endTyping();
        hourNum.focus({ preventScroll: true });
      } else if (e.key === 'Escape') {
        e.preventDefault(); // leaves typing, not the sheet
        e.stopPropagation();
        endTyping({ keep: false });
        hourNum.focus({ preventScroll: true });
      }
    });
    typed.addEventListener('blur', () => endTyping());

    // ---- round minutes (keep the hour)
    const rounds = h(
      'div',
      { class: 'tp-rounds', role: 'group', 'aria-label': 'Round minutes' },
      [0, 15, 30, 45].map((mm) =>
        h(
          'button',
          {
            type: 'button',
            class: 'tp-round',
            'aria-label': `${pad2(mm)} minutes past`,
            onClick: () => set(withMinute(draft, mm)),
          },
          `:${pad2(mm)}`,
        ),
      ),
    );

    // ---- hint, clear, footer
    const hintLine = h('p', { class: 'tp-hint', id: `${id}-hint`, 'aria-live': 'polite' });
    const clear =
      clearable && value
        ? h('button', { type: 'button', class: 'tp-clear', onClick: () => close(null) }, 'Clear time')
        : null;
    const cancelBtn = h('button', { type: 'button', class: 'tp-btn', onClick: () => close() }, 'Cancel');
    const setBtn = h('button', {
      type: 'button',
      class: 'tp-btn is-primary',
      onClick: () => {
        endTyping();
        if (!tooLate()) close(formatTime(draft));
      },
    });

    const sheet = h(
      'dialog',
      { class: 'apl tp-sheet', 'aria-labelledby': title.id },
      h('span', { class: 'tp-grab', 'aria-hidden': 'true' }),
      head,
      quickRow,
      dial,
      rounds,
      hintLine,
      clear,
      h('div', { class: 'tp-foot' }, cancelBtn, setBtn),
    );

    function update() {
      const t = formatTime(draft);
      const [hh, mm] = t.split(':');
      hourNum.textContent = hh;
      hourNum.setAttribute('aria-valuenow', String(Number(hh)));
      hourNum.setAttribute('aria-valuetext', `${Number(hh)} hours, ${t}`);
      minuteNum.textContent = mm;
      minuteNum.setAttribute('aria-valuenow', String(Number(mm)));
      minuteNum.setAttribute('aria-valuetext', `${Number(mm)} minutes, ${t}`);
      hourNum.hidden = typing;
      minuteNum.hidden = typing;
      colon.hidden = typing;
      typed.hidden = !typing;
      if (showQuick) {
        quickTimes(t, now()).forEach((q, i) => {
          quickBtns[i].setAttribute('aria-pressed', String(q.selected));
          quickBtns[i].disabled = q.disabled;
        });
      }
      const line = typedError
        ? { text: 'Type a time like 15:45', warn: true }
        : timeHint({ date, time: t, max: bound(), now: now(), timer });
      if (hintLine.textContent !== line.text) hintLine.textContent = line.text;
      hintLine.classList.toggle('is-warn', line.warn);
      setBtn.textContent = `Set ${t}`;
      setBtn.disabled = tooLate();
    }

    function close(picked) {
      result = picked;
      sheet.close();
      done(); // at once: the 'close' event is queued, and late in a page running in the background
    }

    let finished = false;
    /** Removes the sheet, returns focus to the field and reports the time picked (once). */
    function done() {
      if (finished) return;
      finished = true;
      sheet.remove();
      trigger.setAttribute('aria-expanded', 'false');
      // focus goes back to the field first, so the page's re-render keeps it there
      const field = trigger.isConnected
        ? trigger
        : fk && document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      field?.focus({ preventScroll: true });
      if (result !== undefined && result !== (value || null)) onChange(result);
    }
    sheet.addEventListener('close', done);
    // Escape cancels (and is kept from the app's overlay layer, which may be open under the sheet)
    sheet.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    sheet.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });
    // a tap on the scrim (outside the sheet's box) cancels
    sheet.addEventListener('click', (e) => {
      if (e.target !== sheet) return;
      const r = sheet.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) close();
    });
    swipeDown(sheet, () => close());

    update();
    document.body.append(sheet);
    sheet.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    hourNum.focus({ preventScroll: true });
  }

  return h('div', { class: 'picker' }, trigger);
}

/** Drag the sheet's top area (the grab bar and the title) down to cancel it. */
function swipeDown(sheet, cancel) {
  let startY = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, [role="spinbutton"]')) return;
    const fromTop = e.clientY - sheet.getBoundingClientRect().top;
    if (fromTop < 0 || fromTop > 72) return; // the scrim, or below the title
    startY = e.clientY;
    sheet.setPointerCapture?.(e.pointerId);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    sheet.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`;
  });
  const end = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.style.transform = '';
    if (dy > SWIPE_CLOSE_PX) cancel();
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}
