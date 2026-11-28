// New session: the parts shared by the setup pages (the setup being picked, When, Equipment) and the
// form of SPT, mental and manual sessions, drawn with the APL components. Step 1 and the Shooting page
// are in shootingSetup.js. The running-session and open-form-session modules own starting, saving and
// discarding; these pages hold what is being picked (ui state `setup`).
import { h, todayIso } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import * as L from '../sessionLogic.js';
import { lastSetupOf } from '../lastSetup.js';
import { TYPE_LABELS, hourMinute, newestFirst, emptyFields, carriesGear } from '../sessionTypes.js';
import { gearChoices, gearForChoice } from '../gearFields.js';
import { sessionDates, gearCards } from './common.js';
import { datePicker, timePicker } from './pickers.js';
import { formSections, showsStartTimer } from './sessionForms.js';
import { sessionTimer } from './timer.js';
import { formFinish } from './formFinish.js';
import { runningHeader } from './runningHeader.js';
import { allDrillTypes, withDrillNames } from '../catalog.js';

// ---------------------------------------------------------------- shared by the setup pages

/**
 * The setup being picked (ui state `setup`): `when`, `pastMinutes` and `gear` are shared by every
 * setup page (switching the kind of shooting keeps them); the Shooting page keeps each kind's own
 * fields in `kinds[kind]`, the form pages their drafts in `forms[type]`.
 */
export function setupState(ctx) {
  const settings = ctx.repo.getSettings();
  const setup = ctx.ui.get().setup || {};
  return {
    settings,
    setup,
    set: (patch) => ctx.ui.set({ setup: { ...setup, ...patch } }),
    // typing in a text field stores the draft without re-rendering, so the field keeps focus
    quiet: (patch) => ctx.ui.quietSet({ setup: Object.assign(setup, patch) }),
  };
}

/**
 * When: now by default; an earlier date / time logs the session afterwards (no running timer).
 * Fields left untouched follow the clock, so a draft kept open is not dated when it was opened.
 * `duration`: a scored session logged afterwards asks for its duration here.
 * `timer`: Start starts the session timer from the picked time (scored, blank bale, gym); the form
 * pages (SPT, mental, log afterwards) open their timer with the page, so the time picker's hint
 * leaves the timer out there.
 * `startTime()` is the start time read when Start is tapped: the one picked, else the clock's (so a
 * page left open untouched does not start its timer minutes back).
 */
export function whenSection(ctx, { setup, set, quiet }, { duration = false, timer = true } = {}) {
  const when = setup.when || {};
  const whenDate = when.date || todayIso();
  const whenTime = when.time || hourMinute(new Date());
  const past = L.isPastStart(whenDate, whenTime);
  const setWhen = (patch) => set({ when: { ...when, ...patch } });
  const section = APL.Section({
    label: 'When',
    id: 'setup-when',
    // "Now" (back to the present) shows only after the date or the time was changed
    accessory:
      when.date || when.time
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-text btn-sm',
              dataset: { fk: 'when-now' },
              onClick: () => set({ when: null, pastMinutes: null }),
            },
            'Now',
          )
        : null,
    children: [
      h(
        'div',
        { class: 'apl-grid-2' },
        datePicker({
          label: 'Date',
          value: whenDate,
          max: todayIso(),
          marks: sessionDates(ctx),
          fk: 'when-date',
          onChange: (date) => setWhen({ date }),
        }),
        timePicker({
          label: 'Start time',
          value: whenTime,
          date: whenDate,
          timer,
          fk: 'when-time',
          hint: when.time ? 'Start time' : 'Now',
          onChange: (time) => time && setWhen({ time }),
        }),
      ),
      past && duration
        ? APL.TextField({
            label: 'Duration',
            type: 'number',
            inputmode: 'numeric',
            min: 0,
            suffix: 'min',
            value: setup.pastMinutes ?? '',
            fk: 'past-minutes',
            onInput: (e) => {
              const n = parseInt(e.target.value, 10);
              quiet({ pastMinutes: Number.isFinite(n) && n >= 0 ? n : null });
            },
          })
        : null,
      past ? h('p', { class: 'apl-cap' }, 'Logged afterwards: no running timer.') : null,
    ],
  });
  const startTime = () => when.time || hourMinute(new Date());
  return { section, whenDate, whenTime, past, startTime };
}

