// Scan photos to Google Photos: the queued pictures (photoQueue.js) are uploaded one by one into an
// album the app creates ("Archery scans"), through the Photos Library REST API, called straight
// from the browser with the Google sign-in's token. It needs the photoslibrary.appendonly scope,
// which only lets the app add new photos and albums: it can never see or change the rest of the
// library.
//
// A picture leaves the queue only once Google Photos has it. Without a token (signed out, expired,
// offline) the queue simply waits; drain() is called again when things change.

export const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photoslibrary.appendonly';
export const ALBUM_TITLE = 'Archery scans';
const API = 'https://photoslibrary.googleapis.com/v1';

/**
 * Why an upload stopped: 'auth' (no token, or it expired) · 'scope' (Photos not allowed) · 'offline'
 * · 'error' (with the HTTP `status`) · 'refused' (Google Photos would not take this one picture).
 */
export class PhotosError extends Error {
  constructor(kind, message = kind) {
    super(message);
    this.kind = kind;
  }
}

/**
 * @param deps.queue        the photo queue (add, list, remove, count)
 * @param deps.getToken     () → a valid access token or null
 * @param deps.getAlbumId   () → the id of the app's album, or null
 * @param deps.setAlbumId   (id) → remember it (null to forget it)
 * @param deps.onChange     called when the queue or the state changes (optional)
 * @param deps.fetchImpl    fetch (tests pass a fake)
 */
export function createPhotosUploader({ queue, getToken, getAlbumId, setAlbumId, onChange = () => {}, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  let state = { busy: false, error: null, uploaded: 0 };
  let running = null;
  let again = false;

  const set = (patch) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  async function call(path, init) {
    const token = getToken();
    if (!token) throw new PhotosError('auth');
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch {
      throw new PhotosError('offline');
    }
    if (res.status === 401) throw new PhotosError('auth');
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch {
        /* no body */
      }
      // 403 is also "the Photos Library API is not enabled in the Cloud project": only a missing
      // permission asks the user to allow it again
      if (res.status === 403 && /insufficient|scope/i.test(detail)) throw new PhotosError('scope', detail);
      const err = new PhotosError('error', `Google Photos error ${res.status}${detail ? `: ${detail}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  async function album() {
    const known = getAlbumId();
    if (known) return known;
    const res = await call('/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ album: { title: ALBUM_TITLE } }),
    });
    const { id } = await res.json();
    setAlbumId(id);
    return id;
  }

  /** Bytes first (an upload token comes back), then the media item, in the album. */
  async function uploadOne(item) {
    const up = await call('/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Content-Type': item.blob.type || 'image/jpeg',
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: item.blob,
    });
    const uploadToken = await up.text();
    const create = async (albumId) => {
      const res = await call('/mediaItems:batchCreate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(albumId ? { albumId } : {}), newMediaItems: [{ simpleMediaItem: { fileName: item.name, uploadToken } }] }),
      });
      const result = (await res.json()).newMediaItemResults?.[0];
      const code = result?.status?.code ?? 0;
      if (code !== 0) throw new PhotosError('refused', `Google Photos refused the photo: ${result?.status?.message || code}`);
    };
    try {
      await create(await album());
    } catch (e) {
      // the album was deleted in Google Photos (or is not ours any more): make a new one
      if (e instanceof PhotosError && e.kind === 'error' && e.status === 400 && getAlbumId()) {
        setAlbumId(null);
        await create(await album());
      } else throw e;
    }
  }

  async function drainOnce() {
    for (;;) {
      const [item] = await queue.list();
      if (!item) return;
      try {
        await uploadOne(item);
        set({ uploaded: state.uploaded + 1 });
      } catch (e) {
        // a picture Google Photos will never take must not hold up the ones behind it
        if (!(e instanceof PhotosError && e.kind === 'refused')) throw e;
        console.error(e);
      }
      await queue.remove(item.id);
    }
  }

  return {
    get state() {
      return state;
    },

    /** Upload whatever waits. One drain at a time; a call while busy runs one more round after it. */
    drain() {
      if (running) {
        again = true;
        return running;
      }
      if (!getToken()) return Promise.resolve(false);
      running = (async () => {
        set({ busy: true });
        let ok = true;
        do {
          again = false;
          try {
            await drainOnce();
            set({ error: null });
          } catch (e) {
            ok = false;
            set({ error: e instanceof PhotosError ? e : new PhotosError('error', String(e?.message || e)) });
            break;
          }
        } while (again);
        set({ busy: false });
        running = null;
        return ok;
      })();
      return running;
    },

    /** Queue a picture and start uploading it. */
    async add(name, blob) {
      await queue.add({ name, blob });
      onChange(state);
      this.drain();
    },

    pending: () => queue.count(),
  };
}
