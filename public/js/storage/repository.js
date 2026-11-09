// The only module that touches persistence (ARCHITECTURE §6.3).
// One JSON document per app, kept in memory and written atomically on every change.
import { migrate as runMigrations, NewerVersionError } from './migrations.js';

export class ValidationError extends Error {
  constructor(collection, errors) {
    super(`Invalid ${collection} record: ${errors.join('; ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class StorageError extends Error {
  constructor(cause) {
    const quota = cause && (cause.name === 'QuotaExceededError' || cause.code === 22);
    super(quota ? 'Storage is full. Export a backup, then remove old data.' : `Could not save: ${cause?.message}`);
    this.name = 'StorageError';
    this.quota = !!quota;
    this.cause = cause;
  }
}

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
  }
}

export { NewerVersionError };

export function createRepository({
  adapter,
  storageKey,
  appId,
  schemaVersion,
  collections,
  defaultSettings = {},
  migrations,
  now = () => new Date(),
  uuid = () => crypto.randomUUID(),
}) {
  let doc = null;
  const listeners = new Set();
  const iso = () => now().toISOString();

  function emptyDocument() {
    const t = iso();
    const cols = {};
    for (const name of Object.keys(collections)) cols[name] = [];
    return {
      app: appId,
      schemaVersion,
      updatedAt: t,
      meta: { lastBackupAt: null, createdAt: t },
      settings: structuredClone(defaultSettings),
      collections: cols,
    };
  }

  function normalise(d) {
    d.meta = { lastBackupAt: null, createdAt: d.updatedAt || iso(), ...(d.meta || {}) };
    d.settings = { ...structuredClone(defaultSettings), ...(d.settings || {}) };
    d.collections = d.collections || {};
    for (const name of Object.keys(collections)) {
      if (!Array.isArray(d.collections[name])) d.collections[name] = [];
    }
    return d;
  }

  function assertReady() {
    if (!doc) throw new Error('Repository not initialised; call init() first');
  }

  function def(name) {
    const c = collections[name];
    if (!c) throw new Error(`Unknown collection "${name}"`);
    return c;
  }

  function validateRecord(name, record) {
    const errors = def(name).validate ? def(name).validate(record) : [];
    if (errors.length) throw new ValidationError(name, errors);
  }

  function notify(change) {
    for (const fn of listeners) {
      try {
        fn(change);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /** Apply a mutation to the document and persist it in one write; roll back on failure. */
  function commit(mutate, change) {
    assertReady();
    const before = doc;
    const next = structuredClone(doc);
    mutate(next);
    next.updatedAt = iso();
    try {
      adapter.write(storageKey, JSON.stringify(next));
    } catch (e) {
      doc = before;
      throw new StorageError(e);
    }
    doc = next;
    notify(change);
  }

  function migrateDoc(raw) {
    return normalise(runMigrations(raw, schemaVersion, migrations));
  }

  return {
    init() {
      const raw = adapter.read(storageKey);
      if (raw == null) {
        doc = emptyDocument();
        adapter.write(storageKey, JSON.stringify(doc));
        return;
      }
      const parsed = JSON.parse(raw);
      const version = Number(parsed.schemaVersion || 1);
      if (version > schemaVersion) throw new NewerVersionError(version, schemaVersion);
      if (version < schemaVersion) {
        adapter.write(`${storageKey}.pre-v${schemaVersion}`, raw);
        doc = migrateDoc(parsed);
        adapter.write(storageKey, JSON.stringify(doc));
      } else {
        doc = normalise(parsed);
      }
    },

    list(name, { filter, sort } = {}) {
      assertReady();
      def(name);
      let items = doc.collections[name].map((r) => structuredClone(r));
      if (filter) items = items.filter(filter);
      if (sort) items.sort(sort);
      return items;
    },

    get(name, id) {
      assertReady();
      def(name);
      const r = doc.collections[name].find((x) => x.id === id);
      return r ? structuredClone(r) : null;
    },

    /** Create (no id or unknown id) or update. Returns the saved record. */
    save(name, record) {
      assertReady();
      const c = def(name);
      const t = iso();
      const existing = record.id ? doc.collections[name].find((x) => x.id === record.id) : null;
      const saved = {
        ...(c.defaults ? c.defaults() : {}),
        ...structuredClone(record),
        id: record.id || uuid(),
        createdAt: existing?.createdAt || record.createdAt || t,
        updatedAt: t,
      };
      validateRecord(name, saved);
      commit(
        (d) => {
          const list = d.collections[name];
          const i = list.findIndex((x) => x.id === saved.id);
          if (i >= 0) list[i] = saved;
          else list.push(saved);
        },
        { type: 'save', collection: name, id: saved.id },
      );
      return structuredClone(saved);
    },

    remove(name, id) {
      def(name);
      commit(
        (d) => {
          d.collections[name] = d.collections[name].filter((x) => x.id !== id);
        },
        { type: 'remove', collection: name, id },
      );
    },

    getSettings() {
      assertReady();
      return structuredClone(doc.settings);
    },

    saveSettings(patch) {
      commit(
        (d) => {
          d.settings = { ...d.settings, ...structuredClone(patch) };
        },
        { type: 'settings' },
      );
      return structuredClone(doc.settings);
    },

    getMeta() {
      assertReady();
      return structuredClone(doc.meta);
    },

    markBackup() {
      commit(
        (d) => {
          d.meta.lastBackupAt = iso();
        },
        { type: 'meta' },
      );
    },

    exportDocument() {
      assertReady();
      return structuredClone(doc);
    },

    /**
     * Check, migrate and validate a parsed backup without writing anything.
     * Returns { doc, summary } for the import preview.
     */
    prepareImport(input) {
      if (!input || typeof input !== 'object') throw new ImportError('The file is not a backup document.');
      if (input.app !== appId) throw new ImportError('This backup belongs to a different app.');
      const migrated = migrateDoc(input);
      const counts = {};
      let newest = null;
      for (const name of Object.keys(collections)) {
        const list = migrated.collections[name];
        counts[name] = list.length;
        list.forEach((r, i) => {
          if (!r || typeof r.id !== 'string') throw new ImportError(`${name} #${i + 1} has no id.`);
          const errs = def(name).validate ? def(name).validate(r) : [];
          if (errs.length) throw new ImportError(`${name} #${i + 1}: ${errs.join('; ')}`);
          if (r.updatedAt && (!newest || r.updatedAt > newest)) newest = r.updatedAt;
        });
      }
      return { doc: migrated, summary: { counts, newest, exportedAt: migrated.updatedAt } };
    },

    /** mode "replace" keeps a safety copy; "merge" matches by id and keeps the newer updatedAt. */
    importDocument(input, { mode = 'merge' } = {}) {
      const { doc: incoming } = this.prepareImport(input);
      if (mode === 'replace') {
        adapter.write(`${storageKey}.pre-import`, JSON.stringify(doc));
        commit(
          (d) => {
            d.settings = incoming.settings;
            d.collections = incoming.collections;
            d.meta = { ...d.meta, lastBackupAt: incoming.meta?.lastBackupAt ?? d.meta.lastBackupAt };
          },
          { type: 'import', mode },
        );
        return;
      }
      if (mode !== 'merge') throw new Error(`Unknown import mode "${mode}"`);
      commit(
        (d) => {
          for (const name of Object.keys(collections)) {
            const byId = new Map(d.collections[name].map((r) => [r.id, r]));
            for (const r of incoming.collections[name]) {
              const mine = byId.get(r.id);
              if (!mine || (r.updatedAt || '') > (mine.updatedAt || '')) byId.set(r.id, r);
            }
            d.collections[name] = [...byId.values()];
          }
        },
        { type: 'import', mode },
      );
    },

    hasUndoImport() {
      return adapter.read(`${storageKey}.pre-import`) != null;
    },

    undoImport() {
      const raw = adapter.read(`${storageKey}.pre-import`);
      if (raw == null) return false;
      const restored = migrateDoc(JSON.parse(raw));
      commit(
        (d) => {
          d.settings = restored.settings;
          d.collections = restored.collections;
          d.meta = restored.meta;
        },
        { type: 'import', mode: 'undo' },
      );
      adapter.remove(`${storageKey}.pre-import`);
      return true;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
