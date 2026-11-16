import { describe, it, expect, beforeEach } from 'vitest';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import * as L from '../public/js/app/sessionLogic.js';
import { createRunningSession } from '../public/js/app/runningSession.js';
import { canScan, createScan, createSteadyReading, nextLook, LOCK_MS, LOCK_FRAMES } from '../public/js/app/scan.js';
import { pictureFromFace } from '../public/js/app/scanGeometry.js';
import { FACE_IDS, ringEdges, scoreFromPoint } from '../public/js/app/scoring.js';

const spot = (cx, cy, r) => ({ outer: { cx, cy, rx: r, ry: r, angle: 0 } });

/** A detection result whose arrows' picture points match their places on the face. */
function result(spots, arrows, partial = false) {
  return {
    partial,
    spots,
    arrows: arrows.map((a) => ({ ...a, image: pictureFromFace(spots[a.spot ?? 0].outer, a) })),
  };
}

/** A triple seen upright on a 400 × 500 picture: three spots in a column, radius 50. */
const triple = () => [spot(200, 100, 50), spot(200, 210, 50), spot(200, 320, 50)];

let repo;
let running;
let camera; // what the camera hands over, in order
let previews; // how the archer answers each preview, in order (a function, or true / false)
let asked; // what the Scan asked: ['camera', room] / ['preview', { found, picture, again }]
let photos; // photos opened, by file
let detected; // the pictures the detector was given
let detector; // (picture) → result
let changes;

const SETUP = { date: '2026-11-09', type: 'training', distance: 18, face: '40t', arrowsPerEnd: 3, gear: null, gearSnapshotId: null };

/** A fake photo: drawing a part of it gives a picture that remembers which part and at what scale. */
function photo(width, height) {
  return {
    width,
    height,
    closed: false,
    draw(box, scale) {
      return { box, scale, width: Math.round(box.w * scale), height: Math.round(box.h * scale) };
    },
    close() {
      this.closed = true;
    },
  };
}

function make() {
  return createScan({
    running,
    detect: (picture, room) => {
      detected.push({ picture, room });
      return detector(picture);
    },
    camera: async (room) => {
      asked.push(['camera', room]);
      return camera.shift() ?? null;
    },
    openPhoto: async (file) => photos[file] ?? null,
    preview: async (q) => {
      asked.push(['preview', q]);
      const answer = previews.shift() ?? true;
      return typeof answer === 'function' ? answer(q) : answer;
    },
    onChange: () => changes++,
  });
}

beforeEach(async () => {
  repo = createRepository({
    adapter: createMemoryAdapter(),
    storageKey: 'test.v1',
    appId: 'archery-performance-journal',
    schemaVersion: 1,
    collections,
    defaultSettings,
    migrations: [],
  });
  repo.init();
  running = createRunningSession({
    repo,
    save: (name, record) => repo.save(name, record),
    remove: (name, id) => (repo.remove(name, id), true),
    confirm: async () => true,
  });
  camera = [];
  previews = [];
  asked = [];
  photos = {};
  detected = [];
  detector = () => ({ error: 'No target face found.' });
  changes = 0;
});

const shot = (arrows) => ({ picture: { width: 400, height: 500 }, res: result(triple(), arrows) });
const shown = () => L.shownEnd(running.get()).arrows;
const scores = () => shown().map((a) => a.v);
const kinds = () => asked.map((q) => q[0]);

