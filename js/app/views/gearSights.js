// The sight marks of one setup (#/gear/<id>/sights): one card per distance, sorted, with big elevation
// and windage values. "Edit" turns on −/+ for the elevation (0.1) and L / R for the windage (one click),
// stored as text as before ("5.2", "1R", "0", "2L"), and an optional note. Chips add the default
// distances still missing, or any other. A mark is deleted from its card's ⋯ menu.
// Every change is saved to the setup at once.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { icons } from '../icons.js';
import {
  formatNumber,
  formatWindage,
  markDistance,
  missingDistances,
  parseElevation,
  parseWindage,
  sightMarks,
} from '../gearFields.js';
import { T } from '../strings.js';

const ELEVATION_STEP = 0.1;
const NEW_ELEVATION = 5;

/** Store the setup's marks as `fn` changes them; returns the saved setup (or null). */
function saveMarks(ctx, setupId, fn) {
  const cur = ctx.repo.get('setups', setupId);
  if (!cur) return null;
  const sights = fn((Array.isArray(cur.fields?.sights) ? cur.fields.sights : []).map((m) => ({ ...m })));
  return ctx.save('setups', { ...cur, fields: { ...cur.fields, sights } });
}

const updateMark = (ctx, setupId, id, patch) => saveMarks(ctx, setupId, (ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

/** The elevation of the nearest distance that has one, to start a new mark from. */
function nearestElevation(marks, distance) {
  const withElev = marks.filter((m) => parseElevation(m.elevation) != null && markDistance(m) != null);
  if (!withElev.length) return NEW_ELEVATION;
  withElev.sort((a, b) => Math.abs(markDistance(a) - distance) - Math.abs(markDistance(b) - distance));
  return parseElevation(withElev[0].elevation);
}

function addMark(ctx, setup, distance) {
  const marks = sightMarks(setup.fields);
  if (marks.some((m) => markDistance(m) === distance)) {
    ctx.ui.set({ sightEdit: marks.find((m) => markDistance(m) === distance).id });
    return;
  }
  const id = crypto.randomUUID();
  const elevation = formatNumber(nearestElevation(marks, distance), 2);
  if (saveMarks(ctx, setup.id, (ms) => [...ms, { id, distance: `${distance} m`, elevation, windage: '0', note: '' }])) {
    ctx.ui.set({ sightEdit: id, sightFocus: id });
  }
}

async function addOther(ctx, setup) {
  const field = APL.TextField({ label: 'Distance in metres', inputmode: 'numeric', placeholder: 'e.g. 25', fk: 'sight-other' });
  const ok = await confirmDialog({ title: 'Add a distance', body: field, confirmLabel: 'Add', icon: 'sights' });
  const n = parseInt(field.querySelector('input').value, 10);
  if (ok && Number.isFinite(n) && n > 0 && n <= 150) addMark(ctx, setup, n);
  else if (ok) ctx.toast('Enter a distance from 1 to 150 m');
}

async function deleteMark(ctx, setup, mark) {
  ctx.ui.quietSet({ sightMenu: null });
  ctx.rerender();
  const ok = await confirmDialog({
    title: `Delete the ${mark.distance} mark?`,
    message: `Elevation ${mark.elevation || '—'}, windage ${mark.windage || '—'}. Sessions shot with this setup keep their own copy.`,
    confirmLabel: T.delete,
    danger: true,
  });
  if (ok && saveMarks(ctx, setup.id, (ms) => ms.filter((m) => m.id !== mark.id))) ctx.rerender();
}

/** The ⋯ menu of one mark: a small sheet with Delete. */
function markMenu(ctx, setup, mark) {
  const close = () => ctx.ui.set({ sightMenu: null });
  return {
    onClose: close,
    returnFk: `sight-more-${mark.id}`,
    node: APL.Dialog({
      sheet: true,
      title: `${mark.distance} mark`,
      idPrefix: 'sight-menu',
      onClose: close,
      closeLabel: 'Close menu',
      children: h(
        'div',
        { class: 'gear-menu' },
        h(
          'button',
          { type: 'button', class: 'gear-menu-item danger', onClick: () => deleteMark(ctx, setup, mark), dataset: { fk: 'sight-delete' } },
          h('span', { class: 'gear-menu-icon' }, icons.trash()),
          `Delete the ${mark.distance} mark`,
        ),
      ),
    }),
  };
}

/** One value tile (elevation or windage): big value, and its two buttons while editing. */
function tile({ label, value, editing, down, up, downText, upText, downLabel, upLabel, fk }) {
  const out = h('span', { class: 'sight-value', 'aria-live': editing ? 'polite' : null }, value || '—');
  const btn = (text, aria, onClick, key) =>
    h('button', { type: 'button', class: 'sight-step', 'aria-label': aria, onClick: () => (out.textContent = onClick() || '—'), dataset: { fk: `${fk}-${key}` } }, text);
  return h(
    'div',
    { class: 'sight-tile' },
    h('span', { class: 'sight-tile-label' }, label),
    h(
      'div',
      { class: 'sight-tile-row' },
      editing && down ? btn(downText, downLabel, down, 'down') : null,
      out,
      editing && up ? btn(upText, upLabel, up, 'up') : null,
    ),
  );
}

export function renderSightsPage(ctx, setup, { header }) {
  const ui = ctx.ui.get();
  const marks = sightMarks(setup.fields);
  const editingId = ui.sightEdit;
  const focusId = ui.sightFocus;
  if (focusId) ctx.ui.quietSet({ sightFocus: null });

  const card = (m) => {
    const editing = editingId === m.id;
    const elev = parseElevation(m.elevation);
    const wind = parseWindage(m.windage);
    const cur = { elev, wind };
    const setElev = (dir) => {
      const base = cur.elev ?? NEW_ELEVATION;
      cur.elev = Math.max(0, Number((base + dir * ELEVATION_STEP).toFixed(2)));
      const text = formatNumber(cur.elev, 2);
      updateMark(ctx, setup.id, m.id, { elevation: text });
      return text;
    };
    const setWind = (dir) => {
      cur.wind = (cur.wind ?? 0) + dir;
      const text = formatWindage(cur.wind);
      updateMark(ctx, setup.id, m.id, { windage: text });
      return text;
    };
    // a value typed as free text (not a number / not "1R") is edited as text, never overwritten by a step
    const textField = (key, label) =>
      APL.TextField({
        label,
        value: m[key],
        fk: `sight-${m.id}-${key}`,
        onChange: (e) => updateMark(ctx, setup.id, m.id, { [key]: e.target.value.trim() }),
      });

    const node = h(
      'article',
      { class: ['sight-mark', editing && 'is-editing'], 'aria-labelledby': `sight-h-${m.id}` },
      h(
        'div',
        { class: 'sight-mark-head' },
        h('h2', { class: 'sight-dist', id: `sight-h-${m.id}` }, m.distance || '?'),
        h('span', { class: 'sight-meta' }, editing ? '' : m.note),
        h(
          'button',
          {
            type: 'button',
            class: 'gear-pill sight-edit',
            'aria-expanded': String(editing),
            'aria-label': editing ? `Done editing the ${m.distance} mark` : `Edit the ${m.distance} mark`,
            onClick: () => ctx.ui.set({ sightEdit: editing ? null : m.id }),
            dataset: { fk: `sight-edit-${m.id}` },
          },
          editing ? 'Done' : 'Edit',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'apl-iconbtn',
            'aria-label': `Options for the ${m.distance} mark`,
            'aria-haspopup': 'dialog',
            onClick: () => ctx.ui.set({ sightMenu: m.id }),
            dataset: { fk: `sight-more-${m.id}` },
          },
          icons.more(),
        ),
      ),
      h(
        'div',
        { class: 'sight-tiles' },
        editing && elev == null && String(m.elevation || '').trim()
          ? textField('elevation', 'Elevation')
          : tile({
              label: 'Elevation',
              value: m.elevation,
              editing,
              down: () => setElev(-1),
              up: () => setElev(1),
              downText: '−',
              upText: '+',
              downLabel: `Elevation down, ${m.distance}`,
              upLabel: `Elevation up, ${m.distance}`,
              fk: `sight-${m.id}-elev`,
            }),
        editing && wind == null
          ? textField('windage', 'Windage')
          : tile({
              label: 'Windage',
              value: m.windage,
              editing,
              down: () => setWind(-1),
              up: () => setWind(1),
              downText: 'L',
              upText: 'R',
              downLabel: `Windage one click left, ${m.distance}`,
              upLabel: `Windage one click right, ${m.distance}`,
              fk: `sight-${m.id}-wind`,
            }),
      ),
      editing
        ? APL.TextField({
            label: 'Note (optional)',
            value: m.note,
            placeholder: 'e.g. wind from the left on the club field',
            fk: `sight-${m.id}-note`,
            onChange: (e) => updateMark(ctx, setup.id, m.id, { note: e.target.value.trim() }),
          })
        : null,
    );
    if (focusId === m.id) {
      queueMicrotask(() => {
        node.scrollIntoView({ block: 'nearest' });
        node.querySelector('[data-fk$="-elev-up"]')?.focus({ preventScroll: true });
      });
    }
    return node;
  };

  const missing = missingDistances(setup.fields);
  const body = h(
    'div',
    { class: 'apl-screen-body gear-body' },
    marks.length ? marks.map(card) : h('p', { class: 'apl-cap13' }, 'No marks yet. Add the distances you shoot.'),
    h(
      'section',
      { class: 'sight-add', 'aria-labelledby': 'sight-add-h' },
      h('h2', { class: 'apl-cap13 sight-add-h', id: 'sight-add-h' }, 'Add a distance'),
      h(
        'div',
        { class: 'sight-add-chips' },
        missing.map((d) =>
          h(
            'button',
            { type: 'button', class: 'sight-add-chip', onClick: () => addMark(ctx, setup, Number(d)), dataset: { fk: `sight-add-${d}` } },
            `+ ${d} m`,
          ),
        ),
        h('button', { type: 'button', class: 'sight-add-chip', onClick: () => addOther(ctx, setup), dataset: { fk: 'sight-add-other' } }, 'Other'),
      ),
    ),
    h('p', { class: 'apl-cap gear-note' }, "Marks belong to this setup. The scoring screen shows the mark for the session's distance."),
  );

  const menuFor = ui.sightMenu && marks.find((m) => m.id === ui.sightMenu);
  return {
    content: h('div', { class: 'apl-screen gear-screen' }, header, body),
    overlay: menuFor ? markMenu(ctx, setup, menuFor) : null,
  };
}
