// The pressure law in the transport layout (Cells): psi = R0² + κ (Π(A0/|C|) − background).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partialTransport, polygonArea } from './stone.js';
import { filmPressure, filmPressureSlope } from './engine.js';

const box = (h) => [-h, -h, h, -h, h, h, -h, h];
const law = (A0, extra = {}) => ({ A0, tauMax: A0.map(() => 3.5), kappa: 400, background: 0, Pi: filmPressure, dPi: filmPressureSlope, ...extra });

test('a lone cell is exactly its rest disc', () => {
  const r = partialTransport([[0, 0]], [1000], box(500), { law: law([1000]), iterations: 30 });
  assert.ok(Math.abs(polygonArea(r.cells[0]) - 1000) < 15, `${polygonArea(r.cells[0])}`);
});

test('two cells pressed together share a straight wall at equal squeeze', () => {
  const r = partialTransport([[-10, 0], [10, 0]], [2000, 2000], box(500), { law: law([2000, 2000]), iterations: 40 });
  const [a, b] = r.cells.map(polygonArea);
  assert.ok(Math.abs(a - b) < 0.02 * a, `${a} vs ${b}`);
  assert.ok(a < 2000 && a > 2000 / 3.5, `squeezed but not past the cap: ${a}`);
});

test('a cell boxed into less room than its ink fills the box, squeezed but within its cap', () => {
  const r = partialTransport([[0, 0]], [10000], box(40), { law: law([10000]), iterations: 40 });
  const A = polygonArea(r.cells[0]);
  assert.ok(Math.abs(A - 6400) < 1 && 10000 / A < 3.5, `area ${A}, tau ${10000 / A}`);
});
