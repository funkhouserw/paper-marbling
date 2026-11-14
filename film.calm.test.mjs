import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Film } from './film.js';
import { Wake } from './wake.js';
import { Marble } from './engine.js';

const TANK = { width: 1000, height: 700 };
const flicks = (m) => {
  const colors = ['#b5793f', '#1f2f5c', '#8a2b2b', '#2f6b4f'];
  colors.forEach((color, i) => m.broom({ n: 90, size: 0.05, color, at: i * 0.5 }));
};
// The most any outline point moved in one step.
// (An outline that gained or lost points was re-sampled, not moved, so it is skipped.)
const motionSince = (before) => {
  let most = 0;
  for (const [p, n, xy] of before) {
    if (p.n !== n) continue;
    for (let i = 0; i < n * 2; i++) most = Math.max(most, Math.abs(p.xy[i] - xy[i]));
  }
  return most;
};
const take = (m) => m.polys.map((p) => [p, p.n, Float64Array.from(p.xy.subarray(0, p.n * 2))]);
const stepMotion = (m) => {
  const before = take(m);
  m.step();
  return motionSince(before);
};
const crowd = (Engine = Film) => {
  const m = new Engine(TANK);
  flicks(m);
  for (let i = 0; i < 100; i++) m.step();
  return m;
};

test('Let it settle stops a crowded Film tank without moving or removing any ink', () => {
  const m = crowd();
  assert.ok(m.active.length > 0, 'the tank should still be spreading');
  const motionBefore = stepMotion(m);
  const polysBefore = m.polys.length;
  const colours = m.polys.map((p) => p.color);
  const snapshot = take(m);
  m.calm({ at: m.time });
  // The call is made on the next step and moves nothing itself.
  m.step();
  const jump = motionSince(snapshot);
  const motion = [];
  for (let i = 0; i < 6; i++) motion.push(stepMotion(m));
  console.log(`motion per step before ${motionBefore.toFixed(4)} mm, jump at the call ${jump.toFixed(4)} mm, after ${motion.map((v) => v.toFixed(5)).join(' ')}`);
  assert.ok(motionBefore > 0.01, `it should have been moving: ${motionBefore}`);
  assert.ok(jump < motionBefore * 1.5, `ink jumped ${jump} mm at the call`);
  assert.ok(Math.max(...motion.slice(2)) < 0.001, `still moving: ${motion}`);
  assert.equal(m.polys.length, polysBefore);
  assert.deepEqual(m.polys.map((p) => p.color), colours);
  let n = 0;
  while (m.busy && n++ < 500) m.step();
  assert.equal(m.busy, false, 'the tank should come to rest');
});

test('Wake calms the same way, and Classic ignores it', () => {
  const w = crowd(Wake);
  w.calm({ at: w.time });
  w.step();
  const after = [];
  for (let i = 0; i < 6; i++) after.push(stepMotion(w));
  assert.ok(Math.max(...after.slice(2)) < 0.01, `Wake still moving: ${after}`);
  assert.equal(new Marble(TANK).calmSupported, false);
  const c = new Marble(TANK);
  c.drop({ x: 0, y: 0, quantity: 1 });
  c.calm();
  for (let i = 0; i < 5; i++) c.step();
  assert.ok(c.polys.length >= 1);
});

test('a script with calm() replays identically', () => {
  const run = (m) => {
    flicks(m);
    m.wait(3);
    m.calm();
    m.drop({ x: 0, y: 0, quantity: 1, at: 3.5 });
    for (let i = 0; i < 200; i++) m.step();
    return m;
  };
  const a = run(new Film(TANK));
  const b = new Film(TANK).replay(a.log);
  for (let i = 0; i < 200; i++) b.step();
  assert.ok(a.log.some((e) => e.fn === 'calm'));
  assert.ok(a.toScript().includes('calm('));
  assert.equal(a.polys.length, b.polys.length);
  a.polys.forEach((p, k) => {
    assert.equal(b.polys[k].n, p.n);
    assert.deepEqual(Array.from(b.polys[k].xy.subarray(0, p.n * 2)), Array.from(p.xy.subarray(0, p.n * 2)));
  });
});
