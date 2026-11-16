import { describe, it, expect } from 'vitest';
import { loupeCorner, loupeBox, LOUPE_MARGIN, LOUPE_CHIP, SIDE_HYSTERESIS } from '../public/js/app/loupePlacement.js';

// a 358px square stage (390px phone, 16px gutters) and the 132px loupe
const stage = { stageW: 358, stageH: 358, size: 132 };
const at = (fingerX, fingerY, aimX = fingerX, aimY = fingerY - 64, prevCorner = null) =>
  loupeCorner({ ...stage, fingerX, fingerY, aimX, aimY, prevCorner });

describe('loupeBox', () => {
  it('sits inside the stage, a margin from its edges, with room for the score chip under the circle', () => {
    expect(loupeBox('tl', stage)).toEqual({ x: LOUPE_MARGIN, y: LOUPE_MARGIN, w: 132, h: 132 + LOUPE_CHIP });
    expect(loupeBox('br', stage)).toEqual({
      x: 358 - 132 - LOUPE_MARGIN,
      y: 358 - 132 - LOUPE_CHIP - LOUPE_MARGIN,
      w: 132,
      h: 132 + LOUPE_CHIP,
    });
  });
});

describe('loupeCorner – side opposite the finger', () => {
  it('finger on the right half → top left', () => {
    expect(at(300, 300)).toBe('tl');
  });

  it('finger on the left half → top right', () => {
    expect(at(40, 300)).toBe('tr');
  });

  it('finger exactly on the midline counts as the right half', () => {
    expect(at(179, 300)).toBe('tl');
  });
});

describe('loupeCorner – hysteresis at the midline', () => {
  it('stays on its side while the finger is within the band past the midline', () => {
    // loupe on the left (finger was right); finger now 23px left of the midline
    expect(at(179 - (SIDE_HYSTERESIS - 1), 300, 156, 236, 'tl')).toBe('tl');
    // loupe on the right (finger was left); finger now 23px right of the midline
    expect(at(179 + (SIDE_HYSTERESIS - 1), 300, 202, 236, 'tr')).toBe('tr');
  });

  it('changes side once the finger is more than the band past the midline', () => {
    expect(at(179 - (SIDE_HYSTERESIS + 1), 300, 154, 236, 'tl')).toBe('tr');
    expect(at(179 + (SIDE_HYSTERESIS + 1), 300, 204, 236, 'tr')).toBe('tl');
  });

  it('keeps the side of a bottom corner too', () => {
    expect(at(170, 200, 60, 60, 'bl')).toBe('bl');
  });
});

describe('loupeCorner – the aimed point is never covered', () => {
  it('aim inside the top corner box → the bottom corner on the same side', () => {
    // finger right, aim top left (finger dragged up-left, crosshair in the corner)
    expect(at(200, 120, 60, 56)).toBe('bl');
    // finger left, aim top right
    expect(at(150, 120, 300, 56)).toBe('br');
  });

  it('aim just outside the top box keeps the top corner', () => {
    const box = loupeBox('tl', stage);
    expect(at(300, 300, box.x + box.w + 1, 50)).toBe('tl');
    expect(at(300, 300, 50, box.y + box.h + 1)).toBe('tl');
  });

  it('once at the bottom, it goes back up only when the aim has left the top box by the band', () => {
    // a stage tall enough for the band to sit between the two corner boxes
    const tall = { stageW: 500, stageH: 500, size: 132 };
    const box = loupeBox('tl', tall);
    const justOut = box.y + box.h + SIDE_HYSTERESIS - 1;
    const corner = (aimY) => loupeCorner({ ...tall, fingerX: 300, fingerY: 400, aimX: 60, aimY, prevCorner: 'bl' });
    expect(corner(justOut)).toBe('bl');
    expect(corner(justOut + 2)).toBe('tl');
  });

  it('never moves down onto the aim, even inside the band', () => {
    // 358px stage: the bottom box starts just under the top one, so the aim there keeps the top corner
    expect(at(300, 300, 60, 203, 'bl')).toBe('tl');
  });

  it('a stage too small for both corners keeps the top one', () => {
    const tiny = { stageW: 160, stageH: 160, size: 132 };
    expect(loupeCorner({ ...tiny, fingerX: 150, fingerY: 150, aimX: 40, aimY: 40, prevCorner: null })).toBe('tl');
  });
});
