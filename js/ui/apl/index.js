// APL components (design/apl/), rebuilt for this app's vanilla DOM: each one is a function that takes
// the design system's props (design/apl/components/index.d.ts) and returns an element styled by
// css/apl.css. They hold no state: the page is drawn again when a value changes.
//
// Beyond the design system's props, interactive components take `fk`, the focus key the app uses
// to give focus back to the same control after it redraws the page (main.js, renderNow).
import { h, s } from '../../core/dom.js';

/** @typedef {'back'|'repeat'|'calendar'|'clock'|'plus'|'arrowRight'|'target'|'bow'|'play'|'pause'|'close'|'chevron'|'stopwatch'|'erase'} IconName */
/** @typedef {'full'|'six'|'triple'|'vegas'} FaceKind */
/** @typedef {{value: string|number, label: string}} Option */
/** @typedef {Node|string|number|null|undefined|false} Child */

const fkData = (fk) => (fk ? { fk } : undefined);

/** An icon given by name (APL Icon) or as a ready node (the app's own icons). */
const iconNode = (icon, size) => (typeof icon === 'string' ? Icon({ name: icon, size }) : icon);

const PATHS = {
  back: [['path', { d: 'M15 18l-6-6 6-6' }]],
  repeat: [
    ['path', { d: 'M3 12a9 9 0 1 0 3-6.7' }],
    ['path', { d: 'M3 4v5h5' }],
  ],
  calendar: [
    ['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }],
    ['path', { d: 'M16 3v4M8 3v4M3 10h18' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  arrowRight: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  target: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['circle', { cx: 12, cy: 12, r: 5 }],
    ['circle', { cx: 12, cy: 12, r: 1 }],
  ],
  bow: [
    ['path', { d: 'M6 3c6 3 6 15 0 18' }],
    ['path', { d: 'M6 3v18' }],
    ['path', { d: 'M3 12h17M17 9l3 3-3 3' }],
  ],
  // app additions, drawn the same way (TimerButton, removing a row)
  play: [['path', { d: 'M7 5l12 7-12 7z' }]],
  pause: [['path', { d: 'M9 5v14M15 5v14' }]],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  chevron: [['path', { d: 'M9 18l6-6-6-6' }]],
  // moving a row of a list up or down (Settings › My drills / My exercises)
  up: [['path', { d: 'M6 15l6-6 6 6' }]],
  down: [['path', { d: 'M6 9l6 6 6-6' }]],
  stopwatch: [
    ['circle', { cx: 12, cy: 13, r: 8 }],
    ['path', { d: 'M12 9v4l2.5 2' }],
    ['path', { d: 'M9 2h6' }],
  ],
  erase: [
    ['path', { d: 'M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z' }],
    ['path', { d: 'M17 9l-5 6M12 9l5 6' }],
  ],
  // the rows of the Settings overview
  theme: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M12 7h4M12 11h5M12 15h4' }],
  ],
  sync: [
    ['path', { d: 'M4 9h13l-3-3' }],
    ['path', { d: 'M20 15H7l3 3' }],
  ],
  info: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 11v6M12 7.5v.01' }],
  ],
};

/** Inline 24-unit stroke icon, `currentColor`, hidden from assistive technology. */
export function Icon({ name, size = 20, strokeWidth = 2 }) {
  return s(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    (PATHS[name] || []).map(([tag, attrs]) => s(tag, attrs)),
  );
}

/** Full-width 56px action. One primary per screen, in the BottomBar. */
export function Button({
  children,
  variant = 'primary',
  leadingIcon,
  trailingIcon,
  label,
  disabled = false,
  type = 'button',
  onClick,
  fk,
}) {
  // app additions: `leadingIcon` (an IconName or a node) before the text, `label` as the aria-label,
  // `variant: 'danger'` for the confirm button of a destructive Dialog
  return h(
    'button',
    {
      type,
      class: [
        'apl',
        'apl-btn',
        variant === 'secondary' && 'apl-btn--secondary',
        variant === 'danger' && 'apl-btn--danger',
      ],
      'aria-label': label,
      disabled,
      onClick,
      dataset: fkData(fk),
    },
    leadingIcon ? iconNode(leadingIcon, 20) : null,
    children,
    trailingIcon ? Icon({ name: trailingIcon, strokeWidth: 2.2 }) : null,
  );
}

/** Round 44px icon-only button; `label` becomes its aria-label. */
export function IconButton({ icon, label, onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-iconbtn', 'aria-label': label, onClick, dataset: fkData(fk) },
    Icon({ name: icon, size: 22 }),
  );
}

/** Back button (when `onBack` is given) and the screen title, on ground. */
export function ScreenHeader({ title, onBack, trailing = null, backLabel = 'Back' }) {
  return h(
    'header',
    { class: 'apl apl-header' },
    onBack ? IconButton({ icon: 'back', label: backLabel, onClick: onBack, fk: 'screen-back' }) : null,
    h('h1', null, title),
    trailing,
  );
}

/** UPPERCASE label with an optional right-aligned accessory, then the content. */
export function Section({ label, accessory = null, children = [], id }) {
  const labelId = id ? `${id}-label` : undefined;
  return h(
    'section',
    { class: 'apl apl-section', 'aria-labelledby': labelId },
    h('div', { class: 'apl-section-head' }, h('h2', { class: 'apl-label', id: labelId }, label), accessory),
    children,
  );
}

/** 48px toggle button (52px `numeric`); aria-pressed carries the selection. */
export function Chip({ children, selected = false, numeric = false, onClick, fk }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['apl', 'apl-chip', numeric && 'apl-chip--num'],
      'aria-pressed': String(!!selected),
      onClick,
      dataset: fkData(fk),
    },
    children,
  );
}

