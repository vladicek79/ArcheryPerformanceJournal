// Sync seam: two "devices" (repositories with in-memory storage) syncing through one fake Drive store.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRepository } from '../public/js/storage/repository.js';
import { createMemoryAdapter } from '../public/js/storage/localStorageAdapter.js';
import { migrations } from '../public/js/storage/migrations.js';
import { collections, defaultSettings, SYNCED_SETTING_KEYS } from '../public/js/app/collections.js';
import { createSession } from '../public/js/app/sessionLogic.js';
import { createSyncService } from '../public/js/sync/syncService.js';
import { createFakeDriveStore } from './fakeDriveStore.js';
import { SCHEMA_VERSION } from '../public/js/config.js';
import { activeSetup } from '../public/js/app/gearFields.js';

const APP = 'archery-performance-journal';
const SCHEMA = SCHEMA_VERSION;
let clock;
const now = () => new Date(clock);
const tick = (ms = 1000) => (clock += ms);

function device(drive, { adapter = createMemoryAdapter(), retentionDays = 180 } = {}) {
  const repo = createRepository({
    adapter,
    storageKey: 'test.v1',
    appId: APP,
    schemaVersion: SCHEMA,
    collections,
    defaultSettings,
    syncedSettingKeys: SYNCED_SETTING_KEYS,
    migrations,
    now,
  });
  repo.init();
  const sync = createSyncService({ repo, store: drive, collections, syncedSettingKeys: SYNCED_SETTING_KEYS, appId: APP, schemaVersion: SCHEMA, migrations, now, retentionDays });
  return { repo, sync: () => sync.sync(), service: sync };
}

const session = (distance = 70) =>
  createSession({ date: '2026-11-09', distance, face: distance === 18 ? '40s' : '122', arrowsPerEnd: distance === 18 ? 3 : 6 });

let drive;
beforeEach(() => {
  clock = Date.parse('2026-11-09T10:00:00Z');
  drive = createFakeDriveStore();
});

describe('first sync', () => {
  it('uploads local data when Drive is empty', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session());
    const res = await phone.sync();
    expect(res.status).toBe('ok');
    expect(drive.doc.collections.sessions).toHaveLength(1);
    expect(phone.repo.getMeta().lastSyncAt).toBe(now().toISOString());
  });

  it('downloads everything onto an empty device', async () => {
    const phone = device(drive);
    const s = phone.repo.save('sessions', session());
    phone.repo.save('competitions', { event: 'Indoor Cup', score: '560' });
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    expect(tablet.repo.get('sessions', s.id).distance).toBe(70);
    expect(tablet.repo.list('competitions')).toHaveLength(1);
  });

  it('merges a device that already has data with Drive (union)', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session(70));
    await phone.sync();
    const tablet = device(drive);
    tablet.repo.save('sessions', session(18));
    await tablet.sync();
    expect(tablet.repo.list('sessions').map((x) => x.distance).sort()).toEqual([18, 70]);
    await phone.sync();
    expect(phone.repo.list('sessions')).toHaveLength(2);
  });
});

describe('conflicts and deletions', () => {
  it('the newer edit of the same record wins', async () => {
    const phone = device(drive);
    const s = phone.repo.save('sessions', session());
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    tick();
    phone.repo.save('sessions', { ...phone.repo.get('sessions', s.id), distance: 50 });
    tick();
    tablet.repo.save('sessions', { ...tablet.repo.get('sessions', s.id), distance: 30 });
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    expect(phone.repo.get('sessions', s.id).distance).toBe(30);
    expect(tablet.repo.get('sessions', s.id).distance).toBe(30);
  });

  it('a deletion on one device propagates and is not resurrected', async () => {
    const phone = device(drive);
    const s = phone.repo.save('sessions', session());
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    tick();
    phone.repo.remove('sessions', s.id);
    await phone.sync();
    await tablet.sync();
    expect(tablet.repo.get('sessions', s.id)).toBeNull();
    expect(tablet.repo.list('sessions')).toHaveLength(0);
    await phone.sync();
    expect(phone.repo.list('sessions')).toHaveLength(0);
  });

  it('an edit newer than a deletion keeps the record', async () => {
    const phone = device(drive);
    const s = phone.repo.save('sessions', session());
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    tick();
    phone.repo.remove('sessions', s.id);
    tick();
    tablet.repo.save('sessions', { ...tablet.repo.get('sessions', s.id), distance: 90 });
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    expect(phone.repo.get('sessions', s.id).distance).toBe(90);
  });

  it('retries when another device wrote between read and write', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session(70));
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    tablet.repo.save('sessions', session(18));
    // the phone writes to Drive while the tablet is between its read and its write
    drive.onceBeforeWrite(() => {
      const d = drive.doc;
      d.collections.competitions.push({ id: 'c1', createdAt: now().toISOString(), updatedAt: now().toISOString(), date: '', event: 'Cup', round: '', score: '600', sightMark: '', conditions: '', note: '' });
      drive.put(d);
    });
    const res = await tablet.sync();
    expect(res.status).toBe('ok');
    expect(drive.doc.collections.sessions).toHaveLength(2);
    expect(drive.doc.collections.competitions).toHaveLength(1);
    expect(tablet.repo.list('competitions')).toHaveLength(1);
  });

  it('purges deletion markers older than the retention period', async () => {
    const phone = device(drive, { retentionDays: 30 });
    const s = phone.repo.save('sessions', session());
    phone.repo.remove('sessions', s.id);
    await phone.sync();
    expect(drive.doc.collections.sessions).toHaveLength(1); // marker kept
    tick(31 * 24 * 3600 * 1000);
    await phone.sync();
    expect(drive.doc.collections.sessions).toHaveLength(0);
  });
});

