// In-memory UI state (not persisted) with change notifications.

export function createState(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      for (const fn of listeners) fn(state);
    },
    /** Update without notifying (for values that must not trigger a re-render, e.g. text drafts). */
    quietSet(patch) {
      state = { ...state, ...patch };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
