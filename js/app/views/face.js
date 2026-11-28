// Target face drawing shared by the Log tab and the session detail (SVG, face radius = 100 units).
import { s } from '../../core/dom.js';
import { isSpotFace, isMultiSpot, isAnimalFace, isFieldFace, spotCentres, ringEdges, printedRings } from '../scoring.js';

export const VB = 101; // viewBox half-size; the face radius is 100

const FILL = { gold: '#FFE11A', red: '#D22B2B', blue: '#00A2E8', black: '#1A1A1A', white: '#FFFFFF' };
// the 3D animal (the same in both themes, as the target colours): its body and its zone lines
const ANIMAL = { body: '#7a6a50', line: '#f2ead8' };

/** The 3D animal: a body with the 8, 10 and 11 zone lines, in the face's 200-unit box. */
export function animalFace() {
  const line = { fill: 'none', stroke: ANIMAL.line, 'stroke-width': 1.6 };
  return [
    s(
      'g',
      { transform: 'translate(-100 -100) scale(2)' },
      s('path', {
        fill: ANIMAL.body,
        d: 'M14 40c4-12 20-18 40-17 9 0 15-6 20-12 3-3 8-2 9 2l2 6c5 1 9 4 9 8 0 3-3 5-7 5l-6 1c-1 9-4 17-8 22l1 22h-6l-3-18c-7 2-17 2-25 0l-3 18h-6l1-22c-6-4-10-9-12-15z',
      }),
      s('ellipse', { ...line, cx: 52, cy: 46, rx: 16, ry: 12, 'stroke-width': 0.8 }),
      s('circle', { ...line, cx: 52, cy: 46, r: 7, 'stroke-width': 0.8 }),
      s('circle', { ...line, cx: 52, cy: 46, r: 2.8, 'stroke-width': 0.8 }),
    ),
  ];
}

export function faceRings(face) {
  if (isAnimalFace(face)) return animalFace();
  const ring = (r, fill, stroke, sw = 0.6) => s('circle', { r, fill, stroke, 'stroke-width': sw });
  const [xEdge] = ringEdges(face);
  // a spot is drawn with bolder lines, its rings being wider (a field face's too)
  const spot = isSpotFace(face) || isFieldFace(face);
  const rings = printedRings(face)
    .map(({ edge, colour }) => {
      const fill = FILL[colour];
      const stroke = fill === FILL.black ? '#FFFFFF' : '#14181C';
      return ring(edge * 100, fill, stroke, spot ? 0.8 : 0.6);
    })
    .reverse();
  const m = spot ? 2 : 1.5;
  // the X ring and the centre cross in a colour that shows on the spot (white on a black spot)
  const ink = printedRings(face)[0]?.colour === 'black' ? '#FFFFFF' : '#14181C';
  return [
    ...rings,
    // a face without an X ring (the IFAA hunter face) has none drawn
    xEdge != null ? ring(xEdge * 100, 'none', ink, spot ? 0.6 : 0.5) : null,
    s('path', { d: `M-${m} 0h${2 * m}M0 -${m}v${2 * m}`, stroke: ink, 'stroke-width': spot ? 0.6 : 0.5 }),
  ];
}

/** The whole sheet: one face, or three spots for the triple and Vegas faces. */
export function faceSheet(face) {
  if (!isMultiSpot(face)) return faceRings(face);
  return spotCentres(face).map(([cx, cy]) => s('g', { transform: `translate(${cx} ${cy})` }, faceRings(face)));
}

/** viewBox that fits the sheet with a 1-unit margin. */
export function faceViewBox(face) {
  const c = spotCentres(face);
  const xs = c.map(([x]) => x);
  const ys = c.map(([, y]) => y);
  const minX = Math.min(...xs) - VB;
  const minY = Math.min(...ys) - VB;
  return `${minX} ${minY} ${Math.max(...xs) + VB - minX} ${Math.max(...ys) + VB - minY}`;
}
