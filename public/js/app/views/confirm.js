// In-app confirmation dialog, used instead of the browser's confirm() box.
// A native <dialog> shown with showModal(): the page behind is inert, focus stays inside, Escape
// cancels. Resolves true when confirmed, false when cancelled (button, Escape or a backdrop tap).
import { h } from '../../core/dom.js';
import { icons } from '../icons.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.message]
 * @param {string} [o.confirmLabel]  text of the confirming button
 * @param {string} [o.cancelLabel]
 * @param {boolean} [o.danger]       destructive action: red button, and Cancel gets the focus
 * @param {Node} [o.body]           extra content, e.g. form fields (the caller reads them after a true);
 *                                   Enter in a single-line field confirms, the first field gets the focus
 * @param {string} [o.icon]          icon name for the badge (default: trash when danger, help otherwise)
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, body = null, icon = null }) {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    let result = false;

    const cancelBtn = h('button', { type: 'button', class: 'btn btn-outline', onClick: () => close(false) }, cancelLabel);
    const okBtn = h('button', { type: 'button', class: ['btn', danger ? 'btn-danger' : 'btn-primary'], onClick: () => close(true) }, confirmLabel);
    const dialog = h(
      'dialog',
      { class: ['confirm', danger && 'is-danger'], 'aria-labelledby': 'confirm-title', 'aria-describedby': message ? 'confirm-msg' : null },
      h(
        'div',
        { class: 'confirm-body' },
        h('div', { class: 'confirm-icon', 'aria-hidden': 'true' }, icons[icon || (danger ? 'trash' : 'help')]()),
        h('h2', { class: 'confirm-title', id: 'confirm-title' }, title),
        message ? h('p', { class: 'confirm-msg', id: 'confirm-msg' }, message) : null,
      ),
      body ? h('div', { class: 'confirm-fields' }, body) : null,
      h('div', { class: 'confirm-actions' }, cancelBtn, okBtn),
    );

    function close(ok) {
      result = ok;
      dialog.classList.add('is-out');
      // let the closing animation play (skipped when motion is reduced)
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => dialog.close(), reduce ? 0 : 140);
    }

    dialog.addEventListener('close', () => {
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(result);
    });
    // Escape: our own close (with the animation), and kept from the app's overlay handler
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
      if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        close(true);
      }
    });
    // a tap on the backdrop (outside the dialog box) cancels; not with fields, so typing is not lost
    dialog.addEventListener('click', (e) => {
      if (body || e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close(false);
    });

    document.body.append(dialog);
    dialog.showModal();
    const firstField = body && dialog.querySelector('input, textarea, select');
    if (firstField) {
      firstField.focus();
      firstField.select?.();
    } else (danger ? cancelBtn : okBtn).focus();
  });
}
