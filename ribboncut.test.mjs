// The thin-ink cut as a tank setting (#9: "make it a toggle then").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

// A long, 0.3 mm-wide strip with a fat end, as in tau.test.mjs.
const strip = (m) => {
  const pts = [];
  for (let a = 0; a <= 32; a++) { const t = -Math.PI / 2 + (a / 32) * Math.PI; pts.push([60 + 20 * Math.cos(t), 20 * Math.sin(t)]); }
  for (let i = 60; i >= 0; i--) pts.push([-60 + i * 2, 0.15]);
  for (let i = 0; i <= 60; i++) pts.push([-60 + i * 2, -0.15]);
  const xy = new Float64Array(pts.length * 4);
  pts.forEach(([x, y], i) => { xy[i * 2] = x; xy[i * 2 + 1] = y; });
  m.polys.push({ xy, n: pts.length, color: '#224466' });
};
// A rake far from the strip: the cut runs while any tool moves ink.
const comb = (m) => {
  m.rake({ from: [-140, 90], to: [140, 90], teeth: 1, spacing: 20, speed: 100, D: 2 });
  for (let t = 0; t < 600 && m.busy; t++) m.step();
};
const width = (m) => m.polys.reduce((a, p) => a + p.n, 0);

test('ribbonCut is on by default and logged when changed', () => {
  const m = new Marble({ width: 300, height: 200, seed: 1 });
  assert.equal(m.ribbonCutOn, true);
  m.ribbonCut({ on: false, at: 0 });
  m.step();
  assert.equal(m.ribbonCutOn, false);
  assert.deepEqual(m.log.at(-1), { fn: 'ribbonCut', args: { on: false, at: 0 } });
  const again = new Marble({ width: 300, height: 200, seed: 1 }).replay(m.log);
  again.step();
  assert.equal(again.ribbonCutOn, false);
});

test('with the cut on a 0.3 mm thread is cut while a tool runs; off, it stays whole', () => {
  const on = new Marble({ width: 300, height: 200, seed: 1 });
  strip(on);
  const before = width(on);
  comb(on);
  const off = new Marble({ width: 300, height: 200, seed: 1 });
  off.ribbonCut({ on: false, at: 0 });
  strip(off);
  comb(off);
  // The fat end stays either way; only the thread goes.
  const thread = (m) => m.polys.some((p) => { for (let i = 0; i < p.n; i++) if (p.xy[i * 2] < -40) return true; return false; });
  assert.equal(thread(on), false, `on: the thread is cut (${width(on)} of ${before} points left)`);
  assert.equal(thread(off), true, 'off: the thread is still there');
});
