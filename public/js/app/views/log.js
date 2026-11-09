// Log tab: new session setup → arrow-by-arrow logging with the M/S grading sheet (HANDOFF §3).
import { h, s, todayIso } from '../../core/dom.js';
import {
  DISTANCES,
  FACE_IDS,
  ARROWS_PER_END,
  DISTANCE_DEFAULTS,
  faceLabel,
  isSpotFace,
  keypadValues,
  scoreFromPoint,
  zoneOf,
} from '../scoring.js';
import { sumArrows, computeStats, fmt } from '../stats.js';
import * as L from '../sessionLogic.js';
import { RUBRIC, T } from '../strings.js';
import { icons } from '../icons.js';
import { card, chip, gradeBadge, scoreChip, sectionLabel } from './common.js';

export function findActive(repo) {
  return repo.list('sessions', { filter: (x) => x.status === 'active' })[0] || null;
}

export function logSubtitle(repo) {
  const a = findActive(repo);
  return a ? `${a.distance} m · ${faceLabel(a.face)} · ${a.arrowsPerEnd} arrows/end` : T.sub.logIdle;
}

export function renderLog(ctx) {
  const active = findActive(ctx.repo);
  return active ? renderActive(ctx, active) : renderSetup(ctx);
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

function renderSetup(ctx) {
  const settings = ctx.repo.getSettings();
  const setup = ctx.ui.get().setup || settings.lastSetup;
  const set = (patch) => ctx.ui.set({ setup: { ...setup, ...patch } });

  const start = () => {
    ctx.repo.saveSettings({ lastSetup: setup });
    const session = L.createSession({
      date: todayIso(),
      ...setup,
      inputMode: settings.defaultInput,
      gear: { ...settings.gear },
      gearSnapshotId: settings.activeSnapshotId,
    });
    ctx.ui.quietSet({ setup: null });
    if (ctx.save('sessions', session)) ctx.rerender();
  };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return {
    content: h(
      'div',
      { class: 'stack' },
      h('div', null, h('h1', { class: 'page-title' }, T.newSession), h('div', { class: 'muted small' }, `${today} · ${T.training}`)),
      card(
        { 'aria-labelledby': 'lbl-dist' },
        sectionLabel(T.distance, 'lbl-dist'),
        h(
          'div',
          { class: 'grid-4' },
          DISTANCES.map((d) =>
            chip({ label: `${d} m`, pressed: setup.distance === d, fk: `dist-${d}`, onClick: () => set({ distance: d, ...DISTANCE_DEFAULTS[d] }) }),
          ),
        ),
      ),
      card(
        { 'aria-labelledby': 'lbl-face' },
        sectionLabel(T.targetFace, 'lbl-face'),
        h(
          'div',
          { class: 'grid-3' },
          FACE_IDS.map((f) => chip({ label: faceLabel(f), pressed: setup.face === f, fk: `face-${f}`, onClick: () => set({ face: f }) })),
        ),
      ),
      card(
        { 'aria-labelledby': 'lbl-n' },
        sectionLabel(T.arrowsPerEnd, 'lbl-n'),
        h(
          'div',
          { class: 'grid-2' },
          ARROWS_PER_END.map((n) =>
            chip({
              label: `${n} arrows`,
              sub: n === 3 ? T.indoorStyle : T.outdoorStyle,
              pressed: setup.arrowsPerEnd === n,
              fk: `n-${n}`,
              onClick: () => set({ arrowsPerEnd: n }),
            }),
          ),
        ),
      ),
      h('p', { class: 'muted small center' }, T.smartDefaults),
      h('button', { type: 'button', class: 'btn btn-primary btn-xl', onClick: start }, T.start(setup.distance, faceLabel(setup.face))),
    ),
  };
}

// ---------------------------------------------------------------- active session

function renderActive(ctx, session) {
  const settings = ctx.repo.getSettings();
  const askGrades = settings.askGrades;
  const { current, cursor, arrowsPerEnd: n } = session;
  const mode = session.inputMode || settings.defaultInput;
  const enter = (v, x, y) => update(ctx, (cur) => L.enterScore(cur, v, x, y, { askGrades }));

  const endScore = sumArrows(current.arrows);
  const savedTotal = session.ends.reduce((t, e) => t + sumArrows(e.arrows), 0);
  const endNo = session.ends.length + 1;
  const sight = findSightMark(ctx.repo, session.distance);

  // --- slots
  const slots = h(
    'div',
    { class: 'slots', style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } },
    current.arrows.map((a, i) => {
      const active = i === cursor;
      return h(
        'button',
        {
          type: 'button',
          class: ['slot', active && 'is-active'],
          'aria-label': `Arrow ${i + 1}${a.v == null ? ', empty' : `, ${a.v}`}${a.m ? `, M${a.m}` : ''}${a.s ? `, S${a.s}` : ''}${active ? ', selected' : ''}`,
          dataset: { fk: `slot-${i}` },
          onClick: () => update(ctx, (cur) => L.pickSlot(cur, i)),
        },
        h('span', { class: `score-chip z-${zoneOf(a.v)}` }, a.v == null ? String(i + 1) : String(a.v)),
        h('span', { class: 'slot-grades' }, `M${a.m ?? '–'} S${a.s ?? '–'}`),
      );
    }),
  );

  // --- input mode toggle
  const toggle = h(
    'div',
    { class: 'toolbar' },
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Input mode' },
      [
        ['keypad', T.keypad],
        ['target', T.targetFaceToggle],
      ].map(([m, label]) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(mode === m),
            dataset: { fk: `mode-${m}` },
            onClick: () => update(ctx, (cur) => L.setInputMode(cur, m)),
          },
          label,
        ),
      ),
    ),
    h(
      'button',
      { type: 'button', class: 'icon-btn', 'aria-label': T.undo, dataset: { fk: 'undo' }, onClick: () => update(ctx, L.undo) },
      icons.undo(),
    ),
  );

  const input = mode === 'keypad' ? keypad(session.face, enter) : targetInput(session, enter);

  const endCard = card(
    { 'aria-label': `End ${endNo}` },
    h(
      'div',
      { class: 'end-head' },
      h('h2', { class: 'end-title' }, `${T.end} ${endNo}`),
      h(
        'div',
        { class: 'end-totals' },
        h('span', null, `${T.end} `, h('strong', null, String(endScore))),
        h('span', null, `${T.total} `, h('strong', null, String(savedTotal + endScore))),
      ),
    ),
    slots,
    toggle,
    input,
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
        h('button', { type: 'button', 'aria-label': `Fewer ${label.toLowerCase()}`, dataset: { fk: `${key}-minus` }, onClick: () => update(ctx, (c) => L.bump(c, key, -1)) }, '−'),
        h('output', { 'aria-live': 'polite' }, String(current[key])),
        h('button', { type: 'button', 'aria-label': `More ${label.toLowerCase()}`, dataset: { fk: `${key}-plus` }, onClick: () => update(ctx, (c) => L.bump(c, key, 1)) }, '+'),
      ),
    );

  const canSave = L.canSaveEnd(session);
  const canFinish = L.canFinish(session);
  const finish = () => {
    const cur = findActive(ctx.repo);
    if (!cur || !L.canFinish(cur)) return;
    if (L.hasUnsavedArrows(cur) && !confirm(T.confirmFinishPartial(cur.ends.length + 1))) return;
    const done = L.finishSession(cur);
    if (ctx.save('sessions', done)) ctx.navigate(`history/${done.id}`);
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
      h(
        'button',
        { type: 'button', class: 'btn btn-primary grow-2', disabled: !canSave, dataset: { fk: 'save-end' }, onClick: () => update(ctx, L.saveEnd) },
        T.saveEnd(endNo),
      ),
      h('button', { type: 'button', class: 'btn btn-outline grow-1', disabled: !canFinish, onClick: finish }, T.finish),
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
      { class: 'saved-end' },
      h('span', { class: 'saved-end-no' }, `E${i + 1}`),
      h(
        'div',
        { class: 'saved-end-body' },
        h('div', { class: 'saved-end-arrows' }, e.arrows.map((a) => String(a.v)).join('  ')),
        h('div', { class: 'muted small' }, `M ${fmt(st.avgM)} · S ${fmt(st.avgS)} · LD ${e.cld}/${e.ld}`),
      ),
      h('div', { class: 'saved-end-score' }, h('strong', null, String(sc)), h('span', { class: 'muted xsmall' }, `Σ ${run}`)),
    );
  });

  const pills = h(
    'div',
    { class: 'pills' },
    h('span', { class: 'pill' }, `${session.distance} m`),
    h('span', { class: 'pill' }, `${faceLabel(session.face)} face`),
    h('span', { class: 'pill' }, `${n} arrows/end`),
    sight && (sight.elevation || sight.windage)
      ? h('span', { class: 'pill pill-accent' }, `Sight ${[sight.elevation, sight.windage].filter(Boolean).join(' / ')}`)
      : null,
  );

  return {
    content: h(
      'div',
      { class: 'stack' },
      pills,
      endCard,
      h('p', { class: 'muted small center tight' }, T.hint),
      details,
      rows.length ? card({ class: 'card-list', 'aria-label': 'Saved ends' }, h('ol', { class: 'saved-ends', reversed: true }, rows.reverse())) : null,
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: discard }, T.discardSession),
    ),
    overlay: session.asking ? gradeSheet(ctx, session) : null,
  };
}

