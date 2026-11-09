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
