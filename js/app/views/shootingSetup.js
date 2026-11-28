// New session, step 1 (what you do) and the Shooting page: training, competition and blank bale
// behind one switch. Every field starts from the last session of the kind shown (lastSetup.js);
// nothing starts until Start is tapped.
import { h } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { T } from '../strings.js';
import { icons } from '../icons.js';
import { lastSetupOf, SHOOTING_KINDS, ARROW_GOALS } from '../lastSetup.js';
import {
  ARROWS_PER_END_MIN,
  ARROWS_PER_END_MAX,
  isMultiSpot,
  spotLayout,
  spotOrderOf,
  isDefaultSpotOrder,
  spotOrderLabel,
} from '../scoring.js';
import { spotOrderEditor } from './spotOrder.js';
import {
  TYPE_LABELS,
  setupSummary,
  emptyCompetition,
  CONDITIONS,
  parseConditions,
  joinConditions,
  toggleCondition,
  emptyFields,
  BOW_LABELS,
} from '../sessionTypes.js';
import {
  ROUND_GROUPS,
  roundsOf,
  roundByName,
  roundPlan,
  roundBowType,
  faceChoices,
  planLines,
  roundHint,
  roundTotals,
  prescribedSpotOrder,
} from '../rounds.js';
import { faceLabel } from '../scoring.js';
import { setupState, whenSection, equipmentSection } from './sessionSetup.js';
import { formSections } from './sessionForms.js';
import {
  FACE_GROUPS,
  FACE_STANDARDS,
  isFaceStandard,
  inFaceStandard,
  sizesFor,
  sizeForStandard,
  DISTANCE_MIN,
  DISTANCE_MAX,
  nextDistance,
  snapDistance,
  facesForSize,
  typeForSize,
  faceIdOf,
  pickOf,
  isInnerTen,
  pickLabel,
  arrowsPerEndFor,
} from './setupFaces.js';


export const KIND_LABELS = { training: 'Training', competition: 'Competition', blank: 'Blank bale' };
const START_LABELS = { training: 'Start training', competition: 'Start competition', blank: 'Start blank bale' };

// ---------------------------------------------------------------- step 1

/**
 * A card of step 1: an icon well, the title and its line, a chevron; `extra` below. `big`: the
 * highlighted card; `choice`: a card of a choice page (big text on the plain surface), `accent` its
 * well in the accent colours.
 */
function typeCard({ href, icon, title, detail, fk, extra = null, big = false, choice = false, accent = false }) {
  return h(
    'a',
    { href, class: ['ns-type', big && 'ns-type--big', choice && 'ns-type--choice'], dataset: { fk } },
    h(
      'span',
      { class: 'ns-type-row' },
      h('span', { class: ['ns-type-well', accent && 'ns-type-well--accent'], 'aria-hidden': 'true' }, icon),
      h(
        'span',
        { class: 'ns-type-text' },
        h('span', { class: 'ns-type-title' }, title),
        h('span', { class: 'ns-type-detail' }, detail),
      ),
      h('span', { class: 'ns-type-go', 'aria-hidden': 'true' }, icons.chevron()),
    ),
    extra,
  );
}

/**
 * Strength (#/new/strength-choice): SPT (its own page, #/new/strength) or Gym (#/new/gym). Opening
 * this page starts nothing.
 */
export function renderStrengthChoice(ctx) {
  const tags = (list) => h('span', { class: 'ns-type-tags' }, list.map((t) => h('span', { class: 'ns-type-tag' }, t)));
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'Strength', onBack: () => ctx.navigate('new'), backLabel: 'Back to session type' }),
      h(
        'nav',
        { class: 'apl-screen-body ns-types', 'aria-label': 'Strength session' },
        typeCard({
          href: '#/new/strength',
          icon: APL.Icon({ name: 'stopwatch', size: 24 }),
          title: TYPE_LABELS.strength,
          detail: 'Archery-specific strength with the bow',
          fk: 'strength-spt',
          extra: tags(['SPT holds', 'Draws with bow', 'Band draws', 'Interval timer']),
          choice: true,
          accent: true,
        }),
        typeCard({
          href: '#/new/gym',
          icon: icons.dumbbell(24),
          title: TYPE_LABELS.gym,
          detail: 'Exercises, sets and reps — or just a note',
          fk: 'strength-gym',
          extra: tags(['Upper body', 'Core', 'Cardio', 'Mobility']),
          choice: true,
        }),
      ),
    ),
  };
}

