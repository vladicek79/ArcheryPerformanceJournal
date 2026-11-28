// A scored session as a printable, self-contained report laid out on A4 pages (794 × 1123 CSS px):
// page 1 the results (score, every arrow, the group, the average per end, the scorecard), page 2 the
// process (M / S grades, the review, the shot timing from the watch), then the watch's shot log.
// Pages have a fixed height, so what would not fit moves on to a further page: the scorecard's last
// ends, the shot timing, the shot log's rows. Light colours, no scripts and no external files but
// the Inter font (with the system font behind it), so it prints on A4 and opens years later.
//
// Every size that comes from the data (bars, histogram, the average shot) is drawn in SVG: the app's
// Content-Security-Policy refuses style attributes when the report is printed from inside it.
import { formatDate } from '../core/dom.js';
import { computeStats, fmt } from './stats.js';
import { faceLabel, isMultiSpot, zoneOf, ringEdges, printedRings, spotRadiusCm, arrowValue, canPlaceArrows } from './scoring.js';
import { formatDuration } from './sessionLogic.js';
import { TYPE_LABELS, sessionType, isGraded, distanceLabel } from './sessionTypes.js';
import { scoreCounts, endAverages, gradeDistribution, groupArrows, groupCentre, groupSpread } from './sessionInsights.js';
import { endTimeline, mmss } from './hrTrace.js';
import { T } from './strings.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text made safe for HTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** "archery-2026-11-26-training-18m.html" */
export function reportFileName(ss) {
  const type = sessionType(ss);
  return ['archery', ss.date, type, ss.distance ? `${ss.distance}m` : null].filter(Boolean).join('-') + '.html';
}

const longDay = (iso) => formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });

/** "Training · 26 November 2026" */
export const reportTitle = (ss) => `${TYPE_LABELS[sessionType(ss)]} · ${longDay(ss.date)}`;

// ---------------------------------------------------------------- page geometry (CSS px)

/** The page's content height: 1123 less the 44 px top and 72 px bottom padding. */
const CONTENT_H = 1007;
const GAP = 18;
const TITLE_H = 50;

// ---------------------------------------------------------------- colours (APL light theme)

const C = {
  ink: '#14181b',
  inkSoft: '#3b444b',
  muted: '#58626a',
  border: '#e1e5e7',
  sunken: '#eceeec',
  accent: '#0b7a55',
  accentText: '#086646',
  grey: '#b9c2c8',
  bar: '#8f9aa2',
  white: '#ffffff',
};
const FACE_FILL = { gold: '#ffe14d', red: '#ee4049', blue: '#00a6d6', black: '#1a1a1a', white: '#ffffff' };

// ---------------------------------------------------------------- small parts

const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const label = (text, cls = '') => `<div class="apl-r-label${cls ? ` ${cls}` : ''}">${esc(text)}</div>`;
const stat = (value, text, cls = '') => `<div class="apl-r-stat${cls ? ` ${cls}` : ''}"><b>${esc(value)}</b><span>${esc(text)}</span></div>`;
const pageTitle = (kicker, heading) => `<div class="apl-r-title">${label(kicker)}<h2 class="apl-r-h2">${esc(heading)}</h2></div>`;

const CHIP_ZONE = { gold: 'gold', red: 'red', blue: 'blue', black: 'dark', white: 'dark', miss: 'miss', empty: 'empty' };

/** A score as a circle in the target's colours: 20 px, or 26 px with `big`. */
function chip(v, big = false) {
  const cls = ['apl-r-chip', big ? 'apl-r-chip--md' : '', `apl-r-z-${CHIP_ZONE[zoneOf(v)]}`, v === 'X' ? 'apl-r-chip--x' : '']
    .filter(Boolean)
    .join(' ');
  return `<span class="${cls}">${v == null ? '–' : esc(v)}</span>`;
}

/** X above 10 above 9 … above M. */
const rank = (v) => (v === 'X' ? 11 : v === 'M' ? -1 : Number(v));

/** [1, 2, 3, 5] → "1–3, 5" */
function endList(nos) {
  const out = [];
  for (let i = 0; i < nos.length; i++) {
    let j = i;
    while (j + 1 < nos.length && nos[j + 1] === nos[j] + 1) j++;
    out.push(j > i ? `${nos[i]}–${nos[j]}` : `${nos[i]}`);
    i = j;
  }
  return out.join(', ');
}

/** Lines a text takes at about `perLine` characters a line. */
function lines(text, perLine) {
  return String(text || '')
    .split('\n')
    .reduce((t, p) => t + Math.max(1, Math.ceil(p.length / perLine)), 0);
}

// ---------------------------------------------------------------- page 1: results

function header(ss, st, setupName) {
  const comp = ss.competition || {};
  const facts = [ss.time, ss.minutes != null ? formatDuration(ss.minutes) : null, ss.distance ? distanceLabel(ss) : null, faceLabel(ss.face), setupName]
    .filter((v) => v != null && v !== '');
  const event = [comp.event, comp.round, comp.conditions, comp.placement].filter(Boolean);
  const day = `${formatDate(ss.date, { weekday: 'long' })}, ${longDay(ss.date)}`;
  const html = `<div class="apl-r-head"><div class="apl-r-head-text">${label(`${TYPE_LABELS[sessionType(ss)]} report`)}
<h1 class="apl-r-h1">${esc(day)}</h1>
<p class="apl-r-sub">${esc(facts.join(' · '))}</p>${event.length ? `<p class="apl-r-sub">${esc(event.join(' · '))}</p>` : ''}</div>
<div class="apl-r-pills"><span class="apl-r-pill apl-r-pill--accent">${esc(TYPE_LABELS[sessionType(ss)])}</span><span class="apl-r-pill">Let-downs ${st.ld}${st.cld ? ` · ${st.cld} correct` : ''}</span></div></div>`;
  return { html, h: 84 + (event.length ? 20 : 0) };
}

const STRIP_PER_ROW = 16;

