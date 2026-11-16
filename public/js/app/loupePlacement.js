// Where the magnifier (loupe) docks while an arrow is aimed: a corner of the face's stage, never
// under the finger and never over the aimed point. Pure functions, unit-tested; all values are
// pixels inside the stage (0,0 = its top left).

/** Gap between the loupe and the stage's edges. */
export const LOUPE_MARGIN = 10;
/** Height under the loupe's circle taken by the live score chip (6px gap + 28px chip + its border). */
export const LOUPE_CHIP = 38;
/** How far past the stage's midline the finger must go before the loupe changes side. */
export const SIDE_HYSTERESIS = 24;

/** The box a loupe docked in `corner` ('tl', 'tr', 'bl', 'br') covers: the circle and its score chip. */
export function loupeBox(corner, { stageW, stageH, size }) {
  const w = size;
  const h = size + LOUPE_CHIP;
  return {
    x: corner[1] === 'l' ? LOUPE_MARGIN : stageW - w - LOUPE_MARGIN,
    y: corner[0] === 't' ? LOUPE_MARGIN : stageH - h - LOUPE_MARGIN,
    w,
    h,
  };
}

const inside = (x, y, b, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

/**
 * The corner the loupe docks in. Its side is the one opposite the finger (finger on the right half:
 * the loupe on the left); once docked, it changes side only when the finger is more than
 * SIDE_HYSTERESIS past the midline, so it does not flicker. It sits at the top, unless the aimed
 * point is inside the top corner's box: then at the bottom of the same side (and back up only once
 * the aim has left the top box by the same band). When the bottom box would cover the aim too (a
 * stage too small for two corners), it stays at the top.
 */
export function loupeCorner({ fingerX, aimX, aimY, stageW, stageH, size, prevCorner = null }) {
  const mid = stageW / 2;
  let side;
  const prevSide = prevCorner?.[1];
  if (prevSide === 'l') side = fingerX < mid - SIDE_HYSTERESIS ? 'r' : 'l';
  else if (prevSide === 'r') side = fingerX > mid + SIDE_HYSTERESIS ? 'l' : 'r';
  else side = fingerX >= mid ? 'l' : 'r';

  const stage = { stageW, stageH, size };
  const top = loupeBox(`t${side}`, stage);
  const bottom = loupeBox(`b${side}`, stage);
  const wasBottom = prevCorner === `b${side}`;
  if (!inside(aimX, aimY, top, wasBottom ? SIDE_HYSTERESIS : 0)) return `t${side}`;
  // the bottom box would cover the aim as well (a stage too small for two corners): stay on top
  return inside(aimX, aimY, bottom) ? `t${side}` : `b${side}`;
}