/**
 * Step 1: Shooting (training, competition, blank bale on one card), Strength (SPT or gym), Mental
 * and, for a session that is already over, Log afterwards (the manual type).
 */
export function renderTypeChoice(ctx) {
  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({ title: 'New session', onBack: () => ctx.navigate('home'), backLabel: 'Back to dashboard' }),
      h(
        'nav',
        { class: 'apl-screen-body ns-types', 'aria-label': 'Session type' },
        typeCard({
          href: '#/new/shooting/training',
          icon: APL.Icon({ name: 'target', size: 26 }),
          title: 'Shooting',
          detail: 'Arrows at the target or the bale',
          fk: 'type-shooting',
          big: true,
          extra: h(
            'span',
            { class: 'ns-type-tags' },
            SHOOTING_KINDS.map((k) => h('span', { class: 'ns-type-tag' }, KIND_LABELS[k])),
          ),
        }),
        typeCard({
          href: '#/new/strength-choice',
          icon: icons.dumbbell(),
          title: 'Strength',
          detail: 'SPT drills or a gym workout',
          fk: 'type-strength',
        }),
        typeCard({
          href: '#/new/mental',
          icon: icons.mental(),
          title: TYPE_LABELS.mental,
          detail: 'Visualisation, breathing, shot routine',
          fk: 'type-mental',
        }),
        h('div', { class: 'ns-divider' }, h('span', null, 'Already done?')),
        h(
          'a',
          { href: '#/new/manual', class: 'ns-later', dataset: { fk: 'type-manual' } },
          h('span', { class: 'ns-later-icon', 'aria-hidden': 'true' }, icons.pencil()),
          h(
            'span',
            { class: 'ns-type-text' },
            h('span', { class: 'ns-type-title ns-type-title--sm' }, 'Log afterwards'),
            h('span', { class: 'ns-type-detail' }, 'Type in arrows or duration — no timer'),
          ),
        ),
      ),
    ),
  };
}

// ---------------------------------------------------------------- the Shooting page

/** A kind's fields as the last session of that kind left them. */
function fromLast(settings, kind) {
  const last = lastSetupOf(settings, kind);
  if (kind === 'blank') return { goal: last.goal };
  // the face as the picker has it: one no longer offered takes its replacement (the 80 cm 10–6 → the
  // WA 6-ring face), a size the catalogue does not list falls back to the type's first size
  const pick = pickOf(last.face, last.bowType);
  const fields = {
    distance: Math.max(DISTANCE_MIN, Math.min(DISTANCE_MAX, last.distance)),
    distanceUnit: last.distanceUnit === 'yd' ? 'yd' : 'm',
    face: faceIdOf(pick),
    bowType: pick.bowType,
    // the standard the face picker was last limited to
    faceStandard: last.faceStandard,
    arrowsPerEnd: last.arrowsPerEnd,
    grading: last.grading,
    spotOrders: last.spotOrders || {},
  };
  if (kind !== 'competition') return fields;
  // the event is new every time; the round and the conditions are usually the same as last time
  const round = last.round || '';
  return {
    ...fields,
    // a round's face choice (the indoor triple, triangular or single face) is the face it last started on
    roundFace: last.face,
    // a WA field round's units (marked, unmarked or one of each), as last time
    roundVariant: last.roundVariant || null,
    startTarget: 0,
    competition: { event: '', round, conditions: last.conditions || '', otherRound: !!round && !roundByName(round) },
  };
}

/** The catalogue round a competition's fields are shot to (null: none picked, or one typed in). */
export const roundOfFields = (fields) =>
  fields.competition && !fields.competition.otherRound ? roundByName(fields.competition.round) : null;

