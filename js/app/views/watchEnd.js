// What the watch recorded through one end: a timeline chart (heart rate, each shot as a numbered
// marker coloured by its M grade, the seconds between shots), the end's figures and its arrows in
// the order shot. Shown after the Watch scan (OK goes on to scoring) and from History.
import { h, s } from '../../core/dom.js';
import * as APL from '../../ui/apl/index.js';
import { icons } from '../icons.js';
import { endTimeline, mmss } from '../hrTrace.js';

const VB_W = 340;
const VB_H = 172;
const L = 36; // left: heart-rate labels
const R = 330;
const T = 30; // top: shot numbers above
const B = 114; // bottom of the plot; time labels and gaps below

/** "good" (M 4-5), "mid" (M 3), "low" (M 1-2) or "none". */
export function mTone(m) {
  if (m == null) return 'none';
  return m >= 4 ? 'good' : m === 3 ? 'mid' : 'low';
}

function tickStep(seconds) {
  if (seconds <= 90) return 15;
  if (seconds <= 240) return 30;
  if (seconds <= 600) return 60;
  return 120;
}

/** The timeline chart of an end (SVG), or null when the watch recorded nothing for it. */
export function timelineChart(tl, { hrTrace = null } = {}) {
  if (!tl) return null;
  const seconds = Math.max(1, tl.seconds);
  const x = (t) => L + (Math.min(t, seconds) / seconds) * (R - L);
  const parts = [];

  // heart rate: area and line, the range at the left
  let y = null;
  if (hrTrace?.hr?.length && tl.hr) {
    let lo = tl.hr.min;
    let hi = tl.hr.max;
    if (hi - lo < 10) {
      const mid = (hi + lo) / 2;
      lo = mid - 5;
      hi = mid + 5;
    }
    y = (v) => T + ((hi - v) / (hi - lo)) * (B - T);
    const pts = hrTrace.hr.map((v, i) => [x(i * hrTrace.step + hrTrace.step / 2), y(v)]);
    const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
    parts.push(
      s('polygon', {
        class: 'wt-area',
        points: `${pts[0][0].toFixed(1)},${B} ${line} ${pts[pts.length - 1][0].toFixed(1)},${B}`,
      }),
    );
    parts.push(s('polyline', { class: 'wt-line', points: line }));
    parts.push(
      s('text', { class: 'wt-axis', x: L - 4, y: y(tl.hr.max) + 4, 'text-anchor': 'end' }, `♥${tl.hr.max}`),
    );
    parts.push(
      s('text', { class: 'wt-axis', x: L - 4, y: y(tl.hr.min) + 4, 'text-anchor': 'end' }, `${tl.hr.min}`),
    );
  }

  // time axis
  parts.push(s('line', { class: 'wt-base', x1: L, x2: R, y1: B, y2: B }));
  const step = tickStep(seconds);
  for (let t = 0; t <= seconds + 0.1; t += step) {
    parts.push(s('line', { class: 'wt-tick', x1: x(t), x2: x(t), y1: B, y2: B + 4 }));
    parts.push(s('text', { class: 'wt-axis', x: x(t), y: B + 15, 'text-anchor': 'middle' }, mmss(t)));
  }

  // shots: a line through the plot, a marker (on the curve when there is one), the arrow number
  // above; a detected shot's set-up, draw and hold as a band ending at its release; between two
  // shots the seconds that passed
  tl.shots.forEach((sh, i) => {
    const sx = x(sh.t);
    if (sh.detected) {
      let end = sh.t;
      for (const [len, cls] of [...phases(sh)].reverse()) {
        if (len > 0) {
          const x0 = x(Math.max(0, end - len));
          parts.push(
            s('rect', {
              class: `wt-ph wt-ph-${cls}`,
              x: x0,
              y: B - 9,
              width: Math.max(1, x(end) - x0),
              height: 7,
            }),
          );
        }
        end -= len;
      }
    }
    const tone = mTone(sh.m);
    parts.push(s('line', { class: `wt-shot is-${tone}`, x1: sx, x2: sx, y1: T - 6, y2: B }));
    const my = y && sh.hr != null ? y(sh.hr) : B - 8;
    parts.push(s('circle', { class: `wt-dot is-${tone}`, cx: sx, cy: my, r: 4.5 }));
    parts.push(
      s(
        'text',
        { class: `wt-no is-${tone}`, x: sx, y: T - 10, 'text-anchor': 'middle' },
        sh.no != null ? `#${sh.no}` : '•',
      ),
    );
    if (sh.gap != null) {
      const px = x(tl.shots[i - 1].t);
      if (sx - px >= 22) {
        parts.push(s('line', { class: 'wt-gapline', x1: px + 3, x2: sx - 3, y1: B + 26, y2: B + 26 }));
        parts.push(
          s(
            'text',
            { class: 'wt-gap', x: (px + sx) / 2, y: B + 40, 'text-anchor': 'middle' },
            `${Math.round(sh.gap)} s`,
          ),
        );
      }
    }
  });

  return s(
    'svg',
    { class: 'wt-chart', viewBox: `0 0 ${VB_W} ${VB_H}`, role: 'img', 'aria-label': timelineLabel(tl) },
    ...parts,
  );
}

