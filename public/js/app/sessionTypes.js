// Session types (training, blank bale, competition, strength, mental) and the fields of the non-scored ones.
import { faceLabel } from './scoring.js';

export const SESSION_TYPES = ['training', 'blank', 'competition', 'strength', 'mental', 'manual'];

export const TYPE_LABELS = {
  training: 'Training',
  blank: 'Blank bale',
  competition: 'Competition',
  strength: 'SPT', // specific physical training: the bow-strength drills
  mental: 'Mental',
  manual: 'Manual',
};

/** Session types that record a number of arrows instead of scoring them. */
export const countsArrows = (type) => type === 'blank' || type === 'manual';

/**
 * Training and competition are scored arrow by arrow on the Log; the others are a short form.
 * Manual: arrows and / or duration typed in afterwards, with a date and no timer.
 */
export function isScored(type) {
  return type == null || type === 'training' || type === 'competition';
}

export const sessionType = (session) => session.type || 'training';

const pad2 = (n) => String(n).padStart(2, '0');
/** Local HH:MM of a Date (or ISO string); '' when it is not a date. */
export function hourMinute(d) {
  const t = d instanceof Date ? d : new Date(d ?? NaN);
  return Number.isNaN(t.getTime()) ? '' : `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}
export const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * Newest first by when the session took place: its date and start time (sessions logged before the
 * time was recorded use the time they were created).
 */
const sortKey = (s) => `${s.date} ${s.time || hourMinute(s.createdAt)} ${s.createdAt || ''}`;
export const newestFirst = (a, b) => sortKey(b).localeCompare(sortKey(a));

/**
 * Bow-specific strength drills. `hold`: the drill has a hold time in seconds. `short`: the name on
 * the "+ …" chip that adds it, when shorter than `label`. `retired`: no longer
 * offered for new sessions (holding at full draw is what SPT holds are), but sessions that have it
 * keep it and stay valid.
 */
export const DRILLS = [
  { id: 'spt', label: 'SPT holds', hold: true },
  { id: 'hold', label: 'Holding at full draw', hold: true, retired: true },
  { id: 'draw', label: 'Draws with the bow', short: 'Draws with bow', hold: false },
  { id: 'band', label: 'Band draws', hold: false },
];
export const DRILL_IDS = DRILLS.map((d) => d.id);
export const drillLabel = (id) => DRILLS.find((d) => d.id === id)?.label || id;

/**
 * Common routines for a drill with a hold, offered as one-tap chips: sets × reps holds of `hold`
 * seconds, with `rest` seconds after each hold. Edit freely: the chip whose numbers match the
 * drill shows as selected.
 */
export const SPT_PRESETS = [
  { label: '6 × 20 s · 40 s rest', sets: 1, reps: 6, hold: 20, rest: 40 },
  { label: '6 × 15 s · 40 s rest', sets: 1, reps: 6, hold: 15, rest: 40 },
];

/** What the −/+ tiles of a drill allow: [min, max, step] per drill field. */
export const DRILL_LIMITS = {
  sets: [1, 10, 1],
  reps: [1, 30, 1],
  holdSec: [5, 120, 5],
  restSec: [5, 180, 5],
};

export const MENTAL_TECHNIQUES = ['Visualisation', 'Breathing', 'Shot routine', 'Relaxation', 'Blank boss', 'Self-talk'];

export const EFFORT_MAX = 10;
export const FOCUS_MAX = 5;

export function emptyDrill(kind) {
  // a drill with a hold also has the rest after each hold (for the interval timer)
  const hold = DRILLS.find((d) => d.id === kind)?.hold;
  return { kind, sets: 1, reps: 10, holdSec: hold ? 10 : null, ...(hold ? { restSec: 10 } : {}) };
}

/** A session's review: what went well, what to work on, how. */
export const emptyReview = () => ({ good: '', workOn: '', how: '' });

/** A competition session's details (placement is usually known only after the event). */
export const emptyCompetition = () => ({ event: '', round: '', conditions: '', placement: '' });

/**
 * One line describing a scored session's setup: "18 m · face", then the `more` parts given (ends,
 * arrows, duration…; empty ones are left out). Used wherever a scored session is described in a line.
 */
export function setupSummary(session, ...more) {
  return [`${session.distance} m`, faceLabel(session.face), ...more].filter(Boolean).join(' · ');
}

/** One line describing a strength or mental session (History list, Dashboard). */
export function formSummary(session) {
  const parts = [];
  if (countsArrows(session.type) && session.arrows != null) parts.push(`${session.arrows} arrows`);
  if (session.minutes) parts.push(`${session.minutes} min`);
  if (session.type === 'strength') {
    if (session.effort) parts.push(`effort ${session.effort}/${EFFORT_MAX}`);
    const n = session.drills?.length || 0;
    if (n) parts.push(`${n} ${n === 1 ? 'drill' : 'drills'}`);
  } else if (session.type === 'mental') {
    if (session.focus) parts.push(`focus ${session.focus}/${FOCUS_MAX}`);
    if (session.techniques?.length) parts.push(session.techniques.join(', '));
  }
  return parts.join(' · ');
}
