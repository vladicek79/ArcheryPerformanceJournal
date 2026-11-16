import { describe, it, expect } from 'vitest';
import {
  PREVIEW_MARGIN,
  CLOSE_UP_MARGIN,
  spotsBox,
  isCloseUp,
  keepCloseUp,
  resultOnCrop,
  resultOffCrop,
  faceFromPicture,
  pictureFromFace,
  withArrows,
  moveArrow,
} from '../public/js/app/scanGeometry.js';
import { scoreFromPoint } from '../public/js/app/scoring.js';

const spot = (cx, cy, rx, ry = rx, angle = 0) => ({ outer: { cx, cy, rx, ry, angle } });
const picture = (w, h) => ({ x: 0, y: 0, w, h });

/** A triple seen upright: three spots in a column, radius 50, centres 110 apart. */
const triple = () => [spot(200, 100, 50), spot(200, 210, 50), spot(200, 320, 50)];

/** A result whose arrows' picture points match their face points. */
function result(spots, arrows, partial = false) {
  return {
    partial,
    spots,
    arrows: arrows.map((a) => ({ ...a, image: pictureFromFace(spots[a.spot ?? 0].outer, a) })),
  };
}

describe('spotsBox', () => {
  it('boxes one spot by its longer radius times the margin, in whole pixels', () => {
    // radius 40 × 1.25 = 50 around (100.5, 80.5): 50.5…150.5 → floor / ceil
    expect(spotsBox([spot(100.5, 80.5, 40, 30)], { margin: PREVIEW_MARGIN, bounds: picture(400, 300) })).toEqual({ x: 50, y: 30, w: 101, h: 101 });
  });

  it('boxes three spots together', () => {
    // radius 50 × 1.3 = 65: x 135…265, y 35…385
    expect(spotsBox(triple(), { margin: CLOSE_UP_MARGIN, bounds: picture(400, 500) })).toEqual({ x: 135, y: 35, w: 130, h: 350 });
  });

  it('is cut to the picture', () => {
    expect(spotsBox(triple(), { margin: CLOSE_UP_MARGIN, bounds: picture(250, 360) })).toEqual({ x: 135, y: 35, w: 115, h: 325 });
    expect(spotsBox([spot(20, 20, 40)], { margin: PREVIEW_MARGIN, bounds: picture(400, 300) })).toEqual({ x: 0, y: 0, w: 70, h: 70 });
  });

  it('is cut to bounds that do not start at the corner (the scan frame of the live camera)', () => {
    expect(spotsBox(triple(), { margin: CLOSE_UP_MARGIN, bounds: { x: 150, y: 60, w: 100, h: 300 } })).toEqual({ x: 150, y: 60, w: 100, h: 300 });
  });

  it('gives the box in the full-size picture for spots found on a scaled-down one', () => {
    // the spots were found on a picture half the size: everything doubles
    const box = spotsBox(triple(), { margin: CLOSE_UP_MARGIN, bounds: picture(800, 1000), scale: 0.5 });
    expect(box).toEqual({ x: 270, y: 70, w: 260, h: 700 });
  });

  it('keeps the two margins of the two uses apart', () => {
    expect(PREVIEW_MARGIN).toBe(1.25);
    expect(CLOSE_UP_MARGIN).toBe(1.3);
  });
});

describe('isCloseUp', () => {
  it('holds for a real box clearly smaller than the whole', () => {
    expect(isCloseUp({ x: 135, y: 35, w: 130, h: 350 }, picture(400, 500))).toBe(true);
  });

  it('fails for a box that is nearly the whole picture', () => {
    expect(isCloseUp({ x: 0, y: 0, w: 400, h: 400 }, picture(400, 500))).toBe(false); // exactly 0.8
    expect(isCloseUp({ x: 0, y: 0, w: 400, h: 399 }, picture(400, 500))).toBe(true);
  });

  it('fails for a sliver or an empty box', () => {
    expect(isCloseUp({ x: 0, y: 0, w: 16, h: 200 }, picture(400, 500))).toBe(false);
    expect(isCloseUp({ x: 0, y: 0, w: 200, h: 16 }, picture(400, 500))).toBe(false);
    expect(isCloseUp({ x: 300, y: 0, w: -20, h: 200 }, picture(400, 500))).toBe(false);
  });
});

