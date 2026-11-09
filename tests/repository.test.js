import { describe, it, expect, beforeEach } from 'vitest';
import { createRepository, ValidationError, StorageError, ImportError } from '../public/js/storage/repository.js';
import { NewerVersionError } from '../public/js/storage/migrations.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { collections, defaultSettings } from '../public/js/app/collections.js';
import { createSession } from '../public/js/app/sessionLogic.js';

const KEY = 'test.v1';
let clock;
const make = (adapter, extra = {}) =>
  createRepository({
    adapter,
    storageKey: KEY,
    appId: 'archery-performance-journal',
    schemaVersion: 1,
    collections,
    defaultSettings,
    migrations: [],
    now: () => new Date(clock),
    ...extra,
  });

beforeEach(() => {
  clock = Date.parse('2026-11-09T10:00:00Z');
});

const session = () => createSession({ date: '2026-11-09', distance: 70, face: '122', arrowsPerEnd: 6 });

describe('repository', () => {
  it('creates an empty document on first init', () => {
    const ad = createMemoryAdapter();
    const repo = make(ad);
    repo.init();
    const doc = JSON.parse(ad.read(KEY));
    expect(doc.app).toBe('archery-performance-journal');
    expect(doc.collections.sessions).toEqual([]);
    expect(repo.getSettings().askGrades).toBe(true);
  });

  it('saves, lists, updates and removes records with platform fields', () => {
    const ad = createMemoryAdapter();
    const repo = make(ad);
    repo.init();
    const saved = repo.save('sessions', session());
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBe('2026-11-09T10:00:00.000Z');
    clock += 1000;
    const upd = repo.save('sessions', { ...saved, distance: 50 });
    expect(upd.createdAt).toBe(saved.createdAt);
    expect(upd.updatedAt).toBe('2026-11-09T10:00:01.000Z');
    expect(repo.list('sessions')).toHaveLength(1);
    // persisted and reloadable
    const repo2 = make(ad);
    repo2.init();
    expect(repo2.get('sessions', saved.id).distance).toBe(50);
    repo.remove('sessions', saved.id);
    expect(repo.list('sessions')).toHaveLength(0);
  });

  it('rejects invalid records', () => {
    const repo = make(createMemoryAdapter());
    repo.init();
    expect(() => repo.save('sessions', { ...session(), face: '99' })).toThrow(ValidationError);
  });

  it('rolls back memory when the write fails', () => {
    const ad = createMemoryAdapter();
    const repo = make(ad);
    repo.init();
    ad.write = () => {
      const e = new Error('full');
      e.name = 'QuotaExceededError';
      throw e;
    };
    let err;
    try {
      repo.save('sessions', session());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StorageError);
    expect(err.quota).toBe(true);
    expect(repo.list('sessions')).toHaveLength(0);
  });

  it('refuses a document from a newer schema', () => {
    const ad = createMemoryAdapter({ [KEY]: JSON.stringify({ app: 'archery-performance-journal', schemaVersion: 9 }) });
    expect(() => make(ad).init()).toThrow(NewerVersionError);
  });

  it('migrates older documents and keeps a pre-migration copy', () => {
    const old = { app: 'archery-performance-journal', schemaVersion: 1, collections: { sessions: [] }, settings: {} };
    const ad = createMemoryAdapter({ [KEY]: JSON.stringify(old) });
    const repo = make(ad, {
      schemaVersion: 2,
      migrations: [{ from: 1, to: 2, up: (d) => ({ ...d, settings: { ...d.settings, migrated: true } }) }],
    });
    repo.init();
    expect(repo.getSettings().migrated).toBe(true);
    expect(ad.read(`${KEY}.pre-v2`)).toBe(JSON.stringify(old));
  });

  it('notifies subscribers', () => {
    const repo = make(createMemoryAdapter());
    repo.init();
    const seen = [];
    repo.subscribe((c) => seen.push(c.type));
    repo.saveSettings({ askGrades: false });
    expect(seen).toEqual(['settings']);
    expect(repo.getSettings().askGrades).toBe(false);
  });
});

describe('import', () => {
  it('rejects backups from another app', () => {
    const repo = make(createMemoryAdapter());
    repo.init();
    expect(() => repo.prepareImport({ app: 'other' })).toThrow(ImportError);
  });

  it('merge keeps the newer updatedAt and records from both sides', () => {
    const repoA = make(createMemoryAdapter());
    repoA.init();
    const s1 = repoA.save('sessions', session());
    const backup = repoA.exportDocument();

    const repoB = make(createMemoryAdapter());
    repoB.init();
    repoB.save('sessions', session()); // only in B
    clock += 5000;
    repoB.importDocument(backup, { mode: 'merge' });
    expect(repoB.list('sessions')).toHaveLength(2);

    // a newer local edit wins over the older backup copy
    clock += 5000;
    repoB.save('sessions', { ...repoB.get('sessions', s1.id), distance: 30 });
    repoB.importDocument(backup, { mode: 'merge' });
    expect(repoB.get('sessions', s1.id).distance).toBe(30);
  });

  it('replace keeps a safety copy that can be undone', () => {
    const repo = make(createMemoryAdapter());
    repo.init();
    repo.save('sessions', session());
    const other = make(createMemoryAdapter());
    other.init();
    const empty = other.exportDocument();
    repo.importDocument(empty, { mode: 'replace' });
    expect(repo.list('sessions')).toHaveLength(0);
    expect(repo.hasUndoImport()).toBe(true);
    expect(repo.undoImport()).toBe(true);
    expect(repo.list('sessions')).toHaveLength(1);
    expect(repo.hasUndoImport()).toBe(false);
  });

  it('preview validates records and reports counts', () => {
    const repo = make(createMemoryAdapter());
    repo.init();
    repo.save('competitions', { event: 'Indoor Cup', score: '560' });
    const { summary } = repo.prepareImport(repo.exportDocument());
    expect(summary.counts.competitions).toBe(1);
    const bad = repo.exportDocument();
    bad.collections.sessions.push({ id: 'x', face: 'nope' });
    expect(() => repo.prepareImport(bad)).toThrow(ImportError);
  });
});
