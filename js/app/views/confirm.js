// In-app confirmation dialog, used instead of the browser's confirm() box.
// A native <dialog> shown with showModal(): the page behind is inert, focus stays inside, Escape
// cancels. Resolves true when confirmed, false when cancelled (button, Escape or a backdrop tap).
import * as APL from '../../ui/apl/index.js';
import { icons } from '../icons.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.message]
 * @param {string} [o.confirmLabel]  text of the confirming button
 * @param {string} [o.cancelLabel]
 * @param {boolean} [o.danger]       destructive action: danger button, and Cancel gets the focus
 * @param {Node} [o.body]           extra content, e.g. form fields (the caller reads them after a true);
 *                                   Enter in a single-line field confirms, the first field gets the focus
 * @param {string} [o.icon]          icon name for the badge (default: trash when danger, help otherwise)
 * @param {boolean} [o.bare]         only the body and the two buttons: no badge, title or message on
 *                                   screen (the title is still the dialog's name for screen readers)
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, body = null, icon = null, bare = false }) {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    let result = false;

    const cancelBtn = APL.Button({ children: cancelLabel, variant: 'secondary', onClick: () => close(false) });
    const okBtn = APL.Button({ children: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => close(true) });
    const dialog = APL.Dialog({
      title,
      message,
      icon: bare ? null : icons[icon || (danger ? 'trash' : 'help')](),
      tone: danger ? 'danger' : 'neutral',
      body,
      bare,
      idPrefix: 'confirm',
      actions: [cancelBtn, okBtn],
    });

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
