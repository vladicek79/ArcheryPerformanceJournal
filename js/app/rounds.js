// Competition rounds as data: World Archery target, indoor, field and 3D rounds and the IFAA rounds.
// A round is a list of passes (one distance and face, so many ends of so many arrows); a field, 3D
// or Flint round is a course: its passes are its targets, one end each, shot in whichever order the
// course is walked. Picking a round on the Shooting page fixes the session's distance, face, arrows
// per end and, where the rules prescribe one, the order the spots of a sheet are shot in; the
// running session then follows the round end by end (sessionLogic.js, session.round).
//
// Pure data and functions (unit-tested): nothing here touches the page.
import { FACES, isMultiSpot, spotLayout, defaultSpotOrder, maxArrowValue, withCompound, faceLabel } from './scoring.js';
import { DISTANCE_UNITS } from './sessionTypes.js';

/** The groups of the round picker, in its order. */
export const ROUND_GROUPS = [
  { id: 'wa-outdoor', body: 'wa', label: 'WA outdoor' },
  { id: 'wa-indoor', body: 'wa', label: 'WA indoor' },
  { id: 'wa-field', body: 'wa', label: 'WA field' },
  { id: 'ifaa', body: 'ifaa', label: 'IFAA' },
];

// ---------------------------------------------------------------- building blocks

/** A pass: `ends` ends of `arrowsPerEnd` arrows at one distance on one face. */
const pass = (distance, face, ends, arrowsPerEnd, unit = 'm') => ({ distance, unit, face, ends, arrowsPerEnd });

/**
 * A course target: one end of `arrows` arrows on one face, at one distance or, given a list, a
 * walk-up or fan: one arrow from each marker, in the list's order (IFAA: 80-70-60-50 yd).
 */
const target = (distance, face, arrows, unit = 'm') =>
  Array.isArray(distance)
    ? { ...pass(distance[0], face, 1, arrows, unit), walkUp: [...distance] }
    : pass(distance, face, 1, arrows, unit);

/** The IFAA field and hunter faces by size (IFAA By-Laws V.A, V.B): the 20 cm as a square of four. */
const IFAA_FIELD_FACE = { 20: 'if20q', 35: 'if35', 50: 'if50', 65: 'if65' };
const IFAA_HUNTER_FACE = { 20: 'ih20q', 35: 'ih35', 50: 'ih50', 65: 'ih65' };

/** An IFAA unit from its rows [face size, distance or markers' distances, unit]: four arrows each. */
const ifaaUnit = (faces, rows, arrows = 4) => rows.map(([size, d, unit = 'yd']) => target(d, faces[size], arrows, unit));

/**
 * IFAA outdoor rounds: the four 20 cm faces of a square are shot top left, top right, bottom left,
 * bottom right (By-Laws Art. IV C4; Executive Clarification 2026 #07).
 */
const IFAA_OUTDOOR_ORDER = { square: [0, 1, 2, 3] };

/** IFAA Field unit (V.A), adult distances: 14 targets, walk-ups one arrow from each marker. */
const IFAA_FIELD_UNIT = [
  [65, [80, 70, 60, 50]], [65, 65], [65, 60], [65, 55],
  [50, [45, 40, 35, 30]], [50, [35, 35, 35, 35]], [50, 50], [50, 45], [50, 40],
  [35, 30], [35, 25], [35, 20], [35, 15],
  [20, [35, 30, 25, 20], 'ft'],
];
/** IFAA Hunter unit (V.B), adult distances (two markers: two arrows from each). */
const IFAA_HUNTER_UNIT = [
  [65, [70, 65, 61, 58]], [65, [64, 59, 55, 52]], [65, [58, 53, 48, 45]],
  [50, [53, 48, 44, 41]], [50, 48], [50, 44], [50, 40], [50, [36, 36, 36, 36]],
  [35, [32, 32, 32, 32]], [35, [28, 28, 28, 28]], [35, [23, 23, 20, 20]], [35, [19, 19, 17, 17]], [35, [15, 15, 14, 14]],
  [20, 11],
];
/** IFAA International unit (V.G): 10 targets, hunter faces, three arrows each. */
const IFAA_INTERNATIONAL_UNIT = [[65, 65], [65, 60], [65, 55], [50, 50], [50, 45], [50, 40], [50, 35], [35, 30], [35, 25], [35, 20]];
/**
 * The Flint unit (V.I), in its prescribed sequence: the 35 cm face and the four 20 cm faces in turn,
 * the last end a walk-up from 30 to 15 yd. Indoors the four 20 cm faces are shot in any order (World
 * Indoor Championship rules 8e, overriding the outdoor order).
 */
