// What the app stores (ARCHITECTURE §6.4). The repository validates before every save and on import.
import { FACE_IDS, ARROWS_PER_END_MAX, isValidArrowsPerEnd, isValidArrowValue, SPOT_CENTRES } from './scoring.js';
import { sightErrors, historyErrors } from './gearFields.js';
import { defaultLastSetup, isGoal } from './lastSetup.js';
import { isDrillId, NAME_MAX } from './catalog.js';
import { SESSION_TYPES, EFFORT_MAX, FOCUS_MAX, isScored, countsArrows, isTime, emptyReview, emptyCompetition, DISTANCE_UNITS } from './sessionTypes.js';
import { endTarget } from './sessionLogic.js';
import { roundErrors as validateRound, estimateErrors } from './rounds.js';
import { GYM_UNITS, REPS_MAX, KG_MAX } from './gym.js';
import { ARROW_NO_MAX, HR_MIN, HR_MAX, SHOT_TIME_MAX, TRACE_STEP_MAX, TRACE_MAX, DETECTED_MAX, SETTLE_MAX, DRIFT_MAX, FOLLOW_MAX } from './watchCode.js';

const isStr = (v) => typeof v === 'string';
// the heart rate while an end was shot, from the watch: { step: seconds per value, hr: [...] }
const isTrace = (t) =>
  !!t &&
  Number.isInteger(t.step) &&
  t.step >= 1 &&
  t.step <= TRACE_STEP_MAX &&
  Array.isArray(t.hr) &&
  t.hr.length >= 1 &&
  t.hr.length <= TRACE_MAX &&
  t.hr.every((v) => Number.isInteger(v) && v >= HR_MIN && v <= HR_MAX);
// the shots the watch detected in an end: [{ t, setup, draw, hold, steady }], from watch app 0.10
// also settle, drift and the follow-through fx, fy, fz (all five or none)
const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isDetected = (list) =>
  Array.isArray(list) &&
  list.length <= DETECTED_MAX &&
  list.every(
    (d) =>
      d &&
      Number.isInteger(d.t) &&
      inRange(d.t, 0, SHOT_TIME_MAX) &&
      (d.no == null || (Number.isInteger(d.no) && inRange(d.no, 1, ARROW_NO_MAX))) &&
      inRange(d.setup, 0, 9.9) &&
      inRange(d.draw, 0, 9.9) &&
      inRange(d.hold, 0, 99.9) &&
      Number.isInteger(d.steady) &&
      inRange(d.steady, 0, 9) &&
      (d.settle == null
        ? d.drift == null && d.fx == null && d.fy == null && d.fz == null
        : inRange(d.settle, 0, SETTLE_MAX) &&
          inRange(d.drift, 0, DRIFT_MAX) &&
          [d.fx, d.fy, d.fz].every((v) => Number.isInteger(v) && inRange(v, -FOLLOW_MAX, FOLLOW_MAX))) &&
      (d.pause == null || (d.settle != null && inRange(d.pause, 0, SETTLE_MAX))),
  );
const isGrade = (g) => g == null || (Number.isInteger(g) && g >= 1 && g <= 5);
const isCount = (n) => Number.isInteger(n) && n >= 0;
const isUnit = (n) => n == null || (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 2);

// the spots a sheet has: 3 on a triple or Vegas sheet, 4 on the IFAA square (any sheet's, when the
// face is unknown)
const MOST_SPOTS = Math.max(...Object.values(SPOT_CENTRES).map((s) => s.length));
const spotCount = (face) => SPOT_CENTRES[face]?.length ?? MOST_SPOTS;

function validateArrow(a, where, requireValue, spots = MOST_SPOTS) {
  const errs = [];
  if (!a || typeof a !== 'object') return [`${where}: not an arrow`];
  if (a.v == null) {
    if (requireValue) errs.push(`${where}: missing score`);
  } else if (!isValidArrowValue(a.v)) errs.push(`${where}: invalid score ${a.v}`);
  if (!isGrade(a.m)) errs.push(`${where}: invalid M grade`);
  if (!isGrade(a.s)) errs.push(`${where}: invalid S grade`);
  if (!isUnit(a.x) || !isUnit(a.y)) errs.push(`${where}: invalid position`);
  if (a.spot != null && !(Number.isInteger(a.spot) && a.spot >= 0 && a.spot < spots)) errs.push(`${where}: invalid spot`);
  // from the watch (watchCode.js): which numbered arrow it was, and the heart rate at the shot
  if (a.no != null && !(Number.isInteger(a.no) && a.no >= 1 && a.no <= ARROW_NO_MAX)) errs.push(`${where}: invalid arrow number`);
  if (a.hr != null && !(Number.isInteger(a.hr) && a.hr >= HR_MIN && a.hr <= HR_MAX)) errs.push(`${where}: invalid heart rate`);
  if (a.t != null && !(Number.isInteger(a.t) && a.t >= 0 && a.t <= SHOT_TIME_MAX)) errs.push(`${where}: invalid shot time`);
  return errs;
}

