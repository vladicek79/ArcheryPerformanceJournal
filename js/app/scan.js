// The Scan: reading arrows from the camera or a photo of the target to fill the shown end.
//
// This module owns the whole sequence of one Scan: whether it may start (and saving a full end
// first), reading a photo in two looks (the whole picture, then a close-up of the sheet), the found
// arrows as the archer adjusts them in the preview (dragged to another place, their scores) and,
// on Use, writing them into the shown end through the running session. A picture taken with the
// live camera is read inside its scan frame.
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
import { SHAFT_MM, arrowRadius, arrowZoneAt, ringEdges, scoreArrow, canScanFace } from './scoring.js';
import {
  CLOSE_UP_MARGIN,
  spotsBox,
  guideInPhoto,
  isCloseUp,
  keepCloseUp,
  moveArrow,
  arrowMarkLayout,
  resultOnCrop,
} from './scanGeometry.js';

/** A photo is read at most this many pixels on its long side (each of the two looks). */
export const PHOTO_MAX = 640;
/**
 * …and shown, to check the found arrows, at up to this many: the preview fills a phone's screen,
 * some 2000 device pixels tall, where the analysed picture would be blown up and blurred.
 */
export const PREVIEW_MAX = 2048;

/** A found arrow is where the shaft's middle enters the paper; it is drawn and scored this wide. */
export { SHAFT_MM };

/**
 * The score of a found arrow by the touching rule (scoring.js scoreArrow). Scored by the shaft's
 * middle instead, a line-cutter loses a point: on the photos marked with tools/tuner, the touching
 * rule gets more scores and ends right.
 */
export function touchScore(x, y, face, shaftMm = SHAFT_MM) {
  return scoreArrow(x, y, face, shaftMm);
}

/** The scores of found arrows on the face (by the touching rule), for a shaft `shaftMm` wide. */
export function scoresOf(arrows, face, shaftMm = SHAFT_MM) {
  return arrows.map((a) => touchScore(a.x, a.y, face, shaftMm));
}

/**
 * A Scan fills the end being shot, never an earlier end opened for editing; only on the faces the
 * detector knows (the WA target faces: not a field face, not a 3D animal).
 */
export function canScan(session) {
  return !!session && session.view == null && canScanFace(session.face);
}

/**
 * A photo read in two looks: the whole of it, then just the sheet (the box around the spots, taken
 * from the full-size photo, so the same number of analysed pixels shows the target in much more
 * detail). The close-up is kept when it finds the face again. A photo shows no more of the sheet
 * than it does, so a partial sheet gets its close-up too.
 * Returns { picture, res }: the kept look drawn again for the preview, as sharp as the photo allows
 * (up to PREVIEW_MAX), and what was found on it.
 */
async function readPhoto(photo, room, detect, guide = null) {
  const look = async (box) => {
    const scale = Math.min(1, PHOTO_MAX / Math.max(box.w, box.h));
    const picture = photo.draw(box, scale);
    return { picture, res: await detect(picture, room), scale, box };
  };
  // the photo taken at the lock is read inside the live camera's scan frame, as its video was
  const framed = guide && guideInPhoto(guide, photo);
  const whole =
    framed && framed.w > 16 && framed.h > 16 ? framed : { x: 0, y: 0, w: photo.width, h: photo.height };
  const first = await look(whole);
  if (first.res.error) return first;
  const inLook = spotsBox(first.res.spots, {
    margin: CLOSE_UP_MARGIN,
    bounds: { x: 0, y: 0, w: whole.w, h: whole.h },
    scale: first.scale,
  });
  const box = { ...inLook, x: inLook.x + whole.x, y: inLook.y + whole.y };
  const kept = isCloseUp(box, whole)
    ? await look(box).then((second) => (keepCloseUp(first.res, second.res) ? second : first))
    : first;
  return sharper(photo, kept);
}

/** The kept look drawn again at up to PREVIEW_MAX, with what was found moved to match. */
function sharper(photo, { picture, res, scale, box }) {
  const view = Math.min(1, PREVIEW_MAX / Math.max(box.w, box.h));
  if (view <= scale) return { picture, res };
  return { picture: photo.draw(box, view), res: resultOnCrop(res, { x: 0, y: 0 }, view / scale) };
}

/**
 * The found arrows of a picture as they will be used: the archer drags one (by its label or its
 * point of impact) to where it really is, and its spot and score follow.
 * `size` is the picture's { width, height }.
 */
