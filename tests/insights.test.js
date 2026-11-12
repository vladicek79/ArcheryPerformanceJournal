import { describe, it, expect } from 'vitest';
import {
  filterSessions,
  sessionRow,
  sortRows,
  reviewRows,
  weekStart,
  weeklyLoad,
  distancesOf,
} from '../public/js/app/insights.js';

const end = (vals) => ({
  arrows: vals.map((v) => ({ v, m: 1, s: 2, x: null, y: null })),
  ld: 0,
  cld: 0,
  note: '',
});
const scored = (id, date, extra = {}) => ({
  id,
  date,
  type: 'training',
  status: 'finished',
  distance: 18,
  face: '40t',
  arrowsPerEnd: 3,
  ends: [end([10, 9, 8])],
  ...extra,
});
const form = (id, date, type, extra = {}) => ({
  id,
  date,
  type,
  status: 'finished',
  minutes: 30,
  ...(type === 'strength' ? { drills: [], effort: 5 } : { techniques: [], focus: 2 }),
  ...extra,
});

const now = new Date('2026-11-11T12:00:00Z');
const all = [
  scored('a', '2026-11-10'),
  scored('b', '2026-08-01', {
    distance: 70,
    face: '122',
    type: 'competition',
    competition: { event: 'Cup', round: '', conditions: '', placement: '' },
  }),
  form('c', '2026-11-09', 'strength'),
  form('d', '2026-11-03', 'mental', { review: { good: 'calm', workOn: 'Front ARM', how: '' } }),
  { ...scored('e', '2026-11-11'), status: 'active' },
];

describe('filters', () => {
  it('keeps finished sessions in the range, oldest first', () => {
    expect(filterSessions(all, { range: '30d' }, now).map((s) => s.id)).toEqual(['d', 'c', 'a']);
    expect(filterSessions(all, { range: 'all' }, now).map((s) => s.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('filters by type and distance', () => {
    expect(filterSessions(all, { type: 'competition' }, now).map((s) => s.id)).toEqual(['b']);
    expect(filterSessions(all, { distance: '18' }, now).map((s) => s.id)).toEqual(['a']);
    expect(distancesOf(all)).toEqual([18, 70]);
  });
});

describe('rows', () => {
  it('computes the numbers of a scored session and leaves the rest empty', () => {
    expect(sessionRow(all[0])).toMatchObject({
      arrows: 3,
      total: 27,
      max: 30,
      avgArrow: 9,
      avgM: 1,
      avgS: 2,
      programPct: 100,
      minutes: null,
    });
    expect(sessionRow(all[2])).toMatchObject({ type: 'strength', arrows: null, total: null, minutes: 30 });
  });
  it('sorts with empty values last in both directions', () => {
    const rows = all.slice(0, 4).map(sessionRow);
    expect(
      sortRows(rows, 'total', 'desc')
        .map((r) => r.id)
        .slice(0, 2),
    ).toEqual(['a', 'b']);
    expect(
      sortRows(rows, 'minutes', 'asc')
        .map((r) => r.id)
        .slice(-2),
    ).toEqual(['a', 'b']);
  });
  it('finds reviews by text, case-insensitively', () => {
    expect(reviewRows(all, 'front arm').map((s) => s.id)).toEqual(['d']);
    expect(reviewRows(all, 'nothing')).toEqual([]);
  });
});

describe('weekly load', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
  });
  it('counts sessions per type, arrows and minutes, with empty weeks in between', () => {
    const weeks = weeklyLoad(filterSessions(all, { range: '30d' }, now));
    expect(weeks.map((w) => w.week)).toEqual(['2026-11-02', '2026-11-09']);
    expect(weeks[0]).toMatchObject({ mental: 1, mentalMin: 30, arrows: 0 });
    expect(weeks[1]).toMatchObject({ training: 1, strength: 1, arrows: 3, strengthMin: 30 });
    expect(weeklyLoad([scored('x', '2026-10-01'), scored('y', '2026-10-20')])).toHaveLength(4);
    const blank = { id: 'z', date: '2026-11-10', type: 'blank', status: 'finished', arrows: 48, minutes: 30, note: '' };
    expect(weeklyLoad([blank, all[0]])[0]).toMatchObject({ blank: 1, training: 1, arrows: 51 });
    expect(sessionRow(blank)).toMatchObject({ arrows: 48, total: null, minutes: 30 });
    const manual = { id: 'm', date: '2026-11-10', type: 'manual', status: 'finished', arrows: 60, minutes: 50, note: '' };
    expect(weeklyLoad([manual, all[0]])[0]).toMatchObject({ manual: 1, arrows: 63, mentalMin: 0, strengthMin: 0 });
    expect(sessionRow(manual)).toMatchObject({ type: 'manual', arrows: 60, minutes: 50 });
  });
});