/** What a session shot to the fields' round follows (rounds.js roundPlan), or null. */
export function planOfFields(fields) {
  const round = roundOfFields(fields);
  return round ? roundPlan(round, { bowType: fields.bowType, face: fields.roundFace, variant: fields.roundVariant }) : null;
}

/** The tabs Training | Competition | Blank bale; switching replaces the page in the history. */
function kindTabs(ctx, kind) {
  const go = (k) => k !== kind && ctx.navigate(`new/shooting/${k}`, { replace: true });
  const onKeydown = (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = SHOOTING_KINDS.length;
    const next = SHOOTING_KINDS[(SHOOTING_KINDS.indexOf(kind) + step + n) % n];
    // the new tab takes the focus first, so it keeps it when the page is drawn again
    e.currentTarget.querySelector(`[data-fk="kind-${next}"]`)?.focus();
    go(next);
  };
  return h(
    'div',
    {
      class: 'apl apl-seg ns-kinds',
      role: 'tablist',
      'aria-label': 'Kind of shooting',
      style: { '--apl-cols': String(SHOOTING_KINDS.length) },
      onKeydown,
    },
    SHOOTING_KINDS.map((k) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `kind-${k}`,
          'aria-selected': String(k === kind),
          'aria-controls': 'shooting-panel',
          tabindex: k === kind ? '0' : '-1',
          dataset: { fk: `kind-${k}` },
          onClick: () => go(k),
        },
        KIND_LABELS[k],
      ),
    ),
  );
}

/** Competition: the event, the round (chips or Other) and the conditions (chips, plus older text). */
function competitionSection(fields, { setKind, quietKind }) {
  const comp = fields.competition;
  const setComp = (patch) => setKind({ competition: { ...comp, ...patch } });
  const typed = (patch) => quietKind({ competition: Object.assign(comp, patch) });
  const { chips, rest } = parseConditions(comp.conditions);
  const roundValue = comp.otherRound ? 'Other' : roundByName(comp.round) ? comp.round : '';
  // tapping the chosen round again clears it; a round for one bow type sets it
  const pickRound = (r) => {
    if (r === roundValue) return setComp({ round: '', otherRound: false });
    if (r === 'Other') return setComp({ round: '', otherRound: true });
    const round = roundByName(r);
    setKind({ competition: { ...comp, round: r, otherRound: false }, startTarget: 0, ...(round?.bowType ? { bowType: round.bowType } : {}) });
  };
  // the rounds by group (WA outdoor, WA indoor, WA field, IFAA), then Other
  const groups = ROUND_GROUPS.map((g) => ({ g, list: roundsOf(g.id) })).filter((x) => x.list.length);
  return APL.Section({
    label: 'Competition',
    id: 'setup-comp',
    children: [
      APL.TextField({
        label: 'Event',
        placeholder: 'e.g. Indoor Cup Bratislava',
        value: comp.event,
        fk: 'comp-event',
        onInput: (e) => typed({ event: e.target.value }),
      }),
      h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Round'),
      ...groups.flatMap(({ g, list }, i) => [
        h('span', { class: 'ns-sublabel ns-sublabel-soft', 'aria-hidden': 'true' }, g.label),
        APL.OptionPills({
          label: `Round: ${g.label}`,
          value: roundValue,
          options: [...list.map((r) => ({ value: r.name, label: r.name })), ...(i === groups.length - 1 ? [{ value: 'Other', label: 'Other' }] : [])],
          onChange: pickRound,
          fk: `comp-round-${g.id}`,
        }),
      ]),
      comp.otherRound
        ? APL.TextField({
            label: 'Other round',
            placeholder: 'e.g. Indoor 2 × 30',
            value: comp.round,
            fk: 'comp-round-text',
            onInput: (e) => typed({ round: e.target.value }),
          })
        : null,
      h('span', { class: 'ns-sublabel', 'aria-hidden': 'true' }, 'Conditions ', h('span', { class: 'ns-sublabel-soft' }, '· pick any')),
      APL.OptionPills({
        label: 'Conditions',
        multiple: true,
        value: chips,
        options: CONDITIONS.map((c) => ({ value: c, label: c })),
        onChange: (c) =>
          setComp({ conditions: toggleCondition(comp.conditions, c) }),
        fk: 'comp-cond',
      }),
      // conditions typed before the chips existed stay editable as text
      rest
        ? APL.TextField({
            label: 'Other conditions',
            value: rest,
            fk: 'comp-cond-text',
            onInput: (e) => typed({ conditions: joinConditions(chips, e.target.value) }),
          })
        : null,
    ],
  });
}

