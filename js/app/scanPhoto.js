// Keeping the raw picture of a Scan (Settings › Scan): the camera frame the arrows were read from,
// or the photo taken with Photo, without the marks drawn over it, so a reading can be checked later.
// Where it goes (settings.scanPhotos, this device only):
//   'photos'    Google Photos, an album of the app's own (photosUploader.js); queued on the phone
//               until it can be uploaded. The default.
//   'download'  a file downloaded to the phone (the gallery shows the Download folder); each one
//               leaves a browser notification behind
//   'off'       not kept
// A photo picked from the gallery is already there and is not saved again.

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const JPEG_QUALITY = 0.92;
export const SCAN_PHOTO_MODES = ['photos', 'download', 'off'];

/**
 * Where the pictures of a Scan go. Before the choice existed there was an on / off switch
 * (saveScanPhotos, on by default): off stays off, otherwise Google Photos.
 */
export function scanPhotoMode(settings) {
  if (SCAN_PHOTO_MODES.includes(settings?.scanPhotos)) return settings.scanPhotos;
  return settings?.saveScanPhotos === false ? 'off' : 'photos';
}

/** `archery-scan-2026-11-19_14-05-09-40t.jpg`: sorts by time, and says which face was scanned. */
export function scanPhotoName({ face, type = 'image/jpeg', date = new Date() }) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  const time = `${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  const sheet = String(face ?? '').replace(/[^a-z0-9]+/gi, '');
  return `archery-scan-${day}_${time}${sheet ? `-${sheet}` : ''}.${EXTENSIONS[type] || 'jpg'}`;
}

/** The picture of a Scan as a blob: a canvas (the camera frame) as JPEG, a photo file as it is. */
function blobOf({ canvas, file }) {
  if (file) return Promise.resolve(file);
  return new Promise((done) => canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY));
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Keep the picture of a Scan ({ canvas } or { file }) as `mode` says: queued for Google Photos
 * (`upload(name, blob)`), downloaded, or not at all. Best effort: a Scan goes on whether or not the
 * picture could be kept. Resolves with the file name, or null when nothing was kept.
 */
export async function saveScanPhoto(source, { face, mode = 'photos', upload = null, date = new Date() } = {}) {
  if (mode === 'off' || (mode === 'photos' && !upload)) return null;
  try {
    const blob = await blobOf(source);
    if (!blob) return null;
    const name = scanPhotoName({ face, type: blob.type, date });
    if (mode === 'photos') await upload(name, blob);
    else download(blob, name);
    return name;
  } catch (err) {
    console.error(err);
    return null;
  }
}
