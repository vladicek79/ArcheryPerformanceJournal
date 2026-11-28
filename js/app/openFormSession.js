// Open form sessions: blank bale / strength / gym / mental sessions that were opened (SPT, mental)
// or started (blank bale from the Shooting page's Start, gym from the Gym setup's) and not yet saved
// or discarded. Each has a session timer and a kept draft, both stored in this device's settings (not
// synced), so they survive leaving the page or the app being closed. A manual session is typed in
// afterwards: it has no timer and no kept draft, it is only saved through here.
//
// This module owns that whole life: opening or starting (the timer starts, a kept draft is taken
// back), keeping the draft, the timer button, saving, discarding and listing what is open. It asks
// the archer through the `confirm` adapter and never touches the DOM, so the same code runs in the
// app and in tests. The page keeps only its own state (the draft being typed) and where to go next.
//
// start / save / discard report what happened as `{ status }`:
//   'started' · 'open' (start: one was open already and goes on as it is)
//   'saved' (with `session`) · 'discarded' · 'cancelled' (the archer said no)
//   'failed' (the save was refused; the guarded save has told the archer)

import { timerElapsed, pauseTimer, resumeTimer, timerStartAt } from './sessionLogic.js';
import { SESSION_TYPES, isTimed } from './sessionTypes.js';
import { rememberSetup, gearChoiceOf } from './lastSetup.js';

/** A form timer left behind (form opened but not saved) is dropped after this long without a touch. */
export const FORM_TIMER_STALE_MS = 6 * 3600 * 1000;

/** Whether a kept form timer still stands for an open session (touched recently enough). */
export function isFormTimerLive(timer, now = new Date()) {
  const touched = Date.parse(timer?.touchedAt || timer?.startedAt || '');
  return !!timer && Number.isFinite(touched) && now.getTime() - touched <= FORM_TIMER_STALE_MS;
}

/**
 * The timer for a blank bale / strength / mental form being opened: the kept one, or a fresh running
 * timer when there is none or it was left untouched (not started, resumed or paused) for too long.
 */
export function openFormTimer(timer, now = new Date()) {
  if (isFormTimerLive(timer, now)) return timer;
  return { running: true, startedAt: now.toISOString(), elapsedMs: 0, touchedAt: now.toISOString() };
}

/**
 * @param {object} deps
 * @param deps.repo          repository: settings are read from it, and the quiet writes (timer
 *                           started, draft kept, form session closed) go straight to it
 * @param deps.save          (collection, record) → saved record, or a falsy value when refused
 * @param deps.saveSettings  (patch) → void: the guarded write used by the timer button (optional)
 * @param deps.confirm       async (question) → boolean. Questions:
 *                             { kind: 'save', type, fields, minutes }  minutes as they will be saved
 *                             { kind: 'discard', type }
 * @param deps.onChange      called when save() paused or resumed the timer around its question (optional)
 * @param deps.now           () → Date (optional)
 */
