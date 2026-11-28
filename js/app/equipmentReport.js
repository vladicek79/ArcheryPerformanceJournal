// A gear setup as a printable, self-contained report on one A4 page (794 × 1123 CSS px): the header,
// five key numbers, the fields by group, the sight marks and ruled lines for notes. An empty field
// is a write-in line, so a blank setup prints as a form to fill in by hand. The fields, their order,
// labels and units come from gearFields.js: a field added there shows up here too.
//
// It shares the session report's page, type and print styles (REPORT_CSS) and adds its own classes
// (apl-r-eq-…). No style attributes: the app's Content-Security-Policy refuses them when the report
// is printed from inside it.
import { GEAR_GROUPS, GEAR_KEYS, displayValue, fieldLabel, filledCount, groupCount, sightMarks, hasMark, markDistance, DEFAULT_SIGHT_DISTANCES } from './gearFields.js';
import { BOW_LABELS } from './sessionTypes.js';
import { esc, REPORT_CSS } from './sessionReport.js';

const C = { ink: '#14181b', inkSoft: '#3b444b', muted: '#58626a', border: '#e1e5e7', sunken: '#eceeec', line: '#808a91' };

// the groups in the left and the right column
const LEFT = ['bow', 'arrows', 'string'];
const RIGHT = ['tuning', 'accessories'];
// a name longer than this (characters) would not fit one line of the 30 px title: it gets a smaller one
const LONG_NAME = 36;

const p2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const longDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** "atf-dx-ns-xp-42lbs-670-ace": the setup's name for a file name. */
export function slug(name) {
  const s = String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'setup';
}

/** "archery-equipment-atf-dx-ns-xp-42lbs-670-ace-2026-11-28.html" */
export const equipmentFileName = (setup, at = new Date()) => `archery-equipment-${slug(setup?.name)}-${isoDay(at)}.html`;

/** "Equipment setup · ATF DX NS-XP 42lbs 670 ACE" */
export const equipmentTitle = (setup) => `Equipment setup · ${String(setup?.name ?? '').trim()}`;

const text = (fields, key) => String(fields?.[key] ?? '').trim();

/** A stored value as "value unit" text ('' when empty). */
function shown(fields, key) {
  const d = displayValue(key, fields?.[key]);
  return d.value ? `${d.value}${d.unit ? ` ${d.unit}` : ''}` : '';
}

/** The value of a field row: bold value, the unit small after it; a write-in line when empty. */
function valueHtml(fields, key) {
  const d = displayValue(key, fields?.[key]);
  if (!d.value) return '<span class="apl-r-eq-blank"></span>';
  return `<span class="apl-r-eq-val">${esc(d.value)}${d.unit ? ` <span class="apl-r-eq-unit">${esc(d.unit)}</span>` : ''}</span>`;
}

function header(setup, { isActive, bowType }) {
  const f = setup.fields || {};
  const limbs = [text(f, 'limbsModel'), shown(f, 'limbsLbs')].filter(Boolean).join(' ');
  const arrows = [text(f, 'arrowModel'), shown(f, 'spine')].filter(Boolean).join(' ');
  const summary = [BOW_LABELS[bowType] || '', text(f, 'riser'), limbs, arrows].filter(Boolean).join(' · ');
  // the pills sit on the label's row, so the name and the summary have the page's whole width
  return `<header class="apl-r-eq-head">
<div class="apl-r-eq-headtop"><p class="apl-r-label">Equipment setup</p><div class="apl-r-pills">${isActive ? '<span class="apl-r-pill apl-r-pill--accent">Active</span>' : ''}<span class="apl-r-pill">${filledCount(f)} of ${GEAR_KEYS.length} fields recorded</span></div></div>
<h1 class="apl-r-h1${String(setup.name ?? '').length > LONG_NAME ? ' apl-r-eq-h1--long' : ''}">${esc(setup.name)}</h1>${summary ? `<p class="apl-r-sub">${esc(summary)}</p>` : ''}
</header>`;
}

