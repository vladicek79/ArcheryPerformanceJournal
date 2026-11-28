// The interval ("Tabata") timer screen for a timed SPT drill: a full-screen countdown through the
// drill's holds and rests (see ../tabata.js for the plan). The whole screen takes the colour of the
// phase (amber: get ready, green: hold, dark: rest) so it can be read from the corner of the eye at
// full draw. It beeps and buzzes at every change and on the last three seconds of a phase, so it can
// be followed without looking (the toggle at the top silences both), and keeps the screen awake
// while it is open. Nothing is stored but the sound choice. When the drill ends it shows Done for a
// moment (the finish beeps play) and closes by itself, back to the session form.
import { h, s } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { tabataPlan, tabataAt, tabataStartOf, tabataClock } from '../tabata.js';
import { hourMinute } from '../sessionTypes.js';

const PHASE_NAMES = { prepare: 'Get ready', work: 'Hold', rest: 'Rest', setRest: 'Rest between sets' };

const AUTO_CLOSE_MS = 1200; // Done stays this long (the finish beeps take ~0.6 s), then the timer closes

const RING_R = 132;
const RING_C = 2 * Math.PI * RING_R; // the ring's length: its dash offset empties it

// beeps and vibration on or off, kept per device (a convenience: on when it cannot be read)
const SOUND_KEY = 'apl.tabataSound';
const readSound = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
};
const writeSound = (on) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* not kept: the choice lasts while the timer is open */
  }
};

/** A filled 24-unit icon (the transport controls), hidden from assistive technology. */
const solid = (d, size = 24) =>
  s(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' },
    s('path', { d }),
  );
const ICONS = {
  back: () => solid('M6 5h2v14H6zM20 5v14L9 12z'),
  skip: () => solid('M16 5h2v14h-2zM4 5v14l11-7z'),
  pause: () => solid('M6 4h4v16H6zM14 4h4v16h-4z', 34),
  play: () => solid('M7 4l13 8-13 8z', 34),
  soundOn: () =>
    s(
      'svg',
      {
        width: 20,
        height: 20,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      },
      s('path', { d: 'M4 9v6h4l5 4V5L8 9z' }),
      s('path', { d: 'M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11' }),
    ),
  soundOff: () =>
    s(
      'svg',
      {
        width: 20,
        height: 20,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      },
      s('path', { d: 'M4 9v6h4l5 4V5L8 9z' }),
      s('path', { d: 'M17 9l5 6M22 9l-5 6' }),
    ),
};

/** "Hold 10 s · rep 5", "Rest 10 s": what a phase is, for the "Next ·" line. */
const phaseLabel = (p) => `${PHASE_NAMES[p.kind]} ${p.sec} s${p.kind === 'work' ? ` · rep ${p.rep}` : ''}`;

/**
 * Open the timer for a drill. `work` and `rest` in seconds.
 * Resolves with { completed } when it is closed: true when the drill ran to its end.
 */
