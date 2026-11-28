// The face catalogue of the setup's "Target face" sheet: each face type once, with its standard
// (WA, NFAA, IFAA) and the sizes it comes in, grouped Regular / Field / Hunter / 3D. Presentation only: a session still stores the
// scoring face id ('40t', '40tc', 'f60', '3d', ...), derived here from the type, the size and the
// bow type (compound is the inner 10, on the faces the app scores that way: the 40 cm ones).
import { FACES, REPLACED_FACES, FACE_NAMES, spotLayout } from '../scoring.js';

export { FACE_NAMES };

/** The face types, in the order the sheet lists them; `sizes` null: no size (3D). */
export const FACE_CATALOGUE = [
  { id: 'full', standard: 'wa', group: 'regular', sizes: [40, 60, 80, 122] },
  { id: 'ring6', standard: 'wa', group: 'regular', sizes: [80] },
  { id: 'six', standard: 'wa', group: 'regular', sizes: [40, 60] },
  { id: 'triple', standard: 'wa', group: 'regular', sizes: [40, 60] },
  // the WA triangular triple face (Book 2, 7.2.2: 40 and 60 cm), which NFAA allows at 40 cm as the
  // Vegas 3 spot face (Constitution 2026/27, Art. VI E.2.4): listed under both, as archers call it
  { id: 'vegas', standard: 'wa', also: { nfaa: [40] }, group: 'regular', sizes: [40, 60] },
  { id: 'field', standard: 'wa', group: 'field', sizes: [20, 40, 60, 80] },
  { id: 'fieldTriple', standard: 'wa', group: 'field', sizes: [20] },
  { id: 'nfaaField', standard: 'nfaa', group: 'field', sizes: [20, 35, 50, 65] },
  { id: 'ifaaField', standard: 'ifaa', group: 'field', sizes: [20, 35, 50, 65] },
  { id: 'nfaaHunter', standard: 'nfaa', group: 'hunter', sizes: [20, 35, 50, 65] },
  { id: 'ifaaHunter', standard: 'ifaa', group: 'hunter', sizes: [20, 35, 50, 65] },
  // IFAA 20 cm faces as they are shot: a square of four, one arrow at each
  { id: 'ifaaField4', standard: 'ifaa', group: 'field', sizes: [20] },
  { id: 'ifaaHunter4', standard: 'ifaa', group: 'hunter', sizes: [20] },
  { id: 'animal', standard: 'wa', group: '3d', sizes: null },
];

/** The standards the sheet's faces can be limited to ('all': every face). */
export const FACE_STANDARDS = [
  { id: 'all', label: 'All' },
  { id: 'wa', label: 'WA' },
  { id: 'nfaa', label: 'NFAA' },
  { id: 'ifaa', label: 'IFAA' },
];
export const isFaceStandard = (v) => FACE_STANDARDS.some((s) => s.id === v);

/**
 * The sizes a catalogue face comes in under a standard: all of them under its own standard (and
 * 'all'), those `also` lists under another one (the Vegas 3-spot: 40 cm under NFAA), else none.
 */
const sizesUnder = (f, standard) =>
  !standard || standard === 'all' || f.standard === standard ? f.sizes : f.also?.[standard] || [];

const inStandard = (f, standard) =>
  !standard || standard === 'all' || f.standard === standard || !!f.also?.[standard];

/** Whether a face type is listed under a standard ('all' lists every one). */
export const inFaceStandard = (type, standard) => inStandard(catalogueFace(type), standard);

export const FACE_GROUPS = [
  { id: 'regular', label: 'Regular' },
  { id: 'field', label: 'Field' },
  { id: 'hunter', label: 'Hunter' },
  { id: '3d', label: '3D' },
];

/** The sizes of the Face size control, in cm. */
export const FACE_SIZES = [20, 35, 40, 50, 60, 65, 80, 122];

/** The sizes the faces of a standard come in (all of them for 'all'), smallest first. */
export const sizesFor = (standard) =>
  FACE_SIZES.filter((size) =>
    FACE_CATALOGUE.some((f) => inStandard(f, standard) && sizesUnder(f, standard)?.includes(size)),
  );

/** The standard's size nearest to `size` (the smaller one on a tie): `size` itself when it has it. */
export function sizeForStandard(standard, size) {
  const list = sizesFor(standard);
  if (list.includes(size)) return size;
  return list.reduce((best, v) => (Math.abs(v - size) < Math.abs(best - size) ? v : best), list[0]);
}

/** The setup's distance stepper (the Distance section of the Shooting page). */
export const DISTANCE_MIN = 5;
export const DISTANCE_MAX = 100;

/**
 * The distances the stepper steps through, per unit: the usual target, field and indoor distances
 * (metres: the app's distances, with 5, 15 and 20 m for field; yards: the imperial and NFAA ones).
 */
export const STANDARD_DISTANCES = {
  m: [5, 7, 10, 15, 18, 20, 25, 30, 40, 50, 60, 70, 90],
  yd: [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100],
};

