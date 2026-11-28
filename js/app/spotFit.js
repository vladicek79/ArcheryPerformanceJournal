// Fitting a spot to its printed ring edges, in perspective.
//
// The detector first finds a spot as a blob of colour (its gold and red) and fits an ellipse to it.
// That is a few millimetres off on a real photo: a camera held near the target at an angle shows the
// spot in perspective (the rings are not ellipses around one middle), and holes, shafts and their
// shadows pull a blob's centre about. A ring is 20 mm wide on a 40 cm face, so those millimetres
// decide the score of every arrow near a line.
//
// So the spot is fitted again to what is printed: the edges between its colours (gold to red, red
// to blue, blue to the paper), each found to a fraction of a pixel on many rays from the centre.
// Through those points goes a spot with perspective ({ cx, cy, rx, ry, angle, px, py }, see
// scanGeometry.js): several rings of known size, which is what tells perspective from a mere tilt.
//
// Works on RGBA pixels ({ width, height, data }); no DOM.
import { colourBands } from './scoring.js';
import { faceFromPicture, pictureFromFace } from './scanGeometry.js';

const RAYS = 120;
/** Samples across an edge, on a stretch of ± REACH (face units) around where it should be. */
const SAMPLES = 25;
const REACH = 0.085;

/** The colour at a point of the picture (bilinear), or null outside it. */
function colourAt({ width, height, data }, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return null;
  const x0 = Math.min(width - 2, Math.floor(x));
  const y0 = Math.min(height - 2, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const i = (y0 * width + x0) * 4;
  const j = i + width * 4;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] =
      (data[i + c] * (1 - fx) + data[i + 4 + c] * fx) * (1 - fy) +
      (data[j + c] * (1 - fx) + data[j + 4 + c] * fx) * fy;
  }
  return out;
}

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

/** The colour of the ring at radius `r` of the spot in this photo: the median around the ring. */
function ringColour(img, outer, r) {
  const ch = [[], [], []];
  for (let k = 0; k < 90; k++) {
    const t = (2 * Math.PI * k) / 90;
    const p = pictureFromFace(outer, { x: r * Math.cos(t), y: r * Math.sin(t) });
    const c = colourAt(img, p.x, p.y);
    if (c) for (let i = 0; i < 3; i++) ch[i].push(c[i]);
  }
  return ch[0].length >= 20 ? ch.map(median) : null;
}

/**
 * The edges between the colours of a face that can be found in a photo: each with its radius and
 * the radii where the colours on its two sides are measured. The edge of the face itself counts
 * when the paper around it is another colour than its last ring (a spot's blue on white paper; not
 * a full face's white ring).
 */
function colourEdges(face) {
  const bands = colourBands(face);
  const edges = [];
  bands.forEach((b, i) => {
    const from = i ? bands[i - 1].edge : 0;
    const inner = (from + b.edge) / 2;
    if (i + 1 < bands.length) edges.push({ r: b.edge, inner, outer: (b.edge + bands[i + 1].edge) / 2 });
    else if (b.zone !== 'white') edges.push({ r: b.edge, inner, outer: b.edge + 0.06 });
  });
  return edges;
}

/**
 * Points of the picture lying on the colour edges of a spot as it is fitted so far: [{ x, y, r }].
 * Along each ray across an edge the colour goes from the inner ring's to the outer ring's: where,
 * is read from the whole stretch (how much of it has the inner colour), which is good to a
 * fraction of a pixel and does not mind blur. A ray where the colours are not those two with one
 * clean step between them (a shaft, a hole, a fletching, glare) is left out.
 */
function edgePoints(img, outer, face) {
  const pts = [];
  for (const e of colourEdges(face)) {
    const cin = ringColour(img, outer, e.inner);
    const cout = ringColour(img, outer, e.outer);
    if (!cin || !cout) continue;
    const d = [cin[0] - cout[0], cin[1] - cout[1], cin[2] - cout[2]];
    const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    if (len2 < 40 * 40) continue; // the two colours are too alike in this light to tell apart
    const r0 = e.r - REACH;
    const dr = (2 * REACH) / (SAMPLES - 1);
    for (let k = 0; k < RAYS; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / RAYS;
      const ux = Math.cos(t);
      const uy = Math.sin(t);
      const s = new Array(SAMPLES);
      let ok = true;
      for (let i = 0; i < SAMPLES && ok; i++) {
        const r = r0 + i * dr;
        const p = pictureFromFace(outer, { x: r * ux, y: r * uy });
        const c = colourAt(img, p.x, p.y);
        if (!c) {
          ok = false;
          break;
        }
        const v = [c[0] - cout[0], c[1] - cout[1], c[2] - cout[2]];
        const along = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / len2;
        // how far the colour is from both rings' colours (from the line between them)
        const off2 = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / len2 - along * along;
        if (off2 > 0.3) ok = false;
        s[i] = Math.max(0, Math.min(1, along));
      }
      if (!ok) continue;
      const inside = s.reduce((a, v) => a + v, 0);
      // one clean step: inner colour up to the edge, outer colour after it
      const cut = Math.round(inside);
      let err = 0;
      for (let i = 0; i < SAMPLES; i++) err += i < cut ? (1 - s[i]) ** 2 : s[i] ** 2;
      if (err / SAMPLES > 0.045 || inside < 3 || inside > SAMPLES - 3) continue;
      const r = r0 + (inside - 0.5) * dr;
      pts.push({ ...pictureFromFace(outer, { x: r * ux, y: r * uy }), r: e.r });
    }
  }
  return pts;
}

