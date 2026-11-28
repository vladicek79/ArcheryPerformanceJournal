// Best-effort arrow detection on a photo of the target (no library, no network, nothing stored).
// Works on RGBA pixels ({ width, height, data } like ImageData), so it can be unit-tested in Node.
//
// 1. Gold: the yellow centre of each spot is found by colour; its shape (centroid and second
//    moments, i.e. a fitted ellipse) gives the spot's centre, size and the camera's tilt.
// 2. Every pixel inside a spot is mapped to face coordinates (spot radius = 1) and compared with
//    the colour the ring there should have. Pixels that do not match (nocks, fletchings, shafts,
//    holes) are grouped into blobs; the biggest blobs are the arrows, at their centroids.
// The result is approximate by design: the archer moves any arrow that landed in the wrong place.
import { isSpotFace, isMultiSpot, spotCentres, colourBands } from './scoring.js';
import { faceFromPicture } from './scanGeometry.js';
import { fitSpotToEdges } from './spotFit.js';

/** Colour class of one pixel: 'gold' | 'red' | 'blue' | 'black' | 'white' | 'other'. */
export function colourClass(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.27) return 'black';
  if (s < 0.2) return v > 0.7 ? 'white' : 'other';
  let h;
  const d = max - min;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 38 && h <= 72 && s > 0.4 && v > 0.45) return 'gold';
  if ((h <= 20 || h >= 335) && s > 0.4) return 'red';
  if (h >= 180 && h <= 225 && s > 0.3) return 'blue';
  return 'other';
}

/**
 * Radius of the gold and red together (rings 10 to 7 on a 10–6 spot, 10 to 7 on a full face) in face
 * units: 0.8 on spots, 2/3 on the 6-ring face, 0.4 on full faces. This filled disc is what a spot is measured by: it is big,
 * so a shaft or a few holes across it barely move its centre or size.
 */
const coreRadius = (face) => colourBands(face).find((b) => b.zone === 'red').edge;

/** The colour a face should have at distance `d` from its centre (radius 1), or null near a ring edge. */
export function expectedColour(d, face, margin = 0.05) {
  const bands = colourBands(face);
  if (bands.some((b) => Math.abs(d - b.edge) < margin)) return null;
  return bands.find((b) => d < b.edge)?.zone ?? null;
}

/** Connected components (8-neighbour) of a mask; returns [{ area, sx, sy, px: [indices] }]. */
function components(mask, width, height, minArea) {
  const labels = new Int32Array(mask.length);
  const out = [];
  const stack = [];
  let next = 1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    const px = [];
    labels[i] = next;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      px.push(j);
      const x = j % width;
      const y = (j / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const k = yy * width + xx;
          if (mask[k] && !labels[k]) {
            labels[k] = next;
            stack.push(k);
          }
        }
      }
    }
    next++;
    if (px.length >= minArea) out.push({ area: px.length, px });
  }
  return out;
}

/** Ellipse fitted to a filled blob by its moments: centre, semi-axes a ≥ b and the major axis angle. */
function fitEllipse(px, width) {
  let mx = 0;
  let my = 0;
  for (const i of px) {
    mx += i % width;
    my += (i / width) | 0;
  }
  mx /= px.length;
  my /= px.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const i of px) {
    const dx = (i % width) - mx;
    const dy = ((i / width) | 0) - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= px.length;
  syy /= px.length;
  sxy /= px.length;
  const tr = (sxx + syy) / 2;
  const det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const l1 = tr + det;
  const l2 = Math.max(1e-9, tr - det);
  // a filled ellipse with semi-axes a, b has variance a²/4 and b²/4 along its axes
  return { cx: mx, cy: my, a: 2 * Math.sqrt(l1), b: 2 * Math.sqrt(l2), angle: 0.5 * Math.atan2(2 * sxy, sxx - syy) };
}

/**
 * A spot found in the image: `outer` is how it lies in the picture (see scanGeometry.js), and
 * toFace maps image pixels to face coordinates (its radius = 1).
 */
function spotOf(outer) {
  return {
    cx: outer.cx,
    cy: outer.cy,
    toFace(x, y) {
      return faceFromPicture(outer, { x, y });
    },
    outer,
  };
}

/**
 * A spot from the ellipse fitted to its gold and red (the blob found by colour), then fitted to
 * its printed ring edges where the picture shows them (spotFit.js).
 */
function makeSpot(e, face, img, refine) {
  const k = coreRadius(face);
  // the blob's ellipse scaled out to the face's edge; the tilt squashes it, the photo stays upright
  const blob = { cx: e.cx, cy: e.cy, rx: e.a / k, ry: e.b / k, angle: e.angle };
  return spotOf(refine ? fitSpotToEdges(img, blob, face) : blob);
}

/** A spot's shape: how round it is in the picture (short axis / long axis) and its area. */
const shapeOf = (o) => ({ round: Math.min(o.rx, o.ry) / Math.max(o.rx, o.ry, 1e-9), area: o.rx * o.ry });
const sameShape = (p, q, round, area) =>
  Math.abs(p.round - q.round) <= round && p.area / q.area <= area && q.area / p.area <= area;

/**
 * A spot of a sheet that does not look like its sheet-mates, put right. The spots of a sheet are
 * printed alike and lie on one plane, so in a photo they have nearly the same size and shape. A
 * shaft lying across a spot can cut its coloured disc into pieces, and a piece taken for the whole
 * spot is squashed or too small (seen on real photos). Such a spot — when the others agree with
 * each other — is put where the others say it is (the sheet's layout, from two of them), with
 * their size and shape, and then fitted to its own printed ring edges.
 * `spots` are in the sheet's order (orderSpots); returns them, the odd one replaced.
 */