/**
 * A yes / no setting as one full-width row: the title and its line on the left, an on / off switch on
 * the right. The whole row is the switch (role="switch", aria-checked carries the state).
 */
export function Switch({ title, detail = null, checked = false, onChange, fk }) {
  return h(
    'button',
    {
      type: 'button',
      role: 'switch',
      class: ['apl', 'apl-switch'],
      'aria-checked': String(!!checked),
      onClick: () => onChange?.(!checked),
      dataset: fkData(fk),
    },
    h(
      'span',
      { class: 'apl-switch-text' },
      h('span', { class: 'apl-switch-title' }, title),
      detail ? h('span', { class: 'apl-switch-detail' }, detail) : null,
    ),
    h('span', { class: 'apl-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'apl-switch-thumb' })),
  );
}

/** Single-choice grid of Chips. `fk` is a prefix: each chip gets `${fk}-${value}`. */
export function ChipGrid({ label, options, value, onChange, columns = 4, numeric = false, fk }) {
  return h(
    'div',
    {
      class: 'apl apl-chipgrid',
      role: 'group',
      'aria-label': label,
      style: { '--apl-cols': String(columns) },
    },
    options.map((o) =>
      Chip({
        numeric,
        selected: o.value === value,
        onClick: () => onChange?.(o.value),
        fk: fk && `${fk}-${o.value}`,
        children: o.label,
      }),
    ),
  );
}

/**
 * Wrapping 44px pills for longer labels; show only the options valid here. `fill`: the pills share
 * the full width equally (for short labels such as numbers), wrapping in a grid on a narrow screen.
 */
export function OptionPills({ label, options, value, onChange, fk, multiple = false, fill = false }) {
  // `multiple`: `value` is an array and each pill toggles on its own; onChange gets the tapped value
  const isOn = (v) => (multiple ? (value || []).includes(v) : v === value);
  return h(
    'div',
    { class: ['apl', 'apl-pills', fill && 'apl-pills--fill'], role: 'group', 'aria-label': label },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: 'apl-pill',
          'aria-pressed': String(isOn(o.value)),
          onClick: () => onChange?.(o.value),
          dataset: fkData(fk && `${fk}-${o.value}`),
        },
        o.label,
      ),
    ),
  );
}

/** A track of 2–5 equal 44px segments; the selected one fills accent. */
export function SegmentedControl({ label, options, value, onChange, fk }) {
  return h(
    'div',
    {
      class: 'apl apl-seg',
      role: 'group',
      'aria-label': label,
      style: { '--apl-cols': String(options.length) },
    },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(o.value === value),
          onClick: () => onChange?.(o.value),
          dataset: fkData(fk && `${fk}-${o.value}`),
        },
        o.label,
      ),
    ),
  );
}

/** A touch that moves this far (px) has chosen: sideways drags the slider, up or down scrolls the page. */
const SLIDER_SLOP_PX = 8;

/**
 * Horizontal slider over whole numbers `min`…`max`, with each value as a tick above the track and
 * the chosen one marked. Dragging only moves the thumb and the mark (no re-render mid-drag);
 * `onChange` gets the value on release, or on each arrow key.
 *
 * The slider handles the pointer itself (the range input only takes the keyboard): a finger that
 * lands on it while the page is being scrolled changes nothing. A touch drags the thumb only once
 * it moves sideways; one that moves up or down scrolls the page (touch-action: pan-y) and leaves
 * the value as it was; a touch lifted without moving is a tap and picks the value under it. A
 * mouse drags at once, as a native slider does.
 */
