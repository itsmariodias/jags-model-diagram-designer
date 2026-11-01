/*
 * Workspace files: save the JAGS code, the diagram and the display settings to a .json file,
 * and open one again (File menu, Ctrl/⌘+S, Ctrl/⌘+O, or dropping a file on the page).
 *
 * Undo history is not saved, and opening a file starts a fresh one. If the current work has
 * changed since it was last saved or opened, opening another file first asks whether to save it.
 * Files can come from anyone, so everything read from one is checked before it is used.
 */

const WORKSPACE_APP = 'jags-model-diagram-designer';
const BAD_WORKSPACE = 'That file isn’t a workspace saved by this app.';

function workspaceFromState() {
  return {
    app: WORKSPACE_APP,
    version: 1,
    code: $('#code').value,
    settings: state.settings,
    nodes: state.nodes.map(clean),
    edges: state.edges,
  };
}

/** Short fingerprint of the workspace, to tell whether it changed since it was last saved. */
function workspaceKey() {
  const { code, settings, nodes, edges } = workspaceFromState();
  const s = JSON.stringify({ code, settings, nodes, edges });
  // cyrb53 string hash
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

const isDirty = () => savedKey !== workspaceKey();

function updateDirty() {
  const btn = $('#btnFile'),
    dirty = isDirty();
  btn.classList.toggle('dirty', dirty);
  btn.title = dirty ? 'Unsaved changes' : '';
  btn.setAttribute('aria-label', dirty ? 'File (unsaved changes)' : 'File');
}

/** The current workspace counts as saved from now on. */
function markSaved() {
  savedKey = workspaceKey();
  persist();
}

/** Check a parsed file and keep only what the app understands. Throws on anything unusable. */
function parseWorkspace(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.nodes)) throw new Error(BAD_WORKSPACE);
  if (o.app !== undefined && o.app !== WORKSPACE_APP) throw new Error(BAD_WORKSPACE);
  const isStr = v => typeof v === 'string';
  const isNum = v => typeof v === 'number' && isFinite(v);
  const isId = v => isStr(v) || isNum(v);

  const nodes = [],
    ids = new Set();
  for (const x of o.nodes) {
    if (!x || typeof x !== 'object' || !isId(x.id) || ids.has(String(x.id))) continue;
    if (!['dist', 'expr', 'data'].includes(x.kind) || !isNum(x.cx) || !isNum(x.cy)) continue;
    const n = { id: String(x.id), kind: x.kind, cx: x.cx, cy: x.cy };
    if (x.kind === 'dist') n.dist = isStr(x.dist) && DISTS[x.dist] ? x.dist : 'generic';
    for (const k of ['tex', 'name', 'info']) if (isStr(x[k])) n[k] = x[k];
    for (const k of ['size', 'dx', 'dy']) if (isNum(x[k])) n[k] = x[k];
    if (typeof x.brace === 'boolean') n.brace = x.brace;
    ids.add(n.id);
    nodes.push(n);
  }
  if (!nodes.length) throw new Error(BAD_WORKSPACE);

  const edges = [],
    edgeIds = new Set();
  for (const x of Array.isArray(o.edges) ? o.edges : []) {
    if (!x || typeof x !== 'object' || !isId(x.id) || edgeIds.has(String(x.id))) continue;
    if (!ids.has(String(x.from)) || !ids.has(String(x.to)) || !['~', '='].includes(x.type))
      continue;
    edgeIds.add(String(x.id));
    edges.push({
      id: String(x.id),
      from: String(x.from),
      to: String(x.to),
      anchor: isStr(x.anchor) && x.anchor ? x.anchor : null,
      type: x.type,
      index: isStr(x.index) ? x.index : '',
    });
  }

  const s = o.settings && typeof o.settings === 'object' ? o.settings : {};
  const clamp = (v, lo, hi, d) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const settings = {
    math: clamp(s.math, 16, 48, 28),
    icon: clamp(s.icon, 0.6, 1.8, 1),
    gap: clamp(s.gap, 20, 180, 64),
  };
  return { code: isStr(o.code) ? o.code : '', settings, nodes, edges };
}

/** Replace the current workspace with a checked one; undo history starts afresh. */
function applyWorkspace(ws, name) {
  state.nodes = ws.nodes;
  state.edges = ws.edges;
  state.settings = ws.settings;
  state.code = ws.code;
  $('#code').value = ws.code;
  bumpUid(ws.nodes, ws.edges);
  workspaceName = name;
  sel = null;
  renderAll();
  fit();
  renderInspector();
  msgs = [{ t: 'note', m: `Opened ${name}.` }];
  showMsgs();
  resetHistory();
  markSaved();
  toast('Opened ' + name);
}

function saveWorkspace() {
  download(workspaceName, JSON.stringify(workspaceFromState(), null, 2), 'application/json');
  markSaved();
}

async function openWorkspaceFile(file) {
  try {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      throw new Error(BAD_WORKSPACE);
    }
    applyWorkspace(parseWorkspace(parsed), file.name);
  } catch (err) {
    toast(err.message || BAD_WORKSPACE);
  }
}

/**
 * Run \`next\` now if there's nothing unsaved; otherwise ask first (Save first / Don't save /
 * Cancel). \`next\` runs inside the button's click, so it may open the file picker.
 */
function confirmUnsaved(next) {
  if (!isDirty()) return next();
  const dlg = $('#unsavedDialog');
  const finish = go => {
    dlg.close();
    if (go) next();
  };
  $('#dlgSave').onclick = () => {
    saveWorkspace();
    finish(true);
  };
  $('#dlgDiscard').onclick = () => finish(true);
  $('#dlgCancel').onclick = () => finish(false);
  dlg.oncancel = e => {
    e.preventDefault(); // Escape: close it ourselves so the handlers above are the only path
    finish(false);
  };
  dlg.showModal();
  $('#dlgSave').focus();
}

function openWorkspace() {
  confirmUnsaved(() => $('#fileInput').click());
}

function initWorkspace() {
  const input = $('#fileInput');
  input.addEventListener('change', () => {
    const f = input.files[0];
    input.value = ''; // so the same file can be opened again
    if (f) openWorkspaceFile(f);
  });
  $('#btnOpen').addEventListener('click', openWorkspace);
  $('#btnSave').addEventListener('click', saveWorkspace);

  // shortcut hints that match the platform
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  $('#btnOpen .note').textContent = mac ? '⌘O' : 'Ctrl+O';
  $('#btnSave .note').textContent = mac ? '⌘S' : 'Ctrl+S';
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    if ($('#unsavedDialog').open) return;
    const k = e.key.toLowerCase();
    if (k === 's') {
      e.preventDefault(); // not the browser's "Save page"
      saveWorkspace();
    } else if (k === 'o') {
      e.preventDefault();
      openWorkspace();
    }
  });

  // drop a workspace file anywhere on the page
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    document.body.classList.add('dropping');
  });
  document.addEventListener('dragleave', e => {
    if (!e.relatedTarget) document.body.classList.remove('dropping');
  });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // otherwise the browser navigates to the file
    document.body.classList.remove('dropping');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') {
      toast('Drop a .json workspace file to open it');
      return;
    }
    confirmUnsaved(() => openWorkspaceFile(f));
  });
  updateDirty();
}
