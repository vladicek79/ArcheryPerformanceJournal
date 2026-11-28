// Arrows found by a neural network (Settings › Scan › Arrows found by): the other way of reading
// where the arrows are, beside the hand-written rules of photoDetect.js.
//
// The rings are found as always (photoDetect.js, fitted to the printed ring edges). Then each spot
// is cut out of the picture seen straight on (its perspective taken out, its centre in the middle,
// the same picture the network was trained on: tools/nn/README.md), and the network says where on
// it a shaft enters the paper: a heatmap, whose brightest point is the arrow. That point is put back
// on the face and scored as any arrow.
//
// Where the network is not sure (the heatmap's highest point is low) the rules' arrow on that spot
// is kept. The network finds one arrow per spot, so it is only used on faces of several spots (a
// triple or a Vegas sheet, one arrow per spot); a single face is always read by the rules.
//
// The network and the runtime that executes it (ONNX Runtime Web, WebAssembly) are files of the app
// (public/nn/), some 15 MB together: they are fetched the first time they are needed, and then kept
// for offline use by the service worker.
import { pictureFromFace } from './scanGeometry.js';
import { isMultiSpot } from './scoring.js';

/** The network in use: its file, and how it was trained (tools/nn/train.py). */
export const NET = {
  model: 'arrow-v2.onnx',
  runtime: 'ort-1.22.0/',
  size: 320, // the crop's side, px
  stride: 2, // the heatmap is this many times smaller
  reach: 1.3, // the crop shows the spot out to this many radii from its centre
  sureMin: 0.15, // below this the heatmap's highest point is not trusted (the rules' arrow is kept)
  // ask the network a second time with the crop mirrored, and take the mean: steadier, twice the time
  mirror: true,
};

/** The app's folder of network files (public/nn/), from this module's own place. */
const base = () => new URL('../../nn/', import.meta.url);

/** Faces the network can read: one arrow per spot. */
export const netReadsFace = (face) => isMultiSpot(face);

/**
 * The crop of a spot as the network takes it: `size`×`size`, RGB in 0..1, channel by channel.
 * Pixel (u, v) shows the face point ((2(u + ½)/size − 1)·reach, …) of the spot `outer`; `img` is
 * the picture the spot was found on ({ width, height, data: RGBA }). Outside the picture: black.
 */
export function cropInput(img, outer, size = NET.size, reach = NET.reach) {
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  const { width, height, data } = img;
  for (let v = 0; v < size; v++) {
    const fy = ((2 * (v + 0.5)) / size - 1) * reach;
    for (let u = 0; u < size; u++) {
      const fx = ((2 * (u + 0.5)) / size - 1) * reach;
      const p = pictureFromFace(outer, { x: fx, y: fy });
      const x = p.x - 0.5;
      const y = p.y - 0.5;
      const o = v * size + u;
      if (!(x >= 0 && y >= 0 && x < width - 1 && y < height - 1)) continue;
      const x0 = x | 0;
      const y0 = y | 0;
      const ax = x - x0;
      const ay = y - y0;
      const i = (y0 * width + x0) * 4;
      const j = i + width * 4;
      for (let c = 0; c < 3; c++) {
        const top = data[i + c] * (1 - ax) + data[i + 4 + c] * ax;
        const bottom = data[j + c] * (1 - ax) + data[j + 4 + c] * ax;
        out[c * plane + o] = (top * (1 - ay) + bottom * ay) / 255;
      }
    }
  }
  return out;
}