const FLINT_UNIT = [[35, 25], [20, 20, 'ft'], [35, 30], [20, 15], [35, 20], [20, 10], [35, [30, 25, 20, 15]]];

/** The indoor faces each bow may shoot (WA Book 2 7.2.2, Book 3 11.x): the first is the default. */
const INDOOR_40 = { recurve: ['40t', '40v', '40'], compound: ['40tc', '40vc'] };
const INDOOR_60 = { recurve: ['60t', '60v', '60'], compound: ['60tc', '60vc'] };

/**
 * A 720 round: 72 arrows at one distance in ends of 6 (WA Book 2 4.5.1.1). `faces`: the faces the
 * round allows per bow type, the first the default.
 */
const r720 = (id, name, distance, faces, bowType = null) => ({
  id,
  name,
  group: 'wa-outdoor',
  ...(bowType ? { bowType } : {}),
  passes: [{ ...pass(distance, null, 12, 6), faces }],
});

/** WA field faces by size (WA Book 2 7.3.1): the 20 cm faces as a column of three, one arrow each. */
const WA_FIELD_FACE = { 20: 'f20t', 40: 'f40', 60: 'f60', 80: 'f80' };

/**
 * A marked WA field unit (WA Book 2 4.5.2.2): three targets for each face size at the peg's
 * distances, three arrows each.
 */
const waFieldUnit = (distances) =>
  Object.entries(distances).flatMap(([size, ds]) => ds.map((d) => target(d, WA_FIELD_FACE[size], 3)));

/** The marked unit's distances per peg and face size, metres. */
const WA_FIELD_PEGS = {
  red: { 20: [10, 15, 20], 40: [20, 25, 30], 60: [35, 40, 45], 80: [50, 55, 60] },
  blue: { 20: [5, 10, 15], 40: [15, 20, 25], 60: [30, 35, 40], 80: [40, 45, 50] },
  yellow: { 20: [5, 10, 15], 40: [10, 15, 20], 60: [20, 25, 30], 80: [30, 35, 40] },
};

/** The unmarked unit's distance ranges per peg and face size, metres (WA Book 2 4.5.2.2). */
const WA_FIELD_UNMARKED = {
  red: { 20: [10, 15], 40: [15, 25], 60: [20, 35], 80: [35, 55] },
  blue: { 20: [5, 10], 40: [10, 20], 60: [15, 30], 80: [30, 45] },
  yellow: { 20: [5, 10], 40: [10, 15], 60: [15, 25], 80: [20, 35] },
};
/** An unmarked unit has 2 to 4 targets of each face size, 12 in all. */
export const UNMARKED_PER_FACE = [2, 4];

/**
 * An unmarked WA field unit (WA Book 2 4.5.2.2): 12 targets of three arrows whose distances are not
 * known. At each the archer records the face found there and the distance estimated, within that
 * face's range. `unit`: which unit of the round it is (its faces are counted per unit). The targets
 * start as three of each size at mid-range, as a guess the archer corrects target by target.
 */
const waFieldUnmarkedUnit = (ranges, unit) => {
  const faces = Object.entries(ranges).map(([size, [min, max]]) => ({ face: WA_FIELD_FACE[size], min, max }));
  return faces.flatMap((f) =>
    Array.from({ length: 3 }, () => ({ ...target(Math.round((f.min + f.max) / 2), f.face, 3), unmarked: { unit, faces } })),
  );
};

/**
 * A WA field round for a peg: two units of 12 targets, both marked, both unmarked, or one of each
 * (the archer picks: `variants`).
 */