describe('settings', () => {
  it('syncs the active setup but not device-only settings', async () => {
    const phone = device(drive);
    phone.repo.saveSettings({ activeSetupId: 'a', accent: '#1D4ED8' });
    await phone.sync();
    const tablet = device(drive);
    tablet.repo.saveSettings({ accent: '#B45309' });
    await tablet.sync();
    expect(tablet.repo.getSettings().activeSetupId).toBe('a');
    expect(tablet.repo.getSettings().accent).toBe('#B45309');
    expect(drive.doc.settings.accent).toBeUndefined();
  });

  it('the newer choice of active setup wins', async () => {
    const phone = device(drive);
    const tablet = device(drive);
    phone.repo.saveSettings({ activeSetupId: 'old' });
    tick();
    tablet.repo.saveSettings({ activeSetupId: 'new' });
    await tablet.sync();
    await phone.sync();
    expect(phone.repo.getSettings().activeSetupId).toBe('new');
  });
});

describe('gear setups', () => {
  /** Both devices start with the same two setups. */
  async function twoDevices() {
    const phone = device(drive);
    const indoor = phone.repo.save('setups', { name: 'Indoor', fields: { brace: '8.75' } });
    const outdoor = phone.repo.save('setups', { name: 'Outdoor', fields: { brace: '8.875' } });
    phone.repo.saveSettings({ activeSetupId: indoor.id });
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    return { phone, tablet, indoor, outdoor };
  }
  const edit = (dev, id, patch) => dev.repo.save('setups', { ...dev.repo.get('setups', id), ...patch });

  it('keeps both edits when two devices change different setups', async () => {
    const { phone, tablet, indoor, outdoor } = await twoDevices();
    tick();
    edit(phone, indoor.id, { fields: { brace: '8.625' } });
    edit(tablet, outdoor.id, { name: 'Outdoor 2026' });
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    for (const dev of [phone, tablet]) {
      expect(dev.repo.get('setups', indoor.id).fields.brace).toBe('8.625');
      expect(dev.repo.get('setups', outdoor.id).name).toBe('Outdoor 2026');
    }
  });

  it('the newer edit of the same setup wins whole, its tuning history included', async () => {
    const { phone, tablet, indoor } = await twoDevices();
    tick();
    edit(phone, indoor.id, { fields: { brace: '8.5' }, history: [{ key: 'brace', from: '8.75', to: '8.5', at: 'p', reason: '' }] });
    tick();
    edit(tablet, indoor.id, { fields: { brace: '9' }, history: [{ key: 'brace', from: '8.75', to: '9', at: 't', reason: 'louder' }] });
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    for (const dev of [phone, tablet]) {
      const s = dev.repo.get('setups', indoor.id);
      expect(s.fields.brace).toBe('9');
      expect(s.history.map((e) => e.at)).toEqual(['t']);
    }
  });

  it('falls back to another setup when the active one was deleted on the other device', async () => {
    const { phone, tablet, indoor, outdoor } = await twoDevices();
    tick();
    phone.repo.saveSettings({ activeSetupId: outdoor.id });
    tick();
    tablet.repo.remove('setups', outdoor.id);
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    for (const dev of [phone, tablet]) {
      expect(dev.repo.getSettings().activeSetupId).toBe(outdoor.id);
      expect(activeSetup(dev.repo.getSettings(), dev.repo.list('setups')).id).toBe(indoor.id);
    }
  });

  it('a v6 Drive document and a device migrated from the same data end with one "My setup"', async () => {
    const v6 = {
      app: APP,
      schemaVersion: 6,
      updatedAt: '2026-11-08T10:00:00.000Z',
      meta: { settingsUpdatedAt: '2026-11-08T09:00:00.000Z' },
      settings: { gear: { riser: 'Hoyt' }, activeSnapshotId: null, loadedSnapshotId: null },
      collections: { sessions: [], competitions: [], gearSnapshots: [] },
    };
    drive.put(v6);
    const phone = device(drive);
    phone.repo.importDocument(structuredClone(v6), { mode: 'replace' });
    const res = await phone.sync();
    expect(res.status).toBe('ok');
    expect(phone.repo.list('setups').map((s) => [s.id, s.name])).toEqual([['migrated-v7', 'My setup']]);
    expect(phone.repo.getSettings().activeSetupId).toBe('migrated-v7');
    expect(drive.doc.schemaVersion).toBe(SCHEMA);
    expect(drive.doc.collections.setups).toHaveLength(1);
    expect(drive.doc.collections.gearSnapshots).toBeUndefined();
  });
});

