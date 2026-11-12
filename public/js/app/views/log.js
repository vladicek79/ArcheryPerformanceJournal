// Log tab: new session setup → arrow-by-arrow logging with the M/S grading sheet (HANDOFF §3).
import { h, s, todayIso } from '../../core/dom.js';
import {
  DISTANCES,
  SETUP_FACES,
  ARROWS_PER_END_MIN,
  ARROWS_PER_END_MAX,
  DEFAULT_ARROWS_PER_END,
  DISTANCE_DEFAULTS,
  faceLabel,
  scoreFromPoint,
  locateOnSheet,
  sheetPoint,
  isMultiSpot,
  zoneOf,
} from '../scoring.js';
import { sumArrows, computeStats, fmt } from '../stats.js';
import * as L from '../sessionLogic.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, chip, sectionLabel, gearPicker } from './common.js';
import { gearChoices, gearForChoice, gearSummary } from '../gearFields.js';
import { faceSheet, faceViewBox } from './face.js';
import { SESSION_TYPES, TYPE_LABELS, isScored } from '../sessionTypes.js';
import { emptyForm, formSections } from './sessionForms.js';

export function findActive(repo) {
  return repo.list('sessions', { filter: (x) => x.status === 'active' })[0] || null;
}

export function logSubtitle(repo) {
  const a = findActive(repo);
  return a
    ? `${a.type === 'competition' ? 'Competition · ' : ''}${a.distance} m · ${faceLabel(a.face)} · ${a.arrowsPerEnd} arrows/end`
    : T.sub.logIdle;
}

export function renderLog(ctx) {
  const active = findActive(ctx.repo);
  return active ? renderActive(ctx, active) : renderSetup(ctx);
}

/** New-session setup, reachable from the bottom bar even while a session is in progress. */
/** New session: step 1 picks the type (#/new), step 2 asks that type's details (#/new/<type>). */
export function renderNewSession(ctx, params = []) {
  const type = params[0];
  if (SESSION_TYPES.includes(type)) return renderSetup(ctx, type, findActive(ctx.repo));
  return renderTypeChoice(ctx);
}

const TYPE_HINTS = {
  training: 'Score arrow by arrow with M / S grades',
  blank: 'Count arrows at the blank bale, no score',
  competition: 'Scored like training, with event and placement',
  strength: 'SPT, holding and draw drills, effort',
  mental: 'Visualisation, breathing, shot routine…',
};

function renderTypeChoice(ctx) {
  const chosen = ctx.ui.get().newType || 'training';
  return {
    content: h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row align-center' },
        h('a', { class: 'icon-btn', href: '#/home', 'aria-label': 'Back to dashboard' }, icons.back()),
        h('h1', { class: 'page-title sm grow' }, T.newSession),
      ),
      card(
        { class: 'setup-card', 'aria-label': 'Session type' },
        sectionLabel('Session type'),
        h(
          'div',
          { class: 'type-list', role: 'radiogroup', 'aria-label': 'Session type' },
          SESSION_TYPES.map((t) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                class: 'type-option',
                'aria-checked': String(chosen === t),
                dataset: { fk: `type-${t}` },
                onClick: () => ctx.ui.set({ newType: t }),
              },
              h('span', { class: 'type-option-title' }, TYPE_LABELS[t]),
              h('span', { class: 'type-option-sub' }, TYPE_HINTS[t]),
            ),
          ),
        ),
        h('a', { class: 'btn btn-primary btn-xl', href: `#/new/${chosen}`, dataset: { fk: 'start-type' } }, T.start),
      ),
    ),
  };
}

/** Apply a session transition to the stored active session and persist it. */
function update(ctx, fn, { rerender = true } = {}) {
  const cur = findActive(ctx.repo);
  if (!cur) return;
  const next = fn(cur);
  if (next === cur) return;
  if (ctx.save('sessions', next) && rerender) ctx.rerender();
}

// ---------------------------------------------------------------- new session

