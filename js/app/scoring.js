// Scoring rules (HANDOFF §5). Pure functions, unit-tested.
//
// Every face is data (FACES below): its printed rings, its spots and how it is scored. Everything
// else (ring edges, scoring zones, keypad, colours, labels) is derived from that one entry.

export const DISTANCES = [7, 10, 18, 25, 30, 40, 50, 60, 70, 90];
export const ARROWS_PER_END_MIN = 1;
export const ARROWS_PER_END_MAX = 12;
export const DEFAULT_ARROWS_PER_END = 3;
export const isValidArrowsPerEnd = (n) => Number.isInteger(n) && n >= ARROWS_PER_END_MIN && n <= ARROWS_PER_END_MAX;
// 11: the inner ring of a 3D animal's kill zone (WA 3D rounds score 11, 10, 8, 5 and the miss)
export const ARROW_VALUES = ['X', 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'M'];
export const GRADES = [1, 2, 3, 4, 5];

/**
 * Three-spot sheets: spot centres in face units (one spot's radius = 100). Triple: three spots in a
 * column, top to bottom. Vegas: a triangle, top then bottom left, bottom right. Centres are 1.1 spot
 * diameters apart (22 cm on the 40 cm sheet, whose spots are 20 cm across; the 60 cm sheet scales).
 */
const TRIPLE = [
  [0, -220],
  [0, 0],
  [0, 220],
];
/**
 * The IFAA 20 cm faces (Archers' Handbook 2021–22, General rules for field archery 2 and 7): a butt
 * holds 16 in a 4 × 4 grid and each archer shoots a square of four, one arrow at each, top left,
 * top right, bottom left, bottom right. Centres 1.1 spot diameters apart, as on the other sheets.
 */
const SQUARE = [
  [-110, -110],
  [110, -110],
  [-110, 110],
  [110, 110],
];
const VEGAS = [
  [0, -127],
  [-110, 63],
  [110, 63],
];

/**
 * The faces, by id. `low`: the lowest printed ring (1 on a full face, 6 on a 10–6 spot, 5 on the WA
 * 6-ring face); the printed rings 10…low are of equal width and fill the face's radius, and the X
 * ring is half a ring wide. `spots`: the spot centres of a multi-spot sheet. `compound`: scored with
 * the WA compound inner 10 (WA Book 2 7.2.2.3: only the X ring scores 10, the rest of the 10 ring
 * scores 9, and there is no X). `setup`: offered for a new session; the others stay valid for the
 * sessions that have them. `kind`: the face's type in the setup's catalogue (setupFaces.js).
 *
 * Faces not ringed 10 to `low`:
 * - `rings` (the field and hunter faces): printed rings of their own, from the centre out, each
 *   with its outer edge (a fraction of the radius), value and colour; `xEdge` their X ring, printed
 *   but scored as the zone it lies in (null: none). Neighbouring rings of one value are one zone.
 *   - WA field (WA Book 4): six zones, 6 and 5 gold, 4 to 1 black; the 6 zone a tenth of the
 *     radius, the 5 zone a fifth, then 4, 3, 2, 1 each a fifth more.
 *   - NFAA field (NFAA Constitution 2026/27, Art. VI A.2) and IFAA field (IFAA Archers' Handbook
 *     2021–22): 65, 50, 35, 20 cm; the 5 spot black (a fifth of the diameter, its X a tenth), two
 *     white rings scoring 4 out to 3/5, two black rings scoring 3. NFAA pros score the X as 6 and
 *     everyone else uses it for ties only: here it scores 5.
 *   - NFAA hunter (Art. VI B.2) and IFAA hunter: the same sizes and scores, all black with a white
 *     5 spot; NFAA prints a black X in it, IFAA none.
 * - `animal`: a 3D animal target, scored 11, 10, 8, 5 by the zone the arrow is in. It has no rings,
 *   so its arrows are scored with the keypad only (no position, no scan) and it has no size.
 */