function tile(fields, key, sub, first = false) {
  const d = displayValue(key, fields?.[key]);
  const big = d.value
    ? `<b>${esc(d.value)}${d.unit ? `<span class="apl-r-eq-tileunit"> ${esc(d.unit)}</span>` : ''}</b>`
    : '<b class="apl-r-mut">—</b>';
  return `<div class="apl-r-eq-tile${first ? ' apl-r-eq-tile--sunken' : ''}">${big}<span>${esc(sub)}</span></div>`;
}

function keyNumbers(setup) {
  const f = setup.fields || {};
  const limbs = shown(f, 'limbsLbs');
  return `<div class="apl-r-tiles apl-r-tiles--5 apl-r-gap10">
${tile(f, 'drawWeight', limbs ? `On fingers · ${limbs} limbs` : 'On fingers', true)}
${tile(f, 'spine', text(f, 'arrowModel') ? `${text(f, 'arrowModel')} spine` : fieldLabel('spine'))}
${tile(f, 'points', fieldLabel('points'))}
${tile(f, 'nockPoint', fieldLabel('nockPoint'))}
${tile(f, 'eyeToPin', fieldLabel('eyeToPin'))}
</div>`;
}

function card(fields, group) {
  const rows = group.fields
    .map(([key, label]) => `<div class="apl-r-eq-row"><span class="apl-r-eq-key">${esc(label)}</span>${valueHtml(fields, key)}</div>`)
    .join('');
  return `<section class="apl-r-eq-card"><div class="apl-r-eq-cardhead"><h2 class="apl-r-label">${esc(group.title)}</h2><span class="apl-r-cap">${groupCount(fields, group)} of ${group.fields.length}</span></div>${rows}</section>`;
}

function sections(setup) {
  const f = setup.fields || {};
  // groups the layout does not name (a group added later) go to the shorter column
  const named = new Set([...LEFT, ...RIGHT]);
  const left = GEAR_GROUPS.filter((g) => LEFT.includes(g.id));
  const right = GEAR_GROUPS.filter((g) => RIGHT.includes(g.id));
  for (const g of GEAR_GROUPS.filter((x) => !named.has(x.id))) {
    const rows = (list) => list.reduce((n, x) => n + x.fields.length + 2, 0);
    (rows(left) <= rows(right) ? left : right).push(g);
  }
  const col = (list) => `<div class="apl-r-eq-col">${list.map((g) => card(f, g)).join('')}</div>`;
  return `<div class="apl-r-eq-cols">${col(left)}${col(right)}</div>`;
}

/** The sight-mark columns: the setup's distances, or the default ones for a setup with none. */
function markColumns(fields) {
  const rows = sightMarks(fields).filter((m) => String(m.distance ?? '').trim() || hasMark(m));
  if (!rows.length) return DEFAULT_SIGHT_DISTANCES.map((d) => ({ label: `${d} m`, elevation: '', windage: '', set: false }));
  return rows.map((m) => {
    const n = markDistance(m);
    return {
      label: n != null ? `${n} m` : String(m.distance ?? '').trim(),
      elevation: String(m.elevation ?? '').trim(),
      windage: String(m.windage ?? '').trim(),
      set: hasMark(m),
    };
  });
}

function sightTable(setup) {
  const cols = markColumns(setup.fields || {});
  const cell = (v) => `<td>${v ? `<b>${esc(v)}</b>` : '<span class="apl-r-eq-blank apl-r-eq-blank--mark"></span>'}</td>`;
  const n = cols.filter((c) => c.set).length;
  return `<section class="apl-r-eq-card apl-r-eq-marks"><div class="apl-r-eq-cardhead"><h2 class="apl-r-label">Sight marks</h2><span class="apl-r-cap">${n} of ${cols.length} distances</span></div>
<table><thead><tr><th></th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody><tr><th>ELEVATION</th>${cols.map((c) => cell(c.elevation)).join('')}</tr><tr><th>WINDAGE</th>${cols.map((c) => cell(c.windage)).join('')}</tr></tbody></table></section>`;
}

const notes = () => '<section class="apl-r-eq-notes"><h2 class="apl-r-label">Notes and changes</h2><div class="apl-r-eq-ruled"></div></section>';

/**
 * The report's styles on top of REPORT_CSS (everything under .apl-report, classes apl-r-eq-…).
 */
