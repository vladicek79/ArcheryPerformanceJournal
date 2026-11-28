// The geometry of a Scan: boxes around the spots found in a picture, moving a detection result
// between pictures (a crop, another size), picture ↔ face points, where a found arrow's label sits
// and moving a found arrow.
// Plain numbers and plain objects in, plain objects out: no DOM, no canvas.
//
// A detection result is { spots: [{ outer }], arrows: [{ x, y, spot, image }], partial } (see
// photoDetect.js): `outer` is how a spot lies in the picture, { cx, cy, rx, ry, angle, px?, py? };
// an arrow has its place on the face (x, y relative to its spot's centre, spot radius 1) and the
// same place in the picture (`image`, in pixels).
//
// A spot in the picture: its centre is at (cx, cy); seen straight on (or from far away) its edge is
// the ellipse with semi-axes rx, ry turned by `angle`, and the rings are that ellipse scaled. A
// camera close to the target and at an angle also shows perspective: the near side of the spot is
// bigger than the far side, so the rings are no longer ellipses around one middle (on a real photo
// the outer ring's middle lies some 3 mm from the centre of a 40 cm spot). That is (px, py), in
// face units: a face point f is seen at  centre + E·f / (1 + px·f.x + py·f.y),  E being the
// ellipse. Without px, py (or both 0) it is the plain ellipse. Use faceFromPicture, pictureFromFace
// and ringPoints; never the ellipse's numbers alone.
import { isMultiSpot } from './scoring.js';

/** Margin around the spots (in spot radii) of the picture shown in the preview of a live frame. */
export const PREVIEW_MARGIN = 1.25;
/** Margin around the spots (in spot radii) of the part of a picture that is analysed again. */
export const CLOSE_UP_MARGIN = 1.3;

/**
 * The box around the spots, each taken as a circle of its longer radius times `margin`: whole
 * pixels, cut to `bounds` ({ x, y, w, h }). The spots are in a picture that is `scale` times the
 * size of the one the box (and `bounds`) is in. Outside `bounds` the box comes out with w or h ≤ 0.
 */
export function spotsBox(spots, { margin, bounds, scale = 1 }) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of spots) {
    const rad = (Math.max(s.outer.rx, s.outer.ry) * margin) / scale;
    x0 = Math.min(x0, s.outer.cx / scale - rad);
    y0 = Math.min(y0, s.outer.cy / scale - rad);
    x1 = Math.max(x1, s.outer.cx / scale + rad);
    y1 = Math.max(y1, s.outer.cy / scale + rad);
  }
  x0 = Math.max(bounds.x, Math.floor(x0));
  y0 = Math.max(bounds.y, Math.floor(y0));
  x1 = Math.min(bounds.x + bounds.w, Math.ceil(x1));
  y1 = Math.min(bounds.y + bounds.h, Math.ceil(y1));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The live camera's scan frame on the full-size photo taken at the lock. `guide` is the frame in
 * video pixels ({ x, y, w, h }) with the video's size ({ width, height }); `photo` is { width, height }.
 * A phone's photo is often another shape than its video (4:3 against 16:9): the video is the middle
 * of the photo in the video's shape, so the photo shows more on two sides, which the frame leaves out.
 * A photo turned the other way than the video (landscape against portrait) turns the frame with it:
 * the frame is centred, so either way of turning gives the same box. Whole pixels, cut to the photo.
 */