/** The WA field face: its rings from the centre out (edge: a fraction of the radius) and X ring. */
const WA_FIELD = {
  rings: [
    { edge: 0.1, value: 6, colour: 'gold' },
    { edge: 0.2, value: 5, colour: 'gold' },
    { edge: 0.4, value: 4, colour: 'black' },
    { edge: 0.6, value: 3, colour: 'black' },
    { edge: 0.8, value: 2, colour: 'black' },
    { edge: 1, value: 1, colour: 'black' },
  ],
  xEdge: 0.05,
};
/** The NFAA / IFAA field face: X 6.5, spot 13, white rings 26 and 39, black rings 52 and 65 (on 65 cm). */
const NFAA_FIELD = {
  rings: [
    { edge: 0.2, value: 5, colour: 'black' },
    { edge: 0.4, value: 4, colour: 'white' },
    { edge: 0.6, value: 4, colour: 'white' },
    { edge: 0.8, value: 3, colour: 'black' },
    { edge: 1, value: 3, colour: 'black' },
  ],
  xEdge: 0.1,
};
/** The NFAA hunter face: X 6.5, white spot 13, inner black ring 39, outer black ring 65 (on 65 cm). */
const NFAA_HUNTER = {
  rings: [
    { edge: 0.2, value: 5, colour: 'white' },
    { edge: 0.6, value: 4, colour: 'black' },
    { edge: 1, value: 3, colour: 'black' },
  ],
  xEdge: 0.1,
};
/** The NFAA and IFAA field and hunter face sizes, cm. */
const NFAA_SIZES = [65, 50, 35, 20];

const PLAIN_FACES = {
  40: { size: 40, low: 1, kind: 'full', setup: true },
  '40s': { size: 40, low: 6, kind: 'six', setup: true },
  '40t': { size: 40, low: 6, kind: 'triple', spots: TRIPLE, setup: true },
  '40v': { size: 40, low: 6, kind: 'vegas', spots: VEGAS, setup: true },
  60: { size: 60, low: 1, kind: 'full', setup: true },
  '60s': { size: 60, low: 6, kind: 'six', setup: true },
  // the 60 cm vertical and triangular triple faces (WA Book 2, 7.2.2)
  '60t': { size: 60, low: 6, kind: 'triple', spots: TRIPLE, setup: true },
  '60v': { size: 60, low: 6, kind: 'vegas', spots: VEGAS, setup: true },
  80: { size: 80, low: 1, kind: 'full', setup: true },
  // the WA 80 cm 6-ring face (rings 10 to 5), used for the 50 m compound round
  '80r': { size: 80, low: 5, kind: 'ring6', setup: true },
  // the centre of the 80 cm face printed out to the 6 ring: not a WA face, kept for older sessions
  '80s': { size: 80, low: 6, kind: 'six' },
  122: { size: 122, low: 1, kind: 'full', setup: true },
  f20: { size: 20, kind: 'field', ...WA_FIELD, setup: true },
  // the 20 cm field faces as WA sets them (Book 4, 21.4): columns of three, one arrow at each
  f20t: { size: 20, kind: 'fieldTriple', ...WA_FIELD, spots: TRIPLE, setup: true },
  f40: { size: 40, kind: 'field', ...WA_FIELD, setup: true },
  f60: { size: 60, kind: 'field', ...WA_FIELD, setup: true },
  f80: { size: 80, kind: 'field', ...WA_FIELD, setup: true },
  // NFAA and IFAA field and hunter faces: 'nf65' (NFAA field), 'if50' (IFAA field), 'nh35' (NFAA
  // hunter), 'ih20' (IFAA hunter)
  ...Object.fromEntries(
    [
      ['nf', 'nfaaField', NFAA_FIELD],
      ['if', 'ifaaField', NFAA_FIELD],
      ['nh', 'nfaaHunter', NFAA_HUNTER],
      ['ih', 'ifaaHunter', { ...NFAA_HUNTER, xEdge: null }],
    ].flatMap(([prefix, kind, rings]) =>
      NFAA_SIZES.map((size) => [`${prefix}${size}`, { size, kind, ...rings, setup: true }]),
    ),
  ),
  // the IFAA 20 cm faces as they are set up: a square of four, one arrow at each
  if20q: { size: 20, kind: 'ifaaField4', ...NFAA_FIELD, spots: SQUARE, setup: true },
  ih20q: { size: 20, kind: 'ifaaHunter4', ...NFAA_HUNTER, xEdge: null, spots: SQUARE, setup: true },
  '3d': { size: null, kind: 'animal', animal: true, setup: true },
};

