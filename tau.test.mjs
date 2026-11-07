// Thickness τ = A0/A: set when a film stops spreading, darkens squeezed ink, spares squeezed seams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble, thickness, squeezedColour } from './engine.js';

const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };

test('a film at rest has τ = 1, and combing keeps it there', () => {
  const m = new Marble({ width: 600, height: 420, seed: 1 });
  m.drop({ quantity: 0.5, color: '#2c4f86' });
  m.runUntilIdle();
  const [p] = m.polys;
  assert.ok(p.a0 > 0);
  assert.equal(thickness(p), 1);
  m.rake({ from: [-300, 10], to: [300, 10], teeth: 5, spacing: 20, speed: 150, D: 10 });
  m.runUntilIdle();
  assert.ok(Math.abs(thickness(m.polys[0]) - 1) < 0.02, `${thickness(m.polys[0])}`);
});

test('squeezed ink is thicker and darker, up to its own spreading', () => {
  const p = { xy: Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]), n: 4, a0: 300, tauMax: 4 };
  assert.equal(thickness(p), 3);
  assert.equal(thickness({ ...p, a0: 1000 }), 4, 'capped');
  assert.ok(luma(squeezedColour('#7aa0d0', 3)) < luma('#7aa0d0'));
  assert.equal(squeezedColour('#7aa0d0', 1), '#7aa0d0');
});

test('the ribbon cut spares a thin ribbon that is squeezed, and cuts one that is merely stretched', () => {
  // A long, 0.3 mm-wide strip with a fat end, drawn as one outline.
  const strip = () => {
    // Starting on the fat end, so the thin tail lies in the middle of the list, as after combing.
    const pts = [];
    for (let a = 0; a <= 32; a++) { const t = -Math.PI / 2 + (a / 32) * Math.PI; pts.push([60 + 20 * Math.cos(t), 20 * Math.sin(t)]); }
    for (let i = 60; i >= 0; i--) pts.push([-60 + i * 2, 0.15]);
    for (let i = 0; i <= 60; i++) pts.push([-60 + i * 2, -0.15]);
    const xy = new Float64Array(pts.length * 4);
    pts.forEach(([x, y], i) => { xy[i * 2] = x; xy[i * 2 + 1] = y; });
    return { xy, n: pts.length, color: '#2c4f86' };
  };
  const cut = (extra) => {
    const m = new Marble({ width: 600, height: 420, seed: 1 });
    const p = Object.assign(strip(), extra);
    m.polys = [p];
    m._cutFilaments();
    return m.polys.reduce((s, q) => s + q.n, 0);
  };
  const plain = cut({});
  const squeezed = cut({ a0: 1e9, tauMax: 4 });
  assert.ok(plain < strip().n, 'a stretched ribbon is trimmed');
  assert.equal(squeezed, strip().n, 'a squeezed one is kept');
});
