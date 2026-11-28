// The order a triple / Vegas / 4-spot sheet's spots are shot in, set on a small picture of the sheet: each
// spot carries its number (1st, 2nd, 3rd); dragging a number onto another spot swaps the two (a tap
// on one spot, then on another, does the same; so do Enter / Space for keyboard users). "Default"
// puts the sheet's own order back. Used on the Shooting page.
import { h, s } from '../../core/dom.js';
import { spotCentres, spotNames, spotOrderOf, spotOrderLabel, isDefaultSpotOrder, defaultSpotOrder } from '../scoring.js';
import { faceSheet, faceViewBox } from './face.js';

const BADGE_R = 46; // the number's disc (face units: one spot's radius = 100)
const DROP_R = 115; // a number let go this close to a spot's centre lands on that spot
const TAP_PX = 8; // a press that moves less than this is a tap

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/** `order`: the spot shot first, second, third; `onChange` gets the new order. */
export function spotOrderEditor(face, order, onChange, fk) {
  const seq = spotOrderOf(face, order);
  const names = spotNames(face);
  const centres = spotCentres(face);
  const rank = (spot) => seq.indexOf(spot); // 0 = shot first

  const swap = (a, b) => {
    const next = [...seq];
    const ia = next.indexOf(a);
    const ib = next.indexOf(b);
    [next[ia], next[ib]] = [next[ib], next[ia]];
    onChange(next);
  };

  let selected = null; // a spot tapped (waiting for the second tap)
  const badges = centres.map(([cx, cy], spot) => {
    const g = s(
      'g',
      {
        class: 'so-badge',
        transform: `translate(${cx} ${cy})`,
        tabindex: '0',
        role: 'button',
        'aria-label': `${names[spot]} spot, shot ${ORDINAL[rank(spot)]}. Select, then select another spot to swap.`,
        dataset: { spot: String(spot), ...(fk ? { fk: `${fk}-${spot}` } : {}) },
      },
      s('circle', { class: 'so-ring', r: 100 }),
      s('circle', { class: 'so-disc', r: BADGE_R }),
      s('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(rank(spot) + 1)),
    );
    return g;
  });
  const select = (spot) => {
    selected = spot;
    badges.forEach((b, i) => b.classList.toggle('is-selected', i === spot));
  };
  const tap = (spot) => {
    if (selected == null) select(spot);
    else if (selected === spot) select(null);
    else {
      const from = selected;
      select(null);
      swap(from, spot);
    }
  };

  const svg = s(
    'svg',
    { class: 'so-sheet', viewBox: faceViewBox(face), 'aria-hidden': 'false', role: 'group', 'aria-label': 'Spot order' },
    s('g', { class: 'so-face', 'aria-hidden': 'true' }, faceSheet(face)),
    ...badges,
  );

  // --- dragging a number: it follows the finger; let go over another spot, the two swap
  const toSheet = (ev) => {
    const m = svg.getScreenCTM()?.inverse();
    if (!m) return null;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m);
    return [p.x, p.y];
  };
  const spotAt = ([x, y]) => {
    let best = null;
    centres.forEach(([cx, cy], i) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d < DROP_R && (best == null || d < best.d)) best = { i, d };
    });
    return best?.i ?? null;
  };
  let drag = null; // { spot, id, x0, y0, moved }
  svg.addEventListener('pointerdown', (ev) => {
    const p = toSheet(ev);
    const spot = p && spotAt(p);
    if (spot == null) return;
    ev.preventDefault();
    try {
      svg.setPointerCapture(ev.pointerId);
    } catch {
      // a pointer that is already gone: the drag still works while it stays over the sheet
    }
    drag = { spot, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moved: false };
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < TAP_PX) return;
    drag.moved = true;
    const p = toSheet(ev);
    if (!p) return;
    const b = badges[drag.spot];
    b.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
    b.classList.add('is-dragged');
    svg.append(b); // drawn over the other numbers
    const over = spotAt(p);
    badges.forEach((x, i) => x.classList.toggle('is-target', i === over && i !== drag.spot));
  });
  const end = (ev, drop) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const { spot, moved } = drag;
    drag = null;
    if (!moved) {
      if (drop) tap(spot);
      return;
    }
    const p = drop ? toSheet(ev) : null;
    const over = p && spotAt(p);
    if (over != null && over !== spot) {
      select(null);
      swap(spot, over);
      return;
    }
    // back to its own spot
    const [cx, cy] = centres[spot];
    badges[spot].setAttribute('transform', `translate(${cx} ${cy})`);
    badges.forEach((x) => x.classList.remove('is-dragged', 'is-target'));
  };
  svg.addEventListener('pointerup', (ev) => end(ev, true));
  svg.addEventListener('pointercancel', (ev) => end(ev, false));
  svg.addEventListener('keydown', (ev) => {
    const spot = ev.target?.dataset?.spot;
    if (spot == null || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    tap(Number(spot));
  });

  const isDefault = isDefaultSpotOrder(face, seq);
  return h(
    'div',
    { class: 'spot-order' },
    h('div', { class: ['so-stage', `so-${centres.length > 0 && centres[0][0] === centres[1][0] ? 'column' : 'triangle'}`] }, svg),
    h(
      'div',
      { class: 'so-side' },
      h('p', { class: 'so-now' }, spotOrderLabel(face, seq)),
      h('p', { class: 'apl-cap' }, 'Drag a number onto another spot to swap them (or tap one spot, then the other).'),
      h(
        'button',
        {
          type: 'button',
          class: ['so-default', isDefault && 'is-on'],
          'aria-pressed': String(isDefault),
          disabled: isDefault,
          onClick: () => onChange(defaultSpotOrder(face)),
          dataset: fk ? { fk: `${fk}-default` } : {},
        },
        isDefault ? '✓ Default order' : 'Back to default',
      ),
    ),
  );
}
