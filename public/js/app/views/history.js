// History tab: training log list → session detail (HANDOFF §6), drawn with the APL components.
import { h, s, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { sheetPoint, isMultiSpot, spotCentres } from '../scoring.js';
import { computeStats, sumArrows, fmt } from '../stats.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, gearCard, whenCard } from './common.js';
import { VB, faceRings, faceSheet, faceViewBox } from './face.js';
import { TYPE_LABELS, isScored, sessionType, formSummary, setupSummary } from '../sessionTypes.js';
import { formSections } from './sessionForms.js';
import { formatDuration } from '../sessionLogic.js';
import { competitionLogCard } from './competitionLog.js';
import { TRASH_DAYS } from '../../config.js';

/** The finished session's questions to the archer (the `confirm` adapter of ctx.finished). */
export function askAboutFinishedSession(q) {
  if (q.kind === 'purge') {
    return confirmDialog({
      title: 'Delete for good?',
      message: 'The session is removed permanently. This cannot be undone.',
      confirmLabel: T.delete,
      danger: true,
    });
  }
  return confirmDialog({ title: 'Delete session?', message: T.confirmDeleteSession, confirmLabel: T.delete, danger: true });
}

export function renderHistory(ctx, params) {
  const id = params[0];
  if (id === 'deleted') return renderTrash(ctx);
  if (id) {
    const session = ctx.finished.get(id);
    if (session) return renderDetail(ctx, session);
  }
  return renderList(ctx);
}

const typeLabel = (ss) => TYPE_LABELS[sessionType(ss)];

/** Date and start time on a list row: "Thu 12 Nov 2026 · 18:00". */
const listWhen = (ss) =>
  `${formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${ss.time ? ` · ${ss.time}` : ''}`;

/** The setup line of a scored session: competition, distance, face, ends, duration. */
const scoredSummary = (ss) =>
  [ss.competition?.event, setupSummary(ss, `${ss.ends.length} ends`, ss.minutes != null ? formatDuration(ss.minutes) : '')]
    .filter(Boolean)
    .join(' · ');

/** Delete on a session's page: after a yes it goes to Recently deleted and the page returns to the log. */
async function deleteSession(ctx, ss) {
  const { status } = await ctx.finished.moveToDeleted(ss.id);
  if (status === 'deleted') ctx.toast('Moved to Recently deleted.');
  // gone already (e.g. deleted on another device): back to the log as well
  if (status === 'deleted' || status === 'none') ctx.navigate('history', { replace: true });
}

const deleteButton = (ctx, ss) =>
  h(
    'button',
    { type: 'button', class: 'btn btn-text danger apl-discard', onClick: () => deleteSession(ctx, ss) },
    T.deleteSession,
  );

/** One session in the list. */
function sessionRow(ss) {
  const href = `#/history/${encodeURIComponent(ss.id)}`;
  if (!isScored(ss.type)) {
    const review = ss.review?.workOn?.trim();
    return APL.SessionRow({
      href,
      when: listWhen(ss),
      type: typeLabel(ss),
      summary: formSummary(ss) || '—',
      note: review ? `Improve: ${review}` : null,
      fk: `session-${ss.id}`,
    });
  }
  const st = computeStats(ss.ends);
  return APL.SessionRow({
    href,
    when: listWhen(ss),
    type: typeLabel(ss),
    summary: scoredSummary(ss),
    score: { total: st.total, max: st.max },
    stats: [
      ['M', fmt(st.avgM)],
      ['S', fmt(st.avgS)],
      ['Program', st.programPct == null ? '–' : `${st.programPct}%`],
    ],
    fk: `session-${ss.id}`,
  });
}

function renderList(ctx) {
  const sessions = ctx.finished.list();
  const binned = ctx.finished.deleted().length;
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: T.trainingLog,
        trailing: h('span', { class: 'apl-cap13 apl-header-count' }, `${sessions.length} sessions`),
      }),
      h(
        'div',
        { class: 'apl-screen-body' },
        sessions.length ? null : h('p', { class: 'apl-cap13' }, T.noSessions),
        sessions.length
          ? h(
              'ul',
              { class: 'apl-list plain-list' },
              sessions.map((ss) => h('li', null, sessionRow(ss))),
            )
          : null,
        binned
          ? APL.NavRow({
              href: '#/history/deleted',
              icon: icons.trash(),
              title: 'Recently deleted',
              detail: `${binned} ${binned === 1 ? 'session' : 'sessions'}`,
              fk: 'trash-link',
            })
          : null,
        competitionLogCard(ctx),
      ),
    ),
  };
}

/**
 * Top of a session's page: the screen header (back to the log, the session type as the title), then
 * the date / time and, for scored sessions, the setup line.
 */
