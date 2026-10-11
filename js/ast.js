/*
 * Helpers for walking, rewriting and classifying JAGS expression ASTs (see parser.js).
 */

function mapAst(a, fn) {
  if (!a) return a;
  switch (a.k) {
    case 'ref': {
      const r = fn(a);
      if (r) return r;
      return { k: 'ref', name: a.name, idx: a.idx ? a.idx.map(x => mapAst(x, fn)) : null };
    }
    case 'num':
      return { k: 'num', v: a.v };
    case 'grp':
      return { k: 'grp', a: mapAst(a.a, fn) };
    case 'neg':
      return { k: 'neg', a: mapAst(a.a, fn) };
    case 'bin':
      return { k: 'bin', op: a.op, a: mapAst(a.a, fn), b: mapAst(a.b, fn) };
    case 'call':
      return { k: 'call', f: a.f, args: a.args.map(x => mapAst(x, fn)) };
    case 'range':
      return { k: 'range', a: mapAst(a.a, fn), b: mapAst(a.b, fn) };
  }
  return a;
}

function walk(a, fn) {
  if (!a) return;
  if (a.k === 'ref') {
    fn(a);
    (a.idx || []).forEach(x => walk(x, fn));
    return;
  }
  if (a.k === 'bin' || a.k === 'range') {
    walk(a.a, fn);
    walk(a.b, fn);
    return;
  }
  if (a.k === 'grp' || a.k === 'neg') {
    walk(a.a, fn);
    return;
  }
  if (a.k === 'call') a.args.forEach(x => walk(x, fn));
}

const strip = a => {
  while (a && a.k === 'grp') a = a.a;
  return a;
};

const keyOf = r => r.name + (r.idx || []).map(x => (x && x.k === 'num' ? '-' + x.v : '')).join('');
const cls = k => String(k).replace(/[^A-Za-z0-9-]/g, '_');

const subst = (a, v, val) =>
  mapAst(a, r => (r.name === v && !r.idx ? { k: 'num', v: String(val) } : null));

function terms(a) {
  a = strip(a);
  if (a && a.k === 'bin' && (a.op === '+' || a.op === '-')) return [...terms(a.a), ...terms(a.b)];
  return [a];
}

function hasRef(a) {
  let h = false;
  walk(a, () => {
    h = true;
  });
  return h;
}

function isPredictor(a) {
  a = strip(a);
  if (!a) return false;
  if (
    a.k === 'call' &&
    ['ilogit', 'exp', 'phi', 'icloglog', 'inv_logit'].includes(a.f) &&
    a.args[0]
  )
    return isPredictor(a.args[0]);
  if (a.k === 'call' && ['inprod', 'sum'].includes(a.f)) return true;
  return terms(a).filter(hasRef).length >= 2;
}

function precToSD(a) {
  a = strip(a);
  if (!a) return null;
  const sq = b => {
    b = strip(b);
    if (!b) return null;
    if (b.k === 'bin' && b.op === '^' && strip(b.b).k === 'num' && +strip(b.b).v === 2)
      return strip(b.a);
    if (
      b.k === 'call' &&
      b.f === 'pow' &&
      b.args[1] &&
      strip(b.args[1]).k === 'num' &&
      +strip(b.args[1]).v === 2
    )
      return strip(b.args[0]);
    if (b.k === 'bin' && b.op === '*' && JSON.stringify(strip(b.a)) === JSON.stringify(strip(b.b)))
      return strip(b.a);
    return null;
  };
  if (a.k === 'bin' && a.op === '/' && strip(a.a).k === 'num' && +strip(a.a).v === 1)
    return sq(a.b);
  if (a.k === 'call' && a.f === 'pow' && a.args[1]) {
    const e = strip(a.args[1]);
    if (e.k === 'neg' && strip(e.a).k === 'num' && +strip(e.a).v === 2) return strip(a.args[0]);
  }
  if (a.k === 'bin' && a.op === '^') {
    const e = strip(a.b);
    if (e.k === 'neg' && strip(e.a).k === 'num' && +strip(e.a).v === 2) return strip(a.a);
  }
  return null;
}

function jagsRef(r) {
  return (
    r.name +
    (r.idx
      ? '[' +
        r.idx
          .map(x => (!x ? '' : x.k === 'num' ? x.v : x.k === 'ref' ? jagsRef(x) : '…'))
          .join(',') +
        ']'
      : '')
  );
}
