// Active-session state transitions (HANDOFF §3). Pure: every function returns a new session object.
// The active session is persisted after every transition so the app resumes exactly where it was.
//
// Model: `ends` are the saved ends, `current` is the newest (in-progress) end. `view` is the end
// shown on screen: null = the current end, a number = a saved end (it can be edited in place).
// `cursor` / `pinned` select an arrow inside the shown end.

import { emptyCompetition, DISTANCE_UNITS } from './sessionTypes.js';
import { UNMARKED_PER_FACE, unmarkedRange } from './rounds.js';
import { SHAFT_MM, zonesTouched, spotOrderOf, isDefaultSpotOrder, FACES, isCompoundFace } from './scoring.js';

export function emptyArrow() {
  return { v: null, m: null, s: null, x: null, y: null };
}

/** An empty end of `n` arrows; `target`: which of the round's targets it is shot at (a round's session only). */
export function emptyEnd(n, target = null) {
  return { arrows: Array.from({ length: n }, emptyArrow), ld: 0, cld: 0, note: '', ...(target != null ? { target } : {}) };
}

// ---------------------------------------------------------------- a competition round's targets
//
// A session shot to a round (session.round, rounds.js roundPlan) follows the round's targets: each
// end carries `target`, the index of the round's target it is shot at, and that target decides the
// end's distance, face, arrows and spot order. The session's own distance and face are its first
// target's (what lists and older devices show).

/**
 * The round target an end is shot at (its setup), or null when the session follows no round. On an
 * unmarked target the end's own record of the face found and the distance estimated stands in for
 * the target's guess.
 */
export function endTarget(session, end) {
  const t = session?.round?.ends;
  if (!t?.length) return null;
  const target = t[end?.target ?? 0] ?? null;
  if (!target?.unmarked || (end?.face == null && end?.distance == null)) return target;
  return { ...target, face: end.face ?? target.face, distance: end.distance ?? target.distance };
}

/** The ends of a round's session shot at unmarked targets of one unit, but `skip`, by the face recorded. */
function unmarkedCounts(session, unit, skip) {
  const counts = {};
  for (const e of [...session.ends, session.current]) {
    if (e === skip) continue;
    const t = endTarget(session, e);
    if (t?.unmarked?.unit === unit) counts[t.face] = (counts[t.face] || 0) + 1;
  }
  return counts;
}

/**
 * The faces an unmarked target can still be recorded as for an end: those its unit has fewer than
 * the most of (UNMARKED_PER_FACE: 4), counting the unit's other ends.
 */
export function unmarkedFacesLeft(session, end) {
  const t = endTarget(session, end);
  if (!t?.unmarked) return [];
  const counts = unmarkedCounts(session, t.unmarked.unit, end);
  return t.unmarked.faces.filter((f) => (counts[f.face] || 0) < UNMARKED_PER_FACE[1]).map((f) => f.face);
}

/**
 * Record the face found and the distance estimated at an unmarked target, on the shown end. A face
 * the unit has four of already, or one other than the target offers, changes nothing; nor does a
 * new face once an arrow of the end has its position (it was placed on the other face). The
 * distance is kept within the face's range (a new face starts at its mid-range when out of it).
 */
export function setEndEstimate(session, { face = null, distance = null } = {}) {
  const end = shownEnd(session);
  const t = endTarget(session, end);
  if (!t?.unmarked) return session;
  const nextFace = face ?? t.face;
  const range = unmarkedRange(t, nextFace);
  if (!range) return session;
  if (nextFace !== t.face) {
    if (!unmarkedFacesLeft(session, end).includes(nextFace)) return session;
    if (end.arrows.some((a) => a.x != null)) return session;
  }
  const want = distance ?? t.distance;
  const d = want >= range.min && want <= range.max ? want : Math.round((range.min + range.max) / 2);
  return withShown(session, (e) => {
    e.face = nextFace;
    e.distance = d;
  });
}