function validateEnd(e, where, n, requireValues, spots) {
  if (!e || !Array.isArray(e.arrows)) return [`${where}: missing arrows`];
  const errs = [];
  if (e.arrows.length !== n) errs.push(`${where}: expected ${n} arrows`);
  e.arrows.forEach((a, i) => errs.push(...validateArrow(a, `${where} arrow ${i + 1}`, requireValues, spots)));
  if (e.hrTrace != null && !isTrace(e.hrTrace)) errs.push(`${where}: invalid heart-rate trace`);
  if (e.watchShots != null && !isDetected(e.watchShots)) errs.push(`${where}: invalid detected shots`);
  if (!isCount(e.ld) || !isCount(e.cld)) errs.push(`${where}: invalid let-downs`);
  else if (e.cld > e.ld) errs.push(`${where}: correct let-downs exceed let-downs`);
  if (e.note != null && !isStr(e.note)) errs.push(`${where}: invalid note`);
  return errs;
}

const isOptInt = (n, min, max) => n == null || (Number.isInteger(n) && n >= min && n <= max);

/** A list of names picked from one of the archer's lists (gym focus, mental techniques). */
const isNameList = (list) => Array.isArray(list) && list.every((x) => isStr(x) && x.trim() && x.length <= NAME_MAX);

/** A gym session's focus and exercises (one with only a note, or with nothing, is valid). */
function validateGym(r) {
  const errs = [];
  // any name: the focus list is the archer's own (catalog.js) and may not have synced yet
  if (!isNameList(r.focus)) errs.push('invalid focus');
  if (!Array.isArray(r.exercises)) return [...errs, 'exercises must be a list'];
  r.exercises.forEach((e, i) => {
    const where = `exercise ${i + 1}`;
    if (!e || !isStr(e.name) || !e.name.trim() || e.name.length > 80) errs.push(`${where}: invalid name`);
    else if (!GYM_UNITS.includes(e.unit)) errs.push(`${where}: invalid unit`);
    else if (!Array.isArray(e.sets)) errs.push(`${where}: sets must be a list`);
    else
      e.sets.forEach((st, k) => {
        const kgOk = typeof st?.kg === 'number' && Number.isFinite(st.kg) && st.kg >= 0 && st.kg <= KG_MAX;
        if (!st || st.reps == null || !isOptInt(st.reps, 0, REPS_MAX) || !kgOk || typeof st.done !== 'boolean')
          errs.push(`${where} set ${k + 1}: invalid set`);
      });
  });
  return errs;
}

