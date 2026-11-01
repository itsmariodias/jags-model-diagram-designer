/*
 * The JAGS → diagram rules: what the reader understands, how it simplifies the model, and how
 * names, precisions and arrows come out. Run with `node --test`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

const app = loadApp();

/** Build a model and index the result by what each node is drawn from, for readable asserts. */
function build(code) {
  const r = app.buildFromJAGS(code);
  const byInfo = info => r.nodes.find(n => n.info === info);
  const edge = (from, to) =>
    r.edges.find(e => e.from === byInfo(from)?.id && e.to === byInfo(to)?.id);
  const notes = r.msgs.map(m => m.m).join('\n');
  return { ...r, byInfo, edge, notes };
}

const BASEBALL = `model {
  for (s in 1:Nsubj) {
    z[s] ~ dbin(theta[s], N[s])
    theta[s] ~ dbeta(omega[c[s]]*(kappa[c[s]]-2)+1, (1-omega[c[s]])*(kappa[c[s]]-2)+1)
  }
  for (c in 1:Ncat) {
    omega[c] ~ dbeta(omegaO*(kappaO-2)+1, (1-omegaO)*(kappaO-2)+1)
    kappa[c] <- kappaMinusTwo[c] + 2
    kappaMinusTwo[c] ~ dgamma(0.01, 0.01)
  }
  omegaO ~ dbeta(1, 1)
  kappaO <- kappaMinusTwoO + 2
  kappaMinusTwoO ~ dgamma(0.01, 0.01)
}`;

test('every example model builds without errors', () => {
  for (const [name, code] of Object.entries(app.EXAMPLES)) {
    const r = build(code);
    assert.ok(r.nodes.length > 0, name);
    assert.ok(!r.msgs.some(m => m.t === 'err'), name);
    // every arrow joins two nodes that exist
    const ids = new Set(r.nodes.map(n => n.id));
    for (const e of r.edges) assert.ok(ids.has(e.from) && ids.has(e.to), name);
  }
});

test('variable names become symbols', () => {
  const name = n => {
    const { b, subs, minus } = app.texName(n);
    return [b, subs.join(','), minus].join('|');
  };
  assert.equal(name('beta0'), '\\beta|0|');
  assert.equal(name('sigma.y'), '\\sigma|y|');
  assert.equal(name('nuPrime'), "\\nu'||");
  assert.equal(name('nu.prime'), "\\nu'||");
  assert.equal(name('omegaO'), '\\omega|O|');
  assert.equal(name('kappaMinusTwo'), '\\kappa||2');
  assert.equal(name('nuMinusOne'), '\\nu||1');
  assert.equal(name('sdY'), '\\mathit{sdY}||'); // not a Greek name: left as it is
});

test('kappaMinusTwo[c] is drawn as (κ_c − 2)', () => {
  const r = build(BASEBALL);
  assert.match(
    r.byInfo('kappa[c] <- …').tex,
    /^\(\\anchor\{kappaMinusTwo\}\{\\kappa\}_\{c\}-2\)\+2$/,
  );
});

test('normal and t precisions are shown as the spread', () => {
  const r = build(`model {
    for (i in 1:N) { y[i] ~ dnorm(mu, 1/sigma^2) }
    mu ~ dnorm(0, 1/pow(S, 2))
    sigma ~ dt(0, 1/V, 3) T(0,)
    S ~ dnorm(0, 1.0E-6)
    V ~ dnorm(0, 0.001)
  }`);
  assert.match(r.byInfo('y[i] ~ dnorm(…)').tex, /\\sigma\}$/);
  assert.match(r.byInfo('mu ~ dnorm(…)').tex, /S\}$/);
  assert.match(r.byInfo('sigma ~ dt(…)').tex, /V\}/); // a variance stays a variance
  assert.equal(r.byInfo('S ~ dnorm(…)').tex, '0,\\ 1000');
  assert.equal(r.byInfo('V ~ dnorm(…)').tex, '0,\\ 31.6');
  assert.match(r.notes, /standard deviation/);
});

test('a precision on its own line is replaced by its spread, unless it has a prior', () => {
  const folded = build(`model {
    for (i in 1:N) { y[i] ~ dnorm(mu, tau) }
    tau <- 1/sigma^2
    sigma ~ dunif(0, 10)
    mu ~ dnorm(0, 1)
  }`);
  assert.equal(folded.byInfo('tau <- …'), undefined);
  assert.ok(folded.edge('sigma ~ dunif(…)', 'y[i] ~ dnorm(…)'));
  assert.match(folded.notes, /tau is only used as a precision/);

  const prior = build(`model {
    for (i in 1:N) { y[i] ~ dnorm(mu, tau) }
    tau ~ dgamma(0.01, 0.01)
    mu ~ dnorm(0, 1)
  }`);
  assert.match(prior.byInfo('y[i] ~ dnorm(…)').tex, /\\tau/);
});

