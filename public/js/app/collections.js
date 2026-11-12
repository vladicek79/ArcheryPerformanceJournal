// What the app stores (ARCHITECTURE §6.4). The repository validates before every save and on import.
import { FACE_IDS, ARROWS_PER_END_MAX, isValidArrowsPerEnd, isValidArrowValue } from './scoring.js';
import { SESSION_TYPES, DRILL_IDS, MENTAL_TECHNIQUES, EFFORT_MAX, FOCUS_MAX, isScored } from './sessionTypes.js';

const isStr = (v) => typeof v === 'string';
const isGrade = (g) => g == null || (Number.isInteger(g) && g >= 1 && g <= 5);
const isCount = (n) => Number.isInteger(n) && n >= 0;
const isUnit = (n) => n == null || (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 2);

function validateArrow(a, where, requireValue) {
  const errs = [];
  if (!a || typeof a !== 'object') return [`${where}: not an arrow`];
  if (a.v == null) {
    if (requireValue) errs.push(`${where}: missing score`);
  } else if (!isValidArrowValue(a.v)) errs.push(`${where}: invalid score ${a.v}`);
  if (!isGrade(a.m)) errs.push(`${where}: invalid M grade`);
  if (!isGrade(a.s)) errs.push(`${where}: invalid S grade`);
  if (!isUnit(a.x) || !isUnit(a.y)) errs.push(`${where}: invalid position`);
  if (a.spot != null && !(Number.isInteger(a.spot) && a.spot >= 0 && a.spot <= 2)) errs.push(`${where}: invalid spot`);
  return errs;
}

function validateEnd(e, where, n, requireValues) {
  if (!e || !Array.isArray(e.arrows)) return [`${where}: missing arrows`];
  const errs = [];
  if (e.arrows.length !== n) errs.push(`${where}: expected ${n} arrows`);
  e.arrows.forEach((a, i) => errs.push(...validateArrow(a, `${where} arrow ${i + 1}`, requireValues)));
  if (!isCount(e.ld) || !isCount(e.cld)) errs.push(`${where}: invalid let-downs`);
  else if (e.cld > e.ld) errs.push(`${where}: correct let-downs exceed let-downs`);
  if (e.note != null && !isStr(e.note)) errs.push(`${where}: invalid note`);
  return errs;
}

const isOptInt = (n, min, max) => n == null || (Number.isInteger(n) && n >= min && n <= max);

/** Blank bale, strength and mental sessions: a saved form, never active. */
function validateForm(r) {
  const errs = [];
  if (r.status !== 'finished') errs.push(`${r.type} sessions are saved as finished`);
  if (!isOptInt(r.minutes, 0, 1440)) errs.push('invalid minutes');
  if (r.note != null && !isStr(r.note)) errs.push('invalid note');
  if (r.type === 'blank') {
    if (!isOptInt(r.arrows, 0, 10000)) errs.push('invalid arrow count');
  } else if (r.type === 'strength') {
    if (!isOptInt(r.effort, 1, EFFORT_MAX)) errs.push('invalid effort');
    if (!Array.isArray(r.drills)) errs.push('drills must be a list');
    else
      r.drills.forEach((d, i) => {
        if (!d || !DRILL_IDS.includes(d.kind)) errs.push(`drill ${i + 1}: unknown drill`);
        else if (!isOptInt(d.sets, 0, 999) || !isOptInt(d.reps, 0, 9999) || !isOptInt(d.holdSec, 0, 3600)) errs.push(`drill ${i + 1}: invalid numbers`);
      });
  } else {
    if (!isOptInt(r.focus, 1, FOCUS_MAX)) errs.push('invalid focus');
    if (!Array.isArray(r.techniques) || r.techniques.some((t) => !MENTAL_TECHNIQUES.includes(t))) errs.push('invalid techniques');
  }
  return errs;
}

