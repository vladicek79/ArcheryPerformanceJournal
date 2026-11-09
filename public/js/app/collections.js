// What the app stores (ARCHITECTURE §6.4). The repository validates before every save and on import.
import { FACE_IDS, ARROWS_PER_END_MAX, isValidArrowsPerEnd, isValidArrowValue } from './scoring.js';

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

export const collections = {
  sessions: {
    defaults: () => ({ ends: [], status: 'active', gear: null, gearSnapshotId: null }),
    validate(r) {
      const errs = [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) errs.push('date must be YYYY-MM-DD');
      if (!(Number.isFinite(r.distance) && r.distance > 0)) errs.push('invalid distance');
      if (!FACE_IDS.includes(r.face)) errs.push('invalid face');
      if (!isValidArrowsPerEnd(r.arrowsPerEnd)) errs.push(`arrows per end must be 1 to ${ARROWS_PER_END_MAX}`);
      if (!['active', 'finished'].includes(r.status)) errs.push('invalid status');
      if (r.review != null && (typeof r.review !== 'object' || !isStr(r.review.good ?? '') || !isStr(r.review.workOn ?? ''))) errs.push('invalid review');
      if (!Array.isArray(r.ends)) errs.push('ends must be a list');
      // ends may be partly scored (Next auto-saves an unfinished end)
      else r.ends.forEach((e, i) => errs.push(...validateEnd(e, `end ${i + 1}`, r.arrowsPerEnd, false)));
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
  lastSetup: { distance: 18, face: '40t', arrowsPerEnd: 3 },
  sightsSeeded: false,
};

/** Settings shared between devices by Google Drive sync; all others stay on the device. */
// Only the gear setup: lastSetup / sightsSeeded change on their own (starting a session, first launch)
// and would otherwise make a fresh device's settings look newer than the real gear setup.
export const SYNCED_SETTING_KEYS = ['gear', 'activeSnapshotId'];

export const ACCENTS = ['#0B6E4F', '#14181C', '#1D4ED8', '#B45309'];
export const DEFAULT_SIGHT_DISTANCES = ['18', '30', '50', '60', '70', '90'];
