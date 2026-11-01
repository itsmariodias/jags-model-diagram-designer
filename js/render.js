/*
 * Rendering: LaTeX → SVG via MathJax, nodes, arrows, and the pan/zoom viewport.
 */

/* ---------- MathJax */

const texCache = new Map();

function texSVG(t, px) {
  const key = px + '|' + t;
  let c = texCache.get(key);
  if (!c) {
    let s;
    try {
      s = MathJax.tex2svg(t, { display: false }).querySelector('svg');
    } catch (e) {
      s = null;
    }
    if (!s) {
      s = el('svg', { viewBox: '0 -750 2000 1000' });
      const tx = el('text', { y: 0, 'font-size': 600, fill: '#a83a28' }, s);
      tx.textContent = 'TeX error';
    }
    const vb = (s.getAttribute('viewBox') || '0 0 1000 1000').split(/[\s,]+/).map(Number);
    const w = (vb[2] / 1000) * px,
      h = (vb[3] / 1000) * px;
    s.setAttribute('width', w);
    s.setAttribute('height', h);
    s.removeAttribute('style');
    s.setAttribute('overflow', 'visible');
    s.removeAttribute('role');
    s.removeAttribute('focusable');
    s.removeAttribute('aria-hidden');
    c = { s, w, h };
    texCache.set(key, c);
    if (texCache.size > 600) texCache.delete(texCache.keys().next().value);
  }
  return { node: c.s.cloneNode(true), w: c.w, h: c.h };
}

/* ---------- rendering */
const isSel = (t, id) => sel && sel.t === t && sel.id === id;

function bracePath(x1, x2, y, d) {
  const mid = (x1 + x2) / 2,
    c = Math.min(d * 1.6, (mid - x1) / 2);
  return `M${x1} ${y}Q${x1} ${y + d} ${x1 + c} ${y + d}L${mid - c} ${y + d}Q${mid} ${y + d} ${mid} ${y + 2 * d}Q${mid} ${y + d} ${mid + c} ${y + d}L${x2 - c} ${y + d}Q${x2} ${y + d} ${x2} ${y}`;
}

function renderNode(n) {
  const g = el('g', { class: 'node', 'data-id': n.id }, nodesL);
  const F = state.settings.math;
  const L = n.tex ? texSVG(n.tex, F) : null;
  let w,
    h,
    src,
    lx = 0,
    ly = 0;
  if (n.kind === 'dist') {
    const sc = state.settings.icon * (n.size || 1);
    w = 180 * sc;
    h = 112 * sc;
    const D = DISTS[n.dist] || DISTS.generic;
    el(
      'rect',
      { class: 'hit', x: -8, y: -8, width: w + 16, height: h + 16, fill: 'transparent' },
      g,
    );
    drawDist(g, D, w, h, sc);
    el('line', { x1: -6 * sc, y1: h, x2: w + 6 * sc, y2: h, stroke: INK, 'stroke-width': 1.6 }, g);
    const t = el(
      'text',
      {
        x: w / 2,
        y: h - 5 * sc,
        'text-anchor': 'middle',
        'font-family': 'Helvetica, Arial, sans-serif',
        'font-size': (13 * sc).toFixed(1),
        fill: INK,
      },
      g,
    );
    t.textContent = n.name != null ? n.name : D.name;
    if (L) {
      lx = w * D.lab[0] - L.w / 2 + (n.dx || 0);
      ly = h * D.lab[1] - L.h / 2 + (n.dy || 0);
    }
    src = { x: w / 2, y: h + 9 };
  } else {
    w = L ? L.w : 60;
    h = L ? L.h : 30;
    const braced = n.kind === 'expr' && n.brace !== false;
    const d = Math.max(8, F * 0.36);
    el(
      'rect',
      {
        class: 'hit',
        x: -8,
        y: -8,
        width: w + 16,
        height: h + 16 + (braced ? 2 * d + 6 : 0),
        fill: 'transparent',
      },
      g,
    );
    if (braced) {
      const by = h + F * 0.18;
      el('path', { d: bracePath(0, w, by, d), fill: 'none', stroke: INK, 'stroke-width': 1.5 }, g);
      h = by + 2 * d;
      src = { x: w / 2, y: h + 5 };
    } else src = { x: w / 2, y: h + 7 };
  }
  if (L) {
    L.node.setAttribute('x', lx);
    L.node.setAttribute('y', ly);
    g.appendChild(L.node);
    n._lab = L.node;
  } else n._lab = null;
  // full extent of the node, label included (a distribution's label can stick out past its icon)
  const x0 = Math.min(0, L ? lx : 0),
    y0 = Math.min(0, L ? ly : 0),
    x1 = Math.max(w, L ? lx + L.w : 0),
    y1 = Math.max(h, L ? ly + L.h : 0);
  n._w = w;
  n._h = h;
  n._left = w / 2 - x0; // distance from the centre to the left edge of the extent
  n._right = x1 - w / 2;
  n._src = src;
  n._g = g;
  g.setAttribute('transform', `translate(${n.cx - w / 2},${n.cy - h / 2})`);
  if (isSel('node', n.id)) {
    el(
      'rect',
      {
        class: 'ui selbox',
        x: x0 - 8,
        y: y0 - 8,
        width: x1 - x0 + 16,
        height: y1 - y0 + 16,
        rx: 8,
      },
      g,
    );
  }
}