function detailHeader(ctx, ss, detail) {
  return [
    APL.ScreenHeader({
      title: `${typeLabel(ss)} session`,
      onBack: () => ctx.navigate('history'),
      backLabel: T.backToLog,
    }),
    h(
      'div',
      { class: 'apl-detail-when' },
      h(
        'span',
        { class: 'apl-t' },
        formatDate(ss.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        ss.time ? ` · ${ss.time}` : '',
      ),
      detail ? h('span', { class: 'apl-cap' }, detail) : null,
    ),
  ];
}

/** A card holding one APL section (label, optional accessory, content). */
const sectionCard = (id, label, children, accessory = null) =>
  card({ class: 'apl-card' }, APL.Section({ label, id, accessory, children }));

/** Strength / mental session: its form (editable, saved as you go), the review and delete. */
function renderFormDetail(ctx, ss) {
  const change = (update, { rerender = true } = {}) => {
    if (ctx.finished.change(ss.id, update).status === 'saved' && rerender) ctx.rerender();
  };
  const [header, when] = detailHeader(ctx, ss, null);
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        when,
        card({ class: 'apl-card apl-form-card' }, formSections(ss.type, ss, change)),
        whenCard(ctx, ss),
        ss.type === 'mental' || ss.type === 'strength' ? null : gearCard(ctx, ss, finishedGear(ctx, ss)),
        reviewCard(ctx, ss),
        deleteButton(ctx, ss),
      ),
    ),
  };
}

/** Competition details, editable (placement is usually known only after the event). */
function competitionCard(ctx, ss) {
  const field = (key, label, placeholder) =>
    APL.TextField({
      label,
      placeholder,
      value: ss.competition?.[key] || '',
      fk: `comp-${key}`,
      onInput: (e) => ctx.finished.setCompetition(ss.id, key, e.target.value),
    });
  return sectionCard('comp', 'Competition', [
    field('event', 'Event', 'Event name'),
    h('div', { class: 'apl-grid-2' }, field('round', 'Round', 'e.g. WA 18 m'), field('placement', 'Placement', 'e.g. 3rd of 24')),
    field('conditions', 'Conditions', 'hall, wind, light'),
  ]);
}

function renderDetail(ctx, ss) {
  if (!isScored(ss.type)) return renderFormDetail(ctx, ss);
  const st = computeStats(ss.ends);
  const dateLbl = formatDate(ss.date);
  const usedSetup = ss.gearSnapshotId ? ctx.repo.get('setups', ss.gearSnapshotId) : null;
  const [header, when] = detailHeader(
    ctx,
    ss,
    setupSummary(ss, `${st.arrows} arrows`, ss.minutes != null ? formatDuration(ss.minutes) : '', usedSetup?.name),
  );

  const byM = sectionCard(
    'bym',
    T.avgByM,
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
          h(
            'div',
            { class: 'bar-track', role: 'img', 'aria-label': `M${g}: average arrow ${fmt(r.avgArrow)} over ${r.n} arrows` },
            h('div', { class: 'bar-fill', style: { width: `${w}%` } }),
          ),
          h('span', { class: 'apl-cap bar-value' }, h('strong', null, fmt(r.avgArrow)), ` · ${r.n} arr`),
        );
      }),
    ),
    h('span', { class: 'apl-cap' }, `LD ${st.cld}/${st.ld} correct`),
  );

  const ends = sectionCard(
    'ends',
    T.ends,
    APL.DataTable({
      label: 'Ends table, scrolls sideways',
      columns: [
        { label: 'Date', muted: true, nowrap: true },
        { label: 'End' },
        { label: 'Arrows', strong: true, nowrap: true },
        { label: 'EndScore', strong: true },
        { label: 'Grade M' },
        { label: 'Grade S' },
        { label: 'Let-downs' },
        { label: 'Correct LD' },
        { label: 'Note', muted: true },
      ],
      rows: ss.ends.map((e, i) => {
        const es = computeStats([e]);
        return [
          dateLbl,
          String(i + 1),
          e.arrows.map((a) => (a.v == null ? '–' : String(a.v))).join(' '),
          String(sumArrows(e.arrows)),
          fmt(es.avgM),
          fmt(es.avgS),
          String(e.ld),
          String(e.cld),
          e.note || '—',
        ];
      }),
    }),
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body history-body' },
        when,
        APL.StatTiles({
          label: 'Session figures',
          items: [
            ['Total', String(st.total)],
            ['Avg arrow', fmt(st.avgArrow, 2)],
            ['10s (X)', `${st.tens} (${st.xs})`],
            ['Avg M', fmt(st.avgM)],
            ['Avg S', fmt(st.avgS)],
            ['M1–2 %', st.programPct == null ? '–' : `${st.programPct}%`],
          ],
        }),
        sessionType(ss) === 'competition' ? competitionCard(ctx, ss) : null,
        whenCard(ctx, ss),
        gearCard(ctx, ss, finishedGear(ctx, ss)),
        reviewCard(ctx, ss),
        sessionGroup(ss),
        byM,
        ends,
        deleteButton(ctx, ss),
      ),
    ),
  };
}

