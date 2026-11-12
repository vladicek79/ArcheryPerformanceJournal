import { describe, it, expect } from 'vitest';
import { collections } from '../public/js/app/collections.js';
import { migrate, migrations } from '../public/js/storage/migrations.js';
import * as L from '../public/js/app/sessionLogic.js';
import { isScored, formSummary, emptyDrill, newestFirst } from '../public/js/app/sessionTypes.js';

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

describe('blank bale', () => {
  const blank = (extra = {}) => ({ type: 'blank', date: '2026-11-11', status: 'finished', arrows: 60, minutes: 40, note: '', ...extra });
  it('is a form session that counts arrows without a score', () => {
    expect(isScored('blank')).toBe(false);
    expect(validate(blank())).toEqual([]);
    expect(validate(blank({ arrows: null }))).toEqual([]);
    expect(validate(blank({ arrows: -3 })).join()).toMatch(/arrow count/);
    expect(formSummary(blank())).toBe('60 arrows · 40 min');
  });
});

describe('manual session', () => {
  const manual = (extra = {}) => ({ type: 'manual', date: '2026-11-08', status: 'finished', arrows: 90, minutes: null, note: '', ...extra });
  it('needs the arrows or the duration', () => {
    expect(isScored('manual')).toBe(false);
    expect(validate(manual())).toEqual([]);
    expect(validate(manual({ arrows: null, minutes: 45 }))).toEqual([]);
    expect(validate(manual({ arrows: null })).join()).toMatch(/arrows or the duration/);
    expect(validate(manual({ arrows: -1 })).join()).toMatch(/arrow count/);
    expect(formSummary(manual({ minutes: 45 }))).toBe('90 arrows · 45 min');
  });
  it('is refused by apps that only know schema 4', () => {
    expect(migrate({ schemaVersion: 4 }, 5, migrations).schemaVersion).toBe(5);
    expect(() => migrate({ schemaVersion: 5 }, 4, migrations)).toThrow(/newer/);
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

describe('session order', () => {
  it('sorts newest first by date and start time, older sessions by when they were created', () => {
    const a = { id: 'a', date: '2026-11-10', time: '18:00', createdAt: '2026-11-12T09:00:00Z' };
    const b = { id: 'b', date: '2026-11-10', time: '07:30', createdAt: '2026-11-12T10:00:00Z' };
    const c = { id: 'c', date: '2026-11-11', createdAt: '2026-11-11T08:00:00Z' };
    expect([b, a, c].sort(newestFirst).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});
