/*
 * Distribution icons.
 *
 * Each entry describes the little "shape" icon drawn for a distribution node, in the style of
 * Kruschke's hierarchical-model diagrams and Rasmus Bååth's distribution_diagrams icons.
 *   dom  – x-range the pdf is sampled over
 *   pdf  – unnormalised density (only its shape matters)
 *   type – 'bars' for discrete distributions (with probabilities p), 'uniform' for a flat box
 *   lab  – where the parameter label sits, as fractions of the icon's width and height
 */

const binom = (n, p) => {
  const o = [];
  let c = 1;
  for (let k = 0; k <= n; k++) {
    o.push(c * Math.pow(p, k) * Math.pow(1 - p, n - k));
    c = (c * (n - k)) / (k + 1);
  }
  return o;
};

const pois = (l, n) => {
  const o = [];
  let f = 1;
  for (let k = 0; k <= n; k++) {
    if (k) f *= k;
    o.push((Math.exp(-l) * Math.pow(l, k)) / f);
  }
  return o;
};

// prettier-ignore
const DISTS = {
  normal:      { name: 'normal',        dom: [-3.3, 3.3], pdf: x => Math.exp(-x * x / 2),                          lab: [0.72, 0.46] },
  t:           { name: 'student-t',     dom: [-5, 5],     pdf: x => Math.pow(1 + x * x / 2, -1.5),                 lab: [0.72, 0.46] },
  gamma:       { name: 'gamma',         dom: [0, 9],      pdf: x => Math.pow(x, 0.9) * Math.exp(-x),               lab: [0.66, 0.36] },
  beta:        { name: 'beta',          dom: [0, 1],      pdf: x => Math.pow(x, 1.4) * Math.pow(1 - x, 2.2),       lab: [0.66, 0.36] },
  uniform:     { name: 'uniform',       type: 'uniform',                                                           lab: [0.5, 0.22] },
  exponential: { name: 'exponential',   dom: [0, 5],      pdf: x => Math.exp(-x),                                  lab: [0.56, 0.36] },
  lognormal:   { name: 'log-normal',    dom: [0, 7],      pdf: x => x <= 0 ? 0 : Math.exp(-Math.pow(Math.log(x), 2) / 0.72) / x, lab: [0.62, 0.36] },
  halfnormal:  { name: 'half-normal',   dom: [0, 3.3],    pdf: x => Math.exp(-x * x / 2),                          lab: [0.56, 0.36] },
  halft:       { name: 'half-student-t', dom: [0, 5],      pdf: x => Math.pow(1 + x * x / 2, -1.5),                 lab: [0.56, 0.36] },
  halfcauchy:  { name: 'half-Cauchy',   dom: [0, 6],      pdf: x => 1 / (1 + x * x),                               lab: [0.56, 0.36] },
  logistic:    { name: 'logistic',      dom: [-6, 6],     pdf: x => Math.exp(-x) / Math.pow(1 + Math.exp(-x), 2),  lab: [0.72, 0.46] },
  laplace:     { name: 'laplace',       dom: [-5, 5],     pdf: x => Math.exp(-Math.abs(x)),                        lab: [0.72, 0.46] },
  weibull:     { name: 'weibull',       dom: [0, 3],      pdf: x => Math.pow(x, 0.6) * Math.exp(-Math.pow(x, 1.6)), lab: [0.64, 0.36] },
  chisq:       { name: 'chi-squared',   dom: [0, 12],     pdf: x => Math.sqrt(x) * Math.exp(-x / 2),               lab: [0.66, 0.36] },
  pareto:      { name: 'pareto',        dom: [0, 5],      pdf: x => x < 1 ? 0 : Math.pow(x, -3),                   lab: [0.6, 0.36] },
  bernoulli:   { name: 'bernoulli',     type: 'bars', p: [0.35, 0.65],                                             lab: [0.5, 0.2] },
  binomial:    { name: 'binomial',      type: 'bars', p: binom(8, 0.4),                                            lab: [0.7, 0.2] },
  poisson:     { name: 'poisson',       type: 'bars', p: pois(2.5, 8),                                             lab: [0.7, 0.2] },
  negbin:      { name: 'neg. binomial', type: 'bars', p: [0.12, 0.2, 0.2, 0.16, 0.12, 0.08, 0.06, 0.04, 0.02],  lab: [0.7, 0.2] },
  categorical: { name: 'categorical',   type: 'bars', p: [0.2, 0.42, 0.14, 0.28],                                  lab: [0.5, 0.18] },
  dirichlet:   { name: 'dirichlet',     type: 'bars', p: [0.3, 0.22, 0.48],                                        lab: [0.5, 0.18] },
  mvnormal:    { name: 'mv normal',     dom: [-3.3, 3.3], pdf: x => Math.exp(-x * x / 2),                          lab: [0.72, 0.46] },
  generic:     { name: 'distribution',  dom: [-3.3, 3.3], pdf: x => Math.exp(-x * x / 2),                          lab: [0.72, 0.46] },
};

/** JAGS distribution function → key in DISTS. Anything not listed is drawn as `generic`. */
// prettier-ignore
const JMAP = {
  dnorm: 'normal', dt: 't', dgamma: 'gamma', dbeta: 'beta', dunif: 'uniform', dexp: 'exponential',
  dlnorm: 'lognormal', dlogis: 'logistic', ddexp: 'laplace', dweib: 'weibull', dchisqr: 'chisq',
  dpar: 'pareto', dbern: 'bernoulli', dbin: 'binomial', dbinom: 'binomial', dpois: 'poisson',
  dnegbin: 'negbin', dcat: 'categorical', ddirch: 'dirichlet', ddirich: 'dirichlet',
  dmnorm: 'mvnormal', dmt: 'mvnormal',
};

/** Draw distribution D into group g as a w×h icon (sc = icon scale, used for stroke width). */
function drawDist(g, D, w, h, sc) {
  const sw = 2.6 * Math.sqrt(sc);

  if (D.type === 'bars') {
    const p = D.p,
      mx = Math.max(...p),
      x0 = w * 0.14,
      slot = (w * 0.72) / p.length;
    p.forEach((v, i) => {
      const bh = (v / mx) * h * 0.8;
      el(
        'rect',
        { x: x0 + slot * i + slot * 0.28, y: h - bh, width: slot * 0.44, height: bh, fill: CURVE },
        g,
      );
    });
    return;
  }

  if (D.type === 'uniform') {
    const d = `M${w * 0.12} ${h}V${h * 0.42}H${w * 0.88}V${h}`;
    el('path', { d, fill: 'none', stroke: CURVE, 'stroke-width': sw }, g);
    return;
  }

  const [a, b] = D.dom,
    N = 150,
    ys = [];
  let mx = 0;
  for (let i = 0; i <= N; i++) {
    let y = D.pdf(a + ((b - a) * i) / N);
    if (!isFinite(y)) y = 0;
    ys.push(y);
    if (y > mx) mx = y;
  }
  const top = h * 0.06,
    X = i => (w * i) / N,
    Y = v => h - ((h - top) * v) / mx;
  // drop a vertical edge to the baseline when the curve starts above zero
  let d = (ys[0] / mx > 0.04 ? `M0 ${h}L` : 'M') + `${X(0)} ${Y(ys[0])}`;
  for (let i = 1; i <= N; i++) d += `L${X(i).toFixed(2)} ${Y(ys[i]).toFixed(2)}`;
  el('path', { d, fill: 'none', stroke: CURVE, 'stroke-width': sw, 'stroke-linejoin': 'round' }, g);
}
