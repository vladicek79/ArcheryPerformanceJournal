// Active-session state transitions (HANDOFF §3). Pure: every function returns a new session object.
// The active session is persisted after every transition so the app resumes exactly where it was.
//
// Model: `ends` are the saved ends, `current` is the newest (in-progress) end. `view` is the end
// shown on screen: null = the current end, a number = a saved end (it can be edited in place).
// `cursor` / `pinned` select an arrow inside the shown end.

export function emptyArrow() {
  return { v: null, m: null, s: null, x: null, y: null };
}

export function emptyEnd(n) {
  return { arrows: Array.from({ length: n }, emptyArrow), ld: 0, cld: 0, note: '' };
}

export function createSession({
  date,
  distance,
  face,
  arrowsPerEnd,
  gear = null,
  gearSnapshotId = null,
  type = 'training',
  competition = null,
  time = null,
  // logged afterwards: the timer stays stopped at the duration typed in (minutes), instead of running
  pastMinutes = null,
  now = new Date(),
}) {
  return {
    type,
    ...(type === 'competition' ? { competition: competition || { event: '', round: '', conditions: '', placement: '' } } : {}),
    date,
    ...(time ? { time } : {}),
    distance,
    face,
    arrowsPerEnd,
    status: 'active',
    ends: [],
    current: emptyEnd(arrowsPerEnd),
    view: null,
    cursor: 0,
    pinned: false,
    gear,
    gearSnapshotId,
    // the timer runs from the start; it keeps counting while the app is closed (it is a start time,
    // not a ticking counter) until it is paused
    timer:
      pastMinutes == null
        ? { running: true, startedAt: now.toISOString(), elapsedMs: 0 }
        : { running: false, startedAt: null, elapsedMs: pastMinutes * 60000 },
  };
}

/** A start this long before now is a session logged afterwards (no running timer). */
export const PAST_START_MS = 15 * 60 * 1000;

/** True when the local date + HH:MM lies more than PAST_START_MS before `now`. */
export function isPastStart(date, time, now = new Date()) {
  const t = new Date(`${date}T${time || '00:00'}`).getTime();
  return Number.isFinite(t) && now.getTime() - t > PAST_START_MS;
}

const clone = (s) => structuredClone(s);

// ---------------------------------------------------------------- session timer

/** Milliseconds on the timer at `now` (sessions from before the timer existed have none: 0). */
export function timerElapsed(timer, now = new Date()) {
  if (!timer) return 0;
  const running = timer.running && timer.startedAt ? Math.max(0, now.getTime() - Date.parse(timer.startedAt)) : 0;
  return (timer.elapsedMs || 0) + running;
}

/** A form timer left behind (form opened but not saved) is dropped after this long without a touch. */
export const FORM_TIMER_STALE_MS = 6 * 3600 * 1000;

/**
 * The timer for a blank bale / strength / mental form being opened: the kept one, or a fresh running
 * timer when there is none or it was left untouched (not started, resumed or paused) for too long.
 */
export function openFormTimer(timer, now = new Date()) {
  const touched = Date.parse(timer?.touchedAt || timer?.startedAt || '');
  if (timer && Number.isFinite(touched) && now.getTime() - touched <= FORM_TIMER_STALE_MS) return timer;
  return { running: true, startedAt: now.toISOString(), elapsedMs: 0, touchedAt: now.toISOString() };
}

export function pauseTimer(session, now = new Date()) {
  if (!session.timer?.running) return session;
  return { ...session, timer: { running: false, startedAt: null, elapsedMs: timerElapsed(session.timer, now) } };
}

export function resumeTimer(session, now = new Date()) {
  if (session.timer?.running) return session;
  return { ...session, timer: { running: true, startedAt: now.toISOString(), elapsedMs: session.timer?.elapsedMs || 0 } };
}

