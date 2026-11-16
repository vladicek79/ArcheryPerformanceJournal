// The Scan: reading arrows from the camera or a photo of the target to fill the shown end.
//
// This module owns the whole sequence of one Scan: whether it may start (and saving a full end
// first), reading a photo in two looks (the whole picture, then a close-up of the sheet), the found
// arrows as the archer adjusts them in the preview (dragged to another place, their scores) and,
// on Use, writing them into the shown end through the running session. For the live camera it also
// decides when the readings of the recent frames are steady enough to lock.
//
// It never touches the DOM: the camera, opening a photo, drawing a part of it, the detector and the
// preview dialog are adapters, so the same code runs in the app and in tests.
//
// start() reports what happened as `{ status }`:
//   'used' (the arrows went into the end) · 'nothing' (nothing found, and the archer said OK)
//   'cancelled' (the camera was closed, or a photo's preview cancelled) · 'refused' (an earlier
//   end is shown) · 'none' (no running session) · 'unreadable' (the photo could not be opened)
//   'no-target' (with the detector's `error`) · 'failed' (the save was refused)

import * as L from './sessionLogic.js';
import { consensus } from './photoDetect.js';
import { ringEdges, scoreFromPoint } from './scoring.js';
import { CLOSE_UP_MARGIN, spotsBox, isCloseUp, keepCloseUp, withArrows, moveArrow, arrowMarkLayout } from './scanGeometry.js';

/** A photo is read at most this many pixels on its long side (each of the two looks). */
export const PHOTO_MAX = 640;

/** The live camera locks when the agreed reading goes back at least this long… */
export const LOCK_MS = 1000;
/** …and this many of the recent frames agree on it. */
export const LOCK_FRAMES = 5;
/** How many recent readings are compared… */
const WINDOW_FRAMES = 8;
/** …and readings older than this are dropped. */
const WINDOW_MS = 5000;

/** The scores of found arrows on the face. */
export function scoresOf(arrows, face) {
  return arrows.map((a) => scoreFromPoint(a.x, a.y, face));
}

/** A Scan fills the end being shot, never an earlier end opened for editing. */
export function canScan(session) {
  return !!session && session.view == null;
}

/**
 * Where the live camera looks in the next frame: just the sheet (the box around the spots, with a
 * margin) once every spot of it is seen, so the same number of analysed pixels shows the target
 * in more detail; null for the whole frame. While only some spots are seen (the camera came in on
 * one spot first) it keeps looking at the whole frame, or the others are never found.
 * `res` is in a picture `scale` times the size of `bounds` (the scan frame).
 */
export function nextLook(res, bounds, scale = 1) {
  if (res.partial) return null;
  const box = spotsBox(res.spots, { margin: CLOSE_UP_MARGIN, bounds, scale });
  return isCloseUp(box, bounds) ? box : null;
}

/**
 * A photo read in two looks: the whole of it, then just the sheet (the box around the spots, taken
 * from the full-size photo, so the same number of analysed pixels shows the target in much more
 * detail). The close-up is kept when it finds the face again. A photo shows no more of the sheet
 * than it does, so a partial sheet gets its close-up too.
 * Returns { picture, res }: the picture drawn for the kept look, and what was found on it.
 */
async function readPhoto(photo, room, detect) {
  const look = async (box) => {
    const scale = Math.min(1, PHOTO_MAX / Math.max(box.w, box.h));
    const picture = photo.draw(box, scale);
    return { picture, res: await detect(picture, room), scale };
  };
  const whole = { x: 0, y: 0, w: photo.width, h: photo.height };
  const first = await look(whole);
  if (first.res.error) return first;
  const box = spotsBox(first.res.spots, { margin: CLOSE_UP_MARGIN, bounds: whole, scale: first.scale });
  if (!isCloseUp(box, whole)) return first;
  const second = await look(box);
  return keepCloseUp(first.res, second.res) ? second : first;
}

/**
 * The found arrows of a picture as they will be used: the archer drags one (by its label or its
 * point of impact) to where it really is, and its spot and score follow.
 * `size` is the picture's { width, height }.
 */
