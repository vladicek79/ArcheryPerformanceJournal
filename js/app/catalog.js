// The archer's own lists: My drills (the SPT drill types), My exercises (the gym session's
// suggestions), the gym focus and the mental techniques. Each is a synced setting, `null` while it is
// the built-in list; once the archer changes anything the whole list is stored, in their order,
// hidden entries included. Entries are never deleted, only hidden, so a saved session always finds
// its drill type. Exercises, focus and techniques are kept in a session by name: renaming one here
// leaves past sessions as they were.
//
// Pure: settings in, values out. The pages and forms read the lists through here only.
import { DRILLS, GYM_EXERCISES, GYM_FOCUS, MENTAL_TECHNIQUES } from './sessionTypes.js';
import { GYM_UNITS } from './gym.js';

export const NAME_MAX = 60;
export const NOUN_MAX = 20;

/** Built-in drill ids, and the shape of the ids given to the archer's own drill types. */
const BUILT_IN_IDS = DRILLS.map((d) => d.id);
const CUSTOM_ID = /^c-[a-z0-9]{4,16}$/;

/** Whether `id` can be a drill type's id (built in, or one the archer added). */
export const isDrillId = (id) => typeof id === 'string' && (BUILT_IN_IDS.includes(id) || CUSTOM_ID.test(id));

const isName = (s, max = NAME_MAX) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------------------------------------------------------------- the lists

const builtInDrills = () =>
  DRILLS.map((d) => ({
    id: d.id,
    label: d.label,
    ...(d.short ? { short: d.short } : {}),
    hold: d.hold,
    noun: d.noun,
    ...(d.retired ? { hidden: true } : {}),
  }));

const builtInExercises = () => GYM_EXERCISES.map((e) => ({ name: e.name, unit: e.unit }));

/** A stored drill type, cleaned; null when it is not one (a damaged entry is skipped, not fatal). */
function cleanDrill(d) {
  if (!d || !isDrillId(d.id) || !isName(d.label) || typeof d.hold !== 'boolean') return null;
  return {
    id: d.id,
    label: d.label.trim(),
    ...(isName(d.short) ? { short: d.short.trim() } : {}),
    hold: d.hold,
    noun: isName(d.noun, NOUN_MAX) ? d.noun.trim() : d.hold ? 'hold' : 'rep',
    ...(d.hidden ? { hidden: true } : {}),
  };
}

function cleanExercise(e) {
  if (!e || !isName(e.name) || !GYM_UNITS.includes(e.unit)) return null;
  return { name: e.name.trim(), unit: e.unit, ...(e.hidden ? { hidden: true } : {}) };
}

/** The first of each key only. */
const uniqueBy = (list, key) => list.filter((x, i) => list.findIndex((y) => key(y) === key(x)) === i);

/**
 * The drill types, in the archer's order; hidden ones only with `includeHidden`. A built-in type
 * missing from a stored list comes back hidden, so sessions that have it still read right.
 */
export function drillTypes(settings, { includeHidden = false } = {}) {
  const stored = Array.isArray(settings?.drillTypes) ? settings.drillTypes.map(cleanDrill).filter(Boolean) : [];
  let list = stored.length ? uniqueBy(stored, (d) => d.id) : builtInDrills();
  for (const b of builtInDrills()) if (!list.some((d) => d.id === b.id)) list = [...list, { ...b, hidden: true }];
  return includeHidden ? list : list.filter((d) => !d.hidden);
}

/** The gym exercises offered as chips, in the archer's order; hidden ones only with `includeHidden`. */
export function gymExercises(settings, { includeHidden = false } = {}) {
  const stored = Array.isArray(settings?.gymExercises) ? settings.gymExercises.map(cleanExercise).filter(Boolean) : [];
  const list = stored.length ? uniqueBy(stored, (e) => e.name.toLowerCase()) : builtInExercises();
  return includeHidden ? list : list.filter((e) => !e.hidden);
}

// The lists of plain names: the gym focus and the mental techniques
const NAME_LISTS = { focus: ['gymFocus', GYM_FOCUS], techniques: ['mentalTechniques', MENTAL_TECHNIQUES] };
const cleanName = (e) => (e && isName(e.name) ? { name: e.name.trim(), ...(e.hidden ? { hidden: true } : {}) } : null);

function nameList(settings, list, includeHidden) {
  const [setting, builtIn] = NAME_LISTS[list];
  const stored = Array.isArray(settings?.[setting]) ? settings[setting].map(cleanName).filter(Boolean) : [];
  const all = stored.length ? uniqueBy(stored, (e) => e.name.toLowerCase()) : builtIn.map((name) => ({ name }));
  return includeHidden ? all : all.filter((e) => !e.hidden);
}

