// Ongoing sessions: the Running session (training or competition, scored arrow by arrow) and the
// Open form sessions (blank bale, SPT, gym, mental), the sessions a banner strip stands for.
//
// One lifecycle for both kinds: list what is ongoing (with the page each runs on and the facts its
// banner shows), start, finish and discard. Every outcome says where the app goes next, so a page
// shows its sheet, calls one command and follows `next`. A page that has asked the archer on its own
// sheet passes `confirmed: true` and the question is not put a second time.
//
// The running-session and open-form-session modules are this module's implementation: their
// storage stays as it is (a `sessions` record with status 'active'; timers and drafts in this
// device's settings). Their per-page commands are reached through `running` (the scoring screen)
// and `form` (the form pages).
//
// Outcomes: { status } with status 'started' · 'open' · 'finished' · 'discarded' · 'cancelled' ·
// 'none' · 'failed'; 'finished' carries `session`; 'started', 'open', 'finished' and 'discarded'
// carry `next`, the route to go to.

import { createRunningSession } from './runningSession.js';
import { createOpenFormSessions } from './openFormSession.js';
import { isScored, sessionType, ongoingPage, bannerFacts } from './sessionTypes.js';

const historyOf = (session) => `history/${encodeURIComponent(session.id)}`;

/**
 * @param {object} deps  as createRunningSession and createOpenFormSessions take them: repo, save,
 *   remove, saveSettings, confirm (both modules' questions), requestSync, onChange, now
 */
export function createOngoingSessions({ repo, save, remove, saveSettings, confirm, requestSync, onChange, now }) {
  const running = createRunningSession({ repo, save, remove, saveSettings, confirm, requestSync, onChange, now });
  const forms = createOpenFormSessions({ repo, save, saveSettings, confirm, onChange, now });

  /**
   * Every ongoing session, the running one first: `{ type, timer, page, banner }` each, with the
   * running `session` or the form's kept `draft` (null when nothing was kept).
   */
  function list() {
    const out = [];
    const session = running.get();
    if (session) {
      const type = sessionType(session);
      out.push({ type, timer: session.timer, page: ongoingPage(type), banner: bannerFacts(type, session), session });
    }
    for (const f of forms.list()) {
      out.push({ type: f.type, timer: f.timer, page: ongoingPage(f.type), banner: bannerFacts(f.type, f.draft), draft: f.draft });
    }
    return out;
  }

  /** The ongoing session of `type`, or null. */
  const find = (type) => list().find((e) => e.type === type) || null;

  /**
   * Start a session of `type`. A scored one takes the Shooting page's setup (and asks before
   * replacing the running session); a form one takes what openFormSession.start takes. The last
   * setup is remembered by this module's implementation (runningSession / openFormSession), never
   * by a page.
   */
  async function start(type, opts = {}) {
    if (isScored(type)) {
      const res = await running.start({ ...opts, type });
      return res.status === 'started' ? { ...res, next: ongoingPage(type) } : res;
    }
    const res = forms.start(type, opts);
    return { ...res, next: ongoingPage(type) };
  }

  /**
   * Finish the session of `type`: a scored one is finished (its Session overview opens with the
   * review to write), a form one is saved with `opts` (fields, date, time, past, gear, close) and
   * its History page opens.
   */
  async function finish(type, opts = {}) {
    if (isScored(type)) {
      const res = await running.finish({ confirmed: !!opts.confirmed });
      return res.status === 'finished' ? { ...res, next: `${historyOf(res.session)}/review` } : res;
    }
    const res = await forms.save(type, opts);
    return res.status === 'saved' ? { status: 'finished', session: res.session, next: historyOf(res.session) } : res;
  }

  /** Throw the session of `type` away; the Dashboard opens. */
  async function discard(type, { confirmed = false } = {}) {
    const res = isScored(type) ? await running.discard({ confirmed }) : await forms.discard(type, { confirmed });
    return res.status === 'discarded' ? { ...res, next: 'home' } : res;
  }

  return {
    list,
    find,
    start,
    finish,
    discard,
    // the scoring screen's commands on the running session
    running: { get: running.get, apply: running.apply, scanRoom: running.scanRoom, applyScan: running.applyScan },
    // the form pages' commands on an open form session
    form: { open: forms.open, keepDraft: forms.keepDraft, toggleTimer: forms.toggleTimer },
  };
}
