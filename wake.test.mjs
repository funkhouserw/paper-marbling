import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScript } from './engine.js';
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

for (const [name, use] of [
  ['stir', (m) => m.stir({ x: 0, y: 0, radii: [100, 200], degrees: 90, rate: 90 })],
  ['vortex', (m) => m.vortex({ x: 0, y: 0, duration: 1 })],
  ['jiggle', (m) => m.jiggle({ angle: 45, duration: 1 })],
  ['wriggle', (m) => m.wriggle({ x: 0, y: 0, duration: 1 })],
  ['stylus', (m) => m.stylus({ path: [[-300, 0], [300, 0]], speed: 400 })],
  ['air', (m) => m.air({ scale: 150, speed: 80, duration: 1, seed: 2 })],
]) {
  test(`${name} keeps the bath moving in a thin bath, and hardly at all in a thick one`, () => {
    const coast = (viscosity) => {
      const m = start(viscosity);
      use(m);
      m.step();
      while (m.active.length || m.pending.length) m.step();
      const stopped = m.time;
      m.runUntilIdle(60);
      assert.equal(m.busy, false);
      return m.time - stopped;
    };
    const thick = coast(1000);
    const thin = coast(10);
    assert.ok(thick < 1.5, `thick coasted ${thick}s`);
    assert.ok(thin > 2, `thin coasted ${thin}s`);
  });
}

test('a ribbon of ink too thin to see is cut off, and the rest stays', () => {
  const m = new Wake({ width: 1000, height: 700 });
  // A square with a long thin ribbon sticking out of it.
  const xy = [];
  for (let x = -100; x < 0; x += 2) xy.push(x, -50);
  for (let x = 0; x < 200; x += 2) xy.push(x, -0.1);
  for (let x = 200; x > 0; x -= 2) xy.push(x, 0.1);
  for (let x = 0; x > -100; x -= 2) xy.push(x, 50);
  for (let y = 50; y > -50; y -= 2) xy.push(-100, y);
  m.polys.push({ xy: Float64Array.from(xy), n: xy.length / 2, color: '#112233' });
  const before = m.polys[0].n;
  m._cutFilaments();
  const { xy: left, n } = m.polys[0];
  assert.ok(n < before - 150, `${before} points, then ${n}`);
  let farthest = -Infinity;
  for (let i = 0; i < n; i++) farthest = Math.max(farthest, left[i * 2]);
  assert.ok(farthest < 20, `the ribbon still reaches ${farthest}`);
});

test('a thick shape keeps every point', () => {
  const m = new Wake({ width: 1000, height: 700 });
  const xy = [];
  for (let i = 0; i < 400; i++) xy.push(100 * Math.cos(i * 0.0157), 100 * Math.sin(i * 0.0157));
  m.polys.push({ xy: Float64Array.from(xy), n: 400, color: '#112233' });
  m._cutFilaments();
  assert.equal(m.polys[0].n, 400);
  assert.equal(m.polys.length, 1);
});

test('a script can set the viscosity, and it comes back in the script it writes', () => {
  const m = new Wake({ width: 1000, height: 700 });
  runScript(m, 'viscosity({ value: 10 });');
  assert.equal(m.viscosity, 10);
  assert.ok(m.toScript().includes('viscosity({"value":10});'));
  const again = new Wake({ width: 1000, height: 700 });
  again.replay(m.log);
  assert.equal(again.viscosity, 10);
  runScript(m, 'viscosity({ value: 1 });');
  assert.equal(m.viscosity, 5);
});

test('a script can tune the flow, the flow survives a change of grid, and it comes back in the script', () => {
  const m = start(10);
  runScript(m, 'flow({ cell: 3.5 });');
  assert.equal(m._flowGrid.nx, Math.round(1000 / 3.5));
  assert.ok(m.toScript().includes('flow({"cell":3.5,"friction":0.25,"coast":25,"push":1});'));
  rakeUntilStopped(m, 400);
  assert.equal(m.flowing, true);
  const speedBefore = m.lastFlowSpeed;
  m.setFlow({ cell: 7 });
  assert.equal(m._flowGrid.nx, 143);
  m.step();
  assert.equal(m.flowing, true);
  assert.ok(Math.abs(m.lastFlowSpeed - speedBefore) < speedBefore * 0.3, `${m.lastFlowSpeed} vs ${speedBefore}`);
  const again = new Wake({ width: 1000, height: 700, viscosity: 10 });
  again.replay(m.log);
  assert.equal(again.flowCell, 7);
  const copy = new Wake({ width: 1000, height: 700 }).loadState(m.saveState());
  assert.equal(copy._flowGrid.nx, 143);
  copy.runUntilIdle(60);
  assert.equal(copy.busy, false);
  runScript(m, 'flow({ cell: 0.1 });');
  assert.equal(m.flowCell, 1.5);
});

test('less floor friction coasts longer, and more push moves the bath faster, while the defaults change nothing', () => {
  const coast = (options) => {
    const m = start(10);
    if (options) m.setFlow(options);
    const { stopped } = rakeUntilStopped(m, 400);
    let peak = 0;
    while (m.busy && m.time < 400) { m.step(); peak = Math.max(peak, m.lastFlowSpeed ?? 0); }
    return { coasted: m.time - stopped, peak, points: m.polys[0].n };
  };
  const plain = coast(null);
  const defaults = coast({});
  assert.deepEqual(defaults, plain);
  const slippery = coast({ friction: 0.05, coast: 120 });
  assert.ok(slippery.coasted > plain.coasted * 1.5, `${slippery.coasted} vs ${plain.coasted}`);
  const pushy = coast({ push: 3 });
  assert.ok(pushy.peak > plain.peak * 2, `${pushy.peak} vs ${plain.peak}`);
});
