import { describe, it, expect } from 'vitest';
import * as L from '../public/js/app/sessionLogic.js';

const start = (n = 3) => L.createSession({ date: '2026-11-09', distance: 18, face: '40s', arrowsPerEnd: n });

describe('arrow-by-arrow grading flow', () => {
  it('logs one arrow in 3 steps: score, M, S, then moves to the next slot', () => {
    let s = start();
    s = L.enterScore(s, 10);
    expect(s.asking).toBe(true);
    expect(s.step).toBe('m');
    s = L.gradeArrow(s, 'm', 2);
    expect(s.step).toBe('s');
    s = L.gradeArrow(s, 's', 1);
    expect(s.asking).toBe(false);
    expect(s.cursor).toBe(1);
    expect(s.current.arrows[0]).toMatchObject({ v: 10, m: 2, s: 1 });
  });

  it('skip closes the sheet without grades', () => {
    let s = L.skipGrade(L.enterScore(start(), 9));
    expect(s.current.arrows[0]).toMatchObject({ v: 9, m: null, s: null });
    expect(s.cursor).toBe(1);
  });

  it('does not ask when askGrades is off', () => {
    const s = L.enterScore(start(), 'X', null, null, { askGrades: false });
    expect(s.asking).toBe(false);
    expect(s.cursor).toBe(1);
  });

  it('change score pins the slot so the next input overwrites it and keeps grades', () => {
    let s = L.gradeArrow(L.gradeArrow(L.enterScore(start(), 8), 'm', 3), 's', 2);
    s = L.pickSlot(s, 0);
    expect(s.asking).toBe(true);
    s = L.changeScore(s);
    s = L.enterScore(s, 9, null, null, { askGrades: false });
    expect(s.current.arrows[0]).toMatchObject({ v: 9, m: 3, s: 2 });
  });

  it('tapping an empty slot selects it', () => {
    const s = L.pickSlot(start(), 2);
    expect(s.cursor).toBe(2);
    expect(s.asking).toBe(false);
    expect(L.enterScore(s, 7, null, null, { askGrades: false }).current.arrows[2].v).toBe(7);
  });

  it('ignores scores when the end is full', () => {
    let s = start(3);
    for (const v of [10, 9, 8]) s = L.enterScore(s, v, null, null, { askGrades: false });
    expect(L.enterScore(s, 7)).toBe(s);
    expect(L.canSaveEnd(s)).toBe(true);
  });

  it('undo clears the last scored arrow', () => {
    let s = start();
    s = L.enterScore(s, 10, null, null, { askGrades: false });
    s = L.enterScore(s, 9, null, null, { askGrades: false });
    s = L.undo(s);
    expect(s.current.arrows.map((a) => a.v)).toEqual([10, null, null]);
    expect(s.cursor).toBe(1);
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
    for (const v of [10, 9, 8]) s = L.enterScore(s, v, null, null, { askGrades: false });
    s = L.setNote(L.bump(s, 'ld', 1), 'windy');
    s = L.saveEnd(s);
    expect(s.ends).toHaveLength(1);
    expect(s.ends[0]).toMatchObject({ ld: 1, cld: 0, note: 'windy' });
    expect(s.current.arrows.every((a) => a.v == null)).toBe(true);
    const done = L.finishSession(s);
    expect(done.status).toBe('finished');
    expect(done.current).toBeUndefined();
    expect(done.cursor).toBeUndefined();
  });
});

describe('moving an arrow', () => {
  const graded = () => {
    let s = start();
    s = L.gradeArrow(L.gradeArrow(L.enterScore(s, 7, 0.4, 0.1), 'm', 2), 's', 1);
    return s;
  };

  it('Move arrow from the sheet enters move mode for that arrow', () => {
    let s = L.pickSlot(graded(), 0);
    s = L.changeScore(s);
    expect(L.isMoving(s)).toBe(true);
    expect(s.asking).toBe(false);
  });

  it('re-placing a fully graded arrow keeps grades and does not ask again', () => {
    let s = L.startMove(graded(), 0);
    s = L.enterScore(s, 9, 0.15, 0.02);
    expect(s.current.arrows[0]).toMatchObject({ v: 9, x: 0.15, y: 0.02, m: 2, s: 1 });
    expect(s.asking).toBe(false);
    expect(L.isMoving(s)).toBe(false);
    expect(s.cursor).toBe(1);
  });

  it('re-placing an ungraded arrow asks for grades', () => {
    let s = L.skipGrade(L.enterScore(start(), 6));
    s = L.enterScore(L.startMove(s, 0), 8);
    expect(s.asking).toBe(true);
    expect(s.cursor).toBe(0);
  });

  it('cancel leaves the arrow unchanged', () => {
    const before = graded();
    const s = L.cancelMove(L.startMove(before, 0));
    expect(L.isMoving(s)).toBe(false);
    expect(s.current.arrows[0]).toEqual(before.current.arrows[0]);
    expect(s.cursor).toBe(1);
  });
});