describe('keepCloseUp', () => {
  const whole = { spots: triple(), arrows: [], partial: false };

  it('keeps the close-up when it finds as many spots, or more', () => {
    expect(keepCloseUp(whole, { spots: triple(), arrows: [] })).toBe(true);
    expect(keepCloseUp({ spots: triple().slice(0, 1), arrows: [] }, { spots: triple(), arrows: [] })).toBe(true);
  });

  it('keeps the whole photo when the close-up finds fewer spots or no face', () => {
    expect(keepCloseUp(whole, { spots: triple().slice(0, 2), arrows: [] })).toBe(false);
    expect(keepCloseUp(whole, { error: 'No target face found.' })).toBe(false);
  });
});

describe('moving a result between pictures', () => {
  const tilted = [spot(200, 100, 50, 40, 0.3), spot(210, 210, 50, 40, 0.3)];
  const res = result(tilted, [
    { x: 0.3, y: -0.2, spot: 0, area: 12 },
    { x: -0.5, y: 0.6, spot: 1, area: 9 },
  ]);

  it('moves and enlarges the spots and the arrows onto a crop', () => {
    const on = resultOnCrop(res, { x: 100, y: 20, w: 200, h: 260 }, 2);
    expect(on.spots[0].outer).toEqual({ cx: 200, cy: 160, rx: 100, ry: 80, angle: 0.3 });
    expect(on.spots[1].outer).toEqual({ cx: 220, cy: 380, rx: 100, ry: 80, angle: 0.3 });
    expect(on.arrows[0].image.x).toBeCloseTo((res.arrows[0].image.x - 100) * 2, 9);
    expect(on.arrows[0].image.y).toBeCloseTo((res.arrows[0].image.y - 20) * 2, 9);
    // everything else of the result and of the arrows is kept
    expect(on.partial).toBe(false);
    expect(on.arrows[1]).toMatchObject({ x: -0.5, y: 0.6, spot: 1, area: 9 });
  });

  it('keeps the arrows aligned with their spots on the crop', () => {
    const on = resultOnCrop(res, { x: 100, y: 20, w: 200, h: 260 }, 1.7);
    on.arrows.forEach((a) => {
      const f = faceFromPicture(on.spots[a.spot].outer, a.image);
      expect(f.x).toBeCloseTo(a.x, 9);
      expect(f.y).toBeCloseTo(a.y, 9);
    });
  });

  it('does not change the result it was given', () => {
    const before = JSON.stringify(res);
    resultOnCrop(res, { x: 100, y: 20, w: 200, h: 260 }, 2);
    resultOffCrop(res, { x: 100, y: 20, w: 200, h: 260 }, 0.5, 0.8);
    expect(JSON.stringify(res)).toBe(before);
  });

  it('moves a result read on an analysed part back onto the whole picture', () => {
    // the part at (300, 120) of the video was analysed at half its size; the overlay shows the
    // video at 0.8 of its size
    const off = resultOffCrop(res, { x: 300, y: 120, w: 800, h: 600 }, 0.5, 0.8);
    expect(off.spots[0].outer.cx).toBeCloseTo((300 + 200 / 0.5) * 0.8, 9);
    expect(off.spots[0].outer.cy).toBeCloseTo((120 + 100 / 0.5) * 0.8, 9);
    expect(off.spots[0].outer.rx).toBeCloseTo(50 * 1.6, 9);
    expect(off.spots[0].outer.ry).toBeCloseTo(40 * 1.6, 9);
    expect(off.spots[0].outer.angle).toBe(0.3);
    off.arrows.forEach((a) => {
      const f = faceFromPicture(off.spots[a.spot].outer, a.image);
      expect(f.x).toBeCloseTo(a.x, 9);
      expect(f.y).toBeCloseTo(a.y, 9);
    });
  });

  it('comes back to where it was: onto a crop and off it again', () => {
    const box = { x: 100, y: 20, w: 200, h: 260 };
    const back = resultOffCrop(resultOnCrop(res, box, 2), box, 2);
    back.spots.forEach((s, i) => {
      for (const key of ['cx', 'cy', 'rx', 'ry', 'angle']) expect(s.outer[key]).toBeCloseTo(tilted[i].outer[key], 9);
    });
    back.arrows.forEach((a, i) => {
      expect(a.image.x).toBeCloseTo(res.arrows[i].image.x, 9);
      expect(a.image.y).toBeCloseTo(res.arrows[i].image.y, 9);
    });
  });
});

