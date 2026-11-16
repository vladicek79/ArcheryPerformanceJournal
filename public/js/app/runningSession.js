// The running session: the one scored session (training or competition) in progress.
//
// This module owns everything that happens *around* the pure transitions of sessionLogic.js:
// finding the running session, starting one (only one runs at a time), applying a transition and
// saving it, finishing, discarding and taking over scanned arrows. It asks the archer through the
// `confirm` adapter and never touches the DOM, so the same code runs in the app and in tests.
//
// Every command reports what happened as `{ status }`:
//   'started' | 'finished' (with `session`) · 'discarded' · 'cancelled' (the archer said no)
//   'none' (nothing to do) · 'failed' (the save was refused; the guarded save has told the archer)

import * as L from './sessionLogic.js';

/** The running session in the repository, or null. */
export function findRunning(repo) {
  return repo.list('sessions', { filter: (x) => x.status === 'active' })[0] || null;
}

/**
 * @param {object} deps
 * @param deps.repo          repository (read access)
 * @param deps.save          (collection, record) → saved record, or a falsy value when refused
 * @param deps.remove        (collection, id) → truthy when removed
 * @param deps.saveSettings  (patch) → void
 * @param deps.confirm       async (question) → boolean. Questions:
 *                             { kind: 'replace', willFinish }   starting while a session runs
 *                             { kind: 'finish', session, ends } finishing (ends = ends that are kept)
 *                             { kind: 'discard', session }
 * @param deps.requestSync   called after a session was finished (optional)
 * @param deps.onChange      called when a command changed the session while it is still asking (optional)
 * @param deps.now           () → Date (optional)
 */
export function createRunningSession({
  repo,
  save,
  remove,
  saveSettings = () => {},
  confirm,
  requestSync = () => {},
  onChange = () => {},
  now = () => new Date(),
}) {
  const get = () => findRunning(repo);

  /** Apply a transition to the running session and save it. True when something was saved. */
  function apply(fn) {
    const cur = get();
    if (!cur) return false;
    const next = fn(cur);
    if (next === cur) return false;
    return !!save('sessions', next);
  }

  /** Save the session as finished and ask for a sync. Returns the finished session, or null. */
  function saveFinished(session) {
    const done = L.finishSession(session, now());
    if (!save('sessions', done)) return null;
    requestSync();
    return done;
  }

  /**
   * Start a new running session from the setup. Only one session runs at a time: after a yes, the
   * one in progress is finished (its ends with arrows are kept) or, when it has none, discarded.
   */
  async function start(setup) {
    if (get()) {
      const ok = await confirm({ kind: 'replace', willFinish: L.canFinish(get()) });
      if (!ok) return { status: 'cancelled' };
      const running = get(); // read again: the dialog was open for a while
      if (running) {
        if (L.canFinish(running)) {
          if (!saveFinished(running)) return { status: 'failed' };
        } else if (!remove('sessions', running.id)) return { status: 'failed' };
      }
    }
    const { distance, face, arrowsPerEnd } = setup;
    saveSettings({ lastSetup: { distance, face, arrowsPerEnd } });
    const session = save('sessions', L.createSession({ ...setup, now: now() }));
    return session ? { status: 'started', session } : { status: 'failed' };
  }

  /**
   * Finish the running session after a yes. The timer is paused while the question is open and
   * runs on when the answer is no.
   */
  async function finish() {
    const before = get();
    if (!before || !L.canFinish(before)) return { status: 'none' };
    const wasRunning = !!before.timer?.running;
    if (wasRunning && apply((c) => L.pauseTimer(c, now()))) onChange();
    // the end being shot is kept too when it has arrows
    const ends = before.ends.length + (L.hasUnsavedArrows(before) ? 1 : 0);
    const ok = await confirm({ kind: 'finish', session: before, ends });
    const cur = get();
    if (!ok) {
      if (wasRunning && cur && !cur.timer?.running && apply((c) => L.resumeTimer(c, now()))) onChange();
      return { status: 'cancelled' };
    }
    if (!cur || !L.canFinish(cur)) return { status: 'none' };
    const done = saveFinished(cur);
    return done ? { status: 'finished', session: done } : { status: 'failed' };
  }

  /** Throw the running session away after a yes. */
  async function discard() {
    const before = get();
    if (!before) return { status: 'none' };
    if (!(await confirm({ kind: 'discard', session: before }))) return { status: 'cancelled' };
    const cur = get();
    if (!cur) return { status: 'none' };
    return remove('sessions', cur.id) ? { status: 'discarded' } : { status: 'failed' };
  }

  /**
   * What a scan of the target fills in the shown end. A scan always reads the whole end anew, so
   * every slot counts as free, whatever is in the end already (it is replaced when the scan is
   * used, see applyScan): the face, the number of slots and, for a close-up of one spot of a
   * multi-spot sheet, the spot its arrow goes on (the first). Null when no session runs.
   */
  function scanRoom() {
    const session = get();
    if (!session) return null;
    return { face: session.face, empty: L.shownEnd(session).arrows.length, spotHint: 0 };
  }

  /**
   * Scanned arrows ({ v, x, y, spot }) replace the shown end's arrows: the end is emptied first
   * (what was entered before, by hand or by an earlier scan, goes), then they fill it in order.
   */
  function applyScan(arrows) {
    return apply((cur) => arrows.reduce((s, a) => L.enterScore(s, a.v, a.x, a.y, a.spot), L.clearEndArrows(cur)));
  }

  return { get, apply, start, finish, discard, scanRoom, applyScan };
}
