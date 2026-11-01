/*
 * MathJax configuration. Must load before the MathJax script itself.
 *
 * \anchor{name}{…} wraps a symbol in a CSS class (anc-name) so arrows can aim at that exact glyph.
 * Once MathJax is ready it calls window.jmdBoot (defined in main.js) to start the app.
 */
window.MathJax = {
  // workspace files can come from other people: the safe extension blocks javascript: links and
  // similar in their LaTeX, while allowing the anc-… classes arrows aim at
  loader: { load: ['ui/safe'] },
  tex: { macros: { anchor: ['\\class{anc-#1}{#2}', 2] } },
  svg: { fontCache: 'none' },
  options: {
    enableMenu: false,
    safeOptions: { allow: { URLs: 'safe', classes: 'all', cssIDs: 'safe', styles: 'safe' } },
  },
  startup: {
    typeset: false,
    ready() {
      MathJax.startup.defaultReady();
      MathJax.startup.promise.then(() => window.jmdBoot && window.jmdBoot());
    },
  },
};
