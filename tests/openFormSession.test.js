import { describe, it, expect, beforeEach } from 'vitest';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import * as L from '../public/js/app/sessionLogic.js';
import { createOpenFormSessions, isFormTimerLive, openFormTimer, FORM_TIMER_STALE_MS } from '../public/js/app/openFormSession.js';

const MIN = 60000;
const START = Date.parse('2026-11-12T18:00:00Z');

let clock;
let repo;
let answers; // what the archer answers, in order
let asked; // the questions put to the archer
let changes;
let refuseSave;
let guardedWrites; // settings patches written through the guarded saveSettings

function make(overrides = {}) {
  return createOpenFormSessions({
    repo,
    save: (name, record) => {
      if (refuseSave) return null;
      try {
        return repo.save(name, record);
      } catch {
        return null; // rejected by validation, as the app's guarded save reports it
      }
    },
    saveSettings: (patch) => {
      guardedWrites.push(patch);
      return repo.saveSettings(patch);
    },
    confirm: async (q) => {
      asked.push(q);
      return answers.shift() ?? true;
    },
    onChange: () => changes++,
    now: () => new Date(clock),
    ...overrides,
  });
}

beforeEach(() => {
  clock = START;
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
  changes = 0;
  refuseSave = false;
  guardedWrites = [];
});

const timer = (type) => repo.getSettings().formTimers?.[type];
const keptDraft = (type) => repo.getSettings().formDrafts?.[type];
const sessions = () => repo.list('sessions');
const iso = (ms) => new Date(ms).toISOString();
const WHEN = { date: '2026-11-12', time: '19:00' };
const BLANK = { arrows: 30, minutes: null, note: '' };

describe('form timer (blank bale, strength, mental)', () => {
  const now = new Date('2026-11-12T18:00:00Z');
  it('keeps a timer touched within the last hours', () => {
    const t = { running: true, startedAt: '2026-11-12T17:00:00Z', elapsedMs: 0 };
    expect(openFormTimer(t, now)).toBe(t);
    const paused = { running: false, startedAt: null, elapsedMs: 600000, touchedAt: '2026-11-12T16:30:00Z' };
    expect(openFormTimer(paused, now)).toBe(paused);
  });
  it('starts again when a form was left unsaved for hours, or there is no timer', () => {
    const left = { running: true, startedAt: '2026-11-12T00:00:00Z', elapsedMs: 0 };
    expect(openFormTimer(left, now)).toEqual({ running: true, startedAt: now.toISOString(), elapsedMs: 0, touchedAt: now.toISOString() });
    const oldPaused = { running: false, startedAt: null, elapsedMs: 600000, touchedAt: '2026-11-11T10:00:00Z' };
    expect(L.timerElapsed(openFormTimer(oldPaused, now), now)).toBe(0);
    expect(L.timerElapsed(openFormTimer(null, now), now)).toBe(0);
  });
  it('is live up to the limit after its last touch, and never without a timer', () => {
    const t = { running: true, startedAt: now.toISOString(), elapsedMs: 0, touchedAt: now.toISOString() };
    expect(isFormTimerLive(t, new Date(now.getTime() + FORM_TIMER_STALE_MS))).toBe(true);
    expect(isFormTimerLive(t, new Date(now.getTime() + FORM_TIMER_STALE_MS + 1))).toBe(false);
    expect(isFormTimerLive(null, now)).toBe(false);
    expect(isFormTimerLive({ running: false, startedAt: null, elapsedMs: 0 }, now)).toBe(false);
  });
});

