// Log tab: new session setup → arrow-by-arrow logging with the M/S grading sheet (HANDOFF §3).
import { h, s, todayIso } from '../../core/dom.js';
import {
  DISTANCES,
  FACE_IDS,
  ARROWS_PER_END,
  DISTANCE_DEFAULTS,
  faceLabel,
  isSpotFace,
  scoreFromPoint,
  zoneOf,
} from '../scoring.js';
import { sumArrows, computeStats, fmt } from '../stats.js';
import * as L from '../sessionLogic.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { card, chip, sectionLabel } from './common.js';

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

/** New-session setup, reachable from the bottom bar even while a session is in progress. */
export function renderNewSession(ctx) {
  return renderSetup(ctx, findActive(ctx.repo));
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

function renderSetup(ctx, active = null) {
  const settings = ctx.repo.getSettings();
  const setup = ctx.ui.get().setup || settings.lastSetup;
  const set = (patch) => ctx.ui.set({ setup: { ...setup, ...patch } });

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
    ctx.repo.saveSettings({ lastSetup: setup });
    const session = L.createSession({
      date: todayIso(),
      ...setup,
      gear: { ...settings.gear },
      gearSnapshotId: settings.activeSnapshotId,
    });
    ctx.ui.quietSet({ setup: null });
    if (ctx.save('sessions', session)) ctx.navigate('log');
  };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return {
    content: h(
      'div',
      { class: 'stack' },
      h('div', null, h('h1', { class: 'page-title' }, T.newSession), h('div', { class: 'muted small' }, `${today} · ${T.training}`)),
      active
        ? h(
            'div',
            { class: 'banner', role: 'status' },
            h('span', null, T.inProgress(`${active.distance} m · ${faceLabel(active.face)}`, active.ends.length)),
            h('a', { class: 'btn btn-primary btn-sm', href: '#/log' }, T.continueSession),
          )
        : null,
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
  const { current, cursor } = session;
  const editing = L.isEditing(session);
  const enter = (v, x, y) => update(ctx, (cur) => L.enterScore(cur, v, x, y));

  const endNo = session.ends.length + 1;
  const sight = findSightMark(ctx.repo, session.distance);

  // --- slots
  const slots = h(
    'div',
    { class: 'slots', role: 'group', 'aria-label': 'Arrows in this end' },
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
        h('span', { class: 'slot-grades' }, `M${a.m ?? '–'} S${a.s ?? '–'}`),
      );
    }),
  );

  const undoBtn = h(
    'button',
    { type: 'button', class: 'icon-btn', 'aria-label': T.undo, dataset: { fk: 'undo' }, onClick: () => update(ctx, L.undo) },
    icons.undo(),
  );

  const input = targetInput(session, enter, slots);

  // Edit mode (an existing arrow tapped): the next target touch / key replaces it; Delete / Done in the grades header.
  const grades = gradePanel(session, {
    onGrade: (kind, g) => update(ctx, (c) => L.gradeArrow(c, kind, g)),
    onDelete: () => update(ctx, L.clearArrow),
    onDone: () => update(ctx, L.doneEditing),
  });

  const endCard = card(
    { 'aria-label': `End ${endNo}` },
    h(
      'div',
      { class: 'end-head' },
      h('h2', { class: 'end-title' }, `${T.end} ${endNo}`),
      h(
        'div',
        { class: 'end-totals' },
        undoBtn,
      ),
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

  // Distance, face and arrows/end are already in the header subtitle; only the sight mark is shown here.
  const pills =
    sight && (sight.elevation || sight.windage)
      ? h('div', { class: 'pills' }, h('span', { class: 'pill pill-accent' }, `Sight ${[sight.elevation, sight.windage].filter(Boolean).join(' / ')}`))
      : null;

  return {
    content: h(
      'div',
      { class: 'stack' },
      pills,
      endCard,
      details,
      rows.length ? card({ class: 'card-list', 'aria-label': 'Saved ends' }, h('ol', { class: 'saved-ends', reversed: true }, rows.reverse())) : null,
      h('button', { type: 'button', class: 'btn btn-text danger', onClick: discard }, T.discardSession),
    ),
  };
}

function findSightMark(repo, distance) {
  return repo.list('sightMarks').find((m) => parseInt(m.distance, 10) === distance) || null;
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
  const movingIdx = L.isEditing(session) ? session.cursor : -1;
  return [
    ...prev.map((a) => s('circle', { cx: a.x * 100, cy: a.y * 100, r: 3.2, fill: 'rgba(20,24,28,0.6)', stroke: '#FFFFFF', 'stroke-width': 1.2 })),
    ...cur.map(({ a, i }) =>
      s(
        'g',
        { transform: `translate(${a.x * 100} ${a.y * 100})`, opacity: i === movingIdx ? 0.55 : null },
        // the arrow being moved gets a dashed ring so you can see which one will change
        i === movingIdx ? s('circle', { r: 10, fill: 'none', stroke: '#E5007E', 'stroke-width': 1.4, 'stroke-dasharray': '2.5 2' }) : null,
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
function targetInput(session, enter, slots) {
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
    loupeSvg.setAttribute('viewBox', `${cx - LOUPE_SPAN / 2} ${cy - LOUPE_SPAN / 2} ${LOUPE_SPAN} ${LOUPE_SPAN}`);
    marker.setAttribute('transform', `translate(${cx} ${cy})`);
    const v = scoreFromPoint(p.x, p.y, session.face);
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
    // arrow slots in a column on the left, target face on the right
    h('div', { class: 'aim-row' }, slots, h('div', { class: 'target-stage' }, btn, loupe)),
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
function gradePanel(session, { onGrade, onDelete, onDone }) {
  const editing = L.isEditing(session);
  const a = session.current.arrows[session.cursor];
  const scored = a.v != null;
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
  return h(
    'div',
    { class: 'grade-panel' },
    h(
      'div',
      { class: ['grade-panel-head small', editing ? 'is-editing' : 'muted'], role: editing ? 'status' : null },
      h('span', { class: `score-chip score-chip-sm z-${zoneOf(a.v)}` }, scored ? String(a.v) : String(session.cursor + 1)),
      h(
        'span',
        { class: 'grow' },
        editing
          ? [h('strong', null, T.editingArrow(session.cursor + 1)), h('span', { class: 'sr-only' }, ` ${T.editHint}`)]
          : scored
            ? T.gradeArrow(session.cursor + 1)
            : T.gradeUnscored(session.cursor + 1),
      ),
      editing ? h('button', { type: 'button', class: 'btn btn-outline-thin btn-sm danger-text', onClick: onDelete }, T.delete) : null,
      editing ? h('button', { type: 'button', class: 'btn btn-outline-thin btn-sm', onClick: onDone }, T.done) : null,
    ),
    row('m', 'M', T.mentalProgram),
    row('s', 'S', T.shootingCycle),
  );
}
