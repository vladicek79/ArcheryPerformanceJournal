import { describe, it, expect } from 'vitest';
import { scoreFromPoint, arrowValue, keypadValues, zoneOf, DISTANCE_DEFAULTS, locateOnSheet, sheetPoint } from '../public/js/app/scoring.js';

describe('scoreFromPoint – full face', () => {
  const f = '122';
  it.each([
    [0, 0, 'X'],
    [0.05, 0, 'X'],
    [0.0501, 0, 10],
    [0.0999, 0, 10],
    [0.1, 0, 9], // on the line → lower ring
    [0.15, 0, 9],
    [0.2, 0, 8],
    [0.3, 0, 7],
    [0.55, 0, 5],
    [0.7, 0, 3],
    [0.9, 0, 1],
    [0.999, 0, 1],
    [1, 0, 'M'],
    [0.8, 0.8, 'M'],
  ])('(%f, %f) → %s', (x, y, expected) => {
    expect(scoreFromPoint(x, y, f)).toBe(expected);
  });

  it('uses radial distance in any direction', () => {
    expect(scoreFromPoint(0, -0.35, f)).toBe(7);
    expect(scoreFromPoint(0.3, 0.4, f)).toBe(5); // d = 0.5 → line → lower
  });
});

describe('scoreFromPoint – 40 cm 10–6 face', () => {
  const f = '40s';
  it.each([
    [0, 0, 'X'],
    [0.1, 0, 'X'],
    [0.1001, 0, 10],
    [0.19, 0, 10],
    [0.2, 0, 9],
    [0.4, 0, 8],
    [0.6, 0, 7],
    [0.8, 0, 6],
    [0.99, 0, 6],
    [1, 0, 'M'],
  ])('(%f, %f) → %s', (x, y, expected) => {
    expect(scoreFromPoint(x, y, f)).toBe(expected);
  });
});

describe('helpers', () => {
  it('arrowValue maps X to 10, M and empty to 0', () => {
    expect(arrowValue('X')).toBe(10);
    expect(arrowValue('M')).toBe(0);
    expect(arrowValue(null)).toBe(0);
    expect(arrowValue(7)).toBe(7);
  });
  it('keypad shows only 6–10 on the spot face', () => {
    expect(keypadValues('40s')).toEqual(['X', 10, 9, 8, 7, 6, 'M']);
    expect(keypadValues('122')).toHaveLength(12);
  });
  it('zones follow WA colours', () => {
    expect([zoneOf('X'), zoneOf(8), zoneOf(5), zoneOf(3), zoneOf(1), zoneOf('M'), zoneOf(null)]).toEqual([
      'gold', 'red', 'blue', 'black', 'white', 'miss', 'empty',
    ]);
  });
  it('distance defaults', () => {
    expect(DISTANCE_DEFAULTS[18]).toEqual({ face: '40t' });
    expect(DISTANCE_DEFAULTS[70]).toEqual({ face: '122' });
  });
});

describe('three-spot sheets', () => {
  it('finds the nearest spot and the position relative to its centre', () => {
    const top = locateOnSheet(0.05, -2.2, '40t');
    expect(top.spot).toBe(0);
    expect(top.x).toBeCloseTo(0.05);
    expect(top.y).toBeCloseTo(0);
    expect(locateOnSheet(0, 0.3, '40t').spot).toBe(1);
    expect(locateOnSheet(0, 2.5, '40t').spot).toBe(2);
    expect(locateOnSheet(-1.1, 0.63, '40v')).toMatchObject({ spot: 1 });
    expect(locateOnSheet(1.2, 0.6, '40v').spot).toBe(2);
  });

  it('keeps single faces without a spot', () => {
    expect(locateOnSheet(0.2, 0.1, '122')).toEqual({ spot: null, x: 0.2, y: 0.1 });
  });

  it('scores each spot like a 40 cm 10–6 face', () => {
    const hit = locateOnSheet(0, -2.2 + 0.5, '40t');
    expect(scoreFromPoint(hit.x, hit.y, '40t')).toBe(8);
    expect(keypadValues('40v')).toEqual(['X', 10, 9, 8, 7, 6, 'M']);
  });

  it('places a logged arrow back on its spot', () => {
    expect(sheetPoint({ x: 0.1, y: 0, spot: 2 }, '40v')).toEqual({ x: 120, y: 63 });
    expect(sheetPoint({ x: 0.1, y: 0.2 }, '122')).toEqual({ x: 10, y: 20 });
  });
});
