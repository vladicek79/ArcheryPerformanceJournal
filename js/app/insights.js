// Insights: pure data helpers for trends, the sessions table, the review journal and training load.
import { computeStats } from './stats.js';
import { isScored, sessionType, countsArrows, typeFacts, distanceUnitOf } from './sessionTypes.js';

export const RANGES = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '1y', label: '1 year', days: 365 },
  { id: 'all', label: 'All', days: null },
];

const DAY_MS = 24 * 3600 * 1000;
const isoDay = (d) => d.toISOString().slice(0, 10);

/** Finished sessions matching the filters, oldest first. */
export function filterSessions(
  sessions,
  { range = 'all', type = 'all', distance = 'all' } = {},
  now = new Date(),
) {
  const days = RANGES.find((r) => r.id === range)?.days;
  const from = days ? isoDay(new Date(now.getTime() - (days - 1) * DAY_MS)) : '';
  return sessions
    .filter((s) => s.status === 'finished' && !s.deleted)
    .filter((s) => s.date >= from)
    .filter((s) => type === 'all' || sessionType(s) === type)
    .filter((s) => distance === 'all' || (isScored(s.type) && distanceFilterKey(s) === String(distance)))
    .sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || '')));
}

/**
 * A session's distance as the filter knows it: metres as the number ("18"), yards with their unit
 * ("20 yd"), so 20 yd and 20 m are different distances (a distance is never converted).
 */
export const distanceFilterKey = (s) =>
  distanceUnitOf(s) === 'm' ? String(s.distance) : `${s.distance} ${distanceUnitOf(s)}`;

/** The label of a distance filter value: 18 → "18 m", "20 yd" as it is. */
export const distanceFilterLabel = (d) => (typeof d === 'number' ? `${d} m` : d);

/**
 * Distances that appear in scored sessions (for the distance filter): metres as numbers, smallest
 * first, then yards as "20 yd" and feet as "20 ft".
 */
export function distancesOf(sessions) {
  const scored = sessions.filter((s) => isScored(s.type) && s.distance);
  const metres = [...new Set(scored.filter((s) => distanceUnitOf(s) === 'm').map((s) => s.distance))].sort(
    (a, b) => a - b,
  );
  const other = (unit) =>
    [...new Set(scored.filter((s) => distanceUnitOf(s) === unit).map((s) => s.distance))]
      .sort((a, b) => a - b)
      .map((d) => `${d} ${unit}`);
  return [...metres, ...other('yd'), ...other('ft')];
}

/** One row per session, with the numbers the table and charts need (null where not applicable). */
export function sessionRow(s) {
  const scored = isScored(s.type);
  const st = scored ? computeStats(s.ends || [], s.face) : null;
  return {
    id: s.id,
    date: s.date,
    type: sessionType(s),
    distance: scored ? s.distance : null,
    distanceUnit: scored ? distanceUnitOf(s) : null,
    face: scored ? s.face : null,
    event: s.competition?.event || '',
    // blank bale: the arrows are counted but not scored
    arrows: st ? st.arrows : countsArrows(s.type) ? (s.arrows ?? null) : null,
    total: st ? st.total : null,
    max: st ? st.max : null,
    avgArrow: st && st.arrows ? st.avgArrow : null,
    avgM: st ? st.avgM : null,
    avgS: st ? st.avgS : null,
    programPct: st ? st.programPct : null,
    // scored sessions get their minutes from the session timer
    minutes: s.minutes ?? null,
  };
}

/** Sort rows by a column; nulls always last. */
export function sortRows(rows, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

/** Sessions with a review, newest first, filtered by free text (case-insensitive) across all three notes. */
export function reviewRows(sessions, query = '') {
  const q = query.trim().toLowerCase();
  return sessions
    .filter((s) => s.review && (s.review.good || s.review.workOn || s.review.how))
    .filter(
      (s) =>
        !q ||
        [s.review.good, s.review.workOn, s.review.how, s.competition?.event].some((t) =>
          (t || '').toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Monday of the ISO week of a YYYY-MM-DD date, as YYYY-MM-DD. */
export function weekStart(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return isoDay(new Date(d.getTime() - dow * DAY_MS));
}

/**
 * Training load per period (oldest first), with empty periods in between filled in:
 * sessions per type, arrows shot, and strength (SPT), gym and mental minutes.
 * Each row carries its period start as `period` (and as `week` or `day`).
 */
const emptyRow = (period) => ({
  period,
  training: 0,
  blank: 0,
  competition: 0,
  strength: 0,
  mental: 0,
  manual: 0,
  gym: 0,
  arrows: 0,
  strengthMin: 0,
  gymMin: 0,
  mentalMin: 0,
  // minutes per session type (scored sessions: from the session timer), and their total
  min: { training: 0, blank: 0, competition: 0, strength: 0, mental: 0, manual: 0, gym: 0 },
  totalMin: 0,
});

function loadBy(sessions, keyOf, stepDays) {
  if (!sessions.length) return [];
  const byPeriod = new Map();
  for (const s of sessions) {
    const p = keyOf(s.date);
    if (!byPeriod.has(p)) byPeriod.set(p, emptyRow(p));
    const row = byPeriod.get(p);
    const type = sessionType(s);
    row[type] += 1;
    row.min[type] += s.minutes || 0;
    row.totalMin += s.minutes || 0;
    // each type counts in its own bucket: arrows (scored ones from their ends), or its minutes
    const { load } = typeFacts(type);
    if (load === 'arrows')
      row.arrows += isScored(type) ? computeStats(s.ends || [], s.face).arrows : s.arrows || 0;
    else if (load) row[load] += s.minutes || 0;
  }
  const periods = [...byPeriod.keys()].sort();
  const out = [];
  for (
    let t = Date.parse(`${periods[0]}T00:00:00Z`);
    t <= Date.parse(`${periods.at(-1)}T00:00:00Z`);
    t += stepDays * DAY_MS
  ) {
    const p = isoDay(new Date(t));
    out.push(byPeriod.get(p) || emptyRow(p));
  }
  return out;
}

/** Training load per ISO week (Monday start); rows also carry `week`. */
export function weeklyLoad(sessions) {
  return loadBy(sessions, weekStart, 7).map((r) => ({ ...r, week: r.period }));
}

/** Training load per calendar day, empty days in between filled in; rows also carry `day`. */
export function dailyLoad(sessions) {
  return loadBy(sessions, (d) => d, 1).map((r) => ({ ...r, day: r.period }));
}
