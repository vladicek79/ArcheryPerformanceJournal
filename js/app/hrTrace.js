// The heart-rate curve of one end (from the watch, see watchCode.js) as a small chart: the line of
// the trace and a dot at each shot. Pure; the view draws it as SVG.
import { traceAt } from './watchCode.js';

/**
 * Chart geometry in a `w` × `h` box for an end's `hrTrace` { step, hr } and its arrows (each with
 * its shot time `t`), or null when the end has no trace. The heart-rate axis spans the trace's own
 * range (at least 10 beats, so a flat curve stays flat).
 *   { points: "x,y x,y …", shots: [{ x, y, hr, m }], min, max, seconds }
 */
export function hrChart(trace, arrows = [], { w = 200, h = 40, pad = 3 } = {}) {
  if (!trace?.hr?.length) return null;
  const hr = trace.hr;
  let min = Math.min(...hr);
  let max = Math.max(...hr);
  if (max - min < 10) {
    const mid = (max + min) / 2;
    min = mid - 5;
    max = mid + 5;
  }
  const seconds = Math.max(trace.step, (hr.length - 1) * trace.step);
  const x = (t) => pad + (Math.min(t, seconds) / seconds) * (w - 2 * pad);
  const y = (v) => pad + ((max - v) / (max - min)) * (h - 2 * pad);
  const r = (n) => Math.round(n * 10) / 10;
  const points = hr.map((v, i) => `${r(x(i * trace.step))},${r(y(v))}`).join(' ');
  const shots = arrows
    .filter((a) => a && a.t != null)
    .map((a) => {
      // the dot sits on the line: the trace's value in the bin of the shot
      const v = traceAt(trace, a.t);
      return { x: r(x(a.t)), y: r(y(v)), hr: v, m: a.m ?? null };
    });
  return { points, shots, min: Math.min(...hr), max: Math.max(...hr), seconds };
}

/** How long after a release the archer's tap on the watch may come to still belong to it. */
export const TAP_WINDOW = 30;

const avg1 = (xs) => (xs.length ? Math.round((xs.reduce((t, v) => t + v, 0) / xs.length) * 10) / 10 : null);

/**
 * What the watch recorded through one end, for the end's timeline: its shots in the order shot,
 * the end's length and its heart rate. Null when the end has nothing from the watch.
 *
 * A shot is a release the watch's motion detector found (`watchShots`, with its set-up, draw and
 * hold), joined with the arrow graded on the watch right after it (tapped from 2 s before the
 * release until the next release, at most TAP_WINDOW s later). A graded arrow without a release
 * keeps the time of its tap; a release without a graded arrow stays, unnamed.
 *   { seconds, shots: [{ no, t, gap, m, s, hr, v, setup, draw, hold, steady, detected }],
 *     avgGap, avg: { setup, draw, hold } | null, firstShot, lastShot, hr: { min, avg, max } | null }
 *
 * What the times are (see watchCode.js): `setup` is the set (hook and grip), `draw` the raise to
 * the set-up position, `hold` the still stretch from there to the release (the slow draw and the
 * anchor). From watch app 0.10 that stretch is split, and a release also has `raise` (the set-up
 * phase: the raise and any pause at the set-up position), `pull` (the real draw), `anchor`, `settle`
 * (pause + pull), `drift` (the tilt's change at anchor,
 * degrees), `follow` (the length of the hand's path over the 0.1 s after the release, mm) and
 * `followOff` (how far that path ends from the end's average one, mm; null with fewer than two)
 * and `followBack` (the part of it straight back along the forearm, towards the elbow, mm: the
 * watch's -x, as worn on the left wrist with the START button towards the hand);
 * `avg` then also has `raise`, `pull`, `anchor` and `follow`.
 */
