// The overview of a scored session, one page for two moments: right after Finish (`finished`: a
// "Session saved" banner, the review open for writing, Later / Save review) and from History
// (`history`: a read view where each part has its own Edit). Top to bottom: the score summary, the
// process grades, the performance review, the group, the ends and the details.
// The review section is also used on the page of a form session.
import { h, s, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { computeStats, fmt } from '../stats.js';
import { faceLabel } from '../scoring.js';
import { formatDuration } from '../sessionLogic.js';
import {
  TYPE_LABELS,
  sessionType,
  isGraded,
  emptyReview,
  CONDITIONS,
  parseConditions,
  joinConditions,
  toggleCondition,
  distanceLabel,
  distanceMetres,
} from '../sessionTypes.js';
import {
  scoreCounts,
  endAverages,
  averageDelta,
  gradeDistribution,
  gradeInsight,
  groupArrows,
  matchesFilter,
  matchesSpot,
  groupSpots,
  groupCentre,
  centreDirection,
  centreReading,
  GROUP_FILTERS,
  FILTER_LABELS,
  sightCorrection,
  sightMoveText,
  wildArrows,
  SIGHT_MIN_ARROWS,
} from '../sessionInsights.js';
import { arrowRadius, isMultiSpot, keypadValues, spotCentres, zoneOf } from '../scoring.js';
import { sumArrows } from '../stats.js';
import { rescoreEnd, endTarget } from '../sessionLogic.js';
import { ROUND_NAMES } from '../rounds.js';
import { faceRings } from './face.js';
import { hrChart, endTimeline } from '../hrTrace.js';
import { showWatchEnd, shotCycleChart, phaseKeys } from './watchEnd.js';
import { whenCard, gearCard } from './common.js';
import { handOf, eyeToPinOf, shaftMmOf } from '../gearFields.js';
import { lineChart } from './charts.js';
import { downloadReport, printReport, exportForAI } from './sessionExport.js';

// ---------------------------------------------------------------- state of the page (ui `ov`)

/** What the page has open for this session: review editing, a sheet, the group filter, all ends. */
function overviewState(ctx, ss) {
  const cur = ctx.ui.get().ov;
  const ov = cur?.id === ss.id ? cur : { id: ss.id };
  return {
    ov,
    set: (patch) => ctx.ui.set({ ov: { ...ov, ...patch } }),
    quiet: (patch) => ctx.ui.quietSet({ ov: Object.assign(ov, patch) }),
  };
}

// ---------------------------------------------------------------- small parts

const p2 = (n) => String(n).padStart(2, '0');
/** "18:20–19:32" from a start time and a duration; just the start without a duration. */
function timeSpan(time, minutes) {
  if (!time) return '';
  if (minutes == null) return time;
  const [hh, mm] = time.split(':').map(Number);
  const end = (hh * 60 + mm + minutes) % (24 * 60);
  return `${time}–${p2(Math.floor(end / 60))}:${p2(end % 60)}`;
}

/** "Sun 15 Nov · 18:20–19:32 · Indoor" */
function whenLine(ss, setupName) {
  return [formatDate(ss.date, { weekday: 'short', day: 'numeric', month: 'short' }), timeSpan(ss.time, ss.minutes), setupName]
    .filter(Boolean)
    .join(' · ');
}

/** A card section of the overview: an UPPERCASE heading, an optional accessory, the content. */
function ovCard(id, label, children, { accessory = null, cls = null } = {}) {
  return h(
    'section',
    { class: ['ov-card', cls], 'aria-labelledby': `ov-${id}` },
    h('div', { class: 'ov-card-head' }, h('h2', { class: 'apl-label', id: `ov-${id}` }, label), accessory),
    children,
  );
}

/** The small Edit / Done button of a section. */
const editButton = (label, onClick, fk, pressed = null) =>
  h(
    'button',
    { type: 'button', class: 'ov-edit', onClick, dataset: { fk }, 'aria-pressed': pressed == null ? null : String(pressed) },
    icons.pencil(),
    label,
  );

// ---------------------------------------------------------------- B1 score summary

function summaryCard(ctx, ss, st) {
  const counts = scoreCounts(ss.ends);
  const delta = averageDelta(ss, ctx.finished.list());
  const tile = (n, label) =>
    h('span', { class: 'ov-count' }, h('span', { class: 'ov-count-n' }, String(n)), h('span', { class: 'ov-count-l' }, label));
  const facts = [
    `${distanceLabel(ss)} · ${faceLabel(ss.face)}`,
    ss.minutes != null ? formatDuration(ss.minutes) : null,
    `${st.ld} ${st.ld === 1 ? 'let-down' : 'let-downs'} (${st.cld} correct)`,
  ].filter(Boolean);
  return h(
    'section',
    { class: 'ov-card ov-summary', 'aria-label': 'Score summary' },
    h(
      'div',
      { class: 'ov-summary-top' },
      h(
        'div',
        { class: 'ov-stack' },
        h('span', { class: 'apl-cap13' }, `Total · ${st.arrows} ${st.arrows === 1 ? 'arrow' : 'arrows'}`),
        h('span', { class: 'ov-total' }, String(st.total)),
      ),
      h(
        'div',
        { class: 'ov-stack ov-stack--end' },
        h('span', { class: 'apl-cap13' }, 'Per arrow'),
        h('span', { class: 'ov-avg' }, fmt(st.avgArrow, 2)),
        delta
          ? h(
              'span',
              { class: ['ov-delta', delta.delta < 0 && 'is-down'] },
              `${delta.delta >= 0 ? '+' : '−'}${Math.abs(delta.delta).toFixed(2)} vs your ${distanceLabel(ss)} average`,
            )
          : null,
      ),
    ),
    h('div', { class: 'ov-counts' }, tile(counts.x, 'X'), tile(counts.ten, '10'), tile(counts.nine, '9'), tile(counts.low, '8 and less')),
    h('div', { class: 'ov-facts' }, facts.map((f) => h('span', null, f))),
  );
}

// ---------------------------------------------------------------- B2 process grades

const ORD = ['ones', 'twos', 'threes', 'fours', 'fives'];

function gradeBlock(label, short, dist) {
  const { counts, n, avg } = dist;
  const worse = counts[2] + counts[3] + counts[4];
  return h(
    'div',
    { class: 'ov-grade' },
    h('span', { class: 'ov-grade-head' }, h('span', { class: 'ov-grade-label' }, label), h('span', { class: 'ov-grade-avg' }, fmt(avg))),
    n
      ? h(
          'div',
          {
            class: 'ov-dist',
            role: 'img',
            'aria-label': `${short} grades: ${counts.map((c, i) => `${c} ${ORD[i]}`).join(', ')}`,
          },
          counts.map((c, i) => (c ? h('span', { class: `ov-dist-seg g${i + 1}`, style: { flexGrow: String(c) } }) : null)),
        )
      : h('div', { class: 'ov-dist ov-dist--empty', 'aria-hidden': 'true' }),
    h('span', { class: 'apl-cap' }, n ? `${counts[0]} × ${short}1 · ${worse} × ${short}3+` : 'Not graded'),
  );
}

function gradesCard(ss) {
  const insight = gradeInsight(ss.ends);
  return ovCard('grades', 'Process grades', [
    h(
      'div',
      { class: 'ov-grades' },
      gradeBlock('Mental (M)', 'M', gradeDistribution(ss.ends, 'm')),
      gradeBlock('Cycle (S)', 'S', gradeDistribution(ss.ends, 's')),
    ),
    insight
      ? h(
          'p',
          { class: 'ov-insight' },
          'Arrows with a full program (',
          h('strong', null, 'M1'),
          ') scored ',
          h('strong', null, fmt(insight.m1.avg)),
          '; with M3 or worse ',
          h('strong', null, fmt(insight.m3.avg)),
          '.',
        )
      : null,
  ]);
}

// ---------------------------------------------------------------- B3 performance review

const PROMPTS = [
  { key: 'good', label: () => T.reviewGood, ph: () => T.reviewGoodPh, tone: 'good' },
  { key: 'workOn', label: () => T.reviewWorkOn, ph: () => T.reviewWorkOnPh, tone: 'work' },
  { key: 'how', label: () => T.reviewHow, ph: () => T.reviewHowPh, tone: 'how' },
];

/**
 * `word` put into `text` at the cursor (start…end replaced), with a space before it when it would
 * stick to the previous word and after it when it would stick to the next. Returns the new text and
 * the cursor after the word.
 */
export function insertAtCursor(text, start, end, word) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^[\s,.;:!?]/.test(after) ? ' ' : '';
  const head = `${before}${lead}${word}`;
  return { text: `${head}${trail}${after}`, cursor: head.length };
}

