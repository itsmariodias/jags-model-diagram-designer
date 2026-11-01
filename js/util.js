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

/** Is el a box you type text into (where Ctrl/⌘+Z should undo typing), rather than a slider, button or checkbox? */
const isTextField = el =>
  !!el &&
  !!el.closest &&
  (!!el.closest('textarea, [contenteditable]') ||
    (el.tagName === 'INPUT' && /^(text|search|number|email|url|tel|password)$/.test(el.type)));

/** Short string fingerprint (cyrb53), used to tell whether something changed. */
function hash(s) {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Show a modal <dialog>. `actions` maps button ids to what each one does; other buttons just
 * close it. Escape counts as clicking the button marked data-cancel. Actions run inside the
 * button's click, so they may open a file picker.
 */
function askDialog(dlg, focus, actions) {
  dlg.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      dlg.close();
      if (actions[b.id]) actions[b.id]();
    };
  });
  dlg.oncancel = e => {
    e.preventDefault(); // Escape: go through the cancel button so its action runs too
    dlg.querySelector('[data-cancel]').click();
  };
  dlg.showModal();
  focus.focus();
}
