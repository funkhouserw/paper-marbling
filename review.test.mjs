// Two bugs from the 2026-11-08 law review (research/2026-11-08-law-review.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filmPressure, filmPressureSlope } from './engine.js';
import { mergedPoints } from './seam.js';

test('the film law is monotone and zero at rest for every cap, even just above 1', () => {
  for (const cap of [1.01, 1.02, 1.5, 2, 3.5, 25]) {
    assert.equal(filmPressure(1, cap), 0, `cap ${cap}`);
    let last = 0;
    for (let t = 1; t <= cap * 1.5; t += (cap - 1) / 50 + 0.001) {
      const p = filmPressure(t, cap);
      assert.ok(p >= last - 1e-9, `cap ${cap}: not monotone at ${t}`);
      assert.ok(filmPressureSlope(t, cap) > 0);
      last = p;
    }
  }
});

test('points near a long edge of a neighbour count as touching it, not just near its middle', () => {
  // A square of 4 points (edges 40 mm long) and a dense one 0.5 mm to its right.
  const a = { xy: Float64Array.from([-40, -20, 0, -20, 0, 20, -40, 20]), n: 4, color: '#111111' };
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push(0.5, -20 + i);
  for (let i = 0; i <= 40; i++) pts.push(40, 20 - i);
  const b = { xy: Float64Array.from(pts), n: pts.length / 2, color: '#222222' };
  const [, marks] = mergedPoints([a, b], 1.2);
  let touching = 0;
  for (let i = 0; i <= 40; i++) if (marks[i] === 3) touching++;
  assert.ok(touching >= 39, `${touching} of 41 points along the shared side touch`);
});
