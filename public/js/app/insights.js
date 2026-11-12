// Insights: pure data helpers for trends, the sessions table, the review journal and training load.
import { computeStats } from './stats.js';
import { isScored, sessionType, countsArrows } from './sessionTypes.js';

export const RANGES = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '1y', label: '12 months', days: 365 },
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
    .filter((s) => distance === 'all' || (isScored(s.type) && s.distance === Number(distance)))
    .sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || '')));
}

/** Distances that appear in scored sessions (for the distance filter). */
export function distancesOf(sessions) {
  return [...new Set(sessions.filter((s) => isScored(s.type) && s.distance).map((s) => s.distance))].sort(
    (a, b) => a - b,
  );
}

/** One row per session, with the numbers the table and charts need (null where not applicable). */
export function sessionRow(s) {
  const scored = isScored(s.type);
  const st = scored ? computeStats(s.ends || []) : null;
  return {
    id: s.id,
    date: s.date,
    type: sessionType(s),
    distance: scored ? s.distance : null,
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
 * Training load per week (oldest first), with empty weeks in between filled in:
 * sessions per type, arrows shot, and strength / mental minutes.
 */
const emptyWeek = (week) => ({
  week,
  training: 0,
  blank: 0,
  competition: 0,
  strength: 0,
  mental: 0,
  manual: 0,
  arrows: 0,
  strengthMin: 0,
  mentalMin: 0,
  // minutes per session type (scored sessions: from the session timer), and their total
  min: { training: 0, blank: 0, competition: 0, strength: 0, mental: 0, manual: 0 },
  totalMin: 0,
});

export function weeklyLoad(sessions) {
  if (!sessions.length) return [];
  const byWeek = new Map();
  for (const s of sessions) {
    const w = weekStart(s.date);
    if (!byWeek.has(w)) byWeek.set(w, emptyWeek(w));
    const row = byWeek.get(w);
    const type = sessionType(s);
    row[type] += 1;
    row.min[type] += s.minutes || 0;
    row.totalMin += s.minutes || 0;
    if (isScored(s.type)) row.arrows += computeStats(s.ends || []).arrows;
    else if (countsArrows(type)) row.arrows += s.arrows || 0;
    else if (type === 'strength') row.strengthMin += s.minutes || 0;
    else if (type === 'mental') row.mentalMin += s.minutes || 0;
  }
  const weeks = [...byWeek.keys()].sort();
  const out = [];
  for (
    let t = Date.parse(`${weeks[0]}T00:00:00Z`);
    t <= Date.parse(`${weeks.at(-1)}T00:00:00Z`);
    t += 7 * DAY_MS
  ) {
    const w = isoDay(new Date(t));
    out.push(byWeek.get(w) || emptyWeek(w));
  }
  return out;
}
