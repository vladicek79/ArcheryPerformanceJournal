// Export / import of the whole document as JSON (ARCHITECTURE §8).
import { APP_ID, BACKUP_REMINDER_DAYS } from '../config.js';

export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${APP_ID}-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

export function serialiseBackup(doc) {
  return JSON.stringify(doc, null, 2);
}

/** Parse a backup file's text. Throws a readable error for non-JSON input. */
export function parseBackup(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
}

export function needsBackupReminder(lastBackupAt, now = new Date(), days = BACKUP_REMINDER_DAYS) {
  if (!lastBackupAt) return true;
  return now.getTime() - Date.parse(lastBackupAt) > days * 24 * 3600 * 1000;
}

/**
 * Share the backup via the Android share sheet when possible, else download it.
 * Returns true when the backup was handed off (sets meta.lastBackupAt).
 */
export async function exportBackup(repo) {
  const name = backupFileName();
  const json = serialiseBackup(repo.exportDocument());
  const file = new File([json], name, { type: 'application/json' });
  let shared = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      shared = true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      // Chrome on Android refuses some file types ("NotAllowedError: Permission denied"): download instead
    }
  }
  if (!shared) download(file, name);
  repo.markBackup();
  return true;
}

function download(file, name) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