describe('opening', () => {
  it('starts the timer of a timed form and keeps it on the device', () => {
    const res = make().open('blank');
    expect(res).toEqual({
      timed: true,
      timer: { running: true, startedAt: iso(START), elapsedMs: 0, touchedAt: iso(START) },
      draft: null,
    });
    expect(timer('blank')).toEqual(res.timer);
  });

  it('keeps a live timer as it is, without writing the settings again', () => {
    const forms = make();
    const first = forms.open('strength').timer;
    let writes = 0;
    repo.subscribe(() => writes++);
    clock += 30 * MIN;
    expect(forms.open('strength').timer).toEqual(first);
    expect(writes).toBe(0);
  });

  it('starts the timer again when the form was left untouched for too long', () => {
    const forms = make();
    forms.open('mental');
    clock += FORM_TIMER_STALE_MS + MIN;
    expect(forms.open('mental').timer).toEqual({ running: true, startedAt: iso(clock), elapsedMs: 0, touchedAt: iso(clock) });
    expect(timer('mental').startedAt).toBe(iso(clock));
  });

  it('leaves the other open form sessions alone', () => {
    const forms = make();
    const blank = forms.open('blank').timer;
    clock += MIN;
    forms.open('strength');
    expect(timer('blank')).toEqual(blank);
  });

  it('gives a manual or a scored session no timer and no kept draft', () => {
    const forms = make();
    repo.saveSettings({ formDrafts: { manual: BLANK } });
    expect(forms.open('manual')).toEqual({ timed: false, timer: null, draft: null });
    expect(forms.open('training')).toEqual({ timed: false, timer: null, draft: null });
    expect(repo.getSettings().formTimers || {}).toEqual({});
  });

  it('takes the kept draft back while its timer is live', () => {
    const forms = make();
    forms.open('blank');
    forms.keepDraft('blank', BLANK);
    clock += 60 * MIN;
    expect(forms.open('blank').draft).toEqual(BLANK);
  });

  it('does not take a kept draft back once its timer is stale', () => {
    const forms = make();
    forms.open('blank');
    forms.keepDraft('blank', BLANK);
    clock += FORM_TIMER_STALE_MS + MIN;
    expect(forms.open('blank').draft).toBeNull();
  });

  it("prefers the page's own draft to the kept one", () => {
    const forms = make();
    forms.open('blank');
    forms.keepDraft('blank', BLANK);
    const page = { arrows: 6, minutes: null, note: '' };
    expect(forms.open('blank', page).draft).toBe(page);
    expect(forms.open('manual', page).draft).toBe(page);
  });
});

describe('keeping the draft', () => {
  it('stores the draft of a timed form on the device, beside the other drafts', () => {
    const forms = make();
    forms.keepDraft('blank', BLANK);
    forms.keepDraft('strength', { minutes: null, effort: 3, drills: [], note: '' });
    expect(keptDraft('blank')).toEqual(BLANK);
    expect(keptDraft('strength').effort).toBe(3);
  });

  it('does not keep the draft of a manual session', () => {
    make().keepDraft('manual', BLANK);
    expect(keptDraft('manual')).toBeUndefined();
  });
});

describe('the timer button', () => {
  it('pauses and resumes the timer, stamping each touch', () => {
    const forms = make();
    forms.open('blank');
    clock += 10 * MIN;
    forms.toggleTimer('blank');
    expect(timer('blank')).toEqual({ running: false, startedAt: null, elapsedMs: 10 * MIN, touchedAt: iso(clock) });
    clock += 5 * MIN;
    forms.toggleTimer('blank');
    expect(timer('blank')).toEqual({ running: true, startedAt: iso(clock), elapsedMs: 10 * MIN, touchedAt: iso(clock) });
    expect(guardedWrites).toHaveLength(2); // through the guarded write: a failure is told to the archer
  });

  it('keeps a paused form session open: a touch counts from the pause', () => {
    const forms = make();
    forms.open('blank');
    clock += FORM_TIMER_STALE_MS - MIN;
    forms.toggleTimer('blank');
    clock += FORM_TIMER_STALE_MS - MIN;
    expect(forms.open('blank').timer.elapsedMs).toBe(FORM_TIMER_STALE_MS - MIN);
  });
});