export const collections = {
  sessions: {
    defaults: () => ({ type: 'training', ends: [], status: 'active', gear: null, gearSnapshotId: null }),
    validate(r) {
      const errs = [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) errs.push('date must be YYYY-MM-DD');
      if (!SESSION_TYPES.includes(r.type)) errs.push('invalid session type');
      if (!['active', 'finished'].includes(r.status)) errs.push('invalid status');
      if (r.review != null && (typeof r.review !== 'object' || !isStr(r.review.good ?? '') || !isStr(r.review.workOn ?? '') || !isStr(r.review.how ?? ''))) errs.push('invalid review');
      if (!isScored(r.type)) return [...errs, ...validateForm(r)];
      if (r.competition != null && (typeof r.competition !== 'object' || ['event', 'round', 'conditions', 'placement'].some((k) => !isStr(r.competition[k] ?? '')))) {
        errs.push('invalid competition details');
      }
      if (!(Number.isFinite(r.distance) && r.distance > 0)) errs.push('invalid distance');
      if (!FACE_IDS.includes(r.face)) errs.push('invalid face');
      if (!isValidArrowsPerEnd(r.arrowsPerEnd)) errs.push(`arrows per end must be 1 to ${ARROWS_PER_END_MAX}`);
      if (!Array.isArray(r.ends)) errs.push('ends must be a list');
      // ends may be partly scored (Next auto-saves an unfinished end)
      else r.ends.forEach((e, i) => errs.push(...validateEnd(e, `end ${i + 1}`, r.arrowsPerEnd, false)));
      if (!isOptInt(r.minutes, 0, 1440)) errs.push('invalid minutes');
      if (r.timer != null) {
        const tm = r.timer;
        if (typeof tm !== 'object' || typeof tm.running !== 'boolean' || !(Number.isFinite(tm.elapsedMs) && tm.elapsedMs >= 0))
          errs.push('invalid timer');
        else if (tm.running && Number.isNaN(Date.parse(tm.startedAt))) errs.push('invalid timer start');
      }
      if (r.status === 'active') {
        errs.push(...validateEnd(r.current, 'current end', r.arrowsPerEnd, false));
        if (!(Number.isInteger(r.cursor) && r.cursor >= 0 && r.cursor < r.arrowsPerEnd)) errs.push('invalid cursor');
        if (r.view != null && !(Number.isInteger(r.view) && r.view >= 0 && r.view < r.ends.length)) errs.push('invalid end view');
      }
      return errs;
    },
  },
  gearSnapshots: {
    defaults: () => ({ name: '', date: '', fields: {} }),
    validate(r) {
      const errs = [];
      if (!isStr(r.name) || !r.name.trim()) errs.push('name is required');
      if (!r.fields || typeof r.fields !== 'object') errs.push('fields must be an object');
      return errs;
    },
  },
  sightMarks: {
    defaults: () => ({ distance: '', elevation: '', windage: '', note: '' }),
    validate(r) {
      return ['distance', 'elevation', 'windage', 'note'].filter((k) => !isStr(r[k])).map((k) => `${k} must be text`);
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
  defaultInput: 'target',
  askGrades: true,
  gear: {},
  activeSnapshotId: null,
  // the saved setup the Gear tab was last loaded from (kept while editing, so it can be updated)
  loadedSnapshotId: null,
  lastSetup: { distance: 18, face: '40t', arrowsPerEnd: 3 },
  sightsSeeded: false,
};

/** Settings shared between devices by Google Drive sync; all others stay on the device. */
// Only the gear setup: lastSetup / sightsSeeded change on their own (starting a session, first launch)
// and would otherwise make a fresh device's settings look newer than the real gear setup.
export const SYNCED_SETTING_KEYS = ['gear', 'activeSnapshotId', 'loadedSnapshotId'];

export const ACCENTS = ['#0B6E4F', '#14181C', '#1D4ED8', '#B45309'];
export const DEFAULT_SIGHT_DISTANCES = ['18', '30', '50', '60', '70', '90'];