const sec = (v) => (v == null ? '–' : v.toFixed(1));

/**
 * A shot's phases in order, [seconds, class]: the set (hook and grip), the set-up (raising the bow,
 * with any pause at the set-up position), then the draw and the time at full draw (anchoring,
 * aiming, expansion - `anchor` in the data); from a watch that does not split those two, one bar.
 */
function phases(sh) {
  return [
    [sh.setup, 'setup'],
    ...(sh.settle != null
      ? [
          [sh.raise, 'draw'],
          [sh.pull, 'settle'],
          [sh.anchor, 'hold'],
        ]
      : [
          [sh.draw, 'draw'],
          [sh.hold, 'hold'],
        ]),
  ];
}

/** The legend's keys. */
export function phaseKeys(split) {
  return [
    h('span', { class: 'wt-key wt-key-setup' }, 'Set'),
    h('span', { class: 'wt-key wt-key-draw' }, 'Set-up'),
    ...(split
      ? [
          h('span', { class: 'wt-key wt-key-settle' }, 'Draw'),
          h('span', { class: 'wt-key wt-key-hold' }, 'Full draw'),
        ]
      : [h('span', { class: 'wt-key wt-key-hold' }, 'Draw + full draw')]),
  ];
}

/**
 * One row per detected shot: its set-up, draw and hold as a stacked bar (seconds written in the
 * segments that are wide enough), so each shot's cycle can be compared with the others.
 */
export function shotCycleChart(tl, { max: span = null, legend = true } = {}) {
  const shots = tl.shots.filter((sh) => sh.detected);
  if (!shots.length) return null;
  const rowH = 22;
  const top = 4;
  const left = 44;
  const right = 296; // room for the total after the longest bar
  const total = (sh) => sh.setup + sh.draw + sh.hold;
  // a linear seconds axis: the same for every shot of the end (or, given `max`, of the session)
  const longest = Math.max(6, span ?? 0, ...shots.map(total));
  const tick = longest <= 8 ? 1 : longest <= 16 ? 2 : 5;
  const max = Math.ceil(longest / tick) * tick;
  const w = (secs) => (secs / max) * (right - left);
  const rowsBottom = top + shots.length * rowH - 4;
  const parts = [];
  for (let t = 0; t <= max + 0.001; t += tick) {
    const x = left + w(t);
    parts.push(
      s('line', { class: t ? 'wt-grid' : 'wt-base', x1: x, x2: x, y1: top - 2, y2: rowsBottom + 2 }),
    );
    parts.push(
      s('text', { class: 'wt-axis', x, y: rowsBottom + 14, 'text-anchor': 'middle' }, t ? `${t}` : '0 s'),
    );
  }
  shots.forEach((sh, i) => {
    const y = top + i * rowH;
    const tone = mTone(sh.m);
    parts.push(
      s(
        'text',
        { class: `wt-no is-${tone}`, x: left - 6, y: y + 13, 'text-anchor': 'end' },
        sh.no != null ? `#${sh.no}` : '•',
      ),
    );
    let x0 = left;
    for (const [len, cls] of phases(sh)) {
      const wd = w(len);
      if (wd > 0) {
        parts.push(s('rect', { class: `wt-ph wt-ph-${cls}`, x: x0, y, width: wd, height: rowH - 6, rx: 3 }));
        if (wd >= 24)
          parts.push(
            s('text', { class: 'wt-ph-text', x: x0 + wd / 2, y: y + 12, 'text-anchor': 'middle' }, sec(len)),
          );
      }
      x0 += wd;
    }
    parts.push(s('text', { class: 'wt-axis', x: x0 + 4, y: y + 12 }, `${sec(total(sh))} s`));
  });
  const height = rowsBottom + 18;
  return h(
    'div',
    { class: 'wt-cycle' },
    legend
      ? h(
          'div',
          { class: 'wt-legend', 'aria-hidden': 'true' },
          ...phaseKeys(shots.some((sh) => sh.settle != null)),
        )
      : null,
    s(
      'svg',
      {
        class: 'wt-chart',
        viewBox: `0 0 ${VB_W} ${height}`,
        role: 'img',
        'aria-label': `Shot cycle: ${shots.map((sh) => `arrow ${sh.no ?? '?'}: set ${sec(sh.setup)}, ${sh.settle != null ? `set-up ${sec(sh.raise)}, draw ${sec(sh.pull)}, full draw ${sec(sh.anchor)}` : `set-up ${sec(sh.draw)}, draw and full draw ${sec(sh.hold)}`} seconds`).join('; ')}`,
      },
      ...parts,
    ),
  );
}

function timelineLabel(tl) {
  const shots = tl.shots.map(
    (sh) =>
      `arrow ${sh.no ?? '?'} at ${mmss(sh.t)}${sh.detected ? (sh.settle != null ? `, draw ${sec(sh.pull)} s, full draw ${sec(sh.anchor)} s` : `, draw and full draw ${sec(sh.hold)} s`) : ''}${sh.m != null ? `, M${sh.m}` : ''}${sh.hr != null ? `, heart rate ${sh.hr}` : ''}`,
  );
  return `End timeline, ${mmss(tl.seconds)}${tl.hr ? `, heart rate ${tl.hr.min} to ${tl.hr.max}` : ''}. ${shots.join('; ')}`;
}

