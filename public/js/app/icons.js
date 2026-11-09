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
  help: () => icon(16, c(12, 12, 9), p('M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14'), p('M12 17h.01')),
  settings: () =>
    icon(
      20,
      c(12, 12, 3),
      p(
        'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
      ),
    ),
  undo: () => icon(20, p('M9 14 4 9l5-5'), p('M4 9h11a5 5 0 0 1 0 10h-3')),
  back: () => icon(20, p('m15 18-6-6 6-6')),
  forward: () => icon(20, p('m9 18 6-6-6-6')),
  close: () => icon(18, p('M6 6l12 12M18 6 6 18')),
  trash: () => icon(18, p('M3 6h18'), p('M8 6V4h8v2'), p('M19 6l-1 14H6L5 6')),
  log: () => icon(22, c(12, 12, 9), c(12, 12, 5), c(12, 12, 1)),
  dashboard: () => icon(22, s('rect', { x: 3, y: 3, width: 7, height: 9, rx: 1.5 }), s('rect', { x: 14, y: 3, width: 7, height: 5, rx: 1.5 }), s('rect', { x: 14, y: 12, width: 7, height: 9, rx: 1.5 }), s('rect', { x: 3, y: 16, width: 7, height: 5, rx: 1.5 })),
  history: () => icon(22, p('M4 19V5'), p('M4 19h16'), p('M8 15l4-5 3 3 5-6')),
  gear: () =>
    icon(22, p('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12'), c(16, 6, 2), c(10, 12, 2), c(18, 18, 2)),
  sights: () => icon(22, c(12, 12, 7), p('M12 2v5M12 17v5M2 12h5M17 12h5')),
  logo: () =>
    s(
      'svg',
      { width: 28, height: 28, viewBox: '-100 -100 200 200', 'aria-hidden': 'true', focusable: 'false' },
      s('circle', { r: 96, fill: '#FFFFFF' }),
      s('circle', { r: 76, fill: '#1A1A1A' }),
      s('circle', { r: 58, fill: '#00A2E8' }),
      s('circle', { r: 40, fill: '#D22B2B' }),
      s('circle', { r: 20, fill: '#FFE11A' }),
    ),
};
