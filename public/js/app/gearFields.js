// Equipment fields (HANDOFF §7): [key, label, placeholder hint].
export const GEAR_GROUPS = [
  {
    title: 'Bow',
    fields: [
      ['riser', 'Riser', 'model'],
      ['limbsModel', 'Limbs model', 'model'],
      ['limbsLbs', 'Limbs poundage', 'lbs'],
      ['drawWeight', 'Draw weight on fingers', 'lbs'],
    ],
  },
  {
    title: 'Arrows',
    fields: [
      ['arrowModel', 'Arrow model', 'model'],
      ['spine', 'Spine', ''],
      ['arrowLength', 'Length', 'in'],
      ['points', 'Points', 'grain'],
      ['nocks', 'Nocks', ''],
    ],
  },
  {
    title: 'String',
    fields: [
      ['stringMat', 'Material', ''],
      ['strands', 'Strands', 'count'],
      ['brace', 'Brace height', 'in'],
      ['nockPoint', 'Nocking point', 'mm'],
    ],
  },
  {
    title: 'Tuning',
    fields: [
      ['tillerTop', 'Tiller top', 'mm'],
      ['tillerBottom', 'Tiller bottom', 'mm'],
      ['plungerTension', 'Plunger tension', ''],
      ['plungerPos', 'Plunger position', ''],
      ['rest', 'Arrow rest', ''],
      ['clicker', 'Clicker position', ''],
    ],
  },
  {
    title: 'Stabilisers & accessories',
    fields: [
      ['stabLong', 'Long rod', 'length'],
      ['stabSides', 'Side rods', 'length'],
      ['vbar', 'V-bar', 'angle'],
      ['stabWeights', 'Weights', 'oz'],
      ['tab', 'Tab', ''],
      ['sight', 'Sight', ''],
    ],
  },
];

export const GEAR_KEYS = GEAR_GROUPS.flatMap((g) => g.fields.map((f) => f[0]));

export function filledCount(fields) {
  return GEAR_KEYS.filter((k) => fields && String(fields[k] ?? '').trim()).length;
}

/**
 * Equipment choices for a session: the current Gear setup (unless it is just a loaded saved setup),
 * each saved setup, "as recorded" when editing a session whose equipment matches neither, and none.
 * Returns { options: [[value, label]], value } for a select.
 */
export function gearChoices({ settings, snapshots, session = null }) {
  const active = snapshots.find((sn) => sn.id === settings.activeSnapshotId);
  const options = [];
  let value;
  if (session) {
    const own = snapshots.find((sn) => sn.id === session.gearSnapshotId);
    if (own) value = own.id;
    else if (filledCount(session.gear)) {
      options.push(['recorded', 'As recorded']);
      value = 'recorded';
    } else value = 'none';
  } else value = active ? active.id : filledCount(settings.gear) ? 'current' : 'none';
  if (!active && filledCount(settings.gear)) options.push(['current', 'Current Gear setup']);
  for (const sn of snapshots) options.push([sn.id, sn.name]);
  options.push(['none', 'No equipment']);
  return { options, value };
}

/** The { gear, gearSnapshotId } a session stores for a choice (null for "as recorded": keep it). */
export function gearForChoice(choice, { settings, snapshots }) {
  if (choice === 'recorded') return null;
  if (choice === 'none') return { gear: null, gearSnapshotId: null };
  if (choice === 'current') return { gear: { ...settings.gear }, gearSnapshotId: settings.activeSnapshotId || null };
  const sn = snapshots.find((x) => x.id === choice);
  return sn ? { gear: { ...sn.fields }, gearSnapshotId: sn.id } : null;
}