function findSightMark(repo, distance) {
  return repo.list('sightMarks').find((m) => parseInt(m.distance, 10) === distance) || null;
}

function keypad(face, enter) {
  return h(
    'div',
    { class: 'keypad' },
    keypadValues(face).map((k) =>
      h(
        'button',
        { type: 'button', class: `key z-${zoneOf(k)}`, 'aria-label': `Score ${k === 'M' ? 'miss' : k}`, dataset: { fk: `key-${k}` }, onClick: () => enter(k, null, null) },
        String(k),
      ),
    ),
  );
}

// ---------------------------------------------------------------- target face

const VB = 101; // viewBox half-size; the face radius is 100

function faceRings(face) {
  const ring = (r, fill, stroke, sw = 0.6) => s('circle', { r, fill, stroke, 'stroke-width': sw });
  if (isSpotFace(face)) {
    return [
      ring(100, '#00A2E8', '#14181C', 0.8),
      ring(80, '#D22B2B', '#14181C', 0.8),
      ring(60, '#D22B2B', '#14181C', 0.8),
      ring(40, '#FFE11A', '#14181C', 0.8),
      ring(20, '#FFE11A', '#14181C', 0.8),
      ring(10, 'none', '#14181C', 0.6),
      s('path', { d: 'M-2 0h4M0 -2v4', stroke: '#14181C', 'stroke-width': 0.6 }),
    ];
  }
  const colours = ['#FFFFFF', '#FFFFFF', '#1A1A1A', '#1A1A1A', '#00A2E8', '#00A2E8', '#D22B2B', '#D22B2B', '#FFE11A', '#FFE11A'];
  return [
    ...colours.map((fill, i) => ring(100 - i * 10, fill, fill === '#1A1A1A' ? '#FFFFFF' : '#14181C')),
    ring(5, 'none', '#14181C', 0.5),
    s('path', { d: 'M-1.5 0h3M0 -1.5v3', stroke: '#14181C', 'stroke-width': 0.5 }),
  ];
}

