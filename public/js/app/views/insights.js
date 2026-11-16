// Insights: trends, a sortable sessions table, the review journal and weekly training load, drawn
// with the APL components. Built for a desktop browser (wide layout); on a phone the same content
// stacks in one column.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
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
  ['load', 'Load'],
];

// one fixed colour per session type: the series-1…6 data tokens, validated as a set.
// The chart order keeps the validated adjacent pairs (slot n next to slot n+1) in stacked bars.
const CHART_TYPES = ['training', 'competition', 'strength', 'mental', 'blank', 'manual'];
const TYPE_COLORS = {
  training: 'var(--series-1)',
  competition: 'var(--series-2)',
  strength: 'var(--series-3)',
  mental: 'var(--series-4)',
  blank: 'var(--series-5)',
  manual: 'var(--series-6)',
};

const DEFAULTS = { range: '90d', type: 'all', distance: 'all', sortKey: 'date', sortDir: 'desc', q: '' };

const shortDate = (d) => formatDate(d, { day: 'numeric', month: 'short' });

/** A card holding one APL section: a title, an optional caption on the right, then the content. */
const sectionCard = (id, label, note, children, cls = 'chart-card') =>
  card(
    { class: ['apl-card', cls] },
    APL.Section({ label, id, accessory: note ? h('span', { class: 'apl-cap' }, note) : null, children }),
  );

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
      { class: 'apl-screen insights' },
      APL.ScreenHeader({
        title: 'Insights',
        trailing: h('span', { class: 'apl-cap13 apl-header-count' }, `${sessions.length} sessions`),
      }),
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        // the view switch and the filters share one band above the content
        card(
          { class: 'apl-card insights-controls' },
          APL.SegmentedControl({
            label: 'Insights views',
            value: view,
            options: VIEWS.map(([value, label]) => ({ value, label })),
            onChange: (id) => ctx.navigate(`insights/${id}`),
            fk: 'view',
          }),
          filters(all, f, setF),
        ),
        body,
      ),
    ),
  };
}

// ---------------------------------------------------------------- filters

function filters(all, f, setF) {
  return h(
    'div',
    { class: 'filters' },
    APL.Section({
      label: 'Range',
      id: 'f-range',
      children: APL.SegmentedControl({
        label: 'Date range',
        value: f.range,
        options: RANGES.map((r) => ({ value: r.id, label: r.label })),
        onChange: (range) => setF({ range }),
        fk: 'range',
      }),
    }),
    APL.Section({
      label: 'Type',
      id: 'f-type',
      children: APL.OptionPills({
        label: 'Session type',
        value: f.type,
        options: [
          { value: 'all', label: 'All types' },
          ...SESSION_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
        ],
        onChange: (type) => setF({ type }),
        fk: 'f-type',
      }),
    }),
    APL.Section({
      label: 'Distance',
      id: 'f-dist',
      children: APL.OptionPills({
        label: 'Distance',
        value: f.distance,
        options: [
          { value: 'all', label: 'All distances' },
          ...distancesOf(all).map((d) => ({ value: String(d), label: `${d} m` })),
        ],
        onChange: (distance) => setF({ distance }),
        fk: 'f-dist',
      }),
    }),
  );
}