describe('starting a scan', () => {
  it('does nothing without a running session', async () => {
    expect((await make().start()).status).toBe('none');
    expect(asked).toEqual([]);
  });

  it('is refused while an earlier end is shown', async () => {
    await running.start(SETUP);
    running.apply((s) => L.enterScore(s, 10));
    running.apply(L.nextEnd);
    running.apply(L.prevEnd);
    expect(canScan(running.get())).toBe(false);
    expect((await make().start()).status).toBe('refused');
    expect(asked).toEqual([]);
  });

  it('is allowed on the end being shot, also when it is empty', async () => {
    await running.start(SETUP);
    expect(canScan(running.get())).toBe(true);
    running.apply((s) => L.enterScore(s, 10));
    running.apply(L.nextEnd);
    expect(canScan(running.get())).toBe(true);
  });

  it('on a full end saves it and fills the next end', async () => {
    await running.start(SETUP);
    for (const v of [10, 9, 8]) running.apply((s) => L.enterScore(s, v));
    camera = [shot([{ x: 0.05, y: 0, spot: 1 }, { x: 0, y: 0.5, spot: 0 }])];
    const res = await make().start();
    expect(res.status).toBe('used');
    // the camera opened for the new end, and the page was told before it did
    expect(asked[0]).toEqual(['camera', { face: '40t', empty: 3, spotHint: 0 }]);
    expect(changes).toBe(1);
    const s = running.get();
    expect(s.ends.map((e) => e.arrows.map((a) => a.v))).toEqual([[10, 9, 8]]);
    expect(scores()).toEqual(['X', 8, null]);
  });

  it('on an end with room reads it anew and replaces what it held', async () => {
    await running.start(SETUP);
    running.apply((s) => L.enterScore(s, 6));
    camera = [shot([{ x: 0.3, y: 0, spot: 2 }])];
    expect((await make().start()).status).toBe('used');
    expect(changes).toBe(0);
    expect(running.get().ends).toEqual([]);
    expect(shown()[0]).toMatchObject({ v: 9, x: 0.3, y: 0, spot: 2 });
    expect(scores()).toEqual([9, null, null]);
  });
});

describe('the live camera', () => {
  beforeEach(async () => {
    await running.start(SETUP);
    running.apply((s) => L.enterScore(s, 6));
  });

  it('closed without a result keeps the end as it was', async () => {
    expect((await make().start()).status).toBe('cancelled');
    expect(scores()).toEqual([6, null, null]);
  });

  it('"back to camera" keeps nothing of the preview, and the camera opens again', async () => {
    camera = [shot([{ x: 0, y: 0, spot: 0 }]), shot([{ x: 0.5, y: 0, spot: 1 }])];
    previews = [false, true];
    expect((await make().start()).status).toBe('used');
    expect(kinds()).toEqual(['camera', 'preview', 'camera', 'preview']);
    expect(asked[1][1].again).toBe(true);
    expect(scores()).toEqual([8, null, null]);
  });

  it('"back to camera" and then closing it leaves the end untouched', async () => {
    camera = [shot([{ x: 0, y: 0, spot: 0 }])];
    previews = [false];
    expect((await make().start()).status).toBe('cancelled');
    expect(scores()).toEqual([6, null, null]);
  });

  it('a preview with nothing found settles the scan on OK, and changes nothing', async () => {
    camera = [shot([])];
    expect((await make().start()).status).toBe('nothing');
    expect(scores()).toEqual([6, null, null]);
  });
});