/** The pick of the face picker ({ faceType, faceSize, bowType }) a kind's fields stand for. */
const pickFromFields = (fields) => pickOf(fields.face, fields.bowType);

/** "18 m", "20 yd". */
const distanceText = (fields) => `${fields.distance} ${fields.distanceUnit === 'yd' ? 'yd' : 'm'}`;

/** "18 m · 40 cm · WA vertical triple · 3 arrows/end · Recurve": the bottom bar's summary. */
export const scoredSummary = (fields) => {
  const plan = planOfFields(fields);
  if (plan) return [plan.name, `${roundTotals(plan).arrows} arrows`, BOW_LABELS[plan.bowType]].join(' · ');
  const p = pickFromFields(fields);
  return [distanceText(fields), pickLabel(p), `${fields.arrowsPerEnd} arrows/end`, BOW_LABELS[p.bowType]].join(' · ');
};

/**
 * The standard the face picker opens limited to: the one remembered with the setup while the face
 * belongs to it, else all.
 */
const standardFromFields = (fields, pick) =>
  isFaceStandard(fields.faceStandard) && inFaceStandard(pick.faceType, fields.faceStandard)
    ? fields.faceStandard
    : 'all';

/**
 * Distance (− / + through the standard distances, m / yd), Target face (one card that opens the face
 * picker), the spot order of a triple or Vegas sheet, and arrows per end of a scored kind (its
 * grading is under When).
 */
function scoredSections(fields, setKind, openPicker) {
  const p = pickFromFields(fields);
  const unit = fields.distanceUnit === 'yd' ? 'yd' : 'm';
  return [
    APL.Section({
      label: T.distance,
      id: 'setup-dist',
      children: h(
        'div',
        { class: 'apl-distrow' },
        // m / yd: the number is never converted, only moved to the new unit's nearest standard
        APL.SegmentedControl({
          label: 'Distance unit',
          value: unit,
          options: [
            { value: 'm', label: 'm' },
            { value: 'yd', label: 'yd' },
          ],
          onChange: (u) => u !== unit && setKind({ distanceUnit: u, distance: snapDistance(u, fields.distance) }),
          fk: 'dist-unit',
        }),
        // − / + step through the unit's standard distances only
        APL.Stepper({
          label: 'distance',
          value: fields.distance,
          unit,
          next: (d, dir) => nextDistance(unit, d, dir),
          onChange: (d) => setKind({ distance: d }),
          fk: 'dist',
        }),
      ),
    }),
    APL.Section({
      label: T.targetFace,
      id: 'setup-face',
      children: APL.FaceCard({
        kind: p.faceType,
        size: p.faceSize,
        inner10: isInnerTen(p),
        // the drawing names the face; the bow type goes under the size
        meta: BOW_LABELS[p.bowType],
        label: `Target face: ${pickLabel(p)}, ${BOW_LABELS[p.bowType]}. Change`,
        onClick: openPicker,
        fk: 'face-card',
      }),
    }),
    // triple / Vegas: the order the spots are shot in (the default always first and named so)
    isMultiSpot(fields.face)
      ? APL.Section({ label: 'Spot order', id: 'setup-spot-order', children: spotOrderPicker(fields, setKind) })
      : null,
    APL.Section({
      label: T.arrowsPerEnd,
      id: 'setup-n',
      children: APL.Slider({
        label: 'Arrows per end',
        value: fields.arrowsPerEnd,
        min: ARROWS_PER_END_MIN,
        max: ARROWS_PER_END_MAX,
        onChange: (n) => setKind({ arrowsPerEnd: n }),
        fk: 'n',
      }),
    }),
  ];
}