export function fixOddSpot(spots, face, img, refine = true) {
  const layout = spotCentres(face);
  if (spots.length !== layout.length || spots.length < 3) return spots;
  const shapes = spots.map((s) => shapeOf(s.outer));
  const odd = shapes.findIndex((s, k) => {
    const others = shapes.filter((_, j) => j !== k);
    if (!others.every((o) => sameShape(o, others[0], 0.12, 1.35))) return false;
    const mean = { round: others.reduce((a, o) => a + o.round, 0) / others.length, area: others.reduce((a, o) => a + o.area, 0) / others.length };
    return !sameShape(s, mean, 0.2, 1.6);
  });
  if (odd < 0) return spots;
  // the sheet's layout → the picture, from two good spots (a similarity: shift, turn, scale)
  const [i, j] = [0, 1, 2].filter((k) => k !== odd);
  const a = spots[i].outer;
  const b = spots[j].outer;
  const [sx, sy] = [layout[j][0] - layout[i][0], layout[j][1] - layout[i][1]];
  const [px, py] = [b.cx - a.cx, b.cy - a.cy];
  const n = sx * sx + sy * sy;
  const re = (px * sx + py * sy) / n;
  const im = (py * sx - px * sy) / n;
  const [ox, oy] = [layout[odd][0] - layout[i][0], layout[odd][1] - layout[i][1]];
  // shaped as its nearest good sheet-mate
  const near = Math.hypot(layout[i][0] - layout[odd][0], layout[i][1] - layout[odd][1]) <= Math.hypot(layout[j][0] - layout[odd][0], layout[j][1] - layout[odd][1]) ? a : b;
  const guess = { ...near, cx: a.cx + re * ox - im * oy, cy: a.cy + im * ox + re * oy };
  let outer = guess;
  if (refine) {
    const fitted = fitSpotToEdges(img, guess, face);
    // the fit only when it keeps the sheet-mates' shape, and stays near where they say it is
    if (sameShape(shapeOf(fitted), shapeOf(near), 0.12, 1.35) && Math.hypot(fitted.cx - guess.cx, fitted.cy - guess.cy) < 0.25 * (near.rx + near.ry) / 2)
      outer = fitted;
  }
  return spots.map((s, k) => (k === odd ? spotOf(outer) : s));
}

/** How many of the biggest discs are tried as spots of the sheet (12 discs: 220 sets of three). */
const SHEET_CANDIDATES = 12;
/** How far the discs may lie from the sheet's layout (rms, in spot radii): room for perspective. */
const SHEET_FIT = 0.35;
/**
 * How far a sheet may be turned in the photo (radians, about 35°). A sheet hangs upright and the
 * photo is upright: without this, three sheets side by side show a row of spots spaced almost as a
 * triple sheet's column.
 */
const SHEET_TURN = 0.6;

/**
 * The discs (gold and red, biggest first) that are the spots of the one sheet the photo is of. A
 * photo from the camera app shows the sheets beside it too, and the biggest discs are then not
 * always one sheet's: a nearer neighbour's spot can be bigger, and an L of spots from two sheets
 * was read as one. A set of discs counts as a sheet when the discs lie as the sheet's layout does
 * (turned up to SHEET_TURN, scaled and moved, within SHEET_FIT) and are as big as that scale says; of those sets the
 * one nearest the middle of the photo is taken, as the archer aims at their own sheet. A single
 * face, a photo of fewer discs, or one where no set lies as a sheet: the biggest discs, as before.
 */
function pickSheet(golds, face, width, height) {
  const layout = spotCentres(face);
  const want = layout.length;
  if (want < 2 || golds.length <= want) return golds.slice(0, want);
  const core = coreRadius(face);
  const discs = golds.slice(0, SHEET_CANDIDATES).map((g) => {
    const e = fitEllipse(g.px, width);
    return { g, x: e.cx, y: e.cy, r: Math.sqrt(e.a * e.b) };
  });
  let best = null;
  for (const set of subsets(discs, want)) {
    if (!liesAsSheet(set, layout, core)) continue;
    const off = Math.hypot(
      set.reduce((s, d) => s + d.x, 0) / want - width / 2,
      set.reduce((s, d) => s + d.y, 0) / want - height / 2,
    );
    if (!best || off < best.off) best = { set, off };
  }
  return best ? best.set.map((d) => d.g) : golds.slice(0, want);
}

/** Every set of `k` of the items, in their order. */
function subsets(items, k, from = 0) {
  if (k === 0) return [[]];
  const out = [];
  for (let i = from; i <= items.length - k; i++) {
    for (const rest of subsets(items, k - 1, i + 1)) out.push([items[i], ...rest]);
  }
  return out;
}

/**
 * Whether the discs ({ x, y, r } in pixels) lie as the sheet's spots: some order of them fits the
 * layout (face units, a spot's radius = 100) by a turn of at most SHEET_TURN, scale and shift (least
 * squares) within SHEET_FIT spot radii, and each disc's radius is about the core's (`core`, a fraction of a spot's
 * radius) at that scale.
 */
function liesAsSheet(discs, layout, core) {
  const n = layout.length;
  const lx = layout.reduce((s, p) => s + p[0], 0) / n;
  const ly = layout.reduce((s, p) => s + p[1], 0) / n;
  const px = discs.reduce((s, d) => s + d.x, 0) / n;
  const py = discs.reduce((s, d) => s + d.y, 0) / n;
  for (const order of permutations(discs)) {
    // the similarity layout → picture as a complex factor a: p - p̄ = a (l - l̄)
    let re = 0;
    let im = 0;
    let norm = 0;
    order.forEach((d, k) => {
      const [ux, uy] = [layout[k][0] - lx, layout[k][1] - ly];
      const [vx, vy] = [d.x - px, d.y - py];
      re += ux * vx + uy * vy;
      im += ux * vy - uy * vx;
      norm += ux * ux + uy * uy;
    });
    const [ar, ai] = [re / norm, im / norm];
    const spotPx = Math.hypot(ar, ai) * 100;
    if (!(spotPx > 0) || Math.abs(Math.atan2(ai, ar)) > SHEET_TURN) continue;
    let err = 0;
    order.forEach((d, k) => {
      const [ux, uy] = [layout[k][0] - lx, layout[k][1] - ly];
      err += (px + ar * ux - ai * uy - d.x) ** 2 + (py + ai * ux + ar * uy - d.y) ** 2;
    });
    const sized = order.every((d) => d.r > 0.6 * core * spotPx && d.r < 1.6 * core * spotPx);
    if (sized && Math.sqrt(err / n) <= SHEET_FIT * spotPx) return true;
  }
  return false;
}

/** Every order of the items. */
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Put the found spots in the sheet's order (triple: top to bottom; Vegas: top, bottom left, bottom right). */
function orderSpots(spots, face) {
  // by the sheet's layout, so any triple or Vegas sheet (60 cm, compound) is ordered alike
  const layout = spotCentres(face);
  if (layout.length < 2) return spots;
  if (layout.every(([x]) => x === 0)) return [...spots].sort((p, q) => p.cy - q.cy);
  const [top, ...rest] = [...spots].sort((p, q) => p.cy - q.cy);
  return [top, ...rest.sort((p, q) => p.cx - q.cx)];
}

