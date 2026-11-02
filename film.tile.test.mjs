import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Film } from './film.js';
import { Wake } from './wake.js';
import { wrap } from './tile.js';

// Multiples of both grids (Film 5 mm, Wake 7 mm), so a shift by 35 mm lands on the same cells.
const W = 1120, H = 700, TANK = { width: W, height: H, seed: 7 };
const run = (m, limit = 4000) => { let s = 0; while (m.busy && s < limit) { m.step(); s++; } assert.ok(s < limit); return m; };
const area = ({ xy, n }) => {
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) a += xy[j * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[j * 2 + 1];
  return Math.abs(a) / 2;
};
const heldApart = (a, b, sx, sy) => {
  // The largest gap from one scene's outlines to the other's, on the torus.
  let worst = 0;
  for (let p = 0; p < a.polys.length; p++) {
    const P = a.polys[p], Q = b.polys[p];
    for (let i = 0; i < P.n; i += Math.max(1, P.n >> 5)) {
      let best = Infinity;
      const x = P.xy[i * 2] + sx, y = P.xy[i * 2 + 1] + sy;
      for (let j = 0, k = Q.n - 1; j < Q.n; k = j++) {
        const ax = wrap(Q.xy[k * 2] - x, W), ay = wrap(Q.xy[k * 2 + 1] - y, H);
        const dx = Q.xy[j * 2] - Q.xy[k * 2], dy = Q.xy[j * 2 + 1] - Q.xy[k * 2 + 1];
        const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(ax + dx * u, ay + dy * u));
      }
      worst = Math.max(worst, best);
    }
  }
  return worst;
};
const shifted = (Engine, build, sx, sy) => {
  const m = new Engine(TANK);
  m.tile();
  build(m, sx, sy);
  return run(m);
};
const dropsAndRake = (m, sx, sy) => {
  m.drop({ x: sx - 40, y: sy, quantity: 2, color: '#a00' });
  m.drop({ x: sx + 45, y: sy + 20, quantity: 2, color: '#0a0' });
  m.settle();
  m.rake({ from: [sx - 120, sy], to: [sx + 120, sy + 10], speed: 200, D: 10 });
  m.settle();
};

for (const [name, Engine] of [['Film', Film], ['Wake', Wake]]) {
  test(`${name}: the seams can't be found, a scene matches the same scene moved across one`, () => {
    const a = shifted(Engine, dropsAndRake, 0, 0);
    const b = shifted(Engine, dropsAndRake, W / 2, H / 2);
    assert.ok(a.polys.length >= 2);
    const gap = heldApart(a, b, W / 2, H / 2);
    assert.ok(gap < 1.5, `${gap} mm apart`);
  });

  test(`${name}: a drop on a seam stays round and grows as one mid-tile does`, () => {
    const mid = new Engine(TANK); mid.tile(); mid.drop({ x: 0, y: 0, quantity: 3, color: '#a00' }); run(mid);
    const seam = new Engine(TANK); seam.tile(); seam.drop({ x: W / 2 - 1, y: H / 2 - 1, quantity: 3, color: '#a00' }); run(seam);
    assert.ok(Math.abs(area(mid.polys[0]) - area(seam.polys[0])) / area(mid.polys[0]) < 0.02);
  });
}

test('Film: drops facing each other across a seam touch and push, and walls hold them apart', () => {
  const place = (m) => {
    m.drop({ x: -W / 2 + 30, y: 0, quantity: 8, color: '#a00' });
    m.drop({ x: W / 2 - 30, y: 0, quantity: 8, color: '#0a0' });
  };
  const torus = new Film(TANK); torus.tile(); place(torus); run(torus);
  const open = new Film(TANK); place(open); run(open);
  const left = (m) => { const { xy, n } = m.polys[0]; let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, xy[i * 2]); hi = Math.max(hi, xy[i * 2]); } return [lo, hi]; };
  const [lo] = left(torus);
  const [openLo] = left(open);
  // Its neighbour across the seam stops it spreading past the seam the way open water lets it.
  assert.ok(lo > openLo + 1, `${lo} vs ${openLo}`);
});

test('Wake: a flow carries ink across a seam and comes back around', () => {
  const m = new Wake({ ...TANK, viscosity: 10 });
  m.tile();
  m.flow?.({ friction: 0.05, coast: 30, push: 3 });
  m.drop({ x: W / 2 - 60, y: 0, quantity: 1, color: '#a00' });
  m.settle();
  m.rake({ from: [W / 2 - 200, 0], to: [W / 2 - 80, 0], speed: 300, D: 10 });
  run(m);
  const { xy, n } = m.polys[0];
  let hi = -Infinity;
  for (let i = 0; i < n; i++) hi = Math.max(hi, xy[i * 2]);
  assert.ok(hi > W / 2, `reached ${hi}`);
  assert.ok(m.tileShifts([m.polys[0]]).length >= 2);
});

test('Wake: the flow solver keeps vorticity and streamfunction periodic', () => {
  const m = new Wake({ ...TANK, viscosity: 10 });
  m.tile();
  m.step();
  m._push = [[W / 2 - 2, 0, 500, 0, 10]];
  m._stepFlow(m.dt);
  const g = m._flowGrid;
  const { nx, ny, ux, uy } = g;
  // Speed either side of the seam at the row of the push is close to that between neighbours mid-tile.
  const row = Math.floor(ny / 2);
  const jump = Math.abs(ux[row * nx] - ux[row * nx + nx - 1]) + Math.abs(uy[row * nx] - uy[row * nx + nx - 1]);
  let top = 0;
  for (let i = 0; i < nx * ny; i++) top = Math.max(top, Math.hypot(ux[i], uy[i]));
  assert.ok(top > 0);
  assert.ok(jump < top, `${jump} vs ${top}`);
});
