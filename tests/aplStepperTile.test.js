// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stepperTile } from '../public/js/app/views/common.js';

const parts = (tile) => {
  const [down, , up] = tile.querySelector('.stepper-row').children;
  return { down, up, out: tile.querySelector('output'), value: tile.querySelector('.stepper-value') };
};
const pointer = (el, type) => el.dispatchEvent(new PointerEvent(type, { button: 0, bubbles: true }));

afterEach(() => vi.useRealTimers());

describe('stepperTile', () => {
  it('shows the value in a live output with named −/+ buttons', () => {
    const tile = stepperTile({ label: 'Hold', value: 10, unit: 's', min: 5, max: 120, by: 5 });
    const { down, up, out } = parts(tile);
    expect(out.getAttribute('aria-live')).toBe('polite');
    expect(out.textContent).toBe('10 s');
    expect(down.getAttribute('aria-label')).toBe('Decrease hold');
    expect(up.getAttribute('aria-label')).toBe('Increase hold');
    expect(tile.querySelector('input')).toBeNull(); // no visible text box
  });

  it('steps on click (keyboard) and reports, stopping at the limits', () => {
    const onChange = vi.fn();
    const tile = stepperTile({ label: 'Sets', value: 9, min: 1, max: 10, onChange });
    const { up, out } = parts(tile);
    up.click();
    expect(out.textContent).toBe('10');
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(up.getAttribute('aria-disabled')).toBe('true');
    up.click();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('repeats while held: after 400 ms, then every 100 ms', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const tile = stepperTile({ label: 'Reps', value: 10, min: 1, max: 30, onChange });
    const { up, out } = parts(tile);
    pointer(up, 'pointerdown');
    expect(out.textContent).toBe('11');
    vi.advanceTimersByTime(399);
    expect(out.textContent).toBe('11');
    vi.advanceTimersByTime(1);
    expect(out.textContent).toBe('12');
    vi.advanceTimersByTime(300);
    expect(out.textContent).toBe('15');
    pointer(up, 'pointerup');
    up.click(); // the click that follows the press does not step again
    vi.advanceTimersByTime(500);
    expect(out.textContent).toBe('15');
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it('takes an exact number typed into the value, within the limits', () => {
    const onChange = vi.fn();
    const tile = stepperTile({ label: 'Hold', value: 10, unit: 's', min: 5, max: 120, by: 5, onChange });
    document.body.append(tile);
    parts(tile).value.click();
    const input = tile.querySelector('input');
    expect(input).not.toBeNull();
    input.value = '17';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(tile.querySelector('input')).toBeNull();
    expect(parts(tile).out.textContent).toBe('17 s');
    expect(onChange).toHaveBeenCalledWith(17);
    // Escape keeps the old value
    parts(tile).value.click();
    tile.querySelector('input').value = '500';
    tile.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(parts(tile).out.textContent).toBe('17 s');
    tile.remove();
  });

  it('can be set from outside without reporting', () => {
    const onChange = vi.fn();
    const tile = stepperTile({ label: 'Reps', value: 10, min: 1, max: 30, onChange });
    tile.setValue(6);
    expect(parts(tile).out.textContent).toBe('6');
    expect(onChange).not.toHaveBeenCalled();
  });
});
