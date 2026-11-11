import { describe, it, expect } from 'vitest';
import { collections } from '../public/js/app/collections.js';
import { migrate, migrations } from '../public/js/storage/migrations.js';
import * as L from '../public/js/app/sessionLogic.js';
import { isScored, formSummary, emptyDrill } from '../public/js/app/sessionTypes.js';

const validate = (r) => collections.sessions.validate({ id: 'a', ...r });
const strength = (extra = {}) => ({
  type: 'strength',
  date: '2026-11-11',
  status: 'finished',
  minutes: 30,
  effort: 7,
  drills: [emptyDrill('spt'), emptyDrill('draw')],
  note: '',
  ...extra,
});
const mental = (extra = {}) => ({
  type: 'mental',
  date: '2026-11-11',
  status: 'finished',
  minutes: 20,
  focus: 2,
  techniques: ['Visualisation'],
  ...extra,
});

describe('session types', () => {
  it('training and competition are scored, strength and mental are forms', () => {
    expect(['training', 'competition'].map(isScored)).toEqual([true, true]);
    expect(['strength', 'mental'].map(isScored)).toEqual([false, false]);
  });

  it('a competition session keeps its event details', () => {
    const s = L.createSession({
      type: 'competition',
      date: '2026-11-11',
      distance: 18,
      face: '40t',
      arrowsPerEnd: 3,
      competition: { event: 'Indoor Cup', round: 'WA 18', conditions: '', placement: '' },
    });
    expect(s.competition.event).toBe('Indoor Cup');
    expect(validate(s)).toEqual([]);
  });

  it('accepts valid strength and mental sessions', () => {
    expect(validate(strength())).toEqual([]);
    expect(validate(mental())).toEqual([]);
    expect(validate(strength({ minutes: null, effort: null, drills: [] }))).toEqual([]);
  });

  it('rejects bad strength and mental fields', () => {
    expect(validate(strength({ effort: 11 })).join()).toMatch(/effort/);
    expect(validate(strength({ drills: [{ kind: 'pushups', sets: 1, reps: 1 }] })).join()).toMatch(
      /unknown drill/,
    );
    expect(validate(strength({ status: 'active' })).join()).toMatch(/finished/);
    expect(validate(mental({ focus: 0 })).join()).toMatch(/focus/);
    expect(validate(mental({ techniques: ['Juggling'] })).join()).toMatch(/techniques/);
    expect(validate({ ...mental(), type: 'yoga' }).join()).toMatch(/session type/);
  });

  it('summarises a form session in one line', () => {
    expect(formSummary(strength())).toBe('30 min · effort 7/10 · 2 drills');
    expect(formSummary(mental())).toBe('20 min · focus 2/5 · Visualisation');
  });
});

describe('schema v3 migration', () => {
  it('marks existing sessions as training and leaves deletion markers alone', () => {
    const v2 = {
      schemaVersion: 2,
      collections: {
        sessions: [
          { id: 'a', date: '2026-11-09' },
          { id: 'b', deleted: true },
        ],
        competitions: [],
      },
    };
    const v3 = migrate(v2, 3, migrations);
    expect(v3.schemaVersion).toBe(3);
    expect(v3.collections.sessions[0].type).toBe('training');
    expect(v3.collections.sessions[1].type).toBeUndefined();
  });
});