describe('picture ↔ face', () => {
  const outer = { cx: 180, cy: 240, rx: 90, ry: 60, angle: 0.4 };

  it('puts the centre and the ends of the axes where the ellipse has them', () => {
    expect(faceFromPicture(outer, { x: 180, y: 240 })).toEqual({ x: 0, y: 0 });
    // the end of the long axis is on the edge of the face (distance 1), along the axis
    const f = faceFromPicture(outer, { x: 180 + 90 * Math.cos(0.4), y: 240 + 90 * Math.sin(0.4) });
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(1, 9);
    expect(f.x).toBeCloseTo(Math.cos(0.4), 9);
    expect(f.y).toBeCloseTo(Math.sin(0.4), 9);
    // …and so is the end of the short one
    const s = faceFromPicture(outer, { x: 180 - 60 * Math.sin(0.4), y: 240 + 60 * Math.cos(0.4) });
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(1, 9);
  });

  it('round-trips on a tilted, non-circular ellipse', () => {
    for (const f of [
      { x: 0.3, y: -0.7 },
      { x: -1.1, y: 0.2 },
      { x: 0, y: 0 },
      { x: 0.05, y: 0.95 },
    ]) {
      const back = faceFromPicture(outer, pictureFromFace(outer, f));
      expect(back.x).toBeCloseTo(f.x, 9);
      expect(back.y).toBeCloseTo(f.y, 9);
    }
    const p = { x: 133, y: 290 };
    const again = pictureFromFace(outer, faceFromPicture(outer, p));
    expect(again.x).toBeCloseTo(p.x, 9);
    expect(again.y).toBeCloseTo(p.y, 9);
  });

  it('is plain scaling on an upright circle', () => {
    expect(pictureFromFace(spot(100, 100, 50).outer, { x: 0.5, y: -0.2 })).toEqual({ x: 125, y: 90 });
    expect(faceFromPicture(spot(100, 100, 50).outer, { x: 125, y: 90 })).toEqual({ x: 0.5, y: -0.2 });
  });
});

describe('withArrows', () => {
  it('puts the agreed arrows on the picture of the latest result, each on its spot', () => {
    const res = result(triple(), [{ x: 0.9, y: 0.9, spot: 0 }]);
    const shown = withArrows(res, [
      { x: 0.2, y: 0, spot: 0 },
      { x: 0, y: -0.4, spot: 2 },
    ]);
    expect(shown.spots).toBe(res.spots);
    expect(shown.partial).toBe(false);
    expect(shown.arrows).toEqual([
      { x: 0.2, y: 0, spot: 0, image: { x: 210, y: 100 } },
      { x: 0, y: -0.4, spot: 2, image: { x: 200, y: 300 } },
    ]);
  });

  it('uses the first spot on a single face (spot null) and for a spot that is not in the picture', () => {
    const res = result([spot(100, 100, 50)], []);
    const shown = withArrows(res, [
      { x: 0.5, y: 0, spot: null },
      { x: 0, y: 0.5, spot: 2 },
    ]);
    expect(shown.arrows.map((a) => a.image)).toEqual([
      { x: 125, y: 100 },
      { x: 100, y: 125 },
    ]);
  });
});

