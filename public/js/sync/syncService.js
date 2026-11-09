// Sync service: one full cycle of read Drive → merge → save locally → write Drive.
// The Drive store is injected ({ read() → { doc, version } | null, write(doc, expectedVersion) → version }),
// so the same service runs against Google Drive in the app and an in-memory fake in tests.
import { migrate, NewerVersionError } from '../storage/migrations.js';
import { syncedPayload, samePayload, mergePayloads } from './merge.js';
import { DriveConflictError, DriveAuthError, DriveOfflineError } from './errors.js';

const MAX_ATTEMPTS = 3;

export function createSyncService({
  repo,
  store,
  collections,
  syncedSettingKeys,
  appId,
  schemaVersion,
  migrations,
  now = () => new Date(),
  retentionDays = 180,
}) {
  const collectionNames = Object.keys(collections);
  const opts = { collectionNames, syncedSettingKeys };
  const validate = (name, r) => (collections[name].validate ? collections[name].validate(r) : []);

  /** Wrap a synced payload as a full document for Drive (device-only settings are not included). */
  function toDriveDoc(payload) {
    const t = now().toISOString();
    return {
      app: appId,
      schemaVersion,
      updatedAt: t,
      meta: { settingsUpdatedAt: payload.settingsUpdatedAt },
      settings: payload.settings,
      collections: payload.collections,
    };
  }

  async function cycle() {
    for (let attempt = 1; ; attempt++) {
      const remote = await store.read();
      let remotePayload = null;
      let remoteSchemaOk = true;
      if (remote) {
        if (!remote.doc || remote.doc.app !== appId) throw new Error('The Drive file does not belong to this app.');
        remoteSchemaOk = Number(remote.doc.schemaVersion || 1) === schemaVersion;
        remotePayload = syncedPayload(migrate(remote.doc, schemaVersion, migrations), opts);
      }

      const localPayload = syncedPayload(repo.exportDocument(), opts);
      const { payload, skipped } = mergePayloads(localPayload, remotePayload, { collectionNames, validate, now, retentionDays });

      const localChanged = !samePayload(payload, localPayload);
      if (localChanged) repo.applySyncedData(payload);

      const remoteChanged = !remote || !remoteSchemaOk || !samePayload(payload, remotePayload);
      let pushed = false;
      if (remoteChanged) {
        try {
          await store.write(toDriveDoc(payload), remote ? remote.version : null);
          pushed = true;
        } catch (e) {
          if (e instanceof DriveConflictError && attempt < MAX_ATTEMPTS) continue;
          throw e;
        }
      }
      return { pulled: localChanged, pushed, skipped };
    }
  }

  async function run() {
    try {
      const r = await cycle();
      const at = now().toISOString();
      repo.setMeta({ lastSyncAt: at });
      return { status: 'ok', at, ...r };
    } catch (e) {
      return { status: 'error', error: errorKind(e), message: e.message };
    }
  }

  // One cycle at a time; calls made before a queued cycle starts share it.
  let chain = Promise.resolve();
  let queued = null;
  function sync() {
    if (queued) return queued;
    queued = chain.then(() => {
      queued = null;
      return run();
    });
    chain = queued;
    return queued;
  }

  return { sync };
}

function errorKind(e) {
  if (e instanceof DriveOfflineError) return 'offline';
  if (e instanceof DriveAuthError) return 'auth';
  if (e instanceof NewerVersionError) return 'newer-version';
  return 'drive';
}