describe('a photo: two looks', () => {
  // a 1280 × 960 photo is read at half size (640 px on the long side); the sheet stands in the middle
  const wholeRes = () => result([spot(320, 130, 50), spot(320, 240, 50), spot(320, 350, 50)], [{ x: 0.5, y: 0, spot: 0 }]);
  const closeUpRes = (spots = triple()) => result(spots, [{ x: 0.05, y: 0, spot: 1 }]);
  const isWhole = (picture) => picture.box.w === 1280;

  beforeEach(async () => {
    await running.start(SETUP);
    photos = { a: photo(1280, 960) };
    camera = [{ file: 'a' }];
  });

  it('looks at the whole photo, then again at just the sheet, and keeps the close-up that finds the face again', async () => {
    detector = (p) => (isWhole(p) ? wholeRes() : closeUpRes());
    expect((await make().start()).status).toBe('used');
    expect(detected.map((d) => d.picture.box)).toEqual([
      { x: 0, y: 0, w: 1280, h: 960 },
      // radius 50 × 1.3 at half size → 130 px around the spots on the full photo
      { x: 510, y: 130, w: 260, h: 700 },
    ]);
    expect(detected[0].picture.scale).toBe(0.5);
    expect(detected[1].picture.scale).toBeCloseTo(640 / 700, 9);
    expect(detected[0].room).toEqual({ face: '40t', empty: 3, spotHint: 0 });
    const q = asked[1][1];
    expect(q.picture.box).toEqual({ x: 510, y: 130, w: 260, h: 700 });
    expect(q.again).toBe(false);
    expect(scores()).toEqual(['X', null, null]);
    expect(photos.a.closed).toBe(true);
  });

  it('drops the close-up when it finds fewer spots, or no face', async () => {
    detector = (p) => (isWhole(p) ? wholeRes() : closeUpRes(triple().slice(0, 2)));
    await make().start();
    expect(asked[1][1].picture.box).toEqual({ x: 0, y: 0, w: 1280, h: 960 });
    expect(scores()).toEqual([8, null, null]);

    photos.b = photo(1280, 960);
    camera = [{ file: 'b' }];
    asked = [];
    detector = (p) => (isWhole(p) ? wholeRes() : { error: 'No target face found.' });
    await make().start();
    expect(asked[1][1].picture.box.w).toBe(1280);
  });

  it('looks once when the sheet fills the photo already', async () => {
    detector = () => result([spot(320, 240, 200)], [{ x: 0, y: 0, spot: 0 }]);
    await make().start();
    expect(detected).toHaveLength(1);
  });

  it('on a partial sheet looks closer at the spots it did find (the photo shows no more of the sheet)', async () => {
    const one = (p) => (isWhole(p) ? result([spot(320, 240, 50)], [{ x: 0, y: 0, spot: 0 }], true) : result([spot(200, 200, 150)], [{ x: 0.3, y: 0, spot: 0 }], true));
    detector = one;
    await make().start();
    expect(detected).toHaveLength(2);
    expect(asked[1][1].picture.box).toEqual({ x: 510, y: 350, w: 260, h: 260 });
    expect(scores()).toEqual([9, null, null]);
  });

  it('tells what the detector said when there is no target, and asks nothing more', async () => {
    const res = await make().start();
    expect(res).toEqual({ status: 'no-target', error: 'No target face found.' });
    expect(kinds()).toEqual(['camera']);
    expect(photos.a.closed).toBe(true);
  });

  it('says so when the photo cannot be opened', async () => {
    camera = [{ file: 'broken' }];
    expect((await make().start()).status).toBe('unreadable');
  });

  it('Cancel in its preview ends the scan (no camera again) and keeps nothing', async () => {
    detector = (p) => (isWhole(p) ? wholeRes() : closeUpRes());
    previews = [false];
    expect((await make().start()).status).toBe('cancelled');
    expect(kinds()).toEqual(['camera', 'preview']);
    expect(scores()).toEqual([null, null, null]);
  });
});