export function Slider({ label, value, min, max, onChange, fk }) {
  const fill = (v) => `${((v - min) / (max - min || 1)) * 100}%`;
  const ticks = Array.from({ length: max - min + 1 }, (_, i) =>
    h('span', { class: ['apl-slider-tick', min + i === value && 'apl-slider-tick--on'] }, String(min + i)),
  );
  const show = (v) => {
    input.value = String(v);
    input.style.setProperty('--apl-fill', fill(v));
    ticks.forEach((t, i) => t.classList.toggle('apl-slider-tick--on', min + i === v));
  };
  const input = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: '1',
    value: String(value),
    'aria-label': label,
    style: { '--apl-fill': fill(value) },
    onInput: (e) => show(Number(e.target.value)),
    onChange: (e) => onChange?.(Number(e.target.value)),
    dataset: fkData(fk),
  });

  // the value under a pointer: the thumb's centre runs from half a thumb in from each end
  const valueAt = (clientX) => {
    const r = input.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(wrap).getPropertyValue('--apl-thumb')) || 28;
    const f = (clientX - r.left - thumb / 2) / Math.max(1, r.width - thumb);
    return Math.max(min, Math.min(max, Math.round(min + f * (max - min))));
  };
  let drag = null; // { id, x, y, on: dragging (not just touched), v: the value shown }
  const moveTo = (clientX) => {
    drag.v = valueAt(clientX);
    show(drag.v);
  };
  const end = (commit) => {
    if (!drag) return;
    const v = drag.v;
    drag = null;
    if (commit && v !== value) onChange?.(v);
    else show(value);
  };
  const wrap = h('div', {
    class: 'apl apl-slider',
    onPointerdown: (e) => {
      if (e.button) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: e.pointerType === 'mouse', v: value };
      if (drag.on) {
        wrap.setPointerCapture?.(e.pointerId);
        input.focus({ preventScroll: true });
        moveTo(e.clientX);
      }
    },
    onPointermove: (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        const dx = Math.abs(e.clientX - drag.x);
        const dy = Math.abs(e.clientY - drag.y);
        // up or down first: the page scrolls, the value stays
        if (dy > SLIDER_SLOP_PX && dy >= dx) return end(false);
        if (dx <= SLIDER_SLOP_PX) return;
        drag.on = true;
        wrap.setPointerCapture?.(e.pointerId);
      }
      moveTo(e.clientX);
    },
    onPointerup: (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      // a touch lifted where it landed: a tap on the value under it
      if (!drag.on) moveTo(e.clientX);
      end(true);
    },
    // the browser took the touch to scroll the page
    onPointercancel: () => end(false),
  });
  wrap.append(h('div', { class: 'apl-slider-ticks', 'aria-hidden': 'true' }, ticks), input);
  return wrap;
}

/**
 * Compact − value + pill. Clamps to `min` / `max` and disables the end buttons there.
 * `display` (optional) is the text shown instead of `value unit`. `next(value, dir)` (optional):
 * the value after one tap when the steps are not even (a list of standard distances); a button is
 * off where it would not change the value.
 */
export function Stepper({
  value,
  onChange,
  label = '',
  unit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  display,
  next = null,
  fk,
}) {
  const stepOf = next || ((v, dir) => Math.max(min, Math.min(max, v + dir * step)));
  const down = stepOf(value, -1);
  const up = stepOf(value, 1);
  const btn = (dir, to, name, text) =>
    h(
      'button',
      {
        type: 'button',
        'aria-label': `${name} ${label}`.trim(),
        disabled: to === value,
        onClick: () => onChange?.(to),
        dataset: fkData(fk && `${fk}-${dir}`),
      },
      text,
    );
  return h(
    'div',
    { class: 'apl apl-stepper', role: 'group', 'aria-label': label || undefined },
    btn('minus', down, 'Decrease', '−'),
    h('output', { 'aria-live': 'polite' }, display ?? `${value}${unit ? ` ${unit}` : ''}`),
    btn('plus', up, 'Increase', '+'),
  );
}

/** 12px pill: accent flags a smart default ("Suggested"); neutral for plain tags. Never errors. */
export function Badge({ children, tone = 'accent' }) {
  return h('span', { class: ['apl', 'apl-badge', tone === 'neutral' && 'apl-badge--neutral'] }, children);
}

/** Accent-tint card that fills a form with the last-used values in one tap. */
export function RepeatCard({ title, summary, actionLabel = 'Use', icon = 'repeat', onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-repeat', onClick, dataset: fkData(fk) },
    h('span', { class: 'apl-well' }, Icon({ name: icon })),
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, title),
      h('span', { class: 'apl-cap13' }, summary),
    ),
    h('span', { class: 'apl-link' }, actionLabel),
  );
}

/** 56px field showing a value and hint with a leading icon; tapping opens a picker. */
export function FieldButton({ value, hint, icon, onClick, fk, attrs = {} }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-field', onClick, dataset: fkData(fk), ...attrs },
    icon ? Icon({ name: icon }) : null,
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, value),
      hint ? h('span', { class: 'apl-cap' }, hint) : null,
    ),
  );
}

/** 60px radio-style card for saved items (equipment). */
export function SelectCard({ title, detail, selected = false, onClick, fk }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'apl apl-select',
      'aria-pressed': String(!!selected),
      onClick,
      dataset: fkData(fk),
    },
    h('span', { class: 'apl-radio' }, h('i')),
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, title),
      detail ? h('span', { class: 'apl-cap' }, detail) : null,
    ),
  );
}