function renderSetup(ctx, type, active = null) {
  const settings = ctx.repo.getSettings();
  // distance and face are remembered from the last session; arrows per end always start at the default
  const last = settings.lastSetup;
  // a face no longer offered (the single 40 cm 10–6 spot) falls back to the triple
  const setup = ctx.ui.get().setup || {
    distance: last.distance,
    face: SETUP_FACES.includes(last.face) ? last.face : '40t',
    arrowsPerEnd: DEFAULT_ARROWS_PER_END,
    competition: { event: '', round: '', conditions: '' },
  };
  const set = (patch) => ctx.ui.set({ setup: { ...setup, ...patch } });
  // typing in a text field stores the draft without re-rendering, so the field keeps focus
  const quiet = (patch) => ctx.ui.quietSet({ setup: Object.assign(setup, patch) });
  // a remembered distance that is not in the list (e.g. 90 m) steps from the nearest listed one
  const distIndex = DISTANCES.reduce(
    (best, d, i) => (Math.abs(d - setup.distance) < Math.abs(DISTANCES[best] - setup.distance) ? i : best),
    0,
  );

  // equipment: the Gear tab's setup by default, or any saved setup (not asked for mental sessions)
  const snapshots = ctx.repo.list('gearSnapshots', { sort: (a, b) => b.createdAt.localeCompare(a.createdAt) });
  const gearOpts = gearChoices({ settings, snapshots });
  const gearChoice = gearOpts.options.some((o) => o[0] === setup.gear) ? setup.gear : gearOpts.value;
  const chosenGear = () => gearForChoice(gearChoice, { settings, snapshots }) || { gear: null, gearSnapshotId: null };
  const gearSection =
    type === 'mental'
      ? null
      : h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-gear' },
          sectionLabel('Equipment', 'lbl-gear'),
          gearPicker({
            ...gearOpts,
            value: gearChoice,
            summary: gearSummary(chosenGear().gear),
            onChange: (v) => set({ gear: v }),
          }),
        );

  const start = () => {
    // Only one session runs at a time: an in-progress session is finished (saved ends kept) or,
    // if it has no saved ends, discarded.
    const running = findActive(ctx.repo);
    if (running) {
      if (!confirm(L.canFinish(running) ? T.confirmReplaceFinish : T.confirmReplaceDiscard)) return;
      if (L.canFinish(running)) {
        if (!ctx.save('sessions', L.finishSession(running))) return;
      } else if (!ctx.remove('sessions', running.id)) return;
    }
    const { distance, face, arrowsPerEnd } = setup;
    ctx.repo.saveSettings({ lastSetup: { distance, face, arrowsPerEnd } });
    const session = L.createSession({
      date: todayIso(),
      type,
      distance,
      face,
      arrowsPerEnd,
      competition: type === 'competition' ? { ...setup.competition, placement: '' } : null,
      ...chosenGear(),
    });
    ctx.ui.quietSet({ setup: null });
    if (ctx.save('sessions', session)) ctx.navigate('log');
  };

  const compField = (key, label, placeholder) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h('input', {
        class: 'input',
        value: setup.competition?.[key] || '',
        placeholder,
        autocomplete: 'off',
        dataset: { fk: `comp-${key}` },
        onInput: (e) => quiet({ competition: { ...setup.competition, [key]: e.target.value } }),
      }),
    );

  // strength / mental: a form saved straight to History
  const form = setup.forms?.[type] || emptyForm(type);
  // the draft is read at call time: typing stores into `setup` without re-rendering
  const currentForm = () => setup.forms?.[type] || emptyForm(type);
  const changeForm = (update, { rerender = true } = {}) => {
    const cur = currentForm();
    const forms = { ...setup.forms, [type]: { ...cur, ...update(cur) } };
    if (rerender) set({ forms });
    else quiet({ forms });
  };
  // Blank bale / strength / mental: a timer starts when the form opens. It is kept in this device's
  // settings (not synced), so it survives the app being closed, and fills in the duration on save.
  const formTimers = settings.formTimers || {};
  let formTimer = formTimers[type];
  if (!isScored(type) && !formTimer) {
    formTimer = { running: true, startedAt: new Date().toISOString(), elapsedMs: 0 };
    ctx.repo.saveSettings({ formTimers: { ...formTimers, [type]: formTimer } });
  }
  const toggleFormTimer = () => {
    const all = ctx.repo.getSettings().formTimers || {};
    const cur = { timer: all[type] };
    const next = cur.timer?.running ? L.pauseTimer(cur) : L.resumeTimer(cur);
    ctx.saveSettings({ formTimers: { ...all, [type]: next.timer } });
    ctx.rerender();
  };

  const saveForm = () => {
    const fields = currentForm();
    const all = ctx.repo.getSettings().formTimers || {};
    // minutes typed by hand win over the timer
    const minutes = fields.minutes ?? (all[type] ? Math.round(L.timerElapsed(all[type]) / 60000) : null);
    const gear = type === 'mental' ? {} : chosenGear();
    const saved = ctx.save('sessions', { type, date: todayIso(), status: 'finished', ...fields, minutes, ...gear });
    if (!saved) return;
    ctx.repo.saveSettings({ formTimers: { ...all, [type]: null } });
    ctx.ui.quietSet({ setup: { ...setup, forms: { ...setup.forms, [type]: null } } });
    ctx.navigate(`history/${saved.id}`);
  };

  const body = isScored(type)
    ? [
        h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-dist' },
          sectionLabel(T.distance, 'lbl-dist'),
          stepper({
            label: 'distance',
            value: `${setup.distance} m`,
            canDown: distIndex > 0,
            canUp: distIndex < DISTANCES.length - 1,
            fk: 'dist',
            onStep: (dir) => {
              const d = DISTANCES[distIndex + dir];
              set({ distance: d, ...DISTANCE_DEFAULTS[d] });
            },
          }),
        ),
        h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-face' },
          sectionLabel(T.targetFace, 'lbl-face'),
          h(
            'div',
            { class: 'grid-3' },
            SETUP_FACES.map((f) =>
              chip({
                label: faceLabel(f),
                pressed: setup.face === f,
                fk: `face-${f}`,
                onClick: () => set({ face: f }),
              }),
            ),
          ),
        ),
        h(
          'section',
          { class: 'setup-section', 'aria-labelledby': 'lbl-n' },
          sectionLabel(T.arrowsPerEnd, 'lbl-n'),
          stepper({
            label: 'arrows',
            value: `${setup.arrowsPerEnd} arrows`,
            canDown: setup.arrowsPerEnd > ARROWS_PER_END_MIN,
            canUp: setup.arrowsPerEnd < ARROWS_PER_END_MAX,
            fk: 'n',
            onStep: (dir) => set({ arrowsPerEnd: setup.arrowsPerEnd + dir }),
          }),
        ),
        type === 'competition'
          ? h(
              'section',
              { class: 'setup-section', 'aria-label': 'Competition' },
              sectionLabel('Competition'),
              compField('event', 'Event', 'e.g. Indoor Cup Bratislava'),
              h(
                'div',
                { class: 'grid-2' },
                compField('round', 'Round', 'e.g. WA 18 m'),
                compField('conditions', 'Conditions', 'hall, wind, light'),
              ),
            )
          : null,
        gearSection,
        h('button', { type: 'button', class: 'btn btn-primary btn-xl', onClick: start }, T.start),
      ]
    : [
        h(
          'div',
          { class: 'spread align-center' },
          h('span', { class: 'field-label' }, 'Timer'),
          timerButton(formTimer, toggleFormTimer),
        ),
        ...formSections(type, form, changeForm),
        gearSection,
        h('button', { type: 'button', class: 'btn btn-primary btn-xl', onClick: saveForm }, 'Save session'),
      ];

  return {
    content: h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'row align-center' },
        h('a', { class: 'icon-btn', href: '#/new', 'aria-label': 'Back to session type' }, icons.back()),
        h('h1', { class: 'page-title sm grow' }, `${TYPE_LABELS[type]} session`),
      ),
      active && isScored(type)
        ? h(
            'div',
            { class: 'banner', role: 'status' },
            h(
              'span',
              null,
              T.inProgress(`${active.distance} m · ${faceLabel(active.face)}`, active.ends.length),
            ),
            h('a', { class: 'btn btn-primary btn-sm', href: '#/log' }, T.continueSession),
          )
        : null,
      card({ class: 'setup-card' }, body),
    ),
  };
}