function hero(ss, st) {
  const c = scoreCounts(ss.ends);
  const values = ss.ends
    .flatMap((e) => e.arrows)
    .filter((a) => a && a.v != null)
    .map((a) => a.v)
    .sort((a, b) => rank(b) - rank(a));
  const rows = Math.max(1, Math.ceil(values.length / STRIP_PER_ROW));
  const html = `<div class="apl-r-hero">
<div class="apl-r-score">${label('Score')}
<div class="apl-r-score-big"><b>${st.total}</b><span>/ ${st.max}</span></div>
<div class="apl-r-score-sub"><span><b>${fmt(st.avgArrow, 2)}</b> per arrow</span><span><b>${st.arrows}</b> ${st.arrows === 1 ? 'arrow' : 'arrows'}</span></div></div>
<div class="apl-r-card apl-r-strip">${label('Every arrow, best to worst')}
<div class="apl-r-chips">${values.map((v) => chip(v)).join('')}</div>
<div class="apl-r-tiles apl-r-tiles--4">${stat(c.x, 'X')}${stat(c.ten, '10')}${stat(c.nine, '9')}${stat(c.low, '8 and less')}</div></div></div>`;
  return { html, h: Math.max(170, 122 + rows * 24) };
}

/** The group on one face: its impacts, centre and spread, with the centre's offset in mm. */
function group(ss) {
  const { arrows, total } = groupArrows(ss.ends);
  // a 3D animal's arrows have no position
  if (!arrows.length || !canPlaceArrows(ss.face)) return '';
  // 100 face units are the spot's radius: on a 40 cm 10–6 face one unit is one millimetre
  const mmPerUnit = (spotRadiusCm(ss.face) * 10) / 100;
  const centre = groupCentre(arrows);
  const spread = groupSpread(arrows);
  const u = (v) => (v * 100).toFixed(1);
  const [xEdge] = ringEdges(ss.face);
  const rings = printedRings(ss.face)
    .map(({ edge, colour: z }) => {
      return `<circle r="${(edge * 100).toFixed(2)}" fill="${FACE_FILL[z]}" stroke="${z === 'black' ? C.white : C.ink}" stroke-width="0.6"/>`;
    })
    .reverse()
    .join('');
  const ellipse = spread
    ? `<ellipse cx="${u(centre.x)}" cy="${u(centre.y)}" rx="${u(spread.sdX)}" ry="${u(spread.sdY)}" fill="none" stroke="${C.white}" stroke-width="1.6" stroke-dasharray="3 2.5"/>`
    : '';
  const dots = arrows
    .map((p) => `<circle cx="${u(p.x)}" cy="${u(p.y)}" r="2.6" fill="${C.ink}" stroke="${C.white}" stroke-width="0.7"/>`)
    .join('');
  const cross = `<g transform="translate(${u(centre.x)} ${u(centre.y)})"><circle r="5.5" fill="none" stroke="${C.white}" stroke-width="3.4"/><circle r="5.5" fill="none" stroke="${C.accent}" stroke-width="1.8"/><path d="M-10 0h20M0 -10v20" stroke="${C.white}" stroke-width="3" stroke-linecap="round"/><path d="M-10 0h20M0 -10v20" stroke="${C.accent}" stroke-width="1.4" stroke-linecap="round"/></g>`;

  const cx = centre.x * 100 * mmPerUnit;
  // SVG y points down: a negative y is high
  const cy = centre.y * 100 * mmPerUnit;
  const mm = (v) => `${Math.abs(Math.round(v))} mm`;
  const across = Math.round(cx) === 0 ? 'Centred across' : cx > 0 ? 'Centre right' : 'Centre left';
  const upDown = Math.round(cy) === 0 ? 'Centred up–down' : cy < 0 ? 'Centre high' : 'Centre low';
  let shape = stat('–', 'Shape');
  let spreadText = '';
  if (spread) {
    const sx = spread.sdX * 100 * mmPerUnit;
    const sy = spread.sdY * 100 * mmPerUnit;
    if (sx > 0 && sy > 0) {
      shape = sy >= sx ? stat(`${r1(sy / sx)}×`, 'Taller than wide') : stat(`${r1(sx / sy)}×`, 'Wider than tall');
    }
    spreadText = ` Dashed ellipse: one standard deviation (±${Math.round(sx)} mm across, ±${Math.round(sy)} mm up–down).`;
  }
  const notes = [
    isMultiSpot(ss.face) ? 'The spots of the sheet are merged onto one.' : null,
    total > arrows.length ? `${plural(total - arrows.length, 'arrow')} not placed.` : null,
  ].filter(Boolean);
  const aria = `Target face ${faceLabel(ss.face)} with ${arrows.length} arrow impacts; group centre ${mm(cx)} ${cx >= 0 ? 'right' : 'left'} and ${mm(cy)} ${cy <= 0 ? 'high' : 'low'}`;
  return `<div class="apl-r-card apl-r-group">${label(`Group · ${plural(arrows.length, 'arrow')}`)}
<div class="apl-r-target"><svg viewBox="-104 -104 208 208" width="240" height="240" role="img" aria-label="${esc(aria)}">${rings}${xEdge != null ? `<circle r="${(xEdge * 100).toFixed(2)}" fill="none" stroke="${C.ink}" stroke-width="0.5"/>` : ''}<path d="M-2 0h4M0 -2v4" stroke="${C.ink}" stroke-width="0.5"/>${ellipse}${dots}${cross}</svg></div>
<div class="apl-r-tiles apl-r-tiles--3">${stat(mm(cx), across, 'apl-r-stat--md')}${stat(mm(cy), upDown, 'apl-r-stat--md')}${shape.replace('apl-r-stat"', 'apl-r-stat apl-r-stat--md"')}</div>
<p class="apl-r-cap">Green cross: group centre.${esc(spreadText)}${notes.length ? ` ${esc(notes.join(' '))}` : ''}</p></div>`;
}

