// Session types (training, blank bale, competition, strength, mental) and the fields of the non-scored ones.

export const SESSION_TYPES = ['training', 'blank', 'competition', 'strength', 'mental', 'manual'];

export const TYPE_LABELS = {
  training: 'Training',
  blank: 'Blank bale',
  competition: 'Competition',
  strength: 'Strength',
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

/** Bow-specific strength drills. `hold`: the drill has a hold time in seconds. */
export const DRILLS = [
  { id: 'spt', label: 'SPT holds', hold: true },
  { id: 'hold', label: 'Holding at full draw', hold: true },
  { id: 'draw', label: 'Draws with the bow', hold: false },
  { id: 'band', label: 'Band draws', hold: false },
];
export const DRILL_IDS = DRILLS.map((d) => d.id);
export const drillLabel = (id) => DRILLS.find((d) => d.id === id)?.label || id;

export const MENTAL_TECHNIQUES = ['Visualisation', 'Breathing', 'Shot routine', 'Relaxation', 'Blank boss', 'Self-talk'];

export const EFFORT_MAX = 10;
export const FOCUS_MAX = 5;

export function emptyDrill(kind) {
  return { kind, sets: 1, reps: 10, holdSec: DRILLS.find((d) => d.id === kind)?.hold ? 10 : null };
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
