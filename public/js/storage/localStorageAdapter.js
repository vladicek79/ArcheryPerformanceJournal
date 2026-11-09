// Adapter interface: read(key) → string | null, write(key, value), remove(key).
// An IndexedDB adapter can replace this one without changing the repository API (ARCHITECTURE §6.7).

export function createLocalStorageAdapter(storage = globalThis.localStorage) {
  return {
    read(key) {
      return storage.getItem(key);
    },
    write(key, value) {
      storage.setItem(key, value);
    },
    remove(key) {
      storage.removeItem(key);
    },
  };
}

/** In-memory adapter, used by tests. */
export function createMemoryAdapter(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    read: (key) => (map.has(key) ? map.get(key) : null),
    write: (key, value) => void map.set(key, String(value)),
    remove: (key) => void map.delete(key),
  };
}