const waField = (peg, label) => {
  const marked = waFieldUnit(WA_FIELD_PEGS[peg]);
  const unmarked = (unit) => waFieldUnmarkedUnit(WA_FIELD_UNMARKED[peg], unit);
  const variants = [
    { id: 'marked', label: 'Marked', passes: [...marked, ...marked] },
    { id: 'unmarked', label: 'Unmarked', passes: [...unmarked(0), ...unmarked(1)] },
    { id: 'mixed', label: 'Marked + unmarked', passes: [...marked, ...unmarked(1)] },
  ];
  return { id: `wa-field-${peg}`, name: `WA field · ${label}`, group: 'wa-field', course: true, variants, passes: variants[0].passes };
};

// ---------------------------------------------------------------- the catalogue

/**
 * The rounds, by group. Keys of a round:
 *   id, name   `name` is what a competition stores as its round (earlier sessions stored the WA
 *              target rounds' names: they stay the same)
 *   group      the picker's group (ROUND_GROUPS)
 *   bowType    the round is for one bow type only (the session takes it)
 *   course     its passes are targets of a course, shot in any order (field, 3D, Flint)
 *   passes     { distance, unit, face, ends, arrowsPerEnd }; `faces` instead of `face`: the faces
 *              allowed per bow type, the first the default (the archer picks among them)
 *   variants   the forms the round comes in ({ id, label, passes }, the first the default), picked
 *              by the archer: a WA field round's marked, unmarked or mixed units
 *   spotOrders the order the spots of a sheet must be shot in, per sheet layout (triple, vegas,
 *              square), where the rules prescribe one; elsewhere the archer chooses
 */
export const ROUND_CATALOGUE = [
  // WA outdoor (Book 2 4.5.1.1; Book 6 48.1)
  r720('wa-70', 'WA 70 m', 70, { recurve: ['122'] }, 'recurve'),
  r720('wa-60', 'WA 60 m', 60, { recurve: ['122'] }, 'recurve'),
  r720('wa-50c', 'WA 50 m compound', 50, { compound: ['80r'] }, 'compound'),
  r720('wa-50b', 'WA 50 m barebow', 50, { recurve: ['122'] }, 'recurve'),
  // U15: recurve 122 cm, compound 80 cm
  r720('wa-40', 'WA 40 m', 40, { recurve: ['122'], compound: ['80'] }),
  r720('wa-30b', 'WA 30 m barebow U15', 30, { recurve: ['122'] }, 'recurve'),
  {
    id: 'wa-1440',
    name: 'WA 1440',
    group: 'wa-outdoor',
    passes: [pass(90, '122', 6, 6), pass(70, '122', 6, 6), pass(50, '80', 12, 3), pass(30, '80', 12, 3)],
  },
  {
    id: 'wa-1440-w',
    name: 'WA 1440 · 70/60/50/30',
    group: 'wa-outdoor',
    passes: [pass(70, '122', 6, 6), pass(60, '122', 6, 6), pass(50, '80', 12, 3), pass(30, '80', 12, 3)],
  },
  {
    id: 'wa-1440-u18w',
    name: 'WA 1440 · 60/50/40/30',
    group: 'wa-outdoor',
    passes: [pass(60, '122', 6, 6), pass(50, '80', 12, 3), pass(40, '80', 12, 3), pass(30, '80', 12, 3)],
  },
  {
    // the Standard Bow round (Book 6 48.1.10): ends of three
    id: 'wa-standard',
    name: 'WA Standard',
    group: 'wa-outdoor',
    passes: [pass(50, '122', 12, 3), pass(30, '122', 12, 3)],
  },
  {
    id: 'wa-900',
    name: 'WA 900',
    group: 'wa-outdoor',
    passes: [pass(60, '122', 5, 6), pass(50, '122', 5, 6), pass(40, '122', 5, 6)],
  },
  // WA indoor (Book 2 4.5.1.3)
  { id: 'wa-18', name: 'WA 18 m', group: 'wa-indoor', passes: [{ ...pass(18, null, 20, 3), faces: INDOOR_40 }] },
  { id: 'wa-25', name: 'WA 25 m', group: 'wa-indoor', passes: [{ ...pass(25, null, 20, 3), faces: INDOOR_60 }] },
  {
    id: 'wa-25-18',
    name: 'WA 25 + 18 m',
    group: 'wa-indoor',
    passes: [
      { ...pass(25, null, 20, 3), faces: INDOOR_60 },
      { ...pass(18, null, 20, 3), faces: INDOOR_40 },
    ],
  },
  // WA field (Book 2 4.5.2): the marked units (an unmarked unit's distances are not known)
  waField('red', 'red peg'),
  waField('blue', 'blue peg'),
  waField('yellow', 'yellow peg'),
  // IFAA (By-Laws Art. V), adult distances: courses of two units, the targets in any order
  {
    id: 'ifaa-field',
    name: 'IFAA field',
    group: 'ifaa',
    course: true,
    spotOrders: IFAA_OUTDOOR_ORDER,
    passes: [...ifaaUnit(IFAA_FIELD_FACE, IFAA_FIELD_UNIT), ...ifaaUnit(IFAA_FIELD_FACE, IFAA_FIELD_UNIT)],
  },
  {
    id: 'ifaa-hunter',
    name: 'IFAA hunter',
    group: 'ifaa',
    course: true,
    spotOrders: IFAA_OUTDOOR_ORDER,
    passes: [...ifaaUnit(IFAA_HUNTER_FACE, IFAA_HUNTER_UNIT), ...ifaaUnit(IFAA_HUNTER_FACE, IFAA_HUNTER_UNIT)],
  },
  {
    id: 'ifaa-international',
    name: 'IFAA international',
    group: 'ifaa',
    course: true,
    passes: [...ifaaUnit(IFAA_HUNTER_FACE, IFAA_INTERNATIONAL_UNIT, 3), ...ifaaUnit(IFAA_HUNTER_FACE, IFAA_INTERNATIONAL_UNIT, 3)],
  },
  {
    // its sequence is fixed: a course whose targets follow one another (an archer may start on any)
    id: 'ifaa-flint',
    name: 'IFAA Flint indoor',
    group: 'ifaa',
    course: true,
    passes: [...ifaaUnit(IFAA_FIELD_FACE, FLINT_UNIT), ...ifaaUnit(IFAA_FIELD_FACE, FLINT_UNIT)],
  },
];

