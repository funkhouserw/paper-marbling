import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marble } from './engine.js';
import { Film } from './film.js';
import { GridInk } from './gridink.js';
import { TOOLS } from './tools.js';
import { scriptApi } from './engine.js';

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
    m.hearts({ style: 'tine' });
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
  m.hearts({ style: 'tine' });
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
    m.hearts({ style: 'tine' });
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

test('hearts can target only loops within a size range', () => {
  const m = dots();
  const [big, small] = m.polys;
  const radius = (p) => Math.sqrt(area(p) / Math.PI);
  const between = (radius(big) + radius(small)) / 2;
  assert.deepEqual(m.heartPaths({ min: between }).map((p) => p.loops[0]), [big]);
  assert.deepEqual(m.heartPaths({ max: between }).map((p) => p.loops[0]), [small]);
  assert.equal(m.heartPaths({ min: between, max: between + 0.01 }).length, 0);
  assert.equal(m.heartPaths().length, 2);
  const wasSmall = box(small);
  m.hearts({ style: 'tine', min: between });
  for (let s = 0; s < 300 && m.busy; s++) m.step();
  assert.ok(Math.abs(box(small).low - wasSmall.low) < 3, 'the small dot only feels the far pull, if anything');
  assert.ok(big.n > 60, 'the big one was raked');
});

// ---- Heart strike's bend, and Heart drop.

const roundness = (p) => {
  let perimeter = 0;
  for (let i = 0, k = p.n - 1; i < p.n; k = i++) perimeter += Math.hypot(p.xy[i * 2] - p.xy[k * 2], p.xy[i * 2 + 1] - p.xy[k * 2 + 1]);
  return (4 * Math.PI * area(p)) / (perimeter * perimeter);
};
// Which way the point faces, in degrees: the vertex farthest from the centre of area, since the
// lobes pull that centre up towards them.
const pointing = ({ xy, n }) => {
  let twice = 0, cx = 0, cy = 0;
  for (let i = 0, k = n - 1; i < n; k = i++) {
    const cross = xy[k * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[k * 2 + 1];
    twice += cross; cx += (xy[k * 2] + xy[i * 2]) * cross; cy += (xy[k * 2 + 1] + xy[i * 2 + 1]) * cross;
  }
  cx /= 3 * twice; cy /= 3 * twice;
  let far = 0, dir = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(xy[i * 2] - cx, xy[i * 2 + 1] - cy);
    if (d > far) { far = d; dir = (Math.atan2(xy[i * 2 + 1] - cy, xy[i * 2] - cx) * 180) / Math.PI; }
  }
  return (dir + 360) % 360;
};
const near = (a, b, tol) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) < tol;
const target = (Engine = Marble) => {
  const m = new Engine({ width: W, height: H, seed: 1, viscosity: 1000 });
  m.drop({ x: -120, y: 0, quantity: 0.4, dispersion: Infinity, color: '#111111' });
  m.settle();
  m.drop({ x: -120, y: 0, quantity: 0.1, dispersion: Infinity, color: '#555555' });
  m.paint({ path: [[120, -60], [180, 0], [120, 60]], width: 20, color: '#999999' });
  m.runUntilIdle();
  return m;
};

for (const [name, Engine] of [['Classic', Marble], ['Film', Film]]) {
  test(`${name}: the bend turns round loops into nested hearts of the same area, and leaves odd shapes alone`, () => {
    const m = target(Engine);
    const byColour = (c) => m.polys.find((p) => p.color === c);
    const [outer, inner, odd] = ['#111111', '#555555', '#999999'].map(byColour);
    const before = [outer, inner, odd].map((p) => ({ box: box(p), area: area(p), xy: Float64Array.from(p.xy.subarray(0, p.n * 2)) }));
    m.hearts({ variation: 0 });
    for (let s = 0; s < 400 && m.busy; s++) m.step();
    assert.equal(m.busy, false);
    [outer, inner].forEach((p, i) => {
      assert.ok(Math.abs(area(p) - before[i].area) < 0.03 * before[i].area, `loop ${i} keeps its area`);
      assert.ok(roundness(p) < 0.85, `loop ${i} is a heart now, roundness ${roundness(p)}`);
      assert.ok(near(pointing(p), 270, 5), `loop ${i} points down: ${pointing(p)}`);
    });
    // Nested: every point of the inner heart lies inside the outer one's box, and the boxes share a middle.
    const o = box(outer), n = box(inner);
    assert.ok(n.left > o.left && n.right < o.right && n.low > o.low && n.high < o.high, 'the inner heart stays inside');
    assert.ok(Math.abs((o.left + o.right) / 2 - (n.left + n.right) / 2) < 1, 'and centred');
    // Its points may be tidied while the bend runs, but it doesn't move or change size.
    for (const k of Object.keys(before[2].box)) assert.ok(Math.abs(box(odd)[k] - before[2].box[k]) < 0.5, `the odd shape stays put: ${k}`);
    assert.ok(Math.abs(area(odd) - before[2].area) < 0.01 * before[2].area, 'and keeps its size');
  });
}

