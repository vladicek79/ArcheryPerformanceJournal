import { describe, it, expect } from 'vitest';
import { computeStats, fmt } from '../public/js/app/stats.js';

const a = (v, m = null, s = null) => ({ v, m, s, x: null, y: null });

describe('computeStats', () => {
  const ends = [
    { arrows: [a('X', 1, 1), a(10, 1, 2), a(9, 2, 1)], ld: 2, cld: 1, note: '' },
    { arrows: [a(8, 3, 2), a('M', 5, 4), a(7)], ld: 1, cld: 1, note: '' },
  ];
  const st = computeStats(ends);

  it('totals', () => {
    expect(st.arrows).toBe(6);
    expect(st.total).toBe(10 + 10 + 9 + 8 + 0 + 7);
    expect(st.max).toBe(60);
    expect(st.avgArrow).toBeCloseTo(44 / 6);
  });
  it('averages ignore ungraded arrows', () => {
    expect(st.avgM).toBeCloseTo((1 + 1 + 2 + 3 + 5) / 5);
    expect(st.avgS).toBeCloseTo((1 + 2 + 1 + 2 + 4) / 5);
  });
  it('program % counts M ≤ 2 over graded arrows', () => {
    expect(st.programPct).toBe(60);
  });
  it('tens and Xs', () => {
    expect(st.tens).toBe(2);
    expect(st.xs).toBe(1);
  });
  it('let-downs', () => {
    expect(st.ld).toBe(3);
    expect(st.cld).toBe(2);
  });
  it('avg arrow by mental grade', () => {
    expect(st.byM[1]).toEqual({ n: 2, avgArrow: 10 });
    expect(st.byM[2]).toEqual({ n: 1, avgArrow: 9 });
    expect(st.byM[4]).toEqual({ n: 0, avgArrow: null });
    expect(st.byM[5]).toEqual({ n: 1, avgArrow: 0 });
  });
  it('empty input', () => {
    const e = computeStats([]);
    expect(e.avgArrow).toBeNull();
    expect(e.avgM).toBeNull();
    expect(e.programPct).toBeNull();
    expect(fmt(e.avgM)).toBe('–');
  });
});
