// Sights tab: sight marks per distance + competition log (HANDOFF §8).
import { h, formatDate } from '../../core/dom.js';
import { T } from '../strings.js';
import { card } from './common.js';

const isBlank = (m) => !(m.distance.trim() || m.elevation.trim() || m.windage.trim() || m.note.trim());

export function renderSights(ctx) {
  const ui = ctx.ui.get();
  const keep = ui.newSightIds || [];
  const focusId = ui.focusSight;
  if (focusId) ctx.ui.quietSet({ focusSight: null });
  // Empty rows are not kept, except ones added in this visit.
  for (const m of ctx.repo.list('sightMarks')) if (isBlank(m) && !keep.includes(m.id)) ctx.remove('sightMarks', m.id);
  const marks = ctx.repo.list('sightMarks', { sort: (a, b) => sortKey(a) - sortKey(b) || a.createdAt.localeCompare(b.createdAt) });

  const onSight = (id, key) => (e) => {
    const m = ctx.repo.get('sightMarks', id);
    if (m) ctx.save('sightMarks', { ...m, [key]: e.target.value });
  };

  const addRow = () => {
    const saved = ctx.save('sightMarks', { distance: '', elevation: '', windage: '', note: '' });
    if (saved) {
      ctx.ui.quietSet({ newSightIds: [...keep, saved.id], focusSight: saved.id });
      ctx.rerender();
    }
  };

  // New competitions are logged as Competition sessions; entries from the old list stay visible here.
  const comps = ctx.repo.list('competitions', {
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt),
  });

  return {
    content: h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title' }, T.sightMarks),
      card(
        { 'aria-label': T.sightMarks },
        h('div', { class: 'sight-grid sight-head', 'aria-hidden': 'true' }, h('span', null, 'Dist.'), h('span', null, 'Elevation'), h('span', null, 'Windage'), h('span', null, 'Note')),
        marks.map((m, i) => {
          const name = m.distance || `row ${i + 1}`;
          return h(
            'div',
            { class: 'sight-grid' },
            h('input', { class: 'input strong', value: m.distance, 'aria-label': `Distance, row ${i + 1}`, onInput: onSight(m.id, 'distance'), ref: (el) => focusId === m.id && queueMicrotask(() => el.focus()) }),
            h('input', { class: 'input', value: m.elevation, 'aria-label': `Elevation for ${name}`, onInput: onSight(m.id, 'elevation') }),
            h('input', { class: 'input', value: m.windage, 'aria-label': `Windage for ${name}`, onInput: onSight(m.id, 'windage') }),
            h('input', { class: 'input', value: m.note, 'aria-label': `Note for ${name}`, onInput: onSight(m.id, 'note') }),
          );
        }),
        h('button', { type: 'button', class: 'btn btn-dashed', onClick: addRow }, T.addDistance),
        h('p', { class: 'muted xsmall' }, 'Clear every field of a row to remove it.'),
      ),
      comps.length ? h('h2', { class: 'page-title sm' }, T.competitionLog) : null,
      comps.length ? h('p', { class: 'muted small' }, 'Earlier entries. New competitions are logged as Competition sessions (Dashboard → New session).') : null,
      h(
        'ul',
        { class: 'plain-list stack-sm' },
        comps.map((c) =>
          h(
            'li',
            { class: 'card comp-card' },
            h('div', { class: 'spread align-base' }, h('strong', null, c.event || 'Competition'), h('span', { class: 'big-score sm' }, c.score || '—')),
            h('div', { class: 'muted small' }, [c.date ? formatDate(c.date) : '', c.round].filter(Boolean).join(' · ') || '—'),
            h('div', { class: 'muted small' }, [`Sight ${c.sightMark || '—'}`, c.conditions, c.note].filter(Boolean).join(' · ')),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text danger self-end',
                'aria-label': `${T.delete} ${c.event || 'competition'}`,
                onClick: () => {
                  if (!confirm(T.confirmDeleteComp(c.event || 'this competition'))) return;
                  ctx.remove('competitions', c.id);
                  ctx.rerender();
                },
              },
              T.delete,
            ),
          ),
        ),
      ),
    ),
  };
}

function sortKey(m) {
  const n = parseInt(m.distance, 10);
  return Number.isFinite(n) ? n : 9999;
}