export function guideInPhoto(guide, photo) {
  let { x, y, w, h, width: vw, height: vh } = guide;
  if (vw !== vh && photo.width !== photo.height && vw > vh !== photo.width > photo.height) {
    [x, y, w, h, vw, vh] = [y, x, h, w, vh, vw];
  }
  const k = Math.min(photo.width / vw, photo.height / vh);
  const ox = (photo.width - vw * k) / 2;
  const oy = (photo.height - vh * k) / 2;
  const x0 = Math.max(0, Math.floor(ox + x * k));
  const y0 = Math.max(0, Math.floor(oy + y * k));
  const x1 = Math.min(photo.width, Math.ceil(ox + (x + w) * k));
  const y1 = Math.min(photo.height, Math.ceil(oy + (y + h) * k));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Whether analysing just `box` shows the target in more detail than analysing all of `bounds`:
 * the box is a real one and clearly smaller than the whole.
 */
export function isCloseUp(box, bounds) {
  return box.w > 16 && box.h > 16 && box.w * box.h < 0.8 * bounds.w * bounds.h;
}

/**
 * How far a close-up's spot may differ from the whole look's in shape (the short axis over the
 * long one) and in size (its share of all the spots' area), before the close-up is not trusted.
 */
export const CLOSE_UP_SHAPE = 0.2;
export const CLOSE_UP_SIZE = 0.3;

/** A result's spots as { round: short axis / long axis, share: of all the spots' area }. */
function spotShapes(res) {
  const area = res.spots.map((s) => s.outer.rx * s.outer.ry);
  const all = area.reduce((a, v) => a + v, 0) || 1;
  return res.spots.map((s, k) => ({
    round: Math.min(s.outer.rx, s.outer.ry) / Math.max(s.outer.rx, s.outer.ry, 1e-9),
    share: area[k] / all,
  }));
}

/**
 * The two looks at a photo (the whole of it, then the close-up of the sheet): the close-up's
 * result is kept when it finds the face again, with at least as many spots, each of the same shape
 * and size as in the whole look. A shaft across a spot, sharper in the close-up, can cut its
 * coloured disc so that only a piece of it is taken for the spot: squashed, or too small.
 */
export function keepCloseUp(whole, closeUp) {
  if (closeUp.error || closeUp.spots.length < whole.spots.length) return false;
  if (closeUp.spots.length !== whole.spots.length || whole.spots.length < 2) return true;
  const w = spotShapes(whole);
  return spotShapes(closeUp).every(
    (c, k) =>
      Math.abs(c.round - w[k].round) <= CLOSE_UP_SHAPE &&
      Math.abs(c.share - w[k].share) <= CLOSE_UP_SIZE * w[k].share,
  );
}

/** A result with its picture coordinates moved: points by px / py, lengths times k. */
function moved(res, px, py, k) {
  return {
    ...res,
    spots: res.spots.map((s) => ({
      outer: { ...s.outer, cx: px(s.outer.cx), cy: py(s.outer.cy), rx: s.outer.rx * k, ry: s.outer.ry * k },
    })),
    arrows: res.arrows.map((a) => ({ ...a, image: { x: px(a.image.x), y: py(a.image.y) } })),
  };
}

/** A result read on a picture → the same result on the part `box` of it, enlarged `scale` times. */
export function resultOnCrop(res, box, scale) {
  return moved(
    res,
    (x) => (x - box.x) * scale,
    (y) => (y - box.y) * scale,
    scale,
  );
}

/**
 * The inverse: a result read on the part `box` of a picture, analysed at `cropScale` times its
 * size → the same result on the whole picture shown at `scale` times its size.
 */
export function resultOffCrop(res, box, cropScale, scale = 1) {
  return moved(
    res,
    (x) => (box.x + x / cropScale) * scale,
    (y) => (box.y + y / cropScale) * scale,
    scale / cropScale,
  );
}

/** A point of the picture → the face (relative to the centre of the spot with edge `outer`, spot radius 1). */
export function faceFromPicture(outer, p) {
  const cos = Math.cos(outer.angle);
  const sin = Math.sin(outer.angle);
  const vx = p.x - outer.cx;
  const vy = p.y - outer.cy;
  if (outer.px || outer.py) {
    // v·(1 + p·f) = E·f  →  (E − v·pᵀ)·f = v, with E the ellipse (a symmetric matrix)
    const e11 = cos * cos * outer.rx + sin * sin * outer.ry;
    const e12 = cos * sin * (outer.rx - outer.ry);
    const e22 = sin * sin * outer.rx + cos * cos * outer.ry;
    const a = e11 - vx * outer.px;
    const b = e12 - vx * outer.py;
    const c = e12 - vy * outer.px;
    const d = e22 - vy * outer.py;
    const det = a * d - b * c || 1e-12;
    return { x: (d * vx - b * vy) / det, y: (a * vy - c * vx) / det };
  }
  const u1 = (cos * vx + sin * vy) / outer.rx;
  const u2 = (-sin * vx + cos * vy) / outer.ry;
  return { x: cos * u1 - sin * u2, y: sin * u1 + cos * u2 };
}

/** A point of the face (relative to the centre of the spot with edge `outer`, spot radius 1) → the picture. */
export function pictureFromFace(outer, f) {
  const cos = Math.cos(outer.angle);
  const sin = Math.sin(outer.angle);
  const u1 = (cos * f.x + sin * f.y) * outer.rx;
  const u2 = (-sin * f.x + cos * f.y) * outer.ry;
  const w = 1 + (outer.px || 0) * f.x + (outer.py || 0) * f.y;
  return { x: outer.cx + (cos * u1 - sin * u2) / w, y: outer.cy + (sin * u1 + cos * u2) / w };
}

/**
 * The ring of radius `r` (a fraction of the spot's radius) of a spot as it lies in the picture:
 * `n` points around it, to draw as a closed line.
 */
export function ringPoints(outer, r, n = 72) {
  return holePoints(outer, { x: 0, y: 0 }, r, n);
}

/**
 * The hole an arrow makes, as it lies in the picture: `n` points round the circle of radius `r` (a
 * fraction of the spot's radius, scoring.js arrowRadius) about the face point `at`.
 */
export function holePoints(outer, at, r, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return pictureFromFace(outer, { x: at.x + r * Math.cos(t), y: at.y + r * Math.sin(t) });
  });
}

