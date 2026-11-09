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
