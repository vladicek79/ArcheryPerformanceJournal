import { describe, it, expect } from 'vitest';
import * as L from '../public/js/app/sessionLogic.js';
import { suggestedSpot } from '../public/js/app/scoring.js';

const arrows = (...spots) =>
  spots.map((spot) => (spot === null ? L.emptyArrow() : { ...L.emptyArrow(), v: 9, x: 0.1, y: 0.1, spot }));

describe('suggestedSpot – the hint for the selected arrow on a triple or Vegas sheet', () => {
  it('slot n suggests spot n', () => {
    expect(suggestedSpot('40t', arrows(null, null, null), 0)).toBe(0);
    expect(suggestedSpot('40t', arrows(0, null, null), 1)).toBe(1);
    expect(suggestedSpot('40v', arrows(0, 1, null), 2)).toBe(2);
  });

  it('spot n already used in this end → the first spot not yet used', () => {
    // arrow 1 was shot at spot 2 (index 1); arrow 2 is suggested spot 1 (index 0)
    expect(suggestedSpot('40t', arrows(1, null, null), 1)).toBe(0);
  });

  it('a slot past the spots (6 arrows on 3 spots) takes the first unused one, else wraps', () => {
    expect(suggestedSpot('40t', arrows(0, 1, null, null, null, null), 3)).toBe(2);
    expect(suggestedSpot('40t', arrows(0, 1, 2, null, null, null), 4)).toBe(1);
  });

  it('the selected arrow itself does not count as using its spot', () => {
    expect(suggestedSpot('40t', arrows(0, 1, null), 1)).toBe(1);
  });

  it('a single face has no spot to suggest', () => {
    expect(suggestedSpot('40s', arrows(null, null, null), 0)).toBeNull();
    expect(suggestedSpot('122', arrows(null, null, null), 0)).toBeNull();
  });
});