/**
 * The result with other arrows in place of its own: each (a place on the face, on its spot) is
 * put where it is in the result's picture.
 */
export function withArrows(res, arrows) {
  return {
    ...res,
    arrows: arrows.map((a) => ({
      ...a,
      image: pictureFromFace((res.spots[a.spot ?? 0] || res.spots[0]).outer, a),
    })),
  };
}

/**
 * Where a found arrow's score label sits on a picture of the given size: its centre and radius.
 * The label lies beside the point of impact, on a thin line that ends on the point, away from the
 * shaft, so the hit itself stays visible.
 */
export function arrowMarkLayout(width, height, spots, a, { long = false } = {}) {
  const o = (spots[a.spot ?? 0] || spots[0]).outer;
  const spotR = (o.rx + o.ry) / 2;
  const p = a.image;
  const r = Math.max(width / 45, Math.min(width / 18, 0.17 * spotR)); // the label's radius
  // On the far side of the point from the shaft (the shaft leans one way, the label goes the
  // other), so it never lies on the arrow. With no shaft seen: outwards from the spot's middle,
  // and for an arrow in the very middle up and to the right.
  let dx = p.x - o.cx;
  let dy = p.y - o.cy;
  const dist = Math.hypot(dx, dy);
  if (a.lean) {
    dx = -a.lean.x;
    dy = -a.lean.y;
  } else if (dist < 0.12 * spotR) {
    dx = 0.7;
    dy = -0.7;
  } else {
    dx /= dist;
    dy /= dist;
  }
  // `long`: where the labels are dragged by finger, the line is long enough that the finger on the
  // label does not cover the point of impact
  const reach = r + (long ? Math.max(0.75 * spotR, 3.4 * r) : Math.max(0.28 * spotR, 1.2 * r));
  return {
    r,
    lx: Math.max(r + 2, Math.min(width - r - 2, p.x + dx * reach)),
    ly: Math.max(r + 2, Math.min(height - r - 2, p.y + dy * reach)),
  };
}

/**
 * A found arrow moved to the point `p` of the picture (kept inside the picture, `size` =
 * { width, height }): its new place in the picture and on the face. On a sheet of several spots,
 * all of them in the picture, the arrow belongs to the spot it is nearest to; on a single face,
 * and when only a part of the sheet was seen (`res.partial`), it stays on its spot and is
 * measured from the first spot found.
 */
export function moveArrow(arrow, p, res, face, size) {
  const image = { x: Math.max(0, Math.min(size.width, p.x)), y: Math.max(0, Math.min(size.height, p.y)) };
  const single = res.partial || !isMultiSpot(face);
  let at = single ? faceFromPicture(res.spots[0].outer, image) : null;
  let spot = arrow.spot;
  if (!single) {
    res.spots.forEach((s, j) => {
      const f = faceFromPicture(s.outer, image);
      if (!at || Math.hypot(f.x, f.y) < Math.hypot(at.x, at.y)) {
        at = f;
        spot = j;
      }
    });
  }
  return { ...arrow, image, spot, x: at.x, y: at.y };
}
