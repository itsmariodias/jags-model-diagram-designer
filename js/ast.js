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

/**
 * JAGS gives normal/t spreads as a precision. Recover the spread the user had in mind:
 *   1/S^2, 1/pow(S,2), 1/(S*S), pow(S,-2), S^-2  → { a: S, kind: 'sd' }
 *   1/V, pow(V,-1), V^-1                         → { a: V, kind: 'var' }
 * Anything else (e.g. a named precision tau) → null, and is shown as written.
 */
function precToScale(a) {
  a = strip(a);
  if (!a) return null;
  const isNum = (x, v) => (x = strip(x)) && x.k === 'num' && +x.v === v;
  const isNeg = (x, v) => (x = strip(x)) && x.k === 'neg' && isNum(x.a, v);
  const sq = b => {
    b = strip(b);
    if (!b) return null;
    if (b.k === 'bin' && b.op === '^' && isNum(b.b, 2)) return strip(b.a);
    if (b.k === 'call' && b.f === 'pow' && isNum(b.args[1], 2)) return strip(b.args[0]);
    if (b.k === 'bin' && b.op === '*' && JSON.stringify(strip(b.a)) === JSON.stringify(strip(b.b)))
      return strip(b.a);
    return null;
  };
  if (a.k === 'bin' && a.op === '/' && isNum(a.a, 1)) {
    const s = sq(a.b);
    return s ? { a: s, kind: 'sd' } : { a: strip(a.b), kind: 'var' };
  }
  const [base, exp] =
    a.k === 'call' && a.f === 'pow' ? a.args : a.k === 'bin' && a.op === '^' ? [a.a, a.b] : [];
  if (base && isNeg(exp, 2)) return { a: strip(base), kind: 'sd' };
  if (base && isNeg(exp, 1)) return { a: strip(base), kind: 'var' };
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
