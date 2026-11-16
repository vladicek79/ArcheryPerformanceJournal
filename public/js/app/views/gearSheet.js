// The edit sheet of one setup field (Gear tab): a bottom sheet over the setup page.
// Numeric fields: a big value, 64 px −/+ in the field's own step (a long press repeats), tap the number
// to type it, and a unit switch where one makes sense (in / cm). The value is stored in the canonical
// unit; the unit shown is a preference of this device. Text fields: one input with the values other
// setups have as suggestions. Both: an optional reason and the field's tuning history.
//
// The sheet is redrawn with the page; its draft lives in ui.gearEdit so a redraw keeps it. Steps update
// the number in place, without a redraw, so a long press stays smooth.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import {
  FIELD_META,
  displayValue,
  fieldGroup,
  fieldHistory,
  fieldLabel,
  fieldSuggestions,
  isNumericField,
  parseFieldValue,
  stepLabel,
  stepValue,
  storedNumber,
  withFieldChange,
} from '../gearFields.js';
import { T } from '../strings.js';

const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 80;
const HISTORY_SHOWN = 5;

/** Open the sheet for one field of a setup. */
export function openFieldSheet(ctx, setup, key) {
  const raw = String(setup.fields?.[key] ?? '').trim();
  const numeric = isNumericField(key);
  const n = numeric ? parseFieldValue(key, raw) : null;
  ctx.ui.set({
    gearEdit: {
      setupId: setup.id,
      key,
      // numeric: the canonical number (null = not set); a stored text that is not a number is edited as text
      n,
      text: raw,
      asText: !numeric || (raw !== '' && n == null),
      typing: false,
      reason: '',
    },
  });
}

