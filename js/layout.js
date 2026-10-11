/*
 * Auto-layout: arrange nodes in layers from the top-level priors down to the data, then centre
 * each node over the symbols its arrows point at.
 */

function measureAnchors() {
  const m = toVP();
  for (const n of state.nodes) {
    n._anch = {};
    if (!n._g) continue;
    n._g.querySelectorAll('[class*="anc-"]').forEach(x => {
      const r = rectVP(x, m);
      for (const c of x.classList)
        if (c.startsWith('anc-'))
          (n._anch[c.slice(4)] = n._anch[c.slice(4)] || []).push(r.x + r.w / 2 - n.cx);
    });
  }
}

function autoLayout() {
  renderAll();
  measureAnchors();
  const N = state.nodes,
    out = {};
  N.forEach(n => (out[n.id] = []));
  state.edges.forEach(e => {
    if (out[e.from] && byId(e.to)) out[e.from].push(e);
  });
  const depth = {},
    vis = new Set();
  const d = id => {
    if (depth[id] != null) return depth[id];
    if (vis.has(id)) return 0;
    vis.add(id);
    let m = 0;
    for (const e of out[id]) m = Math.max(m, 1 + d(e.to));
    vis.delete(id);
    return (depth[id] = m);
  };
  N.forEach(n => d(n.id));
  const maxD = Math.max(0, ...N.map(n => depth[n.id]));
  const layers = [...Array(maxD + 1)].map(() => []);
  N.forEach((n, i) => {
    n._i = i;
    layers[maxD - depth[n.id]].push(n);
  });
  let top = 0;
  const gap = state.settings.gap;
  layers.forEach(Ls => {
    const H = Math.max(0, ...Ls.map(n => n._h));
    Ls.forEach(n => (n.cy = top + H / 2));
    top += H + gap;
  });
  const gx = Math.max(24, state.settings.math * 1.1); // gap between neighbours' full extents
  for (let l = maxD; l >= 0; l--) {
    const items = layers[l]
      .map(n => {
        const tg = out[n.id].map(e => {
          const T = byId(e.to);
          const o = (T._anch && e.anchor && T._anch[e.anchor]) || [0];
          return T.cx + o.reduce((a, b) => a + b, 0) / o.length;
        });
        return { n, d: tg.length ? tg.reduce((a, b) => a + b, 0) / tg.length : 0 };
      })
      .sort((a, b) => a.d - b.d || a.n._i - b.n._i);
    if (!items.length) continue;
    const L = items.length,
      sep = i => items[i - 1].n._right + items[i].n._left + gx;
    const p1 = items.map(x => x.d),
      p2 = items.map(x => x.d);
    for (let i = 1; i < L; i++) p1[i] = Math.max(p1[i], p1[i - 1] + sep(i));
    for (let i = L - 2; i >= 0; i--) p2[i] = Math.min(p2[i], p2[i + 1] - sep(i + 1));
    items.forEach((x, i) => (x.n.cx = (p1[i] + p2[i]) / 2));
  }
  renderAll();
  fit();
  save();
}