/** Dashed "Add …" button that ends a list of SelectCards. */
export function AddButton({ children, onClick, fk }) {
  return h(
    'button',
    { type: 'button', class: 'apl apl-add', onClick, dataset: fkData(fk) },
    Icon({ name: 'plus', size: 18 }),
    children,
  );
}

export const FACE_NAMES = {
  full: 'WA 10-ring',
  ring6: 'WA 6-ring',
  six: 'WA single spot',
  triple: 'WA vertical triple',
  // the 10–6 spots in a triangle (the WA triangular 40 cm face; NFAA calls the same layout Vegas)
  vegas: 'Vegas 3-spot',
  field: 'WA field',
  fieldTriple: 'WA field vertical triple',
  nfaaField: 'NFAA field',
  ifaaField: 'IFAA field',
  nfaaHunter: 'NFAA hunter',
  ifaaHunter: 'IFAA hunter',
  ifaaField4: 'IFAA field 4-spot',
  ifaaHunter4: 'IFAA hunter 4-spot',
  animal: 'WA 3D animal',
};

/** One 10–6 spot of a multi-spot sheet; `inner10`: the small compound 10. */
function spot(cx, cy, r, inner10) {
  return [
    s('circle', { class: 'blue', cx, cy, r }),
    s('circle', { class: 'red', cx, cy, r: r * 0.6 }),
    s('circle', { class: 'gold sep', cx, cy, r: r * 0.4 }),
    s('circle', { class: 'gold sep', cx, cy, r: r * (inner10 ? 0.1 : 0.2) }),
  ];
}

const rings = (list) => list.map(([c, r]) => s('circle', { class: `${c} ${c === 'blk' ? 'sepw' : 'sep'}`, cx: 50, cy: 50, r }));

/**
 * Target face illustration in target-* colours: the regular faces, the WA field face and the 3D
 * animal. `inner10`: the compound inner 10 drawn small on a regular face.
 */
export function TargetFace({ kind = 'full', size = 84, inner10 = false }) {
  let kids = [];
  const x = (r) => s('circle', { class: 'gold sep', cx: 50, cy: 50, r });
  if (kind === 'full') {
    const cls = ['wht', 'wht', 'blk', 'blk', 'blue', 'blue', 'red', 'red', 'gold', 'gold'];
    kids = [...rings(cls.map((c, i) => [c, 49 - i * 5])), x(inner10 ? 2.5 : 4.5)];
  } else if (kind === 'six') {
    kids = [...rings([['blue', 49], ['red', 39], ['red', 29], ['gold', 19], ['gold', 9]]), x(inner10 ? 4.5 : 9)];
  } else if (kind === 'ring6') {
    kids = [...rings([['blue', 49], ['blue', 41], ['red', 33], ['red', 25], ['gold', 17], ['gold', 9]]), x(inner10 ? 4.5 : 9)];
  } else if (kind === 'triple') {
    kids = [...spot(50, 17, 16, inner10), ...spot(50, 50, 16, inner10), ...spot(50, 83, 16, inner10)];
  } else if (kind === 'vegas') {
    // one spot at the top, two below (WA Book 2, 7.2.2: bottom left, top, bottom right)
    kids = [...spot(50, 29, 20, inner10), ...spot(29, 68, 20, inner10), ...spot(71, 68, 20, inner10)];
  } else if (kind === 'fieldTriple') {
    // three field spots in a column: black 4–1, gold 6–5
    kids = [17, 50, 83].flatMap((cy) => [
      s('circle', { class: 'blk sepw', cx: 50, cy, r: 16 }),
      s('circle', { class: 'blk sepw', cx: 50, cy, r: 9.6 }),
      s('circle', { class: 'gold sep', cx: 50, cy, r: 3.2 }),
      s('circle', { class: 'gold sep', cx: 50, cy, r: 1.6 }),
    ]);
  } else if (kind === 'ifaaField4' || kind === 'ifaaHunter4') {
    // the IFAA 20 cm square of four: field spots (black, white, black) or hunter spots (black, white spot)
    const hunter = kind === 'ifaaHunter4';
    kids = [
      [27, 27],
      [73, 27],
      [27, 73],
      [73, 73],
    ].flatMap(([cx, cy]) =>
      hunter
        ? [s('circle', { class: 'blk sepw', cx, cy, r: 21 }), s('circle', { class: 'wht sep', cx, cy, r: 4.2 })]
        : [
            s('circle', { class: 'blk sepw', cx, cy, r: 21 }),
            s('circle', { class: 'wht sep', cx, cy, r: 12.6 }),
            s('circle', { class: 'blk sepw', cx, cy, r: 4.2 }),
          ],
    );
  } else if (kind === 'nfaaField' || kind === 'ifaaField') {
    // NFAA / IFAA field: two black rings (3), two white rings (4), the black spot (5) with a white X
    kids = [...rings([['blk', 49], ['blk', 39.2], ['wht', 29.4], ['wht', 19.6], ['blk', 9.8]]), s('circle', { class: 'x-w', cx: 50, cy: 50, r: 4.9 })];
  } else if (kind === 'nfaaHunter' || kind === 'ifaaHunter') {
    // NFAA / IFAA hunter: all black (3 and 4) with a white spot (5); NFAA prints a black X in it
    kids = [
      ...rings([['blk', 49], ['blk', 29.4], ['wht', 9.8]]),
      kind === 'nfaaHunter' ? s('circle', { class: 'x-b', cx: 50, cy: 50, r: 4.9 }) : null,
    ];
  } else if (kind === 'field') {
    kids = [...rings([['blk', 49], ['blk', 41], ['blk', 33], ['blk', 25], ['gold', 17], ['gold', 9]]), x(4)];
  } else {
    // 3D animal: the body (5), the vital oval (8), the 10 and the 11 circles
    kids = [
      s('path', {
        class: 'body3d',
        d: 'M14 40c4-12 20-18 40-17 9 0 15-6 20-12 3-3 8-2 9 2l2 6c5 1 9 4 9 8 0 3-3 5-7 5l-6 1c-1 9-4 17-8 22l1 22h-6l-3-18c-7 2-17 2-25 0l-3 18h-6l1-22c-6-4-10-9-12-15z',
      }),
      s('ellipse', { class: 'line3d', cx: 52, cy: 46, rx: 16, ry: 12 }),
      s('circle', { class: 'line3d', cx: 52, cy: 46, r: 7 }),
      s('circle', { class: 'line3d', cx: 52, cy: 46, r: 2.8 }),
    ];
  }
  return s(
    'svg',
    {
      class: 'apl-face',
      width: size,
      height: size,
      viewBox: '0 0 100 100',
      role: 'img',
      'aria-label': FACE_NAMES[kind] || FACE_NAMES.full,
    },
    kids,
  );
}

