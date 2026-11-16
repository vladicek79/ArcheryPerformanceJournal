// The faces offered for a new session (scoring.js SETUP_FACES) seen as the APL setup shows them:
// a size (segmented control) and a kind (pills: full, 10–6, triple, Vegas). Presentation only: the
// session still stores the face id ('40t', '60s', '122', ...).
import { SETUP_FACES } from '../scoring.js';

const KINDS = ['full', 'six', 'triple', 'vegas'];
const SUFFIX = { full: '', six: 's', triple: 't', vegas: 'v' };
const KIND_OF = { '': 'full', s: 'six', t: 'triple', v: 'vegas' };

/** '40t' → { size: 40, kind: 'triple' }; null for an id that is not a face. */
export function faceParts(face) {
  const m = /^(\d+)([stv]?)$/.exec(String(face ?? ''));
  return m ? { size: Number(m[1]), kind: KIND_OF[m[2]] } : null;
}

/** { 40, 'triple' } → '40t'. */
export const faceId = (size, kind) => `${size}${SUFFIX[kind]}`;

/** The sizes offered, smallest first: [40, 60, 80, 122]. */
export const FACE_SIZES = [...new Set(SETUP_FACES.map((f) => faceParts(f).size))].sort((a, b) => a - b);

/** The kinds offered for a size, in the order full, 10–6, triple, Vegas. */
export function kindsForSize(size) {
  const offered = new Set(
    SETUP_FACES.map(faceParts)
      .filter((p) => p.size === size)
      .map((p) => p.kind),
  );
  return KINDS.filter((k) => offered.has(k));
}

/** The face after picking another size: the same kind when that size has it, else the full face. */
export function faceForSize(size, current) {
  const kind = faceParts(current)?.kind;
  return faceId(size, kindsForSize(size).includes(kind) ? kind : kindsForSize(size)[0]);
}
