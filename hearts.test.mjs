import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';
import { GridInk } from './gridink.js';
import { TOOLS } from './tools.js';

const W = 600, H = 420;
const box = ({ xy, n }) => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < n; i++) {
    a = Math.min(a, xy[i * 2]); b = Math.max(b, xy[i * 2]);
    c = Math.min(c, xy[i * 2 + 1]); d = Math.max(d, xy[i * 2 + 1]);
  }
  return { left: a, right: b, low: c, high: d };
};
const area = ({ xy, n }) => {
  let s = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) s += xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
  return Math.abs(s) / 2;
};
const dots = (Engine = Marble) => {
  const m = new Engine({ width: W, height: H, seed: 1, viscosity: 1000 });
  m.drop({ x: -150, y: 0, quantity: 0.5, dispersion: Infinity, color: '#111111' });
  m.drop({ x: 150, y: 0, quantity: 0.02, dispersion: Infinity, color: '#555555' });
  m.runUntilIdle();
  return m;
};

for (const [name, Engine] of [['Classic', Marble], ['Film', Film]]) {
  test(`${name}: every dot gets a cleft on top and a point below, whatever its size, and keeps its area`, () => {
    const m = dots(Engine);
    const [big, small] = m.polys;
    const before = [big, small].map((p) => ({ box: box(p), area: area(p) }));
    const logged = m.log.length;
    m.hearts();
    for (let s = 0; s < 400 && m.busy; s++) m.step();
    assert.equal(m.busy, false);
    assert.equal(m.log.length, logged + 1, 'only the one command is logged');
    [big, small].forEach((p, i) => {
      const r = (before[i].box.high - before[i].box.low) / 2;
      const midX = (before[i].box.left + before[i].box.right) / 2;
      assert.ok(box(p).low < before[i].box.low - 0.08 * r, `dot ${i} gets a point`);
      // At the top, in the middle, the edge is pulled down into a cleft.
      let top = -Infinity;
      for (let k = 0; k < p.n; k++) if (Math.abs(p.xy[k * 2] - midX) < 0.03 * r) top = Math.max(top, p.xy[k * 2 + 1]);
      assert.ok(top < before[i].box.high - 0.15 * r, `dot ${i} gets a cleft: ${before[i].box.high - top} of radius ${r}`);
      assert.ok(Math.abs(area(p) - before[i].area) < 0.03 * before[i].area, `dot ${i} keeps its area`);
    });
  });
}

test('frozen dots are left alone, and the rings of a target get one tine', () => {
  const m = dots();
  const small = m.polys[1];
  m.freeze({ x: small.xy[0] - 1, y: small.xy[1] });
  m.step();
  assert.equal(small.frozen, true);
  assert.equal(m.heartPaths().length, 1);
  const was = box(small);
  m.hearts();
  for (let s = 0; s < 300 && m.busy; s++) m.step();
  assert.deepEqual(box(small), was);

  const t = new Marble({ width: W, height: H, seed: 1 });
  t.drop({ x: 0, y: 0, quantity: 0.2, dispersion: Infinity, color: '#111111' });
  t.settle();
  t.drop({ x: 0, y: 0, quantity: 0.2, dispersion: Infinity, color: '#555555' });
  t.runUntilIdle();
  assert.equal(t.polys.length, 2);
  assert.equal(t.heartPaths().length, 1);
});

test('where tines start and end follows the settings, and the direction', () => {
  const m = dots();
  const one = m.heartPaths({ angle: 270, above: 100, below: 100 }).find((p) => p.loops[0] === m.polys[0]);
  const b = box(m.polys[0]);
  assert.ok(Math.abs(one.from[1] - b.high) < 0.5 && Math.abs(one.to[1] - b.low) < 0.5);
  const half = m.heartPaths({ angle: 270, above: 50, below: 200 }).find((p) => p.loops[0] === m.polys[0]);
  const r = (b.high - b.low) / 2;
  assert.ok(Math.abs(half.from[1] - (b.low + r + r / 2)) < 0.5 && Math.abs(half.to[1] - (b.low + r - 2 * r)) < 0.5);
  const right = m.heartPaths({ angle: 0, above: 100, below: 100 }).find((p) => p.loops[0] === m.polys[0]);
  assert.ok(Math.abs(right.from[0] - b.left) < 0.5 && Math.abs(right.to[0] - b.right) < 0.5);
});

test('hearts replay, wait for ink still to land, and work across a repeating seam', () => {
  const build = () => {
    const m = new Marble({ width: W, height: H, seed: 1 });
    m.tile();
    m.drop({ x: 0, y: H / 2 - 5, quantity: 0.3, dispersion: Infinity, color: '#111111' });
    m.settle();
    m.hearts();
    m.runUntilIdle();
    return m;
  };
  const a = build();
  const b = new Marble({ width: W, height: H, seed: 1 }).replay(a.log);
  b.runUntilIdle();
  assert.equal(a.polys.length, 1);
  assert.ok(a.polys[0].n > 48, 'the tine found the dot, though it was queued before it landed');
  const [x, y] = [box(a.polys[0]), box(b.polys[0])];
  for (const k of Object.keys(x)) assert.ok(Math.abs(x[k] - y[k]) < 0.1);
});

test('Hearts is offered as a tool, and Grid ink says plainly that it has no loops to rake', () => {
  assert.ok(TOOLS.hearts.whole);
  assert.throws(() => new GridInk({ width: W, height: H }).hearts(), /can't find loops/);
});
