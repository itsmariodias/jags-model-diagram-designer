# JAGS Model Diagram Designer

Paste a JAGS model and get a Kruschke-style diagram of it: distribution icons with their parameters, braces for deterministic expressions, and arrows marked `~` or `=`. You can then rearrange and edit the diagram and export it as SVG or PNG.

It is a static web page with no build step and no server code.

**Live version:** https://itsmariodias.github.io/jags-model-diagram-designer/

Developed this with Claude Code to help make drawing JAGS model diagrams easier for my Applied Bayesian Statistics course at RMIT. If there are any bugs please let me know.

## Quick start

Open `index.html` in a browser. That's it.

The page loads MathJax and fonts from public CDNs, so it needs an internet connection the first time. If you'd rather serve it, any static server works, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Using it

1. **Write or paste a model** in the left pane (or pick one from _Load example…_), then press **Draw diagram from code** (or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd>).
2. **Arrange** – drag nodes to move them, drag the paper to pan, scroll to zoom. _Auto-layout_ rearranges everything in layers; _Fit_ zooms to the whole diagram.
3. **Edit** – click a curve, expression or arrow to edit it in the inspector on the right. You can change the distribution shape, the name on its baseline, its LaTeX parameters, icon size and label position, or an arrow's relation (`~` / `=`), target symbol and index label. _+ Distribution_, _+ Expression_ and _+ Label_ add new nodes. <kbd>Delete</kbd> removes the selection.
4. **Export** – _Copy SVG_, _Save SVG_, or _Save PNG_ (3× resolution). Exports are always on white paper.

Your diagram, code and settings are autosaved in the browser (localStorage), so a reload picks up where you left off. Edits in the diagram are **not** written back to the JAGS code. Redrawing from code replaces the diagram.

### Pointing arrows at a symbol

Arrows aim at symbols tagged with `\anchor{name}{…}` in a node's LaTeX. For example, `\mu,\ \anchor{sigma}{\sigma}` lets an arrow point at the σ specifically. Diagrams drawn from code tag every referenced parameter automatically.

### Theme

The toolbar button on the right cycles between **System**, **Light** and **Dark**. The choice is remembered. The drawing paper stays white in every theme so it matches what you export.

## What the JAGS reader understands

- `model { … }` blocks (`data { … }` blocks are skipped), `for (i in a:b)` loops, `~` and `<-` statements, and `#` comments.
- Link functions on the left-hand side, such as `logit(p[i]) <- …`, which are drawn as their inverse (`logistic(…)`).
- Truncation `T(0,)` / `I(0,)` on `dnorm` and `dt`, drawn as half-normal, half-t or half-Cauchy.
- Distributions: `dnorm`, `dt`, `dgamma`, `dbeta`, `dunif`, `dexp`, `dlnorm`, `dlogis`, `ddexp`, `dweib`, `dchisqr`, `dpar`, `dbern`, `dbin`/`dbinom`, `dpois`, `dnegbin`, `dcat`, `ddirch`/`ddirich`, `dmnorm`, `dmt`. Anything else gets a generic curve with its name.

To keep diagrams readable, it also simplifies a few things and leaves a note under the editor each time:

- Normal and t **precisions** written as `1/S^2`, `1/pow(S,2)` or `pow(S,-2)` are shown as the standard deviation `S`.
- **Linear predictors** (sums of terms, `inprod`, or those wrapped in `ilogit`/`exp`/`phi`) get their own bracketed expression node, even when written inline in a distribution.
- **Other deterministic nodes** are folded into the parameters that use them.
- **Small literal loops** (up to 8 iterations) over priors that the model uses one at a time, such as `beta[1]`, `beta[2]`, …, are drawn as separate distributions.
- **Entries written at fixed indices** link up with how the model uses them. If you write `alpha[1] ~ dnorm(…)`, `alpha[2] <- 0` and `alpha[3] ~ dnorm(…)` but use `alpha[g[i]]`, each entry gets an arrow to α labelled with its index. In the other direction, `beta[1]` used against a general `beta[j] ~ …` prior is linked to that prior.

## Project structure

```
index.html            page markup; loads the scripts below in order
css/style.css         layout and light/dark theme tokens
js/
  theme.js            System / Light / Dark toggle (loaded in <head> to avoid a flash)
  mathjax-config.js   MathJax setup, including the \anchor macro
  util.js             shared helpers ($, el, h, esc) and ids
  distributions.js    distribution icon shapes and the JAGS → icon mapping
  parser.js           JAGS tokenizer and parser
  ast.js              expression-tree helpers
  latex.js            expression tree → LaTeX
  graph.js            parsed model → diagram nodes and arrows
  examples.js         example models
  state.js            app state and localStorage persistence
  render.js           MathJax typesetting, node and arrow drawing, pan/zoom
  layout.js           auto-layout
  interaction.js      dragging, panning, zooming, selection, adding nodes
  inspector.js        right-hand editing panel
  export.js           SVG / PNG export
  main.js             wiring and start-up
```

The scripts are plain (non-module) scripts that share one global scope, so the page also works when opened directly from disk. Code is formatted with [Prettier](https://prettier.io/) using `.prettierrc.json`.

## Deployment

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs on every push and pull request. It syntax-checks the scripts and checks formatting with Prettier. On `main`, it then publishes `index.html`, `css/` and `js/` to GitHub Pages.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

To run the same checks locally:

```sh
for f in js/*.js; do node --check "$f"; done
npx prettier@3.3.3 --check .
```

## Credits

The diagram style comes from John K. Kruschke's book, and this project grew out of the drawing tools described on his blog:

- **John K. Kruschke**, [_Doing Bayesian Data Analysis: A Tutorial with R, JAGS, and Stan_](https://sites.google.com/site/doingbayesiandataanalysis/), 2nd edition, Academic Press, 2015. The hierarchical-model diagrams this tool draws were introduced in the book's first edition (2011).
- **John K. Kruschke**, [_Diagrams for hierarchical models: New drawing tools_](https://doingbayesiandataanalysis.blogspot.com/2013/10/diagrams-for-hierarchical-models-new.html), _Doing Bayesian Data Analysis_ blog, 31 October 2013.
- **Rasmus Bååth**, [`distribution_diagrams`](https://github.com/rasmusab/distribution_diagrams) (MIT licence): R scripts and LibreOffice Draw templates for drawing distribution icons in Kruschke's style. The look of the distribution icons here follows his.

Math rendering by [MathJax](https://www.mathjax.org/). Fonts: [IBM Plex](https://www.ibm.com/plex/) and [STIX Two](https://www.stixfonts.org/).

## License

[MIT](LICENSE) © Mario Dias
