// The Gym setup page (#/new/gym): when, the focus and the exercises the session starts with (filled in
// from the last gym workout, see gym.js). Opening it starts nothing: Start creates the open form
// session with its timer running (openFormSession.js) and the running page (#/gym) takes over.
import { h, formatDate } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { newestFirst } from '../sessionTypes.js';
import { gymFocus, inListOrder } from '../catalog.js';
import { prefillExercises, prefillSource, lastTimeOf } from '../gym.js';
import { setupState, whenSection } from './sessionSetup.js';

export function renderGymSetup(ctx) {
  const st = setupState(ctx);
  const { settings, setup, set } = st;
  // the focus options of the archer's list, in its order (Settings › Gym focus)
  const focusOptions = gymFocus(settings);
  const { section: when, whenDate, whenTime, past, startTime } = whenSection(ctx, st);
  const gym = setup.gym || {};
  // a focus hidden in Settings while this page was open is dropped
  const focus = (gym.focus || []).filter((f) => focusOptions.includes(f));
  const sessions = ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'gym');
  // until one is removed by hand, the list follows the focus picked
  const exercises = gym.exercises ?? prefillExercises(sessions, focus);
  const source = gym.exercises ? null : prefillSource(sessions, focus);
  const setGym = (patch) => set({ gym: { ...gym, ...patch } });
  const open = !!ctx.ongoing.find('gym');

  const toggleFocus = (f) => setGym({ focus: focus.includes(f) ? focus.filter((x) => x !== f) : [...focus, f] });
  const remove = (i) => setGym({ exercises: exercises.filter((_, j) => j !== i) });

  // one already open goes on as it is
  const start = async () => {
    const res = await ctx.ongoing.start('gym', {
      fields: { focus: inListOrder(focus, focusOptions), exercises, note: '' },
      when: { date: whenDate, time: past ? whenTime : startTime(), past },
    });
    ctx.ui.quietSet({ setup: null });
    ctx.navigate(res.next, { replace: true });
  };

  const focusSection = APL.Section({
    label: 'Focus',
    id: 'gym-focus',
    accessory: h('span', { class: 'apl-cap' }, 'pick any'),
    children: APL.OptionPills({
      label: 'Focus',
      multiple: true,
      value: focus,
      options: focusOptions.map((f) => ({ value: f, label: f })),
      onChange: toggleFocus,
      fk: 'gym-focus',
    }),
  });

  const caption = source
    ? `Filled in from your gym workout of ${formatDate(source.date, { weekday: 'short', day: 'numeric', month: 'short' })} · you can add more during the session`
    : exercises.length
      ? 'You can add more during the session'
      : 'No exercises yet: add them during the session, or just write a note';

  const exerciseSection = APL.Section({
    label: 'Exercises',
    id: 'gym-exercises',
    children: h(
      'div',
      { class: 'gym-plan' },
      h(
        'ul',
        { class: 'gym-plan-list', 'aria-label': 'Exercises' },
        exercises.map((e, i) =>
          h(
            'li',
            { class: 'gym-plan-row' },
            h(
              'span',
              { class: 'gym-plan-text' },
              h('span', { class: 'gym-plan-name' }, e.name),
              h('span', { class: 'apl-cap' }, `Last time ${lastTimeOf(e.name, sessions) || '—'}`),
            ),
            APL.IconButton({ icon: 'close', label: `Remove ${e.name}`, onClick: () => remove(i), fk: `gym-remove-${i}` }),
          ),
        ),
      ),
      h('p', { class: 'gym-plan-caption apl-cap' }, caption),
    ),
  });

  const summary = [
    focus.length ? inListOrder(focus, focusOptions).join(' · ') : 'Gym',
    `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`,
    open ? null : past ? 'logged afterwards, no timer' : 'timer starts on Start',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: 'Gym',
        // going back gives the setup up: nothing was started
        onBack: () => {
          ctx.ui.quietSet({ setup: null });
          ctx.navigate('new/strength-choice', { replace: true });
        },
        backLabel: 'Back to strength',
      }),
      h(
        'div',
        { class: 'apl-screen-body' },
        open ? APL.Banner({ title: 'A gym session is running', action: { label: T.continueSession, href: '#/gym' } }) : null,
        when,
        focusSection,
        exerciseSection,
      ),
      APL.BottomBar({
        summary,
        children: APL.Button({
          children: open ? 'Continue gym session' : past ? 'Log gym session' : 'Start gym session',
          trailingIcon: 'arrowRight',
          onClick: start,
          fk: 'setup-start',
        }),
      }),
    ),
  };
}
