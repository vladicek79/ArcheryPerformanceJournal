// Active-session state transitions (HANDOFF §3). Pure: every function returns a new session object.
// The active session is persisted after every transition so the app resumes exactly where it was.

export function emptyArrow() {
  return { v: null, m: null, s: null, x: null, y: null };
}

export function emptyEnd(n) {
  return { arrows: Array.from({ length: n }, emptyArrow), ld: 0, cld: 0, note: '' };
}

export function createSession({ date, distance, face, arrowsPerEnd, inputMode = 'target', gear = null, gearSnapshotId = null }) {
  return {
    date,
    distance,
    face,
    arrowsPerEnd,
    status: 'active',
    ends: [],
    current: emptyEnd(arrowsPerEnd),
    cursor: 0,
    pinned: false,
    asking: false,
    step: 'm',
    inputMode,
    gear,
    gearSnapshotId,
  };
}

const clone = (s) => structuredClone(s);

export function nextEmpty(arrows) {
  return arrows.findIndex((a) => a.v == null);
}

function advance(s) {
  s.asking = false;
  s.step = 'm';
  s.pinned = false;
  const ne = nextEmpty(s.current.arrows);
  if (ne >= 0) s.cursor = ne;
  return s;
}

/** Record a score (keypad, target tap, Miss or X) at the cursor. */
export function enterScore(session, v, x = null, y = null, { askGrades = true } = {}) {
  const s = clone(session);
  const arrows = s.current.arrows;
  let cur = s.cursor;
  if (!s.pinned && arrows[cur].v != null) {
    const ne = nextEmpty(arrows);
    if (ne < 0) return session; // end is full: ignore until the end is saved or a slot is picked
    cur = ne;
  }
  arrows[cur] = { ...arrows[cur], v, x: x ?? null, y: y ?? null };
  s.cursor = cur;
  s.pinned = false;
  if (askGrades) {
    s.asking = true;
    s.step = 'm';
    return s;
  }
  return advance(s);
}

/** Store an M or S grade for the arrow at the cursor. M moves on to S; S closes the sheet. */
export function gradeArrow(session, kind, g) {
  const s = clone(session);
  s.current.arrows[s.cursor][kind] = g;
  if (kind === 'm') {
    s.step = 's';
    return s;
  }
  return advance(s);
}

export function skipGrade(session) {
  return advance(clone(session));
}

export function backToM(session) {
  return { ...clone(session), step: 'm' };
}

/** Close the sheet and pin the slot so the next score input overwrites it (grades are kept). */
export function changeScore(session) {
  return { ...clone(session), asking: false, step: 'm', pinned: true };
}

/** Tapping a scored slot reopens grading; tapping an empty slot selects it as the next to fill. */
export function pickSlot(session, i) {
  const s = clone(session);
  s.cursor = i;
  s.pinned = true;
  if (s.current.arrows[i].v != null) {
    s.asking = true;
    s.step = 'm';
  }
  return s;
}

/** Clear the last scored arrow in the current end. */
export function undo(session) {
  const arrows = session.current.arrows;
  let last = -1;
  for (let i = arrows.length - 1; i >= 0; i--) {
    if (arrows[i].v != null) {
      last = i;
      break;
    }
  }
  if (last < 0) return session;
  const s = clone(session);
  s.current.arrows[last] = emptyArrow();
  s.cursor = last;
  s.pinned = false;
  s.asking = false;
  s.step = 'm';
  return s;
}

/** Let-down steppers. Correct let-downs can never exceed let-downs. */
export function bump(session, key, delta) {
  const s = clone(session);
  const e = s.current;
  const v = Math.max(0, (e[key] || 0) + delta);
  e[key] = v;
  if (key === 'ld' && e.cld > v) e.cld = v;
  if (key === 'cld' && v > e.ld) e.ld = v;
  return s;
}

export function setNote(session, note) {
  const s = clone(session);
  s.current.note = note;
  return s;
}

export function setInputMode(session, mode) {
  return { ...clone(session), inputMode: mode };
}

export function canSaveEnd(session) {
  return session.current.arrows.every((a) => a.v != null);
}

export function hasUnsavedArrows(session) {
  return session.current.arrows.some((a) => a.v != null);
}

export function saveEnd(session) {
  if (!canSaveEnd(session)) return session;
  const s = clone(session);
  s.ends.push(s.current);
  s.current = emptyEnd(s.arrowsPerEnd);
  s.cursor = 0;
  s.pinned = false;
  s.asking = false;
  s.step = 'm';
  return s;
}

export function canFinish(session) {
  return session.ends.length > 0;
}

/** Turn the active session into a finished one. The unsaved current end is dropped. */
export function finishSession(session) {
  if (!canFinish(session)) return session;
  const { current: _c, cursor: _cu, pinned: _p, asking: _a, step: _st, inputMode: _im, ...rest } = clone(session);
  return { ...rest, status: 'finished' };
}
