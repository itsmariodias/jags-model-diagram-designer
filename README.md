# JAGS Model Diagram Designer

Paste a JAGS model and get a Kruschke-style diagram of it: distribution icons with their parameters, braces for deterministic expressions, and arrows marked `~` or `=`. You can then rearrange and edit the diagram and export it as SVG or PNG.

It is a static web page with no build step and no server code.

**Live version:** https://itsmariodias.github.io/jags-model-diagram-designer/

Developed this with Claude Code to help make drawing JAGS model diagrams easier for my Applied Bayesian Statistics course at RMIT. If there are any bugs, please let me know.

## Quick start

Open `index.html` in a browser. That's it.

The page loads MathJax and fonts from public CDNs, so it needs an internet connection the first time. If you'd rather serve it, any static server works, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Using it

1. **Write or paste a model** in the left pane, or pick one from _Load example…_, then press **Draw diagram from code** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd>).
2. **Arrange** it: drag nodes to move them, drag the paper to pan, and scroll to zoom. _Auto-layout_ tidies everything into rows; _Fit_ zooms to the whole diagram.
3. **Edit** it: click a curve, expression or arrow to change it in the panel on the right. _+ Add_ adds a new distribution, expression or label.
4. **Export** it from the _Export_ menu as SVG or PNG.

Undo and redo work as usual (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>). Your work is kept in the browser between visits, and the **File** menu saves it to a file or opens one again.

Changes you make to the diagram don't go back into the JAGS code, so redrawing from code replaces them (the app asks first).

## What it reads

- `model { … }` blocks with `for` loops, `~` and `<-` statements, and `#` comments.
- The common JAGS distributions (`dnorm`, `dt`, `dgamma`, `dbeta`, `dbern`, `dbin`, `dpois`, and more). Anything else gets a generic curve.
- Variable names become symbols: `beta0` → β₀, `sigma.y` → σ<sub>y</sub>, `omegaO` → ω<sub>O</sub>.
- Normal and t precisions such as `1/sigma^2` are shown as the standard deviation σ, as in Kruschke's diagrams.

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
  history.js          undo / redo
  render.js           MathJax typesetting, node and arrow drawing, pan/zoom
  layout.js           auto-layout
  interaction.js      dragging, panning, zooming, selection, adding nodes
  inspector.js        right-hand editing panel
  menus.js            toolbar dropdown menus (Add, Export)
  export.js           SVG / PNG export
  workspace.js        save / open workspace files
  main.js             wiring and start-up
test/                 Node tests for the JAGS reader, diagram builder and workspace files
```

The scripts are plain (non-module) scripts that share one global scope, so the page also works when opened directly from disk. Code is formatted with [Prettier](https://prettier.io/) using `.prettierrc.json`.

Tests for reading JAGS code and building diagrams are in `test/` and use Node's built-in test runner (Node 22 or later):

```sh
node --test 'test/*.test.js'
```

## Credits

The diagram style comes from John K. Kruschke's book, and this project grew out of the drawing tools described on his blog:

- **John K. Kruschke**, [_Doing Bayesian Data Analysis: A Tutorial with R, JAGS, and Stan_](https://sites.google.com/site/doingbayesiandataanalysis/), 2nd edition, Academic Press, 2015. The hierarchical-model diagrams this tool draws were introduced in the book's first edition (2011).
- **John K. Kruschke**, [_Diagrams for hierarchical models: New drawing tools_](https://doingbayesiandataanalysis.blogspot.com/2013/10/diagrams-for-hierarchical-models-new.html), _Doing Bayesian Data Analysis_ blog, 31 October 2013.
- **Rasmus Bååth**, [`distribution_diagrams`](https://github.com/rasmusab/distribution_diagrams) (MIT licence): R scripts and LibreOffice Draw templates for drawing distribution icons in Kruschke's style. The look of the distribution icons here follows his.

Math rendering by [MathJax](https://www.mathjax.org/). Fonts: [IBM Plex](https://www.ibm.com/plex/) and [STIX Two](https://www.stixfonts.org/).

## License

[MIT](LICENSE) © Mario Dias
