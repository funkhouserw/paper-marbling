// Thin film: a drop landing on the seam between two films pushes them apart instead of lying over both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThinFilm } from './thinfilm.js';

const inside = ({ xy, n }, x, y) => {
  let c = false;
  for (let i = 0, k = n - 1; i < n; k = i++) {
    const yi = xy[i * 2 + 1], yk = xy[k * 2 + 1];
    if ((yi > y) !== (yk > y) && x < ((xy[k * 2] - xy[i * 2]) * (y - yi)) / (yk - yi) + xy[i * 2]) c = !c;
  }
  return c;
};

test('a drop landing between two films makes room: it lies over neither', () => {
  const m = new ThinFilm({ width: 600, height: 420, seed: 1 });
  m.drop({ x: -60, quantity: 0.8, color: '#1f2f5c' });
  m.drop({ x: 60, quantity: 0.8, color: '#4a6f9a' });
  m.runUntilIdle();
  m.drop({ x: 0, quantity: 0.1, color: '#c9a227' });
  m.runUntilIdle();
  const gold = m.polys.find((p) => p.color === '#c9a227');
  const others = m.polys.filter((p) => p !== gold);
  let over = 0, total = 0;
  for (let i = 0; i < gold.n; i += 3) {
    // Points just inside the gold outline, towards its middle.
    const x = gold.xy[i * 2] * 0.9, y = gold.xy[i * 2 + 1] * 0.9;
    total++;
    if (others.some((p) => inside(p, x, y))) over++;
  }
  assert.ok(over <= total * 0.05, `${over} of ${total} points of the new drop lie over older ink`);
});
