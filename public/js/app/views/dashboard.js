// Dashboard: the start page and gate to the app's features (start or continue a session, history,
// equipment, sight marks, grading guide, settings), with a reminder of the last session's review.
import { h, formatDate } from '../../core/dom.js';
import { faceLabel } from '../scoring.js';
import { computeStats } from '../stats.js';
import { icons } from '../icons.js';
import { card } from './common.js';
import { TYPE_LABELS, isScored, sessionType, formSummary, newestFirst } from '../sessionTypes.js';
import { findActive } from './log.js';

const lastFinished = (repo) =>
  repo.list('sessions', {
    filter: (x) => x.status === 'finished',
    sort: newestFirst,
  });

export function renderDashboard(ctx) {
  const active = findActive(ctx.repo);
  const finished = lastFinished(ctx.repo);
  const last = finished[0] || null;

  // --- start / continue
  const actions = card(
    { class: 'hub-actions', 'aria-label': 'Session' },
    active
      ? [
          h(
            'div',
            { class: 'hub-active' },
            h('div', { class: 'section-label' }, `${TYPE_LABELS[sessionType(active)]} in progress`),
            active.competition?.event ? h('div', { class: 'strong' }, active.competition.event) : null,
            h(
              'div',
              { class: 'strong' },
              `${active.distance} m · ${faceLabel(active.face)} · ${active.arrowsPerEnd} arrows/end`,
            ),
            h(
              'div',
              { class: 'muted small' },
              `${active.ends.length} ${active.ends.length === 1 ? 'end' : 'ends'} saved`,
            ),
          ),
          h('a', { class: 'btn btn-primary btn-xl', href: '#/log' }, 'Continue session'),
          h('a', { class: 'btn btn-outline', href: '#/new' }, 'New session'),
        ]
      : h('a', { class: 'btn btn-primary btn-xl', href: '#/new' }, 'New session'),
  );

  // --- feature tiles
  const tile = (props, icon, title, sub) =>
    h(
      props.href ? 'a' : 'button',
      { class: 'hub-tile', ...(props.href ? {} : { type: 'button' }), ...props },
      icon(),
      h('span', { class: 'hub-tile-title' }, title),
      h('span', { class: 'hub-tile-sub muted' }, sub),
    );
  const tiles = card(
    { class: 'hub-card', 'aria-label': 'Sections' },
    h(
      'div',
      { class: 'hub-grid' },
      tile(
        { href: '#/history' },
        icons.history,
        'History',
        `${finished.length} ${finished.length === 1 ? 'session' : 'sessions'}`,
      ),
      tile({ href: '#/insights' }, icons.insights, 'Insights', 'Trends, reviews, training load'),
      tile({ href: '#/gear' }, icons.gear, 'Equipment', 'Bow setup & snapshots'),
      tile({ href: '#/sights' }, icons.sights, 'Sight marks', 'Marks & competitions'),
      tile({ onClick: () => ctx.ui.set({ guide: true }) }, icons.help, 'Grades', 'M / S grading guide'),
      tile(
        { href: '#/settings' },
        icons.settings,
        'Settings',
        ctx.sync?.signedIn() ? 'Synced to Google Drive' : 'Backup & sync',
      ),
    ),
  );

  // --- last session reminder
  let lastCard = null;
  if (last) {
    const scored = isScored(last.type);
    const st = scored ? computeStats(last.ends) : null;
    const workOn = last.review?.workOn?.trim();
    const how = last.review?.how?.trim();
    lastCard = card(
      { 'aria-labelledby': 'last-title' },
      h(
        'a',
        { class: 'hub-last', href: `#/history/${encodeURIComponent(last.id)}` },
        h(
          'div',
          { class: 'spread' },
          h('h2', { class: 'card-title', id: 'last-title' }, 'Last session'),
          h(
            'span',
            { class: 'muted small' },
            formatDate(last.date, { weekday: 'short', day: 'numeric', month: 'short' }),
          ),
        ),
        h(
          'div',
          { class: 'spread align-end' },
          scored
            ? h(
                'div',
                { class: 'big-score' },
                h('span', null, String(st.total)),
                h('span', { class: 'muted' }, ` / ${st.max}`),
              )
            : h('div', { class: 'strong' }, formSummary(last) || '—'),
          h(
            'span',
            { class: 'muted small' },
            scored
              ? `${TYPE_LABELS[sessionType(last)]} · ${last.distance} m · ${faceLabel(last.face)}`
              : TYPE_LABELS[last.type],
          ),
        ),
        workOn
          ? h(
              'div',
              { class: 'hub-workon' },
              h('div', { class: 'section-label' }, 'To improve'),
              h('p', null, workOn),
            )
          : null,
        how
          ? h('div', { class: 'hub-workon' }, h('div', { class: 'section-label' }, 'How'), h('p', null, how))
          : null,
      ),
    );
  }

  return { content: h('div', { class: 'stack' }, actions, tiles, lastCard) };
}
