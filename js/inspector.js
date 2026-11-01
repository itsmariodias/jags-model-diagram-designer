/*
 * Inspector panel: diagram settings when nothing is selected, otherwise editors for the
 * selected node or arrow.
 */

const insp = $('#insp');

function plain(t) {
  return (
    (t || '')
      .replace(/\\(class|anchor)\{[^}]*\}/g, '')
      .replace(/\\(mathit|mathrm|left|right)/g, '')
      .replace(/\\[,;: ]/g, ' ')
      .replace(/\\([A-Za-z]+)/g, '$1')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30) || '(empty)'
  );
}

function nodeName(n) {
  return n.kind === 'dist' ? `${n.name || n.dist}: ${plain(n.tex)}` : plain(n.tex);
}

/** A node as it looks in the diagram: distribution name, then its label typeset with MathJax. */
function nodeRef(n) {
  const wrap = h('<span class="node-ref"></span>');
  if (!n) {
    wrap.textContent = '?';
    return wrap;
  }
  wrap.title = nodeName(n); // plain-text version, also read by screen readers
  wrap.setAttribute('aria-label', nodeName(n));
  if (n.kind === 'dist') {
    const D = DISTS[n.dist] || DISTS.generic;
    wrap.append(h(`<span class="dist-name">${esc(n.name != null ? n.name : D.name)}</span>`));
  }
  if (n.tex) wrap.append(wrappingMath(n.tex, 17));
  return wrap;
}

/** Live preview under a LaTeX box: how the label will look, any LaTeX error, and which symbols are arrow targets. */
function texPreview(box, t) {
  box.replaceChildren(h('<span class="lbl">Preview</span>'));
  if (!(t || '').trim()) {
    box.append(h('<p class="help">Nothing to show yet.</p>'));
    return;
  }
  const math = wrappingMath(t, 20);
  box.append(math);
  const err = math.querySelector('[data-mml-node="merror"]');
  if (err) {
    const why = err.getAttribute('data-mjx-error') || 'check the braces and commands';
    box.append(h(`<p class="tex-error">LaTeX problem: ${esc(why)}</p>`));
  } else if (math.querySelector('[class*="anc-"]'))
    box.append(h('<p class="help">Highlighted symbols are ones arrows can point at.</p>'));
}

/** Typeset a label as pieces that wrap onto new lines, baselines lined up (see texWrapPieces). */
function wrappingMath(t, px) {
  const math = h('<span class="math" aria-hidden="true"></span>');
  let svgs = texWrapPieces(t).map(p => texSVG(p, px).node);
  if (svgs.length > 1 && svgs.some(s => s.querySelector('[data-mml-node="merror"]')))
    svgs = [texSVG(t, px).node]; // a split broke the TeX somehow: show it whole
  svgs.forEach((s, k) => {
    // MathJax puts the baseline at y = 0 of the viewBox; sit each piece on the text baseline
    const vb = s
      .getAttribute('viewBox')
      .split(/[\s,]+/)
      .map(Number);
    s.style.verticalAlign = (-(vb[1] + vb[3]) / 1000) * px + 'px';
    if (k) math.append(document.createElement('wbr'));
    math.append(s);
  });
  return math;
}

function rangeField(label, id, min, max, step, val, fmt, on) {
  const f = document.createElement('div');
  f.className = 'field';
  f.innerHTML = `<label for="${id}">${label}</label><div class="range"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${fmt(val)}</output></div>`;
  const i = f.querySelector('input'),
    o = f.querySelector('output');
  i.addEventListener('input', () => {
    o.textContent = fmt(+i.value);
    on(+i.value);
  });
  return f;
}

let texT = 0;