/**
 * Equipment, as cards. Until one is picked on the page, the last session of `kind` decides (when its
 * setup still exists), else the active setup.
 */
export function equipmentSection(ctx, { settings, setup, set }, { kind = null, distance = null } = {}) {
  const setups = ctx.repo.list('setups');
  const gearOpts = gearChoices({ settings, setups });
  const valid = (id) => gearOpts.options.some((o) => o[0] === id);
  const remembered = kind ? lastSetupOf(settings, kind).gear : null;
  const gearChoice = valid(setup.gear) ? setup.gear : valid(remembered) ? remembered : gearOpts.value;
  const section = APL.Section({
    label: 'Equipment',
    id: 'setup-gear',
    children: gearCards(ctx, { ...gearOpts, value: gearChoice, onChange: (id) => set({ gear: id }), setups, distance }),
  });
  return {
    section,
    choice: gearChoice,
    chosenGear: () => gearForChoice(gearChoice, { setups }) || { gear: null, gearSnapshotId: null },
    gearName: gearChoice === 'none' ? null : gearOpts.options.find((o) => o[0] === gearChoice)?.[1],
  };
}

// ---------------------------------------------------------------- form session

/**
 * The form of an SPT, mental or manual session, saved straight to History. SPT and mental are timed:
 * opening the form starts their timer (a blank bale starts from the Shooting page instead).
 */
