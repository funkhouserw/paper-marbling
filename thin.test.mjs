import test from 'node:test';
import assert from 'node:assert/strict';
import { thin, underpaintWidth } from './thin.js';

const circle = (r, n = 48) => {
  const xy = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    xy[i * 2] = 100 + r * Math.cos(((i + 0.3) / n) * 2 * Math.PI);
    xy[i * 2 + 1] = 40 + r * Math.sin(((i + 0.3) / n) * 2 * Math.PI);
  }
  return xy;
};
const area = (xy) => {
  let sum = 0;
  const n = xy.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
  }
  return Math.abs(sum) / 2;
};

test('small dots stay round when thinned, at any size below the tolerance', () => {
  for (const r of [0.1, 0.25, 0.5, 1, 1.5, 1.9]) {
    const out = thin(circle(r), 0, 48, 0.5);
    assert.ok(out.length / 2 >= 12, `radius ${r} kept ${out.length / 2} points`);
    assert.ok(area(out) > 0.95 * Math.PI * r * r, `radius ${r} lost area`);
  }
});

test('a large circle still thins, and no dropped point strays past the tolerance', () => {
  const xy = circle(50, 2000);
  const out = thin(xy, 0, 2000, 0.5);
  assert.ok(out.length / 2 < 60, `kept ${out.length / 2}`);
  const m = out.length / 2;
  for (let i = 0; i < 2000; i++) {
    let best = Infinity;
    for (let k = 0; k < m; k++) {
      const ax = out[k * 2], ay = out[k * 2 + 1];
      const dx = out[((k + 1) % m) * 2] - ax, dy = out[((k + 1) % m) * 2 + 1] - ay;
      const u = Math.max(0, Math.min(1, ((xy[i * 2] - ax) * dx + (xy[i * 2 + 1] - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(xy[i * 2] - ax - dx * u, xy[i * 2 + 1] - ay - dy * u));
    }
    assert.ok(best <= 0.5 + 1e-9, `point ${i} is ${best} away`);
  }
});

test('underpaint thins with a hair of ink, but not on round shapes or big raked films', () => {
  const ribbon = (length, wide) => Float64Array.from([0, 0, length, 0, length, wide, 0, wide]);
  assert.ok(Math.abs(underpaintWidth(ribbon(200, 0.25), 0, 4, 7) - 0.25) < 0.01, 'a dragged dot');
  assert.equal(underpaintWidth(ribbon(2000, 2), 0, 4, 7), 7, 'a raked film');
  for (const r of [0.2, 2, 50]) assert.ok(Math.abs(underpaintWidth(circle(r), 0, 48, 7) - 7) < 0.01);
});
