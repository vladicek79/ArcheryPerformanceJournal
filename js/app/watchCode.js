// The watch code: the text in the QR code the Arrow Grades watch app shows after an end
// (watch/source/EndState.mc payload()). One end's grades, made on the wrist right after each shot.
//
// What the release's times mean (found with a deliberate pause at the set-up position, watch app
// 0.11): `setup` is the SET (hooking and gripping, before the bow is raised), `draw` the RAISE to
// the set-up position, and `hold` the still stretch from there to the release: the slow draw and
// the anchor. `pause` and `settle` split that stretch: set-up phase = draw + pause, the real draw =
// settle - pause, the anchor = hold - settle. The names are kept as the codes and the saved
// sessions have them.
//
// Format 7 (watch app 0.12.0 on): as format 6 with the follow-through in steps of 8 mm (a real bow
// throws the hand back up to 17 cm in 0.1 s). With a real bow the watch finds the release by its
// sharpness and tracks the shot back over the wrist's tilt; it then sends setup 0, draw = the
// set-up (hand on the string), settle = the draw, hold = draw + anchor, pause 0.
// Format 6 (watch app 0.11.0 on): as format 5 with a sixth character: the pause at the set-up
// position before the draw (0.2 s).
// Format 5 (watch app 0.10.0 on): as format 4, each release may end with five more characters (left
// out when the code would get too long), one each from DELTAS (0-42): settle (0.2 s: the first part
// of the hold, while the wrist's tilt still moves; the rest is the anchor), the tilt's change at
// anchor (0.1 degrees), and the follow-through: the hand's path over the 0.1 s after the release
// along the watch's x, y and z (3 mm, 21 = 0).
// Format 4 (watch app 0.9.0 on): as format 3, each release also carries the arrow it belongs to
// (the arrow selected at the release, or the next one picked): .D<t 3><arrow 2><set-up 2>...,
// arrow 00 = none.
// Format 3 (watch app 0.6.0-0.8.0): format 2 plus the shots the watch's motion detector found, before
// the trace: .D<t 3><set-up 2><draw 2><hold 3><steadiness 1> (times in 0.1 s; steadiness 0-9, 0 =
// stillest), t the second of the release.
// Format 2 (watch app 0.3.0 on):
//   APJ2.E<end>.<arrow>...[.H<step><first hr><changes>]
//   arrow: number (2) · M (1) · S (1) · t (3): the second of the heart-rate trace at the shot
//   H: the heart rate while the end was shot (from 30 s before the first shot to the last), in bins
//      of <step> seconds (1 digit): the first bin's value (3 digits), then one character per bin
//      for its change from the one before, -21..+21 (DELTAS)
// Format 1 (watch app 0.1-0.2):
//   APJ1.E<end>.<arrow>...   arrow: number (2) · M (1) · S (1) · heart rate (3)
//
// M / S 0 = not graded, heart rate 000 = none. Alphanumeric upper case, so the QR code stays small.
// Pure; no DOM.

/** Heart rate kept only within 30-250 beats per minute. */
export const HR_MIN = 30;
export const HR_MAX = 250;
export const ARROW_NO_MAX = 24;
export const SHOT_TIME_MAX = 999;
export const TRACE_STEP_MAX = 9;
export const TRACE_MAX = 300;

const DELTAS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-/:';
// number · M · S · heart rate (format 1) or shot time (format 2)
const ARROW = /^(\d{2})([0-5])([0-5])(\d{3})$/;
const TRACE = /^H([1-9])(\d{3})([0-9A-Z$%*+\-/:]*)$/;
const DETECTED = /^D(\d{3})(\d{2})(\d{2})(\d{3})(\d)$/;
const DETECTED_4 = /^D(\d{3})(\d{2})(\d{2})(\d{2})(\d{3})(\d)$/;
const DETECTED_5 = /^D(\d{3})(\d{2})(\d{2})(\d{2})(\d{3})(\d)([0-9A-Z$%*+\-/:]{5})?$/;
const DETECTED_6 = /^D(\d{3})(\d{2})(\d{2})(\d{2})(\d{3})(\d)([0-9A-Z$%*+\-/:]{6})?$/;
export const DETECTED_MAX = 30;
/** Settle up to 8.4 s, tilt change up to 4.2 degrees, follow-through within 168 mm an axis. */
export const SETTLE_MAX = 8.4;
export const DRIFT_MAX = 4.2;
export const FOLLOW_MAX = 168;

const bad = { ok: false, error: 'bad' };

/** The trace of a format 2 code ("H2080LMN" → { step: 2, hr: [80, 80, 81, 83] }), or null if damaged. */
function readTrace(part) {
  const m = TRACE.exec(part);
  if (!m) return null;
  const hr = [Number(m[2])];
  for (const ch of m[3]) hr.push(hr[hr.length - 1] + DELTAS.indexOf(ch) - 21);
  if (hr.length > TRACE_MAX || hr.some((v) => v < HR_MIN || v > HR_MAX)) return null;
  return { step: Number(m[1]), hr };
}

/** The heart rate of the trace at second `t` (the bin it falls in; past the end: the last one). */
export function traceAt(trace, t) {
  if (!trace?.hr?.length || t == null) return null;
  return trace.hr[Math.min(Math.floor(t / trace.step), trace.hr.length - 1)];
}

