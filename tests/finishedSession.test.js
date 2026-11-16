import { describe, it, expect, beforeEach } from 'vitest';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import { createFinishedSessions, parseMinutes, daysLeft } from '../public/js/app/finishedSession.js';

const DAY = 24 * 3600 * 1000;

let clock;
let repo;
let answers; // what the archer answers, in order
let asked; // the questions put to the archer
let refuse; // collections of guarded writes that are refused: 'save', 'trash', 'restore', 'remove'

// the app's guarded writes: null when refused (the guard has told the archer), as in main.js
const guarded = (kind, fn) => {
  if (refuse.has(kind)) return null;
  try {
    return fn();
  } catch {
    return null;
  }
};

function make() {
  return createFinishedSessions({
    repo,
    save: (name, record) => guarded('save', () => repo.save(name, record)),
    trash: (name, id) => guarded('trash', () => (repo.trash(name, id), true)),
    restore: (name, id) => guarded('restore', () => (repo.restore(name, id), true)),
    remove: (name, id) => guarded('remove', () => (repo.remove(name, id), true)),
    confirm: async (q) => {
      asked.push(q);
      return answers.shift() ?? true;
    },
    now: () => new Date(clock),
  });
}

beforeEach(() => {
  clock = Date.parse('2026-11-12T18:00:00Z');
  repo = createRepository({
    adapter: createMemoryAdapter(),
    storageKey: 'test.v1',
    appId: 'archery-performance-journal',
    schemaVersion: 1,
    collections,
    defaultSettings,
    migrations: [],
    now: () => new Date(clock),
  });
  repo.init();
  answers = [];
  asked = [];
  refuse = new Set();
});

const scored = (patch = {}) =>
  repo.save('sessions', {
    type: 'training',
    status: 'finished',
    date: '2026-11-10',
    time: '18:00',
    distance: 18,
    face: '40t',
    arrowsPerEnd: 3,
    ends: [],
    minutes: 60,
    ...patch,
  });
const strength = (patch = {}) =>
  repo.save('sessions', { type: 'strength', status: 'finished', date: '2026-11-11', minutes: 30, effort: 5, drills: [], note: '', ...patch });
const stored = (id) => repo.get('sessions', id);

describe('lists', () => {
  it('lists finished sessions newest first, without the running one or deleted ones', () => {
    const older = scored({ date: '2026-11-01' });
    const newer = strength({ date: '2026-11-11' });
    const sameDayLater = scored({ date: '2026-11-01', time: '20:00' });
    const gone = scored({ date: '2026-11-12' });
    repo.trash('sessions', gone.id);
    repo.save('sessions', { type: 'training', status: 'active', date: '2026-11-12', distance: 18, face: '40t', arrowsPerEnd: 3, ends: [], current: { arrows: [{}, {}, {}].map(() => ({ v: null, m: null, s: null })), ld: 0, cld: 0 }, cursor: 0 });
    expect(make().list().map((s) => s.id)).toEqual([newer.id, sameDayLater.id, older.id]);
  });

  it('gets a finished session by id, and nothing for a running, deleted or unknown one', () => {
    const f = make();
    const ss = scored();
    expect(f.get(ss.id).id).toBe(ss.id);
    repo.trash('sessions', ss.id);
    expect(f.get(ss.id)).toBeNull();
    expect(f.get('nope')).toBeNull();
  });

  it('lists Recently deleted, most recently deleted first, with the days left', () => {
    const a = scored();
    const b = strength();
    repo.trash('sessions', a.id);
    clock += DAY / 2;
    repo.trash('sessions', b.id);
    clock += DAY;
    const items = make().deleted();
    expect(items.map((x) => x.session.id)).toEqual([b.id, a.id]);
    expect(items.map((x) => x.daysLeft)).toEqual([6, 6]); // 5.5 and 6 days, rounded up
  });
});

describe('days left in Recently deleted', () => {
  const at = '2026-11-01T12:00:00.000Z';
  const t = Date.parse(at);
  it('counts whole days up, from the moment it was deleted', () => {
    expect(daysLeft(at, new Date(t), 7)).toBe(7);
    expect(daysLeft(at, new Date(t + 1), 7)).toBe(7);
    expect(daysLeft(at, new Date(t + DAY), 7)).toBe(6);
    expect(daysLeft(at, new Date(t + 6 * DAY + 1), 7)).toBe(1);
  });
  it('never goes below zero', () => {
    expect(daysLeft(at, new Date(t + 7 * DAY), 7)).toBe(0);
    expect(daysLeft(at, new Date(t + 30 * DAY), 7)).toBe(0);
  });
});

