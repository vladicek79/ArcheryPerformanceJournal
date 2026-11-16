// Equipment: the fields of a gear setup, their units and steps, the setups themselves (one is active)
// and the sight marks each setup owns. Pure functions; the views and the session code use them.

// ---------------------------------------------------------------- fields

// [key, label, placeholder hint] per group. `chip` is the short name on the setup page's jump chips.
export const GEAR_GROUPS = [
  {
    id: 'bow',
    title: 'Bow',
    chip: 'Bow',
    fields: [
      ['riser', 'Riser', 'model'],
      ['limbsModel', 'Limbs model', 'model'],
      ['limbsLbs', 'Limbs poundage', 'lbs'],
      ['drawWeight', 'Draw weight on fingers', 'lbs'],
    ],
  },
  {
    id: 'arrows',
    title: 'Arrows',
    chip: 'Arrows',
    fields: [
      ['arrowModel', 'Arrow model', 'model'],
      ['spine', 'Spine', ''],
      ['arrowLength', 'Length', 'in'],
      ['points', 'Points', 'grain'],
      ['nocks', 'Nocks', ''],
    ],
  },
  {
    id: 'string',
    title: 'String',
    chip: 'String',
    fields: [
      ['stringMat', 'Material', ''],
      ['strands', 'Strands', 'count'],
      ['brace', 'Brace height', 'in'],
      ['nockPoint', 'Nocking point', 'mm'],
    ],
  },
  {
    id: 'tuning',
    title: 'Tuning',
    chip: 'Tuning',
    fields: [
      ['tillerTop', 'Tiller top', 'mm'],
      ['tillerBottom', 'Tiller bottom', 'mm'],
      ['plungerTension', 'Plunger tension', ''],
      ['plungerPos', 'Plunger position', ''],
      ['rest', 'Arrow rest', ''],
      ['clicker', 'Clicker position', ''],
    ],
  },
  {
    id: 'accessories',
    title: 'Stabilisers & accessories',
    chip: 'Accessories',
    fields: [
      ['stabLong', 'Long rod', 'length'],
      ['stabSides', 'Side rods', 'length'],
      ['vbar', 'V-bar', 'angle'],
      ['stabWeights', 'Weights', 'oz'],
      ['tab', 'Tab', ''],
      ['sight', 'Sight', ''],
    ],
  },
];

export const GEAR_KEYS = GEAR_GROUPS.flatMap((g) => g.fields.map((f) => f[0]));

/** The label of a field, by key. */
export const fieldLabel = (key) => GEAR_GROUPS.flatMap((g) => g.fields).find((f) => f[0] === key)?.[1] || key;

/** The group a field belongs to. */
export const fieldGroup = (key) => GEAR_GROUPS.find((g) => g.fields.some((f) => f[0] === key)) || null;

const CM_PER_IN = 2.54;

/**
 * Numeric fields: the canonical unit the value is stored in (always a plain number as text), the −/+
 * step, the range, the decimals kept, where −/+ starts on an empty field, and an optional second unit for display and typing (`alt`:
 * its name, its size in canonical units, its own step and decimals). Fields not listed are text.
 */
export const FIELD_META = {
  limbsLbs: { start: 34, unit: 'lb', step: 0.5, min: 5, max: 80, decimals: 1 },
  drawWeight: { start: 36, unit: 'lb', step: 0.5, min: 5, max: 80, decimals: 1 },
  spine: { start: 600, unit: '', step: 50, min: 100, max: 3000, decimals: 0 },
  arrowLength: { start: 28, unit: 'in', step: 0.25, min: 15, max: 40, decimals: 2, alt: { unit: 'cm', size: 1 / CM_PER_IN, step: 0.5, decimals: 1 } },
  points: { start: 100, unit: 'gr', step: 5, min: 20, max: 400, decimals: 0 },
  strands: { start: 16, unit: '', step: 1, min: 4, max: 40, decimals: 0 },
  brace: { start: 8.5, unit: 'in', step: 0.125, min: 5, max: 12, decimals: 3, alt: { unit: 'cm', size: 1 / CM_PER_IN, step: 0.1, decimals: 1 } },
  nockPoint: { start: 9, unit: 'mm', step: 1, min: -10, max: 30, decimals: 1 },
  tillerTop: { start: 3, unit: 'mm', step: 1, min: -20, max: 40, decimals: 1 },
  tillerBottom: { start: 3, unit: 'mm', step: 1, min: -20, max: 40, decimals: 1 },
  stabLong: { start: 30, unit: 'in', step: 1, min: 0, max: 40, decimals: 1 },
  stabSides: { start: 12, unit: 'in', step: 1, min: 0, max: 20, decimals: 1 },
  vbar: { start: 35, unit: '°', step: 1, min: 0, max: 90, decimals: 0 },
  stabWeights: { start: 6, unit: 'oz', step: 0.5, min: 0, max: 60, decimals: 1 },
};