/** The 3D animal's scoring zones, best first (no edges: they are not rings). */
const ANIMAL_VALUES = [11, 10, 8, 5];
/** Chip colours of the 3D values (the animal has no printed colours; the app's zone colours are reused). */
const ANIMAL_COLOUR = { 11: 'gold', 10: 'gold', 8: 'red', 5: 'blue' };

/** The indoor faces also come in a compound version (WA "-C" faces): the same id with a 'c'. */
const COMPOUND_OF = ['40', '40s', '40t', '40v', '60', '60s', '60t', '60v'];
/** Only the 40 cm compound faces are offered for a new session; the 60 cm ones stay for old sessions. */
const COMPOUND_SETUP_SIZE = 40;

export const FACES = {
  ...PLAIN_FACES,
  ...Object.fromEntries(
    COMPOUND_OF.map((id) => {
      const plain = PLAIN_FACES[id];
      return [`${id}c`, { ...plain, compound: true, setup: !!plain.setup && plain.size === COMPOUND_SETUP_SIZE }];
    }),
  ),
};

export const FACE_IDS = Object.keys(FACES);
/** Faces offered for a new session. */
export const SETUP_FACES = FACE_IDS.filter((id) => FACES[id].setup);

/** A face no longer offered, and the one a new session gets instead. */
export const REPLACED_FACES = { '80s': '80r', '60c': '60', '60sc': '60s', '60tc': '60t', '60vc': '60v' };

const faceOf = (face) => FACES[face] || FACES['122'];

/** A field or hunter face (WA, NFAA, IFAA): rings of its own, not the WA target face's. */
export const isFieldFace = (face) => !!faceOf(face).rings;
/** A 3D animal: scored with the keypad only (its arrows have no position). */
export const isAnimalFace = (face) => !!faceOf(face).animal;
/** Whether arrows can be placed on the face (tapped on it, plotted): every face but the 3D animal. */
export const canPlaceArrows = (face) => !isAnimalFace(face);
/** Whether the photo scan knows the face: the WA target faces (their 10-ring colours), not field or 3D. */
export const canScanFace = (face) => !isFieldFace(face) && !isAnimalFace(face);
/** The best score of one arrow: 6 on a WA field face, 5 on an NFAA / IFAA one, 11 on a 3D animal, else 10. */
export const maxArrowValue = (face) => {
  const f = faceOf(face);
  return f.rings ? f.rings[0].value : f.animal ? 11 : 10;
};

/**
 * The real radius, in cm, of one spot's 100 face units (its outermost printed ring): the rings are
 * size / 20 wide (2 cm on a 40 cm face), and the spot is printed from the 10 out to its lowest ring.
 * 122 cm face: 61; 40 cm triple: 10; WA 80 cm 6-ring face: 24.
 */
export function spotRadiusCm(face) {
  const f = faceOf(face);
  if (f.animal) return null;
  if (f.rings) return f.size / 2;
  return ((11 - f.low) * f.size) / 20;
}

/** Whether a face is scored with the WA compound inner 10. */
export const isCompoundFace = (face) => !!faceOf(face).compound;

