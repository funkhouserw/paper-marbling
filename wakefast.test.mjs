import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wake } from './wake.js';
import { WakeFast } from './wakefast.js';
import { thin } from './thin.js';

const toOutline = (x, y, pts) => {
  let best = Infinity;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const ax = pts[j * 2], ay = pts[j * 2 + 1];
    const dx = pts[i * 2] - ax, dy = pts[i * 2 + 1] - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + dx * u - x, ay + dy * u - y));
  }
  return best;
};

test('thinning never strays further than asked, and drops most of a smooth outline', () => {
  const n = 5000;
  const xy = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const r = 100 * (1 + 0.3 * Math.sin(5 * a));
    xy[i * 2] = r * Math.cos(a);
    xy[i * 2 + 1] = r * Math.sin(a);
  }
  const out = thin(xy, 0, n, 0.25);
  assert.ok(out.length / 2 < n / 10, `kept ${out.length / 2}`);
  for (let i = 0; i < n; i += 7) assert.ok(toOutline(xy[i * 2], xy[i * 2 + 1], out) <= 0.25 + 1e-9);
});

test('thinning reads the right outline from a shared array', () => {
  const xy = Float64Array.from([9, 9, 9, 9, 0, 0, 1, 0, 1, 1]);
  assert.deepEqual([...thin(xy, 2, 3, 0.1)], [0, 0, 1, 0, 1, 1]);
});

test('Wake (fast) simulates exactly as Wake does', () => {
  const run = (Engine) => {
    const m = new Engine({ width: 500, height: 350, seed: 9, viscosity: 20 });
    for (let i = 0; i < 6; i++) m.drop({ x: -150 + i * 60, y: (i % 2) * 60 - 30, quantity: 2, color: '#a03040' });
    m.settle();
    m.fullRake({ angle: 0, teeth: 3, speed: 150 });
    m.settle();
    for (let s = 0; s < 400 && m.busy; s++) m.step();
    return m.toSVG();
  };
  assert.equal(run(WakeFast), run(Wake));
});

test('skipping far points changes nothing, with wide tines, weaves and long stretched outlines', () => {
  const run = (Engine) => {
    const m = new Engine({ width: 1000, height: 700, seed: 4, viscosity: 40 });
    m.stripes({ count: 8, colors: ['#a03040', '#3040a0'] });
    for (let i = 0; i < 12; i++) m.drop({ x: -400 + i * 70, y: (i % 3) * 120 - 120, quantity: 2, color: '#30a040' });
    m.settle();
    m.fullRake({ angle: 0, teeth: 4, speed: 120, D: 15, width: 12, waveAmp: 60, waveLength: 200, waveShape: 'wave' });
    m.settle();
    m.rake({ from: [-300, -200], to: [300, 200], teeth: 1, speed: 200, D: 10 });
    m.settle();
    for (let s = 0; s < 160 && m.busy; s++) m.step();
    return m.toSVG();
  };
  assert.equal(run(WakeFast), run(Wake));
});

test('skipping stays exact in a thin bath, where the flow moves ink between tine passes', () => {
  const run = (Engine) => {
    const m = new Engine({ width: 800, height: 500, seed: 6, viscosity: 8 });
    m.setFlow({ friction: 0.05, coast: 60, push: 3 });
    m.stripes({ count: 10, colors: ['#a03040', '#3040a0', '#30a040'] });
    m.settle();
    m.fullRake({ angle: 0, teeth: 3, speed: 60 });
    m.fullRake({ angle: 90, teeth: 3, speed: 60, at: 2 });
    m.air({ scale: 60, speed: 20, duration: 1, at: 1 });
    for (let s = 0; s < 200 && m.busy; s++) m.step();
    return m.toSVG();
  };
  assert.equal(run(WakeFast), run(Wake));
});

test('saved Wake (fast) tanks carry no extra data', () => {
  const m = new WakeFast({ width: 400, height: 300, seed: 1, viscosity: 40 });
  m.stripes({ count: 4, colors: ['#a03040'] });
  m.settle();
  m.rake({ from: [-100, 0], to: [100, 0], teeth: 1, speed: 100 });
  for (let s = 0; s < 40; s++) m.step();
  assert.deepEqual(Object.keys(m.saveState().polys[0]).sort(), Object.keys(new WakeFast({}).constructor === WakeFast ? m.polys[0] : {}).sort());
  assert.ok(!('boxes' in m.polys[0]));
});