/** The gym focus options (names), in the archer's order; hidden ones only with `includeHidden`. */
export const gymFocus = (settings, { includeHidden = false } = {}) => nameList(settings, 'focus', includeHidden).map((e) => e.name);

/** The mental techniques (names), in the archer's order; hidden ones only with `includeHidden`. */
export const mentalTechniques = (settings, { includeHidden = false } = {}) =>
  nameList(settings, 'techniques', includeHidden).map((e) => e.name);

/**
 * The options to show for a pick of names (focus, techniques): the visible names, then any `picked`
 * one that is not among them (hidden or renamed since), so a saved session can still show and
 * unpick it.
 */
export function choicesWith(names, picked = []) {
  const has = (x) => names.some((n) => n.toLowerCase() === x.toLowerCase());
  return [...names, ...picked.filter((p, i) => !has(p) && picked.indexOf(p) === i)];
}

/** The picked names in the order of `names` (the list's order), any others after them. */
export const inListOrder = (picked = [], names = []) => choicesWith(names, picked).filter((n) => picked.includes(n));

/** Every drill type, hidden ones included: what the drill helpers look a saved drill up in. */
export const allDrillTypes = (settings) => drillTypes(settings, { includeHidden: true });

/**
 * The drill type of a drill, looked up in `types` (all drill types). One this device does not know
 * (a session synced ahead of the list) is made from the drill itself: the name it was saved with,
 * a hold when it has a hold time.
 */
export function drillTypeOf(drill, types = builtInDrills()) {
  const found = types.find((t) => t.id === drill?.kind);
  if (found) return found;
  const hold = drill?.holdSec != null;
  return { id: drill?.kind ?? '', label: drill?.name || 'Drill', hold, noun: hold ? 'hold' : 'rep', unknown: true };
}

/** The drills with the name of their type, as saved with a session (read only when the type is unknown). */
export const withDrillNames = (drills = [], types) => drills.map((d) => ({ ...d, name: drillTypeOf(d, types).label }));

/** Whether a saved session has a drill of type `id` (its hold can then no longer be switched). */
export const drillTypeUsed = (id, sessions = []) =>
  sessions.some((s) => !s.deleted && s.type === 'strength' && (s.drills || []).some((d) => d?.kind === id));

// ---------------------------------------------------------------- editing

/** A new, unused id for a drill type the archer adds. */
function newDrillId(taken, random) {
  const base = `c-${random().toString(36).slice(2, 8).padEnd(4, '0')}`;
  // a clash (rare) takes a counter on the end, so this always ends
  for (let n = 0; ; n++) {
    const id = n ? `${base}${n.toString(36)}` : base;
    if (CUSTOM_ID.test(id) && !taken.includes(id)) return id;
  }
}

/** The stored value of a list: null when it is the built-in list as it was. */
const stored = (list, builtIn) => (JSON.stringify(list) === JSON.stringify(builtIn) ? null : list);

const LISTS = {
  drills: {
    setting: 'drillTypes',
    all: (s) => drillTypes(s, { includeHidden: true }),
    builtIn: builtInDrills,
    keyOf: (d) => d.id,
    nameOf: (d) => d.label,
  },
  exercises: {
    setting: 'gymExercises',
    all: (s) => gymExercises(s, { includeHidden: true }),
    builtIn: builtInExercises,
    keyOf: (e) => e.name.toLowerCase(),
    nameOf: (e) => e.name,
  },
  ...Object.fromEntries(
    Object.entries(NAME_LISTS).map(([list, [setting, builtIn]]) => [
      list,
      {
        setting,
        all: (s) => nameList(s, list, true),
        builtIn: () => builtIn.map((name) => ({ name })),
        keyOf: (e) => e.name.toLowerCase(),
        nameOf: (e) => e.name,
      },
    ]),
  ),
};
const byName = (list) => list !== 'drills';

/** What is wrong with an entry's fields, or null. `others`: the other visible entries of the list. */
function entryError(list, entry, others) {
  const name = list === 'drills' ? entry.label : entry.name;
  if (typeof name !== 'string' || !name.trim()) return 'name-empty';
  if (name.trim().length > NAME_MAX) return 'name-long';
  if (others.some((o) => sameName(LISTS[list].nameOf(o), name))) return 'name-taken';
  if (list === 'drills') {
    if (entry.short != null && entry.short.trim().length > NAME_MAX) return 'name-long';
    if (typeof entry.noun !== 'string' || !entry.noun.trim()) return 'noun-empty';
    if (entry.noun.trim().length > NOUN_MAX) return 'noun-long';
    if (typeof entry.hold !== 'boolean') return 'hold';
  } else if (list === 'exercises' && !GYM_UNITS.includes(entry.unit)) return 'unit';
  return null;
}