describe('the found arrows', () => {
  beforeEach(async () => {
    await running.start(SETUP);
  });

  it('dragging an arrow changes its place, spot and score; Use enters them into the end', async () => {
    camera = [shot([{ x: 0.05, y: 0, spot: 1 }, { x: 0.5, y: 0, spot: 0 }])];
    let seen;
    previews = [
      ({ found }) => {
        expect(found.scores()).toEqual(['X', 8]);
        const a = found.arrows[0];
        // grabbed by its point of impact: the finger is 3 px to its right
        expect(found.grab({ x: a.image.x + 3, y: a.image.y }, 26)).toBe(true);
        expect(found.held).toBe(0);
        found.drag({ x: 203, y: 300 });
        seen = { arrow: found.arrows[0], scores: found.scores() };
        found.drop();
        expect(found.held).toBe(-1);
        return true;
      },
    ];
    expect((await make().start()).status).toBe('used');
    // it kept its distance to the finger, and now lies on the third spot
    expect(seen.arrow.image).toEqual({ x: 200, y: 300 });
    expect(seen.arrow.spot).toBe(2);
    expect(seen.scores).toEqual([8, 8]); // on the ring line: the lower ring
    expect(shown().slice(0, 2)).toEqual([
      expect.objectContaining({ v: 8, x: 0, y: -0.4, spot: 2 }),
      expect.objectContaining({ v: 8, x: 0.5, y: 0, spot: 0 }),
    ]);
  });

  it('a touch away from every arrow and label grabs nothing', async () => {
    camera = [shot([{ x: 0, y: 0, spot: 0 }])];
    previews = [
      ({ found }) => {
        expect(found.grab({ x: 390, y: 490 }, 26)).toBe(false);
        expect(found.held).toBe(-1);
        found.drag({ x: 200, y: 320 }); // nothing held: nothing moves
        expect(found.scores()).toEqual(['X']);
        return true;
      },
    ];
    await make().start();
    expect(scores()).toEqual(['X', null, null]);
  });

  it('shows the ring the held arrow is in, from the scoring rings of the face', async () => {
    camera = [shot([{ x: 0.3, y: 0, spot: 2 }])];
    previews = [
      ({ found }) => {
        expect(found.rings).toEqual(ringEdges('40t'));
        expect(found.heldRing()).toBeNull();
        found.grab(found.arrows[0].image, 26);
        expect(found.heldRing()).toEqual({ outer: triple()[2].outer, inner: 0.2, edge: 0.4 });
        found.drag({ x: 200, y: 322 }); // into the X ring
        expect(found.heldRing()).toEqual({ outer: triple()[2].outer, inner: 0, edge: 0.1 });
        found.drag({ x: 200, y: 490 }); // off the face
        expect(found.heldRing()).toBeNull();
        return false;
      },
    ];
    await make().start();
  });

  it('the overlay rings agree with the score of every face in the app', () => {
    for (const face of FACE_IDS) {
      const edges = ringEdges(face);
      expect(edges.at(-1)).toBe(1);
      edges.forEach((edge, k) => {
        const inner = k ? edges[k - 1] : 0;
        const want = k === 0 ? 'X' : 10 - (k - 1);
        expect(scoreFromPoint((inner + edge) / 2, 0, face)).toBe(want);
        // on a ring's edge: the lower ring
        if (k > 0) expect(scoreFromPoint(0, edge, face)).toBe(k === edges.length - 1 ? 'M' : want - 1);
      });
      expect(scoreFromPoint(1.01, 0, face)).toBe('M');
      // the lowest ring of the face is what the face is scored down to
      expect(10 - (edges.length - 2)).toBe(face === '122' || face === '80' || face === '60' || face === '40' ? 1 : 6);
    }
  });
});

describe('nextLook (live camera)', () => {
  const frame = { x: 0, y: 0, w: 1000, h: 1000 };

  it('looks at just the sheet next time once every spot is seen', () => {
    expect(nextLook(result(triple(), []), frame, 1)).toEqual({ x: 135, y: 35, w: 130, h: 350 });
  });

  it('keeps looking at the whole frame while only part of the sheet is seen', () => {
    expect(nextLook(result(triple().slice(0, 1), [], true), frame, 1)).toBeNull();
  });

  it('keeps looking at the whole frame when the sheet fills it already', () => {
    expect(nextLook(result([spot(500, 500, 400)], []), frame, 1)).toBeNull();
  });
});

