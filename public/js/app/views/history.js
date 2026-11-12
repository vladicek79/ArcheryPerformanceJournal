// History tab: training log list → session detail (HANDOFF §6).
import { h, s, formatDate } from '../../core/dom.js';
import { faceLabel, sheetPoint, isMultiSpot, spotCentres } from '../scoring.js';
import { computeStats, sumArrows, fmt } from '../stats.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, gearCard } from './common.js';
import { VB, faceRings, faceSheet, faceViewBox } from './face.js';
import { TYPE_LABELS, isScored, sessionType, formSummary } from '../sessionTypes.js';
import { formSections } from './sessionForms.js';
import { formatDuration } from '../sessionLogic.js';

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

const typeBadge = (ss) => h('span', { class: `type-badge type-${sessionType(ss)}` }, TYPE_LABELS[sessionType(ss)]);

/** List card of a strength or mental session. */
function formListCard(ss) {
  const review = ss.review?.workOn?.trim();
  return h(
    'a',
    { class: 'card session-card', href: `#/history/${encodeURIComponent(ss.id)}` },
    h(
      'div',
      { class: 'spread' },
      h('strong', null, formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })),
      typeBadge(ss),
    ),
    h('div', { class: 'muted small' }, formSummary(ss) || '—'),
    review ? h('div', { class: 'small clamp-2' }, `Improve: ${review}`) : null,
  );
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
          if (!isScored(ss.type)) return h('li', null, formListCard(ss));
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
                typeBadge(ss),
              ),
              h(
                'div',
                { class: 'muted small' },
                [
                  ss.competition?.event,
                  `${ss.distance} m · ${faceLabel(ss.face)} · ${ss.ends.length} ends`,
                  ss.minutes != null ? formatDuration(ss.minutes) : '',
                ]
                  .filter(Boolean)
                  .join(' · '),
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

/** Strength / mental session: its form (editable, saved as you go), the review and delete. */
function renderFormDetail(ctx, ss) {
  const change = (update, { rerender = true } = {}) => {
    const cur = ctx.repo.get('sessions', ss.id);
    if (cur && ctx.save('sessions', { ...cur, ...update(cur) }) && rerender) ctx.rerender();
  };
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
          h('div', { class: 'muted small' }, `${TYPE_LABELS[ss.type]} session`),
        ),
      ),
      card({ class: 'setup-card', 'aria-label': `${TYPE_LABELS[ss.type]} session` }, formSections(ss.type, ss, change)),
      ss.type === 'mental' ? null : gearCard(ctx, ss),
      reviewCard(ctx, ss),
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: del }, T.deleteSession),
    ),
  };
}

/** Competition details, editable (placement is usually known only after the event). */
function competitionCard(ctx, ss) {
  const field = (key, label, placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('input', {
        class: 'input',
        value: ss.competition?.[key] || '',
        placeholder,
        autocomplete: 'off',
        dataset: { fk: `comp-${key}` },
        onInput: (e) => {
          const cur = ctx.repo.get('sessions', ss.id);
          if (cur) ctx.save('sessions', { ...cur, competition: { event: '', round: '', conditions: '', placement: '', ...cur.competition, [key]: e.target.value } });
        },
      }),
    );
  return card(
    { 'aria-labelledby': 'comp-title' },
    h('h2', { class: 'card-title', id: 'comp-title' }, 'Competition'),
    field('event', 'Event', 'Event name'),
    h('div', { class: 'grid-2' }, field('round', 'Round', 'e.g. WA 18 m'), field('placement', 'Placement', 'e.g. 3rd of 24')),
    field('conditions', 'Conditions', 'hall, wind, light'),
  );
}

function renderDetail(ctx, ss) {
  if (!isScored(ss.type)) return renderFormDetail(ctx, ss);
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
          h('div', { class: 'muted small' }, `${TYPE_LABELS[sessionType(ss)]} · ${ss.distance} m · ${faceLabel(ss.face)} · ${st.arrows} arrows${ss.minutes != null ? ` · ${formatDuration(ss.minutes)}` : ''}${snapshot ? ` · ${snapshot.name}` : ''}`),
        ),
      ),
      h(
        'dl',
        { class: 'tiles' },
        tiles.map(([label, value]) => h('div', { class: 'tile' }, h('dt', null, label), h('dd', null, value))),
      ),
      sessionType(ss) === 'competition' ? competitionCard(ctx, ss) : null,
      gearCard(ctx, ss),
      reviewCard(ctx, ss),
      sessionGroup(ss),
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