export const EQUIPMENT_CSS = `
.apl-r-eq .apl-r-label{font-size:12px}
.apl-page.apl-r-eq{gap:16px}
.apl-r-eq-head{display:flex;flex-direction:column;gap:6px}
.apl-r-eq-headtop{display:flex;justify-content:space-between;align-items:center;gap:24px}
.apl-r-eq .apl-r-h1{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.apl-r-eq .apl-r-h1.apl-r-eq-h1--long{font-size:24px;line-height:30px}
.apl-r-eq .apl-r-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apl-r-eq-tile{border:1px solid ${C.border};border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.apl-r-eq-tile--sunken{background:${C.sunken};border-color:${C.sunken}}
.apl-r-eq-tile b{font-size:26px;line-height:30px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apl-r-eq-tileunit{font-size:14px;font-weight:600;color:${C.muted}}
.apl-r-eq-tile>span{font-size:12px;line-height:16px;color:${C.muted};overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.apl-r-eq-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}
.apl-r-eq-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.apl-r-eq-card{border:1px solid ${C.border};border-radius:16px;padding:12px 16px 4px;display:flex;flex-direction:column;min-width:0}
.apl-r-eq-cardhead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:8px}
.apl-r-eq-row{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:28px;border-top:1px solid ${C.border}}
.apl-r-eq-key{flex:none;font-size:14px;line-height:18px;color:${C.inkSoft}}
.apl-r-eq-val{min-width:0;font-size:14px;line-height:18px;font-weight:700;color:${C.ink};text-align:right;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.apl-r-eq-unit{font-size:12px;font-weight:500;color:${C.muted}}
.apl-r-eq-blank{display:inline-block;flex:none;width:96px;max-width:100%;height:16px;border-bottom:1px solid ${C.line}}
.apl-r-eq-blank--mark{width:56px;height:18px}
.apl-r-eq-marks{padding-bottom:8px}
.apl-r-eq-marks table{width:100%;table-layout:fixed;border-collapse:collapse}
.apl-r-eq-marks th,.apl-r-eq-marks td{border-top:1px solid ${C.border};text-align:center;padding:0 4px}
.apl-r-eq-marks th:first-child{width:96px;padding-left:0;text-align:left}
.apl-r-eq-marks thead th{height:34px;font-size:14px;font-weight:700;color:${C.ink}}
.apl-r-eq-marks thead th:first-child{font-size:0}
.apl-r-eq-marks tbody th{height:32px;font-size:12px;font-weight:600;letter-spacing:.06em;color:${C.muted}}
.apl-r-eq-marks td b{display:block;font-size:18px;line-height:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apl-r-eq-notes{flex:1;min-height:60px;display:flex;flex-direction:column;gap:4px}
.apl-r-eq-ruled{flex:1;min-height:40px;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 27px,${C.border} 27px,${C.border} 28px)}
`;

/**
 * The report's body: an <article class="apl-report"> with one .apl-page. `isActive`: whether the
 * setup is the active one; `bowType`: 'recurve' / 'compound' or null (left out of the summary);
 * `exportedAt`: a Date for the footer.
 */
export function equipmentReportBody(setup, { isActive = false, bowType = null, exportedAt = new Date() } = {}) {
  return `<article class="apl-report">
<section class="apl-page apl-r-eq">${header(setup, { isActive, bowType })}
${keyNumbers(setup)}
${sections(setup)}
${sightTable(setup)}
${notes()}
<footer class="apl-r-foot"><span>Archery Performance Journal · Equipment setup · Blank lines are not recorded yet</span><span>Exported ${esc(longDay(exportedAt))} · Page 1 of 1</span></footer></section>
</article>`;
}

/** The whole report as a standalone HTML document (the downloaded file). */
export function equipmentReportHtml(setup, opts = {}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(equipmentTitle(setup))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap">
<style>@page{size:A4;margin:0}html,body{margin:0;background:#f3f4f2}body{padding:1px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{background:#fff}body{padding:0}}${REPORT_CSS}${EQUIPMENT_CSS}</style>
</head><body>
${equipmentReportBody(setup, opts)}
</body></html>
`;
}
