// Inline stroke icons (no icon font, no network).
import { s } from '../core/dom.js';

function icon(size, ...children) {
  return s(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...children,
  );
}

const p = (d) => s('path', { d });
const c = (cx, cy, r) => s('circle', { cx, cy, r });

export const icons = {
  coffee: () => icon(22, p('M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z'), p('M17 11h1.5a2.5 2.5 0 0 1 0 5H17'), p('M8 3v3M12 3v3')),
  help: () => icon(16, c(12, 12, 9), p('M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14'), p('M12 17h.01')),
  settings: () =>
    icon(
      20,
      c(12, 12, 3),
      p(
        'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
      ),
    ),
  pause: () => icon(16, p('M9 5v14'), p('M15 5v14')),
  play: () => icon(16, p('M8 5l11 7-11 7z')),
  undo: () => icon(20, p('M9 14 4 9l5-5'), p('M4 9h11a5 5 0 0 1 0 10h-3')),
  back: () => icon(20, p('m15 18-6-6 6-6')),
  forward: () => icon(20, p('m9 18 6-6-6-6')),
  calendar: () => icon(18, s('rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }), p('M3 10h18'), p('M8 3v4M16 3v4')),
  erase: () => icon(22, p('M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z'), p('M17 9l-5 6M12 9l5 6')),
  camera: () => icon(20, p('M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'), c(12, 13, 3.5)),
  plus: () => icon(20, p('M12 5v14M5 12h14')),
  more: () => icon(22, c(5, 12, 1.2), c(12, 12, 1.2), c(19, 12, 1.2)),
  chevron: () => icon(16, p('m9 6 6 6-6 6')),
  copy: () => icon(18, s('rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }), p('M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3')),
  pencil: () => icon(18, p('M4 20h4L19 9l-4-4L4 16z'), p('M13.5 6.5l4 4')),
  check: () => icon(18, p('M5 12.5l4.5 4.5L19 7.5')),
  clock: () => icon(18, c(12, 12, 9), p('M12 7v5l3 2')),
  close: () => icon(18, p('M6 6l12 12M18 6 6 18')),
  trash: () => icon(18, p('M3 6h18'), p('M8 6V4h8v2'), p('M19 6l-1 14H6L5 6')),
  // Clear (an arrow): a bin with its lid and two ribs
  clear: () => icon(18, p('M4 7h16'), p('M9.5 7V4.5h5V7'), p('M6.5 7l1 12.5h9l1-12.5'), p('M10.5 11v5M13.5 11v5')),
  log: () => icon(22, c(12, 12, 9), c(12, 12, 5), c(12, 12, 1)),
  dashboard: () => icon(22, s('rect', { x: 3, y: 3, width: 7, height: 9, rx: 1.5 }), s('rect', { x: 14, y: 3, width: 7, height: 5, rx: 1.5 }), s('rect', { x: 14, y: 12, width: 7, height: 9, rx: 1.5 }), s('rect', { x: 3, y: 16, width: 7, height: 5, rx: 1.5 })),
  history: () => icon(22, p('M4 19V5'), p('M4 19h16'), p('M8 15l4-5 3 3 5-6')),
  insights: () => icon(22, p('M4 20h16'), p('M7 16v-5'), p('M12 16V6'), p('M17 16v-8')),
  gear: () =>
    icon(22, p('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12'), c(16, 6, 2), c(10, 12, 2), c(18, 18, 2)),
  sights: () => icon(22, c(12, 12, 7), p('M12 2v5M12 17v5M2 12h5M17 12h5')),
};
