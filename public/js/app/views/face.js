// Target face drawing shared by the Log tab and the session detail (SVG, face radius = 100 units).
import { s } from '../../core/dom.js';
import { isSpotFace } from '../scoring.js';

export const VB = 101; // viewBox half-size; the face radius is 100

export function faceRings(face) {
  const ring = (r, fill, stroke, sw = 0.6) => s('circle', { r, fill, stroke, 'stroke-width': sw });
  if (isSpotFace(face)) {
    return [
      ring(100, '#00A2E8', '#14181C', 0.8),
      ring(80, '#D22B2B', '#14181C', 0.8),
      ring(60, '#D22B2B', '#14181C', 0.8),
      ring(40, '#FFE11A', '#14181C', 0.8),
      ring(20, '#FFE11A', '#14181C', 0.8),
      ring(10, 'none', '#14181C', 0.6),
      s('path', { d: 'M-2 0h4M0 -2v4', stroke: '#14181C', 'stroke-width': 0.6 }),
    ];
  }
  const colours = ['#FFFFFF', '#FFFFFF', '#1A1A1A', '#1A1A1A', '#00A2E8', '#00A2E8', '#D22B2B', '#D22B2B', '#FFE11A', '#FFE11A'];
  return [
    ...colours.map((fill, i) => ring(100 - i * 10, fill, fill === '#1A1A1A' ? '#FFFFFF' : '#14181C')),
    ring(5, 'none', '#14181C', 0.5),
    s('path', { d: 'M-1.5 0h3M0 -1.5v3', stroke: '#14181C', 'stroke-width': 0.5 }),
  ];
}