export const isNumericField = (key) => key in FIELD_META;

/** "1/8 in", "0.5 lb", "1 mm": the step of a numeric field in a unit (its canonical one by default). */
export function stepLabel(key, unit = null) {
  const meta = FIELD_META[key];
  const alt = meta.alt && unit === meta.alt.unit ? meta.alt : null;
  const step = alt ? alt.step : meta.step;
  const u = alt ? alt.unit : meta.unit;
  const text = step === 0.125 ? '1/8' : step === 0.25 ? '1/4' : formatNumber(step, 3);
  return u ? `${text} ${u}` : text;
}

/** The canonical value one step up (dir 1) or down (dir -1) from `n`, stepping in `unit`; clamped. */
export function stepValue(key, n, dir, unit = null) {
  const meta = FIELD_META[key];
  const alt = meta.alt && unit === meta.alt.unit ? meta.alt : null;
  if (n == null) return meta.start;
  let next;
  if (alt) {
    const shown = Math.round((n / alt.size) / alt.step) * alt.step;
    next = (shown + dir * alt.step) * alt.size;
  } else {
    // snap onto the step grid first, so 8.6 + 1/8 → 8.625 rather than 8.725
    const snapped = Math.round(n / meta.step) * meta.step;
    next = Math.abs(snapped - n) > 1e-9 ? (dir > 0 ? Math.ceil(n / meta.step) : Math.floor(n / meta.step)) * meta.step : n + dir * meta.step;
  }
  return Math.min(meta.max, Math.max(meta.min, Number(next.toFixed(6))));
}