/** − value + control for the setup card. */
function stepper({ label, value, canDown, canUp, fk, onStep }) {
  return h(
    'div',
    { class: 'stepper', role: 'group' },
    h(
      'button',
      {
        type: 'button',
        'aria-label': `Less ${label}`,
        disabled: !canDown,
        dataset: { fk: `${fk}-minus` },
        onClick: () => onStep(-1),
      },
      '−',
    ),
    h('output', { 'aria-live': 'polite' }, value),
    h(
      'button',
      {
        type: 'button',
        'aria-label': `More ${label}`,
        disabled: !canUp,
        dataset: { fk: `${fk}-plus` },
        onClick: () => onStep(1),
      },
      '+',
    ),
  );
}

/** Timer button (tap to pause / resume). The shown time is refreshed every second by the ticker. */
function timerButton(timer = null, onToggle) {
  const tm = timer || { running: false, startedAt: null, elapsedMs: 0 };
  startTimerTicker();
  return h(
    'button',
    {
      type: 'button',
      class: ['timer-btn', !tm.running && 'is-paused'],
      'aria-label': tm.running ? 'Pause the session timer' : 'Resume the session timer',
      dataset: { fk: 'timer' },
      onClick: onToggle,
    },
    tm.running ? icons.pause() : icons.play(),
    h(
      'span',
      { class: 'timer-value', dataset: { elapsed: String(tm.elapsedMs || 0), started: tm.running ? tm.startedAt : '' } },
      L.formatClock(L.timerElapsed(tm)),
    ),
  );
}