/**
 * The compound or the standard version of a face, for a new session; the face itself when that
 * version is not offered (a 60 cm face has no compound version for a new session).
 */
export function withCompound(face, compound) {
  const plain = String(face).replace(/c$/, '');
  const id = compound ? `${plain}c` : plain;
  return id in FACES && (!compound || FACES[id].setup) ? id : face;
}

/** Smart defaults: picking a distance suggests the usual face (arrows per end stay as set). */
export const DISTANCE_DEFAULTS = {
  7: { face: '80' },
  10: { face: '80' },
  18: { face: '40t' },
  25: { face: '60' },
  30: { face: '80' },
  40: { face: '122' },
  50: { face: '122' },
  60: { face: '122' },
  70: { face: '122' },
  90: { face: '122' },
};

/** The faces' names by kind, each with its standard (the setup's catalogue; setupFaces.js groups them). */
export const FACE_NAMES = {
  full: 'WA 10-ring',
  ring6: 'WA 6-ring',
  six: 'WA single spot',
  triple: 'WA vertical triple',
  // the 10–6 spots in a triangle, one at the top: the Vegas 3-spot, as archers call it (WA Book 2,
  // 7.2.2: the triangular triple face; NFAA: the Vegas 3 spot face)
  vegas: 'Vegas 3-spot',
  field: 'WA field',
  fieldTriple: 'WA field vertical triple',
  nfaaField: 'NFAA field',
  ifaaField: 'IFAA field',
  nfaaHunter: 'NFAA hunter',
  ifaaHunter: 'IFAA hunter',
  ifaaField4: 'IFAA field 4-spot',
  ifaaHunter4: 'IFAA hunter 4-spot',
  animal: 'WA 3D animal',
};

/** "40 cm · WA vertical triple" ("· compound" on an inner-10 face); "WA 3D animal" (no size). */
export function faceLabel(face) {
  const f = FACES[face];
  if (!f) return `${face} cm`;
  if (f.animal) return FACE_NAMES.animal;
  return `${f.size} cm · ${FACE_NAMES[f.kind]}${f.compound ? ' · compound' : ''}`;
}

/** Faces printed only to an inner ring (10–6 spots, the 6-ring face): scored from 10 to their lowest ring. */
export function isSpotFace(face) {
  return faceOf(face).low > 1;
}

/** Number of printed scoring rings of a face (10 to its lowest ring). */
const ringCount = (face) => 11 - faceOf(face).low;

/**
 * The printed rings of a face from the centre out: each ring's outer edge (a fraction of the
 * radius), the value it scores and its colour. None on a 3D animal.
 */
export function printedRings(face) {
  const f = faceOf(face);
  if (f.animal) return [];
  if (f.rings) return f.rings.map((r) => ({ ...r }));
  const n = ringCount(face);
  return Array.from({ length: n }, (_, k) => ({ edge: (k + 1) / n, value: 10 - k, colour: zoneOf(10 - k) }));
}

export const SPOT_CENTRES = Object.fromEntries(FACE_IDS.filter((id) => FACES[id].spots).map((id) => [id, FACES[id].spots]));

export function isMultiSpot(face) {
  return face in SPOT_CENTRES;
}

/** Centres of the spots on a sheet; a single face has one at the origin. */
export function spotCentres(face) {
  return SPOT_CENTRES[face] || [[0, 0]];
}

/** The layout of a multi-spot sheet ('triple' or 'vegas'), null on a single face. */
export function spotLayout(face) {
  const spots = FACES[face]?.spots;
  return spots === TRIPLE ? 'triple' : spots === VEGAS ? 'vegas' : spots === SQUARE ? 'square' : null;
}

/** What the archer calls each spot of a sheet, in spot order (index = spot). */
const SPOT_NAMES = {
  triple: ['Top', 'Middle', 'Bottom'],
  vegas: ['Top', 'Left', 'Right'],
  square: ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
};
/** Short names where the first letters would repeat (the square's T T B B). */
const SPOT_SHORT = { square: ['TL', 'TR', 'BL', 'BR'] };

