/*
 * Workspace files come from anyone, so opening one checks it and keeps only what the app
 * understands. Run with `node --test`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

const app = loadApp();

const node = (id, extra) => ({ id, kind: 'dist', cx: 0, cy: 0, dist: 'normal', ...extra });

test('rejects files that are not workspaces', () => {
  for (const bad of [null, 42, {}, { nodes: [] }, { app: 'something-else', nodes: [node('n1')] }])
    assert.throws(() => app.parseWorkspace(bad), /isn’t a workspace/);
});

test('keeps known fields and drops the rest', () => {
  const ws = app.parseWorkspace({
    code: 'model {}',
    nodes: [
      node('n1', { tex: 'x', evil: '<script>', size: 1.2, nameSize: 1.5 }),
      node('n2', { dist: 'not-a-shape' }),
      { id: 'n3', kind: 'nonsense', cx: 0, cy: 0 },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', type: '~', index: 'i', anchor: 'mu' },
      { id: 'e2', from: 'n1', to: 'missing', type: '~' },
      { id: 'e3', from: 'n1', to: 'n2', type: '!' },
    ],
  });
  // arrays made in the sandbox are copied out so strict comparison sees ordinary arrays
  assert.deepEqual([...ws.nodes.map(n => n.id)], ['n1', 'n2']);
  assert.equal(ws.nodes[0].evil, undefined);
  assert.equal(ws.nodes[0].nameSize, 1.5);
  assert.equal(ws.nodes[1].dist, 'generic');
  assert.deepEqual([...ws.edges.map(e => e.id)], ['e1']);
});

test('clamps settings to the slider ranges', () => {
  const ws = app.parseWorkspace({
    nodes: [node('n1')],
    settings: { math: 999, icon: -1, name: 'big', gap: 50 },
  });
  assert.equal(ws.settings.math, 48);
  assert.equal(ws.settings.icon, 0.6);
  assert.equal(ws.settings.name, 1);
  assert.equal(ws.settings.gap, 50);
});

test('older files without drawing info count as edited by hand', () => {
  const ws = app.parseWorkspace({ code: 'model {}', nodes: [node('n1')] });
  assert.equal(ws.drawn.code, 'model {}');
  assert.equal(ws.drawn.key, null);
});