/**
 * Read a scanned code. Returns { ok: true, end, arrows: [{ no, m, s, hr }] } (format 2 and 3 also:
 * each arrow's `t`, the end's `trace` { step, hr } or null and `detected` [{ t, setup, draw, hold,
 * steady }], empty before format 3; format 5 also settle, drift, fx, fy, fz) with the arrows in arrow-number order,
 * or { ok: false, error } where error is
 *   'not-watch'  not a code of the watch app,
 *   'version'    a newer format than this app reads (update the app),
 *   'bad'        the watch app's code, but damaged.
 */
export function parseWatchCode(text) {
  if (typeof text !== 'string') return { ok: false, error: 'not-watch' };
  const parts = text.trim().toUpperCase().split('.');
  if (!/^APJ\d+$/.test(parts[0])) return { ok: false, error: 'not-watch' };
  const format = { APJ1: 1, APJ2: 2, APJ3: 3, APJ4: 4, APJ5: 5, APJ6: 6, APJ7: 7 }[parts[0]] ?? 0;
  const followStep = format >= 7 ? 8 : 3; // mm
  if (!format) return { ok: false, error: 'version' };
  const endMatch = /^E(\d{1,3})$/.exec(parts[1] ?? '');
  if (!endMatch) return bad;
  let rest = parts.slice(2);
  let trace = null;
  if (format >= 2 && rest.length && rest[rest.length - 1].startsWith('H')) {
    trace = readTrace(rest[rest.length - 1]);
    if (!trace) return bad;
    rest = rest.slice(0, -1);
  }
  const detected = [];
  while (format >= 3 && rest.length && rest[rest.length - 1].startsWith('D')) {
    const part = rest[rest.length - 1];
    if (format === 3) {
      const m = DETECTED.exec(part);
      if (!m) return bad;
      detected.unshift({
        t: Number(m[1]),
        setup: Number(m[2]) / 10,
        draw: Number(m[3]) / 10,
        hold: Number(m[4]) / 10,
        steady: Number(m[5]),
      });
    } else {
      const m = (format === 4 ? DETECTED_4 : format === 5 ? DETECTED_5 : DETECTED_6).exec(part);
      if (!m) return bad;
      const no = Number(m[2]);
      if (no > ARROW_NO_MAX) return bad;
      const more = m[7] ? [...m[7]].map((ch) => DELTAS.indexOf(ch)) : null;
      detected.unshift({
        t: Number(m[1]),
        ...(no ? { no } : {}),
        setup: Number(m[3]) / 10,
        draw: Number(m[4]) / 10,
        hold: Number(m[5]) / 10,
        steady: Number(m[6]),
        ...(more
          ? {
              settle: more[0] / 5,
              drift: more[1] / 10,
              fx: (more[2] - 21) * followStep,
              fy: (more[3] - 21) * followStep,
              fz: (more[4] - 21) * followStep,
              ...(more.length > 5 ? { pause: more[5] / 5 } : {}),
            }
          : {}),
      });
    }
    rest = rest.slice(0, -1);
  }
  if (detected.length > DETECTED_MAX) return bad;
  const arrows = [];
  for (const p of rest) {
    const m = ARROW.exec(p);
    if (!m) return bad;
    const no = Number(m[1]);
    if (no < 1 || no > ARROW_NO_MAX || arrows.some((a) => a.no === no)) return bad;
    const grades = { no, m: Number(m[2]) || null, s: Number(m[3]) || null };
    if (format === 1) {
      const hr = Number(m[4]);
      arrows.push({ ...grades, hr: hr >= HR_MIN && hr <= HR_MAX ? hr : null });
    } else {
      const t = Number(m[4]);
      arrows.push({ ...grades, t, hr: traceAt(trace, t) });
    }
  }
  arrows.sort((a, b) => a.no - b.no);
  if (format === 1) return { ok: true, end: Number(endMatch[1]), arrows };
  return { ok: true, end: Number(endMatch[1]), arrows, trace, detected };
}

/** What to tell the archer when a code cannot be used. */
export function watchCodeProblem(error) {
  if (error === 'version') return 'This watch code is newer than the app. Reload the app to update it.';
  if (error === 'bad') return 'The watch code could not be read completely. Scan it again.';
  return 'That is not a code of the Arrow Grades watch app.';
}

/**
 * A scanned code as an end of a blank bale session (no score, no target): its arrows as the watch
 * graded them, its heart rate and the shots its motion detector found, in the shape of a scored
 * end's watch data (sessionLogic.applyWatchGrades), so the same timeline reads both. `watchEnd`:
 * the watch's end counter, to tell a code scanned twice.
 */
export function watchEndOf(code) {
  return {
    arrows: code.arrows.map((a) => ({ v: null, m: a.m, s: a.s, x: null, y: null, no: a.no, ...(a.hr != null ? { hr: a.hr } : {}), ...(a.t != null ? { t: a.t } : {}) })),
    ld: 0,
    cld: 0,
    note: '',
    watchEnd: code.end,
    ...(code.trace ? { hrTrace: { step: code.trace.step, hr: [...code.trace.hr] } } : {}),
    ...(code.detected?.length ? { watchShots: code.detected.map((d) => ({ ...d })) } : {}),
  };
}

/** The arrows a code stands for: those graded or the shots detected, whichever are more. */
export const watchShotCount = (code) => Math.max(code.arrows.length, code.detected?.length ?? 0);
