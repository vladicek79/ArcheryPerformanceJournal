// Gear tab: the archer's gear setups. One is active (new sessions take a copy of it); a setup is a read
// view of its fields and sight marks, and every change is saved to it at once. Routes:
//   #/gear              the setups (the active one first)
//   #/gear/<id>         one setup, its fields by group
//   #/gear/<id>/sights  its sight marks (gearSights.js)
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { icons } from '../icons.js';
import {
  GEAR_GROUPS,
  GEAR_KEYS,
  activeSetup,
  copyFields,
  displayValue,
  filledCount,
  keyValues,
  markCount,
  markText,
  orderedSetups,
  sessionsUsing,
  setupSummary,
  sightMarks,
  hasMark,
  uniqueName,
} from '../gearFields.js';
import { T } from '../strings.js';
import { fieldSheet, openFieldSheet } from './gearSheet.js';
import { renderSightsPage } from './gearSights.js';

export function renderGear(ctx, params = []) {
  const [id, sub] = params;
  if (!id) return renderList(ctx);
  const setup = ctx.repo.get('setups', id);
  if (!setup || setup.deleted) {
    queueMicrotask(() => ctx.navigate('gear', { replace: true }));
    return { content: h('div', { class: 'apl-screen gear-screen' }) };
  }
  if (sub === 'sights') return renderSights(ctx, setup);
  return renderSetup(ctx, setup);
}

// ---------------------------------------------------------------- shared actions

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sessionsLine = (n) => (n ? `used in ${plural(n, 'session', 'sessions')}` : 'not used yet');

function makeActive(ctx, setup) {
  if (ctx.saveSettings({ activeSetupId: setup.id })) {
    ctx.toast(`"${setup.name}" is now active`);
    ctx.rerender();
  }
}

/** Ask for a setup's name; resolves the trimmed name, or null when cancelled or left empty. */
async function askName({ title, value, confirmLabel }) {
  const field = APL.TextField({ label: 'Name', value, fk: 'setup-name' });
  const ok = await confirmDialog({ title, body: field, confirmLabel, icon: 'pencil' });
  const name = field.querySelector('input').value.trim();
  return ok && name ? name : null;
}

async function rename(ctx, setup) {
  const name = await askName({ title: 'Rename setup', value: setup.name, confirmLabel: 'Rename' });
  if (!name || name === setup.name) return;
  const cur = ctx.repo.get('setups', setup.id);
  if (cur && ctx.save('setups', { ...cur, name: uniqueName(name, ctx.repo.list('setups'), setup.id) })) ctx.rerender();
}

/** A new setup starting as a copy of `from` (none: empty); opens it and asks for its name. */
async function createFrom(ctx, from, { base = 'New setup' } = {}) {
  const setups = ctx.repo.list('setups');
  const saved = ctx.save('setups', {
    name: uniqueName(from ? `${from.name} copy` : base, setups),
    fields: copyFields(from?.fields),
    history: [],
  });
  if (!saved) return;
  if (!activeSetup(ctx.repo.getSettings(), setups)) ctx.saveSettings({ activeSetupId: saved.id });
  ctx.navigate(`gear/${encodeURIComponent(saved.id)}`);
  const name = await askName({ title: 'Name the new setup', value: saved.name, confirmLabel: 'Save' });
  if (name && name !== saved.name) {
    const cur = ctx.repo.get('setups', saved.id);
    if (cur) ctx.save('setups', { ...cur, name: uniqueName(name, ctx.repo.list('setups'), saved.id) });
  }
  ctx.rerender();
}