/** One ticker for the whole app: refreshes every visible session timer once a second. */
let ticker = null;
function startTimerTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    for (const el of document.querySelectorAll('.timer-value')) {
      const started = el.dataset.started;
      const timer = { running: !!started, startedAt: started || null, elapsedMs: Number(el.dataset.elapsed) || 0 };
      el.textContent = L.formatClock(L.timerElapsed(timer));
    }
  }, 1000);
}

// ---------------------------------------------------------------- active session

function renderActive(ctx, session) {
  const { cursor } = session;
  const current = L.shownEnd(session); // the end on screen (the current one or a saved one)
  const viewing = session.view != null;
  const editing = L.isEditing(session);
  const enter = (v, x, y, spot) => update(ctx, (cur) => L.enterScore(cur, v, x, y, spot));

  const endNo = L.viewIndex(session) + 1;
  const totalEnds = session.ends.length + 1;
  const sight = findSightMark(ctx.repo, session.distance);

  // --- slots
  const slots = h(
    'div',
    {
      class: ['slots', current.arrows.length > 6 && 'slots-2col'],
      role: 'group',
      'aria-label': 'Arrows in this end',
    },
    current.arrows.map((a, i) => {
      const active = i === cursor;
      return h(
        'button',
        {
          type: 'button',
          class: ['slot', active && 'is-active', active && editing && 'is-moving'],
          'aria-label': `Arrow ${i + 1}${a.v == null ? ', empty' : `, ${a.v}`}${a.m ? `, M${a.m}` : ''}${a.s ? `, S${a.s}` : ''}${active ? ', selected' : ''}`,
          dataset: { fk: `slot-${i}` },
          'aria-pressed': String(active && editing),
          onClick: () => update(ctx, (cur) => L.selectArrow(cur, i)),
        },
        h('span', { class: `score-chip z-${zoneOf(a.v)}` }, a.v == null ? String(i + 1) : String(a.v)),
        // M and S as small badges in the grade colours — as visible as the score
        h(
          'span',
          { class: 'slot-grades', 'aria-hidden': 'true' },
          h('span', { class: `mini-grade ${a.m ? `g${a.m}` : 'empty'}` }, `M${a.m ?? ''}`),
          h('span', { class: `mini-grade ${a.s ? `g${a.s}` : 'empty'}` }, `S${a.s ?? ''}`),
        ),
      );
    }),
  );

  const undoBtn = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': T.undo,
      dataset: { fk: 'undo' },
      onClick: () => update(ctx, L.undo),
    },
    icons.undo(),
  );

  const input = targetInput(session, enter, slots);

  // session timer: tap to pause / resume
  // sessions started before the timer existed show it stopped at 0:00; one tap starts it
  const timerBtn = timerButton(session.timer, () =>
    update(ctx, (c) => (c.timer?.running ? L.pauseTimer(c) : L.resumeTimer(c))),
  );

  // Tapping an arrow on the left selects it: the next target touch / key replaces it, grades below apply to it;
  // tapping it again deselects it.
  const grades = gradePanel(session, { onGrade: (kind, g) => update(ctx, (c) => L.gradeArrow(c, kind, g)) });

  const endCard = card(
    { class: 'card-bleed', 'aria-label': `End ${endNo}` },
    h(
      'div',
      { class: 'end-head' },
      // ‹ End N › — Next on the newest end saves it and starts a new one
      h(
        'div',
        { class: 'end-nav' },
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': T.prevEnd,
            disabled: !L.canPrevEnd(session),
            dataset: { fk: 'end-prev' },
            onClick: () => update(ctx, L.prevEnd),
          },
          icons.back(),
        ),
        h(
          'h2',
          { class: 'end-title' },
          `${T.end} ${endNo}`,
          h('span', { class: 'end-of muted' }, totalEnds > 1 ? ` / ${totalEnds}` : ''),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': viewing ? T.nextEnd : T.saveAndNext,
            disabled: !L.canNextEnd(session),
            dataset: { fk: 'end-next' },
            onClick: () => update(ctx, L.nextEnd),
          },
          icons.forward(),
        ),
      ),
      h('div', { class: 'end-totals' }, timerBtn, undoBtn),
    ),
    input,
    grades,
  );

  // --- end details
  const stepper = (key, label) =>
    h(
      'div',
      { class: 'field' },
      h('div', { class: 'field-label', id: `lbl-${key}` }, label),
      h(
        'div',
        { class: 'stepper', role: 'group', 'aria-labelledby': `lbl-${key}` },
        h(
          'button',
          {
            type: 'button',
            'aria-label': `Fewer ${label.toLowerCase()}`,
            dataset: { fk: `${key}-minus` },
            onClick: () => update(ctx, (c) => L.bump(c, key, -1)),
          },
          '−',
        ),
        h('output', { 'aria-live': 'polite' }, String(current[key])),
        h(
          'button',
          {
            type: 'button',
            'aria-label': `More ${label.toLowerCase()}`,
            dataset: { fk: `${key}-plus` },
            onClick: () => update(ctx, (c) => L.bump(c, key, 1)),
          },
          '+',
        ),
      ),
    );

  const canSave = L.canSaveEnd(session);
  const canFinish = L.canFinish(session);
  const finish = () => {
    const cur = findActive(ctx.repo);
    if (!cur || !L.canFinish(cur)) return;
    const done = L.finishSession(cur);
    if (ctx.save('sessions', done)) {
      ctx.sync?.now(); // put the finished session in Drive right away (no-op when sync is off)
      ctx.navigate(`history/${done.id}`);
    }
  };
  const discard = () => {
    if (!confirm(T.confirmDiscard)) return;
    ctx.remove('sessions', session.id);
    ctx.rerender();
  };

  const details = card(
    null,
    h('div', { class: 'grid-2' }, stepper('ld', T.letDowns), stepper('cld', T.correctLetDowns)),
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, T.noteForEnd),
      h('textarea', {
        rows: 2,
        placeholder: T.notePh,
        value: current.note,
        dataset: { fk: 'note' },
        onInput: (e) => update(ctx, (c) => L.setNote(c, e.target.value), { rerender: false }),
      }),
    ),
    h(
      'div',
      { class: 'row' },
      viewing
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary grow-2',
              dataset: { fk: 'back-current' },
              onClick: () => update(ctx, (c) => L.goToEnd(c, null)),
            },
            T.backToEnd(totalEnds),
          )
        : h(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary grow-2',
              disabled: !canSave,
              dataset: { fk: 'save-end' },
              onClick: () => update(ctx, L.saveEnd),
            },
            T.saveEnd(endNo),
          ),
      h(
        'button',
        { type: 'button', class: 'btn btn-outline grow-1', disabled: !canFinish, onClick: finish },
        T.finish,
      ),
    ),
  );

  // --- saved ends (newest first)
  let run = 0;
  const rows = session.ends.map((e, i) => {
    const sc = sumArrows(e.arrows);
    run += sc;
    const st = computeStats([e]);
    return h(
      'li',
      null,
      h(
        'button',
        {
          type: 'button',
          class: ['saved-end', session.view === i && 'is-viewed'],
          'aria-label': `Open end ${i + 1}`,
          'aria-current': session.view === i ? 'true' : null,
          onClick: () => update(ctx, (c) => L.goToEnd(c, i)),
        },
        h('span', { class: 'saved-end-no' }, `E${i + 1}`),
        h(
          'div',
          { class: 'saved-end-body' },
          h(
            'div',
            { class: 'saved-end-arrows' },
            e.arrows.map((a) => (a.v == null ? '–' : String(a.v))).join('  '),
          ),
          h('div', { class: 'muted small' }, `M ${fmt(st.avgM)} · S ${fmt(st.avgS)} · LD ${e.cld}/${e.ld}`),
        ),
        h(
          'div',
          { class: 'saved-end-score' },
          h('strong', null, String(sc)),
          h('span', { class: 'muted xsmall' }, `Σ ${run}`),
        ),
      ),
    );
  });

  // Distance, face and arrows/end are already in the header subtitle; only the sight mark is shown here.
  const pills =
    sight && (sight.elevation || sight.windage)
      ? h(
          'div',
          { class: 'pills' },
          h(
            'span',
            { class: 'pill pill-accent' },
            `Sight ${[sight.elevation, sight.windage].filter(Boolean).join(' / ')}`,
          ),
        )
      : null;

  return {
    content: h(
      'div',
      { class: 'stack' },
      pills,
      endCard,
      details,
      rows.length
        ? card(
            { class: 'card-list', 'aria-label': 'Saved ends' },
            h('ol', { class: 'saved-ends', reversed: true }, rows.reverse()),
          )
        : null,
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: discard }, T.discardSession),
    ),
  };
}