const empty = (text) => card({ class: 'apl-card' }, h('p', { class: 'apl-cap13' }, text));

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

  return h(
    'div',
    { class: 'insights-view' },
    APL.StatTiles({
      label: 'Figures for this range',
      columns: 3,
      items: [
        ['Sessions', String(rows.length)],
        ['Arrows', String(arrows)],
        ['Avg arrow', fmt(total / arrows, 2)],
        ['Avg M', fmt(wmean('avgM'))],
        ['Avg S', fmt(wmean('avgS'))],
        ['M1–2 %', wmean('programPct') == null ? '–' : `${Math.round(wmean('programPct'))}%`],
      ],
    }),
    h(
      'div',
      { class: 'chart-grid' },
      sectionCard(
        'ch-arrow',
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
      sectionCard('ch-grades', 'Mental and shot grades', '1 = best, at the top', [
        legend(gradeSeries),
        lineChart({
          points,
          series: gradeSeries,
          yDomain: [1, 5],
          yTicks: [1, 2, 3, 4, 5],
          invert: true,
          onPick: open,
        }),
      ]),
      sectionCard(
        'ch-program',
        'Mental program (M1–2 %)',
        'arrows graded M1 or M2',
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

/** A session type with its series colour, as in the charts. */
const typeSwatch = (type, text) =>
  h(
    'span',
    { class: 'type-dot-label' },
    h('span', { class: 'viz-swatch', style: { background: TYPE_COLORS[type] } }),
    text,
  );

function cell(r, key) {
  const v = r[key];
  if (key === 'date') return formatDate(v);
  if (key === 'type') return typeSwatch(v, TYPE_LABELS[v] + (r.event ? ` · ${r.event}` : ''));
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
  const text = (key) => key === 'date' || key === 'type';
  return APL.DataTable({
    label: 'Sessions table, scrolls sideways',
    columns: COLUMNS.map(([key, label]) => ({
      align: text(key) ? null : 'end',
      nowrap: true,
      sort: f.sortKey === key ? (f.sortDir === 'asc' ? 'ascending' : 'descending') : undefined,
      label: h(
        'button',
        { type: 'button', class: 'sort-btn', dataset: { fk: `sort-${key}` }, onClick: () => sortBy(key) },
        label,
        f.sortKey === key ? (f.sortDir === 'asc' ? ' ▲' : ' ▼') : '',
      ),
    })),
    rows: rows.map((r) => COLUMNS.map(([key]) => cell(r, key))),
    rowProps: (i) => ({
      class: 'row-link',
      tabindex: '0',
      onClick: () => ctx.navigate(`history/${rows[i].id}`),
      onKeydown: (e) => e.key === 'Enter' && ctx.navigate(`history/${rows[i].id}`),
    }),
  });
}

// ---------------------------------------------------------------- review journal

function reviewsView(ctx, sessions, f, setF) {
  const rows = reviewRows(sessions, f.q);
  const save = (id, key) => (e) => ctx.finished.setReview(id, key, e.target.value);
  const note = (s, key, label) =>
    APL.TextArea({
      label,
      rows: 3,
      value: s.review?.[key] || '',
      fk: `j-${s.id}-${key}`,
      onInput: save(s.id, key),
    });
  return h(
    'div',
    { class: 'insights-view' },
    APL.TextField({
      label: 'Search the reviews',
      hideLabel: true,
      type: 'search',
      placeholder: 'Search the reviews…',
      value: f.q,
      fk: 'review-search',
      onInput: (e) => setF({ q: e.target.value }),
    }),
    rows.length
      ? h(
          'ul',
          { class: 'apl-list plain-list' },
          rows.map((s) => {
            const r = sessionRow(s);
            return h(
              'li',
              { class: 'card apl-card journal-row' },
              h(
                'a',
                { class: 'journal-head', href: `#/history/${encodeURIComponent(s.id)}` },
                h(
                  'span',
                  { class: 'apl-t' },
                  formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
                ),
                h('span', { class: 'apl-cap' }, typeSwatch(r.type, TYPE_LABELS[r.type])),
                h(
                  'span',
                  { class: 'apl-cap' },
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
      w.strengthMin ? `SPT: ${w.strengthMin} min` : null,
      w.mentalMin ? `Mental: ${w.mentalMin} min` : null,
    ].filter(Boolean),
  }));
  // Time and arrows: two panels on the same weeks (one scale each, never two y-axes on one plot),
  // sharing one tooltip so a week reads as a whole.
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
  const volumeTip = (w) => [
    `Week of ${weekLabel(w.week)}`,
    `Time: ${w.totalMin ? fmtMin(w.totalMin) : '–'}`,
    ...CHART_TYPES.filter((t) => w.min[t]).map((t) => `  ${TYPE_LABELS[t]}: ${fmtMin(w.min[t])}`),
    `Arrows: ${w.arrows || '–'}`,
  ];
  const hourBars = weeks.map((w) => ({
    label: weekLabel(w.week),
    values: Object.fromEntries(CHART_TYPES.map((t) => [t, w.min[t] / 60])),
    tip: volumeTip(w),
  }));
  const arrowSeries = [{ key: 'arrows', label: 'Arrows', color: 'var(--muted)' }];
  const arrowBars = weeks.map((w) => ({
    label: weekLabel(w.week),
    values: { arrows: w.arrows },
    tip: volumeTip(w),
  }));
  const panelLabel = (text) => h('span', { class: 'apl-cap' }, text);

  const cols = [
    ['Week of', (w) => weekLabel(w.week)],
    ...CHART_TYPES.map((t) => [TYPE_LABELS[t], (w) => String(w[t] || '–')]),
    ['Arrows', (w) => String(w.arrows || '–')],
    ['Time', (w) => (w.totalMin ? fmtMin(w.totalMin) : '–')],
    ['SPT min', (w) => String(w.strengthMin || '–')],
    ['Mental min', (w) => String(w.mentalMin || '–')],
  ];
  return h(
    'div',
    { class: 'insights-view' },
    sectionCard('ch-weeks', 'Sessions per week', 'by type', [
      legend(series),
      stackedBars({ bars, series, yLabel: 'Sessions per week by type' }),
    ]),
    sectionCard('ch-volume', 'Time and arrows per week', 'time by type', [
      legend(series),
      panelLabel('Hours'),
      stackedBars({ bars: hourBars, series, height: 180, yLabel: 'Hours per week by type' }),
      panelLabel('Arrows'),
      stackedBars({ bars: arrowBars, series: arrowSeries, height: 150, yLabel: 'Arrows per week' }),
    ]),
    APL.DataTable({
      label: 'Weekly load table, scrolls sideways',
      columns: cols.map(([label], i) => ({ label, align: i === 0 ? null : 'end', nowrap: true })),
      rows: [...weeks].reverse().map((w) => cols.map(([, fn]) => fn(w))),
    }),
  );
}