/** A number with at most `decimals` places and no trailing zeros ("8.750" → "8.75"). */
export function formatNumber(n, decimals) {
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(decimals);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/**
 * Read a typed value of a numeric field leniently: "8.75", "8,75", "8 3/4", "3/4", "8.75 in",
 * "22.2 cm" (converted to the canonical unit when the field has that unit). `unit` is the unit the
 * number is typed in when the text names none. Returns the canonical number, or null.
 */
export function parseFieldValue(key, text, unit = null) {
  const meta = FIELD_META[key];
  if (!meta) return null;
  let s = String(text ?? '').trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let typedUnit = unit || meta.unit;
  const named = meta.alt && s.match(/\s*(cm|in|"|″)$/);
  if (named) {
    typedUnit = named[1] === 'cm' ? 'cm' : 'in';
    s = s.slice(0, named.index).trim();
  } else s = s.replace(/\s*(lbs?|#|gr|grains?|mm|in|"|″|oz|°|deg)$/, '').trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?$/);
  if (!m || (m[1] == null && m[2] == null) || m[3] === '0') return null;
  const whole = m[1] == null ? 0 : Number(m[1]);
  const frac = m[2] == null ? 0 : Number(m[2]) / Number(m[3]);
  let n = whole + (whole < 0 ? -frac : frac);
  if (meta.alt && typedUnit === meta.alt.unit) n *= meta.alt.size;
  return Number.isFinite(n) ? n : null;
}

/** The canonical text stored for a number of a numeric field (clamped, rounded). */
export function storedNumber(key, n) {
  const meta = FIELD_META[key];
  const v = Math.min(meta.max, Math.max(meta.min, n));
  return formatNumber(v, meta.decimals);
}

/** A stored value shown in `unit` (the canonical one by default): { value, unit }. Text is shown as is. */
export function displayValue(key, stored, unit = null) {
  const raw = String(stored ?? '').trim();
  const meta = FIELD_META[key];
  if (!raw || !meta) return { value: raw, unit: '' };
  const n = parseFieldValue(key, raw);
  if (n == null) return { value: raw, unit: '' };
  if (meta.alt && unit === meta.alt.unit) return { value: formatNumber(n / meta.alt.size, meta.alt.decimals), unit: meta.alt.unit };
  return { value: formatNumber(n, meta.decimals), unit: meta.unit };
}

export function filledCount(fields) {
  return GEAR_KEYS.filter((k) => fields && String(fields[k] ?? '').trim()).length;
}

// ---------------------------------------------------------------- sight marks
// A setup owns its sight marks (1:1): they live in its fields as `sights`, a list of
// { id, distance, elevation, windage, note } (all text). They travel with it into sessions.

export const SIGHT_KEYS = ['distance', 'elevation', 'windage', 'note'];
export const DEFAULT_SIGHT_DISTANCES = ['18', '30', '50', '60', '70', '90'];

/** A row with a mark set (elevation or windage), not just a distance. */
export const hasMark = (m) => Boolean(String(m?.elevation ?? '').trim() || String(m?.windage ?? '').trim());

/** The distance of a mark in metres, or null ("70 m", "70m", "70" → 70). */
export function markDistance(m) {
  const n = parseInt(m?.distance, 10);
  return Number.isFinite(n) ? n : null;
}

/** The sight marks of a setup, by distance (marks without a number last). */
export function sightMarks(gear) {
  const list = Array.isArray(gear?.sights) ? gear.sights : [];
  return [...list].sort((a, b) => (markDistance(a) ?? 1e9) - (markDistance(b) ?? 1e9));
}

/** The number of rows with a mark set. */
export const markCount = (gear) => (Array.isArray(gear?.sights) ? gear.sights.filter(hasMark).length : 0);

/** The sight mark saved for a distance in metres, or null. */
export function findSightMark(gear, distance) {
  return (Array.isArray(gear?.sights) ? gear.sights : []).find((m) => markDistance(m) === distance && hasMark(m)) || null;
}

/** The default distances the setup has no row for yet (in metres, as text). */
export function missingDistances(gear) {
  const have = new Set((Array.isArray(gear?.sights) ? gear.sights : []).map(markDistance));
  return DEFAULT_SIGHT_DISTANCES.filter((d) => !have.has(Number(d)));
}

/** Windage text as a signed number of clicks: "1R" → 1, "2L" → -2, "0" → 0, "" → 0; null if unreadable. */
export function parseWindage(text) {
  const s = String(text ?? '').trim().toUpperCase();
  if (!s || s === '0') return 0;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([LR])$/) || s.match(/^([LR])\s*(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const [num, side] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  const n = Number(num.replace(',', '.'));
  return side === 'L' ? -n : n;
}

/** A signed number of clicks as windage text: 1 → "1R", -2 → "2L", 0 → "0". */
export const formatWindage = (n) => (n === 0 ? '0' : `${formatNumber(Math.abs(n), 2)}${n > 0 ? 'R' : 'L'}`);

/** The elevation as a number, or null when empty or unreadable. */
export function parseElevation(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "5.2 · 1R" for a mark ("—" for a part not set). */
export const markText = (m) => `${String(m.elevation || '').trim() || '—'} · ${String(m.windage || '').trim() || '—'}`;

/** Validation errors of a `sights` value (undefined is fine: no marks yet). */
export function sightErrors(sights) {
  if (sights == null) return [];
  if (!Array.isArray(sights)) return ['sight marks must be a list'];
  return sights.flatMap((m, i) =>
    !m || typeof m !== 'object' || typeof m.id !== 'string' || SIGHT_KEYS.some((k) => typeof m[k] !== 'string')
      ? [`sight mark ${i + 1} is invalid`]
      : [],
  );
}

/** Anything recorded in a setup: a field or a sight mark. */
export const hasGear = (gear) => filledCount(gear) > 0 || markCount(gear) > 0;

// ---------------------------------------------------------------- tuning history

export const HISTORY_MAX = 50;

/**
 * The setup with one field changed, the change recorded in its tuning history (newest last, at most
 * HISTORY_MAX kept). An unchanged value returns the setup as it is.
 */
export function withFieldChange(setup, key, to, { reason = '', at = new Date().toISOString() } = {}) {
  const from = String(setup.fields?.[key] ?? '');
  const next = String(to ?? '').trim();
  if (from.trim() === next) return setup;
  const fields = { ...setup.fields };
  if (next) fields[key] = next;
  else delete fields[key];
  const entry = { key, from, to: next, at, reason: String(reason || '').trim() };
  const history = [...(Array.isArray(setup.history) ? setup.history : []), entry].slice(-HISTORY_MAX);
  return { ...setup, fields, history };
}

/** The changes of one field, newest first. */
export const fieldHistory = (setup, key) => (Array.isArray(setup?.history) ? setup.history.filter((e) => e.key === key).reverse() : []);

/** Validation errors of a `history` value. */
export function historyErrors(history) {
  if (history == null) return [];
  if (!Array.isArray(history)) return ['history must be a list'];
  if (history.length > HISTORY_MAX) return [`history keeps at most ${HISTORY_MAX} changes`];
  return history.flatMap((e, i) =>
    !e || ['key', 'from', 'to', 'at', 'reason'].some((k) => typeof e[k] !== 'string') ? [`history entry ${i + 1} is invalid`] : [],
  );
}

// ---------------------------------------------------------------- setups

const live = (setups) => (setups || []).filter((s) => s && !s.deleted);

/**
 * The active setup: the one settings.activeSetupId names, or (when it is missing or deleted, e.g.
 * after another device deleted it) the most recently changed one. Null when there are none.
 */
export function activeSetup(settings, setups) {
  const list = live(setups);
  return (
    list.find((s) => s.id === settings?.activeSetupId) ||
    [...list].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] ||
    null
  );
}

/** The setups in list order: the active one first, the others newest first. */
export function orderedSetups(settings, setups) {
  const active = activeSetup(settings, setups);
  const others = live(setups)
    .filter((s) => s !== active)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return active ? [active, ...others] : others;
}

/** A name not taken by another setup: "My setup", "My setup 2", … */
export function uniqueName(base, setups, exceptId = null) {
  const taken = new Set(live(setups).filter((s) => s.id !== exceptId).map((s) => s.name.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i += 1;
  return `${base} ${i}`;
}

/** Finished and running sessions that used a setup (Recently deleted ones not counted). */
export const sessionsUsing = (setupId, sessions) => (sessions || []).filter((s) => !s.deleted && !s.trashedAt && s.gearSnapshotId === setupId).length;

const shown = (fields, key) => {
  const d = displayValue(key, fields?.[key]);
  return d.value ? `${d.value}${d.unit ? ` ${d.unit}` : ''}` : '';
};

/** The four values on the active setup's card: draw weight, brace height, arrows, sight mark. */
export function keyValues(setup, distance) {
  const f = setup?.fields || {};
  const arrows = [f.arrowModel, f.spine].map((v) => String(v || '').trim()).filter(Boolean).join(' · ');
  const mark = findSightMark(f, distance);
  return [
    { label: 'Draw weight', key: 'drawWeight', ...displayValue('drawWeight', f.drawWeight) },
    { label: 'Brace height', key: 'brace', ...displayValue('brace', f.brace) },
    { label: 'Arrows', key: 'arrowModel', value: arrows, unit: '' },
    { label: `Sight ${distance} m`, key: 'sights', value: mark ? markText(mark) : '', unit: '' },
  ];
}

/**
 * One line about a setup: "42 lb · brace 8.875 in · 70 m 5.8 · 0". The sight mark is the one for
 * `distance` (metres) when the setup has it, else its longest distance.
 */
export function setupSummary(setup, distance = null) {
  const f = setup?.fields || {};
  const parts = [];
  if (shown(f, 'drawWeight')) parts.push(shown(f, 'drawWeight'));
  else if (String(f.riser || '').trim()) parts.push(String(f.riser).trim());
  if (shown(f, 'brace')) parts.push(`brace ${shown(f, 'brace')}`);
  const marks = sightMarks(f).filter(hasMark);
  const mark = (distance != null && findSightMark(f, distance)) || marks[marks.length - 1];
  if (mark) parts.push(`${mark.distance} ${markText(mark)}`);
  if (parts.length < 2) parts.push(`${filledCount(f)} of ${GEAR_KEYS.length} details`);
  return parts.join(' · ');
}

/** Values other setups have for a text field (suggestions while typing), most used first. */
export function fieldSuggestions(key, setups, exceptId = null) {
  const counts = new Map();
  for (const s of live(setups)) {
    if (s.id === exceptId) continue;
    const v = String(s.fields?.[key] ?? '').trim();
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

/** Fields for a new setup started from another: a copy, sight marks with fresh ids. */
export function copyFields(fields) {
  const out = structuredClone(fields || {});
  if (Array.isArray(out.sights)) out.sights = out.sights.map((m) => ({ ...m, id: crypto.randomUUID() }));
  return out;
}

// ---------------------------------------------------------------- sessions

/**
 * Equipment choices for a session: every setup (the active one first), "as recorded" when editing a
 * session whose setup is gone, and none. Returns { options: [[value, label]], value, activeId }.
 */
export function gearChoices({ settings, setups, session = null }) {
  const list = orderedSetups(settings, setups);
  const active = list[0] && list[0] === activeSetup(settings, setups) ? list[0] : null;
  const options = [];
  let value;
  if (session) {
    const own = list.find((s) => s.id === session.gearSnapshotId);
    if (own) value = own.id;
    else if (hasGear(session.gear)) {
      options.push(['recorded', 'As recorded']);
      value = 'recorded';
    } else value = 'none';
  } else value = active ? active.id : 'none';
  for (const s of list) options.push([s.id, s.name]);
  options.push(['none', 'No equipment']);
  return { options, value, activeId: active?.id ?? null };
}

/**
 * The { gear, gearSnapshotId } a session stores for a choice: a copy of the setup's fields (its sight
 * marks included) and its id. Null for "as recorded" (keep what the session has) or an unknown id.
 */
export function gearForChoice(choice, { setups }) {
  if (choice === 'recorded') return null;
  if (choice === 'none') return { gear: null, gearSnapshotId: null };
  const s = live(setups).find((x) => x.id === choice);
  return s ? { gear: structuredClone(s.fields || {}), gearSnapshotId: s.id } : null;
}
