// Small shared view pieces.
import { h } from '../../core/dom.js';
import { zoneOf } from '../scoring.js';
import { RUBRIC, T } from '../strings.js';
import { icons } from '../icons.js';
import { gearChoices, gearForChoice } from '../gearFields.js';

export const scoreChip = (v, extra = '') => h('span', { class: `score-chip z-${zoneOf(v)} ${extra}` }, v == null ? '' : String(v));

export const gradeBadge = (g, extra = '') => h('span', { class: `grade-badge g${g} ${extra}` }, String(g));

export const card = (props, ...children) => h('section', { ...props, class: ['card', props?.class] }, ...children);

export const sectionLabel = (text, id) => h('div', { class: 'section-label', id }, text);

export function chip({ label, sub, pressed, onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), onClick, dataset: fk ? { fk } : undefined },
    sub ? [h('span', { class: 'chip-main' }, label), h('span', { class: 'chip-sub' }, sub)] : label,
  );
}

/** Bottom sheet with the full M/S rubric. */
export function guideSheet(onClose) {
  return {
    onClose,
    node: h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title' },
      h(
        'div',
        { class: 'sheet-head' },
        h('h2', { class: 'sheet-title', id: 'guide-title' }, T.gradingGuide),
        h(
          'button',
          { type: 'button', class: 'icon-btn round', 'aria-label': 'Close grading guide', onClick: onClose, dataset: { autofocus: '' } },
          icons.close(),
        ),
      ),
      h('p', { class: 'muted small' }, T.guideIntro),
      h(
        'table',
        { class: 'guide-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Grade')), h('th', { scope: 'col' }, T.mentalProgram), h('th', { scope: 'col' }, T.shootingCycle))),
        h(
          'tbody',
          null,
          [1, 2, 3, 4, 5].map((g) => h('tr', null, h('th', { scope: 'row' }, gradeBadge(g)), h('td', null, RUBRIC.m[g - 1]), h('td', null, RUBRIC.s[g - 1]))),
        ),
      ),
    ),
  };
}

/** Equipment select for a session (gearChoices output): saved setups by name. */
export function gearPicker({ options, value, onChange }) {
  return h(
    'div',
    { class: 'field' },
    h(
      'select',
      { class: 'input', 'aria-label': 'Equipment', dataset: { fk: 'gear' }, onChange: (e) => onChange(e.target.value) },
      options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
    ),
  );
}

/**
 * The equipment a session used, changeable on the running session and later in History
 * (picking a saved setup copies its fields into the session).
 */
export function gearCard(ctx, ss) {
  const settings = ctx.repo.getSettings();
  const snapshots = ctx.repo.list('gearSnapshots', { sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  const choices = gearChoices({ settings, snapshots, session: ss });
  const onChange = (v) => {
    const cur = ctx.repo.get('sessions', ss.id);
    const next = gearForChoice(v, { settings, snapshots });
    if (cur && next && ctx.save('sessions', { ...cur, ...next })) ctx.rerender();
  };
  return card(
    { 'aria-labelledby': 'gear-title' },
    h('h2', { class: 'card-title', id: 'gear-title' }, 'Equipment'),
    gearPicker({ ...choices, onChange }),
  );
}
