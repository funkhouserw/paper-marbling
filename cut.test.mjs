// The thin-ink cut: ribbons under THINNEST (0.5 mm) of ink go; wider ribbons and thin water inlets stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';

// A strip w mm wide with a fat end, as in tau.test.mjs.
const strip = (w) => {
  const pts = [];
  for (let a = 0; a <= 32; a++) { const t = -Math.PI / 2 + (a / 32) * Math.PI; pts.push([60 + 20 * Math.cos(t), 20 * Math.sin(t)]); }
  for (let i = 60; i >= 0; i--) pts.push([-60 + i * 2, w / 2]);
  for (let i = 0; i <= 60; i++) pts.push([-60 + i * 2, -w / 2]);
  const xy = new Float64Array(pts.length * 4);
  pts.forEach(([x, y], i) => { xy[i * 2] = x; xy[i * 2 + 1] = y; });
  return { xy, n: pts.length, color: '#2c4f86' };
};
const cut = (poly) => {
  const m = new Marble({ width: 600, height: 420, seed: 1 });
  m.polys = [poly];
  m._cutFilaments();
  return m.polys.reduce((s, q) => s + q.n, 0);
};

test('a squeezed ribbon thick enough (width x tau over half a millimetre) is kept', () => {
  // 0.3 mm wide but squeezed to tau 2: width x tau is 0.6 mm, so it's kept. (The old test used its
  // area over its length, half its width, so it kept only ribbons wider than 1/tau mm.)
  const p = strip(0.3);
  const area = (q) => { let a = 0; for (let i = 0, k = q.n - 1; i < q.n; k = i++) a += q.xy[k * 2] * q.xy[i * 2 + 1] - q.xy[i * 2] * q.xy[k * 2 + 1]; return Math.abs(a / 2); };
  p.a0 = 2 * area(p);
  p.tauMax = 4;
  assert.equal(cut(p), strip(0.3).n);
});

test('a ribbon narrower than half a millimetre is cut', () => {
  assert.ok(cut(strip(0.3)) < strip(0.3).n);
});

test('a thin inlet of water cut into ink stays open', () => {
  // A 40 x 40 mm square with a 0.3 mm slot of water from its right side 35 mm in, its outline starting
  // at the bottom-left corner so the slot lies in the middle of the list.
  const g = 0.15, pts = [];
  for (let i = 0; i < 20; i++) pts.push([i * 2, -20]);
  for (let i = 0; i < 10; i++) pts.push([40, -20 + i * ((20 - g) / 10)]);
  for (let i = 0; i <= 35; i++) pts.push([40 - i, -g]);
  for (let i = 0; i <= 35; i++) pts.push([5 + i, g]);
  for (let i = 1; i <= 10; i++) pts.push([40, g + i * ((20 - g) / 10)]);
  for (let i = 1; i < 20; i++) pts.push([40 - i * 2, 20]);
  for (let i = 0; i < 20; i++) pts.push([0, 20 - i * 2]);
  const xy = new Float64Array(pts.length * 4);
  pts.forEach(([x, y], i) => { xy[i * 2] = x; xy[i * 2 + 1] = y; });
  assert.equal(cut({ xy, n: pts.length, color: '#2c4f86' }), pts.length, 'the slot of water is not pinched shut');
});
