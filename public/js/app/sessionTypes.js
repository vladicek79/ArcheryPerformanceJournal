// Session types (training, blank bale, competition, strength, mental) and the fields of the non-scored ones.

export const SESSION_TYPES = ['training', 'blank', 'competition', 'strength', 'mental'];

export const TYPE_LABELS = {
  training: 'Training',
  blank: 'Blank bale',
  competition: 'Competition',
  strength: 'Strength',
  mental: 'Mental',
};

/** Training and competition are scored arrow by arrow on the Log; blank bale, strength and mental are a short form. */
export function isScored(type) {
  return type == null || type === 'training' || type === 'competition';
}

export const sessionType = (session) => session.type || 'training';

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
  if (session.type === 'blank' && session.arrows != null) parts.push(`${session.arrows} arrows`);
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