function foundArrows(res, face, size) {
  const arrows = res.arrows.map((a) => ({ ...a, image: { ...a.image } }));
  const rings = ringEdges(face);
  let held = -1;
  let offset = null; // from the finger to the held arrow's point of impact

  return {
    get arrows() {
      return arrows;
    },
    /** The arrow being dragged, or -1. */
    get held() {
      return held;
    },
    /** The spots found, each with its edge in the picture (`outer`). */
    spots: res.spots,
    /** The scoring rings of the face, as fractions of a spot's radius (the X ring first). */
    rings,
    scores: () => scoresOf(arrows, face),
    /**
     * Take hold of the arrow whose label or point of impact is nearest `p`, within `reach` (both in
     * picture pixels). True when one was taken.
     */
    grab(p, reach) {
      let best = null;
      arrows.forEach((a, i) => {
        const m = arrowMarkLayout(size.width, size.height, res.spots, a, { long: true });
        const d = Math.min(Math.hypot(m.lx - p.x, m.ly - p.y) - m.r, Math.hypot(a.image.x - p.x, a.image.y - p.y));
        if (d <= reach && (!best || d < best.d)) best = { i, d };
      });
      if (!best) return false;
      held = best.i;
      const a = arrows[held];
      offset = { x: a.image.x - p.x, y: a.image.y - p.y };
      return true;
    },
    /** The finger moved to `p`: the held arrow follows, keeping its distance to the finger. */
    drag(p) {
      if (held < 0) return;
      arrows[held] = moveArrow(arrows[held], { x: p.x + offset.x, y: p.y + offset.y }, res, face, size);
    },
    drop() {
      held = -1;
      offset = null;
    },
    /**
     * The ring the held arrow is in right now, to tint it: the edge of its spot in the picture, and
     * the ring's inner and outer edges as fractions of the spot's radius. Null when nothing is held
     * or the arrow is off the face.
     */
    heldRing() {
      if (held < 0) return null;
      const a = arrows[held];
      const k = rings.findIndex((f) => Math.hypot(a.x, a.y) <= f);
      if (k < 0) return null;
      const outer = (res.spots[res.partial ? 0 : (a.spot ?? 0)] || res.spots[0]).outer;
      return { outer, inner: k > 0 ? rings[k - 1] : 0, edge: rings[k] };
    },
    /** The arrows as they go into the end: { v, x, y, spot }. */
    toEnd() {
      const v = scoresOf(arrows, face);
      return arrows.map((a, i) => ({ v: v[i], x: a.x, y: a.y, spot: a.spot }));
    },
  };
}

/**
 * @param {object} deps
 * @param deps.running    the running session (runningSession.js)
 * @param deps.camera     async (room) → the live camera's result: { picture, res } (the picture to
 *                        preview and what was found on it), { file } (a photo chosen instead), or
 *                        null (closed). `room` is { face, empty, spotHint } (see scanRoom).
 * @param deps.openPhoto  async (file) → { width, height, draw(box, scale) → picture, close() }, or
 *                        null when the photo cannot be opened. `draw` gives the part `box` of the
 *                        photo at `scale` times its size; a picture has { width, height }.
 * @param deps.detect     (picture, room) → detection result (see photoDetect.js), or a promise of one
 * @param deps.preview    async ({ found, picture, again }) → boolean: the archer's answer to the
 *                        picture with the found arrows (Use / OK, or not). `again`: a no goes back
 *                        to the camera. `found` has arrows, held, spots, rings, scores(),
 *                        grab(p, reach), drag(p), drop() and heldRing().
 * @param deps.onChange   called when the full end was saved before the camera opens (optional)
 */