/** The average per end as columns, the session's average dashed across. */
function endChart(ss, st, wide) {
  const rows = endAverages(ss.ends);
  const scored = rows.filter((r) => r.avg != null);
  if (scored.length < 2) return '';
  const W = wide ? 640 : 300;
  const L = 30;
  const top = 10;
  const base = 120;
  const min = Math.min(...scored.map((r) => r.avg));
  const y0 = Math.max(0, Math.floor((min - 0.5) / 0.5) * 0.5);
  const y = (v) => base - ((v - y0) / (10 - y0)) * (base - top);
  const step = 10 - y0 <= 3 ? 0.5 : 10 - y0 <= 6 ? 1 : 2;
  const parts = [];
  for (let v = 10; v >= y0 - 1e-9; v -= step) {
    const yy = y(v).toFixed(1);
    parts.push(`<line x1="${L}" x2="${W}" y1="${yy}" y2="${yy}" stroke="${C.border}" stroke-width="1"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${C.muted}">${v.toFixed(1)}</text>`);
  }
  const slot = (W - L) / rows.length;
  const bw = Math.min(36, slot * 0.67);
  const many = rows.length > 8;
  const decimals = rows.length <= 8 ? 2 : 1;
  const showValue = rows.length <= 12;
  rows.forEach((r, i) => {
    const cx = L + slot * (i + 0.5);
    if (r.avg != null) {
      const yt = y(r.avg);
      const fill = r.avg >= st.avgArrow - 1e-9 ? C.accent : C.grey;
      parts.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${(base - yt).toFixed(1)}" rx="4" fill="${fill}"/>`);
      if (showValue) parts.push(`<text x="${cx.toFixed(1)}" y="${(yt - 5).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.ink}">${r.avg.toFixed(decimals)}</text>`);
    }
    parts.push(`<text x="${cx.toFixed(1)}" y="136" text-anchor="middle" font-size="12" fill="${C.muted}">${many ? r.end : `End ${r.end}`}</text>`);
  });
  const ya = y(st.avgArrow).toFixed(1);
  parts.push(`<line x1="${L}" x2="${W}" y1="${ya}" y2="${ya}" stroke="${C.ink}" stroke-width="1.2" stroke-dasharray="4 3"/>`);

  const best = scored.reduce((b, r) => (r.avg > b.avg ? r : b));
  const worst = scored.reduce((b, r) => (r.avg < b.avg ? r : b));
  // the arrows of 8 or less (misses too), and the ends they are in
  const low = ss.ends.map((e, i) => ({ no: i + 1, n: e.arrows.filter((a) => a && a.v != null && a.v !== 'X' && arrowValue(a.v) <= 8) }));
  const lowAll = low.flatMap((x) => x.n);
  const lowEnds = low.filter((x) => x.n.length).map((x) => x.no);
  const lowName = lowAll.every((a) => a.v === 8) ? 'Eights' : '8 and less';
  const lowText = lowAll.length
    ? `${lowName}, ${lowEnds.length === 1 ? 'all in end' : lowEnds.length === scored.length ? 'in ends' : 'all in ends'} ${endList(lowEnds)}`
    : 'Arrows of 8 and less';
  const aria = `Average per arrow by end: ${scored.map((r) => r.avg.toFixed(2)).join(', ')}; session average ${fmt(st.avgArrow, 2)}`;
  return `<div class="apl-r-card apl-r-chartcard"><div class="apl-r-cardhead">${label('Average per end')}<span class="apl-r-cap">Dashed line: session ${fmt(st.avgArrow, 2)}</span></div>
<svg class="apl-r-chart" viewBox="0 0 ${W} 150" role="img" aria-label="${esc(aria)}">${parts.join('')}</svg>
<div class="apl-r-chartstats">${stat(`End ${best.end} · ${best.total}`, 'Best end', 'apl-r-stat--md')}${stat(`End ${worst.end} · ${worst.total}`, 'Lowest end', 'apl-r-stat--md')}${stat(lowAll.length, lowText, 'apl-r-stat--md')}${stat(st.ld, st.cld ? `Let-downs · ${st.cld} correct` : 'Let-downs', 'apl-r-stat--md')}</div></div>`;
}

const SC_PER_LINE = 8;

/** The scorecard's rows: one per end, with its height on the page. */
function scorecardRows(ss) {
  const graded = isGraded(ss);
  let running = 0;
  return endAverages(ss.ends).map((r, i) => {
    const e = ss.ends[i];
    running += r.total;
    const arrows = e.arrows
      .map((a) => {
        const g = (k) => (a?.[k] != null ? a[k] : '–');
        const sub = graded ? (a?.m == null && a?.s == null ? '–' : `M${g('m')} S${g('s')}`) : null;
        return `<div class="apl-r-sc-arrow">${chip(a?.v ?? null, true)}${sub != null ? `<small>${esc(sub)}</small>` : ''}</div>`;
      })
      .join('');
    const extra = [
      e.ld ? `${plural(e.ld, 'let-down')}${e.cld ? ` (${e.cld} correct)` : ''}` : null,
      (e.note || '').trim() || null,
    ].filter(Boolean);
    const extraText = extra.join(' · ');
    const nLines = Math.max(1, Math.ceil(e.arrows.length / SC_PER_LINE));
    const h = 9 + nLines * (graded ? 43 : 26) + (nLines - 1) * 6 + (extra.length ? lines(extraText, 70) * 16 + 2 : 0);
    const html = `<div class="apl-r-sc-row apl-r-sc-end"><span class="apl-r-sc-no">End ${r.end}</span>
<div><div class="apl-r-sc-arrows">${arrows}</div>${extra.length ? `<div class="apl-r-sc-note">${esc(extraText)}</div>` : ''}</div>
<span class="apl-r-sc-total">${r.total}</span><span class="apl-r-sc-avg">${fmt(r.avg, 2)}</span><span class="apl-r-sc-run">${running}</span></div>`;
    return { html, h };
  });
}

function scorecardHead(ss) {
  return `<div class="apl-r-sc-row apl-r-sc-head">${label('End')}${label(isGraded(ss) ? 'Arrows · mental and cycle grade' : 'Arrows')}${label('Total', 'apl-r-right')}${label('Avg', 'apl-r-right')}${label('Run', 'apl-r-right')}</div>`;
}
const SC_HEAD_H = 22;

/** Page 1, and the pages the scorecard continues on when its ends do not all fit. */
function resultsPages(ss, st, setupName) {
  const head = header(ss, st, setupName);
  const top = hero(ss, st);
  const grp = group(ss);
  const chart = endChart(ss, st, !grp);
  const pair = grp || chart ? `<div class="apl-r-row2${grp && chart ? '' : ' apl-r-row2--one'}">${grp}${chart}</div>` : '';
  const pairH = grp ? 412 : chart ? 330 : 0;
  const rows = scorecardRows(ss);
  let budget = CONTENT_H - head.h - GAP - top.h - GAP - (pair ? pairH + GAP : 0) - SC_HEAD_H;
  const pages = [];
  let current = [];
  for (const row of rows) {
    if (row.h > budget && current.length) {
      pages.push(current);
      current = [];
      budget = CONTENT_H - TITLE_H - GAP - SC_HEAD_H;
    }
    current.push(row.html);
    budget -= row.h;
  }
  pages.push(current);
  const card = (rowsHtml) => `<div class="apl-r-sc">${scorecardHead(ss)}${rowsHtml.join('')}</div>`;
  return pages.map((p, i) =>
    i === 0
      ? `${head.html}${top.html}${pair}${p.length ? card(p) : ''}`
      : `${pageTitle('Scorecard, continued', 'Every end')}${card(p)}`,
  );
}

