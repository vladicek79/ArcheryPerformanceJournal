// Runs the arrow detection off the main thread, so the live camera view stays smooth.
// In: { id, width, height, buffer (RGBA), face, maxArrows, spotHint }. Out: { id, res } with the
// plain data of the result (the spots' outlines and the arrows; no functions).
import { detectArrows } from './photoDetect.js';

self.onmessage = (e) => {
  const { id, width, height, buffer, face, maxArrows, spotHint } = e.data;
  let res;
  try {
    const r = detectArrows({ width, height, data: new Uint8ClampedArray(buffer) }, face, maxArrows, { spotHint });
    res = r.error ? { error: r.error } : { partial: r.partial, spots: r.spots.map((s) => ({ outer: s.outer })), arrows: r.arrows };
  } catch (err) {
    res = { error: String(err?.message || err) };
  }
  self.postMessage({ id, res });
};
