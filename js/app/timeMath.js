// Time-of-day maths for the time picker (views/pickers.js). Pure: a time is "HH:MM" (24-hour) outside,
// minutes since midnight (0–1439) inside. "Now" is always passed in, so everything here is testable.
import { PAST_START_MS } from './sessionLogic.js';

export const DAY_MINUTES = 24 * 60;

const pad = (n) => String(n).padStart(2, '0');
const wrap = (min) => ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

/** Minutes since midnight of an "HH:MM" time; null when it is not one. */
export function parseTime(t) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "HH:MM" of minutes since midnight (wrapped into one day). */
export function formatTime(min) {
  const w = wrap(min);
  return `${pad(Math.floor(w / 60))}:${pad(w % 60)}`;
}

/** Local "HH:MM" of a Date. */
export const timeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Local YYYY-MM-DD of a Date. */
export const dateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `n` minutes later (earlier when negative): minutes carry into the hour, the day wraps at midnight. */
export const addMinutes = (min, n) => wrap(min + n);

/** `n` hours later (earlier when negative), keeping the minutes; wraps at midnight. */
export const addHours = (min, n) => wrap(min + n * 60);

/** The same hour with the minutes set to `mm`. */
export const withMinute = (min, mm) => Math.floor(wrap(min) / 60) * 60 + mm;

/** The same minutes with the hour set to `hh`. */
export const withHour = (min, hh) => hh * 60 + (wrap(min) % 60);

/**
 * A time typed on the numeric keyboard: "15:45", "1545", "9:05", "905", "9". Null when it is not a
 * real time of day.
 */
export function parseTyped(text) {
  const s = String(text ?? '').trim();
  let hh;
  let mm;
  const colon = /^(\d{1,2})[:.,h ](\d{1,2})$/.exec(s);
  if (colon) [hh, mm] = [Number(colon[1]), Number(colon[2])];
  else if (/^\d{1,2}$/.test(s)) [hh, mm] = [Number(s), 0];
  else if (/^\d{3,4}$/.test(s)) [hh, mm] = [Number(s.slice(0, -2)), Number(s.slice(-2))];
  else return null;
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : null;
}

/**
 * Whole minutes from the local `date` + `time` to `now` (negative when it is later than now). Taken
 * from real instants, so a day with a DST change counts the hour that was skipped or repeated.
 */
export function minutesAgo(date, time, now) {
  const t = new Date(`${date}T${time}`).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 60000);
}

/** The upper bound: `max` when given, else now when `date` is today, else none. */
export function maxTime(date, max, now) {
  if (max) return max;
  return date && date === dateOf(now) ? timeOf(now) : null;
}

/** Whether `time` lies after the upper bound `max` (both "HH:MM"; no bound: never). */
export function isAfterMax(time, max) {
  const t = parseTime(time);
  const m = parseTime(max);
  return t != null && m != null && t > m;
}

/** The quick chips: label and how many minutes before now. */
export const QUICK = [
  { label: 'Now', ago: 0 },
  { label: '−15 min', ago: 15 },
  { label: '−30 min', ago: 30 },
  { label: '−1 h', ago: 60 },
];

/**
 * The quick chips for today at `now`: each one's time, whether it is the time picked, and whether it
 * can be used (one reaching back over midnight would land on yesterday, so it is off).
 */
export function quickTimes(time, now) {
  const nowMin = parseTime(timeOf(now));
  return QUICK.map(({ label, ago }) => {
    const t = formatTime(nowMin - ago);
    return { label, ago, time: t, selected: t === time, disabled: ago > nowMin };
  });
}

/** "45 min", "1 h", "1 h 5 min". */
export function durationText(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ');
}

/** "0:45", "1:05": minutes as the session timer shows them. */
export const clockText = (min) => `${Math.floor(min / 60)}:${pad(min % 60)}`;

/**
 * The line under the picker. Only for today (other dates: ''); a time after `max` gets the warning
 * (`warn: true`). `timer`: the page starts a session timer from this time, so the line says where it
 * starts: from the picked time when that is up to PAST_START_MS ago, otherwise the session is logged
 * afterwards (no running timer; see sessionLogic.timerStartAt and isPastStart).
 */
export function timeHint({ date, time, max = null, now, timer = true }) {
  if (isAfterMax(time, max)) return { text: 'That is later than now — pick a time up to now', warn: true };
  if (!date || date !== dateOf(now) || parseTime(time) == null) return { text: '', warn: false };
  const ago = minutesAgo(date, time, now);
  if (ago == null || ago < 0) return { text: '', warn: false };
  if (!timer) return { text: ago === 0 ? 'Starts now' : `Started ${durationText(ago)} ago`, warn: false };
  if (ago === 0) return { text: 'Starts now — the session timer starts at 0:00', warn: false };
  const past = now.getTime() - new Date(`${date}T${time}`).getTime() > PAST_START_MS;
  return past
    ? { text: `Started ${durationText(ago)} ago — logged afterwards, no running timer`, warn: false }
    : { text: `Started ${durationText(ago)} ago — the timer starts at ${clockText(ago)}`, warn: false };
}