/**
 * The next standard distance from `d` in the direction `dir` (1 up, −1 down); `d` itself at the
 * end of the list. A distance off the list (an older record's 12 m) steps to its standard neighbour.
 */
export function nextDistance(unit, d, dir) {
  const list = STANDARD_DISTANCES[unit] || STANDARD_DISTANCES.m;
  const next = dir > 0 ? list.find((v) => v > d) : [...list].reverse().find((v) => v < d);
  return next ?? d;
}

/**
 * The standard distance of `unit` nearest to `d` (the lower one on a tie), after the unit is
 * switched: the number is not converted, only moved onto the new unit's list (18 m → 20 yd).
 */
export function snapDistance(unit, d) {
  const list = STANDARD_DISTANCES[unit] || STANDARD_DISTANCES.m;
  return list.reduce((best, v) => (Math.abs(v - d) < Math.abs(best - d) ? v : best), list[0]);
}

export const catalogueFace = (type) => FACE_CATALOGUE.find((f) => f.id === type) || FACE_CATALOGUE[0];

/** Whether a face type comes in a size (3D comes in any: it has none). */
export const faceFits = (type, size) => {
  const f = catalogueFace(type);
  return !f.sizes || f.sizes.includes(size);
};

/** The face types listed for a size, in catalogue order (3D always, within its standard). */
export const facesForSize = (size, standard = 'all') =>
  FACE_CATALOGUE.filter(
    (f) => inStandard(f, standard) && (!f.sizes || sizesUnder(f, standard).includes(size)),
  );

/**
 * The face type after picking a size (or a standard): kept when it comes in that size and
 * standard, else the first that does.
 */
export const typeForSize = (type, size, standard = 'all') =>
  facesForSize(size, standard).some((f) => f.id === type)
    ? type
    : // a size the standard has no face in (the sheet snaps the size first): any face of that size
      (
        facesForSize(size, standard).find((f) => f.sizes) ||
        facesForSize(size).find((f) => f.sizes) ||
        FACE_CATALOGUE[0]
      ).id;

/** The NFAA / IFAA faces' ids: 'nf65', 'if50', 'nh35', 'ih20'. */
const PREFIX = { nfaaField: 'nf', ifaaField: 'if', nfaaHunter: 'nh', ifaaHunter: 'ih' };

const SUFFIX = { full: '', six: 's', ring6: 'r', triple: 't', vegas: 'v' };

/**
 * The scoring face id of a pick: { faceType, faceSize, bowType } → '40tc', '80r', 'f60', '3d'.
 * Compound scores the inner 10 where the app has that face ('40c', '40sc', '40tc', '40vc'); on the
 * other sizes the face is scored as printed.
 */
export function faceIdOf({ faceType, faceSize, bowType }) {
  if (faceType === 'animal') return '3d';
  if (faceType === 'field') return `f${faceSize}`;
  if (faceType === 'fieldTriple') return 'f20t';
  if (faceType === 'ifaaField4') return 'if20q';
  if (faceType === 'ifaaHunter4') return 'ih20q';
  if (PREFIX[faceType]) return `${PREFIX[faceType]}${faceSize}`;
  const plain = faceType === 'ring6' ? '80r' : `${faceSize}${SUFFIX[faceType] ?? ''}`;
  const compound = `${plain}c`;
  return bowType === 'compound' && FACES[compound]?.setup ? compound : plain;
}

/**
 * The pick a stored face id stands for (the sheet's draft), with the bow type (else derived: the
 * inner-10 faces are compound). A face no longer offered takes its replacement first, and a size
 * the catalogue does not list for its type falls back to the type's first size.
 */
export function pickOf(face, bowType = null) {
  const f = FACES[REPLACED_FACES[face] || face] || FACES['40t'];
  const bow =
    bowType === 'compound' || bowType === 'recurve'
      ? bowType
      : FACES[face]?.compound
        ? 'compound'
        : 'recurve';
  const entry = catalogueFace(f.kind);
  if (!entry.sizes) return { faceType: entry.id, faceSize: null, bowType: bow };
  const faceSize = entry.sizes.includes(f.size) ? f.size : entry.sizes[0];
  return { faceType: entry.id, faceSize, bowType: bow };
}

/**
 * Arrows per end after a face is picked: 4 on the IFAA 4-spot square (one arrow at each spot, as
 * IFAA shoots it), else as they were.
 */
export const arrowsPerEndFor = (face, current) => (spotLayout(face) === 'square' ? 4 : current);

/** Whether a pick draws the small inner 10 (compound on a face the app scores with it). */
export const isInnerTen = (pick) => !!FACES[faceIdOf(pick)]?.compound;

/** "40 cm · WA vertical triple"; "WA 3D animal" (no size). */
export const pickLabel = ({ faceType, faceSize }) =>
  faceType === 'animal' ? FACE_NAMES.animal : `${faceSize} cm · ${FACE_NAMES[faceType]}`;