export function createOpenFormSessions({
  repo,
  save: saveRecord,
  saveSettings = (patch) => repo.saveSettings(patch),
  confirm,
  onChange = () => {},
  now = () => new Date(),
}) {
  const timers = () => repo.getSettings().formTimers || {};
  const drafts = () => repo.getSettings().formDrafts || {};

  /** The open form sessions: `{ type, timer, draft }` each, draft null when nothing was kept. */
  function list() {
    const all = timers();
    const kept = drafts();
    return SESSION_TYPES.filter((t) => isTimed(t) && isFormTimerLive(all[t], now())).map((t) => ({
      type: t,
      timer: all[t],
      draft: kept[t] || null,
    }));
  }

  /**
   * The form of `type` is being shown. `pageDraft` is the draft the page holds already, if any.
   * A timed form gets its timer (started now when there is none or it went stale; written only
   * when it changed) and, when the page has no draft, the kept one — only while its timer is live.
   * Returns `{ timed, timer, draft }`; timer is null for a type that is not timed.
   */
  function open(type, pageDraft = null) {
    if (!isTimed(type)) return { timed: false, timer: null, draft: pageDraft };
    const all = timers();
    const kept = drafts()[type];
    const draft = pageDraft || (kept && isFormTimerLive(all[type], now()) ? kept : null);
    const timer = openFormTimer(all[type], now());
    if (timer !== all[type]) repo.saveSettings({ formTimers: { ...all, [type]: timer } });
    return { timed: true, timer, draft };
  }

  /**
   * Start a blank bale session (the Shooting page's Start): its timer starts now, or at the start
   * time picked in `when` ({ date, time }) when that was a few minutes ago (sessionLogic.timerStartAt),
   * and its draft holds
   * the arrow goal and, in `meta` (not saved with the session), when it started and the equipment
   * choice. Remembered as the last blank bale setup. A blank bale already open is not started again:
   * it goes on as it is (`status: 'open'`).
   *
   * A gym session (the Gym setup page's Start) passes its first `fields` (focus, exercises, note) and
   * `when` ({ date, time, past }), kept in the draft's meta; nothing is remembered as a last setup.
   * Logged afterwards (`when.past`) its timer stays paused at 0: the duration is typed in later.
   * An SPT session (the SPT page's Start) starts the same way, with its drills as `fields`.
   */
  function start(type, { goal = null, gear = null, fields = null, when = null } = {}) {
    const all = timers();
    if (isFormTimerLive(all[type], now())) return { status: 'open', timer: all[type], draft: drafts()[type] || null };
    const at = now().toISOString();
    // the timer starts from the picked start time when that was a few minutes ago (timerStartAt)
    const from = when?.date && when?.time ? timerStartAt(when.date, when.time, now()).toISOString() : at;
    if (type === 'gym' || type === 'strength') {
      const past = !!when?.past;
      const timer = past
        ? { running: false, startedAt: null, elapsedMs: 0, touchedAt: at }
        : { running: true, startedAt: from, elapsedMs: 0, touchedAt: at };
      const draft = { ...fields, meta: { startedAt: from, date: when?.date, time: when?.time, ...(past ? { past: true } : {}) } };
      repo.saveSettings({ formTimers: { ...all, [type]: timer }, formDrafts: { ...drafts(), [type]: draft } });
      return { status: 'started', timer, draft };
    }
    const timer = { running: true, startedAt: from, elapsedMs: 0, touchedAt: at };
    const draft = { arrows: null, note: '', ...(goal ? { goal } : {}), meta: { startedAt: from, gear } };
    repo.saveSettings({
      formTimers: { ...all, [type]: timer },
      formDrafts: { ...drafts(), [type]: draft },
      ...rememberSetup(repo.getSettings(), type, { goal: goal || null, gear }),
    });
    return { status: 'started', timer, draft };
  }

  /** Keep the draft of a timed form on the device (a manual session's draft lives on the page only). */
  function keepDraft(type, draft) {
    if (isTimed(type)) repo.saveSettings({ formDrafts: { ...drafts(), [type]: draft } });
  }

  /** The timer button: pause a running timer, resume a paused one. Either way it counts as a touch. */
  function toggleTimer(type) {
    const all = timers();
    const cur = { timer: all[type] };
    const next = cur.timer?.running ? pauseTimer(cur, now()) : resumeTimer(cur, now());
    saveSettings({ formTimers: { ...all, [type]: { ...next.timer, touchedAt: now().toISOString() } } });
  }

  /** The form session is over (saved or discarded): its timer and kept draft go. */
  function close(type) {
    repo.saveSettings({ formTimers: { ...timers(), [type]: null }, formDrafts: { ...drafts(), [type]: null } });
  }

  /**
   * Save the form as a finished session after a yes. `past` marks a session logged afterwards.
   * The timer is paused while the question is open and runs on when the answer is no. Minutes typed
   * by hand win over the timer; the timer gives none for a session logged afterwards or a manual one.
   * Nothing is closed when the save is refused. `close: false` leaves an open session of the type
   * alone (a blank bale logged afterwards while another one runs). The draft's `meta` is not saved.
   */
  async function save(type, { fields: draft, date, time, past = false, gear = {}, close: closeOpen = true, confirmed = false }) {
    const { meta: _meta, ...fields } = draft;
    const timed = isTimed(type);
    const live = timed && !past;
    const running = () => !!timers()[type]?.running;
    const minutes = () => {
      const timer = timers()[type];
      return fields.minutes ?? (live && timer ? Math.round(timerElapsed(timer, now()) / 60000) : null);
    };

    const wasRunning = !confirmed && live && running();
    if (wasRunning) {
      toggleTimer(type);
      onChange();
    }
    const ok = confirmed || (await confirm({ kind: 'save', type, fields, minutes: minutes() }));
    if (!ok) {
      if (wasRunning && !running()) {
        toggleTimer(type);
        onChange();
      }
      return { status: 'cancelled' };
    }
    const session = saveRecord('sessions', { type, status: 'finished', ...fields, date, time, minutes: minutes(), ...gear });
    if (!session) {
      // the save was refused: the session runs on as it was
      if (wasRunning && !running()) {
        toggleTimer(type);
        onChange();
      }
      return { status: 'failed' };
    }
    if (timed && closeOpen) close(type);
    // a blank bale logged afterwards is remembered as the last blank bale setup, as a started one is
    if (type === 'blank' && past) {
      saveSettings(rememberSetup(repo.getSettings(), 'blank', { goal: fields.goal ?? null, gear: gearChoiceOf(gear) }));
    }
    return { status: 'saved', session };
  }

  /** Drop the open form session without saving it, after a yes (`confirmed`: the page asked already). */
  async function discard(type, { confirmed = false } = {}) {
    if (!confirmed && !(await confirm({ kind: 'discard', type }))) return { status: 'cancelled' };
    close(type);
    return { status: 'discarded' };
  }

  return { list, open, start, keepDraft, toggleTimer, save, discard };
}
