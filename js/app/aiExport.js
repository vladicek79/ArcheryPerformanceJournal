// The session history as JSON for an AI agent (Claude chat) to analyse: readable field names, the
// units in the names, every session's summary worked out, the watch's shot timing joined to the
// arrows (hrTrace.js), and a glossary on top, so the file reads without the app's code. One session
// (Session options) or all of them (Settings › Sync & backup). Pure; the views share or download it.
import { computeStats } from './stats.js';
import { faceLabel, arrowValue, spotRadiusCm, isMultiSpot, spotNames, canPlaceArrows } from './scoring.js';
import {
  TYPE_LABELS,
  sessionType,
  isScored,
  isGraded,
  distanceUnitOf,
  distanceMetres,
  bowTypeOf,
} from './sessionTypes.js';
import { groupArrows, groupCentre, groupSpread, centreDirection } from './sessionInsights.js';
import { endTimeline } from './hrTrace.js';
import { GEAR_GROUPS } from './gearFields.js';
import { gradeText, scaleName, GRADES } from './gradeTexts.js';

export const AI_EXPORT_FORMAT = 'archery-journal-ai-export/1';

/** "archery-sessions-2026-11-27.json" for the history, "archery-session-2026-11-26-training.json" for one session. */
export function aiExportFileName(sessions, { now = new Date(), single = false } = {}) {
  if (single && sessions.length === 1)
    return `archery-session-${sessions[0].date}-${sessionType(sessions[0])}.json`;
  const p = (n) => String(n).padStart(2, '0');
  return `archery-sessions-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

// ---------------------------------------------------------------- helpers

/** Drop null, undefined, '' and empty arrays / objects, so the file stays short for the agent. */
function compact(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out;
}

const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

const FIELD_INFO = Object.fromEntries(
  GEAR_GROUPS.flatMap((g) => g.fields.map(([key, label, unit]) => [key, { label, unit, group: g.title }])),
);

/** A setup's fields under their labels, with the unit in the name ("Limbs poundage (lbs)"). */
function gearOut(fields) {
  if (!fields || typeof fields !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    if (key === 'sights') {
      const marks = (Array.isArray(value) ? value : []).map((m) =>
        compact({ distanceM: m.distance, elevation: m.elevation, windage: m.windage, note: m.note }),
      );
      if (marks.length) out['Sight marks'] = marks;
      continue;
    }
    const info = FIELD_INFO[key];
    const unit = info && info.unit && info.unit !== 'model' ? ` (${info.unit})` : '';
    out[`${info ? `${info.group}: ${info.label}` : key}${unit}`] = value;
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------- scored sessions

function arrowOut(a, i, mmPerRadius, multi) {
  return compact({
    arrow: i + 1,
    score: a.v ?? null,
    points: a.v == null ? null : arrowValue(a.v),
    mentalGrade: a.m ?? null,
    shotGrade: a.s ?? null,
    spot: multi && a.spot != null ? a.spot + 1 : null,
    xMm: a.x == null ? null : round(a.x * mmPerRadius, 1),
    yMm: a.y == null ? null : round(a.y * mmPerRadius, 1),
    watchArrowNo: a.no ?? null,
    heartRateBpm: a.hr ?? null,
    gradedOnWatchAtSec: a.t ?? null,
  });
}

/** What the watch measured through one end: each shot's phases, joined to its arrow. */
function watchOut(end) {
  const tl = endTimeline(end);
  if (!tl) return null;
  const shots = tl.shots.map((s) =>
    compact({
      watchArrowNo: s.no,
      atSec: s.t,
      gapSec: s.gap,
      score: s.v,
      mentalGrade: s.m,
      shotGrade: s.s,
      heartRateBpm: s.hr,
      releaseDetected: s.detected,
      setSec: s.detected ? s.setup : null,
      ...(s.settle != null
        ? {
            setUpSec: s.raise,
            drawSec: s.pull,
            fullDrawSec: s.anchor,
            anchorDriftDeg: s.drift,
            followMm: s.follow,
            followBackMm: s.followBack,
            followOffMm: s.followOff,
          }
        : s.detected
          ? { setUpSec: s.draw, drawAndFullDrawSec: s.hold }
          : {}),
      anchorJitter: s.detected ? s.steady : null,
    }),
  );
  return compact({
    endSec: tl.seconds,
    avgGapSec: tl.avgGap,
    heartRateBpm: tl.hr,
    shots,
    heartRateTrace: end.hrTrace?.hr?.length ? { stepSec: end.hrTrace.step, bpm: end.hrTrace.hr } : null,
  });
}

function endOut(e, i, mmPerRadius, multi) {
  const scored = e.arrows.filter((a) => a && a.v != null);
  return compact({
    end: i + 1,
    score: scored.reduce((t, a) => t + arrowValue(a.v), 0),
    arrows: e.arrows.map((a, k) => (a ? arrowOut(a, k, mmPerRadius, multi) : { arrow: k + 1 })),
    letDowns: e.ld || null,
    correctLetDowns: e.cld || null,
    note: e.note,
    watch: watchOut(e),
  });
}

function summaryOut(ss, mmPerRadius) {
  const st = computeStats(ss.ends, ss.face);
  const { arrows: placed } = groupArrows(ss.ends);
  const centre = groupCentre(placed);
  const spread = groupSpread(placed);
  return compact({
    totalScore: st.total,
    maxScore: st.max,
    arrowsScored: st.arrows,
    avgArrow: round(st.avgArrow),
    tensIncludingX: st.tens,
    xs: st.xs,
    letDowns: st.ld,
    correctLetDowns: st.cld,
    avgMentalGrade: round(st.avgM),
    avgShotGrade: round(st.avgS),
    mentalProgramPct: st.programPct,
    avgArrowByMentalGrade: Object.fromEntries(
      Object.entries(st.byM)
        .filter(([, b]) => b.n)
        .map(([g, b]) => [g, { arrows: b.n, avgArrow: round(b.avgArrow) }]),
    ),
    group: centre
      ? compact({
          arrowsPlaced: placed.length,
          centreXMm: round(centre.x * mmPerRadius, 1),
          centreYMm: round(centre.y * mmPerRadius, 1),
          centre: centreDirection(centre),
          spreadSdXMm: spread ? round(spread.sdX * mmPerRadius, 1) : null,
          spreadSdYMm: spread ? round(spread.sdY * mmPerRadius, 1) : null,
        })
      : null,
  });
}

// ---------------------------------------------------------------- one session

// a form session's keys already written in `base` (or of no use to the agent)
const FORM_KEYS_DONE = new Set([
  'id',
  'date',
  'time',
  'type',
  'status',
  'minutes',
  'gear',
  'gearSnapshotId',
  'competition',
  'review',
  'createdAt',
  'updatedAt',
]);

/** One session as the agent reads it; `setups` names the gear setup it was shot with. */
export function aiSession(ss, { setups = [] } = {}) {
  const type = sessionType(ss);
  const setup = ss.gearSnapshotId ? setups.find((s) => s.id === ss.gearSnapshotId) : null;
  const base = {
    id: ss.id,
    date: ss.date,
    time: ss.time,
    type,
    typeLabel: TYPE_LABELS[type] || type,
    status: ss.status === 'active' ? 'in progress' : null,
    durationMin: ss.minutes,
    gearSetup: setup?.name || null,
    gear: gearOut(ss.gear),
    competition: ss.competition ? compact(ss.competition) : null,
    review: ss.review
      ? compact({ wentWell: ss.review.good, workOn: ss.review.workOn, how: ss.review.how })
      : null,
  };
  if (!isScored(type)) {
    // a form session: its own fields as stored (arrows, minutes, drills, exercises, focus…)
    const rest = Object.fromEntries(Object.entries(ss).filter(([k]) => !FORM_KEYS_DONE.has(k)));
    return compact({ ...base, ...compact(rest) });
  }
  const mmPerRadius = canPlaceArrows(ss.face) ? spotRadiusCm(ss.face) * 10 : null;
  const multi = isMultiSpot(ss.face);
  return compact({
    ...base,
    distance: ss.distance,
    distanceUnit: distanceUnitOf(ss),
    distanceM: distanceMetres(ss),
    bowType: bowTypeOf(ss),
    face: faceLabel(ss.face),
    faceId: ss.face,
    spots: multi ? spotNames(ss.face) : null,
    arrowsPerEnd: ss.arrowsPerEnd,
    graded: isGraded(ss),
    summary: summaryOut(ss, mmPerRadius),
    ends: ss.ends.map((e, i) => endOut(e, i, mmPerRadius, multi)),
  });
}

// ---------------------------------------------------------------- the file

function glossary(settings) {
  const scale = (s) => ({
    name: scaleName(settings, s),
    grades: Object.fromEntries(GRADES.map((g) => [g, gradeText(settings, s, g)])),
  });
  return {
    purpose: 'An archer’s training journal, exported for analysis. One record per session, oldest first.',
    sessionTypes: {
      training: 'Target practice, scored arrow by arrow',
      competition: 'A competition round, scored arrow by arrow',
      blank: 'Blank bale: close-range shooting without a target, counted arrows only',
      manual: 'Shooting logged afterwards: arrows and/or minutes only',
      strength: 'SPT: specific physical training with the bow (drills: sets, reps, hold and rest seconds)',
      gym: 'Gym workout: exercises with sets of reps and kg',
      mental: 'Mental training: focus 1–5 and the techniques practised',
    },
    score: 'X is an inner 10 (counts 10); M is a miss (0). points is the numeric value.',
    mentalGrade: { about: 'M grade, given by the archer after each arrow: 1 best, 5 worst', ...scale('m') },
    shotGrade: { about: 'S grade, given by the archer after each arrow: 1 best, 5 worst', ...scale('s') },
    mentalProgramPct: 'Share of graded arrows with mental grade 1 or 2',
    letDowns:
      'Shots the archer let down (aborted) in the end; correctLetDowns: those let down for the right reason',
    position:
      'xMm / yMm: where the arrow hit, in mm from the centre of its spot; x positive = right, y positive = LOW (down). group: the mean point of impact and its standard deviation, same axes.',
    spot: 'On a three-spot sheet: which spot (1-based, in the order of `spots`)',
    watch:
      'From the Garmin watch on the bow-arm wrist, per end. atSec: seconds from the start of the end; gapSec: since the previous shot. setSec: hooking and gripping (often 0 with a real bow). setUpSec: hand on the string, raising the bow, any pause. drawSec: the draw to anchor. fullDrawSec: from reaching full draw to the release (anchor, aim, expansion). Older watch versions give only drawAndFullDrawSec. anchorDriftDeg: how much the wrist tilt changed at anchor. followMm: hand travel in the first 0.1 s after release; followBackMm: the part straight back along the forearm; followOffMm: how far it ends from the end’s average direction. anchorJitter: 0–9, lower is steadier. releaseDetected false: an arrow graded on the watch with no release found.',
    arrowWatchFields:
      'On an arrow: watchArrowNo, the arrow number picked on the watch; heartRateBpm at the shot; gradedOnWatchAtSec, when it was graded on the watch (seconds from the start of the end, just after the release). The full timing is in the end’s watch.shots.',
    heartRateTrace: 'Heart rate through the end: one bpm value every stepSec seconds',
    gear: 'The equipment recorded with the session; gearSetup: the name of the setup it came from',
    review: 'The archer’s own review after the session',
  };
}

/**
 * The export document for `sessions` (any order; written oldest first). `setups` names the gear,
 * `competitions` the competition log, `settings` gives the archer's wording of the grades.
 */
export function aiExportDocument(
  { sessions, setups = [], competitions = [], settings = {} },
  { exportedAt = new Date(), appVersion = null } = {},
) {
  const list = [...sessions].sort((a, b) =>
    `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`),
  );
  const dates = list.map((s) => s.date);
  return compact({
    format: AI_EXPORT_FORMAT,
    exportedAt: exportedAt.toISOString(),
    appVersion,
    sessionCount: list.length,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    glossary: glossary(settings),
    gearSetups: setups.map((s) => compact({ name: s.name, gear: gearOut(s.fields) })),
    competitionLog: competitions.map((c) =>
      compact({
        date: c.date,
        event: c.event,
        round: c.round,
        score: c.score,
        sightMark: c.sightMark,
        conditions: c.conditions,
        note: c.note,
      }),
    ),
    sessions: list.map((ss) => aiSession(ss, { setups })),
  });
}
