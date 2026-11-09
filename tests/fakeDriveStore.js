// In-memory stand-in for the Google Drive store used by the sync service (same interface as driveStore.js).
import { DriveConflictError, DriveAuthError, DriveOfflineError } from '../public/js/sync/errors.js';

export function createFakeDriveStore() {
  let file = null; // { doc, version }
  let failNext = null;
  let beforeWrite = null;
  const store = {
    writes: 0,
    get doc() {
      return file ? structuredClone(file.doc) : null;
    },
    /** Replace the remote file directly (another device writing). */
    put(doc) {
      file = { doc: structuredClone(doc), version: (file?.version ?? 0) + 1 };
    },
    /** Make the next call fail with 'offline' | 'auth'. */
    failNextWith(kind) {
      failNext = kind;
    },
    /** Run fn once just before the next write is applied (to simulate a concurrent writer). */
    onceBeforeWrite(fn) {
      beforeWrite = fn;
    },
    async read() {
      maybeFail();
      return file ? { doc: structuredClone(file.doc), version: file.version } : null;
    },
    async write(doc, expectedVersion) {
      maybeFail();
      if (beforeWrite) {
        const fn = beforeWrite;
        beforeWrite = null;
        fn();
      }
      if ((file?.version ?? null) !== expectedVersion) throw new DriveConflictError();
      file = { doc: structuredClone(doc), version: (file?.version ?? 0) + 1 };
      store.writes += 1;
      return file.version;
    },
  };
  function maybeFail() {
    if (!failNext) return;
    const kind = failNext;
    failNext = null;
    if (kind === 'offline') throw new DriveOfflineError();
    if (kind === 'auth') throw new DriveAuthError();
  }
  return store;
}
