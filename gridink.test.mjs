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

test('drops stacked on one spot stay round, and keep all their ink', () => {
  const colors = ['#d9485f', '#f2a65a', '#3d5a80', '#7fb7be'];
  const m = new GridInk({ width: 300, height: 210, seed: 1, viscosity: 200, gridCell: 2 });
  colors.forEach((color, k) => m.drop({ x: 0, y: 0, quantity: 0.3, color, dispersion: 0.8, at: k * 6 }));
  run(m);
  const { data, width, height } = m.toRGBA();
  const mm2 = (300 / width) ** 2;
  const cx = width / 2 - 0.5;
  const cy = height / 2 - 0.5;
  const along = (dx, dy) => {
    let r = 0;
    for (;;) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= width || y >= height || data[(y * width + x) * 4 + 3] < 128) return r;
      r += 0.25;
    }
  };
  const S = Math.SQRT1_2;
  const axis = (along(1, 0) + along(-1, 0) + along(0, 1) + along(0, -1)) / 4;
  const diagonal = (along(S, S) + along(-S, S) + along(S, -S) + along(-S, -S)) / 4;
  assert.ok(axis / diagonal > 0.98 && axis / diagonal < 1.02, `axis / diagonal is ${axis / diagonal}`);
  // Every ink keeps a share of the tank near a drop's own, including the first, now the thinnest ring.
  const share = colors.map((c) => {
    const v = parseInt(c.slice(1), 16);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 128 && Math.abs((v >> 16) - data[i]) + Math.abs(((v >> 8) & 255) - data[i + 1]) + Math.abs((v & 255) - data[i + 2]) < 40) n++;
    }
    return n * mm2;
  });
  for (const a of share) assert.ok(a > 2400 && a < 3400, `inks cover ${share.map(Math.round)}`);
});

test('a drop still leaves a separate film alone', () => {
  const m = new GridInk({ width: 300, height: 210, seed: 1, viscosity: 200, gridCell: 2 });
  m.drop({ x: -40, y: 0, quantity: 0.3, color: '#d9485f', dispersion: Infinity });
  run(m);
  m.drop({ x: 90, y: 0, quantity: 0.05, color: '#3d5a80', dispersion: 0.8 });
  const before = Float32Array.from(m._g.ink[3]);
  const { ix } = m._g;
  const left = (a) => { let n = 0; for (let i = 0; i < a.length; i++) if (i % ix < ix * 0.55 && a[i] > 0.5) n++; return n; };
  const was = left(before);
  run(m);
  m._refreshInk();
  assert.ok(Math.abs(left(m._g.ink[3]) - was) <= was * 0.002, `${left(m._g.ink[3])} against ${was}`);
});
