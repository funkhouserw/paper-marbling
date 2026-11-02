import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinePlan } from './dst.js';

// The transforms Wake used before, written out as sums, which the plans must match.
const direct = (n) => ({
  forward: (x) => Float64Array.from({ length: n }, (_, k) => x.reduce((s, v, j) => s + v * Math.sin((Math.PI * (k + 1) * (j + 0.5)) / n), 0)),
  inverse: (X) => Float64Array.from({ length: n }, (_, j) => X.reduce((s, v, k) => s + v * Math.sin((Math.PI * (k + 1) * (j + 0.5)) / n) * (k === n - 1 ? 1 : 2), 0) / n),
});
const randoms = (n, seed) => Float64Array.from({ length: n }, (_, i) => Math.sin(seed * 7919 + i * 104729) * 3);

for (const n of [1, 2, 3, 4, 7, 16, 100, 143, 97]) {
  test(`sine plan of length ${n} matches the direct sums both ways, and they undo each other`, () => {
    const plan = sinePlan(n);
    const ref = direct(n);
    const x = randoms(n, 1);
    const X = new Float64Array(n);
    plan.forward(x, 0, 1, X, 0, 1);
    const want = ref.forward(x);
    for (let k = 0; k < n; k++) assert.ok(Math.abs(X[k] - want[k]) < 1e-9 * (1 + Math.abs(want[k])), `forward ${k}: ${X[k]} vs ${want[k]}`);
    const back = new Float64Array(n);
    plan.inverse(X, 0, 1, back, 0, 1);
    const wantBack = ref.inverse(X);
    for (let j = 0; j < n; j++) assert.ok(Math.abs(back[j] - wantBack[j]) < 1e-9 * (1 + Math.abs(wantBack[j])), `inverse ${j}: ${back[j]} vs ${wantBack[j]}`);
    for (let j = 0; j < n; j++) assert.ok(Math.abs(back[j] - x[j]) < 1e-9, `round trip ${j}: ${back[j]} vs ${x[j]}`);
  });
}

test('strided access reads and writes a column of a wider array', () => {
  const n = 5, stride = 3;
  const plan = sinePlan(n);
  const src = new Float64Array(n * stride).fill(99);
  const x = randoms(n, 2);
  for (let j = 0; j < n; j++) src[1 + j * stride] = x[j];
  const dst = new Float64Array(n * stride).fill(-1);
  plan.forward(src, 1, stride, dst, 2, stride);
  const want = direct(n).forward(x);
  for (let k = 0; k < n; k++) assert.ok(Math.abs(dst[2 + k * stride] - want[k]) < 1e-9);
  for (let i = 0; i < dst.length; i++) if (i % stride !== 2) assert.equal(dst[i], -1);
});