describe('versions, validation and errors', () => {
  it('refuses a Drive document from a newer app version and keeps local data', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session());
    drive.put({ app: APP, schemaVersion: 99, collections: {} });
    const res = await phone.sync();
    expect(res.status).toBe('error');
    expect(res.error).toBe('newer-version');
    expect(phone.repo.list('sessions')).toHaveLength(1);
  });

  it('migrates an older Drive document', async () => {
    const phone = device(drive);
    const old = phone.repo.exportDocument();
    old.schemaVersion = 1;
    delete old.meta.settingsUpdatedAt;
    old.collections.competitions.push({ id: 'c9', createdAt: now().toISOString(), updatedAt: now().toISOString(), date: '', event: 'Old cup', round: '', score: '1', sightMark: '', conditions: '', note: '' });
    drive.put(old);
    const res = await phone.sync();
    expect(res.status).toBe('ok');
    expect(phone.repo.list('competitions')).toHaveLength(1);
    expect(drive.doc.schemaVersion).toBe(SCHEMA);
  });

  it('refuses a Drive document of another app', async () => {
    const phone = device(drive);
    drive.put({ app: 'other', schemaVersion: 2, collections: {} });
    const res = await phone.sync();
    expect(res).toMatchObject({ status: 'error', error: 'drive' });
  });

  it('skips invalid remote records and reports them', async () => {
    const phone = device(drive);
    await phone.sync();
    const d = drive.doc;
    d.collections.sessions.push({ id: 'bad', createdAt: now().toISOString(), updatedAt: now().toISOString(), face: 'nope' });
    drive.put(d);
    const res = await phone.sync();
    expect(res.status).toBe('ok');
    expect(res.skipped).toBe(1);
    expect(phone.repo.get('sessions', 'bad')).toBeNull();
  });

  it('reports offline and expired sign-in without touching local data', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session());
    drive.failNextWith('offline');
    expect(await phone.sync()).toMatchObject({ status: 'error', error: 'offline' });
    drive.failNextWith('auth');
    expect(await phone.sync()).toMatchObject({ status: 'error', error: 'auth' });
    expect(phone.repo.list('sessions')).toHaveLength(1);
    expect(phone.repo.getMeta().lastSyncAt).toBeNull();
  });

  it('does not write to Drive when nothing changed', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session());
    await phone.sync();
    const writes = drive.writes;
    await phone.sync();
    expect(drive.writes).toBe(writes);
  });

  it('clamps record times far in the future to now', async () => {
    const phone = device(drive);
    const s = phone.repo.save('sessions', session());
    const doc = phone.repo.exportDocument();
    doc.collections.sessions[0].updatedAt = '2030-01-01T00:00:00.000Z';
    drive.put(doc);
    await phone.sync();
    expect(phone.repo.get('sessions', s.id).updatedAt <= now().toISOString()).toBe(true);
  });

  it('coalesces sync requests made while a sync is running', async () => {
    const phone = device(drive);
    phone.repo.save('sessions', session());
    const [a, b] = await Promise.all([phone.service.sync(), phone.service.sync()]);
    expect(a.status).toBe('ok');
    expect(b.status).toBe('ok');
  });
});

describe('review fixes', () => {
  it('two devices with the same updatedAt but different content converge on one copy', async () => {
    const phone = device(drive);
    const s = phone.repo.save('sessions', session());
    await phone.sync();
    const tablet = device(drive);
    await tablet.sync();
    tick();
    phone.repo.save('sessions', { ...phone.repo.get('sessions', s.id), distance: 50 });
    tablet.repo.save('sessions', { ...tablet.repo.get('sessions', s.id), distance: 30 }); // same clock
    await phone.sync();
    await tablet.sync();
    await phone.sync();
    expect(phone.repo.get('sessions', s.id).distance).toBe(tablet.repo.get('sessions', s.id).distance);
    const writes = drive.writes;
    await phone.sync();
    await tablet.sync();
    expect(drive.writes).toBe(writes); // stable, no ping-pong
  });
});
