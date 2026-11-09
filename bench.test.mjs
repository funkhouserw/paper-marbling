// The device benchmark (bench.js, #54): it steps a fixed Classic scene for about the time it's given,
// reports a step time and a real-time factor, and leaves draw out where there is no OffscreenCanvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmark } from './bench.js';

test('the benchmark steps a fixed scene for about its budget and reports what it measured', () => {
  const r = benchmark({ budgetMs: 300 });
  assert.ok(r.steps > 0, 'it stepped');
  assert.ok(r.points > 1000, `ink landed (${r.points} points)`);
  assert.ok(r.stepMs > 0 && Number.isFinite(r.realTime), JSON.stringify(r));
  assert.ok(r.seconds < 2, `it kept to its budget (${r.seconds} s)`);
  assert.equal(r.draw, null, 'no OffscreenCanvas in node, so no draw time');
});

test('the density cap follows the measured draw, not the device (#54 b)', async () => {
  const { densityCapFor, DRAW_BUDGET_MS } = await import('./bench.js');
  assert.equal(densityCapFor({ ms: DRAW_BUDGET_MS }, 3), null, 'a draw within budget keeps full density');
  assert.equal(densityCapFor({ ms: 100 }, 1), null, 'a 1× screen has nothing to cap');
  assert.equal(densityCapFor(null, 3), null, 'no measurement, no cap');
  const cap = densityCapFor({ ms: 48 }, 3); // four times over budget: half the density
  assert.equal(cap, 1.5);
  assert.equal(densityCapFor({ ms: 10000 }, 3), 1, 'never below one canvas pixel per CSS pixel');
});