/** "12:05" or "1:02:05". */
export function formatClock(ms) {
  const sec = Math.floor(ms / 1000);
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

/** "45 min" or "1 h 05 min". */
export function formatDuration(minutes) {
  if (minutes == null) return '–';
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return hh ? `${hh} h ${String(mm).padStart(2, '0')} min` : `${mm} min`;
}

export function nextEmpty(arrows) {
  return arrows.findIndex((a) => a.v == null);
}

const hasArrows = (end) => end.arrows.some((a) => a.v != null);

/** Index of the shown end among all ends (saved ends first, then the current one). */
export function viewIndex(session) {
  return session.view == null ? session.ends.length : session.view;
}

/** The end shown on screen. */
export function shownEnd(session) {
  return session.view == null ? session.current : session.ends[session.view];
}

/** All ends other than the shown one (for drawing earlier/later groups on the face). */
export function otherEnds(session) {
  const all = [...session.ends, session.current];
  return all.filter((_, i) => i !== viewIndex(session));
}

/** Apply `fn` to a clone's shown end. */
function withShown(session, fn) {
  const s = clone(session);
  fn(shownEnd(s), s);
  return s;
}

/**
 * Record a score (target touch or quick key) in the shown end.
 * - While an arrow is selected for editing, the score and position replace that arrow (grades kept).
 * - Otherwise it fills the selected empty slot, or the first empty one. A full end ignores input.
 * The arrow that received the score stays selected so it can be graded right away.
 */
export function enterScore(session, v, x = null, y = null, spot = null) {
  const arrows = shownEnd(session).arrows;
  let cur = session.cursor;
  if (!session.pinned && arrows[cur].v != null) {
    cur = nextEmpty(arrows);
    if (cur < 0) return session;
  }
  return withShown(session, (end, s) => {
    const { spot: _old, ...rest } = end.arrows[cur];
    // `spot` (which spot of a three-spot sheet) is only stored when known
    end.arrows[cur] = { ...rest, v, x: x ?? null, y: y ?? null, ...(spot != null && x != null ? { spot } : {}) };
    s.cursor = cur;
    s.pinned = false;
  });
}

/**
 * Set the M or S grade of the selected arrow — also before it has a score (grade the shot first,
 * score it after). Tapping the current grade again clears it.
 */
export function gradeArrow(session, kind, g) {
  if (!shownEnd(session).arrows[session.cursor]) return session;
  return withShown(session, (end, s) => {
    const t = end.arrows[s.cursor];
    const wasComplete = t.m != null && t.s != null;
    t[kind] = t[kind] === g ? null : g;
    // The tap that completes M + S moves the selection to the next arrow (so arrows can be
    // graded one after another, with or without scores). Re-grading a complete arrow stays put.
    if (!wasComplete && t.m != null && t.s != null && s.cursor + 1 < end.arrows.length) {
      s.cursor += 1;
      // an empty next arrow also receives the next score; a scored one is only selected for grading
      s.pinned = end.arrows[s.cursor].v == null;
    }
  });
}

/** True while an already scored arrow is selected for editing (next score replaces it). */
export function isEditing(session) {
  return !!session.pinned && shownEnd(session).arrows[session.cursor]?.v != null;
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
  return withShown(session, (end, s) => {
    end.arrows[s.cursor] = emptyArrow();
    s.pinned = false;
  });
}

/** Clear the last scored arrow in the shown end. */
export function undo(session) {
  const arrows = shownEnd(session).arrows;
  let last = -1;
  for (let i = arrows.length - 1; i >= 0; i--) {
    if (arrows[i].v != null) {
      last = i;
      break;
    }
  }
  if (last < 0) return session;
  return withShown(session, (end, s) => {
    end.arrows[last] = emptyArrow();
    s.cursor = last;
    s.pinned = false;
  });
}

/** Let-down steppers. Correct let-downs can never exceed let-downs. */
export function bump(session, key, delta) {
  return withShown(session, (e) => {
    const v = Math.max(0, (e[key] || 0) + delta);
    e[key] = v;
    if (key === 'ld' && e.cld > v) e.cld = v;
    if (key === 'cld' && v > e.ld) e.ld = v;
  });
}

export function setNote(session, note) {
  return withShown(session, (e) => {
    e.note = note;
  });
}

// ---------------------------------------------------------------- end navigation

function resetCursor(s) {
  const ne = nextEmpty(shownEnd(s).arrows);
  s.cursor = ne >= 0 ? ne : 0;
  s.pinned = false;
  return s;
}

export function canPrevEnd(session) {
  return viewIndex(session) > 0;
}

/** Next from the current end saves it (auto-save) and starts a new one; needs at least one arrow. */
export function canNextEnd(session) {
  return session.view != null || hasArrows(session.current);
}

export function prevEnd(session) {
  if (!canPrevEnd(session)) return session;
  const s = clone(session);
  s.view = viewIndex(s) - 1;
  return resetCursor(s);
}

export function nextEnd(session) {
  if (!canNextEnd(session)) return session;
  const s = clone(session);
  if (s.view != null) {
    s.view = s.view + 1 < s.ends.length ? s.view + 1 : null;
    return resetCursor(s);
  }
  s.ends.push(s.current);
  s.current = emptyEnd(s.arrowsPerEnd);
  return resetCursor(s);
}

/** Jump to a saved end (index into `ends`), or to the current end with null. */
export function goToEnd(session, i) {
  const s = clone(session);
  s.view = i == null || i >= s.ends.length ? null : Math.max(0, i);
  return resetCursor(s);
}

/** Save the current end and start a new one (same as Next on the current end). */
export const saveEnd = nextEnd;
export const canSaveEnd = (session) => session.view == null && hasArrows(session.current);

export function hasUnsavedArrows(session) {
  return hasArrows(session.current);
}

export function canFinish(session) {
  return session.ends.length > 0 || hasArrows(session.current);
}

/**
 * Turn the active session into a finished one. The current end is kept when it has arrows;
 * empty ends and UI fields (including asking/step/inputMode left by older app versions) are dropped.
 */
export function finishSession(session, now = new Date()) {
  if (!canFinish(session)) return session;
  const { current, view: _v, cursor: _cu, pinned: _p, asking: _a, step: _st, inputMode: _im, timer, ...rest } =
    clone(session);
  const ends = [...rest.ends, current].filter(hasArrows);
  // the timer becomes the session's duration in whole minutes (sessions without a timer keep none)
  const minutes = timer ? Math.round(timerElapsed(timer, now) / 60000) : (rest.minutes ?? null);
  return { ...rest, ends, status: 'finished', ...(minutes != null ? { minutes } : {}) };
}