/**
 * Detect the face and up to `maxArrows` arrows.
 * Returns { spots, arrows } with arrows [{ x, y, spot, area }] in face units relative to their spot's
 * centre (as stored for logged arrows; `spot` is null on single faces), or { error } when no face
 * was found.
 */
export function detectArrows(img, face, maxArrows, { debug = false, spotHint = 0, shaftGap = null, refine = true } = {}) {
  const { width, height, data } = img;
  const n = width * height;
  const cls = new Array(n);
  const core = new Uint8Array(n);
  const gold = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = colourClass(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    cls[i] = c;
    if (c === 'gold') gold[i] = 1;
    if (c === 'gold' || c === 'red') core[i] = 1;
  }

  const wantSpots = spotCentres(face).length;
  // Each spot's gold + red disc. A shaft lying across it can cut it into pieces: pieces close
  // together are one spot. A red or yellow thing that is not a target has (almost) no gold in it.
  const golds = pickSheet(
    mergeNearby(components(core, width, height, Math.max(12, n * 0.0004)), width)
      .filter((g) => g.area >= n * 0.004 && g.px.filter((i) => gold[i]).length >= 0.08 * g.area)
      .sort((p, q) => q.area - p.area),
    face,
    width,
    height,
  );
  if (!golds.length) return { error: 'Could not find the target face in the photo.' };
  // A photo of a three-spot sheet may show fewer spots (a close-up of one): then only the biggest
  // spot found is used, and its arrows go on the sheet's spot `spotHint`.
  const partial = golds.length < wantSpots;
  const spots = partial
    ? [makeSpot(fitEllipse(golds[0].px, width), face, img, refine)]
    : fixOddSpot(
        orderSpots(
          golds.map((g) => makeSpot(fitEllipse(g.px, width), face, img, refine)),
          face,
        ),
        face,
        img,
        refine,
      );

  // pixels that do not have the colour their ring should have
  const odd = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = (i / width) | 0;
    let best = null;
    for (let s = 0; s < spots.length; s++) {
      const p = spots[s].toFace(x, y);
      const d = Math.hypot(p.x, p.y);
      if (!best || d < best.d) best = { d };
    }
    if (best.d >= 1.02) continue;
    const want = expectedColour(best.d, face);
    // bright white on a coloured ring is glare (light on glossy paper), not an arrow
    if (want && cls[i] !== want && !(cls[i] === 'white' && want !== 'white' && want !== 'black')) odd[i] = 1;
  }
  // close small gaps so a nock, its fletching and the shaft make one blob
  const grown = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!odd[i]) continue;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height) grown[yy * width + xx] = 1;
      }
    }
  }

  const spotPx = spots.reduce((sum, s) => sum + (s.outer.rx + s.outer.ry) / 2, 0) / spots.length; // a spot's radius in px
  // the nearest spot of an image point, and the point relative to its centre (spot radius 1)
  const nearest = (ix, iy) => {
    let best = null;
    spots.forEach((s, k) => {
      const p = s.toFace(ix, iy);
      const d = Math.hypot(p.x, p.y);
      if (!best || d < best.d) best = { d, p, k };
    });
    return best;
  };

  // 1) Shafts seen from the side: long, straight, dark lines over the sheet. Found with a Hough
  //    transform (every dark pixel votes for the lines through it), so old holes (scattered dots)
  //    and the ring lines (curved) do not count. The arrow is at the end of the line inside a face.
  const rejects = debug ? [] : null;
  const trace = debug ? {} : null;
  const shafts = findShafts({ width, height, data, nearest, spotPx, face, rejects, trace, shaftGap });

  // 2) Nocks / fletchings seen head-on: big compact blobs of colour that does not belong to the ring
  //    under it (only used for arrows the shafts did not account for).
  const blobs = [];
  for (const b of components(grown, width, height, Math.max(6, 0.006 * spotPx * spotPx))) {
    const e = fitEllipse(b.px, width);
    // skip blobs that sit on a shaft already found (its fletching or a piece of it)
    if (shafts.some((sh) => distToSegment(e.cx, e.cy, sh.a, sh.b) < 0.12 * spotPx)) continue;
    if (e.a > 2.2 * e.b) {
      // Long: a thin sliver is ring-edge noise. A wide one is a thick shaft in a close-up (often
      // light or coloured, so the dark-line search misses it): the arrow is at its inner end.
      if (2 * e.b < 0.07 * spotPx) continue;
      const cos = Math.cos(e.angle);
      const sin = Math.sin(e.angle);
      let tMin = Infinity;
      let tMax = -Infinity;
      for (const i of b.px) {
        const t = ((i % width) - e.cx) * cos + (((i / width) | 0) - e.cy) * sin;
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
      }
      const ends = [tMin, tMax].map((t) => {
        const x = e.cx + t * cos;
        const y = e.cy + t * sin;
        return { x, y, at: nearest(x, y) };
      });
      ends.sort((p, q) => p.at.d - q.at.d);
      if (ends[0].at.d > 0.95 || ends[1].at.d < ends[0].at.d + 0.25) continue;
      blobs.push({ rank: tMax - tMin, image: { x: ends[0].x, y: ends[0].y }, at: ends[0].at, area: b.area });
      continue;
    }
    const at = nearest(e.cx, e.cy);
    blobs.push({ rank: Math.sqrt(b.area), image: { x: e.cx, y: e.cy }, at, area: b.area });
  }

  const candidates = [
    ...shafts.map((sh) => {
      // which way the shaft leans in the picture (from the point towards the nock)
      const far = sh.tip === sh.a ? sh.b : sh.a;
      const len = Math.hypot(far.x - sh.tip.x, far.y - sh.tip.y) || 1;
      const lean = { x: (far.x - sh.tip.x) / len, y: (far.y - sh.tip.y) / len };
      // The shaft's end in the picture is the far edge of its hole: the arrow (the hole's centre) is
      // half the shaft's width back along it. Measured on real photos, this beats the end itself.
      const back = sh.back ?? sh.half;
      const image = sh.half ? { x: sh.tip.x + back * lean.x, y: sh.tip.y + back * lean.y } : sh.tip;
      const at = sh.half ? nearest(image.x, image.y) : sh.tipAt;
      return { rank: 1e6 + sh.length, image, at, area: Math.round(sh.length), lean };
    }),
    ...blobs,
  ];

  // best first; on a three-spot sheet the best arrow of each spot comes before a second arrow on
  // any spot (one arrow per spot is the usual way to shoot them)
  candidates.sort((p, q) => q.rank - p.rank);
  const firstOfSpot = new Set();
  const ordered = isMultiSpot(face) && !partial
    ? [
        ...candidates.filter((c) => !firstOfSpot.has(c.at.k) && firstOfSpot.add(c.at.k)),
        ...candidates.filter((c, i) => candidates.findIndex((o) => o.at.k === c.at.k) !== i),
      ]
    : candidates;
  // A gate for sheets with several spots: the arrows asked for are spread over the spots (three
  // arrows on a three-spot sheet: one per spot), so one spot never takes them all. A close-up of a
  // single spot gives that spot's share only.
  const perSpot = isMultiSpot(face) ? Math.max(1, Math.ceil(Math.max(0, maxArrows) / wantSpots)) : Infinity;
  const taken = new Map();
  const arrows = ordered
    .filter((c) => {
      const key = partial ? 0 : c.at.k;
      const n = taken.get(key) ?? 0;
      if (n >= perSpot) return false;
      taken.set(key, n + 1);
      return true;
    })
    .slice(0, Math.max(0, maxArrows))
    // always in the same order, whatever was found first: spot by spot in the sheet's order (top
    // to bottom on a triple), and on one spot from the middle outwards (the best arrow first)
    .sort((p, q) => (partial ? 0 : p.at.k - q.at.k) || p.at.d - q.at.d)
    .map((c) => ({
      x: c.at.p.x,
      y: c.at.p.y,
      spot: isMultiSpot(face) ? (partial ? spotHint : c.at.k) : null,
      area: c.area,
      image: c.image,
      lean: c.lean ?? null, // for a shaft seen from the side; null for a nock seen head-on
    }));

  return debug ? { spots, arrows, partial, debug: { odd, grown, shafts, blobs, rejects, dark: trace.dark } } : { spots, arrows, partial };
}

