/*
 * App state and persistence.
 *
 * The diagram (nodes, edges), the JAGS code and the display settings are autosaved to
 * localStorage so a reload picks up where you left off. Properties starting with "_" on nodes
 * are render-time caches and are never saved. Saving to and opening workspace files lives in
 * workspace.js; the autosave also remembers whether the work has been saved to a file since its
 * last change (savedKey) and under which file name.
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
let savedKey = null; // workspaceKey() when last saved to / opened from a file (see workspace.js)
let workspaceName = 'jags-diagram.json'; // file name used by Save workspace

/** Call after any change: records an undo step and autosaves, debounced so a drag or a burst of typing counts once. */
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(persist, 300);
}

/** Run a pending save() right away. */
function persist() {
  clearTimeout(saveT);
  recordHistory();
  updateDirty();
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({
        code: $('#code').value,
        settings: state.settings,
        nodes: state.nodes.map(clean),
        edges: state.edges,
        savedKey,
        workspaceName,
      }),
    );
  } catch (e) {}
}

function clean(n) {
  const o = {};
  for (const k in n) if (k[0] !== '_') o[k] = n[k];
  return o;
}

/** Make sure ids for new nodes and arrows ("n12", "e13") don't clash with loaded ones. */
function bumpUid(nodes, edges) {
  const ids = [...nodes, ...edges].map(x => +String(x.id).replace(/\D/g, '') || 0);
  uid = Math.max(uid, Math.max(0, ...ids) + 1);
}

/** Restore the last autosaved diagram. Returns true if there was one. */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && Array.isArray(s.nodes) && s.nodes.length) {
      const { savedKey: k, workspaceName: name, ...saved } = s;
      state = { ...state, ...saved, settings: { ...state.settings, ...(s.settings || {}) } };
      savedKey = typeof k === 'string' ? k : null;
      if (typeof name === 'string' && name) workspaceName = name;
      bumpUid(s.nodes, s.edges || []);
      return true;
    }
  } catch (e) {}
  return false;
}