describe('minutes typed in', () => {
  it('reads a non-negative whole number, or nothing', () => {
    expect(parseMinutes('45')).toBe(45);
    expect(parseMinutes('0')).toBe(0);
    expect(parseMinutes('')).toBeNull();
    expect(parseMinutes('-5')).toBeNull();
    expect(parseMinutes('abc')).toBeNull();
    expect(parseMinutes('12.7')).toBe(12);
  });

  it('changes the duration, and clears it when the field is emptied', () => {
    const f = make();
    const ss = scored();
    expect(f.setMinutes(ss.id, '75')).toEqual({ status: 'saved' });
    expect(stored(ss.id).minutes).toBe(75);
    expect(f.setMinutes(ss.id, '')).toEqual({ status: 'saved' });
    expect(stored(ss.id).minutes).toBeNull();
  });
});

describe('review', () => {
  it('creates the whole review when the session has none', () => {
    const ss = scored();
    expect(make().setReview(ss.id, 'workOn', 'Back tension')).toEqual({ status: 'saved' });
    expect(stored(ss.id).review).toEqual({ good: '', workOn: 'Back tension', how: '' });
  });

  it('keeps the other parts of the review', () => {
    const ss = scored({ review: { good: 'Calm', workOn: '', how: 'Drills' } });
    make().setReview(ss.id, 'workOn', 'Release');
    expect(stored(ss.id).review).toEqual({ good: 'Calm', workOn: 'Release', how: 'Drills' });
  });
});

describe('competition details', () => {
  it('changing the placement keeps the event, round and conditions', () => {
    const ss = scored({ type: 'competition', competition: { event: 'Indoor cup', round: 'WA 18 m', conditions: 'hall', placement: '' } });
    expect(make().setCompetition(ss.id, 'placement', '3rd of 24')).toEqual({ status: 'saved' });
    expect(stored(ss.id).competition).toEqual({ event: 'Indoor cup', round: 'WA 18 m', conditions: 'hall', placement: '3rd of 24' });
  });

  it('fills in the missing details when there were none', () => {
    const ss = scored({ type: 'competition' });
    make().setCompetition(ss.id, 'event', 'Club shoot');
    expect(stored(ss.id).competition).toEqual({ event: 'Club shoot', round: '', conditions: '', placement: '' });
  });
});

describe('when', () => {
  it('changes the date and the start time', () => {
    const f = make();
    const ss = scored();
    expect(f.setWhen(ss.id, { date: '2026-11-08' })).toEqual({ status: 'saved' });
    expect(f.setWhen(ss.id, { time: '09:30' })).toEqual({ status: 'saved' });
    expect(stored(ss.id)).toMatchObject({ date: '2026-11-08', time: '09:30' });
  });

  it('removes a cleared start time', () => {
    const ss = scored();
    make().setWhen(ss.id, { time: null });
    expect(stored(ss.id).time ?? null).toBeNull();
  });
});

describe('gear', () => {
  it('copies a setup into the session, and keeps what was recorded when that is picked', () => {
    const setup = repo.save('setups', { name: 'Outdoor', fields: { riser: 'W&W' } });
    const ss = scored();
    const f = make();
    expect(f.setGear(ss.id, setup.id)).toEqual({ status: 'saved' });
    expect(stored(ss.id)).toMatchObject({ gear: { riser: 'W&W' }, gearSnapshotId: setup.id });
    expect(f.setGear(ss.id, 'recorded')).toEqual({ status: 'none' });
    expect(stored(ss.id).gearSnapshotId).toBe(setup.id);
  });

  it('a later edit of the setup leaves the session as it was', () => {
    const setup = repo.save('setups', { name: 'Indoor', fields: { brace: '8.75' } });
    const ss = scored();
    make().setGear(ss.id, setup.id);
    repo.save('setups', { ...repo.get('setups', setup.id), fields: { brace: '9' } });
    expect(stored(ss.id).gear).toEqual({ brace: '8.75' });
  });

  it('stores no equipment for "none"', () => {
    const ss = scored();
    make().setGear(ss.id, 'none');
    expect(stored(ss.id)).toMatchObject({ gear: null, gearSnapshotId: null });
  });
});

describe('form fields', () => {
  it('stores a change worked out from the stored fields', () => {
    const ss = strength({ drills: [{ kind: 'spt', sets: 1, reps: 10, holdSec: 10 }] });
    const f = make();
    expect(f.change(ss.id, (cur) => ({ drills: [...cur.drills, { kind: 'band', sets: 2, reps: 15, holdSec: null }] }))).toEqual({ status: 'saved' });
    expect(f.change(ss.id, () => ({ effort: 8 }))).toEqual({ status: 'saved' });
    expect(stored(ss.id).drills.map((d) => d.kind)).toEqual(['spt', 'band']);
    expect(stored(ss.id).effort).toBe(8);
  });
});