describe('saving', () => {
  const opened = (type = 'blank', draft = BLANK) => {
    const forms = make();
    forms.open(type);
    forms.keepDraft(type, draft);
    return forms;
  };

  it('asks, then saves a finished session with the minutes from the timer and closes the form session', async () => {
    const forms = opened();
    clock += 25 * MIN;
    const res = await forms.save('blank', { fields: BLANK, ...WHEN, gear: { gear: null, gearSnapshotId: null } });
    expect(asked).toEqual([{ kind: 'save', type: 'blank', fields: BLANK, minutes: 25 }]);
    expect(res.status).toBe('saved');
    expect(res.session).toMatchObject({ type: 'blank', status: 'finished', arrows: 30, minutes: 25, note: '', ...WHEN, gear: null, gearSnapshotId: null });
    expect(sessions().map((s) => s.id)).toEqual([res.session.id]);
    expect(timer('blank')).toBeNull();
    expect(keptDraft('blank')).toBeNull();
    expect(forms.list()).toEqual([]);
  });

  it('stops the timer while the question is open: the time of the answer does not count', async () => {
    opened();
    clock += 10 * MIN;
    const forms = make({
      confirm: async (q) => {
        expect(timer('blank').running).toBe(false);
        expect(q.minutes).toBe(10);
        clock += 60 * MIN; // the dialog stays open for an hour
        return true;
      },
    });
    const res = await forms.save('blank', { fields: BLANK, ...WHEN });
    expect(res.session.minutes).toBe(10);
    expect(changes).toBe(1); // paused
  });

  it('lets the timer run on after a no, and keeps timer and draft', async () => {
    const forms = opened();
    clock += 10 * MIN;
    answers = [false];
    expect((await forms.save('blank', { fields: BLANK, ...WHEN })).status).toBe('cancelled');
    expect(timer('blank')).toMatchObject({ running: true, elapsedMs: 10 * MIN });
    expect(keptDraft('blank')).toEqual(BLANK);
    expect(sessions()).toHaveLength(0);
    expect(changes).toBe(2); // paused, then resumed
  });

  it('leaves a paused timer paused after a no', async () => {
    const forms = opened();
    forms.toggleTimer('blank');
    const before = timer('blank');
    answers = [false];
    await forms.save('blank', { fields: BLANK, ...WHEN });
    expect(timer('blank')).toEqual(before);
    expect(changes).toBe(0);
  });

  it('does not resume after a no when the timer runs again already', async () => {
    opened();
    let forms;
    forms = make({
      confirm: async () => {
        forms.toggleTimer('blank'); // resumed while the question was open
        return false;
      },
    });
    const writesBefore = guardedWrites.length;
    await forms.save('blank', { fields: BLANK, ...WHEN });
    expect(timer('blank').running).toBe(true);
    expect(guardedWrites.length - writesBefore).toBe(2); // the pause and that resume, no third toggle
  });

  it('lets minutes typed by hand win over the timer', async () => {
    const forms = opened('strength');
    clock += 25 * MIN;
    const fields = { minutes: 40, effort: 3, drills: [], note: '' };
    const res = await forms.save('strength', { fields, ...WHEN, gear: { gear: null, gearSnapshotId: null } });
    expect(asked[0].minutes).toBe(40);
    expect(res.session.minutes).toBe(40);
  });

  it('takes no minutes from the timer for a session logged afterwards, and leaves the timer alone while asking', async () => {
    const forms = opened();
    clock += 25 * MIN;
    const before = timer('blank');
    answers = [false, true];
    await forms.save('blank', { fields: BLANK, date: '2026-11-10', time: '09:00', past: true });
    expect(asked[0].minutes).toBeNull();
    expect(timer('blank')).toEqual(before);
    expect(changes).toBe(0);
    const res = await forms.save('blank', { fields: BLANK, date: '2026-11-10', time: '09:00', past: true });
    expect(res.session.minutes).toBeNull();
    expect(res.session.date).toBe('2026-11-10');
    expect(timer('blank')).toBeNull(); // saved: the form session is closed all the same
    expect(keptDraft('blank')).toBeNull();
  });

  it('saves a manual session without a timer, touching no kept timer or draft', async () => {
    const forms = opened(); // a blank bale session stays open meanwhile
    const settingsBefore = repo.getSettings();
    const res = await forms.save('manual', { fields: { arrows: 60, minutes: null, note: 'club' }, ...WHEN });
    expect(asked[0].minutes).toBeNull();
    expect(res.session).toMatchObject({ type: 'manual', status: 'finished', arrows: 60, minutes: null, note: 'club' });
    expect(repo.getSettings()).toEqual(settingsBefore);
    expect(changes).toBe(0);
  });

  it('keeps typed minutes of a manual session', async () => {
    const res = await make().save('manual', { fields: { arrows: null, minutes: 45, note: '' }, ...WHEN });
    expect(res.session.minutes).toBe(45);
  });

  it('clears nothing when the save is refused', async () => {
    const forms = opened();
    clock += 10 * MIN;
    refuseSave = true;
    expect((await forms.save('blank', { fields: BLANK, ...WHEN })).status).toBe('failed');
    expect(timer('blank')).toMatchObject({ running: false, elapsedMs: 10 * MIN }); // still paused from the question
    expect(keptDraft('blank')).toEqual(BLANK);
    expect(forms.list().map((f) => f.type)).toEqual(['blank']);
  });

  it('clears nothing when validation rejects the session', async () => {
    const forms = opened();
    const res = await forms.save('blank', { fields: BLANK, date: 'yesterday', time: '19:00' });
    expect(res.status).toBe('failed');
    expect(sessions()).toHaveLength(0);
    expect(timer('blank')).toBeTruthy();
    expect(keptDraft('blank')).toEqual(BLANK);
  });

  it('closes only the saved form session', async () => {
    const forms = opened();
    forms.open('strength');
    await forms.save('blank', { fields: BLANK, ...WHEN });
    expect(forms.list().map((f) => f.type)).toEqual(['strength']);
  });
});