async function remove(ctx, setup) {
  const settings = ctx.repo.getSettings();
  const setups = ctx.repo.list('setups');
  if (activeSetup(settings, setups)?.id === setup.id) {
    const more = setups.length > 1;
    const go = await confirmDialog({
      title: 'This setup is active',
      message: more
        ? 'New sessions use it. Make another setup active first, then delete this one.'
        : 'New sessions use it. Add another setup and make it active first, then delete this one.',
      confirmLabel: more ? 'Pick another' : 'New setup',
      cancelLabel: 'Close',
      icon: 'help',
    });
    if (go && more) ctx.navigate('gear');
    else if (go) createFrom(ctx, setup);
    return;
  }
  const used = sessionsUsing(setup.id, ctx.repo.list('sessions'));
  const ok = await confirmDialog({
    title: 'Delete setup?',
    message: `Delete "${setup.name}"?${used ? ` The ${plural(used, 'session', 'sessions')} shot with it keep their own copy.` : ''}`,
    confirmLabel: T.delete,
    danger: true,
  });
  if (!ok) return;
  if (ctx.remove('setups', setup.id)) {
    ctx.toast(`"${setup.name}" deleted`);
    ctx.navigate('gear', { replace: true });
  }
}

/** The ⋯ menu of a setup: a small sheet with rename, duplicate and delete. */
function menuSheet(ctx, setup) {
  const close = () => ctx.ui.set({ gearMenu: null });
  const run = (fn) => () => {
    ctx.ui.quietSet({ gearMenu: null });
    ctx.rerender();
    fn();
  };
  const item = (icon, label, onClick, danger = false) =>
    h(
      'button',
      { type: 'button', class: ['gear-menu-item', danger && 'danger'], onClick, dataset: { fk: `menu-${label.toLowerCase()}` } },
      h('span', { class: 'gear-menu-icon' }, icons[icon]()),
      label,
    );
  return {
    onClose: close,
    returnFk: 'setup-more',
    node: APL.Dialog({
      sheet: true,
      title: setup.name,
      idPrefix: 'gear-menu',
      onClose: close,
      closeLabel: 'Close menu',
      children: h(
        'div',
        { class: 'gear-menu', role: 'group', 'aria-label': `Options for ${setup.name}` },
        item('pencil', 'Rename', run(() => rename(ctx, setup))),
        item('copy', 'Duplicate', run(() => createFrom(ctx, setup))),
        item('trash', 'Delete', run(() => remove(ctx, setup)), true),
      ),
    }),
  };
}

const moreButton = (ctx, setup) =>
  h(
    'button',
    {
      type: 'button',
      class: 'apl-iconbtn',
      'aria-label': `Setup options: rename, duplicate, delete`,
      'aria-haspopup': 'dialog',
      onClick: () => ctx.ui.set({ gearMenu: setup.id }),
      dataset: { fk: 'setup-more' },
    },
    icons.more(),
  );

const backLink = (href, label) => h('a', { class: 'apl-iconbtn gear-back', href, 'aria-label': label }, icons.back());

// ---------------------------------------------------------------- the setups

