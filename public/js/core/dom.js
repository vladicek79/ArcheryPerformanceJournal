// Tiny DOM builder. Text is always added as text nodes (never innerHTML).
// Styles are set through the CSSOM so the strict CSP (no inline style attributes) is respected.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  return build(document.createElement(tag), props, children, false);
}

export function s(tag, props, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children, true);
}

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate']);

function build(el, props, children, isSvg) {
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'style') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'ref' && typeof v === 'function') v(el);
      else if (!isSvg && PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Format an ISO date (YYYY-MM-DD) for display. */
export function formatDate(isoDate, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts);
}

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
