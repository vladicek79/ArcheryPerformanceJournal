// Ending an open blank bale, gym, SPT or mental session, the way the scoring screen does it: Finish in the header opens
// "End the session" (Finish and save · Discard session · Continue session); Discard session discards
// at once, without asking again. The page's save and discard pass `confirmed` to the ongoing
// sessions (ongoingSessions.js), so the sheet's answer is not asked a second time.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';

/**
 * The Finish button for the header and the sheet open over the page (`overlay` of the view).
 * `summary`: one line for the Finish sheet. `save` / `discard`: the page's own save and discard, called with
 * `{ confirmed: true }` (async; they navigate, and return the ongoing session's outcome).
 */
export function formFinish(ctx, type, { summary, save, discard }) {
  const cur = ctx.ui.get().formSheet;
  const sheet = cur?.type === type ? cur.sheet : null;
  const setSheet = (next) => ctx.ui.set({ formSheet: next ? { type, sheet: next } : null });
  const close = () => setSheet(null);

  const run = async (fn) => {
    ctx.ui.quietSet({ formSheet: null });
    const res = await fn({ confirmed: true });
    // still here (the save was refused): draw the page without the sheet. After a save or a discard
    // the page has navigated away, and drawing this route again would get in its way.
    if (!res?.next) ctx.rerender();
  };
  const onSave = () => run(save);
  const onDiscard = () => run(discard);

  const button = h(
    'button',
    { type: 'button', class: 'score-finish', 'aria-haspopup': 'dialog', onClick: () => setSheet('finish'), dataset: { fk: 'finish-open' } },
    T.finishShort,
  );

  const finishSheet = () => ({
    onClose: close,
    returnFk: 'finish-open',
    node: APL.Dialog({
      sheet: true,
      title: T.endSession,
      idPrefix: 'form-finish',
      onClose: close,
      closeLabel: T.keepGoing,
      children: h(
        'div',
        { class: 'score-sheet' },
        summary ? h('p', { class: 'score-sheet-summary' }, summary) : null,
        APL.Button({ children: T.finishAndSave, leadingIcon: icons.check(), onClick: onSave, fk: 'finish' }),
        h(
          'button',
          { type: 'button', class: 'score-danger-btn', onClick: onDiscard, dataset: { fk: 'discard' } },
          icons.trash(),
          T.discardSession,
        ),
        h('button', { type: 'button', class: 'score-text-btn', onClick: close, dataset: { fk: 'keep-going' } }, T.keepGoing),
      ),
    }),
  });

  const overlay = sheet === 'finish' ? finishSheet() : null;
  return { button, overlay };
}
