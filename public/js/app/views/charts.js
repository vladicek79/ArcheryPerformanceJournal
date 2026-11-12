// Small SVG charts for Insights: a line chart (trends) and a stacked bar chart (weekly load).
// Each chart is drawn at the real pixel width of its box and redrawn when the box resizes, so text
// stays legible on a phone and on a desktop. Colors come from CSS custom properties (--series-N).
import { h, s } from '../../core/dom.js';

const PAD = { l: 34, r: 12, t: 12, b: 26 };

/** The first and last axis labels are anchored inward so they never run off the chart. */
const edgeAnchor = (i, n) => (n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle');

/** Legend row (always shown for two or more series). */
export function legend(series) {
  if (series.length < 2) return null;
  return h(
    'div',
    { class: 'viz-legend' },
    series.map((x) =>
      h(
        'span',
        { class: 'viz-key' },
        h('span', { class: 'viz-swatch', style: { background: x.color } }),
        x.label,
      ),
    ),
  );
}

/** Mount `draw(width)` into a box that redraws on resize. */
function responsive(height, draw) {
  const box = h('div', { class: 'viz-box', style: { height: `${height}px` } });
  const tip = h('div', { class: 'viz-tip', hidden: true, role: 'status' });
  const wrap = h('div', { class: 'viz' }, box, tip);
  let lastW = 0;
  const render = () => {
    const w = Math.round(box.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    box.replaceChildren(draw(w, tip, wrap));
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(render).observe(box);
  requestAnimationFrame(render);
  return wrap;
}

function showTip(tip, wrap, x, y, lines) {
  tip.replaceChildren(...lines.map((l, i) => h('div', { class: i === 0 ? 'viz-tip-title' : null }, l)));
  tip.hidden = false;
  const wr = wrap.getBoundingClientRect();
  const tw = tip.offsetWidth;
  // keep the tooltip inside the chart, to the right of the pointer unless there is no room
  const left = x + 14 + tw > wr.width ? Math.max(0, x - 14 - tw) : x + 14;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, y - 10)}px`;
}

/**
 * Line chart over sessions in date order.
 * points: [{ label, sub?, values: { key: number|null } }]; series: [{ key, label, color, format }].
 * yDomain [min, max]; invert puts the minimum at the top (grades: 1 is best).
 */
export function lineChart({ points, series, yDomain, yTicks, invert = false, height = 220, onPick }) {
  return responsive(height, (W, tip, wrap) => {
    const H = height;
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const [y0, y1] = yDomain;
    const xAt = (i) => PAD.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
    const yAt = (v) => {
      const f = (v - y0) / (y1 - y0 || 1);
      return PAD.t + (invert ? f : 1 - f) * ih;
    };

    const grid = yTicks.map((v) =>
      s(
        'g',
        null,
        s('line', { x1: PAD.l, x2: W - PAD.r, y1: yAt(v), y2: yAt(v), class: 'viz-grid' }),
        s('text', { x: PAD.l - 6, y: yAt(v) + 4, 'text-anchor': 'end', class: 'viz-axis' }, String(v)),
      ),
    );
    // at most ~6 date labels, spread evenly
    const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 70))));
    const xLabels = points.map((p, i) =>
      i % every === 0 || i === points.length - 1
        ? s('text', { x: xAt(i), y: H - 8, 'text-anchor': edgeAnchor(i, points.length), class: 'viz-axis' }, p.label)
        : null,
    );

    const lines = series.map((sr) => {
      // break the line where a session has no value
      let d = '';
      let pen = false;
      points.forEach((p, i) => {
        const v = p.values[sr.key];
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`;
        pen = true;
      });
      const dots = points.map((p, i) =>
        p.values[sr.key] == null
          ? null
          : s('circle', {
              cx: xAt(i),
              cy: yAt(p.values[sr.key]),
              r: 4,
              class: 'viz-dot',
              style: { fill: sr.color },
            }),
      );
      return s(
        'g',
        null,
        s('path', {
          d,
          fill: 'none',
          'stroke-width': 2,
          'stroke-linejoin': 'round',
          style: { stroke: sr.color },
        }),
        dots,
      );
    });

    const cross = s('line', { y1: PAD.t, y2: PAD.t + ih, class: 'viz-cross', visibility: 'hidden' });
    const svg = s(
      'svg',
      {
        width: W,
        height: H,
        viewBox: `0 0 ${W} ${H}`,
        role: 'img',
        'aria-label': series.map((x) => x.label).join(' and ') + ' per session',
      },
      grid,
      xLabels,
      cross,
      lines,
    );

    const nearest = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ev.clientX - r.left;
      if (points.length < 2) return 0;
      return Math.max(0, Math.min(points.length - 1, Math.round(((x - PAD.l) / iw) * (points.length - 1))));
    };
    svg.addEventListener('pointermove', (ev) => {
      if (!points.length) return;
      const i = nearest(ev);
      const p = points[i];
      cross.setAttribute('x1', xAt(i));
      cross.setAttribute('x2', xAt(i));
      cross.setAttribute('visibility', 'visible');
      const r = svg.getBoundingClientRect();
      showTip(tip, wrap, xAt(i), ev.clientY - r.top, [
        p.label + (p.sub ? ` · ${p.sub}` : ''),
        ...series.map((sr) => `${sr.label}: ${p.values[sr.key] == null ? '–' : sr.format(p.values[sr.key])}`),
      ]);
    });
    svg.addEventListener('pointerleave', () => {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
    });
    if (onPick) {
      svg.style.cursor = 'pointer';
      svg.addEventListener('click', (ev) => points.length && onPick(points[nearest(ev)]));
    }
    return svg;
  });
}