/**
 * The chosen face: its drawing in a 96px well, the size big ("40 cm"; "3D animal" when it has
 * none), the face's name under it (left out for 3D) and `meta` ("18 m · Recurve").
 *
 * With `onClick` it is the button that opens the face picker (`aria-haspopup="dialog"`): the
 * drawing names the face, so the name line is left out (it stays in `label`); `meta` ("Recurve")
 * goes under the size, and `side` (lines such as ['18 m', 'Recurve']) at the right, before the
 * chevron.
 */
export function FaceCard({ kind = 'full', size = null, inner10 = false, meta = '', side = [], onClick, label, fk }) {
  const sized = kind !== 'animal' && size != null;
  const box = h('span', { class: 'apl-facebox' }, TargetFace({ kind, inner10 }));
  const big = h('span', { class: ['apl-big', !sized && 'apl-big--name'] }, sized ? `${size} cm` : FACE_NAMES[kind]);
  if (!onClick) {
    return h(
      'div',
      { class: 'apl apl-facecard' },
      box,
      h(
        'span',
        { class: 'apl-stack' },
        big,
        sized ? h('span', { class: 'apl-soft' }, FACE_NAMES[kind]) : null,
        meta ? h('span', { class: 'apl-cap' }, meta) : null,
      ),
    );
  }
  return h(
    'button',
    {
      type: 'button',
      class: 'apl apl-facecard apl-facecard--btn',
      'aria-haspopup': 'dialog',
      'aria-label': label,
      onClick,
      dataset: fkData(fk),
    },
    box,
    h('span', { class: 'apl-stack' }, big, meta ? h('span', { class: 'apl-facecard-meta' }, meta) : null),
    side.length
      ? h(
          'span',
          { class: 'apl-facecard-side' },
          side.map((line, i) => h('span', { class: i ? 'apl-facecard-side-sub' : 'apl-facecard-side-main' }, line)),
        )
      : null,
    h('span', { class: 'apl-facecard-chev', 'aria-hidden': 'true' }, Icon({ name: 'chevron', size: 22 })),
  );
}

/** One face of the picker: a 56px drawing and its name, a radio of its group (`role="radiogroup"`). */
export function FaceRow({ kind, selected = false, inner10 = false, onClick, fk }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'apl apl-facerow',
      role: 'radio',
      'aria-checked': String(!!selected),
      onClick,
      dataset: fkData(fk),
    },
    h('span', { class: 'apl-facerow-thumb', 'aria-hidden': 'true' }, TargetFace({ kind, size: 48, inner10 })),
    h('span', { class: 'apl-t' }, FACE_NAMES[kind]),
  );
}

/** Pinned footer: an optional one-line summary and the screen's primary Button. */
export function BottomBar({ summary, children = [] }) {
  return h(
    'footer',
    { class: 'apl apl-bar' },
    summary ? h('span', { class: 'apl-cap13', 'aria-live': 'polite' }, summary) : null,
    children,
  );
}

