// New session: the session types, the setup of a scored session (training, competition) and the
// form of the other types (blank bale, SPT, mental, manual), drawn with the APL components after the
// design system's SessionSetup screen. The running-session and open-form-session modules own
// starting, saving and discarding; these pages hold what is being picked (ui state `setup`).
import { h, todayIso } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import * as L from '../sessionLogic.js';
import { T } from '../strings.js';
import {
  DISTANCES,
  DISTANCE_DEFAULTS,
  SETUP_FACES,
  ARROWS_PER_END_MIN,
  ARROWS_PER_END_MAX,
  DEFAULT_ARROWS_PER_END,
} from '../scoring.js';
import { SESSION_TYPES, TYPE_LABELS, hourMinute, setupSummary, emptyCompetition, newestFirst } from '../sessionTypes.js';
import { gearChoices, gearForChoice } from '../gearFields.js';
import { sessionDates, gearCards } from './common.js';
import { datePicker, timePicker } from './pickers.js';
import { emptyForm, formSections, showsStartTimer } from './sessionForms.js';
import { sessionTimer } from './timer.js';
import { faceParts, faceId, FACE_SIZES, kindsForSize, faceForSize } from './setupFaces.js';

const TYPE_HINTS = {
  training: 'Score arrow by arrow with M / S grades',
  blank: 'Count arrows at the blank bale, no score',
  competition: 'Scored like training, with event and placement',
  strength: 'Holding and draw drills, effort',
  mental: 'Visualisation, breathing, shot routine…',
  manual: 'Type in the arrows or the duration afterwards',
};

const ARROW_PRESETS = [3, 6, 9, 12];
const arrowsText = (n) => `${n} ${n === 1 ? 'arrow' : 'arrows'}/end`;

/** Step 1: the session types. Tapping one opens its setup; the last one picked is tagged. */
export function renderTypeChoice(ctx) {
  const last = ctx.ui.get().newType;
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: 'New session',
        onBack: () => ctx.navigate('home'),
        backLabel: 'Back to dashboard',
      }),
      h(
        'div',
        { class: 'apl-screen-body' },
        APL.Section({
          label: 'Session type',
          id: 'new-type',
          children: h(
            'nav',
            { class: 'apl-list', 'aria-labelledby': 'new-type-label' },
            SESSION_TYPES.map((t) =>
              APL.NavRow({
                href: `#/new/${t}`,
                title: TYPE_LABELS[t],
                detail: TYPE_HINTS[t],
                badge: last === t ? APL.Badge({ children: 'Last used', tone: 'neutral' }) : null,
                onClick: () => ctx.ui.quietSet({ newType: t }),
                fk: `type-${t}`,
              }),
            ),
          ),
        }),
      ),
    ),
  };
}

// ---------------------------------------------------------------- shared by both setups

