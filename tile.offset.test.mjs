// An offset repeat's whole promise: ink and its copy half a tile along stay copies, whatever happens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';
import { Wake } from './wake.js';
import { wrapX, wrapY, tileCell, latticeShifts, makeTileField } from './tile.js';
import { planDots } from './fill.js';

const W = 400, H = 280;
const COPY = { brick: [W / 2, H], halfDrop: [W, H / 2] };
const area = ({ xy, n }) => {
  let a = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) a += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(a) / 2;
};
const centre = ({ xy, n }) => {
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += xy[i * 2]; y += xy[i * 2 + 1]; }
  return [x / n, y / n];
};

test('wrapping and cells agree: a shift by the lattice changes nothing', () => {
  for (const offset of ['brick', 'halfDrop']) {
    const [cx, cy] = COPY[offset];
    for (const [dx, dy] of [[10, 5], [-190, 130], [199, -139], [3, 139.5]]) {
      const x = wrapX(dx + cx, dy + cy, W, H, offset), y = wrapY(dx + cx, dy + cy, W, H, offset);
      assert.ok(Math.abs(x - wrapX(dx, dy, W, H, offset)) < 1e-9 && Math.abs(y - wrapY(dx, dy, W, H, offset)) < 1e-9, `${offset} ${dx},${dy}`);
    }
    const nx = 20, ny = 14;
    const [ci, cj] = offset === 'brick' ? [10, 14] : [20, 7];
    for (const [r, c] of [[3, 4], [13, 19], [0, 0]]) assert.equal(tileCell(r + cj, c + ci, nx, ny, offset), tileCell(r, c, nx, ny, offset));
  }
  const tidy = (list) => list.map(([x, y]) => [x + 0, y + 0]); // -0 is 0 here
  assert.deepEqual(tidy(latticeShifts(-1, 201, -1, 281, W, H, 'brick')), [[0, 0], [200, 280]]);
  assert.deepEqual(tidy(latticeShifts(-1, 401, -1, 141, W, H, 'halfDrop')), [[0, 0], [400, 140]]);
});

test('the push table has the offset symmetry, and is smooth across its seam', () => {
  for (const offset of ['brick', 'halfDrop']) {
    const f = makeTileField(W, H, offset);
    const a = f.correction(10, 20, [0, 0]);
    assert.ok(a.every(Number.isFinite));
    assert.ok(Math.abs(a[0]) < 0.01 && Math.abs(a[1]) < 0.01, `${offset}: ${a}`);
  }
});

const tools = {
  drop: (m) => m.drop({ x: 60, y: -50, quantity: 0.2, dispersion: Infinity, color: '#333333' }),
  rake: (m) => m.rake({ from: [-180, 30], to: [170, -20], teeth: 3, spacing: 40, speed: 300, D: 10 }),
  fullRake: (m) => m.fullRake({ angle: 90, teeth: 5, speed: 300, D: 10 }),
  stir: (m) => m.stir({ x: 20, y: 40, radii: [50], degrees: 120, rate: 200, D: 15 }),
  vortex: (m) => m.vortex({ x: -30, y: 50, circulation: 3000, duration: 0.4 }),
  wriggle: (m) => m.wriggle({ x: 40, y: 40, period: 80, degrees: 25, duration: 0.5 }),
  jiggle: (m) => m.jiggle({ angle: 30, period: 90, amplitude: 8, duration: 0.5 }),
  air: (m) => m.air({ scale: 70, speed: 30, duration: 0.5, seed: 3 }),
  erase: (m) => m.erase({ x: 70, y: 60, radius: 15, duration: 0.4 }),
};

