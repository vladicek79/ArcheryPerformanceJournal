// What a scored session's overview reads from its arrows: the score counts, the average against
// earlier sessions, the M / S grade spread and how grades relate to score, and the group (all arrows
// on one spot, filtered, with its centre and a one-line reading). Pure functions, no DOM.
import { arrowValue, isMultiSpot, spotRadiusCm } from './scoring.js';
import { isScored, newestFirst, distanceUnitOf } from './sessionTypes.js';

const scored = (ends) => ends.flatMap((e) => e.arrows).filter((a) => a && a.v != null);
const mean = (xs) => (xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null);

/** X, 10 (without X), 9 and 8 or less (misses included) among the scored arrows. */
export function scoreCounts(ends) {
  const arrows = scored(ends);
  return {
    x: arrows.filter((a) => a.v === 'X').length,
    ten: arrows.filter((a) => a.v === 10).length,
    nine: arrows.filter((a) => a.v === 9).length,
    low: arrows.filter((a) => a.v !== 'X' && arrowValue(a.v) <= 8).length,
  };
}

/**
 * The per-arrow average of each end, in end order: { end (1-based), avg, n, total } over the end's
 * scored arrows (X counts 10, a miss 0, empty slots are skipped); avg is null for an end with none.
 */
export function endAverages(ends) {
  return ends.map((e, i) => {
    const xs = e.arrows.filter((a) => a && a.v != null).map((a) => arrowValue(a.v));
    const total = xs.reduce((t, v) => t + v, 0);
    return { end: i + 1, avg: mean(xs), n: xs.length, total };
  });
}

/** Earlier sessions needed before the average is shown. */
export const AVERAGE_MIN_SESSIONS = 3;

/**
 * The session's points per arrow against the earlier finished sessions at the same distance and face
 * (their arrows pooled): `{ delta, average, sessions }`, or null with fewer than AVERAGE_MIN_SESSIONS
 * of them or no arrows. Earlier = before it by date and start time.
 */
export function averageDelta(session, finished) {
  const own = scored(session.ends || []);
  if (!own.length) return null;
  const earlier = finished.filter(
    (s) =>
      s.id !== session.id &&
      s.status === 'finished' &&
      isScored(s.type) &&
      s.distance === session.distance &&
      distanceUnitOf(s) === distanceUnitOf(session) &&
      s.face === session.face &&
      newestFirst(s, session) > 0 &&
      scored(s.ends || []).length,
  );
  if (earlier.length < AVERAGE_MIN_SESSIONS) return null;
  const pool = earlier.flatMap((s) => scored(s.ends));
  const average = mean(pool.map((a) => arrowValue(a.v)));
  return { delta: mean(own.map((a) => arrowValue(a.v))) - average, average, sessions: earlier.length };
}

/** How many arrows got each grade 1–5 (`kind` 'm' or 's'), how many were graded, and the average. */
export function gradeDistribution(ends, kind) {
  const grades = ends.flatMap((e) => e.arrows).map((a) => a?.[kind]).filter((g) => g != null);
  return { counts: [1, 2, 3, 4, 5].map((g) => grades.filter((x) => x === g).length), n: grades.length, avg: mean(grades) };
}

/** Arrows needed in each group before the grade insight is shown. */
export const INSIGHT_MIN_ARROWS = 3;

/**
 * Points per arrow of the arrows shot with the full mental program (M1) and with M3 or worse:
 * `{ m1: { avg, n }, m3: { avg, n } }`, or null while either group has too few scored arrows.
 */
export function gradeInsight(ends) {
  const arrows = scored(ends);
  const group = (keep) => {
    const xs = arrows.filter(keep).map((a) => arrowValue(a.v));
    return { avg: mean(xs), n: xs.length };
  };
  const m1 = group((a) => a.m === 1);
  const m3 = group((a) => a.m != null && a.m >= 3);
  return m1.n >= INSIGHT_MIN_ARROWS && m3.n >= INSIGHT_MIN_ARROWS ? { m1, m3 } : null;
}

// ---------------------------------------------------------------- the group

export const GROUP_FILTERS = ['all', 'm1', 'm3', 'last'];
export const FILTER_LABELS = { all: 'All', m1: 'M1 only', m3: 'M3+', last: 'Last of end' };
const FILTER_NAMES = { m1: 'M1 only', m3: 'M3 or worse', last: 'Last of end' };