/** Merge blobs whose centres are close (pieces of one gold cut apart by a shaft). */
function mergeNearby(blobs, width) {
  const groups = [];
  for (const b of [...blobs].sort((p, q) => q.area - p.area)) {
    let sx = 0;
    let sy = 0;
    for (const i of b.px) {
      sx += i % width;
      sy += (i / width) | 0;
    }
    const c = { x: sx / b.area, y: sy / b.area };
    const home = groups.find((g) => Math.hypot(g.c.x - c.x, g.c.y - c.y) < 1.3 * Math.sqrt(g.area / Math.PI));
    if (home) {
      home.px = home.px.concat(b.px);
      home.c = { x: (home.c.x * home.area + c.x * b.area) / (home.area + b.area), y: (home.c.y * home.area + c.y * b.area) / (home.area + b.area) };
      home.area += b.area;
    } else groups.push({ px: b.px, area: b.area, c });
  }
  return groups;
}

/** Distance from point (x, y) to the segment a–b (image px). */
function distToSegment(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * Arrow shafts as straight dark lines near the spots. Returns [{ a, b, length, tip, tipAt }]: the
 * dark run along the line (a–b) and its end inside a face (the arrow's entry point).
 */
function findShafts({ width, height, data, nearest, spotPx, face, rejects = null, trace = null, shaftGap = null }) {
  const bright = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  // How bright each ring is in this photo (the median of the pixels where the ring should be, so
  // it does not depend on the light: a blue ring in a dim hall is not "blue" by its colour). A shaft
  // over a ring is "dark" when it is clearly darker than that ring, even if it is brownish rather
  // than black (carbon in the light, wood): otherwise the line would stop where the shaft enters
  // the gold.
  const hist = {
    gold: new Int32Array(256),
    red: new Int32Array(256),
    blue: new Int32Array(256),
    black: new Int32Array(256),
    white: new Int32Array(256),
  };
  // …and each ring's colour in this photo (the median of each channel), to tell a shaft that is not
  // dark from the ring under it
  const histRgb = Object.fromEntries(Object.keys(hist).map((z) => [z, [new Int32Array(256), new Int32Array(256), new Int32Array(256)]]));
  const dist = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const d = nearest(i % width, (i / width) | 0).d;
    dist[i] = d;
    const zone = d < 1 ? expectedColour(d, face, 0.03) : null;
    if (!zone) continue;
    hist[zone][bright(i)]++;
    for (let c = 0; c < 3; c++) histRgb[zone][c][data[i * 4 + c]]++;
  }
  const medianOf = (hgram) => {
    const total = hgram.reduce((p, q) => p + q, 0);
    let seen = 0;
    for (let v = 0; v < 256 && total; v++) {
      seen += hgram[v];
      if (seen * 2 >= total) return v;
    }
    return null;
  };
  const ringRgb = Object.fromEntries(Object.entries(histRgb).map(([z, h]) => [z, h.map(medianOf)]));
  const refs = {};
  for (const [zone, hgram] of Object.entries(hist)) {
    const total = hgram.reduce((p, q) => p + q, 0);
    let seen = 0;
    for (let v = 0; v < 256 && total; v++) {
      seen += hgram[v];
      if (seen * 2 >= total) {
        refs[zone] = v;
        break;
      }
    }
  }
  // The light is not even over the sheet: a ring in the shade of one side can be darker than "clearly
  // darker than the ring's median". So a dark pixel must also be darker than what is around it
  // (the mean brightness of a small window, from a summed-area table).
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += bright(y * width + x);
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
    }
  }
  const half = Math.max(3, Math.round(0.15 * spotPx));
  const around = (x, y) => {
    const x1 = Math.max(0, x - half);
    const y1 = Math.max(0, y - half);
    const x2 = Math.min(width, x + half + 1);
    const y2 = Math.min(height, y + half + 1);
    const total = sums[y2 * (width + 1) + x2] - sums[y1 * (width + 1) + x2] - sums[y2 * (width + 1) + x1] + sums[y1 * (width + 1) + x1];
    return total / ((x2 - x1) * (y2 - y1));
  };
  // Is the black ring of a full face really there, and black? Indoor faces of 60 and 80 cm are
  // often printed only out to the blue (the 10-6 centre): where the black ring would be there is
  // white paper, or whatever is behind the sheet. Then that zone is like any other, and a shaft
  // shows on it; with a real black ring a dark shaft cannot be seen there.
  const hasBlack = !isSpotFace(face) && refs.black != null && refs.black < 110 && refs.black <= 0.6 * (refs.blue ?? 255);
  if (hasBlack) delete refs.black;
  const maxRef = Math.max(0, ...Object.values(refs));
  const raw = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const v = bright(i);
    if (v > Math.max(125, 0.78 * maxRef)) continue;
    const d = dist[i];
    if (d >= 1) {
      if (v <= 125) raw[i] = 1; // off the faces: plainly dark
      continue;
    }
    // On a face, dark means clearly darker than the ring under it. In dim light a whole ring (the
    // blue) can be darker than any fixed limit, and the shaft would vanish on it. On a ring line
    // the colour under the shaft is one of the two rings: it must be darker than both, or the line
    // would break at every ring it crosses.
    const ref = Math.min(...[d - 0.03, d + 0.03].map((dd) => (dd >= 1 ? Infinity : (refs[expectedColour(Math.max(0, dd), face, 0)] ?? 160))));
    if (v <= 0.78 * ref && v <= 0.85 * around(i % width, (i / width) | 0)) raw[i] = 1;
  }
  // dark pixels on or around the faces (the sheet), but not on a full face's black rings
  const isDarkPx = (i) => raw[i] === 1;
  // A shaft is thin: a dark pixel only counts when the dark run through it is short across (in x
  // or in y). That drops big dark areas (a table or wall behind the sheet, shadows).
  const maxThick = Math.max(6, Math.round(0.16 * spotPx));
  const thinAt = (x, y) => {
    let w = 1;
    for (let xx = x - 1; xx >= 0 && w <= maxThick && isDarkPx(y * width + xx); xx--) w++;
    for (let xx = x + 1; xx < width && w <= maxThick && isDarkPx(y * width + xx); xx++) w++;
    if (w <= maxThick) return true;
    let hgt = 1;
    for (let yy = y - 1; yy >= 0 && hgt <= maxThick && isDarkPx(yy * width + x); yy--) hgt++;
    for (let yy = y + 1; yy < height && hgt <= maxThick && isDarkPx(yy * width + x); yy++) hgt++;
    return hgt <= maxThick;
  };
  const dark = new Uint8Array(width * height);
  const pts = [];
  for (let i = 0; i < width * height; i++) {
    if (!isDarkPx(i)) continue;
    const x = i % width;
    const y = (i / width) | 0;
    const at = nearest(x, y);
    // Stay near the faces: what is behind the sheet is full of lines. But well past their edge: a
    // shaft in the outer ring lies mostly over the paper between the spots.
    if (at.d > 1.8) continue;
    if (hasBlack && at.d > 0.58 && at.d < 0.82) continue;
    if (!thinAt(x, y)) continue;
    dark[i] = 1;
    pts.push(x, y);
  }
  if (trace) trace.dark = dark;
  if (pts.length < 4) return [];

  // Hough accumulator: angle in 1° steps, distance from the origin in 1 px steps
  const T = 180;
  const D = Math.ceil(Math.hypot(width, height));
  const acc = new Int32Array(T * (2 * D + 1));
  const cosT = new Float64Array(T);
  const sinT = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    cosT[t] = Math.cos((t * Math.PI) / T);
    sinT[t] = Math.sin((t * Math.PI) / T);
  }
  for (let k = 0; k < pts.length; k += 2) {
    const x = pts[k];
    const y = pts[k + 1];
    for (let t = 0; t < T; t++) acc[t * (2 * D + 1) + Math.round(x * cosT[t] + y * sinT[t]) + D]++;
  }

  const isDark = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const xx = xi + ox;
        const yy = yi + oy;
        if (xx >= 0 && yy >= 0 && xx < width && yy < height && dark[yy * width + xx]) return true;
      }
    }
    return false;
  };

  const blackZone = (x, y) => {
    if (!hasBlack) return false;
    const d = nearest(x, y).d;
    return d > 0.56 && d < 0.84;
  };

  // small breaks in a shaft (glare, a pale stretch) are bridged; a real gap, like the distance to an
  // old hole further along the line, ends it. Tuned on real photos: 4 px, a little more on big spots.
  const maxGap = shaftGap ?? Math.max(4, Math.round(0.03 * spotPx));
  // a single face fills the picture, so less of a shaft is in it before the picture's edge cuts it off
  const minRun = (isMultiSpot(face) ? 0.45 : 0.25) * spotPx;
  /** The longest dark run on the line through (px, py) along the unit vector (dx, dy). */
  const longestRun = (px, py, dx, dy) => {
    let run = null;
    let cur = null;
    let gap = 0;
    for (let u = -D; u <= D; u++) {
      const x = px + u * dx;
      const y = py + u * dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (isDark(x, y)) {
        if (!cur) cur = { u0: u, u1: u };
        cur.u1 = u;
        gap = 0;
      } else if (cur && blackZone(x, y)) {
        // a dark shaft cannot be seen on a full face's black rings: the line carries on across them
      } else if (cur) {
        gap++;
        // a shaft is one unbroken line: a wider gap ends it, so the run does not carry on over old
        // holes that happen to lie beyond the point
        if (gap > maxGap) {
          if (!run || cur.u1 - cur.u0 > run.u1 - run.u0) run = cur;
          cur = null;
          gap = 0;
        }
      }
    }
    if (cur && (!run || cur.u1 - cur.u0 > run.u1 - run.u0)) run = cur;
    if (!run) return null;
    return seg(px, py, dx, dy, run.u0, run.u1);
  };
  const seg = (px, py, dx, dy, u0, u1) => ({
    px,
    py,
    dx,
    dy,
    u0,
    u1,
    a: { x: px + u0 * dx, y: py + u0 * dy },
    b: { x: px + u1 * dx, y: py + u1 * dy },
    length: u1 - u0,
  });
  /**
   * Old holes in line with the shaft, just past its point, are short dark bits behind a small
   * break; the shaft itself is one solid line. So short bits at the point end of the run (each
   * shorter than a hole and a little more), cut off from the rest by a break, are dropped.
   * Only for a line fitted to the shaft: a line a few degrees off leaves the shaft by itself.
   */
  const trimPoint = ({ px, py, dx, dy, u0, u1 }) => {
    const at = (u, side) => {
      const xi = Math.round(px + u * dx - side * dy);
      const yi = Math.round(py + u * dy + side * dx);
      return xi >= 0 && yi >= 0 && xi < width && yi < height && dark[yi * width + xi] === 1;
    };
    // on the line or one pixel to either side of it
    const solid = (u) => at(u, 0) || at(u, 1) || at(u, -1);
    const bit = Math.max(6, Math.round(0.2 * spotPx));
    const dAt = (u) => nearest(px + u * dx, py + u * dy).d;
    const dir = dAt(u0) <= dAt(u1) ? 1 : -1; // from the point (the end nearer a spot's middle) inwards
    const end = dir > 0 ? u1 : u0;
    let tip = dir > 0 ? u0 : u1;
    for (;;) {
      let u = tip;
      while (u !== end && !solid(u)) u += dir; // the run's end has a pixel of slack
      const first = u;
      while (u !== end && u - first !== dir * (bit + 1) && solid(u)) u += dir;
      if (u === end || Math.abs(u - first) > bit) {
        tip = first;
        break;
      }
      let gap = 0;
      while (u !== end && !solid(u)) {
        u += dir;
        gap++;
      }
      if (u === end) break;
      if (gap < 2) {
        // a one-pixel nick: not a break. Look on from here, keeping the point where it was.
        let v = u;
        while (v !== end && Math.abs(v - first) <= bit && solid(v)) v += dir;
        if (v === end || Math.abs(v - first) > bit) {
          tip = first;
          break;
        }
      }
      tip = u; // drop the bit and the break behind it
    }
    return dir > 0 ? seg(px, py, dx, dy, tip, u1) : seg(px, py, dx, dy, u0, tip);
  };
  /** Least-squares line through the dark pixels within a few px of the segment a-b. */
  const fitLine = (a, b) => {
    const reach = 3;
    let m = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    const x1 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach));
    const x2 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + reach));
    const y1 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach));
    const y2 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + reach));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (!dark[y * width + x] || distToSegment(x, y, a, b) > reach) continue;
        m++;
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
        syy += y * y;
      }
    }
    if (m < 8) return null;
    const mx = sx / m;
    const my = sy / m;
    const angle = 0.5 * Math.atan2(2 * (sxy / m - mx * my), sxx / m - mx * mx - (syy / m - my * my));
    return { x: mx, y: my, dx: Math.cos(angle), dy: Math.sin(angle) };
  };

  /**
   * Where the shaft really ends. The dark run often carries on a few px past it: onto a ring line, the
   * shaft's shadow or an old hole next to the point. But the shaft is a band of one width, and those are
   * not: walking from the shaft's solid part to its point, the shaft ends where less than half of
   * the middle of that band is dark. Also gives the shaft's half width (px). The arrow's hole is that big.
   */
  const shaftEnd = (s) => {
    const { px, py, dx, dy, u0, u1 } = s;
    const darkAt = (u, side) => {
      const xi = Math.round(px + u * dx - side * dy);
      const yi = Math.round(py + u * dy + side * dx);
      return xi >= 0 && yi >= 0 && xi < width && yi < height && dark[yi * width + xi] === 1;
    };
    const dAt = (u) => nearest(px + u * dx, py + u * dy).d;
    const dir = dAt(u0) <= dAt(u1) ? 1 : -1; // from the point inwards (towards the nock)
    const point = dir > 0 ? u0 : u1;
    const len = u1 - u0;
    // the shaft's width: the dark run across it, measured along its solid stretch
    const widths = [];
    for (let k = 0.2 * len; k <= 0.6 * len; k++) {
      const u = point + dir * k;
      const side = [0, -1, 1].find((o) => darkAt(u, o));
      if (side == null) continue;
      let lo = side;
      let hi = side;
      while (side - lo < maxThick && darkAt(u, lo - 1)) lo--;
      while (hi - side < maxThick && darkAt(u, hi + 1)) hi++;
      widths.push(hi - lo + 1);
    }
    if (widths.length < 5) return s;
    widths.sort((p, q) => p - q);
    const half = widths[widths.length >> 1] / 2;
    const band = Math.max(1, Math.floor(0.6 * half));
    const cover = (u) => {
      let n = 0;
      for (let o = -band; o <= band; o++) if (darkAt(u, o)) n++;
      return n / (2 * band + 1);
    };
    // walk to the point and a little past it (the run may stop short at a pale stretch)
    // A pale gap of up to half the shaft's width, at least 3 px (glare on the shaft), is crossed when
    // solid shaft (3 half widths) follows it: a shorter dark bit after a gap is an old hole.
    const bridge = Math.max(3, half);
    const after = 3 * half;
    // A shaft is not dark all along: a band of another colour (a wrap, a label, the bright metal of
    // the point's shank) can be much longer than glare, and behind it the shaft goes on to its
    // point, often a ring or two further in. Such a band lies over the paper: along it the picture
    // does not show the ring's own colour, as it does in the gap between a shaft's end and an old
    // hole further on. So a gap that hides the paper may be long, when solid shaft follows it.
    // (only for a line as wide as a shaft: a hairline is a shadow or a ring line, and must not be pieced together)
    const longGap = half >= 1.5 ? Math.max(bridge, 0.22 * spotPx) : bridge;
    const hidesPaper = (u) => {
      const x = Math.round(px + u * dx);
      const y = Math.round(py + u * dy);
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const d = nearest(x, y).d;
      const i = (y * width + x) * 4;
      const seen = colourClass(data[i], data[i + 1], data[i + 2]);
      // (near a ring line the paper is either ring's colour)
      return ![d - 0.02, d + 0.02].some((dd) => seen === (dd < 1 ? expectedColour(Math.max(0, dd), face, 0) : 'white'));
    };
    let last = null; // the shaft's end so far (k: distance from the point inwards)
    let gap = 0; // the pale stretch since then
    let hidden = 0; // …and how much of it hides the paper
    let stretch = null; // solid again after a gap: from where (it counts once it is long enough)
    // The shaft is a band of one width, lying on its line. Where old holes crowd (the shot-out
    // middle of a spot) the dark carries on past its end, but in blobs of any width, to either
    // side: that is not the shaft any more.
    const wide = 1.7 * 2 * half + 1;
    const shaftLike = (u) => {
      if (cover(u) < 0.5) return false;
      const mid = [0, -1, 1].find((o) => darkAt(u, o));
      if (mid == null) return false;
      let lo = mid;
      let hi = mid;
      while (mid - lo <= wide && darkAt(u, lo - 1)) lo--;
      while (hi - mid <= wide && darkAt(u, hi + 1)) hi++;
      return hi - lo + 1 <= wide && Math.abs((lo + hi) / 2) <= half + 0.5;
    };
    // A hole in line with the shaft can be as wide as the shaft, but it is black, and a shaft in
    // the light is not (wood, brass, carbon with a sheen): where the line turns clearly darker than
    // the shaft was just before, the shaft has ended and its hole (or another) begins.
    const lightAt = (u) => {
      const v = [];
      for (let o = -band; o <= band; o++) {
        const xi = Math.round(px + u * dx - o * dy);
        const yi = Math.round(py + u * dy + o * dx);
        if (xi >= 0 && yi >= 0 && xi < width && yi < height) v.push(bright(yi * width + xi));
      }
      v.sort((p, q) => p - q);
      return v.length ? v[v.length >> 1] : 0;
    };
    const recent = []; // the shaft's brightness over its last few pixels
    const isHole = (u) => {
      if (recent.length < 8) return false;
      const was = [...recent].sort((p, q) => p - q)[recent.length >> 1];
      const v = lightAt(u);
      return v < 0.68 * was && v < was - 28;
    };
    let mess = false; // the walk ended in dark that is not the shaft (holes), not where the dark ends
    for (let k = 0.2 * len; k >= -(longGap + after + spotPx); k -= 0.5) {
      const u = point + dir * k;
      if (shaftLike(u) && !isHole(u)) {
        recent.push(lightAt(u));
        if (recent.length > 16) recent.shift();
        if (last == null || gap < 2) {
          last = k;
          gap = 0;
          continue;
        }
        stretch ??= k;
        // after a long gap more solid shaft is asked for than after a glint
        if (stretch - k >= (gap > bridge ? Math.max(after, 0.1 * spotPx) : after)) {
          last = k;
          gap = 0;
          hidden = 0;
          stretch = null;
        }
      } else if (last != null) {
        if (stretch != null) break; // the stretch after the gap was too short (a hole)
        if (gap === 0) mess = cover(point + dir * k) >= 0.5;
        gap += 0.5;
        if (hidesPaper(point + dir * k)) hidden += 0.5;
        // (a gap that shows the paper is the end of the shaft, however short: glare and bands hide it)
        if (gap >= 2 && (hidden < 0.5 * gap || gap > (hidden >= 0.7 * gap ? longGap : bridge))) break;
      }
    }
    if (last == null) return s;
    let end = point + dir * (last - 0.5); // the edge of the last covered pixel
    // A shaft is not dark all the way either: its front end can be brass or gold coloured, and over
    // the gold of the face that is no darker than the ring, so the dark line stops where the shaft
    // enters the gold, a ring short of the arrow. But it is still not the ring's colour: the shaft
    // goes on as long as the picture along its line is clearly another colour than the ring there,
    // without being a hole (dark) or torn paper (white). It then ends where its body ends: the hole
    // beyond it is not followed (holes run into each other).
    let body = 0;
    if (half >= 1.5 && !mess) {
      // not the ring's colour at a point of the picture, and not a hole or torn paper either
      const offRing = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return false;
        const d = nearest(x, y).d;
        // near a ring line the picture blends the two rings' colours: any mix of them is the paper
        const [p, q] = [d - 0.035, d + 0.035].map((dd) => (dd < 1 ? ringRgb[expectedColour(Math.max(0, dd), face, 0)] : null));
        if (!p || !q || p[0] == null || q[0] == null) return false;
        const i = (y * width + x) * 4;
        const c = [data[i], data[i + 1], data[i + 2]];
        // a hole is dark, also a brown one: well under the ring's own brightness. Torn paper and glare are white.
        if (Math.max(...c) < 0.62 * Math.max(...p, ...q) || Math.min(...c) > 150) return false;
        const pq = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const len2 = pq[0] * pq[0] + pq[1] * pq[1] + pq[2] * pq[2];
        const t = len2 ? Math.max(0, Math.min(1, ((c[0] - p[0]) * pq[0] + (c[1] - p[1]) * pq[1] + (c[2] - p[2]) * pq[2]) / len2)) : 0;
        return Math.hypot(c[0] - p[0] - t * pq[0], c[1] - p[1] - t * pq[1], c[2] - p[2] - t * pq[2]) > 55;
      };
      // The shaft's body at a point of its line: a band of the shaft's own width across the line,
      // with the ring's colour on both sides of it. Shaded and torn paper around old holes is off
      // the ring's colour too, but in patches of any size, not in a straight band.
      const reach = Math.ceil(3 * half) + 1;
      const isBody = (u) => {
        const off = (o) => offRing(Math.round(px + u * dx - o * dy), Math.round(py + u * dy + o * dx));
        const mid = [0, -1, 1].find((o) => off(o));
        if (mid == null) return false;
        let lo = mid;
        let hi = mid;
        while (mid - lo < reach && off(lo - 1)) lo--;
        while (hi - mid < reach && off(hi + 1)) hi++;
        const w = hi - lo + 1;
        return w >= 0.5 * 2 * half && w <= 1.6 * 2 * half + 1 && Math.abs((lo + hi) / 2) <= half;
      };
      // Right on a ring line a brass shaft cannot be told from the two rings' colours blending
      // (gold and red make its orange): those few pixels neither continue the shaft nor end it.
      const onLine = (u) => {
        const d = nearest(px + u * dx, py + u * dy).d;
        return d < 1.04 && colourBands(face).some((b) => Math.abs(d - b.edge) < 0.04);
      };
      let gap = 0;
      for (let k = 0.5; k <= 0.5 * spotPx && gap <= 1.5; k += 0.5) {
        if (isBody(end - dir * k)) {
          body = k;
          gap = 0;
        } else if (!onLine(end - dir * k)) gap += 0.5;
      }
      // a few stray pixels are not a shaft
      if (body < half) body = 0;
      end -= dir * body;
    }
    const out = dir > 0 ? seg(px, py, dx, dy, end, u1) : seg(px, py, dx, dy, u0, end);
    // (found by its body, the shaft's end is where the arrow goes in: no hole's width to step back)
    // (…and so it is where the shaft runs into a crowd of holes: its own hole cannot be told there)
    return { ...out, half, back: body || mess ? 0 : half };
  };

  const found = [];
  for (let tries = 0; tries < 120 && found.length < 12; tries++) {
    // strongest remaining line
    let best = -1;
    let bestV = 0;
    for (let j = 0; j < acc.length; j++) {
      if (acc[j] > bestV) {
        bestV = acc[j];
        best = j;
      }
    }
    if (bestV < minRun * 0.6) break;
    const t = Math.floor(best / (2 * D + 1));
    const rho = (best % (2 * D + 1)) - D;
    // suppress this line and its near neighbours
    for (let dt = -4; dt <= 4; dt++) {
      const tt = (t + dt + T) % T;
      for (let dr = -6; dr <= 6; dr++) {
        const rr = rho + dr + D;
        if (rr >= 0 && rr <= 2 * D) acc[tt * (2 * D + 1) + rr] = 0;
      }
    }
    // walk along the line and take its longest dark run (gaps of a few px allowed)
    const c = cosT[t];
    const sn = sinT[t];
    let line0 = longestRun(rho * c, rho * sn, -sn, c);
    // The 1° / 1 px grid line drifts off a long shaft and then ends short of its point: fit a line
    // to the shaft's own pixels and walk again, so the run follows the shaft to its end.
    for (let pass = 0; pass < 2 && line0; pass++) {
      const fit = fitLine(line0.a, line0.b);
      const again = fit && longestRun(fit.x, fit.y, fit.dx, fit.dy);
      if (!again || again.length <= line0.length) break;
      line0 = again;
      if (pass === 1 || !fit) break;
    }
    const fitted = line0 && fitLine(line0.a, line0.b);
    const onShaft = fitted && longestRun(fitted.x, fitted.y, fitted.dx, fitted.dy);
    // the point is trimmed on a line that lies on the shaft (fitted to it), not on the grid line
    const isFitted = !!onShaft && onShaft.length >= 0.9 * line0.length;
    const trimmed = isFitted ? trimPoint(onShaft) : line0;
    const shaftSeg = isFitted ? shaftEnd(trimmed) : trimmed;
    if (!shaftSeg || shaftSeg.length < minRun) {
      rejects?.push({ why: 'short', votes: bestV, t, rho, run: shaftSeg ? shaftSeg.length : 0 });
      continue;
    }
    const { a, b } = shaftSeg;
    const run = { u0: 0, u1: shaftSeg.length };
    const atA = nearest(a.x, a.y);
    const atB = nearest(b.x, b.y);
    // the entry point is the end inside a face; the other end leans out (towards the camera)
    const [tip, tipAt, out] = atA.d <= atB.d ? [a, atA, atB] : [b, atB, atA];
    if (tipAt.d > 1 || out.d < tipAt.d + 0.25) {
      rejects?.push({ why: 'ends', votes: bestV, t, rho, tip: +tipAt.d.toFixed(2), out: +out.d.toFixed(2), a, b });
      continue;
    }
    // one arrow per shaft. Lines a few degrees off cut across the same shaft and end short of its
    // point, anywhere along it: of the lines along one shaft the longest is the shaft itself. (Not
    // the one ending nearest the middle of the spot: a shaft can cross the middle and enter on the
    // far side.)
    const line = { a, b, length: run.u1 - run.u0, tip, tipAt, t, fitted: isFitted, half: shaftSeg.half ?? null, back: shaftSeg.back ?? null };
    const near = 0.15 * spotPx;
    const same = found.findIndex((f) => {
      // the angle between the two segments as they lie (a fitted line has left its grid angle)
      const cosAngle =
        Math.abs((f.b.x - f.a.x) * (b.x - a.x) + (f.b.y - f.a.y) * (b.y - a.y)) /
        (Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y) * Math.hypot(b.x - a.x, b.y - a.y) || 1);
      const apart = Math.hypot(f.tip.x - tip.x, f.tip.y - tip.y);
      // also a line of any direction ending at the same point: the shaft's shadow starts there too
      if (apart < near) return true;
      if (cosAngle < 0.978) return false; // more than 12° apart
      const on = (p, q) => distToSegment(p.x, p.y, q.a, q.b) < near;
      return on(a, f) || on(b, f) || on(f.a, line) || on(f.b, line);
    });
    if (same >= 0) {
      // a line fitted to the shaft (its point trimmed) beats a grid line; otherwise the longer one
      const f = found[same];
      if (line.fitted !== f.fitted ? line.fitted : line.length > f.length) found[same] = line;
      continue;
    }
    found.push(line);
  }
  return found;
}

