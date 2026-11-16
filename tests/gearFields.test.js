import { describe, it, expect } from 'vitest';
import {
  gearChoices,
  gearForChoice,
  activeSetup,
  orderedSetups,
  sightMarks,
  findSightMark,
  missingDistances,
  sightErrors,
  hasGear,
  parseFieldValue,
  displayValue,
  storedNumber,
  parseWindage,
  formatWindage,
  withFieldChange,
  fieldHistory,
  historyErrors,
  HISTORY_MAX,
  keyValues,
  setupSummary,
  fieldSuggestions,
  uniqueName,
  sessionsUsing,
  copyFields,
  stepValue,
  stepLabel,
} from '../public/js/app/gearFields.js';

const setups = [
  { id: 's1', name: 'Indoor', createdAt: '2026-09-01', updatedAt: '2026-10-01', fields: { riser: 'Hoyt', limbsLbs: '32' } },
  { id: 's2', name: 'Outdoor', createdAt: '2026-09-02', updatedAt: '2026-11-01', fields: { riser: 'Win', arrowModel: 'X10', spine: '650' } },
  { id: 's3', deleted: true, updatedAt: '2026-11-10' },
];

describe('active setup', () => {
  it('is the one settings name, else the most recently changed live one', () => {
    expect(activeSetup({ activeSetupId: 's1' }, setups).id).toBe('s1');
    expect(activeSetup({ activeSetupId: 's3' }, setups).id).toBe('s2'); // deleted on another device
    expect(activeSetup({ activeSetupId: null }, setups).id).toBe('s2');
    expect(activeSetup({ activeSetupId: 'x' }, [])).toBeNull();
  });

  it('lists the active setup first, then the others newest first, without deleted ones', () => {
    expect(orderedSetups({ activeSetupId: 's1' }, setups).map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('gearChoices', () => {
  it('defaults a new session to the active setup, and lists every setup and none', () => {
    const r = gearChoices({ settings: { activeSetupId: 's1' }, setups });
    expect(r.value).toBe('s1');
    expect(r.activeId).toBe('s1');
    expect(r.options).toEqual([
      ['s1', 'Indoor'],
      ['s2', 'Outdoor'],
      ['none', 'No equipment'],
    ]);
  });

  it('picks none when there are no setups', () => {
    expect(gearChoices({ settings: {}, setups: [] })).toEqual({ options: [['none', 'No equipment']], value: 'none', activeId: null });
  });

  it('offers "as recorded" for a session whose setup is gone', () => {
    const r = gearChoices({ settings: { activeSetupId: 's1' }, setups, session: { gear: { riser: 'Old' }, gearSnapshotId: 's3' } });
    expect(r.options[0]).toEqual(['recorded', 'As recorded']);
    expect(r.value).toBe('recorded');
  });

  it('keeps the setup of an edited session, or none', () => {
    const settings = { activeSetupId: 's1' };
    expect(gearChoices({ settings, setups, session: { gear: {}, gearSnapshotId: 's2' } }).value).toBe('s2');
    expect(gearChoices({ settings, setups, session: { gear: null, gearSnapshotId: null } }).value).toBe('none');
  });
});

describe('gearForChoice', () => {
  it('copies the fields of a setup with its id', () => {
    const r = gearForChoice('s2', { setups });
    expect(r).toEqual({ gear: setups[1].fields, gearSnapshotId: 's2' });
    expect(r.gear).not.toBe(setups[1].fields);
    expect(gearForChoice('none', { setups })).toEqual({ gear: null, gearSnapshotId: null });
    expect(gearForChoice('recorded', { setups })).toBeNull();
    expect(gearForChoice('s3', { setups })).toBeNull();
  });
});

describe('numeric fields', () => {
  it('reads typed values leniently, converting cm to inches', () => {
    expect(parseFieldValue('brace', '8.75')).toBe(8.75);
    expect(parseFieldValue('brace', '8,75 in')).toBe(8.75);
    expect(parseFieldValue('brace', '8 3/4')).toBe(8.75);
    expect(parseFieldValue('brace', '22.225 cm')).toBeCloseTo(8.75, 5);
    expect(parseFieldValue('brace', '22.225', 'cm')).toBeCloseTo(8.75, 5);
    expect(parseFieldValue('drawWeight', '38 lbs')).toBe(38);
    expect(parseFieldValue('drawWeight', 'about 38')).toBeNull();
    expect(parseFieldValue('riser', '1')).toBeNull(); // a text field
  });

  it('steps in the field step, snapping onto it, in either unit, starting empty fields at a typical value', () => {
    expect(stepValue('brace', 8.75, 1)).toBe(8.875);
    expect(stepValue('brace', 8.6, 1)).toBe(8.625); // snaps instead of 8.725
    expect(stepValue('brace', 8.6, -1)).toBe(8.5);
    expect(stepValue('brace', 8.75, 1, 'cm')).toBeCloseTo(22.3 / 2.54, 6); // 22.2 cm + 1 mm
    expect(stepValue('drawWeight', 38, -1)).toBe(37.5);
    expect(stepValue('points', 110, 1)).toBe(115);
    expect(stepValue('brace', null, 1)).toBe(8.5);
    expect(stepValue('brace', 12, 1)).toBe(12);
    expect([stepLabel('brace'), stepLabel('brace', 'cm'), stepLabel('arrowLength'), stepLabel('drawWeight'), stepLabel('strands')]).toEqual([
      '1/8 in',
      '0.1 cm',
      '1/4 in',
      '0.5 lb',
      '1',
    ]);
  });

  it('stores clamped canonical numbers and shows them in either unit', () => {
    expect(storedNumber('brace', 8.625)).toBe('8.625');
    expect(storedNumber('brace', 99)).toBe('12');
    expect(displayValue('brace', '8.75')).toEqual({ value: '8.75', unit: 'in' });
    expect(displayValue('brace', '8.75', 'cm')).toEqual({ value: '22.2', unit: 'cm' });
    expect(displayValue('brace', 'about 9')).toEqual({ value: 'about 9', unit: '' }); // left as typed
    expect(displayValue('riser', 'Hoyt')).toEqual({ value: 'Hoyt', unit: '' });
  });
});

describe('tuning history', () => {
  const base = { id: 's1', name: 'Indoor', fields: { brace: '8.75' } };

  it('records a change with its reason, and nothing for an unchanged value', () => {
    const next = withFieldChange(base, 'brace', '8.625', { reason: 'new string', at: '2026-11-16T10:00:00Z' });
    expect(next.fields.brace).toBe('8.625');
    expect(next.history).toEqual([{ key: 'brace', from: '8.75', to: '8.625', at: '2026-11-16T10:00:00Z', reason: 'new string' }]);
    expect(withFieldChange(base, 'brace', ' 8.75 ')).toBe(base);
    expect(base.fields.brace).toBe('8.75');
  });

  it('removes a cleared field and keeps at most HISTORY_MAX changes', () => {
    let s = base;
    for (let i = 0; i < HISTORY_MAX + 5; i += 1) s = withFieldChange(s, 'points', String(100 + i), { at: `t${i}` });
    expect(s.history).toHaveLength(HISTORY_MAX);
    expect(s.history[0].at).toBe('t5');
    expect(withFieldChange(s, 'brace', '').fields).not.toHaveProperty('brace');
    expect(fieldHistory(s, 'points')[0].at).toBe(`t${HISTORY_MAX + 4}`);
    expect(historyErrors(s.history)).toEqual([]);
    expect(historyErrors([{ key: 'x' }])).toHaveLength(1);
    expect(historyErrors(undefined)).toEqual([]);
  });
});

describe('sight marks of a setup', () => {
  const gear = {
    riser: 'Hoyt',
    sights: [
      { id: 'b', distance: '70m', elevation: '5.2', windage: '', note: '' },
      { id: 'a', distance: '18 m', elevation: '', windage: '', note: '' },
    ],
  };

  it('sorts the marks by distance and lists the default distances still missing', () => {
    expect(sightMarks(gear).map((m) => m.id)).toEqual(['a', 'b']);
    expect(sightMarks({})).toEqual([]);
    expect(missingDistances(gear)).toEqual(['30', '50', '60', '90']);
  });

  it('finds the mark set for a distance', () => {
    expect(findSightMark(gear, 70)?.id).toBe('b');
    expect(findSightMark(gear, 18)).toBeNull(); // a distance without a mark
    expect(findSightMark(null, 70)).toBeNull();
  });

  it('reads and writes windage in the stored text format', () => {
    expect(parseWindage('1R')).toBe(1);
    expect(parseWindage('2l')).toBe(-2);
    expect(parseWindage('0')).toBe(0);
    expect(parseWindage('')).toBe(0);
    expect(parseWindage('a bit')).toBeNull();
    expect([1, -2, 0].map(formatWindage)).toEqual(['1R', '2L', '0']);
  });

  it('counts a setup with only sight marks as equipment', () => {
    expect(hasGear({ sights: [gear.sights[0]] })).toBe(true);
    expect(hasGear({ sights: [gear.sights[1]] })).toBe(false);
  });

  it('gives the marks of a copied setup new ids', () => {
    const c = copyFields(gear);
    expect(c.sights.map((m) => m.distance)).toEqual(['70m', '18 m']);
    expect(c.sights[0].id).not.toBe('b');
  });

  it('validates the stored list', () => {
    expect(sightErrors(undefined)).toEqual([]);
    expect(sightErrors(gear.sights)).toEqual([]);
    expect(sightErrors('x')).toHaveLength(1);
  });
});

describe('setup summaries', () => {
  const s = {
    id: 'x',
    name: 'Indoor',
    fields: {
      drawWeight: '38',
      brace: '8.75',
      arrowModel: 'X10',
      spine: '650',
      sights: [{ id: 'm', distance: '18 m', elevation: '5.2', windage: '1R', note: '' }],
    },
  };

  it('shows the four key values and a one-line summary', () => {
    expect(keyValues(s, 18).map((k) => [k.label, k.value, k.unit])).toEqual([
      ['Draw weight', '38', 'lb'],
      ['Brace height', '8.75', 'in'],
      ['Arrows', 'X10 · 650', ''],
      ['Sight 18 m', '5.2 · 1R', ''],
    ]);
    expect(setupSummary(s)).toBe('38 lb · brace 8.75 in · 18 m 5.2 · 1R');
    expect(setupSummary({ fields: { riser: 'Borrowed' } })).toBe('Borrowed · 1 of 25 details');
    const two = { fields: { ...s.fields, sights: [...s.fields.sights, { id: 'n', distance: '70 m', elevation: '5.8', windage: '0', note: '' }] } };
    expect(setupSummary(two)).toBe('38 lb · brace 8.75 in · 70 m 5.8 · 0'); // the longest distance
    expect(setupSummary(two, 18)).toBe('38 lb · brace 8.75 in · 18 m 5.2 · 1R'); // the session's distance
  });

  it('suggests values from other setups, names new ones uniquely and counts sessions', () => {
    expect(fieldSuggestions('riser', setups, 's1')).toEqual(['Win']);
    expect(uniqueName('Indoor', setups)).toBe('Indoor 2');
    expect(uniqueName('Indoor', setups, 's1')).toBe('Indoor');
    expect(sessionsUsing('s1', [{ gearSnapshotId: 's1' }, { gearSnapshotId: 's1', trashedAt: 'x' }, { gearSnapshotId: 's2' }])).toBe(1);
  });
});
