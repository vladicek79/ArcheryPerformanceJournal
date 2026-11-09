// Ordered schema upgrade steps: { from, to, up(doc) → doc }.
// Add a step here and bump SCHEMA_VERSION in config.js when the document shape changes.
export const migrations = [];

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
