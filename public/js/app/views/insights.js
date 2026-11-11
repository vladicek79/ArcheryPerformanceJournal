// Insights: trends, a sortable sessions table, the review journal and weekly training load.
// Built for a desktop browser (wide layout); on a phone the same content stacks in one column.
import { h, formatDate } from '../../core/dom.js';
import { faceLabel } from '../scoring.js';
import { fmt } from '../stats.js';
import { T } from '../strings.js';
import { SESSION_TYPES, TYPE_LABELS } from '../sessionTypes.js';
import {
  RANGES,
  filterSessions,
  distancesOf,
  sessionRow,
  sortRows,
  reviewRows,
  weeklyLoad,
} from '../insights.js';
import { card } from './common.js';
import { lineChart, stackedBars, legend } from './charts.js';

const VIEWS = [
  ['trends', 'Trends'],
  ['sessions', 'Sessions'],
  ['reviews', 'Reviews'],
  ['load', 'Training load'],
];

// one fixed color per session type: categorical slots 1–5, validated as a set for both themes.
// The chart order keeps the validated adjacent pairs (slot n next to slot n+1) in stacked bars.
const CHART_TYPES = ['training', 'competition', 'strength', 'mental', 'blank'];
const TYPE_COLORS = {
  training: 'var(--series-1)',
  competition: 'var(--series-2)',
  strength: 'var(--series-3)',
  mental: 'var(--series-4)',
  blank: 'var(--series-5)',
};

const DEFAULTS = { range: '90d', type: 'all', distance: 'all', sortKey: 'date', sortDir: 'desc', q: '' };

const shortDate = (d) => formatDate(d, { day: 'numeric', month: 'short' });

export function renderInsights(ctx, params) {
  const view = VIEWS.some(([id]) => id === params[0]) ? params[0] : 'trends';
  const f = { ...DEFAULTS, ...ctx.ui.get().insights };
  const setF = (patch) => ctx.ui.set({ insights: { ...f, ...patch } });
  const all = ctx.repo.list('sessions');
  const sessions = filterSessions(all, f);

  const body =
    view === 'sessions'
      ? sessionsView(ctx, sessions, f, setF)
      : view === 'reviews'
        ? reviewsView(ctx, sessions, f, setF)
        : view === 'load'
          ? loadView(sessions)
          : trendsView(ctx, sessions);

  return {
    content: h(
      'div',
      { class: 'stack insights' },
      h(
        'div',
        { class: 'title-row' },
        h('h1', { class: 'page-title' }, 'Insights'),
        h('span', { class: 'muted small' }, `${sessions.length} sessions`),
      ),
      // view switch and filters share one edge-to-edge band, aligned with the cards below
      card(
        { class: 'insights-controls' },
        h(
          'nav',
          { class: 'segmented', 'aria-label': 'Insights views' },
          VIEWS.map(([id, label]) =>
            h(
              'a',
              { href: `#/insights/${id}`, class: 'seg', 'aria-current': view === id ? 'page' : null },
              label,
            ),
          ),
        ),
        filters(all, f, setF),
      ),
      body,
    ),
  };
}

// ---------------------------------------------------------------- filters

function filters(all, f, setF) {
  const select = (label, value, options, onChange, fk) =>
    h(
      'label',
      { class: 'filter' },
      h('span', { class: 'field-label' }, label),
      h(
        'select',
        { class: 'input', dataset: { fk }, onChange: (e) => onChange(e.target.value) },
        options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
      ),
    );
  return h(
    'div',
    { class: 'filters' },
    h(
      'div',
      { class: 'range', role: 'group', 'aria-label': 'Date range' },
      RANGES.map((r) =>
        h(
          'button',
          {
            type: 'button',
            class: 'range-btn',
            'aria-pressed': String(f.range === r.id),
            dataset: { fk: `range-${r.id}` },
            onClick: () => setF({ range: r.id }),
          },
          r.label,
        ),
      ),
    ),
    select(
      'Type',
      f.type,
      [['all', 'All types'], ...SESSION_TYPES.map((t) => [t, TYPE_LABELS[t]])],
      (v) => setF({ type: v }),
      'f-type',
    ),
    select(
      'Distance',
      f.distance,
      [['all', 'All distances'], ...distancesOf(all).map((d) => [String(d), `${d} m`])],
      (v) => setF({ distance: v }),
      'f-dist',
    ),
  );
}