/** One prompt being written: the textarea and its cue chips (each inserts its word at the cursor). */
function promptEditor(ctx, ss, p) {
  const field = APL.TextArea({
    label: p.label(),
    rows: 4,
    placeholder: p.ph(),
    value: ss.review?.[p.key] || '',
    fk: `review-${p.key}`,
    onInput: (e) => ctx.finished.setReview(ss.id, p.key, e.target.value),
  });
  const ta = field.querySelector('textarea');
  // where the cursor was last (a tap on a chip takes the focus away; an untouched field: the end)
  let caret = null;
  const remember = () => (caret = [ta.selectionStart, ta.selectionEnd]);
  for (const ev of ['keyup', 'click', 'select', 'input']) ta.addEventListener(ev, remember);
  const cue = (word) => () => {
    const [s, e] = caret || [ta.value.length, ta.value.length];
    const next = insertAtCursor(ta.value, s, e, word);
    ta.value = next.text;
    ta.focus();
    ta.setSelectionRange(next.cursor, next.cursor);
    remember();
    ctx.finished.setReview(ss.id, p.key, next.text);
  };
  return h(
    'div',
    { class: `ov-prompt ov-prompt--${p.tone}` },
    field,
    h(
      'div',
      { class: 'ov-cues', role: 'group', 'aria-label': `Quick words for ${p.label().toLowerCase()}` },
      T.reviewCues[p.key].map((w) =>
        h('button', { type: 'button', class: 'ov-cue', 'aria-label': `Insert "${w}"`, onClick: cue(w), dataset: { fk: `cue-${p.key}-${w}` } }, `+ ${w}`),
      ),
    ),
  );
}

/** One prompt as read: its colour dot and label, then the text (or "Not written yet"). */
function promptRead(ss, p) {
  const text = (ss.review?.[p.key] || '').trim();
  return h(
    'div',
    { class: `ov-prompt ov-prompt--${p.tone}` },
    h('h3', { class: 'ov-prompt-label' }, h('span', { class: 'ov-dot', 'aria-hidden': 'true' }), p.label()),
    h('p', { class: ['ov-prompt-text', !text && 'is-empty'] }, text || T.notWrittenYet),
  );
}

/**
 * The performance review (good / work on / how), saved as it is typed (finished.setReview).
 * `editing`: the textareas with cue chips, else the read view. `onToggle`: the section's Edit / Done
 * (none while the page itself is the writing step).
 */
export function reviewSection(ctx, ss, { editing, onToggle = null }) {
  if (!ss.review) ss = { ...ss, review: emptyReview() };
  return ovCard(
    'review',
    T.review,
    PROMPTS.map((p) => (editing ? promptEditor(ctx, ss, p) : promptRead(ss, p))),
    {
      cls: editing && 'is-editing',
      accessory: onToggle ? editButton(editing ? 'Done' : 'Edit', onToggle, 'review-edit', editing) : null,
    },
  );
}

// ---------------------------------------------------------------- B4 the group

const GROUP_BOX = 110; // viewBox half-size: the spot (radius 100) and arrows just off its edge