function renderList(ctx) {
  const settings = ctx.repo.getSettings();
  const setups = orderedSetups(settings, ctx.repo.list('setups'));
  const active = activeSetup(settings, setups);
  const sessions = ctx.repo.list('sessions');
  const distance = Number(settings.lastSetup?.distance) || 18;
  const others = setups.filter((s) => s !== active);

  const activeCard = (s) => {
    const filled = filledCount(s.fields);
    const pct = Math.round((filled / GEAR_KEYS.length) * 100);
    return h(
      'a',
      { class: 'gear-active', href: `#/gear/${encodeURIComponent(s.id)}`, dataset: { fk: `setup-${s.id}` } },
      h(
        'span',
        { class: 'gear-active-head' },
        h('span', { class: 'gear-well', 'aria-hidden': 'true' }, icons.gear()),
        h(
          'span',
          { class: 'gear-active-title' },
          h('span', { class: 'gear-name-line' }, h('span', { class: 'gear-name' }, s.name), APL.Badge({ children: 'Active' })),
          h('span', { class: 'gear-sub' }, [String(s.fields?.riser || '').trim(), sessionsLine(sessionsUsing(s.id, sessions))].filter(Boolean).join(' · ')),
        ),
        h('span', { class: 'gear-go' }, icons.chevron()),
      ),
      h(
        'span',
        { class: 'gear-keys' },
        keyValues(s, distance).map((k) =>
          h(
            'span',
            { class: 'gear-key' },
            h('span', { class: 'gear-key-label' }, k.label),
            k.value
              ? h('span', { class: 'gear-key-value' }, k.value, k.unit ? h('span', { class: 'gear-unit' }, ` ${k.unit}`) : null)
              : h('span', { class: 'gear-key-value gear-key-empty' }, '—'),
          ),
        ),
      ),
      h(
        'span',
        { class: 'gear-progress' },
        h('span', { class: 'gear-progress-track', 'aria-hidden': 'true' }, h('span', { class: 'gear-progress-fill', style: { width: `${pct}%` } })),
        h('span', { class: 'gear-progress-text' }, `${filled} of ${GEAR_KEYS.length} details`),
      ),
    );
  };

  const otherCard = (s) =>
    h(
      'div',
      { class: 'gear-other' },
      h(
        'a',
        { class: 'gear-other-link', href: `#/gear/${encodeURIComponent(s.id)}`, dataset: { fk: `setup-${s.id}` } },
        h('span', { class: 'gear-name' }, s.name),
        h('span', { class: 'gear-sub' }, setupSummary(s)),
      ),
      h(
        'button',
        { type: 'button', class: 'gear-pill', 'aria-label': `Make ${s.name} active`, onClick: () => makeActive(ctx, s), dataset: { fk: `activate-${s.id}` } },
        'Make active',
      ),
    );

  const body = setups.length
    ? [
        h('h2', { class: 'apl-label' }, 'Active setup'),
        activeCard(active),
        others.length ? h('h2', { class: 'apl-label gear-gap' }, 'Other setups') : null,
        others.map(otherCard),
        h(
          'button',
          { type: 'button', class: 'apl-add gear-new', onClick: () => createFrom(ctx, active), dataset: { fk: 'setup-new' } },
          icons.plus(),
          'New setup',
        ),
        h('p', { class: 'apl-cap gear-note' }, 'Starts as a copy of the active setup. New sessions use the active one.'),
      ]
    : [
        h(
          'div',
          { class: 'gear-empty' },
          h('h2', { class: 'gear-name' }, 'No setup yet'),
          h('p', { class: 'apl-cap13' }, 'Add your bow, arrows and sight marks. New sessions take a copy, so you always know what you shot with.'),
        ),
        h(
          'button',
          { type: 'button', class: 'apl-add gear-new', onClick: () => createFrom(ctx, null, { base: 'My setup' }), dataset: { fk: 'setup-new' } },
          icons.plus(),
          'New setup',
        ),
      ];

  return {
    content: h(
      'div',
      { class: 'apl-screen gear-screen' },
      APL.ScreenHeader({ title: T.equipment }),
      h('div', { class: 'apl-screen-body gear-body' }, body),
    ),
  };
}

// ---------------------------------------------------------------- one setup

const groupCount = (fields, g) => g.fields.filter(([k]) => String(fields?.[k] ?? '').trim()).length;

function setupHeader(ctx, setup, isActive) {
  return h(
    'header',
    { class: 'apl-header gear-header' },
    backLink('#/gear', 'Back to equipment'),
    h('h1', { class: 'gear-title' }, setup.name),
    isActive
      ? APL.Badge({ children: 'Active' })
      : h(
          'button',
          { type: 'button', class: 'gear-pill', onClick: () => makeActive(ctx, setup), dataset: { fk: 'setup-activate' } },
          'Make active',
        ),
    moreButton(ctx, setup),
  );
}

