// What an SPT drill card shows, worked out from the drill alone: the preset it matches, its summary
// line, how long its interval timer runs, and the next value of a −/+ tile. Pure: no DOM.
import { DRILLS, DRILL_LIMITS, SPT_PRESETS, emptyDrill } from './sessionTypes.js';
import { tabataPlan, tabataClock } from './tabata.js';

/** Whether a drill has a hold time (and so a rest and an interval timer). */
export const hasHold = (drill) => !!DRILLS.find((d) => d.id === drill?.kind)?.hold;

/** The preset whose numbers the drill has, or null. */
export function presetOf(drill, presets = SPT_PRESETS) {
  if (!hasHold(drill)) return null;
  return (
    presets.find(
      (p) =>
        drill.sets === p.sets &&
        drill.reps === p.reps &&
        drill.holdSec === p.hold &&
        drill.restSec === p.rest,
    ) || null
  );
}

/** The drill's fields for a preset. */
export const presetFields = (p) => ({ sets: p.sets, reps: p.reps, holdSec: p.hold, restSec: p.rest });

const NUMBERS = ['sets', 'reps', 'holdSec', 'restSec'];

/**
 * A new drill of `kind`, with the numbers of the last one of that kind used: the latest in this
 * session's drills, else in the newest saved session that has one (`sessions` newest first), else
 * the standard defaults. Only the numbers are taken, never `done`.
 */
export function newDrill(kind, { drills = [], sessions = [] } = {}) {
  const fresh = emptyDrill(kind);
  const lastOf = (list) => [...(list || [])].reverse().find((d) => d?.kind === kind);
  const last = lastOf(drills) ?? sessions.map((s) => lastOf(s.drills)).find(Boolean);
  if (!last) return fresh;
  const out = { ...fresh };
  for (const k of NUMBERS) if (k in fresh && last[k] != null) out[k] = last[k];
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * One line saying what the drill is: "10 holds of 10 s, 10 s rest", "2 sets × 5 holds of 30 s,
 * 30 s rest", "3 sets × 12 draws". `short` leaves out the unit noun of a drill without a hold
 * when there is more than one set ("3 sets × 12"; one set stays "10 draws").
 */
export function drillSummary(drill, { short = false } = {}) {
  const sets = drill.sets ?? 1;
  const reps = drill.reps ?? 0;
  const lead = sets > 1 ? `${sets} sets × ` : '';
  if (hasHold(drill)) {
    const rest = drill.restSec ? `, ${drill.restSec} s rest` : ', no rest';
    return `${lead}${plural(reps, 'hold', 'holds')} of ${drill.holdSec ?? 0} s${rest}`;
  }
  if (short && sets > 1) return `${lead}${reps}`;
  return `${lead}${plural(reps, 'draw', 'draws')}`;
}

/** The plan the interval timer runs for a drill (prepare and set rests included). */
export const drillPlan = (drill) =>
  tabataPlan({ work: drill.holdSec, rest: drill.restSec ?? 0, reps: drill.reps, sets: drill.sets });

/** How long the drill's interval timer runs, as m:ss ("3:20"). */
export const drillDuration = (drill) => tabataClock(drillPlan(drill).totalSec * 1000);

/**
 * The value of a drill field after one tap on − (dir -1) or + (dir 1), kept within DRILL_LIMITS.
 * A value off the step (typed in, or from an older session) moves to the next step in that direction;
 * an empty one starts at the minimum.
 */
export function stepValue(key, value, dir) {
  const [min, max, step] = DRILL_LIMITS[key];
  if (value == null) return min;
  const onStep = value % step === 0;
  const next =
    dir > 0
      ? onStep
        ? value + step
        : Math.ceil(value / step) * step
      : onStep
        ? value - step
        : Math.floor(value / step) * step;
  return Math.max(min, Math.min(max, next));
}

/** A typed value kept within the field's limits (any whole number, not only on the step); null when not a number. */
export function clampValue(key, value) {
  const [min, max] = DRILL_LIMITS[key];
  const n = Math.round(Number(value));
  if (value === '' || value == null || !Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