/**
 * Live view: are the arrows of two frames the same arrows in (nearly) the same places?
 * Returns, for each arrow of `prev`, the index of its match in `cur` (same spot, within `tol` face
 * units), or null when the counts differ or an arrow has no match.
 */
export function matchArrows(prev, cur, tol = 0.1) {
  if (!prev.length || prev.length !== cur.length) return null;
  const used = new Set();
  const map = [];
  for (const a of prev) {
    let best = -1;
    let bestD = tol;
    cur.forEach((b, j) => {
      if (used.has(j) || (a.spot ?? null) !== (b.spot ?? null)) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d <= bestD) {
        bestD = d;
        best = j;
      }
    });
    if (best < 0) return null;
    used.add(best);
    map.push(best);
  }
  return map;
}

/**
 * Live view: the reading most of the recent frames agree on. `frames` is a list of arrow lists
 * (oldest first). Returns { arrows, count, oldest } — the agreed arrows at their average place over
 * the agreeing frames, how many frames agree, and the index of the oldest of them — or null when
 * there are no frames. A frame that reads something else now and then does not reset anything.
 */
export function consensus(frames, tol = 0.1) {
  let best = null;
  frames.forEach((ref, i) => {
    const members = [];
    frames.forEach((f, j) => {
      const map = i === j ? ref.map((_, k) => k) : matchArrows(ref, f, tol);
      if (map) members.push({ j, map });
    });
    // the most agreed; among equals the most recent
    if (ref.length && (!best || members.length >= best.members.length)) best = { ref, members };
  });
  if (!best) return null;
  const n = best.members.length;
  return {
    count: n,
    oldest: Math.min(...best.members.map((m) => m.j)),
    arrows: best.ref.map((a, k) => ({
      ...a,
      x: best.members.reduce((sum, m) => sum + frames[m.j][m.map[k]].x, 0) / n,
      y: best.members.reduce((sum, m) => sum + frames[m.j][m.map[k]].y, 0) / n,
    })),
  };
}
