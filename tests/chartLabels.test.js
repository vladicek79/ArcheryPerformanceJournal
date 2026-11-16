import { describe, it, expect } from 'vitest';
import { axisLabelIndexes } from '../public/js/app/views/charts.js';

// points spread evenly over a chart's inner width, like lineChart's xAt
const spread = (n, left, width) => (i) => left + (n < 2 ? width / 2 : (i / (n - 1)) * width);

describe('axis date labels', () => {
  it('labels every n-th point and the last one when there is room', () => {
    const labels = ['1 Oct', '4 Oct', '7 Oct', '10 Oct', '13 Oct', '16 Oct', '19 Oct'];
    expect([...axisLabelIndexes(labels, spread(7, 34, 700), 2)]).toEqual([0, 2, 4, 6]);
  });

  it('drops the label before the last one when the two would overlap, keeping the latest date', () => {
    // 18 sessions on a phone-width chart: every 4th point, then the last one only one step later
    const labels = Array.from({ length: 18 }, (_, i) => `${i + 1} Nov`);
    const kept = [...axisLabelIndexes(labels, spread(18, 34, 310), 4)];
    expect(kept).toContain(17);
    expect(kept).not.toContain(16);
    expect(kept).toEqual([0, 4, 8, 12, 17]);
  });

  it('never keeps two labels whose text would touch', () => {
    const labels = Array.from({ length: 40 }, () => '25 Sept');
    const xAt = spread(40, 34, 300);
    const kept = [...axisLabelIndexes(labels, xAt, 1)];
    const w = '25 Sept'.length * 6.6;
    // the first label starts at its point, the last ends at it, the others are centred on it
    const extent = (i) =>
      i === 0 ? [xAt(i), xAt(i) + w] : i === 39 ? [xAt(i) - w, xAt(i)] : [xAt(i) - w / 2, xAt(i) + w / 2];
    for (let k = 1; k < kept.length; k++) {
      expect(extent(kept[k])[0] - extent(kept[k - 1])[1]).toBeGreaterThanOrEqual(6);
    }
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(39);
  });

  it('labels a single point', () => {
    expect([...axisLabelIndexes(['9 Nov'], spread(1, 34, 300), 1)]).toEqual([0]);
  });
});
