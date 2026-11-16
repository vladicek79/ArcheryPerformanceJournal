// Session timers on screen: one ticker refreshes every visible `.timer-value` once a second, from the
// elapsed time and start it carries in its data attributes (see TimerButton and the running bars).
import * as L from '../sessionLogic.js';
import { TimerButton } from '../../ui/apl/index.js';

let ticker = null;

/** Start the app's one ticker (once). */
export function startTimerTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    for (const el of document.querySelectorAll('.timer-value')) {
      const started = el.dataset.started;
      const timer = {
        running: !!started,
        startedAt: started || null,
        elapsedMs: Number(el.dataset.elapsed) || 0,
      };
      el.textContent = L.formatClock(L.timerElapsed(timer));
    }
  }, 1000);
}

/** The APL TimerButton for a session timer ({ running, startedAt, elapsedMs }). */
export function sessionTimer(timer, onToggle, { size = 'md' } = {}) {
  const tm = timer || { running: false, startedAt: null, elapsedMs: 0 };
  startTimerTicker();
  return TimerButton({
    running: tm.running,
    text: L.formatClock(L.timerElapsed(tm)),
    elapsedMs: tm.elapsedMs,
    startedAt: tm.startedAt,
    onToggle,
    size,
    fk: 'timer',
  });
}