test('helpers that combine several variables are folded; single-variable ones keep a node', () => {
  const gamma = build(app.EXAMPLES.gamma5);
  assert.equal(gamma.byInfo('sh[i] <- …'), undefined);
  assert.equal(gamma.byInfo('ra[i] <- …'), undefined);
  assert.match(gamma.notes, /Folded sh\[i\], ra\[i\]/);

  const r = build(BASEBALL);
  assert.ok(r.byInfo('kappa[c] <- …'));
  assert.ok(r.byInfo('kappaO <- …'));
  assert.doesNotMatch(r.notes, /Folded/);
  const e = r.edge('kappa[c] <- …', 'theta[s] ~ dbeta(…)');
  assert.equal(e.type, '=');
  assert.equal(e.index, 'c');
});

test('arrow index labels follow the book', () => {
  const r = build(BASEBALL);
  // a ~ arrow carries every loop index of what it draws, even into the same loop
  assert.equal(r.edge('theta[s] ~ dbeta(…)', 'z[s] ~ dbin(…)').index, 's');
  assert.equal(r.edge('omega[c] ~ dbeta(…)', 'theta[s] ~ dbeta(…)').index, 'c');
  assert.equal(r.edge('omegaO ~ dbeta(…)', 'omega[c] ~ dbeta(…)').index, '');
  // an = arrow only the indices the node it feeds doesn't loop over
  const lin = build(app.EXAMPLES.linear);
  assert.equal(lin.edge('mu[i] <- …', 'y[i] ~ dnorm(…)').index, '');
});

test('linear predictors get their own bracketed node', () => {
  const r = build(app.EXAMPLES.robust);
  const pred = r.nodes.find(n => n.info === 'linear predictor');
  assert.ok(pred);
  assert.equal(pred.brace, true);
  assert.match(r.notes, /linear predictor/);
});

test('small literal loops over priors used one by one are drawn separately', () => {
  const r = build(app.EXAMPLES.gamma5);
  for (let j = 1; j <= 5; j++) assert.ok(r.byInfo(`beta[${j}] ~ dnorm(…)`), `beta[${j}]`);
  assert.match(r.notes, /Drew beta\[j\] as 5 separate priors/);
});

test('entries written at fixed indices link up with general uses', () => {
  const r = build(`model {
    for (i in 1:N) { y[i] ~ dnorm(alpha[g[i]], 1) }
    alpha[1] ~ dnorm(0, 1)
    alpha[2] <- 0
    alpha[3] ~ dnorm(0, 1)
  }`);
  const use = 'y[i] ~ dnorm(…)';
  assert.equal(r.edge('alpha[1] ~ dnorm(…)', use).index, '1');
  assert.equal(r.edge('alpha[2] <- …', use).index, '2');
  assert.equal(r.edge('alpha[3] ~ dnorm(…)', use).index, '3');
});

test('truncation at zero draws half distributions', () => {
  const r = build(`model {
    for (i in 1:N) { y[i] ~ dnorm(0, 1/a^2 + 1/b^2 + 1/c^2) }
    a ~ dnorm(0, 1) T(0,)
    b ~ dt(0, 1, 1) T(0,)
    c ~ dt(0, 1, 3) T(0,)
  }`);
  assert.equal(r.byInfo('a ~ dnorm(…)').dist, 'halfnormal');
  assert.equal(r.byInfo('b ~ dt(…)').dist, 'halfcauchy');
  assert.equal(r.byInfo('c ~ dt(…)').dist, 'halft');
});

test('a link function on the left is drawn as its inverse', () => {
  const r = build(`model {
    for (i in 1:N) {
      y[i] ~ dbern(p[i])
      logit(p[i]) <- b0 + b1 * x[i]
    }
    b0 ~ dnorm(0, 1)
    b1 ~ dnorm(0, 1)
  }`);
  assert.ok(r.nodes.some(n => /\\mathrm\{logistic\}/.test(n.tex || '')));
});

test('parse errors name the line', () => {
  assert.throws(
    () => app.buildFromJAGS('model {\n  y ~ dnorm(0, 1\n  z ~ dnorm(0, 1)\n}'),
    e => e instanceof app.JagsError && e.line === 3 && /Expected “\)”/.test(e.message),
  );
});

test('long labels split for wrapping at top-level + − and commas only', () => {
  // arrays made in the sandbox are copied out so strict comparison sees ordinary arrays
  const pieces = t => [...app.texWrapPieces(t)];
  assert.deepEqual(pieces('a+b,\\ (c+d)-e'), ['a', '{}+b,', '\\ (c+d)', '{}-e']);
  assert.deepEqual(pieces('\\left(a+b\\right)'), ['\\left(a+b\\right)']);
});