/** The spots' short names, in spot order: "T M B" on a triple, "TL TR BL BR" on the 4-spot square. */
export const spotShortNames = (face) => SPOT_SHORT[spotLayout(face)] || spotNames(face).map((n) => n[0]);

export const spotNames = (face) => SPOT_NAMES[spotLayout(face)] || [];

/** The order the spots are shot in when the archer has not chosen one: as the sheet lists them. */
export const defaultSpotOrder = (face) => spotNames(face).map((_, i) => i);

const permutations = (xs) =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

/** Every order the spots of a sheet can be shot in, the default first. Empty on a single face. */
export const spotOrders = (face) => (isMultiSpot(face) ? permutations(defaultSpotOrder(face)) : []);

/**
 * A stored spot order, checked: a permutation of the sheet's spots, else the default. On a single
 * face there is none (null).
 */
export function spotOrderOf(face, order) {
  if (!isMultiSpot(face)) return null;
  const def = defaultSpotOrder(face);
  const ok = Array.isArray(order) && order.length === def.length && def.every((i) => order.includes(i));
  return ok ? [...order] : def;
}

export const isDefaultSpotOrder = (face, order) => spotOrderOf(face, order).every((s, i) => s === i);

/** "Top → Middle → Bottom". */
export const spotOrderLabel = (face, order) => {
  const names = spotNames(face);
  // a single face has no spot order: no label
  return (spotOrderOf(face, order) || []).map((i) => names[i]).join(' → ');
};

/** A stable key of an order ("0-1-2"), for pills and data-fk. */
export const spotOrderKey = (order) => (order || []).join('-');

/**
 * The spot suggested for the arrow in slot `cursor` of an end on a multi-spot sheet (a hint only: any
 * spot can be shot at). Spots are shot in `order` (the archer's choice; default: as the sheet lists
 * them), each taking its share of the end's arrows (two each for 6 arrows on 3 spots): the suggestion
 * is the first spot in the order that has fewer than its share, so the arrows go spot by spot (left,
 * left, top, top, right, right); one arrow per spot when the end has as many arrows as spots. An
 * earlier slot with no spot (scored on the keypad, or still empty) counts as the spot it would have
 * been suggested; the selected arrow itself does not count. Null on a single face.
 */
export function suggestedSpot(face, arrows, cursor, order = null) {
  if (!isMultiSpot(face)) return null;
  const seq = spotOrderOf(face, order);
  const counts = new Map(seq.map((s) => [s, 0]));
  const share = Math.max(1, Math.ceil(arrows.length / seq.length));
  // the first spot of the order short of its share (all full: the one shot least, first in the order)
  const least = () => {
    const open = seq.find((s) => counts.get(s) < share);
    if (open != null) return open;
    const min = Math.min(...counts.values());
    return seq.find((s) => counts.get(s) === min);
  };
  arrows.forEach((a, i) => {
    if (i === cursor) return;
    const spot = a.spot != null && counts.has(a.spot) ? a.spot : i < cursor ? least() : null;
    if (spot != null) counts.set(spot, counts.get(spot) + 1);
  });
  return least();
}

/**
 * Which spot a point on the sheet belongs to (the nearest centre). `sx`, `sy` are sheet coordinates
 * normalised to one spot's radius. Returns the position relative to that spot's centre, which is what
 * is stored and scored; `spot` is null on single faces.
 */
export function locateOnSheet(sx, sy, face) {
  const centres = spotCentres(face);
  let best = 0;
  centres.forEach(([cx, cy], i) => {
    const [bx, by] = centres[best];
    if (Math.hypot(sx - cx / 100, sy - cy / 100) < Math.hypot(sx - bx / 100, sy - by / 100)) best = i;
  });
  const [cx, cy] = centres[best];
  return { spot: isMultiSpot(face) ? best : null, x: sx - cx / 100, y: sy - cy / 100 };
}

