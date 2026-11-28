// Session types (training, blank bale, competition, strength, mental, gym) and the fields of the non-scored ones.
import { faceLabel, isCompoundFace } from './scoring.js';
import { gymSummary, doneSets, emptyGym } from './gym.js';

export const SESSION_TYPES = ['training', 'blank', 'competition', 'strength', 'mental', 'manual', 'gym'];

export const TYPE_LABELS = {
  training: 'Training',
  blank: 'Blank bale',
  competition: 'Competition',
  strength: 'SPT', // specific physical training: the bow-strength drills
  mental: 'Mental',
  manual: 'Logged afterwards', // shown as "Log afterwards" on the New session page
  gym: 'Gym', // with SPT, the "Strength" choice on the New session page
};

/**
 * What each session type is, in one place:
 *   scored        scored arrow by arrow on the scoring screen (training, competition)
 *   countsArrows  records a number of arrows instead of scoring them
 *   timed         a form session timed while it is open (not Log afterwards, not the scored types)
 *   carriesGear   the session records the equipment it was shot with
 *   page          the route it runs on while ongoing (null: never ongoing)
 *   load          the training-load bucket it counts in: 'arrows', or minutes of SPT, gym or mental
 * Manual (Log afterwards): arrows and / or duration typed in afterwards, with a date and no timer.
 */
const FACTS = {
  training: { scored: true, countsArrows: false, timed: false, carriesGear: true, page: 'log', load: 'arrows' },
  competition: { scored: true, countsArrows: false, timed: false, carriesGear: true, page: 'log', load: 'arrows' },
  blank: { scored: false, countsArrows: true, timed: true, carriesGear: true, page: 'blank', load: 'arrows' },
  strength: { scored: false, countsArrows: false, timed: true, carriesGear: false, page: 'new/strength', load: 'strengthMin' },
  mental: { scored: false, countsArrows: false, timed: true, carriesGear: false, page: 'new/mental', load: 'mentalMin' },
  manual: { scored: false, countsArrows: true, timed: false, carriesGear: true, page: null, load: 'arrows' },
  gym: { scored: false, countsArrows: false, timed: true, carriesGear: false, page: 'gym', load: 'gymMin' },
};

/**
 * A type this device does not know (synced from a newer version): shown as a plain form session,
 * never scored, timed or ongoing, and counted in no training-load bucket.
 */
const UNKNOWN = { scored: false, countsArrows: false, timed: false, carriesGear: false, page: null, load: null };

/** The facts of a session type: a missing type is a training session (stored before types existed). */
export const typeFacts = (type) => (type == null ? FACTS.training : FACTS[type] || UNKNOWN);

/** Session types that record a number of arrows instead of scoring them. */
export const countsArrows = (type) => typeFacts(type).countsArrows;

/** Training and competition are scored arrow by arrow on the scoring screen; the others are a short form. */
export const isScored = (type) => typeFacts(type).scored;

/** Form sessions timed while they are open: all but Log afterwards (and not the scored types). */
export const isTimed = (type) => typeFacts(type).timed;

/** Whether a session of the type records its equipment (SPT, mental and gym do not). */
export const carriesGear = (type) => typeFacts(type).carriesGear;

/** The route a session of the type runs on while it is ongoing (null for Log afterwards). */
export const ongoingPage = (type) => typeFacts(type).page;

/**
 * What the banner strip of an ongoing session shows besides its timer, from the running session
 * (scored) or the open form's kept draft: distance and ends, the arrows of a blank bale, the done
 * sets of a gym session, nothing for the others.
 */
export function bannerFacts(type, record) {
  if (isScored(type)) return { distance: record?.distance, distanceUnit: distanceUnitOf(record), ends: record?.ends?.length || 0 };
  if (type === 'blank') return { arrows: record?.arrows || 0 };
  if (type === 'gym') return { sets: doneSets(record?.exercises) };
  return {};
}

/** The empty fields a form session of the type starts with (blank bale, Log afterwards, SPT, mental, gym). */
export function emptyFields(type) {
  if (type === 'gym') return { minutes: null, ...emptyGym() };
  if (countsArrows(type)) return { arrows: null, minutes: null, note: '' };
  if (type === 'strength') return { minutes: null, effort: null, drills: [], note: '' };
  return { minutes: null, focus: null, techniques: [] };
}

export const sessionType = (session) => session.type || 'training';

/**
 * Whether a scored session asks for the M / S grades of each arrow. Chosen on the Shooting page;
 * sessions stored before the choice existed (no `grading` field) are graded.
 */
export const isGraded = (session) => session?.grading !== false;

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
 * The built-in bow-specific strength drills: the start of My drills (catalog.js), where the archer
 * renames, hides and adds drill types. `hold`: the drill has a hold time in seconds. `noun`: what one
 * repetition is called ("10 holds", "12 draws"). `short`: the name on the "+ …" chip that adds it,
 * when shorter than `label`. `retired`: hidden at the start (holding at full draw is what SPT holds
 * are), but sessions that have it keep it and stay valid.
 */
export const DRILLS = [
  { id: 'spt', label: 'SPT holds', hold: true, noun: 'hold' },
  { id: 'hold', label: 'Holding at full draw', hold: true, noun: 'hold', retired: true },
  { id: 'draw', label: 'Draws with the bow', short: 'Draws with bow', hold: false, noun: 'draw' },
  { id: 'band', label: 'Band draws', hold: false, noun: 'draw' },
];

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