// ---------------------------------------------------------------- page 2: process

/** A histogram's column as SVG: `h` of 64 px, rounded on top. */
function histBar(h) {
  const W = 53;
  const H = 64;
  if (h <= 0) return `<svg class="apl-r-hist-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
  const t = H - h;
  const r = Math.min(4, h);
  return `<svg class="apl-r-hist-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="M0 ${H}V${t + r}Q0 ${t} ${r} ${t}H${W - r}Q${W} ${t} ${W} ${t + r}V${H}Z" fill="${C.accent}"/></svg>`;
}

function gradeCards(ss) {
  const m = gradeDistribution(ss.ends, 'm');
  const s = gradeDistribution(ss.ends, 's');
  const top = Math.max(1, ...m.counts, ...s.counts);
  const card = (title, d) => `<div class="apl-r-card"><div class="apl-r-cardhead">${label(title)}<span class="apl-r-cap">${d.n} graded</span></div>
<div class="apl-r-grade-big"><b>${fmt(d.avg)}</b><span>average grade</span></div>
<div class="apl-r-hist">${d.counts
    .map(
      (n, i) =>
        `<div class="apl-r-hist-col"><span class="apl-r-hist-n">${n || '·'}</span><div class="apl-r-hist-track">${histBar(Math.round((n / top) * 64))}</div><span class="apl-r-cap">${i + 1}</span></div>`,
    )
    .join('')}</div></div>`;
  return { html: `<div class="apl-r-tiles apl-r-tiles--2 apl-r-gap16">${card('Mental (M)', m)}${card('Cycle (S)', s)}</div>`, h: 218 };
}

function review(ss) {
  const r = ss.review || {};
  const good = (r.good || '').trim();
  const workOn = (r.workOn || '').trim();
  const how = (r.how || '').trim();
  const note = (ss.note || '').trim();
  if (!good && !workOn && !how && !note) return null;
  const box = (title, text, cls = '') =>
    `<div class="apl-r-note${cls}">${label(title)}${text ? `<p class="apl-r-note-text" lang="sk">${esc(text)}</p>` : '<p class="apl-r-note-text apl-r-mut">—</p>'}</div>`;
  const boxH = (text, perLine) => 30 + 16 + 6 + lines(text, perLine) * 22;
  const html = `<div class="apl-r-review">${label(T.review)}
<div class="apl-r-tiles apl-r-tiles--2 apl-r-gap10">${box(T.reviewGood, good)}${box(T.reviewWorkOn, workOn)}</div>
${box(T.reviewHow, how, ' apl-r-note--accent')}${note ? box('Note', note) : ''}</div>`;
  const h = 16 + 10 + Math.max(boxH(good, 40), boxH(workOn, 40)) + 10 + boxH(how, 86) + (note ? 10 + boxH(note, 86) : 0);
  return { html, h };
}

const meanOf = (xs) => {
  const v = xs.filter((n) => n != null && Number.isFinite(n));
  return v.length ? v.reduce((t, n) => t + n, 0) / v.length : null;
};

/** What the watch recorded, end by end (null for a session shot without it). */
function watchData(ss) {
  const ends = ss.ends.map((e, i) => ({ no: i + 1, end: e, tl: endTimeline(e) })).filter((x) => x.tl && (x.tl.shots.length || x.tl.hr));
  if (!ends.length) return null;
  const shots = ends.flatMap((x) => x.tl.shots);
  const det = shots.filter((sh) => sh.detected);
  // from watch app 0.10 the stretch after the set-up is split into the draw and the full draw
  const split = shots.some((sh) => sh.settle != null);
  // the set (hooking and gripping) reads 0 on every shot with a real bow: then it is left out
  const showSet = det.some((sh) => sh.setup);
  return { ends, shots, det, split, showSet };
}

/** A row of bars, one per end: the highest in the accent. */
function barList(title, items, unit, scale) {
  const vals = items.map((x) => x.v).filter((v) => v != null);
  const max = vals.length ? Math.max(...vals) : null;
  const full = Math.max(scale, ...vals);
  const W = 104;
  let marked = false;
  const rows = items
    .map(({ no, v }) => {
      const hi = !marked && v != null && v === max;
      if (hi) marked = true;
      const w = v == null ? 0 : Math.max(0, Math.min(W, (v / full) * W));
      return `<div class="apl-r-barrow"><span class="apl-r-cap">End ${no}</span><svg viewBox="0 0 ${W} 10" preserveAspectRatio="none" aria-hidden="true"><rect width="${W}" height="10" rx="5" fill="${C.sunken}"/>${w ? `<rect width="${w.toFixed(1)}" height="10" rx="5" fill="${hi ? C.accent : C.bar}"/>` : ''}</svg><span class="apl-r-barval">${v == null ? '–' : `${unit === 's' ? v.toFixed(1) : Math.round(v)}${unit === 's' ? ' s' : ''}`}</span></div>`;
    })
    .join('');
  return `<div class="apl-r-bars">${label(title)}${rows}</div>`;
}

const AVG_W = 690;

