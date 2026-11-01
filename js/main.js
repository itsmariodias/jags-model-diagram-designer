/*
 * Entry point: wires up the toolbar and code editor, then boots once MathJax is ready.
 */

function showMsgs() {
  const ul = $('#msgs');
  ul.replaceChildren();
  msgs.forEach(m => {
    const li = document.createElement('li');
    li.className = m.t === 'err' ? 'err' : m.t === 'warn' ? 'warn' : '';
    li.textContent = m.m;
    ul.append(li);
  });
}

/** Parse the JAGS code, replace the diagram with the result and auto-layout it. */
function drawFromCode() {
  try {
    const r = buildFromJAGS($('#code').value);
    state.nodes = r.nodes;
    state.edges = r.edges;
    msgs = r.msgs;
    sel = null;
    autoLayout();
    renderInspector();
  } catch (err) {
    msgs = [{ t: 'err', m: (err.line ? `Line ${err.line}: ` : '') + err.message }];
    if (!(err instanceof JagsError)) console.error(err);
  }
  showMsgs();
  save();
}

function wire() {
  $('#btnDraw').addEventListener('click', drawFromCode);
  $('#btnLayout').addEventListener('click', () => {
    autoLayout();
    toast('Arranged in layers');
  });
  $('#btnFit').addEventListener('click', fit);
  $('#btnAddDist').addEventListener('click', () => addNode('dist'));
  $('#btnAddExpr').addEventListener('click', () => addNode('expr'));
  $('#btnAddLabel').addEventListener('click', () => addNode('data'));
  $('#btnCopy').addEventListener('click', copySVG);
  $('#btnSvg').addEventListener('click', saveSVG);
  $('#btnPng').addEventListener('click', savePNG);

  $('#example').addEventListener('change', e => {
    const v = e.target.value;
    if (!v) return;
    $('#code').value = EXAMPLES[v];
    e.target.value = '';
    drawFromCode();
  });

  $('#code').addEventListener('input', save);
  $('#code').addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const t = e.target;
      t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end');
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      drawFromCode();
    }
  });

  // refit when the canvas width changes noticeably; always redraw edges (label positions shift)
  let lastW = 0,
    resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const w = svg.getBoundingClientRect().width;
      if (Math.abs(w - lastW) > 40) {
        lastW = w;
        fit();
      }
      drawEdges();
    }, 150);
  });

  initCanvasInteraction();
  initHistory();
  initMenus();
  initThemeToggle();
}

let booted = false;
window.jmdBoot = function () {
  if (booted) return;
  booted = true;
  $('#loading').remove();
  const had = load();
  $('#code').value = state.code || EXAMPLES.gamma5;
  if (had) {
    renderAll();
    fit();
    renderInspector();
    msgs = [{ t: 'note', m: 'Restored your last diagram. Redraw from code to start over.' }];
    showMsgs();
  } else drawFromCode();
  persist(); // the starting point for undo
};

wire();
applyView();
renderInspector();

// MathJax may already be ready by the time this script runs
if (window.MathJax && MathJax.startup && MathJax.startup.promise && MathJax.tex2svg)
  MathJax.startup.promise.then(() => window.jmdBoot());

setTimeout(() => {
  if (!booted) {
    const l = $('#loading');
    if (l) l.textContent = 'Math typesetting did not load. Check your connection and reload.';
  }
}, 15000);
