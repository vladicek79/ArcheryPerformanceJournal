// The running gym session (#/gym): started from the Gym setup page, its exercises and sets ticked off
// as you go, or just a note; ended with Finish in the header (save, discard or continue, see
// formFinish.js). The open form session (openFormSession.js) owns the timer, the kept draft (so a
// reload keeps everything), saving and discarding; this page draws them and forwards the taps.
import { h, isoDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { hourMinute, newestFirst } from '../sessionTypes.js';
import { timerElapsed, formatClock } from '../sessionLogic.js';
import { doneSets, emptyGym } from '../gym.js';
import { sessionTimer } from './timer.js';
import { gymExercises } from './gymForm.js';
import { formFinish } from './formFinish.js';
import { runningHeader } from './runningHeader.js';
import { editList, gymExercises as catalogExercises } from '../catalog.js';

/** The page of an open gym session. `open` is its entry of the ongoing sessions (ongoingSessions.js: { timer, draft, … }). */
export function renderGymRunning(ctx, open) {
  const { timer } = open;
  const draft = open.draft || emptyGym();
  const meta = draft.meta || {};
  const now = new Date();
  const startedAt = new Date(meta.startedAt || now.getTime() - timerElapsed(timer, now));
  const date = meta.date || isoDate(startedAt);
  const time = meta.time || hourMinute(startedAt);
  const past = !!meta.past;

  // the kept draft, read at call time: the note is stored while typing, without a re-render
  const current = () => ctx.ongoing.find('gym')?.draft || draft;
  const change = (update, { rerender = true } = {}) => {
    const cur = current();
    ctx.ongoing.form.keepDraft('gym', { ...cur, ...update(cur) });
    if (rerender) ctx.rerender();
  };
  const toggleTimer = () => {
    ctx.ongoing.form.toggleTimer('gym');
    ctx.rerender();
  };
  const closeUi = () => ctx.ui.quietSet({ gymMenu: null, gymRename: null, gymOther: null });
  const discard = async ({ confirmed = false } = {}) => {
    const res = await ctx.ongoing.discard('gym', { confirmed });
    if (!res.next) return res;
    closeUi();
    ctx.navigate(res.next, { replace: true });
    return res;
  };
  const finish = async ({ confirmed = false } = {}) => {
    const res = await ctx.ongoing.finish('gym', { fields: current(), date, time, past, confirmed });
    if (!res.next) return res;
    closeUi();
    ctx.navigate(res.next, { replace: true });
    return res;
  };

  const sessions = ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'gym');
  const sets = doneSets(draft.exercises);
  const exerciseCount = (draft.exercises || []).length;
  const subtitle = [(draft.focus || []).join(' · ') || null, past ? `logged afterwards · ${time}` : `started ${time}`]
    .filter(Boolean)
    .join(' · ');

  // Finish in the header: End the session (save · discard · continue), as on the scoring screen
  const clock = past ? null : formatClock(timerElapsed(timer, now));
  const exercisesText = `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  const setsText = `${sets} ${sets === 1 ? 'set' : 'sets'}`;
  const ending = formFinish(ctx, 'gym', {
    summary: [exercisesText, `${setsText} done`, clock].filter(Boolean).join(' · '),
    save: finish,
    discard,
  });

  const header = runningHeader({
    title: 'Gym',
    subtitle,
    onBack: () => ctx.navigate('home'),
    backLabel: 'Back to dashboard — the session keeps running',
    // logged afterwards: no clock, the duration is typed in on the saved session
    timer: past ? null : sessionTimer(timer, toggleTimer),
    finish: ending.button,
  });

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body gym-body' },
        ...gymExercises(draft, change, {
          sessions,
          ui: ctx.ui,
          choices: catalogExercises(ctx.repo.getSettings()),
          // an exercise added through Other… is kept in My exercises (when the switch is left on)
          onSave: (name, unit) => {
            const res = editList(ctx.repo.getSettings(), 'exercises', { add: { name, unit } });
            if (res.patch) ctx.saveSettings(res.patch);
          },
        }),
        APL.TextArea({
          label: 'Note',
          rows: 3,
          placeholder: 'Or just write what you did…',
          value: draft.note || '',
          fk: 'form-note',
          onInput: (e) => change(() => ({ note: e.target.value }), { rerender: false }),
        }),
      ),
    ),
    overlay: ending.overlay,
  };
}