function findSightMark(repo, distance) {
  return repo.list('sightMarks').find((m) => parseInt(m.distance, 10) === distance) || null;
}

// ---------------------------------------------------------------- target face

const LOUPE_SPAN = 24; // viewBox units shown in the magnifier (the face is 202 wide → ~3× zoom)

function arrowDots(session) {
  const at = (a) => sheetPoint(a, session.face);
  const prev = L.otherEnds(session)
    .flatMap((e) => e.arrows)
    .filter((a) => a.x != null);
  const cur = L.shownEnd(session)
    .arrows.map((a, i) => ({ a, i }))
    .filter(({ a }) => a.x != null);
  const movingIdx = L.isEditing(session) ? session.cursor : -1;
  return [
    ...prev.map((a) =>
      s('circle', {
        cx: at(a).x,
        cy: at(a).y,
        r: 3.2,
        fill: 'rgba(20,24,28,0.6)',
        stroke: '#FFFFFF',
        'stroke-width': 1.2,
      }),
    ),
    ...cur.map(({ a, i }) =>
      s(
        'g',
        { transform: `translate(${at(a).x} ${at(a).y})`, opacity: i === movingIdx ? 0.55 : null },
        // the arrow being moved gets a dashed ring so you can see which one will change
        i === movingIdx
          ? s('circle', {
              r: 10,
              fill: 'none',
              stroke: '#E5007E',
              'stroke-width': 1.4,
              'stroke-dasharray': '2.5 2',
            })
          : null,
        s('circle', { r: 6.4, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 1.3 }),
        s(
          'text',
          { y: 2.3, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 700, fill: '#FFFFFF' },
          String(i + 1),
        ),
      ),
    ),
  ];
}

