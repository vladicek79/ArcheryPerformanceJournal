// Ordered schema upgrade steps: { from, to, up(doc) → doc }.
// Add a step here and bump SCHEMA_VERSION in config.js when the document shape changes.
export const migrations = [
  {
    // v2: Google Drive sync. Adds the timestamp used to merge the synced settings
    // (gear setup) between devices. Deleted records may now be kept as markers
    // ({ id, deleted: true, deletedAt, updatedAt }); existing records are unchanged.
    from: 1,
    to: 2,
    up(doc) {
      return { ...doc, meta: { ...(doc.meta || {}), settingsUpdatedAt: doc.meta?.settingsUpdatedAt ?? null } };
    },
  },
  {
    // v3: session types (training, competition, strength, mental). Every existing session is a
    // training session. Older app versions refuse v3 data instead of dropping sessions they don't know.
    from: 2,
    to: 3,
    up(doc) {
      const sessions = (doc.collections?.sessions || []).map((s) => (s.deleted || s.type ? s : { ...s, type: 'training' }));
      return { ...doc, collections: { ...(doc.collections || {}), sessions } };
    },
  },
  {
    // v4: the blank bale session type. The data is unchanged; the version tells older app versions
    // (which would skip blank bale sessions on sync and so drop them from Drive) to refuse it.
    from: 3,
    to: 4,
    up(doc) {
      return { ...doc };
    },
  },
  {
    // v5: the manual session type. As in v4, only the version changes, so older app versions
    // refuse the data instead of dropping manual sessions on sync.
    from: 4,
    to: 5,
    up(doc) {
      return { ...doc };
    },
  },
];

export class NewerVersionError extends Error {
  constructor(found, supported) {
    super(`Data was written by a newer app version (schema ${found}, this app supports ${supported}). Reload to update the app.`);
    this.name = 'NewerVersionError';
  }
}

/** Upgrade `doc` step by step to `target`. Returns a new document; the input is not mutated. */
export function migrate(doc, target, steps = migrations) {
  let current = structuredClone(doc);
  let version = Number(current.schemaVersion || 1);
  if (version > target) throw new NewerVersionError(version, target);
  while (version < target) {
    const step = steps.find((s) => s.from === version);
    if (!step) throw new Error(`No migration from schema ${version}`);
    current = step.up(current);
    version = step.to;
    current.schemaVersion = version;
  }
  return current;
}