/** A new end at target `k`: an unmarked target whose guessed face its unit has four of already starts on one with room. */
function endAt(session, k) {
  const t = session.round.ends[k];
  const e = emptyEnd(t.arrowsPerEnd, k);
  if (!t.unmarked) return e;
  const counts = unmarkedCounts(session, t.unmarked.unit, null);
  if ((counts[t.face] || 0) < UNMARKED_PER_FACE[1]) return e;
  const f = t.unmarked.faces.find((x) => (counts[x.face] || 0) < UNMARKED_PER_FACE[1]);
  return f ? { ...e, face: f.face, distance: Math.round((f.min + f.max) / 2) } : e;
}

/**
 * The session as the shown end sees it: a round's session takes the distance, face, arrows per end
 * and spot order of the shown end's target (a spot order the round prescribes, else the archer's
 * when the sheet is the same). Without a round: the session itself. The scoring screen draws and
 * scores with this.
 */
export function atShownEnd(session) {
  const t = endTarget(session, shownEnd(session));
  if (!t) return session;
  // the archer's order is kept for the sheet it was set on (a sheet of another layout ignores it)
  const spotOrder = t.spotOrder ?? session.spotOrder;
  const { spotOrder: _old, ...rest } = session;
  return {
    ...rest,
    distance: t.distance,
    distanceUnit: t.distanceUnit,
    face: t.face,
    arrowsPerEnd: t.arrowsPerEnd,
    ...(spotOrder ? { spotOrder } : {}),
  };
}

/** The targets of a round's session already shot at (the saved ends' and the current end's). */
const usedTargets = (session) => new Set([...session.ends, session.current].map((e) => e.target ?? 0));

/**
 * The target the end after the current one is shot at, or null when every target has been shot.
 * A round shot in order (target rounds) goes on to the next target; a course (field, 3D, Flint) to
 * the next one round the course not shot yet, as archers start at any target and walk on.
 */
export function nextTarget(session) {
  const targets = session.round?.ends || [];
  const used = usedTargets(session);
  if (!session.round?.course) {
    const k = session.ends.length + 1;
    return k < targets.length ? k : null;
  }
  const from = session.current.target ?? 0;
  for (let i = 1; i < targets.length; i++) {
    const k = (from + i) % targets.length;
    if (!used.has(k)) return k;
  }
  return null;
}

/** Whether every target of the round has an end (the round is shot; Finish is next). */
export function roundDone(session) {
  return !!session.round && nextTarget(session) == null;
}

/**
 * A course round: the end being shot moves to another target (the archer is on target 7, not 5).
 * Its arrows stay, the end grows or shrinks to the target's arrows (never below the arrows already
 * scored). A target already shot, or a session without a course, changes nothing.
 */
export function setEndTarget(session, k) {
  const t = session.round?.ends?.[k];
  if (!t || !session.round.course || session.view != null) return session;
  if ((session.current.target ?? 0) === k) return session;
  if (session.ends.some((e) => (e.target ?? 0) === k)) return session;
  const scored = session.current.arrows.filter((a) => a.v != null || a.m != null || a.s != null);
  if (scored.length > t.arrowsPerEnd) return session;
  const s = clone(session);
  const kept = s.current.arrows.filter((a) => a.v != null || a.m != null || a.s != null);
  // the face and distance recorded belonged to the other target
  const { face: _f, distance: _d, ...rest } = s.current;
  s.current = { ...rest, target: k, arrows: [...kept, ...Array.from({ length: t.arrowsPerEnd - kept.length }, emptyArrow)] };
  return resetCursor(s);
}