describe('moveArrow', () => {
  const size = { width: 400, height: 500 };

  it('moves an arrow within its spot: new place in the picture and on the face, and so a new score', () => {
    const res = result(triple(), [{ x: 0.05, y: 0, spot: 1, area: 7, lean: { x: 1, y: 0 } }]);
    const a = res.arrows[0];
    expect(scoreFromPoint(a.x, a.y, '40t')).toBe('X');
    const b = moveArrow(a, { x: 230, y: 210 }, res, '40t', size);
    expect(b).toEqual({ x: 0.6, y: 0, spot: 1, area: 7, lean: { x: 1, y: 0 }, image: { x: 230, y: 210 } });
    expect(scoreFromPoint(b.x, b.y, '40t')).toBe(7);
    // the arrow given is left as it was
    expect(a.x).toBe(0.05);
    expect(a.image).toEqual({ x: 202.5, y: 210 });
  });

  it('moves an arrow on a single face (spot stays null)', () => {
    const res = result([spot(200, 250, 100, 80, 0.2)], [{ x: 0, y: 0, spot: null }]);
    const to = pictureFromFace(res.spots[0].outer, { x: -0.35, y: 0.25 });
    const b = moveArrow(res.arrows[0], to, res, '122', size);
    expect(b.spot).toBeNull();
    expect(b.x).toBeCloseTo(-0.35, 9);
    expect(b.y).toBeCloseTo(0.25, 9);
    expect(scoreFromPoint(b.x, b.y, '122')).toBe(6);
  });

  it('gives the arrow to the spot it is nearest to when dragged across', () => {
    const res = result(triple(), [{ x: 0, y: 0.5, spot: 0 }]);
    const b = moveArrow(res.arrows[0], { x: 200, y: 300 }, res, '40t', size);
    expect(b.spot).toBe(2);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.y).toBeCloseTo(-0.4, 9);
    expect(scoreFromPoint(b.x, b.y, '40t')).toBe(8); // on the ring line: the lower ring
  });

  it('between two spots the nearer one wins, and the earlier one on a tie', () => {
    const res = result(triple(), [{ x: 0, y: 0, spot: 0 }]);
    expect(moveArrow(res.arrows[0], { x: 200, y: 154 }, res, '40t', size).spot).toBe(0);
    expect(moveArrow(res.arrows[0], { x: 200, y: 156 }, res, '40t', size).spot).toBe(1);
    expect(moveArrow(res.arrows[0], { x: 200, y: 155 }, res, '40t', size).spot).toBe(0);
  });

  it('measures nearness on the face, not in pixels', () => {
    // a big spot and a small one: the point is nearer to the small one's centre in pixels, but
    // deeper inside the big one
    const res = result([spot(100, 100, 100), spot(260, 100, 20)], [{ x: 0, y: 0, spot: 1 }]);
    const b = moveArrow(res.arrows[0], { x: 190, y: 100 }, res, '40t', size);
    expect(b.spot).toBe(0);
    expect(b.x).toBeCloseTo(0.9, 9);
  });

  it('on a partial sheet the arrow keeps its spot and is measured from the first spot found', () => {
    const res = result([spot(200, 100, 50), spot(200, 210, 50)], [{ x: 0, y: 0, spot: 0 }], true);
    const a = { ...res.arrows[0], spot: 2 }; // the spot hint: the one spot in view is the sheet's third
    const b = moveArrow(a, { x: 200, y: 220 }, res, '40t', size);
    expect(b.spot).toBe(2);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.y).toBeCloseTo(2.4, 9); // from the first spot, though the second is right there
    expect(scoreFromPoint(b.x, b.y, '40t')).toBe('M');
  });

  it('keeps the arrow inside the picture', () => {
    const res = result([spot(200, 250, 100)], [{ x: 0, y: 0, spot: null }]);
    const b = moveArrow(res.arrows[0], { x: -30, y: 620 }, res, '80', size);
    expect(b.image).toEqual({ x: 0, y: 500 });
    expect(b.x).toBeCloseTo(-2, 9);
    expect(b.y).toBeCloseTo(2.5, 9);
  });
});