const empty = (text) => card(null, h('p', { class: 'muted' }, text));

// ---------------------------------------------------------------- trends

function trendsView(ctx, sessions) {
  const rows = sessions.map(sessionRow).filter((r) => r.arrows && r.total != null);
  if (!rows.length)
    return empty('No scored sessions in this range. Training and competition sessions appear here.');

  const arrows = rows.reduce((t, r) => t + r.arrows, 0);
  const total = rows.reduce((t, r) => t + r.total, 0);
  const wmean = (key) => {
    const xs = rows.filter((r) => r[key] != null);
    return xs.length
      ? xs.reduce((t, r) => t + r[key] * r.arrows, 0) / xs.reduce((t, r) => t + r.arrows, 0)
      : null;
  };
  const tiles = [
    ['Sessions', String(rows.length)],
    ['Arrows', String(arrows)],
    ['Avg arrow', fmt(total / arrows, 2)],
    ['Avg M', fmt(wmean('avgM'))],
    ['Avg S', fmt(wmean('avgS'))],
    ['M1–2 %', wmean('programPct') == null ? '–' : `${Math.round(wmean('programPct'))}%`],
  ];

  const points = rows.map((r) => ({
    id: r.id,
    label: shortDate(r.date),
    sub: [TYPE_LABELS[r.type], r.distance ? `${r.distance} m` : '', r.event].filter(Boolean).join(' · '),
    values: { avgArrow: r.avgArrow, avgM: r.avgM, avgS: r.avgS, programPct: r.programPct },
  }));
  const open = (p) => ctx.navigate(`history/${p.id}`);
  const lowest = Math.min(...rows.map((r) => r.avgArrow));
  const yMin = Math.max(0, Math.floor(lowest) - 1);
  const arrowTicks = [];
  for (let v = yMin; v <= 10; v += yMin >= 6 ? 1 : 2) arrowTicks.push(v);

  const gradeSeries = [
    { key: 'avgM', label: 'Avg M (mental)', color: 'var(--series-1)', format: (v) => v.toFixed(1) },
    { key: 'avgS', label: 'Avg S (shot)', color: 'var(--series-2)', format: (v) => v.toFixed(1) },
  ];
  const chartCard = (title, note, ...children) =>
    card(
      { class: 'chart-card' },
      h(
        'div',
        { class: 'spread' },
        h('h2', { class: 'card-title' }, title),
        note ? h('span', { class: 'muted small' }, note) : null,
      ),
      ...children,
    );

  return h(
    'div',
    { class: 'stack' },
    h(
      'dl',
      { class: 'tiles tiles-6' },
      tiles.map(([l, v]) => h('div', { class: 'tile' }, h('dt', null, l), h('dd', null, v))),
    ),
    h(
      'div',
      { class: 'chart-grid' },
      chartCard(
        'Average arrow',
        'per session · tap to open',
        lineChart({
          points,
          series: [
            { key: 'avgArrow', label: 'Avg arrow', color: 'var(--series-1)', format: (v) => v.toFixed(2) },
          ],
          yDomain: [yMin, 10],
          yTicks: arrowTicks,
          onPick: open,
        }),
      ),
      chartCard(
        'Mental & shot grades',
        '1 = best, at the top',
        legend(gradeSeries),
        lineChart({
          points,
          series: gradeSeries,
          yDomain: [1, 5],
          yTicks: [1, 2, 3, 4, 5],
          invert: true,
          onPick: open,
        }),
      ),
      chartCard(
        'Mental program (M1–2 %)',
        'share of arrows graded M1 or M2',
        lineChart({
          points,
          series: [{ key: 'programPct', label: 'M1–2', color: 'var(--series-1)', format: (v) => `${v}%` }],
          yDomain: [0, 100],
          yTicks: [0, 25, 50, 75, 100],
          onPick: open,
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------- sessions table

const COLUMNS = [
  ['date', 'Date'],
  ['type', 'Type'],
  ['distance', 'Distance'],
  ['face', 'Face'],
  ['arrows', 'Arrows'],
  ['total', 'Score'],
  ['avgArrow', 'Avg arrow'],
  ['avgM', 'Avg M'],
  ['avgS', 'Avg S'],
  ['programPct', 'M1–2 %'],
  ['minutes', 'Minutes'],
];

function cell(r, key) {
  const v = r[key];
  if (key === 'date') return formatDate(v);
  if (key === 'type')
    return h(
      'span',
      { class: 'type-dot-label' },
      h('span', { class: 'viz-swatch', style: { background: TYPE_COLORS[v] } }),
      TYPE_LABELS[v] + (r.event ? ` · ${r.event}` : ''),
    );
  if (v == null) return '–';
  if (key === 'distance') return `${v} m`;
  if (key === 'face') return faceLabel(v);
  if (key === 'total') return `${v} / ${r.max}`;
  if (key === 'avgArrow') return v.toFixed(2);
  if (key === 'avgM' || key === 'avgS') return v.toFixed(1);
  if (key === 'programPct') return `${v}%`;
  return String(v);
}

function sessionsView(ctx, sessions, f, setF) {
  if (!sessions.length) return empty('No sessions match these filters.');
  const rows = sortRows(sessions.map(sessionRow), f.sortKey, f.sortDir);
  const sortBy = (key) =>
    setF({ sortKey: key, sortDir: f.sortKey === key && f.sortDir === 'desc' ? 'asc' : 'desc' });
  return card(
    { class: 'card-flush' },
    h(
      'div',
      {
        class: 'table-scroll',
        tabindex: '0',
        role: 'region',
        'aria-label': 'Sessions table, scrolls sideways',
      },
      h(
        'table',
        { class: 'data-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            COLUMNS.map(([key, label]) =>
              h(
                'th',
                {
                  scope: 'col',
                  class: key === 'date' || key === 'type' ? null : 'num',
                  'aria-sort': f.sortKey === key ? (f.sortDir === 'asc' ? 'ascending' : 'descending') : null,
                },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'sort-btn',
                    dataset: { fk: `sort-${key}` },
                    onClick: () => sortBy(key),
                  },
                  label,
                  f.sortKey === key ? (f.sortDir === 'asc' ? ' ▲' : ' ▼') : '',
                ),
              ),
            ),
          ),
        ),
        h(
          'tbody',
          null,
          rows.map((r) =>
            h(
              'tr',
              {
                class: 'row-link',
                tabindex: '0',
                onClick: () => ctx.navigate(`history/${r.id}`),
                onKeydown: (e) => e.key === 'Enter' && ctx.navigate(`history/${r.id}`),
              },
              COLUMNS.map(([key]) =>
                h('td', { class: key === 'date' || key === 'type' ? 'nowrap' : 'num' }, cell(r, key)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- review journal

function reviewsView(ctx, sessions, f, setF) {
  const rows = reviewRows(sessions, f.q);
  const save = (id, key) => (e) => {
    const cur = ctx.repo.get('sessions', id);
    if (cur)
      ctx.save('sessions', {
        ...cur,
        review: { good: '', workOn: '', how: '', ...cur.review, [key]: e.target.value },
      });
  };
  const note = (s, key, label) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('textarea', {
        class: 'review-text journal-text',
        rows: 3,
        value: s.review?.[key] || '',
        dataset: { fk: `j-${s.id}-${key}` },
        onInput: save(s.id, key),
      }),
    );
  return h(
    'div',
    { class: 'stack' },
    h('input', {
      class: 'input search',
      type: 'search',
      placeholder: 'Search the reviews…',
      value: f.q,
      'aria-label': 'Search the reviews',
      dataset: { fk: 'review-search' },
      onInput: (e) => setF({ q: e.target.value }),
    }),
    rows.length
      ? h(
          'ul',
          { class: 'plain-list stack-sm' },
          rows.map((s) => {
            const r = sessionRow(s);
            return h(
              'li',
              { class: 'card journal-row' },
              h(
                'a',
                { class: 'journal-head', href: `#/history/${encodeURIComponent(s.id)}` },
                h(
                  'strong',
                  null,
                  formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
                ),
                h(
                  'span',
                  { class: 'type-dot-label muted small' },
                  h('span', { class: 'viz-swatch', style: { background: TYPE_COLORS[r.type] } }),
                  TYPE_LABELS[r.type],
                ),
                h(
                  'span',
                  { class: 'muted small' },
                  [
                    r.event,
                    r.distance ? `${r.distance} m` : '',
                    r.total != null ? `${r.total} / ${r.max}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                ),
              ),
              note(s, 'good', T.reviewGood),
              note(s, 'workOn', T.reviewWorkOn),
              note(s, 'how', T.reviewHow),
            );
          }),
        )
      : empty(
          f.q
            ? 'No review matches the search.'
            : 'No reviews in this range yet. Write one on any session page.',
        ),
  );
}

// ---------------------------------------------------------------- training load

function loadView(sessions) {
  const weeks = weeklyLoad(sessions);
  if (!weeks.length) return empty('No sessions in this range.');
  const series = CHART_TYPES.map((t) => ({ key: t, label: TYPE_LABELS[t], color: TYPE_COLORS[t] }));
  const weekLabel = (w) => formatDate(w, { day: 'numeric', month: 'short' });
  const bars = weeks.map((w) => ({
    label: weekLabel(w.week),
    values: w,
    tip: [
      `Week of ${weekLabel(w.week)}`,
      ...CHART_TYPES.filter((t) => w[t]).map((t) => `${TYPE_LABELS[t]}: ${w[t]}`),
      w.arrows ? `Arrows: ${w.arrows}` : null,
      w.strengthMin ? `Strength: ${w.strengthMin} min` : null,
      w.mentalMin ? `Mental: ${w.mentalMin} min` : null,
    ].filter(Boolean),
  }));
  const cols = [
    ['Week of', (w) => weekLabel(w.week)],
    ...CHART_TYPES.map((t) => [TYPE_LABELS[t], (w) => String(w[t] || '–')]),
    ['Arrows', (w) => String(w.arrows || '–')],
    ['Strength min', (w) => String(w.strengthMin || '–')],
    ['Mental min', (w) => String(w.mentalMin || '–')],
  ];
  return h(
    'div',
    { class: 'stack' },
    card(
      { class: 'chart-card' },
      h(
        'div',
        { class: 'spread' },
        h('h2', { class: 'card-title' }, 'Sessions per week'),
        h('span', { class: 'muted small' }, 'by type'),
      ),
      legend(series),
      stackedBars({ bars, series, yLabel: 'Sessions per week by type' }),
    ),
    card(
      { class: 'card-flush' },
      h(
        'div',
        {
          class: 'table-scroll',
          tabindex: '0',
          role: 'region',
          'aria-label': 'Weekly load table, scrolls sideways',
        },
        h(
          'table',
          { class: 'data-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              cols.map(([l], i) => h('th', { scope: 'col', class: i === 0 ? null : 'num' }, l)),
            ),
          ),
          h(
            'tbody',
            null,
            [...weeks].reverse().map((w) =>
              h(
                'tr',
                null,
                cols.map(([, fn], i) => h('td', { class: i === 0 ? 'nowrap' : 'num' }, fn(w))),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
