/*
 * JAGS parser: tokenizer and a small recursive-descent parser for model { … } blocks.
 *
 * Produces a flat list of statements, each { kind: 'stoch' | 'det', lhs, rhs, loops, trunc, line }.
 * Expressions are ASTs whose nodes have a kind `k`: num, ref, call, bin, neg, grp, range.
 * data { … } blocks are skipped.
 */

class JagsError extends Error {
  constructor(m, line) {
    super(m);
    this.line = line;
  }
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  const lineAt = p => src.slice(0, p).split('\n').length;
  while (i < n) {
    const c = src[i];
    if (c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c) || (c === '.' && /[A-Za-z_]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j), p: i });
      i = j;
      continue;
    }
    const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i, i + 40));
    if (m) {
      toks.push({ t: 'num', v: m[0], p: i });
      i += m[0].length;
      continue;
    }
    if (c === '%') {
      const j = src.indexOf('%', i + 1);
      if (j > 0) {
        toks.push({ t: 'op', v: src.slice(i, j + 1), p: i });
        i = j + 1;
        continue;
      }
    }
    const two = src.substr(i, 2);
    if (['<-', '<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      toks.push({ t: 'op', v: two, p: i });
      i += 2;
      continue;
    }
    if ('+-*/^~(),[]{}:;=<>!'.includes(c)) {
      toks.push({ t: 'op', v: c, p: i });
      i++;
      continue;
    }
    throw new JagsError(`Unexpected character “${c}”`, lineAt(i));
  }
  return { toks, lineAt };
}

function parseJAGS(src) {
  const { toks, lineAt } = tokenize(src);
  let k = 0;
  const peek = (o = 0) => toks[k + o];
  const is = (v, o = 0) => {
    const t = toks[k + o];
    return !!t && t.t !== 'num' && t.v === v;
  };
  const fail = (t, m) => {
    throw new JagsError(m, t ? lineAt(t.p) : lineAt(src.length));
  };
  const next = () => {
    const t = toks[k++];
    if (!t) fail(null, 'Unexpected end of model');
    return t;
  };
  const expect = v => {
    const t = toks[k];
    if (!t || t.v !== v) fail(t, `Expected “${v}”${t ? ` but found “${t.v}”` : ''}`);
    k++;
    return t;
  };
  const stmts = [];
  function block(loops) {
    while (k < toks.length && !is('}')) stmt(loops);
    expect('}');
  }
  function stmt(loops) {
    if (is(';')) {
      k++;
      return;
    }
    if (is('for') && is('(', 1)) {
      k += 2;
      const v = next().v;
      const kw = next();
      if (kw.v !== 'in') fail(kw, 'Expected “in” in for loop');
      const from = expr();
      expect(':');
      const to = expr();
      expect(')');
      const L = [...loops, { v, from, to }];
      if (is('{')) {
        k++;
        block(L);
      } else stmt(L);
      return;
    }
    const start = peek();
    const lhs = postfix();
    const op = next();
    if (op.v === '~') {
      const rhs = expr();
      let trunc = null;
      if ((is('T') || is('I')) && is('(', 1)) {
        k += 2;
        trunc = [null, null];
        let side = 0;
        while (!is(')')) {
          if (is(',')) {
            k++;
            side = 1;
            continue;
          }
          trunc[side] = expr();
        }
        k++;
      }
      if (rhs.k !== 'call') fail(start, 'A “~” statement needs a distribution such as dnorm(…)');
      stmts.push({ kind: 'stoch', lhs, rhs, loops, trunc, line: lineAt(start.p) });
    } else if (op.v === '<-' || op.v === '=') {
      stmts.push({ kind: 'det', lhs, rhs: expr(), loops, line: lineAt(start.p) });
    } else fail(op, `Expected “~” or “<-” but found “${op.v}”`);
    if (is(';')) k++;
  }
  function expr() {
    return add();
  }
  function add() {
    let a = mul();
    while (is('+') || is('-')) {
      const op = next().v;
      a = { k: 'bin', op, a, b: mul() };
    }
    return a;
  }
  function mul() {
    let a = unary();
    while (is('*') || is('/') || (peek() && peek().t === 'op' && /^%.+%$/.test(peek().v))) {
      const op = next().v;
      a = { k: 'bin', op, a, b: unary() };
    }
    return a;
  }
  function unary() {
    if (is('-')) {
      k++;
      return { k: 'neg', a: unary() };
    }
    if (is('+')) {
      k++;
      return unary();
    }
    return pow();
  }
  function pow() {
    const b = postfix();
    if (is('^')) {
      k++;
      return { k: 'bin', op: '^', a: b, b: unary() };
    }
    return b;
  }
  function postfix() {
    const t = next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.v === '(') {
      const e = expr();
      expect(')');
      return { k: 'grp', a: e };
    }
    if (t.t !== 'id') fail(t, `Unexpected “${t.v}”`);
    let node;
    if (is('(')) {
      k++;
      const args = [];
      while (!is(')')) {
        args.push(expr());
        if (is(',')) k++;
        else break;
      }
      expect(')');
      node = { k: 'call', f: t.v, args };
    } else node = { k: 'ref', name: t.v, idx: null };
    if (is('[')) {
      k++;
      const idx = [];
      let cur = null;
      for (;;) {
        if (is(']')) {
          idx.push(cur);
          k++;
          break;
        }
        if (is(',')) {
          idx.push(cur);
          cur = null;
          k++;
          continue;
        }
        let a = expr();
        if (is(':')) {
          k++;
          a = { k: 'range', a, b: expr() };
        }
        cur = a;
      }
      if (node.k === 'ref') node.idx = idx;
    }
    return node;
  }
  while (k < toks.length) {
    if ((is('model') || is('data')) && is('{', 1)) {
      const kw = next().v;
      k++;
      if (kw === 'data') {
        let depth = 1;
        while (k < toks.length && depth) {
          const t = next();
          if (t.v === '{') depth++;
          else if (t.v === '}') depth--;
        }
      } else block([]);
      continue;
    }
    stmt([]);
  }
  return stmts;
}