/** What a gym session works on: chips on the Gym setup page, any number picked. */
export const GYM_FOCUS = ['Full body', 'Upper body', 'Lower body', 'Core', 'Cardio', 'Mobility', 'Shoulder prehab'];

/**
 * The built-in gym exercises: the start of My exercises (catalog.js), offered as "+ …" chips on the
 * running gym session. `unit` 's': a set is held for seconds (a plank) instead of counted in reps.
 */
export const GYM_EXERCISES = [
  { name: 'Face pulls', unit: 'reps' },
  { name: 'Shoulder press', unit: 'reps' },
  { name: 'Rotator cuff', unit: 'reps' },
  { name: 'Deadlift', unit: 'reps' },
  { name: 'Squat', unit: 'reps' },
  { name: 'Push-ups', unit: 'reps' },
  { name: 'Pull-ups', unit: 'reps' },
  { name: 'Seated row', unit: 'reps' },
  { name: 'Plank', unit: 's' },
];

export const EFFORT_MAX = 10;
export const FOCUS_MAX = 5;

/** A new drill of `kind`; `hold` comes from its drill type (catalog.js), a built-in's by default. */
export function emptyDrill(kind, hold = DRILLS.find((d) => d.id === kind)?.hold) {
  // a drill with a hold also has the rest after each hold (for the interval timer)
  return { kind, sets: 1, reps: 10, holdSec: hold ? 10 : null, ...(hold ? { restSec: 10 } : {}) };
}

/** A session's review: what went well, what to work on, how. */
export const emptyReview = () => ({ good: '', workOn: '', how: '' });

/** A competition session's details (placement is usually known only after the event). */
export const emptyCompetition = () => ({ event: '', round: '', conditions: '', placement: '' });

/** Conditions offered as chips; stored in the competition's `conditions` text, comma-joined. */
export const CONDITIONS = ['Hall', 'Sun', 'Wind', 'Rain', 'Cold', 'Low light'];

/**
 * A conditions text as chips and the rest: each comma- or semicolon-separated part that names a
 * condition (any case) becomes its chip; the other parts stay as text, in their order.
 */
export function parseConditions(text) {
  const parts = String(text || '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chips = [];
  const rest = [];
  for (const p of parts) {
    const c = CONDITIONS.find((x) => x.toLowerCase() === p.toLowerCase());
    if (c && !chips.includes(c)) chips.push(c);
    else if (!c) rest.push(p);
  }
  return { chips: CONDITIONS.filter((c) => chips.includes(c)), rest: rest.join(', ') };
}

/** A conditions text with one chip's condition turned on or off; the typed rest is kept. */
export function toggleCondition(text, condition) {
  const { chips, rest } = parseConditions(text);
  return joinConditions(chips.includes(condition) ? chips.filter((c) => c !== condition) : [...chips, condition], rest);
}

/** Chips and the typed rest back into one conditions text ("Hall, Wind, dusty"). */
export function joinConditions(chips, rest = '') {
  return [...CONDITIONS.filter((c) => chips.includes(c)), String(rest || '').trim()].filter(Boolean).join(', ');
}

/**
 * One line describing a scored session's setup: "18 m · face", then the `more` parts given (ends,
 * arrows, duration…; empty ones are left out). Used wherever a scored session is described in a line.
 */
export function setupSummary(session, ...more) {
  return [distanceLabel(session), faceLabel(session.face), ...more].filter(Boolean).join(' · ');
}

/**
 * Distance units: a session's distance is stored in the unit it was set in (never converted). Feet
 * only come from a round (IFAA field rounds set their shortest targets in feet); the setup's unit
 * switch offers metres and yards.
 */
export const DISTANCE_UNITS = ['m', 'yd', 'ft'];
const UNIT_M = { m: 1, yd: 0.9144, ft: 0.3048 };

/** A scored session's (or setup's) distance unit: 'yd' or 'ft', else metres (records from before units have none). */
export const distanceUnitOf = (session) => (DISTANCE_UNITS.includes(session?.distanceUnit) ? session.distanceUnit : 'm');

/** "18 m", "20 yd", "20 ft". */
export const distanceLabel = (session) => `${session.distance} ${distanceUnitOf(session)}`;

/** The distance in metres, for the maths that needs it (the sight correction): yards and feet are converted only here. */
export const distanceMetres = (session) =>
  Number.isFinite(session?.distance) ? session.distance * UNIT_M[distanceUnitOf(session)] : null;

/** The bow type: stored on new sessions; an older one is compound when its face scores the inner 10. */
export const bowTypeOf = (session) =>
  session?.bowType === 'compound' || session?.bowType === 'recurve'
    ? session.bowType
    : isCompoundFace(session?.face)
      ? 'compound'
      : 'recurve';

export const BOW_LABELS = { recurve: 'Recurve', compound: 'Compound' };

/** One line describing a strength, gym or mental session (History list, Dashboard). */
export function formSummary(session) {
  if (session.type === 'gym') return gymSummary(session);
  const parts = [];
  if (countsArrows(session.type) && session.arrows != null) parts.push(`${session.arrows} arrows`);
  if (session.type === 'blank' && session.goal) parts.push(`goal ${session.goal}`);
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
