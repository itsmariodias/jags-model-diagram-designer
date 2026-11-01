/*
 * JAGS expression AST → LaTeX.
 *
 * Variable names become math symbols (beta0 → \beta_0, sigma_y → \sigma_y). References to other
 * nodes are wrapped in \anchor{…}{…} so arrows can point at the exact symbol they feed.
 * Each tex() result carries a precedence `p` used to decide where parentheses are needed.
 */

const GREEK = new Set(
  'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'.split(
    ' ',
  ),
);

function texName(name) {
  let parts = name.split(/[._]/).filter(Boolean);
  let base = parts.shift() || name;
  // nuPrime, nu.prime and nu_prime all become ν′ (JAGS names can't contain ')
  const camel = /^(.+?)Prime$/.exec(base);
  const prime = !!camel || parts.some(p => /^prime$/i.test(p));
  if (camel) base = camel[1];
  parts = parts.filter(p => !/^prime$/i.test(p));
  let subs = parts;
  const m = /^([A-Za-z]+?)(\d+)$/.exec(base);
  if (m) {
    base = m[1];
    subs = [m[2], ...subs];
  }
  const b = GREEK.has(base) ? '\\' + base : base.length === 1 ? base : '\\mathit{' + base + '}';
  return {
    b: prime ? b + "'" : b,
    subs: subs.map(s => (s.length === 1 || /^\d+$/.test(s) ? s : '\\mathrm{' + s + '}')),
  };
}

const paren = s => '(' + s + ')';

function fmtNum(v) {
  const m = /^([\d.]+)[eE]([+-]?\d+)$/.exec(v);
  if (!m) return v;
  const e = String(parseInt(m[2], 10)),
    man = parseFloat(m[1]);
  return (man === 1 ? '' : m[1] + '\\times ') + '10^{' + e + '}';
}

function texRef(r, A, self) {
  const { b, subs } = texName(r.name);
  const ix = (r.idx || [])
    .filter(Boolean)
    .map(x => (x.k === 'num' ? x.v : x.k === 'range' ? tex(x.a).s + '{:}' + tex(x.b).s : tex(x).s));
  const all = [...subs, ...ix];
  const kk = keyOf(r);
  let s = A && A.has(kk) && kk !== self ? '\\anchor{' + cls(kk) + '}{' + b + '}' : b;
  if (all.length) s += '_{' + all.join(all.every(p => p.length === 1) ? '' : ',') + '}';
  return s;
}

function tex(a, A, self) {
  a = strip(a);
  if (!a) return { s: '', p: 9 };
  switch (a.k) {
    case 'num':
      return { s: fmtNum(a.v), p: /e/i.test(a.v) ? 2 : 9 };
    case 'ref':
      return { s: texRef(a, A, self), p: 9, atom: true };
    case 'neg': {
      const x = tex(a.a, A, self);
      return { s: '-' + (x.p <= 3 ? paren(x.s) : x.s), p: 3 };
    }
    case 'range':
      return { s: tex(a.a, A, self).s + '{:}' + tex(a.b, A, self).s, p: 1 };
    case 'bin': {
      const op = a.op;
      if (op === '+' || op === '-') {
        const L = tex(a.a, A, self),
          R = tex(a.b, A, self);
        let rs = R.s;
        if (op === '-' && R.p <= 1) rs = paren(rs);
        if (op === '+' && R.p === 3) return { s: L.s + rs, p: 1 };
        return { s: L.s + op + rs, p: 1 };
      }
      if (op === '*') {
        const L = tex(a.a, A, self),
          R = tex(a.b, A, self);
        const ls = L.p < 2 ? paren(L.s) : L.s,
          rs = R.p < 2 || R.p === 3 ? paren(R.s) : R.s;
        const numL = strip(a.a).k === 'num',
          numR = strip(a.b).k === 'num';
        return { s: ls + (numR || (numL && numR) ? ' \\cdot ' : ' ') + rs, p: 2 };
      }
      if (op === '/') {
        const L = tex(a.a, A, self),
          R = tex(a.b, A, self);
        return { s: (L.p < 2 ? paren(L.s) : L.s) + '/' + (R.p <= 3 ? paren(R.s) : R.s), p: 2 };
      }
      if (op === '^') return powTex(a.a, a.b, A, self);
      if (op === '%*%') {
        const L = tex(a.a, A, self),
          R = tex(a.b, A, self);
        return { s: L.s + '\\,' + R.s, p: 2 };
      }
      const L = tex(a.a, A, self),
        R = tex(a.b, A, self);
      return { s: L.s + '\\mathbin{' + op.replace(/%/g, '\\%') + '}' + R.s, p: 1 };
    }
    case 'call': {
      const f = a.f,
        args = a.args.map(x => tex(x, A, self).s);
      if (f === 'pow' && a.args.length === 2) return powTex(a.args[0], a.args[1], A, self);
      if (f === 'sqrt') return { s: '\\sqrt{' + args[0] + '}', p: 9 };
      if (f === 'abs') return { s: '\\left|' + args[0] + '\\right|', p: 9 };
      const named = {
        exp: '\\exp',
        log: '\\log',
        ilogit: '\\mathrm{logistic}',
        inv_logit: '\\mathrm{logistic}',
        logit: '\\mathrm{logit}',
        phi: '\\Phi',
        sin: '\\sin',
        cos: '\\cos',
        max: '\\max',
        min: '\\min',
        sum: '\\sum',
        mean: '\\mathrm{mean}',
        inprod: '\\mathrm{inprod}',
        step: '\\mathrm{step}',
        icloglog: '\\mathrm{icloglog}',
      };
      const fn = named[f] || '\\mathrm{' + f.replace(/_/g, '\\_') + '}';
      return { s: fn + '(' + args.join(',') + ')', p: 9 };
    }
  }
  return { s: '?', p: 9 };
}

function powTex(base, e, A, self) {
  const B = tex(base, A, self),
    E = tex(e, A, self);
  const bs =
    B.atom && !/\^/.test(B.s) ? B.s : B.p < 9 || /\^/.test(B.s) ? paren(B.s) : '{' + B.s + '}';
  return { s: bs + '^{' + E.s + '}', p: 4 };
}

/**
 * Split a label at its top-level + − and commas so it can wrap over several lines (MathJax 3
 * can't break lines itself). Groups, brackets and \left…\right pairs are never split. A piece
 * that starts with an operator gets a leading {} so the operator keeps its binary spacing.
 */
function texWrapPieces(t) {
  const out = [];
  let depth = 0,
    start = 0;
  const skipDelimiter = i =>
    t[i] === '\\' ? i + (/^\\[A-Za-z]+/.exec(t.slice(i)) || ['\\x'])[0].length - 1 : i;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') {
      const cmd = (/^\\([A-Za-z]+|.)/.exec(t.slice(i)) || ['\\'])[0];
      i += cmd.length - 1;
      if (cmd === '\\left' || cmd === '\\right') {
        depth += cmd === '\\left' ? 1 : -1;
        i = skipDelimiter(i + 1); // the delimiter after \left / \right doesn't count again
      }
      continue;
    }
    if ('{(['.includes(c)) depth++;
    else if ('})]'.includes(c)) depth--;
    else if (depth === 0 && i > start && (c === '+' || c === '-')) {
      out.push(t.slice(start, i));
      start = i;
    } else if (depth === 0 && c === ',') {
      out.push(t.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(t.slice(start));
  return out.filter(p => p.trim()).map((p, k) => (k && /^[+-]/.test(p) ? '{}' + p : p));
}