function renderSetup(ctx, setup) {
  const settings = ctx.repo.getSettings();
  const isActive = activeSetup(settings, ctx.repo.list('setups'))?.id === setup.id;
  const fields = setup.fields || {};
  const ui = ctx.ui.get();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const jump = (sectionId) => () =>
    document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });

  const chips = [
    ...GEAR_GROUPS.map((g) => ({ id: `gear-sec-${g.id}`, label: g.chip, count: `${groupCount(fields, g)}/${g.fields.length}` })),
    { id: 'gear-sec-sights', label: T.sightMarks, count: String(markCount(fields)) },
  ];

  const row = (key, label) => {
    const d = displayValue(key, fields[key]);
    return h(
      'button',
      {
        type: 'button',
        class: 'gear-row',
        onClick: () => openField(ctx, setup.id, key),
        dataset: { fk: `field-${key}` },
        'aria-label': d.value ? `${label}: ${d.value}${d.unit ? ` ${d.unit}` : ''}. Edit` : `${label}: not set. Add`,
      },
      h('span', { class: 'gear-row-label' }, label),
      d.value
        ? h('span', { class: 'gear-row-value' }, d.value, d.unit ? h('span', { class: 'gear-unit' }, ` ${d.unit}`) : null)
        : h('span', { class: 'gear-row-add' }, 'Add'),
      h('span', { class: 'gear-row-go' }, icons.chevron()),
    );
  };

  const marks = sightMarks(fields).filter(hasMark);
  const sightsLine = marks.length ? marks.slice(0, 3).map((m) => `${m.distance} ${markText(m)}`).join('   ·   ') : 'Add the marks for your distances';

  const content = h(
    'div',
    { class: 'apl-screen gear-screen' },
    h(
      'div',
      { class: 'gear-top' },
      setupHeader(ctx, setup, isActive),
      h(
        'nav',
        { class: 'gear-chips', 'aria-label': 'Jump to section' },
        chips.map((c) =>
          h(
            'button',
            { type: 'button', class: 'gear-chip', onClick: jump(c.id), dataset: { fk: `jump-${c.id}` } },
            c.label,
            h('span', { class: 'gear-chip-count' }, c.count),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'apl-screen-body gear-body' },
      GEAR_GROUPS.map((g) =>
        h(
          'section',
          { class: 'gear-group', id: `gear-sec-${g.id}`, 'aria-labelledby': `gear-h-${g.id}` },
          h(
            'div',
            { class: 'gear-group-head' },
            h('h2', { class: 'apl-label', id: `gear-h-${g.id}` }, g.title),
            h('span', { class: 'apl-cap' }, `${groupCount(fields, g)} of ${g.fields.length}`),
          ),
          g.fields.map(([key, label]) => row(key, label)),
        ),
      ),
      h(
        'a',
        { class: 'gear-sights-link', id: 'gear-sec-sights', href: `#/gear/${encodeURIComponent(setup.id)}/sights`, dataset: { fk: 'open-sights' } },
        h('span', { class: 'gear-well', 'aria-hidden': 'true' }, icons.sights()),
        h('span', { class: 'gear-active-title' }, h('span', { class: 'gear-name gear-name-sm' }, T.sightMarks), h('span', { class: 'gear-sub' }, sightsLine)),
        h('span', { class: 'gear-go' }, icons.chevron()),
      ),
      h('p', { class: 'apl-cap gear-note' }, 'Changes save automatically. Sessions keep the setup they were shot with.'),
    ),
  );
  return { content, overlay: overlayFor(ctx, setup, ui) };
}

/** The view's overlay: the ⋯ menu or the edit sheet. */
function overlayFor(ctx, setup, ui) {
  if (ui.gearMenu === setup.id) return menuSheet(ctx, setup);
  return fieldSheet(ctx, setup);
}

/** Open the edit sheet of one field. */
function openField(ctx, setupId, key) {
  const setup = ctx.repo.get('setups', setupId);
  if (setup) openFieldSheet(ctx, setup, key);
}

// ---------------------------------------------------------------- sight marks (a page of the setup)

function renderSights(ctx, setup) {
  const sight = String(setup.fields?.sight || '').trim();
  const header = h(
    'header',
    { class: 'apl-header gear-header gear-top' },
    backLink(`#/gear/${encodeURIComponent(setup.id)}`, `Back to ${setup.name}`),
    h(
      'div',
      { class: 'gear-active-title' },
      h('h1', { class: 'gear-title' }, T.sightMarks),
      h('span', { class: 'gear-sub' }, [setup.name, sight].filter(Boolean).join(' · ')),
    ),
  );
  return renderSightsPage(ctx, setup, { header });
}