/**
 * Target face input. Touch (or press) shows a magnifier with the exact hit point and its score;
 * moving the finger fine-tunes the position; releasing registers the arrow. Cancel = no arrow.
 */
function targetInput(session, enter, slots) {
  const selectedValue = L.shownEnd(session).arrows[session.cursor]?.v ?? null;
  // magnifier: zoomed copy of the face centred on the finger, with a crosshair and the live score
  const marker = s(
    'g',
    null,
    s('circle', { r: 1.1, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 0.4 }),
    s('path', {
      d: 'M-4 0h2.4M1.6 0h2.4M0 -4v2.4M0 1.6v2.4',
      stroke: '#E5007E',
      'stroke-width': 0.45,
      'stroke-linecap': 'round',
    }),
  );
  const loupeSvg = s(
    'svg',
    { 'aria-hidden': 'true', focusable: 'false' },
    faceSheet(session.face),
    arrowDots(session),
    marker,
  );
  const loupeScore = h('span', { class: 'score-chip loupe-score' });
  const loupe = h('div', { class: 'loupe', 'aria-hidden': 'true', hidden: true }, loupeSvg, loupeScore);

  let active = null; // { id, p } with p in sheet coordinates (one spot's radius = 1)
  const sheet = s(
    'svg',
    { viewBox: faceViewBox(session.face), 'aria-hidden': 'true', focusable: 'false' },
    faceSheet(session.face),
    arrowDots(session),
  );
  const btn = h(
    'button',
    {
      type: 'button',
      class: ['target-btn', isMultiSpot(session.face) && 'target-sheet'],
      'aria-label':
        'Target face: touch where the arrow landed, slide to fine-tune, release to score (keyboard users: use Keypad)',
    },
    sheet,
  );

  const toFace = (ev) => {
    const r = btn.getBoundingClientRect();
    // screen → SVG units (the sheet may be letterboxed inside the square button)
    const m = sheet.getScreenCTM()?.inverse();
    const pt = m ? new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m) : { x: 0, y: 0 };
    return {
      x: pt.x / 100,
      y: pt.y / 100,
      // finger position inside the stage, used to keep the loupe out from under the finger
      px: ev.clientX - r.left,
      py: ev.clientY - r.top,
    };
  };

  // The loupe floats above the target face (over the arrow slots), centred, so it never covers the face.
  // If the page is scrolled so there is no room above, it stays just below the header and moves
  // sideways away from the finger.
  const placeLoupe = (p) => {
    const size = loupe.offsetWidth || 132;
    const gap = 10;
    const stage = btn.getBoundingClientRect();
    const headerBottom = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
    let top = stage.top - size - gap;
    let left = stage.left + stage.width / 2 - size / 2;
    if (top < headerBottom + gap) {
      top = headerBottom + gap;
      const fingerX = stage.left + p.px;
      const fingerY = stage.top + p.py;
      const covers = fingerY < top + size + 30 && fingerX > left - 30 && fingerX < left + size + 30;
      if (covers) left = fingerX < stage.left + stage.width / 2 ? stage.right - size : stage.left;
    }
    loupe.style.top = `${Math.round(top)}px`;
    loupe.style.left = `${Math.round(left)}px`;
  };

  const show = (p) => {
    const cx = p.x * 100;
    const cy = p.y * 100;
    loupeSvg.setAttribute(
      'viewBox',
      `${cx - LOUPE_SPAN / 2} ${cy - LOUPE_SPAN / 2} ${LOUPE_SPAN} ${LOUPE_SPAN}`,
    );
    marker.setAttribute('transform', `translate(${cx} ${cy})`);
    const hit = locateOnSheet(p.x, p.y, session.face);
    const v = scoreFromPoint(hit.x, hit.y, session.face);
    loupeScore.textContent = String(v);
    loupeScore.className = `score-chip loupe-score z-${zoneOf(v)}`;
    loupe.hidden = false;
    placeLoupe(p);
  };

  const end = (ev, commit) => {
    if (!active || ev.pointerId !== active.id) return;
    const p = active.p;
    active = null;
    loupe.hidden = true;
    btn.classList.remove('aiming');
    if (!commit) return;
    const hit = locateOnSheet(p.x, p.y, session.face);
    const keep = Math.hypot(hit.x, hit.y) < 1.05;
    enter(
      scoreFromPoint(hit.x, hit.y, session.face),
      keep ? round3(hit.x) : null,
      keep ? round3(hit.y) : null,
      hit.spot,
    );
  };

  btn.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ev.button > 0 || active) return;
    ev.preventDefault();
    try {
      btn.setPointerCapture(ev.pointerId); // keep receiving moves when the finger leaves the face
    } catch {
      /* pointer already gone */
    }
    active = { id: ev.pointerId, p: toFace(ev) };
    btn.classList.add('aiming');
    show(active.p);
  });
  btn.addEventListener('pointermove', (ev) => {
    if (!active || ev.pointerId !== active.id) return;
    active.p = toFace(ev);
    show(active.p);
  });
  btn.addEventListener('pointerup', (ev) => end(ev, true));
  btn.addEventListener('pointercancel', (ev) => end(ev, false));
  btn.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return h(
    'div',
    { class: 'target-wrap' },
    // arrow slots in a column on the left, target face on the right
    h(
      'div',
      { class: ['aim-row', session.arrowsPerEnd > 6 && 'aim-row-wide'] },
      slots,
      h('div', { class: 'target-stage' }, btn, loupe),
    ),
    h(
      'div',
      { class: 'quick-keys', role: 'group', 'aria-label': 'Quick score without position' },
      ['X', 10, 9, 8, 7, 6, 'M'].map((k) =>
        h(
          'button',
          {
            type: 'button',
            class: `quick-key z-${zoneOf(k)}`,
            'aria-label': `Score ${k === 'M' ? 'miss' : k}`,
            // the selected arrow's score is shown pressed; the other keys dim (like the grade rows)
            'aria-pressed': String(selectedValue === k),
            dataset: { fk: `quick-${k}` },
            onClick: () => enter(k, null, null),
          },
          String(k),
        ),
      ),
    ),
  );
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- inline grades

/** Two compact rows (M and S, grades 1–5) for the selected arrow, styled like the score keys. */
function gradePanel(session, { onGrade }) {
  const a = L.shownEnd(session).arrows[session.cursor];
  const row = (kind, label, full) =>
    h(
      'div',
      { class: 'grade-line', role: 'group', 'aria-label': `${full} for arrow ${session.cursor + 1}` },
      h('span', { class: 'grade-line-label', 'aria-hidden': 'true' }, label),
      [1, 2, 3, 4, 5].map((g) =>
        h(
          'button',
          {
            type: 'button',
            class: `grade-key g${g}`,
            'aria-pressed': String(a[kind] === g),
            'aria-label': `${full} ${g}`,
            dataset: { fk: `grade-${kind}-${g}` },
            onClick: () => onGrade(kind, g),
          },
          String(g),
        ),
      ),
    );
  return h('div', { class: 'grade-panel' }, row('m', 'M', T.mentalProgram), row('s', 'S', T.shootingCycle));
}
