// Dashboard tab: progress across finished sessions — overall numbers, trends per session,
// avg arrow by mental grade and a per-distance summary. Filter by distance.
import { h, s, formatDate } from '../../core/dom.js';
import { computeStats, fmt } from '../stats.js';
import { T } from '../strings.js';
import { card, chip } from './common.js';

const TREND_SESSIONS = 20;

export function renderDashboard(ctx) {
  const all = ctx.repo
    .list('sessions', { filter: (x) => x.status === 'finished' })
    .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  const distances = [...new Set(all.map((x) => x.distance))].sort((a, b) => a - b);
  let dist = ctx.ui.get().dashDistance ?? 'all';
  if (dist !== 'all' && !distances.includes(dist)) dist = 'all';
  const sessions = dist === 'all' ? all : all.filter((x) => x.distance === dist);

  if (!all.length) {
    return {
      content: h('div', { class: 'stack' }, h('h1', { class: 'page-title' }, T.dashboard), card(null, h('p', { class: 'muted' }, T.noDashboard))),
    };
  }

  const st = computeStats(sessions.flatMap((x) => x.ends));
  const ldPct = st.ld ? Math.round((st.cld / st.ld) * 100) : null;
  const trend = sessions.slice(-TREND_SESSIONS).map((x) => ({ date: x.date, ...computeStats(x.ends) }));

  const tiles = [
    ['Sessions', String(sessions.length)],
    ['Arrows', String(st.arrows)],
    ['Avg arrow', fmt(st.avgArrow, 2)],
    ['Avg M', fmt(st.avgM)],
    ['Avg S', fmt(st.avgS)],
    ['M1–2 %', st.programPct == null ? '–' : `${st.programPct}%`],
  ];

  return {
    content: h(
      'div',
      { class: 'stack' },
      h('h1', { class: 'page-title' }, T.dashboard),
      distances.length > 1
        ? h(
            'div',
            { class: 'filter-row', role: 'group', 'aria-label': 'Distance' },
            [['all', 'All'], ...distances.map((d) => [d, `${d} m`])].map(([v, label]) =>
              chip({ label, pressed: dist === v, fk: `dash-${v}`, onClick: () => ctx.ui.set({ dashDistance: v }) }),
            ),
          )
        : null,
      h('dl', { class: 'tiles' }, tiles.map(([label, value]) => h('div', { class: 'tile' }, h('dt', null, label), h('dd', null, value)))),
      card(
        { 'aria-labelledby': 'trend-arrow' },
        h('div', { class: 'spread' }, h('h2', { class: 'card-title', id: 'trend-arrow' }, 'Avg arrow per session'), h('span', { class: 'muted small' }, `last ${trend.length}`)),
        lineChart(trend, { key: 'avgArrow', min: 0, max: 10, digits: 2, label: 'Avg arrow' }),
      ),
      card(
        { 'aria-labelledby': 'trend-m' },
        h('div', { class: 'spread' }, h('h2', { class: 'card-title', id: 'trend-m' }, 'Avg M per session'), h('span', { class: 'muted small' }, '1 = best, shown on top')),
        lineChart(trend, { key: 'avgM', min: 1, max: 5, invert: true, digits: 1, label: 'Avg M' }),
      ),
      card(
        { 'aria-labelledby': 'dash-bym' },
        h('div', { class: 'spread' }, h('h2', { class: 'card-title', id: 'dash-bym' }, T.avgByM), h('span', { class: 'muted small' }, ldPct == null ? 'LD –' : `LD ${st.cld}/${st.ld} correct (${ldPct}%)`)),
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
      dist === 'all' && distances.length > 1 ? distanceTable(all, distances) : null,
    ),
  };
}

function distanceTable(all, distances) {
  return card(
    { class: 'card-flush', 'aria-labelledby': 'dash-dist' },
    h('h2', { class: 'card-title pad-x', id: 'dash-dist' }, 'By distance'),
    h(
      'div',
      { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'By distance' },
      h(
        'table',
        { class: 'ends-table dist-table' },
        h('thead', null, h('tr', null, ['Dist.', 'Sessions', 'Arrows', 'Avg arrow', 'Avg M', 'Avg S', 'M1–2 %'].map((c) => h('th', { scope: 'col' }, c)))),
        h(
          'tbody',
          null,
          distances.map((d) => {
            const list = all.filter((x) => x.distance === d);
            const st = computeStats(list.flatMap((x) => x.ends));
            return h(
              'tr',
              null,
              h('th', { scope: 'row' }, `${d} m`),
              h('td', null, String(list.length)),
              h('td', null, String(st.arrows)),
              h('td', { class: 'strong' }, fmt(st.avgArrow, 2)),
              h('td', null, fmt(st.avgM)),
              h('td', null, fmt(st.avgS)),
              h('td', null, st.programPct == null ? '–' : `${st.programPct}%`),
            );
          }),
        ),
      ),
    ),
  );
}

/**
 * Single-series line chart, one point per session. Tap or hover a point to read its value.
 * `invert` puts the minimum on top (used for grades, where 1 is best).
 */
function lineChart(rows, { key, min, max, invert = false, digits = 1, label }) {
  const pts = rows.map((r, i) => ({ i, date: r.date, v: r[key] })).filter((p) => p.v != null);
  if (!pts.length) return h('p', { class: 'muted small' }, 'No graded data yet.');

  const W = 320;
  const H = 140;
  const pad = { l: 30, r: 10, t: 10, b: 22 };
  const n = Math.max(rows.length - 1, 1);
  const x = (i) => pad.l + (rows.length === 1 ? (W - pad.l - pad.r) / 2 : (i / n) * (W - pad.l - pad.r));
  const frac = (v) => (v - min) / (max - min);
  const y = (v) => (invert ? pad.t + frac(v) * (H - pad.t - pad.b) : H - pad.b - frac(v) * (H - pad.t - pad.b));

  const ticks = invert ? [1, 2, 3, 4, 5] : [0, 5, 10];
  const readout = h('p', { class: 'chart-readout small', 'aria-live': 'polite' }, latestText(pts[pts.length - 1]));
  function latestText(p) {
    return [`${formatDate(p.date)} · `, h('strong', null, `${label} ${p.v.toFixed(digits)}`)];
  }

  let selected = null;
  const dots = pts.map((p) =>
    s('circle', { class: 'chart-dot', cx: x(p.i), cy: y(p.v), r: 4 }),
  );
  const select = (k) => {
    if (selected != null) dots[selected].classList.remove('on');
    selected = k;
    dots[k].classList.add('on');
    readout.replaceChildren(...latestText(pts[k]));
  };

  const svg = s(
    'svg',
    { class: 'line-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${label} per session, latest ${pts[pts.length - 1].v.toFixed(digits)}` },
    ticks.map((t) => [
      s('line', { class: 'chart-grid', x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t) }),
      s('text', { class: 'chart-axis', x: pad.l - 6, y: y(t) + 3.5, 'text-anchor': 'end' }, String(t)),
    ]),
    s('text', { class: 'chart-axis', x: x(0), y: H - 6, 'text-anchor': rows.length === 1 ? 'middle' : 'start' }, formatDate(rows[0].date, { day: 'numeric', month: 'short' })),
    rows.length > 1
      ? s('text', { class: 'chart-axis', x: x(rows.length - 1), y: H - 6, 'text-anchor': 'end' }, formatDate(rows[rows.length - 1].date, { day: 'numeric', month: 'short' }))
      : null,
    pts.length > 1 ? s('polyline', { class: 'chart-line', points: pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ') }) : null,
    dots,
    // generous invisible hit targets for touch
    pts.map((p, k) =>
      s('rect', {
        class: 'chart-hit',
        x: x(p.i) - Math.max(8, (W - pad.l - pad.r) / n / 2),
        y: 0,
        width: Math.max(16, (W - pad.l - pad.r) / n),
        height: H,
        onPointerenter: () => select(k),
        onClick: () => select(k),
      }),
    ),
  );
  select(pts.length - 1);
  return h('div', { class: 'chart' }, svg, readout);
}