/** The shot timing's summary: the averages, the average shot and three bars per end. */
function timing(ss, st, w) {
  const { ends, shots, det, split } = w;
  const avg = (pick) => meanOf(det.map(pick));
  const setup = avg((sh) => sh.raise ?? sh.draw);
  const draw = split ? avg((sh) => (sh.settle != null ? sh.pull : null)) : null;
  const full = split ? avg((sh) => sh.anchor) : avg((sh) => sh.hold);
  const follow = split ? avg((sh) => sh.follow) : null;
  const gap = meanOf(shots.map((sh) => sh.gap));
  const hrs = ends.map((x) => x.tl.hr).filter(Boolean);
  const s = (v) => (v == null ? '–' : `${r1(v)} s`);
  const tiles = [
    stat(s(setup), 'Ø set-up'),
    split ? stat(s(draw), 'Ø draw') : null,
    stat(s(full), split ? 'Ø full draw' : 'Ø draw + full draw'),
    split ? stat(follow == null ? '–' : `${Math.round(follow)} mm`, 'Ø follow-through') : null,
    stat(gap == null ? '–' : `${Math.round(gap)} s`, 'Ø between shots'),
    hrs.length ? stat(`${Math.min(...hrs.map((h) => h.min))}–${Math.max(...hrs.map((h) => h.max))}`, 'Heart rate') : null,
  ].filter(Boolean);

  // the average shot, its phases side by side
  const segs = [
    { name: 'Set-up', v: setup, fill: C.sunken, text: C.ink },
    ...(split ? [{ name: 'Draw', v: draw, fill: C.grey, text: C.ink }] : []),
    { name: split ? 'Full draw' : 'Draw + full draw', v: full, fill: C.accent, text: C.white },
  ].filter((x) => x.v != null && x.v > 0);
  const sum = segs.reduce((t, x) => t + x.v, 0);
  let x0 = 0;
  const segSvg = segs
    .map((sg) => {
      const wd = (sg.v / sum) * AVG_W;
      const txt = `${sg.name} ${r1(sg.v)} s`;
      const fits = txt.length * 7 + 20 <= wd;
      const out = `<rect x="${x0.toFixed(1)}" width="${wd.toFixed(1)}" height="30" fill="${sg.fill}"/>${fits ? `<text x="${(x0 + 10).toFixed(1)}" y="19.5" font-size="12" font-weight="600" fill="${sg.text}">${esc(txt)}</text>` : ''}`;
      x0 += wd;
      return out;
    })
    .join('');
  const hidden = segs.filter((sg) => !(`${sg.name} ${r1(sg.v)} s`.length * 7 + 20 <= (sg.v / sum) * AVG_W));
  const shotLine = sum
    ? `Average shot, ${r1(sum)} s from bow raise to release${hidden.length ? ` · ${hidden.map((sg) => `${sg.name.toLowerCase()} ${r1(sg.v)} s`).join(' · ')}` : ''}`
    : 'Average shot';
  const bar = sum
    ? `<svg class="apl-r-avgshot" viewBox="0 0 ${AVG_W} 30" role="img" aria-label="${esc(segs.map((sg) => `${sg.name} ${r1(sg.v)} s`).join(', '))}"><defs><clipPath id="apl-r-avgclip"><rect width="${AVG_W}" height="30" rx="8"/></clipPath></defs><g clip-path="url(#apl-r-avgclip)">${segSvg}</g></svg>`
    : '';

  const perEnd = (pick) => ends.map(({ no, tl }) => ({ no, v: pick(tl) }));
  const lists = [
    barList('Ø Set-up per end', perEnd((tl) => tl.avg?.raise ?? tl.avg?.draw ?? null), 's', 10),
    barList(split ? 'Ø Full draw per end' : 'Ø Draw + full draw per end', perEnd((tl) => (split ? tl.avg?.anchor : tl.avg?.hold) ?? null), 's', 10),
    barList('Ø Heart rate per end', perEnd((tl) => tl.hr?.avg ?? null), 'bpm', 100),
  ].join('');

  const html = `<div class="apl-r-timing">${label('Shot timing · from the watch')}
<div class="apl-r-tiles apl-r-tiles--${tiles.length}">${tiles.map((t) => t.replace('apl-r-stat"', 'apl-r-stat apl-r-tile"')).join('')}</div>
<div class="apl-r-avg">${bar}<div class="apl-r-avgcap"><span>${esc(shotLine)}</span><span>${det.length} of ${st.arrows} shots timed</span></div></div>
<div class="apl-r-tiles apl-r-tiles--3 apl-r-gap20">${lists}</div></div>`;
  const h = 16 + 12 + 68 + 12 + 52 + 12 + 4 + 16 + ends.length * 23;
  return { html, h };
}

/** Page 2 (grades, review, timing), with the timing on a page of its own when it would not fit. */
function processPages(ss, st, w) {
  const parts = [];
  if (isGraded(ss)) parts.push(gradeCards(ss));
  const rv = review(ss);
  if (rv) parts.push(rv);
  const tm = w ? timing(ss, st, w) : null;
  const used = TITLE_H + parts.reduce((t, p) => t + GAP + p.h, 0);
  const title = pageTitle('Process', 'How the shots felt and flowed');
  if (!parts.length) return tm ? [`${title}${tm.html}`] : [];
  if (!tm) return [`${title}${parts.map((p) => p.html).join('')}`];
  if (used + GAP + tm.h <= CONTENT_H) return [`${title}${parts.map((p) => p.html).join('')}${tm.html}`];
  return [`${title}${parts.map((p) => p.html).join('')}`, `${pageTitle('Shot timing', 'From the watch')}${tm.html}`];
}

// ---------------------------------------------------------------- page 3: shot log

const FD_FULL = 11;
const FD_LONG = 9;
const FD_W = 120;
const ROW_H = 22;
const END_H = 28;
const LOG_HEAD_H = 23;

function fullDrawCell(v) {
  if (v == null) return '<span class="apl-r-mut">–</span>';
  const long = v >= FD_LONG;
  const wd = Math.max(0, Math.min(FD_W, (v / FD_FULL) * FD_W));
  return `<div class="apl-r-fd${long ? ' apl-r-fd--long' : ''}"><svg viewBox="0 0 ${FD_W} 8" preserveAspectRatio="none" aria-hidden="true"><rect width="${FD_W}" height="8" rx="4" fill="${C.sunken}"/><rect width="${wd.toFixed(1)}" height="8" rx="4" fill="${long ? C.accent : C.bar}"/></svg><span>${r1(v)}</span></div>`;
}