/** The overlay for the open sheet, or null. */
export function fieldSheet(ctx, setup) {
  const draft = ctx.ui.get().gearEdit;
  if (!draft || draft.setupId !== setup.id) return null;
  const { key } = draft;
  const label = fieldLabel(key);
  const meta = FIELD_META[key];
  const units = (ctx.repo.getSettings().gearUnits || {});
  const unit = meta?.alt && units[key] === meta.alt.unit ? meta.alt.unit : meta?.unit ?? '';
  const numeric = Boolean(meta);
  const keep = (patch) => Object.assign(draft, patch) && ctx.ui.quietSet({ gearEdit: draft });

  const close = () => ctx.ui.set({ gearEdit: null });
  const save = () => {
    const cur = ctx.repo.get('setups', setup.id);
    if (!cur) return close();
    const value = draft.asText ? draft.text.trim() : draft.n == null ? '' : storedNumber(key, draft.n);
    const next = withFieldChange(cur, key, value, { reason: draft.reason });
    if (next !== cur && !ctx.save('setups', next)) return;
    ctx.ui.set({ gearEdit: null });
  };

  // ---------------------------------------------------------------- the value
  let valueBlock;
  if (draft.asText) {
    const suggestions = fieldSuggestions(key, ctx.repo.list('setups'), setup.id).filter((v) => v !== draft.text.trim()).slice(0, 8);
    const input = h('input', {
      type: 'text',
      value: draft.text,
      autocomplete: 'off',
      'aria-label': label,
      dataset: { fk: 'edit-text', autofocus: '' },
      onInput: (e) => keep({ text: e.target.value }),
      onKeydown: (e) => e.key === 'Enter' && (e.preventDefault(), save()),
    });
    valueBlock = [
      h('span', { class: 'apl-input gear-edit-input' }, input),
      numeric
        ? h(
            'p',
            { class: 'apl-cap gear-edit-hint' },
            `Kept as typed. Type a number to use −/+ in steps of ${stepLabel(key, unit)}.`,
          )
        : null,
      suggestions.length
        ? h(
            'div',
            { class: 'gear-suggest', role: 'group', 'aria-label': 'From your other setups' },
            suggestions.map((v) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'gear-chip',
                  onClick: () => {
                    keep({ text: v });
                    input.value = v;
                    input.focus();
                  },
                },
                v,
              ),
            ),
          )
        : null,
    ];
  } else {
    const shown = () => (draft.n == null ? '—' : displayValue(key, String(draft.n), unit).value);
    const out = h('span', { class: 'gear-edit-number' }, shown());
    const refresh = () => {
      out.textContent = shown();
      minus.disabled = draft.n != null && draft.n <= meta.min;
      plus.disabled = draft.n != null && draft.n >= meta.max;
    };
    const step = (dir) => {
      keep({ n: stepValue(key, draft.n, dir, unit) });
      refresh();
    };
    const minus = stepButton('−', `Decrease ${label}`, () => step(-1), 'edit-minus');
    const plus = stepButton('+', `Increase ${label}`, () => step(1), 'edit-plus');

    const typeIt = () => {
      keep({ typing: true });
      ctx.rerender();
    };
    const center = draft.typing
      ? h(
          'span',
          { class: 'gear-edit-typing' },
          h('input', {
            type: 'text',
            inputmode: 'decimal',
            value: draft.n == null ? '' : displayValue(key, String(draft.n), unit).value,
            'aria-label': `${label} in ${unit || 'units'}`,
            dataset: { fk: 'edit-type', autofocus: '' },
            onInput: (e) => {
              const v = parseFieldValue(key, e.target.value, unit);
              if (e.target.value.trim() === '') keep({ n: null });
              else if (v != null) keep({ n: Math.min(meta.max, Math.max(meta.min, v)) });
            },
            onKeydown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                keep({ typing: false });
                ctx.rerender();
              }
            },
          }),
          unit ? h('span', { class: 'gear-edit-unit' }, unit) : null,
        )
      : h(
          'button',
          {
            type: 'button',
            class: 'gear-edit-value',
            onClick: typeIt,
            'aria-label': `${label}: ${draft.n == null ? 'not set' : `${shown()} ${unit}`}. Type a value`,
            dataset: { fk: 'edit-value', autofocus: '' },
          },
          h('output', { 'aria-live': 'polite' }, out),
          unit ? h('span', { class: 'gear-edit-unit' }, unit) : null,
        );
    refresh();
    valueBlock = [
      h('div', { class: 'gear-edit-stepper' }, minus, center, plus),
      h(
        'p',
        { class: 'apl-cap13 gear-edit-hint' },
        draft.typing ? 'Type the value, then press Enter' : `Steps of ${stepLabel(key, unit)} · tap the number to type it`,
        draft.n != null
          ? h(
              'button',
              {
                type: 'button',
                class: 'gear-edit-clear',
                onClick: () => {
                  keep({ n: null, typing: false });
                  ctx.rerender();
                },
              },
              'Clear',
            )
          : null,
      ),
    ];
  }

  // ---------------------------------------------------------------- unit switch
  const unitSwitch = meta?.alt
    ? h(
        'div',
        { class: 'gear-units', role: 'group', 'aria-label': 'Unit' },
        [meta.unit, meta.alt.unit].map((u) =>
          h(
            'button',
            {
              type: 'button',
              'aria-pressed': String(u === unit),
              onClick: () => {
                if (u === unit) return;
                ctx.saveSettings({ gearUnits: { ...units, [key]: u } });
                keep({ typing: false });
                ctx.rerender();
              },
              dataset: { fk: `unit-${u}` },
            },
            u,
          ),
        ),
      )
    : null;

  // ---------------------------------------------------------------- tuning history
  const changes = fieldHistory(setup, key);
  const historyBlock = changes.length
    ? h(
        'section',
        { class: 'gear-history', 'aria-labelledby': 'gear-history-h' },
        h('h3', { class: 'apl-label', id: 'gear-history-h' }, 'Tuning history'),
        h(
          'ul',
          { class: 'plain-list' },
          changes.slice(0, HISTORY_SHOWN).map((c) => {
            const d = displayValue(key, c.to, unit);
            return h(
              'li',
              { class: 'gear-history-row' },
              h('span', { class: 'gear-history-date' }, formatDate(c.at.slice(0, 10))),
              h('span', { class: 'gear-history-value' }, d.value ? `${d.value}${d.unit ? ` ${d.unit}` : ''}` : 'cleared'),
              c.reason ? h('span', { class: 'gear-history-reason' }, c.reason) : null,
            );
          }),
        ),
      )
    : null;

  const reason = APL.TextField({
    label: 'Why the change? (optional)',
    value: draft.reason,
    placeholder: 'e.g. quieter release after new string',
    fk: 'edit-reason',
    onInput: (e) => keep({ reason: e.target.value }),
  });

  const node = APL.Dialog({
    sheet: true,
    title: label,
    idPrefix: 'gear-edit',
    onClose: close,
    closeLabel: `Close ${label} without saving`,
    children: [
      h('p', { class: 'apl-cap13 gear-edit-sub' }, `${fieldGroup(key)?.title ?? ''} · ${setup.name}`),
      unitSwitch,
      valueBlock,
      historyBlock,
      reason,
      h(
        'div',
        { class: 'gear-edit-actions' },
        APL.Button({ children: 'Cancel', variant: 'secondary', onClick: close, fk: 'edit-cancel' }),
        APL.Button({ children: T.save, onClick: save, fk: 'edit-save' }),
      ),
    ],
  });
  node.classList.add('gear-sheet');
  // the overlay focuses the close button on a redraw; a field being typed in keeps the focus instead
  if (draft.asText || draft.typing) {
    queueMicrotask(() => {
      const field = node.querySelector('[data-fk="edit-text"], [data-fk="edit-type"]');
      const where = document.activeElement;
      if (field && (!node.contains(where) || where.matches('.apl-dialog-sheethead .apl-iconbtn'))) field.focus();
    });
  }
  swipeToClose(node, close);
  return { onClose: close, node, returnFk: `field-${key}` };
}

/** A 64 px −/+ button: one step per tap, repeating while held (pointer) or per key press (keyboard). */
function stepButton(text, label, onStep, fk) {
  let delay = null;
  let every = null;
  let pressed = false;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(every);
    delay = every = null;
  };
  return h(
    'button',
    {
      type: 'button',
      class: 'gear-edit-step',
      'aria-label': label,
      dataset: { fk },
      onPointerdown: (e) => {
        if (e.button !== 0) return;
        pressed = true;
        onStep();
        delay = setTimeout(() => {
          every = setInterval(onStep, REPEAT_EVERY_MS);
        }, REPEAT_DELAY_MS);
      },
      onPointerup: stop,
      onPointerleave: stop,
      onPointercancel: stop,
      onContextmenu: (e) => e.preventDefault(),
      // a pointer press already stepped; a click without one comes from the keyboard
      onClick: () => {
        if (pressed) pressed = false;
        else onStep();
      },
    },
    text,
  );
}

/** Drag the sheet's top area down to close it. */
function swipeToClose(node, close) {
  let startY = null;
  node.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, textarea, a')) return;
    if (e.clientY - node.getBoundingClientRect().top > 72) return;
    startY = e.clientY;
  });
  node.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    const dy = Math.max(0, e.clientY - startY);
    node.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    node.style.transform = '';
    if (dy > 80) close();
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
}

