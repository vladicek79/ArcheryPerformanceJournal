// Pure merge of the synced part of two journal documents (local and the copy in Google Drive).
//
// Rules:
// - Records are matched by id per collection; the copy with the newer updatedAt wins as a whole
//   (ties keep the local copy). Deletion markers ({ deleted: true }) take part like any record,
//   so a deletion beats older edits and a newer edit beats an older deletion.
// - Deletion markers older than the retention period are dropped.
// - Remote records that fail validation are skipped (counted in `skipped`).
// - updatedAt more than CLOCK_SKEW_MS in the future (a device with a wrong clock) is clamped to now.
// - Synced settings (the gear setup) are merged as one unit by meta.settingsUpdatedAt.

const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** True when `a` should replace `b`: newer updatedAt; on a tie, a fixed order of the content so both devices pick the same copy. */
function newer(a, b) {
  const ta = a.updatedAt || '';
  const tb = b.updatedAt || '';
  if (ta !== tb) return ta > tb;
  return JSON.stringify(a) > JSON.stringify(b);
}
const DAY_MS = 24 * 3600 * 1000;

/** The synced payload of a document: what is written to Drive and compared between sides. */
export function syncedPayload(doc, { collectionNames, syncedSettingKeys }) {
  const collections = {};
  for (const name of collectionNames) {
    collections[name] = [...(doc.collections?.[name] || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  const settings = {};
  for (const k of syncedSettingKeys) if (doc.settings && k in doc.settings) settings[k] = doc.settings[k];
  return { collections, settings, settingsUpdatedAt: doc.meta?.settingsUpdatedAt ?? null };
}

export function samePayload(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge `remote` into `local` (both synced payloads). Returns { payload, skipped }.
 * `validate(name, record)` returns a list of errors for a live (non-deleted) record.
 */
export function mergePayloads(local, remote, { collectionNames, validate, now, retentionDays }) {
  const nowMs = now().getTime();
  const nowIso = new Date(nowMs).toISOString();
  const purgeBefore = new Date(nowMs - retentionDays * DAY_MS).toISOString();
  let skipped = 0;

  const clamp = (r) => {
    if (r.updatedAt && Date.parse(r.updatedAt) > nowMs + CLOCK_SKEW_MS) return { ...r, updatedAt: nowIso };
    return r;
  };

  const collections = {};
  for (const name of collectionNames) {
    const byId = new Map();
    for (const r of local.collections[name] || []) byId.set(r.id, clamp(r));
    for (const raw of remote?.collections[name] || []) {
      if (!raw || typeof raw.id !== 'string') {
        skipped += 1;
        continue;
      }
      if (!raw.deleted && validate(name, raw).length) {
        skipped += 1;
        continue;
      }
      const r = clamp(raw);
      const mine = byId.get(r.id);
      if (!mine || newer(r, mine)) byId.set(r.id, r);
    }
    collections[name] = [...byId.values()]
      .filter((r) => !(r.deleted && (r.deletedAt || r.updatedAt || '') < purgeBefore))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  const remoteNewer = remote && (remote.settingsUpdatedAt || '') > (local.settingsUpdatedAt || '');
  const settings = remoteNewer ? remote.settings : local.settings;
  const settingsUpdatedAt = remoteNewer ? remote.settingsUpdatedAt : local.settingsUpdatedAt;

  return { payload: { collections, settings, settingsUpdatedAt }, skipped };
}