/** The shot log's rows (each end's header, then a row per shot), with their heights. */
function logRows(w) {
  const { ends, split, showSet } = w;
  const sec = (v) => (v == null || !Number.isFinite(v) ? '–' : r1(v));
  const row = (sh) => {
    const cells = [
      `<span>${sh.no != null ? `#${sh.no}` : '–'}</span>`,
      `<span class="apl-r-mut">${mmss(sh.t)}</span>`,
      showSet ? `<span>${sh.detected ? sec(sh.setup) : '–'}</span>` : null,
      `<span>${sh.detected ? sec(sh.raise ?? sh.draw) : '–'}</span>`,
      ...(split
        ? [
            `<span>${sh.settle != null ? sec(sh.pull) : sh.detected ? sec(sh.hold) : '–'}</span>`,
            fullDrawCell(sh.settle != null ? sh.anchor : null),
            `<span>${sh.follow == null ? '–' : `${sh.follow}${sh.followOff != null ? ` <span class="apl-r-mut">(${sh.followOff})</span>` : ''}`}</span>`,
            `<span>${sh.followBack != null ? sh.followBack : '–'}</span>`,
          ]
        : [fullDrawCell(sh.detected ? sh.hold : null)]),
      `<span>${sh.m ?? '–'}</span>`,
      `<span>${sh.s ?? '–'}</span>`,
      `<span>${sh.hr ?? '–'}</span>`,
      `<span class="apl-r-log-score">${sh.v == null ? '<span class="apl-r-mut">–</span>' : chip(sh.v)}</span>`,
    ].filter(Boolean);
    return { html: `<div class="apl-r-log-row">${cells.join('')}</div>`, h: ROW_H };
  };
  const out = [];
  for (const { no, end, tl } of ends) {
    // a release with no scored arrow, or a scored arrow with no release, is said, not hidden
    const unscored = tl.shots.filter((sh) => sh.detected && sh.v == null).length;
    const scored = end.arrows.filter((a) => a && a.v != null).length;
    const untimed = Math.max(0, scored - tl.shots.filter((sh) => sh.v != null).length);
    const meta = [
      mmss(tl.seconds),
      tl.hr ? `♥ ${tl.hr.min}–${tl.hr.max} (Ø ${tl.hr.avg})` : null,
      tl.avgGap != null ? `Ø ${tl.avgGap} s between shots` : null,
      unscored ? `${plural(unscored, 'release')} without a scored arrow` : null,
      untimed ? `${plural(untimed, 'scored arrow')} not timed` : null,
    ].filter(Boolean);
    const head = (cont) => ({
      html: `<div class="apl-r-log-end"><b>End ${no}${cont ? ', continued' : ''}</b><span>${esc(meta.join(' · '))}</span></div>`,
      h: END_H,
      end: no,
    });
    out.push({ ...head(false), head: true, cont: head(true) });
    if (!tl.shots.length) out.push({ html: '<div class="apl-r-log-row apl-r-log-empty"><span>No shots timed in this end; its heart rate is kept.</span></div>', h: ROW_H });
    else out.push(...tl.shots.map(row));
  }
  return out;
}

function logHead(w) {
  const cols = ['Arrow', 'Time', w.showSet ? 'Set' : null, 'Set-up', ...(w.split ? ['Draw', 'Full draw (s)', 'Follow', 'Back'] : ['Draw + full draw (s)']), 'M', 'S', '♥', 'Score'].filter(Boolean);
  return `<div class="apl-r-log-row apl-r-log-head">${cols.map((c) => `<span${c.endsWith('(s)') ? ' class="apl-r-left"' : ''}>${esc(c)}</span>`).join('')}</div>`;
}

function glossary(w) {
  const b = (t) => `<b>${esc(t)}</b>`;
  const set = w.showSet ? `${b('Set')}: hooking and gripping. ` : '';
  const setNote = w.showSet ? '' : 'Set (hooking and gripping) read 0.0 s on every shot and is left out. ';
  const text = w.split
    ? `Times in seconds; Time is from the start of the end. ${setNote}${set}${b('Set-up')}: hand on the string before the draw, raising the bow, any pause. ${b('Draw')}: the wrist swinging to full draw. ${b('Full draw')}: reaching full draw to release (anchor, aim, expansion); green bars are 9 s or longer. ${b('Follow')}: hand travel in the first 0.1 s after release, in mm; in brackets, its distance from the end’s average direction. ${b('Back')}: the part of it straight back along the forearm, in mm.`
    : `Times in seconds; Time is from the start of the end. ${setNote}${set}${b('Set-up')}: raising the bow to the set-up position. ${b('Draw + full draw')}: from there to the release; green bars are 9 s or longer.`;
  return { html: `<p class="apl-r-gloss">${text}</p>`, h: lines(text.replace(/<[^>]+>/g, ''), 120) * 17 };
}

/** The shot log over as many pages as its rows need, the header row on each, the glossary last. */
function logPages(w) {
  const rows = logRows(w);
  const gloss = glossary(w);
  // a few px spare: a row's height varies with its content by a pixel or so
  const budget = CONTENT_H - TITLE_H - GAP - LOG_HEAD_H - 10;
  const pages = [];
  let page = [];
  let left = budget;
  rows.forEach((r, i) => {
    // an end's header stays with its first shot
    const need = r.head ? r.h + (rows[i + 1]?.h ?? 0) : r.h;
    if (need > left && page.length) {
      pages.push(page);
      page = [];
      left = budget;
      if (!r.head) {
        const lastHead = [...rows.slice(0, i)].reverse().find((x) => x.head);
        page.push(lastHead.cont);
        left -= lastHead.cont.h;
      }
    }
    page.push(r);
    left -= r.h;
  });
  // the glossary goes under the last rows; when it does not fit there, the last rows move on with it
  const glossH = GAP + gloss.h;
  if (left < glossH) {
    const moved = [];
    const isHead = (x) => x.end != null;
    while ((left < glossH || isHead(page[page.length - 1])) && page.length > 1) {
      const r = page.pop();
      moved.unshift(r);
      left += r.h;
    }
    if (moved.length && !isHead(moved[0])) {
      const lastHead = [...page].reverse().find(isHead);
      if (lastHead) moved.unshift(lastHead.cont ?? lastHead);
    }
    pages.push(page);
    page = moved;
  }
  pages.push(page);
  return pages.map(
    (p, i) =>
      `${pageTitle(i ? 'Shot log, continued' : 'Shot log', 'Every shot, as the watch saw it')}<div class="apl-r-log apl-r-log--${w.split ? 'split' : 'plain'}${w.showSet ? '-set' : ''}">${logHead(w)}${p.map((r) => r.html).join('')}</div>${i === pages.length - 1 ? gloss.html : ''}`,
  );
}

// ---------------------------------------------------------------- styles