/**
 * The "Target face" sheet: the standard (All, WA, NFAA, IFAA) that limits the sizes and faces shown,
 * the face size, the bow type and the faces that come in that size, grouped Regular / Field /
 * Hunter / 3D. It edits `draft` ({ standard, faceType, faceSize, bowType }, a copy taken when it
 * opened); Done saves it, the X, the scrim and Escape close it without saving. A new bow type keeps
 * the face; a size or a standard the face does not come in moves it to the first face that does.
 */
function facePickerSheet(draft, { setDraft, onDone, onClose }) {
  const { standard } = draft;
  const is3d = draft.faceType === 'animal';
  const size = sizeForStandard(standard, draft.faceSize ?? 40);
  const setSize = (v) => setDraft({ faceSize: v, faceType: typeForSize(is3d ? 'full' : draft.faceType, v, standard) });
  const setStandard = (std) => {
    // 3D stays picked where the standard has it; otherwise the face follows the size
    if (is3d && inFaceStandard('animal', std)) return setDraft({ standard: std });
    const v = sizeForStandard(std, draft.faceSize ?? 40);
    setDraft({ standard: std, faceSize: v, faceType: typeForSize(is3d ? 'full' : draft.faceType, v, std) });
  };
  // 3D has no size: picking it keeps the last size for when a sized face is picked again
  const pickFace = (type) => setDraft({ faceType: type, faceSize: size });
  const sizes = sizesFor(standard);
  return {
    onClose,
    returnFk: 'face-card',
    node: APL.Dialog({
      sheet: true,
      sheetClass: 'apl-dialog--rise',
      title: T.targetFace,
      idPrefix: 'face-picker',
      onClose,
      closeLabel: 'Close without saving',
      // what Done saves, kept up to date with every choice in the sheet
      footer: [
        h(
          'p',
          { class: 'apl-sheet-summary', 'aria-live': 'polite', dataset: { fk: 'face-summary' } },
          [pickLabel({ ...draft, faceSize: size }), BOW_LABELS[draft.bowType]].join(' · '),
        ),
        APL.Button({ children: 'Done', onClick: onDone, fk: 'face-done' }),
      ],
      children: [
        APL.Section({
          label: 'Standard',
          children: APL.SegmentedControl({
            label: 'Standard',
            value: standard,
            options: FACE_STANDARDS.map((o) => ({ value: o.id, label: o.label })),
            onChange: setStandard,
            fk: 'face-std',
          }),
        }),
        APL.Section({
          label: 'Face size (cm)',
          // up to five sizes in one row; all eight in two rows of four (one row would leave each
          // under 44 px at 360 px)
          children: APL.ChipGrid({
            label: 'Face size',
            columns: sizes.length <= 5 ? sizes.length : 4,
            numeric: true,
            // 3D has no size: no size is on
            value: is3d ? null : size,
            options: sizes.map((v) => ({ value: v, label: String(v) })),
            onChange: setSize,
            fk: 'face-size',
          }),
        }),
        APL.Section({
          label: 'Bow type',
          children: APL.SegmentedControl({
            label: 'Bow type',
            value: draft.bowType,
            options: [
              { value: 'recurve', label: BOW_LABELS.recurve },
              { value: 'compound', label: BOW_LABELS.compound },
            ],
            onChange: (b) => setDraft({ bowType: b }),
            fk: 'face-bow',
          }),
        }),
        ...FACE_GROUPS.map((g) => {
          const list = facesForSize(size, standard).filter((f) => f.group === g.id);
          if (!list.length) return null;
          return APL.Section({
            label: g.label,
            children: h(
              'div',
              { class: 'apl-facelist', role: 'radiogroup', 'aria-label': `${g.label} faces` },
              list.map((f) =>
                APL.FaceRow({
                  kind: f.id,
                  selected: draft.faceType === f.id,
                  inner10: isInnerTen({ ...draft, faceType: f.id, faceSize: size }),
                  onClick: () => pickFace(f.id),
                  fk: `face-${f.id}`,
                }),
              ),
            ),
          });
        }),
      ],
    }),
  };
}