for (const [name, Engine, list, tol] of [
  ['Classic', Marble, Object.keys(tools), 0.35],
  ['Film', Film, ['rake', 'stir', 'jiggle', 'air', 'erase', 'drop'], 1.5],
  ['Wake', Wake, ['rake', 'stir', 'jiggle'], 3],
]) {
  for (const offset of ['brick', 'halfDrop']) {
    for (const tool of list) {
      test(`${name} ${offset}: ${tool} moves ink and its copy alike`, () => {
        const m = new Engine({ width: W, height: H, seed: 1, viscosity: name === 'Wake' ? 50 : 1000 });
        m.tile({ offset });
        m.step();
        const [cx, cy] = COPY[offset];
        const a = { xy: new Float64Array(96 * 2), n: 96, color: '#111111' };
        const b = { xy: new Float64Array(96 * 2), n: 96, color: '#111111' };
        for (let i = 0; i < 96; i++) {
          const t = (i / 96) * 2 * Math.PI;
          a.xy[i * 2] = -20 + 8 * Math.cos(t); a.xy[i * 2 + 1] = 10 + 8 * Math.sin(t);
          b.xy[i * 2] = a.xy[i * 2] + cx; b.xy[i * 2 + 1] = a.xy[i * 2 + 1] + cy;
        }
        m.polys.push(a, b);
        tools[tool](m);
        for (let s = 0; s < 40 && m.busy; s++) m.step();
        const [ax, ay] = centre(a);
        const [bx, by] = centre(b);
        const gapX = wrapX(bx - ax, by - ay, W, H, offset);
        const gapY = wrapY(bx - ax, by - ay, W, H, offset);
        assert.ok(Math.hypot(gapX, gapY) < tol, `the copies drifted ${Math.hypot(gapX, gapY).toFixed(3)} mm apart`);
        assert.ok(Math.abs(area(a) - area(b)) < 0.05 * Math.max(area(a), 1), `areas ${area(a)} and ${area(b)}`);
      });
    }
  }
}

test('an offset tank replays, saves, and draws its copies on the shifted rows', () => {
  const m = new Marble({ width: W, height: H, seed: 1 });
  m.tile({ offset: 'brick' });
  m.drop({ x: 0, y: H / 2, quantity: 0.1, dispersion: Infinity, color: '#222222' });
  m.step(); m.step();
  assert.equal(m.tileOffset, 'brick');
  const n = new Marble({ width: W, height: H, seed: 1 }).loadState(m.saveState());
  assert.equal(n.tileOffset, 'brick');
  const shifts = m.tileShifts([m.polys[0]]);
  assert.ok(shifts.some(([x, y]) => Math.abs(y) === H && Math.abs(x) === W / 2), JSON.stringify(shifts));
  assert.ok(!shifts.some(([x, y]) => Math.abs(y) === H && x === 0));
  assert.equal(m.log[0].args.offset, 'brick');
});

test('a straight repeat logs and behaves as before, and bad offsets are refused', () => {
  const m = new Marble({ width: W, height: H });
  m.tile();
  assert.equal('offset' in m.log[0].args, false);
  assert.throws(() => m.tile({ offset: 'diagonal' }));
});

test('filled dots keep apart across an offset seam', () => {
  for (const offset of ['brick', 'halfDrop']) {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dots = planDots({ width: W, height: H, minR: 4, maxR: 20, gap: 1, margin: 0, count: 60, tightness: 0.6, random, tiled: true, offset });
    assert.ok(dots.length > 20);
    for (let i = 0; i < dots.length; i++) {
      for (let j = 0; j < i; j++) {
        const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y;
        const d = Math.hypot(wrapX(dx, dy, W, H, offset), wrapY(dx, dy, W, H, offset));
        assert.ok(d >= dots[i].r + dots[j].r - 1e-6, `${offset}: ${i} and ${j} overlap across a seam`);
      }
    }
  }
});

test('a repeat can take effect at once, and replays the same', () => {
  const m = new Marble({ width: W, height: H, seed: 1 });
  m.drop({ x: 0, y: H / 2, quantity: 0.1, dispersion: Infinity, color: '#222222' });
  m.runUntilIdle();
  const at = m.time;
  const time = m.time;
  m.live(() => m.tile({ on: true, offset: 'brick', at }));
  m.applyNow();
  assert.equal(m.tileOn, true);
  assert.equal(m.tileOffset, 'brick');
  assert.equal(m.queued.length, 0, 'nothing is left waiting');
  assert.equal(m.time, time, 'and the tank has not moved on');
  const again = new Marble({ width: W, height: H, seed: 1 }).replay(m.log);
  again.runUntilIdle();
  assert.equal(again.tileOffset, 'brick');
  assert.deepEqual([...again.polys[0].xy.subarray(0, again.polys[0].n * 2)], [...m.polys[0].xy.subarray(0, m.polys[0].n * 2)]);
});
