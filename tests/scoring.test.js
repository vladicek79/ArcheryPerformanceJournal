import { describe, it, expect } from 'vitest';
import { scoreFromPoint, arrowValue, keypadValues, zoneOf, DISTANCE_DEFAULTS } from '../public/js/app/scoring.js';

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
    expect(DISTANCE_DEFAULTS[18]).toEqual({ face: '40s', arrowsPerEnd: 3 });
    expect(DISTANCE_DEFAULTS[70]).toEqual({ face: '122', arrowsPerEnd: 6 });
  });
});
