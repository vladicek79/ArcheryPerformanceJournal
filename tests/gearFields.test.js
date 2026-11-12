import { describe, it, expect } from 'vitest';
import { gearChoices, gearForChoice } from '../public/js/app/gearFields.js';

const snapshots = [
  { id: 's1', name: 'Indoor', fields: { riser: 'Hoyt', limbsLbs: '32' } },
  { id: 's2', name: 'Outdoor', fields: { riser: 'Win', arrowModel: 'X10', spine: '650' } },
];

describe('gearChoices', () => {
  it('defaults a new session to the current setup when it was edited by hand', () => {
    const r = gearChoices({ settings: { gear: { riser: 'Own' }, activeSnapshotId: null }, snapshots });
    expect(r.value).toBe('current');
    expect(r.options.map((o) => o[0])).toEqual(['current', 's1', 's2', 'none']);
  });
  it('defaults to the loaded saved setup and does not list the current setup twice', () => {
    const r = gearChoices({ settings: { gear: { riser: 'Hoyt' }, activeSnapshotId: 's1' }, snapshots });
    expect(r.value).toBe('s1');
    expect(r.options.map((o) => o[0])).toEqual(['s1', 's2', 'none']);
  });
  it('offers "as recorded" for a session whose equipment is not a saved setup', () => {
    const r = gearChoices({ settings: { gear: {}, activeSnapshotId: null }, snapshots, session: { gear: { riser: 'Old' }, gearSnapshotId: null } });
    expect(r.value).toBe('recorded');
    expect(r.options[0]).toEqual(['recorded', 'As recorded']);
  });
  it('selects the saved setup a session used, or none', () => {
    const settings = { gear: {}, activeSnapshotId: null };
    expect(gearChoices({ settings, snapshots, session: { gear: {}, gearSnapshotId: 's2' } }).value).toBe('s2');
    expect(gearChoices({ settings, snapshots, session: { gear: null, gearSnapshotId: null } }).value).toBe('none');
  });
});

describe('gearForChoice', () => {
  const ctx = { settings: { gear: { riser: 'Own' }, activeSnapshotId: null }, snapshots };
  it('copies the chosen equipment into the session', () => {
    expect(gearForChoice('s2', ctx)).toEqual({ gear: snapshots[1].fields, gearSnapshotId: 's2' });
    expect(gearForChoice('current', ctx)).toEqual({ gear: { riser: 'Own' }, gearSnapshotId: null });
    expect(gearForChoice('none', ctx)).toEqual({ gear: null, gearSnapshotId: null });
    expect(gearForChoice('recorded', ctx)).toBeNull();
  });
});
