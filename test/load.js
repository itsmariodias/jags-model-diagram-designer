/*
 * Loads the app's own scripts into a sandbox so tests can call them without a browser.
 *
 * The scripts are plain browser scripts sharing one global scope, so they are joined in page
 * order and run in one vm context. Only the parts that don't need the DOM are used: the JAGS
 * reader, the LaTeX writer, the diagram builder and the workspace-file checks.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILES = [
  'util',
  'distributions',
  'parser',
  'ast',
  'latex',
  'graph',
  'examples',
  'state',
  'workspace',
];

const EXPORTS = [
  'buildFromJAGS',
  'parseJAGS',
  'JagsError',
  'texName',
  'texWrapPieces',
  'precToScale',
  'parseWorkspace',
  'EXAMPLES',
  'DISTS',
];

function loadApp() {
  const src = FILES.map(f =>
    fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'),
  ).join('\n;\n');
  // state.js looks up a few page elements when it loads; there are none here
  const context = { document: { querySelector: () => null }, console };
  vm.createContext(context);
  return vm.runInContext(`${src}\n;({ ${EXPORTS.join(', ')} })`, context);
}

module.exports = { loadApp };
