// Scan the watch code: the camera looks for the QR code the Arrow Grades watch app shows after an
// end (see watchCode.js). Frames are read in memory and dropped; nothing is recorded or stored.
// The browser's own QR reader (BarcodeDetector, Chrome on Android) is used where there is one;
// elsewhere the bundled jsQR (js/vendor/jsQR.js) is loaded on first use.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { parseWatchCode, watchCodeProblem } from '../watchCode.js';

const TICK_MS = 150; // pause between looks at the camera picture
const FRAME_MAX = 720; // frames are scaled to this many pixels on their long side for jsQR

let jsQRLoading = null;
/** jsQR, loaded once as a classic script from the app's own files (CSP: script-src 'self'). */
function loadJsQR() {
  if (globalThis.jsQR) return Promise.resolve(globalThis.jsQR);
  jsQRLoading ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = new URL('../../vendor/jsQR.js', import.meta.url).href;
    el.onload = () => (globalThis.jsQR ? resolve(globalThis.jsQR) : reject(new Error('jsQR missing')));
    el.onerror = () => {
      jsQRLoading = null;
      reject(new Error('jsQR failed to load'));
    };
    document.head.append(el);
  });
  return jsQRLoading;
}

/** A QR reader for video frames: the browser's own, else jsQR. Resolves to (video) => text | null. */
async function qrReader() {
  if ('BarcodeDetector' in globalThis) {
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => {
          const codes = await detector.detect(video);
          return codes[0]?.rawValue ?? null;
        };
      }
    } catch {
      // fall through to jsQR
    }
  }
  const jsQR = await loadJsQR();
  const work = document.createElement('canvas');
  const g = work.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const k = Math.min(1, FRAME_MAX / Math.max(video.videoWidth, video.videoHeight));
    work.width = Math.round(video.videoWidth * k);
    work.height = Math.round(video.videoHeight * k);
    g.drawImage(video, 0, 0, work.width, work.height);
    const img = g.getImageData(0, 0, work.width, work.height);
    // the watch draws black on white; 'attemptBoth' also reads a light-on-dark picture
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

/**
 * Open the camera and read the watch code of an end. Resolves with the parsed code
 * ({ ok: true, end, arrows }, see parseWatchCode) or null when closed without one.
 */
export function watchScan() {
  return new Promise((resolve) => {
    let closed = false;
    let stream = null;
    let timer = 0;
    let read = null;

    const video = h('video', { class: 'live-video', playsinline: true, muted: true, autoplay: true });
    video.muted = true;
    const stage = h('div', { class: 'live-stage watch-stage' }, video, h('div', { class: 'watch-guide', 'aria-hidden': 'true' }));
    const status = h('p', { class: 'live-status', role: 'status', 'aria-live': 'polite' }, 'Starting the camera…');
    const dialog = h(
      'dialog',
      { class: 'live-scan watch-scan', 'aria-label': 'Scan the watch code' },
      h(
        'div',
        { class: 'live-top' },
        APL.IconButton({ icon: 'close', label: 'Close the camera', onClick: () => finish(null), fk: 'watch-close' }),
      ),
      stage,
      status,
    );

    function finish(value) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });

    async function tick() {
      if (closed) return;
      if (read && video.readyState >= 2 && video.videoWidth) {
        try {
          const text = await read(video);
          if (text != null) {
            const code = parseWatchCode(text);
            if (code.ok) {
              if (navigator.vibrate) navigator.vibrate(40);
              finish(code);
              return;
            }
            status.textContent = watchCodeProblem(code.error);
          }
        } catch (err) {
          console.error(err);
        }
      }
      timer = setTimeout(tick, TICK_MS);
    }

    document.body.append(dialog);
    dialog.showModal();

    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      status.textContent = 'This browser has no camera access here.';
      return;
    }
    qrReader()
      .then((r) => {
        read = r;
      })
      .catch(() => {
        status.textContent = 'The QR reader could not be loaded. Check the connection and try again.';
      });
    media
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (closed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.play().catch(() => {});
        status.textContent = 'Point the camera at the code on the watch.';
        tick();
      })
      .catch(() => {
        status.textContent = 'The camera is not available (permission refused or no camera).';
      });
  });
}
