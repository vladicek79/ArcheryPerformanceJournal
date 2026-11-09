import { describe, it, expect } from 'vitest';
import * as L from '../public/js/app/sessionLogic.js';
import { collections } from '../public/js/app/collections.js';

const start = (n = 3) => L.createSession({ date: '2026-11-09', distance: 18, face: '40s', arrowsPerEnd: n });

describe('scoring and inline grading', () => {
  it('logs one arrow in 3 taps: score, M, S — the scored arrow stays selected for grading', () => {
    let s = L.enterScore(start(), 10, 0.05, 0.02);
    expect(s.cursor).toBe(0);
    s = L.gradeArrow(s, 'm', 2);
    s = L.gradeArrow(s, 's', 1);
    expect(s.current.arrows[0]).toEqual({ v: 10, m: 2, s: 1, x: 0.05, y: 0.02 });
  });

  it('the next score goes to the next empty slot', () => {
    let s = L.enterScore(start(), 10);
    s = L.enterScore(s, 9);
    expect(s.current.arrows.map((a) => a.v)).toEqual([10, 9, null]);
    expect(s.cursor).toBe(1);
  });

  it('grading is optional and can be done later', () => {
    let s = L.enterScore(L.enterScore(start(), 8), 7);
    s = L.selectArrow(s, 0);
    s = L.gradeArrow(s, 'm', 3);
    expect(s.current.arrows[0].m).toBe(3);
  });

  it('tapping the chosen grade again clears it', () => {
    let s = L.gradeArrow(L.enterScore(start(), 9), 'm', 4);
    s = L.gradeArrow(s, 'm', 4);
    expect(s.current.arrows[0].m).toBeNull();
  });

  it('an arrow can be graded before it is scored; the score keeps the grades', () => {
    let s = L.selectArrow(L.enterScore(start(), 10), 2);
    s = L.gradeArrow(L.gradeArrow(s, 'm', 1), 's', 2);
    expect(s.current.arrows[2]).toMatchObject({ v: null, m: 1, s: 2 });
    s = L.enterScore(s, 9);
    expect(s.current.arrows[2]).toMatchObject({ v: 9, m: 1, s: 2 });
    s = L.enterScore(s, 8);
    expect(s.current.arrows.map((a) => a.v)).toEqual([10, 8, 9]);
  });

  it('ignores scores when the end is full', () => {
    let s = start(3);
    for (const v of [10, 9, 8]) s = L.enterScore(s, v);
    expect(L.enterScore(s, 7)).toBe(s);
    expect(L.canSaveEnd(s)).toBe(true);
  });

  it('tapping an empty slot makes it the next to fill', () => {
    const s = L.selectArrow(start(), 2);
    expect(L.isEditing(s)).toBe(false);
    expect(L.enterScore(s, 7).current.arrows[2].v).toBe(7);
  });

  it('undo clears the last scored arrow', () => {
    let s = L.enterScore(L.enterScore(start(), 10), 9);
    s = L.undo(s);
    expect(s.current.arrows.map((a) => a.v)).toEqual([10, null, null]);
    expect(s.cursor).toBe(1);
  });
});

describe('editing an existing arrow', () => {
  const graded = () => L.gradeArrow(L.gradeArrow(L.enterScore(start(), 4, 0.62, 0.1), 'm', 2), 's', 1);

  it('tapping a scored arrow enters edit mode; the next score replaces it and keeps grades', () => {
    let s = L.enterScore(graded(), 9);
    s = L.selectArrow(s, 0);
    expect(L.isEditing(s)).toBe(true);
    s = L.enterScore(s, 10, 0.08, 0.05);
    expect(s.current.arrows[0]).toEqual({ v: 10, m: 2, s: 1, x: 0.08, y: 0.05 });
    expect(L.isEditing(s)).toBe(false);
    expect(s.current.arrows[1].v).toBe(9);
  });

  it('grades can be changed while editing', () => {
    let s = L.selectArrow(graded(), 0);
    s = L.gradeArrow(s, 's', 5);
    expect(s.current.arrows[0]).toMatchObject({ v: 4, m: 2, s: 5 });
    expect(L.isEditing(s)).toBe(true);
  });

  it('tapping the edited arrow again, or Done, finishes editing without changes', () => {
    const base = L.selectArrow(graded(), 0);
    for (const s of [L.selectArrow(base, 0), L.doneEditing(base)]) {
      expect(L.isEditing(s)).toBe(false);
      expect(s.current.arrows[0]).toEqual(graded().current.arrows[0]);
    }
  });

  it('delete clears the arrow and its slot is filled next', () => {
    let s = L.enterScore(graded(), 9);
    s = L.clearArrow(L.selectArrow(s, 0));
    expect(s.current.arrows[0]).toEqual(L.emptyArrow());
    s = L.enterScore(s, 8);
    expect(s.current.arrows.map((a) => a.v)).toEqual([8, 9, null]);
  });
});