export function createSession({
  date,
  distance,
  // 'm' or 'yd': the distance is kept in the unit it was set in
  distanceUnit = 'm',
  face,
  // 'recurve' or 'compound' (on a 40 cm face, compound is also the face's inner 10)
  bowType = null,
  arrowsPerEnd,
  gear = null,
  gearSnapshotId = null,
  type = 'training',
  competition = null,
  time = null,
  // logged afterwards: the timer stays stopped at the duration typed in (minutes), instead of running
  pastMinutes = null,
  // false: the arrows are scored without the M / S grades (the end screen does not ask for them)
  grading = true,
  // triple / Vegas sheets: the order the archer shoots the spots in (null = the default order)
  spotOrder = null,
  // a competition round followed end by end (rounds.js roundPlan): its first target sets the
  // session's distance, face and arrows per end, and every end records its target
  round = null,
  // a course round: the target the archer starts at
  startTarget = 0,
  now = new Date(),
}) {
  if (round?.ends?.length) {
    const k = round.course && round.ends[startTarget] ? startTarget : 0;
    const first = round.ends[k];
    const s = createSession({
      date, distance: first.distance, distanceUnit: first.distanceUnit, face: first.face, bowType, arrowsPerEnd: first.arrowsPerEnd,
      gear, gearSnapshotId, type, competition, time, pastMinutes, grading, spotOrder, now,
    });
    return { ...s, round: structuredClone(round), current: emptyEnd(first.arrowsPerEnd, k) };
  }
  return {
    type,
    ...(type === 'competition' ? { competition: competition || emptyCompetition() } : {}),
    date,
    ...(time ? { time } : {}),
    distance,
    distanceUnit: DISTANCE_UNITS.includes(distanceUnit) ? distanceUnit : 'm',
    face,
    // the face's parts, as the setup's picker shows them (the face id stays what is scored)
    faceSize: FACES[face]?.size ?? null,
    faceType: FACES[face]?.kind ?? null,
    bowType: bowType === 'compound' || bowType === 'recurve' ? bowType : isCompoundFace(face) ? 'compound' : 'recurve',
    arrowsPerEnd,
    status: 'active',
    ends: [],
    current: emptyEnd(arrowsPerEnd),
    view: null,
    cursor: 0,
    pinned: false,
    gear,
    gearSnapshotId,
    ...(grading === false ? { grading: false } : {}),
    ...(spotOrder && !isDefaultSpotOrder(face, spotOrder) ? { spotOrder: spotOrderOf(face, spotOrder) } : {}),
    // the timer runs from the start; it keeps counting while the app is closed (it is a start time,
    // not a ticking counter) until it is paused
    timer:
      pastMinutes == null
        ? { running: true, startedAt: timerStartAt(date, time, now).toISOString(), elapsedMs: 0 }
        : { running: false, startedAt: null, elapsedMs: pastMinutes * 60000 },
  };
}

/**
 * The order the spots of a triple / Vegas sheet are shot in (it only moves the suggested spot):
 * the default order is not stored.
 */
export function setSpotOrder(session, order, face = atShownEnd(session).face) {
  const { spotOrder: _old, ...rest } = session;
  return isDefaultSpotOrder(face, order) ? rest : { ...rest, spotOrder: spotOrderOf(face, order) };
}

// ---------------------------------------------------------------- the sight move, started again

/**
 * The sight was moved: the sight move is worked out again from the arrows shot from now on. Kept as
 * `sightFrom`: the end being shot (its index among all ends) and the slots of it that held an arrow
 * already (they were shot with the old sight).
 */
export function resetSight(session) {
  const skip = session.current.arrows.flatMap((a, i) => (a.v != null ? [i] : []));
  return { ...session, sightFrom: { end: session.ends.length, ...(skip.length ? { skip } : {}) } };
}

/**
 * The ends as the sight move counts them: all of them (saved and current), or after a reset only
 * the arrows shot since it: earlier ends drop out, and of the end it was made in, the slots shot
 * before it.
 */
export function endsSinceSight(session) {
  const all = [...session.ends, session.current];
  const from = session.sightFrom;
  if (!from) return all;
  return all.flatMap((e, k) => {
    if (k < from.end) return [];
    if (k > from.end || !from.skip?.length) return [e];
    return [{ ...e, arrows: e.arrows.map((a, i) => (from.skip.includes(i) ? emptyArrow() : a)) }];
  });
}

/** A start this long before now is a session logged afterwards (no running timer). */
export const PAST_START_MS = 15 * 60 * 1000;

/** True when the local date + HH:MM lies more than PAST_START_MS before `now`. */
export function isPastStart(date, time, now = new Date()) {
  const t = new Date(`${date}T${time || '00:00'}`).getTime();
  return Number.isFinite(t) && now.getTime() - t > PAST_START_MS;
}

