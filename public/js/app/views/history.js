// History tab: training log list → session detail (HANDOFF §6).
import { h, formatDate } from '../../core/dom.js';
import { faceLabel } from '../scoring.js';
import { computeStats, sumArrows, fmt } from '../stats.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card } from './common.js';

const finished = (repo) =>
  repo.list('sessions', {
    filter: (x) => x.status === 'finished',
    sort: (a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt),
  });

export function renderHistory(ctx, params) {
  const id = params[0];
  if (id) {
    const session = ctx.repo.get('sessions', id);
    if (session && session.status === 'finished') return renderDetail(ctx, session);
  }
  return renderList(ctx);
}

function renderList(ctx) {
  const sessions = finished(ctx.repo);
  return {
    content: h(
      'div',
      { class: 'stack' },
      h('div', { class: 'title-row' }, h('h1', { class: 'page-title' }, T.trainingLog), h('span', { class: 'muted small' }, `${sessions.length} sessions`)),
      sessions.length ? null : card(null, h('p', { class: 'muted' }, T.noSessions)),
      h(
        'ul',
        { class: 'plain-list stack-sm' },
        sessions.map((ss) => {
          const st = computeStats(ss.ends);
          return h(
            'li',
            null,
            h(
              'a',
              { class: 'card session-card', href: `#/history/${encodeURIComponent(ss.id)}` },
              h(
                'div',
                { class: 'spread' },
                h('strong', null, formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })),
                h('span', { class: 'muted small' }, `${ss.distance} m · ${faceLabel(ss.face)} · ${ss.ends.length} ends`),
              ),
              h(
                'div',
                { class: 'spread align-end' },
                h('div', { class: 'big-score' }, h('span', null, String(st.total)), h('span', { class: 'muted' }, ` / ${st.max}`)),
                h(
                  'div',
                  { class: 'mini-stats' },
                  h('span', null, 'M ', h('strong', null, fmt(st.avgM))),
                  h('span', null, 'S ', h('strong', null, fmt(st.avgS))),
                  h('span', null, 'Program ', h('strong', null, st.programPct == null ? '–' : `${st.programPct}%`)),
                ),
              ),
            ),
          );
        }),
      ),
    ),
  };
}

function renderDetail(ctx, ss) {
  const st = computeStats(ss.ends);
  const dateLbl = formatDate(ss.date);
  const snapshot = ss.gearSnapshotId ? ctx.repo.get('gearSnapshots', ss.gearSnapshotId) : null;

  const tiles = [
    ['Total', String(st.total)],
    ['Avg arrow', fmt(st.avgArrow, 2)],
    ['10s (X)', `${st.tens} (${st.xs})`],
    ['Avg M', fmt(st.avgM)],
    ['Avg S', fmt(st.avgS)],
    ['M1–2 %', st.programPct == null ? '–' : `${st.programPct}%`],
  ];

  const del = () => {
    if (!confirm(T.confirmDeleteSession)) return;
    ctx.remove('sessions', ss.id);
    ctx.navigate('history');
  };

  return {
    content: h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row align-center' },
        h('a', { class: 'icon-btn', href: '#/history', 'aria-label': T.backToLog }, icons.back()),
        h(
          'div',
          { class: 'grow' },
          h('h1', { class: 'page-title sm' }, formatDate(ss.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
          h('div', { class: 'muted small' }, `${ss.distance} m · ${faceLabel(ss.face)} · ${st.arrows} arrows${snapshot ? ` · ${snapshot.name}` : ''}`),
        ),
      ),
      h(
        'dl',
        { class: 'tiles' },
        tiles.map(([label, value]) => h('div', { class: 'tile' }, h('dt', null, label), h('dd', null, value))),
      ),
      card(
        { 'aria-labelledby': 'bym-title' },
        h('div', { class: 'spread' }, h('h2', { class: 'card-title', id: 'bym-title' }, T.avgByM), h('span', { class: 'muted small' }, `LD ${st.cld}/${st.ld} correct`)),
        h(
          'ul',
          { class: 'plain-list bars' },
          [1, 2, 3, 4, 5].map((g) => {
            const r = st.byM[g];
            const w = r.avgArrow == null ? 0 : Math.round(r.avgArrow * 10);
            return h(
              'li',
              { class: 'bar-row' },
              h('span', { class: `grade-badge g${g} wide` }, `M${g}`),
              h('div', { class: 'bar-track', role: 'img', 'aria-label': `M${g}: average arrow ${fmt(r.avgArrow)} over ${r.n} arrows` }, h('div', { class: 'bar-fill', style: { width: `${w}%` } })),
              h('span', { class: 'muted small num right' }, h('strong', { class: 'ink' }, fmt(r.avgArrow)), ` · ${r.n} arr`),
            );
          }),
        ),
      ),
      card(
        { class: 'card-flush', 'aria-labelledby': 'ends-title' },
        h('h2', { class: 'card-title pad-x', id: 'ends-title' }, T.ends),
        h(
          'div',
          { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Ends table, scrolls sideways' },
          h(
            'table',
            { class: 'ends-table' },
            h(
              'thead',
              null,
              h('tr', null, ['Date', 'End', 'Arrows', 'EndScore', 'Grade M', 'Grade S', 'Let-downs', 'Correct LD', 'Note'].map((c) => h('th', { scope: 'col' }, c))),
            ),
            h(
              'tbody',
              null,
              ss.ends.map((e, i) => {
                const es = computeStats([e]);
                return h(
                  'tr',
                  null,
                  h('td', { class: 'muted nowrap' }, dateLbl),
                  h('td', null, String(i + 1)),
                  h('td', { class: 'strong nowrap' }, e.arrows.map((a) => (a.v == null ? '–' : String(a.v))).join(' ')),
                  h('td', { class: 'strong' }, String(sumArrows(e.arrows))),
                  h('td', null, fmt(es.avgM)),
                  h('td', null, fmt(es.avgS)),
                  h('td', null, String(e.ld)),
                  h('td', null, String(e.cld)),
                  h('td', { class: 'muted note-cell' }, e.note || '—'),
                );
              }),
            ),
          ),
        ),
      ),
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: del }, T.deleteSession),
    ),
  };
}
