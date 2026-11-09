// Scoring rules (HANDOFF §5). Pure functions, unit-tested.

export const DISTANCES = [18, 25, 30, 50, 60, 70, 90];
export const FACE_IDS = ['40s', '40', '60', '80', '122'];
export const ARROWS_PER_END = [3, 6];
export const ARROW_VALUES = ['X', 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 'M'];
export const GRADES = [1, 2, 3, 4, 5];

/** Smart defaults: picking a distance suggests the usual face and arrows per end. */
export const DISTANCE_DEFAULTS = {
  18: { face: '40s', arrowsPerEnd: 3 },
  25: { face: '60', arrowsPerEnd: 3 },
  30: { face: '80', arrowsPerEnd: 6 },
  50: { face: '122', arrowsPerEnd: 6 },
  60: { face: '122', arrowsPerEnd: 6 },
  70: { face: '122', arrowsPerEnd: 6 },
  90: { face: '122', arrowsPerEnd: 6 },
};

export function faceLabel(face) {
  return face === '40s' ? '40 cm 10–6' : `${face} cm`;
}

export function isSpotFace(face) {
  return face === '40s';
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