/** A crop mirrored left to right (the network is asked twice: as it is and mirrored). */
export function mirror(input, size = NET.size) {
  const out = new Float32Array(input.length);
  for (let r = 0; r < input.length; r += size) {
    for (let u = 0; u < size; u++) out[r + u] = input[r + size - 1 - u];
  }
  return out;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * The arrow on a heatmap: the mean of the heatmap as it is and of the mirrored one (mirrored
 * back), its highest point refined to a fraction of a pixel (the centre of mass of the peak). Both
 * heatmaps are logits, `n`×`n`. Returns { x, y } in crop pixels and how sure (the height there, 0..1).
 */
export function peak(logits, mirroredLogits, n = NET.size / NET.stride, stride = NET.stride) {
  const heat = new Float32Array(n * n);
  let best = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      heat[i] = (sigmoid(logits[i]) + sigmoid(mirroredLogits[y * n + n - 1 - x])) / 2;
      if (heat[i] > heat[best]) best = i;
    }
  }
  const iy = (best / n) | 0;
  const ix = best % n;
  let m = 0;
  let sx = 0;
  let sy = 0;
  for (let y = Math.max(0, iy - 3); y < Math.min(n, iy + 4); y++) {
    for (let x = Math.max(0, ix - 3); x < Math.min(n, ix + 4); x++) {
      const w = heat[y * n + x];
      m += w;
      sx += w * x;
      sy += w * y;
    }
  }
  return { x: (sx / m + 0.5) * stride, y: (sy / m + 0.5) * stride, sure: heat[best] };
}

/** A point of the crop → the face (its spot's centre 0, radius 1). */
export const faceFromCrop = (p, size = NET.size, reach = NET.reach) => ({
  x: ((2 * p.x) / size - 1) * reach,
  y: ((2 * p.y) / size - 1) * reach,
});

let loading = null;

/**
 * The network, ready to ask: { ask(input) → logits } (both Float32Array). Loaded once, on the
 * first call; a failure (offline before it was ever fetched, an old browser) rejects, and the next
 * call tries again.
 */
export function loadArrowNet() {
  loading ??= (async () => {
    const ort = await import(new URL(`${NET.runtime}ort.wasm.min.mjs`, base()).href);
    ort.env.wasm.wasmPaths = new URL(NET.runtime, base()).href;
    // GitHub Pages cannot serve the headers several threads need; one is enough for one crop
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(new URL(NET.model, base()).href, {
      executionProviders: ['wasm'],
    });
    const [input] = session.inputNames;
    const [output] = session.outputNames;
    return {
      async ask(data) {
        const res = await session.run({
          [input]: new ort.Tensor('float32', data, [1, 3, NET.size, NET.size]),
        });
        return res[output].data;
      },
    };
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/**
 * The arrows of a detection result `res` read again by the network, on the picture `img` it was
 * found on: one arrow per spot where the network is sure, the rules' arrow(s) where it is not, at
 * most `maxArrows` (the surest first). Each arrow says how it was found (`by`: 'network' | 'rules').
 * A face the network cannot read, or a result without spots, comes back as it was.
 * `net`: a loaded network (loadArrowNet).
 */
export async function arrowsByNet(img, res, face, maxArrows, net, { spotHint = 0 } = {}) {
  if (!netReadsFace(face) || !res?.spots?.length) return res;
  const found = [];
  for (let k = 0; k < res.spots.length; k++) {
    const outer = res.spots[k].outer;
    const spot = res.partial ? spotHint : k;
    const input = cropInput(img, outer);
    const logits = await net.ask(input);
    const a = peak(logits, NET.mirror ? await net.ask(mirror(input)) : mirror(logits, NET.size / NET.stride));
    if (a.sure >= NET.sureMin) {
      const f = faceFromCrop(a);
      found.push({
        x: f.x,
        y: f.y,
        spot,
        area: 0,
        image: pictureFromFace(outer, f),
        lean: null,
        by: 'network',
        sure: a.sure,
      });
    } else {
      for (const r of res.arrows.filter((r) => (res.partial ? true : r.spot === k)))
        found.push({ ...r, by: 'rules', sure: 0 });
    }
  }
  const arrows = found
    .sort((p, q) => q.sure - p.sure)
    .slice(0, Math.max(0, maxArrows))
    .sort((p, q) => (p.spot ?? 0) - (q.spot ?? 0) || Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y));
  return { ...res, arrows };
}