export function renderFormSetup(ctx, type) {
  const st = setupState(ctx);
  const { settings, setup, set, quiet } = st;
  // My drills, hidden ones included (a drill already in the form may be of a hidden type)
  const drillTypes = allDrillTypes(settings);
  // SPT starts as a shooting session does: nothing runs until Start is tapped (or, with a past start
  // time, the form is logged afterwards); a started one goes on as it is
  const sptWaiting = type === 'strength' && !ctx.ongoing.find('strength');
  const { section: when, whenDate, whenTime, past, startTime } = whenSection(ctx, st, { timer: sptWaiting });
  // equipment is not asked for mental and SPT sessions: the bow's setup says nothing about them
  const noGear = !carriesGear(type);
  const equipment = noGear ? null : equipmentSection(ctx, st);

  // The open form session (openFormSession.js) owns the timer, the kept draft, saving and
  // discarding; this page holds the draft being typed and forwards the events.
  // Opening gives a timed form its timer and, when the page has no draft yet, the kept one.
  const opened = sptWaiting
    ? { timed: false, timer: null, draft: null }
    : ctx.ongoing.form.open(type, setup.forms?.[type] || null);
  if (opened.draft && !setup.forms?.[type]) quiet({ forms: { ...setup.forms, [type]: opened.draft } });
  const { timed, timer: formTimer } = opened;
  const form = setup.forms?.[type] || emptyFields(type);
  // the draft is read at call time: typing stores into `setup` without re-rendering
  const currentForm = () => setup.forms?.[type] || emptyFields(type);
  const changeForm = (update, { rerender = true } = {}) => {
    const cur = currentForm();
    const forms = { ...setup.forms, [type]: { ...cur, ...update(cur) } };
    ctx.ongoing.form.keepDraft(type, forms[type]);
    if (rerender) set({ forms });
    else quiet({ forms });
  };
  const toggleFormTimer = () => {
    ctx.ongoing.form.toggleTimer(type);
    ctx.rerender();
  };
  // the form session is over: the page's draft goes too
  const dropPageDraft = () =>
    ctx.ui.quietSet({ setup: { ...setup, when: null, forms: { ...setup.forms, [type]: null } } });

  const discardForm = async ({ confirmed = false } = {}) => {
    const res = await ctx.ongoing.discard(type, { confirmed });
    if (!res.next) return res;
    dropPageDraft();
    ctx.navigate(res.next, { replace: true });
    return res;
  };

  // SPT Start: the timer starts now, or at the start time picked a few minutes ago
  const startForm = () => {
    ctx.ongoing.start(type, { fields: currentForm(), when: { date: whenDate, time: startTime() } });
    ctx.rerender();
  };
  // before Start (and not logged afterwards) the page is When and the Start button only
  const startPending = sptWaiting && !past;

  // `confirmed`: the Finish sheet asked already (a plain Save button asks through the dialog)
  const saveForm = async ({ confirmed = false } = {}) => {
    const fields = currentForm();
    const res = await ctx.ongoing.finish(type, {
      // each drill keeps its type's name, for a device that does not know the type yet
      fields: type === 'strength' ? { ...fields, drills: withDrillNames(fields.drills, drillTypes) } : fields,
      date: whenDate,
      time: whenTime,
      past,
      gear: noGear ? {} : equipment.chosenGear(),
      confirmed,
    });
    if (!res.next) return res;
    dropPageDraft();
    ctx.navigate(res.next, { replace: true });
    return res;
  };

  // a timed form whose start is not in the past: its timer runs, it is a running session
  const running = timed && !past;

  // no back button on a running session (Finish ends it; the tab bar leaves it running)
  const back = !running;
  // the manual type is offered as "Log afterwards"
  const title = type === 'manual' ? 'Log afterwards' : `${TYPE_LABELS[type]} session`;
  // a drill card's own green "Start timer" is the primary action while it shows: Save steps down
  const saveVariant = type === 'strength' && showsStartTimer(form.drills, drillTypes) ? 'secondary' : 'primary';

  // a running session (SPT, mental) ends as the scoring screen does: Finish in the header opens End
  // the session (save · discard · continue), instead of Save at the bottom and Discard in the page
  const drills = form.drills || [];
  const doneDrills = drills.filter((d) => d.done).length;
  const clock = L.formatClock(L.timerElapsed(formTimer));
  const ending = running
    ? formFinish(ctx, type, {
        summary:
          type === 'strength'
            ? [`${drills.length} ${drills.length === 1 ? 'drill' : 'drills'}`, `${doneDrills} done`, clock].join(' · ')
            : clock,
        save: saveForm,
        discard: discardForm,
      })
    : null;

  const onBack = back ? () => ctx.navigate('new') : null;
  const backLabel = 'Back to session type';
  // a running session: the shared running-session bar (timer and Finish)
  const header = running
    ? runningHeader({ title, onBack, backLabel, timer: sessionTimer(formTimer, toggleFormTimer), finish: ending.button })
    : APL.ScreenHeader({ title, onBack, backLabel });

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      header,
      h(
        'div',
        { class: 'apl-screen-body' },
        when,
        startPending
          ? h(
              'div',
              { class: 'ns-info' },
              h('span', { class: 'ns-info-well', 'aria-hidden': 'true' }, APL.Icon({ name: 'stopwatch', size: 20 })),
              h('p', null, 'After you start, add your drills and tick them off as you go. The timer runs from Start.'),
            )
          : null,
        ...(startPending ? [] : formSections(type, form, changeForm, {
          live: running,
          settings,
          // SPT: a new drill starts from the numbers last used in a saved session
          pastSessions:
            type === 'strength'
              ? ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'strength')
              : [],
        })),
        equipment?.section,
      ),
      running
        ? null
        : startPending
          ? APL.BottomBar({
              children: APL.Button({ children: 'Start session', trailingIcon: 'arrowRight', onClick: startForm, fk: 'form-start' }),
            })
          : APL.BottomBar({
              children: APL.Button({ children: 'Save session', variant: saveVariant, onClick: () => saveForm(), fk: 'form-save' }),
            }),
    ),
    overlay: ending?.overlay ?? null,
  };
}