test('the bend leaves frozen loops alone, points where angle says, and replays exactly', () => {
  const m = target();
  const outer = m.polys.find((p) => p.color === '#111111');
  m.freeze({ x: -120 + Math.sqrt(area(outer) / Math.PI) - 2, y: 0 });
  m.step();
  assert.equal(outer.frozen, true);
  const was = box(outer);
  m.hearts();
  m.runUntilIdle();
  assert.deepEqual(box(outer), was);

  const right = target();
  right.hearts({ angle: 0, variation: 0 });
  right.runUntilIdle();
  const rightOuter = right.polys.find((p) => p.color === '#111111');
  assert.ok(near(pointing(rightOuter), 0, 5), `the point faces right: ${pointing(rightOuter)}`);

  const a = target();
  a.hearts();
  a.runUntilIdle();
  const again = new Marble({ width: W, height: H, seed: 1, viscosity: 1000 }).replay(a.log);
  again.runUntilIdle();
  // The same hearts, though the replay may tidy points a tick apart.
  for (const colour of ['#111111', '#555555']) {
    const [x, y] = [a, again].map((m) => m.polys.find((p) => p.color === colour));
    for (const k of Object.keys(box(x))) assert.ok(Math.abs(box(x)[k] - box(y)[k]) < 0.1, `${colour} ${k}`);
    assert.ok(Math.abs(area(x) - area(y)) < 0.005 * area(x));
  }
});

for (const [name, Engine] of [['Classic', Marble], ['Film', Film]]) {
  test(`${name}: a Heart drop lands as a heart the size of a lone drop, pushes ink aside, then holds its shape`, () => {
    const m = new Engine({ width: 1000, height: 700, seed: 1, viscosity: 1000 });
    m.drop({ x: 250, y: 0, quantity: 1, color: '#333333' });
    m.runUntilIdle();
    const [neighbour] = m.polys;
    const left = box(neighbour).left;
    m.heartDrop({ x: 0, y: 0, quantity: 1, variation: 0, color: '#9b2335' });
    m.runUntilIdle();
    const heart = m.polys.find((p) => p.color === '#9b2335');
    const lone = new Engine({ width: 1000, height: 700, seed: 1, viscosity: 1000 });
    lone.drop({ quantity: 1 });
    lone.runUntilIdle();
    assert.ok(Math.abs(area(heart) - area(lone.polys[0])) < 0.03 * area(lone.polys[0]), `${area(heart)} vs ${area(lone.polys[0])}`);
    assert.ok(roundness(heart) < 0.85, 'it is a heart');
    assert.ok(box(neighbour).left > left + 10, 'the drop beside it was pushed aside');
    const held = { box: box(heart), n: heart.n };
    m.wait(3);
    for (let s = 0; s < 120; s++) m.step();
    assert.deepEqual({ box: box(heart), n: heart.n }, held, 'and it stays as it landed');
  });
}

test('Heart drop and Heart strike are tools, and scripts have heartDrop and heartStrike', () => {
  assert.equal(TOOLS.heartDrop.input, 'click');
  assert.equal(TOOLS.hearts.label, 'Heart strike');
  const api = scriptApi(new Marble({ width: W, height: H }));
  assert.equal(typeof api.heartDrop, 'function');
  assert.equal(typeof api.heartStrike, 'function');
});

test('a Heart drop landing while drops still grow leaves them their full size', () => {
  const run = (heart) => {
    const m = new Marble({ width: 1000, height: 700, seed: 1, viscosity: 1000 });
    m.drop({ x: -200, y: 70, quantity: 1.5, dispersion: 0.6 });
    m.drop({ x: 200, y: 70, quantity: 1.5, dispersion: 0.6 });
    for (let s = 0; s < 30; s++) m.step();
    if (heart) m.heartDrop({ x: 0, y: -105, quantity: 1.5, color: '#9b2335' });
    else m.drop({ x: 0, y: -105, quantity: 1.5, color: '#9b2335' });
    m.runUntilIdle();
    return m.polys.filter((p) => p.color !== '#9b2335').map(area);
  };
  const [withHeart, withDrop] = [run(true), run(false)];
  withHeart.forEach((a, i) => assert.ok(Math.abs(a - withDrop[i]) < 0.01 * withDrop[i], `${a} vs ${withDrop[i]}`));
});

test('a bending heart pushes the ink round it aside instead of overlapping it, and that ink keeps its area', () => {
  const m = new Marble({ width: W, height: H, seed: 1, viscosity: 1000 });
  m.drop({ x: 0, y: 40, quantity: 0.2, dispersion: Infinity, color: '#111111' });
  m.drop({ x: 0, y: -15, quantity: 0.15, dispersion: Infinity, spreading: 1, color: '#777777' }); // close enough that the point would land on it
  m.runUntilIdle();
  const heart = m.polys.find((p) => p.color === '#111111');
  const below = m.polys.find((p) => p.color === '#777777');
  const was = area(below);
  m.hearts({ variation: 0 });
  m.runUntilIdle();
  assert.ok(roundness(heart) < 0.85, 'the top drop became a heart');
  assert.ok(Math.abs(area(below) - was) < 0.01 * was, `the drop below keeps its area: ${area(below)} vs ${was}`);
  // The heart's point, its lowest vertex, is not inside the drop below.
  let tip = 0;
  for (let i = 1; i < heart.n; i++) if (heart.xy[i * 2 + 1] < heart.xy[tip * 2 + 1]) tip = i;
  const [x, y] = [heart.xy[tip * 2], heart.xy[tip * 2 + 1]];
  let inside = false;
  for (let i = 0, k = below.n - 1; i < below.n; k = i++) {
    const [xi, yi, xk, yk] = [below.xy[i * 2], below.xy[i * 2 + 1], below.xy[k * 2], below.xy[k * 2 + 1]];
    if ((yi > y) !== (yk > y) && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) inside = !inside;
  }
  assert.equal(inside, false, 'the point pushed into the drop rather than over it');
});