/** Where a logged arrow sits on the sheet, in face units (for drawing). */
export function sheetPoint(arrow, face) {
  const [cx, cy] = spotCentres(face)[arrow.spot ?? 0] || [0, 0];
  return { x: cx + arrow.x * 100, y: cy + arrow.y * 100 };
}

/** Numeric value: X = 10, M = 0, empty = 0. */
export function arrowValue(v) {
  if (v === 'X') return 10;
  if (v === 'M' || v == null) return 0;
  return Number(v);
}

export function isValidArrowValue(v) {
  return ARROW_VALUES.includes(v);
}

/**
 * The printed rings of a face as fractions of its radius, the X ring first and the face's edge (1)
 * last: printed ring k (k ≥ 1) is the 10 − (k − 1) ring.
 */
export function ringEdges(face) {
  const f = faceOf(face);
  if (f.animal) return [];
  if (f.rings) return [f.xEdge ?? null, ...f.rings.map((r) => r.edge)];
  const n = ringCount(face);
  return [1 / (2 * n), ...Array.from({ length: n }, (_, k) => (k + 1) / n)];
}

/**
 * How a face is scored: zones from the centre out, each with its outer edge (a fraction of the radius)
 * and its value. The innermost zone includes its edge line; the others score the lower (outer) ring on
 * a line. Standard: X, 10, 9 … the lowest ring. Compound: the X ring scores 10, the rest of the 10 ring
 * and the 9 ring score 9, then as printed.
 */
export function scoringZones(face) {
  const f = faceOf(face);
  // the 3D animal's zones are not rings: values only (its arrows are never placed)
  if (f.animal) return ANIMAL_VALUES.map((value) => ({ edge: null, value }));
  // a field or hunter face: its rings, neighbours of one value as one zone; the X scores as its zone
  if (f.rings) {
    const zones = [];
    for (const { edge, value } of f.rings) {
      if (zones.length && zones[zones.length - 1].value === value) zones[zones.length - 1].edge = edge;
      else zones.push({ edge, value });
    }
    return zones;
  }
  const [xEdge, ...edges] = ringEdges(face);
  const printed = edges.map((edge, k) => ({ edge, value: 10 - k }));
  if (!isCompoundFace(face)) return [{ edge: xEdge, value: 'X' }, ...printed];
  return [{ edge: xEdge, value: 10 }, ...printed.slice(1)];
}

/**
 * Score a tap given its position normalised to the face radius (x, y in [-1, 1], centre 0,0).
 * A tap exactly on a ring line scores the lower ring (the X line counts as the X).
 */
export function scoreFromPoint(x, y, face) {
  return scoringZoneAt(x, y, face)?.value ?? 'M';
}

/**
 * The scoring zone a point lies in, by the rule of scoreFromPoint: its value and its inner and
 * outer edges (fractions of the radius). On a compound face the outer 10 ring and the 9 ring are
 * one zone (both score 9). Null off the face.
 */
export function scoringZoneAt(x, y, face) {
  const d = round9(Math.hypot(x, y));
  return zoneAt(face, (z, i) => (i === 0 ? d <= round9(z.edge) : d < round9(z.edge)));
}

/** The first scoring zone (from the centre out) that `inside(zone, index)` accepts, with its inner edge; null when none does. */
function zoneAt(face, inside) {
  const zones = scoringZones(face);
  const k = zones.findIndex(inside);
  if (k < 0) return null;
  return { value: zones[k].value, inner: k > 0 ? zones[k - 1].edge : 0, edge: zones[k].edge };
}

/**
 * The width of the shaft (mm) an arrow is drawn and scored with: an Easton ACE 670 (0.212 in), a
 * typical indoor shaft. An arrow's position (x, y) is the middle of its shaft.
 */
