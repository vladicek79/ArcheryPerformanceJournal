// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import * as APL from '../public/js/ui/apl/index.js';

const opts = (...values) => values.map((v) => ({ value: v, label: String(v) }));
const pressed = (root) => [...root.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
/** Every button in `root` has an accessible name: its text or an aria-label. */
const allNamed = (root) =>
  [...root.querySelectorAll('button'), ...(root.matches?.('button') ? [root] : [])].every(
    (b) => b.getAttribute('aria-label') || b.textContent.trim(),
  );

describe('APL buttons', () => {
  it('Button: a real button, primary by default, secondary and danger variants', () => {
    const onClick = vi.fn();
    const b = APL.Button({ children: 'Start session', trailingIcon: 'arrowRight', onClick, fk: 'start' });
    expect(b.tagName).toBe('BUTTON');
    expect(b.type).toBe('button');
    expect(b.className).toBe('apl apl-btn');
    expect(b.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(b.dataset.fk).toBe('start');
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(APL.Button({ children: 'x', variant: 'secondary' }).classList.contains('apl-btn--secondary')).toBe(
      true,
    );
    expect(APL.Button({ children: 'x', variant: 'danger' }).classList.contains('apl-btn--danger')).toBe(true);
  });

  it('Button: disabled, leading icon and aria-label', () => {
    const b = APL.Button({
      children: 'Previous',
      leadingIcon: 'back',
      label: 'Previous end',
      disabled: true,
    });
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('Previous end');
    expect(b.firstChild.tagName.toLowerCase()).toBe('svg');
  });

  it('IconButton always carries its label as aria-label', () => {
    const b = APL.IconButton({ icon: 'back', label: 'Back' });
    expect(b.getAttribute('aria-label')).toBe('Back');
    expect(b.textContent).toBe('');
  });

  it('AddButton shows a plus icon before its text', () => {
    const b = APL.AddButton({ children: 'Add equipment' });
    expect(b.className).toBe('apl apl-add');
    expect(b.textContent).toBe('Add equipment');
    expect(b.querySelector('svg')).not.toBeNull();
  });
});

describe('APL choices', () => {
  it('ChipGrid: one chip pressed, columns as a custom property, change reports the value', () => {
    const onChange = vi.fn();
    const g = APL.ChipGrid({
      label: 'Distance',
      options: opts(18, 25, 30),
      value: 25,
      onChange,
      columns: 3,
      fk: 'dist',
    });
    expect(g.getAttribute('role')).toBe('group');
    expect(g.getAttribute('aria-label')).toBe('Distance');
    expect(g.style.getPropertyValue('--apl-cols')).toBe('3');
    expect(pressed(g)).toEqual(['25']);
    expect([...g.querySelectorAll('button')].map((b) => b.dataset.fk)).toEqual([
      'dist-18',
      'dist-25',
      'dist-30',
    ]);
    g.querySelector('[data-fk="dist-30"]').click();
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('ChipGrid numeric chips get the count style', () => {
    const g = APL.ChipGrid({ label: 'Arrows', options: opts(3, 4), value: 3, numeric: true });
    expect([...g.querySelectorAll('.apl-chip--num')]).toHaveLength(2);
  });

  it('OptionPills: single choice, and several with `multiple`', () => {
    const single = APL.OptionPills({ label: 'Face type', options: opts('full', 'six'), value: 'six' });
    expect(pressed(single)).toEqual(['six']);
    const onChange = vi.fn();
    const multi = APL.OptionPills({
      label: 'Practised',
      options: opts('a', 'b', 'c'),
      value: ['a', 'c'],
      multiple: true,
      onChange,
    });
    expect(pressed(multi)).toEqual(['a', 'c']);
    multi.querySelectorAll('button')[1].click();
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('SegmentedControl: one pressed segment, a column per option', () => {
    const s = APL.SegmentedControl({ label: 'Face size', options: opts(40, 60, 80, 122), value: 60 });
    expect(s.style.getPropertyValue('--apl-cols')).toBe('4');
    expect(pressed(s)).toEqual(['60']);
  });

  it('Stepper clamps to min / max and disables the end buttons there', () => {
    const onChange = vi.fn();
    const s = APL.Stepper({ label: 'arrows per end', value: 12, min: 1, max: 12, onChange, fk: 'n' });
    const [minus, plus] = s.querySelectorAll('button');
    expect(minus.getAttribute('aria-label')).toBe('Decrease arrows per end');
    expect(plus.disabled).toBe(true);
    expect(s.querySelector('output').textContent).toBe('12');
    minus.click();
    expect(onChange).toHaveBeenCalledWith(11);
    const low = APL.Stepper({ value: 1, min: 1, max: 12, unit: 'm', display: '18 m' });
    expect(low.querySelectorAll('button')[0].disabled).toBe(true);
    expect(low.querySelector('output').textContent).toBe('18 m');
  });

  it('SelectCard: radio-style card with aria-pressed', () => {
    const c = APL.SelectCard({ title: 'Recurve', detail: 'Saved 12 Nov 2026', selected: true });
    expect(c.getAttribute('aria-pressed')).toBe('true');
    expect(c.querySelector('.apl-radio')).not.toBeNull();
    expect(c.textContent).toContain('Saved 12 Nov 2026');
    expect(APL.SelectCard({ title: 'None' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('RepeatCard: title, summary and the "Use" action', () => {
    const c = APL.RepeatCard({ title: 'Same as last session', summary: '18 m · 40 cm triple' });
    expect(c.tagName).toBe('BUTTON');
    expect(c.querySelector('.apl-link').textContent).toBe('Use');
  });
});

describe('APL layout and display', () => {
  it('ScreenHeader shows a back button only with onBack', () => {
    const onBack = vi.fn();
    const withBack = APL.ScreenHeader({ title: 'New session', onBack, backLabel: 'Back to dashboard' });
    const back = withBack.querySelector('button');
    expect(back.getAttribute('aria-label')).toBe('Back to dashboard');
    back.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(withBack.querySelector('h1').textContent).toBe('New session');
    expect(APL.ScreenHeader({ title: 'Sessions' }).querySelector('button')).toBeNull();
  });

  it('Section labels itself with its heading', () => {
    const s = APL.Section({ label: 'Distance', id: 'dist', accessory: APL.Badge({ children: 'Suggested' }) });
    expect(s.getAttribute('aria-labelledby')).toBe('dist-label');
    expect(s.querySelector('#dist-label').textContent).toBe('Distance');
    expect(s.querySelector('.apl-badge')).not.toBeNull();
  });

  it('Badge: accent by default, neutral on request', () => {
    expect(APL.Badge({ children: 'Suggested' }).className).toBe('apl apl-badge');
    expect(
      APL.Badge({ children: 'Training', tone: 'neutral' }).classList.contains('apl-badge--neutral'),
    ).toBe(true);
  });

  it('TargetFace draws each kind, named for screen readers', () => {
    const count = (kind) => APL.TargetFace({ kind }).querySelectorAll('circle').length;
    expect(count('full')).toBe(10);
    expect(count('six')).toBe(5);
    expect(count('triple')).toBe(9);
    expect(count('vegas')).toBe(9);
    expect(APL.TargetFace({ kind: 'vegas' }).getAttribute('aria-label')).toBe('Vegas 3-spot');
  });

  it('FaceCard shows size, kind and hint', () => {
    const c = APL.FaceCard({ size: 40, kind: 'triple' });
    expect(c.textContent).toContain('40 cm');
    expect(c.textContent).toContain('Triple vertical');
  });

  it('FieldButton: value over hint with a leading icon', () => {
    const f = APL.FieldButton({ icon: 'calendar', value: 'Today', hint: 'Sun 15 Nov' });
    expect(f.querySelector('.apl-t').textContent).toBe('Today');
    expect(f.querySelector('.apl-cap').textContent).toBe('Sun 15 Nov');
  });

  it('BottomBar: summary announced politely above its button', () => {
    const b = APL.BottomBar({ summary: '18 m · 40 cm', children: APL.Button({ children: 'Start session' }) });
    expect(b.tagName).toBe('FOOTER');
    expect(b.querySelector('[aria-live="polite"]').textContent).toBe('18 m · 40 cm');
  });

  it('StatTiles: a description list of label / value pairs', () => {
    const t = APL.StatTiles({
      label: 'Figures',
      items: [
        ['Total', '541'],
        ['Avg arrow', '9.02'],
      ],
    });
    expect(t.tagName).toBe('DL');
    expect([...t.querySelectorAll('dt')].map((e) => e.textContent)).toEqual(['Total', 'Avg arrow']);
    expect([...t.querySelectorAll('dd')].map((e) => e.textContent)).toEqual(['541', '9.02']);
  });

  it('DataTable: a focusable scrolling region, column classes, aria-sort and row props', () => {
    const onClick = vi.fn();
    const t = APL.DataTable({
      label: 'Ends',
      columns: [{ label: 'End' }, { label: 'Score', align: 'end', sort: 'descending' }],
      rows: [
        ['1', '28'],
        ['2', '27'],
      ],
      rowProps: (i) => ({ dataset: { row: String(i) }, onClick }),
    });
    expect(t.getAttribute('role')).toBe('region');
    expect(t.getAttribute('tabindex')).toBe('0');
    expect(t.querySelectorAll('th')[1].getAttribute('aria-sort')).toBe('descending');
    expect(t.querySelectorAll('tbody tr td')[1].classList.contains('is-end')).toBe(true);
    t.querySelector('[data-row="1"]').click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('SessionRow: a link with score and figures; the maximum is optional; actions at the bottom', () => {
    const r = APL.SessionRow({
      href: '#/history/1',
      when: 'Sun 15 Nov 2026',
      type: 'Training',
      summary: '18 m',
      score: { total: 541, max: 600 },
      stats: [['M', '1.8']],
    });
    expect(r.tagName).toBe('A');
    expect(r.querySelector('.apl-badge--neutral').textContent).toBe('Training');
    expect(r.querySelector('.apl-sessionrow-max').textContent).toBe(' / 600');
    const plain = APL.SessionRow({
      when: 'Cup',
      score: { total: 540 },
      actions: APL.Button({ children: 'Delete' }),
    });
    expect(plain.tagName).toBe('DIV');
    expect(plain.querySelector('.apl-sessionrow-max')).toBeNull();
    expect(plain.querySelector('.apl-sessionrow-actions button')).not.toBeNull();
  });
});

describe('APL fields and timer', () => {
  it('TextField: a label around the input, with an optional unit and a hidden label', () => {
    const onInput = vi.fn();
    const f = APL.TextField({
      label: 'Duration',
      type: 'number',
      suffix: 'min',
      value: 45,
      fk: 'minutes',
      onInput,
    });
    expect(f.tagName).toBe('LABEL');
    const input = f.querySelector('input');
    expect(input.type).toBe('number');
    expect(input.value).toBe('45');
    expect(input.dataset.fk).toBe('minutes');
    expect(f.querySelector('.apl-input-suffix').textContent).toBe('min');
    input.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenCalledOnce();
    const hidden = APL.TextField({ label: 'Elevation for 18 m', hideLabel: true });
    expect(hidden.querySelector('.sr-only').textContent).toBe('Elevation for 18 m');
  });

  it('TextArea keeps its value and rows', () => {
    const t = APL.TextArea({ label: 'Note', value: 'calm', rows: 6 });
    const area = t.querySelector('textarea');
    expect(area.value).toBe('calm');
    expect(area.getAttribute('rows')).toBe('6');
  });

  it('TimerButton: pause / resume label, the ticker data and the paused state', () => {
    const running = APL.TimerButton({
      running: true,
      text: '0:42',
      elapsedMs: 1000,
      startedAt: '2026-11-15T18:00:00Z',
      size: 'lg',
    });
    expect(running.getAttribute('aria-label')).toBe('Pause the session timer');
    expect(running.classList.contains('apl-timer--lg')).toBe(true);
    const value = running.querySelector('.timer-value');
    expect(value.dataset.started).toBe('2026-11-15T18:00:00Z');
    expect(value.dataset.elapsed).toBe('1000');
    const paused = APL.TimerButton({ running: false, text: '0:42' });
    expect(paused.getAttribute('aria-label')).toBe('Resume the session timer');
    expect(paused.classList.contains('is-paused')).toBe(true);
    expect(paused.querySelector('.timer-value').dataset.started).toBe('');
  });
});

describe('APL navigation and status', () => {
  it('TabBar marks the current tab and carries data-tab ids', () => {
    const t = APL.TabBar({
      label: 'Sections',
      items: [
        { id: 'home', label: 'Dashboard', icon: 'target', href: '#/home', current: true },
        { id: 'history', label: 'History', icon: 'calendar', href: '#/history' },
      ],
    });
    expect(t.tagName).toBe('NAV');
    expect(t.style.getPropertyValue('--apl-cols')).toBe('2');
    expect(t.querySelector('[data-tab="home"]').getAttribute('aria-current')).toBe('page');
    expect(t.querySelector('[data-tab="history"]').hasAttribute('aria-current')).toBe(false);
  });

  it('NavRow is a link with href, a button otherwise', () => {
    expect(APL.NavRow({ href: '#/gear', title: 'Equipment' }).tagName).toBe('A');
    expect(APL.NavRow({ href: '#/gear', title: 'Equipment' }).hasAttribute('target')).toBe(false);
    const out = APL.NavRow({ href: 'https://ko-fi.com/x', newTab: true, title: 'Coffee' });
    expect(out.target).toBe('_blank');
    expect(out.rel).toBe('noopener noreferrer');
    const onClick = vi.fn();
    const b = APL.NavRow({ title: 'Grades', onClick });
    expect(b.tagName).toBe('BUTTON');
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('Banner: a status strip with an action, or a whole link with a cue', () => {
    const onClick = vi.fn();
    const s = APL.Banner({ title: 'New version available', action: { label: 'Reload', onClick } });
    expect(s.getAttribute('role')).toBe('status');
    s.querySelector('button').click();
    expect(onClick).toHaveBeenCalledOnce();
    const link = APL.Banner({
      href: '#/log',
      tone: 'accent',
      indicator: 'paused',
      title: 'Training running',
      action: { label: 'Continue' },
    });
    expect(link.tagName).toBe('A');
    expect(link.querySelector('a')).toBeNull(); // no link inside the link
    expect(link.querySelector('.apl-banner-dot.is-paused')).not.toBeNull();
  });

  it('Toast holds its message', () => {
    expect(APL.Toast({ message: 'Backup merged.' }).textContent).toBe('Backup merged.');
  });
});

describe('APL keypads', () => {
  it('ScoreKeypad: zone per key, the value pressed, the clear key hidden while it does not apply', () => {
    const onKey = vi.fn();
    const k = APL.ScoreKeypad({
      label: 'Quick score',
      keys: [
        { value: 'X', zone: 'gold', ariaLabel: 'Score X' },
        { value: 8, zone: 'red', ariaLabel: 'Score 8' },
      ],
      value: 8,
      onKey,
      clear: { enabled: false, label: 'Clear arrow 1' },
    });
    expect(k.style.getPropertyValue('--apl-cols')).toBe('3');
    expect([...k.querySelectorAll('[data-zone]')].map((b) => b.dataset.zone)).toEqual(['gold', 'red']);
    expect(pressed(k)).toEqual(['8']);
    const clear = k.querySelector('.apl-key--clear');
    expect(clear.disabled).toBe(true);
    expect(clear.getAttribute('aria-hidden')).toBe('true');
    expect(clear.getAttribute('tabindex')).toBe('-1');
    k.querySelector('[data-zone="gold"]').click();
    expect(onKey).toHaveBeenCalledWith('X');
  });

  it('GradeKeys: five keys in the grade colours, the chosen one pressed', () => {
    const onChange = vi.fn();
    const g = APL.GradeKeys({
      label: 'Mental program',
      rowLabel: 'M',
      value: 2,
      onChange,
      keyLabel: (n) => `Mental ${n}`,
    });
    const keys = [...g.querySelectorAll('button')];
    expect(keys.map((b) => b.dataset.grade)).toEqual(['1', '2', '3', '4', '5']);
    expect(keys[1].getAttribute('aria-pressed')).toBe('true');
    expect(keys[4].getAttribute('aria-label')).toBe('Mental 5');
    keys[4].click();
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe('APL Dialog', () => {
  it('a centred dialog names itself by its title and describes itself by its message', () => {
    const d = APL.Dialog({
      title: 'Delete session?',
      message: 'This cannot be undone.',
      tone: 'danger',
      icon: 'close',
      idPrefix: 'confirm',
      actions: [
        APL.Button({ children: 'Cancel', variant: 'secondary' }),
        APL.Button({ children: 'Delete', variant: 'danger' }),
      ],
    });
    expect(d.tagName).toBe('DIALOG');
    expect(d.classList.contains('apl-dialog--danger')).toBe(true);
    expect(d.getAttribute('aria-labelledby')).toBe('confirm-title');
    expect(d.querySelector('#confirm-title').textContent).toBe('Delete session?');
    expect(d.getAttribute('aria-describedby')).toBe('confirm-msg');
    expect(d.querySelectorAll('.apl-dialog-actions button')).toHaveLength(2);
  });

  it('bare: only the body and the actions, the title as its aria-label', () => {
    const d = APL.Dialog({
      title: 'Found arrows: 10, 9',
      bare: true,
      body: document.createElement('canvas'),
    });
    expect(d.getAttribute('aria-label')).toBe('Found arrows: 10, 9');
    expect(d.querySelector('h2')).toBeNull();
    expect(d.querySelector('.apl-dialog-body canvas')).not.toBeNull();
  });

  it('sheet: a modal region with a close button that gets the focus first', () => {
    const onClose = vi.fn();
    const s = APL.Dialog({
      sheet: true,
      title: 'Grading guide',
      idPrefix: 'guide',
      onClose,
      closeLabel: 'Close grading guide',
    });
    expect(s.getAttribute('role')).toBe('dialog');
    expect(s.getAttribute('aria-modal')).toBe('true');
    const close = s.querySelector('[data-autofocus]');
    expect(close.getAttribute('aria-label')).toBe('Close grading guide');
    close.click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('APL accessibility', () => {
  it('every button the components draw has an accessible name', () => {
    const parts = [
      APL.IconButton({ icon: 'plus', label: 'Add' }),
      APL.Stepper({ label: 'distance', value: 18 }),
      APL.ScreenHeader({ title: 'x', onBack: () => {} }),
      APL.ScoreKeypad({
        label: 'k',
        keys: [{ value: 9, zone: 'gold', ariaLabel: 'Score 9' }],
        clear: { enabled: true, label: 'Clear' },
      }),
      APL.TimerButton({ running: true, text: '0:01' }),
      APL.Dialog({ sheet: true, title: 'g', onClose: () => {} }),
    ];
    for (const p of parts) expect(allNamed(p)).toBe(true);
  });
});
