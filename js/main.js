/*
 * Entry point: wires up the toolbar and code editor, then boots once MathJax is ready.
 */

function showMsgs() {
  const ul = $('#msgs');
  ul.replaceChildren();
  msgs.forEach(m => {
    const li = document.createElement('li');
    li.className = m.t === 'err' ? 'err' : m.t === 'warn' ? 'warn' : '';
    if (m.line) {
      // an error on a known line: clicking it selects that line in the editor
      const b = h('<button class="msg-link" title="Show this line in the code"></button>');
      b.textContent = m.m;
      b.addEventListener('click', () => selectLine(m.line));
      li.append(b);
    } else li.textContent = m.m;
    ul.append(li);
  });
}

/** Select line n (from 1) of the code editor and scroll it into view. */
function selectLine(n) {
  const t = $('#code'),
    lines = t.value.split('\n');
  const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
  t.focus();
  t.setSelectionRange(start, start + (lines[n - 1] || '').length);
  const lh = parseFloat(getComputedStyle(t).lineHeight) || 20;
  t.scrollTop = Math.max(0, (n - 3) * lh);
}

/** Show whether the code still matches what the diagram was drawn from. */
function updateSync() {
  const d = state.drawn.code;
  const off = d != null && $('#code').value !== d;
  $('#syncNote').hidden = !off;
  $('#btnDraw').classList.toggle('attention', off);
  // the examples menu shows an example only while the code is exactly that example
  const ex = $('#example');
  if (ex.value && EXAMPLES[ex.value] !== $('#code').value) ex.value = '';
}

/** Run next() now, or after asking, if a redraw would replace changes made to the diagram by hand. */
function confirmRedraw(next, onCancel) {
  if (!isEdited()) return next();
  askDialog($('#redrawDialog'), $('#dlgRedraw'), { dlgRedraw: next, dlgKeep: onCancel });
}

/**
 * Parse the JAGS code, replace the diagram with the result and auto-layout it. Asks first if
 * the diagram has been changed by hand, unless `force`. On start-up (`quiet`) an error doesn't
 * take the focus.
 */
function drawFromCode({ force = false, quiet = false } = {}) {
  if (!force && isEdited()) return confirmRedraw(() => drawFromCode({ force: true }));
  const code = $('#code').value;
  try {
    const r = buildFromJAGS(code);
    state.nodes = r.nodes;
    state.edges = r.edges;
    msgs = r.msgs;
    sel = null;
    autoLayout();
    state.drawn = { code, key: diagramKey() };
    renderInspector();
  } catch (err) {
    msgs = [{ t: 'err', m: (err.line ? `Line ${err.line}: ` : '') + err.message, line: err.line }];
    if (!(err instanceof JagsError)) console.error(err);
    if (err.line && !quiet) selectLine(err.line);
  }
  showMsgs();
  updateSync();
  save();
}

function wire() {
  $('#btnDraw').addEventListener('click', () => drawFromCode());
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

  let shownExample = '';
  $('#example').addEventListener('change', e => {
    const v = e.target.value;
    if (!v) return;
    confirmRedraw(
      () => {
        shownExample = v;
        $('#code').value = EXAMPLES[v];
        drawFromCode({ force: true });
        $('#example').value = v;
      },
      () => ($('#example').value = shownExample),
    );
  });

  $('#code').addEventListener('input', () => {
    updateSync();
    shownExample = $('#example').value;
    save();
  });
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

  initSplitter();
  initCanvasInteraction();
  initHistory();
  initMenus();
  initWorkspace();
  initThemeToggle();
}

/** Drag the code pane's right edge to make the editor wider; the width is remembered. */
function initSplitter() {
  const app = $('.app'),
    handle = $('#splitter'),
    KEY = 'jmd-code-width';
  const set = w => {
    w = Math.round(Math.min(720, Math.max(260, w)));
    app.style.setProperty('--code-w', w + 'px');
    handle.setAttribute('aria-valuenow', w);
    return w;
  };
  try {
    const w = +localStorage.getItem(KEY);
    if (w) set(w);
  } catch (e) {}
  const store = w => {
    try {
      localStorage.setItem(KEY, String(w));
    } catch (e) {}
  };
  const pane = $('.pane.code');
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX,
      w0 = pane.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    const move = ev => {
      set(w0 + ev.clientX - x0);
      window.dispatchEvent(new Event('resize'));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      store(set(pane.getBoundingClientRect().width));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  // keyboard: arrows resize by 20 px
  handle.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const w = pane.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 20 : -20);
    store(set(w));
    window.dispatchEvent(new Event('resize'));
  });
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
  } else drawFromCode({ quiet: true });
  updateSync();
  persist(); // the starting point for undo
  if (!had) markSaved(); // a fresh start has nothing unsaved yet
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