export function tabataTimer({ title, work, rest, reps, sets }) {
  return new Promise((resolve) => {
    const plan = tabataPlan({ work, rest, reps, sets });
    const returnFocus = document.activeElement;
    let closed = false;
    let running = true;
    let elapsed = 0; // ms run so far, pauses left out
    let last = performance.now();
    let frame = 0;
    let shown = { index: -1, sec: -1, done: false };
    let wakeLock = null;
    let autoClose = 0;
    let soundOn = readSound();

    // --- sound: short beeps from an oscillator (no audio files). Created here, inside the tap
    // that opened the timer, which is what lets a phone play it.
    let audio = null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio = Ctx ? new Ctx() : null;
    } catch {
      audio = null;
    }
    const beep = (freq, ms, gain = 0.25) => {
      if (!audio || !soundOn) return;
      try {
        if (audio.state === 'suspended') audio.resume();
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = audio.currentTime;
        vol.gain.setValueAtTime(gain, t0);
        vol.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
        osc.connect(vol);
        vol.connect(audio.destination);
        osc.start(t0);
        osc.stop(t0 + ms / 1000 + 0.02);
      } catch {
        /* no sound on this device */
      }
    };
    const buzz = (pattern) => {
      if (soundOn && navigator.vibrate) navigator.vibrate(pattern);
    };

    // --- the screen
    const sub = h('span', { class: 'tabata-sub' });
    const soundBtn = h('button', {
      type: 'button',
      class: 'tabata-icon',
      'aria-label': 'Beeps and vibration',
      dataset: { fk: 'tabata-sound' },
      onClick: () => {
        soundOn = !soundOn;
        writeSound(soundOn);
        showSound();
      },
    });
    const progress = h('div', { class: 'tabata-progress-fill' });
    const phaseName = h('p', { class: 'tabata-phase', role: 'status', 'aria-live': 'assertive' });
    const repLine = h('p', { class: 'tabata-rep' });
    const ringFill = s('circle', {
      class: 'tabata-ring-fill',
      cx: 145,
      cy: 145,
      r: RING_R,
      'stroke-dasharray': RING_C.toFixed(1),
    });
    const secLeft = h('span', { class: 'tabata-sec', role: 'timer' });
    const ofLine = h('span', { class: 'tabata-of' });
    const pills = h('div', { class: 'tabata-pills', role: 'img' });
    const nextValue = h('strong');
    const nextLine = h('p', { class: 'tabata-next' }, 'Next · ', nextValue);

    const roundBtn = (cls, label, fk, onClick) =>
      h('button', {
        type: 'button',
        class: `tabata-round ${cls}`,
        'aria-label': label,
        dataset: { fk },
        onClick,
      });
    const backBtn = roundBtn('tabata-round--side', 'Back to previous phase', 'tabata-back', () => jump(-1));
    backBtn.append(ICONS.back());
    const skipBtn = roundBtn('tabata-round--side', 'Skip to next phase', 'tabata-skip', () => jump(1));
    skipBtn.append(ICONS.skip());
    const pauseBtn = roundBtn('tabata-round--main', 'Pause', 'tabata-pause', () => toggle());

    const dialog = h(
      'dialog',
      { class: 'tabata', 'aria-label': `${title}: interval timer` },
      h(
        'header',
        { class: 'tabata-top' },
        h(
          'button',
          {
            type: 'button',
            class: 'tabata-icon',
            'aria-label': 'Close the timer',
            dataset: { fk: 'tabata-close' },
            onClick: () => finish(shown.done),
          },
          APL.Icon({ name: 'close', strokeWidth: 2.2 }),
        ),
        h('div', { class: 'tabata-heading' }, h('span', { class: 'tabata-title' }, title), sub),
        soundBtn,
      ),
      h('div', { class: 'tabata-progress', 'aria-hidden': 'true' }, progress),
      phaseName,
      repLine,
      h(
        'div',
        { class: 'tabata-ring' },
        s(
          'svg',
          { width: 290, height: 290, viewBox: '0 0 290 290', 'aria-hidden': 'true' },
          s('circle', { class: 'tabata-ring-track', cx: 145, cy: 145, r: RING_R }),
          ringFill,
        ),
        h('div', { class: 'tabata-ring-center' }, secLeft, ofLine),
        h('span', { class: 'tabata-paused', 'aria-hidden': 'true' }, 'PAUSED'),
      ),
      pills,
      nextLine,
      h('div', { class: 'tabata-controls' }, backBtn, pauseBtn, skipBtn),
    );

    function showSound() {
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      soundBtn.replaceChildren(soundOn ? ICONS.soundOn() : ICONS.soundOff());
    }

    function setPauseLabel(done) {
      const label = done ? 'Close' : running ? 'Pause' : 'Resume';
      pauseBtn.setAttribute('aria-label', label);
      pauseBtn.replaceChildren(
        done ? h('span', { class: 'tabata-round-text' }, 'Close') : running ? ICONS.pause() : ICONS.play(),
      );
    }

    // the ring: full at the start of a phase, empty at its end (`left` 0…1); a jump to a new phase
    // refills it at once instead of sweeping back
    function setRing(left, jumpTo) {
      if (jumpTo) {
        ringFill.style.transition = 'none';
        ringFill.getBoundingClientRect();
      }
      ringFill.style.strokeDashoffset = (RING_C * (1 - left)).toFixed(1);
      if (jumpTo) requestAnimationFrame(() => (ringFill.style.transition = ''));
    }

    // one pill per hold of the set: done ones filled, the current one wide, the rest outlined
    function setPills(p, done) {
      const doneCount = done ? plan.reps : p.kind === 'work' ? p.rep - 1 : p.kind === 'prepare' ? 0 : p.rep;
      const current = !done && p.kind === 'work' ? p.rep : 0;
      pills.replaceChildren(
        ...Array.from({ length: plan.reps }, (_, k) =>
          h('span', {
            class: ['tabata-pill', k < doneCount && 'is-done', k + 1 === current && 'is-current'],
          }),
        ),
      );
      const ofSet = plan.sets > 1 && !done ? ` in set ${p.set} of ${plan.sets}` : '';
      pills.setAttribute('aria-label', `${doneCount} of ${plan.reps} holds done${ofSet}`);
    }

    function render() {
      const at = tabataAt(plan, elapsed);
      const sec = Math.ceil(at.leftMs / 1000);
      if (at.done) {
        if (!shown.done) {
          shown = { index: at.index, sec: 0, done: true };
          running = false;
          dialog.dataset.phase = 'done';
          dialog.classList.remove('is-paused');
          phaseName.textContent = 'Done';
          repLine.textContent = `${plan.sets > 1 ? `${plan.sets} sets × ` : ''}${plan.reps} ${plan.reps === 1 ? 'hold' : 'holds'} of ${work} s`;
          secLeft.textContent = '0';
          ofLine.textContent = 'drill complete';
          sub.textContent = `Finished at ${hourMinute(new Date())}`;
          progress.style.width = '100%';
          nextLine.hidden = true;
          setRing(1, true);
          setPills(at.phase, true);
          skipBtn.disabled = true;
          backBtn.disabled = false;
          setPauseLabel(true);
          beep(880, 180);
          setTimeout(() => beep(1175, 420), 200);
          buzz([120, 80, 300]);
          autoClose = setTimeout(() => finish(true), AUTO_CLOSE_MS);
        }
        return;
      }
      const p = at.phase;
      if (at.index !== shown.index || shown.done) {
        // a new phase: its name, colour and a signal (high for a hold, low for a rest)
        const first = shown.index === -1;
        shown = { index: at.index, sec, done: false };
        dialog.dataset.phase = p.kind;
        phaseName.textContent = PHASE_NAMES[p.kind];
        repLine.textContent =
          p.kind === 'prepare'
            ? 'Draw up when it turns green'
            : `Rep ${p.rep} of ${plan.reps}${plan.sets > 1 ? ` · set ${p.set} of ${plan.sets}` : ''}`;
        ofLine.textContent = `of ${p.sec} s`;
        const next = plan.phases[at.index + 1];
        nextValue.textContent = next ? phaseLabel(next) : 'Finished';
        nextLine.hidden = false;
        setPills(p, false);
        setRing(at.leftMs / (p.sec * 1000), true);
        skipBtn.disabled = false;
        setPauseLabel(false);
        if (!first) {
          beep(p.kind === 'work' ? 988 : 523, 420);
          buzz(p.kind === 'work' ? [250] : [90, 60, 90]);
        }
      } else {
        if (sec !== shown.sec) {
          shown.sec = sec;
          // the last three seconds of a phase tick
          if (sec <= 3 && sec >= 1 && running) beep(660, 90, 0.18);
        }
        setRing(at.leftMs / (p.sec * 1000), false);
      }
      backBtn.disabled = at.index === 0 && elapsed < 1000;
      secLeft.textContent = String(sec);
      const ends = new Date(Date.now() + at.totalLeftMs);
      sub.textContent = `${tabataClock(at.totalLeftMs)} left · ends ${hourMinute(ends)}`;
      progress.style.width = `${Math.round((1 - at.totalLeftMs / (plan.totalSec * 1000)) * 1000) / 10}%`;
    }

    function tick() {
      if (closed) return;
      const now = performance.now();
      if (running) elapsed += now - last;
      last = now;
      render();
      frame = setTimeout(tick, 100);
    }

    function toggle() {
      if (shown.done) {
        finish(true);
        return;
      }
      running = !running;
      last = performance.now();
      setPauseLabel(false);
      dialog.classList.toggle('is-paused', !running);
    }

    // Skip: on to the next phase. Back: to the start of this phase, or of the one before when this
    // one has only just begun.
    function jump(dir) {
      const at = tabataAt(plan, elapsed);
      let index = at.done ? plan.phases.length : at.index;
      if (dir > 0) index += 1;
      else if (at.done || at.phase.sec * 1000 - at.leftMs < 1500) index -= 1;
      elapsed = tabataStartOf(plan, index);
      if (shown.done) {
        clearTimeout(autoClose); // back from Done: the timer stays open
        running = true;
        dialog.classList.remove('is-paused');
      }
      shown = { index: -2, sec: -1, done: false };
      last = performance.now();
      render();
    }

    async function keepAwake() {
      try {
        wakeLock = (await navigator.wakeLock?.request('screen')) || null;
      } catch {
        wakeLock = null; // not supported, or refused: the timer still works
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !closed) keepAwake();
    };

    function finish(completed) {
      if (closed) return;
      closed = true;
      clearTimeout(frame);
      clearTimeout(autoClose);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release?.().catch(() => {});
      audio?.close?.().catch(() => {});
      dialog.close();
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve({ completed });
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(shown.done);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });

    showSound();
    document.body.append(dialog);
    dialog.showModal();
    document.addEventListener('visibilitychange', onVisible);
    keepAwake();
    pauseBtn.focus({ preventScroll: true });
    tick();
  });
}
