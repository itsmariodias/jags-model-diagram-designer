/*
 * Canvas interaction: select, drag nodes, pan, zoom, delete, and add new nodes.
 */

let drag = null,
  toastT = 0;

function toast(m) {
  const old = $('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = m;
  $('#stage').appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 1800);
}

function select(s) {
  sel = s;
  renderAll();
  renderInspector();
}

function initCanvasInteraction() {
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const ng = e.target.closest('.node'),
      eg = e.target.closest('.edge, .edge-hit');
    svg.setPointerCapture(e.pointerId);
    if (ng) {
      const n = byId(ng.dataset.id);
      drag = { t: 'node', n, x: e.clientX, y: e.clientY, cx: n.cx, cy: n.cy, moved: false };
    } else if (eg) {
      drag = { t: 'edge', id: eg.dataset.id };
    } else {
      drag = { t: 'pan', x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
      svg.classList.add('panning');
    }
  });

  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.t === 'node') {
      const dx = (e.clientX - drag.x) / view.k,
        dy = (e.clientY - drag.y) / view.k;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (drag.moved) {
        drag.n.cx = drag.cx + dx;
        drag.n.cy = drag.cy + dy;
        placeNode(drag.n);
        drawEdges();
      }
    } else if (drag.t === 'pan') {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      view.x = drag.vx + dx;
      view.y = drag.vy + dy;
      applyView();
    }
  });

  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove('panning');
    if (d.t === 'node') {
      if (d.moved) {
        save();
        if (isSel('node', d.n.id)) renderAll();
      } else select({ t: 'node', id: d.n.id });
    } else if (d.t === 'edge') select({ t: 'edge', id: d.id });
    else if (!d.moved && sel) select(null);
  });

  // highlight the arrow under the pointer, so it's clear what a click will pick
  const hover = (e, on) => {
    const h = e.target.closest('.edge-hit');
    const g = h && edgesL.querySelector(`.edge[data-id="${CSS.escape(h.dataset.id)}"]`);
    if (g) g.classList.toggle('hover', on);
  };
  edgeHitsL.addEventListener('pointerover', e => hover(e, true));
  edgeHitsL.addEventListener('pointerout', e => hover(e, false));

  // zoom around the cursor
  svg.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect(),
        px = e.clientX - r.left,
        py = e.clientY - r.top;
      const k2 = Math.min(4, Math.max(0.15, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.x = px - ((px - view.x) * k2) / view.k;
      view.y = py - ((py - view.y) * k2) / view.k;
      view.k = k2;
      applyView();
    },
    { passive: false },
  );

  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      deleteSel();
    }
    if (e.key === 'Escape' && sel) select(null);
  });
}

function deleteSel() {
  if (!sel) return;
  if (sel.t === 'node') {
    state.nodes = state.nodes.filter(n => n.id !== sel.id);
    state.edges = state.edges.filter(e => e.from !== sel.id && e.to !== sel.id);
  } else state.edges = state.edges.filter(e => e.id !== sel.id);
  sel = null;
  renderAll();
  renderInspector();
  save();
}

function viewCenter() {
  const r = svg.getBoundingClientRect();
  return new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(toVP());
}

/** Does node n's extent overlap any other node's (with a margin)? */
function overlapsOthers(n) {
  const m = 16;
  return state.nodes.some(
    o =>
      o !== n &&
      o._g &&
      n.cx - n._left < o.cx + o._right + m &&
      o.cx - o._left < n.cx + n._right + m &&
      n.cy - n._top < o.cy + o._bottom + m &&
      o.cy - o._top < n.cy + n._bottom + m,
  );
}

/** Move a freshly rendered node to the nearest free spot around where it is. */
function findFreeSpot(n) {
  const x0 = n.cx,
    y0 = n.cy,
    step = 40;
  if (!overlapsOthers(n)) return;
  for (let r = 1; r <= 25; r++) {
    // try the ring at distance r: below, right, left, above
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      n.cx = x0 + dx * r * step;
      n.cy = y0 + dy * r * step;
      if (!overlapsOthers(n)) return;
    }
  }
  n.cx = x0; // nowhere free nearby: stay in the middle
  n.cy = y0;
}

/** Add a placeholder node of the given kind ('dist' | 'expr' | 'data') near the centre of the view, clear of other nodes. */
function addNode(kind) {
  const p = viewCenter();
  const n = { id: nid('n'), kind, cx: p.x, cy: p.y };
  if (kind === 'dist') {
    n.dist = 'normal';
    n.name = 'normal';
    n.tex = '\\mu,\\ \\sigma';
  }
  if (kind === 'expr') {
    n.tex = '\\beta_0+\\beta_1 x_i';
    n.brace = true;
  }
  if (kind === 'data') n.tex = '\\text{Label}';
  state.nodes.push(n);
  sel = { t: 'node', id: n.id };
  renderAll();
  findFreeSpot(n);
  renderAll();
  renderInspector();
  save();
}
