import { describe, it, expect } from 'vitest';
import {
  faceParts,
  faceId,
  FACE_SIZES,
  kindsForSize,
  faceForSize,
} from '../public/js/app/views/setupFaces.js';
import { SETUP_FACES } from '../public/js/app/scoring.js';

describe('setup faces as size and kind', () => {
  it('splits a face id into its size and kind and back', () => {
    expect(faceParts('40t')).toEqual({ size: 40, kind: 'triple' });
    expect(faceParts('60s')).toEqual({ size: 60, kind: 'six' });
    expect(faceParts('122')).toEqual({ size: 122, kind: 'full' });
    expect(faceParts('x')).toBeNull();
    for (const f of SETUP_FACES) {
      const { size, kind } = faceParts(f);
      expect(faceId(size, kind)).toBe(f);
    }
  });

  it('offers each size with only the kinds the app has', () => {
    expect(FACE_SIZES).toEqual([40, 60, 80, 122]);
    expect(kindsForSize(40)).toEqual(['full', 'six', 'triple', 'vegas']);
    expect(kindsForSize(60)).toEqual(['full', 'six']);
    expect(kindsForSize(122)).toEqual(['full']);
  });

  it('keeps the kind when the new size has it, else the full face', () => {
    expect(faceForSize(80, '40s')).toBe('80s');
    expect(faceForSize(60, '40t')).toBe('60');
    expect(faceForSize(122, '80s')).toBe('122');
  });
});