/**
 * A competition shot to a catalogue round: the round sets the distance, face, arrows per end and
 * ends, shown here as its plan (not editable). The archer picks only what the round leaves open: the
 * bow type (unless the round is for one), the face where the round allows several (the indoor
 * triple, triangular or single face), the target a course starts at, and the spot order of a sheet
 * where the rules leave it to the archer (where they prescribe one, it is shown).
 */
function roundSections(fields, setKind, round) {
  const plan = planOfFields(fields);
  const choices = faceChoices(round, fields.bowType);
  const sheet = plan.ends.find((e) => isMultiSpot(e.face));
  const prescribed = sheet ? prescribedSpotOrder(round, sheet.face) : null;
  const start = Math.min(fields.startTarget || 0, plan.ends.length - 1);
  return [
    round.bowType
      ? null
      : APL.Section({
          label: 'Bow type',
          id: 'setup-bow',
          children: APL.SegmentedControl({
            label: 'Bow type',
            value: roundBowType(round, fields.bowType),
            options: [
              { value: 'recurve', label: BOW_LABELS.recurve },
              { value: 'compound', label: BOW_LABELS.compound },
            ],
            onChange: (b) => setKind({ bowType: b }),
            fk: 'round-bow',
          }),
        }),
    choices
      ? APL.Section({
          label: T.targetFace,
          id: 'setup-round-face',
          children: APL.OptionPills({
            label: 'Target face',
            value: plan.ends.map((e) => e.face).find((f) => choices.includes(f)),
            options: choices.map((f) => ({ value: f, label: faceLabel(f) })),
            onChange: (f) => setKind({ roundFace: f }),
            fk: 'round-face',
          }),
        })
      : null,
    round.variants
      ? APL.Section({
          label: 'Units',
          id: 'setup-round-variant',
          children: APL.SegmentedControl({
            label: 'Units',
            value: plan.variant,
            options: round.variants.map((v) => ({ value: v.id, label: v.label })),
            onChange: (v) => setKind({ roundVariant: v, startTarget: 0 }),
            fk: 'round-variant',
          }),
        })
      : null,
    APL.Section({
      label: plan.course ? 'Course' : 'Round',
      id: 'setup-round',
      accessory: h('span', { class: 'apl-cap' }, 'set by the round'),
      children: [
        h('p', { class: 'apl-cap', dataset: { fk: 'round-hint' } }, roundHint(plan)),
        h(
          'ul',
          { class: 'round-plan', dataset: { fk: 'round-plan' } },
          planLines(plan).map((line) => h('li', null, line)),
        ),
      ],
    }),
    plan.course
      ? APL.Section({
          label: 'Starting target',
          id: 'setup-start-target',
          children: APL.Stepper({
            label: 'starting target',
            value: start + 1,
            min: 1,
            max: plan.ends.length,
            display: `Target ${start + 1} of ${plan.ends.length}`,
            onChange: (n) => setKind({ startTarget: n - 1 }),
            fk: 'start-target',
          }),
        })
      : null,
    sheet
      ? APL.Section({
          label: 'Spot order',
          id: 'setup-spot-order',
          accessory: prescribed ? h('span', { class: 'apl-cap' }, 'set by the rules') : null,
          children: prescribed
            ? h('p', { class: 'so-now', dataset: { fk: 'spot-order-rule' } }, spotOrderLabel(sheet.face, prescribed))
            : spotOrderPicker({ ...fields, face: sheet.face }, setKind),
        })
      : null,
  ];
}

/** Triple / Vegas: which order the archer shoots the spots in, remembered per layout. */
function spotOrderPicker(fields, setKind) {
  const face = fields.face;
  const layout = spotLayout(face);
  const order = spotOrderOf(face, fields.spotOrders?.[layout]);
  return spotOrderEditor(face, order, (o) => {
    const { [layout]: _old, ...rest } = fields.spotOrders || {};
    setKind({ spotOrders: isDefaultSpotOrder(face, o) ? rest : { ...rest, [layout]: o } });
  }, 'spot-order');
}

