/*
 * Small shared helpers and constants used across the app.
 */

const SVGNS = 'http://www.w3.org/2000/svg';

/** Diagram colours. The diagram is always drawn as dark ink on white paper, whatever the UI theme. */
const INK = '#111111';
const CURVE = '#87ceeb';

const $ = s => document.querySelector(s);

/** Create an SVG element with attributes, optionally appending it to a parent. */
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

/** Build a single HTML element from a markup string. */
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Ids for nodes ("n12") and edges ("e13"). `uid` is bumped past saved ids when a diagram is loaded. */
let uid = 1;
const nid = prefix => prefix + uid++;
