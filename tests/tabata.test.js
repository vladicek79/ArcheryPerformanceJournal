import { describe, it, expect } from 'vitest';
import { tabataPlan, tabataAt, tabataStartOf, tabataClock, TABATA_PREPARE, TABATA_SET_REST } from '../public/js/app/tabata.js';

const kinds = (plan) => plan.phases.map((p) => `${p.kind}:${p.sec}`);

describe('interval (Tabata) timer plan', () => {
  it('lays out prepare, then hold and rest per repetition, with no rest after the last hold', () => {
    const plan = tabataPlan({ work: 20, rest: 10, reps: 3, prepare: 5 });
    expect(kinds(plan)).toEqual(['prepare:5', 'work:20', 'rest:10', 'work:20', 'rest:10', 'work:20']);
    expect(plan.totalSec).toBe(85);
    expect(plan.phases.filter((p) => p.kind === 'work').map((p) => p.rep)).toEqual([1, 2, 3]);
  });

  it('puts the longer set rest between sets', () => {
    const plan = tabataPlan({ work: 10, rest: 5, reps: 2, sets: 2, prepare: 0, setRest: 30 });
    expect(kinds(plan)).toEqual(['work:10', 'rest:5', 'work:10', 'setRest:30', 'work:10', 'rest:5', 'work:10']);
    expect(plan.phases.at(-1)).toMatchObject({ rep: 2, set: 2 });
  });

  it('uses the standard prepare and set rest, and survives odd numbers', () => {
    const plan = tabataPlan({ work: 10, rest: 10, reps: 1, sets: 2 });
    expect(kinds(plan)).toEqual([`prepare:${TABATA_PREPARE}`, 'work:10', `setRest:${TABATA_SET_REST}`, 'work:10']);
    // no rest: holds back to back; nothing typed in: one hold of one second
    expect(kinds(tabataPlan({ work: 5, rest: 0, reps: 2, prepare: 0 }))).toEqual(['work:5', 'work:5']);
    expect(kinds(tabataPlan({ work: null, reps: null, sets: null, prepare: 0 }))).toEqual(['work:1']);
  });

  it('tells which phase a moment falls in and how much is left', () => {
    const plan = tabataPlan({ work: 20, rest: 10, reps: 2, prepare: 5 }); // 5 + 20 + 10 + 20 = 55 s
    expect(tabataAt(plan, 0)).toMatchObject({ done: false, index: 0, leftMs: 5000, totalLeftMs: 55000 });
    expect(tabataAt(plan, 5000)).toMatchObject({ index: 1, leftMs: 20000 });
    expect(tabataAt(plan, 5000).phase).toMatchObject({ kind: 'work', rep: 1 });
    expect(tabataAt(plan, 26500)).toMatchObject({ index: 2, leftMs: 8500 });
    expect(tabataAt(plan, 54999).done).toBe(false);
    expect(tabataAt(plan, 55000)).toMatchObject({ done: true, leftMs: 0, totalLeftMs: 0 });
    expect(tabataAt(plan, 99999).phase).toMatchObject({ kind: 'work', rep: 2 });
  });

  it('finds where a phase starts, for skipping', () => {
    const plan = tabataPlan({ work: 20, rest: 10, reps: 2, prepare: 5 });
    expect(tabataStartOf(plan, 0)).toBe(0);
    expect(tabataStartOf(plan, 2)).toBe(25000);
    expect(tabataStartOf(plan, 99)).toBe(55000); // past the last phase: the end
  });

  it('totals the drill for the "Start timer · m:ss" label, prepare and set rests included', () => {
    expect(tabataPlan({ work: 10, rest: 10, reps: 10 }).totalSec).toBe(200); // 3:20
    expect(tabataPlan({ work: 20, rest: 20, reps: 6 }).totalSec).toBe(230); // 3:50
    expect(tabataPlan({ work: 30, rest: 30, reps: 5, sets: 2 }).totalSec).toBe(10 + 2 * (150 + 120) + 60);
    expect(tabataPlan({ work: 5, rest: 5, reps: 2 }).totalSec).toBe(TABATA_PREPARE + 15);
    expect(tabataClock(tabataPlan({ work: 10, rest: 10, reps: 10 }).totalSec * 1000)).toBe('3:20');
  });

  it('shows the time left rounded up', () => {
    expect(tabataClock(20000)).toBe('0:20');
    expect(tabataClock(19001)).toBe('0:20');
    expect(tabataClock(900)).toBe('0:01');
    expect(tabataClock(0)).toBe('0:00');
    expect(tabataClock(125000)).toBe('2:05');
  });
});