/** Blank bale, strength, gym and mental sessions: a saved form, never active. */
function validateForm(r) {
  const errs = [];
  if (r.status !== 'finished') errs.push(`${r.type} sessions are saved as finished`);
  if (!isOptInt(r.minutes, 0, 1440)) errs.push('invalid minutes');
  if (r.note != null && !isStr(r.note)) errs.push('invalid note');
  if (countsArrows(r.type)) {
    if (!isOptInt(r.arrows, 0, 10000)) errs.push('invalid arrow count');
    else if (r.goal != null && (r.type !== 'blank' || !isGoal(r.goal))) errs.push('invalid arrow goal');
    else if (r.type === 'manual' && !r.arrows && !r.minutes) errs.push('enter the arrows or the duration');
    // a blank bale's ends brought from the watch: arrows graded there (no score), heart rate, shots
    if (r.watchEnds != null) {
      if (r.type !== 'blank' || !Array.isArray(r.watchEnds)) errs.push('invalid watch ends');
      else
        r.watchEnds.forEach((e, i) => {
          const where = `watch end ${i + 1}`;
          if (!e || !Array.isArray(e.arrows) || e.arrows.length > ARROW_NO_MAX) return errs.push(`${where}: invalid arrows`);
          if (e.arrows.some((a) => a?.v != null)) errs.push(`${where}: a blank bale arrow has no score`);
          errs.push(...validateEnd(e, where, e.arrows.length, false));
        });
    }
  } else if (r.type === 'strength') {
    if (!isOptInt(r.effort, 1, EFFORT_MAX)) errs.push('invalid effort');
    if (!Array.isArray(r.drills)) errs.push('drills must be a list');
    else
      r.drills.forEach((d, i) => {
        // a drill type of My drills is checked by the shape of its id: the list may not have synced yet
        if (!d || !isDrillId(d.kind)) errs.push(`drill ${i + 1}: unknown drill`);
        else if (d.name != null && !(isStr(d.name) && d.name.trim() && d.name.length <= NAME_MAX)) errs.push(`drill ${i + 1}: invalid name`);
        else if (!isOptInt(d.sets, 0, 999) || !isOptInt(d.reps, 0, 9999) || !isOptInt(d.holdSec, 0, 3600) || !isOptInt(d.restSec, 0, 3600))
          errs.push(`drill ${i + 1}: invalid numbers`);
        else if (d.done != null && typeof d.done !== 'boolean') errs.push(`drill ${i + 1}: invalid done mark`);
      });
  } else if (r.type === 'gym') {
    errs.push(...validateGym(r));
  } else {
    if (!isOptInt(r.focus, 1, FOCUS_MAX)) errs.push('invalid focus');
    if (!isNameList(r.techniques)) errs.push('invalid techniques');
  }
  return errs;
}

export const collections = {
  sessions: {
    defaults: () => ({ type: 'training', ends: [], status: 'active', gear: null, gearSnapshotId: null }),
    validate(r) {
      const errs = [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) errs.push('date must be YYYY-MM-DD');
      if (r.time != null && !isTime(r.time)) errs.push('time must be HH:MM');
      if (!SESSION_TYPES.includes(r.type)) errs.push('invalid session type');
      if (!['active', 'finished'].includes(r.status)) errs.push('invalid status');
      if (r.review != null && (typeof r.review !== 'object' || Object.keys(emptyReview()).some((k) => !isStr(r.review[k] ?? '')))) errs.push('invalid review');
      if (!isScored(r.type)) return [...errs, ...validateForm(r)];
      if (r.competition != null && (typeof r.competition !== 'object' || Object.keys(emptyCompetition()).some((k) => !isStr(r.competition[k] ?? '')))) {
        errs.push('invalid competition details');
      }
      if (!(Number.isFinite(r.distance) && r.distance > 0)) errs.push('invalid distance');
      if (!FACE_IDS.includes(r.face)) errs.push('invalid face');
      // the setup's parts, stored since the face picker (older sessions have only distance and face)
      if (r.distanceUnit != null && !DISTANCE_UNITS.includes(r.distanceUnit)) errs.push('invalid distance unit');
      if (r.bowType != null && !['recurve', 'compound'].includes(r.bowType)) errs.push('invalid bow type');
      if (r.faceType != null && typeof r.faceType !== 'string') errs.push('invalid face type');
      if (r.faceSize != null && !(Number.isFinite(r.faceSize) && r.faceSize > 0)) errs.push('invalid face size');
      if (r.grading != null && typeof r.grading !== 'boolean') errs.push('invalid grading choice');
      if (!isValidArrowsPerEnd(r.arrowsPerEnd)) errs.push(`arrows per end must be 1 to ${ARROWS_PER_END_MAX}`);
      if (r.round != null) errs.push(...validateRound(r.round));
      // "Sight moved: start again": the end it was pressed in and that end's slots shot before it
      if (r.sightFrom != null) {
        const f = r.sightFrom;
        const ok = f && Number.isInteger(f.end) && f.end >= 0 && (f.skip == null || (Array.isArray(f.skip) && f.skip.every((i) => Number.isInteger(i) && i >= 0 && i < 12)));
        if (!ok) errs.push('invalid sight reset');
      }
      // a round's end has its target's arrows and face (sessionLogic.endTarget); any other end the session's
      const endArrows = (e) => endTarget(r, e)?.arrowsPerEnd ?? r.arrowsPerEnd;
      const endSpots = (e) => spotCount(endTarget(r, e)?.face ?? r.face);
      if (!Array.isArray(r.ends)) errs.push('ends must be a list');
      // ends may be partly scored (Next auto-saves an unfinished end)
      else
        r.ends.forEach((e, i) => {
          errs.push(...validateEnd(e, `end ${i + 1}`, endArrows(e), false, endSpots(e)));
          // an unmarked target's face found and distance estimated
          errs.push(...estimateErrors(r.round?.ends?.[e.target ?? 0], e, `end ${i + 1}`));
        });
      if (!isOptInt(r.minutes, 0, 1440)) errs.push('invalid minutes');
      if (r.timer != null) {
        const tm = r.timer;
        if (typeof tm !== 'object' || typeof tm.running !== 'boolean' || !(Number.isFinite(tm.elapsedMs) && tm.elapsedMs >= 0))
          errs.push('invalid timer');
        else if (tm.running && Number.isNaN(Date.parse(tm.startedAt))) errs.push('invalid timer start');
      }
      if (r.status === 'active') {
        errs.push(...validateEnd(r.current, 'current end', endArrows(r.current), false, endSpots(r.current)));
        errs.push(...estimateErrors(r.round?.ends?.[r.current?.target ?? 0], r.current, 'current end'));
        if (!(Number.isInteger(r.cursor) && r.cursor >= 0 && r.cursor < (r.current?.arrows?.length ?? r.arrowsPerEnd))) errs.push('invalid cursor');
        if (r.view != null && !(Number.isInteger(r.view) && r.view >= 0 && r.view < r.ends.length)) errs.push('invalid end view');
      }
      return errs;
    },
  },
  // gear setups (stored as `setups` since schema 7; "gear snapshots" before). One is active.
  setups: {
    defaults: () => ({ name: '', fields: {}, history: [] }),
    validate(r) {
      const errs = [];
      if (!isStr(r.name) || !r.name.trim()) errs.push('name is required');
      if (!r.fields || typeof r.fields !== 'object' || Array.isArray(r.fields)) errs.push('fields must be an object');
      else errs.push(...sightErrors(r.fields.sights));
      errs.push(...historyErrors(r.history));
      return errs;
    },
  },
  competitions: {
    defaults: () => ({ date: '', event: '', round: '', score: '', sightMark: '', conditions: '', note: '' }),
    validate(r) {
      const errs = ['date', 'event', 'round', 'score', 'sightMark', 'conditions', 'note']
        .filter((k) => !isStr(r[k]))
        .map((k) => `${k} must be text`);
      if (!errs.length && !(r.event.trim() || r.score.trim() || r.date.trim())) errs.push('enter at least an event, date or score');
      return errs;
    },
  },
};