/** The figures and the arrows in the order shot, under the chart. */
function timelineDetails(tl) {
  const tile = (label, value) =>
    h('div', { class: 'wt-tile' }, h('span', { class: 'wt-tile-label' }, label), h('strong', null, value));
  const tiles = h(
    'div',
    { class: 'wt-tiles' },
    tile('Length', mmss(tl.seconds)),
    tile('Shots', String(tl.shots.length)),
    ...(tl.avg
      ? [
          ...(tl.avg.anchor != null
            ? [
                tile('Ø set-up', `${sec(tl.avg.raise)} s`),
                tile('Ø draw', `${sec(tl.avg.pull)} s`),
                tile('Ø full draw', `${sec(tl.avg.anchor)} s`),
                tile('Ø follow-through', `${tl.avg.follow} mm`),
              ]
            : [tile('Ø set-up', `${sec(tl.avg.draw)} s`), tile('Ø draw + full draw', `${sec(tl.avg.hold)} s`)]),
        ]
      : [
          tile('Rhythm', tl.avgGap != null ? `Ø ${tl.avgGap} s` : '–'),
          tile('Heart rate', tl.hr ? `${tl.hr.min}–${tl.hr.max}` : '–'),
        ]),
  );
  const split = tl.shots.some((sh) => sh.settle != null);
  const follow = (sh) =>
    sh.follow == null ? '–' : sh.followOff != null ? `${sh.follow} (${sh.followOff})` : `${sh.follow}`;
  const rows = tl.shots.length
    ? h(
        'div',
        { class: 'wt-table-wrap' },
        h(
          'table',
          { class: 'wt-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ...[
                'Arrow',
                'Time',
                'Set',
                'Set-up',
                ...(split ? ['Draw', 'Full draw', 'Follow mm', 'Back mm'] : ['Draw + full draw']),
                'M',
                'S',
                '♥',
                'Score',
              ].map((c) => h('th', { scope: 'col' }, c)),
            ),
          ),
          h(
            'tbody',
            null,
            tl.shots.map((sh) =>
              h(
                'tr',
                null,
                h(
                  'td',
                  null,
                  h('span', { class: `wt-badge is-${mTone(sh.m)}` }, sh.no != null ? `#${sh.no}` : '–'),
                ),
                h('td', null, mmss(sh.t)),
                h('td', null, sh.detected ? sec(sh.setup) : '–'),
                h('td', null, sh.detected ? sec(sh.raise ?? sh.draw) : '–'),
                ...(split
                  ? [
                      h('td', null, sh.settle != null ? sec(sh.pull) : sh.detected ? sec(sh.hold) : '–'),
                      h('td', null, sh.settle != null ? sec(sh.anchor) : '–'),
                      h('td', null, follow(sh)),
                      h('td', null, sh.followBack ?? '–'),
                    ]
                  : [h('td', null, sh.detected ? sec(sh.hold) : '–')]),
                h('td', null, sh.m ?? '–'),
                h('td', null, sh.s ?? '–'),
                h('td', null, sh.hr ?? '–'),
                h('td', null, sh.v ?? '–'),
              ),
            ),
          ),
        ),
      )
    : h(
        'p',
        { class: 'wt-empty' },
        'No arrows were graded on the watch in this end; its heart rate is kept.',
      );
  const note = split
    ? h(
        'p',
        { class: 'wt-note' },
        'Set: hooking and gripping (not timed with a real bow). Set-up: the hand on the string before the draw, raising the bow, any pause. Draw: the wrist swinging to full draw. Full draw: from reaching full draw to the release (anchoring, aiming, expansion); the watch cannot tell these apart. Follow: how far the hand moves in the first 0.1 s after the release; in brackets, how far that is from this end’s average direction. Back: the part of it straight back along the forearm, towards the elbow.',
      )
    : null;
  return h('div', { class: 'wt-details' }, tiles, shotCycleChart(tl), rows, note);
}

/**
 * The end's timeline as a dialog with OK. Resolves when closed. Nothing (resolves at once) when
 * the end has nothing from the watch.
 */
export function showWatchEnd(end, { title }) {
  const tl = endTimeline(end);
  if (!tl) return Promise.resolve();
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const okBtn = APL.Button({ children: 'OK', onClick: () => close(), fk: 'watch-end-ok' });
    const dialog = APL.Dialog({
      title,
      icon: icons.watch(),
      body: h('div', { class: 'wt' }, timelineChart(tl, { hrTrace: end.hrTrace }), timelineDetails(tl)),
      idPrefix: 'watch-end',
      actions: [okBtn],
    });
    dialog.classList.add('wt-dialog');

    function close() {
      dialog.classList.add('is-out');
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => dialog.close(), reduce ? 0 : 140);
    }
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve();
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });

    document.body.append(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}
