// The competition log kept before competitions became sessions: earlier entries stay readable (and
// deletable) at the end of History. New competitions are logged as Competition sessions.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { T } from '../strings.js';
import { card } from './common.js';

/** The card of earlier competition entries, or null when there are none. */
export function competitionLogCard(ctx) {
  const comps = ctx.repo.list('competitions', {
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt),
  });
  if (!comps.length) return null;

  const deleteComp = async (c) => {
    const ok = await confirmDialog({
      title: 'Delete competition?',
      message: T.confirmDeleteComp(c.event || 'this competition'),
      confirmLabel: T.delete,
      danger: true,
    });
    if (!ok) return;
    ctx.remove('competitions', c.id);
    ctx.rerender();
  };

  return card(
    { class: 'apl-card' },
    APL.Section({
      label: T.competitionLog,
      id: 'comps',
      children: [
        h('p', { class: 'apl-cap13' }, 'Earlier entries. New competitions are logged as Competition sessions (Dashboard → New session).'),
        h(
          'ul',
          { class: 'apl-list plain-list' },
          comps.map((c) =>
            h(
              'li',
              null,
              APL.SessionRow({
                when: c.event || 'Competition',
                summary: [c.date ? formatDate(c.date) : '', c.round].filter(Boolean).join(' · ') || '—',
                score: { total: c.score || '—' },
                foot: [`Sight ${c.sightMark || '—'}`, c.conditions, c.note].filter(Boolean).join(' · '),
                actions: h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-text danger',
                    'aria-label': `${T.delete} ${c.event || 'competition'}`,
                    onClick: () => deleteComp(c),
                  },
                  T.delete,
                ),
              }),
            ),
          ),
        ),
      ],
    }),
  );
}