// ---------------------------------------------------------------- app additions (approved 2026-11-15)
// Built from the design system's tokens and principles; not part of APL itself.

/**
 * Text or number field: a caption label over a 56px surface box, with an optional unit after the
 * value ("min"). `hideLabel` keeps the label for screen readers only (a column header shows it).
 */
export function TextField({
  label,
  value = '',
  type = 'text',
  inputmode,
  min,
  max,
  placeholder,
  suffix,
  hideLabel = false,
  autocomplete = 'off',
  fk,
  onInput,
  onChange,
}) {
  return h(
    'label',
    { class: 'apl apl-textfield' },
    h('span', { class: hideLabel ? 'sr-only' : 'apl-cap13' }, label),
    h(
      'span',
      { class: 'apl-input' },
      h('input', {
        type,
        inputmode,
        min,
        max,
        placeholder,
        autocomplete,
        value: value ?? '',
        dataset: fkData(fk),
        onInput,
        onChange,
      }),
      suffix ? h('span', { class: 'apl-input-suffix' }, suffix) : null,
    ),
  );
}

/** Multi-line text field, styled like TextField. */
export function TextArea({ label, value = '', rows = 3, placeholder, hideLabel = false, fk, onInput }) {
  return h(
    'label',
    { class: 'apl apl-textfield' },
    h('span', { class: hideLabel ? 'sr-only' : 'apl-cap13' }, label),
    h(
      'span',
      { class: 'apl-input apl-input--area' },
      h('textarea', { rows, placeholder, value: value ?? '', dataset: fkData(fk), onInput }),
    ),
  );
}

/**
 * Session timer pill: tap to pause or resume. `text` is the time shown now; the app's ticker keeps
 * the `.timer-value` element current from its data attributes (elapsed ms, start while running).
 * `size: 'lg'` is the 56px version that stands on its own on a page.
 */
export function TimerButton({ running, text, elapsedMs = 0, startedAt = null, onToggle, size = 'md', fk }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['apl', 'apl-timer', size === 'lg' && 'apl-timer--lg', !running && 'is-paused'],
      'aria-label': running ? 'Pause the session timer' : 'Resume the session timer',
      onClick: onToggle,
      dataset: fkData(fk),
    },
    Icon({ name: running ? 'pause' : 'play', size: size === 'lg' ? 22 : 18 }),
    h(
      'span',
      {
        class: 'timer-value',
        dataset: { elapsed: String(elapsedMs || 0), started: running ? startedAt : '' },
      },
      text,
    ),
  );
}

/**
 * Bottom tab bar: one link per section, the current one marked with aria-current and accent-bright.
 * `items`: { id, label, icon, href, current }. Each tab carries data-tab=id, so the app can move the
 * mark without drawing the bar again.
 */
export function TabBar({ label, items }) {
  return h(
    'nav',
    { class: 'apl apl-tabbar', 'aria-label': label, style: { '--apl-cols': String(items.length) } },
    items.map((it) =>
      h(
        'a',
        {
          class: 'apl-tab',
          href: it.href,
          'aria-current': it.current ? 'page' : undefined,
          dataset: { tab: it.id },
        },
        iconNode(it.icon, 22),
        h('span', null, it.label),
      ),
    ),
  );
}

/**
 * 60px row that opens a page (`href`) or does something (`onClick`): an icon well, a title and a
 * detail line, an optional badge and a chevron. For navigation lists, where SelectCard would wrongly
 * suggest a choice.
 */
export function NavRow({ title, detail, icon, href, newTab = false, onClick, badge = null, fk }) {
  // app addition: `newTab` opens an outside page (href) in a new browser tab, without a referrer
  return h(
    href ? 'a' : 'button',
    {
      class: 'apl apl-navrow',
      href,
      type: href ? undefined : 'button',
      target: href && newTab ? '_blank' : undefined,
      rel: href && newTab ? 'noopener noreferrer' : undefined,
      onClick,
      dataset: fkData(fk),
    },
    icon ? h('span', { class: 'apl-navrow-well' }, iconNode(icon)) : null,
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, title),
      detail ? h('span', { class: 'apl-cap' }, detail) : null,
    ),
    badge,
    h('span', { class: 'apl-navrow-go', 'aria-hidden': 'true' }, Icon({ name: 'chevron' })),
  );
}

/**
 * A status strip: a title and detail, then an action. With `href` the whole strip is the link and the
 * action label is its visible cue. `tone: 'accent'` marks something live (a running session), with a
 * dot that pulses (`indicator: 'live'`) or stands still (`'paused'`). `trailing` goes before the action
 * (a running time).
 */
