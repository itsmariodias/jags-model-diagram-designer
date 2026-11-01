/*
 * Turn parsed JAGS statements into a diagram: nodes (distributions, expressions, data labels)
 * and the arrows between them.
 *
 * Along the way it unrolls small literal loops, folds indexed deterministic helpers that combine
 * several variables into the parameters that use them, pulls linear predictors into their own
 * bracketed node, and shows normal/t precision as a standard deviation (including a precision
 * defined on its own line). Each simplification adds a note for the user.
 */

function buildFromJAGS(src) {
  const stmts = parseJAGS(src);
  const msgs = [];
  if (!stmts.length) throw new JagsError('No statements found. Paste a model { … } block.');
  const INV = { logit: 'ilogit', log: 'exp', probit: 'phi', cloglog: 'icloglog' };
  for (const s of stmts) {
    let l = strip(s.lhs);
    if (l.k === 'call' && l.args[0] && strip(l.args[0]).k === 'ref') {
      s.rhs = { k: 'call', f: INV[l.f] || 'inv_' + l.f, args: [s.rhs] };
      l = strip(l.args[0]);
    }
    if (l.k !== 'ref')
      throw new JagsError('The left side of each statement must be a variable', s.line);
    s.lhs = l;
  }
  const names = new Set();
  stmts.forEach(s => {
    names.add(s.lhs.name);
    walk(s.rhs, r => names.add(r.name));
  });
  // unroll small literal loops over priors that the model references one by one
  const lit = new Set();
  stmts.forEach(s =>
    walk(s.rhs, r => {
      if (r.idx && r.idx.some(x => x && x.k === 'num')) lit.add(r.name);
    }),
  );
  const S = [];
  for (const s of stmts) {
    if (s.kind === 'stoch' && lit.has(s.lhs.name)) {
      const lp = s.loops.find(
        L =>
          L.from.k === 'num' &&
          L.to.k === 'num' &&
          +L.to.v - +L.from.v <= 7 &&
          (s.lhs.idx || []).some(x => x && x.k === 'ref' && x.name === L.v && !x.idx),
      );
      if (lp) {
        const a = +lp.from.v,
          b = +lp.to.v;
        for (let v = a; v <= b; v++)
          S.push({
            ...s,
            lhs: subst(s.lhs, lp.v, v),
            rhs: subst(s.rhs, lp.v, v),
            loops: s.loops.filter(L => L !== lp),
          });
        msgs.push({
          t: 'note',
          m: `Drew ${s.lhs.name}[${lp.v}] as ${b - a + 1} separate priors, since the model uses each one individually.`,
        });
        continue;
      }
    }
    S.push(s);
  }
  // deterministic nodes: keep linear predictors and named scalar parameters, fold indexed
  // helpers (sh[i] <- …) into whatever uses them
  const usedKeys = new Set(),
    genericUse = new Set();
  S.forEach(s =>
    walk(s.rhs, r => {
      usedKeys.add(keyOf(r));
      if (keyOf(r) === r.name) genericUse.add(r.name);
    }),
  );
  // Stays a node of its own:
  //  - a scalar such as nu <- nuMinusOne + 1, so ν still appears where it is used
  //  - a hard-coded entry such as alpha[2] <- 0 that is only ever used as alpha[g[i]], which
  //    has nowhere to fold into
  //  - a helper built from a single variable, such as kappa[c] <- kappaMinusTwo[c] + 2, which
  //    the book draws as its own node too
  const keepAsNode = s =>
    !s.lhs.idx ||
    (keyOf(s.lhs) !== s.lhs.name && !usedKeys.has(keyOf(s.lhs)) && genericUse.has(s.lhs.name)) ||
    topRefs(s.rhs).size < 2;
  // A precision defined on its own line (tau <- 1/sigma^2) and only ever used as a normal or t
  // precision is folded in too, so the spread it is built from shows instead.
  const PREC_DISTS = ['dnorm', 'dt', 'dlnorm'];
  const precUses = {},
    allUses = {},
    stochNames = new Set();
  S.forEach(s => {
    if (s.kind === 'stoch') stochNames.add(s.lhs.name);
    walk(s.rhs, r => (allUses[r.name] = (allUses[r.name] || 0) + 1));
    const p = s.kind === 'stoch' && PREC_DISTS.includes(s.rhs.f) && strip(s.rhs.args[1]);
    if (p && p.k === 'ref') precUses[p.name] = (precUses[p.name] || 0) + 1;
  });
  const isPrecVar = s =>
    precUses[s.lhs.name] === allUses[s.lhs.name] &&
    !stochNames.has(s.lhs.name) &&
    !!precToScale(s.rhs);
  const inl = {};
  const folded = [],
    precVars = new Set();
  for (const s of S) {
    if (s.kind !== 'det' || isPredictor(s.rhs)) continue;
    if (isPrecVar(s)) {
      inl[keyOf(s.lhs)] = s;
      precVars.add(s.lhs.name);
    } else if (!keepAsNode(s)) {
      inl[keyOf(s.lhs)] = s;
      folded.push(jagsRef(s.lhs));
    }
  }
  const renameIdx = (body, def, ref) => {
    const m = {};
    (def.lhs.idx || []).forEach((x, p) => {
      if (x && x.k === 'ref' && !x.idx && ref.idx && ref.idx[p]) m[x.name] = ref.idx[p];
    });
    return mapAst(body, r => (m[r.name] && !r.idx ? mapAst(m[r.name], () => null) : null));
  };
  const inline = (a, d = 0) =>
    mapAst(a, r => {
      // exact match, or a hard-coded entry (mu[1]) of a general definition (mu[j] <- …)
      const def = inl[keyOf(r)] || (keyOf(r) !== r.name ? inl[r.name] : null);
      if (!def || d > 20) return null;
      return { k: 'grp', a: inline(renameIdx(def.rhs, def, r), d + 1) };
    });
  if (folded.length)
    msgs.push({
      t: 'note',
      m: `Folded ${folded.join(', ')} into the parameters that use ${folded.length > 1 ? 'them' : 'it'}.`,
    });
  // build statement list; pull linear predictors out of distribution arguments into their own brace node
  const F = [];
  const fresh = () => {
    for (const c of ['mu', 'eta', 'lambda', 'nu', 'psi']) {
      if (!names.has(c)) {
        names.add(c);
        return c;
      }
    }
    return 'm' + uid++;
  };
  for (const s of S) {
    if (s.kind === 'det') {
      if (!inl[keyOf(s.lhs)]) F.push({ ...s, rhs: inline(s.rhs) });
      continue;
    }
    const args = s.rhs.args.map(a => inline(a));
    args.forEach((a, p) => {
      if (isPredictor(a)) {
        const lhs = {
          k: 'ref',
          name: fresh(),
          idx: s.loops.length ? s.loops.map(L => ({ k: 'ref', name: L.v, idx: null })) : null,
        };
        F.push({ kind: 'det', lhs, rhs: a, loops: s.loops, virtual: true });
        args[p] = mapAst(lhs, () => null);
      }
    });
    F.push({ ...s, args });
  }
  if (F.some(s => s.virtual))
    msgs.push({
      t: 'note',
      m: 'Moved a linear predictor written inside a distribution into its own bracketed expression.',
    });
  const nodes = [],
    edges = [],
    prod = {};
  for (const s of F) {
    const n = {
      id: nid('n'),
      kind: s.kind === 'stoch' ? 'dist' : 'expr',
      cx: 0,
      cy: 0,
      _s: s,
      _ast: s.kind === 'stoch' ? s.args : [s.rhs],
    };
    // brace under expressions; a bare constant (alpha[2] <- 0) is drawn without one
    if (n.kind === 'expr') n.brace = !!s.virtual || hasRef(s.rhs);
    prod[keyOf(s.lhs)] = { n, s };
    nodes.push(n);
  }

  // Which producers a reference points at. Usually an exact match, but hard-coded indices also
  // link up with the same variable written another way:
  //   beta[1]     → a general  beta[j] ~ …  prior
  //   alpha[g[i]] → every hard-coded  alpha[1] ~ …,  alpha[2] <- 0,  …
  const byName = {};
  for (const k in prod) (byName[prod[k].s.lhs.name] ||= []).push(k);
  const resolve = r => {
    const k = keyOf(r);
    if (prod[k]) return [k];
    if (k !== r.name) return prod[r.name] ? [r.name] : [];
    return byName[r.name] || [];
  };

  // symbols that get an arrow, so the LaTeX tags them as anchors
  const A = new Set();
  for (const n of nodes)
    n._ast.forEach(a =>
      walk(a, r => {
        if (resolve(r).length) A.add(keyOf(r));
      }),
    );
  const prec = new Set(); // which precision rewrites happened: 'sd', 'var', and 'num' for numbers
  for (const n of nodes) {
    const s = n._s,
      self = keyOf(s.lhs);
    if (n.kind === 'dist') {
      const f = s.rhs.f;
      let args = n._ast.slice();
      let dist = JMAP[f] || 'generic';
      if (['dnorm', 'dt', 'dlnorm'].includes(f) && args[1]) {
        const sc = precToScale(args[1]);
        if (sc) {
          if (strip(args[1]).k === 'num') prec.add('num');
          args[1] = sc.a;
          prec.add(sc.kind);
        }
      }
      const lo = s.trunc && strip(s.trunc[0]);
      if (lo && lo.k === 'num' && +lo.v === 0 && !s.trunc[1]) {
        if (f === 'dnorm') dist = 'halfnormal';
        if (f === 'dt') {
          const df = strip(args[2]);
          dist = df && df.k === 'num' && +df.v === 1 ? 'halfcauchy' : 'halft';
          if (dist === 'halfcauchy') args = args.slice(0, 2);
        }
        if (
          dist.startsWith('half') &&
          strip(args[0]) &&
          strip(args[0]).k === 'num' &&
          +strip(args[0]).v === 0
        )
          args = args.slice(1);
      }
      n.dist = dist;
      n.name = dist === 'generic' ? f.replace(/^d/, '') : DISTS[dist].name;
      n.tex = args.map(a => tex(a, A, self).s).join(',\\ ');
      n.info = `${jagsRef(s.lhs)} ~ ${f}(…)`;
    } else {
      n.tex = tex(s.rhs, A, self).s;
      n.info = s.virtual ? 'linear predictor' : `${jagsRef(s.lhs)} <- …`;
    }
  }
  if (prec.has('sd'))
    msgs.push({
      t: 'note',
      m: `JAGS writes normal and t spreads as precision; the diagram shows the standard deviation instead (1/S² → S${prec.has('num') ? ', and a number p → 1/√p' : ''}).`,
    });
  if (precVars.size)
    msgs.push({
      t: 'note',
      m: `${[...precVars].join(', ')} ${precVars.size > 1 ? 'are' : 'is'} only used as a precision, so the diagram shows the spread ${precVars.size > 1 ? 'they are' : 'it is'} built from instead.`,
    });
  if (prec.has('var'))
    msgs.push({
      t: 'note',
      m: 'JAGS writes normal and t spreads as precision; where that is 1/V, the diagram shows the variance V instead.',
    });
  const loopVars = s => new Set((s.loops || []).map(L => L.v));
  const litIndex = r =>
    (r.idx || [])
      .filter(x => x && x.k === 'num')
      .map(x => x.v)
      .join(',');
  const linked = new Set();
  for (const [k, { n: P, s: ps }] of Object.entries(prod)) {
    let used = false;
    const pv = loopVars(ps);
    const lit = litIndex(ps.lhs);
    for (const C of nodes) {
      if (C === P || !C._ast) continue;
      const hits = new Set(); // keys of the symbols in C that this producer feeds
      C._ast.forEach(a =>
        walk(a, r => {
          if (resolve(r).includes(k)) hits.add(keyOf(r));
        }),
      );
      const cv = loopVars(C._s);
      for (const useKey of hits) {
        used = true;
        // a hard-coded entry feeding a general use: label the arrow with the entry's index
        const entry = useKey !== k && lit ? [lit] : [];
        if (entry.length) linked.add(ps.lhs.name);
        // as in the book, a ~ arrow carries every index of what it draws (beta ~ s → θ_s); an =
        // arrow only the ones the expression it feeds doesn't loop over
        const stoch = P.kind === 'dist';
        edges.push({
          id: nid('e'),
          from: P.id,
          to: C.id,
          anchor: cls(useKey),
          type: stoch ? '~' : '=',
          index: [...[...pv].filter(v => stoch || !cv.has(v)), ...entry].join(','),
        });
      }
    }
    if (!used) {
      const D = {
        id: nid('n'),
        kind: 'data',
        cx: 0,
        cy: 0,
        tex: tex(ps.lhs).s,
        info: jagsRef(ps.lhs),
      };
      nodes.push(D);
      edges.push({
        id: nid('e'),
        from: P.id,
        to: D.id,
        anchor: null,
        type: P.kind === 'dist' ? '~' : '=',
        index: [...pv].join(','),
      });
      if (P.kind === 'dist') P.size = 1.3;
    }
  }
  if (linked.size)
    msgs.push({
      t: 'note',
      m: `${[...linked].join(', ')} ${linked.size > 1 ? 'are' : 'is'} written out entry by entry; each entry’s arrow is labelled with its index.`,
    });
  nodes.forEach(n => {
    delete n._s;
    delete n._ast;
  });
  return { nodes, edges, msgs };
}
