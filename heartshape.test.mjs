// The heart outline Heart drop and Heart strike share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heartOutline, HEART_B } from './heartshape.js';

const pts = ({ xy, n }) => Array.from({ length: n }, (_, i) => [xy[i * 2], xy[i * 2 + 1]]);
const signedArea = (p) => p.reduce((a, [x0, y0], i) => { const [x1, y1] = p[(i + 1) % p.length]; return a + x0 * y1 - x1 * y0; }, 0) / 2;
const box = (p) => p.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

test('a heart has the area asked for, wound counter-clockwise like the engine\'s ink', () => {
  const h = heartOutline({ area: 5000 });
  const a = signedArea(pts(h));
  assert.ok(a > 0, 'counter-clockwise with y up');
  assert.ok(Math.abs(a - 5000) / 5000 < 0.01, `area ${a}`);
  assert.ok(Math.abs(h.area - 5000) / 5000 < 0.01);
  assert.ok(h.xy.length >= h.n * 4, 'room for the engine to add points');
});

test('it is about 1.6 times as tall as it is wide, point down, centred where asked', () => {
  const p = pts(heartOutline({ x: 30, y: -20, width: 100 }));
  const b = box(p);
  assert.ok(Math.abs((b.x1 - b.x0) - 100) < 1);
  assert.ok(Math.abs((b.y1 - b.y0) / (b.x1 - b.x0) - HEART_B.height) < 0.03);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 30) < 0.5);
  assert.ok(Math.abs((b.y0 + b.y1) / 2 - -20) < 0.5);
  // The lowest point is the fine point, on the centre line.
  const low = p.reduce((m, q) => (q[1] < m[1] ? q : m));
  assert.ok(Math.abs(low[0] - 30) < 0.5);
});

test('it is symmetric, and turning it moves the point', () => {
  const p = pts(heartOutline({ width: 80 }));
  for (const [x, y] of p) assert.ok(p.some(([u, v]) => Math.abs(u + x) < 1.5 && Math.abs(v - y) < 1.5), `no mirror for ${x},${y}`);
  const up = pts(heartOutline({ width: 80, angle: 180 }));
  const high = up.reduce((m, q) => (q[1] > m[1] ? q : m));
  assert.ok(high[1] > 60, 'turned half round, the point is at the top');
});

test('variation changes the proportions, repeatably for the same random numbers', () => {
  const seeded = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const a = heartOutline({ width: 100, variation: 1, random: seeded(7) });
  const b = heartOutline({ width: 100, variation: 1, random: seeded(7) });
  const c = heartOutline({ width: 100, variation: 1, random: seeded(8) });
  assert.deepEqual(Array.from(a.xy), Array.from(b.xy));
  assert.notDeepEqual(Array.from(a.xy), Array.from(c.xy));
  assert.ok(signedArea(pts(c)) > 0);
});
