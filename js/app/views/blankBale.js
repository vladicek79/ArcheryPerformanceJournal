// The running blank bale session (#/blank): started from the Shooting page, counted with +1 / +3 / +6
// while you shoot; ended with Finish in the header (save, discard or continue, see formFinish.js),
// as on the scoring screen. The open form session (openFormSession.js) owns the timer, the kept
// draft, saving and discarding; this page draws them and forwards the taps.
import { h, isoDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { hourMinute } from '../sessionTypes.js';
import { timerElapsed, formatClock } from '../sessionLogic.js';
import { activeSetup, gearForChoice } from '../gearFields.js';
import { sessionTimer } from './timer.js';
import { formFinish } from './formFinish.js';
import { runningHeader } from './runningHeader.js';
import { watchScan } from './watchScan.js';
import { showWatchEnd } from './watchEnd.js';
import { watchEndsSection } from './sessionOverview.js';
import { watchEndOf, watchShotCount } from '../watchCode.js';
import { icons } from '../icons.js';


// the count last drawn: a change since then flashes the number (re-renders without a tap don't)
let shownCount = null;

/** The goal line: "12 to go", or "Goal reached". */
export function goalLine(arrows, goal) {
  return arrows >= goal ? 'Goal reached' : `${goal - arrows} to go`;
}

/**
 * The page of an open blank bale session. `open` is its entry of the ongoing sessions (ongoingSessions.js: { timer, draft, … }).
 */
export function renderBlankRunning(ctx, open) {
  const { timer } = open;
  const draft = open.draft || { arrows: null, note: '' };
  const count = draft.arrows || 0;
  const goal = draft.goal || null;
  const now = new Date();
  // drafts kept before the Start button existed have no meta: their start is the timer's
  const startedAt = new Date(draft.meta?.startedAt || now.getTime() - timerElapsed(timer, now));
  const setups = ctx.repo.list('setups');
  // the equipment the session is saved with (not shown in the header: no running page shows it)
  const gearChoice = draft.meta?.gear ?? activeSetup(ctx.repo.getSettings(), setups)?.id ?? 'none';

  // the kept draft, read at call time: the note is stored while typing, without a re-render
  const current = () => ctx.ongoing.find('blank')?.draft || draft;
  const keep = (patch, { rerender = true } = {}) => {
    ctx.ongoing.form.keepDraft('blank', { ...current(), ...patch });
    if (rerender) ctx.rerender();
  };
  const add = (n) => keep({ arrows: Math.max(0, (current().arrows || 0) + n) });

  // Watch: the end's code from the Arrow Grades watch app, as on the scoring screen. Its grades,
  // heart rate and shot cycle are kept as one more end of the session, and its arrows are counted.
  const scanWatch = async () => {
    const code = await watchScan();
    if (!code) return;
    const n = watchShotCount(code);
    if (!n && !code.trace) {
      ctx.toast('The watch code has no arrows, no shots and no heart rate yet.');
      return;
    }
    const ends = current().watchEnds || [];
    // the same end of the watch scanned again (its counter): taken once only
    if (ends.length && ends[ends.length - 1].watchEnd === code.end) {
      ctx.toast(`End ${code.end} of the watch was taken already.`);
      return;
    }
    const end = watchEndOf(code);
    keep({ watchEnds: [...ends, end], arrows: (current().arrows || 0) + n });
    await showWatchEnd(end, { title: `End ${ends.length + 1} · from the watch` });
  };
  const toggleTimer = () => {
    ctx.ongoing.form.toggleTimer('blank');
    ctx.rerender();
  };
  const discard = async ({ confirmed = false } = {}) => {
    const res = await ctx.ongoing.discard('blank', { confirmed });
    if (res.next) ctx.navigate(res.next, { replace: true });
    return res;
  };
  const finish = async ({ confirmed = false } = {}) => {
    const res = await ctx.ongoing.finish('blank', {
      fields: current(),
      date: isoDate(startedAt),
      time: hourMinute(startedAt),
      gear: gearForChoice(gearChoice, { setups }) || { gear: null, gearSnapshotId: null },
      confirmed,
    });
    if (res.next) ctx.navigate(res.next, { replace: true });
    return res;
  };

  // green when arrows were added, red when taken away
  const flash = shownCount == null || count === shownCount ? null : count > shownCount ? 'bb-count-n--flash' : 'bb-count-n--flash-minus';
  shownCount = count;
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;

  // Finish in the header: End the session (save · discard · continue), as on the scoring screen
  const ending = formFinish(ctx, 'blank', {
    summary: [`${count} ${count === 1 ? 'arrow' : 'arrows'}`, formatClock(timerElapsed(timer, now))].join(' · '),
    save: finish,
    discard,
  });

  const header = runningHeader({
    title: 'Blank bale',
    subtitle: `Started ${hourMinute(startedAt)}`,
    onBack: () => ctx.navigate('home'),
    backLabel: 'Back to dashboard — the session keeps running',
    timer: sessionTimer(timer, toggleTimer),
    finish: ending.button,
  });

  const counter = h(
    'section',
    { class: 'bb-count', 'aria-label': 'Arrow count' },
    h(
      'output',
      { class: 'bb-count-value', 'aria-live': 'polite' },
      h('span', { class: ['bb-count-n', flash] }, String(count)),
    ),
    goal
      ? h(
          'div',
          { class: 'bb-goal' },
          h(
            'div',
            {
              class: 'bb-goal-track',
              role: 'progressbar',
              'aria-label': 'Arrow goal',
              'aria-valuemin': '0',
              'aria-valuemax': String(goal),
              'aria-valuenow': String(Math.min(count, goal)),
            },
            h('div', { class: 'bb-goal-fill', style: { width: `${pct}%` } }),
          ),
          h('div', { class: 'bb-goal-line' }, h('span', null, `Goal ${goal}`), h('span', null, goalLine(count, goal))),
        )
      : null,
  );

  const btn = (n, label) =>
    h(
      'button',
      {
        type: 'button',
        class: ['bb-add', n < 0 && 'bb-add--minus'],
        'aria-label': label,
        disabled: n < 0 && count === 0,
        dataset: { fk: n < 0 ? 'arrows-minus-1' : `arrows-add-${n}` },
        onClick: () => add(n),
      },
      n < 0 ? '−1' : `+${n}`,
    );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body bb-body' },
        // the count and its buttons sit in the middle of the free space above the note
        h(
          'div',
          { class: 'bb-counting' },
          counter,
          h(
            'div',
            { class: 'bb-adds' },
            btn(-1, 'Remove one arrow'),
            btn(1, 'Add one arrow'),
            btn(3, 'Add three arrows'),
            btn(6, 'Add six arrows'),
          ),
          h(
            'button',
            { type: 'button', class: 'bb-watch', 'aria-label': 'Scan the watch code of an end: its arrows are counted', onClick: scanWatch, dataset: { fk: 'watch-scan' } },
            icons.watch(),
            'Watch',
          ),
        ),
        // the ends brought from the watch so far: a tap opens one's timeline
        watchEndsSection(draft.watchEnds),
        APL.TextArea({
          label: 'Note',
          rows: 3,
          placeholder: 'Focus of today, feelings, what to keep…',
          value: draft.note || '',
          fk: 'form-note',
          onInput: (e) => keep({ note: e.target.value }, { rerender: false }),
        }),
      ),
    ),
    overlay: ending.overlay,
  };
}