/** The equipment picker's choice, stored on the finished session (the page is drawn again when it changed). */
const finishedGear = (ctx, ss) => (choice) => {
  if (ctx.finished.setGear(ss.id, choice).status === 'saved') ctx.rerender();
};

/** What went well / what to work on: free text, saved as you type. */
function reviewCard(ctx, ss) {
  const field = (key, label, placeholder) =>
    APL.TextArea({
      label,
      rows: 6,
      placeholder,
      value: ss.review?.[key] || '',
      fk: `review-${key}`,
      onInput: (e) => ctx.finished.setReview(ss.id, key, e.target.value),
    });
  return sectionCard('review', T.review, [
    field('good', T.reviewGood, T.reviewGoodPh),
    field('workOn', T.reviewWorkOn, T.reviewWorkOnPh),
    field('how', T.reviewHow, T.reviewHowPh),
  ]);
}

/** All arrows of the session placed on one target face, with the group centre (mean point of impact). */
function sessionGroup(ss) {
  const all = ss.ends.flatMap((e) => e.arrows).filter((a) => a.v != null);
  const placed = all.filter((a) => a.x != null && a.y != null);
  if (!placed.length) return null;
  const multi = isMultiSpot(ss.face);
  const mean = (g) => ({
    x: g.reduce((t, a) => t + a.x, 0) / g.length,
    y: g.reduce((t, a) => t + a.y, 0) / g.length,
    spot: g[0].spot ?? 0,
  });
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

  return sectionCard(
    'group',
    'Group',
    multi
      ? h(
          'div',
          { class: 'group-faces' },
          h('figure', null, sheet, h('figcaption', { class: 'apl-cap' }, 'By spot')),
          h('figure', null, combined, h('figcaption', { class: 'apl-cap' }, 'All spots together')),
        )
      : sheet,
    h('span', { class: 'apl-cap' }, `${placed.length} of ${all.length} placed`),
  );
}

/** One face drawing with arrow dots and group-centre marks (SVG units, spot radius = 100). */
function groupFace({ viewBox, face, points, centres, label }) {
  // the centre mark takes the `mark` token through the style (an SVG attribute cannot read a variable)
  const mark = { stroke: 'var(--mark)' };
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
          s('circle', { r: 4.5, fill: 'none', style: mark, 'stroke-width': 1.6 }),
          s('path', { d: 'M-8 0h16M0 -8v16', style: mark, 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
        ),
      ),
    ),
  );
}

/** Recently deleted: sessions kept TRASH_DAYS after Delete, to restore or delete for good. */
function renderTrash(ctx) {
  const items = ctx.finished.deleted();
  const left = (days) => (days <= 1 ? 'Removed within a day' : `Removed in ${days} days`);
  const summary = (ss) =>
    isScored(ss.type) ? setupSummary(ss, `${ss.ends.length} ends`, `${computeStats(ss.ends).total} points`) : formSummary(ss) || '—';
  const restore = (ss) => {
    const { status } = ctx.finished.restore(ss.id);
    if (status === 'restored') ctx.toast('Session restored.');
    if (status === 'restored' || status === 'none') ctx.rerender();
  };
  const purge = async (ss) => {
    const { status } = await ctx.finished.purge(ss.id);
    if (status === 'purged' || status === 'none') ctx.rerender();
  };
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Recently deleted', onBack: () => ctx.navigate('history'), backLabel: 'Back to history' }),
      h(
        'div',
        { class: 'apl-screen-body' },
        h('p', { class: 'apl-cap13' }, `Deleted sessions are kept here for ${TRASH_DAYS} days, then removed for good.`),
        items.length ? null : h('p', { class: 'apl-cap13' }, 'Nothing here.'),
        items.length
          ? h(
              'ul',
              { class: 'apl-list plain-list' },
              items.map(({ session: ss, daysLeft }) =>
                h(
                  'li',
                  null,
                  APL.SessionRow({
                    when: listWhen(ss),
                    type: typeLabel(ss),
                    summary: summary(ss),
                    foot: left(daysLeft),
                    actions: [
                      APL.Button({ children: 'Restore', variant: 'secondary', onClick: () => restore(ss), fk: `restore-${ss.id}` }),
                      h(
                        'button',
                        { type: 'button', class: 'btn btn-text danger', onClick: () => purge(ss), dataset: { fk: `purge-${ss.id}` } },
                        'Delete now',
                      ),
                    ],
                  }),
                ),
              ),
            )
          : null,
      ),
    ),
  };
}