/**
 * When a session's timer starts: at the picked local `date` + `time` when that lies between a minute
 * and PAST_START_MS before `now` (started 10 min ago: the timer shows 0:10), else `now` (started this
 * minute, a later time, or a session logged afterwards, whose timer does not run).
 */
export function timerStartAt(date, time, now = new Date()) {
  const t = time ? new Date(`${date}T${time}`).getTime() : NaN;
  const ago = now.getTime() - t;
  return Number.isFinite(t) && ago >= 60000 && ago <= PAST_START_MS ? new Date(t) : now;
}

const clone = (s) => structuredClone(s);

// ---------------------------------------------------------------- session timer

/** Milliseconds on the timer at `now` (sessions from before the timer existed have none: 0). */
export function timerElapsed(timer, now = new Date()) {
  if (!timer) return 0;
  const running = timer.running && timer.startedAt ? Math.max(0, now.getTime() - Date.parse(timer.startedAt)) : 0;
  return (timer.elapsedMs || 0) + running;
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

/**
 * An arrow's position (face units, spot radius 1) is stored only this close to the spot's centre:
 * on the face, or just off its edge. Further out the arrow keeps its score but has no position.
 */
export const ON_FACE = 1.05;
const round3 = (n) => Math.round(n * 1000) / 1000;

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
 * In a graded session the arrow that received the score stays selected so it can be graded right
 * away, unless it was graded already; without grading (or once graded) the selection moves on to the
 * next empty arrow (it stays when none is left).
 * A position is only kept when it lies on the face (see ON_FACE); otherwise just the score is stored.
 */
export function enterScore(session, v, px = null, py = null, spot = null) {
  // an arrow graded before it was scored is complete with its score: on to the next one
  const target = shownEnd(session).arrows[scoreTarget(session)];
  const graded = target?.m != null && target?.s != null;
  return placeScore(session, v, px, py, spot, { advance: session.grading === false || graded });
}

/** The index of the arrow the next score goes to (see enterScore), or -1 when the end is full. */
export function scoreTarget(session) {
  const arrows = shownEnd(session).arrows;
  const cur = session.cursor;
  return !session.pinned && arrows[cur].v != null ? nextEmpty(arrows) : cur;
}

function placeScore(session, v, px, py, spot, { advance }) {
  const onFace = px != null && py != null && Math.hypot(px, py) < ON_FACE;
  const x = onFace ? round3(px) : null;
  const y = onFace ? round3(py) : null;
  const cur = scoreTarget(session);
  if (cur < 0) return session;
  return withShown(session, (end, s) => {
    const { spot: _old, ...rest } = end.arrows[cur];
    // `spot` (which spot of a three-spot sheet) is only stored when known
    end.arrows[cur] = { ...rest, v, x, y, ...(spot != null && x != null ? { spot } : {}) };
    s.cursor = cur;
    s.pinned = false;
    if (advance) {
      // the first empty arrow after this one, else the first empty one before it
      const after = end.arrows.findIndex((a, i) => i > cur && a.v == null);
      const next = after >= 0 ? after : nextEmpty(end.arrows);
      if (next >= 0) s.cursor = next;
    }
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
    // The tap that completes M + S of a scored arrow moves the selection to the next arrow.
    // An arrow graded before it is scored stays selected: its score comes next (and then moves on,
    // see enterScore). Re-grading a complete arrow stays put.
    if (!wasComplete && t.m != null && t.s != null && t.v != null && s.cursor + 1 < end.arrows.length) {
      s.cursor += 1;
      // an empty next arrow also receives the next score; a scored one is only selected for grading
      s.pinned = end.arrows[s.cursor].v == null;
    }
  });
}

/**
 * The grades of one end made on the watch (a parsed watch code, see watchCode.js) into the shown
 * end: slot 1 gets the lowest arrow number, slot 2 the next, and so on. Each filled slot gets M, S,
 * the arrow number, the heart rate and the shot time; its score and position stay. The end keeps the
 * heart-rate trace of the code. The archer then scores the
 * slots in that order, each showing which numbered arrow it is. A code with more arrows than the
 * end has slots changes nothing.
 */
export function applyWatchGrades(session, code) {
  const arrows = code?.arrows ?? [];
  if (arrows.length > shownEnd(session).arrows.length) return session;
  return withShown(session, (end, s) => {
    arrows.forEach((w, i) => {
      const { no: _no, hr: _hr, t: _t, ...rest } = end.arrows[i];
      end.arrows[i] = { ...rest, m: w.m, s: w.s, no: w.no, ...(w.hr != null ? { hr: w.hr } : {}), ...(w.t != null ? { t: w.t } : {}) };
    });
    // the heart rate while the end was shot (watch app 0.3 on); a code without one removes an older one
    if (code.trace) end.hrTrace = { step: code.trace.step, hr: [...code.trace.hr] };
    else delete end.hrTrace;
    // the shots the watch's motion detector found (set-up, draw, hold), watch app 0.6 on
    if (code.detected?.length) end.watchShots = code.detected.map((d) => ({ ...d }));
    else delete end.watchShots;
    s.cursor = 0;
    s.pinned = false;
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

/** Empty the shown end's arrows (scores, positions and grades), ready to be entered again. */
export function clearEndArrows(session) {
  return withShown(session, (end, s) => {
    end.arrows = end.arrows.map(() => emptyArrow());
    s.cursor = 0;
    s.pinned = false;
  });
}

/**
 * Move arrow `i` of the shown end to a new spot on the target (dragged there on the face): its score
 * and position change, its grades stay. The arrow is selected afterwards, as after any score.
 */
export function moveArrow(session, i, v, x = null, y = null, spot = null) {
  if (!shownEnd(session).arrows[i]) return session;
  return placeScore({ ...clone(session), cursor: i, pinned: true }, v, x, y, spot, { advance: false });
}

/**
 * A saved arrow with a new score (Edit end in History). Its grades stay; its position stays only
 * while the new score is that of a ring its shaft (`shaftMm` wide) lies in or touches: otherwise
 * the hole would sit in the wrong ring, so the position (and its spot) is dropped and `dropped` is
 * true. Same score: unchanged.
 */
export function rescoreArrow(arrow, v, face, shaftMm = SHAFT_MM) {
  if (arrow.v === v) return { arrow, dropped: false };
  const { spot: _spot, ...rest } = arrow;
  if (arrow.x == null || arrow.y == null) return { arrow: { ...rest, v, x: null, y: null }, dropped: false };
  // a line cutter's hole touches two rings: either score fits where it is
  if (zonesTouched(arrow.x, arrow.y, face, shaftMm).includes(v)) return { arrow: { ...arrow, v }, dropped: false };
  return { arrow: { ...rest, v, x: null, y: null }, dropped: true };
}

/**
 * A saved end as changed on the Edit end sheet (`draft`: same arrows, new scores, grades, let-downs).
 * Each arrow whose score changed is rescored against the saved one (rescoreArrow), so a position
 * that no longer matches its new score goes. Returns the end to store and the arrows (1-based)
 * whose position was dropped. `shaftMm`: the session's arrow diameter.
 */
export function rescoreEnd(saved, draft, face, shaftMm = SHAFT_MM) {
  const dropped = [];
  const arrows = draft.arrows.map((a, i) => {
    const was = saved.arrows[i];
    if (!was || a.v == null || a.v === was.v) return a;
    // the saved position decides; the draft's grades stay
    const { spot: _spot, ...graded } = a;
    const res = rescoreArrow({ ...graded, v: was.v, x: was.x, y: was.y, ...(was.spot != null ? { spot: was.spot } : {}) }, a.v, face, shaftMm);
    if (res.dropped) dropped.push(i + 1);
    return res.arrow;
  });
  return { end: { ...draft, arrows }, dropped };
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

/**
 * Next from the current end saves it (auto-save) and starts a new one; needs at least one arrow.
 * A round's session stops at its last target (Finish is next).
 */
export function canNextEnd(session) {
  if (session.view != null) return true;
  return hasArrows(session.current) && (!session.round || nextTarget(session) != null);
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
  const k = s.round ? nextTarget(s) : null;
  s.ends.push(s.current);
  s.current = k != null ? endAt(s, k) : emptyEnd(s.arrowsPerEnd);
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
export const canSaveEnd = (session) => session.view == null && canNextEnd(session);

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
