/*
 * App state and persistence.
 *
 * The diagram (nodes, edges), the JAGS code and the display settings are autosaved to
 * localStorage so a reload picks up where you left off. Properties starting with "_" on nodes
 * are render-time caches and are never saved.
 */

const STORE = 'jags-model-diagram-designer-v1';

let state = {
  nodes: [],
  edges: [],
  code: EXAMPLES.gamma5,
  settings: { math: 28, icon: 1, gap: 64 },
};

let sel = null; // current selection: { t: 'node' | 'edge', id } or null
let view = { x: 0, y: 0, k: 1 }; // canvas pan (x, y) and zoom (k)
let msgs = []; // notes and errors shown under the code editor

const svg = $('#canvas'),
  vp = $('#vp'),
  nodesL = $('#nodesL'),
  edgesL = $('#edgesL');

const byId = id => state.nodes.find(n => n.id === id);
let saveT = 0;

function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({
          code: $('#code').value,
          settings: state.settings,
          nodes: state.nodes.map(clean),
          edges: state.edges,
        }),
      );
    } catch (e) {}
  }, 300);
}

function clean(n) {
  const o = {};
  for (const k in n) if (k[0] !== '_') o[k] = n[k];
  return o;
}

/** Restore the last saved diagram. Returns true if there was one. */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && Array.isArray(s.nodes) && s.nodes.length) {
      state = { ...state, ...s, settings: { ...state.settings, ...(s.settings || {}) } };
      const ids = [...s.nodes, ...s.edges].map(x => +String(x.id).replace(/\D/g, '') || 0);
      uid = Math.max(0, ...ids) + 1;
      return true;
    }
  } catch (e) {}
  return false;
}