/** Solve A x = b (Gaussian elimination with partial pivoting), or null. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-14) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Least squares by Levenberg–Marquardt (numeric derivatives): the x that makes residuals(x) small. */
function leastSquares(residuals, x0, scale) {
  const n = x0.length;
  let x = [...x0];
  let r = residuals(x);
  const cost = (v) => v.reduce((a, q) => a + q * q, 0);
  let c = cost(r);
  let mu = 1e-3;
  for (let it = 0; it < 40; it++) {
    const J = [];
    for (let j = 0; j < n; j++) {
      const xe = [...x];
      xe[j] += 1e-4 * scale[j];
      const re = residuals(xe);
      J.push(re.map((v, k) => (v - r[k]) / (1e-4 * scale[j])));
    }
    const A = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => J[i].reduce((a, v, k) => a + v * J[j][k], 0)),
    );
    const g = J.map((col) => -col.reduce((a, v, k) => a + v * r[k], 0));
    let moved = false;
    for (let tries = 0; tries < 8 && !moved; tries++) {
      const d = solve(
        A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + mu) + 1e-12 : v))),
        g,
      );
      if (!d) break;
      const xn = x.map((v, j) => v + d[j]);
      const rn = residuals(xn);
      const cn = cost(rn);
      if (Number.isFinite(cn) && cn < c) {
        moved = c - cn > 1e-12 * (1 + c);
        x = xn;
        r = rn;
        c = cn;
        mu = Math.max(1e-9, mu / 3);
        if (!moved) return x;
      } else mu *= 6;
    }
    if (!moved) break;
  }
  return x;
}

/** A spot from the fit's parameters [cx, cy, e11, e12, e22, px, py] (E the ellipse, symmetric). */
function outerOf(x) {
  const [cx, cy, e11, e12, e22, px, py] = x;
  const tr = (e11 + e22) / 2;
  const det = Math.sqrt(((e11 - e22) / 2) ** 2 + e12 * e12);
  return { cx, cy, rx: tr + det, ry: tr - det, angle: 0.5 * Math.atan2(2 * e12, e11 - e22), px, py };
}
function paramsOf(o) {
  const cos = Math.cos(o.angle);
  const sin = Math.sin(o.angle);
  return [
    o.cx,
    o.cy,
    cos * cos * o.rx + sin * sin * o.ry,
    cos * sin * (o.rx - o.ry),
    sin * sin * o.rx + cos * cos * o.ry,
    o.px || 0,
    o.py || 0,
  ];
}

/**
 * The spot `outer` (as found so far) fitted to its ring edges in the picture. Returns the fitted
 * spot { cx, cy, rx, ry, angle, px, py }, or `outer` itself when the edges cannot be trusted (too
 * few of them seen, or a fit that is far from where it started: then something else was fitted).
 */
export function fitSpotToEdges(img, outer, face) {
  const R = (outer.rx + outer.ry) / 2;
  if (!(R > 12)) return outer; // too small in the picture for its edges to say more than the blob
  const wanted = colourEdges(face).length * RAYS;
  let cur = outer;
  for (let pass = 0; pass < 3; pass++) {
    let pts = edgePoints(img, cur, face);
    if (pts.length < 0.25 * wanted || new Set(pts.map((p) => p.r)).size < 2) return pass ? cur : outer;
    const scale = [1, 1, R / 100, R / 100, R / 100, 0.01, 0.01];
    let x = paramsOf(cur);
    for (let round = 0; round < 3; round++) {
      const use = pts;
      const residuals = (v) => {
        const o = outerOf(v);
        const out = use.map((p) => {
          const f = faceFromPicture(o, p);
          return Math.hypot(f.x, f.y) - p.r;
        });
        // a little weight keeps the perspective at none where the edges do not tell it
        out.push(0.3 * v[5], 0.3 * v[6]);
        return out;
      };
      x = leastSquares(residuals, x, scale);
      // drop the points that do not lie on the rings (what is left of holes and shafts) and fit again
      const o = outerOf(x);
      const res = pts.map((p) => {
        const f = faceFromPicture(o, p);
        return Math.abs(Math.hypot(f.x, f.y) - p.r);
      });
      const limit = Math.max(0.006, 2.5 * 1.4826 * median(res));
      const kept = pts.filter((_, i) => res[i] <= limit);
      if (kept.length === pts.length || kept.length < 0.2 * wanted) break;
      pts = kept;
    }
    const fit = outerOf(x);
    // not the same spot any more: keep what was there
    const moved = Math.hypot(fit.cx - outer.cx, fit.cy - outer.cy);
    const size = (fit.rx + fit.ry) / 2 / R;
    if (
      !(moved < 0.15 * R) ||
      !(size > 0.88 && size < 1.12) ||
      !(fit.ry > 0.3 * fit.rx) ||
      Math.hypot(fit.px, fit.py) > 0.3
    )
      return pass ? cur : outer;
    cur = fit;
  }
  return cur;
}