describe('let-down steppers', () => {
  it('correct let-downs never exceed let-downs', () => {
    let s = L.bump(start(), 'cld', 1);
    expect(s.current).toMatchObject({ ld: 1, cld: 1 });
    s = L.bump(L.bump(s, 'ld', 1), 'cld', 1);
    expect(s.current).toMatchObject({ ld: 2, cld: 2 });
    s = L.bump(s, 'ld', -1);
    expect(s.current).toMatchObject({ ld: 1, cld: 1 });
    s = L.bump(L.bump(s, 'ld', -5), 'cld', -1);
    expect(s.current).toMatchObject({ ld: 0, cld: 0 });
  });
});

describe('ends and finishing', () => {
  it('saves full ends and finishes', () => {
    let s = start(3);
    expect(L.canFinish(s)).toBe(false);
    for (const v of [10, 9, 8]) s = L.enterScore(s, v);
    s = L.setNote(L.bump(s, 'ld', 1), 'windy');
    s = L.saveEnd(s);
    expect(s.ends).toHaveLength(1);
    expect(s.ends[0]).toMatchObject({ ld: 1, cld: 0, note: 'windy' });
    expect(s.current.arrows.every((a) => a.v == null)).toBe(true);
    const done = L.finishSession({ ...s, asking: true, step: 's', inputMode: 'keypad' });
    expect(done.status).toBe('finished');
    for (const k of ['current', 'cursor', 'pinned', 'asking', 'step', 'inputMode']) expect(done[k]).toBeUndefined();
  });
});

describe('navigating between ends', () => {
  const twoEnds = () => {
    let s = start(3);
    for (const v of [10, 9, 8]) s = L.enterScore(s, v);
    s = L.nextEnd(s); // auto-saves end 1
    s = L.enterScore(s, 7);
    return s;
  };

  it('next on the current end saves it and starts a new end; needs at least one arrow', () => {
    const s0 = start(3);
    expect(L.canNextEnd(s0)).toBe(false);
    const s = twoEnds();
    expect(s.ends).toHaveLength(1);
    expect(s.current.arrows.map((a) => a.v)).toEqual([7, null, null]);
    expect(L.viewIndex(s)).toBe(1);
  });

  it('an unfinished end is saved as it is', () => {
    const s = L.nextEnd(twoEnds());
    expect(s.ends[1].arrows.map((a) => a.v)).toEqual([7, null, null]);
  });

  it('previous shows a saved end; edits apply to it; next returns to the current end untouched', () => {
    let s = L.prevEnd(twoEnds());
    expect(s.view).toBe(0);
    expect(L.shownEnd(s).arrows.map((a) => a.v)).toEqual([10, 9, 8]);
    s = L.enterScore(L.selectArrow(s, 1), 'X');
    s = L.gradeArrow(s, 'm', 1);
    s = L.bump(s, 'ld', 1);
    expect(s.ends[0].arrows[1]).toMatchObject({ v: 'X', m: 1 });
    expect(s.ends[0].ld).toBe(1);
    expect(s.current.arrows[0].v).toBe(7);
    s = L.nextEnd(s);
    expect(s.view).toBeNull();
    expect(s.ends).toHaveLength(1);
    expect(L.otherEnds(s)).toHaveLength(1);
  });

  it('previous is disabled on the first end; goToEnd jumps', () => {
    expect(L.canPrevEnd(start())).toBe(false);
    const s = L.goToEnd(twoEnds(), 0);
    expect(s.view).toBe(0);
    expect(L.goToEnd(s, null).view).toBeNull();
  });

  it('finishing keeps the current end when it has arrows and drops empty ends', () => {
    const done = L.finishSession(twoEnds());
    expect(done.ends).toHaveLength(2);
    expect(done.view).toBeUndefined();
    const done2 = L.finishSession(L.nextEnd(L.nextEnd(twoEnds()) ?? twoEnds()));
    expect(done2.ends.every((e) => e.arrows.some((a) => a.v != null))).toBe(true);
  });
});

