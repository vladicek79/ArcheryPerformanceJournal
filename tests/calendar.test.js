import { describe, it, expect } from 'vitest';
import { parseIso, addDays, addMonths, monthGrid, weekdayMon, inRange, clampIso } from '../public/js/core/calendar.js';

describe('calendar date math', () => {
  it('parses only real ISO dates', () => {
    expect(parseIso('2026-11-15')?.getDate()).toBe(15);
    expect(parseIso('2026-02-30')).toBeNull();
    expect(parseIso('15.11.2026')).toBeNull();
    expect(parseIso('')).toBeNull();
  });

  it('adds days across months, years and DST changes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
  });

  it('adds months, clamping to the last day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('counts weekdays from Monday', () => {
    expect(weekdayMon('2026-11-16')).toBe(0); // Monday
    expect(weekdayMon('2026-11-15')).toBe(6); // Sunday
  });

  it('lays a month out in 6 Monday-first weeks', () => {
    const g = monthGrid('2026-11-15');
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toBe('2026-10-26'); // Monday before Sunday 1 Nov
    expect(g[0][6]).toBe('2026-11-01');
    expect(g.flat()).toContain('2026-11-30');
    expect(g[5][6]).toBe('2026-12-06');
  });

  it('checks and clamps to a range', () => {
    expect(inRange('2026-11-15', null, '2026-11-15')).toBe(true);
    expect(inRange('2026-11-16', null, '2026-11-15')).toBe(false);
    expect(inRange('2026-01-01', '2026-02-01', null)).toBe(false);
    expect(clampIso('2026-12-01', null, '2026-11-15')).toBe('2026-11-15');
    expect(clampIso('2026-01-01', '2026-02-01', null)).toBe('2026-02-01');
  });
});
