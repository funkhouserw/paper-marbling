import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridInk } from './gridink.js';

const TANK = { width: 400, height: 280, seed: 3, gridCell: 2 };
const run = (m, limit = 2000) => { let s = 0; while (m.busy && s < limit) { m.step(); s++; } assert.ok(s < limit, 'still running'); return m; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
// How much of a two-colour picture is neither colour: the blur between them.
const blurred = (m) => { const { data } = m.toRGBA(); let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i] > 25 && data[i] < 230) n++; return n; };

const stirred = (method) => {
  const m = new GridInk({ ...TANK, method, viscosity: 2 });
  m.setFlow({ friction: 0.05, coast: 6 });
  m.stripes({ count: 8, colors: ['#ff0000', '#000000'], variation: 0, slivers: 0 });
  m.settle();
  m.air({ scale: 60, speed: 30, duration: 2, seed: 4 });
  m.settle();
  return run(m);
};

test('a projected flow compresses nothing', () => {
  const m = new GridInk(TANK);
  const { nx, ny, hx, hy, u, v } = m._g;
  for (let i = 0; i < nx * ny; i++) { u[i] = Math.sin(i * 0.37) * 50; v[i] = Math.cos(i * 0.11) * 50; }
  m._project(u, v);
  // Spectrally free of divergence, so a second pass changes nothing.
  const a = Float32Array.from(u);
  m._project(u, v);
  let worst = 0;
  for (let i = 0; i < nx * ny; i++) worst = Math.max(worst, Math.abs(u[i] - a[i]));
  assert.ok(worst < 1e-2, `changed by ${worst}`);
  assert.ok(Math.abs(sum(u)) / (nx * ny) < 1e-3);
  void hx; void hy;
});

test('a drop lands round, at the size it should be, and on a seam as well as mid-tile', () => {
  for (const [x, y] of [[0, 0], [199.5, 139.5]]) {
    const m = new GridInk(TANK);
    m.drop({ x, y, quantity: 1, color: '#000000' });
    run(m);
    const { data, width, height } = m.toRGBA();
    let area = 0;
    for (let i = 3; i < data.length; i += 4) area += data[i] / 255;
    area *= m._g.ihx * m._g.ihy;
    assert.ok(Math.abs(area - Math.PI * m.sources[0].maxArea) / area < 0.08, `area ${area} vs ${Math.PI * m.sources[0].maxArea}, grown ${m.sources[0].grown}`);
    void width; void height;
  }
});

test('with BiMocq2, stirred ink keeps its edges better than the plain solver, and its area', () => {
  const sharp = stirred('bimocq');
  const plain = stirred('semilag');
  const a = blurred(sharp), b = blurred(plain);
  assert.ok(a < b * 0.75, `blurred cells: bimocq ${a}, plain ${b}`);
  const area = (m) => sum(m._g.ink[0]);
  assert.ok(Math.abs(area(sharp) - area(plain)) / area(plain) < 0.05, `${area(sharp)} vs ${area(plain)}`);
});

test('the flow dies away and the tank settles', () => {
  const m = new GridInk({ ...TANK, viscosity: 10 });
  m.setFlow({ coast: 3 });
  m.rake({ from: [-100, 0], to: [100, 0], teeth: 1, speed: 100 });
  run(m);
  assert.equal(m.flowing, false);
});

test('saving and loading gives the same picture', () => {
  const m = new GridInk({ ...TANK, viscosity: 10 });
  m.drop({ x: 0, y: 0, quantity: 3, color: '#000000' });
  m.settle();
  m.rake({ from: [-100, 0], to: [100, 0], teeth: 1, speed: 100 });
  for (let i = 0; i < 60; i++) m.step();
  const saved = m.saveState();
  const go = () => { for (let i = 0; i < 20; i++) m.step(); return Array.from(m.toRGBA().data); };
  const first = go();
  m.loadState(saved);
  assert.deepEqual(go(), first);
});

test('stripes leave no water, and repeat across the seams', () => {
  const m = new GridInk(TANK);
  m.stripes({ count: 12, colors: ['#111111', '#222222', '#333333'] });
  m.step();
  const { data } = m.toRGBA();
  let thin = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) thin++;
  assert.equal(thin, 0);
});

const bounds = (m, color) => {
  const { data, width, height } = m.toRGBA();
  let lo = Infinity, hi = -Infinity, n = 0;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] > 128 && data[i * 4] === color) { const x = i % width; lo = Math.min(lo, x); hi = Math.max(hi, x); n++; }
  }
  return [lo, hi, n];
};

