// Settings › Grades (#/settings/grades): the user's names and wording of the M and S grades
// (gradeTexts.js). The values 1–5 and their colours are fixed; only the words change. Edits save by
// themselves a moment after typing stops (no Save button) and update the page in place, so the
// field being typed in keeps its focus.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { confirmDialog } from './confirm.js';
import { gradeBadge } from './common.js';
import {
  GRADES,
  NAME_MAX,
  TEXT_MAX,
  defaultGradeText,
  defaultScaleName,
  gradeText,
  isDefault,
  resetScale,
  scaleName,
  setGradeText,
  setScaleName,
} from '../gradeTexts.js';

const SAVE_DELAY_MS = 400;

// the save waiting for typing to stop; leaving the page (or the app) saves it at once
let pending = null;
const flush = () => {
  const p = pending;
  pending = null;
  if (p) {
    clearTimeout(p.timer);
    p.save();
  }
};
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  window.addEventListener('hashchange', flush);
}

export function renderGrades(ctx) {
  flush();
  const scale = ctx.ui.get().gradeScale === 's' ? 's' : 'm';
  const letter = scale.toUpperCase();
  let texts = ctx.repo.getSettings().gradeTexts ?? null;
  const view = () => ({ gradeTexts: texts });

  const save = () => {
    clearTimeout(pending?.timer);
    pending = { timer: setTimeout(flush, SAVE_DELAY_MS), save: () => ctx.saveSettings({ gradeTexts: texts }) };
    refresh();
  };

  // ---- the parts that change while typing, updated in place
  const resetBtn = h(
    'button',
    { type: 'button', class: 'grades-reset', dataset: { fk: 'grades-reset' }, onClick: () => reset() },
    `Reset ${letter}`,
  );
  const tabs = APL.SegmentedControl({
    label: 'Grade scale',
    options: ['m', 's'].map((k) => ({ value: k, label: `${k.toUpperCase()} · ${scaleName(view(), k)}` })),
    value: scale,
    onChange: (k) => {
      if (k === scale) return;
      flush();
      ctx.ui.set({ gradeScale: k });
    },
    fk: 'grades-scale',
  });
  const tabOf = (k) => tabs.querySelector(`[data-fk="grades-scale-${k}"]`);

  const rows = GRADES.map((n) => {
    const area = h('textarea', {
      rows: 2,
      maxlength: TEXT_MAX,
      'aria-describedby': `grades-default-${n}`,
      value: gradeText(view(), scale, n),
      placeholder: defaultGradeText(scale, n),
      dataset: { fk: `grades-text-${n}` },
      onInput: (e) => {
        texts = setGradeText(texts, scale, n, e.target.value);
        save();
      },
    });
    const box = h('span', { class: 'apl-input apl-input--area grades-input' }, area);
    const def = h('span', { class: 'grades-default', id: `grades-default-${n}` });
    const count = h('span', { class: 'grades-count', 'aria-hidden': 'true' });
    const row = h(
      'div',
      { class: 'grades-row' },
      gradeBadge(n, 'grades-badge'),
      h(
        'div',
        { class: 'grades-field' },
        h('label', null, h('span', { class: 'sr-only' }, `${letter} grade ${n}, wording`), box),
        h('span', { class: 'grades-meta' }, def, count),
      ),
    );
    return { n, area, box, def, count, row };
  });

  const nameInput = h('input', {
    type: 'text',
    maxlength: NAME_MAX,
    autocomplete: 'off',
    value: scaleName(view(), scale),
    placeholder: defaultScaleName(scale),
    dataset: { fk: 'grades-name' },
    onInput: (e) => {
      texts = setScaleName(texts, scale, e.target.value);
      save();
    },
  });

  function refresh() {
    const v = view();
    resetBtn.disabled = isDefault(v, scale);
    for (const k of ['m', 's']) {
      const tab = tabOf(k);
      if (tab) tab.textContent = `${k.toUpperCase()} · ${scaleName(v, k)}`;
    }
    for (const r of rows) {
      const edited = !isDefault(v, scale, r.n);
      r.box.classList.toggle('is-edited', edited);
      r.def.textContent = edited ? `Default: “${defaultGradeText(scale, r.n)}”` : '';
      r.count.textContent = `${r.area.value.length}/${TEXT_MAX}`;
    }
  }

  async function reset() {
    const ok = await confirmDialog({
      title: `Reset the ${letter} grades?`,
      message: `The name and the 5 texts of the ${letter} scale go back to the defaults.`,
      confirmLabel: `Reset ${letter}`,
    });
    if (!ok) return;
    flush();
    texts = resetScale(ctx.repo.getSettings().gradeTexts ?? null, scale);
    ctx.saveSettings({ gradeTexts: texts });
    ctx.rerender();
  }

  refresh();

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Grades', onBack: () => ctx.navigate('settings'), backLabel: 'Back to settings', trailing: resetBtn }),
      h(
        'div',
        { class: 'apl-screen-body grades-body' },
        tabs,
        h(
          'label',
          { class: 'apl apl-textfield' },
          h('span', { class: 'apl-cap13' }, `Name of the ${letter} scale`),
          h('span', { class: 'apl-input' }, nameInput),
        ),
        h('p', { class: 'apl-cap13' }, 'Describe what each grade means to you. 1 is always the best, 5 the worst; the colours stay the same.'),
        h('div', { class: 'grades-rows' }, rows.map((r) => r.row)),
      ),
    ),
  };
}