export function endTimeline(end) {
  const trace = end?.hrTrace?.hr?.length ? end.hrTrace : null;
  const releases = [...(end?.watchShots ?? [])].sort((a, b) => a.t - b.t);
  const timed = (end?.arrows ?? []).filter((a) => a && a.t != null).sort((a, b) => a.t - b.t);
  if (!trace && !timed.length && !releases.length) return null;

  const used = new Set();
  // the arrow the watch named for the release (format 4: the arrow selected at the release, or the
  // next one picked); else the arrow tapped right after it. An arrow the watch never graded (scored
  // on the phone only) carries no number, but it sits in its number's slot of the end: arrow 1 is
  // the end's first.
  const byNo = (no) => {
    const arrows = end.arrows ?? [];
    const named = arrows.find((a) => a && a.no === no && !used.has(a));
    if (named) return named;
    const slot = arrows[no - 1];
    return slot && slot.no == null && slot.v != null && !used.has(slot) ? slot : undefined;
  };
  const arrowFor = (r, next) =>
    r.no != null
      ? byNo(r.no)
      : timed.find(
          (a) => !used.has(a) && a.t >= r.t - 2 && a.t - r.t <= TAP_WINDOW && (next == null || a.t < next.t),
        );
  const fromArrow = (a) => ({ no: a.no ?? null, m: a.m ?? null, s: a.s ?? null, v: a.v ?? null });
  // the follow-through of each release against the end's average one
  const followed = releases.filter((r) => r.fx != null);
  const mean = ['fx', 'fy', 'fz'].map((k) => followed.reduce((t, r) => t + r[k], 0) / (followed.length || 1));
  const r1 = (v) => Math.round(v * 10) / 10;
  const settleOf = (r) => Math.min(r.settle, r.hold);
  const pauseOf = (r) => Math.min(r.pause ?? 0, settleOf(r));
  const more = (r) =>
    r.settle == null
      ? {}
      : {
          settle: settleOf(r),
          raise: r1(r.draw + pauseOf(r)),
          pull: r1(settleOf(r) - pauseOf(r)),
          anchor: Math.round(Math.max(0, r.hold - r.settle) * 10) / 10,
          drift: r.drift,
          follow: Math.round(Math.hypot(r.fx, r.fy, r.fz)),
          followBack: -r.fx,
          followOff:
            followed.length > 1
              ? Math.round(Math.hypot(r.fx - mean[0], r.fy - mean[1], r.fz - mean[2]))
              : null,
        };
  const list = releases.map((r, i) => {
    const a = arrowFor(r, releases[i + 1]);
    if (a) used.add(a);
    return {
      // timing only (watch grading off): the release keeps the number the watch gave it
      ...(a ? { ...fromArrow(a), no: a.no ?? r.no ?? null } : { no: r.no ?? null, m: null, s: null, v: null }),
      t: r.t,
      hr: traceAt(trace, r.t) ?? a?.hr ?? null,
      setup: r.setup,
      draw: r.draw,
      hold: r.hold,
      steady: r.steady,
      ...more(r),
      detected: true,
    };
  });
  for (const a of timed) {
    if (!used.has(a))
      list.push({ ...fromArrow(a), t: a.t, hr: a.hr ?? traceAt(trace, a.t), detected: false });
  }
  list.sort((a, b) => a.t - b.t);
  const shots = list.map((x, i) => ({ ...x, gap: i ? x.t - list[i - 1].t : null }));

  const gaps = shots.filter((x) => x.gap != null).map((x) => x.gap);
  const lastT = shots.length ? shots[shots.length - 1].t : 0;
  const seconds = Math.max(trace ? trace.hr.length * trace.step : 0, lastT);
  const hr = trace
    ? {
        min: Math.min(...trace.hr),
        avg: Math.round(trace.hr.reduce((t, v) => t + v, 0) / trace.hr.length),
        max: Math.max(...trace.hr),
      }
    : null;
  return {
    seconds,
    shots,
    avgGap: gaps.length ? Math.round(gaps.reduce((t, g) => t + g, 0) / gaps.length) : null,
    avg: releases.length
      ? {
          setup: avg1(releases.map((r) => r.setup)),
          draw: avg1(releases.map((r) => r.draw)),
          hold: avg1(releases.map((r) => r.hold)),
          ...(followed.length
            ? {
                raise: avg1(followed.map((r) => r.draw + pauseOf(r))),
                pull: avg1(followed.map((r) => settleOf(r) - pauseOf(r))),
                anchor: avg1(followed.map((r) => Math.max(0, r.hold - r.settle))),
                follow: Math.round(
                  followed.reduce((t, r) => t + Math.hypot(r.fx, r.fy, r.fz), 0) / followed.length,
                ),
              }
            : {}),
        }
      : null,
    firstShot: shots.length ? shots[0].t : null,
    lastShot: shots.length ? lastT : null,
    hr,
  };
}

/** "0:42" / "12:05" for a number of seconds. */
export function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
