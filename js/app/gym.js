// Gym sessions: pure helpers for the exercises and sets (pre-fill from the last workout, the "last
// time" line, set counts, the History list summary). No DOM, no storage: the pages and tests call them.
//
// A gym session's fields: { focus: string[], exercises: [{ name, unit, sets: [{ reps, kg, done }] }], note }.
// `unit` is 'reps' (reps counts repetitions) or 's' (reps holds seconds, e.g. a plank). kg 0 = body weight.

export const GYM_UNITS = ['reps', 's'];
export const REPS_MAX = 9999;
export const KG_MAX = 1000;
export const KG_STEP = 2.5;
/** −/+ on the reps of a set: 1 rep, or 10 s for a timed exercise. */
export const repsStep = (unit) => (unit === 's' ? 10 : 1);

/** A gym session with nothing in it yet. */
export const emptyGym = () => ({ focus: [], exercises: [], note: '' });

/** The first set of a new exercise. */
export const newSet = (unit = 'reps') => ({ reps: unit === 's' ? 30 : 10, kg: 0, done: false });

/** A new exercise with one set. */
export const newExercise = (name, unit = 'reps') => ({ name: String(name).trim(), unit, sets: [newSet(unit)] });

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const isGym = (s) => s && s.type === 'gym' && s.status === 'finished' && !s.deleted;

/** Reps as typed or stepped: a whole number from 0 to REPS_MAX. */
export function clampReps(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(REPS_MAX, Math.max(0, v)) : 0;
}

/** Weight as typed or stepped: 0 (body weight) to KG_MAX, at most two decimals. */
export function clampKg(n) {
  const v = Number(String(n).replace(',', '.'));
  return Number.isFinite(v) ? Math.min(KG_MAX, Math.max(0, Math.round(v * 100) / 100)) : 0;
}

/** "BW" for body weight, else the number ("45", "47.5"). */
export const kgText = (kg) => (!kg ? 'BW' : String(kg));

/** The sets that count for "last time": the ones marked done, or all of them when none was. */
function countedSets(exercise) {
  const sets = exercise?.sets || [];
  const done = sets.filter((s) => s.done);
  return done.length ? done : sets;
}

/**
 * One exercise as a short line: "3 × 10 · 45 kg", "3 × 60 s", "3 × 8" (body weight), or with
 * varying reps "10, 10, 8 · 45 kg". The weight shown is the heaviest set. '' when it has no sets.
 */
export function lastTimeText(exercise) {
  const sets = countedSets(exercise);
  if (!sets.length) return '';
  const unit = exercise.unit === 's' ? ' s' : '';
  const reps = sets.map((s) => s.reps ?? 0);
  const repsPart = reps.every((r) => r === reps[0]) ? `${sets.length} × ${reps[0]}${unit}` : `${reps.join(', ')}${unit}`;
  const kg = Math.max(...sets.map((s) => s.kg || 0));
  return kg ? `${repsPart} · ${kgText(kg)} kg` : repsPart;
}

/**
 * "Last time" for an exercise by name: its line in the newest finished gym session that has it
 * (`sessions` newest first), or null when it was never done.
 */
export function lastTimeOf(name, sessions = []) {
  for (const s of sessions) {
    if (!isGym(s)) continue;
    const ex = (s.exercises || []).find((e) => sameName(e.name, name));
    if (ex) return lastTimeText(ex) || null;
  }
  return null;
}

/** The session prefillExercises copies from (see there), or null. */
export function prefillSource(sessions = [], focus = []) {
  const withExercises = sessions.filter((s) => isGym(s) && s.exercises?.length);
  return withExercises.find((s) => (s.focus || []).some((f) => focus.includes(f))) || withExercises[0] || null;
}

/**
 * The exercises a new gym session starts with: those of the newest finished gym session whose focus
 * shares one with `focus`; else of the newest gym session; else none. Sessions without exercises
 * (a note only) are passed over. Each set is copied as not done. `sessions` newest first.
 */
export function prefillExercises(sessions = [], focus = []) {
  const from = prefillSource(sessions, focus);
  if (!from) return [];
  return from.exercises.map((e) => ({
    name: e.name,
    unit: GYM_UNITS.includes(e.unit) ? e.unit : 'reps',
    sets: countedSets(e).map((s) => ({ reps: s.reps ?? 0, kg: s.kg || 0, done: false })),
  }));
}

/** Done and total sets of one exercise. */
export function setCounts(exercise) {
  const sets = exercise?.sets || [];
  return { done: sets.filter((s) => s.done).length, total: sets.length };
}

/** Sets marked done over all the exercises. */
export const doneSets = (exercises = []) => exercises.reduce((n, e) => n + setCounts(e).done, 0);

/** "x of y sets done". */
export function progressText(exercise) {
  const { done, total } = setCounts(exercise);
  return `${done} of ${total} ${total === 1 ? 'set' : 'sets'} done`;
}

/** Minutes as h:mm ("0:52", "1:05"). */
export function hoursMinutes(min) {
  const m = Math.max(0, Math.round(min || 0));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Copy the last set of an exercise as a new, not done set (a new exercise's first set when it has none). */
export function withAddedSet(exercise) {
  const last = exercise.sets?.at(-1);
  return { ...exercise, sets: [...(exercise.sets || []), last ? { ...last, done: false } : newSet(exercise.unit)] };
}

/** The exercise without its set `k` (the last one when `k` is left out). */
export function withoutSet(exercise, k = (exercise.sets?.length || 0) - 1) {
  return { ...exercise, sets: (exercise.sets || []).filter((_, j) => j !== k) };
}

/** Move item `i` of a list up (-1) or down (+1); unchanged at the ends. */
export function moved(list, i, by) {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * One line for a gym session (History list): "Upper body · 4 exercises · 12 sets · 0:52". Sets are
 * the ones marked done. A session with only a note shows the start of the note.
 */
export function gymSummary(session) {
  const exercises = session.exercises || [];
  const parts = [...(session.focus || [])];
  if (exercises.length) {
    parts.push(`${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`);
    const sets = doneSets(exercises);
    parts.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`);
  }
  if (session.minutes) parts.push(hoursMinutes(session.minutes));
  if (!exercises.length) {
    const note = String(session.note || '').trim().split('\n')[0];
    if (note) parts.push(note.length > 40 ? `${note.slice(0, 39)}…` : note);
  }
  return parts.join(' · ');
}