/** The rounds offered as chips, by name (what earlier sessions stored). */
export const ROUND_NAMES = ROUND_CATALOGUE.map((r) => r.name);

export const roundById = (id) => ROUND_CATALOGUE.find((r) => r.id === id) || null;
export const roundByName = (name) => ROUND_CATALOGUE.find((r) => r.name === name) || null;

/** The rounds of a picker group. */
export const roundsOf = (group) => ROUND_CATALOGUE.filter((r) => r.group === group);

// ---------------------------------------------------------------- faces and bow types

/** The bow type a round is shot with: its own, else the archer's. */
export const roundBowType = (round, bowType) => round.bowType || (bowType === 'compound' ? 'compound' : 'recurve');

/**
 * The faces a pass allows for a bow type, the default first: its `faces` for the bow (a round with
 * one list for recurve only: that list), else its one face, scored with the inner 10 for a compound
 * where the face has that version.
 */
export function passFaces(p, bowType) {
  if (p.faces) return p.faces[bowType] || p.faces.recurve || Object.values(p.faces)[0];
  return [bowType === 'compound' ? withCompound(p.face, true) : p.face];
}

/**
 * The face choices a round offers (a list per bow type when any pass allows more than one face):
 * e.g. the indoor triple, the triangular triple or the single face. Null when every pass has one.
 */
export function faceChoices(round, bowType) {
  const b = roundBowType(round, bowType);
  const p = round.passes.find((x) => passFaces(x, b).length > 1);
  return p ? passFaces(p, b) : null;
}