function renderInspector() {
  insp.replaceChildren();
  if (!sel) {
    $('#inspTitle').textContent = 'Diagram';
    insp.append(
      rangeField(
        'Math size',
        'setMath',
        16,
        48,
        1,
        state.settings.math,
        v => v + ' px',
        v => {
          state.settings.math = v;
          renderAll();
          save();
        },
      ),
    );
    insp.append(
      rangeField(
        'Icon size',
        'setIcon',
        0.6,
        1.8,
        0.05,
        state.settings.icon,
        v => Math.round(v * 100) + '%',
        v => {
          state.settings.icon = v;
          renderAll();
          save();
        },
      ),
    );
    insp.append(
      rangeField(
        'Row spacing (used by Auto-layout)',
        'setGap',
        20,
        180,
        2,
        state.settings.gap,
        v => v + ' px',
        v => {
          state.settings.gap = v;
          save();
        },
      ),
    );
    insp.append(h('<div class="divider"></div>'));
    insp.append(
      h(
        `<p class="help">Click a curve, expression or arrow to change it, and drag to move it. Arrows drawn from your code already point at the right symbols.</p>`,
      ),
    );
    insp.append(
      h(
        `<p class="help">Changes here don’t update the JAGS code, and <i>Draw diagram from code</i> starts the diagram over. Undo (Ctrl/⌘+Z) brings it back.</p>`,
      ),
    );
    return;
  }
  if (sel.t === 'node') {
    const n = byId(sel.id);
    if (!n) {
      sel = null;
      return renderInspector();
    }
    $('#inspTitle').textContent = 'Node';
    const kindName = { dist: 'Distribution', expr: 'Expression', data: 'Label' }[n.kind];
    insp.append(
      h(
        `<div class="row"><span class="kind">${kindName}</span>${n.info ? `<span class="info">${esc(n.info)}</span>` : ''}</div>`,
      ),
    );
    if (n.kind === 'dist') {
      const f = h(
        '<div class="field"><label for="iDist">Shape</label><select id="iDist"></select></div>',
      );
      const s = f.querySelector('select');
      Object.entries(DISTS).forEach(([k, v]) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = v.name;
        if (k === n.dist) o.selected = true;
        s.append(o);
      });
      s.addEventListener('change', () => {
        const prev = DISTS[n.dist];
        if (!n.name || (prev && n.name === prev.name)) n.name = DISTS[s.value].name;
        n.dist = s.value;
        renderAll();
        renderInspector();
        save();
      });
      insp.append(f);
      const fn = h(
        `<div class="field"><label for="iName">Name on baseline</label><input type="text" id="iName" value="${esc(n.name != null ? n.name : '')}"></div>`,
      );
      fn.querySelector('input').addEventListener('input', e => {
        n.name = e.target.value;
        renderAll();
        save();
      });
      insp.append(fn);
    }
    const ft = h(
      `<div class="field"><label for="iTex">${n.kind === 'dist' ? 'Parameters' : 'Label'} (LaTeX)</label><textarea id="iTex" spellcheck="false" aria-describedby="iTexPreview">${esc(n.tex || '')}</textarea><div class="tex-preview" id="iTexPreview" aria-live="polite"></div></div>`,
    );
    const preview = ft.querySelector('.tex-preview');
    const showPreview = () => texPreview(preview, n.tex);
    showPreview();
    ft.querySelector('textarea').addEventListener('input', e => {
      n.tex = e.target.value;
      clearTimeout(texT);
      texT = setTimeout(() => {
        renderAll();
        showPreview();
        save();
      }, 160);
    });
    insp.append(ft);
    if (n.kind === 'dist') {
      insp.append(
        rangeField(
          'Icon size',
          'iSize',
          0.5,
          2,
          0.05,
          n.size || 1,
          v => Math.round(v * 100) + '%',
          v => {
            n.size = v;
            renderAll();
            save();
          },
        ),
      );
      insp.append(
        rangeField(
          'Nudge label left / right',
          'iDx',
          -120,
          120,
          1,
          n.dx || 0,
          v => v + ' px',
          v => {
            n.dx = v;
            renderAll();
            save();
          },
        ),
      );
      insp.append(
        rangeField(
          'Nudge label up / down',
          'iDy',
          -120,
          120,
          1,
          n.dy || 0,
          v => v + ' px',
          v => {
            n.dy = v;
            renderAll();
            save();
          },
        ),
      );
    }
    if (n.kind === 'expr') {
      const fb = h(
        `<label class="row" style="font-size:13px"><input type="checkbox" id="iBrace" ${n.brace !== false ? 'checked' : ''}> Brace underneath</label>`,
      );
      fb.querySelector('input').addEventListener('change', e => {
        n.brace = e.target.checked;
        renderAll();
        save();
      });
      insp.append(fb);
    }
    insp.append(h('<div class="divider"></div>'));
    const outs = state.edges.filter(e => e.from === n.id);
    const fa = h(
      '<div class="field"><span class="lbl">Arrows from here</span><ul class="arrows"></ul></div>',
    );
    const ul = fa.querySelector('ul');
    if (!outs.length)
      ul.append(h('<li style="cursor:default"><span class="help">None yet</span></li>'));
    outs.forEach(e => {
      const T = byId(e.to);
      const li = h(`<li><span class="sym">${esc(e.type)}</span></li>`);
      li.append(nodeRef(T));
      // the symbol it points at, as drawn
      const x = T && e.anchor ? anchorEls(T, e.anchor)[0] : null;
      const pic = x && symbolPreview(x, 15);
      if (pic) {
        const at = h(`<span class="target" title="points at ${esc(e.anchor)}"></span>`);
        at.append(pic);
        li.append(at);
      }
      li.addEventListener('click', () => select({ t: 'edge', id: e.id }));
      ul.append(li);
    });
    insp.append(fa);
    const others = state.nodes.filter(x => x.id !== n.id);
    if (others.length) {
      const fadd = h(
        `<div class="menu inline"><button class="btn sm" aria-haspopup="menu" aria-expanded="false">+ Add arrow to… ${CHEVRON_SVG}</button><div class="menu-list" role="menu" aria-label="Arrow target" hidden></div></div>`,
      );
      const list = fadd.querySelector('[role="menu"]');
      others.forEach(o => {
        const it = h('<button role="menuitem"></button>');
        it.append(nodeRef(o));
        it.addEventListener('click', () => {
          const e = {
            id: nid('e'),
            from: n.id,
            to: o.id,
            anchor: null,
            type: n.kind === 'dist' ? '~' : '=',
            index: '',
          };
          state.edges.push(e);
          sel = { t: 'edge', id: e.id };
          renderAll();
          renderInspector();
          save();
        });
        list.append(it);
      });
      setupMenu(fadd);
      insp.append(fadd);
    }
    const del = h('<button class="btn danger">Delete node</button>');
    del.addEventListener('click', deleteSel);
    insp.append(del);
    return;
  }
  const e = state.edges.find(x => x.id === sel.id);
  if (!e) {
    sel = null;
    return renderInspector();
  }
  $('#inspTitle').textContent = 'Arrow';
  const A = byId(e.from),
    B = byId(e.to);
  for (const [lbl, n] of [
    ['From', A],
    ['To', B],
  ]) {
    const f = h(`<div class="field"><span class="lbl">${lbl}</span></div>`);
    f.append(nodeRef(n));
    insp.append(f);
  }
  const seg = h(
    `<div class="field"><span class="lbl">Relation</span><div class="seg" role="group" aria-label="Relation"><button data-v="~" aria-pressed="${e.type === '~'}" title="Stochastic: drawn from">~</button><button data-v="=" aria-pressed="${e.type === '='}" title="Deterministic: equals">=</button></div></div>`,
  );
  seg.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => {
      e.type = b.dataset.v;
      renderAll();
      renderInspector();
      save();
    }),
  );
  insp.append(seg);
  const anchors = new Set();
  if (B && B._g)
    B._g.querySelectorAll('[class*="anc-"]').forEach(x => {
      for (const c of x.classList) if (c.startsWith('anc-')) anchors.add(c.slice(4));
    });
  if (e.anchor) anchors.add(e.anchor);
  // one button per symbol, showing it as it's drawn in the diagram
  const fa = h(
    '<div class="field"><span class="lbl" id="eAncLbl">Points at</span><div class="chips" role="group" aria-labelledby="eAncLbl"></div></div>',
  );
  const chips = fa.querySelector('.chips');
  [null, ...anchors].forEach(a => {
    const b = h(`<button class="chip" aria-pressed="${(e.anchor || null) === a}"></button>`);
    const x = a && B ? anchorEls(B, a)[0] : null;
    const pic = x && symbolPreview(x);
    if (!a) b.textContent = 'Whole label';
    else if (pic) {
      b.append(pic);
      b.title = a; // the name it's tagged with, for anyone editing the LaTeX
      b.setAttribute('aria-label', 'symbol ' + a);
    } else b.textContent = a;
    b.addEventListener('click', () => {
      e.anchor = a;
      chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
      renderAll();
      save();
    });
    chips.append(b);
  });
  insp.append(fa);
  if (!anchors.size) {
    insp.append(
      h(
        `<p class="help">This arrow points at the whole label. To point it at one symbol instead, that symbol needs to be marked in the label it points to.</p>`,
      ),
    );
    insp.append(
      h(
        `<details class="help"><summary>How do I mark a symbol?</summary><p>Click the node this arrow points to. In its label, wrap the symbol like this: <code>\\anchor{s}{\\sigma}</code>, where <code>s</code> is any short name and <code>\\sigma</code> is the symbol. It then shows up under “Points at”.</p></details>`,
      ),
    );
  }
  const fi = h(
    `<div class="field"><label for="eIdx">Index label</label><input type="text" id="eIdx" value="${esc(e.index || '')}" placeholder="e.g. i"></div>`,
  );
  fi.querySelector('input').addEventListener('input', ev => {
    e.index = ev.target.value;
    drawEdges();
    save();
  });
  insp.append(fi);
  const del = h('<button class="btn danger">Delete arrow</button>');
  del.addEventListener('click', deleteSel);
  insp.append(del);
}