/**
 * All placed arrows of the session on one large face (the spots of a multi-spot sheet merged), the
 * group centre in magenta, and filter chips: arrows outside the filter fade, and the centre and the
 * reading follow the arrows shown. `filters: false`: no chips, all arrows (the running scoring screen).
 * `sight`: { eyeToPinCm } of the session's bow setup, to say how far to move the sight (the arrows
 * shown, wild ones left out of it but drawn like the others); without it, no sight line. Each arrow is drawn as its
 * hole, at its real size: `shaftMm` is the arrows' diameter (the session's setup; SHAFT_MM without).
 * On a multi-spot sheet a second row of chips picks one spot (`spot`, 0-based; null: all): the
 * arrows shot at the other spots fade, as with the filter, and the centre follows.
 */
export function groupSection(ss, { filter = 'all', onFilter = null, filters = true, sight = null, shaftMm, spot = null, onSpot = null }) {
  const { arrows, total } = groupArrows(ss.ends);
  if (!arrows.length) return null;
  const spots = filters ? groupSpots(arrows, ss.face) : [];
  // a spot picked earlier that this session has no arrows on (or a single face) counts as all
  if (!spots.includes(spot)) spot = null;
  const inView = (p) => matchesFilter(p, filter) && matchesSpot(p, spot);
  const shown = arrows.filter(inView);
  const corr = sight ? sightCorrection(shown, { face: ss.face, distance: distanceMetres(ss), eyeToPinCm: sight.eyeToPinCm, hand: sight.hand }) : null;
  // with the sight move, wild arrows are left out of the centres too: the cross is what the sight aims at
  const wild = new Set(sight ? [...wildArrows(shown)].map((i) => shown[i]) : []);
  const wildAll = new Set(sight ? [...wildArrows(arrows)].map((i) => arrows[i]) : []);
  const kept = shown.filter((p) => !wild.has(p));
  const all = groupCentre(arrows.filter((p) => !wildAll.has(p)));
  const centre = groupCentre(kept);
  const reading = centreReading(centre, all, filter, kept.length, undefined, spot);
  const u = (n) => n * 100;
  const svg = s(
    'svg',
    {
      viewBox: `${-GROUP_BOX} ${-GROUP_BOX} ${GROUP_BOX * 2} ${GROUP_BOX * 2}`,
      role: 'img',
      'aria-label': `All ${arrows.length} placed arrows on one ${isMultiSpot(ss.face) ? 'spot' : 'face'}; ${shown.length} shown${
        centre ? `; group centre ${centreDirection(centre)}` : ''
      }`,
    },
    faceRings(ss.face),
    arrows.map((p) =>
      s('circle', {
        // wild arrows are drawn like the others: they are only left out of the centre and the sight move
        class: 'ov-arrow',
        cx: u(p.x),
        cy: u(p.y),
        r: arrowRadius(ss.face, shaftMm) * 100,
        opacity: inView(p) ? 1 : 0.12,
      }),
    ),
    centre
      ? s(
          'g',
          { class: 'ov-centre', transform: `translate(${u(centre.x)} ${u(centre.y)})` },
          s('circle', { r: 7, fill: 'none', 'stroke-width': 2.4 }),
          s('path', { d: 'M-12 0h24M0 -12v24', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
        )
      : null,
  );
  const unplaced = total - arrows.length;
  return ovCard(
    'group',
    'Group',
    [
      // the running scoring screen shows all arrows, without the filter chips
      !filters ? null : h(
        'div',
        { class: 'ov-filters', role: 'group', 'aria-label': 'Show arrows' },
        GROUP_FILTERS.map((f) =>
          h(
            'button',
            {
              type: 'button',
              class: 'ov-filter',
              'aria-pressed': String(f === filter),
              onClick: () => f !== filter && onFilter(f),
              dataset: { fk: `group-${f}` },
            },
            f === 'all' ? `All ${arrows.length}` : FILTER_LABELS[f],
          ),
        ),
      ),
      spots.length < 2 ? null : h(
        'div',
        { class: 'ov-filters', role: 'group', 'aria-label': 'Show spot' },
        [null, ...spots].map((k) =>
          h(
            'button',
            {
              type: 'button',
              class: 'ov-filter',
              'aria-pressed': String(k === spot),
              'aria-label': k == null ? 'All spots' : `Spot ${k + 1}, ${spotPlace(ss.face, k)}`,
              onClick: () => k !== spot && onSpot(k),
              dataset: { fk: `group-spot-${k == null ? 'all' : k + 1}` },
            },
            k == null ? 'All spots' : `Spot ${k + 1}`,
          ),
        ),
      ),
      h('div', { class: 'ov-face' }, svg),
      h(
        'div',
        { class: 'ov-legend', 'aria-hidden': 'true' },
        h('span', null, h('span', { class: 'ov-legend-arrow' }), 'arrow'),
        h('span', null, h('span', { class: 'ov-legend-centre' }), 'group centre'),
        isMultiSpot(ss.face) ? h('span', null, 'spots of the sheet merged') : null,
        unplaced ? h('span', null, `${unplaced} not placed`) : null,
      ),
      h('p', { class: 'ov-reading', 'aria-live': 'polite' }, reading),
      sight ? sightLine(ss, corr, sight) : null,
    ],
    { accessory: h('span', { class: 'apl-cap' }, `${shown.length} of ${arrows.length} arrows`) },
  );
}

/** Where spot `k` is on the sheet: "top", "middle", "bottom left"… */
function spotPlace(face, k) {
  const [x, y] = spotCentres(face)[k] || [0, 0];
  return [y < 0 ? 'top' : y > 0 ? 'bottom' : 'middle', x < 0 ? 'left' : x > 0 ? 'right' : ''].filter(Boolean).join(' ');
}

/**
 * Under the group: how far to move the sight, from the arrows shown (wild ones left out), or what is
 * still missing for it (the eye-to-pin length in Gear, enough arrows).
 */
/**
 * The Sight move box. `sight`: { eyeToPinCm, hand ('right' / 'left', from the bow setup: Gear › Bow ›
 * Hand), onReset (Sight moved: start again, on the scoring screen), since (the end the sight was
 * moved in, 1-based) }.
 */
function sightLine(ss, corr, { eyeToPinCm, hand = 'right', onReset = null, since = null }) {
  if (!(ss.distance > 0)) return null;
  const reset = onReset
    ? h('div', { class: 'ov-sight-reset' }, APL.Button({ children: 'Sight moved: start again', variant: 'secondary', onClick: onReset, fk: 'sight-reset' }))
    : null;
  const box = (main, note) =>
    h(
      'div',
      { class: 'ov-sight', 'aria-live': 'polite' },
      h('span', { class: 'apl-label' }, 'Sight move'),
      main,
      note ? h('span', { class: 'apl-cap' }, note) : null,
      since ? h('span', { class: 'apl-cap' }, `Counting the arrows shot since the sight was moved (during end ${since}).`) : null,
      reset,
    );
  if (!corr) return box(h('p', { class: 'ov-sight-hint' }, 'Add “Eye to sight pin” to the bow setup in Gear to see how far to move the sight.'));
  if (!corr.enough) return box(h('p', { class: 'ov-sight-hint' }, `Needs ${SIGHT_MIN_ARROWS} placed arrows (${corr.n} so far, wild ones left out).`));
  const left = corr.wild.size ? `, ${corr.wild.size} wild left out` : '';
  return box(
    h('strong', { class: 'ov-sight-move' }, sightMoveText(corr)),
    `From ${corr.n} arrows${left} · ${distanceLabel(ss)} · pin ${Number(eyeToPinCm)} cm from the eye · ${hand === 'left' ? 'left' : 'right'}-handed (Gear › Bow). Move the sight toward the group (in: the aperture towards the riser).`,
  );
}

// ---------------------------------------------------------------- B4b the average per end

/**
 * How the per-arrow average went over the session: one point per end (x: end number, y: the end's
 * average), the session's average as a dashed reference line. A tap on a point opens that end.
 * Nothing for a session of fewer than two scored ends.
 */
export function endAverageSection(ss, { onEdit = null } = {}) {
  const rows = endAverages(ss.ends);
  const vals = rows.map((r) => r.avg).filter((v) => v != null);
  if (vals.length < 2) return null;
  const st = computeStats(ss.ends, ss.face);
  const yMin = Math.max(0, Math.floor(Math.min(...vals, st.avgArrow)) - 1);
  const yTicks = [];
  for (let v = yMin; v <= 10; v += yMin >= 6 ? 1 : 2) yTicks.push(v);
  const points = rows.map((r) => ({
    label: String(r.end),
    sub: r.n ? `${r.total} from ${r.n} ${r.n === 1 ? 'arrow' : 'arrows'}` : 'no scored arrows',
    index: r.end - 1,
    values: { avg: r.avg, session: st.avgArrow },
  }));
  return ovCard(
    'end-avg',
    'Average per end',
    [
      lineChart({
        points,
        series: [
          { key: 'avg', label: 'Per arrow', color: 'var(--series-1)', format: (v) => v.toFixed(2) },
          { key: 'session', label: 'Session', color: 'var(--muted)', format: (v) => v.toFixed(2), dashed: true, dots: false },
        ],
        yDomain: [yMin, 10],
        yTicks,
        height: 180,
        tipTitle: (p) => `End ${p.label}${p.sub ? ` · ${p.sub}` : ''}`,
        ariaLabel: `Average per arrow in each end: ${rows.map((r) => `end ${r.end} ${r.avg == null ? 'none' : r.avg.toFixed(2)}`).join(', ')}`,
        onPick: onEdit ? (p) => onEdit(p.index) : null,
      }),
    ],
    { accessory: h('span', { class: 'apl-cap' }, `dashed: session ${fmt(st.avgArrow, 2)}`) },
  );
}

// ---------------------------------------------------------------- B5 ends, B6 the Edit end sheet

const gradesText = (a) => [a.m != null && `M${a.m}`, a.s != null && `S${a.s}`].filter(Boolean).join(' ');
// the heart rate at the shot, when the arrow was graded on the watch
const hrText = (a) => (a.hr != null ? `♥${a.hr}` : '');
const chip = (v, cls = '') =>
  h('span', { class: `score-chip z-${zoneOf(v)} ${cls}`, 'aria-hidden': 'true' }, v == null ? '–' : String(v));

/**
 * The heart rate while the end was shot (from the watch): the curve, a tick at each shot (red for a
 * low mental grade) and the range. Nothing for an end without a trace.
 */
function hrSparkline(end) {
  const c = hrChart(end.hrTrace, end.arrows, { w: 200, h: 36 });
  if (!c) return null;
  const mins = Math.floor(c.seconds / 60);
  const secs = String(c.seconds % 60).padStart(2, '0');
  return h(
    'span',
    { class: 'ov-end-trace', 'aria-label': `Heart rate while shooting: ${c.min} to ${c.max}, over ${mins}:${secs}` },
    s(
      'svg',
      { class: 'ov-end-trace-chart', viewBox: '0 0 200 36', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      s('polyline', { class: 'ov-end-trace-line', points: c.points }),
      // a short upright tick at each shot (stays crisp while the chart stretches to the row)
      ...c.shots.map((p) => s('line', { class: ['ov-end-trace-shot', p.m != null && p.m <= 2 && 'is-low'], x1: p.x, x2: p.x, y1: p.y - 4, y2: p.y + 4 })),
    ),
    h('span', { class: 'ov-end-trace-range', 'aria-hidden': 'true' }, `♥ ${c.min}–${c.max} · ${mins}:${secs}`),
  );
}

/**
 * Under an end's row, when the watch recorded it: its heart-rate curve (or just "Watch timeline"
 * without a heart rate) and, below it, one bar per shot (set-up, draw, hold) on a seconds axis
 * shared by the whole session, so shots compare across ends; a tap opens the end's timeline.
 */
function watchRow(end, i, span) {
  const tl = endTimeline(end);
  if (!tl) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'ov-end-watch',
      'aria-haspopup': 'dialog',
      'aria-label': `End ${i + 1}: watch timeline`,
      onClick: () => showWatchEnd(end, { title: `End ${i + 1} · from the watch` }),
      dataset: { fk: `end-watch-${i}` },
    },
    hrSparkline(end) ?? h('span', { class: 'ov-end-watch-text' }, '⏱ Watch timeline'),
    shotCycleChart(tl, { max: span, legend: false }),
  );
}

/**
 * A blank bale's ends from the watch (no scores: one row each, its heart rate and shot bars on the
 * session's shared seconds axis, a tap opens its timeline), with how many arrows they hold. Null
 * when the watch brought none.
 */
export function watchEndsSection(ends, { id = 'bb-watch' } = {}) {
  if (!ends?.length) return null;
  const cycles = ends.flatMap((e) => (e.watchShots ?? []).map((d) => d.setup + d.draw + d.hold));
  const span = cycles.length ? Math.max(...cycles) : null;
  const shots = ends.reduce((t, e) => t + Math.max(e.arrows?.length ?? 0, e.watchShots?.length ?? 0), 0);
  return h(
    'section',
    { class: 'ov-card ov-list', 'aria-labelledby': id },
    h(
      'div',
      { class: 'ov-card-head ov-list-head' },
      h('h2', { class: 'apl-label', id }, 'From the watch'),
      h('span', { class: 'apl-cap' }, `${ends.length} ${ends.length === 1 ? 'end' : 'ends'} · ${shots} ${shots === 1 ? 'arrow' : 'arrows'}`),
    ),
    cycles.length
      ? h('div', { class: 'wt-legend ov-ends-legend', 'aria-hidden': 'true' }, ...phaseKeys(ends.some((e) => (e.watchShots ?? []).some((d) => d.settle != null))))
      : null,
    ends.map((e, i) => [h('p', { class: 'apl-cap ov-end-pass' }, `End ${i + 1}`), watchRow(e, i, span)]),
  );
}

/** One row per end, every end: its score chips with the grades under each, and its total. Tap = Edit end. */
/**
 * A round's session: the distance and face over the first end shot at them (the 1440's 90 m, then
 * 70 m…, a field course's every target), so the list reads like the scorecard. Null otherwise.
 */
function passCaption(ss, i) {
  const t = endTarget(ss, ss.ends[i]);
  if (!t) return null;
  const key = (x) => x && `${x.distance} ${x.distanceUnit} ${x.face}`;
  if (i > 0 && !ss.round.course && key(endTarget(ss, ss.ends[i - 1])) === key(t)) return null;
  const where = ss.round.course ? `Target ${(ss.ends[i].target ?? 0) + 1} · ` : '';
  return h('p', { class: 'apl-cap ov-end-pass' }, `${where}${distanceLabel(t)} · ${faceLabel(t.face)}`);
}

export function endsSection(ss, { onEdit }) {
  const ends = ss.ends;
  // the longest shot cycle (set-up + draw + hold) of the session: one seconds axis for all ends
  const cycles = ss.ends.flatMap((e) => (e.watchShots ?? []).map((d) => d.setup + d.draw + d.hold));
  const span = cycles.length ? Math.max(...cycles) : null;
  const anyCycles = cycles.length > 0;
  const said = (a) => (a.v == null ? 'empty' : [a.v, gradesText(a), a.hr != null && `heart rate ${a.hr}`].filter(Boolean).join(' '));
  return h(
    'section',
    { class: 'ov-card ov-list', 'aria-labelledby': 'ov-ends' },
    h(
      'div',
      { class: 'ov-card-head ov-list-head' },
      h('h2', { class: 'apl-label', id: 'ov-ends' }, T.ends),
      h('span', { class: 'apl-cap' }, 'Tap an end to edit'),
    ),
    anyCycles
      ? h(
          'div',
          { class: 'wt-legend ov-ends-legend', 'aria-hidden': 'true' },
          ...phaseKeys(ss.ends.some((e) => (e.watchShots ?? []).some((d) => d.settle != null))),
        )
      : null,
    ends.map((e, i) => [
      passCaption(ss, i),
      h(
        'button',
        {
          type: 'button',
          class: 'ov-end',
          'aria-haspopup': 'dialog',
          'aria-label': `End ${i + 1}: ${e.arrows.map(said).join(', ')}. Total ${sumArrows(e.arrows)}. Edit`,
          onClick: () => onEdit(i),
          dataset: { fk: `end-${i}` },
        },
        h('span', { class: 'ov-end-no' }, String(i + 1)),
        h(
          'span',
          { class: 'ov-end-arrows' },
          e.arrows.map((a) => h('span', { class: 'ov-end-arrow' }, chip(a.v), h('span', { class: 'ov-end-grades' }, gradesText(a) || ' '), hrText(a) ? h('span', { class: 'ov-end-grades ov-end-hr' }, hrText(a)) : null)),
        ),
        h('span', { class: 'ov-end-sum' }, String(sumArrows(e.arrows))),
        h('span', { class: 'ov-row-go', 'aria-hidden': 'true' }, icons.chevron()),
      ),
      watchRow(e, i, span),
    ]),
  );
}

/** The keys of a face in rows of at most 7 (a full face's 12 keys as two rows of 6): every key ≥44px. */
function keyRows(face) {
  const keys = keypadValues(face);
  const per = keys.length > 7 ? Math.ceil(keys.length / 2) : keys.length;
  return Array.from({ length: Math.ceil(keys.length / per) }, (_, r) => keys.slice(r * per, r * per + per));
}

/**
 * The Edit end sheet: the end's arrows as tiles (pick one, then change its score with the keypad and
 * its grades with the M / S rows), the let-downs, Delete end, Cancel / Save end. The draft lives in
 * the page state until Save; a position that no longer matches its new score is dropped on Save.
 */
function endSheet(ctx, ss, { ov, set }) {
  const index = ov.end;
  const saved = ss.ends[index];
  if (!saved) return null;
  // a round's end was shot at its own target's face
  const face = endTarget(ss, saved)?.face ?? ss.face;
  const draft = ov.endDraft || structuredClone(saved);
  const sel = Math.min(ov.endSel ?? 0, draft.arrows.length - 1);
  const cur = draft.arrows[sel];
  const close = () => set({ sheet: null, end: null, endDraft: null, endSel: null });
  const update = (fn) => {
    const next = structuredClone(draft);
    fn(next);
    set({ endDraft: next });
  };
  const setScore = (v) =>
    update((d) => {
      d.arrows[sel].v = v;
    });
  const setGrade = (kind, g) =>
    update((d) => {
      d.arrows[sel][kind] = d.arrows[sel][kind] === g ? null : g;
    });
  // correct let-downs never exceed let-downs (as on the scoring screen)
  const bump = (key, delta) =>
    update((d) => {
      d[key] = Math.max(0, (d[key] || 0) + delta);
      if (key === 'ld' && d.cld > d.ld) d.cld = d.ld;
      if (key === 'cld' && d.cld > d.ld) d.ld = d.cld;
    });

  const save = () => {
    const { end, dropped } = rescoreEnd(saved, draft, face, shaftMmOf(ss, ctx.repo.list('setups')));
    if (ctx.finished.setEnd(ss.id, index, end).status === 'failed') return;
    close();
    const n = dropped.length;
    ctx.toast(
      n
        ? `End saved. ${n === 1 ? `Arrow ${dropped[0]} is` : `Arrows ${dropped.join(', ')} are`} off the group plot: the new score is in another ring.`
        : 'End saved.',
    );
  };
  const del = async () => {
    if ((await ctx.finished.deleteEnd(ss.id, index)).status !== 'deleted') return;
    close();
    ctx.toast(`End ${index + 1} deleted.`);
  };

  const stepper = (key, label) =>
    h(
      'div',
      { class: 'ov-ld' },
      h('span', { class: 'ov-ld-label' }, label),
      APL.Stepper({
        label: label.toLowerCase(),
        value: draft[key] || 0,
        min: 0,
        onChange: (v) => bump(key, v - (draft[key] || 0)),
        fk: `end-${key}`,
      }),
    );

  return {
    onClose: close,
    returnFk: `end-${index}`,
    node: APL.Dialog({
      sheet: true,
      title: `End ${index + 1} · ${sumArrows(draft.arrows)}`,
      idPrefix: 'ov-end',
      onClose: close,
      closeLabel: 'Cancel and close',
      children: h(
        'div',
        { class: 'ov-sheet ov-endsheet' },
        h('p', { class: 'apl-cap13 ov-endsheet-hint' }, 'Tap an arrow, then change its score or grades'),
        h(
          'div',
          { class: 'ov-tiles', role: 'group', 'aria-label': 'Arrows', style: { '--cols': String(Math.min(draft.arrows.length, 3)) } },
          draft.arrows.map((a, i) =>
            h(
              'button',
              {
                type: 'button',
                class: 'ov-tile',
                'aria-pressed': String(i === sel),
                'aria-label': `Arrow ${i + 1}: ${a.v ?? 'empty'}${a.m ? `, M${a.m}` : ''}${a.s ? `, S${a.s}` : ''}`,
                onClick: () => set({ endSel: i, endDraft: draft }),
                dataset: { fk: `tile-${i}` },
              },
              chip(a.v, 'ov-tile-chip'),
              isGraded(ss)
                ? h('span', { class: 'ov-tile-grades', 'aria-hidden': 'true' }, h('span', null, `M${a.m ?? '–'}`), h('span', null, `S${a.s ?? '–'}`))
                : null,
            ),
          ),
        ),
        keyRows(face).map((row, r) =>
          APL.ScoreKeypad({
            label: r ? `Score of arrow ${sel + 1}, lower rings` : `Score of arrow ${sel + 1}`,
            keys: row.map((k) => ({ value: k, zone: zoneOf(k, face), ariaLabel: `Score ${k === 'M' ? 'miss' : k}` })),
            value: cur.v,
            onKey: setScore,
            fk: `endkey${r}`,
          }),
        ),
        ...(isGraded(ss)
          ? [
            APL.GradeKeys({
              label: `Mental program for arrow ${sel + 1}`,
              rowLabel: 'M',
              value: cur.m,
              keyLabel: (g) => `Mental grade ${g}`,
              onChange: (g) => setGrade('m', g),
              fk: 'end-grade-m',
            }),
            APL.GradeKeys({
              label: `Shooting cycle for arrow ${sel + 1}`,
              rowLabel: 'S',
              value: cur.s,
              keyLabel: (g) => `Shooting-cycle grade ${g}`,
              onChange: (g) => setGrade('s', g),
              fk: 'end-grade-s',
            }),
            ]
          : []),
        h('div', { class: 'ov-lds' }, stepper('ld', T.letDowns), stepper('cld', 'Correct')),
        ss.ends.length > 1
          ? h('button', { type: 'button', class: 'btn btn-text danger ov-delete-end', onClick: del, dataset: { fk: 'end-delete' } }, 'Delete end')
          : h('p', { class: 'apl-cap ov-delete-end' }, 'The only end of a session cannot be deleted.'),
        h(
          'div',
          { class: 'ov-actions ov-actions--even' },
          APL.Button({ children: 'Cancel', variant: 'secondary', onClick: close, fk: 'end-cancel' }),
          APL.Button({ children: 'Save end', onClick: save, fk: 'end-save' }),
        ),
      ),
    }),
  };
}

// ---------------------------------------------------------------- B7 details and their sheets

/** Competition details as chips and fields, saved as they change (placement too). */
function competitionEditor(ctx, ss, { ov, set }) {
  const comp = ss.competition || {};
  const save = (key, value, rerender = true) => {
    if (ctx.finished.setCompetition(ss.id, key, value).status === 'saved' && rerender) ctx.rerender();
  };
  const round = comp.round || '';
  const other = !!ov.otherRound || (!!round && !ROUND_NAMES.includes(round));
  const { chips, rest } = parseConditions(comp.conditions);
  const text = (key, label, placeholder, value = comp[key] || '') =>
    APL.TextField({ label, placeholder, value, fk: `comp-${key}`, onInput: (e) => save(key, e.target.value, false) });
  return [
    text('event', 'Event', 'Event name'),
    h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Round'),
    // a session shot to a round followed it end by end: its round stays
    ss.round ? h('p', { class: 'apl-cap', dataset: { fk: 'comp-round-fixed' } }, `${ss.round.name} · set when the session started`) : null,
    ss.round ? null : APL.OptionPills({
      label: 'Round',
      value: other ? 'Other' : round,
      options: [...ROUND_NAMES, 'Other'].map((r) => ({ value: r, label: r })),
      // tapping the chosen round again clears it; Other opens a field for the round's name
      onChange: (r) => {
        if (r === 'Other') {
          if (!other) save('round', '', false);
          set({ otherRound: !other });
        } else {
          save('round', r === round ? '' : r, false);
          set({ otherRound: false });
        }
      },
      fk: 'comp-round',
    }),
    other && !ss.round ? text('round', 'Other round', 'e.g. Indoor 2 × 30') : null,
    h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Conditions'),
    APL.OptionPills({
      label: 'Conditions',
      multiple: true,
      value: chips,
      options: CONDITIONS.map((c) => ({ value: c, label: c })),
      onChange: (c) => save('conditions', toggleCondition(comp.conditions, c)),
      fk: 'comp-cond',
    }),
    APL.TextField({
      label: 'Other conditions',
      value: rest,
      fk: 'comp-cond-text',
      onInput: (e) => save('conditions', joinConditions(chips, e.target.value), false),
    }),
    text('placement', 'Placement', 'e.g. 3rd of 24'),
  ];
}

/** The details of a session in History: rows that open their editor (a sheet), or just show. */
function detailsCard(ctx, ss, st, setupName, set, { gear = true } = {}) {
  const row = (k, v, sheet) =>
    sheet
      ? h(
          'button',
          { type: 'button', class: 'ov-row', onClick: () => set({ sheet }), 'aria-haspopup': 'dialog', dataset: { fk: `detail-${sheet}-${k}` } },
          h('span', { class: 'ov-row-k' }, k),
          h('span', { class: 'ov-row-v' }, v || '—'),
          h('span', { class: 'ov-row-go', 'aria-hidden': 'true' }, icons.chevron()),
        )
      : h('div', { class: 'ov-row' }, h('span', { class: 'ov-row-k' }, k), h('span', { class: 'ov-row-v' }, v), h('span', { class: 'ov-row-go' }));
  const comp = ss.competition || {};
  const isComp = sessionType(ss) === 'competition';
  return h(
    'section',
    { class: 'ov-card ov-list', 'aria-labelledby': 'ov-details' },
    h('div', { class: 'ov-card-head ov-list-head' }, h('h2', { class: 'apl-label', id: 'ov-details' }, 'Details')),
    row('Type', TYPE_LABELS[sessionType(ss)]),
    row('Date & time', [formatDate(ss.date, { day: 'numeric', month: 'short' }), ss.time].filter(Boolean).join(' · '), 'when'),
    // a form session types its duration in its own card
    st ? row('Duration', ss.minutes != null ? formatDuration(ss.minutes) : null, 'when') : null,
    // a form session (st null) has no face, arrows or let-downs; SPT, gym and mental no equipment
    st ? row('Distance & face', `${distanceLabel(ss)} · ${faceLabel(ss.face)}`) : null,
    gear ? row('Equipment', setupName || (ss.gear ? 'As recorded' : 'None'), 'gear') : null,
    st ? row('Let-downs', `${st.ld} · ${st.cld} correct`) : null,
    isComp ? row('Event', comp.event, 'comp') : null,
    isComp ? row('Round', comp.round, 'comp') : null,
    isComp ? row('Conditions', comp.conditions, 'comp') : null,
    isComp ? row('Placement', comp.placement, 'comp') : null,
  );
}

/**
 * The top of a session's page: back to the log, the title over the date / time / setup line, and
 * ⋯ (Session options). Right after Finish: no back and no menu.
 */
function overviewHeader(ctx, ss, { title, setupName, finished = false, set }) {
  return h(
    'header',
    { class: 'apl apl-header ov-header' },
    finished
      ? null
      : APL.IconButton({ icon: 'back', label: T.backToLog, onClick: () => ctx.navigate('history'), fk: 'screen-back' }),
    h(
      'div',
      { class: ['ov-title', finished && 'ov-title--pad'] },
      h('h1', null, title),
      h('span', { class: 'apl-cap' }, whenLine(ss, setupName)),
    ),
    finished
      ? null
      : h(
          'button',
          {
            type: 'button',
            class: 'apl-iconbtn',
            'aria-label': 'Session options',
            'aria-haspopup': 'dialog',
            onClick: () => set({ sheet: 'menu' }),
            dataset: { fk: 'ov-more' },
          },
          icons.more(),
        ),
  );
}

/** The sheet open on the page, if any: the ⋯ menu or a detail's editor. */
function overlayFor(ctx, ss, { ov, set }) {
  const close = () => set({ sheet: null });
  const sheet = (title, children, returnFk) => ({
    onClose: close,
    returnFk,
    node: APL.Dialog({ sheet: true, title, idPrefix: 'ov-sheet', onClose: close, closeLabel: 'Close', children: h('div', { class: 'ov-sheet' }, children) }),
  });
  if (ov.sheet === 'end') return endSheet(ctx, ss, { ov, set });
  if (ov.sheet === 'menu') {
    const del = async () => {
      ctx.ui.quietSet({ ov: { ...ov, sheet: null } });
      ctx.rerender();
      const { status } = await ctx.finished.moveToDeleted(ss.id);
      if (status === 'deleted') ctx.toast('Moved to Recently deleted.');
      if (status === 'deleted' || status === 'none') ctx.navigate('history', { replace: true });
    };
    // a scored session exports its report; a form session (no ends) has none
    const scored = Array.isArray(ss.ends) && ss.ends.length > 0;
    const reportOpts = () => {
      const setups = ctx.repo.list('setups');
      const used = ss.gearSnapshotId ? ctx.repo.get('setups', ss.gearSnapshotId) : null;
      return { setupName: used?.name || null, shaftMm: shaftMmOf(ss, setups) };
    };
    const exportAs = (fn) => () => {
      const opts = reportOpts();
      close();
      fn(ss, opts);
    };
    const item = (icon, label, onClick, fk) =>
      h('button', { type: 'button', class: 'gear-menu-item', onClick, dataset: { fk } }, h('span', { class: 'gear-menu-icon' }, icon), label);
    return sheet(
      'Session options',
      h(
        'div',
        { class: 'gear-menu', role: 'group', 'aria-label': 'Session options' },
        scored ? item(icons.log(), 'Print or save as PDF', exportAs(printReport), 'menu-print') : null,
        scored ? item(icons.copy(), 'Export as HTML file', exportAs(downloadReport), 'menu-export-html') : null,
        item(icons.insights(), 'Export as JSON for AI', () => {
          close();
          exportForAI(ctx.repo, [ss]).catch((e) => ctx.toast(`Export failed: ${e.message}`));
        }, 'menu-export-json'),
        h(
          'button',
          { type: 'button', class: 'gear-menu-item danger', onClick: del, dataset: { fk: 'menu-delete' } },
          h('span', { class: 'gear-menu-icon' }, icons.trash()),
          T.deleteSession,
        ),
      ),
      'ov-more',
    );
  }
  const finishedGear = (choice) => {
    if (ctx.finished.setGear(ss.id, choice).status === 'saved') ctx.rerender();
  };
  if (ov.sheet === 'when') return sheet('Date, time and duration', whenCard(ctx, ss), 'detail-when-Date & time');
  if (ov.sheet === 'gear') return sheet('Equipment', gearCard(ctx, ss, finishedGear), 'detail-gear-Equipment');
  if (ov.sheet === 'comp') return sheet('Competition', competitionEditor(ctx, ss, { ov, set }), 'detail-comp-Event');
  return null;
}

// ---------------------------------------------------------------- the page

/**
 * The overview of a finished scored session. `mode`: 'finished' (right after Finish) or 'history'.
 * `sections`: drawn by the caller between the group and the details.
 */
/**
 * A form session's page (SPT, gym, mental, logged afterwards) on the scored page's template: the same
 * header and ⋯ menu, its own cards (`cards`, drawn as ov-cards), the review and Details.
 * `gear`: whether the session carries equipment (a row of Details).
 */
export function renderFormOverview(ctx, ss, { title, cards, gear = false }) {
  const state = overviewState(ctx, ss);
  const { ov, set } = state;
  const usedSetup = gear && ss.gearSnapshotId ? ctx.repo.get('setups', ss.gearSnapshotId) : null;
  const setupName = usedSetup?.name || null;
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      overviewHeader(ctx, ss, { title, setupName, set }),
      h(
        'div',
        { class: 'apl-screen-body ov-body' },
        ...cards,
        reviewSection(ctx, ss, { editing: !!ov.review, onToggle: () => set({ review: !ov.review }) }),
        detailsCard(ctx, ss, null, setupName, set, { gear }),
      ),
    ),
    overlay: overlayFor(ctx, ss, state),
  };
}