export function createScan({ running, camera, openPhoto, detect, preview, onChange = () => {} }) {
  /** Show the found arrows; on Use they replace the shown end's arrows. Null when cancelled. */
  async function offer(picture, res, room, again) {
    const found = foundArrows(res, room.face, picture);
    if (!(await preview({ found, picture, again }))) return null;
    if (!found.arrows.length) return { status: 'nothing' };
    return running.applyScan(found.toEnd()) ? { status: 'used' } : { status: 'failed' };
  }

  async function fromPhoto(file, room) {
    const photo = await openPhoto(file);
    if (!photo) return { status: 'unreadable' };
    let read;
    try {
      read = await readPhoto(photo, room, detect);
    } finally {
      photo.close();
    }
    if (read.res.error) return { status: 'no-target', error: read.res.error };
    return (await offer(read.picture, read.res, room, false)) || { status: 'cancelled' };
  }

  /**
   * Scan the target into the shown end. On a full end the Scan means "the next end": the full one
   * is saved, a new end starts and the camera opens for it. On an end with room the Scan reads that
   * end anew (and replaces it). Back in the preview of a live frame goes back to the camera.
   */
  async function start() {
    const session = running.get();
    if (!session) return { status: 'none' };
    if (!canScan(session)) return { status: 'refused' };
    if (L.shownEnd(session).arrows.every((a) => a.v != null) && running.apply(L.nextEnd)) onChange();
    for (;;) {
      const room = running.scanRoom();
      if (!room) return { status: 'none' };
      const got = await camera(room);
      if (!got) return { status: 'cancelled' };
      if (got.file) return fromPhoto(got.file, room);
      const done = await offer(got.picture, got.res, room, true);
      if (done) return done;
    }
  }

  return { start };
}

/**
 * The live camera's readings, frame by frame, and when they are steady enough to lock. A frame
 * that reads something else now and then (blur, a reflection) changes nothing: what is shown are
 * the arrows most recent frames agree on, and the reading locks once enough of them agree for long
 * enough. Times are passed in (ms), so nothing here reads a clock.
 *
 * read(res, now) takes a frame's detection result and says what to show:
 *   kind      'lost' (no target) · 'empty' (target, no arrows) · 'partial' (only part of the sheet,
 *             with several arrows to place) · 'reading' (nothing agrees yet) · 'holding'
 *   show      the result to draw (null when lost), scores = its arrows' scores
 *   hollow    the arrows are drawn hollow (nothing agrees with them yet)
 *   progress  0…1 towards the lock · canTake: "Take now" may take · locked: take it now
 * take() is what "Take now" (or the lock) hands over: the agreed arrows on the latest picture,
 * or the latest reading while nothing agrees; null before any.
 */
export function createSteadyReading({ face, maxArrows }) {
  let last = null; // the latest result without an error
  let recent = []; // the last readings: [{ t, arrows }]
  let hold = null; // what most of them agree on: { arrows, count, since }, or null

  const state = (kind, show, { hollow = false, progress = 0, locked = false } = {}) => ({
    kind,
    show,
    scores: show ? scoresOf(show.arrows, face) : [],
    hollow,
    progress,
    canTake: !!last,
    locked,
  });

  function take() {
    if (!last) return null;
    return hold ? withArrows(last, hold.arrows) : last;
  }

  function read(res, now) {
    if (res.error) {
      last = null;
      hold = null;
      recent = [];
      return state('lost', null);
    }
    last = res;
    if (!res.arrows.length) {
      hold = null;
      recent = [];
      return state('empty', res);
    }
    // With several arrows to place on a sheet of several spots, all its spots must be in the
    // picture. A view of one spot alone never locks by itself ("Take now" still takes it).
    if (res.partial && maxArrows > 1) {
      hold = null;
      recent = [];
      return state('partial', res, { hollow: true });
    }
    recent.push({ t: now, arrows: res.arrows });
    recent = recent.filter((f) => now - f.t < WINDOW_MS).slice(-WINDOW_FRAMES);
    const agreed = consensus(recent.map((f) => f.arrows));
    hold = agreed && agreed.count >= 2 ? { ...agreed, since: recent[agreed.oldest].t } : null;
    if (!hold) return state('reading', take(), { hollow: true });
    return state('holding', take(), {
      progress: Math.min(1, (now - hold.since) / LOCK_MS, hold.count / LOCK_FRAMES),
      locked: now - hold.since >= LOCK_MS && hold.count >= LOCK_FRAMES,
    });
  }

  return { read, take };
}