/** Rectangle with rounded top corners (the data end of a bar). */
function topRounded(x, y, w, hgt, r) {
  const rr = Math.min(r, w / 2, hgt);
  return `M${x} ${y + hgt}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + hgt}Z`;
}

/**
 * Stacked bar chart. bars: [{ label, tip, values: { key: number } }]; series: [{ key, label, color }].
 * Segments are stacked in series order with a 2px surface gap; the top segment has rounded corners.
 */
export function stackedBars({ bars, series, height = 220, yLabel = '' }) {
  return responsive(height, (W, tip, wrap) => {
    const H = height;
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const maxTotal = Math.max(
      1,
      ...bars.map((b) => series.reduce((t, sr) => t + (b.values[sr.key] || 0), 0)),
    );
    // a round step (1, 2, 5 × 10ⁿ) giving about four gridlines
    const raw = maxTotal <= 5 ? 1 : maxTotal / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw);
    const top = Math.ceil(maxTotal / step) * step;
    const yAt = (v) => PAD.t + ih - (v / top) * ih;
    const ticks = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    const slot = iw / Math.max(1, bars.length);
    const bw = Math.max(3, Math.min(28, slot * 0.6));
    const every = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(iw / 70))));

    const grid = ticks.map((v) =>
      s(
        'g',
        null,
        s('line', { x1: PAD.l, x2: W - PAD.r, y1: yAt(v), y2: yAt(v), class: 'viz-grid' }),
        s('text', { x: PAD.l - 6, y: yAt(v) + 4, 'text-anchor': 'end', class: 'viz-axis' }, String(v)),
      ),
    );
    const marks = bars.map((b, i) => {
      const x = PAD.l + i * slot + (slot - bw) / 2;
      let acc = 0;
      const present = series.filter((sr) => b.values[sr.key]);
      const segs = present.map((sr, j) => {
        const v = b.values[sr.key];
        const yTop = yAt(acc + v);
        const hgt = yAt(acc) - yTop;
        acc += v;
        const isTop = j === present.length - 1;
        return isTop
          ? s('path', { d: topRounded(x, yTop, bw, hgt, 4), class: 'viz-seg', style: { fill: sr.color } })
          : s('rect', { x, y: yTop, width: bw, height: hgt, class: 'viz-seg', style: { fill: sr.color } });
      });
      // a wider invisible hit target for the hover tooltip
      const hit = s('rect', { x: PAD.l + i * slot, y: PAD.t, width: slot, height: ih, fill: 'transparent' });
      hit.addEventListener('pointermove', (ev) => {
        const r = wrap.getBoundingClientRect();
        showTip(tip, wrap, ev.clientX - r.left, ev.clientY - r.top, b.tip);
      });
      hit.addEventListener('pointerleave', () => (tip.hidden = true));
      const label =
        i % every === 0 || i === bars.length - 1
          ? s('text', { x: x + bw / 2, y: H - 8, 'text-anchor': edgeAnchor(i, bars.length), class: 'viz-axis' }, b.label)
          : null;
      return s('g', null, segs, label, hit);
    });
    return s(
      'svg',
      { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': yLabel },
      grid,
      marks,
    );
  });
}
