import { describe, it, expect, beforeEach } from 'vitest';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import * as L from '../public/js/app/sessionLogic.js';
import { createRunningSession, findRunning } from '../public/js/app/runningSession.js';

let clock;
let repo;
let answers; // what the archer answers, in order
let asked; // the questions put to the archer
let synced;
let changes;
let refuseSave;

const SETUP = { date: '2026-11-09', type: 'training', distance: 18, face: '40s', arrowsPerEnd: 3, gear: null, gearSnapshotId: null };

function make() {
  return createRunningSession({
    repo,
    save: (name, record) => (refuseSave ? null : repo.save(name, record)),
    remove: (name, id) => (repo.remove(name, id), true),
    saveSettings: (patch) => repo.saveSettings(patch),
    confirm: async (q) => {
      asked.push(q);
      return answers.shift() ?? true;
    },
    requestSync: () => synced++,
    onChange: () => changes++,
    now: () => new Date(clock),
  });
}

beforeEach(() => {
  clock = Date.parse('2026-11-09T10:00:00Z');
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
  synced = 0;
  changes = 0;
  refuseSave = false;
});

const sessions = () => repo.list('sessions');

describe('starting', () => {
  it('starts a running session and remembers the setup', async () => {
    const running = make();
    const res = await running.start(SETUP);
    expect(res.status).toBe('started');
    expect(running.get().id).toBe(res.session.id);
    expect(findRunning(repo).timer.running).toBe(true);
    expect(repo.getSettings().lastSetup).toEqual({ distance: 18, face: '40s', arrowsPerEnd: 3 });
    expect(asked).toEqual([]);
  });

  it('finishes the session in progress when it has arrows, and syncs it', async () => {
    const running = make();
    const first = (await running.start(SETUP)).session;
    running.apply((s) => L.enterScore(s, 10));
    const res = await running.start({ ...SETUP, distance: 30 });
    expect(asked).toEqual([{ kind: 'replace', willFinish: true }]);
    expect(res.status).toBe('started');
    expect(repo.get('sessions', first.id).status).toBe('finished');
    expect(synced).toBe(1);
    expect(running.get().distance).toBe(30);
    expect(sessions().filter((s) => s.status === 'active')).toHaveLength(1);
  });

  it('discards the session in progress when it has no arrows', async () => {
    const running = make();
    const first = (await running.start(SETUP)).session;
    await running.start(SETUP);
    expect(asked).toEqual([{ kind: 'replace', willFinish: false }]);
    expect(repo.get('sessions', first.id)).toBeFalsy();
    expect(sessions()).toHaveLength(1);
    expect(synced).toBe(0);
  });

  it('keeps the session in progress when the archer says no', async () => {
    const running = make();
    const first = (await running.start(SETUP)).session;
    answers = [false];
    expect((await running.start(SETUP)).status).toBe('cancelled');
    expect(running.get().id).toBe(first.id);
    expect(sessions()).toHaveLength(1);
  });

  it('reports a refused save', async () => {
    refuseSave = true;
    expect((await make().start(SETUP)).status).toBe('failed');
    expect(sessions()).toHaveLength(0);
  });
});

describe('applying a transition', () => {
  it('saves the changed session', async () => {
    const running = make();
    await running.start(SETUP);
    expect(running.apply((s) => L.enterScore(s, 9))).toBe(true);
    expect(running.get().current.arrows[0].v).toBe(9);
  });

  it('saves nothing when the transition changes nothing or no session runs', async () => {
    const running = make();
    expect(running.apply((s) => L.enterScore(s, 9))).toBe(false);
    await running.start(SETUP);
    expect(running.apply((s) => s)).toBe(false);
  });
});

describe('finishing', () => {
  const shoot = async () => {
    const running = make();
    await running.start(SETUP);
    running.apply((s) => L.enterScore(s, 10));
    running.apply(L.nextEnd);
    running.apply((s) => L.enterScore(s, 9));
    return running;
  };

  it('does nothing without arrows', async () => {
    const running = make();
    await running.start(SETUP);
    expect((await running.finish()).status).toBe('none');
    expect(asked).toEqual([]);
  });

  it('asks with the number of ends that are kept, then finishes and syncs', async () => {
    const running = await shoot();
    clock += 30 * 60000;
    const res = await running.finish();
    expect(asked[0].kind).toBe('finish');
    expect(asked[0].ends).toBe(2);
    expect(res.status).toBe('finished');
    expect(res.session.status).toBe('finished');
    expect(res.session.ends).toHaveLength(2);
    expect(res.session.minutes).toBe(30);
    expect(running.get()).toBeNull();
    expect(synced).toBe(1);
  });

  it('stops the timer while the question is open: the time of the answer does not count', async () => {
    const running = await shoot();
    clock += 10 * 60000;
    const res = await createRunningSession({
      repo,
      save: (n, r) => repo.save(n, r),
      remove: () => true,
      confirm: async () => {
        expect(running.get().timer.running).toBe(false);
        clock += 60 * 60000; // the dialog stays open for an hour
        return true;
      },
      now: () => new Date(clock),
    }).finish();
    expect(res.session.minutes).toBe(10);
  });

  it('lets the timer run on after a no', async () => {
    const running = await shoot();
    answers = [false];
    expect((await running.finish()).status).toBe('cancelled');
    expect(running.get().status).toBe('active');
    expect(running.get().timer.running).toBe(true);
    expect(changes).toBe(2); // paused, then resumed
    expect(synced).toBe(0);
  });

  it('leaves a paused timer paused after a no', async () => {
    const running = await shoot();
    running.apply((s) => L.pauseTimer(s, new Date(clock)));
    answers = [false];
    await running.finish();
    expect(running.get().timer.running).toBe(false);
    expect(changes).toBe(0);
  });
});

describe('discarding', () => {
  it('removes the session after a yes', async () => {
    const running = make();
    await running.start(SETUP);
    expect((await running.discard()).status).toBe('discarded');
    expect(asked[0].kind).toBe('discard');
    expect(sessions()).toHaveLength(0);
  });

  it('keeps it after a no', async () => {
    const running = make();
    await running.start(SETUP);
    answers = [false];
    expect((await running.discard()).status).toBe('cancelled');
    expect(running.get()).not.toBeNull();
  });
});

describe('scanned arrows', () => {
  it('tells a scan it may fill the whole shown end, whatever is in it', async () => {
    const running = make();
    expect(running.scanRoom()).toBeNull();
    await running.start({ ...SETUP, face: '40t' });
    running.apply((s) => L.enterScore(s, 10, 0.1, 0.1, 0));
    expect(running.scanRoom()).toEqual({ face: '40t', empty: 3, spotHint: 0 });
  });

  it('replace what the end held, in order, also while an arrow is selected', async () => {
    const running = make();
    await running.start(SETUP);
    running.apply((s) => L.enterScore(s, 8));
    running.apply((s) => L.selectArrow(s, 0));
    running.applyScan([
      { v: 10, x: 0.05, y: 0.02 },
      { v: 6, x: 2, y: 0 }, // off the face: the score is kept, the position is not
    ]);
    const arrows = running.get().current.arrows;
    expect(arrows.map((a) => a.v)).toEqual([10, 6, null]); // the 8 entered by hand is gone
    expect([arrows[0].x, arrows[0].y]).toEqual([0.05, 0.02]);
    expect([arrows[1].x, arrows[1].y]).toEqual([null, null]);
  });
});
