// Google Drive store: one JSON file in the app's hidden appDataFolder, via the Drive v3 REST API.
// Same interface as the in-memory fake used in tests: read() and write(doc, expectedVersion).
import { DriveConflictError, DriveAuthError, DriveOfflineError, DriveError } from './errors.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export function createDriveStore({ getToken, fileName, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  let knownFileId = null; // remembered from read(), so write() can check the version without listing again

  async function call(url, init = {}) {
    const token = getToken();
    if (!token) throw new DriveAuthError();
    let res;
    try {
      res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    } catch {
      throw new DriveOfflineError();
    }
    if (res.status === 401) throw new DriveAuthError();
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch {
        /* no body */
      }
      // the Drive permission was unticked on Google's consent screen: signing in again fixes it
      if (res.status === 403 && /insufficient|scope/i.test(detail)) throw new DriveAuthError('Google Drive access was not granted.');
      throw new DriveError(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res;
  }

  async function findFile() {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,version)&orderBy=modifiedTime desc&pageSize=10`);
    const { files = [] } = await res.json();
    return files[0] || null;
  }

  async function currentFile(id) {
    try {
      const res = await call(`${API}/files/${id}?fields=id,version,trashed`);
      const f = await res.json();
      return f.trashed ? null : f;
    } catch (e) {
      if (e instanceof DriveError && e.message.includes("error 404")) return null;
      throw e;
    }
  }

  return {
    async read() {
      const f = await findFile();
      knownFileId = f ? f.id : null;
      if (!f) return null;
      const res = await call(`${API}/files/${f.id}?alt=media`);
      return { doc: await res.json(), version: String(f.version) };
    },

    /**
     * Write the document if the file is still at `expectedVersion` (null = no file yet).
     * Drive v3 has no conditional update, so the version is re-checked just before writing;
     * a mismatch throws DriveConflictError and the sync service retries.
     */
    async write(doc, expectedVersion) {
      const f = knownFileId ? await currentFile(knownFileId) : await findFile();
      const current = f ? String(f.version) : null;
      if (current !== (expectedVersion == null ? null : String(expectedVersion))) throw new DriveConflictError();
      const body = JSON.stringify(doc);
      let res;
      if (!f) {
        const boundary = `apj${Date.now().toString(36)}`;
        const meta = JSON.stringify({ name: fileName, parents: ['appDataFolder'], mimeType: 'application/json' });
        const multipart =
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipart,
        });
      } else {
        res = await call(`${UPLOAD}/files/${f.id}?uploadType=media&fields=id,version`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      }
      const saved = await res.json();
      knownFileId = saved.id || knownFileId;
      return String(saved.version);
    },

    /** The connected account's e-mail (shown in Settings). */
    async accountEmail() {
      const res = await call(`${API}/about?fields=user(emailAddress)`);
      return (await res.json())?.user?.emailAddress || null;
    },
  };
}
