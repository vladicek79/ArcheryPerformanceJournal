// Scoring rules (HANDOFF §5). Pure functions, unit-tested.

export const DISTANCES = [7, 18, 25, 30, 50, 60, 70];
export const FACE_IDS = ['40s', '40t', '40v', '40', '60', '80', '122'];
/** Faces offered for a new session ('40s', the single 10–6 spot, stays valid for older sessions). */
export const SETUP_FACES = ['40t', '40v', '40', '60', '80', '122'];
export const ARROWS_PER_END_MIN = 1;
export const ARROWS_PER_END_MAX = 12;
export const DEFAULT_ARROWS_PER_END = 3;
export const isValidArrowsPerEnd = (n) => Number.isInteger(n) && n >= ARROWS_PER_END_MIN && n <= ARROWS_PER_END_MAX;
export const ARROW_VALUES = ['X', 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'M'];
export const GRADES = [1, 2, 3, 4, 5];

/** Smart defaults: picking a distance suggests the usual face (arrows per end stay as set). */
export const DISTANCE_DEFAULTS = {
  7: { face: '80' },
  18: { face: '40t' },
  25: { face: '60' },
  30: { face: '80' },
  50: { face: '122' },
  60: { face: '122' },
  70: { face: '122' },
};

const FACE_LABELS = { '40s': '40 cm 10–6', '40t': '40 cm triple', '40v': '40 cm Vegas' };

export function faceLabel(face) {
  return FACE_LABELS[face] || `${face} cm`;
}

/** Faces scored 10–6 (the indoor 40 cm spot, single or three on one sheet). */
export function isSpotFace(face) {
  return face === '40s' || face === '40t' || face === '40v';
}

/**
 * Three-spot indoor sheets (WA 40 cm): spot centres in face units (one spot's radius = 100).
 * Triple: three spots in a column, top to bottom. Vegas: a triangle, top then bottom left, bottom right.
 * Centres are 22 cm apart (spots are 20 cm across).
 */
export const SPOT_CENTRES = {
  '40t': [
    [0, -220],
    [0, 0],
    [0, 220],
  ],
  '40v': [
    [0, -127],
    [-110, 63],
    [110, 63],
  ],
};

export function isMultiSpot(face) {
  return face in SPOT_CENTRES;
}

/** Centres of the spots on a sheet; a single face has one at the origin. */
export function spotCentres(face) {
  return SPOT_CENTRES[face] || [[0, 0]];
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
 * Score a tap given its position normalised to the face radius (x, y in [-1, 1], centre 0,0).
 * A tap exactly on a ring line scores the lower ring.
 */
export function scoreFromPoint(x, y, face) {
  const d = Math.hypot(x, y);
  if (isSpotFace(face)) {
    if (d <= 0.1) return 'X';
    if (d < 1) return 10 - Math.floor(round9(d * 5));
    return 'M';
  }
  if (d <= 0.05) return 'X';
  if (d < 1) return 10 - Math.floor(round9(d * 10));
  return 'M';
}

// Guard against float noise such as 0.3 * 10 = 3.0000000000000004 or 0.7 * 10 = 6.999999999999999.
function round9(n) {
  return Math.round(n * 1e9) / 1e9;
}

/** Keys shown on the keypad for a face. */
export function keypadValues(face) {
  return isSpotFace(face) ? ['X', 10, 9, 8, 7, 6, 'M'] : ARROW_VALUES;
}

/** WA zone name for a value, used as a CSS class suffix. */
export function zoneOf(v) {
  if (v == null) return 'empty';
  if (v === 'X' || v === 10 || v === 9) return 'gold';
  if (v === 8 || v === 7) return 'red';
  if (v === 6 || v === 5) return 'blue';
  if (v === 4 || v === 3) return 'black';
  if (v === 2 || v === 1) return 'white';
  return 'miss';
}
