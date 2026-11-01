/*
 * Entry point: wires up the toolbar and code editor, then boots once MathJax is ready.
 */

function showMsgs() {
  updateGutter();
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
  // how far down the line is: lay the text before it out in a hidden copy of the editor
  const cs = getComputedStyle(t);
  const m = document.createElement('div');
  for (const k of [
    'font',
    'lineHeight',
    'padding',
    'border',
    'whiteSpace',
    'overflowWrap',
    'tabSize',
  ])
    m.style[k] = cs[k];
  Object.assign(m.style, {
    position: 'absolute',
    visibility: 'hidden',
    boxSizing: cs.boxSizing,
    width: t.clientWidth + 'px',
  });
  m.textContent = t.value.slice(0, start) + '.';
  document.body.append(m);
  const y = m.scrollHeight;
  m.remove();
  t.scrollTop = Math.max(0, y - t.clientHeight / 3);
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

/**
 * New diagram nodes take the place of the old ones they stand for (matched by the statement
 * they come from), keeping their position, size and label position. Nodes the code doesn't make
 * (labels and titles you added) are kept too. Returns how many nodes kept their place.
 */
function carryLayout(old) {
  const pool = {},
    newId = {};
  old.nodes.forEach(o => o.info && (pool[o.kind + '|' + o.info] ||= []).push(o));
  let kept = 0,
    sx = 0,
    sy = 0;
  const fresh = [];
  for (const n of state.nodes) {
    const o = n.info && (pool[n.kind + '|' + n.info] || []).shift();
    if (!o) {
      fresh.push(n);
      continue;
    }
    sx += o.cx - n.cx;
    sy += o.cy - n.cy;
    kept++;
    newId[o.id] = n.id;
    for (const k of ['cx', 'cy', 'size', 'dx', 'dy']) if (o[k] != null) n[k] = o[k];
  }
  // nodes that are new in the code: keep their place relative to the rest, clear of others
  if (kept)
    fresh.forEach(n => {
      n.cx += sx / kept;
      n.cy += sy / kept;
    });
  const added = old.nodes.filter(o => !o.info);
  added.forEach(o => (newId[o.id] = o.id));
  state.nodes.push(...added);
  for (const e of old.edges)
    if (
      (added.some(o => o.id === e.from) || added.some(o => o.id === e.to)) &&
      newId[e.from] &&
      newId[e.to]
    )
      state.edges.push({ ...e, from: newId[e.from], to: newId[e.to] });
  renderAll();
  if (kept) fresh.forEach(n => (findFreeSpot(n), renderAll()));
  return kept;
}

/**
 * Parse the JAGS code, replace the diagram with the result and auto-layout it. If the diagram
 * has been changed by hand, asks first (unless `force`), offering to keep its layout. On
 * start-up (`quiet`) an error doesn't take the focus.
 */
function drawFromCode({ force = false, quiet = false, keepLayout = false } = {}) {
  if (!force && isEdited())
    return askDialog($('#redrawDialog'), $('#dlgRedraw'), {
      dlgRedraw: () => drawFromCode({ force: true, keepLayout: true }),
      dlgFresh: () => drawFromCode({ force: true }),
    });
  const code = $('#code').value;
  const old = { nodes: state.nodes.map(clean), edges: state.edges },
    oldView = { ...view };
  try {
    const r = buildFromJAGS(code);
    state.nodes = r.nodes;
    state.edges = r.edges;
    msgs = r.msgs;
    sel = null;
    autoLayout();
    if (keepLayout) {
      const kept = carryLayout(old);
      if (kept) {
        view = oldView;
        applyView();
        drawEdges();
        msgs.unshift({
          t: 'note',
          m: `Kept your layout: ${kept} nodes stayed where you put them.`,
        });
      }
    }
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
    // an example opens like a workspace file: unsaved work is offered a save first, and the
    // example starts a fresh workspace with its own undo history
    confirmUnsaved(
      () => {
        shownExample = v;
        $('#code').value = EXAMPLES[v];
        drawFromCode({ force: true });
        $('#example').value = v;
        workspaceName = 'jags-diagram.json';
        resetHistory();
        markSaved();
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
  initWrapToggle();
  initGutter();
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

/**
 * Line numbers beside the code editor. Wrapped lines take several rows, so each number is as
 * tall as its line, measured in a hidden copy of the editor. The line of the current error is
 * marked.
 */
function updateGutter() {
  const t = $('#code'),
    gut = $('#gutter'),
    lines = t.value.split('\n');
  const err = (msgs.find(m => m.t === 'err' && m.line) || {}).line;
  const cs = getComputedStyle(t),
    lh = parseFloat(cs.lineHeight);
  let heights = lines.map(() => lh);
  if (t.classList.contains('wrap')) {
    const m = document.createElement('div');
    for (const k of ['font', 'lineHeight', 'whiteSpace', 'overflowWrap', 'tabSize'])
      m.style[k] = cs[k];
    Object.assign(m.style, {
      position: 'absolute',
      visibility: 'hidden',
      width: t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 'px',
    });
    lines.forEach(l => {
      const d = document.createElement('div');
      d.textContent = l || '\u200b'; // an empty line still takes a row
      m.append(d);
    });
    document.body.append(m);
    heights = [...m.children].map(d => d.getBoundingClientRect().height);
    m.remove();
  }
  gut.replaceChildren(
    ...heights.map((hgt, i) => {
      const d = document.createElement('div');
      d.textContent = i + 1;
      d.style.height = hgt + 'px';
      if (i + 1 === err) d.className = 'err';
      return d;
    }),
  );
  gut.scrollTop = t.scrollTop;
}

function initGutter() {
  const t = $('#code');
  let gT = 0;
  const later = () => {
    clearTimeout(gT);
    gT = setTimeout(updateGutter, 60);
  };
  t.addEventListener('input', later);
  t.addEventListener('scroll', () => ($('#gutter').scrollTop = t.scrollTop));
  // the text area changes width when the pane is resized or the window changes
  new ResizeObserver(later).observe(t);
  updateGutter();
}

/** The editor's Wrap button: wrap long lines or scroll sideways. The choice is remembered. */
function initWrapToggle() {
  const b = $('#btnWrap'),
    KEY = 'jmd-code-wrap';
  const set = on => {
    $('#code').classList.toggle('wrap', on);
    b.setAttribute('aria-pressed', String(on));
  };
  try {
    if (localStorage.getItem(KEY) === 'off') set(false);
  } catch (e) {}
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    set(on);
    updateGutter();
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch (e) {}
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