export const defaultSettings = {
  accent: '#0B6E4F',
  // 'system' follows the device's light / dark setting; 'light' / 'dark' override it (this device only)
  theme: 'system',
  defaultInput: 'target',
  askGrades: true,
  // the gear setup new sessions use (a record of `setups`; see activeSetup in gearFields.js)
  activeSetupId: null,
  // the unit a gear field is shown in where it has two (e.g. { brace: 'cm' }); this device only
  gearUnits: {},
  // the setup of the last session of each kind of shooting (lastSetup.js); this device only
  lastSetup: defaultLastSetup(),
  // the user's wording of the M and S grades, only what differs from the defaults (gradeTexts.js); synced
  gradeTexts: null,
  // keep the raw picture of every Scan as a file on the phone (scanPhoto.js); this device only
  saveScanPhotos: true,
  // how a Scan finds the arrows: 'rules' (photoDetect.js) or 'network' (arrowNet.js); this device only
  scanMethod: 'rules',
  // My drills, My exercises, the gym focus and the mental techniques (catalog.js): null while they
  // are the built-in lists; synced
  drillTypes: null,
  gymExercises: null,
  gymFocus: null,
  mentalTechniques: null,
};

/** Settings shared between devices by Google Drive sync; all others stay on the device. */
// Which gear setup is active (the setups themselves sync as a collection), the grade wording and the
// archer's lists. lastSetup changes on its own (starting a session) and would otherwise make a fresh
// device's settings look newer.
export const SYNCED_SETTING_KEYS = ['activeSetupId', 'gradeTexts', 'drillTypes', 'gymExercises', 'gymFocus', 'mentalTechniques'];

/** The Ink accent follows the text colour, so it is light in dark mode (see applyTheme in main.js). */
export const INK_ACCENT = '#14181C';
export const ACCENTS = ['#0B6E4F', INK_ACCENT, '#1D4ED8', '#B45309'];