const LOUPE_SPAN = 24; // viewBox units shown in the magnifier (the face is 202 wide → ~3× zoom)

function arrowDots(session) {
  const prev = session.ends.flatMap((e) => e.arrows).filter((a) => a.x != null);
  const cur = session.current.arrows.map((a, i) => ({ a, i })).filter(({ a }) => a.x != null);
  return [
    ...prev.map((a) => s('circle', { cx: a.x * 100, cy: a.y * 100, r: 3.2, fill: 'rgba(20,24,28,0.6)', stroke: '#FFFFFF', 'stroke-width': 1.2 })),
    ...cur.map(({ a, i }) =>
      s(
        'g',
        { transform: `translate(${a.x * 100} ${a.y * 100})` },
        s('circle', { r: 6.4, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 1.3 }),
        s('text', { y: 2.3, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 700, fill: '#FFFFFF' }, String(i + 1)),
      ),
    ),
  ];
}

/**
 * Target face input. Touch (or press) shows a magnifier with the exact hit point and its score;
 * moving the finger fine-tunes the position; releasing registers the arrow. Cancel = no arrow.
 */
function targetInput(session, enter) {
  // magnifier: zoomed copy of the face centred on the finger, with a crosshair and the live score
  const marker = s(
    'g',
    null,
    s('circle', { r: 1.1, fill: '#E5007E', stroke: '#FFFFFF', 'stroke-width': 0.4 }),
    s('path', { d: 'M-4 0h2.4M1.6 0h2.4M0 -4v2.4M0 1.6v2.4', stroke: '#E5007E', 'stroke-width': 0.45, 'stroke-linecap': 'round' }),
  );
  const loupeSvg = s('svg', { 'aria-hidden': 'true', focusable: 'false' }, faceRings(session.face), arrowDots(session), marker);
  const loupeScore = h('span', { class: 'score-chip loupe-score' });
  const loupe = h('div', { class: 'loupe', 'aria-hidden': 'true', hidden: true }, loupeSvg, loupeScore);

  let active = null; // { id, x, y }
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'target-btn',
      'aria-label': 'Target face: touch where the arrow landed, slide to fine-tune, release to score (keyboard users: use Keypad)',
    },
    s('svg', { viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`, 'aria-hidden': 'true', focusable: 'false' }, faceRings(session.face), arrowDots(session)),
  );

  const toFace = (ev) => {
    const r = btn.getBoundingClientRect();
    return {
      x: (((ev.clientX - r.left) / r.width) * 2 * VB - VB) / 100,
      y: (((ev.clientY - r.top) / r.height) * 2 * VB - VB) / 100,
      // finger position inside the stage, used to keep the loupe out from under the finger
      px: ev.clientX - r.left,
      py: ev.clientY - r.top,
    };
  };

  const show = (p) => {
    const cx = p.x * 100;
    const cy = p.y * 100;
    loupeSvg.setAttribute('viewBox', `${cx - LOUPE_SPAN / 2} ${cy - LOUPE_SPAN / 2} ${LOUPE_SPAN} ${LOUPE_SPAN}`);
    marker.setAttribute('transform', `translate(${cx} ${cy})`);
    const v = scoreFromPoint(p.x, p.y, session.face);
    loupeScore.textContent = String(v);
    loupeScore.className = `score-chip loupe-score z-${zoneOf(v)}`;
    // top-left by default; jump to top-right while the finger is under the top-left corner
    const size = loupe.offsetWidth || 128;
    loupe.classList.toggle('right', p.px < size + 24 && p.py < size + 24);
    loupe.hidden = false;
  };

  const end = (ev, commit) => {
    if (!active || ev.pointerId !== active.id) return;
    const p = active.p;
    active = null;
    loupe.hidden = true;
    btn.classList.remove('aiming');
    if (!commit) return;
    const keep = Math.hypot(p.x, p.y) < 1.05;
    enter(scoreFromPoint(p.x, p.y, session.face), keep ? round3(p.x) : null, keep ? round3(p.y) : null);
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
    h('div', { class: 'target-stage' }, btn, loupe),
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'button', class: 'btn key-wide z-miss', dataset: { fk: 'tap-miss' }, onClick: () => enter('M', null, null) }, T.miss),
      h('button', { type: 'button', class: 'btn key-wide z-gold', dataset: { fk: 'tap-x' }, onClick: () => enter('X', null, null) }, 'X'),
    ),
    h('p', { class: 'muted small center tight' }, T.prevDots),
  );
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- grading sheet

function gradeSheet(ctx, session) {
  const kind = session.step === 's' ? 's' : 'm';
  const a = session.current.arrows[session.cursor];
  const title = kind === 's' ? T.shootingCycle : T.mentalProgram;
  const skip = () => update(ctx, L.skipGrade);

  const node = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'grade-title', 'aria-describedby': 'grade-step' },
    h(
      'div',
      { class: 'sheet-head' },
      scoreChip(a.v ?? '—', 'score-chip-lg'),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'muted small strong', id: 'grade-step' }, `Arrow ${session.cursor + 1} of ${session.arrowsPerEnd} · Step ${kind === 'm' ? 1 : 2} of 2`),
        h('h2', { class: 'sheet-title', id: 'grade-title' }, title),
      ),
      h('button', { type: 'button', class: 'btn btn-pill', 'aria-label': 'Skip grading this arrow', onClick: skip }, T.skip),
    ),
    h('div', { class: 'progress', 'aria-hidden': 'true' }, h('span', { class: 'on' }), h('span', { class: kind === 's' ? 'on' : '' })),
    h(
      'div',
      { class: 'grade-rows' },
      [1, 2, 3, 4, 5].map((g) => {
        const on = a[kind] === g;
        return h(
          'button',
          {
            type: 'button',
            class: 'grade-row',
            'aria-pressed': String(on),
            dataset: on || (a[kind] == null && g === 1) ? { autofocus: '' } : undefined,
            onClick: () => update(ctx, (c) => L.gradeArrow(c, kind, g)),
          },
          gradeBadge(g, 'grade-badge-lg'),
          h('span', null, RUBRIC[kind][g - 1]),
        );
      }),
    ),
    h(
      'div',
      { class: 'row sheet-foot' },
      kind === 's' ? h('button', { type: 'button', class: 'btn btn-outline-thin', onClick: () => update(ctx, L.backToM) }, T.backToM) : null,
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn btn-outline-thin', onClick: () => update(ctx, L.changeScore) }, T.changeScore),
    ),
  );
  return { node, onClose: skip, below: 'header' };
}
