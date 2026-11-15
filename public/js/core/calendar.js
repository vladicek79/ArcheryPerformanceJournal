// Calendar date math on ISO dates (YYYY-MM-DD), in local time. No DOM: used by the date picker.

const pad = (n) => String(n).padStart(2, '0');

/** Local Date → 'YYYY-MM-DD'. */
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → local Date at noon (noon keeps day arithmetic clear of DST changes); null if invalid. */
export function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return isoOf(d) === iso ? d : null;
}

/** The date `n` days after `iso` (negative goes back). */
export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** The same day `n` months later, clamped to the month's last day (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(iso, n) {
  const d = parseIso(iso);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return isoOf(target);
}

/** First day of the month of `iso`. */
export const monthStart = (iso) => `${iso.slice(0, 8)}01`;

/** Monday-first weekday index of `iso`: 0 = Monday … 6 = Sunday. */
export const weekdayMon = (iso) => (parseIso(iso).getDay() + 6) % 7;

/**
 * The weeks shown for the month of `iso`: Monday-first rows of 7 ISO dates, starting on the Monday
 * on or before the 1st and padded with the neighbouring months' days. Always 6 rows, so the panel
 * does not change height between months.
 */
export function monthGrid(iso) {
  const first = monthStart(iso);
  let day = addDays(first, -weekdayMon(first));
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Whether `iso` is within [min, max] (either bound may be missing). ISO strings compare by date. */
export const inRange = (iso, min, max) => (!min || iso >= min) && (!max || iso <= max);

/** Nearest date to `iso` within [min, max]. */
export const clampIso = (iso, min, max) => (min && iso < min ? min : max && iso > max ? max : iso);