test('a drop leaves ink it has not touched exactly where it is, and pushes ink it has', () => {
  const place = (m, gap) => {
    m.drop({ x: -gap, y: 0, quantity: 0.2, color: '#500000' });
    m.drop({ x: gap, y: 0, quantity: 0.2, color: '#a00000' });
  };
  const m = new GridInk(TANK);
  place(m, 100);
  run(m);
  const before = bounds(m, 0x50);
  m.drop({ x: 0, y: 0, quantity: 0.2, color: '#f00000' });
  run(m);
  assert.deepEqual(bounds(m, 0x50), before);

  const close = new GridInk(TANK);
  place(close, 45);
  run(close);
  const near = bounds(close, 0x50);
  close.drop({ x: 0, y: 0, quantity: 0.6, color: '#f00000' });
  run(close);
  assert.ok(bounds(close, 0x50)[0] < near[0], `${bounds(close, 0x50)} from ${near}`);
});

// With repeating off, the sides are solid.
const walled = (extra = {}) => { const m = new GridInk({ ...TANK, viscosity: 50, ...extra }); m.tile({ on: false, at: 0 }); m.settle(); run(m); return m; };
const inkIn = (m, x0, x1) => { const { data, width, height } = m.toRGBA(); let n = 0; for (let j = 0; j < height; j++) for (let i = Math.floor(x0 * width); i < x1 * width; i++) if (data[(j * width + i) * 4 + 3] > 25) n++; return n; };

test('with solid sides, projecting compresses nothing', () => {
  const m = walled();
  const { nx, ny, u, v } = m._g;
  for (let i = 0; i < nx * ny; i++) { u[i] = Math.sin(i * 0.37) * 50; v[i] = Math.cos(i * 0.11) * 50; }
  m._project(u, v);
  const a = Float32Array.from(u);
  m._project(u, v);
  let worst = 0;
  for (let i = 0; i < nx * ny; i++) worst = Math.max(worst, Math.abs(u[i] - a[i]));
  assert.ok(worst < 1e-2, `changed by ${worst}`);
});

test('a drop on the right side shows only there with solid sides, and on both sides when repeating', () => {
  const place = (m) => { m.drop({ x: 195, y: 0, quantity: 0.2, dispersion: Infinity, color: '#ff0000' }); m.settle(); return run(m); };
  const solid = place(walled());
  const repeating = place(new GridInk({ ...TANK, viscosity: 50 }));
  assert.ok(inkIn(solid, 0.9, 1) > 0);
  assert.equal(inkIn(solid, 0, 0.1), 0);
  assert.ok(inkIn(repeating, 0, 0.1) > 0);
});

test('a rake off the right side brings nothing round to the left', () => {
  const m2 = walled();
  m2.drop({ x: 150, y: 0, quantity: 0.2, dispersion: Infinity, color: '#ff0000' });
  m2.settle(); run(m2);
  m2.rake({ from: [100, 0], to: [230, 0], teeth: 1, speed: 100, D: 10 });
  m2.settle(); run(m2);
  assert.equal(inkIn(m2, 0, 0.1), 0);
});

test('solid sides survive saving and loading, and can be switched on an inked tank', () => {
  const m = walled();
  m.drop({ x: 0, y: 0, quantity: 0.2, dispersion: Infinity, color: '#ff0000' });
  m.settle(); run(m);
  const copy = new GridInk({ ...TANK, viscosity: 50 });
  copy.loadState(m.saveState());
  assert.equal(copy.tileOn, false);
  copy.tile({ on: true });
  copy.settle(); run(copy);
  assert.equal(copy.tileOn, true);
});

test('fillDots goes around ink on the grid', () => {
  const m = new GridInk({ ...TANK, viscosity: 50 });
  m.drop({ x: 0, y: 0, quantity: 3, dispersion: Infinity, color: '#ff0000' });
  m.settle(); run(m);
  const R = Math.sqrt(m.sources[0].maxArea);
  const before = m.log.length;
  m.fillDots({ count: 40, min: 4, max: 20, gap: 1, colors: ['#000000'] });
  const dots = m.log.slice(before).filter((e) => e.fn === 'drop');
  assert.ok(R > 20 && dots.length > 3, `R ${R}, ${dots.length} dots`);
  for (const { args } of dots) assert.ok(Math.hypot(args.x, args.y) > R, `dot at ${args.x},${args.y}`);
});
