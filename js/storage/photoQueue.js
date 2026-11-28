// Scan photos waiting to go to Google Photos, kept in IndexedDB (pictures are too big for the
// localStorage document). Each entry is { id, name, blob, at }. When IndexedDB cannot be opened
// (private window, blocked storage) the queue lives in memory for this page's life.

const DB_VERSION = 1;
const STORE = 'photos';

/** The queue in memory: the same interface, for tests and as the fallback. */
export function createMemoryPhotoQueue() {
  let items = [];
  let next = 1;
  return {
    async add({ name, blob }) {
      const item = { id: next++, name, blob, at: Date.now() };
      items.push(item);
      return item.id;
    },
    async list() {
      return [...items];
    },
    async remove(id) {
      items = items.filter((i) => i.id !== id);
    },
    async count() {
      return items.length;
    },
  };
}

/** The queue in IndexedDB database `name`. */
export function createPhotoQueue(name, idb = globalThis.indexedDB) {
  let fallback = null;
  let opened = null;

  function open() {
    if (!opened) {
      opened = new Promise((resolve, reject) => {
        if (!idb) return reject(new Error('no IndexedDB'));
        const req = idb.open(name, DB_VERSION);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
    }
    return opened;
  }

  /** Run `fn(store)` in a transaction; resolves with its request's result. Falls back to memory. */
  async function run(mode, fn, viaMemory) {
    let db;
    try {
      db = await open();
    } catch {
      fallback ??= createMemoryPhotoQueue();
      return viaMemory(fallback);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    add: ({ name: fileName, blob }) => run('readwrite', (s) => s.add({ name: fileName, blob, at: Date.now() }), (m) => m.add({ name: fileName, blob })),
    list: () => run('readonly', (s) => s.getAll(), (m) => m.list()),
    remove: (id) => run('readwrite', (s) => s.delete(id), (m) => m.remove(id)),
    count: () => run('readonly', (s) => s.count(), (m) => m.count()),
  };
}