/** What went well / what to work on: free text, saved as you type. */
function reviewCard(ctx, ss) {
  const field = (key, label, placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('textarea', {
        rows: 6,
        class: 'review-text',
        placeholder,
        value: ss.review?.[key] || '',
        dataset: { fk: `review-${key}` },
        onInput: (e) => {
          const cur = ctx.repo.get('sessions', ss.id);
          if (cur) ctx.save('sessions', { ...cur, review: { good: '', workOn: '', how: '', ...cur.review, [key]: e.target.value } });
        },
      }),
    );
  return card(
    { 'aria-labelledby': 'review-title' },
    h('h2', { class: 'card-title', id: 'review-title' }, T.review),
    field('good', T.reviewGood, T.reviewGoodPh),
    field('workOn', T.reviewWorkOn, T.reviewWorkOnPh),
    field('how', T.reviewHow, T.reviewHowPh),
  );
}

/** All arrows of the session placed on one target face, with the group centre (mean point of impact). */
function sessionGroup(ss) {
  const all = ss.ends.flatMap((e) => e.arrows).filter((a) => a.v != null);
  const placed = all.filter((a) => a.x != null && a.y != null);
  if (!placed.length) return null;
  const multi = isMultiSpot(ss.face);
  const mean = (g) => ({ x: g.reduce((t, a) => t + a.x, 0) / g.length, y: g.reduce((t, a) => t + a.y, 0) / g.length, spot: g[0].spot ?? 0 });
  // group centre per spot on a three-spot sheet, one for the whole face otherwise
  const centres = spotCentres(ss.face)
    .map((_, i) => placed.filter((a) => !multi || (a.spot ?? 0) === i))
    .filter((g) => g.length)
    .map((g) => sheetPoint(mean(g), ss.face));

  const sheet = groupFace({
    viewBox: faceViewBox(ss.face),
    face: faceSheet(ss.face),
    points: placed.map((a) => sheetPoint(a, ss.face)),
    centres,
    label: `Target face with ${placed.length} arrows of this session`,
  });
  // three-spot sheets also get every arrow on one spot, to see the overall group
  const combined = multi
    ? groupFace({
        viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`,
        face: faceRings(ss.face),
        points: placed.map((a) => ({ x: a.x * 100, y: a.y * 100 })),
        centres: [(({ x, y }) => ({ x: x * 100, y: y * 100 }))(mean(placed))],
        label: `All ${placed.length} arrows on one spot`,
      })
    : null;

  return card(
    { 'aria-labelledby': 'group-title' },
    h(
      'div',
      { class: 'spread' },
      h('h2', { class: 'card-title', id: 'group-title' }, 'Group'),
      h('span', { class: 'muted small' }, `${placed.length} of ${all.length} arrows placed on the face`),
    ),
    multi
      ? h(
          'div',
          { class: 'group-faces' },
          h('figure', null, sheet, h('figcaption', { class: 'muted small' }, 'By spot')),
          h('figure', null, combined, h('figcaption', { class: 'muted small' }, 'All spots together')),
        )
      : sheet,
  );
}

/** One face drawing with arrow dots and group-centre marks (SVG units, spot radius = 100). */
function groupFace({ viewBox, face, points, centres, label }) {
  return h(
    'div',
    { class: 'group-face' },
    s(
      'svg',
      { viewBox, role: 'img', 'aria-label': label },
      face,
      points.map((p) => s('circle', { cx: p.x, cy: p.y, r: 3.4, fill: 'rgba(20,24,28,0.75)', stroke: '#FFFFFF', 'stroke-width': 1.1 })),
      centres.map((c) =>
        s(
          'g',
          { transform: `translate(${c.x} ${c.y})` },
          s('circle', { r: 4.5, fill: 'none', stroke: '#E5007E', 'stroke-width': 1.6 }),
          s('path', { d: 'M-8 0h16M0 -8v16', stroke: '#E5007E', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
        ),
      ),
    ),
  );
}