/** The setup being picked (ui state), starting from the last session's distance and face. */
function setupState(ctx) {
  const settings = ctx.repo.getSettings();
  // distance and face are remembered from the last session; arrows per end always start at the default
  const last = settings.lastSetup;
  // a face no longer offered (the single 40 cm 10–6 spot) falls back to the triple
  const lastFace = SETUP_FACES.includes(last.face) ? last.face : '40t';
  const setup = ctx.ui.get().setup || {
    distance: last.distance,
    face: lastFace,
    arrowsPerEnd: DEFAULT_ARROWS_PER_END,
    competition: emptyCompetition(),
  };
  return {
    settings,
    last,
    lastFace,
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
 */
function whenSection(ctx, { setup, set, quiet }, { duration = false } = {}) {
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
  return { section, whenDate, whenTime, past };
}

/** Equipment: the active setup by default, or any other setup, as cards. */
function equipmentSection(ctx, { settings, setup, set }) {
  const setups = ctx.repo.list('setups');
  const gearOpts = gearChoices({ settings, setups });
  const gearChoice = gearOpts.options.some((o) => o[0] === setup.gear) ? setup.gear : gearOpts.value;
  const section = APL.Section({
    label: 'Equipment',
    id: 'setup-gear',
    children: gearCards(ctx, {
      ...gearOpts,
      value: gearChoice,
      onChange: (id) => set({ gear: id }),
      setups,
      distance: setup.distance ?? null,
    }),
  });
  return {
    section,
    chosenGear: () =>
      gearForChoice(gearChoice, { setups }) || { gear: null, gearSnapshotId: null },
    gearName: gearChoice === 'none' ? null : gearOpts.options.find((o) => o[0] === gearChoice)?.[1],
  };
}

// ---------------------------------------------------------------- scored session

/** Step 2 for a scored session: when, distance, face, arrows per end, (competition), equipment. */
export function renderScoredSetup(ctx, type, active = null) {
  const st = setupState(ctx);
  const { last, lastFace, setup, set, quiet } = st;
  const { section: when, whenDate, whenTime, past } = whenSection(ctx, st, { duration: true });
  const { section: equipment, chosenGear, gearName } = equipmentSection(ctx, st);

  const start = async () => {
    // only one session runs at a time: the running-session module asks about the one in progress
    const { distance, face, arrowsPerEnd } = setup;
    const res = await ctx.running.start({
      date: whenDate,
      time: whenTime,
      pastMinutes: past ? (setup.pastMinutes ?? 0) : null,
      type,
      distance,
      face,
      arrowsPerEnd,
      competition: type === 'competition' ? { ...emptyCompetition(), ...setup.competition } : null,
      ...chosenGear(),
    });
    if (res.status === 'cancelled') return;
    ctx.ui.quietSet({ setup: null });
    if (res.status === 'started') ctx.navigate('log', { replace: true });
  };

  // the back button gives the setup up (what was picked is forgotten) and goes back to the session types
  const cancel = () => {
    ctx.ui.quietSet({ setup: null });
    ctx.navigate('new', { replace: true });
  };

  const compField = (key, label, placeholder) =>
    APL.TextField({
      label,
      placeholder,
      value: setup.competition?.[key] || '',
      fk: `comp-${key}`,
      onInput: (e) => quiet({ competition: { ...setup.competition, [key]: e.target.value } }),
    });

  const lastArrows = last.arrowsPerEnd ?? DEFAULT_ARROWS_PER_END;
  const { size, kind } = faceParts(setup.face) || faceParts(lastFace);
  const suggested = DISTANCE_DEFAULTS[setup.distance]?.face === setup.face;

  const body = h(
    'div',
    { class: 'apl-screen-body' },
    active
      ? APL.Banner({
          title: T.inProgress(setupSummary(active), active.ends.length),
          action: { label: T.continueSession, href: '#/log' },
        })
      : null,
    APL.RepeatCard({
      title: 'Same as last session',
      summary: setupSummary({ distance: last.distance, face: lastFace }, arrowsText(lastArrows)),
      onClick: () => set({ distance: last.distance, face: lastFace, arrowsPerEnd: lastArrows }),
      fk: 'setup-repeat',
    }),
    when,
    APL.Section({
      label: T.distance,
      id: 'setup-dist',
      children: APL.ChipGrid({
        label: 'Distance',
        value: setup.distance,
        options: DISTANCES.map((d) => ({ value: d, label: `${d} m` })),
        // picking a distance suggests its usual face
        onChange: (d) => set({ distance: d, ...DISTANCE_DEFAULTS[d] }),
        fk: 'dist',
      }),
    }),
    APL.Section({
      label: T.targetFace,
      id: 'setup-face',
      accessory: suggested ? APL.Badge({ children: `Suggested for ${setup.distance} m` }) : null,
      children: [
        APL.FaceCard({ size, kind }),
        APL.SegmentedControl({
          label: 'Face size',
          value: size,
          options: FACE_SIZES.map((v) => ({ value: v, label: `${v} cm` })),
          onChange: (v) => set({ face: faceForSize(v, setup.face) }),
          fk: 'face-size',
        }),
        kindsForSize(size).length > 1
          ? APL.OptionPills({
              label: 'Face type',
              value: kind,
              options: kindsForSize(size).map((k) => ({ value: k, label: APL.FACE_NAMES[k] })),
              onChange: (k) => set({ face: faceId(size, k) }),
              fk: 'face-kind',
            })
          : null,
      ],
    }),
    APL.Section({
      label: T.arrowsPerEnd,
      id: 'setup-n',
      // the chips hold the usual counts; the stepper reaches the others
      accessory: APL.Stepper({
        label: 'arrows per end',
        value: setup.arrowsPerEnd,
        min: ARROWS_PER_END_MIN,
        max: ARROWS_PER_END_MAX,
        onChange: (n) => set({ arrowsPerEnd: n }),
        fk: 'n',
      }),
      children: APL.ChipGrid({
        label: 'Arrows per end',
        numeric: true,
        value: setup.arrowsPerEnd,
        options: ARROW_PRESETS.map((n) => ({ value: n, label: String(n) })),
        onChange: (n) => set({ arrowsPerEnd: n }),
        fk: 'n-chip',
      }),
    }),
    type === 'competition'
      ? APL.Section({
          label: 'Competition',
          id: 'setup-comp',
          children: [
            compField('event', 'Event', 'e.g. Indoor Cup Bratislava'),
            h(
              'div',
              { class: 'apl-grid-2' },
              compField('round', 'Round', 'e.g. WA 18 m'),
              compField('conditions', 'Conditions', 'hall, wind, light'),
            ),
          ],
        })
      : null,
    equipment,
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: `New ${TYPE_LABELS[type].toLowerCase()} session`,
        onBack: cancel,
        backLabel: 'Cancel and back to session types',
      }),
      body,
      APL.BottomBar({
        summary: setupSummary(setup, arrowsText(setup.arrowsPerEnd), gearName),
        children: APL.Button({
          children: T.start,
          trailingIcon: 'arrowRight',
          onClick: start,
          fk: 'setup-start',
        }),
      }),
    ),
  };
}