/**
 * The report's styles. Everything is under .apl-report, with its own class names (apl-r-…), so
 * the report can sit inside the app's page for printing without the app's styles and its own
 * mixing.
 */
export const REPORT_CSS = `
.apl-report{color:${C.ink};font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.35;font-variant-numeric:tabular-nums;font-feature-settings:"tnum";-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left}
.apl-report *{box-sizing:border-box}
.apl-page{width:794px;height:1123px;position:relative;overflow:hidden;background:#fff;padding:44px 52px 72px;display:flex;flex-direction:column;gap:${GAP}px;margin:24px auto;box-shadow:0 0 0 1px ${C.border}}
.apl-r-label{margin:0;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}}
.apl-r-right{text-align:right}
.apl-r-left{text-align:left!important}
.apl-r-mut{color:${C.muted}}
.apl-r-cap{margin:0;font-size:12px;line-height:16px;color:${C.muted}}
.apl-r-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.apl-r-head-text{display:flex;flex-direction:column;gap:6px;min-width:0}
.apl-r-h1{margin:0;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.01em}
.apl-r-h2{margin:0;font-size:24px;line-height:30px;font-weight:800}
.apl-r-sub{margin:0;font-size:14px;line-height:20px;color:${C.inkSoft}}
.apl-r-title{display:flex;flex-direction:column;gap:4px}
.apl-r-pills{display:flex;gap:8px;flex:none}
.apl-r-pill{font-size:12px;line-height:16px;font-weight:600;padding:5px 10px;border-radius:999px;border:1px solid ${C.border};color:${C.inkSoft};white-space:nowrap}
.apl-r-pill--accent{background:#e7f4ee;border-color:#9ccdb7;color:${C.accentText}}
.apl-r-hero{display:grid;grid-template-columns:236px minmax(0,1fr);gap:16px}
.apl-r-score{background:${C.sunken};border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;justify-content:space-between;gap:10px}
.apl-r-score-big{display:flex;align-items:baseline;gap:6px}
.apl-r-score-big b{font-size:64px;line-height:60px;font-weight:800;letter-spacing:-.03em}
.apl-r-score-big span{font-size:18px;line-height:24px;font-weight:600;color:${C.muted}}
.apl-r-score-sub{display:flex;gap:18px;font-size:13px;line-height:22px;color:${C.inkSoft}}
.apl-r-score-sub b{font-size:18px;color:${C.ink}}
.apl-r-card{border:1px solid ${C.border};border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.apl-r-cardhead{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.apl-r-strip{padding:18px 20px;gap:14px}
.apl-r-chips{display:flex;flex-wrap:wrap;gap:4px}
.apl-r-chip{display:inline-flex;flex:none;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:12px;line-height:1;font-weight:700;letter-spacing:-.02em;color:${C.ink};background:#fff;border:1px solid ${C.border}}
.apl-r-chip--md{width:26px;height:26px;font-size:13px}
.apl-r-z-gold{background:${FACE_FILL.gold};border:1px solid #c4a81f}
.apl-r-chip--x{box-shadow:inset 0 0 0 2px ${FACE_FILL.gold},inset 0 0 0 3px ${C.ink}}
.apl-r-z-red{background:#fff;border:3px solid ${FACE_FILL.red}}
.apl-r-z-blue{background:#fff;border:3px solid ${FACE_FILL.blue}}
.apl-r-z-dark{background:#fff;border:3px solid ${C.ink}}
.apl-r-z-miss{background:${C.sunken};border:1px solid ${C.sunken}}
.apl-r-z-empty{background:#fff;border:1px dashed ${C.muted};color:${C.muted}}
.apl-r-tiles{display:grid;gap:8px}
.apl-r-tiles--2{grid-template-columns:repeat(2,minmax(0,1fr))}
.apl-r-tiles--3{grid-template-columns:repeat(3,minmax(0,1fr))}
.apl-r-tiles--4{grid-template-columns:repeat(4,minmax(0,1fr))}
.apl-r-tiles--5{grid-template-columns:repeat(5,minmax(0,1fr))}
.apl-r-tiles--6{grid-template-columns:repeat(6,minmax(0,1fr))}
.apl-r-gap10{gap:10px}.apl-r-gap16{gap:16px}.apl-r-gap20{gap:20px}
.apl-r-stat{display:flex;flex-direction:column;gap:2px;min-width:0}
.apl-r-stat b{font-size:22px;line-height:26px;font-weight:700}
.apl-r-stat span{font-size:12px;line-height:16px;color:${C.muted}}
.apl-r-stat--md b{font-size:18px;line-height:22px}
.apl-r-tile{border:1px solid ${C.border};border-radius:12px;padding:10px 12px}
.apl-r-tile b{font-size:20px;line-height:24px;white-space:nowrap}
.apl-r-row2{display:grid;grid-template-columns:316px minmax(0,1fr);gap:16px}
.apl-r-row2--one{grid-template-columns:minmax(0,1fr)}
.apl-r-group{padding:16px 16px 14px}
.apl-r-group .apl-r-tiles--3{grid-template-columns:repeat(3,auto);justify-content:space-between;column-gap:6px}
.apl-r-group .apl-r-stat span{white-space:nowrap}
.apl-r-target{display:flex;justify-content:center}
.apl-r-target svg{display:block;flex:none;width:240px;height:240px}
.apl-r-chartcard{gap:10px}
.apl-r-chart{display:block;width:100%;height:auto;font-family:inherit}
.apl-r-chartstats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid ${C.border}}
.apl-r-sc{display:flex;flex-direction:column}
.apl-r-sc-row{display:grid;grid-template-columns:54px minmax(0,1fr) 56px 64px 64px;align-items:center}
.apl-r-sc-head{padding-bottom:6px}
.apl-r-sc-end{padding:4px 0;border-top:1px solid ${C.border}}
.apl-r-sc-no{font-size:14px;font-weight:700}
.apl-r-sc-arrows{display:flex;flex-wrap:wrap;gap:6px}
.apl-r-sc-arrow{display:flex;flex-direction:column;align-items:center;gap:3px;width:46px}
.apl-r-sc-arrow small{font-size:12px;line-height:14px;color:${C.muted};white-space:nowrap}
.apl-r-sc-note{margin-top:2px;font-size:12px;line-height:16px;color:${C.muted}}
.apl-r-sc-total{text-align:right;font-size:16px;font-weight:700}
.apl-r-sc-avg{text-align:right;font-size:14px;color:${C.inkSoft}}
.apl-r-sc-run{text-align:right;font-size:14px;color:${C.muted}}
.apl-r-grade-big{display:flex;align-items:baseline;gap:6px}
.apl-r-grade-big b{font-size:36px;line-height:40px;font-weight:800}
.apl-r-grade-big span{font-size:13px;color:${C.muted}}
.apl-r-hist{display:flex;gap:8px;border-bottom:1px solid ${C.border};padding-bottom:4px}
.apl-r-hist-col{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0}
.apl-r-hist-n{font-size:12px;line-height:16px;font-weight:600}
.apl-r-hist-track{width:100%;height:64px}
.apl-r-hist-svg{display:block;width:100%;height:64px}
.apl-r-review{display:flex;flex-direction:column;gap:10px}
.apl-r-note{background:${C.sunken};border:1px solid ${C.sunken};border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0}
.apl-r-note--accent{background:#e7f4ee;border-color:#9ccdb7}
.apl-r-note--accent .apl-r-label{color:${C.accentText}}
.apl-r-note-text{margin:0;font-size:15px;line-height:22px;color:${C.ink};white-space:pre-wrap;overflow-wrap:anywhere}
.apl-r-timing{display:flex;flex-direction:column;gap:12px}
.apl-r-avg{display:flex;flex-direction:column;gap:6px}
.apl-r-avgshot{display:block;width:100%;height:30px;font-family:inherit}
.apl-r-avgcap{display:flex;justify-content:space-between;gap:12px;font-size:12px;line-height:16px;color:${C.muted}}
.apl-r-bars{display:flex;flex-direction:column;gap:7px;min-width:0}
.apl-r-barrow{display:grid;grid-template-columns:44px minmax(0,1fr) 52px;align-items:center;gap:8px}
.apl-r-barrow svg{display:block;width:100%;height:10px}
.apl-r-barval{font-size:12px;line-height:16px;font-weight:600;text-align:right;white-space:nowrap}
.apl-r-log{display:flex;flex-direction:column}
.apl-r-log-row{display:grid;gap:6px;align-items:center;font-size:12px;line-height:16px;min-height:${ROW_H}px;border-bottom:1px solid ${C.border}}
.apl-r-log--split .apl-r-log-row{grid-template-columns:44px 46px 58px 46px minmax(0,1fr) 74px 58px 30px 30px 38px 44px}
.apl-r-log--split-set .apl-r-log-row{grid-template-columns:44px 46px 40px 52px 44px minmax(0,1fr) 74px 46px 28px 28px 36px 44px}
.apl-r-log--plain .apl-r-log-row{grid-template-columns:44px 46px 58px minmax(0,1fr) 30px 30px 38px 44px}
.apl-r-log--plain-set .apl-r-log-row{grid-template-columns:44px 46px 40px 58px minmax(0,1fr) 30px 30px 38px 44px}
.apl-r-log-row>*{text-align:right;white-space:nowrap}
.apl-r-log-row>:first-child{text-align:left;font-weight:600}
.apl-r-log-head{min-height:0;padding-bottom:6px;border-bottom:1px solid ${C.ink};font-weight:600;color:${C.muted}}
.apl-r-log-head>:first-child{font-weight:600}
.apl-r-log-empty{display:flex}
.apl-r-log-empty>:first-child{font-weight:400;color:${C.muted}}
.apl-r-log-end{display:flex;gap:10px;align-items:baseline;padding:8px 0 4px;min-width:0}
.apl-r-log-end b{font-size:13px;line-height:17px;font-weight:700;white-space:nowrap}
.apl-r-log-end span{font-size:12px;line-height:16px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apl-r-log-score{display:flex;justify-content:flex-end}
.apl-r-fd{display:flex;align-items:center;gap:6px;min-width:0}
.apl-r-fd svg{display:block;flex:1;min-width:0;height:8px}
.apl-r-fd span{width:30px;flex:none;text-align:right}
.apl-r-fd--long span{font-weight:700;color:${C.accentText}}
.apl-r-gloss{margin:0;font-size:12px;line-height:17px;color:${C.muted}}
.apl-r-gloss b{color:${C.inkSoft}}
.apl-r-foot{position:absolute;left:52px;right:52px;bottom:28px;display:flex;justify-content:space-between;gap:16px;border-top:1px solid ${C.border};padding-top:8px;font-size:12px;line-height:16px;color:${C.muted}}
@media print{
  .apl-page{width:210mm;height:297mm;margin:0;box-shadow:none;break-after:page;page-break-after:always}
  .apl-page:last-child{break-after:auto;page-break-after:auto}
}
`;

