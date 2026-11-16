import { describe, it, expect } from 'vitest';
import { detectArrows, colourClass, expectedColour, matchArrows, consensus } from '../public/js/app/photoDetect.js';
import { spotCentres, isSpotFace, scoreFromPoint } from '../public/js/app/scoring.js';

const RGB = {
  gold: [250, 222, 30],
  red: [214, 45, 45],
  blue: [0, 160, 230],
  black: [25, 25, 25],
  white: [245, 245, 240],
  paper: [200, 196, 188],
  cloth: [150, 146, 140],
  nock: [60, 220, 90], // a green nock
  shaft: [40, 40, 44], // a dark carbon shaft
};

/** Ring colour of a face at distance d from the centre (radius 1). */
function ringColour(d, face) {
  if (isSpotFace(face)) return d < 0.4 ? 'gold' : d < 0.8 ? 'red' : d < 1 ? 'blue' : 'paper';
  return d < 0.2 ? 'gold' : d < 0.4 ? 'red' : d < 0.6 ? 'blue' : d < 0.8 ? 'black' : d < 1 ? 'white' : 'paper';
}

/**
 * A synthetic photo: the sheet seen through an affine "camera" (scale, and a squash along an axis at
 * angle `rot` for the tilt),
 * with round nocks at the given arrows ({ x, y, spot } relative to the spot centre, spot radius 1).
 */