function tidy(list, entry) {
  if (list === 'exercises') return { name: entry.name.trim(), unit: entry.unit, ...(entry.hidden ? { hidden: true } : {}) };
  if (list in NAME_LISTS) return { name: entry.name.trim(), ...(entry.hidden ? { hidden: true } : {}) };
  const short = entry.short?.trim();
  return {
    id: entry.id,
    label: entry.label.trim(),
    ...(short ? { short } : {}),
    hold: entry.hold,
    noun: entry.noun.trim(),
    ...(entry.hidden ? { hidden: true } : {}),
  };
}

/**
 * One edit of a list: `list` 'drills' (My drills), 'exercises' (My exercises), 'focus' (gym
 * focus) or 'techniques' (mental techniques). Returns `{ patch }`, the settings patch to save, or
 * `{ error }`. Edits:
 *   { add: fields }                 drills: { label, short?, hold, noun }; exercises: { name, unit };
 *                                   focus, techniques: { name }
 *   { update: key, fields }         key: a drill type's id, else the entry's name
 *   { move: key, by: -1 | 1 }       up or down past the next visible entry
 *   { hide: key } / { show: key }
 *   { reset: true }                 back to the built-in list
 * Adding a name that is hidden shows it again (an exercise with the new unit).
 */
export function editList(settings, list, edit, { random = Math.random } = {}) {
  const L = LISTS[list];
  const all = L.all(settings);
  const done = (next) => ({ patch: { [L.setting]: stored(next, L.builtIn()) } });
  const at = (key) => all.findIndex((x) => L.keyOf(x) === (byName(list) ? String(key).toLowerCase() : key));
  const visibleOthers = (i) => all.filter((x, j) => j !== i && !x.hidden);

  if (edit.reset) return { patch: { [L.setting]: null } };

  if (edit.add) {
    const fields = { ...edit.add };
    if (byName(list)) {
      const hiddenTwin = all.findIndex((x) => x.hidden && sameName(x.name, fields.name || ''));
      if (hiddenTwin >= 0) {
        const err = entryError(list, fields, visibleOthers(hiddenTwin));
        if (err) return { error: err };
        return done(all.map((x, j) => (j === hiddenTwin ? tidy(list, fields) : x)));
      }
    }
    const entry = list === 'drills' ? { ...fields, id: newDrillId(all.map((d) => d.id), random) } : fields;
    const err = entryError(list, entry, visibleOthers(-1));
    if (err) return { error: err };
    return done([...all, tidy(list, entry)]);
  }

  const key = edit.update ?? edit.move ?? edit.hide ?? edit.show;
  const i = at(key);
  if (i < 0) return { error: 'missing' };

  if ('update' in edit) {
    const entry = { ...all[i], ...edit.fields, ...(list === 'drills' ? { id: all[i].id } : {}) };
    const err = entryError(list, entry, all[i].hidden ? [] : visibleOthers(i));
    if (err) return { error: err };
    return done(all.map((x, j) => (j === i ? tidy(list, entry) : x)));
  }
  if ('move' in edit) {
    // past the next visible entry that way (hidden ones are not on the chips, so they are skipped)
    const step = edit.by < 0 ? -1 : 1;
    let j = i + step;
    while (j >= 0 && j < all.length && all[j].hidden) j += step;
    if (j < 0 || j >= all.length) return done(all);
    const next = [...all];
    [next[i], next[j]] = [next[j], next[i]];
    return done(next);
  }
  if ('hide' in edit) return done(all.map((x, j) => (j === i ? { ...x, hidden: true } : x)));
  // show: a visible entry of the same name blocks it
  if (visibleOthers(i).some((o) => sameName(L.nameOf(o), L.nameOf(all[i])))) return { error: 'name-taken' };
  return done(all.map((x, j) => (j === i ? tidy(list, { ...x, hidden: false }) : x)));
}

/** Whether the list is still the built-in one. */
export const isBuiltInList = (settings, list) => settings?.[LISTS[list].setting] == null;

/** The archer-facing words for an editList error. */
export const EDIT_ERRORS = {
  'name-empty': 'Enter a name.',
  'name-long': `Keep the name to ${NAME_MAX} characters.`,
  'name-taken': 'That name is already in the list.',
  'noun-empty': 'Enter what one repetition is called.',
  'noun-long': `Keep it to ${NOUN_MAX} characters.`,
  unit: 'Pick reps or seconds.',
  hold: 'Pick whether it has a hold.',
  missing: 'That entry is no longer in the list.',
};
