// Live camera scan of the target: the detector runs on the video a few times per second and its
// result (spot outlines, numbered arrows) is drawn over the live picture. When the same arrows stay
// in place for about a second the result locks by itself; "Take now" takes it at once. When to lock
// is decided by the steady reading of scan.js; this view runs the camera, the detector and the drawing.
// Nothing is recorded or stored: frames are analysed in memory and dropped.
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';
import * as APL from '../../ui/apl/index.js';
import { detectArrows } from '../photoDetect.js';
import { spotCentres } from '../scoring.js';
import { resultOffCrop, arrowMarkLayout } from '../scanGeometry.js';
import { createSteadyReading, nextLook } from '../scan.js';

const FRAME_MAX = 560; // frames are scaled to this many pixels on their long side for detection
const VIEW_MAX = 1280; // the overlay and the kept picture: the whole frame, up to this size
const TICK_MS = 120; // pause between analyses (each takes 0.2–0.6 s on a phone)

/** What the status line says for each kind of reading (see createSteadyReading). */
const STATUS = {
  lost: () => 'Fit the target in the frame.',
  empty: () => 'Target found. Looking for arrows…',
  partial: () => 'Show all the spots of the sheet (or Take now for this spot only).',
  reading: () => 'Reading the arrows…',
  holding: (r) => `${r.scores.join(' · ')}: hold steady…`,
};

/**
 * Mark the found arrows on a picture so the hit itself stays visible: nothing is drawn over the
 * point of impact; beside it (on a thin line that ends on the point, away from the shaft) is a label
 * with the score read there.
 */