describe('a refused save', () => {
  it('changes nothing and reports failed', () => {
    const ss = scored({ type: 'competition', competition: { event: 'Cup', round: '', conditions: '', placement: '' } });
    const before = stored(ss.id);
    const f = make();
    refuse.add('save');
    expect(f.setReview(ss.id, 'good', 'x')).toEqual({ status: 'failed' });
    expect(f.setCompetition(ss.id, 'placement', '1st')).toEqual({ status: 'failed' });
    expect(f.setWhen(ss.id, { date: '2026-11-01' })).toEqual({ status: 'failed' });
    expect(f.setMinutes(ss.id, '10')).toEqual({ status: 'failed' });
    expect(f.change(ss.id, () => ({ minutes: 5 }))).toEqual({ status: 'failed' });
    expect(stored(ss.id)).toEqual(before);
  });

  it('reports failed for a change the journal does not accept', () => {
    const ss = strength();
    expect(make().change(ss.id, () => ({ effort: 99 }))).toEqual({ status: 'failed' });
    expect(stored(ss.id).effort).toBe(5);
  });
});

describe('a session deleted elsewhere while its page is open', () => {
  it('every command reports none without throwing', async () => {
    const ss = scored();
    const f = make();
    repo.remove('sessions', ss.id); // e.g. on another device, arrived by sync
    expect(f.setReview(ss.id, 'good', 'x')).toEqual({ status: 'none' });
    expect(f.setCompetition(ss.id, 'event', 'x')).toEqual({ status: 'none' });
    expect(f.setWhen(ss.id, { date: '2026-11-01' })).toEqual({ status: 'none' });
    expect(f.setMinutes(ss.id, '10')).toEqual({ status: 'none' });
    expect(f.setGear(ss.id, 'none')).toEqual({ status: 'none' });
    expect(f.change(ss.id, () => ({ minutes: 5 }))).toEqual({ status: 'none' });
    expect(await f.moveToDeleted(ss.id)).toEqual({ status: 'none' });
    expect(await f.purge(ss.id)).toEqual({ status: 'none' });
    expect(f.restore(ss.id)).toEqual({ status: 'none' });
    expect(asked).toEqual([]);
    expect(repo.list('sessions')).toEqual([]);
  });
});

describe('Recently deleted', () => {
  it('asks, then moves the session to Recently deleted', async () => {
    const ss = scored();
    const f = make();
    expect(await f.moveToDeleted(ss.id)).toEqual({ status: 'deleted' });
    expect(asked).toEqual([{ kind: 'delete', session: expect.objectContaining({ id: ss.id }) }]);
    expect(f.get(ss.id)).toBeNull();
    expect(f.deleted().map((x) => x.session.id)).toEqual([ss.id]);
  });

  it('changes nothing when the archer says no', async () => {
    const ss = scored();
    const f = make();
    answers = [false];
    expect(await f.moveToDeleted(ss.id)).toEqual({ status: 'cancelled' });
    expect(f.get(ss.id)).not.toBeNull();
    expect(f.deleted()).toEqual([]);
  });

  it('reports failed when moving it is refused', async () => {
    const ss = scored();
    refuse.add('trash');
    expect(await make().moveToDeleted(ss.id)).toEqual({ status: 'failed' });
    expect(stored(ss.id)).not.toBeNull();
  });

  it('restores a deleted session to History', async () => {
    const ss = scored();
    const f = make();
    await f.moveToDeleted(ss.id);
    expect(f.restore(ss.id)).toEqual({ status: 'restored' });
    expect(f.list().map((s) => s.id)).toEqual([ss.id]);
    expect(f.deleted()).toEqual([]);
    refuse.add('restore');
    await f.moveToDeleted(ss.id);
    expect(f.restore(ss.id)).toEqual({ status: 'failed' });
  });

  it('deletes for good after a yes, and keeps it after a no', async () => {
    const ss = scored();
    const f = make();
    await f.moveToDeleted(ss.id);
    answers = [false];
    expect(await f.purge(ss.id)).toEqual({ status: 'cancelled' });
    expect(f.deleted()).toHaveLength(1);
    expect(await f.purge(ss.id)).toEqual({ status: 'purged' });
    expect(asked.at(-1)).toEqual({ kind: 'purge', session: expect.objectContaining({ id: ss.id }) });
    expect(f.deleted()).toEqual([]);
    expect(stored(ss.id)).toBeNull();
  });

  it('a refused purge reports failed and keeps the session in Recently deleted', async () => {
    const ss = scored();
    const f = make();
    await f.moveToDeleted(ss.id);
    refuse.add('remove');
    expect(await f.purge(ss.id)).toEqual({ status: 'failed' });
    expect(f.deleted().map((x) => x.session.id)).toEqual([ss.id]);
  });
});
