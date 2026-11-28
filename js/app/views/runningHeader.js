// The top bar of every running session (scoring, blank bale, gym, SPT, mental): back, the title
// with an optional subtitle, the timer and Finish. It stays on screen while the page scrolls
// (.session-head). Its height is --run-head-h, which the scoring screen sizes itself by.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';

/**
 * @param {object} o
 * @param {string|Node} o.title  a string becomes the heading; a node (the scoring screen's
 *   "End n ▾" button) stands in its place
 * @param {string} [o.subtitle]  a caption under the title ("Started 16:07 · setup")
 * @param {() => void} [o.onBack]  no back button without it
 * @param {string} [o.backLabel]
 * @param {Node|null} [o.timer]  the session timer (sessionTimer), or null for no clock
 * @param {Node} o.finish  the Finish button (formFinish(...).button)
 */
export function runningHeader({ title, subtitle = '', onBack = null, backLabel = 'Back', timer = null, finish }) {
  return h(
    'header',
    { class: ['apl apl-header run-head session-head', !onBack && 'run-head--no-back'] },
    onBack ? APL.IconButton({ icon: 'back', label: backLabel, onClick: onBack, fk: 'screen-back' }) : null,
    h(
      'div',
      { class: 'run-head-title' },
      typeof title === 'string' ? h('h1', null, title) : title,
      subtitle ? h('span', { class: 'apl-cap' }, subtitle) : null,
    ),
    timer,
    finish,
  );
}
