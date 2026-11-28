// How an arrow is plotted on the face (Settings › Plotting): with the loupe (a magnifier docked in a
// corner of the stage, loupePlacement.js) or with the zoom, where the whole face is magnified round
// the aimed point while the finger is down and slides under the finger as it moves, the aimed point
// always up and to the left of the finger, so the hole is never hidden. Pure functions, unit-tested.

import { printedRings } from './scoring.js';

export const PLOT_MODES = ['loupe', 'zoom'];
export const ZOOM_LEVELS = [2, 3, 4, 5];
export const ZOOM_DEFAULT = 3;

/**
 * Where a finger aims in the zoom, in screen pixels from itself: up and to the left, far enough that
 * a thumb does not cover the hole. Always the same vector, so the face never jumps while the finger
 * moves; only kept inside the stage.
 */
export const ZOOM_AIM_OFFSET = { x: -64, y: -104 };

/**
 * How fast the zoom's aim runs ahead of a finger's moves (stepAim): `ZOOM_GAIN` times the move near
 * the face's centre, and more further out (ZOOM_REACH), so a small move of the finger moves the face
 * a lot and the outer rings are reached quickly.
 */
export const ZOOM_GAIN = 1.8;
export const ZOOM_REACH = 2.5;

/**
 * How far from the face's centre the zoom's aim may go, in spot radii, when the face is not known:
 * see zoomLimit.
 */
export const ZOOM_LIMIT = 1.1;

/**
 * How far from the face's centre the zoom's aim may go on `face`, in spot radii: one ring's width
 * past the outer ring (the outer ring's own width: 0.1 on a full WA face, 0.2 on a spot, 0.4 on a
 * hunter face), so an arrow off the face can be aimed and scored M, and the face never leaves the
 * screen.
 */
export function zoomLimit(face) {
  const rings = printedRings(face);
  if (!rings.length) return ZOOM_LIMIT;
  const outer = rings[rings.length - 1].edge;
  const inner = rings.length > 1 ? rings[rings.length - 2].edge : 0;
  return outer + (outer - inner);
}

/** `p` pulled back to within `max` of `centre` ([x, y]). */
function within(p, centre, max) {
  const dx = p[0] - centre[0];
  const dy = p[1] - centre[1];
  const d = Math.hypot(dx, dy);
  return d <= max ? p : [centre[0] + (dx * max) / d, centre[1] + (dy * max) / d];
}

/**
 * The zoom's aim while a finger moves, in sheet units. It starts where the finger aims when it
 * touches (`prev` null: `screen` itself, no jump), then moves on by the finger's move times
 * gain + reach·u², u the aim's distance from the face's centre over `radius` (half the stage): a
 * small move goes far, faster towards the outer rings. It never leaves the face: at most
 * `limit` · `faceRadius` from the centre (ZOOM_LIMIT spot radii).
 */
export function stepAim(aim, prev, screen, centre, radius, { faceRadius = 100, limit = ZOOM_LIMIT, gain = ZOOM_GAIN, reach = ZOOM_REACH } = {}) {
  const max = limit * faceRadius;
  if (!aim || !prev) return within(screen, centre, max);
  const u2 = ((aim[0] - centre[0]) ** 2 + (aim[1] - centre[1]) ** 2) / (radius * radius);
  const g = gain + reach * u2;
  return within([aim[0] + (screen[0] - prev[0]) * g, aim[1] + (screen[1] - prev[1]) * g], centre, max);
}

/** The plotting mode in `settings`: 'loupe' (the default) or 'zoom'. */
export const plotMode = (settings) => (settings?.plotMode === 'zoom' ? 'zoom' : 'loupe');

/**
 * Whether a multi-spot sheet follows the spots (Settings › Plotting arrows): it shows the suggested
 * spot zoomed in, and after each arrow zooms out and into the next one. On unless turned off.
 */
export const autoSpotZoom = (settings) => settings?.autoSpotZoom !== false;

/** The zoom's magnification in `settings`: one of ZOOM_LEVELS (ZOOM_DEFAULT when unset or unknown). */
export function plotZoom(settings) {
  const z = Number(settings?.plotZoom);
  return ZOOM_LEVELS.includes(z) ? z : ZOOM_DEFAULT;
}

/**
 * The viewBox that magnifies `box` ([x, y, w, h]) `k` times and draws the sheet point `aim` where
 * `screen` was drawn in `box` (both [x, y], sheet units; `aim` defaults to `screen`: a zoom round
 * that point, which stays put while everything else spreads out from it).
 */
export function zoomedViewBox(box, screen, k, aim = screen) {
  const [x, y, w, h] = box;
  return [aim[0] - (screen[0] - x) / k, aim[1] - (screen[1] - y) / k, w / k, h / k];
}

/**
 * Where a point of the unzoomed sheet (`p`, [x, y]) is drawn in the zoomed one (zoomedViewBox with
 * the same `screen`, `k` and `aim`), in sheet units: the sheet point that is now on the screen where
 * `p` was (used to draw the finger's ring under it).
 */
export function zoomedPoint(p, screen, k, aim = screen) {
  return [aim[0] + (p[0] - screen[0]) / k, aim[1] + (p[1] - screen[1]) / k];
}

/**
 * Where the live score chip sits next to the aimed point (`ax`, `ay`, px inside a `stageW` ×
 * `stageH` stage), as its top left: up and to the right of the crosshair (the finger is down and to
 * the right, so this stays clear of both), kept inside the stage; on the left of the crosshair when
 * the aim is too near the right edge.
 */
export function zoomChipAt({ ax, ay, stageW, stageH, chipW = 44, chipH = 28, gap = 24, margin = 4 }) {
  let x = ax + gap;
  if (x + chipW > stageW - margin) x = ax - gap - chipW;
  const y = ay - gap - chipH;
  return {
    x: Math.min(stageW - chipW - margin, Math.max(margin, x)),
    y: Math.min(stageH - chipH - margin, Math.max(margin, y)),
  };
}