function placeNode(n) {
  n._g.setAttribute('transform', `translate(${n.cx - n._w / 2},${n.cy - n._h / 2})`);
}

function toVP() {
  return vp.getScreenCTM().inverse();
}

function rectVP(e, m) {
  const r = e.getBoundingClientRect();
  const p1 = new DOMPoint(r.left, r.top).matrixTransform(m),
    p2 = new DOMPoint(r.right, r.bottom).matrixTransform(m);
  return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
}

function labelRect(n, m) {
  if (n._lab) return rectVP(n._lab, m);
  return { x: n.cx - n._w / 2, y: n.cy - n._h / 2, w: n._w, h: n._h };
}

function anchorEls(n, a) {
  return n._g ? [...n._g.querySelectorAll('.anc-' + CSS.escape(a))] : [];
}

/** The tagged glyph's sub/superscript group if it has one (σ → σ_y), else the glyph itself. */
function withScripts(x) {
  const p = x.parentNode;
  const scripted =
    p &&
    p.getAttribute &&
    /^(msub|msup|msubsup)$/.test(p.getAttribute('data-mml-node') || '') &&
    p.firstElementChild === x;
  return scripted ? p : x;
}

/** A standalone copy of a rendered symbol, to show it outside the canvas (e.g. in the inspector). */
function symbolPreview(x, px = 18) {
  const src = withScripts(x);
  const bb = src.getBBox();
  if (!bb.width) return null;
  // MathJax draws in 1/1000 em units inside a scale(1,-1) flip
  const pad = 60,
    w = bb.width + 2 * pad,
    hgt = bb.height + 2 * pad;
  const out = el('svg', {
    viewBox: `${bb.x - pad} ${-(bb.y + bb.height) - pad} ${w} ${hgt}`,
    width: (w / 1000) * px,
    height: (hgt / 1000) * px,
    'aria-hidden': 'true',
  });
  const g = el(
    'g',
    { transform: 'scale(1,-1)', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 0 },
    out,
  );
  const c = src.cloneNode(true);
  c.removeAttribute('transform');
  g.appendChild(c);
  return out;
}

function srcPoint(n) {
  return { x: n.cx - n._w / 2 + n._src.x, y: n.cy - n._h / 2 + n._src.y };
}

function clip(s, c, R) {
  // where the segment s→c first enters rect R
  let t0 = 0,
    t1 = 1;
  const dx = c.x - s.x,
    dy = c.y - s.y;
  const p = [-dx, dx, -dy, dy],
    q = [s.x - R.x, R.x + R.w - s.x, s.y - R.y, R.y + R.h - s.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return c;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t0) t0 = r;
    } else {
      if (r < t1) t1 = r;
    }
  }
  if (t0 > t1) return c;
  return { x: s.x + dx * t0, y: s.y + dy * t0 };
}