function photo(face, arrows, { width = 360, height = 480, scale = 70, squash = 0.85, rot = 0.25, nockR = 0.06, shafts = [], centreOnly = false } = {}) {
  const centres = spotCentres(face).map(([x, y]) => [x / 100, y / 100]);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // image → sheet: undo the camera. A tilted camera squashes the sheet along some axis (at
      // angle `rot`) without turning it, so the photo stays upright.
      const vx = (px - width / 2) / scale;
      const vy = (py - height / 2) / scale;
      const u1 = (cos * vx + sin * vy) / squash;
      const u2 = -sin * vx + cos * vy;
      const sx = cos * u1 - sin * u2;
      const sy = sin * u1 + cos * u2;
      let colour = 'paper';
      let best = Infinity;
      centres.forEach(([cx, cy], k) => {
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < best) {
          best = d;
          colour = ringColour(d, face);
          // a full face printed only out to the blue: a square of white paper, a grey cloth behind it
          if (centreOnly && d >= 0.6) colour = Math.max(Math.abs(sx - cx), Math.abs(sy - cy)) < 0.72 ? 'white' : 'cloth';
        }
        for (const a of arrows) {
          if ((a.spot ?? 0) === k && Math.hypot(sx - cx - a.x, sy - cy - a.y) < nockR) colour = 'nock';
        }
        // a shaft seen from the side: a thin dark line from its entry point (x, y) out along (dx, dy)
        for (const sh of shafts) {
          if ((sh.spot ?? 0) !== k) continue;
          const px0 = sx - cx - sh.x;
          const py0 = sy - cy - sh.y;
          const len = Math.hypot(sh.dx, sh.dy);
          const along = (px0 * sh.dx + py0 * sh.dy) / len;
          const across = Math.abs(px0 * sh.dy - py0 * sh.dx) / len;
          if (along >= 0 && along <= len && across < 0.022) colour = 'shaft';
        }
      });
      const [r, g, b] = RGB[colour];
      const i = (py * width + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('photo arrow detection', () => {
  it('classifies the face colours', () => {
    expect(colourClass(...RGB.gold)).toBe('gold');
    expect(colourClass(...RGB.red)).toBe('red');
    expect(colourClass(...RGB.blue)).toBe('blue');
    expect(colourClass(...RGB.black)).toBe('black');
    expect(colourClass(...RGB.white)).toBe('white');
    expect(colourClass(...RGB.nock)).toBe('other');
    expect(expectedColour(0.3, '122')).toBe('red');
    expect(expectedColour(0.4, '122')).toBeNull(); // on a ring line: no expectation
  });

  it('finds arrows on a tilted single face, close to where they are', () => {
    const arrows = [
      { x: 0.03, y: -0.02 },
      { x: 0.32, y: 0.1 },
      { x: -0.25, y: 0.5 },
    ];
    const res = detectArrows(photo('122', arrows), '122', 3);
    expect(res.error).toBeUndefined();
    expect(res.arrows).toHaveLength(3);
    for (const a of arrows) {
      const found = res.arrows.find((f) => Math.hypot(f.x - a.x, f.y - a.y) < 0.06);
      expect(found, `arrow at ${a.x},${a.y}`).toBeTruthy();
      expect(found.spot).toBeNull();
      expect(scoreFromPoint(found.x, found.y, '122')).toBe(scoreFromPoint(a.x, a.y, '122'));
    }
  });

  it('finds the three spots of a triple sheet and puts each arrow on its own spot', () => {
    const arrows = [
      { spot: 0, x: 0.05, y: 0.1 },
      { spot: 1, x: -0.5, y: 0.2 },
      { spot: 2, x: 0.3, y: -0.6 },
    ];
    const res = detectArrows(photo('40t', arrows, { scale: 40, width: 300, height: 560, rot: 0.1 }), '40t', 3);
    expect(res.error).toBeUndefined();
    expect(res.spots).toHaveLength(3);
    expect(res.arrows.map((a) => a.spot)).toEqual([0, 1, 2]); // listed top to bottom
    for (const a of arrows) {
      const found = res.arrows.find((f) => f.spot === a.spot);
      expect(found, `arrow on spot ${a.spot}`).toBeTruthy();
      expect(Math.hypot(found.x - a.x, found.y - a.y)).toBeLessThan(0.08);
    }
  });

  it('takes one arrow per spot when three arrows are asked for on a three-spot sheet', () => {
    // three things on the top spot, nothing on the others: only the best one counts
    const arrows = [
      { spot: 0, x: 0.05, y: 0.1 },
      { spot: 0, x: -0.5, y: 0.2 },
      { spot: 0, x: 0.3, y: -0.6 },
      { spot: 2, x: 0.2, y: 0.2 },
    ];
    const img = photo('40t', arrows, { scale: 40, width: 300, height: 560, rot: 0.1 });
    const res = detectArrows(img, '40t', 3);
    expect(res.arrows.map((a) => a.spot).sort()).toEqual([0, 2]);
    // six arrows on the sheet: two per spot
    expect(detectArrows(img, '40t', 6).arrows.filter((a) => a.spot === 0)).toHaveLength(2);
    // a close-up of one spot: that spot's one arrow
    const close = photo('40s', [{ x: 0.2, y: -0.1 }, { x: -0.4, y: 0.3 }], { scale: 150 });
    expect(detectArrows(close, '40t', 3, { spotHint: 1 }).arrows).toHaveLength(1);
  });

  it('returns at most as many arrows as asked for, and none on a clean face', () => {
    const img = photo('122', [
      { x: 0.1, y: 0.1 },
      { x: -0.3, y: 0.2 },
    ]);
    expect(detectArrows(img, '122', 1).arrows).toHaveLength(1);
    expect(detectArrows(photo('122', []), '122', 3).arrows).toHaveLength(0);
  });

  it('reports when there is no target face in the photo', () => {
    const blank = { width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4).fill(200) };
    expect(detectArrows(blank, '122', 3).error).toMatch(/target face/);
  });

  it('places a shaft seen from the side at its inner end, not its middle', () => {
    // two shafts entering the gold and the red, leaning out past the edge of the face
    const shafts = [
      { x: 0.05, y: 0.02, dx: 1.3, dy: -0.9 },
      { x: -0.3, y: 0.1, dx: -0.9, dy: 1.2 },
    ];
    const res = detectArrows(photo('122', [], { shafts, squash: 0.9 }), '122', 3);
    expect(res.arrows).toHaveLength(2);
    for (const sh of shafts) {
      const found = res.arrows.find((f) => Math.hypot(f.x - sh.x, f.y - sh.y) < 0.09);
      expect(found, `shaft entering at ${sh.x},${sh.y}`).toBeTruthy();
    }
  });

  it('follows a shaft that crosses the middle of the spot to its point on the far side', () => {
    for (const face of ['40s', '122']) {
      for (const sh of [
        { x: 0.3, y: 0.2, dx: -1.5, dy: -1.05 },
        { x: 0.6, y: 0.05, dx: -1.7, dy: -0.3 },
        { x: -0.2, y: 0.25, dx: 0.9, dy: -1.2 },
      ]) {
        const res = detectArrows(photo(face, [], { shafts: [sh], squash: 0.95, scale: 110 }), face, 3);
        expect(res.arrows, `${face} ${sh.x},${sh.y}`).toHaveLength(1);
        expect(Math.hypot(res.arrows[0].x - sh.x, res.arrows[0].y - sh.y), `${face} ${sh.x},${sh.y}`).toBeLessThan(0.09);
      }
    }
  });

  it('ends a shaft at its point even with old holes lying further along the same line', () => {
    const shaft = { x: 0.1, y: 0, dx: 1.4, dy: 0 }; // enters at (0.1, 0), leans out to the right
    // holes on the same line, a tenth of the radius and more beyond the entry point
    const holes = [
      { x: -0.06, y: 0 },
      { x: -0.16, y: 0 },
      { x: -0.3, y: 0 },
    ];
    const img = photo('122', [], { shafts: [shaft, ...holes.map((h) => ({ ...h, dx: 0.035, dy: 0 }))], squash: 1 });
    const res = detectArrows(img, '122', 1);
    expect(res.arrows).toHaveLength(1);
    expect(Math.hypot(res.arrows[0].x - shaft.x, res.arrows[0].y - shaft.y)).toBeLessThan(0.08);
  });

  it('does not run on over old holes lying close past the point', () => {
    for (const face of ['40s', '122']) {
      const shaft = { x: 0.15, y: 0.1, dx: -1.3, dy: -0.9 }; // crosses the gold, enters at (0.15, 0.1)
      // two holes in line with it, 0.07 and 0.15 of the radius past the point
      const holes = [0.07, 0.15].map((k) => ({ x: shaft.x + 0.822 * k, y: shaft.y + 0.569 * k, dx: 0.03, dy: 0.02 }));
      const res = detectArrows(photo(face, [], { shafts: [shaft, ...holes], squash: 0.95, scale: 110 }), face, 1);
      expect(res.arrows, face).toHaveLength(1);
      expect(Math.hypot(res.arrows[0].x - shaft.x, res.arrows[0].y - shaft.y), face).toBeLessThan(0.06);
    }
  });

  it('finds an arrow in the outer ring whose shaft lies mostly over the paper between the spots', () => {
    const shafts = [{ spot: 1, x: 0.44, y: -0.83, dx: -1.7, dy: -0.45 }];
    const res = detectArrows(photo('40t', [], { shafts, scale: 70, width: 360, height: 800, rot: 0.1, squash: 0.95 }), '40t', 3);
    expect(res.arrows).toHaveLength(1);
    expect(res.arrows[0].spot).toBe(1);
    expect(Math.hypot(res.arrows[0].x - 0.44, res.arrows[0].y + 0.83)).toBeLessThan(0.08);
    expect(scoreFromPoint(res.arrows[0].x, res.arrows[0].y, '40t')).toBe(6);
  });

  it('finds arrows on a 60 cm face printed only out to the blue, shafts running off the picture', () => {
    // the face fills the picture; where its black and white rings would be is paper and cloth
    const shafts = [
      { x: 0.02, y: -0.3, dx: 0.02, dy: -1.4 }, // from the top, into the red
      { x: -0.2, y: -0.12, dx: -1.3, dy: -0.25 }, // from the left, on the edge of the gold
      { x: 0.0, y: 0.52, dx: -0.6, dy: 1.2 }, // from below, into the blue
    ];
    const img = photo('60', [], { shafts, centreOnly: true, scale: 330, width: 480, height: 800, squash: 0.97, rot: 0.1 });
    const res = detectArrows(img, '60', 3);
    expect(res.error).toBeUndefined();
    expect(res.arrows).toHaveLength(3);
    for (const sh of shafts) {
      const found = res.arrows.find((f) => Math.hypot(f.x - sh.x, f.y - sh.y) < 0.05);
      expect(found, `shaft entering at ${sh.x},${sh.y}`).toBeTruthy();
    }
  });

  it('finds arrows on a reduced 60 cm face (10-6) that fills the picture', () => {
    const shafts = [
      { x: 0.03, y: -0.5, dx: 0.02, dy: -1.6 }, // from the top, into the red
      { x: -0.33, y: -0.2, dx: -1.5, dy: -0.3 }, // from the left, on the edge of the gold
      { x: 0.0, y: 0.87, dx: -0.6, dy: 1.2 }, // from below, into the blue
    ];
    const img = photo('60s', [], { shafts, scale: 200, width: 480, height: 800, squash: 0.97, rot: 0.1 });
    const res = detectArrows(img, '60s', 3);
    expect(res.error).toBeUndefined();
    expect(res.arrows).toHaveLength(3);
    for (const sh of shafts) {
      const found = res.arrows.find((f) => Math.hypot(f.x - sh.x, f.y - sh.y) < 0.07);
      expect(found, `shaft entering at ${sh.x},${sh.y}`).toBeTruthy();
      expect(scoreFromPoint(found.x, found.y, '60s')).toBe(scoreFromPoint(sh.x, sh.y, '60s'));
    }
  });

  it('uses a photo of one spot for a three-spot sheet, on the hinted spot', () => {
    const img = photo('40s', [{ x: 0.2, y: -0.1 }], { scale: 150 });
    const res = detectArrows(img, '40t', 3, { spotHint: 2 });
    expect(res.error).toBeUndefined();
    expect(res.partial).toBe(true);
    expect(res.arrows).toHaveLength(1);
    expect(res.arrows[0].spot).toBe(2);
    expect(Math.hypot(res.arrows[0].x - 0.2, res.arrows[0].y + 0.1)).toBeLessThan(0.06);
  });

  it('matches the arrows of two live frames only when they are the same arrows in place', () => {
    const a = [
      { x: 0.1, y: 0.1, spot: 0 },
      { x: -0.3, y: 0.2, spot: 1 },
    ];
    // same arrows, slightly moved and listed in another order
    expect(matchArrows(a, [{ x: -0.28, y: 0.22, spot: 1 }, { x: 0.12, y: 0.08, spot: 0 }])).toEqual([1, 0]);
    // one moved too far, one on another spot, a different count, nothing at all
    expect(matchArrows(a, [{ x: 0.4, y: 0.1, spot: 0 }, { x: -0.3, y: 0.2, spot: 1 }])).toBeNull();
    expect(matchArrows(a, [{ x: 0.1, y: 0.1, spot: 2 }, { x: -0.3, y: 0.2, spot: 1 }])).toBeNull();
    expect(matchArrows(a, [a[0]])).toBeNull();
    expect(matchArrows([], [])).toBeNull();
  });

  it('finds the reading most live frames agree on, ignoring the odd frame', () => {
    const good = (dx) => [
      { x: 0.1 + dx, y: 0.1, spot: 0 },
      { x: -0.3, y: 0.2 + dx, spot: 1 },
    ];
    const odd = [
      { x: 0.6, y: 0.1, spot: 0 },
      { x: -0.3, y: 0.2, spot: 1 },
    ];
    const res = consensus([good(0), odd, good(0.02), good(-0.02), [{ x: 0, y: 0, spot: 0 }], good(0.04)]);
    expect(res.count).toBe(4);
    expect(res.oldest).toBe(0);
    expect(res.arrows[0].x).toBeCloseTo(0.11, 5);
    expect(res.arrows[1].y).toBeCloseTo(0.21, 5);
    expect(consensus([])).toBeNull();
  });
});
