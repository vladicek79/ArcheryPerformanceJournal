// Live camera for the Scan: the camera's picture with the scan frame over it (a box in the shape
// of the sheet), and Take photo. Nothing is read while the camera runs: the arrows are read once,
// from the photo taken, inside the frame (scan.js). Where the browser can (ImageCapture) the photo
// is taken at the camera's full resolution: far more detail than a video frame, which shows a shaft
// a few pixels wide; else the video frame of that moment is taken.
// Nothing is recorded or stored here. (The picture taken may be saved to the phone by the caller,
// see scanPhoto.js.)
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';
import * as APL from '../../ui/apl/index.js';
import { spotCentres } from '../scoring.js';
import { arrowMarkLayout, holePoints } from '../scanGeometry.js';

const VIEW_MAX = 1920; // the overlay: the whole frame, up to this size

/**
 * Mark the found arrows on a picture so the hit itself stays visible: the hole the arrow makes is
 * outlined at its real size (`arrowR`, a fraction of the spot's radius: the lines it touches decide
 * the score) with nothing drawn inside it; beside it (on a thin line from the hole's edge, away from
 * the shaft) is a label with the score read there.
 */
export function drawArrowMarks(g, spots, arrows, labels, { hollow = false, active = -1, long = false, arrowR = 0 } = {}) {
  const { width, height } = g.canvas;
  g.save();
  g.lineCap = 'round';
  arrows.forEach((a, i) => {
    const p = a.image;
    const { r, lx, ly } = arrowMarkLayout(width, height, spots, a, { long });
    const thin = Math.max(1.5, width / 320);
    const stroke = (colour, w, path) => {
      g.beginPath();
      path();
      g.strokeStyle = colour;
      g.lineWidth = w;
      g.stroke();
    };
    const outer = (spots[a.spot ?? 0] || spots[0]).outer;
    const holeR = arrowR * ((outer.rx + outer.ry) / 2); // in pixels, near enough for where the line starts
    const toLabel = Math.hypot(lx - p.x, ly - p.y) || 1;
    const leader = () => {
      g.moveTo(p.x + ((lx - p.x) / toLabel) * holeR, p.y + ((ly - p.y) / toLabel) * holeR);
      g.lineTo(lx, ly);
    };
    const hole = () => {
      holePoints(outer, a, arrowR).forEach((pt, idx) => (idx ? g.lineTo(pt.x, pt.y) : g.moveTo(pt.x, pt.y)));
      g.closePath();
    };
    // white under pink, so the marks show on any ring colour
    stroke('#ffffff', thin * 2.4, leader);
    stroke('#E5007E', thin, leader);
    if (arrowR > 0) {
      stroke('#ffffff', thin * 1.6, hole);
      stroke('#E5007E', thin * 0.8, hole);
    }
    if (i === active) {
      // the label being dragged: a halo around it
      g.beginPath();
      g.arc(lx, ly, r * 1.45, 0, Math.PI * 2);
      g.fillStyle = 'rgba(229, 0, 126, 0.3)';
      g.fill();
    }
    g.beginPath();
    g.arc(lx, ly, r, 0, Math.PI * 2);
    g.fillStyle = hollow ? 'rgba(229, 0, 126, 0.45)' : '#E5007E';
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = thin * 1.3;
    g.stroke();
    g.fillStyle = '#ffffff';
    const text = String(labels[i]);
    g.font = `700 ${Math.round(r * (text.length > 1 ? 1 : 1.2))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, lx, ly + 1);
  });
  g.restore();
}

/**
 * Open the live view. Resolves with
 *   { file, taken, guide }  the photo taken with Take photo: full size where the camera can take one
 *                    (ImageCapture), else the video frame of that moment (a canvas). `guide` is the
 *                    scan frame ({ x, y, w, h } in video pixels, with the video's { width, height }):
 *                    the arrows are read inside it (see guideInPhoto),
 *   { file, taken }  a photo chosen instead (`taken`: with Camera app just now; else picked with
 *                    Gallery), or
 *   null             closed without a result.
 */
export function liveScan({ face }) {
  return new Promise((resolve) => {
    let closed = false;
    let stream = null;

    const video = h('video', { class: 'live-video', playsinline: true, muted: true, autoplay: true });
    video.muted = true;
    const overlay = h('canvas', { class: 'live-overlay', 'aria-hidden': 'true' });
    const stage = h('div', { class: 'live-stage' }, video, overlay);
    const status = h('p', { class: 'live-status', role: 'status', 'aria-live': 'polite' }, 'Starting the camera…');
    // Camera app opens the phone's camera; Gallery (no capture) opens the phone's photos, for a
    // target photographed earlier
    const fileInput = (capture) =>
      h('input', {
        type: 'file',
        accept: 'image/*',
        ...(capture ? { capture: 'environment' } : {}),
        class: 'sr-only',
        tabindex: '-1',
        'aria-hidden': 'true',
        onChange: (e) => {
          const file = e.target.files?.[0];
          if (file) finish({ file, taken: capture });
        },
      });
    const cameraInput = fileInput(true);
    const galleryInput = fileInput(false);
    const takeBtn = APL.Button({ children: 'Take photo', leadingIcon: icons.camera(), disabled: true, onClick: () => take(), fk: 'live-take' });
    const dialog = h(
      'dialog',
      { class: 'live-scan', 'aria-label': 'Scan the target with the camera' },
      h(
        'div',
        { class: 'live-top' },
        APL.IconButton({ icon: 'close', label: 'Close the camera', onClick: () => finish(null), fk: 'live-close' }),
      ),
      stage,
      status,
      h(
        'div',
        { class: 'live-actions' },
        APL.Button({
          children: 'Camera app',
          variant: 'secondary',
          onClick: () => cameraInput.click(),
          fk: 'live-photo',
        }),
        APL.Button({
          children: 'Gallery',
          variant: 'secondary',
          leadingIcon: icons.gallery(),
          onClick: () => galleryInput.click(),
          fk: 'live-gallery',
        }),
        takeBtn,
      ),
      cameraInput,
      galleryInput,
    );
    const octx = overlay.getContext('2d');

    function finish(value) {
      if (closed) return;
      closed = true;
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

    // The scan frame: a box in the shape of the selected sheet (one face: square; a triple: tall),
    // centred in the picture. Only what is inside it is read, so a second target hanging next to
    // this one is not read as well. In video pixels (`guide`); the overlay is the video frame, up
    // to VIEW_MAX on its long side.
    const centres = spotCentres(face);
    const span = (k) => Math.max(...centres.map((c) => c[k])) - Math.min(...centres.map((c) => c[k])) + 230; // spot Ø 200 + margin
    const shape = span(0) / span(1); // width / height
    let guide = null;

    /** Fit the overlay and the scan frame to the video (again when its size changes: the phone turned). */
    function fit() {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const ko = Math.min(1, VIEW_MAX / Math.max(vw, vh));
      overlay.width = Math.round(vw * ko);
      overlay.height = Math.round(vh * ko);
      stage.style.aspectRatio = `${overlay.width} / ${overlay.height}`;
      const gw = Math.min(0.96 * vw, 0.96 * vh * shape);
      guide = { x: Math.round((vw - gw) / 2), y: Math.round((vh - gw / shape) / 2), w: Math.round(gw), h: Math.round(gw / shape), width: vw, height: vh };
      // what is outside the frame is dimmed (and not read)
      const f = { x: guide.x * ko, y: guide.y * ko, w: guide.w * ko, h: guide.h * ko };
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      octx.fillRect(0, 0, overlay.width, f.y);
      octx.fillRect(0, f.y + f.h, overlay.width, overlay.height - f.y - f.h);
      octx.fillRect(0, f.y, f.x, f.h);
      octx.fillRect(f.x + f.w, f.y, overlay.width - f.x - f.w, f.h);
      octx.lineWidth = Math.max(2, overlay.width / 240);
      octx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      octx.strokeRect(f.x, f.y, f.w, f.h);
      if (!taking) takeBtn.disabled = false;
      status.textContent = 'Fit the target in the frame, then Take photo.';
    }
    video.addEventListener('loadedmetadata', fit);
    video.addEventListener('resize', fit);

    let taking = false;
    /** Take the photo: full size where the camera can take one, else the video frame of this moment. */
    function take() {
      if (taking || !guide || !video.videoWidth) return;
      taking = true;
      takeBtn.disabled = true;
      const scope = { ...guide };
      const still = document.createElement('canvas');
      still.width = video.videoWidth;
      still.height = video.videoHeight;
      still.getContext('2d').drawImage(video, 0, 0);
      const useStill = () => finish({ file: still, taken: true, guide: scope });
      const track = stream?.getVideoTracks?.()[0];
      if (!track || typeof ImageCapture !== 'function') return useStill();
      status.textContent = 'Hold still: taking the photo…';
      // some cameras never answer: after a few seconds the video frame is taken instead
      const late = new Promise((_, no) => setTimeout(() => no(new Error('the camera did not take the photo')), 4000));
      Promise.race([new ImageCapture(track).takePhoto(), late]).then((blob) => finish({ file: blob, taken: true, guide: scope }), useStill);
    }

    document.body.append(dialog);
    dialog.showModal();

    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      status.textContent = 'This browser has no camera access here. Use Camera app or Gallery instead.';
      return;
    }
    media
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (closed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.play().catch(() => {});
        fit();
      })
      .catch(() => {
        status.textContent = 'The camera is not available (permission refused or no camera). Use Camera app or Gallery instead.';
      });
  });
}
