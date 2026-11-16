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
  {
    // v6: sight marks belong to a gear setup (1:1). The sightMarks collection becomes the `sights`
    // list of the current setup (settings.gear.sights); every saved setup gets a copy of it, since
    // the marks applied to all of them until now. Blank rows are dropped; sessions are unchanged.
    from: 5,
    to: 6,
    up(doc) {
      const { sightMarks, ...collections } = doc.collections || {};
      const { sightsSeeded: _seeded, ...settings } = doc.settings || {};
      const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
      const dist = (m) => {
        const n = parseInt(m.distance, 10);
        return Number.isFinite(n) ? n : 9999;
      };
      const marks = (sightMarks || [])
        .filter((m) => m && !m.deleted && !m.trashedAt)
        .map((m) => ({ id: String(m.id), distance: text(m.distance), elevation: text(m.elevation), windage: text(m.windage), note: text(m.note) }))
        .filter((m) => [m.distance, m.elevation, m.windage, m.note].some((v) => v.trim()))
        .sort((a, b) => dist(a) - dist(b));
      // none typed in: the setups show the default distances, as on a fresh install
      if (!marks.length) return { ...doc, settings, collections };
      const withMarks = (fields) => (Array.isArray(fields?.sights) ? fields : { ...(fields || {}), sights: structuredClone(marks) });
      collections.gearSnapshots = (collections.gearSnapshots || []).map((sn) => (sn.deleted ? sn : { ...sn, fields: withMarks(sn.fields) }));
      return { ...doc, settings: { ...settings, gear: withMarks(settings.gear) }, collections };
    },
  },
  {
    // v7: gear setups. Saved snapshots become the `setups` collection and the working copy on the Gear
    // tab (settings.gear) goes: a setup is the only place equipment lives, one of them is active
    // (settings.activeSetupId, synced). A working copy with content that differs from the snapshot it
    // was loaded from becomes the setup "My setup". Its id and time are fixed (not random), so every
    // device migrating the same synced gear makes the same record and sync keeps one. Sight marks are
    // already per setup (v6). Sessions are unchanged: their copy of the gear and gearSnapshotId stay.
    from: 6,
    to: 7,
    up(doc) {
      const { gearSnapshots, ...collections } = doc.collections || {};
      const { gear, activeSnapshotId, loadedSnapshotId, ...settings } = doc.settings || {};
      const setups = (gearSnapshots || []).map((sn) => {
        if (!sn || sn.deleted) return sn;
        const { date: _date, ...rest } = sn;
        return { ...rest, fields: sn.fields && typeof sn.fields === 'object' ? sn.fields : {} };
      });
      const live = setups.filter((s) => s && !s.deleted);
      const byId = (id) => (id ? live.find((s) => s.id === id) : undefined);

      const text = (v) => String(v ?? '').trim();
      const marks = (f) =>
        (Array.isArray(f?.sights) ? f.sights : [])
          .map((m) => [text(m?.distance), text(m?.elevation), text(m?.windage), text(m?.note)])
          .filter((m) => m.some(Boolean))
          .map((m) => m.join('|'))
          .sort();
      const values = (f) =>
        Object.keys(f || {})
          .filter((k) => k !== 'sights' && text(f[k]))
          .sort()
          .map((k) => `${k}=${text(f[k])}`);
      const content = (f) => JSON.stringify([values(f), marks(f)]);
      const hasContent = values(gear).length > 0 || marks(gear).length > 0;

      const loaded = byId(loadedSnapshotId ?? activeSnapshotId);
      let created = null;
      if (hasContent && !(loaded && content(loaded.fields) === content(gear))) {
        const taken = new Set(live.map((s) => text(s.name).toLowerCase()));
        let name = 'My setup';
        for (let i = 2; taken.has(name.toLowerCase()); i += 1) name = `My setup ${i}`;
        const at = doc.meta?.settingsUpdatedAt || doc.updatedAt || doc.meta?.createdAt || '2026-01-01T00:00:00.000Z';
        created = { id: 'migrated-v7', createdAt: at, updatedAt: at, name, fields: structuredClone(gear) };
        setups.push(created);
      }

      const newest = [...live].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
      const sameAsLoaded = loaded && !created && hasContent ? loaded : null;
      const active = byId(activeSnapshotId) || created || sameAsLoaded || newest || null;
      return {
        ...doc,
        settings: { ...settings, activeSetupId: active ? active.id : null },
        collections: { ...collections, setups },
      };
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