/**
 * The session's placed arrows on one spot (x, y in spot radii, y downwards; arrows of a multi-spot
 * sheet are merged onto one spot, as their positions are kept per spot), each with its grades and
 * whether it is the last scored arrow of its end. `total`: the scored arrows, placed or not.
 */
export function groupArrows(ends) {
  const arrows = [];
  let total = 0;
  for (const e of ends) {
    const lastIdx = e.arrows.findLastIndex((a) => a?.v != null);
    e.arrows.forEach((a, i) => {
      if (a?.v == null) return;
      total += 1;
      if (a.x == null || a.y == null) return;
      arrows.push({ x: a.x, y: a.y, v: a.v, m: a.m ?? null, s: a.s ?? null, last: i === lastIdx, spot: a.spot ?? null });
    });
  }
  return { arrows, total };
}

const FILTERS = {
  all: () => true,
  m1: (p) => p.m === 1,
  m3: (p) => p.m != null && p.m >= 3,
  last: (p) => p.last,
};

/** The arrows a filter shows. */
export const filterArrows = (arrows, filter) => arrows.filter(FILTERS[filter] || FILTERS.all);

/** Whether one arrow matches a filter. */
export const matchesFilter = (arrow, filter) => (FILTERS[filter] || FILTERS.all)(arrow);

/**
 * Whether one arrow was shot at spot `spot` of a multi-spot sheet (0-based: triple top to bottom,
 * Vegas top, bottom left, bottom right); `spot` null: every arrow. An arrow without a spot is on none.
 */
export const matchesSpot = (arrow, spot) => spot == null || arrow.spot === spot;

/** The spots of the session's sheet that have placed arrows (0-based, in order); none on a single face. */
export function groupSpots(arrows, face) {
  if (!isMultiSpot(face)) return [];
  return [...new Set(arrows.map((p) => p.spot).filter((k) => k != null))].sort((a, b) => a - b);
}

/** The mean point of impact, or null without arrows. */
export function groupCentre(points) {
  if (!points.length) return null;
  const r = (n) => Math.round(n * 1000) / 1000;
  return { x: r(mean(points.map((p) => p.x))), y: r(mean(points.map((p) => p.y))) };
}

/**
 * The spread of a group: the population standard deviation of x and of y, in the points' own units
 * (spot radii), or null for fewer than two points.
 */
export function groupSpread(points) {
  if (points.length < 2) return null;
  const sd = (xs) => {
    const m = mean(xs);
    return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
  };
  return { sdX: sd(points.map((p) => p.x)), sdY: sd(points.map((p) => p.y)) };
}

/** Off-centre less than this (in spot radii) reads as centred / about the same. */
export const CENTRE_THRESHOLD = 0.05;

/** "high", "low right", "left"… or "centred". */
export function centreDirection(c, t = CENTRE_THRESHOLD) {
  const v = c.y < -t ? 'high' : c.y > t ? 'low' : '';
  const h = c.x < -t ? 'left' : c.x > t ? 'right' : '';
  return [v, h].filter(Boolean).join(' ') || 'centred';
}

/**
 * One line under the face. All: "All 30 arrows: centre low right." A filter: its centre, and how it
 * differs from the centre of all arrows ("— lower and further right than all arrows.").
 */
export function centreReading(shown, all, filter, n, t = CENTRE_THRESHOLD, spot = null) {
  if (!all) return 'No arrows placed on the face.';
  const onSpot = spot == null ? '' : ` on spot ${spot + 1}`;
  if (!shown) {
    if (filter === 'all') return `No arrows placed${onSpot}.`;
    return filter === 'last'
      ? `No placed arrow${onSpot} is the last of its end.`
      : `No arrows graded ${FILTER_NAMES[filter]}${onSpot || ' in this session'}.`;
  }
  const dir = centreDirection(shown, t);
  const where = dir === 'centred' ? 'centre on the middle' : `centre ${dir}`;
  if (filter === 'all' && spot == null) return `All ${n} ${n === 1 ? 'arrow' : 'arrows'}: ${where}.`;
  const name = filter === 'all' ? `Spot ${spot + 1}` : `${FILTER_NAMES[filter]}${onSpot}`;
  const dy = shown.y - all.y;
  const dx = shown.x - all.x;
  const diff = [dy > t ? 'lower' : dy < -t ? 'higher' : '', dx > t ? 'further right' : dx < -t ? 'further left' : ''].filter(Boolean);
  const vs = diff.length ? `${diff.join(' and ')} than all arrows` : 'about where all arrows are';
  return `${name} (${n}): ${where} — ${vs}.`;
}