/** The face the archer picked for a pass, when it allows it (by its layout: triple, Vegas, single), else the default. */
function pickFace(p, bowType, choice) {
  const list = passFaces(p, bowType);
  if (choice == null) return list[0];
  const want = spotLayout(choice);
  return list.find((f) => f === choice) || list.find((f) => spotLayout(f) === want) || list[0];
}

// ---------------------------------------------------------------- the plan a session follows

/**
 * The spot order a round prescribes for a face, or null where the archer chooses (WA indoor: the
 * spots of a triple are shot in any order).
 */
export function prescribedSpotOrder(round, face) {
  if (!isMultiSpot(face)) return null;
  const o = round?.spotOrders?.[spotLayout(face)];
  return o ? [...o] : null;
}

/** Whether a round prescribes the spot order of any of its sheets. */
export const prescribesSpotOrder = (round) => !!round?.spotOrders && Object.keys(round.spotOrders).length > 0;

/**
 * What a session follows when it is shot to `round` (stored as session.round): its id and name,
 * whether it is a course, and one entry per end, in order: the end's distance (and unit), face,
 * arrows and the spot order the round prescribes (none: the archer's). `bowType`: the archer's (a
 * compound shoots the indoor faces with the inner 10); `face`: a face the archer picked among those
 * the round allows (faceChoices).
 */
export function roundPlan(round, { bowType = 'recurve', face = null, variant = null } = {}) {
  const b = roundBowType(round, bowType);
  const v = roundVariant(round, variant);
  const ends = (v?.passes || round.passes).flatMap((p, i) => {
    const f = pickFace(p, b, face);
    const order = prescribedSpotOrder(round, f);
    const one = {
      distance: p.distance,
      distanceUnit: p.unit,
      face: f,
      arrowsPerEnd: p.arrowsPerEnd,
      pass: i,
      ...(p.walkUp ? { walkUp: [...p.walkUp] } : {}),
      ...(p.unmarked ? { unmarked: structuredClone(p.unmarked) } : {}),
      ...(order ? { spotOrder: order } : {}),
    };
    return Array.from({ length: p.ends }, () => structuredClone(one));
  });
  // a variant other than the default is named ("WA field · red peg · unmarked")
  const name = v && v !== round.variants[0] ? `${round.name} · ${v.label.toLowerCase()}` : round.name;
  return { id: round.id, name, ...(v ? { variant: v.id } : {}), ...(round.course ? { course: true } : {}), bowType: b, ends };
}

/** The variant of a round picked (by id), else its first; null for a round without variants. */
export function roundVariant(round, id) {
  if (!round?.variants) return null;
  return round.variants.find((v) => v.id === id) || round.variants[0];
}

// ---------------------------------------------------------------- unmarked targets

/** The face options of an unmarked target ({ face, min, max }), or null on a marked one. */
export const unmarkedFaces = (t) => t?.unmarked?.faces || null;

/** An unmarked target's range for a face ({ face, min, max }), or null when it does not offer the face. */
export const unmarkedRange = (t, face) => unmarkedFaces(t)?.find((f) => f.face === face) || null;

/**
 * What is wrong with an end's face and distance on an unmarked target (the archer's record of the
 * face found and the distance estimated): a face it does not offer, a distance out of that face's
 * range. Empty on a marked target, or when the end keeps the target's own.
 */
export function estimateErrors(t, end, where) {
  if (!t?.unmarked || (end?.face == null && end?.distance == null)) return [];
  const range = unmarkedRange(t, end.face ?? t.face);
  if (!range) return [`${where}: a face the unmarked target does not have`];
  const d = end.distance ?? t.distance;
  return Number.isFinite(d) && d >= range.min && d <= range.max ? [] : [`${where}: an estimate out of the face's range`];
}

/** Arrows and the highest score of a round (or a plan): each arrow at its face's best value. */
export function roundTotals(roundOrPlan, bowType = 'recurve') {
  const ends = roundOrPlan.ends || roundPlan(roundOrPlan, { bowType }).ends;
  return ends.reduce(
    (t, e) => ({ arrows: t.arrows + e.arrowsPerEnd, max: t.max + e.arrowsPerEnd * maxArrowValue(e.face) }),
    { arrows: 0, max: 0 },
  );
}

