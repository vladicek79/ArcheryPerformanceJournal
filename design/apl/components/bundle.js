/* @ds-bundle: {"format":4,"namespace":"APL","components":[{"name":"Button"},{"name":"IconButton"},{"name":"Icon"},{"name":"ScreenHeader"},{"name":"Section"},{"name":"Chip"},{"name":"ChipGrid"},{"name":"OptionPills"},{"name":"SegmentedControl"},{"name":"Stepper"},{"name":"Badge"},{"name":"RepeatCard"},{"name":"FieldButton"},{"name":"SelectCard"},{"name":"AddButton"},{"name":"TargetFace"},{"name":"FaceCard"},{"name":"BottomBar"},{"name":"SessionSetup"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  var PATHS = {
    back: [['path', { d: 'M15 18l-6-6 6-6' }]],
    repeat: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7' }], ['path', { d: 'M3 4v5h5' }]],
    calendar: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }], ['path', { d: 'M16 3v4M8 3v4M3 10h18' }]],
    clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    arrowRight: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
    target: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 5 }], ['circle', { cx: 12, cy: 12, r: 1 }]],
    bow: [['path', { d: 'M6 3c6 3 6 15 0 18' }], ['path', { d: 'M6 3v18' }], ['path', { d: 'M3 12h17M17 9l3 3-3 3' }]]
  };

  function Icon(p) {
    var size = p.size || 20;
    var parts = PATHS[p.name] || [];
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.strokeWidth || 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      parts.map(function (x, i) { return h(x[0], Object.assign({ key: i }, x[1])); }));
  }

  function Button(p) {
    return h('button', { type: p.type || 'button', className: cx('apl', 'apl-btn', p.variant === 'secondary' && 'apl-btn--secondary'), onClick: p.onClick, disabled: p.disabled },
      p.children, p.trailingIcon ? h(Icon, { name: p.trailingIcon, strokeWidth: 2.2 }) : null);
  }

  function IconButton(p) {
    return h('button', { type: 'button', className: 'apl apl-iconbtn', 'aria-label': p.label, onClick: p.onClick }, h(Icon, { name: p.icon, size: 22 }));
  }

  function ScreenHeader(p) {
    return h('header', { className: 'apl apl-header' },
      p.onBack !== undefined ? h(IconButton, { icon: 'back', label: 'Back', onClick: p.onBack }) : null,
      h('h1', null, p.title), p.trailing || null);
  }

  function Section(p) {
    return h('section', { className: 'apl apl-section' },
      h('div', { className: 'apl-section-head' }, h('h2', { className: 'apl-label' }, p.label), p.accessory || null),
      p.children);
  }

  function Chip(p) {
    return h('button', { type: 'button', className: cx('apl', 'apl-chip', p.numeric && 'apl-chip--num'), 'aria-pressed': !!p.selected, onClick: p.onClick }, p.children);
  }

  function ChipGrid(p) {
    var cols = p.columns || 4;
    return h('div', { className: 'apl apl-chipgrid', role: 'group', 'aria-label': p.label, style: { gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))' } },
      p.options.map(function (o) {
        return h(Chip, { key: String(o.value), numeric: p.numeric, selected: o.value === p.value, onClick: function () { p.onChange && p.onChange(o.value); } }, o.label);
      }));
  }

  function OptionPills(p) {
    return h('div', { className: 'apl apl-pills', role: 'group', 'aria-label': p.label },
      p.options.map(function (o) {
        return h('button', { key: String(o.value), type: 'button', className: 'apl-pill', 'aria-pressed': o.value === p.value, onClick: function () { p.onChange && p.onChange(o.value); } }, o.label);
      }));
  }

  function SegmentedControl(p) {
    return h('div', { className: 'apl apl-seg', role: 'group', 'aria-label': p.label, style: { gridTemplateColumns: 'repeat(' + p.options.length + ', minmax(0, 1fr))' } },
      p.options.map(function (o) {
        return h('button', { key: String(o.value), type: 'button', 'aria-pressed': o.value === p.value, onClick: function () { p.onChange && p.onChange(o.value); } }, o.label);
      }));
  }

  function Stepper(p) {
    var step = p.step || 1, min = p.min == null ? -Infinity : p.min, max = p.max == null ? Infinity : p.max;
    function set(v) { p.onChange && p.onChange(Math.max(min, Math.min(max, v))); }
    return h('div', { className: 'apl apl-stepper' },
      h('button', { type: 'button', 'aria-label': 'Decrease ' + (p.label || ''), disabled: p.value <= min, onClick: function () { set(p.value - step); } }, '−'),
      h('output', { 'aria-live': 'polite' }, p.value + (p.unit ? ' ' + p.unit : '')),
      h('button', { type: 'button', 'aria-label': 'Increase ' + (p.label || ''), disabled: p.value >= max, onClick: function () { set(p.value + step); } }, '+'));
  }

  function Badge(p) {
    return h('span', { className: cx('apl', 'apl-badge', p.tone === 'neutral' && 'apl-badge--neutral') }, p.children);
  }

  function RepeatCard(p) {
    return h('button', { type: 'button', className: 'apl apl-repeat', onClick: p.onClick },
      h('span', { className: 'apl-well' }, h(Icon, { name: p.icon || 'repeat' })),
      h('span', { className: 'apl-stack' }, h('span', { className: 'apl-t' }, p.title), h('span', { className: 'apl-cap13' }, p.summary)),
      h('span', { className: 'apl-link' }, p.actionLabel || 'Use'));
  }

  function FieldButton(p) {
    return h('button', { type: 'button', className: 'apl apl-field', onClick: p.onClick },
      p.icon ? h(Icon, { name: p.icon }) : null,
      h('span', { className: 'apl-stack' }, h('span', { className: 'apl-t' }, p.value), p.hint ? h('span', { className: 'apl-cap' }, p.hint) : null));
  }

  function SelectCard(p) {
    return h('button', { type: 'button', className: 'apl apl-select', 'aria-pressed': !!p.selected, onClick: p.onClick },
      h('span', { className: 'apl-radio' }, h('i')),
      h('span', { className: 'apl-stack' }, h('span', { className: 'apl-t' }, p.title), p.detail ? h('span', { className: 'apl-cap' }, p.detail) : null));
  }

  function AddButton(p) {
    return h('button', { type: 'button', className: 'apl apl-add', onClick: p.onClick }, h(Icon, { name: 'plus', size: 18 }), p.children);
  }

  var FACE_NAMES = { full: 'Full face', six: '10–6 rings', triple: 'Triple vertical', vegas: 'Vegas 3-spot' };
  var FACE_HINTS = { full: 'All 10 rings', six: 'Rings 6–10 only', triple: 'Three 10–6 spots, one arrow each', vegas: 'Triangle of three 10–6 spots' };
  var FACE_KINDS = { 40: ['full', 'six', 'triple', 'vegas'], 60: ['full', 'six'], 80: ['full', 'six'], 122: ['full'] };

  function spot(cx0, cy0, r, k) {
    return [
      h('circle', { key: k + 'b', className: 'blue', cx: cx0, cy: cy0, r: r }),
      h('circle', { key: k + 'r', className: 'red', cx: cx0, cy: cy0, r: r * 0.62 }),
      h('circle', { key: k + 'g', className: 'gold', cx: cx0, cy: cy0, r: r * 0.3 })
    ];
  }

  function TargetFace(p) {
    var kind = p.kind || 'full', size = p.size || 84, kids = [];
    if (kind === 'full') {
      var cls = ['wht', 'wht', 'blk', 'blk', 'blue', 'blue', 'red', 'red', 'gold', 'gold'];
      for (var i = 0; i < 10; i++) kids.push(h('circle', { key: i, className: cls[i] + ' ' + (cls[i] === 'blk' ? 'sepw' : 'sep'), cx: 50, cy: 50, r: 49 - i * 5 }));
    } else if (kind === 'six') {
      [['blue', 49], ['red', 39], ['red', 29], ['gold', 19], ['gold', 9]].forEach(function (c, i) { kids.push(h('circle', { key: i, className: c[0] + ' sep', cx: 50, cy: 50, r: c[1] })); });
    } else if (kind === 'triple') {
      kids = spot(50, 17, 16, 'a').concat(spot(50, 50, 16, 'b'), spot(50, 83, 16, 'c'));
    } else {
      kids = spot(29, 30, 20, 'a').concat(spot(71, 30, 20, 'b'), spot(50, 70, 20, 'c'));
    }
    return h('svg', { className: 'apl-face', width: size, height: size, viewBox: '0 0 100 100', role: 'img', 'aria-label': FACE_NAMES[kind] }, kids);
  }

  function FaceCard(p) {
    return h('div', { className: 'apl apl-facecard' },
      h('div', { className: 'apl-facebox' }, h(TargetFace, { kind: p.kind })),
      h('div', { className: 'apl-stack' },
        h('span', { className: 'apl-big' }, p.size + ' cm'),
        h('span', { className: 'apl-soft' }, FACE_NAMES[p.kind]),
        h('span', { className: 'apl-cap' }, FACE_HINTS[p.kind])));
  }

  function BottomBar(p) {
    return h('footer', { className: 'apl apl-bar' }, p.summary ? h('span', { className: 'apl-cap13' }, p.summary) : null, p.children);
  }

  function suggestFace(d) { return d <= 18 ? [40, 'triple'] : d <= 25 ? [60, 'full'] : d <= 30 ? [80, 'full'] : [122, 'full']; }

  function SessionSetup(p) {
    var last = p.lastSession || { distance: 18, size: 60, kind: 'six', arrows: 3, bow: 'recurve' };
    var bows = p.equipment || [{ id: 'recurve', name: 'Recurve', detail: '[Your bow · limbs · draw weight]' }, { id: 'none', name: 'No equipment', detail: 'Log without a bow setup' }];
    var st = React.useState({ distance: 18, size: 40, kind: 'triple', arrows: 3, bow: bows[0].id, suggested: true });
    var s = st[0], set = st[1];
    function upd(x) { set(Object.assign({}, s, x)); }
    function setDist(d) { var f = suggestFace(d); upd({ distance: d, size: f[0], kind: f[1], suggested: true }); }
    var shortKind = { full: '', six: ' 10–6', triple: ' triple', vegas: ' Vegas' };
    var bowName = (bows.filter(function (b) { return b.id === s.bow; })[0] || {}).name;
    var summary = s.distance + ' m · ' + s.size + ' cm' + shortKind[s.kind] + ' · ' + s.arrows + ' arrows/end' + (s.bow === 'none' ? '' : ' · ' + bowName);
    return h('div', { className: 'apl', style: { width: 390, height: 844, background: 'var(--ground)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 28, border: '1px solid var(--border-soft)' } },
      h(ScreenHeader, { title: 'New session', onBack: p.onBack || null }),
      h('div', { style: { flex: 1, overflowY: 'auto', padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' } },
        h(RepeatCard, { title: 'Same as last session', summary: '18 m · 60 cm 10–6 · 3 arrows · Recurve', onClick: function () { upd(Object.assign({}, last, { suggested: false })); } }),
        h(Section, { label: 'When' },
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' } },
            h(FieldButton, { icon: 'calendar', value: 'Today', hint: 'Sun, 15 Nov' }),
            h(FieldButton, { icon: 'clock', value: '18:18', hint: 'Now' }))),
        h(Section, { label: 'Distance', accessory: h(Stepper, { label: 'distance', value: s.distance, unit: 'm', min: 5, max: 90, onChange: setDist }) },
          h(ChipGrid, { label: 'Distance presets', value: s.distance, onChange: setDist, options: [18, 20, 25, 30, 50, 60, 70, 90].map(function (d) { return { value: d, label: d + ' m' }; }) })),
        h(Section, { label: 'Target face', accessory: s.suggested ? h(Badge, null, 'Suggested for ' + s.distance + ' m') : null },
          h(FaceCard, { size: s.size, kind: s.kind }),
          h(SegmentedControl, { label: 'Face size', value: s.size, onChange: function (v) { upd({ size: v, kind: FACE_KINDS[v].indexOf(s.kind) >= 0 ? s.kind : 'full', suggested: false }); }, options: [40, 60, 80, 122].map(function (v) { return { value: v, label: v + ' cm' }; }) }),
          h(OptionPills, { label: 'Face type', value: s.kind, onChange: function (v) { upd({ kind: v, suggested: false }); }, options: FACE_KINDS[s.size].map(function (k) { return { value: k, label: FACE_NAMES[k] }; }) })),
        h(Section, { label: 'Arrows per end' },
          h(ChipGrid, { label: 'Arrows per end', numeric: true, value: s.arrows, onChange: function (v) { upd({ arrows: v }); }, options: [3, 4, 5, 6].map(function (n) { return { value: n, label: String(n) }; }) })),
        h(Section, { label: 'Equipment' },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            bows.map(function (b) { return h(SelectCard, { key: b.id, title: b.name, detail: b.detail, selected: s.bow === b.id, onClick: function () { upd({ bow: b.id }); } }); }),
            h(AddButton, null, 'Add equipment')))),
      h(BottomBar, { summary: summary }, h(Button, { trailingIcon: 'arrowRight', onClick: function () { p.onStart && p.onStart(s); } }, 'Start session')));
  }

  window.APL = {
    Button: Button, IconButton: IconButton, Icon: Icon, ScreenHeader: ScreenHeader, Section: Section,
    Chip: Chip, ChipGrid: ChipGrid, OptionPills: OptionPills, SegmentedControl: SegmentedControl, Stepper: Stepper,
    Badge: Badge, RepeatCard: RepeatCard, FieldButton: FieldButton, SelectCard: SelectCard, AddButton: AddButton,
    TargetFace: TargetFace, FaceCard: FaceCard, BottomBar: BottomBar, SessionSetup: SessionSetup
  };
})();
