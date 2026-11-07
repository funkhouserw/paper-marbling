// The compression limit (Film, Wake): a colour that later drops land in is squeezed only so far.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Film } from './film.js';

test('drops landing in a colour leave it a rim instead of squeezing it away (Hard edges)', () => {
  const m = new Film({ width: 200, height: 140, seed: 3 });
  m.walls({ on: true, at: 0 });
  for (let k = 0; k < 6; k++) m.drop({ x: (k % 3 - 1) * 60, y: (k < 3 ? -1 : 1) * 35, quantity: 0.5, color: '#3b2b24', at: 0 });
  for (let t = 0; t < 3000 && m.busy; t++) m.step();
  const brown = m.polys.slice();
  const before = brown.reduce((a, p) => a + m._inkArea(p), 0);
  for (let k = 0; k < 18; k++) m.drop({ x: (m.random() - 0.5) * 180, y: (m.random() - 0.5) * 120, quantity: 0.25, color: '#3fa7d6' });
  for (let t = 0; t < 3000 && m.busy; t++) m.step();
  const after = brown.filter((p) => m.polys.includes(p)).reduce((a, p) => a + m._inkArea(p), 0);
  // Squeezed, but at most to a few times thinner: about a fifth of its area is left.
  assert.ok(after > 0.12 * before, `brown keeps ${Math.round(after)} of ${Math.round(before)} mm²`);
  assert.ok(after < 0.8 * before, 'and it was squeezed');
});

test("a ring's ink area is its outline less the drops inside it", () => {
  const m = new Film({ width: 200, height: 140, seed: 3 });
  const square = (h, color) => ({ xy: Float64Array.from([-h, -h, h, -h, h, h, -h, h]), n: 4, color });
  const outer = square(20, '#111111'), inner = square(10, '#222222'), innermost = square(5, '#333333');
  m.polys.push(outer, inner, innermost);
  assert.equal(m._inkArea(outer), 1600 - 400);
  assert.equal(m._inkArea(inner), 400 - 100);
});
