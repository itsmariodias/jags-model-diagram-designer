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
        `<p class="help">Click a curve, expression or arrow to edit it. Drag to move. Arrows aim at symbols tagged in the label with <code>\\anchor{name}{…}</code>, so <code>\\anchor{sigma}{\\sigma}</code> makes the σ a target.</p>`,
      ),
    );
    insp.append(
      h(
        `<p class="help">Edits here are not written back to the JAGS code. Redrawing from code replaces the diagram.</p>`,
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
      `<div class="field"><label for="iTex">${n.kind === 'dist' ? 'Parameters' : 'Label'} (LaTeX)</label><textarea id="iTex" spellcheck="false">${esc(n.tex || '')}</textarea></div>`,
    );
    ft.querySelector('textarea').addEventListener('input', e => {
      n.tex = e.target.value;
      clearTimeout(texT);
      texT = setTimeout(() => {
        renderAll();
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
      const li = h(
        `<li><span class="sym">${esc(e.type)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(T ? nodeName(T) : '?')}</span><span class="info">${e.anchor ? esc(e.anchor) : ''}</span></li>`,
      );
      li.addEventListener('click', () => select({ t: 'edge', id: e.id }));
      ul.append(li);
    });
    insp.append(fa);
    const others = state.nodes.filter(x => x.id !== n.id);
    if (others.length) {
      const fadd = h(
        '<div class="row"><select id="iAddTo" aria-label="Arrow target" style="flex:1;min-width:0"></select><button class="btn sm" id="iAdd">Add arrow</button></div>',
      );
      const s = fadd.querySelector('select');
      others.forEach(o => {
        const op = document.createElement('option');
        op.value = o.id;
        op.textContent = nodeName(o);
        s.append(op);
      });
      fadd.querySelector('button').addEventListener('click', () => {
        const e = {
          id: nid('e'),
          from: n.id,
          to: s.value,
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
  insp.append(
    h(
      `<div class="field"><span class="lbl">From</span><span>${esc(A ? nodeName(A) : '?')}</span></div>`,
    ),
  );
  insp.append(
    h(
      `<div class="field"><span class="lbl">To</span><span>${esc(B ? nodeName(B) : '?')}</span></div>`,
    ),
  );
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
  const fs = h(
    '<div class="field"><label for="eAnc">Points at</label><select id="eAnc"></select></div>',
  );
  const s = fs.querySelector('select');
  [['', 'Whole label'], ...[...anchors].map(a => [a, 'symbol “' + a + '”'])].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    if ((e.anchor || '') === v) o.selected = true;
    s.append(o);
  });
  s.addEventListener('change', () => {
    e.anchor = s.value || null;
    renderAll();
    save();
  });
  insp.append(fs);
  if (!anchors.size)
    insp.append(
      h(
        '<p class="help">Tag a symbol in the target’s label with <code>\\anchor{name}{…}</code> to aim at it.</p>',
      ),
    );
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