describe('grading moves to the next arrow', () => {
  it('completing M and S selects the next arrow; grading-only works without scores', () => {
    let s = start(3);
    s = L.gradeArrow(L.gradeArrow(s, 'm', 1), 's', 2);
    expect(s.cursor).toBe(1);
    s = L.gradeArrow(L.gradeArrow(s, 's', 3), 'm', 2);
    expect(s.cursor).toBe(2);
    expect(s.current.arrows.map((a) => [a.m, a.s])).toEqual([[1, 2], [2, 3], [null, null]]);
  });

  it('after score + M + S the next score goes to the next arrow', () => {
    let s = L.gradeArrow(L.gradeArrow(L.enterScore(start(3), 10), 'm', 1), 's', 1);
    expect(s.cursor).toBe(1);
    s = L.enterScore(s, 9);
    expect(s.current.arrows.map((a) => a.v)).toEqual([10, 9, null]);
  });

  it('moving onto an already scored arrow selects it for grading but the next score fills an empty slot', () => {
    let s = L.enterScore(L.enterScore(start(3), 10), 9);
    s = L.gradeArrow(L.gradeArrow(L.selectArrow(s, 0), 'm', 2), 's', 2);
    expect(s.cursor).toBe(1);
    expect(L.isEditing(s)).toBe(false);
    s = L.enterScore(s, 8);
    expect(s.current.arrows.map((a) => a.v)).toEqual([10, 9, 8]);
  });

  it('re-grading a complete arrow and the last arrow do not move', () => {
    let s = L.gradeArrow(L.gradeArrow(start(3), 'm', 1), 's', 1);
    s = L.selectArrow(s, 0);
    s = L.gradeArrow(s, 's', 4);
    expect(s.cursor).toBe(0);
    s = L.selectArrow(L.selectArrow(s, 0), 2);
    s = L.gradeArrow(L.gradeArrow(s, 'm', 3), 's', 3);
    expect(s.cursor).toBe(2);
  });
});

describe('performance review', () => {
  const finished = () => ({ ...L.finishSession({ ...L.createSession({ date: '2026-11-09', distance: 18, face: '40s', arrowsPerEnd: 3 }) }), status: 'finished' });

  it('accepts a session with or without a review', () => {
    expect(collections.sessions.validate(finished())).toEqual([]);
    expect(collections.sessions.validate({ ...finished(), review: { good: 'Calm release', workOn: 'Follow-through' } })).toEqual([]);
  });

  it('rejects a review that is not text', () => {
    expect(collections.sessions.validate({ ...finished(), review: { good: 5 } })).toContain('invalid review');
    expect(collections.sessions.validate({ ...finished(), review: 'x' })).toContain('invalid review');
  });
});

describe('arrows per end', () => {
  const s = (n) => ({ ...L.createSession({ date: '2026-11-09', distance: 18, face: '40s', arrowsPerEnd: n }), id: 'a' });
  it('accepts 1 to 12 arrows per end', () => {
    for (const n of [1, 3, 7, 12]) expect(collections.sessions.validate(s(n))).toEqual([]);
  });
  it('rejects 0 and more than 12', () => {
    for (const n of [0, 13, 2.5]) expect(collections.sessions.validate(s(n)).join()).toMatch(/arrows per end/);
  });
});

describe('three-spot sheets', () => {
  const s = () => L.createSession({ date: '2026-11-09', distance: 18, face: '40t', arrowsPerEnd: 3 });
  it('stores the spot with the arrow and validates it', () => {
    const t = L.enterScore(s(), 10, 0.1, 0.2, 2);
    expect(t.current.arrows[0]).toMatchObject({ v: 10, x: 0.1, y: 0.2, spot: 2 });
    expect(collections.sessions.validate({ ...t, id: 'a' })).toEqual([]);
  });
  it('drops the spot when the score has no position', () => {
    const t = L.enterScore(L.enterScore(s(), 10, 0.1, 0.2, 2), 'M');
    expect(t.current.arrows[1].spot).toBeUndefined();
  });
  it('rejects an unknown spot', () => {
    const t = L.enterScore(s(), 10, 0.1, 0.2, 5);
    expect(collections.sessions.validate({ ...t, id: 'a' }).join()).toMatch(/invalid spot/);
  });
});