/** A card of a form session's page: its form sections inside the overview's card (`cls`: extra classes). */
export function formCard(children, cls = null) {
  return h('section', { class: ['ov-card ov-form-card', cls] }, children);
}

export function renderOverview(ctx, ss, { mode = 'history', sections = [] } = {}) {
  const finished = mode === 'finished';
  const state = overviewState(ctx, ss);
  const { ov, set } = state;
  const st = computeStats(ss.ends, ss.face);
  const label = TYPE_LABELS[sessionType(ss)];
  const usedSetup = ss.gearSnapshotId ? ctx.repo.get('setups', ss.gearSnapshotId) : null;
  const setupName = usedSetup?.name || null;
  const editingReview = finished || !!ov.review;

  const header = overviewHeader(ctx, ss, {
    title: finished ? `${label} finished` : `${label} · ${st.total}`,
    setupName,
    finished,
    set,
  });

  const body = h(
    'div',
    { class: 'apl-screen-body ov-body' },
    finished
      ? h(
          'div',
          { class: 'ov-saved', role: 'status' },
          icons.check(),
          h('span', null, h('strong', null, 'Session saved.'), ' Take two minutes for the review while it is fresh.'),
        )
      : null,
    summaryCard(ctx, ss, st),
    isGraded(ss) ? gradesCard(ss) : null,
    reviewSection(ctx, ss, { editing: editingReview, onToggle: finished ? null : () => set({ review: !ov.review }) }),
    groupSection(ss, {
      filter: ov.filter || 'all',
      onFilter: (f) => set({ filter: f }),
      spot: ov.spot ?? null,
      onSpot: (k) => set({ spot: k }),
      sight: { eyeToPinCm: eyeToPinOf(ss, ctx.repo.list('setups')), hand: handOf(ss, ctx.repo.list('setups')) },
      shaftMm: shaftMmOf(ss, ctx.repo.list('setups')),
    }),
    endAverageSection(ss, { onEdit: (i) => set({ sheet: 'end', end: i, endDraft: null, endSel: 0 }) }),
    endsSection(ss, {
      onEdit: (i) => set({ sheet: 'end', end: i, endDraft: null, endSel: 0 }),
    }),
    ...sections,
    finished ? null : detailsCard(ctx, ss, st, setupName, set),
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      body,
      finished
        ? APL.BottomBar({
            children: h(
              'div',
              { class: 'ov-actions' },
              APL.Button({ children: 'Later', variant: 'secondary', onClick: () => ctx.navigate('home', { replace: true }), fk: 'ov-later' }),
              APL.Button({
                children: 'Save review',
                onClick: () => {
                  ctx.toast('Review saved.');
                  ctx.navigate(`history/${encodeURIComponent(ss.id)}`, { replace: true });
                },
                fk: 'ov-save-review',
              }),
            ),
          })
        : null,
    ),
    // right after Finish only an end can be opened (the details and the menu are History's)
    overlay: finished && ov.sheet !== 'end' ? null : overlayFor(ctx, ss, state),
  };
}
