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