/** The caption under the face: what was merged. */
export const mergedNote = (face) => (isMultiSpot(face) ? 'spots of the sheet merged' : null);

// ---------------------------------------------------------------- the sight move

/** Placed arrows needed (after the wild ones are left out) before a sight move is worked out. */
export const SIGHT_MIN_ARROWS = 6;
/** An arrow further from the group's median point than this many times the median distance is wild. */
const WILD_FACTOR = 2.5;
/** ...but never closer than this (spot radii, one ring of a 10-ring face): a tight group keeps its arrows. */
const WILD_FLOOR = 0.1;
/** A sight move smaller than this (mm) is not worth making. */
const SIGHT_MIN_MM = 0.2;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The wild arrows of a group: those far from where the rest are. Measured from the median point (a
 * few wild arrows do not pull it), against the median distance of all arrows from it. Returns a Set
 * of the indexes in `points` that are left out.
 */
export function wildArrows(points) {
  if (points.length < 3) return new Set();
  const mx = median(points.map((p) => p.x));
  const my = median(points.map((p) => p.y));
  const d = points.map((p) => Math.hypot(p.x - mx, p.y - my));
  const limit = Math.max(WILD_FACTOR * median(d), WILD_FLOOR);
  return new Set(d.flatMap((v, i) => (v > limit ? [i] : [])));
}

/**
 * How far to move the sight to bring the group's centre to the middle, from similar triangles:
 * move = offset on the target × eye-to-pin ÷ distance. The sight follows the arrows (group low →
 * sight down, group left → sight left). Sideways it is said as the sight's own knob says it: in
 * (the aperture towards the riser) or out. The aperture sits in the riser's sight window, on the
 * left of a right-handed bow and the right of a left-handed one: towards the riser is right for a
 * right-handed archer, left for a left-handed one.
 *
 * `points`: the arrows (x, y in spot radii, y downwards) · `face` · `distance` (m) · `eyeToPinCm` ·
 * `hand` ('right', the default, or 'left': the archer's draw hand).
 * Returns null without a distance or an eye-to-pin length, else:
 *   { enough: false, n, wild }                       too few arrows left after the wild ones
 *   { enough: true, n, wild, x, y }                  x / y: { mm, dir } or null when not worth moving
 * `x.mm` > 0 means right, `y.mm` > 0 down; `dir` is the word ('in', 'out', 'down', 'up'). An axis
 * is left alone when its offset is within the group's own scatter (under two standard errors) or the
 * move is under SIGHT_MIN_MM. `wild`: the Set of left-out indexes in `points`.
 */
export function sightCorrection(points, { face, distance, eyeToPinCm, hand = 'right' }) {
  const reach = Number(eyeToPinCm);
  if (!(distance > 0) || !(reach > 0)) return null;
  const wild = wildArrows(points);
  const kept = points.filter((_, i) => !wild.has(i));
  const n = kept.length;
  if (n < SIGHT_MIN_ARROWS) return { enough: false, n, wild };
  // one spot radius on the target, as millimetres of sight travel
  const mmPerUnit = (spotRadiusCm(face) * 10 * reach) / (distance * 100);
  const axis = (key, pos, neg) => {
    const xs = kept.map((p) => p[key]);
    const m = mean(xs);
    const sd = Math.sqrt(xs.reduce((t, v) => t + (v - m) ** 2, 0) / (n - 1));
    const mm = Math.round(m * mmPerUnit * 10) / 10;
    if (Math.abs(m) < (2 * sd) / Math.sqrt(n) || Math.abs(mm) < SIGHT_MIN_MM) return null;
    return { mm, dir: mm > 0 ? pos : neg };
  };
  // right is towards the riser (in) for a right-handed archer, away from it (out) for a left-handed one
  const [right, left] = hand === 'left' ? ['out', 'in'] : ['in', 'out'];
  return { enough: true, n, wild, x: axis('x', right, left), y: axis('y', 'down', 'up') };
}

/** The sight move in words: "0.9 mm down · 0.3 mm out", or "No change: the group is centred". */
export function sightMoveText(c) {
  const parts = [c.y, c.x].filter(Boolean).map((a) => `${Math.abs(a.mm).toFixed(1)} mm ${a.dir}`);
  return parts.length ? parts.join(' · ') : 'No change: the group is centred';
}
