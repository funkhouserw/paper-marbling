import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wake } from './wake.js';

const start = (viscosity) => {
  const m = new Wake({ width: 1000, height: 700, viscosity });
  m.walls();
  m.drop({ x: 0, y: 0, quantity: 7, spreading: 1, color: '#112233' });
  m.runUntilIdle();
  return m;
};
const rakeUntilStopped = (m, speed) => {
  m.fullRake({ angle: 0, teeth: 4, speed });
  m.step();
  while (m.active.some((op) => op.kind === 'rake')) m.step();
  const stopped = m.time;
  const before = Float64Array.from(m.polys[0].xy.subarray(0, m.polys[0].n * 2));
  return { stopped, before };
};

test('a thin bath coasts on after the rake stops, and a thick one barely does', () => {
  const thick = start(1000);
  const a = rakeUntilStopped(thick, 400);
  thick.runUntilIdle(60);
  const thin = start(10);
  const b = rakeUntilStopped(thin, 400);
  thin.runUntilIdle(60);
  assert.ok(thick.time - a.stopped < 1, `thick coasted ${thick.time - a.stopped}s`);
  assert.ok(thin.time - b.stopped > 5, `thin coasted ${thin.time - b.stopped}s`);
});

test('settle() finishes and later actions wait for the flow to stop', () => {
  const m = start(10);
  m.fullRake({ angle: 0, teeth: 4, speed: 400 });
  m.settle();
  m.drop({ x: 0, y: 0, quantity: 1, color: '#aa0000' });
  const polysAtStart = m.polys.length;
  let sawFlowWithoutDrop = false;
  let n = 0;
  while (m.busy && n++ < 6000) {
    m.step();
    if (m.flowing && m.polys.length === polysAtStart) sawFlowWithoutDrop = true;
    if (m.flowing) assert.equal(m.polys.length, polysAtStart);
  }
  assert.equal(m.busy, false);
  assert.ok(sawFlowWithoutDrop);
  assert.equal(m.polys.length, polysAtStart + 1);
});

test('at rest nothing moves', () => {
  const m = start(10);
  rakeUntilStopped(m, 400);
  m.runUntilIdle(60);
  const { xy, n } = m.polys[0];
  const before = new Set();
  for (let i = 0; i < n; i++) before.add(`${xy[i * 2]},${xy[i * 2 + 1]}`);
  for (let i = 0; i < 60; i++) m.step();
  // Tidying can drop points that add nothing, but every point left is exactly where it was.
  const after = m.polys[0];
  for (let i = 0; i < after.n; i++) assert.ok(before.has(`${after.xy[i * 2]},${after.xy[i * 2 + 1]}`));
});

test('saved states keep the flow going', () => {
  const m = start(10);
  rakeUntilStopped(m, 400);
  assert.equal(m.flowing, true);
  const copy = new Wake({ width: 1000, height: 700, viscosity: 10 }).loadState(m.saveState());
  assert.equal(copy.flowing, true);
  copy.runUntilIdle(60);
  assert.equal(copy.busy, false);
});

test('ink stays inside the walls', () => {
  const m = start(5);
  rakeUntilStopped(m, 400);
  m.runUntilIdle(60);
  for (const { xy, n } of m.polys) {
    for (let i = 0; i < n; i++) {
      assert.ok(Math.abs(xy[i * 2]) <= 500 && Math.abs(xy[i * 2 + 1]) <= 350);
    }
  }
});