/** "18 m", "20 ft"; a walk-up or fan "80-70-60-50 yd"; an unmarked target's estimate "≈25 m". */
export const targetDistance = (t) => `${t.unmarked ? '≈' : ''}${t.walkUp ? t.walkUp.join('-') : t.distance} ${t.distanceUnit}`;

/** "20 cm 10–15 m, 40 cm 15–25 m, …": the faces and distance ranges of an unmarked target. */
export const unmarkedRanges = (t) =>
  unmarkedFaces(t)
    .map((f) => `${FACES[f.face].size} cm ${f.min}–${f.max} ${t.distanceUnit}`)
    .join(', ');

/**
 * A plan's passes for a summary: consecutive ends of one distance and face as one line, with how
 * many ends of how many arrows ("90 m · 122 cm · WA 10-ring · 6 × 6"). A course lists its targets
 * by distance and face, counted ("10 m · 20 cm · WA field vertical triple · 2 targets").
 */
export function planLines(plan) {
  const lines = [];
  for (const e of plan.ends) {
    const key = e.unmarked ? `Unmarked · ${unmarkedRanges(e)}` : `${targetDistance(e)} · ${faceLabel(e.face)}`;
    const last = lines[lines.length - 1];
    const same = plan.course ? lines.find((l) => l.key === key && l.arrows === e.arrowsPerEnd) : last?.key === key && last.arrows === e.arrowsPerEnd && last;
    if (same) same.count += 1;
    else lines.push({ key, arrows: e.arrowsPerEnd, count: 1 });
  }
  return lines.map((l) =>
    plan.course
      ? `${l.key} · ${l.count} ${l.count === 1 ? 'target' : 'targets'} × ${l.arrows}`
      : `${l.key} · ${l.count} × ${l.arrows}`,
  );
}

/** "72 arrows · max 720", and the distances of a round shot at several ("90 + 70 + 50 + 30 m"). */
export function roundHint(plan) {
  const { arrows, max } = roundTotals(plan);
  const ds = [...new Set(plan.ends.map((e) => targetDistance(e)))];
  const distances = plan.course ? `${plan.ends.length} targets` : ds.length > 1 ? ds.join(' + ') : '';
  return [distances, `${arrows} arrows`, `max ${max}`].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- validation

const isStr = (v) => typeof v === 'string';

/** What is wrong with a session's stored round (empty when nothing). */
export function roundErrors(r) {
  if (!r || typeof r !== 'object' || !isStr(r.id) || !isStr(r.name)) return ['invalid round'];
  if (!Array.isArray(r.ends) || !r.ends.length) return ['round: no ends'];
  const errs = [];
  r.ends.forEach((e, i) => {
    const where = `round end ${i + 1}`;
    if (!e || typeof e !== 'object') return errs.push(`${where}: invalid`);
    if (!(Number.isFinite(e.distance) && e.distance > 0)) errs.push(`${where}: invalid distance`);
    if (!DISTANCE_UNITS.includes(e.distanceUnit)) errs.push(`${where}: invalid distance unit`);
    if (!(e.face in FACES)) errs.push(`${where}: invalid face`);
    if (e.unmarked != null) {
      const fs = e.unmarked.faces;
      const ok =
        Number.isInteger(e.unmarked.unit) &&
        Array.isArray(fs) &&
        fs.length > 0 &&
        fs.every((f) => f && f.face in FACES && Number.isFinite(f.min) && Number.isFinite(f.max) && f.min > 0 && f.min <= f.max);
      if (!ok) errs.push(`${where}: invalid unmarked faces`);
    }
    if (!(Number.isInteger(e.arrowsPerEnd) && e.arrowsPerEnd >= 1 && e.arrowsPerEnd <= 12)) errs.push(`${where}: invalid arrows`);
    if (e.spotOrder != null) {
      const def = defaultSpotOrder(e.face);
      const ok = Array.isArray(e.spotOrder) && e.spotOrder.length === def.length && def.every((s) => e.spotOrder.includes(s));
      if (!ok) errs.push(`${where}: invalid spot order`);
    }
  });
  return errs;
}
