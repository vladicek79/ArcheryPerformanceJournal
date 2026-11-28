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

/**
 * How much of `storage` the journal takes, in bytes (UTF-8, as the text is): `data`, its document
 * (`key`), and `copies`, the safety copies kept beside it (`key.pre-import`, `key.pre-v8`, ...).
 */
export function journalBytes(key, storage = globalThis.localStorage) {
  const size = (text) => (text == null ? 0 : new TextEncoder().encode(text).length);
  let copies = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(`${key}.pre-`)) copies += size(storage.getItem(k));
    }
    return { data: size(storage.getItem(key)), copies };
  } catch {
    return { data: null, copies: null };
  }
}

/** "412 KB", "1.4 MB", "10 GB": a size in bytes for people. */
export function formatBytes(n) {
  if (n == null || !Number.isFinite(n)) return '?';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
