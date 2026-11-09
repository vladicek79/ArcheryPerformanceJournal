// Active-session state transitions (HANDOFF §3). Pure: every function returns a new session object.
// The active session is persisted after every transition so the app resumes exactly where it was.

export function emptyArrow() {
  return { v: null, m: null, s: null, x: null, y: null };
}

export function emptyEnd(n) {
  return { arrows: Array.from({ length: n }, emptyArrow), ld: 0, cld: 0, note: '' };
}

export function createSession({ date, distance, face, arrowsPerEnd, gear = null, gearSnapshotId = null }) {
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
    gear,
    gearSnapshotId,
  };
}

const clone = (s) => structuredClone(s);

export function nextEmpty(arrows) {
  return arrows.findIndex((a) => a.v == null);
}

/**
 * Record a score (target touch or quick key).
 * - While an arrow is selected for editing, the score and position replace that arrow (grades kept).
 * - Otherwise it fills the selected empty slot, or the first empty one. A full end ignores input.
 * The arrow that received the score stays selected so it can be graded right away.
 */
export function enterScore(session, v, x = null, y = null) {
  const s = clone(session);
  const arrows = s.current.arrows;
  let cur = s.cursor;
  if (!s.pinned && arrows[cur].v != null) {
    const ne = nextEmpty(arrows);
    if (ne < 0) return session;
    cur = ne;
  }
  arrows[cur] = { ...arrows[cur], v, x: x ?? null, y: y ?? null };
  s.cursor = cur;
  s.pinned = false;
  return s;
}

/**
 * Set the M or S grade of the selected arrow — also before it has a score (grade the shot first,
 * score it after). Tapping the current grade again clears it.
 */
export function gradeArrow(session, kind, g) {
  if (!session.current.arrows[session.cursor]) return session;
  const s = clone(session);
  const t = s.current.arrows[s.cursor];
  t[kind] = t[kind] === g ? null : g;
  return s;
}

/** True while an already scored arrow is selected for editing (next score replaces it). */
export function isEditing(session) {
  return !!session.pinned && session.current.arrows[session.cursor].v != null;
}

/**
 * Tap on an arrow slot: select it for editing (scored) or as the next to fill (empty).
 * Tapping the arrow that is already being edited finishes editing.
 */
export function selectArrow(session, i) {
  const s = clone(session);
  if (s.pinned && s.cursor === i) {
    s.pinned = false;
    return s;
  }
  s.cursor = i;
  s.pinned = true;
  return s;
}

/** Finish editing; the arrow stays selected for grading, new scores go to the next empty slot. */
export function doneEditing(session) {
  return { ...clone(session), pinned: false };
}

/** Delete the selected arrow (score, position and grades). Its slot is filled next. */
export function clearArrow(session) {
  const s = clone(session);
  s.current.arrows[s.cursor] = emptyArrow();
  s.pinned = false;
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
  return s;
}

export function canFinish(session) {
  return session.ends.length > 0;
}

/** Turn the active session into a finished one. The unsaved current end and UI fields
 * (including asking/step/inputMode left by older app versions) are dropped. */
export function finishSession(session) {
  if (!canFinish(session)) return session;
  const { current: _c, cursor: _cu, pinned: _p, asking: _a, step: _st, inputMode: _im, ...rest } = clone(session);
  return { ...rest, status: 'finished' };
}