function foundArrows(res, face, size, shaftMm = SHAFT_MM) {
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
    /** An arrow's radius, as a fraction of a spot's radius: the hole drawn round each found arrow. */
    arrowR: arrowRadius(face, shaftMm),
    scores: () => scoresOf(arrows, face, shaftMm),
    /**
     * Take hold of the arrow whose label or point of impact is nearest `p`, within `reach` (both in
     * picture pixels). True when one was taken.
     */
    grab(p, reach) {
      let best = null;
      arrows.forEach((a, i) => {
        const m = arrowMarkLayout(size.width, size.height, res.spots, a, { long: true });
        const d = Math.min(
          Math.hypot(m.lx - p.x, m.ly - p.y) - m.r,
          Math.hypot(a.image.x - p.x, a.image.y - p.y),
        );
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
     * The scoring zone the held arrow is in right now, to tint it: the edge of its spot in the
     * picture, and the zone's inner and outer edges as fractions of the spot's radius. It is the
     * zone its score comes from (a shaft touching a line, the higher ring; on a compound face the
     * outer 10 and the 9 ring together), so the tint and the score in the label always agree. Null
     * when nothing is held or the arrow is off the face.
     */
    heldRing() {
      if (held < 0) return null;
      const a = arrows[held];
      // the zone its score comes from (by the touching rule)
      const zone = arrowZoneAt(a.x, a.y, face, shaftMm);
      if (!zone) return null;
      const outer = (res.spots[res.partial ? 0 : (a.spot ?? 0)] || res.spots[0]).outer;
      return { outer, inner: zone.inner, edge: zone.edge };
    },
    /** The arrows as they go into the end: { v, x, y, spot }. */
    toEnd() {
      const v = scoresOf(arrows, face, shaftMm);
      return arrows.map((a, i) => ({ v: v[i], x: a.x, y: a.y, spot: a.spot }));
    },
  };
}

/**
 * @param {object} deps
 * @param deps.running    the running session (runningSession.js)
 * @param deps.camera     async (room) → the live camera's result: { file, guide } (a picture taken
 *                        with it, and the scan frame it was taken in: see guideInPhoto), { file } (a
 *                        photo chosen instead), or null (closed). `room` is { face, empty, spotHint }
 *                        (see scanRoom).
 * @param deps.openPhoto  async (file) → { width, height, draw(box, scale) → picture, close() }, or
 *                        null when the photo cannot be opened. `draw` gives the part `box` of the
 *                        photo at `scale` times its size; a picture has { width, height }.
 * @param deps.detect     (picture, room) → detection result (see photoDetect.js), or a promise of one
 * @param deps.preview    async ({ found, picture, again }) → boolean: the archer's answer to the
 *                        picture with the found arrows (Use / OK, or not). `again`: a no goes back
 *                        to the camera. `found` has arrows, held, spots, rings, scores(),
 *                        grab(p, reach), drag(p), drop() and heldRing().
 * @param deps.shaftMm    the arrows' diameter (mm), which scores and draws them (optional: SHAFT_MM)
 * @param deps.onChange   called when the full end was saved before the camera opens (optional)
 * @param deps.reread     async (picture, res, room) → res: the arrows read again another way before
 *                        they are shown (the neural network, arrowNet.js), or null for none. When it
 *                        fails, the detector's reading is shown as it was and `onRereadFailed(err)`
 *                        is told (optional).
 * @param deps.working    (text | null): what is being done while nothing else is on the screen (the
 *                        camera closed, the found arrows not shown yet: a full-size photo read, the
 *                        network asked), shown until called with null (optional).
 */
export function createScan({
  running,
  camera,
  openPhoto,
  detect,
  preview,
  shaftMm = SHAFT_MM,
  onChange = () => {},
  reread = null,
  onRereadFailed = () => {},
  working = () => {},
}) {
  /** Show the found arrows; on Use they replace the shown end's arrows. Null when cancelled. */
  async function offer(picture, res, room, again) {
    if (reread && !res.error) {
      working('Reading the arrows…');
      try {
        res = await reread(picture, res, room);
      } catch (err) {
        onRereadFailed(err);
      }
    }
    working(null);
    const found = foundArrows(res, room.face, picture, shaftMm);
    if (!(await preview({ found, picture, again }))) return null;
    if (!found.arrows.length) return { status: 'nothing' };
    return running.applyScan(found.toEnd()) ? { status: 'used' } : { status: 'failed' };
  }

  /**
   * A photo read in two looks and offered. `guide`: the live camera's scan frame (see
   * guideInPhoto), so a photo taken with it is read inside it; and a no in its preview goes back
   * to the camera (null).
   */
  async function fromPhoto(file, room, guide = null) {
    working('Reading the photo…');
    let read = null;
    try {
      const photo = await openPhoto(file);
      if (photo) {
        try {
          read = await readPhoto(photo, room, detect, guide);
        } finally {
          photo.close();
        }
      }
    } catch (err) {
      working(null);
      throw err;
    }
    if (!read || read.res.error) {
      working(null);
      return read ? { status: 'no-target', error: read.res.error } : { status: 'unreadable' };
    }
    const done = await offer(read.picture, read.res, room, !!guide);
    return done || (guide ? null : { status: 'cancelled' });
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
      // a picture taken with the live camera comes with its scan frame; a no goes back to the camera
      const done = await fromPhoto(got.file, room, got.guide ?? null);
      if (done) return done;
    }
  }

  return { start };
}
