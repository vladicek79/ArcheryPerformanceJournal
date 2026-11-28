// Interval ("Tabata") timer: the plan of a timed drill and where a moment in time falls in it.
// Pure: no clock, no DOM, no sound. The timer screen (views/tabataTimer.js) keeps the time and asks
// this module what to show.
//
// A drill is `sets` sets of `reps` repetitions. Each repetition is `work` seconds (the hold) and
// is followed by `rest` seconds, except that the last repetition of a set is followed by the longer
// `setRest`, and the very last repetition by nothing. A `prepare` countdown comes first.

export const TABATA_PREPARE = 10; // seconds to get into position before the first hold
export const TABATA_SET_REST = 60; // seconds between sets

const whole = (n, min) => Math.max(min, Math.round(Number(n) || 0));

/**
 * The phases of a drill, in order: [{ kind, sec, rep, set }] with kind 'prepare' | 'work' | 'rest' |
 * 'setRest'. `rep` and `set` (1-based) are the repetition a phase belongs to: a rest belongs to the
 * hold before it, the prepare phase to the first hold. Phases of 0 seconds are left out.
 */
export function tabataPlan({ work, rest = 0, reps = 1, sets = 1, prepare = TABATA_PREPARE, setRest = TABATA_SET_REST }) {
  const w = whole(work, 1);
  const r = whole(rest, 0);
  const nReps = whole(reps, 1);
  const nSets = whole(sets, 1);
  const phases = [];
  const add = (kind, sec, rep, set) => {
    if (sec > 0) phases.push({ kind, sec, rep, set });
  };
  add('prepare', whole(prepare, 0), 1, 1);
  for (let set = 1; set <= nSets; set++) {
    for (let rep = 1; rep <= nReps; rep++) {
      add('work', w, rep, set);
      const lastRep = rep === nReps;
      if (lastRep && set === nSets) break;
      add(lastRep ? 'setRest' : 'rest', lastRep ? whole(setRest, 0) : r, rep, set);
    }
  }
  return { phases, reps: nReps, sets: nSets, totalSec: phases.reduce((sum, p) => sum + p.sec, 0) };
}

/**
 * Where `elapsedMs` (time run, pauses left out) falls in the plan:
 *   { done, index, phase, leftMs, totalLeftMs }
 * `leftMs` is what is left of the phase, `totalLeftMs` of the whole drill. Past the end: done, with
 * the last phase and nothing left.
 */
export function tabataAt(plan, elapsedMs) {
  const t = Math.max(0, elapsedMs);
  let start = 0;
  for (let index = 0; index < plan.phases.length; index++) {
    const end = start + plan.phases[index].sec * 1000;
    if (t < end) return { done: false, index, phase: plan.phases[index], leftMs: end - t, totalLeftMs: plan.totalSec * 1000 - t };
    start = end;
  }
  const index = plan.phases.length - 1;
  return { done: true, index, phase: plan.phases[index] || null, leftMs: 0, totalLeftMs: 0 };
}

/** The elapsed time (ms) at which phase `index` starts: where "skip" and "back" jump to. */
export function tabataStartOf(plan, index) {
  const n = Math.max(0, Math.min(plan.phases.length, index));
  return plan.phases.slice(0, n).reduce((sum, p) => sum + p.sec, 0) * 1000;
}

/** m:ss for a number of milliseconds left, rounded up (a countdown shows 0:01 until it is over). */
export function tabataClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
