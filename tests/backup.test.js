import { describe, it, expect } from 'vitest';
import { backupFileName, parseBackup, needsBackupReminder, serialiseBackup } from '../public/js/backup/backup.js';
import { migrate } from '../public/js/storage/migrations.js';

describe('backup', () => {
  it('names the file with the local date', () => {
    expect(backupFileName(new Date(2026, 10, 9))).toBe('archery-performance-journal-backup-2026-11-09.json');
  });
  it('round-trips a document', () => {
    const doc = { app: 'archery-performance-journal', schemaVersion: 1, collections: {} };
    expect(parseBackup(serialiseBackup(doc))).toEqual(doc);
  });
  it('rejects non-JSON', () => {
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/);
  });
  it('reminds when never backed up or older than 30 days', () => {
    const now = new Date('2026-11-09T00:00:00Z');
    expect(needsBackupReminder(null, now)).toBe(true);
    expect(needsBackupReminder('2026-11-01T00:00:00Z', now)).toBe(false);
    expect(needsBackupReminder('2026-10-01T00:00:00Z', now)).toBe(true);
  });
});

describe('migrations', () => {
  it('upgrades step by step and refuses newer documents', () => {
    const steps = [
      { from: 1, to: 2, up: (d) => ({ ...d, a: 1 }) },
      { from: 2, to: 3, up: (d) => ({ ...d, b: 2 }) },
    ];
    const out = migrate({ schemaVersion: 1 }, 3, steps);
    expect(out).toMatchObject({ schemaVersion: 3, a: 1, b: 2 });
    expect(() => migrate({ schemaVersion: 4 }, 3, steps)).toThrow(/newer/);
  });
});

describe('schema v2 (Drive sync)', () => {
  it('v1 documents gain meta.settingsUpdatedAt and keep their data', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const v1 = { app: 'archery-performance-journal', schemaVersion: 1, meta: { lastBackupAt: null }, settings: {}, collections: { sessions: [{ id: 'a' }] } };
    const out = migrate(v1, 2, real);
    expect(out.schemaVersion).toBe(2);
    expect(out.meta).toEqual({ lastBackupAt: null, settingsUpdatedAt: null });
    expect(out.collections.sessions).toEqual([{ id: 'a' }]);
  });
});

describe('schema v6 (sight marks belong to a gear setup)', () => {
  const v5 = () => ({
    app: 'archery-performance-journal',
    schemaVersion: 5,
    settings: { gear: { riser: 'Hoyt' }, sightsSeeded: true, accent: '#0B6E4F' },
    collections: {
      sessions: [{ id: 'x', gear: { riser: 'Hoyt' } }],
      gearSnapshots: [
        { id: 's1', name: 'Indoor', fields: { riser: 'Hoyt' } },
        { id: 's2', deleted: true },
      ],
      sightMarks: [
        { id: 'seed-70', distance: '70 m', elevation: '5.2', windage: '1R', note: '' },
        { id: 'seed-18', distance: '18 m', elevation: '', windage: '', note: '' },
        { id: 'blank', distance: '', elevation: '', windage: '', note: '' },
        { id: 'gone', deleted: true },
      ],
    },
  });

  it('moves the marks into the current setup and every saved setup, dropping the collection', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const out = migrate(v5(), 6, real);
    const marks = [
      { id: 'seed-18', distance: '18 m', elevation: '', windage: '', note: '' },
      { id: 'seed-70', distance: '70 m', elevation: '5.2', windage: '1R', note: '' },
    ];
    expect(out.schemaVersion).toBe(6);
    expect(out.collections.sightMarks).toBeUndefined();
    expect(out.settings.sightsSeeded).toBeUndefined();
    expect(out.settings.gear).toEqual({ riser: 'Hoyt', sights: marks });
    expect(out.collections.gearSnapshots[0].fields).toEqual({ riser: 'Hoyt', sights: marks });
    expect(out.collections.gearSnapshots[1]).toEqual({ id: 's2', deleted: true });
    expect(out.collections.sessions).toEqual([{ id: 'x', gear: { riser: 'Hoyt' } }]);
  });

  it('leaves setups without marks when none were typed in', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const doc = v5();
    doc.collections.sightMarks = [{ id: 'blank', distance: '', elevation: '', windage: '', note: '' }];
    const out = migrate(doc, 6, real);
    expect(out.settings.gear).toEqual({ riser: 'Hoyt' });
    expect(out.collections.gearSnapshots[0].fields).toEqual({ riser: 'Hoyt' });
  });
});