export const SHAFT_MM = 5.4;

/** An arrow's radius on a face, as a fraction of one spot's radius (0.027 on a 40 cm face). */
export function arrowRadius(face, shaftMm = SHAFT_MM) {
  return shaftMm / 2 / (spotRadiusCm(face) * 10);
}

/**
 * The scoring zone of an arrow whose shaft's middle is at x, y, by the rule of the sport: a shaft
 * touching a ring's line scores that (higher) ring, so the shaft's edge nearest the centre decides,
 * and an edge exactly on a line touches it. Same shape as scoringZoneAt; null when the whole shaft
 * is off the face.
 */
export function arrowZoneAt(x, y, face, shaftMm = SHAFT_MM) {
  const d = round9(Math.max(0, Math.hypot(x, y) - arrowRadius(face, shaftMm)));
  return zoneAt(face, (z) => d <= round9(z.edge));
}

/**
 * The values of every scoring zone an arrow's hole lies in or touches (its middle at x, y): one for
 * an arrow clear of the lines, two for a line cutter. Empty when the whole hole is off the face.
 */
export function zonesTouched(x, y, face, shaftMm = SHAFT_MM) {
  const d = Math.hypot(x, y);
  const r = arrowRadius(face, shaftMm);
  const [near, far] = [round9(Math.max(0, d - r)), round9(d + r)];
  return scoringZones(face)
    .filter((z, i, zones) => near <= round9(z.edge) && far >= round9(i > 0 ? zones[i - 1].edge : 0))
    .map((z) => z.value);
}

/** The score of an arrow whose shaft's middle is at x, y (arrowZoneAt's rule). */
export function scoreArrow(x, y, face, shaftMm = SHAFT_MM) {
  return arrowZoneAt(x, y, face, shaftMm)?.value ?? 'M';
}

// Guard against float noise such as 0.3 * 10 = 3.0000000000000004 or 0.7 * 10 = 6.999999999999999.
function round9(n) {
  return Math.round(n * 1e9) / 1e9;
}

/** Keys shown on the keypad for a face: its zone values, best first, and the miss. */
export function keypadValues(face) {
  return [...scoringZones(face).map((z) => z.value), 'M'];
}

/** The quick keypad of the Log: the best six values of the face and the miss. */
export function quickKeys(face) {
  return [...keypadValues(face).filter((k) => k !== 'M').slice(0, 6), 'M'];
}

/**
 * WA zone name for a value, used as a CSS class suffix. With `face`, the colour the value has on
 * that face (a field face's 6 and 5 gold, 4 to 1 black; a 3D animal's 11 and 10 gold, 8 red, 5
 * blue); without, the WA target face's.
 */
export function zoneOf(v, face = null) {
  if (v == null) return 'empty';
  if (face && v !== 'M') {
    if (isFieldFace(face)) return faceOf(face).rings.find((r) => r.value === v)?.colour || 'miss';
    if (isAnimalFace(face)) return ANIMAL_COLOUR[v] || 'miss';
  }
  if (v === 11) return 'gold';
  if (v === 'X' || v === 10 || v === 9) return 'gold';
  if (v === 8 || v === 7) return 'red';
  if (v === 6 || v === 5) return 'blue';
  if (v === 4 || v === 3) return 'black';
  if (v === 2 || v === 1) return 'white';
  return 'miss';
}

/**
 * The printed colour bands of a face from the centre out: each colour's outer edge (a fraction of the
 * radius). A full face: gold 0.2, red 0.4, blue 0.6, black 0.8, white 1; a 10–6 spot: gold 0.4, red
 * 0.8, blue 1.
 */
export function colourBands(face) {
  const bands = [];
  printedRings(face).forEach(({ edge, colour: zone }) => {
    if (bands.length && bands[bands.length - 1].zone === zone) bands[bands.length - 1].edge = edge;
    else bands.push({ zone, edge });
  });
  return bands;
}
