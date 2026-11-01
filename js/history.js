/*
 * Undo / redo for the diagram.
 *
 * Every save() records a snapshot of the nodes, arrows and display settings, so anything that
 * autosaves can be undone, including Auto-layout and redrawing from code. Pan and zoom are not
 * recorded, and the code editor keeps the browser's own undo. History lasts for the session.
 */

const HISTORY_LIMIT = 100;
const hist = { past: [], future: [], current: null };

const snapshot = () =>
  JSON.stringify({ nodes: state.nodes.map(clean), edges: state.edges, settings: state.settings });

/** Add the current diagram as a new step, unless nothing changed since the last one. */
function recordHistory() {
  const s = snapshot();
  if (s === hist.current) return;
  if (hist.current !== null) {
    hist.past.push(hist.current);
    if (hist.past.length > HISTORY_LIMIT) hist.past.shift();
  }
  hist.current = s;
  hist.future = [];
  updateHistoryButtons();
}

function undo() {
  persist(); // an edit still waiting on the save debounce becomes its own step first
  if (!hist.past.length) return;
  hist.future.push(hist.current);
  restoreSnapshot(hist.past.pop());
}

function redo() {
  persist();
  if (!hist.future.length) return;
  hist.past.push(hist.current);
  restoreSnapshot(hist.future.pop());
}

function restoreSnapshot(s) {
  hist.current = s;
  const before = new Set(state.nodes.map(n => n.id));
  const o = JSON.parse(s);
  state.nodes = o.nodes;
  state.edges = o.edges;
  state.settings = o.settings;
  // keep the selection only if what it points at still exists
  if (sel && !(sel.t === 'node' ? byId(sel.id) : state.edges.some(e => e.id === sel.id)))
    sel = null;
  renderAll();
  // a whole different set of nodes (undoing or redoing a redraw from code): bring it into view
  if (!state.nodes.some(n => before.has(n.id))) fit();
  renderInspector();
  persist();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('#btnUndo').disabled = !hist.past.length;
  $('#btnRedo').disabled = !hist.future.length;
}

function initHistory() {
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.target.closest('input,textarea,select')) return; // let text fields undo their own typing
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      redo();
    }
  });
  updateHistoryButtons();
}
