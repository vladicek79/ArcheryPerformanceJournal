// The user's wording of the M and S grades (Settings › Grades).
//
// settings.gradeTexts = { m: { name, g: [5] }, s: { name, g: [5] } } holds only what the user changed:
// a missing, null or blank value means the default (SCALE_NAMES, RUBRIC). Writes go through
// setGradeText / setScaleName / resetScale, which drop defaults again, so an untouched journal keeps
// gradeTexts null. The grade values 1–5 and their colours never change; only the words do.
import { RUBRIC, SCALE_NAMES } from './strings.js';

export const SCALES = ['m', 's'];
export const GRADES = [1, 2, 3, 4, 5];
export const NAME_MAX = 32;
export const TEXT_MAX = 80;

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const stored = (settings, scale) => {
  const t = settings?.gradeTexts?.[scale];
  return t && typeof t === 'object' ? t : null;
};

export const defaultGradeText = (scale, n) => RUBRIC[scale][n - 1];
export const defaultScaleName = (scale) => SCALE_NAMES[scale];

/** The wording of grade `n` (1–5) of scale 'm' or 's'. */
export function gradeText(settings, scale, n) {
  const g = stored(settings, scale)?.g;
  const v = Array.isArray(g) ? g[n - 1] : null;
  return isText(v) ? v : defaultGradeText(scale, n);
}

/** The name of scale 'm' or 's' ("Mental program" unless renamed). */
export function scaleName(settings, scale) {
  const v = stored(settings, scale)?.name;
  return isText(v) ? v : defaultScaleName(scale);
}

/** Is grade `n` of `scale` (or, without `n`, the whole scale and its name) at its default? */
export function isDefault(settings, scale, n) {
  if (n != null) return gradeText(settings, scale, n) === defaultGradeText(scale, n);
  return scaleName(settings, scale) === defaultScaleName(scale) && GRADES.every((g) => isDefault(settings, scale, g));
}

/** Store only the changes: defaults and blanks become null, an all-null scale or whole value null. */
function compact(texts) {
  const out = {};
  for (const scale of SCALES) {
    const t = texts?.[scale] || {};
    const name = isText(t.name) && t.name.trim() !== defaultScaleName(scale) ? t.name.trim().slice(0, NAME_MAX) : null;
    const g = GRADES.map((n) => {
      const v = t.g?.[n - 1];
      return isText(v) && v.trim() !== defaultGradeText(scale, n) ? v.trim().slice(0, TEXT_MAX) : null;
    });
    out[scale] = name == null && g.every((v) => v == null) ? null : { name, g };
  }
  return SCALES.every((s) => out[s] == null) ? null : out;
}

const copyOf = (gradeTexts) => {
  const out = {};
  for (const scale of SCALES) {
    const t = gradeTexts?.[scale];
    const g = Array.isArray(t?.g) ? t.g : [];
    out[scale] = { name: t?.name ?? null, g: GRADES.map((n) => g[n - 1] ?? null) };
  }
  return out;
};

/** A new gradeTexts value with grade `n` of `scale` set to `text` (blank or the default: back to default). */
export function setGradeText(gradeTexts, scale, n, text) {
  const out = copyOf(gradeTexts);
  out[scale].g[n - 1] = text;
  return compact(out);
}

/** A new gradeTexts value with `scale` renamed (blank or the default name: back to default). */
export function setScaleName(gradeTexts, scale, name) {
  const out = copyOf(gradeTexts);
  out[scale].name = name;
  return compact(out);
}

/** A new gradeTexts value with `scale` (its name and all 5 texts) back at the defaults. */
export function resetScale(gradeTexts, scale) {
  const out = copyOf(gradeTexts);
  out[scale] = null;
  return compact(out);
}