export function Banner({
  title,
  detail,
  tone = 'neutral',
  indicator = null,
  href,
  action = null,
  trailing = null,
  fk,
}) {
  const cue = action
    ? href || action.href
      ? h(
          href ? 'span' : 'a',
          { class: 'apl-banner-action', href: href ? undefined : action.href },
          action.label,
          Icon({ name: 'chevron', size: 18 }),
        )
      : h(
          'button',
          { type: 'button', class: 'apl-banner-action', onClick: action.onClick, dataset: fkData(action.fk) },
          action.label,
        )
    : null;
  return h(
    href ? 'a' : 'div',
    {
      class: ['apl', 'apl-banner', tone === 'accent' && 'apl-banner--accent'],
      href,
      role: href ? undefined : 'status',
      dataset: fkData(fk),
    },
    indicator
      ? h('span', { class: ['apl-banner-dot', indicator === 'paused' && 'is-paused'], 'aria-hidden': 'true' })
      : null,
    h(
      'span',
      { class: 'apl-stack' },
      h('span', { class: 'apl-t' }, title),
      detail ? h('span', { class: 'apl-cap' }, detail) : null,
    ),
    trailing,
    cue,
  );
}

/**
 * Score keys under the target face: one key per value in its ring colour (`zone`: gold, red, blue,
 * black, white, miss), the selected arrow's value pressed and the others dimmed. `clear` adds an
 * erase key at the end of the row, kept in place (invisible) while it does not apply.
 */
export function ScoreKeypad({ label, keys, value, onKey, clear = null, fk = 'key' }) {
  return h(
    'div',
    {
      class: 'apl apl-keypad',
      role: 'group',
      'aria-label': label,
      style: { '--apl-cols': String(keys.length + (clear ? 1 : 0)) },
    },
    keys.map((k) =>
      h(
        'button',
        {
          type: 'button',
          class: 'apl-key',
          'aria-label': k.ariaLabel,
          'aria-pressed': String(value === k.value),
          dataset: { zone: k.zone, fk: `${fk}-${k.value}` },
          onClick: () => onKey?.(k.value),
        },
        k.label ?? String(k.value),
      ),
    ),
    clear
      ? h(
          'button',
          {
            type: 'button',
            class: ['apl-key', 'apl-key--clear', !clear.enabled && 'is-off'],
            'aria-label': clear.label,
            'aria-hidden': clear.enabled ? undefined : 'true',
            tabindex: clear.enabled ? undefined : '-1',
            disabled: !clear.enabled,
            dataset: { fk: `${fk}-clear` },
            onClick: () => clear.onClick?.(),
          },
          Icon({ name: 'erase', size: 22 }),
        )
      : null,
  );
}

/**
 * One row of grade keys 1…max in the grade colours, after a short row label (M, S). The chosen
 * grade is ringed and the others dim. `keyLabel(g)` names each key for screen readers.
 */
export function GradeKeys({ label, rowLabel, value, onChange, max = 5, keyLabel = (g) => String(g), fk }) {
  return h(
    'div',
    { class: 'apl apl-grades', role: 'group', 'aria-label': label, style: { '--apl-cols': String(max) } },
    h('span', { class: 'apl-grades-label', 'aria-hidden': 'true' }, rowLabel),
    Array.from({ length: max }, (_, i) => i + 1).map((g) =>
      h(
        'button',
        {
          type: 'button',
          class: 'apl-key',
          'aria-label': keyLabel(g),
          'aria-pressed': String(value === g),
          dataset: { grade: String(g), fk: fk && `${fk}-${g}` },
          onClick: () => onChange?.(g),
        },
        String(g),
      ),
    ),
  );
}

/**
 * A figure with its name: caption label over a value-lg number. Put tiles in a `dl.apl-stats` grid
 * (StatTiles builds one).
 */
export function StatTile({ label, value }) {
  return h('div', { class: 'apl-stat' }, h('dt', null, label), h('dd', null, value));
}

/** A grid of StatTiles (`items`: [label, value] pairs), three to a row by default. */
export function StatTiles({ label, items, columns = 3 }) {
  return h(
    'dl',
    { class: 'apl apl-stats', 'aria-label': label, style: { '--apl-cols': String(columns) } },
    items.map(([l, v]) => StatTile({ label: l, value: v })),
  );
}

/**
 * A table that scrolls sideways inside its own focusable region. `columns`: { label, align, nowrap,
 * strong, muted }, where `label` may be a node (a sort button); `rows`: arrays of cell contents in
 * column order. `rowProps(i)` adds attributes to a row (a link, a click handler).
 */
export function DataTable({ label, columns, rows, rowProps = null }) {
  const cellClass = (c) => [
    c.align === 'end' && 'is-end',
    c.nowrap && 'is-nowrap',
    c.strong && 'is-strong',
    c.muted && 'is-muted',
  ];
  return h(
    'div',
    { class: 'apl apl-table-scroll', tabindex: '0', role: 'region', 'aria-label': label },
    h(
      'table',
      { class: 'apl-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          columns.map((c) => h('th', { scope: 'col', class: cellClass(c), 'aria-sort': c.sort }, c.label)),
        ),
      ),
      h(
        'tbody',
        null,
        rows.map((cells, i) =>
          h(
            'tr',
            rowProps ? rowProps(i) : null,
            cells.map((v, j) => h('td', { class: cellClass(columns[j] || {}) }, v)),
          ),
        ),
      ),
    ),
  );
}