describe('discarding', () => {
  it('asks first; after a yes the timer and the kept draft are gone', async () => {
    const forms = make();
    forms.open('blank');
    forms.keepDraft('blank', BLANK);
    forms.open('mental');
    expect((await forms.discard('blank')).status).toBe('discarded');
    expect(asked).toEqual([{ kind: 'discard', type: 'blank' }]);
    expect(timer('blank')).toBeNull();
    expect(keptDraft('blank')).toBeNull();
    expect(forms.list().map((f) => f.type)).toEqual(['mental']);
    expect(sessions()).toHaveLength(0);
  });

  it('keeps everything after a no', async () => {
    const forms = make();
    const opened = forms.open('blank').timer;
    forms.keepDraft('blank', BLANK);
    answers = [false];
    expect((await forms.discard('blank')).status).toBe('cancelled');
    expect(timer('blank')).toEqual(opened);
    expect(keptDraft('blank')).toEqual(BLANK);
  });
});

describe('listing the open form sessions', () => {
  it('is empty when no form was opened', () => {
    expect(make().list()).toEqual([]);
  });

  it('lists each opened timed form with its timer and kept draft, in session-type order', () => {
    const forms = make();
    forms.open('mental');
    forms.open('manual');
    forms.open('blank');
    forms.keepDraft('blank', BLANK);
    expect(forms.list()).toEqual([
      { type: 'blank', timer: timer('blank'), draft: BLANK },
      { type: 'mental', timer: timer('mental'), draft: null },
    ]);
  });

  it('drops a form session left untouched for too long', () => {
    const forms = make();
    forms.open('blank');
    clock += FORM_TIMER_STALE_MS;
    expect(forms.list()).toHaveLength(1);
    clock += 1;
    expect(forms.list()).toEqual([]);
  });
});
