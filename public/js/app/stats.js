// Session statistics (HANDOFF §6). Pure functions returning numbers (null when undefined).
import { arrowValue } from './scoring.js';

export function sumArrows(arrows) {
  return arrows.reduce((t, a) => t + arrowValue(a?.v), 0);
}

function mean(values) {
  return values.length ? values.reduce((t, v) => t + v, 0) / values.length : null;
}

export function computeStats(ends) {
  const arrows = ends.flatMap((e) => e.arrows).filter((a) => a && a.v != null);
  const total = sumArrows(arrows);
  const mGraded = arrows.filter((a) => a.m != null);
  const sGraded = arrows.filter((a) => a.s != null);
  const byM = {};
  for (const g of [1, 2, 3, 4, 5]) {
    const xs = arrows.filter((a) => a.m === g);
    byM[g] = { n: xs.length, avgArrow: xs.length ? sumArrows(xs) / xs.length : null };
  }
  return {
    arrows: arrows.length,
    total,
    max: arrows.length * 10,
    avgArrow: arrows.length ? total / arrows.length : null,
    avgM: mean(mGraded.map((a) => a.m)),
    avgS: mean(sGraded.map((a) => a.s)),
    programPct: mGraded.length
      ? Math.round((mGraded.filter((a) => a.m <= 2).length / mGraded.length) * 100)
      : null,
    tens: arrows.filter((a) => a.v === 'X' || a.v === 10).length,
    xs: arrows.filter((a) => a.v === 'X').length,
    ld: ends.reduce((t, e) => t + (e.ld || 0), 0),
    cld: ends.reduce((t, e) => t + (e.cld || 0), 0),
    byM,
  };
}

/** Format a nullable number with fixed decimals, or an en dash. */
export function fmt(n, decimals = 1) {
  return n == null ? '–' : n.toFixed(decimals);
}