/**
 * A session in a list: when, a neutral type badge, the setup line, and for a scored session its score
 * (`score`: { total, max }; max is optional) with the M / S figures (`stats`: [label, value] pairs). With `href` the row
 * is a link; `actions` (buttons) go at the bottom (Recently deleted).
 */
export function SessionRow({
  href,
  when,
  type,
  summary,
  score = null,
  stats = [],
  note = null,
  foot = null,
  actions = null,
  fk,
}) {
  return h(
    href ? 'a' : 'div',
    { class: 'apl apl-sessionrow', href, dataset: fkData(fk) },
    h(
      'span',
      { class: 'apl-sessionrow-head' },
      h('span', { class: 'apl-t' }, when),
      type ? Badge({ children: type, tone: 'neutral' }) : null,
    ),
    summary ? h('span', { class: 'apl-cap' }, summary) : null,
    score
      ? h(
          'span',
          { class: 'apl-sessionrow-score' },
          h(
            'span',
            { class: 'apl-big' },
            String(score.total),
            score.max != null ? h('span', { class: 'apl-sessionrow-max' }, ` / ${score.max}`) : null,
          ),
          stats.length
            ? h(
                'span',
                { class: 'apl-sessionrow-stats' },
                stats.map(([l, v]) => h('span', null, `${l} `, h('strong', null, v))),
              )
            : null,
        )
      : null,
    note ? h('span', { class: 'apl-sessionrow-note' }, note) : null,
    foot ? h('span', { class: 'apl-cap' }, foot) : null,
    actions ? h('span', { class: 'apl-sessionrow-actions' }, actions) : null,
  );
}

/**
 * A dialog's content and frame (the caller opens and closes it).
 * Centred (`<dialog>`, for showModal): an icon well, the title, the message, optional `body` (fields,
 * a picture) and the `actions` (Cancel, then the confirm Button) side by side. `tone: 'danger'` tints
 * the well. `bare`: only the body and the actions on screen; the title still names the dialog.
 * `sheet: true`: a bottom sheet (`div role=dialog`, for the app's overlay layer) with the title, a
 * close IconButton (`onClose`, `closeLabel`) and `children`. With `footer` (the Done button), the
 * sheet has a drag handle, its children scroll in a body and the footer stays pinned under them;
 * `sheetClass` adds a class (the face picker's slower rise).
 */
export function Dialog({
  title,
  message = '',
  icon = null,
  tone = 'neutral',
  body = null,
  actions = [],
  bare = false,
  sheet = false,
  onClose,
  closeLabel = 'Close',
  idPrefix = 'dialog',
  children = [],
  footer = null,
  sheetClass = null,
}) {
  const titleId = `${idPrefix}-title`;
  const msgId = `${idPrefix}-msg`;
  if (sheet) {
    return h(
      'div',
      {
        class: ['apl', 'apl-dialog', 'apl-dialog--sheet', footer && 'apl-dialog--pinned', sheetClass],
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
      },
      footer ? h('div', { class: 'apl-dialog-handle', 'aria-hidden': 'true' }) : null,
      h(
        'div',
        { class: 'apl-dialog-sheethead' },
        h('h2', { class: 'apl-dialog-title', id: titleId }, title),
        h(
          'button',
          {
            type: 'button',
            class: 'apl-iconbtn',
            'aria-label': closeLabel,
            onClick: onClose,
            dataset: { autofocus: '' },
          },
          Icon({ name: 'close', size: 22 }),
        ),
      ),
      footer ? h('div', { class: 'apl-dialog-sheetbody' }, children) : children,
      footer ? h('div', { class: 'apl-dialog-sheetfoot' }, footer) : null,
    );
  }
  return h(
    'dialog',
    bare
      ? { class: 'apl apl-dialog apl-dialog--bare', 'aria-label': title }
      : {
          class: ['apl', 'apl-dialog', tone === 'danger' && 'apl-dialog--danger'],
          'aria-labelledby': titleId,
          'aria-describedby': message ? msgId : undefined,
        },
    bare
      ? null
      : h(
          'div',
          { class: 'apl-dialog-head' },
          icon ? h('span', { class: 'apl-dialog-well', 'aria-hidden': 'true' }, iconNode(icon, 24)) : null,
          h('h2', { class: 'apl-dialog-title', id: titleId }, title),
          message ? h('p', { class: 'apl-dialog-msg', id: msgId }, message) : null,
        ),
    body ? h('div', { class: 'apl-dialog-body' }, body) : null,
    h('div', { class: 'apl-dialog-actions' }, actions),
  );
}

/** A short message that floats above the tab bar for a few seconds (the app's toast layer). */
export function Toast({ message }) {
  return h('div', { class: 'apl apl-toast' }, message);
}