describe('schema v7 (gear setups)', () => {
  const marks = [{ id: 'm1', distance: '18 m', elevation: '5.2', windage: '1R', note: '' }];
  const indoor = { riser: 'Hoyt', brace: '8.75', sights: marks };
  const v6 = ({ settings = {}, snapshots = [] } = {}) => ({
    app: 'archery-performance-journal',
    schemaVersion: 6,
    updatedAt: '2026-11-10T00:00:00.000Z',
    meta: { settingsUpdatedAt: '2026-11-09T12:00:00.000Z' },
    settings: { accent: '#0B6E4F', gear: {}, activeSnapshotId: null, loadedSnapshotId: null, ...settings },
    collections: { sessions: [{ id: 'x', gear: indoor, gearSnapshotId: 'a' }], competitions: [], gearSnapshots: snapshots },
  });
  const snap = (id, fields, updatedAt = '2026-10-01T00:00:00.000Z', name = id) => ({
    id,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt,
    name,
    date: '2026-09-01',
    fields,
  });
  const run = async (doc) => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    return migrate(doc, 7, real);
  };

  it('migrates an empty document', async () => {
    const out = await run(v6());
    expect(out.schemaVersion).toBe(7);
    expect(out.collections.setups).toEqual([]);
    expect(out.collections.gearSnapshots).toBeUndefined();
    expect(out.settings).toEqual({ accent: '#0B6E4F', activeSetupId: null });
  });

  it('migrates a document without settings or collections', async () => {
    const out = await run({ app: 'archery-performance-journal', schemaVersion: 6 });
    expect(out.collections.setups).toEqual([]);
    expect(out.settings.activeSetupId).toBeNull();
  });

  it('renames snapshots to setups, drops their date, keeps deletion markers and sessions', async () => {
    const out = await run(
      v6({
        snapshots: [snap('a', indoor), { id: 'gone', deleted: true, updatedAt: '2026-11-01' }],
        settings: { gear: indoor, activeSnapshotId: 'a', loadedSnapshotId: 'a' },
      }),
    );
    expect(out.collections.setups).toEqual([
      { id: 'a', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', name: 'a', fields: indoor },
      { id: 'gone', deleted: true, updatedAt: '2026-11-01' },
    ]);
    expect(out.settings.activeSetupId).toBe('a');
    expect(out.collections.sessions).toEqual([{ id: 'x', gear: indoor, gearSnapshotId: 'a' }]);
  });

  it('turns a working copy edited after a load into "My setup" and makes it active', async () => {
    const edited = { ...indoor, brace: '8.625' };
    const out = await run(v6({ snapshots: [snap('a', indoor)], settings: { gear: edited, activeSnapshotId: null, loadedSnapshotId: 'a' } }));
    const mine = out.collections.setups.find((s) => s.id === 'migrated-v7');
    expect(mine).toEqual({
      id: 'migrated-v7',
      createdAt: '2026-11-09T12:00:00.000Z',
      updatedAt: '2026-11-09T12:00:00.000Z',
      name: 'My setup',
      fields: edited,
    });
    expect(out.settings.activeSetupId).toBe('migrated-v7');
    expect(out.settings).not.toHaveProperty('gear');
    expect(out.settings).not.toHaveProperty('loadedSnapshotId');
    expect(out.settings).not.toHaveProperty('activeSnapshotId');
  });

  it('makes no new setup when the working copy still equals the loaded snapshot (ignoring blanks and mark ids)', async () => {
    const same = {
      ...indoor,
      nocks: '  ',
      sights: [{ ...marks[0], id: 'other' }, { id: 'b', distance: '', elevation: '', windage: '', note: '' }],
    };
    const out = await run(
      v6({ snapshots: [snap('a', indoor), snap('b', {}, '2026-11-01T00:00:00.000Z')], settings: { gear: same, loadedSnapshotId: 'a' } }),
    );
    expect(out.collections.setups.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out.settings.activeSetupId).toBe('a');
  });

  it('uses activeSnapshotId as the loaded one for documents without loadedSnapshotId', async () => {
    const doc = v6({ snapshots: [snap('a', indoor)], settings: { gear: indoor, activeSnapshotId: 'a' } });
    delete doc.settings.loadedSnapshotId;
    const out = await run(doc);
    expect(out.collections.setups).toHaveLength(1);
    expect(out.settings.activeSetupId).toBe('a');
  });

  it('turns a working copy into "My setup" when nothing was loaded', async () => {
    const out = await run(v6({ settings: { gear: { riser: 'Own' } } }));
    expect(out.collections.setups).toHaveLength(1);
    expect(out.collections.setups[0]).toMatchObject({ id: 'migrated-v7', name: 'My setup', fields: { riser: 'Own' } });
    expect(out.settings.activeSetupId).toBe('migrated-v7');
  });

  it('keeps a working copy holding only sight marks', async () => {
    const out = await run(v6({ settings: { gear: { sights: marks } } }));
    expect(out.collections.setups[0].fields).toEqual({ sights: marks });
  });

  it('picks a free name when "My setup" is taken', async () => {
    const out = await run(v6({ snapshots: [snap('a', indoor, undefined, 'My setup')], settings: { gear: { riser: 'Own' } } }));
    expect(out.collections.setups.find((s) => s.id === 'migrated-v7').name).toBe('My setup 2');
  });

  it('makes the newest setup active when the active snapshot was deleted and the gear is empty', async () => {
    const out = await run(
      v6({
        snapshots: [
          snap('a', indoor, '2026-10-01T00:00:00.000Z'),
          snap('b', { riser: 'W&W' }, '2026-10-05T00:00:00.000Z'),
          { id: 'c', deleted: true, updatedAt: '2026-11-01' },
        ],
        settings: { gear: {}, activeSnapshotId: 'c', loadedSnapshotId: 'c' },
      }),
    );
    expect(out.collections.setups).toHaveLength(3);
    expect(out.settings.activeSetupId).toBe('b');
  });

  it('keeps activeSnapshotId when the working copy differs from it, alongside a new "My setup"', async () => {
    const out = await run(
      v6({ snapshots: [snap('a', indoor)], settings: { gear: { riser: 'Other' }, activeSnapshotId: 'a', loadedSnapshotId: 'a' } }),
    );
    expect(out.collections.setups.map((s) => s.id)).toEqual(['a', 'migrated-v7']);
    expect(out.settings.activeSetupId).toBe('a');
  });

  it('gives two devices with the same synced gear the same new record', async () => {
    const doc = v6({ settings: { gear: { riser: 'Own' } } });
    const [phone, tablet] = [await run(doc), await run(structuredClone(doc))];
    expect(phone.collections.setups).toEqual(tablet.collections.setups);
  });

  it('upgrades a v5 backup through v6 and v7 without losing marks or sessions', async () => {
    const { migrations: real } = await import('../public/js/storage/migrations.js');
    const v5 = {
      app: 'archery-performance-journal',
      schemaVersion: 5,
      meta: { settingsUpdatedAt: '2026-11-01T00:00:00.000Z' },
      settings: { gear: { riser: 'Hoyt' }, activeSnapshotId: null, sightsSeeded: true },
      collections: {
        sessions: [{ id: 'x', gear: { riser: 'Hoyt' } }],
        gearSnapshots: [snap('a', { riser: 'W&W' })],
        sightMarks: [{ id: 'k', distance: '70 m', elevation: '5.8', windage: '0', note: '' }],
      },
    };
    const out = migrate(v5, 7, real);
    const k = [{ id: 'k', distance: '70 m', elevation: '5.8', windage: '0', note: '' }];
    expect(out.collections.setups.map((s) => [s.id, s.fields])).toEqual([
      ['a', { riser: 'W&W', sights: k }],
      ['migrated-v7', { riser: 'Hoyt', sights: k }],
    ]);
    expect(out.settings.activeSetupId).toBe('migrated-v7');
    expect(out.collections.sessions).toEqual([{ id: 'x', gear: { riser: 'Hoyt' } }]);
  });
});