export function drawArrowMarks(g, spots, arrows, labels, { hollow = false, active = -1, long = false } = {}) {
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
    const leader = () => {
      g.moveTo(p.x, p.y); // the line ends exactly on the point of impact, with nothing drawn over it
      g.lineTo(lx, ly);
    };
    // white under pink, so the marks show on any ring colour
    stroke('#ffffff', thin * 2.4, leader);
    stroke('#E5007E', thin, leader);
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
 *   { canvas, res }  the locked (or taken) frame and its detection result,
 *   { file }         a photo chosen instead (the Photo button), or
 *   null             closed without a result.
 */
export function liveScan({ face, maxArrows, spotHint = 0 }) {
  return new Promise((resolve) => {
    let closed = false;
    let stream = null;
    let worker = null;
    let timer = 0;
    let busy = false;
    let seq = 0;
    const reading = createSteadyReading({ face, maxArrows });

    const video = h('video', { class: 'live-video', playsinline: true, muted: true, autoplay: true });
    video.muted = true;
    const overlay = h('canvas', { class: 'live-overlay', 'aria-hidden': 'true' });
    const stage = h('div', { class: 'live-stage' }, video, overlay);
    const status = h('p', { class: 'live-status', role: 'status', 'aria-live': 'polite' }, 'Starting the camera…');
    const bar = h('div', { class: 'live-progress-bar' });
    const progress = h('div', { class: 'live-progress', 'aria-hidden': 'true' }, bar);
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      class: 'sr-only',
      tabindex: '-1',
      'aria-hidden': 'true',
      onChange: (e) => {
        const file = e.target.files?.[0];
        if (file) finish({ file });
      },
    });
    const takeBtn = APL.Button({ children: 'Take now', disabled: true, onClick: () => take(), fk: 'live-take' });
    const dialog = h(
      'dialog',
      { class: 'live-scan', 'aria-label': 'Scan the target with the camera' },
      h(
        'div',
        { class: 'live-top' },
        APL.IconButton({ icon: 'close', label: 'Close the camera', onClick: () => finish(null), fk: 'live-close' }),
      ),
      stage,
      progress,
      status,
      h(
        'div',
        { class: 'live-actions' },
        APL.Button({
          children: 'Photo',
          variant: 'secondary',
          leadingIcon: icons.camera(),
          onClick: () => fileInput.click(),
          fk: 'live-photo',
        }),
        takeBtn,
      ),
      fileInput,
    );

    // the frame being analysed, and a copy of the last analysed one (kept for the preview)
    const work = document.createElement('canvas');
    const wctx = work.getContext('2d', { willReadFrequently: true });
    const full = document.createElement('canvas'); // the whole frame of the moment being analysed
    const shot = document.createElement('canvas');
    const octx = overlay.getContext('2d');

    function finish(value) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      worker?.terminate();
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

    // --- detection: in a worker when possible, else on the main thread
    const waiting = new Map();
    try {
      worker = new Worker(new URL('../photoWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        waiting.get(e.data.id)?.(e.data.res);
        waiting.delete(e.data.id);
      };
      worker.onerror = () => {
        // module workers are not supported here: analyse on the main thread from now on
        worker?.terminate();
        worker = null;
        for (const done of waiting.values()) done({ error: 'retry' });
        waiting.clear();
      };
    } catch {
      worker = null;
    }
    const detect = (img) => {
      if (!worker) {
        const r = detectArrows(img, face, maxArrows, { spotHint });
        return Promise.resolve(r.error ? { error: r.error } : { partial: r.partial, spots: r.spots.map((s) => ({ outer: s.outer })), arrows: r.arrows });
      }
      return new Promise((done) => {
        const id = ++seq;
        waiting.set(id, done);
        worker.postMessage({ id, width: img.width, height: img.height, buffer: img.data.buffer, face, maxArrows, spotHint }, [img.data.buffer]);
      });
    };

    function draw(res, scores = [], hollow = false) {
      octx.clearRect(0, 0, overlay.width, overlay.height);
      // the scan frame: what is outside it is dimmed (and not looked at)
      if (frame) {
        octx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        octx.fillRect(0, 0, overlay.width, frame.y);
        octx.fillRect(0, frame.y + frame.h, overlay.width, overlay.height - frame.y - frame.h);
        octx.fillRect(0, frame.y, frame.x, frame.h);
        octx.fillRect(frame.x + frame.w, frame.y, overlay.width - frame.x - frame.w, frame.h);
        octx.lineWidth = Math.max(2, overlay.width / 240);
        octx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        octx.strokeRect(frame.x, frame.y, frame.w, frame.h);
      }
      if (!res || res.error) return;
      const line = Math.max(2, overlay.width / 200);
      octx.lineWidth = line;
      octx.strokeStyle = '#00e5ff';
      for (const s of res.spots) {
        octx.beginPath();
        octx.ellipse(s.outer.cx, s.outer.cy, s.outer.rx, s.outer.ry, s.outer.angle, 0, Math.PI * 2);
        octx.stroke();
      }
      drawArrowMarks(octx, res.spots, res.arrows, scores, { hollow });
    }

    function take() {
      const res = reading.take();
      if (!res) return;
      finish({ canvas: shot, res });
    }

    function onResult(res) {
      if (closed) return;
      if (!res.error) {
        // keep the analysed moment (the whole frame) for the preview
        shot.width = full.width;
        shot.height = full.height;
        shot.getContext('2d').drawImage(full, 0, 0);
      }
      const r = reading.read(res, performance.now());
      draw(r.show, r.scores, r.hollow);
      takeBtn.disabled = !r.canTake;
      bar.style.width = `${Math.round(r.progress * 100)}%`;
      status.textContent = STATUS[r.kind](r);
      if (r.locked) {
        if (navigator.vibrate) navigator.vibrate(40);
        take();
      }
    }

    // The part of the video frame that is analysed (video pixels). At first the whole frame; once the
    // spots are found, just the sheet around them, so the same number of analysed pixels covers the
    // target in much more detail (shafts a few pixels wide instead of one).
    let region = null;
    // The scan frame: a box in the shape of the selected sheet (one face: square; a triple: tall),
    // centred in the picture. Only what is inside it is analysed, so a second target hanging next
    // to this one is not read as well. In video pixels (`guide`) and overlay pixels (`frame`).
    const centres = spotCentres(face);
    const span = (k) => Math.max(...centres.map((c) => c[k])) - Math.min(...centres.map((c) => c[k])) + 230; // spot Ø 200 + margin
    const shape = span(0) / span(1); // width / height
    let guide = null;
    let frame = null;

    async function tick() {
      if (closed) return;
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        busy = true;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        // the overlay and the kept picture cover the whole frame
        const ko = Math.min(1, VIEW_MAX / Math.max(vw, vh));
        const ow = Math.round(vw * ko);
        const oh = Math.round(vh * ko);
        if (overlay.width !== ow || overlay.height !== oh) {
          overlay.width = ow;
          overlay.height = oh;
          full.width = ow;
          full.height = oh;
          stage.style.aspectRatio = `${ow} / ${oh}`;
          const gw = Math.min(0.96 * vw, 0.96 * vh * shape);
          guide = { x: Math.round((vw - gw) / 2), y: Math.round((vh - gw / shape) / 2), w: Math.round(gw), h: Math.round(gw / shape) };
          frame = { x: guide.x * ko, y: guide.y * ko, w: guide.w * ko, h: guide.h * ko };
          region = null;
          if (!reading.take()) draw(null); // no reading yet: just the scan frame
        }
        const r = region || guide;
        const k = Math.min(1, FRAME_MAX / Math.max(r.w, r.h));
        const w = Math.max(8, Math.round(r.w * k));
        const hgt = Math.max(8, Math.round(r.h * k));
        if (work.width !== w || work.height !== hgt) {
          work.width = w;
          work.height = hgt;
        }
        // the same moment twice: the analysed part, and the whole frame for the preview
        wctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, w, hgt);
        full.getContext('2d').drawImage(video, 0, 0, ow, oh);
        try {
          const res = await detect(wctx.getImageData(0, 0, w, hgt));
          if (res.error === 'retry') {
            // the worker gave up: nothing to show for this frame
          } else if (res.error) {
            region = null; // lost the target: look at the whole frame again
            onResult(res);
          } else {
            // analysed-part pixels → whole-frame overlay pixels
            const found = resultOffCrop(res, r, k, ko);
            // next time, analyse just the sheet (once every spot of it is seen)
            region = nextLook(found, guide, ko);
            onResult(found);
          }
        } catch (err) {
          console.error(err);
        }
        busy = false;
      }
      timer = setTimeout(tick, TICK_MS);
    }

    document.body.append(dialog);
    dialog.showModal();

    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      status.textContent = 'This browser has no camera access here. Use Photo instead.';
      return;
    }
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
        status.textContent = 'Fit the target in the frame.';
        tick();
      })
      .catch(() => {
        status.textContent = 'The camera is not available (permission refused or no camera). Use Photo instead.';
      });
  });
}