/** Whether a scored kind is graded (M / S per arrow); shown right under When. */
function gradingSection(fields, setKind) {
  return APL.Section({
    label: 'Grading',
    id: 'setup-grading',
    children: APL.Switch({
      title: 'Mental grading',
      detail: 'Grade each arrow on the mental program (M) and the shooting cycle (S)',
      checked: fields.grading !== false,
      onChange: (on) => setKind({ grading: on }),
      fk: 'grading',
    }),
  });
}

/**
 * Blank bale: an optional arrow goal. Logged afterwards (a past start): the count,
 * the duration and a note, typed in here (no running page).
 */
function blankSections(fields, setKind, { past, quietKind }) {
  const form = fields.form || emptyFields('blank');
  // typing stores without re-rendering; taps (+1, −1) re-render
  const change = (update, { rerender = true } = {}) => {
    const next = { ...form, ...update(form) };
    if (rerender) setKind({ form: next });
    else quietKind({ form: Object.assign(form, next) });
  };
  return [
    APL.Section({
      label: 'Arrow goal',
      id: 'setup-goal',
      accessory: h('span', { class: 'apl-cap' }, 'optional'),
      children: APL.ChipGrid({
        label: 'Arrow goal',
        columns: 5,
        value: fields.goal ?? 0,
        options: [{ value: 0, label: 'None' }, ...ARROW_GOALS.map((g) => ({ value: g, label: String(g) }))],
        onChange: (g) => setKind({ goal: g || null }),
        fk: 'goal',
      }),
    }),
    ...(past ? formSections('blank', form, change) : []),
  ];
}

/**
 * Step 2 for shooting (#/new/shooting/<kind>): one page for training, competition and blank bale,
 * switched by the tabs at the top. When and the equipment stay when the kind is switched.
 */