describe('a steady reading (live camera)', () => {
  const face = '122';
  const at = (x, y = 0) => ({ x, y, spot: null });
  const reading = (arrows, extra = {}) => ({ ...result([spot(300, 300, 100)], arrows), ...extra });
  const A = () => reading([at(0.3), at(-0.5, 0.2)]);
  const B = () => reading([at(0.8)]);

  it('locks once enough frames agree for long enough', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    const first = r.read(A(), 0);
    expect(first).toMatchObject({ kind: 'reading', hollow: true, progress: 0, canTake: true, locked: false });
    expect(first.scores).toEqual([7, 5]);
    expect(r.read(A(), 250)).toMatchObject({ kind: 'holding', hollow: false, locked: false });
    expect(r.read(A(), 500).progress).toBeCloseTo(0.5, 9); // 3 of 5 frames, half a second of one
    expect(r.read(A(), 750).locked).toBe(false); // 4 frames
    const last = r.read(A(), 1000);
    expect(last).toMatchObject({ kind: 'holding', progress: 1, locked: true });
    expect(LOCK_MS).toBe(1000);
    expect(LOCK_FRAMES).toBe(5);
  });

  it('does not lock on enough frames in too short a time', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    let s;
    for (let t = 0; t < 8; t++) s = r.read(A(), t * 100);
    expect(s.locked).toBe(false);
    expect(s.progress).toBeCloseTo(0.7, 9);
  });

  it('an odd frame now and then resets nothing', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    r.read(A(), 0);
    r.read(A(), 250);
    const odd = r.read(B(), 500);
    expect(odd.kind).toBe('holding');
    expect(odd.scores).toEqual([7, 5]); // the agreed arrows are shown, not the odd reading
    r.read(A(), 750);
    r.read(A(), 1000);
    expect(r.read(A(), 1250).locked).toBe(true);
  });

  it('a frame without the target starts over, and Take is not allowed', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    for (let t = 0; t < 4; t++) r.read(A(), t * 250);
    expect(r.read({ error: 'No target face found.' }, 1000)).toEqual({
      kind: 'lost',
      show: null,
      scores: [],
      hollow: false,
      progress: 0,
      canTake: false,
      locked: false,
    });
    expect(r.take()).toBeNull();
    expect(r.read(A(), 1250)).toMatchObject({ kind: 'reading', hollow: true });
    expect(r.read(A(), 2250).locked).toBe(false); // two frames only
  });

  it('a frame with the target and no arrows starts over, but Take is allowed', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    for (let t = 0; t < 4; t++) r.read(A(), t * 250);
    const empty = reading([]);
    expect(r.read(empty, 1000)).toMatchObject({ kind: 'empty', show: empty, hollow: false, progress: 0, canTake: true, locked: false });
    expect(r.take()).toBe(empty);
    expect(r.read(A(), 1250).kind).toBe('reading');
  });

  it('a partial sheet never locks with several arrows to place, but Take still takes it', () => {
    const r = createSteadyReading({ face: '40t', maxArrows: 3 });
    let s;
    for (let t = 0; t < 10; t++) s = r.read(reading([at(0.3)], { partial: true }), t * 250);
    expect(s).toMatchObject({ kind: 'partial', hollow: true, progress: 0, canTake: true, locked: false });
    expect(r.take().arrows[0].x).toBe(0.3);
  });

  it('a partial sheet locks with one arrow to place (a close-up of one spot)', () => {
    const r = createSteadyReading({ face: '40t', maxArrows: 1 });
    let s;
    for (let t = 0; t <= 4; t++) s = r.read(reading([at(0.3)], { partial: true }), t * 250);
    expect(s.locked).toBe(true);
  });

  it('readings older than the window drop out', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    r.read(A(), 0);
    r.read(A(), 2000);
    r.read(A(), 4000);
    // the first is 5 s old by now: three frames agree, since the one at 2 s
    expect(r.read(A(), 5000).progress).toBeCloseTo(Math.min(3000 / LOCK_MS, 3 / LOCK_FRAMES), 9);
    expect(r.read(A(), 5000).progress).toBe(0.8); // four frames since 2 s
  });

  it('hands over the agreed arrows, at their average place, on the latest picture', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    r.read(reading([at(0.1)]), 0);
    r.read(reading([at(0.12)]), 100);
    const latest = { ...reading([at(0.14)]), spots: [spot(310, 300, 100)] };
    r.read(latest, 200);
    const res = r.take();
    expect(res.spots).toBe(latest.spots);
    expect(res.arrows[0].x).toBeCloseTo(0.12, 9);
    expect(res.arrows[0].image.x).toBeCloseTo(310 + 12, 9);
  });

  it('hands over the latest reading while nothing agrees yet', () => {
    const r = createSteadyReading({ face, maxArrows: 3 });
    expect(r.take()).toBeNull();
    const a = A();
    r.read(a, 0);
    expect(r.take()).toBe(a);
  });
});