// ---------------------------------------------------------------- form session

/** The form of a blank bale, SPT, mental or manual session, saved straight to History. */
export function renderFormSetup(ctx, type) {
  const st = setupState(ctx);
  const { setup, set, quiet } = st;
  const { section: when, whenDate, whenTime, past } = whenSection(ctx, st);
  // equipment is not asked for mental and SPT sessions: the bow's setup says nothing about them
  const noGear = type === 'mental' || type === 'strength';
  const equipment = noGear ? null : equipmentSection(ctx, st);

  // The open form session (openFormSession.js) owns the timer, the kept draft, saving and
  // discarding; this page holds the draft being typed and forwards the events.
  // Opening gives a timed form its timer and, when the page has no draft yet, the kept one.
  const opened = ctx.openForms.open(type, setup.forms?.[type] || null);
  if (opened.draft && !setup.forms?.[type]) quiet({ forms: { ...setup.forms, [type]: opened.draft } });
  const { timed, timer: formTimer } = opened;
  const form = setup.forms?.[type] || emptyForm(type);
  // the draft is read at call time: typing stores into `setup` without re-rendering
  const currentForm = () => setup.forms?.[type] || emptyForm(type);
  const changeForm = (update, { rerender = true } = {}) => {
    const cur = currentForm();
    const forms = { ...setup.forms, [type]: { ...cur, ...update(cur) } };
    ctx.openForms.keepDraft(type, forms[type]);
    if (rerender) set({ forms });
    else quiet({ forms });
  };
  const toggleFormTimer = () => {
    ctx.openForms.toggleTimer(type);
    ctx.rerender();
  };
  // the form session is over: the page's draft goes too
  const dropPageDraft = () =>
    ctx.ui.quietSet({ setup: { ...setup, when: null, forms: { ...setup.forms, [type]: null } } });

  const discardForm = async () => {
    const res = await ctx.openForms.discard(type);
    if (res.status !== 'discarded') return;
    dropPageDraft();
    ctx.navigate('home', { replace: true });
  };

  const saveForm = async () => {
    const res = await ctx.openForms.save(type, {
      fields: currentForm(),
      date: whenDate,
      time: whenTime,
      past,
      gear: noGear ? {} : equipment.chosenGear(),
    });
    if (res.status !== 'saved') return;
    dropPageDraft();
    ctx.navigate(`history/${res.session.id}`, { replace: true });
  };

  // a timed form whose start is not in the past: its timer runs, it is a running session
  const running = timed && !past;
  // blank bale: the timer sits beside the arrow count (in the form); SPT: in the page header, next
  // to the title; mental, manual: a "Timer" row
  const sptRunning = running && type === 'strength';
  const timerRow =
    running && type !== 'blank' && !sptRunning
        ? h(
            'div',
            { class: 'apl-section-head' },
            h('h2', { class: 'apl-label' }, 'Timer'),
            sessionTimer(formTimer, toggleFormTimer),
          )
        : null;

  // no back button on a running SPT or blank bale session (Save or Discard end it; the tab bar
  // leaves it running); no title on a running blank bale session: the room goes to the form
  const back = !(running && (type === 'strength' || type === 'blank'));
  const title = running && type === 'blank' ? '' : `${TYPE_LABELS[type]} session`;
  // a drill card's own green "Start timer" is the primary action while it shows: Save steps down
  const saveVariant = type === 'strength' && showsStartTimer(form.drills) ? 'secondary' : 'primary';

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      back || title
        ? APL.ScreenHeader({
            title,
            onBack: back ? () => ctx.navigate('new') : null,
            backLabel: 'Back to session type',
            trailing: sptRunning ? sessionTimer(formTimer, toggleFormTimer) : null,
          })
        : null,
      h(
        'div',
        { class: ['apl-screen-body', !back && !title && 'apl-screen-body--top'] },
        when,
        timerRow,
        ...formSections(type, form, changeForm, {
          live: running,
          timer:
            type === 'blank' && running ? sessionTimer(formTimer, toggleFormTimer, { size: 'lg' }) : null,
          // SPT: a new drill starts from the numbers last used in a saved session
          pastSessions:
            type === 'strength'
              ? ctx.repo.list('sessions', { sort: newestFirst }).filter((s) => s.type === 'strength')
              : [],
        }),
        equipment?.section,
        running
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text danger apl-discard',
                dataset: { fk: 'discard-form' },
                onClick: discardForm,
              },
              'Discard session',
            )
          : null,
      ),
      APL.BottomBar({
        children: APL.Button({ children: 'Save session', variant: saveVariant, onClick: saveForm, fk: 'form-save' }),
      }),
    ),
  };
}