export function renderShootingSetup(ctx, kind) {
  const st = setupState(ctx);
  const { settings, setup, set } = st;
  const fields = setup.kinds?.[kind] || fromLast(settings, kind);
  const setKind = (patch) => set({ kinds: { ...setup.kinds, [kind]: { ...fields, ...patch } } });
  const quietKind = (patch) => st.quiet({ kinds: { ...setup.kinds, [kind]: Object.assign(fields, patch) } });
  const blank = kind === 'blank';
  const active = blank ? null : ctx.ongoing.running.get();

  const { section: when, whenDate, whenTime, past, startTime } = whenSection(ctx, st, { duration: !blank });
  // sight marks are kept in metres: a distance in yards looks none up
  // (a round's: its first target's)
  const at = (!blank && planOfFields(fields)?.ends[0]) || fields;
  const markDistance = blank || (at.distanceUnit && at.distanceUnit !== 'm') ? null : at.distance;
  const equipment = equipmentSection(ctx, st, { kind, distance: markDistance });

  // the Distance & target face sheet: a draft copied from the fields when it opens; Done saves it
  const draft = blank ? null : setup.faceDraft || null;
  const openPicker = () => {
    const pick = pickFromFields(fields);
    set({ faceDraft: { ...pick, standard: standardFromFields(fields, pick) } });
  };
  const picker = draft
    ? facePickerSheet(draft, {
        setDraft: (patch) => set({ faceDraft: { ...draft, ...patch } }),
        onClose: () => set({ faceDraft: null }),
        onDone: () => {
          const face = faceIdOf({ ...draft, faceSize: sizeForStandard(draft.standard, draft.faceSize ?? 40) });
          set({
            kinds: {
              ...setup.kinds,
              [kind]: {
                ...fields,
                face,
                bowType: draft.bowType,
                faceStandard: draft.standard,
                // the IFAA 4-spot square: one arrow at each spot (it can still be changed after)
                arrowsPerEnd: arrowsPerEndFor(face, fields.arrowsPerEnd),
              },
            },
            faceDraft: null,
          });
        },
      })
    : null;

  const startScored = async () => {
    const { faceStandard = 'all', grading, competition: comp, spotOrders = {} } = fields;
    // a competition to a catalogue round: the round decides the distance, face and arrows (its first
    // target's start the session) and the session follows it end by end
    const plan = kind === 'competition' ? planOfFields(fields) : null;
    const startTarget = plan ? Math.min(fields.startTarget || 0, plan.ends.length - 1) : 0;
    const first = plan ? plan.ends[startTarget] : fields;
    const { distance, distanceUnit = 'm', face, arrowsPerEnd } = first;
    const bowType = plan ? plan.bowType : fields.bowType;
    // only one session runs at a time: the ongoing sessions ask about the one in progress
    const res = await ctx.ongoing.start(kind, {
      date: whenDate,
      time: past ? whenTime : startTime(),
      pastMinutes: past ? (setup.pastMinutes ?? 0) : null,
      distance,
      distanceUnit,
      face,
      bowType,
      faceStandard,
      arrowsPerEnd,
      grading: grading !== false,
      spotOrder: (!first.spotOrder && spotOrders[spotLayout(face)]) || null,
      spotOrders,
      ...(plan ? { round: plan, startTarget } : {}),
      competition:
        kind === 'competition'
          ? { ...emptyCompetition(), event: comp.event, round: comp.round, conditions: comp.conditions }
          : null,
      // remembered with the competition's last setup
      roundVariant: plan?.variant ?? null,
      ...equipment.chosenGear(),
    });
    if (res.status === 'cancelled') return;
    ctx.ui.quietSet({ setup: null });
    if (res.status === 'started') ctx.navigate(res.next, { replace: true });
  };

  // Start: the blank bale's timer starts now, or at the start time picked a few minutes ago (nothing
  // ran while the setup was open); one already open goes on as it is
  const blankOpen = blank && !!ctx.ongoing.find('blank');
  const startBlank = async () => {
    const when = { date: whenDate, time: startTime() };
    const res = await ctx.ongoing.start('blank', { goal: fields.goal ?? null, gear: equipment.choice, when });
    ctx.ui.quietSet({ setup: null });
    ctx.navigate(res.next, { replace: true });
  };
  // a past start: saved straight to History (an open blank bale is left running)
  const logBlank = async () => {
    const form = fields.form || emptyFields('blank');
    const res = await ctx.ongoing.finish('blank', {
      fields: { ...form, ...(fields.goal ? { goal: fields.goal } : {}) },
      date: whenDate,
      time: whenTime,
      past: true,
      close: false,
      gear: equipment.chosenGear(),
    });
    // remembered as the last blank bale setup by the ongoing sessions, as a started one is
    if (!res.next) return;
    ctx.ui.quietSet({ setup: null });
    ctx.navigate(res.next, { replace: true });
  };

  const body = h(
    'div',
    { class: 'apl-screen-body', role: 'tabpanel', id: 'shooting-panel', 'aria-labelledby': `kind-${kind}` },
    blankOpen
      ? APL.Banner({ title: 'A blank bale session is running', action: { label: T.continueSession, href: '#/blank' } })
      : null,
    active
      ? APL.Banner({
          title: T.inProgress(setupSummary(active), active.ends.length),
          action: { label: T.continueSession, href: '#/log' },
        })
      : null,
    when,
    blank ? null : gradingSection(fields, setKind),
    kind === 'competition' ? competitionSection(fields, { setKind, quietKind }) : null,
    ...(blank
      ? blankSections(fields, setKind, { past, quietKind })
      : roundOfFields(fields)
        ? roundSections(fields, setKind, roundOfFields(fields))
        : scoredSections(fields, setKind, openPicker)),
    equipment.section,
  );

  return {
    content: h(
      'div',
      { class: 'apl-screen' },
      APL.ScreenHeader({
        title: 'Shooting',
        // going back gives the setup up (what was picked is forgotten)
        onBack: () => {
          ctx.ui.quietSet({ setup: null });
          ctx.navigate('new', { replace: true });
        },
        backLabel: 'Back to session types',
      }),
      kindTabs(ctx, kind),
      body,
      APL.BottomBar({
        summary: blank ? null : scoredSummary(fields),
        children: APL.Button({
          children: blank && past ? 'Save blank bale' : blankOpen ? 'Continue blank bale' : START_LABELS[kind],
          trailingIcon: blank && past ? null : 'arrowRight',
          onClick: !blank ? startScored : past ? logBlank : startBlank,
          fk: 'setup-start',
        }),
      }),
    ),
    overlay: picker,
  };
}