// ---------------------------------------------------------------- the report

/**
 * The report's body (an <article class="apl-report"> of .apl-page sheets). `setupName`: the bow
 * setup used; `exportedAt`: a Date for the footers. (`shaftMm` is accepted and not needed: the
 * impacts are drawn as dots of one size.)
 */
export function sessionReportBody(ss, { setupName = null, exportedAt = new Date() } = {}) {
  const st = computeStats(ss.ends, ss.face);
  const w = watchData(ss);
  const pages = [...resultsPages(ss, st, setupName), ...processPages(ss, st, w), ...(w ? logPages(w) : [])];
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${exportedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${p2(exportedAt.getHours())}:${p2(exportedAt.getMinutes())}`;
  const left = `Archery Performance Journal · ${TYPE_LABELS[sessionType(ss)]} · ${longDay(ss.date)}`;
  return `<article class="apl-report">
${pages
  .map(
    (body, i) =>
      `<section class="apl-page">${body}<footer class="apl-r-foot"><span>${esc(left)}</span><span>Exported ${esc(stamp)} · Page ${i + 1} of ${pages.length}</span></footer></section>`,
  )
  .join('\n')}
</article>`;
}

/** The whole report as a standalone HTML document (the downloaded file). */
export function sessionReportHtml(ss, opts = {}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(reportTitle(ss))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;display=swap">
<style>@page{size:A4;margin:0}html,body{margin:0;background:#f3f4f2}body{padding:1px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{background:#fff}body{padding:0}}${REPORT_CSS}</style>
</head><body>
${sessionReportBody(ss, opts)}
</body></html>
`;
}
