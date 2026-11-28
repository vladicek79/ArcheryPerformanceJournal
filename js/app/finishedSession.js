// Finished sessions: the sessions that are complete and appear in History.
//
// This module owns what can still happen to a finished session: changing its review, competition
// details, when it took place (date, start time), duration, equipment, form fields and ends (an end
// changed or deleted: totals and statistics follow, as they are worked out from the ends); moving it to
// Recently deleted, restoring it and deleting it for good; and the lists of finished and deleted
// sessions. Every change reads the stored session again (a page may have been open for a while, or
// the session changed on another device), merges the change and saves it through the guarded save.
// It asks the archer through the `confirm` adapter and never touches the DOM, so the same code runs
// in the app and in tests.
//
// Every command reports what happened as `{ status }`:
//   'saved' · 'deleted' (moved to Recently deleted, or an end deleted) · 'restored' · 'purged' (deleted for good)
//   'cancelled' (the archer said no) · 'none' (no such session, e.g. deleted on another device,
//   or nothing to change) · 'failed' (refused; the guarded write has told the archer)

import { TRASH_DAYS } from '../config.js';
import { newestFirst, emptyReview, emptyCompetition } from './sessionTypes.js';
import { gearForChoice } from './gearFields.js';

const DAY = 24 * 3600 * 1000;

/** Minutes typed in: a non-negative whole number, or null (blank, negative, not a number). */
export function parseMinutes(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Whole days (rounded up, never below 0) until a session deleted at `trashedAt` is removed for good. */
export function daysLeft(trashedAt, now = new Date(), trashDays = TRASH_DAYS) {
  return Math.max(0, Math.ceil((Date.parse(trashedAt) + trashDays * DAY - now.getTime()) / DAY));
}

/** The finished sessions in the repository, newest first (by date and start time). */
export function listFinished(repo) {
  return repo.list('sessions', { filter: (x) => x.status === 'finished', sort: newestFirst });
}

/**
 * @param {object} deps
 * @param deps.repo     repository (read access)
 * @param deps.save     (collection, record) → saved record, or a falsy value when refused
 * @param deps.trash    (collection, id) → truthy when moved to Recently deleted
 * @param deps.restore  (collection, id) → truthy when restored
 * @param deps.remove   (collection, id) → truthy when removed for good
 * @param deps.confirm  async (question) → boolean. Questions:
 *                        { kind: 'delete', session }  move to Recently deleted
 *                        { kind: 'purge', session }   delete for good
 *                        { kind: 'delete-end', session, index }  delete one end
 * @param deps.now      () → Date (optional)
 */
export function createFinishedSessions({ repo, save, trash, restore: restoreRecord, remove, confirm, now = () => new Date() }) {
  /** The finished session with this id, or null (unknown, running or in Recently deleted). */
  function get(id) {
    const s = repo.get('sessions', id);
    return s && s.status === 'finished' ? s : null;
  }

  const list = () => listFinished(repo);

  /** Recently deleted: `{ session, daysLeft }` each, most recently deleted first. */
  const deleted = () => repo.listTrash('sessions').map((session) => ({ session, daysLeft: daysLeft(session.trashedAt, now()) }));

  const findDeleted = (id) => repo.listTrash('sessions').find((s) => s.id === id) || null;

  /**
   * Store a change: `update(current) → patch` runs on the stored session, not the one on screen,
   * so an earlier change that was stored without re-rendering is never overwritten. A null patch
   * changes nothing.
   */
  function change(id, update) {
    const cur = get(id);
    if (!cur) return { status: 'none' };
    const patch = update(cur);
    if (!patch) return { status: 'none' };
    return save('sessions', { ...cur, ...patch }) ? { status: 'saved' } : { status: 'failed' };
  }

  /** One part of the review (good, workOn, how); a session without a review gets the whole shape. */
  const setReview = (id, key, text) => change(id, (cur) => ({ review: { ...emptyReview(), ...cur.review, [key]: text } }));

  /** One competition detail (event, round, conditions, placement); the others are kept. */
  const setCompetition = (id, key, text) =>
    change(id, (cur) => ({ competition: { ...emptyCompetition(), ...cur.competition, [key]: text } }));

  /** Date and / or start time (`{ date }`, `{ time }`); a cleared time is stored as null. */
  const setWhen = (id, when) => change(id, () => when);

  /** The duration as typed in (see parseMinutes); a blank field clears it. */
  const setMinutes = (id, typed) => change(id, () => ({ minutes: parseMinutes(typed) }));

  /**
   * The equipment, by a choice of the gear picker: a setup's id (its fields are copied into the
   * session), 'none', or 'recorded' (keep what the session has: nothing changes).
   */
  const setGear = (id, choice) => change(id, () => gearForChoice(choice, { setups: repo.list('setups') }));

  /** One end replaced by `end` (Edit end); the others are kept. 'none' for an end that is not there. */
  const setEnd = (id, index, end) =>
    change(id, (cur) => (cur.ends?.[index] ? { ends: cur.ends.map((e, i) => (i === index ? end : e)) } : null));

  /** Delete one end after a yes. The only end is never deleted: the session would have none. */
  async function deleteEnd(id, index) {
    const before = get(id);
    if (!before?.ends?.[index] || before.ends.length < 2) return { status: 'none' };
    if (!(await confirm({ kind: 'delete-end', session: before, index }))) return { status: 'cancelled' };
    const res = change(id, (cur) => (cur.ends?.[index] && cur.ends.length > 1 ? { ends: cur.ends.filter((_, i) => i !== index) } : null));
    return res.status === 'saved' ? { status: 'deleted' } : res;
  }

  /** Move the session to Recently deleted after a yes. */
  async function moveToDeleted(id) {
    const before = get(id);
    if (!before) return { status: 'none' };
    if (!(await confirm({ kind: 'delete', session: before }))) return { status: 'cancelled' };
    if (!get(id)) return { status: 'none' }; // read again: the dialog was open for a while
    return trash('sessions', id) ? { status: 'deleted' } : { status: 'failed' };
  }

  /** Bring a session back from Recently deleted. */
  function restore(id) {
    if (!findDeleted(id)) return { status: 'none' };
    return restoreRecord('sessions', id) ? { status: 'restored' } : { status: 'failed' };
  }

  /** Delete a session in Recently deleted for good, after a yes. */
  async function purge(id) {
    const before = findDeleted(id);
    if (!before) return { status: 'none' };
    if (!(await confirm({ kind: 'purge', session: before }))) return { status: 'cancelled' };
    if (!findDeleted(id)) return { status: 'none' };
    return remove('sessions', id) ? { status: 'purged' } : { status: 'failed' };
  }

  return { get, list, deleted, change, setReview, setCompetition, setWhen, setMinutes, setGear, setEnd, deleteEnd, moveToDeleted, restore, purge };
}