function edgeSegs(e, m) {
  const A = byId(e.from),
    B = byId(e.to);
  if (!A || !B || !A._g || !B._g) return [];
  const s = srcPoint(A);
  // aim at the tagged glyph, but stop outside its sub/superscripts so the head never covers them
  let rects = e.anchor
    ? anchorEls(B, e.anchor)
        .map(x => {
          const r = rectVP(x, m);
          const sc = withScripts(x) === x ? r : rectVP(withScripts(x), m);
          return { r, sc };
        })
        .filter(o => o.r.w > 0)
    : [];
  if (!rects.length) {
    const r = labelRect(B, m);
    rects = [{ r, sc: r }];
  }
  const dist = o => Math.hypot(o.r.x + o.r.w / 2 - s.x, o.r.y + o.r.h / 2 - s.y);
  if (e.type !== '=' && rects.length > 1) {
    rects.sort((a, b) => dist(a) - dist(b));
    rects = [rects[0]];
  }
  const pad = Math.max(4, state.settings.math * 0.14);
  return rects.map(({ r, sc }) => {
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    return {
      s,
      t: clip(s, c, { x: sc.x - pad, y: sc.y - pad, w: sc.w + 2 * pad, h: sc.h + 2 * pad }),
    };
  });
}

function drawEdges() {
  edgesL.replaceChildren();
  const m = toVP();
  const fs = Math.max(15, state.settings.math * 0.64);
  for (const e of state.edges) {
    const g = el(
      'g',
      { class: 'edge' + (isSel('edge', e.id) ? ' selected' : ''), 'data-id': e.id },
      edgesL,
    );
    for (const { s, t } of edgeSegs(e, m)) {
      const dx = t.x - s.x,
        dy = t.y - s.y,
        L = Math.hypot(dx, dy) || 1,
        ux = dx / L,
        uy = dy / L;
      const head = Math.min(13, L * 0.4),
        hw = head * 0.38,
        bx = t.x - ux * head,
        by = t.y - uy * head;
      el(
        'line',
        {
          class: 'hit',
          x1: s.x,
          y1: s.y,
          x2: t.x,
          y2: t.y,
          stroke: 'transparent',
          'stroke-width': 14,
        },
        g,
      );
      el('line', { x1: s.x, y1: s.y, x2: bx, y2: by, stroke: INK, 'stroke-width': 1.5 }, g);
      el(
        'polygon',
        {
          points: `${t.x},${t.y} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`,
          fill: INK,
        },
        g,
      );
      let nx = -uy,
        ny = ux;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
      } else if (nx > 0) {
        nx = -nx;
        ny = -ny;
      }
      const mx = s.x + dx * 0.5,
        my = s.y + dy * 0.5,
        off = fs * 0.85;
      const sym = el(
        'text',
        {
          x: mx + nx * off,
          y: my + ny * off + fs * 0.32,
          'text-anchor': 'middle',
          'font-family': '"Times New Roman", Times, serif',
          'font-size': fs.toFixed(1),
          fill: INK,
        },
        g,
      );
      sym.textContent = e.type;
      if (e.index) {
        const ix = el(
          'text',
          {
            x: mx - nx * off,
            y: my - ny * off + fs * 0.32,
            'text-anchor': 'middle',
            'font-family': '"Times New Roman", Times, serif',
            'font-style': 'italic',
            'font-size': (fs * 0.95).toFixed(1),
            fill: INK,
          },
          g,
        );
        ix.textContent = e.index;
      }
    }
  }
}

function renderAll() {
  nodesL.replaceChildren();
  state.nodes.forEach(renderNode);
  drawEdges();
}

function applyView() {
  vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  $('#zoomOut').textContent = Math.round(view.k * 100) + '%';
}

function fit() {
  if (!state.nodes.length) return;
  const bb = vp.getBBox();
  const r = svg.getBoundingClientRect();
  if (!bb.width || !r.width) return;
  const k = Math.min((r.width - 48) / bb.width, (r.height - 48) / bb.height, 1.6);
  view = {
    k,
    x: r.width / 2 - (bb.x + bb.width / 2) * k,
    y: r.height / 2 - (bb.y + bb.height / 2) * k,
  };
  applyView();
}
